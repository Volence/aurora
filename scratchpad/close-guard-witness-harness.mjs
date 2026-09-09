#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// THE WINDOW-CLOSE GUARD, WITNESSED FROM BEFORE THE EVENT.
//
//     npm run harness:close-guard-witness
//
// ═══ THE ROW THIS CLOSES ═══════════════════════════════════════════════════
//
// `CLOSE-GUARD-STARTS-AFTER-THE-EVENT` (docs/lens-findings.jsonl, medium):
//
//     WHEN A FEATURE DEPENDS ON A PLATFORM EVENT, A TEST THAT STARTS FROM THE
//     EVENT'S PAYLOAD CANNOT WITNESS THE EVENT.
//
// Oracle's drag-and-drop was correct code that was never called, and every test
// passed because each one began one step after the step that never happened.
// Ours has the same shape on the perimeter that matters most. The three existing
// tests — main/__tests__/close-handshake.test.ts, shell/__tests__/close-guard
// .test.ts and shell/__tests__/close-guard-seam.test.ts — drive the REAL state
// machine, the REAL registration, the REAL confirmation and the REAL channel
// constants over a fake bus. All of that begins AFTER Electron's `close` event.
// They are not wrong and this does not replace them. What none of them can do is
// say that the event ARRIVES.
//
// ═══ WHAT "WITNESS" MEANS HERE, AND WHAT IT REFUSES TO MEAN ════════════════
//
// ⚠ NOTHING HERE EMITS A CLOSE EVENT. `win.emit('close')` would be the
// payload-shaped test again wearing a harness costume: it would close the row
// while leaving the exact gap the row names. Every close in this file is raised
// by Electron itself, from the browser process, in response to either
//
//   • a real Ctrl+W through `Input.dispatchKeyEvent` — Chromium's own input
//     pipeline, the accelerator the default menu's `close` role binds, which is
//     the chord that destroyed unsaved documents before this guard existed; or
//   • `win.close()` called in the MAIN process — the same call Electron's own
//     `close` menu role makes and the same call this guard's `closeWindow` dep
//     makes for the second, permitted close.
//
// Which one actually delivered is DETECTED, not assumed, and printed on the
// `TRIGGER` line of every section. A run that had to fall back says so.
//
// THE OBSERVER IS EXTERNAL AND ADDITIVE. It is injected into the RUNNING main
// process over `--inspect` (Node's inspector; `require('electron')` is reachable
// there), after the app has already built its window and registered its own
// `close` handler. Because Node's EventEmitter calls listeners in registration
// order, the probe's listener runs LAST — so `e.defaultPrevented` that it reads
// is the app's decision, not a guess about it. Row [0b] asserts the app got
// there first, or every `defaultPrevented` below would be vacuous.
//
// THE TRACE IS A FILE, and that is not a convenience. main's stdout dies with
// the process, and every scenario here ends with the process quitting — so each
// record is `appendFileSync`'d the moment it happens and read back after the app
// is gone. (The same technique the comment block in src/main/index.ts describes
// for the `window.close()` measurement it already documents.)
//
// ═══ THE THREE PATHS ═══════════════════════════════════════════════════════
//
//   1. BLOCK       a real close is suspended by preventDefault(), the renderer
//                  is really asked, and — on a document with unsaved work and a
//                  user who cancels — THE WINDOW SURVIVES. §2.
//   2. LET-THROUGH the close that follows the answer proceeds and the window is
//                  really destroyed. §1 (clean) and §3 (after Discard).
//   3. RE-RAISE    after preventDefault() suspends a real close, the later
//                  programmatic close RE-RAISES the event — the branch the
//                  let-through path exists for, and the one no payload-shaped
//                  test can reach. It is close record #2 in §1 and #3 in §3.
//
// ⚠ ONE THING THE ROW'S WORDING IMPLIES THAT THE CODE DOES NOT, and it is worth
// saying rather than hiding inside a green: MAIN DOES NOT DISCRIMINATE ON
// DIRTINESS. `createCloseHandshake.onCloseRequested` returns 'suspend' for the
// FIRST close unconditionally — it cannot know what is unsaved, so it always
// suspends and always asks. The dirty/clean split lives entirely in the
// renderer's `confirmAppClose`. So §1 (clean) witnesses suspend+ask+re-raise
// with no dialog, and §2 is what witnesses a close being genuinely BLOCKED —
// the window still standing over unsaved work after the user said Cancel.
//
// ═══ WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING ════════════
//
//   • THE PROBE NEVER INSTALLED, so "no close event was seen" passes vacuously.
//     Every section reads an `installed` record before it reads anything else,
//     and §4 — whose whole claim is an ABSENCE — carries its own same-run
//     positive control: the `closed` listener registered in the same evaluate
//     call must have fired, which is the artifact proving the probe's listeners
//     are being delivered to at the moment the window went.
//   • THE PROBE RAN BEFORE THE APP'S HANDLER, making `defaultPrevented` always
//     false. Row [0b] counts the app's own `close` listeners before adding one.
//   • THE FIXTURE WAS NOT DIRTY, so §2's "the window survived" is just "nothing
//     wanted to stop it". Row [2a] asserts real unsaved edits and real painted
//     pixels in a real S1 sprite document BEFORE the first close is triggered.
//   • THE DIALOG WAS SOMEONE ELSE'S. Row [2c] reads the alertdialog's own
//     aria-label and button labels, and §3 answers it with a real mouse press at
//     an integer client pixel verified through `elementFromPoint`.
//   • A COUNT THAT ONLY GROWS. Every section asserts the EXACT number of close
//     records and their order, so an extra event or a missing one is red.
//
// ═══ SAFETY ═══════════════════════════════════════════════════════════════
//
// NOTHING HERE WRITES TO A PEER CHECKOUT. s1disasm is OPENED and one sprite
// document is painted IN MEMORY through `__dbg.spritePaint`; no Ctrl+S is ever
// sent and no save call is made, exactly as scratchpad/confirm-destroy-harness
// .mjs does with the same fixture. The trace files live under the OS temp dir.
//
// NO EMULATOR, EVER. Nothing here runs a ROM or calls an emulator tool.
//
// CLEANUP IS BY PID. `killTree` walks /proc for descendants of the pid THIS
// process spawned, and it is `await`ed — a bare pid is a silent no-op and a
// dropped promise reaps only by accident.
//
// ═══ MUTATIONS (red-first proof) ═══════════════════════════════════════════
//
// These are applied to src/main/*.ts by hand, rebuilt (`VITE_AURORA_DEBUG=1
// npx electron-vite build`) and run; the packet records what each turned red.
//
//   MUT-A  drop `e.preventDefault()` from the close handler in main/index.ts
//          → [1b] [2b] [2c] [2d] red: the event arrives and nothing suspends it.
//   MUT-B  `if (closing) return 'suspend'` in main/close-handshake.ts
//          → [1d] [1e] red: the re-raised close is suspended forever, the window
//            never goes. THE branch no payload-shaped test can reach.
//   MUT-C  drop the `deps.askRenderer()` call in main/close-handshake.ts
//          → [1c] [2c] red: nothing crosses the IPC and no dialog appears.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> node scratchpad/close-guard-witness-harness.mjs
//
// ⚠ BOTH VARIABLES. `ELECTRON_BIN` names ONE FILE, not a tree: alone, it leaves
// the run measuring the MAIN checkout's `dist/` while every path in the output
// looks right. The `root:` line below says which tree answered — read it.

import * as http from 'node:http';
import * as os from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawnGuarded, killTree, cmdlineOf } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');   // OPENED ONLY — never written

const TRACE_DIR = join(os.tmpdir(), `aurora-close-witness-${process.pid}`);
mkdirSync(TRACE_DIR, { recursive: true });

const PLANT = process.env.PLANT ?? '';

// ── constants READ FROM SOURCE, never typed here ───────────────────────────
//
// A channel name or a timeout frozen into a harness is the copied-pin defect
// this repo keeps paying for: the day it moves, the probe listens on a channel
// nothing sends and the absence rows pass for the wrong reason. Both are parsed
// out of the modules that define them, and the run REFUSES if either is gone —
// no expectation is better than an invented one.
function ipcChannel(name) {
  const path = join(ROOT, 'src/shared/ipc-types.ts');
  const src = readFileSync(path, 'utf8');
  const m = new RegExp(`${name}:\\s*'([^']+)'`).exec(src);
  if (!m) throw new Error(`could not read IPC_CHANNELS.${name} out of ${path} — the probe would `
    + 'listen on a channel nothing sends, and every absence row below would be vacuous');
  return m[1];
}
function closeTimeoutMs() {
  const path = join(ROOT, 'src/main/close-handshake.ts');
  const src = readFileSync(path, 'utf8');
  const m = /export const CLOSE_ANSWER_TIMEOUT_MS = ([0-9_]+);/.exec(src);
  if (!m) throw new Error(`could not read CLOSE_ANSWER_TIMEOUT_MS out of ${path}`);
  return Number(m[1].replace(/_/g, ''));
}
const CH_REQUEST = ipcChannel('CLOSE_REQUEST');
const CH_RESPONSE = ipcChannel('CLOSE_RESPONSE');
const TIMEOUT_MS = closeTimeoutMs();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── row bookkeeping ────────────────────────────────────────────────────────
const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
/** A row that could not be measured is LOUD and RED — never rendered as 0 or green. */
function unmeasurable(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: false });
  fails.push(`[${id}] ${name} — UNMEASURABLE: ${why}`);
}

// ── CDP over a websocket (renderer page target OR main node target) ─────────
function getJSON(port, path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (ch) => (d += ch));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
/**
 * `commandLineAPI` is ON for the MAIN-process connection and OFF for the page.
 *
 * Node's inspector puts `require` in the console's command-line API, not on the
 * global object — without this flag the probe dies with `require is not defined`
 * (measured, first run of this harness). The renderer connection does NOT take
 * it: the command-line API injects `$`, `$$`, `copy` and friends into the
 * evaluation scope, and shadowing a page global from a measurement harness is
 * exactly the kind of thing that makes a reading come off the wrong screen.
 */
function cdp(wsUrl, { commandLineAPI = false } = {}) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  let dead = false;
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  // ⚠ REJECT EVERY OUTSTANDING CALL WHEN THE SOCKET GOES, AND TIME EVERY CALL OUT.
  // The press that answers the dialog with Discard DESTROYS the renderer, so the
  // CDP reply to that very `Input.dispatchMouseEvent` never comes back. Without
  // this the harness hung for the rest of its wall clock on an `await` for a
  // process that no longer existed — measured, run 3 of this file, and it looks
  // exactly like a product hang from the outside.
  ws.addEventListener('close', () => {
    dead = true;
    for (const [, settle] of pending) settle({ error: { message: 'socket closed' } });
    pending.clear();
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res); ws.addEventListener('error', rej);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    if (dead) { reject(new Error(`${method}: socket closed`)); return; }
    const id = nextId++;
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method}: no CDP reply within 15s`));
    }, 15000);
    pending.set(id, (m) => {
      clearTimeout(timer);
      if (m.error) reject(new Error(`${method}: ${JSON.stringify(m.error)}`));
      else resolve(m.result);
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr, awaitPromise: true, returnByValue: true,
      includeCommandLineAPI: commandLineAPI,
    });
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} `
        + `${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, isDead: () => dead, close: () => { try { ws.close(); } catch { /* */ } } };
}

// ── the trace file the main-process probe writes ───────────────────────────
function readTrace(file) {
  if (!existsSync(file)) return null;      // null, NOT [] — absence is not "no events"
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return { k: 'UNPARSEABLE', line: l }; }
  });
}
const closesOf = (t) => (t ?? []).filter((r) => r.k === 'close');
const briefTrace = (t) => (t === null ? 'NO TRACE FILE' : t.map((r) => (r.k === 'close'
  ? `close#${r.seq}${r.defaultPrevented ? '(SUSPENDED)' : '(let through)'}`
  : r.k === 'answer' ? `answer(${r.mayClose}${r.fromThisWindow ? '' : ',FOREIGN'})`
    : r.k)).join(' → '));

/**
 * THE PROBE, evaluated in the RUNNING main process.
 *
 * Additive and observation-only:
 *   • a `close` listener registered AFTER the app's, so it reads the app's
 *     `defaultPrevented` rather than deciding anything;
 *   • a `closed` listener and a `webContents` `destroyed` listener, which are
 *     what make an ABSENCE of close events readable as "the window went without
 *     one" rather than as "nothing happened";
 *   • an extra `ipcMain.on(CLOSE_RESPONSE)` observer that never responds — it
 *     witnesses the renderer's answer coming back across the real IPC, which is
 *     the half of "the renderer is asked" that needs no monkey-patching;
 *   • a pass-through wrapper on `win.webContents.send` that records a CLOSE
 *     REQUEST going out and then calls the original. This is the only patched
 *     product object in the file; it forwards every argument unchanged and the
 *     app resolves `win.webContents.send` at call time, so the guard's own
 *     `askRenderer` goes through it.
 *
 * Returns the app's own `close` listener count BEFORE the probe was added.
 */
const PROBE = (traceFile) => String.raw`
(() => {
  const req = (typeof require === 'function') ? require
    : (process.mainModule && typeof process.mainModule.require === 'function')
      ? process.mainModule.require.bind(process.mainModule) : null;
  if (!req) return { error: 'no require() reachable in the main process context' };
  const { BrowserWindow, ipcMain } = req('electron');
  const fs = req('fs');
  const FILE = ${JSON.stringify(traceFile)};
  const wins = BrowserWindow.getAllWindows();
  if (wins.length !== 1) return { error: 'expected exactly one BrowserWindow, saw ' + wins.length };
  const win = wins[0];
  const before = win.listenerCount('close');
  const put = (rec) => { try { fs.appendFileSync(FILE, JSON.stringify(rec) + '\n'); } catch (e) { /* */ } };
  globalThis.__closeWitness = { n: 0 };
  win.on('close', (e) => {
    const seq = ++globalThis.__closeWitness.n;
    put({ k: 'close', seq, defaultPrevented: e.defaultPrevented === true,
          destroyed: win.isDestroyed(), t: Date.now() });
  });
  win.on('closed', () => put({ k: 'closed', t: Date.now() }));
  win.webContents.on('destroyed', () => put({ k: 'wc-destroyed', t: Date.now() }));
  ipcMain.on(${JSON.stringify(CH_RESPONSE)}, (e, mayClose) => put({
    k: 'answer', mayClose: mayClose === true,
    fromThisWindow: !win.isDestroyed() && e.sender === win.webContents, t: Date.now(),
  }));
  const wc = win.webContents;
  const orig = wc.send.bind(wc);
  wc.send = function (channel) {
    if (channel === ${JSON.stringify(CH_REQUEST)}) put({ k: 'ask', t: Date.now() });
    return orig.apply(null, arguments);
  };
  put({ k: 'installed', listenersBefore: before, t: Date.now() });
  return { listenersBefore: before, pid: process.pid };
})()`;

/** The default application menu's `close` role and its accelerator, from main. */
const MENU_PROBE = String.raw`
(() => {
  const req = (typeof require === 'function') ? require
    : process.mainModule.require.bind(process.mainModule);
  const { Menu } = req('electron');
  const m = Menu.getApplicationMenu();
  if (!m) return { menu: null };
  const found = [];
  const walk = (items) => { for (const it of items) {
    if (it.role) found.push({ role: String(it.role).toLowerCase(), accel: it.accelerator || null,
                              label: it.label || null });
    if (it.submenu && it.submenu.items) walk(it.submenu.items);
  } };
  walk(m.items);
  return { menu: true, close: found.filter((f) => f.role === 'close') };
})()`;

// ── one app session ────────────────────────────────────────────────────────
async function launch({ name, port, nodePort, display }) {
  const trace = join(TRACE_DIR, `${name}.jsonl`);
  rmSync(trace, { force: true });
  if (existsSync(trace)) throw new Error(`could not clear ${trace}`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(port), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(display), '-s', '-screen 0 1680x1050x24',
      ELECTRON, `--inspect=${nodePort}`, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let exited = null;
  child.on('exit', (code, signal) => { exited = { code, signal, at: Date.now() }; });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  // main's node inspector
  let mainWs = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await getJSON(nodePort, '/json/list');
      const t = list.find((x) => x.webSocketDebuggerUrl);
      if (t) { mainWs = t.webSocketDebuggerUrl; break; }
    } catch { /* not up */ }
    await sleep(400);
  }
  if (!mainWs) throw new Error(`main inspector never appeared on ${nodePort}`);
  const M = cdp(mainWs, { commandLineAPI: true });
  await M.ready;
  await M.send('Runtime.enable');
  await M.send('Runtime.runIfWaitingForDebugger').catch(() => {});

  // the renderer page target
  let pageWs = null;
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON(port, '/json/list');
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) { pageWs = p.webSocketDebuggerUrl; break; }
    } catch { /* not up */ }
    await sleep(400);
  }
  if (!pageWs) throw new Error(`renderer CDP target never appeared on ${port}`);
  const R = cdp(pageWs);
  await R.ready;
  await R.send('Runtime.enable');

  return { name, child, M, R, trace, exitedAt: () => exited, port, nodePort, display };
}

async function waitDbg(R, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if (await R.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
    await sleep(300);
  }
  return false;
}

async function teardown(s) {
  try { s.M.close(); } catch { /* */ }
  try { s.R.close(); } catch { /* */ }
  await killTree(s.child);
}

/** Poll the trace file until a record of kind `k` appears, or the budget runs out. */
async function waitForRecord(trace, k, budgetMs) {
  const t0 = Date.now();
  for (;;) {
    const t = readTrace(trace);
    if ((t ?? []).some((r) => r.k === k)) return t;
    if (Date.now() - t0 > budgetMs) return t;
    await sleep(120);
  }
}

/** Poll the trace file until it holds `n` close records, or the budget runs out. */
async function waitForCloses(trace, n, budgetMs) {
  const t0 = Date.now();
  for (;;) {
    const t = readTrace(trace);
    if (closesOf(t).length >= n) return t;
    if (Date.now() - t0 > budgetMs) return t;
    await sleep(120);
  }
}

/**
 * A REAL CLOSE, and a HONEST report of which mechanism delivered it.
 *
 * `ctrl-w` first where it is safe: it is the chord the guard exists for, it goes
 * through Chromium's own input pipeline (NOT `el.click()`, NOT `win.emit`), and
 * the default menu's `close` role is what turns it into a window close. If no
 * close event appears within the budget it falls back to `win.close()` in the
 * MAIN process — the browser-process close Electron's own `close` role performs
 * — and says so. Neither path fabricates the event.
 */
async function triggerRealClose(s, { want, preferKey = false, budgetMs = 3000 }) {
  const had = closesOf(readTrace(s.trace)).length;
  if (preferKey) {
    const base = { key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87, modifiers: 2 };
    await s.R.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }).catch(() => {});
    await s.R.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }).catch(() => {});
    const t0 = Date.now();
    while (Date.now() - t0 < budgetMs) {
      if (closesOf(readTrace(s.trace)).length > had) {
        return { how: 'real Ctrl+W through Chromium\'s input pipeline (default menu `close` role)' };
      }
      await sleep(120);
    }
    note('trigger', 'Ctrl+W raised no close event within '
      + `${budgetMs}ms — falling back to a browser-process win.close()`);
  }
  await s.M.evalExpr(
    "(() => { const { BrowserWindow } = require('electron');"
    + ' const w = BrowserWindow.getAllWindows()[0];'
    + " if (!w) return 'no window'; w.close(); return 'closed'; })()").catch((e) => {
    note('trigger', `win.close() eval threw: ${e.message}`);
  });
  await waitForCloses(s.trace, had + (want ?? 1), budgetMs);
  return { how: 'win.close() in the MAIN process (the browser-process close Electron\'s own `close` menu role performs)' };
}

// ── renderer-side helpers (real input, integer pixels) ─────────────────────
const CONFIRM_INFO = String.raw`
(() => {
  const d = document.querySelector('[role="alertdialog"]');
  if (!d) return null;
  const vis = (e) => { const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  return {
    label: d.getAttribute('aria-label'),
    text: (d.innerText || '').slice(0, 400),
    buttons: [...d.querySelectorAll('button')].filter(vis).map((b) => b.textContent.trim()),
  };
})()`;

/** The integer client pixel at the centre of a confirm button, plus what is
 *  actually painted there — an aim nothing occupies is a press that no-ops. */
const BUTTON_AIM = (label) => String.raw`
(() => {
  const d = document.querySelector('[role="alertdialog"]');
  if (!d) return { error: 'no alertdialog' };
  const b = [...d.querySelectorAll('button')].find((e) => e.textContent.trim() === ${JSON.stringify(label)});
  if (!b) return { error: 'no button labelled ' + ${JSON.stringify(label)} };
  const r = b.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return { x, y, dpr: window.devicePixelRatio,
           rect: { l: r.left, t: r.top, w: r.width, h: r.height },
           hits: hit ? (hit.tagName + ':' + (hit.textContent || '').trim().slice(0, 24)) : null,
           hitIsButton: hit === b || b.contains(hit) };
})()`;

async function pressConfirm(s, label) {
  const aim = await s.R.json(BUTTON_AIM(label));
  if (aim.error) return { ok: false, aim };
  note(`aim "${label}"`, `client (${aim.x},${aim.y}) dpr=${aim.dpr} rect=${JSON.stringify(aim.rect)} `
    + `elementFromPoint → ${aim.hits} (isTheButton=${aim.hitIsButton})`);
  if (!aim.hitIsButton) return { ok: false, aim };
  await s.R.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: aim.x, y: aim.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(60);
  // The release is what React turns into the click, so for `Discard & close` it
  // is also what destroys this renderer. A reply that never comes is the SUCCESS
  // case here, not an error — the trace file, not the CDP round trip, is the
  // measurement.
  await s.R.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: aim.x, y: aim.y, button: 'left', buttons: 0, clickCount: 1 })
    .catch((e) => note('press', `the mouseReleased reply did not come back (${e.message}) — expected `
      + 'when the press destroys the renderer; the trace file is what is read'));
  return { ok: true, aim };
}

// ═══════════════════════════════════════════════════════════════════════════
// §1 — a CLEAN app: the event arrives, is suspended, the renderer is asked,
//      and the answer RE-RAISES a close that goes through.
// ═══════════════════════════════════════════════════════════════════════════
async function sectionClean() {
  console.log('\n=== §1 CLEAN: arrival, suspend, ask, RE-RAISE, let-through ===');
  const s = await launch({ name: 'clean', port: 9451, nodePort: 9351, display: 101 });
  try {
    const installed = await s.M.json(PROBE(s.trace));
    if (installed.error) { unmeasurable('0a', 'the main-process probe installed', installed.error); return; }
    check('0a', 'the main process is reachable over --inspect, holds exactly ONE BrowserWindow, and '
      + 'the probe is installed on it',
      typeof installed.listenersBefore === 'number' && installed.pid > 0,
      `main pid ${installed.pid}; app close listeners before the probe: ${installed.listenersBefore}`);
    // ⚠ WHAT THIS ROW DOES AND DOES NOT SAY. It says the probe is LAST, which is
    // what makes every `defaultPrevented` below the app's decision. It does NOT
    // say the listeners it counted are the GUARD's: under MUT-D (the guard never
    // installed) the count was still 1, because registerAetherBridge registers a
    // `close` listener of its own. Row [1b] is what proves the guard is there.
    check('0b', "ANTI-VACUOUS: the app registered its OWN `close` listener BEFORE the probe's, so "
      + 'every `defaultPrevented` below is the app\'s decision and not the probe\'s',
      installed.listenersBefore >= 1,
      `win.listenerCount('close') was ${installed.listenersBefore} when the probe was added; the probe `
      + "is therefore last, and EventEmitter calls listeners in registration order");

    const menu = await s.M.json(MENU_PROBE);
    check('0d', "Electron's default application menu supplies a `close` role — the Ctrl+W path "
      + 'src/main/index.ts names as the chord that used to destroy every unsaved document',
      menu.menu === true && Array.isArray(menu.close) && menu.close.length >= 1,
      `Menu.getApplicationMenu() → ${menu.menu ? 'present' : 'NULL'}; close-role items: ${JSON.stringify(menu.close)}`);

    const haveDbg = await waitDbg(s.R);
    check('0c', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npx electron-vite build');

    const beforeTrace = readTrace(s.trace);
    check('1z', 'ANTI-VACUOUS: no close event has been raised before the trigger',
      closesOf(beforeTrace).length === 0, `trace so far: ${briefTrace(beforeTrace)}`);

    const trig = await triggerRealClose(s, { want: 2, preferKey: true, budgetMs: 4000 });
    console.log(`TRIGGER    §1 close delivered by: ${trig.how}`);
    const t = await waitForCloses(s.trace, 2, 8000);
    const cl = closesOf(t);
    console.log(`TRACE      ${briefTrace(t)}`);

    check('1a', 'A REAL CLOSE REACHES THE HANDLER: the event the whole guard depends on actually '
      + 'arrives — the claim no payload-shaped test can make',
      cl.length >= 1, `${cl.length} close record(s): ${briefTrace(t)}`);
    check('1b', 'BLOCK (mechanism): the FIRST real close is SUSPENDED — preventDefault() was applied '
      + 'by the app before the probe read the event',
      cl[0]?.defaultPrevented === true,
      `close#1 defaultPrevented=${cl[0]?.defaultPrevented}, window destroyed at that moment=${cl[0]?.destroyed}`);
    const ask = (t ?? []).find((r) => r.k === 'ask');
    const ans = (t ?? []).find((r) => r.k === 'answer');
    check('1c', `THE RENDERER IS REALLY ASKED: '${CH_REQUEST}' goes out from main and the answer `
      + `comes back on '${CH_RESPONSE}' from THIS window's webContents`,
      !!ask && !!ans && ans.fromThisWindow === true && ans.mayClose === true,
      `ask=${!!ask}; answer=${ans ? JSON.stringify(ans) : 'NONE'}`);
    check('1d', 'RE-RAISE: the answer causes a SECOND close event, and that one is LET THROUGH — the '
      + 'branch the let-through path exists for and the one no test that starts after the event can reach',
      cl.length >= 2 && cl[1].defaultPrevented === false,
      `close#2 defaultPrevented=${cl[1]?.defaultPrevented}`);
    // ⚠ ITS OWN WAIT, not the one that stopped at close#2. `waitForCloses`
    // returns the instant the second close record lands, which is BEFORE the
    // window has finished going — so reading `closed` off that same snapshot
    // made this row a race that reported "the window survived a let-through"
    // (run 4 of this file). The property is unchanged; the read was early.
    const tClosed = await waitForRecord(s.trace, 'closed', 8000);
    check('1e', 'LET-THROUGH: the window is really destroyed',
      (tClosed ?? []).some((r) => r.k === 'closed'),
      `records: ${briefTrace(tClosed)}`);
    check('1f', 'ANTI-VACUOUS: EXACTLY two close events, in that order — not one, not a loop',
      cl.length === 2 && cl[0].defaultPrevented === true && cl[1].defaultPrevented === false,
      `${cl.length} close record(s): ${cl.map((r) => `#${r.seq} prevented=${r.defaultPrevented}`).join(', ')}`);

    // ⚠ NOT `child.on('exit')`. `child` is the `xvfb-run` WRAPPER, which outlives
    // the app it launched, so a row keyed on it reported "still alive" for an
    // app that had already quit (run 3 of this file). The pid asked about here
    // is the MAIN PROCESS's own, reported by the probe from inside it.
    //
    // ⚠ AND `alive()` IS NOT THE PREDICATE EITHER: it is `kill(pid,0)`, which a
    // ZOMBIE answers. A process that has called exit() but has not been reaped
    // by its parent (here the `node .bin/electron` shim under `xvfb-run`) is
    // EXITED for the purpose of this claim, and reading it as running is how a
    // correct app gets a red row. The /proc state letter is the discriminator.
    //
    // ⚠ AND THE OBSERVER IS DROPPED FIRST. An attached Node inspector session and
    // an open renderer CDP socket are both this harness's own additions to the
    // process it is asking about, and "did it exit" is precisely the question
    // they could confound. Both are closed before the poll begins, so what is
    // measured is the app's own shutdown and not the debugger's grip on it.
    try { s.M.close(); } catch { /* */ }
    try { s.R.close(); } catch { /* */ }
    const mainPid = installed.pid;
    const procState = () => {
      try {
        const st = readFileSync(`/proc/${mainPid}/stat`, 'utf8');
        return st.slice(st.lastIndexOf(')') + 2).split(' ')[0];   // R/S/D/Z/T…
      } catch { return null; }                                    // gone entirely
    };
    let st = procState();
    for (let i = 0; i < 150 && st !== null && st !== 'Z'; i++) { await sleep(200); st = procState(); }
    check('1g', 'the app MAIN PROCESS itself exits after the window went (window-all-closed → app.quit)',
      st === null || st === 'Z',
      `main pid ${mainPid}: /proc state ${st === null ? 'ABSENT (reaped)' : st}`
      + `${st === 'Z' ? ' (zombie — exited, awaiting reap by the xvfb-run shim)' : ''}`
      + `${st !== null && st !== 'Z' ? ` — STILL RUNNING: ${cmdlineOf(mainPid).slice(0, 120)}` : ''}`);
  } finally {
    await teardown(s);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// §2/§3 — a DIRTY app: the close is BLOCKED and the window survives Cancel;
//         then Discard re-raises and it goes.
// ═══════════════════════════════════════════════════════════════════════════
async function sectionDirty() {
  console.log('\n=== §2/§3 DIRTY: BLOCK on Cancel, RE-RAISE on Discard ===');
  const s = await launch({ name: 'dirty', port: 9452, nodePort: 9352, display: 102 });
  try {
    const installed = await s.M.json(PROBE(s.trace));
    if (installed.error) { unmeasurable('2a', 'the main-process probe installed', installed.error); return; }
    if (!(await waitDbg(s.R))) {
      unmeasurable('2a', 'a dirty fixture', 'window.__dbg never appeared — not a VITE_AURORA_DEBUG=1 build');
      return;
    }
    if (!existsSync(S1DIR)) {
      unmeasurable('2a', 'a dirty fixture', `s1disasm is not at ${S1DIR}; §2 and §3 cannot be measured `
        + '(they need a real document with unsaved work). NOT a pass.');
      return;
    }

    // ── the fixture: a real S1 sprite document with real unsaved edits ──────
    // OPENED ONLY. Nothing here saves: no Ctrl+S is sent and no save call is
    // made, so s1disasm is never written to.
    await s.R.evalExpr(`void window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = { zones: 0 };
    for (let i = 0; i < 50 && !(proj.zones > 0); i++) {
      await sleep(500);
      proj = await s.R.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    }
    await s.R.evalExpr("void window.__dbg.activate('ghz', 1)").catch(() => {});
    for (let i = 0; i < 50; i++) {
      await sleep(500);
      const l = await s.R.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
      if (l.status === 'ready') break;
    }
    await s.R.evalExpr('window.__dbg.editObjectArt(0x41)').catch(() => {});
    await sleep(2500);
    for (let i = 0; i < 6; i++) {
      await s.R.evalExpr(`window.__dbg.spritePaint(0, ${2 + i}, 3, ${1 + (i % 15)})`).catch(() => {});
    }
    await sleep(400);
    const sp = await s.R.json('window.__dbg.spriteState()').catch(() => null);
    check('2a', 'ANTI-VACUOUS FIXTURE: a real S1 sprite document is open and carries REAL unsaved '
      + 'edits and painted pixels — without this, "the window survived" would be "nothing wanted to stop it"',
      !!sp && sp.unsavedEdits === true && (sp.frameCoverage?.[0] ?? 0) > 0,
      sp ? `doc=${sp.activeDocId} frames=${sp.frames} unsavedEdits=${sp.unsavedEdits} `
        + `frame0 non-zero pixels=${sp.frameCoverage?.[0]} · project zones=${proj.zones}`
        : 'spriteState() returned nothing');
    if (!sp || sp.unsavedEdits !== true) {
      unmeasurable('2b', 'BLOCK on a dirty document', 'the fixture is not dirty; §2 and §3 would '
        + 'measure the clean path and pass for the wrong reason');
      return;
    }

    const before = readTrace(s.trace);
    check('2z', 'ANTI-VACUOUS: no close event has been raised before the trigger',
      closesOf(before).length === 0, `trace so far: ${briefTrace(before)}`);

    // ── the first real close ───────────────────────────────────────────────
    const trig1 = await triggerRealClose(s, { want: 1, preferKey: false, budgetMs: 4000 });
    console.log(`TRIGGER    §2 close delivered by: ${trig1.how}`);
    await waitForCloses(s.trace, 1, 5000);
    await sleep(1500);
    const t1 = readTrace(s.trace);
    const cl1 = closesOf(t1);
    const aliveNow = await s.M.evalExpr(
      "(() => { const { BrowserWindow } = require('electron');"
      + ' const w = BrowserWindow.getAllWindows()[0];'
      + " return w ? (w.isDestroyed() ? 'destroyed' : 'alive') : 'gone'; })()").catch((e) => `ERR ${e.message}`);
    console.log(`TRACE      ${briefTrace(t1)}`);
    check('2b', 'BLOCK: a real close over UNSAVED WORK is suspended and THE WINDOW IS STILL THERE — '
      + 'the guard doing the one job it exists for',
      cl1.length === 1 && cl1[0].defaultPrevented === true && aliveNow === 'alive',
      `${cl1.length} close record(s), #1 defaultPrevented=${cl1[0]?.defaultPrevented}; `
      + `BrowserWindow is ${aliveNow} ${TIMEOUT_MS / 1000}s-timeout not yet due`);

    const info = await s.R.json(CONFIRM_INFO);
    check('2c', 'THE USER IS REALLY ASKED: the app\'s own ConfirmDialog is on screen, over the real '
      + 'IPC, with the three-button unsaved-work question',
      !!info && /unsaved/i.test(info.label ?? '')
        && (info.buttons ?? []).some((b) => /discard/i.test(b))
        && (info.buttons ?? []).some((b) => /^cancel$/i.test(b)),
      info ? `aria-label=${JSON.stringify(info.label)} buttons=${JSON.stringify(info.buttons)}\n        `
        + `body: ${JSON.stringify((info.text ?? '').slice(0, 220))}`
        : 'no [role="alertdialog"] on screen');

    // ── Cancel: the window must stay ───────────────────────────────────────
    if (!info) {
      unmeasurable('2d', 'CANCEL keeps the window', 'no dialog to answer');
    } else {
      const pressed = await pressConfirm(s, (info.buttons ?? []).find((b) => /^cancel$/i.test(b)) ?? 'Cancel');
      await sleep(2000);
      const t2 = readTrace(s.trace);
      const cl2 = closesOf(t2);
      const ans = (t2 ?? []).filter((r) => r.k === 'answer');
      const alive2 = await s.M.evalExpr(
        "(() => { const { BrowserWindow } = require('electron');"
        + ' const w = BrowserWindow.getAllWindows()[0];'
        + " return w ? (w.isDestroyed() ? 'destroyed' : 'alive') : 'gone'; })()").catch((e) => `ERR ${e.message}`);
      const sp2 = await s.R.json('window.__dbg.spriteState()').catch(() => null);
      console.log(`TRACE      ${briefTrace(t2)}`);
      check('2d', 'CANCEL KEEPS THE WINDOW: the answer is a literal false, NO second close event '
        + 'follows, the window is alive and the unsaved work is untouched',
        pressed.ok && cl2.length === 1
        && ans.length === 1 && ans[0].mayClose === false && ans[0].fromThisWindow === true
        && alive2 === 'alive' && sp2?.unsavedEdits === true
        && (sp2.frameCoverage?.[0] ?? 0) === (sp.frameCoverage?.[0] ?? -1),
        `close records=${cl2.length}; answers=${JSON.stringify(ans)}; window=${alive2}; `
        + `unsavedEdits=${sp2?.unsavedEdits}; frame0 pixels ${sp.frameCoverage?.[0]} → ${sp2?.frameCoverage?.[0]}`);
    }

    // ── §3: close again, Discard ───────────────────────────────────────────
    console.log('\n--- §3: a SECOND real close, answered with Discard ---');
    const trig2 = await triggerRealClose(s, { want: 1, preferKey: false, budgetMs: 4000 });
    console.log(`TRIGGER    §3 close delivered by: ${trig2.how}`);
    await sleep(1500);
    const t3 = readTrace(s.trace);
    const cl3 = closesOf(t3);
    check('3a', 'a SECOND real close after a Cancel is suspended and ASKS AGAIN — the `pending` flag '
      + 'was released by the answer, so the guard is not a one-shot',
      cl3.length === 2 && cl3[1].defaultPrevented === true
      && (t3 ?? []).filter((r) => r.k === 'ask').length === 2,
      `close records=${cl3.length} (#2 defaultPrevented=${cl3[1]?.defaultPrevented}); `
      + `asks=${(t3 ?? []).filter((r) => r.k === 'ask').length}`);

    const info2 = await s.R.json(CONFIRM_INFO);
    if (!info2) {
      unmeasurable('3b', 'DISCARD re-raises the close', 'the dialog did not reappear');
    } else {
      const discard = (info2.buttons ?? []).find((b) => /discard/i.test(b));
      const pressed2 = await pressConfirm(s, discard ?? 'Discard & close');
      const t4 = await waitForCloses(s.trace, 3, 8000);
      const cl4 = closesOf(t4);
      console.log(`TRACE      ${briefTrace(t4)}`);
      check('3b', 'RE-RAISE OVER A DIALOG: Discard answers a literal true and main\'s own close() '
        + 'RE-RAISES the event — close#3, LET THROUGH',
        pressed2.ok && cl4.length === 3 && cl4[2].defaultPrevented === false
        && (t4 ?? []).some((r) => r.k === 'answer' && r.mayClose === true),
        `${cl4.length} close record(s): ${cl4.map((r) => `#${r.seq} prevented=${r.defaultPrevented}`).join(', ')}`);
      // Its own wait, for the same reason [1e] has one: `waitForCloses` returns
      // the instant close#3 lands, which is before `closed` has fired.
      const t5 = await waitForRecord(s.trace, 'closed', 8000);
      check('3c', 'and the window is really gone this time',
        (t5 ?? []).some((r) => r.k === 'closed'), `records: ${briefTrace(t5)}`);
    }
  } finally {
    await teardown(s);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// §4 — THE PIN: `window.close()` from the renderer raises NO BrowserWindow
//      close event at all, so it walks straight past this guard.
// ═══════════════════════════════════════════════════════════════════════════
//
// src/main/index.ts states this as measured fact ("Electron routes that through
// `webContents.close()` … the handler never ran for that path, while the window
// went"). Nothing in Aurora calls `window.close()` today, so this is a TRIGGER,
// not a defect: the day the app grows a close button of its own, this row is
// what says it must ask through the guard rather than call `window.close()`.
//
// ⚠ AN ABSENCE NEEDS A CONTROL IN ITS OWN RUN. Row [4a] is it: the `closed`
// listener registered in the SAME evaluate call as the `close` listener must
// have fired, which is the artifact proving the probe's listeners are being
// delivered to at the moment the window went. Without that, "no close event"
// and "no probe" are the same output.
async function sectionWindowClose() {
  console.log('\n=== §4 PIN: renderer window.close() bypasses the BrowserWindow close event ===');
  const s = await launch({ name: 'wclose', port: 9453, nodePort: 9353, display: 103 });
  try {
    const installed = await s.M.json(PROBE(s.trace));
    if (installed.error) { unmeasurable('4a', 'the §4 probe installed', installed.error); return; }
    await waitDbg(s.R);
    const before = readTrace(s.trace);
    if (closesOf(before).length !== 0) {
      unmeasurable('4b', 'window.close() raises no close event', 'a close event was already recorded');
      return;
    }
    // ── the trigger, and its DETECTOR CONTROL ─────────────────────────────
    //
    // [4b] is an ABSENCE, and the product has no mutation that can make an
    // absence red — Electron's routing of `window.close()` is not our code. So
    // the plant is on the DETECTOR instead, which is the honest place for it:
    // PLANT=wclose-control swaps the renderer's `window.close()` for a
    // browser-process `win.close()`, which DOES raise the event. [4b] must go
    // red on that run, or it is a row that cannot tell the two apart and its
    // green means nothing.
    if (PLANT === 'wclose-control') {
      note('PLANT', 'wclose-control — §4 closes from the MAIN process instead of calling '
        + 'window.close() in the renderer. A close event IS raised on that path, so [4b] MUST go RED.');
      s.M.evalExpr("(() => { const { BrowserWindow } = require('electron');"
        + ' const w = BrowserWindow.getAllWindows()[0]; if (w) w.close(); return 1; })()').catch(() => {});
    } else {
      // Fire-and-forget: the page is about to go, so the evaluate reply may never
      // come back. That is expected and is not the measurement.
      s.R.send('Runtime.evaluate', { expression: 'setTimeout(() => window.close(), 0)' }).catch(() => {});
    }
    const t0 = Date.now();
    let t = null;
    while (Date.now() - t0 < 8000) {
      t = readTrace(s.trace);
      if ((t ?? []).some((r) => r.k === 'closed')) break;
      await sleep(150);
    }
    console.log(`TRACE      ${briefTrace(t)}`);
    const closed = (t ?? []).some((r) => r.k === 'closed');
    check('4a', 'SAME-RUN CONTROL: the probe was installed and its listeners really fire — the '
      + '`closed` listener, registered in the same evaluate call as the `close` listener, recorded '
      + 'the window going',
      (t ?? []).some((r) => r.k === 'installed') && closed,
      `records: ${briefTrace(t)}`);
    if (!closed) {
      unmeasurable('4b', 'window.close() raises no BrowserWindow close event',
        'the window never went, so there is nothing to say about what was raised on the way');
    } else {
      check('4b', 'THE PIN: `window.close()` from the renderer destroys the window WITHOUT raising a '
        + 'single BrowserWindow `close` event — anything in Aurora that grows a close button of its '
        + 'own and calls window.close() walks straight past this guard',
        closesOf(t).length === 0,
        `${closesOf(t).length} close record(s) between the call and the window going: ${briefTrace(t)}`);
    }
  } finally {
    await teardown(s);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  const t0 = Date.now();
  console.log('=== close-guard witness harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    uptime      : ${(os.uptime() / 3600).toFixed(2)} h   loadavg ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    electron    : ${ELECTRON}`);
  console.log(`    main bundle : ${MAIN}`);
  console.log(`    s1disasm    : ${S1DIR} ${existsSync(S1DIR) ? '(present, OPENED ONLY)' : '(ABSENT)'}`);
  console.log(`    channels    : request='${CH_REQUEST}' response='${CH_RESPONSE}' timeout=${TIMEOUT_MS}ms (read from source)`);
  console.log(`    traces      : ${TRACE_DIR}`);

  try { await sectionClean(); } catch (e) { unmeasurable('1', '§1 clean', `${e.message}`); }
  try { await sectionDirty(); } catch (e) { unmeasurable('2', '§2/§3 dirty', `${e.message}`); }
  try { await sectionWindowClose(); } catch (e) { unmeasurable('4', '§4 window.close pin', `${e.message}`); }

  console.log(`\n=== ${results.length} rows, ${fails.length} failed, `
    + `${((Date.now() - t0) / 1000).toFixed(1)}s (machine uptime ${(os.uptime() / 3600).toFixed(2)} h) ===`);
  if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }
  writeFileSync(join(TRACE_DIR, 'summary.json'),
    JSON.stringify({ rows: results.length, failed: fails.length, results }, null, 2));
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
