import { create } from 'zustand';
import type { PixelBuffer } from '../../core/art/pixel-ops';
import { createBuffer } from '../../core/art/pixel-ops';

export type SpriteTool = 'pencil' | 'fill' | 'eraser';

export type PlaybackMode = 'forward' | 'reverse' | 'pingpong';

/** One animation step: a reference to a frame + how long it holds (in 1/60s ticks). */
export interface AnimStepUI {
  frameIndex: number;
  duration: number; // 1/60s ticks
}

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

  // Animation (chunk 3)
  steps: AnimStepUI[];
  playbackMode: PlaybackMode;
  addStep: (frameIndex: number) => void;
  removeStep: (i: number) => void;
  setStepDuration: (i: number, duration: number) => void;
  setPlaybackMode: (m: PlaybackMode) => void;
}

const DEFAULT_STEP_DURATION = 6;

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
    const removed = s.currentIndex;
    const frames = s.frames.filter((_, i) => i !== removed);
    // Drop steps referencing the removed frame; shift higher references down.
    const steps = s.steps
      .filter((st) => st.frameIndex !== removed)
      .map((st) => (st.frameIndex > removed ? { ...st, frameIndex: st.frameIndex - 1 } : st));
    return { frames, steps, currentIndex: Math.min(removed, frames.length - 1) };
  }),
  selectFrame: (i) => set((s) => ({ currentIndex: Math.min(Math.max(0, i), s.frames.length - 1) })),

  steps: [],
  playbackMode: 'forward',
  addStep: (frameIndex) => set((s) => ({ steps: [...s.steps, { frameIndex, duration: DEFAULT_STEP_DURATION }] })),
  removeStep: (i) => set((s) => ({ steps: s.steps.filter((_, idx) => idx !== i) })),
  setStepDuration: (i, duration) => set((s) => ({
    steps: s.steps.map((st, idx) => (idx === i ? { ...st, duration: Math.min(0x7f, Math.max(1, Math.round(duration) || 1)) } : st)),
  })),
  setPlaybackMode: (playbackMode) => set({ playbackMode }),
}));

/** Build the frame-index play order for a playback mode (one full cycle). */
export function buildPlayOrder(stepCount: number, mode: PlaybackMode): number[] {
  if (stepCount <= 1) return stepCount === 1 ? [0] : [];
  const fwd = Array.from({ length: stepCount }, (_, i) => i);
  if (mode === 'forward') return fwd;
  if (mode === 'reverse') return fwd.slice().reverse();
  // pingpong: 0..n-1, then n-2..1 (endpoints not repeated)
  return fwd.concat(fwd.slice(1, -1).reverse());
}
