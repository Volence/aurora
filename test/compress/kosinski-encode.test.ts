import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  kosinskiCompress, kosinskiDecompress,
  kosinskiModuledCompress, kosinskiModuledDecompress,
} from '../../src/core/formats/kosinski';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../fixtures/kosinski/${n}`, import.meta.url)));

function roundTrips(raw: Uint8Array) {
  expect(Array.from(kosinskiDecompress(kosinskiCompress(raw)))).toEqual(Array.from(raw));
}
function moduledRoundTrips(raw: Uint8Array) {
  expect(Array.from(kosinskiModuledDecompress(kosinskiModuledCompress(raw)))).toEqual(Array.from(raw));
}

describe('kosinskiCompress round-trips through kosinskiDecompress', () => {
  it('empty', () => roundTrips(new Uint8Array(0)));
  it('single byte', () => roundTrips(new Uint8Array([0x42])));
  it('a run of identical bytes (long match)', () => roundTrips(new Uint8Array(500).fill(0xAB)));
  it('real decompressed S&K art (Mushmeanie, 480 B)', () => roundTrips(fx('mushmeanie.unc')));
  it('a larger blob (9000 B)', () => roundTrips(fx('multi.unc')));
  it('pseudo-random data (mostly literals)', () => {
    const t = new Uint8Array(2000);
    let s = 0x1234;
    for (let i = 0; i < t.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; t[i] = (s >> 16) & 0xff; }
    roundTrips(t);
  });
  it('actually compresses a repetitive blob', () => {
    const raw = new Uint8Array(1024).fill(0x77);
    expect(kosinskiCompress(raw).length).toBeLessThan(raw.length);
  });
});

describe('kosinskiModuledCompress round-trips through kosinskiModuledDecompress', () => {
  it('real Mushmeanie art (single module)', () => moduledRoundTrips(fx('mushmeanie.unc')));
  it('a multi-module blob (9000 B → 3 modules)', () => moduledRoundTrips(fx('multi.unc')));
  it('a blob exactly one module (0x1000 B)', () => moduledRoundTrips(new Uint8Array(0x1000).fill(5)));
  it('a blob just over one module (0x1001 B)', () => moduledRoundTrips(new Uint8Array(0x1001).fill(9)));
});
