// `migrate_sections` — the bus half of editor spec §4, the tool that converts an
// act from per-section sidecars to a regions document.
//
// ⚠ WHAT THESE ROWS ARE FOR, GIVEN THE PLANNER IS TESTED ELSEWHERE. The
// migration's arithmetic is `core/editing/__tests__/migrate-sections.test.ts`'s
// subject and the whole load/save cycle is `test/formats/`'s. What only a
// handler test can say is that the CALL IS REACHED and WRITES: an agent tool
// that plans correctly and then applies nothing produces the same reply as one
// that works, and a dry run that took a second code path would preview
// something the real call does not do.
//
// So every row here asserts the MODEL after the call, not only the reply — and
// the anti-vacuous rule §7's note states for this parcel is kept: the sidecars
// are asserted to CARRY refs before the migration, in the same row.

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useProjectStore } from '../../state/projectStore';
import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { documentHistoryHub } from '../../state/history-hub';
import type { AgentRequest } from '../../../shared/agent-protocol';
import type { Color } from '../../../core/model/s4-types';
import { noRegionsLoaded } from '../../../core/formats/regions/act-regions';
import type { SectionRasterWiring } from '../../../core/formats/effects/section-wiring';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

const section = (index: number, over: Record<string, string | null> = {}) => ({
  index,
  bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null,
  objects: [], rings: [],
  ...over,
});

/**
 * A wiring as the LOAD builds one: two sections bound to two presets, and one
 * key-less row with its rectangle resolved.
 */
function wiring(over: Partial<SectionRasterWiring> = {}): SectionRasterWiring {
  return {
    bindings: { 0: 'OJZ_Preset_Sec0', 1: 'OJZ_Preset_Sec1' },
    threadedBy: {},
    channelThreadedBy: {},
    patchedArm: {},
    descriptor: { path: 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp', parsed: true },
    library: { path: 'games/sonic4/data/effects/ojz_effects.emp', parsed: true },
    unkeyedRows: [{
      preset: 'OJZ_Preset_Night',
      constructorName: 'ojz_region',
      line: 560,
      sectionKeys: [],
      edges: { x0: 1800, x1: 2499, y0: 0, y1: 2047 },
    }],
    ...over,
  } as SectionRasterWiring;
}

function fakeProject(w: SectionRasterWiring): never {
  return {
    zones: [{
      id: 'ojz', name: 'OJZ',
      tileset: { tiles: [] },
      palette: { lines: [line(), line(), line(), line()] },
      acts: [{
        id: 'act1', name: 'act1', gridWidth: 2, gridHeight: 1,
        sections: [
          section(0, { sceneRef: 'ojz_act1_start', bgLayoutRef: 'forest-v15' }),
          section(1, { rasterRef: 'ojz_sec1_showcase' }),
        ],
        sceneRef: null,
        regions: noRegionsLoaded(),
        rasterWiring: w,
      }],
    }],
    chunkLibrary: [],
    bgLibrary: [],
    bgLibraryUnresolved: [],
    effectsScenes: { scenes: [], unreadable: [], notices: [], loadedPaths: [] },
    effectsPresets: { presets: [], unreadable: [], notices: [], loadedPaths: [] },
  } as never;
}

const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const act = () => useProjectStore.getState().project!.zones[0].acts[0] as unknown as {
  sections: Array<Record<string, unknown>>;
  regions: { document: { regions: Array<{ id: string }> } | null };
};
const actHistory = () => documentHistoryHub.historyFor('level:ojz:act1');

/** The four refs of every section, which is what the migration clears. */
const refs = () => act().sections.map((s) => ({
  bgLayoutRef: s.bgLayoutRef, paletteRef: s.paletteRef,
  rasterRef: s.rasterRef, sceneRef: s.sceneRef,
}));

const CARRIED = [
  { bgLayoutRef: 'forest-v15', paletteRef: null, rasterRef: null, sceneRef: 'ojz_act1_start' },
  { bgLayoutRef: null, paletteRef: null, rasterRef: 'ojz_sec1_showcase', sceneRef: null },
];
const NULLS = [
  { bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null },
  { bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef: null },
];

function open(w: SectionRasterWiring = wiring()): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({ project: fakeProject(w) });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  // Ambient by design: the tool must work from a tab that owns no history.
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

describe('migrate_sections', () => {
  beforeEach(() => open());

  it('WRITES: the sidecars carried refs, the call clears them, and the regions exist', async () => {
    // The before-picture, without which "every sidecar nulled" is vacuous.
    expect(refs()).toEqual(CARRIED);
    expect(act().regions.document).toBeNull();

    const reply = await ask({ kind: 'migrate-sections' }) as {
      applied: boolean; regions: Array<{ id: string; preset: string }>; sectionsCleared: number[];
      notes: string[];
    };

    expect(reply.applied).toBe(true);
    // Two runs plus the key-less row.
    expect(reply.regions.map((r) => r.preset))
      .toEqual(['OJZ_Preset_Sec0', 'OJZ_Preset_Sec1', 'OJZ_Preset_Night']);
    expect(reply.sectionsCleared).toEqual([0, 1]);
    // THE MODEL, not only the reply.
    expect(refs()).toEqual(NULLS);
    expect(act().regions.document!.regions).toHaveLength(3);
    // The dropped binding is in the ANSWER, not only in a design document.
    expect(reply.notes.join('\n')).toMatch(/bgLayoutRef "forest-v15".*DROPPED/s);
  });

  it('is ONE undo step, and the undo restores the sidecars as well as the regions', async () => {
    await ask({ kind: 'migrate-sections' });
    const level = { sections: act().sections, act: act() } as never;
    const history = actHistory();
    expect(history.canUndo).toBe(true);
    history.undo(level);
    expect(refs(), 'undo must restore all four refs on every section').toEqual(CARRIED);
    expect(act().regions.document).toBeNull();
    // ONE step: nothing is left to undo.
    expect(history.canUndo).toBe(false);
  });

  it('DRY RUN plans the same thing and applies NOTHING', async () => {
    const dry = await ask({ kind: 'migrate-sections', dryRun: true }) as {
      applied: boolean; regions: Array<{ id: string }>;
    };
    expect(dry.applied).toBe(false);
    expect(dry.regions).toHaveLength(3);
    // The act is untouched: refs still there, no document, no undo entry.
    expect(refs()).toEqual(CARRIED);
    expect(act().regions.document).toBeNull();
    expect(actHistory().canUndo).toBe(false);

    // And the real call produces the SAME plan — so a preview is what happens.
    const wet = await ask({ kind: 'migrate-sections' }) as { regions: Array<{ id: string }> };
    expect(wet.regions).toEqual(dry.regions);
  });

  it('REFUSES BY THROWING when the descriptor could not be read, and clears nothing', async () => {
    open(wiring({
      bindings: {},
      descriptor: {
        path: 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp',
        parsed: false, read: true, reason: 'no ojz_region rows were found in it',
      },
    }));
    await expect(ask({ kind: 'migrate-sections' }))
      .rejects.toThrow(/act descriptor could not be read/);
    expect(refs(), 'a refused migration must clear no sidecar').toEqual(CARRIED);
    expect(actHistory().canUndo).toBe(false);
  });

  it('REFUSES a second migration rather than overwrite the first one\'s regions', async () => {
    await ask({ kind: 'migrate-sections' });
    await expect(ask({ kind: 'migrate-sections' })).rejects.toThrow(/already has 3 regions/);
    expect(act().regions.document!.regions).toHaveLength(3);
  });
});
