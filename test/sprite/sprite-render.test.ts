import { describe, it, expect } from 'vitest';
import { renderFrameToIndices, indicesToRGBA } from '../../src/core/art/sprite-render';
import { decomposeFrame } from '../../src/core/art/sprite-decompose';
import { parseSpriteMappings } from '../../src/core/import/sprite-mappings-import';
import { serializeSpriteMappings } from '../../src/core/export/sprite-mappings-export';
import type { Color } from '../../src/core/model/s4-types';

function painted(): { pixels: Uint8Array; width: number; height: number } {
  // 16x16, distinct value per tile-cell so reconstruction order is checkable.
  const px = new Uint8Array(16 * 16);
  const set = (gx: number, gy: number, c: number) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[(gy * 8 + y) * 16 + (gx * 8 + x)] = c;
  };
  set(0, 0, 1); set(1, 0, 2); set(0, 1, 3); set(1, 1, 4);
  return { pixels: px, width: 16, height: 16 };
}

describe('renderFrameToIndices', () => {
  it('is the inverse of decomposeFrame (decompose → render reproduces the bitmap)', () => {
    const { pixels, width, height } = painted();
    const ox = width / 2, oy = height / 2;
    const { tiles, pieces } = decomposeFrame({ id: 'f', pixels, width, height, originX: ox, originY: oy, palette: 0, priority: false });
    const back = renderFrameToIndices({ id: 'f', pieces }, tiles, width, height, ox, oy);
    expect(Array.from(back)).toEqual(Array.from(pixels));
  });

  it('survives a full export→import round-trip (mappings bytes → frames → bitmap)', () => {
    const { pixels, width, height } = painted();
    const ox = width / 2, oy = height / 2;
    const { tiles, pieces } = decomposeFrame({ id: 'f', pixels, width, height, originX: ox, originY: oy, palette: 0, priority: false });
    const parsed = parseSpriteMappings(serializeSpriteMappings([{ id: 'f', pieces }]));
    const back = renderFrameToIndices(parsed[0], tiles, width, height, ox, oy);
    expect(Array.from(back)).toEqual(Array.from(pixels));
  });

  it('applies xFlip when reconstructing a multi-cell piece', () => {
    // 2x1 piece (16x8): left tile=1, right tile=2. With xFlip the cells swap and
    // each tile mirrors — so the left half should show tile 2's mirror, etc.
    const tiles = [
      { pixels: new Uint8Array(64).fill(1) },
      { pixels: new Uint8Array(64).fill(2) },
    ];
    const frame = { id: 'x', pieces: [{ xOffset: 0, yOffset: 0, widthCells: 2, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: true, yFlip: false }] };
    const back = renderFrameToIndices(frame, tiles, 16, 8, 0, 0);
    // output col 0 (x 0..7) comes from source cell 1 (tile 2) → value 2
    expect(back[0]).toBe(2);
    // output col 1 (x 8..15) comes from source cell 0 (tile 1) → value 1
    expect(back[8]).toBe(1);
  });
});

describe('indicesToRGBA', () => {
  it('maps indices to colors and leaves index 0 transparent', () => {
    const colors: Color[] = [
      { r: 0, g: 0, b: 0, a: 0 }, { r: 10, g: 20, b: 30, a: 255 },
    ];
    const rgba = indicesToRGBA(new Uint8Array([0, 1]), colors);
    expect(Array.from(rgba.slice(0, 4))).toEqual([0, 0, 0, 0]);      // transparent
    expect(Array.from(rgba.slice(4, 8))).toEqual([10, 20, 30, 255]); // color 1
  });
});
