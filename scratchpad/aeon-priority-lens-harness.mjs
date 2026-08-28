#!/usr/bin/env node
// CAN THE OWNER ACTUALLY SEE WHICH FOREGROUND TILES WILL COVER SONIC?
//
// His words, from a play session: "No way to see what art on fg is priority or
// not. Randomly sometimes sonic just goes behind a tile that I wasn't aware was
// prioritised." The lens existed and worked — for the CLASSIC viewport only.
// `OVERLAY_KEYS_BY_ENGINE.aeon` did not list `showPriority`, so the checkbox was
// not in his View menu at all.
//
// The ~5,200-row node suite cannot see a React menu, a canvas, or a running app.
// So this file drives the REAL app: it opens the REAL aeon project, clicks the
// REAL View-menu checkbox, and then reads the map canvas's OWN PIXELS.
//
// ═══ THE MEASUREMENT, AND WHY IT IS A DELTA ═══
//
// The obvious row — "is the pixel violet where the document says high priority"
// — is WRONG HERE, and measurably so. PRIORITY_FILL is `rgba(200,90,255,0.42)`
// composited over whatever the art already painted. Over grey art the violetness
// `min(r,b) - g` lands at a constant 46; over SATURATED GREEN art it lands at
// -102. Oracle Jungle Zone is a jungle. A violetness predicate would have failed
// on exactly the tiles the owner cares about, and "loosen the threshold" would
// have made it pass on the green art itself.
//
// So the subject is the DELTA. Sample two pixels with the lens OFF, toggle it
// ON, sample the same two again:
//
//   • the HIGH-priority tile's pixel MUST CHANGE, and change to exactly
//     `0.42*(200,90,255) + 0.58*before` per channel (+-2 for rounding) — the
//     source-over composite of PRIORITY_FILL, whose alpha and colour this
//     harness READS OUT OF src/renderer/canvas/canvas-colors.ts rather than
//     typing, so a pin cannot drift from the app;
//   • the LOW-priority tile RIGHT NEXT TO IT must be BYTE-IDENTICAL. That is
//     the half that makes it a measurement: a lens that veiled all art, or a
//     whole-canvas violet wash, passes the first row and fails this one.
//
// Both tiles are DRAWN art (non-zero nametable words, asserted), so the control
// is not "empty space stayed empty".
//
// ═══ WHAT ELSE IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. A VEIL BAKED INTO THE SECTION CACHE. SectionRenderer caches painted section
//    canvases; a lens drawn into one would survive the toggle going off. Row 6
//    turns the lens back OFF and demands both pixels return byte-identical to
//    their pre-lens values.
//
// 2. A LENS THAT SCANS THE WHOLE ACT. A section is 256x256 tiles and an act
//    holds up to 48 of them — ~3.1M predicate calls per repaint, unwindowed.
//    Row 7 parks the camera on a region the model says has NO high-priority
//    tiles and demands `veils === 0` while the act still holds thousands, then
//    pans back and demands they return.
//
// 3. A CLOCK NOBODY ASKED FOR. Section 8 sits with the lens DRAWN for 3s and
//    asserts zero map repaints while the page is provably still painting.
//    MapViewport's measured zero-idle-repaint property (37/37) must survive.
//
// 4. A LENS THAT MARKS THE BACKGROUND. Row 9 switches to the BG layer, where
//    there is no foreground to mark, and demands the report say so (`reason:
//    'bg-layer'`) rather than leaving the previous frame's numbers standing.
//
// ═══ THE dpr TRAP, AND WHY THIS HARNESS IS IMMUNE ═══
//
// `devicePixelRatio` varies run-to-run under Xvfb here (observed 1 and 1.35
// hours apart), which makes `getBoundingClientRect()` fractional and turns CDP
// mouse aiming into an off-by-one that presents as a bug in the feature.
//
// THIS HARNESS SENDS NO MOUSE COORDINATES AT ALL. The View-menu checkbox is a
// real `.click()` on a real `<input>` (no position), and every pixel read is in
// CANVAS BACKING-STORE coordinates, which MapViewport sets from
// `canvas.width = rect.width` — CSS px, truncated, never multiplied by dpr. The
// canvas↔world contract is then the app's own transform, `scale(zoom);
// translate(-vpX,-vpY)`, so canvasX = (worldX - view.x) * view.zoom.
//
// That is a CLAIM, so row 4a MEASURES it: it prints dpr and the rect and asserts
// `canvas.width === Math.floor(rect.width)`. Every aim below is an integer
// derived from `view()` read back off the store — never from a rect.
//
// ⚠ IT WRITES NOTHING TO DISK. No Ctrl+S, no save call. Overlay toggles are
// session state, and the run ends with them back as found.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     node scratchpad/aeon-priority-lens-harness.mjs
//
// ⚠ NOT `priority-lens-harness.mjs`. That name was already taken by the CLASSIC
// lens's own harness (commit b11f890) — this file was first written over it and
// had to be restored from HEAD. Both exist; they test the two halves of one
// feature and the classic one is a live no-perturbation check on the shared
// depiction, so keep them apart.

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9397);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch instead.
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-priority-lens`;
mkdirSync(SHOTS, { recursive: true });

// ── THE VEIL COLOUR, READ OUT OF THE APP'S SOURCE ──────────────────────────
// Not typed here. `PRIORITY_FILL` is the single definition both viewports draw
// with, and a hardcoded triple in this file would be a pin that survives the
// colour changing. If the parse fails the harness DIES rather than falling back
// to a guess — a lens check that cannot see its own subject must not run.
const COLORS_SRC = `${ROOT}/src/renderer/canvas/canvas-colors.ts`;
function priorityFill() {
  const src = readFileSync(COLORS_SRC, 'utf8');
  const m = /export const PRIORITY_FILL = 'rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)'/.exec(src);
  if (!m) throw new Error(`could not read PRIORITY_FILL out of ${COLORS_SRC}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
}
const VEIL = priorityFill();

/** source-over: dst' = src*a + dst*(1-a), per channel. The app's own blend. */
function composited(before) {
  return {
    r: VEIL.r * VEIL.a + before.r * (1 - VEIL.a),
    g: VEIL.g * VEIL.a + before.g * (1 - VEIL.a),
    b: VEIL.b * VEIL.a + before.b * (1 - VEIL.a),
  };
}
/** Rounding slack. The canvas rounds to 8 bits; nothing else may move. */
const BLEND_TOL = 2;
function blendMatches(before, after) {
  const want = composited(before);
  return Math.abs(after.r - want.r) <= BLEND_TOL
    && Math.abs(after.g - want.g) <= BLEND_TOL
    && Math.abs(after.b - want.b) <= BLEND_TOL;
}
const same = (a, b) => a && b && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
const px = (p) => (p ? `(${p.r},${p.g},${p.b},${p.a})` : 'null');

/** The zoom every pixel row uses: one 8px tile becomes 32 canvas px, so the
 *  tile CENTRE is 16px clear of the 1-screen-px boundary stroke on its edges. */
const ZOOM = 4;
const TILE = 8;

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
  console.log(`        shot → scratchpad/shots-priority-lens/${name}.png`);
}

// ── driving the REAL View menu ─────────────────────────────────────────────
// Three steps with real waits: the menu panel is mounted only while open, and
// React does not flush that render inside the click's own task.
const OPEN_VIEW_MENU = String.raw`
(() => {
  const btn = [...document.querySelectorAll('button')]
    .find((e) => /^View$/.test((e.textContent || '').trim()));
  if (!btn) return 'no-view-menu';
  btn.click();
  return true;
})()`;
const VIEW_MENU_LABELS = String.raw`
[...document.querySelectorAll('label')].map((e) => (e.textContent || '').trim())`;
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
async function viewMenuLabels(c) {
  const opened = await c.evalExpr(OPEN_VIEW_MENU);
  if (opened !== true) return { error: opened };
  await sleep(400);
  const labels = await c.json(VIEW_MENU_LABELS);
  await c.evalExpr(OPEN_VIEW_MENU);
  await sleep(200);
  return labels;
}
async function toggleViewOverlay(c, re) {
  const opened = await c.evalExpr(OPEN_VIEW_MENU);
  if (opened !== true) return { error: opened };
  await sleep(400);
  const res = await c.json(CLICK_VIEW_ITEM(re));
  await sleep(250);
  await c.evalExpr(OPEN_VIEW_MENU);   // click the button again to close
  await sleep(400);
  return res;
}

/** One pixel off the LIVE map canvas — the context the app already drew with. */
const PIXEL_AT = (x, y) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(${x}, ${y}, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
})()`;

/**
 * THE SUBJECT, PIXEL-VERIFIED, inside the currently visible window.
 *
 * Two stages, and the second one is not optional. FIND_PAIR above searches the
 * MODEL and can only promise the nametable words. What the pixel rows need is a
 * tile that actually PAINTS something at the sampled point, and — measured, on
 * this fixture — a word with real art does not guarantee that:
 *
 *   • the first draft aimed at the tile CENTRE, and the low control sampled
 *     (0,0,0) because word `0x6000` is tile index 0 (blank);
 *   • the second draft demanded a non-zero tile index and got `0x41a1`, whose
 *     whole inner 16x16 canvas region is STILL transparent. Colour 0 in a VDP
 *     tile is transparent — the very distinction occlusion.ts calls `mapOpaque`
 *     — so "the word draws" and "this pixel is painted" are different claims.
 *
 * So this scans the visible band of section 0 for a high-priority ART tile with
 * a COLOURED opaque pixel, paired with a low-priority ART tile within 3 columns
 * that also has one, and returns both aims. Both boxes are INSET by a quarter
 * tile so an aim can never land on the 1-screen-px boundary stroke the lens
 * draws along a tile's edges — that is the stroke's colour, not the veil's.
 *
 * The visible tile range is derived from the camera and the canvas's own
 * backing size through the app's transform, so nothing here is a guess.
 */
const PICK_AIMS = (vx, vy, zoom, inset) => String.raw`
(() => {
  const W = 256, IDX = 0x7ff, T = 8;
  const vx = ${vx}, vy = ${vy}, zoom = ${zoom}, inset = ${inset};
  const cv = document.getElementById('map-canvas');
  const ctx = cv && cv.getContext('2d');
  if (!ctx) return { error: 'no-canvas' };
  const c0 = Math.max(0, Math.ceil(vx / T)), r0 = Math.max(0, Math.ceil(vy / T));
  const c1 = Math.min(W, Math.floor((vx + cv.width / zoom) / T));
  const r1 = Math.min(W, Math.floor((vy + cv.height / zoom) / T));
  const size = T * zoom, n = size - 2 * inset;
  const colouredPixel = (col, row) => {
    const x0 = (col * T - vx) * zoom + inset, y0 = (row * T - vy) * zoom + inset;
    if (x0 < 0 || y0 < 0 || x0 + n > cv.width || y0 + n > cv.height) return null;
    const d = ctx.getImageData(x0, y0, n, n).data;
    for (let i = 0; i < n * n; i++) {
      const o = i * 4;
      if (d[o + 3] === 255 && d[o] + d[o + 1] + d[o + 2] > 90) {
        return { x: x0 + (i % n), y: y0 + Math.floor(i / n) };
      }
    }
    return null;
  };
  for (let r = r0; r < r1; r++) {
    const row = window.__dbg.aeon.ntRect(0, 0, r, W, 1);
    if (!row) return { error: 'no-section-0' };
    for (let c = c0; c < c1; c++) {
      const w = row[c];
      if (!(w & 0x8000) || (w & IDX) === 0) continue;
      const hiAim = colouredPixel(c, r);
      if (!hiAim) continue;
      for (const dc of [1, -1, 2, -2, 3, -3]) {
        const cc = c + dc;
        if (cc < c0 || cc >= c1) continue;
        const nw = row[cc];
        if ((nw & 0x8000) || (nw & IDX) === 0) continue;
        const loAim = colouredPixel(cc, r);
        if (!loAim) continue;
        return { hiCol: c, hiRow: r, loCol: cc, loRow: r, hiWord: w, loWord: nw,
                 hiAim, loAim, window: { c0, c1, r0, r1 } };
      }
    }
  }
  return { error: 'no-pixel-verified-pair-in-view', window: { c0, c1, r0, r1 } };
})()`;

const CANVAS_GEOMETRY = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const b = cv.getBoundingClientRect();
  return { w: cv.width, h: cv.height, rectW: b.width, rectH: b.height,
           rectLeft: b.left, rectTop: b.top, dpr: window.devicePixelRatio };
})()`;

const REPAINT_PROBE = String.raw`
(() => {
  if (window.__priProbe) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
  window.__priProbe = P;
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
 * FIND THE SUBJECT IN THE LIVE MODEL, never pinned in this file.
 *
 * Scans section 0's nametable through `__dbg.aeon.ntRect` for a HIGH-priority
 * word with a horizontally adjacent word that is DRAWN but LOW. Both halves
 * matter: the high tile is what must gain a veil, and a DRAWN low neighbour is
 * what makes "unchanged" a real control rather than "empty space stayed empty".
 *
 * BOTH TILE INDICES MUST BE NON-ZERO. Aeon tilesets keep index 0 as the blank
 * tile, and a first draft of this row accepted `0x6000` (tile 0, palette 3) as
 * the low neighbour — it sampled BLACK, which is a control that still works but
 * proves less than a coloured one does. Requiring real art on both sides makes
 * "byte-identical" a statement about art the lens declined to touch.
 *
 * Edges are excluded (cols/rows 4..251) so neither sample sits on the section
 * border SectionRenderer strokes around the active section.
 */
const FIND_PAIR = String.raw`
(() => {
  const W = 256, IDX = 0x7ff;
  for (let r = 4; r < 252; r++) {
    const row = window.__dbg.aeon.ntRect(0, 0, r, W, 1);
    if (!row) return { error: 'no-section-0' };
    for (let c = 4; c < 252; c++) {
      const w = row[c];
      if (!(w & 0x8000) || (w & IDX) === 0) continue;
      for (const dc of [1, -1]) {
        const n = row[c + dc];
        if (!(n & 0x8000) && (n & IDX) !== 0) {
          return { hiCol: c, hiRow: r, loCol: c + dc, loRow: r, hiWord: w, loWord: n };
        }
      }
    }
  }
  return { error: 'no-hi/lo-pair-of-real-art-in-section-0' };
})()`;

/**
 * A camera position with NO high-priority tile anywhere in view — the control
 * for the windowing row. Scans section 0 for a 64x32-tile block (512x256 world
 * px, larger than the canvas at zoom 4) that is entirely low/empty.
 */
const FIND_CLEAN_WINDOW = String.raw`
(() => {
  const W = 256, BW = 64, BH = 32;
  for (let r = 0; r + BH <= 256; r += BH) {
    for (let c = 0; c + BW <= W; c += BW) {
      const rect = window.__dbg.aeon.ntRect(0, c, r, BW, BH);
      if (!rect) return { error: 'no-section-0' };
      if (rect.every((w) => !(w & 0x8000))) return { col: c, row: r };
    }
  }
  return { error: 'every-block-has-a-high-tile' };
})()`;

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

    note(`PRIORITY_FILL read out of ${COLORS_SRC.replace(ROOT + '/', '')}`,
      `rgba(${VEIL.r}, ${VEIL.g}, ${VEIL.b}, ${VEIL.a})  →  a veiled pixel must equal `
      + `${VEIL.a}*(${VEIL.r},${VEIL.g},${VEIL.b}) + ${(1 - VEIL.a).toFixed(2)}*before  (+-${BLEND_TOL})`);

    // ---- 0. PROVENANCE. ---------------------------------------------------
    // `__dbg.aeon.priorityLens` is introduced by THIS branch and exists nowhere
    // on master. Without this row every PASS below could be describing a build
    // that has none of the parcel.
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.priorityLens === "function"');
    check('0a', 'the build under test contains the priority-lens probe (this branch, not master)',
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
    await sleep(2500);

    // ---- 2. THE OWNER'S ACTUAL COMPLAINT: is it in the menu? --------------
    // On master this row FAILS: OVERLAY_KEYS_BY_ENGINE.aeon did not list
    // showPriority, so the aeon View menu had no such checkbox at all.
    const labels = await viewMenuLabels(c);
    check('2a', "the aeon View menu OFFERS 'Priority (above sprites)' — the missing checkbox",
      Array.isArray(labels) && labels.some((t) => /^Priority \(above sprites\)$/.test(t)),
      JSON.stringify(labels));

    // ---- 3. Clear the deck, through the same real menu. -------------------
    // Object and ring markers draw OVER the lens by design. A marker sitting on
    // a sampled pixel would make the delta zero on BOTH tiles and the pixel rows
    // would report a working lens as broken. Turning them off is not a
    // convenience: it is what makes the pixel the ART's pixel.
    const offObjects = await toggleViewOverlay(c, '/^Objects$/');
    const offRings = await toggleViewOverlay(c, '/^Rings$/');
    check('3a', 'the object and ring markers are OFF, so a sampled pixel is art + lens only',
      offObjects.before === true && offObjects.after === false
      && offRings.before === true && offRings.after === false,
      `objects=${JSON.stringify(offObjects)} rings=${JSON.stringify(offRings)}`);

    // ---- 4. THE SUBJECT. Stage 1: park the camera on a high-priority region.
    const region = await c.json(FIND_PAIR);
    check('4a', 'ANTI-VACUOUS: section 0 holds a high-priority ART tile beside a low-priority ART tile',
      !region.error && (region.hiWord & 0x8000) !== 0 && (region.hiWord & 0x7ff) !== 0
      && (region.loWord & 0x8000) === 0 && (region.loWord & 0x7ff) !== 0,
      `${JSON.stringify(region)}  hiWord=0x${(region.hiWord ?? 0).toString(16)} `
      + `loWord=0x${(region.loWord ?? 0).toString(16)}`);
    if (region.error) throw new Error(`no subject: ${region.error}`);

    // Section 0's world origin is (0,0) for ANY act grid width
    // (SectionRenderer.sectionWorldOffset: col = index % gridWidth), so tile
    // (col,row) sits at world (col*8, row*8).
    // Park the camera so the region is well inside the canvas. INTEGER world
    // coords and an INTEGER zoom, so every derived canvas coord is an integer.
    const camX = Math.max(0, region.hiCol * TILE - 40);
    const camY = Math.max(0, region.hiRow * TILE - 30);
    await c.evalExpr(`window.__dbg.setView(${camX}, ${camY}, ${ZOOM})`);
    await sleep(900);
    // READ IT BACK — setViewport clamps, and every aim below is derived from
    // what the store actually holds, never from what was asked for.
    const view = await c.json('window.__dbg.view()');
    check('4b', 'the camera is where the aims are derived from (integer x/y, integer zoom)',
      Number.isInteger(view.x) && Number.isInteger(view.y) && view.zoom === ZOOM,
      JSON.stringify(view));

    // THE dpr CLAIM, MEASURED. canvas.width comes from `rect.width` truncated —
    // never multiplied by devicePixelRatio — so getImageData coordinates are CSS
    // px and no scale factor can move them. Printed either way.
    const geom = await c.json(CANVAS_GEOMETRY);
    check('4c', 'the canvas backing store is floor(rect) — pixel aims are dpr-independent',
      !!geom && geom.w === Math.floor(geom.rectW) && geom.h === Math.floor(geom.rectH)
      && geom.w > 200 && geom.h > 200,
      `dpr=${geom?.dpr} rect=${geom?.rectW}x${geom?.rectH} @${geom?.rectLeft},${geom?.rectTop} `
      + `backing=${geom?.w}x${geom?.h}`);

    // Stage 2: THE AIMS, pixel-verified inside that window. canvasX =
    // (worldX - view.x) * zoom is the app's own transform (`ctx.scale(zoom);
    // ctx.translate(-vpX,-vpY)` in MapViewport.redraw); with an integer camera
    // and an integer zoom every tile box is an integer box.
    const inset = (TILE * view.zoom) / 4;   // clear of the 1-screen-px edge stroke
    const pair = await c.json(PICK_AIMS(view.x, view.y, view.zoom, inset));
    const box = (col, row) => ({
      x: (col * TILE - view.x) * view.zoom,
      y: (row * TILE - view.y) * view.zoom,
      size: TILE * view.zoom,
    });
    note('the aims, derived from view() through the app\'s own transform',
      pair.error ? JSON.stringify(pair)
        : `hi tile (${pair.hiCol},${pair.hiRow}) word 0x${pair.hiWord.toString(16)} `
          + `box ${JSON.stringify(box(pair.hiCol, pair.hiRow))} → aim ${JSON.stringify(pair.hiAim)}\n`
          + `        lo tile (${pair.loCol},${pair.loRow}) word 0x${pair.loWord.toString(16)} `
          + `box ${JSON.stringify(box(pair.loCol, pair.loRow))} → aim ${JSON.stringify(pair.loAim)}\n`
          + `        visible tile window ${JSON.stringify(pair.window)}`);
    const inTile = (a, b) => a
      && a.x >= b.x + inset && a.x < b.x + b.size - inset
      && a.y >= b.y + inset && a.y < b.y + b.size - inset;
    check('4d', 'both aims are INTEGER pixels, inside their own tile, inset from the edge stroke',
      !pair.error
      && Number.isInteger(pair.hiAim?.x) && Number.isInteger(pair.loAim?.x)
      && inTile(pair.hiAim, box(pair.hiCol, pair.hiRow))
      && inTile(pair.loAim, box(pair.loCol, pair.loRow))
      && pair.hiAim.x < geom.w && pair.hiAim.y < geom.h
      && pair.loAim.x < geom.w && pair.loAim.y < geom.h
      && Math.abs(pair.hiCol - pair.loCol) <= 3 && pair.hiRow === pair.loRow,
      `${JSON.stringify(pair)} backing=${geom.w}x${geom.h}`);
    if (pair.error) throw new Error(`no pixel-verified subject: ${JSON.stringify(pair)}`);
    const hiAim = pair.hiAim, loAim = pair.loAim;

    // ---- 5. THE LENS IS OFF. ---------------------------------------------
    let report = await c.json('window.__dbg.aeon.priorityLens()');
    check('5a', "with the toggle off the last repaint drew NO lens, and says WHY ('off')",
      report.active === false && report.reason === 'off'
      && report.veils === 0 && report.segments === 0 && report.paints > 0,
      JSON.stringify(report));

    const hiBefore = await c.json(PIXEL_AT(hiAim.x, hiAim.y));
    const loBefore = await c.json(PIXEL_AT(loAim.x, loAim.y));
    // Both OPAQUE, and the low one not BLACK: a black control would still be
    // discriminating (a veil over black reads (84,38,107)) but a coloured one
    // says more, and this is where a fixture change would be caught.
    check('5b', 'ANTI-VACUOUS: both sampled pixels are OPAQUE, COLOURED art — not void, not black',
      hiBefore && loBefore && hiBefore.a === 255 && loBefore.a === 255
      && (loBefore.r + loBefore.g + loBefore.b) > 0 && (hiBefore.r + hiBefore.g + hiBefore.b) > 0,
      `hi=${px(hiBefore)} lo=${px(loBefore)}`);
    await shot(c, '1-lens-off');

    // ---- 6. TURN IT ON, THROUGH THE REAL MENU, AND LOOK. -----------------
    const on = await toggleViewOverlay(c, '/^Priority \\(above sprites\\)$/');
    check('6a', 'the real View-menu checkbox turns the lens ON',
      on.before === false && on.after === true, JSON.stringify(on));

    report = await c.json('window.__dbg.aeon.priorityLens()');
    check('6b', 'the repaint DREW the lens: active, over every section, with veils and strokes',
      report.active === true && report.reason === null
      && report.sections === st.sections && report.veils > 0 && report.segments > 0,
      `${JSON.stringify(report)} (act has ${st.sections} sections)`);

    const hiAfter = await c.json(PIXEL_AT(hiAim.x, hiAim.y));
    const loAfter = await c.json(PIXEL_AT(loAim.x, loAim.y));
    check('6c', 'THE HIGH-PRIORITY TILE GAINED THE VEIL — exactly the PRIORITY_FILL composite',
      !same(hiBefore, hiAfter) && blendMatches(hiBefore, hiAfter),
      `before=${px(hiBefore)} after=${px(hiAfter)} `
      + `want=(${composited(hiBefore).r.toFixed(1)},${composited(hiBefore).g.toFixed(1)},${composited(hiBefore).b.toFixed(1)})`);
    check('6d', 'THE LOW-PRIORITY TILE BESIDE IT IS BYTE-IDENTICAL — the lens marks the exception',
      same(loBefore, loAfter), `before=${px(loBefore)} after=${px(loAfter)}`);
    await shot(c, '2-lens-on');

    // ---- 7. TURN IT OFF: NOTHING WAS BAKED INTO THE SECTION CACHE. -------
    const off = await toggleViewOverlay(c, '/^Priority \\(above sprites\\)$/');
    const hiBack = await c.json(PIXEL_AT(hiAim.x, hiAim.y));
    const loBack = await c.json(PIXEL_AT(loAim.x, loAim.y));
    check('7a', 'toggling it off restores BOTH pixels byte-identically (no veil baked into the cache)',
      off.before === true && off.after === false && same(hiBefore, hiBack) && same(loBefore, loBack),
      `hi ${px(hiBefore)} → ${px(hiBack)}  lo ${px(loBefore)} → ${px(loBack)}`);
    // Back on for the rest of the run.
    await toggleViewOverlay(c, '/^Priority \\(above sprites\\)$/');
    await sleep(400);

    // ---- 8. THE WINDOW. --------------------------------------------------
    // An unwindowed lens would scan all 65,536 tiles of every section and report
    // the act's whole high-priority population wherever the camera stood.
    const onSubject = await c.json('window.__dbg.aeon.priorityLens()');
    const clean = await c.json(FIND_CLEAN_WINDOW);
    check('8a', 'ANTI-VACUOUS: the model offers a 512x256px region of section 0 with no high tile',
      !clean.error, JSON.stringify(clean));
    if (!clean.error) {
      await c.evalExpr(`window.__dbg.setView(${clean.col * TILE}, ${clean.row * TILE}, ${ZOOM})`);
      await sleep(900);
      const cleanReport = await c.json('window.__dbg.aeon.priorityLens()');
      check('8b', 'parked over a clean region the lens is ACTIVE and veils NOTHING (it windows)',
        cleanReport.active === true && cleanReport.veils === 0 && cleanReport.segments === 0
        && cleanReport.paints > onSubject.paints,
        `clean=${JSON.stringify(cleanReport)} vs on-subject=${JSON.stringify(onSubject)}`);

      // And back — a zero that never comes back is a dead lens, not a window.
      await c.evalExpr(`window.__dbg.setView(${view.x}, ${view.y}, ${ZOOM})`);
      await sleep(900);
      const backReport = await c.json('window.__dbg.aeon.priorityLens()');
      const hiAgain = await c.json(PIXEL_AT(hiAim.x, hiAim.y));
      check('8c', 'panning back brings the veils back, on the same pixel as before',
        backReport.veils > 0 && blendMatches(hiBefore, hiAgain),
        `${JSON.stringify(backReport)} pixel=${px(hiAgain)}`);
    }

    // ---- 9. NO CLOCK. ----------------------------------------------------
    const probe = await c.evalExpr(REPAINT_PROBE);
    check('9a', 'the repaint probe is installed on the live map canvas',
      probe === 'installed' || probe === 'already', String(probe));
    await c.evalExpr('window.__priProbe.repaints = 0; window.__priProbe.ticks = 0; window.__priProbe.start()');
    await sleep(3000);
    const idle = await c.json(
      '({ repaints: window.__priProbe.repaints, ticks: window.__priProbe.ticks, bound: window.__priProbe.bound() })');
    await c.evalExpr('window.__priProbe.stop()');
    const lensStillOn = await c.json('window.__dbg.aeon.priorityLens()');
    check('9b', 'ANTI-VACUOUS: the page kept painting for 3s and the probe is on the LIVE canvas',
      idle.ticks > 60 && idle.bound === true, JSON.stringify(idle));
    check('9c', 'the lens is DRAWN and schedules ZERO idle repaints (the 37/37 property survives)',
      lensStillOn.active === true && lensStillOn.veils > 0 && idle.repaints === 0,
      `repaints=${idle.repaints} lens=${JSON.stringify(lensStillOn)}`);

    // ---- 10. THE BG LAYER HAS NO FOREGROUND TO MARK. ---------------------
    await c.evalExpr("window.__dbg.aeon.setLayer('bg')");
    await sleep(900);
    const bgReport = await c.json('window.__dbg.aeon.priorityLens()');
    check('10a', "on the BG layer the lens stands down and SAYS WHY ('bg-layer'), toggle still on",
      bgReport.active === false && bgReport.reason === 'bg-layer'
      && bgReport.veils === 0 && bgReport.paints > lensStillOn.paints,
      JSON.stringify(bgReport));
    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");
    await sleep(900);
    const fgReport = await c.json('window.__dbg.aeon.priorityLens()');
    check('10b', 'back on the FG layer the lens returns without touching the toggle',
      fgReport.active === true && fgReport.reason === null && fgReport.veils > 0,
      JSON.stringify(fgReport));
    await shot(c, '3-lens-on-again');

    // ---- 11. LEAVE IT AS FOUND (session state only; nothing was saved). ---
    await toggleViewOverlay(c, '/^Priority \\(above sprites\\)$/');
    await toggleViewOverlay(c, '/^Objects$/');
    await toggleViewOverlay(c, '/^Rings$/');
    const finalReport = await c.json('window.__dbg.aeon.priorityLens()');
    check('11a', 'teardown: the lens is off again and the report says so',
      finalReport.active === false && finalReport.reason === 'off', JSON.stringify(finalReport));

  } finally {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${passed}/${results.length} rows passed`);
    if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
    await sleep(400);
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
    process.exit(fails.length ? 1 : 0);
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
