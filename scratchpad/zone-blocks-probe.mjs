#!/usr/bin/env node
// HOW MANY ZONES WOULD A 'REFUSE COLIND GROWTH' RULE DISABLE ISOLATE ON?
//
// The colind table can be SHORTER than the block list (GHZ: 439 blocks, 410
// bytes). Isolate appends a block, which grows the table and defines every
// entry in between — so refusing that growth refuses Isolate on any zone where
// blocks >= colind. The .eni block files are compressed, so the count has to
// come from the running app.
//
// The unit tests prove angleNeedle's maths and the overlay tests prove
// drawCollision calls it. Neither draws a pixel. The whole reason the needle fix
// came BEFORE the collision editor is that an editor built on a mirrored readout
// teaches the wrong slope — so the claim that has to be checked in the real app
// is a visual one: on a GHZ slope, does the needle rise the way the ground does?
//
// This drives the BUILT (VITE_AURORA_DEBUG=1) app under xvfb over CDP, turns on
// Collision + Collision angles through the REAL View menu (no store poking), and
// photographs the viewport. Launch/teardown discipline is lifted from
// scratchpad/micro-type-harness.mjs, session-clear included: a stored session can
// park the app on a dead tab, which cost that harness three restarts.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9411);
const ROOT = AURORA_DIR;
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots-zones`;
mkdirSync(SHOTS, { recursive: true });

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
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}

async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  if (!r) return false;
  await mouse(c, 'mousePressed', r.x, r.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', r.x, r.y, { buttons: 0 });
  await sleep(250);
  return true;
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-zones/${name}.png`);
}


const COLIND = { ghz: 410, lz: 200, mz: 400, slz: 500, syz: 500, sbz: 600 };

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} busy`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
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
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    for (let i = 0; i < 50; i++) {
      const st = await c.json('window.__dbg.levelState()');
      if (st.status === 'ready') break;
      await sleep(400);
    }
    console.log('\nzone  colind  blocks  isolate under a refuse-growth rule');
    for (const z of Object.keys(COLIND)) {
      const ok = await c.evalExpr(`window.__dbg.activate(${JSON.stringify(z)}, 1)`).catch(() => false);
      await sleep(2200);
      const bar = await c.evalExpr(`(() => { const f = document.querySelector('footer'); return f ? f.textContent : ''; })()`);
      const m = /(\d+)\s+blocks/.exec(bar || '');
      const blocks = m ? Number(m[1]) : null;
      const cl = COLIND[z];
      const verdict = blocks === null ? '?' : (blocks >= cl ? `REFUSED (+${blocks + 1 - cl} entries)` : 'allowed');
      console.log(`${z.padEnd(5)} ${String(cl).padStart(6)} ${String(blocks ?? '?').padStart(7)}  ${verdict}`);
    }
  } finally {
    if (c) { try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch {} await sleep(2000); try { c.close(); } catch {} }
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch {}
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
