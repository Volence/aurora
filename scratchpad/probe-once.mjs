#!/usr/bin/env node
// One-shot diagnostic: open the aeon project, paint once, and dump enough state
// to see WHERE the edit landed. Not a check suite — a microscope.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9378);
const ROOT = AURORA_DIR;
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const AEON = siblingPathOrUnresolved('aeon');
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
      const l = await getJSON('/json/list');
      const p = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* */ }
    await sleep(500);
  }
  throw new Error('no CDP target');
}
function cdp(url) {
  const ws = new WebSocket(url);
  let id = 1; const pending = new Map();
  ws.addEventListener('error', () => {});
  ws.addEventListener('close', () => { for (const [, fn] of pending) fn({ error: { message: 'socket closed' } }); pending.clear(); });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.consoleAPICalled') {
      const a = (m.params.args || []).map((x) => x.value ?? x.description ?? x.type).join(' ');
      console.log(`  [console.${m.params.type}] ${a}`);
    }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const ready = new Promise((res) => ws.addEventListener('open', res));
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = id++;
    pending.set(i, (m) => (m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { ready, send, ev, close: () => ws.close() };
}

const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
  cwd: ROOT, env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', DISPLAY: undefined },
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });
child.stdout.on('data', (d) => { const t = String(d); if (t.includes('[close]')) process.stdout.write(`[main] ${t}`); });

try {
  const c = cdp(await waitForTarget());
  await c.ready;
  await c.send('Runtime.enable');
  for (let i = 0; i < 60; i++) {
    if (await c.ev('typeof window.__dbg?.aeon === "object"').catch(() => false)) break;
    await sleep(300);
  }
  await c.ev(`window.__dbg.aeon.open(${JSON.stringify(AEON)})`);
  for (let i = 0; i < 40; i++) {
    const s = await c.ev('JSON.stringify(window.__dbg.aeon.state())');
    if (JSON.parse(s).sections > 0) break;
    await sleep(400);
  }
  console.log('state:', await c.ev('JSON.stringify(window.__dbg.aeon.state())'));
  console.log('activeSection:', await c.ev('window.__dbg.aeon.activeSection()'));
  console.log('box:', await c.ev('JSON.stringify(document.getElementById("map-canvas").getBoundingClientRect())'));
  console.log('bgAt(0):', await c.ev('window.__dbg.aeon.bgAt(0)'));
  console.log('nt(0,0..8):', await c.ev('JSON.stringify(Array.from({length:8},(_,i)=>window.__dbg.aeon.ntAt(0,i)))'));

  // Reproduce the harness's prelude EXACTLY — the only difference between this
  // probe (which paints) and the harness (which does not) is the R14 rows.
  if (process.env.PRELUDE) {
    await c.ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true}))`);
    await sleep(150);
    await c.ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'b',bubbles:true,ctrlKey:true}))`);
    await sleep(200);
    await c.ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',bubbles:true,ctrlKey:true}))`);
    await sleep(200);
    await c.ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(300);
    console.log('PRELUDE ran; palette open?', await c.ev(`!!document.querySelector('input[placeholder]')`));
  }

  // Arm paint-tile and click dead centre.
  await c.ev(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'t',bubbles:true}))`);
  await sleep(200);
  console.log('tool after t:', await c.ev('window.__dbg.aeon.state().tool'));

  const snap = "Array.from({length:9},(_,s)=>Array.from({length:2048},(_,i)=>window.__dbg.aeon.ntAt(s,i)))";
  await c.ev(`window.__before = ${snap}`);
  console.log('snapshot taken; total entries:', await c.ev('window.__before.flat().length'));

  const trace = async (label) => console.log(`  ${label}: dirty=${await c.ev('window.__dbg.aeon.state().dirty')} canUndo=${await c.ev('window.__dbg.aeon.canUndo()')}`);
  await c.ev(`window.__ev = (t, px, py) => { const c = document.getElementById('map-canvas');
    return c.dispatchEvent(new MouseEvent(t, {bubbles:true, cancelable:true, clientX:px, clientY:py, button:0, buttons:t==='mouseup'?0:1})); }`);
  await c.ev(`window.__p = (() => { const b = document.getElementById('map-canvas').getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  await trace('before gesture');
  await c.ev('window.__ev("mousedown", window.__p.x, window.__p.y)');
  await sleep(150);
  await trace('after mousedown');
  await c.ev('for (let i=1;i<=8;i++) window.__ev("mousemove", window.__p.x+i*9, window.__p.y)');
  await sleep(200);
  await trace('after moves');
  await c.ev('window.__ev("mouseup", window.__p.x+72, window.__p.y)');
  await sleep(400);
  console.log('after paint — state:', await c.ev('JSON.stringify(window.__dbg.aeon.state())'));
  console.log('after paint — activeSection:', await c.ev('window.__dbg.aeon.activeSection()'));
  console.log('after paint — canUndo:', await c.ev('window.__dbg.aeon.canUndo()'));
  console.log('toasts:', await c.ev('JSON.stringify(window.__dbg.aeon.toasts())'));
  console.log('CELLS CHANGED:', await c.ev(`(() => {
    const now = ${snap};
    let n = 0, first = null;
    for (let s = 0; s < 9; s++) for (let i = 0; i < 2048; i++) {
      if (window.__before[s][i] !== now[s][i]) { n++; if (!first) first = { s, i, was: window.__before[s][i], now: now[s][i] }; }
    }
    return JSON.stringify({ n, first });
  })()`));
  // Which entries in the ACTIVE section are non-zero near the top-left?
  console.log('active nt 0..16:', await c.ev(
    'JSON.stringify((()=>{const s=window.__dbg.aeon.activeSection();return Array.from({length:16},(_,i)=>window.__dbg.aeon.ntAt(s,i));})())'));
  console.log('console errors:', await c.ev('JSON.stringify((window.__errs||[]).slice(0,5))'));
  console.log('preload has onCloseRequest:', await c.ev('typeof window.api?.onCloseRequest'));
  console.log('dirty before close:', await c.ev('window.__dbg.aeon.state().dirty'));
  // Observe the close handshake from inside the page: a SECOND listener sees the
  // request. It answers false, so if main is asking at all the window survives.
  await c.ev('window.__asked = false; window.api.onCloseRequest((respond) => { window.__asked = true; respond(false); });');

  const trigger = process.env.TRIGGER ?? 'close';
  if (trigger === 'ctrlw') {
    // A REAL key, through Chromium's input pipeline — the packet's named path
    // (Electron's default menu binds the `close` role to Ctrl+W).
    await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', modifiers: 2, windowsVirtualKeyCode: 87, key: 'w', code: 'KeyW' });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, windowsVirtualKeyCode: 87, key: 'w', code: 'KeyW' });
  } else {
    await c.ev('window.close()').catch((e) => console.log('  close() eval threw:', String(e).slice(0, 80)));
  }
  await sleep(2500);
  console.log(`trigger=${trigger}; main asked the renderer:`, await c.ev('window.__asked').catch(() => 'PAGE GONE'));
  const alive = await c.ev('1+1').then((v) => v === 2).catch(() => false);
  console.log('page alive 2.5s after close():', alive);
  if (alive) {
    console.log('dialog text present:', await c.ev(`[...document.querySelectorAll('*')].some((e)=>e.children.length===0&&/Unsaved changes/.test(e.textContent))`));
  }
} finally {
  try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
  try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
  // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
  // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
  // below signals only pids descended from what this harness spawned.
}
