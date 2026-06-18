import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { kosinskiModuledDecompress } from '../../src/core/formats/kosinski';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../fixtures/kosinski/${n}`, import.meta.url)));

describe('kosinskiModuledDecompress', () => {
  it('decodes real S&K art (Mushmeanie, single module) byte-for-byte', () => {
    const out = kosinskiModuledDecompress(fx('mushmeanie.kosm'));
    expect(out.length).toBe(480); // header word 0x01e0 = 480 bytes = 15 tiles
    expect(Array.from(out)).toEqual(Array.from(fx('mushmeanie.unc')));
  });

  it('decodes a MULTI-MODULE stream (3 modules, exercises 0x10 padding) byte-for-byte', () => {
    const out = kosinskiModuledDecompress(fx('multi.kosm'));
    expect(out.length).toBe(9000);
    expect(Array.from(out)).toEqual(Array.from(fx('multi.unc')));
  });

  it('returns empty for too-short input', () => {
    expect(kosinskiModuledDecompress(new Uint8Array([0]))).toEqual(new Uint8Array(0));
  });
});
