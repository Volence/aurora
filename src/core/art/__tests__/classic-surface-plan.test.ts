import { describe, it, expect } from 'vitest';
import { planSurfaceEdit } from '../classic-surface-plan';
import { buildChunkSurface } from '../classic-surface-buffer';
import { buildUsageIndex } from '../../level-classic/usage-index';
import type { LevelDoc, BlockDef, ChunkDef256, ChunkCell } from '../../level-classic/model';

const cell = (tile: number, xf = false, yf = false, pal = 0) => ({ tile, xf, yf, pal, pri: false });
const chunkCell = (block: number, xf = false, yf = false): ChunkCell =>
  ({ block, xf, yf, solidity: 0 });

/**
 * blocks[0] = tiles 1,2,3,4 ; blocks[1] = tiles 5,6,7,8
 * chunk 0: cell 0 -> block 0, all others block 1
 * chunk 1: all cells block 1
 * So block 0 is used once; block 1 is used by both chunks.
 */
function makeDoc(): LevelDoc {
  const tiles = new Uint8Array(16 * 32);
  for (let t = 1; t < 16; t++) for (let i = 0; i < 32; i++) tiles[t * 32 + i] = (t * 7 + i) % 256;
  const blocks: BlockDef[] = [
    { cells: [cell(1), cell(2), cell(3), cell(4)] },
    { cells: [cell(5), cell(6), cell(7), cell(8)] },
  ];
  const chunk = (fill: number, firstBlock: number): ChunkDef256 =>
    ({ cells: Array.from({ length: 256 }, (_, i) => chunkCell(i === 0 ? firstBlock : fill)) });
  return {
    game: 's1', tiles, blocks, chunks: [chunk(1, 0), chunk(1, 1)],
    fg: { width: 2, height: 1, cells: new Uint8Array([1, 2]) },
    bg: { width: 1, height: 1, cells: new Uint8Array([0]) },
    collision: { colind: new Uint8Array(2), shapes: { heights: [], angles: new Uint8Array(0) } },
    palettes: [0, 1, 2, 3].map(() => new Uint16Array(16)),
    paletteSources: [], objects: [], start: { x: 0, y: 0 }, sourceRefs: {},
  };
}

/** Every tile is claimable except 0 (the transparent entry). */
const allEditable = (t: number) => t !== 0;

describe('planSurfaceEdit: the in-place case', () => {
  it('mutates the tile in place when tile and block are each used once', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(1);
    expect(r.plan.tileWrites[0].tileIndex).toBe(1);
    expect(r.plan.newBlocks).toHaveLength(0);
    expect(r.plan.blockCellEdits).toHaveLength(0);
    expect(r.plan.chunkCellEdits).toHaveLength(0);
    expect(r.plan.stats.tilesClaimed).toBe(0);
    expect(r.plan.stats.blocksCloned).toBe(0);
  });

  it('writes the new value at the un-flipped position', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 1, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 4bpp: pixel 1 is the LOW nibble of byte 0.
    expect(r.plan.tileWrites[0].data[0] & 0x0f).toBe(9);
  });

  it('ignores writes that fall outside the surface', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 9999, y: 9999, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(0);
  });
});

import { tileToBuffer, bufferToTileBytes } from '../classic-tile-buffer';

describe('planSurfaceEdit: tile divergence', () => {
  /** Make tile 1 linked by pointing block 1's first cell at it too. */
  function docWithSharedTile1(): LevelDoc {
    const doc = makeDoc();
    doc.blocks[1] = { cells: [cell(1), cell(6), cell(7), cell(8)] };
    return doc;
  }

  it('claims a free editable slot when the tile is linked elsewhere', () => {
    const doc = docWithSharedTile1();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites.map((w) => w.tileIndex)).not.toContain(1);
    expect(r.plan.tileWrites).toHaveLength(1);
    expect(r.plan.stats.tilesClaimed).toBe(1);
    const claimedTile = r.plan.tileWrites[0].tileIndex;
    expect(r.plan.blockCellEdits).toHaveLength(1);
    expect(r.plan.blockCellEdits[0].blockId).toBe(0);
    expect(r.plan.blockCellEdits[0].cellIndex).toBe(0);
    expect(r.plan.blockCellEdits[0].cell.tile).toBe(claimedTile);
  });

  it('reuses an existing tile whose content already matches instead of claiming', () => {
    const doc = docWithSharedTile1();
    // Park the exact bytes the edit will produce in tile 12.
    const want = tileToBuffer(doc.tiles, 1);
    want.data[0] = 9;
    doc.tiles.set(bufferToTileBytes(want), 12 * 32);

    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(0);
    expect(r.plan.stats.tilesClaimed).toBe(0);
    expect(r.plan.blockCellEdits[0].cell.tile).toBe(12);
  });

  it('refuses, naming the limit, when no editable slot is free', () => {
    const doc = docWithSharedTile1();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: () => false,   // nothing claimable — the Labyrinth case
      writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/no free/i);
  });

  // REGRESSION. An earlier draft wrote the SurfaceCell's composed xf/yf into the
  // repointed block cell. Those are block-flip XOR chunk-flip, so storing them
  // back would double-apply the chunk's flip and paint would render mirrored.
  it("preserves the block cell's OWN flip when repointing, not the composed flip", () => {
    const doc = makeDoc();
    doc.blocks[0] = { cells: [cell(1, true), cell(2), cell(3), cell(4)] };
    doc.blocks[1] = { cells: [cell(1), cell(6), cell(7), cell(8)] };  // tile 1 linked
    // Chunk 0 cell 0 uses block 0 and is ITSELF xflipped.
    doc.chunks[0] = {
      cells: Array.from({ length: 256 }, (_, i) => chunkCell(i === 0 ? 0 : 1, i === 0)),
    };

    const { provenance } = buildChunkSurface(doc, 0);
    // Surface cell 1 draws block cell 0 (the chunk flip swapped it there), whose
    // OWN xf is true, so the COMPOSED flip is false. These two differing is what
    // makes the assertion below discriminating.
    expect(provenance.cells[1].blockCellIndex).toBe(0);
    expect(provenance.cells[1].xf).toBe(false);

    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 8, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.blockCellEdits).toHaveLength(1);
    expect(r.plan.blockCellEdits[0].cell.xf).toBe(true);   // OWN flip, not composed
  });
});

describe('planSurfaceEdit: a stroke that changes nothing commits nothing', () => {
  it('emits an empty plan in isolate mode', () => {
    const doc = makeDoc();
    const { buffer, provenance } = buildChunkSurface(doc, 0);
    // Repaint surface (0,0) with the value it already displays.
    const existing = buffer.data[0];
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: existing }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(0);
    expect(r.plan.blockCellEdits).toHaveLength(0);
    expect(r.plan.newBlocks).toHaveLength(0);
    expect(r.plan.chunkCellEdits).toHaveLength(0);
  });

  it('emits an empty plan in link mode', () => {
    const doc = makeDoc();
    const { buffer, provenance } = buildChunkSurface(doc, 0);
    const existing = buffer.data[0];
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'link',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: existing }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites).toHaveLength(0);
  });

  it('still commits when a linked tile is repainted to a DIFFERENT value', () => {
    const doc = makeDoc();
    doc.blocks[1] = { cells: [cell(1), cell(6), cell(7), cell(8)] };  // tile 1 linked
    const { buffer, provenance } = buildChunkSurface(doc, 0);
    const different = (buffer.data[0] + 1) & 0x0f;
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: different }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.blockCellEdits).toHaveLength(1);   // guard is not over-eager
  });
});

describe('planSurfaceEdit: block divergence', () => {
  it('clones a linked block and repoints only the painted chunk cell', () => {
    const doc = makeDoc();               // block 1 is used by both chunks
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.newBlocks).toHaveLength(1);
    expect(r.plan.stats.blocksCloned).toBe(1);
    const newId = doc.blocks.length;
    expect(r.plan.chunkCellEdits).toEqual([
      { chunkIndex: 0, cellIndex: 1, cell: { block: newId, xf: false, yf: false, solidity: 0 } },
    ]);
    expect(r.plan.blockCellEdits.every((b) => b.blockId === newId)).toBe(true);
  });

  it('clones ONCE when several 8x8 cells of the SAME chunk cell are painted', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    // x=16 and x=24 are both inside chunk cell 1 (cells are 16px wide).
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable,
      writes: [{ x: 16, y: 0, value: 9 }, { x: 24, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.newBlocks).toHaveLength(1);
    expect(r.plan.chunkCellEdits).toHaveLength(1);
  });

  // REGRESSION for the audit's severe finding.
  it('repoints EVERY painted chunk cell of a linked block, not just the first', () => {
    const doc = makeDoc();               // chunk 0 cells 1..255 all use block 1
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable,
      writes: [{ x: 16, y: 0, value: 9 }, { x: 32, y: 0, value: 7 }],  // chunk cells 1 AND 2
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.chunkCellEdits.map((e) => e.cellIndex).sort((a, b) => a - b)).toEqual([1, 2]);
    const [a, b] = r.plan.chunkCellEdits;
    expect(a.cell.block).not.toBe(b.cell.block);
    // No two blockCellEdits may collide on one (block, cell) slot — the buggy
    // memo produces exactly such a collision, silently last-write-wins at apply.
    const keys = r.plan.blockCellEdits.map((e) => `${e.blockId}:${e.cellIndex}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('diverges the tile too when the block is cloned, even if the tile is used once', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Tile 5 is used once, but the clone would share it — so it must NOT be mutated.
    expect(r.plan.tileWrites.map((w) => w.tileIndex)).not.toContain(5);
    expect(r.plan.stats.tilesClaimed).toBe(1);
  });

  it('refuses when the block pool is full', () => {
    const doc = makeDoc();
    // Pad the pool to the 10-bit ceiling so one more clone cannot fit.
    while (doc.blocks.length < 0x400) doc.blocks.push({ cells: [cell(0), cell(0), cell(0), cell(0)] });
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/block limit/i);
  });
});

describe('planSurfaceEdit: object-reserved tiles', () => {
  /** Make tile 1 linked by pointing block 1's first cell at it too. */
  function docWithSharedTile1(): LevelDoc {
    const doc = makeDoc();
    doc.blocks[1] = { cells: [cell(1), cell(6), cell(7), cell(8)] };
    return doc;
  }

  it('skips a reserved, zero-usage slot and claims the next one instead', () => {
    const doc = docWithSharedTile1();
    const { provenance } = buildChunkSurface(doc, 0);
    // With tile 1 shared, block 1's own tile 5 goes unused (cells=0) and is
    // findFreeSlot's normal first pick (tiles 6/7/8 stay used once by block
    // 1; 9..15 were already unused). Reserve 5 so the claim must skip it.
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: 9 }],
      reservedTiles: new Set([5]),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.stats.tilesClaimed).toBe(1);
    const claimedTile = r.plan.tileWrites[0].tileIndex;
    expect(claimedTile).not.toBe(5);
    expect(claimedTile).toBe(9);
  });

  it('diverges a reserved tile that is used exactly once, rather than writing it in place', () => {
    const doc = makeDoc();  // tile 1 is used exactly once (block 0's first cell)
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: 9 }],
      reservedTiles: new Set([1]),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Not written in place: tile 1 itself must not appear in tileWrites.
    expect(r.plan.tileWrites.map((w) => w.tileIndex)).not.toContain(1);
    expect(r.plan.stats.tilesClaimed).toBe(1);
    expect(r.plan.blockCellEdits).toHaveLength(1);
    expect(r.plan.blockCellEdits[0].cell.tile).not.toBe(1);
  });

  // NEGATIVE CONTROL: the same fixture as the first test above, but with
  // reservedTiles omitted, DOES claim the "reserved" slot — proving the skip
  // above is caused by reservedTiles, not some incidental property of slot 5.
  it('negative control: without reservedTiles, the same fixture claims slot 5', () => {
    const doc = docWithSharedTile1();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 0, y: 0, value: 9 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites[0].tileIndex).toBe(5);
  });
});

describe('planSurfaceEdit: link mode', () => {
  it('mutates in place and reports every chunk that will change', () => {
    const doc = makeDoc();              // block 1 lives in chunks 0 and 1
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'link',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.tileWrites.map((w) => w.tileIndex)).toEqual([5]);
    expect(r.plan.newBlocks).toHaveLength(0);
    expect(r.plan.chunkCellEdits).toHaveLength(0);
    expect(r.plan.stats.placesAffected).toBe(2);
  });

  it('isolate reports only the chunk being edited', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable, writes: [{ x: 16, y: 0, value: 9 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.stats.placesAffected).toBe(1);
  });

  // REGRESSION for the audit's link-mode finding.
  it('merges two cells drawing the SAME tile into one write, losing neither pixel', () => {
    const doc = makeDoc();
    const { provenance } = buildChunkSurface(doc, 0);
    // Chunk cells 1 and 2 both use block 1, whose cell 0 is tile 5. Surface x=16
    // and x=32 are pixel (0,0) of each — the SAME stored tile pixel — so use
    // x=33 for the second, a different stored pixel, to prove both survive.
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'link',
      isEditableTile: allEditable,
      writes: [{ x: 16, y: 0, value: 9 }, { x: 33, y: 0, value: 7 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const forTile5 = r.plan.tileWrites.filter((w) => w.tileIndex === 5);
    expect(forTile5).toHaveLength(1);
    // 4bpp byte 0 holds pixels (0,0) and (1,0) as high and low nibble.
    expect(forTile5[0].data[0]).toBe((9 << 4) | 7);
  });
});

describe('planSurfaceEdit: slot double-booking (regression)', () => {
  /**
   * A shipped defect, found while extracting the pool matcher for 2C.
   *
   * Two surface cells that both reference tile 5 through the shared block 1, in
   * DIFFERENT chunk cells, so each diverges independently. The first one's
   * painted result is planted into free slot 9 beforehand, so it finds a content
   * match and repoints there without allocating. The second finds no match and
   * asks for a free slot — and slot 9 is the lowest free one.
   *
   * Before the fix, a content match was taken without being recorded, so
   * findFreeSlot handed slot 9 to the second cell too: it wrote ITS bytes there
   * and the first cell's block was left pointing at them. Two cells painting
   * different colours, one tile, one of them silently wrong.
   */
  it('never allocates a slot another cell in the same gesture matched', () => {
    const doc = makeDoc();

    // Tiles 9..15 are unreferenced (makeDoc only uses 1..8), so 9 is the lowest
    // free slot — the one findFreeSlot will hand out.
    const painted = new Uint8Array(doc.tiles.subarray(5 * 32, 6 * 32));
    painted[0] = (9 << 4) | (painted[0] & 0x0f); // pixel (0,0) := 9
    doc.tiles.set(painted, 9 * 32);

    const { provenance } = buildChunkSurface(doc, 0);
    const r = planSurfaceEdit({
      doc, provenance, index: buildUsageIndex(doc), mode: 'isolate',
      isEditableTile: allEditable,
      // (16,0) and (0,16) are both block 1's cell 0 — tile 5 — in different
      // chunk cells, so both must diverge. They paint DIFFERENT values.
      writes: [{ x: 16, y: 0, value: 9 }, { x: 0, y: 16, value: 10 }],
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const targets = r.plan.blockCellEdits.map((e) => e.cell.tile);
    expect(targets).toHaveLength(2);
    // Different painted content must never land on one tile.
    expect(new Set(targets).size).toBe(2);

    // And the matched slot must not have been written by the other cell.
    const written = new Set(r.plan.tileWrites.map((w) => w.tileIndex));
    expect(written.has(9)).toBe(false);
  });
});
