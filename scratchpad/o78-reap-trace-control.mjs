// O78-RESIDUAL-72 — the census instrument's two-direction control.
//
// Run under `xvfb-run -a`, so there IS an outer wrapper whose XAUTHORITY we
// inherit. Reproduces the two teardown shapes the packet distinguishes, with
// no Electron:
//
//   MODE=live  spawnGuarded an inner `xvfb-run -a sleep 25` and exit WITHOUT
//              killing it. The exit net's killTreeSync therefore reaches the X
//              reaper with the tree ALIVE — the affected shape.
//   MODE=dead  the same, but signal the group ourselves and WAIT until every
//              pid is gone before returning. The net then finds nothing — the
//              self-killer's shape.
//
// Expected, and asserted by the caller:
//   MODE=live  + loader  -> prints `cleanup: X artifact REFUSED — … INHERITED`
//   MODE=live  - loader  -> prints NOTHING   (this is the blindness being fixed)
//   MODE=dead  + loader  -> prints NOTHING   (a real negative, not a blind one)
import { spawnGuarded, descendants, displayArtifacts, killTree } from './lib/harness-guard.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ⚠ `alive()` is TRUE for a zombie — kill(pid,0) succeeds on one — so the
// first version of this control reported "tree dead: false" about a SIGKILLed
// wrapper that had no live descendants left. What the reaper actually reads is
// the descendant set and their environs, so that is what this reports.
function state(pid) {
  try { return readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[0]; }
  catch { return 'GONE'; }
}
const shape = (pid) => `root=${state(pid)} descendants=${descendants(pid).size} `
  + `artifacts=${JSON.stringify(displayArtifacts(pid))}`;

const MODE = process.env.MODE ?? 'live';
console.log(`CONTROL mode=${MODE} inherited XAUTHORITY=${process.env.XAUTHORITY}`);

const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '/usr/bin/sleep', '25'], {
  stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 3000));


if (MODE === 'quietkill') {
  // The FIFTH shape, and the one that made loader v1 lie. A KILLTREE-class
  // harness may pass { quiet: true } — capture, shell-flip, tool-split,
  // guard-proof and xvfb-reap all do — and killTree forwards it to
  // reapDisplays at harness-guard.mjs:841. The teardown reaches the reaper
  // with the tree fully alive, i.e. it IS the affected shape, and prints
  // nothing at all unless that second site is un-quieted too.
  console.log(`CONTROL before quiet killTree: ${shape(child.pid)}`);
  await killTree(child, { quiet: true });
  console.log('CONTROL quiet killTree returned');
} else if (MODE === 'dead') {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    let n = 0;
    try { n = execFileSync('pgrep', ['-g', String(child.pid)], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).length; }
    catch { n = 0; }
    if (n === 0 && descendants(child.pid).size <= 1) break;
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    execFileSync('/usr/bin/sleep', ['0.2']);
  }
  console.log(`CONTROL after self-kill: ${shape(child.pid)}`);
} else {
  console.log(`CONTROL untouched:       ${shape(child.pid)}`);
}
// ⚠ MEASURED 2026-09-04, and it invalidated this control's first version.
// Returning from the module does NOT reach the exit net while the tree is
// alive: an un-unref'd ChildProcess handle holds the event loop open, so node
// waited the full 25 s for `sleep` to finish and the net then ran over a tree
// that had died of old age (`DIAG5 child 'exit' event t=28009`). The net can
// only see a LIVE tree when the harness exits explicitly — which is what a
// harness does after printing its tally. So the positive leg exits explicitly.
console.log('CONTROL process.exit(0) now — the exit net runs with the tree in the state above');
process.exit(0);
