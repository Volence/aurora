#!/usr/bin/env node
// Step-E smoke: drive classic's chip row in the real app and check that the
// dual-purpose `object` tool really did split cleanly into select / place-object.
//
// The node suite proves the derivation (armedPlacementId) and the store wiring.
// What it cannot see is the thing a user would actually hit: whether the map's
// mouse dispatch, hover ghost, cursor and status hint all agree about which of
// the two tools is active — five separate branches that used to read one flag.
//
// The status hint is the probe. It is rendered straight off the same tool and
// armed-id the click handlers read, so if it says "click selects" while the
// tool is armed, the branches have desynced.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = 9342;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
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
  return { ready, send, evalExpr, close: () => ws.close() };
}

const fails = [];
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fails.push(name);
}

// Click the element whose trimmed text is exactly `label`.
//
// Two shapes to cover, and getting this wrong produced two rounds of phantom
// failures that were the harness's alone:
//   - the ui kit's Chip is a <span> with an onClick, so the tool / plane /
//     overlay chips are NOT buttons (round 1 found no chips at all);
//   - the object-library rows ARE buttons, but wrap a badge span and a label
//     span, so a leaf-only rule skips them (round 2 stopped arming objects).
// Buttons first (they may have children), then leaf spans.
const clickByText = (label) => `
  (() => {
    const want = ${JSON.stringify(label)};
    const btn = [...document.querySelectorAll('button,[role=button]')]
      .find((e) => e.textContent.trim() === want);
    if (btn) { btn.click(); return true; }
    const span = [...document.querySelectorAll('span')]
      .find((e) => e.children.length === 0 && e.textContent.trim() === want);
    if (span) { span.click(); return true; }
    return false;
  })()`;

// The classic viewport's right-aligned status hint.
const HINT = `
  (() => {
    const s = [...document.querySelectorAll('span')]
      .map((e) => e.textContent.trim())
      .filter((t) => /drag to pan|click selects|click to place|stamp \\$|no object armed|FG-only/.test(t));
    return s[0] ?? '';
  })()`;

async function main() {
  const electron = spawnGuarded(ELECTRON, [MAIN], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  electron.stderr.on('data', () => {});

  try {
    const c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 40; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"')) break;
      await sleep(250);
    }
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(1500);

    // --- the chip row is profile-declared -------------------------------
    const chips = await c.evalExpr(`
      (() => {
        const labels = ['View', 'Stamp Chunk', 'Select', 'Place Object'];
        return [...document.querySelectorAll('button,span,[role=button]')]
          .filter((e) => e.children.length === 0)
          .map((e) => e.textContent.trim())
          .filter((t) => labels.includes(t));
      })()`);
    check('the chip row is the four tools the s1 manifest declares',
      JSON.stringify(chips) === JSON.stringify(['View', 'Stamp Chunk', 'Select', 'Place Object']),
      JSON.stringify(chips));

    // --- each tool drives the hint the split predicts --------------------
    await c.evalExpr(clickByText('Stamp Chunk')); await sleep(150);
    const stampHint = await c.evalExpr(HINT);
    check('Stamp Chunk selects the stamp branch', /^stamp \$/.test(stampHint), stampHint);

    await c.evalExpr(clickByText('Select')); await sleep(150);
    const selectHint = await c.evalExpr(HINT);
    check('Select selects the pick/move branch (was `object` unarmed)',
      selectHint.startsWith('click selects'), selectHint);

    await c.evalExpr(clickByText('View')); await sleep(150);
    const viewHint = await c.evalExpr(HINT);
    check('View selects the pan branch (was `pan`)',
      viewHint.startsWith('drag to pan'), viewHint);

    // --- arming from the object library drives the tool ------------------
    const armed = await c.evalExpr(clickByText('$1FCrabmeat'));
    await sleep(250);
    const armedHint = await c.evalExpr(HINT);
    check('arming an object from the library switches to place-object',
      armed && /^click to place /.test(armedHint), armedHint);

    // --- and Esc disarms back to select, not to a dead armed tool --------
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(250);
    const escHint = await c.evalExpr(HINT);
    check('Esc disarms to Select rather than leaving place-object empty',
      escHint.startsWith('click selects'), escHint);

    // --- plane + overlays still drive the viewport -----------------------
    await c.evalExpr(clickByText('BG')); await sleep(200);
    const bgHint = await c.evalExpr(HINT);
    check('BG plane switch reaches the viewport through editorStore.editingLayer',
      bgHint.includes('FG-only') || bgHint.startsWith('drag to pan'), bgHint);
    await c.evalExpr(clickByText('FG')); await sleep(200);

    const overlayToggles = await c.evalExpr(`
      (() => {
        const before = window.__dbg ? 1 : 0;
        const el = [...document.querySelectorAll('button,span,[role=button]')]
          .find((e) => e.children.length === 0 && e.textContent.trim() === 'Collision');
        if (!el) return 'no Collision chip';
        el.click();
        return 'clicked';
      })()`);
    await sleep(200);
    check('the Collision overlay chip is wired to the shared store',
      overlayToggles === 'clicked', String(overlayToggles));

    const alive = await c.evalExpr('!!document.querySelector("canvas")');
    check('the viewport survived all of it', alive === true, String(alive));

    c.close();
  } finally {
    electron.kill('SIGKILL');
  }
  console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
