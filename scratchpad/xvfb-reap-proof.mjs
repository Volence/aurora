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
//                 cleanup that cannot refuse is the pkill hazard again. FOUR
//                 gates, four rows, and each row asserts WHICH gate refused —
//                 see the note above them for why that is not pedantry.
//   [b*]  BLINDNESS — the socket-table reader reporting that it could not
//                 look, and the reap refusing everything when it does.
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
import { existsSync, readdirSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import {
  spawnGuarded, killTree, killTreeSync, displayArtifacts, reapDisplays, cmdlineOf,
  boundSocketPaths, NEVER_REAP_DISPLAYS, XVFB_TMPDIR_RE, inheritedXauthDirs,
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

// ── OWNERSHIP: what the reap REFUSES, AND WHICH GATE DID THE REFUSING ──────
//
// A cleanup that only ever says yes is the pkill hazard wearing a new name.
// These rows construct artifacts the guard must decline, and then check the
// paths are STILL THERE — the refusal is verified on disk, not taken on trust.
//
// ⚠ EVERY ROW HERE ASSERTS **WHICH GATE** FIRED, AND THE FIRST VERSION DID NOT.
// The coordinator planted the poison this proof had not: emptying
// NEVER_REAP_DISPLAYS — deleting gate 1 outright — left [o1] GREEN and the run
// at 16/16, because the owner's live Xwayland binds /tmp/.X11-unix/X0 and GATE
// 3 refused :0 anyway. Bar 2d cause (ii): two independent code paths, one
// observable, and a row that reads only the observable cannot tell them apart.
//
// So each row now matches the refusal REASON, which the guard already returned
// and the row was throwing away. That makes deleting any single gate turn its
// own row red — verified by deleting each of the four in turn, not reasoned
// about. There are four gates and there are now four isolating rows: the reason
// [o1] could rest on a neighbour is that NOTHING tested gate 3 on its own.

/** Did the guard refuse for THIS reason — and did it refuse at all? */
const refusedBecause = (r, re) => r.removed.length === 0 && r.refused.some((x) => re.test(x));

{
  // GATE 1 — the never-reap list. :0 is the owner's desktop.
  const r = reapDisplays({ displays: [{ n: 0, xvfbPid: 1, argv: 'Xwayland :0' }], tmpdirs: [], unknown: [] }, { quiet: true });
  const sock0 = existsSync('/tmp/.X11-unix/X0');
  if (refusedBecause(r, /never reaped/) && sock0) {
    ok('o1', "GATE 1 — display :0, the owner's session, is refused BY THE NEVER-REAP LIST, and its socket is still there",
      r.refused.join('; '));
  } else {
    no('o1', 'gate 1 did not refuse :0 in its own words (gate 3 catching it instead is NOT a pass)',
      `removed=${r.removed.join(' ')} refused=${r.refused.join('; ')} socketStillThere=${sock0}`);
  }
}

{
  // GATE 2 — the recorded process is still running. Use this node process as
  // the stand-in owner: real, live, and foreign to the tree, the same
  // construction the ownership rule's proof uses, for the same reason. Display
  // 4242 has no socket on disk, so gate 3 cannot fire here and gate 2 is
  // genuinely the only thing that can refuse.
  //
  // argv comes from cmdlineOf, the same reader displayArtifacts records with —
  // the FIRST version built it from process.argv.join(' '), which does not
  // reproduce /proc's spelling, so the identity check said "recycled", the
  // guard reaped, and the row failed. The gate was right; the fixture was not.
  const n = 4242;
  const r = reapDisplays({ displays: [{ n, xvfbPid: process.pid, argv: cmdlineOf(process.pid) }], tmpdirs: [], unknown: [] }, { quiet: true });
  const noNeighbour = !existsSync(`/tmp/.X11-unix/X${n}`) && !NEVER_REAP_DISPLAYS.has(n);
  if (refusedBecause(r, /still RUNNING/) && noNeighbour) {
    ok('o2', `GATE 2 — a display whose recorded process is LIVE is refused BY THE LIVENESS CHECK (:${n})`,
      `${r.refused.join('; ')} · and no other gate could have: :${n} is not in the never-reap list and has no socket on disk`);
  } else {
    no('o2', 'gate 2 did not refuse in its own words, or a neighbouring gate could have covered for it',
      `removed=${r.removed.join(' ')} refused=${r.refused.join('; ')} noNeighbour=${noNeighbour}`);
  }
}

{
  // GATE 3 — a live server is bound to the socket. NOTHING TESTED THIS ON ITS
  // OWN before, which is the structural reason [o1] could rest on it.
  //
  // Constructed, not simulated: launch a real Xvfb, then hand the guard a
  // recorded pid that is genuinely DEAD (a /bin/true that has already exited,
  // so gate 2 passes) for a display number that is not 0 (so gate 1 passes).
  // The only thing left standing between the guard and a LIVE X server is the
  // /proc/net/unix binding.
  const { child, art } = await launchAndWait('gate3');
  const n = art.displays[0].n;
  const corpse = spawn('/bin/true', [], { stdio: 'ignore' });
  await new Promise((res) => corpse.on('exit', res));
  const r = reapDisplays({ displays: [{ n, xvfbPid: corpse.pid, argv: '/bin/true' }], tmpdirs: [], unknown: [] }, { quiet: true });
  const survived = present(paths(n));
  if (refusedBecause(r, /is still BOUND/) && survived.length === 2) {
    ok('o6', 'GATE 3 — a LIVE X server is refused BY THE BOUND-SOCKET CHECK even when gates 1 and 2 both pass',
      `${r.refused.join('; ')} · recorded pid ${corpse.pid} is a dead /bin/true, :${n} is not in the never-reap list, `
      + `and the artifacts are still on disk: ${survived.join(' ')}`);
  } else {
    no('o6', 'gate 3 did not refuse a live server on its own', `removed=${r.removed.join(' ')} refused=${r.refused.join('; ')} survived=${survived.join(' ')}`);
  }
  await killTree(child, { graceMs: 1000, quiet: true });
}

{
  // GATE 4 — the tempdir pattern. The two paths that carry this row are `/tmp`
  // and `$HOME`: they EXIST, so a widened pattern would really remove them and
  // the row would really go red. (`/tmp/xvfb-run-not-really` normally does not
  // exist, so it tests the pattern and not the removal — and when this gate was
  // plant-verified by creating it for real, the plant DELETED it, so the second
  // run of the same plant was already green on this row. A plant that eats its
  // own fixture is only red once; read the first run, never the second.)
  const r = reapDisplays({ displays: [], tmpdirs: ['/tmp', '/home/volence', '/tmp/xvfb-run-not-really'], unknown: [] }, { quiet: true });
  const survived = existsSync('/tmp') && existsSync('/home/volence');
  if (refusedBecause(r, /not an xvfb-run tempdir/) && survived) {
    ok('o3', 'GATE 4 — a directory outside XVFB_TMPDIR_RE is refused BY THE PATTERN CHECK — /tmp and $HOME are untouched',
      r.refused.join('; '));
  } else {
    no('o3', 'gate 4 did not refuse in its own words', `removed=${r.removed.join(' ')} refused=${r.refused.join('; ')}`);
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

// ── GATE 5: the tempdir we INHERITED (O78) ─────────────────────────────────
//
// The defect these two rows exist for did not leave an X server running and did
// not orphan a process. It made a GREEN harness report RED — and to the only
// reader that matters, a sweep reading an exit code, that is indistinguishable
// from a real failure.
//
// The shape: run any harness under an OUTER `xvfb-run` (`xvfb-run -a npm run
// harness:…`). The outer wrapper exports XAUTHORITY naming ITS OWN
// /tmp/xvfb-run.XXXXXX/. The harness inherits it, passes it into the child env
// (harnesses delete DISPLAY from that env, never XAUTHORITY), and so every
// process in the harness's OWN tree carries it. `displayArtifacts` read it out
// of /proc/<pid>/environ, matched XVFB_TMPDIR_RE, and called the directory
// ours; the reap deleted it. The harness then exited 0 — measured, 44 rows and
// 0 failed — and the outer wrapper's own cleanup ran `xauth remove` at
// /usr/bin/xvfb-run:188 against a file that was gone, failed, and `set -e`
// aborted it before `exit $RETVAL` at :197. The wrapper exited 1.
//
// It is the DISPLAY trap the docstring above `displayArtifacts` already warns
// about, one field over: an environment variable is evidence about our
// ANCESTORS, never about what we started.
//
// Two rows because there are two halves and each can be broken alone:
//   [o7] `reapDisplays` REFUSES such a directory even when handed it directly,
//        and the directory is verified still on disk afterwards;
//   [o8] `displayArtifacts` does not CLAIM it in the first place — with a
//        control tempdir in the same tree that it MUST still claim, so "claims
//        nothing" cannot pass as "claims the right thing".

/** A directory with exactly the shape xvfb-run mints, created fresh so no plant
 *  can eat the fixture: a run with gate 5 deleted really removes THIS one, and
 *  the next run gets a new one and is red again. */
function makeTempdirLikeXvfbRun(tag) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let dir;
  do {
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    dir = `/tmp/xvfb-run.${s}`;
  } while (existsSync(dir));
  if (!XVFB_TMPDIR_RE.test(dir)) throw new Error(`fixture ${dir} does not match the real shape — the row would be vacuous`);
  mkdirSync(dir);
  writeFileSync(`${dir}/Xauthority.${tag}`, 'not a real cookie');
  return dir;
}

{
  const outerDir = makeTempdirLikeXvfbRun('o7');
  const savedXauth = process.env.XAUTHORITY;
  // Being under an outer wrapper IS having this variable. Setting it is not a
  // simulation of the condition — it is the condition, read the same way.
  process.env.XAUTHORITY = `${outerDir}/Xauthority.o7`;
  try {
    const seen = inheritedXauthDirs();
    const r = reapDisplays({ displays: [], tmpdirs: [outerDir], unknown: [] }, { quiet: true });
    const survived = existsSync(outerDir);
    if (seen.has(outerDir) && refusedBecause(r, /INHERITED/) && survived) {
      ok('o7', 'GATE 5 — a tempdir named by our OWN XAUTHORITY is refused BY THE INHERITANCE CHECK, and it is still on disk',
        `${r.refused.join('; ')} · fixture ${outerDir} matches XVFB_TMPDIR_RE, so gate 4 could not have covered for this, `
        + 'and it exists, so a widened gate would really have deleted it');
    } else {
      no('o7', 'gate 5 did not refuse an inherited tempdir in its own words',
        `inheritedXauthDirs saw it: ${seen.has(outerDir)} · removed=${r.removed.join(' ')} `
        + `refused=${r.refused.join('; ')} stillOnDisk=${survived}`);
    }
  } finally {
    if (savedXauth === undefined) delete process.env.XAUTHORITY; else process.env.XAUTHORITY = savedXauth;
    rmSync(outerDir, { recursive: true, force: true });
  }
}

{
  // [o8] ATTRIBUTION, on a real process tree. One `/bin/sh` with two children:
  // one carrying the XAUTHORITY we "inherited" (must NOT be claimed), one
  // carrying a foreign wrapper's (must STILL be claimed). Without the second
  // half a fix that claims nothing at all would pass this row.
  const outerDir = makeTempdirLikeXvfbRun('o8-outer');
  const oursDir = makeTempdirLikeXvfbRun('o8-ours');
  const savedXauth = process.env.XAUTHORITY;
  process.env.XAUTHORITY = `${outerDir}/Xauthority.o8-outer`;
  let sh;
  try {
    sh = spawn('/bin/sh', ['-c',
      `XAUTHORITY=${outerDir}/Xauthority.o8-outer /bin/sleep 8 & `
      + `XAUTHORITY=${oursDir}/Xauthority.o8-ours /bin/sleep 8 & wait`],
    { stdio: 'ignore', detached: true, env: { ...process.env } });
    await new Promise((res) => setTimeout(res, 700));
    const art = displayArtifacts(sh.pid);
    const claimedOuter = art.tmpdirs.includes(outerDir);
    const claimedOurs = art.tmpdirs.includes(oursDir);
    const saidInherited = (art.inherited ?? []).includes(outerDir);
    if (!claimedOuter && claimedOurs && saidInherited) {
      ok('o8', 'ATTRIBUTION — the inherited tempdir is not claimed (and is reported as inherited, not dropped silently), '
        + 'while a foreign wrapper\'s tempdir in the SAME tree still is',
        `tree under pid ${sh.pid}: tmpdirs=${JSON.stringify(art.tmpdirs)} inherited=${JSON.stringify(art.inherited)} · `
        + `ours=${oursDir} claimed, outer=${outerDir} refused`);
    } else {
      no('o8', 'attribution is wrong in one direction or the other',
        `claimedOuter=${claimedOuter} (must be false) claimedOurs=${claimedOurs} (must be true) `
        + `reportedInherited=${saidInherited} (must be true) · tmpdirs=${JSON.stringify(art.tmpdirs)} `
        + `inherited=${JSON.stringify(art.inherited ?? null)}`);
    }
  } finally {
    if (savedXauth === undefined) delete process.env.XAUTHORITY; else process.env.XAUTHORITY = savedXauth;
    if (sh?.pid) { try { process.kill(-sh.pid, 'SIGKILL'); } catch { /* gone */ } }
    rmSync(outerDir, { recursive: true, force: true });
    rmSync(oursDir, { recursive: true, force: true });
  }
}

// ── BLINDNESS: the instrument reporting that it cannot see ─────────────────
//
// boundSocketPaths() FAILED OPEN against its own docstring. The catch returned
// an empty Set while the comment promised the caller would treat "unknown" as
// "do not touch" — but `bound.has(sock)` over an empty Set is `false`, and
// `false` is the value that means PROCEED TO DELETE. An unreadable
// /proc/net/unix silently inverted gate 3 from a refusal into a permission,
// leaving NEVER_REAP_DISPLAYS as the only thing between the reaper and the
// owner's desktop socket — the guard the coordinator's poison showed nothing
// was testing.
//
// The general form is the lesson: THE FAILURE STATE AND THE SUCCESS STATE
// EMITTED THE SAME ARTIFACT. "I could not look" and "I looked and nothing is
// bound" were both an empty Set, so no caller could distinguish them.

{
  const good = boundSocketPaths();
  const blind = boundSocketPaths('/nonexistent/proc/net/unix');
  if (blind === null && good instanceof Set && good.size > 0) {
    ok('b1', 'an unreadable socket table returns the NULL sentinel, distinguishable from a readable empty one',
      `unreadable -> ${blind} · readable -> Set(${good.size}) · an empty Set would have been indistinguishable from "nothing is bound"`);
  } else {
    no('b1', 'boundSocketPaths cannot report its own blindness', `unreadable -> ${blind} · readable -> ${good && good.size}`);
  }
}

{
  // The live artifacts of a REAL running server, handed to the guard while it
  // is blind. Gate 1 passes (n is not 0) and gate 2 passes (the recorded pid is
  // a dead /bin/true), so before the fix gate 3 would have inverted and DELETED
  // the socket of a running X server.
  const { child, art } = await launchAndWait('blind');
  const n = art.displays[0].n;
  const dir = art.tmpdirs[0];
  const corpse = spawn('/bin/true', [], { stdio: 'ignore' });
  await new Promise((res) => corpse.on('exit', res));
  const r = reapDisplays(
    { displays: [{ n, xvfbPid: corpse.pid, argv: '/bin/true' }], tmpdirs: [dir], unknown: [] },
    { quiet: true, bound: null });
  const survived = [...present(paths(n)), ...(existsSync(dir) ? [dir] : [])];
  if (r.removed.length === 0 && r.blind === true && survived.length === 3) {
    ok('b2', 'BLIND — with the socket table unreadable the reap refuses EVERYTHING, and the live server keeps its socket',
      `${r.refused.join(' · ')} · still on disk: ${survived.join(' ')}`);
  } else {
    no('b2', 'a blind reap still removed things', `removed=${r.removed.join(' ')} blind=${r.blind} survived=${survived.join(' ')}`);
  }
  if (r.refused.every((x) => /BLIND|UNMEASURABLE/.test(x))) {
    ok('b3', 'and it refuses in the blindness\'s own words, not by accidentally matching another gate', r.refused.join(' · '));
  } else {
    no('b3', 'a blind refusal was attributed to the wrong gate', r.refused.join(' · '));
  }
  // The tempdir half is refused too, deliberately: half a reap is a policy
  // nobody can reason about, and "I cannot tell live from dead" is a reason to
  // stop, not a reason to stop partly.
  await killTree(child, { graceMs: 1000, quiet: true });
}

console.log(`\n════ ${pass} pass / ${fail} fail ════`);
process.exit(fail ? 1 : 0);
