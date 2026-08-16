import { create } from 'zustand';
import type { ComposerDoc } from '../../core/art/composer-buffer';
import type { DitherPattern, MirrorMode } from '../../core/art/pixel-ops';

/** An art surface whose zoom is remembered separately. See ART_TIER_DEFAULT_ZOOM. */
export type ArtZoomTier = 'composer' | 'tile' | 'block' | 'chunk';

export type ArtTool =
  | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select'
  | 'dither' | 'tile-stamp' | 'collision' | 'palette-apply';

export type BrushSpace = 'pixel' | 'tile';

export interface OpenDocument {
  doc: ComposerDoc;
  /** atlas tile index when editing an existing tile in place; null otherwise */
  liveTileIndex: number | null;
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
  requestAction: (a: string) => void;
  clearAction: () => void;
  setBrushTile: (t: number) => void;
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

export const useArtStore = create<ArtState>((set) => ({
  tool: 'pencil', brushSpace: 'pixel', selectedColor: 1, paletteLine: 1,
  ditherPattern: 'checker', ditherSecondary: 0,
  mirror: null, pixelPerfect: false, repeatPreview: false, open: null, docVersion: 0,
  artTier: 'tile', zoomByTier: { ...ART_TIER_DEFAULT_ZOOM },
  paletteVersion: 0,
  pendingAction: null, brushTile: 0,

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
  openDocument: (open) => set({ open, docVersion: 0 }),
  closeDocument: () => set({ open: null }),
  bumpDoc: () => set((s) => ({ docVersion: s.docVersion + 1 })),
  bumpPaletteVersion: () => set((s) => ({ paletteVersion: s.paletteVersion + 1 })),
  markOpenDirty: () => set((s) =>
    s.open && !s.open.dirty ? { open: { ...s.open, dirty: true } } : {}),
  requestAction: (pendingAction) => set({ pendingAction }),
  clearAction: () => set({ pendingAction: null }),
  setBrushTile: (brushTile) => set({ brushTile }),
}));
