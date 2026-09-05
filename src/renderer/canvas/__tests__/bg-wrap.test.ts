// THE WRAP ARITHMETIC — and every expectation in it DERIVED from a constant,
// because this row is arithmetic and a hand-typed number is the specific hazard.
//
// The queue row that produced this file said "the background image wraps 2,048
// px before the act ends". 2,048 is `SECTION_PIXEL_SIZE` — a WORLD-pixel
// foreground extent — and the plane's wrap is 512 PLANE pixels. Two correct
// numbers on two different axes, compared, producing a confident wrong answer.
// So: no literal 512 below, no literal 2048, no literal 5920. Every figure is
// spelled as the expression that produces it, and the rows that could only be
// written by copying a measurement are labelled as agreement checks rather than
// disguised as derivations.

import { describe, it, expect } from 'vitest';
import {
  PLANE_COLUMN_SPAN, CAMERA_WORD_MAX, actReach, bandReach, sceneBandReaches,
  bandReachClause, verticalReach, verticalWrapAdvisory,
} from '../bg-wrap';
import { PLANE_LINE_SPAN } from '../../providers/effects-aeon';
import { SECTION_PIXEL_SIZE } from '../../../core/model/s4-types';
import { SCREEN_WIDTH, SCREEN_HEIGHT } from '../../../core/model/screen';
import { BG_WIDTH } from '../../../core/formats/bg-tiles';
import { TILE_WIDTH_PX } from '../../../core/formats/bg-override/bg-override';
import {
  EFFECTS_FACTOR_PACKED, decodeFactorScroll,
} from '../../../core/formats/effects/factor-decode';
import { EFFECTS_V_FACTOR_LOCK } from '../../../core/formats/effects/scene-ui';
import type { EffectsFactorName } from '../../../core/formats/effects/scene';

/** OJZ act 1's shape, as aeon declares it (`GRID_W = 3`, `GRID_H = 3`). */
const OJZ_ACT1 = { gridWidth: 3, gridHeight: 3 };

/** A scene with only the fields the vertical arithmetic reads. */
const scene = (v_factor: number, v_center = 0, v_offset = 0) => ({ v_factor, v_center, v_offset });

describe('the two plane spans are one plane, derived two different ways', () => {
  it('the horizontal span and the vertical span agree without either quoting the other', () => {
    // PLANE_COLUMN_SPAN comes from BG_WIDTH; PLANE_LINE_SPAN comes from
    // BG_LAYOUT_WORDS / BG_WIDTH. Two independent paths through the vendored
    // contract, and aeon's single VDP register is why they land together.
    expect(PLANE_COLUMN_SPAN).toBe(BG_WIDTH * TILE_WIDTH_PX);
    expect(PLANE_COLUMN_SPAN).toBe(PLANE_LINE_SPAN);
  });

  it('a plane span is NOT a section: the two numbers the row confused', () => {
    // The whole point of the file, as an assertion: if these ever became equal
    // the axis trap would stop being detectable by inspection.
    expect(PLANE_COLUMN_SPAN).not.toBe(SECTION_PIXEL_SIZE);
  });
});

describe('act reach: world pixels, extent and travel are different quantities', () => {
  it('extent is grid * section, travel is extent less one screen', () => {
    const r = actReach(OJZ_ACT1);
    expect(r.extentX).toBe(OJZ_ACT1.gridWidth * SECTION_PIXEL_SIZE);
    expect(r.extentY).toBe(OJZ_ACT1.gridHeight * SECTION_PIXEL_SIZE);
    expect(r.travelX).toBe(r.extentX - SCREEN_WIDTH);
    expect(r.travelY).toBe(r.extentY - SCREEN_HEIGHT);
  });

  it('AGREEMENT (not derivation): the travel this model computes is the Camera_Y_Max aeon read live', () => {
    // aeon decision d-31 detail, 2026-08-26, taken on the running ROM: "camera
    // range 0..5920 (Camera_Y_Max 0x1720 read live)". This row does not DEFINE
    // 0x1720 — `travelY` is derived above from SECTION_PIXEL_SIZE and
    // SCREEN_HEIGHT. It checks that Aurora's independent derivation lands on the
    // engine's measured register, which is the only evidence this file has that
    // it models the right camera at all.
    expect(actReach(OJZ_ACT1).travelY).toBe(0x1720);
  });

  it('an act shorter than a screen has no travel rather than negative travel', () => {
    expect(actReach({ gridWidth: 0, gridHeight: 0 })).toMatchObject({ travelX: 0, travelY: 0 });
  });
});

describe('the binary search rests on monotonicity, so monotonicity is asserted', () => {
  it('every published factor is non-decreasing in camX across the whole legal camera range', () => {
    // The horizontal search assumes this. It is NOT obvious for the two-term
    // subtractive factors, and a violation would make `firstCamXAtScroll` return
    // a plausible wrong answer rather than fail.
    const names = Object.keys(EFFECTS_FACTOR_PACKED) as EffectsFactorName[];
    const broken: string[] = [];
    for (const name of names) {
      let prev = decodeFactorScroll(0, name);
      for (let camX = 1; camX <= CAMERA_WORD_MAX; camX++) {
        const cur = decodeFactorScroll(camX, name);
        if (cur < prev) { broken.push(`${name} fell at camX ${camX}: ${prev} -> ${cur}`); break; }
        prev = cur;
      }
    }
    expect(broken).toEqual([]);
  });

  it('the search domain stops at the signed-word camera the engine itself uses', () => {
    // aeon asserts `(GRID_W << SECTION_SIZE_SHIFT) <= $8000` on both axes, so a
    // legal act's travel is always inside this.
    expect(CAMERA_WORD_MAX).toBe(0x7FFF);
    expect(actReach({ gridWidth: 16, gridHeight: 1 }).travelX).toBeLessThanOrEqual(CAMERA_WORD_MAX);
  });
});

describe('horizontal: a band repeats, and the readout says where', () => {
  const travelX = actReach(OJZ_ACT1).travelX;

  it('a half-speed band starts over after twice a plane width of camera', () => {
    const r = bandReach({ fb: 'FACTOR_1_2' }, 0, travelX);
    expect(r.locked).toBe(false);
    // `camX >> 1 >= SPAN` first holds at `SPAN * 2`. Derived, not typed.
    expect(r.periodPx).toBe(PLANE_COLUMN_SPAN * 2);
    // One crossing per period that fits inside the travel.
    expect(r.wrapCamXs.length).toBe(Math.floor(travelX / (PLANE_COLUMN_SPAN * 2)));
    expect(r.wrapCamXs[0]).toBe(PLANE_COLUMN_SPAN * 2);
  });

  it('a 1/16 band does not finish one pass across this act, and says so rather than guessing', () => {
    const r = bandReach({ fb: 'FACTOR_1_16' }, 0, travelX);
    // decode(travelX) = travelX >> 4, which is short of one plane width.
    expect(decodeFactorScroll(travelX, 'FACTOR_1_16')).toBeLessThan(PLANE_COLUMN_SPAN);
    expect(r.periodPx).toBeNull();
    expect(r.wrapCamXs).toEqual([]);
  });

  it('a locked band never repeats, and is not reported as "does not finish"', () => {
    const r = bandReach({ fb: 'FACTOR_LOCKED' }, 0, travelX);
    expect(r.locked).toBe(true);
    expect(r.wrapCamXs).toEqual([]);
    expect(bandReachClause(r, travelX)).toContain('never repeats');
  });

  it('the crossings are the DECODE\'s, not the fraction\'s: every reported camX is exact', () => {
    // At each reported camX the scroll has just reached a whole plane width, and
    // one pixel earlier it had not. This is what makes the readout a statement
    // about the engine rather than about `factorRatio`.
    for (const name of ['FACTOR_3_4', 'FACTOR_7_16', 'FACTOR_3_8', 'FACTOR_1_4'] as EffectsFactorName[]) {
      const r = bandReach({ fb: name }, 0, travelX);
      for (let i = 0; i < r.wrapCamXs.length; i++) {
        const at = r.wrapCamXs[i];
        const target = (i + 1) * PLANE_COLUMN_SPAN;
        expect(decodeFactorScroll(at, name)).toBeGreaterThanOrEqual(target);
        expect(decodeFactorScroll(at - 1, name)).toBeLessThan(target);
      }
    }
  });

  it('a disabled layer is marked dormant and the clause says whose scroll it really shows', () => {
    const r = bandReach({ fb: 'FACTOR_1_2', enabled: false }, 3, travelX);
    expect(r.dormant).toBe(true);
    expect(bandReachClause(r, travelX)).toContain('disabled');
  });

  it('a scene reports one reach per layer, in scene order', () => {
    const reaches = sceneBandReaches(
      { layers: [{ fa: 'FACTOR_1', fb: 'FACTOR_1_16', world_y: 0 }, { fa: 'FACTOR_1', fb: 'FACTOR_1_2', world_y: 32 }] },
      travelX,
    );
    expect(reaches.map((r) => r.layer)).toEqual([0, 1]);
    expect(reaches[0].periodPx).toBeNull();
    expect(reaches[1].periodPx).toBe(PLANE_COLUMN_SPAN * 2);
  });
});

describe('vertical: the advisory speaks only when the plane runs out of picture', () => {
  const travelY = actReach(OJZ_ACT1).travelY;

  it('a LOCKED plane cannot wrap, so both shipped scenes are silent', () => {
    const r = verticalReach(scene(EFFECTS_V_FACTOR_LOCK), travelY);
    expect(r.locked).toBe(true);
    expect(r.ceilingPx).toBeNull();
    expect(r.wrapCamY).toBeNull();
    expect(verticalWrapAdvisory(scene(EFFECTS_V_FACTOR_LOCK), travelY)).toBeNull();
  });

  it('the shift aeon shipped OJZ on wraps, and the seam lands where the shift puts it', () => {
    // v_factor 3 is the configuration aeon measured a seam on (d-31).
    const r = verticalReach(scene(3, PLANE_LINE_SPAN), travelY);
    expect(r.ceilingPx).toBe(PLANE_LINE_SPAN << 3);
    // The seam is at the camera Y whose scroll has advanced one whole plane:
    // `camY >> 3 == PLANE_LINE_SPAN`, i.e. `PLANE_LINE_SPAN << 3` — which is the
    // ceiling, and that identity is the whole meaning of "ceiling".
    expect(r.wrapCamY).toBe(PLANE_LINE_SPAN << 3);
    expect(r.pastWrapPx).toBe(travelY - (PLANE_LINE_SPAN << 3));
    expect(r.pastWrapPx).toBeGreaterThan(0);
  });

  it('the remedy it offers is the shift aeon actually chose, and it is found by search not by guess', () => {
    const r = verticalReach(scene(3, PLANE_LINE_SPAN), travelY);
    // The smallest larger shift whose whole span fits the plane.
    expect(r.fittingVFactor).toBe(4);
    // And it really fits: at that shift there is no wrap at all.
    expect(verticalReach(scene(4, PLANE_LINE_SPAN), travelY).wrapCamY).toBeNull();
    expect(verticalWrapAdvisory(scene(4, PLANE_LINE_SPAN), travelY)).toBeNull();
  });

  it('the advisory names the shift, the ceiling, the seam and the remedy', () => {
    const text = verticalWrapAdvisory(scene(3, PLANE_LINE_SPAN), travelY);
    expect(text).not.toBeNull();
    expect(text).toContain('v_factor 3');
    expect(text).toContain(String(PLANE_LINE_SPAN << 3));
    expect(text).toContain(String(travelY));
    expect(text).toContain('v_factor to 4');
  });

  it('DOES NOT FIRE ON EVERY ACT: the same shift is silent on an act that fits under it', () => {
    // One section tall. This is the property the row asked for and the one an
    // over-eager check would break: the advisory must be about the RELATION
    // between the act and the shift, never about the mere existence of a wrap.
    const shortTravel = actReach({ gridWidth: 3, gridHeight: 1 }).travelY;
    expect(shortTravel).toBeLessThan(PLANE_LINE_SPAN << 3);
    expect(verticalWrapAdvisory(scene(3, PLANE_LINE_SPAN), shortTravel)).toBeNull();
  });

  it('v_center shifts the phase of the seam, so the seam is evaluated and not divided', () => {
    // Two scenes, same factor, same act, v_center differing by less than one
    // shift step: `asr.w` puts the crossing in a different place. A ratio-based
    // implementation would report the same camY for both.
    const a = verticalReach(scene(3, 0), travelY).wrapCamY;
    const b = verticalReach(scene(3, 5), travelY).wrapCamY;
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b).not.toBe(a);
  });

  it('a numeric remedy always exists for a LEGAL act, so "no shift fits" is unreachable and says so', () => {
    // The largest act aeon permits is `$8000` px on an axis. The largest shift
    // below the lock sentinel covers `PLANE_LINE_SPAN << 14`, which is orders
    // above that — so no legal act can exhaust the remedies. Asserted rather
    // than assumed, because the "art has to join" branch is otherwise a claim
    // nothing checks.
    expect(PLANE_LINE_SPAN << (EFFECTS_V_FACTOR_LOCK - 1)).toBeGreaterThan(0x8000);
    const widest = actReach({ gridWidth: 1, gridHeight: 0x8000 / SECTION_PIXEL_SIZE });
    expect(verticalReach(scene(0), widest.travelY).fittingVFactor).not.toBeNull();
    expect(verticalReach(scene(0), widest.travelY).beyondCameraWord).toBe(false);
  });

  it('LOUD, NOT SILENT, past the signed-word camera: the false negative this could have been', () => {
    // `planeVscroll` folds camY to a word, so an unguarded search past $7FFF
    // reports "no wrap" for an act that wraps many times over. No legal act can
    // get here; the flag is what makes that a checkable claim rather than a
    // comment.
    const past = CAMERA_WORD_MAX + 1;
    const r = verticalReach(scene(0), past);
    expect(r.beyondCameraWord).toBe(true);
    expect(r.wrapCamY).not.toBeNull();
    expect(verticalWrapAdvisory(scene(0), past)).toContain('signed-word camera');
  });
});
