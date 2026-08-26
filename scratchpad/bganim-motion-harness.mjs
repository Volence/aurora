#!/usr/bin/env node
// DO THE BANDS ACTUALLY MOVE, AND DO THE RIGHT ONES STAY STILL?
//
// ROADMAP item 42. The node suite has ~4,550 tests over this feature and cannot
// see one pixel of it: it cannot tell whether the overlay reaches the canvas,
// whether the clock starts, whether it stops, or — the row that matters most —
// whether a CAMERA band is quietly being animated on a wall clock, which is the
// one outcome the preview-posture ruling exists to prevent.
//
// ═══ EVERY VERDICT IS AN INDEPENDENT OBSERVATION ═══
//
// Nothing below asks the component whether it worked. Three instruments, all
// installed from outside:
//
//   REPAINTS   the `canvas.width` setter on `#map-canvas` — the same repaint
//              start signal the MapViewport baseline harness counts.
//   PIXELS     `getImageData` on `#map-canvas`, sampled in WORLD coordinates
//              (canvas = (world - vp) * zoom), so the same background cells are
//              read before and after a pan and any difference is phase, not
//              scroll.
//   rAF        a wrapper on `window.requestAnimationFrame` counting SCHEDULED
//              callbacks per second. An orphaned playback loop shows up here as
//              ~60/s that never goes away, whether or not it repaints.
//
// ═══ THE FIXTURE, AND WHY THERE HAS TO BE ONE ═══
//
// The live aeon tree cannot exercise this feature at all: its
// `editor_bg_override.json` and the background Aurora paints for that section are
// two different tile blobs holding the same art at different indices, so the
// preview's licence check refuses (correctly) and every motion row would be
// vacuous. `bganim-preview-fixture.mjs` builds the coherent state FROM the real
// document. See docs/reviews/2026-08-26-bganim-preview-blob-divergence.md.
//
// It also promotes a second band with driver `camera_x`, so both driver classes
// are on one screen at once. That is what lets rows 3a and 3b be a CONTRAST
// rather than two separate measurements: in the same window, on the same canvas,
// one band's cells move and the other's do not.
//
// ═══ WHICH ROWS DO NOT DISCRIMINATE (stated up front) ═══
//
//   • 0a/0b/1a (debug build, project open, both bands drawn) are PRECONDITIONS.
//     They are reported as rows so a run against a broken fixture reads as
//     "could not measure" instead of silently making everything below vacuous,
//     and every later row aborts if they fail.
//   • 2a's rAF liveness half proves only that the page is alive. It is the
//     anti-vacuous companion to 2a's zero, not a finding.
//   • 5b (facet unmount) can only report what it can see: if switching facets
//     does not unmount `#map-canvas`, the row says so rather than claiming a
//     cancellation it did not test.
//
// ⚠ THE ZERO IN ROW 2a IS EARNED, NOT ASSUMED. "No repaints happened" and "my
// instrument never saw anything" print the same. The SAME counter is read
// non-zero in row 3a, in the same session, minutes apart — so a zero in 2a means
// the viewport was idle, not that the probe was dead.
//
// ⚠ WRITES NOTHING to the aeon tree: it opens the fixture copy, and never saves.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/bganim-motion-harness.mjs

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { buildFixture, fixtureFacts } from './bganim-preview-fixture.mjs';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN ?? `${ROOT}/node_modules/.bin/electron`;
const SHOTS = `${ROOT}/scratchpad/shots-bganim-motion`;
mkdirSync(SHOTS, { recursive: true });

/** Game frames per second — the rate the preview clock and the engine share. */
const FPS = 60;
/** Plane B cells are 8px. Read from the contract by the fixture builder too. */
const CELL_PX = 8;
const BG_COLS = 64;

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
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}\n        ${detail}`);
  results.push({ id, name, ok: null });
}

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-bganim-motion/${name}.png`);
}

/**
 * Flip a View-menu overlay checkbox, by opening the real menu and clicking the
 * real input.
 *
 * THREE STEPS WITH REAL WAITS BETWEEN THEM, and that is the whole lesson: the
 * menu panel is mounted only while open, and React does not flush that render
 * inside the same task as the click. A single-eval version of this returned
 * "no-label" against a menu that was about to exist, and reported a hidden
 * Plane B as a working one.
 *
 * NOTE the label text: `ViewMenu.pretty` strips the `show` prefix, so the
 * checkbox beside `showBgPlane` reads "Bg Plane", not "Show Bg Plane".
 */
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

async function toggleViewOverlay(c, re) {
  const opened = await c.evalExpr(OPEN_VIEW_MENU);
  if (opened !== true) return { error: opened };
  await sleep(400);
  const res = await c.json(CLICK_VIEW_ITEM(re));
  await sleep(200);
  await c.evalExpr(OPEN_VIEW_MENU);      // click the button again to close
  await sleep(200);
  return res;
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

// ═══ THE INSTRUMENTS ═══
// Installed once, from outside the app, on the prototype / on window. None of
// them consults a React component, a store flag, or anything the feature could
// set to claim success.
const PROBE = String.raw`
(() => {
  if (window.__mp) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, rafScheduled: 0, rafCancelled: 0, ticks: 0, ticking: false };
  window.__mp = P;

  // REPAINTS — the draw pass's canvas.width assignment.
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) { if (this === P.canvas) P.repaints++; return wd.set.call(this, v); },
  });

  // rAF — how many callbacks the PAGE schedules. An orphaned loop is ~60/s that
  // never stops, whether or not it repaints anything.
  const rafOrig = window.requestAnimationFrame.bind(window);
  const cafOrig = window.cancelAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { P.rafScheduled++; return rafOrig(cb); };
  window.cancelAnimationFrame = (h) => { P.rafCancelled++; return cafOrig(h); };

  // LIVENESS — deliberately on the ORIGINAL rAF so the anti-vacuous ticker does
  // not pollute the rate it is there to make meaningful.
  const tick = () => { if (P.ticking) { P.ticks++; rafOrig(tick); } };
  P.start = () => { if (!P.ticking) { P.ticking = true; rafOrig(tick); } };
  P.stop = () => { P.ticking = false; };
  P.bound = () => P.canvas === document.getElementById('map-canvas');

  // PIXELS — sampled in WORLD coordinates. The caller supplies the viewport it
  // set, so this never asks the app where it thinks it is looking.
  P.sampleCells = (cells, vpX, vpY, zoom) => {
    const ctx = P.canvas.getContext('2d');
    let h = 2166136261, seen = 0, nonzero = 0;
    for (const [col, row] of cells) {
      const x = Math.round((col * 8 - vpX) * zoom);
      const y = Math.round((row * 8 - vpY) * zoom);
      const w = Math.round(8 * zoom), hh = Math.round(8 * zoom);
      if (x < 0 || y < 0 || x + w > P.canvas.width || y + hh > P.canvas.height) continue;
      const d = ctx.getImageData(x, y, w, hh).data;
      seen++;
      for (let i = 0; i < d.length; i++) {
        if (d[i] !== 0) nonzero++;
        h ^= d[i]; h = Math.imul(h, 16777619);
      }
    }
    return { hash: h >>> 0, cellsRead: seen, nonzeroBytes: nonzero };
  };
  return 'installed';
})()`;

const snap = (c) => c.json('({repaints: window.__mp.repaints, raf: window.__mp.rafScheduled, '
  + 'caf: window.__mp.rafCancelled, ticks: window.__mp.ticks})');
const sample = (c, cells, vp) => c.json(
  `window.__mp.sampleCells(${JSON.stringify(cells)}, ${vp.x}, ${vp.y}, ${vp.zoom})`);
const setView = (c, vp) => c.evalExpr(`window.__dbg.setView(${vp.x}, ${vp.y}, ${vp.zoom})`);

async function main() {
  console.log('\nBUILDING THE COHERENT FIXTURE (derived from the live override document)…');
  const dir = buildFixture();
  const facts = fixtureFacts();
  const timer = facts.bands.find((b) => b.driver === 'timer');
  const camera = facts.bands.find((b) => b.driver === 'camera_x');
  if (!timer || !camera) throw new Error('fixture must carry one timer band and one camera band');

  // DERIVED EXPECTATIONS. Not one of these is typed in.
  //   a timer band steps once per (1 << rate_shift) GAME FRAMES  -> steps/s
  //   a camera band steps once per (1 << rate_shift) CAMERA PIXELS
  //   both wrap after pattern_px steps, i.e. pattern_px << rate_shift units
  const timerUnits = 1 << timer.rateShift;
  const expectedStepsPerSec = FPS / timerUnits;
  const camUnits = 1 << camera.rateShift;
  const camPeriodPx = camera.patternPx * camUnits;
  console.log(`  timer band  ${timer.cols}x${timer.rows} rate_shift=${timer.rateShift}`
    + ` -> ${expectedStepsPerSec} steps/s (and so that many repaints/s, not ${FPS})`);
  console.log(`  camera band ${camera.cols}x${camera.rows} rate_shift=${camera.rateShift}`
    + ` -> 1 step per ${camUnits} camera px, wrapping every ${camPeriodPx} px`);

  // Which background cells draw which band, read from the fixture's own layout.
  const owner = (idx) => {
    for (const b of facts.bands) {
      if (idx >= b.slotBase && idx < b.slotBase + b.tileCount) return b.index;
    }
    return -1;
  };
  const cellsOf = (bandIndex, { minCol = 0, maxCol = BG_COLS - 1, minRow = 0, maxRow = 40 } = {}) => {
    const out = [];
    for (let i = 0; i < facts.layout.length; i++) {
      const w = facts.layout[i];
      if (w === 0) continue;
      if (owner(w & 0x7FF) !== bandIndex) continue;
      const col = i % BG_COLS, row = Math.floor(i / BG_COLS);
      if (col < minCol || col > maxCol || row < minRow || row > maxRow) continue;
      out.push([col, row]);
    }
    return out;
  };
  // Sample cells for the pan rows must stay ON SCREEN across the largest pan the
  // rows perform, so they are chosen to the RIGHT of it.
  const maxPan = camPeriodPx;
  const camCells = cellsOf(camera.index, { minCol: Math.ceil(maxPan / CELL_PX) + 2, minRow: 1 }).slice(0, 24);
  const timerCells = cellsOf(timer.index, { minRow: 1 }).slice(0, 24);
  console.log(`  sampling ${timerCells.length} timer cells and ${camCells.length} camera cells`);
  if (camCells.length === 0 || timerCells.length === 0) {
    throw new Error('the fixture layout draws no cells for one of the bands — every row below '
      + 'would be vacuous');
  }

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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build) [precondition]', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 0. Open the FIXTURE (never the aeon tree). ----------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(dir)})`)
      .catch((e) => console.log('        open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('0b', 'the fixture project is open, with sections [precondition]',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');

    await sleep(2000);
    check('0c', 'the Effects facet opens', await c.evalExpr(clickByText('/^Effects$/')) === true);
    await sleep(1200);
    // SETUP, not a measurement: the BG editing layer paints Plane B and nothing
    // else, so the pixel rows below read the band's own cells rather than
    // whatever the foreground happens to draw on top of them. The composite
    // path gets its own row (7a) at the end.
    await c.evalExpr(`window.__dbg.aeon.setLayer('bg')`);
    await sleep(600);

    const vp0 = { x: 0, y: 0, zoom: 1 };
    await setView(c, vp0);
    await sleep(800);

    const installed = await c.evalExpr(PROBE);
    check('0e', 'the three instruments installed on #map-canvas [precondition]',
      installed === 'installed' || installed === 'already', `probe -> ${installed}`);
    if (installed === 'no-map-canvas') throw new Error('no map canvas — nothing below can be measured');
    await shot(c, '1-effects-facet-bg-plane');

    // ---- 1. THE INSTRUMENT CAN SEE ITS SUBJECT. --------------------------
    const base = await sample(c, timerCells, vp0);
    const baseCam = await sample(c, camCells, vp0);
    check('1a', 'both bands\' cells are on screen and are not blank [anti-vacuous precondition]',
      base.cellsRead === timerCells.length && base.nonzeroBytes > 0
      && baseCam.cellsRead === camCells.length && baseCam.nonzeroBytes > 0,
      `timer: ${base.cellsRead}/${timerCells.length} cells, ${base.nonzeroBytes} nonzero bytes; `
      + `camera: ${baseCam.cellsRead}/${camCells.length} cells, ${baseCam.nonzeroBytes} nonzero`);
    if (base.cellsRead === 0 || baseCam.cellsRead === 0) {
      throw new Error('the probe read no pixels — every row below would be vacuous');
    }

    // ---- 1b. THE LABEL IS ON SCREEN. ------------------------------------
    // The preview's honesty label is a deliverable, not decoration: an
    // approximate preview that does not say WHICH four things are approximate
    // teaches an author to distrust the parts that are exact.
    // textContent, NOT innerText: innerText is layout-dependent and returned an
    // empty string for the whole body in this headless window, which made an
    // earlier revision of these two rows report a mounted, correct note as
    // missing. textContent sees the DOM whatever the layout is doing.
    const bodyText = await c.evalExpr(String.raw`(document.body.textContent || '').replace(/\s+/g, ' ')`);
    const labelBits = [
      'The preview is approximate',
      "the editor's wall clock",
      'clamps its camera to the level',
      'The ROM is the truth channel',
    ];
    check('1b', 'the Effects column carries the approximate label, and it NAMES its four caveats',
      labelBits.every((b) => bodyText.includes(b)),
      labelBits.map((b) => `${bodyText.includes(b) ? 'ok' : 'MISSING'}: ${b}`).join(' | '));
    // Both bands report themselves as previewing, with their resolved driver and
    // rate — the readout an author judges rate_shift against.
    check('1c', 'the note reports both bands with their resolved driver and cell count',
      /Band 0 .* timer/.test(bodyText) && /Band 1 .* camera_x/.test(bodyText)
      && /background cells/.test(bodyText) && !/Not previewing/.test(bodyText),
      bodyText.slice(bodyText.indexOf('Band preview'), bodyText.indexOf('Band preview') + 320));

    // ---- 2. THE IDLE PROPERTY, WITH PLAYBACK OFF. ------------------------
    // The property the MapViewport measurement established and this parcel
    // promised to CONDITION rather than spend.
    await c.evalExpr('window.__mp.start()');
    const idleA = await snap(c);
    await sleep(4000);
    const idleB = await snap(c);
    check('2a', 'toggle OFF: the viewport repaints EXACTLY ZERO times over 4s idle',
      idleB.repaints - idleA.repaints === 0,
      `repaints ${idleB.repaints - idleA.repaints}, page alive with `
      + `${idleB.ticks - idleA.ticks} rAF ticks in the same window `
      + '[the zero is earned by row 3a reading the same counter non-zero]');
    const idleRafRate = (idleB.raf - idleA.raf) / 4;
    console.log(`        idle rAF SCHEDULING baseline: ${idleRafRate.toFixed(1)}/s`);

    // ---- 3. PLAYBACK ON: THE TIMER BAND MOVES, AT ITS OWN RATE. ---------
    const played = await c.evalExpr(clickByText('/^Play bands$/'));
    check('3z', 'the Effects column offers the "Play bands" control and it clicks',
      played === true, `clickByText -> ${JSON.stringify(played)}`);
    await sleep(500);

    const onA = await snap(c);
    const WINDOW_S = 6;
    const hashes = new Set();
    const camHashes = new Set();
    for (let i = 0; i < 24; i++) {
      hashes.add((await sample(c, timerCells, vp0)).hash);
      camHashes.add((await sample(c, camCells, vp0)).hash);
      await sleep((WINDOW_S * 1000) / 24);
    }
    const onB = await snap(c);
    const secs = WINDOW_S;
    const repaintRate = (onB.repaints - onA.repaints) / secs;
    const rafRate = (onB.raf - onA.raf) / secs;

    check('3a', 'toggle ON: the viewport repaints — the SAME counter that read 0 in row 2a',
      onB.repaints - onA.repaints > 0, `${onB.repaints - onA.repaints} repaints in ${secs}s`);
    // DERIVED, not pinned: rate_shift 2 means one step per 4 game frames.
    check('3b', `the repaint rate is the band's own step rate (${expectedStepsPerSec}/s from `
      + `rate_shift ${timer.rateShift}), NOT the ${FPS}Hz tick`,
      Math.abs(repaintRate - expectedStepsPerSec) <= expectedStepsPerSec * 0.25
      && repaintRate < FPS * 0.5,
      `measured ${repaintRate.toFixed(1)} repaints/s vs ${expectedStepsPerSec} expected`);
    check('3c', 'the TIMER band\'s own cells change on the wall clock',
      hashes.size > 1, `${hashes.size} distinct pixel states over ${secs}s`);
    // THE RULING'S SUBSTANCE, and the row most likely to be got backwards.
    check('3d', 'the CAMERA band\'s cells do NOT change on the wall clock — same window, '
      + 'same canvas, same instrument',
      camHashes.size === 1,
      `${camHashes.size} distinct pixel states (must be 1) while the timer band showed `
      + `${hashes.size} in the same window`);
    console.log(`        rAF scheduling with playback ON: ${rafRate.toFixed(1)}/s `
      + `(idle baseline ${idleRafRate.toFixed(1)}/s)`);
    await shot(c, '2-playing');

    // ---- 4. THE CAMERA BAND MOVES ON THE PAN, AT ITS OWN RATE. ----------
    const at = async (dx, dy) => {
      const vp = { x: vp0.x + dx, y: vp0.y + dy, zoom: vp0.zoom };
      await setView(c, vp);
      await sleep(400);
      return (await sample(c, camCells, vp)).hash;
    };
    const h0 = await at(0, 0);
    const hSub = await at(camUnits - 1, 0);
    const hStep = await at(camUnits, 0);
    const hWrap = await at(camPeriodPx, 0);
    const hVert = await at(0, camUnits * 4);
    await setView(c, vp0);
    await sleep(400);

    check('4a', `panning one full step (${camUnits}px = 1 << rate_shift) changes the camera `
      + 'band\'s phase', hStep !== h0, `h(0)=${h0} h(${camUnits})=${hStep}`);
    check('4b', `panning ${camUnits - 1}px — one short of a step — does NOT: the rate IS the shift`,
      hSub === h0, `h(0)=${h0} h(${camUnits - 1})=${hSub}`);
    check('4c', `panning a whole pattern period (${camPeriodPx}px = pattern_px << rate_shift) `
      + 'returns the SAME phase', hWrap === h0, `h(0)=${h0} h(${camPeriodPx})=${hWrap}`);
    check('4d', 'panning VERTICALLY does not move a camera_x band — a driver names a scalar '
      + 'source, not an axis', hVert === h0, `h(0)=${h0} h(vertical)=${hVert}`);

    // ---- 5. THE CLOCK IS REALLY CANCELLED. ------------------------------
    const offClick = await c.evalExpr(clickByText('/^Playing$/'));
    check('5z', 'the control reads "Playing" while on, and clicking it stops playback',
      offClick === true, `clickByText -> ${JSON.stringify(offClick)}`);
    await sleep(800);
    const offA = await snap(c);
    await sleep(4000);
    const offB = await snap(c);
    const offRafRate = (offB.raf - offA.raf) / 4;
    check('5a', 'after toggle-off the viewport is idle again: zero repaints over 4s',
      offB.repaints - offA.repaints === 0,
      `${offB.repaints - offA.repaints} repaints, ${offB.ticks - offA.ticks} rAF ticks (page alive)`);
    // The independent half: an orphaned loop keeps SCHEDULING even if something
    // else stopped it repainting.
    check('5b', 'the rAF loop itself is gone — scheduling returns to the pre-playback baseline',
      Math.abs(offRafRate - idleRafRate) <= Math.max(6, idleRafRate * 0.5)
      && offRafRate < rafRate - 20,
      `after-off ${offRafRate.toFixed(1)}/s vs idle baseline ${idleRafRate.toFixed(1)}/s `
      + `vs playing ${rafRate.toFixed(1)}/s; cancelAnimationFrame called `
      + `${offB.caf - offA.caf === 0 ? offA.caf : offB.caf} times so far`);

    // ---- 7. THE COMPOSITE PATH. -----------------------------------------
    // Everything above ran on the BG editing layer, which paints Plane B alone.
    // The other way an author sees Plane B is the `showBgPlane` overlay in FG
    // mode, where the foreground composites OVER it — so this row can only
    // discriminate where the foreground leaves the band's cells visible.
    await c.evalExpr(`window.__dbg.aeon.setLayer('fg')`);
    await sleep(500);
    const withoutBg = (await sample(c, timerCells, vp0)).hash;
    const bgToggle = await toggleViewOverlay(c, '/^Bg Plane$/');
    check('7z', 'the View menu offers the Bg Plane overlay and it switches on',
      bgToggle && bgToggle.after === true, JSON.stringify(bgToggle).slice(0, 300));
    await sleep(500);
    const withBg = (await sample(c, timerCells, vp0)).hash;
    // WHETHER THIS ROW CAN DISCRIMINATE AT ALL is itself measured: if switching
    // Plane B on changes nothing at these cells, the foreground covers all of
    // them and one pixel state is what a CORRECT composite also produces.
    const planeBVisible = withBg !== withoutBg;
    await c.evalExpr(clickByText('/^Play bands$/'));
    await sleep(600);
    const compHashes = new Set();
    for (let i = 0; i < 12; i++) {
      compHashes.add((await sample(c, timerCells, vp0)).hash);
      await sleep(250);
    }
    if (planeBVisible) {
      check('7a', 'the overlay also animates in the FG composite (showBgPlane)',
        compHashes.size > 1,
        `${compHashes.size} distinct pixel states over 3s, at cells where Plane B is `
        + 'provably visible (switching it changed them)');
    } else {
      note('7a', 'the composite path could not be discriminated at these cells',
        'switching Plane B on changed NOTHING at every sampled band cell, so the foreground '
        + 'covers all of them and one pixel state is what a CORRECT composite also produces — '
        + 'this row did not touch its subject. The repaint rows above did run in this mode.');
    }
    await c.evalExpr(clickByText('/^Playing$/'));
    await sleep(400);
    await c.evalExpr(`window.__dbg.aeon.setLayer('bg')`);
    await sleep(400);

    // ---- 6. UNMOUNT. ----------------------------------------------------
    await c.evalExpr(clickByText('/^Play bands$/'));
    await sleep(800);
    const preUnmount = await snap(c);
    const wentArt = await c.evalExpr(clickByText('/^Art$/'));
    await sleep(1500);
    const stillMounted = await c.evalExpr(
      '!!document.getElementById("map-canvas")');
    if (wentArt !== true || stillMounted) {
      note('6a', 'unmount could not be tested from this facet',
        `switching facets returned ${JSON.stringify(wentArt)} and #map-canvas is `
        + `${stillMounted ? 'still mounted' : 'gone'} — the row would not have touched its subject`);
    } else {
      const um1 = await snap(c);
      await sleep(3000);
      const um2 = await snap(c);
      const umRate = (um2.raf - um1.raf) / 3;
      check('6a', 'unmounting the viewport with playback ON cancels the loop',
        umRate < rafRate - 20,
        `rAF scheduling after unmount ${umRate.toFixed(1)}/s vs ${rafRate.toFixed(1)}/s while `
        + `playing (repaints since unmount: ${um2.repaints - preUnmount.repaints})`);
    }
    await shot(c, '3-after');
  } finally {
    if (c) c.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok === true).length;
  const noted = results.filter((r) => r.ok === null).length;
  console.log(`\n${passed}/${passed + fails.length} rows passed${noted ? `, ${noted} noted` : ''}`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log(`  ${f}`)); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(2); });
