import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useClassicLevelStore,
  classicHistory,
  classicSetLayoutCells,
  classicEditChunkCells,
  classicEditBlock,
  classicEditTiles,
  classicSetPalette,
  classicSetColind,
  classicSetObjects,
  classicSetStart,
  classicCanUndo,
  classicCanRedo,
} from '../classicLevelStore';
import { useClassicProjectStore } from '../classicProjectStore';
import { registerRedoClearer } from '../../../core/editing/undo-bus';
import { packChunkCell, unpackChunkCell, type BlockDef, type LevelDoc } from '../../../core/level-classic/model';
import type { ProjectHandle, ZoneActRef, EditableTileRange } from '../../../core/project/adapter';
import type { S1ObjectEntry } from '../../../core/formats/classic/s1-objpos';

// ---------------------------------------------------------------------------
// Fixtures — a minimal but validateLevelDoc-clean LevelDoc.
//   • 5 tiles in the pool; the adapter reports baseTileCount 4 (so tile 4 is a
//     "gap/appended" tile) and an anim overlay at tile 2 → tiles 0,1,3 editable.
// ---------------------------------------------------------------------------

const TILE_COUNT = 5;
const EDITABLE: EditableTileRange = { baseTileCount: 4, animRanges: [{ start: 2, count: 1 }] };

function makeDoc(): LevelDoc {
  const chunkCells = () =>
    Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 }));
  return {
    game: 's1',
    tiles: new Uint8Array(TILE_COUNT * 32),
    blocks: [
      { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) },
      { cells: Array.from({ length: 4 }, () => ({ tile: 1, xf: false, yf: false, pal: 1, pri: false })) },
    ],
    chunks: [{ cells: chunkCells() }, { cells: chunkCells() }],
    fg: { width: 2, height: 2, cells: new Uint8Array([0, 1, 0, 1]) },
    bg: { width: 2, height: 2, cells: new Uint8Array([0, 0, 0, 0]) },
    collision: { colind: new Uint8Array([0, 0]), shapes: { heights: [new Int8Array(16)], angles: new Uint8Array(1) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [],
    objects: [{ x: 100, y: 100, xflip: false, yflip: false, respawn: false, id: 1, subtype: 0 }],
    start: { x: 50, y: 50 },
    sourceRefs: {
      'tiles.0': 'artnem/t.nem',
      blocks: 'map16/b.eni',
      chunks: 'map256/c.kos',
      fg: 'levels/fg.bin',
      bg: 'levels/bg.bin',
      objpos: 'objpos/o.bin',
      start: 'startpos/s.bin',
      colind: 'colind/ci.bin',
      'palette.0': 'palette/p0.bin',
      'palette.1': 'palette/p1.bin',
    },
  };
}

const REF: ZoneActRef = { zone: 'ghz', act: 1, label: 'Green Hill 1', available: true };

function fakeHandle(): ProjectHandle {
  return {
    type: 's1',
    capabilities: { levels: 'chunk-hierarchy', sprites: true, objects: 'objpos', build: false },
    report: { entries: [], resolved: 0, total: 0 },
    levels: {
      list: () => [REF],
      read: async () => makeDoc(),
      write: async () => ({ written: [], skipped: [], errors: [] }),
      editableTileRange: (): EditableTileRange => EDITABLE,
    },
  };
}

/** Put the store in a clean 'ready' editing session over a fresh doc. */
function openReady(doc = makeDoc()): void {
  useClassicProjectStore.setState({ status: 'open', dir: '/p', handle: fakeHandle() } as never);
  classicHistory.clear();
  useClassicLevelStore.setState({
    ref: REF,
    doc,
    status: 'ready',
    error: null,
    dirty: {},
    chunkVersions: new Map(),
    chunkEpoch: 1,
    historyTick: 0,
  });
}

const st = () => useClassicLevelStore.getState();

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  classicHistory.clear();
});

// ---------------------------------------------------------------------------
// Per-command: apply → state + dirty + version; undo → exact prior; redo.
// ---------------------------------------------------------------------------

describe('classic:set-start', () => {
  it('applies, marks start dirty, one undo step; undo/redo restore exactly', () => {
    openReady();
    const before = st().doc!.start;
    const tick0 = st().historyTick;

    expect(classicSetStart(200, 300)).toEqual({ ok: true });
    expect(st().doc!.start).toEqual({ x: 200, y: 300 });
    expect(st().dirty.start).toBe(true);
    expect(st().historyTick).toBe(tick0 + 1);
    expect(classicCanUndo()).toBe(true);

    st().undo();
    expect(st().doc!.start).toEqual(before);
    expect(st().dirty.start).toBeUndefined();
    expect(classicCanRedo()).toBe(true);

    st().redo();
    expect(st().doc!.start).toEqual({ x: 200, y: 300 });
    expect(st().dirty.start).toBe(true);
  });

  it('rejects out-of-range coords atomically (no state change, no undo step)', () => {
    openReady();
    const doc = st().doc;
    const r = classicSetStart(-1, 70000);
    expect(r.ok).toBe(false);
    expect(st().doc).toBe(doc); // untouched identity
    expect(st().dirty.start).toBeUndefined();
    expect(classicCanUndo()).toBe(false);
  });
});

describe('classic:set-layout-cells', () => {
  it('stamps fg cells, marks fg dirty, bumps NO chunk version', () => {
    openReady();
    const epoch0 = st().chunkEpoch;
    const versions0 = st().chunkVersions;
    expect(classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 1 }, { x: 1, y: 1, chunkId: 0 }])).toEqual({ ok: true });
    expect(Array.from(st().doc!.fg.cells)).toEqual([1, 1, 0, 0]);
    expect(st().dirty.fg).toBe(true);
    expect(st().chunkEpoch).toBe(epoch0); // layout is not chunk content
    expect(st().chunkVersions).toBe(versions0);

    st().undo();
    expect(Array.from(st().doc!.fg.cells)).toEqual([0, 1, 0, 1]);
    expect(st().dirty.fg).toBeUndefined();
  });

  it('targets the bg plane independently', () => {
    openReady();
    expect(classicSetLayoutCells('bg', [{ x: 0, y: 0, chunkId: 1 }])).toEqual({ ok: true });
    expect(st().doc!.bg.cells[0]).toBe(1);
    expect(st().dirty.bg).toBe(true);
    expect(st().dirty.fg).toBeUndefined();
  });

  it('rejects out-of-bounds cells and chunkId > 255 (atomic)', () => {
    openReady();
    expect(classicSetLayoutCells('fg', [{ x: 5, y: 0, chunkId: 0 }]).ok).toBe(false);
    expect(classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 256 }]).ok).toBe(false);
    expect(st().dirty.fg).toBeUndefined();
    expect(classicCanUndo()).toBe(false);
  });
});

describe('classic:edit-chunk-cells', () => {
  it('edits cells, marks chunks dirty, bumps ONLY that chunk version', () => {
    openReady();
    const word = packChunkCell({ block: 1, xf: true, yf: false, solidity: 2 });
    expect(classicEditChunkCells(0, [{ index: 5, word }]).ok).toBe(true);
    expect(st().doc!.chunks[0].cells[5]).toEqual(unpackChunkCell(word));
    expect(st().doc!.chunks[1].cells[5]).toEqual({ block: 0, xf: false, yf: false, solidity: 0 });
    expect(st().dirty.chunks).toBe(true);
    expect(st().chunkVersions.get(0)).toBeGreaterThan(0);
    expect(st().chunkVersions.has(1)).toBe(false); // untouched chunk not bumped
  });

  it('undo restores the chunkVersions map exactly; redo re-bumps', () => {
    openReady();
    const word = packChunkCell({ block: 1, xf: false, yf: false, solidity: 0 });
    classicEditChunkCells(0, [{ index: 0, word }]);
    const v = st().chunkVersions.get(0);
    st().undo();
    expect(st().chunkVersions.has(0)).toBe(false);
    st().redo();
    expect(st().chunkVersions.get(0)).toBe(v);
  });

  it('rejects a nonexistent chunk, an out-of-range cell index, and a bad word (atomic)', () => {
    openReady();
    expect(classicEditChunkCells(99, [{ index: 0, word: 0 }]).ok).toBe(false);
    expect(classicEditChunkCells(0, [{ index: 999, word: 0 }]).ok).toBe(false);
    expect(classicEditChunkCells(0, [{ index: 0, word: 0x1ffff }]).ok).toBe(false); // > 0xFFFF
    expect(st().dirty.chunks).toBeUndefined();
  });

  it('accepts the max valid block ref ($3FF)', () => {
    openReady();
    const r = classicEditChunkCells(0, [{ index: 0, word: packChunkCell({ block: 0x3ff, xf: false, yf: false, solidity: 0 }) }]);
    expect(r.ok).toBe(true);
  });
});

describe('classic:edit-block', () => {
  it('replaces a block, marks blocks dirty, bumps the whole epoch', () => {
    openReady();
    const epoch0 = st().chunkEpoch;
    const def: BlockDef = { cells: Array.from({ length: 4 }, () => ({ tile: 3, xf: false, yf: true, pal: 2, pri: false })) };
    expect(classicEditBlock(0, def).ok).toBe(true);
    expect(st().doc!.blocks[0].cells[0]).toEqual({ tile: 3, xf: false, yf: true, pal: 2, pri: false });
    expect(st().dirty.blocks).toBe(true);
    expect(st().chunkEpoch).toBeGreaterThan(epoch0);

    st().undo();
    expect(st().chunkEpoch).toBe(epoch0);
    expect(st().doc!.blocks[0].cells[0].tile).toBe(0);
  });

  it('rejects a nonexistent block and a tile ref past the pool (validate)', () => {
    openReady();
    expect(classicEditBlock(9, { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) }).ok).toBe(false);
    const badTile: BlockDef = { cells: Array.from({ length: 4 }, () => ({ tile: TILE_COUNT + 10, xf: false, yf: false, pal: 0, pri: false })) };
    expect(classicEditBlock(0, badTile).ok).toBe(false);
    expect(st().dirty.blocks).toBeUndefined();
  });
});

describe('classic:edit-tiles', () => {
  it('overwrites tile pixels, marks tiles dirty, bumps the epoch', () => {
    openReady();
    const epoch0 = st().chunkEpoch;
    const data = new Uint8Array(32).fill(0xab);
    expect(classicEditTiles([{ tileIndex: 0, data }]).ok).toBe(true);
    expect(Array.from(st().doc!.tiles.subarray(0, 32))).toEqual(Array.from(data));
    expect(st().dirty.tiles).toBe(true);
    expect(st().chunkEpoch).toBeGreaterThan(epoch0);
    st().undo();
    expect(st().doc!.tiles[0]).toBe(0);
    expect(st().chunkEpoch).toBe(epoch0);
  });

  it('rejects anim-overlaid, gap/appended, and wrong-length edits at edit time', () => {
    openReady();
    expect(classicEditTiles([{ tileIndex: 2, data: new Uint8Array(32) }]).ok).toBe(false); // anim overlay
    expect(classicEditTiles([{ tileIndex: 4, data: new Uint8Array(32) }]).ok).toBe(false); // >= baseTileCount (gap)
    expect(classicEditTiles([{ tileIndex: 0, data: new Uint8Array(16) }]).ok).toBe(false); // not 32 bytes
    expect(classicEditTiles([{ tileIndex: 99, data: new Uint8Array(32) }]).ok).toBe(false); // not in pool
    expect(st().dirty.tiles).toBeUndefined();
    expect(classicCanUndo()).toBe(false);
  });
});

describe('classic:set-palette', () => {
  it('writes a line, marks palette dirty, bumps the epoch', () => {
    openReady();
    const epoch0 = st().chunkEpoch;
    const colors = new Uint16Array(16).fill(0x0e0e);
    expect(classicSetPalette(2, colors).ok).toBe(true);
    expect(Array.from(st().doc!.palettes[2])).toEqual(Array.from(colors));
    expect(st().dirty.palette).toBe(true);
    expect(st().chunkEpoch).toBeGreaterThan(epoch0);
    st().undo();
    expect(st().doc!.palettes[2][0]).toBe(0);
  });

  it('rejects a bad line index and wrong color count (atomic)', () => {
    openReady();
    expect(classicSetPalette(4, new Uint16Array(16)).ok).toBe(false);
    expect(classicSetPalette(0, new Uint16Array(15)).ok).toBe(false);
    expect(st().dirty.palette).toBeUndefined();
  });
});

describe('classic:set-colind', () => {
  it('sets shape indices, marks colind dirty, bumps NO version', () => {
    openReady();
    const epoch0 = st().chunkEpoch;
    expect(classicSetColind([{ blockId: 0, value: 7 }, { blockId: 1, value: 200 }]).ok).toBe(true);
    expect(Array.from(st().doc!.collision.colind)).toEqual([7, 200]);
    expect(st().dirty.colind).toBe(true);
    expect(st().chunkEpoch).toBe(epoch0);
    st().undo();
    expect(Array.from(st().doc!.collision.colind)).toEqual([0, 0]);
  });

  it('rejects value > 255 and out-of-range block (atomic)', () => {
    openReady();
    expect(classicSetColind([{ blockId: 0, value: 256 }]).ok).toBe(false);
    expect(classicSetColind([{ blockId: 9, value: 0 }]).ok).toBe(false);
    expect(st().dirty.colind).toBeUndefined();
  });
});

describe('classic:set-objects', () => {
  it('replaces the whole list, marks objects dirty', () => {
    openReady();
    const objs: S1ObjectEntry[] = [
      { x: 10, y: 20, xflip: false, yflip: false, respawn: true, id: 0x25, subtype: 4 },
    ];
    expect(classicSetObjects(objs).ok).toBe(true);
    expect(st().doc!.objects).toHaveLength(1);
    expect(st().doc!.objects[0].id).toBe(0x25);
    expect(st().dirty.objects).toBe(true);
    st().undo();
    expect(st().doc!.objects[0].id).toBe(1); // original fixture object
  });

  it('rejects an object with an out-of-range id (validate, atomic)', () => {
    openReady();
    const bad: S1ObjectEntry[] = [{ x: 0, y: 0, xflip: false, yflip: false, respawn: false, id: 0xff, subtype: 0 }];
    expect(classicSetObjects(bad).ok).toBe(false);
    expect(st().dirty.objects).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: no-level guard, triple consistency, shared timeline.
// ---------------------------------------------------------------------------

describe('command guards + undo/redo triple consistency', () => {
  it('every command rejects when no level is open', () => {
    // store was reset in beforeEach → status 'idle', doc null
    expect(classicSetStart(0, 0).ok).toBe(false);
    expect(classicSetLayoutCells('fg', []).ok).toBe(false);
    expect(classicEditChunkCells(0, []).ok).toBe(false);
    expect(classicEditBlock(0, { cells: [] }).ok).toBe(false);
    expect(classicEditTiles([]).ok).toBe(false);
    expect(classicSetPalette(0, new Uint16Array(16)).ok).toBe(false);
    expect(classicSetColind([]).ok).toBe(false);
    expect(classicSetObjects([]).ok).toBe(false);
  });

  it('undo/redo restore doc + dirty + versions together across multiple edits', () => {
    openReady();
    classicSetStart(1, 2);            // dirty.start, no version
    classicEditChunkCells(0, [{ index: 0, word: packChunkCell({ block: 1, xf: false, yf: false, solidity: 0 }) }]); // chunk version
    classicEditBlock(1, { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) }); // epoch

    const afterDirty = { ...st().dirty };
    expect(afterDirty).toEqual({ start: true, chunks: true, blocks: true });
    const afterEpoch = st().chunkEpoch;
    const afterChunkV = st().chunkVersions.get(0);

    // Undo the block edit → blocks clean, epoch reverts, chunk version stays.
    st().undo();
    expect(st().dirty.blocks).toBeUndefined();
    expect(st().dirty.chunks).toBe(true);
    expect(st().chunkEpoch).toBeLessThan(afterEpoch);
    expect(st().chunkVersions.get(0)).toBe(afterChunkV);

    // Undo the chunk edit → chunks clean, chunk version gone.
    st().undo();
    expect(st().dirty.chunks).toBeUndefined();
    expect(st().chunkVersions.has(0)).toBe(false);

    // Undo the start edit → fully clean.
    st().undo();
    expect(st().dirty).toEqual({});
    expect(st().doc!.start).toEqual({ x: 50, y: 50 });
    expect(classicCanUndo()).toBe(false);

    // Redo everything back.
    st().redo(); st().redo(); st().redo();
    expect(st().dirty).toEqual(afterDirty);
    expect(st().chunkEpoch).toBe(afterEpoch);
    expect(st().chunkVersions.get(0)).toBe(afterChunkV);
  });

  it('a rejected command records no undo step and leaves historyTick untouched', () => {
    openReady();
    classicSetStart(1, 1);
    const tick = st().historyTick;
    const depth = classicHistory.depth;
    classicSetStart(-5, -5); // rejected
    expect(st().historyTick).toBe(tick);
    expect(classicHistory.depth).toBe(depth);
  });

  it('joins the shared undo timeline: an edit invalidates a sibling history redo', () => {
    openReady();
    const siblingClearRedo = vi.fn();
    const unregister = registerRedoClearer(siblingClearRedo);
    try {
      classicSetStart(9, 9);
      expect(siblingClearRedo).toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  it('loading a new act clears the classic history', () => {
    openReady();
    classicSetStart(1, 1);
    expect(classicCanUndo()).toBe(true);
    // A fresh openAct resets the session.
    void useClassicLevelStore.getState().openAct(REF);
    expect(classicCanUndo()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layout-editing UI state (Task 13): tool + selected chunk id.
// ---------------------------------------------------------------------------
describe('tool + selectedChunkId UI state', () => {
  it('defaults to pan tool + chunk 0', () => {
    expect(st().tool).toBe('pan');
    expect(st().selectedChunkId).toBe(0);
  });

  it('setTool / setSelectedChunkId update state', () => {
    openReady();
    st().setTool('stamp');
    expect(st().tool).toBe('stamp');
    st().setSelectedChunkId(0x2a);
    expect(st().selectedChunkId).toBe(0x2a);
  });

  it('setSelectedChunkId rejects out-of-byte-range ids (no change)', () => {
    openReady();
    st().setSelectedChunkId(0x10);
    st().setSelectedChunkId(-1);
    expect(st().selectedChunkId).toBe(0x10);
    st().setSelectedChunkId(256);
    expect(st().selectedChunkId).toBe(0x10);
  });

  it('is NOT part of an undo snapshot — undo/redo leave the selection alone', () => {
    openReady();
    st().setSelectedChunkId(7);
    classicSetStart(11, 12); // records a snapshot with selection == 7
    st().setSelectedChunkId(9); // change AFTER the edit
    st().undo();
    expect(st().selectedChunkId).toBe(9); // undo restored the doc, not the selection
  });

  it('opening a new act resets the selection but keeps the tool', () => {
    openReady();
    st().setTool('stamp');
    st().setSelectedChunkId(5);
    void useClassicLevelStore.getState().openAct(REF);
    expect(st().selectedChunkId).toBe(0); // per-act chunk set → reset
    expect(st().tool).toBe('stamp'); // workflow preference persists
  });
});
