// THE NO-ROM DISCLOSURE above the preset's channel controls — RE-ARMED
// 2026-09-03, and this file is what stops either state from becoming an
// unmeasured claim.
//
// ROADMAP §5.1 row 97 (second half), the O62/O64 class: a control for a key the
// engine does not consume yet must say so on screen, and the saying must retire
// when it stops being true. The sentence is DERIVED from one constant
// (core/formats/effects/preset-lag.ts: PRESET_KEYS_AWAITING_AEON); the drift
// test MEASURES that constant's subject against aeon at origin/master.
//
// ═══ THE PREMISE HAS BEEN BOTH THINGS, AND THIS FILE HAS BEEN RE-AIMED TWICE ═══
//
// It was `['cycles','variants']`; aeon merged EFFECTS-W1 item 5 and it went
// EMPTY on 2026-09-02, and these rows were re-aimed at asserting the SILENCE was
// measured. On 2026-09-03 empyrean d36d704 declared `patch_world_ys` and
// `patch_motion` (item 4's authoring key, §7.3), Aurora vendored them as step 3
// of a four-step chain, and aeon's generator — step 4 — reads neither. So a lag
// is open again and the sentence is back on screen. The rows are re-aimed, not
// rewritten from scratch, and they keep the shape both states need:
//
//   1. THE PREMISE IS ASSERTED AGAINST THE SCHEMA, not just non-empty: every
//      name in it must be an OPTIONAL root key the schema declares. A premise
//      naming something the contract never opened would disclose fiction.
//   2. THE WORDING IS FULLY ASSERTED, driven by the REAL premise — and the
//      empty case is still asserted too, by driving the same derivation with
//      `[]`, so the retirement path cannot rot while it is unused.
//   3. THE POISON IS THE LOAD-BEARING DIRECTION FOR THIS STATE: stub the
//      constant EMPTY and the leaf must fall silent. That proves the gate is a
//      gate — a leaf that hard-wired the sentence would pass rows 1 and 2 and
//      fail here.
//   4. THE SENTENCE CANNOT OUTLIVE ITS MEASUREMENT: the drift test must still
//      read aeon's page at a committed revision and assert the measured lag
//      EQUALS this premise. Delete that row and this file goes red.
//
// ⚠ THE LAG'S FLAVOUR CHANGED, AND IT IS SHARPER NOW. `cycles`/`variants` were
// in aeon's `preset-refused` list — declined BY NAME. These two are not in
// aeon's vocabulary at all, so `_check_keys` takes the unknown-key path and
// `_refuse` RAISES: a preset carrying either key fails aeon's build outright,
// rather than lowering without them. The sentence says so.
//
// ⚠ NOTHING HERE SAYS A ROM OBEYS ANY OF THESE KEYS. No emulator, no build.
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
 * THE PREMISE THE ROWS BELOW DRIVE THE DERIVATION WITH: the LIVE one. Not an
 * invented fixture and not a replay — while a lag is open, the wording that
 * matters is the wording an author is reading right now, and the row above
 * checks every name in it is an optional root key the schema really declares,
 * so it cannot be fiction.
 */
const THE_LAG: readonly string[] = PRESET_KEYS_AWAITING_AEON;

describe('the premise is RE-ARMED — and it is checked against the schema, not just non-empty', () => {
  it('the premise names optional root keys the schema declares, and is not empty', () => {
    expect(
      PRESET_KEYS_AWAITING_AEON,
      'PRESET_KEYS_AWAITING_AEON is EMPTY — the lag has closed. That is not a failure of this '
      + 'row: re-aim this file at the SILENCE being measured (git log it for the shape it had '
      + 'from 2026-09-02 to 2026-09-03), and see the drift test\'s lag row, which measures it.',
    ).not.toEqual([]);
    // Anti-vacuous for the wording rows: the premise is real vocabulary — root
    // keys of the schema, and OPTIONAL ones, because a required key could never
    // be "not consumed".
    for (const k of THE_LAG) {
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
      expect(EFFECTS_PRESET_SCHEMA.required as string[]).not.toContain(k);
    }
  });

  it('so there IS a sentence and an element — and the empty case still returns null', () => {
    expect(presetLagDisclosure()).not.toBeNull();
    expect(PresetLagDisclosure()).not.toBeNull();
    // ...and it is the PREMISE that speaks, not something else: the same
    // derivation with an empty list is silent, so the retirement path is still
    // asserted while it is unused.
    expect(presetLagDisclosure([])).toBeNull();
  });
});

describe('the wording, driven by the live premise — what an author is reading now', () => {
  it('says the three things, in one sentence, with a date and where to re-measure', () => {
    const s = presetLagDisclosure(THE_LAG)!;
    expect(s).not.toBeNull();
    expect(s.startsWith(PRESET_LAG_LEAD)).toBe(true);
    // 1. authored here  2. saved to the file  3. not consumed by the engine.
    expect(s).toMatch(/authored here/);
    expect(s).toMatch(/saved to this preset file/);
    expect(s).toMatch(/Not consumed by the engine yet/);
    expect(s).toMatch(/does not accept (?:it|them) at origin\/master/);
    // The sharper half, and the reason the 2026-09-02 wording would not do: a
    // document carrying one of these does not lower without it, it FAILS the
    // build. `_check_keys` takes the unknown-key path and `_refuse` raises.
    expect(s).toMatch(/refuses the WHOLE DOCUMENT/);
    expect(s).toMatch(/will not build/);
    expect(s).toMatch(/nothing set below reaches a ROM/);
    expect(s).toMatch(/no emulator has shown/);
    // Every awaited key is named, verbatim.
    for (const k of THE_LAG) expect(s).toContain(`\`${k}\``);
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
 * THE POISON, RE-INVERTED WITH THE PREMISE.
 *
 * With a lag OPEN, the load-bearing direction is the one that proves the leaf
 * can go quiet: stub the constant EMPTY and the leaf must render nothing. A leaf
 * that hard-wired the sentence would pass every row above and fail here — and
 * that is the failure that outlives its defect, a warning still on screen after
 * it stops being true, which teaches an author to ignore the panel.
 *
 * The rendering direction is asserted in the same block, unstubbed, against the
 * DERIVATION rather than a text match, so a leaf that rendered its own literal
 * would fail the `toBe(presetLagDisclosure(...))`.
 */
describe('the render gate — POISON: the premise stubbed EMPTY', () => {
  afterEach(() => {
    vi.doUnmock(LAG_MODULE);
    vi.resetModules();
  });

  it('with PRESET_KEYS_AWAITING_AEON emptied, the leaf renders NOTHING', async () => {
    vi.resetModules();
    vi.doMock(LAG_MODULE, async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../../core/formats/effects/preset-lag')>();
      return { ...real, PRESET_KEYS_AWAITING_AEON: Object.freeze([]) };
    });
    const poisoned = await import('../PresetLagDisclosure');
    // The stub took: the module the leaf sees has the emptied list.
    const lag = await import(LAG_MODULE);
    expect(lag.PRESET_KEYS_AWAITING_AEON).toEqual([]);

    expect(
      poisoned.PresetLagDisclosure(),
      'the leaf still renders on an EMPTY premise — the sentence is hard-wired, and it would '
      + 'stay on screen after aeon builds these keys',
    ).toBeNull();
  });

  it('and unstubbed — production, today — it renders the WHOLE sentence as body text', async () => {
    vi.resetModules();
    const fresh = await import('../PresetLagDisclosure');
    const el = fresh.PresetLagDisclosure();
    expect(el, 'the leaf renders nothing on a NON-empty premise — the gate is stuck shut, and an '
      + 'author would reach these controls with no disclosure at all').not.toBeNull();
    // Whole, as body text, not a title= attribute — and equal to the derivation,
    // so it is not a literal that happens to contain the right words.
    expect(textOf(expand(el))).toBe(presetLagDisclosure(THE_LAG));
    // Warning tone, so it is not mistaken for a footnote.
    expect((el as React.ReactElement<{ tone?: string }>).props.tone).toBe('warning');
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
 * While the premise is non-empty, this block asks: does the drift test still
 * MEASURE it against aeon at a committed revision, and assert the measured lag
 * equals it exactly? Delete that row and the sentence becomes a claim nobody
 * checks — it would sit above the controls forever, including after aeon builds
 * the keys, which is the O62/O64 defect this whole pair exists to prevent.
 *
 * Read on the drift test's SOURCE with comments stripped, so a mention in prose
 * cannot satisfy it.
 */
describe('the sentence cannot outlive its measurement', () => {
  const src = stripComments(readFileSync(DRIFT_TEST_PATH, 'utf8'));

  it('the drift test COUPLES to the premise — one statement of the lag, measured, not two', () => {
    expect(PRESET_KEYS_AWAITING_AEON).not.toEqual([]);
    expect(src, 'the drift test does not name the premise constant while a lag is open — the '
      + 'sentence on screen and the row that measures it have come apart')
      .toMatch(/PRESET_KEYS_AWAITING_AEON/);
  });

  it('...and it MEASURES the lag at a committed revision, asserting it EQUALS the premise', () => {
    // Anti-vacuous: the file really is the drift test and really reads aeon.
    expect(src).toMatch(/peerRepo\('aeon'\)/);
    expect(src).toMatch(/readAtRev\(aeon, tip, PAGE\)/);
    expect(src).toMatch(/const TIP = 'origin\/master'/);

    // The measurement itself: every root key the schema declares that aeon's
    // page does not ACCEPT, compared to the premise. The left side is READ from
    // aeon, never a second constant, so it cannot agree with itself.
    //
    // WHY NOT THE OLD `preset-refused` FILTER. That saw only the keys aeon
    // declines BY NAME and was blind to a key aeon's page does not mention at
    // all — the flavour d36d704 produced, which it stayed GREEN through. This
    // row pins the WIDER measurement so the hole cannot be reintroduced.
    expect(
      src,
      'the drift test no longer computes the lag as the schema-declared keys aeon does not '
      + 'accept, and assert it equals PRESET_KEYS_AWAITING_AEON. Nothing now watches whether the '
      + 'sentence on screen is still true: aeon building these keys would leave a warning above '
      + 'the controls that is simply wrong, and aeon un-building one would leave a key authored '
      + 'with no warning at all. Restore it.',
    ).toMatch(
      /const lag = schemaOptional\.filter\(\(k\) => !keys\.preset\.includes\(k\)\)\.sort\(\);\s*expect\(\s*lag,[\s\S]*?\)\.toEqual\(\[\.\.\.PRESET_KEYS_AWAITING_AEON\]\.sort\(\)\);/,
    );
    // And the other side of the same coin: every name aeon REFUSES is one the
    // schema reserves or one the premise declares as a lag.
    expect(src).toMatch(/keys\['preset-refused'\]\.filter\(/);

    // The test file carries NO literal copy of the key names to drift from.
    for (const k of PRESET_KEYS_AWAITING_AEON) {
      expect(src, `the drift test hardcodes "${k}" — the premise is the only place it may live`)
        .not.toContain(`'${k}'`);
    }
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

// ═══════════════════════════════════════════════════════════════════════════
// AND THE SAME, FIRST, IN THE MOVING-ANCHOR SECTION (ROADMAP row 95)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ THE DISCLOSURE MATTERS MORE HERE THAN ANYWHERE ELSE IN THIS PANEL, and that
// is measured rather than felt: `PRESET_KEYS_AWAITING_AEON` currently names
// `patch_motion` and `patch_world_ys` — the two keys this section authors — and
// the sentence it produces says the generator "refuses the WHOLE DOCUMENT, so a
// preset carrying either key will not build". An author who cannot see that
// sentence authors a preset that breaks aeon's build with no warning at all.
//
// A `CollapsibleSection` renders NO children while shut, so the leaf has to be
// first and unconditional in the body for the same reason it is in the channels
// section: anything before it is something an author could scroll past.
describe('the panel mounts the leaf first in the ANCHORS section too, unconditionally', () => {
  const code = stripComments(readFileSync(PANEL_PATH, 'utf8'));

  it('the anchors section exists and its body opens with the disclosure', () => {
    const section = code.indexOf('id="aeon.effects.preset.anchors"');
    expect(section, 'no anchors section in the panel').toBeGreaterThan(0);
    const body = code.indexOf('<SectionBody>', section);
    const leaf = code.indexOf('<PresetLagDisclosure', section);
    expect(body).toBeGreaterThan(section);
    expect(leaf).toBeGreaterThan(body);
    const between = code.slice(body + '<SectionBody>'.length, leaf);
    expect(between.trim(),
      `something sits between <SectionBody> and <PresetLagDisclosure>: ${between.trim()}`).toBe('');
    // The controls come AFTER it, in the same body.
    expect(code.indexOf('<AnchorChannelsBlock', leaf)).toBeGreaterThan(leaf);
  });

  it('⚠ THE SENTENCE ON SCREEN NAMES THE KEYS THIS SECTION AUTHORS, today', () => {
    // Not a hardcoded pair: the premise is read, and the row states the two
    // opposite readings so neither can pass silently.
    const authored = ['patch_world_ys', 'patch_motion'];
    const named = authored.filter((k) => PRESET_KEYS_AWAITING_AEON.includes(k));
    if (named.length === 0) {
      // aeon has landed step 4 — the disclosure retires and this section's
      // controls become the ones whose output actually builds. Nothing to
      // assert about the sentence; the row says so rather than passing mutely.
      expect(presetLagDisclosure(PRESET_KEYS_AWAITING_AEON)).not.toContain('patch_world_ys');
      return;
    }
    const sentence = presetLagDisclosure(PRESET_KEYS_AWAITING_AEON)!;
    expect(sentence).not.toBeNull();
    for (const k of named) expect(sentence).toContain(k);
    // and it says what "not consumed yet" COSTS, which for these two keys is a
    // failed build rather than a silently-dropped field.
    expect(sentence).toMatch(/will not build|refuses the WHOLE DOCUMENT/);
  });

  it('the anchor controls read the provider and spell no rule of their own', () => {
    for (const name of [
      'ANCHOR_SEED_OPTIONS.map', 'ANCHOR_MOTION_OPTIONS.map',
      'ANCHOR_AMP_OPTIONS.map', 'ANCHOR_PERIOD_OPTIONS.map',
      'anchorChannelIndices(', 'anchorSeedState(', 'anchorMotionState(',
      'anchorSeedRefusal', 'anchorPhaseRefusal', 'anchorExtendRefusal(',
      'anchorMotionWithoutSeedAdvisory(',
      'setAnchorSeedStateCommand(', 'setAnchorSeedCommand(', 'setAnchorMotionStateCommand(',
      'setAnchorSweepShiftCommand(', 'setAnchorPhaseCommand(',
    ]) {
      expect(code, name).toContain(name);
    }
    // ⚠ NO LADDER, NO BOUND AND NO SCALE MAY BE SPELLED IN THE COMPONENT. A
    // literal shift, a `* 256`, or a comparison against a rung here would be a
    // second opinion about a base-2 logarithm — the one thing on this path that
    // fails silently.
    expect(code).not.toMatch(/amp_shift\s*[:=]\s*\d/);
    expect(code).not.toMatch(/period_shift\s*[:=]\s*\d/);
    expect(code).not.toMatch(/\*\s*256|\/\s*256/);
    expect(code).not.toMatch(/patch_world_ys\s*=|patch_motion\s*=/);
    // Titles are the schema's, through the provider.
    expect(code).toMatch(/title=\{ANCHOR_SEED_TITLE\}/);
    expect(code).toMatch(/title=\{ANCHOR_MOTION_TITLE\}/);
    expect(code).toMatch(/anchorSweepFieldTitle\('amp_shift'\)/);
  });
});
