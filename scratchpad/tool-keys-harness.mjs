#!/usr/bin/env node
// UX-A3 VERIFICATION: do the canvas tool keys actually work in the RUNNING app?
//
// The unit tests prove the mapping and the source guards prove the wiring, but
// neither presses a key. This drives the BUILT (VITE_AURORA_DEBUG=1) app under
// xvfb over CDP and dispatches REAL key events — `Input.dispatchKeyEvent`, the
// same route the sweep-fix harness used, not a synthetic `new KeyboardEvent`.
//
// Launch/teardown discipline copied from scratchpad/canvas-cdp-harness.mjs:
// detached `xvfb-run` + `electron`, verify the debug port is free before AND
// after, `window.close()` before the signal so Chromium flushes localStorage,
// kill the process group.
//
// The tool is read back through `window.__dbg.canvas.tool()`, which is
// read-only; every change of tool in this file comes from a key press.
//
// NEGATIVE CONTROLS ARE ROWS, not commentary: a modified key and a key typed
// into a text field must BOTH leave the tool alone, and an unbound letter must
// do nothing. Those three are how we know the passes above are not just "the
// tool happened to already be that".

import { AURORA_ROOT, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9371);
const ROOT = AURORA_ROOT;
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = siblingPathOrUnresolved('s1disasm');

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

const INSTALL = String.raw`
(() => {
  const H = {};
  const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  H.dlg = () => document.querySelector('[role="dialog"][aria-label="New Canvas"]');
  H.dlgOpen = () => H.dlg() !== null;
  H.dlgName = () => { const d = H.dlg(); return d ? d.querySelector('input:not([type=number])') : null; };
  H.dlgButtons = () => { const d = H.dlg(); return d ? [...d.querySelectorAll('button')] : []; };
  H.dlgCreate = () => H.dlgButtons().find((b) => b.textContent.trim().startsWith('Create'));
  H.dlgNums = () => { const d = H.dlg(); return d ? [...d.querySelectorAll('input[type=number]')] : []; };
  H.dlgSnapshot = () => {
    const d = H.dlg(); if (!d) return null;
    const cr = H.dlgCreate();
    return {
      name: H.dlgName() ? H.dlgName().value : null,
      nums: H.dlgNums().map((n) => n.value),
      buttons: H.dlgButtons().map((b) => b.textContent.trim()),
      createDisabled: cr ? cr.disabled : null,
      text: d.textContent.slice(0, 400),
    };
  };
  H.paletteInput = () => [...document.querySelectorAll('input')].find(
    (i) => i.placeholder && /command|search|type/i.test(i.placeholder) && vis(i));
  // Any visible text field on the canvas screen — the doc name / grid origin
  // fields. Used as the typing negative control.
  H.textField = () => [...document.querySelectorAll('input')].find((i) => vis(i));
  H.activeTag = () => (document.activeElement ? document.activeElement.tagName : null);
  window.__c = H;
  return Object.keys(H).length;
})()`;

async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
/** A plain letter, as a real key press. `modifiers`: 2 = ctrl, 8 = shift. */
const letter = (c, ch, modifiers = 0) =>
  key(c, ch, `Key${ch.toUpperCase()}`, ch.toUpperCase().charCodeAt(0), modifiers);
const ctrlK = (c) => key(c, 'k', 'KeyK', 75, 2);
const escape = (c) => key(c, 'Escape', 'Escape', 27, 0);
async function enter(c) {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', unmodifiedText: '\r', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', unmodifiedText: '\r', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function typeText(c, text) { await c.send('Input.insertText', { text }); await sleep(60); }
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  if (!r) return false;
  await mouse(c, 'mousePressed', r.x, r.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', r.x, r.y, { buttons: 0 });
  await sleep(200);
  return true;
}

const tool = (c) => c.evalExpr('window.__dbg.canvas.tool()');

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target — a previous Electron is alive.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    let dbgOk = false;
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg?.canvas === "object"').catch(() => false)) { dbgOk = true; break; }
      await sleep(300);
    }
    if (!dbgOk) throw new Error('__dbg.canvas never installed — was the build made with VITE_AURORA_DEBUG=1?');
    await c.evalExpr(INSTALL);

    // --- setup: open the project, then a canvas document -------------------
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = null;
    for (let i = 0; i < 40; i++) {
      proj = await c.json('window.__dbg.projStatus()');
      if (proj.status === 'ready' || proj.zones > 0) break;
      await sleep(400);
    }
    check('setup-1', 'the s1disasm project opens', !!proj && proj.zones > 0, JSON.stringify(proj));

    let opened = false;
    for (let i = 0; i < 3 && !opened; i++) {
      await escape(c); await sleep(250);
      await ctrlK(c); await sleep(600);
      await c.evalExpr(INSTALL);
      if (await c.evalExpr('window.__c.paletteInput() !== null')) {
        await typeText(c, 'New Canvas');
        await sleep(450);
        await enter(c);
        await sleep(700);
      }
      await c.evalExpr(INSTALL);
      opened = await c.evalExpr('window.__c.dlgOpen()');
    }
    check('setup-2', 'the New Canvas dialog opens from Ctrl+K', opened === true);
    if (!opened) throw new Error('no dialog — cannot reach a canvas document');

    // The dialog needs a name typed into it; Create is disabled until then.
    await clickEl(c, 'window.__c.dlgName()');
    await typeText(c, 'toolkeys');
    await sleep(300);
    await c.evalExpr(INSTALL);
    console.log('        dialog before Create:', JSON.stringify(await c.json('window.__c.dlgSnapshot()')));
    await clickEl(c, 'window.__c.dlgCreate()');
    let docs = [];
    for (let i = 0; i < 40; i++) {
      docs = await c.json('window.__dbg.canvas.docIds()');
      if (docs.length > 0) break;
      await sleep(400);
    }
    check('setup-3', 'a canvas document is open (CanvasMode is mounted)', docs.length > 0, `docIds=${JSON.stringify(docs)}`);
    if (!docs.length) throw new Error('no canvas document');
    await c.evalExpr(INSTALL);

    // --- 1: every tool key arms its tool -----------------------------------
    const TABLE = [
      ['b', 'pencil'], ['e', 'eraser'], ['g', 'fill'], ['i', 'eyedropper'],
      ['l', 'line'], ['u', 'rect'], ['m', 'select'], ['d', 'dither'],
    ];
    const wrong = [];
    for (const [k, want] of TABLE) {
      await letter(c, k);
      await sleep(180);
      const got = await tool(c);
      if (got !== want) wrong.push(`${k} → ${got} (want ${want})`);
    }
    check('1', 'all eight tool keys arm their tool in the running app',
      wrong.length === 0, wrong.length ? wrong.join('; ') : '8/8');

    // --- 2: an unbound letter changes nothing ------------------------------
    await letter(c, 'b'); await sleep(180);
    const beforeQ = await tool(c);
    await letter(c, 'q'); await sleep(180);
    const afterQ = await tool(c);
    check('2', 'an unbound letter (q) leaves the tool alone',
      beforeQ === 'pencil' && afterQ === 'pencil', `${beforeQ} → ${afterQ}`);

    // --- 3: a modified key belongs to somebody else ------------------------
    // Ctrl+E is the exact shape of the bug: the eraser armed silently under a
    // shortcut the app or the OS owns.
    await letter(c, 'e', 2);   // ctrl
    await sleep(220);
    const afterCtrlE = await tool(c);
    check('3', 'Ctrl+E does NOT arm the eraser', afterCtrlE === 'pencil', `tool is ${afterCtrlE}`);
    await escape(c); await sleep(250);

    // --- 4: typing a name is not tool selection ----------------------------
    const focused = await clickEl(c, 'window.__c.textField()');
    const activeTag = await c.evalExpr('window.__c.activeTag()');
    await typeText(c, 'e');
    await sleep(220);
    const afterTyping = await tool(c);
    check('4', 'typing "e" into a text field does not arm the eraser',
      focused && activeTag === 'INPUT' && afterTyping === 'pencil',
      `focused=${focused} active=${activeTag} tool=${afterTyping}`);

    // --- 5: the harness can actually see a change (anti-vacuous) -----------
    // If tool() were pinned or the key route dead, rows 2-4 would pass for the
    // wrong reason. This proves a change is still observable at the end.
    //
    // BLUR FIRST. The first run of this row pressed 'm' with focus still in row
    // 4's text field and read back `pencil` — which is row 4 passing again, not
    // this row failing. Escape does not blur an <input>; nothing in the app
    // should make it.
    await c.evalExpr('document.activeElement && document.activeElement.blur()');
    await sleep(200);
    await letter(c, 'm'); await sleep(200);
    const finalTool = await tool(c);
    check('5', 'the probe still observes a real change after the negatives',
      finalTool === 'select', `tool is ${finalTool}`);
  } finally {
    if (c) {
      // CLOSE THE TAB, not just the files. Deleting the document on disk while
      // its tab is still in the stored session leaves the NEXT launch parked on
      // the inert "this canvas could not be loaded" pane — the app behaving
      // correctly about a mess this harness made. (That cost a later run three
      // restarts before the cause was obvious.) Nothing here is dirty, so the
      // close is silent.
      try {
        await c.evalExpr(`(() => {
          const tab = [...document.querySelectorAll('*')].find((e) => /Canvas · toolkeys/.test(e.textContent || '')
            && e.querySelector && e.querySelector('[aria-label*="Close"], [title*="Close"]'));
          const x = tab && tab.querySelector('[aria-label*="Close"], [title*="Close"]');
          if (x) { x.click(); return true; }
          return false;
        })()`);
        await sleep(600);
      } catch { /* the window may already be going away */ }
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* target dies mid-call */ }
      await sleep(3000);
      try { c.close(); } catch { /* */ }
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
    // THE RUN OWNS WHAT IT CREATED. Setup makes a real canvas document in the
    // real project, so it removes exactly those two files — by the name it
    // typed, never a glob — and leaves every other canvas in place.
    for (const f of [`${S1DIR}/.aurora/canvas/toolkeys.canvas.json`, `${S1DIR}/.aurora/canvas/toolkeys.png`]) {
      try { rmSync(f); console.log(`cleaned ${f}`); } catch { /* never created */ }
    }
    await sleep(1200);
    console.log(`\nport free after teardown: ${await portFree()}`);
  }

  const passed = results.filter((r) => r.ok === true).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log(`FAILED: ${fails.join(', ')}`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
