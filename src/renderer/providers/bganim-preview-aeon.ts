// The BgAnim band preview, resolved from the aeon stores — ROADMAP item 42.
//
// ONE DERIVATION, TWO READERS. `MapViewport` needs it to draw; the Effects
// column's note needs it to say what is and is not previewing, and WHY. Putting
// it here rather than inside the viewport means the note does not have to wait a
// render for the viewport's effect to run, and — the reason that actually
// matters — the resolution is a plain function the node suite can reason about
// instead of a `.tsx` closure it cannot see.
//
// THE VERSION ARGUMENT IS THE CALLER'S. Both readers subscribe to the same edit
// clocks and pass them in; `prepare` is idempotent on an unchanged signature, so
// calling this from a render AND from an rAF costs one map lookup on all but the
// frames where something actually moved.

import { BAND_DEFAULTS } from '../../core/formats/bg-override/bg-override';
import { BgAnimPreviewRenderer, type BandPreviewVerdict } from '../canvas/BgAnimPreviewRenderer';
import {
  documentBands, bandSlotBases, describeBands,
} from '../../core/formats/bg-override/bg-anim-band';
import {
  bandCoverage, slotRange, coverageSubject, coverageSummary,
  type BandCoverage, type SlotRange,
} from './band-coverage';
import { actBindsBgOverride } from '../../core/formats/bg-override/bg-override-binding';
import { bgOverrideDisplay } from '../../core/formats/bg-override/bg-override-view';
import type { BgOverrideState } from '../../core/formats/bg-override/bg-override-io';
import { BG_WIDTH } from '../../core/formats/bg-tiles';
import { danglingBgRef } from '../../core/formats/bg-library';
import { useProjectStore, getCurrentAct, getCurrentZone } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import type { Act, BgLibraryEntry, Tile } from '../../core/model/s4-types';

/**
 * The one preview instance. Module-scoped like `sectionRenderer` next door, and
 * for the same reason: it owns a plane-sized offscreen buffer and a per-band art
 * cache that must survive a React re-render.
 */
export const bandPreview = new BgAnimPreviewRenderer();

/** What the Effects column needs to explain the state of the preview. */
export interface BandPreviewSnapshot {
  /** Per DOCUMENT band, in list order. Empty when there is no document. */
  verdicts: readonly BandPreviewVerdict[];
  /** Drawable bands that read the clock. The viewport mounts its rAF on this. */
  timerBands: number;
  /** At least one licensed band is actually drawn by some background cell. */
  hasDrawable: boolean;
  /** False when the project carries no readable `editor_bg_override.json`. */
  documentPresent: boolean;
  /** False when the active section resolves to no background at all. */
  backgroundPresent: boolean;
}

const EMPTY_SNAPSHOT: Omit<BandPreviewSnapshot, 'documentPresent' | 'backgroundPresent'> = {
  verdicts: [], timerBands: 0, hasDrawable: false,
};

/**
 * Where the background the viewport is painting came from. The paint gesture
 * needs this: each source is a different file with a different write path, and
 * a stroke that recorded against the wrong one would be an edit that never
 * reaches the project.
 */
export type DisplayedBgSource = 'override' | 'library' | 'act';

export interface DisplayedBg {
  source: DisplayedBgSource;
  layout: Uint16Array;
  tiles: Tile[];
  /** The library entry's id — `source: 'library'` only, null otherwise. */
  libraryId: string | null;
}

/**
 * Resolve which background (Plane B) the viewport should display for the ACTIVE
 * section.
 *
 * THE ORDER IS THE RULING (docs/decisions.jsonl d-12, "the game's copy wins"):
 *
 *   1. the BG OVERRIDE document, when this act is the one aeon's injector bakes
 *      it into (`actBindsBgOverride`) and the document is readable. This is what
 *      the ROM is built from — `inject_editor_bg.py` reads it and writes the
 *      act's `zone_bg.bin` / `bg_tiles.bin`, and no aeon tool reads the BG
 *      library at all — so on the overridden act it is the only honest picture.
 *   2. the section's `bgLayoutRef` -> a BG-library entry;
 *   3. the act default (`act.bgLayout`/`act.bgTiles`).
 *
 * Null when no BG exists at all.
 *
 * MOVED HERE FROM `MapViewport` rather than copied. The preview's licence check
 * is a claim about the blob ON SCREEN, so it has to resolve the background
 * through the SAME function that hands it to `SectionRenderer.loadBg` — a second
 * copy that agreed today would be free to disagree later, and the failure it
 * would produce (a licence granted against a blob nobody is painting) is
 * invisible: right art, wrong cells, no error. That divergence is exactly what
 * step 1 exists to end.
 */
export function resolveDisplayedBg(
  act: Act,
  bgLibrary: readonly BgLibraryEntry[],
  activeSectionIndex: number,
  bgOverride?: BgOverrideState | null,
): DisplayedBg | null {
  const doc = bgOverride?.doc ?? null;
  if (doc !== null && actBindsBgOverride(act) && doc.layout.length > 0) {
    const view = bgOverrideDisplay(doc);
    return { source: 'override', layout: view.layout, tiles: view.tiles, libraryId: null };
  }
  const ref = act.sections[activeSectionIndex]?.bgLayoutRef ?? null;
  if (ref !== null) {
    const entry = bgLibrary.find((b) => b.id === ref);
    if (entry) {
      return { source: 'library', layout: entry.layout, tiles: entry.tiles, libraryId: entry.id };
    }
  }
  // ── THE SILENT FALLBACK (O31) ──────────────────────────────────────────────
  //
  // A non-null `ref` that found no entry lands HERE, and comes out as
  // `source: 'act'` — the same value a section that asked for nothing produces.
  // That is deliberate and stays: an author on a checkout without the library's
  // binaries must keep editing, and the act default is the right thing to
  // paint. What must not stay silent is the DIFFERENCE, and this return value
  // is the wrong carrier for it — the readers that need it ask about sections
  // this function never resolves (the whole grid) or about the manifest rather
  // than the picture. `core/formats/bg-library.ts danglingBgRef` is the one
  // predicate, and it is read by the Properties select (providers/
  // properties-aeon), the section grid's dot and tooltip (SectionGridNav), the
  // map status line (providers/map-status-aeon) and `list_bgs` (agent-handler).
  // A fifth reader belongs there too, not in a field here that nothing reads.
  if (act.bgLayout && act.bgTiles) {
    return { source: 'act', layout: act.bgLayout, tiles: act.bgTiles, libraryId: null };
  }
  return null;
}

/**
 * Re-derive the preview from current store state and report what it found.
 *
 * `version` is the caller's edit clock (`${historyVersion}:${liveEditVersion}`).
 * It is part of the prepare signature because a single BG tile write or a single
 * layout word changes what the licence check and the cell scan should say, and
 * nothing else in the signature would notice either.
 */
export function refreshBandPreview(version: string): BandPreviewSnapshot {
  const state = useProjectStore.getState();
  const zone = getCurrentZone(state);
  const act = getCurrentAct(state);
  const holder = state.project?.bgOverride ?? null;
  const doc = holder?.doc ?? null;
  const bands = doc ? documentBands(doc) : [];
  const activeSectionIndex = useEditorStore.getState().activeSectionIndex;
  const resolved = zone && act
    ? resolveDisplayedBg(act, state.project?.bgLibrary ?? [], activeSectionIndex, holder)
    : null;

  if (!zone || !act || !resolved || bands.length === 0) {
    bandPreview.prepare(
      {
        bands: [], nametable: new Uint16Array(0), widthTiles: 0, heightTiles: 0,
        blobTiles: [], paletteLines: [],
      },
      `empty:${version}:${zone?.id ?? ''}:${act?.id ?? ''}:${bands.length}:${resolved ? 1 : 0}`,
    );
    return {
      ...EMPTY_SNAPSHOT,
      documentPresent: doc !== null,
      backgroundPresent: resolved !== null,
    };
  }

  // The active section's BG ref is in the signature on its own: swapping one
  // library entry for another of the same shape changes which blob a slot index
  // MEANS, and no length or clock in here would move. The SOURCE joins it for
  // the same reason one step up: an act that starts or stops being the
  // overridden one swaps the whole blob without moving a ref or a length.
  const bgRef = act.sections[activeSectionIndex]?.bgLayoutRef ?? '@act';
  bandPreview.prepare({
    bands,
    nametable: resolved.layout,
    widthTiles: BG_WIDTH,
    heightTiles: Math.floor(resolved.layout.length / BG_WIDTH),
    blobTiles: resolved.tiles,
    paletteLines: zone.palette.lines,
  }, `${version}:${zone.id}:${act.id}:${activeSectionIndex}:${resolved.source}:${bgRef}:` +
     `${bands.length}:${resolved.tiles.length}:${resolved.layout.length}`);

  return {
    verdicts: bandPreview.bandVerdicts(),
    timerBands: bandPreview.timerBandCount(),
    hasDrawable: bandPreview.hasDrawableCells(),
    documentPresent: true,
    backgroundPresent: true,
  };
}

// ---------------------------------------------------------------------------
// WHAT ONE BAND CARD SAYS — ROADMAP item 45
// ---------------------------------------------------------------------------
//
// Until this parcel the effects column drew TWO cards per band: the band
// editor's (geometry, slots, driver, `rate_shift`, Demote/Remove) and the
// preview note's (driver again, geometry again, the resolved rate, and the
// verdict). One band, two cards, in a 300px column that overflowed. The fold
// kept the half only the preview knew and dropped the half it repeated, and
// THAT half is composed here rather than in the panel — bar 1: a sentence built
// inside a `.tsx` is a sentence `vitest run` cannot see.
//
// THE TWO FACTS THAT SURVIVED, and why neither is a duplicate:
//
//   THE RESOLVED RATE. The card already prints `rate_shift 2 (default)`, which
//   is the DOCUMENT'S value. What an author actually wants to know is what that
//   number does, and the answer depends on the DRIVER: a `timer` band advances
//   one pixel per 2^n game FRAMES (so it has a px/s), a camera band advances one
//   pixel per 2^n CAMERA PIXELS (so it has none, and printing one would invent a
//   speed the engine does not have).
//
//   THE VERDICT. Licence and cell count are properties of the BLOB ON SCREEN,
//   which no amount of reading the document can tell you.

/** GAME FRAMES PER SECOND — the rate the preview's clock and the engine share. */
export const GAME_FRAMES_PER_SECOND = 60;

/**
 * The slowest px/s this readout will print as a plain decimal.
 *
 * `(60 / units).toFixed(2)` folds to "0.00" the moment `units` passes 6000, and
 * a band that advances one pixel every two minutes is slow, not stopped —
 * telling an author it moves at zero px/s is a lie about the one quantity this
 * readout exists for. Below this the sentence switches to a `<` bound, which
 * stays true at every `rate_shift` however absurd.
 */
const SLOWEST_PRINTABLE_PX_PER_SEC = 0.01;

// ---------------------------------------------------------------------------
// WHAT A BAND DOES — parcel D (triage 2026-08-26 §A.6)
// ---------------------------------------------------------------------------
//
// The owner, looking at the magenta lens: "they don't say what they do at all —
// draw left to right? rotate?". The caption said WHICH cells and the card said
// `driver timer · rate_shift 2`; nothing on either surface said the band
// SCROLLS. So the mechanism is one sentence, composed here and printed
// VERBATIM on the canvas caption and on the card — one provider, two readers,
// the rule every other band fact on this file already follows.
//
// FROM SOURCE, not from a description: a band is a `cols x rows` tile pattern
// whose eight banks are DMA'd over the same VRAM slots; with `phaseFill:
// 'shift'` bank k is phase 0 rolled k px (`bg-anim-aeon.ts`), so the pattern
// scrolls horizontally inside its own `pattern_px = cols*8` window; the driver
// advances it 1 px per `2^rate_shift` units (schema §5). Every cell whose
// layout word names a band slot shows the same motion.
//
// ═══ THE DIRECTION WORD IS FOREGROUND-GATED ═══
//
// The memory bank records bank k at x as phase 0 at x+k, i.e. the art moves
// LEFT as the driver increases — but that is a reading of the fill, not a
// watching of the ROM, and a caption that stated the wrong direction would be
// worse than one that states none. So the sentence ships as `scrolls · …`, and
// the overseer flips ONE constant after watching the built ROM. The tests pin
// the flipped shape (`scrolls left · …`) so the flip is one edit.

/** The direction word the motion sentence carries. CONFIRMED on the built ROM 2026-08-26 (see bganim-band-status.test.ts). */
export const BAND_SCROLL_DIRECTION: '' | 'left' | 'right' = 'left';

/**
 * The one sentence that says what a band does, in the units its driver reads.
 *
 *   band:      `scrolls · 1px per 4 frames · ≈15 px/s`
 *   candidate: `would scroll · 1px per 8 px of camera travel`
 *
 * A `timer` band advances one pixel per 2^n game FRAMES, so it has a px/s; a
 * camera band advances one pixel per 2^n pixels of CAMERA TRAVEL, so it has
 * none, and printing one would invent a speed the engine does not have.
 */
export function bandMotion(
  band: { driver: string; rateShift: number }, kind: 'band' | 'candidate',
): string {
  // `2 **`, not `1 <<`: `rate_shift` has no upper bound in the contract
  // (`clampRateShift`'s docblock says why), and a shift of 32 wraps to 1 under
  // the 68000-shaped operator while the arithmetic one keeps saying something
  // true.
  const units = 2 ** band.rateShift;
  const per = Number.isFinite(units) ? units.toLocaleString('en-US') : `2^${band.rateShift}`;
  const verb = kind === 'band' ? 'scrolls' : 'would scroll';
  const dir = BAND_SCROLL_DIRECTION === '' ? '' : ` ${BAND_SCROLL_DIRECTION}`;
  if (band.driver !== 'timer') {
    // A camera band's phase is a function of the pan, so it has no speed. This
    // is `bandIsTimeVarying`'s question asked of an already-resolved driver.
    return `${verb}${dir} · 1px per ${per} px of camera travel`;
  }
  const pxPerSec = GAME_FRAMES_PER_SECOND / units;
  // The injector prints the same sentence into its bake report ("1px per N
  // units"). `px` is already both singular and plural, so only the frame word
  // takes an s.
  return `${verb}${dir} · 1px per ${per} frame${units === 1 ? '' : 's'} · ${
    pxPerSec < SLOWEST_PRINTABLE_PX_PER_SEC
      ? `<${SLOWEST_PRINTABLE_PX_PER_SEC} px/s`
      : `≈${pxPerSec.toFixed(pxPerSec < 1 ? 2 : 0)} px/s`}`;
}

/**
 * What a band IS, said once at the top of the band section. The paragraph
 * above, compressed to one hint line; the per-band sentence is `bandMotion`.
 */
export const BAND_MECHANISM_HINT =
  'A tile animation is a cols x rows tile pattern with 8 frames swapped over the same tiles, so '
  + 'it scrolls inside its own window. Every cell that points at it moves the same way.';

export type BandStatusKind = 'previewing' | 'no-cells' | 'refused' | 'unresolved';

/** The two lines a band card carries that only the preview knows. */
export interface BandStatus {
  kind: BandStatusKind;
  /** What this band's `rate_shift` MEANS, in the units its driver reads. */
  rate: string;
  /**
   * The verdict sentence, or null when there is nothing per-band to say — no
   * document, or an active section that resolves to no background. The strip
   * carries ONE column-wide warning for that case, and repeating it inside every
   * card would be the duplication this item exists to remove.
   */
  verdict: string | null;
}

/**
 * Compose one band card's preview status.
 *
 * `band` carries the RESOLVED driver and `rate_shift` (`describeBands` has
 * already applied the contract defaults through `BAND_DEFAULTS`), so the two
 * lines of one card cannot disagree about what an absent key means. `verdict` is
 * the preview's own, or `undefined` when the snapshot has none for this band.
 */
export function bandStatus(
  band: { driver: string; rateShift: number },
  verdict: { cells: number; refusal: string | null } | undefined,
): BandStatus {
  // THE SAME SENTENCE THE LENS CAPTION PRINTS (`bandLensCaptionLines`), by
  // construction: the card and the canvas call one function.
  const rate = bandMotion(band, 'band');

  if (verdict === undefined) return { kind: 'unresolved', rate, verdict: null };
  // A REFUSAL OUTRANKS A CELL COUNT. A band whose slots name a blob nobody is
  // painting is not previewing, however many cells point at those indices.
  if (verdict.refusal !== null) {
    return {
      kind: 'refused',
      rate,
      verdict: `Not previewing: ${verdict.refusal}. The tile animation names slots in the BG tile blob, `
        + 'and the blob on screen is not the one this document describes.',
    };
  }
  if (verdict.cells === 0) {
    return { kind: 'no-cells', rate, verdict: 'Licensed, but no background cell draws its slots.' };
  }
  return { kind: 'previewing', rate, verdict: `previewing · ${verdict.cells} background cells` };
}

// ---------------------------------------------------------------------------
// THE BAND LENS — ROADMAP item 43 part 2
// ---------------------------------------------------------------------------
//
// ONE RESOLUTION, TWO READERS, exactly as `resolveDisplayedBg` above is one
// resolution for the renderer and for the licence check. `MapViewport` calls
// this to tint; `BgAnimBandPanel` calls it to print the footprint. A second copy
// that agreed today would be free to disagree later, and the failure it would
// produce — the panel saying 1,244 cells while the map lights a different set —
// is exactly the class of defect the shared-resolution rule exists for.
//
// ═══ IT IS GATED ON WHICH BACKGROUND IS ON SCREEN, AND ONLY ON THAT ═══
//
// A slot index means a position in the BG OVERRIDE DOCUMENT'S blob. Aurora
// paints whichever background `resolveDisplayedBg` picks, and on an act the
// override does not bind that is a DIFFERENT blob holding different art at the
// same indices (docs/reviews/2026-08-26-bganim-preview-blob-divergence.md).
// Tinting that picture from this document's slot numbers would light real cells,
// in a plausible shape, on the wrong art — no error anywhere.
//
// So the lens draws only when `source === 'override'`, and SAYS WHY when it does
// not. That is a refusal about the DOCUMENT, never about the range:
// `bandCoverage` itself is total, and `cells: []` is a real answer it returns.

/** What the lens is lighting, and what it found. `range: null` means "no mark". */
export interface BandLensResolution {
  /** 'band' or 'candidate' — which subject resolved, or null when none did. */
  kind: 'band' | 'candidate' | null;
  /** The band index, when `kind === 'band'`. */
  bandIndex: number | null;
  /** The slot range on screen, or null when nothing is marked. */
  range: SlotRange | null;
  /** The footprint, or null when it could not be computed. */
  coverage: BandCoverage | null;
  /**
   * WHAT THE BAND DOES — `bandMotion`, resolved from the band's own driver and
   * `rate_shift` (or the candidate's), so the caption says the sentence the
   * card says. Null only when nothing is marked.
   */
  motion: string | null;
  /**
   * Why there is no coverage for a range that IS marked, or null.
   *
   * LOUD ON UNMEASURABLE. A lens that quietly drew nothing when the background
   * on screen is not this document's would be indistinguishable from a range
   * that legitimately paints no cells — and those two mean opposite things.
   */
  reason: string | null;
  /** Where the background the viewport paints came from. Null when there is none. */
  source: DisplayedBgSource | null;
}

const NO_LENS: BandLensResolution = {
  kind: null, bandIndex: null, range: null, coverage: null, motion: null, reason: null, source: null,
};

/**
 * The lines the canvas caption prints, composed here so the sentence on the
 * canvas and the sentence on the card are the SAME CALL (`bandMotion`), not two
 * strings that agree today.
 *
 *   1. what the wash is (`coverageSubject`), with the swatch;
 *   2. what the band does (`motion`) — `scrolls · 1px per …`;
 *   3. the shape, or the reason there is none.
 */
export function bandLensCaptionLines(
  lens: Pick<BandLensResolution, 'kind' | 'bandIndex' | 'coverage' | 'motion' | 'reason'>
    & { range: SlotRange },
): string[] {
  return [
    coverageSubject(lens.kind ?? 'candidate', lens.bandIndex, lens.range),
    lens.motion ?? '',
    lens.reason !== null ? lens.reason.slice(0, 96)
      : lens.coverage ? coverageSummary(lens.coverage) : '',
  ].filter((s) => s !== '');
}

/**
 * Resolve the band lens from current store state.
 *
 * STALE TARGETS FALL BACK RATHER THAN THROW — the `resolveSelectedScene` rule.
 * Undoing a promote can leave `bandLensTarget` naming band 3 of a document that
 * now has one. That is not an error to surface: it is a mark whose subject went
 * away, so the lens goes dark.
 */
export function resolveBandLens(): BandLensResolution {
  const target = useEditorStore.getState().bandLensTarget;
  if (target === null) return NO_LENS;

  const state = useProjectStore.getState();
  const act = getCurrentAct(state);
  const holder = state.project?.bgOverride ?? null;
  const doc = holder?.doc ?? null;
  if (!act || !doc) return NO_LENS;

  const bands = documentBands(doc);
  let kind: 'band' | 'candidate';
  let bandIndex: number | null = null;
  let range: SlotRange;
  let motion: string;
  if (target.kind === 'band') {
    const band = bands[target.index];
    if (!band) return NO_LENS; // the mark outlived its subject
    kind = 'band';
    bandIndex = target.index;
    range = slotRange(bandSlotBases(bands)[target.index], band.cols, band.rows);
    // `describeBands` resolves the contract defaults, exactly as the card's
    // `bandRows` does — so an absent `rate_shift` reads the same on both.
    motion = bandMotion(describeBands(doc)[target.index], 'band');
  } else {
    const c = useEditorStore.getState().bandCandidate;
    kind = 'candidate';
    range = slotRange(c.staticBase, c.cols, c.rows);
    // Absent driver/rate mean "leave the key out" (parcel B), so the caption
    // resolves the contract default the way the document would.
    motion = bandMotion({ driver: c.driver ?? BAND_DEFAULTS.driver, rateShift: c.rateShift ?? BAND_DEFAULTS.rate_shift }, 'candidate');
  }

  const resolved = resolveDisplayedBg(
    act, state.project?.bgLibrary ?? [],
    useEditorStore.getState().activeSectionIndex, holder,
  );
  if (!resolved) {
    return {
      kind, bandIndex, range, coverage: null, motion, source: null,
      reason: 'the active section resolves to no background, so there is no picture to light.',
    };
  }
  if (resolved.source !== 'override') {
    return {
      kind, bandIndex, range, coverage: null, motion, source: resolved.source,
      reason: "the background on screen is not this document's. A slot index names a tile in the "
        + 'blob this file carries, and the act is painting another one, so nothing here can say '
        + 'which cells the range paints.',
    };
  }

  // `BG_WIDTH` is the width `reloadBg` hands `SectionRenderer.loadBg`, so the
  // lens decodes the plane exactly as the viewport painted it.
  let coverage: BandCoverage;
  try {
    coverage = bandCoverage(resolved.layout, range, BG_WIDTH);
  } catch (e) {
    return {
      kind, bandIndex, range, coverage: null, motion, source: resolved.source,
      reason: e instanceof Error ? e.message : String(e),
    };
  }
  return { kind, bandIndex, range, coverage, motion, reason: null, source: resolved.source };
}
