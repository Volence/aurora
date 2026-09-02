#!/usr/bin/env node
// Probe: replay harness rows 7→8 and watch WHO checks the sprite doc out after
// openAct — poll spriteState + session activeId, no clicks at all.
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = 9385;
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SESSION_KEY = `aurora.session.v1:${S1DIR}`;
const MOTOBUG_TAB = 'doc:sprite:s1:64';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 1500 }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
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
    } catch { }
    await sleep(500);
  }
  throw new Error('no CDP target');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text}`);
    return r.result.value;
  };
  return { ready, send, evalExpr, close: () => ws.close() };
}

async function main() {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'ignore', 'ignore'], detached: true,
  });
  try {
    const c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    const saved = await c.evalExpr(`localStorage.getItem(${JSON.stringify(SESSION_KEY)})`);
    // Replicate harness rows 1-6: fresh session, checkout 64 with GHZ1 open,
    // reload+restore, ring 37 level-free.
    await c.evalExpr(`localStorage.removeItem(${JSON.stringify(SESSION_KEY)})`);
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(2500);
    console.log('phaseA edit64:', await c.evalExpr('window.__dbg.editObjectArt(0x40)'));
    await c.send('Page.reload');
    await sleep(2500);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(2000);
    console.log('phaseB edit37:', await c.evalExpr('window.__dbg.editObjectArt(0x25)'));
    await sleep(500);
    const legacy = JSON.stringify({
      tabs: [
        { id: 'home', kind: 'home', title: 'Home' },
        { id: MOTOBUG_TAB, kind: 'sprite-doc', title: 'Moto Bug' },
      ],
      activeId: MOTOBUG_TAB,
    });
    await c.evalExpr(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(legacy)})`);
    await c.send('Page.reload');
    await sleep(2500);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(1500);
    const snap = async (tag) => {
      const s = JSON.parse(await c.evalExpr('JSON.stringify(window.__dbg.spriteState())'));
      const l = JSON.parse(await c.evalExpr('JSON.stringify(window.__dbg.levelState())'));
      const payload = JSON.parse(await c.evalExpr(`localStorage.getItem(${JSON.stringify(SESSION_KEY)})`) ?? 'null');
      const refusal = await c.evalExpr(`document.body.innerText.includes('stored per zone')`);
      console.log(`${tag}: activeDoc=${s.activeDocId} frames=${s.frames} level=${l.status}/${l.zone} sessionActive=${payload?.activeId} refusal=${refusal} ws=${JSON.stringify(payload?.workspace ?? null)}`);
    };
    await snap('post-restore');
    await c.evalExpr('(window.__dbg.openAct("ghz", 1), 1)');
    for (let i = 0; i < 20; i++) { await snap(`t+${i * 500}ms`).catch((e) => console.log('snap err', e.message)); await sleep(500); }
    // restore owner key
    if (saved != null) await c.evalExpr(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(saved)})`);
    else await c.evalExpr(`localStorage.removeItem(${JSON.stringify(SESSION_KEY)})`);
    c.close();
  } finally {
    if (app?.pid) { try { process.kill(-app.pid, 'SIGTERM'); } catch { } }
  }
}
main().catch((e) => { console.error('PROBE ERROR:', e.message); process.exit(2); });
