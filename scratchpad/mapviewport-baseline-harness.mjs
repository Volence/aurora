#!/usr/bin/env node
// WHAT MAKES THE AEON MAP REPAINT, AND WHAT DOES ONE REPAINT COST?
//
// The incoming effects-authoring arc wants to hang per-scanline passes
// (parallax band previews, BgAnim band playback, palette cycling) on
// MapViewport. It assumed it could ride the play-clock + overlay-pass
// machinery. Two static facts say it cannot:
//
//   MapViewport.tsx                       0 requestAnimationFrame calls
//   classic/ClassicLevelViewport.tsx      4 (:195 comment, :212, :427, :429)
//   state/viewStore.ts:50-56              playAnimatedArt + occludeSprites are
//                                         listed for 's1' ONLY; neither appears
//                                         in the 'aeon' overlay list
//
// So aeon's viewport is EVENT-DRIVEN: one useEffect (MapViewport.tsx:528-577)
// keyed on [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId,
// activeSectionIndex, editingLayer, historyVersion, liveEditVersion, selection,
// objectSprites, collisionProfiles, drawCollisionPreview]. Nothing in that list
// is a clock. This harness MEASURES that on the running app instead of asserting
// it from a grep, and puts a distribution on the repaint cost so the arc's
// preview posture stops being provisional.
//
// ------------------------------------------------------------------ instrument
// THE COMPONENT IS NEVER ASKED WHETHER IT WORKED. MapViewport reports nothing
// about itself; the harness installs its own probe from outside (window.__mvProbe)
// and times the component's REAL draw calls:
//
//   start of a repaint  = the assignment `canvas.width = rect.width`
//                         (MapViewport.tsx:536 — the first statement of the draw
//                         effect after its guards; also the resize path's first
//                         statement). Caught by patching the HTMLCanvasElement
//                         `width` accessor on the prototype.
//   end of a repaint    = the return of the LAST wrapped 2D op issued against
//                         #map-canvas in that same synchronous task. The record
//                         is closed in a queueMicrotask, which runs only after
//                         the whole task (and therefore after every draw) has
//                         finished.
//
// The bracket therefore CONTAINS SectionRenderer.flushAllDirty() + the section
// blits + OverlayRenderer's whole pass, and EXCLUDES React's commit, the
// compositor, and the sibling collision-preview canvas (ops are filtered by
// `this.canvas === #map-canvas`). It is a paint-work number, not a
// frame-to-photon number, and the output says so.
//
// Wrapper overhead: only coarse ops are wrapped (drawImage/putImageData/
// fillRect/strokeRect/clearRect/stroke/fill/fillText/strokeText). Path-building
// calls (beginPath/moveTo/lineTo/arc) are NOT wrapped, because OverlayRenderer
// issues them in bulk for the grids and each one would pay for a wrapper. The
// grids still end in a wrapped stroke(), so the bracket's end is unaffected.
// Every row prints its ops/blits count so the reader can size the overhead
// itself (tens of ops per repaint => well under 10us of wrapper time). The patch
// is on the PROTOTYPE, so every 2D canvas in the app pays one identity compare
// per wrapped op; the thumbnails and palette grids are not on any hot path here,
// and the compare short-circuits on `cur` being null outside a repaint.
//
// ---------------------------------------------------------------- anti-vacuous
// Every row that could produce a plausible number against nothing is guarded:
//   p1  a REAL aeon project is open, with sections > 0, and the Layout facet has
//       mounted a real #map-canvas.
//   p2  that canvas is non-zero-sized and has ACTUALLY PAINTED ART — sampled
//       pixels, >= 5% non-black/non-void and >= 16 distinct colours. (This repo
//       once "passed" a stamp-ghost check against a legitimately blank chunk;
//       a flat fill will not satisfy the distinct-colour bar.)
//   p3  the probe is bound to the live element, and a forced pan produced a
//       repaint carrying at least one BLIT — a repaint that only cleared the
//       canvas is discarded, never timed.
//   2*  every timing cell needs >= 30 qualifying repaints AND >= 3 distinct
//       timing values. One frozen number repeated 40 times is a broken clock,
//       not a stable measurement.
//   3   cross-cell tripwire: if the median is effectively IDENTICAL across a 16x
//       zoom range, an overlay toggle and a window resize, the row FAILS and
//       says the instrument is the first suspect, not the mechanism.
//
// ------------------------------------------------------------------- the rows
//   p1 p2 p3  preconditions (above)
//   1a        idle window, early — REPORTED only (async loads may still land)
//   1b        a pan repaints
//   1c        a zoom change repaints
//   1d        a real View-menu overlay toggle repaints
//   1e        a real stamp edit repaints — and its cost is reported SEPARATELY
//             as the dirty-flush regime (NOT the palette regime; see note 5b)
//   1f        idle window, late: the page's own frame loop is ticking (>= 100
//             rAF ticks in 5s) and MapViewport repaints EXACTLY ZERO times.
//             This is the finding: there is no clock on this viewport.
//   2a-2f     repaint cost distributions across zoom, overlays and window size
//   3         suspicious-constant tripwire
//   4         headroom vs a 16.7ms frame: ASSERTS worst p95 < 16.7ms, REPORTS
//             the percentage for every cell
//   5         regime notes — including, verbatim, what this instrument CANNOT
//             distinguish
//
// EXECUTION ORDER IS NOT ROW ORDER, on purpose: the timing cells (2*) run before
// 1e and 1f. 1e writes the document, which would put a dirty flush into every
// later cell's tail; 1f needs a quiet app, which it cannot have while cells are
// panning. Read the output by row id, not top to bottom.
//
// Usage:
//   VITE_AURORA_DEBUG=1 npm run build
//   node scratchpad/mapviewport-baseline-harness.mjs        (VERBOSE=1 for app logs)

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9427);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // this worktree
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const AEON_DIR = '/home/volence/sonic_hacks/aeon';               // OPEN ONLY — never saved
const SHOTS = join(ROOT, 'scratchpad/shots-mapviewport-baseline');
mkdirSync(SHOTS, { recursive: true });

const FRAME_MS = 1000 / 59.92275;   // 16.6881ms — one NTSC Mega Drive frame
const T_START = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const upt = () => `${((Date.now() - T_START) / 1000).toFixed(1)}s`;

const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
function note(id, text) { console.log(`NOTE  [${id}] ${text}`); }
function report(text) { console.log(`      ${text}`); }

// ----------------------------------------------------------------- CDP plumbing
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
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  const exceptions = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description ?? d.text ?? '(unknown)');
    }
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
  return {
    ready, send, evalExpr, exceptions,
    json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)),
    close: () => ws.close(),
  };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}
async function key(c, k, code) {
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
}
async function mouse(c, type, x, y) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left',
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
  });
}
const clickEl = (c, finderExpr) => c.evalExpr(`(() => { const e = ${finderExpr}; if (!e) return false; e.click(); return true; })()`);

/**
 * Toggle one View-menu overlay through the REAL menu (open, click the checkbox
 * label, close by clicking the menu button again — Menu.tsx only closes on an
 * outside mousedown or a second button click, and there is no viewStore door on
 * __dbg for overlays). Returns the checkbox's state after the click.
 */
async function toggleOverlay(c, labelText) {
  const VIEWBTN = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('View'))`;
  const LABEL = `[...document.querySelectorAll('label')].find((l) => l.textContent.trim() === ${JSON.stringify(labelText)})`;
  if (!(await clickEl(c, VIEWBTN))) throw new Error('View menu button not found');
  await sleep(250);
  if (!(await clickEl(c, LABEL))) throw new Error(`'${labelText}' not in the open View menu`);
  await sleep(250);
  const checked = await c.evalExpr(`(() => { const l = ${LABEL}; return l ? l.querySelector('input').checked : null; })()`);
  await clickEl(c, VIEWBTN);            // close it again
  await sleep(500);
  return checked;
}

// ------------------------------------------------------------- the probe itself
//
// Installed BY THE HARNESS, into the page, around the component. MapViewport is
// not modified and reports nothing about itself.
const INSTALL_PROBE = String.raw`
(() => {
  if (window.__mvProbe) return 'already-installed';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';

  const P = {
    canvas: cv,
    pageOriginWall: Date.now() - performance.now(),
    repaints: [],          // { at, ms, toFirstOpMs, ops, blits }
    ticks: 0,
    ticking: false,
  };
  window.__mvProbe = P;

  P.mark = () => P.repaints.length;
  P.since = (n) => P.repaints.slice(n);
  /** Is the probe still bound to the element React currently has mounted? */
  P.bound = () => P.canvas === document.getElementById('map-canvas');
  P.rebind = () => { const el = document.getElementById('map-canvas'); if (el) P.canvas = el; return !!el; };
  /** Page uptime + wall clock, so every timing figure can carry both. */
  P.clock = () => ({ pageUptimeS: performance.now() / 1000, wall: new Date().toISOString() });

  // The page's OWN frame loop, owned by the harness. It exists so the idle rows
  // can tell "MapViewport did not repaint" apart from "the renderer is dead".
  const tick = () => { if (P.ticking) { P.ticks++; requestAnimationFrame(tick); } };
  P.startTicks = () => { if (!P.ticking) { P.ticking = true; requestAnimationFrame(tick); } };
  P.stopTicks = () => { P.ticking = false; };

  let cur = null;

  // --- repaint START: canvas.width assignment (MapViewport.tsx:536 / :587) ---
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true,
    enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) {
      if (this === P.canvas) {
        const rec = { t0: performance.now(), first: 0, last: 0, ops: 0, blits: 0 };
        cur = rec;
        // Closes AFTER the whole synchronous task — i.e. after every draw the
        // effect issues. Nothing inside the component participates.
        queueMicrotask(() => {
          if (rec.ops > 0) {
            P.repaints.push({
              at: rec.t0, ms: rec.last - rec.t0, toFirstOpMs: rec.first - rec.t0,
              ops: rec.ops, blits: rec.blits,
            });
            if (P.repaints.length > 8000) P.repaints.splice(0, 4000);
          }
          if (cur === rec) cur = null;
        });
      }
      return wd.set.call(this, v);
    },
  });

  // --- repaint END: the last coarse 2D op against #map-canvas ---------------
  const proto = CanvasRenderingContext2D.prototype;
  const BLIT = { drawImage: 1, putImageData: 1 };
  for (const name of ['drawImage', 'putImageData', 'fillRect', 'strokeRect',
                      'clearRect', 'stroke', 'fill', 'fillText', 'strokeText']) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    proto[name] = function patched(...args) {
      const r = orig.apply(this, args);
      const rec = cur;
      if (rec && this.canvas === P.canvas) {
        const now = performance.now();
        if (rec.ops === 0) rec.first = now;
        rec.ops++;
        if (BLIT[name]) rec.blits++;
        rec.last = now;
      }
      return r;
    };
  }
  return 'installed';
})()`;

// Does the map canvas actually hold PAINTED ART right now? A flat fill, a void
// clear or a zero-size canvas all fail this.
const CONTENT_PROBE = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return { ok: false, why: 'no #map-canvas' };
  const w = cv.width, h = cv.height;
  if (!w || !h) return { ok: false, why: 'zero-size canvas', w: w, h: h };
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, w, h).data;
  const total = w * h;
  const step = Math.max(1, Math.floor(total / 120000));
  let sampled = 0, nonBlack = 0, nonVoid = 0;
  const colors = new Set();
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    sampled++;
    const isBlack = (r | g | b) === 0;                       // CANVAS_BLACK
    const isVoid = (r === 0x0A && g === 0x0C && b === 0x12);  // CANVAS_VOID
    if (!isBlack) nonBlack++;
    if (!isBlack && !isVoid) {
      nonVoid++;
      if (colors.size < 5000) colors.add((r << 16) | (g << 8) | b);
    }
  }
  return {
    ok: true, w: w, h: h, sampled: sampled, nonBlack: nonBlack, nonVoid: nonVoid,
    nonVoidFrac: nonVoid / sampled, distinctColors: colors.size,
  };
})()`;

// --------------------------------------------------------------------- stats
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return { n: 0 };
  const q = (p) => s[Math.max(0, Math.min(s.length - 1, Math.round(p * (s.length - 1))))];
  return {
    n: s.length, min: s[0], p25: q(0.25), med: q(0.5), p75: q(0.75), p95: q(0.95),
    max: s[s.length - 1], mean: s.reduce((a, b) => a + b, 0) / s.length,
    distinct: new Set(s.map((v) => v.toFixed(4))).size,
  };
}
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');
function fmt(st) {
  return `n=${st.n} min ${f2(st.min)} / med ${f2(st.med)} / p95 ${f2(st.p95)} / max ${f2(st.max)} ms`
    + `  (p25 ${f2(st.p25)}, p75 ${f2(st.p75)}, mean ${f2(st.mean)}, ${st.distinct} distinct values)`;
}

/**
 * One pan, awaited to the far side of two real frames so React's passive effect
 * has run and the draw has finished. The setTimeout is a WATCHDOG, not the
 * normal path: if rAF were throttled to nothing the two-frame await would hang
 * forever and every cell would time out instead of failing with a reason. Row 1f
 * is the row that actually asserts the frame loop is alive.
 */
async function panTo(c, x, y, zoom) {
  await c.evalExpr(`(async () => {
    window.__dbg.setView(${x}, ${y}, ${zoom});
    await Promise.race([
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      new Promise((r) => setTimeout(r, 250)),
    ]);
    return 1;
  })()`);
}

const BASE = { x: 96, y: 64 };
/** Distinct camera positions — setView is a no-op for the effect if vpX/vpY/zoom
 *  all repeat, because the deps are primitives. */
const panXY = (i) => ({ x: BASE.x + ((i * 53) % 977), y: BASE.y + ((i * 31) % 613) });

/**
 * Measure one cell of the matrix: N real pans at a fixed zoom/overlay/window
 * configuration. Returns the distribution plus the shape evidence (ops, blits,
 * canvas size) that says WHAT was measured.
 */
async function measureCell(c, label, zoom, n = 40) {
  // Warm-up pans first: the repaint immediately after an act load or an overlay
  // toggle can carry a dirty flush, which is a different regime and would sit in
  // the tail of a steady-state distribution as a phantom outlier.
  for (let i = 0; i < 5; i++) { const p = panXY(i + 900); await panTo(c, p.x, p.y, zoom); }
  const mark = await c.evalExpr('window.__mvProbe.mark()');
  for (let i = 0; i < n; i++) { const p = panXY(i); await panTo(c, p.x, p.y, zoom); }
  const recs = await c.json(`window.__mvProbe.since(${mark})`);
  const size = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);
  const clock = await c.json('window.__mvProbe.clock()');
  const qualifying = recs.filter((r) => r.blits > 0);
  const st = stats(qualifying.map((r) => r.ms));
  const blits = stats(qualifying.map((r) => r.blits));
  const ops = stats(qualifying.map((r) => r.ops));
  const cell = { label, zoom, size, st, blits, ops, recs: recs.length, qualifying: qualifying.length, clock };
  report(`[cell ${label}] zoom ${zoom}  canvas ${size.w}x${size.h}  `
    + `uptime ${upt()} (page ${clock.pageUptimeS.toFixed(1)}s, wall ${clock.wall})`);
  report(`[cell ${label}] repaint cost: ${fmt(st)}`);
  report(`[cell ${label}] shape: ${qualifying.length}/${recs.length} repaints carried a blit; `
    + `blits/repaint med ${blits.med} (min ${blits.min}, max ${blits.max}); `
    + `wrapped ops/repaint med ${ops.med} (max ${ops.max})`);
  report(`[cell ${label}] headroom: p95 is ${((st.p95 / FRAME_MS) * 100).toFixed(1)}% of a ${FRAME_MS.toFixed(2)}ms frame; `
    + `median ${((st.med / FRAME_MS) * 100).toFixed(1)}%`);
  return cell;
}

function assertCell(cell) {
  const L = cell.label;
  check(`2${L}-n`, `cell ${L}: at least 30 repaints with a real blit were timed`,
    cell.qualifying >= 30, `qualifying=${cell.qualifying} of ${cell.recs} recorded`);
  // A single value repeated is a frozen/quantised clock, not a stable cost.
  check(`2${L}-d`, `cell ${L}: the timings are not one frozen number (>= 3 distinct values)`,
    (cell.st.distinct ?? 0) >= 3, `distinct=${cell.st.distinct} over n=${cell.st.n}`);
}

// -------------------------------------------------------------------- the run
async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS.
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);

  let app = null, c = null;
  const cells = [];
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

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
    await sleep(3000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // ---- p1: a REAL aeon project, a REAL MapViewport -----------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON_DIR)})`);
    await sleep(1500);
    let st0 = null;
    for (let i = 0; i < 40; i++) {
      st0 = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st0 && st0.open) break;
      await sleep(400);
    }
    await c.evalExpr(`window.__dbg.activate(${JSON.stringify(st0?.zone)}, ${JSON.stringify(st0?.act)})`);
    await sleep(1200);
    const layout = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Layout');
      if (!b) return 'no-pill'; b.click(); return 'clicked';
    })()`);
    await sleep(1500);
    const hasMap = await c.evalExpr('!!document.getElementById("map-canvas")');
    check('p1', 'a real aeon project is open (sections > 0) and the Layout facet mounted a real #map-canvas',
      !!st0 && st0.open === true && st0.sections > 0 && layout === 'clicked' && hasMap === true,
      `state=${JSON.stringify(st0)} layoutPill=${layout} mapCanvas=${hasMap}  uptime ${upt()}`);
    if (!hasMap) throw new Error('no #map-canvas — every row below would be vacuous');

    await panTo(c, BASE.x, BASE.y, 1);
    await sleep(1200);            // let object sprites / collision profiles land
    await shot(c, '0-aeon-layout');

    // ---- p2: the canvas is actually holding painted art --------------------
    const content = await c.json(CONTENT_PROBE);
    check('p2', 'the map canvas is non-zero-sized and holds REAL painted art (not a flat fill, not the void)',
      content.ok === true && content.w > 200 && content.h > 200
        && content.nonVoidFrac >= 0.05 && content.distinctColors >= 16,
      `canvas ${content.w}x${content.h}, sampled ${content.sampled}px, `
      + `non-void ${(100 * (content.nonVoidFrac ?? 0)).toFixed(1)}%, ${content.distinctColors} distinct colours`);

    // ---- p3: the probe is live, bound, and sees blits -----------------------
    const installed = await c.evalExpr(INSTALL_PROBE);
    const probeMark = await c.evalExpr('window.__mvProbe.mark()');
    await panTo(c, BASE.x + 137, BASE.y + 61, 1);
    const firstRecs = await c.json(`window.__mvProbe.since(${probeMark})`);
    const bound = await c.evalExpr('window.__mvProbe.bound()');
    check('p3', 'the external probe is installed, bound to the LIVE #map-canvas, and recorded a pan repaint that carried a blit',
      installed === 'installed' && bound === true
        && firstRecs.length >= 1 && firstRecs.some((r) => r.blits > 0),
      `install=${installed} bound=${bound} records=${JSON.stringify(firstRecs)}  uptime ${upt()}`);

    // ---- 1a: idle window, EARLY (reported, not asserted) --------------------
    // Async project work (object sprites, collision profiles) can still be
    // landing this soon after an open, and each landing legitimately repaints.
    // Reported so a non-zero late window has something to be compared against.
    await c.evalExpr('window.__mvProbe.ticks = 0; window.__mvProbe.startTicks()');
    const idleMark0 = await c.evalExpr('window.__mvProbe.mark()');
    await sleep(5000);
    const idle0 = (await c.json(`window.__mvProbe.since(${idleMark0})`)).length;
    const ticks0 = await c.evalExpr('window.__mvProbe.ticks');
    await c.evalExpr('window.__mvProbe.stopTicks()');
    note('1a', `idle window (early, 5s, no interaction): ${idle0} MapViewport repaints, `
      + `${ticks0} rAF ticks in the page. REPORTED ONLY — row 1f is the asserted one.  uptime ${upt()}`);

    // ---- 1b/1c: pan and zoom repaint ---------------------------------------
    let m = await c.evalExpr('window.__mvProbe.mark()');
    await panTo(c, BASE.x + 211, BASE.y + 97, 1);
    const panRecs = await c.json(`window.__mvProbe.since(${m})`);
    check('1b', 'a PAN (vpX/vpY change through the real view store) triggers a repaint',
      panRecs.length >= 1 && panRecs.some((r) => r.blits > 0),
      `${panRecs.length} repaint(s): ${JSON.stringify(panRecs)}  uptime ${upt()}`);

    m = await c.evalExpr('window.__mvProbe.mark()');
    await panTo(c, BASE.x + 211, BASE.y + 97, 2);
    const zoomRecs = await c.json(`window.__mvProbe.since(${m})`);
    check('1c', 'a ZOOM change triggers a repaint',
      zoomRecs.length >= 1 && zoomRecs.some((r) => r.blits > 0),
      `${zoomRecs.length} repaint(s): ${JSON.stringify(zoomRecs)}  uptime ${upt()}`);
    await panTo(c, BASE.x, BASE.y, 1);

    // ---- 1d: a real overlay toggle repaints ---------------------------------
    m = await c.evalExpr('window.__mvProbe.mark()');
    let gridOn = null;
    try { gridOn = await toggleOverlay(c, 'Tile Grid'); } catch (e) { note('1d', `View-menu toggle threw: ${e.message}`); }
    const ovRecs = await c.json(`window.__mvProbe.since(${m})`);
    check('1d', "a real View-menu overlay toggle ('Tile Grid') triggers a repaint",
      gridOn === true && ovRecs.length >= 1 && ovRecs.some((r) => r.blits > 0),
      `checkbox=${gridOn} ${ovRecs.length} repaint(s)  uptime ${upt()}`);

    // ---- 2e uses the grid-on state before we put it back --------------------
    if (gridOn === true) {
      cells.push(await measureCell(c, 'e', 1));
      cells[cells.length - 1].desc = 'zoom 1, Tile Grid overlay ON (a full-viewport line pass)';
      try {
        const off = await toggleOverlay(c, 'Tile Grid');
        check('1d2', "'Tile Grid' toggles back OFF", off === false, `checkbox=${off}`);
      } catch (e) { note('1d2', `could not restore Tile Grid: ${e.message}`); }
    } else {
      note('2e', 'NOT MEASURED: the Tile Grid overlay never switched on, so the '
        + '"extra full-viewport overlay pass" cell has no subject. Do NOT read its absence as "free".');
    }

    // ---- 2a..2d: the zoom sweep ---------------------------------------------
    for (const [label, zoom, desc] of [
      ['a', 1, 'zoom 1 (default), default overlays'],
      ['b', 2, 'zoom 2, default overlays'],
      ['c', 4, 'zoom 4, default overlays — fewest sections in view'],
      ['d', 0.25, 'zoom 0.25, default overlays — most sections in view'],
    ]) {
      const cell = await measureCell(c, label, zoom);
      cell.desc = desc;
      cells.push(cell);
    }

    // ---- 2f: a different window size ----------------------------------------
    // PROVISIONAL: Emulation.setDeviceMetricsOverride is a standard CDP call but
    // has not been exercised against this Electron build in this repo. If it does
    // not actually change the canvas, the cell is dropped rather than reported.
    let sizeChanged = false;
    const sizeBefore = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);
    try {
      await c.send('Emulation.setDeviceMetricsOverride', {
        width: 900, height: 620, deviceScaleFactor: 1, mobile: false,
      });
      await sleep(1200);
      const sizeAfter = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);
      sizeChanged = sizeAfter.w !== sizeBefore.w || sizeAfter.h !== sizeBefore.h;
      if (sizeChanged) {
        const cell = await measureCell(c, 'f', 1);
        cell.desc = `zoom 1, SMALLER window (${sizeAfter.w}x${sizeAfter.h} vs ${sizeBefore.w}x${sizeBefore.h})`;
        cells.push(cell);
      }
    } catch (e) {
      note('2f', `Emulation.setDeviceMetricsOverride threw: ${e.message}`);
    } finally {
      try { await c.send('Emulation.clearDeviceMetricsOverride'); } catch { /* */ }
      await sleep(1000);
    }
    if (!sizeChanged) {
      note('2f', 'NOT MEASURED: the window-size axis could not be varied from CDP '
        + `(canvas stayed ${sizeBefore.w}x${sizeBefore.h}). The viewport-size dependence of a repaint is therefore UNMEASURED — `
        + 'the zoom cells vary world area, not canvas pixels.');
    }

    // ---- rows 2*: per-cell integrity ----------------------------------------
    for (const cell of cells) assertCell(cell);

    // ---- 3: suspicious-constant tripwire ------------------------------------
    if (cells.length >= 2) {
      const meds = cells.map((x) => x.st.med);
      const lo = Math.min(...meds), hi = Math.max(...meds);
      const spread = lo > 0 ? (hi - lo) / lo : 0;
      const blitMeds = cells.map((x) => x.blits.med);
      report(`[3] medians across ${cells.length} cells: ${meds.map(f2).join(' / ')} ms  `
        + `(labels ${cells.map((x) => x.label).join('/')}), spread ${(spread * 100).toFixed(1)}%  uptime ${upt()}`);
      report(`[3] blits/repaint medians: ${blitMeds.join(' / ')} — if these are all equal across a 16x zoom range, `
        + 'the viewport culling is not varying and the cost has nothing to vary WITH.');
      check('3', 'repaint cost is NOT a suspiciously clean constant across zoom / overlays / window size',
        spread >= 0.02,
        spread >= 0.02
          ? `spread ${(spread * 100).toFixed(1)}% between ${f2(lo)}ms and ${f2(hi)}ms`
          : `medians agree to within ${(spread * 100).toFixed(2)}% across every varied input. `
            + 'TREAT THIS AS AN INSTRUMENT CONFOUND FIRST: check that the bracket is really closing on the last '
            + 'op (ops/repaint above should differ between cells), that the pans really changed vpX/vpY/zoom, and '
            + 'that performance.now() is not coarsened. Only after those are cleared is "the cost is genuinely '
            + 'dominated by a fixed blit" a permitted reading.');
    } else {
      note('3', 'NOT MEASURED: fewer than two cells produced data, so there is nothing to compare.');
    }

    // ---- 4: headroom ---------------------------------------------------------
    if (cells.length) {
      const worst = cells.reduce((a, b) => (b.st.p95 > a.st.p95 ? b : a));
      for (const cell of cells) {
        report(`[4] ${cell.label} (${cell.desc}): median ${f2(cell.st.med)}ms = `
          + `${((cell.st.med / FRAME_MS) * 100).toFixed(1)}% of a frame; p95 ${f2(cell.st.p95)}ms = `
          + `${((cell.st.p95 / FRAME_MS) * 100).toFixed(1)}%; max ${f2(cell.st.max)}ms`);
      }
      check('4', `one repaint fits inside one ${FRAME_MS.toFixed(2)}ms frame at p95, in EVERY measured configuration`,
        worst.st.p95 < FRAME_MS,
        `worst cell ${worst.label} (${worst.desc}): p95 ${f2(worst.st.p95)}ms = `
        + `${((worst.st.p95 / FRAME_MS) * 100).toFixed(1)}% of a frame; `
        + `headroom left ${f2(FRAME_MS - worst.st.p95)}ms  uptime ${upt()}`);
    }

    // ---- 1e: the dirty-flush regime, via a REAL stamp edit --------------------
    // A repaint that must flush dirty section tiles is a DIFFERENT regime from a
    // pan: SectionRenderer.render() calls flushAllDirty() first (SectionRenderer.ts:387).
    // Driven by the real tool + a real click; if the stamp cannot be armed, the
    // regime is declared NOT MEASURED rather than substituted for.
    let edited = false;
    try {
      // Focus the map first so the level key handler is the one that sees 'k'.
      // The default tool is 'view' (editorStore.ts:268), so this click edits nothing.
      const focusRect = await c.json(`document.getElementById('map-canvas').getBoundingClientRect().toJSON()`);
      const fx = Math.round(focusRect.left + focusRect.width * 0.6);
      const fy = Math.round(focusRect.top + focusRect.height * 0.6);
      await mouse(c, 'mousePressed', fx, fy);
      await mouse(c, 'mouseReleased', fx, fy);
      await sleep(300);
      await key(c, 'k', 'KeyK');            // MapViewport.tsx:814 — 'k' arms 'stamp-chunk'
      await sleep(700);
      const tool = (await c.json('window.__dbg.aeon.state()')).tool;
      const picked = await c.evalExpr(`(() => {
        const cells = [...document.querySelectorAll('[title]')].filter((e) => /chunk/i.test(e.getAttribute('title') || ''));
        if (!cells.length) return false; cells[cells.length - 1].click(); return true;
      })()`);
      await sleep(600);
      const armed = await c.evalExpr('window.__dbg.aeon.selectedChunk()');
      const rect = await c.json(`document.getElementById('map-canvas').getBoundingClientRect().toJSON()`);
      if (tool === 'stamp-chunk' && picked === true && armed) {
        const px = Math.round(rect.left + rect.width * 0.4);
        const py = Math.round(rect.top + rect.height * 0.4);
        await mouse(c, 'mouseMoved', px, py); await sleep(300);
        const editMark = await c.evalExpr('window.__mvProbe.mark()');
        await mouse(c, 'mousePressed', px, py);
        await mouse(c, 'mouseReleased', px, py);
        await sleep(900);
        const editRecs = (await c.json(`window.__mvProbe.since(${editMark})`)).filter((r) => r.blits > 0);
        edited = editRecs.length >= 1;
        const est = stats(editRecs.map((r) => r.ms));
        check('1e', 'a real EDIT (stamp click) triggers a repaint',
          edited, `${editRecs.length} repaint(s), tool=${tool}, chunk=${armed}  uptime ${upt()}`);
        if (edited) {
          report(`[1e] dirty-flush regime: ${fmt(est)}  (${est.n} repaints, `
            + `${((est.max / FRAME_MS) * 100).toFixed(1)}% of a frame at the max)  uptime ${upt()}`);
          note('5b', 'THIS IS NOT THE PALETTE REGIME. A stamp dirties a few hundred cells, which stays under '
            + `SectionRenderer's RECOMPOSE_DIRTY_THRESHOLD (2000, SectionRenderer.ts:13) and takes the per-cell `
            + 'flush path. A palette change invalidates every section canvas and takes the full-recompose path, '
            + 'which this harness does NOT measure — there is no CDP door onto a palette edit that does not mean '
            + 'driving the palette editor UI. Palette cycling cost stays UNMEASURED.');
        }
      } else {
        note('1e', `NOT MEASURED: the stamp could not be armed (tool=${tool} thumbnailClicked=${picked} chunk=${armed}). `
          + 'The dirty-flush repaint regime is therefore unmeasured; the cells above are steady-state pans only.');
      }
    } catch (e) {
      note('1e', `NOT MEASURED: the stamp path threw (${e.message}). The dirty-flush regime is unmeasured.`);
    }
    await shot(c, '1-after-cells');

    // ---- 1f: THE ROW. Idle, late, with the page provably still ticking --------
    // Settle first: a stamp queues async work (thumbnail rebuilds, autosave
    // bookkeeping) whose landing is a LEGITIMATE repaint. Letting it land before
    // the window opens is the difference between measuring "no clock" and
    // measuring "the previous row's tail".
    await sleep(3000);
    await c.evalExpr('window.__mvProbe.ticks = 0; window.__mvProbe.startTicks()');
    const idleMark = await c.evalExpr('window.__mvProbe.mark()');
    const idleT0 = Date.now();
    await sleep(5000);
    const idleWallS = (Date.now() - idleT0) / 1000;
    const idleRecs = await c.json(`window.__mvProbe.since(${idleMark})`);
    const ticks = await c.evalExpr('window.__mvProbe.ticks');
    const stillBound = await c.evalExpr('window.__mvProbe.bound()');
    const rootAlive = await c.evalExpr('(document.getElementById("root")?.childElementCount ?? 0) > 0');
    await c.evalExpr('window.__mvProbe.stopTicks()');
    check('1f', 'with the page STILL PAINTING FRAMES and nothing touched, MapViewport repaints exactly ZERO times '
      + '— aeon\'s viewport has no clock',
      idleRecs.length === 0 && ticks >= 100 && stillBound === true && rootAlive === true,
      `${idleRecs.length} repaints over ${idleWallS.toFixed(1)}s idle; ${ticks} rAF ticks in the same window `
      + `(${(ticks / idleWallS).toFixed(0)}/s); probe still bound=${stillBound}; React root alive=${rootAlive}`
      + `${idleRecs.length ? `; repaints=${JSON.stringify(idleRecs.slice(0, 5))}` : ''}  uptime ${upt()}`);

    // ---- 5: what this instrument can and cannot say --------------------------
    console.log('\n--- REGIME -------------------------------------------------------------');
    note('5a', 'WHAT ROW 1f DOES NOT SETTLE. It shows that MapViewport repaints only when its React deps change '
      + '(pan / zoom / overlay / edit) and never on a clock. It CANNOT distinguish "there is no loop because this '
      + 'viewport needs none" from "there is no loop and one would have to be ADDED for animated effects": nothing '
      + 'in the aeon viewport currently animates, so the two hypotheses predict the identical observation — zero '
      + 'idle repaints. Deciding between them is a design question, not a measurement this instrument can make.');
    note('5c', 'WHAT THE COST NUMBER IS. The bracket runs from `canvas.width = ...` (the draw effect\'s first '
      + 'statement) to the return of the last coarse 2D op on #map-canvas in the same task. It INCLUDES the dirty '
      + 'flush, the section blits and the whole OverlayRenderer pass; it EXCLUDES React\'s render/commit, the '
      + 'compositor, GPU upload, and the sibling collision-preview canvas. It is paint work, not frame-to-photon '
      + 'latency, so the headroom figures in row 4 are an UPPER bound on available headroom, not a lower one.');
    note('5d', 'WHAT A PER-LINE PASS WOULD COST IS NOT MEASURED HERE. Row 2e (Tile Grid ON) is the closest '
      + 'available analogue — one extra full-viewport line pass — and the delta between cell 2a and cell 2e is the '
      + 'only per-pass evidence in this run. A 224-line effects pass is a different shape of work and must be '
      + 'measured on its own once a prototype exists.');
    if (!edited) {
      note('5e', 'The dirty-flush regime went UNMEASURED this run (see 1e), so the numbers above describe pans '
        + 'over already-composed sections only.');
    }
    console.log('------------------------------------------------------------------------\n');

    if (c.exceptions.length) {
      console.log(`renderer exceptions during the run: ${c.exceptions.length}`);
      for (const e of c.exceptions.slice(0, 5)) console.log(`  ${e.split('\n')[0]}`);
    }
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) {
      try { process.kill(-app.pid, 'SIGKILL'); } catch { try { process.kill(app.pid, 'SIGKILL'); } catch { /* gone */ } }
    }
    await sleep(1200);
    console.log(`port free after teardown: ${await portFree()}   total uptime ${upt()}`);
  }

  console.log(`\n${results.length - fails.length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
