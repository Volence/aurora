// Band ART on the pixel surface — the provider under parcel I's two doors:
// the Art facet's composer opening a band slot / a phase bank, and the band
// card's bank strip.
//
// THE COMPOSER EDITS THROUGH AN ATLAS. Its document is cells that reference
// atlas tiles, and its render/commit paths read pixels out of that atlas. A
// band bank is not in any atlas, so this file synthesizes one: for a static
// slot or bank 0 the atlas is the override's display tiles (the canvas's own
// mirror, which the tile writer keeps current), and for bank k>0 it is the
// bank's tiles themselves. Cell `(c, r)` of a `cols x rows` bank maps to slot
// `c*rows + r` — COLUMN-MAJOR, the runtime's order ("a pattern column's tiles
// are contiguous in VRAM"; see shiftedPhaseBanks).
//
// Decisions live here, not in the components: which command a write becomes,
// what the strip's button says, how a bank is rasterized.

import type { Tile } from '../../core/model/s4-types';
import type { ComposerDoc } from '../../core/art/composer-buffer';
import { createDoc } from '../../core/art/composer-buffer';
import { drawTileInto, type PaletteLut } from '../../core/art/rasterize';
import type { AnyCommand } from '../../core/editing/commands';
import {
  makeRegenerateShiftCommand, makeSetBgOverridePhaseBankCommand, makeSetBgOverrideTilesCommand,
} from '../../core/editing/bg-override-art';
import {
  BGANIM_PHASE_BANKS, TILE_WIDTH_PX, bandCellSlot, bandSlotCell, bandTileCount,
  type BgOverrideBand, type BgOverrideDocument,
} from '../../core/formats/bg-override/bg-override';
import { documentBands, bandSlotBases } from '../../core/formats/bg-override/bg-anim-band';
import { bgOverrideDisplay } from '../../core/formats/bg-override/bg-override-view';
import type { BgArtTarget, OpenDocument } from '../state/artStore';
import type { BandCommandResult } from './bg-anim-aeon';
// Type-only, and it stays that way: `tile-picker-source` resolves which array
// the strip is showing, this module decides what a gesture on it MEANS, and a
// value import either way would be a cycle waiting to happen.
import type { TilePickerLayer, TilePickerOrigin } from './tile-picker-source';

// ---------------------------------------------------------------------------
// Wording — measured against the column by effects-wording.test.ts
// ---------------------------------------------------------------------------

/** The strip's button. A REGENERATE, not a one-time fill — the title says so. */
export const SHIFT_BUTTON_LABEL = 'Shift';
export const SHIFT_BUTTON_TITLE =
  'Regenerate banks 1–7 from phase 0: bank k becomes phase 0 scrolled k px within the '
  + 'tile animation’s pattern width (the same fill as "pre-shifted (moves)"). Run it again after '
  + 'every phase-0 edit; banks you drew by hand are replaced. One undo step.';
export const BANK_STRIP_HINT = 'banks 0–7 · click one to draw it';
export const BANK_THUMB_TITLE = (bank: number): string =>
  bank === 0
    ? 'Phase 0 — the picture at rest. Drawing it also writes the tile animation’s static slots.'
    : `Bank ${bank} — the tile animation at step ${bank}. Draw it by hand, or Shift to derive it from phase 0.`;

// ---------------------------------------------------------------------------
// Which palette line the override's art renders through
// ---------------------------------------------------------------------------

/**
 * `palette_line` is a key Aurora round-trips and does not judge; for DISPLAY
 * it is read when it is a legal line index and 0 otherwise. Never written.
 */
export function bgPaletteLine(doc: BgOverrideDocument): number {
  const v = doc.palette_line;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3 ? v : 0;
}

// ---------------------------------------------------------------------------
// Atlas + document for a target
// ---------------------------------------------------------------------------

/** The tiles the composer indexes for this target (see the file header). */
export function bgArtAtlas(doc: BgOverrideDocument, target: BgArtTarget): Tile[] {
  if (target.kind === 'bank' && target.bank !== 0) {
    const band = documentBands(doc)[target.bandIndex];
    if (!band) return [];
    return band.phases[target.bank].map((p) => ({ pixels: Uint8Array.from(p) }));
  }
  return bgOverrideDisplay(doc).tiles;
}

/** Atlas index of doc cell `cellIndex` under `target` — the band's own slot order. */
export function bgArtCellAtlasIndex(
  doc: BgOverrideDocument, target: BgArtTarget, cellIndex: number,
): number | null {
  if (target.kind === 'tile') return cellIndex === 0 ? target.tileIndex : null;
  const bands = documentBands(doc);
  const band = bands[target.bandIndex];
  if (!band) return null;
  const c = cellIndex % band.cols, r = Math.floor(cellIndex / band.cols);
  if (r >= band.rows) return null;
  const slot = bandCellSlot(band, c, r);
  return target.bank === 0 ? bandSlotBases(bands)[target.bandIndex] + slot : slot;
}

function bgArtDoc(doc: BgOverrideDocument, target: BgArtTarget): ComposerDoc | null {
  const pal = bgPaletteLine(doc);
  if (target.kind === 'tile') {
    if (target.tileIndex < 0 || target.tileIndex >= doc.tiles.length) return null;
    const d = createDoc(1, 1);
    d.cells[0].atlasTile = target.tileIndex;
    d.cells[0].pal = pal;
    return d;
  }
  const band = documentBands(doc)[target.bandIndex];
  if (!band || target.bank < 0 || target.bank >= BGANIM_PHASE_BANKS) return null;
  const d = createDoc(band.cols, band.rows);
  for (let i = 0; i < d.cells.length; i++) {
    d.cells[i].atlasTile = bgArtCellAtlasIndex(doc, target, i);
    d.cells[i].pal = pal;
  }
  return d;
}

/** An OpenDocument for one static slot (or a prefix slot, which also edits its band). */
export function openBgTileDocument(doc: BgOverrideDocument, tileIndex: number): OpenDocument | null {
  const target: BgArtTarget = { kind: 'tile', tileIndex };
  const d = bgArtDoc(doc, target);
  if (!d) return null;
  return {
    doc: d, liveTileIndex: null, chunkId: null, bgOverride: target,
    name: `BG tile #${tileIndex}`, dirty: false,
  };
}

// ---------------------------------------------------------------------------
// THE DOOR TO A STATIC SLOT — ROADMAP row 57
// ---------------------------------------------------------------------------
//
// `openBgTileDocument` above shipped with row 51 and had ZERO CALLERS outside
// its own tests for a day: the composer could open a band's phase BANK from the
// band card's strip, and could not open a band's STATIC SLOT from anywhere at
// all. It was never broken — it was unreachable, which is why ~5,000 vitest
// tests were green over it. Coverage of a function says nothing about whether
// anything calls it.
//
// ═══ WHY THE BLOB STRIP IS THE DOOR ═══
//
// The row's target is the STATIC tiles PAST the animated prefix — the prefix is
// already reachable through bank 0, which IS the prefix. A static tile past the
// prefix belongs to NO BAND, so every band-shaped surface in the app is the
// wrong place to hang the door: `BgAnimBandPanel`'s bank strip, `ArtBrowser`'s
// band cards and the candidate form are all keyed by `doc.anims[i]`, and there
// is no `i` for these tiles.
//
// The blob strip is the one surface that shows them as individually addressable
// cells, and the index it hands over needs NO MAPPING: on the BG branch with
// `origin === 'override'`, `resolveTilePickerSource` returns
// `bgOverrideDisplay(doc).tiles`, which `bg-override-view.ts` builds 1:1 from
// `doc.tiles` — same order, same length — and `tileIndex` here is bounded
// against `doc.tiles.length`. `band-strip-range.ts` states the same fact from
// the other side: "slot `n` is the strip's `n`th cell by construction".
//
// ═══ WHY A DOUBLE CLICK, AND HOW IT MISSES THE DRAG ═══
//
// `TilesetPanel` already pairs single-click = pick a brush with double-click =
// open that tile in the composer. `ArtBrowser`'s single click already picks a
// brush. So double-click = open is this app's existing idiom, not a new one.
//
// AND IT CANNOT COLLIDE WITH THE RANGE DRAG. That gesture lives on mousedown
// (records the anchor) and click (resolves); this one is a third handler and
// touches neither. `resolveStripDrag` returns `range` only when
// `anchorSlot !== releaseSlot`, and a double click is two press/release pairs
// that each set and consume the anchor at one slot — so both of its clicks
// resolve to `{kind:'pick', why:'same-slot'}`, exactly what a single click has
// always done. No double click can produce a range and no drag can produce a
// `dblclick`.
//
// ═══ THE RULE LIVES HERE, NOT IN `ArtBrowser.tsx` ═══
//
// Same reason `band-strip-range.ts` gives: the node suite cannot see a `.tsx`
// closure, and "which strip does this door work on" is exactly the kind of gate
// that falls open silently. The component supplies the state and the event.

/**
 * What a double click on the blob strip resolves to.
 *
 * `ignored` is SILENT ON PURPOSE and `refused` is LOUD ON PURPOSE, which is the
 * same split `resolveStripDrag` draws. Double click is not a gesture the
 * FOREGROUND tileset strip has, and no cell under the pointer is not a gesture
 * at all — neither is a refusal to explain. But an author looking at a
 * BACKGROUND on the strip has every reason to expect this to work, and when the
 * background on screen is a library entry or the act's own plane there is no
 * override document to edit; going quiet there would be indistinguishable from
 * a dead double click.
 *
 * `open` carries no message because the strip is about to UNMOUNT — the caller
 * switches to the Art facet and `ArtBrowser` lives in the Layout facet, so a
 * readout on success is a line nobody can read.
 */
export type StripOpenOutcome =
  | { kind: 'open'; tileIndex: number }
  | { kind: 'ignored'; why: 'no-slot' | 'not-a-background' }
  | { kind: 'refused'; reason: string; hint: string };

export interface StripOpenInputs {
  /** The picker's own layer — `resolveTilePickerSource().layer`. */
  layer: TilePickerLayer;
  /** The picker's own origin — `resolveTilePickerSource().origin`. */
  origin: TilePickerOrigin;
  /** Strip cell under the double click, or -1 when it is past the end. */
  slot: number;
  /** The open override document, or null when the project has none. */
  doc: BgOverrideDocument | null;
}

/**
 * Resolve a double click on the blob strip. TOTAL — every input has an answer,
 * and NO input opens a document this function did not name.
 *
 * THE `origin` GATE IS THE WHOLE SAFETY PROPERTY. A slot index means a position
 * in THIS document's blob; on a library entry, the act's own plane or the
 * foreground tileset the SAME integers name different art, and opening
 * `doc.tiles[n]` from one of those would put the author's strokes into a tile
 * they were not looking at. The `layer` half is checked alongside it for the
 * reason `resolveStripDrag` keeps its own: the two are independently-defaulted
 * fields at the call site, and the pair disagreeing is the one shape that would
 * let a foreground index reach a background document.
 *
 * THE BOUNDS CHECK IS NOT DELEGATED. `openBgTileDocument` returns null for a
 * slot the document does not have, and the caller must not open anything on
 * null — but a null there is indistinguishable from "the geometry was fine and
 * something else went wrong", so the range is decided here where it can say so.
 * Reachable when the blob shrinks under a strip that has not repainted (an
 * undone band insert), which is precisely when a silent no-op is worst.
 */
export function resolveStripOpen(input: StripOpenInputs): StripOpenOutcome {
  const { layer, origin, slot, doc } = input;
  if (layer !== 'bg') return { kind: 'ignored', why: 'not-a-background' };
  if (slot < 0) return { kind: 'ignored', why: 'no-slot' };
  if (origin !== 'override' || doc === null) {
    return {
      kind: 'refused',
      reason: 'not the override document',
      hint: 'The background on screen is not this act’s BG override document, so its tiles '
        + 'are not editable here — a slot index means a position in the override’s own '
        + 'blob and would name different art in any other background. Bake this background into '
        + 'the override first, then double-click a tile to draw it.',
    };
  }
  if (!Number.isInteger(slot) || slot >= doc.tiles.length) {
    return {
      kind: 'refused',
      // Derived from the document, never a pinned count — `doc.tiles.length` is
      // a COUNT, so the last slot is one less (the same off-by-one the strip
      // drag's prefix hint had to fix).
      reason: `slot ${slot} is past the end of the blob`,
      hint: `the blob has ${doc.tiles.length} tiles, so slots run 0..${doc.tiles.length - 1} `
        + `and slot ${slot} is not one of them. Nothing was opened.`,
    };
  }
  return { kind: 'open', tileIndex: slot };
}

/**
 * Does this outcome have anything to SAY on the picker's hover line?
 *
 * ⚠ SILENT MEANS "LEAVES THE LINE ALONE", NOT "WRITES AN EMPTY LINE", and the
 * difference is a defect the CDP harness caught on its first run
 * (`scratchpad/bganim-tile-door-harness.mjs` [7b], against a sentinel written
 * before the gesture — asserting the line was empty afterwards would have
 * passed on both behaviours and on an unwired handler besides).
 *
 * The strip's readout is ONE shared line: the range drag writes refusals there,
 * the band cards write their hints there, and it is the only surface any of
 * them has. A double click that clears it would erase a message the author is
 * mid-read — which is the exact incident `stripDragLabel` records, where the
 * band cards' hover handler wiped a refusal that had just been written. So a
 * gesture with nothing to say writes nothing at all.
 *
 * A PREDICATE RATHER THAN AN `=== ''` AT THE CALL SITE, because "which outcomes
 * speak" is a rule and rules do not live in `.tsx` here — the node suite cannot
 * see a component closure, and an empty string is indistinguishable from a
 * message that happens to be empty.
 */
export function stripOpenSpeaks(outcome: StripOpenOutcome): boolean {
  return outcome.kind === 'refused';
}

/**
 * The readout for the picker's hover label, on the SAME one-short-line budget
 * `stripDragLabel` documents in full — the 102px box, the `nowrap`, and the
 * measured incident where a wrapped readout moved the tile grid out from under
 * the cursor. Empty for `open` and `ignored`, which `stripOpenSpeaks` says the
 * caller must not write at all.
 */
export function stripOpenLabel(outcome: StripOpenOutcome): string {
  return outcome.kind === 'refused' ? `no edit — ${outcome.reason}` : '';
}

/** The same answer at length, for the readout's `title`, where a paragraph is free. */
export function stripOpenHint(outcome: StripOpenOutcome): string {
  return outcome.kind === 'refused' ? outcome.hint : '';
}

// ---------------------------------------------------------------------------
// THE REPORT — what the last strip double click did, for a CDP harness
// ---------------------------------------------------------------------------
//
// SAME REASON `StripDragReport` EXISTS, and here it is sharper. On the `open`
// path `bgArtOpen()` shows the document that arrived, and on `refused` the
// picker's hover line carries the sentence — but `ignored` CHANGES NOTHING AT
// ALL. A foreground double click that was correctly ignored and a foreground
// double click that never reached the handler leave byte-identical state, so
// without `gestures` advancing the control row for the gate would be green on a
// build where the handler is not wired at all. That is this row's own defect
// class, one surface over.

export interface StripOpenReport {
  kind: StripOpenOutcome['kind'] | null;
  /** `why` when ignored, `reason` when refused, null when a document opened. */
  detail: string | null;
  /** The slot the gesture was aimed at, as the component read it off the grid. */
  slot: number | null;
  /** The slot a document was actually opened for — null on every other branch. */
  openedTileIndex: number | null;
  /** Advances on every double click the strip saw, resolved or not. */
  gestures: number;
}

const EMPTY_OPEN: StripOpenReport = {
  kind: null, detail: null, slot: null, openedTileIndex: null, gestures: 0,
};

let lastOpenReport: StripOpenReport = EMPTY_OPEN;

export function publishStripOpen(slot: number, outcome: StripOpenOutcome): void {
  lastOpenReport = {
    kind: outcome.kind,
    // The refusal's FULL reasoning, not the one-line form — a report is read by
    // a harness and by a person debugging, and neither is short of room.
    detail: outcome.kind === 'ignored' ? outcome.why
      : outcome.kind === 'refused' ? outcome.hint : null,
    slot,
    openedTileIndex: outcome.kind === 'open' ? outcome.tileIndex : null,
    gestures: lastOpenReport.gestures + 1,
  };
}

export function lastStripOpenReport(): StripOpenReport {
  return lastOpenReport;
}

/** An OpenDocument for bank `bank` of band `bandIndex`. */
export function openBandBankDocument(
  doc: BgOverrideDocument, bandIndex: number, bank: number,
): OpenDocument | null {
  const target: BgArtTarget = { kind: 'bank', bandIndex, bank };
  const d = bgArtDoc(doc, target);
  if (!d) return null;
  return {
    doc: d, liveTileIndex: null, chunkId: null, bgOverride: target,
    name: `tile animation ${bandIndex} bank ${bank}`, dirty: false,
  };
}

/** True when the target still names something the document has (undo can remove a band). */
export function bgArtTargetExists(doc: BgOverrideDocument | null, target: BgArtTarget): boolean {
  if (!doc) return false;
  return bgArtDoc(doc, target) !== null;
}

// ---------------------------------------------------------------------------
// Commit — writes on the composer become ONE command
// ---------------------------------------------------------------------------

export interface PixelWrite { x: number; y: number; value: number }

/**
 * The command for a batch of doc-space pixel writes under `target`, or null
 * when nothing changed. Static slot / bank 0 → `set-bg-override-tiles` (the
 * writer lands prefix slots in phases[0] too); bank k>0 → the whole bank as
 * `set-bg-override-phases`.
 */
export function bgArtCommitCommand(
  doc: BgOverrideDocument, target: BgArtTarget, composer: ComposerDoc, writes: readonly PixelWrite[],
): AnyCommand | null {
  if (writes.length === 0) return null;
  const atlas = bgArtAtlas(doc, target);
  const next = new Map<number, number[]>();   // atlas index -> new pixels
  for (const w of writes) {
    const cx = w.x >> 3, cy = w.y >> 3;
    const cellIndex = cy * composer.widthTiles + cx;
    const ai = bgArtCellAtlasIndex(doc, target, cellIndex);
    if (ai === null || !atlas[ai]) continue;
    let px = next.get(ai);
    if (!px) { px = Array.from(atlas[ai].pixels); next.set(ai, px); }
    px[(w.y & 7) * TILE_WIDTH_PX + (w.x & 7)] = w.value & 0xF;
  }
  if (next.size === 0) return null;
  if (target.kind === 'tile' || target.bank === 0) {
    const tiles = Array.from(next, ([index, pixels]) => ({ index, pixels }))
      .filter((t) => !sameTile(t.pixels, atlas[t.index].pixels));
    if (tiles.length === 0) return null;
    return makeSetBgOverrideTilesCommand(doc, tiles);
  }
  const band = documentBands(doc)[target.bandIndex];
  const bank = band.phases[target.bank].map((t, i) => next.get(i) ?? t.slice());
  if (bank.every((t, i) => sameTile(t, band.phases[target.bank][i]))) return null;
  return makeSetBgOverridePhaseBankCommand(doc, target.bandIndex, target.bank, bank);
}

function sameTile(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Bank strip verbs
// ---------------------------------------------------------------------------

/** `Shift`: banks 1..7 regenerated from the band's CURRENT phase 0. */
export function regenerateShiftCommand(
  doc: BgOverrideDocument | null, bandIndex: number,
): BandCommandResult {
  if (!doc) return { ok: false, reason: 'no BG override document is open' };
  try {
    return { ok: true, command: makeRegenerateShiftCommand(doc, bandIndex) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Rasterize bank `bank` of `band` as RGBA, `cols*8 x rows*8`, in the band's slot order. */
export function bankThumbnail(band: BgOverrideBand, bank: number, lut: PaletteLut): {
  width: number; height: number; rgba: Uint8ClampedArray;
} {
  const width = band.cols * TILE_WIDTH_PX, height = band.rows * TILE_WIDTH_PX;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const tiles = band.phases[bank] ?? [];
  const n = bandTileCount(band);
  for (let t = 0; t < n && t < tiles.length; t++) {
    const { col, row } = bandSlotCell(band, t);
    drawTileInto(rgba, width, col * TILE_WIDTH_PX, row * TILE_WIDTH_PX, tiles[t], lut, false, false);
  }
  return { width, height, rgba };
}
