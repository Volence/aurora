// src/core/art/zlib-stream.ts
//
// The deflate/inflate pair behind indexed-png.ts's IDAT payload — split into
// its own module (review correction R8) because Task 4's decoder needed a
// working `inflate` and the plan's inline version does not compile in this
// toolchain: `@types/node`'s `Uint8Array<ArrayBufferLike>` is not assignable
// to DOM's `BlobPart`, so `new Blob([data])` fails `tsc`.
//
// THE VIEW-SAFETY RULE, stated once for BOTH directions. `raw`/`data` is
// routinely a `.subarray()` of something larger — an encoder's freshly-sized
// scanline buffer today, but a decoder's chunk data tomorrow, which genuinely
// arrives as `png.subarray(start, start + len)` with real neighbouring bytes
// on both sides. The obvious fix for the tsc error, passing `.buffer`, is a
// trap: it discards the view's byteOffset/byteLength and hands Blob the WHOLE
// backing ArrayBuffer, silently compressing/decompressing a subarray's
// neighbours along with it:
//   view = big.subarray(2, 6)
//   new Blob([view.buffer])  -> the whole backing store (wrong)
//   new Blob([view])         -> just the window (right)
// Uint8Array itself is a valid BlobPart at runtime; the `as unknown as
// BlobPart` cast below is only working around @types/node's global
// Uint8Array being generic over ArrayBufferLike (to also cover
// SharedArrayBuffer views) where DOM's BlobPart type wants the narrower
// ArrayBufferView<ArrayBuffer> — a type-checker mismatch, not a real one.
// The cast is of the VIEW, never of `.buffer`.
//
// NO DEPENDENCY, NO NEW IPC. CompressionStream/DecompressionStream exist in
// Chromium (the renderer) and in Node 18+ (the test env). 'deflate' is the
// zlib-wrapped format, which is exactly what a PNG IDAT holds — no wrapper
// arithmetic of our own.
//
// Pure core: async because the compression streams are, but no fs and no DOM
// beyond Blob/Response/CompressionStream/DecompressionStream.

export async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as unknown as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
