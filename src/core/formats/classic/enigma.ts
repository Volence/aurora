export class EnigmaError extends Error {
  constructor(message: string) { super(message); this.name = 'EnigmaError'; }
}

// Enigma is Sonic 1's compression for 16x16 block ("map16") definitions — a
// bitstream of big-endian words. Ported from ClownLZSS's enigma.h (the same
// algorithm KensSharp/SonLVL use). The stream is a 6-byte header followed by
// packets selected by a 3-bit action code:
//   0 incremental copy   1 literal copy   2 inline same   3 inline increment
//   4 inline decrement   5 raw copy (each word carried inline)
// Bits are read MSB-first, one byte at a time.

/**
 * Decompress an Enigma stream into big-endian 16-bit words.
 * Faithful port of ClownLZSS's Enigma::Decompress.
 */
export function enigmaDecompress(input: Uint8Array): Uint8Array {
  if (input.length < 6) throw new EnigmaError('Enigma input too short for a header');

  let pos = 0;
  const readByte = (): number => {
    if (pos >= input.length) throw new EnigmaError('Unexpected end of Enigma data');
    return input[pos++];
  };

  const totalInlineBits = readByte();     // width of the inline tile-index field
  const renderFlagsMask = readByte();     // which of the top 5 word bits are stored inline
  let incrementalCopyWord = (readByte() << 8) | readByte();
  const literalCopyWord = (readByte() << 8) | readByte();

  // MSB-first bit reader, one byte at a time.
  let bitBuffer = 0;
  let bitsRemaining = 0;
  const popBit = (): number => {
    if (bitsRemaining === 0) { bitBuffer = readByte(); bitsRemaining = 8; }
    const bit = (bitBuffer & 0x80) !== 0 ? 1 : 0;
    bitBuffer = (bitBuffer << 1) & 0xff;
    bitsRemaining--;
    return bit;
  };
  const popBits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | popBit();
    return v;
  };

  // Reconstruct a full 16-bit word: the masked render-flag bits (top 5) followed
  // by the low `totalInlineBits` tile-index bits.
  const getInlineValue = (): number => {
    let renderFlags = 0;
    for (let i = 0; i < 5; i++) {
      const bitIndex = 4 - i;
      renderFlags <<= 1;
      if ((renderFlagsMask & (1 << bitIndex)) !== 0) renderFlags |= popBit();
    }
    renderFlags <<= 3 + 8; // shift into the top 5 bits of the word
    return (renderFlags | popBits(totalInlineBits)) & 0xffff;
  };

  const out: number[] = [];
  const writeWord = (w: number): void => { out.push((w >> 8) & 0xff, w & 0xff); };

  for (;;) {
    const action = popBit() ? 2 + popBits(2) : popBit();
    const count = popBits(4) + 1;

    if (count === 0x10 && action === 5) break; // terminator: 1111111

    switch (action) {
      case 0:
        for (let i = 0; i < count; i++) { writeWord(incrementalCopyWord); incrementalCopyWord++; }
        break;
      case 1:
        for (let i = 0; i < count; i++) writeWord(literalCopyWord);
        break;
      case 2: {
        const value = getInlineValue();
        for (let i = 0; i < count; i++) writeWord(value);
        break;
      }
      case 3: {
        let value = getInlineValue();
        for (let i = 0; i < count; i++) { writeWord(value & 0xffff); value++; }
        break;
      }
      case 4: {
        let value = getInlineValue();
        for (let i = 0; i < count; i++) { writeWord(value & 0xffff); value--; }
        break;
      }
      case 5:
        for (let i = 0; i < count; i++) writeWord(getInlineValue());
        break;
    }
  }

  return new Uint8Array(out);
}

// ─── Encoder ─────────────────────────────────────────────────────────────────
// Emits a valid Enigma stream that our decoder — and the games — read back
// identically. Deliberately simple: every word is carried in a raw-copy packet
// (action 5) with all 16 bits inline, so no analysis of runs or special words is
// needed. NOT byte-identical to Sega's compressor; correctness is guaranteed by
// enigmaDecompress(enigmaCompress(x)) === x.

// Full-width inline values: mask = top 5 bits, 11-bit tile index → all 16 bits.
const TOTAL_INLINE_BITS = 11;
const RENDER_FLAGS_MASK = 0x1f;
// Raw-copy count is 4 bits (+1); a count of 16 with action 5 is the terminator,
// so raw packets carry at most 15 words.
const MAX_RAW_RUN = 15;

/** Compress big-endian 16-bit words into an Enigma stream. `input.length` must be even. */
export function enigmaCompress(input: Uint8Array): Uint8Array {
  if (input.length % 2 !== 0) throw new EnigmaError('Enigma input length must be even');

  // Header: inline width, render-flag mask, then unused incremental/literal words.
  const out: number[] = [TOTAL_INLINE_BITS, RENDER_FLAGS_MASK, 0, 0, 0, 0];

  // MSB-first bit writer, one byte at a time.
  let bitBuffer = 0;
  let bitCount = 0;
  const pushBit = (bit: number): void => {
    bitBuffer = (bitBuffer << 1) | (bit & 1);
    if (++bitCount === 8) { out.push(bitBuffer & 0xff); bitBuffer = 0; bitCount = 0; }
  };
  const pushBits = (value: number, n: number): void => {
    for (let i = n - 1; i >= 0; i--) pushBit((value >> i) & 1);
  };
  const writeInlineValue = (word: number): void => {
    for (let i = 0; i < 5; i++) pushBit((word >> (15 - i)) & 1); // top 5 bits (mask 0x1F)
    pushBits(word & 0x7ff, TOTAL_INLINE_BITS);                   // low 11 tile-index bits
  };

  const wordCount = input.length / 2;
  let i = 0;
  while (i < wordCount) {
    const runLen = Math.min(MAX_RAW_RUN, wordCount - i);
    pushBits(7, 3);          // action 5 (raw copy)
    pushBits(runLen - 1, 4); // count - 1
    for (let j = 0; j < runLen; j++) {
      const word = (input[(i + j) * 2] << 8) | input[(i + j) * 2 + 1];
      writeInlineValue(word);
    }
    i += runLen;
  }

  // Terminator: action 5, count 16 → bits 1111111.
  pushBits(7, 3);
  pushBits(0xf, 4);

  // Flush the final partial byte (left-aligned, MSB-first).
  if (bitCount > 0) out.push((bitBuffer << (8 - bitCount)) & 0xff);

  // The reference compressor pads its output to an even byte count.
  if (out.length % 2 !== 0) out.push(0);

  return new Uint8Array(out);
}
