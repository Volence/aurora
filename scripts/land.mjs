#!/usr/bin/env node
// LAND: run the suite on the tree that is about to be pushed, then push THAT tree.
//
// ============================================================================
// WHY THIS EXISTS
// ============================================================================
//
// On 2026-09-05 aurora's master was red for about 48 minutes and the red gate
// was the overseer's own. The sequence was:
//
//     merge -> npm test (green, quoted to the hub and the owner) -> git commit
//     the lane-log entry -> git push
//
// THE TREE THAT WAS PUBLISHED WAS NEVER THE TREE THAT WAS TESTED. The gate that
// would have caught it (check-ledger-timestamps) runs inside the suite that had
// just been run, one commit too early.
//
// ⚠ AND IT IS NOT A SLIP, IT IS STRUCTURAL. Every landing here ends with a
// `lane-log:` commit, because the lane log describes the landing that just
// happened. So the log commit lands AFTER the suite BY CONSTRUCTION, and the
// tested tree and the pushed tree differ on every single landing unless
// something forces them back together. Checked over the four landings of
// 2026-09-05: all four had a `lane-log:` commit after their `land:` commit.
//
// The same shape reached sigil from the other side on the same day: it had been
// running the constituent parts of its landing procedure rather than the named
// script for eleven parcels, and both of its escapes went through that gap. A
// procedure that exists only as a habit is not a procedure, it is a tendency.
//
// So: the suite run and the push are ONE ACT, the way the lane-log append and
// its commit are one act. This script is that act.
//
// ============================================================================
// WHAT WOULD MAKE THIS GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • A DIRTY TREE. `npm test` reads the working tree; `git push` sends commits.
//     With uncommitted changes those are different artifacts and the suite
//     certifies something that is not being published. REFUSED before anything
//     runs, and the refusal lists the paths.
//
//   • HEAD MOVING UNDER THE RUN. A parallel session, or an auto-commit daemon,
//     can commit while the suite is running. HEAD is read before and after and
//     must match, or the push is refused: the suite certified the earlier tree.
//
//   • PUSHING SOMETHING OTHER THAN WHAT WAS TESTED. The push names the exact
//     tested SHA (`git push origin <sha>:refs/heads/<branch>`) rather than the
//     branch tip, so a tip that moved cannot ride along silently.
//
//   • THE PUSH DOING NOTHING AND READING AS SUCCESS. `git push` exits 0 when
//     everything is already up to date. The remote SHA is read before and after
//     and the result says which happened, in words.
//
// It deliberately does NOT merge, commit, or write a lane-log entry. Those are
// judgement, and a script that did them would invite being run without reading.
//
// ============================================================================
// AND IT DELIBERATELY DOES NOT REBUILD. RULED 2026-09-06, MEASURED, NOT ARGUED.
// ============================================================================
//
// The question kept coming back (booked as LANDING-LEAVES-BUILD-STALE): landing
// leaves `dist/` describing whatever was last built, which may be neither the
// tree that was tested nor the tree that was pushed. Should this script build?
//
// NO, and the reason is not "it would be slow" - a full build is ~0.6s here,
// timed three times. Three measurements, in the order that settles it:
//
//   1. THE SUITE THIS SCRIPT RUNS HAS ZERO COUPLING TO `dist/`. Measured the
//      only way worth trusting: `dist/` was MOVED AWAY ENTIRELY and `npm test`
//      re-run. 510 files / 7421 tests passed, byte-identical totals to the run
//      with it present. The two suite files that mention Electron build their
//      trees with `mkdtemp` and spawn a `#!/bin/sh` stub. So a stale bundle
//      cannot make a landing certify the wrong thing; there is no path.
//
//   2. `dist/` IS GITIGNORED (.gitignore:2) with zero tracked files under it,
//      so a stale bundle is not publishable. The staleness is local, always.
//
//   3. ⚠ AND REBUILDING WOULD BE ACTIVELY WORSE, which is the half that turns
//      this from "harmless either way" into a ruling. A rebuild here would run
//      the PLAIN build, and the CDP harnesses need `VITE_AURORA_DEBUG=1`. So
//      landing would silently swap the bundle's FLAVOUR under any session
//      holding a debug build for a harness - and the freshness guard cannot see
//      it. Demonstrated deliberately on the day of this ruling: with a plain
//      build in place, `scratchpad/lib/run-root.mjs` printed
//      `build: FRESH ... 2500s newer than the newest of 863 .ts/.tsx` and the
//      harness then died on `window.__dbg absent`. The guard measures MTIME.
//      Flavour is an env var that leaves no mark on the file it checks, so a
//      wrong-flavour bundle is indistinguishable from a right one to every
//      instrument we have. Adding a build here would fire that trap on a
//      schedule, at the moment a session is least expecting its tree to change.
//
// So: not a no-op we tolerate, a rebuild we refuse. If a future session wants
// the flavour problem solved, the fix belongs in the freshness guard (record
// the flavour beside the bundle and compare it), NOT here - this script would
// only be choosing which flavour to impose on everyone.
//
// ============================================================================
// ⚠ WHERE THE LANE-LOG ENTRY GOES NOW, AND WHY THIS PARAGRAPH EXISTS
// ============================================================================
//
// This script refuses a dirty tree, so the old habit — land, then write the log
// entry, then push — is now impossible. Good, that habit WAS the defect. But it
// leaves a real question, and the hub raised it within the hour: the entry
// describes a landing, and the landing has not happened yet when the entry must
// be committed. Two orderings work and they are not equivalent.
//
//   CHOSEN, AND THE ONE TO KEEP: write the entry describing what is ABOUT TO BE
//   PUSHED, commit it, then run this. One suite run, one push, and the suite
//   certifies the tree the entry is part of. If the suite fails, nothing is
//   pushed and the entry describing a landing that did not happen exists only in
//   a local commit, which is trivially amended. An entry can only become public
//   by riding a green suite, so it cannot outlive its own truth.
//
//   NOT CHOSEN: land the code, commit the log separately, run this a second time
//   to push a docs-only commit. It is defensible — the entry then describes
//   something that definitely happened — but it costs a second full suite run on
//   a docs change and, worse, it re-establishes a window in which master carries
//   the code and not the record of it.
//
// The `at` stamp is unaffected either way: check-ledger-timestamps judges an
// entry against the COMMITTER TIME of the commit that first carries it, not
// against when it was pushed, so writing and committing the entry as one act
// (which is its own separate rule) still satisfies it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const say = (s) => console.log(`land: ${s}`);
const die = (s) => { console.error(`land: REFUSED, ${s}`); process.exit(1); };

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch === 'HEAD') die('this is a detached HEAD, so there is no branch to push');

// A dirty tree means the suite reads one artifact and the push sends another.
const dirty = git('status', '--porcelain');
if (dirty) {
  die(`the working tree is not clean, so the suite would certify something other than\n`
    + `  what gets pushed. Commit or stash first. Paths:\n`
    + dirty.split('\n').map((l) => `    ${l}`).join('\n'));
}

const before = git('rev-parse', 'HEAD');
const remoteBefore = git('ls-remote', 'origin', `refs/heads/${branch}`).split('\t')[0] || '(none)';
say(`branch ${branch}, HEAD ${before.slice(0, 8)}, origin ${remoteBefore.slice(0, 8)}`);
if (remoteBefore === before) {
  say('origin already has this exact commit. Nothing to land; the suite is not re-run.');
  process.exit(0);
}

say('running the full suite on THIS tree, the one that will be pushed...');
try {
  execFileSync('npm', ['test'], { stdio: 'inherit' });
} catch {
  // ⚠ THE POINTER BELOW IS THE ONLY CHANGE THIS PARCEL MAKES TO THIS SCRIPT, and
  // it is a string inside an existing refusal: no control flow, no new refusal,
  // no change to any exit code. The reason it is here at all is that a reader
  // who tails this output sees the refusal and NOT the `failure-class:` block a
  // few lines above it, which is exactly the reader who then re-runs the suite
  // hoping the red goes away. That habit is right for a timeout and wrong for an
  // assertion, and it cost five full suite runs once already.
  //
  // The prefix is SPELLED here rather than imported. An import would make this
  // script, which lands every parcel, die at startup if that reporter were ever
  // deleted, and a cosmetic pointer must not be able to break a landing. The
  // coupling is checked instead by a row in test/config/failure-class-wiring.test.ts,
  // which reads this file's text and compares it against the reporter's own
  // exported PREFIX, so a rename reddens a test instead of breaking a push.
  die('the suite failed on the tree you were about to push. Nothing was pushed.\n'
    + '  READ THE FAILURES BY CLASS BEFORE YOU RE-RUN. The `failure-class:` block a few lines\n'
    + '  above counts them, because a tail of this output cannot tell them apart:\n'
    + '    ASSERTION      a finding NOW, whatever this machine was doing. Re-running is not\n'
    + '                   an answer to one of these.\n'
    + '    TIMEOUT        load-manufactured until proven otherwise, since landing verification\n'
    + '                   and agent builds share one box here. Re-run it on a quiet box to\n'
    + '                   judge, and remember load OPENS narrow windows as well as inventing\n'
    + '                   delays: one that repeats when nothing else is running is a finding.\n'
    + '    UNCLASSIFIED   no signature the reporter recognises. Read it yourself.');
}

// HEAD must not have moved under the run: a parallel session or an auto-commit
// daemon can land a commit the suite never saw.
const after = git('rev-parse', 'HEAD');
if (after !== before) {
  die(`HEAD moved while the suite ran, ${before.slice(0, 8)} to ${after.slice(0, 8)}.\n`
    + `  The suite certified the earlier tree. Re-run this.`);
}

// Push the TESTED SHA by name, never the branch tip, so a tip that moved after
// the check above still cannot ride along.
say(`suite green on ${before.slice(0, 8)}; pushing that exact commit`);
execFileSync('git', ['push', 'origin', `${before}:refs/heads/${branch}`], { stdio: 'inherit' });

const remoteAfter = git('ls-remote', 'origin', `refs/heads/${branch}`).split('\t')[0] || '(none)';
if (remoteAfter !== before) {
  die(`the push reported success but origin/${branch} is ${remoteAfter.slice(0, 8)}, not\n`
    + `  the ${before.slice(0, 8)} that was tested. Do not trust the push's own output.`);
}
say(`origin/${branch} ${remoteBefore.slice(0, 8)} to ${remoteAfter.slice(0, 8)}, and it is the tree the suite ran on`);

// ============================================================================
// THE LANDING LINE, PRINTED BECAUSE IT IS THE ONLY UNGATED STEP
// ============================================================================
//
// Every step above self-enforces: a dirty tree refuses, a red suite refuses, a
// moved HEAD refuses, a push that did not take refuses. Telling the peer lane
// what landed is the one step nothing checks, and it sits at the END of that
// chain, which is exactly where a habit decays: the automation carries you to
// the boundary and stops, and nothing marks the last step undone. I missed it
// twice in one night and named the mechanism after the first miss without
// acting on it, which is what made the second worse.
//
// So the line is assembled here rather than recalled. It is not new
// information: the lane-log entry is written IMMEDIATELY BEFORE landing and
// already carries the headline and the consequence in the register the owner
// reads. This prints that beside the SHA, so sending it is a COPY of the
// command's own last output rather than a reconstruction.
//
// ⚠ AND IT FAILS VISIBLY RATHER THAN SILENTLY. If the log's newest entry is not
// the one this landing wrote, the printed line says so. The old failure mode was
// an ABSENT message, which nobody notices; this one is a WRONG message, which
// the sender reads before sending.
const LOG = 'docs/lane-log.jsonl';
let entry = null, logWhy = '';
try {
  const lines = readFileSync(LOG, 'utf8').trimEnd().split('\n');
  entry = JSON.parse(lines[lines.length - 1]);
} catch (e) { logWhy = `could not read the newest ${LOG} entry: ${e.message}`; }

// ⚠ THE ENTRY BELONGS TO THIS LANDING ONLY IF THE COMMIT THAT LAST TOUCHED THE
// LOG IS AMONG THE COMMITS JUST PUSHED. The first version of this used committer
// time as a proxy and ITS VERY FIRST REAL RUN PRINTED THE PREVIOUS LANDING'S
// HEADLINE BESIDE THIS ONE'S SHA: the landing wrote no entry at all, and the
// previous entry was recent enough to pass a time window. A time proxy catches an
// OLD entry and cannot catch a MISSING one, which is the likelier mistake, and
// this comment already claimed the ancestry test before the code did it.
let stale = '';
if (entry) {
  const logCommit = git('log', '-1', '--format=%H', '--', LOG);
  const pushed = remoteBefore === '(none)'
    ? git('rev-list', before)
    : git('rev-list', `${remoteBefore}..${before}`);
  if (!logCommit) stale = `nothing in git history has ever touched ${LOG}`;
  else if (!pushed.split('\n').includes(logCommit)) {
    stale = `this landing wrote no ${LOG} entry: the newest one came in at `
      + `${logCommit.slice(0, 8)}, which is not among the ${pushed.split('\n').filter(Boolean).length} `
      + 'commit(s) just pushed, so it belongs to an earlier landing';
  }
}

process.stdout.write('\n' + '='.repeat(72) + '\n');
if (!entry || stale || logWhy) {
  process.stdout.write(`LANDING LINE UNAVAILABLE: ${logWhy || stale}.\n`
    + 'Say what landed in your own words, and check whether the lane log is missing an entry.\n');
} else {
  process.stdout.write('THE LANDING LINE, to send as it stands:\n\n'
    + `  ${entry.headline}\n\n`
    + `  ${entry.matters}\n\n`
    + `  master ${before.slice(0, 8)}\n`);
}
process.stdout.write('='.repeat(72) + '\n');
