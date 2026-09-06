import { describe, it, expect } from 'vitest';
import {
  bandBudget,
  shipSilentSwitch,
  promoteUnavailableReason,
  insertUnavailableReason,
  SHIP_SILENT_LEAD,
  SHIP_SILENT_OBLIGATIONS,
  SHIP_SILENT_EXCHANGE,
} from '../bg-anim-aeon';
import { documentBands } from '../../../core/formats/bg-override/bg-anim-band';
import {
  BGANIM_PHASE_BANKS,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BGANIM_COUNT_BYTES,
  BGANIM_RECORD_BYTES,
  bganimViewTwinBytes,
  viewsEmitted,
  BG_LAYOUT_WORDS,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  TILE_WIDTH_PX,
  validateBgOverride,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';

/**
 * THE SHIP-SILENT SWITCH AS THE PANEL SEES IT, AFTER aeon's DECOUPLE.
 *
 * ⚠ THIS FILE USED TO PIN A WALL THAT NO LONGER EXISTS. It was written while
 * `default_off` was coupled to the DEBUG view twins by two `AssertionError`s in
 * `tools/inject_editor_bg.py`, and it held Aurora's refusals against them.
 * Neither raises since aeon `364b7bce` (verified an ancestor of `origin/master`
 * `d070d6d7`): the same two conditions now decide whether the twins are EMITTED,
 * and an act that fails them builds without them. So every row that asserted a
 * REFUSAL here now asserts the ABSENCE of one — and, because "no refusal" is
 * what a broken predicate also produces, each of those rows carries a positive
 * consequence beside it (the command runs, the act is PRICED, the byte figure
 * moves by `bganimViewTwinBytes`) rather than a bare `toBeNull()`.
 *
 * ═══ WHAT IS BEING CHECKED, AND AT WHICH QUANTIFIER ═══
 *
 *   `shipSilentSwitch(...).silent`     PER BAND  — does THIS band carry the key
 *   `shipSilentSwitch(...).actBootsSilent` PER ACT — does ANY band carry it
 *   `shipSilentSwitch(...).reason`     PER ACT for the band-count rule and the
 *                                      ceiling, PER BAND for the period rule.
 *                                      None of the three is worded in the
 *                                      provider: it builds the command and
 *                                      keeps its refusal, so a greyed control
 *                                      and a failed click cannot disagree.
 *   `viewsEmitted(...)`                PER ACT for the count, PER BAND for the
 *                                      period — and it now returns 0 twins
 *                                      instead of refusing.
 *
 * ═══ THE COPY IS PART OF THE CONTRACT, SO IT IS CHECKED ═══
 *
 * aeon's contract does not merely say what `default_off` does; it says what
 * order to say it in — "READ THIS FIRST, ahead of either obligation, and put it
 * in author-facing copy before either: `default_off` changes what SHIPS." A
 * surface that led with the obligations would be telling an author this is a
 * thing with rules before telling them it is a thing with consequences. The
 * rows at the bottom hold that order, and hold the two quantifier words in the
 * obligations sentence, because "per act" and "per band" ARE the trap.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

const PERIOD_TILES = BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX;

function tile(fill: number): number[] {
  return Array.from({ length: TILE_PIXELS }, () => fill % (TILE_PIXEL_MAX + 1));
}

function band(
  blob: number[][], slotBase: number, cols: number, extra: Partial<BgOverrideBand> = {},
): BgOverrideBand {
  const rest = blob.slice(slotBase, slotBase + cols);
  return {
    cols,
    rows: 1,
    pattern_px: cols * TILE_WIDTH_PX,
    phases: Array.from({ length: BGANIM_PHASE_BANKS }, (_, p) =>
      p === 0 ? rest.map(t => [...t]) : rest.map(t => t.map(v => (v + p) % (TILE_PIXEL_MAX + 1)))),
    ...extra,
  } as BgOverrideBand;
}

function doc(widths: number[], extras: Partial<BgOverrideBand>[] = []): BgOverrideDocument {
  const total = widths.reduce((n, w) => n + w, 0);
  const blob = Array.from({ length: total }, (_, i) => tile(i + 1));
  const anims: BgOverrideBand[] = [];
  let base = 0;
  widths.forEach((w, i) => { anims.push(band(blob, base, w, extras[i] ?? {})); base += w; });
  return { layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0), tiles: blob, anims };
}

/** aeon's own shipped shape: one band at the derived period, silenced. */
function aeonShapedDoc(): BgOverrideDocument {
  return doc([PERIOD_TILES], [{ default_off: true }]);
}

// ── ANTI-VACUOUS ────────────────────────────────────────────────────────────

describe('the fixtures are the shapes these rows assume', () => {
  it('the aeon-shaped document is legal, one band, silenced, at the derived period', () => {
    const d = aeonShapedDoc();
    expect(validateBgOverride(d)).toEqual([]);
    expect(documentBands(d)).toHaveLength(1);
    expect(documentBands(d)[0].default_off).toBe(true);
    expect(documentBands(d)[0].pattern_px).toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
  });
});

// ── The switch ──────────────────────────────────────────────────────────────

describe('shipSilentSwitch', () => {
  it('is null when there is no document or no such band', () => {
    expect(shipSilentSwitch(null, 0)).toBeNull();
    expect(shipSilentSwitch(doc([PERIOD_TILES]), 4)).toBeNull();
  });

  it('reads the band state PER BAND and the act state PER ACT', () => {
    const d = aeonShapedDoc();
    const s = shipSilentSwitch(d, 0)!;
    expect(s.silent).toBe(true);
    expect(s.actBootsSilent).toBe(true);
    const loud = shipSilentSwitch(doc([PERIOD_TILES]), 0)!;
    expect(loud.silent).toBe(false);
    expect(loud.actBootsSilent).toBe(false);
  });

  it('offers the flip on a one-band act at the derived period', () => {
    const s = shipSilentSwitch(doc([PERIOD_TILES]), 0)!;
    expect(s.reason).toBeNull();
    const r = s.run();
    expect(r.ok).toBe(true);
  });

  it('always offers the way BACK, so a silenced act is never a trap', () => {
    const s = shipSilentSwitch(aeonShapedDoc(), 0)!;
    expect(s.reason).toBeNull();
    expect(s.run().ok).toBe(true);
  });

  /**
   * BOTH BANDS OF A TWO-BAND ACT ARE OFFERED — this row asserted the opposite
   * until aeon's decouple, and the inversion is the parcel.
   *
   * ⚠ "NO REFUSAL" IS ALSO WHAT A BROKEN PREDICATE PRODUCES, so the row does not
   * stop at `reason === null`: the command is RUN, and the act is priced
   * afterwards. A `shipSilentSwitch` that returned a null reason and a dead
   * `run` would pass a bare null check and fail this one.
   */
  it('OFFERS both bands of a two-band act, and the twins simply decline', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    for (const index of [0, 1]) {
      const s = shipSilentSwitch(d, index)!;
      expect(s.silent, `band ${index} starts loud`).toBe(false);
      expect(s.reason, `band ${index} is a legal ship decision now`).toBeNull();
      const r = s.run();
      expect(r.ok, `band ${index} run`).toBe(true);
    }
    // The condition is UNCHANGED, only its consequence: a two-band act gets no
    // twins, and says so as a number rather than as a refusal.
    const bands = documentBands(doc([PERIOD_TILES, PERIOD_TILES],
      [{ default_off: true }, {}]));
    expect(viewsEmitted(bands)).toEqual({ ok: true, value: 0 });
    expect(bganimViewTwinBytes(bands)).toBe(0);
  });

  it('OFFERS a band at the wrong period too: the twins decline, the build does not', () => {
    const s = shipSilentSwitch(doc([PERIOD_TILES / 2]), 0)!;
    expect(s.reason).toBeNull();
    expect(s.run().ok).toBe(true);
    const bands = documentBands(doc([PERIOD_TILES / 2], [{ default_off: true }]));
    // Anti-vacuous: this really is a period the twins were not derived against.
    expect(bands[0]!.pattern_px).not.toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
    expect(viewsEmitted(bands)).toEqual({ ok: true, value: 0 });
  });
});

// ── The wall that is gone, and the pricing that replaced it ────────────

/**
 * ⚠ EVERY ROW BELOW WAS ONCE A REFUSAL ROW. `twinCouplingApplies` and
 * `TWIN_COUPLING_DISCLOSURE` are DELETED — there is no longer a wall to
 * announce — and what the disclosure existed to prevent (an author meeting the
 * engine's refusal instead of ours) is now prevented by there being no refusal.
 *
 * THE HAZARD THIS DESCRIBE IS BUILT AGAINST: a suite that only checks refusals
 * are gone passes on a codec that has stopped computing anything at all. So each
 * row pairs the absence with the number that must appear in its place, and the
 * last one is the arithmetic — the twins' cost has to be the act's own table
 * three times over, which nothing but a working emitter model produces.
 */
describe('the twin coupling is RETIRED: the doors open and the act is priced', () => {
  it('aeon\'s own shipped shape still gets its twins, so the decouple changed nothing there', () => {
    const bands = documentBands(aeonShapedDoc());
    expect(bands).toHaveLength(1);
    expect(viewsEmitted(bands)).toEqual({ ok: true, value: BGANIM_VIEW_COUNT });
    // DERIVED, never typed: BGANIM_VIEW_COUNT * (COUNT_BYTES + RECORD_BYTES).
    expect(bganimViewTwinBytes(bands))
      .toBe(BGANIM_VIEW_COUNT * (BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES));
  });

  /**
   * THE ROW THE WHOLE PARCEL IS FOR. On aeon's shipped document both creation
   * doors used to return the twin refusal, byte-identical, and the Effects
   * tool-options bar printed it across the top of the window. They must now be
   * OPEN.
   *
   * Anti-vacuous in both directions: the doors are open AND the act is still
   * priced with room left, so a `promoteUnavailableReason` that had simply
   * stopped working would not pass.
   */
  it('both creation doors are OPEN on the shipped shape, where they used to refuse', () => {
    const d = aeonShapedDoc();
    expect(promoteUnavailableReason(d, 1, 1)).toBeNull();
    expect(insertUnavailableReason(d, 1, 1)).toBeNull();
    const b = bandBudget(d);
    expect(b.binding).not.toBe('unmeasurable');
    expect(b.slotsRemaining).toBeGreaterThan(0);
  });

  it('a MIXED act (one silenced tile animation, one not) is legal and priced', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES], [{ default_off: true }, {}]);
    // Anti-vacuous: the shape really is the mixed one.
    expect(documentBands(d).map(b => Boolean(b.default_off))).toEqual([true, false]);
    expect(promoteUnavailableReason(d, 1, 1)).toBeNull();
    const b = bandBudget(d);
    expect(b.sectionBytes).not.toBeNull();
    expect(b.binding).not.toBe('unmeasurable');
  });

  /**
   * ⚠ THE ROW THAT WAS CALLED "DISCRIMINATING" AND HAS CHANGED SIDES. A
   * CONSISTENT two-band silenced act used to be the one shape that told a correct
   * `viewsEmitted` from the plausible per-key one (`off.length !== bands.length`),
   * because the wrong validator PRICED it while the right one refused. Pricing is
   * now correct for both, so that discrimination went with the refusal — said out
   * loud rather than left as a row still wearing the word.
   *
   * WHAT STILL DISCRIMINATES IS THE SIZE, and it is the row below this one.
   */
  it('a CONSISTENT two-band silenced act is PRICED, not refused', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES], [{ default_off: true }, { default_off: true }]);
    expect(documentBands(d).every(b => b.default_off)).toBe(true);
    const b = bandBudget(d);
    expect(b.sectionBytes).not.toBeNull();
    expect(b.byteSlotsRemaining).not.toBeNull();
    expect(b.binding).not.toBe('unmeasurable');
    expect(b.unmeasurable).toBeNull();
    expect(b.slotsRemaining).toBeGreaterThan(0);
  });

  /**
   * SIZE, NOT SILENCE — the quantifier row, re-pointed at the consequence the
   * decouple left behind. aeon's contract states the cost of getting it wrong in
   * these words: *"predict twins where there are none and your section figure is
   * `3 * (2 + 44)` = 138 B too large."* Both operands are derived here.
   */
  it('QUANTIFIER: the twins are on the ACT\'S BAND COUNT, and a wrong one is a SIZE error', () => {
    const one = documentBands(aeonShapedDoc());
    const two = documentBands(
      doc([PERIOD_TILES, PERIOD_TILES], [{ default_off: true }, { default_off: true }]));
    // The consistent two-band act is exactly the shape a per-key validator gets
    // wrong: every band agrees, so "are they consistent?" answers yes.
    expect(two.every(b => b.default_off)).toBe(true);
    expect(bganimViewTwinBytes(two)).toBe(0);
    expect(bganimViewTwinBytes(one)).toBeGreaterThan(0);
    expect(bganimViewTwinBytes(one))
      .toBe(BGANIM_VIEW_COUNT * (BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES));
  });

  it('an act with no silenced tile animation is untouched by any of this', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    expect(viewsEmitted(documentBands(d))).toEqual({ ok: true, value: 0 });
    expect(bganimViewTwinBytes(documentBands(d))).toBe(0);
    expect(promoteUnavailableReason(d, 1, 1)).toBeNull();
  });
});

// ── The copy ────────────────────────────────────────────────────────────────

describe('the author-facing copy says the shipped-behaviour fact FIRST', () => {
  it('the lead names the release ROM before it names any rule', () => {
    expect(SHIP_SILENT_LEAD).toMatch(/RELEASE INCLUDED/);
    // aeon's ordering requirement, as a position check rather than a vibe: the
    // release fact is in the LEAD constant, and the obligations are in a
    // different one that the panel renders after it.
    expect(SHIP_SILENT_LEAD).not.toMatch(/exactly ONE/);
    expect(SHIP_SILENT_LEAD.indexOf('SHIPS')).toBeLessThan(SHIP_SILENT_LEAD.indexOf('OFF'));
  });

  it('the lead refuses the preview reading out loud', () => {
    expect(SHIP_SILENT_LEAD).toMatch(/not what you see here/i);
  });

  it('the obligations sentence spells BOTH quantifiers, which is the trap', () => {
    expect(SHIP_SILENT_OBLIGATIONS).toMatch(/PER ACT/);
    expect(SHIP_SILENT_OBLIGATIONS).toMatch(/PER TILE ANIMATION/);
    // The count-not-agreement half, in author-facing words.
    expect(SHIP_SILENT_OBLIGATIONS).toMatch(/COUNT/);
    // And the period, derived rather than typed.
    expect(SHIP_SILENT_OBLIGATIONS).toContain(`${BGANIM_VIEW_DERIVED_PERIOD_PX}px`);
  });

  it('the exchange sentence says the twins are DEBUG ONLY', () => {
    expect(SHIP_SILENT_EXCHANGE).toContain(String(BGANIM_VIEW_COUNT));
    expect(SHIP_SILENT_EXCHANGE).toMatch(/debug ROM/i);
    // The reading that would put the animation back in the release ROM.
    expect(SHIP_SILENT_EXCHANGE).toMatch(/not a way to see this animation in the game/i);
  });

  /**
   * ⚠ THE SENTENCE THAT WENT FALSE. `SHIP_SILENT_OBLIGATIONS` ended *"Either one
   * refuses the build outright"* and the build stopped refusing. This row is not
   * a paraphrase check: it names the two claims the copy may no longer make, so a
   * future edit restoring either argues with a test rather than with a reader's
   * memory.
   */
  it('the obligations sentence no longer claims the build refuses', () => {
    expect(SHIP_SILENT_OBLIGATIONS).not.toMatch(/refuses the\s+build/i);
    expect(SHIP_SILENT_OBLIGATIONS).not.toMatch(/build outright/i);
    // And it says what the two conditions DO decide, which is the only reason to
    // go on stating them at all.
    expect(SHIP_SILENT_OBLIGATIONS).toMatch(/twins are emitted/i);
  });
});
