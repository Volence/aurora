// THE NO-ROM DISCLOSURE above the preset's channel and anchor controls —
// RETIRED 2026-09-03, and this file is what stops either state from becoming an
// unmeasured claim.
//
// ROADMAP §5.1 row 97 (second half), the O62/O64 class: a control for a key the
// engine does not consume yet must say so on screen, and the saying must retire
// when it stops being true. The sentence is DERIVED from one constant
// (core/formats/effects/preset-lag.ts: PRESET_KEYS_AWAITING_AEON); the drift
// test MEASURES that constant's subject against aeon at origin/master.
//
// ═══ THIS FILE HAS NOW BEEN RE-AIMED THREE TIMES, AND THAT IS THE POINT ═══
//
// armed (`['cycles','variants']`) → retired 2026-09-02 (aeon merged item 5) →
// armed again 2026-09-03 (empyrean d36d704 declared item 4's `patch_world_ys` /
// `patch_motion` and aeon's step 4 had not run) → RETIRED again, later the same
// day, when step 4 ran. Measured firsthand at aeon `origin/master` `b7f4bdeb`,
// page blob `22a42064`: `PRESET_KEYS` (`tools/effects_gen.py:285-286`) carries
// both names, `_check_patch_world_ys` / `_check_patch_motion` shape-check them,
// `render_patch_motion` and the `fn_sec_patch_*` emitters lower them, and the
// page's machine-checked block lists both under `preset:`.
//
// A FILE WHOSE EVERY ROW SAID "the sentence is on screen" WOULD NOW EITHER BE
// DELETED OR QUIETLY INVERTED INTO ASSERTIONS OF `null`, which is the failure
// mode this repo cares most about: a suite that still passes while asserting
// nothing about a retired feature. So the rows are RE-AIMED, not removed, and
// they keep the shape both states need:
//
//   1. THE RETIREMENT IS ASSERTED, not assumed — the premise is empty, and the
//      leaf really returns null BECAUSE of that and not for some other reason.
//   2. THE WORDING IS STILL FULLY ASSERTED, by driving the derivation with an
//      EXPLICIT list: the retired premise's own value, replayed, and checked
//      against the schema so the replay is real vocabulary rather than fiction.
//      If a lag re-opens, the sentence that comes back is still the right one.
//   3. THE POISON IS THE LOAD-BEARING DIRECTION FOR THIS STATE: stub the
//      constant back to NON-empty and the leaf must render the WHOLE sentence.
//      A leaf hard-wired to `return null` would pass rows 1 and 2 and fail here.
//   4. THE RETIREMENT IS STILL MEASURED: the drift test must still read aeon's
//      page at a committed revision, compute the WIDE lag, and assert it EMPTY.
//      Delete that row — or narrow the measurement — and this file goes red.
//
// ⚠ THE REPLAYED LAG IS THE SHARPER FLAVOUR, AND THE ROWS KEEP ITS WORDING.
// `cycles`/`variants` were in aeon's `preset-refused` list — declined BY NAME,
// so a document carrying one lowered WITHOUT it. `patch_world_ys` /
// `patch_motion` were not in aeon's vocabulary at all, so `_check_keys` took the
// unknown-key path and `_refuse` RAISED: a preset carrying either FAILED AEON'S
// BUILD OUTRIGHT. The rows below assert the sentence still says that, because
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

describe('the premise has RETIRED — and the retirement is asserted, not assumed', () => {
  it('the premise is EMPTY, and the keys it held are optional root keys the schema declares', () => {
    expect(
      PRESET_KEYS_AWAITING_AEON,
      'PRESET_KEYS_AWAITING_AEON is NOT empty — a lag has re-opened. That is not a failure of '
      + 'this row: re-aim this file at the sentence being ON screen (git log it for the shape it '
      + 'had on 2026-09-03), and see the drift test\'s lag row, which measures it.',
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
 * THE POISON, RE-INVERTED WITH THE PREMISE — FOR THE SECOND TIME.
 *
 * It stubbed the constant EMPTY and required silence while the sentence was on
 * screen; that was the right direction then. With the premise retired the empty
 * stub IS the production state, so it would prove nothing: a leaf hard-wired to
 * `return null` would sail through it. The load-bearing direction now is the
 * other one. Stub the constant back to NON-empty — the exact shape of a
 * re-opened lag — and the leaf must produce the WHOLE sentence again.
 *
 * It stubs the DERIVED FACT, not the sentence: a leaf that rendered a literal
 * regardless of the constant would pass a text check and fail the
 * `toBe(presetLagDisclosure(...))` below.
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
      + 're-opened lag would reach an author with no disclosure at all, above controls whose '
      + 'output fails aeon\'s build').not.toBeNull();
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
 * The armed shape of this block asked: while the premise is non-empty, does the
 * drift test still assert the measured lag equals it? The retired shape asks the
 * mirror question, and it is the one that matters more, because the state it
 * guards is SILENCE. Nothing on screen says "these keys are not consumed" any
 * more; the only reason that is honest is that a row in the drift test reads
 * aeon's page at a committed revision every run and asserts the lag is EMPTY.
 * Delete THAT row — or narrow what it measures — and the retirement becomes a
 * claim nobody checks: exactly the O62/O64 defect, wearing the opposite costume.
 * So this block goes red if either happens.
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

  it('...but it STILL MEASURES the WIDE lag, at a committed revision, and asserts it EMPTY', () => {
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
    // agree with itself; the right side is the empty set, so the row carries no
    // key name at all.
    expect(
      src,
      'the drift test no longer computes the lag as "every schema-declared root key aeon does not '
      + 'ACCEPT" and asserts it EMPTY. Nothing now watches whether the retirement is still true: '
      + 'aeon un-building one of these keys would leave Aurora authoring a key that reaches the '
      + 'file and nothing further — with no sentence above the controls and no red row anywhere — '
      + 'and a contract that declared a new key aeon has not built would be equally invisible. If '
      + 'the row is still there but the LEFT SIDE has been narrowed back to preset-refused, that '
      + 'is the 2026-09-03 hole being reintroduced. Restore it.',
    ).toMatch(
      /const lag = schemaOptional\.filter\(\(k\) => !keys\.preset\.includes\(k\)\)\.sort\(\);\s*expect\(\s*lag,[\s\S]*?\)\.toEqual\(\[\]\);/,
    );
    // And the other side of the same coin, so the row cannot pass on a page that
    // simply stopped listing what it refuses.
    expect(src).toMatch(/keys\['preset-refused'\]\.filter\(\(k\) => !schemaReserved\.includes\(k\)\)/);

    // The drift test carries NO literal copy of any lagging key name to drift
    // from — neither the pair that retired today nor the pair that retired on
    // 2026-09-02.
    for (const k of [...THE_LAG_THAT_WAS, 'cycles', 'variants']) {
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

  it('⚠ THE SENTENCE IS RETIRED FOR THIS SECTION\'S KEYS — and the sentence it WOULD say survives', () => {
    // The two keys this section authors, named here because the section's own
    // controls are what makes them load-bearing — not as a copy of the premise.
    const authored: readonly string[] = ['patch_world_ys', 'patch_motion'];

    // 1. THE RETIREMENT, for exactly these keys: the live premise names neither,
    //    so the leaf above the anchor controls is silent.
    for (const k of authored) {
      expect(
        PRESET_KEYS_AWAITING_AEON,
        `${k} is back in the premise — a lag has re-opened on a key THIS section authors. `
        + 'Re-aim this row at the sentence being on screen (git log it for the shape it had on '
        + '2026-09-03) rather than relaxing it.',
      ).not.toContain(k);
    }
    expect(presetLagDisclosure(PRESET_KEYS_AWAITING_AEON)).toBeNull();

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
