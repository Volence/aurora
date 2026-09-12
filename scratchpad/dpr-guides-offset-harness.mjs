#!/usr/bin/env node
// AT A SCALE FACTOR ABOVE 1, IS THE LINE YOU SEE THE LINE YOU GRAB?
//
// docs/reviews/2026-09-12-cdp-sweep-4.md section 5.1 (OBS.DPR) measured it NOT being so,
// at an EMULATED devicePixelRatio of 1.35: the effects layer guides drawn at canvasY/1.35
// and the screen frame's edges at x/1.35, while `guideAtCanvasY` and `screenFrameEdgeAt`
// measure CSS pixels. A press on the visible line caught nothing; the spot that grabbed
// showed nothing. The cause read from source: MapViewport's `redraw` gives the map canvas
// a DEVICE-pixel backing store under `setTransform(dpr, 0, 0, dpr, 0, 0)`, and the chrome
// draws began with `setTransform(1, 0, 0, 1, 0, 0)`, so their CSS coordinates landed in
// device pixels. docs/reviews/2026-09-12-dpr-guides-offset.md is the parcel that fixed it.
//
// ═══ TWO INSTRUMENTS, AND THEY ARE NOT THE SAME THING ═══
//
// Each run has two PHASES, and every row names its phase and its instrument:
//
//   N  native    whatever scale factor the launch produced. With no SCALE set that is
//                Xvfb's default, which read 1 on every recent run on this host. With
//                SCALE=<f> the harness passes `--force-device-scale-factor=<f>` to
//                Electron; if `window.devicePixelRatio` then reads <f>, the phase is a
//                REAL forced factor and says so. If it does not take, the phase says THAT.
//   E  emulated  `Emulation.setDeviceMetricsOverride` at EMULATE (default 1.35), the
//                OBS.DPR method. When N is already at 1.35 (a real forced run), E emulates
//                1 instead, so a real run carries its own dpr-1 control.
//
// An emulated phase is never reported as the real thing, and a real scaled DISPLAY (as
// opposed to a forced factor on Xvfb) is a foreground item only the owner has.
//
// ═══ WHAT IT READS, AND WHY PIXELS ARE READ OFF THE BACKING STORE ═══
//
// The drawn line is found by DIFFERENCING the map canvas's own backing store between two
// states, in one device column for the guides and one device row for the frame: the
// probe scene selected, and the BASE scene selected. Device index -> CSS is
// `i * rect / store`, measured per phase, never the code's dpr. A cyan predicate alone
// would pass on cyan art; a difference is only what the state change drew.
//
// ⚠ THE BASELINE IS A SCENE, NOT "NO SCENE", because there is no such state on the
// Effects facet: `resolveSelectedScene` falls back to `scenes[0]` for a null or unknown
// id, so `selectScene(null)` draws the FIRST fixture scene's five guides. Master run 1 of
// this file differenced against exactly that and reported runs at 0, 32, 80, 112, 160
// (ojz_act1_start's tops) beside the probe's. So the harness writes `dpr_base` into the
// COPY before opening it: ojz_act1_start, UNLOCKED (v_factor 0, so the frame stays hidden
// with its toggle off, the cdp-sweep-4 control shape), with its one layer at world_y 4000,
// below any canvas this window can show. Selected on the tileAnim sub-tab (composite off)
// it draws nothing on the map at all.
//
// Every aim is an INTEGER client pixel (the integer-aim rule of effects-guides-harness),
// and every press is a real `Input.dispatchMouseEvent`. Expectations come from the app's
// own contracts (`clampLayerTop(round(vpY + (clientY - rect.top) / zoom))` for a guide,
// `dragScreenFrame` for the frame), evaluated on the delivered integer.
//
// ═══ THE ROWS, PER PHASE ═══
//
//   .0  [anti-vacuous] the backing store is dpr-scaled in this phase (store / rect = dpr)
//   .1  [anti-vacuous] the guides report is active, for the probe scene, at the parked tops
//   .2  the guide lines are DRAWN where the hit test measures (every diff run within 1.5 CSS
//       px of a reported row, and one per row)
//   .3  a real press on the VISIBLE line of layer 1 grabs layer 1
//   .4  a real drag from that line moves LAYER 1 to the contract row and leaves layer 0 alone
//   .5  a press where the identity transform draws layer 1 (canvasY / dpr) grabs nothing
//       (a NOTE at dpr 1, where the two positions coincide)
//   .6  the frame's right edge is DRAWN where the hit test measures
//   .7  a real press on the VISIBLE right edge grabs the frame
//   .8  a real drag of it moves the frame by the contract delta, and a drag back restores it
//   .9  a press where the identity transform draws that edge ((x + w) / dpr) does not grab
//       (a NOTE at dpr 1)
//   .10 the camera preview composite fills the frame it is drawn in, and not a 1/dpr
//       corner of it (fixture scene ojz_act1_floor, whose composite differs from the map)
//
// PLUS, in a phase at dpr 1 only, the IDENTITY capture: the whole backing store hashed in
// two fixed states (the probe scene with a band lens, and ojz_act1_floor with its
// composite), twice each as a determinism control. With IDENTITY_BASELINE=<json> the
// hashes are compared with a run of another build; that is how "pixel-identical to master
// at dpr 1" is shown rather than argued.
//
// ⚠ IT WRITES NOTHING TO DISK in the aeon tree: Ctrl+S is never pressed and no save is
// called; every edit is undone before the end. It opens a COPY (AEON_DIR), never the live
// tree.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Build:  VITE_AURORA_DEBUG=1 npm run build   (in the tree the run is against)
// Run:    AEON_DIR=<copy> [SCALE=1.35] [EMULATE=1.35] [IDENTITY_OUT=<file>]
//         [IDENTITY_BASELINE=<file>] node scratchpad/dpr-guides-offset-harness.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as os from 'node:os';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9437);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
assertFreshBuild(RUN);
assertDebugBuild(RUN);
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const aeonOverride = checkoutOverride('aeon');
if (aeonOverride === null) throw new Error('AEON_DIR must point at a COPY of an aeon tree, never the live one');
const AEONDIR = aeonOverride.value;
if (AEONDIR === siblingDefaultPathOrUnresolved('aeon')) {
  throw new Error('refusing to run against the real aeon tree: use a throwaway copy');
}
const SCALE = process.env.SCALE ? Number(process.env.SCALE) : null;
const EMULATE = Number(process.env.EMULATE ?? 1.35);
const IDENTITY_OUT = process.env.IDENTITY_OUT ?? null;
const IDENTITY_BASELINE = process.env.IDENTITY_BASELINE ?? null;
const TAG = process.env.TAG ?? `run${Date.now()}`;
const SHOTS = `${ROOT}/scratchpad/shots-dpr-guides-offset`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'dpr_probe';
/** The probe scene's two tops. Both legal screen lines (3..223), far enough apart that
 *  neither identity-transform position (top / 1.35) is inside the other's grab zone. */
const TOPS = [60, 200];
/** Where the layer-1 drag lands, as a canvas row: inside the fire band, below layer 0. */
const DRAG_TO = 170;
/** How far the frame's right edge is dragged, in CSS px. */
const FRAME_DRAG = 40;
/** The grab zones (effects-guides.ts GUIDE_GRAB_PX, screen-frame.ts SCREEN_FRAME_GRAB_PX). */
const GRAB_PX = 6;
/** How close a drawn run must be to the reported row: half a device pixel of snap plus
 *  a device pixel of run width at 1.35, rounded up. */
const DRAWN_TOL = 1.5;
const FIXTURE_SCENE = 'ojz_act1_floor';
/** The differencing baseline (see the header): written into the COPY, never the live tree. */
const BASE_ID = 'dpr_base';
const EFFECTS_REL = 'games/sonic4/data/editor/effects';

/** Write the unlocked, off-canvas baseline scene into the aeon COPY. */
function writeBaseScene() {
  const dir = `${AEONDIR}/${EFFECTS_REL}`;
  if (!existsSync(`${dir}/ojz_act1_start.json`)) {
    throw new Error(`the aeon copy has no ${EFFECTS_REL}/ojz_act1_start.json to derive the baseline from`);
  }
  const start = JSON.parse(readFileSync(`${dir}/ojz_act1_start.json`, 'utf8'));
  const base = { ...start, id: BASE_ID, name: 'dpr harness baseline: unlocked, one layer below the canvas', v_factor: 0 };
  delete base.anchor;
  base.layers = [{ ...start.layers[0], world_y: 4000 }];
  writeFileSync(`${dir}/${BASE_ID}.json`, `${JSON.stringify(base, null, 2)}\n`);
  return base;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const up = () => `uptime ${os.uptime().toFixed(0)}s, load ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`;

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
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${J(m.error)}`)) : resolve(m.result)));
    ws.send(J({ id, method, params }));
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
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${J(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;
const TOP_INPUT = (i) => `[...document.querySelectorAll('input[type=number]')].find(e => new RegExp('^Layer ${i} (world_y|Screen line)').test(e.title||''))`;
const BTN_TEXT = (re) => `([...document.querySelectorAll('button')].find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim())) || null)`;
const SUBTAB = (id) => `document.querySelector('[data-effects-sub-tab="${id}"]')`;

/** Contiguous runs of differing indices, as CSS-pixel spans. */
function diffRuns(a, b, scale) {
  const runs = [];
  let start = -1;
  const n = Math.min(a.length, b.length) / 4;
  for (let i = 0; i <= n; i++) {
    const differs = i < n && (a[i * 4] !== b[i * 4] || a[i * 4 + 1] !== b[i * 4 + 1] || a[i * 4 + 2] !== b[i * 4 + 2]);
    if (differs && start < 0) start = i;
    if (!differs && start >= 0) {
      runs.push({ from: +(start / scale).toFixed(2), to: +(i / scale).toFixed(2), center: +(((start + i) / 2) / scale).toFixed(2), dev: [start, i - 1] });
      start = -1;
    }
  }
  return runs;
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const baseScene = writeBaseScene();
  note('baseline scene', `${BASE_ID} written into the COPY: v_factor ${baseScene.v_factor}, tops ${J(baseScene.layers.map((l) => l.world_y))}`);
  let head = 'unknown';
  try { head = execFileSync('git', ['-C', RUN.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  let distAt = 'unknown';
  try { distAt = statSync(MAIN).mtime.toISOString(); } catch { /* reported below */ }
  note('environment', `${up()}; built tree ${RUN.root} at HEAD ${head}; dist/main mtime ${distAt}; aeon copy ${AEONDIR}; `
    + `SCALE=${SCALE ?? 'unset'} EMULATE=${EMULATE} TAG=${TAG}`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON,
      ...(SCALE !== null ? [`--force-device-scale-factor=${SCALE}`] : []),
      MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  const identity = { tag: TAG, head, root: RUN.root, captures: {} };
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
    if (!(await waitDbg())) throw new Error('no __dbg: rebuild with VITE_AURORA_DEBUG=1');
    const haveProbes = await c.evalExpr('typeof window.__dbg.aeon.guides === "function" && typeof window.__dbg.aeon.screenFrame === "function" && typeof window.__dbg.aeon.cameraPreview === "function"');
    check('0a', '[anti-vacuous] the build under test has the guide, frame and camera-preview probes', haveProbes === true, `${RUN.root}/dist`);
    if (!haveProbes) throw new Error('wrong build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- helpers bound to this connection ----------------------------------
    const mouse = (type, x, y, button = 'none', buttons = 0) =>
      c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
    const aimEl = (expr) => c.json(String.raw`(() => { const el = ${expr}; if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const b = el.getBoundingClientRect(); const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(x, y); return { x, y, hitOk: !!(hit && (hit === el || el.contains(hit))) }; })()`);
    const realClick = async (expr) => {
      const p = await aimEl(expr);
      if (!p || !p.hitOk) return p;
      await mouse('mouseMoved', p.x, p.y);
      await mouse('mousePressed', p.x, p.y, 'left', 1); await sleep(40);
      await mouse('mouseReleased', p.x, p.y, 'left', 0); await sleep(400);
      return p;
    };
    const park = async () => { await mouse('mouseMoved', 2, 2); await sleep(250); };
    const guides = () => c.json('window.__dbg.aeon.guides()');
    const frame = () => c.json('window.__dbg.aeon.screenFrame()');
    const view = () => c.json('window.__dbg.view()');
    const docScene = async (id) => JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()')).find((s) => s.id === id) ?? null;
    const geometry = () => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
      const b = cv.getBoundingClientRect(); return { dpr: window.devicePixelRatio, left: b.left, top: b.top, width: b.width, height: b.height,
        storeW: cv.width, storeH: cv.height }; })()`);
    /** Repaint and wait for the guide report's paint counter to move. */
    const repaint = async () => {
      const p0 = (await guides()).paints;
      await c.evalExpr('window.__dbg.setView(0, 1, 1)'); await sleep(250);
      await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(450);
      const p1 = (await guides()).paints;
      return { p0, p1 };
    };
    const select = async (id) => { await c.evalExpr(`window.__dbg.aeon.selectScene(${J(id)})`); await sleep(500); await repaint(); };
    const readColumn = (cssX) => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); const b = cv.getBoundingClientRect();
      const ix = Math.floor(${cssX} * cv.width / b.width); const d = cv.getContext('2d').getImageData(ix, 0, 1, cv.height).data;
      return { ix, scale: cv.height / b.height, px: Array.from(d) }; })()`);
    const readRow = (cssY) => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); const b = cv.getBoundingClientRect();
      const iy = Math.floor(${cssY} * cv.height / b.height); const d = cv.getContext('2d').getImageData(0, iy, cv.width, 1).data;
      return { iy, scale: cv.width / b.width, px: Array.from(d) }; })()`);
    const undo = async () => {
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await sleep(500);
    };
    /** A press held, nudged 1 px so the draw pass repaints, read, moved back, released. */
    const pressProbe = async (x, y, dx, dy) => {
      await mouse('mouseMoved', x, y); await sleep(150);
      await mouse('mousePressed', x, y, 'left', 1); await sleep(200);
      await mouse('mouseMoved', x + dx, y + dy, 'left', 1); await sleep(300);
      const g = await guides(); const f = await frame();
      await mouse('mouseMoved', x, y, 'left', 1); await sleep(200);
      await mouse('mouseReleased', x, y, 'left', 0); await sleep(350);
      return { dragIndex: g.dragIndex, hoverIndex: g.hoverIndex, frameDragging: f.dragging };
    };
    const capture = async (name) => {
      const r = JSON.parse(await c.evalExpr(String.raw`(() => { const cv = document.getElementById('map-canvas');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
        for (let i = 0; i < d.length; i++) { h1 = Math.imul(h1 ^ d[i], 0x01000193) >>> 0; h2 = Math.imul(h2 ^ d[d.length - 1 - i], 0x5bd1e995) >>> 0; }
        return JSON.stringify({ w: cv.width, h: cv.height, hash: h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') }); })()`));
      const url = await c.evalExpr(`document.getElementById('map-canvas').toDataURL('image/png')`);
      const path = `${SHOTS}/${name}-${TAG}.png`;
      writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
      return { ...r, path };
    };

    // ---- 1. Open the aeon COPY, the Effects facet, and author the probe -----
    await c.evalExpr(`window.__dbg.aeon.open(${J(AEONDIR)})`).catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', '[anti-vacuous] the aeon COPY is open, with sections', !!(st && st.open && st.sections > 0), J(st));
    if (!st || !st.open) throw new Error('aeon did not open');
    await sleep(2500);
    const pill = await realClick(`[...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === 'Effects') || null`);
    await sleep(1200);
    check('1b', '[anti-vacuous] the Effects facet was entered by a real click', !!(pill && pill.hitOk), J(pill));
    await realClick(SUBTAB('parallax')); await sleep(400);
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(`${BTN_TEXT('/^New$/')}?.click()`);
    await sleep(900);
    await c.evalExpr(`${BTN_TEXT('/Add layer/')}?.click()`);
    await sleep(700);
    await c.evalExpr(SET_INPUT(TOP_INPUT(0), TOPS[0]));
    await c.evalExpr(SET_INPUT(TOP_INPUT(1), TOPS[1]));
    await sleep(700);
    await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)').catch(() => null);
    await c.evalExpr("window.__dbg.setOverlay('playAnimatedArt', false)");
    await select(SCENE_ID);
    let probe = await docScene(SCENE_ID);
    check('1c', '[anti-vacuous] the probe scene exists, is LOCKED, and has its two tops parked',
      !!probe && probe.v_factor === 15 && J(probe.layers.map((l) => l.world_y)) === J(TOPS),
      `scenes before ${J(scenes0.map((s) => s.id))}; probe ${J(probe && { v_factor: probe.v_factor, v_offset: probe.v_offset, tops: probe.layers.map((l) => l.world_y) })}`);
    if (!probe) throw new Error('probe scene missing');
    await park();

    // ---- 2. The phases -------------------------------------------------------
    const G0 = await geometry();
    const nativeDpr = G0.dpr;
    const nativeLabel = SCALE === null
      ? `native (Xvfb default, no switch): dpr ${nativeDpr}`
      : (Math.abs(nativeDpr - SCALE) < 1e-6
        ? `REAL forced factor (--force-device-scale-factor=${SCALE}): dpr ${nativeDpr}`
        : `--force-device-scale-factor=${SCALE} DID NOT TAKE: dpr ${nativeDpr}`);
    if (SCALE !== null) {
      check('2a', `the forced factor took: devicePixelRatio reads ${SCALE} with --force-device-scale-factor=${SCALE}`,
        Math.abs(nativeDpr - SCALE) < 1e-6, `devicePixelRatio ${nativeDpr}`);
    }
    const emuTarget = Math.abs(nativeDpr - EMULATE) < 1e-6 ? 1 : EMULATE;

    // ---- IDENTITY capture, at dpr 1 only, before any gesture ---------------
    const identityCaptures = async (phaseId) => {
      await select(SCENE_ID);
      const lensSet = await c.evalExpr("(window.__dbg.aeon.setBandLensTarget({ kind: 'band', index: 0 }), true)").catch(() => false);
      await sleep(400); await repaint(); await park();
      const lens = await c.json('window.__dbg.aeon.bandLens()');
      const a1 = await capture('identity-probe-a');
      await repaint(); await park();
      const a2 = await capture('identity-probe-b');
      await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)').catch(() => null);
      await select(FIXTURE_SCENE); await park();
      const cam = await c.json('window.__dbg.aeon.cameraPreview()');
      const b1 = await capture('identity-floor-a');
      await repaint(); await park();
      const b2 = await capture('identity-floor-b');
      await select(SCENE_ID); await park();
      check(`${phaseId}.I0`, '[anti-vacuous] the identity states draw what they are for: the band lens label, and the floor composite',
        lensSet === true && lens.active === true && cam.active === true && cam.blits > 0,
        `band lens ${J({ active: lens.active, cells: lens.cells, drawn: lens.drawn })}; camera preview ${J({ active: cam.active, sceneId: cam.sceneId, blits: cam.blits })}`);
      check(`${phaseId}.I1`, '[anti-vacuous] DETERMINISM: each identity state hashes the same on two repaints in one run',
        a1.hash === a2.hash && b1.hash === b2.hash,
        `probe ${a1.hash} / ${a2.hash} (${a1.w}x${a1.h}); floor ${b1.hash} / ${b2.hash}; ${a1.path}, ${b1.path}`);
      identity.captures = { probe: a1, floor: b1 };
      if (IDENTITY_OUT) writeFileSync(IDENTITY_OUT, `${J(identity, null, 1)}\n`);
      if (IDENTITY_BASELINE) {
        const base = JSON.parse(readFileSync(IDENTITY_BASELINE, 'utf8'));
        check(`${phaseId}.I2`, `PIXEL IDENTITY at dpr 1: both states hash the same as the baseline build (${base.head})`,
          base.captures.probe.hash === a1.hash && base.captures.floor.hash === b1.hash
          && base.captures.probe.w === a1.w && base.captures.probe.h === a1.h,
          `this build ${head}: probe ${a1.hash} floor ${b1.hash} (${a1.w}x${a1.h}); baseline ${base.head}: probe ${base.captures.probe.hash} `
          + `floor ${base.captures.floor.hash} (${base.captures.probe.w}x${base.captures.probe.h}), from ${IDENTITY_BASELINE}`);
      }
    };

    const phase = async (P, instrument) => {
      await select(SCENE_ID);
      await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)').catch(() => null);
      await realClick(SUBTAB('tileAnim')); await sleep(400);
      await repaint(); await park();
      const G = await geometry();
      const v = await view();
      const dpr = G.dpr;
      const ratioX = G.storeW / G.width;
      const ratioY = G.storeH / G.height;
      console.log(`\n=== PHASE ${P}: ${instrument}\n    GEOMETRY dpr ${dpr}; map canvas rect ${J({ left: G.left, top: G.top, width: G.width, height: G.height })}; `
        + `backing store ${G.storeW}x${G.storeH}; view ${J(v)}; ${up()}`);
      check(`${P}.0`, `[anti-vacuous] the map canvas backing store is dpr-scaled in this phase (${instrument})`,
        Math.abs(ratioX - dpr) < 0.01 && Math.abs(ratioY - dpr) < 0.01 && v.x === 0 && v.y === 0 && v.zoom === 1,
        `store/rect ${ratioX.toFixed(4)} x ${ratioY.toFixed(4)} against dpr ${dpr}; view ${J(v)}`);
      const g = await guides();
      check(`${P}.1`, '[anti-vacuous] the guides report is active, for the probe scene, at the parked tops',
        g.active === true && g.sceneId === SCENE_ID && J(g.rows.map((r) => r.canvasY)) === J(TOPS),
        `rows ${J(g.rows.map((r) => r.canvasY))} sceneId ${g.sceneId} paints ${g.paints}`);
      const f0 = await frame();
      if (!f0.rect) throw new Error(`phase ${P}: the frame report has no rect (${J(f0)})`);
      const fRight = f0.rect.x + f0.rect.w;

      // .2 the guide lines, differenced in one device column outside the frame.
      const lo = fRight + 16;
      const hi = Math.min(G.width / Math.max(dpr, EMULATE) - 12, G.width - 320);
      const GX = Math.round((lo + hi) / 2);
      if (!(lo < hi)) {
        check(`${P}.2`, 'UNMEASURABLE: no column is clear of the frame, the guide caption and the identity-transform extent',
          false, `lo ${lo} hi ${hi} rect ${J(G)}`);
      }
      const colA = await readColumn(GX);
      await select(BASE_ID); await park();
      const colB = await readColumn(GX);
      await select(SCENE_ID); await park();
      const gRuns = diffRuns(colA.px, colB.px, colA.scale);
      const near = (runs, at) => runs.find((r) => Math.abs(r.center - at) <= DRAWN_TOL) ?? null;
      const every = TOPS.every((t) => near(gRuns, t) !== null);
      const stray = gRuns.filter((r) => !TOPS.some((t) => Math.abs(r.center - t) <= DRAWN_TOL));
      check(`${P}.2`, 'the guide lines are DRAWN where the hit test measures: one differing run per reported row, within 1.5 CSS px, and none elsewhere',
        every && stray.length === 0 && gRuns.length === TOPS.length,
        `column CSS x ${GX} (device ${colA.ix}); runs (CSS) ${J(gRuns.map((r) => [r.from, r.to]))}; reported rows ${J(TOPS)}; `
        + `identity-transform prediction ${J(TOPS.map((t) => +(t / dpr).toFixed(2)))}`);

      // .3 a real press on the VISIBLE line of layer 1: the second run from the top,
      // whatever the code drew (uniform scaling keeps the order).
      const sorted = [...gRuns].sort((a, b) => a.center - b.center);
      const visible1 = sorted[1] ?? null;
      const aimX = Math.round(G.left + GX);
      if (visible1) {
        const aimY = Math.round(G.top + visible1.center);
        const pr = await pressProbe(aimX, aimY, 0, 1);
        check(`${P}.3`, 'a real press on the VISIBLE line of layer 1 grabs layer 1',
          pr.dragIndex === 1,
          `aim client (${aimX}, ${aimY}) = canvas row ${(aimY - G.top).toFixed(2)} on the drawn run ${J([visible1.from, visible1.to])}; report ${J(pr)}; dpr ${dpr}; rect.top ${G.top}`);
      } else {
        check(`${P}.3`, 'a real press on the VISIBLE line of layer 1 grabs layer 1', false, `no second drawn run: ${J(gRuns)}`);
      }
      await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(300);

      // .4 the drag, from the visible line to DRAG_TO.
      if (visible1) {
        const y0 = Math.round(G.top + visible1.center);
        const y1 = Math.round(G.top + DRAG_TO);
        await mouse('mouseMoved', aimX, y0); await sleep(150);
        await mouse('mousePressed', aimX, y0, 'left', 1); await sleep(150);
        for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', aimX, Math.round(y0 + ((y1 - y0) * i) / 6), 'left', 1); await sleep(40); }
        await mouse('mouseReleased', aimX, y1, 'left', 0); await sleep(600);
        const vNow = await view();
        const after = await docScene(SCENE_ID);
        // clampLayerTop(round(vpY + (clientY - rect.top) / zoom)); DRAG_TO is inside every bound.
        const want = Math.round(v.y + (y1 - G.top) / v.zoom);
        check(`${P}.4`, 'a real drag from that line moves LAYER 1 to the contract row and leaves layer 0 alone',
          after.layers[1].world_y === want && after.layers[0].world_y === TOPS[0],
          `pressed client y ${y0}, released at ${y1} (canvas row ${(y1 - G.top).toFixed(2)}); contract ${want}; tops now ${J(after.layers.map((l) => l.world_y))}; view after ${J(vNow)}`);
        if (after.layers[1].world_y !== TOPS[1]) await undo();
        await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(400);
        const back = await docScene(SCENE_ID);
        if (J(back.layers.map((l) => l.world_y)) !== J(TOPS)) {
          await c.evalExpr(SET_INPUT(TOP_INPUT(1), TOPS[1])); await sleep(500);
        }
      } else {
        check(`${P}.4`, 'a real drag from that line moves LAYER 1 to the contract row', false, 'no visible line to press');
      }

      // .5 the identity-transform position of layer 1.
      const ghost1 = TOPS[1] / dpr;
      if (Math.abs(ghost1 - TOPS[1]) > GRAB_PX + 1) {
        const gy = Math.round(G.top + ghost1);
        const pr = await pressProbe(aimX, gy, 0, 1);
        check(`${P}.5`, 'a press where the identity transform would draw layer 1 (canvasY / dpr) grabs nothing',
          pr.dragIndex === null && pr.hoverIndex === null,
          `aim client (${aimX}, ${gy}) = canvas row ${(gy - G.top).toFixed(2)} (${TOPS[1]} / ${dpr} = ${ghost1.toFixed(2)}); report ${J(pr)}`);
        await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(300);
      } else {
        note(`${P}.5`, `n/a at dpr ${dpr}: the identity-transform position ${ghost1.toFixed(2)} is the reported row ${TOPS[1]} (the rows the fix separates coincide here)`);
      }

      // .6 the frame's right edge, differenced along one device row inside the frame.
      let FY = Math.round(f0.rect.y + f0.rect.h / 2);
      if (TOPS.some((t) => Math.abs(t - FY) < 16)) FY = Math.round(f0.rect.y + f0.rect.h * 0.3);
      const rowA = await readRow(FY);
      await select(BASE_ID); await park();
      const rowB = await readRow(FY);
      await select(SCENE_ID); await park();
      const fRuns = diffRuns(rowA.px, rowB.px, rowA.scale);
      const rightmost = fRuns.length ? fRuns.reduce((a, b) => (b.center > a.center ? b : a)) : null;
      check(`${P}.6`, "the frame's right edge is DRAWN where the hit test measures (the rightmost differing run within 1.5 CSS px of rect.x + rect.w)",
        rightmost !== null && Math.abs(rightmost.center - fRight) <= DRAWN_TOL,
        `row CSS y ${FY} (device ${rowA.iy}); runs (CSS) ${J(fRuns.map((r) => [r.from, r.to]))}; report rect ${J(f0.rect)} (right ${fRight}); `
        + `identity-transform prediction right ${(fRight / dpr).toFixed(2)}`);

      // .7 a real press on the VISIBLE right edge.
      const aimFY = Math.round(G.top + FY);
      if (rightmost) {
        const ex = Math.round(G.left + rightmost.center);
        const pr = await pressProbe(ex, aimFY, 1, 0);
        check(`${P}.7`, 'a real press on the VISIBLE right edge of the frame grabs the frame',
          pr.frameDragging === true,
          `aim client (${ex}, ${aimFY}) = canvas (${(ex - G.left).toFixed(2)}, ${(aimFY - G.top).toFixed(2)}) on the drawn run ${J([rightmost.from, rightmost.to])}; report ${J(pr)}`);
        await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(300);

        // .8 drag it by FRAME_DRAG and back.
        const fa = await frame();
        const x1 = ex + FRAME_DRAG;
        await mouse('mouseMoved', ex, aimFY); await sleep(150);
        await mouse('mousePressed', ex, aimFY, 'left', 1); await sleep(150);
        for (let i = 1; i <= 4; i++) { await mouse('mouseMoved', Math.round(ex + (FRAME_DRAG * i) / 4), aimFY, 'left', 1); await sleep(40); }
        await mouse('mouseReleased', x1, aimFY, 'left', 0); await sleep(600);
        const fb = await frame();
        // dragScreenFrame: max(0, round(start.x + (x1 - ex) / zoom)); y unchanged.
        const wantX = Math.max(0, Math.round(fa.anchor.x + (x1 - ex) / v.zoom));
        const moved = fb.anchor && fb.anchor.x === wantX && fb.anchor.y === fa.anchor.y;
        await mouse('mouseMoved', x1, aimFY); await sleep(150);
        await mouse('mousePressed', x1, aimFY, 'left', 1); await sleep(150);
        for (let i = 1; i <= 4; i++) { await mouse('mouseMoved', Math.round(x1 - (FRAME_DRAG * i) / 4), aimFY, 'left', 1); await sleep(40); }
        await mouse('mouseReleased', ex, aimFY, 'left', 0); await sleep(600);
        const fc = await frame();
        check(`${P}.8`, 'a real drag of that edge moves the frame by the contract delta, and a drag back restores it',
          moved && fc.anchor && fc.anchor.x === fa.anchor.x && fc.anchor.y === fa.anchor.y,
          `anchor ${J(fa.anchor)} -> ${J(fb.anchor)} (contract x ${wantX}, dragged ${ex} -> ${x1}) -> ${J(fc.anchor)}`);
        await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(300);
      } else {
        check(`${P}.7`, 'a real press on the VISIBLE right edge of the frame grabs the frame', false, `no differing run: ${J(fRuns)}`);
        check(`${P}.8`, 'a real drag of that edge moves the frame', false, 'no visible edge to press');
      }

      // .9 the identity-transform position of the right edge.
      const ghostR = fRight / dpr;
      if (Math.abs(ghostR - fRight) > GRAB_PX + 1) {
        const gx = Math.round(G.left + ghostR);
        const fBefore = await frame();
        const pr = await pressProbe(gx, aimFY, 1, 0);
        const fAfter = await frame();
        check(`${P}.9`, 'a press where the identity transform would draw the right edge ((x + w) / dpr) does not grab the frame',
          pr.frameDragging === false && J(fAfter.anchor) === J(fBefore.anchor),
          `aim client (${gx}, ${aimFY}) = canvas x ${(gx - G.left).toFixed(2)} (${fRight} / ${dpr} = ${ghostR.toFixed(2)}); report ${J(pr)}; anchor ${J(fBefore.anchor)} -> ${J(fAfter.anchor)}`);
        await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(300);
      } else {
        note(`${P}.9`, `n/a at dpr ${dpr}: the identity-transform position ${ghostR.toFixed(2)} is the reported edge ${fRight}`);
      }

      // .10 the composite: parallax (on) against tileAnim (off), on the fixture scene.
      await select(FIXTURE_SCENE); await park();
      const fx = await frame();
      const rowsY = [];
      for (let k = 1; k <= 9; k++) rowsY.push(Math.round(fx.rect.y + (fx.rect.h * k) / 10));
      const offRows = [];
      for (const y of rowsY) offRows.push(await readRow(y));
      await realClick(SUBTAB('parallax')); await sleep(500); await repaint(); await park();
      const cam = await c.json('window.__dbg.aeon.cameraPreview()');
      const onRows = [];
      for (const y of rowsY) onRows.push(await readRow(y));
      await realClick(SUBTAB('tileAnim')); await sleep(400); await repaint(); await park();
      let minX = Infinity; let maxX = -Infinity; let n = 0;
      for (let k = 0; k < rowsY.length; k++) {
        for (const r of diffRuns(onRows[k].px, offRows[k].px, onRows[k].scale)) { minX = Math.min(minX, r.from); maxX = Math.max(maxX, r.to); n++; }
      }
      const fxR = fx.rect.x + fx.rect.w;
      if (n === 0 || cam.active !== true) {
        check(`${P}.10`, 'UNMEASURABLE: the composite changed nothing in the frame, or was not active', false,
          `camera preview ${J({ active: cam.active, blits: cam.blits, sceneId: cam.sceneId })}; runs ${n}`);
      } else {
        check(`${P}.10`, 'the camera preview composite fills the frame it is drawn in (its differing columns reach the right edge, and stop there)',
          maxX >= fxR - 3 && maxX <= fxR + DRAWN_TOL && minX >= fx.rect.x - DRAWN_TOL,
          `${FIXTURE_SCENE} frame ${J(fx.rect)} (right ${fxR}); composite ${J({ active: cam.active, blits: cam.blits })}; differing CSS columns span ${minX.toFixed(2)}..${maxX.toFixed(2)} over ${rowsY.length} rows ${J(rowsY)} (${n} runs); `
          + `identity-transform prediction right ${(fxR / dpr).toFixed(2)}`);
      }
      await select(SCENE_ID); await park();
      return { dpr, G };
    };

    const phases = [];
    if (nativeDpr === 1) await identityCaptures('N');
    phases.push(await phase('N', nativeLabel));
    const iw = await c.json('({ w: innerWidth, h: innerHeight })');
    await c.send('Emulation.setDeviceMetricsOverride', { width: iw.w, height: iw.h, deviceScaleFactor: emuTarget, mobile: false });
    await sleep(700);
    await repaint();
    const emuDpr = await c.evalExpr('window.devicePixelRatio');
    const emuLabel = `EMULATED (Emulation.setDeviceMetricsOverride deviceScaleFactor ${emuTarget}): dpr ${emuDpr}`;
    check('3a', `[anti-vacuous] the emulation took: devicePixelRatio reads ${emuTarget}`, Math.abs(emuDpr - emuTarget) < 1e-6, `dpr ${emuDpr}`);
    if (emuTarget === 1 && Math.abs(emuDpr - 1) < 1e-6) await identityCaptures('E');
    phases.push(await phase('E', emuLabel));
    await c.send('Emulation.clearDeviceMetricsOverride');
    await sleep(500);
    await repaint();
    note('emulation cleared', `devicePixelRatio ${await c.evalExpr('window.devicePixelRatio')} (native ${nativeDpr}); canvas ${J(await geometry())}`);

    // ---- teardown: undo back to the fixture, nothing saved -----------------
    let undos = 0;
    for (let i = 0; i < 40; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await undo(); undos++;
    }
    const scenesEnd = await c.json('window.__dbg.aeon.scenes()');
    check('9a', '[anti-vacuous] the session undoes back to the fixture: nothing was saved',
      J(scenesEnd.map((s) => s.id)) === J(scenes0.map((s) => s.id)),
      `${undos} undos; left ${J(scenesEnd.map((s) => s.id))}, found ${J(scenes0.map((s) => s.id))}`);
    await c.evalExpr("window.__dbg.setOverlay('playAnimatedArt', true)").catch(() => null);
  } finally {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} rows passed`);
    if (fails.length) console.log(`FAILED:\n  ${fails.join('\n  ')}`);
    note('environment at end', up());
    try { c?.close(); } catch { /* closed */ }
    await killTree(child);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`HARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run: this is NOT a pass over the rows that never ran.`);
  process.exit(2);
});
