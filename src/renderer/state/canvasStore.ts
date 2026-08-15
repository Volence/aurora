// Every open CANVAS document, plus the one editor's view state.
//
// WHY THE SHAPE DIFFERS FROM spriteStore. The sprite store hoists its checked-
// out document onto the store root and keeps only PARKED documents in its map,
// because its view layer and loaders read `frames`/`name`/… straight off the
// root. Nothing here has that history, so every document — active or not — lives
// in `docs`, and `activeDocId` merely names one. That removes the park/unpark
// field-by-field copy entirely, along with the class of bug it exists to catch
// (a field added to the document type and forgotten in the copy).
//
// Undo lives on the DocumentHistoryHub, keyed by the same doc id as the tab
// (history-factories.ts registers the `doc:canvas:` factory). Every mutating
// action funnels through `recordEdit`, which is also where `unsavedEdits` flips
// true — the non-mutating ones (setTool, zoom, selection) deliberately do not.

import { create } from 'zustand';
import type { PixelBuffer, MirrorMode, DitherPattern } from '../../core/art/pixel-ops';
import { createBuffer } from '../../core/art/pixel-ops';
import type { Selection } from '../../core/art/pixel-edit-controller';
import type { ClipRegion } from '../../core/art/pixel-clipboard';
import type { CanvasDoc } from '../../core/art/canvas-doc';
import {
  blankCanvasDoc, normalizeCanvasPixels, cloneCanvasDoc, blankCanvasPalette,
} from '../../core/art/canvas-doc';
import type { ConstraintProfileId } from '../../core/art/canvas-profiles';
import type { CanvasSnapshot } from '../../core/editing/canvas-history';
import { CanvasDocHistory } from '../../core/editing/canvas-history';
import { documentHistoryHub } from './history-hub';

/** Where a canvas document was loaded from and will save back to. Null for a
 *  document that has never been written (Save is what gives it one). */
export interface CanvasSource {
  /** Absolute project root the two relative paths resolve under. */
  dir: string;
  pngPath: string;
  sidecarPath: string;
  /** Guarded-write conflict baselines; null when the file did not exist. */
  pngMtimeMs: number | null;
  sidecarMtimeMs: number | null;
}

export type CanvasTool =
  | 'pencil' | 'eraser' | 'fill' | 'eyedropper' | 'line' | 'rect' | 'select' | 'dither';

interface OpenCanvas {
  doc: CanvasDoc;
  selection: Selection | null;
  unsavedEdits: boolean;
  source: CanvasSource | null;
}

interface CanvasState {
  docs: Map<string, OpenCanvas>;
  /** The document the editor shows. Empty string when none is open. */
  activeDocId: string;

  // --- Editor (view) state: one canvas editor, so these stay global ---
  tool: CanvasTool;
  zoom: number;
  mirror: MirrorMode | null;
  pixelPerfect: boolean;
  ditherPattern: DitherPattern;
  ditherSecondary: number;
  clipboard: ClipRegion | null;
  /** Which of the profile's grid pitches are drawn. */
  visibleGrids: number[];

  setTool: (t: CanvasTool) => void;
  setZoom: (z: number) => void;
  setMirror: (m: MirrorMode | null) => void;
  setPixelPerfect: (v: boolean) => void;
  setDither: (pattern: DitherPattern, secondary: number) => void;
  setVisibleGrids: (g: number[]) => void;
  setClipboard: (c: ClipRegion | null) => void;

  // --- Per-document ---
  setPixels: (docId: string, buffer: PixelBuffer) => void;
  setSelection: (docId: string, sel: Selection | null) => void;
  setPalette: (docId: string, palette: number[]) => void;
  setName: (docId: string, name: string) => void;
  setProfile: (docId: string, profileId: ConstraintProfileId) => void;
  setSource: (docId: string, source: CanvasSource | null) => void;
  markSaved: (docId: string, mtimes: { pngMtimeMs: number | null; sidecarMtimeMs: number | null }) => void;
  sourceOf: (docId: string) => CanvasSource | null;
  isOpen: (docId: string) => boolean;
  isDirty: (docId: string) => boolean;
  closeAll: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  docs: new Map(),
  activeDocId: '',

  tool: 'pencil',
  zoom: 8,
  mirror: null,
  pixelPerfect: true,
  ditherPattern: 'checker',
  ditherSecondary: 0,
  clipboard: null,
  visibleGrids: [8],

  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom: Math.min(48, Math.max(1, Math.round(zoom))) }),
  setMirror: (mirror) => set({ mirror }),
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
  setDither: (ditherPattern, ditherSecondary) => set({ ditherPattern, ditherSecondary }),
  setVisibleGrids: (visibleGrids) => set({ visibleGrids }),
  setClipboard: (clipboard) => set({ clipboard }),

  setPixels: (docId, buffer) => {
    const entry = get().docs.get(docId);
    if (!entry) return;
    const next = normalizeCanvasPixels(buffer);
    // A gesture that changed nothing commits nothing: no undo entry, no dirty dot.
    if (samePixels(entry.doc.pixels, next)) return;
    recordEdit(docId);
    patch(set, get, docId, (e) => ({ ...e, doc: { ...e.doc, pixels: next }, unsavedEdits: true }));
  },

  setSelection: (docId, selection) => patch(set, get, docId, (e) => ({ ...e, selection })),

  setPalette: (docId, palette) => {
    const entry = get().docs.get(docId);
    if (!entry) return;
    recordEdit(docId);
    patch(set, get, docId, (e) => ({ ...e, doc: { ...e.doc, palette: palette.slice() }, unsavedEdits: true }));
  },

  setName: (docId, name) => patch(set, get, docId, (e) => ({ ...e, doc: { ...e.doc, name }, unsavedEdits: true })),
  // R13: profile is an EDIT, not identity — it records. Without recordEdit
  // here, switching profile dirties the document but cannot be undone, and
  // Ctrl+Z afterwards silently reverts the previous paint stroke instead while
  // leaving the new profile in place.
  setProfile: (docId, profileId) => {
    if (!get().docs.has(docId)) return;
    recordEdit(docId);
    patch(set, get, docId, (e) => ({ ...e, doc: { ...e.doc, profileId }, unsavedEdits: true }));
  },
  setSource: (docId, source) => patch(set, get, docId, (e) => ({ ...e, source })),

  markSaved: (docId, mtimes) => patch(set, get, docId, (e) => ({
    ...e,
    unsavedEdits: false,
    source: e.source ? { ...e.source, ...mtimes } : e.source,
  })),

  sourceOf: (docId) => get().docs.get(docId)?.source ?? null,
  isOpen: (docId) => get().docs.has(docId),
  isDirty: (docId) => get().docs.get(docId)?.unsavedEdits ?? false,

  closeAll: () => {
    for (const id of get().docs.keys()) documentHistoryHub.dispose(id);
    set({ docs: new Map(), activeDocId: '' });
  },
}));

/**
 * Byte-for-byte pixel equality — the no-op test for `setPixels`.
 *
 * Deliberately NOT `diffWrites(...).length === 0`, which is how the sprite
 * store asks the same question: diffWrites builds one Write object per changed
 * pixel, so a fill across a 1024x1024 canvas would allocate a million throwaway
 * objects on the way to answering "yes, something changed". Same answer, no
 * allocation. The reference fast path is exact rather than an optimisation
 * guess: normalizeCanvasPixels returns its INPUT when the buffer was already
 * canonical, so a caller handing back the document's own buffer lands here.
 */
function samePixels(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a === b) return true;
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

function patch(
  set: (partial: Partial<CanvasState>) => void,
  get: () => CanvasState,
  docId: string,
  fn: (e: OpenCanvas) => OpenCanvas,
): void {
  const entry = get().docs.get(docId);
  if (!entry) return;
  const docs = new Map(get().docs);
  docs.set(docId, fn(entry));
  set({ docs });
}

/** THAT document's undo stack, typed. The hub is deliberately data-model
 *  agnostic and hands back a bare `UndoStack` — which has no `record`, since
 *  recording a BEFORE snapshot is a snapshot-history idea and aeon's command
 *  history has no equivalent. Narrowing here is the same move spriteStore's
 *  activeSpriteHistory makes, and it is sound because the `doc:canvas:` factory
 *  is the only thing that ever builds a stack for this prefix. */
export function canvasHistory(docId: string): CanvasDocHistory {
  return documentHistoryHub.historyFor(docId) as CanvasDocHistory;
}

/** Record a pre-edit snapshot on THAT document's stack. */
function recordEdit(docId: string): void {
  canvasHistory(docId).record(readCanvasSnapshot(docId));
}

// --- Document lifecycle ----------------------------------------------------

export function openCanvasDoc(docId: string, input: {
  name: string; width: number; height: number;
  profileId: ConstraintProfileId; palette?: number[];
}): void {
  const s = useCanvasStore.getState();
  if (s.docs.has(docId)) { activateCanvasDoc(docId); return; }
  const docs = new Map(s.docs);
  docs.set(docId, { doc: blankCanvasDoc(input), selection: null, unsavedEdits: false, source: null });
  useCanvasStore.setState({ docs, activeDocId: docId });
}

/** Install an already-decoded document (the file-open path). */
export function loadCanvasDoc(docId: string, doc: CanvasDoc, source: CanvasSource | null): void {
  const s = useCanvasStore.getState();
  const docs = new Map(s.docs);
  docs.set(docId, { doc, selection: null, unsavedEdits: false, source });
  documentHistoryHub.historyFor(docId).clear();  // a loaded canvas starts with empty history
  useCanvasStore.setState({ docs, activeDocId: docId });
}

export function activateCanvasDoc(docId: string): void {
  if (!useCanvasStore.getState().docs.has(docId)) return;
  useCanvasStore.setState({ activeDocId: docId });
}

/**
 * Drop a document and its undo stack.
 *
 * Closing the ACTIVE document clears `activeDocId` rather than promoting some
 * other open canvas: which document takes focus next is the TAB layer's
 * decision (closeSpriteDoc makes the same split, and session.closeTab already
 * picks the neighbouring tab). Promoting "whichever the Map yields first" would
 * be a second, independent answer to that question, and the two disagree as
 * soon as the tab strip picks any other neighbour — leaving the canvas pane
 * rendering document X while tab Y is the active tab.
 */
export function closeCanvasDoc(docId: string): void {
  const s = useCanvasStore.getState();
  if (!s.docs.has(docId)) { documentHistoryHub.dispose(docId); return; }
  const docs = new Map(s.docs);
  docs.delete(docId);
  const activeDocId = s.activeDocId === docId ? '' : s.activeDocId;
  useCanvasStore.setState({ docs, activeDocId });
  documentHistoryHub.dispose(docId);
}

/** A document's state, or null when it isn't open. */
export function canvasDocState(docId: string): CanvasDoc | null {
  return useCanvasStore.getState().docs.get(docId)?.doc ?? null;
}

/** Every open document with unsaved edits. A background tab's edits are as real
 *  as the active one's — this is what the tab dots and the close guard read. */
export function dirtyCanvasDocIds(): string[] {
  const out: string[] = [];
  for (const [id, e] of useCanvasStore.getState().docs) if (e.unsavedEdits) out.push(id);
  return out;
}

/**
 * Every dirty document Ctrl+S can actually write. A canvas gets its destination
 * at CREATION (the New Canvas flow writes the pair up front) or from the file it
 * was loaded from, so in a healthy app this is the same set as
 * dirtyCanvasDocIds — but it is not the same set BY CONSTRUCTION: a document
 * whose source is null is excluded here while still showing a dirty dot, which
 * is the deliberate failure mode (a save with no destination has nowhere to go).
 * Its own function so the saver — which reads it from three places (Task 10) —
 * never restates the rule.
 */
export function saveableDirtyCanvasDocIds(): string[] {
  return dirtyCanvasDocIds().filter((id) => useCanvasStore.getState().docs.get(id)?.source != null);
}

// A document that isn't open has no state to read; the placeholder exists only
// so a stack whose document vanished mid-flight returns something well-formed
// rather than throwing. `profileId` is part of the snapshot (R13), so it is part
// of this too — an empty snapshot missing it would not type-check, which is the
// point of putting it in the snapshot rather than beside it.
const EMPTY_SNAPSHOT = (): CanvasSnapshot => ({
  pixels: createBuffer(8, 8),
  palette: blankCanvasPalette(),
  selection: null,
  profileId: 'none',
});

export function readCanvasSnapshot(docId: string): CanvasSnapshot {
  const e = useCanvasStore.getState().docs.get(docId);
  if (!e) return EMPTY_SNAPSHOT();
  return {
    pixels: e.doc.pixels,
    palette: e.doc.palette,
    selection: e.selection,
    profileId: e.doc.profileId,
  };
}

/** Install a restored snapshot. Deliberately leaves `unsavedEdits` alone:
 *  undoing back to a pristine state still reads dirty, which over-asks rather
 *  than risking a silent discard (same rule as spriteStore). */
export function writeCanvasSnapshot(docId: string, snapshot: CanvasSnapshot): void {
  const s = useCanvasStore.getState();
  const e = s.docs.get(docId);
  if (!e) return;
  const docs = new Map(s.docs);
  docs.set(docId, {
    ...e,
    doc: {
      ...e.doc,
      pixels: snapshot.pixels,
      palette: snapshot.palette.slice(),
      profileId: snapshot.profileId,
    },
    selection: snapshot.selection,
  });
  useCanvasStore.setState({ docs });
}

/** The stack factory history-factories registers for `doc:canvas:`. */
export function makeCanvasHistory(docId: string): CanvasDocHistory {
  return new CanvasDocHistory(
    () => readCanvasSnapshot(docId),
    (snapshot) => writeCanvasSnapshot(docId, snapshot),
  );
}

export { cloneCanvasDoc };
