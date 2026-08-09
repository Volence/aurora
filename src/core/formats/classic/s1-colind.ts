// Sonic 1 collision index ("colind") — a flat table mapping block (map16) id to
// a collision-shape index (0..255) in the collision array. Uncompressed in the
// disasm, one byte per block. SonLVLAPI keeps it as a plain List<byte>
// (LevelData.ColInds1); Aurora mirrors that with a copy-in/copy-out Uint8Array
// wrapper so the model never aliases the source buffer.

export type S1ColInd = Uint8Array;

export function decodeS1ColInd(b: Uint8Array): S1ColInd {
  return b.slice();
}

export function encodeS1ColInd(c: S1ColInd): Uint8Array {
  return c.slice();
}
