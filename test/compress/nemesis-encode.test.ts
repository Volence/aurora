import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { nemesisCompress, nemesisDecompress } from '../../src/core/compress/nemesis';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../fixtures/nemesis/${n}`, import.meta.url)));

function roundTrips(raw: Uint8Array) {
  const back = nemesisDecompress(nemesisCompress(raw));
  expect(Array.from(back)).toEqual(Array.from(raw));
}

describe('nemesisCompress round-trips through nemesisDecompress', () => {
  it('real Sega art (plain fixture)', () => roundTrips(fx('sample.raw')));
  it('real Sega art (xor fixture)', () => roundTrips(fx('xor.raw')));
  it('a solid single-nibble tile (max runs)', () => roundTrips(new Uint8Array(32).fill(0x77)));
  it('all-zero tiles', () => roundTrips(new Uint8Array(64)));
  it('every nibble value present', () => {
    const t = new Uint8Array(32);
    for (let i = 0; i < 32; i++) t[i] = ((i % 16) << 4) | ((i + 1) % 16);
    roundTrips(t);
  });
  it('pseudo-random tiles (no real runs, forces inline)', () => {
    const t = new Uint8Array(32 * 4);
    let s = 12345;
    for (let i = 0; i < t.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; t[i] = (s >> 16) & 0xff; }
    roundTrips(t);
  });
  it('rejects non-multiple-of-32 input', () => {
    expect(() => nemesisCompress(new Uint8Array(31))).toThrow(/multiple of 32/);
  });
});
