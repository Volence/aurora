#!/usr/bin/env node
// DOES THE MAP'S CLEAR COVER THE WHOLE MAP CANVAS?
//
// docs/reviews/2026-09-12-dpr-guides-offset.md section 9 TAGGED this and did not fix it:
// MapViewport's `redraw` clears for the CAMERA PREVIEW COMPOSITE with
//
//     ctx.fillRect(0, 0, rect.width, rect.height)        // the CONTAINER's CSS rect
//
// while the backing store it is clearing is `round(rect * dpr)` device pixels under
// `setTransform(dpr, 0, 0, dpr, 0, 0)`, so the surface the transform maps onto is
// `canvas.width / dpr` CSS px — which is what every SIBLING clear in the same file already
// uses (`cssWidth, cssHeight` on the no-act path, `w / dpr, h / dpr` in
// `drawCollisionPreview`, and `viewport.width/height` in `SectionRenderer.render`, which
// MapViewport builds out of `cssWidth/cssHeight`).
//
// ═══ THE ARITHMETIC, DERIVED FROM SOURCE, WHICH IS WHERE EVERY EXPECTATION HERE COMES FROM
//
// Let  x = rect.width * dpr  and  W = canvas.width = Math.round(x).
//
//   * `fillRect(0, 0, cssWidth, …)` covers exactly [0, W) device px: full coverage, always.
//   * `fillRect(0, 0, rect.width, …)` covers [0, x) device px.
//       - x > W  (frac(x) < 0.5): it OVERSHOOTS and the canvas clips it. Identical.
//       - x = W  (frac(x) = 0):   identical.
//       - x < W  (frac(x) >= 0.5): the LAST device column, index W - 1, is covered
//                                  frac(x) of the way across. The deficit is W - x.
//
// The same holds independently for the height. So the defect is present exactly when
// `frac(rect * dpr) >= 0.5` in an axis, and its size there is `1 - frac`. THAT is what
// this harness computes per geometry, and it refuses to read a geometry with no deficit as
// evidence of anything (rows `.2x` and `9a`).
//
// ═══ WHAT IS MEASURED, AND WHY IT IS AN ALPHA
//
// Assigning `canvas.width` RESETS the backing store to transparent black — so on every
// pass, the clear is the first ink on an empty surface. `CANVAS_BLACK` is `#000000`,
// opaque, so a fully covered device pixel ends at alpha 255 and a partly covered one at
// alpha ≈ 255 * coverage (Skia antialiases the rect's fractional edge; the previous
// parcel's row .10 read 154 where this arithmetic predicts 153.0, and 156 where it
// predicts 155.3).
//
// Nothing in the map canvas's draw path lowers alpha again: there is no
// `globalCompositeOperation` anywhere in `src/`, and every `clearRect` in the renderer is
// on an OFFSCREEN canvas or on the separate `map-preview-canvas`. So the invariant this
// harness asserts is derived, not observed:
//
//     AFTER A FULL REDRAW, EVERY PIXEL OF #map-canvas HAS ALPHA 255.
//
// It holds for the composite-OFF path already (`SectionRenderer.render`'s `clearBackground`
// arm, whose extent is `viewport.width` = `cssWidth`), which is why the composite-off scan
// is carried in every geometry as the CONTROL: it is the same scan, over the same surface,
// in the one state where the change under test does nothing.
//
// ═══ THE GEOMETRIES
//
//   N   native      whatever the launch produced. SCALE=<f> passes
//                   `--force-device-scale-factor=<f>`; the phase says whether it TOOK.
//   E   emulated    `Emulation.setDeviceMetricsOverride` at EMULATE (default 1.35).
//   I*  imposed     the same window with the map CONTAINER given an explicit fractional
//                   CSS width and height (`flex: none; width: <n>.5px`). This is a
//                   geometry the harness IMPOSES, and it is labelled as one everywhere it
//                   appears: it exists to answer the dpr-1 half of the question, because
//                   a container rect at dpr 1 is integral in every geometry this window
//                   produces on its own, and `frac(rect) >= 0.5` is the only state in
//                   which the two spellings can differ there.
//
// Every geometry is one of three CLASSES (`classOf`), and every row says which, because a
// green row means different things in each: `exercises` (a deficit the rasteriser resolves
// — the only class in which row .2 is evidence), `sub-raster` (a positive deficit below
// that, measured), and `overshoots` (no positive deficit, so the two spellings cannot
// differ at all). Row 9a fails a run in which no geometry exercised the defect.
//
// Every row prints dpr, the container rect, the backing store and the derived deficit, and
// no claim is read across two runs.
//
// ⚠ IT WRITES NOTHING in the aeon tree: no save, no Ctrl+S, no scene authored. It opens a
// COPY (AEON_DIR), never the live tree.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Build:  VITE_AURORA_DEBUG=1 npm run build   (in the tree the run is against)
// ═══ PIXEL IDENTITY BETWEEN TWO BUILDS
//
// `SCAN_OUT=<json>` writes this run's per-geometry backing-store hashes (composite on and
// off). `SCAN_BASELINE=<that json>` on a run of ANOTHER build adds an `.I2` row per
// geometry comparing them. That is how "identical at dpr 1" is SHOWN rather than argued,
// and it is why every geometry also carries a determinism row (`.I1`): a hash that moved
// between two reads of one paint would make a cross-build difference unreadable.
//
// Run:    AEON_DIR=<copy> [SCALE=1.35] [EMULATE=1.35] [TAG=<name>] [SWEEP=1]
//         [SCAN_OUT=<json>] [SCAN_BASELINE=<json>]
//         node scratchpad/mapviewport-clear-size-harness.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as os from 'node:os';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9451);
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
const SWEEP = process.env.SWEEP === '1';
/** Where this run WRITES its per-geometry hashes, for another build to be compared against. */
const SCAN_OUT = process.env.SCAN_OUT ?? null;
/** A file written by SCAN_OUT on another build. Every geometry then gets an `.I2` row. */
const SCAN_BASELINE = process.env.SCAN_BASELINE ?? null;
const TAG = process.env.TAG ?? `run${Date.now()}`;
const SHOTS = `${ROOT}/scratchpad/shots-mapviewport-clear-size`;
mkdirSync(SHOTS, { recursive: true });

/** The fixture scene with a BG plane, so the camera preview composite is ACTIVE on it. */
const FIXTURE_SCENE = 'ojz_act1_floor';
/**
 * How partial the last device column must be before a geometry counts as EXERCISING the
 * defect — which is NOT the same question as whether the defect is arithmetically there.
 *
 * ⚠ THE RASTERISER DOES NOT RESOLVE AN ARBITRARILY SMALL DEFICIT, and that was measured
 * here, not assumed. Run master-real geometry I025 left a HEIGHT deficit of 0.0625 device
 * px — the arithmetic predicts alpha 239 along the last row — and the scan found ZERO
 * pixels below alpha 255 over the whole store. So a geometry with a small positive deficit
 * would go GREEN on master's own code, and reading that as "the clear is right" is the
 * failure mode this constant exists to prevent.
 *
 * 0.25 is the SMALLEST deficit this repo has measured producing partial coverage (run
 * master-final geometry I075, deficit 0.25, last column alpha 192 against the arithmetic's
 * 191). The true threshold is somewhere in (0.0625, 0.25]; geometries at 0.125 and 0.0625
 * are carried below as the `sub-raster` class precisely so each run says where it is,
 * rather than this number standing on one observation forever.
 */
const MIN_DEFICIT = 0.25;

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

const SUBTAB = (id) => `document.querySelector('[data-effects-sub-tab="${id}"]')`;

/**
 * The deficit this geometry leaves on one axis, FROM SOURCE: `canvas.width` is
 * `Math.round(rect.width * dpr)`, and the container-rect spelling covers `rect.width * dpr`.
 * Positive = device px of the last column the container-rect clear does not reach.
 */
function deficitOf(cssLen, dpr) {
  const x = cssLen * dpr;
  return Math.round(x) - x;
}

/**
 * WHICH OF THE THREE THINGS A GEOMETRY IS, from its two deficits:
 *
 *   `exercises`   a deficit at or above MIN_DEFICIT: the defect is present AND this
 *                 rasteriser renders it as coverage the scan can read.
 *   `sub-raster`  a positive deficit below it: arithmetically defective, but below what
 *                 the rasteriser resolves, so a green row here is NOT evidence.
 *   `overshoots`  no positive deficit: the container-rect clear runs past the store and
 *                 the canvas clips it, so the two spellings cannot differ at all.
 */
function classOf(dx, dy) {
  if (dx >= MIN_DEFICIT || dy >= MIN_DEFICIT) return 'exercises';
  if (dx > 0 || dy > 0) return 'sub-raster';
  return 'overshoots';
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  let head = 'unknown';
  try { head = execFileSync('git', ['-C', RUN.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  let distAt = 'unknown';
  try { distAt = statSync(MAIN).mtime.toISOString(); } catch { /* reported below */ }
  if (!existsSync(`${AEONDIR}/games/sonic4/data/editor/effects/${FIXTURE_SCENE}.json`)) {
    throw new Error(`the aeon copy has no effects/${FIXTURE_SCENE}.json to drive the composite with`);
  }
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
  let exercised = 0;
  const geoms = {};
  const baseline = SCAN_BASELINE ? JSON.parse(readFileSync(SCAN_BASELINE, 'utf8')) : null;
  if (baseline) note('pixel-identity baseline', `${SCAN_BASELINE}, written by a run of ${baseline.head} (${baseline.tag}), geometries ${J(Object.keys(baseline.geoms ?? {}))}`);
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
    const haveProbes = await c.evalExpr('typeof window.__dbg.aeon.cameraPreview === "function" '
      + '&& typeof window.__dbg.setOverlay === "function" && typeof window.__dbg.overlays === "function" '
      + '&& typeof window.__dbg.aeon.setLayer === "function" && typeof window.__dbg.aeon.selectedTile === "function"');
    check('0a', '[anti-vacuous] the build under test has the camera-preview and overlay probes', haveProbes === true, `${RUN.root}/dist`);
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
    /** Park the pointer off the canvas so no hover chrome is in the picture. */
    const park = async () => { await mouse('mouseMoved', 2, 2); await sleep(250); };
    /**
     * The map canvas's geometry AND the deficit derived from it. `rect` is the CONTAINER's,
     * which is what `redraw` reads; the canvas is `position:absolute; width:100%; height:100%`
     * of it, and both are printed so a divergence would be visible rather than assumed.
     */
    const geometry = () => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
      const el = cv.parentElement; const b = el.getBoundingClientRect(); const cb = cv.getBoundingClientRect();
      return { dpr: window.devicePixelRatio, width: b.width, height: b.height, canvasW: cb.width, canvasH: cb.height,
        storeW: cv.width, storeH: cv.height }; })()`);
    /** Force a full `redraw` and wait for it. */
    const repaint = async () => {
      await c.evalExpr('window.__dbg.setView(0, 1, 1)'); await sleep(250);
      await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(500);
    };
    const select = async (id) => { await c.evalExpr(`window.__dbg.aeon.selectScene(${J(id)})`); await sleep(450); await repaint(); };
    /**
     * THE SCAN. Every pixel of the map backing store, counting the ones that are not fully
     * opaque, and saying WHERE. Computed in the page: the store is ~3.7 MB of RGBA and
     * carrying it over CDP per geometry is the instrument, not the measurement.
     */
    const scan = () => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas');
      const W = cv.width, H = cv.height;
      const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
      let n = 0, minA = 255, maxSub = -1; const cols = new Set(), rows = new Set(); let first = null;
      let outside = 0;
      for (let y = 0; y < H; y++) {
        const base = y * W * 4;
        for (let x = 0; x < W; x++) {
          const a = d[base + x * 4 + 3];
          if (a === 255) continue;
          n++; if (a < minA) minA = a; if (a > maxSub) maxSub = a;
          cols.add(x); rows.add(y);
          if (x !== W - 1 && y !== H - 1) outside++;
          if (first === null) first = { x: x, y: y, a: a };
        }
      }
      // THE WHOLE BACKING STORE, HASHED, so two builds can be compared pixel for pixel
      // rather than through the summary above. Two independent mixes over the same bytes
      // in opposite directions, as scratchpad/dpr-guides-offset-harness.mjs does.
      let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
      for (let i = 0; i < d.length; i++) { h1 = Math.imul(h1 ^ d[i], 0x01000193) >>> 0; h2 = Math.imul(h2 ^ d[d.length - 1 - i], 0x5bd1e995) >>> 0; }
      const lastCol = []; const lastRow = [];
      for (const y of [0, H >> 2, H >> 1, H - 1]) lastCol.push({ y: y, a: d[(y * W + (W - 1)) * 4 + 3] });
      for (const x of [0, W >> 2, W >> 1, W - 1]) lastRow.push({ x: x, a: d[((H - 1) * W + x) * 4 + 3] });
      return { W: W, H: H, n: n, minA: n ? minA : null, maxSubA: n ? maxSub : null, outside: outside,
        nCols: cols.size, cols: [...cols].sort(function (a, b) { return a - b; }).slice(0, 6),
        nRows: rows.size, rows: [...rows].sort(function (a, b) { return a - b; }).slice(0, 6),
        first: first, lastColAlpha: lastCol, lastRowAlpha: lastRow,
        hash: h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') }; })()`);
    const capture = async (name) => {
      const url = await c.evalExpr(`document.getElementById('map-canvas').toDataURL('image/png')`);
      const path = `${SHOTS}/${name}-${TAG}.png`;
      writeFileSync(path, Buffer.from(url.split(',')[1], 'base64'));
      return path;
    };
    /**
     * Give the map container an explicit CSS size. Returns the rect it actually got.
     *
     * ⚠ THE ORIGINAL `cssText` IS SAVED AND PUT BACK WHOLE, not cleared property by
     * property. `styles.container` is an INLINE style React writes (`flex: 1`), so
     * `el.style.flex = ''` does not restore it — it deletes it, the container collapses to
     * width 0, and the next `getImageData` dies with "source width is 0". Run master-run2
     * of this file aborted in exactly that way, after its rows had passed.
     */
    const impose = (w, h) => c.json(String.raw`(() => { const el = document.getElementById('map-canvas').parentElement;
      if (el.dataset.harnessCss === undefined) el.dataset.harnessCss = el.style.cssText;
      el.style.flex = 'none'; el.style.width = ${J(`${w}px`)}; el.style.height = ${J(`${h}px`)};
      const b = el.getBoundingClientRect(); return { width: b.width, height: b.height }; })()`);
    const unimpose = () => c.json(String.raw`(() => { const el = document.getElementById('map-canvas').parentElement;
      if (el.dataset.harnessCss !== undefined) { el.style.cssText = el.dataset.harnessCss; delete el.dataset.harnessCss; }
      const b = el.getBoundingClientRect(); return { width: b.width, height: b.height, cssText: el.style.cssText }; })()`);

    // ---- 1. Open the aeon COPY and put the composite on screen ---------------
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
    await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)').catch(() => null);
    await c.evalExpr("window.__dbg.setOverlay('playAnimatedArt', false)");
    await c.evalExpr("window.__dbg.setOverlay('showBgPlane', false)");
    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");
    await select(FIXTURE_SCENE);
    await park();
    const overlays0 = await c.json('window.__dbg.overlays()');
    const layer0 = (await c.json('window.__dbg.aeon.selectedTile()')).layer;
    const cam0 = await c.json('window.__dbg.aeon.cameraPreview()');
    check('1c', 'the branch under test is the one running: Bg Plane overlay OFF, editing layer not bg, and the camera preview composite ACTIVE with real blits',
      overlays0.showBgPlane === false && layer0 !== 'bg' && cam0.active === true && cam0.blits > 0,
      `overlays.showBgPlane ${overlays0.showBgPlane}; editingLayer ${layer0}; camera preview ${J({ active: cam0.active, sceneId: cam0.sceneId, blits: cam0.blits })}`);

    // ---- 2. The geometries ---------------------------------------------------
    const nativeDpr = (await geometry()).dpr;
    if (SCALE !== null) {
      check('2a', `the forced factor took: devicePixelRatio reads ${SCALE} with --force-device-scale-factor=${SCALE}`,
        Math.abs(nativeDpr - SCALE) < 1e-6, `devicePixelRatio ${nativeDpr}`);
    }

    /**
     * One geometry, measured twice: the composite ON (the branch under test) and the
     * composite OFF (the sibling clear, which is the control).
     */
    const phase = async (P, label, expect) => {
      await realClick(SUBTAB('parallax')); await sleep(400);
      await select(FIXTURE_SCENE);
      await repaint(); await park();
      const G = await geometry();
      const dx = deficitOf(G.width, G.dpr);
      const dy = deficitOf(G.height, G.dpr);
      const classNow = classOf(dx, dy);
      const exercisedHere = classNow === 'exercises';
      if (exercisedHere) exercised++;
      const predX = dx > 0 ? Math.round(255 * (1 - dx)) : null;
      const predY = dy > 0 ? Math.round(255 * (1 - dy)) : null;
      console.log(`\n=== GEOMETRY ${P}: ${label}\n    dpr ${G.dpr}; map container rect ${G.width} x ${G.height}; canvas rect ${G.canvasW} x ${G.canvasH}; `
        + `backing store ${G.storeW} x ${G.storeH}; ${up()}`);
      console.log(`    DERIVED: rect*dpr = ${(G.width * G.dpr).toFixed(4)} x ${(G.height * G.dpr).toFixed(4)}; `
        + `round -> ${Math.round(G.width * G.dpr)} x ${Math.round(G.height * G.dpr)}; `
        + `container-rect clear leaves ${dx.toFixed(4)} x ${dy.toFixed(4)} device px uncovered `
        + `(predicted last-column alpha ${predX ?? 'n/a'}, last-row alpha ${predY ?? 'n/a'})`);

      check(`${P}.0`, '[anti-vacuous] the backing store is round(rect * dpr) in both axes, which is where this geometry\'s expectation comes from',
        G.storeW === Math.round(G.width * G.dpr) && G.storeH === Math.round(G.height * G.dpr),
        `store ${G.storeW}x${G.storeH}; round(rect*dpr) ${Math.round(G.width * G.dpr)}x${Math.round(G.height * G.dpr)}; rect ${G.width}x${G.height}; dpr ${G.dpr}`);

      const camOn = await c.json('window.__dbg.aeon.cameraPreview()');
      check(`${P}.1`, '[anti-vacuous] the camera preview composite is ACTIVE in this geometry, so the clear under test is the one that ran',
        camOn.active === true && camOn.blits > 0, J({ active: camOn.active, sceneId: camOn.sceneId, camX: camOn.camX, blits: camOn.blits }));

      const on = await scan();
      const on2 = await scan();
      const shot = await capture(`composite-on-${P}`);
      note(`${P}.2 scan (composite ON)`, `${on.n} of ${on.W * on.H} pixels below alpha 255; alpha range ${J([on.minA, on.maxSubA])}; `
        + `${on.nCols} distinct columns ${J(on.cols)}${on.nCols > 6 ? '…' : ''}; ${on.nRows} distinct rows ${J(on.rows)}${on.nRows > 6 ? '…' : ''}; `
        + `${on.outside} of them outside the last column and last row; `
        + `first ${J(on.first)}; last column alpha ${J(on.lastColAlpha)}; last row alpha ${J(on.lastRowAlpha)}; hash ${on.hash}; ${shot}`);
      // ⚠ THE GEOMETRY IS DECLARED BEFORE THE PHASE AND RE-DERIVED INSIDE IT. `expect` is
      // the class computed from an INDEPENDENT read taken right after the geometry was set
      // up; this re-derives it from the phase's own read. A disagreement means the window
      // or the layout moved under the run, and the rows below would be describing a
      // surface that no longer exists. `any` is for geometries the WINDOW chose (N, E),
      // where the class is whatever the launch produced and row 9a carries the run-level
      // requirement.
      check(`${P}.2x`, `[anti-vacuous] this geometry is still the class it was set up as (${expect}) when its rows run`,
        expect === 'any' || classNow === expect,
        `deficit x ${dx.toFixed(4)} y ${dy.toFixed(4)} device px (MIN_DEFICIT ${MIN_DEFICIT}); this geometry ${classNow}; declared ${expect}`);
      check(`${P}.2`, 'the map canvas is FULLY CLEARED with the composite on: every device pixel of the backing store is opaque'
        + (classNow === 'exercises' ? ''
          : classNow === 'sub-raster'
            ? ` [SUB-RASTER: the deficit here is ${Math.max(dx, dy).toFixed(4)} device px, below the ${MIN_DEFICIT} this rasteriser has been measured to resolve, so a green here is NOT evidence that the clear is right]`
            : ' [NOT EXERCISED HERE: this geometry has no positive deficit, so the container-rect clear overshoots and the canvas clips it, and this row cannot tell the two spellings apart]'),
        on.n === 0,
        `${on.n} pixel(s) below alpha 255 (min ${on.minA}); columns ${J(on.cols)} of 0..${on.W - 1}; rows ${J(on.rows)} of 0..${on.H - 1}; `
        + `${on.outside} outside the last column/row; `
        + `predicted by the container-rect spelling: alpha ${predX ?? 'n/a'} down column ${on.W - 1}, alpha ${predY ?? 'n/a'} along row ${on.H - 1}`);
      check(`${P}.I1`, '[anti-vacuous] DETERMINISM: the backing store hashes the same on two reads of one paint, so a hash difference between builds is the code and not the run',
        on.hash === on2.hash && on.n === on2.n, `${on.hash} / ${on2.hash}; ${on.n} / ${on2.n} translucent px`);

      // ---- the CONTROL: the same scan where this change does nothing ----------
      await realClick(SUBTAB('tileAnim')); await sleep(400);
      await repaint(); await park();
      const camOff = await c.json('window.__dbg.aeon.cameraPreview()');
      const off = await scan();
      const shotOff = await capture(`composite-off-${P}`);
      note(`${P}.3 scan (composite OFF)`, `${off.n} of ${off.W * off.H} pixels below alpha 255; alpha range ${J([off.minA, off.maxSubA])}; `
        + `first ${J(off.first)}; last column alpha ${J(off.lastColAlpha)}; hash ${off.hash}; ${shotOff}`);
      check(`${P}.3`, '[control] with the composite OFF the same scan is fully opaque: SectionRenderer.render\'s clear already spans the backing store, so the change under test does nothing here',
        camOff.active === false && off.n === 0,
        `camera preview ${J({ active: camOff.active })}; ${off.n} pixel(s) below alpha 255 (min ${off.minA}); geometry unchanged ${J(await geometry())}`);

      // ---- PIXEL IDENTITY against another build, when one was handed in -------
      const rec = {
        P, label, dpr: G.dpr, rect: [G.width, G.height], store: [G.storeW, G.storeH],
        dx, dy, klass: classNow, onN: on.n, offN: off.n, onMinA: on.minA, onOutside: on.outside,
        onLastCol: on.lastColAlpha, onLastRow: on.lastRowAlpha, onHash: on.hash, offHash: off.hash,
      };
      geoms[P] = rec;
      if (baseline) {
        const b = baseline.geoms?.[P];
        if (!b) {
          check(`${P}.I2`, 'PIXEL IDENTITY against the baseline build: the baseline has this geometry to compare against', false,
            `${SCAN_BASELINE} has no geometry ${P} (it has ${J(Object.keys(baseline.geoms ?? {}))}), so this run establishes nothing about it`);
        } else if (b.store[0] !== G.storeW || b.store[1] !== G.storeH) {
          check(`${P}.I2`, 'PIXEL IDENTITY against the baseline build: the two runs measured the same surface', false,
            `store ${G.storeW}x${G.storeH} here against ${b.store[0]}x${b.store[1]} in the baseline — NOT COMPARABLE, and not a verdict either way`);
        } else {
          // ⚠ NOT "THE SAME HASH". The required relation depends on what the BASELINE
          // measured in this same geometry: where it found an uncleared edge the pixels
          // MUST move (and the edge must be gone), and where it found none they must not
          // move at all. Asserting blanket identity here made the fix's own run red in the
          // five geometries it repaired — a row that cannot be green on either build.
          const mustChange = b.onN > 0;
          const onSame = b.onHash === on.hash;
          const offSame = b.offHash === off.hash;
          const okHere = mustChange ? (on.n === 0 && !onSame && offSame) : (onSame && offSame && on.n === 0);
          check(`${P}.I2`, mustChange
            ? `PIXEL CHANGE at dpr ${G.dpr} in geometry ${P}: the baseline build (${baseline.head}) left ${b.onN} translucent px here, so this build must clear them and its composite-ON pixels must differ — with the composite OFF nothing may move`
            : `PIXEL IDENTITY at dpr ${G.dpr} in geometry ${P}: the baseline build (${baseline.head}) left NO uncleared edge here, so the whole backing store must hash the same, composite ON and OFF`,
            okHere,
            `composite ON  ${on.hash} here / ${b.onHash} baseline ${onSame ? 'SAME' : 'DIFFERENT'}; `
            + `composite OFF ${off.hash} here / ${b.offHash} baseline ${offSame ? 'SAME' : 'DIFFERENT'}; `
            + `translucent px ON ${on.n} here / ${b.onN} baseline; store ${G.storeW}x${G.storeH}; deficit ${dx.toFixed(4)}/${dy.toFixed(4)}; class ${classNow}; from ${SCAN_BASELINE}`);
        }
      }
      await realClick(SUBTAB('parallax')); await sleep(400);
      return rec;
    };

    const summary = [];
    const nativeLabel = SCALE === null
      ? `native (Xvfb default, no switch): dpr ${nativeDpr}`
      : (Math.abs(nativeDpr - SCALE) < 1e-6
        ? `REAL forced factor (--force-device-scale-factor=${SCALE}): dpr ${nativeDpr}`
        : `--force-device-scale-factor=${SCALE} DID NOT TAKE: dpr ${nativeDpr}`);
    // N is whatever the window gave, so its class is `any`: on this host it has read dpr 1
    // with an INTEGRAL rect, where the two spellings provably cannot differ — which is a
    // dpr-1 datum and not a pass for the clear. Row 9a carries the run-level requirement.
    summary.push(await phase('N', nativeLabel, 'any'));

    // ---- the EMULATED factor -------------------------------------------------
    const iw = await c.json('({ w: innerWidth, h: innerHeight })');
    const emuTarget = Math.abs(nativeDpr - EMULATE) < 1e-6 ? 1 : EMULATE;
    await c.send('Emulation.setDeviceMetricsOverride', { width: iw.w, height: iw.h, deviceScaleFactor: emuTarget, mobile: false });
    await sleep(700); await repaint();
    const emuDpr = await c.evalExpr('window.devicePixelRatio');
    check('3a', `[anti-vacuous] the emulation took: devicePixelRatio reads ${emuTarget}`, Math.abs(emuDpr - emuTarget) < 1e-6, `dpr ${emuDpr}`);
    summary.push(await phase('E', `EMULATED (Emulation.setDeviceMetricsOverride deviceScaleFactor ${emuTarget}): dpr ${emuDpr}`, 'any'));
    await c.send('Emulation.clearDeviceMetricsOverride');
    await sleep(500); await repaint();
    note('emulation cleared', `devicePixelRatio ${await c.evalExpr('window.devicePixelRatio')} (native ${nativeDpr}); ${J(await geometry())}`);

    // ---- the IMPOSED fractional container, at the NATIVE factor --------------
    // The dpr-1 half of the question, and the only way to ask it: a container rect at dpr 1
    // is integral in every geometry this window produces on its own, so `frac(rect * dpr)`
    // is 0 and the two spellings cannot differ. `.5` is the largest deficit the arithmetic
    // admits (round half up), so it is the worst case, and `.25`/`.75` bracket it either
    // side of the 0.5 threshold: at frac 0.25 the container-rect clear OVERSHOOTS and is
    // clipped, which must leave the canvas fully opaque on BOTH spellings.
    // The five fractions bracket every class the arithmetic admits, at this window's dpr:
    // 0.5 is the largest deficit rounding can leave; 0.75 sits at MIN_DEFICIT exactly;
    // 0.875 and 0.9375 are POSITIVE deficits below what the rasteriser was measured to
    // resolve (0.0625 left no coverage at all in run master-real), and they are carried so
    // every run says where that threshold is rather than leaving it on one observation;
    // 0.25 is a NEGATIVE deficit, where the clear overshoots and the canvas clips it.
    const base = await geometry();
    for (const frac of [0.5, 0.75, 0.875, 0.9375, 0.25]) {
      const w = Math.floor(base.width) - 4 + frac;
      const h = Math.floor(base.height) - 4 + frac;
      const got = await impose(w, h);
      await repaint(); await sleep(500);
      // The class is fixed HERE, from a read of its own, before the phase measures anything.
      const g = await geometry();
      const cls = classOf(deficitOf(g.width, g.dpr), deficitOf(g.height, g.dpr));
      summary.push(await phase(`I${String(frac).replace('.', '')}`,
        `IMPOSED container rect (flex:none; width:${w}px; height:${h}px -> ${got.width} x ${got.height}) at dpr ${g.dpr} — `
        + `deficit ${deficitOf(g.width, g.dpr).toFixed(4)} x ${deficitOf(g.height, g.dpr).toFixed(4)} device px, class ${cls}`, cls));
    }
    const restored = await unimpose();
    await repaint(); await sleep(400);
    const afterRestore = await geometry();
    check('4a', '[anti-vacuous] the imposed container style was put back whole, so the geometries after it are the window\'s own again',
      afterRestore.width === base.width && afterRestore.height === base.height,
      `restored ${J(restored)}; geometry now ${J(afterRestore)}; before imposing ${J({ width: base.width, height: base.height })}`);

    // ---- an optional width SWEEP, for the packet's geometry census -----------
    if (SWEEP) {
      const rows = [];
      for (let d = 0; d < 24; d++) {
        await c.send('Emulation.setDeviceMetricsOverride', { width: iw.w - d, height: iw.h, deviceScaleFactor: emuTarget, mobile: false });
        await sleep(250); await repaint();
        const g = await geometry();
        rows.push(`w${iw.w - d}: rect ${g.width} dpr ${g.dpr} -> ${(g.width * g.dpr).toFixed(3)} store ${g.storeW} deficit ${deficitOf(g.width, g.dpr).toFixed(3)}`);
      }
      note('viewport width sweep', rows.join('\n        '));
      await c.send('Emulation.clearDeviceMetricsOverride');
      await sleep(500); await repaint();
      note('emulation cleared after the sweep', `devicePixelRatio ${await c.evalExpr('window.devicePixelRatio')} (native ${nativeDpr}); ${J(await geometry())}`);
    }

    check('9a', 'at least one geometry in this run EXERCISED the defect, so the run is evidence about it',
      exercised > 0, `${exercised} of ${summary.length} geometries had a deficit >= ${MIN_DEFICIT} device px`);

    // ═══ THE BOTH-SIDES ROW, and the reason it is stated against the BASELINE'S OWN
    // MEASUREMENTS rather than against the deficit.
    //
    // ⚠ LATER OPAQUE DRAWING CAN COVER PART OF THE EDGE, so a deficit does not guarantee a
    // translucent pixel survives to be read. Measured: at the REAL 1.35 factor the last
    // device ROW came back fully opaque in every geometry (run master-real, N: 717
    // translucent pixels, all of them in column 892, none in row 837) while the same
    // arithmetic at dpr 1 left both the last column AND the last row partly clear. The map
    // is 620 CSS px tall in that window against 742 at dpr 1, so the section art reaches
    // the bottom edge there and does not here. A green row .2 is therefore not by itself
    // proof that the clear covered the edge — it can also mean something else painted over
    // it. THIS row closes that, by requiring the change against a build that was measured
    // in the SAME geometry: every geometry the baseline showed an uncleared edge in must be
    // clean here AND its pixels must have moved, and every geometry the baseline showed
    // none in must be byte-identical here.
    if (baseline) {
      const rows = [];
      let ok = true;
      for (const [P, b] of Object.entries(baseline.geoms ?? {})) {
        const m = geoms[P];
        if (!m) { rows.push(`${P}: NOT MEASURED in this run`); ok = false; continue; }
        if (m.store[0] !== b.store[0] || m.store[1] !== b.store[1]) {
          rows.push(`${P}: store ${J(m.store)} here against ${J(b.store)} in the baseline — NOT COMPARABLE`); ok = false; continue;
        }
        const changed = m.onHash !== b.onHash;
        const want = b.onN > 0 ? (m.onN === 0 && changed) : (!changed && m.onN === 0);
        if (!want) ok = false;
        rows.push(`${P}: baseline ${b.onN} translucent px -> here ${m.onN}; composite-ON hash ${changed ? 'CHANGED' : 'same'}; `
          + `composite-OFF hash ${m.offHash !== b.offHash ? 'CHANGED' : 'same'}; ${want ? 'as required' : 'NOT AS REQUIRED'}`);
      }
      check('9b', `against the baseline build (${baseline.head}): every geometry the baseline showed a partly-uncleared edge in is fully cleared here AND its pixels moved; `
        + 'every geometry the baseline showed none in is byte-identical here',
        ok, rows.join('\n        '));
    }
    note('geometry summary', summary.map((s) => `${s.P}: dpr ${s.dpr} rect ${J(s.rect)} store ${J(s.store)} deficit ${s.dx.toFixed(4)}/${s.dy.toFixed(4)} `
      + `${s.klass.toUpperCase()} -> composite-on ${s.onN} translucent px (min alpha ${s.onMinA}, ${s.onOutside} outside the last column/row, hash ${s.onHash}), `
      + `composite-off ${s.offN} (hash ${s.offHash})`).join('\n        '));
    note('the deficit this rasteriser resolves', summary.map((s) => `deficit ${Math.max(s.dx, s.dy).toFixed(4)} -> ${s.onN} translucent px`)
      .join('; ') + `  (MIN_DEFICIT is ${MIN_DEFICIT}; a positive deficit that leaves 0 px is BELOW what this rasteriser resolves, `
      + 'and a green row in such a geometry is not evidence)');
    if (SCAN_OUT) {
      writeFileSync(SCAN_OUT, `${J({ tag: TAG, head, root: RUN.root, geoms }, null, 1)}\n`);
      note('pixel-identity record written', SCAN_OUT);
    }
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
