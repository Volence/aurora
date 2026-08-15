import { describe, it, expect, beforeEach } from 'vitest';
import {
  useClassicLevelStore,
  layoutDocIdForCurrentAct,
  zoneArtDocIdForCurrentZone,
  classicSetLayoutCells,
  classicEditChunkCells,
  classicEditBlock,
  classicEditTiles,
  classicSetPalette,
  classicSetColind,
  classicSetObjects,
  classicSetStart,
  classicAddChunk,
  classicAddBlock,
  classicPaintSurface,
} from '../classicLevelStore';
import { useClassicProjectStore } from '../classicProjectStore';
import { useEditorStore } from '../editorStore';
import { armedPlacementId } from '../classic-placement';
import { documentHistoryHub } from '../history-hub';
import { packChunkCell, unpackChunkCell, type BlockDef } from '../../../core/level-classic/model';
import type { S1ObjectEntry } from '../../../core/formats/classic/s1-objpos';
import type { SurfaceEditPlan } from '../../../core/art/classic-surface-plan';
// Shared with history-routing.test.ts — one fixture, so both suites drive the
// store through the same doc/handle shape.
import { TILE_COUNT, REF, makeDoc, openReady, fakeHandle } from './helpers/classic-fixture';

const st = () => useClassicLevelStore.getState();
// The tool moved to editorStore (one vocabulary, spec §3.6), so the classic
// store's tool-adjacent behaviour is asserted against BOTH stores.
const tool = () => useEditorStore.getState();

// The open act's two undo documents (spec §4.3): layout is act-scoped, art is
// zone-scoped. `historyFor` get-or-creates, so reading one never records a step.
const layoutStack = () => documentHistoryHub.historyFor(layoutDocIdForCurrentAct()!);
const artStack = () => documentHistoryHub.historyFor(zoneArtDocIdForCurrentZone()!);

beforeEach(() => {
  useClassicProjectStore.getState().reset();
  useClassicLevelStore.getState().reset();
  documentHistoryHub.clearAll();
  // editorStore has no reset(); the tool is a cross-engine singleton, so put it
  // back to its initial value rather than letting one case leak into the next.
  useEditorStore.setState({ tool: 'view', selection: null, pasting: false });
});

// ---------------------------------------------------------------------------
// Per-command: apply → state + dirty + version; undo → exact prior; redo.
// ---------------------------------------------------------------------------

describe('classic:set-start', () => {
  it('applies, marks start dirty, one undo step; undo/redo restore exactly', () => {
    openReady();
    const before = st().doc!.start;

    expect(classicSetStart(200, 300)).toEqual({ ok: true });
    expect(st().doc!.start).toEqual({ x: 200, y: 300 });
    expect(st().dirty.start).toBe(true);
    expect(layoutStack().canUndo).toBe(true);

    layoutStack().undo();
    expect(st().doc!.start).toEqual(before);
    expect(st().dirty.start).toBeUndefined();
    expect(layoutStack().canRedo).toBe(true);

    layoutStack().redo();
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
    expect(layoutStack().canUndo).toBe(false);
  });

  it('an identical write is a no-op: ok:true but no undo step recorded', () => {
    openReady();
    const doc = st().doc; // start is (50, 50) in the fixture
    expect(classicSetStart(50, 50)).toEqual({ ok: true });
    expect(st().doc).toBe(doc); // no new doc built
    expect(layoutStack().canUndo).toBe(false); // no history entry
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

    layoutStack().undo();
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

  it('rejects out-of-bounds cells and a chunkId past the chunk pool (atomic)', () => {
    openReady(); // fixture has 2 chunks → engine ids 0(air)..2 valid
    expect(classicSetLayoutCells('fg', [{ x: 5, y: 0, chunkId: 0 }]).ok).toBe(false);
    expect(classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 3 }]).ok).toBe(false); // > chunks.length
    expect(classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 256 }]).ok).toBe(false);
    expect(st().dirty.fg).toBeUndefined();
    expect(layoutStack().canUndo).toBe(false);
  });

  it('accepts air ($00) and the last engine id (chunks.length)', () => {
    openReady(); // 2 chunks → engine ids 1,2 real; 0 = air
    expect(classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 0 }, { x: 1, y: 0, chunkId: 2 }]).ok).toBe(true);
    expect(Array.from(st().doc!.fg.cells)).toEqual([0, 2, 0, 1]);
  });

  it('accepts a loop-flagged byte (bit 7) and stores it raw — engine id validated masked (Task B4)', () => {
    openReady(); // 2 chunks → engine ids 1,2 real
    // 0x81 = engine id 1 | loop flag: masked id 1 is in the pool, so it is accepted
    // and the RAW byte (loop flag intact) is written — survives to save byte-for-byte.
    expect(classicSetLayoutCells('fg', [{ x: 0, y: 0, chunkId: 0x81 }]).ok).toBe(true);
    expect(st().doc!.fg.cells[0]).toBe(0x81);
    // A loop-flagged byte whose MASKED id is past the pool is still rejected.
    expect(classicSetLayoutCells('fg', [{ x: 1, y: 0, chunkId: 0x83 }]).ok).toBe(false); // (0x83 & 0x7f)=3 > 2
  });
});

describe('classic:edit-chunk-cells', () => {
  // chunkId is an ENGINE id: id 1 → chunks[0], id 2 → chunks[1] (S1 1-based),
  // and id 0 (air/blank) is not editable. chunkVersions are keyed by engine id
  // so the viewport/picker caches (also engine-id-keyed) line up.
  it('edits cells (engine id 1 → chunks[0]), marks chunks dirty, bumps ONLY that engine-id version', () => {
    openReady();
    const word = packChunkCell({ block: 1, xf: true, yf: false, solidity: 2 });
    expect(classicEditChunkCells(1, [{ index: 5, word }]).ok).toBe(true);
    expect(st().doc!.chunks[0].cells[5]).toEqual(unpackChunkCell(word));
    expect(st().doc!.chunks[1].cells[5]).toEqual({ block: 0, xf: false, yf: false, solidity: 0 });
    expect(st().dirty.chunks).toBe(true);
    expect(st().chunkVersions.get(1)).toBeGreaterThan(0); // engine id 1
    expect(st().chunkVersions.has(2)).toBe(false); // engine id 2 (chunks[1]) not bumped
  });

  it('undo restores the chunkVersions map exactly; redo re-bumps', () => {
    openReady();
    const word = packChunkCell({ block: 1, xf: false, yf: false, solidity: 0 });
    classicEditChunkCells(1, [{ index: 0, word }]);
    const v = st().chunkVersions.get(1);
    artStack().undo();
    expect(st().chunkVersions.has(1)).toBe(false);
    artStack().redo();
    expect(st().chunkVersions.get(1)).toBe(v);
  });

  it('rejects a nonexistent chunk, an out-of-range cell index, and a bad word (atomic)', () => {
    openReady();
    expect(classicEditChunkCells(99, [{ index: 0, word: 0 }]).ok).toBe(false);
    expect(classicEditChunkCells(1, [{ index: 999, word: 0 }]).ok).toBe(false);
    expect(classicEditChunkCells(1, [{ index: 0, word: 0x1ffff }]).ok).toBe(false); // > 0xFFFF
    expect(st().dirty.chunks).toBeUndefined();
  });

  it('rejects editing the blank chunk (engine id 0 = air) with a clear message', () => {
    openReady();
    const r = classicEditChunkCells(0, [{ index: 0, word: 0 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/blank chunk|not editable/i);
    expect(st().dirty.chunks).toBeUndefined();
  });

  it('rejects engine id past the last chunk (chunks.length + 1)', () => {
    openReady(); // fixture has 2 chunks → engine ids 1..2 valid, 3 is past the end
    expect(classicEditChunkCells(3, [{ index: 0, word: 0 }]).ok).toBe(false);
    expect(st().dirty.chunks).toBeUndefined();
  });

  it('accepts the last engine id (chunks.length → chunks[length-1])', () => {
    openReady();
    const word = packChunkCell({ block: 1, xf: false, yf: false, solidity: 0 });
    expect(classicEditChunkCells(2, [{ index: 0, word }]).ok).toBe(true); // engine id 2 → chunks[1]
    expect(st().doc!.chunks[1].cells[0]).toEqual(unpackChunkCell(word));
    expect(st().chunkVersions.get(2)).toBeGreaterThan(0);
  });

  it('accepts the max valid block ref ($3FF)', () => {
    openReady();
    const r = classicEditChunkCells(1, [{ index: 0, word: packChunkCell({ block: 0x3ff, xf: false, yf: false, solidity: 0 }) }]);
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

    artStack().undo();
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
    artStack().undo();
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
    expect(artStack().canUndo).toBe(false);
  });

  // The composer's pencil path, at the seam. Both invariant guards added with
  // the two-document split THROW when they trip (assertSingleDomain on a patch
  // that names a foreign domain, requireClassicHistory on a stack built for the
  // other engine), and the Tile tab calls this from a mouse handler — a throw
  // there escapes React's event dispatch, not just the edit. Pin that an
  // ordinary editable-tile stroke trips neither: it returns a plain result and
  // records on the ZONE-ART stack.
  it('commits an editable tile through both invariant guards without throwing', () => {
    openReady();
    const data = new Uint8Array(32).fill(0x5a);
    let res!: ReturnType<typeof classicEditTiles>;
    expect(() => { res = classicEditTiles([{ tileIndex: 1, data }]); }).not.toThrow();
    expect(res).toEqual({ ok: true });
    // ...on the ART document, not the layout one (the two timelines stay split).
    expect(artStack().canUndo).toBe(true);
    expect(layoutStack().canUndo).toBe(false);
    expect(st().dirty.tiles).toBe(true);
    expect(st().dirty.fg).toBeUndefined();
  });

  // A refusal is a RESULT, never an exception: the Tile tab renders it as a
  // toast and stays live. A throw here would be indistinguishable from the
  // guards above and would take the window with it.
  it('refuses a locked tile by returning, not by throwing', () => {
    openReady();
    let res!: ReturnType<typeof classicEditTiles>;
    expect(() => { res = classicEditTiles([{ tileIndex: 2, data: new Uint8Array(32) }]); }).not.toThrow();
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/animated-art/);
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
    artStack().undo();
    expect(st().doc!.palettes[2][0]).toBe(0);
  });

  it('rejects a bad line index and wrong color count (atomic)', () => {
    openReady();
    expect(classicSetPalette(4, new Uint16Array(16)).ok).toBe(false);
    expect(classicSetPalette(0, new Uint16Array(15)).ok).toBe(false);
    expect(st().dirty.palette).toBeUndefined();
  });

  it('no-op guard: an identical line records NO undo step', () => {
    openReady();
    const colors = new Uint16Array(16).fill(0x0e0e);
    expect(classicSetPalette(1, colors).ok).toBe(true);
    const epoch1 = st().chunkEpoch;
    expect(artStack().canUndo).toBe(true);
    // Re-writing the SAME colors succeeds but records no history entry / no epoch
    // bump — this also elides the double commit a slider release could produce.
    expect(classicSetPalette(1, new Uint16Array(colors)).ok).toBe(true);
    expect(st().chunkEpoch).toBe(epoch1);
    // Exactly one undoable step exists: undo restores the pre-edit line, and there
    // is nothing left to undo (a second identical write did not stack a step).
    artStack().undo();
    expect(st().doc!.palettes[1][0]).toBe(0);
    expect(artStack().canUndo).toBe(false);
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
    artStack().undo();
    expect(Array.from(st().doc!.collision.colind)).toEqual([0, 0]);
  });

  it('rejects value > 255 and out-of-range block (atomic)', () => {
    openReady();
    expect(classicSetColind([{ blockId: 0, value: 256 }]).ok).toBe(false);
    expect(classicSetColind([{ blockId: 9, value: 0 }]).ok).toBe(false);
    expect(st().dirty.colind).toBeUndefined();
  });

  it('an all-unchanged entry set is a no-op: ok:true but no undo step', () => {
    openReady(); // colind is [0, 0] in the fixture
    const doc = st().doc;
    expect(classicSetColind([{ blockId: 0, value: 0 }, { blockId: 1, value: 0 }])).toEqual({ ok: true });
    expect(st().doc).toBe(doc);
    expect(artStack().canUndo).toBe(false);
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
    layoutStack().undo();
    expect(st().doc!.objects[0].id).toBe(1); // original fixture object
  });

  it('rejects an object with an out-of-range id (validate, atomic)', () => {
    openReady();
    const bad: S1ObjectEntry[] = [{ x: 0, y: 0, xflip: false, yflip: false, respawn: false, id: 0xff, subtype: 0 }];
    expect(classicSetObjects(bad).ok).toBe(false);
    expect(st().dirty.objects).toBeUndefined();
  });

  it('a field-identical list (e.g. a zero-displacement move) is a no-op: no undo step', () => {
    openReady();
    const doc = st().doc;
    // A fresh array of fresh entries equal field-for-field to the fixture list.
    const same = doc!.objects.map((o) => ({ ...o }));
    expect(classicSetObjects(same)).toEqual({ ok: true });
    expect(st().doc).toBe(doc); // no new doc built
    expect(layoutStack().canUndo).toBe(false);
    expect(st().dirty.objects).toBeUndefined();
  });
});

describe('classic:paint-surface', () => {
  // Fixture (makeDoc): 5 tiles (0,1,3 editable; 2 locked/anim, 4 gap/appended),
  // 2 blocks (block 0 all tile 0, block 1 all tile 1), 2 chunks (all cells
  // block 0). A plan touching all three tiers: a tile write, a new block
  // (id 2 = doc.blocks.length), a block-cell repoint targeting that new block,
  // and a chunk-cell repoint onto it.
  const blankBlockCell = (tile: number) => ({ tile, xf: false, yf: false, pal: 0, pri: false });
  const blankChunkCell = (block: number) => ({ block, xf: false, yf: false, solidity: 0 });

  function fullPlan(): SurfaceEditPlan {
    return {
      tileWrites: [{ tileIndex: 1, data: new Uint8Array(32).fill(0x7) }],
      newBlocks: [{ cells: Array.from({ length: 4 }, () => blankBlockCell(1)) }],
      blockCellEdits: [{ blockId: 2, cellIndex: 0, cell: blankBlockCell(3) }],
      chunkCellEdits: [{ chunkIndex: 0, cellIndex: 5, cell: blankChunkCell(2) }],
      stats: { tilesClaimed: 0, blocksCloned: 1, placesAffected: 1 },
    };
  }

  const emptyPlan = (): SurfaceEditPlan => ({
    tileWrites: [], newBlocks: [], blockCellEdits: [], chunkCellEdits: [],
    stats: { tilesClaimed: 0, blocksCloned: 0, placesAffected: 0 },
  });

  it('applies a plan touching all three tiers as ONE undo entry, not four', () => {
    openReady();
    expect(artStack().canUndo).toBe(false);
    expect(classicPaintSurface(fullPlan())).toEqual({ ok: true });
    expect(artStack().canUndo).toBe(true);
    // One undo entry: a single undo() must exhaust the stack. If the commit had
    // been split into multiple commitArt calls, 2nd/3rd/4th steps would remain.
    artStack().undo();
    expect(artStack().canUndo).toBe(false);
  });

  it('undo restores all three tiers together (tile bytes, block count, chunk cell)', () => {
    openReady();
    const beforeTileByte = st().doc!.tiles[1 * 32];
    expect(classicPaintSurface(fullPlan())).toEqual({ ok: true });

    // Applied: tile written, new block appended, block cell repointed, chunk
    // cell repointed onto the new block.
    expect(st().doc!.tiles[1 * 32]).toBe(0x7);
    expect(st().doc!.blocks.length).toBe(3);
    expect(st().doc!.blocks[2].cells[0].tile).toBe(3);
    expect(st().doc!.chunks[0].cells[5]).toEqual(blankChunkCell(2));

    artStack().undo();

    // A composite that half-undoes is the specific failure this guards.
    expect(st().doc!.tiles[1 * 32]).toBe(beforeTileByte);
    expect(st().doc!.blocks.length).toBe(2);
    expect(st().doc!.chunks[0].cells[5]).toEqual(blankChunkCell(0));
  });

  it('refuses a plan targeting a locked tile — nothing committed', () => {
    openReady();
    const doc = st().doc;
    const plan: SurfaceEditPlan = {
      ...emptyPlan(),
      tileWrites: [{ tileIndex: 2, data: new Uint8Array(32) }], // tile 2: anim overlay, locked
    };
    const r = classicPaintSurface(plan);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/animated-art|not editable/i);
    expect(st().doc).toBe(doc); // untouched identity
    expect(artStack().canUndo).toBe(false);
  });

  it('an empty plan is a no-op: ok:true, no history entry, no dirty flag', () => {
    openReady();
    const doc = st().doc;
    expect(classicPaintSurface(emptyPlan())).toEqual({ ok: true });
    expect(st().doc).toBe(doc);
    expect(st().dirty).toEqual({});
    expect(artStack().canUndo).toBe(false);
  });

  it('rejects an out-of-range block id — commits nothing', () => {
    openReady();
    const doc = st().doc;
    const plan: SurfaceEditPlan = {
      ...emptyPlan(),
      blockCellEdits: [{ blockId: 99, cellIndex: 0, cell: blankBlockCell(0) }],
    };
    expect(classicPaintSurface(plan).ok).toBe(false);
    expect(st().doc).toBe(doc);
    expect(artStack().canUndo).toBe(false);
  });

  it('rejects an out-of-range block cell index (0..3) — commits nothing', () => {
    openReady();
    const doc = st().doc;
    const plan: SurfaceEditPlan = {
      ...emptyPlan(),
      blockCellEdits: [{ blockId: 0, cellIndex: 4, cell: blankBlockCell(0) }],
    };
    expect(classicPaintSurface(plan).ok).toBe(false);
    expect(st().doc).toBe(doc);
    expect(artStack().canUndo).toBe(false);
  });

  it('rejects an out-of-range chunk index — commits nothing', () => {
    openReady();
    const doc = st().doc;
    const plan: SurfaceEditPlan = {
      ...emptyPlan(),
      chunkCellEdits: [{ chunkIndex: 99, cellIndex: 0, cell: blankChunkCell(0) }],
    };
    expect(classicPaintSurface(plan).ok).toBe(false);
    expect(st().doc).toBe(doc);
    expect(artStack().canUndo).toBe(false);
  });

  it('rejects an out-of-range chunk cell index (0..255) — commits nothing', () => {
    openReady();
    const doc = st().doc;
    const plan: SurfaceEditPlan = {
      ...emptyPlan(),
      chunkCellEdits: [{ chunkIndex: 0, cellIndex: 256, cell: blankChunkCell(0) }],
    };
    expect(classicPaintSurface(plan).ok).toBe(false);
    expect(st().doc).toBe(doc);
    expect(artStack().canUndo).toBe(false);
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
    classicSetStart(1, 2);            // LAYOUT: dirty.start, no version
    classicEditChunkCells(1, [{ index: 0, word: packChunkCell({ block: 1, xf: false, yf: false, solidity: 0 }) }]); // ART: chunk version (engine id 1)
    classicEditBlock(1, { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) }); // ART: epoch

    const afterDirty = { ...st().dirty };
    expect(afterDirty).toEqual({ start: true, chunks: true, blocks: true });
    const afterEpoch = st().chunkEpoch;
    const afterChunkV = st().chunkVersions.get(1);

    // Undo the block edit → blocks clean, epoch reverts, chunk version stays.
    artStack().undo();
    expect(st().dirty.blocks).toBeUndefined();
    expect(st().dirty.chunks).toBe(true);
    expect(st().chunkEpoch).toBeLessThan(afterEpoch);
    expect(st().chunkVersions.get(1)).toBe(afterChunkV);

    // Undo the chunk edit → chunks clean, chunk version gone.
    artStack().undo();
    expect(st().dirty.chunks).toBeUndefined();
    expect(st().chunkVersions.has(1)).toBe(false);
    expect(artStack().canUndo).toBe(false); // art timeline exhausted...
    expect(layoutStack().canUndo).toBe(true); // ...the layout one is untouched

    // Undo the start edit on the OTHER document → fully clean.
    layoutStack().undo();
    expect(st().dirty).toEqual({});
    expect(st().doc!.start).toEqual({ x: 50, y: 50 });

    // Redo everything back. Order across documents does NOT matter: each snapshot
    // carries only its own document's dirty flags and restores only those, so a
    // redo on one stack can't stomp the other's. (Within a stack, order is the
    // stack's own — these go oldest-first.)
    artStack().redo(); artStack().redo();
    layoutStack().redo();
    expect(st().dirty).toEqual(afterDirty);
    expect(st().chunkEpoch).toBe(afterEpoch);
    expect(st().chunkVersions.get(1)).toBe(afterChunkV);
  });

  it('a rejected command records no undo step', () => {
    openReady();
    classicSetStart(1, 1);
    classicSetStart(-5, -5); // rejected
    // Exactly one step on the layout stack: one undo lands back on the fixture.
    layoutStack().undo();
    expect(st().doc!.start).toEqual({ x: 50, y: 50 });
    expect(layoutStack().canUndo).toBe(false);
  });

  it('loading a new act clears both of the act\'s undo documents', () => {
    openReady();
    classicSetStart(1, 1);
    classicSetPalette(1, new Uint16Array(16).fill(0x0e0e));
    expect(layoutStack().canUndo).toBe(true);
    expect(artStack().canUndo).toBe(true);
    // A fresh openAct resets the session: the snapshots reference the doc that is
    // about to be replaced, so neither may survive the load.
    void useClassicLevelStore.getState().openAct(REF);
    expect(layoutStack().canUndo).toBe(false);
    expect(artStack().canUndo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Layout-editing UI state (Task 13): tool + selected chunk id.
// ---------------------------------------------------------------------------
describe('tool + selectedChunkId UI state', () => {
  it('defaults to chunk 0, with the tool living in editorStore', () => {
    expect(st().selectedChunkId).toBe(0);
    // The tool is no longer classic's own — one vocabulary, spec §3.6.
    expect('tool' in st()).toBe(false);
    expect('setTool' in st()).toBe(false);
  });

  it('setSelectedChunkId updates state', () => {
    openReady();
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
    layoutStack().undo();
    expect(st().selectedChunkId).toBe(9); // undo restored the doc, not the selection
  });

  it('opening a new act resets the selection but keeps the tool', () => {
    openReady();
    tool().setTool('stamp-chunk');
    st().setSelectedChunkId(5);
    void useClassicLevelStore.getState().openAct(REF);
    // Synchronous phase, before the read resolves: there is no pool to pick
    // from yet, so the reset value is air.
    expect(st().selectedChunkId).toBe(0); // per-act chunk set → reset
    expect(tool().tool).toBe('stamp-chunk'); // workflow preference persists
  });

  it('a loaded act lands the selection on a real chunk, never on air', () => {
    // The Art facet's Chunk tab cannot edit $00 (air has no data behind it), so
    // landing there made the facet's resting state a "not editable" message.
    // Same rule as composerBlockId/composerTileIndex — see tile-pick.ts.
    openReady();
    st().setSelectedChunkId(0);
    return useClassicLevelStore.getState().openAct(REF).then(() => {
      expect(st().status).toBe('ready');
      expect(st().selectedChunkId).toBe(1);
    });
  });

  it('a loaded act seeds the composer palette line from the block it lands on', async () => {
    // THE BUG: the Art facet draws the same ~965-tile strip on two tiers under
    // two different fields — the Block tier under the selected cell's `pal`
    // (data), the Tile tier under `composerPalLine` (the `Line:` chips). Only a
    // click inside the Block tier ever wrote the second one, so a cold open left
    // it at its IDLE 0 while the Block tier showed line 2: Green Hill's tileset
    // green on one tab and unrecognisable red on the next, one click apart.
    //
    // Seeded, not merged (the call round 3 made for aeon's pair): a view line
    // and a paint line are supposed to diverge once touched. Agreeing at rest is
    // what was missing.
    const doc = makeDoc();
    doc.tiles[1 * 32] = 0xa5;               // tile 1 draws → block 1 is the landing block
    for (const c of doc.blocks[1].cells) c.pal = 2;
    const handle = fakeHandle();
    useClassicProjectStore.setState({
      status: 'open', dir: '/p',
      handle: { ...handle, levels: { ...handle.levels!, read: async () => doc } },
    } as never);

    await useClassicLevelStore.getState().openAct(REF);

    expect(st().composerBlockId).toBe(1);
    expect(st().composerPalLine).toBe(2); // the line the Block tier is showing
  });

  it('selectChunkForStamp sets the chunk AND arms the stamp tool from view', () => {
    openReady();
    tool().setTool('view');
    st().selectChunkForStamp(0x2a);
    expect(st().selectedChunkId).toBe(0x2a);
    expect(tool().tool).toBe('stamp-chunk');
  });

  it('selectChunkForStamp switches to stamp from any other tool (e.g. place-object)', () => {
    openReady();
    tool().setTool('place-object');
    st().selectChunkForStamp(3);
    expect(st().selectedChunkId).toBe(3);
    expect(tool().tool).toBe('stamp-chunk'); // a chunk pick arms stamp over placing too
  });

  it('re-selecting the SAME chunk while already stamping leaves the tool alone', () => {
    // Not just an optimisation: editorStore.setTool clears the aeon selection
    // and cancels an in-progress paste, so an unconditional call would make a
    // no-op re-select destroy unrelated state.
    openReady();
    tool().setTool('stamp-chunk');
    useEditorStore.setState({ selection: { type: 'object', sectionIndex: 0, index: 2 } });
    st().selectChunkForStamp(4);
    expect(tool().tool).toBe('stamp-chunk');
    expect(useEditorStore.getState().selection).not.toBeNull();
  });

  it('selectChunkForStamp rejects out-of-byte-range ids (no change to chunk or tool)', () => {
    openReady();
    tool().setTool('view');
    st().selectChunkForStamp(-1);
    expect(st().selectedChunkId).toBe(0);
    expect(tool().tool).toBe('view');
    st().selectChunkForStamp(256);
    expect(st().selectedChunkId).toBe(0);
    expect(tool().tool).toBe('view');
  });
});

// ---------------------------------------------------------------------------
// Object-tool UI state (Task 14): selection index + armed place-mode id.
// ---------------------------------------------------------------------------
describe('object-tool UI state', () => {
  it('defaults to no selection and no armed object', () => {
    expect(st().selectedObjectIndex).toBeNull();
    expect(st().armedObjectId).toBeNull();
  });

  it('setSelectedObjectIndex sets/clears the selection', () => {
    openReady();
    st().setSelectedObjectIndex(0);
    expect(st().selectedObjectIndex).toBe(0);
    st().setSelectedObjectIndex(null);
    expect(st().selectedObjectIndex).toBeNull();
  });

  it('arming an object clears any live selection (mutually exclusive)', () => {
    openReady();
    st().setSelectedObjectIndex(0);
    st().setArmedObjectId(0x25);
    expect(st().armedObjectId).toBe(0x25);
    expect(st().selectedObjectIndex).toBeNull();
  });

  it('disarming (null) leaves the selection untouched', () => {
    openReady();
    st().setArmedObjectId(0x26);
    st().setSelectedObjectIndex(3);
    // setArmedObjectId(null) must NOT wipe the selection.
    st().setArmedObjectId(null);
    expect(st().armedObjectId).toBeNull();
    expect(st().selectedObjectIndex).toBe(3);
  });

  it('is NOT part of an undo snapshot — undo/redo leave selection/arm alone', () => {
    openReady();
    st().setSelectedObjectIndex(0);
    classicSetStart(11, 12); // records a snapshot
    st().setSelectedObjectIndex(null);
    layoutStack().undo();
    expect(st().selectedObjectIndex).toBeNull(); // undo restored the doc, not UI state
  });

  it('opening a new act resets selection + arm but keeps the tool', () => {
    openReady();
    tool().setTool('place-object');
    st().setSelectedObjectIndex(0);
    st().setArmedObjectId(0x25);
    void useClassicLevelStore.getState().openAct(REF);
    expect(st().selectedObjectIndex).toBeNull();
    expect(st().armedObjectId).toBeNull();
    expect(tool().tool).toBe('place-object');
  });

  it('an armed id only counts as a placement while place-object is the tool', () => {
    // The arm survives a tool switch in the store; armedPlacementId is what
    // stops that stale id from arming a click under a different tool.
    openReady();
    tool().setTool('place-object');
    st().setArmedObjectId(0x25);
    expect(armedPlacementId(tool().tool, st().armedObjectId)).toBe(0x25);
    tool().setTool('select');
    expect(armedPlacementId(tool().tool, st().armedObjectId)).toBeNull();
    tool().setTool('stamp-chunk');
    expect(armedPlacementId(tool().tool, st().armedObjectId)).toBeNull();
    // …and no arm at all is never a placement, whatever the tool.
    st().setArmedObjectId(null);
    tool().setTool('place-object');
    expect(armedPlacementId(tool().tool, st().armedObjectId)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GROW commands: classicAddChunk / classicAddBlock (Task B3).
// ---------------------------------------------------------------------------

describe('classic:add-chunk', () => {
  it('appends a blank chunk, marks chunks dirty, one undo step; returns the new engine id', () => {
    openReady(); // fixture has 2 chunks → engine ids 1,2 → new id 3
    const res = classicAddChunk();
    expect(res).toEqual({ ok: true, id: 3 });
    expect(st().doc!.chunks.length).toBe(3);
    // Blank: every cell is block 0 / no flips / solidity 0.
    expect(st().doc!.chunks[2].cells.every((c) => c.block === 0 && !c.xf && !c.yf && c.solidity === 0)).toBe(true);
    expect(st().dirty.chunks).toBe(true);
    // New engine id gets a content version (keyed by engine id).
    expect(st().chunkVersions.get(3)).toBeGreaterThan(0);
    expect(artStack().canUndo).toBe(true);
  });

  it('seeds cells from a sparse word list (Duplicate path)', () => {
    openReady();
    // block 1, xflip, solidity 2 → pack via the model helper the store uses.
    const word = packChunkCell({ block: 1, xf: true, yf: false, solidity: 2 });
    const res = classicAddChunk([{ index: 0, word }, { index: 255, word }]);
    expect(res.ok).toBe(true);
    const nc = st().doc!.chunks[2].cells;
    expect(unpackChunkCell(packChunkCell(nc[0]))).toEqual({ block: 1, xf: true, yf: false, solidity: 2 });
    expect(nc[1]).toEqual({ block: 0, xf: false, yf: false, solidity: 0 }); // untouched
    expect(nc[255].block).toBe(1);
  });

  it('undo removes the appended chunk exactly; redo re-adds it', () => {
    openReady();
    classicAddChunk();
    expect(st().doc!.chunks.length).toBe(3);
    artStack().undo();
    expect(st().doc!.chunks.length).toBe(2);
    expect(st().dirty.chunks).toBeUndefined();
    artStack().redo();
    expect(st().doc!.chunks.length).toBe(3);
    expect(st().dirty.chunks).toBe(true);
  });

  it('refuses at the 127-chunk cap ($80+ unaddressable) with no state change', () => {
    // Build a doc already at the cap.
    const doc = makeDoc();
    doc.chunks = Array.from({ length: 127 }, () => ({
      cells: Array.from({ length: 256 }, () => ({ block: 0, xf: false, yf: false, solidity: 0 })),
    }));
    openReady(doc);
    const before = st().doc;
    const res = classicAddChunk();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/capacity/i);
    expect(st().doc).toBe(before); // untouched identity
    expect(artStack().canUndo).toBe(false);
  });

  it('rejects with no open level', () => {
    useClassicLevelStore.getState().reset();
    expect(classicAddChunk().ok).toBe(false);
  });
});

describe('classic:add-block', () => {
  it('appends a blank block, marks blocks dirty, one undo step; returns the new id', () => {
    openReady(); // fixture has 2 blocks → new id 2
    const res = classicAddBlock();
    expect(res).toEqual({ ok: true, id: 2 });
    expect(st().doc!.blocks.length).toBe(3);
    expect(st().doc!.blocks[2].cells).toHaveLength(4);
    expect(st().doc!.blocks[2].cells.every((c) => c.tile === 0)).toBe(true);
    expect(st().dirty.blocks).toBe(true);
    expect(artStack().canUndo).toBe(true);
  });

  it('seeds cells from a def (Duplicate path)', () => {
    openReady();
    const def: BlockDef = {
      cells: [
        { tile: 1, xf: true, yf: false, pal: 2, pri: true },
        { tile: 0, xf: false, yf: false, pal: 0, pri: false },
        { tile: 1, xf: false, yf: true, pal: 1, pri: false },
        { tile: 0, xf: false, yf: false, pal: 0, pri: false },
      ],
    };
    const res = classicAddBlock(def);
    expect(res).toEqual({ ok: true, id: 2 });
    expect(st().doc!.blocks[2].cells[0]).toEqual({ tile: 1, xf: true, yf: false, pal: 2, pri: true });
  });

  it('undo removes the appended block; redo re-adds it', () => {
    openReady();
    classicAddBlock();
    expect(st().doc!.blocks.length).toBe(3);
    artStack().undo();
    expect(st().doc!.blocks.length).toBe(2);
    artStack().redo();
    expect(st().doc!.blocks.length).toBe(3);
  });

  it('rejects a bad def (wrong cell count) atomically', () => {
    openReady();
    const before = st().doc;
    const res = classicAddBlock({ cells: [{ tile: 0, xf: false, yf: false, pal: 0, pri: false }] } as BlockDef);
    expect(res.ok).toBe(false);
    expect(st().doc).toBe(before);
  });

  it('refuses at the 1024-block cap with no state change', () => {
    const doc = makeDoc();
    doc.blocks = Array.from({ length: 0x400 }, () => ({
      cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })),
    }));
    openReady(doc);
    const before = st().doc;
    const res = classicAddBlock();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/capacity/i);
    expect(st().doc).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Fine content clocks (the composer-freeze fix)
//
// `chunkEpoch` is deliberately coarse — chunk art bakes blocks + tiles + palette,
// so all three must bump it, and these tests do NOT change that. What they lock is
// the ADDITIVE narrower clocks that let object sprites and tile thumbnails
// invalidate on only the inputs they actually read. Keying those on `chunkEpoch`
// is what made every pencil stroke rebuild every object sprite in the act.
// ---------------------------------------------------------------------------
describe('fine content clocks (paletteEpoch / tileEpoch / tileVersions)', () => {
  it('a TILE edit bumps the tile clock but NOT the palette clock', () => {
    openReady();
    const pal0 = st().paletteEpoch;
    const tile0 = st().tileEpoch;
    expect(classicEditTiles([{ tileIndex: 0, data: new Uint8Array(32).fill(0xab) }]).ok).toBe(true);
    expect(st().tileEpoch).toBeGreaterThan(tile0);
    expect(st().paletteEpoch).toBe(pal0); // file-backed sprites stay cached
    expect(st().chunkEpoch).toBeGreaterThan(0); // coarse clock still bumps
  });

  it('a PALETTE edit bumps the palette clock but NOT the tile clock', () => {
    openReady();
    const pal0 = st().paletteEpoch;
    const tile0 = st().tileEpoch;
    expect(classicSetPalette(2, new Uint16Array(16).fill(0x0e0e)).ok).toBe(true);
    expect(st().paletteEpoch).toBeGreaterThan(pal0); // every sprite re-renders
    expect(st().tileEpoch).toBe(tile0);
  });

  it('a BLOCK edit bumps NEITHER fine clock (no sprite or tile thumb bakes blocks)', () => {
    openReady();
    const pal0 = st().paletteEpoch;
    const tile0 = st().tileEpoch;
    const epoch0 = st().chunkEpoch;
    const def: BlockDef = { cells: Array.from({ length: 4 }, () => ({ tile: 3, xf: false, yf: true, pal: 2, pri: false })) };
    expect(classicEditBlock(0, def).ok).toBe(true);
    expect(st().chunkEpoch).toBeGreaterThan(epoch0); // chunk art DOES change
    expect(st().paletteEpoch).toBe(pal0);
    expect(st().tileEpoch).toBe(tile0);
  });

  it('a tile edit versions ONLY the tiles it wrote', () => {
    openReady();
    expect(st().tileVersions.size).toBe(0);
    expect(classicEditTiles([{ tileIndex: 0, data: new Uint8Array(32).fill(1) }]).ok).toBe(true);
    // Exactly one tile is now versioned, so the composer strip repaints one
    // thumbnail instead of the whole pool.
    expect(st().tileVersions.size).toBe(1);
    expect(st().tileVersions.has(0)).toBe(true);
    expect(st().tileVersions.has(1)).toBe(false);

    const v0 = st().tileVersions.get(0);
    expect(classicEditTiles([{ tileIndex: 1, data: new Uint8Array(32).fill(2) }]).ok).toBe(true);
    expect(st().tileVersions.get(0)).toBe(v0); // untouched tile keeps its version
    expect(st().tileVersions.get(1)).toBeDefined();
  });

  it('a layout edit bumps no clock at all', () => {
    openReady();
    const pal0 = st().paletteEpoch;
    const tile0 = st().tileEpoch;
    expect(classicSetStart(200, 300).ok).toBe(true);
    expect(st().paletteEpoch).toBe(pal0);
    expect(st().tileEpoch).toBe(tile0);
  });

  it('an art undo re-derives the fine clocks so nothing renders stale', () => {
    // The clocks are NOT snapshotted: an art undo can revert tiles, blocks and
    // palette in one step, so it allocates fresh epochs and lets everything
    // rebuild. Over-invalidating, but only on an explicit, rare operation.
    openReady();
    expect(classicEditTiles([{ tileIndex: 0, data: new Uint8Array(32).fill(0xab) }]).ok).toBe(true);
    const pal1 = st().paletteEpoch;
    const tile1 = st().tileEpoch;
    artStack().undo();
    expect(st().doc!.tiles[0]).toBe(0);
    expect(st().paletteEpoch).toBeGreaterThan(pal1);
    expect(st().tileEpoch).toBeGreaterThan(tile1);
    expect(st().tileVersions.size).toBe(0);
  });
});
