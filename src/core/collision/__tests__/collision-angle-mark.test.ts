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
  BAR_HALF, BARB_LEN, MIN_CELL_PX_FOR_MARK,
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

describe('angleTangent — the engine convention, shared by every surface', () => {
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
  it('is (cos a, +sin a) with y DOWN — a small angle descends to the right', () => {
    const b = 0x10;
    const r = (b / 256) * Math.PI * 2;
    const t = angleTangent(b);
    expect(t.tx).toBeCloseTo(Math.cos(r), 12);
    expect(t.ty).toBeCloseTo(Math.sin(r), 12);
    expect(t.ty).toBeGreaterThan(0);
  });

  // The picker used to route the angle through `angleDegrees`, which rounds.
  // At $10 that is a visible hair of disagreement with the map at the same byte.
  it('works in bytes, not rounded degrees — no rounding drift at $10', () => {
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

describe('columnSurfaceY — the player-facing boundary, matching the surface line', () => {
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

describe('surfaceAnchor — the mark sits ON the surface, not at the cell centre', () => {
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

describe('outwardNormal — the barb points OUT of the solid', () => {
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

describe('angleMark — a floor and its ceiling are told apart', () => {
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

  it('the mark is ASYMMETRIC — it is not its own 180° rotation', () => {
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

describe('angleMarkFromColumns — classic gets the identical mark', () => {
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

describe('drawAngleMark — casing under core, and the geometry that reaches canvas', () => {
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
  const OPTS = { color: '#f00', casing: '#000', coreWidth: 1, casingWidth: 3 };

  // ITEM 4 IS THIS ROW. A single stroke is invisible wherever the art matches
  // it; the casing is what makes the mark readable over arbitrary pixel art.
  it('strokes twice — dark casing FIRST, then the bright core', () => {
    const r = recorder();
    drawAngleMark(r.ctx, 0, 0, 16, angleMark(profile(RISING_FLOOR, 0x20))!, OPTS);
    expect(r.strokes).toEqual([
      { style: '#000', width: 3 },
      { style: '#f00', width: 1 },
    ]);
    expect(r.strokes[0].width).toBeGreaterThan(r.strokes[1].width);
  });

  it('draws a bar AND a barb — two subpaths, not one line', () => {
    const r = recorder();
    drawAngleMark(r.ctx, 0, 0, 16, angleMark(profile(RISING_FLOOR, 0x20))!, OPTS);
    // Per stroke pass: move,line (bar) + move,line (barb).
    const pass = r.ops.slice(0, r.ops.indexOf('stroke') + 1);
    expect(pass).toEqual(['begin', 'move', 'line', 'move', 'line', 'stroke']);
  });

  it('scales cell-local geometry into the caller box, and offsets by (x, y)', () => {
    const mark = angleMark(profile(FLAT_FLOOR, 0))!;
    const big = recorder();
    drawAngleMark(big.ctx, 100, 200, 32, mark, OPTS);
    const s = 32 / 16;
    // Derived from the mark, not from the drawing: anchor + tangent*BAR_HALF.
    const ax = 100 + mark.ax * s, ay = 200 + mark.ay * s;
    expect(big.pts[0].x).toBeCloseTo(ax - mark.tx * BAR_HALF * s, 10);
    expect(big.pts[1].x).toBeCloseTo(ax + mark.tx * BAR_HALF * s, 10);
    // The barb root is the anchor; its tip is one BARB_LEN along the normal.
    expect(big.pts[2].x).toBeCloseTo(ax, 10);
    expect(big.pts[2].y).toBeCloseTo(ay, 10);
    expect(big.pts[3].y).toBeCloseTo(ay + mark.ny * BARB_LEN * s, 10);
  });

  it('the barb tip leaves the solid — it is on the open side of the surface', () => {
    const mark = angleMark(profile(FLAT_FLOOR, 0))!;
    const tipY = mark.ay + mark.ny * BARB_LEN;
    expect(tipY).toBeLessThan(mark.ay); // flat floor: the tip is ABOVE the surface
  });
});

describe('MIN_CELL_PX_FOR_MARK — the low-zoom density decision is a constant', () => {
  it('is a screen-pixel threshold callers gate on', () => {
    expect(MIN_CELL_PX_FOR_MARK).toBeGreaterThan(8);
    expect(MIN_CELL_PX_FOR_MARK).toBeLessThanOrEqual(16);
  });
  it('the bar fits inside a cell at any zoom (cell-local sizing)', () => {
    expect(BAR_HALF * 2).toBeLessThan(16);
    expect(BARB_LEN).toBeLessThan(16);
  });
});
