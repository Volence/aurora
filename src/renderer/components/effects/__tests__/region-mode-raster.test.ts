// A REGION-MODE ACT GETS ONE NOTICE AND A REFUSAL; A SECTION-MODE ACT GETS WHAT IT HAD.
//
// Ruling B (2026-09-17, docs/reviews/2026-09-17-region-mode-raster-false-output.md).
// On an act whose regions.json exists, every section-keyed raster verdict the
// effects strip and the band-preset panel paint is about files that no longer
// carry the binding. So:
//
//   the gate      `regionModeRasterNotice(act)`, non-null exactly in region mode,
//                 through the one predicate `actHasRegionsFile`;
//   the refusal   `sectionRasterWriteRefusal` / `sectionRasterBindRefusal`, which
//                 the Section select and `assign_section_preset` both ask;
//   the options   `sectionRasterOptions`, so a live select cannot bind either.
//
// EVERY ROW RUNS ON BOTH ACTS. The section-mode act must come out identical to
// the functions the surfaces called before the ruling; the golden next door
// (`region-mode-section-golden.test.ts`) pins those functions' bytes.
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
    expect(pickerCode).toMatch(/\) : regionNotice !== null \? \(\s*<>\s*scene <code[^\n]*\n\s*<\/>\s*\) : \(\s*<>\s*scene <code[^\n]*\n\s*\{' · '\}\s*raster <code/);
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

describe('the shipped limit sentence carries the region-mode clause, FIRST', () => {
  /**
   * `RASTER_SECTION_BINDING_LIMIT` is published in the panel's limit block, the
   * `assign_section_preset` reply and two tool descriptions. Its cut-back to
   * aeon origin/master is STOPPED (see raster-binding.ts), so what it must do in
   * the meantime is say region mode exists and which of its own clauses that
   * makes stale, BEFORE a reader reaches them.
   */
  it('names the predicate, the refusal, the Regions panel, and the two aeon commits', () => {
    for (const phrase of [
      'has_act_regions', 'check_mode_conflict', 'Regions panel', 'e2af59ea', 'bcd844aa',
      'ojz_act1_preset_raster(preset: <Record>_KEY)', 'are NOT current for OJZ act 1',
    ]) {
      expect(RASTER_SECTION_BINDING_LIMIT, `missing: ${phrase}`).toContain(phrase);
    }
  });

  it('comes before the first section-keyed clause it declares stale', () => {
    const clause = RASTER_SECTION_BINDING_LIMIT.indexOf('REGION MODE FIRST');
    const rule = RASTER_SECTION_BINDING_LIMIT.indexOf('a section is wired exactly when');
    const reading = RASTER_SECTION_BINDING_LIMIT.indexOf('the wired set is {');
    expect(clause).toBe(0);
    expect(rule, 'the section-keyed rule clause is gone: re-read this row with the sentence')
      .toBeGreaterThan(clause);
    expect(reading).toBeGreaterThan(clause);
  });
});
