#!/usr/bin/env node
// Smoke test for the new window.__dbg.classic probe hooks (Task 12 setup).
// Not the deliverable harness — just verifies the hooks resolve real data
// before the real paint-through harness is built on top of them.

import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9361);
const ROOT = '/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan6';
const ELECTRON = '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron';
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
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

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} already in use`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  const killGroup = () => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    try { execSync(`pkill -f 'ux-plan6/dist/main/index.mjs' 2>/dev/null; true`, { shell: '/bin/bash' }); } catch { /* */ }
  };
  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    let dbgOk = false;
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof window.__dbg === "object" && typeof window.__dbg.classic === "object"')) { dbgOk = true; break; } } catch { /* ctx swap */ }
      await sleep(300);
    }
    if (!dbgOk) throw new Error('__dbg.classic never installed');
    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(1800);
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(4000);
    const lvl = await c.evalExpr('window.__dbg.levelState()');
    console.log('levelState', lvl);

    console.log('poolSizes', await c.json('window.__dbg.classic.poolSizes()'));
    const reserved = await c.json('window.__dbg.classic.reservedTiles()');
    console.log('reservedTiles: count', reserved.length, 'min', reserved[0]?.toString(16), 'max', reserved[reserved.length - 1]?.toString(16));
    console.log('findSharedBlock', await c.json('window.__dbg.classic.findSharedBlock()'));
    console.log('findJuicyCell', await c.json('window.__dbg.classic.findJuicyCell()'));
    console.log('findAdjacentSharedBlockCells', await c.json('window.__dbg.classic.findAdjacentSharedBlockCells()'));
    const six = await c.json('window.__dbg.classic.sixDivergenceWrites()');
    console.log('sixDivergenceWrites', JSON.stringify(six));
    const hashes = await c.json('window.__dbg.classic.allTileHashes()');
    console.log('allTileHashes length', hashes.length);
    console.log('findObject(0x18) GHZ Platform', await c.json('window.__dbg.classic.findObject(0x18)'));
    console.log('findObject(0x1a) GHZ Collapsing Ledge', await c.json('window.__dbg.classic.findObject(0x1a)'));
  } finally {
    if (c) { try { c.close(); } catch { /* */ } }
    killGroup();
    await sleep(1000);
    console.log('port free after teardown:', await portFree());
  }
}
main().catch((e) => { console.error('ERROR:', e); process.exitCode = 1; });
