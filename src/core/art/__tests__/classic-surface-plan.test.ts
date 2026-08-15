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
