import { describe, it, expect } from 'vitest';
import { createSection, createChunkDef, SECTION_TILES_WIDE } from '../../src/core/model/s4-types';
import { snapMarquee, copyFromSection, copyChunkToClipboard } from '../../src/core/editing/map-clipboard';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';

describe('snapMarquee', () => {
  it('(a) snaps a tile-coord drag rect out to 16px block boundaries', () => {
    expect(snapMarquee(3, 3, 4, 4)).toEqual({ col: 2, row: 2, w: 4, h: 4 });
  });

  it('(b) normalizes reversed drag corners to the same result', () => {
    expect(snapMarquee(4, 4, 3, 3)).toEqual({ col: 2, row: 2, w: 4, h: 4 });
  });

  it('(c) clamps the snapped rect to the section bounds', () => {
    expect(snapMarquee(254, 254, 300, 300)).toEqual({ col: 254, row: 254, w: 2, h: 2 });
  });

  it('a click with no drag snaps to one 2x2-tile (16px) block', () => {
    expect(snapMarquee(9, 9, 9, 9)).toEqual({ col: 8, row: 8, w: 2, h: 2 });
  });
});

describe('copyFromSection', () => {
  const WORD_A = packCollisionCell({ shape: 5, xFlip: false, yFlip: false, solidity: 'all' });
  const WORD_B = packCollisionCell({ shape: 9, xFlip: true, yFlip: false, solidity: 'top' });

  it('(d) captures the nametable rect row-major and the (w/2)x(h/2) cell words from both planes', () => {
    const section = createSection(0, 'Test');
    section.collisionEdit = new Uint16Array(65536);
    section.collisionEditB = new Uint16Array(65536);

    const col = 4, row = 4, w = 4, h = 2; // 2x1 cells

    // Distinct nonzero nametable words, row-major, so index math is checkable.
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const idx = (row + r) * SECTION_TILES_WIDE + (col + c);
        section.tileGrid.nametable[idx] = 0x100 + r * w + c;
      }
    }

    // Cell (cx=1,cy=0) -> section cell (col/2+1, row/2) = (3,2) -> top-left tile (6,4).
    const cellTileIdx = 4 * SECTION_TILES_WIDE + 6;
    section.collisionEdit[cellTileIdx] = WORD_A;
    section.collisionEditB[cellTileIdx] = WORD_B;

    const clip = copyFromSection(section, col, row, w, h);

    expect(clip.widthTiles).toBe(w);
    expect(clip.heightTiles).toBe(h);
    expect(Array.from(clip.nametable)).toEqual(
      Array.from({ length: w * h }, (_, i) => 0x100 + i),
    );
    expect(clip.collisionA.length).toBe(2); // (w/2)*(h/2) = 2*1
    expect(clip.collisionB.length).toBe(2);
    expect(clip.collisionA[1]).toBe(WORD_A);
    expect(clip.collisionB[1]).toBe(WORD_B);
    // The other cell in the rect (cx=0,cy=0) was untouched -- air.
    expect(clip.collisionA[0]).toBe(0);
    expect(clip.collisionB[0]).toBe(0);
  });

  it('(e) unseeded collision planes (collisionEdit/B null) read as air; art is still captured', () => {
    const section = createSection(0, 'Test');
    section.tileGrid.nametable[4 * SECTION_TILES_WIDE + 4] = 0xABCD;
    expect(section.collisionEdit).toBeUndefined();
    expect(section.collisionEditB).toBeUndefined();

    const clip = copyFromSection(section, 4, 4, 2, 2);

    expect(clip.nametable[0]).toBe(0xABCD);
    expect(Array.from(clip.collisionA)).toEqual([0]);
    expect(Array.from(clip.collisionB)).toEqual([0]);
  });
});

describe('copyChunkToClipboard', () => {
  it('carries the nametable + both collision planes, copying rather than aliasing', () => {
    const chunk = createChunkDef('c1', 'C1', 4, 4); // 2x2 cells
    chunk.nametable[0] = 0xBEEF;
    chunk.collisionA[0] = packCollisionCell({ shape: 5, xFlip: false, yFlip: false, solidity: 'all' });
    chunk.collisionB[0] = packCollisionCell({ shape: 9, xFlip: true, yFlip: false, solidity: 'top' });

    const clip = copyChunkToClipboard(chunk);

    expect(clip.widthTiles).toBe(4);
    expect(clip.heightTiles).toBe(4);
    expect(clip.nametable[0]).toBe(0xBEEF);
    expect(clip.collisionA[0]).toBe(chunk.collisionA[0]);
    expect(clip.collisionB[0]).toBe(chunk.collisionB[0]);

    // Mutating the clip must not leak back into the chunk (a copy, not an alias).
    clip.nametable[0] = 0;
    clip.collisionA[0] = 0;
    expect(chunk.nametable[0]).toBe(0xBEEF);
    expect(chunk.collisionA[0]).not.toBe(0);
  });
});
