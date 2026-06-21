// src/core/formats/s4-collattr.ts
// Editable collision attr plane — its own file format so it never collides with
// the legacy crude .coll.bin. Each cell is a 16-bit BIG-ENDIAN packed collision
// cell word (see collision-cell-word.ts): shape | X/Y-flip | per-plane solidity.
// Big-endian matches the 68k chunk-entry word order the engine bake consumes.
export function parseCollAttr(data: Uint8Array): Uint16Array {
  const n = data.length >> 1;
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) out[i] = ((data[i * 2] << 8) | data[i * 2 + 1]) & 0xFFFF;
  return out;
}
export function serializeCollAttr(words: Uint16Array): Uint8Array {
  const out = new Uint8Array(words.length * 2);
  for (let i = 0; i < words.length; i++) {
    out[i * 2] = (words[i] >> 8) & 0xFF;
    out[i * 2 + 1] = words[i] & 0xFF;
  }
  return out;
}
