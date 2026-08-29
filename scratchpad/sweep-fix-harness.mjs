#!/usr/bin/env node
// Runtime verification for the 2026-08-16 lens-sweep fixes that live in .tsx —
// the half the node suite cannot execute, and the half the packet had ZERO rows
// for on aeon.
//
// Rows: R9 (a drag released OUTSIDE the viewport still commits), R10 (a BG
// stroke is one undo step and Ctrl+Z reverts THAT), U1 (an FG paint drag is one
// undo step, not one per cell), R14 (Ctrl+B / Ctrl+K no longer arm a map tool),
// R5 (the window asks before taking unsaved work).
//
// Launch discipline copied from canvas-cdp-harness.mjs: detached xvfb-run +
// electron, port verified free before and after, process group killed. Every
// mutation below goes through real pointer/keyboard events on the real canvas;
// `window.__dbg.aeon.*` is read-only apart from the two SETUP calls it documents
// (open a project, choose a plane), exactly as the classic probe's are.
//
// IT NEVER SAVES. Ctrl+S is never dispatched and the teardown answers the close
// prompt with Discard, so /home/volence/sonic_hacks/aeon is not written to — the
// run asserts that at the end by comparing the act data dir's mtimes.

import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { readdirSync, statSync } from 'node:fs';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9377);
const ROOT = '/home/volence/sonic_hacks/aurora';
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const AEON = '/home/volence/sonic_hacks/aeon';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (ch) => (d += ch));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function portFree() { try { await getJSON('/json/version'); return false; } catch { return true; } }
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  // The R5 row closes the page on purpose, so the socket WILL drop mid-run.
  // Without these the raw 'error' event is unhandled and takes the process with
  // it — the harness would report nothing rather than the row it was proving.
  ws.addEventListener('error', () => {});
  ws.addEventListener('close', () => { for (const [, fn] of pending) fn({ error: { message: 'socket closed' } }); pending.clear(); });
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
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, detail });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  results.push({ id, name, ok: null, detail });
}

// ---------------------------------------------------------------------------
// Page-side helpers. Real events only: every gesture below is the same event
// sequence a mouse produces, dispatched at real client coordinates.
// ---------------------------------------------------------------------------
const INSTALL = String.raw`
(() => {
  const H = {};
  H.canvas = () => document.getElementById('map-canvas');
  H.box = () => { const c = H.canvas(); return c ? c.getBoundingClientRect() : null; };
  const ev = (el, type, x, y, extra = {}) => el.dispatchEvent(new MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : 1, ...extra,
  }));
  H.down = (x, y) => ev(H.canvas(), 'mousedown', x, y);
  H.move = (x, y) => ev(H.canvas(), 'mousemove', x, y);
  H.up = (x, y) => ev(H.canvas(), 'mouseup', x, y);
  /** Leave the viewport the way a cursor does — the event the fix stopped
   *  treating as a cancel. */
  H.leave = (x, y) => ev(H.canvas(), 'mouseleave', x, y);
  /** A release that happens somewhere else entirely: dispatched on WINDOW, which
   *  is where the browser sends it when the button comes up off-element. */
  H.upOutside = () => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 4, clientY: 4, button: 0, buttons: 0 }));

  H.key = (key, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
  H.ctrlZ = () => H.key('z', { ctrlKey: true });

  /**
   * SNAPSHOT AND COMPARE PAGE-SIDE. A section nametable is 256x256 = 65,536
   * entries and the act is a 3x3 grid, so a snapshot is ~590k numbers — far too
   * much to ship over CDP per row, and reading a convenient PREFIX of it is
   * worse than useless: the first version of this harness compared the first
   * 2,048 entries (the top eight rows) while every gesture landed mid-section,
   * and reported "0 cells changed" for paints that were working perfectly.
   * These keep the arrays in the page and return only counts.
   */
  H.SECS = 9;
  H.NT = 256 * 256;
  H.snapshot = (key) => {
    const out = [];
    for (let s = 0; s < H.SECS; s++) {
      const a = new Int32Array(H.NT);
      for (let i = 0; i < H.NT; i++) a[i] = window.__dbg.aeon.ntAt(s, i) ?? -1;
      out.push(a);
    }
    window['__snap_' + key] = out;
    return H.SECS * H.NT;
  };
  /** { n, first } — how many entries differ from the named snapshot, and where. */
  H.changedSince = (key) => {
    const prev = window['__snap_' + key];
    if (!prev) return null;
    let n = 0, first = null;
    for (let s = 0; s < prev.length; s++) {
      for (let i = 0; i < prev[s].length; i++) {
        const now = window.__dbg.aeon.ntAt(s, i) ?? -1;
        if (now !== prev[s][i]) { n++; if (!first) first = { s, i, was: prev[s][i], now }; }
      }
    }
    return { n, first };
  };
  H.bgSnapshot = (key) => {
    const a = [];
    for (let i = 0; i < 64 * 64; i++) a.push(window.__dbg.aeon.bgAt(i));
    window['__bg_' + key] = a;
    return a.filter((v) => v !== null).length;
  };
  H.bgChangedSince = (key) => {
    const prev = window['__bg_' + key];
    if (!prev) return null;
    let n = 0;
    for (let i = 0; i < prev.length; i++) if (window.__dbg.aeon.bgAt(i) !== prev[i]) n++;
    return n;
  };
  H.diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };

  /** A confirm dialog's button, by label. */
  H.confirmButton = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
  window.__h = H;
  return true;
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target — a previous Electron is alive.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  const dataMtimes = () => {
    const out = {};
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p); else out[p] = statSync(p).mtimeMs;
      }
    };
    walk(`${AEON}/games/sonic4/data`);
    return out;
  };
  const before = dataMtimes();

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object" && typeof window.__dbg.aeon === "object"').catch(() => false)) break;
      await sleep(300);
    }
    if (!(await c.evalExpr('typeof window.__dbg?.aeon === "object"'))) {
      throw new Error('__dbg.aeon never installed — was the build made with VITE_AURORA_DEBUG=1?');
    }
    await c.evalExpr(INSTALL);

    // --- setup: open the aeon project and land on a level tab ---------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON)})`);
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) break;
      await sleep(400);
    }
    check('setup', 'the aeon project opens and a section is resident', !!st?.open && st.sections > 0, JSON.stringify(st));
    if (!st?.open) throw new Error('aeon project never opened');

    for (let i = 0; i < 40; i++) {
      if (await c.evalExpr('!!window.__h.canvas()')) break;
      await sleep(400);
    }
    const boxed = await c.json('window.__h.box()');
    check('setup', 'the map canvas is on screen', !!boxed && boxed.width > 200, JSON.stringify(boxed));

    const SEC_TOTAL = 9 * 256 * 256;

    // --- R14: a modified key is somebody else's chord -----------------------
    await c.evalExpr(`window.__h.key('t')`);           // arm paint-tile plainly
    await sleep(150);
    const toolAfterPlain = (await c.json('window.__dbg.aeon.state()')).tool;
    check('R14a', 'a plain letter still arms its tool', toolAfterPlain === 'paint-tile', toolAfterPlain);

    await c.evalExpr(`window.__h.key('b', { ctrlKey: true })`);
    await sleep(200);
    const toolAfterCtrlB = (await c.json('window.__dbg.aeon.state()')).tool;
    check('R14b', 'Ctrl+B does NOT arm paint-block behind the Explorer toggle',
      toolAfterCtrlB === 'paint-tile', `tool is ${toolAfterCtrlB}`);

    await c.evalExpr(`window.__h.key('k', { ctrlKey: true })`);
    await sleep(200);
    const toolAfterCtrlK = (await c.json('window.__dbg.aeon.state()')).tool;
    check('R14c', 'Ctrl+K does NOT arm stamp-chunk behind the palette',
      toolAfterCtrlK === 'paint-tile', `tool is ${toolAfterCtrlK}`);
    await c.evalExpr(`window.__h.key('Escape')`);
    await sleep(250);

    // --- U1: an FG paint drag is ONE undo step ------------------------------
    await c.evalExpr(`window.__dbg.aeon.setLayer('fg')`);
    await c.evalExpr(`window.__h.key('t')`);
    await sleep(150);
    const snapped = await c.evalExpr(`window.__h.snapshot('u1')`);
    check('setup', 'the whole act nametable is under measurement', snapped === SEC_TOTAL, `${snapped} entries`);

    const b = await c.json('window.__h.box()');
    const y = Math.round(b.top + b.height * 0.5);
    const x0 = Math.round(b.left + b.width * 0.25);
    await c.evalExpr(`window.__h.down(${x0}, ${y})`);
    for (let i = 1; i <= 12; i++) {
      await c.evalExpr(`window.__h.move(${x0 + i * 9}, ${y})`);
      await sleep(25);
    }
    await c.evalExpr(`window.__h.up(${x0 + 12 * 9}, ${y})`);
    await sleep(350);
    const painted = await c.json(`window.__h.changedSince('u1')`);
    check('U1a', 'the drag painted several cells', painted.n > 1,
      `${painted.n} cells changed, first ${JSON.stringify(painted.first)}`);

    await c.evalExpr('window.__h.ctrlZ()');
    await sleep(400);
    const afterOneUndo = await c.json(`window.__h.changedSince('u1')`);
    check('U1b', 'ONE Ctrl+Z reverts the WHOLE drag (one gesture, one step)',
      painted.n > 1 && afterOneUndo.n === 0, `${afterOneUndo.n} cells still differ after one undo`);
    const undoDrained = await c.evalExpr('window.__dbg.aeon.canUndo()');
    check('U1c', 'and the stack is empty after that one undo — not 12 entries deep',
      undoDrained === false, `canUndo=${undoDrained}`);

    // --- R9: a release OUTSIDE the viewport still commits -------------------
    await c.evalExpr(`window.__h.snapshot('r9')`);
    const x1 = Math.round(b.left + b.width * 0.6);
    const y1 = Math.round(b.top + b.height * 0.35);
    await c.evalExpr(`window.__h.down(${x1}, ${y1})`);
    for (let i = 1; i <= 6; i++) {
      await c.evalExpr(`window.__h.move(${x1 + i * 9}, ${y1})`);
      await sleep(25);
    }
    await c.evalExpr(`window.__h.leave(${x1 + 60}, ${y1})`); // the cursor crosses the edge
    await sleep(120);
    await c.evalExpr('window.__h.upOutside()');             // the button comes up elsewhere
    await sleep(400);
    const outside = await c.json(`window.__h.changedSince('r9')`);
    const dirtyState = await c.json('window.__dbg.aeon.state()');
    const canUndo = await c.evalExpr('window.__dbg.aeon.canUndo()');
    check('R9a', 'a gesture released outside the viewport still landed', outside.n > 0,
      `${outside.n} cells changed`);
    check('R9b', 'and it is on the undo stack and flagged dirty (not a silent mutation)',
      canUndo === true && dirtyState.dirty === true,
      `canUndo=${canUndo} dirty=${dirtyState.dirty} dirtyActs=${JSON.stringify(dirtyState.dirtyActs)}`);
    await c.evalExpr('window.__h.ctrlZ()');
    await sleep(400);
    const outsideUndone = await c.json(`window.__h.changedSince('r9')`);
    check('R9c', 'one Ctrl+Z reverts it — the outside release committed ONE step',
      outsideUndone.n === 0, `${outsideUndone.n} still differ`);

    // --- R10: a BG stroke is a command of its own ---------------------------
    const bgProbe = await c.evalExpr('window.__dbg.aeon.bgAt(0)');
    if (bgProbe === null) {
      note('R10', 'skipped: this act has no background plane the paint path would touch');
    } else {
      // An FG edit FIRST, so "Ctrl+Z reverted an unrelated edit" — the exact
      // pre-fix symptom — has something to revert.
      await c.evalExpr(`window.__dbg.aeon.setLayer('fg')`);
      await c.evalExpr(`window.__h.snapshot('fgmark')`);
      const x2 = Math.round(b.left + b.width * 0.35);
      const y2 = Math.round(b.top + b.height * 0.7);
      await c.evalExpr(`window.__dbg.setView(0, 0, 1)`);
      await sleep(250);
      await c.evalExpr(`window.__h.down(${x2}, ${y2})`);
      await c.evalExpr(`window.__h.up(${x2}, ${y2})`);
      await sleep(300);
      const fgTouched = (await c.json(`window.__h.changedSince('fgmark')`)).n;
      check('R10-pre', 'the FG edit that must SURVIVE the BG undo landed', fgTouched > 0, `${fgTouched} cells`);

      await c.evalExpr(`window.__dbg.aeon.setLayer('bg')`);
      // PARK THE CAMERA ON THE ORIGIN FIRST. The background plane is 64 tiles —
      // 512px — wide, while the act's section grid is thousands of pixels
      // across, so a click at the middle of the viewport is nowhere near it and
      // `worldToBgTile` correctly answers null. That is not the BG paint
      // failing; it is the harness aiming off the plane.
      await c.evalExpr(`window.__dbg.setView(0, 0, 1)`);
      await sleep(300);
      await c.evalExpr(`window.__h.bgSnapshot('r10')`);
      const x3 = Math.round(b.left + 30);
      const y3 = Math.round(b.top + 30);
      await c.evalExpr(`window.__h.down(${x3}, ${y3})`);
      for (let i = 1; i <= 8; i++) {
        await c.evalExpr(`window.__h.move(${x3 + i * 9}, ${y3})`);
        await sleep(25);
      }
      await c.evalExpr(`window.__h.up(${x3 + 72}, ${y3})`);
      await sleep(400);
      const bgPainted = await c.evalExpr(`window.__h.bgChangedSince('r10')`);
      check('R10a', 'the BG stroke painted', bgPainted > 0, `${bgPainted} bg tiles changed`);

      await c.evalExpr('window.__h.ctrlZ()');
      await sleep(450);
      const bgStill = await c.evalExpr(`window.__h.bgChangedSince('r10')`);
      const fgStill = (await c.json(`window.__h.changedSince('fgmark')`)).n;
      check('R10b', 'Ctrl+Z reverts the BG STROKE, in one step', bgPainted > 0 && bgStill === 0,
        `${bgStill} bg tiles still differ`);
      check('R10c', 'and it did NOT revert the unrelated FG edit instead (the pre-fix symptom)',
        fgTouched > 0 && fgStill === fgTouched,
        `fg cells changed before the BG undo: ${fgTouched}, after: ${fgStill}`);
      await c.evalExpr(`window.__dbg.aeon.setLayer('fg')`);
    }

    // --- R5: what this environment CAN and CANNOT prove ---------------------
    //
    // The renderer half is asserted here; the main half is not, and saying so
    // is the point. `window.close()` — the only close a CDP session can reach —
    // does NOT raise the BrowserWindow 'close' event at all: Electron routes it
    // through webContents.close(). Measured, not assumed: a trace written from
    // inside the main-process handler to a FILE (its stdout dies with the
    // process) never appeared, while the window went. The paths a user actually
    // has — title bar, the default menu's Ctrl+W close role, app quit — close
    // from the browser process and do raise it, and this box has no xdotool or
    // wmctrl to drive any of them.
    //
    // So: the guard's decision function is covered by close-guard.test.ts (6
    // cases) and its shared dirty snapshot is exercised below through the twin
    // door that IS reachable. The interception itself stays unverified at
    // runtime, and is marked as such rather than reported green.
    const dirtyNow = (await c.json('window.__dbg.aeon.state()')).dirty;
    check('R5a', 'there is unsaved work for a guard to defend', dirtyNow === true);

    // The project-open guard reads the SAME snapshot confirmAppClose reads, and
    // its dialog is the same three-button ask. If this asks, the close guard
    // asks — the two differ only in wording.
    // Deliberately NOT awaited: the guard's promise settles only when the user
    // answers, and `awaitPromise` on it would hang the harness on its own
    // dialog. Fire it, park the verdict on `window`, and read that.
    await c.evalExpr(`(() => { window.__guard = 'pending'; window.__dbg.canvas.projectOpenGuard().then((v) => { window.__guard = v; }); return 'started'; })()`);
    await sleep(900);
    const askedDialog = await c.evalExpr(
      `[...document.querySelectorAll('*')].some((e) => e.children.length === 0 && /Unsaved changes/.test(e.textContent))`);
    const guardVerdict = await c.evalExpr('window.__guard');
    check('R5b', 'the shared dirty snapshot sees the aeon work and ASKS rather than proceeding',
      askedDialog === true && guardVerdict === 'pending',
      `dialogShown=${askedDialog} guard=${JSON.stringify(guardVerdict)} (pending = still waiting on the user)`);

    const cancelled = await c.evalExpr(
      `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Cancel'); if (b) { b.click(); return true; } return false; })()`);
    await sleep(400);
    check('R5c', 'Cancel resolves it false and leaves the work alone',
      cancelled === true && (await c.evalExpr('window.__guard')) === false
        && (await c.json('window.__dbg.aeon.state()')).dirty === true);

    note('R5d', 'NOT verified at runtime: the main-process close interception',
      'window.close() bypasses the BrowserWindow close event (measured); no WM tooling here to drive a real one');

  } finally {
    try { if (c) c.close(); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
  }

  // --- the project on disk must be untouched --------------------------------
  const after = dataMtimes();
  const touched = Object.keys(after).filter((p) => before[p] !== after[p]);
  check('safety', 'the run wrote NOTHING to the aeon project', touched.length === 0,
    touched.length ? touched.slice(0, 5).join(', ') : 'no data file mtime moved');

  console.log(`\n${fails.length === 0 ? 'ALL ROWS PASS' : `${fails.length} FAILING: ${fails.join(', ')}`}`);
  if (!(await portFree())) console.log('WARNING: the debug port is still served — an Electron survived.');
  // exitCode, NOT process.exit(): stdout is fully buffered when it is a pipe or
  // a file, and exiting synchronously DISCARDS whatever has not flushed — which
  // silently truncated this report at whatever row was mid-write.
  process.exitCode = fails.length === 0 ? 0 : 1;
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exitCode = 2; });
