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
      'Pal_Base does not include line 0: it is the character palette and the engine never writes it',
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
  return encodePaletteWords(colors.map(encodeGenesisColor));
}

/**
 * Encode 16 CRAM words directly.
 *
 * This is the path the editor actually uses: its palette lines are ALREADY
 * CRAM words, and routing them through `Color` would decode to 8-bit channels
 * and re-quantize back to 3-bit — a lossless round trip in theory, and one more
 * place for a rounding rule to disagree with the one that wrote the document.
 * Push the words the artist is looking at.
 */
export function encodePaletteWords(words: readonly number[]): Uint8Array {
  if (words.length !== ENTRIES_PER_LINE) {
    throw new Error(`a palette line is ${ENTRIES_PER_LINE} entries, got ${words.length}`);
  }
  const bytes = new Uint8Array(ENTRIES_PER_LINE * 2);
  for (let i = 0; i < ENTRIES_PER_LINE; i++) {
    const word = words[i] & 0xffff;
    bytes[i * 2] = (word >> 8) & 0xff;
    bytes[i * 2 + 1] = word & 0xff;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Classic (S1) geometry — SIMPLER than aeon's, not a port of it.
//
// S1's VBlank DMAs the whole `v_palette` buffer (all four lines, $80 bytes) to
// CRAM UNCONDITIONALLY every frame (`writeCRAM v_palette,0` — sonic.asm:740 and
// five siblings, one per game-mode VBlank flavour). There is NO dirty flag and
// none is needed: a bare RAM write shows on the next frame with no ordering
// hazard. aeon's payload-then-flag discipline is aeon-specific and is
// deliberately NOT ported here — inventing a flag write against a symbol that
// does not exist would gate the whole feature off.
//
// THE LINE MAPPING IS 1-INDEXED, and it is derived, not assumed:
//   - Aurora's own S1 profile composes every zone's editor palette as
//     `palette/Sonic.bin[0..16) → editor line 0` then
//     `palette/<zone>.bin[0..48) → editor lines 1-3`
//     (src/core/project/profiles/s1.ts — SONIC_LINE0 destOffset 0, zone
//     component destOffset 16 length 48).
//   - The engine loads those same two files at `v_palette_line_1` (palid_Sonic)
//     and `v_palette_line_2` (palid_GHZ et al) — s1disasm/_inc/Palette
//     Index.asm:18-27; each line is $20 bytes (_Variables.asm:318-321).
// So editor line N lives at `v_palette_line_(N+1)`. The 2026-08-20 acceptance
// run proved the off-by-one is not hypothetical: a `v_palette_line_2` write did
// NOT recolour the GHZ ground an artist would call "line 2".
//
// ALL FOUR LINES ARE PUSHABLE. Classic's line 0 is an ordinary act palette line
// (the classic editor edits it; there is no engine invariant protecting it),
// unlike aeon where line 0 is excluded by contract. Two engine behaviours a
// caller should expect: `PaletteCycle` repaints its few cycling entries (GHZ:
// line 3's colours 8-11, i.e. `v_palette_line_3+$10`) every 6 frames — push
// anyway and let the artist see it; and a push PERSISTS until the next level
// transition/fade, because `PalLoad` only runs at level load.
// ---------------------------------------------------------------------------

export const CLASSIC_LINES = 4;

/** The RAM symbol for one editor palette line (0-3) on a classic (S1) ROM. */
export function classicPaletteSymbol(line: number): string {
  if (!Number.isInteger(line) || line < 0 || line >= CLASSIC_LINES) {
    throw new Error(`palette line ${line} is out of range; classic has lines 0-3`);
  }
  // Editor line N ↔ v_palette_line_(N+1): S1 numbers its lines 1-4 over CRAM
  // lines 0-3. See the derivation in the block comment above.
  return `v_palette_line_${line + 1}`;
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
  return planPalettePushBytes(line, encodePaletteLine(colors));
}

/** As `planPalettePush`, from CRAM words the editor already holds. */
export function planPalettePushWords(line: number, words: readonly number[]): PalettePushPlan {
  return planPalettePushBytes(line, encodePaletteWords(words));
}

function planPalettePushBytes(line: number, payload: Uint8Array): PalettePushPlan {
  const offset = palBaseOffset(line, 0);
  return {
    writes: [
      { symbol: PAL_BASE_SYMBOL, offset, bytes: payload },
      { symbol: PAL_BASE_DIRTY_SYMBOL, offset: 0, bytes: Uint8Array.of(1) },
    ],
    symbols: [PAL_BASE_SYMBOL, PAL_BASE_DIRTY_SYMBOL],
  };
}

/**
 * Plan the writes for one CLASSIC (S1) palette line, from CRAM words.
 *
 * One write, no flag: S1's VBlank re-DMAs the whole buffer unconditionally
 * every frame (see the geometry block above), so payload-then-flag would be a
 * write into a symbol that does not exist. Offset 0 because each line has its
 * OWN symbol — the mapping lives in `classicPaletteSymbol`, not in arithmetic
 * against a shared base.
 */
export function planClassicPalettePushWords(line: number, words: readonly number[]): PalettePushPlan {
  const symbol = classicPaletteSymbol(line);
  return {
    writes: [{ symbol, offset: 0, bytes: encodePaletteWords(words) }],
    symbols: [symbol],
  };
}

export type PalettePushKind = 'aeon' | 'classic';

/** One planner, dispatched per engine family; the geometry differs per kind. */
export function planPalettePushWordsFor(
  kind: PalettePushKind,
  line: number,
  words: readonly number[],
): PalettePushPlan {
  return kind === 'classic'
    ? planClassicPalettePushWords(line, words)
    : planPalettePushWords(line, words);
}
