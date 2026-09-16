// THE WORLD-SPACE REGION MARQUEE — editor spec §3.2, step 8's first half.
//
// What this file can prove: snapping, what a press means, and what one gesture
// does to the set and to the document. What it CANNOT see is a canvas or a
// mouse — that one drag produces exactly one `set-regions` command in the
// running app is parcel 8B's CDP harness, in the foreground, not here.
//
// Numbers are derived from the module's own constants wherever one exists. The
// two exceptions are `REGION_SNAP_PX` and `REGION_SNAP_FINE_PX` themselves,
// which are locked against the SPEC's sentence ("base snap is 16 px, Ctrl
// inverts to 8 px", §3.2) because a constant that only ever agrees with itself
// is not pinned to anything.

import { describe, it, expect } from 'vitest';
import {
  REGION_GRAB_PX,
  REGION_SNAP_FINE_PX,
  REGION_SNAP_PX,
  applyRegionGesture,
  applyRegionGestureToDocument,
  effectiveRegionSnap,
  moveRegionRect,
  regionEdgeAt,
  regionPieces,
  regionPressAt,
  resizeRegionRect,
  snapRegionRect,
  snapWorld,
} from '../region-marquee';
import { coverage, regionRects, type RegionPiece } from '../region-geometry';
import type { RegionsDocument } from '../../formats/regions/document';

const S = REGION_SNAP_PX;
const F = REGION_SNAP_FINE_PX;

const piece = (id: string, x: number, y: number, w: number, h: number): RegionPiece =>
  ({ id, rect: { x, y, w, h } });

/** An act split left/right, fully covered, which is the shape the build accepts. */
const ACT = { x: 0, y: 0, w: 64 * S, h: 32 * S };
const COVERED: RegionPiece[] = [
  piece('west', 0, 0, ACT.w / 2, ACT.h),
  piece('east', ACT.w / 2, 0, ACT.w / 2, ACT.h),
];

const doc = (pieces: readonly RegionPiece[]): RegionsDocument => ({
  schema: 1,
  act: 'ojz_act1',
  regions: pieces.map((p) => ({
    id: p.id, rect: { ...p.rect }, preset: `OJZ_${p.id}`, name: p.id,
  })),
});

describe('the snap (spec §3.2)', () => {
  it('is 16 world px, and Ctrl inverts it to 8', () => {
    expect(REGION_SNAP_PX).toBe(16);
    expect(REGION_SNAP_FINE_PX).toBe(8);
    expect(effectiveRegionSnap(false)).toBe(REGION_SNAP_PX);
    expect(effectiveRegionSnap(true)).toBe(REGION_SNAP_FINE_PX);
  });

  it('puts every corner of a drawn rect on the grid in force', () => {
    for (const snap of [S, F]) {
      const r = snapRegionRect({ x: 101, y: 203 }, { x: 507, y: 411 }, snap);
      for (const v of [r.x, r.y, r.x + r.w, r.y + r.h]) expect(v % snap).toBe(0);
    }
  });

  it('normalises: the same rect whichever way the drag ran', () => {
    const a = { x: 3 * S + 5, y: 9 * S - 2 };
    const b = { x: 11 * S - 1, y: 2 * S + 3 };
    expect(snapRegionRect(a, b, S)).toEqual(snapRegionRect(b, a, S));
    const r = snapRegionRect(a, b, S);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });

  it('never produces an empty rectangle: a dead click is one snap cell', () => {
    const r = snapRegionRect({ x: 4 * S, y: 4 * S }, { x: 4 * S, y: 4 * S }, S);
    expect(r).toEqual({ x: 4 * S, y: 4 * S, w: S, h: S });
  });

  it('the fine snap reaches edges the base snap cannot', () => {
    const at = { x: F, y: F };
    expect(snapRegionRect({ x: 0, y: 0 }, at, F).w).toBe(F);
    // The same drag on the base grid rounds both corners to 0 and is floored to
    // one base cell, so the F-px edge is unreachable there. That is what the
    // inverting modifier is for.
    expect(snapRegionRect({ x: 0, y: 0 }, at, S).w).toBe(S);
  });

  it('snaps to the NEAREST multiple, not outward', () => {
    expect(snapWorld(S * 4 + 1, S)).toBe(S * 4);
    expect(snapWorld(S * 4 - 1, S)).toBe(S * 4);
  });
});

describe('moving a rectangle', () => {
  it('snaps the DELTA, so an off-grid rect keeps its offset', () => {
    const odd = { x: 3400, y: 7, w: 100, h: 50 };
    const moved = moveRegionRect(odd, { x: 0, y: 0 }, { x: S + 1, y: 0 }, S);
    expect(moved).toEqual({ x: 3400 + S, y: 7, w: 100, h: 50 });
  });

  it('never changes the rectangle`s size', () => {
    const r = { x: 5 * S, y: 5 * S, w: 7 * S, h: 3 * S };
    const moved = moveRegionRect(r, { x: 0, y: 0 }, { x: 999, y: -450 }, S);
    expect(moved.w).toBe(r.w);
    expect(moved.h).toBe(r.h);
  });
});

describe('resizing a rectangle', () => {
  const r = { x: 4 * S, y: 4 * S, w: 8 * S, h: 8 * S };

  it('moves only the grabbed edge', () => {
    const e = resizeRegionRect(r, 'e', { x: 20 * S, y: 999 }, S);
    expect(e.x).toBe(r.x);
    expect(e.y).toBe(r.y);
    expect(e.h).toBe(r.h);
    expect(e.x + e.w).toBe(20 * S);
  });

  it('moves both edges of a corner', () => {
    const nw = resizeRegionRect(r, 'nw', { x: S, y: 2 * S }, S);
    expect(nw.x).toBe(S);
    expect(nw.y).toBe(2 * S);
    expect(nw.x + nw.w).toBe(r.x + r.w);
    expect(nw.y + nw.h).toBe(r.y + r.h);
  });

  it('flips rather than inverting when an edge is dragged past its opposite', () => {
    const w = resizeRegionRect(r, 'w', { x: 20 * S, y: 0 }, S);
    expect(w.w).toBeGreaterThan(0);
    expect(w.x).toBe(r.x + r.w);
    expect(w.x + w.w).toBe(20 * S);
  });

  it('never collapses below one snap cell', () => {
    const collapsed = resizeRegionRect(r, 'se', { x: r.x, y: r.y }, S);
    expect(collapsed.w).toBe(S);
    expect(collapsed.h).toBe(S);
  });
});

describe('regionEdgeAt', () => {
  const r = { x: 100, y: 100, w: 200, h: 200 };
  it('grabs each side and each corner within the band', () => {
    expect(regionEdgeAt(r, 100, 200, 6)).toBe('w');
    expect(regionEdgeAt(r, 300, 200, 6)).toBe('e');
    expect(regionEdgeAt(r, 200, 100, 6)).toBe('n');
    expect(regionEdgeAt(r, 200, 300, 6)).toBe('s');
    expect(regionEdgeAt(r, 100, 100, 6)).toBe('nw');
    expect(regionEdgeAt(r, 300, 300, 6)).toBe('se');
  });
  it('is a frame, not four infinite strips: far above the top edge is no grab', () => {
    expect(regionEdgeAt(r, 200, 100 - 7, 6)).toBe(null);
    expect(regionEdgeAt(r, 100, -5000, 6)).toBe(null);
  });
  it('does not grab the interior', () => {
    expect(regionEdgeAt(r, 200, 200, 6)).toBe(null);
  });
});

describe('what a press means', () => {
  it('inside the SELECTED region is a move of that rectangle', () => {
    const p = regionPressAt(COVERED, ACT.w / 4, ACT.h / 2, 'west', 1);
    expect(p.kind).toBe('move');
    expect(p.pieceIndex).toBe(0);
    expect(p.id).toBe('west');
  });

  it('on the SELECTED region`s edge is a resize, naming the handle', () => {
    const p = regionPressAt(COVERED, 0, ACT.h / 2, 'west', 1);
    expect(p.kind).toBe('resize');
    expect(p.edge).toBe('w');
  });

  it('over ANOTHER region is a draw, and it says whose paint it will carve', () => {
    const p = regionPressAt(COVERED, ACT.w * 3 / 4, ACT.h / 2, 'west', 1);
    expect(p.kind).toBe('draw');
    expect(p.overId).toBe('east');
  });

  it('on unassigned ground is a draw over nobody', () => {
    const p = regionPressAt([piece('a', 0, 0, S, S)], 40 * S, 40 * S, 'a', 1);
    expect(p.kind).toBe('draw');
    expect(p.overId).toBe(null);
  });

  it('with nothing selected is always a draw, even inside a rectangle', () => {
    const p = regionPressAt(COVERED, ACT.w / 4, ACT.h / 2, null, 1);
    expect(p.kind).toBe('draw');
    expect(p.overId).toBe('west');
  });

  // The resolution of §3.2's gesture table against the Q1 ruling, asserted
  // rather than left in a comment: `flattenRegionsDocument` refuses any act with
  // a hole, so a SHIPPABLE document has no unassigned ground. A press rule that
  // read every press inside a rectangle as a move would leave the ruled primary
  // gesture with nowhere at all to start.
  it('is reachable on a FULLY COVERED act: draw is not confined to holes', () => {
    expect(coverage(ACT, COVERED).unassignedArea).toBe(0);
    let draws = 0;
    for (let x = S; x < ACT.w; x += ACT.w / 8) {
      for (let y = S; y < ACT.h; y += ACT.h / 8) {
        if (regionPressAt(COVERED, x, y, 'west', 1).kind === 'draw') draws += 1;
      }
    }
    expect(draws).toBeGreaterThan(0);
  });

  it('the grab band is SCREEN px: the same world offset misses as you zoom in', () => {
    const inside = REGION_GRAB_PX - 0.5;
    expect(regionPressAt(COVERED, inside, ACT.h / 2, 'west', 1).kind).toBe('resize');
    // At zoom 4 that world offset is 4x the fingertip away on screen.
    expect(regionPressAt(COVERED, inside, ACT.h / 2, 'west', 4).kind).toBe('move');
    // And the band scales with it: a quarter of the offset grabs again.
    expect(regionPressAt(COVERED, inside / 4, ACT.h / 2, 'west', 4).kind).toBe('resize');
  });
});

describe('one gesture, one new set', () => {
  it('a plain draw CARVES what it lands on, with no modifier at all', () => {
    const r = applyRegionGesture(COVERED, {
      kind: 'draw', id: 'west', rect: { x: ACT.w / 2, y: 0, w: 4 * S, h: 4 * S },
    });
    expect(r.trimmedIds).toContain('east');
    expect(coverage(ACT, r.pieces).unassignedArea).toBe(0);
    // east lost exactly the drawn rectangle and nothing else.
    const eastArea = regionRects(r.pieces, 'east').reduce((n, q) => n + q.w * q.h, 0);
    expect(eastArea).toBe(ACT.w / 2 * ACT.h - 4 * S * 4 * S);
  });

  it('a draw that covers a region entirely reports it as removed', () => {
    const r = applyRegionGesture(COVERED, { kind: 'draw', id: 'west', rect: ACT });
    expect(r.removedIds).toEqual(['east']);
    expect(regionRects(r.pieces, 'east')).toEqual([]);
  });

  it('a move does not carve the rectangle out of its own old position', () => {
    const start: RegionPiece[] = [piece('a', 0, 0, 4 * S, 4 * S)];
    const r = applyRegionGesture(start, {
      kind: 'move', pieceIndex: 0, rect: { x: 2 * S, y: 0, w: 4 * S, h: 4 * S },
    });
    expect(r.pieces).toEqual([piece('a', 2 * S, 0, 4 * S, 4 * S)]);
    expect(r.removedIds).toEqual([]);
  });

  it('a resize that shrinks gives the area back to UNASSIGNED, not to a neighbour', () => {
    const before = coverage(ACT, COVERED);
    const r = applyRegionGesture(COVERED, {
      kind: 'resize', pieceIndex: 0, rect: { x: 0, y: 0, w: ACT.w / 4, h: ACT.h },
    });
    const after = coverage(ACT, r.pieces);
    expect(before.unassignedArea).toBe(0);
    expect(after.unassignedArea).toBe(ACT.w / 4 * ACT.h);
    // east did not grow into it.
    expect(regionRects(r.pieces, 'east')).toEqual([{ x: ACT.w / 2, y: 0, w: ACT.w / 2, h: ACT.h }]);
  });

  it('deleting a rectangle keeps a region that has another one', () => {
    const start = [piece('a', 0, 0, S, S), piece('a', 8 * S, 0, S, S)];
    const r = applyRegionGesture(start, { kind: 'delete', pieceIndex: 0 });
    expect(r.removedIds).toEqual([]);
    expect(regionRects(r.pieces, 'a')).toEqual([{ x: 8 * S, y: 0, w: S, h: S }]);
  });

  it('deleting a region`s LAST rectangle removes the region with it', () => {
    const start = [piece('a', 0, 0, S, S)];
    const r = applyRegionGesture(start, { kind: 'delete', pieceIndex: 0 });
    expect(r.removedIds).toEqual(['a']);
    expect(r.pieces).toEqual([]);
  });

  it('coalesces a region`s own pieces without changing its area', () => {
    const start = [piece('a', 0, 0, S, S), piece('a', S, 0, S, S)];
    const r = applyRegionGesture(start, { kind: 'draw', id: 'a', rect: { x: 2 * S, y: 0, w: S, h: S } });
    expect(regionRects(r.pieces, 'a')).toEqual([{ x: 0, y: 0, w: 3 * S, h: S }]);
  });

  it('leaves the set alone when the gesture names a rectangle that is not there', () => {
    const r = applyRegionGesture(COVERED, { kind: 'delete', pieceIndex: 9 });
    expect(r.pieces).toEqual(COVERED);
    expect(r.removedIds).toEqual([]);
  });
});

describe('one gesture, one new document', () => {
  it('returns a new document and does not touch the old one', () => {
    const before = doc(COVERED);
    const snapshot = JSON.parse(JSON.stringify(before)) as RegionsDocument;
    const out = applyRegionGestureToDocument(before, {
      kind: 'draw', id: 'west', rect: { x: ACT.w / 2, y: 0, w: 4 * S, h: 4 * S },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(before).toEqual(snapshot);
    expect(out.document).not.toBe(before);
  });

  it('a region with several rectangles is several entries, with IDENTICAL bindings', () => {
    const before = doc(COVERED);
    // A rectangle through the middle of east splits it into two pieces.
    const out = applyRegionGestureToDocument(before, {
      kind: 'draw', id: 'west', rect: { x: ACT.w / 2, y: ACT.h / 3, w: ACT.w / 2, h: ACT.h / 3 },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const east = out.document.regions.filter((r) => r.id === 'east');
    expect(east.length).toBe(2);
    const bindings = east.map((r) => JSON.stringify({ ...r, rect: null }));
    expect(new Set(bindings).size).toBe(1);
  });

  it('drops the entry of a region the gesture emptied', () => {
    const out = applyRegionGestureToDocument(doc(COVERED), { kind: 'draw', id: 'west', rect: ACT });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.document.regions.map((r) => r.id)).toEqual(['west']);
    expect(out.removedIds).toEqual(['east']);
  });

  it('refuses a draw for an id the act does not have, and says why', () => {
    const out = applyRegionGestureToDocument(doc(COVERED), {
      kind: 'draw', id: 'fresh', rect: { x: 0, y: 0, w: S, h: S },
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.reason).toContain('preset');
  });

  it('accepts that same draw when a template supplies the preset', () => {
    const out = applyRegionGestureToDocument(
      doc(COVERED),
      { kind: 'draw', id: 'fresh', rect: { x: 0, y: 0, w: S, h: S } },
      { id: 'fresh', rect: { x: 0, y: 0, w: S, h: S }, preset: 'OJZ_Preset_Plain' },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const fresh = out.document.regions.filter((r) => r.id === 'fresh');
    expect(fresh.length).toBe(1);
    expect(fresh[0].preset).toBe('OJZ_Preset_Plain');
    // Appended last, and the act still has the two it started with.
    expect(out.document.regions[out.document.regions.length - 1].id).toBe('fresh');
  });

  it('projects the document to pieces in document order', () => {
    expect(regionPieces(doc(COVERED))).toEqual(COVERED);
  });
});
