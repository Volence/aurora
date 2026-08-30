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
// ── HAZARD 4: the X server's LEFTOVERS, which hazard 2's fix creates ───────
//
// O20. `/usr/bin/xvfb-run` is a shell script with NO TRAP. Its entire cleanup
//
//     kill $XVFBPID
//     xauth remove ":$SERVERNUM"
//     rm -r "$XVFB_RUN_TMPDIR"
//
// sits at /usr/bin/xvfb-run:184-192, AFTER the line that runs the command
// (:180) and with no `trap` anywhere in the file.
//
// Signal the wrapper and none of it runs — which is
// precisely what `killTree` does on every single teardown. So the guard that
// fixed hazard 2 is the thing that guarantees hazard 4. This is the same
// vacuous-guard shape this repo keeps meeting, and here it lives inside a
// distro script: cleanup written after a command that need not return is
// cleanup that does not exist.
//
// THERE ARE TWO LEAK RATES, NOT ONE, AND THE BIG ONE HAD NEVER BEEN COUNTED.
// Measured here rather than reasoned about, and the first measurement got it
// wrong — the RED row of xvfb-reap-proof.mjs refused to reproduce:
//
//   /tmp/xvfb-run.XXXXXX/    the wrapper's tempdir (pidfile + Xauthority).
//                            LEAKS ON EVERY TEARDOWN, graceful ones included:
//                            only the wrapper's own `rm -r` ever removes it,
//                            and the wrapper is what we kill. 1504 of these on
//                            this box on 2026-08-30, back to 25 Aug.
//
//   /tmp/.X<N>-lock          the lock file, and
//   /tmp/.X11-unix/X<N>      the listening socket.
//                            These leak only on an ABRUPT teardown. Xvfb
//                            removes both itself when it is SIGTERMed, so
//                            `killTree`'s graceful path is already clean —
//                            but `killTreeSync` (Ctrl-C, uncaught throw,
//                            process exit) is SIGKILL, and a crash is a
//                            SIGKILL by another name. 89 of these on the box.
//
// The 17:1 ratio between the two counts is the shape of that difference, and
// it is why counting only locks and sockets said the leak was under control.
//
// It is not cosmetic. `xvfb-run -a` picks its display with
// `find_free_servernum` (/usr/bin/xvfb-run:88-99), which walks UP from 99
// while `/tmp/.X$i-lock` exists — so every leaked lock permanently burns a
// display number and every later run pays a longer scan. Display numbers had
// climbed to :1030 before the 2026-08-29 sweep.
//
// `reapDisplays()` closes it, and it is scoped exactly the way hazard 3 says
// it must be: it removes a lock/socket ONLY for a display number read out of
// an Xvfb process that was inside a tree THIS harness launched, and a tempdir
// ONLY when an owned process named it in its own XAUTHORITY. It never matches
// a pattern, never touches :0, and refuses any display whose socket is still
// bound by a live process.
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
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
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

// ── HAZARD 4: the X server's leftovers ─────────────────────────────────────

/** The only tempdir shape `xvfb-run` makes (`mktemp -d -t xvfb-run.XXXXXX`).
 *  Anything else is somebody else's directory and is never removed. */
export const XVFB_TMPDIR_RE = /^\/tmp\/xvfb-run\.[A-Za-z0-9]{6}$/;

/** Display numbers that are never reaped whatever the evidence says. `:0` is
 *  the owner's real session (Xwayland, pid 969 on this box) and deleting its
 *  socket would take his desktop down. */
const NEVER_REAP_DISPLAYS = new Set([0]);

/** Block without a timer, so the exit-handler path (which cannot await) can
 *  still give a SIGKILLed process the moment it needs to release its socket. */
function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* best effort */ }
}

/**
 * Is this pid STILL THE PROCESS WE RECORDED, and still running?
 *
 * Three-valued where `alive()` is two-valued, and each distinction has already
 * cost somebody a wrong answer:
 *   - a ZOMBIE answers signal 0 and is not running. On the Ctrl-C path the
 *     Xvfb we just SIGKILLed is briefly a zombie, and treating that as "still
 *     alive" would refuse to reap on the one path where nothing else ever will.
 *   - a RECYCLED pid answers signal 0 and is somebody else. That is exactly how
 *     display :151 was held back on 2026-08-29 by a Vivaldi renderer thread.
 *     If the argv no longer matches, our process is gone.
 */
function stillRunningAs(pid, argv) {
  if (!alive(pid)) return false;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    if (/\)\s+Z\s/.test(stat)) return false;                 // zombie: dead, not yet reaped
  } catch { return false; }                                   // gone between the two reads
  return cmdlineOf(pid) === argv;                             // not recycled onto something else
}

/** Unix-socket paths currently BOUND by a live process, from /proc/net/unix.
 *
 *  This is the strong instrument, and it exists because the weak one has
 *  already misled a session here: a *lock file* names a pid, and a pid can be
 *  RECYCLED onto an unrelated process, so "that pid is in use" is not "that X
 *  server runs" (2026-08-29, display :151 held back by a Vivaldi renderer
 *  thread that had inherited the recorded pid). A path in /proc/net/unix is a
 *  live binding by construction: no binding, no row. */
function boundSocketPaths() {
  const out = new Set();
  try {
    for (const line of readFileSync('/proc/net/unix', 'utf8').split('\n')) {
      const p = line.trim().split(/\s+/)[7];
      if (p) out.add(p.replace(/^@/, ''));
    }
  } catch { /* no /proc/net/unix — caller treats "unknown" as "do not touch" */ }
  return out;
}

/**
 * What X artifacts does the tree under `rootPid` own?
 *
 * MUST BE CALLED BEFORE THE FIRST SIGNAL, for the same reason the tree is:
 * once the wrapper dies its children reparent to init, and an orphaned Xvfb
 * can no longer be attributed to us. After that point the only honest answer
 * is "unknown", and unknown must never become "safe to delete".
 *
 * Ownership, both fields:
 *   - a display number comes from the argv of an **Xvfb process inside our own
 *     tree** (`Xvfb :123 -screen ...`) — never from a DISPLAY environment
 *     variable, which our own process may have inherited from the desktop and
 *     which would therefore name `:0`;
 *   - a tempdir comes from the XAUTHORITY of a process inside our own tree,
 *     and only if it matches XVFB_TMPDIR_RE.
 */
export function displayArtifacts(rootPid) {
  const displays = [];
  const tmpdirs = new Set();
  const unknown = [];
  if (!Number.isInteger(rootPid)) return { displays, tmpdirs: [], unknown: ['no root pid'] };
  for (const pid of descendants(rootPid)) {
    if (pid === process.pid) continue;
    const argv = cmdlineOf(pid);
    if (/(^|\/)Xvfb( |$)/.test(argv)) {
      const m = /(?:^|\s):(\d+)(?:\s|$)/.exec(argv);
      if (m) displays.push({ n: Number(m[1]), xvfbPid: pid, argv });
      else unknown.push(`pid ${pid} is an Xvfb but its argv carries no :N — ${argv.slice(0, 90)}`);
    }
    try {
      const env = readFileSync(`/proc/${pid}/environ`, 'utf8');
      const xa = /(?:^|\0)XAUTHORITY=([^\0]*)/.exec(env);
      if (xa) {
        const dir = xa[1].replace(/\/[^/]*$/, '');
        if (XVFB_TMPDIR_RE.test(dir)) tmpdirs.add(dir);
      }
    } catch { /* raced with exit, or not readable — not fatal, just less to reap */ }
  }
  return { displays, tmpdirs: [...tmpdirs], unknown };
}

/**
 * Remove the artifacts named by `displayArtifacts`, and nothing else.
 *
 * Call AFTER the tree is dead. Every removal is gated four ways and each
 * refusal is returned in words:
 *   1. never a display in NEVER_REAP_DISPLAYS;
 *   2. never while the Xvfb we recorded is still alive;
 *   3. never while /proc/net/unix shows the display's socket still BOUND —
 *      i.e. some live server answers on it, ours or not;
 *   4. never a tempdir outside XVFB_TMPDIR_RE.
 */
export function reapDisplays(art, { quiet = false } = {}) {
  const removed = [];
  const refused = [];
  const bound = boundSocketPaths();
  for (const d of art?.displays ?? []) {
    const sock = `/tmp/.X11-unix/X${d.n}`;
    if (NEVER_REAP_DISPLAYS.has(d.n)) { refused.push(`:${d.n} is never reaped (the owner's session)`); continue; }
    if (stillRunningAs(d.xvfbPid, d.argv)) { refused.push(`:${d.n} — its Xvfb (pid ${d.xvfbPid}) is still RUNNING`); continue; }
    if (bound.has(sock)) { refused.push(`:${d.n} — ${sock} is still BOUND by a live process`); continue; }
    for (const p of [`/tmp/.X${d.n}-lock`, sock]) {
      // `removed` lists what was ACTUALLY THERE. `rm -f` over a path that never
      // existed succeeds, and a cleanup report padded with those is a count of
      // nothing — the same lie as a check that goes green over what it could
      // not see.
      if (!existsSync(p)) continue;
      try { rmSync(p, { force: true }); removed.push(p); }
      catch (e) { refused.push(`${p} — ${e.message}`); }
    }
  }
  for (const dir of art?.tmpdirs ?? []) {
    if (!XVFB_TMPDIR_RE.test(dir)) { refused.push(`${dir} — not an xvfb-run tempdir`); continue; }
    if (!existsSync(dir)) continue;
    try { rmSync(dir, { recursive: true, force: true }); removed.push(`${dir}/`); }
    catch (e) { refused.push(`${dir} — ${e.message}`); }
  }
  // LOUD ON UNMEASURABLE: an Xvfb we could not attribute a display to is said
  // out loud rather than folded into a clean count.
  for (const u of art?.unknown ?? []) refused.push(`UNMEASURABLE: ${u}`);
  if (!quiet && (removed.length || refused.length)) {
    console.log(`cleanup: X artifacts reaped (${removed.length}): ${removed.join(' ') || 'none'}`);
    for (const r of refused) console.log(`cleanup: X artifact REFUSED — ${r}`);
  }
  return { removed, refused };
}

/**
 * SIGTERM the tree, give it a grace period to flush, then SIGKILL what is
 * left. Returns what it saw and what it killed, so a caller can PRINT it.
 *
 * The tree is captured before the first signal — see the header. `graceMs`
 * defaults to 4s because Chromium commits localStorage on a throttled timer
 * and a straight SIGKILL loses the last few seconds of writes, which has
 * already caused one harness to report a false failure.
 */
export async function killTree(child, { graceMs = 4000, quiet = false, reap = true } = {}) {
  if (!child || !Number.isInteger(child.pid)) {
    return { tree: [], killed: 0, note: 'no child to kill' };
  }
  const tree = [...descendants(child.pid)];
  const seen = tree.map((p) => `${p} ${cmdlineOf(p).slice(0, 90)}`);
  // BEFORE the first signal, for the same reason the tree is: an orphaned Xvfb
  // cannot be attributed to us afterwards, and unattributable is not reapable.
  const art = reap ? displayArtifacts(child.pid) : null;
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
  const reaped = art ? reapDisplays(art, { quiet }) : null;
  return { tree, seen, killed, survivors, artifacts: art, reaped };
}

/** Synchronous last-resort variant for process-exit handlers, which cannot
 *  await. Blunt on purpose: at exit there is nothing left to flush for. */
export function killTreeSync(child, { reap = true } = {}) {
  if (!child || !Number.isInteger(child.pid)) return { tree: [], killed: 0 };
  const tree = [...descendants(child.pid)];
  // Read the artifacts before signalling — this is the Ctrl-C path, and it is
  // the ONE path where the X leftovers used to be guaranteed: an interrupted
  // harness never reaches its `finally`, so nothing else was ever going to
  // remove them. SIGKILL is immediate, so no grace loop is needed before the
  // reap; `reapDisplays` re-checks liveness per display anyway.
  const art = reap ? displayArtifacts(child.pid) : null;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* not a group leader */ }
  const killed = killPids(tree);
  // A SIGKILLed process releases its sockets when the kernel tears it down,
  // not at the instant the signal is sent. Without this pause the bound-socket
  // gate reads the corpse as live and refuses — a leak on the exact path this
  // exists for. 250ms, blocking, because an exit handler cannot await.
  if (art?.displays.length) sleepSync(250);
  const reaped = art ? reapDisplays(art, { quiet: true }) : null;
  return { tree, killed, artifacts: art, reaped };
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
