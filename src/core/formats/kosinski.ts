const SLIDING_WINDOW_SIZE = 0x2000;

export function kosinskiDecompress(input: Uint8Array): Uint8Array {
  const output: number[] = [];
  const window = new Uint8Array(SLIDING_WINDOW_SIZE);
  let readPos = 0;
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

  return new Uint8Array(output);
}
