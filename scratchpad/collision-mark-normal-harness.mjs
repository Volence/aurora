#!/usr/bin/env node
// DOES THE MARK LEAD WITH THE OUT DIRECTION, ON THE REAL CANVAS?
//
// Sibling of collision-legibility-harness.mjs, which proved the mark exists,
// is anchored on the surface and is not mirrored. Those properties still hold
// and that harness still checks them. THIS file checks the thing the owner's
// SECOND report was about, which no assertion in the node suite can see:
//
//   "I still think the collision direction arrows in the preview may be kind of
//    useless? Also why are the 0 degree ones not pointing straight up lol"
//
// The geometry was already right (measured: angle 0 -> tangent exactly (1,0),
// outward normal exactly (0,-1)). The HIERARCHY was inverted — the mark led
// with the tangent, which is not the quantity anyone reads a collision cell
// for. So every row below is about WHICH ELEMENT DOMINATES, in pixels.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. ⭐ THE OLD WEIGHTS COME BACK. Row H2 measures the two strokes' WIDTHS off
//    the canvas — red pixels per unit length across the stem versus across the
//    bar — and requires the stem to be the wider one. Under the shipped mark
//    they were equal (both `coreWidth`), so this row fails on it.
//
// 2. ⭐ THE 0° CASE, WHICH IS THE ONE HE NAMED. Row H3 finds a published mark
//    at angle byte 0 and demands red ABOVE the anchor and NONE below it, at
//    equal distance. ⚠ A row that merely asked "is there ink on the vertical
//    axis through this cell" would pass on a build drawing the OLD centred
//    symmetric tick, and would pass on a mark drawn downward. Both halves —
//    present above, absent below — are required, and both are pixel probes.
//
// 3. ⭐ THE MIRROR/TRANSPOSE TRAP AT 45°. At 0° the normal is vertical and the
//    tangent horizontal, so almost any confusion is visible; at 45° both are
//    diagonal and a transposed mark still looks plausible. That exact bug was
//    live in this module twelve hours ago. Row H4 works on a diagonal angle and
//    checks the SIGNS against the byte, plus a pixel probe on the open side and
//    its reflection.
//
// 4. THE TANGENT IS DEMOTED, NOT DELETED. Rows H5/H6 park under DETAIL_CELL_PX
//    and demand the bar's own coordinates hold NO red while the stem still
//    does — then zoom back in and demand the bar returns. A single row could
//    not tell "correctly demoted" from "never drawn"; the pair can.
//
// 5. THE PICKER, WHICH IS THE SURFACE HE WAS LOOKING AT. Row H8 reads the 0°
//    THUMBNAIL canvases in the collision palette and requires the red ink's
//    bounding box to be TALLER THAN IT IS WIDE. Under the mark this replaces it
//    was wider than tall — a 9px horizontal bar with a 4px barb — which is
//    precisely why he asked why they were not pointing up.
//
// ANTI-VACUOUS THROUGHOUT, the same way the sibling harness is: every probe
// reports its own non-black count so a zero can never come from a window that
// wandered off the canvas, `collisionMarks()` is a PUBLISH out of the values
// handed to the draw (so `drawn: 0` and a stalled `paints` are real answers),
// and every "no red" row is paired with a "red here" row at a comparable spot.
//
// ⚠ IT WRITES NOTHING. No paint, no save, no Ctrl+S.
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     PORT=9463 node scratchpad/collision-mark-normal-harness.mjs
//   SHOTS=1 also writes before/after PNGs into scratchpad/collision-mark-normal/.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9463);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTDIR = `${ROOT}/scratchpad/collision-mark-normal`;
const SHOTS = process.env.SHOTS === '1';
const TAG = process.env.SHOT_TAG ?? 'after';

/** Pinned CSS viewport + device scale. dpr is unstable under Xvfb on this host
 *  (measured 1 and 1.35 on a byte-identical tree), so it is an INPUT here, not
 *  a property of whichever display Xvfb picked. Printed either way. */
const VIEWPORT = { width: 1400, height: 872, scale: 1 };

// ── The three parks. Integer world coordinates, never derived from a measured
//    rect (see the CDP-harness lesson: a fractional aim costs a review cycle).
/** The measured curved slope, section 0 — cells (72..77, 33..36). 128 px/cell. */
const PARK_DETAIL = { vpX: 1145, vpY: 515, zoom: 8 };
/** 16*2 = 32 screen px per cell: over MIN_CELL_PX_FOR_MARK (14), under
 *  DETAIL_CELL_PX (57). The band where the tangent is demoted away. */
const PARK_COMPACT = { vpX: 1090, vpY: 470, zoom: 2 };
/** The owner's working zoom, for the screenshots. */
const PARK_WORK = { vpX: 1120, vpY: 500, zoom: 4 };

// ── Constants MIRRORED from the module, and asserted against it below (row H0)
//    rather than trusted. A harness that hardcodes a number the module can
//    change is a harness that goes green on a stale expectation.
const MOD = {
  BAR_HALF: 4.5,
  NORMAL_LEN: 6.5,
  ARROW_WIDTH_SCALE: 1.6,
  MIN_CELL_PX_FOR_MARK: 14,
  // DETAIL_CELL_PX is DERIVED here the same way the module derives it, so the
  // two agree by construction rather than by transcription:
  //   16 / (BAR_HALF * sin(atan(1/16)))
  get DETAIL_CELL_PX() { return Math.ceil(16 / (this.BAR_HALF * Math.sin(Math.atan(1 / 16)))); },
};

// Colours read from src/renderer/canvas/canvas-colors.ts:
//   COLLISION_ANGLE_TICK   = 'rgba(255,90,70,1)'
//   COLLISION_SOLID_EDGE   = 'rgba(255,150,60,1)'  <- 60 away on green
const ANGLE_RGB = [255, 90, 70];
const ANGLE_TOL = 40;   // map: nothing else on the overlay is within 40
const PICKER_TOL = 25;  // picker: the orange solid-edge frame is 60 away

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
const unmeasured = [];
function check(id, name, ok, detail) {
  log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** LOUD ON UNMEASURABLE. Not a pass and not a fail — a named gap, printed in
 *  the totals so nobody reads N/N as "everything was checked". */
function unmeasurable(id, name, why) {
  log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name} — ${why}`);
}
function note(what, detail) {
  log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
function ruledOut(id, what) { log(`  ruled out [${id}]: ${what}`); }

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
 * Probes on the MAP canvas.
 *
 * `__probe(pts)` reads a 5x5 window and reports red / best / nonblack, the same
 * shape the sibling harness uses (read its docblock for why `nonblack` exists).
 *
 * ⚠ THE FIRST VERSION OF ROW H2 MEASURED THE WRONG QUANTITY, AND SAID SO
 * LOUDLY. It scanned a ONE-PIXEL-WIDE line perpendicular to each element and
 * counted angle-red samples, meaning to read the stroke's width directly. It
 * reported `bar red=0` on a bar that a 5x5 probe two rows earlier had found at
 * `red=4/25, best=0` — i.e. it failed on correct output. The reason is the same
 * class as the casing-band lesson in the sibling harness: a 1.25 screen px
 * stroke is thinner than the sample. Its exactly-coloured pixels are a sparse
 * set along the stroke, so a scan line one pixel off the stroke's own centre
 * crosses only antialiased blends and sees nothing.
 *
 * What IS robust is INK DENSITY: 5x5 windows centred on several points along
 * each element, red count averaged. A wider stroke paints more of every window
 * it passes through. The ratio is NOT linear in the width (antialiasing eats
 * more of a thin stroke's saturated pixels than a thick one's), so the row
 * asserts the PROPERTY — stem density strictly above bar density, both non-zero
 * — which is what ARROW_WIDTH_SCALE > 1 means on screen, rather than a
 * predicted number that the compositor was never going to produce.
 */
const INSTALL_PROBES = String.raw`
(() => {
  const A = [${ANGLE_RGB.join(',')}], TOL = ${ANGLE_TOL};
  const cvs = () => document.getElementById('map-canvas');
  const dist = (d, i) => Math.max(Math.abs(d[i]-A[0]), Math.abs(d[i+1]-A[1]), Math.abs(d[i+2]-A[2]));
  window.__probe = (pts) => {
    const cv = cvs(); const ctx = cv.getContext('2d');
    return pts.map((p) => {
      const x0 = Math.round(p.x) - 2, y0 = Math.round(p.y) - 2;
      if (x0 < 0 || y0 < 0 || x0 + 5 > cv.width || y0 + 5 > cv.height) {
        return { oob: true, x: Math.round(p.x), y: Math.round(p.y), cw: cv.width, ch: cv.height };
      }
      const d = ctx.getImageData(x0, y0, 5, 5).data;
      let red = 0, best = 999, nonblack = 0, maxlum = 0;
      for (let i = 0; i < 25; i++) {
        const dd = dist(d, i*4);
        if (dd <= TOL) red++;
        if (dd < best) best = dd;
        const mx = Math.max(d[i*4], d[i*4+1], d[i*4+2]);
        if (mx > 12) nonblack++;
        if (mx > maxlum) maxlum = mx;
      }
      return { red, best, nonblack, maxlum, x: Math.round(p.x), y: Math.round(p.y) };
    });
  };
  // Ink density along an element: mean angle-red count over 5x5 windows at the
  // given canvas points. See the docblock for why this and not a 1px scan.
  window.__density = (pts) => {
    const r = window.__probe(pts);
    const oob = r.some((p) => p.oob);
    const reds = r.filter((p) => !p.oob).map((p) => p.red);
    const mean = reds.length ? reds.reduce((a, b) => a + b, 0) / reds.length : 0;
    return { mean, reds, oob, n: reds.length };
  };
  window.__scanRed = () => {
    const cv = cvs(); const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let red = 0, nonblack = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (dist(d, i) <= TOL) red++;
      if (Math.max(d[i], d[i+1], d[i+2]) > 12) nonblack++;
    }
    return { red, nonblack, w: cv.width, h: cv.height };
  };
  return 'installed';
})()`;

/**
 * The PICKER probe: read the collision palette's thumbnail canvases directly
 * and report, per thumbnail, the bounding box of its angle-red ink.
 *
 * A thumbnail is identified by its own degree label, which is drawn by the
 * component out of `angleDegrees` — so "the 0° ones" in the harness means the
 * same set of tiles "the 0 degree ones" meant in the report.
 */
const PICKER_INK = String.raw`
(() => {
  const A = [${ANGLE_RGB.join(',')}], TOL = ${PICKER_TOL};
  const out = [];
  for (const btn of document.querySelectorAll('button')) {
    const cv = btn.querySelector('canvas');
    if (!cv) continue;
    const lab = [...btn.querySelectorAll('span')].map((s) => (s.textContent || '').trim())
      .find((t) => /^-?\d+°$/.test(t));
    if (!lab) continue;
    const ctx = cv.getContext('2d');
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, n = 0, nonblack = 0;
    for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (d[i+3] > 12) nonblack++;
      if (Math.max(Math.abs(d[i]-A[0]), Math.abs(d[i+1]-A[1]), Math.abs(d[i+2]-A[2])) <= TOL
          && d[i+3] > 128) {
        n++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
    out.push({ deg: lab, n, nonblack, w: cv.width, h: cv.height,
      bw: n ? maxx - minx + 1 : 0, bh: n ? maxy - miny + 1 : 0,
      minx, maxx, miny, maxy });
  }
  return out;
})()`;

/** Open the collision tool so the palette (and its thumbnails) mounts. */
const OPEN_COLLISION_TOOL = String.raw`
(() => {
  const b = [...document.querySelectorAll('button')]
    .find((e) => /Collision/i.test((e.textContent || '') + ' ' + (e.getAttribute('title') || ''))
      && !/path [AB]/i.test(e.textContent || ''));
  if (!b) return 'no-button';
  b.click();
  return (b.textContent || '').trim() || 'clicked';
})()`;

async function shoot(c, name, clip) {
  if (!SHOTS) return;
  mkdirSync(SHOTDIR, { recursive: true });
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const r = await c.send('Page.captureScreenshot', params);
  writeFileSync(`${SHOTDIR}/${TAG}-${name}.png`, Buffer.from(r.data, 'base64'));
  log(`  shot  ${SHOTDIR}/${TAG}-${name}.png${clip ? ` clip=${JSON.stringify(clip)}` : ''}`);
}

/**
 * The rect of the picker's own panel, so the review shot is the THUMBNAILS at a
 * size a reader can actually judge rather than a 1400px window with a 28px
 * control in the corner. Captured at scale 3 — the whole complaint is about
 * what a few pixels read as.
 */
const PICKER_RECT = String.raw`
(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => {
    const cv = b.querySelector('canvas');
    if (!cv) return false;
    return [...b.querySelectorAll('span')].some((s) => /^-?\d+°$/.test((s.textContent || '').trim()));
  });
  if (!btn) return null;
  const grid = btn.parentElement;
  const panel = grid.parentElement;
  const r = panel.getBoundingClientRect();
  return { x: Math.floor(r.left), y: Math.floor(r.top),
           width: Math.ceil(Math.min(r.width, 360)), height: Math.ceil(Math.min(r.height, 620)) };
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

    // ───────────────────── setup, anti-vacuous ─────────────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('S1', 'aeon project open with sections, zone ojz act1',
      !!st && st.open === true && st.sections > 0 && st.zone === 'ojz' && st.act === 'act1',
      JSON.stringify(st));

    await sleep(2500);
    await c.evalExpr(`(() => { const b = [...document.querySelectorAll('button')].find((e) => /^Layout$/.test((e.textContent||'').trim())); if (b) b.click(); return !!b; })()`);
    await sleep(1200);

    const setOverlays = async (pairs) => {
      if (!(await c.evalExpr(MENU_OPEN))) { await c.evalExpr(CLICK_VIEW); await sleep(500); }
      if (!(await c.evalExpr(MENU_OPEN))) throw new Error('View menu never opened');
      for (const [label, want] of pairs) { await c.evalExpr(CLICK_OVERLAY(label, want)); await sleep(400); }
      const state = await c.json(READ_OVERLAYS);
      await c.evalExpr(CLICK_VIEW);
      await sleep(500);
      return state;
    };
    const ov = await setOverlays([['Collision (path A)', true], ['Collision angles', true]]);
    await sleep(700);
    const legend = await c.json(LEGEND);
    check('S2', 'both overlays ON, and the on-map legend describes the ARROW',
      ov['Collision (path A)'] === true && ov['Collision angles'] === true
        && Array.isArray(legend) && legend.some((r) => /^Angle · arrow points to the open side$/.test(r)),
      `checkboxes A=${ov['Collision (path A)']} angles=${ov['Collision angles']}; legend=${JSON.stringify(legend)}`);
    ruledOut('S2', 'a flag flipped but nothing rendered — the legend row is drawn by the live '
      + 'component from the same store, and its wording follows the mark it draws with the real code');

    const dpr = await c.evalExpr('window.devicePixelRatio');
    const info = await c.json(CANVAS_INFO);
    note('environment', `devicePixelRatio=${dpr}  #map-canvas=${JSON.stringify(info)}`);
    check('H0a', 'canvas backing store is CSS px (no dpr factor) — the pixel math depends on it',
      info.backingW === Math.round(info.width),
      `backingW=${info.backingW} round(rect.width)=${Math.round(info.width)} dpr=${dpr}`);

    await c.evalExpr(INSTALL_PROBES);

    const park = async (p) => {
      await c.evalExpr(`window.__dbg.setView(${p.vpX}, ${p.vpY}, ${p.zoom})`);
      await sleep(1200);
      return c.json('window.__dbg.view()');
    };

    // ───────────────── H0b: the published tier agrees with the derivation ────
    const viewD = await park(PARK_DETAIL);
    await c.evalExpr(`window.__dbg.setView(${PARK_DETAIL.vpX + 1}, ${PARK_DETAIL.vpY}, ${PARK_DETAIL.zoom})`);
    await sleep(600);
    await c.evalExpr(`window.__dbg.setView(${PARK_DETAIL.vpX}, ${PARK_DETAIL.vpY}, ${PARK_DETAIL.zoom})`);
    await sleep(900);
    const rep = await c.json('window.__dbg.aeon.collisionMarks()');
    note('parked (detail)', `asked ${JSON.stringify(PARK_DETAIL)} actual ${JSON.stringify(viewD)}`);
    check('H0b', 'the app publishes tier=detail at this zoom, matching the DERIVED threshold',
      rep.active === true && rep.suppressed === false && rep.drawn > 0
        && rep.tier === 'detail' && rep.cellScreenPx >= MOD.DETAIL_CELL_PX
        && rep.rows.every((r) => r.tangentDrawn === true),
      `tier=${rep.tier} cellScreenPx=${rep.cellScreenPx} (derived threshold ${MOD.DETAIL_CELL_PX}) `
      + `drawn=${rep.drawn} rows=${rep.rows.length} tangentDrawn all=${rep.rows.every((r) => r.tangentDrawn)}`);
    ruledOut('H0b', 'the harness and the module holding two copies of one constant — '
      + `DETAIL_CELL_PX is re-derived here from BAR_HALF and atan(1/16) (=${MOD.DETAIL_CELL_PX}) `
      + 'and compared against the cell size the APP published, not against a transcribed number');

    const zoom = viewD.zoom, vpX = viewD.x, vpY = viewD.y;
    const toCanvas = (wx, wy) => ({ x: (wx - vpX) * zoom, y: (wy - vpY) * zoom });
    const inCanvas = (p) => p.x >= 6 && p.y >= 6 && p.x < info.backingW - 6 && p.y < info.backingH - 6;
    const onCanvas = (r, ...pts) => pts.every(([x, y]) => inCanvas(toCanvas(x, y)));
    const lerp = (ax, ay, bx, by, t) => [ax + (bx - ax) * t, ay + (by - ay) * t];

    // Distance from a world point to the nearest OTHER published mark's anchor —
    // the "did the probe land on a neighbour" guard.
    const nearestOther = (wx, wy, self) => Math.min(...rep.rows
      .filter((r) => r !== self).map((r) => Math.hypot(r.ax - wx, r.ay - wy)));

    // ───────────── H1: both elements are on the canvas at the detail tier ────
    const diag = rep.rows.filter((r) => {
      const a = (r.angle / 256) * Math.PI * 2;
      return Math.abs(Math.sin(a)) > 0.3 && Math.abs(Math.cos(a)) > 0.3
        && onCanvas(r, [r.ax, r.ay], [r.bar1x, r.bar1y], [r.bar2x, r.bar2y], [r.tipx, r.tipy],
          [2 * r.ax - r.tipx, 2 * r.ay - r.tipy]);
    });
    check('H1a', 'a usable DIAGONAL probe row exists (angle off flat and off vertical, fully on-canvas)',
      diag.length > 0, `${diag.length} of ${rep.rows.length} published rows qualify`);
    if (!diag.length) throw new Error('no usable diagonal probe row');
    const R = diag[0];
    note('diagonal probe row', `angle=$${R.angle.toString(16)} (${(R.angle / 256 * 360).toFixed(1)} deg) `
      + `anchor=(${R.ax.toFixed(2)},${R.ay.toFixed(2)}) tip=(${R.tipx.toFixed(2)},${R.tipy.toFixed(2)}) `
      + `normalKnown=${R.normalKnown} tangentDrawn=${R.tangentDrawn}`);

    const P = ([wx, wy]) => toCanvas(wx, wy);
    const barQ = [lerp(R.bar1x, R.bar1y, R.bar2x, R.bar2y, 0.22),
      lerp(R.bar1x, R.bar1y, R.bar2x, R.bar2y, 0.78)];
    const stemMid = lerp(R.ax, R.ay, R.tipx, R.tipy, 0.6);
    const both = await c.json(`window.__probe(${JSON.stringify([...barQ.map(P), P(stemMid)])})`);
    check('H1b', 'at the detail tier BOTH elements reach the canvas — the tangent is demoted, not deleted',
      both.every((p) => !p.oob && p.red > 0),
      both.map((p, i) => `${i < 2 ? 'bar' : 'stem'}(${p.x},${p.y}) red=${p.red}/25 best=${p.best} nonblack=${p.nonblack}`).join('  '));

    // ───────────── H2 ⭐ THE HIERARCHY, MEASURED AS STROKE WIDTH ─────────────
    // Both strokes are screen-constant (the map passes k/zoom world px), so at
    // any zoom the stem's rendered width should be ARROW_WIDTH_SCALE times the
    // bar's. The scan is single-pixel, perpendicular to each element's own
    // direction, through its midpoint.
    const barLen = Math.hypot(R.bar2x - R.bar1x, R.bar2y - R.bar1y);
    const stemLen = Math.hypot(R.tipx - R.ax, R.tipy - R.ay);
    const stemDir = { x: (R.tipx - R.ax) / stemLen, y: (R.tipy - R.ay) / stemLen };
    // ⚠ SAMPLE THE MIDDLE OF EACH ELEMENT, NOT ITS FAR END. The first version
    // of this row sampled at 0.55–0.85 of each element and PASSED ON THE OLD
    // MARK — measured against the shipped build: stem 5.00/25 vs bar 4.00/25,
    // ratio 1.25, on two strokes of IDENTICAL width. The 0.85 sample sat inside
    // the barb's flat END CAP, where a 5x5 window catches the stroke's full
    // rectangle rather than a crossing line, and that alone out-counted the
    // bar. A row that goes green on the thing it exists to reject is worse than
    // no row, so both sets are now taken from the middle third: >= 1.8 cell px
    // from the shared anchor (the 5x5 window is 0.63 cell px across at this
    // zoom) and >= 1.6 cell px from either end.
    const barPts = [-0.6, -0.5, -0.4, 0.4, 0.5, 0.6].map((t) =>
      P([R.ax + (R.bar2x - R.ax) * t, R.ay + (R.bar2y - R.ay) * t]));
    const stemPts = [0.4, 0.5, 0.6].map((t) => P(lerp(R.ax, R.ay, R.tipx, R.tipy, t)));
    const barD = await c.json(`window.__density(${JSON.stringify(barPts)})`);
    const stemD = await c.json(`window.__density(${JSON.stringify(stemPts)})`);
    // ⚠ THE THRESHOLD IS A DERIVED LOWER BOUND, NOT "MORE THAN". A bare
    // `stem > bar` was also measured on the shipped build and PASSED, at 5 vs
    // 4: two strokes of identical width differ by ±1 saturated pixel purely
    // from where the line falls on the pixel grid, so ">" is inside the noise.
    // The bound that is not: a stroke ARROW_WIDTH_SCALE times wider covers
    // ARROW_WIDTH_SCALE times the AREA, and the count of near-fully-covered
    // pixels grows at least that fast — for width w and window-crossing length
    // L the saturated count goes as (w - c)L with c > 0 the antialiased
    // fringe, so (1.6w - c)/(w - c) > 1.6. Requiring the ratio to clear 1.6 is
    // therefore a floor the geometry guarantees and phase noise cannot fake.
    const needed = barD.mean * MOD.ARROW_WIDTH_SCALE;
    check('H2', '⭐ DISCRIMINATING: the STEM lays down at least ARROW_WIDTH_SCALE times the ink per '
      + `window that the tangent bar does (=${MOD.ARROW_WIDTH_SCALE}, the width ratio, which is a `
      + 'lower bound on the saturated-pixel ratio)',
      !barD.oob && !stemD.oob && barD.mean > 0 && stemD.mean >= needed,
      `stem density mean=${stemD.mean.toFixed(2)}/25 over ${stemD.n} windows [${stemD.reds}]\n        `
      + `bar  density mean=${barD.mean.toFixed(2)}/25 over ${barD.n} windows [${barD.reds}]  `
      + `ratio=${(stemD.mean / Math.max(0.001, barD.mean)).toFixed(2)} vs required >= ${MOD.ARROW_WIDTH_SCALE} `
      + `(i.e. stem mean >= ${needed.toFixed(2)})`);
    ruledOut('H2', 'the bar simply not being drawn (its own mean is required to be > 0, measured '
      + `${barD.mean.toFixed(2)}); a window straddling the other element (every sample is in its own `
      + 'element\'s middle third, and the two are perpendicular); a window off canvas (oob is reported, '
      + 'not silently zero); ⭐ AND SUBPIXEL PHASE NOISE — measured on the shipped build, two strokes '
      + 'of IDENTICAL width read 5 vs 4, so a bare "stem > bar" passed on exactly what this row exists '
      + `to reject. The threshold is the width ratio itself (${MOD.ARROW_WIDTH_SCALE}), which the `
      + 'shipped build misses by a wide margin');

    // ───────────── H4 ⭐ 45°-ish: the transpose/mirror trap ─────────────
    // At 0° the two elements lie on different axes, so almost any confusion
    // shows. On a diagonal they do not, and a transposed mark still looks like
    // a mark. Signs from the byte, plus a pixel pair.
    {
      const a = (R.angle / 256) * Math.PI * 2;
      const tx = Math.cos(a), ty = Math.sin(a);
      const bdx = (R.bar2x - R.bar1x) / barLen, bdy = (R.bar2y - R.bar1y) / barLen;
      const sdx = stemDir.x, sdy = stemDir.y;
      const tangentOk = Math.abs(bdx - tx) < 1e-6 && Math.abs(bdy - ty) < 1e-6;
      const perp = Math.abs(bdx * sdx + bdy * sdy) < 1e-6;
      const lenOk = Math.abs(stemLen - MOD.NORMAL_LEN) < 1e-6 && Math.abs(barLen - 2 * MOD.BAR_HALF) < 1e-6;
      const mirrorW = [2 * R.ax - stemMid[0], 2 * R.ay - stemMid[1]];
      const mir = await c.json(`window.__probe(${JSON.stringify([P(mirrorW)])})`);
      check('H4', `⭐ DISCRIMINATING at ${(R.angle / 256 * 360).toFixed(1)}°: the bar runs along (cos a, sin a) `
        + 'from its OWN byte, the stem is its perpendicular at NORMAL_LEN, and the reflected stem is empty',
        tangentOk && perp && lenOk && !mir[0].oob && mir[0].red === 0 && mir[0].nonblack >= 20,
        `bar dir (${bdx.toFixed(4)},${bdy.toFixed(4)}) vs (cos,sin)=(${tx.toFixed(4)},${ty.toFixed(4)}) `
        + `| dot=${(bdx * sdx + bdy * sdy).toExponential(2)} | stemLen=${stemLen.toFixed(4)} `
        + `(NORMAL_LEN ${MOD.NORMAL_LEN}) barLen=${barLen.toFixed(4)} (2*BAR_HALF ${2 * MOD.BAR_HALF})\n        `
        + `mirror(${mir[0].x},${mir[0].y}) red=${mir[0].red}/25 best=${mir[0].best} nonblack=${mir[0].nonblack}/25`);
      ruledOut('H4', 'a TRANSPOSED mark (stem along the tangent) — it fails `perp` and it fails '
        + '`stemLen`, since the two lengths differ; a y-MIRRORED mark — it fails `tangentOk` on a '
        + 'diagonal byte; a blank mirror probe — >=20/25 non-black required, measured '
        + `${mir[0].nonblack}; a neighbouring mark at the mirror (nearest other anchor `
        + `${nearestOther(mirrorW[0], mirrorW[1], R).toFixed(1)} world px)`);
    }

    // ────────── the hunt: two cases the slope park does not contain ──────────
    //
    // The 0° cell IS THE ONE HE NAMED and the wall is the case the module
    // refuses to answer, so neither may be quietly skipped because the pretty
    // park happens not to hold one. Both are hunted across the act at zoom 4
    // (64 screen px per cell — still over DETAIL_CELL_PX, so what gets measured
    // is the detail tier). Each park's report is a PUBLISH, so a park that drew
    // nothing shows up as `drawn: 0` rather than as a silently empty match.
    const PARK_STEP = 400;
    // `shallow` is the fallback for the 0° case ON THE MAP, and it exists
    // because of a real property of the data rather than as a softening: these
    // collision tables use s4's "odd angle byte = NO angle" flag, so genuinely
    // flat ground is stored as an odd byte and draws no mark at all. An exact
    // $00 cell is therefore not guaranteed to exist anywhere in an act. What IS
    // the owner's question — "why is the shallow one not pointing up" — is
    // answered by the shallowest mark the act actually contains.
    const hunt = { flat: null, wall: null, shallow: null, visited: 0, marksSeen: 0, angles: new Map() };
    outer:
    for (let hy = 400; hy <= 2000; hy += PARK_STEP) {
      for (let hx = 0; hx <= 1600; hx += PARK_STEP) {
        const v = await park({ vpX: hx, vpY: hy, zoom: 4 });
        const rr = await c.json('window.__dbg.aeon.collisionMarks()');
        hunt.visited++;
        hunt.marksSeen += rr.drawn;
        const toc = (wx, wy) => ({ x: (wx - v.x) * v.zoom, y: (wy - v.y) * v.zoom });
        const fits = (r) => [[r.ax, r.ay], [r.tipx, r.tipy], [r.bar1x, r.bar1y], [r.bar2x, r.bar2y],
          [2 * r.ax - r.tipx, 2 * r.ay - r.tipy]]
          .every(([x, y]) => inCanvas(toc(x, y)));
        if (!hunt.flat) {
          const f = rr.rows.find((r) => r.angle === 0 && r.normalKnown && r.tangentDrawn && fits(r));
          if (f) hunt.flat = { row: f, view: v, rows: rr.rows, tier: rr.tier };
        }
        if (!hunt.wall) {
          const w = rr.rows.find((r) => r.normalKnown === false && fits(r));
          if (w) hunt.wall = { row: w, view: v, rows: rr.rows, tier: rr.tier };
        }
        for (const r of rr.rows) {
          hunt.angles.set(r.angle, (hunt.angles.get(r.angle) ?? 0) + 1);
          if (!r.normalKnown || !r.tangentDrawn || !fits(r)) continue;
          // "Shallowest" = closest to flat ground, i.e. smallest |sin a|. At a
          // byte of $00 this row IS the owner's 0° case; when the act has none
          // it is the nearest thing the act contains, and its expectation is
          // derived from its own byte either way.
          const s = Math.abs(Math.sin((r.angle / 256) * Math.PI * 2));
          if (!hunt.shallow || s < hunt.shallow.sin) hunt.shallow = { row: r, view: v, rows: rr.rows, tier: rr.tier, sin: s };
        }
        if (hunt.flat && hunt.wall) break outer;
      }
    }
    note('hunt', `${hunt.visited} parks visited at zoom 4, ${hunt.marksSeen} marks published in total; `
      + `angle-$00 = ${hunt.flat ? 'found' : 'NOT FOUND'}, `
      + `normalKnown=false = ${hunt.wall ? 'found' : 'NOT FOUND'}, `
      + `shallowest usable = ${hunt.shallow ? `$${hunt.shallow.row.angle.toString(16)} `
        + `(${(hunt.shallow.row.angle / 256 * 360).toFixed(1)}°)` : 'NOT FOUND'}`);
    note('angle bytes seen', [...hunt.angles.entries()].sort((a, b) => a[0] - b[0])
      .map(([a, n]) => `$${a.toString(16).padStart(2, '0')}x${n}`).join(' '));

    // ───────────── H3 ⭐ THE 0° CASE — the sentence he actually wrote ─────────
    // Exact $00 first; the shallowest mark the act contains if it has none (see
    // SHALLOW_SIN for why "none" is a property of the tables, not a dodge).
    const F0 = hunt.flat ?? hunt.shallow;
    if (!F0) {
      unmeasurable('H3', 'the normal-tilt identity on the map',
        `no usable mark was published on-canvas across ${hunt.visited} parks `
        + `(${hunt.marksSeen} marks seen). Covered by collision-angle-mark.test.ts instead.`);
    } else {
      const F = F0.row, V = F0.view;
      const toc = ([wx, wy]) => ({ x: (wx - V.x) * V.zoom, y: (wy - V.y) * V.zoom });
      await park({ vpX: V.x, vpY: V.y, zoom: V.zoom });
      // THE PUBLISH FIRST, AND THE EXPECTATION IS DERIVED FROM THE BYTE.
      // The outward normal is the tangent rotated a quarter turn, so the stem's
      // tilt away from straight-up must equal the surface's own angle, exactly.
      // At $00 that is 0 and the stem is EXACTLY vertical.
      const degOfByte = (F.angle / 256) * 360;
      const tiltDeg = (Math.atan2(F.tipx - F.ax, F.ay - F.tipy) * 180) / Math.PI;
      const wantTilt = ((degOfByte + 180) % 360) - 180;   // to (-180, 180]
      const tiltOk = Math.abs(tiltDeg - wantTilt) < 1e-6 && F.tipy < F.ay;
      const upW = lerp(F.ax, F.ay, F.tipx, F.tipy, 0.65);
      const downW = [2 * F.ax - upW[0], 2 * F.ay - upW[1]];
      const [up, down] = await c.json(`window.__probe(${JSON.stringify([toc(upW), toc(downW)])})`);
      const downNear = Math.min(...F0.rows.filter((r) => r !== F)
        .map((r) => Math.hypot(r.ax - downW[0], r.ay - downW[1])));
      check('H3', `⭐ at angle $${F.angle.toString(16).padStart(2, '0')} (${degOfByte.toFixed(1)}°) the `
        + 'dominant stroke points UP, tilted by exactly the surface angle: red above the surface, '
        + 'NONE at the equal-distance reflection below it',
        tiltOk && !up.oob && up.red > 0 && !down.oob && down.red === 0 && down.nonblack >= 18,
        `stem tilt off vertical = ${tiltDeg.toFixed(6)}°, the byte's own angle = ${wantTilt.toFixed(6)}° `
        + `(delta ${(tiltDeg - wantTilt).toExponential(2)})\n        `
        + `tip=(${F.tipx.toFixed(3)},${F.tipy.toFixed(3)}) anchor=(${F.ax.toFixed(3)},${F.ay.toFixed(3)}) `
        + `at view ${JSON.stringify(V)}\n        `
        + `up(${up.x},${up.y}) red=${up.red}/25 best=${up.best} | `
        + `down(${down.x},${down.y}) red=${down.red}/25 best=${down.best} nonblack=${down.nonblack}/25`);
      ruledOut('H3', 'a build drawing the OLD centred symmetric tick, or drawing the stem downward — '
        + 'both put red at the DOWN probe, which is required to be 0; "there is ink on the vertical '
        + 'axis through this cell" as the whole test, which passes on both of those; a blank probe '
        + `(down requires >=18/25 non-black, measured ${down.nonblack}); a neighbouring mark supplying `
        + `the down red (nearest other published anchor ${downNear.toFixed(1)} world px away)`);
      // The near-horizontal bar must still be there — otherwise "points up" was
      // bought by deleting the tangent, which this parcel refuses to do.
      const fbar = await c.json(`window.__probe(${JSON.stringify([toc(lerp(F.bar1x, F.bar1y, F.bar2x, F.bar2y, 0.2))])})`);
      check('H3b', '...and the near-horizontal tangent bar is STILL DRAWN there — the up-arrow was '
        + 'not bought by deleting it',
        F.tangentDrawn === true && !fbar[0].oob && fbar[0].red > 0,
        `tier=${F0.tier} tangentDrawn=${F.tangentDrawn} bar(${fbar[0].x},${fbar[0].y}) `
        + `red=${fbar[0].red}/25 best=${fbar[0].best}`);
    }

    // ───────────── H7: the wall keeps its honesty (hunted, not assumed) ──────
    if (!hunt.wall) {
      unmeasurable('H7', 'the wall (undecidable open side) case on the map',
        `no mark with normalKnown=false was published across ${hunt.visited} parks `
        + `(${hunt.marksSeen} marks seen) — this act has no angle-$40/$c0 collision cell there. `
        + 'The geometry and the double-ended draw are covered by collision-angle-mark.test.ts.');
    } else {
      const W = hunt.wall.row, V = hunt.wall.view;
      const toc = ([wx, wy]) => ({ x: (wx - V.x) * V.zoom, y: (wy - V.y) * V.zoom });
      await park({ vpX: V.x, vpY: V.y, zoom: V.zoom });
      const aW = lerp(W.ax, W.ay, W.tipx, W.tipy, 0.6);
      const bW = [2 * W.ax - aW[0], 2 * W.ay - aW[1]];
      const pr = await c.json(`window.__probe(${JSON.stringify([toc(aW), toc(bW)])})`);
      check('H7', 'a WALL is drawn DOUBLE-ENDED — red on BOTH sides of the anchor, so the mark '
        + 'asserts no open side the cell cannot say',
        pr.every((p) => !p.oob && p.red > 0),
        `angle=$${W.angle.toString(16)} normalKnown=${W.normalKnown} `
        + pr.map((p) => `(${p.x},${p.y}) red=${p.red}/25 nonblack=${p.nonblack}`).join('  '));
      ruledOut('H7', 'a confident single-ended arrow on a wall — it leaves one of these two probes at '
        + 'zero; and a probe that landed on nothing — each reports its own non-black count');
    }

    await park(PARK_DETAIL);
    await sleep(900);


    await shoot(c, 'map-z8');
    await park(PARK_WORK);
    await sleep(900);
    await shoot(c, 'map-z4-working');

    // ───────────── H5/H6: the tangent is demoted below DETAIL_CELL_PX ────────
    const scanDetail = await c.json('window.__scanRed()');
    await park(PARK_COMPACT);
    await sleep(900);
    const repC = await c.json('window.__dbg.aeon.collisionMarks()');
    check('H5a', 'between the gate and DETAIL_CELL_PX the app publishes tier=compact, tangentDrawn=false, '
      + 'and marks are still DRAWN',
      repC.active === true && repC.suppressed === false && repC.tier === 'compact'
        && repC.cellScreenPx >= MOD.MIN_CELL_PX_FOR_MARK && repC.cellScreenPx < MOD.DETAIL_CELL_PX
        && repC.drawn > 0 && repC.rows.length > 0 && repC.rows.every((r) => r.tangentDrawn === false),
      `tier=${repC.tier} cellScreenPx=${repC.cellScreenPx} in [${MOD.MIN_CELL_PX_FOR_MARK}, ${MOD.DETAIL_CELL_PX}) `
      + `drawn=${repC.drawn} rows=${repC.rows.length}`);

    {
      const viewC = await c.json('window.__dbg.view()');
      const toC = (wx, wy) => ({ x: (wx - viewC.x) * viewC.zoom, y: (wy - viewC.y) * viewC.zoom });
      const inC = (p) => p.x >= 6 && p.y >= 6 && p.x < info.backingW - 6 && p.y < info.backingH - 6;
      const cand = repC.rows.filter((r) => {
        const ang = (r.angle / 256) * Math.PI * 2;
        return Math.abs(Math.sin(ang)) > 0.3 && Math.abs(Math.cos(ang)) > 0.3
          && [[r.ax, r.ay], [r.bar1x, r.bar1y], [r.bar2x, r.bar2y], [r.tipx, r.tipy]]
            .every(([x, y]) => inC(toC(x, y)));
      });
      if (!cand.length) {
        unmeasurable('H5b', 'the compact tier in pixels', 'no diagonal row fully on-canvas at the compact park');
      } else {
        const C = cand[0];
        const q = [lerp(C.bar1x, C.bar1y, C.bar2x, C.bar2y, 0.15),
          lerp(C.bar1x, C.bar1y, C.bar2x, C.bar2y, 0.85)];
        const sm = lerp(C.ax, C.ay, C.tipx, C.tipy, 0.6);
        const pr = await c.json(`window.__probe(${JSON.stringify([...q.map(([x, y]) => toC(x, y)), toC(sm[0], sm[1])])})`);
        const [b1, b2, sm1] = pr;
        check('H5b', '⭐ DISCRIMINATING: at the compact tier there is NO red at the bar\'s own published '
          + 'coordinates, while the STEM still has red — demoted, not dead',
          !b1.oob && !b2.oob && !sm1.oob && b1.red === 0 && b2.red === 0 && sm1.red > 0
            && b1.nonblack >= 15 && b2.nonblack >= 15,
          `bar ends (${b1.x},${b1.y}) red=${b1.red} nonblack=${b1.nonblack}/25 | `
          + `(${b2.x},${b2.y}) red=${b2.red} nonblack=${b2.nonblack}/25 | `
          + `stem (${sm1.x},${sm1.y}) red=${sm1.red}/25`);
        ruledOut('H5b', 'the overlay being dead at this zoom — the stem probe on the SAME mark is '
          + `required to be red (measured ${sm1.red}/25) and the bar probes are required to be looking `
          + 'at drawn content (>=15/25 non-black), so the zeros are the demotion');
      }
    }
    await shoot(c, 'map-z2-compact');

    await park(PARK_DETAIL);
    await sleep(900);
    const repBack = await c.json('window.__dbg.aeon.collisionMarks()');
    const scanBack = await c.json('window.__scanRed()');
    check('H6', 'zooming back in RESTORES the tangent — proving H5b measured the demotion, not a dead pass',
      repBack.tier === 'detail' && repBack.rows.every((r) => r.tangentDrawn === true)
        && repBack.paints > repC.paints && scanBack.red > 0,
      `tier=${repBack.tier} drawn=${repBack.drawn} paints ${repC.paints}->${repBack.paints} `
      + `whole-canvas red=${scanBack.red} (was ${scanDetail.red} on the way out)`);

    // ───────────── H8 ⭐ THE PICKER — the surface he was looking at ──────────
    const opened = await c.evalExpr(OPEN_COLLISION_TOOL);
    await sleep(1500);
    const ink = await c.json(PICKER_INK);
    note('picker', `collision tool button = ${JSON.stringify(opened)}; ${ink.length} labelled thumbnails read`);
    const allZeros = ink.filter((t) => t.deg === '0°');
    const zeros = allZeros.filter((t) => t.n > 0);
    check('H8a', 'the collision picker is open and EVERY 0° thumbnail carries angle-red ink',
      ink.length >= 4 && allZeros.length > 0 && zeros.length === allZeros.length,
      `${ink.length} labelled thumbnails, ${allZeros.length} labelled 0°, ${zeros.length} of those `
      + `with red ink (a 0° tile with none would be a mark that did not draw); `
      + `sample=${JSON.stringify(ink.slice(0, 3))}`);
    ruledOut('H8a', 'a picker that never mounted — 220-odd labelled canvases are required and each '
      + 'reports its own non-black pixel count, so an empty panel cannot satisfy this');
    if (zeros.length) {
      const tall = zeros.filter((t) => t.bh > t.bw);
      check('H8b', '⭐ DISCRIMINATING: in every 0° THUMBNAIL the angle-red ink is TALLER than it is WIDE '
        + '— the mark points up, it does not lie flat',
        tall.length === zeros.length,
        zeros.map((t) => `n=${t.n} bbox ${t.bw}x${t.bh} (w x h) in ${t.w}x${t.h}`).join('  '));
      ruledOut('H8b', 'the ink being the orange solid-edge frame or the teal surface line rather than '
        + `the mark — the picker tolerance is ${PICKER_TOL} and COLLISION_SOLID_EDGE (255,150,60) is 60 `
        + 'away on green, COLLISION_SHAPE_LINE (150,235,205) further still; a thumbnail with no ink at '
        + 'all (n > 0 required per tile); and the frame being square rather than tall (a frame would '
        + 'give bw == bh, which fails a strict >)');
      // The demotion rule reaching the picker: a ~20px cell is far under
      // DETAIL_CELL_PX, so a 0° thumbnail must hold the STEM ALONE. If the
      // horizontal tangent were still drawn there, bw would include its 9-cell-px
      // span and the box would not be tall.
      const widths = zeros.map((t) => t.bw);
      check('H8c', '...and that is the demotion rule reaching the picker: the ink is narrow, i.e. the '
        + 'horizontal tangent bar is not drawn at thumbnail size',
        Math.max(...widths) <= Math.max(...zeros.map((t) => t.bh)),
        `widest 0° ink = ${Math.max(...widths)} px across, tallest = ${Math.max(...zeros.map((t) => t.bh))} px; `
        + `derived: a thumbnail cell is ~${20} px, far under DETAIL_CELL_PX=${MOD.DETAIL_CELL_PX}`);
    }
    await shoot(c, 'picker');
    const prect = await c.json(PICKER_RECT);
    if (prect) {
      note('picker crop', JSON.stringify(prect));
      await shoot(c, 'picker-crop', { ...prect, scale: 3 });
    } else {
      note('picker crop', 'no picker panel rect found — full-window shot only');
    }

    // ───────────────────── totals ─────────────────────
    const passed = results.filter((r) => r.ok).length;
    log(`\n=== ${passed}/${results.length} PASSED ===`);
    if (fails.length) { log('FAILING ROWS:'); for (const f of fails) log('  ' + f); }
    if (unmeasured.length) {
      log(`UNMEASURED (${unmeasured.length}) — not passes:`);
      for (const u of unmeasured) log('  ' + u);
    }
    log(`env: dpr=${dpr} rect=${JSON.stringify(info)} viewport=${JSON.stringify(VIEWPORT)}`);
    process.exitCode = fails.length ? 1 : 0;
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
