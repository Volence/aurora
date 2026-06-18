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
