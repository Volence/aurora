import { describe, it, expect } from 'vitest';
import { snapColorToGenesis, copySwatchInto, copyLineInto } from '../../src/core/art/palette-copy';
import { encodeGenesisColor, decodeGenesisColor } from '../../src/core/formats/palette';
import type { Color } from '../../src/core/model/s4-types';

const C = (r: number, g: number, b: number, a = 255): Color => ({ r, g, b, a });
const line16 = (fill: Color): Color[] => Array.from({ length: 16 }, (_, i) => (i === 0 ? C(0, 0, 0, 0) : { ...fill }));

describe('snapColorToGenesis', () => {
  it('snaps a color to the 3-bit-per-channel Genesis gamut, preserving alpha', () => {
    const snapped = snapColorToGenesis(C(130, 200, 5, 200));
    expect(snapped).toEqual({ ...decodeGenesisColor(encodeGenesisColor(C(130, 200, 5))), a: 200 });
  });
  it('is idempotent (already-legal colors are unchanged)', () => {
    const legal = decodeGenesisColor(encodeGenesisColor(C(123, 45, 250)));
    expect(snapColorToGenesis(legal)).toEqual({ ...legal, a: 255 });
  });
});

describe('copySwatchInto', () => {
  it('replaces a single index with the snapped source color (opaque), returns a new array', () => {
    const dest = line16(C(10, 10, 10));
    const out = copySwatchInto(dest, 5, C(130, 200, 5, 50));
    expect(out).not.toBe(dest);
    expect(out[5]).toEqual({ ...decodeGenesisColor(encodeGenesisColor(C(130, 200, 5))), a: 255 });
    expect(out[4]).toEqual(dest[4]);     // others untouched
    expect(out[0]).toEqual(C(0, 0, 0, 0)); // index 0 stays transparent
  });
  it('refuses to write index 0 (transparent backdrop), returning an unchanged copy', () => {
    const dest = line16(C(10, 10, 10));
    const out = copySwatchInto(dest, 0, C(200, 200, 200));
    expect(out).not.toBe(dest);
    expect(out[0]).toEqual(C(0, 0, 0, 0));
  });
  it('refuses out-of-range indices, returning an unchanged copy', () => {
    const dest = line16(C(10, 10, 10));
    expect(copySwatchEq(copySwatchInto(dest, 16, C(1, 2, 3)), dest)).toBe(true);
    expect(copySwatchEq(copySwatchInto(dest, -1, C(1, 2, 3)), dest)).toBe(true);
  });
});

function copySwatchEq(a: Color[], b: Color[]): boolean {
  return a.length === b.length && a.every((c, i) => c.r === b[i].r && c.g === b[i].g && c.b === b[i].b && c.a === b[i].a);
}

describe('copyLineInto', () => {
  it('copies indices 1-15 snapped+opaque, preserves dest index 0', () => {
    const dest = line16(C(10, 10, 10));
    const src = line16(C(130, 200, 5));
    src[0] = C(99, 99, 99, 255); // a non-transparent src[0] must NOT leak into dest
    const out = copyLineInto(dest, src);
    expect(out[0]).toEqual(dest[0]); // dest backdrop preserved
    for (let i = 1; i < 16; i++) {
      expect(out[i]).toEqual({ ...decodeGenesisColor(encodeGenesisColor(C(130, 200, 5))), a: 255 });
    }
  });
});
