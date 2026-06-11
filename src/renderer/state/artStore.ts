import { create } from 'zustand';
import type { ComposerDoc } from '../../core/art/composer-buffer';
import type { DitherPattern, MirrorMode } from '../../core/art/pixel-ops';

export type ArtTool =
  | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select'
  | 'dither' | 'tile-stamp' | 'collision';

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
  repeatPreview: boolean;
  zoom: number;                 // pixels per art pixel
  open: OpenDocument | null;
  docVersion: number;           // bump to re-render the canvas
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
  toggleRepeatPreview: () => void;
  setZoom: (z: number) => void;
  openDocument: (d: OpenDocument) => void;
  closeDocument: () => void;
  bumpDoc: () => void;
  /** Mark the open document as having unsaved local edits. */
  markOpenDirty: () => void;
  requestAction: (a: string) => void;
  clearAction: () => void;
  setBrushTile: (t: number) => void;
}

export const useArtStore = create<ArtState>((set) => ({
  tool: 'pencil', brushSpace: 'pixel', selectedColor: 1, paletteLine: 1,
  ditherPattern: 'checker', ditherSecondary: 0,
  mirror: null, repeatPreview: false, zoom: 24, open: null, docVersion: 0,
  pendingAction: null, brushTile: 0,

  setTool: (tool) => set({ tool }),
  setBrushSpace: (brushSpace) => set({ brushSpace }),
  setSelectedColor: (selectedColor) => set({ selectedColor }),
  setPaletteLine: (paletteLine) => set({ paletteLine }),
  setDither: (ditherPattern, ditherSecondary) => set({ ditherPattern, ditherSecondary }),
  setMirror: (mirror) => set({ mirror }),
  toggleRepeatPreview: () => set((s) => ({ repeatPreview: !s.repeatPreview })),
  setZoom: (zoom) => set({ zoom: Math.max(2, Math.min(64, zoom)) }),
  openDocument: (open) => set({ open, docVersion: 0 }),
  closeDocument: () => set({ open: null }),
  bumpDoc: () => set((s) => ({ docVersion: s.docVersion + 1 })),
  markOpenDirty: () => set((s) =>
    s.open && !s.open.dirty ? { open: { ...s.open, dirty: true } } : {}),
  requestAction: (pendingAction) => set({ pendingAction }),
  clearAction: () => set({ pendingAction: null }),
  setBrushTile: (brushTile) => set({ brushTile }),
}));
