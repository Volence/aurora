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
  vDeformRampSentence,
} from '../../../core/formats/effects/ramp-scroll-mode';
import {
  vDeformRampBindings, vDeformRampAdvisory, sectionSceneRef,
  rampScrollBindings,
} from '../effects-preset';

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

describe('vDeformRampBindings — the join, walked backwards', () => {
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

  it('[a3] a band preset produces NO row — the derived silence, with its control', () => {
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

  it('[a5] an act default of null is NOT this scene — it is aeon`s act_descriptor', () => {
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

describe('vDeformRampSentence — and what it refuses to claim', () => {
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

  it('[b5] a narrowed row and an undecidable row both appear — neither is suppressed', () => {
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

describe('the seam — both directions resolve the binding through ONE chain', () => {
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
