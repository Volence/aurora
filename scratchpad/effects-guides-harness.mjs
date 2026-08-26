#!/usr/bin/env node
// CAN AN AUTHOR ACTUALLY DRAG A PARALLAX LAYER, IN THE RUNNING APP?
//
// ROADMAP item 43 part 1 draws each selected effects scene's layers as
// horizontal guides on the map canvas and lets the author drag one to set its
// `world_y`. Every word of that sentence is invisible to the node suite: React,
// a canvas, a pan/zoom transform, and mousedown/mousemove/mouseup. 4,645 vitest
// tests pass over this feature and not one of them can tell a drawn line from a
// dead one, or a wired handler from an unwired one.
//
// So this file drives the REAL app: real CDP mouse events on the real
// #map-canvas, and then reads the MODEL back through `window.__dbg.aeon` and
// the canvas's own PIXELS to see what the gesture did.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. NOTHING ON SCREEN. Section 4 samples the map canvas's actual pixels for the
//    guide's colour at the row the app says it drew one, and — the half that
//    makes it a measurement rather than a coincidence — at rows 24px above and
//    below, which must NOT be that colour. A row that only asked "is the cyan
//    channel high somewhere" would pass on a cyan background.
//
// 2. AN UNDO STACK WITH 40 ENTRIES FROM ONE GESTURE. Row 5c drags across ten
//    mousemove events and then presses Ctrl+Z ONCE. If the drag committed per
//    move, one undo lands nine moves short and the row fails on the value.
//
// 3. A NO-OP THAT EATS AN UNDO STEP. Row 6 drags out and back to the row it
//    started on, then presses Ctrl+Z once: if that release wrote a command, the
//    undo is consumed by it and the PREVIOUS drag survives. The pre-state is
//    part of the assertion, which is the trap the effects-scene harness's row 7c
//    fell into once (an undo-to-null proves nothing if it was never non-null).
//
// 4. A DRAG THAT OUTLIVES ITS SUBJECT. Row 7 removes a layer MID-DRAG through a
//    synthetic DOM click — a non-pointer path, exactly the shape of the bug this
//    repo already has on record (a window keydown switched the document under an
//    in-flight gesture and it wrote stale indices once per mousemove) — and then
//    releases. Nothing may be written.
//
// 5. A CLOCK NOBODY ASKED FOR. Section 9 sits on the Effects facet with guides
//    DRAWN for 3s and asserts zero map repaints while the page is provably still
//    painting. MapViewport's measured zero-idle-repaint property (37/37) is what
//    this parcel was told not to spend.
//
// ANTI-VACUOUS THROUGHOUT. `__dbg.aeon.guides()` is a PUBLISH — MapViewport
// writes it at the end of its draw body — so `active:false` and a stalled
// `paints` counter are both real answers a row can fail on. Every row that could
// pass on an empty screen has a companion proving the instrument saw its
// subject: the project is open with sections, the scene is in the model, the
// guide report is active with the right scene id and the right number of rows,
// the paint counter advanced.
//
// ⚠ THE FIXTURE ALREADY HAS A SCENE. `aeon/games/sonic4/data/editor/effects/`
// held `ojz_act1_start` (5 layers) when this was written — the effects-scene
// harness's docblock says it does NOT, and that was true in August 2026 and is
// not any more. So NOTHING below indexes `scenesJson()` by POSITION: every read
// is `sceneOf(doc)`, by id. The first run of this harness did index by position
// and reported eleven failures, all of them the harness reading a different
// scene's layer 0 than the one the gesture was moving.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed and no save is called, so
// the aeon tree is left exactly as found. The run ends by undoing the session
// back to the fixture's own scene list and reloading the page.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     node scratchpad/effects-guides-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9394);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently re-verifies
// the branch. Same reasoning (and the same incident) as effects-scene-harness.
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-effects-guides`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'guide_probe';
/** Where the harness parks layer 0 before it starts dragging. Any row well
 *  inside the viewport works; 200 is far enough from the top edge that the
 *  guide's label draws ABOVE the line (the branch a guide at y=0 does not
 *  take), so section 4's pixel probe is sampling the line, not the plate. */
const START_WORLD_Y = 200;
/** The x the pixel probe and every mouse event use: the middle of the canvas,
 *  well clear of the label plate at x<~100. */
const PROBE_X_FRAC = 0.5;

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
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
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
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-effects-guides/${name}.png`);
}

// A React-controlled input ignores `el.value = x`; the native setter plus a
// bubbling event is what a real keystroke looks like from React's side.
const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

/** The map canvas's on-screen box, so mouse events land in the right place. */
const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

/**
 * One pixel off the LIVE map canvas.
 *
 * getContext('2d') returns the context the app already drew with, so this reads
 * the composited result — level art, overlays and guides — not a fresh surface.
 */
const PIXEL_AT = (x, y) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(Math.round(${x}), Math.round(${y}), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
})()`;

const REPAINT_PROBE = String.raw`
(() => {
  if (window.__guideProbe) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
  window.__guideProbe = P;
  P.bound = () => P.canvas === document.getElementById('map-canvas');
  const tick = () => { if (P.ticking) { P.ticks++; requestAnimationFrame(tick); } };
  P.start = () => { if (!P.ticking) { P.ticking = true; requestAnimationFrame(tick); } };
  P.stop = () => { P.ticking = false; };
  // The same repaint START signal every MapViewport harness uses: the draw
  // effect's canvas.width assignment.
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) { if (this === P.canvas) P.repaints++; return wd.set.call(this, v); },
  });
  return 'installed';
})()`;

/**
 * How far a pixel is from the guide's colour, as a plain max-channel distance.
 *
 * The colour is READ OFF THE APP rather than typed here: `EFFECTS_GUIDE_LINE` is
 * `rgba(80,220,240,0.75)` composited over whatever the map painted, so the exact
 * pixel is unpredictable and a hardcoded triple would be a pin. What IS
 * predictable is the SHAPE: a strongly cyan pixel — blue and green both high,
 * red much lower. That is the predicate, and section 4's off-line samples are
 * what stop it passing on a cyan-ish background.
 */
function cyanness(p) {
  if (!p) return -1;
  return Math.min(p.g, p.b) - p.r;
}

/** The scene under test, BY ID. Never `doc[0]` — see the fixture note above. */
function sceneOf(doc) {
  return doc.find((s) => s.id === SCENE_ID) ?? null;
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    // ---- 0. PROVENANCE. ---------------------------------------------------
    // `__dbg.aeon.guides` is introduced by THIS branch and exists nowhere on
    // master, so its presence is what says the bundle under test contains the
    // parcel. Without this row every PASS below could be describing a build
    // that has none of it.
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.guides === "function"');
    check('0a', 'the build under test contains the guide probe (this branch, not master)',
      haveProbe === true, `${ROOT}/dist`);
    if (!haveProbe) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon. ----------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    // ---- 2. The Effects facet. -------------------------------------------
    await sleep(2500);
    const pill = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill', pill === true);
    await sleep(1200);
    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(Scenes|Layers|Section assignment)/.test(t))`);
    check('2b', 'ANTI-VACUOUS: the Effects panel is mounted',
      headings.includes('Scenes'), JSON.stringify(headings));

    // ---- 3. Author a scene through the real form. ------------------------
    // The fixture's own scenes, so every count below is a DELTA and the teardown
    // knows what "as found" means.
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(800);
    let scenes = await c.json('window.__dbg.aeon.scenes()');
    check('3a', 'ANTI-VACUOUS: the scene this harness authored exists in the model',
      scenes.some((s) => s.id === SCENE_ID)
      && scenes.length === scenes0.length + 1,
      `before=${JSON.stringify(scenes0.map((s) => s.id))} after=${JSON.stringify(scenes.map((s) => s.id))}`);

    // THE LIFT ITSELF. The panel's pick used to be React.useState inside
    // EffectsScenePanel; it is now editorStore.selectedEffectsSceneId, which is
    // the only reason MapViewport can draw anything at all. On master this
    // reads `undefined` because the field does not exist.
    const picked = await c.evalExpr('window.__dbg.aeon.selectedScene()');
    check('3b', "the panel's scene pick reached the SHARED store (the item-43 lift)",
      picked === SCENE_ID, `selectedScene()=${JSON.stringify(picked)}`);

    // Park layer 0 somewhere well inside the viewport, through the panel's own
    // spinner — the control this gesture is the second spelling of.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input[type=number]')].find(e => /^Layer 0 world_y/.test(e.title||''))`,
      START_WORLD_Y));
    // Pin the camera so the arithmetic below is checkable. Read it BACK rather
    // than assuming the set stuck: setViewport clamps.
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(900);
    const view = await c.json('window.__dbg.view()');
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('3c', 'ANTI-VACUOUS: layer 0 is parked at a known world_y with a known camera',
      sceneOf(doc)?.layers?.[0]?.world_y === START_WORLD_Y && view.zoom === 1 && view.y === 0,
      `world_y=${sceneOf(doc)?.layers?.[0]?.world_y} view=${JSON.stringify(view)}`);

    // ---- 4. IS THERE A LINE ON THE CANVAS? -------------------------------
    const rect = await c.json(CANVAS_RECT);
    check('4a', 'ANTI-VACUOUS: the map canvas is mounted and has a real box',
      !!rect && rect.width > 200 && rect.height > 200, JSON.stringify(rect));

    let guides = await c.json('window.__dbg.aeon.guides()');
    check('4b', 'ANTI-VACUOUS: the last repaint DREW guides, for this scene, one per layer',
      guides.active === true && guides.sceneId === SCENE_ID
      && guides.rows.length === sceneOf(doc).layers.length && guides.paints > 0,
      JSON.stringify(guides));

    // The published geometry against the contract, computed from two
    // INDEPENDENT sources — the view store and the document. This is not the
    // harness re-deriving the answer it is checking: `guides()` is what
    // MapViewport actually drew, and this is what it was supposed to draw.
    const expectY = (worldY) => (worldY - view.y) * view.zoom;
    check('4c', 'the drawn row is at (world_y - vpY) * zoom, exactly',
      guides.rows[0].canvasY === expectY(START_WORLD_Y),
      `drawn canvasY=${guides.rows[0]?.canvasY} contract=${expectY(START_WORLD_Y)}`);

    // AND NOW THE PIXELS. Everything above could be true of a draw pass that
    // computes a guide and then never strokes it.
    const px = Math.round(rect.width * PROBE_X_FRAC);
    const onLine = await c.json(PIXEL_AT(px, guides.rows[0].canvasY));
    const above = await c.json(PIXEL_AT(px, guides.rows[0].canvasY - 24));
    const below = await c.json(PIXEL_AT(px, guides.rows[0].canvasY + 24));
    check('4d', 'the canvas is CYAN on that row and not 24px either side of it',
      cyanness(onLine) > 40 && cyanness(above) < 20 && cyanness(below) < 20,
      `on=${JSON.stringify(onLine)}(${cyanness(onLine)}) `
      + `above=${JSON.stringify(above)}(${cyanness(above)}) `
      + `below=${JSON.stringify(below)}(${cyanness(below)})`);
    await shot(c, '1-guide-drawn');

    // ---- 5. THE DRAG. -----------------------------------------------------
    const mouse = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1, ...extra,
    });
    const DRAG_TO_CANVAS_Y = 380;
    const expectedWorldY = Math.round(view.y + DRAG_TO_CANVAS_Y / view.zoom);

    // Hover first: the cursor over a guide must say it is grabbable, and that
    // is the only thing on screen that says so before the press.
    await mouse('mouseMoved', rect.left + px, rect.top + expectY(START_WORLD_Y), { buttons: 0 });
    await sleep(400);
    const cursor = await c.evalExpr(
      `getComputedStyle(document.getElementById('map-canvas').parentElement).cursor`);
    check('5a', 'hovering a guide offers the resize cursor, not the pan tool\'s grab',
      cursor === 'ns-resize', `cursor=${cursor}`);

    await mouse('mousePressed', rect.left + px, rect.top + expectY(START_WORLD_Y));
    // TEN moves, not one. If the gesture commits per move, section 5c's single
    // Ctrl+Z lands nine moves short of where it started.
    const y0 = expectY(START_WORLD_Y);
    for (let i = 1; i <= 10; i++) {
      await mouse('mouseMoved', rect.left + px, rect.top + y0 + ((DRAG_TO_CANVAS_Y - y0) * i) / 10);
      await sleep(40);
    }
    // Mid-drag, before release: the PREVIEW must already be showing the new row
    // while the document still holds the old one.
    const midGuides = await c.json('window.__dbg.aeon.guides()');
    const midDoc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5b', 'the drag PREVIEWS live while leaving the document alone',
      midGuides.dragIndex === 0
      && Math.abs(midGuides.rows[0].canvasY - DRAG_TO_CANVAS_Y) < 2
      && sceneOf(midDoc).layers[0].world_y === START_WORLD_Y,
      `preview canvasY=${midGuides.rows[0]?.canvasY} dragIndex=${midGuides.dragIndex} `
      + `document world_y=${sceneOf(midDoc)?.layers?.[0]?.world_y}`);
    await shot(c, '2-mid-drag');

    await mouse('mouseReleased', rect.left + px, rect.top + DRAG_TO_CANVAS_Y);
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5c', 'releasing writes the dragged world_y into the DOCUMENT',
      sceneOf(doc).layers[0].world_y === expectedWorldY,
      `world_y=${sceneOf(doc)?.layers?.[0]?.world_y} expected=${expectedWorldY}`);
    await shot(c, '3-after-drag');

    // ONE GESTURE, ONE UNDO STEP. Ten mousemoves went by.
    const undo = async () => {
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await sleep(600);
    };
    await undo();
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5d', 'ONE Ctrl+Z undoes the WHOLE drag — ten moves, one command',
      sceneOf(doc).layers[0].world_y === START_WORLD_Y,
      `after one undo world_y=${sceneOf(doc)?.layers?.[0]?.world_y}, expected ${START_WORLD_Y}`
      + ` (a per-move commit lands at ~${Math.round(view.y + (y0 + (DRAG_TO_CANVAS_Y - y0) * 0.9) / view.zoom)})`);

    // ---- 6. A NO-OP DRAG COMMITS NOTHING. --------------------------------
    // Set up a real edit to undo, then drag out and BACK to the row we started
    // on. If that release wrote a command, the single Ctrl+Z below is eaten by
    // it and the real edit survives.
    await mouse('mousePressed', rect.left + px, rect.top + expectY(START_WORLD_Y));
    await mouse('mouseMoved', rect.left + px, rect.top + DRAG_TO_CANVAS_Y);
    await mouse('mouseReleased', rect.left + px, rect.top + DRAG_TO_CANVAS_Y);
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const realEditLanded = sceneOf(doc).layers[0].world_y === expectedWorldY;

    await mouse('mousePressed', rect.left + px, rect.top + DRAG_TO_CANVAS_Y);
    await mouse('mouseMoved', rect.left + px, rect.top + DRAG_TO_CANVAS_Y - 60);
    await mouse('mouseMoved', rect.left + px, rect.top + DRAG_TO_CANVAS_Y);
    await mouse('mouseReleased', rect.left + px, rect.top + DRAG_TO_CANVAS_Y);
    await sleep(600);
    await undo();
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6a', 'a drag released where it started consumes NO undo step',
      realEditLanded && sceneOf(doc).layers[0].world_y === START_WORLD_Y,
      `real edit landed=${realEditLanded}; after the no-op drag + one undo `
      + `world_y=${sceneOf(doc)?.layers?.[0]?.world_y}, expected ${START_WORLD_Y}`
      + ` (${expectedWorldY} means the no-op ate the undo)`);

    // ---- 7. A DRAG WHOSE SUBJECT MOVES UNDER IT. -------------------------
    // Two layers, then remove layer 0 MID-DRAG through a synthetic DOM click —
    // a non-pointer path, which is the shape of the bug already on record here.
    // `layers[0]` still resolves afterwards, so a gesture without a witness
    // would happily write the dragged row into a DIFFERENT layer.
    await c.evalExpr(clickByText('/Add layer/'));
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const twoLayers = sceneOf(doc).layers.length === 2;
    const survivorY = sceneOf(doc).layers[1]?.world_y;
    check('7a', 'ANTI-VACUOUS: there are two layers, so an index CAN go stale',
      twoLayers, `layers=${JSON.stringify(sceneOf(doc).layers.map((l) => l.world_y))}`);

    await mouse('mousePressed', rect.left + px, rect.top + expectY(START_WORLD_Y));
    await mouse('mouseMoved', rect.left + px, rect.top + expectY(START_WORLD_Y) + 40);
    const removed = await c.evalExpr(clickByText('/Remove layer 0/'));
    await sleep(600);
    await mouse('mouseMoved', rect.left + px, rect.top + expectY(START_WORLD_Y) + 120);
    await mouse('mouseReleased', rect.left + px, rect.top + expectY(START_WORLD_Y) + 120);
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('7b', 'a layer removed mid-drag: the release writes NOTHING through the stale index',
      removed === true && sceneOf(doc).layers.length === 1
      && sceneOf(doc).layers[0].world_y === survivorY,
      `removed=${removed} layers=${JSON.stringify(sceneOf(doc).layers.map((l) => l.world_y))}`
      + ` survivor was world_y=${survivorY}`);

    // Put the two layers back before the facet rows.
    await undo();
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('7c', 'ANTI-VACUOUS: the mid-drag removal was a normal undoable edit',
      sceneOf(doc).layers.length === 2, `layers=${sceneOf(doc).layers.length}`);

    // ---- 8. THE FACET IS THE GATE. ---------------------------------------
    const paintsBefore = (await c.json('window.__dbg.aeon.guides()')).paints;
    const toLayout = await c.evalExpr(clickByText('/^Layout$/'));
    await sleep(1400);
    guides = await c.json('window.__dbg.aeon.guides()');
    check('8a', 'ANTI-VACUOUS: leaving the facet repainted the map at least once',
      toLayout === true && guides.paints > paintsBefore,
      `clicked=${toLayout} paints ${paintsBefore} -> ${guides.paints}`);
    const layoutRect = await c.json(CANVAS_RECT);
    const layoutPx = await c.json(PIXEL_AT(Math.round(layoutRect.width * PROBE_X_FRAC),
      expectY(START_WORLD_Y)));
    check('8b', 'off the Effects facet NOTHING draws a guide — report inactive AND no cyan row',
      guides.active === false && guides.rows.length === 0 && cyanness(layoutPx) < 20,
      `active=${guides.active} rows=${guides.rows.length} `
      + `pixel=${JSON.stringify(layoutPx)}(${cyanness(layoutPx)})`);
    await shot(c, '4-layout-facet-no-guides');

    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1400);
    guides = await c.json('window.__dbg.aeon.guides()');
    check('8c', 'coming back to Effects draws them again', guides.active === true,
      JSON.stringify({ active: guides.active, rows: guides.rows.length }));

    // ---- 8d. A PAN MOVES THE GUIDE, out of the draw pass that already runs.
    await c.evalExpr('window.__dbg.setView(0, 64, 2)');
    await sleep(900);
    const view2 = await c.json('window.__dbg.view()');
    guides = await c.json('window.__dbg.aeon.guides()');
    const expect2 = (guides.rows[0].worldY - view2.y) * view2.zoom;
    check('8d', 'a pan+zoom moves the guide to the new contract row, with no clock involved',
      guides.active === true && guides.rows[0].canvasY === expect2 && expect2 !== expectY(START_WORLD_Y),
      `view=${JSON.stringify(view2)} drawn=${guides.rows[0]?.canvasY} contract=${expect2}`);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(700);

    // ---- 9. NO CLOCK WAS ADDED. ------------------------------------------
    const installed = await c.evalExpr(REPAINT_PROBE);
    check('9a', 'ANTI-VACUOUS: the repaint probe bound to the live #map-canvas',
      installed === 'installed' || installed === 'already', `install=${installed}`);
    guides = await c.json('window.__dbg.aeon.guides()');
    check('9b', 'ANTI-VACUOUS: guides ARE being drawn during the idle measurement',
      guides.active === true && guides.rows.length > 0,
      JSON.stringify({ active: guides.active, rows: guides.rows.length }));
    await c.evalExpr('window.__guideProbe.repaints = 0; window.__guideProbe.ticks = 0; window.__guideProbe.start()');
    await sleep(3000);
    const idle = await c.json(
      '({ repaints: window.__guideProbe.repaints, ticks: window.__guideProbe.ticks, bound: window.__guideProbe.bound() })');
    await c.evalExpr('window.__guideProbe.stop()');
    check('9c', 'ANTI-VACUOUS: the page IS still painting and the probe is still bound',
      idle.ticks > 60 && idle.bound === true, JSON.stringify(idle));
    check('9d', 'guides add NO idle map repaints (MapViewport 37/37 stays conditioned)',
      idle.repaints === 0,
      `${idle.repaints} repaints over 3.0s idle against ${idle.ticks} rAF ticks`);

    // ---- 10. Leave the tree as found. ------------------------------------
    let undos = 0;
    for (let i = 0; i < 24; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await undo();
      undos++;
    }
    scenes = await c.json('window.__dbg.aeon.scenes()');
    check('10a', 'the whole session undoes back to the fixture — nothing was saved',
      undos > 0 && JSON.stringify(scenes.map((s) => s.id)) === JSON.stringify(scenes0.map((s) => s.id)),
      `${undos} undos; left ${JSON.stringify(scenes.map((s) => s.id))}, `
      + `found ${JSON.stringify(scenes0.map((s) => s.id))}`);
    note('NOT COVERED HERE: a disabled layer (`enabled: false`) drawing a dashed guide.',
      'The panel has no `enabled` control and no command writes that field, so there is '
      + 'no gesture to drive. It is covered red-first in the node suite '
      + '(canvas/__tests__/effects-guides.test.ts) and nowhere on a canvas.');
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
