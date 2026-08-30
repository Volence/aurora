// THE RASTER TIMELINE'S GEOMETRY — and, above everything else here, THE
// COORDINATE-SPACE CLAIM the whole strip rests on.
//
// ⚠ WHAT THE NODE SUITE CANNOT SEE. There is no React and no canvas here, so
// nothing below can tell "drawn" from "would be drawn". `drawRasterTimeline` is
// exercised against a recording stub, which proves the ORDER and the COUNT of
// what it issues and NOT that any of it reached a screen. The pixels are
// scratchpad/raster-timeline-harness.mjs's job, and the rows here say so where
// they stop.
//
// ⚠ AND WHAT A CARELESS FIXTURE CANNOT SEE. A scene with no splits, or one split
// at line 0, renders identically to a broken timeline: an empty strip and a
// marker at the very top are both what "nothing works" looks like. Every
// discriminating fixture below therefore has splits at DISTINCT, NON-TRIVIAL
// lines, and the rows that would survive the feature being deleted are named as
// such in their own titles.

import { describe, it, expect } from 'vitest';
import {
  rasterTimelineView, rasterTimelineSpaceNotice, rasterTimelineAbsences,
  splitRefusal, lineToStripY, drawRasterTimeline, RASTER_TIMELINE_GRAMMAR,
  RASTER_TIMELINE_LINES, RASTER_TIMELINE_ORIGIN_Y, RASTER_TIMELINE_SCALE,
  RASTER_TIMELINE_STRIP_X, RASTER_TIMELINE_STRIP_W, RASTER_TIMELINE_W,
  publishRasterTimelineReport, lastRasterTimelineReport, inactiveRasterTimelineReport,
  stripYToLine, presetEdgeAt, presetBandAt, presetDragFor,
  publishRasterTimelinePointer,
  RASTER_TIMELINE_PRESET_X, RASTER_TIMELINE_PRESET_W, BAND_EDGE_GRAB_PX,
} from '../raster-timeline';
import { cameraPreviewPlan } from '../camera-preview';
import {
  fireScreenLineOf, EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX, PLANE_LINE_SPAN,
  VSPLIT_LOCK_CLAUSES,
} from '../../providers/effects-aeon';
import { SCREEN_HEIGHT } from '../../../core/model/screen';
import type { EffectsScene, EffectsLayer, EffectsFactor } from '../../../core/formats/effects/scene';
import type { EffectsPreset, EffectsPresetBand } from '../../../core/formats/effects/preset';

const LOCK = 15;

function layer(world_y: number, fb: EffectsFactor, extra: Partial<EffectsLayer> = {}): EffectsLayer {
  return { world_y, fa: 'FACTOR_1', fb, ...extra };
}

function scene(layers: EffectsLayer[], over: Partial<EffectsScene> = {}): EffectsScene {
  return { schema: 1, id: 'strip_test', layers, v_factor: LOCK, ...over };
}

/**
 * The discriminating fixture: FOUR bands, TWO splits, at lines nothing default
 * would produce.
 *
 * 96 and 176 are both well inside 3..223, both far from 0, distinct from each
 * other and distinct from every band top that is not their own. `at` is 300 and
 * 44 — a Plane-B row above 223 and one below it, so a strip that mistook the
 * PAYLOAD for a POSITION would put a marker off the bottom of one ruler and in
 * the wrong place on the other, rather than landing plausibly.
 */
function twoSplits(): EffectsScene {
  return scene([
    layer(0, 'FACTOR_LOCKED'),
    layer(48, 'FACTOR_1_16'),
    layer(96, 'FACTOR_1_4', { vsplit: { at: 300 } }),
    layer(176, 'FACTOR_1_2', { vsplit: { at: 44 } }),
  ]);
}

const planOf = (s: EffectsScene, camX = 512, camY = 0) => cameraPreviewPlan(s, camX, camY);
const viewOf = (s: EffectsScene, camX = 512, camY = 0) => rasterTimelineView(s, planOf(s, camX, camY));

// ═══════════════════════════════════════════════════════════════════════════
// THE CLAIM. Everything else in this file is downstream of it.
// ═══════════════════════════════════════════════════════════════════════════

describe('the two axes, and exactly where they meet', () => {
  it('THE THEOREM: under the lock, a LEGAL fire line IS the preview band\'s own screen top', () => {
    // SWEPT, not asserted once. This is the claim that lets one 224-line ruler
    // carry both a band interval and a split boundary; if it is false anywhere
    // the strip is a tidy picture of two different things.
    //
    // The two sides are computed by genuinely different code:
    //   • `fireScreenLineOf`  — aeon `scene_vsplit_line`: plane line less v_offset.
    //   • the preview's band  — aeon Step 4a: `rebasePlaneTopsToScreen`, with its
    //     `k` rotation, its `+= 512` wrap and its SCREEN_HEIGHT clamp.
    // Two expressions agreeing is evidence; re-running one of them twice is not.
    let checked = 0;
    for (const vo of [0, 1, 24, 64, 135, 200, 288, 511]) {
      for (const top of [3, 4, 40, 96, 137, 200, 222, 223, 300, 400, 511]) {
        const s = scene([
          layer(0, 'FACTOR_LOCKED'),
          layer(top, 'FACTOR_1_4', { vsplit: { at: 77 } }),
        ], { v_offset: vo });
        const line = fireScreenLineOf(s, top);
        if (line < EFFECTS_FIRE_LINE_MIN || line > EFFECTS_FIRE_LINE_MAX) continue;
        const band = planOf(s).bands.find((b) => b.layer === 1);
        expect(band, `vo=${vo} top=${top}`).toBeDefined();
        expect(band!.screenTop, `vo=${vo} top=${top} line=${line}`).toBe(line);
        checked++;
      }
    }
    // ANTI-VACUOUS: a sweep whose `continue` swallowed every case would pass.
    expect(checked).toBeGreaterThan(20);
  });

  it('and the strip PLACES a split at the engine\'s baked line, not at its `at` payload', () => {
    // THE ROW THE WHOLE COORDINATE TRAP IS ABOUT. `at` is a Plane-B ROW (0..511);
    // the fire's position is a SCREEN line. Drawing `at` on the 224 ruler is the
    // picture that looks authoritative and is wrong, and this fixture is chosen
    // so that mistake is visible: 300 is not even ON a 224-line ruler.
    const v = viewOf(twoSplits());
    expect(v.splits.map((s) => [s.layer, s.line, s.at])).toEqual([[2, 96, 300], [3, 176, 44]]);
    expect(v.splits[0].y).toBe(lineToStripY(96));
    expect(v.splits[1].y).toBe(lineToStripY(176));
    // The payload is NOT a position anywhere.
    expect(v.splits.map((s) => s.y)).not.toContain(lineToStripY(44));
  });

  it('v_offset shifts the fire line and the strip follows it — not the world_y', () => {
    // The differential row. A strip that drew `world_y` straight onto the screen
    // ruler is green at v_offset 0 and wrong everywhere else, which is the
    // single most likely way to build this feature incorrectly.
    const at0 = viewOf(scene([layer(0, 'FACTOR_LOCKED'), layer(140, 'FACTOR_1_4', { vsplit: { at: 12 } })]));
    const at40 = viewOf(scene([layer(0, 'FACTOR_LOCKED'), layer(140, 'FACTOR_1_4', { vsplit: { at: 12 } })],
      { v_offset: 40 }));
    expect(at0.splits[0].line).toBe(140);
    expect(at40.splits[0].line).toBe(100);
    expect(at40.splits[0].y).toBe(lineToStripY(100));
    expect(at40.splits[0].y).not.toBe(at0.splits[0].y);
  });

  it('UNLOCKED: no row claims a certain screen position, and the notice says why', () => {
    const s = scene([layer(0, 'FACTOR_LOCKED'), layer(4096, 'FACTOR_1_4')],
      { v_factor: 4, v_center: 0, v_offset: 0 });
    const v = viewOf(s);
    expect(v.space).toBe('act');
    expect(v.bands.every((b) => b.spaceCertain === false)).toBe(true);
    // The sentence is the engine's own belief, not a hedge: `scene_vsplit_line`
    // REFUSES to compute a screen line for this scene.
    expect(v.notices).toHaveLength(1);
    expect(v.notices[0]).toContain('no fixed screen line');
    expect(v.notices[0]).toContain('v_factor 4');
  });

  it('UNLOCKED: a split is listed but placed NOWHERE, and carries the engine\'s refusal', () => {
    // `scene()`'s two-writer ensure refuses this document outright. Silently
    // dropping the split would be the "authorable and unseeable" defect again,
    // one level up; placing it on the ruler would be inventing a screen line the
    // engine says does not exist. So: listed, `y: null`, refusal spelled out.
    const s = scene([layer(0, 'FACTOR_LOCKED'), layer(4096, 'FACTOR_1_4', { vsplit: { at: 60 } })],
      { v_factor: 4 });
    const v = viewOf(s);
    expect(v.splits).toHaveLength(1);
    expect(v.splits[0].y).toBeNull();
    // DERIVED, NOT RETYPED (ROADMAP row 80). The strip is one of three surfaces
    // reporting this bound and it composes the provider's clauses, so the
    // assertion is against the clause itself — a second spelling here would be
    // the exact drift the shared declaration exists to prevent. It also pins
    // BOTH remedies: this arm used to offer only the lock.
    expect(v.splits[0].refusal).toContain(VSPLIT_LOCK_CLAUSES.sceneIs(4));
    expect(v.splits[0].refusal).toContain(VSPLIT_LOCK_CLAUSES.mechanism);
    expect(v.splits[0].refusal).toContain(VSPLIT_LOCK_CLAUSES.remedyLock);
    expect(v.splits[0].refusal).toContain(VSPLIT_LOCK_CLAUSES.remedyHorizontal);
  });

  it('the LOCKED notice is absent — an advisory that is always on screen is decoration', () => {
    expect(rasterTimelineSpaceNotice(scene([], { v_factor: LOCK }))).toBeNull();
    expect(viewOf(twoSplits()).notices).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The strip is a PROJECTION of the preview's plan, not a second walk
// ═══════════════════════════════════════════════════════════════════════════

describe('bands come from the plan the frame is drawn from', () => {
  it('every band the preview planned appears, in the preview\'s own screen order', () => {
    const s = twoSplits();
    const plan = planOf(s);
    const v = rasterTimelineView(s, plan);
    expect(v.bands.map((b) => b.layer)).toEqual(plan.bands.map((b) => b.layer));
    expect(v.bands.map((b) => [b.screenTop, b.screenBottom]))
      .toEqual(plan.bands.map((b) => [b.screenTop, b.screenBottom]));
  });

  it('a band\'s strip Y and height are the plan\'s own numbers on the strip ruler', () => {
    const v = viewOf(twoSplits());
    for (const b of v.bands) {
      expect(b.y).toBe(RASTER_TIMELINE_ORIGIN_Y + b.screenTop * RASTER_TIMELINE_SCALE);
      expect(b.h).toBe((b.screenBottom - b.screenTop) * RASTER_TIMELINE_SCALE);
    }
    // ANTI-VACUOUS: the bands must actually partition the frame, or the loop
    // above is checking four copies of zero.
    expect(v.bands.reduce((a, b) => a + b.h, 0)).toBe(SCREEN_HEIGHT * RASTER_TIMELINE_SCALE);
  });

  it('the ruler IS the frame — 224 lines, from core/model/screen', () => {
    // NOT a literal: `SCREEN_HEIGHT` is where the agreement with aeon's
    // `engine/system/constants.emp` is enforced.
    expect(RASTER_TIMELINE_LINES).toBe(SCREEN_HEIGHT);
    expect(lineToStripY(0)).toBe(RASTER_TIMELINE_ORIGIN_Y);
    expect(lineToStripY(RASTER_TIMELINE_LINES - 1) - lineToStripY(0))
      .toBe((RASTER_TIMELINE_LINES - 1) * RASTER_TIMELINE_SCALE);
  });

  it('a DISABLED band still owns its rows — the engine inherits, it does not skip', () => {
    // `.band_disabled` gives the band above's scroll; a strip that omitted the
    // band would disagree with the frame about which rows exist.
    const s = scene([
      layer(0, 'FACTOR_LOCKED'),
      layer(64, 'FACTOR_1_16', { enabled: false }),
      layer(150, 'FACTOR_1_4'),
    ]);
    const v = viewOf(s);
    const off = v.bands.find((b) => b.layer === 1);
    expect(off).toBeDefined();
    expect(off!.enabled).toBe(false);
    expect(off!.h).toBeGreaterThan(0);
    expect(off!.inherited).toBe(true);
    expect(v.bands.reduce((a, b) => a + b.h, 0)).toBe(SCREEN_HEIGHT);
  });

  it('a locked band is flagged, because it will not move for any camera X', () => {
    const v = viewOf(twoSplits());
    expect(v.bands.find((b) => b.layer === 0)!.locked).toBe(true);
    expect(v.bands.find((b) => b.layer === 3)!.locked).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The fire bound, said on the strip
// ═══════════════════════════════════════════════════════════════════════════

describe('splitRefusal — the engine\'s two rules, and the null majority', () => {
  it('says nothing at all across the whole legal band', () => {
    // The null case is the majority case. An advisory that is always on screen
    // is read as decoration within a day.
    for (let top = EFFECTS_FIRE_LINE_MIN; top <= EFFECTS_FIRE_LINE_MAX; top++) {
      const s = scene([layer(top, 'FACTOR_1_4', { vsplit: { at: 10 } })]);
      expect(splitRefusal(s, s.layers[0]), `top=${top}`).toBeNull();
    }
  });

  it('refuses lines 0..2 by name — they belong to the priming records', () => {
    for (const top of [0, 1, 2]) {
      const s = scene([layer(top, 'FACTOR_1_4', { vsplit: { at: 10 } })]);
      const r = splitRefusal(s, s.layers[0]);
      expect(r, `top=${top}`).not.toBeNull();
      expect(r).toContain('priming records');
      expect(r).toContain(`screen line ${top}`);
    }
  });

  it('refuses a line past the visible frame, and the strip does not place it', () => {
    // The owner's own dead builds: 303, 319, 302, all reached by DRAGGING a
    // guide. The strip must not draw a marker for a line that is not on it.
    const s = scene([layer(303, 'FACTOR_1_4', { vsplit: { at: 10 } })]);
    expect(splitRefusal(s, s.layers[0])).toContain('303');
    const v = viewOf(s);
    expect(v.splits[0].line).toBe(303);
    expect(v.splits[0].y).toBeNull();
    expect(v.splits[0].refusal).not.toBeNull();
  });

  it('the bound is the PROVIDER\'s, not a second copy of 3 and 223', () => {
    const s = scene([layer(0, 'FACTOR_1_4', { vsplit: { at: 10 } })]);
    expect(splitRefusal(s, s.layers[0])).toContain(
      `${EFFECTS_FIRE_LINE_MIN}..${EFFECTS_FIRE_LINE_MAX}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The honesty line
// ═══════════════════════════════════════════════════════════════════════════

describe('what the strip refuses to claim', () => {
  it('names PALETTE BANDS as not drawn', () => {
    const absent = rasterTimelineAbsences();
    expect(absent.length).toBeGreaterThan(0);
    expect(absent.join(' ')).toContain('palette bands');
  });

  it('THE VOCABULARY COLLISION is stated in full, where a sentence has room', () => {
    // ⚠ Two mechanisms are both called "raster": a palette band is an INTERVAL
    // with a paired ON op and `pal_restore`; a vertical split is a BOUNDARY with
    // one edge and no restore at all. Drawing one as the other is a picture that
    // misstates the mechanism.
    //
    // THIS LIVES IN PROSE, NOT ON THE CANVAS, and the split is the lesson: the
    // first build put the whole sentence in the drawn absence line and the strip
    // truncated it to "an interval with tw…". An honesty line that cannot be
    // read is not an honesty line.
    expect(RASTER_TIMELINE_GRAMMAR).toContain('ONE edge');
    expect(RASTER_TIMELINE_GRAMMAR).toContain('INTERVAL with two edges');
    expect(RASTER_TIMELINE_GRAMMAR).toContain('no paired restore');
  });

  it('the drawn absence line FITS the strip — it is never ellipsised', () => {
    // The footer is measured against the strip's own width using the same 9px
    // metric the draw uses. A phrase long enough to overflow must be shortened,
    // never cut: half a sentence about what the app cannot show reads as chrome.
    const foot = `not drawn: ${rasterTimelineAbsences().join('; ')}`;
    // The draw's font is 9px system-ui; ~5.4px/char is the conservative upper
    // bound this repo's other canvas captions are sized against.
    expect(foot.length * 5.4).toBeLessThan(RASTER_TIMELINE_W - 4);
    expect(foot).not.toContain('…');
  });

  it('the absence list is on every view, including a scene with nothing wrong', () => {
    expect(viewOf(twoSplits()).absent).toEqual(rasterTimelineAbsences());
  });

  it('NO BAND COUNT, NO HEIGHT MINIMUM, NO WIRE SIZE is transcribed from the moving spec', () => {
    // aeon's N-bands design carries five open questions and its height minimum
    // rests on `op_work_cyc == 64`, which their §12 still marks UNVERIFIED. A
    // number copied out of it would be the copied-pin defect. The only bounds
    // this module names are the two that live in shipped engine code.
    const src = rasterTimelineAbsences().join(' ') + JSON.stringify(viewOf(twoSplits()));
    expect(src).not.toMatch(/op_work_cyc|16 words|22 words/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The draw — ORDER and COUNT only. See this file's docblock.
// ═══════════════════════════════════════════════════════════════════════════

/** A recording 2D context. It proves what was ISSUED; it cannot prove what was SEEN. */
function stubCtx(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = [];
  const rec = (name: string) => (...args: unknown[]) => { calls.push(`${name}(${args.join(',')})`); };
  const ctx = {
    calls,
    save: rec('save'), restore: rec('restore'), setTransform: rec('setTransform'),
    beginPath: rec('beginPath'), moveTo: rec('moveTo'), lineTo: rec('lineTo'),
    closePath: rec('closePath'), stroke: rec('stroke'), fill: rec('fill'),
    fillRect: rec('fillRect'), fillText: rec('fillText'), rect: rec('rect'), clip: rec('clip'),
    setLineDash: rec('setLineDash'),
    measureText: (t: string) => ({ width: t.length * 5 }),
    font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
  } as unknown as CanvasRenderingContext2D & { calls: string[] };
  return ctx;
}

describe('drawRasterTimeline — what it issues', () => {
  it('fills one rectangle per band with a positive height, and strokes one rule per placed split', () => {
    const v = viewOf(twoSplits());
    const ctx = stubCtx();
    const counts = drawRasterTimeline(ctx, v);
    expect(counts.fills).toBe(v.bands.filter((b) => b.h > 0).length);
    expect(counts.markers).toBe(v.splits.filter((s) => s.y !== null).length);
    expect(counts.fills).toBe(4);
    expect(counts.markers).toBe(2);
  });

  it('THE COUNTS ARE OF WORK DONE: a split with no place on the ruler strokes nothing', () => {
    const s = scene([layer(0, 'FACTOR_LOCKED'), layer(303, 'FACTOR_1_4', { vsplit: { at: 9 } })]);
    const counts = drawRasterTimeline(stubCtx(), viewOf(s));
    expect(counts.markers).toBe(0);
  });

  it('a marker rule reaches the strip column at its own line and at no other', () => {
    // The node half of the harness's pixel row: the geometry that goes into the
    // stroke. It CANNOT tell drawn from covered — that is the CDP row's job.
    const v = viewOf(twoSplits());
    const ctx = stubCtx();
    drawRasterTimeline(ctx, v);
    const ys = ctx.calls.filter((c) => c.startsWith('moveTo(')).map((c) => Number(c.split(',')[1].replace(')', '')));
    expect(ys).toContain(lineToStripY(96) + 0.5);
    expect(ys).toContain(lineToStripY(176) + 0.5);
    expect(ys).not.toContain(lineToStripY(97) + 0.5);
  });

  it('the honesty line is painted, every time', () => {
    const ctx = stubCtx();
    drawRasterTimeline(ctx, viewOf(twoSplits()));
    expect(ctx.calls.some((c) => c.startsWith('fillText(not drawn:'))).toBe(true);
  });

  it('a scene with no split says so rather than showing an empty strip', () => {
    // ⚠ THIS PARCEL'S OWN VACUITY TRAP: no splits renders identically to a
    // broken timeline. The strip has to name the empty case.
    const ctx = stubCtx();
    drawRasterTimeline(ctx, viewOf(scene([layer(0, 'FACTOR_LOCKED'), layer(90, 'FACTOR_1_4')])));
    expect(ctx.calls.some((c) => c.includes('no Plane B splits'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The publish
// ═══════════════════════════════════════════════════════════════════════════

describe('the report is a record of a draw, not a recomputation', () => {
  it('publishes the strip\'s own constants, so a harness never types one', () => {
    const inactive = inactiveRasterTimelineReport();
    expect(inactive.lines).toBe(RASTER_TIMELINE_LINES);
    expect(inactive.scale).toBe(RASTER_TIMELINE_SCALE);
    expect(inactive.originY).toBe(RASTER_TIMELINE_ORIGIN_Y);
    expect(inactive.stripX).toBe(RASTER_TIMELINE_STRIP_X);
    expect(inactive.stripW).toBe(RASTER_TIMELINE_STRIP_W);
  });

  it('`active: false` is a real answer, and `paints` advances on every publish', () => {
    const before = lastRasterTimelineReport().paints;
    publishRasterTimelineReport(inactiveRasterTimelineReport());
    const a = lastRasterTimelineReport();
    expect(a.active).toBe(false);
    expect(a.sceneId).toBeNull();
    expect(a.paints).toBe(before + 1);
    const v = viewOf(twoSplits());
    publishRasterTimelineReport({
      ...inactiveRasterTimelineReport(), active: true, sceneId: v.sceneId, space: v.space,
      bands: v.bands, splits: v.splits, notices: v.notices, absent: v.absent, fills: 4, markers: 2,
    });
    const b = lastRasterTimelineReport();
    expect(b.paints).toBe(before + 2);
    expect(b.splits.map((s) => s.line)).toEqual([96, 176]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The plane's own span, so the payload's bound is not re-typed
// ═══════════════════════════════════════════════════════════════════════════

describe('the payload is a Plane-B row, and the strip never treats it as a line', () => {
  it('an `at` at the very top of the plane still places its marker by the fire line', () => {
    const top = PLANE_LINE_SPAN - 1;                     // 511 — a legal `at`, not a legal line
    const s = scene([layer(0, 'FACTOR_LOCKED'), layer(120, 'FACTOR_1_4', { vsplit: { at: top } })]);
    const v = viewOf(s);
    expect(v.splits[0].at).toBe(top);
    expect(v.splits[0].line).toBe(120);
    expect(v.splits[0].y).toBe(lineToStripY(120));
  });

  it('`at: 0` is a REAL split, not an absent one', () => {
    // `layerEmitsFire` tests against null, never falsiness — the trap
    // `vsplitFieldValue`'s own docblock names.
    const s = scene([layer(0, 'FACTOR_LOCKED'), layer(64, 'FACTOR_1_4', { vsplit: { at: 0 } })]);
    expect(viewOf(s).splits).toHaveLength(1);
    expect(viewOf(s).splits[0].at).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE EDITABLE COLUMN — geometry and hit-testing (ROADMAP §5.1 row 94)
//
// ⚠ WHAT THESE ROWS CANNOT SEE, AGAIN AND MORE SO. There is no pointer here.
// Everything below tests the ARITHMETIC a pointer handler feeds; whether an
// event reaches it, whether the canvas is covered, and whether a client pixel
// maps to the strip pixel it should are `scratchpad/timeline-edit-harness.mjs`'s
// rows, and they drive the real app.
// ═══════════════════════════════════════════════════════════════════════════

function pband(top: number, bot: number, addr = 74, words = 1): EffectsPresetBand {
  return { top, bot, sh: false, on: { cram: { addr, colours: Array.from({ length: words }, () => 0) } } };
}
function pset(bands: EffectsPresetBand[]): EffectsPreset {
  return { schema: 1, id: 'strip_preset', bands };
}
/**
 * Two bands, distinct and non-trivial, one clear line apart — a legal program.
 *
 * ⚠ "LEGAL" IS DATED. ABUTTING BANDS DO NOT BUILD at aeon `2e976223`, which is
 * why this fixture leaves a gap — but OVERLAP IS DESIGNED, NOT IMPOSSIBLE (their
 * `check_intervals` comment: a swept runtime-resolution design is banked). The
 * claim is stated once, with its date, owner and expiry, in the GAP RULE block
 * of `providers/effects-preset.ts`. If it retires, this fixture stops being the
 * only legal shape — it does NOT become wrong, so nothing here has to move.
 */
function twoBands(): EffectsPreset {
  return pset([pband(40, 90), pband(120, 176)]);
}
const presetViewOf = (p: EffectsPreset | null, drag = null as null) =>
  rasterTimelineView(twoSplits(), planOf(twoSplits()), p, drag);

describe('the ruler runs both ways', () => {
  it('stripYToLine INVERTS lineToStripY exactly, on every line of the frame', () => {
    // The drag's whole coordinate story is this pair. A half-pixel of drift here
    // is a band that jumps one line when the pointer comes up.
    for (let line = 0; line < RASTER_TIMELINE_LINES; line++) {
      expect(stripYToLine(lineToStripY(line))).toBe(line);
    }
  });

  it('and it does NOT round — a pointer between two lines asks for a fraction', () => {
    // Rounding here would make `bandEdgeNotice` speak about a value the pointer
    // is not actually at; `clampBandEdge` is the one that rounds, once.
    expect(stripYToLine(lineToStripY(66) + 0.6)).toBeCloseTo(66.6, 6);
  });
});

describe('the preset column is the editable one, and it is the ONLY editable one', () => {
  it('draws one row per band, at the document\'s own screen lines', () => {
    const v = presetViewOf(twoBands());
    expect(v.presetId).toBe('strip_preset');
    expect(v.presetBands.map((b) => [b.top, b.bot])).toEqual([[40, 90], [120, 176]]);
    expect(v.presetBands[0].y).toBe(lineToStripY(40));
    expect(v.presetBands[0].h).toBe((90 - 40) * RASTER_TIMELINE_SCALE);
  });

  it('grabs an edge within the published tolerance and NOT one pixel past it', () => {
    const rows = presetViewOf(twoBands()).presetBands;
    const x = RASTER_TIMELINE_PRESET_X + RASTER_TIMELINE_PRESET_W / 2;
    const topY = lineToStripY(40);
    expect(presetEdgeAt(rows, x, topY)).toEqual({ index: 0, edge: 'top' });
    expect(presetEdgeAt(rows, x, topY + BAND_EDGE_GRAB_PX)).toEqual({ index: 0, edge: 'top' });
    expect(presetEdgeAt(rows, x, topY + BAND_EDGE_GRAB_PX + 1)).toBeNull();
  });

  it('grabs the BOT edge at `bot`, where the restore actually fires', () => {
    const rows = presetViewOf(twoBands()).presetBands;
    const x = RASTER_TIMELINE_PRESET_X + 1;
    expect(presetEdgeAt(rows, x, lineToStripY(90))).toEqual({ index: 0, edge: 'bot' });
    expect(presetEdgeAt(rows, x, lineToStripY(176))).toEqual({ index: 1, edge: 'bot' });
  });

  it('THE ROW THAT KEEPS THE LAYER COLUMN READ-ONLY: no edge is grabbable over it', () => {
    // ⚠ A layer top is an ACT coordinate that only has a screen line under the
    // lock. A hit test that answered over the layer column would let an author
    // drag, in screen space, a number that does not live there — the "two rulers,
    // one picture" failure the whole strip is shaped to avoid.
    const rows = presetViewOf(twoBands()).presetBands;
    for (let x = RASTER_TIMELINE_STRIP_X; x <= RASTER_TIMELINE_STRIP_X + RASTER_TIMELINE_STRIP_W; x++) {
      expect(presetEdgeAt(rows, x, lineToStripY(40))).toBeNull();
      expect(presetBandAt(rows, x, lineToStripY(60))).toBeNull();
    }
  });

  it('hits a band\'s interior for the split gesture, and nothing outside it', () => {
    const rows = presetViewOf(twoBands()).presetBands;
    const x = RASTER_TIMELINE_PRESET_X + 2;
    expect(presetBandAt(rows, x, lineToStripY(60))).toBe(0);
    expect(presetBandAt(rows, x, lineToStripY(150))).toBe(1);
    // Line 100 sits in the clear gap between the two bands.
    expect(presetBandAt(rows, x, lineToStripY(100))).toBeNull();
  });

  it('with no preset there is no column, and the honesty line says palette bands are absent', () => {
    const v = presetViewOf(null);
    expect(v.presetId).toBeNull();
    expect(v.presetBands).toEqual([]);
    expect(v.absent).toContain('palette bands');
    // ...and WITH one it stops saying it, because then it would be false.
    expect(presetViewOf(twoBands()).absent).not.toContain('palette bands');
    expect(presetViewOf(twoBands()).absent).toContain('per-line deform');
  });

  it('a colliding pair reaches the strip\'s notices, with nobody asking', () => {
    // Document state, not gesture state — the `v_offset` hole's lesson.
    const v = presetViewOf(pset([pband(40, 90), pband(90, 140)]));
    expect(v.notices.some((n) => n.includes('both fire on screen line 90'))).toBe(true);
    // De-duplicated: a colliding PAIR must not say one fact twice in two voices.
    expect(v.notices.filter((n) => n.includes('screen line 90'))).toHaveLength(1);
  });
});

describe('the gesture\'s value is computed in exactly one place', () => {
  it('presetDragFor holds the request at the bound and reports the RAW ask beside it', () => {
    const p = twoBands();
    const d = presetDragFor(p, 0, 'top', lineToStripY(200));
    // Held at `bot - 1` = 89 by the order rule; the raw ask survives so the
    // advisory can speak about what the pointer wanted.
    expect(d).toEqual({ index: 0, edge: 'top', line: 89, requested: 200 });
  });

  it('and the PREVIEW draws that same held value — not the raw pointer', () => {
    // ⚠ THE TWO-COPIES DEFECT THIS ROW EXISTS FOR: if the preview drew the raw
    // request and the commit wrote the clamped one, the band would jump on
    // release, at the bound, where an author is already confused.
    const p = twoBands();
    const d = presetDragFor(p, 0, 'top', lineToStripY(200))!;
    const v = rasterTimelineView(twoSplits(), planOf(twoSplits()), p, d);
    expect(v.presetBands[0].top).toBe(d.line);
    expect(v.presetBands[0].dragging).toBe(true);
    expect(v.presetBands[1].dragging).toBe(false);
  });

  it('returns null for a band that is not there, rather than a drag on nothing', () => {
    expect(presetDragFor(twoBands(), 9, 'top', 100)).toBeNull();
    expect(presetDragFor(null, 0, 'top', 100)).toBeNull();
  });
});

describe('drawRasterTimeline — the preset column', () => {
  it('fills one rectangle per band and strokes TWO handles for each: it is an INTERVAL', () => {
    // ⚠ THE GRAMMAR, COUNTED. A split gets one rule and no closing edge because
    // the mechanism has none; a palette band gets two, because it has a paired
    // restore. A build that drew one edge per band would pass every model row in
    // this file and misstate the hardware on screen.
    const v = presetViewOf(twoBands());
    const counts = drawRasterTimeline(stubCtx(), v);
    expect(counts.presetFills).toBe(2);
    expect(counts.presetHandles).toBe(4);
    expect(counts.markers).toBe(2);   // the splits are still drawn as ONE edge each
  });

  it('draws nothing in the column when there is no preset, and still draws the rest', () => {
    const counts = drawRasterTimeline(stubCtx(), presetViewOf(null));
    expect(counts.presetFills).toBe(0);
    expect(counts.presetHandles).toBe(0);
    expect(counts.fills).toBe(4);
  });

  it('puts the handles on the band\'s own two lines and on no line between them', () => {
    const ctx = stubCtx();
    drawRasterTimeline(ctx, presetViewOf(twoBands()));
    const ys = ctx.calls.filter((c) => c.startsWith('moveTo('))
      .filter((c) => c.startsWith(`moveTo(${RASTER_TIMELINE_PRESET_X},`))
      .map((c) => Number(c.split(',')[1].replace(')', '')));
    expect(ys).toContain(lineToStripY(40) + 0.5);
    expect(ys).toContain(lineToStripY(90) + 0.5);
    expect(ys).not.toContain(lineToStripY(65) + 0.5);
  });
});

describe('the report carries the editable column too', () => {
  it('publishes the preset column\'s geometry and its grab tolerance', () => {
    const inactive = inactiveRasterTimelineReport();
    expect(inactive.presetX).toBe(RASTER_TIMELINE_PRESET_X);
    expect(inactive.presetW).toBe(RASTER_TIMELINE_PRESET_W);
    expect(inactive.grabPx).toBe(BAND_EDGE_GRAB_PX);
  });

  it('THE POINTER READING SURVIVES THE REPAINT IT CAUSES', () => {
    // ⚠ A pointer event is followed by a re-render and therefore by a publish.
    // If the publish carried `pointer` the instrument would report null for
    // every gesture it exists to measure — the harness would be measuring its
    // own erasure.
    publishRasterTimelinePointer({ clientX: 10, clientY: 20, x: 3, y: 4, line: 5, hit: 'edge 0.top' });
    publishRasterTimelineReport(inactiveRasterTimelineReport());
    expect(lastRasterTimelineReport().pointer).toEqual(
      { clientX: 10, clientY: 20, x: 3, y: 4, line: 5, hit: 'edge 0.top' });
  });

  it('and a pointer reading does NOT advance `paints` — a mouse move is not a draw', () => {
    const before = lastRasterTimelineReport().paints;
    publishRasterTimelinePointer(null);
    expect(lastRasterTimelineReport().paints).toBe(before);
  });
});
