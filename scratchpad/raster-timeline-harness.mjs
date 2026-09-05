#!/usr/bin/env node
// IS THERE A SPLIT MARKER ON THE RASTER TIMELINE, IN THE RUNNING APP, AT THE
// LINE THE ENGINE WOULD FIRE ON?
//
// `vsplit.at` has been authorable since parcel E and INVISIBLE since: an author
// types a number into a spinner and NOTHING ON SCREEN CHANGES. 5,312 vitest
// tests pass over this feature and not one of them can see React, a canvas or a
// pixel. This file is the only instrument that can tell whether the strip is
// actually there.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. THE COORDINATE TRAP, MEASURED IN PIXELS. A layer top and a split's `at` are
//    different quantities in different spaces (`canvas/raster-timeline.ts`'s
//    docblock derives all three from aeon's `scene_dsl.emp`). Section 6 changes
//    the TOP through the real spinner and requires the marker to move by exactly
//    that many strip pixels; section 7 changes `at` through the real spinner and
//    requires the marker to move by exactly ZERO while the strip still repaints.
//    A build that drew `at` on the 224 ruler passes neither.
//
// 2. A STRIP THAT IS ONLY IN THE MODEL. Every marker row samples the strip
//    canvas's OWN PIXELS and requires the marker colour present at the predicted
//    line and ABSENT three lines either side. `__dbg.aeon.rasterTimeline()` is a
//    publish from the end of the draw, so it can say `active: true` while the
//    canvas is blank — that is exactly the defect that shipped this evening on
//    the camera composite (81 real draw calls, `active: true`, thousands of
//    tests green, a black rectangle).
//
// 3. A STRIP THAT IS DRAWN AND THEN COVERED. Two different covers, two rows:
//      • covered BY ITSELF — a later fill painting over the marker. `getImageData`
//        reads the FINAL backing store, so row 5c cannot pass on a marker that
//        was drawn and then overpainted.
//      • covered BY THE PAGE — a canvas that exists, draws, and is behind
//        something or clipped to nothing. Row 5d requires
//        `document.elementFromPoint` at the marker's own client position to BE
//        this canvas, and `checkVisibility()` to agree.
//
// 4. A VACUOUS FIXTURE. ⚠ THIS PARCEL'S OWN WORST TRAP: **a scene with no
//    splits, or one split at line 0, renders identically to a broken timeline.**
//    An empty strip and a marker jammed at the top are both what "nothing works"
//    looks like. So the fixture has TWO splits, at 96 and 176 — distinct from
//    each other, far from 0 and from 223 — and their `at` payloads are 300 and
//    44, one of which is not even ON a 224-line ruler. Section 4 FAILS if the
//    document does not hold exactly that.
//
// 5. A CONTROL THAT WAS NEVER REACHED. Every value is written through the real
//    form control an author uses, and section 4 reads the DOCUMENT back through
//    `__dbg.aeon.scenesJson()` before any pixel is looked at.
//
// ═══ AIM AT INTEGERS — AND HERE THE CLASS IS REMOVED, NOT MANAGED ═══
//
// `devicePixelRatio` is whatever Electron infers under Xvfb and has been seen at
// both 1 and 1.35 on this host in one session; at 1.35 a canvas sized from its
// client rect is fractional, CDP delivers the nearest integer, and it presents
// as an off-by-one in the FEATURE. It cost a full review cycle on this surface.
//
// The strip canvas has a FIXED INTRINSIC SIZE (`RASTER_TIMELINE_W/H`), so its
// backing store never depends on dpr and `getImageData` here is in strip space
// exactly. Every aim below is derived from the report's OWN published constants
// (`originY`, `scale`, `stripX`, `stripW`) through the app's contract — never
// from a number read off a screenshot, and never with a tolerance window. dpr,
// the client rect and every aim are printed anyway.
//
// The ONE place client coordinates are used is row 5d's `elementFromPoint`, and
// it is deliberately aimed at the canvas's CENTRE — the least dpr-sensitive
// point there is — rather than at a marker.
//
// ═══ HOW TO RUN ═══
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build   # __dbg exists ONLY here
//   node scratchpad/raster-timeline-harness.mjs   # or: npm run harness:raster-timeline
//
// Screenshots land in scratchpad/shots-raster-timeline/.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9401);
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
const SHOTS = `${ROOT}/scratchpad/shots-raster-timeline`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'raster_strip_probe';

// ── THE FIXTURE, AND WHY EVERY NUMBER IS THAT NUMBER ───────────────────────
//
// Three layers. Layer 0 at top 0 (a scene must start at the screen top; band 0's
// plane top is 0 by construction). Layers 1 and 2 carry the splits.
//
// TOPS 96 and 176: both well inside the fire bound 3..223 (aeon `fire()`,
// raster_dsl.emp:326), both far from 0 — catch 4 — and distinct from each other
// by 80, which is not equal to either of them, so a marker at the wrong one is
// not mistakable for a marker at the right one.
//
// `at` 300 and 44: `at` is a PLANE-B ROW, bounded 0..511 by the schema, and the
// plane is 512 rows. 300 IS NOT A LEGAL SCREEN LINE AT ALL — a strip that drew
// the payload on the 224 ruler would have to clamp it or drop it, and either is
// loudly visible. 44 is a legal-looking screen line and is NOT equal to any top
// here, so drawing it as a position would land somewhere plausible and wrong.
const TOP_A = 96;
const TOP_B = 176;
const AT_A = 300;
const AT_B = 44;
// The differential in section 6: 96 -> 120. 24 is not a multiple of the ruler's
// 32px tick spacing, so a marker that snapped to ticks would be caught.
const TOP_A2 = 120;
// The null differential in section 7: `at` 300 -> 301. One row of PAYLOAD.
const AT_A2 = 301;
// Section 8's whole-scene shift. 40 is > 3 (so it lifts the fire floor above 3
// and the narrowing is real) and leaves both tops legal: the fire band becomes
// 43..263, and 120 and 176 are inside it.
const V_OFFSET = 40;

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
/** Every `no-element` / `null` any probe returned, for the blanket row 9b. */
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
  console.log(`        shot → scratchpad/shots-raster-timeline/${name}.png`);
}

// A React-controlled control ignores `el.value = x`; the native setter plus a
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

/** The control whose `title` starts with this text — the panel's own labelling. */
const byTitle = (tag, prefix) =>
  `[...document.querySelectorAll(${JSON.stringify(tag)})].find(e => (e.title||'').startsWith(${JSON.stringify(prefix)}))`;

/**
 * THE SCENE FORM, OPENED — it arrives COLLAPSED since EW-SHAPE-TABS (d-26b),
 * which is what gives the layers list above it a real height. `v_offset` lives
 * in it, so §8 needs it open. Idempotent, and the disclosure persists, so
 * calling it before every edit costs one DOM query.
 */
const OPEN_SCENE_FORM = String.raw`
(() => {
  const has = () => !!(${byTitle('input', 'v_offset:')});
  if (has()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer'
                && /^SCENE\s*\u2014/i.test((d.innerText || '').trim()))[0];
  if (!hdr) return 'no-scene-header';
  hdr.click();
  return 'clicked';
})()`;

// ── the strip's own pixels ─────────────────────────────────────────────────
//
// `getContext('2d')` returns the context the component already drew with, so
// this is the FINAL backing store: anything drawn and then painted over is gone
// by the time this runs, which is what makes catch 3's first half real.
const STRIP_ROW = (y, x, len) => String.raw`
(() => {
  const cv = document.getElementById('effects-raster-timeline');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(${x}, ${y}, ${len}, 1).data;
  return Array.from(d);
})()`;

/**
 * IS THE SPLIT MARKER'S COLOUR IN THIS RUN OF PIXELS?
 *
 * The predicate is derived from the two colours the module composites, not from
 * a screenshot: `SPLIT_LINE = rgba(255,170,60,0.95)` over `STRIP_BG =
 * rgb(10,12,18)` is `(243,162,58)`, and the window below is wide enough for the
 * canvas's own alpha rounding and narrow enough to EXCLUDE every other colour
 * the strip paints:
 *
 *   band fill      rgba( 80,220,240,0.38) over bg -> ( 37, 91,102)   g too low? no: b 102 > 90  -> excluded by b
 *   band boundary  rgba( 80,220,240,0.75)         -> ( 63,168,184)   excluded by r
 *   locked caption rgba(240,198,116,0.98)         -> (235,194,114)   excluded by g (>190) and b (>90)
 *   split caption  rgba(255,220,160,0.98)         -> (250,216,157)   excluded by g and b
 *   refused rule   rgba(255, 96, 96,0.95)         -> (243,100, 61)   excluded by g (<130)
 *   priming tint   rgba(255, 96, 96,0.20)         -> ( 59, 29, 30)   excluded by r
 *   label plate    rgba( 12, 14, 18,0.82)         -> ( 11, 13, 18)   excluded by r
 *
 * ⚠ THE REFUSED RULE IS EXCLUDED ON PURPOSE. A build that painted every marker
 * red would then fail these rows rather than passing them, which is right: the
 * fixture's splits are all legal and a red one would be a different defect.
 */
function hasMarker(row) {
  for (let i = 0; i * 4 < row.length; i++) {
    const r = row[i * 4], g = row[i * 4 + 1], b = row[i * 4 + 2];
    if (r >= 200 && g >= 130 && g <= 190 && b <= 90) return true;
  }
  return false;
}
function rowSummary(row) {
  const seen = new Map();
  for (let i = 0; i * 4 < row.length; i++) {
    const k = `${row[i * 4]},${row[i * 4 + 1]},${row[i * 4 + 2]}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()].map(([k, n]) => `${k}x${n}`).join(' ');
}

/**
 * Scroll the strip into view — the way an author reaches it — then hit-test.
 *
 * `inViewport` is reported separately from `isSelf` so a future failure can be
 * read: a canvas below the fold and a canvas behind another element both give
 * `isSelf:false`, and they are different defects.
 */
const SCROLL_AND_HIT = String.raw`
(() => {
  const cv = document.getElementById('effects-raster-timeline');
  if (!cv) return { error: 'no-canvas' };
  cv.scrollIntoView({ block: 'center' });
  const r = cv.getBoundingClientRect();
  const px = Math.round(r.x + r.width / 2);
  const py = Math.round(r.y + r.height / 2);
  const inViewport = px >= 0 && py >= 0
    && px < document.documentElement.clientWidth && py < document.documentElement.clientHeight;
  const hit = inViewport ? document.elementFromPoint(px, py) : null;
  return { isSelf: hit === cv, hitId: hit ? (hit.id || hit.tagName) : null,
           visible: typeof cv.checkVisibility === 'function' ? cv.checkVisibility() : null,
           w: r.width, h: r.height, px, py, inViewport,
           viewport: [document.documentElement.clientWidth, document.documentElement.clientHeight] };
})()`;

/**
 * SHOW ONE OF THE THREE JOBS - d-26b's sub-tabs (EW-SHAPE-TABS).
 *
 * The Effects column's panels are re-parented under three sub-tabs, so the
 * sections this instrument measures are UNMOUNTED (not hidden) until their job
 * is shown. One click, immediately after the facet mounts; nothing else about
 * what these rows assert changed. A missing bar returns 'no-sub-tab' rather
 * than throwing, so the row below reports "not found" instead of a stack.
 */
const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

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

    // ---- 0. PROVENANCE ----------------------------------------------------
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.rasterTimeline === "function"');
    check('0a', 'the build under test has the raster-timeline probe at all',
      haveProbe === true, `${RUN.root}/dist`);
    if (!haveProbe) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon, reach the Effects facet ----------------------------
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
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1000);

    // ---- 2. The strip exists BEFORE anything is authored -------------------
    // ⚠ ORDER MATTERS. If this row ran after the fixture it could not tell "the
    // strip mounted" from "the fixture made it mount".
    let rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    note(`timeline report on arrival: ${JSON.stringify({
      active: rep.active, sceneId: rep.sceneId, paints: rep.paints })}`);
    check('2a', 'the strip publishes its own constants, so no aim below is typed',
      rep.lines === 224 && rep.scale >= 1 && Number.isInteger(rep.originY)
      && Number.isInteger(rep.stripX) && Number.isInteger(rep.stripW),
      `lines=${rep.lines} scale=${rep.scale} originY=${rep.originY} stripX=${rep.stripX} stripW=${rep.stripW}`);

    // ---- 3. Author the fixture through the real form ----------------------
    // ⚠ THE SCENE FORM IS ON THE PARALLAX JOB, THE STRIP IS ON THE COLOUR ONE
    // (d-26b's sub-tabs). This instrument spans both: it authors layers and
    // splits through the scene form, then measures what the timeline drew.
    // Neither half moved; the run now says which job it is standing in.
    await c.evalExpr(SUBTAB('parallax'));
    await sleep(1000);
    /**
     * EDIT ON THE PARALLAX JOB, THEN COME BACK TO THE STRIP.
     *
     * Every §6-§9 step is one gesture on a layer card or the scene form
     * followed by a measurement of the timeline canvas, and those two live on
     * different sub-tabs now. This is that round trip, in one place, so no step
     * can measure a canvas that is not mounted or type into a card that is not.
     */
    const onParallax = async (expr) => {
      await c.evalExpr(SUBTAB('parallax'));
      await sleep(600);
      await c.evalExpr(OPEN_SCENE_FORM);
      await sleep(300);
      const r = await c.evalExpr(expr);
      await c.evalExpr(SUBTAB('colour'));
      await sleep(800);
      return r;
    };
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    const scenes = await c.json('window.__dbg.aeon.scenes()');
    check('3a', 'ANTI-VACUOUS: the scene this harness authored exists in the model',
      scenes.some((s) => s.id === SCENE_ID) && scenes.length === scenes0.length + 1,
      `after=${JSON.stringify(scenes.map((s) => s.id))}`);
    check('3b', 'ANTI-VACUOUS: the panel selected it, so the strip has a scene to draw',
      (await c.evalExpr('window.__dbg.aeon.selectedScene()')) === SCENE_ID);

    // Two more layers, through the real "Add layer" button.
    for (let i = 0; i < 2; i++) { await c.evalExpr(clickByText('/Add layer/')); await sleep(500); }
    const sceneOf = (docs) => docs.find((s) => s.id === SCENE_ID) ?? null;
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('3c', 'the real Add-layer button gave the scene three layers',
      sceneOf(doc)?.layers?.length === 3, `layers=${sceneOf(doc)?.layers?.length}`);

    // Tops, then the splits, all through the layer cards' own controls.
    for (const [i, top] of [[1, TOP_A], [2, TOP_B]]) {
      watchMiss(`3 top L${i}`, await c.evalExpr(SET_INPUT(byTitle('input', `Layer ${i} Screen line`), top)));
      await sleep(400);
    }
    for (const [i, at] of [[1, AT_A], [2, AT_B]]) {
      watchMiss(`3 vsplit toggle L${i}`,
        await c.evalExpr(SET_INPUT(byTitle('select', `Layer ${i} vsplit.at —`), 'at')));
      await sleep(400);
      watchMiss(`3 vsplit at L${i}`,
        await c.evalExpr(SET_INPUT(byTitle('input', `Layer ${i} vsplit.at (`), at)));
      await sleep(400);
    }

    // ---- 4. THE FIXTURE IS WHAT IT CLAIMS TO BE ---------------------------
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const fixture = sceneOf(doc);
    check('4a', `THE VACUITY GUARD: two splits at DISTINCT NON-TRIVIAL tops ${TOP_A} and ${TOP_B}`,
      fixture?.layers?.[1]?.world_y === TOP_A && fixture?.layers?.[2]?.world_y === TOP_B
      && JSON.stringify(fixture?.layers?.[1]?.vsplit) === JSON.stringify({ at: AT_A })
      && JSON.stringify(fixture?.layers?.[2]?.vsplit) === JSON.stringify({ at: AT_B }),
      JSON.stringify(fixture?.layers));
    check('4b', 'the scene is LOCKED, so a layer top HAS a screen line at all',
      fixture?.v_factor === 15, `v_factor=${fixture?.v_factor}`);
    if (!fixture || fixture.layers?.[1]?.world_y !== TOP_A) {
      throw new Error('fixture not authored — every row below would be measuring the wrong scene');
    }

    // ---- 5. IS IT ON THE STRIP? -------------------------------------------
    // Back to the job that draws it. The strip is unmounted while another job
    // is shown, so a report taken here without this line would be about a
    // canvas that is not on the screen.
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1200);
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    const dpr = await c.evalExpr('window.devicePixelRatio');
    const rect = await c.json(`(() => { const cv = document.getElementById('effects-raster-timeline');
      if (!cv) return null; const r = cv.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, bw: cv.width, bh: cv.height }; })()`);
    note(`dpr=${dpr}  strip client rect=${JSON.stringify(rect)}`);
    note(`⚠ backing store ${rect?.bw}x${rect?.bh} is FIXED and independent of dpr — `
      + 'every getImageData aim below is in that space, with no rounding anywhere.');

    check('5a', 'the strip reports ACTIVE for this scene, and it painted',
      rep.active === true && rep.sceneId === SCENE_ID && rep.paints > 0,
      `active=${rep.active} scene=${rep.sceneId} paints=${rep.paints}`);
    check('5b', 'it planned exactly the two splits, at the ENGINE\'s fire lines',
      rep.splits.length === 2
      && rep.splits[0].layer === 1 && rep.splits[0].line === TOP_A && rep.splits[0].at === AT_A
      && rep.splits[1].layer === 2 && rep.splits[1].line === TOP_B && rep.splits[1].at === AT_B,
      JSON.stringify(rep.splits));
    check('5b2', 'and it DREW them — one rule stroked per split, one fill per band',
      rep.markers === 2 && rep.fills === 3,
      `markers=${rep.markers} fills=${rep.fills} bands=${rep.bands.length}`);

    // THE DERIVATION, spelled here rather than trusted: the strip's Y for a
    // screen line is `originY + line * scale`, and both come from the report.
    const yOf = (line) => rep.originY + line * rep.scale;
    // Sample WELL RIGHT of the arrow flag (which is split-coloured and 6px tall,
    // so it would answer for the rule at y+3) and inside the rule's own run.
    const SX = rep.stripX + rep.stripW - 14;
    const SLEN = 18;
    note(`AIM: split A line ${TOP_A} -> strip y ${yOf(TOP_A)};  split B line ${TOP_B} -> y ${yOf(TOP_B)};`
      + `  sampled x ${SX}..${SX + SLEN - 1} (right of the ${rep.stripX}..${rep.stripX + rep.stripW} band column)`);

    const sample = async (line) => watchMiss(`strip row ${line}`, await c.json(STRIP_ROW(yOf(line), SX, SLEN)));
    for (const [tag, line] of [['A', TOP_A], ['B', TOP_B]]) {
      const on = await sample(line);
      const up = await sample(line - 3);
      const dn = await sample(line + 3);
      check(`5c${tag}`, `PIXELS: split ${tag}'s marker IS at line ${line} and is NOT at ${line - 3} or ${line + 3}`,
        on !== null && hasMarker(on) && !hasMarker(up) && !hasMarker(dn),
        `at ${line}: ${rowSummary(on ?? [])}\n        at ${line - 3}: ${rowSummary(up ?? [])}`
        + `\n        at ${line + 3}: ${rowSummary(dn ?? [])}`);
    }

    // COVERED BY THE PAGE? The canvas can draw perfectly and be behind
    // something, clipped to nothing, or inside a collapsed section that never
    // mounted it. `elementFromPoint` at its CENTRE is the least dpr-sensitive
    // question there is, and `checkVisibility` is the browser's own answer.
    //
    // ⚠ AN INSTRUMENT DEFECT THIS ROW FOUND IN ITSELF, KEPT ON THE RECORD. The
    // first run FAILED here with `{isSelf:false, hitId:null}` on a build whose
    // strip was correct: the effects column SCROLLS, the strip sits low in it,
    // and its centre landed BELOW the window's viewport — where
    // `elementFromPoint` answers null for every element, present or not. The fix
    // is in the instrument: scroll the strip into view the way an author would,
    // then hit-test. Weakening the row to accept null would have deleted the
    // only check that can see a covered canvas.
    const vis = await c.json(SCROLL_AND_HIT);
    check('5d', 'the strip is ON SCREEN and NOT COVERED — the page hit-tests to this canvas',
      vis.isSelf === true && vis.visible !== false && vis.w > 0 && vis.h > 0
      && vis.inViewport === true, JSON.stringify(vis));
    await shot(c, '01-strip-two-splits');

    // ---- 6. THE COORDINATE TRAP, HALF ONE: the TOP moves the marker -------
    watchMiss('6 top L1', await onParallax(SET_INPUT(byTitle('input', 'Layer 1 Screen line'), TOP_A2)));
    await sleep(700);
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    check('6a', `moving the top ${TOP_A} -> ${TOP_A2} moved the SPLIT's fire line with it`,
      rep.splits[0].line === TOP_A2, `line=${rep.splits[0].line}`);
    const onNew = await sample2(c, rep, TOP_A2, SX, SLEN);
    const onOld = await sample2(c, rep, TOP_A, SX, SLEN);
    check('6b', `PIXELS: the marker is now at line ${TOP_A2} and GONE from ${TOP_A} `
      + `— ${TOP_A2 - TOP_A} strip px, derived from the app's own scale ${rep.scale}`,
      onNew !== null && hasMarker(onNew) && !hasMarker(onOld),
      `at ${TOP_A2}: ${rowSummary(onNew ?? [])}\n        at ${TOP_A}: ${rowSummary(onOld ?? [])}`);

    // ---- 7. THE COORDINATE TRAP, HALF TWO: `at` moves NOTHING -------------
    //
    // ⚠ THE ROW THIS WHOLE PARCEL TURNS ON. `at` is a PLANE-B ROW — a payload,
    // not a position. A build that drew it on the 224 ruler would move the
    // marker here. The paints counter is checked in the same breath so that
    // "did not move" cannot be "did not repaint".
    const paintsBefore = rep.paints;
    watchMiss('7 at L1', await onParallax(SET_INPUT(byTitle('input', 'Layer 1 vsplit.at ('), AT_A2)));
    await sleep(700);
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    check('7a', `the document took the new payload (at ${AT_A} -> ${AT_A2}) and the strip REPAINTED`,
      rep.splits[0].at === AT_A2 && rep.paints > paintsBefore,
      `at=${rep.splits[0].at} paints ${paintsBefore} -> ${rep.paints}`);
    check('7b', 'THE CATCHER: the fire line did NOT move — `at` is a payload, not a position',
      rep.splits[0].line === TOP_A2, `line=${rep.splits[0].line} (a build drawing \`at\` would say ${AT_A2})`);
    const stillThere = await sample2(c, rep, TOP_A2, SX, SLEN);
    // ⚠ `AT_A2` is 301, which is off a 224-line ruler entirely; the reachable
    // wrong answer a payload-as-position build could produce on THIS ruler is
    // the other split's payload, 44. Both are checked.
    const atPayload = await sample2(c, rep, AT_B, SX, SLEN);
    check('7c', `PIXELS: the marker is STILL at ${TOP_A2} after the payload changed, `
      + `and there is none at line ${AT_B} (the other split's payload)`,
      stillThere !== null && hasMarker(stillThere) && !hasMarker(atPayload),
      `at ${TOP_A2}: ${rowSummary(stillThere ?? [])}\n        at ${AT_B}: ${rowSummary(atPayload ?? [])}`);
    await shot(c, '02-payload-changed-marker-did-not-move');

    // ---- 8. v_offset moves the whole ruler --------------------------------
    watchMiss('8 v_offset', await onParallax(SET_INPUT(byTitle('input', 'v_offset:'), V_OFFSET)));
    await sleep(800);
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    check('8a', `v_offset ${V_OFFSET} lifted both fire lines by exactly ${V_OFFSET} `
      + '(aeon: screen = plane line less v_offset)',
      rep.splits[0].line === TOP_A2 - V_OFFSET && rep.splits[1].line === TOP_B - V_OFFSET,
      `lines=${JSON.stringify(rep.splits.map((s) => s.line))} `
      + `expected ${[TOP_A2 - V_OFFSET, TOP_B - V_OFFSET]}`);
    const moved = await sample2(c, rep, TOP_A2 - V_OFFSET, SX, SLEN);
    const vacated = await sample2(c, rep, TOP_A2, SX, SLEN);
    check('8b', `PIXELS: the marker moved up ${V_OFFSET} lines and vacated ${TOP_A2}`,
      moved !== null && hasMarker(moved) && !hasMarker(vacated),
      `at ${TOP_A2 - V_OFFSET}: ${rowSummary(moved ?? [])}\n        at ${TOP_A2}: ${rowSummary(vacated ?? [])}`);
    await shot(c, '03-v-offset-shifted');
    // Put it back so the closing screenshot is the one worth showing.
    await onParallax(SET_INPUT(byTitle('input', 'v_offset:'), 0));
    await sleep(700);

    // ---- 9. THE CONTROLS, and the blanket miss row ------------------------
    //
    // ⚠ A CONTROL RUN IS NOT A ROW THAT PROVES SOMETHING ON ITS OWN — it is what
    // makes the rows above mean anything. Drop both splits and the strip must go
    // to zero markers AND to zero marker pixels: an empty strip is what a broken
    // one looks like, so the run has to show it can produce both states.
    for (const i of [1, 2]) {
      await onParallax(SET_INPUT(byTitle('select', `Layer ${i} vsplit.at —`), 'none'));
      await sleep(400);
    }
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    const empties = [];
    for (const line of [TOP_A, TOP_A2, TOP_B, AT_B]) {
      const row = await sample2(c, rep, line, SX, SLEN);
      if (row === null || hasMarker(row)) empties.push(`line ${line}: ${rowSummary(row ?? [])}`);
    }
    check('9a', 'THE CONTROL: with both splits dropped, the strip has no markers and no marker pixels',
      rep.splits.length === 0 && rep.markers === 0 && empties.length === 0,
      `splits=${rep.splits.length} markers=${rep.markers} `
      + (empties.length ? `LEFTOVER ${empties.join('; ')}` : 'every probed line clean'));
    check('9b', 'and the bands are still drawn — dropping a split is not dropping the strip',
      rep.active === true && rep.fills === 3, `active=${rep.active} fills=${rep.fills}`);

    // Restore one split for the owner's screenshot.
    await c.evalExpr(SET_INPUT(byTitle('select', 'Layer 1 vsplit.at —'), 'at'));
    await sleep(400);
    await c.evalExpr(SET_INPUT(byTitle('input', 'Layer 1 vsplit.at ('), AT_A));
    await sleep(400);
    await c.evalExpr(SET_INPUT(byTitle('select', 'Layer 2 vsplit.at —'), 'at'));
    await sleep(400);
    await c.evalExpr(SET_INPUT(byTitle('input', 'Layer 2 vsplit.at ('), AT_B));
    await sleep(700);
    await c.evalExpr(SCROLL_AND_HIT);
    await sleep(300);
    await shot(c, '04-for-the-owner');

    check('9c', 'BLANKET: no probe in this run came back `no-element` or null',
      misses.length === 0, misses.length === 0 ? 'clean' : misses.join('\n        '));

    // ---- 10. Clean up the fixture out of the aeon tree ---------------------
    await c.evalExpr(clickByText('/Delete scene/'));
    await sleep(600);
    const left = await c.json('window.__dbg.aeon.scenes()');
    note(`scenes after cleanup: ${JSON.stringify(left.map((s) => s.id))}`);
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
}

/** `STRIP_ROW` at a screen line, using the report's OWN published geometry. */
async function sample2(c, rep, line, x, len) {
  return c.json(STRIP_ROW(rep.originY + line * rep.scale, x, len));
}

main().catch((e) => { console.error(e); process.exit(1); });
