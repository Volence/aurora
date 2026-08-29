#!/usr/bin/env node
// Step-D per-tab viewport restore, verified against the real app.
//
// The store test proves tab-activation writes/reads the record. What it CANNOT
// see is the interaction this feature actually lives or dies on: the viewport's
// fit-to-height effect runs when the act goes ready, a moment AFTER the restore
// wrote viewStore, and would happily overwrite it. Only a real load ordering
// shows whether the fit's "defer to a remembered viewport" guard holds.

import { spawn } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = 9340;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const ROOT = '/home/volence/sonic_hacks/aurora';

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

const near = (a, b, eps = 1) => Math.abs(a - b) <= eps;

async function main() {
  const electron = spawnGuarded(`${ROOT}/node_modules/.bin/electron`, [`${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' },
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
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);

    // Drive real tab activations, which is what carries the snapshot/restore —
    // calling openAct directly would bypass the whole feature.
    const activate = async (zone, act) => {
      await c.evalExpr(`window.__dbg.activate(${JSON.stringify(zone)}, ${act})`);
      await sleep(900);
    };

    await activate('ghz', 1);
    const fitted = await c.evalExpr('window.__dbg.view()');
    check('first open of an act still fits to height (no remembered viewport)',
      fitted.x === 0 && fitted.y === 0 && fitted.zoom > 0 && fitted.zoom <= 2,
      JSON.stringify(fitted));

    // Move the camera somewhere distinctive, then leave and come back.
    await c.evalExpr('window.__dbg.setView(640, 320, 1.5)');
    await sleep(200);
    const parked = await c.evalExpr('window.__dbg.view()');

    await activate('mz', 2);
    const other = await c.evalExpr('window.__dbg.view()');
    check('switching to a never-visited act fits it rather than inheriting',
      other.x === 0 && other.y === 0,
      JSON.stringify(other));

    await activate('ghz', 1);
    const restored = await c.evalExpr('window.__dbg.view()');
    check('returning to an act restores the camera it was left at',
      near(restored.x, parked.x) && near(restored.y, parked.y) && near(restored.zoom, parked.zoom, 0.01),
      `left ${JSON.stringify(parked)} → came back to ${JSON.stringify(restored)}`);

    const lvl = await c.evalExpr('window.__dbg.levelState()');
    check('the act actually loaded (the restore did not stall activation)',
      lvl.status === 'ready' && lvl.zone === 'ghz', JSON.stringify(lvl));

    c.close();
  } finally {
    electron.kill('SIGKILL');
  }
  console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error('ERROR:', e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
