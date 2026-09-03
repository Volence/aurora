#!/usr/bin/env node
// DOES THE PRIORITY LENS MARK THE RIGHT 8x8 TILES IN THE RUNNING APP?
//
// The unit tests prove the mask's flip composition and drawPriority's veil
// coordinates against hand-derived SBZ blocks. Neither proves the toggle in the
// REAL View menu paints the REAL viewport — or, just as important, that it
// paints ONLY where the data says. So this drives the built app under xvfb over
// CDP, flips 'Priority (above sprites)' through the actual menu (no store
// poking), and reads pixels back off the viewport canvas at world coordinates
// measured OFFLINE from the real s1disasm data (scratchpad/probe-lens-coords.mts):
//
//   SBZ act 1 — mixed block $11 (words 0x4016 0x4017 0xC005 0xC006 → pri
//   [TL,TR,BL,BR]=[0,0,1,1]; x-symmetric, so its xf=true placement composes to
//   the same quad) at layout(26,1), chunk $3, cell 195 → world cell (6704,448):
//     HIGH tile (BL) center = (6708, 460)   LOW tile (TL) center = (6708, 452)
//
//   SLZ act 1 — ALL-high block $152 (SLZ has 58 all-high blocks and 0 mixed;
//   priority isn't only interesting when mixed) at layout(13,0), chunk $1,
//   cell 97 → world cell (3344,96): sampled at TL tile center (3348, 100).
//
// Launch/teardown discipline lifted from scratchpad/collision-lens-harness.mjs
// (session-clear included). ROOT is self-locating (canvas-cdp-harness.mjs
// lesson: a hardcoded main-checkout path makes a worktree harness PASS against
// code the branch does not contain). The stale-dist guard is mandatory
// (classic-playtest-harness.mjs lesson: a stale bundle once passed 19/19
// against a planted defect).

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9402);
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots-priority`;
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
  console.log(`        shot → scratchpad/shots-priority/${name}.png`);
}

// The viewport canvas = the largest canvas in the DOM (chunk-picker thumbnails
// are canvases too, so bare querySelector('canvas') is a gamble on DOM order).
const CANVAS = `[...document.querySelectorAll('canvas')].sort((a,b) => b.width*b.height - a.width*a.height)[0]`;

/**
 * RGBA of the canvas BACKING-STORE pixel under level point (lx, ly), given the
 * current view. The canvas backing store is CSS-pixel sized (measure() assigns
 * floor(rect) directly, no devicePixelRatio scaling), so backing coords are
 * just (level - view) * zoom. getImageData works because the viewport context
 * is created willReadFrequently (CPU-backed). Throws if the point maps outside
 * the canvas — a silent out-of-bounds sample would read [0,0,0,0] and could
 * fake a PASS on the "unchanged" rows.
 */
async function samplePx(c, lx, ly) {
  return c.json(`(() => {
    const view = window.__dbg.view();
    const el = ${CANVAS};
    const cx = Math.round((${lx} - view.x) * view.zoom);
    const cy = Math.round((${ly} - view.y) * view.zoom);
    if (cx < 0 || cy < 0 || cx >= el.width || cy >= el.height) {
      throw new Error('sample (' + cx + ',' + cy + ') outside canvas ' + el.width + 'x' + el.height);
    }
    return [...el.getContext('2d').getImageData(cx, cy, 1, 1).data];
  })()`);
}

const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const px = (p) => `[${p.join(',')}]`;

/** The View menu's Priority checkbox label (null if the menu isn't open). */
const PRIORITY_LABEL = `[...document.querySelectorAll('label')].find((l) => l.textContent.includes('Priority (above sprites)'))`;

/** Open the View menu, click the Priority toggle, close the menu again. */
async function togglePriority(c) {
  const opened = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('View'))`);
  if (!opened) throw new Error('View menu button not found');
  const clicked = await clickEl(c, PRIORITY_LABEL);
  if (!clicked) throw new Error('Priority (above sprites) entry not in the open View menu');
  const checked = await c.evalExpr(`(${PRIORITY_LABEL}).querySelector('input').checked`);
  // Close by clicking far from the menu (mousedown-outside closes it) — over
  // the canvas is fine, a plain click on the pan tool does not edit anything.
  await mouse(c, 'mousePressed', 30, 500); await sleep(40);
  await mouse(c, 'mouseReleased', 30, 500, { buttons: 0 });
  await sleep(500); // let the depless render effect flush the overlay change
  return checked;
}

async function openActReady(c, zone, act) {
  await c.evalExpr(`window.__dbg.openAct(${JSON.stringify(zone)}, ${act})`);
  for (let i = 0; i < 50; i++) {
    const lvl = await c.json('window.__dbg.levelState()');
    if (lvl.status === 'ready' && lvl.zone === zone && lvl.act === act) return lvl;
    await sleep(400);
  }
  throw new Error(`${zone}${act} never became ready`);
}

// Measured world coordinates (see header). Both SBZ points sit in the same
// 16x16 cell of mixed block $11's placement; 4px clear of the high/low
// boundary at y=456 so the 1-screen-px boundary stroke cannot touch them.
const SBZ_HIGH = { x: 6708, y: 460 };
const SBZ_LOW = { x: 6708, y: 452 };
const SLZ_ALLHIGH = { x: 3348, y: 100 };

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS. Both halves of that question name
  // the tree the run is AGAINST, never the tree this file lives in — the O52
  // block in lib/run-root.mjs says why, and this is the only spelling of it.
  assertFreshBuild(RUN);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
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
    check('setup', 'project opened and an act is ready', lvl?.status === 'ready', JSON.stringify(lvl));

    // --- SBZ act 1: the zone with 68 of the 73 mixed-priority blocks --------
    const sbz = await openActReady(c, 'sbz', 1);
    check('1', 'SBZ act 1 loads', sbz.status === 'ready', JSON.stringify(sbz));
    await sleep(1200);
    // Frame both sample points: level (6650, 400) at the canvas origin, zoom 2.
    await c.evalExpr('window.__dbg.setView(6650, 400, 2)');
    await sleep(900);

    const offHigh = await samplePx(c, SBZ_HIGH.x, SBZ_HIGH.y);
    const offLow = await samplePx(c, SBZ_LOW.x, SBZ_LOW.y);
    await shot(c, 'sbz-lens-off');

    const on = await togglePriority(c);
    check('2', 'the REAL View menu lists Priority (above sprites) and the toggle checks it', on === true);
    const onHigh = await samplePx(c, SBZ_HIGH.x, SBZ_HIGH.y);
    const onLow = await samplePx(c, SBZ_LOW.x, SBZ_LOW.y);
    await shot(c, 'sbz-lens-on');

    check('3', 'a HIGH-priority tile of mixed block $11 shades (pixel changed)',
      !eq(onHigh, offHigh), `off=${px(offHigh)} on=${px(onHigh)} at (${SBZ_HIGH.x},${SBZ_HIGH.y})`);
    check('4', 'the LOW-priority tile of the SAME block does NOT shade (pixel identical)',
      eq(onLow, offLow), `off=${px(offLow)} on=${px(onLow)} at (${SBZ_LOW.x},${SBZ_LOW.y})`);
    // Anti-vacuous backstop for row 4: the two SBZ samples must not both be
    // sampling the same-looking pixel — if high and low read identically with
    // the lens ON, row 4 proves nothing about restraint.
    check('5', 'high and low samples differ from EACH OTHER with the lens on',
      !eq(onHigh, onLow), `high=${px(onHigh)} low=${px(onLow)}`);

    const offAgain = await togglePriority(c);
    check('6', 'toggling off unchecks and restores the high tile pixel exactly',
      offAgain === false && eq(await samplePx(c, SBZ_HIGH.x, SBZ_HIGH.y), offHigh));

    // --- SLZ act 1: zero mixed blocks — whole-block-high must still shade ---
    const slz = await openActReady(c, 'slz', 1);
    check('7', 'SLZ act 1 loads', slz.status === 'ready', JSON.stringify(slz));
    await sleep(1200);
    await c.evalExpr('window.__dbg.setView(3300, 60, 2)');
    await sleep(900);
    const slzOff = await samplePx(c, SLZ_ALLHIGH.x, SLZ_ALLHIGH.y);
    const on2 = await togglePriority(c);
    const slzOn = await samplePx(c, SLZ_ALLHIGH.x, SLZ_ALLHIGH.y);
    await shot(c, 'slz-lens-on');
    check('8', 'an ALL-high block ($152) shades in SLZ even though the zone has no mixed blocks',
      on2 === true && !eq(slzOn, slzOff), `off=${px(slzOff)} on=${px(slzOn)} at (${SLZ_ALLHIGH.x},${SLZ_ALLHIGH.y})`);
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
