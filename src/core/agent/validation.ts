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

export interface PaintCollisionRectOptions {
  sectionCount: number;
  cellsW: number;
  cellsH: number;
}

/** Validate a paint_collision rectangle. Coordinates are 16px CELL units
 *  (half a section's tile dimensions), not tile units — mirrors
 *  validatePaintRegion's shape/return convention but against cellsW/cellsH. */
export function validatePaintCollisionRect(
  section: number,
  x: number, y: number, w: number, h: number,
  opts: PaintCollisionRectOptions,
): string | null {
  if (!Number.isInteger(section) || section < 0 || section >= opts.sectionCount) {
    return `section ${section} out of range (0-${opts.sectionCount - 1})`;
  }
  if (![x, y, w, h].every(Number.isInteger)) {
    return `region coords must be integers, got (${x},${y}) ${w}x${h}`;
  }
  if (w < 1 || h < 1 || x < 0 || y < 0 ||
      x + w > opts.cellsW || y + h > opts.cellsH) {
    return `collision region ${w}x${h} cells at (${x},${y}) is out of bounds (section is ${opts.cellsW}x${opts.cellsH} cells)`;
  }
  return null;
}

/**
 * Which form of `paint_collision` a request is asking for, or the refusal.
 *
 * The tool takes EITHER a single `word` (fill the rectangle) OR a `words` array
 * (one per cell, row-major). Exactly one, never both and never neither — a
 * request that named both would have two answers and this layer would be
 * picking one silently. zod cannot state that here (`EditorMethod.params` is a
 * raw shape, not a refinable object), so it is stated once, in the same module
 * as the tool's other checks, and tested on both roads.
 *
 * A null in `words` is LEGAL and means "leave this cell alone". That is the
 * form `get_collision_region` hands back for a cell whose four 8px sub-tiles
 * disagree, so accepting it is what makes read → write total: every cell the
 * write half can express round-trips, and the ones it cannot are skipped and
 * counted rather than guessed at.
 */
export function validateCollisionWrite(
  word: unknown, words: unknown, w: number, h: number,
): string | null {
  const hasWord = word !== undefined && word !== null;
  const hasWords = words !== undefined && words !== null;
  if (hasWord && hasWords) {
    return 'pass EITHER "word" (fill the rectangle with one cell word) OR "words" '
      + '(one per cell, row-major) — not both';
  }
  if (!hasWord && !hasWords) {
    return 'pass EITHER "word" (fill the rectangle with one cell word) OR "words" '
      + '(one per cell, row-major) — neither was given';
  }
  if (hasWord) {
    if (!Number.isInteger(word) || (word as number) < 0 || (word as number) > 0xFFFF) {
      return `word must be an integer 0-65535, got ${JSON.stringify(word)}`;
    }
    return null;
  }
  if (!Array.isArray(words)) return `words must be an array, got ${typeof words}`;
  if (words.length !== w * h) {
    return `words length ${words.length} != region size ${w}x${h} = ${w * h} cells`;
  }
  for (let i = 0; i < words.length; i++) {
    const v = words[i];
    if (v === null) continue; // "leave this cell alone" — see the docblock
    if (!Number.isInteger(v) || v < 0 || v > 0xFFFF) {
      return `words[${i}] must be an integer 0-65535 or null, got ${JSON.stringify(v)}`;
    }
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
