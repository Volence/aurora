// The band panel's decisions, tested where the node suite can reach them.
//
// The component itself is invisible to `vitest run` (bar 1), which is exactly
// why nothing interesting is in it. What IS in it — layout — is the CDP
// harness's subject. What is here is everything a wrong answer would make the
// panel lie about:
//
//   • the driver list, which comes out of the vendored contract and which
//     renders as an EMPTY dropdown if the derivation ever yields undefined;
//   • the row counts a picker may offer, which are a power-of-two constraint on
//     BYTES and not on rows;
//   • the availability answers, which decide whether a control is greyed — and
//     which are the ONE place on this surface where a reason is composed rather
//     than quoted, so they are the one place that can drift away from the
//     command's actual behaviour. The rows below pin them TO the command: if
//     availability says yes, the command must not refuse, and vice versa.
//
// TWO DOCUMENTS, AND BOTH ARE ORDINARY. `b0e5a661` (340 tiles, 108 free) is a
// document with room: BOTH doors work there, and the rows say so. `FULL` is the
// same document padded to BG_TILE_CAPACITY — the state aeon's live file happens
// to sit in today — where insertion refuses at every size and promotion still
// works.
//
// NEITHER IS THE "REAL" CASE. The 448 ceiling is real and immovable
// ((0xB800-0x8000)/32, the BG region below the sprite attribute table); the
// SATURATION is a transient property of one generator run, and the aeon lane is
// adding a band-tile reserve. So a suite that only exercised the full document
// would certify an interface shaped around a passing fact, and one that only
// exercised the roomy document would miss the refusal an author meets while the
// budget is tight. Both, as peers.

import { describe, it, expect } from 'vitest';
import type { AnyCommand } from '../../../core/editing/commands';
import { readFileSync } from 'node:fs';
import {
  BG_TILE_CAPACITY, TILE_BYTES, TILE_PIXELS,
  BGANIM_DRIVER_NAMES, BGANIM_MAX_BANDS,
  parseBgOverride, bandColumnBytes,
  type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';
import { applyWithBand, describeBands, documentBands } from '../../../core/formats/bg-override/bg-anim-band';
import type { BandSlotPlan } from '../../../core/formats/bg-override/bg-anim-band';
import type { BgOverrideBand } from '../../../core/formats/bg-override/bg-override';
import type { SetBgOverrideBandCommand } from '../../../core/editing/commands';
import {
  DEFAULT_DRIVER, DEFAULT_RATE_SHIFT, addBandCommand, bandBudget, bandRows,
  clampRateShift, demoteBandCommand, driverOptions, insertUnavailableReason,
  patternPxFor, promoteBandCommand, promoteUnavailableReason, rateShiftNote,
  removeBandCommand, rowChoices, slotSpanPhrase, NO_SLOTS_PHRASE, type BandSpec,
} from '../bg-anim-aeon';

const FIXTURE = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';
const doc = (): BgOverrideDocument => parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;

/**
 * The fixture padded to capacity — the shape the LIVE document ships in.
 *
 * Derived: it appends blank tiles until `tiles.length === BG_TILE_CAPACITY`,
 * reading the ceiling from the contract rather than counting to 448 here. The
 * padding is unreferenced by any layout word, so the document stays valid.
 */
function fullDoc(): BgOverrideDocument {
  const d = doc();
  while (d.tiles.length < BG_TILE_CAPACITY) d.tiles.push(new Array<number>(TILE_PIXELS).fill(0));
  return d;
}

describe('the driver picker', () => {
  it('offers exactly the contract\'s drivers, and none of them is an axis', () => {
    const opts = driverOptions();
    // THE ROW THIS EXISTS FOR: a derivation that yielded undefined renders an
    // EMPTY <select>, which on screen is indistinguishable from a panel that has
    // not loaded, and which no test of the derivation alone would notice.
    expect(opts.length).toBe(BGANIM_DRIVER_NAMES.length);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.map((o) => o.value)).toEqual([...BGANIM_DRIVER_NAMES]);
    // No option offers a direction. `camera_y` is a SOURCE, and it is the one
    // name a reader mistakes for an instruction.
    for (const o of opts) {
      expect(o.label).not.toMatch(/vertical|horizontal|up|down/i);
      expect(o.title).toMatch(/HORIZONTALLY/);
    }
  });

  it('the default it displays is the contract\'s first driver, not a literal', () => {
    expect(DEFAULT_DRIVER).toBe(BGANIM_DRIVER_NAMES[0]);
  });
});

describe('the geometry pickers', () => {
  it('every row count offered makes the column byte count an exact power of two', () => {
    const choices = rowChoices();
    expect(choices.length).toBeGreaterThan(0);
    for (const rows of choices) {
      const bytes = bandColumnBytes({ rows });
      expect(bytes % TILE_BYTES).toBe(0);
      expect(bytes & (bytes - 1)).toBe(0);
    }
  });

  it('and no row count it REFUSES would have worked — the picker is not over-restrictive', () => {
    // The complement, which is the half a "every offer is legal" row cannot see:
    // an enumeration that returned only `[1]` would pass the row above.
    const offered = new Set(rowChoices());
    for (let rows = 1; rows <= BG_TILE_CAPACITY; rows++) {
      const bytes = bandColumnBytes({ rows });
      const legal = (bytes & (bytes - 1)) === 0;
      expect(offered.has(rows)).toBe(legal);
    }
  });

  it('pattern_px is cols * the contract\'s tile width', () => {
    // Derived from the consumer's own assert (`pattern_px == cols * 8`) via a
    // band the codec built, not from an 8 typed here.
    // `.at(-1)` because a promotion defaults to AFTER the last band, and the
    // fixture already carries two — reading [0] would have measured the
    // fixture's own 32-col band and agreed with a broken derivation for 2.
    const built = describeBands(promoteThenDescribe(2)).at(-1)!;
    expect(built.cols).toBe(2);
    expect(built.patternPx).toBe(patternPxFor(2));
  });
});

/** Promote a 2x1 band off the fixture and hand back the resulting document. */
function promoteThenDescribe(cols: number): BgOverrideDocument {
  const d = doc();
  const base = bandBudget(d).firstPromotableSlot;
  const r = promoteBandCommand(d, base, { cols, rows: 1 });
  if (!r.ok) throw new Error(r.reason);
  // The band the command carries is the band the document will get.
  return applyForTest(d, r.command);
}

describe('the budget the panel puts on screen', () => {
  it('reports the fixture\'s real numbers, derived from the document', () => {
    const d = doc();
    const b = bandBudget(d);
    expect(b.tiles).toBe(d.tiles.length);
    expect(b.tileCapacity).toBe(BG_TILE_CAPACITY);
    expect(b.tileSlotsRemaining).toBe(BG_TILE_CAPACITY - d.tiles.length);
    expect(b.maxBands).toBe(BGANIM_MAX_BANDS);
    expect(b.bands).toBe(describeBands(d).length);
    // The animated prefix, and the first slot a promotion may take from, are the
    // same number — that IS the prefix rule.
    expect(b.firstPromotableSlot).toBe(b.animatedSlots);
    expect(b.animatedSlots).toBe(describeBands(d).reduce((n, x) => n + x.tileCount, 0));
  });

  it('answers for a document that is not there without inventing one', () => {
    const b = bandBudget(null);
    expect(b.bands).toBe(0);
    expect(b.tiles).toBe(0);
    // Nothing is "remaining" in a document that does not exist — a panel that
    // showed 448 free slots there would offer an operation with no target.
    expect(b.tileSlotsRemaining).toBe(0);
    expect(b.bandsRemaining).toBe(0);
    expect(bandRows(null)).toEqual([]);
  });
});

describe('availability agrees with what the command actually does', () => {
  it('on a document with room, BOTH doors are open and both commands succeed', () => {
    // The peer row. Insertion is not an exotic path reached after promotion
    // fails — on any document with slots to spare it is simply available.
    const d = doc();
    expect(bandBudget(d).tileSlotsRemaining).toBeGreaterThan(0);   // anti-vacuous
    expect(insertUnavailableReason(d, 2, 1)).toBeNull();
    expect(promoteUnavailableReason(d)).toBeNull();
    expect(addBandCommand(d, { cols: 2, rows: 1 }).ok).toBe(true);
    expect(promoteBandCommand(d, bandBudget(d).firstPromotableSlot, { cols: 2, rows: 1 }).ok)
      .toBe(true);
  });

  it('ON A FULL DOCUMENT insert is unavailable at EVERY size, and the command refuses', () => {
    // A capacity fact, not a verdict on the gesture: when the blob is full there
    // are no slots to spend, and the author needs the count and the alternative
    // rather than a silent dead control.
    const d = fullDoc();
    expect(bandBudget(d).tileSlotsRemaining).toBe(0);
    for (const [cols, rows] of [[1, 1], [2, 1], [8, 2], [32, 4]]) {
      const why = insertUnavailableReason(d, cols, rows);
      expect(why).not.toBeNull();
      // The reason names the free-slot count and points at promotion — the two
      // things that turn a dead button into an instruction.
      expect(why).toMatch(/0 free slot/);
      expect(why).toMatch(/PROMOTE/);
      expect(addBandCommand(d, { cols, rows }).ok).toBe(false);
    }
  });

  it('…and PROMOTION is available on that same full document, and succeeds', () => {
    // The other half, and the reason the first half is not simply a dead end:
    // promotion costs no slots at any capacity.
    const d = fullDoc();
    expect(promoteUnavailableReason(d)).toBeNull();
    const r = promoteBandCommand(d, bandBudget(d).firstPromotableSlot, { cols: 2, rows: 1 });
    expect(r.ok).toBe(true);
  });

  it('at the band ceiling both doors close, and both say so', () => {
    let d = doc();
    // Grow to the ceiling through the real commands, so the state is one the app
    // can actually reach rather than one hand-assembled to look like it.
    while (bandBudget(d).bandsRemaining > 0) {
      const r = promoteBandCommand(d, bandBudget(d).firstPromotableSlot, { cols: 1, rows: 1 });
      if (!r.ok) throw new Error(r.reason);
      d = applyForTest(d, r.command);
    }
    expect(bandBudget(d).bands).toBe(BGANIM_MAX_BANDS);
    expect(promoteUnavailableReason(d)).toMatch(new RegExp(`ceiling of ${BGANIM_MAX_BANDS}`));
    expect(insertUnavailableReason(d, 1, 1)).toMatch(new RegExp(`ceiling of ${BGANIM_MAX_BANDS}`));
  });
});

/** Apply a band command the way history.ts does — the same function, not a copy. */
function applyForTest(d: BgOverrideDocument, cmd: AnyCommand): BgOverrideDocument {
  const c = cmd as SetBgOverrideBandCommand;
  return applyWithBand(d, c.plan as BandSlotPlan, c.band as BgOverrideBand);
}

describe('refusals are the CODEC\'s words, not a second explanation', () => {
  it('a promotion overlapping an existing band quotes the prefix rule', () => {
    const d = doc();
    // Slot 0 is inside band 0 on this fixture — anti-vacuous check first.
    expect(bandBudget(d).animatedSlots).toBeGreaterThan(0);
    const r = promoteBandCommand(d, 0, { cols: 1, rows: 1 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toMatch(/already belong[\s\S]*to the bands this document carries/);
  });

  it('a removal that would destroy drawn art refuses with the CELL COUNT', () => {
    const d = doc();
    const r = removeBandCommand(d, 0, false);
    expect(r.ok).toBe(false);
    // The number is what makes the panel's confirmation honest. Matched on the
    // removal rule's own phrasing rather than on a digit pattern that a
    // neighbouring refusal could also satisfy.
    expect(r.ok === false && r.reason).toMatch(/cell\(s\)/);
  });

  it('…and goes through once the caller says it meant to lose that art', () => {
    expect(removeBandCommand(doc(), 0, true).ok).toBe(true);
  });

  it('a demotion never needs that permission, because it destroys nothing', () => {
    // The row that makes demote the safe primary counterpart to remove.
    expect(demoteBandCommand(doc(), 0).ok).toBe(true);
  });

  it('every mutation refuses cleanly with no document at all', () => {
    for (const r of [
      promoteBandCommand(null, 0, { cols: 1, rows: 1 }),
      demoteBandCommand(null, 0),
      addBandCommand(null, { cols: 1, rows: 1 }),
      removeBandCommand(null, 0),
    ]) {
      expect(r.ok).toBe(false);
    }
  });
});

describe('the band rows the panel renders', () => {
  it('carry the document\'s effective values AND whether the key is spelled out', () => {
    const rows = bandRows(doc());
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.geometry)).toEqual(['32x4', '16x4']);
    // DERIVED FROM THE BANDS, NOT TRANSCRIBED. This row shipped as the literal
    // pair `['0..128', '128..192']` and passed against a subtitle that named one
    // slot too many — the two ends were copied out of the same off-by-one the
    // display had. Both halves now come off `describeBands`, and the count is
    // the one the range is built from.
    expect(rows.map((r) => r.slotRange)).toEqual(
      describeBands(doc()).map((v) => `slots ${v.slotBase}..${v.slotBase + v.tileCount - 1}`),
    );
    // The fixture spells both keys, so a panel reading only `driver` would look
    // right here — `driverIsExplicit` is what a panel needs to avoid writing
    // today's default into a file that was tracking the contract's.
    expect(rows.every((r) => r.driverIsExplicit)).toBe(true);
    expect(rows.map((r) => r.driver)).toEqual(['camera_x', 'timer']);
  });

  it('a band created WITHOUT a driver reports the default and says it is not spelled', () => {
    const d = doc();
    const r = promoteBandCommand(d, bandBudget(d).firstPromotableSlot, { cols: 1, rows: 1 });
    if (!r.ok) throw new Error(r.reason);
    const next = applyForTest(d, r.command);
    const created = bandRows(next).at(-1)!;
    expect(created.driverIsExplicit).toBe(false);
    expect(created.driver).toBe(DEFAULT_DRIVER);
  });
});

// ---------------------------------------------------------------------------
// The slot ranges those readouts PRINT (ROADMAP item 54)
// ---------------------------------------------------------------------------
//
// Every quantity on this surface is a COUNT — `tileCount`, `animatedSlots`,
// `firstPromotableSlot` — so `base + count` is the first slot the range does NOT
// own. Three readouts printed it anyway: the band card's subtitle, the blob
// budget line, and the promote form's `→ slots …`. On the live document (32
// animated slots) the budget line read `slots 0..32`, naming slot 32 — which is
// exactly the first slot a promotion drag may take. `d7ec678` fixed the fourth
// such sentence the day before; `slotSpanPhrase` is that convention in one
// place, and these rows derive BOTH ends from the same count the range is built
// from so the display and the arithmetic cannot drift apart again.
//
// The rows below deliberately do NOT match on `0..32`-shaped literals: that is
// the exact matcher that passed against this defect last time.

/** The `12` and `19` out of `"slots 12..19"`, or null if it is not a range. */
function endsOf(phrase: string): { first: number; last: number } | null {
  const m = /(\d+)\.\.(-?\d+)/.exec(phrase);
  return m === null ? null : { first: Number(m[1]), last: Number(m[2]) };
}

describe('a printed slot range names the last slot it contains', () => {
  it('the span covers exactly `count` slots, for every count a band can have', () => {
    // The property, not a number: last - first + 1 IS the count, so a range
    // that printed one past its end would over-count by one here.
    for (const [base, count] of [[0, 1], [0, 128], [7, 4], [128, 64], [40, 3]]) {
      const ends = endsOf(slotSpanPhrase(base, count));
      expect(ends, `${base}/${count}`).not.toBeNull();
      expect(ends!.first).toBe(base);
      expect(ends!.last - ends!.first + 1, `${base}/${count}`).toBe(count);
      // and it never names the first slot PAST the range
      expect(slotSpanPhrase(base, count)).not.toContain(`..${base + count}`);
    }
  });

  it('the empty range is worded, not arithmetic — no `0..-1` reaches a reader', () => {
    // DECIDED, not inherited: a naive `base + count - 1` renders `0..-1` on the
    // empty document, which is not a range anyone can act on.
    for (const base of [0, 32]) {
      const phrase = slotSpanPhrase(base, 0);
      expect(phrase).toBe(NO_SLOTS_PHRASE);
      expect(phrase).not.toContain('..');
      expect(phrase).not.toContain('-1');
      expect(endsOf(phrase)).toBeNull();
      // and it still SAYS something — an empty string would render as a gap
      expect(phrase.trim().length).toBeGreaterThan(0);
    }
  });

  it('the band card\'s subtitle stops one slot short of the next band\'s base', () => {
    // THE BOUNDARY CASE, walked across the whole document: band k's printed last
    // slot is band k+1's base minus one, and the last band's printed last slot
    // is the last animated slot there is. Both sides come off the same walk the
    // codec does, so this fails the moment a readout claims a slot it does not
    // own — including the one slot promotion needs.
    const d = doc();
    const rows = bandRows(d);
    const bases = describeBands(d).map((v) => v.slotBase);
    expect(rows.length).toBeGreaterThan(1);
    rows.forEach((r, i) => {
      const ends = endsOf(r.slotRange)!;
      expect(ends, r.slotRange).not.toBeNull();
      expect(ends.first).toBe(bases[i]);
      if (i + 1 < bases.length) expect(ends.last + 1).toBe(bases[i + 1]);
    });
    const last = endsOf(rows.at(-1)!.slotRange)!;
    const budget = bandBudget(d);
    expect(last.last + 1).toBe(budget.animatedSlots);
    // …which is to say: the FIRST PROMOTABLE SLOT is not inside any band's
    // printed range. That is the whole point — `firstPromotableSlot` is where
    // an author is told to drag, and it must not read as taken.
    expect(last.last).toBeLessThan(budget.firstPromotableSlot);
    for (const r of rows) expect(r.slotRange).not.toContain(`..${budget.firstPromotableSlot}`);
  });

  it('the blob budget line\'s animated prefix ends one before the first free slot', () => {
    // The panel composes this exact call: `({slotSpanPhrase(0, animatedSlots)})`.
    const budget = bandBudget(doc());
    expect(budget.animatedSlots).toBeGreaterThan(0);
    const phrase = slotSpanPhrase(0, budget.animatedSlots);
    expect(phrase).toContain(`0..${budget.animatedSlots - 1}`);
    expect(phrase).not.toContain(`0..${budget.animatedSlots}`);
    // a document with no bands at all gets the words, not `0..-1`
    const empty = { ...doc(), anims: [] };
    expect(bandBudget(empty).animatedSlots).toBe(0);
    expect(slotSpanPhrase(0, bandBudget(empty).animatedSlots)).toBe(NO_SLOTS_PHRASE);
  });

  it('the promote form\'s range is the slots the promotion would actually take', () => {
    // The panel composes `slotSpanPhrase(staticBase, tileCount)` for a candidate
    // parked at the first promotable slot — the default the panel clamps to.
    const budget = bandBudget(doc());
    const spec: BandSpec = { cols: 4, rows: 2 };
    const tileCount = spec.cols * spec.rows;
    const base = budget.firstPromotableSlot;
    const phrase = slotSpanPhrase(base, tileCount);
    expect(phrase).toContain(`${base}..${base + tileCount - 1}`);
    expect(phrase).not.toContain(`..${base + tileCount}`);
    // and the promotion the panel would run takes exactly those slots — the
    // command is the authority the readout has to agree with.
    const r = promoteBandCommand(doc(), base, spec);
    if (!r.ok) throw new Error(r.reason);
    const after = bandRows(applyForTest(doc(), r.command));
    expect(after.at(-1)!.slotRange).toBe(phrase);
    expect(endsOf(after.at(-1)!.slotRange)!.last - base + 1).toBe(tileCount);
  });
});

// ---------------------------------------------------------------------------
// The rate control (ROADMAP item 44)
// ---------------------------------------------------------------------------
//
// The band panel built its BandSpec from cols/rows/phaseFill/driver only, so
// EVERY band a human authored moved at exactly one speed: aeon's default. The
// whole stack under the panel already carried the key — the model, the codec,
// the command layer, both agent doors — which is precisely why nothing in this
// suite noticed the gap. These rows pin what the new control can get wrong.

/** The vendored contract, read as a FILE — the copy a drifting default drifts from. */
const CONTRACT = JSON.parse(readFileSync(
  'src/core/formats/bg-override/bganim-consumer-contract.json', 'utf8'));

describe('the rate control', () => {
  it('the default it displays is the CONTRACT\'S, read from the file, not a literal', () => {
    // Compared against the JSON rather than against the codec's BAND_DEFAULTS:
    // comparing the codec to itself would prove nothing about the panel.
    expect(DEFAULT_RATE_SHIFT).toBe(CONTRACT.bandKeys.rate_shift.default);
    expect(Number.isInteger(DEFAULT_RATE_SHIFT)).toBe(true);
  });

  it('clamps what the SPINNER cannot: a negative, a fraction, an empty box', () => {
    // `min` on <input type="number"> is decorative for typed input (item 37).
    expect(clampRateShift(-1)).toBe(0);
    expect(clampRateShift(-999)).toBe(0);
    expect(clampRateShift(2.7)).toBe(3);
    expect(clampRateShift(0.4)).toBe(0);
    // A half-typed box yields NaN, and 0 — a real, very FAST rate — is the wrong
    // place to land silently. The contract's default is.
    expect(clampRateShift(NaN)).toBe(DEFAULT_RATE_SHIFT);
    expect(clampRateShift(Infinity)).toBe(DEFAULT_RATE_SHIFT);
    // Every output is something the codec accepts.
    for (const v of [-1, -999, 2.7, 0.4, NaN, Infinity, 0, 5, 31]) {
      const n = clampRateShift(v);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
    }
  });

  it('and imposes NO ceiling, because the contract declares none', () => {
    // A UI that refused a value aeon would bake is a worse defect than one that
    // permits a useless one. Derived: if the contract ever grows a maximum, this
    // row fails rather than silently certifying an unbounded control.
    expect(CONTRACT.bandKeys.rate_shift.kind).toBe('nonNegativeInt');
    expect(Object.hasOwn(CONTRACT.bandKeys.rate_shift, 'max')).toBe(false);
    for (const big of [16, 31, 64, 4096]) expect(clampRateShift(big)).toBe(big);
  });

  it('says which way is faster, in the direction authors get backwards', () => {
    const note = rateShiftNote(3);
    expect(note).toMatch(/HIGHER IS SLOWER/);
    expect(note).toMatch(/step = driver >> 3/);
    // The count is 2^n, derived from the contract's own formula.
    expect(rateShiftNote(0)).toMatch(/1 px per 1 driver unit\./);
    expect(rateShiftNote(1)).toMatch(/1 px per 2 driver units/);
    expect(rateShiftNote(3)).toMatch(/1 px per 8 driver units/);
    expect(rateShiftNote(10)).toMatch(/1 px per 1,024 driver units/);
    // A shift too wide for 2^n to be a finite double still prints something.
    expect(rateShiftNote(1100)).toMatch(/2\^1100 driver units/);
    // It clamps what it prints, so a mid-keystroke value never prints as NaN.
    expect(rateShiftNote(-4)).toMatch(/step = driver >> 0/);
  });
});

describe('the rate reaches the document through BOTH doors, and only when asked', () => {
  /** The raw band a spec produces at the promotion door. */
  function promoted(spec: BandSpec): BgOverrideBand {
    const d = doc();
    const r = promoteBandCommand(d, bandBudget(d).firstPromotableSlot, spec);
    if (!r.ok) throw new Error(r.reason);
    return documentBands(applyForTest(d, r.command)).at(-1)!;
  }
  /** The raw band a spec produces at the insertion door. */
  function inserted(spec: BandSpec): BgOverrideBand {
    const d = doc();
    const r = addBandCommand(d, spec);
    if (!r.ok) throw new Error(r.reason);
    return documentBands(applyForTest(d, r.command)).at(-1)!;
  }

  it('PROMOTION spells rate_shift only when the spec carries one', () => {
    expect(Object.hasOwn(promoted({ cols: 1, rows: 1 }), 'rate_shift')).toBe(false);
    expect(promoted({ cols: 1, rows: 1, rateShift: 5 }).rate_shift).toBe(5);
    // 0 is a REAL rate, not "unset" — a falsy check anywhere on the path would
    // drop it and the band would silently run at the default instead.
    expect(promoted({ cols: 1, rows: 1, rateShift: 0 }).rate_shift).toBe(0);
    expect(Object.hasOwn(promoted({ cols: 1, rows: 1, rateShift: 0 }), 'rate_shift')).toBe(true);
  });

  it('INSERTION does the same — the two doors are peers here too', () => {
    expect(Object.hasOwn(inserted({ cols: 1, rows: 1 }), 'rate_shift')).toBe(false);
    expect(inserted({ cols: 1, rows: 1, rateShift: 5 }).rate_shift).toBe(5);
    expect(inserted({ cols: 1, rows: 1, rateShift: 0 }).rate_shift).toBe(0);
  });

  it('and the band row reads back what the panel prints — value AND explicitness', () => {
    // The read side the panel renders, not the raw band: an absent key must show
    // the contract's default AND say it is not spelled, which is what stops an
    // author from believing the file pins a rate it does not.
    const d = doc();
    const r = promoteBandCommand(d, bandBudget(d).firstPromotableSlot, {
      cols: 1, rows: 1, rateShift: DEFAULT_RATE_SHIFT + 1,
    });
    if (!r.ok) throw new Error(r.reason);
    const explicit = bandRows(applyForTest(d, r.command)).at(-1)!;
    expect(explicit.rateShift).toBe(DEFAULT_RATE_SHIFT + 1);
    expect(explicit.rateShiftIsExplicit).toBe(true);

    const d2 = doc();
    const r2 = promoteBandCommand(d2, bandBudget(d2).firstPromotableSlot, { cols: 1, rows: 1 });
    if (!r2.ok) throw new Error(r2.reason);
    const bare = bandRows(applyForTest(d2, r2.command)).at(-1)!;
    expect(bare.rateShiftIsExplicit).toBe(false);
    expect(bare.rateShift).toBe(DEFAULT_RATE_SHIFT);
  });
});
