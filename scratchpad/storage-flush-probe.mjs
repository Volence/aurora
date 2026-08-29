#!/usr/bin/env node
// A 40-line control for ONE question the canvas harness could not answer about
// itself: when this harness shuts the app down, does the app's last
// `localStorage` write survive to the next launch?
//
// It matters because row 13 (session restore) reads the stored session written
// by the previous session. If the shutdown loses the last writes, a restart row
// reports a product failure that is really the harness dropping the evidence on
// the floor. So this writes a marker, tears the app down exactly the way the
// harness does, relaunches, and reads it back — no Aurora behaviour involved.
//
// Run: node scratchpad/storage-flush-probe.mjs

import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9366);
const ROOT = '/home/volence/sonic_hacks/aurora';
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 1500 }, (res) => {
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
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('no CDP target');
}
function cdp(url) {
  const ws = new WebSocket(url);
  let id = 1; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = id++; pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ready, send, close: () => ws.close(),
    evalExpr: async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.value };
}

async function run(label, body, mode) {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1280x900x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true });
  const c = cdp(await waitForTarget());
  await c.ready;
  await c.send('Runtime.enable');
  const out = await body(c);
  if (mode === 'close') {
    // The normal unload path: Chromium commits its localStorage area when the
    // page goes away, which a signal never gives it a chance to do.
    try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* the target dies mid-call */ }
    await sleep(4000);
  }
  c.close();
  if (mode === 'term' || mode === 'close') {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    await sleep(5000);
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
  // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
  // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
  // below signals only pids descended from what this harness spawned.
  await sleep(1500);
  console.log(`${label}: ${JSON.stringify(out)}`);
  return out;
}

const MARK = `probe-${Date.now()}`;
await run('write (clear, then set a marker, then wait 8s)', async (c) => {
  await c.evalExpr('localStorage.clear(); 1');
  await sleep(1000);
  await c.evalExpr(`localStorage.setItem('probe.early', 'early'); 1`);
  await sleep(4000);
  await c.evalExpr(`localStorage.setItem('probe.late', ${JSON.stringify(MARK)}); 1`);
  await sleep(8000);
  return c.evalExpr(`JSON.stringify({ early: localStorage.getItem('probe.early'), late: localStorage.getItem('probe.late') })`);
}, process.env.MODE ?? 'term');

await run('read back after relaunch', async (c) => {
  await sleep(2000);
  return c.evalExpr(`JSON.stringify({ early: localStorage.getItem('probe.early'), late: localStorage.getItem('probe.late'), expected: ${JSON.stringify(MARK)} })`);
}, 'term');
