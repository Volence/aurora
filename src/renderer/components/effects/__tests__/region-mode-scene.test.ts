// THE SCENE HALF OF THE REGION-MODE REFUSAL, ON BOTH KINDS OF ACT.
//
// Ruling REGION-MODE-RASTER-FALSE-OUTPUT-b1, condition 5 (2026-09-17): on a
// region-mode act the scene panel's section assignment must not write a sidecar
// `sceneRef`, because aeon's `check_mode_conflict` (tools/effects_gen.py, read at
// aeon c7ebe7a1) loops over BOTH sidecar keys. The refusal follows condition 3
// (names check_mode_conflict, points at the Regions panel's Bindings), and
// clearing a leftover `sceneRef` stays allowed (RATIFIED).
//
// The provider rows run on both acts. The source rows check the panel and the
// strip are wired to the provider; whether the sentence is really painted is a
// CDP harness's claim and is tagged for the overseer's foreground run.
// Collected by vitest's `src/**/__tests__/**/*.test.ts`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sectionSceneBindRefusal, sectionSceneWriteRefusal, sectionSceneOptions, sceneRefOptions,
} from '../../../providers/effects-aeon';
import { regionModeSectionRefRefusal } from '../../../../core/formats/raster-binding';
import { noRegionsLoaded, type ActRegionsState } from '../../../../core/formats/regions/act-regions';
import type { EffectsSceneLibrary } from '../../../../core/formats/effects/scene';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const scenePanel = strip(readFileSync(join(__dirname, '..', 'EffectsScenePanel.tsx'), 'utf8'));

const regionAct = (): { regions: ActRegionsState } => ({
  regions: {
    document: {
      schema: 1, act: 'ojz_act1',
      regions: [{
        id: 'sec0', name: 'Forest, upper left', preset: 'OJZ_Preset_Sec0',
        sceneRef: 'ojz_act1_start', rect: { x: 0, y: 0, w: 2048, h: 2048 },
      }],
    },
    loadedPath: 'games/sonic4/data/editor/ojz/act1/regions.json',
    unreadable: null,
  },
});
const sectionAct = (): { regions: ActRegionsState } => ({ regions: noRegionsLoaded() });

const library = (): EffectsSceneLibrary => ({
  scenes: [
    { schema: 1, id: 'dusk', name: 'Dusk', layers: [] },
    { schema: 1, id: 'noon', name: 'Noon', layers: [] },
  ] as never,
  unreadable: [], notices: [], loadedPaths: [],
});

describe('sectionSceneWriteRefusal / sectionSceneBindRefusal', () => {
  it('region mode refuses every non-empty scene id with the shared sceneRef sentence', () => {
    for (const current of [null, 'dusk']) {
      const why = sectionSceneWriteRefusal(regionAct(), 2, current, 'noon');
      expect(why, `current ${current}`).toBe(regionModeSectionRefRefusal('sceneRef', 2, current));
      expect(why).toContain('check_mode_conflict');
      expect(why).toContain('Regions panel, under Bindings');
      expect(why).not.toContain('Migrate');
    }
    expect(sectionSceneBindRefusal(regionAct(), 2, null))
      .toBe(regionModeSectionRefRefusal('sceneRef', 2, null));
  });

  it('region mode does not refuse clearing: the act-default option and null', () => {
    expect(sectionSceneWriteRefusal(regionAct(), 0, 'dusk', '')).toBeNull();
    expect(sectionSceneWriteRefusal(regionAct(), 0, 'dusk', null)).toBeNull();
  });

  it('the sentence names a leftover sceneRef and its clear option only when one is there', () => {
    expect(regionModeSectionRefRefusal('sceneRef', 1, 'dusk')).toContain('sceneRef "dusk"');
    expect(regionModeSectionRefRefusal('sceneRef', 1, 'dusk')).toContain('act default, or null from assign_section_scene');
    expect(regionModeSectionRefRefusal('sceneRef', 1, null)).not.toContain('still carries');
  });

  it('section mode refuses nothing, bound or not', () => {
    for (const current of [null, 'dusk']) {
      for (const v of ['', 'dusk', 'noon']) {
        expect(sectionSceneWriteRefusal(sectionAct(), 1, current, v)).toBeNull();
      }
      expect(sectionSceneBindRefusal(sectionAct(), 1, current)).toBeNull();
    }
  });
});

describe('sectionSceneOptions', () => {
  it('section mode returns exactly sceneRefOptions, bound or not', () => {
    for (const current of [null, 'dusk']) {
      expect(sectionSceneOptions(sectionAct(), library(), 0, current)).toEqual(sceneRefOptions(library()));
    }
  });

  it('region mode returns the act-default option, plus the current ref when there is one', () => {
    expect(sectionSceneOptions(regionAct(), library(), 0, null).map((o) => o.value)).toEqual(['']);
    expect(sectionSceneOptions(regionAct(), library(), 0, 'dusk').map((o) => o.value)).toEqual(['', 'dusk']);
  });
});

describe('the scene panel asks the provider (source)', () => {
  it('computes the refusal through sectionSceneBindRefusal, paints it, and offers sectionSceneOptions', () => {
    expect(scenePanel).toMatch(/sectionSceneBindRefusal\(act, activeSectionIndex, section\.sceneRef\)/);
    expect(scenePanel).toMatch(/\{sceneModeRefusal !== null && \(/);
    expect(scenePanel).toMatch(/sectionSceneOptions\(\s*act, library, activeSectionIndex, section\.sceneRef\)/);
    expect(scenePanel).toMatch(/disabled=\{sceneModeRefusal !== null && section\.sceneRef === null\}/);
    // The "Saved to section_N.meta.json" hint is not shown where that save is refused.
    expect(scenePanel).toMatch(/\{sceneModeRefusal === null && \(\s*<Hint under[^>]*>\s*Saved to <code>section_/);
  });

  it('does not read the regions state or call the predicate itself', () => {
    expect(scenePanel).not.toMatch(/\.regions\.(document|unreadable)/);
    expect(scenePanel).not.toMatch(/actHasRegionsFile\(/);
  });
});
