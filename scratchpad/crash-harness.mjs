#!/usr/bin/env node
// B5 crash harness: drive the built (VITE_AURORA_DEBUG=1) app over CDP and switch
// acts 20x, asserting the renderer never crashes (the sprite-store cache-key change
// touches the detached-bitmap path). Fails if the target dies or any act ends
// non-'ready'. Prints artState().sprites each cycle so composed/subtype keying is
// visibly exercised.

import { spawn } from 'node:child_process';
import * as http from 'node:http';

const PORT = 9337;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const ROOT = '/home/volence/sonic_hacks/aurora';
const ACTS = [['ghz', 1], ['ghz', 2], ['ghz', 3], ['mz', 1], ['lz', 1], ['slz', 1], ['sbz', 1], ['syz', 1]];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
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

async function main() {
  const electron = spawn(`${ROOT}/node_modules/.bin/electron`, [`${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let crashed = false;
  electron.on('exit', (code, sig) => { if (code !== 0 && code !== null) { crashed = true; console.error(`electron exited code=${code} sig=${sig}`); } });
  electron.stderr.on('data', () => {});

  try {
    const wsUrl = await waitForTarget();
    const c = cdp(wsUrl);
    await c.ready;
    await c.send('Runtime.enable');
    // Wait for __dbg to install.
    for (let i = 0; i < 40; i++) { if (await c.evalExpr('typeof window.__dbg === "object"')) break; await sleep(250); }
    if (!(await c.evalExpr('typeof window.__dbg === "object"'))) throw new Error('__dbg not installed');

    const st = await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    console.log('openDir →', st);

    let ok = 0;
    for (let cyc = 0; cyc < 20; cyc++) {
      const [zone, act] = ACTS[cyc % ACTS.length];
      await c.evalExpr(`window.__dbg.openAct(${JSON.stringify(zone)}, ${act})`);
      // Give the object-sprite refresh a beat to publish.
      await sleep(200);
      const lvl = await c.evalExpr('window.__dbg.levelState()');
      const art = await c.evalExpr('window.__dbg.artState()');
      const alive = await c.evalExpr('!!document.querySelector("canvas")');
      if (crashed) throw new Error(`renderer crashed after cycle ${cyc}`);
      if (lvl.status !== 'ready') throw new Error(`cycle ${cyc} ${zone}${act}: status=${lvl.status}`);
      if (!alive) throw new Error(`cycle ${cyc}: no canvas (viewport unmounted / crashed)`);
      ok++;
      console.log(`cycle ${String(cyc).padStart(2)} ${zone}${act} → ready, sprites=${art.sprites}, artVer=${art.version}, canvas=${alive}`);
    }
    c.close();
    console.log(`\nPASS: ${ok}/20 act switches, no crash.`);
  } finally {
    electron.kill('SIGKILL');
  }
}

main().catch((e) => { console.error('FAIL:', e.message); process.exitCode = 1; setTimeout(() => process.exit(1), 500); });
