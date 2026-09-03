/**
 * check-ledger-timestamps — fail the run when a NEWLY APPENDED ledger entry carries a
 * timestamp that was not read off a clock.
 *
 *     npm run check:ledger-timestamps        (and it is in the `npm test` chain)
 *
 * WHAT IS BEING POLICED
 * ---------------------
 * `docs/lane-log.jsonl` and `docs/decisions.jsonl` are append-only ledgers whose `at`
 * field is contractually required to come from `date -u +%Y-%m-%dT%H:%M:%SZ` and never
 * from the writer's memory. Nothing enforced it, and the two ways to break it are
 * REMEMBERING a time and BACKFILLING one.
 *
 * The measurement is not mine and is not repeated here. It lives in
 * `scratchpad/ledger-timestamp-audit.py`, whose docstring states the method, the
 * first-appearance keying, the two-sided reporting and the limits. Read that file; this
 * one only decides what makes the suite red. In short: it compares an entry's `at`
 * against the committer time of the commit that FIRST introduced it, and on aurora's
 * lane-log the honest cohort sits at median 0s / p90 17s while the round-numbered one
 * sits at median 242s / p90 1192s.
 *
 * THIS IS A RATCHET, AND THE CUTOFF IS ON THE COMMIT
 * --------------------------------------------------
 * Aurora's ledgers already hold entries that fail the audit. Running the audit bare would
 * make this gate red forever, which teaches people to ignore the suite; rewriting those
 * entries is forbidden — the ledgers are append-only and are not rewritten. So the gate
 * grandfathers everything introduced before an in-force instant and binds everything
 * after it.
 *
 * The cutoff is on the COMMITTER TIME of the commit that introduced the entry. NOT on the
 * entry's own `at`, and that is the whole subtlety:
 *
 *   · cutoff on `at` — "only check entries claiming to be newer than D" — lets an entry
 *     BACKFILLED TODAY WITH AN OLD `at` slip under the cutoff unchecked. Backfilling is
 *     precisely one of the two defects being gated, so that form of the ratchet silently
 *     reopens the hole the gate exists to close.
 *   · cutoff on COMMITTER TIME — "every entry introduced after D complies, whatever `at`
 *     it claims" — has no such hole. An entry committed today is judged today.
 *
 * THE GRANDFATHERED COUNT IS PRINTED ON EVERY RUN, with the reason. A ratchet that
 * silently ignores a population is the same defect class as a check that reports only
 * what it judged.
 *
 * WHERE THE IN-FORCE INSTANT COMES FROM
 * -------------------------------------
 * `IN_FORCE` below was read off `date -u +%Y-%m-%dT%H:%M:%SZ` at the moment this file was
 * written, immediately before the commit that introduced it, so it sits a few seconds
 * BEFORE that commit and the gate binds its own landing and everything after. Nothing
 * before the gate existed is bound, which is the property asked for.
 *
 * It is a pinned constant rather than a runtime derivation on purpose: deriving it from
 * the gate's own add-commit would move it later under any history rewrite (a squash
 * merge, a rebase), and a cutoff that drifts later is a cutoff that silently grandfathers
 * more. A constant cannot drift. What IS derived is the CROSS-CHECK: the gate reads the
 * committer time of the commit that first added this file and refuses to run if the
 * pinned instant is later than it, because an instant edited forward — the one way to
 * make this gate ignore a bad entry without touching the audit — would land exactly
 * there.
 *
 * ANTI-VACUOUS — THE RATCHET IS PROVEN IN BOTH DIRECTIONS ON EVERY RUN
 * --------------------------------------------------------------------
 * A gate that only shells out to the audit and reads its exit code has a success state
 * and a failure state that are the same artifact when the audit stops seeing anything.
 * So before it judges this repo at all, this file builds throwaway git repositories under
 * `mkdtemp` — a real ledger, real commits, committer times set explicitly — and runs the
 * identical command line against them. Each case names the exact exit status it expects,
 * text that must appear, and text that must NOT:
 *
 *   K1  an entry stamped 40 minutes before its commit, COMMITTED BEFORE the cutoff:
 *       exit 0, "0 entries IN SCOPE", "1 GRANDFATHERED", and no OVER THRESHOLD section.
 *       This is the direction nobody tests. Without it the gate has been shown to catch
 *       new defects and NOT shown to spare old ones, i.e. the ratchet is untested and
 *       only the audit — which already worked — has been exercised.
 *   K2  the same repo plus an honest entry committed after the cutoff: still exit 0, and
 *       now "1 entry IN SCOPE". Proves the gate is not merely always-green-by-emptiness.
 *   K3  an entry stamped 5 SECONDS AFTER its own commit, in scope: exit 0 without
 *       `--strict-ahead` and exit 1 WITH it. Five seconds is under the 120s threshold on
 *       purpose — this is the case the exit status used to miss while the report called
 *       it a finding, and it is why the gate passes `--strict-ahead`.
 *   K4  an entry stamped 20 minutes before its commit, in scope: exit 1, naming that
 *       entry's stamp. The other direction of the ratchet.
 *   K4b an entry BACKFILLED — committed after the cutoff, with an `at` claiming a date
 *       BEFORE it: exit 1, and reported as IN SCOPE rather than grandfathered. This is
 *       the ONLY case that tells the two possible cutoffs apart; every other case here
 *       behaves the same whether the cutoff reads the commit or the entry's own `at`, so
 *       without it the whole canary set would go on printing OK with the cutoff moved
 *       onto `at` and the gate blind to half of what it exists to catch.
 *   K5  a line that is not JSON, committed in scope: exit 1, "UNPARSEABLE IN SCOPE". A
 *       line the audit cannot read must not read as a line that passed.
 *   K6  two NEW entries sharing one second: exit 1, "BOTH APPEARANCES IN SCOPE". The
 *       audit keys on the stamp, so the second such entry goes unjudged; that is a
 *       harmless miss for a repair commit re-adding an old line and a hole for two new
 *       ones. (This line used to credit the innocent half to "K1's repo". K1's repo has
 *       ONE commit and performs no re-add, so nothing measured it until K6g below — an
 *       assertion standing in for a case, in the file whose whole argument is that those
 *       are not the same thing.)
 *   K6b a bad entry CORRECTED by a later commit: exit 0, with the old stamp counted and
 *       printed as no longer in the file. This is the REMEDY, and the gate had none until
 *       the red-first proof found it: first appearance keys on the stamp, so the bad `at`
 *       stays in that commit's diff forever and no commit anyone could make would clear
 *       the run. That is a permanently-red suite — the failure the ratchet exists to
 *       prevent, reintroduced at a different point.
 *   K6c a correction that is ITSELF remembered: exit 1. The replacement is judged at its
 *       own commit, so the remedy cannot launder a stamp, only replace one.
 *   K6d two NEW entries sharing one stamp, THE SECOND corrected: exit 0, with the
 *       withdrawn collision counted and printed. This is the remedy above, applied to the
 *       one failure it could not reach. A collision used to be keyed on its STAMP, and
 *       the innocent sibling carries that stamp at HEAD forever, so correcting the
 *       offending entry cleared nothing and only changing BOTH stamps did — which the
 *       failure text never said. That is a permanently-red suite for the one case K6
 *       itself calls a hole, and it happened here for real (`9f51a2ff`).
 *   K6e the same collision with THE FIRST corrected instead: still exit 1. THE TWO
 *       DIRECTIONS ARE NOT SYMMETRIC and a fix that cleared both would have reopened K6's
 *       hole while looking like a remedy — the later appearance is the one that went
 *       unjudged, and it is still in the file.
 *   K6f the collision remedy ITSELF remembered: exit 1 as OVER THRESHOLD, judged at its
 *       own commit. K6c's property on the collision path — the remedy replaces a stamp,
 *       it never launders one.
 *   K6g a repair commit re-adding a GRANDFATHERED line: exit 0, reported and not failed.
 *       K6's comment credited this to K1's repo, which has one commit and performs no
 *       re-add, so the innocent direction of `dup_fail`'s `first_ctime >= since` clause
 *       was asserted and never measured.
 *   K6h the colliding line REMOVED then RESTORED verbatim, nothing corrected: still
 *       exit 1. Keyed on the line it is still at HEAD, which is right — the stamp is
 *       still an unjudged claim. The rejected alternative (COUNT the occurrences at HEAD
 *       against the times the line was added) goes SILENTLY GREEN here, on the dominant
 *       innocent commit pattern the audit's header opens with. Measured on both.
 *   K6i THE LIMIT, pinned: two BYTE-IDENTICAL appearances, the second corrected — still
 *       exit 1. `--only-present` asks whether a collision's own line survives at HEAD, and
 *       two identical lines are one string to a set. It errs RED, never green. Counting
 *       WOULD cover this one; K6h is the price of counting, and a stuck red announces
 *       itself where a silent green does not. Written up under LIMITS in the audit;
 *       asserted here so K6d is not read as covering it.
 *   K7  a ledger path git does not track: exit 2, and the gate treats 2 as FAILURE. A
 *       gate that cannot see is not a gate that passed.
 *
 * And every failure rule must have FIRED on some case (`RULES_EXERCISED`), because a rule
 * whose pattern silently stops matching would otherwise contribute nothing forever and
 * read as "that class is clean".
 *
 * EXIT CODES
 *   0  every entry introduced at or after the in-force instant checks out
 *   1  at least one does not
 *   2  could not measure — python3 missing, the audit missing, a canary misbehaving, the
 *      in-force instant not corroborated, or the audit itself exiting 2 on a real ledger
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AURORA_DIR, auroraDirSource } from '../test/support/sibling-root.mjs';

const PREFIX = 'check-ledger-timestamps';

/**
 * THE IN-FORCE INSTANT. Read off `date -u +%Y-%m-%dT%H:%M:%SZ` on 2026-09-02, seconds
 * before the commit that introduced this file, so the gate binds its own landing and
 * everything after it and nothing before.
 *
 * Every entry whose FIRST-APPEARANCE COMMIT is at or after this is judged. Everything
 * earlier is grandfathered, counted and reported — not hidden. Editing this forward is
 * how someone would make the gate ignore a bad entry without touching the audit, and
 * `crossCheckInForce()` below refuses to run if it is later than this file's own
 * add-commit.
 */
const IN_FORCE = '2026-09-02T10:22:28Z';

/** This file, as git knows it — the anchor the cross-check reads. */
const SELF = 'scripts/check-ledger-timestamps.mjs';

/** The audit. Its path is relative to this repo; it takes ledger and repo as arguments. */
const AUDIT = 'scratchpad/ledger-timestamp-audit.py';

/**
 * The ledgers this repo is answerable for.
 *
 * WHERE THE AUDIT PERMANENTLY LIVES — one script in empyrean run over every lane, or a
 * copy per lane — is parked with the owner and is deliberately not answered here. The
 * audit takes ledger and repo as arguments and bakes in no path, so it lifts unedited
 * either way; this list is only which files THIS repo's own `npm test` is responsible for.
 */
const LEDGERS = ['docs/lane-log.jsonl', 'docs/decisions.jsonl'];

function die(msg) {
  console.error(`${PREFIX}: COULD NOT MEASURE — ${msg}`);
  process.exit(2);
}

/** Run the audit. Returns {status, out} with stdout and stderr joined in emission order. */
function audit(repo, ledger, extra = []) {
  const r = spawnSync('python3', [join(AURORA_DIR, AUDIT), ledger, '--repo', repo, ...extra], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.error) {
    die(`could not run python3 (${r.error.message}). The audit is a Python program and `
      + 'nothing about these ledgers was checked.');
  }
  if (r.signal) die(`the audit was killed by ${r.signal} on ${ledger} in ${repo}.`);
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// ---------------------------------------------------------------------------
// THE CANARY BED. A real git repository, real commits, committer times set.
// ---------------------------------------------------------------------------

/**
 * THE FLAGS, defined once and used by BOTH the canaries and the real ledgers.
 *
 * If the canaries ran a different command line from the real run they would stop being
 * evidence about it — the shape where a check is exercised in one configuration and
 * trusted in another. `gateArgs` is what every invocation below goes through; the `drop`
 * argument exists only for K3a, which is precisely a case about a flag being absent.
 */
const AUDIT_FLAGS = ['--strict-ahead', '--only-present'];
const gateArgs = (since, drop = []) =>
  ['--since', since, ...AUDIT_FLAGS.filter((f) => !drop.includes(f))];

/** A synthetic epoch, far from any real ledger, so no case can accidentally read one. */
const T = (day, hh, mm, ss = 0) =>
  `2001-01-${String(day).padStart(2, '0')}T${String(hh).padStart(2, '0')}:`
  + `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}Z`;

/** The canary cutoff: after day 1's commit, before day 3's. */
const CANARY_SINCE = T(2, 0, 0);
const BED_LEDGER = 'docs/lane-log.jsonl';

/**
 * Build a throwaway repo whose ledger grows one commit at a time.
 *
 * `commits` is [{ at: <committer time>, lines: [<raw ledger line>, …] }]. Committer AND
 * author dates are pinned so a case's expectation is arithmetic, never the wall clock,
 * and identity comes from the environment rather than the machine's git config so the bed
 * builds on a box that has none.
 *
 * A commit may instead give `body`, the WHOLE file as it should stand after it. `rewrite`
 * can only correct the LAST line, and the duplicate cases below need to correct the FIRST
 * of two colliding entries as well — the direction that must NOT clear the run. Stating
 * the file outright is the only way to build that, and it keeps the two directions built
 * by one mechanism so neither is an artifact of how its bed was assembled.
 */
function bed(commits) {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-ledger-canary-'));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'canary', GIT_AUTHOR_EMAIL: 'canary@example.invalid',
    GIT_COMMITTER_NAME: 'canary', GIT_COMMITTER_EMAIL: 'canary@example.invalid',
  };
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { env, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  mkdirSync(join(dir, 'docs'), { recursive: true });
  let body = [];
  for (const c of commits) {
    if (c.body) {
      body = [...c.body];
    } else {
      // `rewrite: true` drops the LAST line before appending — the shape a correction
      // takes, and the only way to build the remedy case.
      if (c.rewrite) body.pop();
      body.push(...c.lines);
    }
    writeFileSync(join(dir, BED_LEDGER), `${body.join('\n')}\n`);
    git('add', BED_LEDGER);
    execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `at ${c.at}`], {
      env: { ...env, GIT_AUTHOR_DATE: c.at, GIT_COMMITTER_DATE: c.at },
      encoding: 'utf8',
    });
  }
  return dir;
}

/** A ledger line with a given stamp. `n` only keeps distinct entries distinguishable. */
const line = (at, n) => JSON.stringify({ at, headline: `canary entry ${n}` });

/** Committed on day 1, stamped 40 minutes earlier — plainly bad, and before the cutoff. */
const OLD_BAD = { at: T(1, 12, 0), lines: [line(T(1, 11, 20), 'old-bad')] };
/** Committed on day 3, stamped at the same second — the honest shape, in scope. */
const NEW_GOOD = { at: T(3, 9, 0), lines: [line(T(3, 9, 0), 'new-good')] };
/** Committed on day 4, stamped 5s AFTER its commit — under the threshold, still a finding. */
const NEW_AHEAD = { at: T(4, 9, 0), lines: [line(T(4, 9, 0, 5), 'new-ahead')] };
/** Committed on day 5, stamped 20 minutes earlier — remembered, in scope. */
const NEW_BAD = { at: T(5, 9, 0), lines: [line(T(5, 8, 40), 'new-bad')] };
/**
 * THE BACKFILL, and the only case that tells the two possible cutoffs apart.
 *
 * Committed on day 5 — after the cutoff — with an `at` claiming day 1, before it. Under
 * the ratchet as built (cutoff on COMMITTER TIME) this entry is in scope and fails. Under
 * the tempting alternative (cutoff on the entry's own `at`) it would be grandfathered and
 * pass, and the gate would be blind to exactly half of what it exists to catch.
 *
 * ⚠ WITHOUT THIS CASE THE CANARY SET LOOKED COMPLETE AND WAS NOT: every other case here
 * behaves identically under both cutoffs, so the whole suite would have gone on printing
 * OK with the cutoff moved onto `at`.
 */
const BACKFILLED = { at: T(5, 9, 0), lines: [line(T(1, 10, 0), 'backfilled')] };

/**
 * THE COLLISION — two NEW in-scope entries sharing one stamp, which is K6's hole and the
 * one failure the gate's advertised remedy could not reach until 2026-09-03.
 *
 * The remedy is "correct the entry in a follow-up commit". A collision was keyed on its
 * STAMP, and the innocent sibling goes on carrying that stamp at HEAD forever, so no
 * correction of the offending entry cleared it — only changing BOTH stamps did, which the
 * gate never said. It happened for real in this repo (`9f51a2ff`, "clear the shared
 * stamp"): the fix had to touch both entries. K6d–K6h below pin all four directions.
 */
const SHARED_AT = T(3, 9, 0);
const OLD_BAD_LINE = OLD_BAD.lines[0];
const PAIR_A = line(SHARED_AT, 'first-of-pair');
const PAIR_B = line(SHARED_AT, 'second-of-pair');
/** Both entries committed after the cutoff — so both appearances are in scope. */
const COLLIDE = [OLD_BAD, { at: T(3, 9, 0), lines: [PAIR_A] }, { at: T(4, 9, 0), lines: [PAIR_B] }];
/** Two appearances that are BYTE-IDENTICAL — the documented limit of the fix. */
const TWIN = line(SHARED_AT, 'twin');

const CASES = [
  {
    name: 'K1 old bad entry, committed before the cutoff — GRANDFATHERED, not a failure',
    commits: [OLD_BAD],
    args: gateArgs(CANARY_SINCE),
    status: 0,
    want: ['0 entries IN SCOPE', '1 GRANDFATHERED'],
    absent: ['OVER THRESHOLD', 'STAMPED AHEAD'],
    fires: [],
  },
  {
    name: 'K2 an honest entry after the cutoff — judged, and passes',
    commits: [OLD_BAD, NEW_GOOD],
    args: gateArgs(CANARY_SINCE),
    status: 0,
    want: ['1 entry IN SCOPE', '1 GRANDFATHERED'],
    absent: ['OVER THRESHOLD'],
    fires: [],
  },
  {
    name: 'K3a an entry 5s AHEAD of its commit, in scope, WITHOUT --strict-ahead — exit 0',
    commits: [OLD_BAD, NEW_AHEAD],
    args: gateArgs(CANARY_SINCE, ['--strict-ahead']),
    status: 0,
    want: ['STAMPED AHEAD OF ITS OWN COMMIT (1)', 'pass --strict-ahead'],
    absent: [],
    fires: [],
  },
  {
    name: 'K3b the same entry WITH --strict-ahead — exit 1',
    commits: [OLD_BAD, NEW_AHEAD],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['ALL OF THESE FAIL THIS RUN', T(4, 9, 0, 5)],
    absent: [],
    fires: ['strict-ahead'],
  },
  {
    name: 'K4 a bad entry committed after the cutoff — exit 1, naming it',
    commits: [OLD_BAD, NEW_BAD],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['OVER THRESHOLD (1)', T(5, 8, 40), '1 GRANDFATHERED'],
    absent: [],
    fires: ['over-threshold'],
  },
  {
    name: 'K4b an entry BACKFILLED after the cutoff with an old `at` — exit 1, IN SCOPE',
    commits: [OLD_BAD, BACKFILLED],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    // "1 entry IN SCOPE" and "1 GRANDFATHERED" together are the discriminator: a cutoff
    // placed on `at` would put this entry among the grandfathered and report 0 in scope.
    want: ['1 entry IN SCOPE', '1 GRANDFATHERED', 'OVER THRESHOLD (1)', T(1, 10, 0)],
    absent: ['0 entries IN SCOPE', '2 GRANDFATHERED'],
    fires: ['backfill-in-scope', 'over-threshold'],
  },
  {
    name: 'K5 an unparseable line committed after the cutoff — exit 1, not a silent skip',
    commits: [OLD_BAD, { at: T(3, 9, 0), lines: ['this line is not json'] }],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['UNPARSEABLE IN SCOPE (1)'],
    absent: [],
    fires: ['unparseable'],
  },
  {
    name: 'K6 two NEW entries sharing one stamp — exit 1, the second went unjudged',
    commits: [OLD_BAD, NEW_GOOD, { at: T(4, 9, 0), lines: [line(T(3, 9, 0), 'collides')] }],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['BOTH APPEARANCES IN SCOPE'],
    absent: [],
    fires: ['duplicate-in-scope'],
  },
  {
    // THE REMEDY, and the gate has none without it. Commit 2 rewrites the same entry
    // with a stamp read at its own commit; commit 1's bad stamp is still in the diff
    // forever, so without --only-present this repo is red with no move left to make.
    name: 'K6b a bad entry CORRECTED by a later commit — exit 0, and the correction counted',
    commits: [
      OLD_BAD,
      { at: T(5, 9, 0), lines: [line(T(5, 8, 40), 'to-be-corrected')] },
      { at: T(6, 9, 0), lines: [line(T(6, 9, 0), 'to-be-corrected')], rewrite: true },
    ],
    args: gateArgs(CANARY_SINCE),
    status: 0,
    want: ['NO LONGER IN THE FILE', '1 in-scope stamp'],
    absent: ['OVER THRESHOLD'],
    fires: ['withdrawn'],
  },
  {
    // …and the correction must not become a way to launder a bad stamp: the REPLACEMENT
    // is judged at ITS commit, so a correction that is itself remembered still fails.
    name: 'K6c a correction that is itself remembered — exit 1, judged at its own commit',
    commits: [
      OLD_BAD,
      { at: T(5, 9, 0), lines: [line(T(5, 8, 40), 'to-be-corrected')] },
      { at: T(6, 9, 0), lines: [line(T(6, 8, 40), 'to-be-corrected')], rewrite: true },
    ],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['OVER THRESHOLD (1)', T(6, 8, 40)],
    absent: [],
    fires: ['over-threshold'],
  },
  {
    // THE REMEDY, REACHED, for the one failure it could not reach. Correcting the LATER
    // appearance — the entry that actually went unjudged — clears the run, because the
    // collision is now asked about its OWN LINE and that line is gone from HEAD.
    name: 'K6d two NEW entries share a stamp, THE SECOND corrected — exit 0, and counted',
    commits: [...COLLIDE,
      { at: T(5, 9, 0), body: [OLD_BAD_LINE, PAIR_A, line(T(5, 9, 0), 'second-of-pair')] }],
    args: gateArgs(CANARY_SINCE),
    status: 0,
    // The withdrawn collision must be COUNTED AND PRINTED, not dropped. A population that
    // leaves the report is the defect class this whole file exists to avoid, so the
    // RATCHET line's count and the listing's marker are both asserted, not just the exit.
    want: ['1 in-scope REPEATED stamp', 'COLLIDING LINE WITHDRAWN', 'DUPLICATE STAMPS (1)'],
    absent: ['TWO IN-SCOPE ENTRIES SHARE ONE STAMP', 'OVER THRESHOLD'],
    fires: ['duplicate-withdrawn'],
  },
  {
    // …and the OTHER direction, which must NOT clear. The directions are not symmetric:
    // the later appearance is the one that went unjudged, so correcting the FIRST leaves
    // an entry in the file carrying a stamp nothing ever checked. A fix that made this
    // case pass too would have reopened K6's hole while looking like a remedy.
    name: 'K6e the same collision, THE FIRST corrected instead — still exit 1',
    commits: [...COLLIDE,
      { at: T(5, 9, 0), body: [OLD_BAD_LINE, line(T(5, 9, 0), 'first-of-pair'), PAIR_B] }],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['TWO IN-SCOPE ENTRIES SHARE ONE STAMP (1)', 'CORRECT THE LATER APPEARANCE'],
    absent: ['COLLIDING LINE WITHDRAWN', 'OVER THRESHOLD'],
    fires: ['duplicate-in-scope'],
  },
  {
    // K6c's property on the duplicate path: the collision remedy cannot LAUNDER either.
    // The replacement line is a first appearance judged at ITS OWN commit, so a correction
    // that is itself remembered still fails — as an over-threshold entry, which is the
    // honest reason, rather than going on failing as a collision it no longer is.
    name: 'K6f the collision remedy is itself remembered — exit 1, judged at its own commit',
    commits: [...COLLIDE,
      { at: T(5, 9, 0), body: [OLD_BAD_LINE, PAIR_A, line(T(5, 8, 40), 'second-of-pair')] }],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['OVER THRESHOLD (1)', T(5, 8, 40), 'COLLIDING LINE WITHDRAWN'],
    absent: ['TWO IN-SCOPE ENTRIES SHARE ONE STAMP'],
    fires: ['over-threshold', 'duplicate-withdrawn'],
  },
  {
    // THE INNOCENT CASE STAYS INNOCENT. K1's property with the re-add actually performed:
    // a repair commit AFTER the cutoff re-adding a line first written BEFORE it is a
    // duplicate in scope whose FIRST appearance is grandfathered, so `dup_fail`'s
    // `first_ctime >= since` clause spares it. K1's repo alone never exercised this — it
    // has one commit and no re-add — so the claim was asserted and not measured.
    name: 'K6g a repair commit re-adding a GRANDFATHERED line — exit 0, reported not failed',
    commits: [OLD_BAD, { at: T(3, 9, 0), lines: [OLD_BAD_LINE] }],
    args: gateArgs(CANARY_SINCE),
    status: 0,
    want: ['0 entries IN SCOPE', '1 GRANDFATHERED', 'DUPLICATE STAMPS (1)', '1 in scope, listed'],
    absent: ['BOTH APPEARANCES IN SCOPE', 'TWO IN-SCOPE ENTRIES SHARE ONE STAMP', 'OVER THRESHOLD'],
    fires: [],
  },
  {
    // THE OTHER HALF OF THE MECHANISM CHOICE. Nothing here is corrected: the colliding
    // line is removed and later RE-ADDED VERBATIM, which is the dominant innocent commit
    // pattern the audit's header opens with. Keyed on the line it is still at HEAD, so
    // this stays red — right, because the stamp is still an unjudged claim the ledger
    // makes. The rejected count-of-occurrences mechanism reads two additions against one
    // line at HEAD and calls it withdrawn, going SILENTLY GREEN here; measured, not
    // assumed. This case and K6i are what stop a later swap to counting passing unnoticed.
    //
    // The count is (2), and it is derived rather than copied from K6e: the re-add is a
    // second addition of that line, so `collect()` books a SECOND duplicate record
    // against the same stamp. Both are in scope and both are still at HEAD.
    name: 'K6h the colliding line REMOVED then RESTORED verbatim, uncorrected — still exit 1',
    commits: [...COLLIDE,
      { at: T(5, 9, 0), body: [OLD_BAD_LINE, PAIR_A] },
      { at: T(6, 9, 0), body: [OLD_BAD_LINE, PAIR_A, PAIR_B] }],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['TWO IN-SCOPE ENTRIES SHARE ONE STAMP (2)', 'CORRECT THE LATER APPEARANCE'],
    absent: ['COLLIDING LINE WITHDRAWN'],
    fires: ['duplicate-in-scope'],
  },
  {
    // THE LIMIT, PINNED RATHER THAN LEFT TO BE DISCOVERED. --only-present asks whether a
    // collision's own line survives at HEAD, and two BYTE-IDENTICAL lines are one string
    // to a set: correcting either leaves the other answering "still there", so this run
    // stays red with no move left. It errs RED, never green, and the way out is to make
    // the entry's own text distinct. Written down in the audit's LIMITS section; asserted
    // here so nobody reads K6d as covering a case it does not.
    name: 'K6i the LIMIT — two BYTE-IDENTICAL appearances, the second corrected — still exit 1',
    commits: [
      OLD_BAD,
      { at: T(3, 9, 0), lines: [TWIN] },
      { at: T(4, 9, 0), lines: [TWIN] },
      { at: T(5, 9, 0), body: [OLD_BAD_LINE, TWIN, line(T(5, 9, 0), 'twin')] },
    ],
    args: gateArgs(CANARY_SINCE),
    status: 1,
    want: ['TWO IN-SCOPE ENTRIES SHARE ONE STAMP (1)'],
    absent: ['COLLIDING LINE WITHDRAWN'],
    fires: ['duplicate-in-scope'],
  },
  {
    name: 'K7 a ledger git does not track — exit 2, which this gate treats as FAILURE',
    commits: [OLD_BAD],
    ledger: 'docs/not-tracked.jsonl',
    args: gateArgs(CANARY_SINCE),
    status: 2,
    want: ['COULD NOT MEASURE', 'NOT A PASS'],
    absent: [],
    fires: ['unmeasurable'],
  },
];

/** Every failure rule the gate relies on. Each must fire on some case. */
const RULES_EXERCISED = [
  'over-threshold', 'strict-ahead', 'unparseable', 'duplicate-in-scope', 'unmeasurable',
  // Not a rule of the audit but a property of the RATCHET, and the only one no other case
  // can see: an entry committed after the cutoff is judged whatever `at` it claims.
  'backfill-in-scope',
  // The remedy path: a stamp introduced in scope and then corrected away is reported and
  // not judged. Without it the gate has an unfixable red state.
  'withdrawn',
  // The same remedy on the COLLISION path, which is a different code path and was
  // unreachable until 2026-09-03: a repeated stamp whose own line has been corrected away
  // stops failing, and is counted and printed rather than dropped.
  'duplicate-withdrawn',
];

function runCanaries() {
  const fired = new Set();
  for (const c of CASES) {
    const dir = bed(c.commits);
    try {
      const { status, out } = audit(dir, c.ledger ?? BED_LEDGER, c.args);
      const problems = [];
      if (status !== c.status) problems.push(`exit ${status}, expected ${c.status}`);
      for (const w of c.want) if (!out.includes(w)) problems.push(`missing ${JSON.stringify(w)}`);
      for (const a of c.absent) if (out.includes(a)) problems.push(`must not contain ${JSON.stringify(a)}`);
      if (problems.length) {
        die(`canary "${c.name}" did not behave: ${problems.join('; ')}.\n`
          + '  A clean result from this run would be evidence of NOTHING — the gate is not\n'
          + '  measuring what it claims. Fix the gate before trusting its answer.\n'
          + `  --- audit output in ${dir} ---\n${out.split('\n').map((l) => `  | ${l}`).join('\n')}`);
      }
      for (const f of c.fires) fired.add(f);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  for (const r of RULES_EXERCISED) {
    if (!fired.has(r)) {
      die(`rule "${r}" never fired on any canary, so this run says nothing about it. `
        + 'Its condition matches nothing and every ledger would pass it.');
    }
  }
  return CASES.length;
}

/**
 * The in-force instant must not be LATER than the commit that first added this file.
 *
 * Editing IN_FORCE forward is the one way to make the gate ignore a bad entry without
 * touching the audit, and it lands exactly here. A history rewrite moves the add-commit
 * later, never earlier, so this stays true across a squash or a rebase.
 */
function crossCheckInForce() {
  let out;
  try {
    out = execFileSync(
      'git', ['-C', AURORA_DIR, 'log', '--diff-filter=A', '--format=%cI', '--reverse', '--', SELF],
      { encoding: 'utf8' },
    );
  } catch (e) {
    die(`git could not be asked when ${SELF} was added (${e.message}), so the in-force `
      + 'instant is uncorroborated.');
  }
  const first = out.split('\n').filter(Boolean)[0];
  if (!first) {
    die(`git knows no commit adding ${SELF}, so the in-force instant ${IN_FORCE} rests on `
      + 'nothing. This gate is uncommitted or the path moved; commit it, or update SELF.');
  }
  const added = new Date(first);
  if (new Date(IN_FORCE) > added) {
    die(`the in-force instant ${IN_FORCE} is LATER than the commit that added this gate `
      + `(${added.toISOString()}). Someone moved the cutoff forward, which grandfathers `
      + 'entries the gate was written to judge. Restore it or justify it in this file.');
  }
  return added.toISOString();
}

// ---- guard: the audit and python must actually be there --------------------
try {
  if (!statSync(join(AURORA_DIR, AUDIT)).isFile()) throw new Error('not a file');
} catch (e) {
  die(`${AUDIT} is not readable here (${e.message}). That file IS the measurement; without `
    + 'it nothing was checked.');
}
{
  const v = spawnSync('python3', ['--version'], { encoding: 'utf8' });
  if (v.error || v.status !== 0) {
    die(`python3 does not run here (${v.error?.message ?? `exit ${v.status}`}). The audit is `
      + 'a Python program, so no ledger was examined.');
  }
}

const addedAt = crossCheckInForce();
const canaries = runCanaries();

const results = [];
for (const ledger of LEDGERS) {
  try {
    if (!statSync(join(AURORA_DIR, ledger)).isFile()) throw new Error('not a file');
  } catch (e) {
    die(`${ledger} is not readable here (${e.message}). This gate names the ledgers it is `
      + 'answerable for; one of them is missing, so the run covers less than it says.');
  }
  const { status, out } = audit(AURORA_DIR, ledger, gateArgs(IN_FORCE));
  results.push({ ledger, status, out });
}

console.log(
  `${PREFIX}: ${LEDGERS.length} ledger(s) — ${LEDGERS.join(', ')} — judged against the `
  + `measurement in ${AUDIT}.\n`
  + `${PREFIX}: RATCHET in force from ${IN_FORCE}, on the COMMITTER TIME of the commit that `
  + 'first introduced each entry, NOT on the entry\'s own `at` (a cutoff on `at` would let '
  + 'an entry backfilled today with an old `at` pass unjudged).\n'
  + `${PREFIX}: that instant is at or before ${addedAt}, the commit that added ${SELF}, so `
  + 'the gate binds its own landing and everything after it.\n'
  + `${PREFIX}: aurora ${AURORA_DIR} — ${auroraDirSource()}\n`
  + `${PREFIX}: ${canaries} canary case(s) ran first, on throwaway git repositories, `
  + `covering ${RULES_EXERCISED.length} failure rule(s) and BOTH directions of the ratchet `
  + '(an old bad entry does not fail; a new bad one does).',
);
for (const r of results) console.log(`\n${r.out.trimEnd()}`);

const bad = results.filter((r) => r.status !== 0);
if (bad.length === 0) {
  console.log(`\n${PREFIX}: OK — every ledger entry introduced since ${IN_FORCE} carries a `
    + 'stamp consistent with having been read off a clock. Grandfathered counts are on the '
    + 'RATCHET line of each ledger above.');
  process.exit(0);
}

// An audit that could not measure is reported as UNMEASURABLE and exits 2, not 1. Both
// are red and both stop the `npm test` chain, but they are different facts, and a reader
// told "an entry failed" when the truth is "nothing was examined" has been handed a
// verdict attached to a fabricated reason. The header has always documented exit 2 for
// this; until the exit-2 proof was run, the code did not do it.
const unmeasurable = bad.filter((r) => r.status === 2);
console.error(
  `\n${PREFIX}: FAIL — ${bad.length} of ${LEDGERS.length} ledger(s) did not pass:\n`
  + bad.map((r) => `  ${r.ledger}: exit ${r.status}`
    + (r.status === 2
      ? ' — COULD NOT MEASURE, which is a FAILURE here and not a pass. A gate that cannot see is not a gate that passed.'
      : ' — see the sections above.')).join('\n')
  + '\n\n'
  + (unmeasurable.length < bad.length
    ? '  An `at` is required to come from `date -u +%Y-%m-%dT%H:%M:%SZ` read at the moment\n'
      + '  the entry is written, immediately before committing it. Not from memory, not\n'
      + '  rounded to the nearest five minutes, not copied from a sibling entry.\n'
      + '\n'
      + '  FIX THE NEW ENTRY, DO NOT MOVE THE CUTOFF. These ledgers are append-only and are\n'
      + '  not rewritten; the entries this gate grandfathers stay exactly as they are, and\n'
      + '  IN_FORCE exists so that nothing NEW joins them. If the bad stamp is already\n'
      + '  pushed, correct the entry in a follow-up commit — the run then reports the old\n'
      + '  stamp as no longer in the file and stops judging it.\n'
      + '\n'
      + '  IF THE FAILURE IS "TWO IN-SCOPE ENTRIES SHARE ONE STAMP", correct THE LATER\n'
      + '  APPEARANCE — the second one listed, which is the entry that went unjudged.\n'
      + '  Correcting the FIRST does not clear it and must not: the later entry would\n'
      + '  still be in the file, still carrying a stamp nothing ever checked. You do NOT\n'
      + '  need to change both. (Until 2026-09-03 you did, because the collision was keyed\n'
      + '  on the stamp and the innocent sibling kept it at HEAD; that made the remedy\n'
      + '  above unreachable for exactly the case the ratchet calls a hole.)\n'
    : '  Nothing here says an entry is wrong. It says the audit did not run, which is not\n'
      + '  the same fact and must not be read as one.\n'),
);
process.exit(unmeasurable.length ? 2 : 1);
