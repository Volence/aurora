// src/core/art/__tests__/zlib-stream.test.ts
import { describe, it, expect } from 'vitest';
import { deflateSync, inflateSync } from 'node:zlib';
import { deflate, inflate } from '../zlib-stream';

describe('zlib-stream view semantics', () => {
  // Regression for a hazard the reviewer reproduced against an earlier fix:
  // deflate() must accept a VIEW (a .subarray()), not silently widen it to its
  // whole backing buffer via `.buffer`. This has to be tested against
  // deflate() directly, not through encodeIndexedPng: inside encodeIndexedPng
  // the `raw` scanline buffer handed to deflate() is always freshly allocated
  // at exactly its own size (`new Uint8Array((width + 1) * height)`), so a
  // `.buffer` bug there would not be observable that way. It matters here
  // because the decoder's `inflate()` is naturally called with a subarray
  // straight out of a parsed chunk list (`png.subarray(dataStart, dataStart +
  // len)`), with real neighbouring bytes on both sides. (Moved here from
  // indexed-png-encode.test.ts per review correction R8.)
  it('deflate compresses exactly a view\'s window, not its backing buffer', async () => {
    const big = new Uint8Array([9, 9, 0, 1, 2, 3, 9, 9]);
    const view = big.subarray(2, 6); // byteOffset 2, the [0,1,2,3] window
    const compressed = await deflate(view);
    const inflated = Array.from(new Uint8Array(inflateSync(Buffer.from(compressed))));
    expect(inflated).toEqual([0, 1, 2, 3]); // not [9, 9, 0, 1, 2, 3, 9, 9]
  });

  // The same hazard, the other direction: inflate() must decompress exactly a
  // view's window. This is the LIVE hazard R8 warns about — a decoder's
  // IDAT chunk data really does arrive as `png.subarray(start, start + len)`,
  // sitting inside the whole PNG byte buffer with real chunks on both sides.
  it('inflate decompresses exactly a view\'s window, not its backing buffer', async () => {
    const payload = deflateSync(Buffer.from([4, 5, 6, 7]));
    const big = new Uint8Array(payload.length + 4);
    big.set([9, 9], 0);
    big.set(payload, 2);
    big.set([9, 9], 2 + payload.length);
    const view = big.subarray(2, 2 + payload.length); // byteOffset 2, just the payload
    const inflated = await inflate(view);
    expect(Array.from(inflated)).toEqual([4, 5, 6, 7]); // not garbage from the [9,9]/[9,9] padding
  });
});
