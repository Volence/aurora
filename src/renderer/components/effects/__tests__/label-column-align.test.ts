// ONE LABEL COLUMN PER CARD — parcel `label-column-align` (ROADMAP §5.1 row 43).
//
// The live app (scratchpad/2026-08-26-effects-foreground-checks.md) saw the
// layer card's label column at THREE widths: `minWidth` was a floor, and
// parcel D's `Plane A (foreground)` / `Plane B (background)` did not wrap, so
// those two rows pushed their factor selects 46px right of every other row.
//
// The fix is at the source: `Field`'s label is a fixed-width, wrapping column.
// Then every row shares one width BY CONSTRUCTION, and the only way a label
// can still break the column is a single unbreakable token wider than it.
// This file pins both halves the node suite can see:
//   1. `Field` wraps inside a fixed `width` (no floor, no nowrap).
//   2. Every label the layer card renders has no token longer than the longest
//      token among the column's static labels — the ones `column-layout.tsx`'s
//      docblock measured at 55px against a 64px column. Derived, never typed.
// The pixel confirmation is FOREGROUND: harness `effects-column` [L1]/[L1b],
// label-column offsets must be ONE distinct value.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLANE_FACTOR_ROWS, LAYER_CURVE_ROW, LAYER_VSPLIT_ROW, layerTopBounds,
  LAYER_DEFORM_ROW, TABLE_REF_ROW, tableParamLabel, tableRefFormOptions, tableRefParams,
  LEFT_COLUMN_MASK_ROW,
} from '../../../providers/effects-aeon';
import { EFFECTS_V_FACTOR_LOCK } from '../../../../core/formats/effects/scene-ui';

const HERE = join(__dirname, '..');
const layout = readFileSync(join(HERE, 'column-layout.tsx'), 'utf8');
const scenePanel = readFileSync(join(HERE, 'EffectsScenePanel.tsx'), 'utf8');
const bandPanel = readFileSync(join(HERE, 'BgAnimBandPanel.tsx'), 'utf8');

/** The `LABEL` style object's source text. */
function labelStyleSource(): string {
  const m = layout.match(/const LABEL: React\.CSSProperties = \{([\s\S]*?)\};/);
  expect(m, 'column-layout.tsx declares LABEL').not.toBeNull();
  return m![1];
}

/** Static `<Field label="…">` literals — the labels the column was measured on. */
function staticFieldLabels(src: string): string[] {
  return [...src.matchAll(/<Field label="([^"]*)"/g)].map((m) => m[1]);
}

const longestToken = (s: string) => Math.max(...s.split(/\s+/).map((t) => t.length));

const staticLabels = [...staticFieldLabels(scenePanel), ...staticFieldLabels(bandPanel)];
const tokenBar = Math.max(...staticLabels.map(longestToken));

/** Every label the layer card can render from a provider constant. */
const layerCardLabels = [
  PLANE_FACTOR_ROWS.fa.label, PLANE_FACTOR_ROWS.fb.label,
  LAYER_CURVE_ROW.label, LAYER_VSPLIT_ROW.label,
  // Both arms of the top row: locked (`Screen line`) and unlocked (`world_y`).
  layerTopBounds({ v_factor: EFFECTS_V_FACTOR_LOCK }).label,
  layerTopBounds({ v_factor: EFFECTS_V_FACTOR_LOCK - 1 }).label,
  // WAVE 2. The deform row plus every label its sub-form can DRAW, which is not
  // a list anyone wrote: the table sub-form renders one row per parameter of
  // whichever `$defs/tableRef` branch is selected, so the labels are
  // `tableParamLabel` over every parameter of every form the schema declares.
  // A branch added to the contract therefore arrives in this check on its own —
  // which is the only way a derived form can be held to a measured column.
  LAYER_DEFORM_ROW.label, TABLE_REF_ROW.label, TABLE_REF_ROW.binLabel,
  ...tableRefFormOptions().flatMap((o) => tableRefParams(o.value).map((p) => tableParamLabel(p.key))),
  // …and the four the deform rows label from their own schema keys.
  ...['speed', 'amp_shift', 'shift_a', 'shift_b', 'phase'].map(tableParamLabel),
  // The follow-up's policy row. Not a LAYER-card label — this array's real
  // content is "every label rendered from a provider constant rather than a
  // literal", which is what the static scan above cannot reach, and the scene
  // form's deform rows are in it for the same reason.
  LEFT_COLUMN_MASK_ROW.label,
];

describe('Field is one fixed, wrapping label column', () => {
  it('sizes the label with width, not a minWidth floor', () => {
    const style = labelStyleSource();
    expect(style).toMatch(/\bwidth:\s*LABEL_W\b/);
    expect(style).not.toMatch(/minWidth/);
  });
  it('lets the label wrap rather than push its control', () => {
    const style = labelStyleSource();
    expect(style).toMatch(/whiteSpace:\s*'normal'/);
    expect(style).not.toMatch(/nowrap/);
    // A silent mid-token break would hide an over-wide label; wrap at spaces only.
    expect(style).not.toMatch(/overflowWrap|wordBreak/);
  });
});

describe('every layer-card label wraps into the column', () => {
  it('the bar is derived from the static labels the column was measured on', () => {
    expect(staticLabels.length).toBeGreaterThan(5);
    expect(tokenBar).toBeGreaterThan(0);
  });
  it('no layer-card label carries a token longer than the bar', () => {
    for (const l of layerCardLabels) {
      expect(longestToken(l), l).toBeLessThanOrEqual(tokenBar);
    }
  });
  it('the layer card renders these constants, not private copies', () => {
    expect(scenePanel).toMatch(/<Field label=\{PLANE_FACTOR_ROWS\.fa\.label\}/);
    expect(scenePanel).toMatch(/<Field label=\{PLANE_FACTOR_ROWS\.fb\.label\}/);
    expect(scenePanel).toMatch(/<Field label=\{LAYER_CURVE_ROW\.label\}/);
    expect(scenePanel).toMatch(/<Field label=\{LAYER_VSPLIT_ROW\.label\}/);
    expect(scenePanel).toMatch(/<Field label=\{LAYER_DEFORM_ROW\.label\}/);
    // The deform sub-rows label themselves from the SCHEMA KEY they edit, so a
    // renamed key cannot leave a stale word above the spinner.
    expect(scenePanel).toMatch(/<Field label=\{tableParamLabel\('shift_a'\)\}/);
    expect(scenePanel).toMatch(/<Field label=\{tableParamLabel\('amp_shift'\)\}/);
    expect(scenePanel).toMatch(/<Field key=\{p\.key\} label=\{tableParamLabel\(p\.key\)\}/);
  });
});
