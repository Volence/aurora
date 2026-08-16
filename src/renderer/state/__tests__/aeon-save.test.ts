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

// --- a two-act project, in memory ------------------------------------------

function tile(fill: number): Tile { return { pixels: new Uint8Array(64).fill(fill) }; }

const PROJECT_JSON = {
  name: 'Two Acts', engine: 's4', objectLibrary: 'data/objects.json', chunkLibrary: '',
  zones: [{
    id: 'ojz', name: 'OJ Zone', tileset: 'data/ojz_tiles.bin', palette: 'data/ojz_pal.bin',
    acts: ['act1', 'act2'].map((id) => ({
      id, gridWidth: 1, gridHeight: 1, dataPath: `data/ojz/${id}/`,
      bgLayout: '', bgTiles: '', parallax: null,
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

/** window.api, narrowed to what the save path touches, over the same Map. */
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
      writeBinaryFile: async (_dir: string, rel: string, data: ArrayBuffer) => {
        files.set(rel, new Uint8Array(data));
        written.push(rel);
        return true;
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

    expect(written).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(written).toContain('data/ojz/act2/section_0.tiles.bin');
    expect(useEditorStore.getState().dirty).toBe(false);
    expect(useEditorStore.getState().dirtyActs).toEqual({});
  });

  it('leaves an act dirty when it is edited DURING the write', async () => {
    dirtyAct('ojz', 'act1');
    // The next write re-dirties act 1, as a stroke landing mid-save would.
    let once = false;
    const api = (globalThis as unknown as { window: { api: Record<string, unknown> } }).window.api;
    const realWrite = api.writeBinaryFile as (d: string, r: string, b: ArrayBuffer) => Promise<boolean>;
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
    expect(written).toContain('data/ojz/act1/section_0.tiles.bin');
    expect(useToastStore.getState().toasts.at(-1)!.message).toMatch(/Project saved/);
  });

  /**
   * R8. `exportError` had exactly one consumer — a console.warn — while the
   * toast said "Project saved" and export/act_descriptor.asm, entity_data.asm,
   * vram_bases.asm and the section binaries stayed at the PREVIOUS save's
   * contents, which the engine build then consumes. Ordinary authoring
   * mistakes trigger it, and the diagnostic lived only in devtools.
   */
  it('says so when the engine export step failed', async () => {
    // Drive the real export into its VRAM-overflow throw: >1024 flip-distinct
    // tiles referenced from one section.
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

    await saveAeonProject();

    const last = useToastStore.getState().toasts.at(-1)!;
    expect(last.type).toBe('error');
    expect(last.message).toMatch(/export/i);
    expect(last.message).toMatch(/STALE/);
  });
});
