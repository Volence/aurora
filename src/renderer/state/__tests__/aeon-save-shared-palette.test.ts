// THE SAVE REPORT NAMES A WRITE THAT CHANGES EVERY ZONE.
//
// A line 0 edit saves into the shared player palette (owner ruling 2026-09-13,
// `write_shared_file`), a file every zone reads. The plan lists that write in
// `shared` (core/project/aeon/save.ts); these rows pin the GLUE
// (state/aeon-save.ts): the success toast names the shared file when, and only
// when, its bytes actually went to disk, and an edit the plan refused is
// reported on the error channel rather than folded into "Project saved".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { saveAeonProject } from '../aeon-save';
import { useProjectStore } from '../projectStore';
import { useEditorStore } from '../editorStore';
import { useToastStore } from '../toastStore';
import { loadAeonProject } from '../../../core/project/aeon/load';
import { PLAYER_PALETTE_CANDIDATES, sharedPlayerPaletteWhat } from '../../../core/project/aeon/player-palette';
import type { FileAccess } from '../../../core/project/adapter';
import { serializeNametable } from '../../../core/formats/s4-nametable';
import { serializeTiles } from '../../../core/export/tile-dedup';
import {
  decodeGenesisColor, CRAM_LINE_ENTRIES, CRAM_WORD_BYTES, PLAYER_PALETTE_LINE,
} from '../../../core/formats/palette';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../../../core/model/s4-types';
import type { Tile } from '../../../core/model/s4-types';

const PLAYER = PLAYER_PALETTE_CANDIDATES[0];
const tile = (fill: number): Tile => ({ pixels: new Uint8Array(64).fill(fill) });

function fixtureFiles(player: Uint8Array): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  files.set('project.json', new TextEncoder().encode(JSON.stringify({
    name: 'Shared Palette Save', engine: 's4', objectLibrary: 'data/objects.json', chunkLibrary: '',
    zones: [{
      id: 'ojz', name: 'OJ Zone', tileset: 'data/t.bin', palette: 'data/p.bin',
      acts: [{
        id: 'act1', gridWidth: 1, gridHeight: 1, dataPath: 'data/ojz/act1/',
        bgLayout: '', bgTiles: '', sceneRef: null,
        startPosition: { secX: 0, secY: 0, localX: 64, localY: 64 },
      }],
    }],
  })));
  files.set('data/t.bin', serializeTiles([tile(0)]));
  files.set('data/p.bin', new Uint8Array(96));
  files.set(PLAYER, player);
  files.set('data/ojz/act1/section_0.tiles.bin',
    serializeNametable(new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH)));
  files.set('data/objects.json', new TextEncoder().encode('[]'));
  return files;
}

function memFa(files: Map<string, Uint8Array>): FileAccess {
  return {
    exists: async (rel) => files.has(rel),
    read: async (rel) => { const b = files.get(rel); if (!b) throw new Error(`ENOENT: ${rel}`); return b; },
    list: async () => [],
  };
}

/** window.api over the same Map, narrowed to what the save touches (the shape
 *  aeon-save.test.ts uses). Writes land in the Map and are recorded. */
function installWindowApi(files: Map<string, Uint8Array>, written: string[]): void {
  (globalThis as { window?: unknown }).window = {
    api: {
      probePath: async (_d: string, rel: string) => (
        files.has(rel) ? { presence: 'present', reason: null } : { presence: 'absent', reason: null }),
      readBinaryFile: async (_d: string, rel: string) => {
        const b = files.get(rel);
        if (!b) throw new Error(`ENOENT: ${rel}`);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      probeDir: async () => ({ outcome: 'absent', entries: null, reason: null }),
      fileMtime: async () => null,
      readManyFiles: async (_d: string, rels: string[]) => rels.map((rel) => {
        const b = files.get(rel);
        return { relPath: rel, bytes: b ?? null, mtimeMs: b ? 1 : null };
      }),
      writeBinaryFile: async (_d: string, rel: string, data: ArrayBuffer) => {
        files.set(rel, new Uint8Array(data));
        written.push(rel);
      },
    },
  };
}

let files: Map<string, Uint8Array>;
let written: string[];

async function open(player: Uint8Array): Promise<void> {
  files = fixtureFiles(player);
  written = [];
  installWindowApi(files, written);
  const r = await loadAeonProject(memFa(files), '/proj');
  useProjectStore.setState({
    config: r.config, project: r.project,
    currentZoneId: 'ojz', currentActId: 'act1', legacyAtlasMerged: false,
  } as never);
  useEditorStore.getState().markClean();
  useToastStore.setState({ toasts: [] });
}

/** An edit to line 0 entry 3, as the palette editor's command leaves it. */
function editLine0(word: number): void {
  const zone = useProjectStore.getState().project!.zones[0];
  zone.palette.lines[PLAYER_PALETTE_LINE].colors[3] = decodeGenesisColor(word);
  useEditorStore.getState().markDirty();
}

const lastToast = () => useToastStore.getState().toasts.at(-1)!;
const fullLine = () => new Uint8Array(CRAM_LINE_ENTRIES * CRAM_WORD_BYTES).fill(0x02);

beforeEach(async () => { await open(fullLine()); });
afterEach(() => {
  useEditorStore.getState().markClean();
  delete (globalThis as { window?: unknown }).window;
});

describe('the save report names a write to the shared player palette', () => {
  it('a line 0 edit that reaches disk is named in the success line, as a change to every zone', async () => {
    editLine0(0x0e2a);
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written, 'the shared file was not written at all').toContain(PLAYER);
    const toast = useToastStore.getState().toasts.find((t) => t.type === 'success');
    expect(toast?.message, 'the save changed every zone and said nothing').toContain(sharedPlayerPaletteWhat(PLAYER));
    expect(toast?.message).toContain('every zone');
  });

  it('an untouched save names no shared write', async () => {
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).not.toContain(PLAYER);
    expect(lastToast().message).not.toContain(PLAYER);
  });

  /** The plan still lists the write after a save (its baseline is load-time, on
   *  purpose), but the glue finds the bytes already on disk and skips it. A
   *  skipped write changed nothing, so it must not be announced. */
  it('a second save that finds the shared bytes already on disk names nothing', async () => {
    editLine0(0x0e2a);
    await saveAeonProject();
    written.length = 0;
    useToastStore.setState({ toasts: [] });
    useEditorStore.getState().markDirty();
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).not.toContain(PLAYER);
    expect(lastToast().message).not.toContain(PLAYER);
  });

  it('an edit the plan refuses is reported on the error channel, not folded into success', async () => {
    await open(new Uint8Array(10));   // truncated: line 0 cannot be saved
    editLine0(0x0e2a);
    expect((await saveAeonProject()).kind).toBe('saved');
    expect(written).not.toContain(PLAYER);
    const err = useToastStore.getState().toasts.find((t) => t.type === 'error');
    expect(err?.message, 'a refused line 0 edit was not reported').toContain('NOT saved');
    expect(err?.message).toContain(PLAYER);
  });
});
