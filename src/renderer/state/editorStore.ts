import { create } from 'zustand';
import type { Solidity } from '../../core/collision/collision-model';
import type { ToolId } from '../../core/project/adapter';
// Type-only: the candidate's shape is owned by the verbs module that turns it
// into a BandSpec, so the store and the two surfaces cannot disagree on it.
import type { BandCandidate } from '../providers/band-verbs';
import type { AnyCommand, S4Level } from '../../core/editing/commands';
import { chunkIdsAffectedByCommand } from '../../core/editing/chunk-invalidation';
import type { MapClipboard, PasteLayers } from '../../core/editing/map-clipboard';
import type { UndoStack } from '../../core/editing/undo-stack';
import { useArtStore } from './artStore';
import { BoundEditHistory } from '../../core/editing/bound-edit-history';
import { documentHistoryHub } from './history-hub';
import { useProjectStore } from './projectStore';
import { BAND_DEFAULTS } from '../../core/formats/bg-override/bg-override';
import { useSessionStore } from './sessionStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { levelDocId, parseLevelTabId, isSpriteDocTabId, isCanvasDocTabId, zoneArtDocId } from '../shell/tabs';

/**
 * The editing tool, for BOTH engines (spec §3.6 — one tool vocabulary). Classic
 * used to run its own three-value `ClassicTool`; it reads this store now, with
 * `pan → view`, `stamp → stamp-chunk`, and its dual-purpose `object` split into
 * the two aeon tools it always was — `select` unarmed, `place-object` armed.
 *
 * An alias of core's `ToolId`, which is where the vocabulary is declared so a
 * profile can name it (CapabilityManifest.facetTools). Kept exported under this
 * name because it is what the renderer has always called it.
 */
export type EditorTool = ToolId;

/** An in-progress or committed marquee selection, in tile coords, snapped to
 *  16px blocks (map-clipboard.ts snapMarquee) and pinned to one section. */
export interface MarqueeState {
  sectionIndex: number;
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface Selection {
  type: 'object' | 'ring';
  sectionIndex: number;
  index: number;
}

export interface RingPattern {
  name: string;
  offsets: Array<{ dx: number; dy: number }>;
}

export const RING_PATTERNS: RingPattern[] = [
  { name: 'Single', offsets: [{ dx: 0, dy: 0 }] },
  { name: 'H×2', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }] },
  { name: 'H×3', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }] },
  { name: 'H×4', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }, { dx: 72, dy: 0 }] },
  { name: 'H×5', offsets: [{ dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 }, { dx: 72, dy: 0 }, { dx: 96, dy: 0 }] },
  { name: 'H×8', offsets: Array.from({ length: 8 }, (_, i) => ({ dx: i * 24, dy: 0 })) },
  { name: 'V×2', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }] },
  { name: 'V×3', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }] },
  { name: 'V×4', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }, { dx: 0, dy: 72 }] },
  { name: 'V×5', offsets: [{ dx: 0, dy: 0 }, { dx: 0, dy: 24 }, { dx: 0, dy: 48 }, { dx: 0, dy: 72 }, { dx: 0, dy: 96 }] },
  { name: 'V×8', offsets: Array.from({ length: 8 }, (_, i) => ({ dx: 0, dy: i * 24 })) },
  { name: 'Diamond', offsets: [
    { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 48, dy: 24 }, { dx: 24, dy: 48 },
  ]},
  { name: 'Circle', offsets: (() => {
    const r = 36;
    return Array.from({ length: 8 }, (_, i) => ({
      dx: Math.round(r * Math.cos(i * Math.PI / 4)),
      dy: Math.round(r * Math.sin(i * Math.PI / 4)),
    }));
  })()},
  { name: '2×2 Box', offsets: [
    { dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 24, dy: 24 },
  ]},
  { name: '3×3 Box', offsets: [
    { dx: 0, dy: 0 }, { dx: 24, dy: 0 }, { dx: 48, dy: 0 },
    { dx: 0, dy: 24 }, { dx: 24, dy: 24 }, { dx: 48, dy: 24 },
    { dx: 0, dy: 48 }, { dx: 24, dy: 48 }, { dx: 48, dy: 48 },
  ]},
  { name: 'Triangle', offsets: [
    { dx: 24, dy: 0 }, { dx: 0, dy: 24 }, { dx: 24, dy: 24 }, { dx: 48, dy: 24 },
  ]},
];

export type EditingLayer = 'fg' | 'bg';

interface EditorState {
  tool: EditorTool;
  selection: Selection | null;
  dirty: boolean;
  /**
   * WHICH acts have unsaved edits, keyed `${zoneId}/${actId}`, with an edit
   * counter as the value.
   *
   * One project-wide `dirty` boolean could not survive a second act. Every
   * command in every act set it; the save resolved exactly ONE act and looped
   * its sections; `markClean()` then cleared everything. Edit act 1, switch to
   * act 2, Ctrl+S → act 2's files written, dirty false, no dot on any tab, the
   * project switch proceeds without a confirm, act 1's edits gone. Multi-act is
   * a designed configuration (shell/tabs.ts, session-lifecycle emits a tab per
   * act), so this had to be fixed before anyone authored the second act rather
   * than after.
   *
   * The counter is the other half: a save awaits real IPC, so an edit landing
   * mid-write is not in the bytes that reached disk and its act must stay
   * dirty. `markActsClean` compares.
   */
  dirtyActs: Record<string, number>;
  /**
   * Repaint clock for level mutations that DON'T go through a command and so
   * never reach an undo stack: an object/ring drag in progress, a direct BG tile
   * write. History-driven repaint is not here — it comes from the hub, via
   * hooks/useHistoryVersion.
   */
  liveEditVersion: number;
  /**
   * Coarse "some chunk thumbnail changed" clock: bumped for every command a
   * thumbnail bakes (set-chunk / set-tileset-tiles / set-palette-line), on
   * execute, undo and redo alike. Still the right key for anything that has to
   * rescan the WHOLE library — the grid's blank-chunk set, say — but too blunt to
   * key a thumbnail on: see chunkVersions.
   */
  chunkLibraryVersion: number;
  /**
   * Per-chunk revision, keyed by chunk id. Advanced only for the chunks a
   * command can actually reach (core/editing/chunk-invalidation.ts), so one
   * tile-pixel edit repaints the handful of thumbnails that draw that tile
   * instead of all 256. Mirrors classicLevelStore.chunkVersions — both engines'
   * chunk grids now key their paint on `${epoch}:${revision}`.
   */
  chunkVersions: Map<string, number>;
  /**
   * Bumped when the chunk library is REPLACED rather than edited (import,
   * clear). Chunk ids are derived from the source filename, so a clear-then-
   * import can reuse an id for different art; without an epoch the revision
   * would fall back to 0 and a stale thumbnail would keep its key.
   */
  chunkEpoch: number;

  // S4 tool state
  activeSectionIndex: number;
  editingLayer: EditingLayer;
  /**
   * The FOREGROUND pick: an index into the zone tileset, which is what the
   * section nametables carry.
   */
  selectedTileIndex: number;
  /**
   * The BACKGROUND pick: a BLOB-LOCAL index into whichever tile array
   * `resolveDisplayedBg` says Plane B is drawn from (ROADMAP item 47).
   *
   * ═══ WHY THERE ARE TWO OF THESE ═══
   *
   * The two indices name DIFFERENT SPACES — 919 zone tiles vs a 320-tile
   * override blob on the live tree, with no correspondence between them at any
   * index. One shared value has to either lie (carry a foreground index into the
   * background and paint whatever happens to sit at that slot) or silently move
   * the author's pick to fit the other array. Both are the defect class item 47
   * exists to remove, so the pick is per layer: switching layers restores what
   * was picked in THAT space and changes nothing in the other.
   */
  selectedBgTileIndex: number;
  /**
   * The BAND pick for `stamp-band` (parcel J): an index into the override's
   * `anims`, or null when no band is picked. A band, not a slot — the stamp
   * derives the slot range from the band's position in the list at gesture
   * time, so a band inserted before it moves the pick's slots, never its
   * identity. Separate from `selectedBgTileIndex` because a band pick must not
   * disturb the slot the per-tile stroke paints, and vice versa.
   */
  selectedBgBand: number | null;
  selectedPaletteLine: number;
  selectedChunkId: string | null;
  selectedObjectTypeId: string | null;
  selectedObjectSubtype: number;
  selectedRingPattern: number;
  selectedCollisionProfile: number; // base-bank shape index for the map collision palette
  selectedCollisionEntryFlipX: boolean; // the picked palette entry's mirror-to-canonical-left flag
  selectedCollisionXFlip: boolean;  // USER Flip-H toggle (XORs with the entry flag → effective mirror)
  selectedCollisionYFlip: boolean;  // flip the painted shape vertically (floor↔ceiling)
  selectedCollisionSolidity: Solidity; // floor type painted: all / top (jump-through) / none / sides-bottom
  collisionPaintPlane: 'a' | 'b';
  collisionBrushSize: number; // brush width in 16px blocks; 1 = reuse, >1 = positional N×N area

  /**
   * Which effects scene the Effects facet is editing, or null for "whatever the
   * fallback resolves to".
   *
   * SHARED BECAUSE TWO SURFACES NEED IT, which is the whole reason it moved
   * (ROADMAP item 43). It was `React.useState` inside EffectsScenePanel, and
   * MapViewport — a sibling component, not a child — cannot read that. The
   * canvas now draws the selected scene's layers as draggable world-Y guides,
   * so the panel and the canvas have to agree on which scene that is, and one
   * store field is the only way they can.
   *
   * IT IS A RAW ID AND MAY BE STALE. Undoing a create, or opening another
   * project, leaves an id here that names nothing. Resolution — including the
   * "fall back to the first scene" rule the panel has always had — lives in
   * `resolveSelectedScene` (providers/effects-aeon), which both readers call.
   * Storing the resolved scene instead would mean storing a slice of the
   * project inside the editor store and keeping it in step with every undo.
   */
  selectedEffectsSceneId: string | null;

  /**
   * The promotion candidate the band panel's "From existing tiles" form holds —
   * the geometry and the static base a Promote would use.
   *
   * LIFTED OUT OF `BgAnimBandPanel`'s `React.useState` FOR THE REASON
   * `selectedEffectsSceneId` was (ROADMAP item 43): MapViewport is a SIBLING,
   * not a child, so it cannot read the panel's local state — and the band lens
   * needs the same range the form is about to promote, or the map would be
   * showing the footprint of a different band from the one the button makes.
   *
   * `staticBase` IS NOT CLAMPED HERE. `firstPromotableSlot` is a property of the
   * document, which this store does not hold; the panel clamps the seed to it
   * (so a seeded candidate is legal by construction) and the codec refuses
   * anything else. A store that clamped would be a third opinion about
   * legality.
   */
  bandCandidate: BandCandidate;

  /**
   * What the map's BAND LENS is lighting, or null for "nothing marked".
   *
   * NULL ON ARRIVAL, DELIBERATELY. The candidate always holds *some* range (it
   * seeds at 1x1), and tinting cells for a range the author never chose would
   * teach them the lens is noise. The lens turns on when they MARK something —
   * a click on the map, a click on a band card, or a touch of the form.
   *
   * `{ kind: 'band' }` CARRIES AN INDEX THAT MAY GO STALE. Undoing a promote, or
   * opening another project, leaves an index naming no band. Resolution — and
   * the fallback — is `resolveBandLens` (providers/bganim-preview-aeon), which
   * both the panel and the canvas call, exactly as `resolveSelectedScene` is
   * shared one field up.
   */
  bandLensTarget: { kind: 'band'; index: number } | { kind: 'candidate' } | null;

  /**
   * A band the author should be LOOKING AT — the request to scroll its card
   * into view, consumed by `BgAnimBandPanel` and then cleared.
   *
   * WHY THIS IS NOT `bandLensTarget`. The lens target is "what the map is
   * tinting", and it changes on every card click and every map click; scrolling
   * on all of those would yank the column under the author's cursor. This field
   * is the narrower fact — "something just APPEARED and you cannot see it" — and
   * only the band verbs raise it. The owner's report was exactly that: "I press
   * add a band bank and idk where it is".
   *
   * `nonce` is what makes a repeat reachable: adding, undoing and adding again
   * lands on the SAME index, and a bare number would be a no-op change that
   * scrolls nothing. It is ephemeral UI chrome and NOT part of the document, so
   * raising it cannot create an undo step (`band-lens-clear.test.ts` pins the
   * same property for `bandLensTarget`).
   */
  bandReveal: { index: number; nonce: number } | null;

  marquee: MarqueeState | null;
  mapClipboard: MapClipboard | null;
  pasteLayers: PasteLayers;
  /** True while the map paste-ghost/click-to-commit mode is active (entered by
   *  Ctrl+V, stays active across repeat pastes). Lives in the store (rather
   *  than a MapViewport-local ref) because the paste-layer options bar
   *  (App.tsx) and the status bar hint need to react to it from outside
   *  MapViewport; the hovered footprint position itself is a MapViewport-local
   *  ref (like the collision-paint hover), since nothing else needs it. */
  pasting: boolean;

  setTool: (tool: EditorTool) => void;
  setSelection: (selection: Selection | null) => void;
  setActiveSectionIndex: (index: number) => void;
  setEditingLayer: (layer: EditingLayer) => void;
  setSelectedTileIndex: (index: number) => void;
  setSelectedBgTileIndex: (index: number) => void;
  /** Set whichever of the two the given layer paints from. */
  setSelectedTileIndexForLayer: (layer: EditingLayer, index: number) => void;
  setSelectedBgBand: (index: number | null) => void;
  setSelectedPaletteLine: (line: number) => void;
  setSelectedChunkId: (id: string | null) => void;
  setSelectedObjectTypeId: (id: string | null, subtype?: number) => void;
  setSelectedRingPattern: (index: number) => void;
  setSelectedCollisionProfile: (index: number) => void;
  /** Pick a palette entry: its base shape + whether it must mirror to face left.
   *  Resets the user Flip-H toggle so the freshly-picked shape shows canonical. */
  pickCollisionShape: (shape: number, entryFlipX: boolean) => void;
  setSelectedCollisionXFlip: (on: boolean) => void;
  setSelectedCollisionYFlip: (on: boolean) => void;
  setSelectedCollisionSolidity: (s: Solidity) => void;
  setCollisionPaintPlane: (plane: 'a' | 'b') => void;
  setCollisionBrushSize: (size: number) => void;
  setSelectedEffectsSceneId: (id: string | null) => void;
  /**
   * Move the promotion candidate, and point the lens AT it.
   *
   * The two happen together because they are one act: an author who changes
   * `cols`, `rows` or the static base is describing the candidate, so that is
   * what the map should be showing. Leaving a band card selected while the form
   * moved underneath would put the panel and the canvas on different subjects —
   * the exact split the lift exists to prevent.
   */
  setBandCandidate: (patch: Partial<BandCandidate>) => void;
  setBandLensTarget: (target: { kind: 'band'; index: number } | { kind: 'candidate' } | null) => void;
  /**
   * Ask the band panel to reveal and scroll to a band — see `bandReveal`.
   * EPHEMERAL CHROME: no command, no undo step.
   */
  revealBand: (index: number) => void;
  clearBandReveal: () => void;
  setMarquee: (marquee: MarqueeState | null) => void;
  setMapClipboard: (clipboard: MapClipboard | null) => void;
  setPasteLayers: (layers: PasteLayers) => void;
  setPasting: (pasting: boolean) => void;
  markDirty: () => void;
  /** Everything clean — a discard, or a project going away. */
  markClean: () => void;
  /**
   * Clean exactly the acts a save WROTE, and only where the act has not been
   * edited since: `atGen` is the `dirtyActs` snapshot the saver read before its
   * write. Returns the keys it withheld.
   */
  markActsClean: (keys: string[], atGen: Record<string, number>) => string[];
  bumpLiveEdit: () => void;
  bumpChunkLibraryVersion: () => void;
  /** Advance the given chunks' revisions. A no-op for an empty list. */
  bumpChunkVersions: (ids: readonly string[]) => void;
  /** The library was replaced: drop every revision and move the epoch. */
  resetChunkVersions: () => void;
}

/**
 * Facets whose edits belong to the ZONE-ART document rather than the act's
 * layout: art and palette are zone-scoped data edited from an act tab.
 * Collision joins them for the same reason — colind is zone-scoped like the
 * art it hangs off, shared by all three acts of the zone through one
 * `collide/{ZONE}.bin`, not owned by any single act's layout.
 *
 * THE SOLE STATEMENT OF WHICH DOCUMENT A FACET EDITS, and keyed on the FACET
 * because that is the unambiguous thing. Classic's SURFACE_FACETS used to be a
 * second statement of the same fact, which held only while each facet had one
 * surface; classic's palette facet has its canvas on the map surface and its
 * editor on the art surface, so the surface a pointer-down landed in stopped
 * answering the question. It routes from here whichever surface was clicked —
 * see components/classic/classic-surface.ts and history-routing.test.ts.
 *
 * Exported for that test, so it reads the real set rather than a copy of it.
 */
export const ZONE_ART_FACETS = new Set<string>(['art', 'palette', 'collision']);

/**
 * The document the user is currently editing: the active tab, refined by the
 * facet focused within it (spec §4.2). Null when the active tab is not a
 * document at all (a tool tab, or nothing open).
 *
 * The ONE resolution — focusedHistory and executeCommand both go through it, so
 * a command can never be recorded on a document that undo would not reach.
 */
export function focusedDocId(): string | null {
  const activeId = useSessionStore.getState().activeId;
  if (!activeId) return null;

  // A sprite-doc tab IS its document; no facet refinement applies. Includes the
  // untitled "New Sprite…" tab, whose id is its document id too — otherwise the
  // toolbar's undo would read as "nothing undoable" while SpriteMode's own
  // Ctrl+Z happily undid on that document's stack.
  if (isSpriteDocTabId(activeId)) return activeId;

  // A canvas-doc tab IS its document, exactly like a sprite-doc tab — no facet
  // refinement applies.
  if (isCanvasDocTabId(activeId)) return activeId;

  const level = parseLevelTabId(activeId);
  if (!level) return null;

  const facet = useWorkspaceStore.getState().facetFor(activeId);
  if (!ZONE_ART_FACETS.has(facet)) return activeId;

  // The art facet's composer can be opened on the BG OVERRIDE (a band slot or
  // a phase bank, `OpenDocument.bgOverride` — parcel I). That art is not zone
  // art: it is the same per-act document the map's `set-bg-override-layout`
  // and the Effects panel's `regenerate-shift` edit on the ACT stack. While
  // such a target is open the art facet edits the ACT, so a stroke records
  // where Ctrl+Z from the map / Effects facets reaches it, and the art
  // facet's own Ctrl+Z reaches the same stack. Without this, one document had
  // two undo stacks interleaved by facet (live-app finding F1,
  // docs/reviews/2026-08-26-effects-foreground-checks-2.md). `art` only: the
  // composer lives there; palette / collision keep their zone-art routing.
  if (facet === 'art' && useArtStore.getState().open?.bgOverride) return activeId;

  return zoneArtDocId(level.zone);
}

/**
 * The undo stack for whatever the user is looking at (spec §4.2) — the ONE undo
 * entry point every keybinding and toolbar button drives. Null when nothing
 * undoable is focused, which the UI renders as a disabled control.
 *
 * Replaces activeHistory(), which keyed off projectStore's current act and so
 * was aeon-coupled and blind to the focused facet.
 */
export function focusedHistory(): UndoStack | null {
  const docId = focusedDocId();
  return docId ? documentHistoryHub.historyFor(docId) : null;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tool: 'view',
  selection: null,
  dirty: false,
  dirtyActs: {},
  liveEditVersion: 0,
  chunkLibraryVersion: 0,
  chunkVersions: new Map<string, number>(),
  chunkEpoch: 0,

  activeSectionIndex: 0,
  editingLayer: 'fg',
  selectedTileIndex: 0,
  selectedBgTileIndex: 0,
  selectedBgBand: null,
  selectedPaletteLine: 0,
  selectedChunkId: null,
  selectedObjectTypeId: null,
  selectedObjectSubtype: 0,
  selectedRingPattern: 0,
  selectedCollisionProfile: 0,
  selectedCollisionEntryFlipX: false,
  selectedCollisionXFlip: false,
  selectedCollisionYFlip: false,
  selectedCollisionSolidity: 'all',
  collisionPaintPlane: 'a',
  collisionBrushSize: 1,
  selectedEffectsSceneId: null,
  // 1x1 at slot 0: the smallest legal band, and a base the panel re-seeds to
  // `firstPromotableSlot` as soon as a document is open. `bandLensTarget: null`
  // is what keeps this from lighting anything before the author marks.
  bandCandidate: {
    staticBase: 0, cols: 1, rows: 1,
    driver: BAND_DEFAULTS.driver, rateShift: BAND_DEFAULTS.rate_shift,
  },
  bandLensTarget: null,
  bandReveal: null,

  marquee: null,
  mapClipboard: null,
  pasteLayers: 'both',
  pasting: false,

  // An explicit tool switch cancels an in-progress paste (repeat pastes never
  // call setTool, so they aren't affected) — picking a different tool while
  // pasting means the user is done pasting.
  setTool: (tool) => set({ tool, selection: null, pasting: false }),
  setSelection: (selection) => set({ selection }),
  setActiveSectionIndex: (index) => set({ activeSectionIndex: index }),
  setEditingLayer: (layer) => set({ editingLayer: layer }),
  setSelectedTileIndex: (index) => set({ selectedTileIndex: index }),
  setSelectedBgTileIndex: (index) => set({ selectedBgTileIndex: index }),
  setSelectedTileIndexForLayer: (layer, index) => set(
    layer === 'bg' ? { selectedBgTileIndex: index } : { selectedTileIndex: index },
  ),
  setSelectedBgBand: (index) => set({ selectedBgBand: index }),
  setSelectedPaletteLine: (line) => set({ selectedPaletteLine: line }),
  setSelectedChunkId: (id) => set({ selectedChunkId: id }),
  setSelectedObjectTypeId: (id, subtype) => set({ selectedObjectTypeId: id, selectedObjectSubtype: subtype ?? 0 }),
  setSelectedRingPattern: (index) => set({ selectedRingPattern: index }),
  setSelectedCollisionProfile: (index) => set({ selectedCollisionProfile: Math.max(0, Math.min(0x3FF, index | 0)) }),
  // Picking a shape updates the canonical-mirror baseline but LEAVES the user's
  // Flip-H / Flip-V toggles untouched — they're sticky "modes" that hold until
  // pressed again (matching Flip-V, which was already sticky).
  pickCollisionShape: (shape, entryFlipX) => set({
    selectedCollisionProfile: Math.max(0, Math.min(0x3FF, shape | 0)),
    selectedCollisionEntryFlipX: !!entryFlipX,
  }),
  setSelectedCollisionXFlip: (on) => set({ selectedCollisionXFlip: !!on }),
  setSelectedCollisionYFlip: (on) => set({ selectedCollisionYFlip: !!on }),
  setSelectedCollisionSolidity: (s) => set({ selectedCollisionSolidity: s }),
  setCollisionPaintPlane: (collisionPaintPlane) => set({ collisionPaintPlane }),
  setCollisionBrushSize: (size) => set({ collisionBrushSize: Math.max(1, Math.min(31, size | 0)) }),
  setSelectedEffectsSceneId: (id) => set({ selectedEffectsSceneId: id }),
  setBandCandidate: (patch) => set((s) => ({
    bandCandidate: { ...s.bandCandidate, ...patch },
    bandLensTarget: { kind: 'candidate' },
  })),
  setBandLensTarget: (bandLensTarget) => set({ bandLensTarget }),
  // ONE UP PER CALL, so two adds of the same index are two distinct requests.
  revealBand: (index) => set((s) => ({
    bandReveal: { index, nonce: (s.bandReveal?.nonce ?? 0) + 1 },
  })),
  clearBandReveal: () => set({ bandReveal: null }),
  setMarquee: (marquee) => set({ marquee }),
  setMapClipboard: (mapClipboard) => set({ mapClipboard }),
  setPasteLayers: (pasteLayers) => set({ pasteLayers }),
  setPasting: (pasting) => set({ pasting }),
  markDirty: () => set((s) => {
    const p = useProjectStore.getState();
    if (!p.currentZoneId || !p.currentActId) return { dirty: true };
    const key = `${p.currentZoneId}/${p.currentActId}`;
    return { dirty: true, dirtyActs: { ...s.dirtyActs, [key]: (s.dirtyActs[key] ?? 0) + 1 } };
  }),
  markClean: () => set({ dirty: false, dirtyActs: {} }),
  markActsClean: (keys, atGen) => {
    const s = get();
    const next = { ...s.dirtyActs };
    const withheld: string[] = [];
    for (const k of keys) {
      if ((next[k] ?? 0) !== (atGen[k] ?? 0)) { withheld.push(k); continue; }
      delete next[k];
    }
    set({ dirtyActs: next, dirty: Object.keys(next).length > 0 });
    return withheld;
  },
  bumpLiveEdit: () => set((s) => ({ liveEditVersion: s.liveEditVersion + 1 })),
  bumpChunkLibraryVersion: () => set((s) => ({ chunkLibraryVersion: s.chunkLibraryVersion + 1 })),
  bumpChunkVersions: (ids) => set((s) => {
    if (ids.length === 0) return {};
    const next = new Map(s.chunkVersions);
    for (const id of ids) next.set(id, (next.get(id) ?? 0) + 1);
    return { chunkVersions: next };
  }),
  resetChunkVersions: () => set((s) => ({
    chunkVersions: new Map<string, number>(),
    chunkEpoch: s.chunkEpoch + 1,
  })),
}));

/**
 * Centralized renderer-cache invalidation hook. The component that owns the
 * renderer caches (MapViewport) registers a listener here; every command that
 * goes through executeCommand/undo/redo is forwarded to it so cached canvases
 * can be repainted — regardless of whether the mutation came from the UI,
 * keyboard undo/redo, or the agent handler.
 */
let invalidationListener: ((cmd: AnyCommand) => void) | null = null;

export function setCommandInvalidationListener(fn: ((cmd: AnyCommand) => void) | null): void {
  invalidationListener = fn;
}

/**
 * Store-level invalidation for commands. Unlike the renderer-cache listener
 * above (owned by MapViewport, unmounted in Art mode), these version bumps are
 * pure store concerns and must fire for every execute/undo/redo regardless of
 * which mode is active — e.g. undoing a set-chunk in Art mode must still bust
 * the chunk grid's thumbnail cache.
 *
 * Both clocks are bumped for set-palette-line and set-tileset-tiles as well as
 * set-chunk, because chunk thumbnails bake palette colors and tile pixels too:
 * in-place tile edits keep tiles.length constant but change pixels, and palette
 * edits change colors used by the baked thumbs. The difference is reach —
 * chunkLibraryVersion says "something changed", chunkVersions says WHICH chunks,
 * and only the second is fit to key a thumbnail on.
 */
function bumpStoreVersions(cmd: AnyCommand): void {
  if (cmd.type === 'batch') {
    for (const c of cmd.commands) bumpStoreVersions(c);
    return;
  }
  if (cmd.type === 'set-chunk'
      || cmd.type === 'set-palette-line'
      || cmd.type === 'set-tileset-tiles') {
    const editor = useEditorStore.getState();
    editor.bumpChunkLibraryVersion();
    // …and the sharp clock beside it: only the chunks this command can actually
    // reach. The grid keys each thumbnail's paint on its own revision, so the
    // library-wide bump above no longer implies a library-wide re-rasterize.
    editor.bumpChunkVersions(
      chunkIdsAffectedByCommand(cmd, useProjectStore.getState().project?.chunkLibrary ?? []),
    );
  }
  // A committed palette-line change (a slider commit, a copy-bridge write, or its
  // undo/redo) must repaint every paletteVersion subscriber — notably the sprite
  // canvas, which watches paletteVersion but not the history clock. The live slider
  // preview bumps paletteVersion itself; this covers the commit + undo/redo paths.
  if (cmd.type === 'set-palette-line') {
    useArtStore.getState().bumpPaletteVersion();
  }
}

/**
 * A command was applied or reverted: refresh everything that caches level data.
 * The aeon undo stacks call this themselves (history-factories wires it in), so
 * an undo repaints exactly like the edit that made it — see BoundEditHistory,
 * whose argument-free undo()/redo() cannot return the command to their caller.
 */
export function notifyCommandApplied(command: AnyCommand): void {
  bumpStoreVersions(command);
  invalidationListener?.(command);
}

/**
 * Execute a command against the current level, recording it on the FOCUSED
 * document's undo stack (focusedDocId) so the same Ctrl+Z that the user reaches
 * for reverts it.
 *
 * Commands are aeon's editing model, so the focused document must be an aeon
 * command history. Anything else is a wiring bug (a level command issued while a
 * sprite doc or tool tab owns the focus) and is loud rather than silent: a
 * swallowed command would edit the level with no way to undo it.
 */
export function executeCommand(command: AnyCommand, level: S4Level): void {
  const stack = focusedHistory();
  if (!(stack instanceof BoundEditHistory)) {
    throw new Error(
      `executeCommand: the focused document '${focusedDocId() ?? '(none)'}' is not an aeon command history`,
    );
  }
  stack.execute(command, level);   // notifies notifyCommandApplied
  useEditorStore.getState().markDirty();
}

// --- Ambient (non-focused) commands ----------------------------------------

/**
 * Commands whose data lives on the ZONE rather than the act. Derived from what
 * core/editing/history.ts actually mutates: these three are the only members of
 * AnyCommand that touch `level.palette` / `level.tileset` / `level.chunkLibrary`
 * (all zone-level fields of S4Level). Every other command writes
 * `level.sections[...]` or `level.act`, both act-scoped. Keep this in step with
 * applyCommand — a new zone-level command that isn't listed here would be
 * recorded on the act stack and lost when that act tab closes.
 */
const ZONE_SCOPED_COMMAND_TYPES = new Set<AnyCommand['type']>([
  'set-palette-line',
  'set-tileset-tiles',
  'set-chunk',
]);

/**
 * A batch is zone-scoped only when EVERY leaf is — one act-scoped child pins the
 * whole step to the act, because a step that half-lives on a stack the act tab's
 * close would discard is worse than one recorded a level too narrowly. No mixed
 * batch is constructed today (map-stamp builds act-scoped children, ComposerCanvas
 * zone-scoped ones); the rule exists so a future one can't silently split.
 */
export function isZoneScopedCommand(command: AnyCommand): boolean {
  if (command.type === 'batch') {
    return command.commands.length > 0 && command.commands.every(isZoneScopedCommand);
  }
  return ZONE_SCOPED_COMMAND_TYPES.has(command.type);
}

/**
 * The document a command's DATA belongs to, from the project store's current
 * zone/act (which tab activation keeps pointed at the last activated level tab).
 * Null when no act is current, i.e. there is no level to edit at all.
 */
export function commandDocId(command: AnyCommand): string | null {
  const { currentZoneId, currentActId } = useProjectStore.getState();
  if (!currentZoneId) return null;
  if (isZoneScopedCommand(command)) return zoneArtDocId(currentZoneId);
  return currentActId ? levelDocId(currentZoneId, currentActId) : null;
}

/**
 * Execute a command that does NOT originate from the focused surface, recording
 * it on the document its data belongs to (commandDocId).
 *
 * executeCommand routes by FOCUS, which is right for an editing surface — the
 * user's Ctrl+Z reaches back into the thing they were just looking at. It is
 * wrong for ambient callers, which edit the project irrespective of focus:
 *
 *  - the agent handler's edit tools, which run against whatever act is loaded
 *    while the active tab may be Home, a tool tab, or a sprite doc — none of
 *    which own a command history, so focus routing THREW (the MCP call failed);
 *  - PaletteEditor's zone-palette rows and "Copy to ▸ Zone line N" bridges,
 *    which write zone CRAM from inside the sprite pane (same throw).
 *
 * Scope routing also stops a zone-scoped edit made while the layout facet
 * happens to be focused from being recorded on the ACT stack, where closing
 * that act tab would discard a zone edit that outlives it.
 */
export function executeAmbientCommand(command: AnyCommand, level: S4Level): void {
  const docId = commandDocId(command);
  if (!docId) {
    throw new Error(
      `executeAmbientCommand: no current act — '${command.type}' has no document to record on`,
    );
  }
  const stack = documentHistoryHub.historyFor(docId);
  if (!(stack instanceof BoundEditHistory)) {
    throw new Error(
      `executeAmbientCommand: document '${docId}' is not an aeon command history`,
    );
  }
  stack.execute(command, level);   // notifies notifyCommandApplied
  useEditorStore.getState().markDirty();
}
