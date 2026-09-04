// WHICH OF TWO COMPLETELY DIFFERENT EFFECTS A VSRAM `ramp` PRODUCES — the
// per-section derivation, and the four cases the answer falls into.
//
// ═══ THE DEFECT THIS MEASURES ═══
//
// A `ramp` document is IDENTICAL whether it scrolls the whole screen or a
// 16-pixel sliver. VDP $0B bit 2 decides, and it is raised by the SCENE bound to
// the SECTION bound to the preset — three documents, two panels, one sentence.
// So every row here is about the JOIN, not about the ramp:
//
//   1. a preset bound to sections whose scenes AGREE says which arm, and names
//      the sections and the scenes that made it true;
//   2. a preset bound to sections whose scenes DISAGREE says there is no single
//      answer and names WHICH sections get WHICH — never the majority, never the
//      first, never the "usual" one;
//   3. an UNBOUND preset asserts neither arm;
//   4. a bound section whose scene Aurora cannot resolve is `unknown` and says
//      why — the case that is the DEFAULT in aeon's own tree today.
//
// ⚠ THE ANTI-VACUOUS ROW IS `the sentence is not hard-wired`. Every other row
// here would still pass if `rampScrollModeSentence` ignored its argument and
// returned one of the two arms forever, provided the row happened to expect that
// arm. That row holds the preset, the sections and the bindings FIXED, moves
// ONLY the bound scene's `v_deform`, and requires the sentence to change — which
// no constant answer can do.
//
// ⚠ AND NOTHING HERE READS A LINE NUMBER. That was written while the card's
// display-span readout was contested by one line (a real ROM rendered 5..223
// where the panel derived 4..223, at two different tops, 2026-09-03); it SETTLED
// in the ROM's favour at empyrean `e9409dc`, the contract now says `top + 2` and
// the readout derives it. ⚠ "THE ROM" WAS AN EMULATOR, AND `bfc000e`
// (2026-09-04) MADE THE CONTRACT SAY SO: `top + 2` is as read on oracle's RUST
// core; the legacy C++ core reads both raster tiers one line earlier on the same
// bytes and is disqualified as a referee for self-inconsistency (79-83 of 224
// rows between two identical boots); the landing line is UNPINNED in the Rust
// core's own recon; no hardware referee exists. Two readers agreeing is what
// settled, not the machine answering. The separation still stands and this file is the
// evidence it was worth having: the number moved and not one row here changed.
// This sentence is about the HORIZONTAL extent, and a row that reached for
// `rampDisplaySpan` would tie it to a fact it does not depend on.

import { describe, it, expect } from 'vitest';
import type {
  EffectsScene, EffectsSceneLibrary, EffectsTableRef,
} from '../../../core/formats/effects/scene';
import {
  RAMP_SCROLL_LEAD, RAMP_SCROLL_COLUMN_SPAN, RAMP_SCROLL_COLUMN_WIDTH_PX,
  RAMP_SCROLL_MODE_NOTE, RAMP_SCROLL_MODE_MEASURED_AT,
  rampScrollModeSentence,
} from '../../../core/formats/effects/ramp-scroll-mode';
import { rampScrollBindings, rampScrollModeAdvisory } from '../effects-preset';
import { vDeformValue } from '../effects-aeon';

const PRESET = 'aurora_local_rampmode_probe';
/** The schema's own zero generator — the simplest legal `$defs/tableRef`. */
const TABLE: EffectsTableRef = { generator: 'zero' };
const OTHER = 'somebody_elses_preset';

/** A scene with no per-column table — the FULL-SCREEN arm's cause. */
function flatScene(id: string, over: Partial<EffectsScene> = {}): EffectsScene {
  return { schema: 1, id, layers: [], ...over } as EffectsScene;
}

/**
 * A scene that DOES attach a per-column table — the COLUMN arm's cause.
 *
 * The payload is the schema's own shape (`v_deform.columns` with a table, a
 * speed and an amp_shift); what makes it the column arm is only that the key is
 * an object rather than `"none"`, which is exactly what `vDeformValue` asks.
 */
function vDeformScene(id: string): EffectsScene {
  return flatScene(id, {
    v_deform: { columns: { table: TABLE, speed: 0, amp_shift: 0 } },
    left_column_mask: 'accept',
  } as Partial<EffectsScene>);
}

function sceneLib(scenes: EffectsScene[], unreadable: { path: string; reason: string }[] = []):
EffectsSceneLibrary {
  return { scenes, unreadable, notices: [] } as unknown as EffectsSceneLibrary;
}

/** A section sidecar, as much of one as this derivation reads. */
const sec = (rasterRef: string | null, sceneRef: string | null) => ({ rasterRef, sceneRef });

// ---------------------------------------------------------------------------
// 0. The fixtures are what they claim to be — the floor under every row below
// ---------------------------------------------------------------------------

describe('the fixtures really differ in the ONE key the rule turns on', () => {
  /**
   * ⚠ WITHOUT THIS ROW EVERY OTHER ROW COULD BE MEASURING TWO IDENTICAL SCENES.
   * The whole rule is "v_deform, and nothing else", so the two fixtures must
   * differ in `v_deform` and the difference must be the one `vDeformValue`
   * reports — which is the SAME function the scene panel's own V-deform row
   * reads, not a second spelling of "off".
   */
  it('flatScene has no column table, vDeformScene has one, and vDeformValue says so', () => {
    expect(vDeformValue(flatScene('a'))).toBeNull();
    expect(vDeformValue(vDeformScene('b'))).not.toBeNull();
    // and the two documents are otherwise the same shape
    expect(Object.keys(flatScene('a')).sort()).toEqual(['id', 'layers', 'schema']);
  });

  /** `"none"` and ABSENT are the same off state, and a bare `!== undefined` misses one. */
  it('an explicit v_deform: "none" is the FULL arm, exactly as an absent key is', () => {
    const explicit = flatScene('n', { v_deform: 'none' } as Partial<EffectsScene>);
    expect(vDeformValue(explicit)).toBeNull();
    const b = rampScrollBindings([sec(PRESET, 'n')], null, sceneLib([explicit]), PRESET);
    expect(b.map((x) => x.mode)).toEqual(['full']);
  });

  /**
   * ⚠ THE WRONG KEY, PLANTED. `deform_fg`/`deform_bg` are attachment "shared" —
   * a plane-wide HORIZONTAL wobble — and raise no VSRAM mode bit. A derivation
   * keyed on them would call this scene the column arm.
   */
  it('deform_fg/deform_bg do NOT narrow the ramp — only v_deform does', () => {
    const wobble = flatScene('w', {
      deform_fg: { shared: { table: TABLE, speed: 3 } },
      deform_bg: { shared: { table: TABLE, speed: 3 } },
    } as Partial<EffectsScene>);
    // Anti-vacuous: the plant really is on the document.
    expect((wobble as { deform_bg?: unknown }).deform_bg).toBeDefined();
    const b = rampScrollBindings([sec(PRESET, 'w')], null, sceneLib([wobble]), PRESET);
    expect(b.map((x) => x.mode)).toEqual(['full']);
    expect(rampScrollModeSentence(b).short).toContain(RAMP_SCROLL_LEAD.full);
  });
});

// ---------------------------------------------------------------------------
// 1. The binding join — who is even in the answer
// ---------------------------------------------------------------------------

describe('only the sections that BIND this preset are in the answer', () => {
  it('a section bound to a different preset, and an empty section, are both skipped', () => {
    const scenes = sceneLib([flatScene('sky'), vDeformScene('haze')]);
    const b = rampScrollBindings(
      [sec(OTHER, 'haze'), null, sec(PRESET, 'sky'), sec(null, 'haze')],
      null, scenes, PRESET,
    );
    expect(b.map((x) => x.section)).toEqual([2]);
    // Anti-vacuous: section 0 WOULD have answered `column` had it been included,
    // so the skip is doing work rather than the fixture being uniform.
    expect(rampScrollBindings([sec(PRESET, 'haze')], null, scenes, PRESET)[0].mode)
      .toBe('column');
  });
});

// ---------------------------------------------------------------------------
// 2. CASE ONE — the sections agree
// ---------------------------------------------------------------------------

describe('CASE: the bound sections agree', () => {
  it('no v_deform anywhere → FULL-SCREEN, naming the section and the scene', () => {
    const b = rampScrollBindings(
      [null, sec(PRESET, 'sky')], null, sceneLib([flatScene('sky')]), PRESET,
    );
    const { short } = rampScrollModeSentence(b);
    expect(short).toContain(RAMP_SCROLL_LEAD.full);
    expect(short).toContain('FULL WIDTH');
    expect(short).toContain('Section 1');
    expect(short).toContain('"sky"');
    // and it does NOT claim the other arm
    expect(short).not.toContain(RAMP_SCROLL_LEAD.column);
    // the capability conjunct rides only on an arm that claims a column
    expect(short).not.toContain('CAP_PER_COL_VSRAM');
  });

  it('v_deform everywhere → ONE 16-PIXEL COLUMN, with the MEASURED span, not 0-15', () => {
    const b = rampScrollBindings(
      [sec(PRESET, 'haze'), sec(PRESET, 'haze')], null, sceneLib([vDeformScene('haze')]), PRESET,
    );
    const { short } = rampScrollModeSentence(b);
    expect(short).toContain(RAMP_SCROLL_LEAD.column);
    expect(short).toContain('Sections 0 and 1');
    expect(short).toContain('"haze"');
    // ⚠ THE MEASURED SPAN, DERIVED FROM THE CONSTANT — a row that typed "4-19"
    // would stay green if somebody tidied the constant to 0-15.
    expect(short)
      .toContain(`x = ${RAMP_SCROLL_COLUMN_SPAN.first}-${RAMP_SCROLL_COLUMN_SPAN.last}`);
    expect(short).toContain('not x = 0-15');
    expect(short).toContain(`${RAMP_SCROLL_COLUMN_WIDTH_PX}-pixel column`);
    // the conjunct is SAID rather than dropped
    expect(short).toContain('CAP_PER_COL_VSRAM');
    expect(short).not.toContain(RAMP_SCROLL_LEAD.full);
  });

  /**
   * ⚠ THE TIDY SPAN IS THE FABRICATION THIS GUARDS. `x = 0..15` is what the
   * addressing suggests and what a writer reaches for; the aeon lane MEASURED
   * 4..19 and attributes the offset to the plane's own H-scroll. If the constant
   * is ever "corrected" to the tidy number without a new measurement, this row
   * is the one that has to be argued with.
   */
  it('the published column span is the measured one, not the tidy one', () => {
    expect(RAMP_SCROLL_COLUMN_SPAN.first).toBe(4);
    expect(RAMP_SCROLL_COLUMN_SPAN.last).toBe(19);
    expect(RAMP_SCROLL_COLUMN_SPAN.last - RAMP_SCROLL_COLUMN_SPAN.first + 1)
      .toBe(RAMP_SCROLL_COLUMN_WIDTH_PX);
  });
});

// ---------------------------------------------------------------------------
// 3. CASE TWO — sceneRef: null is the ACT DEFAULT, not "no scene"
// ---------------------------------------------------------------------------

describe('CASE: sceneRef null resolves through the ACT DEFAULT', () => {
  /**
   * ⚠ THE FAILURE THIS FORBIDS IS "null = absent". Treating a null `sceneRef` as
   * no scene would report every section that never touched the scene dropdown as
   * unanswerable, while the act was in fact naming a scene for all of them —
   * and the arm it names here is the one the section itself never mentions.
   */
  it('the act default decides it, and the sentence says the answer came from there', () => {
    const scenes = sceneLib([vDeformScene('act_haze')]);
    const b = rampScrollBindings([sec(PRESET, null)], 'act_haze', scenes, PRESET);
    expect(b).toEqual([{
      section: 0, mode: 'column', sceneId: 'act_haze', via: 'act', reason: null,
    }]);
    const { short } = rampScrollModeSentence(b);
    expect(short).toContain(RAMP_SCROLL_LEAD.column);
    expect(short).toContain('the act default');
    expect(short).toContain('"act_haze"');
  });

  it('a section\'s OWN sceneRef wins over the act default', () => {
    const scenes = sceneLib([vDeformScene('act_haze'), flatScene('mine')]);
    const b = rampScrollBindings([sec(PRESET, 'mine')], 'act_haze', scenes, PRESET);
    expect(b[0]).toMatchObject({ mode: 'full', sceneId: 'mine', via: 'section' });
    // Anti-vacuous: the act default really would have said the other arm.
    expect(rampScrollBindings([sec(PRESET, null)], 'act_haze', scenes, PRESET)[0].mode)
      .toBe('column');
  });
});

// ---------------------------------------------------------------------------
// 4. CASE THREE — bound to nothing
// ---------------------------------------------------------------------------

describe('CASE: nothing binds this preset', () => {
  it('asserts NEITHER arm and points at the control that would decide it', () => {
    const scenes = sceneLib([flatScene('sky'), vDeformScene('haze')]);
    const b = rampScrollBindings([sec(OTHER, 'sky'), null], null, scenes, PRESET);
    expect(b).toEqual([]);
    const { short } = rampScrollModeSentence(b);
    expect(short).toContain(RAMP_SCROLL_LEAD.unbound);
    expect(short).toContain('no section binds this preset');
    expect(short).toContain('Section row above');
    // ⚠ NEITHER ARM IS CLAIMED. "probably full-screen, that's the common case"
    // is exactly the drawn lie this row exists to remove.
    expect(short).not.toContain(RAMP_SCROLL_LEAD.full);
    expect(short).not.toContain(RAMP_SCROLL_LEAD.column);
  });
});

// ---------------------------------------------------------------------------
// 5. CASE FOUR — bound, and Aurora cannot resolve the scene
// ---------------------------------------------------------------------------

describe('CASE: a bound section whose scene Aurora cannot read', () => {
  /**
   * ⚠ THIS IS THE DEFAULT CASE IN AEON'S TREE TODAY. Their `project.json` has
   * `sceneRef: null` on the act and there is no `data/editor/effects/` at all, so
   * a freshly bound section resolves to the ENGINE's hand-authored
   * `act_parallax_config`. Folding that into "full-screen" would be a confident
   * sentence about a file this editor has never opened.
   */
  it('act default unset → `act-unset`, naming act_descriptor.emp and refusing both arms', () => {
    const b = rampScrollBindings([sec(PRESET, null)], null, sceneLib([]), PRESET);
    expect(b).toEqual([{
      section: 0, mode: 'unknown', sceneId: null, via: null, reason: 'act-unset',
    }]);
    const { short } = rampScrollModeSentence(b);
    expect(short).toContain(RAMP_SCROLL_LEAD.unknown);
    expect(short).toContain('act_parallax_config');
    expect(short).toContain('act_descriptor.emp');
    expect(short).toContain('Aurora does not read');
    expect(short).not.toContain(RAMP_SCROLL_LEAD.full);
    expect(short).not.toContain(RAMP_SCROLL_LEAD.column);
  });

  it('a dangling section ref and a dangling act default are told apart', () => {
    const gone = rampScrollBindings([sec(PRESET, 'ghost')], null, sceneLib([]), PRESET);
    expect(gone[0]).toMatchObject({ reason: 'section-dangling', sceneId: 'ghost', via: 'section' });
    expect(rampScrollModeSentence(gone).short).toContain('is not a scene in this project');

    const actGone = rampScrollBindings([sec(PRESET, null)], 'ghost', sceneLib([]), PRESET);
    expect(actGone[0]).toMatchObject({ reason: 'act-dangling', sceneId: 'ghost', via: 'act' });
    expect(rampScrollModeSentence(actGone).short).toContain('takes the act default "ghost"');
  });

  it('an UNREADABLE scene file is a different sentence from a missing one', () => {
    const lib = sceneLib([], [{ path: 'data/editor/effects/broken.json', reason: 'not JSON' }]);
    const b = rampScrollBindings([sec(PRESET, 'broken')], null, lib, PRESET);
    expect(b[0]).toMatchObject({ reason: 'section-unreadable' });
    expect(rampScrollModeSentence(b).short).toContain('could not be read');
    // and the two really are different sentences
    expect(rampScrollModeSentence(b).short)
      .not.toBe(rampScrollModeSentence(
        rampScrollBindings([sec(PRESET, 'gone')], null, sceneLib([]), PRESET)).short);
  });
});

// ---------------------------------------------------------------------------
// 6. CASE FIVE — the sections DISAGREE
// ---------------------------------------------------------------------------

describe('CASE: the bound sections disagree — and the panel says so', () => {
  /**
   * ⚠ NO MAJORITY, NO FIRST, NO "USUAL". Two sections say full and one says
   * column; the sentence must name all three groups. A derivation that picked
   * the majority would tell this author their sliver is a full-screen scroll.
   */
  it('names WHICH sections get WHICH arm, and claims no single answer', () => {
    const scenes = sceneLib([flatScene('sky'), flatScene('dusk'), vDeformScene('haze')]);
    const b = rampScrollBindings(
      [sec(PRESET, 'sky'), sec(PRESET, 'dusk'), sec(OTHER, 'haze'), sec(PRESET, 'haze')],
      null, scenes, PRESET,
    );
    expect(b.map((x) => `${x.section}:${x.mode}`)).toEqual(['0:full', '1:full', '3:column']);

    const { short } = rampScrollModeSentence(b);
    expect(short).toContain(RAMP_SCROLL_LEAD.split);
    expect(short).toContain('no single answer');
    expect(short).toContain('Sections 0 and 1');
    expect(short).toContain('Section 3');
    expect(short).toContain('"sky"');
    expect(short).toContain('"dusk"');
    expect(short).toContain('"haze"');
    // the majority arm is NOT presented as the answer
    expect(short).not.toContain(RAMP_SCROLL_LEAD.full);
    expect(short).not.toContain(RAMP_SCROLL_LEAD.column);

    // ⚠ AND IT READS AS ENGLISH IN BOTH NUMBERS. A generated clause that says
    // "Section 1 scroll the full width" reads as a bug in the panel and costs
    // the sentence the authority it needs; the first run of the CDP harness
    // caught exactly that.
    expect(short).toContain('Sections 0 and 1 scroll the full width');
    expect(short).toContain('Section 3 scrolls one');
  });

  it('a THIRD group — determined and undetermined together — is also reported', () => {
    const scenes = sceneLib([flatScene('sky'), vDeformScene('haze')]);
    const b = rampScrollBindings(
      [sec(PRESET, 'sky'), sec(PRESET, 'haze'), sec(PRESET, null)], null, scenes, PRESET,
    );
    const { short } = rampScrollModeSentence(b);
    expect(short).toContain(RAMP_SCROLL_LEAD.split);
    expect(short).toContain('Section 0');
    expect(short).toContain('Section 1');
    expect(short).toContain('section 2');
    expect(short).toContain('act_parallax_config');
  });
});

// ---------------------------------------------------------------------------
// 7. ⚠ THE ANTI-VACUOUS ROW — a hard-wired answer cannot pass this
// ---------------------------------------------------------------------------

describe('⚠ the sentence is DERIVED, not hard-wired to either arm', () => {
  /**
   * ═══ WHAT MAKES THIS ROW THE ONE THAT MATTERS ═══
   *
   * Every other row in this file expects a particular arm, so each of them would
   * still pass against a `rampScrollModeSentence` that ignored its argument and
   * returned that arm forever — provided you only ran that row.
   *
   * This one holds the PRESET, the SECTIONS and the BINDINGS byte-identical and
   * moves exactly one thing: whether the bound scene carries a `v_deform`. Then
   * it requires the two sentences to DIFFER and each to carry its own arm's
   * lead. No constant string can satisfy both halves, and neither can a
   * derivation that keys on the preset, the section index, or the ramp's own
   * numbers — none of which moved.
   */
  it('one key on ONE OTHER DOCUMENT flips the answer, with everything else fixed', () => {
    const sections = [sec(PRESET, 'scene_under_test')];
    const flat = rampScrollModeSentence(
      rampScrollBindings(sections, null, sceneLib([flatScene('scene_under_test')]), PRESET));
    const col = rampScrollModeSentence(
      rampScrollBindings(sections, null, sceneLib([vDeformScene('scene_under_test')]), PRESET));

    // the ONLY difference between the two runs, stated as an assertion
    expect(vDeformValue(flatScene('scene_under_test'))).toBeNull();
    expect(vDeformValue(vDeformScene('scene_under_test'))).not.toBeNull();
    expect(JSON.stringify(sections)).toBe(JSON.stringify([sec(PRESET, 'scene_under_test')]));

    expect(flat.short).not.toBe(col.short);
    expect(flat.short).toContain(RAMP_SCROLL_LEAD.full);
    expect(col.short).toContain(RAMP_SCROLL_LEAD.column);
    expect(flat.short).not.toContain(RAMP_SCROLL_LEAD.column);
    expect(col.short).not.toContain(RAMP_SCROLL_LEAD.full);
  });

  /**
   * The same argument one level out: FIVE distinct binding configurations must
   * produce FIVE distinct sentences. A hard-wired answer collapses them to one;
   * a derivation that read only "is anything bound" collapses them to two.
   */
  it('five different binding configurations produce five different sentences', () => {
    const scenes = sceneLib([flatScene('sky'), vDeformScene('haze')]);
    const say = (sections: ReturnType<typeof sec>[], actRef: string | null) =>
      rampScrollModeAdvisory(sections, actRef, scenes, PRESET).short;
    const sentences = [
      say([], null),
      say([sec(PRESET, 'sky')], null),
      say([sec(PRESET, 'haze')], null),
      say([sec(PRESET, 'sky'), sec(PRESET, 'haze')], null),
      say([sec(PRESET, null)], null),
    ];
    expect(new Set(sentences).size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 8. The hover half — the contract-length text, and its provenance
// ---------------------------------------------------------------------------

describe('the hover carries the mechanism, its revision, and both halves of the conjunct', () => {
  it('names the register, the key, the two gates and the games on both sides', () => {
    for (const needle of [
      '$0B bit 2', 'v_deform', 'pcfg_v_deform_table_bg', 'scene_dsl.emp', 'parallax.emp',
      'CAP_PER_COL_VSRAM', 'sonic4', 'demo', RAMP_SCROLL_MODE_MEASURED_AT,
      'deform_fg/deform_bg',
    ]) {
      expect(RAMP_SCROLL_MODE_NOTE, `the hover does not say "${needle}"`).toContain(needle);
    }
  });

  /**
   * ⚠ RELAYED AND MEASURED ARE MARKED AS SUCH, and this row is why: the chain
   * (scene_dsl → pcfg → $0B) was read out of aeon's own source at a committed
   * revision by this repo; the on-screen position of the strip was NOT, and a
   * hover that presented both the same way would launder somebody else's
   * measurement into ours.
   */
  it('marks the relayed half as relayed', () => {
    expect(RAMP_SCROLL_MODE_NOTE).toContain('RELAYED, NOT MEASURED HERE');
    expect(RAMP_SCROLL_MODE_NOTE).toContain('Measured in aeon\'s source');
  });

  /** Every arm hands the same hover up — the split is painted/hover, not per-arm. */
  it('every arm carries the same contract text', () => {
    const scenes = sceneLib([flatScene('sky'), vDeformScene('haze')]);
    for (const sections of [
      [], [sec(PRESET, 'sky')], [sec(PRESET, 'haze')],
      [sec(PRESET, 'sky'), sec(PRESET, 'haze')], [sec(PRESET, null)],
    ]) {
      expect(rampScrollModeAdvisory(sections, null, scenes, PRESET).full)
        .toBe(RAMP_SCROLL_MODE_NOTE);
    }
  });

  /**
   * THE PAINTED HALF STAYS AT AUTHOR LENGTH. This panel once rendered 8,059
   * characters before its first control; the ceiling is not a style preference,
   * it is EFFECTS-W1 defect 3's fix. The hover may be long — it is one hover.
   */
  it('the painted sentence is a fraction of the contract text, in every arm', () => {
    const scenes = sceneLib([flatScene('sky'), vDeformScene('haze')]);
    for (const sections of [
      [], [sec(PRESET, 'sky')], [sec(PRESET, 'haze')],
      [sec(PRESET, 'sky'), sec(PRESET, 'haze')], [sec(PRESET, null)],
    ]) {
      const { short } = rampScrollModeAdvisory(sections, null, scenes, PRESET);
      expect(short.length, `painted arm too long: ${short}`).toBeLessThan(600);
      expect(short.length).toBeLessThan(RAMP_SCROLL_MODE_NOTE.length);
    }
  });
});
