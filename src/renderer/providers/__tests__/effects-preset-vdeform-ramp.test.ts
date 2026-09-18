// WHAT TURNING `v_deform` ON DOES TO A RAMP IN A DOCUMENT NOBODY IS LOOKING AT.
//
// ═══ THE DEFECT THIS MEASURES ═══
//
// `docs/reviews/2026-09-03-ew-ramp-scroll-mode.md` closed the READING end: a
// ramp card says whether its five numbers are a full-screen scroll or a 16-pixel
// sliver. The WRITING end stayed open, and the writing end is the one with the
// author's hand on it — one select, on a SCENE, that narrows every VSRAM ramp
// bound to every section that scene is bound to.
//
// Every row here is therefore about the JOIN walked BACKWARDS: given a scene,
// whose ramp did it just narrow?
//
//   1. a section that binds this scene AND a ramp preset is NARROWED, and the
//      sentence names the section and the preset that made it true;
//   2. a section that binds this scene and a preset with no ramp says NOTHING —
//      and that silence is derived (only `ramp` writes VSRAM), not a hedge;
//   3. a section binding a preset Aurora CANNOT READ declines, naming which
//      failure it was, rather than folding into either answer;
//   4. a section that does not bind this scene contributes nothing, including
//      through the act-default fallback.
//
// ⚠ THE ANTI-VACUOUS ROW IS `the sentence is not hard-wired`. Almost every row
// below would still pass if `vDeformRampSentence` ignored its argument and
// returned the narrowed arm forever. That row holds the SCENE, the sections and
// the bindings fixed, moves ONLY which preset the section binds, and requires
// the answer to change between "narrowed", "declined" and silent — which no
// constant answer can do.
//
// ⚠ AND THE TWO DIRECTIONS ARE HELD AGAINST EACH OTHER. `rampScrollBindings` and
// `vDeformRampBindings` resolve the same section->scene chain from opposite ends,
// and two panels that disagreed about it would each be individually plausible and
// jointly useless. The last describe block puts one fixture through both and
// requires them to agree — the row a per-function test cannot hold, because it is
// a fact about the SEAM and neither side owns it.

import { describe, it, expect } from 'vitest';
import type {
  EffectsScene, EffectsSceneLibrary, EffectsTableRef,
} from '../../../core/formats/effects/scene';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import {
  V_DEFORM_RAMP_LEAD, V_DEFORM_RAMP_NOTE, RAMP_SCROLL_COLUMN_WIDTH_PX,
  RAMP_SCROLL_MODE_NOTE, RAMP_SCROLL_LEAD,
  vDeformRampSentence, vDeformRampRegionSentence, vDeformRampRegionsUnreadableSentence,
} from '../../../core/formats/effects/ramp-scroll-mode';
import {
  vDeformRampBindings, vDeformRampAdvisory, sectionSceneRef,
  rampScrollBindings, vDeformRampRegionBindings,
} from '../effects-preset';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SCENE = 'aurora_local_vdefimpact_scene';
const OTHER_SCENE = 'aurora_local_vdefimpact_other';
const TABLE: EffectsTableRef = { generator: 'zero' };

/** A ramp preset — the only preset shape per-column VSRAM mode can reach. */
function rampPreset(id: string): EffectsPreset {
  return {
    schema: 1,
    id,
    ramp: {
      top: 64,
      lines: 32,
      target: { vsram: { addr: 2 } },
      start: { whole: 0, frac256: 0 },
      step: { whole: 0, frac256: 64 },
    },
  } as unknown as EffectsPreset;
}

/**
 * A BAND preset — the control that makes row 2 mean something.
 *
 * ⚠ IT IS THE REASON THE SILENCE IS A DERIVATION AND NOT A HEDGE. `$defs.band`'s
 * ON op has no `vsram` arm at all, so per-column mode cannot reach it; a row that
 * only ever showed ramp presets could not tell "we checked and it is unaffected"
 * from "we forgot to look".
 */
function bandPreset(id: string): EffectsPreset {
  return {
    schema: 1,
    id,
    bands: [{ top: 100, bot: 110, sh: false, on: { cram: { addr: 74, colours: [0] } } }],
  } as unknown as EffectsPreset;
}

function presetLib(
  presets: EffectsPreset[], unreadable: { path: string; reason: string }[] = [],
): EffectsPresetLibrary {
  return { presets, unreadable, notices: [] } as unknown as EffectsPresetLibrary;
}

function scene(id: string, vDeform: boolean): EffectsScene {
  return {
    schema: 1,
    id,
    layers: [],
    ...(vDeform
      ? {
        v_deform: { columns: { table: TABLE, speed: 0, amp_shift: 0 } },
        left_column_mask: 'accept',
      }
      : {}),
  } as unknown as EffectsScene;
}

function sceneLib(scenes: EffectsScene[]): EffectsSceneLibrary {
  return { scenes, unreadable: [], notices: [] } as unknown as EffectsSceneLibrary;
}

type Section = { rasterRef: string | null; sceneRef: string | null } | null;
const sec = (rasterRef: string | null, sceneRef: string | null): Section => ({ rasterRef, sceneRef });

describe('vDeformRampBindings: the join, walked backwards', () => {
  it('[a1] a section binding this scene AND a ramp preset is a narrowed row', () => {
    const rows = vDeformRampBindings(
      SCENE, [sec('r1', SCENE)], null, presetLib([rampPreset('r1')]),
    );
    expect(rows).toEqual([
      { section: 0, presetId: 'r1', carries: 'ramp', reason: null, via: 'section' },
    ]);
  });

  it('[a2] a section binding this scene through the ACT DEFAULT is bound just the same', () => {
    // `sceneRef: null` is the act default, not "no scene" — the trap the 09-03
    // row met from the other side and the reason `sectionSceneRef` is shared.
    const rows = vDeformRampBindings(
      SCENE, [sec('r1', null)], SCENE, presetLib([rampPreset('r1')]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].via).toBe('act');
    expect(rows[0].carries).toBe('ramp');
  });

  it('[a3] a band preset produces NO row: the derived silence, with its control', () => {
    // Same section, same scene, same binding shape as [a1]. Only the preset's
    // SHAPE moves, and it is the thing that decides.
    expect(vDeformRampBindings(
      SCENE, [sec('b1', SCENE)], null, presetLib([bandPreset('b1')]),
    )).toEqual([]);
    expect(vDeformRampBindings(
      SCENE, [sec('b1', SCENE)], null, presetLib([rampPreset('b1')]),
    )).toHaveLength(1);
  });

  it('[a4] a section bound to a DIFFERENT scene contributes nothing', () => {
    expect(vDeformRampBindings(
      SCENE, [sec('r1', OTHER_SCENE)], null, presetLib([rampPreset('r1')]),
    )).toEqual([]);
  });

  it('[a5] an act default of null is NOT this scene: it is aeon`s act_descriptor', () => {
    // The bottom of the chain is a file Aurora has never opened. Reading a null
    // act default as "this scene" would claim every unbound section.
    expect(vDeformRampBindings(
      SCENE, [sec('r1', null)], null, presetLib([rampPreset('r1')]),
    )).toEqual([]);
  });

  it('[a6] a section with no rasterRef contributes nothing', () => {
    expect(vDeformRampBindings(
      SCENE, [sec(null, SCENE)], null, presetLib([rampPreset('r1')]),
    )).toEqual([]);
  });

  it('[a7] a DANGLING preset ref declines rather than assuming there is no ramp', () => {
    const rows = vDeformRampBindings(
      SCENE, [sec('gone', SCENE)], null, presetLib([rampPreset('r1')]),
    );
    expect(rows).toEqual([
      { section: 0, presetId: 'gone', carries: 'unknown', reason: 'preset-dangling', via: 'section' },
    ]);
  });

  it('[a8] an UNREADABLE preset file is told apart from a dangling ref', () => {
    const rows = vDeformRampBindings(
      SCENE, [sec('broken', SCENE)], null,
      presetLib([], [{ path: '/p/editor/effects/presets/broken.json', reason: 'bad json' }]),
    );
    expect(rows[0].reason).toBe('preset-unreadable');
  });

  it('[a9] null sections are skipped, not crashed on', () => {
    expect(vDeformRampBindings(
      SCENE, [null, sec('r1', SCENE)], null, presetLib([rampPreset('r1')]),
    ).map((r) => r.section)).toEqual([1]);
  });
});

describe('vDeformRampSentence, and what it refuses to claim', () => {
  it('[b1] silent when nothing is narrowed and nothing is undecidable', () => {
    expect(vDeformRampSentence([])).toBeNull();
  });

  it('[b2] the narrowed arm names the section, the preset and the width', () => {
    const s = vDeformRampSentence([
      { section: 0, presetId: 'r1', carries: 'ramp', reason: null, via: 'section' },
    ]);
    expect(s).not.toBeNull();
    expect(s!.short).toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(s!.short).toContain('Section 0');
    expect(s!.short).toContain('"r1"');
    expect(s!.short).toContain(`${RAMP_SCROLL_COLUMN_WIDTH_PX}-pixel column`);
    // THE CONJUNCT RIDES ON THE ARM THAT CLAIMS A COLUMN — the 09-03 row's rule,
    // and this arm claims one.
    expect(s!.short).toContain('CAP_PER_COL_VSRAM');
  });

  it('[b3] verb and noun agree with the group size, in BOTH numbers', () => {
    // The defect the 09-03 harness found on its first run ("Section 1 scroll the
    // full width"): a generated clause that does not agree in number reads as a
    // bug in the panel and costs the sentence its authority.
    const one = vDeformRampSentence([
      { section: 0, presetId: 'r1', carries: 'ramp', reason: null, via: 'section' },
    ])!.short;
    expect(one).toContain('Section 0 binds this scene and preset "r1"');
    const two = vDeformRampSentence([
      { section: 0, presetId: 'r1', carries: 'ramp', reason: null, via: 'section' },
      { section: 2, presetId: 'r2', carries: 'ramp', reason: null, via: 'act' },
    ])!.short;
    expect(two).toContain('Sections 0 and 2 bind this scene');
    expect(two).toContain('presets "r1" and "r2"');
  });

  it('[b4] the DECLINE arm says which failure it was and claims neither answer', () => {
    const dangling = vDeformRampSentence([
      { section: 1, presetId: 'gone', carries: 'unknown', reason: 'preset-dangling', via: 'section' },
    ])!.short;
    expect(dangling).toContain(V_DEFORM_RAMP_LEAD.unknown);
    expect(dangling).toContain('not a preset in this project');
    expect(dangling).toContain('not decidable from here');
    // ⚠ THE POINT OF THE ARM: it must not assert that a ramp WAS narrowed.
    expect(dangling).not.toContain(V_DEFORM_RAMP_LEAD.narrowed);

    const unreadable = vDeformRampSentence([
      { section: 1, presetId: 'x', carries: 'unknown', reason: 'preset-unreadable', via: 'section' },
    ])!.short;
    expect(unreadable).toContain('could not be read');
    expect(unreadable).not.toContain('not a preset in this project');
  });

  it('[b5] a narrowed row and an undecidable row both appear: neither is suppressed', () => {
    const s = vDeformRampSentence([
      { section: 0, presetId: 'r1', carries: 'ramp', reason: null, via: 'section' },
      { section: 3, presetId: 'gone', carries: 'unknown', reason: 'preset-dangling', via: 'act' },
    ])!.short;
    expect(s).toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(s).toContain(V_DEFORM_RAMP_LEAD.unknown);
  });

  it('[b6] the hover carries the measured aeon chain rather than a second copy of it', () => {
    const s = vDeformRampSentence([
      { section: 0, presetId: 'r1', carries: 'ramp', reason: null, via: 'section' },
    ])!;
    expect(s.full).toBe(V_DEFORM_RAMP_NOTE);
    // ⚠ QUOTED, NOT RETYPED. A second transcription of the $0B chain is a second
    // thing to drift out of agreement with aeon's source.
    expect(s.full).toContain(RAMP_SCROLL_MODE_NOTE);
    expect(s.full).toContain('$0B bit 2');
  });

  it('[b7] ANTI-VACUOUS: the same scene and the same section, only the preset moves', () => {
    // Everything the author can see is held: one section, index 0, binding this
    // scene by its own ref. ONLY the preset it binds changes — and all three
    // answers must be different, which a hard-wired sentence cannot do.
    const sections: Section[] = [sec('p', SCENE)];
    const withRamp = vDeformRampAdvisory(SCENE, sections, null, presetLib([rampPreset('p')]));
    const withBand = vDeformRampAdvisory(SCENE, sections, null, presetLib([bandPreset('p')]));
    const withNone = vDeformRampAdvisory(SCENE, sections, null, presetLib([]));

    expect(withRamp).not.toBeNull();
    expect(withRamp!.short).toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(withBand).toBeNull();
    expect(withNone).not.toBeNull();
    expect(withNone!.short).toContain(V_DEFORM_RAMP_LEAD.unknown);
    // Three inputs, three distinct outcomes — the shape no constant satisfies.
    expect(new Set([withRamp?.short ?? null, withBand?.short ?? null, withNone?.short ?? null]).size)
      .toBe(3);
  });
});

describe('the seam: both directions resolve the binding through ONE chain', () => {
  it('[c1] sectionSceneRef is what both ends call, and it spells the act default', () => {
    expect(sectionSceneRef({ sceneRef: 'mine' }, 'acts')).toEqual({ ref: 'mine', via: 'section' });
    expect(sectionSceneRef({ sceneRef: null }, 'acts')).toEqual({ ref: 'acts', via: 'act' });
    expect(sectionSceneRef({ sceneRef: null }, null)).toEqual({ ref: null, via: 'act' });
  });

  it('[c2] one fixture, read from both ends, agrees about WHICH sections are joined', () => {
    // ⚠ THE ROW NEITHER SIDE OWNS. The ramp card asks "whose scene decides my
    // mode"; the scene panel asks "whose ramp did I narrow". They are the same
    // join, and a test per function would let them drift apart while both stayed
    // green. Section 0 binds by its own ref, section 2 by the act default,
    // section 1 binds a different scene entirely.
    const sections: Section[] = [
      sec('r1', SCENE),
      sec('r1', OTHER_SCENE),
      sec('r1', null),
    ];
    const scenes = sceneLib([scene(SCENE, true), scene(OTHER_SCENE, false)]);

    const forward = rampScrollBindings(sections, SCENE, scenes, 'r1');
    const backward = vDeformRampBindings(SCENE, sections, SCENE, presetLib([rampPreset('r1')]));

    // The forward reader sees all three (they all bind the preset) and says which
    // scene each landed on; the backward reader sees exactly the ones that landed
    // on THIS scene. Those two sets must be the same sections.
    expect(forward.filter((b) => b.sceneId === SCENE).map((b) => b.section)).toEqual([0, 2]);
    expect(backward.map((b) => b.section)).toEqual([0, 2]);
    // And they must agree about HOW each got there.
    expect(forward.filter((b) => b.sceneId === SCENE).map((b) => b.via)).toEqual(['section', 'act']);
    expect(backward.map((b) => b.via)).toEqual(['section', 'act']);
  });

  it('[c3] and the two sentences describe the SAME event from opposite ends', () => {
    const sections: Section[] = [sec('r1', SCENE)];
    const scenes = sceneLib([scene(SCENE, true)]);
    const forward = rampScrollBindings(sections, null, scenes, 'r1');
    const backward = vDeformRampAdvisory(SCENE, sections, null, presetLib([rampPreset('r1')]));
    // The ramp card says "one 16-pixel column"; the scene panel says "this
    // narrows a ramp elsewhere". Same section, same width, one fact.
    expect(forward[0].mode).toBe('column');
    expect(backward!.short).toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(backward!.short).toContain(`${RAMP_SCROLL_COLUMN_WIDTH_PX}-pixel column`);
    expect(RAMP_SCROLL_LEAD.column).toContain(`${RAMP_SCROLL_COLUMN_WIDTH_PX}-PIXEL COLUMN`);
  });
});

// ═══ THE SAME JOIN ON A REGION-MODE ACT ═══
//
// (SCENE-RELATION-REGION-MODE, the rest, 2026-09-18 — candidate row 3 of the
// shipped parcel's review packet.)
//
// ⚠ WHAT WAS ACTUALLY WRONG, AND IT IS NOT WHAT THE PACKET SAID. The packet
// pointed at `ramp-scroll-mode.ts`'s `act-unset` clause ("takes the act default
// and this act names no editor scene"), which belongs to `rampScrollModeSentence`
// and is reachable only from `BandPresetPanel`, not from the scene panel. The
// defect at the SCENE panel's call is the attribution: `vDeformRampBindings`
// needs a SECTION `rasterRef`, which is exactly what aeon's check_mode_conflict
// refuses beside regions.json, and it reaches the scene through the act-default
// fallback — so on a region-mode act every row it can produce names a section
// that owns no binding and a preset bound by a ref the build rejects.
describe('vDeformRampAdvisory in region mode: the bindings live on region rows', () => {
  const rect = { x: 0, y: 0, w: 2048, h: 2048 };
  const doc = (regions: Array<{ id: string; sceneRef?: string | null; rasterRef?: string | null }>) =>
    ({ schema: 1, act: 'zz_act1', regions: regions.map((r) => ({ ...r, rect, preset: 'ZZ' })) });
  const regionAct = (regions: Parameters<typeof doc>[0]) =>
    ({ regions: { document: doc(regions) as never, loadedPath: 'data/regions.json', unreadable: null } });
  const refusedAct = () =>
    ({ regions: { document: null, loadedPath: null, unreadable: { path: 'r.json', reason: 'bad' } } });
  const sectionModeAct = () => ({ regions: { document: null, loadedPath: null, unreadable: null } });

  it('[c1] the section walk claimed a narrowed ramp on an act whose sections bind nothing', () => {
    // THE DEFECT, HELD SIDE BY SIDE WITH ITS FIX. Same sections, same presets,
    // same act scene; the only difference is whether the act's regions.json is
    // handed in. Without it the sentence names Section 0 and preset "r1".
    const sections = [sec('r1', null)];
    const presets = presetLib([rampPreset('r1')]);
    const before = vDeformRampAdvisory(SCENE, sections, SCENE, presets);
    expect(before).not.toBeNull();
    expect(before!.short).toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(before!.short).toContain('Section 0');
    // With it, the section rows are gone: no region of this act binds the scene.
    expect(vDeformRampAdvisory(SCENE, sections, SCENE, presets, regionAct([{ id: 'sec0' }])))
      .toBeNull();
  });

  it('[c2] a REGION binding this scene and a ramp preset is the narrowed row, named by region id', () => {
    const s = vDeformRampAdvisory(SCENE, [], null, presetLib([rampPreset('r1')]),
      regionAct([{ id: 'sec4', sceneRef: SCENE, rasterRef: 'r1' }]));
    expect(s).not.toBeNull();
    expect(s!.short).toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(s!.short).toContain('Region sec4 binds this scene and preset "r1"');
    expect(s!.short).toContain(`${RAMP_SCROLL_COLUMN_WIDTH_PX}-pixel column`);
    // THE HOVER IS THE SAME DOCUMENT IN BOTH MODES, and that is the assertion
    // that the region arm is the same sentence and not a second transcription.
    expect(s!.full).toBe(V_DEFORM_RAMP_NOTE);
  });

  it('[c3] the two arms are ONE sentence body: only the binder noun differs', () => {
    // DERIVED, not eyeballed. The same rows through both entry points must
    // differ in exactly the binder words and in nothing else.
    const region = vDeformRampRegionSentence([
      { regionId: '0', presetId: 'r1', carries: 'ramp', reason: null },
      { regionId: '2', presetId: 'r2', carries: 'unknown', reason: 'preset-dangling' },
    ]);
    const section = vDeformRampSentence([
      { section: 0, presetId: 'r1', carries: 'ramp', reason: null, via: 'section' },
      { section: 2, presetId: 'r2', carries: 'unknown', reason: 'preset-dangling', via: 'section' },
    ]);
    expect(region!.short.replace(/Region/g, 'Section').replace(/region /g, 'section '))
      .toBe(section!.short);
    expect(region!.full).toBe(section!.full);
  });

  it('[c4] one row per region ID, in author order, with the plural verb', () => {
    // A carved region is several entries under one id carrying identical
    // bindings and ONE Regions panel row; naming it twice would point twice at
    // one control. `b` below is carved.
    const rows = vDeformRampRegionBindings(SCENE, doc([
      { id: 'b', sceneRef: SCENE, rasterRef: 'r1' },
      { id: 'a', sceneRef: OTHER_SCENE, rasterRef: 'r1' },
      { id: 'b', sceneRef: SCENE, rasterRef: 'r1' },
      { id: 'c', sceneRef: SCENE, rasterRef: 'r2' },
    ]) as never, presetLib([rampPreset('r1'), rampPreset('r2')]));
    expect(rows.map((r) => r.regionId)).toEqual(['b', 'c']);
    const s = vDeformRampRegionSentence(rows);
    expect(s!.short).toContain('Regions b and c bind this scene and presets "r1" and "r2"');
  });

  it('[c5] a null region rasterRef is not "inherits the act raster", and a null sceneRef is not a binder', () => {
    // Design call 2 of the shipped parcel, applied to BOTH fields: aeon lowers an
    // absent region binding to a defer, so resolving either to the act's would be
    // a guess about rung 2.
    const presets = presetLib([rampPreset('r1')]);
    expect(vDeformRampRegionBindings(SCENE, doc([{ id: 'a', sceneRef: SCENE }]) as never, presets))
      .toEqual([]);
    expect(vDeformRampRegionBindings(SCENE, doc([{ id: 'a', rasterRef: 'r1' }]) as never, presets))
      .toEqual([]);
  });

  it('[c6] a preset the region binds that Aurora cannot read DECLINES, naming which failure', () => {
    const dangling = vDeformRampRegionBindings(
      SCENE, doc([{ id: 'a', sceneRef: SCENE, rasterRef: 'gone' }]) as never, presetLib([]));
    expect(dangling).toEqual([
      { regionId: 'a', presetId: 'gone', carries: 'unknown', reason: 'preset-dangling' },
    ]);
    const unreadable = vDeformRampRegionBindings(
      SCENE, doc([{ id: 'a', sceneRef: SCENE, rasterRef: 'broken' }]) as never,
      presetLib([], [{ path: '/p/editor/effects/presets/broken.json', reason: 'bad json' }]));
    expect(unreadable[0].reason).toBe('preset-unreadable');
    expect(vDeformRampRegionSentence(unreadable)!.short)
      .toContain('region a binds preset "broken", whose file could not be read');
  });

  it('[c7] a region binding a preset with NO ramp says nothing, which is derived and not a hedge', () => {
    // The anti-constant row: the scene, the region and the binding are held
    // fixed and ONLY the preset moves, so a function returning one answer
    // forever cannot pass all three arms.
    const region = [{ id: 'a', sceneRef: SCENE, rasterRef: 'p' }];
    const act = regionAct(region);
    expect(vDeformRampAdvisory(SCENE, [], null, presetLib([rampPreset('p')]), act)!.short)
      .toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(vDeformRampAdvisory(SCENE, [], null, presetLib([bandPreset('p')]), act)).toBeNull();
    expect(vDeformRampAdvisory(SCENE, [], null, presetLib([]), act)!.short)
      .toContain(V_DEFORM_RAMP_LEAD.unknown);
  });

  it('[c8] a refused regions.json says the bindings cannot be told, not that nothing is narrowed', () => {
    const s = vDeformRampAdvisory(SCENE, [sec('r1', SCENE)], SCENE,
      presetLib([rampPreset('r1')]), refusedAct());
    expect(s).toEqual(vDeformRampRegionsUnreadableSentence());
    expect(s!.short).toContain(V_DEFORM_RAMP_LEAD.regionsUnreadable);
    expect(s!.short).toContain('The Regions panel says why the file was refused.');
    // It is a THIRD state: it must claim neither arm.
    expect(s!.short).not.toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(s!.short).not.toContain('Section 0');
  });

  it('[c9] SECTION MODE IS UNTOUCHED: an act with no regions file answers exactly as before', () => {
    const sections = [sec('r1', SCENE), sec('gone', SCENE)];
    const presets = presetLib([rampPreset('r1')]);
    expect(vDeformRampAdvisory(SCENE, sections, null, presets, sectionModeAct()))
      .toEqual(vDeformRampAdvisory(SCENE, sections, null, presets));
    expect(vDeformRampAdvisory(SCENE, sections, null, presets)!.short)
      .toContain('Section 0');
  });

  it('[c10] on OJZ act 1 as shipped, nothing is narrowed, and that is read out of the file', () => {
    // NOT A TYPED EXPECTATION. The committed copy of aeon's OJZ act 1
    // regions.json (provenance beside it) is read here and the claim is
    // DERIVED from it: no region of that act carries a sceneRef and a rasterRef
    // at the same time, so no region can both bind a scene and narrow a ramp.
    // A re-vendor that added one would flip this row rather than leave a stale
    // pin green.
    const document = JSON.parse(readFileSync(
      resolve(__dirname, '../../../../test/fixtures/regions/ojz_act1.regions.json'), 'utf8'));
    const both = (document.regions as Array<{ id: string; sceneRef?: string | null; rasterRef?: string | null }>)
      .filter((r) => (r.sceneRef ?? null) !== null && (r.rasterRef ?? null) !== null);
    expect(both).toEqual([]);
    const bound = (document.regions as Array<{ id: string; sceneRef?: string | null }>)
      .filter((r) => (r.sceneRef ?? null) !== null);
    expect(bound.length).toBeGreaterThan(0);
    const act = { regions: { document, loadedPath: 'x/regions.json', unreadable: null } };
    for (const r of bound) {
      expect(vDeformRampAdvisory(r.sceneRef as string, [], null,
        presetLib([rampPreset('r1')]), act), `scene ${r.sceneRef}`).toBeNull();
    }
  });

  it('[c11] no en dash or em dash in any region-mode ramp sentence', () => {
    const texts = [
      vDeformRampAdvisory(SCENE, [], null, presetLib([rampPreset('r1')]),
        regionAct([{ id: 'a', sceneRef: SCENE, rasterRef: 'r1' }]))!.short,
      vDeformRampAdvisory(SCENE, [], null, presetLib([]),
        regionAct([{ id: 'a', sceneRef: SCENE, rasterRef: 'gone' }]))!.short,
      vDeformRampRegionsUnreadableSentence().short,
    ];
    const codes = texts.flatMap((t) => [...t].map((ch) => ch.codePointAt(0)));
    expect(codes).not.toContain(0x2013);
    expect(codes).not.toContain(0x2014);
  });
});
