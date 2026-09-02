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
 *       harmless miss for a repair commit re-adding an old line (K1's repo proves such a
 *       re-add does NOT fail) and a hole for two new ones.
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
  let body = '';
  for (const c of commits) {
    body += `${c.lines.join('\n')}\n`;
    writeFileSync(join(dir, BED_LEDGER), body);
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

const CASES = [
  {
    name: 'K1 old bad entry, committed before the cutoff — GRANDFATHERED, not a failure',
    commits: [OLD_BAD],
    args: ['--since', CANARY_SINCE, '--strict-ahead'],
    status: 0,
    want: ['0 entries IN SCOPE', '1 GRANDFATHERED'],
    absent: ['OVER THRESHOLD', 'STAMPED AHEAD'],
    fires: [],
  },
  {
    name: 'K2 an honest entry after the cutoff — judged, and passes',
    commits: [OLD_BAD, NEW_GOOD],
    args: ['--since', CANARY_SINCE, '--strict-ahead'],
    status: 0,
    want: ['1 entry IN SCOPE', '1 GRANDFATHERED'],
    absent: ['OVER THRESHOLD'],
    fires: [],
  },
  {
    name: 'K3a an entry 5s AHEAD of its commit, in scope, WITHOUT --strict-ahead — exit 0',
    commits: [OLD_BAD, NEW_AHEAD],
    args: ['--since', CANARY_SINCE],
    status: 0,
    want: ['STAMPED AHEAD OF ITS OWN COMMIT (1)', 'pass --strict-ahead'],
    absent: [],
    fires: [],
  },
  {
    name: 'K3b the same entry WITH --strict-ahead — exit 1',
    commits: [OLD_BAD, NEW_AHEAD],
    args: ['--since', CANARY_SINCE, '--strict-ahead'],
    status: 1,
    want: ['ALL OF THESE FAIL THIS RUN', T(4, 9, 0, 5)],
    absent: [],
    fires: ['strict-ahead'],
  },
  {
    name: 'K4 a bad entry committed after the cutoff — exit 1, naming it',
    commits: [OLD_BAD, NEW_BAD],
    args: ['--since', CANARY_SINCE, '--strict-ahead'],
    status: 1,
    want: ['OVER THRESHOLD (1)', T(5, 8, 40), '1 GRANDFATHERED'],
    absent: [],
    fires: ['over-threshold'],
  },
  {
    name: 'K4b an entry BACKFILLED after the cutoff with an old `at` — exit 1, IN SCOPE',
    commits: [OLD_BAD, BACKFILLED],
    args: ['--since', CANARY_SINCE, '--strict-ahead'],
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
    args: ['--since', CANARY_SINCE, '--strict-ahead'],
    status: 1,
    want: ['UNPARSEABLE IN SCOPE (1)'],
    absent: [],
    fires: ['unparseable'],
  },
  {
    name: 'K6 two NEW entries sharing one stamp — exit 1, the second went unjudged',
    commits: [OLD_BAD, NEW_GOOD, { at: T(4, 9, 0), lines: [line(T(3, 9, 0), 'collides')] }],
    args: ['--since', CANARY_SINCE, '--strict-ahead'],
    status: 1,
    want: ['BOTH APPEARANCES IN SCOPE'],
    absent: [],
    fires: ['duplicate-in-scope'],
  },
  {
    name: 'K7 a ledger git does not track — exit 2, which this gate treats as FAILURE',
    commits: [OLD_BAD],
    ledger: 'docs/not-tracked.jsonl',
    args: ['--since', CANARY_SINCE, '--strict-ahead'],
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
  const { status, out } = audit(AURORA_DIR, ledger, ['--since', IN_FORCE, '--strict-ahead']);
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

console.error(
  `\n${PREFIX}: FAIL — ${bad.length} of ${LEDGERS.length} ledger(s) did not pass:\n`
  + bad.map((r) => `  ${r.ledger}: exit ${r.status}`
    + (r.status === 2
      ? ' — COULD NOT MEASURE, which is a FAILURE here and not a pass. A gate that cannot see is not a gate that passed.'
      : ' — see the sections above.')).join('\n')
  + '\n\n'
  + '  An `at` is required to come from `date -u +%Y-%m-%dT%H:%M:%SZ` read at the moment\n'
  + '  the entry is written, immediately before committing it. Not from memory, not\n'
  + '  rounded to the nearest five minutes, not copied from a sibling entry.\n'
  + '\n'
  + '  FIX THE NEW ENTRY, DO NOT MOVE THE CUTOFF. These ledgers are append-only and are\n'
  + '  not rewritten; the entries this gate grandfathers stay exactly as they are, and\n'
  + '  IN_FORCE exists so that nothing NEW joins them.\n',
);
process.exit(1);
