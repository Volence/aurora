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
// THE RULING (docs/reviews/2026-09-11-raster-timeline-program.md), landed here:
//   • the honesty line keys on `presetProgramArm(preset) === 'bands'`, so a
//     non-bands preset gets "palette bands" back;
//   • the column caption is `no bands` for a non-bands preset (parallel to the
//     `no preset` the strip already draws, and in the same dim register) —
//     NOT the program's noun, which does not fit the caption slot or the
//     footer's width row for `boundary`;
//   • the gesture tooltip and hints come from ONE helper that is null unless
//     the program is bands;
//   • nothing of the program is DRAWN — that is a feature, not this fix.
//
// The DEFECT rows below were `it.fails` from the audit until this landed; they
// are plain `it` now. The preconditions (the preset reached the view, the
// column really is empty) stay as their own rows so the defect rows cannot
// pass vacuously, and the documents still load at module scope.
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
  rasterTimelinePresetCaption, rasterTimelineGestures, RASTER_TIMELINE_GESTURES,
  drawRasterTimeline, inactiveRasterTimelineReport, RASTER_TIMELINE_PRESET_X,
  RASTER_TIMELINE_PRESET_W,
} from '../raster-timeline';
import { cameraPreviewPlan } from '../camera-preview';
import {
  parseEffectsPreset, EFFECTS_PRESET_PROGRAM_ARMS, EFFECTS_PRESET_RASTER_CHANNELS,
} from '../../../core/formats/effects/preset';
import type { EffectsPreset, EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import type { EffectsScene } from '../../../core/formats/effects/scene';
import {
  presetListEntries, presetListSummary, lastBandRefusal, bandControlsRefusal,
  PROGRAM_ARM_NOUNS,
} from '../../providers/effects-preset';
import {
  sectionArmExclusivityRefusal, type SectionRasterWiring,
} from '../../../core/formats/effects/section-wiring';

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

describe('a real non-bands preset on the strip', () => {
  for (const d of NON_BANDS) {
    it(`PRECONDITION: ${d.preset.id} (${d.arm}) reaches the strip's view and the preset column is empty`, () => {
      const v = viewWith(d.preset);
      expect(v.presetId, 'the preset never reached the view, so the row below would be vacuous').toBe(d.preset.id);
      expect(v.presetBands).toHaveLength(0);
      expect(rasterTimelinePresetRows(d.preset, null)).toHaveLength(0);
    });

    it(`DEFECT (was it.fails): ${d.preset.id} (${d.arm}) gets a different honesty line from a preset whose bands are drawn`, () => {
      // The strip draws nothing of this program, so its "not drawn" line cannot
      // be the one printed when the preset column is fully drawn.
      expect(viewWith(d.preset).absent).not.toEqual(rasterTimelineAbsences(true));
    });

    it(`${d.preset.id} (${d.arm}): the honesty line says palette bands are not drawn, because none are`, () => {
      // The specific line, not just "a different one": the flag is keyed on the
      // program, so a non-bands preset gets the line a column with no bands in
      // it gets. (The program's noun is deliberately NOT in this line — see the
      // caption rows below for why, and the width row in raster-timeline.test.ts.)
      const v = viewWith(d.preset);
      expect(v.absent).toEqual(rasterTimelineAbsences(false));
      expect(v.absent).toContain('palette bands');
      expect(v.presetProgram, 'the view names the arm, so a harness can tell no-bands from no-preset').toBe(d.arm);
    });
  }
});

/**
 * A `fillText` recorder — the strip's own test file has the full stub; the
 * caption needs only this. `textAlign` writes are recorded IN SEQUENCE with the
 * texts, because the caption's alignment is part of what makes it true: a
 * right-anchored x with a left alignment would put "no bands" over "layers".
 */
function textCtx(): CanvasRenderingContext2D & { texts: string[] } {
  const texts: string[] = [];
  const noop = () => { /* not measured here */ };
  let align = 'left';
  const ctx = {
    texts,
    save: noop, restore: noop, setTransform: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    closePath: noop, stroke: noop, fill: noop, fillRect: noop, rect: noop, clip: noop,
    setLineDash: noop,
    fillText: (t: string, x: number, y: number) => { texts.push(`${t}@${x},${y}`); },
    measureText: (t: string) => ({ width: t.length * 5 }),
    get textAlign() { return align; },
    set textAlign(v: string) { align = v; texts.push(`align=${v}`); },
    font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
  } as unknown as CanvasRenderingContext2D & { texts: string[] };
  return ctx;
}

/** The caption's anchor: the preset column's RIGHT edge, right-aligned (see the draw). */
const CAPTION_AT = `@${RASTER_TIMELINE_PRESET_X + RASTER_TIMELINE_PRESET_W},18`;

describe('the preset column\'s caption: three states, and the third is no longer "bands"', () => {
  it('CONTROL: with no preset the caption is "no preset", and with a bands preset it is "bands"', () => {
    const none = rasterTimelineView(SCENE, cameraPreviewPlan(SCENE, 512, 0), null);
    expect(none.presetProgram).toBeNull();
    expect(rasterTimelinePresetCaption(none)).toBe('no preset');
    const bands = viewWith(BANDS.preset);
    expect(bands.presetProgram).toBe('bands');
    expect(rasterTimelinePresetCaption(bands)).toBe('bands');
    // ...and the draw puts exactly that word at the caption's place.
    const ctx = textCtx();
    drawRasterTimeline(ctx, bands);
    expect(ctx.texts).toContain(`bands${CAPTION_AT}`);
  });

  for (const d of NON_BANDS) {
    it(`${d.preset.id} (${d.arm}): the caption is "no bands" — not "bands" over an empty column, and not "no preset"`, () => {
      const v = viewWith(d.preset);
      const caption = rasterTimelinePresetCaption(v);
      expect(caption).toBe('no bands');
      // The drawn text is the same word, at the same place the other two states use.
      const ctx = textCtx();
      drawRasterTimeline(ctx, v);
      expect(ctx.texts).toContain(`no bands${CAPTION_AT}`);
      expect(ctx.texts, 'the old caption must be gone, not drawn under the new one')
        .not.toContain(`bands${CAPTION_AT}`);
      expect(ctx.texts).not.toContain(`no preset${CAPTION_AT}`);
    });
  }

  it('the new caption is no longer than the "no preset" caption the same slot already carries', () => {
    // The strip already draws "no preset" in this slot; a third state that fits
    // within that length cannot overflow anything the existing one does not.
    const noPreset = rasterTimelinePresetCaption({ presetId: null, presetProgram: null });
    const noBands = rasterTimelinePresetCaption({ presetId: 'x', presetProgram: 'ramp' });
    expect(noBands.length).toBeLessThanOrEqual(noPreset.length);
  });

  it('the caption is RIGHT-aligned to the column\'s right edge, and the alignment is put back after it', () => {
    // MEASURED, not estimated: left-aligned at x=34, "no bands" is 37px wide at
    // 9px system-ui and ran under "layers" (x=66) on the 2026-09-11 capture. The
    // slot is only RASTER_TIMELINE_STRIP_X - RASTER_TIMELINE_PRESET_X px, so the
    // caption is anchored at the column's right edge and grows LEFT. This row
    // pins the sequence: align right, the caption at the anchor, align left —
    // so the caption cannot be right-anchored while still left-aligned (which
    // would push it INTO "layers"), and nothing drawn after it inherits 'right'.
    for (const v of [viewWith(NON_BANDS[0].preset), viewWith(BANDS.preset)]) {
      const ctx = textCtx();
      drawRasterTimeline(ctx, v);
      const caption = rasterTimelinePresetCaption(v);
      const at = ctx.texts.indexOf(`${caption}${CAPTION_AT}`);
      expect(at, 'the caption was not drawn at the anchor').toBeGreaterThan(0);
      expect(ctx.texts[at - 1]).toBe('align=right');
      expect(ctx.texts[at + 1]).toBe('align=left');
      // ...and the layer caption keeps its own place, unmoved.
      expect(ctx.texts).toContain('layers@66,18');
    }
  });

  it('a fifth arm, or a document with no arm at all, lands in the third state without a code change', () => {
    // Positive test on `bands`, so the caption is right for every arm there will be.
    expect(rasterTimelinePresetCaption({ presetId: 'x', presetProgram: 'some_future_arm' })).toBe('no bands');
    expect(rasterTimelinePresetCaption({ presetId: 'x', presetProgram: null })).toBe('no bands');
  });
});

describe('the gesture sentence: one helper for the tooltip and the hint', () => {
  it('CONTROL: a bands preset gets the gesture sentence, and no preset gets none', () => {
    expect(rasterTimelineGestures(viewWith(BANDS.preset).presetProgram)).toBe(RASTER_TIMELINE_GESTURES);
    expect(rasterTimelineGestures(null)).toBeNull();
  });

  for (const d of NON_BANDS) {
    it(`${d.preset.id} (${d.arm}): no "Drag a band edge" over a column with no band`, () => {
      expect(rasterTimelineGestures(viewWith(d.preset).presetProgram)).toBeNull();
    });
  }
});

describe('the report carries the program, so a harness can tell "no bands" from "no preset"', () => {
  it('the inactive publish reports a null program beside a null preset id', () => {
    const r = inactiveRasterTimelineReport();
    expect(r.presetId).toBeNull();
    expect(r.presetProgram).toBeNull();
  });
});

// ═══ F3: the debug hook's preset list names the program, as F1's agent list does
//
// `debug-hooks.ts` installs onto `window` and is exercised by the CDP harnesses,
// not here; the node suite's precedent for this file is a read of its SOURCE
// (`renderer/__tests__/debug-level-edit.test.ts`), and that is what this row is.
// It is a text row and says so: it proves the field is in the hook's body, not
// that a harness received it.
describe('F3: __dbg.aeon.presets() carries `program` beside the band count', () => {
  const src = readFileSync(resolve(__dirname, '../../debug-hooks.ts'), 'utf8');
  const hook = /presets: \(\) =>[\s\S]*?\}\)\),\n\s*presetsJson:/.exec(src)?.[0];

  it('PRECONDITION: the presets hook body was found', () => {
    expect(hook, 'the presets() hook could not be located in debug-hooks.ts; re-read the file').toBeDefined();
  });

  it('the hook maps `program: presetProgramArm(p)`', () => {
    expect(hook).toContain('program: presetProgramArm(p)');
    expect(src).toMatch(/import \{ presetProgramArm \} from '\.\.\/core\/formats\/effects\/preset'/);
  });

  it('CONTROL: the band count is still there — band-preset-harness row 1b reads it', () => {
    expect(hook).toContain('bands: (p.bands ?? []).length');
  });
});

// ═══ F4: the arm-exclusivity refusal no longer says a preset "carries bands"
//
// The sentence is core's and core must not import the preset codec, so its three
// nouns are typed there. THIS row holds those spellings to `PROGRAM_ARM_NOUNS`,
// per raster channel, so the sentence cannot drift from the map every other
// sentence on the tab reads.
describe('F4: sectionArmExclusivityRefusal names every raster program, not just bands', () => {
  /** The smallest wiring `sectionArmExclusivity` calls barred: one binding, whose record passes a patched arm. */
  const barred: SectionRasterWiring = {
    bindings: { 0: 'ZZZ_Preset_Sec0' },
    threadedBy: {},
    channelThreadedBy: {},
    patchedArm: { ZZZ_Preset_Sec0: 'ZZZ_TwoChannel' },
    descriptor: { path: '(synthetic)', parsed: true },
    library: { path: '(synthetic)', parsed: true },
  };
  const say = sectionArmExclusivityRefusal(barred, 0, 'zzz_act1_sec_raster');

  it('PRECONDITION: the wiring is barred, so there is a sentence to read', () => {
    expect(say).not.toBeNull();
    expect(say).toContain('ZZZ_TwoChannel');
  });

  it('the stale premise is gone', () => {
    expect(say).not.toContain('carries bands');
  });

  it('every RASTER channel\'s noun is in the sentence, spelled as PROGRAM_ARM_NOUNS spells it', () => {
    // Loud when a raster channel is added: the sentence would then be typed
    // one noun short, and this is the row that says so.
    expect(EFFECTS_PRESET_RASTER_CHANNELS.length).toBeGreaterThanOrEqual(3);
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      expect(say, `the sentence does not name the ${c} program`).toContain(PROGRAM_ARM_NOUNS[c]);
    }
    expect(say).toContain('lowers to a raster program');
  });

  it('CONTROL: the boundary noun is NOT in it — a boundary lowers to patched:, and this sentence is about raster:', () => {
    // The sentence is still the wrong one for a boundary document (condition
    // 2's recorded defect, not this parcel's); what this row pins is that the
    // fix did not paper over that by claiming a boundary lowers to raster.
    expect(EFFECTS_PRESET_RASTER_CHANNELS).not.toContain('boundary');
    expect(say).not.toContain(PROGRAM_ARM_NOUNS.boundary);
  });
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
