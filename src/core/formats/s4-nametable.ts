export function parseNametable(data: Uint8Array, width: number, height: number): Uint16Array {
  const count = width * height;
  const nt = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * 2;
    nt[i] = (data[offset] << 8) | data[offset + 1];
  }
  return nt;
}

export function serializeNametable(nametable: Uint16Array): Uint8Array {
  const data = new Uint8Array(nametable.length * 2);
  for (let i = 0; i < nametable.length; i++) {
    const word = nametable[i];
    data[i * 2] = (word >> 8) & 0xFF;
    data[i * 2 + 1] = word & 0xFF;
  }
  return data;
}
