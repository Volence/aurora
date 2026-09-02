// THE NO-ROM DISCLOSURE above the `cycles` / `variants` controls — RETIRED
// 2026-09-02, and this file is what stops the retirement from becoming an
// unmeasured claim.
//
// ROADMAP §5.1 row 97 (second half), the O62/O64 class: a control for a key the
// engine does not consume yet must say so on screen, and the saying must retire
// when it stops being true. The sentence is DERIVED from one constant
// (core/formats/effects/preset-lag.ts: PRESET_KEYS_AWAITING_AEON); the drift
// test MEASURES that constant's subject against aeon at origin/master.
//
// ═══ WHAT CHANGED, AND WHY THIS FILE DID NOT BECOME VACUOUS ═══
//
// aeon MERGED EFFECTS-W1 DoD item 5 (`445a5856`) — its generator now lowers
// both keys — so the premise is empty and the leaf renders nothing. A file whose
// every row said "the sentence is on screen" would now either be deleted or
// quietly inverted into three assertions of `null`, which is the failure mode
// this repo cares most about: a suite that still passes while asserting nothing
// about a retired feature. So the rows are re-aimed, not removed:
//
//   1. THE RETIREMENT IS ASSERTED, not assumed — the premise is empty, and the
//      leaf really returns null because of that and not for some other reason.
//   2. THE WORDING IS STILL FULLY ASSERTED, by driving the derivation with an
//      EXPLICIT list (the retired premise's own value, replayed). If a lag
//      re-opens, the sentence that comes back is still the right sentence.
//   3. THE POISON IS INVERTED, and it is the stronger direction now: stub the
//      constant back to NON-empty and the leaf must render the whole sentence.
//      That proves the gate is a gate — a leaf hard-wired to `return null`
//      would pass rows 1 and 2 and fail here.
//   4. THE RETIREMENT IS STILL MEASURED: the drift test must still read aeon's
//      refusal list at a committed revision and assert the lag is EMPTY. Delete
//      that row and this file goes red, so "no sentence" cannot outlive the
//      measurement that justifies it any more than the sentence could.
//
// ⚠ NOT CERTIFIED, ONLY MERGED. Nothing here says a ROM obeys these keys. Item 5
// is on aeon's master; sigil `dd5eaad2` records chain 198 RED with no ROM byte
// moved, and chain 199 supersedes it. The re-open condition is written down in
// core/formats/effects/preset-lag.ts.
//
// ⚠ WHAT THESE ROWS CANNOT SEE. No React DOM here. The leaf is called as a
// plain function and its element tree walked (the object-inspector-field-bounds
// idiom) — that proves what it RETURNS, not that a pixel appeared. The pixel is
// scratchpad/variant-cycle-harness.mjs's, with a screenshot.

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

/**
 * THE RETIRED PREMISE'S OWN VALUE, REPLAYED. Not an invented fixture: this is
 * exactly what `PRESET_KEYS_AWAITING_AEON` held from the 12aecd5 re-vendor until
 * aeon merged item 5, and the row below checks both names are still optional
 * root keys of the schema, so the replay is against the real vocabulary rather
 * than fiction. Driving the derivation with it keeps the WORDING asserted with
 * the premise empty — a re-opened lag gets the same sentence it would have got.
 */
const THE_LAG_THAT_WAS: readonly string[] = Object.freeze(['cycles', 'variants']);

describe('the premise has RETIRED — and the retirement is asserted, not assumed', () => {
  it('the premise is EMPTY, and the keys it held are optional root keys the schema declares', () => {
    expect(
      PRESET_KEYS_AWAITING_AEON,
      'PRESET_KEYS_AWAITING_AEON is not empty — a lag has re-opened. That is not a failure of '
      + 'this row: re-aim this file at the sentence being ON screen (git log it for the shape it '
      + 'had until 2026-09-02), and see the drift test\'s refusal-list row, which measures it.',
    ).toEqual([]);
    // Anti-vacuous for the wording rows: the replayed list is real vocabulary —
    // root keys of the schema, and OPTIONAL ones, because a required key could
    // never have been "not consumed".
    expect(THE_LAG_THAT_WAS.length).toBeGreaterThan(0);
    for (const k of THE_LAG_THAT_WAS) {
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
      expect(EFFECTS_PRESET_SCHEMA.required as string[]).not.toContain(k);
    }
  });

  it('so there is NO sentence, and no element — the derivation and the leaf both say nothing', () => {
    expect(presetLagDisclosure()).toBeNull();
    expect(PresetLagDisclosure()).toBeNull();
    // ...and it is the PREMISE that silenced them, not something else: the same
    // derivation with a non-empty list still speaks.
    expect(presetLagDisclosure(THE_LAG_THAT_WAS)).not.toBeNull();
  });
});

describe('the wording, driven with an explicit list — what a re-opened lag would say', () => {
  it('says the three things, in one sentence, with a date and where to re-measure', () => {
    const s = presetLagDisclosure(THE_LAG_THAT_WAS)!;
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
    for (const k of THE_LAG_THAT_WAS) expect(s).toContain(`\`${k}\``);
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

/**
 * THE POISON, INVERTED WITH THE PREMISE.
 *
 * It used to stub the constant EMPTY and require silence — the right direction
 * while the sentence was on screen. With the premise retired that stub is the
 * production state, so it would prove nothing: a leaf hard-wired to
 * `return null` would pass it. The load-bearing direction now is the other one.
 * Stub the constant back to NON-empty — the shape of a re-opened lag — and the
 * leaf must produce the whole sentence again. It stubs the DERIVED FACT, not
 * the sentence: a leaf that rendered a literal regardless of the constant would
 * pass a text check and fail the `toBe(presetLagDisclosure(...))` below.
 */
describe('the render gate — POISON: the premise stubbed back to NON-empty', () => {
  afterEach(() => {
    vi.doUnmock(LAG_MODULE);
    vi.resetModules();
  });

  it('with PRESET_KEYS_AWAITING_AEON re-filled, the leaf renders the WHOLE sentence as body text', async () => {
    vi.resetModules();
    vi.doMock(LAG_MODULE, async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../../core/formats/effects/preset-lag')>();
      return { ...real, PRESET_KEYS_AWAITING_AEON: THE_LAG_THAT_WAS };
    });
    const poisoned = await import('../PresetLagDisclosure');
    // The stub took: the module the leaf sees has the re-filled list.
    const lag = await import(LAG_MODULE);
    expect(lag.PRESET_KEYS_AWAITING_AEON).toEqual([...THE_LAG_THAT_WAS]);

    const el = poisoned.PresetLagDisclosure();
    expect(el, 'the leaf renders nothing on a NON-empty premise — the gate is stuck shut, and a '
      + 're-opened lag would reach an author with no disclosure at all').not.toBeNull();
    // Whole, as body text, not a title= attribute — and equal to the derivation,
    // so it is not a literal that happens to contain the right words.
    expect(textOf(expand(el))).toBe(presetLagDisclosure(THE_LAG_THAT_WAS));
    // Warning tone, so it is not mistaken for a footnote.
    expect((el as React.ReactElement<{ tone?: string }>).props.tone).toBe('warning');
  });

  it('and unstubbed — production, today — it is silent again', async () => {
    vi.resetModules();
    const fresh = await import('../PresetLagDisclosure');
    expect(fresh.PresetLagDisclosure()).toBeNull();
  });

  it('the derivation itself returns null on an empty list and a sentence otherwise', () => {
    expect(presetLagDisclosure([])).toBeNull();
    expect(presetLagDisclosure(['cycles'])).toMatch(/`cycles` is authored here/);
    expect(presetLagDisclosure(['cycles', 'variants'])).toMatch(/`cycles` and `variants` are authored here/);
  });
});

/**
 * ═══ NEITHER THE SENTENCE NOR ITS ABSENCE MAY OUTLIVE THE MEASUREMENT ═══
 *
 * The old shape of this block asked: while the premise is non-empty, does the
 * drift test still assert the measured lag equals it? The retired shape asks the
 * mirror question, and it is the one that matters more, because the state it
 * guards is silence. NOTHING ON SCREEN says "these keys are not consumed" any
 * more; the only reason that is honest is that a row in the drift test reads
 * aeon's refusal list at a committed revision every run and asserts the lag is
 * EMPTY. Delete THAT row and the retirement becomes a claim nobody checks —
 * exactly the O62/O64 defect, wearing the opposite costume. So this block goes
 * red if it disappears.
 *
 * Read on the drift test's SOURCE with comments stripped, so a mention in prose
 * cannot satisfy it.
 */
describe('the retirement cannot outlive its measurement either', () => {
  const src = stripComments(readFileSync(DRIFT_TEST_PATH, 'utf8'));

  it('the drift test no longer couples to the premise — one statement of the retirement, not two', () => {
    expect(PRESET_KEYS_AWAITING_AEON).toEqual([]);
    // A measuring row that still asserted `lag equals <the empty constant>`
    // would be the same check spelled through an indirection nobody can read.
    expect(src, 'the drift test still names the premise constant while that constant is empty — '
      + 'the lag row was left coupled to a list with nothing in it; assert the empty lag directly')
      .not.toMatch(/PRESET_KEYS_AWAITING_AEON/);
  });

  it('...but it STILL MEASURES the refusal list, at a committed revision, and asserts it EMPTY', () => {
    // Anti-vacuous: the file really is the drift test and really reads aeon.
    expect(src).toMatch(/peerRepo\('aeon'\)/);
    expect(src).toMatch(/readAtRev\(aeon, tip, PAGE\)/);
    expect(src).toMatch(/const TIP = 'origin\/master'/);

    // The measurement itself: aeon's own `preset-refused` row, minus the names
    // the schema still reserves, asserted EMPTY. The left side is READ, never a
    // second constant, so it cannot agree with itself.
    expect(
      src,
      'the drift test no longer computes the lag from aeon\'s preset-refused row and asserts it '
      + 'empty. Nothing now watches whether aeon still lowers cycles and variants: a revert of '
      + 'EFFECTS-W1 item 5 would leave Aurora authoring keys that reach the file and nothing '
      + 'further, with no sentence above the controls and no red row anywhere. Restore it.',
    ).toMatch(
      /const lag = keys\['preset-refused'\]\.filter\(\(k\) => !schemaReserved\.includes\(k\)\)\.sort\(\);\s*expect\(\s*lag,[\s\S]*?\)\.toEqual\(\[\]\);/,
    );
    // And the other side of the same coin: every optional key the schema
    // declares is one aeon's page says it ACCEPTS.
    expect(src).toMatch(/schemaOptional\.filter\(\(k\) => !keys\.preset\.includes\(k\)\)/);

    // The test file carries NO literal copy of the key names to drift from.
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
