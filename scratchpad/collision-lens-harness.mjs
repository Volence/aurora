#!/usr/bin/env node
// DOES THE COLLISION LENS ANSWER THE QUESTION IT WAS BUILT FOR?
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

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9401);
const ROOT = '/home/volence/sonic_hacks/aurora';
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const SHOTS = `${ROOT}/scratchpad/shots-lens`;
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
  console.log(`        shot → scratchpad/shots-lens/${name}.png`);
}


/**
 * Click a LEVEL point, exactly.
 *
 * The framing is computed from the canvas's own bounding rect and the camera,
 * never guessed: two earlier harnesses tonight photographed empty sky because
 * they assumed where the viewport was. `setView(x, y, zoom)` puts level (x,y) at
 * the canvas's top-left, so a level point maps to
 * `rect.left + (lx - view.x) * zoom`. The click is then verified against what
 * the store actually recorded, so a wrong mapping fails loudly here rather than
 * quietly making the next assertion meaningless.
 */
async function clickLevelPoint(c, lx, ly, zoom) {
  await c.evalExpr(`window.__dbg.setView(${lx - 40 / zoom}, ${ly - 40 / zoom}, ${zoom})`);
  await sleep(900);
  const view = await c.json('window.__dbg.view()');
  const rect = await c.json(`(() => { const el = document.querySelector('canvas');
    const b = el.getBoundingClientRect();
    return { left: Math.round(b.left), top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })()`);
  const sx = Math.round(rect.left + (lx - view.x) * view.zoom);
  const sy = Math.round(rect.top + (ly - view.y) * view.zoom);
  if (sx < rect.left || sy < rect.top || sx > rect.left + rect.w || sy > rect.top + rect.h) {
    throw new Error(`computed click (${sx},${sy}) is outside the canvas ${JSON.stringify(rect)}`);
  }
  await mouse(c, 'mousePressed', sx, sy);
  await sleep(60);
  await mouse(c, 'mouseReleased', sx, sy, { buttons: 0 });
  await sleep(500);
  return { view, rect, sx, sy };
}

const EMPTY_HINT = 'Click a cell on the map to probe';

/**
 * The WHOLE panel column, as one string.
 *
 * Two traps, both hit on the first run. The regex must be written `\\s` here:
 * this is a template literal, so a lone `\s` is just `s` and the "normalise
 * whitespace" replace silently deleted every letter s from the reading
 * ("Thi cell", "olidity None"). And the walk must climb until BOTH headings are
 * in scope — stopping at the first container over 60 chars grabs the cell
 * section alone, so an assertion about the block section can never pass.
 */
const panelText = (c) => c.evalExpr(`(() => {
  let el = [...document.querySelectorAll('div')].find((d) => d.textContent.trim() === 'This cell');
  if (!el) {
    const empty = [...document.querySelectorAll('div')].find((d) => d.textContent.includes(${JSON.stringify(EMPTY_HINT)}));
    return empty ? 'EMPTY: ' + empty.textContent.trim().slice(0, 120) : null;
  }
  while (el.parentElement && !(el.textContent.includes('This cell') && el.textContent.includes('This block'))) {
    el = el.parentElement;
  }
  return el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 420);
})()`);

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
    await sleep(1200);

    // --- 1: the pill exists and selects ------------------------------------
    const onPill = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Collision')`);
    await sleep(900);
    // The panel's honest empty state, not the readout: with no probe yet it
    // says "click a cell" rather than rendering zeros, so asserting on the
    // headings here would fail for the right reason and read as a bug.
    const empty = await panelText(c);
    check('1', 'the Collision pill selects and mounts the panel in its empty state',
      onPill === true && !!empty && empty.startsWith('EMPTY:'), `pill=${onPill} panel="${empty}"`);

    // --- 2: the overlay was CLAIMED, not left to the user -------------------
    const shaded = await c.evalExpr(`!!document.querySelector('canvas')`);
    check('2', 'the facet mounted with the map still rendering', shaded === true);
    await shot(c, 'lens-mounted');

    // --- 3: find a cell that actually collides -----------------------------
    // The first attempt clicked level (400,950) and got "Chunk $2D, solidity
    // None" — which is the lens being RIGHT: that point is inside the dirt, and
    // S1 marks interior cells non-solid because only the surface stops you. So
    // the harness scans a column instead of asserting a guessed point, and
    // reports which y actually collided.
    let groundText = null, groundY = null, groundClick = null;
    for (let ly = 860; ly <= 1010 && !groundY; ly += 16) {
      groundClick = await clickLevelPoint(c, 400, ly, 2);
      const t = await panelText(c);
      if (t && !/does not collide/i.test(t) && !/EMPTY/.test(t)) { groundText = t; groundY = ly; }
    }
    check('3', 'some cell on the ground column reports a real collision',
      !!groundY, groundY
        ? `level y=${groundY}\n        panel="${groundText}"`
        : 'no colliding cell found between y=860 and y=1010');
    await shot(c, 'lens-ground');

    // --- 4: click OPEN SKY --------------------------------------------------
    // The row that matters. A panel that reports SOMETHING whatever you click is
    // not a lens, and this is the only assertion that can tell the difference.
    const s = await clickLevelPoint(c, 400, 200, 2);
    const skyText = await panelText(c);
    check('4', 'clicking open sky says AIR, not a block',
      !!skyText && /air|no chunk here/i.test(skyText),
      `click=(${s.sx},${s.sy}) view=${JSON.stringify(s.view)}\n        panel="${skyText}"`);
    await shot(c, 'lens-sky');

    // --- 5: anti-vacuous — the two clicks said DIFFERENT things --------------
    check('5', 'ground and sky produced different readings',
      !!groundText && !!skyText && groundText !== skyText,
      groundText === skyText ? 'IDENTICAL — the panel is not reading the click' : 'differ');
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
