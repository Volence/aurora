// ═══════════════════════════════════════════════════════════════════════════
// CHBAND-PROSE-REPIN — CLOSED 2026-09-05. What this file guards NOW is that the
// retired phrasing is REFUSED, which is a different property from the one it
// was born holding.
// ═══════════════════════════════════════════════════════════════════════════
//
// aeon restated one sentence of `effects_channel_bands.json`'s `how_to_use` in
// the REFUSAL direction. The tail
//
//     ... whole pixels) is <= channels[c].lines          (RETIRED)
//
// became
//
//     ... whole pixels) EXCEEDS channels[c].lines        (CURRENT)
//
// ── WHY IT WAS WORTH A THREE-STEP MIGRATION ──────────────────────────────
//
// The retired sentence was CLEARANCE-SHAPED — "a sweep fits when travel is <=
// lines" — while a later sentence in the SAME string said "travel <= lines is
// CANNOT TELL, never a clearance". Two people could implement that document
// accurately and build OPPOSITE warnings, and the clearance is the one this
// data cannot support. aeon removed the contradiction rather than documenting
// it.
//
// Every miss on the travel-formula parser is `fail()`, which THROWS AT MODULE
// LOAD — so a parser that knew only one phrasing would not degrade a warning,
// it would stop the editor from STARTING the moment the other document was
// vendored. Hence expand-then-contract, in three steps:
//
//   1. Aurora bbdf1890  — both parsers accept EITHER tail.
//   2. aeon   b8913cda  — the new text lands.
//   3. Aurora (here)    — vendor it, and DELETE the transitional arm.
//
// ── ⚠ WHY THIS FILE SURVIVED STEP 3 INSTEAD OF BEING DELETED WITH THE ARM ──
//
// Its header used to say this whole file should go when the migration ended.
// That was wrong, and deleting it would have thrown away the only thing that
// distinguishes an arm that is GONE from an arm that is merely UNUSED. With the
// vendored document saying EXCEEDS, a parser that still accepted `is <=` would
// pass every other test in this repo forever — nothing would ever hand it the
// retired sentence. So the row that once asserted the old arm was load-bearing
// now asserts the old phrasing is REFUSED, and the harness rows do the same.
// The tolerance is measured as absent rather than assumed absent.
//
// A tolerance added for a migration is the classic thing that outlives its
// reason. This file is what made that one mortal.
//
// ── WHY THIS TESTS THE REGEX SOURCE AND NOT A FUNCTION ────────────────────
//
// `channel-bands.ts` parses the sentence at MODULE LOAD, against the one
// document it imports, and exposes no seam to re-run it on another string. The
// property under test is about strings the module has never seen, so the
// pattern is EXTRACTED FROM ITS SOURCE and applied here. That is deliberate and
// it buys the thing a hand-copied pattern in a test could not: if someone edits
// the regex in `channel-bands.ts`, this file tests the EDITED pattern, so it
// cannot silently drift into asserting a rule the app no longer applies.
//
// ── AND IT PINS THE SECOND COPY ──────────────────────────────────────────
//
// The same regex exists a second time, on purpose, in
// `scratchpad/anchor-authoring-harness.mjs`. That harness deliberately does NOT
// import `channel-bands.ts` — importing it would make its rows say "the panel
// shows what the provider computes", which they cannot fail — so the
// duplication is load-bearing rather than sloppy. What makes it safe is that
// the two copies AGREE, and nothing asserted that before this file: the
// harness's copy would have kept the old pattern and done it more quietly than
// the app would, since nothing runs it on the way to a green suite.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CHANNEL_BANDS_TS = resolve(__dirname, '../../src/core/formats/effects/channel-bands.ts');
const HARNESS_MJS = resolve(__dirname, '../../scratchpad/anchor-authoring-harness.mjs');
const BANDS_JSON = resolve(
  __dirname, '../../src/core/formats/effects/aeon-effects-channel-bands.json',
);

/**
 * The travel-formula regex as it is WRITTEN in a source file, pulled out by its
 * unmistakable opening. Returned as source text so the two copies can be
 * compared byte for byte before either is compiled.
 */
function travelRegexSourceIn(path: string): string {
  const src = readFileSync(path, 'utf8');
  const line = src.split('\n').find((l) => l.includes('PEAK-TO-PEAK TRAVEL \\('));
  if (line === undefined) {
    throw new Error(`${path} no longer contains the travel-formula regex: if the parser moved, `
      + 'this gate is measuring nothing and must be re-pointed, not deleted');
  }
  const m = /\/(PEAK-TO-PEAK TRAVEL .*channels\\\[c\\\]\\\.lines)\//.exec(line);
  if (m === null) throw new Error(`could not extract the regex literal from ${path}: ${line}`);
  return m[1];
}

/** aeon's RETIRED wording — clearance-shaped, refused since aeon b8913cda. */
const RETIRED_SENTENCE = 'A sweep on channel c fits when its PEAK-TO-PEAK TRAVEL '
  + '(2 * (256 >> amp_shift), whole pixels) is <= channels[c].lines.';

/** aeon's CURRENT wording — the refusal direction, and what is vendored here. */
const CURRENT_SENTENCE = 'A sweep on channel c is a CERTAIN REFUSAL when its PEAK-TO-PEAK TRAVEL '
  + '(2 * (256 >> amp_shift), whole pixels) EXCEEDS channels[c].lines.';

/**
 * A sentence that states the formula with a comparison the parser has never
 * known. It separates "narrowed back to one phrasing" from "loosened to `.*`":
 * a pattern that swallowed anything after the parenthesis would pass the
 * current-wording row while having stopped checking the sentence at all.
 */
const UNKNOWN_SENTENCE = 'A sweep on channel c fits when its PEAK-TO-PEAK TRAVEL '
  + '(2 * (256 >> amp_shift), whole pixels) is roughly channels[c].lines.';

describe('CHBAND-PROSE-REPIN: the travel formula parses ONLY aeon\'s refusal-direction wording', () => {
  const source = travelRegexSourceIn(CHANNEL_BANDS_TS);
  const re = (): RegExp => new RegExp(source);

  it('the pattern under test is the one channel-bands.ts actually applies', () => {
    // Anti-vacuous: a real pattern was extracted, and it is the travel formula
    // rather than some other line that happened to match.
    expect(source).toContain('PEAK-TO-PEAK TRAVEL');
    expect(source).toContain('amp_shift');
    expect(source).toContain('channels');
    // Two capture groups — the multiplier and the base — survive the narrowing.
    // The 2 was the number aeon got wrong (permissively) before 8d217dd4, so a
    // contraction that dropped a group would be the same defect wearing a hat.
    expect(new RegExp(source).exec(CURRENT_SENTENCE)).toHaveLength(3);
  });

  it('THE ARM IS GONE: the RETIRED `is <=` phrasing is REFUSED, not merely unused', () => {
    // ⚠ THE ROW THIS FILE EXISTS FOR SINCE STEP 3. Nothing else in this repo
    // ever hands the parser the retired sentence — the vendored document says
    // EXCEEDS — so a transitional arm left in by accident would be invisible
    // forever and green forever. This row is the only thing that can tell
    // "deleted" from "dormant", which is why it replaced the row that used to
    // assert the arm was still load-bearing rather than being deleted with it.
    expect(re().exec(RETIRED_SENTENCE),
      'the transitional `is <=` arm is STILL PRESENT in channel-bands.ts. CHBAND-PROSE-REPIN '
      + 'closed on 2026-09-05: aeon retired the clearance-shaped wording at b8913cda because it '
      + 'contradicted the same string\'s "never a clearance" clause, and this repo pins that '
      + 'text. A document opening `fits when ... is <=` has REGRESSED and must stop the editor')
      .toBeNull();
  });

  it('...and the same is true of the whole retired `how_to_use`, not one hand-built clause', () => {
    // The negative above rests on one synthesised sentence. This one rebuilds
    // the retired opening in front of the REAL remainder of the vendored
    // string, so the refusal is not an artefact of a short fixture that happens
    // to miss for some unrelated reason.
    const doc = JSON.parse(readFileSync(BANDS_JSON, 'utf8')) as { how_to_use: string };
    const tail = doc.how_to_use.slice(doc.how_to_use.indexOf(' It is travel, not peak excursion:'));
    expect(tail, 'the vendored sentence no longer has the clause this fixture splices onto: '
      + 'rebuild the fixture rather than deleting the row').not.toHaveLength(0);
    expect(re().exec(RETIRED_SENTENCE + tail)).toBeNull();
  });

  it('parses aeon\'s CURRENT wording to multiplier 2 and base 256', () => {
    const m = re().exec(CURRENT_SENTENCE);
    expect(m, 'the current wording no longer parses: the editor would refuse to LOAD')
      .not.toBeNull();
    expect(Number(m![1])).toBe(2);
    expect(Number(m![2])).toBe(256);
  });

  it('the VENDORED document is the current wording, and it really parses', () => {
    // The app loads today, asserted against the bytes on disk rather than
    // against the fixture above — the two could drift, and the file that
    // matters is the one the module imports.
    const doc = JSON.parse(readFileSync(BANDS_JSON, 'utf8')) as { how_to_use: string };
    expect(doc.how_to_use,
      'the vendored sidecar does not carry aeon\'s refusal-direction wording. If it has gone '
      + 'back to `is <=`, that is a re-vendor at a pre-b8913cda revision and the module will '
      + 'throw at load')
      .toContain('EXCEEDS channels[c].lines');
    expect(doc.how_to_use).not.toContain('is <= channels[c].lines');
    const m = re().exec(doc.how_to_use);
    expect(m, 'the vendored document does not parse: the editor would refuse to LOAD')
      .not.toBeNull();
    expect([Number(m![1]), Number(m![2])]).toEqual([2, 256]);
  });

  it('a comparison the parser never knew still fails loudly: it was narrowed, not loosened', () => {
    expect(re().exec(UNKNOWN_SENTENCE),
      'the pattern accepts an unrecognised comparison. Contracting to one phrasing must NARROW '
      + 'it; a pattern loose enough to swallow a third has stopped checking the sentence, and '
      + 'would make the refusal row above pass for the wrong reason')
      .toBeNull();
    // And a sentence with no formula at all, so the negative is not resting on
    // one carefully-built string.
    expect(re().exec('A sweep fits when it is small enough.')).toBeNull();
  });

  it('THE DIRECTION IS NOT READ FROM THE SENTENCE: it is written once, in code', () => {
    // The premise the whole migration rested on, asserted rather than argued:
    // the parser reads the multiplier and the base out of `how_to_use` and
    // never the comparison. That is why two opposite phrasings could safely be
    // accepted at once during the migration, and why aeon's rewording moved no
    // logic here.
    const src = readFileSync(CHANNEL_BANDS_TS, 'utf8');
    expect(src, 'the one place the comparison direction is written')
      .toContain('if (travelPx > band.lines)');
    // Exactly one comparison of a travel against a band's line count exists —
    // IN CODE. Comments are stripped first: this module DESCRIBES the
    // comparison in prose several times (deliberately, it is the rule the file
    // exists to hold), and counting those would make the row fail on a
    // docstring. A grep for a feature's words finds the comment about it before
    // the code implementing it, and this row was written to count
    // implementations.
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    // Anti-vacuous: stripping did not eat the file, and the real comparison
    // survived it.
    expect(code).toContain('if (travelPx > band.lines)');
    expect(code.length).toBeGreaterThan(src.length / 4);
    const comparisons = code.match(/travelPx\s*[<>]=?\s*band\.lines/g) ?? [];
    expect(comparisons,
      'the fit comparison is written more than once: the ONE-DIRECTIONAL rule now has two '
      + 'implementations and they can disagree')
      .toEqual(['travelPx > band.lines']);
  });
});

describe('CHBAND-PROSE-REPIN: the harness\'s independent copy of the regex agrees', () => {
  it('anchor-authoring-harness.mjs carries the SAME pattern, byte for byte', () => {
    // The duplication is deliberate — see this file's header — but two copies
    // that must agree and are never compared is how one of them stays behind.
    // ⚠ THE ASYMMETRY THAT MAKES THIS ROW NECESSARY: the harness throws on
    // no-match and NOTHING RUNS IT on the way to a green suite, so a step-3
    // deletion applied to the app module and forgotten here would leave a live
    // `is <=` arm that no red could ever reach.
    const app = travelRegexSourceIn(CHANNEL_BANDS_TS);
    const harness = travelRegexSourceIn(HARNESS_MJS);
    expect(harness,
      'scratchpad/anchor-authoring-harness.mjs\'s copy of the travel-formula regex has drifted '
      + 'from the one in src/core/formats/effects/channel-bands.ts. The copy is intentional (it '
      + 'keeps the harness independent of the module it measures) but the two must accept exactly '
      + 'the same sentences, or the harness refuses a document the app loads, or vice versa')
      .toBe(app);
  });

  it('the harness\'s copy parses the CURRENT wording and REFUSES the retired one', () => {
    // Asserted against the harness's own extracted pattern rather than inferred
    // from the byte-equality row above, so this stays a real measurement if
    // that row is ever relaxed.
    const re = new RegExp(travelRegexSourceIn(HARNESS_MJS));
    const m = re.exec(CURRENT_SENTENCE);
    expect(m, 'the harness cannot parse aeon\'s current wording, and it THROWS on no-match')
      .not.toBeNull();
    expect([Number(m![1]), Number(m![2])]).toEqual([2, 256]);
    expect(re.exec(RETIRED_SENTENCE),
      'the harness still carries the transitional `is <=` arm after CHBAND-PROSE-REPIN step 3')
      .toBeNull();
    expect(re.exec(UNKNOWN_SENTENCE)).toBeNull();
  });
});
