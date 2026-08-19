import { describe, it, expect } from 'vitest';
import {
  PAL_BASE_BYTES, PAL_BASE_FIRST_LINE, PAL_BASE_LAST_LINE,
  palBaseOffset, encodePaletteLine, planPalettePush,
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
