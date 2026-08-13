import { create } from 'zustand';
import type { PixelBuffer, MirrorMode, DitherPattern } from '../../core/art/pixel-ops';
import { createBuffer, flipH, flipV, rotate90 } from '../../core/art/pixel-ops';
import type { Color } from '../../core/model/s4-types';
import type { SpriteFormatId } from '../../core/formats/sprite-format-adapter';
import type { Tile } from '../../core/model/s4-types';
import type { SpriteFrame } from '../../core/model/sprite-types';
import { SpriteDocHistory, type SpriteSnapshot } from '../../core/editing/sprite-history';
import { documentHistoryHub } from './history-hub';
import type { SpritePaletteMode } from '../../core/art/sprite-palette';
import { blankStandalonePalette } from '../../core/art/sprite-palette';
import { copyRegion, clearRegion, pasteRegion, type ClipRegion } from '../../core/art/pixel-clipboard';
import { diffWrites } from '../../core/art/pixel-edit-controller';
import { useProjectStore, getCurrentZone } from './projectStore';

export type SpriteTool =
  | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select' | 'dither';

export type SpriteTransform = 'flip-h' | 'flip-v' | 'rotate-90';

/** A rectangular marquee selection in sprite-pixel coords. */
export interface SpriteSelection { x: number; y: number; w: number; h: number; }

export type PlaybackMode = 'forward' | 'reverse' | 'pingpong';

/**
 * Provenance for an in-place ART save-back (Task 15): the source Nemesis `.nem`
 * file plus the read-time data the writer needs to invert the render. Set ONLY
 * when an S1 (non-DPLC, Nemesis) object sprite was opened from disk; null for
 * new/editor/other-format sprites (no in-place save target). The mappings are
 * READ-ONLY — only art pixels save back. `expectedMtimeMs` is the guarded-write
 * conflict baseline, refreshed after each successful save. */
export interface S1ArtSource {
  basePath: string;              // absolute parent dir of the .nem (guarded-write root)
  relPath: string;               // .nem filename (rel-path-safe under basePath)
  expectedMtimeMs: number | null;
  originalTiles: Tile[];         // decoded pool at open (invariant across edits)
  mappings: SpriteFrame[];       // read-only mappings that drive the inverse render
  originX: number;
  originY: number;
  /** Frame count at open (== mappings.length). Save refuses if the editor's
   *  frame count has since changed — index-paired frames→mappings would otherwise
   *  write pixels into the wrong tiles (add/delete/reorder is not S1-writable). */
  frameCount: number;
}

/** One animation step: a reference to a frame + how long it holds (in 1/60s ticks). */
export interface AnimStepUI {
  frameIndex: number;
  duration: number; // 1/60s ticks
}

/**
 * ONE sprite document. Everything here belongs to a particular sprite: its
 * pixels, its timeline, its palette binding, its save-back target and its
 * dirtiness. Tool/view state (tool, zoom, brush settings, clipboard) is NOT here
 * — it belongs to the editor, which shows one document at a time.
 *
 * More than the six fields undo restores (SpriteSnapshot) live here: `name`,
 * `originX/Y`, `exportDplc`, `format` and `characterAnims` all follow a load and
 * are written by export, so they are part of a document's identity. Leaving them
 * out of the per-document slice would let one sprite's name/origin/format leak
 * onto another the moment the editor switched documents.
 */
export interface SpriteDoc {
  frames: PixelBuffer[];   // each frame's 4bpp indices
  currentIndex: number;
  selection: SpriteSelection | null;
  paletteMode: SpritePaletteMode;
  zoneLine: number;
  standalonePalette: Color[];
  steps: AnimStepUI[];
  /** In-place art save-back target (S1 objects only); null when there is none. */
  s1ArtSource: S1ArtSource | null;
  /** TRUE only when this document has edits not yet persisted — the single
   *  signal for the tab dot, the sprite-switch discard guard, and the
   *  project-open guard. Distinct from `s1ArtSource`: a checkout target is merely
   *  where a save WOULD write, not itself unsaved work, so opening an unedited
   *  checkout must NOT read as dirty. Set true by recordEdit (the one pixel/
   *  palette choke point) and by timeline-only edits (steps live outside the
   *  snapshot history); reset false by loadSprite/newSprite and by a successful
   *  save/export. Undoing back to a pristine state still reads dirty — it fails
   *  safe (over-asks rather than risk a silent discard). */
  unsavedEdits: boolean;
  name: string;                // sprite name (export folder + anim label); follows loads
  /** Object origin within the frame canvas (px). Preserved across load→export so
   *  non-centered sprites round-trip without shifting piece offsets. */
  originX: number;
  originY: number;
  exportDplc: boolean;         // export as DPLC (streamed art) vs flat resident art
  format: SpriteFormatId;      // game format to interpret on open / write on export
  /** Named animations loaded from a character's script (empty for new/editor sprites). */
  characterAnims: { name: string; steps: AnimStepUI[] }[];
}

/**
 * Sprite-mode editing state (chunk 2: multiple frames + decomposition overlay).
 * Paint color + palette line are SHARED with Art mode via artStore (so the
 * existing PaletteEditor doubles as the sprite color picker).
 *
 * MULTI-DOCUMENT (spec §4.4): several sprite-doc tabs can be open at once, each
 * with its own pixels and its own undo stack on the DocumentHistoryHub. The
 * ACTIVE document is checked OUT of `docs` and hoisted onto the store root, so
 * `docs` holds only the PARKED (background) documents — every document's state
 * therefore has exactly one home at any moment and the two can't drift apart.
 * Hoisting the checked-out document is what lets the whole sprite view layer and
 * the loaders in export-sprite.ts keep reading `frames`/`name`/… directly: there
 * is only ever one visible sprite editor, and the root IS that editor.
 */
interface SpriteState extends SpriteDoc {
  /** Parked background documents, keyed by doc id. Excludes the active one. */
  docs: Map<string, SpriteDoc>;
  /** The document checked out onto the root. Never null — see UNTITLED_SPRITE_DOC_ID. */
  activeDocId: string;

  // --- Editor (view) state: one sprite editor, so these stay global ---
  tool: SpriteTool;
  zoom: number;            // device px per sprite pixel
  showPieces: boolean;     // overlay auto-decomposition piece outlines

  // Brush/craft state (matches Art mode's tool model)
  mirror: MirrorMode | null;
  pixelPerfect: boolean;
  ditherPattern: DitherPattern;
  ditherSecondary: number;     // 0-15 (0 = transparent)
  clipboard: ClipRegion | null;
  /** Each returns true if the action was applicable (had a selection / clipboard),
   *  so the keyboard handler only swallows the native shortcut when it acted. */
  copySelection: () => boolean;
  cutSelection: () => boolean;
  paste: () => boolean;
  setName: (name: string) => void;
  setExportDplc: (v: boolean) => void;
  setFormat: (f: SpriteFormatId) => void;
  setS1ArtSource: (src: S1ArtSource | null) => void;
  setUnsavedEdits: (v: boolean) => void;

  /** The checked-out document's frames (the plan's `activeFrames()` selector). */
  activeFrames: () => PixelBuffer[];
  /** Is this document open (checked out or parked)? */
  isOpen: (docId: string) => boolean;
  /** Per-document dirtiness — background documents keep their own flag. */
  isDirty: (docId: string) => boolean;
  /** Drop every document and its undo stack (project close / test reset). */
  closeAll: () => void;

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

  // Undo/redo belong to the active document's stack on the hub — the store has no
  // undo()/redo() of its own, and no repaint clock either: the UI re-evaluates
  // canUndo/canRedo through hooks/useHistoryVersion, which the hub drives.

  // Animation (chunk 3)
  playbackMode: PlaybackMode;
  addStep: (frameIndex: number) => void;
  removeStep: (i: number) => void;
  setStepDuration: (i: number, duration: number) => void;
  setPlaybackMode: (m: PlaybackMode) => void;
  setSteps: (steps: AnimStepUI[]) => void;

  setCharacterAnims: (anims: { name: string; steps: AnimStepUI[] }[]) => void;

  // Load (replace the whole working sprite)
  loadSprite: (frames: PixelBuffer[], steps: AnimStepUI[], originX: number, originY: number) => void;
  /** Start a fresh single-frame sprite of the given pixel dimensions. */
  newSprite: (w: number, h: number) => void;

  // How the sprite is colored (paletteMode / zoneLine / standalonePalette) is
  // per-document; only the setters live here.
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

/**
 * The document the editor works on before any sprite-doc tab has claimed it —
 * "New sprite" from a bare editor, and every path that loads a sprite without
 * going through a tab. Giving it a real doc id (rather than allowing a null
 * active document) keeps ONE code path: every edit always has a document and
 * therefore an undo stack. It deliberately does not parse as a sprite-doc TAB id
 * (parseSpriteDocTabId requires an s1/aeon engine), so it can never collide with
 * one; it retires when tab activation opens a document for every sprite shown.
 */
export const UNTITLED_SPRITE_DOC_ID = 'doc:sprite:untitled';

/** A pristine document of the given pixel size. */
function blankDoc(w: number, h: number): SpriteDoc {
  const width = Math.max(8, w | 0);
  const height = Math.max(8, h | 0);
  return {
    frames: [createBuffer(width, height)],
    currentIndex: 0,
    selection: null,
    paletteMode: 'zone',
    zoneLine: 1,
    standalonePalette: blankStandalonePalette(),
    steps: [],
    s1ArtSource: null,
    unsavedEdits: false,
    name: 'NewSprite',
    originX: Math.floor(width / 2),
    originY: Math.floor(height / 2),
    exportDplc: false,
    format: 's4',
    characterAnims: [],
  };
}

/** Lift the checked-out document off the store root so it can be parked. Written
 *  out field by field on purpose: the compiler then rejects any SpriteDoc field
 *  that a future change forgets to carry across a document switch. */
function parkedDoc(s: SpriteState): SpriteDoc {
  return {
    frames: s.frames,
    currentIndex: s.currentIndex,
    selection: s.selection,
    paletteMode: s.paletteMode,
    zoneLine: s.zoneLine,
    standalonePalette: s.standalonePalette,
    steps: s.steps,
    s1ArtSource: s.s1ArtSource,
    unsavedEdits: s.unsavedEdits,
    name: s.name,
    originX: s.originX,
    originY: s.originY,
    exportDplc: s.exportDplc,
    format: s.format,
    characterAnims: s.characterAnims,
  };
}

/** The active document's undo stack. Exported so sprite-mode undo and the
 *  editor-reset path can reach it without knowing the hub's keying. */
export function activeSpriteHistory(): SpriteDocHistory {
  return documentHistoryHub.historyFor(useSpriteStore.getState().activeDocId) as SpriteDocHistory;
}

/** Record a pre-edit snapshot on the ACTIVE document's stack. Every mutating
 *  action funnels through here, which is also why this is where `unsavedEdits`
 *  flips true — the non-mutating ones (selectFrame, setTool, zoom, …)
 *  deliberately do not. No sibling-redo invalidation any more: per-document
 *  stacks have no siblings to invalidate. */
function recordEdit(s: SpriteState): void {
  activeSpriteHistory().record(snap(s));
  useSpriteStore.setState({ unsavedEdits: true });
}

/** Build a snapshot from live state. SpriteDocHistory deep-clones on record/undo/
 *  redo, so passing live refs is safe. */
const snap = (s: SpriteDoc): SpriteSnapshot => ({
  frames: s.frames,
  currentIndex: s.currentIndex,
  selection: s.selection,
  paletteMode: s.paletteMode,
  zoneLine: s.zoneLine,
  standalonePalette: s.standalonePalette,
});

// --- Document lifecycle ----------------------------------------------------
//
// Each open sprite document owns an undo stack on the DocumentHistoryHub, keyed
// by the same doc id. Switching documents parks the outgoing one whole; nothing
// is discarded and no history is cleared, which is what stops two open sprite
// tabs from stomping each other.

/** Open a new, blank document and check it out. Re-opening an already-open
 *  document just checks it out (its pixels and history survive). */
export function openSpriteDoc(docId: string, size: { width: number; height: number }): void {
  const s = useSpriteStore.getState();
  if (s.activeDocId === docId) return;
  if (s.docs.has(docId)) { activateSpriteDoc(docId); return; }
  const docs = new Map(s.docs);
  docs.set(s.activeDocId, parkedDoc(s));
  useSpriteStore.setState({
    docs,
    activeDocId: docId,
    ...blankDoc(size.width, size.height),
  });
}

/** Check out an already-open document, parking the outgoing one. No-op for a
 *  document that was never opened — openSpriteDoc is what creates them. */
export function activateSpriteDoc(docId: string): void {
  const s = useSpriteStore.getState();
  if (s.activeDocId === docId) return;
  const incoming = s.docs.get(docId);
  if (!incoming) return;
  const docs = new Map(s.docs);
  docs.set(s.activeDocId, parkedDoc(s));
  docs.delete(docId);
  useSpriteStore.setState({ docs, activeDocId: docId, ...incoming });
}

/** Drop a document and its undo stack. Closing the checked-out document falls
 *  back to the untitled document (restoring it if one was parked) rather than
 *  promoting some other tab's sprite — which document takes focus is the tab
 *  layer's decision, not the store's. */
export function closeSpriteDoc(docId: string): void {
  const s = useSpriteStore.getState();
  if (s.activeDocId === docId) {
    const docs = new Map(s.docs);
    const untitled = docs.get(UNTITLED_SPRITE_DOC_ID);
    docs.delete(UNTITLED_SPRITE_DOC_ID);
    useSpriteStore.setState({
      docs,
      activeDocId: UNTITLED_SPRITE_DOC_ID,
      ...(untitled ?? blankDoc(DEFAULT_FRAME_SIZE, DEFAULT_FRAME_SIZE)),
    });
  } else if (s.docs.has(docId)) {
    const docs = new Map(s.docs);
    docs.delete(docId);
    useSpriteStore.setState({ docs });
  }
  documentHistoryHub.dispose(docId);
}

/** Read a document's undo snapshot — the checked-out one off the root, a parked
 *  one out of the map. Keyed by doc id, never by "active": undo has to reach a
 *  background document (a dirty tab can be undone from its close confirm). */
export function readSpriteSnapshot(docId: string): SpriteSnapshot {
  const s = useSpriteStore.getState();
  const doc = docId === s.activeDocId ? s : s.docs.get(docId);
  return snap(doc ?? blankDoc(DEFAULT_FRAME_SIZE, DEFAULT_FRAME_SIZE));
}

/** Install a restored snapshot into a document, checked out or parked.
 *  Deliberately leaves `unsavedEdits` alone: undoing back to a pristine state
 *  still reads dirty, which over-asks rather than risking a silent discard. */
export function writeSpriteSnapshot(docId: string, snapshot: SpriteSnapshot): void {
  const s = useSpriteStore.getState();
  if (docId === s.activeDocId) {
    useSpriteStore.setState(snapshot);
    return;
  }
  const doc = s.docs.get(docId);
  if (!doc) return;
  const docs = new Map(s.docs);
  docs.set(docId, { ...doc, ...snapshot });
  useSpriteStore.setState({ docs });
}

export const useSpriteStore = create<SpriteState>((set, get) => ({
  // The untitled document, checked out onto the root (see UNTITLED_SPRITE_DOC_ID).
  docs: new Map(),
  activeDocId: UNTITLED_SPRITE_DOC_ID,
  ...blankDoc(DEFAULT_FRAME_SIZE, DEFAULT_FRAME_SIZE),

  tool: 'pencil',
  zoom: 10,
  showPieces: false,
  mirror: null,
  pixelPerfect: true,
  ditherPattern: 'checker',
  ditherSecondary: 0,
  clipboard: null,

  activeFrames: () => get().frames,
  isOpen: (docId) => { const s = get(); return docId === s.activeDocId || s.docs.has(docId); },
  isDirty: (docId) => {
    const s = get();
    return docId === s.activeDocId ? s.unsavedEdits : (s.docs.get(docId)?.unsavedEdits ?? false);
  },
  closeAll: () => {
    const s = get();
    for (const id of s.docs.keys()) documentHistoryHub.dispose(id);
    documentHistoryHub.dispose(s.activeDocId);
    set({
      docs: new Map(),
      activeDocId: UNTITLED_SPRITE_DOC_ID,
      ...blankDoc(DEFAULT_FRAME_SIZE, DEFAULT_FRAME_SIZE),
    });
  },

  setName: (name) => set({ name }),
  setExportDplc: (exportDplc) => set({ exportDplc }),
  setFormat: (format) => set({ format }),
  setS1ArtSource: (s1ArtSource) => set({ s1ArtSource }),
  setUnsavedEdits: (unsavedEdits) => set({ unsavedEdits }),
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
    recordEdit(s); // only records when the transform actually applies
    const frames = s.frames.slice();
    frames[s.currentIndex] = next;
    // marquee coords no longer valid after a transform
    set({ frames, selection: null });
  },
  setBuffer: (b) => {
    const s = get();
    recordEdit(s);
    const frames = s.frames.slice();
    frames[s.currentIndex] = b;
    set({ frames });
  },
  copySelection: () => {
    const s = get();
    if (!s.selection) return false;
    const region = copyRegion(s.frames[s.currentIndex], s.selection);
    if (!region) return false;
    set({ clipboard: region });
    return true;
  },
  cutSelection: () => {
    const s = get();
    if (!s.selection) return false;
    const cur = s.frames[s.currentIndex];
    const region = copyRegion(cur, s.selection);
    if (!region) return false;
    const cleared = clearRegion(cur, s.selection);
    // Only push an undo step / clobber redo when pixels actually cleared (an
    // already-blank region is a no-op edit). Mirrors applyTransform.
    if (diffWrites(cur, cleared).length > 0) recordEdit(s);
    const frames = s.frames.slice();
    frames[s.currentIndex] = cleared;
    set({ frames, clipboard: region, selection: null });
    return true;
  },
  paste: () => {
    const s = get();
    const clip = s.clipboard;
    if (!clip) return false;
    const cur = s.frames[s.currentIndex];
    // Origin: the selection's top-left if present, else (0,0); clamped so the
    // region fits (overflow is clipped by pasteRegion regardless).
    const ox = Math.max(0, Math.min(s.selection?.x ?? 0, Math.max(0, cur.width - clip.w)));
    const oy = Math.max(0, Math.min(s.selection?.y ?? 0, Math.max(0, cur.height - clip.h)));
    const pasted = pasteRegion(cur, clip, ox, oy);
    // Nothing landed (all-transparent / fully-clipped clip): no undo step, no
    // redo clobber. The clipboard existed, so the shortcut is still "handled".
    if (diffWrites(cur, pasted).length === 0) return true;
    recordEdit(s);
    const frames = s.frames.slice();
    frames[s.currentIndex] = pasted;
    // Switch to select and select the pasted rect so it can be dragged next
    // (setTool would clear the selection, so set tool + selection together here).
    const w = Math.min(clip.w, cur.width - ox), h = Math.min(clip.h, cur.height - oy);
    set({ frames, tool: 'select', selection: { x: ox, y: oy, w, h } });
    return true;
  },
  // New frame matches the current canvas size (loaded sprites may not be 32x32).
  addFrame: () => {
    const s = get();
    recordEdit(s);
    const cur = s.frames[s.currentIndex];
    set({ frames: [...s.frames, createBuffer(cur.width, cur.height)], currentIndex: s.frames.length });
  },
  duplicateFrame: () => {
    const s = get();
    recordEdit(s);
    const frames = [...s.frames, cloneFrame(s.frames[s.currentIndex])];
    set({ frames, currentIndex: frames.length - 1 });
  },
  deleteFrame: () => {
    const s = get();
    if (s.frames.length <= 1) return; // keep at least one frame
    recordEdit(s);
    const removed = s.currentIndex;
    const frames = s.frames.filter((_, i) => i !== removed);
    // Drop steps referencing the removed frame; shift higher references down.
    const steps = s.steps
      .filter((st) => st.frameIndex !== removed)
      .map((st) => (st.frameIndex > removed ? { ...st, frameIndex: st.frameIndex - 1 } : st));
    set({ frames, steps, currentIndex: Math.min(removed, frames.length - 1) });
  },
  selectFrame: (i) => set((s) => ({ currentIndex: Math.min(Math.max(0, i), s.frames.length - 1) })),

  playbackMode: 'forward',
  // Timeline edits mutate persisted data (exportSprite writes steps to
  // <name>_anims.asm), so they dirty the doc — but steps live OUTSIDE the snapshot
  // history (snap() omits them), so they set unsavedEdits DIRECTLY rather than via
  // recordEdit (recording would push a snapshot that can't restore steps, a
  // misleading undo entry). Pre-existing history gap; noted for Stage 4.
  // playbackMode is preview-only (export hardcodes control:{kind:'loop'}), so it
  // does NOT dirty.
  addStep: (frameIndex) => set((s) => ({ steps: [...s.steps, { frameIndex, duration: DEFAULT_STEP_DURATION }], unsavedEdits: true })),
  removeStep: (i) => set((s) => ({ steps: s.steps.filter((_, idx) => idx !== i), unsavedEdits: true })),
  setStepDuration: (i, duration) => set((s) => ({
    steps: s.steps.map((st, idx) => (idx === i ? { ...st, duration: Math.min(0x7f, Math.max(1, Math.round(duration) || 1)) } : st)),
    unsavedEdits: true,
  })),
  setPlaybackMode: (playbackMode) => set({ playbackMode }),
  setSteps: (steps) => set({ steps, unsavedEdits: true }),

  setCharacterAnims: (characterAnims) => set({ characterAnims }),

  newSprite: (w, h) => {
    // A fresh sprite starts with empty history — on the ACTIVE document's stack,
    // so a background document's undo survives.
    activeSpriteHistory().clear();
    set({ ...blankDoc(w, h) });
  },

  loadSprite: (frames, steps, originX, originY) => {
    activeSpriteHistory().clear(); // a loaded sprite starts with empty history
    // Clear any prior in-place save-back target; the S1 open path re-captures it
    // (with the new source file + mtime) immediately after this call.
    set({
      frames: frames.length ? frames : [blankFrame()],
      steps,
      currentIndex: 0,
      originX,
      originY,
      characterAnims: [],
      s1ArtSource: null,
      unsavedEdits: false,
        });
  },

  setZoneLine: (zoneLine) => set({ zoneLine: Math.max(0, Math.min(3, zoneLine | 0)) }),
  setStandalonePalette: (standalonePalette) => { const s = get(); recordEdit(s); set({ standalonePalette }); },
  setPaletteMode: (mode) => {
    const s = get(); recordEdit(s);
    if (mode === 'standalone' && s.paletteMode === 'zone') {
      const zone = getCurrentZone(useProjectStore.getState());
      const line = zone?.palette.lines[s.zoneLine]?.colors;
      const seed = line ? line.map((c) => ({ ...c })) : blankStandalonePalette();
      set({ paletteMode: 'standalone', standalonePalette: seed });
    } else {
      set({ paletteMode: mode });
    }
  },
  clearPalette: () => { const s = get(); recordEdit(s); set({ paletteMode: 'standalone', standalonePalette: blankStandalonePalette() }); },
  clearCanvas: () => { const s = get(); recordEdit(s); const cur = s.frames[s.currentIndex]; const frames = s.frames.slice(); frames[s.currentIndex] = createBuffer(cur.width, cur.height); set({ frames }); },
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
