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

/**
 * Code lengths for the given symbols, OPTIMAL SUBJECT TO A MAXIMUM LENGTH
 * (package-merge, Larmore & Hirschberg).
 *
 * Nemesis codes are at most 8 bits. The obvious approach — build an unbounded
 * Huffman tree and, when something exceeds 8 bits, drop the rarest symbol and
 * retry — is what this replaces, and it was expensive in a way that is easy to
 * miss: a dropped symbol is not merely coded worse, it is written INLINE at
 * 6 (escape) + 3 (run length) + 4 (nibble) = 13 bits, against 4 bits for the
 * raw nibble it stands for. On varied art enough symbols got dropped that the
 * "compressed" stream was larger than the uncompressed tiles.
 *
 * Package-merge instead finds the best assignment that already respects the
 * limit, so nothing has to be dropped: with at most 128 symbols and 8-bit
 * codes the codespace (256) is never the binding constraint.
 *
 * The algorithm, briefly: build L levels of "packages". At each level, take the
 * original symbols plus the pairwise merges of the previous level, sorted by
 * weight. After L levels, the cheapest 2n-2 items are the optimal solution, and
 * a symbol's code length is the number of those items that contain it.
 */
function huffmanLengths(freq: number[], symbols: number[], maxLen = 8): Map<number, number> {
  const lengths = new Map<number, number>();
  if (symbols.length === 0) return lengths;
  if (symbols.length === 1) { lengths.set(symbols[0], 1); return lengths; }

  const n = symbols.length;
  const sorted = symbols.map((s) => ({ w: freq[s], syms: [s] })).sort((a, b) => a.w - b.w);
  let level: { w: number; syms: number[] }[] = [];
  for (let d = 0; d < maxLen; d++) {
    const packaged: { w: number; syms: number[] }[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      packaged.push({ w: level[i].w + level[i + 1].w, syms: [...level[i].syms, ...level[i + 1].syms] });
    }
    level = [...sorted.map((s) => ({ w: s.w, syms: s.syms })), ...packaged]
      .sort((a, b) => a.w - b.w);
  }
  for (const s of symbols) lengths.set(s, 0);
  for (const item of level.slice(0, 2 * n - 2)) {
    for (const sym of item.syms) lengths.set(sym, lengths.get(sym)! + 1);
  }
  // A symbol the solution never touched would have length 0, which is not a
  // code. It cannot happen for 2n-2 items over n symbols, but a 0 here would
  // silently produce a zero-bit code, so it is folded to 1 rather than trusted.
  for (const s of symbols) if (lengths.get(s)! < 1) lengths.set(s, 1);
  return lengths;
}

interface NemCode { bits: number; code: number; }

/**
 * The inline escape's share of the codespace.
 *
 * Measuring every code in 8-bit units, the whole codespace is 256. The escape
 * is the 6-bit code `111111`, which owns the four units 0xFC..0xFF — and so does
 * every longer code whose top six bits are `111111`, which is the same region.
 * Reserving those four units up front is what lets canonical assignment run
 * straight through without ever colliding with the escape.
 */
const ESCAPE_UNITS = 4;
const CODESPACE_UNITS = 256;

/**
 * Build canonical codes ≤8 bits for every present symbol.
 *
 * THIS NO LONGER DROPS SYMBOLS. The previous version assigned codes first and
 * rejected the whole assignment whenever one collided with the escape branch,
 * whereupon the caller dropped the rarest symbol to inline and retried — over
 * and over. Since canonical codes ascend, an all-ones code at a short length is
 * common, so this fired constantly and inlined most of the alphabet at 13 bits
 * per run against 4 bits for a raw nibble. That, not the Huffman itself, is why
 * re-encoded art came out larger than uncompressed.
 *
 * Reserving the escape's four units BEFORE assigning means the top of the
 * codespace is simply never reached, so no collision is possible and every
 * symbol keeps a code.
 */
function buildCodes(freq: number[], present: number[]): Map<number, NemCode> {
  if (present.length === 0) return new Map();
  const lengths = huffmanLengths(freq, present);
  if (!fitCodespace(lengths, freq)) return new Map(); // pathological → all inline
  return assignCanonical(lengths);
}

/**
 * Lengthen codes until they fit the codespace left over after the escape.
 *
 * Package-merge produces a complete code, whose Kraft sum is the full 256 units
 * — four too many once the escape is reserved. Freeing them costs one bit on
 * the least frequent symbol (halving its share), repeated until it fits, which
 * is the cheapest place to take it from.
 */
function fitCodespace(lengths: Map<number, number>, freq: number[]): boolean {
  const kraft = () => [...lengths.values()]
    .reduce((n, l) => n + (1 << (8 - l)), 0);
  const limit = CODESPACE_UNITS - ESCAPE_UNITS;
  // Bounded rather than `while (true)`: each step strictly reduces the Kraft
  // sum or exits, but a guard makes "cannot fit" a return value instead of a
  // hang if that reasoning is ever wrong.
  for (let guard = 0; kraft() > limit && guard < 4096; guard++) {
    let victim = -1;
    for (const [s, l] of lengths) {
      if (l >= 8) continue;
      if (victim < 0 || freq[s] < freq[victim]) victim = s;
    }
    if (victim < 0) return false; // everything is already 8 bits and it still does not fit
    lengths.set(victim, lengths.get(victim)! + 1);
  }
  return kraft() <= limit;
}

/**
 * Assign canonical codes, shortest first, ascending.
 *
 * No escape handling here by design: `fitCodespace` has already guaranteed the
 * assignment stops short of the reserved region at the top, so the two special
 * cases this used to carry — and the rejection path they drove — are gone.
 */
function assignCanonical(lengths: Map<number, number>): Map<number, NemCode> {
  const syms = [...lengths.keys()].sort((a, b) => (lengths.get(a)! - lengths.get(b)!) || (a - b));
  const out = new Map<number, NemCode>();
  let code = 0;
  let prevLen = 0;
  for (const s of syms) {
    const len = lengths.get(s)!;
    code <<= (len - prevLen);
    out.set(s, { bits: len, code });
    code++;
    prevLen = len;
  }
  return out;
}

/**
 * Row-wise XOR delta, the transform behind Nemesis' XOR mode.
 *
 * A Nemesis row is 8 pixels = 4 bytes, and the decoder reconstructs it as
 * `row_i = stream_i ^ row_{i-1}` (see `outputNybble`). So to ENCODE in XOR mode
 * the stream must carry `row_i ^ row_{i-1}`, which for vertically coherent art
 * — nearly all tile art — is mostly zero and collapses into long runs.
 *
 * THE CHAIN RUNS ACROSS TILES, not per tile: the decoder never resets `prevRow`
 * at a tile boundary, so neither does this. Resetting here would decode as
 * garbage from the second tile onward.
 */
function xorDelta(input: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length);
  let prev = 0;
  for (let i = 0; i + 4 <= input.length; i += 4) {
    const row = ((input[i] << 24) | (input[i + 1] << 16) | (input[i + 2] << 8) | input[i + 3]) >>> 0;
    const d = (row ^ prev) >>> 0;
    out[i] = (d >>> 24) & 0xff;
    out[i + 1] = (d >>> 16) & 0xff;
    out[i + 2] = (d >>> 8) & 0xff;
    out[i + 3] = d & 0xff;
    prev = row;
  }
  return out;
}

/**
 * Compress raw 4bpp tile bytes (length must be a multiple of 32) into a Nemesis
 * stream.
 *
 * BOTH MODES ARE TRIED AND THE SMALLER WINS. Plain mode alone made every
 * re-encode of stock art ~2.5x larger than the original (measured: +100,851
 * bytes across Sonic 1's seven zone files) and, for varied art, larger than
 * storing it uncompressed — once the (nibble, run-length) alphabet outgrows
 * 8-bit codes, `buildCodes` starts inlining the rarest symbols at 13 bits each
 * against 4 bits raw. All seven stock files are XOR mode for exactly this
 * reason. Trying both is what makes this strictly better than what it replaced
 * rather than better on average.
 */
export function nemesisCompress(input: Uint8Array): Uint8Array {
  const plain = encodeNemesis(input, false);
  const xor = encodeNemesis(xorDelta(input), true);
  return xor.length < plain.length ? xor : plain;
}

/** The plain-mode encoding, exposed so a test can pin the "never larger than
 *  plain" guarantee against the real alternative rather than a remembered one. */
export function nemesisCompressPlainForTest(input: Uint8Array): Uint8Array {
  return encodeNemesis(input, false);
}

/** One encoding pass. `stream` is already in the form the decoder's nibble
 *  pipeline consumes — raw bytes for plain mode, the XOR delta for XOR mode. */
function encodeNemesis(stream: Uint8Array, xorMode: boolean): Uint8Array {
  const input = stream;
  if (input.length % 32 !== 0) throw new NemesisError('Nemesis input length must be a multiple of 32');
  const tileCount = input.length / 32;

  const runs = nemesisExtractRuns(input);
  const freq = new Array(128).fill(0);
  for (const r of runs) freq[SYM(r.value, r.length)]++;
  const present = freq.map((f, i) => (f > 0 ? i : -1)).filter((i) => i >= 0);
  const codes = buildCodes(freq, present);

  const out: number[] = [];
  // Header: bit 15 = XOR mode, bits 14-0 = tile count.
  out.push(((tileCount >> 8) & 0x7f) | (xorMode ? 0x80 : 0), tileCount & 0xff);

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
