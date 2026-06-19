import { create } from 'zustand';
import type { PixelBuffer, MirrorMode, DitherPattern } from '../../core/art/pixel-ops';
import { createBuffer, flipH, flipV, rotate90 } from '../../core/art/pixel-ops';
import type { Color } from '../../core/model/s4-types';
import type { SpriteFormatId } from '../../core/formats/sprite-format-adapter';
import { SpriteHistory, type SpriteSnapshot } from '../../core/editing/sprite-history';
import type { SpritePaletteMode } from '../../core/art/sprite-palette';
import { blankStandalonePalette } from '../../core/art/sprite-palette';
import { useProjectStore, getCurrentZone } from './projectStore';

export type SpriteTool =
  | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select' | 'dither';

export type SpriteTransform = 'flip-h' | 'flip-v' | 'rotate-90';

/** A rectangular marquee selection in sprite-pixel coords. */
export interface SpriteSelection { x: number; y: number; w: number; h: number; }

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
  /** Object origin within the frame canvas (px). Preserved across load→export so
   *  non-centered sprites round-trip without shifting piece offsets. */
  originX: number;
  originY: number;

  // Brush/craft state (matches Art mode's tool model)
  mirror: MirrorMode | null;
  pixelPerfect: boolean;
  ditherPattern: DitherPattern;
  ditherSecondary: number;     // 0-15 (0 = transparent)
  selection: SpriteSelection | null;
  name: string;                // sprite name (export folder + anim label); follows loads
  setName: (name: string) => void;
  exportDplc: boolean;         // export as DPLC (streamed art) vs flat resident art
  setExportDplc: (v: boolean) => void;
  format: SpriteFormatId;      // game format to interpret on open / write on export
  setFormat: (f: SpriteFormatId) => void;

  setTool: (t: SpriteTool) => void;
  setZoom: (z: number) => void;
  setShowPieces: (v: boolean) => void;
  setMirror: (m: MirrorMode | null) => void;
  setPixelPerfect: (v: boolean) => void;
  setDither: (pattern: DitherPattern, secondary: number) => void;
  setSelection: (s: SpriteSelection | null) => void;
  applyTransform: (t: SpriteTransform) => void;
  setBuffer: (b: PixelBuffer) => void;   // replace the current frame
  addFrame: () => void;
  duplicateFrame: () => void;
  deleteFrame: () => void;
  selectFrame: (i: number) => void;

  // Undo/redo (snapshot-based). `historyTick` bumps on every history change so
  // the UI re-evaluates canUndo/canRedo.
  historyTick: number;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;

  // Animation (chunk 3)
  steps: AnimStepUI[];
  playbackMode: PlaybackMode;
  addStep: (frameIndex: number) => void;
  removeStep: (i: number) => void;
  setStepDuration: (i: number, duration: number) => void;
  setPlaybackMode: (m: PlaybackMode) => void;
  setSteps: (steps: AnimStepUI[]) => void;

  /** Named animations loaded from a character's script (empty for new/editor sprites). */
  characterAnims: { name: string; steps: AnimStepUI[] }[];
  setCharacterAnims: (anims: { name: string; steps: AnimStepUI[] }[]) => void;

  // Load (replace the whole working sprite)
  loadSprite: (frames: PixelBuffer[], steps: AnimStepUI[], originX: number, originY: number) => void;
  /** Start a fresh single-frame sprite of the given pixel dimensions. */
  newSprite: (w: number, h: number) => void;

  /** How the sprite is colored: bound to a zone CRAM line, or its own private palette. */
  paletteMode: SpritePaletteMode;
  zoneLine: number;
  standalonePalette: Color[];
  setPaletteMode: (m: SpritePaletteMode) => void;
  setZoneLine: (line: number) => void;
  setStandalonePalette: (colors: Color[]) => void;
  clearPalette: () => void;
  clearCanvas: () => void;
}

const DEFAULT_STEP_DURATION = 6;

export const DEFAULT_FRAME_SIZE = 32;

function blankFrame(): PixelBuffer {
  return createBuffer(DEFAULT_FRAME_SIZE, DEFAULT_FRAME_SIZE);
}

function cloneFrame(b: PixelBuffer): PixelBuffer {
  return { width: b.width, height: b.height, data: new Uint8Array(b.data) };
}

/** Module-level undo/redo history for the working sprite document. */
const history = new SpriteHistory();

/** Build a snapshot from live state. SpriteHistory deep-clones on record/undo/
 *  redo, so passing live refs is safe. */
const snap = (s: SpriteState): SpriteSnapshot => ({
  frames: s.frames,
  currentIndex: s.currentIndex,
  selection: s.selection,
  paletteMode: s.paletteMode,
  zoneLine: s.zoneLine,
  standalonePalette: s.standalonePalette,
});

export const useSpriteStore = create<SpriteState>((set, get) => ({
  tool: 'pencil',
  zoom: 10,
  frames: [blankFrame()],
  currentIndex: 0,
  showPieces: false,
  originX: DEFAULT_FRAME_SIZE / 2,
  originY: DEFAULT_FRAME_SIZE / 2,

  mirror: null,
  pixelPerfect: true,
  ditherPattern: 'checker',
  ditherSecondary: 0,
  selection: null,
  name: 'NewSprite',
  exportDplc: false,
  format: 's4',
  historyTick: 0,
  paletteMode: 'zone',
  zoneLine: 1,
  standalonePalette: blankStandalonePalette(),

  setName: (name) => set({ name }),
  setExportDplc: (exportDplc) => set({ exportDplc }),
  setFormat: (format) => set({ format }),
  setTool: (tool) => set((s) => ({ tool, selection: tool === 'select' ? s.selection : null })),
  setZoom: (zoom) => set({ zoom: Math.min(48, Math.max(1, Math.round(zoom))) }),
  setShowPieces: (showPieces) => set({ showPieces }),
  setMirror: (mirror) => set({ mirror }),
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
  setDither: (ditherPattern, ditherSecondary) => set({ ditherPattern, ditherSecondary }),
  setSelection: (selection) => set({ selection }),
  applyTransform: (t) => {
    const s = get();
    const cur = s.frames[s.currentIndex];
    const buf: PixelBuffer = { width: cur.width, height: cur.height, data: cur.data };
    let next: PixelBuffer;
    if (t === 'flip-h') next = flipH(buf);
    else if (t === 'flip-v') next = flipV(buf);
    else if (t === 'rotate-90') { if (cur.width !== cur.height) return; next = rotate90(buf); }
    else return;
    history.record(snap(s)); // only records when the transform actually applies
    const frames = s.frames.slice();
    frames[s.currentIndex] = next;
    // marquee coords no longer valid after a transform
    set({ frames, selection: null, historyTick: s.historyTick + 1 });
  },
  setBuffer: (b) => {
    const s = get();
    history.record(snap(s));
    const frames = s.frames.slice();
    frames[s.currentIndex] = b;
    set({ frames, historyTick: s.historyTick + 1 });
  },
  // New frame matches the current canvas size (loaded sprites may not be 32x32).
  addFrame: () => {
    const s = get();
    history.record(snap(s));
    const cur = s.frames[s.currentIndex];
    set({ frames: [...s.frames, createBuffer(cur.width, cur.height)], currentIndex: s.frames.length, historyTick: s.historyTick + 1 });
  },
  duplicateFrame: () => {
    const s = get();
    history.record(snap(s));
    const frames = [...s.frames, cloneFrame(s.frames[s.currentIndex])];
    set({ frames, currentIndex: frames.length - 1, historyTick: s.historyTick + 1 });
  },
  deleteFrame: () => {
    const s = get();
    if (s.frames.length <= 1) return; // keep at least one frame
    history.record(snap(s));
    const removed = s.currentIndex;
    const frames = s.frames.filter((_, i) => i !== removed);
    // Drop steps referencing the removed frame; shift higher references down.
    const steps = s.steps
      .filter((st) => st.frameIndex !== removed)
      .map((st) => (st.frameIndex > removed ? { ...st, frameIndex: st.frameIndex - 1 } : st));
    set({ frames, steps, currentIndex: Math.min(removed, frames.length - 1), historyTick: s.historyTick + 1 });
  },
  selectFrame: (i) => set((s) => ({ currentIndex: Math.min(Math.max(0, i), s.frames.length - 1) })),

  canUndo: () => history.canUndo,
  canRedo: () => history.canRedo,
  undo: () => {
    const s = get();
    const prev = history.undo(snap(s));
    if (prev) set({ frames: prev.frames, currentIndex: prev.currentIndex, selection: prev.selection, paletteMode: prev.paletteMode, zoneLine: prev.zoneLine, standalonePalette: prev.standalonePalette, historyTick: s.historyTick + 1 });
  },
  redo: () => {
    const s = get();
    const next = history.redo(snap(s));
    if (next) set({ frames: next.frames, currentIndex: next.currentIndex, selection: next.selection, paletteMode: next.paletteMode, zoneLine: next.zoneLine, standalonePalette: next.standalonePalette, historyTick: s.historyTick + 1 });
  },

  steps: [],
  playbackMode: 'forward',
  addStep: (frameIndex) => set((s) => ({ steps: [...s.steps, { frameIndex, duration: DEFAULT_STEP_DURATION }] })),
  removeStep: (i) => set((s) => ({ steps: s.steps.filter((_, idx) => idx !== i) })),
  setStepDuration: (i, duration) => set((s) => ({
    steps: s.steps.map((st, idx) => (idx === i ? { ...st, duration: Math.min(0x7f, Math.max(1, Math.round(duration) || 1)) } : st)),
  })),
  setPlaybackMode: (playbackMode) => set({ playbackMode }),
  setSteps: (steps) => set({ steps }),

  characterAnims: [],
  setCharacterAnims: (characterAnims) => set({ characterAnims }),

  newSprite: (w, h) => {
    history.clear(); // a fresh sprite starts with empty history
    set({
      frames: [createBuffer(Math.max(8, w | 0), Math.max(8, h | 0))],
      currentIndex: 0,
      steps: [],
      originX: Math.floor(Math.max(8, w | 0) / 2),
      originY: Math.floor(Math.max(8, h | 0) / 2),
      paletteMode: 'zone',
      zoneLine: 1,
      standalonePalette: blankStandalonePalette(),
      characterAnims: [],
      selection: null,
      name: 'NewSprite',
      exportDplc: false,
      format: 's4',
      historyTick: 0,
    });
  },

  loadSprite: (frames, steps, originX, originY) => {
    history.clear(); // a loaded sprite starts with empty history
    set({
      frames: frames.length ? frames : [blankFrame()],
      steps,
      currentIndex: 0,
      originX,
      originY,
      characterAnims: [],
      historyTick: 0,
    });
  },

  setZoneLine: (zoneLine) => set({ zoneLine: Math.max(0, Math.min(3, zoneLine | 0)) }),
  setStandalonePalette: (standalonePalette) => { const s = get(); history.record(snap(s)); set({ standalonePalette, historyTick: s.historyTick + 1 }); },
  setPaletteMode: (mode) => {
    const s = get(); history.record(snap(s));
    if (mode === 'standalone' && s.paletteMode === 'zone') {
      const zone = getCurrentZone(useProjectStore.getState());
      const line = zone?.palette.lines[s.zoneLine]?.colors;
      const seed = line ? line.map((c) => ({ ...c })) : blankStandalonePalette();
      set({ paletteMode: 'standalone', standalonePalette: seed, historyTick: s.historyTick + 1 });
    } else {
      set({ paletteMode: mode, historyTick: s.historyTick + 1 });
    }
  },
  clearPalette: () => { const s = get(); history.record(snap(s)); set({ paletteMode: 'standalone', standalonePalette: blankStandalonePalette(), historyTick: s.historyTick + 1 }); },
  clearCanvas: () => { const s = get(); history.record(snap(s)); const cur = s.frames[s.currentIndex]; const frames = s.frames.slice(); frames[s.currentIndex] = createBuffer(cur.width, cur.height); set({ frames, historyTick: s.historyTick + 1 }); },
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
