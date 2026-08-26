// COLUMN-WIDTH DISCIPLINE FOR THE NEW WORDING — parcel D.
//
// The effects column is 300px wide and every prior parcel measured it under
// CDP at 1280x800 and 1680x1050 (`scratchpad/effects-column-harness.mjs`, a
// FOREGROUND instrument this suite cannot run). What this file CAN hold the
// line on is the input to that measurement: no new label is longer than the
// longest label the column already wraps, and no new string carries an
// unbreakable token longer than that either — the two ways a string forces a
// column wider. The bar is DERIVED from the panel sources, never typed in, so
// it moves with the column rather than with someone's memory of it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLANE_FACTOR_ROWS, PLANE_FACTOR_HINT, LAYER_CURVE_ROW, LAYER_VSPLIT_ROW,
} from '../../../providers/effects-aeon';
import {
  BAND_MECHANISM_HINT, bandMotion, BAND_SCROLL_DIRECTION,
} from '../../../providers/bganim-preview-aeon';

const HERE = join(__dirname, '..');
const scenePanel = readFileSync(join(HERE, 'EffectsScenePanel.tsx'), 'utf8');
const bandPanel = readFileSync(join(HERE, 'BgAnimBandPanel.tsx'), 'utf8');

/** Every `label="…"` / label={`…`} literal in a panel source, `${x}` holes narrowed to one digit. */
function labelLiterals(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/label=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    out.push((m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, '0'));
  }
  return out;
}

const existingLabels = [...labelLiterals(scenePanel), ...labelLiterals(bandPanel)];
const longestExistingLabel = Math.max(...existingLabels.map((s) => s.length));
const longestToken = (s: string) => Math.max(...s.split(/\s+/).map((t) => t.length));

// Parcel D's rows, then parcel H's two control rows and their hints — the same
// bar, extended rather than re-measured.
const newLabels = [
  PLANE_FACTOR_ROWS.fa.label, PLANE_FACTOR_ROWS.fb.label,
  LAYER_CURVE_ROW.label, LAYER_VSPLIT_ROW.label, LAYER_VSPLIT_ROW.none, LAYER_VSPLIT_ROW.at,
];
const newStrings = [
  ...newLabels, PLANE_FACTOR_HINT, BAND_MECHANISM_HINT,
  LAYER_CURVE_ROW.hint, LAYER_VSPLIT_ROW.hint, LAYER_CURVE_ROW.none,
  ...[0, 2, 3].flatMap((n) => [
    bandMotion({ driver: 'timer', rateShift: n }, 'band'),
    bandMotion({ driver: 'camera_x', rateShift: n }, 'candidate'),
  ]),
];

describe('the new wording fits the column the existing wording already fits', () => {
  it('the bar is measured from the panels, not typed', () => {
    // A bar that read as zero would make every row below vacuous.
    expect(existingLabels.length).toBeGreaterThan(5);
    expect(longestExistingLabel).toBeGreaterThan(0);
  });

  it('no new label is longer than the longest existing label', () => {
    for (const l of newLabels) expect(l.length, l).toBeLessThanOrEqual(longestExistingLabel);
  });

  it('no new string carries an unbreakable token longer than the longest existing label', () => {
    for (const s of newStrings) expect(longestToken(s), s).toBeLessThanOrEqual(longestExistingLabel);
  });

  it('the direction constant, when flipped, still cannot lengthen the widest token', () => {
    for (const dir of ['left', 'right'] as const) {
      expect(dir.length).toBeLessThanOrEqual(longestExistingLabel);
    }
    expect(['', 'left', 'right']).toContain(BAND_SCROLL_DIRECTION);
  });
});

describe('fa / fb say which plane, and "packed" stays inside the custom expander', () => {
  it('labels the rows by plane and role', () => {
    expect(PLANE_FACTOR_ROWS.fa.label).toBe('Plane A (foreground)');
    expect(PLANE_FACTOR_ROWS.fb.label).toBe('Plane B (background)');
  });

  it('the hint says what the fraction is, and what 1 means', () => {
    expect(PLANE_FACTOR_HINT).toMatch(/fraction of camera/i);
    expect(PLANE_FACTOR_HINT).toMatch(/1 = with the camera/);
  });

  it('none of the row labels, titles or the hint says "packed"', () => {
    for (const row of Object.values(PLANE_FACTOR_ROWS)) {
      expect(row.label).not.toMatch(/packed/i);
      expect(row.title).not.toMatch(/packed/i);
    }
    expect(PLANE_FACTOR_HINT).not.toMatch(/packed/i);
  });

  it('in the panel source, the only quoted "packed" is inside FactorField (the custom expander)', () => {
    const start = scenePanel.indexOf('function FactorField');
    const end = scenePanel.indexOf('export default function EffectsScenePanel');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const outside = stripComments(scenePanel.slice(0, start) + scenePanel.slice(end));
    const quoted = outside.match(/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g) ?? [];
    expect(quoted.filter((q) => /packed/i.test(q))).toEqual([]);
  });
});

describe('the panels render the constants rather than a second copy of the words', () => {
  it('EffectsScenePanel uses PLANE_FACTOR_ROWS and PLANE_FACTOR_HINT', () => {
    expect(scenePanel).toMatch(/PLANE_FACTOR_ROWS/);
    expect(scenePanel).toMatch(/PLANE_FACTOR_HINT/);
    expect(scenePanel).not.toMatch(/Plane [AB] packed scroll factor/);
  });
  it('EffectsScenePanel renders LAYER_CURVE_ROW / LAYER_VSPLIT_ROW and writes both keys through setLayerFieldCommand', () => {
    for (const k of ['label', 'title', 'hint'] as const) {
      expect(scenePanel).toMatch(new RegExp(`LAYER_CURVE_ROW\\.${k}`));
      expect(scenePanel).toMatch(new RegExp(`LAYER_VSPLIT_ROW\\.${k}`));
    }
    expect(scenePanel).toMatch(/setLayerFieldCommand\(\s*library,\s*selected\.id,\s*i,\s*'curve'/);
    expect(scenePanel).toMatch(/setLayerFieldCommand\(\s*library,\s*selected\.id,\s*i,\s*'vsplit'/);
    // The read-only extras line no longer says "no control yet" for these two.
    expect(scenePanel).not.toMatch(/no control yet/);
  });
  it('BgAnimBandPanel renders BAND_MECHANISM_HINT', () => {
    expect(bandPanel).toMatch(/BAND_MECHANISM_HINT/);
  });
});
