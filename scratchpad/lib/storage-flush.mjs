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
 * ── THE MECHANISM, AND WHY NEITHER ATTEMPTED FIX COULD WORK ────────────────
 *
 * Chromium does not write `localStorage` through to disk. A renderer's
 * `setItem` mutates an in-memory area in the storage service and schedules a
 * leveldb commit on a **throttled timer** — 5 s at rest, and the rate limiter
 * pushes it further out the more the page has been writing. Aurora's session
 * persist subscription (`src/renderer/shell/session-lifecycle.ts`) fires on
 * EVERY session- or workspace-store change, so a busy harness session is
 * exactly the workload that stretches that delay.
 *
 * The teardown then gives the area no time at all. Measured on this machine
 * 2026-09-03: **the app is fully gone ~50 ms after `window.close()`** (12
 * launches, exit 49–51 ms). So:
 *
 *   - LENGTHENING THE SLEEP CANNOT WORK. The old fixed `sleep(4000)` was ~3.95 s
 *     spent watching a process that had already exited. Nothing writes during it.
 *   - A SETTLE *BEFORE* THE CLOSE IS A GUESS ABOUT A DELAY THAT IS NOT CONSTANT.
 *     O50 tried 6 s and measured 1 trip in 2 runs. A blind duration cannot beat
 *     an adaptive timer; it can only pick a number that is usually enough.
 *
 * ── WHAT THIS DOES INSTEAD: WAIT FOR THE ARTIFACT, NOT FOR A DURATION ──────
 *
 * The thing the next session needs is not "some seconds elapsed" and not "the
 * process exited". It is **bytes in the profile's leveldb**. So:
 *
 *   1. write a unique marker into the SAME origin's `localStorage`;
 *   2. poll the profile's `Local Storage/leveldb/*.{log,ldb}` for those bytes;
 *   3. only when they are there, close the window and tear the tree down.
 *
 * ⚠ **WHY A MARKER PROVES THE SESSION KEY.** Chromium accumulates a storage
 * area's pending writes into ONE leveldb `WriteBatch` and commits the whole
 * batch. A write cannot be committed ahead of an earlier uncommitted write to
 * the same area. So a marker written LAST, seen on disk, means every earlier
 * write to that area — the session key included — is on disk too. The caller
 * still checks the session value did not change under it (`stableValue`), so
 * the ordering argument is asserted rather than assumed.
 *
 * ⚠ **AND WHY NOT GREP FOR THE SESSION KEY ITSELF.** The leveldb log is
 * append-only: the key's NAME survives on disk long after a `localStorage
 * .clear()`, so its presence proves nothing about the current value. A unique
 * marker has no such history.
 *
 * ── THIS IS NOT "ALWAYS PASS" ──────────────────────────────────────────────
 *
 * `awaitFlushed` RETURNS `{ flushed: false, … }` on timeout and the caller
 * refuses. A flush that genuinely does not happen still stops the run, by name,
 * with the profile it watched and how long it waited — it just stops it at the
 * teardown that lost the data instead of one session later in the wording of an
 * app defect ("the canvas TAB does not survive a restart").
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
 *  key matching /session/i, and a barrier that shows up in the evidence a row
 *  prints is a barrier that changed the measurement. */
export function flushMarker(label = '') {
  return `aurora.flushbarrier.${Date.now()}.${Math.random().toString(36).slice(2, 10)}${label ? `.${label}` : ''}`;
}

/** The key the marker is written under. */
export const FLUSH_MARKER_KEY = 'aurora.flushbarrier';

/**
 * THE BARRIER. Resolves `{ flushed, waitedMs, polls, dir, how }`.
 *
 * Everything it touches is injected, so `test/support/storage-flush.test.ts`
 * drives every branch — including the timeout — without an Electron:
 *   `write(mark)`  put the marker in the page's localStorage (async)
 *   `present()`    is it on disk yet
 *   `now()` / `sleep(ms)`
 *
 * ⚠ THE TIMEOUT IS A RESULT, NOT AN EXCEPTION, and `flushed:false` is a real
 * verdict the caller must refuse on. It is not "wait a bit longer and hope":
 * the condition polled for is the exact byte the next launch reads back, so a
 * false here means the data is genuinely not on disk.
 */
export async function awaitFlushed({ mark, write, present, maxMs = 60000, pollMs = 100, now = Date.now, sleep }) {
  const t0 = now();
  await write(mark);
  let polls = 0;
  for (;;) {
    polls++;
    if (await present()) return { flushed: true, waitedMs: now() - t0, polls };
    if (now() - t0 >= maxMs) return { flushed: false, waitedMs: now() - t0, polls };
    await sleep(pollMs);
  }
}

/** The refusal a caller prints when `awaitFlushed` comes back false. One
 *  spelling, so the harness and its proof quote the same words. */
export function flushRefusal({ waitedMs, dir, how, label }) {
  return `LOCALSTORAGE NEVER REACHED DISK — the teardown of session ${label} waited ${waitedMs} ms and the\n`
    + `  marker it wrote is still not in the profile's leveldb, so the area this session built is\n`
    + `  about to be lost when the process exits (~50 ms after window.close()).\n`
    + `      profile watched: ${dir}\n`
    + `      how resolved:    ${how}\n`
    + `  THE NEXT SESSION WOULD HAVE REPORTED THIS AS AN APP DEFECT — "the canvas TAB does not\n`
    + `  survive a restart" — because it reads the session this one was supposed to leave behind.\n`
    + `  It is not an app defect. Chromium commits a localStorage area on a throttled timer whose\n`
    + `  delay grows with write volume; this run's did not fire inside the bound. Re-run on a\n`
    + `  quieter machine, and if it repeats raise the bound rather than reading the rows below.`;
}
