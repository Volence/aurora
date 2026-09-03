/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WAIT FOR THE localStorage AREA TO REACH DISK — the barrier that replaces
 * `window.close()` + a blind sleep in a CDP harness's teardown.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── THE DEFECT THIS EXISTS FOR ─────────────────────────────────────────────
 *
 * `canvas-cdp-harness.mjs` is four sequential Electron launches, and each
 * restart row reads what the PREVIOUS launch left in `localStorage` under
 * `aurora.session.v1:<project dir>`. O50's triage (`docs/reviews/
 * 2026-09-03-o50-triage-c.md` §3.5) measured that precondition failing
 * **spontaneously in 4 of 9 runs**, at load ~3, with no poison and nothing else
 * running: the next session booted to `keys present: ["aurora.session.v1:
 * no-project"]` — its own fresh key written, the previous session's gone.
 *
 * ── THE MECHANISM, MEASURED — AND IT IS NOT THE ONE THE OPEN ITEM ASSUMED ──
 *
 * Chromium does not write `localStorage` through to disk. A renderer's
 * `setItem` mutates an in-memory area in the storage service and schedules a
 * leveldb commit on a **rate-limited timer**. Aurora's session persist
 * subscription (`src/renderer/shell/session-lifecycle.ts`) fires on EVERY
 * session- or workspace-store change, so a harness session generates a great
 * many commit batches and buys a correspondingly long delay. **Measured here
 * per session, twice, agreeing to within 25 ms: 1.7 s for this harness's light
 * first session and 43.8 s / 48.3 s / 54.0 s for its three busy ones.**
 *
 * And the app is **fully gone ~50 ms after `window.close()`** (12 launches, exit
 * 49–51 ms), so the old teardown's fixed `sleep(4000)` was ~3.95 s spent
 * watching a process that had already exited. O50 got that exactly right.
 *
 * ⚠ **BUT `window.close()` COMMITS THE AREA, so the idle timer never comes into
 * it, and that is what the open item did not know.** Measured both ways with
 * this module's own predicate:
 *
 *   - with the close: the session's last write is on disk **20 of 20 sessions**
 *     (5 runs), and the run-level guard tripped **0 times in 9 runs** on master;
 *   - with the close REMOVED and a signal alone: **sessions B, C and D lose it,
 *     3 of 4 in one run** — precisely the three whose idle commit is three
 *     quarters of a minute away, while the light session A (1.7 s) survives
 *     inside the SIGTERM grace.
 *
 * So there is nothing to WAIT for. A pre-close barrier was built, worked, and is
 * gone: it cost this harness 173 s -> 320 s a run to wait out a timer the close
 * pre-empts. What is left worth doing is CHECKING, at no cost, that the flush
 * actually happened — because a teardown that quietly loses the area is
 * indistinguishable, one session later, from the app losing a canvas tab.
 *
 * ── WHAT THIS DOES: VERIFY THE ARTIFACT, AFTER THE PROCESS IS GONE ─────────
 *
 *   1. before the close, write a unique marker into the SAME origin's
 *      `localStorage` — the app's own last write, plus one, at the same instant;
 *   2. after the window is closed, the tree reaped and the teardown settled,
 *      look for those bytes in the profile's `Local Storage/leveldb/*.{log,ldb}`;
 *   3. if they are not there, REFUSE, naming this teardown.
 *
 * ⚠ **THE CHECK IS AFTER THE EXIT AND DOES NOT WAIT, ON PURPOSE.** The process
 * is gone; nothing more will ever be written. A bounded retry here would be the
 * exact mistake the open item diagnosed — watching a dead process — with a
 * longer timeout.
 *
 * ⚠ **WHY A MARKER PROVES THE SESSION KEY.** Chromium accumulates a storage
 * area's pending writes into ONE leveldb `WriteBatch` and commits the whole
 * batch. A write cannot be committed ahead of an earlier uncommitted write to
 * the same area. So a marker written LAST, seen on disk, means every earlier
 * write to that area — the session key included — is on disk too. The caller
 * still checks the session value did not change under it, so the ordering
 * argument is asserted rather than assumed.
 *
 * ⚠ **AND WHY NOT GREP FOR THE SESSION KEY ITSELF.** The leveldb log is
 * append-only: the key's NAME survives on disk long after a `localStorage
 * .clear()`, so its presence proves nothing about the current value. A unique
 * marker has no such history. **This is also why the new check is strictly
 * stronger than the guard it backs up**: `waitRestored` asserts the key is
 * PRESENT at the next boot, and a stale-but-present value passes it. The
 * negative-control run above scored 52/52 with three sessions' last writes
 * lost, because what survived on disk happened to still match.
 *
 * ── THIS IS NOT "ALWAYS PASS" ──────────────────────────────────────────────
 *
 * The negative control is the proof: delete `window.close()` from the teardown
 * and `bytesOnDisk` answers **false** for three of the four sessions. The state
 * this check exists to catch was constructed, and the check caught it.
 *
 * ── THE PROFILE IS OBSERVED, NOT GUESSED ──────────────────────────────────-
 *
 * A harness launched as `electron dist/main/index.mjs` gets Electron's DEFAULT
 * app name, so its profile is `~/.config/Electron` — NOT `~/.config/aurora`,
 * which is where the owner's packaged Aurora keeps its own. Measured
 * 2026-09-03: 12 harness launches wrote every one of their markers into
 * `~/.config/Electron/Local Storage/leveldb` and left `~/.config/aurora`'s
 * mtimes untouched to the nanosecond. A hardcoded `~/.config/aurora` is
 * therefore a reader that watches a directory the run never writes and reports
 * "never flushed" for a flush that happened — which is how the first pass of
 * this very investigation produced a clean, confident **0 of 6**.
 *
 * So `resolveLeveldbDir` OBSERVES it: it reads `/proc/<pid>/fd` for every pid
 * descended from the launched tree and takes the `Local Storage/leveldb`
 * directory the browser process actually holds open. `candidateLeveldbDirs` is
 * the fallback for when `/proc` cannot answer, and it is a LIST — the resolver
 * refuses rather than picking one when the observation fails and more than one
 * candidate exists, because guessing between two profiles is the defect above.
 */

import { readdirSync, readFileSync, readlinkSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Chromium's on-disk home for a localStorage area, relative to a profile. */
export const LEVELDB_REL = 'Local Storage/leveldb';

/** The files a leveldb database's live data can be in. `.log` is the
 *  write-ahead log a fresh commit lands in; `.ldb` is a compacted table. */
export const LEVELDB_DATA_RE = /\.(log|ldb)$/;

/**
 * The leveldb directory implied by an open-file path, or null.
 *
 * Exported because it is the whole of the observation and a test can drive it
 * with strings: given `/home/u/.config/Electron/Local Storage/leveldb/LOCK` it
 * answers `/home/u/.config/Electron/Local Storage/leveldb`.
 */
export function leveldbDirOf(path) {
  if (typeof path !== 'string') return null;
  const i = path.indexOf(`/${LEVELDB_REL}/`);
  if (i === -1) return null;
  return path.slice(0, i + 1 + LEVELDB_REL.length);
}

/**
 * Every distinct leveldb directory held open by `pids`, newest-first is not
 * meaningful here so it is returned in discovery order.
 *
 * `readFds(pid)` yields the resolved targets of that pid's fds; it is injected
 * so a test can stand one up without a process. The default reads `/proc`.
 */
export function leveldbDirsHeldBy(pids, readFds = defaultReadFds) {
  const out = new Set();
  for (const pid of pids) {
    for (const target of readFds(pid)) {
      const d = leveldbDirOf(target);
      if (d !== null) out.add(d);
    }
  }
  return [...out];
}

function defaultReadFds(pid) {
  let names;
  try { names = readdirSync(`/proc/${pid}/fd`); } catch { return []; }
  const out = [];
  for (const n of names) {
    try { out.push(readlinkSync(`/proc/${pid}/fd/${n}`)); } catch { /* raced with close */ }
  }
  return out;
}

/**
 * The profiles an Electron launched from this repo COULD be using, as leveldb
 * directories. A list, deliberately — see the header: picking one of several is
 * the defect, refusing between them is the fix.
 *
 * `appNames` is `harness-guard.mjs`'s `APP_NAMES`, which already enumerates the
 * same set for the recent-projects guard ('Electron' first, because a harness
 * that runs `electron <file>` gets Electron's default name).
 */
export function candidateLeveldbDirs(appNames, configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config')) {
  return appNames.map((n) => join(configHome, n, LEVELDB_REL));
}

/**
 * `{ dir, how }` for the profile this run is actually writing, or
 * `{ dir: null, why }`.
 *
 * ⚠ IT NEVER GUESSES. Observation first; the candidate list only settles it
 * when exactly ONE candidate exists on disk. Two present candidates with no
 * observation is a refusal, not a coin flip.
 */
export function resolveLeveldbDir({ pids, appNames, readFds = defaultReadFds, exists = existsSync, configHome }) {
  const held = leveldbDirsHeldBy(pids, readFds);
  if (held.length === 1) return { dir: held[0], how: `observed: held open by the launched tree (${[...pids].length} pid(s))` };
  if (held.length > 1) {
    return { dir: null, why: `the launched tree holds ${held.length} different Local Storage/leveldb directories open (${held.join(', ')}) — this run writes to more than one profile and the barrier cannot say which one carries the session` };
  }
  const present = candidateLeveldbDirs(appNames, configHome).filter((d) => exists(d));
  if (present.length === 1) return { dir: present[0], how: `derived: /proc named no open leveldb, and exactly one candidate profile exists (${present[0]})` };
  if (present.length === 0) {
    return { dir: null, why: `/proc named no open leveldb for the launched tree and none of the candidate profiles exists (${candidateLeveldbDirs(appNames, configHome).join(', ')})` };
  }
  return { dir: null, why: `/proc named no open leveldb for the launched tree and ${present.length} candidate profiles exist (${present.join(', ')}) — refusing to guess which one this run writes, because watching the wrong profile reports "never flushed" for a flush that happened` };
}

/**
 * Are these bytes anywhere in the database's data files?
 *
 * latin1, because Chromium stores an all-ASCII localStorage key and value as
 * one byte per character (its Latin-1 value encoding), which is what a `strings`
 * of the log shows.
 *
 * `readDir`/`readFile` injected for the same reason as `readFds`.
 */
export function bytesOnDisk(dir, needle, readDir = readdirSync, readFile = readFileSync) {
  const b = Buffer.from(needle, 'latin1');
  let names;
  try { names = readDir(dir); } catch { return false; }
  for (const n of names) {
    if (!LEVELDB_DATA_RE.test(n)) continue;
    try { if (readFile(join(dir, n)).includes(b)) return true; } catch { /* raced with a compaction */ }
  }
  return false;
}

/** A marker no app code writes and no app code reads. Deliberately WITHOUT the
 *  substring "session": `canvas-cdp-harness`'s `storedSessions()` reports every
 *  key matching /session/i, and a check that shows up in the evidence a row
 *  prints is a check that changed the measurement. */
export function flushMarker(label = '') {
  return `aurora.flushcheck.${Date.now()}.${Math.random().toString(36).slice(2, 10)}${label ? `.${label}` : ''}`;
}

/** The key the marker is written under. */
export const FLUSH_MARKER_KEY = 'aurora.flushcheck';

/**
 * ⚠ `awaitFlushed` WAS HERE AND IS DELIBERATELY GONE — read this before adding
 * one back.
 *
 * The first version of this module POLLED the profile for the marker BEFORE the
 * window was closed, bounded at 180 s. It worked, and it printed the number that
 * broke this investigation open: a busy session's own scheduled commit is
 * 43.8-54.2 s away (four sessions, two runs, agreeing to within 25 ms). But it
 * was answering a question nobody had: `window.close()` COMMITS THE AREA, so
 * waiting for the idle timer buys nothing and cost this harness 173 s -> 320 s
 * per run. Measured, both sides, §2.3/§3 of the packet:
 *
 *   - with `window.close()`:    the session's last write is on disk 20 of 20
 *                               sessions (5 runs), and the run-level guard
 *                               tripped 0 times in 9 runs on master;
 *   - with `window.close()` REMOVED and a signal alone: sessions B, C and D lose
 *                               it, 3 of 4 in one run — the three whose idle
 *                               commit is three quarters of a minute out.
 *
 * So the close is the mechanism that carries the flush, and there is nothing to
 * wait for. What is left worth doing is CHECKING, after the process is gone,
 * that it happened — which is what this module does now, at no cost. And a wait
 * AFTER the exit would be the very mistake O50 named: the app is gone ~50 ms
 * after the close, so nothing will write during it.
 */

/** The refusal a caller prints when the marker is not on disk after the exit.
 *  One spelling, so the harness and its proof quote the same words. */
export function flushRefusal({ dir, how, label, exitNote = '' }) {
  return `LOCALSTORAGE NEVER REACHED DISK — session ${label} is gone and the marker it wrote a moment\n`
    + `  before the close is NOT in the profile's leveldb. Everything that session wrote after\n`
    + `  Chromium's last commit is lost, and a commit for a busy session here is 44-54 s out.\n`
    + `      profile watched: ${dir}\n`
    + `      how resolved:    ${how}\n`
    + (exitNote ? `      teardown:        ${exitNote}\n` : '')
    + `  THE NEXT SESSION WOULD HAVE JUDGED THE APP ON THIS — the restart rows read the session\n`
    + `  this one was supposed to leave behind, and they fail in the wording of a product defect\n`
    + `  ("the canvas TAB does not survive a restart"). IT IS NOT AN APP DEFECT.\n`
    + `  This is normally carried by \`window.close()\`, which commits the area: with the close in\n`
    + `  place the last write survived 20 of 20 sessions here, and with it removed three of four\n`
    + `  lost it. So look at the teardown, not at the rows: did the close reach the page, did the\n`
    + `  app exit on its own, and was another instrument on the same profile at the time?`;
}
