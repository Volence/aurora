import { describe, it, expect } from 'vitest';
import { selectionToChunk, slugChunkName } from '../selection-to-chunk';
import { createSection, SECTION_TILES_WIDE, packNametableWord } from '../../model/s4-types';
import type { Section } from '../../model/s4-types';

/** Build a section with a recognizable 4x4-tile region at (col,row) and both
 *  collision planes seeded so the capture can be verified. */
function seedSection(col: number, row: number, w: number, h: number): Section {
  const section = createSection(0, 'test');
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const idx = (row + r) * SECTION_TILES_WIDE + (col + c);
      // Distinct word per cell: tile index encodes its position.
      section.tileGrid.nametable[idx] = packNametableWord(r * w + c + 1, 1, false, false, false);
    }
  }
  const A = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_WIDE);
  const B = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_WIDE);
  // Collision word lives at the top-left tile of each 2x2 (16px) cell.
  for (let r = 0; r < h; r += 2) {
    for (let c = 0; c < w; c += 2) {
      const idx = (row + r) * SECTION_TILES_WIDE + (col + c);
      A[idx] = 0x100 + (r * w + c);
      B[idx] = 0x200 + (r * w + c);
    }
  }
  section.collisionEdit = A;
  section.collisionEditB = B;
  return section;
}

describe('selectionToChunk', () => {
  it('produces correct dims from a marquee rect', () => {
    const section = seedSection(4, 6, 4, 6);
    const chunk = selectionToChunk(section, 4, 6, 4, 6, 'Selection 2×3', 'sel-1');
    expect(chunk.id).toBe('sel-1');
    expect(chunk.name).toBe('Selection 2×3');
    expect(chunk.widthTiles).toBe(4);
    expect(chunk.heightTiles).toBe(6);
    expect(chunk.nametable.length).toBe(24);
    expect(chunk.collisionA.length).toBe((4 >> 1) * (6 >> 1)); // 6 cells
    expect(chunk.collisionB.length).toBe(6);
  });

  it('copies the FG nametable in row order', () => {
    const w = 4, h = 4;
    const section = seedSection(2, 2, w, h);
    const chunk = selectionToChunk(section, 2, 2, w, h, 'sel', 'id');
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        expect(chunk.nametable[r * w + c]).toBe(
          packNametableWord(r * w + c + 1, 1, false, false, false));
      }
    }
  });

  it('carries both collision planes', () => {
    const w = 4, h = 4;
    const section = seedSection(0, 0, w, h);
    const chunk = selectionToChunk(section, 0, 0, w, h, 'sel', 'id');
    const cellsW = w >> 1;
    // Cell (0,0) top-left tile carried A=0x100, B=0x200.
    expect(chunk.collisionA[0]).toBe(0x100);
    expect(chunk.collisionB[0]).toBe(0x200);
    // Cell (1,0) -> tile col 2 -> A=0x100+2.
    expect(chunk.collisionA[1]).toBe(0x102);
    // Cell (0,1) -> tile row 2 -> A=0x100 + (2*w) = 0x100+8.
    expect(chunk.collisionA[cellsW]).toBe(0x100 + 2 * w);
  });

  it('treats empty cells as air (word 0) and unseeded collision as air', () => {
    const section = createSection(0, 'blank'); // no region seeded, no collision planes
    const chunk = selectionToChunk(section, 0, 0, 4, 4, 'blank', 'id');
    expect(Array.from(chunk.nametable).every((w) => w === 0)).toBe(true);
    expect(Array.from(chunk.collisionA).every((w) => w === 0)).toBe(true);
    expect(Array.from(chunk.collisionB).every((w) => w === 0)).toBe(true);
  });

  it('owns its arrays (no aliasing of section state)', () => {
    const section = seedSection(0, 0, 2, 2);
    const chunk = selectionToChunk(section, 0, 0, 2, 2, 'sel', 'id');
    chunk.nametable[0] = 0xFFFF;
    expect(section.tileGrid.nametable[0]).not.toBe(0xFFFF);
  });

  it('slugChunkName mints id-safe tokens', () => {
    expect(slugChunkName('Selection 2×3')).toBe('selection-2-3');
    expect(slugChunkName('   ')).toBe('chunk');
    expect(slugChunkName('Tree!!')).toBe('tree');
  });
});
