// DRAG A RUN ON THE BLOB STRIP TO AIM A BAND'S SLOT RANGE — ROADMAP item 43,
// wave 2 (option C of the marquee ruling).
//
// ═══ WHY THE STRIP AND NOT THE PICTURE ═══
//
// The marquee over the background was measured dead and the row re-scoped
// (docs/reviews/2026-08-26-bganim-marquee-resolution.md): the static blob is laid
// out ROW-major in the picture while a band's slots are COLUMN-major, so a
// rectangle over the picture cannot be a contiguous slot run — 18 of 143,088
// multi-row marquees resolve, and ZERO at the `rows=4` both shipped bands use.
//
// THE DISTINCTION THAT SURVIVED IT: **the picture may define a band's LOCATION;
// it can never define its EXTENT.** Wave 1 shipped the location half — click a
// cell on the map, read its slot, seed the candidate. This file is the EXTENT
// half, and it works for the one reason the marquee did not: the Art panel's
// tile strip IS the slot axis. Slot `n` is the strip's `n`th cell by
// construction, so a contiguous run of strip cells is a contiguous run of slots,
// always, with no art-dependent luck involved.
//
// ═══ EXTENT SNAPPING IS BY CONSTRUCTION, NOT BY REFUSAL ═══
//
// A band is `cols * rows` slots and `rows` is fixed by the form (the runtime
// rotates a whole pattern column by SHIFTING it, so `rows * TILE_BYTES` must be
// an exact power of two — `bandColumnBytes`). So the dragged run is divided by
// `rows` and ROUNDED DOWN to a whole number of columns. The author drags, the
// run snaps; nothing is refused for being the wrong length. That is what makes
// this gesture total where the marquee's was 1.7%.
//
// ═══ IT WRITES NO DOCUMENT ═══
//
// The only document writes in this arc remain `promoteBandCommand` /
// `addBandCommand`. A strip drag moves the EDITOR's candidate — `staticBase`,
// `cols` — and lights the lens. No layout word, no band, no undo entry.
//
// ═══ AND THE TWO REFUSALS ARE LOUD ═══
//
// Two things genuinely have no answer, and both say so on the picker's hover
// line rather than going quiet (an unclear refusal is worse than a loud one,
// which is this item's own standing rule):
//   • a run that lies entirely inside the ANIMATED PREFIX — those slots already
//     belong to bands, there is no static art under the drag at all;
//   • a base so near the end of the blob that not even ONE column of `rows`
//     slots fits.
// Neither can be snapped into legality, so neither is silently rounded.
//
// ═══ WHY THERE IS NO WITNESS HERE, UNLIKE THE MAP'S CLICK-TO-SEED ═══
//
// `MapViewport.commitBandMark` carries a witness of the band list and blob size
// because it reads a LAYOUT WORD at mousedown and decodes it at mouseup, and a
// band command renumbers the blob between the two — so its stale input decodes
// into a slot that no longer exists.
//
// This gesture has no such input. Everything the resolution below uses —
// `rows`, `firstPromotableSlot`, `blobTileCount`, the layer and the origin — is
// read FRESH at release. The only value carried across the press is
// `anchorSlot`, which is a POSITION ON THE STRIP, and every outcome is clamped
// and bounded against the fresh document, so a resolved range is legal by
// construction no matter what moved underneath. The residual exposure is a
// candidate aimed at art the author did not mean — and since this writes no
// document, the lens lights that range immediately and the author sees it before
// any Promote. A witness here would refuse a gesture whose worst case is already
// visible and already reversible.
//
// ═══ PURE, AND OUT OF `.tsx` ON PURPOSE ═══
//
// The node suite cannot see React, a canvas or a mouse. A gesture rule written
// inside `ArtBrowser.tsx` is a rule `vitest run` cannot check — and an
// off-by-one on an INCLUSIVE run, or a clamp applied in the wrong order, would
// aim a promotion at art the author did not drag over and look entirely
// plausible. The component supplies state and events; the rules live here.
// `band-coverage.ts` is the model this follows.

import { TILE_BYTES } from '../../core/formats/bg-override/bg-override';
import { rowChoices } from './bg-anim-aeon';
import type { TilePickerLayer, TilePickerOrigin } from './tile-picker-source';

/** Everything a released strip drag needs to resolve, read fresh at mouseup. */
export interface StripDragInputs {
  /** The picker's own layer — `resolveTilePickerSource().layer`. */
  layer: TilePickerLayer;
  /** The picker's own origin — `resolveTilePickerSource().origin`. */
  origin: TilePickerOrigin;
  /** Strip cell under the PRESS. */
  anchorSlot: number;
  /** Strip cell under the RELEASE. */
  releaseSlot: number;
  /** The candidate's current `rows` — `editorStore.bandCandidate.rows`. */
  rows: number;
  /** `bandBudget(doc).firstPromotableSlot` — past every band's prefix. */
  firstPromotableSlot: number;
  /** `tiles.length` — the blob the strip is showing. */
  blobTileCount: number;
}

/**
 * What a released strip drag resolves to.
 *
 * `pick` IS NOT A FALLBACK, IT IS THE ANSWER for a press and release on one
 * slot, and for every gesture on a source whose indices are not this document's
 * blob. The component does exactly what it did before wave 2 on it — sets the
 * layer's picked tile and arms `paint-tile` — and `why` records WHICH of the two
 * reasons, so a harness can assert the path rather than only the outcome.
 */
export type StripDragOutcome =
  | { kind: 'pick'; why: 'same-slot' | 'not-the-override-blob' }
  | {
    kind: 'range';
    /** `max(min(anchor, release), firstPromotableSlot)`. */
    staticBase: number;
    cols: number;
    rows: number;
    /** Last slot of the INCLUSIVE dragged run, after the base clamp. */
    runEnd: number;
    /** `runEnd - staticBase + 1`. */
    runLength: number;
    /** True when the base clamp moved the run's start off the anchor. */
    clampedToPrefix: boolean;
    /**
     * True when the blob's end reduced `cols` below what the run asked for.
     *
     * ⚠ MEASURED UNREACHABLE FROM THE STRIP, and this comment says so rather
     * than implying a guard that fires. `ArtBrowser` bounds both slots to
     * `idx < tiles.length`, so `runEnd <= blobTileCount - 1`, so
     * `runLength <= blobTileCount - staticBase`, so
     * `floor(runLength / rows) <= floor((blobTileCount - staticBase) / rows)` —
     * the wanted column count is already at or below `maxCols`, always. What IS
     * reachable is `maxCols < 1`, which is the refusal below. The `Math.min`
     * stays because this function is total for any caller, not only for the one
     * that happens to bound its inputs, and a node row proves it reduces when
     * given a release past the end of the blob.
     */
    trimmedToBlob: boolean;
  }
  | { kind: 'refused'; reason: string };

/**
 * Resolve a released strip drag. TOTAL — every input has an answer.
 *
 * THE ORDER OF THE THREE STEPS IS THE RULE, and it is not interchangeable:
 *
 *  1. CLAMP THE BASE FIRST. `staticBase = max(min(anchor, release),
 *     firstPromotableSlot)` — the same clamp `markFromLayoutWord` applies to a
 *     click-seeded base, so wave 1 and wave 2 cannot disagree about where a
 *     candidate may start. Clamping AFTER measuring the run would keep the
 *     dragged length while moving its start, i.e. silently extend the selection
 *     past what the author dragged over.
 *  2. MEASURE THE RUN FROM THE CLAMPED BASE, INCLUSIVELY. `runEnd` is the far
 *     end of the drag; `runLength = runEnd - staticBase + 1`. Inclusive because
 *     the author dragged ACROSS both end cells and both are lit.
 *  3. DIVIDE, THEN BOUND. `cols = max(1, floor(runLength / rows))` snaps the run
 *     down to whole columns, then `cols` is reduced until
 *     `staticBase + cols*rows <= blobTileCount`. A single dragged cell is
 *     therefore one column, never zero — a gesture that resolved to nothing
 *     would read as a dead strip.
 */
export function resolveStripDrag(input: StripDragInputs): StripDragOutcome {
  const { layer, origin, anchorSlot, releaseSlot, rows, firstPromotableSlot, blobTileCount } = input;

  // ── The gate. A slot index means a position in THIS document's blob, so the
  // drag is live only where the strip IS that blob — the same condition the
  // lens itself refuses on (`resolveDisplayedBg().source === 'override'`). On a
  // library entry, the act's own plane, or the foreground tileset, the SAME
  // integers name different art, and a candidate aimed through them would
  // promote a range the author never saw.
  //
  // ⚠ THE `layer` HALF IS REDUNDANT AGAINST TODAY'S RESOLVER, and this says so
  // rather than implying a guard that fires: `resolveTilePickerSource` only ever
  // produces `origin: 'override'` on the BG branch, so `origin` alone decides
  // for every source that function builds. A red-first plant of exactly that
  // (dropping the layer half) turned no row red until a row was added for the
  // INCONSISTENT PAIR. It is kept because `layer` and `origin` are two
  // independently-defaulted fields at the call site, and the pair disagreeing is
  // the one shape that would let a FOREGROUND index aim a background band.
  if (layer !== 'bg' || origin !== 'override') return { kind: 'pick', why: 'not-the-override-blob' };
  if (anchorSlot === releaseSlot) return { kind: 'pick', why: 'same-slot' };

  // ── `rows` comes from mutable store state, and every step below divides by
  // it. The legal set is the codec's, enumerated through `bandColumnBytes`
  // rather than restated as "a power of two" — see `rowChoices`.
  if (!rowChoices().includes(rows)) {
    return {
      kind: 'refused',
      reason: `rows is ${rows}, which does not make rows*${TILE_BYTES} an exact power of two — `
        + 'the runtime rotates a whole pattern column by shifting it. Pick a row count from the '
        + 'form before dragging a range.',
    };
  }

  const lo = Math.min(anchorSlot, releaseSlot);
  const runEnd = Math.max(anchorSlot, releaseSlot);
  const staticBase = Math.max(lo, firstPromotableSlot);

  if (staticBase > runEnd) {
    return {
      kind: 'refused',
      reason: `slots ${lo}..${runEnd} are all inside the animated prefix — slots 0..`
        + `${firstPromotableSlot} already belong to bands, so there is no static art under this `
        + 'drag to promote. Drag a run that reaches past the prefix.',
    };
  }

  const runLength = runEnd - staticBase + 1;
  const wanted = Math.max(1, Math.floor(runLength / rows));
  // Whole columns only, and never past the end of the blob.
  const maxCols = Math.floor((blobTileCount - staticBase) / rows);
  if (maxCols < 1) {
    return {
      kind: 'refused',
      reason: `a band of ${rows} row(s) needs ${rows} slot(s) from ${staticBase}, but the blob `
        + `ends at ${blobTileCount}. No column fits there, so the candidate is unchanged.`,
    };
  }
  const cols = Math.min(wanted, maxCols);

  return {
    kind: 'range',
    staticBase,
    cols,
    rows,
    runEnd,
    runLength,
    clampedToPrefix: staticBase !== lo,
    trimmedToBlob: cols < wanted,
  };
}

/**
 * The one-line readout for the picker's hover label.
 *
 * IT IS THE ONLY SURFACE THIS GESTURE HAS. The strip has no other place to
 * speak, and the candidate it moves lives two panels away in a section that
 * arrives collapsed — so a drag that changed the candidate and said nothing
 * would be indistinguishable from a drag that did nothing at all. Every outcome
 * gets a sentence, including the refusals.
 *
 * ⚠ NEUTRAL ABOUT THE FOOTPRINT, exactly as `coverageSummary` is: it states the
 * range the drag aimed and what the run snapped to, and never whether that is a
 * good idea. `pick` returns '' because the pick has its own label already —
 * the hover readout the strip has always drawn.
 */
export function stripDragLabel(outcome: StripDragOutcome): string {
  if (outcome.kind === 'pick') return '';
  if (outcome.kind === 'refused') return `no range — ${outcome.reason}`;
  const end = outcome.staticBase + outcome.cols * outcome.rows;
  const parts = [`band candidate · slots ${outcome.staticBase}..${end} (${outcome.cols}x${outcome.rows})`];
  parts.push(`from a run of ${outcome.runLength}`);
  if (outcome.clampedToPrefix) parts.push('start moved past the animated prefix');
  if (outcome.trimmedToBlob) parts.push('trimmed to the end of the blob');
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// THE REPORT — what the last strip gesture did, for a CDP harness
// ---------------------------------------------------------------------------
//
// SEPARATE FROM THE STORE, and for the reason `BandMarkReport` is separate from
// `BandLensReport`: the interesting cases are the ones that change nothing. A
// refused drag and a drag that never ran leave `bandCandidate` byte-identical,
// so the store cannot tell them apart — `gestures` advancing is what proves the
// gesture RAN, and `kind` is what proves WHICH branch it took. A harness that
// only watched the candidate could be green on a poisoned build whose second
// code path happened to hold the same value.

export interface StripDragReport {
  kind: StripDragOutcome['kind'] | null;
  /** `why` on a pick, `reason` on a refusal, null on a range. */
  detail: string | null;
  anchorSlot: number | null;
  releaseSlot: number | null;
  staticBase: number | null;
  cols: number | null;
  rows: number | null;
  /** Advances on every released gesture, resolved or not. */
  gestures: number;
}

const EMPTY: StripDragReport = {
  kind: null, detail: null, anchorSlot: null, releaseSlot: null,
  staticBase: null, cols: null, rows: null, gestures: 0,
};

let lastReport: StripDragReport = EMPTY;

export function publishStripDrag(
  input: Pick<StripDragInputs, 'anchorSlot' | 'releaseSlot'>, outcome: StripDragOutcome,
): void {
  lastReport = {
    kind: outcome.kind,
    detail: outcome.kind === 'pick' ? outcome.why
      : outcome.kind === 'refused' ? outcome.reason : null,
    anchorSlot: input.anchorSlot,
    releaseSlot: input.releaseSlot,
    staticBase: outcome.kind === 'range' ? outcome.staticBase : null,
    cols: outcome.kind === 'range' ? outcome.cols : null,
    rows: outcome.kind === 'range' ? outcome.rows : null,
    gestures: lastReport.gestures + 1,
  };
}

export function lastStripDragReport(): StripDragReport {
  return lastReport;
}
