// THE SENTENCE THAT SHIPS AND THE FILE IT IS ABOUT, CHECKED AGAINST EACH OTHER.
//
// ═══ WHY THIS FILE EXISTS — the 2026-09-10 finding, in one paragraph ═══
//
// `RASTER_SECTION_BINDING_LIMIT` is not a comment. It is published to a person
// and to an agent in four places: the band-preset panel's limit block, the
// `assign_section_preset` reply, and the `set_effects_preset` and
// `assign_section_preset` MCP tool descriptions. Until today it said, in
// capitals, *"ONLY SECTION 5 IS WIRED"*. aeon threaded a SECOND section on
// 2026-09-03 (`6ae88363`, arrived in this machine's checkout 16:47:34 -0400)
// and the sentence went on being published for seven days.
//
// THE PART WORTH KEEPING IS WHY. It was not that no gate existed. Aurora's own
// `effects/__tests__/section-wiring.test.ts` derives the same set from aeon's
// real file, went RED on that landing, and was re-pinned to `[5, 6]` at aurora
// `49dc5827` — thirty-five minutes after the change arrived. The alarm rang, on
// time, in this repository. What did not exist was any link from that
// derivation to THIS SENTENCE. The repo held one fact twice — once derived and
// gated, once as prose — and they disagreed for a week with every check green.
//
// AND THE PROSE'S OWN GUARDS MADE IT WORSE. `band-preset-wording.test.ts` and
// `agent-handler.assign-section-preset.test.ts` asserted
// `toMatch(/ONLY SECTION 5 IS WIRED/)`. Those rows were green EXACTLY WHILE the
// sentence was false, and would have gone red on the correct repair. A wording
// test pins a STRING, not a FACT; pointed at a claim about a peer repo it is an
// anti-expiry, defending the snapshot from the correction.
//
// ═══ SO THIS FILE IS THE LINK, AND IT IS THE ONLY ROW HERE THAT MATTERS ═══
//
// The sentence now carries its reading in one canonical, machine-findable
// spelling. The rows below re-derive that reading from aeon's real file with
// THIS REPO'S OWN parser — the same `libraryRasterChooserCalls` the panel strip
// renders, so the expectation is DERIVED and not a second pin that could drift
// from the product — and refuse to let the two disagree.
//
// ⚠ LOUD ON UNMEASURABLE. With no aeon checkout these rows `ctx.skip()` with a
// reason and never pass. "aeon says {5, 6}" and "I could not open aeon" must not
// share a colour; that confusion is the one that produced the defect above.
//
// ⚠ THE COST, STATED RATHER THAN HIDDEN. These rows read a LIVE sibling working
// tree, so they go red on a change nobody in this repo made. That is the point:
// it is the alarm four dated EXPIRES blocks in `raster-binding.ts` asked for and
// never got. The alternative — a FROZEN pin, a SHA committed here — goes stale
// in SILENCE, which is the exact defect being repaired. Neither is free; this
// one fails loudly and on the right side. The precedent is on the same axis:
// `section-wiring.test.ts` already reads that live tree for the same fact, and
// it is what worked on 2026-09-03.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { RASTER_SECTION_BINDING_LIMIT } from '../raster-binding';
import { libraryRasterChooserCalls, rasterChooserName } from '../effects/section-wiring';
import { siblingPathOrUnresolved, siblingPathSource } from '../../../../test/support/sibling-root.mjs';
import { announceFixture, READ_MODES } from '../../../../scratchpad/lib/fixture-provenance.mjs';

const AEON = siblingPathOrUnresolved('aeon');
const LIB = join(AEON, 'games/sonic4/data/effects/ojz_effects.emp');
const SIDECARS = join(AEON, 'games/sonic4/data/editor/ojz/act1');
const haveLib = existsSync(LIB);
const haveSidecars = existsSync(SIDECARS);

/**
 * WHICH AEON THIS RUN READ, printed before the rows that read it — the same
 * stamp `section-wiring.test.ts` carries, and for its reason: these rows open
 * aeon's files BY PATH, so their colour is decided by whatever that lane has on
 * disk, and a result three weeks stale looks exactly like a fresh one.
 */
let provenance = '';
if (haveLib) {
  announceFixture(
    {
      peer: 'aeon',
      mode: READ_MODES.WORKTREE,
      dir: AEON,
      dirSource: siblingPathSource('aeon') ?? 'siblingPathOrUnresolved(\'aeon\')',
      allowUnrevisioned: true,
    },
    (s: string) => { provenance += s; },
  );
  process.stderr.write(provenance);
}

/**
 * The sentence's canonical, machine-findable reading of the wired set.
 *
 * ⚠ THE SPELLING IS THE CONTRACT between the prose and this file, so it is
 * parsed here and nowhere else. `at aeon <sha> (<date>) the wired set is {a, b}`.
 * A rewrite that keeps the fact and drops this shape fails the FIRST row below,
 * with a message saying so — never silently, which is what a regex returning
 * `null` into a comparison would do.
 */
const READING = /at aeon ([0-9a-f]{7,40}) \((\d{4}-\d{2}-\d{2})\) the wired set is \{([0-9,\s]*)\}/;

/** The set the sentence claims, or `null` if the sentence has no such clause. */
function claimedWiredSet(): { sha: string; date: string; sections: number[] } | null {
  const m = READING.exec(RASTER_SECTION_BINDING_LIMIT);
  if (m === null) return null;
  const sections = m[3].split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number);
  return { sha: m[1], date: m[2], sections: sections.sort((a, b) => a - b) };
}

/** The set aeon's file actually threads, by this repo's own parser. */
function derivedWiredSet(): number[] {
  const lib = readFileSync(LIB, 'utf8');
  const calls = libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1'));
  return [...new Set(Object.values(calls))].sort((a, b) => a - b);
}

/** The sections whose sidecar carries a `rasterRef`, read off aeon's own files. */
function derivedBoundSet(): number[] {
  const out: number[] = [];
  for (let s = 0; s < 32; s++) {
    const p = join(SIDECARS, `section_${s}.meta.json`);
    if (!existsSync(p)) continue;
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      // A sidecar this repo cannot parse is UNMEASURABLE, not absent. Surfaced
      // as a throw so the row goes red rather than quietly counting one fewer.
      throw new Error(`section_${s}.meta.json in aeon's tree is not readable JSON: `
        + 'this row cannot derive the bound set and must not report a smaller one');
    }
    const ref = (doc as Record<string, unknown> | null)?.rasterRef;
    if (typeof ref === 'string' && ref !== '') out.push(s);
  }
  return out;
}

const needLib = (ctx: { skip: (reason: string) => void }): boolean => {
  if (haveLib) return true;
  ctx.skip(`SKIPPED, NOT PASSED: no aeon effects library at ${LIB}. This row re-derives the `
    + 'wired set from aeon\'s real ojz_effects.emp and compares it to what the shipped limit '
    + 'sentence claims, and it could not open the file. Nothing was measured: the sentence may '
    + 'be right or may be as wrong as it was for the seven days this row exists to prevent.');
  return false;
};

const needSidecars = (ctx: { skip: (reason: string) => void }): boolean => {
  if (haveSidecars) return true;
  ctx.skip(`SKIPPED, NOT PASSED: no aeon sidecar directory at ${SIDECARS}. This row re-derives `
    + 'which sections carry a rasterRef and could not. Nothing was measured.');
  return false;
};

describe('the shipped raster-binding limit agrees with aeon\'s real file', () => {
  it('the run SAID which aeon it read, and that HEAD does not name the bytes', (ctx) => {
    if (!needLib(ctx)) return;
    // Without this the rows below are claims about an unnamed input, and a stale
    // reading of that input is indistinguishable from a current one.
    expect(provenance, 'these rows read aeon\'s file by path and the run printed no provenance, '
      + 'so nothing in this result says which aeon decided it').not.toBe('');
    expect(provenance).toContain('WORKING TREE');
    // ⚠ THREE STATES, NOT TWO, AND THE ROW SAYS WHICH. A revisioned checkout
    // prints the base SHA with the sentence that stops it reading as an identity
    // for these bytes; a checkout that is not a git repository at all prints a
    // loud PROVENANCE INCOMPLETE instead. Both are honest; only SILENCE is not.
    // Asserting the first spelling alone made this row red on the second for a
    // reason that had nothing to do with what it measures — found by running the
    // gate against a non-git fixture during its own red-first proof.
    const named = provenance.includes('does NOT name the bytes this run read');
    const loudlyUnknown = provenance.includes('PROVENANCE INCOMPLETE');
    expect(named || loudlyUnknown,
      'the provenance stamp neither carried the base-is-not-an-identity sentence nor declared '
      + 'itself incomplete, so this run says something about its fixture that is not true')
      .toBe(true);
  });

  it('the sentence carries a DATED, machine-findable reading at all', () => {
    const claim = claimedWiredSet();
    expect(claim,
      'RASTER_SECTION_BINDING_LIMIT no longer contains a clause of the form "at aeon <sha> '
      + '(<date>) the wired set is {..}". That clause is the contract between the published '
      + 'sentence and this gate: without it the sentence is unreadable by any instrument, which '
      + 'is precisely the state that let "ONLY SECTION 5 IS WIRED" ship for seven days after aeon '
      + 'threaded section 6. Restore the spelling, do not delete this row.').not.toBeNull();
    // A reading with no sections is not a reading. Guards the degenerate `{}`
    // that would otherwise satisfy the comparison row against an empty derive.
    expect(claim!.sections.length,
      'the sentence claims an EMPTY wired set, which no aeon tree this editor supports has ever '
      + 'had; a reading of nothing cannot be compared with anything').toBeGreaterThan(0);
  });

  it('THE ROW THIS FILE IS FOR: the claimed wired set equals the derived one', (ctx) => {
    if (!needLib(ctx)) return;
    const claim = claimedWiredSet();
    expect(claim, 'no reading clause: see the row above').not.toBeNull();
    const derived = derivedWiredSet();
    // ANTI-VACUOUS. A parse that found nothing would make the comparison a
    // contest between two empty lists and pass forever. aeon has threaded at
    // least one section since `9cdf32d8`; zero here means the PARSER broke, not
    // that the world did, and the two must not look alike.
    expect(derived.length,
      `this repo's own libraryRasterChooserCalls found NO chooser call in ${LIB}. That is a `
      + 'parser or a path failure, not a fact about aeon: at least one section has been threaded '
      + 'continuously since aeon 9cdf32d8. Do not "fix" the sentence to match this.')
      .toBeGreaterThan(0);
    expect(derived,
      `the published limit says the wired set is {${claim!.sections.join(', ')}} as read at aeon `
      + `${claim!.sha} (${claim!.date}), and aeon's file today threads {${derived.join(', ')}}. `
      + 'THIS IS THE EXPIRY FIRING, not a regression: aeon changed which sections thread '
      + 'ojz_act1_sec_raster, and the sentence four surfaces publish is now false. Re-read '
      + 'games/sonic4/data/effects/ojz_effects.emp at a committed revision, update the reading '
      + 'AND its sha and date, and check the clauses that hang off it (the bound set, '
      + 'EditorRaster_<ACT>_Bindings, and aeon\'s pinned content tests, which carry the same '
      + 'list). Do NOT simply widen this matcher.')
      .toEqual(claim!.sections);
  });

  it('every wired section the sentence names is also bound in aeon\'s sidecars', (ctx) => {
    if (!needLib(ctx) || !needSidecars(ctx)) return;
    // The sentence says BOTH ARE ALSO BOUND. That is a second claim about a
    // second set of aeon files and it can expire on its own — an author
    // unbinding a section in this very editor is enough.
    const bound = derivedBoundSet();
    expect(bound.length,
      `no sidecar under ${SIDECARS} carries a rasterRef. Either aeon's band bindings are gone `
      + '(a real and reportable event) or this row is reading the wrong directory; the sentence '
      + 'claims at least one, so investigate before editing prose.').toBeGreaterThan(0);
    const derived = derivedWiredSet();
    expect(bound.filter((s) => !derived.includes(s)),
      'a section binds a rasterRef that no preset threads. That tree is one aeon\'s seam gate '
      + 'refuses by name, and the shipped sentence says it is refused, so this is a real finding '
      + 'about aeon\'s tree, not a wording problem here.').toEqual([]);
    expect(RASTER_SECTION_BINDING_LIMIT,
      'the sentence no longer claims the wired sections are bound; if that clause was rewritten '
      + 'deliberately, rewrite this row with it rather than deleting the check')
      .toMatch(/BOTH ARE ALSO BOUND/);
    // ⚠ THIS IS NOT AN INVARIANT ABOUT AEON — a wired section left UNBOUND is a
    // legal, documented state (the sentence's own case 2: it resolves to the
    // `hand:` label and changes nothing). It is a check on OUR CLAIM: while the
    // sentence says BOTH ARE ALSO BOUND, the two sets must coincide. Wired
    // {5,6,7} with bound {5,6} is a fine aeon tree and a false Aurora sentence.
    expect(bound,
      `the sentence says BOTH ARE ALSO BOUND, but aeon threads {${derived.join(', ')}} and only `
      + `{${bound.join(', ')}} carry a rasterRef. A wired section left unbound is legal (it is `
      + 'the sentence\'s own case 2), so the fix is to REWORD the clause to say which sections are '
      + 'bound, not to bind anything in aeon\'s tree.')
      .toEqual(derived);
  });

  it('the retired absolutes cannot come back by revert or by re-typing a number', () => {
    // The two shapes that were false on 2026-09-10, asserted absent. A revert of
    // the constant, or a well-meant "just update the number", reintroduces one
    // of these and fails HERE with the reason rather than shipping again.
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/ONLY SECTION \d+ IS WIRED/);
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/exactly one preset\(\)/);
    // ...and the rule and the command, which are what make the sentence
    // answerable without this gate being available.
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/a section is wired exactly when some preset\(\)/);
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/grep -n sec_raster/);
  });
});
