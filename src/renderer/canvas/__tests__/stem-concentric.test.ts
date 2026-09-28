// THE ANGLE MARK'S STEM IS CONCENTRIC IN ITS CASING AT EVERY DPR (ROADMAP row 240 (c)).
//
// Ruled by the overseer 2026-09-28: the stem's core stays where it is (the bar's core
// times ARROW_WIDTH_SCALE, 2 CSS px), and its CASING becomes that core plus the BAR's own
// casing margin on each side, so stem and bar read as one mark at one outline weight.
// Rejected: a heavier core, a heavier casing. Before the fix the stem's casing was the
// bar's casing times ARROW_WIDTH_SCALE (4.8 CSS px, an ODD device width at every dpr)
// around an EVEN core, so with both edges of each on whole device pixels the casing
// showed one more device px on one side than on the other.
//
// Every expectation below is DERIVED: the bar's widths are the ones both callers hand
// `drawAngleMark` (a census row holds them to the source), the stem's are those times
// ARROW_WIDTH_SCALE or plus the bar's margin, and every device width is
// `deviceStrokeWidth`'s. Nothing is copied from a measurement. The mark is drawn by the
// real `drawAngleMark` through the real `segmentsOnDeviceGrid`, under BOTH callers'
// mappings: aeon's `cameraDeviceMapping` with widths `/ zoom`, and classic's
// `getTransform()` with widths `/ zoomScale`.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { recordingContext, type DeviceStroke } from './chrome-recorder';
import { deviceStrokeWidth, segmentsOnDeviceGrid, cameraDeviceMapping } from '../device-grid';
import { COLLISION_ANGLE_TICK, COLLISION_ANGLE_CASING } from '../canvas-colors';
import {
  angleMark, drawAngleMark, markTier, ARROW_WIDTH_SCALE, MIN_CELL_PX_FOR_MARK, type MarkDrawCtx,
} from '../../../core/collision/collision-angle-mark';
import type { CollisionProfile } from '../../../core/collision/collision-model';

// ---- the constants, restated and held to both callers' source ----------------------
/** The bar's core and casing, in CSS px: what aeon's and classic's overlays pass. */
const BAR_CORE_CSS = 1.25;
const BAR_CASING_CSS = 3;
/** The bar's casing margin on each side, CSS px. */
const BAR_MARGIN_CSS = (BAR_CASING_CSS - BAR_CORE_CSS) / 2;
/** The stem's core: the bar's core at the stem's scale. UNCHANGED by row 240 (c). */
const STEM_CORE_CSS = BAR_CORE_CSS * ARROW_WIDTH_SCALE;
/** The stem's casing, as ruled: its core plus the bar's margin on each side. */
const STEM_CASING_CSS = STEM_CORE_CSS + 2 * BAR_MARGIN_CSS;

const DPRS = [1, 1.25, 1.35, 1.5, 1.6, 2, 2.5, 3, 4];
/** Zooms at which the mark is drawn at all (a 16px cell of at least MIN_CELL_PX_FOR_MARK
 *  screen px), both tiers, fractional ON PURPOSE, plus an even sweep to 8. */
const ZOOMS = [0.875, 1, 1.0625, 1.5, 2, 2.125, 3, 3.3, 3.375, 3.625, 3.6875, 4, 5.0625, 7.59375, 8,
  ...Array.from({ length: 60 }, (_, i) => 0.875 + (7.125 * i) / 59)];
/** Positions come back through the recorder's float transform (1.35 x ... leaves ~1e-14):
 *  a margin is compared to 1e-6 device px, far under the whole pixel it is judged in. */
const POS_EPS = 1e-6;
const CAMS = [{ x: 0, y: 0 }, { x: 3.3, y: 1.7 }, { x: 13, y: 7 }];

const FLOOR: CollisionProfile = { heights: new Int8Array(16).fill(8), angle: 0, hasAngle: true, solidity: 'all' };
/** A wall: every column full, tangent vertical, so the stem is HORIZONTAL (and two-ended). */
const WALL: CollisionProfile = { heights: new Int8Array(16).fill(16), angle: 0x40, hasAngle: true, solidity: 'all' };

type Flavour = 'aeon' | 'classic';

/** The strokes one mark leaves, drawn by the real draw under one caller's mapping. */
function drawMark(flavour: Flavour, profile: CollisionProfile, dpr: number, zoom: number,
  cam: { x: number; y: number }): { core: DeviceStroke[]; casing: DeviceStroke[] } {
  const r = recordingContext();
  r.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  r.ctx.scale(zoom, zoom);
  r.ctx.translate(-cam.x, -cam.y);
  let path;
  let unit: number;
  if (flavour === 'aeon') {
    path = segmentsOnDeviceGrid(r.ctx, dpr, cameraDeviceMapping(cam.x, cam.y, zoom, dpr));
    unit = zoom;
  } else {
    path = segmentsOnDeviceGrid(r.ctx, dpr);
    unit = r.ctx.getTransform().a / dpr;
  }
  const mark = angleMark(profile)!;
  drawAngleMark(path as unknown as MarkDrawCtx, 32, 16, 16, mark, {
    color: COLLISION_ANGLE_TICK,
    casing: COLLISION_ANGLE_CASING,
    coreWidth: BAR_CORE_CSS / unit,
    casingWidth: BAR_CASING_CSS / unit,
    cellScreenPx: 16 * zoom,
  });
  return {
    core: r.strokes.filter((s) => s.style === COLLISION_ANGLE_TICK),
    casing: r.strokes.filter((s) => s.style === COLLISION_ANGLE_CASING),
  };
}

/** The two casing margins of an axis-aligned stroke pair, in device px. */
function margins(core: DeviceStroke, casing: DeviceStroke): { lo: number; hi: number; vertical: boolean } {
  const vertical = Math.abs(core.pts[0][0] - core.pts[1][0]) < 1e-6;
  const c = vertical ? core.pts[0][0] : core.pts[0][1];
  const k = vertical ? casing.pts[0][0] : casing.pts[0][1];
  return {
    lo: (c - core.width / 2) - (k - casing.width / 2),
    hi: (k + casing.width / 2) - (c + core.width / 2),
    vertical,
  };
}

describe('census: the bar widths restated here are the ones both callers pass', () => {
  const strip = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const aeon = strip(readFileSync(new URL('../OverlayRenderer.ts', import.meta.url), 'utf8'));
  const classic = strip(readFileSync(new URL('../../components/classic/classic-overlays.ts', import.meta.url), 'utf8'));
  it('aeon passes 1.25 / zoom and 3 / zoom', () => {
    expect(aeon).toMatch(/coreWidth: 1\.25 \/ zoom,/);
    expect(aeon).toMatch(/casingWidth: 3 \/ zoom,/);
  });
  it('classic passes 1.25 / zoomScale and 3 / zoomScale', () => {
    expect(classic).toMatch(/coreWidth: 1\.25 \/ zoomScale,/);
    expect(classic).toMatch(/casingWidth: 3 \/ zoomScale,/);
  });
});

describe('the premise: the old stem casing (bar casing x ARROW_WIDTH_SCALE) is NOT concentric', () => {
  it('its device width minus the core\'s is odd at every dpr swept (so the row below can be red)', () => {
    const odd = DPRS.filter((d) =>
      (deviceStrokeWidth(BAR_CASING_CSS * ARROW_WIDTH_SCALE, d) - deviceStrokeWidth(STEM_CORE_CSS, d)) % 2 !== 0);
    expect(odd).toEqual(DPRS);
  });
  it('the ruled casing\'s device width minus the core\'s is even and positive at every dpr swept', () => {
    for (const d of DPRS) {
      const diff = deviceStrokeWidth(STEM_CASING_CSS, d) - deviceStrokeWidth(STEM_CORE_CSS, d);
      expect(diff % 2, `dpr ${d}`).toBe(0);
      expect(diff, `dpr ${d}`).toBeGreaterThan(0);
    }
  });
});

for (const flavour of ['aeon', 'classic'] as const) {
  describe(`${flavour}: the stem is concentric in its casing, and nothing else moved (row 240 (c))`, () => {
    for (const dpr of DPRS) {
      it(`dpr ${dpr}: every zoom, camera and stem orientation`, () => {
        const wantCore = deviceStrokeWidth(STEM_CORE_CSS, dpr);
        const wantCasing = deviceStrokeWidth(STEM_CASING_CSS, dpr);
        const wantMargin = (wantCasing - wantCore) / 2;
        const bad: string[] = [];
        let checked = 0, withBar = 0, horizontalStems = 0;
        for (const zoom of ZOOMS) {
          expect(16 * zoom >= MIN_CELL_PX_FOR_MARK, `zoom ${zoom} draws no mark`).toBe(true);
          const detail = markTier(16 * zoom) === 'detail';
          for (const cam of CAMS) {
            for (const profile of [FLOOR, WALL]) {
              const { core, casing } = drawMark(flavour, profile, dpr, zoom, cam);
              const where = `zoom ${zoom} cam ${cam.x},${cam.y} angle $${profile.angle.toString(16)}`;
              if (core.length !== (detail ? 2 : 1) || casing.length !== core.length) {
                bad.push(`${where}: ${core.length} cores, ${casing.length} casings`);
                continue;
              }
              const stemCore = core[core.length - 1], stemCasing = casing[casing.length - 1];
              if (Math.abs(stemCore.width - wantCore) > 1e-9) bad.push(`${where}: stem core ${stemCore.width}, want ${wantCore}`);
              if (Math.abs(stemCasing.width - wantCasing) > 1e-9) bad.push(`${where}: stem casing ${stemCasing.width}, want ${wantCasing}`);
              const diff = stemCasing.width - stemCore.width;
              if (Math.abs(diff / 2 - Math.round(diff / 2)) > 1e-9) bad.push(`${where}: casing - core = ${diff}, odd`);
              const m = margins(stemCore, stemCasing);
              if (!m.vertical) horizontalStems++;
              if (Math.abs(m.lo - m.hi) > POS_EPS) bad.push(`${where}: margins ${m.lo} / ${m.hi}, unequal`);
              if (Math.abs(m.lo - wantMargin) > POS_EPS) bad.push(`${where}: margin ${m.lo}, want ${wantMargin}`);
              if (detail) {
                withBar++;
                // The bar is untouched: its core and casing at their own widths, concentric.
                if (Math.abs(core[0].width - deviceStrokeWidth(BAR_CORE_CSS, dpr)) > 1e-9) bad.push(`${where}: bar core ${core[0].width}`);
                if (Math.abs(casing[0].width - deviceStrokeWidth(BAR_CASING_CSS, dpr)) > 1e-9) bad.push(`${where}: bar casing ${casing[0].width}`);
                const b = margins(core[0], casing[0]);
                if (Math.abs(b.lo - b.hi) > POS_EPS) bad.push(`${where}: bar margins ${b.lo} / ${b.hi}`);
              }
              checked++;
            }
          }
        }
        // Anti-vacuous: the sweep drew marks, some with the bar, some with a horizontal stem.
        expect(checked).toBe(ZOOMS.length * CAMS.length * 2);
        expect(withBar).toBeGreaterThan(0);
        expect(horizontalStems).toBeGreaterThan(0);
        expect(wantMargin, 'the ruled casing shows at all').toBeGreaterThan(0);
        expect(bad.slice(0, 12)).toEqual([]);
      });
    }
  });
}
