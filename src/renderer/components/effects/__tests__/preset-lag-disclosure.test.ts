// THE NO-ROM DISCLOSURE above the preset's channel and anchor controls —
// RETIRED (AGAIN) 2026-09-03 for `ramp`, and this file is what stops either
// state from becoming an unmeasured claim.
//
// ROADMAP §5.1 row 97 (second half), the O62/O64 class: a control for a key the
// engine does not consume yet must say so on screen, and the saying must retire
// when it stops being true. The sentence is DERIVED from one constant
// (core/formats/effects/preset-lag.ts: PRESET_KEYS_AWAITING_AEON); the drift
// test MEASURES that constant's subject against aeon at origin/master.
//
// ═══ THIS FILE HAS NOW BEEN RE-AIMED FIVE TIMES, AND THAT IS THE POINT ═══
//
// armed (`['cycles','variants']`) → retired 2026-09-02 (aeon merged item 5) →
// armed again 2026-09-03 (empyrean d36d704 declared item 4's `patch_world_ys` /
// `patch_motion` and aeon's step 4 had not run) → retired again, later the same
// day, when step 4 ran → armed again, 2026-09-03, for `ramp` (empyrean `9233883`
// declared item 6's authoring key, §7.4) → RETIRED AGAIN, later the same day
// again, when aeon merged item 6's step 4.
//
// Measured firsthand at aeon `origin/master` `c7ee7075` ("lane-log: the plane
// swap and the ramp generator both land"), page blob `55147199`: the
// machine-checked block's `preset:` row is
// `bands, cycles, id, patch_motion, patch_world_ys, ramp, schema, variants` —
// `ramp` IS THERE — and `preset-refused:` is `fires` alone.
//
// ⚠ THE ARTIFACT IS THE PAGE, NOT `tools/effects_gen.py`. The drift row consults
// `docs/EDITOR_RASTER_PRESETS.md`'s machine-checked block, which aeon's own test
// compares against the generator. Evidence about the generator SOURCE is
// evidence about a different artifact than the one measured here, and the two
// must not be traded for one another.
//
// A FILE WHOSE EVERY ROW SAID "the sentence is armed" WOULD NOW EITHER BE
// DELETED OR QUIETLY INVERTED, which is the failure mode this repo cares most
// about: a suite that still passes while asserting nothing. So the rows are
// RE-AIMED, not removed, and they keep the shape both states need:
//
//   1. THE RETIREMENT IS ASSERTED, not assumed — the premise is empty, the leaf
//      is silent, and it is the PREMISE that silenced it and not some other
//      reason (the same derivation with a non-empty list still speaks).
//   2. THE WORDING IS STILL FULLY ASSERTED, driven by EXPLICIT REPLAYS of the
//      premises that retired, each checked against the schema so the replay is
//      real vocabulary and not fiction. Both the singular and the plural branch
//      of the derivation keep their coverage.
//   3. THE POISON IS THE LOAD-BEARING DIRECTION FOR THIS STATE, and it INVERTS
//      with the premise: stub the constant back NON-EMPTY and the leaf must
//      speak the WHOLE sentence again, at both mount sites. A leaf hard-wired to
//      `return null` passes rows 1 and 2 and fails here. That is the direction
//      that proves a re-armed lag still reaches an author, instead of the
//      retirement quietly disabling the machinery for good.
//   4. THE RETIREMENT IS STILL MEASURED: the drift test must read aeon's page at
//      a committed revision, compute the WIDE lag, and assert it EMPTY. Delete
//      that row — or narrow the measurement — and this file goes red.
//
// ⚠ THE LAG THAT JUST RETIRED WAS THE SHARPER FLAVOUR, AND THE ROWS KEEP ITS
// WORDING. `cycles`/`variants` were in aeon's `preset-refused` list — declined
// BY NAME, so a document carrying one lowered WITHOUT it. `patch_world_ys` /
// `patch_motion` were not in aeon's vocabulary at all, so `_check_keys` took the
// unknown-key path and `_refuse` RAISED: a preset carrying either FAILED AEON'S
// BUILD OUTRIGHT. `ramp` was that same flavour. The replay rows below assert the
// sentence a re-opened lag would still say, because softening it to the 12aecd5
// wording would understate a re-opened lag of this flavour — and with nothing on
// screen there would be nothing to notice.
//
// ⚠ MERGED, NOT CERTIFIED. NOTHING HERE SAYS A ROM OBEYS `ramp` OR ANY OF THESE
// KEYS. No emulator, no build, no attest chain ran from this lane. What retired
// is a claim about what aeon's PAGE ACCEPTS. Certification is aeon's pytest lane
// and sigil's attest chain.
//
// ⚠ WAS A RELAY, IS NOW A READING (2026-09-03). The `-1.5` witness this header
// used to carry as hearsay has been read firsthand through git objects: aeon
// `origin/parcel/aurora-ramp-witness` `a1a76741` fixes the constructor's missing
// two's-complement encode (`7a5d237d`) and drives a running machine on THIS
// editor's own document. ⚠ THAT BRANCH IS NOT AN ANCESTOR OF AEON'S MASTER and
// the witness is emulation rather than silicon. (The one-line disagreement about
// the first-displayed-line rule that this header used to flag alongside those is
// SETTLED — empyrean `e9409dc`, in the measurement's favour; the contract says
// `top + 2` and Aurora derives it. Do not re-add it as a caveat. ⚠ AND "SETTLED"
// MEANS THE TWO READERS AGREE, NOT THAT HARDWARE ANSWERED — empyrean `bfc000e`,
// 2026-09-04: `top + 2` is as read on oracle's RUST core, the legacy C++ core
// reads both raster tiers one line earlier on the same bytes and is disqualified
// as a referee for being self-inconsistent across identical boots, the landing
// line is UNPINNED in the Rust core's own recon, and no hardware referee exists.
// The attribution is PARSED and PAINTED on the ramp readout, not left here.)
// None of that
// changes a single row in this file, which measures aeon's PAGE at
// `origin/master` and nothing else — it is written down so the next reader does
// not mistake the branch for the tip. The whole record is in
// `core/formats/effects/preset-lag.ts`.
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
 * THE PREMISE THAT JUST RETIRED, REPLAYED. Not an invented fixture: this is
 * exactly what `PRESET_KEYS_AWAITING_AEON` held on 2026-09-03 between the
 * 9233883 re-vendor and aeon's item-6 step 4, and the row below checks the name
 * is still an OPTIONAL root key of the schema, so the replay is against the real
 * vocabulary rather than fiction. Driving the derivation with it keeps the
 * WORDING asserted with the premise empty — a re-opened lag gets the same
 * sentence it would have got, including the sharper half this key is the reason
 * for.
 *
 * ⚠ IT IS DELIBERATELY THIS KEY AND NOT `['cycles','variants']`. Their lag was
 * the softer flavour — declined by name, so the document still lowered — and the
 * wording rows below (`refuses the WHOLE DOCUMENT`, `will not build`) are the
 * sentence the SHARPER flavour earned. `ramp` was the sharper flavour, so
 * replaying it keeps a future re-arm's wording from softening.
 *
 * It is also the SINGULAR branch of the derivation, which is why the pair below
 * stays beside it.
 */
const THE_LAG_THAT_WAS: readonly string[] = Object.freeze(['ramp']);

/**
 * THE PREMISE BEFORE THAT — item 4's pair, retired earlier the same day, also
 * the sharper flavour. Kept because the derivation branches on cardinality
 * (`is`/`are`, `it goes`/`they go`, `the key`/`either key`) and a single-key
 * replay would leave the PLURAL half of the sentence asserted by nothing.
 */
const THE_LAG_BEFORE_THAT: readonly string[] = Object.freeze(['patch_motion', 'patch_world_ys']);

/**
 * THE LIVE PREMISE, sorted — what an author sees on screen TODAY, which is
 * nothing. Read from the constant, never restated, so this file cannot agree
 * with itself about which key is lagging.
 */
const LIVE = [...PRESET_KEYS_AWAITING_AEON].sort();

describe('the premise is ARMED — and the arming is asserted, not assumed', () => {
  it('the premise is NON-EMPTY, and every key in it (and both replays) is an optional root key', () => {
    expect(
      PRESET_KEYS_AWAITING_AEON,
      'PRESET_KEYS_AWAITING_AEON is EMPTY — the lag has closed. That is not a failure of this '
      + 'row: re-aim this file at the sentence being OFF screen (git log it for the shape it had '
      + 'while retired), and see the drift test\'s lag row, which measures it.',
    ).not.toEqual([]);
    // Anti-vacuous: the LIVE premise is real vocabulary — a root key of the
    // schema, and an OPTIONAL one, because a REQUIRED key could never be "not
    // consumed" (every document would carry it, and none would build).
    for (const k of LIVE) {
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
      expect(EFFECTS_PRESET_SCHEMA.required as string[], `${k} is a REQUIRED root key`)
        .not.toContain(k);
    }
    // Anti-vacuous: the replays are real vocabulary — root keys of the schema,
    // and OPTIONAL ones, because a REQUIRED key could never be "not consumed"
    // (every document would carry it, and none would build). Without this the
    // wording rows below could be driven by a name nothing in the product uses.
    for (const k of [...THE_LAG_THAT_WAS, ...THE_LAG_BEFORE_THAT]) {
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
      expect(EFFECTS_PRESET_SCHEMA.required as string[], `${k} is a REQUIRED root key`)
        .not.toContain(k);
    }
    // ...and the two replays exercise the two cardinality branches.
    expect(THE_LAG_THAT_WAS).toHaveLength(1);
    expect(THE_LAG_BEFORE_THAT.length).toBeGreaterThan(1);
  });

  it('so there IS a sentence, and the leaf renders it — both driven by the premise', () => {
    const live = presetLagDisclosure();
    expect(live).not.toBeNull();
    // The leaf says exactly what the derivation says — not a literal that
    // happens to contain the right words.
    expect(textOf(expand(PresetLagDisclosure()))).toBe(live);
    // ...and every lagging key is named in it, verbatim.
    for (const k of LIVE) expect(live!).toContain(`\`${k}\``);
    // ...and it is the PREMISE that speaks, not something else: the SAME
    // derivation, handed an empty list, is silent.
    expect(presetLagDisclosure([])).toBeNull();
  });

  it('the LIVE sentence says the SHARPER flavour — this lag fails the build outright', () => {
    // MEASURED, in preset-lag.ts's header, through git objects at aeon
    // origin/master 8e45ebac: `boundary` is in NONE of the page's three rows —
    // not accepted, not ignored, not refused-by-name. So aeon's `_check_keys`
    // meets it as an unknown property and `_refuse` raises on the WHOLE
    // document. Softening this wording to the 12aecd5 "lowers without it"
    // flavour would understate what an author is risking, and nothing on screen
    // would be there to notice.
    const s = presetLagDisclosure()!;
    expect(s).toMatch(/refuses the WHOLE DOCUMENT/);
    expect(s).toMatch(/will not build/);
    expect(s).toMatch(/nothing set below reaches a ROM/);
  });
});

describe('the wording, driven with explicit replays — what a re-opened lag would say', () => {
  // BOTH cardinality branches, because the derivation has two and a retired
  // premise leaves neither of them exercised by production.
  for (const [label, replay] of [
    ['the key that just retired (singular)', THE_LAG_THAT_WAS],
    ['the pair that retired before it (plural)', THE_LAG_BEFORE_THAT],
  ] as const) {
    it(`says the three things, in one sentence, with a date and where to re-measure — ${label}`, () => {
      const s = presetLagDisclosure(replay)!;
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
      for (const k of replay) expect(s).toContain(`\`${k}\``);
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
  }

  // ...and the measurement the sentence NAMES is the artifact the drift row
  // really consults — the PAGE, not the generator source. Reading evidence about
  // `tools/effects_gen.py` as evidence about this measurement is the mistake
  // this row exists to make impossible.
  it('the sentence names the PAGE at origin/master as its measurement, not the generator source', () => {
    expect(PRESET_LAG_MEASUREMENT).toContain('docs/EDITOR_RASTER_PRESETS.md');
    expect(PRESET_LAG_MEASUREMENT).toContain('origin/master');
    expect(PRESET_LAG_MEASUREMENT).toContain('effects-preset-schema-drift.test.ts');
    expect(PRESET_LAG_MEASUREMENT).not.toContain('effects_gen.py');
    // And the drift test really reads that path, so the name is not decoration.
    expect(readFileSync(DRIFT_TEST_PATH, 'utf8'))
      .toContain("const PAGE = 'docs/EDITOR_RASTER_PRESETS.md'");
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
 * THE POISON, RE-INVERTED WITH THE PREMISE — FOR THE FOURTH TIME.
 *
 * It stubbed the constant EMPTY and required silence while the premise was
 * ARMED; that was the right direction then, because the sentence was on screen
 * and the question was whether it could ever leave. With the premise RETIRED the
 * empty stub IS the production state, so it would prove nothing: a leaf
 * hard-wired to `return null` would sail through it, and the machinery would be
 * dead while every row stayed green.
 *
 * THE LOAD-BEARING DIRECTION IS NOW THE OTHER ONE. Stub the constant back
 * NON-EMPTY — the exact shape of the day a lag re-opens — and the leaf must
 * speak the WHOLE sentence again, equal to the derivation, in warning tone.
 *
 * THIS IS THE DIRECTION THAT PROVES THE MACHINERY IS STILL ARMED. A retirement
 * that quietly disables the disclosure is the O62/O64 defect wearing the
 * opposite costume: the next author to ship a control for an unbuilt key gets no
 * sentence, and nothing anywhere notices.
 *
 * It stubs the DERIVED FACT, not the sentence: a leaf that rendered a literal
 * would fail the `toBe(presetLagDisclosure(...))` below, and one hard-wired shut
 * fails the `not.toBeNull()`.
 */
describe('the render gate — POISON: the premise stubbed back to NON-EMPTY', () => {
  afterEach(() => {
    vi.doUnmock(LAG_MODULE);
    vi.resetModules();
  });

  it('with PRESET_KEYS_AWAITING_AEON re-filled, the leaf SPEAKS the whole sentence as body text', async () => {
    vi.resetModules();
    vi.doMock(LAG_MODULE, async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../../core/formats/effects/preset-lag')>();
      return { ...real, PRESET_KEYS_AWAITING_AEON: Object.freeze([...THE_LAG_THAT_WAS]) };
    });
    const poisoned = await import('../PresetLagDisclosure');
    // The stub took: the module the leaf sees has the re-filled list.
    const lag = await import(LAG_MODULE);
    expect(lag.PRESET_KEYS_AWAITING_AEON).toEqual([...THE_LAG_THAT_WAS]);

    const el = poisoned.PresetLagDisclosure();
    expect(
      el,
      'the leaf renders NOTHING on a NON-empty premise — the gate is stuck SHUT, so a re-opened '
      + 'lag would reach an author with no disclosure at all, above controls whose output fails '
      + 'aeon\'s build. The retirement has taken the machinery with it, which is the O62/O64 '
      + 'defect wearing the opposite costume.',
    ).not.toBeNull();
    // Whole, as body text, not a title= attribute — and equal to the derivation,
    // so it is not a literal that happens to contain the right words.
    expect(textOf(expand(el))).toBe(presetLagDisclosure(THE_LAG_THAT_WAS));
    // Warning tone, so it is not mistaken for a footnote.
    expect((el as React.ReactElement<{ tone?: string }>).props.tone).toBe('warning');
  });

  it('and the SAME on the plural premise — both mount sites read this one leaf', async () => {
    vi.resetModules();
    vi.doMock(LAG_MODULE, async (importOriginal) => {
      const real = await importOriginal<typeof import('../../../../core/formats/effects/preset-lag')>();
      return { ...real, PRESET_KEYS_AWAITING_AEON: Object.freeze([...THE_LAG_BEFORE_THAT]) };
    });
    const poisoned = await import('../PresetLagDisclosure');
    const lag = await import(LAG_MODULE);
    expect(lag.PRESET_KEYS_AWAITING_AEON).toEqual([...THE_LAG_BEFORE_THAT]);

    const el = poisoned.PresetLagDisclosure();
    expect(el, 'the leaf is silent on a plural re-opened lag').not.toBeNull();
    expect(textOf(expand(el))).toBe(presetLagDisclosure(THE_LAG_BEFORE_THAT));
    // The leaf is ONE component mounted in BOTH sections (the mount rows below
    // pin that), so a sentence it returns reaches the channels body and the
    // anchors body alike. There is no second leaf that could be wired shut.
    expect((el as React.ReactElement<{ tone?: string }>).props.tone).toBe('warning');
  });

  /**
   * ⚠ THE LOAD-BEARING HALF, AND IT MOVED WITH THE PREMISE (2026-09-04, the
   * `boundary` arming). While the list was EMPTY the production state was
   * silence, so the two rows above — stub NON-empty, demand the sentence — were
   * the direction that proved anything. With the list ARMED, a NON-empty stub IS
   * production and a leaf hard-wired to render a literal would sail through it.
   * So the direction that proves something now is the OTHER one: stub the
   * constant EMPTY, the exact shape of the day aeon ships the key, and the leaf
   * must fall SILENT. That is what proves the sentence can retire at all — a
   * disclosure that cannot be switched off is the O62/O64 defect in waiting.
   *
   * BOTH rows are kept, in both states, because between them they pin the gate
   * open and shut; only which one is load-bearing changes.
   */
  it('POISON, the load-bearing direction today: emptied, the leaf falls SILENT', async () => {
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
    expect(
      el,
      'the leaf renders nothing on a NON-empty premise — an open lag is reaching an author with '
      + 'no disclosure at all, above controls whose output fails aeon\'s build outright',
    ).not.toBeNull();
    // Whole, as body text, not a title= attribute — and equal to the derivation,
    // so it is not a literal that happens to contain the right words.
    expect(textOf(expand(el))).toBe(presetLagDisclosure(PRESET_KEYS_AWAITING_AEON));
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
 * The armed shape of this block asked: while the premise is non-empty, does the
 * drift test still assert the measured lag equals it? The RETIRED shape asks the
 * mirror question, and it is the one that matters more, because the state it
 * guards is SILENCE. Nothing on screen says "this key is not consumed" any more;
 * the only reason that is honest is that a row in the drift test reads aeon's
 * page at a committed revision every run and asserts the lag is EMPTY. Delete
 * THAT row — or narrow what it measures — and the retirement becomes a claim
 * nobody checks: exactly the O62/O64 defect, wearing the opposite costume. So
 * this block goes red if either happens.
 *
 * Read on the drift test's SOURCE with comments stripped, so a mention in prose
 * cannot satisfy it.
 */
describe('the retirement cannot outlive its measurement either', () => {
  const src = stripComments(readFileSync(DRIFT_TEST_PATH, 'utf8'));

  it('the drift test COUPLES to the premise — the hand-typed list is measured, not trusted', () => {
    expect(PRESET_KEYS_AWAITING_AEON).not.toEqual([]);
    // ⚠ THE COUPLING RULE INVERTS WITH THE PREMISE, and both directions are
    // right in their own state. While the list is NON-EMPTY it is a hand-typed
    // premise a panel renders a warning from, and the only thing that can keep
    // it honest is a row comparing it to aeon's page at TIP — so the drift test
    // MUST name it. While the list is EMPTY, a row asserting `lag equals <the
    // empty constant>` is one claim spelled through an indirection nobody can
    // read — so the drift test must NOT name it.
    expect(src, 'the drift test no longer reads the premise constant while that constant is '
      + 'NON-empty — the hand-typed list a panel renders a warning from is now checked by '
      + 'nothing, and it can go stale in either direction with no row noticing')
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
      /const lag = schemaOptional\.filter\(\(k\) => !keys\.preset\.includes\(k\)\)\.sort\(\);\s*expect\(\s*lag,[\s\S]*?\)\.toEqual\(LAGGING\);/,
    );
    // And the other side of the same coin, so the row cannot pass on a page that
    // simply stopped listing what it refuses.
    expect(src)
      .toMatch(/keys\['preset-refused'\]\.filter\(\(k\) => !schemaReserved\.includes\(k\)( && !LAGGING\.includes\(k\))?\)/);

    // The drift test carries NO literal copy of any lagging key name to drift
    // from — not the LIVE premise's, not the key that retired today, not the
    // pair that retired earlier today, and not the pair that retired on
    // 2026-09-02. This is why the row asserting the top-level `oneOf` over there
    // names `bands` structurally and asserts the other branch by shape rather
    // than by name.
    for (const k of [...LIVE, ...THE_LAG_THAT_WAS, ...THE_LAG_BEFORE_THAT, 'cycles', 'variants']) {
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
// most likely to be "tidied away" now that it shows nothing. The same is true of
// the channels section above, which authors `ramp` alongside `cycles` /
// `variants`: both sites are silent today and both must stay wired.
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
    //    so the leaf above the anchor controls is silent.
    //
    //    ⚠ NOTE THE SHAPE. `presetLagDisclosure()` returns `null` while the
    //    premise is empty, and `expect(null).not.toContain(...)` THROWS rather
    //    than passing — so the retired state is asserted directly (`toBeNull`)
    //    and the per-key claim is made against the PREMISE, which is a list in
    //    both states. The armed shape of this row had a branch that would have
    //    thrown here; it does not any more.
    for (const k of authored) {
      expect(
        PRESET_KEYS_AWAITING_AEON,
        `${k} is back in the premise — a lag has re-opened on a key THIS section authors. `
        + 'Re-aim this row at the sentence being about this section (this file records the shape '
        + 'it had while armed) rather than relaxing it.',
      ).not.toContain(k);
    }
    // ⚠ THE LEAF IS NOT SILENT ANY MORE, AND THE CLAIM THIS ROW MAKES IS
    // NARROWER THAN "SILENT". A lag re-opened on 2026-09-04 for `boundary`, a
    // key NO surface in this panel authors — so the sentence above these
    // controls SPEAKS, and it speaks about something else. The two halves worth
    // asserting are therefore: it does not name THIS surface's keys (so an
    // author is not told their ramp/anchor/swap will not build when it will),
    // and it is the derivation's own output rather than a literal.
    const live = presetLagDisclosure(PRESET_KEYS_AWAITING_AEON);
    expect(live, 'the premise is armed and the leaf is silent').not.toBeNull();
    for (const k of authored) {
      expect(live!, `the live sentence names "${k}", which this row just asserted is NOT in the `
        + 'premise — the derivation and the premise disagree').not.toContain(`\`${k}\``);
    }
    expect(textOf(expand(PresetLagDisclosure()))).toBe(live);
    // ...and it is mounted in exactly FIVE places, so "silent" is a statement
    // about every body and not about a leaf that quietly lost a mount site.
    //
    // ⚠ FIVE, NOT FOUR, AND IT WAS TWO BEFORE THAT. The `ramp` control card
    // (row 128) grew the third when it landed and nothing pinned it; the
    // `base_swap` card (row 131) is the fourth, pinned in the same breath as it
    // was written; the `boundary` card (EW-BOUNDARY-PANEL) is the FIFTH, and it
    // is the first mount site where the sentence is actually SPEAKING —
    // `PRESET_KEYS_AWAITING_AEON` holds `boundary`, so the card's disclosure
    // renders rather than returning null. The count is asserted here and each
    // site in a row of its own. A mount site no row names is a mount site the
    // next "tidy away the silent leaf" edit removes for free.
    expect(code.split('<PresetLagDisclosure').length - 1,
      'the leaf is no longer mounted in exactly five bodies — channels, anchors, the ramp card, '
      + 'the base-swap card and the boundary card. A lost mount site is a re-armed lag that never '
      + 'reaches that surface.',
    ).toBe(5);

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

// ═══════════════════════════════════════════════════════════════════════════
// AND THE THIRD MOUNT SITE: THE RAMP CONTROL CARD (ROADMAP row 128)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ THIS SITE HAD NO ROW UNTIL THE RETIREMENT WENT LOOKING FOR IT. The `ramp`
// control card grew a `<PresetLagDisclosure />` when it landed, and the two
// section rows above counted two mounts and asked no question about a third. It
// is the site with the strongest pull toward deletion: it was added FOR `ramp`,
// `ramp` is the key that just retired, and the leaf there now renders nothing.
//
// It stays for the same reason the other two do — the leaf is ONE component
// reading ONE premise, so re-arming is a one-line edit that must reach every
// surface that authors a preset key. Unmounting it here would make the next lag
// invisible on this card alone, which is the hardest flavour of this defect to
// see: two thirds of the panel would still warn.
describe('the panel mounts the leaf in the RAMP card too, and it stays while silent', () => {
  const code = stripComments(readFileSync(PANEL_PATH, 'utf8'));

  it('the ramp card mounts the leaf, propless and unguarded, before its fields', () => {
    // The card is located by a control only it has, not by a key name.
    const card = code.indexOf('setRampSpanCommand(');
    expect(card, 'no ramp control card in the panel').toBeGreaterThan(0);
    // The mount is BEFORE the fields it covers — the same rule as the sections.
    const mounts = [...code.matchAll(/<PresetLagDisclosure\s*\/>/g)].map((m) => m.index!);
    expect(mounts, 'the leaf is not mounted five times').toHaveLength(5);
    const inRamp = mounts.filter((i) => i < card);
    expect(inRamp.length, 'no PresetLagDisclosure mount precedes the ramp card\'s own controls')
      .toBeGreaterThan(0);
    const nearest = Math.max(...inRamp);
    // ...and it is THIS card's mount, not one of the sections' leaking in from
    // above: nothing between the mount and the ramp control opens a different
    // surface. Without this clause the row would pass on a panel that deleted
    // the ramp mount and grew a third one anywhere earlier in the file.
    const between = code.slice(nearest, card);
    expect(between, 'the nearest mount above the ramp controls belongs to a COLLAPSIBLE SECTION, '
      + 'not to the ramp card — the ramp card\'s own mount has been removed')
      .not.toMatch(/<CollapsibleSection|id="aeon\.effects\.preset\./);
    // ...and it really is the THIRD of the four, so the two section rows above
    // and this row are talking about three distinct mounts.
    //
    // ⚠ THIS WAS `expect(nearest).toBe(Math.max(...mounts))` AND IT WAS ONLY
    // TRUE WHILE THE RAMP CARD WAS LAST IN THE FILE. The base-swap card (row
    // 131) is written after it and carries the fourth mount, so "the last mount
    // in the file" stopped meaning "the ramp card's". Re-aimed at the thing
    // actually meant: it is the third of the mounts, and the ones that follow
    // it are the later cards' — TWO of them since EW-BOUNDARY-PANEL, which is
    // the same lesson landing a second time. The row is now written against
    // "which mount is this" and the count of later cards rather than against
    // "is it the last", so a sixth card moves one number here instead of
    // silently re-pointing the row at somebody else's mount.
    expect(mounts.indexOf(nearest)).toBe(2);
    expect(mounts.filter((i) => i > nearest),
      'the ramp card\'s mount is no longer followed by the base-swap card\'s and the boundary '
      + 'card\'s',
    ).toHaveLength(2);
    // Nothing renders between the mount and the first ramp field but markup the
    // card owns — specifically, no guard on the mount line itself.
    const line = code.slice(0, nearest).lastIndexOf('\n');
    const mountLine = code.slice(line + 1, code.indexOf('\n', nearest));
    expect(mountLine).toMatch(/^\s*<PresetLagDisclosure\s*\/>\s*$/);
    expect(mountLine).not.toMatch(/&&|\?|selected\.|section/);
  });

  it('⚠ THE SENTENCE IS RETIRED FOR THIS CARD\'S OWN KEY — and the one it WOULD say survives', () => {
    // The key this card authors. Named here because the card's controls are
    // what makes it load-bearing — not as a copy of the premise, which is empty.
    const authored: readonly string[] = ['ramp'];
    for (const k of authored) {
      expect(
        PRESET_KEYS_AWAITING_AEON,
        `${k} is back in the premise — a lag has re-opened on the key THIS card authors. `
        + 'Re-aim this row at the sentence being about this card rather than relaxing it.',
      ).not.toContain(k);
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
    }
    // ⚠ THE LEAF IS NOT SILENT ANY MORE, AND THE CLAIM THIS ROW MAKES IS
    // NARROWER THAN "SILENT". A lag re-opened on 2026-09-04 for `boundary`, a
    // key NO surface in this panel authors — so the sentence above these
    // controls SPEAKS, and it speaks about something else. The two halves worth
    // asserting are therefore: it does not name THIS surface's keys (so an
    // author is not told their ramp/anchor/swap will not build when it will),
    // and it is the derivation's own output rather than a literal.
    const live = presetLagDisclosure(PRESET_KEYS_AWAITING_AEON);
    expect(live, 'the premise is armed and the leaf is silent').not.toBeNull();
    for (const k of authored) {
      expect(live!, `the live sentence names "${k}", which this row just asserted is NOT in the `
        + 'premise — the derivation and the premise disagree').not.toContain(`\`${k}\``);
    }
    expect(textOf(expand(PresetLagDisclosure()))).toBe(live);

    // AND THE WORDING THIS KEY EARNED IS STILL ASSERTED. If the lag re-opens on
    // `ramp`, an author gets a sentence that names it and says what it COSTS —
    // a failed build, not a silently-dropped field. Deleting this half is how
    // the retirement quietly takes the coverage with it.
    const wouldSay = presetLagDisclosure(authored)!;
    expect(wouldSay).not.toBeNull();
    for (const k of authored) expect(wouldSay).toContain(`\`${k}\``);
    expect(wouldSay).toMatch(/refuses the WHOLE DOCUMENT/);
    expect(wouldSay).toMatch(/will not build/);
    // Singular, because this card authors exactly one key — the branch the
    // plural replay above cannot reach.
    expect(wouldSay).toMatch(/is authored here/);
    expect(wouldSay).toMatch(/that is as far as it goes/);
  });

  it('the card carries no hand-typed copy of the retired sentence', () => {
    // The disclosure reaches this card THROUGH the leaf. A literal here would
    // be a second copy of the claim that no premise can retire.
    expect(code).not.toMatch(/Not consumed by the engine yet/);
    expect(code).not.toMatch(/refuses the WHOLE DOCUMENT/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AND THE FOURTH MOUNT SITE: THE BASE-SWAP CONTROL CARD (ROADMAP row 131)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ THIS SITE IS SILENT FOR A DIFFERENT REASON THAN THE RAMP CARD'S, and the
// difference is the reason it is pinned rather than assumed. `ramp` was in the
// premise and RETIRED out of it when aeon's page learned the key. `base_swap`
// was NEVER in it: aeon shipped the key AHEAD of the contract declaring it (the
// opposite direction), so no lag ever opened and the drift row stayed green
// throughout. A reader who assumes the ramp card's history applies here would
// conclude the mount is a leftover from a retirement that never happened, and
// delete it.
//
// It stays for the reason all four do: the leaf is ONE component reading ONE
// premise, so re-arming is a one-line edit in `core/formats/effects/preset-lag.
// ts` that must reach every surface that authors a preset key.
describe('the panel mounts the leaf in the BASE-SWAP card too, and it stays while silent', () => {
  const code = stripComments(readFileSync(PANEL_PATH, 'utf8'));

  it('the base-swap card mounts the leaf, propless and unguarded, before its fields', () => {
    // Located by a control only this card has, not by a key name.
    const card = code.indexOf('setBaseSwapLineCommand(');
    expect(card, 'no base-swap control card in the panel').toBeGreaterThan(0);
    const mounts = [...code.matchAll(/<PresetLagDisclosure\s*\/>/g)].map((m) => m.index!);
    expect(mounts, 'the leaf is not mounted five times').toHaveLength(5);
    const before = mounts.filter((i) => i < card);
    expect(before.length, 'no PresetLagDisclosure mount precedes the base-swap card\'s controls')
      .toBeGreaterThan(0);
    const nearest = Math.max(...before);
    // ...and it is THIS card's mount, not the ramp card's leaking in from
    // above: nothing between the mount and the base-swap control opens the ramp
    // card. Without this clause the row would pass on a panel that deleted the
    // base-swap mount entirely.
    expect(code.slice(nearest, card),
      'the nearest mount above the base-swap controls belongs to another card or section — the '
      + 'base-swap card\'s own mount has been removed')
      .not.toMatch(/<CollapsibleSection|setRampSpanCommand\(|id="aeon\.effects\.preset\./);
    // ⚠ IT WAS "THE LAST OF THE FOUR" UNTIL EW-BOUNDARY-PANEL, and that
    // spelling would now be false for a correct panel — the boundary card's
    // mount is last. What the row actually needed was that this mount is
    // DISTINCT from the ramp's (the clause above) and that the next one along
    // belongs to the card that comes after, not to this one counted twice.
    const after = mounts.filter((i) => i > nearest);
    expect(after, 'the base-swap card is the last mount site again — the boundary card\'s mount '
      + 'has been removed').toHaveLength(1);
    expect(code.slice(nearest, after[0]),
      'the mount after the base-swap card\'s does not sit before the boundary card\'s own '
      + 'controls').toContain('setBaseSwapTargetCommand(');
    // No guard on the mount line itself.
    const line = code.slice(0, nearest).lastIndexOf('\n');
    const mountLine = code.slice(line + 1, code.indexOf('\n', nearest));
    expect(mountLine).toMatch(/^\s*<PresetLagDisclosure\s*\/>\s*$/);
    expect(mountLine).not.toMatch(/&&|\?|selected\.|section/);
  });

  it('⚠ THE KEY THIS CARD AUTHORS WAS NEVER IN THE PREMISE — and the sentence it WOULD say survives', () => {
    const authored: readonly string[] = ['base_swap'];
    for (const k of authored) {
      expect(
        PRESET_KEYS_AWAITING_AEON,
        `${k} is in the premise — a lag has OPENED on the key this card authors, which would be a `
        + 'first: aeon shipped this key ahead of the contract. Re-aim this row rather than '
        + 'relaxing it.',
      ).not.toContain(k);
      expect(EFFECTS_PRESET_ROOT_KEYS, `${k} is not a root key of the schema`).toContain(k);
    }
    // ⚠ THE LEAF IS NOT SILENT ANY MORE, AND THE CLAIM THIS ROW MAKES IS
    // NARROWER THAN "SILENT". A lag re-opened on 2026-09-04 for `boundary`, a
    // key NO surface in this panel authors — so the sentence above these
    // controls SPEAKS, and it speaks about something else. The two halves worth
    // asserting are therefore: it does not name THIS surface's keys (so an
    // author is not told their ramp/anchor/swap will not build when it will),
    // and it is the derivation's own output rather than a literal.
    const live = presetLagDisclosure(PRESET_KEYS_AWAITING_AEON);
    expect(live, 'the premise is armed and the leaf is silent').not.toBeNull();
    for (const k of authored) {
      expect(live!, `the live sentence names "${k}", which this row just asserted is NOT in the `
        + 'premise — the derivation and the premise disagree').not.toContain(`\`${k}\``);
    }
    expect(textOf(expand(PresetLagDisclosure()))).toBe(live);
    // The sentence this key would earn if a lag ever opened on it.
    const wouldSay = presetLagDisclosure(authored)!;
    expect(wouldSay).not.toBeNull();
    for (const k of authored) expect(wouldSay).toContain(`\`${k}\``);
    expect(wouldSay).toMatch(/refuses the WHOLE DOCUMENT/);
  });

  it('the card carries no hand-typed copy of the retired sentence', () => {
    expect(code).not.toMatch(/Not consumed by the engine yet/);
    expect(code).not.toMatch(/refuses the WHOLE DOCUMENT/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE FIFTH MOUNT SITE — THE BOUNDARY CARD, AND THE FIRST ONE THAT SPEAKS
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ EVERY OTHER MOUNT IN THIS FILE IS ASSERTED SILENT. This one is not: the
// premise names `boundary`, which is the key this card authors, so the sentence
// RENDERS here — and it is the sharper flavour, because aeon's page lists the
// key in none of its three rows and their generator refuses the WHOLE DOCUMENT.
// That makes this the one surface where the whole apparatus is doing its job
// visibly, and the rows below assert both halves: the mount is there, and the
// sentence it produces is the DERIVATION's own output rather than a literal the
// card carries.
describe('the panel mounts the leaf in the BOUNDARY card, where it is SPEAKING', () => {
  const code = stripComments(readFileSync(PANEL_PATH, 'utf8'));

  it('the boundary card mounts the leaf, propless and unguarded, before its fields', () => {
    // Located by a control only this card has, not by a key name.
    const card = code.indexOf('setBoundaryFieldCommand(');
    expect(card, 'no boundary control card in the panel').toBeGreaterThan(0);
    const mounts = [...code.matchAll(/<PresetLagDisclosure\s*\/>/g)].map((m) => m.index!);
    expect(mounts, 'the leaf is not mounted five times').toHaveLength(5);
    const before = mounts.filter((i) => i < card);
    expect(before.length, 'no PresetLagDisclosure mount precedes the boundary card\'s controls')
      .toBeGreaterThan(0);
    const nearest = Math.max(...before);
    // ...and it is THIS card's mount, not the base-swap card's leaking in from
    // above: nothing between the mount and the boundary control opens another
    // card. Without this clause the row would pass on a panel that deleted the
    // boundary mount entirely.
    expect(code.slice(nearest, card),
      'the nearest mount above the boundary controls belongs to another card or section — the '
      + 'boundary card\'s own mount has been removed')
      .not.toMatch(/<CollapsibleSection|setBaseSwapLineCommand\(|id="aeon\.effects\.preset\./);
    // No guard on the mount line itself.
    const line = code.slice(0, nearest).lastIndexOf('\n');
    const mountLine = code.slice(line + 1, code.indexOf('\n', nearest));
    expect(mountLine).toMatch(/^\s*<PresetLagDisclosure\s*\/>\s*$/);
    expect(mountLine).not.toMatch(/&&|\?|selected\.|section/);
  });

  /**
   * ⚠ THE ROW THAT IS THE OPPOSITE OF EVERY OTHER ONE IN THIS FILE. Elsewhere
   * the claim is "the sentence does not name THIS surface's keys". Here it must:
   * `boundary` IS this card's key and the lag IS open on it, so an author
   * authoring a boundary is told, on the card, that what they are writing does
   * not build. The sentence is the derivation's own output, so if aeon's
   * generator arm lands and the drift row empties the premise, this row goes red
   * and is the reminder that the disclosure retired — it is NOT a claim that the
   * lag is permanent, and re-arming the list to make it green would be the
   * defect the whole apparatus exists to prevent.
   */
  it('the sentence NAMES this card\'s own key, and is the derivation\'s output not a literal', () => {
    expect(
      PRESET_KEYS_AWAITING_AEON,
      'the lag no longer names `boundary`. If aeon\'s generator arm has landed that is CORRECT: '
      + 'retire this row with the sentence, and do NOT re-arm the premise to make it green.',
    ).toContain('boundary');
    expect(EFFECTS_PRESET_ROOT_KEYS, 'boundary is not a root key of the schema')
      .toContain('boundary');

    const live = presetLagDisclosure(PRESET_KEYS_AWAITING_AEON);
    expect(live, 'the premise names boundary and the leaf is silent').not.toBeNull();
    expect(live!).toContain('`boundary`');
    // ⚠ THE SHARPER FLAVOUR, which is the whole reason the wording was not
    // softened when this lag re-opened: a key aeon's page does not mention at
    // all is one its generator meets as an unknown property and rejects the
    // WHOLE DOCUMENT for. "Reaches the file and stops there" would understate it.
    expect(live!).toContain('WHOLE DOCUMENT');
    expect(live!).toContain('will not build');
    // ...and the leaf really renders THAT string, rather than the card carrying
    // a copy of it that would outlive the premise.
    expect(textOf(expand(PresetLagDisclosure()))).toBe(live);
    expect(code.slice(code.indexOf('function BoundaryCard(')),
      'the boundary card writes its own copy of the disclosure\'s sentence, which would outlive '
      + 'the premise the derivation retires with').not.toMatch(/WHOLE DOCUMENT|will not build/);
  });
});
