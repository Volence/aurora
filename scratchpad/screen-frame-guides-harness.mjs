#!/usr/bin/env node
// THREE THINGS THE OWNER HIT LIVE, DRIVEN IN THE REAL APP.
//
//   A. "if I zoom in the bands hold relative to my screen, not the bg" — the
//      layer guides on a LOCKED scene were anchored to `vp.y`, the viewport's
//      own top edge, which is not a position in the world at all. They now sit
//      on the SCREEN FRAME, a world rectangle.
//   B. `fire: screen line 303 outside 3..223`, three dead builds in twenty
//      minutes (303/319, then 304/318, then 302/317) — every one produced by
//      DRAGGING a guide, because in screen space `canvasYToLayerTop` collapses
//      to `canvasY / zoom` and nothing on the canvas marked where 223 ended.
//   C. "I press add a band bank and idk where it is" — the band landed in a
//      default-collapsed section, unselected and unscrolled-to.
//
// All three are rendered surfaces. ~5,100 vitest tests pass over this tree and
// not one of them can see a canvas, a React commit or a scroll position.
//
// ═══ THE ROW THAT ACTUALLY DISCRIMINATES, AND THE ONES THAT DO NOT ═══
//
// ⚠ A ROW ASSERTING "a guide is drawn at canvas Y = f(zoom)" PASSES IDENTICALLY
// WHETHER THE ORIGIN IS THE VIEWPORT OR THE FRAME. A single static observation
// cannot tell the two apart at all — at `vpY = 0` with the frame at world 0 they
// are the SAME NUMBER, which is the coincidence that hid this for a whole
// parcel. So:
//
//   THE CATCHER for A is row 3c: PAN and ZOOM the editor and assert the guide's
//   WORLD position is unchanged. World position is `vpY + canvasY / zoom` — the
//   map composes every section under the same transform, so "the same world Y"
//   IS "the same background pixel". Under the old origin that quantity is
//   `vpY + top` and moves by exactly the pan.
//
//   THE CATCHER for B is row 5c: a drag toward the bottom of the canvas AT ZOOM
//   2. At zoom 1 on a tall canvas a drag may never leave 0..223 and the row
//   would pass on the broken build too — a can-only-return-green row. At zoom 2
//   the legal band is the first 446 canvas px and the release is well past it.
//
//   THE CATCHER for C is row 7d: the band card ELEMENT EXISTS in the DOM after
//   the click, having not existed before it. The section is `defaultCollapsed`
//   and renders no children while shut, so the element's existence is the reveal
//   and the selection is `bandLensTarget`, read separately.
//
// NON-DISCRIMINATING ROWS ARE LABELLED `[anti-vacuous]` IN THEIR NAME. They
// exist so a green catcher cannot be green because nothing was on screen.
//
// ═══ AIM AT INTEGERS ═══
//
// `devicePixelRatio` here has been seen at both 1 and 1.35 within one session;
// at 1.35 the canvas rect is fractional and an event aimed at `rect.top + N`
// lands one device row off. Every mouse coordinate goes through `aimY`/`aimX`,
// which round to the integer client pixel CDP will deliver, and every
// expectation is derived from THAT integer through the app's own contract.
// dpr, rect, load average and uptime are printed beside every run.
//
// ⚠ IT WRITES NOTHING TO THE AEON TREE. Ctrl+S is never pressed. It opens a
// COPY of aeon under the scratchpad (AEON_DIR), never the owner's live tree and
// never `scratchpad/fixtures/aeon-build-pin`, which his window has open.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Build first:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:          AEON_DIR=<copy> node scratchpad/screen-frame-guides-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9401);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN ?? `${ROOT}/node_modules/.bin/electron`;
const AEONDIR = process.env.AEON_DIR;
if (!AEONDIR || !existsSync(AEONDIR)) {
  throw new Error('AEON_DIR must point at a COPY of an aeon tree — never the live one');
}
const SHOTS = `${ROOT}/scratchpad/shots-screen-frame`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'frame_probe';
/** Where the probe parks layer 0. Well inside the 3..223 fire band. */
const START_TOP = 112;

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
  console.log(`        shot → scratchpad/shots-screen-frame/${name}.png`);
}

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

const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

const PIXEL_AT = (x, y) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(Math.round(${x}), Math.round(${y}), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
})()`;

/** EFFECTS_GUIDE_LINE is rgba(80,220,240,.75): blue+green high, red much lower. */
const cyanness = (p) => (p ? Math.min(p.g, p.b) - p.r : -1);
/** SCREEN_FRAME_LINE is rgba(255,170,60,.85): red high, blue much lower. */
const orangeness = (p) => (p ? p.r - p.b : -1);

const sceneOf = (doc) => doc.find((s) => s.id === SCENE_ID) ?? null;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  note('environment',
    `uptime: ${os.uptime().toFixed(0)}s · load ${os.loadavg().map((n) => n.toFixed(2)).join(' ')} · aeon copy ${AEONDIR}`);
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

    // ---- 0. PROVENANCE ----------------------------------------------------
    const haveGuides = await c.evalExpr('typeof window.__dbg.aeon.guides === "function"');
    const haveFrame = await c.evalExpr('typeof window.__dbg.aeon.screenFrame === "function"');
    check('0a', '[anti-vacuous] the build under test has both probes (guides + screen frame)',
      haveGuides === true && haveFrame === true, `${ROOT}/dist`);
    if (!haveGuides || !haveFrame) throw new Error('wrong build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open the aeon COPY -------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', '[anti-vacuous] the aeon COPY is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    await sleep(2500);
    const pill = await c.evalExpr(clickByText('/^Effects$/'));
    check('1b', '[anti-vacuous] the facet bar offers an Effects pill', pill === true);
    await sleep(1200);

    // ---- 2. A scene of our own, locked by default -------------------------
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    const scenes = await c.json('window.__dbg.aeon.scenes()');
    check('2a', '[anti-vacuous] the probe scene exists in the model',
      scenes.some((s) => s.id === SCENE_ID) && scenes.length === scenes0.length + 1,
      JSON.stringify(scenes.map((s) => s.id)));

    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input[type=number]')].find(e => /^Layer 0 (world_y|Screen line)/.test(e.title||''))`,
      START_TOP));
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(900);

    let guides = await c.json('window.__dbg.aeon.guides()');
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('2b', '[anti-vacuous] the scene is LOCKED, so its tops are screen lines',
      guides.space === 'screen' && sceneOf(doc)?.v_factor === 15,
      `space=${guides.space} v_factor=${sceneOf(doc)?.v_factor}`);
    check('2c', '[anti-vacuous] the last repaint DREW guides for this scene, one per layer',
      guides.active === true && guides.sceneId === SCENE_ID
      && guides.rows.length === sceneOf(doc).layers.length && guides.paints > 0,
      JSON.stringify({ active: guides.active, id: guides.sceneId, rows: guides.rows.length, paints: guides.paints }));
    check('2d', '[anti-vacuous] layer 0 is parked at a known top',
      sceneOf(doc)?.layers?.[0]?.world_y === START_TOP, `world_y=${sceneOf(doc)?.layers?.[0]?.world_y}`);

    const rect = await c.json(CANVAS_RECT);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    note('aim environment',
      `dpr=${dpr} rect=${JSON.stringify(rect)} load=${os.loadavg().map((n) => n.toFixed(2)).join(' ')} uptime=${os.uptime().toFixed(0)}s`);
    check('2e', '[anti-vacuous] the map canvas is mounted and has a real box',
      !!rect && rect.width > 200 && rect.height > 200, JSON.stringify(rect));

    // ---- 3. TASK A: THE FRAME, AND WHERE THE GUIDES SIT ON IT -------------

    // 3a. The frame is on screen WITHOUT the overlay toggle, because the guides
    //     need it. On master `showScreenFrame` defaults false and this reports
    //     inactive while screen-space guides draw.
    const ovl = await c.json('window.__dbg.view()');
    let frame = await c.json('window.__dbg.aeon.screenFrame()');
    const toggleOn = await c.evalExpr(
      `!!(window.__dbg.overlays ? window.__dbg.overlays().showScreenFrame : false)`).catch(() => false);
    check('3a', 'a locked scene FORCES the screen frame on — a "screen line" needs a screen',
      frame.active === true && frame.rect !== null,
      `frame=${JSON.stringify(frame)} overlayToggle=${toggleOn} view=${JSON.stringify(ovl)}`);

    // 3b. The rule, stated directly: the guide for top T sits exactly T*zoom
    //     canvas px below the FRAME's top edge.
    let view = await c.json('window.__dbg.view()');
    const gapAt = (g, f, v) => (g.rows[0].canvasY - f.rect.y) / v.zoom;
    check('3b', 'the guide for top T sits exactly T screen lines below the FRAME top',
      gapAt(guides, frame, view) === START_TOP,
      `guideCanvasY=${guides.rows[0].canvasY} frameTopCanvasY=${frame.rect.y} zoom=${view.zoom} `
      + `gap=${gapAt(guides, frame, view)} expected=${START_TOP}`);

    // 3c. ★ THE CATCHER ★ — pan and zoom, and the guide must not move in the
    //     world. `vpY + canvasY/zoom` is the world Y the map's own transform
    //     puts that canvas row at, so "unchanged" IS "the same background
    //     pixel". Under the viewport origin this quantity is `vpY + top`.
    const worldOfGuide = (g, v) => v.y + g.rows[0].canvasY / v.zoom;
    const sample = async (x, y, z) => {
      await c.evalExpr(`window.__dbg.setView(${x}, ${y}, ${z})`);
      await sleep(450);
      const v = await c.json('window.__dbg.view()');
      const g = await c.json('window.__dbg.aeon.guides()');
      const f = await c.json('window.__dbg.aeon.screenFrame()');
      return { v, g, f, world: worldOfGuide(g, v) };
    };
    const s0 = await sample(0, 0, 1);
    const sPan = await sample(0, 100, 1);
    const sZoom = await sample(0, 100, 2);
    const sZoomOut = await sample(0, 40, 0.5);
    const worlds = [s0.world, sPan.world, sZoom.world, sZoomOut.world];
    check('3c', '★ CATCHER ★ the guide holds the SAME WORLD ROW across a pan and two zooms '
      + '(under the old viewport origin it moves by exactly the pan)',
      worlds.every((w) => w === worlds[0]),
      `worlds=${JSON.stringify(worlds)} ; canvasY per sample=`
      + JSON.stringify([s0, sPan, sZoom, sZoomOut].map((s) => ({ vpY: s.v.y, zoom: s.v.zoom, canvasY: s.g.rows[0].canvasY })))
      + ` ; under the OLD origin these worlds would be ${JSON.stringify([0, 100, 100, 40].map((p) => p + START_TOP))}`);

    // 3d. The paint counter advanced across those samples, so 3c is comparing
    //     four REPAINTS and not one stale publish read four times.
    check('3d', '[anti-vacuous] every sample in 3c came from a fresh repaint',
      sPan.g.paints > s0.g.paints && sZoom.g.paints > sPan.g.paints
      && sZoomOut.g.paints > sZoom.g.paints,
      `paints=${JSON.stringify([s0.g.paints, sPan.g.paints, sZoom.g.paints, sZoomOut.g.paints])}`);

    // 3e. AND THE PIXELS. Everything above could be true of a draw pass that
    //     computes a guide and never strokes it, and of a frame that reports a
    //     rect it never drew.
    await c.evalExpr('window.__dbg.setView(0, 100, 2)');
    await sleep(500);
    view = await c.json('window.__dbg.view()');
    guides = await c.json('window.__dbg.aeon.guides()');
    frame = await c.json('window.__dbg.aeon.screenFrame()');
    const probeX = Math.round(rect.width * 0.5);
    const onLine = await c.json(PIXEL_AT(probeX, guides.rows[0].canvasY));
    const above = await c.json(PIXEL_AT(probeX, guides.rows[0].canvasY - 24));
    const below = await c.json(PIXEL_AT(probeX, guides.rows[0].canvasY + 24));
    check('3e', 'the canvas is CYAN on the guide row after the pan+zoom, and not 24px either side',
      cyanness(onLine) > 40 && cyanness(above) < 20 && cyanness(below) < 20,
      `canvasY=${guides.rows[0].canvasY} on=${JSON.stringify(onLine)}(${cyanness(onLine)}) `
      + `above=${cyanness(above)} below=${cyanness(below)}`);

    // 3f. The frame's own stroke — sampled at view (0,0,1), where the whole
    //     rectangle is on the canvas. Its BOTTOM edge, not its top: at anchor 0
    //     with vpY 0 the top edge lands on canvas row 0, which is the one row a
    //     sample cannot have a control 40px above.
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(450);
    const frameAt0 = await c.json('window.__dbg.aeon.screenFrame()');
    const fx = Math.round(frameAt0.rect.x + frameAt0.rect.w / 2);
    const fBottom = frameAt0.rect.y + frameAt0.rect.h;
    const onFrameEdge = await c.json(PIXEL_AT(fx, fBottom));
    const offFrame = await c.json(PIXEL_AT(fx, fBottom + 40));
    check('3f', 'the FRAME is really stroked at the rect it reports (orange on its bottom edge, not 40px below)',
      orangeness(onFrameEdge) > 40 && orangeness(offFrame) < 30,
      `frameRect=${JSON.stringify(frameAt0.rect)} onEdge=${JSON.stringify(onFrameEdge)}(${orangeness(onFrameEdge)}) `
      + `40px below=${JSON.stringify(offFrame)}(${orangeness(offFrame)})`);
    await shot(c, 'A-frame-and-guides');

    // 3g. DRAG THE FRAME by its top edge and the guides must follow it, by
    //     exactly the frame's delta. This is the direct statement that the two
    //     read ONE anchor, and it exercises the real gesture rather than a
    //     store door — the frame's own edge hit test has to be live for a
    //     forced-on frame, or the author would see a frame they cannot move.
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(450);
    view = await c.json('window.__dbg.view()');
    frame = await c.json('window.__dbg.aeon.screenFrame()');
    guides = await c.json('window.__dbg.aeon.guides()');
    const gBefore = guides.rows[0].canvasY;
    const fBefore = frame.anchor.y;
    const edgeX = Math.round(rect.left + frame.rect.x + frame.rect.w / 2);
    const edgeY = Math.round(rect.top + frame.rect.y);
    const FRAME_DRAG_PX = 90;
    const mouseA = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1, ...extra,
    });
    await mouseA('mouseMoved', edgeX, edgeY, { buttons: 0 });
    await sleep(250);
    await mouseA('mousePressed', edgeX, edgeY);
    for (let i = 1; i <= 6; i++) {
      await mouseA('mouseMoved', edgeX, edgeY + Math.round((FRAME_DRAG_PX * i) / 6));
      await sleep(40);
    }
    await mouseA('mouseReleased', edgeX, edgeY + FRAME_DRAG_PX);
    await sleep(600);
    const frame2 = await c.json('window.__dbg.aeon.screenFrame()');
    const guides2 = await c.json('window.__dbg.aeon.guides()');
    const frameDelta = frame2.anchor.y - fBefore;
    check('3g', 'the frame\'s EDGE is grabbable while it is forced on, and dragging it moves '
      + 'the guides by exactly the same world delta',
      frameDelta > 0 && (guides2.rows[0].canvasY - gBefore) === frameDelta * view.zoom,
      `frame anchor ${fBefore} -> ${frame2.anchor.y} (delta ${frameDelta}); `
      + `guide canvasY ${gBefore} -> ${guides2.rows[0].canvasY} `
      + `(delta ${guides2.rows[0].canvasY - gBefore}, expected ${frameDelta * view.zoom})`);
    // Put the frame back so the sections below start from a known anchor.
    await mouseA('mouseMoved', edgeX, edgeY + FRAME_DRAG_PX, { buttons: 0 });
    await sleep(200);
    await mouseA('mousePressed', edgeX, edgeY + FRAME_DRAG_PX);
    for (let i = 1; i <= 6; i++) {
      await mouseA('mouseMoved', edgeX, edgeY + FRAME_DRAG_PX - Math.round((FRAME_DRAG_PX * i) / 6));
      await sleep(40);
    }
    await mouseA('mouseReleased', edgeX, edgeY);
    await sleep(600);
    const frameBack = await c.json('window.__dbg.aeon.screenFrame()');
    check('3h', '[anti-vacuous] the frame is back at its starting anchor for the sections below',
      frameBack.anchor.y === fBefore, `anchor=${JSON.stringify(frameBack.anchor)} expected y=${fBefore}`);

    // ---- 4. TASK B: only the fire-emitting layers are bounded -------------
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(500);

    // 4a. A layer with NO split reaches past 223 — the strict-direction guard.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input[type=number]')].find(e => /^Layer 0 (world_y|Screen line)/.test(e.title||''))`,
      303));
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('4a', '★ a layer with NO split still reaches 303 — Aurora refuses nothing the build accepts',
      sceneOf(doc).layers[0].world_y === 303,
      `world_y=${sceneOf(doc).layers[0].world_y}`);

    // 4b. Turn the split ON at that top: the ADVISORY appears, and the value is
    //     NOT silently moved (ROADMAP row 58 — a warned scene still saves).
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => /vsplit\\.at/.test(e.title||''))`, 'at'));
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const advisoryText = await c.evalExpr(String.raw`
      (() => [...document.querySelectorAll('div,span')]
        .map(e => (e.textContent || ''))
        .filter(t => /outside 3\.\.223|must land on 3\.\.223|3\.\.223/.test(t))
        .sort((a, b) => a.length - b.length)[0] ?? null)()`);
    check('4b', 'turning the split ON at 303 raises the ADVISORY and does NOT move the value',
      advisoryText !== null && /3\.\.223/.test(advisoryText)
      && sceneOf(doc).layers[0].world_y === 303,
      `world_y=${sceneOf(doc).layers[0].world_y} advisory=${JSON.stringify(advisoryText)}`);
    await shot(c, 'B-advisory');

    // 4c. And the spinner now REFUSES to originate one. ⚠ IT TYPES 400, NOT 303:
    //     the field already HOLDS 303 from 4a, and setting a React input to the
    //     value it already has fires no onChange at all — the first spelling of
    //     this row "passed" on a build with no clamp and was proving nothing.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input[type=number]')].find(e => /^Layer 0 (world_y|Screen line)/.test(e.title||''))`,
      400));
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('4c', 'with the split on, TYPING 400 clamps to 223 — the control cannot originate a dead build',
      sceneOf(doc).layers[0].world_y === 223, `world_y=${sceneOf(doc).layers[0].world_y} (typed 400)`);

    // 4d. The advisory is GONE once the value is legal — it is a live reading of
    //     the document, not a sticky banner.
    const advisoryGone = await c.evalExpr(String.raw`
      (() => [...document.querySelectorAll('div,span')]
        .map(e => (e.textContent || ''))
        .filter(t => /becomes a raster fire at screen line/.test(t)).length)()`);
    check('4d', 'the advisory clears when the top becomes authorable',
      advisoryGone === 0, `matching nodes=${advisoryGone}`);

    // ---- 5. TASK B's CATCHER: the DRAG, at zoom 2 ------------------------
    const mouse = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1, ...extra,
    });
    const aimY = (canvasY) => Math.round(rect.top + canvasY);
    const aimX = Math.round(rect.left + probeX);

    const dragTo = async (canvasYTarget) => {
      const g = await c.json('window.__dbg.aeon.guides()');
      const from = g.rows[0].canvasY;
      await mouse('mouseMoved', aimX, aimY(from), { buttons: 0 });
      await sleep(250);
      await mouse('mousePressed', aimX, aimY(from));
      for (let i = 1; i <= 8; i++) {
        await mouse('mouseMoved', aimX, aimY(from + ((canvasYTarget - from) * i) / 8));
        await sleep(35);
      }
      await mouse('mouseReleased', aimX, aimY(canvasYTarget));
      await sleep(500);
    };

    // 5a. ZOOM 2, so the legal band ends less than halfway down the canvas.
    //     At zoom 1 a drag to the bottom may never leave 0..223 at all and the
    //     row would pass on the broken build too.
    await c.evalExpr('window.__dbg.setView(0, 0, 2)');
    await sleep(500);
    view = await c.json('window.__dbg.view()');
    const bandEndsAt = 223 * view.zoom;
    check('5a', '[anti-vacuous] at zoom 2 the legal band ends well above the canvas bottom, '
      + 'so a drag to the bottom is genuinely outside it',
      view.zoom === 2 && bandEndsAt < rect.height - 60,
      `zoom=${view.zoom} band ends at canvasY ${bandEndsAt}, canvas is ${rect.height} tall`);

    const DRAG_TARGET = Math.round(rect.height - 40);
    // The app's own contract on the delivered integer, with NO fire bound in it:
    // this is what the drag WOULD have written before the clamp learned about
    // fires, and it is the number the owner's builds died on.
    const uncappedTop = Math.round((aimY(DRAG_TARGET) - rect.top) / view.zoom);
    note('5 aim', `dpr=${dpr} release aims at clientY ${aimY(DRAG_TARGET)} (canvasY ${DRAG_TARGET}); `
      + `uncapped contract top = ${uncappedTop}; load=${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);

    // 5b. First WITHOUT a split: the drag must reach the uncapped number.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => /vsplit\\.at/.test(e.title||''))`, 'none'));
    await sleep(600);
    await dragTo(DRAG_TARGET);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const noSplitTop = sceneOf(doc).layers[0].world_y;
    check('5b', '★ a drag on a layer with NO split reaches the plane row it aimed at — nothing is refused',
      noSplitTop === uncappedTop, `top=${noSplitTop} contract=${uncappedTop}`);

    // 5c. ★ THE CATCHER ★ — the same drag with the split ON.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => /vsplit\\.at/.test(e.title||''))`, 'at'));
    await sleep(700);
    await dragTo(DRAG_TARGET);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const splitTop = sceneOf(doc).layers[0].world_y;
    check('5c', '★ CATCHER ★ the SAME drag on a fire-emitting layer stops at 223 — '
      + 'the gesture that produced 303/304/302 cannot any more',
      splitTop === 223 && uncappedTop > 223,
      `top=${splitTop}; the same gesture without the fire bound writes ${uncappedTop} `
      + `(and the owner's three dead builds were 303, 304, 302)`);
    await shot(c, 'B-drag-clamped');

    // 5d. ONE undo step for the whole gesture, still.
    const beforeUndo = sceneOf(JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'))).layers[0].world_y;
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await sleep(600);
    const afterUndo = sceneOf(JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'))).layers[0].world_y;
    check('5d', 'the eight-move drag is ONE undo step',
      beforeUndo === 223 && afterUndo === noSplitTop,
      `before=${beforeUndo} after one Ctrl+Z=${afterUndo} (the drag started from ${noSplitTop})`);

    // ---- 6. TASK A, the guide's own drag origin --------------------------
    // With the frame at world 0 and the view panned, a drag must land on the
    // top the FRAME implies, not the one the viewport does. Under the old
    // origin the two differ by exactly the pan.
    await c.evalExpr('window.__dbg.setView(0, 150, 1)');
    await sleep(500);
    view = await c.json('window.__dbg.view()');
    frame = await c.json('window.__dbg.aeon.screenFrame()');
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => /vsplit\\.at/.test(e.title||''))`, 'none'));
    await sleep(600);
    const target6 = Math.round(rect.height * 0.4);
    await dragTo(target6);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const gotTop = sceneOf(doc).layers[0].world_y;
    // The frame-relative contract on the delivered integer.
    const frameContract = Math.round(
      (view.y + (aimY(target6) - rect.top) / view.zoom) - frame.anchor.y);
    const viewportContract = Math.round((aimY(target6) - rect.top) / view.zoom);
    check('6a', 'a drag while PANNED writes the frame-relative top, not the viewport-relative one',
      gotTop === frameContract && frameContract !== viewportContract,
      `top=${gotTop} frame-relative=${frameContract} viewport-relative=${viewportContract} `
      + `(vpY=${view.y} frameY=${frame.anchor.y})`);

    // ---- 7. TASK C: where did my band go? --------------------------------
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(400);

    const bandsBefore = await c.json('window.__dbg.aeon.bands()');
    const budgetBefore = await c.json('window.__dbg.aeon.bandBudget()');
    check('7a', '[anti-vacuous] the band model is readable and has room for one more',
      Array.isArray(bandsBefore) && budgetBefore.bandsRemaining > 0,
      `bands=${bandsBefore.length} remaining=${budgetBefore.bandsRemaining}`);

    // The section arrives collapsed, so the card element must NOT exist yet.
    // That is what makes 7d a real observation rather than a tautology.
    const nextIndex = bandsBefore.length;
    const cardId = `aeon-band-card-${nextIndex}`;
    const cardBefore = await c.evalExpr(`!!document.getElementById(${JSON.stringify(cardId)})`);
    const lensBefore = await c.json('window.__dbg.aeon.bandLensTarget()');
    const hashBefore = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('7b', '[anti-vacuous] before the click there is no such card in the DOM',
      cardBefore === false, `#${cardId} present=${cardBefore} lens=${JSON.stringify(lensBefore)}`);

    const clicked = await c.evalExpr(clickByText('/^Add blank band$/'));
    check('7c', '[anti-vacuous] the tool bar offers the Add blank band chip and it was clicked',
      clicked === true);
    await sleep(1200);

    // 7d. ★ THE CATCHER ★
    const cardAfter = await c.json(String.raw`
      (() => {
        const el = document.getElementById(${JSON.stringify(cardId)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, height: r.height, text: (el.textContent||'').slice(0, 40) };
      })()`);
    const lensAfter = await c.json('window.__dbg.aeon.bandLensTarget()');
    check('7d', '★ CATCHER ★ the new band\'s card is now IN THE DOM (the shut section opened) '
      + 'and the band is SELECTED',
      cardAfter !== null && lensAfter !== null
      && lensAfter.kind === 'band' && lensAfter.index === nextIndex,
      `card=${JSON.stringify(cardAfter)} lens=${JSON.stringify(lensAfter)}`);

    // 7e. And it is IN VIEW inside its scroller, not merely mounted below the
    //     fold — the "scroll to it" half.
    const inView = await c.json(String.raw`
      (() => {
        const el = document.getElementById(${JSON.stringify(cardId)});
        if (!el) return null;
        let p = el.parentElement;
        while (p && getComputedStyle(p).overflowY !== 'auto' && getComputedStyle(p).overflowY !== 'scroll') p = p.parentElement;
        if (!p) return { scroller: null };
        const a = el.getBoundingClientRect(), b = p.getBoundingClientRect();
        return { scroller: p.className || 'unnamed', cardTop: a.top, cardBottom: a.bottom,
                 boxTop: b.top, boxBottom: b.bottom,
                 visible: a.bottom > b.top && a.top < b.bottom };
      })()`);
    check('7e', 'the card is scrolled INTO its scroller\'s visible box',
      inView !== null && inView.visible === true, JSON.stringify(inView));

    // 7f. A toast said so, once.
    const toasts = await c.json('window.__dbg.aeon.toasts()');
    check('7f', 'exactly one toast names the band that was added',
      toasts.filter((t) => /Band \d+ added/.test(t.message)).length === 1,
      JSON.stringify(toasts));

    // 7g. ★ ONE undo step. The selection, the reveal and the scroll must not
    //     have cost a second one: a single Ctrl+Z returns the document to the
    //     exact bytes it held before the click.
    const canUndo = await c.evalExpr('window.__dbg.aeon.canUndo()');
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
    await sleep(900);
    const hashAfterUndo = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const bandsAfterUndo = await c.json('window.__dbg.aeon.bands()');
    check('7g', '★ ONE undoable action: a single Ctrl+Z restores the exact document bytes',
      canUndo === true && hashAfterUndo === hashBefore
      && bandsAfterUndo.length === bandsBefore.length,
      `hashBefore=${hashBefore} afterUndo=${hashAfterUndo} bands ${bandsBefore.length} -> `
      + `${bandsAfterUndo.length}; canUndo before the undo=${canUndo}`);
    await shot(c, 'C-band-followed');

    // 7h. And the PANEL's own chip runs the same follow-up as the tool bar.
    await sleep(400);
    const bandsB2 = await c.json('window.__dbg.aeon.bands()');
    const idx2 = bandsB2.length;
    // ⚠ THE PANEL'S CHIP IS INSIDE A COLLAPSED SECTION. `New band`
    //     (`aeon.bganim.new`) is `defaultCollapsed`, so the chip is not rendered
    //     at all until the header is clicked — the first spelling of this row
    //     reported `clicked=false` and would have read as a broken chip.
    // The header is a `<div onClick>` and BOTH the section wrapper and the
    // header row have the same textContent while the section is shut, so the
    // FIRST match is the wrapper — which has no handler. Take the innermost.
    const opened = await c.evalExpr(String.raw`
      (() => {
        const hits = [...document.querySelectorAll('div')]
          .filter((d) => (d.textContent || '').trim() === 'New band');
        if (!hits.length) return 'no-header';
        hits[hits.length - 1].click();
        return 'clicked ' + hits.length;
      })()`);
    await sleep(600);
    const clicked2 = await c.evalExpr(clickByText('/^Add band$/'));
    note('7h', `New band section header clicked=${opened}`);
    await sleep(1200);
    const lens2 = await c.json('window.__dbg.aeon.bandLensTarget()');
    const card2 = await c.evalExpr(`!!document.getElementById("aeon-band-card-${idx2}")`);
    check('7h', "the PANEL's chip follows the band too — both doors, one derivation",
      clicked2 === true && card2 === true && lens2?.kind === 'band' && lens2.index === idx2,
      `clicked=${clicked2} card=${card2} lens=${JSON.stringify(lens2)}`);

    // ---- 8. TEARDOWN: undo back to the fixture ---------------------------
    for (let i = 0; i < 40; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await sleep(180);
    }
    const scenesEnd = await c.json('window.__dbg.aeon.scenes()');
    note(`scenes after teardown: ${JSON.stringify(scenesEnd.map((s) => s.id))}`);
    note('NOTHING WAS SAVED — Ctrl+S was never pressed and no save was called.');
  } finally {
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed`);
    if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
    note('environment at end',
      `uptime: ${os.uptime().toFixed(0)}s · load ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
    try { c?.close(); } catch { /* closed */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  }
  if (fails.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
