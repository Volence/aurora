import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { compressionFor } from '../../src/core/compress/index';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../fixtures/nemesis/${n}`, import.meta.url)));

describe('compressionFor', () => {
  it('nemesis round-trips through the registry', () => {
    const raw = fx('sample.raw');
    const codec = compressionFor('nemesis');
    expect(Array.from(codec.decompress(codec.compress(raw)))).toEqual(Array.from(raw));
  });
  it('nemesis decompress reads real Sega .nem', () => {
    expect(compressionFor('nemesis').decompress(fx('sample.nem')).length).toBe(320);
  });
  it('uncompressed is identity (copied, not aliased)', () => {
    const x = new Uint8Array([1, 2, 3]);
    const c = compressionFor('uncompressed');
    const out = c.compress(x);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(out).not.toBe(x);
    expect(Array.from(c.decompress(out))).toEqual([1, 2, 3]);
  });
  it('kosinski + kosinski-moduled round-trip through the registry', () => {
    const raw = new Uint8Array([1, 2, 3, 3, 3, 3, 4, 5, 1, 2, 3, 3, 3, 3, 4, 5]);
    for (const kind of ['kosinski', 'kosinski-moduled'] as const) {
      const c = compressionFor(kind);
      expect(Array.from(c.decompress(c.compress(raw)))).toEqual(Array.from(raw));
    }
  });
});
