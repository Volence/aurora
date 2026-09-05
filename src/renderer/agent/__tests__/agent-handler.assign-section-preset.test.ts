// `assign_section_preset` — the fourth preset tool, and the authoring half of
// ROADMAP row 93.
//
// It is `assign-section-scene`'s MIRROR onto the other effects document, so most
// of what follows is the scene tool's own property list re-asserted over
// `rasterRef`: the range check, the readable-id refusal, THROWN refusals rather
// than `{ok:false}`, the no-op that burns no undo slot, and `null` as the
// unbind. Those rows are here because a mirror that quietly drops one of them is
// exactly the failure a mirror invites.
//
// THREE THINGS ARE NOT THE SCENE TOOL'S, and they are why this file exists:
//
//   • THE FIELD IS `rasterRef` AND NEVER `effectsRef`. `effectsRef` is a
//     RESERVED, UNSPENT name for a future TOTAL binding — a preset document can
//     only supply the raster channel of aeon's eight-channel EffectsPreset
//     (empyrean docs/AURORA_EFFECTS_SCHEMA.md §3.1, adjudicated 2026-08-30).
//     Writing it here would spend that reservation silently, so a row watches
//     the section object for the key rather than trusting the handler's spelling.
//
//   • THE REPLY CARRIES A BINDING LIMIT, on `assign_section_bg`'s rule
//     (core/formats/bg-binding.ts): a tool that reports success for a binding
//     NOTHING BAKES misleads its caller. This binding is observed by strictly
//     less than that one — the background at least gets composited in the
//     viewport, while a `rasterRef` reaches aeon's GENERATOR (aeon `4aa2abc0`)
//     and stops one seam short of the engine, with no preview of a raster band
//     anywhere in the suite — so the disclosure is on the SUCCESS reply, not
//     only the refusal. ⚠ The "nothing anywhere reads a rasterRef" wording that
//     stood here was retired on 2026-08-30 when aeon landed the reader; what is
//     still missing is the CALL SITE, and the constant carries that distinction
//     plus its new dated expiry.
//
//   • `list_effects_presets` GREW THE `sections` COLUMN it deliberately did not
//     have. The omission was right while nothing could bind: an all-nulls column
//     reads as "assigned to nothing" rather than "there is no assignment to
//     make". Now that a binding exists, an agent that just wrote one must be
//     able to read it back, so the column is `list_bgs`'s case and the sentence
//     travels beside it.
//
// ⚠ REPLY SHAPE IS NOT THE WHOLE SUBJECT. Half these rows exist to prove the
// BEHAVIOUR: the ref actually lands on the model, one undo step puts it back,
// and the refusals still refuse. A change that made the tool merely TALK
// correctly while writing nothing would pass every wording row.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color } from '../../../core/model/s4-types';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import { PRESET_LIMITS, sectionPresetCommand } from '../../providers/effects-preset';
import { RASTER_SECTION_BINDING_LIMIT } from '../../../core/formats/raster-binding';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

/**
 * A section with the four refs the meta sidecar carries, all null.
 *
 * `rasterRef` AND its three siblings, because half of what this tool must not do
 * is touch the other three — a fixture that omitted them would let a handler
 * that wrote `sceneRef` look identical to one that wrote `rasterRef`.
 */
const section = () => ({
  bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null,
  objects: [], rings: [],
});

const glare = (): EffectsPreset => ({
  schema: 1,
  id: 'glare',
  name: 'Glare',
  bands: [{ top: 112, bot: 128, sh: false, on: { cram: { addr: 74, colours: [0x0eee] } } }],
});

const dusk = (): EffectsPreset => ({
  schema: 1,
  id: 'dusk',
  name: 'Dusk',
  bands: [{ top: 40, bot: 60, sh: true, on: { cram: { addr: 32, colours: [0x000] } } }],
});

const library = (): EffectsPresetLibrary => ({
  presets: [glare(), dusk()],
  unreadable: [{ path: 'data/editor/effects/presets/broken.json', reason: 'not valid JSON' }],
  notices: [], loadedPaths: [],
});

function fakeProject(presets: EffectsPresetLibrary): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 2, gridHeight: 1,
        sections: [section(), section()],
      }],
    }],
    chunkLibrary: [],
    bgLibrary: [],
    bgLibraryUnresolved: [],
    effectsScenes: { scenes: [], unreadable: [], notices: [], loadedPaths: [] },
    effectsPresets: presets,
  } as never;
}

const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const actHistory = () => documentHistoryHub.historyFor('level:ojz:act1');

/** The act's sections, typed as the refs this file watches. */
const sections = () => useProjectStore.getState().project!.zones[0].acts[0].sections
  .map((s) => s as unknown as Record<string, unknown>);

function open(presets: EffectsPresetLibrary = library()): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject(presets) });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  // Ambient by design: the tool must work from a tab that owns no history.
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

describe('assign_section_preset writes the binding', () => {
  beforeEach(() => open());

  it('binds a readable preset to a section, and one undo puts it back', async () => {
    // ANTI-VACUOUS: the instrument saw a library with the id it is about to
    // bind. On an empty library every row below would refuse and this file
    // would prove nothing.
    expect(library().presets.map((p) => p.id)).toContain('glare');
    expect(sections()[1].rasterRef, 'fixture started bound').toBeNull();

    const r = await ask({ kind: 'assign-section-preset', section: 1, presetId: 'glare' }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    expect(sections()[1].rasterRef).toBe('glare');

    actHistory().undo();
    expect(sections()[1].rasterRef).toBeNull();
    actHistory().redo();
    expect(sections()[1].rasterRef).toBe('glare');
  });

  /**
   * ONLY WITNESS FOR: the RESERVATION. `effectsRef` promises a TOTAL binding and
   * a preset document is not total, so it must stay unspent — and a handler that
   * wrote it instead would satisfy every "the tool replied changed: true" row in
   * this file. Asserted on the OBJECT rather than on the source text, so a
   * rename or an indirection cannot hide it.
   */
  it('writes rasterRef and touches no other ref — effectsRef stays unspent', async () => {
    await ask({ kind: 'assign-section-preset', section: 0, presetId: 'dusk' });
    const s = sections()[0];
    expect(s.rasterRef).toBe('dusk');
    expect(Object.keys(s), 'the tool invented an effectsRef on the section').not.toContain('effectsRef');
    expect(s.sceneRef, 'wrote the scene binding instead').toBeNull();
    expect(s.bgLayoutRef).toBeNull();
    expect(s.paletteRef).toBeNull();
  });

  /**
   * ONLY WITNESS FOR: unbinding being expressible. Absent and explicit-null are
   * the SAME state for `rasterRef`, exactly as for `sceneRef`, so a tool that
   * could bind but not clear would leave an author's mistake permanent.
   */
  it('null unbinds — absent and explicit-null are one state', async () => {
    await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' });
    expect(sections()[0].rasterRef, 'nothing to unbind — this row would be vacuous').toBe('glare');

    const r = await ask({ kind: 'assign-section-preset', section: 0, presetId: null }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    // NULL, never the empty string. `''` is the `<select>` sentinel the provider
    // maps; a `rasterRef: ""` on the model would serialise into the sidecar and
    // be read straight back as null, presenting as "the unbind didn't stick".
    expect(sections()[0].rasterRef).toBeNull();
  });

  it('binds each section independently', async () => {
    await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' });
    await ask({ kind: 'assign-section-preset', section: 1, presetId: 'dusk' });
    expect(sections().map((s) => s.rasterRef)).toEqual(['glare', 'dusk']);
  });
});

describe('assign_section_preset refuses, by THROWING', () => {
  beforeEach(() => open());

  /**
   * The refusal convention, which is the effects block's stated rule: an agent
   * asked for an operation and either got it or did not, and an error is the
   * only reply an MCP client cannot mistake for success. A `{ok:false}` here
   * would be reported to the caller as a successful tool call.
   */
  it('refuses an id that is no preset at all', async () => {
    await expect(ask({ kind: 'assign-section-preset', section: 0, presetId: 'nope' }))
      .rejects.toThrow(/not a readable preset in this project/);
    expect(sections()[0].rasterRef, 'refused and wrote anyway').toBeNull();
  });

  /**
   * ONLY WITNESS FOR: an UNREADABLE file's id being refused too. It is a real
   * file with a real name, so an agent can plausibly reach for it — and a ref
   * the build cannot resolve is worse than no ref. The fixture's `unreadable`
   * entry is what makes this row non-vacuous.
   */
  it('refuses the id of a preset file that exists but did not parse', async () => {
    expect(library().unreadable.map((u) => u.path)).toContain(
      'data/editor/effects/presets/broken.json');
    await expect(ask({ kind: 'assign-section-preset', section: 0, presetId: 'broken' }))
      .rejects.toThrow(/not a readable preset in this project/);
  });

  it('refuses a section index outside the act, and a non-integer one', async () => {
    await expect(ask({ kind: 'assign-section-preset', section: 9, presetId: 'glare' }))
      .rejects.toThrow(/out of range/);
    await expect(ask({ kind: 'assign-section-preset', section: -1, presetId: 'glare' }))
      .rejects.toThrow(/out of range/);
    await expect(ask({ kind: 'assign-section-preset', section: 0.5, presetId: 'glare' }))
      .rejects.toThrow(/out of range/);
  });

  it('a refusal burns no undo slot', async () => {
    expect(actHistory().canUndo).toBe(false);
    await expect(ask({ kind: 'assign-section-preset', section: 0, presetId: 'nope' })).rejects.toThrow();
    expect(actHistory().canUndo, 'a refused call left an undo entry behind').toBe(false);
  });
});

describe('assign_section_preset is a no-op when nothing moves', () => {
  beforeEach(() => open());

  it('a same-id call reports changed: false and burns no undo slot', async () => {
    await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' });
    const r = await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' }) as Record<string, unknown>;
    expect(r.changed).toBe(false);
    // ONE undo puts it back to unbound: the re-send added no step.
    actHistory().undo();
    expect(sections()[0].rasterRef).toBeNull();
    expect(actHistory().canUndo, 'the unchanged re-send consumed an undo slot').toBe(false);
  });

  it('unbinding an already-unbound section is a no-op too', async () => {
    const r = await ask({ kind: 'assign-section-preset', section: 0, presetId: null }) as Record<string, unknown>;
    expect(r.changed).toBe(false);
    expect(actHistory().canUndo).toBe(false);
  });
});

describe('the reply says where the binding stops', () => {
  beforeEach(() => open());

  /**
   * ONLY WITNESS FOR: the SUCCESS path carrying the limit. A reply that
   * announced it only on the refusal or the no-op would leave the one case that
   * misleads — `changed: true` — exactly as silent as before.
   */
  it('carries the binding limit on the SUCCESS reply', async () => {
    const r = await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    expect(r.binding).toBe(RASTER_SECTION_BINDING_LIMIT);
  });

  it('and on the no-op reply too — the same conclusion either way', async () => {
    await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' });
    const r = await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' }) as Record<string, unknown>;
    expect(r.changed).toBe(false);
    expect(r.binding).toBe(RASTER_SECTION_BINDING_LIMIT);
  });

  /**
   * ONE CONSTANT, THREE AUDIENCES. The agent's reply, `list_effects_presets`'s
   * `sectionBinding`, and the band-preset panel's own author-facing limit. Two
   * hand-written near-identical sentences is how a limit ends up stated two
   * different ways, and `bg-binding.ts` says so in as many words.
   */
  it('is the same sentence the panel shows the author and the list tool reports', async () => {
    const a = await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' }) as Record<string, unknown>;
    const l = await ask({ kind: 'list-effects-presets' }) as Record<string, unknown>;
    const unbound = PRESET_LIMITS.find((x) => x.key === 'unbound');
    expect(unbound, 'PRESET_LIMITS no longer carries the `unbound` limit').toBeTruthy();
    expect(a.binding).toBe(l.sectionBinding);
    expect(a.binding).toBe(unbound!.body);
  });

  /**
   * ANTI-VACUOUS, and the row that asks the SECOND question: does the sentence
   * measure the quantity the property is about? Every `toBe` above would pass on
   * an empty string. What the disclosure has to say is (1) which key is written,
   * (2) how far it travels, and (3) what an author must therefore still do by
   * hand — plus the negative that keeps it off the reserved key.
   *
   * ⚠ (2) CHANGED ON 2026-08-30 AND THIS ROW CHANGED WITH IT. It used to assert
   * that NO consumer reads the key, naming the two aeon files that would have to
   * move. They moved: aeon `4aa2abc0` landed the reader, so
   * `/EFFECTS_CONSUMER_CONTRACT\.md/` and `/nothing bakes this binding/` went
   * red — the expiry firing, not a regression. The replacement asserts the
   * narrowed truth, which is a DIFFERENT claim and not a softer one: the
   * generator reads it, and nothing installs what it emits.
   */
  it('actually says the load-bearing things, and never names the reserved key', () => {
    expect(RASTER_SECTION_BINDING_LIMIT.length).toBeGreaterThan(200);
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/rasterRef/);
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/effectsRef/);
    // The reader that now exists, pinned to the file and the revision.
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/effects_gen\.py/);
    // ⚠ MOVED THREE TIMES, RED FIRST EACH TIME: to `9cdf32d8` when the call
    // site landed, to `6e2495a5` (aeon's origin/master the evening `c9a462be`
    // committed section 5's sidecar) when the sentence's "no sidecar carries
    // the key" clauses expired, and to `e6405428` (their origin/master carrying
    // `4a4d3474`'s captures) when "nothing has been seen on screen" expired.
    // The OLD anchors are asserted absent so a revert of the constant cannot
    // pass this row on the kept phrases below.
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/Verified at aeon e6405428/);
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/Verified at aeon 6e2495a5/);
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/Verified at aeon 9cdf32d8/);
    // ...and the seam it stops at, which is what an agent must not read past.
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/ojz_effects\.emp/);
    // ⚠ (3) CHANGED ON 2026-08-30 TOO, AND THIS ROW WENT RED FIRST. It asserted
    // `/the band does not play/i` — a UNIVERSAL claim, true only while every
    // section was uniformly unwired. aeon `9cdf32d8` threaded the chooser for
    // ONE section, which MANUFACTURED the non-uniformity rather than revealing
    // it, so the universal sentence became the lie and the replacement is a case
    // split. An agent gets both halves or it misleads its caller in one of two
    // directions: "nothing works" when the caller bound section 5, or "it works"
    // when they bound section 6.
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/ONLY SECTION 5 IS WIRED/);
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/BINDING ANY OTHER SECTION STILL REACHES NOTHING/);
    // And the case-3 refusal, because "your build will fail and say which
    // section" is a materially different answer from silence — verified at
    // `9cdf32d8` in `tools/effects_seam_gate.py`, not taken on report.
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/effects_seam_gate\.py refuses a full build/i);
    // And the half an agent reading a SUCCESS reply most needs since aeon
    // `c9a462be`: section 5 is bound and that binding reached aeon's build.
    // ⚠ THIS USED TO END "— and no further", AND THAT MATCHER WAS RED FIRST:
    // aeon `4a4d3474` committed the section-5 band measured on screen, so the
    // reply now says so — attributed to the captures commit, with the values
    // and the control — and says in the same breath that nothing of it is
    // visible in this editor. An agent that relays "bound" without the second
    // half would let its caller believe the band can be seen HERE, which is the
    // drift this row now exists to catch; the first half without the citation
    // would let it report a band it has no evidence for, which is the old one.
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/SECTION 5 IS BOUND/);
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/and no further/);
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/aeon's 4a4d3474 \(2026-08-30, docs\/research\/reference_captures\/2026-08-30-sec5-band\/\) records the section-5 band MEASURED on screen/);
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/\$0000 on every one of those lines on the control ROM/);
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/no CRAM was sampled here, and nothing of that frame is visible in this editor/);
  });
});

describe('list_effects_presets reads the binding back', () => {
  beforeEach(() => open());

  /**
   * ONLY WITNESS FOR: the column existing at all. Without it the tool can write
   * a binding no tool can observe, and an agent's only way to learn the current
   * ref is to attempt a write and read `changed`.
   */
  it('reports the per-section rasterRef column, and it reflects what assign wrote', async () => {
    await ask({ kind: 'assign-section-preset', section: 1, presetId: 'dusk' });
    const r = await ask({ kind: 'list-effects-presets' }) as Record<string, unknown>;
    expect(r.sections).toEqual([
      { index: 0, presetId: null },
      { index: 1, presetId: 'dusk' },
    ]);
  });

  it('keeps everything the reply already carried', async () => {
    const r = await ask({ kind: 'list-effects-presets' }) as Record<string, unknown>;
    expect(r.presets).toEqual([
      { id: 'glare', name: 'Glare', bands: glare().bands!.length },
      { id: 'dusk', name: 'Dusk', bands: dusk().bands!.length },
    ]);
    expect(r.unreadable).toEqual([
      { path: 'data/editor/effects/presets/broken.json', reason: 'not valid JSON' },
    ]);
  });
});

/**
 * The provider both doors must share.
 *
 * `sectionPresetCommand` is `sectionSceneCommand`'s mirror and the ONLY way a
 * `rasterRef` should ever be written — the agent tool calls it today and the
 * per-section select (ROADMAP row 93's other half) must call it tomorrow, so
 * that the agent path and the human path cannot disagree about what a no-op is.
 * These rows live in this file because the agent tool is its only caller; move
 * them beside the panel's when the select lands.
 */
describe('sectionPresetCommand', () => {
  it("maps the select's empty string to the model's null, and re-picking issues NOTHING", () => {
    expect(sectionPresetCommand(3, null, 'glare')).toEqual({
      type: 'set-section-raster', description: 'Section 3 raster preset', sectionIndex: 3,
      oldRef: null, newRef: 'glare',
    });
    expect(sectionPresetCommand(3, 'glare', '')?.newRef).toBeNull();
    // The no-op guard, both directions — a `<select>` fires onChange for the
    // option already selected, and an agent re-sends the ref it just wrote.
    expect(sectionPresetCommand(3, 'glare', 'glare')).toBeNull();
    expect(sectionPresetCommand(3, null, '')).toBeNull();
  });

  /**
   * ONLY WITNESS FOR: the command being its OWN type. Reusing
   * `set-section-scene` would type-check, apply cleanly, and silently overwrite
   * the scene assignment — the two are independent bindings over one sidecar.
   */
  it('emits set-section-raster, never the scene command', () => {
    expect(sectionPresetCommand(0, null, 'glare')!.type).toBe('set-section-raster');
  });
});

/**
 * THE HANDLER MUST NOT HAND-ROLL THE COMMAND, and nothing above can see the
 * difference: a `case` that built `{type: 'set-section-raster', ...}` inline
 * would pass every behavioural row in this file and then drift from the panel
 * the first time the no-op rule or the `''` sentinel changed. So this reads the
 * source, on `registry-conformance.test.ts`'s idiom.
 */
describe('the agent path and the human path share one function', () => {
  it('the assign-section-preset case calls sectionPresetCommand', () => {
    const src = readFileSync(join(__dirname, '..', 'agent-handler.ts'), 'utf8');
    const start = src.indexOf("case 'assign-section-preset': {");
    // Loud rather than green: if the case is renamed or the switch is replaced,
    // this guard must fail rather than measure an empty string.
    expect(start, 'no assign-section-preset case found — this guard is blind').toBeGreaterThan(0);
    const body = src.slice(start, src.indexOf("\n    case '", start + 1));
    expect(body.length, 'read an empty case body').toBeGreaterThan(200);
    expect(body).toMatch(/sectionPresetCommand\(/);
    // And it must not write the field itself, by either name.
    expect(body).not.toMatch(/\.rasterRef\s*=/);
    expect(body).not.toMatch(/effectsRef/);
  });
});

/**
 * ═══ THE RESULTING TREE, NOT ONLY THE BINDING (O62, 2026-08-30) ═══
 *
 * Everything above says how far ONE binding travels. This block is about the
 * TREE the call leaves behind, because aeon's canonical build has an opinion
 * about that too and it is not the seam gate's: at aeon `origin/master`
 * `027ec162`, three CONTENT tests in `build.sh`'s pytest lane accept exactly
 * one bound set — `{5: 'ojz_sec5_showcase'}` — and refuse every other by name.
 * Unbinding section 5 (this tool's `null`, the select's empty option) leaves
 * the set empty and the preset document orphaned; binding any other section
 * fails the exact-`[5]` assertion. Aeon's own README says their control ROM
 * could only be built with `FAST=1`. Nothing here refuses the write — the
 * STANDING REFUSAL in core/formats/raster-binding.ts — so the reply has to say
 * it, on the two calls that produce such a tree.
 *
 * ⚠ THE ROWS READ THE REPLY, NOT THE CONSTANT, for the discriminating half: a
 * handler that carried the constant on bind and a trimmed copy on unbind would
 * pass every identity row above (none of them exercises `null` on a bound
 * section). The clause is located IN the constant first, loudly, and then
 * asserted to arrive verbatim on each reply — derived, not pasted.
 */
const DISCLOSURE_HEAD = 'AND THE BOUND SET ITSELF IS PINNED BY AEON\'S FULL BUILD';
const DISCLOSURE_TAIL = 'Wiring a second section is a preset split';

/** The disclosure clause as the constant carries it — located, not retyped. */
function disclosureClause(): string {
  const start = RASTER_SECTION_BINDING_LIMIT.indexOf(DISCLOSURE_HEAD);
  expect(start, 'the constant carries no build-refusal disclosure at all').toBeGreaterThan(0);
  const end = RASTER_SECTION_BINDING_LIMIT.indexOf(DISCLOSURE_TAIL, start);
  expect(end, 'the disclosure clause has no end — the split clause moved').toBeGreaterThan(start);
  const clause = RASTER_SECTION_BINDING_LIMIT.slice(start, end);
  expect(clause.length, 'the disclosure clause is too short to say what it must').toBeGreaterThan(600);
  return clause;
}

/**
 * What the disclosure has to SAY, asserted on whatever text is handed in — a
 * reply's `binding` or the constant — so a rewrite that keeps the clause and
 * drops a fact fails on the fact, not on absence. Each matcher is a claim an
 * author or an agent would act on differently if it were missing.
 */
function expectDisclosure(text: string): void {
  // The only accepted state, by number and by id, anchored and dated.
  expect(text).toMatch(/read at aeon 027ec162 \(2026-08-30\)/);
  expect(text).toMatch(/section 5 bound to ojz_sec5_showcase is the ONLY state aeon's canonical build accepts/);
  // The three tests, by path and name, so an author can go and read them.
  expect(text).toMatch(/tools\/test_effects_seam_gate\.py::TestRasterSeamAgainstTheRealTree::test_the_bound_sections_are_exactly_the_threaded_ones/);
  expect(text).toMatch(/test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document/);
  expect(text).toMatch(/tools\/test_raster_cycle_table_lint\.py::test_every_preset_document_is_REACHABLE/);
  // UNBIND: empty set + orphaned document, and the three messages as the
  // source spells them (all three refuse the unbind; the README's own list
  // attributes two of them crosswise, which is why the source is quoted).
  expect(text).toMatch(/UNBINDING SECTION 5/);
  expect(text).toMatch(/leaves the bound set empty and the document ojz_sec5_showcase\.json orphaned/);
  expect(text).toMatch(/"no sidecar carries a rasterRef — step 6's band is gone"/);
  expect(text).toMatch(/"the bound sections are \[\], not \[5\]"/);
  expect(text).toMatch(/reachable by NOTHING: \['ojz_sec5_showcase'\]/);
  // BIND-OTHER: the exact-[5] assertion, beside 5 or instead of it.
  expect(text).toMatch(/BINDING ANY OTHER SECTION, beside 5 or instead of it, fails the exact-\[5\] assertion/);
  // WHEN it runs — and the mechanism, because "FAST=0" alone is a flag name:
  // FAST=1 sets NO_LINT=1 and the pytest lane sits under NO_LINT.
  expect(text).toMatch(/runs only in the canonical FAST=0 build: FAST=1 sets NO_LINT=1, the pytest lane sits under NO_LINT, and FAST=1 builds the tree/);
  expect(text).toMatch(/The canonical build REFUSES the control tree, by design/);
  // Nothing here gates — the standing refusal, said in the sentence.
  expect(text).toMatch(/NOTHING HERE PREVENTS THE WRITE/);
  // Its own expiry, with the four falsifiers and an owner.
  expect(text).toMatch(/THAT CLAUSE EXPIRES when the \[5\] literal in test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document changes/);
  expect(text).toMatch(/when those tests are renamed or the pytest lane leaves the NO_LINT block that FAST=1 switches off/);
  expect(text).toMatch(/when test_every_preset_document_is_REACHABLE drops its sidecar arm/);
  expect(text).toMatch(/or when a second binding ships \(owner: aeon's lane\)/);
  expect(text).toMatch(/re-read tools\/test_effects_seam_gate\.py, tools\/test_raster_cycle_table_lint\.py and build\.sh/);
  // ⚠ WRONG REWRITES, named: the refusal is aeon's and it is the FAST=0 build's.
  // A sentence that put the gate on this side, or on the FAST=1 build, would
  // send an author to the wrong place — and would pass every positive above.
  expect(text).not.toMatch(/(?:this editor|Aurora|the panel|this tool|the select) (?:refuses|prevents|blocks|greys out|disables)/i);
  expect(text).not.toMatch(/FAST=1 (?:also )?(?:refuses|rejects)/i);
  expect(text).not.toMatch(/FAST=0 builds (?:it|the tree)/i);
}

describe('the reply discloses that aeon\'s full build will refuse the resulting tree', () => {
  beforeEach(() => open());

  /**
   * ONLY WITNESS FOR: the UNBIND reply. The identity rows above never unbind a
   * bound section, so this is the one call whose reply could carry a trimmed
   * sentence unnoticed. Bind first so the `null` really is a change and really
   * produces the empty-set tree the disclosure is about.
   */
  it('the unbind reply (null on a bound section) carries the disclosure verbatim', async () => {
    await ask({ kind: 'assign-section-preset', section: 0, presetId: 'glare' });
    const r = await ask({ kind: 'assign-section-preset', section: 0, presetId: null }) as Record<string, unknown>;
    expect(r.changed, 'the unbind was a no-op — the row measured nothing').toBe(true);
    expect(sections()[0].rasterRef).toBeNull();
    const clause = disclosureClause();
    expect(String(r.binding)).toContain(clause);
    expectDisclosure(String(r.binding));
  });

  /**
   * ONLY WITNESS FOR: the BIND reply carrying the same clause. The handler does
   * not interpret the section number (nor may it: the STANDING REFUSAL), so
   * "any other section" is every bind — this row binds a section that is not 5
   * and reads the disclosure off the success reply.
   */
  it('a bind reply on a section other than 5 carries the disclosure verbatim', async () => {
    const r = await ask({ kind: 'assign-section-preset', section: 1, presetId: 'dusk' }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    const clause = disclosureClause();
    expect(String(r.binding)).toContain(clause);
    expectDisclosure(String(r.binding));
  });

  /**
   * THE PUBLISHED TOOL DESCRIPTION SAYS IT BY REFERENCE. main/ cannot import
   * the renderer, which is why the constant lives in core/ — and a description
   * that pasted the sentence would be the fork bg-binding.ts warns about, one
   * that no identity row on the reply can see. So this reads the registry
   * source: the `assign_section_preset` entry's description ends in the
   * constant, and retypes none of the disclosure's distinctive phrases.
   */
  it('editor-methods.ts carries the disclosure by reference to the constant, not as a copy', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'main', 'editor-methods.ts'), 'utf8');
    const start = src.indexOf("name: 'assign_section_preset'");
    expect(start, 'no assign_section_preset registry entry found — this guard is blind').toBeGreaterThan(0);
    const end = src.indexOf('{ name:', start + 1);
    const entry = src.slice(start, end > start ? end : undefined);
    expect(entry.length, 'read an empty registry entry').toBeGreaterThan(200);
    expect(entry).toMatch(/\+ RASTER_SECTION_BINDING_LIMIT \}/);
    // The clause exists (loud if not) and none of its distinctive phrases is
    // retyped in the entry — a fork would be paraphrased, so sample several.
    const clause = disclosureClause();
    for (const p of [
      'UNBINDING SECTION 5', 'NOTHING HERE PREVENTS THE WRITE',
      'test_section_5_is_the_bound_one_and_its_id_is_the_shipped_document',
      'FAST=1 sets NO_LINT=1', 'THAT CLAUSE EXPIRES',
    ]) {
      expect(clause, `sample phrase left the constant: ${p}`).toContain(p);
      expect(entry, `editor-methods.ts retypes the disclosure: ${p}`).not.toContain(p);
    }
  });
});
