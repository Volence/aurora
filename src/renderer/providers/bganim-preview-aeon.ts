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

import { BgAnimPreviewRenderer, type BandPreviewVerdict } from '../canvas/BgAnimPreviewRenderer';
import { documentBands } from '../../core/formats/bg-override/bg-anim-band';
import { actBindsBgOverride } from '../../core/formats/bg-override/bg-override-binding';
import { bgOverrideDisplay } from '../../core/formats/bg-override/bg-override-view';
import type { BgOverrideState } from '../../core/formats/bg-override/bg-override-io';
import { BG_WIDTH } from '../../core/formats/bg-tiles';
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
