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
//    THE CAPACITY CEILING IS REAL AND THE SATURATION IS NOT. `BG_TILE_CAPACITY`
//    is what aeon's VRAM map declares the BG arena owns; a blob past it is
//    refused by aeon's own injector, so the ceiling binds. A document sitting AT
//    it on any given day does not: that is one generator run's property, so an
//    interface shaped around "insertion never works" would be shaped around a
//    transient. An earlier revision of this file said exactly that; it is
//    corrected here rather than quietly rewritten.
//
//    ⚠ AND THE CEILING ITSELF MOVES, which two earlier revisions of this comment
//    denied in as many words ("448 is `(0xB800-0x8000)/32` ... and it does not
//    move"). It went 448 -> 400 at aeon EFFECTS-W1 item 9d, when 48 slots were
//    reassigned to the `waterline_strips` region; Aurora went on telling authors
//    that 401..448 tiles fit until 2026-09-06. It is a DECLARED ALLOCATION in
//    games/sonic4/vram.toml, not the hardware edge under the sprite attribute
//    table, and the two are different numbers. Never name it in prose, a test or
//    a label: read it from the vendored contract, which every consumer in this
//    file already does.
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
  BGANIM_BYTES_PER_SLOT,
  BGANIM_MAX_BANDS,
  BGANIM_PHASE_BANKS,
  BGANIM_SECTION_CEILING,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BG_TILE_CAPACITY,
  TILE_BYTES,
  TILE_WIDTH_PX,
  animatedSlotCount,
  bandIsDefaultOff,
  bganimSectionBytes,
  bganimSectionSlotsAllowed,
  bganimViewTwinBytes,
  bandColumnBytes,
  bandPatternPx,
  bandRotationUnitBytes,
  BAND_AXIS_DEFAULT,
  BGANIM_BAND_AXES,
  bandTileCount,
  type BgAnimBandAxis,
  type BgAnimBandSize,
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
  makeSetBandDefaultOffCommand,
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
 * The highest phase-bank index — `BGANIM_PHASE_BANKS - 1`, derived once.
 *
 * NINE AUTHOR-FACING SENTENCES SAID "7". The contract carries exactly
 * `BGANIM_PHASE_BANKS` banks (not at most), so "banks 1 to 7" is that count
 * minus the resting phase 0 — a number with one author in the vendored contract
 * and nine more in prose the pickers, the strip and the agent surface print. A
 * contract that carried more banks would move every picker and leave all nine
 * sentences behind, each wrong in the moment an author reads it.
 *
 * IT IS ALSO THE MASK. The driver selects a bank with `step & 7`, and that mask
 * equals the last index only because the bank count is a power of two — which
 * the contract's own value is. Asserted at module load rather than assumed, so a
 * contract amendment to a non-power-of-two count fails loudly here instead of
 * printing a mask that silently selects the wrong bank.
 */
export const LAST_PHASE_BANK = BGANIM_PHASE_BANKS - 1;
if ((BGANIM_PHASE_BANKS & LAST_PHASE_BANK) !== 0) {
  throw new Error(
    `bganim contract BGANIM_PHASE_BANKS is ${BGANIM_PHASE_BANKS}, which is not a power of two: `
    + '`step & (BGANIM_PHASE_BANKS - 1)` is no longer the driver\'s bank selector, and the '
    + 'sentences that print it as a mask are now wrong. Re-derive them against the amended contract.',
  );
}

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
      title: `Banks 1 to ${LAST_PHASE_BANK} are copies of phase 0: the tile animation draws the `
        + 'same art at every step, so nothing moves until you author its frames. The fill that '
        + 'edits nothing.',
      note: `banks 1 to ${LAST_PHASE_BANK} arrive as copies of phase 0, so the tile animation is `
        + 'inert until you draw its frames.',
    },
    {
      value: 'shift', label: 'pre-shifted (moves)',
      title: 'Bank k is phase 0 scrolled k px within the tile animation’s own pattern width (the '
        + 'contract’s "pre-shifted art 1px apart") so it scrolls as soon as it is '
        + 'saved. Phase 0, the picture at rest, is unchanged.',
      note: `banks 1 to ${LAST_PHASE_BANK} are phase 0 pre-shifted 1 px per bank, wrapping at the `
        + 'pattern edge, so the tile animation MOVES with no further authoring. The picture at '
        + 'rest is unchanged.',
    },
    {
      value: 'blank', label: 'blank',
      title: `Banks 1 to ${LAST_PHASE_BANK} are blank art. The picture holds at rest but BREAKS on `
        + 'the tile animation’s second phase until you draw the frames, a deliberate authoring start.',
      note: `banks 1 to ${LAST_PHASE_BANK} arrive blank: the picture BREAKS on the tile animation’s `
        + 'second phase until you draw the frames.',
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
      // BOTH FIGURES ARE READ, NOT TYPED. `rowChoices` and `patternPxFor` above
      // go out of their way to evaluate the rule through the codec rather than
      // restate it one derivation step away — and then this sentence, the only
      // part of the pair a PERSON reads, used to spell `cols*8` and `rows*32` by
      // hand. Both are vendored from aeon's consumer contract, so a contract
      // amendment moved the pickers and left the tooltip behind.
      title: horizontal
        ? `The pattern translates along X. Its period is cols*${TILE_WIDTH_PX} px, and ROWS is `
          + `the key that must make rows*${TILE_BYTES} a power of two. As the driver scalar `
          + 'increases the art scrolls LEFT; direction is fixed by the mechanism and is not a setting.'
        : `The pattern translates along Y. Its period is rows*${TILE_WIDTH_PX} px, and COLS is `
          + `the key that must make cols*${TILE_BYTES} a power of two. As the driver scalar `
          + 'increases the art scrolls UP; direction is fixed by the mechanism and is not a '
          + 'setting. The pre-shifted fill becomes a vertical roll, and the slots are ordered '
          + 'row-major.',
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

  // ── THE SECOND BUDGET ───────────────────────────────────────────────────
  // ROM bytes, not VRAM tiles, and on every document measured so far it binds
  // FIRST. See `bganimSectionBytes` in the codec for the arithmetic.

  /** Bytes the emitted section would occupy, or null when the act is refused. */
  sectionBytes: number | null;
  /** `BGANIM_SECTION_CEILING`. Always known: it is a constant, not a measurement. */
  sectionCeiling: number;
  /**
   * Animated slots the BYTE ceiling still admits at this act's current shape,
   * or null when the section size cannot be computed at all.
   *
   * ⚠ NULL IS NOT "PLENTY". It means aeon would refuse this act outright, and
   * the only safe reading is zero — see `slotsRemaining`.
   */
  byteSlotsRemaining: number | null;
  /**
   * THE ONE AN AUTHOR MAY ACTUALLY SPEND: the tighter of the two budgets, and
   * ZERO when the byte budget is unmeasurable.
   *
   * The permissive fallback is the defect this field exists to prevent. Reading
   * "could not compute the section" as "so use the tile number" reproduces
   * exactly the failure that put an 80-slot offer in front of a 47-slot
   * section, one budget over.
   */
  slotsRemaining: number;
  /** Which budget produced `slotsRemaining`, so a refusal can say so. */
  binding: 'tiles' | 'bytes' | 'unmeasurable';
  /** Why the section size has no value, or null when it has one. */
  unmeasurable: string | null;

  // ── WHICH SHAPE `sectionBytes` IS FOR ───────────────────────────────────
  //
  // ⚠ "THE SECTION SIZE" IS TWO DIFFERENT NUMBERS AND THE ARITHMETIC WAS NEVER
  // THE PROBLEM. `bganimSectionBytes` models whether the DEBUG view twins are
  // emitted, so its figure is right for the shape the document is actually in —
  // but a sentence printing that figure with no shape named cannot be reconciled
  // with aeon's own `bganim_section_bytes()`, whose `n_views` parameter DEFAULTS
  // TO 0 and therefore answers for the RELEASE shape. On the shipped act the two
  // disagree by `viewTwinBytes` and aeon had to work out by hand which side was
  // wrong. Neither was. aeon's contract §1.2 draws the conclusion: **"Say which
  // shape any figure is for."** These two fields are how this panel says it.

  /**
   * Does `sectionBytes` include the DEBUG view twins?
   *
   * `false` is the interesting case and it is NOT "release": an act the twins
   * decline for (two bands, or a period they were not derived against) emits
   * none in ANY shape, so its figure is the size in every ROM. `true` means the
   * figure is the DEBUG shape's and the release ROM's section is
   * `viewTwinBytes` smaller.
   */
  twinsEmitted: boolean;
  /**
   * What the twins cost, from the codec's `bganimViewTwinBytes` — 0 when they
   * decline. DERIVED, so no sentence quoting it holds a typed number.
   */
  viewTwinBytes: number;
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
      sectionBytes: null, sectionCeiling: BGANIM_SECTION_CEILING,
      byteSlotsRemaining: null, slotsRemaining: 0, binding: 'unmeasurable',
      unmeasurable: 'this project has no editor_bg_override.json, so there is no section to size.',
      twinsEmitted: false, viewTwinBytes: 0,
    };
  }
  const bands = documentBands(doc);
  const animated = animatedSlotCount(bands);
  const tileSlots = tileSlotsRemaining(doc);
  const bytes = bganimSectionBytes(bands);
  const allowed = bganimSectionSlotsAllowed(bands);
  const twinBytes = bganimViewTwinBytes(bands);
  // BOTH ARMS COME FROM THE SAME REFUSAL, so they cannot disagree; asking twice
  // is how a readout ends up saying "unmeasurable" beside a number.
  const byteSlots = allowed.ok ? Math.max(0, allowed.value - animated) : null;
  return {
    bands: bands.length,
    maxBands: BGANIM_MAX_BANDS,
    bandsRemaining: bandsRemaining(doc),
    animatedSlots: animated,
    tiles: Array.isArray(doc.tiles) ? doc.tiles.length : 0,
    tileCapacity: BG_TILE_CAPACITY,
    tileSlotsRemaining: tileSlots,
    firstPromotableSlot: animated,
    sectionBytes: bytes.ok ? bytes.value : null,
    sectionCeiling: BGANIM_SECTION_CEILING,
    byteSlotsRemaining: byteSlots,
    // ⚠ THE DIRECTION IS THE WHOLE POINT. Unmeasurable collapses to zero, never
    // to the looser tile number. A tie names `tiles`, which is not a lie about
    // either: both refuse at the same slot, and the byte figure is printed
    // beside it regardless, so nothing is hidden by the choice.
    slotsRemaining: byteSlots === null ? 0 : Math.min(tileSlots, byteSlots),
    binding: byteSlots === null ? 'unmeasurable' : (byteSlots < tileSlots ? 'bytes' : 'tiles'),
    unmeasurable: bytes.ok ? null : bytes.reason,
    // WHICH SHAPE THE FIGURE ABOVE IS FOR — both read from the SAME codec
    // derivation the figure itself came from, so a readout cannot name one shape
    // and print the other's arithmetic.
    twinsEmitted: twinBytes > 0,
    viewTwinBytes: twinBytes,
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
// Which SHAPE a section figure is for
// ---------------------------------------------------------------------------

/**
 * `"in the debug shape"` / `"in every ROM shape"` — the clause that says which
 * ROM a section byte figure is the size of.
 *
 * ⚠ IT GOES ON EVERY FIGURE, NOT ONLY THE SURPRISING ONE, and that is a ruling
 * rather than a preference. aeon's `EFFECTS_CONSUMER_CONTRACT.md` §1.2 states
 * it in as many words — **"Say which shape any figure is for"** — after aeon
 * had to work out by hand which of two disagreeing figures was wrong (neither
 * was; their `bganim_section_bytes()` takes `n_views=0` by default and so
 * answers for the RELEASE shape, while ours answers for the shape the act is
 * actually in). `4a565908` put the clause on the panel's readout. The two
 * refusals below are the same figure in the same units and were left bare; this
 * is them catching up, in the readout's own words so a reader meeting both does
 * not have to decide whether two phrasings mean the same thing.
 *
 * ⚠ `false` IS NOT "RELEASE". An act the twins decline for emits none in ANY
 * shape, so its figure is the size in every ROM; naming that "the release
 * shape" would invent a debug/release distinction the act does not have.
 *
 * DERIVED FROM THE FIGURE'S OWN OPERANDS: `bganimViewTwinBytes` is what
 * `bganimSectionBytes` itself adds, so a phrase cannot name one shape while the
 * arithmetic beside it computed the other.
 */
export function sectionShapePhrase(bands: readonly BgAnimBandSize[]): string {
  return bganimViewTwinBytes(bands) > 0 ? 'in the debug shape' : 'in every ROM shape';
}

/**
 * The sentence a refusal adds when the operation MOVES the act between shapes,
 * and the empty string when it does not.
 *
 * ⚠ THIS IS THE HALF THAT IS NOT A LABEL. Adding a band changes the act's SIZE,
 * which every reader expects — and it can also change WHICH SHAPE the act is
 * in, which nobody does. The debug view twins are emitted only for a single-band
 * act at the derived period, so going from one band to two DROPS them, and
 * `bganimSectionBytes(after)` correctly stops counting them. The consequence for
 * a reader is that the before and after figures are not commensurable: they
 * differ by the twins as well as by the slots, so an author who subtracts them
 * gets a per-slot cost that is not the one the sentence above quoted, and has no
 * way to find out why. Two shape labels alone do not say it either — they say
 * the act is in two shapes without saying the author's own edit is what moved
 * it.
 *
 * IT IS CONDITIONAL ON PURPOSE. This file's controls already carry long
 * refusals, and this repo's standing finding is that a wall of caveats in front
 * of a control is itself a defect. So the label above is unconditional (four
 * words, and the ruling requires it) and this sentence appears only in the case
 * it is about — which is also why it may be blunt when it does appear.
 *
 * SYMMETRIC IN DIRECTION, AND DELIBERATELY. Through these two doors the twins
 * can only be LOST (gaining them would need the act to arrive at exactly one
 * band carrying `default_off`, and neither door writes that key), so an
 * "arrive"/"depart" ternary would ship a branch nothing can reach. The sentence
 * says the twins are emitted in one shape and not the other and lets the two
 * labels say which way.
 */
export function sectionShapeMoveNote(
  before: readonly BgAnimBandSize[], after: readonly BgAnimBandSize[],
): string {
  const twinsBefore = bganimViewTwinBytes(before);
  const twinsAfter = bganimViewTwinBytes(after);
  if ((twinsBefore > 0) === (twinsAfter > 0)) return '';
  const now = bganimSectionBytes(before);
  if (!now.ok) return '';
  return ` ⚠ AND THAT FIGURE IS IN A DIFFERENT SHAPE from the act's current `
    + `${now.value} bytes ${sectionShapePhrase(before)}: the `
    + `${Math.max(twinsBefore, twinsAfter)} bytes of debug view twins are emitted in one of the `
    + 'two shapes and not the other, so the two figures do not differ by the slots alone.';
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
  // ── THE SECOND BUDGET, ASKED ABOUT THE POST-INSERT ACT ───────────────────
  //
  // NOT `n > budget.byteSlotsRemaining`. Inserting adds a BAND, and a band costs
  // a record in the act's own table AND a record in each view twin, so the
  // budget an insert has to fit is not the one the current act reports.
  //
  // ⚠ AND SIZING THE ACT THAT WOULD EXIST IS ALSO A SHAPE QUESTION, which is the
  // half this comment used to get wrong: it said adding a second tile animation
  // to a default-off act "is refused by the build outright", and since aeon's
  // decouple (`364b7bce`) it is not — the DEBUG VIEW TWINS DECLINE INSTEAD. So
  // the after-act can be in a different SHAPE from the current one rather than
  // simply larger, `bganimSectionBytes` prices that correctly, and
  // `sectionShapeMoveNote` is what says so out loud.
  const before = documentBands(doc);
  const after = [...before, { cols, rows }];
  const bytes = bganimSectionBytes(after);
  // ⚠ THIS ARM LOOKS DEAD AND IS KEPT ON PURPOSE. Nothing a document can
  // contain reaches it — `viewsEmitted` is the codec's only producer of a
  // refused size and it stopped refusing at aeon's decouple — so this is not
  // a branch waiting for a bad file, it is where the NEXT sizing refusal
  // lands. Deleting it would delete the safe direction with it. The whole
  // argument, with the evidence, is in `BgAnimSizeResult`'s docblock.
  if (!bytes.ok) return bytes.reason;
  if (bytes.value > budget.sectionCeiling) {
    const allowed = bganimSectionSlotsAllowed(after);
    const free = allowed.ok ? Math.max(0, allowed.value - budget.animatedSlots) : 0;
    return `the blob has room, but the ROM SECTION does not. A tile animation's art is stored `
      + `${BGANIM_PHASE_BANKS} times over (one bank per phase), so each animated slot costs `
      + `${BGANIM_BYTES_PER_SLOT} bytes of the act's animation section. Adding ${n} would take `
      + `it to ${bytes.value} of ${budget.sectionCeiling} bytes, ${sectionShapePhrase(after)}.`
      + sectionShapeMoveNote(before, after)
      + ` At ${after.length} tile animation(s) this act has room for ${free} more animated `
      + 'slot(s), so use a smaller one, or PROMOTE static art into an existing tile animation '
      + 'instead. This is a SECOND budget: the free-slot count above is about the tile blob, and '
      + 'the two run out at different times.';
  }
  return null;
}

/**
 * Why a PROMOTION of `cols x rows` at `staticBase` is unavailable, or null.
 *
 * The band ceiling, the "is there a document" question, and the SECTION budget.
 * Everything about the RANGE — past the end of the blob, overlapping a band's
 * prefix, a non-integer base — is left to the command, because those refusals
 * are per-attempt rather than per-render and the codec's wording for them is
 * the wording the author needs.
 *
 * ⚠ IT TAKES A GEOMETRY NOW, AND THAT IS THE CORRECTION. "Promotion does not
 * grow the blob" is true and was read as "promotion is free", which it is not:
 * a promoted slot stops being static art and starts being ANIMATED art, and an
 * animated slot is stored once per phase bank. Promotion is the door that
 * spends the byte budget FASTEST for a given picture, because it adds both a
 * record and its slots while the tile count does not move at all. A caller that
 * cannot say how big the promotion is cannot be told whether it fits.
 */
export function promoteUnavailableReason(
  doc: BgOverrideDocument | null, cols: number, rows: number,
): string | null {
  if (!doc) return 'this project has no editor_bg_override.json to promote tiles in.';
  const budget = bandBudget(doc);
  if (budget.tiles === 0) return 'the document carries no tiles, so there is nothing to promote.';
  if (budget.bandsRemaining <= 0) {
    return `the document already carries ${budget.bands} tile animation(s), which is the ceiling `
      + `of ${budget.maxBands}. Demote or remove one first.`;
  }
  const n = bandTileCount({ cols, rows });
  const before = documentBands(doc);
  const after = [...before, { cols, rows }];
  const bytes = bganimSectionBytes(after);
  // ⚠ THIS ARM LOOKS DEAD AND IS KEPT ON PURPOSE. Nothing a document can
  // contain reaches it — `viewsEmitted` is the codec's only producer of a
  // refused size and it stopped refusing at aeon's decouple — so this is not
  // a branch waiting for a bad file, it is where the NEXT sizing refusal
  // lands. Deleting it would delete the safe direction with it. The whole
  // argument, with the evidence, is in `BgAnimSizeResult`'s docblock.
  if (!bytes.ok) return bytes.reason;
  if (bytes.value > budget.sectionCeiling) {
    const allowed = bganimSectionSlotsAllowed(after);
    const free = allowed.ok ? Math.max(0, allowed.value - budget.animatedSlots) : 0;
    return `promoting does not grow the tile blob, but it DOES grow the ROM section: a slot that `
      + `becomes animated is stored ${BGANIM_PHASE_BANKS} times over, one bank per phase, at `
      + `${BGANIM_BYTES_PER_SLOT} bytes a slot. Animating ${n} more would take the act's `
      + `animation section to ${bytes.value} of ${budget.sectionCeiling} bytes, `
      + `${sectionShapePhrase(after)}.`
      + sectionShapeMoveNote(before, after)
      + ` There is room for ${free} more animated slot(s) at ${after.length} tile animation(s). `
      + 'Promote a smaller range, or demote something first.';
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
// `default_off` — the ship-silent switch, and the twin-coupling disclosure
// ---------------------------------------------------------------------------

/**
 * THE ORDER OF THESE SENTENCES IS THE CONTRACT'S ORDER, DELIBERATELY.
 *
 * aeon `tools/EFFECTS_CONSUMER_CONTRACT.md` §1.2 puts it in as many words:
 * "READ THIS FIRST, ahead of either obligation, and put it in author-facing
 * copy before either: `default_off` changes what SHIPS." The two writer
 * obligations come after, because an author who reads the obligations first
 * has already been told this is a thing with rules and not a thing with
 * consequences.
 *
 * ⚠ AND IT IS THE HALF THAT IS EASIEST TO GET WRONG. The owner's own words for
 * the feature this key came out of were "maybe have one view for horizontal and
 * one for vertical" — which is exactly the sentence an editor renders as a
 * preview toggle. It is not one. There is no runtime flag and no engine gate:
 * the emitter writes `BgAnim_Table: u16 = 0` and `BgAnim_Update` walks a
 * zero-count table and returns, in every ROM shape including release.
 */
export const SHIP_SILENT_LEAD =
  'Changes what SHIPS, not what you see here. A silenced tile animation is not counted into the '
  + 'act’s table, so the act boots with BG animation OFF in every ROM, RELEASE INCLUDED. '
  + 'Nothing in this editor looks different either way.';

/**
 * The two conditions, in aeon's order, with the quantifier of each spelled out.
 *
 * ⚠ THEY ARE NO LONGER OBLIGATIONS AND THIS SENTENCE SAID THEY WERE. Until
 * aeon's decouple (`364b7bce`, an ancestor of `origin/master` `d070d6d7`) both
 * were `AssertionError`s and this copy ended *"Either one refuses the build
 * outright."* Neither raises any more — the same two conditions now decide
 * whether the DEBUG view twins are EMITTED, and an act that fails them builds
 * fine without them. The condition is unchanged; only its consequence is, which
 * is why the two clauses below are word-for-word what they were.
 *
 * The name is kept: `EFFECTS_CONSUMER_CONTRACT.md` §1.2 still calls its own
 * numbered list the writer obligations, and renaming the constant would break
 * the only thread back to it.
 */
export const SHIP_SILENT_OBLIGATIONS =
  `Two conditions then decide whether the debug view twins are emitted. They no longer refuse `
  + `the build. PER ACT: the act must have exactly ONE tile animation (the rule is on the COUNT, `
  + `not on whether the tile animations agree). PER TILE ANIMATION: this one’s pattern must be `
  + `${BGANIM_VIEW_DERIVED_PERIOD_PX}px. Fail either and the act builds with no twins, which `
  + `aeon announces as it builds.`;

/** What the debug ROM gets in exchange, which is the reason the key is not just a delete. */
export const SHIP_SILENT_EXCHANGE =
  `In exchange the DEBUG ROM gets ${BGANIM_VIEW_COUNT} view twins over the same art `
  + '(horizontal, vertical, timer) so perspective and timer can be compared. They exist only in '
  + 'the debug ROM, so they are not a way to see this animation in the game as played.';

// ═══ THE TWIN-COUPLING DISCLOSURE LIVED HERE AND IS RETIRED ═══
//
// `TWIN_COUPLING_DISCLOSURE` and `twinCouplingApplies` are DELETED. The sentence
// told an author *"this act has a tile animation SILENCED IN THE ROM, and while
// it does, the build refuses a SECOND one"*, and as of aeon's decouple the build
// does not. It was built to come down: its own docblock carried the three-step
// retirement, aeon SEQUENCED the fix behind other work on the understanding that
// it covered the gap meanwhile, and aeon's contract §1.2 now says in its own
// words that *"the disclosure at `Promote` that was covering authors until this
// landed is retired — there is no longer a wall to announce."*
//
// ⚠ A RETIRED DISCLOSURE IS NOT A SILENCE. What the sentence was FOR — an
// author meeting a dead control with no explanation — is now answered by the
// controls being ALIVE: `viewsEmitted` stopped refusing, so `Promote` and `Add`
// on a silenced act are gated by the byte budget alone, and the budget line names
// its own shape (`bandBudget.twinsEmitted`) so the 138-byte step a promotion
// takes out of the section is visible rather than mysterious.
//
// The three steps are DONE and recorded here rather than deleted, because the
// next reader's question is "was the contract amended too": (1) aeon's
// `views_emitted` no longer raises, read at `origin/master` — so the codec's
// `viewsEmitted` per-act refusal went with it, which was the real change;
// (2) this constant, the predicate, and the one `Hint` in BgAnimBandPanel are
// gone; (3) `bandKeys.default_off.writerObligations` in the vendored contract is
// amended and an `amendments` entry names aeon's revision.

/** The ship-silent switch for one tile animation, as the panel renders it. */
export interface ShipSilentSwitch {
  /** PER BAND: does THIS tile animation carry `default_off` today? */
  silent: boolean;
  /**
   * PER ACT: would the act boot with BG animation off? Today this is the same
   * question as `silent` for the only shape aeon accepts (a silenced band
   * forces a single-band act), and it is asked separately anyway because the
   * two are different quantifiers and the decoupling fix will pull them apart.
   */
  actBootsSilent: boolean;
  /**
   * Why the switch cannot be moved to the OTHER state, or null when it can.
   * Composed by the command factory, not here: this builds the command and
   * keeps its refusal, so the greyed control and the failed click cannot give
   * an author two different sentences.
   */
  reason: string | null;
  /** Flip it. The command, or the same refusal `reason` carries. */
  run(): BandCommandResult;
}

/**
 * The switch for the band at `bandIndex`, or null when there is no such band.
 *
 * ⚠ IT ASKS THE COMMAND FACTORY RATHER THAN RESTATING THE RULES, which is the
 * opposite of what `promoteUnavailableReason` and `insertUnavailableReason` do
 * one section up — and the difference is deliberate. Those two are asked about
 * a band that does not exist yet, per keystroke, on a form the author is still
 * filling in; this is asked about a band the document already has, so building
 * the command IS the check and there is nothing cheaper to ask. Building it
 * costs one shallow projection and one validation, the same as the click would,
 * and it means the panel cannot ever grey a control for a reason the command
 * would not give.
 *
 * BOTH REFUSALS THEREFORE ARRIVE FROM `viewsEmitted` THROUGH THE PROJECTION,
 * with their quantifiers intact: the band-count rule is PER ACT and the period
 * rule is PER BAND. Neither is spelled here, so neither can drift.
 */
export function shipSilentSwitch(
  doc: BgOverrideDocument | null, bandIndex: number,
): ShipSilentSwitch | null {
  if (!doc) return null;
  const bands = documentBands(doc);
  const band = bands[bandIndex];
  if (band === undefined) return null;
  const silent = bandIsDefaultOff(band);
  const build = (): BandCommandResult => {
    try {
      return { ok: true, command: makeSetBandDefaultOffCommand(doc, bandIndex, !silent) };
    } catch (e) {
      return refusal(e);
    }
  };
  const probe = build();
  return {
    silent,
    actBootsSilent: bands.some(bandIsDefaultOff),
    reason: probe.ok ? null : probe.reason,
    run: build,
  };
}

// ---------------------------------------------------------------------------
// Constants the panel renders, re-exported so the component imports one module
// ---------------------------------------------------------------------------

export { BGANIM_MAX_BANDS, BGANIM_PHASE_BANKS, BG_TILE_CAPACITY, TILE_BYTES, TILE_WIDTH_PX,
  BAND_AXIS_DEFAULT, BGANIM_BAND_AXES };
export type { BandPhaseFill, BgAnimBandAxis };
