import type { Color, Palette, PaletteLine } from '../model/types';

/**
 * Decode a Genesis VDP 16-bit color word (0BGR format) to RGBA.
 * Each channel is 3 bits (0-7), scaled to 0-255.
 */
export function decodeGenesisColor(word: number): Color {
  const b = (word >> 9) & 0x7;
  const g = (word >> 5) & 0x7;
  const r = (word >> 1) & 0x7;
  return {
    r: Math.round(r * 255 / 7),
    g: Math.round(g * 255 / 7),
    b: Math.round(b * 255 / 7),
    a: 255,
  };
}

/**
 * Snap one 8-bit channel to the hardware's 3-bit level (0-7).
 *
 * THE ONE ROUNDING RULE. Anything that works in the Genesis colour space —
 * the encoder below, the median-cut quantizer, the default ramp — has to agree
 * on where the eight levels fall, or a colour picked in one place stops being
 * reachable from another and "the palette already holds it" quietly becomes
 * false by one level.
 */
export function genesisLevel(v: number): number {
  return Math.round(Math.min(255, Math.max(0, v)) / 255 * 7);
}

/** Pack three 3-bit levels (0-7 each) into a CRAM word, no 8-bit round trip. */
export function genesisWordFromLevels(r: number, g: number, b: number): number {
  return ((b & 7) << 9) | ((g & 7) << 5) | ((r & 7) << 1);
}

/** The three 3-bit levels a CRAM word holds, `[r, g, b]`, each 0-7. */
export function genesisLevelsOf(word: number): [number, number, number] {
  return [(word >> 1) & 7, (word >> 5) & 7, (word >> 9) & 7];
}

/**
 * Encode an RGB color as a Genesis VDP 16-bit color word (0000BBB0 GGG0RRR0).
 * Each 8-bit channel is clamped and rounded to the nearest 3-bit level (0-7).
 * Inverse of decodeGenesisColor: encode(decode(w)) === w for valid words.
 */
export function encodeGenesisColor(color: { r: number; g: number; b: number }): number {
  return genesisWordFromLevels(genesisLevel(color.r), genesisLevel(color.g), genesisLevel(color.b));
}

/**
 * The Genesis CRAM word's meaningfully-live bits: 0BGR0, one nibble per
 * channel, low bit of each nibble always 0 — exactly the bits
 * decode/encodeGenesisColor read and write.
 */
export const GENESIS_WORD_MASK = 0x0eee;

/**
 * A CRAM word reduced to the bits the hardware displays.
 *
 * Two words that differ only outside the mask are THE SAME COLOUR, and every
 * "did this change?" test has to say so: a palette read out of a disasm can
 * carry junk in the dead bits, and comparing raw words there reports drift for
 * a palette that draws identically — which turns a no-op commit into a
 * whole-zone palette rewrite.
 */
export function sameGenesisColor(a: number, b: number): boolean {
  return (a & GENESIS_WORD_MASK) === (b & GENESIS_WORD_MASK);
}

/** Render a CRAM word the way the editor shows it: `$0EEE`. */
export function fmtGenesisWord(word: number): string {
  return '$' + word.toString(16).toUpperCase().padStart(4, '0');
}

// ---------------------------------------------------------------------------
// CRAM GEOMETRY — where a BYTE address lands
// ---------------------------------------------------------------------------
//
// ═══ WHY THESE THREE NUMBERS ARE CONSTANTS AND NOT LITERALS ═══
//
// `16` and `2` were already spelled inline four times in this file alone
// (`parsePaletteLine`'s `i * 2`, `buildPalette`'s `destIdx / 16`, `destIdx % 16`,
// `lineIdx >= 4`) and once more, as its own exported constant, in
// components/art-shared/palette-grid-model (`LINE_LENGTH`). The effects panel now
// needs the same arithmetic to say what `addr = 74` MEANS, and a sixth copy of a
// `/ 32` is how two surfaces come to disagree about which line an address is on.
//
// ⚠ THE UNIT IS BYTES AND THAT IS THE WHOLE TRAP. `addr` in an effects preset is
// a CRAM **byte** address (`$defs.cram.properties.addr`, "CRAM BYTE address the
// colours are written to"); an entry is one WORD. So the divisor between an
// address and a line is `CRAM_LINE_ENTRIES * CRAM_WORD_BYTES` = 32, not 16 — and
// an author reading "16 colours per line" off a palette editor and dividing by 16
// lands two lines out. The contract states the same geometry as shifts, in
// `$defs.pal_region`'s own descriptions (`addr >> 5 == pal_line`,
// `(addr >> 1) & 15 == entry`), and `cram-geometry.test.ts` asserts THIS
// derivation against THOSE two formulas parsed out of the vendored schema text —
// two independent statements of one fact, cross-checked, rather than a number
// copied from a neighbouring pin.

/** Colours in one CRAM line. Fixed by the VDP, not by any engine or file format. */
export const CRAM_LINE_ENTRIES = 16;

/** Bytes per CRAM entry — one 16-bit word. */
export const CRAM_WORD_BYTES = 2;

/** Lines the Genesis CRAM holds. `buildPalette` below builds exactly this many. */
export const CRAM_LINE_COUNT = 4;

/**
 * The largest integer that IS a CRAM word — the entry's own width, derived from
 * `CRAM_WORD_BYTES` rather than typed as `65535`.
 *
 * ⚠ THIS IS THE WIRE TYPE AND NOT A COLOUR RULE, and the difference is the
 * whole reason it may be asserted anywhere. Which 16-bit words are meaningful
 * colours is `GENESIS_WORD_MASK`'s question and this repo does not agree with
 * itself about it (see `sameGenesisColor` below versus
 * `core/agent/validation.ts`'s `& $F111` check). Whether a number is a word at
 * all is not in dispute: aeon emits a raster program as `[u16; raster_words(P)]`
 * with the colours appended into it (`engine/effects/raster_dsl.emp`,
 * `op_words(Cram) … ++ colours`), and this repo's own existing sentence for a
 * number that will not fit is "is not a 16-bit word" (`core/agent/validation.ts`).
 *
 * ADDED for the effects `colours` box, which validated `Number.isInteger` and
 * nothing else: a cold reader committed `143584` and the swatch — which MASKS —
 * painted a plausible green for it (2026-09-05, C7).
 */
export const CRAM_WORD_MAX = (1 << (CRAM_WORD_BYTES * 8)) - 1;

/** Where a CRAM byte address lands. */
export interface CramLocation {
  /** Palette line, 0-based. May be >= CRAM_LINE_COUNT for an address past CRAM. */
  readonly line: number;
  /** Entry within the line, 0..CRAM_LINE_ENTRIES-1. */
  readonly entry: number;
  /**
   * False when the address is not on a word boundary. The engine's `stream_cram`
   * requires an even address; an odd one still HAS a line and an entry (it
   * straddles the entry below it), and reporting the location silently would
   * hide the one thing wrong with it.
   */
  readonly aligned: boolean;
  /** False when the line is past the CRAM's own `CRAM_LINE_COUNT` lines. */
  readonly inCram: boolean;
}

/**
 * The line and entry a CRAM BYTE address names, or `null` when the address is
 * negative — which is not a location at all, and must not be rendered as one.
 *
 * Out-of-CRAM but non-negative addresses DO get a location, flagged `inCram:
 * false`: an author who typed 200 needs to be told it is line 6 and that there
 * is no line 6, which is more useful than a blank.
 */
export function cramLocation(addr: number): CramLocation | null {
  if (!Number.isFinite(addr) || addr < 0) return null;
  const entryIndex = Math.floor(addr / CRAM_WORD_BYTES);
  const line = Math.floor(entryIndex / CRAM_LINE_ENTRIES);
  return {
    line,
    entry: entryIndex % CRAM_LINE_ENTRIES,
    aligned: addr % CRAM_WORD_BYTES === 0,
    inCram: line < CRAM_LINE_COUNT,
  };
}

/**
 * Parse raw Genesis palette data into a PaletteLine (16 colors).
 * Each color is a big-endian 16-bit word.
 */
export function parsePaletteLine(data: Uint8Array, offset: number = 0, count: number = 16): PaletteLine {
  const colors: Color[] = [];
  for (let i = 0; i < count; i++) {
    const pos = offset + i * 2;
    if (pos + 1 >= data.length) {
      colors.push({ r: 0, g: 0, b: 0, a: 255 });
      continue;
    }
    const word = (data[pos] << 8) | data[pos + 1];
    colors.push(decodeGenesisColor(word));
  }
  // Pad to 16 colors if needed
  while (colors.length < 16) {
    colors.push({ r: 0, g: 0, b: 0, a: 255 });
  }
  return { colors };
}

/**
 * Build a full palette from palette references.
 * Each ref specifies a file's data, source offset, destination color index, and count.
 */
export function buildPalette(entries: Array<{ data: Uint8Array; srcOffset: number; destOffset: number; length: number }>): Palette {
  // Start with 4 empty lines (64 colors)
  const lines: PaletteLine[] = Array.from({ length: 4 }, () => ({
    colors: Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0, a: 255 })),
  }));

  for (const entry of entries) {
    for (let i = 0; i < entry.length; i++) {
      const destIdx = entry.destOffset + i;
      const lineIdx = Math.floor(destIdx / 16);
      const colorIdx = destIdx % 16;
      if (lineIdx >= 4) break;

      const bytePos = entry.srcOffset + i * 2;
      if (bytePos + 1 < entry.data.length) {
        const word = (entry.data[bytePos] << 8) | entry.data[bytePos + 1];
        lines[lineIdx].colors[colorIdx] = decodeGenesisColor(word);
      }
    }
  }

  // Color 0 of each line is transparent
  for (const line of lines) {
    line.colors[0] = { ...line.colors[0], a: 0 };
  }

  return { lines };
}

// ---------------------------------------------------------------------------
// WRITING A ZONE PALETTE BACK
// ---------------------------------------------------------------------------
//
// ═══ THE DEFECT THIS EXISTS FOR ═══════════════════════════════════════════
//
// Until 2026-09-10 this file had no serializer at all. `buildPalette` above
// turned bytes into a `Palette` and NOTHING turned a `Palette` back into bytes,
// so every colour the author picked lived in the model until the next reopen
// and then vanished. The save plan (project/aeon/save.ts) contained no palette
// file: there was no missing STEP, there was no missing DESTINATION.
//
// It was invisible for the same reason aeon's own six-month palette defect was
// (aeon tools/ojz_common.py, "THE ACT PALETTE: EXACTLY ONE WRITER"): the
// editor's live preview pushes CRAM straight into a running game, so the
// emulator DID show the new colour. THE LIVE PATH WORKING IS WHAT HID IT.
//
// ═══ WHERE THE BYTES GO, AND WHY THREE LINES AND NOT FOUR ═════════════════
//
// An authored zone palette file is 48 big-endian CRAM words that load starting
// at CRAM LINE 1. Line 0 is not in the file and must never be written from
// here: it is the shared player palette (art/palettes/SonicAndTails.bin), one
// file for the entire game. See ZONE_PALETTE_FIRST_LINE below.
//
// Three independent statements of that geometry already exist in this
// repository and they agree: `buildPalette`'s caller in project/aeon/load.ts
// reads the file at `destOffset: 16`; `aether/palette-push.ts` fixes
// `PAL_BASE_BYTES = 96` over `PAL_BASE_FIRST_LINE = 1` to `PAL_BASE_LAST_LINE
// = 3` and THROWS on line 0; and `agent/validation.ts` refuses a line-0 write
// from the agent tool. The constants below are derived from the CRAM geometry
// at the top of this file rather than typed as 1/3/96, and
// __tests__/zone-palette-write.test.ts cross-checks them against the
// `PAL_BASE_*` set, which was written independently of this block.

/**
 * The CRAM line an authored zone palette file's FIRST word lands on.
 *
 * ⚠ NOT ZERO, and the whole line-0 policy is downstream of this one number.
 * Reading a 96-byte palette as "the palette" and starting at line 0 slides
 * every line down by one and paints the terrain's colours onto Sonic.
 */
export const ZONE_PALETTE_FIRST_LINE = 1;

/** Lines an authored zone palette file holds: every CRAM line except line 0. */
export const ZONE_PALETTE_LINE_COUNT = CRAM_LINE_COUNT - ZONE_PALETTE_FIRST_LINE;

/** Bytes an authored zone palette file holds. 3 lines x 16 entries x 2 bytes. */
export const ZONE_PALETTE_BYTES
  = ZONE_PALETTE_LINE_COUNT * CRAM_LINE_ENTRIES * CRAM_WORD_BYTES;

/** Words an authored zone palette file holds. */
export const ZONE_PALETTE_WORDS = ZONE_PALETTE_LINE_COUNT * CRAM_LINE_ENTRIES;

/**
 * The bytes of a zone's authored palette file: CRAM lines 1 to 3, big-endian,
 * in the order `buildPalette` reads them, followed by `tail` verbatim.
 *
 * LINE 0 IS NOT IN THE OUTPUT AND CANNOT BE PUT THERE. The loop starts at
 * `ZONE_PALETTE_FIRST_LINE`, so there is no argument, flag or palette shape
 * that makes this function emit the player palette. That is the `refuse_line0`
 * ruling expressed as a function signature rather than as a check someone can
 * forget.
 *
 * `tail` is whatever the file held PAST those 96 bytes. The format says there
 * is nothing there, and aeon's real file is exactly 96 bytes, but a file that
 * is longer holds something this reader did not model, and re-emitting only
 * the part it understood would TRUNCATE it. Passing the tail back through is
 * what makes a save non-destructive on a file whose shape we were wrong about.
 *
 * Alpha is dropped on purpose: `buildPalette` forces index 0 of every line to
 * `a: 0` because the VDP shows the backdrop there, and that is a rendering
 * fact about the editor, not a bit the file carries. `encodeGenesisColor`
 * reads only r/g/b, so index 0 round-trips as its stored colour.
 */
export function serializeZonePalette(
  palette: Palette,
  tail: Uint8Array = new Uint8Array(0),
): Uint8Array {
  const out = new Uint8Array(ZONE_PALETTE_BYTES + tail.length);
  let at = 0;
  for (let line = ZONE_PALETTE_FIRST_LINE; line < CRAM_LINE_COUNT; line++) {
    const colors = palette.lines[line]?.colors ?? [];
    for (let entry = 0; entry < CRAM_LINE_ENTRIES; entry++) {
      const color = colors[entry];
      const word = color ? encodeGenesisColor(color) : 0;
      out[at++] = (word >> 8) & 0xff;
      out[at++] = word & 0xff;
    }
  }
  out.set(tail, ZONE_PALETTE_BYTES);
  return out;
}
