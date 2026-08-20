import { describe, it, expect } from 'vitest';
import {
  PAL_BASE_BYTES, PAL_BASE_FIRST_LINE, PAL_BASE_LAST_LINE,
  palBaseOffset, encodePaletteLine, planPalettePush,
  classicPaletteSymbol, planClassicPalettePushWords, planPalettePushWordsFor,
} from '../palette-push';

/**
 * `Pal_Base` is aeon's live palette base layer — the thing the per-frame
 * compose reads, and therefore the only write point where a live slider
 * survives a frame. Its shape came from the aeon session, confirmed against
 * engine source on 2026-08-19:
 *
 *   96 bytes = LINES 1-3 ONLY, 3 lines x 16 entries x 2 bytes.
 *
 * Line 0 is excluded by a hard engine invariant — it belongs to the
 * CHARACTER's palette and the engine never writes it. A first reading of "96
 * bytes" as 4 lines is the obvious mistake and it would push line 0's colours
 * into line 1's entries, silently recolouring the wrong things.
 */
describe('Pal_Base geometry', () => {
  it('is 96 bytes covering lines 1-3', () => {
    expect(PAL_BASE_BYTES).toBe(96);
    expect(PAL_BASE_FIRST_LINE).toBe(1);
    expect(PAL_BASE_LAST_LINE).toBe(3);
    expect((PAL_BASE_LAST_LINE - PAL_BASE_FIRST_LINE + 1) * 16 * 2).toBe(PAL_BASE_BYTES);
  });

  it('offsets line 1 to zero — the buffer starts at line 1, not line 0', () => {
    expect(palBaseOffset(1, 0)).toBe(0);
    expect(palBaseOffset(1, 15)).toBe(30);
  });

  it('offsets lines 2 and 3 by whole lines', () => {
    expect(palBaseOffset(2, 0)).toBe(32);
    expect(palBaseOffset(3, 0)).toBe(64);
    expect(palBaseOffset(3, 15)).toBe(94);
  });

  it('never produces an offset past the buffer', () => {
    expect(palBaseOffset(PAL_BASE_LAST_LINE, 15) + 2).toBe(PAL_BASE_BYTES);
  });

  it('refuses line 0 — the character palette the engine never writes', () => {
    expect(() => palBaseOffset(0, 0)).toThrow(/line 0/i);
  });

  it('refuses a line past the buffer', () => {
    expect(() => palBaseOffset(4, 0)).toThrow(/1-3|out of range/i);
  });

  it('refuses an entry outside 0-15', () => {
    expect(() => palBaseOffset(1, 16)).toThrow(/entry/i);
    expect(() => palBaseOffset(1, -1)).toThrow(/entry/i);
  });
});

describe('encodePaletteLine', () => {
  it('encodes 16 colours big-endian, as the 68000 reads them', () => {
    const line = Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0, a: 255 }));
    line[1] = { r: 255, g: 0, b: 0, a: 255 };      // pure red -> 0x000E
    const bytes = encodePaletteLine(line);
    expect(bytes.length).toBe(32);
    expect(bytes[2]).toBe(0x00);
    expect(bytes[3]).toBe(0x0e);
  });

  it('puts blue in the high nibble, matching the 0BGR word layout', () => {
    const line = Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0, a: 255 }));
    line[0] = { r: 0, g: 0, b: 255, a: 255 };      // pure blue -> 0x0E00
    const bytes = encodePaletteLine(line);
    expect(bytes[0]).toBe(0x0e);
    expect(bytes[1]).toBe(0x00);
  });

  it('refuses a line that is not 16 entries rather than writing a short buffer', () => {
    expect(() => encodePaletteLine([{ r: 0, g: 0, b: 0, a: 255 }])).toThrow(/16/);
  });
});

describe('planPalettePush', () => {
  const line = Array.from({ length: 16 }, () => ({ r: 0, g: 0, b: 0, a: 255 }));

  it('writes the payload, THEN raises the dirty flag', () => {
    const plan = planPalettePush(2, line);
    expect(plan.writes).toHaveLength(2);
    expect(plan.writes[0]).toMatchObject({ symbol: 'Pal_Base', offset: 32 });
    expect(plan.writes[0].bytes.length).toBe(32);

    // PAYLOAD-THEN-FLAG, and the order is the whole point. The per-frame
    // compose does NOT unconditionally re-read Pal_Base — it copies the base
    // in when Pal_Base_Dirty says a fresh one landed. Raise the flag first and
    // the compose can consume a half-written line; never raise it and the
    // write sits there unread indefinitely, which reads as "the feature does
    // nothing".
    expect(plan.writes[1]).toMatchObject({ symbol: 'Pal_Base_Dirty', offset: 0 });
    expect(Array.from(plan.writes[1].bytes)).toEqual([1]);
  });

  it('refuses to plan a push for line 0 instead of silently pushing line 1', () => {
    expect(() => planPalettePush(0, line)).toThrow(/line 0/i);
  });

  it('names both symbols it needs, so a caller can gate on their presence', () => {
    expect(planPalettePush(1, line).symbols).toEqual(['Pal_Base', 'Pal_Base_Dirty']);
  });
});

describe('planPalettePushWords', () => {
  it('pushes the editor\'s CRAM words without a decode/re-quantize round trip', async () => {
    const { planPalettePushWords } = await import('../palette-push');
    const words = Array.from({ length: 16 }, (_, i) => (i * 0x111) & 0x0eee);
    const plan = planPalettePushWords(1, words);
    const bytes = plan.writes[0].bytes;
    expect(bytes.length).toBe(32);
    // Big-endian, entry 3 -> 0x0333 & 0x0EEE = 0x0222
    expect((bytes[6] << 8) | bytes[7]).toBe(words[3]);
  });

  it('refuses line 0 like the colour path does', async () => {
    const { planPalettePushWords } = await import('../palette-push');
    expect(() => planPalettePushWords(0, new Array(16).fill(0))).toThrow(/line 0/i);
  });
});

// ---------------------------------------------------------------------------
// Classic (S1) geometry
// ---------------------------------------------------------------------------

describe('classicPaletteSymbol', () => {
  /**
   * DERIVATION (two sources that never consulted each other):
   *  - Aurora's S1 profile (src/core/project/profiles/s1.ts) composes every
   *    zone's editor palette as Sonic.bin[0..16) -> editor line 0 (SONIC_LINE0,
   *    destOffset 0) then <zone>.bin[0..48) -> editor lines 1-3 (destOffset 16,
   *    length 48).
   *  - s1disasm loads those same files at v_palette_line_1 (palid_Sonic) and
   *    v_palette_line_2 (palid_GHZ..palid_SBZ1) — _inc/Palette Index.asm:18-27,
   *    lines of $20 bytes each at _Variables.asm:318-321.
   * Hence editor line N = v_palette_line_(N+1): S1 numbers 1-4 over CRAM 0-3.
   * The 2026-08-20 acceptance run showed the off-by-one is the live failure
   * mode — a v_palette_line_2 write did not recolour what an artist calls
   * "line 2".
   */
  it('maps editor line N to the 1-indexed v_palette_line_(N+1)', () => {
    expect(classicPaletteSymbol(0)).toBe('v_palette_line_1');
    expect(classicPaletteSymbol(1)).toBe('v_palette_line_2');
    expect(classicPaletteSymbol(2)).toBe('v_palette_line_3');
    expect(classicPaletteSymbol(3)).toBe('v_palette_line_4');
  });

  it('refuses a line outside 0-3', () => {
    expect(() => classicPaletteSymbol(4)).toThrow(/0-3|out of range/i);
    expect(() => classicPaletteSymbol(-1)).toThrow(/0-3|out of range/i);
    expect(() => classicPaletteSymbol(1.5)).toThrow(/0-3|out of range/i);
  });
});

describe('planClassicPalettePushWords', () => {
  const words = Array.from({ length: 16 }, (_, i) => (i * 0x0102) & 0x0eee);

  it('plans exactly ONE write — S1 has no dirty flag and none may be invented', () => {
    // The VBlank copy is unconditional (writeCRAM v_palette,0 — sonic.asm:740
    // and five siblings), so a second "flag" write would target a symbol that
    // does not exist in sonic.lst and would gate the whole feature off.
    const plan = planClassicPalettePushWords(1, words);
    expect(plan.writes).toHaveLength(1);
    expect(plan.symbols).toEqual(['v_palette_line_2']);
  });

  it("writes 32 bytes at offset 0 of the line's OWN symbol — no base arithmetic", () => {
    const plan = planClassicPalettePushWords(2, words);
    expect(plan.writes[0].symbol).toBe('v_palette_line_3');
    expect(plan.writes[0].offset).toBe(0);
    // $20 bytes per line, straight from _Variables.asm:318-321 (ds.b $20 x4).
    expect(plan.writes[0].bytes).toHaveLength(32);
  });

  it('encodes the words big-endian, as the 68000 (and the DMA) read them', () => {
    const plan = planClassicPalettePushWords(0, words);
    // words[3] = (3 * 0x0102) & 0x0eee = 0x0306 & 0x0eee = 0x0206
    // -> big-endian bytes 0x02, 0x06 at offsets 6 and 7.
    expect(plan.writes[0].bytes[6]).toBe(0x02);
    expect(plan.writes[0].bytes[7]).toBe(0x06);
  });

  it("allows line 0 — classic's line 0 is an ordinary act line, not aeon's character invariant", () => {
    expect(planClassicPalettePushWords(0, words).symbols).toEqual(['v_palette_line_1']);
  });
});

describe('planPalettePushWordsFor', () => {
  const words = Array.from({ length: 16 }, () => 0x0eee);

  it('dispatches classic to the one-write plan and aeon to payload-then-flag', () => {
    const classic = planPalettePushWordsFor('classic', 1, words);
    expect(classic.writes).toHaveLength(1);
    const aeon = planPalettePushWordsFor('aeon', 1, words);
    expect(aeon.writes).toHaveLength(2);
    expect(aeon.writes[1].symbol).toBe('Pal_Base_Dirty');
  });

  it("keeps aeon's line-0 refusal while classic accepts it", () => {
    expect(() => planPalettePushWordsFor('aeon', 0, words)).toThrow(/line 0/i);
    expect(planPalettePushWordsFor('classic', 0, words).writes).toHaveLength(1);
  });
});
