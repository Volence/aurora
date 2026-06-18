import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { nemesisHeader, nemesisDecompress, NemesisError } from '../../src/core/compress/nemesis';

const fx = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/nemesis/${name}`, import.meta.url)));

describe('nemesisHeader', () => {
  it('reads tile count + XOR flag (big-endian, bit15 = XOR)', () => {
    expect(nemesisHeader(fx('sample.nem'))).toEqual({ xorMode: false, tileCount: 10 });
    expect(nemesisHeader(fx('xor.nem'))).toEqual({ xorMode: true, tileCount: 8 });
  });
});

describe('nemesisDecompress', () => {
  it('decompresses a real plain-mode Sega .nem byte-for-byte', () => {
    const out = nemesisDecompress(fx('sample.nem'));
    expect(out.length).toBe(10 * 32);
    expect(Array.from(out)).toEqual(Array.from(fx('sample.raw')));
  });
  it('decompresses a real XOR-mode Sega .nem byte-for-byte', () => {
    const out = nemesisDecompress(fx('xor.nem'));
    expect(out.length).toBe(8 * 32);
    expect(Array.from(out)).toEqual(Array.from(fx('xor.raw')));
  });
});

describe('nemesisDecompress — robustness (no hang on bad input)', () => {
  it('throws on empty input instead of hanging', () => {
    expect(() => nemesisDecompress(new Uint8Array(0))).toThrow(NemesisError);
  });
  it('throws on a header-only / truncated-table input instead of hanging', () => {
    // valid-looking header (10 tiles, plain) but no code table / terminator
    expect(() => nemesisDecompress(new Uint8Array([0x00, 0x0a]))).toThrow(NemesisError);
  });
  it('nemesisHeader throws on a <2-byte buffer', () => {
    expect(() => nemesisHeader(new Uint8Array([0x00]))).toThrow(NemesisError);
  });
  it('decodes a valid zero-tile stream to empty output', () => {
    // header 0x0000 (0 tiles) + 0xFF table terminator
    expect(nemesisDecompress(new Uint8Array([0x00, 0x00, 0xff])).length).toBe(0);
  });
});
