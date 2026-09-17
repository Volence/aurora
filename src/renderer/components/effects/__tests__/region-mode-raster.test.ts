// A REGION-MODE ACT GETS ONE NOTICE AND A REFUSAL; A SECTION-MODE ACT GETS WHAT IT HAD.
//
// Ruling B, revised as b1 (2026-09-17, docs/reviews/2026-09-17-region-mode-raster-false-output.md).
// On an act whose regions.json exists, every per-section raster verdict the
// effects strip and the band-preset panel paint asks about a section as the owner
// of a binding, and the owners are region rows. So:
//
//   the gate      `regionModeRasterNotice(act)`, non-null exactly in region mode,
//                 through the one predicate `actHasRegionsFile`;
//   the refusal   `sectionRasterWriteRefusal` / `sectionRasterBindRefusal`, which
//                 the Section select and `assign_section_preset` both ask;
//   the options   `sectionRasterOptions`, so a live select cannot bind either.
//
// EVERY ROW RUNS ON BOTH ACTS. On the section-mode act the gate and the refusal
// are null and the options are unfiltered. ⚠ REVISED 2026-09-17 (ruling b1): the
// SHA golden that pinned the section-mode verdict functions' bytes is deleted;
// whether those verdicts are TRUE is held against aeon's own functions in
// core/formats/effects/__tests__/raster-owners-truth.test.ts.
//
// ⚠ THE SOURCE ROWS ARE ABOUT WIRING, NOT PAINT. Whether the notice really
// appears in the running app, and the verdicts really do not, is a CDP
// harness's claim and is tagged for a foreground run.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  regionModeRasterNotice, sectionRasterWriteRefusal, sectionRasterBindRefusal,
  sectionRasterOptions, presetRefOptions,
} from '../../../providers/effects-preset';
import {
  REGION_MODE_RASTER_NOTICE, regionModeSectionRasterRefusal, RASTER_SECTION_BINDING_LIMIT,
} from '../../../../core/formats/raster-binding';
import { rasterChooserName } from '../../../../core/formats/effects/section-wiring';
import { noRegionsLoaded, type ActRegionsState } from '../../../../core/formats/regions/act-regions';
import type { EffectsPresetLibrary } from '../../../../core/formats/effects/preset';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const panelCode = strip(readFileSync(join(__dirname, '..', 'BandPresetPanel.tsx'), 'utf8'));
const pickerCode = strip(readFileSync(join(__dirname, '..', 'SectionPicker.tsx'), 'utf8'));
const handlerSrc = readFileSync(join(__dirname, '..', '..', '..', 'agent', 'agent-handler.ts'), 'utf8');

/** OJZ act 1 at aeon e2af59ea: regions.json loaded, the binding on a region row. */
const regionAct = (): { regions: ActRegionsState } => ({
  regions: {
    document: {
      schema: 1, act: 'ojz_act1',
      regions: [{
        id: 'sec5', name: 'Band showcase', preset: 'OJZ_Preset_Sec5',
        rasterRef: 'ojz_sec5_showcase', rect: { x: 0, y: 0, w: 2048, h: 2048 },
      }],
    },
    loadedPath: 'games/sonic4/data/editor/ojz/act1/regions.json',
    unreadable: null,
  },
});
/** A section-mode act: no regions.json, which is what the load leaves. */
const sectionAct = (): { regions: ActRegionsState } => ({ regions: noRegionsLoaded() });

const library = (): EffectsPresetLibrary => ({
  presets: [
    { schema: 1, id: 'glare', name: 'Glare', bands: [] },
    { schema: 1, id: 'dusk', name: 'Dusk', bands: [] },
  ] as never,
  unreadable: [], notices: [], loadedPaths: [],
});

describe('the gate: one notice in region mode, nothing in section mode', () => {
  it('region mode (OJZ act 1 shape) gets the notice, verbatim', () => {
    expect(regionModeRasterNotice(regionAct())).toBe(REGION_MODE_RASTER_NOTICE);
  });

  it('section mode gets null, so every verdict takes its old path', () => {
    expect(regionModeRasterNotice(sectionAct())).toBeNull();
  });

  it('the notice says region mode, names regions.json, and points at the Regions panel', () => {
    expect(REGION_MODE_RASTER_NOTICE).toMatch(/region mode/);
    expect(REGION_MODE_RASTER_NOTICE).toContain('regions.json');
    expect(REGION_MODE_RASTER_NOTICE).toContain('Regions panel');
  });
});

describe('the refusal: region mode refuses a binding and allows a clear', () => {
  it('region mode refuses every non-empty value, naming check_mode_conflict and the Regions panel', () => {
    for (const current of [null, 'glare']) {
      const why = sectionRasterWriteRefusal(regionAct(), 3, current, 'dusk');
      expect(why, `current ${current}`).toBe(regionModeSectionRasterRefusal(3, current));
      expect(why).toContain('check_mode_conflict');
      expect(why).toContain('tools/effects_gen.py');
      expect(why).toContain('Regions panel');
      expect(why).toContain('Section 3');
    }
    expect(sectionRasterBindRefusal(regionAct(), 3, null)).toBe(regionModeSectionRasterRefusal(3, null));
  });

  it('region mode allows clearing: the empty option and null are not refused', () => {
    expect(sectionRasterWriteRefusal(regionAct(), 0, 'glare', '')).toBeNull();
    expect(sectionRasterWriteRefusal(regionAct(), 0, 'glare', null)).toBeNull();
  });

  it('a leftover sidecar ref is named, with the one allowed action', () => {
    expect(regionModeSectionRasterRefusal(2, 'glare')).toContain('rasterRef "glare"');
    expect(regionModeSectionRasterRefusal(2, null)).not.toContain('still carries');
  });

  it('section mode refuses NOTHING, bound or not', () => {
    for (const current of [null, 'glare']) {
      for (const v of ['', 'glare', 'dusk']) {
        expect(sectionRasterWriteRefusal(sectionAct(), 1, current, v)).toBeNull();
      }
      expect(sectionRasterBindRefusal(sectionAct(), 1, current)).toBeNull();
    }
  });
});

describe('the select\'s options', () => {
  it('section mode: EXACTLY presetRefOptions, bound or not', () => {
    for (const current of [null, 'glare']) {
      expect(sectionRasterOptions(sectionAct(), library(), 0, current))
        .toEqual(presetRefOptions(library()));
    }
  });

  it('region mode: the unbind option, plus the current ref when there is one', () => {
    expect(sectionRasterOptions(regionAct(), library(), 0, null).map((o) => o.value)).toEqual(['']);
    expect(sectionRasterOptions(regionAct(), library(), 0, 'glare').map((o) => o.value))
      .toEqual(['', 'glare']);
  });
});

describe('the surfaces are wired to the gate (source)', () => {
  it('BandPresetPanel computes the gate once and suppresses each section-keyed verdict on it', () => {
    expect(panelCode).toMatch(/const regionNotice = act === null \? null : regionModeRasterNotice\(act\);/);
    for (const name of ['wiringAdvisory', 'armRefusal', 'armUnknown', 'rebindNotice']) {
      expect(panelCode, `${name} is not gated on the region-mode notice`)
        .toMatch(new RegExp(`const ${name} = act === null \\|\\| regionNotice !== null \\? null`));
    }
    // The arm-exclusivity disable is section-keyed too.
    expect(panelCode).toMatch(/regionNotice === null && sectionBindingControlDisabled\(/);
  });

  it('BandPresetPanel paints the refusal above the select and offers only unrefused options', () => {
    expect(panelCode).toMatch(/sectionRasterBindRefusal\(act, activeSectionIndex, section\.rasterRef\)/);
    expect(panelCode).toMatch(/\{modeRefusal !== null && \(/);
    expect(panelCode).toMatch(/sectionRasterOptions\(\s*act, library, activeSectionIndex, section\.rasterRef\)/);
    // Disabled while nothing is bound, live while a leftover ref can be cleared.
    expect(panelCode).toMatch(/\(modeRefusal !== null && section\.rasterRef === null\)/);
  });

  it('SectionPicker gates every section-keyed raster block and paints the notice', () => {
    expect(pickerCode).toMatch(/const regionNotice = regionModeRasterNotice\(act\);/);
    expect(pickerCode).toMatch(/\{regionNotice !== null && \(\s*<div data-effects-region-mode-notice=""/);
    // The three condition rows sit inside ONE gated fragment.
    const gated = /\{regionNotice === null && \(<>([\s\S]*?)<\/>\)\}/.exec(pickerCode);
    expect(gated, 'the condition rows are not inside a regionNotice === null fragment').not.toBeNull();
    expect([...gated![1].matchAll(/<ConditionRow\b/g)].length).toBe(3);
    expect(pickerCode).toMatch(/\{regionNotice === null && act\.rasterWiring\.descriptor\.parsed && \(/);
    expect(pickerCode).toMatch(/\{regionNotice === null && advisory !== null && \(/);
    expect(pickerCode).toMatch(/\{regionNotice === null && extraAdvisory !== null && \(/);
    // ⚠ THE REGION ARM NO LONGER PRINTS A SIDECAR REF (ruling b1, condition 5):
    // its `act default` was false on a region-mode act. The section arm still does.
    expect(pickerCode).toMatch(/\) : regionNotice !== null \? \(\s*<>\s*scene and raster are bound on this act's region rows, in the Regions panel\s*<\/>\s*\) : \(\s*<>\s*scene <code[^\n]*\n\s*\{' · '\}\s*raster <code/);
    const regionArm = /\) : regionNotice !== null \? \(([\s\S]*?)\) : \(/.exec(pickerCode);
    expect(regionArm, 'the region-mode arm of the bindings line was not found').not.toBeNull();
    expect(regionArm![1], 'the region-mode arm prints a sidecar ref').not.toMatch(/section\.(sceneRef|rasterRef)/);
  });

  it('the agent case asks the same refusal before it builds the command', () => {
    const start = handlerSrc.indexOf("case 'assign-section-preset': {");
    expect(start, 'no assign-section-preset case: this row is blind').toBeGreaterThan(0);
    const body = handlerSrc.slice(start, handlerSrc.indexOf("\n    case '", start + 1));
    const refusalAt = body.indexOf('sectionRasterWriteRefusal(');
    const commandAt = body.indexOf('sectionPresetCommand(');
    expect(refusalAt).toBeGreaterThan(0);
    expect(refusalAt).toBeLessThan(commandAt);
  });

  it('no surface decides the mode itself: none reads the regions state directly', () => {
    for (const [name, code] of [['BandPresetPanel', panelCode], ['SectionPicker', pickerCode],
      ['agent-handler', strip(handlerSrc)]] as const) {
      expect(code, `${name} reads .regions.document or .regions.unreadable itself`)
        .not.toMatch(/\.regions\.(document|unreadable)/);
      expect(code, `${name} calls actHasRegionsFile directly instead of through the provider gate`)
        .not.toMatch(/actHasRegionsFile\(/);
    }
  });
});

describe('the shipped limit sentence states the mode rule and the record-keyed rule, with no staleness preface', () => {
  /**
   * `RASTER_SECTION_BINDING_LIMIT` is published in the panel's limit block, the
   * `assign_section_preset` reply and two tool descriptions. Ruling B's first
   * build led it with "REGION MODE FIRST, AND WHAT IT MAKES STALE BELOW" and left
   * the section-keyed clauses in place; ruling b1 (2026-09-17) rewrote it to aeon's
   * current rule and removed that preface. These rows hold the mode half of it.
   */
  it('names the mode predicate, the refusal, where a region binds, and the two aeon commits', () => {
    for (const phrase of [
      'has_act_regions', 'check_mode_conflict', 'Regions panel', 'under Bindings', 'e2af59ea',
      'bcd844aa', `${rasterChooserName('ojz', 'act1')}(preset: <that record>_KEY, hand: ...)`,
    ]) {
      expect(RASTER_SECTION_BINDING_LIMIT, `missing: ${phrase}`).toContain(phrase);
    }
  });

  it('carries no staleness preface and no section-keyed rule', () => {
    expect(RASTER_SECTION_BINDING_LIMIT).not.toContain('REGION MODE FIRST');
    expect(RASTER_SECTION_BINDING_LIMIT).not.toContain('NOT current for OJZ act 1');
    expect(RASTER_SECTION_BINDING_LIMIT).not.toContain('a section is wired exactly when');
    expect(RASTER_SECTION_BINDING_LIMIT).not.toContain('the wired set is {');
  });

  it('states where a binding lives before it states the rule and the reading', () => {
    const mode = RASTER_SECTION_BINDING_LIMIT.indexOf('WHERE IT LIVES IS THE ACT\'S MODE');
    const rule = RASTER_SECTION_BINDING_LIMIT.indexOf('is wired exactly when');
    const reading = RASTER_SECTION_BINDING_LIMIT.indexOf('the wired homes are {');
    expect(mode, 'the mode clause is gone').toBeGreaterThan(0);
    expect(rule).toBeGreaterThan(mode);
    expect(reading).toBeGreaterThan(rule);
  });
});
