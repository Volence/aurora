// THE PER-RECTANGLE LIST — editor spec §3.4's detail-pane row
//
//   rects    #1  x 3400  y 0  w 1400  h 2048          [Carve] [Fit to 16]
//
// (empyrean `docs/superpowers/specs/2026-09-14-aurora-regions-editor-design.md`,
// read at `origin/main`). PURE: plain data in, plain data out, no store, no
// React, no I/O. `components/regions/RegionsPanel.tsx` renders what this
// derives and decides nothing.
//
// ═══ WHY IT EXISTS: THE FOUR FIELDS EDITED RECTANGLE 1 OF A CARVED REGION ═══
//
// A region is SEVERAL `regions[]` entries sharing one id (step 8B, forced by the
// one-`rect`-per-entry contract; `applyRegionGestureToDocument` has the proof).
// Until this module the detail pane's four numbers resolved the id's FIRST
// entry, so on a carved region they edited rectangle 1 and the others were not
// on screen at all; a warning line said so (ROADMAP row 206's item 1, and the
// step-8B packets' tagged item). Here every entry of the selected region is a
// row, addressed by its DOCUMENT INDEX, so an edit lands on the entry it is
// shown beside and on no other.
//
// ═══ ORDER: THE REGION'S ENTRIES IN DOCUMENT ORDER, NUMBERED FROM 1 ═══════
//
// The same "no sort" rule `regionListRows` keeps one level up (the owner's Q1
// ruling deleted painter's order; list order carries no meaning). `#n` is the
// entry's position AMONG THIS REGION'S ENTRIES, not its document index: an
// author has no use for "entry 7 of the file", and the index is carried
// separately for the commands.
//
// ⚠ `#n` IS NOT STABLE ACROSS A GEOMETRY GESTURE, and that is stated rather than
// hidden. `applyRegionGesture` takes a moved or resized piece out of the set and
// draws it back at the END, then coalesces each region's pieces, so after a
// move, a resize or a Fit the numbering is re-derived from the new document.
// Typing into a field does not reorder (it writes the entry in place).
//
// ═══ THREE DOORS, AND WHICH OF THEM CARVE ═════════════════════════════════
//
//  1. THE FOUR NUMBERS write the entry IN PLACE and carve nothing — exactly the
//     semantics the step-6 `RectFields` had, now aimed at the right entry. Not
//     changed here: whether a typed number should carve its neighbours (as a
//     drag does under the Q1 ruling) is a behaviour question this parcel does
//     not own, and it is tagged in the packet. The status line and the list's
//     `overlaps` mark already say when typing made two regions share a pixel.
//  2. [Fit to 16] is a RESIZE through the gesture layer, so it obeys the Q1
//     rule every geometry gesture obeys: the fitted rectangle trims whatever it
//     now lands on. It is a new geometry writer and the ruling's "drawing a
//     region over another trims the other's rectangles at once" is the rule
//     for geometry writers. A rect already on the 16 px grid offers no Fit.
//  3. [Delete] is §3.2's last gesture row, "Delete on a selected rect: remove
//     it; a region whose last rect is removed is removed with it", through the
//     gesture layer's existing `delete` arm (built and tested in 8A, never
//     wired to any control before this).
//
// §3.4's [Carve] IS NOT BUILT, BECAUSE THE Q1 RULING LEFT IT NO REFERENT. In
// the painter's-order draft, carve was an opt-in subtraction (Alt-drag, and this
// button); §3.2's banner says "Carve is what EVERY draw over an existing region
// does, there is no separate Alt gesture". A button that carves is a gesture
// the ruling deleted.

import {
  applyRegionGestureToDocument,
  REGION_SNAP_PX,
  snapWorld,
  type RegionGesture,
} from '../../core/editing/region-marquee';
import { disjointness, type RegionPiece } from '../../core/editing/region-geometry';
import { cloneRegionsDocument } from '../../core/formats/regions/act-regions';
import type { RegionRect, RegionsDocument } from '../../core/formats/regions/document';
import type { SetRegionsCommand } from '../../core/editing/commands';
import type { ActExtent } from '../../core/formats/regions/validate';
import { regionRectFindings } from './regions-aeon';

/** One rectangle of the selected region, as the detail pane lists it. */
export interface RegionRectRow {
  /** 1-based position among THIS region's entries, in document order. */
  n: number;
  /** Index into `doc.regions` — what every command below addresses. */
  entryIndex: number;
  rect: RegionRect;
  /**
   * The rectangle [Fit to 16] would produce, or null when the rect is already
   * on the grid (every edge a multiple of the snap). Null means no control, not
   * a control that does nothing.
   */
  fitted: RegionRect | null;
  /** §2.5 rule 2 for THIS rectangle (outside the act, and so on), in words. */
  findings: string[];
  /**
   * OTHER region ids whose rectangles share a pixel with this one. The row-level
   * `overlaps` mark says WHICH regions collide; this says WHICH RECTANGLE of the
   * selected region is the one doing it, which is the question an author fixing
   * it has next. Same-id pairs are dropped for the reason `RegionListRow.overlaps`
   * gives (every scan order answers with the same region).
   */
  overlaps: string[];
}

/**
 * [Fit to 16]: every EDGE to its nearest grid line, never smaller than one cell.
 *
 * Edges, not origin-and-size: a rect at x 3400, w 1400 has its left edge at
 * 3400 (212.5 cells, fits to 3408) and its right edge at 4800 (already on the
 * grid), so the fitted rect is x 3408, w 1392. Snapping `w` as a number
 * instead gives w 1408 from x 3408, which moves a right edge that was already
 * on the grid to 4816 and pushes it into a neighbour that was flush with it.
 * NEAREST, not rounded out, for `region-marquee.ts`'s stated reason (a region
 * edge is a coordinate in continuous world pixels, not a cell).
 */
export function fitRectToGrid(rect: RegionRect, snap: number = REGION_SNAP_PX): RegionRect {
  const x0 = snapWorld(rect.x, snap);
  const y0 = snapWorld(rect.y, snap);
  let x1 = snapWorld(rect.x + rect.w, snap);
  let y1 = snapWorld(rect.y + rect.h, snap);
  if (x1 - x0 < snap) x1 = x0 + snap;
  if (y1 - y0 < snap) y1 = y0 + snap;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function sameRect(a: RegionRect, b: RegionRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/**
 * Every rectangle of `regionId`, in document order. Empty when the id names no
 * region, which the panel renders as "nothing selected" one level up.
 */
export function regionRectRows(
  doc: RegionsDocument, regionId: string, act: ActExtent,
): RegionRectRow[] {
  const pieces: RegionPiece[] = doc.regions.map((r) => ({ id: r.id, rect: r.rect }));
  const others = new Map<number, Set<string>>();
  for (const o of disjointness(pieces).overlaps) {
    if (o.idA === o.idB) continue;
    if (o.idA === regionId) {
      if (!others.has(o.indexA)) others.set(o.indexA, new Set());
      others.get(o.indexA)!.add(o.idB);
    }
    if (o.idB === regionId) {
      if (!others.has(o.indexB)) others.set(o.indexB, new Set());
      others.get(o.indexB)!.add(o.idA);
    }
  }
  const rows: RegionRectRow[] = [];
  doc.regions.forEach((r, entryIndex) => {
    if (r.id !== regionId) return;
    const fit = fitRectToGrid(r.rect);
    rows.push({
      n: rows.length + 1,
      entryIndex,
      rect: { ...r.rect },
      fitted: sameRect(fit, r.rect) ? null : fit,
      findings: regionRectFindings(r, act),
      overlaps: [...(others.get(entryIndex) ?? [])],
    });
  });
  return rows;
}

/** A panel door's result: a command, nothing to do, or the layer's reason. */
export type RegionRectOutcome =
  | { kind: 'command'; command: SetRegionsCommand; removedIds: string[]; trimmedIds: string[] }
  | { kind: 'none' }
  | { kind: 'refused'; reason: string };

function commandOf(
  doc: RegionsDocument, next: RegionsDocument, description: string,
): SetRegionsCommand {
  return {
    type: 'set-regions',
    description,
    // Act-ambient, like every other whole-document regions command.
    sectionIndex: -1,
    oldDocument: cloneRegionsDocument(doc),
    newDocument: next,
  };
}

/** `#n` of the entry at `entryIndex` among its region's entries (1-based). */
function ordinalOf(doc: RegionsDocument, entryIndex: number): number {
  const id = doc.regions[entryIndex].id;
  let n = 0;
  for (let i = 0; i <= entryIndex; i += 1) if (doc.regions[i].id === id) n += 1;
  return n;
}

/**
 * One typed number, written into THE ENTRY AT `entryIndex` and no other.
 *
 * Null when nothing would change (a `<select>`-style re-fire, or the same
 * number) and when the index names no entry: no undo step for a no-op.
 * Carves nothing — see the file header, door 1.
 */
export function regionRectFieldCommand(
  doc: RegionsDocument, entryIndex: number, key: keyof RegionRect, value: number,
): SetRegionsCommand | null {
  const entry = doc.regions[entryIndex];
  if (entry === undefined) return null;
  if (entry.rect[key] === value) return null;
  const next = cloneRegionsDocument(doc);
  next.regions[entryIndex].rect = { ...next.regions[entryIndex].rect, [key]: value };
  return commandOf(doc, next,
    `Set ${entry.id} rect #${ordinalOf(doc, entryIndex)} ${key}`);
}

function gestureOutcome(
  doc: RegionsDocument, gesture: RegionGesture, description: string,
): RegionRectOutcome {
  const out = applyRegionGestureToDocument(doc, gesture);
  if (!out.ok) return { kind: 'refused', reason: out.reason };
  return {
    kind: 'command',
    command: commandOf(doc, out.document, description),
    removedIds: out.removedIds,
    trimmedIds: out.trimmedIds,
  };
}

/**
 * [Fit to 16] on the entry at `entryIndex`, as a RESIZE through the gesture
 * layer (door 2): the fitted rectangle carves whatever it now lands on.
 */
export function regionRectFitOutcome(doc: RegionsDocument, entryIndex: number): RegionRectOutcome {
  const entry = doc.regions[entryIndex];
  if (entry === undefined) return { kind: 'none' };
  const fit = fitRectToGrid(entry.rect);
  if (sameRect(fit, entry.rect)) return { kind: 'none' };
  return gestureOutcome(doc, { kind: 'resize', pieceIndex: entryIndex, rect: fit },
    `Fit ${entry.id} rect #${ordinalOf(doc, entryIndex)} to ${REGION_SNAP_PX}`);
}

/**
 * [Delete] on the entry at `entryIndex` (door 3, §3.2's last row). Its area
 * becomes UNASSIGNED, which the status line then names; a region whose last
 * rectangle this was is removed, and `removedIds` says so.
 */
export function regionRectDeleteOutcome(
  doc: RegionsDocument, entryIndex: number,
): RegionRectOutcome {
  const entry = doc.regions[entryIndex];
  if (entry === undefined) return { kind: 'none' };
  return gestureOutcome(doc, { kind: 'delete', pieceIndex: entryIndex },
    `Delete ${entry.id} rect #${ordinalOf(doc, entryIndex)}`);
}

/**
 * The sentence for a gesture that removed whole regions. ONE composition for
 * both doors that can remove one (the map drag and the panel's Delete), so the
 * two cannot come to say different things about the same event.
 */
export function regionsRemovedSentence(ids: readonly string[]): string {
  return `${ids.join(', ')} had no rectangle left and ${ids.length === 1 ? 'was' : 'were'} `
    + 'removed. Ctrl+Z undoes the whole gesture.';
}
