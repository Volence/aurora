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

// ─── Encoder ───────────────────────────────────────────────────────────────
// Produces a valid Nemesis stream (plain mode, no XOR) that our decoder — and the
// games — read back identically. NOT byte-identical to Sega's compressor (that's
// the Fano "accurate" path); correctness is guaranteed by decode(encode(x)) === x.
// Uses length-limited (≤8-bit) canonical Huffman over (nibble,runLength) symbols,
// inlining symbols that don't fit, and skips any code whose top 6 bits = 0x3F (the
// reserved inline escape).

interface NemRun { value: number; length: number; }

/** Split raw 4bpp bytes into (nibble value, run length 1..8) runs, high-nibble first. */
export function nemesisExtractRuns(input: Uint8Array): NemRun[] {
  const runs: NemRun[] = [];
  let prev = -1;
  let len = 0;
  const push = () => { if (len > 0) runs.push({ value: prev, length: len }); };
  for (let i = 0; i < input.length; i++) {
    const hi = input[i] >> 4;
    const lo = input[i] & 0x0f;
    for (const nyb of [hi, lo]) {
      if (nyb === prev && len < 8) { len++; }
      else { push(); prev = nyb; len = 1; }
    }
  }
  push();
  return runs;
}

const SYM = (value: number, length: number) => value * 8 + (length - 1); // 0..127

/** Huffman code lengths for the given symbols (by frequency). Returns symbol→bitLength. */
function huffmanLengths(freq: number[], symbols: number[]): Map<number, number> {
  const lengths = new Map<number, number>();
  if (symbols.length === 0) return lengths;
  if (symbols.length === 1) { lengths.set(symbols[0], 1); return lengths; }
  for (const s of symbols) lengths.set(s, 0);
  let nodes = symbols.map((s) => ({ freq: freq[s], leaves: [s] }));
  while (nodes.length > 1) {
    nodes.sort((a, b) => a.freq - b.freq);
    const a = nodes.shift()!;
    const b = nodes.shift()!;
    for (const s of a.leaves) lengths.set(s, lengths.get(s)! + 1);
    for (const s of b.leaves) lengths.set(s, lengths.get(s)! + 1);
    nodes.push({ freq: a.freq + b.freq, leaves: [...a.leaves, ...b.leaves] });
  }
  return lengths;
}

interface NemCode { bits: number; code: number; }

/** Build canonical codes ≤8 bits, dropping rarest symbols (→ inline) until they fit and
 *  no code collides with the reserved 0x3F inline escape. */
function buildCodes(freq: number[], present: number[]): Map<number, NemCode> {
  let coded = present.slice();
  for (;;) {
    const lengths = huffmanLengths(freq, coded);
    const ok = assignCanonical(lengths);
    if (ok) return ok;
    if (coded.length <= 1) return new Map(); // give up → all inline
    coded.sort((a, b) => freq[a] - freq[b]);
    coded.shift(); // drop the rarest, inline it, retry
  }
}

/** Assign canonical codes; returns null if it can't fit ≤8 bits without overflow. */
function assignCanonical(lengths: Map<number, number>): Map<number, NemCode> | null {
  const syms = [...lengths.keys()].sort((a, b) => (lengths.get(a)! - lengths.get(b)!) || (a - b));
  if (syms.some((s) => lengths.get(s)! > 8)) return null;
  const out = new Map<number, NemCode>();
  let code = 0;
  let prevLen = 0;
  for (const s of syms) {
    const len = lengths.get(s)!;
    code <<= (len - prevLen);
    // The whole "111111" branch is reserved for the inline escape, so no code may be a
    // prefix of it (all-ones, len≤6) nor have it as a prefix (top-6-bits = 0x3F, len>6).
    if (len <= 6 && code === (1 << len) - 1) return null;        // all-ones prefix → drop a symbol & retry
    if (len > 6 && (code >> (len - 6)) === 0x3f) code = 0x40 << (len - 6); // jump past the block
    if (code >= (1 << len)) return null; // overflowed codespace → caller drops a symbol
    out.set(s, { bits: len, code });
    code++;
    prevLen = len;
  }
  return out;
}

/** Compress raw 4bpp tile bytes (length must be a multiple of 32) into a Nemesis stream. */
export function nemesisCompress(input: Uint8Array): Uint8Array {
  if (input.length % 32 !== 0) throw new NemesisError('Nemesis input length must be a multiple of 32');
  const tileCount = input.length / 32;

  const runs = nemesisExtractRuns(input);
  const freq = new Array(128).fill(0);
  for (const r of runs) freq[SYM(r.value, r.length)]++;
  const present = freq.map((f, i) => (f > 0 ? i : -1)).filter((i) => i >= 0);
  const codes = buildCodes(freq, present);

  const out: number[] = [];
  out.push((tileCount >> 8) & 0x7f, tileCount & 0xff); // header, plain mode (bit15 = 0)

  // Code table: grouped by nibble value, ascending; each = 0x80|nibble marker (once),
  // then (runLen-1)<<4 | codeBits, then the code byte (left-aligned in 8 bits).
  const entries = [...codes.entries()].map(([sym, c]) => ({ value: (sym / 8) | 0, length: (sym % 8) + 1, c }))
    .sort((a, b) => (a.value - b.value) || (a.length - b.length));
  let lastNibble = -1;
  for (const e of entries) {
    if (e.value !== lastNibble) { out.push(0x80 | e.value); lastNibble = e.value; }
    out.push(((e.length - 1) << 4) | e.c.bits);
    out.push(e.c.code & 0xff); // right-aligned code value; the decoder left-aligns via code<<(8-bits)
  }
  out.push(0xff); // end of table

  // Bitstream (MSB-first): each run → its code, or the 0x3F inline escape (6+3+4 bits).
  let bitBuf = 0;
  let bitCnt = 0;
  const writeBits = (val: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) {
      bitBuf = (bitBuf << 1) | ((val >> i) & 1);
      if (++bitCnt === 8) { out.push(bitBuf & 0xff); bitBuf = 0; bitCnt = 0; }
    }
  };
  for (const r of runs) {
    const c = codes.get(SYM(r.value, r.length));
    if (c) writeBits(c.code, c.bits);
    else { writeBits(0x3f, 6); writeBits(r.length - 1, 3); writeBits(r.value, 4); }
  }
  if (bitCnt > 0) out.push((bitBuf << (8 - bitCnt)) & 0xff); // flush final partial byte

  return new Uint8Array(out);
}
