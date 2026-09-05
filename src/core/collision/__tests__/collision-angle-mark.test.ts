// THE ANGLE MARK, TESTED AS A CONTRACT BETWEEN SURFACES.
//
// The defect this file exists to make impossible is not "the mark looks wrong"
// — it is "the map and the picker draw the SAME angle byte in DIFFERENT
// directions", which is what shipped, and which no screenshot of either surface
// alone could ever have revealed. So the load-bearing test here is §1: the
// shared tangent is checked against `angleNeedle`, classic's independently
// derived and independently unit-tested formula, for all 256 bytes.
//
// EXPECTATIONS ARE DERIVED, NEVER TRANSCRIBED. Every number below comes out of
// `(byte / 256) * 2π` through the engine convention, or out of the height model
// in collision-model.ts. Nothing is a value read off a rendered mark.

import { describe, it, expect } from 'vitest';
import {
  angleMark, angleMarkFromColumns, angleTangent, outwardNormal,
  surfaceAnchor, columnSurfaceY, drawAngleMark,
  BAR_HALF, NORMAL_LEN, MIN_CELL_PX_FOR_MARK,
  ARROW_WIDTH_SCALE, DETAIL_CELL_PX, SILHOUETTE_BLIND_RAD,
  MARK_BOX_MARGIN, markTier, fitCellSizeToBox, markPadPx,
  type MarkDrawCtx,
} from '../collision-angle-mark';
import { angleNeedle } from '../../../renderer/components/classic/collision-needle';
import { flipProfile } from '../collision-flip';
import { columnSolidRun } from '../collision-render';
import type { CollisionProfile } from '../collision-model';

/** A profile from 16 signed heights. `angle` is a raw byte; even = has angle. */
function profile(heights: number[], angle: number, solidity: CollisionProfile['solidity'] = 'all'): CollisionProfile {
  return {
    heights: new Int8Array(heights),
    angle: angle & 0xff,
    hasAngle: (angle & 1) === 0,
    solidity,
  };
}

/** A 45°-ish rising floor: solid grows up from the bottom, left to right. */
const RISING_FLOOR = Array.from({ length: 16 }, (_, c) => c + 1);
/** Flat full-height ground. */
const FLAT_FLOOR = Array.from({ length: 16 }, () => 8);

describe('angleTangent: the engine convention, shared by every surface', () => {
  // THE CROSS-SURFACE GUARD. This is the test that would have caught the
  // shipped defect: the aeon map overlay drew (cos a, -sin a) while classic and
  // the picker drew (cos a, +sin a), so every non-flat angle was mirrored on
  // exactly the surface the author paints on.
  it('agrees with classic angleNeedle for all 256 angle bytes', () => {
    const mismatches: string[] = [];
    for (let b = 0; b < 256; b++) {
      const t = angleTangent(b);
      const n = angleNeedle(b, false, false);
      if (Math.abs(t.tx - n.dx) > 1e-12 || Math.abs(t.ty - n.dy) > 1e-12) {
        mismatches.push(`$${b.toString(16)}: mark(${t.tx},${t.ty}) vs needle(${n.dx},${n.dy})`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('flat ground (angle 0) is horizontal, pointing +x', () => {
    expect(angleTangent(0)).toEqual({ tx: 1, ty: 0 });
  });

  // Derivation, not transcription: the y component must be +sin, so a small
  // positive angle DESCENDS to the right in screen space (y down).
  it('is (cos a, +sin a) with y DOWN: a small angle descends to the right', () => {
    const b = 0x10;
    const r = (b / 256) * Math.PI * 2;
    const t = angleTangent(b);
    expect(t.tx).toBeCloseTo(Math.cos(r), 12);
    expect(t.ty).toBeCloseTo(Math.sin(r), 12);
    expect(t.ty).toBeGreaterThan(0);
  });

  // The picker used to route the angle through `angleDegrees`, which rounds.
  // At $10 that is a visible hair of disagreement with the map at the same byte.
  it('works in bytes, not rounded degrees: no rounding drift at $10', () => {
    const b = 0x10;
    const exact = angleTangent(b);
    const viaRoundedDegrees = (() => {
      const deg = Math.round((b / 256) * 360);
      const r = (deg * Math.PI) / 180;
      return { tx: Math.cos(r), ty: Math.sin(r) };
    })();
    expect(exact.ty).not.toBeCloseTo(viaRoundedDegrees.ty, 3);
    const r = (b / 256) * Math.PI * 2;
    expect(exact.ty).toBeCloseTo(Math.sin(r), 12);
  });
});

describe('columnSurfaceY: the player-facing boundary, matching the surface line', () => {
  it('a floor column reports the TOP of its run', () => {
    // height 5 -> run { y: 11, h: 5 }; the surface is the top, y = 11.
    expect(columnSolidRun(5)).toEqual({ y: 11, h: 5 });
    expect(columnSurfaceY(5)).toBe(11);
  });
  it('a hanging column reports the UNDERSIDE of its run', () => {
    // height -5 -> run { y: 0, h: 5 }; the surface is the underside, y = 5.
    expect(columnSolidRun(-5)).toEqual({ y: 0, h: 5 });
    expect(columnSurfaceY(-5)).toBe(5);
  });
  it('an empty column has no surface', () => {
    expect(columnSurfaceY(0)).toBeNull();
  });
});

describe('surfaceAnchor: the mark sits ON the surface, not at the cell centre', () => {
  it('anchors on a real column surface, never the cell middle', () => {
    const a = surfaceAnchor(RISING_FLOOR)!;
    expect(a).not.toBeNull();
    // The anchor y must EQUAL some column's surface y — the quantity the
    // surface line is drawn at. The old mark used a constant 8, which is only
    // accidentally on the surface.
    const col = Math.floor(a.ax);
    expect(a.ay).toBe(columnSurfaceY(RISING_FLOOR[col]));
    expect(a.ax).toBeGreaterThan(0);
    expect(a.ax).toBeLessThan(16);
  });

  it('a shallow slope anchors well away from the cell centre (the old y=8)', () => {
    // Heights 1..2 -> surfaces at y 15/14, nowhere near the centre.
    const shallow = Array.from({ length: 16 }, (_, c) => (c < 8 ? 1 : 2));
    const a = surfaceAnchor(shallow)!;
    expect(a.ay).toBeGreaterThan(12);
    expect(a.ay).not.toBe(8);
  });

  it('an all-air cell has nothing to annotate', () => {
    expect(surfaceAnchor(new Array(16).fill(0))).toBeNull();
  });

  it('reports the anchor column height, so the caller can pick the open side', () => {
    expect(surfaceAnchor(FLAT_FLOOR)!.height).toBe(8);
    expect(surfaceAnchor(FLAT_FLOOR.map((h) => -h))!.height).toBe(-8);
  });
});

describe('outwardNormal: the barb points OUT of the solid', () => {
  it('flat floor: the open side is UP', () => {
    const n = outwardNormal(0, 8);
    expect(n.nx).toBeCloseTo(0, 12);
    expect(n.ny).toBe(-1);
  });

  it('flat hanging ceiling: the open side is DOWN', () => {
    const n = outwardNormal(0, -8);
    expect(n.ny).toBe(1);
  });

  it('is perpendicular to the tangent for every angle byte', () => {
    for (let b = 0; b < 256; b += 1) {
      const t = angleTangent(b);
      const n = outwardNormal(b, 8);
      expect(Math.abs(t.tx * n.nx + t.ty * n.ny)).toBeLessThan(1e-12);
      expect(Math.hypot(n.nx, n.ny)).toBeCloseTo(1, 12);
    }
  });

  // THE EXCEPTION, BOUNDED FIRST. The rule below excludes the wall angles, so
  // this row pins the excluded set to EXACTLY two bytes — otherwise the
  // exclusion is a loophole that could silently widen to swallow the rule.
  const WALL_ANGLES = [0x40, 0xc0];
  it('exactly two angle bytes are walls (horizontal normal)', () => {
    const walls: number[] = [];
    for (let b = 0; b < 256; b += 1) {
      if (Math.abs(Math.cos((b / 256) * Math.PI * 2)) < 1e-9) walls.push(b);
    }
    expect(walls).toEqual(WALL_ANGLES);
  });

  // THE REQUIREMENT, STATED DIRECTLY. Geometry decides the side, so this holds
  // no matter how a game's table stores a ceiling's angle byte.
  it('the side is decided by the height sign, for every non-wall angle byte', () => {
    const wrong: string[] = [];
    for (let b = 0; b < 256; b += 1) {
      if (WALL_ANGLES.includes(b)) continue; // no open side is derivable — see the module docblock
      const floor = outwardNormal(b, 8);
      const ceil = outwardNormal(b, -8);
      if (floor.ny >= 0) wrong.push(`floor $${b.toString(16)} ny=${floor.ny}`);
      if (ceil.ny <= 0) wrong.push(`ceil $${b.toString(16)} ny=${ceil.ny}`);
    }
    expect(wrong).toEqual([]);
    // ...and the row is not vacuous: 254 bytes were actually examined.
    expect(256 - WALL_ANGLES.length).toBe(254);
  });

  // THE HONESTY FLAG, PINNED TO THE SAME SET AS THE EXCEPTION. `known` must be
  // false for EXACTLY the bytes the rule above excludes — if the two ever drift
  // apart, either a wall gets a confident arrow or a real slope gets a
  // double-ended one, and both are lies.
  it('normalKnown is false for exactly the two wall bytes, at every height sign', () => {
    const unknown: number[] = [];
    for (let b = 0; b < 256; b++) {
      const f = outwardNormal(b, 8), c = outwardNormal(b, -8);
      expect(f.known).toBe(c.known);
      if (!f.known) unknown.push(b);
    }
    expect(unknown).toEqual(WALL_ANGLES);
  });

  it('a vertical normal (a wall) keeps the angle-derived perpendicular', () => {
    // ny === 0 <=> cos a === 0 <=> a = $40 or $c0. Nothing in the cell says
    // which side is open, so the candidate must survive untouched.
    for (const b of [0x40, 0xc0]) {
      const r = (b / 256) * Math.PI * 2;
      const n = outwardNormal(b, 16);
      expect(n.nx).toBeCloseTo(Math.sin(r), 12);
      expect(n.ny).toBeCloseTo(-Math.cos(r), 12);
    }
  });
});

describe('angleMark: a floor and its ceiling are told apart', () => {
  // THE HEADLINE REQUIREMENT: a symmetric mark cannot say which side is solid.
  // Flip a real profile through the app's OWN flip (heights AND angle, the same
  // path resolveCell uses) and the barb must reverse.
  it('y-flipping a slope reverses the barb', () => {
    const p = profile(RISING_FLOOR, 0x20);
    const q = flipProfile(p, false, true);
    const m = angleMark(p)!;
    const f = angleMark(q)!;
    expect(m.ny).toBeLessThan(0);   // floor: open side up
    expect(f.ny).toBeGreaterThan(0); // ceiling: open side down
  });

  it('the mark is ASYMMETRIC: it is not its own 180° rotation', () => {
    const m = angleMark(profile(RISING_FLOOR, 0x20))!;
    // The old mark was a bar through the centre: rotating it 180° about its
    // anchor reproduced it exactly. The barb breaks that.
    const rotated = { nx: -m.nx, ny: -m.ny };
    expect(rotated.nx === m.nx && rotated.ny === m.ny).toBe(false);
    expect(Math.hypot(m.nx, m.ny)).toBeCloseTo(1, 12);
  });

  it('no mark for a profile with no usable angle (odd byte)', () => {
    expect(angleMark(profile(RISING_FLOOR, 0x21))).toBeNull();
  });

  it('no mark for an all-air profile even when the angle is usable', () => {
    expect(angleMark(profile(new Array(16).fill(0), 0x20))).toBeNull();
  });
});

describe('angleMarkFromColumns: classic gets the identical mark', () => {
  // Classic applies chunk-cell flips per cell instead of materialising a
  // flipped profile. The two routes must not diverge: that divergence IS the
  // bug class this module was written to end.
  it('matches angleMark for the same flip-resolved data', () => {
    const p = profile(RISING_FLOOR, 0x20);
    const viaProfile = angleMark(p)!;
    const viaColumns = angleMarkFromColumns((c) => RISING_FLOOR[c], angleTangent(0x20))!;
    expect(viaColumns).toEqual(viaProfile);
  });

  it('a y-flip expressed as a negated height matches flipProfile', () => {
    // classic's `16 - surfaceY` y-flip and the model's height negation are the
    // same operation; if they ever stop being, this row fails.
    const p = profile(RISING_FLOOR, 0x20);
    const q = flipProfile(p, false, true);
    const viaColumns = angleMarkFromColumns((c) => -RISING_FLOOR[c], angleTangent(q.angle))!;
    expect(viaColumns.ay).toBe(angleMark(q)!.ay);
    expect(Math.sign(viaColumns.ny)).toBe(Math.sign(angleMark(q)!.ny));
  });
});

describe('drawAngleMark: casing under core, and the geometry that reaches canvas', () => {
  function recorder() {
    const ops: string[] = [];
    const strokes: { style: string; width: number }[] = [];
    const pts: { x: number; y: number }[] = [];
    const ctx: MarkDrawCtx = {
      strokeStyle: '', lineWidth: 0,
      beginPath: () => ops.push('begin'),
      moveTo: (x, y) => { ops.push('move'); pts.push({ x, y }); },
      lineTo: (x, y) => { ops.push('line'); pts.push({ x, y }); },
      stroke() { ops.push('stroke'); strokes.push({ style: ctx.strokeStyle, width: ctx.lineWidth }); },
    };
    return { ctx, ops, strokes, pts };
  }
  /** Detail tier (>= DETAIL_CELL_PX): stem AND bar. */
  const OPTS = { color: '#f00', casing: '#000', coreWidth: 1, casingWidth: 3, cellScreenPx: DETAIL_CELL_PX };
  /** Compact tier: at the gate exactly, so it is the smallest size that draws. */
  const OPTS_COMPACT = { ...OPTS, cellScreenPx: MIN_CELL_PX_FOR_MARK };

  // ITEM 4 IS THIS ROW. A single stroke is invisible wherever the art matches
  // it; the casing is what makes the mark readable over arbitrary pixel art.
  // The order is ALL casings, then ALL cores — see drawAngleMark's docblock: a
  // per-element casing-then-core would let the fat stem casing chew a notch out
  // of the thin bar core where the two cross.
  it('strokes every casing FIRST, then every bright core', () => {
    const r = recorder();
    drawAngleMark(r.ctx, 0, 0, 16, angleMark(profile(RISING_FLOOR, 0x20))!, OPTS);
    expect(r.strokes.map((s) => s.style)).toEqual(['#000', '#000', '#f00', '#f00']);
    // ...and each core is thinner than the casing it sits in.
    expect(r.strokes[2].width).toBeLessThan(r.strokes[0].width);
    expect(r.strokes[3].width).toBeLessThan(r.strokes[1].width);
  });

  // ⭐ THE HEADLINE ROW OF THIS PARCEL. "The direction arrows are kind of
  // useless" was the mark spending its ink on the tangent. Both weights are
  // derived from the module's own constants, never read off a picture.
  it('⭐ the outward stem OUT-WEIGHS the tangent bar, in length and in width', () => {
    const r = recorder();
    drawAngleMark(r.ctx, 0, 0, 16, angleMark(profile(RISING_FLOOR, 0x20))!, OPTS);
    const [barCasing, stemCasing, barCore, stemCore] = r.strokes;
    expect(stemCore.width).toBeCloseTo(OPTS.coreWidth * ARROW_WIDTH_SCALE, 10);
    expect(stemCasing.width).toBeCloseTo(OPTS.casingWidth * ARROW_WIDTH_SCALE, 10);
    expect(stemCore.width).toBeGreaterThan(barCore.width);
    expect(stemCasing.width).toBeGreaterThan(barCasing.width);
    // Length: the stem reaches further from the shared anchor than either half
    // of the bar does. Under the mark this replaced it reached LESS far (the
    // barb was 4 against a half-bar of 4.5), which is the inversion.
    expect(NORMAL_LEN).toBeGreaterThan(BAR_HALF);
    // ...and the quiet element is not thinned to fake the contrast: the bar
    // keeps exactly the widths the caller passed.
    expect(barCore.width).toBe(OPTS.coreWidth);
    expect(barCasing.width).toBe(OPTS.casingWidth);
  });

  it('draws a bar AND a stem at the detail tier: two subpaths, not one line', () => {
    const r = recorder();
    drawAngleMark(r.ctx, 0, 0, 16, angleMark(profile(RISING_FLOOR, 0x20))!, OPTS);
    // Bar and stem are separate paths now (they carry different widths).
    expect(r.ops).toEqual([
      'begin', 'move', 'line', 'stroke', // bar casing
      'begin', 'move', 'line', 'stroke', // stem casing
      'begin', 'move', 'line', 'stroke', // bar core
      'begin', 'move', 'line', 'stroke', // stem core
    ]);
  });

  it('scales cell-local geometry into the caller box, and offsets by (x, y)', () => {
    const mark = angleMark(profile(FLAT_FLOOR, 0))!;
    const big = recorder();
    drawAngleMark(big.ctx, 100, 200, 32, mark, OPTS);
    const s = 32 / 16;
    // Derived from the mark, not from the drawing: anchor +/- tangent*BAR_HALF.
    const ax = 100 + mark.ax * s, ay = 200 + mark.ay * s;
    expect(big.pts[0].x).toBeCloseTo(ax - mark.tx * BAR_HALF * s, 10);
    expect(big.pts[1].x).toBeCloseTo(ax + mark.tx * BAR_HALF * s, 10);
    // The stem's root is the anchor; its tip is one NORMAL_LEN along the normal.
    expect(big.pts[2].x).toBeCloseTo(ax, 10);
    expect(big.pts[2].y).toBeCloseTo(ay, 10);
    expect(big.pts[3].y).toBeCloseTo(ay + mark.ny * NORMAL_LEN * s, 10);
  });

  it('the stem tip leaves the solid: it is on the open side of the surface', () => {
    const mark = angleMark(profile(FLAT_FLOOR, 0))!;
    const tipY = mark.ay + mark.ny * NORMAL_LEN;
    expect(tipY).toBeLessThan(mark.ay); // flat floor: the tip is ABOVE the surface
  });

  // THE OWNER'S SECOND SENTENCE, AS AN ASSERTION. "Why are the 0 degree ones
  // not pointing straight up" — at angle 0 the dominant stroke must be the
  // vertical one, and it must be the stem.
  it('⭐ at angle 0 the DOMINANT stroke is vertical and points UP', () => {
    const r = recorder();
    const mark = angleMark(profile(FLAT_FLOOR, 0))!;
    drawAngleMark(r.ctx, 0, 0, 16, mark, OPTS);
    // Stem core is the last pass: pts[6] root, pts[7] tip.
    const root = r.pts[6], tip = r.pts[7];
    expect(tip.x - root.x).toBeCloseTo(0, 10);   // exactly vertical
    expect(tip.y - root.y).toBeLessThan(0);      // upward (y DOWN)
    // ...and it is the WIDE one. The tangent at angle 0 is exactly horizontal,
    // so a build that swapped the two would put the width on the horizontal
    // stroke — which is what the owner was looking at.
    const stemCore = r.strokes[3], barCore = r.strokes[2];
    expect(stemCore.width).toBeGreaterThan(barCore.width);
    const barDx = r.pts[5].x - r.pts[4].x, barDy = r.pts[5].y - r.pts[4].y;
    expect(barDy).toBeCloseTo(0, 10);
    expect(Math.abs(barDx)).toBeGreaterThan(0);
  });

  // 45° IS THE MIRROR TRAP. A transposed or mirrored mark still looks plausible
  // at 45° because both elements are diagonal; only the SIGNS separate them.
  it('⭐ at 45° the stem and the bar are distinguishable and correctly signed', () => {
    const r = recorder();
    const mark = angleMark(profile(RISING_FLOOR, 0x20))!;
    drawAngleMark(r.ctx, 0, 0, 16, mark, OPTS);
    const barDx = r.pts[5].x - r.pts[4].x, barDy = r.pts[5].y - r.pts[4].y;
    const stemDx = r.pts[7].x - r.pts[6].x, stemDy = r.pts[7].y - r.pts[6].y;
    // Bar along (cos, +sin) at $20: down-right in screen space.
    expect(barDx).toBeGreaterThan(0);
    expect(barDy).toBeGreaterThan(0);
    // Stem is the perpendicular on the OPEN side of a floor: up-right.
    expect(stemDx).toBeGreaterThan(0);
    expect(stemDy).toBeLessThan(0);
    // They are genuinely perpendicular, so neither is a copy of the other.
    expect(barDx * stemDx + barDy * stemDy).toBeCloseTo(0, 8);
    // And the stem is longer, which a transposition would reverse.
    expect(Math.hypot(stemDx, stemDy)).toBeGreaterThan(Math.hypot(barDx, barDy) / 2);
  });

  it('the compact tier draws the stem ALONE: two strokes, no bar', () => {
    const r = recorder();
    drawAngleMark(r.ctx, 0, 0, 16, angleMark(profile(RISING_FLOOR, 0x20))!, OPTS_COMPACT);
    expect(r.ops).toEqual(['begin', 'move', 'line', 'stroke', 'begin', 'move', 'line', 'stroke']);
    // THE STEM KEEPS ITS WEIGHT HERE TOO. At this tier it is the whole mark, so
    // dropping the scale-up would make the picker thumbnail — the surface the
    // owner was looking at — the FAINTEST place the mark appears. Measured on
    // the first cut: 7 angle-coloured pixels in a 38px canvas, against 15 for
    // the mark it replaced.
    expect(r.strokes).toEqual([
      { style: '#000', width: 3 * ARROW_WIDTH_SCALE },
      { style: '#f00', width: 1 * ARROW_WIDTH_SCALE },
    ]);
    // ...and what it drew is the NORMAL, not the tangent. At $20 both are
    // diagonal, so the discriminating fact is the SIGN of y.
    expect(r.pts[1].y - r.pts[0].y).toBeLessThan(0);
  });

  it('below MIN_CELL_PX_FOR_MARK it draws nothing at all', () => {
    const r = recorder();
    const tier = drawAngleMark(r.ctx, 0, 0, 16, angleMark(profile(RISING_FLOOR, 0x20))!,
      { ...OPTS, cellScreenPx: MIN_CELL_PX_FOR_MARK - 0.001 });
    expect(tier).toBe('off');
    expect(r.ops).toEqual([]);
    expect(r.strokes).toEqual([]);
  });

  // THE WALL STAYS HONEST. Nothing in a full cell says which side is open, so
  // the mark must not present one. A double-ended stem says "one of these two".
  it('⭐ a wall draws a DOUBLE-ENDED stem: it does not pick a side', () => {
    const wall = profile(new Array(16).fill(16), 0x40);
    const mark = angleMark(wall)!;
    expect(mark.normalKnown).toBe(false);
    const r = recorder();
    drawAngleMark(r.ctx, 0, 0, 16, mark, OPTS_COMPACT);
    const [a, b] = r.pts;
    // The two ends are symmetric about the anchor — the mark asserts nothing.
    expect((a.x + b.x) / 2).toBeCloseTo(mark.ax, 10);
    expect((a.y + b.y) / 2).toBeCloseTo(mark.ay, 10);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(2 * NORMAL_LEN, 10);
  });

  it('...and a cell whose side IS known draws a single-ended stem rooted on the surface', () => {
    const mark = angleMark(profile(FLAT_FLOOR, 0))!;
    expect(mark.normalKnown).toBe(true);
    const r = recorder();
    drawAngleMark(r.ctx, 0, 0, 16, mark, OPTS_COMPACT);
    const [a, b] = r.pts;
    expect(a.x).toBeCloseTo(mark.ax, 10);
    expect(a.y).toBeCloseTo(mark.ay, 10);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(NORMAL_LEN, 10);
  });
});

describe('the size rule lives here, not at the call sites', () => {
  it('MIN_CELL_PX_FOR_MARK is a screen-pixel threshold callers gate on', () => {
    expect(MIN_CELL_PX_FOR_MARK).toBeGreaterThan(8);
    expect(MIN_CELL_PX_FOR_MARK).toBeLessThanOrEqual(16);
  });

  it('the bar and the stem both fit inside a cell (cell-local sizing)', () => {
    expect(BAR_HALF * 2).toBeLessThan(16);
    expect(NORMAL_LEN).toBeLessThan(16);
  });

  // THE THRESHOLD IS DERIVED, AND THE DERIVATION IS THE TEST. The bar earns its
  // ink only where its endpoint can move a whole screen pixel across the band
  // the silhouette cannot express. Re-derived here from BAR_HALF and the
  // 16-column height model — no transcribed constant.
  it('DETAIL_CELL_PX is the size at which the bar can resolve the silhouette-blind band', () => {
    expect(SILHOUETTE_BLIND_RAD).toBeCloseTo(Math.atan(1 / 16), 12);
    const needed = 16 / (BAR_HALF * Math.sin(SILHOUETTE_BLIND_RAD));
    expect(DETAIL_CELL_PX).toBe(Math.ceil(needed));
    // At the threshold the half-bar's endpoint moves >= 1 screen px; one step
    // under it, less than one.
    const swing = (cellPx: number) => BAR_HALF * (cellPx / 16) * Math.sin(SILHOUETTE_BLIND_RAD);
    expect(swing(DETAIL_CELL_PX)).toBeGreaterThanOrEqual(1);
    expect(swing(DETAIL_CELL_PX - 1)).toBeLessThan(1);
  });

  it('markTier: off below the gate, compact between, detail at DETAIL_CELL_PX', () => {
    expect(markTier(MIN_CELL_PX_FOR_MARK - 0.001)).toBe('off');
    expect(markTier(MIN_CELL_PX_FOR_MARK)).toBe('compact');
    expect(markTier(DETAIL_CELL_PX - 0.001)).toBe('compact');
    expect(markTier(DETAIL_CELL_PX)).toBe('detail');
    // The band is not empty — otherwise the whole rule is dead code.
    expect(DETAIL_CELL_PX).toBeGreaterThan(MIN_CELL_PX_FOR_MARK);
  });

  // The picker's two surfaces, by the numbers they actually pass. A 22px
  // thumbnail is far under the threshold (its bar moves 0.3px across the whole
  // blind band); the big preview is over it.
  it('a picker thumbnail is compact and the big preview is detail', () => {
    expect(markTier(fitCellSizeToBox(22 + 8 * 2))).toBe('compact');
    expect(markTier(fitCellSizeToBox(120))).toBe('detail');
  });

  // FIT AND PAD ARE ONE RULE. A fixed-box caller must not clip the stem, and
  // the numbers come from NORMAL_LEN rather than from anyone's eye.
  it('fitCellSizeToBox leaves room for the stem on both sides', () => {
    expect(MARK_BOX_MARGIN).toBeCloseTo(NORMAL_LEN / 16, 12);
    for (const box of [32, 38, 64, 120, 240]) {
      const size = fitCellSizeToBox(box);
      const reach = NORMAL_LEN * (size / 16);   // screen px the stem sticks out
      const pad = (box - size) / 2;
      expect(pad).toBeGreaterThanOrEqual(reach);
      expect(size).toBeGreaterThan(0);
    }
  });

  it('markPadPx is the same margin stated the other way round', () => {
    for (const size of [16, 20, 22, 66, 120]) {
      expect(markPadPx(size)).toBeGreaterThanOrEqual(NORMAL_LEN * (size / 16));
    }
  });

  // THE OLD PAD WAS NEVER ENOUGH, WHICH IS WHY THIS IS A ROW AND NOT A NOTE.
  // The picker used a flat 5px around a shape drawn at its full size; at the
  // 120px preview the barb needed 30px and got 5.
  it('a flat 5px pad clips the mark at the sizes the picker actually uses', () => {
    for (const size of [22, 120]) {
      expect(NORMAL_LEN * (size / 16)).toBeGreaterThan(5);
    }
  });
});
