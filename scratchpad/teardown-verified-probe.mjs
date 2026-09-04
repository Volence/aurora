#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// teardown-verified-probe — SIGTERM + sleep(1500) RETURNS OVER A LIVE TREE
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run harness:teardown-verified
//
// The behavioural half of the BGANIM-TEARDOWN parcel. The census
// (docs/reviews/2026-09-04-o78-residual-census.md §2) caught
// `bganim-insert-roomy-harness` reaching the exit net with its process tree
// still ALIVE on 1 of 4 runs, and named the shape:
//
//     try { process.kill(-child.pid, 'SIGTERM'); } catch { }
//     await sleep(1500);
//     rmSync(dir, { recursive: true, force: true });
//
// — no SIGKILL if the tree ignores the SIGTERM, and no check that anything
// went. That is a hazard nobody can see from a green run, because on a healthy
// tree the sleep and the verification produce the same observable. This probe
// makes the two shapes distinguishable by giving them a tree that IGNORES
// SIGTERM, and then MEASURING the tree rather than asking the teardown whether
// it worked.
//
// ═══ WHAT IT IS NOT ═══
//
// It is a model of the shape, not a run of the rig. The real harnesses need
// `node_modules/.bin/electron`, which does not exist in an agent worktree, so
// the end-to-end run is the overseer's foreground job. What this probe can and
// does establish is the thing that is true of the SHAPE regardless of what is
// under it: `sleep(ms)` returns after ms whatever the tree is doing, and
// `killTree` does not return until it has looked.
//
// A SIGTERM-ignoring shell is realistic poison, not a strawman: it is the same
// observable as an Electron that is mid-shutdown, blocked on a write, or
// stopped — every case where the graceful signal has not achieved anything
// within the fixed wait. What it removes is the RACE, so the row is
// deterministic instead of 1-in-4.
//
// LEAKS NOTHING: leg A deliberately ends with a live tree, and kills it with
// killTree before the probe exits; every child goes through `spawnGuarded`, so
// the exit net is armed even if a row throws.

import { spawnGuarded, killTree, descendants, running, cmdlineOf } from './lib/harness-guard.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const results = [];
const fails = [];
function check(id, what, ok, detail = '') {
  results.push({ id, ok });
  if (!ok) fails.push(`[${id}] ${what}${detail ? ` — ${detail}` : ''}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'} [${id}] ${what}${detail ? `\n         ${detail}` : ''}`);
}

// A shell that ignores SIGTERM, with a child that ignores it too. `trap "" TERM`
// sets the disposition to IGNORE, which — unlike a trap handler — cannot be
// overridden from outside the process.
const IGNORER = 'trap "" TERM; while :; do sleep 1; done';

function spawnIgnoringTree(tag) {
  const child = spawnGuarded('/bin/sh', ['-c', `sh -c '${IGNORER}' & ${IGNORER}`],
    { stdio: 'ignore', detached: true });
  console.log(`\n=== ${tag}: pid ${child.pid} (a group that ignores SIGTERM)`);
  return child;
}

/** The tree as the teardown's own module sees it: pids still RUNNING (a zombie
 *  is not running), with their argv, so a row cannot go green over a corpse. */
function liveTree(rootPid) {
  return [...descendants(rootPid)].filter(running)
    .map((p) => ({ pid: p, argv: cmdlineOf(p).slice(0, 60) }));
}

async function main() {
  // ── the anti-vacuous row ────────────────────────────────────────────────
  // Every "gone" row below is meaningless unless something was there. If the
  // tree never comes up, this probe measures nothing and says so.
  const a = spawnIgnoringTree('LEG A — the OLD shape, SIGTERM then a fixed sleep');
  for (let i = 0; i < 40 && liveTree(a.pid).length < 3; i++) await sleep(100);
  const beforeA = liveTree(a.pid);
  check('0', 'the probe tree is UP before anything is signalled [instrument]',
    beforeA.length >= 3, `${beforeA.length} live pid(s): ${beforeA.map((p) => p.pid).join(',')}`);
  if (beforeA.length < 3) throw new Error('no tree to tear down — every row below would be vacuous');

  // ── LEG A: the shape this parcel removed ────────────────────────────────
  const ta = Date.now();
  try { process.kill(-a.pid, 'SIGTERM'); } catch { /* */ }
  await sleep(1500);
  const afterSleep = liveTree(a.pid);
  const elapsedA = Date.now() - ta;
  check('a1', 'the OLD shape RETURNS WITH THE TREE STILL ALIVE — the fixed sleep expired and '
    + 'nothing escalated, so the next statement (rmSync, or the next launch) runs beside a live app',
    afterSleep.length >= 2,
    `${elapsedA} ms after the SIGTERM: ${afterSleep.length} of ${beforeA.length} pid(s) still running `
    + `— ${afterSleep.map((p) => `${p.pid} ${p.argv}`).join(' | ')}`);
  check('a2', 'and it returned in about the length of the sleep — the duration is ALL it waited for',
    elapsedA >= 1500 && elapsedA < 2500, `${elapsedA} ms of a 1500 ms sleep`);

  // ── the same tree, the NEW shape ────────────────────────────────────────
  // Same pids, same signal ignored: the only thing that changed is the
  // teardown, which is what makes this a paired comparison rather than two
  // anecdotes.
  const tb = Date.now();
  const r = await killTree(a);
  const afterKill = liveTree(a.pid);
  check('a3', 'killTree on THE SAME still-live tree leaves nothing running — it escalated past the '
    + 'ignored SIGTERM and did not return until it had looked',
    r.survivors.length === 0 && afterKill.length === 0,
    `killTree reported survivors=${JSON.stringify(r.survivors)} after ${Date.now() - tb} ms; `
    + `independent re-read: ${afterKill.length} live pid(s)`);

  // ── LEG B: the shape the three rigs now use, on a fresh tree ────────────
  const b = spawnIgnoringTree('LEG B — the NEW shape, killTree from the first signal');
  for (let i = 0; i < 40 && liveTree(b.pid).length < 3; i++) await sleep(100);
  const beforeB = liveTree(b.pid);
  check('b0', 'the second probe tree is UP before anything is signalled [instrument]',
    beforeB.length >= 3, `${beforeB.length} live pid(s)`);
  const tc = Date.now();
  const rb = await killTree(b);
  const afterB = liveTree(b.pid);
  check('b1', 'the NEW shape does not proceed until the tree is OBSERVED gone',
    rb.survivors.length === 0 && afterB.length === 0 && beforeB.length >= 3,
    `${beforeB.length} live before, survivors=${JSON.stringify(rb.survivors)}, `
    + `${afterB.length} live after, ${Date.now() - tc} ms`);
  check('b2', 'and it is LOUD about what it did: killTree returns the tree it captured and the '
    + 'survivor list, which is what a caller can WARN on. sleep() returns undefined.',
    Array.isArray(rb.tree) && rb.tree.length >= 3 && Array.isArray(rb.survivors),
    `tree=${rb.tree.length} pid(s), killed=${rb.killed}, survivors=${rb.survivors.length}`);

  const passed = results.filter((x) => x.ok).length;
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${passed}/${results.length} rows passed   (wall ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log(`  ${f}`)); }
  console.log('NOTE: this proves the SHAPE, on a modelled tree. The full rigs '
    + '(harness:bganim-insert-roomy and its two siblings) need node_modules/.bin/electron and are '
    + 'the overseer\'s foreground run.');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(`\nPROBE ERROR: ${e.message}`); process.exit(2); });
