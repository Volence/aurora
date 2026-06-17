import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { nemesisHeader, nemesisDecompress } from '../../src/core/compress/nemesis';

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
