/**
 * Live palette push — turning an editor palette line into the writes that
 * recolour a RUNNING aeon game.
 *
 * WHY THIS IS NOT A CRAM WRITE. The obvious mechanism, and the one Aurora's
 * 2026-07-03 spec assumed, is `emulator/write_cram`. It cannot work: aeon
 * composes its palette once per frame into `Palette_Buffer` and DMAs that to
 * CRAM (`engine/effects/palette.emp:31`, `engine/ram.emp:973`), so a direct
 * CRAM write is overwritten inside a frame. Classic S1 is the same shape — its
 * `HBlank` blasts `v_palette_water` into CRAM with an unrolled `rept`.
 *
 * The supported write point is `Pal_Base`, the architecture's named base layer
 * that the per-frame compose reads. Confirmed with the aeon session against
 * engine source, 2026-08-19.
 *
 * Three behaviours a caller should know about, all engine-side and all fine
 * for a dev tool: a section crossing reloads `Pal_Base` from ROM and stomps the
 * slider; during an armed cross-fade the compose lerps `Pal_Base -> Pal_Target`
 * so a slider fights the lerp; and palette VARIANTS derive from the base, so
 * variant-bound entries recolour consistently — usually what you want.
 */

import { encodeGenesisColor } from '../formats/palette';
import type { Color } from '../model/types';

/**
 * `Pal_Base` is 96 bytes and covers LINES 1-3 ONLY — 3 lines x 16 entries x
 * 2 bytes. Line 0 is excluded by a hard engine invariant: it belongs to the
 * CHARACTER's palette and the engine never writes it.
 *
 * Reading "96 bytes" as four lines is the natural mistake (4 x 16 x 2 = 128 is
 * the number a Genesis palette usually is) and it would slide every line down
 * by one, pushing line 0's colours into line 1's entries.
 */
export const PAL_BASE_BYTES = 96;
export const PAL_BASE_FIRST_LINE = 1;
export const PAL_BASE_LAST_LINE = 3;
export const ENTRIES_PER_LINE = 16;

/** The two symbols a push needs. Gate the feature on both resolving. */
export const PAL_BASE_SYMBOL = 'Pal_Base';
export const PAL_BASE_DIRTY_SYMBOL = 'Pal_Base_Dirty';

/** Byte offset of one entry within `Pal_Base`. Throws rather than clamping. */
export function palBaseOffset(line: number, entry: number): number {
  if (line === 0) {
    throw new Error(
      'Pal_Base does not include line 0 — it is the character palette and the engine never writes it',
    );
  }
  if (!Number.isInteger(line) || line < PAL_BASE_FIRST_LINE || line > PAL_BASE_LAST_LINE) {
    throw new Error(`palette line ${line} is out of range; Pal_Base covers lines 1-3`);
  }
  if (!Number.isInteger(entry) || entry < 0 || entry >= ENTRIES_PER_LINE) {
    throw new Error(`palette entry ${entry} is out of range 0-15`);
  }
  return ((line - PAL_BASE_FIRST_LINE) * ENTRIES_PER_LINE + entry) * 2;
}

/** Encode 16 colours as 32 big-endian CRAM words, the way the 68000 reads them. */
export function encodePaletteLine(colors: readonly Color[]): Uint8Array {
  if (colors.length !== ENTRIES_PER_LINE) {
    throw new Error(`a palette line is ${ENTRIES_PER_LINE} entries, got ${colors.length}`);
  }
  const bytes = new Uint8Array(ENTRIES_PER_LINE * 2);
  for (let i = 0; i < ENTRIES_PER_LINE; i++) {
    const word = encodeGenesisColor(colors[i]);
    bytes[i * 2] = (word >> 8) & 0xff;
    bytes[i * 2 + 1] = word & 0xff;
  }
  return bytes;
}

export interface PaletteWrite {
  symbol: string;
  /** Byte displacement from the symbol. Resolved and ADDED client-side: a
   *  symbol target cannot carry a displacement, and `write_memory` silently
   *  ignores one passed beside it. */
  offset: number;
  bytes: Uint8Array;
}

export interface PalettePushPlan {
  writes: PaletteWrite[];
  /** Every symbol this plan resolves — gate the feature on all of them. */
  symbols: string[];
}

/**
 * Plan the writes for one palette line.
 *
 * PAYLOAD THEN FLAG, in that order. The compose does not unconditionally
 * re-read `Pal_Base`; it copies the base in when `Pal_Base_Dirty` says a fresh
 * one landed. Raise the flag first and the compose can consume a half-written
 * line; never raise it and the write sits unread indefinitely, which presents
 * as "the feature does nothing".
 */
export function planPalettePush(line: number, colors: readonly Color[]): PalettePushPlan {
  const offset = palBaseOffset(line, 0);
  return {
    writes: [
      { symbol: PAL_BASE_SYMBOL, offset, bytes: encodePaletteLine(colors) },
      { symbol: PAL_BASE_DIRTY_SYMBOL, offset: 0, bytes: Uint8Array.of(1) },
    ],
    symbols: [PAL_BASE_SYMBOL, PAL_BASE_DIRTY_SYMBOL],
  };
}
