// THE WORLD-SPACE REGION MARQUEE — what a press, a drag and a Delete MEAN.
//
// Editor spec §3.2 ("the world-space marquee"), empyrean
// `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md` at
// `origin/main`, step 8 of its build plan. PURE: plain data in, new data out,
// no canvas, no store, no React, no I/O. The arithmetic of AREAS is
// `region-geometry.ts` and none of it is repeated here; this module is the
// layer that decides WHICH area operation a pointer event asks for.
//
// ⚠ NAME COLLISION, STATED SO A GREP IS NOT MISREAD. `region-flip.ts` and
// `src/renderer/canvas/region-preview.ts` use "region" for A RECTANGLE OF MAP
// the marquee has grabbed, which is a different object from the identity
// regions of `regions.json`. This file, `region-geometry.ts` and
// `src/renderer/canvas/region-overlay.ts` are the regions-document family.
//
// ═══ EVERY DRAW CARVES, AND THAT IS WHY THERE IS ONE TRANSFORM ═══
//
// The owner's Q1 ruling of 2026-09-14T14:54:34Z (spec §8, banner on §3.2)
// deleted the Alt-drag carve gesture: carve is what EVERY draw over an existing
// region does. So `applyRegionGesture` has ONE body for draw, move and resize —
// each of them is "this rectangle now belongs to this region", which is
// `applyDraw`, which trims everyone else at once. A move or a resize is that
// same draw with the moved piece taken out of the set first, so a rect never
// carves itself.
//
// ═══ THE CONTRADICTION IN §3.2's TABLE, AND HOW IT IS RESOLVED ═══
//
// §3.2's gesture table says "drag inside a rect | move that rect" with NO
// qualifier about selection, and "plain drag on empty space | new rect". Read
// literally, a press inside any rect is a move, so a draw can only ever start
// on unassigned ground.
//
// THAT READING MAKES THE RULED GESTURE UNREACHABLE, and the proof is the
// generator's own refusal: `flattenRegionsDocument` throws on any act with a
// hole, so a document the build ACCEPTS has no unassigned ground at all. Under
// the literal reading, draw — the gesture the Q1 ruling promoted to the primary
// one — would be impossible on exactly the documents that ship.
//
// So the qualifier §3.2 does not write is supplied here, and it is the one the
// rest of the editor already assumes: MOVE AND RESIZE ARE OPERATIONS ON THE
// SELECTED REGION. A press inside a rect of the SELECTED region moves it; a
// press on its edge resizes it; a press anywhere else — empty ground or another
// region's paint — draws, and the draw carves whatever it lands on. That makes
// `editorStore.selectedRegionId` (the state `regions-facet.tsx` says step 8
// reads) the disambiguator, and it costs the author exactly one bound: a rect
// cannot be drawn STARTING inside your own selection. The rejected alternative
// was a modifier key for draw, which is the shape the Q1 ruling deleted.
//
// ═══ THE GRAB BAND IS IN SCREEN PIXELS ═══
//
// `REGION_GRAB_PX` is a FINGERTIP: a property of the pointing device and the
// display, not of the level. `screen-frame.ts`'s `SCREEN_FRAME_GRAB_PX` gives
// the reasoning and `effects-guides.ts`'s `GUIDE_GRAB_PX` gave it that. In
// world pixels the same band would be 24 screen px of dead zone at zoom 4 and
// 1.5 unhittable ones at zoom 0.25. So `regionPressAt` takes the viewport's
// zoom and converts: the world tolerance is `REGION_GRAB_PX / zoom`.
//
// THE CONSTANT IS DUPLICATED RATHER THAN IMPORTED, deliberately: `src/core` must
// not import from `src/renderer`, and the two bands are independently owned —
// the frame's fingertip and the region handle's may diverge without either
// being wrong. That is the same call `screen-frame.ts` made against the guides'.
//
// ═══ SNAPPING IS TO THE NEAREST MULTIPLE, NOT ROUNDED OUT ═══
//
// §3.2: base 16 px, Ctrl inverts to 8 px, "the snap is applied to the world
// coordinate before the rectangle is stored", reusing `map-clipboard.ts`'s
// `effectiveGranularity` SEMANTICS (a base granularity with one inverting
// modifier) and not its cell arithmetic.
//
// `snapMarquee`'s `block` arm rounds OUT, and that reading was considered and
// rejected: it rounds out because a CELL is indivisible and a selection must
// cover every cell touched. A region edge is not a cell boundary, it is a
// coordinate being placed in continuous world pixels, and "round out" has no
// meaning for the single edge a resize moves. Nearest is uniform across draw,
// move and resize, which is what keeps one snap rule in the author's hands.
//
// A MOVE SNAPS ITS DELTA, NOT ITS CORNERS, so a rect that is off-grid (a
// migrated 2048-aligned rect, or one typed into the panel) keeps its offset
// instead of jumping to the grid the first time it is nudged.
//
// ═══ NOTHING HERE EVER PRODUCES AN EMPTY RECTANGLE ═══
//
// `applyDraw` treats an empty draw as a no-op and returns the set unchanged,
// which on screen is a gesture that silently did nothing. Every rectangle this
// module produces is at least one snap cell on each axis, so that path is never
// reached from here and a collapsed drag reads as the smallest legal rectangle
// instead of as a dead click.

import {
  applyDraw,
  coalesceRects,
  isEmptyRect,
  rectContainsPoint,
  type Rect,
  type RegionPiece,
} from './region-geometry';
import type { Region, RegionsDocument } from '../formats/regions/document';

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

/** The base world-pixel snap for a region drag (spec §3.2). */
export const REGION_SNAP_PX = 16;

/** What Ctrl inverts the snap to (spec §3.2). */
export const REGION_SNAP_FINE_PX = 8;

/**
 * The snap actually in force, given the base and the inverting modifier.
 *
 * The shape of `map-clipboard.ts`'s `effectiveGranularity`, and a named function
 * for its reason: the press, the move and whatever describes the drag on screen
 * all have to agree, and a copy of the ternary in each is how a readout comes to
 * lie about the drag it is watching.
 */
export function effectiveRegionSnap(invert: boolean): number {
  return invert ? REGION_SNAP_FINE_PX : REGION_SNAP_PX;
}

/** One world coordinate on the snap grid: the NEAREST multiple (file docblock). */
export function snapWorld(v: number, snap: number): number {
  return Math.round(v / snap) * snap;
}

/** A rectangle at least one snap cell on each axis, grown from its origin. */
function atLeastOneCell(r: Rect, snap: number): Rect {
  return {
    x: r.x,
    y: r.y,
    w: r.w >= snap ? r.w : snap,
    h: r.h >= snap ? r.h : snap,
  };
}

/**
 * The rectangle a DRAW drag describes: both corners snapped, normalised so
 * either drag direction gives the same rect, never smaller than one snap cell.
 */
export function snapRegionRect(
  a: { x: number; y: number }, b: { x: number; y: number }, snap: number,
): Rect {
  const x0 = Math.min(snapWorld(a.x, snap), snapWorld(b.x, snap));
  const x1 = Math.max(snapWorld(a.x, snap), snapWorld(b.x, snap));
  const y0 = Math.min(snapWorld(a.y, snap), snapWorld(b.y, snap));
  const y1 = Math.max(snapWorld(a.y, snap), snapWorld(b.y, snap));
  return atLeastOneCell({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, snap);
}

/**
 * A MOVED rectangle: translated by the drag's delta, snapped as a DELTA so an
 * off-grid rect keeps its offset (file docblock).
 */
export function moveRegionRect(
  rect: Rect, press: { x: number; y: number }, cursor: { x: number; y: number }, snap: number,
): Rect {
  return {
    x: rect.x + snapWorld(cursor.x - press.x, snap),
    y: rect.y + snapWorld(cursor.y - press.y, snap),
    w: rect.w,
    h: rect.h,
  };
}

/** Which edge or corner of a rectangle a press grabbed. */
export type RegionEdge = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

/**
 * A RESIZED rectangle: only the grabbed edges follow the cursor, each snapped
 * to the grid, then normalised so dragging an edge past its opposite flips the
 * rectangle rather than inverting it.
 */
export function resizeRegionRect(
  rect: Rect, edge: RegionEdge, cursor: { x: number; y: number }, snap: number,
): Rect {
  let x0 = rect.x;
  let x1 = rect.x + rect.w;
  let y0 = rect.y;
  let y1 = rect.y + rect.h;
  if (edge.includes('w')) x0 = snapWorld(cursor.x, snap);
  if (edge.includes('e')) x1 = snapWorld(cursor.x, snap);
  if (edge.includes('n')) y0 = snapWorld(cursor.y, snap);
  if (edge.includes('s')) y1 = snapWorld(cursor.y, snap);
  return atLeastOneCell({
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  }, snap);
}

// ---------------------------------------------------------------------------
// What a press means
// ---------------------------------------------------------------------------

/**
 * How close, in SCREEN px, the cursor has to be to a rectangle's edge to grab
 * it instead of its interior. See the file docblock for why this is screen px
 * and why it is not imported from `screen-frame.ts`.
 */
export const REGION_GRAB_PX = 6;

/** What a press at a world point asks for. */
export interface RegionPress {
  /**
   * `resize` and `move` act on the SELECTED region only; everything else is a
   * `draw`, and a draw carves whatever it lands on (file docblock).
   */
  kind: 'draw' | 'move' | 'resize';
  /** Index into the pieces array for `move` and `resize`; -1 for `draw`. */
  pieceIndex: number;
  /** The region the gesture acts on: the selected id, or null for a fresh draw. */
  id: string | null;
  /** Which handle was grabbed. Null unless `kind` is `resize`. */
  edge: RegionEdge | null;
  /**
   * The region the point is INSIDE, whoever it belongs to, or null for
   * unassigned ground.
   *
   * Carried so a caller can say what a draw is about to carve BEFORE the author
   * commits to it. Under the ruled model a draw over another region trims that
   * region silently, and a gesture whose destructive half is invisible until
   * after the undo entry is written is the thing this field exists to prevent.
   */
  overId: string | null;
}

/** Is `v` within `tol` of `at`? */
function near(v: number, at: number, tol: number): boolean {
  return Math.abs(v - at) <= tol;
}

/**
 * Which edge or corner of `r` a world point grabs, or null for none.
 *
 * The point must be within the band of the rectangle on BOTH axes, so the band
 * is a frame around the rectangle and not four infinite strips.
 */
export function regionEdgeAt(r: Rect, x: number, y: number, tol: number): RegionEdge | null {
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  if (x < r.x - tol || x > x1 + tol || y < r.y - tol || y > y1 + tol) return null;
  const w = near(x, r.x, tol);
  const e = near(x, x1, tol);
  const n = near(y, r.y, tol);
  const s = near(y, y1, tol);
  if (n && w) return 'nw';
  if (n && e) return 'ne';
  if (s && w) return 'sw';
  if (s && e) return 'se';
  if (n) return 'n';
  if (s) return 's';
  if (w) return 'w';
  if (e) return 'e';
  return null;
}

/**
 * What a press at a world point means, given the set, the selection and the
 * viewport's zoom.
 *
 * `zoom` is canvas px per world px and must be positive; it converts the
 * screen-px grab band to world px. A non-positive zoom is not a viewport, and
 * rather than produce `Infinity` this reads it as 1 so the answer stays a
 * rectangle-sized band instead of swallowing the whole act.
 */
export function regionPressAt(
  pieces: readonly RegionPiece[],
  x: number,
  y: number,
  selectedId: string | null,
  zoom: number,
): RegionPress {
  const tol = REGION_GRAB_PX / (zoom > 0 ? zoom : 1);
  let overId: string | null = null;
  for (const p of pieces) {
    if (rectContainsPoint(p.rect, x, y)) { overId = p.id; break; }
  }

  if (selectedId !== null) {
    for (let i = 0; i < pieces.length; i += 1) {
      if (pieces[i].id !== selectedId) continue;
      const edge = regionEdgeAt(pieces[i].rect, x, y, tol);
      if (edge !== null) {
        return { kind: 'resize', pieceIndex: i, id: selectedId, edge, overId };
      }
    }
    for (let i = 0; i < pieces.length; i += 1) {
      if (pieces[i].id !== selectedId) continue;
      if (rectContainsPoint(pieces[i].rect, x, y)) {
        return { kind: 'move', pieceIndex: i, id: selectedId, edge: null, overId };
      }
    }
  }

  return { kind: 'draw', pieceIndex: -1, id: selectedId, edge: null, overId };
}

// ---------------------------------------------------------------------------
// What a gesture does to the set
// ---------------------------------------------------------------------------

/**
 * One finished gesture. ONE of these is ONE `SetRegionsCommand`, which is what
 * makes a drag that splits three rectangles a single undo step (spec §3.3).
 */
export type RegionGesture =
  /** A rectangle given to `id`, carving everyone else. `id` may be new. */
  | { kind: 'draw'; id: string; rect: Rect }
  /** The piece at `pieceIndex`, now at `rect`. Carves everyone else. */
  | { kind: 'move'; pieceIndex: number; rect: Rect }
  /** The piece at `pieceIndex`, now `rect`. Carves everyone else. */
  | { kind: 'resize'; pieceIndex: number; rect: Rect }
  /** The piece at `pieceIndex`, gone. Its area becomes UNASSIGNED. */
  | { kind: 'delete'; pieceIndex: number };

/** What a gesture did to the set. */
export interface RegionGestureResult {
  /** The new, disjoint set, each region's pieces coalesced (see below). */
  pieces: RegionPiece[];
  /** Ids that lost area to this gesture, each named once. */
  trimmedIds: string[];
  /**
   * Ids that had area before this gesture and have NONE after.
   *
   * "A region whose last rectangle is removed is removed with it" (spec §3.2's
   * last row). `applyDraw` reports these as `emptiedIds` and deliberately
   * leaves them in no state at all, because a region with no pieces has nothing
   * to leave; naming them here is what lets the document projection drop the
   * entry, which is where a region's bindings actually live.
   */
  removedIds: string[];
}

/** Every id that holds at least one non-empty rectangle. */
function idsWithArea(pieces: readonly RegionPiece[]): Set<string> {
  const out = new Set<string>();
  for (const p of pieces) if (!isEmptyRect(p.rect)) out.add(p.id);
  return out;
}

/**
 * COALESCE EACH REGION'S OWN PIECES, in first-seen id order.
 *
 * Subtraction fragments: three draws across an act leave the first region as
 * four rectangles that are visibly one shape, and without this the set grows
 * without bound across a session (`coalesceRects`'s own docblock says so, and
 * the generator does the same step for the same reason, spec §5.2 step 3). The
 * UNION of each id is unchanged by definition, so this can never change what
 * the ROM sees or which region owns a pixel; only the decomposition gets
 * coarser.
 */
function coalesceByRegion(pieces: readonly RegionPiece[]): RegionPiece[] {
  const order: string[] = [];
  const byId = new Map<string, Rect[]>();
  for (const p of pieces) {
    if (isEmptyRect(p.rect)) continue;
    let rects = byId.get(p.id);
    if (rects === undefined) { rects = []; byId.set(p.id, rects); order.push(p.id); }
    rects.push(p.rect);
  }
  const out: RegionPiece[] = [];
  for (const id of order) {
    for (const rect of coalesceRects(byId.get(id) as Rect[])) out.push({ id, rect });
  }
  return out;
}

/**
 * Apply one gesture to the set.
 *
 * Draw, move and resize are ONE operation (file docblock): the piece being moved
 * or resized leaves the set first so it does not carve itself, and the new
 * rectangle is then drawn, trimming every region it overlaps at once.
 *
 * An out-of-range `pieceIndex` returns the set unchanged with nothing trimmed
 * and nothing removed, which is the honest answer to a gesture that names a
 * piece that is not there.
 */
export function applyRegionGesture(
  pieces: readonly RegionPiece[], gesture: RegionGesture,
): RegionGestureResult {
  const before = idsWithArea(pieces);
  const unchanged = (): RegionGestureResult => ({
    pieces: pieces.map((p) => ({ id: p.id, rect: { ...p.rect } })),
    trimmedIds: [],
    removedIds: [],
  });

  if (gesture.kind !== 'draw') {
    if (gesture.pieceIndex < 0 || gesture.pieceIndex >= pieces.length) return unchanged();
  }

  let next: RegionPiece[];
  let trimmedIds: string[];

  if (gesture.kind === 'delete') {
    next = pieces
      .filter((_, i) => i !== gesture.pieceIndex)
      .map((p) => ({ id: p.id, rect: { ...p.rect } }));
    trimmedIds = [];
  } else {
    const id = gesture.kind === 'draw' ? gesture.id : pieces[gesture.pieceIndex].id;
    const rest = gesture.kind === 'draw'
      ? pieces
      : pieces.filter((_, i) => i !== gesture.pieceIndex);
    const drawn = applyDraw(rest, { id, rect: gesture.rect });
    next = drawn.pieces;
    trimmedIds = drawn.trimmedIds;
  }

  const coalesced = coalesceByRegion(next);
  const after = idsWithArea(coalesced);
  const removedIds: string[] = [];
  for (const id of before) if (!after.has(id)) removedIds.push(id);
  return { pieces: coalesced, trimmedIds, removedIds };
}

// ---------------------------------------------------------------------------
// The same gesture, as a whole new document
// ---------------------------------------------------------------------------

/**
 * The document's regions as geometry pieces, in document order.
 *
 * The same projection `regions-aeon.ts` already makes for `coverage` and
 * `disjointness`; it is restated here so this module does not import a renderer
 * provider, which `src/core` may not do.
 */
export function regionPieces(doc: RegionsDocument): RegionPiece[] {
  return doc.regions.map((r) => ({ id: r.id, rect: { ...r.rect } }));
}

/** A gesture that became a document, or the reason it could not. */
export type RegionGestureOutcome =
  | {
    ok: true;
    document: RegionsDocument;
    pieces: RegionPiece[];
    trimmedIds: string[];
    removedIds: string[];
  }
  | { ok: false; reason: string };

/**
 * ONE GESTURE, ONE NEW DOCUMENT, so the caller wraps it in exactly ONE
 * `SetRegionsCommand` (spec §3.3). The command is NOT built here: this module
 * knows geometry and identity and nothing about history.
 *
 * ⚠ A REGION WITH SEVERAL RECTANGLES IS SEVERAL `regions[]` ENTRIES SHARING AN
 * `id`, AND THAT IS FORCED, NOT CHOSEN. The landed contract carries exactly one
 * `rect` per entry (`aurora-regions.schema.json`), an L-shape is two engine
 * rows (spec §2.1), and carving splits one rectangle into as many as four —
 * so a region's area is a SET of entries or it cannot be expressed at all.
 * `region-geometry.ts`'s `RegionPiece` is that model. MEASURED, because it is
 * the thing that would forbid it: nothing refuses duplicate ids. The vendored
 * schema has no uniqueness keyword, `parseRegionsDocument` has no such check
 * (`validate.ts`'s rule-1 summary lists "duplicate id" as a refusal that does
 * not exist anywhere in this repo), and aeon's `tools/region_flatten.py` uses
 * the id only to name a complaint.
 *
 * EVERY ENTRY OF ONE ID CARRIES IDENTICAL BINDINGS, BY CONSTRUCTION HERE: the
 * bindings come from the id's FIRST existing entry and are copied to each of
 * its pieces. That invariant is this function's, and it is under test. Two
 * consumers written against one-entry-per-region do not yet hold it up, and
 * both are named in `docs/reviews/2026-09-16-regions-step8-gestures.md` rather
 * than quietly worked around.
 *
 * `newRegion` supplies the bindings for an id the document does not have.
 * `preset` is `required` in the contract and Aurora cannot invent one, so a
 * draw naming an unknown id WITHOUT a template is refused with a reason rather
 * than silently dropped or given a made-up preset.
 */
export function applyRegionGestureToDocument(
  doc: RegionsDocument, gesture: RegionGesture, newRegion?: Region,
): RegionGestureOutcome {
  const pieces = regionPieces(doc);
  if (gesture.kind !== 'draw'
    && (gesture.pieceIndex < 0 || gesture.pieceIndex >= pieces.length)) {
    return {
      ok: false,
      reason: `this gesture names rectangle ${gesture.pieceIndex}, and the document has `
        + `${pieces.length}.`,
    };
  }

  const template = new Map<string, Region>();
  for (const r of doc.regions) if (!template.has(r.id)) template.set(r.id, r);
  if (gesture.kind === 'draw' && !template.has(gesture.id)) {
    if (newRegion === undefined) {
      return {
        ok: false,
        reason: `this act has no region ${JSON.stringify(gesture.id)}, and a new one needs a `
          + 'preset: the regions contract requires one per region and there is no act-level '
          + 'preset to inherit.',
      };
    }
    template.set(gesture.id, newRegion);
  }

  const result = applyRegionGesture(pieces, gesture);
  const regions = result.pieces.map((p) => {
    const from = template.get(p.id) as Region;
    return { ...from, id: p.id, rect: { ...p.rect } };
  });

  return {
    ok: true,
    document: { ...doc, regions },
    pieces: result.pieces,
    trimmedIds: result.trimmedIds,
    removedIds: result.removedIds,
  };
}
