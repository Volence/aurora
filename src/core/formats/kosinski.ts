const SLIDING_WINDOW_SIZE = 0x2000;

export function kosinskiDecompress(input: Uint8Array): Uint8Array {
  return kosinskiDecompressFrom(input, 0).output;
}

/**
 * Decompress one Kosinski stream starting at `startOffset`, returning the output
 * plus `endOffset` (the input index just past the stream's terminator). The
 * endOffset is needed by the Moduled variant to align to the next module.
 */
export function kosinskiDecompressFrom(input: Uint8Array, startOffset = 0): { output: Uint8Array; endOffset: number } {
  const output: number[] = [];
  const window = new Uint8Array(SLIDING_WINDOW_SIZE);
  let readPos = startOffset;
  let writePos = 0;
  let descriptor = 0;
  let bitsRemaining = 0;

  function readByte(): number {
    if (readPos >= input.length) return 0;
    return input[readPos++];
  }

  function writeByte(byte: number): void {
    output.push(byte & 0xFF);
    window[writePos % SLIDING_WINDOW_SIZE] = byte & 0xFF;
    writePos++;
  }

  function getDescriptor(): void {
    const lo = readByte();
    const hi = readByte();
    descriptor = (hi << 8) | lo;
    bitsRemaining = 16;
  }

  function popDescriptor(): boolean {
    const result = (descriptor & 1) !== 0;
    descriptor >>= 1;
    if (--bitsRemaining === 0) getDescriptor();
    return result;
  }

  getDescriptor();

  for (;;) {
    if (popDescriptor()) {
      writeByte(readByte());
    } else {
      let distance: number;
      let count: number;

      if (popDescriptor()) {
        const lo = readByte();
        const hi = readByte();

        distance = ((hi & 0xF8) << 5) | lo;
        distance = (distance ^ 0x1FFF) + 1;
        count = hi & 7;

        if (count !== 0) {
          count += 2;
        } else {
          count = readByte() + 1;
          if (count === 1) break;
          if (count === 2) continue;
        }
      } else {
        count = 2;
        if (popDescriptor()) count += 2;
        if (popDescriptor()) count += 1;
        distance = (readByte() ^ 0xFF) + 1;
      }

      for (let i = 0; i < count; i++) {
        writeByte(window[(writePos - distance) % SLIDING_WINDOW_SIZE]);
      }
    }
  }

  return { output: new Uint8Array(output), endOffset: readPos };
}

/**
 * Decompress Kosinski-MODULED data (Sonic 3&K's most common sprite-art format).
 * Layout (verified vs accurate-kosinski/Clownacy): 2-byte big-endian total
 * decompressed size (the value 0xA000 is a sentinel for 0x8000), then a sequence
 * of plain Kosinski modules each decompressing to 0x1000 bytes (last = remainder);
 * after each module the compressed stream is padded to the next 0x10-byte boundary
 * (measured from just after the 2-byte header).
 */
/**
 * Greedy Kosinski compressor (ported from Clownacy's clownlzss bitstream emission).
 * Correct and round-trip-verified, but greedy — NOT byte-identical to Sega's
 * optimal output (sufficient for re-saving art the engine will decompress). Format:
 * a 16-bit LE descriptor field (refilled every 16 ops, LSB-first), where bit 1 =
 * literal byte, 0 0 = short match (len 2-5, dist ≤0x100), 0 1 = full match.
 */
export function kosinskiCompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let descPos = 0;
  let descBits = 0;
  let descValue = 0;

  function startDescriptor(): void { descPos = out.length; out.push(0, 0); descBits = 0; descValue = 0; }
  function flushDescriptor(): void { out[descPos] = descValue & 0xff; out[descPos + 1] = (descValue >> 8) & 0xff; }
  function pushBit(b: number): void {
    if (b) descValue |= 1 << descBits;
    if (++descBits === 16) { flushDescriptor(); startDescriptor(); }
  }

  startDescriptor();

  const MAX_DIST = 0x2000;
  const MAX_LEN = 0x100;
  let i = 0;
  while (i < input.length) {
    // Greedy longest match within the sliding window.
    let bestLen = 0;
    let bestDist = 0;
    const minStart = Math.max(0, i - MAX_DIST);
    for (let s = i - 1; s >= minStart; s--) {
      let len = 0;
      while (len < MAX_LEN && i + len < input.length && input[s + len] === input[i + len]) len++;
      if (len > bestLen) { bestLen = len; bestDist = i - s; if (len === MAX_LEN) break; }
    }

    const usable = bestLen >= 3 || (bestLen === 2 && bestDist <= 0x100);
    if (!usable) {
      pushBit(1);
      out.push(input[i]);
      i += 1;
      continue;
    }

    const length = bestLen;
    const offset = (0 - bestDist) & 0xffff;
    if (length <= 5 && bestDist <= 0x100) {
      pushBit(0); pushBit(0);
      pushBit((length - 2) & 2); pushBit((length - 2) & 1);
      out.push(offset & 0xff);
    } else if (length <= 9) {
      pushBit(0); pushBit(1);
      out.push(offset & 0xff);
      out.push(((offset >> 5) & 0xf8) | ((length - 2) & 7));
    } else {
      pushBit(0); pushBit(1);
      out.push(offset & 0xff);
      out.push((offset >> 5) & 0xf8);
      out.push((length - 1) & 0xff);
    }
    i += length;
  }

  // Terminator: full match with a zero length byte.
  pushBit(0); pushBit(1);
  out.push(0x00, 0xf0, 0x00);
  flushDescriptor();
  return new Uint8Array(out);
}

/** Kosinski-MODULED compressor: 2-byte BE total size + 0x1000-byte Kosinski modules
 *  each padded to a 0x10 boundary. Inverse of kosinskiModuledDecompress. */
export function kosinskiModuledCompress(input: Uint8Array): Uint8Array {
  const out: number[] = [input.length >> 8 & 0xff, input.length & 0xff];
  for (let i = 0; i < input.length || i === 0; i += 0x1000) {
    const module = kosinskiCompress(input.subarray(i, i + 0x1000));
    for (const b of module) out.push(b);
    while ((out.length - 2) % 0x10 !== 0) out.push(0); // align to next module
    if (input.length === 0) break;
  }
  return new Uint8Array(out);
}

export function kosinskiModuledDecompress(input: Uint8Array): Uint8Array {
  if (input.length < 2) return new Uint8Array(0);
  const rawSize = (input[0] << 8) | input[1];
  const size = rawSize === 0xa000 ? 0x8000 : rawSize;

  const out = new Uint8Array(size);
  let written = 0;
  let pos = 2;
  for (let i = 0; i < size; i += 0x1000) {
    const { output, endOffset } = kosinskiDecompressFrom(input, pos);
    out.set(output.subarray(0, Math.min(output.length, size - written)), written);
    written += output.length;
    pos = endOffset;
    while ((pos - 2) % 0x10 !== 0) pos++; // align to next module
  }
  return out;
}
