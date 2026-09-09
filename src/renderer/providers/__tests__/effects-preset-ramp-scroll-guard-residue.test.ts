// GUARD RESIDUE in `ramp-scroll-mode.ts`: the predicates that no row was holding.
//
// `effects-preset-ramp-scroll-mode.test.ts` drives the JOIN and asserts which
// ARM a binding configuration lands in, and it is good at that: of 32 mutations
// planted in the module on 2026-09-09, 22 died against it and its sibling
// `effects-preset-vdeform-ramp.test.ts`. This file holds the ten that did not,
// three of which are shown below to be incapable of discriminating at all and
// are given a row asserting their PRECONDITION instead.
// See `docs/reviews/2026-09-09-guard-residue-ramp.md`.
//
// ═══ WHY THESE SURVIVED, WHICH IS THE FINDING AND NOT THE RATIO ═══
//
// They are not scattered. Every one of them is in the SENTENCE ASSEMBLY rather
// than in the join: which words the derivation picks once it already knows the
// answer. The arm is asserted everywhere; the clause is asserted almost nowhere.
// So `sceneList` could name one scene twice, `viaClause` could tell an author to
// open the wrong document, `joinClauses` could emit a dangling connective, and
// the existing rows would stay green because the LEAD was still right.
//
// ⚠ AND ONE OF THEM IS NOT A GRAMMAR NICETY. `unknownClause`'s act road told a
// missing scene apart from an unreadable one nowhere: swapping the two arms left
// the whole suite green. The SECTION road's two are told apart (a plant there
// died), so this is partial coverage on a two-road guard, which reads as covered
// from anywhere except a mutation.
//
// ═══ BOTH DIRECTIONS, BECAUSE THIS IS A BLINDNESS REPORTER ═══
//
// `RampScrollMode` is `'full' | 'column' | 'unknown'`, so "I could not look"
// shares a union with "I looked, and this is what the scene says". A file that
// only ever produced one of those could not tell you the other was reachable.
// Every pair below therefore asserts BOTH: the answer Aurora gives when it read
// the scene, and the answer it gives when it could not, against the same shape,
// with the two required to differ.

import { describe, it, expect } from 'vitest';
import type { EffectsScene, EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import type {
  RampScrollBinding, VDeformRampBinding,
} from '../../../core/formats/effects/ramp-scroll-mode';
import {
  RAMP_SCROLL_LEAD, V_DEFORM_RAMP_LEAD,
  rampScrollModeSentence, vDeformRampSentence,
} from '../../../core/formats/effects/ramp-scroll-mode';
import { rampScrollBindings, vDeformRampBindings } from '../effects-preset';

const PRESET = 'aurora_local_rampmode_probe';

/** A binding the module would get from a scene it READ. */
const seen = (
  section: number, mode: 'full' | 'column', sceneId: string, via: 'section' | 'act' = 'section',
): RampScrollBinding => ({ section, mode, sceneId, via, reason: null });

/** A binding the module would get from a scene it COULD NOT read. */
const blind = (
  section: number, reason: RampScrollBinding['reason'], sceneId: string | null,
  via: RampScrollBinding['via'],
): RampScrollBinding => ({ section, mode: 'unknown', sceneId, via, reason });

// ---------------------------------------------------------------------------
// 1. `sceneList`: one scene named once, two scenes named as two
// ---------------------------------------------------------------------------

describe('sceneList names each scene once, in the right number', () => {
  /**
   * Dropping the dedupe left the whole suite green. The existing agreement row
   * binds TWO sections to the SAME scene and asserts the sentence contains
   * `"haze"`, which a sentence saying `their scenes "haze" and "haze"` also
   * does.
   */
  it('two sections bound to the SAME scene name it ONCE, in the singular', () => {
    const { short } = rampScrollModeSentence([seen(0, 'full', 'haze'), seen(1, 'full', 'haze')]);
    expect(short).toContain('its scene "haze"');
    expect(short).not.toContain('their scenes');
    expect(short.split('"haze"').length - 1, 'the scene is named more than once').toBe(1);
  });

  /**
   * And the plural arm, which is the half a dropped singular branch corrupts:
   * without it one scene renders as `their scenes  and "sky"`, and every
   * existing row still passes because `"sky"` is still in there.
   */
  it('one scene is `its scene`, two scenes are `their scenes A and B`, with no dangling joiner', () => {
    const one = rampScrollModeSentence([seen(0, 'full', 'sky')]).short;
    expect(one).toContain('its scene "sky"');
    expect(one).not.toContain('their scenes');
    expect(one).not.toContain('scenes  and');

    const two = rampScrollModeSentence([seen(0, 'full', 'sky'), seen(1, 'full', 'dusk')]).short;
    expect(two).toContain('their scenes "sky" and "dusk"');
    expect(two).not.toContain('its scene');
    expect(two).not.toContain('  and');
  });
});

// ---------------------------------------------------------------------------
// 2. `viaClause`: WHICH DOCUMENT to open, in all three states
// ---------------------------------------------------------------------------

describe('viaClause tells the author which document decided it', () => {
  /**
   * Three states and only three, and the mixed one is the state that survived:
   * describing a mixed group as "the act default; no section names a scene of
   * its own" sends an author to the act to change a section's answer.
   */
  it('act only, section only, and MIXED are three different clauses', () => {
    const actOnly = rampScrollModeSentence([seen(0, 'full', 'sky', 'act')]).short;
    expect(actOnly).toContain('the act default; no section names a scene of its own');

    const sectionOnly = rampScrollModeSentence([seen(0, 'full', 'sky', 'section')]).short;
    expect(sectionOnly).not.toContain('the act default;');
    expect(sectionOnly).not.toContain('some by their own sceneRef');

    const mixed = rampScrollModeSentence([
      seen(0, 'full', 'sky', 'section'), seen(1, 'full', 'dusk', 'act'),
    ]).short;
    expect(mixed).toContain('some by their own sceneRef, some by the act default');
    expect(mixed).not.toContain('no section names a scene of its own');

    expect(new Set([actOnly, sectionOnly, mixed]).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3. ⚠ THE BLINDNESS ROAD: four reasons, told apart, in BOTH directions
// ---------------------------------------------------------------------------

describe('⚠ every reason Aurora could not look is a DIFFERENT sentence', () => {
  /**
   * ⚠ THE ACT ROAD HAD NOTHING HOLDING IT. `act-dangling` says the scene is not
   * in this project; `act-unreadable` says the file is there and would not
   * parse. They are different repairs (make the scene, or fix the file), and
   * reporting either with the other's words sends the author at the wrong one.
   * The SECTION road's two are asserted by an existing row; swapping the ACT
   * road's two left the suite green.
   */
  it('the ACT road tells a MISSING scene apart from an UNREADABLE one', () => {
    const dangling = rampScrollModeSentence([blind(0, 'act-dangling', 'ghost', 'act')]).short;
    const unreadable = rampScrollModeSentence([blind(0, 'act-unreadable', 'ghost', 'act')]).short;

    expect(dangling).toContain('takes the act default "ghost", which is not a scene in this project');
    expect(dangling).not.toContain('could not be read');
    expect(unreadable).toContain('takes the act default "ghost", whose file could not be read');
    expect(unreadable).not.toContain('is not a scene in this project');
    expect(dangling).not.toBe(unreadable);
  });

  /** And the section road, so the pair is symmetric and neither can drift alone. */
  it('the SECTION road does too, and the four sentences are four', () => {
    const say = (r: RampScrollBinding['reason']) =>
      rampScrollModeSentence([blind(0, r, 'ghost', r!.startsWith('act') ? 'act' : 'section')]).short;
    const four = [
      say('section-dangling'), say('section-unreadable'),
      say('act-dangling'), say('act-unreadable'),
    ];
    expect(new Set(four).size).toBe(4);
  });

  /**
   * ⚠ AND THE OTHER DIRECTION OF THE UNION, WHICH IS THE HALF A BLINDNESS
   * REPORTER LOSES FIRST. `'unknown'` sits in one union with `'full'` and
   * `'column'`, so the file has to show that "I looked and the scene has no
   * v_deform" is reachable and is a DIFFERENT sentence from "I could not look".
   * The same section index, the same scene id, and only what Aurora managed to
   * read moves.
   */
  it('"I looked and found no v_deform" and "I could not look" are different answers', () => {
    const looked = rampScrollModeSentence([seen(0, 'full', 'sky')]).short;
    const couldNot = rampScrollModeSentence([blind(0, 'section-unreadable', 'sky', 'section')]).short;

    expect(looked).toContain(RAMP_SCROLL_LEAD.full);
    expect(looked).toContain('so VSRAM stays whole-plane');
    expect(couldNot).toContain(RAMP_SCROLL_LEAD.unknown);
    expect(couldNot).toContain('Full-screen and one');
    expect(couldNot).not.toContain(RAMP_SCROLL_LEAD.full);
    expect(looked).not.toBe(couldNot);
  });

  /**
   * The DEFAULT arm of `unknownClause`, which the provider cannot reach (it sets
   * a reason on every unknown) but the exported signature can. Filling it in
   * with the `act-unset` text would put `act_parallax_config` in front of an
   * author whose section never took the act default at all.
   */
  it('an unknown with NO reason says only that, and does not guess the act default', () => {
    const { short } = rampScrollModeSentence([blind(0, null, 'sky', 'section')]);
    expect(short).toContain('section 0\'s scene could not be resolved');
    expect(short).not.toContain('act_parallax_config');
    expect(short).not.toContain('act_descriptor.emp');
  });
});

// ---------------------------------------------------------------------------
// 4. `joinClauses`: one clause is one clause
// ---------------------------------------------------------------------------

describe('joinClauses does not put a connective in front of a single clause', () => {
  it('one unknown section reads as a sentence, two are joined with `; and `', () => {
    const one = rampScrollModeSentence([blind(0, 'section-dangling', 'ghost', 'section')]).short;
    expect(one).not.toContain('; and');
    expect(one).toContain('but section 0\'s sceneRef names "ghost"');

    const two = rampScrollModeSentence([
      blind(0, 'section-dangling', 'ghost', 'section'),
      blind(1, 'act-unset', null, null),
    ]).short;
    expect(two).toContain('; and section 1');
    expect(two.split('; and').length - 1).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. The V-deform side: `presetList`, and its own two-direction pair
// ---------------------------------------------------------------------------

describe('presetList names each preset once', () => {
  const narrowed = (section: number, presetId: string): VDeformRampBinding =>
    ({ section, presetId, carries: 'ramp', reason: null, via: 'section' });

  it('two sections binding the SAME preset name it ONCE, in the singular', () => {
    const s = vDeformRampSentence([narrowed(0, 'r1'), narrowed(1, 'r1')])!;
    expect(s.short).toContain(V_DEFORM_RAMP_LEAD.narrowed);
    expect(s.short).toContain('preset "r1"');
    expect(s.short).not.toContain('presets "r1" and "r1"');
    expect(s.short.split('"r1"').length - 1).toBe(1);
  });

  it('two DIFFERENT presets are named as two', () => {
    const s = vDeformRampSentence([narrowed(0, 'r1'), narrowed(1, 'r2')])!;
    expect(s.short).toContain('presets "r1" and "r2"');
  });
});

// ---------------------------------------------------------------------------
// 6. ⚠ THREE PLANTS THAT CANNOT DISCRIMINATE, and the preconditions they rest on
// ---------------------------------------------------------------------------
//
// Each of the three mutations below changes the source and provably cannot
// change any outcome, so it is out of the denominator rather than counted as a
// survivor. What is asserted here is the PROPERTY that makes it so, in a place
// that CAN fail, so the day the property ends the claim goes red instead of the
// packet quietly being wrong.

describe('⚠ the properties three non-discriminating plants rest on', () => {
  const TABLE = { generator: 'zero' } as const;
  const flat = (id: string): EffectsScene => ({ schema: 1, id, layers: [] } as unknown as EffectsScene);
  const withVDeform = (id: string): EffectsScene => ({
    schema: 1,
    id,
    layers: [],
    v_deform: { columns: { table: TABLE, speed: 0, amp_shift: 0 } },
    left_column_mask: 'accept',
  } as unknown as EffectsScene);
  const sceneLib = (
    scenes: EffectsScene[], unreadable: { path: string; reason: string }[] = [],
  ): EffectsSceneLibrary => ({ scenes, unreadable, notices: [] } as unknown as EffectsSceneLibrary);
  const sec = (rasterRef: string | null, sceneRef: string | null) => ({ rasterRef, sceneRef });

  /**
   * `sceneList` skips a null `sceneId`. It cannot fire: a `full` or `column`
   * binding is only produced when a scene was FOUND, and the id it was found by
   * is what goes in the field. Asserted over the join rather than argued.
   */
  it('a DECIDED binding always carries the scene that decided it', () => {
    const scenes = sceneLib([flat('sky'), withVDeform('haze')], [
      { path: 'data/editor/effects/broken.json', reason: 'not JSON' },
    ]);
    const all = [
      ...rampScrollBindings([sec(PRESET, 'sky')], null, scenes, PRESET),
      ...rampScrollBindings([sec(PRESET, 'haze')], null, scenes, PRESET),
      ...rampScrollBindings([sec(PRESET, null)], 'haze', scenes, PRESET),
      ...rampScrollBindings([sec(PRESET, 'ghost')], null, scenes, PRESET),
      ...rampScrollBindings([sec(PRESET, 'broken')], null, scenes, PRESET),
      ...rampScrollBindings([sec(PRESET, null)], null, scenes, PRESET),
    ];
    expect(all.length).toBe(6);
    expect(all.filter((b) => b.mode !== 'unknown').length,
      'no decided binding in the spread, so this row proves nothing').toBe(3);
    for (const b of all) {
      if (b.mode !== 'unknown') expect(b.sceneId, `${b.mode} binding with a null sceneId`).not.toBeNull();
      // and the mirror: a null id happens only on the one reason that has no scene to name
      if (b.sceneId === null) expect(b.reason).toBe('act-unset');
    }
  });

  /**
   * The `full` and `column` arms are tested in sequence, so swapping their order
   * looks like a real mutation. It is not: both are reached only when exactly
   * ONE group is non-empty, because two non-empty groups take the split arm one
   * branch earlier.
   */
  it('a binding set with BOTH arms in it never reaches either single-answer arm', () => {
    const both = rampScrollModeSentence([seen(0, 'full', 'sky'), seen(1, 'column', 'haze')]).short;
    expect(both).toContain(RAMP_SCROLL_LEAD.split);
    expect(both).not.toContain(RAMP_SCROLL_LEAD.full);
    expect(both).not.toContain(RAMP_SCROLL_LEAD.column);
    // and each alone does take its own arm, so the row above is not vacuous
    expect(rampScrollModeSentence([seen(0, 'full', 'sky')]).short)
      .toContain(RAMP_SCROLL_LEAD.full);
    expect(rampScrollModeSentence([seen(1, 'column', 'haze')]).short)
      .toContain(RAMP_SCROLL_LEAD.column);
  });

  /**
   * `VDeformRampBinding.carries` is a CLOSED two-member union, so testing for
   * `=== 'ramp'` and for `!== 'unknown'` are the same predicate. That is a
   * property of the type, and the day a third member is added it stops being
   * one, so it is pinned over the join rather than asserted in prose.
   */
  it('`carries` has exactly two members, and `reason` is set on exactly one of them', () => {
    const rampPreset = (id: string): EffectsPreset => ({
      schema: 1, id, ramp: { target: 'vsram', top: 8, lines: 16, start: 0, step: 1 },
    } as unknown as EffectsPreset);
    const presetLib = (
      presets: EffectsPreset[], unreadable: { path: string; reason: string }[] = [],
    ): EffectsPresetLibrary => (
      { presets, unreadable, notices: [] } as unknown as EffectsPresetLibrary);

    const SCENE = 'haze';
    const rows = [
      ...vDeformRampBindings(SCENE, [sec('r1', SCENE)], null, presetLib([rampPreset('r1')])),
      ...vDeformRampBindings(SCENE, [sec('gone', SCENE)], null, presetLib([rampPreset('r1')])),
      ...vDeformRampBindings(SCENE, [sec('broken', SCENE)], null, presetLib([], [
        { path: '/p/editor/effects/presets/broken.json', reason: 'bad json' },
      ])),
    ];
    expect(rows.length).toBe(3);
    expect(new Set(rows.map((r) => r.carries))).toEqual(new Set(['ramp', 'unknown']));
    for (const r of rows) {
      expect(['ramp', 'unknown'], `a third member of carries: ${r.carries}`).toContain(r.carries);
      expect(r.reason === null, `reason and carries disagree on section ${r.section}`)
        .toBe(r.carries === 'ramp');
    }
  });
});
