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
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { peerRepo, resolveRev, readAtRev, isAncestor, gitBlobSha, AURORA_DIR } from '../support/peer-repo';

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
   * Applies to every provenance sidecar in test/fixtures, not only this one —
   * and to every PEER REPO a sidecar can pin. A sidecar names its source repo
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

    const root = resolve(AURORA_DIR, 'test/fixtures');
    const sidecars: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = resolve(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.provenance.json')) sidecars.push(p);
      }
    };
    walk(root);
    // Anti-vacuous: if the sweep finds nothing it has measured nothing.
    expect(sidecars.length, 'no .provenance.json sidecars found to check').toBeGreaterThan(0);

    const unpublished: string[] = [];
    const unmeasurable: string[] = [];
    const orphaned: string[] = [];
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
        const tipName = typeof (block as { branch_that_answers_currency?: unknown }).branch_that_answers_currency === 'string'
          ? (block as { branch_that_answers_currency: string }).branch_that_answers_currency
          : repo.defaultTip;
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
