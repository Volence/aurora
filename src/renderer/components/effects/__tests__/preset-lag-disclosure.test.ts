// THE NO-ROM DISCLOSURE above the preset's channel and anchor controls —
// ARMED 2026-09-03 for `ramp`, and this file is what stops either state from
// becoming an unmeasured claim.
//
// ROADMAP §5.1 row 97 (second half), the O62/O64 class: a control for a key the
// engine does not consume yet must say so on screen, and the saying must retire
// when it stops being true. The sentence is DERIVED from one constant
// (core/formats/effects/preset-lag.ts: PRESET_KEYS_AWAITING_AEON); the drift
// test MEASURES that constant's subject against aeon at origin/master.
//
// ═══ THIS FILE HAS NOW BEEN RE-AIMED FOUR TIMES, AND THAT IS THE POINT ═══
//
// armed (`['cycles','variants']`) → retired 2026-09-02 (aeon merged item 5) →
// armed again 2026-09-03 (empyrean d36d704 declared item 4's `patch_world_ys` /
// `patch_motion` and aeon's step 4 had not run) → retired again, later the same
// day, when step 4 ran → ARMED AGAIN, 2026-09-03, for `ramp`: empyrean `9233883`
// declared item 6's authoring key (§7.4) and aeon's step 4 has not run.
//
// Measured firsthand at aeon `origin/master` `dd17f7c9`, page blob `62ca6426`:
// the machine-checked block's `preset:` row is
// `bands, cycles, id, patch_motion, patch_world_ys, schema, variants` — no
// `ramp` — `preset-refused:` is `fires` alone, and `tools/effects_gen.py`
// contains the string `ramp` ZERO TIMES in any case.
//
// A FILE WHOSE EVERY ROW SAID "the sentence is retired" WOULD NOW EITHER BE
// DELETED OR QUIETLY INVERTED, which is the failure mode this repo cares most
// about: a suite that still passes while asserting nothing. So the rows are
// RE-AIMED, not removed, and they keep the shape both states need:
//
//   1. THE ARMING IS ASSERTED, not assumed — the premise names exactly the
//      lagging key, that key is a real OPTIONAL root key of the schema, and the
//      leaf really renders BECAUSE of the premise and not for some other reason.
//   2. THE WORDING IS FULLY ASSERTED against the LIVE premise, which is what an
//      author actually sees today. The historical replay stays beside it so the
//      sharper flavour's wording keeps its own coverage.
//   3. THE POISON IS THE LOAD-BEARING DIRECTION FOR THIS STATE, and it INVERTS
//      with the premise: stub the constant EMPTY and the leaf must fall SILENT.
//      A leaf hard-wired to render a literal would pass rows 1 and 2 and fail
//      here — and it is the direction that proves the sentence will actually
//      retire on the day aeon ships, rather than becoming a permanent fixture.
//   4. THE ARMING IS STILL MEASURED: the drift test must read aeon's page at a
//      committed revision, compute the WIDE lag, and assert it EQUALS the
//      premise. Delete that row — or narrow the measurement — and this file
//      goes red.
//
// ⚠ THE LIVE LAG IS THE SHARPER FLAVOUR, AND THE ROWS KEEP ITS WORDING.
// `cycles`/`variants` were in aeon's `preset-refused` list — declined BY NAME,
// so a document carrying one lowered WITHOUT it. `patch_world_ys` /
// `patch_motion` were not in aeon's vocabulary at all, so `_check_keys` took the
// unknown-key path and `_refuse` RAISED: a preset carrying either FAILED AEON'S
// BUILD OUTRIGHT. `ramp` IS THAT SAME FLAVOUR TODAY, measured above. The rows
// below assert the sentence still says that, because
// softening it to the 12aecd5 wording would understate a re-opened lag of this
// flavour — and nothing on screen would be there to notice.
//
// ⚠ MERGED, NOT CERTIFIED. NOTHING HERE SAYS A ROM OBEYS ANY OF THESE KEYS. No
// emulator, no build. What retired is a claim about aeon's GENERATOR.
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
 * exactly what `PRESET_KEYS_AWAITING_AEON` held on 2026-09-03 between the
 * d36d704 re-vendor and aeon's step 4, and the row below checks both names are
 * still OPTIONAL root keys of the schema, so the replay is against the real
 * vocabulary rather than fiction. Driving the derivation with it keeps the
 * WORDING asserted with the premise empty — a re-opened lag gets the same
 * sentence it would have got, including the sharper half that this pair of keys
 * is the reason for.
 *
 * ⚠ IT IS DELIBERATELY THIS PAIR AND NOT `['cycles','variants']`. Their lag was
 * the softer flavour, and the wording rows below (`refuses the WHOLE DOCUMENT`,
 * `will not build`) are the sentence THESE two earned.
 */
const THE_LAG_THAT_WAS: readonly string[] = Object.freeze(['patch_motion', 'patch_world_ys']);

/**
 * THE LIVE PREMISE, sorted — what an author sees on screen TODAY. Read from the
 * constant, never restated, so this file cannot agree with itself about which
 * key is lagging.
 */
const LIVE = [...PRESET_KEYS_AWAITING_AEON].sort();

describe('the premise is ARMED — and the arming is asserted, not assumed', () => {
  it('the premise is NON-EMPTY, and every key in it is an optional root key the schema declares', () => {
    expect(
      PRESET_KEYS_AWAITING_AEON,
      'PRESET_KEYS_AWAITING_AEON is EMPTY — the lag has closed. That is not a failure of this '
      + 'row: re-aim this file at the sentence being OFF screen (this file records the shape it '
      + 'had while retired), and see the drift test\'s lag row, which measures it.',
    ).not.toEqual([]);
    // Anti-vacuous: the premise is real vocabulary — root keys of the schema,
    // and OPTIONAL ones, because a REQUIRED key could never be "not consumed"
    // (every document would carry it, and none would build).
    for (const k of LIVE) {
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
      expect(EFFECTS_PRESET_SCHEMA.required as string[]).not.toContain(k);
    }
    // ...and the replay used by the wording rows below is real vocabulary too.
    expect(THE_LAG_THAT_WAS.length).toBeGreaterThan(0);
    for (const k of THE_LAG_THAT_WAS) {
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
    }
  });

  it('so there IS a sentence, and the leaf renders it — both driven by the premise', () => {
    const live = presetLagDisclosure();
    expect(live).not.toBeNull();
    // The leaf says exactly what the derivation says — not a literal that
    // happens to contain the right words.
    expect(textOf(expand(PresetLagDisclosure()))).toBe(live);
    // ...and every lagging key is named in it, verbatim.
    for (const k of LIVE) expect(live!).toContain(`\`${k}\``);
    // ...and it is the PREMISE that speaks, not something else: the same
    // derivation with an empty list is silent.
    expect(presetLagDisclosure([])).toBeNull();
  });

  it('the LIVE sentence says the sharper flavour — this lag fails the build outright', () => {
    // Measured in the header: `ramp` is in NEITHER of aeon's lists, so
    // `_check_keys` takes the unknown-key path and `_refuse` raises. Softening
    // this wording to the 12aecd5 "lowers without it" flavour would understate
    // what an author is risking, and nothing on screen would be there to notice.
    const s = presetLagDisclosure()!;
    expect(s).toMatch(/refuses the WHOLE DOCUMENT/);
    expect(s).toMatch(/will not build/);
    expect(s).toMatch(/nothing set below reaches a ROM/);
  });
});

describe('the wording, driven with an explicit replay — what a re-opened lag would say', () => {
  it('says the three things, in one sentence, with a date and where to re-measure', () => {
    const s = presetLagDisclosure(THE_LAG_THAT_WAS)!;
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
 * THE POISON, RE-INVERTED WITH THE PREMISE — FOR THE THIRD TIME.
 *
 * It stubbed the constant NON-empty and required the whole sentence while the
 * premise was retired; that was the right direction then. With the premise ARMED
 * the non-empty stub IS the production state, so it would prove nothing: a leaf
 * hard-wired to render a literal would sail through it. The load-bearing
 * direction now is the other one. Stub the constant EMPTY — the exact shape of
 * the day aeon ships the key — and the leaf must fall SILENT.
 *
 * THIS IS THE DIRECTION THAT PROVES THE SENTENCE CAN RETIRE AT ALL. A
 * disclosure that cannot be switched off is the O62/O64 defect in waiting: it
 * stays on screen after it stops being true, teaching the author to ignore the
 * panel's warnings.
 *
 * It stubs the DERIVED FACT, not the sentence: a leaf that rendered a literal
 * regardless of the constant would fail the silence check here and the
 * `toBe(presetLagDisclosure(...))` below.
 */
describe('the render gate — POISON: the premise stubbed back to EMPTY', () => {
  afterEach(() => {
    vi.doUnmock(LAG_MODULE);
    vi.resetModules();
  });

  it('with PRESET_KEYS_AWAITING_AEON emptied, the leaf falls SILENT', async () => {
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
      'the leaf still renders on an EMPTY premise — the gate is stuck OPEN, so this disclosure '
      + 'cannot retire. It would stay above the controls after aeon ships the key, which is the '
      + 'O62/O64 defect: a warning that outlives its reason teaches the author to ignore every '
      + 'warning the panel gives.',
    ).toBeNull();
  });

  it('and unstubbed — production, today — it SPEAKS, whole, as body text, in warning tone', async () => {
    vi.resetModules();
    const fresh = await import('../PresetLagDisclosure');
    const el = fresh.PresetLagDisclosure();
    expect(el, 'the leaf renders nothing on a NON-empty premise — an open lag is reaching an '
      + 'author with no disclosure at all, above controls whose output fails the build')
      .not.toBeNull();
    // Whole, as body text, not a title= attribute — and equal to the derivation,
    // so it is not a literal that happens to contain the right words.
    expect(textOf(expand(el))).toBe(presetLagDisclosure(PRESET_KEYS_AWAITING_AEON));
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
 * The retired shape of this block asked: with nothing on screen, does the drift
 * test still read aeon's page and assert the lag is EMPTY? The ARMED shape asks
 * the mirror question. There IS a sentence on screen now, and it names a key and
 * tells an author their document will not build — so the thing that must not rot
 * is the PREMISE. It is hand-typed, it is the only statement of the fact, and
 * the only reason it is honest is that a row in the drift test reads aeon's page
 * at a committed revision every run and asserts the measured lag EQUALS it.
 * Delete THAT row — or narrow what it measures — and the sentence becomes a
 * claim nobody checks: exactly the O62/O64 defect. So this block goes red if
 * either happens.
 *
 * Read on the drift test's SOURCE with comments stripped, so a mention in prose
 * cannot satisfy it.
 */
describe('the retirement cannot outlive its measurement either', () => {
  const src = stripComments(readFileSync(DRIFT_TEST_PATH, 'utf8'));

  it('the drift test COUPLES to the premise — the hand-typed list is measured, not trusted', () => {
    expect(PRESET_KEYS_AWAITING_AEON).not.toEqual([]);
    // ⚠ THE COUPLING RULE INVERTS WITH THE PREMISE, and both directions are
    // right in their own state. While the list is EMPTY, a row asserting
    // `lag equals <the empty constant>` is one claim spelled through an
    // indirection nobody can read, so the drift test must NOT name it. While the
    // list is NON-EMPTY it is a hand-typed premise a panel renders a warning
    // from, and the only thing that can keep it honest is a row comparing it to
    // aeon's page at TIP — so the drift test MUST name it.
    expect(src, 'the drift test no longer names the premise constant while that constant is '
      + 'NON-empty — the sentence above the controls is now a hand-typed claim with nothing '
      + 'measuring it')
      .toMatch(/PRESET_KEYS_AWAITING_AEON/);
  });

  it('...and it STILL MEASURES the WIDE lag, at a committed revision, against the premise', () => {
    // Anti-vacuous: the file really is the drift test and really reads aeon.
    expect(src).toMatch(/peerRepo\('aeon'\)/);
    expect(src).toMatch(/readAtRev\(aeon, tip, PAGE\)/);
    expect(src).toMatch(/const TIP = 'origin\/master'/);

    // ═══ THE MEASUREMENT MUST STAY WIDE ═══
    //
    // `schemaOptional minus keys.preset` — every root key the schema DECLARES
    // that aeon's page does not ACCEPT. The narrow predecessor
    // (`keys['preset-refused'] minus the reserved names`) saw only the keys aeon
    // declines BY NAME and was blind to a key aeon's page does not mention at
    // all; that is the flavour empyrean d36d704 produced and it stayed GREEN
    // through it. Narrowing it back is how this apparatus goes green while
    // blind, so the SHAPE is pinned here and not only the assertion.
    //
    // The left side is READ from aeon, never a second constant, so it cannot
    // agree with itself; the right side is the premise, reached through the
    // import, so the row still carries no key name of its own.
    expect(
      src,
      'the drift test no longer computes the lag as "every schema-declared root key aeon does not '
      + 'ACCEPT" and compares it to the premise. Nothing now watches whether the sentence on '
      + 'screen is still true: aeon shipping the key would leave a warning above the controls '
      + 'saying a document will not build when it now does — and a contract that declared a '
      + 'FURTHER key aeon has not built would reach an author with no disclosure at all. If the '
      + 'row is still there but the LEFT SIDE has been narrowed back to preset-refused, that is '
      + 'the 2026-09-03 hole being reintroduced. Restore it.',
    ).toMatch(
      /const lag = schemaOptional\.filter\(\(k\) => !keys\.preset\.includes\(k\)\)\.sort\(\);[\s\S]*?expect\(\s*lag,[\s\S]*?\)\.toEqual\(LAGGING\);/,
    );
    // And the other side of the same coin, so the row cannot pass on a page that
    // simply stopped listing what it refuses.
    expect(src).toMatch(/keys\['preset-refused'\]\.filter\(\(k\) => !schemaReserved\.includes\(k\)\)/);

    // The drift test carries NO literal copy of any lagging key name to drift
    // from — not the LIVE premise's, not the pair that retired earlier today,
    // and not the pair that retired on 2026-09-02. This is why the row asserting
    // the top-level `oneOf` over there names `bands` structurally and asserts
    // the other branch by shape rather than by name.
    for (const k of [...LIVE, ...THE_LAG_THAT_WAS, 'cycles', 'variants']) {
      expect(src, `the drift test hardcodes "${k}" — a key name may live in the premise list and `
        + 'nowhere else').not.toContain(`'${k}'`);
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
// ⚠ THE LEAF IS SILENT HERE TODAY, AND IT STAYS MOUNTED ANYWAY. A mounted leaf
// rendering `null` IS the retired state; an unmounted one is a re-arm that never
// reaches the screen. This section authors `patch_world_ys` and `patch_motion`,
// whose lag was the flavour that made a whole document un-generatable, so it is
// the mount site where a missing disclosure would cost the most — and the one
// most likely to be "tidied away" now that it shows nothing.
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

  it('⚠ THE SENTENCE IS RETIRED FOR THIS SECTION\'S OWN KEYS — and the one it WOULD say survives', () => {
    // The two keys this section authors, named here because the section's own
    // controls are what makes them load-bearing — not as a copy of the premise.
    const authored: readonly string[] = ['patch_world_ys', 'patch_motion'];

    // 1. THE RETIREMENT, for exactly these keys: the live premise names neither,
    //    so nothing the leaf says today is ABOUT this section's controls.
    //
    //    ⚠ THE LEAF IS NOT SILENT ANY MORE, and that is not a contradiction.
    //    It is mounted in BOTH sections and derived from ONE premise, so while
    //    any key lags it speaks in both places. What this row asserts is the
    //    narrower and more useful fact: this section's own two keys are not the
    //    reason. Asserting the leaf returns null here would couple an anchors
    //    row to an unrelated key's lag and go red every time one opens.
    for (const k of authored) {
      expect(
        PRESET_KEYS_AWAITING_AEON,
        `${k} is back in the premise — a lag has re-opened on a key THIS section authors. `
        + 'Re-aim this row at the sentence being about this section (this file records the shape '
        + 'it had while armed) rather than relaxing it.',
      ).not.toContain(k);
    }
    for (const k of authored) expect(presetLagDisclosure()).not.toContain(`\`${k}\``);

    // 2. AND THE WORDING THESE KEYS EARNED IS STILL ASSERTED, driven by the
    //    replay. If the lag re-opens on either one, an author gets a sentence
    //    that names it and says what it COSTS — which for this pair is a failed
    //    build, not a silently-dropped field. Deleting this half is how the
    //    retirement quietly takes the coverage with it.
    const wouldSay = presetLagDisclosure(authored)!;
    expect(wouldSay).not.toBeNull();
    for (const k of authored) expect(wouldSay).toContain(`\`${k}\``);
    expect(wouldSay).toMatch(/refuses the WHOLE DOCUMENT/);
    expect(wouldSay).toMatch(/will not build/);
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
