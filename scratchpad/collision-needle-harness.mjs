#!/usr/bin/env node
// DOES THE COLLISION ANGLE NEEDLE POINT THE RIGHT WAY IN THE RUNNING APP?
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

import { AURORA_ROOT, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9391);
const ROOT = AURORA_ROOT;
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots-collision`;
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
  console.log(`        shot → scratchpad/shots-collision/${name}.png`);
}

/** Find the real View-menu checkbox by its rendered label. */
const CHECKBOX = (label) => `(() => {
  const l = [...document.querySelectorAll('label')].find((e) => e.textContent.trim() === ${JSON.stringify(label)});
  return l ? l.querySelector('input[type=checkbox]') : null;
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
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

    // Clean session: a restored dead tab parks the app on an inert pane.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let lvl = null;
    for (let i = 0; i < 50; i++) {
      lvl = await c.json('window.__dbg.levelState()');
      if (lvl.status === 'ready') break;
      await sleep(400);
    }
    check('setup', 'GHZ act 1 is loaded', lvl?.status === 'ready', JSON.stringify(lvl));
    await sleep(1500);

    // Turn the overlays on through the REAL View menu, so this exercises the
    // same path a person uses rather than reaching into the store.
    const openedMenu = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => /View/.test(b.textContent))`);
    await sleep(500);
    const onCollision = await clickEl(c, CHECKBOX('Collision (path A)'));
    await sleep(400);
    const onAngles = await clickEl(c, CHECKBOX('Collision angles'));
    await sleep(800);
    check('setup-2', 'Collision + Collision angles switched on from the View menu',
      openedMenu && onCollision && onAngles, `menu=${openedMenu} collision=${onCollision} angles=${onAngles}`);

    // Close the menu so it does not cover the viewport in the photograph.
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(600);

    const ov = await c.json(`(() => { const s = document.querySelector('footer'); return { footer: s ? s.textContent.slice(0,80) : null }; })()`);
    check('1', 'the app is still alive with the overlay drawing', ov !== null, JSON.stringify(ov));

    await shot(c, 'ghz-collision-default-view');

    // FRAMING DERIVED, NOT GUESSED. The first attempt used setView(1800,300,2)
    // and photographed empty sky: at 58% the whole 1280px level height is on
    // screen, so y=300 is above the ground entirely. Measuring off that shot —
    // viewport origin ~(285,100), scale 0.58 — puts GHZ act 1's first slope at
    // level x 940..1110, ground at y~900. Both framings are photographed
    // because setView's x/y could be top-left or centre, and the pair settles
    // it without another round trip.
    const before = await c.json('window.__dbg.view()');
    console.log('        default view:', JSON.stringify(before));

    await c.evalExpr('window.__dbg.setView(850, 750, 3)');
    await sleep(1200);
    await shot(c, 'slope-as-topleft');
    const v1 = await c.json('window.__dbg.view()');

    await c.evalExpr('window.__dbg.setView(1020, 900, 3)');
    await sleep(1200);
    await shot(c, 'slope-as-centre');
    const v2 = await c.json('window.__dbg.view()');

    check('2', 'the camera accepted both framings at 300%',
      v1.zoom === 3 && v2.zoom === 3, `${JSON.stringify(v1)} / ${JSON.stringify(v2)}`);

    // ONE FRAME CLOSE ENOUGH TO SETTLE IT. At 300% the needles are a few pixels
    // and "they look parallel to the slope" is an impression, not evidence. At
    // 800% a mirrored needle would cross the slope surface at an obvious
    // opposite diagonal, which is the whole failure this plan fixed first.
    await c.evalExpr('window.__dbg.setView(900, 820, 8)');
    await sleep(1400);
    await shot(c, 'slope-closeup');
    const v3 = await c.json('window.__dbg.view()');
    check('3', 'close-up framed at 800%', v3.zoom === 8, JSON.stringify(v3));
  } finally {
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* */ }
      await sleep(2500);
      try { c.close(); } catch { /* */ }
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
    await sleep(1000);
    console.log(`\nport free after teardown: ${await portFree()}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
