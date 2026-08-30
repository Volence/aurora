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
//   • There is deliberately NO fourth tool. `assign_section_preset` would mirror
//     `assign-section-scene` and cannot be written — `SectionMeta` is
//     `{bgLayoutRef, paletteRef, sceneRef}` and has no preset field (ROADMAP row
//     93). `list_effects_presets` says so in its reply instead of shipping an
//     all-nulls `sections` column, and a row below asserts that sentence is the
//     PANEL'S OWN, not a second wording.

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
} from '../../../core/formats/effects/preset';
import { PRESET_LIMITS } from '../../providers/effects-preset';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

/** A section object with just the fields these tools touch. */
const section = () => ({ sceneRef: null, objects: [], rings: [] });

const emptySceneLibrary = () => ({ scenes: [], unreadable: [], notices: [] });

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

const emptyLibrary = (): EffectsPresetLibrary => ({ presets: [], unreadable: [], notices: [] });

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

  it('names unreadable preset files — an id an agent must not take', async () => {
    open({
      presets: [glare()],
      unreadable: [{ path: 'data/editor/effects/presets/broken.json', reason: 'not valid JSON' }],
      notices: [],
    });
    const r = await ask({ kind: 'list-effects-presets' }) as Record<string, unknown>;

    // ANTI-VACUOUS: the instrument saw a library with something in it. Both
    // numbers are DERIVED from the fixture, not typed beside it — a row that
    // hardcoded `bands: 2` would keep passing if the fixture grew a band.
    expect((r.presets as unknown[]).length).toBe(glare().bands.length > 0 ? 1 : 0);
    expect(r.presets).toEqual([
      // `name` is an OBJECT here, and the reply reports null rather than the
      // panel's `label` collapse: an agent must be able to tell "no string name"
      // from "named after itself", which `presetListEntries` deliberately cannot.
      { id: 'glare', name: null, bands: glare().bands.length },
    ]);
    expect(r.unreadable).toEqual([
      { path: 'data/editor/effects/presets/broken.json', reason: 'not valid JSON' },
    ]);
  });

  it('reports a STRING name as itself, so `name: null` above means "not a string"', async () => {
    // The control for the row above. Without it, `name: null` could be the
    // handler ignoring `name` entirely and would look identical.
    const named: EffectsPreset = { ...glare(), name: 'Glare' };
    open({ presets: [named], unreadable: [], notices: [] });
    const r = await ask({ kind: 'list-effects-presets' }) as { presets: { name: unknown }[] };
    expect(r.presets[0].name).toBe('Glare');
  });

  it('answers the missing per-section column with the PANEL\'S OWN sentence', async () => {
    open({ presets: [glare()], unreadable: [], notices: [] });
    const r = await ask({ kind: 'list-effects-presets' }) as Record<string, unknown>;

    // There is no `sections` key, on purpose: nothing binds a preset to a
    // section, so an all-nulls column would read as "assigned to nothing".
    expect(Object.keys(r)).not.toContain('sections');

    // DERIVED from PRESET_LIMITS, not transcribed: the author's block and the
    // agent's reply must not be able to describe this limit differently.
    const unbound = PRESET_LIMITS.find(l => l.key === 'unbound');
    expect(unbound, 'PRESET_LIMITS no longer carries the `unbound` limit this reply reads').toBeTruthy();
    expect(unbound!.body.length, 'the limit body is empty — this row would assert nothing').toBeGreaterThan(40);
    expect(r.sectionBinding).toBe(unbound!.body);
  });
});

describe('get_effects_preset', () => {
  beforeEach(() => open({ presets: [glare()], unreadable: [], notices: [] }));

  it('returns the WHOLE document, including values no control can produce', async () => {
    const r = await ask({ kind: 'get-effects-preset', id: 'glare' }) as { preset: EffectsPreset };
    expect(r.preset).toEqual(glare());
    // The three subjects the fixture exists for, named individually so a failure
    // says which one was flattened.
    expect(r.preset.name).toEqual({ label: 'Glare', authored_by: 'hand' });
    expect(r.preset.bands[0].sh, 'the integer spelling of `sh` must survive un-normalised').toBe(1);
    expect(r.preset.bands[1].on).toEqual({
      pal_region: { addr: 74, slot: 3, pal_line: 2, entry: 5, count: 2 },
    });
  });

  it('distinguishes "no such preset" from "that file would not parse"', async () => {
    await expect(ask({ kind: 'get-effects-preset', id: 'nope' })).rejects.toThrow(/not found/);
    open({
      presets: [], notices: [],
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
    expect(reserved, 'the codec exposes no reserved keys — this row has no subject').toBeTruthy();

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

  it('refuses an empty bands list — the schema\'s minItems, not a shape restated here', async () => {
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
      presets: [], notices: [],
      unreadable: [{ path: 'data/editor/effects/presets/broken.json', reason: 'x' }],
    });
    await expect(ask({
      kind: 'set-effects-preset', id: 'broken', preset: { ...glare(), id: 'broken' },
    })).rejects.toThrow(/taken by[\s\S]*could not be read/);
    expect(lib().presets).toEqual([]);
    expect(actHistory().canUndo).toBe(false);
  });

  it('replaces an existing preset, and a re-send of the SAME document is not an undo step', async () => {
    open({ presets: [glare()], unreadable: [], notices: [] });

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
    open({ presets: [glare()], unreadable: [], notices: [] });
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
