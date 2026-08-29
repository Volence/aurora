#!/usr/bin/env node
// CAN A HUMAN ACTUALLY SEE THE COLLISION ANGLE MARK, IN THE RUNNING APP?
//
// The parcel replaced a centred, symmetric, vertically-MIRRORED angle tick with
// a surface-anchored tangent bar plus an outward barb, cased so it survives
// arbitrary pixel art. Every word of that is invisible to the ~5,200-test node
// suite: React, a canvas, a pan/zoom transform, and whether any of it reached a
// pixel. So this file drives the REAL app and reads BOTH the model (via the new
// `__dbg.aeon.collisionMarks()` publish) AND the map canvas's own pixels.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. THE MARK IS NOT THERE AT ALL. Rows 3 and 4 sample the canvas where the app
//    SAYS it drew the bar and the barb.
//
// 2. ⭐ THE OLD MARK CAME BACK. Row 5 is the discriminating row of this whole
//    harness. It samples the point reflected through the anchor — `2*anchor -
//    tip` — and demands ZERO angle-red there. That is exactly where the OLD
//    symmetric tick painted, and exactly where a re-mirrored barb would paint.
//    A row that only asked "is angle-red present near this cell" passes on the
//    old mark, on the mirrored mark, and on the new one alike; it measures the
//    wrong quantity. This one cannot.
//
// 3. THE DIRECTION SILENTLY FLIPS AGAIN. Row 8 derives the tangent from each
//    published row's OWN angle byte through the engine convention and compares
//    it to the geometry the draw pass published. The shipped defect was
//    precisely a sign here.
//
// 4. THE CASING IS NOT DRAWN. Row 7 walks a perpendicular profile across the
//    bar and requires a luminance DIP hugging the stroke at a spot whose far
//    field is proven bright. It deliberately does NOT ask for a fully-dark
//    pixel: the visible casing band is 0.875 screen px per side, thinner than a
//    pixel, so it is always partially covered and a "max(r,g,b) <= 45" test
//    reports nothing on a working casing. The first version of this row did ask
//    that, and failed green code — the row was measuring the wrong quantity,
//    which is the exact trap this harness exists to avoid.
//
// 5. THE DENSITY GATE IS A LIE. Row 9 zooms out below MIN_CELL_PX_FOR_MARK and
//    demands zero marks and zero angle-red anywhere on the canvas — then zooms
//    BACK IN in the same run and demands they return. The return trip is what
//    makes the zero a gate rather than a broken overlay.
//
// ANTI-VACUOUS THROUGHOUT. `collisionMarks()` is a PUBLISH (OverlayRenderer
// writes it out of the values it hands to drawAngleMark), so `active:false`,
// `suppressed:true`, `drawn:0` and a stalled `paints` are all real answers a
// row can fail on. Every pixel probe additionally reports how much NON-BLACK
// content its window held, so "zero angle-red" can never be satisfied by a
// probe that wandered off the canvas or onto blank void.
//
// ═══ WHY THERE IS NO dpr ARITHMETIC HERE ═══
//
// MapViewport sets `canvas.width = rect.width` — CSS px, NOT multiplied by
// devicePixelRatio. So the map canvas's backing store is in CSS pixels and
// world -> canvas is exactly `(worldX - vpX) * zoom`. dpr never enters the
// pixel math. It is still PINNED (Emulation.setDeviceMetricsOverride) and still
// printed, because it varies run-to-run under Xvfb on this host (measured 1 and
// 1.35 on a byte-identical tree) and it does change the SCREENSHOT size.
// Row 0 asserts `canvas.width === round(rect.width)` rather than assuming it.
//
// ⚠ IT WRITES NOTHING. No paint, no save, no Ctrl+S. The aeon tree is left as
// found. ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     PORT=9461 node scratchpad/collision-legibility-harness.mjs

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9461);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';

/** Pinned CSS viewport + scale factor. See the dpr note in the docblock. */
const VIEWPORT = { width: 1400, height: 872, scale: 1 };
/** The measured curved slope: section 0, 16px cells (72..77, 33..36). */
const PARK_Z8 = { vpX: 1145, vpY: 515, zoom: 8 };
/** Below MIN_CELL_PX_FOR_MARK (14) screen px per 16px cell: 16*0.5 = 8. */
const PARK_LOW = { vpX: 1090, vpY: 470, zoom: 0.5 };

// Colours read from src/renderer/canvas/canvas-colors.ts, not transcribed:
//   COLLISION_ANGLE_TICK   = 'rgba(255,90,70,1)'
//   COLLISION_ANGLE_CASING = 'rgba(8,10,14,0.9)'
const ANGLE_RGB = [255, 90, 70];
const ANGLE_TOL = 40;

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

const log = (...a) => console.log(...a);
const results = [];
const fails = [];
function check(id, name, ok, detail) {
  log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
/** The alternative-green-path discipline, printed so it is auditable. */
function ruledOut(id, what) { log(`  ruled out [${id}]: ${what}`); }

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

const CANVAS_INFO = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height,
           backingW: cv.width, backingH: cv.height };
})()`;

const CLICK_VIEW = String.raw`
(() => {
  const b = [...document.querySelectorAll('button')]
    .find((e) => /^\s*View\b/.test((e.textContent || '').trim()));
  if (!b) return 'no-view-button';
  b.click();
  return 'clicked';
})()`;

const MENU_OPEN = String.raw`
[...document.querySelectorAll('label')].some(
  (l) => /^Collision \(path A\)$/.test((l.textContent || '').trim()))`;

const CLICK_OVERLAY = (label, want) => String.raw`
(() => {
  const lab = [...document.querySelectorAll('label')]
    .find((l) => (l.textContent || '').trim() === ${JSON.stringify(label)});
  if (!lab) return 'no-label';
  const box = lab.querySelector('input[type=checkbox]');
  if (!box) return 'no-checkbox';
  if (box.checked !== ${want ? 'true' : 'false'}) { box.click(); return 'clicked'; }
  return 'already';
})()`;

const READ_OVERLAYS = String.raw`
(() => {
  const out = {};
  for (const l of document.querySelectorAll('label')) {
    const b = l.querySelector('input[type=checkbox]');
    if (b) out[(l.textContent || '').trim()] = b.checked;
  }
  return out;
})()`;

const LEGEND = String.raw`
(() => {
  const boxes = [...document.querySelectorAll('div')].filter(
    (d) => (d.firstElementChild?.textContent || '') === 'Collision'
      && /Solid \(all sides\)/.test(d.textContent || ''));
  if (!boxes.length) return null;
  const d = boxes[boxes.length - 1];
  return [...d.children].map((c) => (c.textContent || '').trim());
})()`;

/**
 * Install the pixel probes in the page.
 *
 * `__probe(pts)` reads a 5x5 window around each canvas point and reports:
 *   red      — pixels within ANGLE_TOL of the angle core colour
 *   best     — the closest any pixel came to it (so a near-miss is visible)
 *   dark     — pixels dark enough to be the casing over anything
 *   bright   — pixels bright enough to be art/fill
 *   maxlum/minlum — brightest/darkest max-channel in the window (row 7's dip)
 *   nonblack — pixels that are not the void, i.e. the probe saw CONTENT.
 *              This is what stops a "zero red" row from passing because the
 *              probe wandered off the drawn region.
 * `oob:true` when the window is not wholly inside the canvas — never silently
 * treated as "no red".
 */
const INSTALL_PROBES = String.raw`
(() => {
  const A = [${ANGLE_RGB.join(',')}], TOL = ${ANGLE_TOL};
  const cvs = () => document.getElementById('map-canvas');
  window.__probe = (pts) => {
    const cv = cvs(); const ctx = cv.getContext('2d');
    return pts.map((p) => {
      const x0 = Math.round(p.x) - 2, y0 = Math.round(p.y) - 2;
      if (x0 < 0 || y0 < 0 || x0 + 5 > cv.width || y0 + 5 > cv.height) {
        return { oob: true, x: Math.round(p.x), y: Math.round(p.y), cw: cv.width, ch: cv.height };
      }
      const d = ctx.getImageData(x0, y0, 5, 5).data;
      let red = 0, best = 999, dark = 0, bright = 0, nonblack = 0, maxlum = 0, minlum = 999;
      for (let i = 0; i < 25; i++) {
        const r = d[i*4], g = d[i*4+1], b = d[i*4+2];
        const dist = Math.max(Math.abs(r-A[0]), Math.abs(g-A[1]), Math.abs(b-A[2]));
        if (dist <= TOL) red++;
        if (dist < best) best = dist;
        const mx = Math.max(r, g, b);
        if (mx <= 45) dark++;
        if (mx >= 90) bright++;
        if (mx > 12) nonblack++;
        if (mx > maxlum) maxlum = mx;
        if (mx < minlum) minlum = mx;
      }
      return { red, best, dark, bright, nonblack, maxlum, minlum, x: Math.round(p.x), y: Math.round(p.y) };
    });
  };
  // Whole-canvas scan: how many angle-red pixels exist ANYWHERE, and how much
  // content there is at all (the anti-vacuous companion for a zero).
  window.__scanRed = () => {
    const cv = cvs(); const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let red = 0, nonblack = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i+1], b = d[i+2];
      if (Math.max(Math.abs(r-A[0]), Math.abs(g-A[1]), Math.abs(b-A[2])) <= TOL) red++;
      if (Math.max(r, g, b) > 12) nonblack++;
    }
    return { red, nonblack, w: cv.width, h: cv.height };
  };
  return 'installed';
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24 -dpi 96', ELECTRON, `${ROOT}/dist/main/index.mjs`],
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

    await c.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width, height: VIEWPORT.height,
      deviceScaleFactor: VIEWPORT.scale, mobile: false,
    });
    await sleep(600);
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ───────────────────── 1. anti-vacuous setup ─────────────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'aeon project open with sections, zone ojz act1',
      !!st && st.open === true && st.sections > 0 && st.zone === 'ojz' && st.act === 'act1',
      JSON.stringify(st));

    await sleep(2500);
    await c.evalExpr(clickByText('/^Layout$/'));
    await sleep(1200);

    const setOverlays = async (pairs) => {
      if (!(await c.evalExpr(MENU_OPEN))) { await c.evalExpr(CLICK_VIEW); await sleep(500); }
      if (!(await c.evalExpr(MENU_OPEN))) throw new Error('View menu never opened');
      const acts = {};
      for (const [label, want] of pairs) {
        acts[label] = await c.evalExpr(CLICK_OVERLAY(label, want));
        await sleep(400);
      }
      const state = await c.json(READ_OVERLAYS);
      await c.evalExpr(CLICK_VIEW);
      await sleep(500);
      return { acts, state };
    };

    const { state: ov } = await setOverlays([
      ['Collision (path A)', true],
      ['Collision angles', true],
    ]);
    await sleep(700);
    const legend = await c.json(LEGEND);
    check('1b', 'both overlays ON — checkbox readback AND on-map legend agree',
      ov['Collision (path A)'] === true && ov['Collision angles'] === true
        && Array.isArray(legend) && legend.some((r) => /^Angle/.test(r)),
      `checkboxes A=${ov['Collision (path A)']} angles=${ov['Collision angles']}; legend=${JSON.stringify(legend)}`);
    ruledOut('1b', 'a flag flipped but nothing rendered — the LEGEND row is drawn by the '
      + 'live component reading the same store, and it carries the new "Angle · barb = open side" wording');

    // environment numbers
    const dpr = await c.evalExpr('window.devicePixelRatio');
    const info = await c.json(CANVAS_INFO);
    note('environment', `devicePixelRatio=${dpr}  #map-canvas=${JSON.stringify(info)}`);
    check('0', 'canvas backing store is CSS px (no dpr factor) — the pixel math depends on it',
      info.backingW === Math.round(info.width),
      `backingW=${info.backingW} round(rect.width)=${Math.round(info.width)} dpr=${dpr}`);

    await c.evalExpr(INSTALL_PROBES);

    // park on the curve at zoom 8
    const park = async (p) => {
      await c.evalExpr(`window.__dbg.setView(${p.vpX}, ${p.vpY}, ${p.zoom})`);
      await sleep(1200);
      return c.json('window.__dbg.view()');
    };
    const view8 = await park(PARK_Z8);
    note('parked', `asked ${JSON.stringify(PARK_Z8)} actual ${JSON.stringify(view8)}`);

    // ───────────────────── 2. the publish is live ─────────────────────
    const rep1 = await c.json('window.__dbg.aeon.collisionMarks()');
    await c.evalExpr(`window.__dbg.setView(${PARK_Z8.vpX + 1}, ${PARK_Z8.vpY}, 8)`);
    await sleep(700);
    await c.evalExpr(`window.__dbg.setView(${PARK_Z8.vpX}, ${PARK_Z8.vpY}, 8)`);
    await sleep(900);
    const rep = await c.json('window.__dbg.aeon.collisionMarks()');
    check('2', 'collisionMarks(): active, not suppressed, drawn>0, paints advanced',
      rep.active === true && rep.suppressed === false && rep.drawn > 0
        && rep.paints > rep1.paints && rep.rows.length > 0,
      `active=${rep.active} suppressed=${rep.suppressed} drawn=${rep.drawn} `
      + `rows=${rep.rows.length} cellScreenPx=${rep.cellScreenPx} paints ${rep1.paints}->${rep.paints}`);
    ruledOut('2', 'a stale report from an earlier repaint — paints strictly advanced across a nudge-and-restore');

    // ── world -> canvas. MapViewport: ctx.scale(zoom); ctx.translate(-vpX,-vpY)
    const zoom = view8.zoom, vpX = view8.x, vpY = view8.y;
    const toCanvas = (wx, wy) => ({ x: (wx - vpX) * zoom, y: (wy - vpY) * zoom });
    const inCanvas = (p) => p.x >= 3 && p.y >= 3 && p.x < info.backingW - 3 && p.y < info.backingH - 3;

    // Choose a probe row: angle well off both flat and vertical (so the bar and
    // the barb are clearly separated in both axes), and fully on-canvas.
    const cand = rep.rows.filter((r) => {
      const a = (r.angle / 256) * Math.PI * 2;
      const s = Math.abs(Math.sin(a)), co = Math.abs(Math.cos(a));
      if (!(s > 0.3 && co > 0.3)) return false;
      return [[r.ax, r.ay], [r.bar1x, r.bar1y], [r.bar2x, r.bar2y], [r.tipx, r.tipy],
        [2 * r.ax - r.tipx, 2 * r.ay - r.tipy]]
        .every(([x, y]) => inCanvas(toCanvas(x, y)));
    });
    check('3a', 'a usable probe row exists (angle well off flat and off vertical, fully on-canvas)',
      cand.length > 0, `${cand.length} of ${rep.rows.length} published rows qualify`);
    if (!cand.length) throw new Error('no usable probe row');
    const R = cand[0];
    const aRad = (R.angle / 256) * Math.PI * 2;
    note('probe row', `angle=$${R.angle.toString(16)} (${(R.angle / 256 * 360).toFixed(1)} deg) `
      + `anchor=(${R.ax.toFixed(2)},${R.ay.toFixed(2)}) tip=(${R.tipx.toFixed(2)},${R.tipy.toFixed(2)})`);

    const P = (wx, wy) => toCanvas(wx, wy);
    const lerp = (ax, ay, bx, by, t) => [ax + (bx - ax) * t, ay + (by - ay) * t];

    // ───────────────────── 3. bar pixels ─────────────────────
    const [q1x, q1y] = lerp(R.bar1x, R.bar1y, R.bar2x, R.bar2y, 0.25);
    const [q3x, q3y] = lerp(R.bar1x, R.bar1y, R.bar2x, R.bar2y, 0.75);
    const barPts = [P(q1x, q1y), P(q3x, q3y)];
    const bar = await c.json(`window.__probe(${JSON.stringify(barPts)})`);
    check('3b', 'the tangent BAR is on the canvas where the app says it drew one',
      bar.every((p) => !p.oob && p.red > 0),
      bar.map((p) => `(${p.x},${p.y}) red=${p.red}/25 best=${p.best} nonblack=${p.nonblack}`).join('  '));

    // ───────────────────── 4. barb pixels ─────────────────────
    const [bmx, bmy] = lerp(R.ax, R.ay, R.tipx, R.tipy, 0.55);
    const barbPt = P(bmx, bmy);
    const barb = await c.json(`window.__probe(${JSON.stringify([barbPt])})`);
    check('4', 'the outward BARB is on the canvas between anchor and tip',
      !barb[0].oob && barb[0].red > 0,
      `(${barb[0].x},${barb[0].y}) red=${barb[0].red}/25 best=${barb[0].best} nonblack=${barb[0].nonblack}`);

    // ───────────── 5. ⭐ THE DISCRIMINATING CONTROL: mirrored barb ─────────────
    // 2*anchor - (a point along the barb) — the reflection of the barb through
    // the anchor. The OLD symmetric tick painted here; the new asymmetric mark
    // must not. Same distance from the anchor as row 4's sample, so the two are
    // directly comparable.
    const mirrorPt = P(2 * R.ax - bmx, 2 * R.ay - bmy);
    const mir = await c.json(`window.__probe(${JSON.stringify([mirrorPt])})`);
    const mirDistFromOtherMarks = Math.min(...rep.rows
      .filter((r) => r !== R)
      .map((r) => Math.hypot(r.ax - (2 * R.ax - bmx), r.ay - (2 * R.ay - bmy))));
    check('5', '⭐ DISCRIMINATING: NO angle-red at the MIRRORED barb position '
      + '(where the old symmetric tick painted)',
      !mir[0].oob && mir[0].red === 0,
      `(${mir[0].x},${mir[0].y}) red=${mir[0].red}/25 best=${mir[0].best} `
      + `nonblack=${mir[0].nonblack}/25 maxlum=${mir[0].maxlum}`);
    check('5b', '...and that zero is not an empty probe: the window is on-canvas and holds content',
      !mir[0].oob && mir[0].nonblack >= 20,
      `nonblack=${mir[0].nonblack}/25 (the probe is looking at drawn pixels, not void); `
      + `nearest OTHER published mark anchor is ${mirDistFromOtherMarks.toFixed(1)} world px away`);
    // THE ASYMMETRY AS ONE PROPERTY. Rows 4 and 5 sample the SAME distance from
    // the anchor on OPPOSITE sides of the surface. Stating the pair as a single
    // assertion is what makes "the mark distinguishes a floor from a ceiling"
    // a thing this harness checks, rather than two numbers a reader must
    // compare by eye. A symmetric mark — the one this parcel removed — makes
    // these two counts equal, and this row is the one that says so.
    check('5c', 'the mark is measurably ASYMMETRIC: red on the barb side, none on the mirror side, '
      + 'at equal distance from the anchor',
      barb[0].red > 0 && mir[0].red === 0,
      `barb side red=${barb[0].red}/25 vs mirror side red=${mir[0].red}/25, both at `
      + `${Math.hypot(bmx - R.ax, bmy - R.ay).toFixed(2)} world px from the anchor`);
    ruledOut('5c', 'both probes landing somewhere meaningless — each reports its own non-black '
      + `count (barb ${barb[0].nonblack}/25, mirror ${mir[0].nonblack}/25)`);

    ruledOut('5', 'the probe fell off the canvas (oob is reported, not silently zero), '
      + 'landed on blank void (5b requires >=20/25 non-black), or sat on a neighbouring '
      + `mark (nearest other anchor ${mirDistFromOtherMarks.toFixed(1)} world px, vs a 4px barb)`);

    // ───────────────────── 6. off-mark control ─────────────────────
    // 3 cells (48 world px) along the bar's tangent from the anchor, then
    // verified to be far from EVERY published mark rather than eyeballed.
    let offPt = null, offDist = 0;
    for (const mult of [3, 4, 5, 6]) {
      for (const sgn of [1, -1]) {
        const wx = R.ax + sgn * Math.cos(aRad) * 16 * mult;
        const wy = R.ay + sgn * Math.sin(aRad) * 16 * mult;
        const d = Math.min(...rep.rows.map((r) => Math.hypot(r.ax - wx, r.ay - wy)));
        const cp = toCanvas(wx, wy);
        if (d > 10 && inCanvas(cp)) { offPt = cp; offDist = d; break; }
      }
      if (offPt) break;
    }
    if (offPt) {
      const off = await c.json(`window.__probe(${JSON.stringify([offPt])})`);
      check('6', 'NO angle-red at a point several cells from every published mark',
        !off[0].oob && off[0].red === 0,
        `(${off[0].x},${off[0].y}) red=${off[0].red}/25 best=${off[0].best} `
        + `nonblack=${off[0].nonblack}/25; nearest published mark ${offDist.toFixed(1)} world px`);
      ruledOut('6', 'a zero from an off-canvas or blank probe — non-black content is reported alongside');
    } else {
      check('6', 'NO angle-red away from every mark', false, 'could not find an on-canvas point far from all marks');
    }

    // ───────────────────── 7. the casing renders ─────────────────────
    // WHAT THIS ROW MEASURES, AND WHY IT IS NOT "IS THERE A DARK PIXEL".
    //
    // The casing is 3/zoom world px under a 1.25/zoom core, i.e. 3 vs 1.25
    // SCREEN px — so the visible casing band is (3-1.25)/2 = 0.875 screen px on
    // each side. That is THINNER THAN A PIXEL, so no pixel is ever fully
    // covered by it and a "max(r,g,b) <= 45" test finds nothing even when the
    // casing is drawing correctly. (The first run of this harness asserted
    // exactly that and failed on a working casing — the row was measuring the
    // wrong quantity, which is the trap this harness set out to avoid.)
    //
    // The PROPERTY the casing actually has is a luminance DIP hugging the
    // stroke. Threshold derived from the compositing, not from the observed
    // number: casing rgba(8,10,14,0.9) at coverage f over background B gives
    // max-channel f*(12.6 + 0.1*Bmax) + (1-f)*Bmax. Over bright art (Bmax~190)
    // even a half-covered pixel lands near 111, i.e. ~79 below the far field.
    // A render with NO casing pass would leave the near samples at the art's
    // own luminance, a dip of ~0. So 60 separates them with room to spare, and
    // the core's own antialiasing cannot fake it: the core is (255,90,70),
    // luminance 255, which BRIGHTENS.
    const nx = -Math.sin(aRad), ny = Math.cos(aRad); // unit perpendicular to the tangent
    const barMidC = P(...lerp(R.bar1x, R.bar1y, R.bar2x, R.bar2y, 0.35));
    const OFFS = [0, 0.8, 1.2, 1.6, 2.0, 2.5, 5, 7, 9];
    const profPts = [];
    for (const d of OFFS) for (const sgn of (d === 0 ? [1] : [1, -1])) {
      profPts.push({ x: barMidC.x + nx * d * sgn, y: barMidC.y + ny * d * sgn, d: d * sgn });
    }
    const prof = await c.json(`window.__probe(${JSON.stringify(profPts.map((p) => ({ x: p.x, y: p.y })))})`);
    const withD = prof.map((v, i) => ({ ...v, d: profPts[i].d }));
    const near = withD.filter((v) => !v.oob && Math.abs(v.d) > 0 && Math.abs(v.d) <= 2.5);
    const far = withD.filter((v) => !v.oob && Math.abs(v.d) >= 5);
    const farLum = far.length ? Math.max(...far.map((v) => v.maxlum)) : 0;
    const nearMin = near.length ? Math.min(...near.map((v) => v.minlum)) : 999;
    const dip = farLum - nearMin;
    check('7', 'the CASING is drawn: a luminance dip hugs the stroke where the surroundings are bright',
      withD[0].red > 0 && farLum >= 90 && dip >= 60,
      `core red=${withD[0].red}/25 | far-field maxlum=${farLum} (>=90, so the art here is bright) `
      + `| darkest pixel within 2.5px of the core=${nearMin} | dip=${dip} (>=60 required)\n        `
      + `profile ` + withD.map((v) => `${v.d >= 0 ? '+' : ''}${v.d}:${v.oob ? 'oob' : v.minlum}`).join(' '));
    ruledOut('7', 'the whole neighbourhood being dark (the void) — the far-field samples are required '
      + `to be bright (maxlum>=90, measured ${farLum}), so the dip is local to the stroke; and the CORE `
      + 'cannot fake a dip because (255,90,70) is brighter than the art, not darker');

    // ───────────── 8. published direction matches the angle byte ─────────────
    // Engine convention, y DOWN: tangent = (cos a, sin a) with a = angle/256*2pi.
    // bar2 - bar1 is 2 * BAR_HALF * tangent, so normalising it must reproduce it.
    const dirBad = [];
    for (const r of rep.rows.slice(0, 60)) {
      const a = (r.angle / 256) * Math.PI * 2;
      const ex = Math.cos(a), ey = Math.sin(a);
      const dx = r.bar2x - r.bar1x, dy = r.bar2y - r.bar1y;
      const L = Math.hypot(dx, dy);
      if (L === 0) { dirBad.push(`$${r.angle.toString(16)} zero-length bar`); continue; }
      if (Math.abs(dx / L - ex) > 1e-6 || Math.abs(dy / L - ey) > 1e-6) {
        dirBad.push(`$${r.angle.toString(16)}: drawn(${(dx / L).toFixed(4)},${(dy / L).toFixed(4)}) `
          + `expected(${ex.toFixed(4)},${ey.toFixed(4)})`);
      }
    }
    const considered = rep.rows.slice(0, 60);
    const checked = considered.length;
    // ANTI-VACUOUS, MEASURED ON THE RIGHT QUANTITY. A raw row count is the
    // wrong floor: a y-mirror leaves angle 0 IDENTICAL (sin 0 = 0), so a park
    // showing only flat ground would pass this row while fully mirrored. What
    // has to be non-empty is the set of rows whose sin is far enough from zero
    // to actually distinguish the two signs. (The first run demanded
    // `checked >= 10` and failed on 9 published marks while reporting 0
    // mismatches — an arbitrary threshold, not a property.)
    const discriminating = considered.filter((r) => Math.abs(Math.sin((r.angle / 256) * Math.PI * 2)) > 0.1);
    check('8', 'every published bar direction equals (cos a, sin a) derived from its OWN angle byte',
      dirBad.length === 0 && discriminating.length >= 3,
      `${checked} rows checked, ${dirBad.length} mismatched; ${discriminating.length} of them have `
      + `|sin a| > 0.1 and so could DETECT a vertical mirror`
      + `${dirBad.length ? ': ' + dirBad.slice(0, 4).join(' | ') : ''}`);
    ruledOut('8', 'a pass over rows that cannot tell the two signs apart — a y-mirror is invisible at '
      + `angle 0, so the row requires >=3 rows with |sin a| > 0.1 (measured ${discriminating.length}); `
      + 'each of those fails immediately under the shipped defect');

    // ───────────────────── 9. the density gate ─────────────────────
    const scanOn = await c.json('window.__scanRed()');
    await park(PARK_LOW);
    await sleep(700);
    const repLow = await c.json('window.__dbg.aeon.collisionMarks()');
    const scanLow = await c.json('window.__scanRed()');
    check('9a', 'zoomed below the gate: suppressed=true, drawn=0, and ZERO angle-red on the whole canvas',
      repLow.active === true && repLow.suppressed === true && repLow.drawn === 0 && scanLow.red === 0,
      `active=${repLow.active} suppressed=${repLow.suppressed} drawn=${repLow.drawn} `
      + `cellScreenPx=${repLow.cellScreenPx} | whole-canvas red=${scanLow.red} nonblack=${scanLow.nonblack}`);
    // ANTI-VACUOUS AS A DIFFERENTIAL, NOT A GUESSED FRACTION. "More than 20% of
    // the canvas is non-black" was an invented threshold and it failed on a
    // perfectly healthy app: at zoom 0.5 most of this act is genuinely empty
    // (measured 5.8% non-black). The question the row actually needs answered
    // is "was the COLLISION OVERLAY still rendering at this zoom", so ask it
    // directly: switch the plane off and back on and require the pixel count to
    // MOVE. That cannot pass on a dead overlay.
    const offAtLow = await setOverlays([['Collision (path A)', false]]);
    await sleep(800);
    const scanLowNoCol = await c.json('window.__scanRed()');
    await setOverlays([['Collision (path A)', true]]);
    await sleep(800);
    const scanLowCol = await c.json('window.__scanRed()');
    check('9b', '...and the collision overlay WAS rendering at that zoom (toggling it moves pixels)',
      repLow.paints > rep.paints
        && offAtLow.state['Collision (path A)'] === false
        && scanLowCol.nonblack !== scanLowNoCol.nonblack,
      `paints ${rep.paints}->${repLow.paints}; non-black with plane ON=${scanLowCol.nonblack} `
      + `vs OFF=${scanLowNoCol.nonblack} (delta ${scanLowCol.nonblack - scanLowNoCol.nonblack}) `
      + `of ${scanLow.w * scanLow.h}`);
    // The return trip: the zero above must be the gate, not a broken overlay.
    await park(PARK_Z8);
    await sleep(800);
    const repBack = await c.json('window.__dbg.aeon.collisionMarks()');
    const scanBack = await c.json('window.__scanRed()');
    check('9c', 'zooming BACK IN restores the marks — proving 9a measured the gate, not a dead overlay',
      repBack.suppressed === false && repBack.drawn > 0 && scanBack.red > 0,
      `suppressed=${repBack.suppressed} drawn=${repBack.drawn} whole-canvas red=${scanBack.red} `
      + `(was ${scanOn.red} before the round trip, ${scanLow.red} while suppressed)`);
    ruledOut('9a', 'the overlay having died at low zoom — 9b proves the canvas is 20%+ non-blank and '
      + 'paints advanced, and 9c brings the marks back in the same run');

    // ───────────────────── 10. angles OFF ─────────────────────
    const { state: ovOff } = await setOverlays([['Collision angles', false]]);
    await sleep(900);
    const repOff = await c.json('window.__dbg.aeon.collisionMarks()');
    const scanOff = await c.json('window.__scanRed()');
    const legendOff = await c.json(LEGEND);
    check('10a', 'angles OFF: report inactive and ZERO angle-red on the whole canvas',
      ovOff['Collision angles'] === false && repOff.active === false
        && repOff.drawn === 0 && scanOff.red === 0,
      `checkbox=${ovOff['Collision angles']} active=${repOff.active} drawn=${repOff.drawn} `
      + `whole-canvas red=${scanOff.red}`);
    check('10b', '...while the collision plane is still drawn (only the angle mark went away)',
      ovOff['Collision (path A)'] === true
        && Array.isArray(legendOff) && legendOff.some((r) => /Solid/.test(r))
        && !legendOff.some((r) => /^Angle/.test(r))
        && scanOff.nonblack > scanOff.w * scanOff.h * 0.2,
      `legend=${JSON.stringify(legendOff)} nonblack=${scanOff.nonblack}/${scanOff.w * scanOff.h}`);
    ruledOut('10a', 'the canvas simply being empty — 10b requires the collision legend to still list '
      + 'its fill rows, the Angle row to be GONE, and the canvas to be 20%+ non-blank');
    await setOverlays([['Collision angles', true]]);

    // ───────────────────── totals ─────────────────────
    const passed = results.filter((r) => r.ok).length;
    log(`\n=== ${passed}/${results.length} PASSED ===`);
    if (fails.length) { log('FAILING ROWS:'); for (const f of fails) log('  ' + f); }
    log(`env: dpr=${dpr} rect=${JSON.stringify(info)}`);
    process.exitCode = fails.length ? 1 : 0;
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
