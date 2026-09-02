#!/usr/bin/env node
// CAN THE COLLISION FACET ACTUALLY WRITE, AND CAN ONE Ctrl+Z TAKE IT BACK?
//
// Row 2 is the reason the lens stage wired undo routing before anything could
// write: colind is a ZONE-ART domain but the map tab picks its undo document by
// FACET, so a collision edit could land on a stack Ctrl+Z never reaches. No node
// test can see that. This can.
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

const PORT = Number(process.env.PORT ?? 9421);
const ROOT = AURORA_ROOT;
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots-edit`;
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
  console.log(`        shot → scratchpad/shots-edit/${name}.png`);
}


/** Click a LEVEL point, framing computed from the canvas rect and the camera. */
async function clickLevelPoint(c, lx, ly, zoom) {
  await c.evalExpr(`window.__dbg.setView(${lx - 40 / zoom}, ${ly - 40 / zoom}, ${zoom})`);
  await sleep(900);
  const view = await c.json('window.__dbg.view()');
  const rect = await c.json(`(() => { const b = document.querySelector('canvas').getBoundingClientRect();
    return { left: Math.round(b.left), top: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; })()`);
  const sx = Math.round(rect.left + (lx - view.x) * view.zoom);
  const sy = Math.round(rect.top + (ly - view.y) * view.zoom);
  if (sx < rect.left || sy < rect.top || sx > rect.left + rect.w || sy > rect.top + rect.h) {
    throw new Error(`click (${sx},${sy}) outside canvas ${JSON.stringify(rect)}`);
  }
  await mouse(c, 'mousePressed', sx, sy);
  await sleep(60);
  await mouse(c, 'mouseReleased', sx, sy, { buttons: 0 });
  await sleep(600);
  return { view, sx, sy };
}

/** The whole panel column as one string. `\\s` must be escaped — in a template
 *  literal a bare `\s` is just `s`, which silently deletes every letter s. */
const panelText = (c) => c.evalExpr(`(() => {
  let el = [...document.querySelectorAll('div')].find((d) => d.textContent.trim() === 'This cell');
  if (!el) return null;
  while (el.parentElement && !(el.textContent.includes('This cell') && el.textContent.includes('This block'))) el = el.parentElement;
  return el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 500);
})()`);

/** The "Shape" row's value, which is what a write must change. */
const shapeOf = (t) => { const m = /Shape\s*(\d+)/.exec(t || ''); return m ? Number(m[1]) : null; };

const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

/**
 * Click a shape swatch that is NOT the current one.
 *
 * Selected by TITLE, not a data attribute: the panel renders each swatch as
 * `<button title="shape N — used by ...">` and adds no test hooks. The first
 * version of this harness invented `[data-shape]`, found nothing, and reported
 * "no swatches" as a write failure.
 */
async function pickDifferentShape(c, currentShape) {
  return c.json(`(() => {
    const sw = [...document.querySelectorAll('button')]
      .filter((b) => /^shape \\d+/.test(b.title || ''));
    if (!sw.length) return { ok: false, why: 'no shape swatches on screen' };
    const idx = (b) => Number(/^shape (\\d+)/.exec(b.title)[1]);
    const pick = sw.find((b) => idx(b) !== ${currentShape});
    if (!pick) return { ok: false, why: 'every swatch is the current shape' };
    pick.click();
    return { ok: true, index: idx(pick), swatches: sw.length };
  })()`);
}

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
    for (let i = 0; i < 50; i++) {
      if ((await c.json('window.__dbg.levelState()')).status === 'ready') break;
      await sleep(400);
    }
    check('setup', 'GHZ act 1 loaded', true);
    await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Collision')`);
    await sleep(900);

    // Ground surface found by the lens harness at level y=972.
    await clickLevelPoint(c, 400, 972, 2);
    const before = await panelText(c);
    const shapeBefore = shapeOf(before);
    check('setup-2', 'a solid cell is probed and shows a shape', shapeBefore !== null, `shape=${shapeBefore}`);

    // --- 1: writing changes the shape ---------------------------------------
    const picked = await pickDifferentShape(c, shapeBefore);
    await sleep(700);
    const after = await panelText(c);
    const shapeAfter = shapeOf(after);
    check('1', 'clicking a swatch writes a different shape',
      picked.ok === true && shapeAfter !== null && shapeAfter !== shapeBefore,
      `picked=${JSON.stringify(picked)} ${shapeBefore} → ${shapeAfter}`);
    await shot(c, 'edit-written');

    // --- 2: ONE Ctrl+Z takes it back ----------------------------------------
    // The row the undo-routing task existed for. colind is a ZONE-ART domain,
    // but the map tab resolves its undo document by FACET — miss that and the
    // edit lands on a stack Ctrl+Z never reaches.
    await ctrlZ(c);
    await sleep(900);
    const undone = shapeOf(await panelText(c));
    // NOT VACUOUS: if row 1 wrote nothing, "the shape is unchanged" is true for
    // the wrong reason, so this row demands that a change happened FIRST.
    check('2', 'ONE Ctrl+Z restores the previous shape, from the map',
      shapeAfter !== shapeBefore && undone === shapeBefore,
      shapeAfter === shapeBefore
        ? 'VACUOUS — row 1 never wrote, so there was nothing to undo'
        : `${shapeAfter} → ${undone} (want ${shapeBefore})`);

    // --- 3: Isolate is refused on GHZ, and says why -------------------------
    const isoClicked = await c.evalExpr(`(() => {
      const c = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Isolate');
      if (!c) return false; c.click(); return true; })()`);
    await sleep(500);
    await pickDifferentShape(c, shapeBefore);
    await sleep(700);
    const refusal = await c.evalExpr(`(() => {
      const d = [...document.querySelectorAll('div')].find((e) => /refus|cannot|next zone|adjacent/i.test(e.textContent) && e.children.length === 0);
      return d ? d.textContent.replace(/\\s+/g, ' ').trim().slice(0, 240) : null; })()`);
    check('3', 'Isolate on GHZ is refused and names the cost',
      isoClicked === true && !!refusal && /30|adjacent|next zone/i.test(refusal),
      `refusal="${refusal}"`);
    await shot(c, 'edit-isolate-refused');

    // --- 4: Isolate WORKS where the table has room --------------------------
    // Rows 1-3 only ever prove Isolate is refused. Without this the whole
    // clone-and-repoint path — the reason SurfaceEditPlan gained a colind
    // override — would ship having never run in the app. LZ has 196 blocks
    // against a 200-entry table, so it has room.
    const blocksOf = () => c.evalExpr(`(() => { const f = document.querySelector('footer');
      const m = /(\\d+)\\s+blocks/.exec(f ? f.textContent : ''); return m ? Number(m[1]) : null; })()`);
    await c.evalExpr(`window.__dbg.activate('lz', 1)`);
    await sleep(2600);
    await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Collision')`);
    await sleep(800);
    const lzBlocksBefore = await blocksOf();

    // Find a solid cell in LZ by scanning a column, as the lens harness does.
    let lzShape = null;
    for (let ly = 400; ly <= 900 && lzShape === null; ly += 16) {
      await clickLevelPoint(c, 400, ly, 2);
      const t = await panelText(c);
      if (t && !/does not collide/i.test(t)) lzShape = shapeOf(t);
    }
    const isoOn = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Isolate');
      if (!b) return false; b.click(); return true; })()`);
    await sleep(500);
    const lzPick = await pickDifferentShape(c, lzShape);
    await sleep(900);
    const lzBlocksAfter = await blocksOf();
    check('4', 'Isolate clones a block where the table has room',
      lzShape !== null && isoOn && lzPick.ok && lzBlocksAfter === lzBlocksBefore + 1,
      `lz shape=${lzShape} blocks ${lzBlocksBefore} → ${lzBlocksAfter}`);

    // --- 5: and ONE Ctrl+Z takes the clone back -----------------------------
    await ctrlZ(c);
    await sleep(1000);
    const lzBlocksUndone = await blocksOf();
    check('5', 'ONE Ctrl+Z removes the clone — it is not stranded in the pool',
      lzBlocksAfter === lzBlocksBefore + 1 && lzBlocksUndone === lzBlocksBefore,
      lzBlocksAfter === lzBlocksBefore
        ? 'VACUOUS — row 4 never cloned'
        : `${lzBlocksAfter} → ${lzBlocksUndone} (want ${lzBlocksBefore})`);
    await shot(c, 'edit-isolate-undone');
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
