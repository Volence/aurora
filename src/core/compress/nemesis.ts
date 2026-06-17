export class NemesisError extends Error {
  constructor(message: string) { super(message); this.name = 'NemesisError'; }
}

export interface NemesisHeader {
  xorMode: boolean;
  tileCount: number;
}

/** Parse the 2-byte big-endian Nemesis header: bit15 = XOR mode, bits14-0 = tile count. */
export function nemesisHeader(input: Uint8Array): NemesisHeader {
  if (input.length < 2) throw new NemesisError('Nemesis input too short for a header');
  const word = (input[0] << 8) | input[1];
  return { xorMode: (word & 0x8000) !== 0, tileCount: word & 0x7fff };
}

/**
 * Decompress Nemesis-compressed art to raw 4bpp tile bytes (tileCount * 32 bytes).
 * Faithful port of clownnemesis/decompress.c.
 */
export function nemesisDecompress(input: Uint8Array): Uint8Array {
  const { xorMode, tileCount } = nemesisHeader(input);
  let pos = 2; // header consumed
  // Truncated/corrupt streams must fail loudly, never hang (clownnemesis errors too).
  const readByte = (): number => {
    if (pos >= input.length) throw new NemesisError('Unexpected end of Nemesis data');
    return input[pos++];
  };

  const tValue = new Int16Array(256).fill(-1);
  const tLength = new Uint8Array(256);
  const tBits = new Uint8Array(256);
  let nybbleValue = 0;
  let b = readByte();
  while (b !== 0xff) {
    if ((b & 0x80) !== 0) { nybbleValue = b & 0x0f; b = readByte(); continue; }
    const runLength = ((b >> 4) & 7) + 1;
    const codeBits = b & 0x0f;
    const code = readByte();
    const idx = (code << (8 - codeBits)) & 0xff;
    tValue[idx] = nybbleValue;
    tLength[idx] = runLength;
    tBits[idx] = codeBits;
    b = readByte();
  }

  let bitBuffer = 0;
  let bitsAvailable = 0;
  const popBit = (): number => {
    bitBuffer = (bitBuffer << 1) & 0xff;
    if (bitsAvailable === 0) { bitsAvailable = 8; bitBuffer = readByte(); }
    bitsAvailable--;
    return (bitBuffer & 0x80) !== 0 ? 1 : 0;
  };
  const popBits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | popBit();
    return v;
  };

  const out = new Uint8Array(tileCount * 32);
  let outPos = 0;
  let rowBuffer = 0;
  let nybblesDone = 0;
  let prevRow = 0;
  const outputNybble = (nyb: number): void => {
    rowBuffer = ((rowBuffer << 4) | nyb) >>> 0;
    if ((++nybblesDone & 7) === 0) {
      const finalRow = (rowBuffer ^ (xorMode ? prevRow : 0)) >>> 0;
      out[outPos++] = (finalRow >>> 24) & 0xff;
      out[outPos++] = (finalRow >>> 16) & 0xff;
      out[outPos++] = (finalRow >>> 8) & 0xff;
      out[outPos++] = finalRow & 0xff;
      prevRow = finalRow;
    }
  };

  const totalNybbles = tileCount * 64;
  let produced = 0;
  while (produced < totalNybbles) {
    let code = 0;
    let bits = 0;
    let matchIdx = -1;
    let inline = false;
    for (;;) {
      if (bits === 8) break;
      code = ((code << 1) | popBit()) & 0xff;
      bits++;
      if (bits === 6 && code === 0x3f) { inline = true; break; }
      const idx = (code << (8 - bits)) & 0xff;
      if (tValue[idx] >= 0 && tBits[idx] === bits) { matchIdx = idx; break; }
    }
    let value: number;
    let runLength: number;
    if (inline) { runLength = popBits(3) + 1; value = popBits(4); }
    else if (matchIdx >= 0) { value = tValue[matchIdx]; runLength = tLength[matchIdx]; }
    else break;
    for (let i = 0; i < runLength && produced < totalNybbles; i++) { outputNybble(value); produced++; }
  }
  return out;
}
