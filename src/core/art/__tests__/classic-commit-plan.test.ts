import { describe, it, expect } from 'vitest';
import { createBuffer } from '../pixel-ops';
import { canvasIndex } from '../canvas-doc';
import { buildUsageIndex } from '../../level-classic/usage-index';
import type { LevelDoc, BlockDef, ChunkDef256, ChunkCell } from '../../level-classic/model';
import { planCanvasCommit } from '../classic-commit-plan';
import type { CommitPlanInput, CommitTarget } from '../classic-commit-plan';

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

  it('adopting into the zone writes lines 1-3 only, and warns', () => {
    const doc = makeDoc();
    const pal = matchingPalette(doc);
    pal[1 * 16 + 5] = 0x0eee;
    const r = planCanvasCommit(input({
      doc, canvasPalette: pal, pixels: painted(() => canvasIndex(1, 5)),
      paletteResolution: 'adopt-into-zone',
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.paletteWrites?.map((w) => w.line)).toEqual([1, 2, 3]);
    expect(r.plan.report.warnings.join(' ')).toMatch(/every act/);
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
    expect(r.plan.blockWrites).toHaveLength(0);
    expect(r.plan.chunkWrites[0].def.cells.every((c) => c.block === 0)).toBe(true);
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

describe('planCanvasCommit — ceilings', () => {
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
