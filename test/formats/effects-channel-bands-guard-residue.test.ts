// GUARD-SEAT-RESIDUE, `channel-bands.ts`: the guards nothing ever handed a bad
// document.
//
// ═══ WHY EVERY ROW BELOW RE-IMPORTS THE MODULE ═══
//
// `src/core/formats/effects/channel-bands.ts` is almost entirely MODULE-LOAD
// DERIVATION over a vendored sidecar. Its refusals are `fail()`, which throws
// while the module is being evaluated, so with the real
// `aeon-effects-channel-bands.json` on disk NOT ONE of them can fire. A plant
// batch measured that directly: 30 mutations that disabled or loosened a
// load-time guard, and 28 of them left the whole suite green. The two that did
// not are the travel-formula regex, held by
// `test/formats/effects-channel-bands-prose-repin.test.ts`, which reads the
// module's SOURCE TEXT rather than running it.
//
// So the instrument has to be a POISONED SIDECAR AND A RE-IMPORT. That is the
// shape `test/formats/effects-preset-boundary.test.ts` established for the
// preset schema's prose, and these rows follow it rather than inventing a
// second one: mock the JSON module, `vi.resetModules()`, `await import` the
// codec against the poison, and read what came back.
//
// ⚠ AND EVERY ROW ASSERTS THE GUARD'S OWN SENTENCE, NOT MERELY THAT IT THREW.
// Sixteen of these guards refuse a document for sixteen different reasons and
// each names a different repair: re-vendor, fix aeon's generator, rewrite the
// warning text. A row asserting only that the module threw would pass with the
// wrong guard firing, and it would send an author to re-read the wrong
// sentence. The plant batch found the words half of this module completely
// unheld: NINE mutations that changed which sentence a refusal speaks, or which
// field it names, and every single one survived.
//
// ⚠ WHAT A GREEN SUITE LOOKS LIKE WHEN ONE OF THESE GUARDS IS WRONG, measured
// rather than argued: six plants made the module throw at load, and each one
// produced 127 failure records across 63 test files with ZERO assertion
// failures among them. Sixty-three collection errors are ONE finding wearing a
// big number, and not one of the rows in them says anything about this
// contract. That is the state these rows exist to replace.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(__dirname, '../../src/core/formats/effects');
const BANDS_JSON = resolve(DIR, 'aeon-effects-channel-bands.json');
const BANDS_MODULE = resolve(DIR, 'channel-bands');
const PRESET_MODULE = resolve(DIR, 'preset');

type Channel = { lo: number; hi: number; lines: number; source: string };
type Edge = { behaviour: string; note: string; engine?: string };
type Doc = {
  schema: unknown; game: unknown; units: unknown; how_to_use: unknown;
  channels: Record<string, Channel>;
  edges: Record<string, Edge>;
};
type Module = typeof import('../../src/core/formats/effects/channel-bands');
type Rung = { amp_shift: number; peak_px: number; peak_to_peak_px: number };

/** The bytes the app actually imports, re-read per row so nothing is retyped. */
function realDoc(): Doc {
  return JSON.parse(readFileSync(BANDS_JSON, 'utf8')) as Doc;
}

/**
 * Load `channel-bands.ts` against a document of the caller's choosing, and
 * optionally against an amplitude ladder of the caller's choosing.
 *
 * Returns the module when it loaded and the Error when it refused, so a row can
 * assert EITHER outcome. Both are used below: a poison that fails to refuse is
 * as much a finding as one that refuses with the wrong words.
 */
async function loadWith(
  doc: unknown, rungs?: readonly Rung[],
): Promise<{ mod: Module | null; err: Error | null }> {
  vi.resetModules();
  vi.doMock(BANDS_JSON, () => ({ default: doc }));
  if (rungs !== undefined) {
    const real = await vi.importActual<typeof import('../../src/core/formats/effects/preset')>(
      '../../src/core/formats/effects/preset',
    );
    vi.doMock(PRESET_MODULE, () => ({ ...real, ANCHOR_AMP_RUNGS: rungs }));
  }
  try {
    return { mod: await import(BANDS_MODULE) as Module, err: null };
  } catch (e) {
    return { mod: null, err: e as Error };
  }
}

/** The refusal a poison earned, or a failure naming what happened instead. */
async function refusal(doc: unknown, rungs?: readonly Rung[]): Promise<string> {
  const { mod, err } = await loadWith(doc, rungs);
  expect(err, 'the poisoned document LOADED. The guard this row is about has stopped refusing, '
    + `and the module handed back a live map of ${String(mod?.EFFECTS_CHANNEL_BANDS.size)} `
    + 'channel(s) built from a document it should have thrown on')
    .not.toBeNull();
  return err!.message;
}

afterEach(() => {
  vi.doUnmock(BANDS_JSON);
  vi.doUnmock(PRESET_MODULE);
  vi.resetModules();
});

// ═══════════════════════════════════════════════════════════════════════════
// A. THE HARNESS, BEFORE ANYTHING RESTS ON IT
// ═══════════════════════════════════════════════════════════════════════════
describe('the poison harness can produce a GREEN, so a red below is the poison', () => {
  it('ANTI-VACUOUS: the REAL vendored document loads through the same harness', async () => {
    // Without this row every assertion in the file could be passing because the
    // harness itself cannot load the module at all, and a suite of refusals
    // that refuse everything measures nothing.
    const { mod, err } = await loadWith(realDoc());
    expect(err, `the harness cannot load the REAL document: ${String(err?.message)}`).toBeNull();
    expect(mod!.EFFECTS_CHANNEL_BANDS_GAME).toBe('sonic4');
    expect([...mod!.EFFECTS_CHANNEL_BANDS.keys()].sort((a, b) => a - b))
      .toEqual(Object.keys(realDoc().channels).map(Number).sort((a, b) => a - b));
  });

  it('ANTI-VACUOUS: the mock really takes, so a poisoned leaf reaches the module', async () => {
    // A `vi.doMock` that silently failed to intercept would let every row below
    // read the real document and pass. Proven by changing a leaf the module
    // carries through to an export.
    const doc = realDoc();
    doc.game = 'not-sonic4';
    const { mod, err } = await loadWith(doc);
    expect(err).toBeNull();
    expect(mod!.EFFECTS_CHANNEL_BANDS_GAME).toBe('not-sonic4');
  });

  it('every refusal names the file and tells the reader not to trust the warning', async () => {
    const doc = realDoc();
    doc.schema = 'aeon-effects-channel-bands/2';
    const m = await refusal(doc);
    // The lead names the artifact AND its provenance sidecar, because the
    // repair is a re-vendor and the sidecar carries the command for it.
    expect(m).toContain('aeon-effects-channel-bands.json');
    expect(m).toContain('.provenance.json');
    // And the consequence, which is the half a reader acts on.
    expect(m).toContain('Re-read the file before trusting the band warning under the Travel select');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. THE DOCUMENT'S IDENTITY
// ═══════════════════════════════════════════════════════════════════════════
describe('the vendored document must be the schema this module can read', () => {
  it('another schema version is REFUSED, and the refusal names both versions', async () => {
    for (const wrong of ['aeon-effects-channel-bands/2', 'aeon-effects-channel-bands/0', 1, null]) {
      const doc = realDoc();
      doc.schema = wrong;
      const m = await refusal(doc);
      expect(m, `schema ${JSON.stringify(wrong)} was refused with the wrong sentence`)
        .toContain('declares schema');
      expect(m).toContain(JSON.stringify(wrong));
      expect(m).toContain('not "aeon-effects-channel-bands/1"');
    }
  });

  it('...and the other direction: the schema it DOES declare loads', async () => {
    const doc = realDoc();
    expect(doc.schema).toBe('aeon-effects-channel-bands/1');
    expect((await loadWith(doc)).err).toBeNull();
  });

  it('an EMPTY prose leaf is refused, and the refusal names WHICH leaf', async () => {
    // The emptiness half of `prose()`, and the half that says which key moved.
    // A wrong name here sends a reader to re-read the wrong sentence of a
    // document whose whole value is its sentences.
    for (const key of ['units', 'how_to_use'] as const) {
      const doc = realDoc();
      doc[key] = '';
      const m = await refusal(doc);
      expect(m).toContain(`no longer carries a "${key}" string`);
      const other = key === 'units' ? 'how_to_use' : 'units';
      expect(m, 'the refusal named the OTHER prose leaf').not.toContain(`"${other}" string`);
    }
  });

  it('a non-string prose leaf is refused the same way', async () => {
    const doc = realDoc();
    doc.units = 42;
    expect(await refusal(doc)).toContain('no longer carries a "units" string');
  });

  it('an EMPTY or non-string `game` is refused', async () => {
    for (const bad of ['', 0, null]) {
      const doc = realDoc();
      doc.game = bad;
      expect(await refusal(doc), `game ${JSON.stringify(bad)} was accepted or misreported`)
        .toContain('no longer names the `game` its bands belong to');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. THE PROSE INTERLOCKS, EACH IN ITS OWN WORDS
// ═══════════════════════════════════════════════════════════════════════════
describe('the sentences the warning is computed from are pinned, one guard at a time', () => {
  /** `units` with one of its two required clauses removed and the other kept. */
  function unitsMissing(clause: string): Doc {
    const doc = realDoc();
    const units = String(doc.units);
    expect(units, `the vendored units sentence no longer contains ${JSON.stringify(clause)}: `
      + 'this fixture is built by deletion, so rebuild it rather than deleting the row')
      .toContain(clause);
    doc.units = units.replace(clause, '');
    return doc;
  }

  /** `how_to_use` with one clause removed and everything else kept. */
  function howMissing(clause: string): Doc {
    const doc = realDoc();
    const how = String(doc.how_to_use);
    expect(how, `the vendored how_to_use no longer contains ${JSON.stringify(clause)}`)
      .toContain(clause);
    doc.how_to_use = how.replace(clause, '');
    return doc;
  }

  it('BOTH units clauses are required, each on its own', async () => {
    // The two clauses are joined with `||`, so either one going missing must
    // refuse. Tested from both sides, because a guard that only ever fires one
    // way has not been shown to be a rule: an `&&` here would pass both of
    // these singly and only refuse a document that lost both at once.
    const noScreenLines = unitsMissing('SCREEN LINES, 1:1 with the authored patchable(lo:, hi:)');
    expect(String(noScreenLines.units), 'the OTHER clause was collaterally removed, so this row '
      + 'cannot tell the two apart').toContain('Do not convert.');
    expect(await refusal(noScreenLines)).toContain('no longer states that its numbers are SCREEN LINES');

    const noDoNotConvert = unitsMissing('Do not convert.');
    expect(String(noDoNotConvert.units)).toContain('SCREEN LINES, 1:1 with the authored');
    expect(await refusal(noDoNotConvert)).toContain('they must not be converted');
  });

  it('...and the other direction: the units sentence as vendored loads', async () => {
    expect((await loadWith(realDoc())).err).toBeNull();
  });

  it('the CERTAIN-REFUSAL clause is pinned', async () => {
    const m = await refusal(howMissing('travel > lines is a CERTAIN refusal'));
    expect(m).toContain('no longer says that travel > lines is a CERTAIN refusal');
    expect(m).toContain('the only thing Aurora warns on');
  });

  it('the NEVER-A-CLEARANCE clause is pinned WHOLE, not just its first half', async () => {
    // ⚠ THE ONE THE TYPE LEVEL RESTS ON. `AnchorBandFit` has no `fits` member
    // because this sentence says there can never be one. A guard narrowed to
    // `CANNOT TELL` alone would accept a document that had dropped the words
    // doing the work, so the clause is checked entire and both halves are
    // measured as load-bearing.
    const whole = await refusal(howMissing('travel <= lines is CANNOT TELL, never a clearance'));
    expect(whole).toContain('no longer says that travel <= lines is CANNOT TELL and never a clearance');
    expect(whole).toContain('`AnchorBandFit` can grow a `fits` arm');

    const half = realDoc();
    half.how_to_use = String(half.how_to_use)
      .replace('travel <= lines is CANNOT TELL, never a clearance',
        'travel <= lines is CANNOT TELL and probably fine');
    expect(String(half.how_to_use), 'the fixture did not keep the words it exists to keep')
      .toContain('travel <= lines is CANNOT TELL');
    expect(await refusal(half), 'a document that kept `CANNOT TELL` and DROPPED `never a '
      + 'clearance` was accepted. That is the clearance-shaped regression aeon retired at '
      + 'b8913cda, and it is the one wording this module must not load')
      .toContain('no longer says that travel <= lines is CANNOT TELL and never a clearance');
  });

  it('the INCLUSIVE-COUNT clause is pinned, and it is what makes travel == lines legal', async () => {
    const m = await refusal(howMissing('`lines` is an INCLUSIVE COUNT of lines in [lo, hi]'));
    expect(m).toContain('no longer says that `lines` is an INCLUSIVE COUNT over [lo, hi]');
    expect(m).toContain('travel == lines the widest sweep');
  });

  it('CENSUS: the five prose guards speak five DIFFERENT sentences', async () => {
    // ⚠ THE ROW THE WORDS HALF NEEDS. Each guard names a different thing to
    // re-read. If two of them shared a sentence, a poison of one would pass a
    // row written for the other and nobody could tell from the message which
    // clause had actually moved. Derived by running all five rather than read.
    const messages = [
      await refusal(unitsMissing('SCREEN LINES, 1:1 with the authored patchable(lo:, hi:)')),
      await refusal(unitsMissing('Do not convert.')),
      await refusal(howMissing('travel > lines is a CERTAIN refusal')),
      await refusal(howMissing('travel <= lines is CANNOT TELL, never a clearance')),
      await refusal(howMissing('`lines` is an INCLUSIVE COUNT of lines in [lo, hi]')),
    ];
    // The two units clauses share one refusal by design, so four distinct
    // sentences over five guards is the correct census and not a near miss.
    expect(messages[0]).toBe(messages[1]);
    expect(new Set(messages).size,
      `the prose guards no longer speak distinct sentences: ${JSON.stringify(messages)}`)
      .toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. THE TRAVEL FORMULA, READ OUT OF THE CONTRACT
// ═══════════════════════════════════════════════════════════════════════════
describe('the numbers parsed out of the fit sentence are checked, not trusted', () => {
  /** `how_to_use` restated with a different multiplier and base. */
  function withFormula(multiplier: string, base: string): Doc {
    const doc = realDoc();
    const how = String(doc.how_to_use);
    const from = '(2 * (256 >> amp_shift), whole pixels)';
    expect(how, 'the vendored formula no longer has the shape this fixture rewrites')
      .toContain(from);
    doc.how_to_use = how.replace(from, `(${multiplier} * (${base} >> amp_shift), whole pixels)`);
    return doc;
  }

  it('a stated multiplier of ZERO is refused, and the refusal quotes it', async () => {
    const m = await refusal(withFormula('0', '256'));
    expect(m).toContain('states a travel multiplier of 0');
  });

  it('a stated base of ZERO is refused, and the refusal quotes it', async () => {
    const m = await refusal(withFormula('2', '0'));
    expect(m).toContain('states an amplitude base of 0');
  });

  it('the two refusals are told apart: one blames the multiplier, one the base', async () => {
    // The multiplier is the number aeon got wrong, permissively, before
    // 8d217dd4, so a message that blamed the base for a bad multiplier would
    // point the repair at the half that was right.
    const bad2 = await refusal(withFormula('0', '256'));
    const badBase = await refusal(withFormula('2', '0'));
    expect(bad2).not.toContain('amplitude base');
    expect(badBase).not.toContain('travel multiplier');
  });

  it('...and the other direction: a DIFFERENT but legal formula is carried through', async () => {
    // Not merely "the vendored numbers load": the two captures are really read
    // out of the sentence rather than remembered. A ladder that agrees with the
    // restated formula is supplied so the interlock does not fire first.
    const doc = withFormula('4', '128');
    const rungs: Rung[] = [2, 3, 4].map((amp_shift) => ({
      amp_shift, peak_px: 128 >> amp_shift, peak_to_peak_px: 4 * (128 >> amp_shift),
    }));
    const { mod, err } = await loadWith(doc, rungs);
    expect(err, `a legal restatement of the formula was refused: ${String(err?.message)}`)
      .toBeNull();
    expect(mod!.anchorTravelPx(3)).toBe(4 * (128 >> 3));
  });

  it('the travel is multiplier TIMES a shifted base, not a shifted product', async () => {
    // ⚠ THIS IS NOT AN ALGEBRAIC NICETY. The two spellings agree on every rung
    // the preset schema declares and part company below the ladder's floor,
    // where a shifted product keeps a bit the contract's own formula loses.
    // `boundary.ts` reaches `anchorTravelPx` with any integer `amp_shift` a
    // document carries, so the disagreement is reachable from a document and
    // the contract's spelling is the one that must win.
    const { mod, err } = await loadWith(realDoc());
    expect(err).toBeNull();
    const m = mod!;
    const deep = 9;
    expect(2 * (256 >> deep), 'the fixture no longer separates the two spellings')
      .not.toBe((2 * 256) >> deep);
    expect(m.anchorTravelPx(deep)).toBe(2 * (256 >> deep));
  });

  it('PRECONDITION: the parsed base is POSITIVE, which is why the shift is unsigned-safe', async () => {
    // ⚠ WHY THIS ROW EXISTS RATHER THAN A MUTATION ROW. Replacing `>>` with
    // `>>>` in `anchorTravelPx` is the one plant in this parcel that provably
    // cannot discriminate: the two operators differ only on a NEGATIVE left
    // operand. `TRAVEL.base` cannot be negative twice over, and both halves are
    // asserted below rather than argued: the sentence is parsed with a `\d+`
    // capture, so no sign can survive it, and the load-time guard rules out the
    // one remaining value, zero. If either ever stops holding, the claim
    // "that plant is a control" stops being true and this row is what says so.
    const doc = realDoc();
    const m = /\((\d+) \* \((\d+) >> amp_shift\), whole pixels\)/.exec(String(doc.how_to_use));
    expect(m, 'the vendored sentence no longer states the formula this precondition is about')
      .not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(0);
    expect(Number(m![2])).toBeGreaterThan(0);
    // And the guard that keeps it that way is live, in both directions.
    const doc0 = realDoc();
    doc0.how_to_use = String(doc0.how_to_use)
      .replace('(2 * (256 >> amp_shift)', '(2 * (0 >> amp_shift)');
    expect(await refusal(doc0)).toContain('states an amplitude base of 0');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. THE LADDER INTERLOCK, WHICH COMPARES TWO REPOS' DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════
describe('the preset schema ladder and aeon fit formula are compared at load', () => {
  it('an EMPTY amplitude ladder is itself a refusal', async () => {
    // A ladder with no rungs makes the disagreement census vacuously empty, so
    // the interlock would pass by having nothing to compare. That is the shape
    // where a derivation returning nothing looks exactly like agreement.
    expect(await refusal(realDoc(), []))
      .toContain('was checked against an EMPTY amplitude ladder');
  });

  it('ONE disagreeing rung is enough, and the refusal names WHICH rung', async () => {
    const real = realDoc();
    const rungs: Rung[] = [2, 3, 4].map((amp_shift) => ({
      amp_shift, peak_px: 256 >> amp_shift, peak_to_peak_px: 2 * (256 >> amp_shift),
    }));
    // Exactly one rung moved, and by a value nothing else in the set carries.
    const poisoned = rungs.map((r) => (r.amp_shift === 3 ? { ...r, peak_to_peak_px: 999 } : r));
    const m = await refusal(real, poisoned);
    expect(m).toContain("disagrees with the preset schema's amplitude ladder");
    expect(m, 'the refusal does not say which rung disagrees, so the reader has to diff two '
      + 'documents by hand to find out').toContain('amp_shift 3:');
    expect(m).not.toContain('amp_shift 2:');
    expect(m).not.toContain('amp_shift 4:');
  });

  it('...and it puts each number beside the document that states it', async () => {
    // ⚠ A MESSAGE ONE QUANTITY OVER SENDS THE REPAIR TO THE WRONG REPO. The
    // two sides are amended by two different teams, so a swapped pair reads as
    // aeon having moved when the preset schema did.
    const rungs: Rung[] = [{ amp_shift: 4, peak_px: 16, peak_to_peak_px: 999 }];
    const m = await refusal(realDoc(), rungs);
    expect(m).toContain("the preset schema's ladder says 999 px");
    expect(m).toContain("aeon's fit formula says 32 px");
  });

  it('...and the other direction: a ladder that AGREES loads', async () => {
    const rungs: Rung[] = [2, 3, 4, 5, 6, 7, 8].map((amp_shift) => ({
      amp_shift, peak_px: 256 >> amp_shift, peak_to_peak_px: 2 * (256 >> amp_shift),
    }));
    expect((await loadWith(realDoc(), rungs)).err).toBeNull();
  });

  it('the interlock RUNS: it is called at load, not merely declared', async () => {
    // The three rows above are what proves the call site is live. This one says
    // so in a place a reader will look, and it fails for the same reason they
    // would if the call were ever deleted.
    const rungs: Rung[] = [{ amp_shift: 2, peak_px: 64, peak_to_peak_px: 1 }];
    expect((await loadWith(realDoc(), rungs)).err,
      'a disagreeing ladder loaded silently. `assertLadderAgreesWithContract()` is declared and '
      + 'never invoked, so the two documents are no longer compared at all')
      .not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. THE CHANNELS LOADER
// ═══════════════════════════════════════════════════════════════════════════
describe('every channel record is checked, and each refusal names its own defect', () => {
  /** The real document with channel `0`'s record altered. */
  function ch0(patch: Record<string, unknown>): Doc {
    const doc = realDoc();
    doc.channels['0'] = { ...doc.channels['0'], ...patch } as Channel;
    return doc;
  }

  it('a `channels` that is not an object is refused in the module OWN words', async () => {
    // ⚠ `typeof null === 'object'`, so without the null arm this falls through
    // to `Object.entries(null)` and the reader gets a raw TypeError from the
    // standard library instead of a sentence naming the file and the repair.
    for (const bad of [null, undefined, 'channels', 7]) {
      const doc = realDoc();
      (doc as { channels: unknown }).channels = bad;
      const m = await refusal(doc);
      expect(m, `channels ${JSON.stringify(bad)} produced the wrong refusal`)
        .toContain('no longer carries a `channels` object');
      expect(m, 'the reader got a standard-library error rather than this module refusal')
        .toContain('aeon-effects-channel-bands.json');
    }
  });

  it('a key that is not a plain index is refused, and the refusal quotes the key', async () => {
    for (const key of ['0a', '-1', '1.5', ' 1', '', '0x1']) {
      const doc = realDoc();
      doc.channels = { [key]: { lo: 3, hi: 4, lines: 2, source: 'x' } };
      const m = await refusal(doc);
      expect(m, `channel key ${JSON.stringify(key)} was accepted`)
        .toContain('that is not an index');
      expect(m).toContain(JSON.stringify(key));
    }
  });

  it('...and the other direction: plain decimal indices are accepted', async () => {
    const doc = realDoc();
    doc.channels = { 0: { lo: 3, hi: 4, lines: 2, source: 'x' }, 12: { lo: 3, hi: 3, lines: 1, source: 'y' } };
    const { mod, err } = await loadWith(doc);
    expect(err, String(err?.message)).toBeNull();
    expect([...mod!.EFFECTS_CHANNEL_BANDS.keys()]).toEqual([0, 12]);
  });

  it('a non-integer lo, hi or lines is refused, and the refusal names WHICH field', async () => {
    // ⚠ THE `lines` CASE IS THE POINT. A non-integer `lines` would also fail
    // the inclusive-count check one line further down, with a completely
    // different sentence pointing at a completely different repair: "aeon
    // counts some other way" instead of "aeon emitted a non-number". Dropping
    // `lines` from the integer census therefore changes no verdict at all and
    // only changes the words, which is precisely the class nothing here held.
    for (const [field, value] of [['lo', 3.5], ['hi', '220'], ['lines', '218']] as const) {
      const m = await refusal(ch0({ [field]: value }));
      expect(m, `a non-integer ${field} was accepted or misreported`)
        .toContain(`channel 0 no longer declares an integer \`${field}\``);
    }
  });

  it('hi < lo is refused with its OWN sentence, not the inclusive-count one', async () => {
    // The pair is inconsistent in two ways at once and the guards run in order.
    // A reader told "your count is wrong" would go and fix the count, which is
    // the one number in the record that is right.
    const m = await refusal(ch0({ lo: 221, hi: 220, lines: 0 }));
    expect(m).toContain('channel 0 declares hi < lo');
    expect(m).not.toContain('INCLUSIVE count over that range');
  });

  it('a `lines` that is not the inclusive count is refused, and the count is REPORTED', async () => {
    // The number in the message is what a reader compares against aeon
    // generator. A message that recomputed it the same wrong way the generator
    // did would agree with the defect and read as noise.
    const m = await refusal(ch0({ lines: 217 }));
    expect(m).toContain('channel 0 declares lines 217 for the band [3, 220]');
    expect(m).toContain('but an INCLUSIVE count over that range is 218');
  });

  it('...and the other direction: the inclusive count as vendored is accepted', async () => {
    const { mod, err } = await loadWith(ch0({ lo: 10, hi: 10, lines: 1 }));
    expect(err, String(err?.message)).toBeNull();
    expect(mod!.EFFECTS_CHANNEL_BANDS.get(0)!.lines).toBe(1);
  });

  it('a channel that does not name its source is refused', async () => {
    for (const source of ['', 0, null]) {
      expect(await refusal(ch0({ source })), `source ${JSON.stringify(source)} was accepted`)
        .toContain('channel 0 no longer names the source line it is declared on');
    }
  });

  it('a document declaring NO channels at all is refused', async () => {
    // Not a hypothetical: this is what an aeon generator that stopped emitting
    // the section would produce, and an empty map makes every band lookup
    // return `no-band`, which the panel reports as "nothing is known" rather
    // than as a broken document.
    const doc = realDoc();
    doc.channels = {};
    expect(await refusal(doc)).toContain('declares no channels at all');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. THE EDGES, WHICH ARE ASYMMETRIC AND MUST STAY TOLD APART
// ═══════════════════════════════════════════════════════════════════════════
describe('the two edge records are pinned separately, in their own words', () => {
  function edge(which: 'lo' | 'hi', patch: Partial<Edge> | null): Doc {
    const doc = realDoc();
    if (patch === null) delete doc.edges[which];
    else doc.edges[which] = { ...doc.edges[which], ...patch };
    return doc;
  }

  it('a changed behaviour word is refused, and the refusal quotes BOTH words', async () => {
    const hi = await refusal(edge('hi', { behaviour: 'clip' }));
    expect(hi).toContain('says the `hi` edge now behaves as "clip", not "drop"');
    expect(hi).toContain('it must be rewritten, not re-pointed');

    const lo = await refusal(edge('lo', { behaviour: 'drop' }));
    expect(lo).toContain('says the `lo` edge now behaves as "drop", not "clamp_up"');
  });

  it('a MISSING edge record names WHICH edge is missing, in both directions', async () => {
    expect(await refusal(edge('hi', null)))
      .toContain('no longer describes what happens at the `hi` edge');
    expect(await refusal(edge('lo', null)))
      .toContain('no longer describes what happens at the `lo` edge');
  });

  it('...and so does a note that lost a pinned phrase', async () => {
    // ⚠ BOTH PHRASES ON BOTH NOTES, because the asymmetry is the whole content
    // of this pair: past hi the record is NOT EMITTED and does NOT pin to hi,
    // below lo it IS emitted, clamped up, and stays visible. Each note carries
    // two clauses and losing either one leaves a note that still reads
    // plausibly and no longer says the thing the panel sentence is built on.
    const hiPinned = await refusal(edge('hi', { behaviour: 'drop', note: 'Past hi the record is NOT EMITTED this frame.' }));
    expect(hiPinned, 'the hi note lost `does NOT pin to hi` and was accepted')
      .toContain('`edges.hi.note` no longer says');
    expect(hiPinned).toContain('does NOT pin to hi');
    expect(hiPinned, 'the refusal blamed the wrong edge').not.toContain('`edges.lo.note`');

    const loPinned = await refusal(edge('lo', { behaviour: 'clamp_up', note: 'Below lo the record IS still emitted, clamped UP to lo.' }));
    expect(loPinned, 'the lo note lost `stays visible` and was accepted')
      .toContain('`edges.lo.note` no longer says');
    expect(loPinned).toContain('stays visible');
    expect(loPinned, 'the refusal blamed the wrong edge').not.toContain('`edges.hi.note`');

    const hiFirst = await refusal(edge('hi', { note: 'It does NOT pin to hi, and that is all.' }));
    expect(hiFirst).toContain('NOT EMITTED');

    const loFirst = await refusal(edge('lo', { note: 'The boundary stays visible.' }));
    expect(loFirst).toContain('clamped UP to lo');
  });

  it('...and the other direction: each edge as vendored is carried through verbatim', async () => {
    const { mod, err } = await loadWith(realDoc());
    expect(err).toBeNull();
    const doc = realDoc();
    expect(mod!.EFFECTS_CHANNEL_BAND_EDGE_HI.behaviour).toBe('drop');
    expect(mod!.EFFECTS_CHANNEL_BAND_EDGE_HI.note).toBe(doc.edges.hi.note);
    expect(mod!.EFFECTS_CHANNEL_BAND_EDGE_LO.behaviour).toBe('clamp_up');
    expect(mod!.EFFECTS_CHANNEL_BAND_EDGE_LO.note).toBe(doc.edges.lo.note);
    // And the two really are different records, so a module reading one edge
    // twice cannot pass the pair above.
    expect(mod!.EFFECTS_CHANNEL_BAND_EDGE_HI.note)
      .not.toBe(mod!.EFFECTS_CHANNEL_BAND_EDGE_LO.note);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H. WHAT THE MODULE HANDS BACK FROM A GOOD DOCUMENT
// ═══════════════════════════════════════════════════════════════════════════
describe('the values built from a good document', () => {
  it('the declared list is ASCENDING, not merely the right set', async () => {
    // It is published as "the channels aeon declares a band for, ascending" and
    // read straight into a sentence an author sees, so the ORDER is part of the
    // claim and reversing the comparator left the whole suite green.
    const doc = realDoc();
    doc.channels = {
      3: { lo: 162, hi: 223, lines: 62, source: 'a' },
      0: { lo: 3, hi: 220, lines: 218, source: 'b' },
      12: { lo: 1, hi: 2, lines: 2, source: 'c' },
      2: { lo: 3, hi: 160, lines: 158, source: 'd' },
    };
    const { mod, err } = await loadWith(doc);
    expect(err, String(err?.message)).toBeNull();
    // Insertion order is deliberately NOT ascending, so a list that merely
    // echoed the document would fail this and a sorted one passes.
    expect(mod!.EFFECTS_CHANNEL_BANDS_DECLARED).toEqual([0, 2, 3, 12]);
    // Two digits after one digit: a lexical sort would put 12 second.
    expect(mod!.EFFECTS_CHANNEL_BANDS_DECLARED[3]).toBe(12);
  });

  it('a verdict names the band OWN channel, on both arms and every channel', async () => {
    const { mod, err } = await loadWith(realDoc());
    expect(err).toBeNull();
    const m = mod!;
    let sawFit = 0;
    let sawTell = 0;
    for (const c of m.EFFECTS_CHANNEL_BANDS_DECLARED) {
      const band = m.EFFECTS_CHANNEL_BANDS.get(c)!;
      const over = m.anchorBandFit(c, band.lines + 1);
      const under = m.anchorBandFit(c, band.lines);
      expect(over.verdict).toBe('cannot-fit');
      expect(under.verdict).toBe('cannot-tell');
      expect(over.channel, `the cannot-fit verdict on channel ${c} named channel ${over.channel}`)
        .toBe(c);
      expect(under.channel, `the cannot-tell verdict on channel ${c} named channel ${under.channel}`)
        .toBe(c);
      sawFit += 1;
      sawTell += 1;
    }
    // Anti-vacuous: the loop really ran on more than one channel, so a verdict
    // hardcoded to any single index cannot pass it.
    expect(sawFit).toBeGreaterThan(1);
    expect(sawTell).toBeGreaterThan(1);
    expect(m.EFFECTS_CHANNEL_BANDS_DECLARED).not.toEqual([0]);
  });

  it('a document band refuses a non-integer end, and hi one BELOW lo', async () => {
    const { mod, err } = await loadWith(realDoc());
    expect(err).toBeNull();
    const f = mod!.effectsChannelBandFromDocument;
    expect(f(0, 3.5, 220, 'doc')).toBeNull();
    expect(f(0, 3, 220.5, 'doc')).toBeNull();
    expect(f(0, Number.NaN, 220, 'doc')).toBeNull();
    // ⚠ THE EDGE THE PLANT BATCH FOUND OPEN. `hi === lo - 1` is the FIRST
    // inverted pair, and a bound loosened by one lets exactly it through, where
    // it makes a band of zero lines that refuses every sweep including a zero
    // one. Both sides of the bound are asserted so the guard is a rule.
    expect(f(0, 10, 9, 'doc'), 'hi one below lo built a band instead of returning null')
      .toBeNull();
    expect(f(0, 10, 8, 'doc')).toBeNull();
    const flat = f(0, 10, 10, 'doc');
    expect(flat, 'hi === lo is a legal one-line band and must NOT be refused').not.toBeNull();
    expect(flat!.lines).toBe(1);
    expect(f(0, 10, 11, 'doc')!.lines).toBe(2);
  });

  it('nothing the module hands out can be mutated by a caller', async () => {
    // The band records are module singletons: `anchorBandFit` returns the same
    // object to every caller and the panel puts it in a sentence. A caller that
    // could write to one would move the band for everybody, for the life of the
    // process, with no other trace.
    const { mod, err } = await loadWith(realDoc());
    expect(err).toBeNull();
    const m = mod!;
    const band = m.EFFECTS_CHANNEL_BANDS.get(m.EFFECTS_CHANNEL_BANDS_DECLARED[0])!;
    expect(Object.isFrozen(band), 'a vendored band record is mutable').toBe(true);
    expect(Object.isFrozen(m.EFFECTS_CHANNEL_BANDS_DECLARED),
      'the declared channel list is mutable').toBe(true);
    expect(Object.isFrozen(m.EFFECTS_CHANNEL_BAND_EDGE_HI), 'the hi edge record is mutable')
      .toBe(true);
    expect(Object.isFrozen(m.EFFECTS_CHANNEL_BAND_EDGE_LO), 'the lo edge record is mutable')
      .toBe(true);
    expect(Object.isFrozen(m.effectsChannelBandFromDocument(0, 3, 10, 'doc')!),
      'a band built from a document is mutable').toBe(true);
    // Anti-vacuous: `Object.isFrozen` really can answer false here, so the five
    // assertions above are not five readings of a value that is true of
    // everything.
    expect(Object.isFrozen({ ...band })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// I. THE ONE PROPERTY NO BEHAVIOURAL ROW CAN REACH
// ═══════════════════════════════════════════════════════════════════════════
describe('`AnchorBandFit` has no clearance arm, at the type level', () => {
  /**
   * ⚠ WHY THIS ROW READS SOURCE TEXT, AND WHEN TO RETIRE IT.
   *
   * The module header's headline claim is that a reassuring "fits" verdict is
   * UNREPRESENTABLE rather than merely unwritten, because a comment saying "do
   * not add a pass" is one `||` away from being ignored. The RUN-TIME half of
   * that is already held: adding a `fits` arm AND returning it reddens three
   * rows in `src/renderer/providers/__tests__/effects-preset-anchors.test.ts`
   * and one in `test/formats/effects-preset-boundary.test.ts`, measured with
   * that exact mutation on disk.
   *
   * The TYPE-LEVEL half is not, and cannot be. Adding the arm to the union and
   * returning it from nowhere left the entire suite green: no consumer switches
   * exhaustively on `verdict`, so an unreturned arm changes no value anywhere.
   * The failure is unobservable from behaviour in the current state, which
   * makes the source text the honest instrument and not a lazy one.
   *
   * RETIRE THIS ROW when either becomes true, and do not carry it further:
   *   1. a consumer switches exhaustively over `AnchorBandFit['verdict']`, at
   *      which point tsc holds the property and this row is noise; or
   *   2. aeon amends `how_to_use` to state a fit direction, at which point the
   *      arm is legitimate and the module load guards refuse the old wording
   *      anyway.
   */
  it('the union declares exactly the three verdicts the contract can support', () => {
    const src = readFileSync(resolve(DIR, 'channel-bands.ts'), 'utf8');
    const decl = /export type AnchorBandFit =([\s\S]*?);\n/.exec(src);
    expect(decl, 'the `AnchorBandFit` declaration has moved or been renamed: re-point this row '
      + 'rather than deleting it, or retire it for one of the two reasons in this block')
      .not.toBeNull();
    const verdicts = [...decl![1].matchAll(/verdict: '([a-z-]+)'/g)].map((m) => m[1]);
    expect(verdicts, 'the verdict arms of `AnchorBandFit` are no longer the three the '
      + 'one-directional contract can support')
      .toEqual(['no-band', 'cannot-tell', 'cannot-fit']);
    // And the negative said in its own words, because the list above could be
    // reordered into passing while carrying a fourth.
    expect(verdicts).not.toContain('fits');
    expect(verdicts).toHaveLength(3);
  });
});
