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
import { execFileSync } from 'node:child_process';

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
  die('the suite failed on the tree you were about to push. Nothing was pushed.');
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
