#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// xvfb-reap-proof — the X-display guard, run BOTH WAYS in one process
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run harness:xvfb-reap
//
// O20's cause. `/usr/bin/xvfb-run` has NO trap: its cleanup (`kill $XVFBPID`,
// `xauth remove`, `rm -r "$XVFB_RUN_TMPDIR"`) is at :184-192, AFTER the line
// that runs the command at :180. Signal the wrapper and none of it runs — and
// signalling the wrapper is exactly what `killTree` does on every teardown. So
// the fix for hazard 2 guarantees hazard 4, and every harness run since O16 has
// left a lock file, a dead socket and a tempdir behind.
//
// A guard nobody has watched fire is not evidence, so every phase here runs the
// mechanism for real and PRINTS the artifact it judged:
//
//   [r*]  RED   — killTree with the reap DISABLED. The three artifacts survive,
//                 listed by path. This is what every run did before this parcel.
//   [g*]  GREEN — killTree with the reap enabled. Gone.
//   [n*]  NON-VACUITY — the green phase's display really EXISTED mid-run, so
//                 "gone afterwards" is a removal and not an absence. Without
//                 this row the green phase passes just as well over a launch
//                 that never started an X server at all.
//   [s*]  SIGNALS — a child harness killed mid-run with SIGINT and with
//                 SIGTERM. This is the path that mattered: an interrupted
//                 harness never reaches its `finally`, so before this the
//                 leftovers were guaranteed, not merely likely.
//   [o*]  OWNERSHIP — the reap REFUSES a display it does not own, refuses :0,
//                 and refuses a directory that is not an xvfb-run tempdir. A
//                 cleanup that cannot refuse is the pkill hazard again.
//
// NOTHING HERE IS A PATTERN MATCH AND NOTHING TOUCHES A PID IT DID NOT SPAWN.
// It never launches Aurora — `/bin/sleep` under `xvfb-run` isolates the X leak
// from the app, so this needs no build and cannot collide with the owner's
// editor.
//
// NO EXEMPTION IS CLAIMED. The aggregate check classifies this as an Aurora
// launcher (`xvfb-run` is one of its markers) and that classification is right:
// it goes through `spawnGuarded` like every other launcher, so it passes G1 on
// the merits. An earlier draft carried the `allow-raw-launch` marker out of
// caution and appeared in the exemption list as "1 raw launch" — a file
// claiming cover it did not need, in the one list that exists to be short.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import {
  spawnGuarded, killTree, killTreeSync, displayArtifacts, reapDisplays, cmdlineOf, XVFB_TMPDIR_RE,
} from './lib/harness-guard.mjs';

const CHILD = process.argv[2] === '--child';
const SLEEP = ['-a', '-s', '-screen 0 320x240x24', '/bin/sleep', '600'];

let pass = 0; let fail = 0;
const ok = (id, what, detail) => { pass++; console.log(`PASS [${id}] ${what}`); if (detail) console.log(`        ${detail}`); };
const no = (id, what, detail) => { fail++; console.log(`FAIL [${id}] ${what}`); if (detail) console.log(`        ${detail}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The three artifact paths a display owns. */
const paths = (n) => [`/tmp/.X${n}-lock`, `/tmp/.X11-unix/X${n}`];
const present = (ps) => ps.filter((p) => existsSync(p));

/** Launch xvfb-run and wait until an Xvfb we own is visible in our tree. */
async function launchAndWait(label) {
  const child = spawnGuarded('/usr/bin/xvfb-run', SLEEP, { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    const art = displayArtifacts(child.pid);
    if (art.displays.length && art.tmpdirs.length) return { child, art };
    await sleep(250);
  }
  const art = displayArtifacts(child.pid);
  throw new Error(`${label}: no owned Xvfb appeared in 15s (displays=${art.displays.length} tmpdirs=${art.tmpdirs.length})`);
}

// ── child mode: a harness that will be killed mid-run ──────────────────────
//
// It launches through the SAME guard a real harness uses, prints what it owns,
// and then idles forever. Whatever cleans up after it is the exit-handler net
// that spawnGuarded installed — nothing in this branch calls killTree.
if (CHILD) {
  const { art } = await launchAndWait('child');
  console.log(`CHILDART ${JSON.stringify({ displays: art.displays.map((d) => d.n), tmpdirs: art.tmpdirs })}`);
  await new Promise(() => {});          // idle — the signal is the whole point
}

console.log('═══ xvfb-reap-proof ═══');
console.log(`start: ${readdirSync('/tmp').filter((f) => /^\.X\d+-lock$/.test(f)).length} lock(s), `
  + `${existsSync('/tmp/.X11-unix') ? readdirSync('/tmp/.X11-unix').length : 0} socket(s), `
  + `${readdirSync('/tmp').filter((f) => /^xvfb-run\./.test(f)).length} xvfb-run tempdir(s) already on this box`);

// ── RED: the leak, reproduced ──────────────────────────────────────────────

// ⚠ THERE ARE TWO LEAK RATES AND THE FIRST VERSION OF THIS PHASE ASSERTED THE
// WRONG ONE. It expected all three artifacts to survive a GRACEFUL teardown and
// went red on its own RED row, because a SIGTERMed Xvfb removes its own lock
// and socket — the wrapper's tempdir is the only thing that leaks on that path.
// Both paths are now asserted separately, and the difference between them is
// the finding: locks and sockets need a crash, the tempdir needs nothing.

{
  const { child, art } = await launchAndWait('red-graceful');
  const n = art.displays[0].n;
  const dir = art.tmpdirs[0];
  ok('r0', `an owned Xvfb is running on :${n}`,
    `${art.displays[0].argv.slice(0, 80)} · tempdir ${dir} · live artifacts: ${present(paths(n)).join(' ')}`);

  await killTree(child, { graceMs: 1500, quiet: true, reap: false });
  const after = present(paths(n));
  if (existsSync(dir) && after.length === 0) {
    ok('r1', 'RED (graceful) — the wrapper tempdir survives EVERY teardown, lock and socket do not',
      `left: ${dir}/  ·  a SIGTERMed Xvfb removes its own ${paths(n).join(' and ')}, `
      + "but only xvfb-run's own success-path `rm -r` removes the tempdir, and we killed the wrapper");
  } else {
    no('r1', 'RED (graceful) did not behave as measured', `tempdir left: ${existsSync(dir)}; lock/socket left: ${after.join(' ') || 'none'}`);
  }
  reapDisplays(art, { quiet: true });
}

{
  const { child, art } = await launchAndWait('red-abrupt');
  const n = art.displays[0].n;
  const dir = art.tmpdirs[0];
  // The Ctrl-C / crash path: SIGKILL with no grace, which is what the
  // exit-handler net does and what an OOM or a segfault does for you.
  killTreeSync(child, { reap: false });
  await sleep(1000);
  const after = present(paths(n));
  if (after.length === 2 && existsSync(dir)) {
    ok('r2', 'RED (abrupt) — a SIGKILLed Xvfb cannot clean up, so ALL THREE artifacts leak',
      `${after.join(' ')} ${dir}/  ·  this is the Ctrl-C and crash path, and nothing downstream was ever going to remove these`);
  } else {
    no('r2', 'RED (abrupt) did not reproduce the full leak',
      `survivors: ${after.join(' ') || 'none'}; tempdir left: ${existsSync(dir)}`);
  }

  // Clean up the RED residue with the mechanism under test, so this proof is
  // not itself a leak. If the reap cannot remove what it just watched leak,
  // that is a failure and not a tidy-up.
  const { removed } = reapDisplays(art, { quiet: true });
  if (present(paths(n)).length === 0 && !existsSync(dir)) {
    ok('r3', 'the reap removes the RED residue it was pointed at', `removed: ${removed.join(' ')}`);
  } else {
    no('r3', 'the reap FAILED to remove the RED residue', `still there: ${present(paths(n)).join(' ')} ${existsSync(dir) ? dir : ''}`);
  }
}

// ── GREEN: killTree reaps ──────────────────────────────────────────────────

{
  const { child, art } = await launchAndWait('green');
  const n = art.displays[0].n;
  const dir = art.tmpdirs[0];
  const during = present(paths(n));
  // NON-VACUITY, and this row is why the green one means anything: prove the
  // artifacts EXISTED while the server ran. "Absent afterwards" is only a
  // removal if something was there.
  if (during.length === 2 && existsSync(dir)) {
    ok('n1', `the artifacts EXIST while :${n} is running — the green row below is a removal, not an absence`,
      `${during.join(' ')} ${dir}/`);
  } else {
    no('n1', 'could not establish the artifacts existed mid-run', `saw: ${during.join(' ')} dir=${existsSync(dir)}`);
  }

  const res = await killTree(child, { graceMs: 1500, quiet: true });
  const after = present(paths(n));
  if (after.length === 0 && !existsSync(dir)) {
    ok('g1', 'GREEN (graceful) — killTree leaves NO lock, NO socket and NO tempdir',
      `reaped: ${res.reaped.removed.join(' ')}`);
  } else {
    no('g1', 'GREEN (graceful) — artifacts survived the reap', `${after.join(' ')} ${existsSync(dir) ? dir : ''}`
      + ` · refusals: ${res.reaped.refused.join('; ') || 'none'}`);
  }
  // The count is DERIVED from what [r1] measured surviving this same path — the
  // tempdir — not from a number pinned in this file. Asserting "3" here would
  // have been a pin copied off the abrupt path, and it would have gone red for
  // the wrong reason.
  if (res.reaped.removed.some((p) => p.startsWith(dir))) {
    ok('g2', 'and the thing it removed is the artifact [r1] just measured surviving this path', res.reaped.removed.join(' '));
  } else {
    no('g2', 'the reap did not remove the tempdir', `removed: ${res.reaped.removed.join(' ') || 'nothing'}`);
  }
}

{
  // The abrupt path, reap ON — the mirror of [r2].
  const { child, art } = await launchAndWait('green-abrupt');
  const n = art.displays[0].n;
  const dir = art.tmpdirs[0];
  const res = killTreeSync(child);
  const after = [...present(paths(n)), ...(existsSync(dir) ? [dir] : [])];
  if (after.length === 0) {
    ok('g3', 'GREEN (abrupt) — killTreeSync SIGKILLs and still leaves nothing behind',
      `reaped: ${res.reaped.removed.join(' ')}`);
  } else {
    no('g3', 'GREEN (abrupt) — artifacts survived', `${after.join(' ')} · refusals: ${res.reaped?.refused.join('; ') || 'none'}`);
    reapDisplays(art, { quiet: true });
  }
  if (res.reaped.removed.length === 3) {
    ok('g4', 'all three, on the path where [r2] measured all three leaking', res.reaped.removed.join(' '));
  } else {
    no('g4', 'the abrupt reap did not remove the three artifacts [r2] measured leaking',
      `${res.reaped.removed.length}: ${res.reaped.removed.join(' ')}`);
  }
}

// ── SIGNALS: the harness itself killed mid-run ─────────────────────────────

async function signalPhase(id, sig) {
  const kid = spawn(process.execPath, [new URL(import.meta.url).pathname, '--child'],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  let buf = '';
  const art = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('child never reported')), 40000);
    kid.stdout.on('data', (d) => {
      buf += d.toString();
      const m = /^CHILDART (.*)$/m.exec(buf);
      if (m) { clearTimeout(t); res(JSON.parse(m[1])); }
    });
    kid.on('exit', (c) => { clearTimeout(t); rej(new Error(`child exited early (${c})`)); });
  });
  const n = art.displays[0];
  const dir = art.tmpdirs[0];
  const during = [...present(paths(n)), ...(existsSync(dir) ? [dir] : [])];
  kid.kill(sig);
  await new Promise((r) => kid.on('exit', r));
  await sleep(1500);
  const after = [...present(paths(n)), ...(existsSync(dir) ? [dir] : [])];
  if (during.length === 3 && after.length === 0) {
    ok(id, `${sig} mid-run — the harness never reached a \`finally\`, and the display is still cleaned up`,
      `during: ${during.join(' ')} → after: nothing`);
  } else {
    no(id, `${sig} mid-run left artifacts behind`, `during: ${during.join(' ')} → after: ${after.join(' ') || 'nothing'}`);
    // Do not leave the box dirtier than we found it: this proof owns these.
    reapDisplays({ displays: [{ n, xvfbPid: -1, argv: '' }], tmpdirs: [dir], unknown: [] }, { quiet: true });
  }
}

await signalPhase('s1', 'SIGINT');
await signalPhase('s2', 'SIGTERM');

// ── OWNERSHIP: what the reap REFUSES ───────────────────────────────────────
//
// A cleanup that only ever says yes is the pkill hazard wearing a new name.
// These rows construct artifacts the guard must decline, and then check the
// paths are STILL THERE — the refusal is verified on disk, not taken on trust.

{
  const r = reapDisplays({ displays: [{ n: 0, xvfbPid: 1, argv: 'Xwayland :0' }], tmpdirs: [], unknown: [] }, { quiet: true });
  const sock0 = existsSync('/tmp/.X11-unix/X0');
  if (r.removed.length === 0 && sock0) ok('o1', "display :0 — the owner's session — is REFUSED, and its socket is still there", r.refused.join('; '));
  else no('o1', 'the guard did not refuse :0', `removed=${r.removed.join(' ')} socketStillThere=${sock0}`);
}

{
  // A display whose Xvfb is ALIVE and is not ours: use this node process as the
  // stand-in owner. Real, live, and foreign to the tree — the same construction
  // the ownership rule's proof uses, for the same reason.
  // argv comes from cmdlineOf, the same reader displayArtifacts records with —
  // the FIRST version built it from process.argv.join(' '), which does not
  // reproduce /proc's spelling, so the identity check said "recycled", the
  // guard reaped, and the row failed. The gate was right; the fixture was not.
  const n = 4242;
  const r = reapDisplays({ displays: [{ n, xvfbPid: process.pid, argv: cmdlineOf(process.pid) }], tmpdirs: [], unknown: [] }, { quiet: true });
  if (r.removed.length === 0 && /still RUNNING/.test(r.refused.join(''))) {
    ok('o2', `a display whose recorded process is LIVE is REFUSED (:${n})`, r.refused.join('; '));
  } else {
    no('o2', 'the guard reaped a display whose process is still running', `removed=${r.removed.join(' ')} refused=${r.refused.join('; ')}`);
  }
}

{
  const r = reapDisplays({ displays: [], tmpdirs: ['/tmp', '/home/volence', '/tmp/xvfb-run-not-really'], unknown: [] }, { quiet: true });
  const survived = existsSync('/tmp') && existsSync('/home/volence');
  if (r.removed.length === 0 && survived) {
    ok('o3', 'a directory that is not an xvfb-run tempdir is REFUSED — /tmp and $HOME are untouched', r.refused.join('; '));
  } else {
    no('o3', 'the guard removed a directory outside XVFB_TMPDIR_RE', `removed=${r.removed.join(' ')}`);
  }
  if (!XVFB_TMPDIR_RE.test('/tmp/xvfb-run-not-really') && XVFB_TMPDIR_RE.test('/tmp/xvfb-run.aB3xZ9')) {
    ok('o4', 'XVFB_TMPDIR_RE matches the real shape and nothing near it',
      "'/tmp/xvfb-run.aB3xZ9' yes · '/tmp/xvfb-run-not-really' no");
  } else {
    no('o4', 'XVFB_TMPDIR_RE does not discriminate', 'check the pattern');
  }
}

{
  const r = reapDisplays({ displays: [], tmpdirs: [], unknown: ['pid 1 is an Xvfb but its argv carries no :N'] }, { quiet: true });
  if (r.refused.some((x) => /^UNMEASURABLE/.test(x))) {
    ok('o5', 'an Xvfb it could not attribute a display to is reported UNMEASURABLE, not folded into a clean count', r.refused.join('; '));
  } else {
    no('o5', 'unmeasurable input was silently dropped', r.refused.join('; '));
  }
}

console.log(`\n════ ${pass} pass / ${fail} fail ════`);
process.exit(fail ? 1 : 0);
