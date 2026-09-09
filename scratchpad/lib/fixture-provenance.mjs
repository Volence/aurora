// ═══════════════════════════════════════════════════════════════════════════
// fixture-provenance — WHICH REVISION OF A PEER REPO THIS RUN ACTUALLY READ
// ═══════════════════════════════════════════════════════════════════════════
//
// THE ROW THIS ANSWERS (Aurora's lens ledger, FIXTURE-REVISION-UNSTAMPED): no
// harness records which revision of a sibling repo it ran against, so a stale
// fixture is indistinguishable from a fresh one. A green run against a three
// week old copy and a green run against today's tip are the same artifact, and
// a result that has quietly stopped describing reality looks exactly like one
// that still does.
//
// The reading side of that problem is already solved in this repo, twice, and
// well: `test/support/peer-repo.ts` reads peers through git objects at a named
// revision, and `test/support/sibling-root.mjs` is the one derivation of where
// those peers live. What was missing is the REPORTING side. Nothing a run
// PRINTS says which revision it consumed, so the reader of a result cannot tell
// the two runs above apart.
//
// This module is the announcement, and it is deliberately the same shape as
// `run-root.mjs`'s `describeRunRoot` / `announceRunRoot`, which does the same
// job for the other question (which BUILT tree a run executed against). One
// idiom, two axes.
//
// ═══ A PROVENANCE RECORD IS SEVERAL CLAIMS AND THEY DO NOT SHARE A CLOCK ═══
//
// This suite has already been burned by a provenance line that read as one
// fact and was two: a build banner whose `revision:` field followed git refs
// while its `tree:`/`-dirty` field followed a BUILD, in the same line, with
// nothing saying so. So nothing here renders a single fused string. A record is
// an ORDERED LIST OF CLAIMS, each with:
//
//   · a `label`  -- what it is called;
//   · a `value`  -- the measurement;
//   · a `tracks` -- the sentence saying WHAT THAT VALUE FOLLOWS, i.e. what
//                   would have to change for it to go stale, and what it may
//                   NOT be read as saying;
//   · an `at`    -- when it was measured, because the dirty-state claim and the
//                   revision claim are read at different instants and one of
//                   them describes a directory that another lane is editing.
//
// `describeFixtureProvenance` prints every claim with its own `tracks` line.
// That is not decoration: a claim with no stated referent is exactly the defect
// above, so `claimsAreLabelled` exists and the gate asserts on it.
//
// ═══ A TREE IDENTITY IS NOT A CODE IDENTITY ═══
//
// Elsewhere in the suite a build id resolved to a docs-only commit, so two
// artifacts with byte-identical behaviour reported different ids. The revision
// here answers exactly one question -- "is this the same fixture I measured
// last time?" -- and every rendering says so in its own `tracks` line. It is
// NOT evidence that any particular feature is present at that revision; only a
// read of the file that carries the feature can say that.
//
// ═══ UNKNOWN IS LOUD, NEVER BLANK ═══
//
// This repo's dominant defect class is a check that reports its blindness as a
// clean result. So there is no code path here that renders "could not determine
// the revision" as an empty string, a zero, or an omitted field. Anything that
// could not be measured lands in `unknown[]`, and a non-empty `unknown[]`
// THROWS unless the caller passed the matching, named allowance. When a caller
// does pass one, the claim renders as `UNKNOWN: <why>` and the description
// carries a banner, so it cannot be skimmed past.
//
// ═══ NOTHING HERE OPENS OR WRITES A PEER'S FILES ═══
//
// Every peer path is handed to `git -C` and nothing else. The revision is read
// from the object database; the dirty state is read from git's own index
// report. No absolute peer path is written down: the checkout is resolved
// through `sibling-root.mjs`, which is the suite's one derivation and the only
// module allowed to read `AEON_DIR` and its siblings.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { siblingPath, siblingPathSource, checkoutEnv } from '../../test/support/sibling-root.mjs';

/** Raised for anything this module could not measure. Never swallowed here. */
export class FixtureProvenanceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FixtureProvenanceError';
  }
}

/**
 * HOW THE FIXTURE'S BYTES WERE OBTAINED. The two modes are not a formatting
 * choice -- they change what the revision MEANS, so the caller must state one.
 *
 *   COMMITTED  the bytes came out of the object database (`git archive`,
 *              `git show <rev>:<path>`, `git cat-file`). The revision names the
 *              bytes exactly. The peer's working tree was never opened, so its
 *              dirty state is INFORMATIONAL: those edits are NOT in this
 *              fixture.
 *
 *   WORKTREE   the bytes were read from files inside the peer checkout. The
 *              revision names the BASE only. If the tree is dirty, NO revision
 *              describes what this run read, and the dirty claim is the
 *              load-bearing one.
 */
export const READ_MODES = Object.freeze({ COMMITTED: 'committed', WORKTREE: 'worktree' });

const MODE_VALUES = Object.freeze([READ_MODES.COMMITTED, READ_MODES.WORKTREE]);

/** 64 MiB, matching `peer-repo.ts`. A buffer overrun is not "git said no". */
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

/**
 * `git -C <dir> <args>` returning stdout, or a REASON. Never null-for-both:
 * "could not run" and "ran and answered nothing" stay different answers, which
 * is the whole premise of the module this one sits beside.
 */
function runGit(dir, args) {
  try {
    return {
      ok: true,
      out: execFileSync('git', ['-C', dir, ...args], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: GIT_MAX_BUFFER,
      }),
    };
  } catch (e) {
    const status = e && typeof e === 'object' && 'status' in e ? e.status : undefined;
    const code = e && typeof e === 'object' && 'code' in e ? e.code : undefined;
    if (code === 'ENOBUFS') {
      throw new FixtureProvenanceError(
        `fixture-provenance: git ${args.join(' ')} in ${dir} exceeded the ${GIT_MAX_BUFFER}-byte `
        + 'read buffer. That is not an unresolvable revision. Raise GIT_MAX_BUFFER rather than '
        + 'letting a caller report this as unknown provenance.',
      );
    }
    return { ok: false, why: `git ${args.join(' ')} exited ${status ?? code ?? '?'} in ${dir}` };
  }
}

const SHA40 = /^[0-9a-f]{40}$/;

/**
 * The provenance of one peer-repo fixture, as a list of separately readable
 * claims.
 *
 * @param {object} opts
 * @param {string} opts.peer            suite repo name, e.g. `aeon`. Resolved
 *                                      through `sibling-root.mjs`; no peer path
 *                                      is ever typed by a caller.
 * @param {string} opts.mode            one of `READ_MODES`. Required: it decides
 *                                      what the revision claim is allowed to say.
 * @param {string} [opts.ref]           COMMITTED mode only, and REQUIRED there:
 *                                      the revision the caller asked for
 *                                      (`origin/master`, a pinned SHA). Passing
 *                                      one in WORKTREE mode is refused, because
 *                                      a ref beside working-tree bytes reads as
 *                                      a claim that those bytes came from it.
 * @param {string} [opts.dir]           an already-resolved checkout, for a caller
 *                                      that materialised its own. Requires
 *                                      `dirSource`.
 * @param {string} [opts.dirSource]     the sentence saying how `dir` was chosen.
 * @param {boolean} [opts.allowUnrevisioned]        accept a directory that is
 *                                      not a git checkout, rendering the
 *                                      revision as a loud UNKNOWN.
 * @param {boolean} [opts.allowUnknownWorktreeState] accept a checkout whose
 *                                      dirty state could not be read.
 * @param {(dir: string, args: string[]) => {ok: boolean, out?: string, why?: string}} [opts.git]
 *                                      injected for the gate; defaults to real git.
 * @returns {FixtureProvenance}
 */
export function fixtureProvenance({
  peer,
  mode,
  ref,
  dir,
  dirSource,
  allowUnrevisioned = false,
  allowUnknownWorktreeState = false,
  git = runGit,
} = {}) {
  if (typeof peer !== 'string' || peer.length === 0) {
    throw new FixtureProvenanceError(
      `fixtureProvenance: no peer repo named (got ${JSON.stringify(peer)}). Name the suite repo `
      + 'the fixture came from, for example "aeon".',
    );
  }
  if (!MODE_VALUES.includes(mode)) {
    throw new FixtureProvenanceError(
      `fixtureProvenance: mode must be one of ${MODE_VALUES.join(', ')}, got ${JSON.stringify(mode)}. `
      + 'It is required because it decides what the revision is allowed to mean: in '
      + `"${READ_MODES.COMMITTED}" the revision names the bytes, in "${READ_MODES.WORKTREE}" it names `
      + 'only the base they were edited from.',
    );
  }
  if (mode === READ_MODES.COMMITTED && (typeof ref !== 'string' || ref.length === 0)) {
    throw new FixtureProvenanceError(
      `fixtureProvenance: mode "${READ_MODES.COMMITTED}" needs the ref the caller asked for `
      + `(got ${JSON.stringify(ref)}). The resolved SHA alone loses the question that was asked, `
      + 'and "origin/master" resolved yesterday and "origin/master" resolved today are two '
      + 'different fixtures wearing one name.',
    );
  }
  if (mode === READ_MODES.WORKTREE && ref !== undefined) {
    throw new FixtureProvenanceError(
      `fixtureProvenance: mode "${READ_MODES.WORKTREE}" was given ref ${JSON.stringify(ref)}. `
      + 'A working-tree read consumed whatever is on disk; printing a ref beside it reads as a '
      + 'claim that the bytes came from that revision, which is the misreading this module '
      + `exists to prevent. Use mode "${READ_MODES.COMMITTED}" if the bytes really came from `
      + 'the object database.',
    );
  }
  if (dir !== undefined && (typeof dirSource !== 'string' || dirSource.length === 0)) {
    throw new FixtureProvenanceError(
      'fixtureProvenance: an explicit dir must come with dirSource, the sentence saying how it '
      + 'was chosen. A path with no stated origin is the untracked claim this module refuses.',
    );
  }

  const resolvedDir = dir ?? siblingPath(peer);
  const resolvedSource = dir === undefined ? siblingPathSource(peer) : dirSource;
  if (resolvedDir === null || resolvedDir === undefined || !existsSync(resolvedDir)) {
    throw new FixtureProvenanceError(
      `fixtureProvenance: no ${peer} checkout to take provenance from `
      + `(${resolvedSource ?? 'unresolved'}). Set ${checkoutEnv(peer)} to that checkout. `
      + 'This is a hard error and not a skip: a run that cannot say which revision it read has '
      + 'no provenance to report, and reporting none as blank is the defect.',
    );
  }

  const at = new Date().toISOString();
  const unknown = [];

  const inside = git(resolvedDir, ['rev-parse', '--is-inside-work-tree']);
  const isRepo = inside.ok && inside.out.trim() === 'true';

  let revision = null;
  let revisionWhy = null;
  if (!isRepo) {
    revisionWhy = `${resolvedDir} is not a git checkout (${inside.ok ? `answered ${JSON.stringify(inside.out.trim())}` : inside.why}), `
      + 'so no revision can be resolved and this fixture cannot be compared with any other run';
    unknown.push({ claim: 'revision', why: revisionWhy, allowedBy: 'allowUnrevisioned', allowed: allowUnrevisioned });
  } else {
    const asked = mode === READ_MODES.COMMITTED ? ref : 'HEAD';
    const r = git(resolvedDir, ['rev-parse', '--verify', '--quiet', `${asked}^{commit}`]);
    const sha = r.ok ? r.out.trim() : '';
    if (SHA40.test(sha)) {
      revision = sha;
    } else {
      // NOT an allowance. A ref the caller named and git cannot resolve is a
      // question that was asked and not answered, and the caller must not be
      // able to opt out of hearing that.
      throw new FixtureProvenanceError(
        `fixtureProvenance: ${JSON.stringify(asked)} does not resolve to a commit in ${resolvedDir} `
        + `(${r.ok ? `answered ${JSON.stringify(sha)}` : r.why}). Unfetched, shallow, or a typo. `
        + 'Refusing rather than reporting this run as having unknown provenance.',
      );
    }
  }

  let worktree = null;
  let worktreeWhy = null;
  if (!isRepo) {
    worktreeWhy = `${resolvedDir} is not a git checkout, so git cannot report uncommitted changes in it`;
    unknown.push({ claim: 'worktree', why: worktreeWhy, allowedBy: 'allowUnrevisioned', allowed: allowUnrevisioned });
  } else {
    // `--no-optional-locks` is load-bearing, not tidiness: a plain `git status`
    // refreshes the index and takes `.git/index.lock` to do it, which is a WRITE
    // into another lane's live checkout while that lane may be mid-command.
    // This module is read-only in every branch, and that flag is what makes the
    // dirty-state read read-only too.
    const st = git(resolvedDir, ['--no-optional-locks', 'status', '--porcelain']);
    if (st.ok) {
      const lines = st.out.split('\n').filter((l) => l.length > 0);
      worktree = { dirty: lines.length > 0, changed: lines.length, at };
    } else {
      worktreeWhy = `${st.why}, so whether another lane has uncommitted work here is unmeasured`;
      unknown.push({
        claim: 'worktree', why: worktreeWhy, allowedBy: 'allowUnknownWorktreeState', allowed: allowUnknownWorktreeState,
      });
    }
  }

  const refused = unknown.filter((u) => !u.allowed);
  if (refused.length > 0) {
    throw new FixtureProvenanceError(
      `fixtureProvenance: ${refused.length} claim(s) about the ${peer} fixture could not be `
      + `measured, and none of them was allowed by name:\n`
      + refused.map((u) => `  ${u.claim}: ${u.why}\n    (pass ${u.allowedBy}: true to accept this, `
        + 'which renders it as a loud UNKNOWN rather than hiding it)').join('\n'),
    );
  }

  /**
   * `revisionNamesBytes` is the single boolean a caller should branch on. It is
   * true only when the bytes came out of the object database at a resolved
   * commit; a dirty working-tree read is false, and so is an unrevisioned
   * directory. It is deliberately NOT "is there a revision", because in
   * WORKTREE mode there is always a HEAD and it does not name what was read.
   */
  const revisionNamesBytes = mode === READ_MODES.COMMITTED && revision !== null;

  const claims = [];
  claims.push({
    label: 'checkout',
    value: resolvedDir,
    tracks: `which ${peer} checkout this run opened. Resolved by: ${resolvedSource}`,
    at,
  });
  claims.push({
    label: 'read mode',
    value: mode === READ_MODES.COMMITTED
      ? 'COMMITTED OBJECTS. git read the object database; the peer working tree was never opened'
      : 'WORKING TREE. the bytes read are whatever was on disk in that checkout at the time',
    tracks: 'how the bytes were obtained, which is what decides whether the revision below names '
      + 'them or only names what they were edited from',
    at,
  });
  if (mode === READ_MODES.COMMITTED) {
    claims.push({
      label: 'ref asked for',
      value: ref,
      tracks: SHA40.test(ref)
        ? 'the revision the caller pinned. A full SHA, so it cannot move under the caller'
        : 'the revision the caller ASKED FOR. This is a MOVING name: it resolves to a different '
          + 'commit whenever that peer pushes, so it does not identify a fixture on its own',
      at,
    });
  }
  claims.push({
    label: 'revision',
    value: revision === null ? `UNKNOWN: ${revisionWhy}` : revision,
    tracks: revision === null
      ? 'nothing. There is no revision, so THIS RUN CANNOT BE COMPARED WITH ANY OTHER RUN'
      : (mode === READ_MODES.COMMITTED
        ? 'WHICH BYTES this run consumed. Compare it with an earlier run to answer "is this the '
          + 'same fixture I measured before". It is NOT evidence that any feature is present at '
          + 'that revision; only reading the file that carries the feature can say that'
        : 'the BASE this checkout sits on, and only that. It does NOT name the bytes this run '
          + 'read, because a working-tree read consumes uncommitted edits too'),
    at,
  });
  claims.push({
    label: `${peer} working tree`,
    value: worktree === null
      ? `UNKNOWN: ${worktreeWhy}`
      : (worktree.dirty ? `DIRTY, ${worktree.changed} path(s) uncommitted` : 'clean, nothing uncommitted'),
    tracks: worktree === null
      ? 'nothing, and in WORKTREE mode that is the claim that decides whether the revision above '
        + 'means anything'
      : (mode === READ_MODES.COMMITTED
        ? `that peer's DISK at ${worktree.at}, not this fixture. Informational: any edits counted `
          + 'here are NOT in the bytes this run read, because the read went to the object database'
        : `THIS FIXTURE, measured at ${worktree.at}. Dirty means no revision describes the bytes `
          + 'this run consumed, so the revision above is a base and not an identity'),
    at: worktree === null ? at : worktree.at,
  });

  return {
    peer,
    dir: resolvedDir,
    dirSource: resolvedSource,
    mode,
    ref: mode === READ_MODES.COMMITTED ? ref : null,
    revision,
    revisionNamesBytes,
    worktree,
    unknown,
    at,
    claims,
  };
}

/**
 * True when every claim carries a non-empty `tracks` sentence.
 *
 * This is not a style check. A provenance record is several claims that do not
 * share a clock, and the fused-banner defect this module was written after was
 * exactly a value printed with no statement of what it followed. A claim added
 * later without a referent must turn this false, so the gate can see it.
 */
export function claimsAreLabelled(p) {
  return Array.isArray(p?.claims)
    && p.claims.length > 0
    && p.claims.every((c) => typeof c.label === 'string' && c.label.length > 0
      && typeof c.value === 'string' && c.value.length > 0
      && typeof c.tracks === 'string' && c.tracks.length > 0
      && typeof c.at === 'string' && c.at.length > 0);
}

const UNKNOWN_BANNER = '!! PROVENANCE INCOMPLETE. This run cannot fully say which fixture it read.';

/**
 * The block a run PRINTS, rendered from the record and never re-derived.
 *
 * Every claim gets its own line plus its own `tracks:` line underneath, because
 * a reader who takes one number out of this block must be able to see what that
 * number follows without reading the rest.
 */
export function describeFixtureProvenance(p) {
  if (!claimsAreLabelled(p)) {
    throw new FixtureProvenanceError(
      'describeFixtureProvenance: the record carries a claim with no label, no value, no tracks '
      + 'sentence or no timestamp. A value printed without saying what it follows is the exact '
      + 'defect this module exists to prevent, so it refuses to render rather than print it.',
    );
  }
  const width = Math.max(...p.claims.map((c) => c.label.length));
  const lines = [`fixture: ${p.peer}`];
  for (const c of p.claims) {
    lines.push(`  ${c.label.padEnd(width)} : ${c.value}`);
    lines.push(`  ${' '.repeat(width)}   tracks: ${c.tracks}`);
  }
  if (p.unknown.length > 0) lines.push(`  ${UNKNOWN_BANNER}`);
  return lines.join('\n');
}

/** The banner text, exported so a gate asserts on the same string that prints. */
export { UNKNOWN_BANNER };

/**
 * Resolve and PRINT in one call -- the line a harness puts before its work.
 *
 * `write` is injectable so a row can capture the block instead of the terminal,
 * the same arrangement `announceRunRoot` uses for the built-tree question.
 */
export function announceFixture(opts, write = (s) => process.stderr.write(s)) {
  const p = fixtureProvenance(opts);
  write(`${describeFixtureProvenance(p)}\n`);
  return p;
}
