// THE SAVE GLUE'S REMOVAL STEP — ordering, reporting, and the ledger.
//
// The plan's side of this lives in core/project/aeon/__tests__/save-removals.ts;
// this file is about what the GLUE does with a plan that carries removals:
//
//   • it unlinks them, over the one delete channel;
//   • it does so AFTER every write, which is the whole of the crash argument —
//     a crash between the two leaves the deletion undone (recoverable) rather
//     than a file destroyed and the state that stopped referencing it unwritten;
//   • it SAYS what it removed, on the same toast that says the save happened;
//   • it adopts the plan's ledger, so a document written this session becomes
//     removable by the next delete;
//   • and a removal that FAILS stays in the ledger and gets its own error
//     channel, so one EPERM is not permanent and is not painted green.
//
// ⚠ NO FILE SYSTEM IS INVOLVED HERE EITHER. `window.api.deleteFile` is a mock
// over the same Map the writes land in. "The byte on disk went away" is the CDP
// harness's claim (`npm run harness:deleted-scene-returns`, rows [1e]/[2d]).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveAeonProject } from '../aeon-save';
import { useProjectStore } from '../projectStore';
import { useEditorStore } from '../editorStore';
import { useToastStore } from '../toastStore';
import { loadAeonProject } from '../../../core/project/aeon/load';
import type { FileAccess } from '../../../core/project/adapter';
import { serializeNametable } from '../../../core/formats/s4-nametable';
import { serializeTiles } from '../../../core/export/tile-dedup';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../core/model/s4-types';
import type { Tile } from '../../../core/model/s4-types';

function tile(fill: number): Tile { return { pixels: new Uint8Array(64).fill(fill) }; }

const SCENE_DIR = 'data/editor/effects/';

const PROJECT_JSON = {
  name: 'Removals', engine: 's4', objectLibrary: 'data/objects.json', chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone', tileset: 'data/ojz_tiles.bin', palette: 'data/ojz_pal.bin',
    acts: [{
      id: 'act1', gridWidth: 1, gridHeight: 1, dataPath: 'data/ojz/act1/',
      bgLayout: '', bgTiles: '', sceneRef: null,
      startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
    }],
  }],
};

const sceneDoc = (id: string) =>
  `{\n  "schema": 1,\n  "id": ${JSON.stringify(id)},\n`
  + '  "layers": [{ "world_y": 0, "fa": "FACTOR_1", "fb": "FACTOR_1_2" }],\n  "v_factor": 2\n}';

function fixtureFiles(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const enc = (s: string) => new TextEncoder().encode(s);
  files.set('project.json', enc(JSON.stringify(PROJECT_JSON)));
  files.set('data/ojz_tiles.bin', serializeTiles([tile(0), tile(1)]));
  const pal = new Uint8Array(96);
  for (let i = 0; i < 48; i++) { pal[i * 2] = 0x0e; pal[i * 2 + 1] = 0xee; }
  files.set('data/ojz_pal.bin', pal);
  const nt = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  nt[0] = (2 << 13) | 1;
  files.set('data/ojz/act1/section_0.tiles.bin', serializeNametable(nt));
  files.set('data/objects.json', enc('[]'));
  files.set(`${SCENE_DIR}keeper.json`, enc(sceneDoc('keeper')));
  files.set(`${SCENE_DIR}victim.json`, enc(sceneDoc('victim')));
  return files;
}

/** Lists for real — a scene library is loaded BY listing a directory. */
function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel)
      || (rel.endsWith('/') && [...files.keys()].some((k) => k.startsWith(rel))),
    read: async (rel) => {
      const b = files.get(rel);
      if (!b) throw new Error(`ENOENT: ${rel}`);
      return b;
    },
    list: async (relDir) => {
      const dir = relDir.endsWith('/') ? relDir : `${relDir}/`;
      const out = new Set<string>();
      for (const k of files.keys()) {
        if (!k.startsWith(dir)) continue;
        out.add(k.slice(dir.length).split('/')[0]);
      }
      return [...out];
    },
  };
}

/** ONE ordered log for writes and deletes, which is what the ordering row reads. */
type Op = { kind: 'write' | 'delete'; path: string };

function installWindowApi(
  files: Map<string, Uint8Array>, ops: Op[], deleteFails: Set<string>,
) {
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
      readManyFiles: async (_dir: string, rels: string[]) =>
        rels.map((rel) => {
          const b = files.get(rel);
          return { relPath: rel, bytes: b ?? null, mtimeMs: b ? 1 : null };
        }),
      writeBinaryFile: async (_dir: string, rel: string, data: ArrayBuffer) => {
        files.set(rel, new Uint8Array(data));
        ops.push({ kind: 'write', path: rel });
        return true;
      },
      deleteFile: async (_dir: string, rel: string) => {
        ops.push({ kind: 'delete', path: rel });
        if (deleteFails.has(rel)) return { ok: false as const, reason: 'EPERM: not permitted' };
        const had = files.delete(rel);
        return { ok: true as const, deleted: had };
      },
    },
  };
}

describe('saveAeonProject — the removal step', () => {
  let files: Map<string, Uint8Array>;
  let ops: Op[];
  let deleteFails: Set<string>;

  async function open() {
    const r = await loadAeonProject(memFa(files), '/proj');
    useProjectStore.setState({
      config: r.config, project: r.project,
      currentZoneId: 'ojz', currentActId: 'act1', legacyAtlasMerged: false,
    } as never);
    useEditorStore.getState().markClean();
    useToastStore.setState({ toasts: [] });
    return r;
  }

  beforeEach(async () => {
    files = fixtureFiles();
    ops = [];
    deleteFails = new Set();
    installWindowApi(files, ops, deleteFails);
    await open();
  });

  afterEach(() => {
    useEditorStore.getState().markClean();
    delete (globalThis as { window?: unknown }).window;
  });

  const dropScene = (id: string) => {
    const lib = useProjectStore.getState().project!.effectsScenes;
    lib.scenes = lib.scenes.filter((s) => s.id !== id);
    useEditorStore.getState().markDirty();
  };

  it('deletes NOTHING when a project is opened and saved unchanged', async () => {
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(ops.filter((o) => o.kind === 'delete')).toEqual([]);
    // Not vacuous: the file that could have been lost is still there.
    expect(files.has(`${SCENE_DIR}victim.json`)).toBe(true);
  });

  it('unlinks the dropped scene, and only it', async () => {
    dropScene('victim');
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(ops.filter((o) => o.kind === 'delete').map((o) => o.path))
      .toEqual([`${SCENE_DIR}victim.json`]);
    expect(files.has(`${SCENE_DIR}victim.json`)).toBe(false);
    expect(files.has(`${SCENE_DIR}keeper.json`)).toBe(true);
  });

  /**
   * ⚠ THE CRASH ARGUMENT, AS A ROW. Writes first, removals last: a crash between
   * them leaves the deletion undone, which is recoverable by deleting again. The
   * other order can take a file away while the state that stopped referencing it
   * never lands. The expectation is derived from the log rather than pinned to a
   * count, so it holds however many files the plan happens to write.
   */
  it('performs every WRITE before any DELETE', async () => {
    dropScene('victim');
    await saveAeonProject();
    const lastWrite = ops.map((o) => o.kind).lastIndexOf('write');
    const firstDelete = ops.map((o) => o.kind).indexOf('delete');
    expect(firstDelete, 'no delete happened — the ordering row has nothing to judge')
      .toBeGreaterThan(-1);
    expect(lastWrite, 'no write happened — the ordering row has nothing to judge')
      .toBeGreaterThan(-1);
    expect(lastWrite).toBeLessThan(firstDelete);
  });

  it('SAYS what it removed, on the line that says the save happened', async () => {
    dropScene('victim');
    await saveAeonProject();
    const message = useToastStore.getState().toasts.at(-1)!.message;
    expect(message).toMatch(/Project saved/);
    expect(message).toContain('scene "victim"');
  });

  it('adopts the plan ledger, so a scene written THIS session becomes removable', async () => {
    const lib = useProjectStore.getState().project!.effectsScenes;
    lib.scenes = [...lib.scenes, {
      schema: 1, id: 'born', v_factor: 2,
      layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1_2' }],
    } as never];
    useEditorStore.getState().markDirty();

    await saveAeonProject();
    expect(files.has(`${SCENE_DIR}born.json`)).toBe(true);
    expect(lib.loadedPaths).toContain(`${SCENE_DIR}born.json`);

    ops.length = 0;
    dropScene('born');
    await saveAeonProject();
    expect(ops.filter((o) => o.kind === 'delete').map((o) => o.path))
      .toEqual([`${SCENE_DIR}born.json`]);
  });

  it('keeps a removal that FAILED in the ledger, reports it on the error channel, and '
    + 'retries it on the next save', async () => {
    deleteFails.add(`${SCENE_DIR}victim.json`);
    dropScene('victim');
    await saveAeonProject();

    const toasts = useToastStore.getState().toasts;
    const failure = toasts.find((t) => t.type === 'error');
    expect(failure, 'a removal that could not happen was not reported on its own channel')
      .toBeTruthy();
    expect(failure!.message).toContain('victim.json');
    // FOLDED INTO THE GREEN LINE WOULD BE THE SAME DEFECT WEARING THE OTHER
    // COLOUR — the save DID happen, so the success toast stands beside it.
    expect(toasts.some((t) => t.type === 'success' || t.type === 'info')).toBe(true);

    const lib = useProjectStore.getState().project!.effectsScenes;
    expect(lib.loadedPaths).toContain(`${SCENE_DIR}victim.json`);

    // …and the next save tries again rather than orphaning the file for ever.
    ops.length = 0;
    deleteFails.clear();
    useEditorStore.getState().markDirty();
    await saveAeonProject();
    expect(ops.filter((o) => o.kind === 'delete').map((o) => o.path))
      .toEqual([`${SCENE_DIR}victim.json`]);
    expect(files.has(`${SCENE_DIR}victim.json`)).toBe(false);
  });

  it('treats an ALREADY-ABSENT file as a success — somebody else reached the same end state',
    async () => {
      dropScene('victim');
      files.delete(`${SCENE_DIR}victim.json`);
      expect((await saveAeonProject()).kind).toBe('saved');
      expect(useToastStore.getState().toasts.some((t) => t.type === 'error')).toBe(false);
      expect(useProjectStore.getState().project!.effectsScenes.loadedPaths)
        .not.toContain(`${SCENE_DIR}victim.json`);
    });
});
