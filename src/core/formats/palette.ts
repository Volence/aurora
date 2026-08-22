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
