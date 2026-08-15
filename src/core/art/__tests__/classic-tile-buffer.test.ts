import { describe, it, expect } from 'vitest';
import { tileToBuffer, bufferToTileBytes, tileBytesIfChanged } from '../classic-tile-buffer';
import type { PixelBuffer } from '../pixel-ops';

// This file imports NOTHING from src/renderer — core must be testable in
// isolation, and a test that reaches across the layer undercuts that even when
// the production code does not. Nothing forces one now: composer-math's
// re-export of `packTilePixels` was deleted in H1.7 (no caller left), and with it
// the renderer-side case that pinned the re-export. `bufferToTileBytes` is a
// one-line wrapper over the packer, so the round-trip below covers both.

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

  // An out-of-range index must still yield a USABLE buffer, not null: PixelViewport
  // takes a non-nullable `buffer` prop, and this preserves the zero-fill contract
  // the tile tab's old `readTilePixels` had. A zero-filled tile renders fully
  // transparent, which is what happens today.
  it('yields a zero-filled 8x8 buffer for an out-of-range index (no throw, not null)', () => {
    const tiles = new Uint8Array(32); // one tile only; index 5 is well past the end
    const b = tileToBuffer(tiles, 5);
    expect(b.width).toBe(8);
    expect(b.height).toBe(8);
    expect(Array.from(b.data)).toEqual(Array(64).fill(0));
  });
});

// The "nothing changed → write nothing" rule, which both classic resolvers ask.
// It is worth executing rather than trusting because its failure is INVISIBLE in
// the app: every commit on this path is one `classicEditTiles`, i.e. exactly one
// undo entry, so a `differs` that answered true too eagerly would fill the undo
// stack with empty steps that look identical to real ones. It used to live inside
// classic-tile-gesture, which is why classic-tile-transform reached through the
// gesture resolver — synthesising a GestureResult and passing `locked: false` to
// a lock-aware function — purely to borrow it.
describe('tileBytesIfChanged', () => {
  const buf = (f: (i: number) => number = () => 0): PixelBuffer =>
    ({ width: 8, height: 8, data: Uint8Array.from({ length: 64 }, (_, i) => f(i) & 0xf) });

  it('returns null when the buffers are byte-identical', () => {
    expect(tileBytesIfChanged(buf((i) => i), buf((i) => i))).toBeNull();
    expect(tileBytesIfChanged(buf(), buf())).toBeNull();
  });

  it('returns the packed bytes of AFTER when a single pixel differs', () => {
    const before = buf();
    const after = buf();
    after.data[63] = 9;                       // the last pixel: the low nibble of byte 31
    const bytes = tileBytesIfChanged(before, after);
    expect(bytes).not.toBeNull();
    expect(Array.from(bytes!)).toEqual(Array.from(bufferToTileBytes(after)));
    expect(bytes![31]).toBe(0x09);
  });

  it('sees a change in either nibble of a shared byte', () => {
    // Two pixels share a byte. A comparison done on the PACKED bytes with a
    // nibble-masking slip would miss one of the two halves, and the edit would be
    // silently dropped as a no-op — so both are asserted, at the same byte.
    for (const i of [0, 1]) {                 // pixel 0 = high nibble, pixel 1 = low
      const before = buf();
      const after = buf();
      after.data[i] = 1;
      expect(tileBytesIfChanged(before, after), `pixel ${i}`).not.toBeNull();
    }
  });

  it('treats a shape change as a change', () => {
    const before: PixelBuffer = { width: 8, height: 8, data: new Uint8Array(64) };
    const after: PixelBuffer = { width: 4, height: 16, data: new Uint8Array(64) };
    expect(tileBytesIfChanged(before, after)).not.toBeNull();
  });

  it('knows nothing about locks — that verdict belongs to the callers', () => {
    // Deliberate: the transform resolver has to distinguish "no-op" (silent) from
    // "locked" (toasted), and folding the two together here is what forced it to
    // lie about the lock. Same inputs, same answer, whatever the caller's state.
    const before = buf();
    const after = buf();
    after.data[0] = 5;
    expect(tileBytesIfChanged(before, after)).not.toBeNull();
    expect(tileBytesIfChanged(after, after)).toBeNull();
  });
});
