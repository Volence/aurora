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
// ── THE LESSON THIS FILE ACTUALLY TEACHES, WHICH IS NOT HAZARD 4 ───────────
//
// `boundSocketPaths()` — the strong instrument written to close hazard 4 —
// FAILED OPEN against its own docstring. Its catch returned an empty `Set`
// while the comment beside it promised the caller would treat "unknown" as
// "do not touch". `bound.has(sock)` over an empty Set is `false`, and `false`
// is the value that means PROCEED TO DELETE. So an unreadable /proc/net/unix
// silently inverted a refusal into a permission, and NEVER_REAP_DISPLAYS
// became the only thing standing between the reaper and the owner's desktop
// socket.
//
// The general form, and it is worth more than the `xvfb-run` story above:
// **THE FAILURE STATE AND THE SUCCESS STATE EMITTED THE SAME ARTIFACT.**
// "I could not look" and "I looked and nothing is bound" were both an empty
// Set. No caller could have distinguished them, however carefully written. An
// instrument that cannot report its own blindness is the vacuous shape this
// header is about — and it was firing inside the guard written to close a
// vacuous-guard incident. It now returns `null` for unknown, and `reapDisplays`
// treats that as GATE 0: refuse everything, loudly.
//
// It was latent, never live (/proc/net/unix is readable in practice, and
// attribution keeps :0 out of the list), and it was found the only way things
// like this are found: by planting the poison — emptying NEVER_REAP_DISPLAYS —
// and noticing the proof stayed GREEN because a neighbouring gate covered for
// the one that had been deleted. Bar 2d cause (ii). Every gate in
// `reapDisplays` now has a row in xvfb-reap-proof.mjs that asserts WHICH gate
// refused, and all four were verified by deleting them one at a time.
//
// ── HAZARD 5: THE XVFB THAT WAS NEVER USED ─────────────────────────────────
//
// O36. Every launcher in scratchpad/ opens with the same two lines:
//
//     const env = { ...process.env, ... };
//     delete env.DISPLAY;          // never the owner's X session
//
// and then runs the app under `xvfb-run`. The comment says what the author
// intended. It is not what happens. MEASURED 2026-08-30, not reasoned about:
// a window-less Electron (no BrowserWindow at all, so nothing can appear on
// anyone's screen) launched through EXACTLY that shape, under an Xvfb given
// the deliberately distinctive geometry 1001x777, was asked what displays it
// could see. It answered
//
//     2844x1600 @1.35 , 1920x1080 @1
//
// — the owner's two real monitors. Not 1001x777. The Xvfb was started, was
// paid for, and was never connected to.
//
// WHY. `delete env.DISPLAY` is an X11 gesture, and the attachment is not
// happening over X11. The owner's session exports
//
//     ELECTRON_OZONE_PLATFORM_HINT=auto
//     WAYLAND_DISPLAY=wayland-0
//     XDG_RUNTIME_DIR=/run/user/1000
//
// and `{ ...process.env }` copies all three into every harness. `auto` tells
// Chromium's Ozone layer to prefer Wayland when a compositor is reachable, and
// one always is. DISPLAY is irrelevant to that decision, so deleting it
// removes the fallback and leaves the preference.
//
// ⚠ THE OBVIOUS FIX DOES NOT WORK, AND THAT IS THE PART WORTH READING. Also
// deleting WAYLAND_DISPLAY — the treatment window-icon-probe.mjs applies, and
// the one anybody would reach for — STILL reported the owner's monitors.
// libwayland's `wl_display_connect(NULL)` falls back to the literal name
// "wayland-0" under $XDG_RUNTIME_DIR when WAYLAND_DISPLAY is unset, so hiding
// the variable hides nothing. Confirmed from the other side: with
// XDG_RUNTIME_DIR removed as well, Electron did not fall back to X11 — it
// printed "Failed to connect to Wayland display" and SEGFAULTED (exit 139),
// proving it had been trying Wayland the whole time.
//
// Setting ELECTRON_OZONE_PLATFORM_HINT=x11 does not work either (measured, on
// Electron v41.2.1), and neither does the `--ozone-platform-hint=x11` command
// line. The ONE thing that works is the explicit platform flag:
//
//     --ozone-platform=x11        ->  1001x777, our Xvfb, every time
//
// So that flag is injected here, into the argv of every Electron this module
// spawns, rather than left to ninety harnesses to remember. `delete
// env.DISPLAY` is kept by the harnesses and is now merely redundant: xvfb-run
// sets DISPLAY for its child itself.
//
// WHAT IT COST WHILE IT WAS LIVE. Every screenshot, every element rect and
// every devicePixelRatio any harness ever measured was taken on the owner's
// desktop at dpr 1.35, not on the Xvfb the harness asked for. That is the
// already-recorded "dpr varies run-to-run here" anomaly — it varies because it
// depends on which of his two monitors Chromium called primary, a quantity no
// harness controls or should ever have been able to see.
//
// ⚠ AND IT IS A SAFETY PROPERTY, NOT AN ACCURACY ONE. These harnesses DO
// create BrowserWindows. A window-less probe was used deliberately so that
// measuring this could not put anything on a screen the owner is using, so
// what a *windowed* run does is INFERRED here and not measured: an Electron
// attached to his compositor is one `show` away from his desktop. Nothing in
// this file should be read as having tested that, and nobody should test it
// while he is logged in.
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
import { randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Both paths the app publishes its Aether port to. The owner's app writes
 *  these too — that is the whole problem. */
export const DISCOVERY_FILES = ['.aurora', '.sonic-level-editor']
  .map((sub) => join(homedir(), sub, 'mcp.json'));

// ── HAZARD 1c: THE OTHER SHARED GLOBAL FILE, WHICH COST THE OWNER DATA ─────
//
// O52, 2026-09-03. `~/.config/<app>/recent-projects.json` is a SECOND file with
// exactly hazard 1's shape and it was outside this guard entirely. Every harness
// that opens a project appends to it (`src/main/recent-projects.ts`
// `addRecentProject` -> `writeFileSync(join(app.getPath('userData'),
// 'recent-projects.json'))`), it is capped at ten entries, it lives in no repo,
// and nothing cleaned it up.
//
// WHAT THAT COST. The O50 census ran 89 harnesses in one night. Each one
// unshifted its own `mkdtemp` project onto the list, so after ten runs every one
// of the OWNER'S ten entries had been pushed off the end. The sweep then deleted
// its temp directories, leaving ten rows pointing at nothing, and reset the file
// to `[]`. His recent-projects list was destroyed by a test run and cannot be
// reconstructed. MEASURED AGAIN HERE before the fix, one run of
// build-console-overlap-harness: the file went from one entry (his aeon) to two,
// row 0 being `/tmp/aurora-build-console-jQz4Mw` — a directory that no longer
// existed by the time the run ended.
//
// It is also a READ hazard, the dangerous direction, exactly as with the
// discovery files: `palette-drag-harness` and `palette-grid-harness` NAVIGATE by
// this list, and both died in the census with `aeon recent row unreachable`
// while printing a recent list made entirely of other harnesses' temp
// directories. A test whose result is a function of what ran before it is the
// one thing a test must not be.
//
// The treatment is the EXISTING one, widened rather than reinvented: these paths
// join the same snapshot/restore that already covers the two `mcp.json` files,
// so the same `spawnGuarded` first-launch capture, the same `finally`, and the
// same exit/SIGINT/uncaught net put them back.
//
// ⚠ ITS ONE HONEST LIMIT, STATED RATHER THAN DISCOVERED LATER: a byte-for-byte
// restore also erases a project the owner opens DURING a run. That window is a
// run long, it is the same trade the discovery-file restore already makes, and
// the alternative — merging his row back in — is a bespoke rule for one file.
// The discovery files have a pid to arbitrate with; a recents list has nothing
// comparable, so there is no non-bespoke version of "keep his newer entry".

/**
 * WHICH DIRECTORY, DERIVED. Electron's `app.getPath('userData')` on Linux is
 * `$XDG_CONFIG_HOME` (or `~/.config`) joined with `app.getName()`, and the app
 * name is NOT one value here — it depends on how the app was started, which is
 * why there are three real files on this box:
 *
 *   Electron            `electron <root>/dist/main/index.mjs` — the argument is
 *                       a FILE, so there is no package.json at the app path and
 *                       Electron falls back to its own default name. THIS IS
 *                       EVERY HARNESS LAUNCH, and the one the census evicted.
 *   <package.json name> `electron .` (`npm run dev`) — the app path is the repo,
 *                       so the name comes from package.json. THIS IS THE OWNER.
 *                       Read from the file rather than typed, so a rename cannot
 *                       silently drop his directory out of the guarded set.
 *   sonic-level-editor  the legacy name, still on disk here, and already carried
 *                       for the discovery file one line above.
 *
 * All three are guarded. Guarding a path no run touches costs nothing (an absent
 * file snapshots as `null` and restores as a delete); missing the one that IS
 * touched costs somebody their data, which is what happened.
 */
export const APP_NAMES = (() => {
  const names = ['Electron', 'sonic-level-editor'];
  try {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));
    if (typeof pkg.productName === 'string') names.push(pkg.productName);
    if (typeof pkg.name === 'string') names.push(pkg.name);
  } catch { /* a checkout without a readable package.json still guards the other two */ }
  return [...new Set(names)];
})();

/** Every `recent-projects.json` an Aurora launched on this machine could write. */
export const RECENT_PROJECT_FILES = APP_NAMES.map((n) =>
  join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), n, 'recent-projects.json'));

/**
 * EVERY SHARED GLOBAL FILE A RUN MUST GIVE BACK, with what kind each is.
 *
 * One list, because there is one snapshot, one restore and one exit net. A
 * second bespoke mechanism for the second file is how the first one came to
 * cover only half the hazard.
 */
export const GUARDED_GLOBAL_FILES = [
  ...DISCOVERY_FILES.map((f) => ({ f, kind: 'discovery' })),
  ...RECENT_PROJECT_FILES.map((f) => ({ f, kind: 'recents' })),
];

/** Paths a *reader* may look in. Superset of DISCOVERY_FILES: several probes
 *  historically also consulted ~/.config/aurora and ~/.aether. */
export const DISCOVERY_READ_PATHS = ['.aurora', '.config/aurora', '.aether', '.sonic-level-editor']
  .map((sub) => join(homedir(), sub, 'mcp.json'));

// ── HAZARD 1a: snapshot / restore ──────────────────────────────────────────

/** Byte-for-byte capture of every guarded global file. `content: null` means
 *  the file did not exist, and restore must then DELETE rather than write. */
export function snapshotDiscovery() {
  return GUARDED_GLOBAL_FILES.map(({ f, kind }) => {
    try { return { f, kind, content: readFileSync(f, 'utf8') }; } catch { return { f, kind, content: null }; }
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
  for (const { f, kind, content } of snap ?? []) {
    try {
      let cur = null;
      try { cur = JSON.parse(readFileSync(f, 'utf8')); } catch { /* absent or not JSON */ }
      // The pid arbitration is a DISCOVERY-file rule and says so. A recents list
      // is a JSON array with no pid in it, so this branch could never fire on
      // one anyway — naming the kind is what stops a later reader believing the
      // recents file has a liveness rule it does not have.
      if (kind !== 'recents' && cur && Number.isInteger(cur.pid) && !ours.has(cur.pid) && alive(cur.pid)) {
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

/**
 * Printable form of a snapshot — a row that judges the restore must PRINT the
 * artifact it judged, not assert about it.
 *
 * ⚠ EVERY LINE CARRIES A LIVENESS VERDICT, and that is not decoration. This
 * file's PRESENCE has never meant an app is up: the writer could only remove it
 * on a graceful quit, so every SIGTERMed run left one naming a dead pid (found
 * on this box 2026-08-31 naming pid 1383435, `/proc/1383435` absent). Printing
 * `1383435` on its own reads as "Aurora is on port 38473" to every human who
 * has ever looked at one of these lines. It is the `[ -S socket ]`-says-server
 * defect wearing a JSON file: the failure state and the success state emitted
 * the SAME artifact.
 *
 * `alive()` is signal 0, so a recycled pid answers yes — this says "a process
 * with that pid exists", which is strictly weaker than "Aurora is up" and is
 * why `resolveOwnedDiscovery` tests DESCENT and not this.
 */
export function describeDiscovery(snap) {
  return (snap ?? []).map(({ f, kind, content }) =>
    `${f} ${content === null ? '(absent)' : `${content.length}B ${kind === 'recents' ? entriesOf(content) : livenessOf(content)} `
      + JSON.stringify(content).slice(0, 120)}`).join('\n        ');
}

/** `N recent entr(y|ies)`, or why the question could not be asked. The recents
 *  file's counterpart to `livenessOf`: printing its bytes without saying how
 *  many rows are in it is how ten evictions look like one write. */
export function entriesOf(content) {
  let j;
  try { j = JSON.parse(content); } catch { return '[unparseable — no entries to count]'; }
  if (!Array.isArray(j)) return `[not an array (${typeof j}) — COUNT UNKNOWABLE]`;
  return `[${j.length} recent ${j.length === 1 ? 'entry' : 'entries'}]`;
}

/** `pid N ALIVE|DEAD`, or why the question could not be asked. Never blank —
 *  an unannotated line is one a reader takes for a live app. */
export function livenessOf(content) {
  let j;
  try { j = JSON.parse(content); } catch { return '[unparseable — no pid to check]'; }
  if (!Number.isInteger(j.pid)) return `[no pid field (${JSON.stringify(j.pid)}) — LIVENESS UNKNOWABLE]`;
  return alive(j.pid) ? `[pid ${j.pid} ALIVE]` : `[pid ${j.pid} DEAD — STALE FILE]`;
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
export const NEVER_REAP_DISPLAYS = new Set([0]);

/**
 * O78. The xvfb-run tempdirs this process INHERITED — a wrapper we are running
 * UNDER, never one we started.
 *
 * ⚠ THIS IS THE `DISPLAY` TRAP ONE FIELD OVER, AND IT COST A GREEN HARNESS ITS
 * EXIT CODE. `displayArtifacts` is careful never to take a display number from
 * an environment variable, because our own process may have inherited `:0` from
 * the desktop — and then it read `XAUTHORITY` out of a descendant's environ and
 * called the directory ours. Under an OUTER `xvfb-run` (`xvfb-run -a npm run
 * harness:…`, the shape a sweep uses), that variable names the OUTER wrapper's
 * `/tmp/xvfb-run.XXXXXX/`. Every child we spawn inherits it — harnesses delete
 * `DISPLAY` from the child env, not `XAUTHORITY` — so it appears in our own
 * tree's environs and matches XVFB_TMPDIR_RE exactly. The reap then deleted the
 * outer wrapper's Xauthority file while its Xvfb was still up. Measured
 * 2026-09-03: the harness exited 0 with 44 rows and 0 failed, and the outer
 * `xvfb-run` then ran `xauth remove ":287"` at :188 against a file that was no
 * longer there, got `xauth: error in locking authority file`, and `set -e`
 * (armed at :26, re-armed at :182) aborted it BEFORE `exit $RETVAL` at :197.
 * Exit 1. Nothing signalled the harness; its own exit code was never wrong.
 *
 * Both our own env and every ancestor's are read: our children get ours, and
 * ours came from an ancestor, so one hop is enough in practice — the walk is a
 * few file reads and costs nothing.
 */
export function inheritedXauthDirs() {
  const dirs = new Set();
  const add = (v) => {
    if (!v) return;
    const dir = v.replace(/\/[^/]*$/, '');
    if (XVFB_TMPDIR_RE.test(dir)) dirs.add(dir);
  };
  add(process.env.XAUTHORITY);
  let pid = process.pid;
  for (let hop = 0; hop < 32 && pid > 1; hop++) {
    let ppid = 0;
    try {
      const st = readFileSync(`/proc/${pid}/status`, 'utf8');
      ppid = Number(/^PPid:\s*(\d+)$/m.exec(st)?.[1] ?? 0);
    } catch { break; }
    if (!ppid) break;
    try { add(/(?:^|\0)XAUTHORITY=([^\0]*)/.exec(readFileSync(`/proc/${ppid}/environ`, 'utf8'))?.[1]); }
    catch { /* not readable — one fewer exclusion, never a licence to delete */ }
    pid = ppid;
  }
  return dirs;
}

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

/**
 * Unix-socket paths currently BOUND by a live process, from /proc/net/unix.
 * Returns `null` — NOT an empty Set — when the table cannot be read.
 *
 * This is the strong instrument, and it exists because the weak one has
 * already misled a session here: a *lock file* names a pid, and a pid can be
 * RECYCLED onto an unrelated process, so "that pid is in use" is not "that X
 * server runs" (2026-08-29, display :151 held back by a Vivaldi renderer
 * thread that had inherited the recorded pid). A path in /proc/net/unix is a
 * live binding by construction: no binding, no row.
 *
 * ⚠ THIS FUNCTION FAILED OPEN, AGAINST ITS OWN DOCSTRING, AND THAT IS THE
 * SHARPEST LESSON IN THIS FILE — SHARPER THAN THE `xvfb-run` ONE IT WAS
 * WRITTEN TO FIX. The catch returned an empty `Set` while the comment said
 * *"caller treats 'unknown' as 'do not touch'"*. The caller did no such thing:
 * `bound.has(sock)` over an empty set is `false`, and `false` is the value that
 * means **not bound, proceed to delete**. So an unreadable /proc/net/unix
 * silently INVERTED gate 3 from a refusal into a permission.
 *
 * The general form, and it is the whole point: **the failure state and the
 * success state emitted the same artifact.** "I could not look" and "I looked
 * and found nothing bound" were the same empty Set, so no caller could
 * possibly distinguish them — and an instrument that cannot report its own
 * blindness is exactly the vacuous shape this file's header is about, firing
 * inside the guard written to close a vacuous-guard incident.
 *
 * Latent, never live: /proc/net/unix is readable in practice, and
 * `displayArtifacts` only lists displays from an Xvfb inside our own tree, so
 * `:0` does not realistically reach the gate at all. That is precisely why
 * NEVER_REAP_DISPLAYS is defence-in-depth for the case where attribution goes
 * wrong — and why leaving it resting on a neighbour was the wrong call.
 *
 * Found by the coordinator, by planting the poison this file's own proof did
 * not: emptying NEVER_REAP_DISPLAYS left `[o1]` GREEN, because gate 3 refused
 * `:0` anyway. Bar 2d cause (ii) — two code paths, one observable.
 */
export function boundSocketPaths(path = '/proc/net/unix') {
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch { return null; }                    // UNKNOWN. Never an empty Set.
  const out = new Set();
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/)[7];
    if (p) out.add(p.replace(/^@/, ''));
  }
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
 *     and only if it matches XVFB_TMPDIR_RE **and we did not inherit it
 *     ourselves** (O78 — see `inheritedXauthDirs`; a variable a child got from
 *     us is evidence about our ancestors, not about what we started).
 */
export function displayArtifacts(rootPid) {
  const displays = [];
  const tmpdirs = new Set();
  const unknown = [];
  const inherited = new Set();
  const ours = inheritedXauthDirs();
  if (!Number.isInteger(rootPid)) return { displays, tmpdirs: [], unknown: ['no root pid'], inherited: [] };
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
        if (XVFB_TMPDIR_RE.test(dir)) { if (ours.has(dir)) inherited.add(dir); else tmpdirs.add(dir); }
      }
    } catch { /* raced with exit, or not readable — not fatal, just less to reap */ }
  }
  return { displays, tmpdirs: [...tmpdirs], unknown, inherited: [...inherited] };
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
 *   4. never a tempdir outside XVFB_TMPDIR_RE;
 *   5. never a tempdir this process INHERITED (O78) — a wrapper we run under,
 *      whose Xauthority we would be deleting out from under a live Xvfb. The
 *      gate is here as well as in `displayArtifacts` because a caller may hand
 *      this function a set it built by hand, and "somebody else assembled the
 *      list" has never been a licence to delete in this file.
 */
export function reapDisplays(art, { quiet = false, bound = boundSocketPaths() } = {}) {
  const removed = [];
  const refused = [];
  const inheritedDirs = inheritedXauthDirs();
  // GATE 0 — BLIND. `bound === null` means the socket table could not be read,
  // and this function's whole licence to delete rests on being able to tell a
  // live server from a corpse. Refuse EVERYTHING and say why: the cost of
  // refusing is a leaked file, visible and recoverable; the cost of acting
  // blind is somebody's desktop. An unanswerable question does not become a
  // pass, here as everywhere else in this repo.
  if (bound === null) {
    for (const d of art?.displays ?? []) {
      refused.push(`:${d.n} — BLIND: /proc/net/unix unreadable, so "is a live server bound to `
        + 'this display?" has no answer and nothing is removed');
    }
    for (const dir of art?.tmpdirs ?? []) refused.push(`${dir} — BLIND: see above; the whole reap is refused, not half of it`);
    for (const d of art?.inherited ?? []) refused.push(`${d} — INHERITED (not claimed): an outer xvfb-run's tempdir`);
    for (const u of art?.unknown ?? []) refused.push(`UNMEASURABLE: ${u}`);
    if (!quiet) {
      console.log('cleanup: X reap REFUSED ENTIRELY — /proc/net/unix unreadable, so liveness is unknown');
      for (const r of refused) console.log(`cleanup: X artifact REFUSED — ${r}`);
    }
    return { removed, refused, blind: true };
  }
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
    if (inheritedDirs.has(dir)) {
      refused.push(`${dir} — INHERITED: it is named by our own XAUTHORITY, so it belongs to an `
        + 'xvfb-run we are running UNDER, not to anything we started');
      continue;
    }
    if (!existsSync(dir)) continue;
    try { rmSync(dir, { recursive: true, force: true }); removed.push(`${dir}/`); }
    catch (e) { refused.push(`${dir} — ${e.message}`); }
  }
  // LOUD ON UNMEASURABLE: an Xvfb we could not attribute a display to is said
  // out loud rather than folded into a clean count.
  for (const u of art?.unknown ?? []) refused.push(`UNMEASURABLE: ${u}`);
  // ...and loud on what GATE 5 removed from the claim set upstream, so a run
  // under an outer wrapper says so instead of silently reaping one fewer dir.
  for (const d of art?.inherited ?? []) {
    refused.push(`${d} — INHERITED (not claimed): our own XAUTHORITY names it, so it is an outer `
      + "xvfb-run's tempdir and its Xvfb is still up");
  }
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
/**
 * O65. What `killTree`/`killTreeSync` were HANDED, resolved to something with a
 * `.pid` — or null, LOUDLY.
 *
 * ⚠ THIS EXISTS BECAUSE THE SILENT VERSION HUNG THREE HARNESSES. The helpers
 * took the ChildProcess and read `child.pid` off it; three launchers wrote
 * `killTree(child.pid)` instead — a bare number, whose `.pid` is undefined —
 * and the old first line returned `{ note: 'no child to kill' }` without
 * printing a word. Every process in the tree survived the harness's own
 * teardown; the harness's stdout/stderr pipes to that tree stayed open, so its
 * event loop never drained and the summary line was followed by a process that
 * would not exit until a `timeout` wrapper SIGTERMed it. Measured 2026-08-30:
 * 12 processes alive at the summary line, the same 12 alive 30 s later,
 * `cleanup:` never printed. A guard that asserts nothing, in the guard module.
 *
 * So: a bare pid is now an ACCEPTED spelling (resolved to the registered child
 * when one has that pid, so `registered` bookkeeping still works), and anything
 * else is refused ON STDERR rather than as a note nobody reads. The return
 * stays a no-op — a `finally` must not throw over the error it is cleaning up
 * after — but the no-op is no longer silent.
 */
function asChild(arg, fn) {
  if (Number.isInteger(arg)) {
    for (const c of registered) if (c.pid === arg) return c;
    return { pid: arg, kill(sig = 'SIGTERM') { try { process.kill(arg, sig); } catch { /* gone */ } } };
  }
  if (arg && Number.isInteger(arg.pid)) return arg;
  const got = arg === undefined ? 'undefined' : arg === null ? 'null'
    : typeof arg === 'object' ? `object with pid=${String(arg.pid)}` : `${typeof arg} ${String(arg)}`;
  console.error(`${fn}: NOTHING KILLED — expected the ChildProcess from spawnGuarded (or its pid), got ${got}. `
    + 'The tree this harness launched is still running.');
  return null;
}

export async function killTree(arg, { graceMs = 4000, quiet = false, reap = true } = {}) {
  const child = asChild(arg, 'killTree');
  if (!child) {
    return { tree: [], killed: 0, note: 'no child to kill' };
  }
  const tree = [...descendants(child.pid)];
  const seen = tree.map((p) => `${p} ${cmdlineOf(p).slice(0, 90)}`);
  // BEFORE the first signal, for the same reason the tree is: an orphaned Xvfb
  // cannot be attributed to us afterwards, and unattributable is not reapable.
  const art = reap ? displayArtifacts(child.pid) : null;
  // O65: the capture goes on record BEFORE the signal, for the exit net. See
  // `inFlight` — an un-awaited killTree followed by process.exit leaves the
  // net walking from a dead wrapper pid, and this is the only copy of what
  // was under it.
  inFlight.set(child, { tree, art });
  // O65 RULING: ORDERED. The app first, the X server last. A single SIGTERM to
  // the wrapper's group reached Xvfb and the Electron at the same instant;
  // when Xvfb won that race the Electron's X11 connection broke mid-shutdown
  // and Chromium fataled — `Signal: 5 (TRAP) si_code: SI_KERNEL` in the
  // BROWSER process, core Timestamp equal to the SIGTERM instant, one core in
  // every run whose log said `SIGKILLed 5` and none in any that said
  // `SIGKILLed 0` (6 of 17 band-preset runs on 2026-08-30). So: SIGTERM the
  // app pids from the captured descent, wait a bounded grace for them to
  // actually be gone (not zombies), and only THEN signal the wrapper's group
  // so the X server goes down under nothing. Scope is unchanged — every pid
  // here came out of `tree`, the /proc walk from the pid this process spawned.
  const roles = classifyTree(child.pid, tree);
  const t0 = Date.now();
  for (const p of roles.app) { try { process.kill(p, 'SIGTERM'); } catch { /* gone */ } }
  if (graceMs > 0 && roles.app.length) {
    while (Date.now() - t0 < graceMs && roles.app.some(running)) await sleep(50);
  }
  const appMs = Date.now() - t0;
  const appLeft = roles.app.filter(running);
  const xvfbUpAtGroupSignal = roles.xvfb.filter(running);
  // When the app exited on its own, xvfb-run's own `kill $XVFBPID` / `rm -r`
  // (the cleanup a SIGTERMed wrapper never reaches) has usually run by now and
  // the wrapper itself is gone: the display is RELEASED, not lost. An X server
  // down while the wrapper is still up is the other thing — the race this
  // order exists to prevent — and is said out loud.
  const wrapperUpAtGroupSignal = running(child.pid);
  const t1 = Date.now();
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* not a group leader */ }
  try { child.kill('SIGTERM'); } catch { /* gone */ }
  if (graceMs > 0) {
    const xGrace = Math.min(graceMs, X_GRACE_MS);
    while (Date.now() - t1 < xGrace && tree.some(running)) await sleep(50);
  }
  const xMs = Date.now() - t1;
  const killed = killPids(tree);
  await sleep(300);
  const survivors = tree.filter(alive);
  registered.delete(child);
  inFlight.delete(child);
  const order = { app: roles.app, xvfb: roles.xvfb, appMs, appLeft, xvfbUpAtGroupSignal, wrapperUpAtGroupSignal, xMs, graceMs };
  if (!quiet) {
    console.log(`cleanup: tree under pid ${child.pid} (${tree.length} process(es)):`);
    for (const s of seen) console.log(`           ${s}`);
    console.log(`cleanup: ORDERED — app ${roles.app.length} pid(s) SIGTERMed first, `
      + (appLeft.length ? `${appLeft.length} STILL RUNNING at the ${graceMs} ms grace` : `gone in ${appMs} ms`)
      + `; then the wrapper group with the X server ${roles.xvfb.length
        ? (xvfbUpAtGroupSignal.length ? 'still up'
          : wrapperUpAtGroupSignal ? 'DOWN WHILE THE WRAPPER STILL RAN — the race this order exists to prevent'
            : 'already released by xvfb-run\'s own cleanup')
        : 'absent'}`
      + `, tree gone in ${xMs} ms; teardown ${appMs + xMs + 300} ms of a ${graceMs} ms grace`);
    console.log(`cleanup: SIGKILLed ${killed}; survivors after kill: ${survivors.length ? survivors.join(',') : 'none'}`);
  }
  const reaped = art ? reapDisplays(art, { quiet }) : null;
  return { tree, seen, killed, survivors, artifacts: art, reaped, order };
}

/** How long the X server's group gets after the app is gone before SIGKILL.
 *  Bounded by `graceMs` as well; Xvfb exits within ms of SIGTERM. */
const X_GRACE_MS = 1500;

/** Alive AND not a zombie. `alive()` says yes to a zombie (signal 0 succeeds
 *  on one), and the ordered teardown must not wait a whole grace on a corpse
 *  its parent has not collected yet. */
export function running(pid) {
  if (!alive(pid)) return false;
  try { return !/^State:\s*Z/m.test(readFileSync(`/proc/${pid}/status`, 'utf8')); } catch { return false; }
}

/**
 * Who is who in a captured tree, by argv. The root (the xvfb-run shell, or
 * whatever was spawned) is nobody's — it is signalled as the group. Chromium
 * children (`--type=`) follow their browser and are not signalled separately.
 */
export function classifyTree(rootPid, tree) {
  const app = [], xvfb = [], followers = [];
  for (const pid of tree) {
    if (pid === rootPid || pid === process.pid) continue;
    const argv = cmdlineOf(pid);
    if (/(^|\/)Xvfb( |$)/.test(argv)) xvfb.push(pid);
    else if (/(^|\/)xvfb-run( |$)/.test(argv) || /\s--type=/.test(argv)) followers.push(pid);
    else app.push(pid);
  }
  return { app, xvfb, followers };
}

/** Synchronous last-resort variant for process-exit handlers, which cannot
 *  await. Blunt on purpose: at exit there is nothing left to flush for. */
export function killTreeSync(arg, { reap = true } = {}) {
  const child = asChild(arg, 'killTreeSync');
  if (!child) return { tree: [], killed: 0, note: 'no child to kill' };
  // O65: if an async killTree already SIGTERMed this tree and never got to
  // finish (the harness exited inside the grace period), the wrapper is dead
  // and a fresh /proc walk from its pid sees NOTHING — the Electron has been
  // reparented away and the Xvfb's tempdir is unattributable. The capture
  // killTree made before its first signal is the only record; merge it in.
  const prior = inFlight.get(child);
  const tree = [...new Set([...(prior?.tree ?? []), ...descendants(child.pid)])];
  // Read the artifacts before signalling — this is the Ctrl-C path, and it is
  // the ONE path where the X leftovers used to be guaranteed: an interrupted
  // harness never reaches its `finally`, so nothing else was ever going to
  // remove them. SIGKILL is immediate, so no grace loop is needed before the
  // reap; `reapDisplays` re-checks liveness per display anyway.
  const art = reap ? mergeArtifacts(prior?.art, displayArtifacts(child.pid)) : null;
  inFlight.delete(child);
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

/**
 * O65. Teardowns `killTree` has STARTED but not finished: child -> what it
 * captured before its first signal. Measured 2026-08-30 on
 * section-raster-select-harness.mjs, which calls `killTree(child)` without
 * `await` and then `process.exit()`s: killTree SIGTERMs synchronously (before
 * its first `await`), the xvfb-run wrapper dies at once, the Electron under it
 * is reparented out of the tree, and 13 ms later the exit net's `killTreeSync`
 * walks /proc from the dead wrapper pid and finds only the corpse — no
 * Electron to SIGKILL, no XAUTHORITY to derive the tempdir from. One
 * `/tmp/xvfb-run.*` leaked per run (23 -> 24), with the OLD helper reaping it
 * (23 -> 23) only because its silent no-op had left the tree fully alive for
 * the net to see. The doctrine is "capture before the first signal"; this is
 * that capture, kept where the abort path can reach it. (O66: the three
 * harnesses with that shape now `await killTree(child)`, and rule G5 in
 * check-harness-guards.mjs refuses a dropped killTree promise in any file that
 * can process.exit — this record stays because the net is still the only
 * thing that reaps a run interrupted inside the grace.)
 */
const inFlight = new Map();

/** Union of two `displayArtifacts` results; entries from `a` win on a display
 *  number because they were read while the Xvfb was alive. */
function mergeArtifacts(a, b) {
  if (!a) return b;
  if (!b) return a;
  const displays = [...a.displays];
  for (const d of b.displays) if (!displays.some((x) => x.n === d.n)) displays.push(d);
  return {
    displays,
    tmpdirs: [...new Set([...a.tmpdirs, ...b.tmpdirs])],
    unknown: [...a.unknown, ...b.unknown],
    inherited: [...new Set([...(a.inherited ?? []), ...(b.inherited ?? [])])],
  };
}

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
      // LIVENESS FIRST, THEN OWNERSHIP — two different refusals, and saying
      // which one fired is the difference between "clean up your stale file"
      // and "you are looking at somebody else's editor". Descent is the
      // stronger test and would have refused a dead pid anyway (a corpse is in
      // nobody's /proc tree), but it would have refused it in the WRONG WORDS,
      // and a refusal that misnames its reason sends the reader somewhere else.
      if (!alive(j.pid)) {
        rejected.push(`${f}: port ${j.port} names pid ${j.pid}, which is DEAD — a STALE discovery `
          + 'file, not a running app. Presence of this file has never meant an app is up.');
        continue;
      }
      if (!ours.has(j.pid)) {
        rejected.push(`${f}: port ${j.port} pid ${j.pid} is ALIVE but is NOT a descendant of `
          + `${rootPids.join(',')} — somebody else's app (very likely the owner's) — refused`);
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
    // HAZARD 6: the private profile is a temp directory this run created. It is
    // removed AFTER the trees are killed — a Chromium still holding its leveldb
    // open would otherwise rewrite files under a directory being deleted.
    try { cleanupProfile(); } catch { /* */ }
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
  let pinned = pinOzoneToX11(cmd, args);
  if (pinned !== args) console.log(`guard: pinned Ozone to x11 (${OZONE_X11_FLAG}) — see HAZARD 5`);
  const withProfile = pinUserDataDir(cmd, pinned);
  if (withProfile !== pinned) {
    if (!profileUsed) {
      profileUsed = true;
      try { mkdirSync(RUN_PROFILE_DIR, { recursive: true }); } catch { /* Chromium creates it too */ }
      console.log(`guard: private profile for this RUN: ${RUN_PROFILE_DIR}`
        + `${RUN_PROFILE_DERIVED ? '' : ` (from ${PROFILE_DIR_ENV})`} — see HAZARD 6`);
    }
    pinned = withProfile;
  } else if (pinned !== args || isElectronBin(cmd) || args.some(isElectronBin)) {
    // An Electron launch that was NOT pinned: the caller named its own profile.
    // Say so — a run on the shared profile must never be silent about it.
    console.log(`guard: NOT pinning a profile — the caller passed its own ${USER_DATA_DIR_SWITCH}`);
  }
  const child = spawn(cmd, pinned, { detached: true, ...opts });
  registered.add(child);
  child.on('exit', () => { /* keep it registered: the tree may outlive the wrapper */ });
  return child;
}

// ── HAZARD 5: pin the Ozone platform ───────────────────────────────────────

/** The ONE thing measured to work. `--ozone-platform-hint=x11` and
 *  `ELECTRON_OZONE_PLATFORM_HINT=x11` were both measured NOT to. */
export const OZONE_X11_FLAG = '--ozone-platform=x11';

/** Is this argument the Electron binary itself? */
const isElectronBin = (a) =>
  typeof a === 'string' && /(^|\/)electron$/.test(a.split('?')[0]);

/**
 * Insert `--ozone-platform=x11` immediately after the Electron binary.
 *
 * POSITION MATTERS AND IS THE WHOLE REASON THIS IS A FUNCTION. The command is
 * usually `xvfb-run -a -s '-screen 0 WxH' <electron> <app.mjs> …`, so the flag
 * cannot go at the front (xvfb-run would eat it) or at the back (it would be
 * an argument to the app, not to Chromium). It goes directly after the binary,
 * which is where Chromium parses its own switches.
 *
 * Returns `args` UNCHANGED — by identity, so the caller can tell — when no
 * Electron binary can be found in the command. A harness spawning something
 * else (the oracle emulator, a build tool) is not our business, and guessing
 * at it would be worse than leaving it alone.
 */
export function pinOzoneToX11(cmd, args) {
  const a = [...args];
  if (a.includes(OZONE_X11_FLAG)) return args;      // already pinned; do not double it
  if (isElectronBin(cmd)) return [OZONE_X11_FLAG, ...a];
  const i = a.findIndex(isElectronBin);
  if (i === -1) return args;                        // not an Electron launch
  a.splice(i + 1, 0, OZONE_X11_FLAG);
  return a;
}

// ── HAZARD 6: THE CHROMIUM PROFILE IS ONE DIRECTORY FOR THE WHOLE POPULATION
//
// O80, 2026-09-04. Hazard 1 and 1c are about two *files* every run shares.
// This is about the *profile* they all share, and it is the same shape one
// level up: an Electron launched as `electron <root>/dist/main/index.mjs` gets
// Electron's own default app name, so EVERY harness in this population writes
// its `localStorage` into the single directory
//
//     $XDG_CONFIG_HOME/Electron/Local Storage/leveldb
//
// ⚠ AND A HARNESS'S FIRST GESTURE IS USUALLY TO ERASE IT. The count is NOT
// written here — see the note below — but `localStorage.clear()` is the
// standard opening line of a CDP harness in scratchpad/, and it is not scoped
// to that harness: it wipes the area for every instrument sharing the profile,
// including one that is mid-run and depends on what it wrote a session ago.
//
// WHAT THAT COST. `canvas-cdp-harness` relaunches the app four times in one run
// and each restart row reads what the PREVIOUS launch left under
// `aurora.session.v1:<project>`. O50 measured that precondition failing in ~44%
// of runs; O79 proved half of it was a flush that never reached disk and fixed
// that half; `docs/reviews/2026-09-04-canvas-flake-explained.md` closed the row
// with the other half explicitly UNFIXED and named it "environmental" — a rate
// that is a function of what else happened to be running on the box. An
// instrument whose verdict depends on its neighbours is not an instrument, and
// the victim reported the interference as a possible product defect.
//
// ── THE TREATMENT: ONE PRIVATE PROFILE PER INSTRUMENT RUN ─────────────────
//
// Electron takes Chromium's `--user-data-dir=<path>` natively. VERIFIED here
// rather than assumed (2026-09-04, Electron in this repo's node_modules, a
// window-less probe): with the switch, `app.getPath('userData')` AND
// `app.getPath('sessionData')` BOTH become the given directory, so the switch
// moves the `localStorage` profile and `recent-projects.json` together. Without
// it both read `/home/<user>/.config/Electron`.
//
// ⚠ PER INSTRUMENT *RUN*, NOT PER LAUNCH, AND THE DIFFERENCE IS THE WHOLE
// DESIGN. `canvas-cdp-harness` DEPENDS on `localStorage` surviving from one of
// its launches to the next — that persistence is the property its restart suite
// exists to measure. A fresh profile per launch would break it in a way that
// looks EXACTLY like the flake this exists to remove. So the directory is
// derived ONCE per node process (`RUN_PROFILE_DIR`, below): stable across every
// launch a single instrument makes, unique across concurrently running ones.
//
// ⚠ NO LIVE CENSUS IS WRITTEN INTO THIS COMMENT, ON PURPOSE. The refusal in
// `canvas-cdp-harness` said "114 call sites"; that was right on the day it was
// typed, and by 2026-09-04 a grep answered 133 across 120 files on this branch
// while the packet that found the drift measured 136/123 on a different tree
// the same day. Those three figures are quoted HERE only as the evidence that
// the number drifts — none of them is a claim about now. `clearCallSiteCensus()`
// below derives it at run time and the refusal renders that; no comment, this
// one included, may state the current count.
//
// ── WHAT THIS DOES *NOT* REPLACE ──────────────────────────────────────────
//
// The snapshot/restore above stays, entire, and is not made redundant by this:
//
//   · the two `mcp.json` DISCOVERY FILES live under `$HOME`, not under
//     `userData` (`src/main/discovery-file.ts` joins `homedir()`), so a private
//     profile does not move them by so much as a byte. Hazard 1 is untouched.
//   · `recent-projects.json` DOES move into the private profile — but only for
//     a launch this module actually pinned. `pinUserDataDir` returns its
//     argument unchanged when it cannot find an Electron binary in the command,
//     and it defers to a `--user-data-dir` a caller passed itself. Those
//     launches still write the shared file, and the restore is what covers them.
//
// A guard removed because "the new thing makes it unnecessary" is how the first
// pass of hazard 1 came to cover only half of its own surface.

/** The instruments this population is made of. `clearCallSiteCensus` walks
 *  this directory; a caller may point it somewhere else (a test does). */
export const INSTRUMENT_DIR = fileURLToPath(new URL('..', import.meta.url));

/** What a call site looks like, tolerating the spacings a formatter can produce.
 *  Exported so a test drives the SAME regex the census uses. */
export const CLEAR_CALL_RE = /localStorage\s*\.\s*clear\s*\(/g;

/**
 * ⚠ COMMENTS ARE STRIPPED BEFORE COUNTING, and this is not tidiness.
 *
 * A raw grep of this repo answers a number that INCLUDES every block comment
 * describing the hazard — this file's own HAZARD 6 note names the call twice,
 * the packet-writing that goes with a parcel like this adds more, and the
 * census therefore GROWS every time somebody documents it. A count that rises
 * when the problem is being explained is a broken instrument. Measured
 * 2026-09-04 on this branch, one tree, one regex, one instant: 138 with
 * comments and 130 without. Those two are quoted as the SIZE OF THE ARTEFACT
 * and are not a claim about the population now — the function below is.
 *
 * The stripper is crude on purpose (line comments and block comments, no
 * tokeniser). Its one known blind spot is a `localStorage.clear()` written
 * inside a STRING literal, which still counts; that errs toward over-reporting
 * the hazard, which is the safe direction for this number.
 */
export function stripCommentsForCensus(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * HOW BIG IS THE HAZARD, RIGHT NOW — derived, never typed.
 *
 * `{ sites, files, dir }`: `sites` counts occurrences, `files` counts the files
 * holding at least one. **They are different units and the drift that started
 * this parcel was partly a unit confusion**, so both are returned and any
 * caller printing one must say which.
 *
 * This exists because a count in a comment is right on the day it is written
 * and nothing re-derives it: the refusal in `canvas-cdp-harness` told operators
 * "114 call sites" for as long as it took the population to reach a third more
 * than that. Reading the directory costs a few milliseconds and is only paid on
 * the path that renders a refusal.
 */
export function clearCallSiteCensus(dir = INSTRUMENT_DIR) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true, recursive: true }); }
  catch (e) { return { sites: null, files: null, dir, why: `${dir} could not be read (${e.code ?? e.message})` }; }
  let sites = 0, files = 0;
  for (const e of entries) {
    if (!e.isFile() || !/\.(mjs|cjs|js|ts|tsx)$/.test(e.name)) continue;
    let src;
    try { src = readFileSync(join(e.parentPath ?? e.path ?? dir, e.name), 'utf8'); } catch { continue; }
    const n = (stripCommentsForCensus(src).match(CLEAR_CALL_RE) ?? []).length;
    if (n > 0) { sites += n; files++; }
  }
  return { sites, files, dir };
}

/** One sentence a refusal can paste in, with the units named. */
export function describeClearCensus(c = clearCallSiteCensus()) {
  return c.sites === null
    ? `the call-site census could not be taken: ${c.why}`
    : `${c.sites} call site(s) across ${c.files} source file(s) (.mjs/.cjs/.js/.ts/.tsx, comments `
      + `stripped) under ${c.dir} call localStorage.clear() — derived at the moment this message `
      + 'was rendered, never typed';
}

/** Where every private harness profile is rooted. One directory so a sweep of
 *  leftovers from killed runs is one `rm -rf`, not a search. */
export const PROFILE_ROOT = join(tmpdir(), 'aurora-harness-profiles');

/** Set this to make several cooperating processes share ONE profile. It exists
 *  for the negative control in `profile-isolation-proof.mjs` — the arm that
 *  reconstructs the hazard — and for an operator debugging a run's profile.
 *  A directory named here is NOT deleted at exit: this process did not create
 *  it and does not know who else is using it. */
export const PROFILE_DIR_ENV = 'AURORA_HARNESS_PROFILE_DIR';

/** Keep the derived profile after the run instead of deleting it. */
export const KEEP_PROFILE_ENV = 'AURORA_HARNESS_KEEP_PROFILE';

/** Chromium's switch. Spelled once so the pin and the "did the caller already
 *  pass one" test cannot drift apart. */
export const USER_DATA_DIR_SWITCH = '--user-data-dir';

/**
 * THE PROFILE THIS RUN OWNS — one derivation, at module load, so every launch
 * in this process gets the same directory and no two processes get the same one.
 *
 * `pid` is the uniqueness that matters: two concurrent runs are two live
 * processes and cannot share a pid. The random suffix is not for them — it is
 * for a pid REUSED after a run died without cleaning up, which would otherwise
 * hand a fresh instrument a dead one's `localStorage`. The instrument name is
 * for the human reading `/tmp`.
 */
export const RUN_PROFILE_DIR = (() => {
  const fromEnv = process.env[PROFILE_DIR_ENV];
  if (fromEnv) return fromEnv;
  const who = basename(process.argv[1] ?? 'node').replace(/\.[cm]?js$/, '').replace(/[^A-Za-z0-9._-]/g, '_')
    || 'node';
  return join(PROFILE_ROOT, `${who}-${process.pid}-${randomBytes(4).toString('hex')}`);
})();

/** True when this process DERIVED its profile, so it owns the cleanup. False
 *  when an operator named one via the environment. */
export const RUN_PROFILE_DERIVED = !process.env[PROFILE_DIR_ENV];

/** Set once a launch has actually been pinned, so a process that never spawned
 *  an Electron does not create or delete a directory it never used. */
let profileUsed = false;

/** Has any launch in this process been pinned to `RUN_PROFILE_DIR`? */
export function profileInUse() { return profileUsed; }

/**
 * Insert `--user-data-dir=<dir>` immediately after the Electron binary.
 *
 * POSITION MATTERS for exactly the reason `pinOzoneToX11` documents: the
 * command is usually `xvfb-run -a -s '…' <electron> <app.mjs> …`, so the switch
 * cannot go at the front (xvfb-run eats it) or at the back (it becomes an
 * argument to the app instead of a Chromium switch).
 *
 * Returns `args` UNCHANGED — by identity, so the caller can tell — when there
 * is no Electron binary in the command, or when the caller already passed a
 * `--user-data-dir` of its own. Deferring to the caller is deliberate: a
 * harness that has a reason to name a profile is stating a requirement, and
 * silently overriding it would be this module guessing.
 */
export function pinUserDataDir(cmd, args, dir = RUN_PROFILE_DIR) {
  const a = [...args];
  if (a.some((x) => typeof x === 'string' && x.startsWith(`${USER_DATA_DIR_SWITCH}=`))) return args;
  const flag = `${USER_DATA_DIR_SWITCH}=${dir}`;
  if (isElectronBin(cmd)) return [flag, ...a];
  const i = a.findIndex(isElectronBin);
  if (i === -1) return args;                        // not an Electron launch
  a.splice(i + 1, 0, flag);
  return a;
}

/** Delete this run's profile, unless it was named by the environment (someone
 *  else may still be using it) or the operator asked to keep it. Returns what
 *  it did, as a string, so the caller can print an artifact rather than a
 *  claim. Safe to call twice. */
export function cleanupProfile() {
  if (!profileUsed) return `profile: none used (no Electron launch in this process)`;
  if (!RUN_PROFILE_DERIVED) return `profile: ${RUN_PROFILE_DIR} KEPT — named by ${PROFILE_DIR_ENV}, so this process does not own it`;
  if (process.env[KEEP_PROFILE_ENV]) return `profile: ${RUN_PROFILE_DIR} KEPT — ${KEEP_PROFILE_ENV} is set`;
  try { rmSync(RUN_PROFILE_DIR, { recursive: true, force: true }); } catch { /* a locked file is not worth failing a run over */ }
  return `profile: ${RUN_PROFILE_DIR} removed (existsSync now ${existsSync(RUN_PROFILE_DIR)})`;
}

/** Restore the files now and report what was put back. Safe to call twice;
 *  the exit-handler net will call it again and that is idempotent. */
export function restoreDiscoveryNow() {
  if (!snapshot) return [];
  const done = restoreDiscovery(snapshot);
  for (const d of done) console.log(`cleanup: restored ${d}`);
  return done;
}
