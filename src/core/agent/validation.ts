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

/**
 * `get_collision_region`'s plane, and the ONE combination the 2026-08-29 merge
 * of the collision-read and loop-paint parcels REFUSED rather than invented
 * (docs/reviews/2026-08-29-paint-collision-reconcile.md).
 *
 * `paint_collision` grew `plane: "both"` — a MODE that writes A and B in one
 * undo step, each cell merged against its own plane's word. An agent that has
 * just used it will reach for the same value on the read, and the read cannot
 * honour it:
 *
 *   • MERGING the two planes into one grid is exactly the flattening this very
 *     method already refuses one level down. A cell whose four 8px sub-tiles
 *     disagree reports `{word: null, mixed: true}` rather than a sampled guess,
 *     on the argument that an instrument which averages away disagreement
 *     cannot report the one thing it was built to catch. Two planes disagreeing
 *     is the same disagreement one level up, and the same answer applies.
 *   • RETURNING TWO GRIDS makes the reply's shape depend on a parameter, and
 *     leaves `words` — whose whole purpose is to feed straight back into
 *     `paint_collision` — with no single value.
 *
 * Two calls express it exactly and cost nothing. So this refuses, and refuses
 * in prose: an agent gets the method description and nothing else, and a bare
 * enum error would teach it the read is missing a feature rather than that the
 * asymmetry is deliberate. That gap cost this repo a parcel on 2026-08-28
 * (docs/reviews/2026-08-29-agent-paint-priority.md §4).
 */
export function validateCollisionReadPlane(plane: unknown): string | null {
  if (plane === 'a' || plane === 'b') return null;
  if (plane === 'both') {
    return 'get_collision_region reads ONE plane: pass plane "a" or "b", not "both". '
      + 'paint_collision accepts "both" because a WRITE can touch two planes in one undo step, '
      + 'but a read of "both" would have to merge the two planes into one grid — the same '
      + 'flattening this method already refuses for a cell whose four 8px sub-tiles disagree, '
      + 'where it reports null rather than sampling one of them — or return two grids, which '
      + 'would make the reply shape depend on a parameter and leave "words" (the array '
      + 'paint_collision takes straight back) with no single value. Call it twice.';
  }
  return `plane must be "a" or "b", got ${JSON.stringify(plane)}`;
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
