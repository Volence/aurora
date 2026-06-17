import { create } from 'zustand';
import type { PixelBuffer } from '../../core/art/pixel-ops';
import { createBuffer } from '../../core/art/pixel-ops';

export type SpriteTool = 'pencil' | 'fill' | 'eraser';

/**
 * Sprite-mode editing state (chunk 2: multiple frames + decomposition overlay).
 * Paint color + palette line are SHARED with Art mode via artStore (so the
 * existing PaletteEditor doubles as the sprite color picker). Animation and
 * export land in later chunks.
 */
interface SpriteState {
  tool: SpriteTool;
  zoom: number;            // device px per sprite pixel
  frames: PixelBuffer[];   // each frame's 4bpp indices
  currentIndex: number;
  showPieces: boolean;     // overlay auto-decomposition piece outlines

  setTool: (t: SpriteTool) => void;
  setZoom: (z: number) => void;
  setShowPieces: (v: boolean) => void;
  setBuffer: (b: PixelBuffer) => void;   // replace the current frame
  addFrame: () => void;
  duplicateFrame: () => void;
  deleteFrame: () => void;
  selectFrame: (i: number) => void;
}

export const DEFAULT_FRAME_SIZE = 32;

function blankFrame(): PixelBuffer {
  return createBuffer(DEFAULT_FRAME_SIZE, DEFAULT_FRAME_SIZE);
}

function cloneFrame(b: PixelBuffer): PixelBuffer {
  return { width: b.width, height: b.height, data: new Uint8Array(b.data) };
}

export const useSpriteStore = create<SpriteState>((set) => ({
  tool: 'pencil',
  zoom: 10,
  frames: [blankFrame()],
  currentIndex: 0,
  showPieces: false,

  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom: Math.min(24, Math.max(2, zoom)) }),
  setShowPieces: (showPieces) => set({ showPieces }),
  setBuffer: (b) => set((s) => {
    const frames = s.frames.slice();
    frames[s.currentIndex] = b;
    return { frames };
  }),
  addFrame: () => set((s) => ({ frames: [...s.frames, blankFrame()], currentIndex: s.frames.length })),
  duplicateFrame: () => set((s) => {
    const frames = [...s.frames, cloneFrame(s.frames[s.currentIndex])];
    return { frames, currentIndex: frames.length - 1 };
  }),
  deleteFrame: () => set((s) => {
    if (s.frames.length <= 1) return s; // keep at least one frame
    const frames = s.frames.filter((_, i) => i !== s.currentIndex);
    return { frames, currentIndex: Math.min(s.currentIndex, frames.length - 1) };
  }),
  selectFrame: (i) => set((s) => ({ currentIndex: Math.min(Math.max(0, i), s.frames.length - 1) })),
}));
