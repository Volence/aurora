// The raster-PRESET agent surface, driven through `handleAgentRequest` — the
// same entry point MCP and Aether both reach.
//
// The sibling file (agent-handler.effects.test.ts) does this for SCENES and
// states the reason: registry-conformance.test.ts already proves the entries are
// advertised and have handler cases; what it cannot prove is that the cases DO
// the right thing. That is this file.
//
// WHAT IS DIFFERENT HERE, and why it is not a copy of the scene file:
//
//   • A PRESET IS A DIFFERENT DOCUMENT, not a different view of a scene. It
//     lives under data/editor/effects/presets/, the scene loader refuses a
//     `bands` key, and the two libraries are separate objects on the project.
//     One row below asserts a preset write lands in `effectsPresets` and leaves
//     `effectsScenes` alone, because "wrote to the wrong library" is the one
//     mistake that would look completely green from either side.
//   • The preset schema is CLOSED (`unevaluatedProperties: false`), so the
//     scene file's "a field nothing enumerates survives" subject does not exist
//     in the same form. The equivalent here is a field whose VALUE is freer than
//     any control can produce: `name` is "any JSON value" per the contract, the
//     panel only ever writes a string, and `sh` accepts the integers 0/1 which
//     the codec deliberately does not normalise. The fixture carries all three,
//     and every survival check is asserted on them rather than on `top`.
//   • THERE IS A FOURTH TOOL NOW, and it has its own file:
//     `assign_section_preset` (agent-handler.assign-section-preset.test.ts)
//     writes `SectionMeta`'s `rasterRef` — empyrean
//     docs/AURORA_EFFECTS_SCHEMA.md §3.1, adjudicated 2026-08-30, and NOT
//     `effectsRef`, which stays reserved for a TOTAL binding. What this file
//     keeps is the consequence for the LIST tool: it grew the per-section
//     column it used to omit, and it still reports the binding-limit sentence,
//     which a row below asserts is the PANEL'S OWN and not a second wording.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color } from '../../../core/model/s4-types';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import {
  EFFECTS_PRESET_RESERVED_KEYS, EFFECTS_PRESET_ON_ARMS,
  EFFECTS_PRESET_PROGRAM_ARMS, parseEffectsPreset,
} from '../../../core/formats/effects/preset';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PRESET_LIMITS } from '../../providers/effects-preset';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

/**
 * A section object with just the fields these tools touch.
 *
 * `rasterRef` JOINED THE FIXTURE WITH THE COLUMN, and its absence was not
 * harmless: the list reply reads the field straight off the section (as
 * `list_effects_scenes` does with `sceneRef`, deliberately without a `?? null`
 * that would launder a model bug), so a fixture missing the key reports
 * `presetId: undefined` — which JSON drops entirely, turning "unbound" into "no
 * such section" on the wire.
 */
const section = () => ({ rasterRef: null, sceneRef: null, objects: [], rings: [] });

const emptySceneLibrary = () => ({ scenes: [], unreadable: [], notices: [], loadedPaths: [] });

function fakeProject(library: EffectsPresetLibrary): never {
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
    effectsScenes: emptySceneLibrary(),
    effectsPresets: library,
  } as never;
}

/**
 * A preset carrying THREE things no control on the band panel can produce:
 *
 *   • `name` as an OBJECT. The contract types it as any JSON value and says it
 *     is writer-owned; the panel's text field can only ever write a string, and
 *     `presetListEntries` collapses a missing/blank one onto the id. So this is
 *     the value a form-shaped round trip would flatten.
 *   • `sh: 1` — the integer spelling. The codec preserves whichever the file
 *     carried rather than normalising, because a normalising read would put a
 *     diff on every load/save of a hand-written document. The panel writes
 *     booleans only.
 *   • a `pal_region` band with all five fields, so the second ON arm is exercised
 *     rather than assumed.
 */
const glare = (): EffectsPreset => ({
  schema: 1,
  id: 'glare',
  name: { label: 'Glare', authored_by: 'hand' },
  bands: [
    { top: 112, bot: 128, sh: 1, on: { cram: { addr: 74, colours: [0x0eee, 0x00e] } } },
    {
      top: 130, bot: 160, sh: false,
      on: { pal_region: { addr: 74, slot: 3, pal_line: 2, entry: 5, count: 2 } },
    },
  ],
});

const emptyLibrary = (): EffectsPresetLibrary => ({ presets: [], unreadable: [], notices: [], loadedPaths: [] });

const lib = () => useProjectStore.getState().project!.effectsPresets;
const scenes = () => useProjectStore.getState().project!.effectsScenes;
const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const actHistory = () => documentHistoryHub.historyFor('level:ojz:act1');

function open(library: EffectsPresetLibrary = emptyLibrary()): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject(library) });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  // Ambient by design: the tools must work from a tab that owns no history.
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

describe('list_effects_presets', () => {
  beforeEach(() => open());

  it('reports an empty project honestly rather than erroring', async () => {
    const r = await ask({ kind: 'list-effects-presets' }) as Record<string, unknown>;
    expect(r.presets).toEqual([]);
    expect(r.unreadable).toEqual([]);
  });

  it('names unreadable preset files: an id an agent must not take', async () => {
    open({
      presets: [glare()],
      unreadable: [{ path: 'data/editor/effects/presets/broken.json', reason: 'not valid JSON' }],
      notices: [], loadedPaths: [],
    });
    const r = await ask({ kind: 'list-effects-presets' }) as Record<string, unknown>;

    // ANTI-VACUOUS: the instrument saw a library with something in it. Both
    // numbers are DERIVED from the fixture, not typed beside it — a row that
    // hardcoded `bands: 2` would keep passing if the fixture grew a band.
    expect((r.presets as unknown[]).length).toBe(glare().bands!.length > 0 ? 1 : 0);
    expect(r.presets).toEqual([
      // `name` is an OBJECT here, and the reply reports null rather than the
      // panel's `label` collapse: an agent must be able to tell "no string name"
      // from "named after itself", which `presetListEntries` deliberately cannot.
      { id: 'glare', name: null, bands: glare().bands!.length, program: 'bands' },
    ]);
    expect(r.unreadable).toEqual([
      { path: 'data/editor/effects/presets/broken.json', reason: 'not valid JSON' },
    ]);
  });

  it('reports a STRING name as itself, so `name: null` above means "not a string"', async () => {
    // The control for the row above. Without it, `name: null` could be the
    // handler ignoring `name` entirely and would look identical.
    const named: EffectsPreset = { ...glare(), name: 'Glare' };
    open({ presets: [named], unreadable: [], notices: [], loadedPaths: [] });
    const r = await ask({ kind: 'list-effects-presets' }) as { presets: { name: unknown }[] };
    expect(r.presets[0].name).toBe('Glare');
  });

  it('reports the per-section column AND the PANEL\'S OWN sentence beside it', async () => {
    open({ presets: [glare()], unreadable: [], notices: [], loadedPaths: [] });
    const r = await ask({ kind: 'list-effects-presets' }) as Record<string, unknown>;

    // ⚠ THIS ROW USED TO ASSERT THE OPPOSITE, and the reversal is deliberate.
    // The column was omitted while nothing could bind a preset, because an
    // all-nulls column reads as "assigned to nothing" rather than "there is no
    // assignment to make". `assign_section_preset` exists now, so the refs are
    // real and an agent that writes one must be able to read it back — which is
    // `list_bgs`'s case exactly, sentence travelling BESIDE the column rather
    // than standing in for it. The round trip itself is asserted in
    // agent-handler.assign-section-preset.test.ts; what this row owns is that
    // the column is present and reports the key's actual state.
    expect(r.sections).toEqual([
      { index: 0, presetId: null },
      { index: 1, presetId: null },
    ]);

    // DERIVED from PRESET_LIMITS, not transcribed: the author's block and the
    // agent's reply must not be able to describe this limit differently.
    const unbound = PRESET_LIMITS.find(l => l.key === 'unbound');
    expect(unbound, 'PRESET_LIMITS no longer carries the `unbound` limit this reply reads').toBeTruthy();
    expect(unbound!.body.length, 'the limit body is empty: this row would assert nothing').toBeGreaterThan(40);
    expect(r.sectionBinding).toBe(unbound!.body);
  });
});

// ═══ THE BANDS-NOT-REQUIRED AUDIT (2026-09-11) ═══════════════════════════════
//
// The contract's top-level `required` is ["schema", "id"] and its `oneOf` takes
// EXACTLY ONE of bands | ramp | base_swap | boundary. A ramp preset has no
// `bands` key, so `(p.bands ?? []).length` reported it as `bands: 0` with
// nothing beside it. That is the "0 bands" the PANEL's own list row was fixed
// for (`presetListSummary`'s docblock: it "reads as a broken or half-authored
// preset rather than a different kind of one"), still standing on the agent's
// copy of the same list. An agent could not tell a ramp preset from an empty
// band list, and the schema says an empty band list cannot exist (`bands` has
// `minItems: 1`).
//
// THE FIX IS THE PANEL'S OWN: `program` is `presetProgramArm`, the value
// `PresetListEntry.channel` already carries. The count is left alone. Zero IS
// the number of bands, and the program is what makes that zero readable.
//
// REAL DOCUMENTS: aeon's two shipped ramp presets and its base_swap preset as
// Aurora vendors them (preset-canonical-golden.json, ojz_sec6_baseswap.json;
// aeon f8beaad0, both ramps' content equal to aeon origin/master 7577daee on
// 2026-09-11), plus the contract's boundary vector, since aeon ships no
// boundary PRESET file.
const FIXTURES = resolve(__dirname, '../../../../test/fixtures/effects');

/** The ONE program arm a raw document carries, read off the schema's own arm list. */
function rawArm(stem: string, raw: Record<string, unknown>): string {
  const arms = EFFECTS_PRESET_PROGRAM_ARMS.filter((a) => a in raw);
  if (arms.length !== 1) throw new Error(`${stem} carries ${arms.length} program arms, not one`);
  return arms[0];
}

function realNonBandsPresets(): { preset: EffectsPreset; arm: string }[] {
  const golden = JSON.parse(readFileSync(join(FIXTURES, 'preset-canonical-golden.json'), 'utf8')) as {
    documents: Record<string, string>;
  };
  const vectors = JSON.parse(readFileSync(join(FIXTURES, 'effects-preset-vectors.json'), 'utf8')) as {
    cases: { expect: string; doc: unknown }[];
  };
  const boundary = vectors.cases.find((c) => c.expect === 'pass'
    && typeof c.doc === 'object' && c.doc !== null && 'boundary' in c.doc);
  if (!boundary) throw new Error('the contract vectors carry no passing boundary document');
  const bdoc = boundary.doc as { id: string };
  const texts: [string, unknown][] = [
    ['ramp_probe', golden.documents.ramp_probe],
    ['aurora_ramp_witness', golden.documents.aurora_ramp_witness],
    ['ojz_sec6_baseswap', readFileSync(join(FIXTURES, 'ojz_sec6_baseswap.json'), 'utf8')],
    [bdoc.id, JSON.stringify(bdoc)],
  ];
  return texts.map(([stem, text]) => {
    if (typeof text !== 'string') throw new Error(`fixture document ${stem} is missing`);
    return {
      preset: parseEffectsPreset(text, stem),
      arm: rawArm(stem, JSON.parse(text) as Record<string, unknown>),
    };
  });
}

describe('list_effects_presets on presets that carry no bands', () => {
  beforeEach(() => open());

  it('names each non-bands preset\'s PROGRAM, so its `bands: 0` cannot read as an empty band list', async () => {
    const docs = realNonBandsPresets();
    // ANTI-VACUOUS: every arm the schema declares other than bands is in the set.
    expect(new Set(docs.map((d) => d.arm)))
      .toEqual(new Set(EFFECTS_PRESET_PROGRAM_ARMS.filter((a) => a !== 'bands')));
    open({ presets: docs.map((d) => d.preset), unreadable: [], notices: [], loadedPaths: [] });
    const r = await ask({ kind: 'list-effects-presets' }) as { presets: Record<string, unknown>[] };
    expect(r.presets).toHaveLength(docs.length);
    for (const d of docs) {
      const row = r.presets.find((p) => p.id === d.preset.id);
      expect(row, `${d.preset.id} is missing from the reply`).toBeTruthy();
      expect(row!.program, `${d.preset.id} carries ${d.arm}`).toBe(d.arm);
      expect(row!.bands).toBe(0);
    }
  });

  it('CONTROL: a bands preset reports program "bands" beside its real count', async () => {
    expect('bands' in glare()).toBe(true);
    open({ presets: [glare()], unreadable: [], notices: [], loadedPaths: [] });
    const r = await ask({ kind: 'list-effects-presets' }) as { presets: Record<string, unknown>[] };
    expect(r.presets[0].program).toBe('bands');
    expect(r.presets[0].bands).toBe(glare().bands!.length);
  });
});

describe('get_effects_preset', () => {
  beforeEach(() => open({ presets: [glare()], unreadable: [], notices: [], loadedPaths: [] }));

  it('returns the WHOLE document, including values no control can produce', async () => {
    const r = await ask({ kind: 'get-effects-preset', id: 'glare' }) as { preset: EffectsPreset };
    expect(r.preset).toEqual(glare());
    // The three subjects the fixture exists for, named individually so a failure
    // says which one was flattened.
    expect(r.preset.name).toEqual({ label: 'Glare', authored_by: 'hand' });
    expect(r.preset.bands![0].sh, 'the integer spelling of `sh` must survive un-normalised').toBe(1);
    expect(r.preset.bands![1].on).toEqual({
      pal_region: { addr: 74, slot: 3, pal_line: 2, entry: 5, count: 2 },
    });
  });

  it('distinguishes "no such preset" from "that file would not parse"', async () => {
    await expect(ask({ kind: 'get-effects-preset', id: 'nope' })).rejects.toThrow(/not found/);
    open({
      presets: [], notices: [], loadedPaths: [],
      unreadable: [{ path: 'data/editor/effects/presets/broken.json', reason: 'not valid JSON' }],
    });
    await expect(ask({ kind: 'get-effects-preset', id: 'broken' }))
      .rejects.toThrow(/could not be read \(not valid JSON\)/);
  });
});

describe('set_effects_preset', () => {
  beforeEach(() => open());

  it('creates a preset as one undo step, on the ACT stack, from a tab with no history', async () => {
    const r = await ask({ kind: 'set-effects-preset', id: 'glare', preset: glare() });
    expect(r).toEqual({ id: 'glare', changed: true, created: true });
    expect(lib().presets.map(p => p.id)).toEqual(['glare']);
    expect(lib().presets[0].name).toEqual({ label: 'Glare', authored_by: 'hand' });

    expect(actHistory().canUndo).toBe(true);
    actHistory().undo();
    expect(lib().presets, 'undo must remove the created preset').toEqual([]);
  });

  it('writes to the PRESET library and leaves the SCENE library alone', async () => {
    // The one mistake that would look green from either side: presets and scenes
    // are separate documents in separate directories, and a handler reaching for
    // `effectsScenes` would still return `{changed: true}`.
    await ask({ kind: 'set-effects-preset', id: 'glare', preset: glare() });
    expect(lib().presets.map(p => p.id)).toEqual(['glare']);
    expect(scenes().scenes, 'a preset write must not touch the scene library').toEqual([]);
  });

  it('refuses the RESERVED wave-2 vocabulary by name, and writes NOTHING', async () => {
    // DERIVED from the codec's own list, which is itself derived from the
    // schema's `description` — nothing here types "fires".
    const reserved = EFFECTS_PRESET_RESERVED_KEYS[0];
    expect(reserved, 'the codec exposes no reserved keys: this row has no subject').toBeTruthy();

    const doc = { ...glare(), [reserved]: 1 } as unknown;
    await expect(ask({ kind: 'set-effects-preset', id: 'glare', preset: doc }))
      .rejects.toThrow(new RegExp(`${reserved}[\\s\\S]*RESERVED wave-2`));
    expect(lib().presets).toEqual([]);
    expect(actHistory().canUndo, 'a refused write must not consume an undo slot').toBe(false);
  });

  it('refuses a two-arm band with the arm rule\'s own sentence', async () => {
    // The rule the JSON schema states as "matches 2 of the 2 allowed forms" and
    // the codec restates with its reason. ARMS DERIVED, not typed.
    expect(EFFECTS_PRESET_ON_ARMS.length, 'expected two ON arms to combine').toBe(2);
    const [a, b] = EFFECTS_PRESET_ON_ARMS;
    const twoArms = {
      ...glare(),
      bands: [{
        top: 112, bot: 128, sh: false,
        on: {
          [a]: { addr: 74, colours: [0] },
          [b]: { addr: 74, slot: 0, pal_line: 2, entry: 5, count: 1 },
        },
      }],
    } as unknown;
    await expect(ask({ kind: 'set-effects-preset', id: 'glare', preset: twoArms }))
      .rejects.toThrow(/on declares 2 arms[\s\S]*exactly one is allowed/);
    expect(lib().presets).toEqual([]);
    expect(actHistory().canUndo).toBe(false);
  });

  it('refuses an empty bands list: the schema\'s minItems, not a shape restated here', async () => {
    await expect(ask({
      kind: 'set-effects-preset', id: 'glare', preset: { schema: 1, id: 'glare', bands: [] },
    })).rejects.toThrow(/schema/);
    expect(lib().presets).toEqual([]);
  });

  it('enforces the filename-stem identity rule the JSON schema alone cannot', async () => {
    await expect(ask({
      kind: 'set-effects-preset', id: 'glare', preset: { ...glare(), id: 'something_else' },
    })).rejects.toThrow(/filename stem and the id must match/);
    expect(lib().presets).toEqual([]);
  });

  it('refuses a CREATE whose id collides with an unreadable file', async () => {
    open({
      presets: [], notices: [], loadedPaths: [],
      unreadable: [{ path: 'data/editor/effects/presets/broken.json', reason: 'x' }],
    });
    await expect(ask({
      kind: 'set-effects-preset', id: 'broken', preset: { ...glare(), id: 'broken' },
    })).rejects.toThrow(/taken by[\s\S]*could not be read/);
    expect(lib().presets).toEqual([]);
    expect(actHistory().canUndo).toBe(false);
  });

  it('replaces an existing preset, and a re-send of the SAME document is not an undo step', async () => {
    open({ presets: [glare()], unreadable: [], notices: [], loadedPaths: [] });

    const unchanged = await ask({ kind: 'set-effects-preset', id: 'glare', preset: glare() });
    expect(unchanged).toEqual({ id: 'glare', changed: false });
    expect(actHistory().canUndo, 'an unchanged re-send must not consume an undo slot').toBe(false);

    // The edit is on the freest field the document has, for the fixture's reason.
    const edited = { ...glare(), name: { label: 'Glare', authored_by: 'agent' } };
    const r = await ask({ kind: 'set-effects-preset', id: 'glare', preset: edited });
    expect(r).toEqual({ id: 'glare', changed: true, created: false });
    expect(lib().presets[0].name).toEqual({ label: 'Glare', authored_by: 'agent' });
    expect(actHistory().canUndo).toBe(true);

    actHistory().undo();
    expect(lib().presets[0], 'undo must restore the WHOLE previous document').toEqual(glare());
  });

  it('deletes with preset: null, and reports honestly when there was nothing there', async () => {
    open({ presets: [glare()], unreadable: [], notices: [], loadedPaths: [] });
    expect(await ask({ kind: 'set-effects-preset', id: 'glare', preset: null }))
      .toEqual({ id: 'glare', deleted: true });
    expect(lib().presets).toEqual([]);
    expect(await ask({ kind: 'set-effects-preset', id: 'glare', preset: null }))
      .toEqual({ id: 'glare', deleted: false, reason: 'no such preset' });
    // The second call found nothing to do and must not have consumed a slot on
    // top of the first one's.
    actHistory().undo();
    expect(actHistory().canUndo).toBe(false);
    expect(lib().presets.map(p => p.id)).toEqual(['glare']);
  });
});
