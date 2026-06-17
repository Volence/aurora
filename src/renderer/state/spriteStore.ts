import { create } from 'zustand';
import type { PixelBuffer } from '../../core/art/pixel-ops';
import { createBuffer } from '../../core/art/pixel-ops';

export type SpriteTool = 'pencil' | 'fill' | 'eraser';

/**
 * Sprite-mode editing state (chunk 1: a single fixed-size frame buffer).
 * Paint color + palette line are SHARED with Art mode via artStore
 * (so the existing PaletteEditor doubles as the sprite color picker).
 * Frame management, decomposition, animation, and export land in later chunks.
 */
interface SpriteState {
  tool: SpriteTool;
  zoom: number;            // device px per sprite pixel
  buffer: PixelBuffer;     // current frame's 4bpp indices
  setTool: (t: SpriteTool) => void;
  setZoom: (z: number) => void;
  setBuffer: (b: PixelBuffer) => void;
}

export const DEFAULT_FRAME_SIZE = 32;

export const useSpriteStore = create<SpriteState>((set) => ({
  tool: 'pencil',
  zoom: 10,
  buffer: createBuffer(DEFAULT_FRAME_SIZE, DEFAULT_FRAME_SIZE),
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom: Math.min(24, Math.max(2, zoom)) }),
  setBuffer: (buffer) => set({ buffer }),
}));
