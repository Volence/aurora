// ═══════════════════════════════════════════════════════════════════════════
// CHBAND-PROSE-REPIN — the TRANSITIONAL dual arm on the travel-formula parser
// ═══════════════════════════════════════════════════════════════════════════
//
// aeon is restating one sentence of `effects_channel_bands.json`'s `how_to_use`
// in the REFUSAL direction. The tail
//
//     ... whole pixels) is <= channels[c].lines
//
// becomes
//
//     ... whole pixels) EXCEEDS channels[c].lines
//
// Every miss on that parser is `fail()`, which THROWS AT MODULE LOAD — so a
// parser that knew only one phrasing would not degrade a warning, it would stop
// the editor from starting the moment the new document was vendored. We
// therefore land an expand-then-contract: accept BOTH now, aeon lands their
// text, and the old arm comes out afterwards.
//
// ⚠ THIS FILE IS THE RECORD OF A DEBT. The `is <=` arm is OWED A DELETION once
// aeon's wording is vendored here (`CHBAND-PROSE-REPIN`). A tolerance added for
// a migration is the classic thing that outlives its reason, so the row
// `the OLD arm is still load-bearing` below exists to be READ when it fails:
// the day the vendored document says EXCEEDS, that row tells you the migration
// is over and the old alternative — and this whole file — should go.
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
// harness's copy would have kept the old pattern, thrown on aeon's new text,
// and done it more quietly than the app would.

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
    throw new Error(`${path} no longer contains the travel-formula regex — if the parser moved, `
      + 'this gate is measuring nothing and must be re-pointed, not deleted');
  }
  const m = /\/(PEAK-TO-PEAK TRAVEL .*channels\\\[c\\\]\\\.lines)\//.exec(line);
  if (m === null) throw new Error(`could not extract the regex literal from ${path}: ${line}`);
  return m[1];
}

/** aeon's CURRENT wording — what the vendored document says today. */
const OLD_SENTENCE = 'A sweep on channel c fits when its PEAK-TO-PEAK TRAVEL '
  + '(2 * (256 >> amp_shift), whole pixels) is <= channels[c].lines.';

/** aeon's NEW wording, restated in the refusal direction. The reason for the arm. */
const NEW_SENTENCE = 'A sweep on channel c is a CERTAIN REFUSAL when its PEAK-TO-PEAK TRAVEL '
  + '(2 * (256 >> amp_shift), whole pixels) EXCEEDS channels[c].lines.';

/**
 * A sentence that states the formula with a comparison NEITHER arm knows. The
 * widening must accept two specific phrasings, not "anything after the
 * parenthesis" — a regex loosened to `.*` would pass both rows above while
 * having stopped checking the sentence at all.
 */
const UNKNOWN_SENTENCE = 'A sweep on channel c fits when its PEAK-TO-PEAK TRAVEL '
  + '(2 * (256 >> amp_shift), whole pixels) is roughly channels[c].lines.';

describe('CHBAND-PROSE-REPIN: the travel formula parses under BOTH of aeon\'s phrasings', () => {
  const source = travelRegexSourceIn(CHANNEL_BANDS_TS);
  const re = (): RegExp => new RegExp(source);

  it('the pattern under test is the one channel-bands.ts actually applies', () => {
    // Anti-vacuous: a real pattern was extracted, and it is the travel formula
    // rather than some other line that happened to match.
    expect(source).toContain('PEAK-TO-PEAK TRAVEL');
    expect(source).toContain('amp_shift');
    expect(source).toContain('channels');
    // Two capture groups — the multiplier and the base — survive the widening.
    // The 2 was the number aeon got wrong (permissively) before 8d217dd4, so a
    // widening that dropped a group would be the same defect wearing a new hat.
    expect(new RegExp(source).exec(OLD_SENTENCE)).toHaveLength(3);
  });

  it('the OLD arm is still load-bearing — DELETE IT when this row fails', () => {
    // ⚠ READ THIS WHEN IT GOES RED. It fails when the vendored document has
    // moved to aeon's new wording, and that failure is the SIGNAL THAT THE
    // MIGRATION IS OVER, not a regression: at that point no document this repo
    // pins says `is <=`, the transitional alternative in channel-bands.ts and
    // in anchor-authoring-harness.mjs has nothing left to accept, and it — plus
    // this whole file — should be deleted. Booked as CHBAND-PROSE-REPIN.
    const doc = JSON.parse(readFileSync(BANDS_JSON, 'utf8')) as { how_to_use: string };
    expect(doc.how_to_use,
      'the vendored sidecar has moved to aeon\'s new wording — CHBAND-PROSE-REPIN step 3 is now '
      + 'due: drop the `is <=` alternative from channel-bands.ts AND from '
      + 'scratchpad/anchor-authoring-harness.mjs, and delete this file')
      .toContain('is <= channels[c].lines');
    // ...and the live document really does parse, so the app loads today.
    expect(re().exec(doc.how_to_use)).not.toBeNull();
  });

  it('parses aeon\'s CURRENT wording to multiplier 2 and base 256', () => {
    const m = re().exec(OLD_SENTENCE);
    expect(m, 'the current wording no longer parses — the editor would refuse to LOAD')
      .not.toBeNull();
    expect(Number(m![1])).toBe(2);
    expect(Number(m![2])).toBe(256);
  });

  it('parses aeon\'s NEW wording to the SAME multiplier 2 and base 256', () => {
    // The row the widening exists for. Against the document vendored today this
    // is the only row that can tell the two patterns apart: the old pattern
    // passes every other row in this file and fails only here.
    const m = re().exec(NEW_SENTENCE);
    expect(m,
      'aeon\'s reworded how_to_use does NOT parse. Every miss on this regex is fail(), which '
      + 'throws at module load, so vendoring their new text would stop the editor from starting')
      .not.toBeNull();
    expect(Number(m![1])).toBe(2);
    expect(Number(m![2])).toBe(256);
  });

  it('the two phrasings agree on the numbers — which is why accepting both is safe', () => {
    // The whole safety argument in one row. The two sentences are opposite
    // STATEMENTS, and accepting both would be indefensible if the parser read
    // the comparison out of them. It does not: it reads the multiplier and the
    // base, and those are identical under either phrasing. The direction is
    // written once, in `anchorFitAgainstBand`, and asserted below.
    const a = re().exec(OLD_SENTENCE)!;
    const b = re().exec(NEW_SENTENCE)!;
    expect([a[1], a[2]]).toEqual([b[1], b[2]]);
  });

  it('a comparison NEITHER arm knows still fails loudly — the widening is not `.*`', () => {
    expect(re().exec(UNKNOWN_SENTENCE),
      'the pattern now accepts an unrecognised comparison. It was widened to two specific '
      + 'phrasings; a pattern loose enough to swallow a third has stopped checking the sentence')
      .toBeNull();
    // And a sentence with no formula at all, so the negative is not resting on
    // one carefully-built string.
    expect(re().exec('A sweep fits when it is small enough.')).toBeNull();
  });

  it('THE DIRECTION IS NOT READ FROM THE SENTENCE — it is written once, in code', () => {
    // The premise the widening rests on, asserted rather than argued. If a
    // future edit ever inferred `>` vs `<=` from `how_to_use`, accepting two
    // opposite statements would become genuinely wrong instead of temporary.
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
      'the fit comparison is written more than once — the ONE-DIRECTIONAL rule now has two '
      + 'implementations and they can disagree')
      .toEqual(['travelPx > band.lines']);
  });
});

describe('CHBAND-PROSE-REPIN: the harness\'s independent copy of the regex agrees', () => {
  it('anchor-authoring-harness.mjs carries the SAME pattern, byte for byte', () => {
    // The duplication is deliberate — see this file's header — but two copies
    // that must agree and are never compared is how one of them stays behind.
    // The harness throws on no-match, so aeon's new text would break it too, and
    // more quietly than the app: nothing runs it on the way to a green suite.
    const app = travelRegexSourceIn(CHANNEL_BANDS_TS);
    const harness = travelRegexSourceIn(HARNESS_MJS);
    expect(harness,
      'scratchpad/anchor-authoring-harness.mjs\'s copy of the travel-formula regex has drifted '
      + 'from the one in src/core/formats/effects/channel-bands.ts. The copy is intentional (it '
      + 'keeps the harness independent of the module it measures) but the two must accept exactly '
      + 'the same sentences, or the harness refuses a document the app loads, or vice versa')
      .toBe(app);
  });

  it('the harness\'s copy parses BOTH phrasings too', () => {
    const re = new RegExp(travelRegexSourceIn(HARNESS_MJS));
    for (const [name, s] of [['current', OLD_SENTENCE], ['new', NEW_SENTENCE]] as const) {
      const m = re.exec(s);
      expect(m, `the harness cannot parse aeon's ${name} wording, and it THROWS on no-match`)
        .not.toBeNull();
      expect([Number(m![1]), Number(m![2])]).toEqual([2, 256]);
    }
    expect(re.exec(UNKNOWN_SENTENCE)).toBeNull();
  });
});
