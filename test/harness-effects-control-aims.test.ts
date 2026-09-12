/**
 * THE TWO EFFECTS AIMS THE TIMELINE RIGS DERIVE, CHECKED AGAINST THE APP.
 *
 * TIMELINE-HARNESS-AIM-DRIFT, 2026-09-12. `scratchpad/raster-timeline-harness.mjs`
 * aimed at its vsplit toggle by a title prefix copied out of the DOM, and
 * `scratchpad/ramp-control-harness.mjs` at its program switch by a row label.
 * The app renamed both, both aims found nothing, and both harnesses reported
 * the miss as app failures. They now read what they aim at out of the app's
 * source (`scratchpad/lib/effects-control-aims.mjs`).
 *
 * A `.mjs` reader of TypeScript source is a PATTERN, and a pattern rots
 * quietly. These rows run the reader against the constants it reads, so a
 * reshape goes red here in `npm test`, and not only at the next hand run of a
 * harness, which is how the last two drifts sat unnoticed for a week.
 *
 * The loud-on-miss builder (`scratchpad/lib/strict-aim.mjs`) is run against a
 * stand-in document, so its three answers (one hit, none, two) are pinned
 * without Electron. That is a claim about the builder only; that the harnesses
 * USE it, and stop on a real miss, is shown by planting a wrong aim in a run.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import {
  vsplitAims, programArms, bandRefusalNeedles,
  VSPLIT_ROW_SOURCE, SCENE_PANEL_SOURCE, PRESET_SCHEMA_SOURCE, VSPLIT_SELECT_COMPOSITION,
  BAND_REFUSAL_SOURCE,
} from '../scratchpad/lib/effects-control-aims.mjs';
import { aimOne, AIM_MISSED } from '../scratchpad/lib/strict-aim.mjs';
import { LAYER_VSPLIT_ROW, LAYER_CURVE_ROW } from '../src/renderer/providers/effects-aeon';
import { EFFECTS_PRESET_PROGRAM_ARMS } from '../src/core/formats/effects/preset';
import type { EffectsPreset } from '../src/core/formats/effects/preset';
import { PROGRAM_ARM_OPTIONS, bandControlsRefusal } from '../src/renderer/providers/effects-preset';
import { newRamp, newBaseSwap, newBoundary, newPreset } from '../src/renderer/providers/effects-preset';

const ROOT = resolve(__dirname, '..');
const VSPLIT = vsplitAims(ROOT);
/** 1 and 10 are here together on purpose: `Layer 1 ` must not aim at layer 10. */
const LAYERS = [0, 1, 2, 7, 10];

describe('the vsplit aims the raster-timeline rig reads from source', () => {
  it('the toggle aim is a prefix of the title the panel renders on every layer card', () => {
    for (const i of LAYERS) {
      expect(`Layer ${i} ${LAYER_VSPLIT_ROW.title}`.startsWith(VSPLIT.select(i))).toBe(true);
    }
  });

  it('the toggle aim matches no neighbour: not the row spinner, not the curve row, not another layer', () => {
    for (const i of LAYERS) {
      const aim = VSPLIT.select(i);
      expect(`Layer ${i} ${LAYER_CURVE_ROW.title}`.startsWith(aim)).toBe(false);
      expect(VSPLIT.spinner(i).startsWith(aim)).toBe(false);
      expect(`Layer ${i} ${LAYER_VSPLIT_ROW.title}`.startsWith(VSPLIT.spinner(i))).toBe(false);
      for (const j of LAYERS) {
        if (j !== i) expect(`Layer ${j} ${LAYER_VSPLIT_ROW.title}`.startsWith(aim)).toBe(false);
      }
    }
  });
});

describe('the program arms the ramp-control rig aims its switch by', () => {
  it('equal the app arms and the option values of the Program select', () => {
    const arms = programArms(ROOT);
    expect(arms.length).toBeGreaterThan(1);
    expect([...arms]).toEqual([...EFFECTS_PRESET_PROGRAM_ARMS]);
    expect(PROGRAM_ARM_OPTIONS.map((o) => o.value).slice().sort()).toEqual([...arms]);
  });
});

/**
 * RAMP-RIG-DCB-NEEDLE, 2026-09-12. `[dc-b]` of the ramp-control rig asked the
 * painted refusal for `EXACTLY ONE raster program`, a phrase the app dropped ON
 * PURPOSE on 2026-09-04 (`46bfbb58`): `boundary` joined the `oneOf` and lowers
 * into `ep_patched`, so the exclusivity rule is about PROGRAMS. The row could
 * not find its needle and measured only the fragments that happened to survive.
 *
 * The needles are now READ from `bandControlsRefusal`. These rows run that
 * reader against the real function — the only check that can say the reader
 * still reads what the app composes, because a `.mjs` reader of TypeScript is a
 * pattern and a pattern rots quietly.
 */
describe('the band-controls refusal the ramp-control rig requires', () => {
  const ID = 'aurora_local_rampctl_probe';
  const withArm = (arm: string): EffectsPreset => {
    const p = newPreset(ID) as Record<string, unknown>;
    delete p.bands;
    if (arm === 'ramp') p.ramp = newRamp();
    else if (arm === 'base_swap') p.base_swap = newBaseSwap();
    else if (arm === 'boundary') p.boundary = newBoundary();
    else throw new Error(`no fixture for the "${arm}" arm`);
    return p as unknown as EffectsPreset;
  };
  /** Every arm the sentence can be about: the contract's own, less `bands`. */
  const ARMS = EFFECTS_PRESET_PROGRAM_ARMS.filter((a) => a !== 'bands');

  it('is derived, not retyped: every needle is really in the sentence the app composes', () => {
    expect(ARMS.length).toBeGreaterThan(0);
    for (const arm of ARMS) {
      const want = bandRefusalNeedles(ROOT, arm, ID);
      const said = bandControlsRefusal(withArm(arm));
      expect(said, `bandControlsRefusal is silent on a ${arm} document`).not.toBeNull();
      for (const needle of want.needles) expect(said!).toContain(needle);
      // The search key must FIND the element, so it has to be in the sentence
      // too — and single-line, since `paintedRect` matches raw innerText.
      expect(said!).toContain(want.search);
      expect(want.search).not.toContain('\n');
      expect(want.noun).toBe(want.search.replace(/^.*carries a /, '').replace(/, not bands$/, ''));
    }
  });

  /**
   * ⚠ THE ROW THAT SAYS THE NEEDLE IS THIS RULE'S. A re-pointed matcher that
   * matches a DIFFERENT rule's wording is the failure this repo has paid for
   * (a row matched `/has only \d+ tiles/` and caught an unrelated refusal for
   * its whole life). So: the needles must be absent from the sentence's own
   * nearest neighbours — the same panel's OTHER refusals, and the answer on a
   * bands document, which is no sentence at all.
   */
  it('matches only this rule: silent on bands, and no neighbour refusal carries these words', () => {
    const want = bandRefusalNeedles(ROOT, 'ramp', ID);
    expect(bandControlsRefusal(newPreset(ID))).toBeNull();
    const neighbours = ARMS.filter((a) => a !== 'ramp')
      .map((a) => bandControlsRefusal(withArm(a))!);
    expect(neighbours.length).toBeGreaterThan(0);
    for (const other of neighbours) {
      // The core is shared wording with the noun swapped, so the RAMP needle
      // must not match a base-swap or boundary document's sentence.
      expect(other).not.toContain(want.needles[0]);
      expect(other).not.toContain(want.search);
    }
  });

  it('follows the arm noun and the way out rather than assuming either', () => {
    const ramp = bandRefusalNeedles(ROOT, 'ramp', ID);
    const boundary = bandRefusalNeedles(ROOT, 'boundary', ID);
    expect(ramp.noun).not.toBe(boundary.noun);
    expect(ramp.needles[0]).toContain(`carries a ${ramp.noun},`);
    expect(boundary.needles[0]).toContain(`carries a ${boundary.noun},`);
    // The way out exists because `bands` has a seed; the reader reads that.
    expect(ramp.needles[ramp.needles.length - 1]).toContain('one undo step');
    expect(bandControlsRefusal(withArm('ramp'))!)
      .toContain(ramp.needles[ramp.needles.length - 1]);
  });

  it('refuses loudly when the function it reads moves, instead of aiming at a guess', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'band-refusal-'));
    try {
      mkdirSync(dirname(join(tmp, BAND_REFUSAL_SOURCE)), { recursive: true });
      const real = readFileSync(join(ROOT, BAND_REFUSAL_SOURCE), 'utf8');
      writeFileSync(join(tmp, BAND_REFUSAL_SOURCE), real);
      // CONTROL: the untouched copy derives what the real tree derives.
      expect(bandRefusalNeedles(tmp, 'ramp', ID).needles)
        .toEqual(bandRefusalNeedles(ROOT, 'ramp', ID).needles);

      writeFileSync(join(tmp, BAND_REFUSAL_SOURCE),
        real.replace('export function bandControlsRefusal',
          'export function bandControlsWhyNot'));
      expect(() => bandRefusalNeedles(tmp, 'ramp', ID)).toThrow(BAND_REFUSAL_SOURCE);

      writeFileSync(join(tmp, BAND_REFUSAL_SOURCE),
        real.replace('export const PROGRAM_ARM_NOUNS', 'export const PROGRAM_NOUNS'));
      expect(() => bandRefusalNeedles(tmp, 'ramp', ID)).toThrow(BAND_REFUSAL_SOURCE);

      // An arm with no noun is a refusal, not a sentence about `undefined`.
      expect(() => bandRefusalNeedles(ROOT, 'no_such_arm', ID)).toThrow('no_such_arm');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('a derivation whose source moved', () => {
  it('refuses loudly and names the file, rather than aiming at a guess', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'effects-control-aims-'));
    try {
      for (const rel of [VSPLIT_ROW_SOURCE, SCENE_PANEL_SOURCE, PRESET_SCHEMA_SOURCE]) {
        mkdirSync(dirname(join(tmp, rel)), { recursive: true });
        writeFileSync(join(tmp, rel), readFileSync(join(ROOT, rel), 'utf8'));
      }
      // CONTROL: the untouched copy derives what the real tree derives, so a
      // refusal below is about the edit and not about the copy.
      expect(vsplitAims(tmp).select(3)).toBe(VSPLIT.select(3));
      expect([...programArms(tmp)]).toEqual([...programArms(ROOT)]);

      const row = readFileSync(join(tmp, VSPLIT_ROW_SOURCE), 'utf8');
      writeFileSync(join(tmp, VSPLIT_ROW_SOURCE),
        row.replace('export const LAYER_VSPLIT_ROW', 'export const LAYER_SPLIT_ROW'));
      expect(() => vsplitAims(tmp)).toThrow(VSPLIT_ROW_SOURCE);
      writeFileSync(join(tmp, VSPLIT_ROW_SOURCE), row);

      const panel = readFileSync(join(tmp, SCENE_PANEL_SOURCE), 'utf8');
      expect(panel).toContain(VSPLIT_SELECT_COMPOSITION);
      writeFileSync(join(tmp, SCENE_PANEL_SOURCE),
        panel.replace(VSPLIT_SELECT_COMPOSITION, '<Select title={vsplitTitle(i)}'));
      expect(() => vsplitAims(tmp)).toThrow(SCENE_PANEL_SOURCE);

      writeFileSync(join(tmp, PRESET_SCHEMA_SOURCE), '{}');
      expect(() => programArms(tmp)).toThrow(PRESET_SCHEMA_SOURCE);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('the strict aim builder', () => {
  const run = (listExpr: string): unknown =>
    new Function('document', `return ${aimOne('the thing', 'the place', listExpr)};`)(
      { querySelector: () => null });

  it('returns the only hit', () => {
    expect(run('["only"]')).toBe('only');
  });

  it('throws on zero hits, naming what it looked for and where', () => {
    expect(() => run('[]')).toThrow(
      `${AIM_MISSED}: the thing; looked in the place (active sub-tab: none); found 0, want exactly 1`);
  });

  it('throws on two hits, naming what it was ambiguous between', () => {
    expect(() => run('["a", "b"]')).toThrow('found 2, want exactly 1 [a | b]');
  });
});
