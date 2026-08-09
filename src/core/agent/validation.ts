import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { NametableEntrySpec } from '../../shared/agent-protocol';

// All validators return null when valid, or a human-readable error string.

/** Genesis CRAM word: 0000 BBB0 GGG0 RRR0 — 9-bit color, even nibble values only. */
export function validateGenesisColor(word: number): string | null {
  if (!Number.isInteger(word) || word < 0 || word > 0xFFFF) {
    return `color $${String(word)} is not a 16-bit word`;
  }
  if ((word & 0xF111) !== 0) {
    return `color $${word.toString(16).toUpperCase().padStart(4, '0')} invalid: channels must be even values 0-$E (word & $F111 must be 0)`;
  }
  return null;
}

export function validatePaletteLine(line: number, colors: number[]): string | null {
  if (line === 0) return 'palette line 0 is reserved for player/sprite art';
  if (!Number.isInteger(line) || line < 1 || line > 3) return `palette line must be 1-3, got ${line}`;
  if (colors.length !== 16) return `expected 16 colors, got ${colors.length}`;
  for (let i = 0; i < 16; i++) {
    const err = validateGenesisColor(colors[i]);
    if (err) return `color ${i}: ${err}`;
  }
  return null;
}

export function validateTilePixels(pixels: number[]): string | null {
  if (pixels.length !== 64) return `tile must have 64 pixels, got ${pixels.length}`;
  for (let i = 0; i < 64; i++) {
    const p = pixels[i];
    if (!Number.isInteger(p) || p < 0 || p > 15) {
      return `pixel ${i} = ${p}: values must be 0-15 (4bpp palette indices)`;
    }
  }
  return null;
}

export interface PaintRegionOptions {
  sectionCount: number;
  tilesetSize: number;
}

/** Validate a list of nametable entry specs (tile/pal ranges). */
export function validateEntries(entries: NametableEntrySpec[], tilesetSize: number): string | null {
  if (!Array.isArray(entries)) return 'entries must be an array';
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!Number.isInteger(e.tile) || e.tile < 0 || e.tile >= tilesetSize || e.tile > 0x7FF) {
      return `entry ${i}: tile ${e.tile} out of range (tileset has ${tilesetSize} tiles, hardware max 2047)`;
    }
    if (!Number.isInteger(e.pal) || e.pal < 0 || e.pal > 3) {
      return `entry ${i}: palette line ${e.pal} out of range 0-3`;
    }
  }
  return null;
}

/** Validate an optional save_chunk collision payload: length must equal
 *  (w/2)*(h/2) cells (one packed word per 16px cell). Word range (0-0xFFFF
 *  integers) is already enforced by the zod param schema; this checks the
 *  cross-field length zod can't cheaply express against w/h. undefined is
 *  valid — the chunk's plane defaults to all-air. */
export function validateChunkCollisionPlane(
  name: string, arr: number[] | undefined, w: number, h: number,
): string | null {
  if (arr === undefined) return null;
  const expected = (w / 2) * (h / 2);
  if (!Array.isArray(arr) || arr.length !== expected) {
    return `${name} length ${Array.isArray(arr) ? arr.length : typeof arr} != ${expected} (chunk is ${w}x${h} tiles = ${w / 2}x${h / 2} cells)`;
  }
  return null;
}

export function validatePaintRegion(
  section: number,
  x: number, y: number, w: number, h: number,
  entries: NametableEntrySpec[],
  opts: PaintRegionOptions,
): string | null {
  if (!Array.isArray(entries)) return 'entries must be an array';
  if (!Number.isInteger(section) || section < 0 || section >= opts.sectionCount) {
    return `section ${section} out of range (0-${opts.sectionCount - 1})`;
  }
  if (![x, y, w, h].every(Number.isInteger)) {
    return `region coords must be integers, got (${x},${y}) ${w}x${h}`;
  }
  if (w < 1 || h < 1 || x < 0 || y < 0 ||
      x + w > SECTION_TILES_WIDE || y + h > SECTION_TILES_HIGH) {
    return `region ${w}x${h} at (${x},${y}) is out of bounds (section is ${SECTION_TILES_WIDE}x${SECTION_TILES_HIGH} tiles)`;
  }
  if (entries.length !== w * h) {
    return `entries length ${entries.length} != region size ${w * h}`;
  }
  return validateEntries(entries, opts.tilesetSize);
}
