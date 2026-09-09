/**
 * CURRENCY — the question a pinned blob can never answer.
 *
 * `test/fixtures/effects/` holds aeon's shipped documents, vendored here at named
 * revisions. The codec tests that use them (`effects-scene-curve-vsplit.test.ts`
 * for the scene, `effects-preset-base-swap.test.ts` for the section-6 preset and
 * its section binding) ask questions about AURORA'S CODEC and are right to read
 * only the pin. But they therefore cannot notice that aeon has moved on: a pin
 * equals itself by construction, so a "is it still current?" check written
 * against the pin passes forever and detects nothing.
 *
 * So that question gets its own instrument, here, and it obeys three rules:
 *
 *   1. It reads aeon at a COMMITTED REVISION through git objects
 *      (`git -C <aeon> show <rev>:<path>`), never through the sibling working
 *      tree. On this machine every sibling repo is some peer lane's live
 *      checkout; reading one by path means this suite's colour is decided by a
 *      peer's uncommitted edits. That is the defect this file exists because of
 *      — see docs/reviews/2026-08-28-golden-live-tree.md — and it is the most
 *      upstream rule in the suite protocol (empyrean origin/main 2fd7b5f0,
 *      docs/OVERSEER-PROTOCOL.md).
 *   2. It NAMES the revision it read, in every message it can print.
 *   3. When it cannot run — no aeon checkout, revision unfetched — it SKIPS
 *      LOUDLY, saying what could not be measured. It never renders
 *      "could not measure" as green-and-silent.
 *
 * A failure here is NOT an Aurora regression. It means aeon's shipped document
 * changed and the pin needs re-vendoring; the message says how.
 *
 * KNOWN LIMIT, stated rather than glossed: this resolves aeon's `origin/master`
 * remote-tracking ref WITHOUT fetching, so it is only as fresh as the last fetch
 * in that checkout. That is a deliberate trade — an offline-safe, committed,
 * named revision instead of network I/O in a unit test — and it is the protocol's
 * own trade ("an invisible failure for a visible lag"). It cannot regress to the
 * defect it replaces, because a remote-tracking ref is never somebody's
 * uncommitted edit.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  peerRepo, resolveRev, readAtRev, isAncestor, gitBlobSha, currencyBranch, AURORA_DIR,
} from '../support/peer-repo';

type Provenance = {
  aeon: { path: string; revision: string; blob: string };
  fixture: { path: string; git_blob: string; sha256: string; bytes: number };
};

type Vendored = { name: string; fixture: string; provenance: string; prov: Provenance; bytes: string };

/**
 * EVERY aeon document vendored into this repo, and the ONE instrument that
 * answers both questions about all of them. Adding a vendored fixture is adding
 * a row here — deliberately, so a second copy of this machinery never gets
 * written beside it. (`test/fixtures/effects/ojz_sec6_baseswap.json` and its
 * section sidecar joined on 2026-09-04; see
 * docs/reviews/2026-09-04-baseswap-vendor-fixture.md.)
 */
const VENDORED: Vendored[] = [
  'ojz_act1_depth.json',
  'ojz_sec6_baseswap.json',
  'ojz_act1_section_6.meta.json',
].map((name) => {
  const fixture = resolve(__dirname, '../fixtures/effects', name);
  const provenance = fixture.replace(/\.json$/, '.provenance.json');
  const prov = JSON.parse(readFileSync(provenance, 'utf8')) as Provenance;
  return { name, fixture, provenance, prov, bytes: readFileSync(fixture, 'utf8') };
});

// The branch whose tip answers "what does aeon ship TODAY". Committed, named,
// and never the working tree.
const AEON_TIP = 'origin/master';

/**
 * ⚠ THE SECOND POPULATION, AND WHY THE SWEEPS BELOW REACH INTO `src/`.
 *
 * The completeness sweep at the top of this file guards `test/fixtures`, and
 * said so in its own words: a table is a list and a list goes stale silently.
 * It was rooted at `test/fixtures` ONLY, while a SECOND set of vendored peer
 * documents lives under `src/core/formats/effects/` -- the contract schemas and
 * aeon's channel-bands declaration, which the app reads at runtime and which
 * therefore cannot live under `test/`. Those were covered by hand-written
 * per-file gates and by nothing that sweeps, which is the exact list-goes-stale
 * shape one directory over. That population has already grown from two to
 * three, so the growth is demonstrated and not hypothetical.
 *
 * `src` and not `src/core/formats/effects`: the narrower root would itself be a
 * list, and a fourth document vendored somewhere else under `src` would arrive
 * outside it. The walk is over source, so it costs nothing worth naming.
 */
const SIDECAR_ROOTS = ['test/fixtures', 'src'];

/** Every `*.provenance.json` under the given repo-relative roots, as absolute paths. */
function sidecarsUnder(roots: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.provenance.json')) found.push(p);
    }
  };
  for (const r of roots) walk(resolve(AURORA_DIR, r));
  return found;
}

/** Prefix every message with this so nobody triages it as an Aurora regression. */
const NOT_OURS = 'NOT AN AURORA REGRESSION: a vendored aeon fixture is stale.';

describe('the vendored aeon fixtures and their provenance cannot drift apart', () => {
  /**
   * PIN INTEGRITY — always runs, needs no peer repo. Catches a fixture edited to
   * make something else pass, and a provenance record edited away from it.
   */
  for (const v of VENDORED) {
    it(`${v.name} is the git blob its provenance names`, () => {
      expect(v.prov.aeon.revision, 'provenance has no 40-hex aeon revision').toMatch(/^[0-9a-f]{40}$/);
      expect(v.prov.aeon.blob, 'provenance has no 40-hex aeon blob id').toMatch(/^[0-9a-f]{40}$/);
      // Anti-vacuous: the recorded blob is aeon's OBJECT ID, so computing it here
      // from the fixture's own bytes is a real comparison, not a tautology.
      expect(gitBlobSha(v.bytes)).toBe(v.prov.aeon.blob);
      expect(v.prov.fixture.git_blob).toBe(v.prov.aeon.blob);
      // Bytes, not .length: ojz_act1_depth's `name` carries an em dash, so the
      // decoded string is two units shorter than the file. The record is BYTES.
      expect(Buffer.byteLength(v.bytes, 'utf8')).toBe(v.prov.fixture.bytes);
    });
  }

  /**
   * ⚠ THE TABLE ABOVE IS A LIST, AND A LIST GOES STALE SILENTLY. A fixture
   * vendored from aeon and left out of `VENDORED` would get NO currency check at
   * all, and nothing would say so: the suite total would be green and one
   * document's drift would be invisible forever — the same silent zero this file
   * exists to abolish. So the table is checked for completeness against the
   * sidecars actually on disk.
   *
   * The population is "a sidecar whose `aeon` block names BOTH a `path` and a
   * `blob`" — i.e. one claiming to hold a VERBATIM aeon blob, which is the only
   * claim a content-currency comparison can be made against. Sidecars with an
   * `aeon` block but no `aeon.path` (the two under test/fixtures/bg-override)
   * describe a DERIVED artifact, not a copied one; there is no aeon file to
   * compare them to byte-for-byte, and pretending otherwise would fail forever.
   */
  it('every sidecar claiming a verbatim aeon blob is IN the table above', () => {
    const root = resolve(AURORA_DIR, 'test/fixtures');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.provenance.json')) {
          const doc = JSON.parse(readFileSync(p, 'utf8')) as Partial<Provenance>;
          if (typeof doc.aeon?.path === 'string' && typeof doc.aeon?.blob === 'string') {
            expect(typeof doc.fixture?.path, `${p} names an aeon blob but no fixture.path`).toBe('string');
            found.push(doc.fixture!.path);
          }
        }
      }
    };
    walk(root);
    // Anti-vacuous: an empty sweep has measured nothing.
    expect(found.length, 'no sidecar on disk claims a verbatim aeon blob: the sweep measured nothing').toBeGreaterThan(0);
    const covered = VENDORED.map((v) => v.prov.fixture.path).sort();
    expect(
      found.sort(),
      'a sidecar claims to hold a verbatim aeon blob but its fixture is not in VENDORED, so it gets NO'
      + ' currency check: add it to the list at the top of this file',
    ).toEqual(covered);
  });
});

describe('CURRENCY: are the vendored aeon fixtures still what aeon ships?', () => {
  const aeon = peerRepo('aeon');

  for (const v of VENDORED) {
    it(`${v.name} matches ${v.prov.aeon.path} at aeon ${AEON_TIP}`, (ctx) => {
      if (aeon === null) {
        ctx.skip('SKIPPED, NOT PASSED: no aeon checkout beside this repo (set AEON_DIR); '
          + `CANNOT MEASURE whether the pin ${v.prov.aeon.revision} for ${v.name} is still current`);
        return;
      }
      const tip = resolveRev(aeon, AEON_TIP);
      if (tip === null) {
        ctx.skip(`SKIPPED, NOT PASSED: ${AEON_TIP} does not resolve in ${aeon}; `
          + `CANNOT MEASURE currency of pin ${v.prov.aeon.revision} for ${v.name}`);
        return;
      }
      const at = readAtRev(aeon, tip, v.prov.aeon.path);
      // Not a skip: the revision resolved, so this WAS measured, and "the source
      // file is gone at aeon's tip" is drift of the loudest kind.
      expect(at.ok, at.ok ? '' : `${NOT_OURS} ${at.why}`).toBe(true);
      if (!at.ok) return;
      expect(
        at.text,
        `${NOT_OURS}\n`
        + `  pinned at aeon ${v.prov.aeon.revision} (blob ${v.prov.aeon.blob})\n`
        + `  aeon ${AEON_TIP} is now ${tip} (blob ${at.blob})\n`
        + `  ${v.prov.aeon.path} changed between them.\n`
        + `  Re-vendor:  git -C ${aeon} show ${tip}:${v.prov.aeon.path} > ${v.prov.fixture.path}\n`
        + `  then update ${v.provenance.slice(AURORA_DIR.length + 1)} (revision, blob, sha256, git_blob),\n`
        + '  and re-check the codec rows that read it.',
      ).toBe(v.bytes);
    });
  }

  /**
   * The revision you PINNED AT is an anchor too, and it is the one nobody
   * checks, because it reads as provenance rather than payload (protocol,
   * "Second half of this rule"). A pin at a local-only SHA looks perfect from
   * this machine and is unresolvable from anywhere else.
   *
   * Applies to every provenance sidecar under `SIDECAR_ROOTS` — which is
   * test/fixtures AND src, not test/fixtures alone; see the note on that
   * constant for the second population and why it was invisible here — and to
   * every PEER REPO a sidecar can pin. A sidecar names its source repo
   * as a top-level block (`"aeon": {...}`, `"empyrean": {...}`); the revisions
   * inside that block are checked against THAT repo's published branch (the
   * block's own `branch_that_answers_currency` when it says one, else the
   * repo's default). A revision recorded outside any block this sweep knows is
   * refused by name rather than checked against the wrong repo, and a repo
   * that cannot be measured is reported as a loud skip AFTER the ones that
   * could be measured have been asserted.
   */
  it('every peer-repo revision recorded in test/fixtures is PUBLISHED, not local-only', (ctx) => {
    const KNOWN_REPOS: Record<string, { name: string; defaultTip: string }> = {
      aeon: { name: 'aeon', defaultTip: AEON_TIP },
      empyrean: { name: 'empyrean', defaultTip: 'origin/main' },
      // The s1disasm pin (test/fixtures/s1disasm/.provenance.json, ROADMAP row
      // 78). Its published branch is `origin/AS` — that repo's own origin/HEAD;
      // it has no `master`. The sidecar says so itself in
      // `branch_that_answers_currency`, which is what this sweep reads; the
      // default here is the fallback for a sidecar that omits it.
      s1disasm: { name: 's1disasm', defaultTip: 'origin/AS' },
    };
    const REVISION_KEY = /"revision[a-z_]*"\s*:\s*"([0-9a-f]{40})"/g;

    const sidecars = sidecarsUnder(SIDECAR_ROOTS);
    // Anti-vacuous: if the sweep finds nothing it has measured nothing.
    expect(sidecars.length, 'no .provenance.json sidecars found to check').toBeGreaterThan(0);

    const unpublished: string[] = [];
    const unmeasurable: string[] = [];
    const orphaned: string[] = [];
    const malformed: string[] = [];
    let checked = 0;
    for (const file of sidecars) {
      const short = file.slice(AURORA_DIR.length + 1);
      const text = readFileSync(file, 'utf8');
      const doc = JSON.parse(text) as Record<string, unknown>;
      // Every 40-hex revision the file records, whatever the key is spelled…
      const all = new Set([...text.matchAll(REVISION_KEY)].map((m) => m[1]));
      // …and the subset that sits inside a block naming a repo we can ask.
      const claimed = new Set<string>();
      for (const [key, block] of Object.entries(doc)) {
        const repo = KNOWN_REPOS[key];
        if (!repo || typeof block !== 'object' || block === null) continue;
        const inBlock = [...JSON.stringify(block).matchAll(REVISION_KEY)].map((m) => m[1]);
        if (inBlock.length === 0) continue;
        // ⚠ ABSENT AND MALFORMED ARE DIFFERENT ANSWERS, and the typeof check
        // that used to sit here collapsed them. A sidecar that names NO branch
        // legitimately falls back to the repo default (most do). A sidecar that
        // names a branch this sweep cannot use -- a number, an empty string, a
        // bare local name -- silently became the default too, so a mistyped
        // field was measured against a branch nobody wrote down. `present`
        // separates the two: the fallback is for the first case only.
        const read = currencyBranch(block, file, key);
        if (read.present && read.defect !== null) {
          malformed.push(read.defect);
          // Its revisions were SEEN, so they are not orphans; they are simply
          // not measurable against a branch the sidecar spelled wrong. The
          // assertion below is what goes red, and it names the field.
          for (const rev of inBlock) claimed.add(rev);
          continue;
        }
        const tipName = read.present ? read.tip : repo.defaultTip;
        const dir = peerRepo(repo.name);
        const tip = dir === null ? null : resolveRev(dir, tipName);
        for (const rev of inBlock) {
          claimed.add(rev);
          if (dir === null || tip === null) {
            unmeasurable.push(`${short} → ${repo.name} ${rev} (${dir === null ? `no ${repo.name} checkout beside this repo` : `${tipName} does not resolve in ${dir}`})`);
            continue;
          }
          checked++;
          if (!isAncestor(dir, rev, tip)) unpublished.push(`${short} → ${repo.name} ${rev} not reachable from ${tipName} (${tip})`);
        }
      }
      for (const rev of all) if (!claimed.has(rev)) orphaned.push(`${short} → ${rev}`);
    }
    // Asserted BEFORE the unmeasurable skip: a sidecar that spelled its own
    // currency branch wrong is an Aurora-side defect, measurable from here with
    // no peer at all, and it must never hide behind a peer-shaped skip.
    expect(
      malformed,
      'these sidecars name a branch that answers currency which this sweep cannot use, so the'
      + ' revisions in that block were measured against nothing',
    ).toEqual([]);
    expect(
      orphaned,
      `these recorded revisions sit outside any repo block this sweep knows (${Object.keys(KNOWN_REPOS).join(', ')})`
      + ': they were NOT checked against anything; name the repo as a top-level block',
    ).toEqual([]);
    expect(
      unpublished,
      'these pinned revisions are NOT reachable from their repo\'s published branch: local-only, or the'
      + ' branch was rewritten; a peer cannot check a check pinned to a SHA they cannot fetch',
    ).toEqual([]);
    if (unmeasurable.length > 0) {
      ctx.skip(`SKIPPED, NOT PASSED (${checked} revisions were checked and are published): CANNOT MEASURE `
        + `reachability of\n  ${unmeasurable.join('\n  ')}`);
      return;
    }
    expect(checked, 'no recorded revisions found in the sidecars').toBeGreaterThan(0);
  });
});

/**
 * COVERAGE, THE OTHER HALF OF THE ANTI-STALENESS QUESTION.
 *
 * The sweep above asks "is every RECORDED REVISION checked against a published
 * branch". This one asks the question that comes before it: is every VENDORED
 * DOCUMENT under `src/` read by a gate at all. A document nobody opens has no
 * drift gate, no currency row and no keyword-coverage row, and contributes
 * nothing to any total, so its arrival is invisible: the suite goes green and
 * one more copy of somebody else's contract quietly stops being checked.
 *
 * ⚠ THIS SWEEP DOES NOT REPLACE THE PER-FILE GATES, AND MUST NOT.
 *
 * The choice was made deliberately rather than defaulted into. The per-file
 * gates assert CONTENT: byte identity against the pinned blob, the `$id` the
 * document must carry, that the module the app imports IS the file on disk,
 * that every schema keyword is implemented, that the pinned revision is
 * published. None of that is derivable from a directory listing, and a sweep
 * that tried would either assert nothing or re-implement each gate badly. What
 * a sweep CAN assert, and what nothing asserted before, is PRESENCE OF
 * COVERAGE. So the two sit side by side: the gates say the copy is right, this
 * says a gate exists.
 *
 * HOW "A GATE EXISTS" IS MEASURED, and why not by a grep for the file's name. A
 * comment outbids code in a plain grep: the prose header of a drift gate names
 * every path it discusses, and so does a review document. The signal here is
 * narrower and closer to the thing that matters, a QUOTED PATH LITERAL ending
 * in the document, in a file vitest actually collects, which is what
 * `resolve(__dirname, '../../src/...')` and a JSON `import` both produce and
 * what a prose mention does not. A gate that opens the file has one; a
 * paragraph about the file does not.
 *
 * THIS FILE IS EXCLUDED FROM THE CORPUS IT SEARCHES. It derives every path it
 * looks for, so it contains none of them as literals and would not match
 * anyway; excluding it makes that a property of the sweep rather than a
 * property of how it happens to be written today.
 */
describe('COVERAGE: every vendored document under src/ is opened by a gate', () => {
  /** Where vitest collects from, per vitest.config.ts `include`. */
  const COLLECTED_ROOTS = ['test', 'src'];

  const collectedTests = (): string[] => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.test.ts') && p !== resolve(__filename)) found.push(p);
      }
    };
    for (const r of COLLECTED_ROOTS) walk(resolve(AURORA_DIR, r));
    return found;
  };

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** A quoted string literal whose final characters are this repo-relative path. */
  const quotedPath = (repoRelative: string) => new RegExp(
    `['"\`][^'"\`\\n]*${escapeRe(repoRelative)}['"\`]`,
  );

  it('every vendored document under src/ is opened by a collected test, and so is its sidecar', () => {
    const sidecars = sidecarsUnder(['src']);
    // Anti-vacuous: an empty population would make every claim below hold.
    expect(
      sidecars.length,
      'no .provenance.json sidecar found under src/: this sweep measured nothing',
    ).toBeGreaterThan(0);

    const corpus = collectedTests().map((f) => readFileSync(f, 'utf8'));
    // Anti-vacuous on the OTHER operand too. Two absent sides agreeing with each
    // other is the failure this whole parcel exists to remove.
    expect(corpus.length, 'no collected test files were read: the corpus is empty').toBeGreaterThan(0);

    const uncovered: string[] = [];
    const unusable: string[] = [];
    for (const file of sidecars) {
      const short = file.slice(AURORA_DIR.length + 1);
      const doc = JSON.parse(readFileSync(file, 'utf8')) as { vendored?: { path?: unknown } };
      const subject = doc.vendored?.path;
      // ASSERT THE OPERAND IS REAL. A sidecar with no `vendored.path`, or one
      // naming a file that is not there, or one describing a document it does
      // not sit beside, would otherwise be swept past in silence and counted as
      // covered.
      if (typeof subject !== 'string') {
        unusable.push(`${short} has no string vendored.path, so nothing can say what it describes`);
        continue;
      }
      if (!existsSync(resolve(AURORA_DIR, subject))) {
        unusable.push(`${short} names vendored.path ${subject}, which is not on disk`);
        continue;
      }
      if (`${subject.replace(/\.[^.]+$/, '')}.provenance.json` !== short) {
        unusable.push(`${short} claims to describe ${subject}, which is not the file it sits beside`);
        continue;
      }
      for (const target of [subject, short]) {
        if (!corpus.some((text) => quotedPath(target).test(text))) {
          uncovered.push(`${target} is vendored into this repo and NO collected test opens it by path`);
        }
      }
    }
    expect(
      unusable,
      'these provenance sidecars under src/ cannot say which document they describe, so no'
      + ' coverage question can be asked about them',
    ).toEqual([]);
    expect(
      uncovered,
      'these vendored files have no gate: a drift gate reads BOTH the document and its sidecar'
      + ' by path, so add one (see test/formats/effects-schema-drift.test.ts for the shape)'
      + ' rather than letting a copy of a peer contract sit here unchecked',
    ).toEqual([]);
  });
});
