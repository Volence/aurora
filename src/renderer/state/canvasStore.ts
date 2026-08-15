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
// (history-factories.ts registers the `doc:canvas:` factory).
//
// RECORDING AND DIRTYING ARE TWO SEPARATE DECISIONS, and every setter makes both
// for itself. There is no choke point, and `recordEdit` is NOT one: it pushes a
// BEFORE snapshot and does nothing else — each setter sets `unsavedEdits`
// inline. Which setter does what, as of now:
//
//   record + dirty   setPixels, setPalette, setProfile, setGridOrigin — exactly
//                    the fields CanvasSnapshot can restore.
//   dirty only       setName (persisted, but outside the snapshot — see there).
//   neither          setSelection, setSource, and all view state (tool, zoom,
//                    mirror, dither, grids, clipboard).
//
// A new setter has to answer both questions; nothing but this list will ask it.

import { create } from 'zustand';
import type { PixelBuffer, MirrorMode, DitherPattern } from '../../core/art/pixel-ops';
import { createBuffer } from '../../core/art/pixel-ops';
import type { Selection } from '../../core/art/pixel-edit-controller';
import type { ClipRegion } from '../../core/art/pixel-clipboard';
import type { CanvasDoc, CanvasGridOrigin } from '../../core/art/canvas-doc';
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

/** One open document's whole store-side state. Exported because `docs` is public
 *  — a consumer writing `docs.get(id)` otherwise gets a type it cannot name. */
export interface OpenCanvas {
  doc: CanvasDoc;
  selection: Selection | null;
  unsavedEdits: boolean;
  source: CanvasSource | null;
}

interface CanvasState {
  docs: Map<string, OpenCanvas>;
  /**
   * The document the editor shows, or null when none is focused.
   *
   * Null rather than '': with a plain `string`, `activateCanvasDoc(activeDocId)`
   * and `canvasDocState(activeDocId)` both type-check while nothing is open and
   * quietly do nothing. Null makes the compiler ask every consumer for its
   * "nothing open" branch, which is cheap to answer now and expensive to
   * retrofit once the call sites exist.
   */
  activeDocId: string | null;

  // --- Editor (view) state: one canvas editor, so these stay global ---
  tool: CanvasTool;
  zoom: number;
  mirror: MirrorMode | null;
  pixelPerfect: boolean;
  ditherPattern: DitherPattern;
  ditherSecondary: number;
  clipboard: ClipRegion | null;
  /** Which of the profile's grid pitches are drawn. Global, though its MEANING
   *  is per-document — it selects from the active profile's pitches, and the
   *  profile belongs to a document. Legitimate only because there is exactly one
   *  canvas editor: if a second pane ever shows a second document, this and the
   *  rest of the view block move into OpenCanvas. */
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
  setGridOrigin: (docId: string, origin: CanvasGridOrigin) => void;
  setSource: (docId: string, source: CanvasSource | null) => void;
  markSaved: (docId: string, mtimes: { pngMtimeMs: number | null; sidecarMtimeMs: number | null }) => void;
  sourceOf: (docId: string) => CanvasSource | null;
  isOpen: (docId: string) => boolean;
  isDirty: (docId: string) => boolean;
  closeAll: () => void;
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  docs: new Map(),
  activeDocId: null,

  tool: 'pencil',
  zoom: 8,
  mirror: null,
  pixelPerfect: true,
  ditherPattern: 'checker',
  ditherSecondary: 0,
  clipboard: null,
  visibleGrids: [8],

  // Does NOT clear the selection, though spriteStore.setTool does. It cannot:
  // there, tool and selection are both per-document; here the tool is global and
  // the selection is per-document, so "leaving the select tool drops the
  // marquee" is a rule this store has no document to apply it to. Deciding what
  // a stale marquee means is the canvas pane's job (Task 12) — it is not
  // inherited from here, and assuming it is would leave a marquee on screen with
  // no tool that can move it.
  setTool: (tool) => set({ tool }),
  setZoom: (zoom) => set({ zoom: Math.min(48, Math.max(1, Math.round(zoom))) }),
  setMirror: (mirror) => set({ mirror }),
  setPixelPerfect: (pixelPerfect) => set({ pixelPerfect }),
  setDither: (ditherPattern, ditherSecondary) => set({ ditherPattern, ditherSecondary }),
  setVisibleGrids: (visibleGrids) => set({ visibleGrids }),
  setClipboard: (clipboard) => set({ clipboard }),

  /**
   * Replace a document's pixels with a buffer OF THE DOCUMENT'S CURRENT SIZE.
   *
   * OWNERSHIP TRANSFERS to the store. On the clean path `normalizeCanvasPixels`
   * returns its input, so the document ends up holding the caller's very buffer
   * — a controller that keeps a scratch buffer it also passed here would then be
   * editing the document underneath the store, with no undo entry and no dirty
   * flag. Pass a buffer you are finished with. It is deliberately NOT cloned:
   * that is ~1 MB of copying per stroke at MAX_SIDE. (`setPalette` below does
   * copy — 64 numbers is free. The asymmetry is about cost, not a different
   * rule.)
   */
  setPixels: (docId, buffer) => {
    const entry = get().docs.get(docId);
    if (!entry) return;
    const next = normalizeCanvasPixels(buffer);
    const cur = entry.doc.pixels;
    // A size mismatch is a PROGRAMMER error, so it throws rather than resizing
    // or dropping the edit. The bug it catches: a paint handler whose dependency
    // array misses `docId`, captured while an 8x8 document was active and firing
    // after the user switched to a 16x16 one — the silent-resize version shrinks
    // that document and destroys its art while pushing an undo entry and a dirty
    // dot that make the loss look deliberate, with the user finding out at save
    // time. Silently no-op'ing instead only trades visible corruption for an
    // invisible dropped edit, which is the worse of the two. Resizing a canvas
    // is a real future feature and gets its own action (`resizeCanvasDoc`) so
    // the intent lives at the call site instead of being inferred from
    // dimensions — it could not simply fall through here anyway, because a
    // shrink leaves `selection` pointing outside the new bounds and nothing in
    // this store clamps it.
    if (next.width !== cur.width || next.height !== cur.height) {
      throw new Error(
        `setPixels(${docId}): buffer is ${next.width}x${next.height}, document is ${cur.width}x${cur.height}`,
      );
    }
    // A gesture that changed nothing commits nothing: no undo entry, no dirty dot.
    if (samePixels(cur, next)) return;
    recordEdit(docId);
    patch(docId, (e) => ({ ...e, doc: { ...e.doc, pixels: next }, unsavedEdits: true }));
  },

  setSelection: (docId, selection) => patch(docId, (e) => ({ ...e, selection })),

  setPalette: (docId, palette) => {
    if (!get().docs.has(docId)) return;
    recordEdit(docId);
    patch(docId, (e) => ({ ...e, doc: { ...e.doc, palette: palette.slice() }, unsavedEdits: true }));
  },

  // Dirties WITHOUT recording — the one setter that does, and the one thing here
  // R13 would otherwise object to. The name is document identity: it is the file
  // stem the pair is written under (canvas-file.ts), so undoing it would desync
  // the document from its own filename rather than restore anything. That is why
  // `name` is the only editable field CanvasSnapshot leaves out; the reasoning
  // lives in canvas-history.ts's header and is restated here because this is
  // where someone would notice the asymmetry. Note it also diverges from
  // spriteStore.setName, which does not dirty at all — a canvas's name is
  // persisted data, a sprite's is an export-time label.
  setName: (docId, name) => patch(docId, (e) => ({ ...e, doc: { ...e.doc, name }, unsavedEdits: true })),
  // R13: profile is an EDIT, not identity — it records. Without recordEdit
  // here, switching profile dirties the document but cannot be undone, and
  // Ctrl+Z afterwards silently reverts the previous paint stroke instead while
  // leaving the new profile in place.
  setProfile: (docId, profileId) => {
    if (!get().docs.has(docId)) return;
    recordEdit(docId);
    patch(docId, (e) => ({ ...e, doc: { ...e.doc, profileId }, unsavedEdits: true }));
  },
  // Records for the same reason setProfile does: the origin decides where the
  // profile's tile grid starts, so it decides which pixels share a tile and
  // which palette-line clashes 2B will report. A deliberate choice with visible
  // consequences — and persisted — so it is undoable, not merely dirtying.
  setGridOrigin: (docId, origin) => {
    if (!get().docs.has(docId)) return;
    recordEdit(docId);
    patch(docId, (e) => ({ ...e, doc: { ...e.doc, gridOrigin: { ...origin } }, unsavedEdits: true }));
  },
  setSource: (docId, source) => patch(docId, (e) => ({ ...e, source })),

  // Clears dirtiness and refreshes the guarded-write baselines. `setSource` must
  // have landed FIRST: with no source there is nothing to refresh, and the
  // mtimes are dropped on the floor (the save path sets the source when it
  // learns the destination, then marks saved).
  markSaved: (docId, mtimes) => patch(docId, (e) => ({
    ...e,
    unsavedEdits: false,
    source: e.source ? { ...e.source, ...mtimes } : e.source,
  })),

  sourceOf: (docId) => get().docs.get(docId)?.source ?? null,
  isOpen: (docId) => get().docs.has(docId),
  isDirty: (docId) => get().docs.get(docId)?.unsavedEdits ?? false,

  closeAll: () => {
    for (const id of get().docs.keys()) documentHistoryHub.dispose(id);
    // The clipboard goes with the documents because it IS document data: it
    // holds raw palette INDICES, and the same numbers name different colours
    // under another project's palette, so a paste that survived a project switch
    // would silently recolour itself. The rest of the view state (tool, zoom,
    // mirror, dither, grids) is genuine user preference and deliberately
    // survives — it describes how the user works, not what they were working on.
    set({ docs: new Map(), activeDocId: null, clipboard: null });
  },
}));

/**
 * Byte-for-byte pixel equality — the no-op test for `setPixels`.
 *
 * Deliberately NOT `diffWrites(...).length === 0`, which is how the sprite
 * store asks the same question: diffWrites builds one Write object per changed
 * pixel, so a fill across a 1024x1024 canvas would allocate a million throwaway
 * objects on the way to answering "yes, something changed". Same answer, no
 * allocation.
 *
 * The reference check is a pure shortcut over the total comparison below it, not
 * part of the answer: it pays off because `normalizeCanvasPixels` returns its
 * input when the buffer was already canonical, but if that ever stopped being
 * true this function would still return the correct result — just by the slow
 * path. No correctness crosses the module boundary; only the speed win does.
 */
function samePixels(a: PixelBuffer, b: PixelBuffer): boolean {
  if (a === b) return true;
  if (a.width !== b.width || a.height !== b.height) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}

/** Replace one document's entry, leaving every other document's alone. No-op for
 *  a document that isn't open. */
function patch(docId: string, fn: (e: OpenCanvas) => OpenCanvas): void {
  const s = useCanvasStore.getState();
  const entry = s.docs.get(docId);
  if (!entry) return;
  const docs = new Map(s.docs);
  docs.set(docId, fn(entry));
  useCanvasStore.setState({ docs });
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

/** Record a pre-edit snapshot on THAT document's stack. Records only — setting
 *  `unsavedEdits` is each caller's own decision (see the header). */
function recordEdit(docId: string): void {
  canvasHistory(docId).record(readCanvasSnapshot(docId));
}

// --- Document lifecycle ----------------------------------------------------

/**
 * Open a blank document and focus it, or focus the one already open under this
 * id. The return value says WHICH: Task 13 writes a canvas's file pair up front,
 * so a name that collides with an already-open canvas would otherwise focus the
 * OLD document while the create flow reports success — the user's new canvas
 * silently being someone else's art.
 */
export function openCanvasDoc(docId: string, input: {
  name: string; width: number; height: number;
  profileId: ConstraintProfileId; palette?: number[];
}): 'created' | 'focused' {
  const s = useCanvasStore.getState();
  if (s.docs.has(docId)) { activateCanvasDoc(docId); return 'focused'; }
  const docs = new Map(s.docs);
  docs.set(docId, { doc: blankCanvasDoc(input), selection: null, unsavedEdits: false, source: null });
  // A new document starts with EMPTY history even though this id is new to
  // `docs`. The hub creates stacks on demand, so any consumer that so much as
  // READ canvasHistory(id) after this id was last closed left a live stack
  // behind; reopening the id would inherit it, and one undo would then write the
  // previous incarnation's snapshot into this document — including a pixel
  // buffer of the old size, which writeCanvasSnapshot installs without checking.
  canvasHistory(docId).clear();
  useCanvasStore.setState({ docs, activeDocId: docId });
  return 'created';
}

/**
 * Install an already-decoded document — the FIRST-LOAD path for a canvas file.
 * Re-focusing an existing tab must call `activateCanvasDoc` instead: this
 * replaces the document wholesale and resets its dirty flag, so aiming it at an
 * open document with unsaved edits would discard that work and leave nothing
 * behind to say so. Replacing a CLEAN document is harmless (same bytes, freshly
 * read), so only the dirty case throws — programmer error, same channel as
 * setPixels' size check.
 */
export function loadCanvasDoc(docId: string, doc: CanvasDoc, source: CanvasSource | null): void {
  const s = useCanvasStore.getState();
  if (s.docs.get(docId)?.unsavedEdits) {
    throw new Error(`loadCanvasDoc(${docId}): document is already open with unsaved edits`);
  }
  const docs = new Map(s.docs);
  docs.set(docId, { doc, selection: null, unsavedEdits: false, source });
  canvasHistory(docId).clear();  // a loaded canvas starts with empty history
  useCanvasStore.setState({ docs, activeDocId: docId });
}

/**
 * Focus a document — or, when it is not open, focus NOTHING.
 *
 * Total on purpose. Returning silently for an unknown id would leave
 * `activeDocId` on the PREVIOUSLY focused canvas, and Task 11 activates on tab
 * focus with a tab id that survives a session restart: a restored canvas tab
 * exists before its file has been read, so the pane would render document X
 * under tab Y. That is precisely the stale-focus bug closeCanvasDoc refuses to
 * create, arriving through the other door. An empty pane reads as "not loaded";
 * someone else's art does not.
 */
export function activateCanvasDoc(docId: string): void {
  const open = useCanvasStore.getState().docs.has(docId);
  useCanvasStore.setState({ activeDocId: open ? docId : null });
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
  const activeDocId = s.activeDocId === docId ? null : s.activeDocId;
  useCanvasStore.setState({ docs, activeDocId });
  documentHistoryHub.dispose(docId);
}

/** A document's state, or null when it isn't open. The read every consumer
 *  wants: it hands back the document itself, with no aliasing contract to honour
 *  beyond "do not mutate what you did not build". */
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
  const { docs } = useCanvasStore.getState();
  return dirtyCanvasDocIds().filter((id) => docs.get(id)?.source != null);
}

// A document that isn't open has no state to read; the placeholder exists only
// so a stack whose document vanished mid-flight returns something well-formed
// rather than throwing. `profileId` and `gridOrigin` are part of the snapshot
// (R13 and its follow-on), so they are part of this too — an empty snapshot
// missing either would not type-check, which is the point of putting them in the
// snapshot rather than beside it.
const EMPTY_SNAPSHOT = (): CanvasSnapshot => ({
  pixels: createBuffer(8, 8),
  palette: blankCanvasPalette(),
  selection: null,
  profileId: 'none',
  gridOrigin: { originX: 0, originY: 0 },
});

/**
 * HISTORY PLUMBING, not a read for consumers — use `canvasDocState`.
 *
 * The returned `pixels`, `palette` and `selection` are the document's LIVE
 * references, not copies: mutating them edits the document with no undo entry
 * and no dirty flag. That is safe for the one caller that matters because
 * CanvasDocHistory deep-clones on record AND on write (snapshot-history.ts), so
 * nothing it stores can be reached from here afterwards. Copying instead would
 * mean a full pixel-buffer clone on every single record — the cost this design
 * exists to avoid.
 */
export function readCanvasSnapshot(docId: string): CanvasSnapshot {
  const e = useCanvasStore.getState().docs.get(docId);
  if (!e) return EMPTY_SNAPSHOT();
  return {
    pixels: e.doc.pixels,
    palette: e.doc.palette,
    selection: e.selection,
    profileId: e.doc.profileId,
    gridOrigin: e.doc.gridOrigin,
  };
}

/**
 * Install a restored snapshot. Deliberately leaves `unsavedEdits` alone:
 * undoing back to a pristine state still reads dirty, which over-asks rather
 * than risking a silent discard (same rule as spriteStore).
 *
 * Copies the cheap fields and ALIASES `pixels` and `selection`, the same cost
 * split `setPixels`/`setPalette` make — a pixel buffer is up to a megabyte and
 * the history already hands this a fresh clone, so copying it again would
 * double the price of every undo. A caller passing a snapshot it intends to keep
 * using must clone it first.
 */
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
      gridOrigin: { ...snapshot.gridOrigin },
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
