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
//   dirty only       none, today. `setName` used to fill this slot and was
//                    deleted as dead code (no production caller ever wired a
//                    rename flow to it — see CanvasMode.tsx's "NO NAME FIELD"
//                    comment) rather than left as a loaded gun: a real rename
//                    has to move the file pair too, which is a 2B feature, and
//                    a name-only setter left lying around is exactly the shape
//                    a future caller reaches for and gets half-right.
//   neither          setSelection, setSource, and all view state (tool, zoom,
//                    mirror, dither, paint index, grids, and the two constraint
//                    switches). Note the line above it: setProfile RECORDS,
//                    because the profile decides which violations exist; the
//                    constraint switches decide only whether you are shown them.
//
// A new setter has to answer both questions; nothing but this list will ask it.

import { create } from 'zustand';
import type { PixelBuffer, MirrorMode, DitherPattern } from '../../core/art/pixel-ops';
import { createBuffer } from '../../core/art/pixel-ops';
import type { Selection } from '../../core/art/pixel-edit-controller';
import type { CanvasDoc, CanvasGridOrigin } from '../../core/art/canvas-doc';
import {
  blankCanvasDoc, normalizeCanvasPixels, blankCanvasPalette,
  canvasIndex, paletteLineOf, paletteEntryOf,
} from '../../core/art/canvas-doc';
import { mostVisiblePaintIndex } from '../../core/art/canvas-default-palette';
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
  /** R12: true when the sidecar at `sidecarPath` exists but could not be read
   *  or parsed the last time this document was loaded. Carried on the source
   *  (not just returned by the one `loadCanvasFile` call that discovered it)
   *  because a save can happen long after the load, and `saveCanvasFile` must
   *  keep declining to overwrite that sidecar for the life of this document —
   *  a flag returned only once, with nowhere to live, is a flag that gets
   *  dropped the moment something other than the loader reads it. */
  sidecarRejected: boolean;
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
  /**
   * Bumped by every change to the document's CONTENT, undo included.
   *
   * A save encodes the document, awaits the guarded write, and then clears
   * `unsavedEdits`. A stroke landing while that write is in flight is not in
   * the bytes on disk, so clearing the flag afterwards loses it in silence — no
   * dot, no close prompt, and the next Ctrl+S has nothing to save. `markSaved`
   * takes the counter the saver read before its await and declines to clear
   * when it has moved.
   */
  editGen: number;
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
  /**
   * The paint index, 0..63 — the colour the next stroke writes (Task 12).
   *
   * IT CANNOT BE artStore.selectedColor, which is what every other pixel surface
   * in the app uses. That field is documented 0-15 and is a CROSS-ENGINE
   * SINGLETON: the classic tile/block/chunk editors and aeon's composer all
   * paint with it into real 4bpp tile data. A canvas index is 0..63, so binding
   * a line-2 swatch here and then opening a tile tab would arm colour 37 on a
   * surface whose palette has sixteen entries — magenta on screen (PixelViewport
   * draws an out-of-range index magenta) and an illegal nibble in the tile it
   * writes. The two ranges are different alphabets and need different variables.
   *
   * IT IS ARMED FOR YOU when a document is installed — see
   * `armVisiblePaintIndex`, which both `openCanvasDoc` and `loadCanvasDoc` call.
   * The default below is only what holds before any canvas has been opened.
   *
   * It lives on the STORE rather than in the pane's own React state because
   * CanvasMode is not keep-alive (App mounts it only while a canvas tab is
   * active), so component state would reset the artist's colour on every tab
   * switch. View state, so it neither records nor dirties.
   */
  paintIndex: number;
  /** Which of the profile's grid pitches are drawn. Global, though its MEANING
   *  is per-document — it selects from the active profile's pitches, and the
   *  profile belongs to a document. Legitimate only because there is exactly one
   *  canvas editor: if a second pane ever shows a second document, this and the
   *  rest of the view block move into OpenCanvas. */
  visibleGrids: number[];
  /**
   * The *unconstrained* escape hatch (spec §4.3): false suspends live checking
   * entirely — no scan, no readouts, no overlay — and re-enabling rescans.
   *
   * VIEW STATE, not a document field, and deliberately not persisted: a document
   * that permanently checks nothing already has a spelling, the `none` profile.
   * Two ways to say one thing is two things to keep in agreement. It also
   * neither records undo nor dirties, for the same reason `visibleGrids` does
   * not — it changes what you are shown, not what the file holds.
   */
  constraintsLive: boolean;
  /** Whether clash cells are tinted. Independent of `constraintsLive` — the
   *  numeric readouts are useful with the tint off, so they are separate
   *  switches rather than one three-state control. */
  showClashOverlay: boolean;

  setTool: (t: CanvasTool) => void;
  setZoom: (z: number) => void;
  setMirror: (m: MirrorMode | null) => void;
  setPixelPerfect: (v: boolean) => void;
  setDither: (pattern: DitherPattern, secondary: number) => void;
  setPaintIndex: (v: number) => void;
  setVisibleGrids: (g: number[]) => void;
  setConstraintsLive: (v: boolean) => void;
  setShowClashOverlay: (v: boolean) => void;

  // --- Per-document ---
  setPixels: (docId: string, buffer: PixelBuffer) => void;
  setSelection: (docId: string, sel: Selection | null) => void;
  setPalette: (docId: string, palette: number[]) => void;
  setProfile: (docId: string, profileId: ConstraintProfileId) => void;
  setGridOrigin: (docId: string, origin: CanvasGridOrigin) => void;
  setSource: (docId: string, source: CanvasSource | null) => void;
  markSaved: (
    docId: string,
    mtimes: { pngMtimeMs: number | null; sidecarMtimeMs: number | null },
    atGen?: number,
  ) => boolean;
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
  // Line 0, entry 1 — the first paintable colour. Starting on 0 would arm the
  // eraser, so the first stroke a new user draws would do nothing visible.
  paintIndex: canvasIndex(0, 1),
  visibleGrids: [8],
  constraintsLive: true,
  showClashOverlay: true,

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
  // Through canvasIndex, the ONE constructor: it masks both fields and folds
  // every entry-0 alias to 0, so an eyedropper reading a corrupt pixel — or a
  // future caller doing its own `(line << 4) | entry` — cannot arm a brush that
  // paints a value the document's own normaliser would rewrite. A brush holding
  // 16 would look like the eraser and store as one, which is the two-spellings
  // bug canvas-doc.ts exists to prevent, entering through the palette.
  setPaintIndex: (v) => set({ paintIndex: canvasIndex(paletteLineOf(v), paletteEntryOf(v)) }),
  setVisibleGrids: (visibleGrids) => set({ visibleGrids }),
  // No recordEdit and no unsavedEdits: both are view state (see their
  // declarations). setProfile records because the profile decides which
  // violations EXIST; these two decide only whether you are being shown them.
  setConstraintsLive: (constraintsLive) => set({ constraintsLive }),
  setShowClashOverlay: (showClashOverlay) => set({ showClashOverlay }),

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
    patch(docId, (e) => ({ ...e, doc: { ...e.doc, pixels: next }, unsavedEdits: true, editGen: e.editGen + 1 }));
  },

  setSelection: (docId, selection) => patch(docId, (e) => ({ ...e, selection })),

  setPalette: (docId, palette) => {
    if (!get().docs.has(docId)) return;
    recordEdit(docId);
    patch(docId, (e) => ({ ...e, doc: { ...e.doc, palette: palette.slice() }, unsavedEdits: true, editGen: e.editGen + 1 }));
  },

  // R13: profile is an EDIT, not identity — it records. Without recordEdit
  // here, switching profile dirties the document but cannot be undone, and
  // Ctrl+Z afterwards silently reverts the previous paint stroke instead while
  // leaving the new profile in place.
  setProfile: (docId, profileId) => {
    if (!get().docs.has(docId)) return;
    recordEdit(docId);
    patch(docId, (e) => ({ ...e, doc: { ...e.doc, profileId }, unsavedEdits: true, editGen: e.editGen + 1 }));
  },
  // Records for the same reason setProfile does: the origin decides where the
  // profile's tile grid starts, so it decides which pixels share a tile and
  // which palette-line clashes 2B will report. A deliberate choice with visible
  // consequences — and persisted — so it is undoable, not merely dirtying.
  //
  // THE NO-OP GUARD, which R13 was right to skip discussing and wrong to leave
  // out: R13's point was that the origin IS an edit and therefore MUST record,
  // and that is still true — the bug here was never "it records", it was that
  // it recorded even when nothing changed, which setPixels (samePixels) and
  // commitCanvasSwatch (its 'unchanged' path) both already guard against. The
  // field USED TO BE a plain NumberField whose onChange fired per keystroke, so
  // without this guard: typing "12" pushed TWO full CanvasSnapshots (pixels
  // included, ~1 MB each at CANVAS_MAX_SIDE) for one field edit, and clearing
  // the field committed a literal 0 the user never typed AND recorded it — the
  // same defect a CDP row found in NewCanvasDialog, entering here through a
  // second door. At a 40-deep undo stack, three keystrokes silently evicted
  // three real pixel edits. CanvasMode.tsx's grid-origin field (GridOriginField)
  // was ALSO moved to commit-on-blur rather than per-keystroke, so a single
  // field edit costs at most one entry regardless; this guard is the second,
  // independent line of defence — it is what makes re-committing an unchanged
  // value, or a value equal to what is already there, free even if some future
  // caller goes back to firing on every keystroke.
  setGridOrigin: (docId, origin) => {
    const entry = get().docs.get(docId);
    if (!entry) return;
    const cur = entry.doc.gridOrigin;
    if (cur.originX === origin.originX && cur.originY === origin.originY) return;
    recordEdit(docId);
    patch(docId, (e) => ({ ...e, doc: { ...e.doc, gridOrigin: { ...origin } }, unsavedEdits: true, editGen: e.editGen + 1 }));
  },
  setSource: (docId, source) => patch(docId, (e) => ({ ...e, source })),

  // Clears dirtiness and refreshes the guarded-write baselines. `setSource` must
  // have landed FIRST: with no source there is nothing to refresh, and the
  // mtimes are dropped on the floor (the save path sets the source when it
  // learns the destination, then marks saved).
  // `atGen` is the document's `editGen` as the saver read it, before the write.
  // A counter that has moved since means the artist edited during the write,
  // those pixels are not on disk, and the flag must stay. Returns whether it
  // cleared, so the caller can say which happened.
  markSaved: (docId, mtimes, atGen) => {
    const e = get().docs.get(docId);
    if (!e) return false;
    const stale = atGen !== undefined && e.editGen !== atGen;
    patch(docId, (cur) => ({
      ...cur,
      unsavedEdits: stale ? cur.unsavedEdits : false,
      source: cur.source ? { ...cur.source, ...mtimes } : cur.source,
    }));
    return !stale;
  },

  sourceOf: (docId) => get().docs.get(docId)?.source ?? null,
  isOpen: (docId) => get().docs.has(docId),
  isDirty: (docId) => get().docs.get(docId)?.unsavedEdits ?? false,

  closeAll: () => {
    for (const id of get().docs.keys()) documentHistoryHub.dispose(id);
    // The PAINT INDEX goes with the documents because it IS document data: it is
    // a raw palette index, and the same number names a different colour under
    // the next project's palette — a brush that survived a project switch would
    // silently recolour itself, which is precisely the argument that used to be
    // written here about the clipboard (removed in Task 12: nothing wrote it).
    // Resetting to the first paintable colour rather than to 0, so the next
    // canvas does not open with the eraser armed.
    //
    // The rest of the view state (tool, zoom, mirror, dither, grids) is genuine
    // user preference and deliberately survives — it describes how the user
    // works, not what they were working on. That is the whole test: does the
    // value mean anything without the document it came from?
    set({
      docs: new Map(), activeDocId: null,
      paintIndex: canvasIndex(0, 1),
    });
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
 * Arm the brush on a colour that can be SEEN in this document's palette.
 *
 * ONE RULE, BOTH DOORS. A canvas document enters this store in exactly two
 * ways — `openCanvasDoc` (created) and `loadCanvasDoc` (read from disk) — and
 * R18's fix originally went into the CREATE flow only. So a canvas created
 * outside a zone opened with white armed, and the same canvas REOPENED next
 * session opened with `canvasIndex(0, 1)` armed, which in a zone-seeded palette
 * is usually black: the stroke commits, the dirty dot appears, and nothing
 * visible happens. That is R18's exact defect one door over, and the CDP run
 * caught it. Putting the rule here rather than at the two call sites is what
 * stops the doors drifting apart again.
 *
 * NOT ON PLAIN FOCUS (`activateCanvasDoc`), which would overwrite the artist's
 * chosen colour on every tab switch. This fires only when a document's palette
 * first becomes known to the store — the same moment the store already treats
 * as "this is new" by clearing the undo stack.
 *
 * The store's own `closeAll` comment is the general argument: a paint index is a
 * raw palette index, and the same number names a different colour under a
 * different palette, so carrying one across a palette boundary silently
 * recolours the brush.
 */
function armVisiblePaintIndex(palette: readonly number[]): void {
  useCanvasStore.getState().setPaintIndex(mostVisiblePaintIndex(palette));
}

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
  docs.set(docId, { doc: blankCanvasDoc(input), selection: null, unsavedEdits: false, source: null, editGen: 0 });
  // A new document starts with EMPTY history even though this id is new to
  // `docs`. The hub creates stacks on demand, so any consumer that so much as
  // READ canvasHistory(id) after this id was last closed left a live stack
  // behind; reopening the id would inherit it, and one undo would then write the
  // previous incarnation's snapshot into this document — including a pixel
  // buffer of the old size, which writeCanvasSnapshot installs without checking.
  canvasHistory(docId).clear();
  useCanvasStore.setState({ docs, activeDocId: docId });
  armVisiblePaintIndex(docs.get(docId)!.doc.palette);
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
  docs.set(docId, { doc, selection: null, unsavedEdits: false, source, editGen: 0 });
  canvasHistory(docId).clear();  // a loaded canvas starts with empty history
  useCanvasStore.setState({ docs, activeDocId: docId });
  // The door R18's original fix missed: a REOPENED zone-seeded canvas armed
  // entry 1, which is black in most zone palettes.
  armVisiblePaintIndex(doc.palette);
}

/**
 * Focus a document — or, when it is not open, focus NOTHING.
 *
 * Total on purpose. Returning silently for an unknown id would leave
 * `activeDocId` on the PREVIOUSLY focused canvas — the pane rendering document X
 * under tab Y, precisely the stale-focus bug closeCanvasDoc refuses to create,
 * arriving through the other door. An empty pane reads as "not loaded"; someone
 * else's art does not.
 *
 * WHAT MAKES THAT LOAD-BEARING TODAY is the tab-activation glue: focusing any
 * NON-canvas tab clears the canvas focus by calling this with that tab's own id
 * (see focusCanvasForTab / clearCanvasFocus), so "focus nothing" is spelled as
 * "focus an id no document has". Every level- and sprite-tab focus takes that
 * path.
 *
 * SESSION RESTORE reaches this too, as of Task 13: `isValid` now keeps
 * `doc:canvas:` tabs and the restore effect activates the active one, so a tab
 * genuinely exists here before its file has been read. (That was written as the
 * justification for totality long before it was true — the clear-the-focus case
 * above is what has always made it load-bearing.) A restored canvas whose file
 * cannot be read lands on the `false` branch and focuses nothing, which is what
 * the pane renders as "could not be loaded".
 */
export function activateCanvasDoc(docId: string): void {
  const open = useCanvasStore.getState().docs.has(docId);
  useCanvasStore.setState({ activeDocId: open ? docId : null });
}

/**
 * Focus NO canvas — the state the pane reads as "no canvas is showing".
 *
 * Delegates to `activateCanvasDoc`, whose totality is the whole mechanism; this
 * exists so the CALL SITE says what it means. Written out, the clear is
 * `activateCanvasDoc(someLevelTabId)`, which reads as a mistake until you find
 * the comment explaining that an id no document has focuses nothing.
 */
export function clearCanvasFocus(): void {
  activateCanvasDoc(NO_CANVAS_DOC_ID);
}

// An id no document can be opened under: `openCanvasDoc`/`loadCanvasDoc` are
// keyed by TAB id, and every tab id is non-empty.
const NO_CANVAS_DOC_ID = '';

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
    // Undo/redo changes the content like any other edit, so a save in flight
    // over the pre-undo bytes no longer describes what is resident.
    editGen: e.editGen + 1,
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
