import { describe, it, expect } from 'vitest';
import { tileToBuffer, bufferToTileBytes } from '../classic-tile-buffer';
// Deliberately imported through composer-math's RE-EXPORT, not from the module
// under test. Both symbols sourced from one module would make the agreement case
// below assert f(x) === f(x) — it cannot fail, as a mutation of the nibble order
// confirmed. Coming through the re-export, it instead guards the cross-layer seam:
// it fails if the re-export is dropped or rewired to a different packer. A test
// asserting a cross-layer contract may import across layers; core CODE may not.
import { packTilePixels } from '../../../renderer/components/classic/composer-math';

describe('tileToBuffer', () => {
  it('is 8x8 and reads the tile at its index', () => {
    const tiles = new Uint8Array(64);
    tiles[32] = 0x12;                       // first byte of tile 1 -> pixels 0,1 = 1,2
    const b = tileToBuffer(tiles, 1);
    expect(b.width).toBe(8);
    expect(b.height).toBe(8);
    expect(b.data.length).toBe(64);
    expect(b.data[0]).toBe(1);
    expect(b.data[1]).toBe(2);
  });

  it('round-trips through bufferToTileBytes unchanged', () => {
    const tiles = new Uint8Array(32);
    for (let i = 0; i < 32; i++) tiles[i] = (i * 7) & 0xff;
    const b = tileToBuffer(tiles, 0);
    expect(Array.from(bufferToTileBytes(b))).toEqual(Array.from(tiles));
  });

  it('bufferToTileBytes agrees with packTilePixels', () => {
    const px = new Uint8Array(64);
    for (let i = 0; i < 64; i++) px[i] = i & 0x0f;
    const b = { width: 8, height: 8, data: px };
    expect(Array.from(bufferToTileBytes(b))).toEqual(Array.from(packTilePixels(px)));
  });

  // An out-of-range index must still yield a USABLE buffer, not null: PixelViewport
  // takes a non-nullable `buffer` prop, and this preserves readTilePixels' existing
  // zero-fill contract (composer-math.test.ts pins the same behaviour there). A
  // zero-filled tile renders fully transparent, which is what happens today.
  it('yields a zero-filled 8x8 buffer for an out-of-range index (no throw, not null)', () => {
    const tiles = new Uint8Array(32); // one tile only; index 5 is well past the end
    const b = tileToBuffer(tiles, 5);
    expect(b.width).toBe(8);
    expect(b.height).toBe(8);
    expect(Array.from(b.data)).toEqual(Array(64).fill(0));
  });
});
