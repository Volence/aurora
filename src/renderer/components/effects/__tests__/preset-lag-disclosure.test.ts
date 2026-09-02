// THE NO-ROM DISCLOSURE above the `cycles` / `variants` controls — that it
// renders while its premise holds, that it does NOT render when the premise is
// gone, and that the premise cannot outlive its measurement.
//
// ROADMAP §5.1 row 97 (second half), the O62/O64 class: a control for a key the
// engine does not consume yet must say so on screen, and the saying must retire
// when it stops being true. The sentence is DERIVED from one constant
// (core/formats/effects/preset-lag.ts: PRESET_KEYS_AWAITING_AEON); the drift
// test MEASURES that constant against aeon at origin/master; this file proves
// the render is gated on it and that the measurement is still wired.
//
// ⚠ WHAT THESE ROWS CANNOT SEE. No React DOM here. The leaf is called as a
// plain function and its element tree walked (the object-inspector-field-bounds
// idiom) — that proves what it RETURNS, not that a pixel appeared. The pixel is
// scratchpad/variant-cycle-harness.mjs's, with a screenshot. The poison row
// stubs the DERIVED FACT (the constant), not the sentence: a sentence that
// rendered whether or not the constant was empty would pass a text check and
// fail here.

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PRESET_KEYS_AWAITING_AEON, PRESET_LAG_LEAD, PRESET_LAG_MEASURED_ON, PRESET_LAG_MEASUREMENT,
  presetLagDisclosure,
} from '../../../../core/formats/effects/preset-lag';
import { PresetLagDisclosure } from '../PresetLagDisclosure';
import { EFFECTS_PRESET_ROOT_KEYS, EFFECTS_PRESET_SCHEMA } from '../../../../core/formats/effects/preset';

const PANEL_PATH = join(__dirname, '..', 'BandPresetPanel.tsx');
const DRIFT_TEST_PATH = join(__dirname, '..', '..', '..', '..', '..', 'test', 'formats',
  'effects-preset-schema-drift.test.ts');
const LAG_MODULE = '../../../../core/formats/effects/preset-lag';

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every string leaf in an element tree, in order. */
function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: unknown };
    return textOf(props.children);
  }
  return '';
}

/** Walk an element tree, calling every function-typed component it meets. */
function expand(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement(node)) return node;
  const props = node.props as Record<string, unknown>;
  if (typeof node.type === 'function') {
    return expand((node.type as (p: unknown) => unknown)(props));
  }
  return React.cloneElement(node, undefined, expand(props.children) as React.ReactNode);
}

describe('the sentence, while the premise holds', () => {
  it('the premise is measured, non-empty, and made of keys the schema really declares', () => {
    // Anti-vacuous for every row below: if this list were empty the "renders"
    // rows would be checking nothing.
    expect(PRESET_KEYS_AWAITING_AEON.length).toBeGreaterThan(0);
    for (const k of PRESET_KEYS_AWAITING_AEON) {
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
      // ...and an OPTIONAL one: a required key could not be "not consumed".
      expect(EFFECTS_PRESET_SCHEMA.required as string[]).not.toContain(k);
    }
  });

  it('says the three things, in one sentence, with a date and where to re-measure', () => {
    const s = presetLagDisclosure()!;
    expect(s).not.toBeNull();
    expect(s.startsWith(PRESET_LAG_LEAD)).toBe(true);
    // 1. authored here  2. saved to the file  3. not consumed by the engine.
    expect(s).toMatch(/authored here/);
    expect(s).toMatch(/saved to this preset file/);
    expect(s).toMatch(/Not consumed by the engine yet/);
    expect(s).toMatch(/refuses (?:it|both) by name at origin\/master/);
    expect(s).toMatch(/nothing set below reaches a ROM/);
    expect(s).toMatch(/no emulator has shown/);
    // Every awaited key is named, verbatim.
    for (const k of PRESET_KEYS_AWAITING_AEON) expect(s).toContain(`\`${k}\``);
    // The expiry is dated, the date is the measurement's, and the measurement
    // is named so a reader can re-run it.
    expect(s).toContain(`Expires (${PRESET_LAG_MEASURED_ON})`);
    expect(PRESET_LAG_MEASURED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s).toContain(`Measured ${PRESET_LAG_MEASURED_ON} by ${PRESET_LAG_MEASUREMENT}`);
    expect(s).toContain('effects-preset-schema-drift.test.ts');
    expect(s).toMatch(/retires with the row/);
    // The surface's wording rules (band-preset-wording.test.ts) apply here too.
    expect(s).not.toMatch(/preview/i);
    expect(s).not.toMatch(/\bas you (?:can )?see\b|\blooks like\b|\bwill look\b/i);
  });

  it('the leaf RENDERS it, whole, as body text — not a title= attribute', () => {
    const el = PresetLagDisclosure();
    expect(el).not.toBeNull();
    const text = textOf(expand(el));
    expect(text).toBe(presetLagDisclosure());
    // Warning tone, so it is not mistaken for a footnote.
    expect((el as React.ReactElement<{ tone?: string }>).props.tone).toBe('warning');
  });

  it('the leaf takes no props — no guard can be handed to it', () => {
    expect(PresetLagDisclosure.length).toBe(0);
    const src = stripComments(readFileSync(join(__dirname, '..', 'PresetLagDisclosure.tsx'), 'utf8'));
    expect(src).toMatch(/export function PresetLagDisclosure\(\)/);
    expect(src).not.toMatch(/rasterRef|section|bound|selected/);
    // It reaches the sentence through the constant, not a literal copy.
    expect(src).toMatch(/presetLagDisclosure\(PRESET_KEYS_AWAITING_AEON\)/);
    expect(src).not.toMatch(/Not consumed|aeon's generator|Expires/);
  });
});

describe('the render gate — POISON: the premise stubbed false', () => {
  afterEach(() => {
    vi.doUnmock(LAG_MODULE);
    vi.resetModules();
  });

  it('with PRESET_KEYS_AWAITING_AEON empty, the leaf renders NOTHING', async () => {
    vi.resetModules();
    vi.doMock(LAG_MODULE, async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../../core/formats/effects/preset-lag')>();
      return { ...real, PRESET_KEYS_AWAITING_AEON: Object.freeze([]) };
    });
    const poisoned = await import('../PresetLagDisclosure');
    // The stub took: the module the leaf sees has an empty list.
    const lag = await import(LAG_MODULE);
    expect(lag.PRESET_KEYS_AWAITING_AEON).toEqual([]);
    expect(poisoned.PresetLagDisclosure()).toBeNull();
  });

  it('the derivation itself returns null on an empty list and a sentence otherwise', () => {
    expect(presetLagDisclosure([])).toBeNull();
    expect(presetLagDisclosure(['cycles'])).toMatch(/`cycles` is authored here/);
    expect(presetLagDisclosure(['cycles', 'variants'])).toMatch(/`cycles` and `variants` are authored here/);
  });
});

describe('the premise cannot outlive its measurement', () => {
  it('while the list is non-empty, the drift test still asserts the measured lag equals it', () => {
    const src = stripComments(readFileSync(DRIFT_TEST_PATH, 'utf8'));
    if (PRESET_KEYS_AWAITING_AEON.length === 0) {
      // The premise has retired; a measuring row would now be asserting an
      // empty lag, which is the drift row's own instruction to delete it.
      expect(src).not.toMatch(/PRESET_KEYS_AWAITING_AEON/);
      return;
    }
    expect(src, 'the drift test no longer imports the premise — the disclosure has no measurement '
      + 'behind it; either restore the lag row or empty PRESET_KEYS_AWAITING_AEON')
      .toMatch(/import \{ PRESET_KEYS_AWAITING_AEON \} from '\.\.\/\.\.\/src\/core\/formats\/effects\/preset-lag'/);
    expect(src).toMatch(/toEqual\(\[\.\.\.PRESET_KEYS_AWAITING_AEON\]\.sort\(\)\)/);
    // And it is the MEASURED lag on the left of that assertion, read from
    // aeon's page, not a second constant.
    expect(src).toMatch(/const lag = keys\['preset-refused'\]\.filter\(\(k\) => !schemaReserved\.includes\(k\)\)\.sort\(\);\s*expect\(lag,[\s\S]*?\.toEqual\(\[\.\.\.PRESET_KEYS_AWAITING_AEON\]\.sort\(\)\)/);
    // The test file carries NO literal copy of the names to drift from.
    expect(src).not.toMatch(/\[\s*'cycles'\s*,\s*'variants'\s*\]/);
  });
});

describe('the panel mounts the leaf first in the channels section, unconditionally', () => {
  const code = stripComments(readFileSync(PANEL_PATH, 'utf8'));

  it('the channels section exists and its body opens with the disclosure', () => {
    const section = code.indexOf('id="aeon.effects.preset.channels"');
    expect(section, 'no channels section in the panel').toBeGreaterThan(0);
    const body = code.indexOf('<SectionBody>', section);
    const leaf = code.indexOf('<PresetLagDisclosure', section);
    expect(body).toBeGreaterThan(section);
    expect(leaf).toBeGreaterThan(body);
    const between = code.slice(body + '<SectionBody>'.length, leaf);
    expect(between.trim(), `something sits between <SectionBody> and <PresetLagDisclosure>: ${between.trim()}`).toBe('');
    // No props, no guard on the line.
    const line = code.split('\n').find((l) => /<PresetLagDisclosure/.test(l))!;
    expect(line).toMatch(/<PresetLagDisclosure\s*\/>/);
    expect(line).not.toMatch(/&&|\?|selected\.|section/);
    // The controls come AFTER it in the same body.
    expect(code.indexOf('<CyclesBlock', leaf)).toBeGreaterThan(leaf);
    expect(code.indexOf('<VariantsBlock', leaf)).toBeGreaterThan(leaf);
  });

  it('the controls read the provider and spell no state transition of their own', () => {
    for (const name of [
      'CYCLES_STATE_OPTIONS.map', 'setCyclesStateCommand(', 'emptyCyclesAdvisory(',
      'addCycleChannelCommand(', 'removeCycleChannelCommand(', 'setCycleFieldCommand(',
      'VARIANTS_STATE_OPTIONS.map', 'setVariantsStateCommand(',
      'VARIANT_SLOT_OPTIONS.map', 'variantSlotIndices(', 'setVariantSlotStateCommand(',
      'setVariantFieldCommand(', 'toggleVariantLineCommand(', 'variantFieldSeed(',
    ]) {
      expect(code, name).toContain(name);
    }
    // The three spellings are the provider's to write. A `= null`, a `delete`
    // or a `= []` here would be a second author of the same state.
    expect(code).not.toMatch(/cycles\s*=\s*null|variants\s*=\s*\[\]|\bdelete\s+\w+\.(?:cycles|variants)/);
    expect(code).not.toMatch(/\.length\s*=[^=]/);
    // Titles are the schema's, through the provider — no retyped rule.
    expect(code).toMatch(/title=\{CYCLES_TITLE\}/);
    expect(code).toMatch(/title=\{VARIANTS_TITLE\}/);
    expect(code).toMatch(/cycleFieldTitle\(f\)/);
    expect(code).toMatch(/variantFieldTitle\(f\)/);
  });

  it('the lines checkboxes are chips over the INTEGER, and the integer is shown beside them', () => {
    expect(code).toMatch(/CRAM_LINES\.map/);
    expect(code).toMatch(/variantLineOn\(Number\(values\[f\]\), line\)/);
    expect(code).toMatch(/= \{Number\(values\[f\]\)\}/);
  });
});
