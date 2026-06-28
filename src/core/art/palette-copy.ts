import type { Color } from '../model/s4-types';
import { encodeGenesisColor, decodeGenesisColor } from '../formats/palette';

/** Snap a color to the Genesis 512-color gamut (3 bits/channel), preserving alpha. */
export function snapColorToGenesis(c: Color): Color {
  return { ...decodeGenesisColor(encodeGenesisColor(c)), a: c.a };
}

/**
 * Copy `src` into `dest[destIdx]`, snapped to Genesis and forced opaque. Index 0
 * (the transparent backdrop) and out-of-range indices are never written. Always
 * returns a fresh array (never mutates `dest`).
 */
export function copySwatchInto(dest: Color[], destIdx: number, src: Color): Color[] {
  const out = dest.map((c) => ({ ...c }));
  if (destIdx <= 0 || destIdx >= out.length) return out;
  out[destIdx] = { ...snapColorToGenesis(src), a: 255 };
  return out;
}

/**
 * Copy indices 1-15 of `src` into `dest`, snapped to Genesis and forced opaque.
 * `dest[0]` (the transparent backdrop) is preserved; `src[0]` is ignored. Returns
 * a fresh array.
 */
export function copyLineInto(dest: Color[], src: Color[]): Color[] {
  const out = dest.map((c) => ({ ...c }));
  for (let i = 1; i < out.length && i < src.length; i++) {
    out[i] = { ...snapColorToGenesis(src[i]), a: 255 };
  }
  return out;
}
