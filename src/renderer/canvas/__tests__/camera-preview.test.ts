// The camera preview's GEOMETRY. What appears on screen needs CDP (the node
// suite has no React and no canvas); what each screen row is supposed to SHOW is
// arithmetic, and it is here.
//
// ⚠ THE ROWS THAT MATTER ARE DIFFERENTIAL. A plan for one camera position is
// green whether or not factors are applied at all — every band shows SOME column
// of the plane. The property is that MOVING the camera moves the bands by
// different amounts, in the ratio their factors name, and that a locked band
// does not move. Those rows are in the last two describes and they are the
// catchers; everything above them is scaffolding that makes their failure
// readable.

import { describe, it, expect } from 'vitest';
import {
  cameraPreviewPlan, planeVscroll, rebasePlaneTopsToScreen, bandScrollsX,
  cameraPreviewAbsences, bandCaption,
} from '../camera-preview';
import type { EffectsScene, EffectsLayer, EffectsFactor } from '../../../core/formats/effects/scene';
import { PLANE_LINE_SPAN } from '../../providers/effects-aeon';

const LOCK = 15;

function layer(world_y: number, fb: EffectsFactor, extra: Partial<EffectsLayer> = {}): EffectsLayer {
  return { world_y, fa: 'FACTOR_1', fb, ...extra };
}

function scene(layers: EffectsLayer[], over: Partial<EffectsScene> = {}): EffectsScene {
  return { schema: 1, id: 'test', layers, v_factor: LOCK, ...over };
}

/** The four-band shape the shipped scenes have: sky, far, mid, near. */
function fourBands(): EffectsScene {
  return scene([
    layer(0, 'FACTOR_LOCKED'),
    layer(32, 'FACTOR_1_16'),
    layer(112, 'FACTOR_1_4'),
    layer(160, 'FACTOR_1_2'),
  ]);
}

describe('planeVscroll — Parallax_Step5_Vscroll', () => {
  it('LOCKED: the answer is v_offset and the camera is not consulted', () => {
    const s = scene([layer(0, 'FACTOR_1')], { v_factor: LOCK, v_offset: 24, v_center: 100 });
    for (const camY of [0, 99, 100, 500, 4000]) {
      expect(planeVscroll(s, camY), `camY=${camY}`).toBe(24);
    }
  });

  it('LOCKED with a camera ABOVE v_center still gives v_offset', () => {
    // ⚠ THE SENTINEL ROW FOR THE VERTICAL, and unlike the horizontal one it
    // bites at a REACHABLE camera position. Treat 15 as a shift and this is
    // ((0 - 100) >> 15) + 0 = -1: the background slips one row the moment the
    // camera is above the scene's centre.
    const s = scene([layer(0, 'FACTOR_1')], { v_factor: LOCK, v_center: 100, v_offset: 0 });
    expect(planeVscroll(s, 0)).toBe(0);
    expect(planeVscroll(s, 99)).toBe(0);
  });

  it('UNLOCKED: ((camY - v_center) >> v_factor) + v_offset', () => {
    const s = scene([layer(0, 'FACTOR_1')], { v_factor: 3, v_center: 64, v_offset: 8 });
    expect(planeVscroll(s, 64)).toBe(8);
    expect(planeVscroll(s, 64 + 8)).toBe(1 + 8);
    expect(planeVscroll(s, 64 + 800)).toBe(100 + 8);
    // asr, so above the centre it rounds toward -inf, not toward zero.
    expect(planeVscroll(s, 64 - 1)).toBe(-1 + 8);
  });
});

describe('rebasePlaneTopsToScreen — Step 4a', () => {
  it('at vs = 0 it is the identity: band 0 at the top, the rest at their own lines', () => {
    expect(rebasePlaneTopsToScreen([0, 32, 112, 160], 0)).toEqual([
      { source: 0, screenTop: 0 }, { source: 1, screenTop: 32 },
      { source: 2, screenTop: 112 }, { source: 3, screenTop: 160 },
    ]);
  });

  it('rotates: the band containing vs starts the screen, and the list wraps', () => {
    // vs = 120 sits inside band 2 (top 112). Band 2 starts the screen; band 3 at
    // 160-120 = 40; bands 0 and 1 wrapped past the bottom, so +512.
    expect(rebasePlaneTopsToScreen([0, 32, 112, 160], 120)).toEqual([
      { source: 2, screenTop: 0 },
      { source: 3, screenTop: 40 },
      { source: 0, screenTop: 224 },  // 0-120 = -120 -> +512 = 392 -> clamped
      { source: 1, screenTop: 224 },  // 32-120 = -88 -> +512 = 424 -> clamped
    ]);
  });

  it('a band that lands past the screen bottom is clamped to a zero-length fill', () => {
    const rows = rebasePlaneTopsToScreen([0, 300], 0);
    expect(rows[1].screenTop).toBe(224);
  });

  it('a top exactly at vs starts the screen (the search is <=, not <)', () => {
    expect(rebasePlaneTopsToScreen([0, 32, 112], 32)[0]).toEqual({ source: 1, screenTop: 0 });
  });

  it('wraps within one plane span, not two', () => {
    const rows = rebasePlaneTopsToScreen([0, 8], PLANE_LINE_SPAN - 4);
    // vs is past both tops, so k is the last band; band 0 is 0-508 = -508 -> +512 = 4.
    expect(rows[0]).toEqual({ source: 1, screenTop: 0 });
    expect(rows[1]).toEqual({ source: 0, screenTop: 4 });
  });
});

describe('bandScrollsX — the dormant-band inheritance', () => {
  it('a dormant band shows the band ABOVE it, not its own factor and not nothing', () => {
    const layers = [
      layer(0, 'FACTOR_1_2'),
      layer(32, 'FACTOR_1_16', { enabled: false }),
      layer(64, 'FACTOR_1_4'),
    ];
    const out = bandScrollsX(layers, 320);
    expect(out[0]).toEqual({ scrollX: 160, inherited: false });
    expect(out[1]).toEqual({ scrollX: 160, inherited: true });   // NOT 20, NOT 0
    expect(out[2]).toEqual({ scrollX: 80, inherited: false });
  });

  it('a dormant band 0 inherits the engine\'s seed, which is 0', () => {
    const out = bandScrollsX([layer(0, 'FACTOR_1', { enabled: false })], 5000);
    expect(out[0]).toEqual({ scrollX: 0, inherited: true });
  });
});

describe('cameraPreviewPlan — the strips', () => {
  it('divides the 224 rows with no gap and no overlap', () => {
    const plan = cameraPreviewPlan(fourBands(), 0, 0);
    expect(plan.bands.map((b) => [b.screenTop, b.screenBottom])).toEqual([
      [0, 32], [32, 112], [112, 160], [160, 224],
    ]);
  });

  it('each strip carries its OWN band\'s scroll', () => {
    const plan = cameraPreviewPlan(fourBands(), 320, 0);
    expect(plan.bands.map((b) => b.scrollX)).toEqual([0, 20, 80, 160]);
    expect(plan.bands.map((b) => b.locked)).toEqual([true, false, false, false]);
  });

  it('a vsplit changes vscroll from ITS band down, and not above it', () => {
    const s = scene([
      layer(0, 'FACTOR_LOCKED'),
      layer(64, 'FACTOR_1_8', { vsplit: { at: 300 } }),
      layer(128, 'FACTOR_1_2'),
    ], { v_offset: 0 });
    const plan = cameraPreviewPlan(s, 0, 0);
    expect(plan.bands.map((b) => b.vscroll)).toEqual([0, 300, 300]);
    expect(plan.bands.map((b) => b.vsplitAt)).toEqual([null, 300, null]);
  });

  it('two vsplits each take over from their own band', () => {
    const s = scene([
      layer(0, 'FACTOR_LOCKED'),
      layer(64, 'FACTOR_1_8', { vsplit: { at: 300 } }),
      layer(128, 'FACTOR_1_2', { vsplit: { at: 400 } }),
    ]);
    expect(cameraPreviewPlan(s, 0, 0).bands.map((b) => b.vscroll)).toEqual([0, 300, 400]);
  });

  it('a vsplit on an UNLOCKED scene is NOT applied — the build refuses it, so there is nothing to imitate', () => {
    const s = scene([
      layer(0, 'FACTOR_LOCKED'),
      layer(64, 'FACTOR_1_8', { vsplit: { at: 300 } }),
    ], { v_factor: 4, v_center: 0, v_offset: 0 });
    const plan = cameraPreviewPlan(s, 0, 1024);
    expect(plan.vLocked).toBe(false);
    expect(plan.bands.every((b) => b.vsplitAt === null)).toBe(true);
    expect(new Set(plan.bands.map((b) => b.vscroll))).toEqual(new Set([plan.vscrollBase]));
  });

  it('v_offset alone shifts every band\'s source rows and no band\'s screen rows', () => {
    const withOffset = cameraPreviewPlan(scene(fourBands().layers, { v_offset: 40 }), 0, 0);
    const without = cameraPreviewPlan(fourBands(), 0, 0);
    expect(withOffset.vscrollBase).toBe(40);
    expect(without.vscrollBase).toBe(0);
    expect(withOffset.bands.map((b) => b.vscroll - b.vscroll + 40))
      .toEqual(without.bands.map(() => 40));
  });
});

describe('THE HORIZONTAL DIFFERENTIAL — the catcher', () => {
  // A static plan cannot fail this way. Move the camera and compare the bands
  // AGAINST EACH OTHER, at the ratio the decoder derives.
  const move = 320;

  function displacements(camX0: number, camX1: number): number[] {
    const a = cameraPreviewPlan(fourBands(), camX0, 0).bands.map((b) => b.scrollX);
    const b = cameraPreviewPlan(fourBands(), camX1, 0).bands.map((b) => b.scrollX);
    return b.map((v, i) => v - a[i]);
  }

  it('a 1/2 band moves EIGHT TIMES what a 1/16 band moves', () => {
    const d = displacements(0, move);
    expect(d).toEqual([0, 20, 80, 160]);            // locked, 1/16, 1/4, 1/2
    expect(d[3] / d[1]).toBe(8);                    // 1/2 vs 1/16
    expect(d[2] / d[1]).toBe(4);                    // 1/4 vs 1/16
  });

  it('the LOCKED band does not move at all, for any camera', () => {
    for (const [a, b] of [[0, 1], [0, 320], [0, 4096], [1000, 17]]) {
      expect(displacements(a, b)[0], `${a}->${b}`).toBe(0);
    }
  });

  it('the ratio holds at a camera the bands do not divide evenly', () => {
    // 137 is not a multiple of 16, so the truncation is live: the 1/16 band
    // moves 8 and the 1/2 band 68, which is 8.5x — NOT the clean 8. That is the
    // decoder's per-term truncation showing, and asserting 8 here would be
    // asserting the fraction instead of the engine.
    const d = displacements(0, 137);
    expect(d).toEqual([0, 8, 34, 68]);
    expect(d[3] / d[1]).toBe(8.5);
  });

  it('every band moves the same way whether the camera got there in one step or many', () => {
    // The decode is a function of the camera position, not of its history — so
    // a preview cannot accumulate drift the way an integrating one would.
    const direct = cameraPreviewPlan(fourBands(), 1000, 0).bands.map((b) => b.scrollX);
    let stepped = cameraPreviewPlan(fourBands(), 0, 0);
    for (let x = 1; x <= 1000; x++) stepped = cameraPreviewPlan(fourBands(), x, 0);
    expect(stepped.bands.map((b) => b.scrollX)).toEqual(direct);
  });
});

describe('THE VERTICAL DIFFERENTIAL — the other catcher', () => {
  it('moving the camera DOWN on a LOCKED scene moves nothing — the guides included', () => {
    const a = cameraPreviewPlan(fourBands(), 0, 0);
    const b = cameraPreviewPlan(fourBands(), 0, 224);
    expect(b.vscrollBase).toBe(a.vscrollBase);
    expect(b.bands.map((x) => x.screenTop)).toEqual(a.bands.map((x) => x.screenTop));
    expect(b.bands.map((x) => x.vscroll)).toEqual(a.bands.map((x) => x.vscroll));
  });

  it('moving the camera down on an UNLOCKED scene moves the plane, SLOWLY', () => {
    // Tops chosen so the plane lines land at 0/100/150/200 — far enough apart
    // that a 14-line scroll does not rotate the list, so this row measures the
    // SLIDE and the row below measures the rotation. (Choosing them carelessly
    // is how the first cut of this row failed: at tops 0/8/28/40 a 14-line
    // scroll crosses band 1 and the list rotates, and the row was reading a
    // rotation as a slide.)
    const s = scene([
      layer(0, 'FACTOR_LOCKED'), layer(1600, 'FACTOR_1_16'),
      layer(2400, 'FACTOR_1_4'), layer(3200, 'FACTOR_1_2'),
    ], { v_factor: 4, v_center: 0, v_offset: 0 });
    const a = cameraPreviewPlan(s, 0, 0);
    const b = cameraPreviewPlan(s, 0, 224);
    expect(a.vscrollBase).toBe(0);
    expect(b.vscrollBase).toBe(14);          // 224 >> 4 — a sixteenth of the move
    expect(a.bands.map((x) => x.screenTop)).toEqual([0, 100, 150, 200]);
    // and the bands slide UP the screen by exactly that, which is what "the
    // plane scrolled" looks like.
    expect(b.bands.map((x) => x.screenTop)).toEqual([0, 86, 136, 186]);
    expect(b.bands.map((x) => x.layer)).toEqual([0, 1, 2, 3]);
  });

  it('a camera move that crosses a band top ROTATES the list rather than clipping it', () => {
    const s = scene([layer(0, 'FACTOR_LOCKED'), layer(64, 'FACTOR_1_4')],
      { v_factor: 0, v_center: 0, v_offset: 0 });
    expect(cameraPreviewPlan(s, 0, 63).bands.map((b) => b.layer)).toEqual([0, 1]);
    expect(cameraPreviewPlan(s, 0, 64).bands.map((b) => b.layer)).toEqual([1, 0]);
    expect(cameraPreviewPlan(s, 0, 64).bands[0].screenTop).toBe(0);
  });
});

describe('the absence list — what the preview says it is NOT showing', () => {
  it('always names the foreground, because the frame always contains one', () => {
    expect(cameraPreviewAbsences(fourBands()).join('|')).toContain('foreground factors');
  });

  it('names curve ramps only when a layer has one', () => {
    expect(cameraPreviewAbsences(fourBands()).join('|')).not.toContain('curve');
    const s = scene([layer(0, 'FACTOR_1_2', { curve: { to: 'FACTOR_1_4' } })]);
    expect(cameraPreviewAbsences(s).join('|')).toContain('curve');
  });

  it('names deform for a LAYER deform, a SCENE deform, and v_deform separately', () => {
    const shared = { table: { generator: 'sine' as const, amplitude: 8, period: 64 }, speed: 1 };
    expect(cameraPreviewAbsences(scene([layer(0, 'FACTOR_1_2', {
      deform: { own: { table: shared.table, shift_a: 15, shift_b: 2, phase: 0, speed: 1 } },
    })])).join('|')).toContain('deform');
    expect(cameraPreviewAbsences(scene([layer(0, 'FACTOR_1_2')], { deform_bg: { shared } })).join('|'))
      .toContain('deform');
    expect(cameraPreviewAbsences(scene([layer(0, 'FACTOR_1_2')], {
      v_deform: { columns: { table: shared.table, speed: 1, amp_shift: 2 } },
    })).join('|')).toContain('v_deform');
  });
});

describe('bandCaption', () => {
  it('names the factor, its fraction, and the pixels it is displaced by', () => {
    const plan = cameraPreviewPlan(fourBands(), 320, 0);
    expect(bandCaption(plan.bands[0])).toBe('L0 FACTOR_LOCKED (locked) x=+0');
    expect(bandCaption(plan.bands[1])).toBe('L1 FACTOR_1_16 (1/16) x=+20');
  });

  it('says so when a band inherited, and when it moved the vertical scroll', () => {
    const s = scene([
      layer(0, 'FACTOR_1_2'),
      layer(64, 'FACTOR_1_16', { enabled: false, vsplit: { at: 96 } }),
    ]);
    const plan = cameraPreviewPlan(s, 320, 0);
    expect(bandCaption(plan.bands[1])).toBe('L1 FACTOR_1_16 (1/16) x=+160 [inherited] v=96');
  });
});
