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

describe('planSurfaceEdit — the in-place case', () => {
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

describe('planSurfaceEdit — tile divergence', () => {
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
