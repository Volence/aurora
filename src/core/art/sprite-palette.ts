import type { Color, PaletteLine } from '../model/s4-types';

/** How a sprite is colored: bound to a zone CRAM line, or its own private palette. */
export type SpritePaletteMode = 'zone' | 'standalone';

/** A fresh 16-color standalone palette: index 0 transparent, 1-15 opaque black. */
export function blankStandalonePalette(): Color[] {
  return Array.from({ length: 16 }, (_, i) => ({ r: 0, g: 0, b: 0, a: i === 0 ? 0 : 255 }));
}

/**
 * The colors a sprite renders against: the bound zone line (zone mode) or the
 * sprite's own palette (standalone). Returns [] if a zone line is out of range.
 */
export function resolveDisplayPalette(
  mode: SpritePaletteMode, zoneLine: number, standalonePalette: Color[], zoneLines: PaletteLine[],
): Color[] {
  if (mode === 'standalone') return standalonePalette;
  return zoneLines[zoneLine]?.colors ?? [];
}
