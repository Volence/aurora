import { create } from 'zustand';
import type { ComposerDoc } from '../../core/art/composer-buffer';
import type { DitherPattern, MirrorMode } from '../../core/art/pixel-ops';
import { DEFAULT_BRUSH_ATTRIBUTES, type BrushPriority } from '../../core/editing/brush-word';
import { documentHistoryHub } from './history-hub';
import { composerDocId } from '../shell/tabs';
import { surfacePriorityLens } from './priority-lens-surface';

/** An art surface whose zoom is remembered separately. See ART_TIER_DEFAULT_ZOOM. */
export type ArtZoomTier = 'composer' | 'tile' | 'block' | 'chunk';

export type ArtTool =
  | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select'
  | 'dither' | 'tile-stamp' | 'collision' | 'palette-apply';

export type BrushSpace = 'pixel' | 'tile';

/**
 * A pixel document that edits BAND ART in the BG override document
 * (`editor_bg_override.json`) rather than the zone tileset: one static tile
 * slot, or one phase bank of one band. Every write commits through
 * `set-bg-override-tiles` / `set-bg-override-phases` (parcel I), so the
 * prefix identity the injector checks holds after every stroke and undo.
 */
export type BgArtTarget =
  | { kind: 'tile'; tileIndex: number }
  | { kind: 'bank'; bandIndex: number; bank: number };

export interface OpenDocument {
  doc: ComposerDoc;
  /** atlas tile index when editing an existing tile in place; null otherwise */
  liveTileIndex: number | null;
  /** Set when the document edits the BG override's art (see BgArtTarget). */
  bgOverride?: BgArtTarget | null;
  /** chunk id when editing an existing chunk; null otherwise */
  chunkId: string | null;
  name: string;
  dirty: boolean;
}

interface ArtState {
  tool: ArtTool;
  brushSpace: BrushSpace;
  selectedColor: number;        // 0-15
  paletteLine: number;          // 1-3 for painting
  ditherPattern: DitherPattern;
  ditherSecondary: number;
  mirror: MirrorMode | null;
  pixelPerfect: boolean;
  repeatPreview: boolean;
  /** Which art surface is on screen — the tier `zoom` applies to. Written by
   *  whoever mounts a surface (ClassicComposerDock from its tab, aeon's
   *  ComposerCanvas on mount), so there is exactly one writer per project kind. */
  artTier: ArtZoomTier;
  /** Pixels per art pixel, PER TIER. See ART_TIER_DEFAULT_ZOOM. */
  zoomByTier: Record<ArtZoomTier, number>;
  open: OpenDocument | null;
  /**
   * The undo document id of the open composer document, or null when the open
   * document is not one that may own a stack (`isPureDocLocal`).
   *
   * NOT part of `OpenDocument`: every opener in the app builds one of those by
   * hand, and a field they each had to remember to fill would be null at
   * whichever site was written next. `openDocument` derives it, which is also
   * where the previous document's stack is disposed, so the two can never
   * disagree about which stack is live.
   */
  composerDocId: string | null;
  docVersion: number;           // bump to re-render the canvas
  /** Incremented on every live palette preview tick (slider drag). Separate
   *  from the history clock (hooks/useHistoryVersion) so per-tick repaint of the
   *  composer/swatches does NOT trigger the expensive cache rebuilds
   *  (TilesetPanel, ChunkLibrary thumbnails) that are keyed on that clock. */
  paletteVersion: number;
  /** One-shot transform request (e.g. 'flip-h') consumed by ComposerCanvas. */
  pendingAction: string | null;
  /** Atlas tile index used by the tile-stamp brush. */
  brushTile: number;
  /**
   * What the tile-stamp does to the destination cell's VDP priority bit.
   *
   * THE COMPOSER IS A NAMETABLE EDITOR, which is the whole reason this field
   * exists (ROADMAP O17). A `ComposerCell` carries `pal`, `hf`, `vf` and `pri`,
   * and `sliceForSave` packs all four into the chunk's nametable word — so
   * priority is not a stranger to this surface, it was the one nametable field
   * with no control. The stamp could therefore only ever say `keep`, hard-coded
   * at the call site, and an author who captured a chunk out of a priority
   * region had no way to add depth to it or take depth away.
   *
   * SEPARATE FROM THE MAP BRUSH's `editorStore.selectedTilePriority`, and
   * deliberately: they are different brushes on different facets with different
   * tiles and different flips, and arming one from the other would be a spooky
   * action the author never asked for. What they SHARE is the rule — both go
   * through `surfacePriorityLens`, so neither can author the bit while it is
   * invisible. See core/editing/brush-word.ts for why `keep` is the default.
   */
  stampPriority: BrushPriority;

  setTool: (t: ArtTool) => void;
  setBrushSpace: (b: BrushSpace) => void;
  setSelectedColor: (c: number) => void;
  setPaletteLine: (l: number) => void;
  setDither: (p: DitherPattern, secondary: number) => void;
  setMirror: (m: MirrorMode | null) => void;
  setPixelPerfect: (v: boolean) => void;
  toggleRepeatPreview: () => void;
  setArtTier: (t: ArtZoomTier) => void;
  setZoom: (z: number) => void;
  openDocument: (d: OpenDocument) => void;
  closeDocument: () => void;
  bumpDoc: () => void;
  bumpPaletteVersion: () => void;
  /** Mark the open document as having unsaved local edits. */
  markOpenDirty: () => void;
  /**
   * Put the open document's dirty flag back where a restored undo snapshot says
   * it was. UNDO ONLY — `state/composer-history.ts` is the sole caller, and it
   * passes a value it read off the document itself rather than computing one.
   *
   * This is the composer's half of the save contract's R5: undoing back to the
   * state a document was opened (or last saved) in leaves nothing unsaved, so
   * the discard dialog must stop asking. It is a SETTER and not a `markClean`
   * because a map capture opens dirty on purpose, and unwinding to ITS start
   * state must leave it dirty.
   */
  setOpenDirty: (dirty: boolean) => void;
  requestAction: (a: string) => void;
  clearAction: () => void;
  setBrushTile: (t: number) => void;
  /** Arm the stamp's priority. Leaving `keep` SURFACES THE PRIORITY LENS, for
   *  the reason state/priority-lens-surface.ts gives in full. */
  setStampPriority: (p: BrushPriority) => void;
}

/**
 * The art surfaces that keep their own zoom, and the zoom that suits each.
 *
 * ONE SHARED NUMBER CANNOT SERVE THEM, and shipping one was a real defect: 24x
 * is right for an 8x8 tile (192px on screen) and absurd for a 256x256 chunk,
 * which it opened at 6144x6144 — about 151 MB of canvas backing store — before
 * the artist touched anything. Reported from use as "way too zoomed".
 *
 * The numbers are chosen so each surface opens at roughly 200-800px: tile
 * 8x24=192, block 16x12=192, chunk 256x3=768. Aeon's composer is variable-size,
 * so 8 is a middling starting point rather than a fitted one.
 */
export const ART_TIER_DEFAULT_ZOOM: Record<ArtZoomTier, number> = {
  composer: 8, tile: 24, block: 12, chunk: 3,
};

/** The active tier's zoom — what every surface and the option bar should read. */
export const selectArtZoom = (s: ArtState): number => s.zoomByTier[s.artTier];

/**
 * May this document own an undo stack of its own? True only for a PURE
 * DOC-LOCAL document: one where every write lands in `open.doc` and nowhere
 * else, which is New Tile / New Block / New Chunk and the map's "Edit block…"
 * and marquee captures.
 *
 * THE THREE EXCLUSIONS ARE NOT SYMMETRIC and each is already undoable somewhere
 * else, which is why excluding them costs nothing:
 *   • `liveTileIndex` — every stroke is a `set-tileset-tiles` command on the
 *     ZONE-ART stack.
 *   • `bgOverride`    — every stroke is a BG-override command on the ACT stack
 *     (see the branch in `editorStore.focusedDocId`).
 *   • `chunkId`       — MIXED, and that is the whole reason it is excluded
 *     rather than the reason it is not needed: a pencil stroke on an
 *     atlas-backed cell records on the zone-art stack while empty cells and
 *     every paste/move/transform are doc-local. See
 *     `core/editing/composer-history.ts`'s header for why a second stack on the
 *     same document is worse than none.
 *
 * Exported so a test reads THIS predicate rather than a copy of it.
 */
export function isPureDocLocal(open: OpenDocument | null): boolean {
  return open !== null
    && open.liveTileIndex === null
    && !open.bgOverride
    && open.chunkId === null;
}

/** Serial for `composerDocId`. Monotone for the life of the window: a reused id
 *  would hand a fresh document the stack of a dead one. */
let composerSerial = 0;

function dropComposerStack(docId: string | null): void {
  if (docId !== null) documentHistoryHub.dispose(docId);
}

export const useArtStore = create<ArtState>((set, get) => ({
  tool: 'pencil', brushSpace: 'pixel', selectedColor: 1, paletteLine: 1,
  ditherPattern: 'checker', ditherSecondary: 0,
  mirror: null, pixelPerfect: false, repeatPreview: false, open: null, docVersion: 0,
  composerDocId: null,
  artTier: 'tile', zoomByTier: { ...ART_TIER_DEFAULT_ZOOM },
  paletteVersion: 0,
  pendingAction: null, brushTile: 0,
  stampPriority: DEFAULT_BRUSH_ATTRIBUTES.priority,

  // Selecting a tool implies its brush space (tile-stamp/collision/palette-apply
  // are tile-space, everything else paints pixels) so the px/tile tab always
  // reflects reality.
  setTool: (tool) => set({ tool, brushSpace: (tool === 'tile-stamp' || tool === 'collision' || tool === 'palette-apply') ? 'tile' : 'pixel' }),
  setBrushSpace: (brushSpace) => set({ brushSpace }),
  setSelectedColor: (selectedColor) => set({ selectedColor }),
  setPaletteLine: (paletteLine) => set({ paletteLine }),
  setDither: (ditherPattern, ditherSecondary) => set({ ditherPattern, ditherSecondary }),
  setMirror: (mirror) => set({ mirror }),
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
  toggleRepeatPreview: () => set((s) => ({ repeatPreview: !s.repeatPreview })),
  setArtTier: (artTier) => set({ artTier }),
  // Writes the ACTIVE tier. The signature is unchanged so every call site — the
  // option bar's ZoomControl, the shared wheel-zoom hook — keeps working without
  // knowing tiers exist.
  setZoom: (zoom) => set((s) => ({
    zoomByTier: { ...s.zoomByTier, [s.artTier]: Math.max(2, Math.min(64, zoom)) },
  })),
  // THE COMPOSER STACK'S WHOLE LIFETIME IS THESE TWO LINES, and it is the sprite
  // and canvas documents' lifetime: minted on open, dropped on close. Disposing
  // BEFORE minting matters — a save re-opens the same drawing as a CHUNK
  // document (`state/art-composer-save.ts`), which is not stack-owning, so
  // without the dispose that document's pre-save stack would sit in the hub
  // holding a few hundred KB per entry for the rest of the session with nothing
  // able to reach it. Project close reaches here too: `project-runtime` calls
  // `closeDocument()`, and `hub.clearAll()` covers the same id idempotently.
  openDocument: (open) => {
    dropComposerStack(get().composerDocId);
    set({ open, docVersion: 0, composerDocId: isPureDocLocal(open) ? composerDocId(++composerSerial) : null });
  },
  closeDocument: () => {
    dropComposerStack(get().composerDocId);
    set({ open: null, composerDocId: null });
  },
  bumpDoc: () => set((s) => ({ docVersion: s.docVersion + 1 })),
  bumpPaletteVersion: () => set((s) => ({ paletteVersion: s.paletteVersion + 1 })),
  markOpenDirty: () => set((s) =>
    s.open && !s.open.dirty ? { open: { ...s.open, dirty: true } } : {}),
  setOpenDirty: (dirty) => set((s) =>
    s.open && s.open.dirty !== dirty ? { open: { ...s.open, dirty } } : {}),
  requestAction: (pendingAction) => set({ pendingAction }),
  clearAction: () => set({ pendingAction: null }),
  setBrushTile: (brushTile) => set({ brushTile }),
  setStampPriority: (stampPriority) => {
    set({ stampPriority });
    surfacePriorityLens(stampPriority);
  },
}));
