// ═══════════════════════════════════════════════════════════════════════════
// harness-guard — the ONE copy of the three guards every Aurora launcher needs
// ═══════════════════════════════════════════════════════════════════════════
//
// O16. Three hazards, all of them OBSERVED against the owner's own running
// editor on 2026-08-28/29, all of them found by accident. They are properties
// of *launching Aurora from a script*, so they hit every harness in
// scratchpad/ that does it — around ninety files.
//
// ── HAZARD 1: the shared discovery file ────────────────────────────────────
//
// Aurora publishes the port of its Aether binding to ~/.aurora/mcp.json and
// the legacy ~/.sonic-level-editor/mcp.json. Those paths are SHARED. The
// owner's Aurora writes them; so does every throwaway instance a harness
// launches. That cuts both ways and both directions were seen:
//
//   1a. WRITE. The harness's instance overwrites the file, so the owner's
//       tooling starts resolving to a throwaway app on a port that dies with
//       the run. The file is left pointing at a corpse.
//
//   1b. READ — the dangerous one. A harness that reads that file to find
//       "the app" can find the OWNER'S Aurora, paint into his open document,
//       and read its own writes straight back. Every row goes green while
//       describing nothing and corrupting his work. The failure mode is
//       SILENT SUCCESS, which is why a "did it crash?" check never sees it.
//
// The treatment is two-sided: `snapshotDiscovery()`/`restoreDiscovery()` put
// the files back byte for byte (or delete them if they did not exist), and
// `resolveOwnedDiscovery()` refuses any port whose file does not name a pid
// descended from a process THIS harness spawned.
//
// ── HAZARD 2: the orphaned Electron ────────────────────────────────────────
//
// `child.kill()` kills the `xvfb-run` WRAPPER, not the Electron underneath
// it. The instance survives the harness, holding the CDP port and the
// discovery file it wrote. Two such orphans were found and killed by hand.
// `killTree()` walks /proc for every descendant and SIGKILLs the real thing.
//
// The tree must be captured BEFORE the first signal: once the wrapper dies,
// its children reparent to init and are no longer descendants of anything
// this harness can name.
//
// ── HAZARD 3: `pkill -f`, which is hazard 2's "fix" and is worse ───────────
//
// Twenty-eight harnesses tried to solve hazard 2 with
//
//     pkill -f 'aurora/dist/main/inde[x].mjs'
//
// That pattern does not say "mine". It says "any Electron whose argv contains
// that path" — and the owner's Aurora, running from
// /home/volence/sonic_hacks/aurora/dist/main/index.mjs, MATCHES IT. Worse, a
// harness run from a worktree launches
// .../aurora/.claude/worktrees/agent-X/dist/main/index.mjs, which does NOT
// match — so from a worktree that line kills the owner's editor and spares
// its own orphan. It is exactly backwards. Six more harnesses carry a stale
// `ux-plan6/...` pattern that matches nothing at all, so their cleanup is a
// no-op they never noticed.
//
// Descent from a pid this process spawned is the only ownership test that is
// actually about ownership. Nothing here ever signals a pid outside that set.
//
// ── HOW A HARNESS USES THIS ────────────────────────────────────────────────
//
//     import { spawnGuarded, killTree, resolveOwnedDiscovery }
//       from './lib/harness-guard.mjs';
//
//     const child = spawnGuarded('/usr/bin/xvfb-run', [...], { ... });
//     try { ... } finally { await killTree(child); }
//
// `spawnGuarded` takes the discovery snapshot on its first call — BEFORE any
// app can overwrite it — and installs exit/SIGINT/SIGTERM/uncaughtException
// handlers that kill every registered tree and restore the files. So a
// harness that throws, is Ctrl-C'd, or simply forgot a `finally` still leaves
// the owner's environment as it found it. The explicit `killTree` in a
// `finally` is still worth writing: it is graceful (SIGTERM, grace, SIGKILL),
// where the exit-handler net has to be synchronous and blunt.

import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Both paths the app publishes its Aether port to. The owner's app writes
 *  these too — that is the whole problem. */
export const DISCOVERY_FILES = ['.aurora', '.sonic-level-editor']
  .map((sub) => join(homedir(), sub, 'mcp.json'));

/** Paths a *reader* may look in. Superset of DISCOVERY_FILES: several probes
 *  historically also consulted ~/.config/aurora and ~/.aether. */
export const DISCOVERY_READ_PATHS = ['.aurora', '.config/aurora', '.aether', '.sonic-level-editor']
  .map((sub) => join(homedir(), sub, 'mcp.json'));

// ── HAZARD 1a: snapshot / restore ──────────────────────────────────────────

/** Byte-for-byte capture of both discovery files. `content: null` means the
 *  file did not exist, and restore must then DELETE rather than write. */
export function snapshotDiscovery() {
  return DISCOVERY_FILES.map((f) => {
    try { return { f, content: readFileSync(f, 'utf8') }; } catch { return { f, content: null }; }
  });
}

/**
 * Put the files back as they were.
 *
 * ONE REFINEMENT ON "byte for byte": if the file now names a pid that is ALIVE
 * and is NOT one of ours, the owner has started his Aurora since the snapshot
 * was taken — he restarts it to test builds, and he may do so mid-run. Writing
 * our older bytes over his fresh file would break his tooling in exactly the way
 * this guard exists to prevent, so we leave it and say so. Restoring is a
 * promise not to make things worse, not a promise to write.
 */
export function restoreDiscovery(snap) {
  const done = [];
  const ours = new Set();
  for (const r of ownedRoots()) for (const p of descendants(r)) ours.add(p);
  for (const { f, content } of snap ?? []) {
    try {
      let cur = null;
      try { cur = JSON.parse(readFileSync(f, 'utf8')); } catch { /* absent or not JSON */ }
      if (cur && Number.isInteger(cur.pid) && !ours.has(cur.pid) && alive(cur.pid)) {
        done.push(`${f} LEFT ALONE — it now names LIVE pid ${cur.pid}, which is not ours; `
          + 'an app started since our snapshot owns this file and our bytes are stale');
        continue;
      }
      if (content === null) { rmSync(f, { force: true }); done.push(`${f} (deleted — absent before the run)`); }
      else { writeFileSync(f, content); done.push(`${f} (${content.length}B restored)`); }
    } catch (e) { done.push(`${f} WARN could not restore: ${e.message}`); }
  }
  return done;
}

/** Printable form of a snapshot — a row that judges the restore must PRINT
 *  the artifact it judged, not assert about it. */
export function describeDiscovery(snap) {
  return (snap ?? []).map(({ f, content }) =>
    `${f} ${content === null ? '(absent)' : `${content.length}B ${JSON.stringify(content).slice(0, 120)}`}`).join('\n        ');
}

/** What is on disk RIGHT NOW, in the same printable shape. */
export function readDiscoveryNow() {
  return describeDiscovery(snapshotDiscovery());
}

// ── HAZARD 2: descent and the tree kill ────────────────────────────────────

/** Every pid descended from `root`, `root` included. Linux /proc only. */
export function descendants(root) {
  const parent = new Map();
  let procs;
  try { procs = readdirSync('/proc'); } catch { return new Set([root]); }
  for (const d of procs) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const m = /^PPid:\s*(\d+)$/m.exec(readFileSync(`/proc/${d}/status`, 'utf8'));
      if (m) parent.set(Number(d), Number(m[1]));
    } catch { /* raced with exit */ }
  }
  const out = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of parent) {
      if (!out.has(pid) && out.has(ppid)) { out.add(pid); grew = true; }
    }
  }
  return out;
}

/** True iff `pid` is `root` or descended from it. The ownership test. */
export function isDescendantOf(pid, root) {
  return Number.isInteger(pid) && Number.isInteger(root) && descendants(root).has(pid);
}

/** Is this pid alive? Signal 0 tests without delivering. */
export function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/** The argv of a pid, for printing what was actually killed. */
export function cmdlineOf(pid) {
  try { return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0+$/, '').replace(/\0/g, ' '); }
  catch { return '(gone)'; }
}

function killPids(pids) {
  let n = 0;
  for (const pid of [...pids].reverse()) {
    if (pid === process.pid) continue;   // never signal ourselves
    try { process.kill(pid, 'SIGKILL'); n++; } catch { /* already gone */ }
  }
  return n;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * SIGTERM the tree, give it a grace period to flush, then SIGKILL what is
 * left. Returns what it saw and what it killed, so a caller can PRINT it.
 *
 * The tree is captured before the first signal — see the header. `graceMs`
 * defaults to 4s because Chromium commits localStorage on a throttled timer
 * and a straight SIGKILL loses the last few seconds of writes, which has
 * already caused one harness to report a false failure.
 */
export async function killTree(child, { graceMs = 4000, quiet = false } = {}) {
  if (!child || !Number.isInteger(child.pid)) {
    return { tree: [], killed: 0, note: 'no child to kill' };
  }
  const tree = [...descendants(child.pid)];
  const seen = tree.map((p) => `${p} ${cmdlineOf(p).slice(0, 90)}`);
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* not a group leader */ }
  try { child.kill('SIGTERM'); } catch { /* gone */ }
  if (graceMs > 0) await sleep(graceMs);
  const killed = killPids(tree);
  await sleep(300);
  const survivors = tree.filter(alive);
  registered.delete(child);
  if (!quiet) {
    console.log(`cleanup: tree under pid ${child.pid} (${tree.length} process(es)):`);
    for (const s of seen) console.log(`           ${s}`);
    console.log(`cleanup: SIGKILLed ${killed}; survivors after kill: ${survivors.length ? survivors.join(',') : 'none'}`);
  }
  return { tree, seen, killed, survivors };
}

/** Synchronous last-resort variant for process-exit handlers, which cannot
 *  await. Blunt on purpose: at exit there is nothing left to flush for. */
export function killTreeSync(child) {
  if (!child || !Number.isInteger(child.pid)) return { tree: [], killed: 0 };
  const tree = [...descendants(child.pid)];
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* not a group leader */ }
  const killed = killPids(tree);
  return { tree, killed };
}

// ── HAZARD 1b: the ownership rule for readers ──────────────────────────────

const registered = new Set();

/** The pids this harness spawned through `spawnGuarded`. */
export function ownedRoots() {
  return [...registered].map((c) => c.pid).filter(Number.isInteger);
}

/**
 * Resolve the Aether port of an app THIS HARNESS LAUNCHED — and nothing else.
 *
 * The discovery file's `port` is never trusted on its own. The `pid` it names
 * must be a descendant of a process this harness spawned. Anything else and
 * this returns null, and the caller MUST report UNMEASURABLE rather than
 * guess: the alternative is talking to the owner's editor and calling it a
 * pass.
 *
 * `roots` defaults to every `spawnGuarded` child, and the set is recomputed
 * on every poll — the app writes the file a beat after launch and the pid set
 * grows as Electron forks.
 *
 * The returned object carries `raw`, the exact bytes read, so the caller can
 * print the artifact it judged.
 */
export async function resolveOwnedDiscovery({ roots = null, timeoutMs = 15000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const rejected = [];
  for (;;) {
    const rootPids = roots ?? ownedRoots();
    if (rootPids.length === 0) {
      return { ok: false, why: 'this harness spawned nothing through spawnGuarded — there is no app it may own', rejected };
    }
    const ours = new Set();
    for (const r of rootPids) for (const p of descendants(r)) ours.add(p);
    for (const f of DISCOVERY_READ_PATHS) {
      let raw;
      try { raw = readFileSync(f, 'utf8'); } catch { continue; }
      let j;
      try { j = JSON.parse(raw); } catch { rejected.push(`${f}: unparseable`); continue; }
      if (!j.port) { rejected.push(`${f}: no port field`); continue; }
      if (!Number.isInteger(j.pid)) {
        rejected.push(`${f}: port ${j.port} but pid field is ${JSON.stringify(j.pid)} — cannot establish ownership`);
        continue;
      }
      if (!ours.has(j.pid)) {
        rejected.push(`${f}: port ${j.port} pid ${j.pid} is NOT a descendant of ${rootPids.join(',')} — refused`);
        continue;
      }
      return { ok: true, port: j.port, pid: j.pid, from: f, raw, roots: rootPids, rejected };
    }
    if (Date.now() >= deadline) {
      return {
        ok: false,
        roots: rootPids,
        rejected,
        why: `no discovery file named a pid descended from ${rootPids.join(',')} within ${timeoutMs}ms`,
      };
    }
    await sleep(pollMs);
  }
}

// ── the launcher ───────────────────────────────────────────────────────────

let snapshot = null;
let netInstalled = false;

/** The snapshot taken before the first guarded launch. */
export function discoverySnapshot() { return snapshot; }

/**
 * Declare the state the discovery files must be returned to, overriding the one
 * `spawnGuarded` would take at first launch.
 *
 * ⚠ THIS EXISTS BECAUSE THE OMISSION WAS A REAL BUG, CAUGHT BY RUNNING IT.
 * `spawnGuarded` snapshots at the FIRST LAUNCH. A harness that mutates the
 * discovery files BEFORE launching — harness-guard-proof.mjs plants a foreign
 * pid in one, on purpose — makes the guard's snapshot a picture of the PLANT,
 * not of the pre-run world. The exit-handler net then faithfully restored the
 * plant, seconds after the harness's own `finally` had deleted it, and left the
 * owner's `~/.aurora/mcp.json` holding a dead pid. Observed exactly that way.
 *
 * Call this with a snapshot taken before any mutation and there is one
 * authority instead of two.
 */
export function setDiscoveryBaseline(snap) {
  snapshot = snap;
  installNet();
  return snap;
}

function installNet() {
  if (netInstalled) return;
  netInstalled = true;
  const net = () => {
    for (const c of [...registered]) { try { killTreeSync(c); } catch { /* */ } }
    registered.clear();
    if (snapshot) { try { restoreDiscovery(snapshot); } catch { /* */ } }
  };
  process.on('exit', net);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => { net(); process.exit(130); });
  }
  process.on('uncaughtException', (e) => { net(); console.error('HARNESS ERROR:', e); process.exit(2); });
}

/**
 * `spawn`, plus both guards.
 *
 * Takes the discovery snapshot BEFORE the app can overwrite it (once per
 * process), registers the child so the ownership rule and the exit-handler
 * net can see it, and forces `detached: true` so the whole group is
 * signallable.
 *
 * Use this for anything that becomes an Aurora Electron. It is NOT for the
 * oracle emulator — that binary does not touch the discovery files and is out
 * of scope here.
 */
export function spawnGuarded(cmd, args, opts = {}) {
  if (snapshot === null) {
    snapshot = snapshotDiscovery();
    console.log(`guard: discovery snapshot taken before launch:\n        ${describeDiscovery(snapshot)}`);
  }
  installNet();
  const child = spawn(cmd, args, { detached: true, ...opts });
  registered.add(child);
  child.on('exit', () => { /* keep it registered: the tree may outlive the wrapper */ });
  return child;
}

/** Restore the files now and report what was put back. Safe to call twice;
 *  the exit-handler net will call it again and that is idempotent. */
export function restoreDiscoveryNow() {
  if (!snapshot) return [];
  const done = restoreDiscovery(snapshot);
  for (const d of done) console.log(`cleanup: restored ${d}`);
  return done;
}
