#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// profile-isolation-proof — TWO instruments, ONE box, and whether either one
// can erase the other's localStorage
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run build && npm run harness:profile-isolation
//
// ── THE DEFECT ─────────────────────────────────────────────────────────────
//
// Every Aurora an instrument launches used to write its `localStorage` into ONE
// directory, `$XDG_CONFIG_HOME/Electron/Local Storage`, because a harness
// launches `electron <root>/dist/main/index.mjs` — a FILE argument, so Electron
// falls back to its own default app name. And a CDP harness's usual opening
// gesture is `localStorage.clear()`, which is not scoped to the harness that
// calls it: it erases the area for every instrument sharing that profile.
//
// `canvas-cdp-harness` is the victim of record. It relaunches the app four
// times in one run and every restart row reads what the PREVIOUS launch left
// under `aurora.session.v1:<project>`; when a neighbour cleared the profile in
// between, it refused with "no stored session for this project at boot" and
// told the operator it could not distinguish that from the app losing the work.
// `docs/reviews/2026-09-04-canvas-flake-explained.md` closed that row with this
// half explicitly UNFIXED.
//
// ── WHY THIS FILE EXISTS AND A SINGLE-INSTRUMENT RUN WOULD NOT ────────────
//
// The bug is a RACE BETWEEN TWO RUNS. One instrument, however carefully driven,
// cannot exhibit it: it can only clear its own profile, which is not a defect.
// So this launches two independent NODE PROCESSES — the unit the fix is keyed
// to — and has one of them clear the profile while the other is mid-run.
//
// ⚠ IT IS DELIBERATELY NOT A RACE IN THE TIMING SENSE. The victim writes its
// key and closes its first session; the attacker then runs to completion; only
// then is the victim told to relaunch and read. That is the SAME exposure
// window `canvas-cdp-harness` lives in — a run is "mid-run" for the whole time
// between its launches, which for that file is most of ~190 s — and making it
// deterministic is what lets this file be a gate instead of a rate.
//
// ── THE TWO ARMS, AND WHY BOTH ARE RUN EVERY TIME ─────────────────────────
//
//   private  (the world after the fix) both instruments derive their own
//            profile. The victim's key MUST survive.
//   shared   (the world before it, reconstructed) both instruments are pointed
//            at ONE profile via AURORA_HARNESS_PROFILE_DIR. The victim's key
//            MUST be gone.
//
// The shared arm is the answer to "could this check ever have failed?" — a
// green private arm on its own is exactly as green when the attacker's clear
// silently did nothing, when the two never shared anything to begin with, or
// when the victim's key was never on disk. Each of those is separately
// disproved below, and then the shared arm shows the whole assembly producing
// the failure on demand.
//
// ⚠ THE SHARED ARM WRITES ONLY INSIDE ITS OWN mkdtemp. It does NOT reconstruct
// the hazard by pointing anything at `~/.config/Electron`; a proof of a
// data-loss guard must not cause the data loss to make its point.
//
// ── WHAT EACH ARM MEASURES, AND HOW ────────────────────────────────────────
//
//   [*1] the two instruments' profiles differ — read from the leveldb directory
//        each Electron actually held open (/proc/<pid>/fd), never from what the
//        launcher believes it passed.
//   [*2] the attacker's clear was EFFECTIVE — it writes its own sentinel first
//        and reads it back gone. An attacker whose clear no-ops would make the
//        private arm pass for the wrong reason.
//   [*3] the victim's key REACHED DISK before the attacker ran — bytes found in
//        the profile's leveldb. Cause (b) of the old flake, ruled out per run so
//        it cannot be mistaken for cause (a).
//   [*4] the victim reads its own key back. THE DELIVERABLE.
//
// ── INVARIANTS ─────────────────────────────────────────────────────────────
//
// No emulator. Nothing here touches oracle. Nothing here reads or writes a file
// under `$HOME` except through `spawnGuarded`'s existing snapshot/restore.

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import {
  spawnGuarded, killTree, descendants, restoreDiscoveryNow, APP_NAMES,
} from './lib/harness-guard.mjs';
import { resolveLeveldbDir, bytesOnDisk } from './lib/storage-flush.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROLE = process.env.PROOF_ROLE ?? 'orchestrator';
const WORK = process.env.PROOF_WORK ?? null;
const PORT = Number(process.env.PROOF_PORT ?? 9601);

/** The key the victim owns. Shaped like the real one so the failure this
 *  reproduces is the failure canvas-cdp-harness sees, not a lookalike. */
const VICTIM_KEY = 'aurora.session.v1:profile-isolation-proof';
/** The attacker's own key, which its own clear must remove. */
const ATTACKER_KEY = 'aurora.profileproof.attacker';

/* ── CDP, the smallest client that can ask a page a question ─────────────── */

function getJSON(path, port) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, timeout: 2000 }, (res) => {
      let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch (e) { reject(e); }
      });
    }).on('error', reject).on('timeout', function onTimeout() { this.destroy(new Error('timeout')); });
  });
}
async function portFree(port) { try { await getJSON('/json/version', port); return false; } catch { return true; } }
async function waitForTarget(port) {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list', port);
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`CDP target never appeared on port ${port}`);
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  return { ready, send, evalExpr, close: () => ws.close() };
}

/* ── one Electron session, launched the ONLY way this repo allows ────────── */

/**
 * Launch the built app, run `body(c)` against its page, then close the window
 * so Chromium commits the storage area (`lib/storage-flush.mjs`: the close is
 * what carries a busy session's writes; a signal alone loses them).
 *
 * Returns whatever `body` returned, plus the leveldb directory the tree was
 * OBSERVED holding open — the profile question answered by the process rather
 * than by the launcher's intention.
 */
async function session(label, body) {
  if (!(await portFree(PORT))) throw new Error(`port ${PORT} already serves a CDP target — a stale Electron is alive`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1280x800x24', ELECTRON, MAIN], {
    cwd: RUN.root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[${label}] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[${label}!] ${d}`); });
  let c = null, out = null, leveldb = null, how = null, why = null;
  try {
    c = cdp(await waitForTarget(PORT));
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof localStorage === "object"')) break; } catch { /* ctx swap */ }
      await sleep(300);
    }
    out = await body(c);
    // WHILE IT IS ALIVE: /proc cannot be asked about a dead process.
    ({ dir: leveldb, how, why } = resolveLeveldbDir({ pids: descendants(child.pid), appNames: APP_NAMES }));
  } finally {
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* target dies mid-call */ }
      const t0 = Date.now();
      while (child.exitCode === null && child.signalCode === null && Date.now() - t0 < 20000) await sleep(100);
      try { c.close(); } catch { /* */ }
    }
    await killTree(child, { quiet: true });
    await sleep(800);
  }
  return { ...out, leveldb, leveldbHow: how ?? why, origin: out?.origin ?? null };
}

/* ── the two roles ───────────────────────────────────────────────────────── */

const stamp = (name, value) => writeFileSync(join(WORK, name), JSON.stringify(value, null, 2));
/** Block until `dir/name` exists, then return its parsed contents. The two
 *  processes coordinate through files because they are genuinely separate
 *  runs — a shared object would make them one instrument, which is the thing
 *  this file must not be. */
async function waitForFile(dir, name, ms = 900000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (existsSync(join(dir, name))) return JSON.parse(readFileSync(join(dir, name), 'utf8'));
    await sleep(250);
  }
  throw new Error(`${name} never appeared in ${dir} within ${ms}ms`);
}

async function runVictim() {
  const value = `victim-${process.pid}-${Date.now()}`;
  const wrote = await session('victim-1', async (c) => {
    await c.evalExpr(`localStorage.setItem(${JSON.stringify(VICTIM_KEY)}, ${JSON.stringify(value)}); 1`);
    return {
      origin: await c.evalExpr('location.origin'),
      readBackInSession: await c.evalExpr(`localStorage.getItem(${JSON.stringify(VICTIM_KEY)})`),
    };
  });
  // The process is gone; what is on disk now is what the next session reads.
  const onDisk = wrote.leveldb === null ? null : bytesOnDisk(wrote.leveldb, value);
  stamp('victim-wrote.json', { ...wrote, value, onDisk });
  console.log(`victim: wrote ${VICTIM_KEY}=${value}; profile ${wrote.leveldb}; on disk: ${onDisk}`);

  await waitForFile(WORK, 'go.json');
  const read = await session('victim-2', async (c) => ({
    origin: await c.evalExpr('location.origin'),
    got: await c.evalExpr(`localStorage.getItem(${JSON.stringify(VICTIM_KEY)})`),
    keys: await c.evalExpr('JSON.stringify(Object.keys(localStorage))'),
  }));
  stamp('victim-read.json', { ...read, expected: value });
  console.log(`victim: read back ${JSON.stringify(read.got)} (expected ${JSON.stringify(value)})`);
}

async function runAttacker() {
  const sentinel = `attacker-${process.pid}-${Date.now()}`;
  const out = await session('attacker', async (c) => {
    await c.evalExpr(`localStorage.setItem(${JSON.stringify(ATTACKER_KEY)}, ${JSON.stringify(sentinel)}); 1`);
    const before = await c.evalExpr(`localStorage.getItem(${JSON.stringify(ATTACKER_KEY)})`);
    // THE GESTURE UNDER TEST — the one line ~a hundred instruments open with.
    await c.evalExpr('localStorage.clear(); 1');
    const after = await c.evalExpr(`localStorage.getItem(${JSON.stringify(ATTACKER_KEY)})`);
    // A post-clear write, so the clear's commit batch is carried to disk by the
    // close and the victim's next session cannot read a pre-clear snapshot.
    await c.evalExpr(`localStorage.setItem('aurora.profileproof.done', ${JSON.stringify(sentinel)}); 1`);
    return { origin: await c.evalExpr('location.origin'), before, after };
  });
  stamp('attacker.json', { ...out, sentinel });
  console.log(`attacker: cleared; own sentinel before=${JSON.stringify(out.before)} after=${JSON.stringify(out.after)}; profile ${out.leveldb}`);
}

/* ── the orchestrator ────────────────────────────────────────────────────── */

const fails = [];
const blind = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}\n        ${detail}`);
  if (!ok) fails.push(`[${id}] ${name} — ${detail}`);
}
function control(id, name, ok, detail) {
  console.log(`${ok ? 'control-ok' : 'CONTROL BROKEN'}  [${id}] ${name}\n        ${detail}`);
  if (!ok) blind.push(`[${id}] ${name} — ${detail}`);
}
function unmeasurable(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  fails.push(`[${id}] ${name} (UNMEASURABLE: ${why})`);
}

/** Run one child of this file in a role, with its own environment. */
function child(role, work, port, extraEnv) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SELF], {
      env: { ...process.env, PROOF_ROLE: role, PROOF_WORK: work, PROOF_PORT: String(port), ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    p.stdout.on('data', (d) => process.stdout.write(`  ${role}| ${d}`));
    p.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`  ${role}!| ${d}`); });
    p.on('exit', (code, sig) => resolve({ code, sig }));
    p.on('error', reject);
  });
}

/**
 * ONE ARM. `sharedProfile` is either null (each instrument derives its own) or
 * a directory both are pointed at.
 *
 * `expectSurvives` is what the arm asserts about the deliverable row, and it is
 * an EXPECTATION EITHER WAY — the shared arm asserting the key is GONE is what
 * makes the private arm's green mean something.
 */
async function arm(tag, { sharedProfile, expectSurvives }) {
  const work = mkdtempSync(join(tmpdir(), `aurora-profile-proof-${tag}-`));
  console.log(`\n══ arm ${tag}: ${sharedProfile ? `both instruments share ${sharedProfile}` : 'each instrument derives its own profile'}`);
  const env = sharedProfile ? { AURORA_HARNESS_PROFILE_DIR: sharedProfile } : {};
  if (sharedProfile) mkdirSync(sharedProfile, { recursive: true });
  try {
    // The victim runs as far as victim-wrote.json and then WAITS. From here to
    // `go.json` it is a live instrument between two launches — the exact state
    // canvas-cdp-harness spends most of its run in.
    const victim = child('victim', work, PORT, env);
    const victimDied = victim.then((v) => { throw new Error(`the victim exited (code ${v.code} ${v.sig ?? ''}) before it wrote its key`); });
    victimDied.catch(() => { /* it exits normally later; the race is what reads this */ });
    const w = await Promise.race([waitForFile(work, 'victim-wrote.json'), victimDied]);

    const a = await child('attacker', work, PORT + 2, env);
    if (a.code !== 0) { unmeasurable(`${tag}0`, 'the attacker instrument ran', `exit ${a.code} ${a.sig ?? ''}`); return; }
    const at = JSON.parse(readFileSync(join(work, 'attacker.json'), 'utf8'));

    writeFileSync(join(work, 'go.json'), '{"go":true}');
    const v = await victim;
    if (v.code !== 0) { unmeasurable(`${tag}0`, 'the victim instrument ran', `exit ${v.code} ${v.sig ?? ''}`); return; }
    const r = JSON.parse(readFileSync(join(work, 'victim-read.json'), 'utf8'));

    // [*1] WHOSE PROFILE, OBSERVED. Never "what we passed".
    if (w.leveldb === null || at.leveldb === null) {
      unmeasurable(`${tag}1`, 'the two instruments\' profiles were observed',
        `victim: ${w.leveldbHow}; attacker: ${at.leveldbHow}`);
    } else {
      const same = w.leveldb === at.leveldb;
      check(`${tag}1`, sharedProfile ? 'the two instruments share ONE profile (the arm\'s premise)'
        : 'the two instruments hold DIFFERENT profiles open',
      sharedProfile ? same : !same,
      `victim  ${w.leveldb}\n        attacker ${at.leveldb}\n        (${w.leveldbHow})`);
    }

    // [*2] the attacker's clear really cleared. Without this the private arm
    // passes just as green over an attacker that did nothing at all.
    control(`${tag}2`, 'the attacker\'s localStorage.clear() was effective on its own key',
      at.before !== null && at.after === null,
      `its own sentinel before=${JSON.stringify(at.before)} after=${JSON.stringify(at.after)}`);

    // [*3] cause (b) ruled out for this run: the key was on disk before the
    // attacker started, so an absence at [*4] is an erasure and not a flush.
    if (w.onDisk === null) {
      unmeasurable(`${tag}3`, 'the victim\'s key reached disk before the attacker ran', w.leveldbHow);
    } else {
      control(`${tag}3`, 'the victim\'s key reached disk before the attacker ran', w.onDisk === true,
        `bytes of ${JSON.stringify(w.value)} found in ${w.leveldb}: ${w.onDisk}; in-session read back ${JSON.stringify(w.readBackInSession)}`);
    }

    // [*4] THE DELIVERABLE.
    const survived = r.got === w.value;
    check(`${tag}4`, expectSurvives
      ? 'the victim reads its own key back after the attacker cleared'
      : 'RECONSTRUCTION: sharing one profile DOES destroy the victim\'s key',
    survived === expectSurvives,
    `expected ${JSON.stringify(w.value)}, got ${JSON.stringify(r.got)}\n`
      + `        keys the victim could see: ${r.keys}\n`
      + `        origin ${w.origin} -> ${r.origin}`);
    return { w, at, r };
  } finally {
    rmSync(work, { recursive: true, force: true });
    if (sharedProfile) rmSync(sharedProfile, { recursive: true, force: true });
  }
}

async function main() {
  assertFreshBuild(RUN);
  // A profile pinned in the OPERATOR'S environment would be inherited by both
  // children and make the private arm a second shared arm — green rows over a
  // premise that is false. Refuse rather than measure that.
  if (process.env.AURORA_HARNESS_PROFILE_DIR) {
    throw new Error('AURORA_HARNESS_PROFILE_DIR is set in this environment. Both instruments '
      + 'below would inherit it and share one profile, so the private arm could not distinguish '
      + 'a working fix from a broken one. Unset it and re-run.');
  }
  const only = process.env.ARM ?? null;
  const shared = join(mkdtempSync(join(tmpdir(), 'aurora-profile-shared-')), 'profile');
  try {
    if (only !== 'shared') await arm('p', { sharedProfile: null, expectSurvives: true });
    if (only !== 'private') await arm('s', { sharedProfile: shared, expectSurvives: false });
  } finally {
    rmSync(shared, { recursive: true, force: true });
    for (const d of restoreDiscoveryNow()) console.log(`cleanup: restored ${d}`);
  }
  console.log(`\n=== profile-isolation-proof: ${fails.length} FAIL, ${blind.length} broken control(s) ===`);
  if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
  if (blind.length) console.log('!!! BROKEN CONTROLS (this run proves nothing):\n  ' + blind.join('\n  '));
  if (!fails.length && !blind.length) {
    console.log('Two instruments launched against the same box could not reach each other\'s '
      + 'localStorage, and the same assembly with one shared profile destroyed the victim\'s key.');
  }
  process.exit(fails.length || blind.length ? 1 : 0);
}

const roles = { orchestrator: main, victim: runVictim, attacker: runAttacker };
if (!roles[ROLE]) { console.error(`unknown PROOF_ROLE ${ROLE}`); process.exit(2); }
roles[ROLE]().catch((e) => { console.error(e); process.exit(2); });
