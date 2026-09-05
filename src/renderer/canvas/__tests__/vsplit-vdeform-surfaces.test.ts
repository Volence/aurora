// AEON'S **SECOND** VSPLIT ENSURE, ACROSS EVERY SURFACE THAT JUDGES OR DRAWS A
// SPLIT.
//
// ═══ THE DEFECT THIS MEASURES ═══
//
// `scene()` carries TWO ensures against a `vsplit`, on adjacent lines
// (aeon `engine/level/scene_dsl.emp`, read at `origin/master` `e81fd349`):
//
//     ensure(any_vsplit == 0 || v_factor == 15,                        …)
//     ensure(any_vsplit == 0 || scene_vdeform_is_none(v_deform) == 1,  …)
//
// and the second one's own words are: "in per-column mode (VDP reg $0B bit 2)
// VSRAM entry 1 is PLANE B OF COLUMN 0, not the plane … so a whole-plane
// mid-frame write below the line would shift ONE 16-px column of forty".
//
// Aurora transcribed the FIRST everywhere and the SECOND in one place. So a
// scene that is LOCKED (satisfying ensure 1) and carries a `v_deform` (breaking
// ensure 2) was:
//
//   • drawn by `cameraPreviewPlan` with a full-width split applied — a picture
//     of a ROM that cannot be built, which the file's own comment two lines up
//     forbids in as many words;
//   • judged legal by `splitRefusal`, so the raster strip drew the mark with no
//     refusal at all;
//   • disclosed by exactly one sentence, in the Deform section — the position
//     ROADMAP row 80 judged INSUFFICIENT for the twin refusal.
//
// ⚠ THE FIXTURE IS THE WHOLE ARGUMENT AND IT MUST STAY LOCKED. Every row here
// uses `v_factor: 15`. A scene that also broke ensure 1 would be refused by the
// arm that already existed, and every row would pass without the new code — the
// [[extremes-hide-what-they-clip]] failure. `[z]` asserts the fixture satisfies
// ensure 1, so a later edit cannot quietly make this file vacuous.
//
// ⚠ AND EVERY ROW HAS ITS CONTROL. For each surface, the same scene with the
// `v_deform` REMOVED must behave the old way — otherwise "the split is gone"
// would be indistinguishable from "splits never worked here".

import { describe, it, expect } from 'vitest';
import { cameraPreviewPlan } from '../camera-preview';
import { splitRefusal, rasterTimelineView } from '../raster-timeline';
import {
  vsplitVDeformAdvisoryParts, vsplitVDeformAdvisory, vsplitLockAdvisoryParts,
  sceneDeformAdvisories, layerTopSpace, VSPLIT_VDEFORM_CLAUSES, VSPLIT_LOCK_CLAUSES,
} from '../../providers/effects-aeon';
import type {
  EffectsScene, EffectsLayer, EffectsFactor, EffectsTableRef,
} from '../../../core/formats/effects/scene';

const LOCK = 15;
const TABLE: EffectsTableRef = { generator: 'zero' };

function layer(world_y: number, fb: EffectsFactor, extra: Partial<EffectsLayer> = {}): EffectsLayer {
  return { world_y, fa: 'FACTOR_1', fb, ...extra };
}

/**
 * A LOCKED scene with one split at a line the engine accepts (3..223).
 *
 * `at: 300` is a Plane-B row deliberately above 223, so a surface that mistook
 * the split's PAYLOAD for its POSITION would land somewhere obviously wrong
 * rather than plausibly — `raster-timeline.test.ts`'s fixture reasoning, reused
 * because the same confusion is available here.
 */
function splitScene(over: Partial<EffectsScene> = {}): EffectsScene {
  return {
    schema: 1,
    id: 'vdef_split_probe',
    v_factor: LOCK,
    layers: [
      layer(0, 'FACTOR_LOCKED'),
      layer(96, 'FACTOR_1_4', { vsplit: { at: 300 } }),
    ],
    ...over,
  } as EffectsScene;
}

/** The same scene, now also attaching a per-column table. Ensure 1 still holds. */
function splitPlusVDeform(): EffectsScene {
  return splitScene({
    v_deform: { columns: { table: TABLE, speed: 0, amp_shift: 0 } },
    left_column_mask: 'accept',
  } as Partial<EffectsScene>);
}

describe('the fixture itself: so this file cannot go vacuous', () => {
  it('[z] BOTH fixtures satisfy ensure 1 (locked), so only ensure 2 is under test', () => {
    // If this ever fails, every row below is passing for the OLD arm's reason and
    // proves nothing about the new one.
    expect(layerTopSpace(splitScene())).toBe('screen');
    expect(layerTopSpace(splitPlusVDeform())).toBe('screen');
    expect(vsplitLockAdvisoryParts(splitScene(), splitScene().layers[1])).toBeNull();
    expect(vsplitLockAdvisoryParts(splitPlusVDeform(), splitPlusVDeform().layers[1])).toBeNull();
  });
});

describe('cameraPreviewPlan: it stops drawing a document that cannot build', () => {
  it('[p1] a locked scene with no v_deform still applies its split (the control)', () => {
    const plan = cameraPreviewPlan(splitScene(), 0, 0);
    expect(plan.bands.map((b) => b.vsplitAt)).toEqual([null, 300]);
    expect(plan.bands[1].vscroll).toBe(300);
  });

  it('[p2] the SAME scene plus a v_deform applies no split at all', () => {
    const plan = cameraPreviewPlan(splitPlusVDeform(), 0, 0);
    expect(plan.bands.map((b) => b.vsplitAt)).toEqual([null, null]);
    // ⚠ AND IT IS NOT REDRAWN AS ONE COLUMN EITHER. The build refuses the scene,
    // so the sliver never renders; painting one would be a picture of a ROM that
    // cannot exist. Every band keeps the whole-plane base.
    expect(plan.bands.every((b) => b.vscroll === plan.vscrollBase)).toBe(true);
  });

  it('[p3] the preview still SAYS the v_deform is unreproduced', () => {
    // Dropping the split must not also drop the honesty line about the columns —
    // two different absences, and a picture that quietly lost both would look
    // like a plain background.
    expect(cameraPreviewPlan(splitPlusVDeform(), 0, 0).absent)
      .toContain('v_deform columns (no clock)');
  });

  it('[p4] the strip built on that plan carries no split row for it', () => {
    // The seam: `rasterTimelineView` reads the plan the preview produced, so a
    // fix applied to one and not the other would leave the strip drawing a mark
    // the picture no longer shows.
    expect(rasterTimelineView(splitScene(), cameraPreviewPlan(splitScene(), 0, 0))
      .splits.map((s) => s.at)).toEqual([300]);
    const withVDeform = splitPlusVDeform();
    const rows = rasterTimelineView(withVDeform, cameraPreviewPlan(withVDeform, 0, 0)).splits;
    expect(rows).toHaveLength(1);
    expect(rows[0].refusal).not.toBeNull();
  });
});

describe('splitRefusal: the second ensure, transcribed', () => {
  it('[s1] a locked scene with no v_deform and an in-range line refuses nothing', () => {
    const s = splitScene();
    expect(splitRefusal(s, s.layers[1])).toBeNull();
  });

  it('[s2] the SAME scene plus a v_deform refuses, and says why', () => {
    const s = splitPlusVDeform();
    const r = splitRefusal(s, s.layers[1]);
    expect(r).not.toBeNull();
    expect(r).toContain('refuses the WHOLE SCENE');
    expect(r).toContain(VSPLIT_VDEFORM_CLAUSES.sceneIs);
    expect(r).toContain(VSPLIT_VDEFORM_CLAUSES.mechanism);
    expect(r).toContain(VSPLIT_VDEFORM_CLAUSES.remedies);
  });

  it('[s3] the mechanism names what the author will SEE, not just an address', () => {
    // "both write the same word" is a fact about addressing and tells an author
    // nothing about the picture. One column of forty is the picture.
    expect(VSPLIT_VDEFORM_CLAUSES.mechanism).toContain('16-pixel column');
    expect(VSPLIT_VDEFORM_CLAUSES.mechanism).toContain('forty');
    expect(VSPLIT_VDEFORM_CLAUSES.sceneIs).toContain('$0B bit 2');
  });

  it('[s4] the LOCK arm still wins when both are broken, and it is the right one', () => {
    // Order matters: an unlocked layer top is not a screen line at all, so the
    // v_deform sentence below it would be arithmetic on a quantity that does not
    // exist. The lock arm must be the one that speaks.
    const both = splitScene({
      v_factor: 3,
      v_deform: { columns: { table: TABLE, speed: 0, amp_shift: 0 } },
      left_column_mask: 'accept',
    } as Partial<EffectsScene>);
    const r = splitRefusal(both, both.layers[1]);
    expect(r).toContain(VSPLIT_LOCK_CLAUSES.mechanism);
    expect(r).not.toContain(VSPLIT_VDEFORM_CLAUSES.mechanism);
  });

  it('[s5] the PRECONDITION, written down: this asks "why is THIS split refused"', () => {
    // ⚠ THIS ROW EXISTS BECAUSE ITS FIRST DRAFT WAS WRONG AND WENT RED. It
    // asserted that a splitless layer refuses nothing — a property `splitRefusal`
    // has never had. The LOCK arm returns a refusal for a splitless layer too
    // (both arms test the SCENE and neither tests the layer), and the new arm was
    // written to match rather than to diverge. What makes that safe is the
    // caller's guard, not the function's, so the guard is asserted where it is:
    // in [s6] below. Tightening the function here would change the shipped lock
    // arm's behaviour on a question this parcel was not sent to settle.
    const s = splitPlusVDeform();
    expect(splitRefusal(s, s.layers[0])).not.toBeNull();
    const unlocked = splitScene({ v_factor: 3 } as Partial<EffectsScene>);
    expect(splitRefusal(unlocked, unlocked.layers[0])).not.toBeNull();
  });

  it('[s6] and the caller never asks it about a layer with no split', () => {
    // `rasterTimelineView` filters on `layerEmitsFire` before it asks, so layer 0
    // — which carries no `vsplit` — produces no row on either scene. That is what
    // makes [s5]'s precondition sound in the shipped path.
    for (const s of [splitScene(), splitPlusVDeform()]) {
      const rows = rasterTimelineView(s, cameraPreviewPlan(s, 0, 0)).splits;
      expect(rows.map((r) => r.layer)).toEqual([1]);
    }
  });
});

describe('the layer card: row 80 applied to the refusal it never reached', () => {
  it('[l1] null on a scene with no v_deform, and null on a layer with no split', () => {
    const flat = splitScene();
    expect(vsplitVDeformAdvisoryParts(flat, flat.layers[1])).toBeNull();
    const vd = splitPlusVDeform();
    expect(vsplitVDeformAdvisoryParts(vd, vd.layers[0])).toBeNull();
  });

  it('[l2] three parts on the pair, and the diagnosis names the build refusal', () => {
    const s = splitPlusVDeform();
    const parts = vsplitVDeformAdvisoryParts(s, s.layers[1])!;
    expect(parts.diagnosis).toContain('this layer authors a Plane B split');
    expect(parts.diagnosis).toContain('The build refuses this scene');
    expect(parts.mechanism).toBe(VSPLIT_VDEFORM_CLAUSES.mechanism);
    expect(parts.remedies).toBe(VSPLIT_VDEFORM_CLAUSES.remedies);
    // ⚠ THE DIAGNOSIS IS THE HALF THAT CAN NEVER BE HOVER-ONLY — the precedent
    // `sceneVsplitLockAdvisoryParts` states. It must stand alone as a sentence.
    expect(parts.diagnosis.length).toBeGreaterThan(40);
  });

  it('[l3] BOTH advisories appear when both ensures are broken: neither suppresses the other', () => {
    // The remedies differ (one moves v_factor, one moves v_deform), so choosing
    // which of two real refusals the author may see is `sceneDeformAdvisories`'
    // guard-3 mistake repeated.
    const both = splitScene({
      v_factor: 3,
      v_deform: { columns: { table: TABLE, speed: 0, amp_shift: 0 } },
      left_column_mask: 'accept',
    } as Partial<EffectsScene>);
    expect(vsplitLockAdvisoryParts(both, both.layers[1])).not.toBeNull();
    expect(vsplitVDeformAdvisoryParts(both, both.layers[1])).not.toBeNull();
  });

  it('[l4] the one-sentence form joins the same three parts', () => {
    const s = splitPlusVDeform();
    const one = vsplitVDeformAdvisory(s, s.layers[1])!;
    expect(one).toContain(VSPLIT_VDEFORM_CLAUSES.mechanism);
    expect(one).toContain(VSPLIT_VDEFORM_CLAUSES.remedies);
  });
});

describe('the scene-level list: composed, not retyped', () => {
  it('[d1] the deform advisory now composes the shared clauses', () => {
    const said = sceneDeformAdvisories(splitPlusVDeform());
    const arm = said.find((a) => a.includes('authors a Plane B split'));
    expect(arm).toBeDefined();
    expect(arm).toContain(VSPLIT_VDEFORM_CLAUSES.sceneIs);
    expect(arm).toContain(VSPLIT_VDEFORM_CLAUSES.remedies);
    expect(arm).toContain('layer 1');
  });

  it('[d2] and it stays SHORT: the mechanism rides on the card that has a hover', () => {
    // `column-layout.tsx`'s Advisory block records what an unsplit advisory costs
    // this column: the v_factor row's ran to 21 wrapped lines / ~460px. These
    // arms render as plain hints with no hover, so the long clause must not be
    // in them.
    const arm = sceneDeformAdvisories(splitPlusVDeform())
      .find((a) => a.includes('authors a Plane B split'))!;
    expect(arm).not.toContain(VSPLIT_VDEFORM_CLAUSES.mechanism);
  });

  it('[d3] silent on a scene with a v_deform and no split (the control)', () => {
    const noSplit = {
      schema: 1,
      id: 'vdef_only',
      v_factor: LOCK,
      layers: [layer(0, 'FACTOR_LOCKED')],
      v_deform: { columns: { table: TABLE, speed: 0, amp_shift: 0 } },
      left_column_mask: 'accept',
    } as unknown as EffectsScene;
    expect(sceneDeformAdvisories(noSplit).some((a) => a.includes('Plane B split'))).toBe(false);
  });
});
