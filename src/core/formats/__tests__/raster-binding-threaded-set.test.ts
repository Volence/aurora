// THE SENTENCE THAT SHIPS AND THE FILE IT IS ABOUT, CHECKED AGAINST EACH OTHER.
//
// ═══ RE-AIMED 2026-09-17 (ruling REGION-MODE-RASTER-FALSE-OUTPUT-b1, condition 4) ═══
//
// aeon bcd844aa re-keyed the raster chooser on the RECORD for every act
// (`ojz_act1_preset_raster(preset: <Record>_KEY)`), and aeon e2af59ea moved OJZ
// act 1's bindings onto `regions.json`'s rows. Both rows below then failed BEFORE
// comparing anything with the sentence: one derived with the section-keyed
// chooser, the other read sidecars, and both were empty by construction. They now
// re-derive by aeon's current rule, in whichever mode aeon's tree has the act
// (`rasterOwners` / `rasterHomes` in section-wiring.ts, the mode read off the tree
// listing), and compare against the sentence's `the wired homes are {..}` reading.
// Each was proven red against the old sentence restored and against the
// derivation mutated back to `_sec_raster`
// (docs/reviews/2026-09-17-region-mode-b1.md). The history below is the file's
// reason to exist and still holds; where it says "section" read "owner".
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
// ⚠ LOUD ON UNMEASURABLE. With no aeon checkout, no git checkout there, or no
// resolvable `origin/master` in it, these rows `ctx.skip()` with a reason naming
// exactly what was looked for, and never pass. "aeon says {5, 6}" and "I could
// not open aeon" must not share a colour; that confusion is the one that
// produced the defect above. THERE IS NO FALLBACK TO THE WORKING TREE, because
// a fallback is how "I could not look" becomes "I looked and it was fine".
//
// ═══ WHICH BYTES: aeon's PUBLISHED ones, not whatever is on that lane's disk ═══
//
// The first version of this file read aeon's WORKING TREE, and its own
// provenance stamp said so — `read mode : WORKING TREE`, beside
// `aeon working tree : DIRTY, 76 path(s) uncommitted`. On this machine every
// sibling repo is another lane's live checkout, edited all day, so that gate was
// one mid-edit away from reddening on a change nobody published or greening on
// one. That is this repo's most upstream boot rule — "reading the suite's shared
// contract by path delivers it out of somebody's uncommitted edits" — landing on
// a gate about staleness, written while repairing a staleness defect.
//
// SO THE READ IS `origin/master` IN THAT CHECKOUT, THROUGH GIT OBJECTS
// (`test/support/peer-repo.ts`). aeon's tree is never opened and never written
// to, and no `git fetch` is run there: on this box the lanes push directly, so
// their `origin/master` advances with nobody here fetching.
//
// ⚠ THE COST, STATED RATHER THAN HIDDEN, AND IT IS THE SAME COST. This is still
// a LIVE reading: it moves whenever that lane pushes, so these rows go red on a
// change nobody in this repo made. That is the point — it is the alarm four
// dated EXPIRES blocks in `raster-binding.ts` asked for and never got, and the
// alternative (a FROZEN pin, a SHA committed here) goes stale in SILENCE, which
// is the exact defect being repaired. What changed is only WHOSE BYTES: a red
// now names a revision anyone can `git checkout` and reproduce, which a
// dirty-worktree read structurally cannot offer.
//
// The precedent is on the same axis and thick: `bg-override-contract-currency`,
// `aeon-ramp-sign-drift`, `aeon-vsram-mode-drift`, `fg-pool-ceiling-currency`
// and a dozen more all steer by aeon `origin/master` through git objects.
//
// ⚠ WHY A GREEN RUN HERE PROVES NOTHING ABOUT THAT, AND WHAT WAS MEASURED
// INSTEAD (2026-09-10). On the day of the change aeon's `ojz_effects.emp` was
// byte-identical between its working tree and `origin/master`, so BOTH read
// modes agreed and the local green discriminated nothing. The proof is a
// constructed DIVERGENCE, in a scratch copy of an aeon-shaped checkout — never
// in aeon itself — where the two disagree about the wired set. Both directions,
// both gates, one fixture each:
//
//   published {5,6} / working tree {5}  ->  THIS FILE: 5 passed
//                                           the pre-change worktree-reading
//                                           version: 2 failed | 3 passed
//   published {5}   / working tree {5,6} -> THIS FILE: 2 failed | 3 passed
//                                           the pre-change version: 5 passed
//
// Perfectly anti-correlated: the colour follows the PUBLISHED bytes and ignores
// the dirty ones. The mutation was `raster: ojz_act1_sec_raster(sec: 6, hand:
// Raster_Program_None)` -> `raster: Raster_Program_None`, quoted off disk before
// each run.
//
// The no-fallback property was measured separately, and it is the one a reader
// should distrust most: against a scratch checkout that HAS the effects library
// on disk but no resolvable `origin/master`, these rows skipped loudly and did
// not read the file sitting right there.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { RASTER_SECTION_BINDING_LIMIT } from '../raster-binding';
import {
  libraryRasterChooserCalls, rasterChooserName, rasterOwners, rasterHomes, readDescriptorWiring,
} from '../effects/section-wiring';
import { siblingPathOrUnresolved, siblingPathSource } from '../../../../test/support/sibling-root.mjs';
import { peerRepo, resolveRev, readAtRev } from '../../../../test/support/peer-repo';
import { announceFixture, READ_MODES } from '../../../../scratchpad/lib/fixture-provenance.mjs';

const AEON = siblingPathOrUnresolved('aeon');
/**
 * THE BRANCH THAT ANSWERS "WHAT HAS AEON PUBLISHED". A remote-tracking ref, so
 * no local edit in that checkout can move it, and no `git fetch` is needed here
 * to keep it current — the lanes on this machine push directly, so the ref in
 * their checkout advances on their push. Same spelling every other aeon-facing
 * gate in this repo steers by (`peer-repo.ts`'s `CURRENCY_BRANCH_SHAPE`).
 */
const AEON_TIP = 'origin/master';
/** aeon-repo-relative, because these go to `git show <rev>:<path>` and nothing else. */
const LIB_REL = 'games/sonic4/data/effects/ojz_effects.emp';
const SIDECARS_REL = 'games/sonic4/data/editor/ojz/act1';
const DESC_REL = 'games/sonic4/data/levels/ojz/act1/act_descriptor.emp';

/**
 * WHICH AEON THIS RUN READ, printed before the rows that read it.
 *
 * Exactly one of (`aeonDir` + `aeonSha`) and `cannotMeasure` is set, and the
 * three ways to reach the second are kept APART in the message: no checkout, a
 * checkout that is not a git repository, and a git repository with no resolvable
 * `origin/master`. A gate with two states where the world has three reports the
 * third as whichever of its two is wrong.
 */
let aeonDir: string | null = null;
let aeonSha: string | null = null;
let cannotMeasure: string | null = null;
let provenance = '';

if (!existsSync(AEON)) {
  cannotMeasure = `no aeon checkout at ${AEON} (resolved by: `
    + `${siblingPathSource('aeon') ?? 'unresolved'}). Set AEON_DIR or EMPYREAN_SUITE_ROOT`;
} else {
  const dir = peerRepo('aeon');
  if (dir === null) {
    cannotMeasure = `${AEON} exists but is not a git checkout, so the ${AEON_TIP} aeon has `
      + 'PUBLISHED cannot be read out of it. This row will not read that directory\'s files '
      + 'instead: a working-tree read is a different measurement wearing the same green';
  } else {
    const sha = resolveRev(dir, AEON_TIP);
    if (sha === null) {
      cannotMeasure = `${AEON_TIP} does not resolve to a commit in ${dir} (no such remote, a `
        + 'bare or shallow checkout, or a differently named default branch). This row asks aeon '
        + `for ${AEON_TIP} and nothing else; it does NOT fall back to that checkout's files, `
        + 'because a fallback turns "I could not look" into "I looked and it was fine"';
    } else {
      try {
        // COMMITTED, and the `ref` is required in that mode by
        // `fixture-provenance.mjs` on purpose: "origin/master resolved yesterday"
        // and "origin/master resolved today" are two fixtures wearing one name,
        // so the stamp prints the MOVING NAME and the SHA it resolved to.
        // No allowance is passed. Any claim the module cannot measure THROWS
        // here and lands in `cannotMeasure` as a loud skip, never as a green.
        announceFixture(
          {
            peer: 'aeon',
            mode: READ_MODES.COMMITTED,
            ref: AEON_TIP,
            dir,
            dirSource: siblingPathSource('aeon') ?? 'peerRepo(\'aeon\')',
          },
          (s: string) => { provenance += s; },
        );
        process.stderr.write(provenance);
        aeonDir = dir;
        aeonSha = sha;
      } catch (e) {
        provenance = '';
        cannotMeasure = `provenance for aeon at ${AEON_TIP} could not be taken in ${dir}: `
          + `${e instanceof Error ? e.message : String(e)}. A run that cannot say which revision `
          + 'it read has nothing to report, so these rows skip rather than measure an unnamed input';
      }
    }
  }
}

/**
 * The sentence's canonical, machine-findable reading of the wired HOMES.
 *
 * ⚠ THE SPELLING IS THE CONTRACT between the prose and this file, so it is
 * parsed here and nowhere else. `at aeon <sha> (<date>) the wired homes are {a, b}`,
 * where each member is an OWNER id: a region row's `id` on a region-mode act, a
 * section index on a section-mode act (ruling REGION-MODE-RASTER-FALSE-OUTPUT-b1;
 * until 2026-09-17 it was `the wired set is {5, 6}`, section indices only).
 * A rewrite that keeps the fact and drops this shape fails the row that parses
 * it, with a message saying so, never silently.
 */
const READING = /at aeon ([0-9a-f]{7,40}) \((\d{4}-\d{2}-\d{2})\) the wired homes are \{([A-Za-z0-9_,\s]*)\}/;

/** The homes the sentence claims, sorted, or `null` if the sentence has no such clause. */
function claimedHomes(): { sha: string; date: string; homes: string[] } | null {
  const m = READING.exec(RASTER_SECTION_BINDING_LIMIT);
  if (m === null) return null;
  const homes = m[3].split(',').map((s) => s.trim()).filter((s) => s !== '');
  return { sha: m[1], date: m[2], homes: homes.sort() };
}

/** Where a red should send the reader: peer, path, branch and the SHA it resolved to. */
function at(rel: string): string {
  return `aeon:${rel} at ${AEON_TIP} (${aeonSha ?? 'unresolved'}), checkout ${aeonDir ?? AEON}`;
}

/**
 * aeon's bytes at `AEON_TIP`, out of its object database.
 *
 * ⚠ AFTER `aeonSha` HAS RESOLVED, an `ok: false` here can only mean the path is
 * NOT IN THAT TREE — which is a MEASUREMENT and a real finding, not a reason to
 * skip: the file this sentence is about would have been deleted or renamed. It
 * throws, so the row goes red and says which peer, which path, which revision.
 */
function readPublished(rel: string): string {
  const r = readAtRev(aeonDir!, aeonSha!, rel);
  if (!r.ok) {
    throw new Error(`${at(rel)}: ${r.why}. That is a MEASURED absence, not a failure to look: `
      + 'the file the shipped limit sentence is about is not in the revision aeon has published. '
      + 'Find where it moved and re-point this gate and the sentence together.');
  }
  return r.text;
}

type Listing = { ok: true; names: string[] } | { ok: false; why: string };

/**
 * The names in aeon's published act-1 editor directory.
 *
 * `git show <rev>:<dir>` prints `tree <rev>:<dir>`, a blank line, then one entry
 * per line. The header is checked rather than assumed: a directory REPLACED by a
 * file is a third state, and it must not read as an empty directory.
 */
function editorListing(): Listing {
  const r = readAtRev(aeonDir!, aeonSha!, SIDECARS_REL);
  if (!r.ok) return { ok: false, why: `${at(SIDECARS_REL)}: ${r.why}` };
  const lines = r.text.split('\n');
  if (!lines[0]?.startsWith('tree ')) {
    return {
      ok: false,
      why: `${at(SIDECARS_REL)} is not a directory at that revision: git described it as `
        + `${JSON.stringify(lines[0] ?? '')}. Nothing was listed, and an unlistable directory `
        + 'must not be counted as an empty one',
    };
  }
  return { ok: true, names: lines.slice(1).map((l) => l.trim()).filter((l) => l.length > 0) };
}

/** A sidecar this repo cannot parse is UNMEASURABLE, not absent, so it throws. */
function publishedJson(rel: string): unknown {
  try {
    return JSON.parse(readPublished(rel));
  } catch (e) {
    throw new Error(`${at(rel)} is not readable JSON (${e instanceof Error ? e.message : String(e)}): `
      + 'this row cannot derive the owners and must not report fewer');
  }
}

/**
 * THE OWNERS OF ACT 1'S RASTER BINDINGS AS aeon HAS PUBLISHED THEM, by aeon's
 * current rule and this repo's own derivation (`rasterOwners`, `rasterHomes`, the
 * record-keyed `libraryRasterChooserCalls` under `rasterChooserName`).
 *
 * THE MODE IS THE FILE, READ OFF THE TREE LISTING: `regions.json` among the
 * directory's entries is region mode (aeon `has_act_regions`), and its absence
 * from a listing that WAS read is section mode. Never inferred from what the
 * sidecars carry: a region-mode act and an unbound section-mode act have
 * identical nulled sidecars.
 */
function derivedOwners(names: string[]): { mode: 'region' | 'section'; wired: string[]; bound: string[] } {
  const lib = readPublished(LIB_REL);
  const threadedBy = libraryRasterChooserCalls(lib, rasterChooserName('ojz', 'act1'));
  if (names.includes('regions.json')) {
    const doc = publishedJson(`${SIDECARS_REL}/regions.json`) as {
      regions?: { id: string; preset: string; rasterRef?: string | null }[];
    };
    if (!Array.isArray(doc.regions)) {
      throw new Error(`${at(`${SIDECARS_REL}/regions.json`)} has no regions array: unmeasurable`);
    }
    const h = rasterHomes(rasterOwners({ regionRows: doc.regions, bindings: {}, sidecarRasterRefs: {} }),
      threadedBy);
    return { mode: 'region', wired: h.wired.map(String).sort(), bound: h.bound.map(String).sort() };
  }
  const wiring = readDescriptorWiring(DESC_REL, readPublished(DESC_REL), 'ojz');
  if (!wiring.descriptor.parsed) {
    throw new Error(`${at(DESC_REL)}: a section-mode act whose descriptor this repo's reader refused `
      + `(${wiring.descriptor.reason}). The owners' records are unmeasurable, not absent.`);
  }
  const sidecarRasterRefs: Record<number, string | null> = {};
  for (const n of names) {
    const m = /^section_(\d+)\.meta\.json$/.exec(n);
    if (m === null) continue;
    const ref = (publishedJson(`${SIDECARS_REL}/${n}`) as Record<string, unknown> | null)?.rasterRef;
    sidecarRasterRefs[Number(m[1])] = typeof ref === 'string' && ref !== '' ? ref : null;
  }
  const h = rasterHomes(rasterOwners({ regionRows: null, bindings: wiring.bindings, sidecarRasterRefs }),
    threadedBy);
  return { mode: 'section', wired: h.wired.map(String).sort(), bound: h.bound.map(String).sort() };
}

const needAeon = (ctx: { skip: (reason: string) => void }): boolean => {
  if (aeonDir !== null && aeonSha !== null) return true;
  ctx.skip(`SKIPPED, NOT PASSED: ${cannotMeasure}. This row re-derives the wired homes from `
    + `aeon's real ${LIB_REL} and act-1 editor files as aeon has PUBLISHED them at ${AEON_TIP}, and `
    + 'compares them to what the shipped limit sentence claims. Nothing was measured: the sentence '
    + 'may be right or may be as wrong as it was for the seven days this row exists to prevent.');
  return false;
};

const needListing = (ctx: { skip: (reason: string) => void }): string[] | null => {
  const listing = editorListing();
  if (listing.ok) return listing.names;
  ctx.skip(`SKIPPED, NOT PASSED: ${listing.why}. This row re-derives who owns the act's raster `
    + 'bindings and could not list the directory that says which mode the act is in. Nothing was '
    + 'measured.');
  return null;
};

describe('the shipped raster-binding limit agrees with aeon\'s real file', () => {
  it('the run SAID which aeon REVISION it read, and that revision NAMES the bytes', (ctx) => {
    if (!needAeon(ctx)) return;
    // Without this the rows below are claims about an unnamed input, and a stale
    // reading of that input is indistinguishable from a current one.
    expect(provenance, 'these rows read aeon\'s published file and the run printed no provenance, '
      + 'so nothing in this result says which aeon revision decided it').not.toBe('');
    // ⚠ THE MODE IS THE CLAIM. `COMMITTED OBJECTS` is the module's own sentence
    // for "git read the object database; the peer working tree was never opened".
    // If this ever reads WORKING TREE again, the rows below have quietly gone
    // back to grading somebody's unsaved afternoon.
    expect(provenance, 'the stamp does not say the bytes came out of aeon\'s object database')
      .toContain('COMMITTED OBJECTS');
    expect(provenance, 'the stamp claims a WORKING TREE read; this gate must never consume a '
      + 'sibling lane\'s uncommitted edits').not.toContain('WORKING TREE. the bytes read are');
    // BOTH HALVES OF THE FIXTURE'S NAME. The moving ref is what was ASKED FOR
    // and does not identify a fixture on its own; the 40-hex SHA is what a
    // reader of a red can check out and reproduce.
    expect(provenance, `the stamp does not name the ref this run asked aeon for (${AEON_TIP})`)
      .toContain(AEON_TIP);
    expect(provenance, 'the stamp does not carry the resolved commit, so a red here names no '
      + 'revision anyone could check out').toContain(aeonSha!);
    expect(provenance, 'the stamp does not say the revision names the bytes this run consumed')
      .toContain('WHICH BYTES this run consumed');
    // ⚠ THREE STATES, NOT TWO, AND THIS ROW ONLY EVER SEES ONE OF THEM.
    // `announceFixture` is called with NO allowance, so any claim it could not
    // measure throws — an unrevisioned directory, an unreadable dirty state —
    // and lands in `cannotMeasure`, which `needAeon` renders as a loud skip
    // above. So the banner cannot legitimately appear here: if it does, an
    // allowance has been added and this run's provenance is partial.
    expect(provenance, 'the stamp declares itself incomplete. This gate passes no allowance, so '
      + 'an incomplete record must have skipped loudly rather than reached a row')
      .not.toContain('PROVENANCE INCOMPLETE');
  });

  it('the sentence carries a DATED, machine-findable reading at all', () => {
    const claim = claimedHomes();
    expect(claim,
      'RASTER_SECTION_BINDING_LIMIT no longer contains a clause of the form "at aeon <sha> '
      + '(<date>) the wired homes are {..}". That clause is the contract between the published '
      + 'sentence and this gate: without it the sentence is unreadable by any instrument, which '
      + 'is precisely the state that let "ONLY SECTION 5 IS WIRED" ship for seven days after aeon '
      + 'threaded section 6. Restore the spelling, do not delete this row.').not.toBeNull();
    // A reading with no homes is not a reading. Guards the degenerate `{}`
    // that would otherwise satisfy the comparison row against an empty derive.
    expect(claim!.homes.length,
      'the sentence claims an EMPTY wired set, which no aeon tree this editor supports has ever '
      + 'had; a reading of nothing cannot be compared with anything').toBeGreaterThan(0);
  });

  it('the wired homes the sentence claims equal the homes derived from aeon\'s published files by aeon\'s current rule', (ctx) => {
    if (!needAeon(ctx)) return;
    const names = needListing(ctx);
    if (names === null) return;
    const claim = claimedHomes();
    expect(claim, 'no reading clause: see the row above').not.toBeNull();
    const derived = derivedOwners(names);
    // ANTI-VACUOUS. A parse that found nothing would make the comparison a
    // contest between two empty lists and pass forever. aeon has threaded at
    // least one raster home continuously since 9cdf32d8; zero here means the
    // PARSER or the OWNER JOIN broke, not that the world did.
    expect(derived.wired.length,
      `this repo's own derivation found NO home whose record threads `
      + `${rasterChooserName('ojz', 'act1')} with its own key, reading ${at(LIB_REL)} and the act's `
      + `${derived.mode}-mode owners. That is a parser, join or path failure, not a fact about aeon. `
      + 'Do not "fix" the sentence to match this.')
      .toBeGreaterThan(0);
    expect(derived.wired,
      `the published limit says the wired homes are {${claim!.homes.join(', ')}} as read at aeon `
      + `${claim!.sha} (${claim!.date}), and aeon at ${AEON_TIP} (${aeonSha}) has a ${derived.mode}-mode `
      + `act 1 whose homes are {${derived.wired.join(', ')}}. THIS IS THE EXPIRY FIRING, not a `
      + 'regression: aeon changed which records thread the raster chooser, or which owners install '
      + `them, and the sentence four surfaces publish is now false. Check it with: git -C <aeon> show `
      + `${aeonSha ?? AEON_TIP}:${LIB_REL} | grep -n preset_raster, and the act's regions.json or `
      + 'sidecars. Update the reading AND its sha and date, and check the clauses that hang off it '
      + '(the bound owners, and aeon\'s content tests quoted in the sentence). Do NOT simply widen '
      + 'this matcher.')
      .toEqual(claim!.homes);
  });

  it('every wired home the sentence names is bound, in the file that owns the act\'s bindings', (ctx) => {
    if (!needAeon(ctx)) return;
    // ⚠ THE SECOND SET OF AEON FILES GETS THE SAME TREATMENT AS THE FIRST: read
    // at `AEON_TIP` through git objects, never off that lane's disk. An author
    // mid-edit in aeon's own tree must not be able to redden or green this row.
    const names = needListing(ctx);
    if (names === null) return;
    // The sentence says BOTH ARE ALSO BOUND. That is a second claim about a
    // second set of aeon files and it can expire on its own: an author
    // unbinding an owner in this very editor is enough.
    const derived = derivedOwners(names);
    expect(derived.bound.length,
      `no ${derived.mode === 'region' ? 'region row of regions.json' : 'sidecar'} under `
      + `${at(SIDECARS_REL)} carries a rasterRef. Either aeon's band bindings are gone (a real and `
      + 'reportable event) or this row is reading the wrong owners; the sentence claims at least '
      + 'one, so investigate before editing prose.').toBeGreaterThan(0);
    expect(derived.bound.filter((o) => !derived.wired.includes(o)),
      'an owner binds a rasterRef whose record does not thread the raster chooser with its own key. '
      + 'That tree is one aeon\'s seam gate refuses by name, and the shipped sentence says it is '
      + 'refused, so this is a real finding about aeon\'s tree, not a wording problem here.')
      .toEqual([]);
    expect(RASTER_SECTION_BINDING_LIMIT,
      'the sentence no longer claims the wired homes are bound; if that clause was rewritten '
      + 'deliberately, rewrite this row with it rather than deleting the check')
      .toMatch(/BOTH ARE ALSO BOUND/);
    // ⚠ AGAINST THE SENTENCE, NOT ONLY AGAINST THE DERIVATION. The first draft of
    // this row compared aeon's bound owners with aeon's wired homes and checked
    // the phrase was present, and it stayed GREEN with the pre-b1 sentence
    // restored on disk: it never read which owners the sentence claims. "BOTH ARE
    // ALSO BOUND" is a claim about the homes the reading names, so the bound
    // owners are compared with those.
    const claim = claimedHomes();
    expect(claim, 'no reading clause, so the sentence names no homes to be bound: see the row above')
      .not.toBeNull();
    expect(derived.bound,
      `the sentence says the homes {${claim!.homes.join(', ')}} are BOTH ALSO BOUND, and aeon at `
      + `${AEON_TIP} (${aeonSha}) binds a rasterRef on {${derived.bound.join(', ')}}.`)
      .toEqual(claim!.homes);
    // ⚠ THIS IS NOT AN INVARIANT ABOUT AEON: a wired home left UNBOUND is a
    // legal, documented state (it resolves to the `hand:` label and changes
    // nothing). It is a check on OUR CLAIM: while the sentence says BOTH ARE
    // ALSO BOUND, the two sets must coincide.
    expect(derived.bound,
      `the sentence says BOTH ARE ALSO BOUND, but aeon's homes are {${derived.wired.join(', ')}} and `
      + `only {${derived.bound.join(', ')}} carry a rasterRef. A wired home left unbound is legal, so `
      + 'the fix is to REWORD the clause to say which owners are bound, not to bind anything in '
      + 'aeon\'s tree.')
      .toEqual(derived.wired);
  });

  it('the retired absolutes and the retired chooser spelling are absent, and the current rule and command are present', () => {
    // The two shapes that were false on 2026-09-10, asserted absent. A revert of
    // the constant, or a well-meant "just update the number", reintroduces one
    // of these and fails HERE with the reason rather than shipping again.
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/ONLY SECTION \d+ IS WIRED/);
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/exactly one preset\(\)/);
    // The section-keyed rule and its command, retired by aeon bcd844aa, and the
    // first build's staleness preface, removed by ruling b1.
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/a section is wired exactly when some preset\(\)/);
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/grep -n sec_raster/);
    expect(RASTER_SECTION_BINDING_LIMIT).not.toMatch(/WHAT IT MAKES STALE|NOT current for OJZ act 1/);
    // ...and the rule and the command, which are what make the sentence
    // answerable without this gate being available.
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(
      /an owner \(a region row, or a section\) is wired exactly when the preset\(\) of the EffectsPreset record it installs/);
    expect(RASTER_SECTION_BINDING_LIMIT).toContain(
      `passes ${rasterChooserName('ojz', 'act1')}(preset: <that record>_KEY, hand: ...)`);
    expect(RASTER_SECTION_BINDING_LIMIT).toMatch(/grep -n preset_raster/);
  });
});
