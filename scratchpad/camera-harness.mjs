#!/usr/bin/env node
// Step-D camera harness: drive the built (VITE_AURORA_DEBUG=1) app over CDP and
// verify the classic viewport's camera seam, which the node suite cannot see.
//
// Three questions, none answerable from a unit test:
//   1. PUBLISH — does a pan drag reach viewStore at all?
//   2. COALESCE — is the publish once per PAINTED FRAME, or once per mousemove?
//      (the latter is the redraw storm the perf commits removed)
//   3. ADOPT — does an external write to viewStore move the camera and repaint?
//
// Draw counting works by patching CanvasRenderingContext2D.setTransform, which
// the render effect calls exactly once per compose.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = 9338;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const ROOT = AURORA_DIR;

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

async function main() {
  const electron = spawnGuarded(`${ROOT}/node_modules/.bin/electron`, [`${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', AURORA_PERF: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  electron.stdout.on('data', (d) => process.stdout.write(`[main] ${d}`));
  electron.stderr.on('data', () => {});

  try {
    const c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 40; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"')) break;
      await sleep(250);
    }
    if (!(await c.evalExpr('typeof window.__dbg === "object"'))) throw new Error('__dbg not installed');

    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await c.evalExpr('window.__dbg.openAct("ghz", 1)');
    await sleep(1200);
    const lvl = await c.evalExpr('window.__dbg.levelState()');
    if (lvl.status !== 'ready') throw new Error(`act not ready: ${lvl.status}`);

    // Draw counter: the render effect calls setTransform(1,0,0,1,0,0) once per
    // compose, so counting those counts composes.
    await c.evalExpr(`
      (() => {
        const proto = CanvasRenderingContext2D.prototype;
        if (!proto.__origSetTransform) {
          proto.__origSetTransform = proto.setTransform;
          window.__draws = 0;
          proto.setTransform = function (...a) { window.__draws++; return proto.__origSetTransform.apply(this, a); };
        }
        window.__draws = 0;
      })()
    `);

    const rect = await c.evalExpr(`
      (() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
               return { x: r.x, y: r.y, w: r.width, h: r.height }; })()
    `);
    const cx = Math.round(rect.x + rect.w / 2);
    const cy = Math.round(rect.y + rect.h / 2);

    const before = await c.evalExpr('window.__dbg.view()');

    // --- 1 + 2: pan drag with MANY mousemoves -----------------------------
    const MOVES = 120;
    await c.evalExpr('window.__draws = 0');
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', buttons: 1, clickCount: 1 });
    // Fire the moves as a BURST — do not await each round trip. Awaiting one CDP
    // reply per move spaces them milliseconds apart, which lets a frame fire
    // between every pair and makes even a perfectly coalesced viewport look like
    // one draw per move. A real high-poll mouse delivers many events per frame,
    // and that is what this has to reproduce for the count to mean anything.
    const moves = [];
    for (let i = 0; i < MOVES; i++) {
      moves.push(c.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: cx - i, y: cy - Math.floor(i / 2), button: 'left', buttons: 1,
      }));
    }
    await Promise.all(moves);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx - MOVES, y: cy - MOVES / 2, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(400);
    const draws = await c.evalExpr('window.__draws');
    const after = await c.evalExpr('window.__dbg.view()');

    check('publish: a pan drag reaches viewStore',
      after.x !== before.x || after.y !== before.y,
      `view ${before.x.toFixed(1)},${before.y.toFixed(1)} → ${after.x.toFixed(1)},${after.y.toFixed(1)}`);

    check('coalesce: draws are per-frame, not per-mousemove',
      draws < MOVES / 2,
      `${draws} draws for ${MOVES} mousemoves`);

    // --- 3: external write is adopted -------------------------------------
    await c.evalExpr('window.__draws = 0');
    await c.evalExpr('window.__dbg.setView(1234, 567, 2)');
    await sleep(300);
    const adoptDraws = await c.evalExpr('window.__draws');
    const adopted = await c.evalExpr('window.__dbg.view()');
    check('adopt: an external setViewport repaints the viewport',
      adoptDraws > 0, `${adoptDraws} draws`);
    check('adopt: the external value survives (no echo fight)',
      Math.round(adopted.x) === 1234 && Math.round(adopted.y) === 567 && adopted.zoom === 2,
      JSON.stringify(adopted));

    // A settled camera must not keep publishing — a feedback loop between the
    // rAF push and the adopt-subscription would show up as endless draws.
    await c.evalExpr('window.__draws = 0');
    await sleep(600);
    const idleDraws = await c.evalExpr('window.__draws');
    check('no feedback loop: an idle viewport stops drawing', idleDraws === 0, `${idleDraws} draws while idle`);

    c.close();
  } finally {
    electron.kill('SIGKILL');
  }
  console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
