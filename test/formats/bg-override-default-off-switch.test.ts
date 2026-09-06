/**
 * `default_off` AS A SWITCH AN AUTHOR CAN MOVE — the command, its two refusals,
 * and the quantifier of each.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * Until 2026-09-06 Aurora PRESERVED this key and could not author it. aeon's own
 * contract says what that was worth, in as many words: "it holds only because an
 * author cannot currently CREATE or CHANGE the key, so the consumer is
 * PRESERVING rather than VALIDATING."
 *
 * ═══ ⚠ AND THE TWO REFUSALS THIS FILE WAS NAMED FOR ARE GONE ═══
 *
 * Both were `AssertionError`s in aeon's `tools/inject_editor_bg.py` and neither
 * raises since aeon `364b7bce` (an ancestor of `origin/master` `d070d6d7`). The
 * SAME two conditions now decide whether the DEBUG view twins are EMITTED, and
 * an act failing either builds without them. Their contract's instruction, read
 * at that revision: *"Read each item as 'if this does not hold, `views_emitted()`
 * returns 0', never as 'the build refuses'."*
 *
 * ⚠ SO EVERY `toThrow` ROW BELOW BECAME A `not.toThrow` ROW, AND THAT IS THE
 * WEAKEST KIND OF ASSERTION THERE IS — a command that had stopped working
 * entirely would satisfy it. Each one therefore ends with the CONSEQUENCE that
 * must appear in the refusal's place: the command is executed, the document
 * really carries the key afterwards, and the section size moves by exactly the
 * twins' own cost.
 *
 * ═══ THE QUANTIFIER OF EVERY ROW, STATED ═══
 *
 * aeon's two conditions are NOT the same shape and reading them as one is the
 * trap their contract names by name. What changed is only what they decide:
 *
 *   PER ACT   — the twins need exactly ONE tile animation. The constraint is on
 *               `len(anims)`, NOT on how many bands carry the key and NOT on
 *               whether the bands agree about it.
 *   PER BAND  — the band the key lands on must have
 *               `pattern_px == BGANIM_VIEW_DERIVED_PERIOD_PX`.
 *   PER ACT   — and one nobody names, because it is arithmetic rather than a
 *               rule: silencing a QUALIFYING band adds the twins to the emitted
 *               section, so it GROWS the act.
 *
 * ⚠ THE DISCRIMINATING SHAPE IS UNCHANGED AND ITS CONSEQUENCE IS NOT. A
 * validator asking "do the tile animations AGREE about default_off?" answers YES
 * on a two-band act where both carry the key, and so predicts twins for an act
 * that emits none. That used to be a refusal told apart from an acceptance; it is
 * now a SIZE told apart from another size, by exactly `bganimViewTwinBytes`.
 *
 * ═══ EVERY NUMBER IS DERIVED ═══
 *
 * The period comes from `BGANIM_VIEW_DERIVED_PERIOD_PX` (vendored from aeon and
 * held current by `bg-override-contract-currency.test.ts`), the twin count from
 * `BGANIM_VIEW_COUNT`, the ceiling arithmetic from the same operands the codec
 * uses. Nothing here types 64, 3 or 20480.
 */

import { describe, it, expect } from 'vitest';
import {
  makeSetBandDefaultOffCommand,
} from '../../src/core/editing/bg-override-band';
import { EditHistory } from '../../src/core/editing/history';
import {
  documentBands,
  writeBandDefaultOff,
} from '../../src/core/formats/bg-override/bg-anim-band';
import {
  bganimSectionBytes,
  bganimViewTwinBytes,
  viewsEmitted,
  bgOverrideSectionIssues,
  validateBgOverride,
  BGANIM_BYTES_PER_SLOT,
  BGANIM_COUNT_BYTES,
  BGANIM_PHASE_BANKS,
  BGANIM_RECORD_BYTES,
  BGANIM_SECTION_CEILING,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BG_LAYOUT_WORDS,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  TILE_WIDTH_PX,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';
import type { S4Level } from '../../src/core/editing/commands';

// ── Fixtures, built from the contract's own numbers ─────────────────────────

/** Tiles at the ONE period the twins were derived against, in TILES. */
const PERIOD_TILES = BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX;

function tile(fill: number): number[] {
  return Array.from({ length: TILE_PIXELS }, () => fill % (TILE_PIXEL_MAX + 1));
}

function tiles(count: number): number[][] {
  return Array.from({ length: count }, (_, i) => tile(i + 1));
}

/** A band prefix-identical to `blob[slotBase ...]`, one row tall. */
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

/** A document carrying `widths.length` bands packed contiguously from slot 0. */
function doc(widths: number[], extras: Partial<BgOverrideBand>[] = []): BgOverrideDocument {
  const total = widths.reduce((n, w) => n + w, 0);
  const blob = tiles(total);
  const anims: BgOverrideBand[] = [];
  let base = 0;
  widths.forEach((w, i) => {
    anims.push(band(blob, base, w, extras[i] ?? {}));
    base += w;
  });
  return {
    layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0),
    tiles: blob,
    anims,
  };
}

/** A one-band act at the derived period, the only shape aeon's twins accept. */
function silenceableDoc(): BgOverrideDocument {
  return doc([PERIOD_TILES]);
}

/** The same act with the key already set — the one shape that GETS the twins. */
function silenceableDocSilenced(): BgOverrideDocument {
  return doc([PERIOD_TILES], [{ default_off: true }]);
}

/** The level shape `EditHistory` writes an override document back through. */
function levelFor(d: BgOverrideDocument): S4Level {
  return { sections: [], bgOverride: d } as unknown as S4Level;
}

/** `'default_off' in band` — the question a test about ABSENCE has to ask. */
function keyPresent(d: BgOverrideDocument, index = 0): boolean {
  return Object.prototype.hasOwnProperty.call(documentBands(d)[index], 'default_off');
}

// ── ANTI-VACUOUS: the fixture is the shape every row below assumes ──────────

describe('the fixture is what these rows think it is', () => {
  it('is a legal, sizeable one-band act at the derived period, with the key ABSENT', () => {
    const d = silenceableDoc();
    expect(validateBgOverride(d)).toEqual([]);
    expect(bgOverrideSectionIssues(d)).toEqual([]);
    expect(documentBands(d)).toHaveLength(1);
    expect(documentBands(d)[0].pattern_px).toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
    expect(keyPresent(d)).toBe(false);
  });

  it('a two-band act is legal too, so a refusal below is about the KEY and not the shape', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    expect(validateBgOverride(d)).toEqual([]);
    expect(bgOverrideSectionIssues(d)).toEqual([]);
  });
});

// ── The command: what it writes ─────────────────────────────────────────────

describe('makeSetBandDefaultOffCommand: what lands in the document', () => {
  it('silencing writes `default_off: true` on that band and touches nothing else', () => {
    const d = silenceableDoc();
    const tilesBefore = d.tiles;
    const phasesBefore = documentBands(d)[0].phases;
    new EditHistory().execute(makeSetBandDefaultOffCommand(d, 0, true), levelFor(d));
    expect(documentBands(d)[0].default_off).toBe(true);
    // No art moved: this key is the ONE override edit that changes only the ROM.
    expect(d.tiles).toBe(tilesBefore);
    expect(documentBands(d)[0].phases).toBe(phasesBefore);
  });

  it('CLEARING DELETES THE KEY, it does not write `false`', () => {
    const d = doc([PERIOD_TILES], [{ default_off: true }]);
    new EditHistory().execute(makeSetBandDefaultOffCommand(d, 0, false), levelFor(d));
    // The distinction the whole `boolean | undefined` shape exists for: absent
    // is aeon's default, and a written `false` would be Aurora freezing that
    // default into a file that never spelled it.
    expect(keyPresent(d)).toBe(false);
    expect(documentBands(d)[0].default_off).toBeUndefined();
  });

  it('undo of a silencing restores ABSENCE, not `false`', () => {
    const d = silenceableDoc();
    const h = new EditHistory();
    h.execute(makeSetBandDefaultOffCommand(d, 0, true), levelFor(d));
    expect(keyPresent(d)).toBe(true);
    h.undo(levelFor(d));
    expect(keyPresent(d)).toBe(false);
  });

  it('undo of a clearing restores an EXPLICIT `false` a foreign document held', () => {
    // A document Aurora did not write can spell `false`. Undo must put back
    // what was there, which is what makes `oldValue` a recorded value rather
    // than a recomputed one.
    const d = doc([PERIOD_TILES], [{ default_off: false }]);
    const h = new EditHistory();
    h.execute(makeSetBandDefaultOffCommand(d, 0, true), levelFor(d));
    h.undo(levelFor(d));
    expect(keyPresent(d)).toBe(true);
    expect(documentBands(d)[0].default_off).toBe(false);
  });

  it('refuses a no-op in both directions rather than recording an empty undo step', () => {
    const silent = doc([PERIOD_TILES], [{ default_off: true }]);
    expect(() => makeSetBandDefaultOffCommand(silent, 0, true)).toThrow(/changes nothing/);
    const loud = silenceableDoc();
    expect(() => makeSetBandDefaultOffCommand(loud, 0, false)).toThrow(/changes nothing/);
  });

  it('refuses a band index the document does not have', () => {
    expect(() => makeSetBandDefaultOffCommand(silenceableDoc(), 3, true))
      .toThrow(/does not exist/);
  });
});

// ── PER ACT: the band count, and the quantifier that decides the twins ─────

describe('PER ACT: the condition is the band COUNT, never agreement', () => {
  /**
   * ⚠ INVERTED BY aeon's DECOUPLE. This row asserted a throw naming "EXACTLY ONE
   * tile animation"; silencing a band of a two-band act is now a legal ship
   * decision at any band count.
   *
   * NOT A BARE `not.toThrow`: the command is EXECUTED and the document is read
   * back, so a `makeSetBandDefaultOffCommand` that had been reduced to a no-op
   * would fail here.
   */
  it('ALLOWS silencing band 0 of a two-band act, and the key really lands', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    expect(() => makeSetBandDefaultOffCommand(d, 0, true)).not.toThrow();
    new EditHistory().execute(makeSetBandDefaultOffCommand(d, 0, true), levelFor(d));
    expect(documentBands(d).map(b => Boolean(b.default_off))).toEqual([true, false]);
  });

  /**
   * REACHABILITY, INVERTED. The consistent two-band silenced act used to be
   * UNREACHABLE through this command — both first steps refused, so there was no
   * second step — and it is now built one step at a time like anything else.
   *
   * Both bands are still driven, not one: a command keyed on the FIRST band or
   * on "the band already carrying it" would pass with one of the two dead.
   */
  it('a consistent two-band silenced act is now REACHABLE, one step at a time', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    const history = new EditHistory();
    for (const index of [0, 1]) {
      expect(() => makeSetBandDefaultOffCommand(d, index, true), `band ${index}`).not.toThrow();
      history.execute(makeSetBandDefaultOffCommand(d, index, true), levelFor(d));
    }
    expect(documentBands(d).every(b => b.default_off)).toBe(true);
    // And the shape it arrived at is a shape the build accepts, with no twins.
    expect(bgOverrideSectionIssues(d)).toEqual([]);
    expect(viewsEmitted(documentBands(d))).toEqual({ ok: true, value: 0 });
  });

  /**
   * ⚠ THE DISCRIMINATING ROW, RE-POINTED. It used to say a CONSISTENT two-band
   * silenced act has no computable size, because a per-key validator ("do the
   * bands agree?") priced a document aeon refused. Both validators price it now,
   * so the refusal can no longer tell them apart — and the SIZE still can.
   *
   * The per-key validator would emit twins here (all bands agree) and the correct
   * one does not, so its figure would be high by the twins' own cost. Derived on
   * both sides; nothing typed.
   */
  it('DISCRIMINATING: a CONSISTENT two-band silenced act is priced WITHOUT twins', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES], [{ default_off: true }, { default_off: true }]);
    // Anti-vacuous: the shape really is the one a per-key validator gets wrong.
    expect(documentBands(d).every(b => b.default_off)).toBe(true);
    const size = bganimSectionBytes(documentBands(d));
    expect(size.ok).toBe(true);
    expect(bganimViewTwinBytes(documentBands(d))).toBe(0);
    // The DIFFERENTIAL a stub cannot produce: the one-band shape does get them.
    expect(bganimViewTwinBytes(documentBands(silenceableDocSilenced())))
      .toBe(BGANIM_VIEW_COUNT * (BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES));
  });
});

// ── PER BAND: the period refusal ────────────────────────────────────────────

describe('PER BAND: the silenced band\'s pattern period', () => {
  /**
   * ⚠ INVERTED BY aeon's DECOUPLE, and their contract states the reason in the
   * item itself: *"Any other period gets no twins, so the shift is never applied
   * to a period it was not computed for. That protection is what the old refusal
   * was buying and it is fully intact; what the refusal was ALSO doing was
   * failing the build on a correct ship decision."*
   */
  it('ALLOWS a one-band act at any other period: the twins decline instead', () => {
    // HALF the derived period, so the band is legal in every other respect: its
    // rotation unit is still a power of two and its blob still fits.
    const wrong = PERIOD_TILES / 2;
    const d = doc([wrong]);
    expect(documentBands(d)[0].pattern_px).not.toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
    expect(validateBgOverride(d), 'the fixture must be legal apart from the period').toEqual([]);
    expect(() => makeSetBandDefaultOffCommand(d, 0, true)).not.toThrow();
    new EditHistory().execute(makeSetBandDefaultOffCommand(d, 0, true), levelFor(d));
    expect(Boolean(documentBands(d)[0].default_off)).toBe(true);
    // THE PROTECTION THE REFUSAL WAS BUYING, still bought: no twins run at a
    // period their rate shift was not derived against.
    expect(viewsEmitted(documentBands(d))).toEqual({ ok: true, value: 0 });
  });

  it('accepts the one period the twins were derived against', () => {
    expect(() => makeSetBandDefaultOffCommand(silenceableDoc(), 0, true)).not.toThrow();
  });
});

// ── PER ACT: silencing GROWS the section, so the ceiling can refuse it ──────

describe('PER ACT: the twins are bytes, so the ceiling is in play', () => {
  /**
   * The largest one-band act that fits WITHOUT twins but not WITH them. Derived
   * from the same operands the codec uses, so this row cannot be satisfied by a
   * literal going stale.
   */
  function widestFittingWithoutTwins(): number {
    const table = BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES;
    return Math.floor((BGANIM_SECTION_CEILING - table) / BGANIM_BYTES_PER_SLOT);
  }

  it('silencing costs exactly BGANIM_VIEW_COUNT extra tables', () => {
    const d = silenceableDoc();
    const before = bganimSectionBytes(documentBands(d));
    writeBandDefaultOff(d, 0, true);
    const after = bganimSectionBytes(documentBands(d));
    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    expect(after.value - before.value)
      .toBe(BGANIM_VIEW_COUNT * (BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES));
  });

  /**
   * ⚠ THIS ROW WAS VACUOUS BEFORE THE DECOUPLE AND IT TOOK THE DECOUPLE TO SHOW
   * IT. It was titled *"refuses to silence an act that only fits without the
   * twins"* and it did throw — on the PERIOD, not on the ceiling. The fixture is
   * `widestFittingWithoutTwins()` COLS wide, so its `pattern_px` is that many
   * tiles wide and could not be the one period the twins were derived at; the
   * ceiling arm was never reached. A row asserting the right outcome for the
   * wrong reason, which is the shape that survives review.
   *
   * AND THE WINDOW IT CLAIMED IS EMPTY, derived rather than asserted: the twins
   * cost less than ONE slot, and the ceiling's slot allowance is a floor
   * division by the slot size, so the allowance is the SAME number with and
   * without them. There is no one-band act that fits without the twins and not
   * with them — which is why the row could not have been written honestly.
   */
  it('the twins can never push a fitting one-band act over: the allowance is unchanged', () => {
    const table = BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES;
    const twins = BGANIM_VIEW_COUNT * table;
    // The twins are cheaper than one slot, which is the whole of it.
    expect(twins).toBeLessThan(BGANIM_BYTES_PER_SLOT);
    const without = Math.floor((BGANIM_SECTION_CEILING - table) / BGANIM_BYTES_PER_SLOT);
    const with_ = Math.floor((BGANIM_SECTION_CEILING - table - twins) / BGANIM_BYTES_PER_SLOT);
    expect(with_).toBe(without);
    expect(without).toBe(widestFittingWithoutTwins());
  });

  /**
   * WHAT THE CEILING CAN STILL REFUSE: growing an act that is ALREADY over it.
   * Silencing a qualifying band adds the twins, and `sectionHarm`'s do-no-harm
   * rule refuses growth on an over-budget act — the one arm of this command that
   * the decouple left standing.
   */
  it('still refuses to silence an act that is ALREADY over the ceiling', () => {
    const d = silenceableDoc();
    // Make it over-budget without touching its band shape: the ceiling is on the
    // act's total, and the blob is what carries the slots.
    const over = doc([PERIOD_TILES]);
    (over.anims as BgOverrideBand[])[0].rows = BGANIM_SECTION_CEILING;
    expect(bgOverrideSectionIssues(over).length, 'the fixture must be over budget')
      .toBeGreaterThan(0);
    expect(() => makeSetBandDefaultOffCommand(over, 0, true)).toThrow();
    // Anti-vacuous: the SAME edit on the in-budget document is allowed.
    expect(() => makeSetBandDefaultOffCommand(d, 0, true)).not.toThrow();
  });

  it('CLEARING is never refused, because it always shrinks: the repair path', () => {
    // A DOCUMENT AURORA DID NOT WRITE, refused in two independent ways at once:
    // it is over the ceiling AND its silenced band is at the wrong period, so
    // `bganimSectionBytes` cannot even size it. Both are states an author can
    // arrive holding, from a hand edit or from aeon, and clearing the key is
    // the way out of both. A rule stated as "the result must fit" would refuse
    // the repair and leave hand-editing JSON as the only road.
    const n = widestFittingWithoutTwins() + 1;
    const d = doc([n], [{ default_off: true }]);
    expect(documentBands(d)[0].pattern_px, 'the fixture must be at the WRONG period')
      .not.toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
    expect(validateBgOverride(d), 'and legal in every other respect').toEqual([]);
    expect(bgOverrideSectionIssues(d).length, 'the fixture must be refused').toBeGreaterThan(0);
    expect(() => makeSetBandDefaultOffCommand(d, 0, false)).not.toThrow();
    // And it really is still over budget afterwards: the repair is partial, and
    // allowing a partial repair is the whole point.
    new EditHistory().execute(makeSetBandDefaultOffCommand(d, 0, false), levelFor(d));
    expect(bgOverrideSectionIssues(d).length).toBeGreaterThan(0);
  });
});
