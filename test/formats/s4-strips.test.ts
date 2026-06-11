import { describe, it, expect } from 'vitest';
import { parseStrips, serializeStrips, STRIP_COLS, STRIP_ROWS } from '../../src/core/formats/s4-strips';

describe('s4-strips', () => {
  it('parses a minimal strip file correctly', () => {
    // Create a 256-strip file (256 * 128 = 32768 bytes)
    const data = new Uint8Array(256 * 128);

    // Set strip 0 (col 0), row 0: nametable word 0x1234
    data[0] = 0x12;
    data[1] = 0x34;

    // Set strip 0 (col 0), row 1: nametable word 0x5678
    data[2] = 0x56;
    data[3] = 0x78;

    // Set strip 1 (col 1), row 0: nametable word 0xABCD
    data[128] = 0xAB;
    data[129] = 0xCD;

    // Set strip 0, collision byte 0 (at offset 96): 0x31 = row0=3, row1=1
    data[96] = 0x31;

    const result = parseStrips(data);

    expect(result.width).toBe(STRIP_COLS);
    expect(result.height).toBe(STRIP_ROWS);

    // Row 0, col 0
    expect(result.nametable[0 * STRIP_COLS + 0]).toBe(0x1234);
    // Row 1, col 0
    expect(result.nametable[1 * STRIP_COLS + 0]).toBe(0x5678);
    // Row 0, col 1
    expect(result.nametable[0 * STRIP_COLS + 1]).toBe(0xABCD);

    // Collision: byte 0x31 → row0 high nibble = 3, row1 low nibble = 1
    expect(result.collision[0 * STRIP_COLS + 0]).toBe(3);
    expect(result.collision[1 * STRIP_COLS + 0]).toBe(1);
  });

  it('round-trips through serialize/parse', () => {
    const original = new Uint8Array(256 * 128);
    // Fill some data
    for (let col = 0; col < 256; col++) {
      for (let row = 0; row < 48; row++) {
        const off = col * 128 + row * 2;
        const word = (col + row) & 0xFFFF;
        original[off] = (word >> 8) & 0xFF;
        original[off + 1] = word & 0xFF;
      }
    }

    const parsed = parseStrips(original);
    const reserialized = serializeStrips(parsed);
    const reparsed = parseStrips(reserialized);

    expect(reparsed.nametable).toEqual(parsed.nametable);
    expect(reparsed.collision).toEqual(parsed.collision);
  });

  it('throws on undersized input', () => {
    const small = new Uint8Array(100);
    expect(() => parseStrips(small)).toThrow('Strip file too small');
  });
});
