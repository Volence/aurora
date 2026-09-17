// assign_section_scene ON BOTH KINDS OF ACT (ruling REGION-MODE-RASTER-FALSE-OUTPUT-b1,
// condition 5, 2026-09-17).
//
// aeon's `tools/effects_gen.py check_mode_conflict`, read at aeon c7ebe7a1, loops
// over BOTH `ACT_SCENE_REF_KEY` and `ACT_RASTER_REF_KEY`: on an act whose
// regions.json exists it refuses a build where a section sidecar carries a
// `sceneRef`, exactly as it refuses a `rasterRef`. So `assign_section_scene` must
// refuse to write one there, by THROWING with the same sentence the raster door
// uses (naming that check and the Regions panel's Bindings, never "Migrate
// sections"), and must still let a caller CLEAR a leftover `sceneRef` (RATIFIED:
// that is the repair). On a section-mode act it writes as before.
//
// Both halves run against one fixture that differs ONLY in the act's `regions`
// state. Collected by vitest's `src/**/__tests__/**/*.test.ts`.

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
import type { ActRegionsState } from '../../../core/formats/regions/act-regions';
import { noRegionsLoaded } from '../../../core/formats/regions/act-regions';
import { regionModeSectionRefRefusal } from '../../../core/formats/raster-binding';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });

const section = (sceneRef: string | null = null) => ({
  bgLayoutRef: null, paletteRef: null, rasterRef: null, sceneRef, objects: [], rings: [],
});

/** A scene library holding one readable scene, `dusk`. Shape only; its layers are never read here. */
const scenes = () => ({
  scenes: [{ schema: 1, id: 'dusk', name: 'Dusk', layers: [] }],
  unreadable: [], notices: [], loadedPaths: [],
});

/** OJZ act 1's shape at aeon c7ebe7a1: a loaded regions.json, the scene bound on a region row. */
const regionMode = (): ActRegionsState => ({
  document: {
    schema: 1, act: 'ojz_act1',
    regions: [{
      id: 'sec0', name: 'Forest, upper left', preset: 'OJZ_Preset_Sec0',
      sceneRef: 'ojz_act1_start', rect: { x: 0, y: 0, w: 4096, h: 2048 },
    }],
  },
  loadedPath: 'games/sonic4/data/editor/ojz/act1/regions.json',
  unreadable: null,
});

function open(regions: ActRegionsState, sectionRefs: (string | null)[] = [null, null]): void {
  documentHistoryHub.clearAll();
  useProjectStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useProjectStore.setState({
    project: {
      zones: [{
        id: 'ojz', name: 'OJZ',
        tileset: { tiles: [] },
        palette: { lines: [line(), line(), line(), line()] },
        acts: [{
          id: 'act1', name: 'act1', gridWidth: 2, gridHeight: 1,
          sections: sectionRefs.map((r) => section(r)),
          regions,
        }],
      }],
      chunkLibrary: [], bgLibrary: [], bgLibraryUnresolved: [],
      effectsScenes: scenes(),
      effectsPresets: { presets: [], unreadable: [], notices: [], loadedPaths: [] },
    } as never,
  });
  useProjectStore.getState().setCurrentAct('ojz', 'act1');
  useSessionStore.setState({ activeId: 'tool:project-setup' });
}

const ask = (req: AgentRequest) => handleAgentRequest(req as never);
const actHistory = () => documentHistoryHub.historyFor('level:ojz:act1');
const refs = () => useProjectStore.getState().project!.zones[0].acts[0].sections
  .map((s) => s?.sceneRef ?? null);

describe('assign_section_scene on a SECTION-MODE act writes the sidecar sceneRef', () => {
  beforeEach(() => open(noRegionsLoaded()));

  it('binds, replies changed, and one undo takes it back', async () => {
    const r = await ask({ kind: 'assign-section-scene', section: 1, sceneId: 'dusk' }) as Record<string, unknown>;
    expect(r).toEqual({ section: 1, sceneId: 'dusk', changed: true });
    expect(refs()).toEqual([null, 'dusk']);
    actHistory().undo();
    expect(refs()).toEqual([null, null]);
  });
});

describe('assign_section_scene on a REGION-MODE act throws the shared refusal and writes nothing', () => {
  beforeEach(() => open(regionMode()));

  it('the thrown message is regionModeSectionRefRefusal(sceneRef) and names check_mode_conflict and Bindings, not Migrate', async () => {
    let message = '';
    try {
      await ask({ kind: 'assign-section-scene', section: 1, sceneId: 'dusk' });
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message, 'the call did not throw').not.toBe('');
    expect(message).toBe(`assign_section_scene refused: ${regionModeSectionRefRefusal('sceneRef', 1, null)}`);
    expect(message).toContain('check_mode_conflict');
    expect(message).toContain('Regions panel, under Bindings');
    expect(message).toContain('a scene binding');
    expect(message).not.toContain('Migrate');
    expect(refs(), 'refused and wrote anyway').toEqual([null, null]);
    expect(actHistory().canUndo, 'a refused call left an undo entry').toBe(false);
  });

  it('a readable scene id is refused, so the refusal is the mode and not the library check', async () => {
    expect(scenes().scenes.map((s) => s.id)).toContain('dusk');
    await expect(ask({ kind: 'assign-section-scene', section: 0, sceneId: 'dusk' }))
      .rejects.toThrow(/check_mode_conflict/);
  });
});

describe('assign_section_scene on a REGION-MODE act clears a leftover sidecar sceneRef', () => {
  beforeEach(() => open(regionMode(), ['dusk', null]));

  it('null clears it and replies changed', async () => {
    expect(refs()[0], 'fixture: nothing to clear').toBe('dusk');
    const r = await ask({ kind: 'assign-section-scene', section: 0, sceneId: null }) as Record<string, unknown>;
    expect(r.changed).toBe(true);
    expect(refs()).toEqual([null, null]);
  });

  it('re-binding the id already on the sidecar is refused, not treated as a no-op', async () => {
    await expect(ask({ kind: 'assign-section-scene', section: 0, sceneId: 'dusk' }))
      .rejects.toThrow(/sceneRef "dusk"/);
  });
});

describe('the published assign_section_scene description states the region-mode refusal', () => {
  it('the registry entry names regions.json, check_mode_conflict, Bindings, and that clearing is allowed', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'main', 'editor-methods.ts'), 'utf8');
    const start = src.indexOf("name: 'assign_section_scene'");
    expect(start, 'no assign_section_scene registry entry: this row is blind').toBeGreaterThan(0);
    const entry = src.slice(start, src.indexOf('{ name:', start + 1));
    expect(entry).toContain('regions.json exists (region');
    expect(entry).toContain('check_mode_conflict refuses');
    expect(entry).toContain('Regions panel under Bindings');
    expect(entry).toContain('Clearing (null) is still allowed');
    expect(entry).not.toContain('Migrate');
  });
});
