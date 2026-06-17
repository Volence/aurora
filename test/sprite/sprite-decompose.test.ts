import { describe, it, expect } from 'vitest';
import { extractTile, tileIsEmpty } from '../../src/core/art/sprite-decompose';

// 16x16 bitmap (2x2 tiles). Fill the top-left 8x8 tile with color 1, rest 0.
function bitmap16(): Uint8Array {
  const px = new Uint8Array(16 * 16);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[y * 16 + x] = 1;
  return px;
}

describe('extractTile', () => {
  it('extracts the 8x8 tile at a grid cell', () => {
    const t = extractTile(bitmap16(), 16, 16, 0, 0);
    expect(t.pixels.length).toBe(64);
    expect(Array.from(t.pixels).every((v) => v === 1)).toBe(true);
  });
  it('returns transparent (0) for an empty cell', () => {
    const t = extractTile(bitmap16(), 16, 16, 1, 1);
    expect(Array.from(t.pixels).every((v) => v === 0)).toBe(true);
  });
  it('pads out-of-bounds pixels with 0 (frame not a multiple of 8)', () => {
    // 4x4 bitmap, all color 2; tile 0,0 should have the 4x4 filled, rest 0.
    const px = new Uint8Array(4 * 4).fill(2);
    const t = extractTile(px, 4, 4, 0, 0);
    expect(t.pixels[0]).toBe(2);          // (0,0) in bounds
    expect(t.pixels[5 * 8 + 5]).toBe(0);  // (5,5) out of bounds → 0
  });
});

describe('tileIsEmpty', () => {
  it('is true for an all-zero tile and false otherwise', () => {
    expect(tileIsEmpty({ pixels: new Uint8Array(64) })).toBe(true);
    const t = new Uint8Array(64); t[10] = 3;
    expect(tileIsEmpty({ pixels: t })).toBe(false);
  });
});

import { decomposeFrame } from '../../src/core/art/sprite-decompose';
import type { RawFrame } from '../../src/core/art/sprite-decompose';

function raw(over: Partial<RawFrame> & { pixels: Uint8Array; width: number; height: number }): RawFrame {
  return { id: 'f', originX: 0, originY: 0, palette: 0, priority: false, ...over };
}

describe('decomposeFrame', () => {
  it('packs a solid 16x16 frame into one 2x2 piece with 4 column-major tiles', () => {
    // distinct color per tile so we can verify column-major ordering:
    // grid (gx,gy): (0,0)=1 (1,0)=2 (0,1)=3 (1,1)=4
    const px = new Uint8Array(16 * 16);
    const set = (gx: number, gy: number, c: number) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[(gy * 8 + y) * 16 + (gx * 8 + x)] = c;
    };
    set(0, 0, 1); set(1, 0, 2); set(0, 1, 3); set(1, 1, 4);
    const { tiles, pieces } = decomposeFrame(raw({ pixels: px, width: 16, height: 16, originX: 8, originY: 8 }));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2, tile: 0, palette: 0 });
    // VDP column-major: (0,0),(0,1),(1,0),(1,1) → colors 1,3,2,4
    expect(tiles.map((t) => t.pixels[0])).toEqual([1, 3, 2, 4]);
  });

  it('splits a 5-wide run into a 4-cell piece and a 1-cell piece (max 4 cells)', () => {
    const px = new Uint8Array((5 * 8) * 8).fill(1); // 40x8 all filled
    const { pieces } = decomposeFrame(raw({ pixels: px, width: 40, height: 8 }));
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ widthCells: 4, heightCells: 1, xOffset: 0 });
    expect(pieces[1]).toMatchObject({ widthCells: 1, heightCells: 1, xOffset: 32 });
  });

  it('skips empty tiles (a gap produces two pieces)', () => {
    // 3 tiles wide, middle empty: [filled][empty][filled]
    const px = new Uint8Array((3 * 8) * 8);
    const fill = (gx: number) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[y * 24 + (gx * 8 + x)] = 1; };
    fill(0); fill(2);
    const { pieces } = decomposeFrame(raw({ pixels: px, width: 24, height: 8 }));
    expect(pieces.map((p) => p.xOffset).sort((a, b) => a - b)).toEqual([0, 16]);
    expect(pieces.every((p) => p.widthCells === 1)).toBe(true);
  });

  it('dedups identical tile blocks, reusing the base tile index', () => {
    // two identical filled tiles separated by an empty tile → 2 pieces, 1 pooled tile
    const px = new Uint8Array((3 * 8) * 8);
    const fill = (gx: number) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[y * 24 + (gx * 8 + x)] = 7; };
    fill(0); fill(2);
    const { tiles, pieces } = decomposeFrame(raw({ pixels: px, width: 24, height: 8 }));
    expect(tiles).toHaveLength(1);
    expect(pieces.every((p) => p.tile === 0)).toBe(true);
  });

  it('returns no pieces for a fully transparent frame', () => {
    const { tiles, pieces } = decomposeFrame(raw({ pixels: new Uint8Array(16 * 16), width: 16, height: 16 }));
    expect(pieces).toHaveLength(0);
    expect(tiles).toHaveLength(0);
  });

  it('carries palette and priority onto every piece', () => {
    const px = new Uint8Array(8 * 8).fill(1);
    const { pieces } = decomposeFrame(raw({ pixels: px, width: 8, height: 8, palette: 2, priority: true }));
    expect(pieces[0]).toMatchObject({ palette: 2, priority: true, xFlip: false, yFlip: false });
  });
});

describe('decomposeFrame validation', () => {
  it('throws when pixels length does not match width*height', () => {
    expect(() => decomposeFrame(raw({ pixels: new Uint8Array(10), width: 16, height: 16 })))
      .toThrow(/pixels length/);
  });
  it('throws on non-positive dimensions', () => {
    expect(() => decomposeFrame(raw({ pixels: new Uint8Array(0), width: 0, height: 0 })))
      .toThrow(/positive integers/);
  });
});

describe('decomposeFrame packer shape coverage', () => {
  it('packs a full 4x4 region into a single 4x4 piece', () => {
    // 32x32 all filled
    const px = new Uint8Array(32 * 32).fill(1);
    const { pieces } = decomposeFrame(raw({ pixels: px, width: 32, height: 32 }));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ widthCells: 4, heightCells: 4 });
  });

  it('emits only rectangular pieces for an L-shaped region (no overlap, full cover)', () => {
    // 2 wide x 2 tall grid; bottom-right tile empty (L-shape):
    // (0,0)X (1,0)X
    // (0,1)X (1,1).
    const W = 16, H = 16;
    const px = new Uint8Array(W * H);
    const fill = (gx: number, gy: number) => {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[(gy * 8 + y) * W + (gx * 8 + x)] = 1;
    };
    fill(0, 0); fill(1, 0); fill(0, 1);
    const { pieces } = decomposeFrame(raw({ pixels: px, width: W, height: H }));
    // Every piece must be a rectangle within 4x4 and cover exactly the 3 filled cells with no overlap.
    let coveredCells = 0;
    const seen = new Set<string>();
    for (const p of pieces) {
      expect(p.widthCells).toBeGreaterThanOrEqual(1);
      expect(p.widthCells).toBeLessThanOrEqual(4);
      expect(p.heightCells).toBeLessThanOrEqual(4);
      const gx0 = (p.xOffset) / 8, gy0 = (p.yOffset) / 8; // originX/Y default 0
      for (let c = 0; c < p.widthCells; c++) for (let r = 0; r < p.heightCells; r++) {
        const k = `${gx0 + c},${gy0 + r}`;
        expect(seen.has(k)).toBe(false); // no overlap
        seen.add(k);
        coveredCells++;
      }
    }
    expect(coveredCells).toBe(3); // exactly the 3 filled cells, no empty cell pulled in
  });
});

import { assembleSprite } from '../../src/core/art/sprite-decompose';
import { serializeSpriteMappings } from '../../src/core/export/sprite-mappings-export';
import { serializeTiles } from '../../src/core/export/tile-dedup';

describe('assembleSprite', () => {
  it('concatenates per-frame art and rebases piece tile indices', () => {
    // frame A: one filled tile (color 1). frame B: one filled tile (color 2).
    const a = new Uint8Array(8 * 8).fill(1);
    const b = new Uint8Array(8 * 8).fill(2);
    const { art, frames } = assembleSprite([
      { id: 'a', pixels: a, width: 8, height: 8, originX: 0, originY: 0, palette: 0, priority: false },
      { id: 'b', pixels: b, width: 8, height: 8, originX: 0, originY: 0, palette: 0, priority: false },
    ]);
    expect(art).toHaveLength(2);             // one tile per frame, not deduped across frames
    expect(frames[0].pieces[0].tile).toBe(0); // frame A base 0
    expect(frames[1].pieces[0].tile).toBe(1); // frame B rebased to 1
  });

  it('produces frames that serialize and art that serializes (integration with Plan 1)', () => {
    const px = new Uint8Array(16 * 16).fill(5);
    const { art, frames } = assembleSprite([
      { id: 'f0', pixels: px, width: 16, height: 16, originX: 8, originY: 8, palette: 0, priority: false },
    ]);
    const mapBytes = serializeSpriteMappings(frames);
    const artBytes = serializeTiles(art);
    expect(mapBytes.length).toBeGreaterThan(0);
    expect(artBytes.length).toBe(art.length * 32); // 32 bytes per 8x8 4bpp tile
    // single 2x2 piece → frame block = 6-byte header + 8-byte piece; table = 2 bytes
    expect(mapBytes.length).toBe(2 + 6 + 8);
  });
});
