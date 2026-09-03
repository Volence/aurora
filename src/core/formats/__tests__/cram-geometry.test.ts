// WHERE A CRAM BYTE ADDRESS LANDS — measured against the CONTRACT, not against
// a number typed here.
//
// ═══ WHY THIS FILE EXISTS AT ALL ═══
//
// `cramLocation` answers "what does `addr = 74` mean" for the raster band panel
// (EW-COLOUR-PICKER, cold-walkthrough observation a13). The obvious way to test
// it is `expect(cramLocation(74).line).toBe(2)` — and that is a NUMBER COPIED
// FROM A NEIGHBOURING PIN, which is the failure this repo has nearly enshrined
// twice. A test whose expectations were typed by the same person who typed the
// implementation measures agreement between two acts of typing.
//
// So the expectations come from the OTHER statement of the same geometry: the
// vendored contract schema states it as two shift formulas, in its own
// `$defs.pal_region` descriptions —
//
//     pal_line : "must agree with addr's line (addr >> 5 == pal_line)"
//     entry    : "must agree with addr's entry ((addr >> 1) & 15 == entry)"
//
// — written for a DIFFERENT purpose (the engine's agreement check between `addr`
// and two sibling keys) by a different author in a different repo. This file
// PARSES those two formulas out of the schema text and evaluates them, so a
// green row means the constants in core/formats/palette and the contract's own
// arithmetic agree. If either moves, this reddens.
//
// ⚠ THE PARSE IS ITSELF ASSERTED. A regex that stops matching would make every
// row below vacuous — "the formula and the function agree" over an empty set of
// formulas. Row 1 asserts both formulas were FOUND and that they are the shifts
// this file thinks they are, before anything is evaluated with them.
//
// PLANTS THIS CATCHES (run, on disk, red, restored — see the packet):
//   • CRAM_LINE_ENTRIES 16 -> 8   … rows 2 and 4 go red
//   • CRAM_WORD_BYTES   2 -> 1    … rows 2 and 3 go red

import { describe, it, expect } from 'vitest';
import {
  cramLocation, CRAM_LINE_ENTRIES, CRAM_WORD_BYTES, CRAM_LINE_COUNT,
} from '../palette';
import { EFFECTS_PRESET_SCHEMA } from '../effects/preset';

/** One `$defs.pal_region` property's `description`, out of the vendored bytes. */
function palRegionDescription(field: string): string {
  const defs = (EFFECTS_PRESET_SCHEMA as unknown as Record<string, Record<string, {
    properties: Record<string, { description?: string }>;
  }>>).$defs;
  return defs.pal_region.properties[field].description ?? '';
}

/** `addr >> N` — the line shift, read out of the contract's own sentence. */
const LINE_SHIFT = /addr\s*>>\s*(\d+)\s*==\s*pal_line/.exec(palRegionDescription('pal_line'));
/** `(addr >> N) & M` — the entry shift and mask, likewise. */
const ENTRY_SHIFT = /\(\s*addr\s*>>\s*(\d+)\s*\)\s*&\s*(\d+)\s*==\s*entry/
  .exec(palRegionDescription('entry'));

describe('the contract states this geometry, and this file read it', () => {
  it('both formulas are present in the vendored schema and are shift expressions', () => {
    // ANTI-VACUOUS FLOOR. Every row below evaluates these captures; a regex that
    // matched nothing would make all of them agree about nothing.
    expect(LINE_SHIFT, `no "addr >> N == pal_line" in ${palRegionDescription('pal_line')}`)
      .not.toBeNull();
    expect(ENTRY_SHIFT, `no "(addr >> N) & M == entry" in ${palRegionDescription('entry')}`)
      .not.toBeNull();
    expect(Number(LINE_SHIFT![1])).toBeGreaterThan(0);
    expect(Number(ENTRY_SHIFT![1])).toBeGreaterThan(0);
    expect(Number(ENTRY_SHIFT![2])).toBeGreaterThan(0);
  });
});

/** The contract's own answer for an address, evaluated from the parsed shifts. */
function contractLocation(addr: number): { line: number; entry: number } {
  return {
    line: addr >> Number(LINE_SHIFT![1]),
    entry: (addr >> Number(ENTRY_SHIFT![1])) & Number(ENTRY_SHIFT![2]),
  };
}

describe('cramLocation agrees with the contract over the whole CRAM', () => {
  it('every even address in CRAM lands where the schema formulas say', () => {
    const total = CRAM_LINE_COUNT * CRAM_LINE_ENTRIES * CRAM_WORD_BYTES;
    // Sized from the constants, so shrinking a constant shrinks the sweep rather
    // than leaving addresses outside it unmeasured.
    expect(total).toBeGreaterThan(0);
    for (let addr = 0; addr < total; addr += CRAM_WORD_BYTES) {
      const mine = cramLocation(addr)!;
      const theirs = contractLocation(addr);
      expect({ addr, ...mine }, `addr ${addr}`).toMatchObject({ addr, ...theirs });
      expect(mine.inCram, `addr ${addr} is inside CRAM`).toBe(true);
      expect(mine.aligned, `addr ${addr} is even`).toBe(true);
    }
  });

  it("the walkthrough's own address reads as the walkthrough's own sentence", () => {
    // a13 asked for a `"palette line 2, entry 5"` rendering of `addr = 74`. The
    // 2 and the 5 are NOT typed as expectations — they come from the contract's
    // formulas, and this row only pins that the reader's address is the one that
    // produces them, so the packet's worked example cannot rot silently.
    const at = cramLocation(74)!;
    expect(at).toMatchObject(contractLocation(74));
    expect(at.line).toBe(74 >> Number(LINE_SHIFT![1]));
    expect(at.entry).toBe((74 >> Number(ENTRY_SHIFT![1])) & Number(ENTRY_SHIFT![2]));
  });
});

describe('the three abnormal addresses are named, never rendered as a location', () => {
  it('a negative address has no location at all', () => {
    expect(cramLocation(-1)).toBeNull();
    expect(cramLocation(-2)).toBeNull();
  });

  it('an odd address still has a line and an entry, flagged unaligned', () => {
    // The engine refuses an odd `addr` (`stream_cram`: "even"). It is still ON a
    // line, and saying so with the flag is more use than a blank — but the flag
    // must be there, or the panel would print a confident location for an
    // address that builds red.
    const odd = cramLocation(75)!;
    expect(odd.aligned).toBe(false);
    expect(odd.line).toBe(cramLocation(74)!.line);
    expect(odd.entry).toBe(cramLocation(74)!.entry);
    expect(cramLocation(74)!.aligned).toBe(true);
  });

  it('the first address past the last line is flagged out of CRAM', () => {
    const past = CRAM_LINE_COUNT * CRAM_LINE_ENTRIES * CRAM_WORD_BYTES;
    expect(cramLocation(past - CRAM_WORD_BYTES)!.inCram).toBe(true);
    expect(cramLocation(past)!.inCram).toBe(false);
    expect(cramLocation(past)!.line).toBe(CRAM_LINE_COUNT);
  });
});

describe('the constants are the hardware, and one of them is the trap', () => {
  it('the divisor between an address and a line is entries x word bytes', () => {
    // THE `/32 not /16` TRAP, pinned. An author (or an implementation) reading
    // "16 colours per line" off the palette editor and dividing a BYTE address by
    // 16 lands two lines out. This row states the relation in terms of the two
    // constants so a change to either has to come here.
    const perLine = CRAM_LINE_ENTRIES * CRAM_WORD_BYTES;
    expect(cramLocation(perLine)!.line).toBe(1);
    expect(cramLocation(perLine)!.entry).toBe(0);
    expect(cramLocation(perLine - CRAM_WORD_BYTES)!.line).toBe(0);
    expect(cramLocation(perLine - CRAM_WORD_BYTES)!.entry).toBe(CRAM_LINE_ENTRIES - 1);
    expect(perLine).toBe(1 << Number(LINE_SHIFT![1]));
  });
});
