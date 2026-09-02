#!/usr/bin/env node
// MEASUREMENT PROBE for ROADMAP §5.1 item 17 — no assertions, just numbers.
// Re-measures the object-label overflow in the app's own 2D context, on both
// engines' overlay draw paths, so the fix is designed against real metrics
// rather than a recollected figure.
//
// Requires: VITE_AURORA_DEBUG=1 npm run build
import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
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
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up */ }
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

const MEASURE = String.raw`
(() => {
  const cv = document.getElementById('map-canvas') || document.querySelector('canvas');
  if (!cv) return { error: 'no canvas' };
  const ctx = cv.getContext('2d');
  const out = { canvasId: cv.id, canvas: { w: cv.width, h: cv.height }, dpr: window.devicePixelRatio, fonts: {} };
  const probe = (fontSpec) => {
    ctx.save();
    ctx.font = fontSpec;
    const resolved = ctx.font;
    const m = (s) => { const t = ctx.measureText(s); return { w: t.width, abbL: t.actualBoundingBoxLeft, abbR: t.actualBoundingBoxRight, asc: t.actualBoundingBoxAscent, desc: t.actualBoundingBoxDescent }; };
    const r = {
      resolved,
      M: m('M').w, i: m('i').w, W: m('W').w, space: m(' ').w,
      ellipsis: m('…').w, dot3: m('...').w,
      solid: m('solid'),
      s10: m('0123456789').w,
      names: {},
    };
    for (const n of ['solid', 'ring', 'spring', 'Conveyor Belt Controller', 'Invisible Lava Marker', 'Waterfall Sound Effect', 'Teleporter', 'Fireball Spawner', 'Invisible Block', '$54', 'FF']) r.names[n] = m(n).w;
    ctx.restore();
    return r;
  };
  for (const spec of ['8px monospace', '16px monospace', '32px monospace', '8px sans-serif']) out.fonts[spec] = probe(spec);
  return out;
})()`;

async function main() {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });
  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // ---- aeon ----
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch((e) => console.log('open threw', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) { st = await c.json('window.__dbg.aeon.state()').catch(() => null); if (st && st.open) break; await sleep(400); }
    console.log('AEON state:', JSON.stringify(st));
    console.log('AEON object 0/0:', JSON.stringify(await c.json('window.__dbg.aeon.objectAt(0,0)').catch(() => null)));
    await sleep(2000);
    console.log('AEON view:', JSON.stringify(await c.json('window.__dbg.view()').catch(() => null)));
    const m = await c.json(MEASURE);
    console.log('AEON MEASURE:', JSON.stringify(m, null, 1));

    // ---- classic ----
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`).catch((e) => console.log('openDir threw', e.message));
    for (let i = 0; i < 60; i++) {
      const s = await c.json('window.__dbg.projStatus()').catch(() => null);
      if (s && s.zones > 0) { console.log('S1 projStatus', JSON.stringify(s)); break; }
      await sleep(500);
    }
    // Find an invisible/trigger object somewhere in the game.
    const INVIS = [0x13, 0x49, 0x54, 0x68, 0x71, 0x72];
    const acts = [['GHZ', 1], ['GHZ', 2], ['GHZ', 3], ['MZ', 1], ['MZ', 2], ['MZ', 3], ['SYZ', 1], ['SYZ', 2], ['SYZ', 3], ['LZ', 1], ['LZ', 2], ['LZ', 3], ['SLZ', 1], ['SLZ', 2], ['SLZ', 3], ['SBZ', 1], ['SBZ', 2], ['SBZ', 3]];
    for (const [z, a] of acts) {
      const ok = await c.evalExpr(`window.__dbg.activate(${JSON.stringify(z)}, ${a})`).catch(() => false);
      if (!ok) { console.log(`  ${z}${a}: activate failed`); continue; }
      await sleep(1200);
      const found = [];
      for (const id of INVIS) {
        const list = await c.json(`window.__dbg.listObjects(${id})`).catch(() => []);
        if (list.length) found.push([id.toString(16), list.length]);
      }
      const ls = await c.json('window.__dbg.levelState()').catch(() => null);
      console.log(`  ${z}${a}: state=${JSON.stringify(ls)} invisible=${JSON.stringify(found)}`);
    }
    console.log('S1 view:', JSON.stringify(await c.json('window.__dbg.view()').catch(() => null)));
    console.log('S1 MEASURE (classic canvas):', JSON.stringify(await c.json(MEASURE), null, 1));
    console.log('S1 canvases:', await c.json(`[...document.querySelectorAll('canvas')].map(e=>({id:e.id,w:e.width,h:e.height}))`));
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
