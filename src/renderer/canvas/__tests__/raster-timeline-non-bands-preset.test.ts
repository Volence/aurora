// THE RASTER TIMELINE ON A PRESET THAT CARRIES NO BANDS — the bands-not-required
// audit, 2026-09-11 (docs/reviews/2026-09-11-bands-not-required-audit.md).
//
// The contract's top-level `required` is ["schema", "id"], and its top-level
// `oneOf` takes EXACTLY ONE program: `bands`, `ramp`, `base_swap` or `boundary`.
// So a valid preset may carry no `bands` key at all, and a `?? []` reading of it
// does not crash. It renders the document as an EMPTY BAND LIST, which is the
// subtle half of "does any code still assume bands".
//
// WHAT THE STRIP DOES WITH ONE, read at aurora ba727d1e:
//   • `rasterTimelinePresetRows` maps `preset.bands ?? []`, so zero rows;
//   • the column header is `presetId === null ? 'no preset' : 'bands'`, so it
//     says "bands" over the empty column;
//   • `absent` is `rasterTimelineAbsences(preset !== null)`, which DROPS
//     "palette bands" from the never-empty honesty line because a preset is
//     selected, not because its bands are drawn. A ramp, base_swap or boundary
//     preset gets the exact line a fully drawn band preset gets, while the
//     column draws nothing of its program.
//
// ⚠ THE FIX IS A LOOK/WORDING CALL AND IS NOT MADE HERE. Restoring "palette
// bands", naming the program in the absence line, re-labelling the column, or
// drawing the program are four different things for an author to read, and the
// audit's brief says to record the options and stop. So the defect rows are
// `it.fails`: they PASS while the defect stands and go RED the day any fix
// lands, which is when whoever lands it turns them into plain `it`.
//
// ⚠ AND `it.fails` PASSES ON ANY FAILURE, including a vacuous one. So nothing
// the defect rows depend on is asserted inside them: the documents load at
// module scope (a loader error fails the FILE), and the preconditions (the
// preset reached the view, the column really is empty) are plain `it` rows of
// their own, per document.
//
// REAL INPUTS. aeon's shipped ramp and base_swap presets as Aurora vendors them
// (preset-canonical-golden.json and ojz_sec6_baseswap.json, from aeon f8beaad0;
// both ramps' content equal to aeon origin/master 7577daee on 2026-09-11), and
// the contract's own boundary vector, because aeon ships no boundary PRESET
// file. The bands control is aeon's shipped `authored_probe`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  rasterTimelineView, rasterTimelineAbsences, rasterTimelinePresetRows,
} from '../raster-timeline';
import { cameraPreviewPlan } from '../camera-preview';
import {
  parseEffectsPreset, EFFECTS_PRESET_PROGRAM_ARMS,
} from '../../../core/formats/effects/preset';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import type { EffectsScene } from '../../../core/formats/effects/scene';
import {
  presetListEntries, presetListSummary, lastBandRefusal, bandControlsRefusal,
} from '../../providers/effects-preset';

const FIXTURES = resolve(__dirname, '../../../../test/fixtures/effects');

interface RealDoc { raw: Record<string, unknown>; preset: EffectsPreset; arm: string }

/** The ONE program arm a raw document carries, read off the schema's own arm list. */
function rawArm(stem: string, raw: Record<string, unknown>): string {
  const arms = EFFECTS_PRESET_PROGRAM_ARMS.filter((a) => a in raw);
  if (arms.length !== 1) {
    throw new Error(`${stem} carries ${arms.length} program arms (${arms.join(', ')}), not one`);
  }
  return arms[0];
}

function load(stem: string, text: unknown): RealDoc {
  if (typeof text !== 'string') throw new Error(`fixture document ${stem} is missing`);
  const raw = JSON.parse(text) as Record<string, unknown>;
  return { raw, preset: parseEffectsPreset(text, stem), arm: rawArm(stem, raw) };
}

const golden = JSON.parse(readFileSync(join(FIXTURES, 'preset-canonical-golden.json'), 'utf8')) as {
  documents: Record<string, string>;
};
const vectors = JSON.parse(readFileSync(join(FIXTURES, 'effects-preset-vectors.json'), 'utf8')) as {
  cases: { expect: string; doc: unknown }[];
};
const boundaryCase = vectors.cases.find((c) => c.expect === 'pass'
  && typeof c.doc === 'object' && c.doc !== null && 'boundary' in c.doc);
if (!boundaryCase) {
  throw new Error('the contract vectors carry no passing boundary document, so the fourth arm is unmeasured');
}
const boundaryDoc = boundaryCase.doc as { id: string };

/** Every non-bands document, loaded at MODULE scope so a loader error fails the file. */
const NON_BANDS: readonly RealDoc[] = [
  load('ramp_probe', golden.documents.ramp_probe),
  load('aurora_ramp_witness', golden.documents.aurora_ramp_witness),
  load('ojz_sec6_baseswap', readFileSync(join(FIXTURES, 'ojz_sec6_baseswap.json'), 'utf8')),
  load(boundaryDoc.id, JSON.stringify(boundaryDoc)),
];

/** The control: aeon's shipped two-band preset. */
const BANDS = load('authored_probe', golden.documents.authored_probe);

/** A locked scene with one split, so the strip has a real layer column beside the preset one. */
const SCENE: EffectsScene = {
  schema: 1, id: 'strip_test', v_factor: 15,
  layers: [
    { world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_LOCKED' },
    { world_y: 96, fa: 'FACTOR_1', fb: 'FACTOR_1_4', vsplit: { at: 44 } },
  ],
};

const viewWith = (p: EffectsPreset) => rasterTimelineView(SCENE, cameraPreviewPlan(SCENE, 512, 0), p);
const library = (p: EffectsPreset): EffectsPresetLibrary =>
  ({ presets: [p], unreadable: [], notices: [], loadedPaths: [] });

describe('the inputs are what this file says they are', () => {
  it('the non-bands set covers EVERY program arm the schema declares other than bands', () => {
    // Loud when a fifth arm is vendored: this file would otherwise go on
    // "covering" the non-bands case with three of four arms.
    expect(new Set(NON_BANDS.map((d) => d.arm)))
      .toEqual(new Set(EFFECTS_PRESET_PROGRAM_ARMS.filter((a) => a !== 'bands')));
    for (const d of NON_BANDS) expect(d.preset.bands, `${d.preset.id} parsed with a bands key`).toBeUndefined();
  });

  it('CONTROL: the bands document really carries bands', () => {
    expect(BANDS.arm).toBe('bands');
    expect((BANDS.raw.bands as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('CONTROL: a real bands preset on the strip', () => {
  it('draws one row per band, and the honesty line drops "palette bands" because they ARE drawn', () => {
    const v = viewWith(BANDS.preset);
    expect(v.presetId).toBe(BANDS.preset.id);
    expect(v.presetBands).toHaveLength((BANDS.raw.bands as unknown[]).length);
    expect(v.absent).toEqual(rasterTimelineAbsences(true));
    // ...and that line really is shorter than the one with nothing drawn, so the
    // defect rows below compare against something that discriminates.
    expect(rasterTimelineAbsences(true)).not.toEqual(rasterTimelineAbsences(false));
  });
});

describe('a real non-bands preset on the strip (OPEN: look ruling pending)', () => {
  for (const d of NON_BANDS) {
    it(`PRECONDITION: ${d.preset.id} (${d.arm}) reaches the strip's view and the preset column is empty`, () => {
      const v = viewWith(d.preset);
      expect(v.presetId, 'the preset never reached the view, so the row below would be vacuous').toBe(d.preset.id);
      expect(v.presetBands).toHaveLength(0);
      expect(rasterTimelinePresetRows(d.preset, null)).toHaveLength(0);
    });

    it.fails(`DEFECT (it.fails): ${d.preset.id} (${d.arm}) gets a different honesty line from a preset whose bands are drawn`, () => {
      // The strip draws nothing of this program, so its "not drawn" line cannot
      // be the one printed when the preset column is fully drawn. Any of the
      // options in the audit report satisfies this; the current code does not.
      expect(viewWith(d.preset).absent).not.toEqual(rasterTimelineAbsences(true));
    });
  }
});

describe('POSITIVE CONTROL: sites that already handle a non-bands preset correctly', () => {
  for (const d of NON_BANDS) {
    it(`${d.preset.id} (${d.arm}): the preset list row names the program, not "0 bands"`, () => {
      const [entry] = presetListEntries(library(d.preset));
      expect(entry.channel).toBe(d.arm);
      expect(presetListSummary(entry)).not.toMatch(/^\d+ bands?$/);
    });

    it(`${d.preset.id} (${d.arm}): the band controls refuse with the PROGRAM's reason, not "this is its only raster band"`, () => {
      const why = bandControlsRefusal(d.preset);
      expect(why).not.toBeNull();
      expect(lastBandRefusal(d.preset)).toBe(why);
      expect(why).not.toContain('only raster band');
    });
  }
});
