import { describe, it, expect } from 'vitest';
import {
  bandBudget,
  shipSilentSwitch,
  twinCouplingApplies,
  promoteUnavailableReason,
  insertUnavailableReason,
  SHIP_SILENT_LEAD,
  SHIP_SILENT_OBLIGATIONS,
  SHIP_SILENT_EXCHANGE,
  TWIN_COUPLING_DISCLOSURE,
} from '../bg-anim-aeon';
import { documentBands } from '../../../core/formats/bg-override/bg-anim-band';
import {
  BGANIM_PHASE_BANKS,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BG_LAYOUT_WORDS,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  TILE_WIDTH_PX,
  validateBgOverride,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';

/**
 * THE SHIP-SILENT SWITCH AS THE PANEL SEES IT — plus the disclosure that covers
 * the gap until aeon decouples the debug view twins from the act's band count.
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
 *   `twinCouplingApplies(...)`         PER ACT  — does ANY band carry the key
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
   * BOTH BANDS OF A TWO-BAND ACT ARE REFUSED, including the one whose silencing
   * would make the act CONSISTENT.
   *
   * ⚠ AND THIS IS NOT THE DISCRIMINATING ROW, measured rather than assumed:
   * with the per-key validator planted in `viewsEmitted` this row stays GREEN,
   * because every state it visits is inconsistent and the wrong validator
   * refuses those too. The discriminating row at this layer is the budget one
   * at the bottom of this file. Kept because "the greyed option and the failed
   * click say the same sentence" is its own property and this is where it lives.
   */
  it('refuses BOTH bands of a two-band act, on the COUNT and in one sentence', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    for (const index of [0, 1]) {
      const s = shipSilentSwitch(d, index)!;
      expect(s.silent, `band ${index} starts loud`).toBe(false);
      expect(s.reason, `band ${index} must be refused`).not.toBeNull();
      expect(s.reason!, `band ${index}`).toMatch(/EXACTLY ONE tile animation/);
      expect(s.reason!, `band ${index}`).toMatch(/not on whether they agree/);
      // And the refusal a click gives is the SAME sentence the greyed option
      // carries. This is the property the provider builds the command for.
      const r = s.run();
      expect(r.ok).toBe(false);
      expect(r.ok ? '' : r.reason).toBe(s.reason);
    }
  });

  it('refuses a band at the wrong period, naming the one period there is', () => {
    const s = shipSilentSwitch(doc([PERIOD_TILES / 2]), 0)!;
    expect(s.reason).not.toBeNull();
    expect(s.reason!).toContain(String(BGANIM_VIEW_DERIVED_PERIOD_PX));
  });
});

// ── The disclosure, and the gap it covers ───────────────────────────────────

describe('twinCouplingApplies: the disclosure fires exactly when the build refuses', () => {
  it('is false for an act with no silenced tile animation', () => {
    expect(twinCouplingApplies(null)).toBe(false);
    expect(twinCouplingApplies(doc([PERIOD_TILES]))).toBe(false);
    expect(twinCouplingApplies(doc([PERIOD_TILES, PERIOD_TILES]))).toBe(false);
  });

  it('is true for aeon\'s own shipped shape', () => {
    expect(twinCouplingApplies(aeonShapedDoc())).toBe(true);
  });

  /**
   * ⚠ THE QUANTIFIER ROW FOR THE DISCLOSURE ITSELF, and it was ADDED BECAUSE A
   * PLANT WENT GREEN WITHOUT IT. Swapping `some` for `every` in
   * `twinCouplingApplies` passed every other row in this file: a one-band
   * silenced act satisfies both, and an act with none satisfies neither. The
   * MIXED act is the only shape that tells them apart, and it is exactly the
   * shape the disclosure exists for — a document where one tile animation is
   * silenced and another is not, which is a document the build already refuses
   * and which an author can arrive holding.
   *
   * `every` is the plausible mistake, not a strawman: "the act boots silent"
   * sounds like a property of all its bands. It is not. ANY silenced band arms
   * aeon's rule.
   */
  it('QUANTIFIER: is true for a MIXED act, where only one tile animation is silenced', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES], [{ default_off: true }, {}]);
    expect(documentBands(d).map(b => Boolean(b.default_off))).toEqual([true, false]);
    expect(twinCouplingApplies(d)).toBe(true);
    // And it is a document the build refuses, so the disclosure is telling the
    // truth about why the doors below it are off.
    expect(promoteUnavailableReason(d, 1, 1)).toMatch(/EXACTLY ONE tile animation/);
  });

  /**
   * THE POINT OF THE DISCLOSURE, PINNED. On a document in this state BOTH
   * creation doors already refuse, with aeon's own reason. The disclosure is
   * not a substitute for those refusals; it is the sentence that reaches an
   * author BEFORE they aim a range, and it names the control that resolves it.
   * This row is what makes "the doors are off for that reason, not because of a
   * budget" a measured claim rather than a hopeful one.
   */
  it('is true exactly when both creation doors refuse for the twin reason', () => {
    const d = aeonShapedDoc();
    const promote = promoteUnavailableReason(d, 1, 1);
    const insert = insertUnavailableReason(d, 1, 1);
    expect(promote).not.toBeNull();
    expect(insert).not.toBeNull();
    expect(promote).toMatch(/EXACTLY ONE tile animation/);
    // ONE SENTENCE FOR BOTH DOORS, because it is one fact: measured, the two
    // refusals are identical, which is why the disclosure is rendered once
    // above both rather than per door.
    expect(insert).toBe(promote);
    expect(twinCouplingApplies(d)).toBe(true);
  });

  it('a legal two-band act is NOT disclosed, so the sentence is not noise', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    expect(twinCouplingApplies(d)).toBe(false);
    // Anti-vacuous the other way: this act really can take another door.
    expect(promoteUnavailableReason(d, 1, 1)).toBeNull();
  });
});

// ── The read model on a document the build refuses ─────────────────────────

describe('an act the build refuses is LOUD in the panel, never priced', () => {
  /**
   * ⚠ THE DISCRIMINATING ROW AT THIS LAYER, and it earns the name: planted the
   * per-key validator (`off.length !== bands.length` in `viewsEmitted`) and
   * this row goes RED while every switch row above stays green.
   *
   * A two-band act in which BOTH bands carry the key is CONSISTENT, so the
   * wrong validator prices it: `byteSlotsRemaining` becomes a number, `binding`
   * becomes a budget, and the panel prints a ROM-section line and an offer of
   * free slots for an act that cannot bake. What must happen instead is the
   * unmeasurable direction: no number, `slotsRemaining` collapsed to ZERO, and
   * a sentence saying why. THE DIRECTION IS THE PROPERTY — falling through to
   * the looser tile figure is the exact defect the section-ceiling parcel
   * landed against, one budget over.
   */
  it('DISCRIMINATING: a CONSISTENT two-band silenced act is unmeasurable, not priced', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES], [{ default_off: true }, { default_off: true }]);
    // Anti-vacuous: the shape really is the consistent one.
    expect(documentBands(d).every(b => b.default_off)).toBe(true);
    const b = bandBudget(d);
    expect(b.sectionBytes).toBeNull();
    expect(b.byteSlotsRemaining).toBeNull();
    expect(b.binding).toBe('unmeasurable');
    // And the offer collapses to zero rather than to the tile figure, which is
    // plainly non-zero on this fixture.
    expect(b.tileSlotsRemaining).toBeGreaterThan(0);
    expect(b.slotsRemaining).toBe(0);
    expect(b.unmeasurable).toMatch(/not on whether they agree/);
  });

  it('and both creation doors refuse it too, rather than offering the tile budget', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES], [{ default_off: true }, { default_off: true }]);
    expect(promoteUnavailableReason(d, 1, 1)).toMatch(/EXACTLY ONE tile animation/);
    expect(insertUnavailableReason(d, 1, 1)).toMatch(/EXACTLY ONE tile animation/);
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

  it('the disclosure names the remedy in AURORA\'s words, not the JSON key', () => {
    expect(TWIN_COUPLING_DISCLOSURE).toMatch(/ships animating/);
    expect(TWIN_COUPLING_DISCLOSURE).toMatch(/SECOND/);
    // It must not blame a budget: that is the wrong diagnosis an author would
    // otherwise reach, with the two budget lines right above the control.
    expect(TWIN_COUPLING_DISCLOSURE).toMatch(/not because of a budget/);
  });
});
