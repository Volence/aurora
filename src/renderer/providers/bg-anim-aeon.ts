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
// 1. PROMOTION IS THE PRIMARY GESTURE, NOT INSERTION. aeon's live
//    `editor_bg_override.json` carries 448 tiles against a BG_TILE_CAPACITY of
//    448 (verified 2026-08-22 on the file itself). `planBandInsertion` refuses
//    at EVERY band size on that document, because insertion grows the blob and
//    there is not one slot free. Promotion moves art the blob already carries,
//    so `tiles.length` is unchanged and it works on a full document — which is
//    the only document that exists. A panel built around "add a band" is a panel
//    that does not work on real content, so promote/demote come first and insert
//    is presented as the case that NEEDS free tiles, with the number of free
//    tiles on screen beside it.
//
// 2. A DRIVER IS A SCALAR SOURCE, NEVER AN AXIS. Every band moves
//    HORIZONTALLY whichever driver it names, `camera_y` included — the runtime
//    is a horizontally-periodic pattern shifted by a step, and the driver only
//    says where the step's scalar is read from (aeon engine/level/bg_anim.emp;
//    the vendored contract's `drivers` block says it in as many words). There is
//    no "vertical band" and no vertical option anywhere on this surface. The
//    names come from BGANIM_DRIVER_NAMES, which the codec reads out of the
//    vendored contract, so this file cannot hold a stale driver list.
//
// EVERY REFUSAL IS THE CODEC'S OWN WORDS. Nothing here restates a bound or
// composes a second explanation for one: the builders call the command
// factories, catch `BgOverrideError`, and hand its message up. That is what
// makes "why is this button off" the same sentence in the UI, in the agent
// reply, and in the test — one rulebook, quoted rather than paraphrased.

import type { AnyCommand } from '../../core/editing/commands';
import {
  BGANIM_DRIVER_NAMES,
  BGANIM_MAX_BANDS,
  BG_TILE_CAPACITY,
  TILE_BYTES,
  TILE_WIDTH_PX,
  animatedSlotCount,
  bandColumnBytes,
  bandTileCount,
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
    title: `${name} — the SCALAR the band's step is read from. The band shifts HORIZONTALLY `
      + 'whichever driver it uses; a driver never sets an axis.',
  }));
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
  const out: number[] = [];
  // A band's slots are a prefix of a blob that can never exceed BG_TILE_CAPACITY,
  // so no legal band has more rows than that — the ceiling is derived, not a
  // round number picked to look generous.
  for (let rows = 1; rows <= BG_TILE_CAPACITY; rows++) {
    const bytes = bandColumnBytes({ rows });
    if (bytes > 0 && (bytes & (bytes - 1)) === 0) out.push(rows);
  }
  return out;
}

/** `cols * TILE_WIDTH_PX` — what `pattern_px` must equal, as the consumer asserts it. */
export function patternPxFor(cols: number): number {
  return cols * TILE_WIDTH_PX;
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
 * to a greyed "Add band" is the difference between a broken editor and an
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

export interface BandRow extends BgAnimBandView {
  /** `"32x4"` — the geometry as an author says it out loud. */
  geometry: string;
  /** Slot range the band owns, inclusive-exclusive, for the row's subtitle. */
  slotRange: string;
}

/** The band list, straight off `describeBands` with two display strings added. */
export function bandRows(doc: BgOverrideDocument | null): BandRow[] {
  if (!doc) return [];
  return describeBands(doc).map((v) => ({
    ...v,
    geometry: `${v.cols}x${v.rows}`,
    slotRange: `${v.slotBase}..${v.slotBase + v.tileCount}`,
  }));
}

// ---------------------------------------------------------------------------
// Availability — why a control is off
// ---------------------------------------------------------------------------

/**
 * Why an INSERT of a `cols x rows` band is unavailable, or null when it is not.
 *
 * ASKED AHEAD OF THE COMMAND, and it is the one place on this surface where a
 * reason is composed here rather than quoted from the codec. It has to be:
 * `makeAddBandCommand` answers by throwing, and a panel cannot throw once per
 * render to decide whether to grey a button. The wording is kept deliberately
 * close to the codec's own refusals, and the two are pinned against each other
 * in the tests — if this ever says "available" where the command refuses, that
 * is the dead button this whole shape exists to prevent.
 */
export function insertUnavailableReason(
  doc: BgOverrideDocument | null, cols: number, rows: number,
): string | null {
  if (!doc) return 'this project has no editor_bg_override.json to add a band to.';
  const budget = bandBudget(doc);
  if (budget.bandsRemaining <= 0) {
    return `the document already carries ${budget.bands} band(s), which is the ceiling of `
      + `${budget.maxBands}. Raising it is an engine change, never a writer decision.`;
  }
  const n = bandTileCount({ cols, rows });
  if (n > budget.tileSlotsRemaining) {
    return `adding a band puts its ${n} tile(s) INTO the blob, and the blob has `
      + `${budget.tileSlotsRemaining} free slot(s) of ${budget.tileCapacity}. `
      + 'PROMOTE an existing static range instead — promotion moves art the document already '
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
    return `the document already carries ${budget.bands} band(s), which is the ceiling of `
      + `${budget.maxBands}. Demote or remove one first.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The four mutations
// ---------------------------------------------------------------------------

export interface BandSpec {
  cols: number;
  rows: number;
  /** Omit to leave the key out, so the document tracks the consumer's default. */
  driver?: BgAnimDriver;
  /** Omit to leave the key out. */
  rateShift?: number;
}

/**
 * PROMOTE `tiles[staticBase : staticBase + cols*rows]` into a new band.
 *
 * THE PRIMARY AUTHORING GESTURE. The band's phase-0 art is READ from the blob
 * (`bandFromStaticTiles`) and banks 1..7 arrive as copies of it, so the band is
 * visually inert until an author draws its frames — the picture is identical
 * before and after, which is what lets a structural edit be safe on a shipping
 * background.
 */
export function promoteBandCommand(
  doc: BgOverrideDocument | null, staticBase: number, spec: BandSpec,
): BandCommandResult {
  if (!doc) return { ok: false, reason: 'no BG override document is loaded' };
  try {
    const band = bandFromStaticTiles(doc, staticBase, {
      cols: spec.cols, rows: spec.rows,
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
 * Grows the blob, so this is the door a full document has no room for. Kept
 * because a document that is not full is a perfectly ordinary thing to author
 * against; presented second because the one that exists today is full.
 */
export function addBandCommand(
  doc: BgOverrideDocument | null, spec: BandSpec, phases?: number[][][],
): BandCommandResult {
  if (!doc) return { ok: false, reason: 'no BG override document is loaded' };
  try {
    const band = createBand({
      cols: spec.cols, rows: spec.rows,
      ...(phases !== undefined ? { phases } : {}),
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

export { BGANIM_MAX_BANDS, BG_TILE_CAPACITY, TILE_BYTES, TILE_WIDTH_PX };
