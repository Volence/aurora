import { describe, it, expect } from 'vitest';
import { createBuffer } from '../pixel-ops';
import { canvasIndex, paletteEntryOf } from '../canvas-doc';
import { poolTileEntries } from '../tile-pool-match';
import { buildUsageIndex } from '../../level-classic/usage-index';
import type { LevelDoc, BlockDef, ChunkDef256, ChunkCell } from '../../level-classic/model';
import { planCanvasCommit } from '../classic-commit-plan';
import type { CommitPlanInput, CommitTarget, CanvasCommitPlan } from '../classic-commit-plan';

const CHUNK = 256;
const bcell = (tile: number, xf = false, yf = false, pal = 0) => ({ tile, xf, yf, pal, pri: false });
const ccell = (block: number, xf = false, yf = false, solidity = 0): ChunkCell =>
  ({ block, xf, yf, solidity });

/**
 * A tiny but REAL-SHAPED document: 64 pool tiles, 8 blocks, 2 chunks.
 * chunk 0 is all block 1; chunk 1 is all block 2. Blocks 1 and 2 use disjoint
 * tiles, so replacing chunk 0 reclaims exactly block 1's tiles.
 */
function makeDoc(): LevelDoc {
  const tiles = new Uint8Array(64 * 32);
  for (let t = 1; t < 64; t++) for (let i = 0; i < 32; i++) tiles[t * 32 + i] = (t * 11 + i * 3) % 256;
  const blocks: BlockDef[] = [
    { cells: [bcell(0), bcell(0), bcell(0), bcell(0)] },           // 0: blank
    { cells: [bcell(1), bcell(2), bcell(3), bcell(4)] },           // 1: chunk 0
    { cells: [bcell(5), bcell(6), bcell(7), bcell(8)] },           // 2: chunk 1
  ];
  const chunk = (block: number): ChunkDef256 =>
    ({ cells: Array.from({ length: 256 }, () => ccell(block)) });
  const colind = new Uint8Array(8);
  colind[1] = 9;   // chunk 0's block has a collision shape
  colind[2] = 4;
  return {
    game: 's1', tiles, blocks, chunks: [chunk(1), chunk(2)],
    fg: { width: 2, height: 1, cells: new Uint8Array([1, 2]) },
    bg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    collision: { colind, shapes: { heights: [], angles: new Uint8Array(0) } },
    palettes: [0, 1, 2, 3].map((l) => Uint16Array.from({ length: 16 }, (_, e) => (l * 16 + e) * 7)),
    paletteSources: [], objects: [], start: { x: 0, y: 0 }, sourceRefs: {},
  };
}

/** The doc's palette as the canvas would hold it — no drift. */
function matchingPalette(doc: LevelDoc): number[] {
  const out: number[] = [];
  for (let l = 0; l < 4; l++) for (let e = 0; e < 16; e++) out.push(doc.palettes[l][e]);
  return out;
}

function input(over: Partial<CommitPlanInput> = {}): CommitPlanInput {
  const doc = over.doc ?? makeDoc();
  const pixels = over.pixels ?? createBuffer(CHUNK, CHUNK);
  const targets: CommitTarget[] = over.targets ?? [{ chunkFileIndex: 0 }];
  return {
    doc,
    index: buildUsageIndex(doc),
    pixels,
    region: { x: 0, y: 0, chunksWide: 1, chunksHigh: 1 },
    canvasPalette: matchingPalette(doc),
    targets,
    paletteResolution: 'none',
    isEditableTile: (t) => t !== 0,
    reservedTiles: new Set<number>(),
    editableRangeKnown: true,
    animTiles: new Set<number>(),
    ...over,
    // Rebuild the index if a caller supplied its own doc.
    ...(over.doc ? { index: buildUsageIndex(over.doc) } : {}),
  };
}

/** A canvas painted with `fn` in canvas index space. */
function painted(fn: (x: number, y: number) => number, w = CHUNK, h = CHUNK) {
  const b = createBuffer(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b.data[y * w + x] = fn(x, y);
  return b;
}

describe('planCanvasCommit — validation', () => {
  it('refuses a misaligned region', () => {
    const r = planCanvasCommit(input({ region: { x: 8, y: 0, chunksWide: 1, chunksHigh: 1 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.kind).toBe('region-misaligned');
  });

  /**
   * ART-A6. The unique-tile and clash readouts are computed on the canvas's own
   * grid; the cut is not. An offset grid means the artist has been shown a
   * different set of 8x8 cells than the one being committed.
   */
  it('refuses when the canvas grid is offset from the cells it would cut', () => {
    const r = planCanvasCommit(input({ gridOrigin: { originX: 3, originY: 0 } }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'grid-origin') {
      expect(r.refusal.originX).toBe(3);
    } else { expect.fail('expected grid-origin'); }
  });

  it('accepts a grid origin that lands on the cell grid', () => {
    const r = planCanvasCommit(input({ gridOrigin: { originX: 16, originY: 8 } }));
    expect(r.ok).toBe(true);
  });

  it('refuses a region larger than the canvas', () => {
    const r = planCanvasCommit(input({
      region: { x: 0, y: 0, chunksWide: 2, chunksHigh: 1 },
      targets: [{ chunkFileIndex: 0 }, { chunkFileIndex: 1 }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.kind).toBe('region-out-of-bounds');
  });

  it('refuses when the target count does not match the region', () => {
    const r = planCanvasCommit(input({ targets: [] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.kind).toBe('target-count');
  });

  /**
   * ART-A3. Two cells aimed at one chunk used to produce two writes to one
   * slot: the second silently won, the report counted both as replaced, and the
   * reclaim had already freed art on the assumption that two chunks' worth was
   * going away.
   */
  it('refuses two region cells that replace the same chunk', () => {
    const r = planCanvasCommit(input({
      pixels: createBuffer(512, 256),
      region: { x: 0, y: 0, chunksWide: 2, chunksHigh: 1 },
      targets: [{ chunkFileIndex: 1 }, { chunkFileIndex: 1 }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'target-invalid') {
      expect(r.refusal.detail).toMatch(/both replace/);
    } else { expect.fail('expected target-invalid'); }
  });

  it('refuses a target that names a chunk the act does not have', () => {
    const r = planCanvasCommit(input({ targets: [{ chunkFileIndex: 9 }] }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'target-invalid') {
      expect(r.refusal.detail).toMatch(/not in this act/);
    } else { expect.fail('expected target-invalid'); }
  });

  it('refuses a cell that draws from two palette lines', () => {
    const px = painted((x) => (x % 8 < 4 ? canvasIndex(1, 5) : canvasIndex(2, 5)));
    const r = planCanvasCommit(input({ pixels: px }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusal.kind).toBe('cell-clash');
  });
});

describe('planCanvasCommit — palette', () => {
  it('refuses drift and names the entries', () => {
    const doc = makeDoc();
    const pal = matchingPalette(doc);
    pal[1 * 16 + 5] = 0x0eee; // line 1 entry 5 differs from the act
    const r = planCanvasCommit(input({
      doc, canvasPalette: pal, pixels: painted(() => canvasIndex(1, 5)),
    }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'palette-drift') {
      expect(r.refusal.entries).toEqual([1 * 16 + 5]);
      expect(r.refusal.touchesLine0).toBe(false);
    } else { expect.fail('expected palette-drift'); }
  });

  it('refuses line 0 drift even when a resolution was chosen — it is Sonic’s palette', () => {
    const doc = makeDoc();
    const pal = matchingPalette(doc);
    pal[3] = 0x0eee;
    const r = planCanvasCommit(input({
      doc, canvasPalette: pal, pixels: painted(() => canvasIndex(0, 3)),
      paletteResolution: 'adopt-into-zone',
    }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'palette-drift') {
      expect(r.refusal.touchesLine0).toBe(true);
    } else { expect.fail('expected palette-drift'); }
  });

  /**
   * ART-A10. Drift is measured over the entries the art DRAWS with, so adoption
   * has to write back exactly those: a canvas carries a full 64-word palette
   * whether or not the artist looked at it, and writing whole lines recolours
   * existing zone art — in every act sharing the palette file — from slots this
   * drawing never touched. Line 0 is never written at all.
   */
  it('adopting into the zone writes only the entries that drifted, and warns', () => {
    const doc = makeDoc();
    const pal = matchingPalette(doc);
    pal[1 * 16 + 5] = 0x0eee;  // drifted AND drawn with
    pal[2 * 16 + 9] = 0x0e00;  // drifted but never drawn — not the act's business
    const r = planCanvasCommit(input({
      doc, canvasPalette: pal, pixels: painted(() => canvasIndex(1, 5)),
      paletteResolution: 'adopt-into-zone',
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.paletteWrites?.map((w) => w.line)).toEqual([1]);
    const written = r.plan.paletteWrites![0].colors;
    expect(written[5]).toBe(0x0eee);
    // Every other entry of the line keeps the act's own colour.
    for (let e = 0; e < 16; e++) {
      if (e !== 5) expect(written[e]).toBe(doc.palettes[1][e]);
    }
    expect(r.plan.report.warnings.join(' ')).toMatch(/every act/);
  });

  /**
   * ART-A8. A CRAM word's live bits are $0EEE; a disasm palette can carry junk
   * in the rest. Two words that draw the same colour are not drift — calling
   * them drift turns a commit that changes nothing into a zone-wide rewrite.
   */
  it('does not call dead-bit junk palette drift', () => {
    const doc = makeDoc();
    const pal = matchingPalette(doc);
    pal[1 * 16 + 5] |= 0xf111; // every bit the VDP ignores
    const r = planCanvasCommit(input({
      doc, canvasPalette: pal, pixels: painted(() => canvasIndex(1, 5)),
      paletteResolution: 'none',
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.paletteWrites).toBeNull();
  });

  /**
   * ART-A4. "Use the act's colours" is a fix for the entries that drifted. An
   * entry already holding the act's colour needs no fixing, and act palettes
   * hold duplicate colours routinely — remapping it to the lowest slot with the
   * same colour writes different tile bytes for identical art, so the drawing
   * stops matching the pool tiles it was lifted from and mints copies of them.
   */
  it('remaps only the drifted entries, leaving duplicates where they are', () => {
    const doc = makeDoc();
    doc.palettes[1][3] = doc.palettes[1][7]; // the act holds this colour twice
    const pal = matchingPalette(doc);
    pal[1 * 16 + 5] = doc.palettes[1][2];    // entry 5 drifts to the act's entry 2
    const r = planCanvasCommit(input({
      doc,
      canvasPalette: pal,
      pixels: painted((x) => canvasIndex(1, x % 2 === 0 ? 7 : 5)),
      targets: [{ chunkFileIndex: null }],
      paletteResolution: 'use-act-colours',
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nibbles = new Set<number>();
    for (const w of r.plan.tileWrites) {
      for (const b of w.data) { nibbles.add((b >> 4) & 15); nibbles.add(b & 15); }
    }
    expect(nibbles).toEqual(new Set([7, 2])); // 5 was fixed to 2; 7 stayed 7
  });

  it('committing with no drift writes no palette at all', () => {
    const r = planCanvasCommit(input({ pixels: painted(() => canvasIndex(1, 5)) }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.paletteWrites).toBeNull();
  });
});

describe('planCanvasCommit — the floors', () => {
  it('maps an all-transparent canvas to tile 0 and block 0, allocating nothing', () => {
    const r = planCanvasCommit(input({ pixels: painted(() => 0) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(0);
    expect(r.plan.report.blocksNew).toBe(0);
    expect(r.plan.chunkWrites[0].def.cells.every((c) => c.block === 0)).toBe(true);
    // Erasing a chunk still reclaims what it used, and step 9 blanks what
    // nothing took — the only writes here are those.
    expect(r.plan.blockWrites.every((w) => w.def.cells.every((c) => c.tile === 0))).toBe(true);
    expect(r.plan.report.blocksZeroed).toBe(r.plan.blockWrites.length);
  });

  /**
   * The floors must be exercised, not merely asserted. That needs a document
   * where tile 0 and block 0 ARE reclaim candidates: block 0 referenced only by
   * the chunk being replaced, and tile 0 owned only by block 0. Without that
   * setup this test passes with the floors deleted — verified by planting
   * exactly that deletion and watching it stay green, which is why the fixture
   * below is shaped the way it is.
   */
  it('never reclaims tile 0 or block 0 even when they are otherwise candidates', () => {
    const doc = makeDoc();
    // Chunk 0's first 16 cells are the blank block, so block 0's only referring
    // chunk is the one being replaced, and tile 0's only owner is block 0.
    for (let i = 0; i < 16; i++) doc.chunks[0].cells[i] = ccell(0);

    const r = planCanvasCommit(input({
      doc,
      // One repeating tile: enough that allocation actually happens — and the
      // reclaim list is consumed lowest-first, so a wrongly-reclaimed tile 0
      // would be the very first slot handed out — but few enough to fit in this
      // fixture's 64-tile pool.
      pixels: painted((x, y) => canvasIndex(1, (((x % 8) + (y % 8)) % 15) + 1)),
      targets: [{ chunkFileIndex: 0 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites.some((w) => w.tileIndex === 0)).toBe(false);
    expect(r.plan.blockWrites.some((w) => w.blockId === 0)).toBe(false);
  });
});

describe('planCanvasCommit — reclaim', () => {
  it('reclaims the replaced chunk’s tiles and blocks, and nothing else', () => {
    const r = planCanvasCommit(input({
      pixels: painted((x, y) => canvasIndex(1, ((x + y) % 15) + 1)),
      targets: [{ chunkFileIndex: 0 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Block 1 belongs only to chunk 0, so it and its tiles 1-4 are reclaimable;
    // block 2 (chunk 1) must not be.
    expect(r.plan.report.blocksReclaimed).toBe(1);
    expect(r.plan.report.tilesReclaimed).toBe(4);
  });

  it('reclaims nothing when only appending', () => {
    const r = planCanvasCommit(input({
      pixels: painted((x, y) => canvasIndex(1, ((x + y) % 15) + 1)),
      targets: [{ chunkFileIndex: null }],
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.report.tilesReclaimed).toBe(0);
  });

  it('never reclaims an object-reserved tile', () => {
    const r = planCanvasCommit(input({
      pixels: painted((x, y) => canvasIndex(1, ((x + y) % 15) + 1)),
      reservedTiles: new Set([2, 3]),
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.report.tilesReclaimed).toBe(2); // 1 and 4 only
  });

  it('never reclaims an animated-art overlay slot', () => {
    const r = planCanvasCommit(input({
      pixels: painted((x, y) => canvasIndex(1, ((x + y) % 15) + 1)),
      animTiles: new Set([1, 2, 3]),
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.plan.report.tilesReclaimed).toBe(1); // 4 only
  });

  /**
   * ART-A5 / spec step 9. A reclaimed block nothing takes is unreachable, but
   * its stale def still points at pool tiles — and the usage index believes it,
   * so those tiles read as used forever and the reclaim gives nothing back.
   */
  it('blanks reclaimed blocks nothing took, so their tiles stop reading as used', () => {
    const doc = makeDoc();
    doc.blocks.push({ cells: [bcell(10), bcell(11), bcell(12), bcell(13)] }); // id 3
    doc.collision.colind[3] = 9; // same shape as block 1: one drawn block suffices
    for (let i = 128; i < 256; i++) doc.chunks[0].cells[i] = ccell(3);

    // One flat colour: one tile, one block — so one of the two reclaimed block
    // ids is left over.
    const r = planCanvasCommit(input({
      doc, pixels: painted(() => canvasIndex(0, 7)), targets: [{ chunkFileIndex: 0 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.report.blocksReclaimed).toBe(2);
    expect(r.plan.report.blocksNew).toBe(1);
    expect(r.plan.report.blocksZeroed).toBe(1);

    const zeroed = r.plan.blockWrites.filter((w) => w.def.cells.every((c) => c.tile === 0));
    expect(zeroed).toHaveLength(1);
    expect(zeroed[0].colind).toBe(0);
    // FLAGGED, not merely blank-looking. A blanked reclaim and a freshly minted
    // block both carry colind 0, and consumers have to tell them apart —
    // commit-collision's toggle must not hand flat collision to a dead id, and
    // must not count it in what it reports. Inferring from "the def looks
    // blank" or from push order is silent to read and wrong the moment either
    // changes, so the planner says so outright.
    expect(zeroed[0].blanked).toBe(true);
    const minted = r.plan.blockWrites.filter((w) => !w.blanked);
    expect(minted).toHaveLength(r.plan.report.blocksNew);
    // And it is not the id the drawing was bound to.
    const bound = new Set(r.plan.chunkWrites[0].def.cells.map((c) => c.block));
    expect(bound.has(zeroed[0].blockId)).toBe(false);
  });

  it('refuses to REPLACE when the predicates are unknown', () => {
    const r = planCanvasCommit(input({
      pixels: painted(() => canvasIndex(1, 5)),
      reservedTiles: null,
      targets: [{ chunkFileIndex: 0 }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'predicates-unknown') {
      expect(r.refusal.which).toContain('object tile reservations');
    } else { expect.fail('expected predicates-unknown'); }
  });

  it('still allows an ADDITIVE commit when the predicates are unknown', () => {
    const r = planCanvasCommit(input({
      pixels: painted(() => canvasIndex(1, 5)),
      reservedTiles: null,
      editableRangeKnown: false,
      targets: [{ chunkFileIndex: null }],
    }));
    expect(r.ok).toBe(true);
  });
});

describe('planCanvasCommit — collision', () => {
  it('inherits colind from the block each new block displaces', () => {
    const r = planCanvasCommit(input({
      pixels: painted(() => canvasIndex(1, 5)),
      targets: [{ chunkFileIndex: 0 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // chunk 0's cells all held block 1, whose colind is 9.
    expect(r.plan.blockWrites.every((w) => w.colind === 9)).toBe(true);
    expect(r.plan.report.blocksInheritedCollision).toBeGreaterThan(0);
    expect(r.plan.report.blocksWithoutCollision).toBe(0);
  });

  it('gives an appended chunk no collision, and counts it', () => {
    const r = planCanvasCommit(input({
      pixels: painted(() => canvasIndex(1, 5)),
      targets: [{ chunkFileIndex: null }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.blockWrites.every((w) => w.colind === 0)).toBe(true);
    expect(r.plan.report.blocksWithoutCollision).toBeGreaterThan(0);
    expect(r.plan.report.cellsWithoutSolidity).toBe(256);
  });

  it('keeps the displaced cell’s solidity plane', () => {
    const doc = makeDoc();
    doc.chunks[0].cells[0] = ccell(1, false, false, 3); // AllSolid
    const r = planCanvasCommit(input({
      doc, pixels: painted(() => canvasIndex(1, 5)), targets: [{ chunkFileIndex: 0 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.chunkWrites[0].def.cells[0].solidity).toBe(3);
    expect(r.plan.report.cellsInheritedSolidity).toBe(256);
  });

  it('splits blocks that look identical but inherit different collision', () => {
    const doc = makeDoc();
    // Give half of chunk 0's cells a block with a different collision shape.
    doc.blocks.push({ cells: [bcell(1), bcell(2), bcell(3), bcell(4)] }); // id 3
    doc.collision.colind[3] = 7;
    for (let i = 128; i < 256; i++) doc.chunks[0].cells[i] = ccell(3);
    const r = planCanvasCommit(input({
      doc, pixels: painted(() => canvasIndex(1, 5)), targets: [{ chunkFileIndex: 0 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // One drawn block, two collision shapes -> two pool blocks.
    const shapes = new Set(r.plan.blockWrites.map((w) => w.colind));
    expect(shapes).toEqual(new Set([9, 7]));
  });

  /**
   * The pool-reuse scan's colind gate (GUARD-A1). A block that draws the right
   * art but carries the wrong collision shape is NOT a reuse candidate — reusing
   * it would silently swap the displaced cell's heightmap. Planted by deleting
   * the colind test from the scan: this fails, nothing else does.
   */
  it('will not reuse a pool block that draws right but collides wrong', () => {
    const doc = makeDoc();
    // Block 3 draws tiles 10-13 and has NO collision; chunk 1 refers to it, so
    // it survives the reclaim of chunk 0 and stays in the match scan's way.
    doc.blocks.push({ cells: [bcell(10), bcell(11), bcell(12), bcell(13)] }); // id 3
    doc.collision.colind[3] = 0;
    doc.chunks[1].cells[0] = ccell(3);

    // Paint chunk 0 entirely with block 3's art. Every cell inherits colind 9.
    const px = painted((x, y) => {
      const tile = 10 + ((y % 16) >> 3) * 2 + ((x % 16) >> 3);
      const ei = (y % 8) * 8 + (x % 8);
      const b = doc.tiles[tile * 32 + (ei >> 1)];
      return canvasIndex(0, ei % 2 === 0 ? (b >> 4) & 15 : b & 15);
    });

    const r = planCanvasCommit(input({ doc, pixels: px, targets: [{ chunkFileIndex: 0 }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.report.blocksReused).toBe(0);
    const after = applyPlan(doc, r.plan);
    for (const cell of after.chunks[0].cells) {
      expect(cell.block).not.toBe(3);
      expect(after.collision.colind[cell.block]).toBe(9);
    }
  });

  it('keeps the displaced cell’s flips so inherited collision stays oriented', () => {
    const doc = makeDoc();
    doc.chunks[0].cells[0] = ccell(1, true, false, 2);
    const r = planCanvasCommit(input({
      doc, pixels: painted(() => canvasIndex(1, 5)), targets: [{ chunkFileIndex: 0 }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.chunkWrites[0].def.cells[0].xf).toBe(true);
  });
});

describe('planCanvasCommit — allocation', () => {
  /**
   * GUARD-A3. The allocator's filter is the last thing standing between a
   * commit and a slot that is not its to take. Each of the three exclusions is
   * planted separately here — a free-slot scan missing any one of them still
   * looks like it works, because the next slot along is usually fine.
   */
  it('never allocates a reserved, animated or locked slot', () => {
    const r = planCanvasCommit(input({
      pixels: painted(() => canvasIndex(0, 7)), // one flat tile
      targets: [{ chunkFileIndex: null }],      // append: nothing is reclaimed
      reservedTiles: new Set([9, 10]),
      animTiles: new Set([11]),
      isEditableTile: (t) => t !== 0 && t !== 12,
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 1-8 are in use; 9-12 are excluded one way each.
    expect(r.plan.tileWrites.map((w) => w.tileIndex)).toEqual([13]);
  });
});

describe('planCanvasCommit — ceilings', () => {
  /** GUARD-A4, the other ceiling: the block field is 10 bits. */
  it('refuses to mint a block past the 1024-block ceiling', () => {
    const doc = makeDoc();
    while (doc.blocks.length < 0x400) {
      doc.blocks.push({ cells: [bcell(0), bcell(0), bcell(0), bcell(0)] });
    }
    const r = planCanvasCommit(input({
      doc, pixels: painted(() => canvasIndex(0, 7)), targets: [{ chunkFileIndex: null }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'blocks-exhausted') {
      expect(r.refusal.ceiling).toBe(0x400);
    } else { expect.fail('expected blocks-exhausted'); }
  });

  /**
   * ART-A9. At the moment allocation fails the live free count is zero by
   * construction, so reporting it told the artist nothing. `free` is the room
   * the act's pool had before the gesture — the number that says whether to
   * simplify the drawing or replace more chunks.
   */
  it('reports the act’s real free-slot count when it runs out of tiles', () => {
    // Each 8x8 cell stamps its own index in its first two pixels: ~225 distinct
    // tiles wanted against a 64-slot pool with 55 free (1-8 are in use).
    const px = painted((x, y) => {
      const idx = ((y >> 3) * 32 + (x >> 3)) % 225;
      if (y % 8 === 0 && x % 8 === 0) return canvasIndex(0, (idx % 15) + 1);
      if (y % 8 === 0 && x % 8 === 1) return canvasIndex(0, (((idx / 15) | 0) % 15) + 1);
      return canvasIndex(0, 1);
    });
    const r = planCanvasCommit(input({ pixels: px, targets: [{ chunkFileIndex: null }] }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'tiles-exhausted') {
      expect(r.refusal.free).toBe(55);
      expect(r.refusal.reclaimed).toBe(0);
      expect(r.refusal.needed).toBeGreaterThan(55);
    } else { expect.fail('expected tiles-exhausted'); }
  });

  it('refuses to append past the 127 addressable chunks', () => {
    const doc = makeDoc();
    const filler: ChunkDef256 = { cells: Array.from({ length: 256 }, () => ccell(0)) };
    while (doc.chunks.length < 127) doc.chunks.push({ cells: filler.cells.map((c) => ({ ...c })) });
    const r = planCanvasCommit(input({
      doc, pixels: painted(() => canvasIndex(1, 5)), targets: [{ chunkFileIndex: null }],
    }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.refusal.kind === 'chunks-exhausted') {
      expect(r.refusal.ceiling).toBe(0x7f);
    } else { expect.fail('expected chunks-exhausted'); }
  });
});

describe('planCanvasCommit — reuse', () => {
  /**
   * ART-A7. An animated-art slot is not a match candidate — but "not this one"
   * is not "no match at all". Testing it after the search threw away a perfectly
   * good duplicate sitting further up the pool and minted a third copy of a tile
   * the act already held twice.
   */
  it('looks past an animated slot to a real duplicate instead of allocating', () => {
    const doc = makeDoc();
    doc.tiles.copyWithin(40 * 32, 5 * 32, 6 * 32); // tile 40 duplicates tile 5
    const px = painted((x, y) => {
      const ei = (y % 8) * 8 + (x % 8);
      const b = doc.tiles[5 * 32 + (ei >> 1)];
      return canvasIndex(0, ei % 2 === 0 ? (b >> 4) & 15 : b & 15);
    });
    const r = planCanvasCommit(input({
      doc, pixels: px, targets: [{ chunkFileIndex: null }], animTiles: new Set([5]),
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(0);
    expect(r.plan.report.tilesReused).toBe(1);
    // And never bound to the animated slot itself.
    const bound = r.plan.chunkAppends[0].cells.map((c) => c.block);
    const defs = r.plan.blockWrites.filter((w) => bound.includes(w.blockId));
    expect(defs.some((w) => w.def.cells.some((c) => c.tile === 5))).toBe(false);
  });

  it('reuses an existing pool tile rather than allocating', () => {
    const doc = makeDoc();
    // Paint a canvas whose every cell is exactly pool tile 5's content.
    const px = createBuffer(CHUNK, CHUNK);
    for (let y = 0; y < CHUNK; y++) {
      for (let x = 0; x < CHUNK; x++) {
        const b = doc.tiles[5 * 32 + ((y % 8) * 8 + (x % 8)) / 2 | 0];
        const entry = ((x % 8) % 2 === 0) ? (b >> 4) & 15 : b & 15;
        px.data[y * CHUNK + x] = canvasIndex(0, entry);
      }
    }
    const r = planCanvasCommit(input({ doc, pixels: px, targets: [{ chunkFileIndex: null }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.report.tilesReused).toBeGreaterThan(0);
  });

  /**
   * ART-A2. The pool holds mirror-duplicate tiles, so the same 16x16 has several
   * legal spellings and the tile matcher picks whichever copy it meets first —
   * which is rarely the one the existing block spells. Comparing tile ids and
   * flip bits therefore misses matches on rendered-identical art (measured 100%
   * miss on real GHZ blocks) and mints a duplicate for art the commit did not
   * even change. Reuse is decided on what a block DRAWS.
   */
  it('reuses a pool block that draws the same thing but spells it differently', () => {
    const doc = makeDoc();
    // Tile 20 is tile 5 mirrored in x — same drawing, different bytes.
    // A row is 4 bytes of 2 entries each, so mirroring is "reverse the bytes of
    // the row, then swap each byte's nibbles".
    for (let i = 0; i < 32; i++) {
      const row = i >> 2, col = i & 3;
      const src = doc.tiles[5 * 32 + row * 4 + (3 - col)];
      doc.tiles[20 * 32 + i] = ((src & 0x0f) << 4) | ((src >> 4) & 0x0f);
    }
    // A pool block spelled with tile 20 unflipped.
    doc.blocks.push({ cells: [bcell(20), bcell(20), bcell(20), bcell(20)] }); // id 3
    doc.collision.colind[3] = 0;

    // Paint tile 20's drawing everywhere; the tile matcher will meet tile 5
    // first and spell each cell as "tile 5, x-flipped".
    const px = painted((x, y) => {
      const ei = (y % 8) * 8 + (x % 8);
      const b = doc.tiles[20 * 32 + (ei >> 1)];
      return canvasIndex(0, ei % 2 === 0 ? (b >> 4) & 15 : b & 15);
    });

    const r = planCanvasCommit(input({ doc, pixels: px, targets: [{ chunkFileIndex: null }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.blockWrites).toHaveLength(0);
    expect(r.plan.report.blocksReused).toBe(1);
    expect(r.plan.chunkAppends[0].cells.every((c) => c.block === 3)).toBe(true);
  });

  it('reports pool counts before and after', () => {
    const r = planCanvasCommit(input({
      pixels: painted(() => canvasIndex(1, 5)), targets: [{ chunkFileIndex: null }],
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.report.poolBefore.chunks).toBe(2);
    expect(r.plan.report.poolAfter.chunks).toBe(3);
  });
});

// --- the applied plan ------------------------------------------------------
//
// A plan is only correct as a WHOLE: every write lands in one pool, so a slot
// handed out twice reads as a perfectly reasonable plan field-by-field and only
// goes wrong once the writes are applied. These helpers apply one and read the
// art back the way the engine would, which is the only view that can see it.

/** The plan's writes folded into a copy of the document. */
function applyPlan(doc: LevelDoc, plan: CanvasCommitPlan): LevelDoc {
  const tiles = new Uint8Array(doc.tiles);
  for (const w of plan.tileWrites) tiles.set(w.data, w.tileIndex * 32);

  const blocks: BlockDef[] = doc.blocks.map((b) => ({ cells: b.cells.map((c) => ({ ...c })) }));
  const colind = new Uint8Array(0x400);
  colind.set(doc.collision.colind.subarray(0, 0x400));
  for (const w of plan.blockWrites) {
    while (blocks.length <= w.blockId) blocks.push({ cells: [bcell(0), bcell(0), bcell(0), bcell(0)] });
    blocks[w.blockId] = w.def;
    colind[w.blockId] = w.colind;
  }

  const chunks = doc.chunks.map((c) => ({ cells: c.cells.map((x) => ({ ...x })) }));
  for (const w of plan.chunkWrites) chunks[w.chunkFileIndex] = w.def;
  for (const a of plan.chunkAppends) chunks.push(a);

  return { ...doc, tiles, blocks, chunks, collision: { ...doc.collision, colind } };
}

/** The 16x16 palette entries a chunk cell draws, flips composed the engine's way. */
function renderChunkCell(doc: LevelDoc, cell: ChunkCell): Uint8Array {
  const out = new Uint8Array(16 * 16);
  const def = doc.blocks[cell.block];
  for (let by = 0; by < 2; by++) {
    for (let bx = 0; bx < 2; bx++) {
      const sx = cell.xf ? 1 - bx : bx, sy = cell.yf ? 1 - by : by;
      const src = def.cells[sy * 2 + sx];
      const xf = src.xf !== cell.xf, yf = src.yf !== cell.yf;
      const ent = poolTileEntries(doc.tiles, src.tile);
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const px = xf ? 7 - x : x, py = yf ? 7 - y : y;
          out[(by * 8 + y) * 16 + bx * 8 + x] = ent[py * 8 + px];
        }
      }
    }
  }
  return out;
}

describe('planCanvasCommit — the applied plan', () => {
  /**
   * R1. A partial edit is the ordinary gesture: redraw most of a chunk, leave
   * one 16x16 alone. The kept cell matches a pool block that the SAME plan is
   * about to reclaim and hand to new art, so both halves of the block tier —
   * the match scan and the reclaim allocator — must agree about which ids this
   * gesture has already spent. The art half of the corruption is loud; the
   * collision half is silent, which is why colind is asserted per cell here.
   */
  it('never rewrites a block id its own match scan reused', () => {
    const doc = makeDoc();
    // Top-left 16x16: exactly block 1's art (tiles 1-4, TL TR BL BR, line 0).
    // Everywhere else: solid tiles nothing in the pool can match.
    const px = painted((x, y) => {
      if (x < 16 && y < 16) {
        const tile = 1 + (y >> 3) * 2 + (x >> 3);
        const ei = (y % 8) * 8 + (x % 8);
        const b = doc.tiles[tile * 32 + (ei >> 1)];
        return canvasIndex(0, ei % 2 === 0 ? (b >> 4) & 15 : b & 15);
      }
      return canvasIndex(0, (((x >> 3) + (y >> 3)) % 15) + 1);
    });

    const r = planCanvasCommit(input({ doc, pixels: px, targets: [{ chunkFileIndex: 0 }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // The gesture must actually exercise both halves, or the assertions below
    // are vacuous: something was reused, and something was reclaimed.
    expect(r.plan.report.blocksReused).toBeGreaterThan(0);
    expect(r.plan.report.blocksReclaimed).toBeGreaterThan(0);

    expectChunkDrawsCanvas(doc, r.plan, px, 0);
  });

  /**
   * The other half of the same rule, one tier down. Reuse is decided on what a
   * pool block DRAWS — read out of the pool as it stands BEFORE the commit. A
   * block whose tiles this gesture is reclaiming and repainting does not draw
   * that any more, so it is not a candidate: the pool's duplicate tiles make it
   * perfectly possible for a kept 16x16 to match such a block while the tile
   * matcher binds the kept art to the duplicate and leaves the block's own tile
   * free for the allocator.
   */
  it('never reuses a pool block whose tiles this gesture repaints', () => {
    const doc = makeDoc();
    // Tile 30 duplicates tile 1 byte for byte. Block 3 is spelled with it, and
    // only chunk 0's first cell refers to block 3 — so both are reclaimable.
    doc.tiles.copyWithin(30 * 32, 1 * 32, 2 * 32);
    doc.blocks.push({ cells: [bcell(30), bcell(30), bcell(30), bcell(30)] }); // id 3
    doc.collision.colind[3] = 5;
    doc.chunks[0].cells[0] = ccell(3);

    // Keep the first 16x16 exactly as block 3 draws it; repaint the rest with
    // solid art, which needs enough fresh slots to reach tile 30 in the reclaim
    // queue.
    const px = painted((x, y) => {
      if (x < 16 && y < 16) {
        const ei = (y % 8) * 8 + (x % 8);
        const b = doc.tiles[1 * 32 + (ei >> 1)];
        return canvasIndex(0, ei % 2 === 0 ? (b >> 4) & 15 : b & 15);
      }
      return canvasIndex(0, (((x >> 3) + (y >> 3)) % 15) + 1);
    });

    const r = planCanvasCommit(input({ doc, pixels: px, targets: [{ chunkFileIndex: 0 }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Vacuity guard: tile 30 must really be repainted, or nothing is at stake.
    expect(r.plan.tileWrites.some((w) => w.tileIndex === 30)).toBe(true);

    expectChunkDrawsCanvas(doc, r.plan, px, 0);
  });
});

/**
 * Every cell of a written chunk draws what the canvas drew, and carries the
 * collision the cell it displaced carried. This is the only view that can see a
 * pool slot handed out twice — field-by-field, such a plan looks reasonable.
 */
function expectChunkDrawsCanvas(
  doc: LevelDoc, plan: CanvasCommitPlan, px: ReturnType<typeof createBuffer>, chunkFileIndex: number,
) {
  const before = doc.chunks[chunkFileIndex];
  const after = applyPlan(doc, plan);
  const written = after.chunks[chunkFileIndex];
  for (let ci = 0; ci < 256; ci++) {
    const cell = written.cells[ci];
    const drawn = renderChunkCell(after, cell);
    const ox = (ci % 16) * 16, oy = ((ci / 16) | 0) * 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const want = paletteEntryOf(px.data[(oy + y) * 256 + ox + x]);
        if (drawn[y * 16 + x] !== want) {
          expect.fail(`cell ${ci} px (${x},${y}): block ${cell.block} draws ${drawn[y * 16 + x]}, canvas has ${want}`);
        }
      }
    }
    // D3: the displaced cell's collision must survive the round trip.
    const inherited = doc.collision.colind[before.cells[ci].block] ?? 0;
    const got = after.collision.colind[cell.block] ?? 0;
    if (cell.block !== 0 && got !== inherited) {
      expect.fail(`cell ${ci}: block ${cell.block} kept colind ${got}, wanted the inherited ${inherited}`);
    }
  }
}
