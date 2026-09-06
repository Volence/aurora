/**
 * `default_off` AS A SWITCH AN AUTHOR CAN MOVE — the command, its two refusals,
 * and the quantifier of each.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * Until this parcel Aurora PRESERVED this key and could not author it. aeon's
 * own contract says what that was worth, in as many words: "it holds only
 * because an author cannot currently CREATE or CHANGE the key, so the consumer
 * is PRESERVING rather than VALIDATING. The day a writer exposes it, that writer
 * can emit a document this build refuses." This is that day, so this file is
 * the check that arrives with it.
 *
 * ═══ THE QUANTIFIER OF EVERY ROW, STATED ═══
 *
 * aeon's two obligations are NOT the same shape and reading them as one is the
 * trap their contract names by name:
 *
 *   PER ACT   — the act must have exactly ONE tile animation. The constraint is
 *               on `len(anims)`, NOT on how many bands carry the key and NOT on
 *               whether the bands agree about it.
 *   PER BAND  — the band the key lands on must have
 *               `pattern_px == BGANIM_VIEW_DERIVED_PERIOD_PX`.
 *   PER ACT   — and one nobody names, because it is arithmetic rather than a
 *               rule: silencing a band ADDS the DEBUG view twins to the emitted
 *               section, so it GROWS the act. Near the ceiling it is refused.
 *
 * ⚠ THE DISCRIMINATING ROW IS THE ONE MARKED SO BELOW. A validator asking "do
 * the tile animations AGREE about default_off?" passes a two-band act in which
 * BOTH carry the key, and that act is a document this build refuses. A test
 * that only exercises the inconsistent case cannot tell the two validators
 * apart, so it proves nothing about the one that matters.
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

// ── PER ACT: the band-count refusal, and the quantifier that decides it ─────

describe('PER ACT: the constraint is the band COUNT, never agreement', () => {
  it('refuses silencing band 0 of a two-band act', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    expect(() => makeSetBandDefaultOffCommand(d, 0, true)).toThrow(/EXACTLY ONE tile animation/);
  });

  /**
   * REACHABILITY, AND IT IS NOT THE DISCRIMINATING ROW — measured, not assumed.
   *
   * This row says a consistent two-band silenced act cannot be BUILT through
   * the command: both first steps are refused, so there is no second step. That
   * is worth holding, and it is worth being honest that it does NOT tell the
   * two validators apart. Planted the per-key validator (`off.length !==
   * bands.length` in `viewsEmitted`) and this row STAYED GREEN, because every
   * intermediate state is inconsistent and the wrong validator refuses those
   * too. The rows that went red are the two marked DISCRIMINATING below and in
   * `bg-anim-aeon.ship-silent.test.ts`, which build the consistent act directly
   * rather than trying to reach it.
   *
   * Both bands are checked, not one: a validator keyed on the FIRST band, or on
   * "the band already carrying it", would pass one of the two.
   */
  it('a consistent two-band silenced act is UNREACHABLE: both first steps refuse', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES]);
    for (const index of [0, 1]) {
      let message = '';
      try {
        makeSetBandDefaultOffCommand(d, index, true);
        throw new Error(`band ${index} was NOT refused`);
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      expect(message, `band ${index}`).toMatch(/EXACTLY ONE tile animation/);
      // The refusal says WHICH quantifier, so an author cannot read it as
      // "make them agree" and try the other band.
      expect(message, `band ${index}`).toMatch(/not on whether they agree/);
    }
    // And the state a consistency validator would have arrived at is therefore
    // UNREACHABLE from a legal document through this command: neither first
    // step is allowed, so there is no second step.
    expect(documentBands(d).some(b => b.default_off)).toBe(false);
  });

  /**
   * ⚠ THE DISCRIMINATING ROW, and it earns the name: planted the per-key
   * validator (`off.length !== bands.length` in `viewsEmitted`) and this row
   * went RED while every reachability row above stayed green.
   *
   * A validator asking "do the tile animations AGREE about `default_off`?"
   * answers YES here and computes a section size for a document the build
   * refuses outright. The act is built DIRECTLY because that is the only way to
   * hold this shape: the command cannot produce it (the row above), but a
   * document arriving from disk, a hand edit or a future aeon can, and Aurora
   * would then price and offer work on an act that will not bake.
   *
   * It is also why the codec answers `{ ok: false }` rather than "no twins":
   * a refusal is not a smaller section, and a caller that read it as one would
   * print a LARGER budget for the worst document there is.
   */
  it('DISCRIMINATING: a CONSISTENT two-band silenced act has no computable size', () => {
    const d = doc([PERIOD_TILES, PERIOD_TILES], [{ default_off: true }, { default_off: true }]);
    const size = bganimSectionBytes(documentBands(d));
    expect(size.ok).toBe(false);
    expect(size.ok ? '' : size.reason).toMatch(/not on whether they agree/);
  });
});

// ── PER BAND: the period refusal ────────────────────────────────────────────

describe('PER BAND: the silenced band\'s pattern period', () => {
  it('refuses a one-band act at any other period', () => {
    // HALF the derived period, so the band is legal in every other respect: its
    // rotation unit is still a power of two and its blob still fits.
    const wrong = PERIOD_TILES / 2;
    const d = doc([wrong]);
    expect(documentBands(d)[0].pattern_px).not.toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
    expect(validateBgOverride(d), 'the fixture must be legal apart from the period').toEqual([]);
    expect(() => makeSetBandDefaultOffCommand(d, 0, true))
      .toThrow(new RegExp(String(BGANIM_VIEW_DERIVED_PERIOD_PX)));
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

  it('refuses to silence an act that only fits without the twins', () => {
    const n = widestFittingWithoutTwins();
    // `cols` must keep the band legal; a one-row band's rotation unit is
    // `rows * TILE_BYTES`, which is a power of two at rows = 1 for any width.
    const d = doc([n]);
    expect(bgOverrideSectionIssues(d), 'the fixture must fit before the twins').toEqual([]);
    expect(() => makeSetBandDefaultOffCommand(d, 0, true)).toThrow();
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
