#!/usr/bin/env node
// DOES A CURVE RAMP ACTUALLY APPEAR ON THE CANVAS, IN THE RUNNING APP?
//
// `curve.to` has been authorable since parcel H and INVISIBLE since. The camera
// preview drew a curved strip FLAT at its top factor and printed an absence
// banner saying so. This parcel makes the composite ramp, and this file is the
// only instrument that can tell whether it did: 5,295 vitest tests pass over
// this feature and not one of them can see React, a canvas, a View-menu
// checkbox, or a pixel.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. A RAMP THAT IS ONLY IN THE MODEL. Section 6 samples the map canvas's own
//    pixels along whole screen ROWS inside the frame, with the curve on and
//    then off, and compares them. A row that asked "did any pixel change" would
//    pass on a repaint that changed nothing about the ramp.
//
// 2. A RAMP THAT IS FLAT AND GREEN ANYWAY. Two ways this feature can be
//    completely broken and still pass a careless row, and BOTH are neutralised
//    by construction and named where they are:
//      • camX = 0. Every factor decodes to 0 there, so base and far are both 0,
//        the spread is 0, and a dead ramp is indistinguishable from a live one.
//        Section 3 drives the camera to a NON-ZERO x through the app's own
//        arrow keys and row 3c FAILS if it did not land there.
//      • `to` == `fb`. The engine REFUSES that pair (layer() guard 4) precisely
//        because it emits HScroll bytes identical to the flat path. Row 7a uses
//        it deliberately, as a CONTROL, and proves nothing on its own.
//
// 3. A RAMP IN THE WRONG DIRECTION, OR OFF BY THE TRUNCATION. Row 5e checks the
//    app's Bresenham accumulator against a CLOSED FORM computed here —
//    `base + floor(i*spread/span)` in HScroll-word space — for EVERY line of the
//    band. Two different expressions agreeing is evidence; the harness
//    re-running the app's own loop would not be.
//
// 4. A RAMP THAT IS IN THE MODEL AND NOT IN THE PIXELS. Row 6f measures the
//    horizontal shift of the drawn strip, by search, on twelve different rows,
//    and requires each one to be the scroll the ramp predicts FOR THAT LINE —
//    twelve different numbers. Nothing but a per-line scroll produces that; a
//    build with no ramp measures 0 on every row.
//
// 5. A COMPOSITE THAT IS DRAWN AND THEN ERASED. Row 6a calibrates by toggling
//    the composite and keeping the rows that MOVE, which is how this harness
//    found the defect row 6g now pins: MapViewport drew the preview and then
//    `sectionRenderer.render`'s background clear painted over it, on every
//    frame, whenever the "Bg Plane" overlay was off. `blits` said 81, the
//    report said `active`, the node suite was green, and the canvas was black.
//
// 6. A STALE REPORT. `__dbg.aeon.cameraPreview()` is a PUBLISH from the end of
//    MapViewport's draw body, so `active:false` and a stalled `paints` counter
//    are real answers a row can fail on. Row 7c turns the composite OFF through
//    the real checkbox and requires the report to say so.
//
// ═══ TWO INSTRUMENT DEFECTS THIS FILE FOUND IN ITSELF, KEPT ON THE RECORD ═══
//
// Both were rows that FAILED on a build whose ramp was correct, and both were
// fixed in the instrument rather than by weakening what is asserted:
//
//   • THE PROBE WAS SAMPLING THE WRONG PIXELS. It aimed at the band's last few
//     rows because "deepest is where the ramp is largest", and those rows are
//     mostly foreground canopy over a low-entropy patch of plane. The shift
//     search scored 84.8% at the right answer and 83.3% at the runner-up —
//     noise. A shift can only be measured where the picture has enough detail
//     to tell one offset from another, so rows are chosen for detail now, and
//     scored over a spread rather than at one place.
//   • THE PROBE COULD NOT SEE THE COMPOSITE AT ALL. See catch 5. Before that
//     was found, every pixel row here was measuring level art.
//
// ═══ AIM AT INTEGERS. THE CANVAS RECT IS NOT INTEGRAL. ═══
//
// `devicePixelRatio` is whatever Electron infers under Xvfb and has been seen at
// both 1 and 1.35 on this host in one session (see effects-guides-harness's
// docblock, which cost a review cycle to write). At 1.35 the map canvas's
// bounding rect is fractional.
//
// THIS HARNESS SENDS NO MOUSE COORDINATES AT ALL, which removes the whole class:
// the scene is authored through form controls, the camera is driven with arrow
// KEYS, and the composite is toggled with a View-menu CHECKBOX. The only
// coordinates anywhere are the pixel probes, and those are taken in the map
// canvas's OWN backing-store space — `canvas.width = rect.width` (MapViewport
// :1040), so that space is CSS pixels with no dpr factor — at offsets derived
// from `screenFrame().rect`, which is the rectangle the app itself drew into.
// dpr, the rect and every aim are printed anyway, because the next reader
// should not have to take that on trust.
//
// ═══ HOW TO RUN ═══
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build      # __dbg exists ONLY here
//   node scratchpad/curve-editor-harness.mjs
//
// Screenshots land in scratchpad/shots-curve-editor/.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch.
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-curve-editor`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'curve_probe';

// ── THE FIXTURE'S NUMBERS, AND WHERE EVERY ONE COMES FROM ──────────────────
//
// `FB` and `TO` are the two ends of the ramp under test. They must DIFFER or
// the whole run is vacuous (see catch 2), and they are the two simplest
// single-term factors so the derivation below is checkable by hand.
//
//   FACTOR_1_4 = packed(s1: 2, s2: 15, op: 0)  ->  camX >> 2
//   FACTOR_1_2 = packed(s1: 1, s2: 15, op: 0)  ->  camX >> 1
//
// TRANSCRIBED FROM src/core/formats/effects/factor-decode.ts's
// EFFECTS_FACTOR_PACKED, which is itself transcribed from aeon
// engine/level/parallax_dsl.emp:25-40. Spelled here rather than imported so
// this file is an INDEPENDENT statement of the contract: a harness that
// imported the decoder would prove the app agrees with itself.
const FB = 'FACTOR_1_4';
const TO = 'FACTOR_1_2';
const SHIFT = { FACTOR_1_4: 2, FACTOR_1_2: 1, FACTOR_1_16: 4 };

// Where the camera is driven to. NOT ZERO — that is catch 2. 320 is 20 presses
// of Shift+ArrowRight, which is CAMERA_KEY_STEP_COARSE (16) from
// canvas/camera-preview.ts, and it makes both decodes whole: 320>>2 = 80 and
// 320>>1 = 160, a spread of 80 px across the strip.
const CAM_X = 320;
const COARSE = 16;
const PRESSES = CAM_X / COARSE;

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
/** Every `no-element` / `null` any probe returned, for the blanket row 7b. */
const misses = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
function watchMiss(where, v) {
  if (v === 'no-element' || v === null || (v && v.error)) misses.push(`${where}: ${JSON.stringify(v)}`);
  return v;
}

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-curve-editor/${name}.png`);
}

// A React-controlled control ignores `el.value = x`; the native setter plus a
// bubbling event is what a real keystroke looks like from React's side. (A
// `<select>` cannot be driven by ARROW keys through CDP here — Chromium's
// menulist opens a native popup outside the page — which
// docs/reviews/2026-08-27-curve-vsplit-reachable.md §5 measured and worked
// around with typeahead. This is the same fact, taken the other way.)
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

/** The layer-card picker whose `title` starts with this text. */
const selectByTitle = (prefix) =>
  `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith(${JSON.stringify(prefix)}))`;

// ── driving the REAL View menu ─────────────────────────────────────────────
const OPEN_VIEW_MENU = String.raw`
(() => {
  const btn = [...document.querySelectorAll('button')]
    .find((e) => /^View$/.test((e.textContent || '').trim()));
  if (!btn) return 'no-view-menu';
  btn.click();
  return true;
})()`;
const CLICK_VIEW_ITEM = (re) => String.raw`
(() => {
  const label = [...document.querySelectorAll('label')]
    .find((e) => ${re}.test((e.textContent || '').trim()));
  if (!label) {
    return { error: 'no-label', saw: [...document.querySelectorAll('label')]
      .map((e) => (e.textContent || '').trim()) };
  }
  const box = label.querySelector('input[type=checkbox]');
  if (!box) return { error: 'no-checkbox' };
  const before = box.checked;
  box.click();
  return { before, after: box.checked };
})()`;
/** The same finder, READING ONLY — for `setViewOverlay` below. */
const READ_VIEW_ITEM = (re) => String.raw`
(() => {
  const label = [...document.querySelectorAll('label')]
    .find((e) => ${re}.test((e.textContent || '').trim()));
  if (!label) {
    return { error: 'no-label', saw: [...document.querySelectorAll('label')]
      .map((e) => (e.textContent || '').trim()) };
  }
  const box = label.querySelector('input[type=checkbox]');
  if (!box) return { error: 'no-checkbox' };
  return { checked: box.checked };
})()`;
async function toggleViewOverlay(c, re) {
  const opened = await c.evalExpr(OPEN_VIEW_MENU);
  if (opened !== true) return { error: opened };
  await sleep(400);
  const r = await c.json(CLICK_VIEW_ITEM(re));
  await sleep(300);
  await c.evalExpr(OPEN_VIEW_MENU).catch(() => {});   // close
  await sleep(300);
  return r;
}

/**
 * PUT an overlay into a state, rather than flipping it.
 *
 * ⚠ ADDED FOR EW-SHAPE-PREVIEW, AND ONLY §3 USES IT. The composite is now ON by
 * default on the Parallax sub-tab, which is the sub-tab this whole harness
 * works on — so §3's opening `toggleViewOverlay` would have turned the thing it
 * needs OFF and inverted every parity below it. Every OTHER call in this file
 * is one half of a BALANCED PAIR (on→off→on around a measurement) and is
 * correct as a flip whatever the starting state is; converting those would have
 * been a rewrite, not a repair.
 */
async function setViewOverlay(c, re, want) {
  const opened = await c.evalExpr(OPEN_VIEW_MENU);
  if (opened !== true) return { error: opened };
  await sleep(400);
  const seen = await c.json(READ_VIEW_ITEM(re));
  let r = { ...seen, clicked: false };
  if (seen.error === undefined && seen.checked !== want) {
    r = { ...(await c.json(CLICK_VIEW_ITEM(re))), clicked: true };
  }
  await sleep(300);
  await c.evalExpr(OPEN_VIEW_MENU).catch(() => {});   // close
  await sleep(300);
  return { ...r, after: r.clicked ? r.after : seen.checked };
}

/** A real key event on the window — the camera keys' own listener. */
async function pressKey(c, key, shift = false) {
  const base = { key, code: key, windowsVirtualKeyCode: { ArrowRight: 39, ArrowLeft: 37 }[key] ?? 0,
    modifiers: shift ? 8 : 0 };
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

/**
 * A whole horizontal RUN of pixels off the LIVE map canvas, as one flat array.
 *
 * `getContext('2d')` returns the context the app already drew with, so this is
 * the composited result — level art, the plane, the ramp — not a fresh surface.
 * `canvas.width = rect.width` (MapViewport:1040) means this space is CSS
 * pixels, so at zoom 1 one entry here is one screen pixel of the preview.
 */
const ROW_AT = (x, y, len) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(Math.round(${x}), Math.round(${y}), ${len}, 1).data;
  return Array.from(d);
})()`;

/**
 * A per-ROW fingerprint of a rectangle of the live map canvas, in ONE round
 * trip — `rows[i]` is an FNV-1a of row `i`'s RGB bytes.
 *
 * Done in-page rather than as 112 separate `getImageData` calls because the
 * calibration below has to re-take the whole rectangle several times, and a
 * probe slow enough to tempt its author into sampling less is a probe that
 * ends up sampling the wrong thing.
 */
const ROW_HASHES = (x, y, w, h) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(${x}, ${y}, ${w}, ${h}).data;
  const rows = [];
  for (let r = 0; r < ${h}; r++) {
    let hsh = 0x811c9dc5;
    for (let cx = 0; cx < ${w}; cx++) {
      const o = (r * ${w} + cx) * 4;
      for (let k = 0; k < 3; k++) { hsh ^= d[o + k]; hsh = Math.imul(hsh, 0x01000193); }
    }
    rows.push(hsh >>> 0);
  }
  return rows;
})()`;

/** One pixel of a row array, as `r,g,b`. Alpha is dropped: the frame is opaque. */
function px(row, i) { return `${row[i * 4]},${row[i * 4 + 1]},${row[i * 4 + 2]}`; }
function rowKey(row) {
  const out = [];
  for (let i = 0; i * 4 < row.length; i++) out.push(px(row, i));
  return out.join('|');
}
function distinctPixels(row) {
  const s = new Set();
  for (let i = 0; i * 4 < row.length; i++) s.add(px(row, i));
  return s.size;
}

// ── THE CONTRACT, RESTATED INDEPENDENTLY ───────────────────────────────────
//
// `asr.w` — the 68000 arithmetic right shift the decoder is built on: signed,
// 16-bit, rounding toward negative infinity.
function asrW(v, s) { return (((v | 0) << 16) >> 16) >> s; }
/** `decodeFactorScroll` for the single-term factors this harness uses. */
function decode(camX, name) { return asrW(camX, SHIFT[name]); }
/**
 * The ramp's scroll at line `i`, as a CLOSED FORM — deliberately a different
 * expression from the app's Bresenham loop, so row 5d compares two answers
 * rather than one answer twice.
 *
 * The engine ramps the HSCROLL WORD, which is the NEGATED scroll, and floor
 * division is not symmetric under negation — so the conversion in and out is
 * the whole point of writing it this way:
 *
 *   baseW = -decode(camX, fb),  farW = -decode(camX, to),  spread = farW - baseW
 *   line i shows  -(baseW + floor(i * spread / span))
 */
function rampScrollAt(camX, fb, to, span, i) {
  const baseW = -decode(camX, fb);
  const farW = -decode(camX, to);
  const spread = farW - baseW;
  return -(baseW + Math.floor((i * spread) / span));
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
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
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.cameraPreview === "function"');
    check('0a', 'the build under test has the camera-preview probe at all',
      haveProbe === true, `${RUN.root}/dist`);
    if (!haveProbe) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon, reach the Effects facet. ---------------------------
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

    await sleep(2500);
    check('1b', 'the facet bar offers an Effects pill',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1200);

    // ---- 2. Author the scene through the real form. -----------------------
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    const scenes = await c.json('window.__dbg.aeon.scenes()');
    check('2a', 'ANTI-VACUOUS: the scene this harness authored exists in the model',
      scenes.some((s) => s.id === SCENE_ID) && scenes.length === scenes0.length + 1,
      `after=${JSON.stringify(scenes.map((s) => s.id))}`);
    const picked = await c.evalExpr('window.__dbg.aeon.selectedScene()');
    check('2b', 'ANTI-VACUOUS: the panel selected it, so MapViewport has a scene to draw',
      picked === SCENE_ID, `selectedScene()=${JSON.stringify(picked)}`);

    // Layer 0's Plane-B factor, through the picker an author uses.
    watchMiss('2c fb select', await c.evalExpr(SET_INPUT(
      selectByTitle('Layer 0 fb —'), FB)));
    await sleep(600);
    const sceneOf = (doc) => doc.find((s) => s.id === SCENE_ID) ?? null;
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('2c', `the fb picker wrote ${FB} to the document`,
      sceneOf(doc)?.layers?.[0]?.fb === FB, JSON.stringify(sceneOf(doc)?.layers?.[0]));
    const nLayers = sceneOf(doc)?.layers?.length ?? 0;
    note(`the new scene has ${nLayers} layer(s); band 0 therefore owns rows 0..223`);

    // ---- 3. Turn the composite on and drive the camera OFF ZERO. ----------
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(500);
    const frameOn = await toggleViewOverlay(c, '/^Screen frame/');
    note(`Screen frame checkbox: ${JSON.stringify(frameOn)}`);
    // PUT, not flip — see `setViewOverlay`. Since EW-SHAPE-PREVIEW the
    // composite is already on when this harness arrives, and a flip here would
    // have turned it off.
    const composeOn = watchMiss('3a compose', await setViewOverlay(
      c, '/^Compose the background in the frame/', true));
    check('3a', "the real View menu OFFERS the composite's checkbox, and it is ON "
      + '(on by default now; this row asks for the state, not for a click)',
      !!composeOn && composeOn.error === undefined && composeOn.after === true,
      JSON.stringify(composeOn));

    // The camera keys are a WINDOW listener, so the map must have focus for a
    // real key event to reach them the way an author's would.
    await c.evalExpr(`(() => { const cv = document.getElementById('map-canvas');
      if (cv) { cv.focus?.(); } return true; })()`);
    for (let i = 0; i < PRESSES; i++) { await pressKey(c, 'ArrowRight', true); await sleep(60); }
    await sleep(900);

    let rep = await c.json('window.__dbg.aeon.cameraPreview()');
    check('3b', 'ANTI-VACUOUS: the composite is ACTIVE for this scene and actually blitted',
      rep.active === true && rep.sceneId === SCENE_ID && rep.blits > 0 && rep.paints > 0,
      `active=${rep.active} scene=${rep.sceneId} blits=${rep.blits} paints=${rep.paints}`);
    check('3c', `THE VACUITY GUARD: the camera is at x=${CAM_X}, NOT 0 (at 0 every ramp is flat)`,
      rep.camX === CAM_X, `${PRESSES} x Shift+ArrowRight (${COARSE}px each) -> camX=${rep.camX}`);

    const dpr = await c.evalExpr('window.devicePixelRatio');
    const frameRect = (await c.json('window.__dbg.aeon.screenFrame()')).rect;
    const view = await c.json('window.__dbg.view()');
    note(`dpr=${dpr}  frame rect=${JSON.stringify(frameRect)}  view=${JSON.stringify(view)}`);

    // ---- 4. The provenance row this branch owns. --------------------------
    // `ramp` does not exist on master's CameraPreviewBand, so its PRESENCE is
    // what says the bundle under test contains the parcel. Checked before any
    // ramp row, so a PASS below cannot be describing a build without it.
    check('4a', "the report's bands carry a `ramp` field (this branch, not master)",
      Array.isArray(rep.bands) && rep.bands.length > 0 && 'ramp' in rep.bands[0],
      `band 0 keys: ${JSON.stringify(Object.keys(rep.bands[0] ?? {}))}`);
    check('4b', 'with NO curve authored, the band reports no ramp at all',
      rep.bands[0].ramp === null, `ramp=${JSON.stringify(rep.bands[0].ramp)}`);

    // ---- 5. Author the curve, and check the arithmetic. -------------------
    watchMiss('5 curve select', await c.evalExpr(SET_INPUT(
      selectByTitle('Layer 0 curve.to —'), TO)));
    await sleep(900);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5a', `the curve picker wrote {to: ${TO}} to the DOCUMENT`,
      JSON.stringify(sceneOf(doc)?.layers?.[0]?.curve) === JSON.stringify({ to: TO }),
      JSON.stringify(sceneOf(doc)?.layers?.[0]?.curve));

    rep = await c.json('window.__dbg.aeon.cameraPreview()');
    let band = rep.bands[0];
    const span = band.screenBottom - band.screenTop;
    check('5b', 'the band the app DREW now carries a ramp, over its whole span',
      band.ramp !== null && band.ramp.length > 0
      && band.ramp.reduce((a, r) => a + r.rows, 0) === span,
      `span=${span} runs=${band.ramp?.length} rows=${band.ramp?.reduce((a, r) => a + r.rows, 0)}`);

    // THE DRAW, NOT JUST THE PLAN. A ramp that reached the report but not
    // `drawCameraPreview` would leave this at the flat path's blit count. One
    // source, one band, no plane wrap => flat is exactly 1 drawImage; a ramp is
    // one per RUN.
    check('5f', 'the DRAW issued one blit per ramp run, not the flat path\'s single blit',
      rep.blits === band.ramp.length,
      `blits=${rep.blits} runs=${band.ramp?.length} (flat was ${1})`);

    // The scroll one screen line shows, read back out of the app's runs.
    const at = (i) => {
      for (const r of band.ramp) {
        if (i >= r.screenTop - band.screenTop && i < r.screenTop - band.screenTop + r.rows) return r.scrollX;
      }
      return NaN;
    };
    check('5c', `the ramp STARTS at fb's own decode: ${CAM_X}>>${SHIFT[FB]} = ${decode(CAM_X, FB)}`,
      at(0) === decode(CAM_X, FB), `line 0 scrollX=${at(0)}`);

    // THE CATCHER FOR THE WHOLE PARCEL, and the row the old behaviour fails.
    check('5d', 'THE CATCHER: the strip is NOT FLAT — its last line differs from its first',
      at(span - 1) !== at(0),
      `line 0 = ${at(0)}, line ${span - 1} = ${at(span - 1)} `
      + `(flat, i.e. broken, would be ${at(0)} at both)`);

    // Every line, against the closed form — a DIFFERENT expression from the
    // app's accumulator. This is what catches a lerp: an un-negated linear
    // interpolation gives 80 at line 1 where the engine gives 81.
    const bad = [];
    for (let i = 0; i < span; i++) {
      const want = rampScrollAt(CAM_X, FB, TO, span, i);
      if (at(i) !== want) bad.push(`line ${i}: app ${at(i)} != contract ${want}`);
    }
    check('5e', `every one of the ${span} lines matches the closed form derived from the factors`,
      bad.length === 0, bad.length === 0
        ? `line 0=${at(0)}  line 1=${at(1)} (a lerp would say ${decode(CAM_X, FB)})  `
          + `line ${span - 1}=${at(span - 1)}`
        : bad.slice(0, 6).join('; '));

    // ---- 6. IS IT ON THE CANVAS? -----------------------------------------
    //
    // ⚠ THE INSTRUMENT CALIBRATES ITSELF FIRST, AND THE FIRST RUN OF THIS
    // HARNESS IS WHY. It probed the band's last few rows on the reasoning that
    // "deep in the strip" is where the ramp is largest — and those rows came
    // back UNCHANGED by the curve while every model row passed. The reason is
    // in this file's own subject matter: the frame's interior is the composite
    // with the FOREGROUND drawn over it (camera-preview.ts's docblock says so),
    // and OJZ's Plane B at screen rows 0..223 is mostly empty sky. The probe
    // was sampling level art the composite never touches, and a row asserting
    // "these pixels changed" would have been asserting it of the wrong pixels.
    //
    // So: before any curve pixel is compared, find which rows the COMPOSITE
    // owns, by toggling the composite itself off and back on and keeping the
    // rows that move. A row that does not move for the whole feature cannot
    // move for one of its parameters, and no row below is allowed to be run on
    // one.
    const PROBE_LEN = 240;   // stops short of the frame's right edge, so 6e's
                             // shifted comparison never needs the plane's wrap
    const rowXY = (line) => [frameRect.x + 4, frameRect.y + (band.screenTop + line) * view.zoom];
    const sampleRow = async (line) => c.json(ROW_AT(...rowXY(line), PROBE_LEN));

    // ⚠ AND IT SWEEPS `v_offset`, WHICH THE FIRST CALIBRATION MADE NECESSARY.
    // At v_offset 0 the calibration reported 0/112 owned rows: OJZ's Plane B is
    // EMPTY at plane lines 0..223, so the composite blitted 81 times and every
    // one of them drew transparent pixels. That is a true fact about the
    // fixture, not about the feature, and the honest response is to move the
    // frame onto plane rows that HAVE art rather than to weaken the assertion.
    // Under the lock, `Vscroll_BG = v_offset` (transcription 3), so v_offset is
    // exactly "which plane rows this frame shows" — the scene's own control,
    // set through the panel's own spinner.
    const FRAME_X = Math.round(frameRect.x);
    const FRAME_Y = Math.round(frameRect.y + band.screenTop * view.zoom);
    const frameRows = async () => c.json(ROW_HASHES(FRAME_X, FRAME_Y, PROBE_LEN, span));
    const ownedAt = async () => {
      const on = await frameRows();
      await toggleViewOverlay(c, '/^Compose the background in the frame/');
      await sleep(600);
      const off = await frameRows();
      await toggleViewOverlay(c, '/^Compose the background in the frame/');
      await sleep(600);
      const out = [];
      for (let i = 0; i < span; i++) if (on[i] !== off[i]) out.push(i);
      return out;
    };

    // ⚠ AND IT TURNS THE "Bg Plane" OVERLAY ON FIRST, which is a DEFECT this
    // harness found and row 6g pins. With that overlay off, MapViewport's FG
    // branch calls `drawCamera()` and then `sectionRenderer.render(..., clear
    // = true)`, whose first act is `fillRect` over the WHOLE canvas — the
    // composite is drawn, counted in `blits`, reported `active`, and then
    // painted black. Measured: 0/224 owned rows at every v_offset with the
    // overlay off. See row 6g.
    const bgPlaneOn = await toggleViewOverlay(c, '/^Bg Plane$/');
    note(`Bg Plane checkbox: ${JSON.stringify(bgPlaneOn)}`);
    await sleep(700);

    // ⚠ OPEN THE SCENE FORM BEFORE SWEEPING v_offset. Since d-26b (2026-09-02,
    // docs/reviews/2026-09-02-effects-sub-tabs.md §3) `aeon.effects.scene` is
    // `defaultCollapsed`, and a collapsed section is UNMOUNTED rather than
    // hidden, so the v_offset spinner is not in the DOM on arrival. That is
    // what [7d] was reporting: `6 v_offset: "no-element"`, eight times, one per
    // sweep candidate. Nothing else went red, because the sweep's FIRST
    // candidate is 0 and the scene already sat at 0 — [6a] found its rows and
    // passed on a field that had never been written. The blanket row is the only
    // thing between that and a green run measuring an unset fixture, which is
    // exactly the job it was written for; it is worth saying so out loud.
    const sceneForm = await c.evalExpr(String.raw`
      (() => {
        const has = () => [...document.querySelectorAll('input')]
          .some((e) => (e.title || '').startsWith('v_offset —'));
        if (has()) return 'already-open';
        const hdr = [...document.querySelectorAll('div')]
          .filter((d) => d.style && d.style.cursor === 'pointer'
                      && /^SCENE\s*—/i.test((d.innerText || '').trim()))[0];
        if (!hdr) return 'no-scene-header';
        hdr.click();
        return 'clicked';
      })()`);
    await sleep(900);
    check('6a0', 'INSTRUMENT: the Scene form is open, so the v_offset sweep below writes a real '
      + 'field — it arrives collapsed since d-26b',
      sceneForm === 'clicked' || sceneForm === 'already-open', `open -> ${sceneForm}`);

    let owned = [];
    let vOff = 0;
    for (const cand of [0, 128, 256, 384, 64, 192, 320, 448]) {
      watchMiss('6 v_offset', await c.evalExpr(SET_INPUT(
        `[...document.querySelectorAll('input[type=number]')].find(e => (e.title||'').startsWith('v_offset —'))`,
        cand)));
      await sleep(800);
      const vo = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'))
        .find((s) => s.id === SCENE_ID)?.v_offset ?? 0;
      owned = await ownedAt();
      note(`v_offset ${cand} (document says ${vo}): ${owned.length}/${span} rows are the composite's`);
      if (owned.length > 8) { vOff = vo; break; }
    }
    check('6a', "CALIBRATION: some rows inside the frame are the COMPOSITE's own pixels",
      owned.length > 8,
      `at v_offset ${vOff}: ${owned.length}/${span} rows move when the composite is toggled`
      + `${owned.length ? `, lines ${owned[0]}..${owned[owned.length - 1]}` : ' — NOTHING below is measurable'}`);
    if (owned.length <= 8) {
      note('LOUD UNMEASURABLE: the composite owns (almost) no pixel at any v_offset tried, so '
        + '6b/6d/6e/6f cannot be run. This is an INSTRUMENT LIMIT, not a passing feature.');
      throw new Error('no composite-owned rows to probe');
    }
    // Re-read the plan: v_offset moved the vscroll, and the ramp is re-derived
    // against the same camX, so the runs are unchanged — but read it rather
    // than assume it.
    rep = await c.json('window.__dbg.aeon.cameraPreview()');
    band = rep.bands[0];

    // The shallowest owned row, where the ramp is by construction equal to flat
    // — and, for the discriminating rows, the RICHEST owned row in the deep
    // half of the strip.
    //
    // ⚠ RICHEST, NOT DEEPEST, AND THE SECOND RUN OF THIS HARNESS IS WHY. The
    // deepest row (223) is mostly foreground canopy over a low-entropy patch of
    // plane: 6f's shift search scored 84.8% at the right answer and 83.3% at
    // the runner-up, which is noise, and it "failed" a build whose ramp was
    // correct. A shift can only be MEASURED where the picture has enough detail
    // to distinguish one offset from another, so the row is chosen for that.
    const TOP = owned[0];
    const deep = owned.filter((l) => l >= Math.floor(span / 2));
    let LOW = deep[deep.length - 1];
    let bestVar = -1;
    for (let i = 0; i < deep.length; i += Math.max(1, Math.floor(deep.length / 14))) {
      const v = distinctPixels(await sampleRow(deep[i]));
      if (v > bestVar) { bestVar = v; LOW = deep[i]; }
    }
    note(`LOW chosen for detail: line ${LOW} with ${bestVar} distinct colours `
      + `(of ${deep.length} owned rows in the strip's deep half)`);
    note(`probe rows: TOP line ${TOP} (ramp == flat there), LOW line ${LOW}, at canvas `
      + `${JSON.stringify(rowXY(TOP))} / ${JSON.stringify(rowXY(LOW))}, len ${PROBE_LEN}, zoom ${view.zoom}`);

    const topOn = watchMiss('6 topOn', await sampleRow(TOP));
    const lowOn = watchMiss('6 lowOn', await sampleRow(LOW));
    await shot(c, 'curve-on');

    // THE CONTROL THAT MAKES 6d MEAN ANYTHING. A row of one flat colour is
    // unchanged by ANY scroll, so "the low row changed" would be unprovable —
    // and "the top row did not" would be free.
    // Only the LOW row carries a discriminating claim (6e/6f), so only it has
    // to be varied. The TOP row is sky and is allowed to be nearly flat: 6d's
    // claim about it is corroboration, and the assertion it rests on is 5c's,
    // which is arithmetic and not pixels.
    check('6b', 'ANTI-VACUOUS: the row the discriminating rows use is varied art, not flat colour',
      distinctPixels(lowOn) > 4,
      `distinct colours: low=${distinctPixels(lowOn)} (top=${distinctPixels(topOn)}, `
      + 'not load-bearing)');

    // Now take the curve away and re-sample the SAME two rows.
    watchMiss('6 curve off', await c.evalExpr(SET_INPUT(
      selectByTitle('Layer 0 curve.to —'), '__none__')));
    await sleep(900);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const curveGone = sceneOf(doc)?.layers?.[0]?.curve;
    check('6c', 'ANTI-VACUOUS: the curve really came back OFF (the differential has two sides)',
      curveGone === undefined || curveGone === 'none', JSON.stringify(curveGone));
    const repFlat = await c.json('window.__dbg.aeon.cameraPreview()');
    const topOff = watchMiss('6 topOff', await sampleRow(TOP));
    const lowOff = watchMiss('6 lowOff', await sampleRow(LOW));
    await shot(c, 'curve-off');

    check('6d', `PIXELS: the strip's shallowest owned row (line ${TOP}) is barely moved by the `
      + 'curve — a ramp starts AT fb',
      Math.abs(at(TOP) - decode(CAM_X, FB)) <= 1,
      `ramp scroll at line ${TOP} = ${at(TOP)}, fb's flat scroll = ${decode(CAM_X, FB)}; `
      + `pixels identical=${rowKey(topOn) === rowKey(topOff)}; repaint proof: paints `
      + `${rep.paints} -> ${repFlat.paints}`);
    check('6e', `PIXELS: line ${LOW}, deep in the strip, IS changed by the curve — the ramp is `
      + 'on screen',
      rowKey(lowOn) !== rowKey(lowOff),
      `differ=${rowKey(lowOn) !== rowKey(lowOff)}`);

    // NOT SETTLING FOR "DIFFERENT". The composite shows plane column
    // `scroll + c` at screen column `c`, so the curved row is the flat row
    // shifted by exactly the scroll difference the app REPORTS for that line.
    // At zoom 1 one screen pixel is one canvas pixel, so this is an integer
    // shift and the comparison is exact.
    //
    // ⚠ MEASURED OVER MANY ROWS, BY SEARCH, AND THE REASON IS THAT THE FRAME'S
    // INTERIOR IS THREE PICTURES AT ONCE. `renderBg` paints Plane B in plane
    // space, the composite repaints the frame's interior, and
    // `sectionRenderer.render` composites Plane A OVER both — and THE LEVEL ART
    // DOES NOT MOVE WITH THE CURVE. So:
    //   * only the columns the composite OWNS are scored (established per row
    //     by toggling the composite off, exactly as the row calibration did),
    //   * the shift is found by SEARCH rather than asserted at one offset, and
    //   * the claim is made over a SPREAD OF ROWS, because the ramp predicts a
    //     DIFFERENT shift for each one. A single row proves a shift; a dozen
    //     rows whose shifts each match their own line's predicted scroll proves
    //     the RAMP — nothing but a per-line scroll can produce that.
    // A build with no ramp gives every row the same shift, 0, and fails.
    watchMiss('6f curve on', await c.evalExpr(SET_INPUT(
      selectByTitle('Layer 0 curve.to —'), TO)));
    await sleep(900);
    const scanRows = [];
    for (let k = 1; k <= 12; k++) {
      const l = owned.find((o) => o >= Math.floor((span * k) / 13));
      if (l !== undefined && !scanRows.includes(l)) scanRows.push(l);
    }
    const onRows = {};
    const offRows = {};
    const baseRows = {};
    for (const l of scanRows) onRows[l] = await sampleRow(l);          // curve ON
    await toggleViewOverlay(c, '/^Compose the background in the frame/');
    await sleep(700);
    for (const l of scanRows) baseRows[l] = await sampleRow(l);        // composite OFF
    await toggleViewOverlay(c, '/^Compose the background in the frame/');
    await sleep(700);
    watchMiss('6f curve off', await c.evalExpr(SET_INPUT(
      selectByTitle('Layer 0 curve.to —'), '__none__')));
    await sleep(900);
    const repFlat2 = await c.json('window.__dbg.aeon.cameraPreview()');
    for (const l of scanRows) offRows[l] = await sampleRow(l);         // curve OFF

    const flatScroll = repFlat2.bands[0].scrollX;
    const bestShiftFor = (l) => {
      const on = onRows[l];
      const off = offRows[l];
      const base = baseRows[l];
      const owns = [];
      for (let i = 0; i < PROBE_LEN; i++) owns.push(px(on, i) !== px(base, i));
      let best = -1;
      let bestD = -1;
      let runner = -1;
      for (let d = 0; d <= 160; d++) {
        let n = 0;
        let of = 0;
        for (let cx = 0; cx + d < PROBE_LEN; cx++) {
          if (!owns[cx]) continue;
          of++;
          if (px(on, cx) === px(off, cx + d)) n++;
        }
        const sc = of < 20 ? -1 : n / of;
        if (sc > best) { runner = best; best = sc; bestD = d; }
        else if (sc > runner) runner = sc;
      }
      return { d: bestD, score: best, runner };
    };

    const scan = scanRows.map((l) => {
      const m = bestShiftFor(l);
      return { line: l, want: at(l) - flatScroll, got: m.d, score: m.score, runner: m.runner };
    });
    const hits = scan.filter((r) => r.got === r.want);
    note('shift per row — line: predicted / measured (confidence):\n        '
      + scan.map((r) => `L${r.line}: want ${r.want}, got ${r.got} `
        + `(${(r.score * 100).toFixed(0)}% vs runner-up ${(r.runner * 100).toFixed(0)}%)`).join('\n        '));
    check('6f', "PIXELS, DERIVED: each row's measured horizontal shift is the scroll the ramp "
      + 'predicts FOR THAT LINE — a different number on every row',
      view.zoom === 1 && hits.length === scan.length && new Set(scan.map((r) => r.want)).size > 3,
      `${hits.length}/${scan.length} rows match their own predicted shift; `
      + `${new Set(scan.map((r) => r.want)).size} distinct predictions across the strip `
      + `(a flat, i.e. broken, build predicts 0 on every row)`);

    // ---- 6g. THE DEFECT THIS HARNESS FOUND, PINNED. ----------------------
    // With the "Bg Plane" overlay OFF, MapViewport's FG branch used to call
    // `drawCamera()` and then `sectionRenderer.render(..., clear = true)`,
    // whose first act is a `fillRect` over the whole canvas. The composite was
    // drawn, `blits` counted every `drawImage`, `cameraPreview()` reported
    // `active: true` — and the author saw black. Every instrument in the app
    // said yes and the screen said no, which is exactly the class of defect
    // this parcel is about.
    //
    // RED-FIRST, MEASURED BEFORE THE FIX: 0/224 rows owned at v_offset 0, and
    // 0/224 at each of 128/256/384/64/192/320/448. After: this row.
    await toggleViewOverlay(c, '/^Bg Plane$/');           // back OFF
    await sleep(700);
    const ownedNoBg = await ownedAt();
    check('6g', 'THE COMPOSITE SURVIVES THE BACKGROUND CLEAR with the Bg Plane overlay OFF',
      ownedNoBg.length > 8,
      `${ownedNoBg.length}/${span} rows are the composite's own with the overlay off `
      + '(0/224 before the fix — drawn, then painted black by render()\'s clear)');
    await toggleViewOverlay(c, '/^Bg Plane$/');           // back ON for the rest
    await sleep(700);

    // ---- 7. Controls and blankets. ---------------------------------------
    // to == fb: the pair the engine REFUSES, and the one that renders exactly
    // like no curve at all. It is here so no row above can be read as having
    // been proved with it.
    watchMiss('7 curve=fb', await c.evalExpr(SET_INPUT(selectByTitle('Layer 0 curve.to —'), FB)));
    await sleep(900);
    const repSame = await c.json('window.__dbg.aeon.cameraPreview()');
    const sameRamp = repSame.bands[0].ramp;
    check('7a', 'CONTROL (non-discriminating by construction): to == fb renders FLAT',
      Array.isArray(sameRamp) && sameRamp.length === 1
      && sameRamp[0].scrollX === decode(CAM_X, FB),
      `runs=${sameRamp?.length} scrollX=${sameRamp?.[0]?.scrollX} — proves nothing on its own`);
    const advice = await c.json(
      `[...document.querySelectorAll('div,span')].map(e => (e.textContent||'').trim())
        .filter(t => /ramp goes nowhere/.test(t)).slice(0,1)`);
    check('7b', 'and the panel SAYS the build will refuse it (curveAdvisory is on screen)',
      advice.length === 1, JSON.stringify(advice));

    const off = watchMiss('7 compose off', await toggleViewOverlay(
      c, '/^Compose the background in the frame/'));
    await sleep(700);
    const repOff = await c.json('window.__dbg.aeon.cameraPreview()');
    check('7c', 'INSTRUMENT CONTROL: the report is LIVE — turning the composite off says so',
      repOff.active === false && repOff.bands.length === 0,
      `active=${repOff.active} bands=${repOff.bands.length} paints=${repOff.paints}`);

    check('7d', 'BLANKET: no selector or pixel probe came back empty all run',
      misses.length === 0, misses.length === 0 ? 'none' : misses.join(' | '));

    // ---- 8. The picture for the owner's display. --------------------------
    await toggleViewOverlay(c, '/^Compose the background in the frame/');
    watchMiss('8 curve back', await c.evalExpr(SET_INPUT(selectByTitle('Layer 0 curve.to —'), TO)));
    await sleep(1000);
    await shot(c, 'FOR-THE-OWNER-curve-ramp');
    const finalRep = await c.json('window.__dbg.aeon.cameraPreview()');
    note('the shot shows: ' + JSON.stringify({
      camX: finalRep.camX, absent: finalRep.absent,
      band0: finalRep.bands[0] && {
        ramp: finalRep.bands[0].ramp?.length, first: finalRep.bands[0].ramp?.[0]?.scrollX,
        last: finalRep.bands[0].ramp?.[finalRep.bands[0].ramp.length - 1]?.scrollX,
      },
    }));
    check('8a', 'the absence banner NO LONGER names curve ramps',
      Array.isArray(finalRep.absent) && !finalRep.absent.join('|').includes('curve'),
      JSON.stringify(finalRep.absent));
  } finally {
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed`);
    if (fails.length) console.log(`FAILED: ${fails.join(', ')}`);
    try { c?.close(); } catch { /* closing */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
