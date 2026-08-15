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
  // `.buffer` bug there would not be observable that way. (Moved here from
  // indexed-png-encode.test.ts per review correction R8.) Neither production
  // call site passes a genuine view today — see zlib-stream.ts's header for
  // why the guard is still load-bearing rather than aspirational.
  it('deflate compresses exactly a view\'s window, not its backing buffer', async () => {
    const big = new Uint8Array([9, 9, 0, 1, 2, 3, 9, 9]);
    const view = big.subarray(2, 6); // byteOffset 2, the [0,1,2,3] window
    const compressed = await deflate(view);
    const inflated = Array.from(new Uint8Array(inflateSync(Buffer.from(compressed))));
    expect(inflated).toEqual([0, 1, 2, 3]); // not [9, 9, 0, 1, 2, 3, 9, 9]
  });

  // The same hazard, the other direction: inflate() must decompress exactly a
  // view's window. Not live today either — decodeIndexedPng inflates
  // concat(idatParts), which always allocates fresh — but concat's obvious
  // single-part fast path would put a real subarray straight into this
  // function's hands, invisibly, the moment someone adds it (see
  // zlib-stream.ts's header). This guard is what stays true regardless.
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
