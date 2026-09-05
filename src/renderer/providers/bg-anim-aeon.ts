// Aeon port for the BgAnim band editor: every decision the band panel makes, as
// pure functions over plain values.
//
// WHY A PROVIDER AND NOT LOGIC IN THE COMPONENT. The same reason effects-aeon
// gives one file over: the node-only suite cannot see React, so a decision made
// inside a component is a decision nothing in `vitest run` can check. The
// interesting decisions on this surface are all of that kind — which drivers a
// dropdown may offer, which row counts are legal, where a promotion's default
// static base is, and (the one this surface turns on) WHY an operation is
// unavailable. They live here; the component wires events to them and renders.
//
// EVERY MUTATION RETURNS A COMMAND, it does not execute one — the rule
// effects-aeon states, for the same reason: `executeCommand` throws for a
// non-aeon focused document, so a function that dispatched could only be tested
// with a whole focused aeon session standing up.
//
// ═══ THE TWO THINGS THIS SURFACE IS SHAPED BY ═══
//
// 1. A BAND'S ART HAS TWO SOURCES, AND THEY ARE PEERS. Promotion MOVES a static
//    range to the front of the blob (`tiles.length` unchanged, so it works at
//    any capacity); insertion ADDS new art (the blob grows by cols*rows, so it
//    needs that many free slots). Both are first-class doors and this file
//    treats them symmetrically — same result type, same refusal discipline, an
//    availability answer for each.
//
//    THE CAPACITY CEILING IS REAL AND THE SATURATION IS NOT. 448 is
//    `(0xB800-0x8000)/32`, the BG tile region below the sprite attribute table,
//    and it does not move. aeon's live document happening to sit at 448/448
//    today is one generator run's property — the owner has ruled that background
//    a non-final experiment and the aeon lane is adding a band-tile reserve — so
//    an interface shaped around "insertion never works" would be shaped around a
//    transient. An earlier revision of this file said exactly that; it is
//    corrected here rather than quietly rewritten.
//
//    What the ceiling DOES earn is the readout. `bandBudget` exists so
//    `tileSlotsRemaining` and `bandsRemaining` can sit beside the controls that
//    spend them, and so a refusal explains itself: capacity is a live quantity
//    an author manages, in both directions.
//
// 2. A DRIVER IS A SCALAR SOURCE, NEVER AN AXIS — and since aeon 3a4712fa
//    (2026-09-02) the axis is a SEPARATE KEY rather than a fixed fact. The
//    driver says only where the step's scalar is read from (aeon
//    engine/level/bg_anim.emp; the vendored contract's `drivers` block); `axis`
//    says which way the pattern translates, `horizontal` (the default, scrolls
//    LEFT) or `vertical` (scrolls UP). `camera_y` still does NOT mean vertical
//    motion, and that is now a sharper correction rather than a softer one,
//    because the surface HAS a vertical option and it is not that one. Both
//    lists come from the codec, which reads them out of the vendored contract,
//    so this file cannot hold a stale driver or a stale axis list.
//
//    THE GEOMETRY RULE MOVES WITH THE AXIS. The power-of-two constraint is on
//    the ROTATION UNIT in bytes and keeps its shape on both arms — what changes
//    is which key carries it: `rows` on a horizontal band, `cols` on a vertical
//    one. So the picker that offers legal sizes is axis-parameterised
//    (`rotationUnitChoices`), never a fixed row list.
//
// EVERY REFUSAL IS THE CODEC'S OWN WORDS. Nothing here restates a bound or
// composes a second explanation for one: the builders call the command
// factories, catch `BgOverrideError`, and hand its message up. That is what
// makes "why is this button off" the same sentence in the UI, in the agent
// reply, and in the test — one rulebook, quoted rather than paraphrased.

import type { AnyCommand } from '../../core/editing/commands';
import {
  BAND_DEFAULTS,
  BGANIM_DRIVER_NAMES,
  BGANIM_MAX_BANDS,
  BG_TILE_CAPACITY,
  TILE_BYTES,
  TILE_WIDTH_PX,
  animatedSlotCount,
  bandColumnBytes,
  bandPatternPx,
  bandRotationUnitBytes,
  BAND_AXIS_DEFAULT,
  BGANIM_BAND_AXES,
  bandTileCount,
  type BgAnimBandAxis,
  type BgAnimDriver,
  type BgOverrideDocument,
} from '../../core/formats/bg-override/bg-override';
import {
  bandFromStaticTiles,
  bandsRemaining,
  createBand,
  describeBands,
  documentBands,
  tileSlotsRemaining,
  type BandPhaseFill,
  type BgAnimBandView,
} from '../../core/formats/bg-override/bg-anim-band';
import {
  makeAddBandCommand,
  makeDemoteBandCommand,
  makePromoteBandCommand,
  makeRemoveBandCommand,
} from '../../core/editing/bg-override-band';

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * A command, or the reason there isn't one.
 *
 * NOT `AnyCommand | null`. effects-aeon can use null because its refusals are
 * no-ops ("the value didn't change"), and a no-op needs no explanation. Every
 * refusal on THIS surface is a bound the author has to understand in order to
 * get past it — a full blob, a band ceiling, a range that overlaps an existing
 * band's prefix — so the reason is part of the return type and the UI has no
 * way to drop it on the floor.
 */
export type BandCommandResult =
  | { ok: true; command: AnyCommand }
  | { ok: false; reason: string };

function refusal(e: unknown): { ok: false; reason: string } {
  return { ok: false, reason: e instanceof Error ? e.message : String(e) };
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export interface DriverOption { value: string; label: string; title: string }

/**
 * What a driver dropdown offers, derived from BGANIM_DRIVER_NAMES.
 *
 * The LABEL is the contract's own key, unchanged — an author reading the JSON
 * and an author reading the dropdown must see the same word. The TITLE is where
 * the axis correction lives, on every option including `camera_y`, because
 * "camera_y" is the one name that reads like a vertical instruction and is not
 * one.
 */
export function driverOptions(): DriverOption[] {
  return BGANIM_DRIVER_NAMES.map((name) => ({
    value: name,
    label: name,
    title: `${name}: the SCALAR the tile animation's step is read from. A driver never sets an `
      + 'axis: camera_y does NOT mean vertical motion. Use the Axis control for that.',
  }));
}

// ---------------------------------------------------------------------------
// Phase fill
// ---------------------------------------------------------------------------

export interface PhaseFillOption {
  value: BandPhaseFill;
  label: string;
  title: string;
  /** The sentence the panel prints under the action while this mode is picked. */
  note: string;
}

/**
 * The selector's default is 'copy' AT BOTH DOORS, deliberately: it is the fill
 * that edits nothing the author did not ask for — a promoted band draws what
 * its slots already drew, and an inserted band's phase 0 is blank art, over
 * which every mode agrees. 'shift' is the authoring primitive and is always one
 * explicit pick away, never a surprise.
 */
export const DEFAULT_PHASE_FILL: BandPhaseFill = 'copy';

/**
 * What the banks-1..7 selector offers, with the consequence of each mode spelled
 * out where the panel can print it. In the provider rather than the component
 * for the file-header reason: which sentence goes with which mode is a decision,
 * and decisions in the component are decisions `vitest run` cannot see.
 */
export function phaseFillOptions(): PhaseFillOption[] {
  return [
    {
      value: 'copy', label: 'copy of phase 0',
      title: 'Banks 1 to 7 are copies of phase 0: the tile animation draws the same art at every '
        + 'step, so nothing moves until you author its frames. The fill that edits nothing.',
      note: 'banks 1 to 7 arrive as copies of phase 0, so the tile animation is inert until you draw '
        + 'its frames.',
    },
    {
      value: 'shift', label: 'pre-shifted (moves)',
      title: 'Bank k is phase 0 scrolled k px within the tile animation’s own pattern width (the '
        + 'contract’s "pre-shifted art 1px apart") so it scrolls as soon as it is '
        + 'saved. Phase 0, the picture at rest, is unchanged.',
      note: 'banks 1 to 7 are phase 0 pre-shifted 1 px per bank, wrapping at the pattern edge, '
        + 'so the tile animation MOVES with no further authoring. The picture at rest is unchanged.',
    },
    {
      value: 'blank', label: 'blank',
      title: 'Banks 1 to 7 are blank art. The picture holds at rest but BREAKS on the tile animation’s '
        + 'second phase until you draw the frames, a deliberate authoring start.',
      note: 'banks 1 to 7 arrive blank: the picture BREAKS on the tile animation’s second phase until '
        + 'you draw the frames.',
    },
  ];
}

/**
 * The driver a band uses when the document does not spell one out.
 *
 * Read from the contract via `describeBands`, never typed in: the whole point of
 * leaving the key absent is that the file tracks the consumer's default, so a
 * panel that displayed a hardcoded default would lie about what would happen if
 * the engine changed it.
 */
export const DEFAULT_DRIVER: BgAnimDriver = BGANIM_DRIVER_NAMES[0];

// ---------------------------------------------------------------------------
// Rate — the one number on this surface that runs BACKWARDS
// ---------------------------------------------------------------------------

/**
 * The `rate_shift` a band uses when the document does not spell one out.
 *
 * READ FROM THE CONTRACT, never typed in — `BAND_DEFAULTS.rate_shift` is itself
 * `bandKeys.rate_shift.default` out of the vendored consumer contract. The whole
 * point of leaving the key absent is that the file tracks whatever the consumer
 * defaults to, so a panel that PRINTED a literal would tell an author the wrong
 * thing the day aeon changed it — and a form that SEEDED itself with a literal
 * would freeze today's default into every document it wrote.
 */
export const DEFAULT_RATE_SHIFT: number = BAND_DEFAULTS.rate_shift;

/**
 * Clamp a typed `rate_shift` to what the contract accepts: `nonNegativeInt`.
 *
 * THE CLAMP IS THE BOUND. `NumberField`'s `min` governs the spinner and
 * `:invalid` styling and stops no TYPED value (ROADMAP item 37) — so without
 * this a `-3` in the box reaches `createBand`, and the codec's refusal
 * ("rate_shift must be an integer >= 0") is the author's only feedback, arriving
 * as a red sentence after a click rather than as a field that cannot hold a
 * wrong value.
 *
 * NO UPPER BOUND, DELIBERATELY. The contract states `kind: nonNegativeInt` with
 * no maximum, and a UI that refused a value aeon would happily bake is a worse
 * defect than one that permits a silly one. A large shift is not illegal, only
 * useless, and `rateShiftNote` is where that is said — in words, without
 * blocking.
 *
 * A non-finite value (the empty box mid-keystroke) falls to the CONTRACT'S
 * DEFAULT rather than to 0, the same choice `clampSceneField` makes in
 * effects-aeon: 0 is a real, very fast rate, and silently landing on it is a
 * worse surprise than landing on the value the document would have had anyway.
 */
export function clampRateShift(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RATE_SHIFT;
  return Math.max(0, Math.round(value));
}

/**
 * Clamp a typed promotion base to the first slot a promotion may legally take.
 *
 * THE CLAMP IS THE BOUND, and this one exists because the field was ALREADY
 * ADVERTISING it (ROADMAP item 40). "From tile" renders `min={firstPromotableSlot}`
 * and used to enforce `Math.max(0, …)` — so the number on the spinner and the
 * number the form held were two different bounds, and every slot between 0 and
 * the animated prefix was typeable. `requirePromotableRange` would refuse such
 * a promotion, but only AFTER the click, and in the meantime the panel's own
 * readouts lied: the field's title and the hint under it print
 * `slotSpanPhrase(staticBase, …)`, naming slots that belong to a band, and the
 * map lens tints those cells.
 *
 * `firstPromotableSlot` IS PASSED IN, not re-derived, so the caller can hand
 * the same expression to `min` and to this and the two cannot drift.
 *
 * NO UPPER BOUND HERE, DELIBERATELY, and this is not the `clampRateShift` case
 * (where the contract states none). A real ceiling exists — `staticBase + n`
 * must fit inside `tiles` — but it moves with the candidate's `cols`/`rows`,
 * which the author edits AFTER the base, so clamping to it would rewrite a base
 * that a subsequent geometry edit makes legal again. It is also not displayed:
 * the field carries no `max`, and enforcing an invisible ceiling is the mirror
 * image of the defect this fixes. That end stays where it already is — a named
 * refusal out of `requirePromotableRange`, quoting the blob's real length.
 *
 * A non-finite value falls to `firstPromotableSlot` — the same slot the form
 * seeds at, and the one place a promotion is legal by construction. THAT IS NOT
 * "the box mid-keystroke", which is what this line used to say: an emptied box
 * used to arrive as `Number('')`, which is 0 — finite, and floored straight up
 * to `firstPromotableSlot` as though the author had typed it. `NumberField` now
 * commits nothing for a box with no number in it, so this arm serves values
 * from elsewhere only.
 */
export function clampStaticBase(value: number, firstPromotableSlot: number): number {
  if (!Number.isFinite(value)) return firstPromotableSlot;
  return Math.max(firstPromotableSlot, Math.round(value));
}

/**
 * What a given `rate_shift` MEANS, in the direction an author gets wrong.
 *
 * `step = driver_value >> rate_shift` (the contract's own citation), so the band
 * advances one step per `2^rate_shift` units of its driver: HIGHER IS SLOWER.
 * That is backwards from every intuition about a field one reads as "speed", and
 * it is the reason this sentence exists rather than a bare spinner.
 *
 * THE NUMBER IS DERIVED FROM THE FORMULA, NOT FROM A THRESHOLD. There is a
 * useless end of this range — a shift wide enough that the step is always zero —
 * but the vendored contract carries NO driver width to derive it from (the
 * `drivers` block names the three scalar sources and nothing about their size;
 * the only `u16` in the file sits inside an English `why` string about a
 * different constant). So this states the exact consequence of the author's own
 * number and lets it grow absurd on its own, rather than printing a bound this
 * repo would have had to guess.
 */
export function rateShiftNote(rateShift: number): string {
  const n = clampRateShift(rateShift);
  const units = 2 ** n;
  const per = Number.isFinite(units) ? units.toLocaleString('en-US') : `2^${n}`;
  return `step = driver >> ${n}: the tile animation advances 1 px per ${per} driver `
    + `unit${units === 1 ? '' : 's'}. HIGHER IS SLOWER: each +1 halves the speed.`;
}

// ---------------------------------------------------------------------------
// Geometry the pickers may offer
// ---------------------------------------------------------------------------

/**
 * Row counts a band may have.
 *
 * THE CONSTRAINT IS ON BYTES, NOT ON ROWS. The runtime rotates a whole pattern
 * column by SHIFTING it, so `col_bytes = rows * TILE_BYTES` must be an exact
 * power of two (`col_shift = col_bytes.bit_length() - 1`, asserted). This
 * enumerates the candidates by evaluating that condition through the codec's own
 * `bandColumnBytes` rather than by asserting "rows must be a power of two" — the
 * equivalent statement, but one derivation step further from the rule as the
 * consumer spells it, and therefore free to drift if TILE_BYTES ever stopped
 * being a power of two itself.
 *
 * OFFERING IS NOT ENFORCING. The refusal still comes from `createBand` →
 * `validateBgOverride`; this only keeps a picker from showing a choice that
 * cannot work.
 */
export function rowChoices(): number[] {
  return rotationUnitChoices(BAND_AXIS_DEFAULT);
}

/**
 * Tile counts the band's ROTATION-UNIT key may take, on a given axis.
 *
 * ONE PICKER, TWO KEYS. The constraint never changes shape — the runtime rotates
 * a whole unit by SHIFTING, so `unit_bytes` must be an exact power of two — but
 * which band key carries it does: `rows` on a horizontal band, `cols` on a
 * vertical one (aeon `_AXIS_UNIT_TILES`). This evaluates the condition through
 * the codec's own `bandRotationUnitBytes` on a probe band of the given axis,
 * rather than restating "must be a power of two" one derivation step away from
 * the rule as the consumer spells it.
 *
 * OFFERING IS NOT ENFORCING. The refusal still comes from `createBand` →
 * `validateBgOverride`; this only keeps a picker from showing a dead choice.
 */
export function rotationUnitChoices(axis: BgAnimBandAxis): number[] {
  const out: number[] = [];
  // A band's slots are a prefix of a blob that can never exceed BG_TILE_CAPACITY,
  // so no legal band's unit is longer than that — the ceiling is derived, not a
  // round number picked to look generous.
  for (let tiles = 1; tiles <= BG_TILE_CAPACITY; tiles++) {
    const probe = axis === BAND_AXIS_DEFAULT
      ? { cols: 1, rows: tiles, axis } : { cols: tiles, rows: 1, axis };
    const bytes = bandRotationUnitBytes(probe);
    if (bytes > 0 && (bytes & (bytes - 1)) === 0) out.push(tiles);
  }
  return out;
}

/**
 * `pattern_px` for a geometry — the period ALONG THE AXIS, so `cols*8` on a
 * horizontal band and `rows*8` on a vertical one. Through the codec, because a
 * second `cols * TILE_WIDTH_PX` here is exactly the horizontal-only expression
 * this parcel went looking for.
 */
export function patternPxFor(cols: number, rows = 1, axis: BgAnimBandAxis = BAND_AXIS_DEFAULT): number {
  return bandPatternPx({ cols, rows, axis });
}

/**
 * The axis picker's options. Names come from the codec (which reads them out of
 * the vendored contract), and each carries the two things an author cannot guess
 * from the word: which way it actually scrolls, and which key the power-of-two
 * rule lands on once they pick it.
 */
export interface AxisOption { value: BgAnimBandAxis; label: string; title: string }

export function axisOptions(): AxisOption[] {
  return BGANIM_BAND_AXES.map((axis) => {
    const horizontal = axis === BAND_AXIS_DEFAULT;
    return {
      value: axis,
      label: horizontal ? 'horizontal (scrolls left)' : 'vertical (scrolls up)',
      title: horizontal
        ? 'The pattern translates along X. Its period is cols*8 px, and ROWS is the key that must '
          + 'make rows*32 a power of two. As the driver scalar increases the art scrolls LEFT; '
          + 'direction is fixed by the mechanism and is not a setting.'
        : 'The pattern translates along Y. Its period is rows*8 px, and COLS is the key that must '
          + 'make cols*32 a power of two. As the driver scalar increases the art scrolls UP; '
          + 'direction is fixed by the mechanism and is not a setting. The pre-shifted fill '
          + 'becomes a vertical roll, and the slots are ordered row-major.',
    };
  });
}

// ---------------------------------------------------------------------------
// The read model
// ---------------------------------------------------------------------------

export interface BandBudget {
  bands: number;
  maxBands: number;
  bandsRemaining: number;
  /** Slots the bands own — the animated PREFIX of `tiles`, not an addition to it. */
  animatedSlots: number;
  /** `tiles.length`. */
  tiles: number;
  tileCapacity: number;
  tileSlotsRemaining: number;
  /** The first slot a promotion may take from: past every band's prefix. */
  firstPromotableSlot: number;
}

/**
 * Everything the panel puts on screen as a number, in one derivation.
 *
 * IT IS ON SCREEN BECAUSE OF THE DEAD-BUTTON RULE. `insertBand` refuses at every
 * size on the only real document there is, and an author who meets a disabled
 * control with no number beside it learns nothing. `tileSlotsRemaining: 0` next
 * to a greyed "Add" is the difference between a broken editor and an
 * editor telling the truth about a full blob.
 */
export function bandBudget(doc: BgOverrideDocument | null): BandBudget {
  if (!doc) {
    return {
      bands: 0, maxBands: BGANIM_MAX_BANDS, bandsRemaining: 0,
      animatedSlots: 0, tiles: 0, tileCapacity: BG_TILE_CAPACITY,
      tileSlotsRemaining: 0, firstPromotableSlot: 0,
    };
  }
  const bands = documentBands(doc);
  const animated = animatedSlotCount(bands);
  return {
    bands: bands.length,
    maxBands: BGANIM_MAX_BANDS,
    bandsRemaining: bandsRemaining(doc),
    animatedSlots: animated,
    tiles: Array.isArray(doc.tiles) ? doc.tiles.length : 0,
    tileCapacity: BG_TILE_CAPACITY,
    tileSlotsRemaining: tileSlotsRemaining(doc),
    firstPromotableSlot: animated,
  };
}

/**
 * What an EMPTY range is called on screen. Its own words, because arithmetic
 * has none: `base + count - 1` on a zero-length range renders `0..-1`, which is
 * not a range a reader can act on. See `slotSpanPhrase`.
 */
export const NO_SLOTS_PHRASE = 'no slots';

/**
 * `"slots 12..19"` — the slots a `count`-long range starting at `base` ACTUALLY
 * CONTAINS, for any readout that names one.
 *
 * ⚠ THE SECOND NUMBER IS THE LAST SLOT IN THE RANGE, NOT THE FIRST ONE PAST IT.
 * Every count on this surface is a COUNT — `tileCount`, `animatedSlots`,
 * `firstPromotableSlot` (`bandBudget` sets it from `animatedSlotCount`) — so
 * `base + count` is the first slot the range does NOT own, and printing it
 * hands the author a slot that belongs to somebody else. On the only real
 * document there is, `slots 0..32` over 32 animated slots names slot 32, which
 * is precisely the first slot a PROMOTION drag may take. `d7ec678` fixed that
 * exact sentence in the strip's refusal hint the day before; this is the same
 * convention, in one place, so the three surviving readouts cannot drift from
 * the arithmetic again. Both halves are derived from the same `count` the range
 * is built from — never typed.
 *
 * The empty range is DECIDED rather than inherited: `count <= 0` has no last
 * slot, so it gets `NO_SLOTS_PHRASE` instead of a backwards `0..-1`.
 */
export function slotSpanPhrase(base: number, count: number): string {
  if (count <= 0) return NO_SLOTS_PHRASE;
  return `slots ${slotSpanDigits(base, count)}`;
}

/**
 * `"12..19"` — the SAME span, without the noun, for a readout whose box has no
 * room for one.
 *
 * ⚠ THIS IS WHERE THE ARITHMETIC LIVES, and `slotSpanPhrase` is now a wrapper
 * over it rather than a second copy. That is the whole point: item 54 put every
 * inclusive `base..last` in ONE place so the readouts could not drift apart
 * again, and a narrow surface that hand-rolled `${base}..${base + count - 1}`
 * to save six characters would put the off-by-one straight back — on the one
 * readout with no room to show its working.
 *
 * WHEN TO USE WHICH: the phrase, always, unless the span has been MEASURED not
 * to fit. `ArtBrowser`'s hover line is the only such surface today — its box is
 * ~102px beside a `flexShrink: 0` count label in a 224px docked panel, and the
 * phrase form of a real three-digit span overflows it by ~30px. Everywhere with
 * room says "slots" out loud, including that line's own `title`.
 *
 * The empty range answers `NO_SLOTS_PHRASE` here too, so the two forms agree
 * about what nothing is called — a bare `..` form of "no slots" would be the
 * backwards `0..-1` this constant exists to prevent.
 */
export function slotSpanDigits(base: number, count: number): string {
  if (count <= 0) return NO_SLOTS_PHRASE;
  return `${base}..${base + count - 1}`;
}

export interface BandRow extends BgAnimBandView {
  /** `"32x4"` — the geometry as an author says it out loud. */
  geometry: string;
  /**
   * `"slots 0..127"` — the slots the band owns, FIRST..LAST inclusive, ready to
   * print in the row's subtitle. See `slotSpanPhrase` for why the second half
   * is the last owned slot rather than one past it.
   */
  slotRange: string;
}

/** The band list, straight off `describeBands` with two display strings added. */
export function bandRows(doc: BgOverrideDocument | null): BandRow[] {
  if (!doc) return [];
  return describeBands(doc).map((v) => ({
    ...v,
    geometry: `${v.cols}x${v.rows}`,
    slotRange: slotSpanPhrase(v.slotBase, v.tileCount),
  }));
}

// ---------------------------------------------------------------------------
// Availability — why a control is off
// ---------------------------------------------------------------------------

/**
 * Why an INSERT of a `cols x rows` band is unavailable, or null when it is not.
 *
 * ASKED AHEAD OF THE COMMAND, and it is one of the two places on this surface
 * where a reason is composed here rather than quoted from the codec. It has to
 * be: `makeAddBandCommand` answers by throwing, and a panel cannot throw once
 * per render to decide whether to grey a button. The wording is kept
 * deliberately close to the codec's own refusals, and the two are pinned against
 * each other in the tests — if this ever says "available" where the command
 * refuses, that is the dead button this whole shape exists to prevent.
 *
 * IT NAMES PROMOTION AS THE WAY THROUGH, and that is not a demotion of
 * insertion. The two doors are peers; when this one is shut for want of slots,
 * the other one is the fact the author needs, exactly as `tileSlotsRemaining` is.
 */
export function insertUnavailableReason(
  doc: BgOverrideDocument | null, cols: number, rows: number,
): string | null {
  if (!doc) return 'this project has no editor_bg_override.json to add a tile animation to.';
  const budget = bandBudget(doc);
  if (budget.bandsRemaining <= 0) {
    return `the document already carries ${budget.bands} tile animation(s), which is the ceiling `
      + `of ${budget.maxBands}. Raising it is an engine change, never a writer decision.`;
  }
  const n = bandTileCount({ cols, rows });
  if (n > budget.tileSlotsRemaining) {
    return `adding a tile animation puts its ${n} tile(s) INTO the blob, and the blob has `
      + `${budget.tileSlotsRemaining} free slot(s) of ${budget.tileCapacity}. `
      + 'PROMOTE an existing static range instead: promotion moves art the document already '
      + 'carries, so it does not grow the blob and works on a full one.';
  }
  return null;
}

/**
 * Why a PROMOTION of `cols x rows` at `staticBase` is unavailable, or null.
 *
 * Only the band ceiling and the "is there a document" question are answered
 * here. Everything about the RANGE — past the end of the blob, overlapping a
 * band's prefix, a non-integer base — is left to the command, because those
 * refusals are per-attempt rather than per-render and the codec's wording for
 * them is the wording the author needs.
 */
export function promoteUnavailableReason(doc: BgOverrideDocument | null): string | null {
  if (!doc) return 'this project has no editor_bg_override.json to promote tiles in.';
  const budget = bandBudget(doc);
  if (budget.tiles === 0) return 'the document carries no tiles, so there is nothing to promote.';
  if (budget.bandsRemaining <= 0) {
    return `the document already carries ${budget.bands} tile animation(s), which is the ceiling `
      + `of ${budget.maxBands}. Demote or remove one first.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The four mutations
// ---------------------------------------------------------------------------

export interface BandSpec {
  cols: number;
  rows: number;
  /**
   * How banks 1..7 are filled from phase 0. Omit for each door's own default —
   * 'copy' on a promotion, 'blank' on an insertion — which are the fills that
   * change nothing the author did not ask for. 'shift' is the authoring
   * primitive: bank k is phase 0 scrolled k px within the band's own pattern,
   * which is the contract's "pre-shifted art 1px apart", so the band MOVES.
   */
  phaseFill?: BandPhaseFill;
  /**
   * Which way the band moves. Omit to leave the key out (the document then
   * tracks aeon's own default, `horizontal`). It reaches the fill, so a vertical
   * band asked for `phaseFill: 'shift'` gets a VERTICAL roll — the pairing that
   * would otherwise bake clean and ship a shimmer.
   */
  axis?: BgAnimBandAxis;
  /** Omit to leave the key out, so the document tracks the consumer's default. */
  driver?: BgAnimDriver;
  /** Omit to leave the key out. */
  rateShift?: number;
}

/**
 * PROMOTE `tiles[staticBase : staticBase + cols*rows]` into a new band.
 *
 * ART THE DOCUMENT ALREADY CARRIES. The band's phase-0 art is READ from the blob
 * (`bandFromStaticTiles`); by default banks 1..7 arrive as copies of it, so the
 * band is visually inert until an author draws its frames — the picture is
 * identical before and after, which is what lets a structural edit be safe on a
 * shipping background. `phaseFill: 'shift'` derives them as the contract's
 * pre-shifted phases instead, so the promoted art scrolls with no further work;
 * the picture at rest (phase 0) is still identical either way.
 */
export function promoteBandCommand(
  doc: BgOverrideDocument | null, staticBase: number, spec: BandSpec,
): BandCommandResult {
  if (!doc) return { ok: false, reason: 'no BG override document is loaded' };
  try {
    const band = bandFromStaticTiles(doc, staticBase, {
      cols: spec.cols, rows: spec.rows,
      ...(spec.phaseFill !== undefined ? { phaseFill: spec.phaseFill } : {}),
      ...(spec.axis !== undefined ? { axis: spec.axis } : {}),
      ...(spec.driver !== undefined ? { driver: spec.driver } : {}),
      ...(spec.rateShift !== undefined ? { rate_shift: spec.rateShift } : {}),
    });
    return { ok: true, command: makePromoteBandCommand(doc, band, staticBase) };
  } catch (e) {
    return refusal(e);
  }
}

/**
 * DEMOTE a band back to static art. Lossless in both directions — the slots move
 * into the static region rather than being deleted, so there is no art to lose
 * and no cell to blank.
 */
export function demoteBandCommand(
  doc: BgOverrideDocument | null, bandIndex: number, staticBase?: number,
): BandCommandResult {
  if (!doc) return { ok: false, reason: 'no BG override document is loaded' };
  try {
    return { ok: true, command: makeDemoteBandCommand(doc, bandIndex, staticBase) };
  } catch (e) {
    return refusal(e);
  }
}

/**
 * ADD a band whose art comes from OUTSIDE the document — blank by default.
 *
 * NEW ART. Grows the blob by `cols*rows`, so it needs that many free slots —
 * which is a capacity question, not a rarity: this is a first-class door beside
 * promotion, and the free-slot count sits next to it so an author managing the
 * budget can see what the operation costs before spending it.
 */
export function addBandCommand(
  doc: BgOverrideDocument | null, spec: BandSpec, phases?: number[][][],
): BandCommandResult {
  if (!doc) return { ok: false, reason: 'no BG override document is loaded' };
  try {
    const band = createBand({
      cols: spec.cols, rows: spec.rows,
      ...(phases !== undefined ? { phases } : {}),
      ...(spec.phaseFill !== undefined ? { phaseFill: spec.phaseFill } : {}),
      ...(spec.axis !== undefined ? { axis: spec.axis } : {}),
      ...(spec.driver !== undefined ? { driver: spec.driver } : {}),
      ...(spec.rateShift !== undefined ? { rate_shift: spec.rateShift } : {}),
    });
    return { ok: true, command: makeAddBandCommand(doc, band) };
  } catch (e) {
    return refusal(e);
  }
}

/**
 * REMOVE a band, deleting its slots from the blob.
 *
 * `blankReferencingCells` IS THE AUTHOR'S SENTENCE, not a default. Removal
 * destroys the band's art, and cells that drew it have nothing left to name —
 * so the command refuses by default and names how many cells are at stake, and
 * the panel turns that refusal into a confirmation rather than swallowing it.
 */
export function removeBandCommand(
  doc: BgOverrideDocument | null, bandIndex: number, blankReferencingCells = false,
): BandCommandResult {
  if (!doc) return { ok: false, reason: 'no BG override document is loaded' };
  try {
    return { ok: true, command: makeRemoveBandCommand(doc, bandIndex, { blankReferencingCells }) };
  } catch (e) {
    return refusal(e);
  }
}

// ---------------------------------------------------------------------------
// Constants the panel renders, re-exported so the component imports one module
// ---------------------------------------------------------------------------

export { BGANIM_MAX_BANDS, BG_TILE_CAPACITY, TILE_BYTES, TILE_WIDTH_PX, BAND_AXIS_DEFAULT,
  BGANIM_BAND_AXES };
export type { BandPhaseFill, BgAnimBandAxis };
