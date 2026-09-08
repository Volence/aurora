import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { saveAeonProject } from '../aeon-save';
import { writeProjectFile } from '../../../main/file-io';
import { unwrapWriteOutcome } from '../../../shared/ipc-types';
import { useProjectStore } from '../projectStore';
import { useEditorStore } from '../editorStore';
import { useToastStore } from '../toastStore';
import { loadAeonProject } from '../../../core/project/aeon/load';
import type { FileAccess } from '../../../core/project/adapter';
import { serializeNametable } from '../../../core/formats/s4-nametable';
import { serializeTiles } from '../../../core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../core/model/s4-types';
import type { Tile } from '../../../core/model/s4-types';

// --- a two-act project, in memory ------------------------------------------

function tile(fill: number): Tile { return { pixels: new Uint8Array(64).fill(fill) }; }

const PROJECT_JSON = {
  name: 'Two Acts', engine: 's4', objectLibrary: 'data/objects.json', chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone', tileset: 'data/ojz_tiles.bin', palette: 'data/ojz_pal.bin',
    acts: ['act1', 'act2'].map((id) => ({
      id, gridWidth: 1, gridHeight: 1, dataPath: `data/ojz/${id}/`,
      bgLayout: '', bgTiles: '', sceneRef: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    })),
  }],
};

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0e; pal[i * 2 + 1] = 0xee; }
  files.set('data/ojz_pal.bin', pal);
  for (const act of ['act1', 'act2']) {
    const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    nt[0] = (2 << 13) | 1;
    files.set(`data/ojz/${act}/section_0.tiles.bin`, serializeNametable(nt));
  }
  files.set('data/objects.json', new TextEncoder().encode('[]'));
  return files;
}

function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async () => [],
  };
}

/**
 * window.api, narrowed to what the save path touches, over the same Map.
 *
 * ITS WRITE USED TO `return true`, HARDCODED, and that is why nothing in this
 * file could fail when the save reported a refused write as a successful one: a
 * mock that cannot express refusal makes the refusal path unreachable. It now
 * mirrors the real preload surface, which resolves for a write that landed and
 * THROWS otherwise (unwrapWriteOutcome in shared/ipc-types.ts). The refusal rows
 * below substitute a write that throws, and they build the thrown value out of
 * the REAL main-side guard rather than typing a shape in.
 */
function installWindowApi(files: Map<string, Uint8Array>, written: string[]) {
  (globalThis as { window?: unknown }).window = {
    api: {
      pathExists: async (_dir: string, rel: string) => files.has(rel),
      readBinaryFile: async (_dir: string, rel: string) => {
        const b = files.get(rel);
        if (!b) throw new Error(`ENOENT: ${rel}`);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      listDir: async () => [],
      fileMtime: async () => null,
      // The save skips writes whose bytes already match on disk (so an
      // untouched file's mtime does not mark aeon's level tree stale and force
      // a 7s re-bake on every build). The mock therefore has to answer reads
      // from the same map the writes land in.
      readManyFiles: async (_dir: string, rels: string[]) =>
        rels.map((rel) => {
          const b = files.get(rel);
          return { relPath: rel, bytes: b ?? null, mtimeMs: b ? 1 : null };
        }),
      writeBinaryFile: async (_dir: string, rel: string, data: ArrayBuffer) => {
        files.set(rel, new Uint8Array(data));
        written.push(rel);
      },
    },
  };
}

describe('saveAeonProject', () => {
  let files: Map<string, Uint8Array>;
  let written: string[];

  beforeEach(async () => {
    files = fixtureFiles();
    written = [];
    installWindowApi(files, written);
    const r = await loadAeonProject(memFa(files), '/proj');
    useProjectStore.setState({
      config: r.config, project: r.project,
      currentZoneId: 'ojz', currentActId: 'act1', legacyAtlasMerged: false,
    } as never);
    useEditorStore.getState().markClean();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    useEditorStore.getState().markClean();
    delete (globalThis as { window?: unknown }).window;
  });

  const dirtyAct = (zone: string, act: string) => {
    useProjectStore.setState({ currentZoneId: zone, currentActId: act } as never);
    useEditorStore.getState().markDirty();
  };

  /**
   * R6. One project-wide dirty flag, one act written, everything cleared: edit
   * act 1, switch to act 2, Ctrl+S → act 2's files written, dirty false, no dot
   * on any tab, and the next project switch proceeds without a confirm. Act 1's
   * edits are gone. It is latent only because there is one act today.
   */
  it('writes EVERY dirty act, not just the one on screen', async () => {
    dirtyAct('ojz', 'act1');
    dirtyAct('ojz', 'act2');   // and act 2 is the one now current

    expect((await saveAeonProject()).kind).toBe('saved');

    // BOTH acts are cleared, which is what "written" means here. The file list
    // is no longer the proxy for it: the save skips files whose bytes already
    // match on disk, and this fixture's do. See the skip tests below.
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().dirtyActs).toEqual({});
  });

  it('leaves an act dirty when it is edited DURING the write', async () => {
    dirtyAct('ojz', 'act1');
    // The next write re-dirties act 1, as a stroke landing mid-save would.
    let once = false;
    const api = (globalThis as unknown as { window: { api: Record<string, unknown> } }).window.api;
    const realWrite = api.writeBinaryFile as (d: string, r: string, b: ArrayBuffer) => Promise<void>;
    api.writeBinaryFile = async (d: string, r: string, b: ArrayBuffer) => {
      if (!once) { once = true; dirtyAct('ojz', 'act1'); }
      return realWrite(d, r, b);
    };

    expect((await saveAeonProject()).kind).toBe('saved');
    expect(useEditorStore.getState().dirty).toBe(true);
    expect(Object.keys(useEditorStore.getState().dirtyActs)).toEqual(['ojz/act1']);
    expect(useToastStore.getState().toasts.at(-1)!.message).toMatch(/during the save/i);
  });

  it('saves the current act even when nothing was recorded as dirty', async () => {
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(useToastStore.getState().toasts.at(-1)!.message).toMatch(/Project saved/);
  });

  /**
   * The plan regenerates EVERY file for an act whether or not it was touched,
   * so a blind write bumps ~40 mtimes to change one chunk. The cost is not the
   * IO: aeon's build decides whether to re-bake the level tree by comparing
   * editor-source mtimes against generated ones, so rewriting an untouched file
   * marks the tree stale forever and every build pays a 7s re-bake it does not
   * need. Caught in aeon's own build banner, naming a BG tiles file nobody had
   * edited.
   */
  it('does not rewrite a file whose bytes already match on disk', async () => {
    await saveAeonProject();          // first save populates the fixture
    written.length = 0;
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).toEqual([]);      // nothing changed, so nothing is touched
  });

  it('DOES write a file whose bytes changed', async () => {
    await saveAeonProject();
    written.length = 0;
    // Move one tile in section 0 — the smallest edit that must still reach disk.
    const project = useProjectStore.getState().project!;
    project.zones[0].acts[0].sections[0]!.tileGrid.nametable[0] ^= 0x1;
    dirtyAct('ojz', 'act1');
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).toContain('data/ojz/act1/section_0.tiles.bin');
  });

  // ═════════════════════════════════════════════════════════════════════════
  // EW-SAVE-NOISE — the skip compares MEANING, not bytes, END TO END.
  //
  // The unit rows live in core/project/aeon/__tests__/save-skip.test.ts. These
  // drive the real `saveAeonProject` so the plan's `compare` tags are exercised
  // too: a tag on the wrong push site is invisible to a unit test of the
  // predicate, and it is exactly the mistake that would silently stop writing a
  // file. Each pair is a SKIP row and the WRITE row that would catch it if the
  // skip went too far.
  // ═════════════════════════════════════════════════════════════════════════

  const diskText = (rel: string) => new TextDecoder().decode(files.get(rel)!);
  const putText = (rel: string, text: string) => files.set(rel, new TextEncoder().encode(text));
  const OBJECTS = 'data/ojz/act1/section_0.objects.json';
  const META = 'data/ojz/act1/section_0.meta.json';

  it('does not rewrite a JSON file whose disk bytes differ only by the trailing newline', async () => {
    // aeon's committed documents are `json.dumps` output and carry no trailing
    // newline; Aurora's §8 canonical form adds one. Before this, EVERY save
    // rewrote all 22 of them, and rewrote them again after every revert.
    await saveAeonProject();
    const withNewline = diskText(OBJECTS);
    expect(withNewline.endsWith('\n')).toBe(true);
    putText(OBJECTS, withNewline.replace(/\n+$/, ''));   // aeon's spelling
    written.length = 0;

    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).not.toContain(OBJECTS);
    // ...and the author's bytes are still theirs: the skip did not write.
    expect(diskText(OBJECTS).endsWith('\n')).toBe(false);
  });

  it('DOES write objects.json when an object was actually added', async () => {
    await saveAeonProject();
    written.length = 0;
    const section = useProjectStore.getState().project!.zones[0].acts[0].sections[0]!;
    section.objects.push({ id: 1, x: 32, y: 48, subtype: 0 } as never);
    dirtyAct('ojz', 'act1');

    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).toContain(OBJECTS);
    expect(JSON.parse(diskText(OBJECTS))).toHaveLength(1);
  });

  /**
   * The sidecar half. `"rasterRef": null` is the key the cold reader never
   * authored; absent and explicit-null are the same state (empyrean §3.1,
   * aeon's `meta.get` in tools/effects_gen.py, Aurora's parseSectionMeta), so
   * the file must not be touched to add it.
   */
  it('does not rewrite a sidecar to add an absent rasterRef', async () => {
    const section = useProjectStore.getState().project!.zones[0].acts[0].sections[0]!;
    section.sceneRef = 'ojz_act1_depth';
    dirtyAct('ojz', 'act1');
    await saveAeonProject();
    expect(JSON.parse(diskText(META)).rasterRef).toBeNull();

    // Rewind the file to aeon's older spelling: the key simply absent.
    const older = JSON.parse(diskText(META)) as Record<string, unknown>;
    delete older.rasterRef;
    putText(META, JSON.stringify(older, null, 2));       // no trailing newline either
    written.length = 0;

    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).not.toContain(META);
    expect(Object.keys(JSON.parse(diskText(META)))).not.toContain('rasterRef');
  });

  it('DOES write a sidecar when a ref is bound, and again when it is CLEARED', async () => {
    const section = useProjectStore.getState().project!.zones[0].acts[0].sections[0]!;
    section.sceneRef = 'ojz_act1_depth';
    dirtyAct('ojz', 'act1');
    await saveAeonProject();
    expect(written).toContain(META);
    expect(JSON.parse(diskText(META)).sceneRef).toBe('ojz_act1_depth');

    // The clear. It goes down the OTHER branch in the plan (the all-null
    // cleared-overwrite), and a skip that ate it would resurrect the binding on
    // the next load — the exact failure the branch exists to prevent.
    section.sceneRef = null;
    dirtyAct('ojz', 'act1');
    written.length = 0;
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).toContain(META);
    expect(JSON.parse(diskText(META)).sceneRef).toBeNull();
  });

  /**
   * R8's toast is GONE, with the step it reported on: the export half of the
   * save was retired 2026-08-19 (ROADMAP §4.2), so "Project saved" can no
   * longer be hiding a silent second failure. What R8 actually protected — that
   * the toast never claims more than the save did — is now structural, and this
   * asserts the structure: the data that used to blow the export step up
   * (>1024 flip-distinct tiles in one section) is now just data, and the save
   * succeeds and says so.
   */
  it('saves a tileset that used to overflow the retired export step', async () => {
    const project = useProjectStore.getState().project!;
    const tiles: Tile[] = [{ pixels: new Uint8Array(64) }];
    for (let n = 1; n <= 1100; n++) {
      const px = new Uint8Array(64);
      px[0] = 1; px[1] = (n >> 8) & 0xf; px[2] = (n >> 4) & 0xf; px[3] = n & 0xf;
      tiles.push({ pixels: px });
    }
    project.zones[0].tileset.tiles = tiles;
    const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    for (let n = 1; n <= 1100; n++) nt[n - 1] = n;
    project.zones[0].acts[0].sections[0]!.tileGrid.nametable = nt;

    expect((await saveAeonProject()).kind).toBe('saved');
    const last = useToastStore.getState().toasts.at(-1)!;
    expect(last.type).toBe('success');
    expect(last.message).toMatch(/Project saved/);
    // Nothing under export/ was written — the guard in the direction that regresses.
    expect(written.filter((p) => p.includes('export/'))).toEqual([]);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // REFUSED-WRITE-REPORTED-SAVED — the save's verdict when main refuses.
  //
  // MEASURED ON 4cf66084, before the fix: with every write refused, this save
  // returned { kind: 'saved' }, toasted "Project saved" in green, and cleared
  // the dirty flag, so the next project switch would proceed without a confirm
  // and the edits were gone. The refusal was the ONLY silent failure on this
  // path: real fs errors already threw and were already handled.
  //
  // WHY THESE ROWS CROSS THE SEAM INSTEAD OF MOCKING IT. Every previous test
  // here installed a `writeBinaryFile` that hardcoded success, so the seam
  // between main's answer and the renderer's verdict had a test on each side
  // and none across it. These rows compose the two REAL halves: main's own
  // `writeProjectFile` produces the refusal, the preload's own
  // `unwrapWriteOutcome` converts it, and the real saveAeonProject decides.
  // Nothing about the refusal's shape is typed in here, so a change to either
  // half that broke the pairing would show up as a red row rather than as a
  // green mock agreeing with itself.
  // ═════════════════════════════════════════════════════════════════════════
  describe('a write the main process refuses', () => {
    let tmp: string;
    let outside: string;

    beforeEach(() => {
      // basePath is tmp/project; the escape target is a REAL file one level up.
      tmp = mkdtempSync(join(tmpdir(), 'aurora-refuse-'));
      mkdirSync(join(tmp, 'project'), { recursive: true });
      outside = join(tmp, 'outside.bin');
      writeFileSync(outside, Buffer.from([9, 9, 9]));
    });
    afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

    /** The write the real preload performs, over the real main-side primitive. */
    const bridgeWrite = async (dir: string, rel: string, data: ArrayBuffer): Promise<void> => {
      unwrapWriteOutcome(await writeProjectFile(dir, rel, data));
    };

    it('does not report saved, keeps the act dirty, and reports the failure', async () => {
      const base = join(tmp, 'project');
      // The refusal is not a hand-written literal: this is what the guard in
      // main/file-io.ts answers for a `..` path whose target really exists.
      const refused = await writeProjectFile(base, '../outside.bin', new Uint8Array([1, 2, 3]));
      expect(refused.ok).toBe(false);
      // ...and it refused rather than failing: the file outside the project is
      // untouched, which is the only assertion that separates a working guard
      // from a write that happened to error.
      expect([...readFileSync(outside)]).toEqual([9, 9, 9]);

      const api = (globalThis as unknown as { window: { api: Record<string, unknown> } }).window.api;
      api.writeBinaryFile = async (_d: string, rel: string, data: ArrayBuffer) =>
        bridgeWrite(base, `../${rel}`, data);   // every path escapes, as the exploit did

      dirtyAct('ojz', 'act1');
      const result = await saveAeonProject();

      expect(result.kind).toBe('error');
      expect(result.kind === 'error' && result.message)
        .toMatch(/write refused by the main process/);
      // The edits are still the author's to save. Before the fix this was false.
      expect(useEditorStore.getState().dirty).toBe(true);
      const last = useToastStore.getState().toasts.at(-1)!;
      expect(last.type).toBe('error');
      expect(last.message).not.toMatch(/Project saved/);
    });

    // THE CONTROL. Same composition, a path that does not escape: the save is
    // reported saved and the bytes are on disk. Without this row, a bridgeWrite
    // that refused everything (or a saveAeonProject that never reported saved)
    // would satisfy the row above for the wrong reason.
    it('CONTROL: the same real write on a safe path is reported saved', async () => {
      const base = join(tmp, 'project');
      const api = (globalThis as unknown as { window: { api: Record<string, unknown> } }).window.api;
      const landed: string[] = [];
      api.writeBinaryFile = async (_d: string, rel: string, data: ArrayBuffer) => {
        await bridgeWrite(base, rel, data);
        landed.push(rel);
      };

      dirtyAct('ojz', 'act1');
      expect((await saveAeonProject()).kind).toBe('saved');
      expect(landed.length).toBeGreaterThan(0);
      expect(existsSync(join(base, landed[0]))).toBe(true);
      expect(useEditorStore.getState().dirty).toBe(false);
      expect(useToastStore.getState().toasts.at(-1)!.message).toMatch(/Project saved/);
    });
  });
});
