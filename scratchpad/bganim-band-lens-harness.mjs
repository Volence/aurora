#!/usr/bin/env node
// CAN AN AUTHOR SEE — AND MARK — A BAND'S FOOTPRINT, IN THE RUNNING APP?
//
// ROADMAP item 43 part 2. The map tints every background cell whose layout word
// names a slot in the marked range, and a click on a cell marks: an ANIMATED
// index selects that band's card, a STATIC one seeds the promotion candidate.
//
// Every word of that is invisible to the node suite — React, a canvas, a
// pan/zoom transform, and a real mousedown/mouseup. 4,675 vitest tests pass over
// this feature and not one can tell a drawn tint from a dead one, or a wired
// gesture from an unwired one. So this drives the REAL app over CDP.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. A COVERAGE SET COMPUTED BY THE APP AND CHECKED BY THE APP. Section 4 counts
//    the covered cells INDEPENDENTLY, in this file, from the raw layout words
//    pulled out of the model and the mask read off the vendored contract JSON on
//    disk — never from `bandLens().cells`. If the app's scan and this file's
//    scan disagree, the row fails and names both numbers.
//
// 2. NOTHING ON SCREEN. Section 8 samples the map canvas's actual pixels and
//    checks the covered cell against the ALPHA COMPOSITE PREDICTED FROM
//    `BAND_LENS_FILL`, read off canvas-colors.ts in this process. The baseline
//    is THE SAME PIXEL with the mark cleared, so the claim is one cell changing
//    rather than two cells differing; [8c] then requires an uncovered cell — and
//    a point outside the 64x64 plane entirely — to be byte-identical with the
//    lens on and off, with no tolerance. A row that merely asked "is there a
//    colour somewhere" would pass on a wall of that colour.
//
// 3. A CLICK THAT IS REALLY A PAN. Section 9 presses on a cell, moves 40px and
//    releases. The effects facet's only tool is `view`, so if the mark branch
//    took the press instead of falling through, panning would be dead — and if
//    it committed on any release, every pan would re-mark. Neither may happen.
//
// 4. A MARK THAT OUTLIVES ITS SUBJECT. Section 10 presses on a static cell, then
//    DEMOTES a band mid-press through a synthetic DOM click — a non-pointer
//    path, the exact shape of the defect item 43 part 1 already has on record —
//    and releases. A band command renumbers the blob and rewrites every layout
//    word, so the slot that cell named is not the slot it names now. Nothing may
//    be seeded, and the report must say `dropped` rather than going quiet.
//
// 5. THE BLANK ESCAPE. Section 6 clicks a cell whose layout word is EXACTLY
//    zero. That renders VRAM tile 0 and does NOT mean `tiles[0]`; seeding 0 from
//    it would silently mark the first ANIMATED slot from a cell that draws
//    nothing.
//
// 6. A CLOCK NOBODY ASKED FOR. Section 11 sits with the lens ACTIVE for 3s and
//    asserts zero map repaints while the page is provably still painting.
//
// 7. THE COLLAPSED SECTION. Sections 3-6 run BEFORE any panel section is opened,
//    and [3b] asserts both band sections really are shut at that moment. The
//    lens's state lives in the store, not in the panel's DOM, so it must work
//    with the panel closed — which is the arrival state at every window size
//    since ROADMAP item 45's short-screen close.
//
// ═══ ANTI-VACUOUS, AND THE SUBJECT IS ASSERTED ═══
//
// `bandLens()` is a PUBLISH — MapViewport writes it at the end of its draw body
// — so `active: false` and a stalled `paints` counter are both real answers a
// row can fail on. And [2c] asserts the instrument is looking at the subject it
// means: a readable override document, at least one band, and a viewport whose
// background actually RESOLVES TO THE OVERRIDE. A run on a project painting the
// act default would light nothing and prove nothing.
//
// ═══ AIM AT INTEGERS. THE CANVAS RECT IS NOT INTEGRAL. ═══
//
// `devicePixelRatio` varies between runs here (1, 1.35 and 0.99999998 all
// observed), and at anything but 1 the canvas rect is fractional. Asking CDP for
// a fractional client coordinate delivers the nearest integer — the previous
// device row — and the app correctly resolves a cell one lower. It presents as
// an off-by-one bug in the feature and the feature is fine.
//
// So every aim below is an INTEGER, and the cell each row expects is DERIVED
// FROM THAT INTEGER through the app's own transform (`vp.x + (aim - rect.left) /
// zoom`, then `floor(world / 8)`), never from the cell this file wanted. A
// candidate cell whose integer aim does not re-derive to itself is rejected and
// the search moves on. dpr and the rect are PRINTED every run.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed. The one command it runs
// (section 10's Demote) is undone, and the run ends by asserting the override
// document hashes back to exactly what it was at [2c].
//
// ⚠ PARCEL B (2026-08-26, branch parcel/mark-band-tool) MOVED THE MARK OFF
//    VIEW. The click gesture every section below drives now fires only under
//    the `mark-band` dock tool (letter `n` with the map focused); in View a
//    click seeds nothing, by design (triage §A.3). RE-RUN WITH THE TOOL
//    SELECTED and expect the same rows (37/38 + 1 NM). The pan row (section 9)
//    holds under both tools; a View-tool click is now a second "seeds nothing"
//    case this harness does not yet have a row for.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     node scratchpad/bganim-band-lens-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
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
const SHOTS = `${ROOT}/scratchpad/shots-band-lens`;
mkdirSync(SHOTS, { recursive: true });

// ── CONSTANTS, READ FROM THE VENDORED CONTRACT, NEVER TYPED HERE ────────────
// This is what makes section 4's cross-check independent rather than the app
// grading its own homework: the mask comes from the same JSON the codec's loud
// accessor reads, off disk, in this process.
const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
function contractConst(name) {
  const v = CONTRACT?.constants?.[name]?.value;
  if (typeof v !== 'number') throw new Error(`contract has no constants.${name}.value`);
  return v;
}
const MASK = contractConst('LAYOUT_TILE_INDEX_MASK');
const LAYOUT_WORDS = contractConst('BG_LAYOUT_WORDS');
// The plane width, from the contract's own citation of its shape rather than a
// typed 64 — the same derivation bganim-marquee-resolution-probe.mjs uses.
const PLANE_COLS = (() => {
  const cite = JSON.stringify(CONTRACT);
  const m = /COLS,\s*ROWS\s*=\s*(\d+),\s*(\d+)/.exec(cite);
  if (!m) throw new Error('contract no longer cites the plane shape as `COLS, ROWS = w, h`');
  const [cols, rows] = [Number(m[1]), Number(m[2])];
  if (cols * rows !== LAYOUT_WORDS) {
    throw new Error(`contract plane ${cols}x${rows} does not make BG_LAYOUT_WORDS ${LAYOUT_WORDS}`);
  }
  return cols;
})();
/** Pixels per background cell. `TILE_WIDTH_PX` is the contract's own name for it. */
const CELL_PX = contractConst('TILE_WIDTH_PX');

/**
 * `BAND_LENS_FILL`, READ OUT OF `canvas-colors.ts` RATHER THAN RE-TYPED.
 *
 * Section 8 predicts the alpha composite from these four numbers, so a change to
 * the constant changes the prediction and the row keeps meaning the same thing.
 * A literal here would be a pin: it would go red on a deliberate palette change
 * and — worse — would still be green if the code and the harness were BOTH
 * changed to a colour the design ruling forbids.
 */
const FILL = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/canvas/canvas-colors.ts`, 'utf8');
  const m = /BAND_LENS_FILL\s*=\s*'rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)'/.exec(src);
  if (!m) throw new Error('canvas-colors.ts no longer declares BAND_LENS_FILL as an rgba() literal');
  return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
})();

/** The zoom every mouse section pins. 2 makes a cell 16 screen px. */
const ZOOM = 2;

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
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/**
 * A THIRD VERDICT, and it is NOT GREEN.
 *
 * The reference this repo keeps is `[H1]`, which under a planted
 * `overflowY: visible` answers "COULD NOT MEASURE A FIT" rather than "fits". A
 * row whose SUBJECT does not exist on the document under test has not passed and
 * has not failed — and folding it into either number is the lie. It is counted
 * on its own line, named, with the reason, and with wherever the property IS
 * proven instead.
 */
function unmeasurable(id, name, why) {
  console.log(`NOT-MEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: false, nm: true });
  unmeasured.push(`[${id}] ${name} — ${why}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-band-lens/${name}.png`);
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

/**
 * Open (or report) one CollapsibleSection by its header text.
 *
 * `CollapsibleSection` renders no `<button>` and no `aria-expanded` — its header
 * is a styled `<div>` and a collapsed section renders NO CHILDREN AT ALL. That
 * last fact is what makes "already-open" detectable, and it is also the reason
 * every band harness in this repo has to open these two sections before
 * touching anything in them. Copied from bganim-motion-harness's OPEN_BAND_LIST.
 */
// ⚠ THE TILE-ANIM SUB-TAB (2026-09-02, `three_sub_tabs_plus_section_strip`;
// providers/effects-sub-tabs.ts). `aeon.bganim.bands` and `aeon.bganim.new` are
// on the `tileAnim` tab and the facet arrives on `parallax`. A section on an
// inactive tab is NOT MOUNTED — not collapsed, absent — so both SECTION_STATE
// calls below answered 'no-section' and thirteen rows failed at once. The tab
// button is a real <button onClick> (EffectsSubTabBar.tsx).
const SELECT_TILE_ANIM_TAB = String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="tileAnim"]');
  if (!t) return 'no-tab-bar';
  t.click();
  return 'clicked';
})()`;

const SECTION_STATE = (re, click) => String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => ${re}.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-section';
  const open = hdr.parentElement.parentElement.children.length > 1;
  if (!${click ? 'true' : 'false'}) return open ? 'open' : 'collapsed';
  if (open) return 'already-open';
  hdr.click();
  return 'clicked';
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

const REPAINT_PROBE = String.raw`
(() => {
  if (window.__lensProbe) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
  window.__lensProbe = P;
  // THE ALTERNATIVE GREEN PATH: the probe counts writes to the element it
  // captured, so a canvas REPLACED after install would repaint freely while
  // this reports zero. bound() is asserted beside the count.
  P.bound = () => P.canvas === document.getElementById('map-canvas');
  const tick = () => { if (P.ticking) { P.ticks++; requestAnimationFrame(tick); } };
  P.start = () => { if (!P.ticking) { P.ticking = true; requestAnimationFrame(tick); } };
  P.stop = () => { P.ticking = false; };
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) { if (this === P.canvas) P.repaints++; return wd.set.call(this, v); },
  });
  return 'installed';
})()`;

/**
 * How magenta a pixel is, as a plain channel distance.
 *
 * The tint is `rgba(255,90,200,0.34)` composited over whatever the map painted,
 * so the exact triple is unpredictable and a hardcoded one would be a pin. What
 * IS predictable is the SHAPE — red and blue both raised, green pushed down.
 * The uncovered sample beside it is what stops this passing on pink art.
 */
function magentaness(p) {
  if (!p) return -999;
  return Math.min(p.r, p.b) - p.g;
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

    // ---- 0. PROVENANCE ----------------------------------------------------
    // `__dbg.aeon.bandLens` is introduced by THIS branch and exists nowhere on
    // master. Without this row every PASS below could describe a build with
    // none of the parcel in it.
    const haveProbe = await c.evalExpr(
      'typeof window.__dbg.aeon.bandLens === "function" && typeof window.__dbg.aeon.bandMark === "function"');
    check('0a', 'the build under test contains the band-lens probe (this branch, not master)',
      haveProbe === true, `${RUN.root}/dist`);
    if (!haveProbe) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon -----------------------------------------------------
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

    // ---- 2. The Effects facet, and THE SUBJECT ----------------------------
    await sleep(2500);
    const pill = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill', pill === true);
    await sleep(1500);
    const tabbed = await c.evalExpr(SELECT_TILE_ANIM_TAB);
    await sleep(1000);
    const subTab = await c.evalExpr('window.__dbg.parallaxPreview().subTab');
    check('2a2', 'the Tile anim sub-tab is active, so its sections are MOUNTED [instrument]',
      subTab === 'tileAnim',
      `SELECT_TILE_ANIM_TAB -> ${JSON.stringify(tabbed)}; store subTab=${JSON.stringify(subTab)}`);
    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(Scenes|Layers|Tile animations|New tile animation)/.test(t))`);
    check('2b', 'ANTI-VACUOUS: the Effects panel is mounted with the band sections',
      headings.some((t) => t.startsWith('Tile animations')), JSON.stringify(headings));

    // THE SUBJECT ASSERTION. A run on a project with no override document, no
    // bands, or a viewport painting the ACT DEFAULT would light nothing and
    // prove nothing — and would look like a clean pass everywhere below.
    await c.evalExpr(`window.__dbg.setView(0, 0, ${ZOOM})`);
    await sleep(600);
    const status = await c.json('window.__dbg.aeon.bgOverrideStatus()');
    const bands = await c.json('window.__dbg.aeon.bands()');
    const budget = await c.json('window.__dbg.aeon.bandBudget()');
    const bgSource = await c.evalExpr('window.__dbg.aeon.bgSource()');
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('2c', 'ANTI-VACUOUS: a readable override document, at least one band, and the '
      + 'viewport is painting THAT document',
      !!(status && status.present && !status.unreadable) && bands.length > 0 && bgSource === 'override',
      `status=${JSON.stringify(status)} bands=${bands.length} source=${bgSource} `
      + `budget=${JSON.stringify(budget)} hash=${hash0}`);
    if (bgSource !== 'override' || bands.length === 0) {
      throw new Error('the subject is not what this harness measures — see [2c]');
    }

    // The whole plane, in ONE eval. Everything below cross-checks against this.
    const layout = await c.json(
      `Array.from({length: ${LAYOUT_WORDS}}, (_, i) => window.__dbg.aeon.bgOverrideLayoutAt(i))`);
    check('2d', 'ANTI-VACUOUS: the model hands back a full plane of layout words',
      Array.isArray(layout) && layout.length === LAYOUT_WORDS
        && layout.some((w) => w !== 0) && layout.every((w) => typeof w === 'number'),
      `${layout.length} words, ${layout.filter((w) => w !== 0).length} non-blank`);

    /** The covered cells for a range, computed HERE from the raw words. */
    const coverIndependently = (base, count) => {
      const out = [];
      for (let i = 0; i < layout.length; i++) {
        const w = layout[i];
        if (w === 0) continue;                 // the consumer's blank escape
        const slot = w & MASK;
        if (slot >= base && slot < base + count) out.push(i);
      }
      return out;
    };

    // ---- 3. ARRIVAL: nothing marked, nothing lit --------------------------
    const t0 = await c.json('window.__dbg.aeon.bandLens()');
    const target0 = await c.json('window.__dbg.aeon.bandLensTarget()');
    check('3a', 'on arrival NOTHING is marked and the lens draws nothing — but the pass RAN',
      target0 === null && t0.active === false && t0.cells === 0 && t0.paints > 0,
      `target=${JSON.stringify(target0)} lens=${JSON.stringify(t0)}`);

    // THE COLLAPSED-SECTION CALL, asserted rather than assumed. Both band
    // sections arrive shut (ROADMAP item 45), and everything in sections 4-6
    // runs with them shut.
    const sBands = await c.evalExpr(SECTION_STATE('/^Tile animations\\b/', false));
    const sNew = await c.evalExpr(SECTION_STATE('/^New tile animation/', false));
    // A collapsed CollapsibleSection renders NO CHILDREN, so the form controls
    // are not merely hidden — they are absent from the DOM. That absence is the
    // assertion: it is what makes "the lens works with the panel shut" a claim
    // about the STORE rather than about a stylesheet.
    const controlsPresent = await c.json(
      `[...document.querySelectorAll('input[type=number], select')]
         .filter(e => /^(cols|rows —|static base)/.test(e.title||'')).length`);
    check('3b', 'ANTI-VACUOUS for the collapsed-section call: BOTH band sections are SHUT, and '
      + 'their controls are ABSENT FROM THE DOM — so everything in 4-6 runs with the panel closed',
      sBands === 'collapsed' && sNew === 'collapsed' && controlsPresent === 0,
      `bands=${sBands} new=${sNew} band-form controls in the DOM=${controlsPresent}`);

    // ---- 4. CLICK A STATIC CELL: the candidate seeds ----------------------
    const rect = await c.json(CANVAS_RECT);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    const view = await c.json('window.__dbg.view()');
    note(`ENVIRONMENT  devicePixelRatio=${dpr}  canvasRect=${JSON.stringify(rect)}  view=${JSON.stringify(view)}`);
    check('4a', 'ANTI-VACUOUS: the map canvas is mounted, with a real box, at the pinned zoom',
      !!rect && rect.width > 200 && rect.height > 200 && view.zoom === ZOOM && view.x === 0 && view.y === 0,
      `${JSON.stringify(rect)} ${JSON.stringify(view)}`);

    /**
     * An integer client aim for a cell, and the cell that aim RE-DERIVES to
     * through the app's own transform. Returns null when the two differ, so a
     * fractional rect can never make a row assert a cell the app never saw.
     */
    const aimFor = (col, row) => {
      const cx = Math.round(rect.left + (col * CELL_PX + CELL_PX / 2) * view.zoom);
      const cy = Math.round(rect.top + (row * CELL_PX + CELL_PX / 2) * view.zoom);
      if (cx < rect.left || cy < rect.top
        || cx > rect.left + rect.width - 1 || cy > rect.top + rect.height - 1) return null;
      const wx = view.x + (cx - rect.left) / view.zoom;
      const wy = view.y + (cy - rect.top) / view.zoom;
      const dCol = Math.floor(wx / CELL_PX), dRow = Math.floor(wy / CELL_PX);
      if (dCol !== col || dRow !== row) return null;
      return { x: cx, y: cy };
    };

    /**
     * Find a cell matching `pred(word, slot)` whose integer aim re-derives to it.
     *
     * EDGE CELLS ARE SKIPPED (col/row 0 and the last): section 8 samples a pixel
     * at the cell's centre, and a cell on the plane's boundary sits against the
     * canvas edge where a half-pixel of rounding decides which cell was hit.
     */
    const findCell = (pred) => {
      for (let i = 0; i < layout.length; i++) {
        const col = i % PLANE_COLS, row = Math.floor(i / PLANE_COLS);
        if (col < 1 || row < 1 || col >= PLANE_COLS - 1) continue;
        const w = layout[i];
        if (!pred(w, w === 0 ? null : w & MASK)) continue;
        const aim = aimFor(col, row);
        if (aim) return { cell: i, col, row, word: w, slot: w === 0 ? null : w & MASK, aim };
      }
      return null;
    };

    const animatedSlots = budget.animatedSlots;
    const staticCell = findCell((w, s) => s !== null && s >= animatedSlots);
    const animCell = findCell((w, s) => s !== null && s < animatedSlots);
    check('4b', 'ANTI-VACUOUS: the plane offers a static cell and an animated cell, each at an '
      + 'integer aim that re-derives to itself',
      !!staticCell && !!animCell,
      `static=${JSON.stringify(staticCell)} anim=${JSON.stringify(animCell)}`);
    if (!staticCell || !animCell) throw new Error('no usable cells — see [4b]');

    // ── THE TWO "SEEDS NOTHING" CELLS, AND WHETHER THIS DOCUMENT HAS THEM ──
    // `blank` (word === 0) and `out-of-blob` (slot >= tiles.length) are the two
    // marks that must change nothing. Whether either exists is a property of the
    // DOCUMENT, not of the feature — the live OJZ background happens to name a
    // real tile in all 4,096 cells. Measured, and reported either way; the row
    // below goes NOT-MEASURABLE rather than green when the subject has neither.
    const blankCell = findCell((w) => w === 0);
    const outOfBlobCell = findCell((w, s) => s !== null && s >= budget.tiles);
    note(`SEEDS-NOTHING CELLS on this document: blank(word===0) ${blankCell ? 'present' : 'ABSENT'}, `
      + `out-of-blob(slot >= ${budget.tiles}) ${outOfBlobCell ? 'present' : 'ABSENT'} `
      + `— ${layout.filter((w) => w === 0).length} of ${layout.length} words are blank`);

    const clickAt = async (x, y) => {
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
      await sleep(80);
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
      await sleep(500);
    };

    /** A real key press through CDP (the same spelling as tool-keys-harness). */
    const pressKey = async (k, code, vk) => {
      const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: 0 };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(250);
    };
    /** The dock's tool buttons carry the label as aria-label (ui ToolButton). */
    const clickDockTool = async (label) => {
      const ok = await c.evalExpr(`(() => {
        const b = [...document.querySelectorAll('button')].find((e) => e.getAttribute('aria-label') === ${JSON.stringify(label)});
        if (!b) return false; b.click(); return true; })()`);
      await sleep(300);
      return ok;
    };

    // ---- 3c. ARM THE TOOL (parcel B, 2026-08-26). Marking a band is its own
    // tool now; in View a click on the plane seeds NOTHING. The letter is
    // tool-meta's `n`, pressed as a REAL key with focus off any input.
    const toolBefore = await c.evalExpr('window.__dbg.aeon.state().tool');
    await c.evalExpr('document.activeElement && document.activeElement.blur()');
    await pressKey('n', 'KeyN', 78);
    const toolArmed = await c.evalExpr('window.__dbg.aeon.state().tool');
    check('3c', "pressing `n` arms the `mark-band` tool (parcel B: the mark is a tool, not a View side-effect)",
      toolBefore === 'view' && toolArmed === 'mark-band', `before=${toolBefore} after=${toolArmed}`);
    if (toolArmed !== 'mark-band') throw new Error('mark-band did not arm — every click row below would be vacuous');

    const marks0 = (await c.json('window.__dbg.aeon.bandMark()')).marks;
    await clickAt(staticCell.aim.x, staticCell.aim.y);
    const mark1 = await c.json('window.__dbg.aeon.bandMark()');
    const cand1 = await c.json('window.__dbg.aeon.bandCandidate()');
    check('4c', 'a click on a STATIC cell seeds the candidate AT that cell\'s slot',
      mark1.marks === marks0 + 1 && mark1.kind === 'candidate'
      && mark1.cell === staticCell.cell && mark1.slot === staticCell.slot
      && cand1.staticBase === staticCell.slot,
      `aim=${JSON.stringify(staticCell.aim)} expected cell ${staticCell.cell} slot ${staticCell.slot}; `
      + `mark=${JSON.stringify(mark1)} candidate=${JSON.stringify(cand1)}`);

    const lens1 = await c.json('window.__dbg.aeon.bandLens()');
    const indep1 = coverIndependently(cand1.staticBase, cand1.cols * cand1.rows);
    check('4d', 'the LAST REPAINT lit that range — and the app\'s cell count equals this '
      + 'harness\'s own scan of the raw layout words',
      lens1.active === true && lens1.kind === 'candidate'
      && lens1.range.base === staticCell.slot
      && lens1.range.count === cand1.cols * cand1.rows
      && lens1.cells === indep1.length && indep1.length > 0,
      `lens=${JSON.stringify(lens1)} independent=${indep1.length} cells (mask 0x${MASK.toString(16)} `
      + `from the contract, ${PLANE_COLS} words/row)`);
    check('4e', 'the clicked cell is itself inside the footprint',
      indep1.includes(staticCell.cell), `cell ${staticCell.cell} of ${indep1.length}`);
    await shot(c, 'lens-static-seed');

    // ---- 5. CLICK AN ANIMATED CELL: the map is band navigation ------------
    await clickAt(animCell.aim.x, animCell.aim.y);
    const mark2 = await c.json('window.__dbg.aeon.bandMark()');
    const target2 = await c.json('window.__dbg.aeon.bandLensTarget()');
    const owner = bands.find((b) => animCell.slot >= b.slotBase && animCell.slot < b.slotBase + b.tileCount);
    check('5a', 'a click on an ANIMATED cell selects THAT band, derived from the band list',
      !!owner && mark2.kind === 'band' && mark2.value === owner.index
      && target2 && target2.kind === 'band' && target2.index === owner.index,
      `slot ${animCell.slot} -> band ${owner ? owner.index : 'NONE'}; `
      + `mark=${JSON.stringify(mark2)} target=${JSON.stringify(target2)}`);

    const lens2 = await c.json('window.__dbg.aeon.bandLens()');
    const indep2 = owner ? coverIndependently(owner.slotBase, owner.tileCount) : [];
    check('5b', 'the lens lights that band\'s WHOLE slot range, cross-checked independently',
      !!owner && lens2.active === true && lens2.kind === 'band' && lens2.bandIndex === owner.index
      && lens2.range.base === owner.slotBase && lens2.range.count === owner.tileCount
      && lens2.cells === indep2.length,
      `band ${owner?.index} slots ${owner?.slotBase}..${owner ? owner.slotBase + owner.tileCount : '?'}; `
      + `lens=${JSON.stringify(lens2)} independent=${indep2.length}`);

    // THE FOOTPRINT THIS FEATURE EXISTS FOR: one slot painting far more of the
    // picture than its share. Reported, never judged — it is not a failure.
    const perSlotMax = lens2.largestSlotCells;
    note(`FOOTPRINT of band ${owner?.index} (${owner?.cols}x${owner?.rows}): `
      + `${lens2.cells} cells total, largest single slot ${perSlotMax} cells `
      + `(${owner ? (perSlotMax / owner.tileCount).toFixed(1) : '?'}x the per-slot mean). `
      + 'NEUTRAL INFORMATION — promotion animates a range wherever the picture uses it.');
    check('5c', 'ANTI-VACUOUS: the band actually paints something, so 5b is not comparing zeroes',
      lens2.cells > 0 && perSlotMax !== null && perSlotMax > 0,
      `cells=${lens2.cells} largest=${perSlotMax}`);
    await shot(c, 'lens-band-selected');

    // ---- 5d. THE BAND CARD'S OWN FOOTPRINT LINE --------------------------
    // Read AFTER section 7 opens the section (a collapsed section renders no
    // children), so this is deferred; the marker below is where it is asserted.

    // ---- 5e. THE CARD IS THE LENS'S OTHER END ----------------------------
    // Clicking an animated CELL selected the card; clicking the CARD must light
    // the same cells. Deferred with 5d for the same reason.

    // ---- 6. A CLICK THAT MUST SEED NOTHING -------------------------------
    // The blank escape (`word === 0`, VRAM tile 0, NOT `tiles[0]`) and the
    // out-of-blob word. Which of the two this row can test is a property of the
    // document on screen, and the row NAMES the one it used.
    const seedsNothing = blankCell
      ? { cell: blankCell, want: 'blank' }
      : outOfBlobCell ? { cell: outOfBlobCell, want: 'out-of-blob' } : null;
    if (seedsNothing) {
      const before6 = await c.json('window.__dbg.aeon.bandCandidate()');
      const target6a = await c.json('window.__dbg.aeon.bandLensTarget()');
      const marks6 = (await c.json('window.__dbg.aeon.bandMark()')).marks;
      await clickAt(seedsNothing.cell.aim.x, seedsNothing.cell.aim.y);
      const mark3 = await c.json('window.__dbg.aeon.bandMark()');
      const after6 = await c.json('window.__dbg.aeon.bandCandidate()');
      const target6b = await c.json('window.__dbg.aeon.bandLensTarget()');
      check('6a', `a click on a ${seedsNothing.want.toUpperCase()} cell seeds NOTHING — and the `
        + 'gesture provably RAN rather than never firing',
        mark3.marks === marks6 + 1 && mark3.kind === seedsNothing.want
        && mark3.cell === seedsNothing.cell.cell
        && JSON.stringify(after6) === JSON.stringify(before6)
        && JSON.stringify(target6b) === JSON.stringify(target6a),
        `mark=${JSON.stringify(mark3)} candidate before=${JSON.stringify(before6)} after=${JSON.stringify(after6)}`);
    } else {
      // ⚠ NOT GREEN. "COULD NOT MEASURE" is not a pass — the live OJZ background
      // names a real tile in all 4,096 cells, so neither seeds-nothing cell
      // exists to click. The classifier's blank-escape and out-of-blob branches
      // ARE covered, in the node suite (band-coverage.test.ts, three rows, and
      // the `escape` plant that turns them red) — but not on a canvas, and this
      // line is the disclosure rather than a row quietly not running.
      unmeasurable('6a', 'a click on a cell that must seed NOTHING (blank / out-of-blob)',
        'COULD NOT MEASURE A SEEDS-NOTHING CELL on this document: every one of its '
        + `${layout.length} layout words names a real tile below the blob's ${budget.tiles}, so `
        + 'neither a blank cell nor an out-of-blob one exists to click. The two branches ARE '
        + 'proven — in the node suite (band-coverage.test.ts, three rows, plus the `escape` '
        + 'plant that turns them red) — but NOT on a canvas. This is not a pass.');
    }

    // ---- 6b. A CLICK OFF THE PLANE ---------------------------------------
    // The plane is 64x64 cells; the act is far bigger. A click past its edge
    // resolves to no cell at all, so the press must not even record a mark —
    // a different branch from "a cell that names nothing", and one this
    // document CAN exercise.
    //
    // AT ZOOM 1, because at the pinned zoom 2 the plane's far edge (world 512px)
    // lands past the canvas. Restored immediately after, and every later row
    // re-reads the view rather than trusting this.
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(500);
    const view6 = await c.json('window.__dbg.view()');
    const offX = Math.round(rect.left + (PLANE_COLS * CELL_PX + 4) * view6.zoom);
    const offY = Math.round(rect.top + 40);
    const marks6b = (await c.json('window.__dbg.aeon.bandMark()')).marks;
    const cand6b = await c.json('window.__dbg.aeon.bandCandidate()');
    if (view6.zoom === 1 && offX < rect.left + rect.width - 1) {
      await clickAt(offX, offY);
      const mark6b = await c.json('window.__dbg.aeon.bandMark()');
      const cand6c = await c.json('window.__dbg.aeon.bandCandidate()');
      check('6b', 'a click PAST the edge of the 64x64 plane records no mark at all',
        mark6b.marks === marks6b && JSON.stringify(cand6c) === JSON.stringify(cand6b),
        `aim=(${offX},${offY}) at zoom ${view6.zoom}, plane edge world ${PLANE_COLS * CELL_PX}px; `
        + `marks ${marks6b}->${mark6b.marks} candidate ${JSON.stringify(cand6b)}`);
    } else {
      unmeasurable('6b', 'a click PAST the edge of the 64x64 plane records no mark',
        `the plane's right edge (world ${PLANE_COLS * CELL_PX}px, screen ${offX}) is off the `
        + `${Math.round(rect.width)}px canvas at zoom ${view6.zoom}.`);
    }
    await c.evalExpr(`window.__dbg.setView(0, 0, ${ZOOM})`);
    await sleep(500);

    // ---- 7. THE STORE LIFT: the form moves the map ------------------------
    // Open both sections (they arrive shut) and drive the real controls.
    const openBands = await c.evalExpr(SECTION_STATE('/^Tile animations\\b/', true));
    const openNew = await c.evalExpr(SECTION_STATE('/^New tile animation/', true));
    await sleep(700);
    check('7z', '[instrument] both band sections opened the way a human opens them',
      (openBands === 'clicked' || openBands === 'already-open')
      && (openNew === 'clicked' || openNew === 'already-open'),
      `bands=${openBands} new=${openNew}`);
    await clickAt(staticCell.aim.x, staticCell.aim.y);   // back onto the candidate
    const colsInput = `[...document.querySelectorAll('input[type=number]')].find(e => /^cols/.test(e.title||''))`;
    const setCols = await c.evalExpr(SET_INPUT(colsInput, 4));
    await sleep(600);
    const rowsSel = `[...document.querySelectorAll('select')].find(e => /rows — constrained/.test(e.title||''))`;
    const setRows = await c.evalExpr(SET_INPUT(rowsSel, 2));
    await sleep(700);
    const cand7 = await c.json('window.__dbg.aeon.bandCandidate()');
    const lens7 = await c.json('window.__dbg.aeon.bandLens()');
    const indep7 = coverIndependently(cand7.staticBase, cand7.cols * cand7.rows);
    check('7a', 'ANTI-VACUOUS: the panel controls were found and driven',
      setCols === 'ok' && setRows === 'ok', `cols=${setCols} rows=${setRows}`);
    check('7b', 'THE LIFT: a keystroke in the PANEL changes what the MAP lights — 4x2 = 8 slots',
      cand7.cols === 4 && cand7.rows === 2
      && lens7.range.count === 8 && lens7.range.base === cand7.staticBase
      && lens7.cells === indep7.length,
      `candidate=${JSON.stringify(cand7)} lens=${JSON.stringify(lens7)} independent=${indep7.length}`);
    check('7c', 'a wider range is a superset of the narrower one it grew from',
      indep7.length >= indep1.length && indep1.every((cell) => indep7.includes(cell)),
      `1x1 -> ${indep1.length} cells, 4x2 -> ${indep7.length} cells`);

    // THE PANEL PRINTS THE SAME SENTENCE THE CANVAS DOES, from the same
    // resolution — and it is NEUTRAL. A `tone="warning"` on a footprint would
    // be this surface pre-judging the owner's call.
    // ⚠ `children.length <= 1`, not `=== 0`: the line now LEADS WITH A SWATCH of
    // the wash's own colour (a one-element span), which is the whole point of
    // the legibility fix. Prefix-anchored so an ancestor cannot match too.
    const footprintLine = await c.json(
      `[...document.querySelectorAll('*')].filter(e => e.children.length <= 2   /* swatch + parcel A's Hide chip */
         && /^highlighted on the map · paints/.test((e.textContent||'').trim()))
         .map(e => (e.textContent||'').trim())`);
    const footprintSwatch = await c.json(
      `[...document.querySelectorAll('*')].filter(e => (e.children.length === 1 || e.children.length === 2)   /* swatch (+ Hide chip) */
         && /^highlighted on the map · paints/.test((e.textContent||'').trim()))
         .map(e => { const s = e.firstElementChild; const cs = getComputedStyle(s);
                     return { tag: s.tagName, bg: cs.backgroundColor, border: cs.borderTopColor,
                              w: cs.width, h: cs.height }; })`);
    check('7d', 'the panel prints the footprint, with the SAME cell count the canvas drew',
      footprintLine.length > 0 && footprintLine[0].includes(`paints ${lens7.cells} cell`),
      JSON.stringify(footprintLine));
    // THE LEGIBILITY FIX, asserted. The owner's sentence about the first
    // revision was that the wash "read as 'something/information' — just didn't
    // know what it was". The line now LEADS WITH A SWATCH of the wash's own
    // colour and the word `highlighted`, so the column says which colour it is
    // talking about at the moment the author selects the band.
    //
    // ⚠ THE SIZE IS NOT PINNED TO A PIXEL STRING. `getComputedStyle` reports the
    // USED width, which Chromium snaps to the device grid: `9px` at dpr 1 and
    // `8.8889px` at dpr 1.35, and this row failed once on exactly that. It is
    // the same hazard as the mouse aims, in a different disguise — and the size
    // was never the property. The COLOUR is: it must be the lens's own fill and
    // edge, read off canvas-colors.ts in this process.
    const sw = footprintSwatch[0];
    check('7h', "the footprint line leads with a SWATCH painted in the lens's own fill and "
      + 'edge colours (size not pinned — the used value moves with dpr)',
      footprintSwatch.length > 0
      && sw.bg === `rgba(${FILL.r}, ${FILL.g}, ${FILL.b}, ${FILL.a})`
      && parseFloat(sw.w) > 0 && parseFloat(sw.h) > 0
      && Math.abs(parseFloat(sw.w) - parseFloat(sw.h)) < 1,
      `${JSON.stringify(footprintSwatch)} vs BAND_LENS_FILL rgba(${FILL.r}, ${FILL.g}, ${FILL.b}, ${FILL.a}) `
      + `at dpr ${dpr}`);
    check('7e', 'THE RULING: that sentence carries no warning vocabulary',
      footprintLine.length > 0
      && !/warn|caution|careful|danger|problem|too many|excessiv|beware|!/i.test(footprintLine[0])
      && !/\b(only|but|just|however)\b/i.test(footprintLine[0]),
      JSON.stringify(footprintLine));
    await shot(c, 'lens-candidate-4x2');

    // ---- 8. IS THERE A WASH ON THE CANVAS, AND IS IT THE ONE THE CONSTANT SAYS? --
    //
    // Not "is it colour X" — the lens's wash is ACHROMATIC (a cool near-neutral;
    // the hue wheel on this canvas is full and magenta already means broken
    // data), so a hue predicate would be both wrong and a pin. Instead this
    // predicts the ALPHA COMPOSITE from the constant read off canvas-colors.ts
    // and checks the real pixel against it:
    //
    //     out = fill.rgb * a + under.rgb * (1 - a)
    //
    // `under` is the SAME PIXEL with the mark cleared, so the claim is about one
    // cell changing rather than about two different cells differing. The
    // uncovered companion is asserted EXACTLY unchanged, with no tolerance.
    //
    // AT ZOOM 1, so that a point OUTSIDE the 64x64 plane is on screen for [8c].
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(600);
    const view8 = await c.json('window.__dbg.view()');
    const aim8 = (col, row) => {
      const cx = Math.round(rect.left + (col * CELL_PX + CELL_PX / 2) * view8.zoom);
      const cy = Math.round(rect.top + (row * CELL_PX + CELL_PX / 2) * view8.zoom);
      if (cx > rect.left + rect.width - 2 || cy > rect.top + rect.height - 2) return null;
      const dCol = Math.floor((view8.x + (cx - rect.left) / view8.zoom) / CELL_PX);
      const dRow = Math.floor((view8.y + (cy - rect.top) / view8.zoom) / CELL_PX);
      return (dCol === col && dRow === row) ? { x: cx, y: cy } : null;
    };
    const px = async (aim) => c.json(PIXEL_AT(`${aim.x} - ${rect.left}`, `${aim.y} - ${rect.top}`));

    const coveredCell = indep7.find((cell) => aim8(cell % PLANE_COLS, Math.floor(cell / PLANE_COLS)));
    const uncoveredCell = (() => {
      for (let i = 0; i < layout.length; i++) {
        if (indep7.includes(i) || layout[i] === 0) continue;
        if (aim8(i % PLANE_COLS, Math.floor(i / PLANE_COLS))) return i;
      }
      return null;
    })();
    // A point PAST the bottom edge of the plane, still on the canvas: the map
    // draws the act's foreground there and the lens must never touch it.
    const outsideAim = (() => {
      const cy = Math.round(rect.top + (PLANE_COLS * CELL_PX + 24) * view8.zoom);
      const cx = Math.round(rect.left + 40);
      return cy < rect.top + rect.height - 2 ? { x: cx, y: cy } : null;
    })();
    check('8a', 'ANTI-VACUOUS: a covered cell, an uncovered cell and a point outside the '
      + 'plane are all on screen at zoom 1',
      coveredCell !== undefined && coveredCell !== null && uncoveredCell !== null
      && outsideAim !== null && view8.zoom === 1,
      `covered=${coveredCell} uncovered=${uncoveredCell} outside=${JSON.stringify(outsideAim)} `
      + `view=${JSON.stringify(view8)}`);

    if (coveredCell != null && uncoveredCell != null && outsideAim != null) {
      const aimOn = aim8(coveredCell % PLANE_COLS, Math.floor(coveredCell / PLANE_COLS));
      const aimOff = aim8(uncoveredCell % PLANE_COLS, Math.floor(uncoveredCell / PLANE_COLS));
      const lensOn = await c.json('window.__dbg.aeon.bandLensTarget()');
      const onCov = await px(aimOn), onUnc = await px(aimOff), onOut = await px(outsideAim);
      // Mark cleared -> the lens goes dark. Restored immediately after.
      await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)');
      await sleep(600);
      const offCov = await px(aimOn), offUnc = await px(aimOff), offOut = await px(outsideAim);
      await c.evalExpr(`window.__dbg.aeon.setBandLensTarget(${JSON.stringify(lensOn)})`);
      await sleep(600);

      const predict = (u) => [
        Math.round(FILL.r * FILL.a + u.r * (1 - FILL.a)),
        Math.round(FILL.g * FILL.a + u.g * (1 - FILL.a)),
        Math.round(FILL.b * FILL.a + u.b * (1 - FILL.a)),
      ];
      const pred = predict(offCov);
      const dev = Math.max(Math.abs(onCov.r - pred[0]), Math.abs(onCov.g - pred[1]),
        Math.abs(onCov.b - pred[2]));
      // ⚠ THE ONE TOLERANCE IN THIS FILE, and it is a ROUNDING tolerance, not a
      // window that could hide a defect: the compositor works in 8-bit and
      // rounds, so an exact equality would fail on a half-count. A wrong colour,
      // a wrong alpha or no wash at all moves this by tens, not by one — the
      // `no-stroke` poison drives it to the full unwashed distance.
      const ROUND_SLACK = 2;
      check('8b', 'the covered cell IS the constant composited over its own unwashed pixel — '
        + `predicted from BAND_LENS_FILL as read off canvas-colors.ts, within ${ROUND_SLACK} of 8-bit rounding`,
        dev <= ROUND_SLACK,
        `cell ${coveredCell}: unwashed ${JSON.stringify(offCov)} + rgba(${FILL.r},${FILL.g},${FILL.b},${FILL.a}) `
        + `-> predicted [${pred}] , measured [${onCov.r},${onCov.g},${onCov.b}] , max deviation ${dev}`);
      check('8c', 'an UNCOVERED cell and a point OUTSIDE the 64x64 plane are pixel-identical '
        + 'with the lens on and off — no tolerance',
        JSON.stringify(onUnc) === JSON.stringify(offUnc)
        && JSON.stringify(onOut) === JSON.stringify(offOut),
        `uncovered cell ${uncoveredCell} on=${JSON.stringify(onUnc)} off=${JSON.stringify(offUnc)} | `
        + `outside the plane (world y ${PLANE_COLS * CELL_PX + 24}) on=${JSON.stringify(onOut)} `
        + `off=${JSON.stringify(offOut)}`);
      check('8d', 'ANTI-VACUOUS: turning the mark off really did change the covered pixel, so '
        + '8b is not predicting an identity',
        JSON.stringify(onCov) !== JSON.stringify(offCov),
        `on=${JSON.stringify(onCov)} off=${JSON.stringify(offCov)}`);
    } else {
      check('8b', 'the covered cell IS the constant composited over its own unwashed pixel',
        false, 'COULD NOT MEASURE — see 8a');
    }
    await c.evalExpr(`window.__dbg.setView(0, 0, ${ZOOM})`);
    await sleep(500);

    // ---- 7f/7g. THE BAND CARD — deferred 5d/5e, now that the section is open --
    // Clicking the CARD must light the same cells clicking an animated CELL did,
    // and the card's own footprint line must be as neutral as the candidate's.
    const cardClicked = await c.evalExpr(String.raw`
      (() => {
        // ⚠ THE CARD'S TITLE MOVED at 023e0ed9: the Field label is
        // \`Tile animation N\` now (BgAnimBandPanel.tsx:500), not \`Band N\`.
        // The old anchor matched nothing and this returned 'no-card' — a
        // string that reads like a missing feature and was a missing word.
        const t = [...document.querySelectorAll('*')].find((e) => e.children.length === 0
          && /^Tile animation 0$/.test((e.textContent || '').trim()));
        if (!t) return 'no-card';
        let card = t;
        for (let i = 0; i < 6 && card; i++) {
          card = card.parentElement;
          if (card && /^Tile animation 0/.test((card.textContent || '').trim())
              && card.textContent.includes('Demote')) { card.click(); return 'clicked'; }
        }
        return 'no-card';
      })()`);
    await sleep(700);
    const lens7f = await c.json('window.__dbg.aeon.bandLens()');
    check('7f', 'clicking the band CARD lights the same range clicking an animated CELL did',
      cardClicked === 'clicked' && lens7f.kind === 'band' && lens7f.bandIndex === 0
      && lens7f.range.base === lens2.range.base && lens7f.range.count === lens2.range.count
      && lens7f.cells === lens2.cells,
      `click=${cardClicked} card-lens=${JSON.stringify(lens7f)} cell-lens=${JSON.stringify(lens2)}`);

    const cardLine = await c.json(
      `[...document.querySelectorAll('*')].filter(e => e.children.length <= 2   /* swatch + parcel A's Hide chip */
         && /^highlighted on the map · /.test((e.textContent||'').trim()))
         .map(e => (e.textContent||'').trim())`);
    check('7g', "THE RULING on the band card too: its footprint line names 1,244 cells and "
      + 'carries no warning vocabulary',
      cardLine.length > 0 && cardLine[0].includes(`paints ${lens7f.cells} cell`)
      && !/warn|caution|careful|danger|problem|too many|excessiv|beware|!/i.test(cardLine[0])
      && !/\b(only|but|just|however)\b/i.test(cardLine[0]),
      JSON.stringify(cardLine));

    // ---- 9. A PAN IS NOT A MARK ------------------------------------------
    const cand9a = await c.json('window.__dbg.aeon.bandCandidate()');
    const marks9 = (await c.json('window.__dbg.aeon.bandMark()')).marks;
    const view9a = await c.json('window.__dbg.view()');
    // DRAG LEFT, not right. The view starts pinned at world (0,0) and `setViewport`
    // CLAMPS at the act's origin, so dragging the content right asks the camera to
    // go negative and it does not move — which would make this row pass on a dead
    // gesture. Dragging left moves the camera INTO the act, which is a real change
    // the row can require. (Measured: the first version of this row failed with
    // `view.x 0->0` and the pan was working perfectly.)
    const dragFrom = staticCell.aim;
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragFrom.x, y: dragFrom.y, button: 'left', clickCount: 1, buttons: 1 });
    for (let i = 1; i <= 4; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragFrom.x - i * 10, y: dragFrom.y, button: 'left', buttons: 1 });
      await sleep(40);
    }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragFrom.x - 40, y: dragFrom.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(500);
    const cand9b = await c.json('window.__dbg.aeon.bandCandidate()');
    const marks9b = (await c.json('window.__dbg.aeon.bandMark()')).marks;
    const view9b = await c.json('window.__dbg.view()');
    check('9a', 'a DRAG pans the map and marks NOTHING — the mark branch never took the press',
      marks9b === marks9 && JSON.stringify(cand9b) === JSON.stringify(cand9a) && view9b.x !== view9a.x,
      `marks ${marks9}->${marks9b} candidate ${JSON.stringify(cand9a)}->${JSON.stringify(cand9b)} `
      + `view.x ${view9a.x}->${view9b.x}`);
    await c.evalExpr(`window.__dbg.setView(0, 0, ${ZOOM})`);
    await sleep(500);

    // ---- 10. A MARK THAT OUTLIVES ITS SUBJECT ----------------------------
    // Press on a static cell; DEMOTE a band mid-press through a synthetic DOM
    // click (non-pointer, exactly the path part 1's defect took); release.
    // Demotion renumbers the blob and rewrites every layout word, so the slot
    // that cell named is not the slot it names now.
    const cand10a = await c.json('window.__dbg.aeon.bandCandidate()');
    const marks10 = (await c.json('window.__dbg.aeon.bandMark()')).marks;
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: staticCell.aim.x, y: staticCell.aim.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(120);
    const demoted = await c.evalExpr(clickByText('/^Demote/'));
    await sleep(700);
    const bandsMid = await c.json('window.__dbg.aeon.bands()');
    const hashMid = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: staticCell.aim.x, y: staticCell.aim.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(600);
    const mark10 = await c.json('window.__dbg.aeon.bandMark()');
    const cand10b = await c.json('window.__dbg.aeon.bandCandidate()');
    // THE ALTERNATIVE GREEN PATH [10c]/[12a] WOULD OTHERWISE HAVE: a hash that
    // never moves at all (a constant, or a null) makes "hashes back" true for
    // free. This row proves the hash DID move while the document was demoted.
    check('10a', 'ANTI-VACUOUS: the mid-press Demote really did change the band list AND the '
      + 'document hash — so [10c] and [12a] are not comparing a constant to itself',
      demoted === true && bandsMid.length === bands.length - 1
      && typeof hashMid === 'number' && hashMid !== hash0,
      `demoted=${demoted} bands ${bands.length} -> ${bandsMid.length}; hash ${hash0} -> ${hashMid}`);
    check('10b', 'the release DROPS the mark rather than seeding through a stale layout word',
      mark10.marks === marks10 + 1 && mark10.kind === 'dropped'
      && cand10b.staticBase === cand10a.staticBase,
      `mark=${JSON.stringify(mark10)} candidate ${JSON.stringify(cand10a)} -> ${JSON.stringify(cand10b)}`);

    // Undo the demotion, and prove the document is back.
    await c.evalExpr(
      "document.dispatchEvent(new KeyboardEvent('keydown', {key:'z', ctrlKey:true, bubbles:true}))");
    await c.evalExpr(
      "window.dispatchEvent(new KeyboardEvent('keydown', {key:'z', ctrlKey:true, bubbles:true}))");
    await sleep(900);
    const hashBack = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const bandsBack = await c.json('window.__dbg.aeon.bands()');
    check('10c', 'the demotion is undone and the document hashes back to what [2c] saw',
      hashBack === hash0 && bandsBack.length === bands.length,
      `hash ${hash0} -> ${hashBack}; bands ${bandsBack.length}`);

    // ---- 11. NO CLOCK -----------------------------------------------------
    await clickAt(animCell.aim.x, animCell.aim.y);
    const lens11 = await c.json('window.__dbg.aeon.bandLens()');
    check('11a', 'ANTI-VACUOUS: the lens is ACTIVE and drawing cells for the idle test',
      lens11.active === true && lens11.cells > 0 && lens11.drawn > 0, JSON.stringify(lens11));
    const installed = await c.evalExpr(REPAINT_PROBE);
    // SETTLE BEFORE ZEROING. One run in seventeen reported this row red, and the
    // likeliest cause is a repaint that was still in flight from the click above
    // (a ResizeObserver / layout settle) landing inside the window rather than
    // any clock. The property under test is "nothing repaints while IDLE", so
    // the window has to start after the page is idle.
    await sleep(1500);
    await c.evalExpr('window.__lensProbe.repaints = 0; window.__lensProbe.ticks = 0; window.__lensProbe.start()');
    await sleep(3000);
    await c.evalExpr('window.__lensProbe.stop()');
    const probe = await c.json(
      '({repaints: window.__lensProbe.repaints, ticks: window.__lensProbe.ticks, '
      + 'bound: window.__lensProbe.bound()})');
    check('11b', 'ZERO map repaints over 3s idle with the lens lit, while the page is provably '
      + 'still painting and the probe is still ON the live canvas '
      + '(tick count is PER-RUN, only the pair is asserted)',
      installed !== 'no-map-canvas' && probe.bound === true
      && probe.repaints === 0 && probe.ticks > 0,
      `repaints=${probe.repaints} rAF ticks=${probe.ticks} bound=${probe.bound} (probe=${installed})`);

    // ---- 13. PARCELS A + B (2026-08-26): View seeds nothing; Escape / Hide clear ----
    // [13a] In the VIEW tool a left click on the plane leaves both the lens
    // target and the candidate exactly as they were. The click lands on the
    // STATIC cell that seeded [4c], so this is the same gesture that DID seed
    // under mark-band — the tool is the only thing that changed.
    const viewArmed = await clickDockTool('View');
    const toolView = await c.evalExpr('window.__dbg.aeon.state().tool');
    const target13 = await c.json('window.__dbg.aeon.bandLensTarget()');
    const cand13 = await c.json('window.__dbg.aeon.bandCandidate()');
    const marks13 = (await c.json('window.__dbg.aeon.bandMark()')).marks;
    await clickAt(staticCell.aim.x, staticCell.aim.y);
    const target13b = await c.json('window.__dbg.aeon.bandLensTarget()');
    const cand13b = await c.json('window.__dbg.aeon.bandCandidate()');
    const marks13b = (await c.json('window.__dbg.aeon.bandMark()')).marks;
    check('13a', 'VIEW tool: a left click on the plane leaves bandLensTarget AND bandCandidate '
      + 'unchanged, and records no mark',
      viewArmed && toolView === 'view'
      && JSON.stringify(target13b) === JSON.stringify(target13)
      && JSON.stringify(cand13b) === JSON.stringify(cand13)
      && marks13b === marks13,
      `tool=${toolView} target ${JSON.stringify(target13)} -> ${JSON.stringify(target13b)}; `
      + `candidate ${JSON.stringify(cand13)} -> ${JSON.stringify(cand13b)}; marks ${marks13} -> ${marks13b}`);

    // [13b] ESCAPE clears a lit lens, and the covered pixel returns to its
    // lens-off byte — the [8b] method, at zoom 1, with the reference byte taken
    // from the DOOR (setBandLensTarget(null)) and the verdict from the KEY.
    await pressKey('n', 'KeyN', 78);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(600);
    const view13 = await c.json('window.__dbg.view()');
    const aim13 = (col, row) => {
      const cx = Math.round(rect.left + (col * CELL_PX + CELL_PX / 2) * view13.zoom);
      const cy = Math.round(rect.top + (row * CELL_PX + CELL_PX / 2) * view13.zoom);
      if (cx > rect.left + rect.width - 2 || cy > rect.top + rect.height - 2) return null;
      const dCol = Math.floor((view13.x + (cx - rect.left) / view13.zoom) / CELL_PX);
      const dRow = Math.floor((view13.y + (cy - rect.top) / view13.zoom) / CELL_PX);
      return (dCol === col && dRow === row) ? { x: cx, y: cy } : null;
    };
    const px13 = async (aim) => c.json(PIXEL_AT(`${aim.x} - ${rect.left}`, `${aim.y} - ${rect.top}`));
    const animAim13 = aim13(animCell.col, animCell.row);
    await clickAt(animAim13.x, animAim13.y);
    const lit13 = await c.json('window.__dbg.aeon.bandLens()');
    const litTarget13 = await c.json('window.__dbg.aeon.bandLensTarget()');
    const cover13 = lit13.active ? coverIndependently(lit13.range.base, lit13.range.count) : [];
    const covered13 = cover13.find((cell) => aim13(cell % PLANE_COLS, Math.floor(cell / PLANE_COLS)));
    const covAim13 = covered13 != null ? aim13(covered13 % PLANE_COLS, Math.floor(covered13 / PLANE_COLS)) : null;
    check('13z', 'ANTI-VACUOUS: under mark-band at zoom 1 the lens is LIT on a band and a covered cell is on screen',
      (await c.evalExpr('window.__dbg.aeon.state().tool')) === 'mark-band' && lit13.active === true
      && litTarget13 !== null && covAim13 !== null,
      `lens=${JSON.stringify(lit13)} target=${JSON.stringify(litTarget13)} covered cell=${covered13}`);
    if (covAim13) {
      const onPx = await px13(covAim13);
      await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)');
      await sleep(600);
      const offRef = await px13(covAim13);                          // the lens-off byte
      await c.evalExpr(`window.__dbg.aeon.setBandLensTarget(${JSON.stringify(litTarget13)})`);
      await sleep(600);
      const reLit = await px13(covAim13);
      await c.evalExpr('document.activeElement && document.activeElement.blur()');
      await pressKey('Escape', 'Escape', 27);
      await sleep(600);
      const afterEsc = await c.json('window.__dbg.aeon.bandLensTarget()');
      const escPx = await px13(covAim13);
      check('13b', 'ESCAPE on a lit lens: bandLensTarget === null and the covered pixel is '
        + 'byte-identical to its lens-off value (and it really was washed before)',
        afterEsc === null && JSON.stringify(escPx) === JSON.stringify(offRef)
        && JSON.stringify(onPx) !== JSON.stringify(offRef) && JSON.stringify(reLit) === JSON.stringify(onPx),
        `cell ${covered13}: lit=${JSON.stringify(onPx)} off-ref=${JSON.stringify(offRef)} `
        + `after Escape target=${JSON.stringify(afterEsc)} px=${JSON.stringify(escPx)}`);

      // [13c] The HIDE chip does the same. It renders beside the card's
      // "highlighted on the map" line, so the band section must be open (it is —
      // section 7 opened it) and the lens must be lit on a BAND.
      await clickAt(animAim13.x, animAim13.y);
      const litAgain = await c.json('window.__dbg.aeon.bandLensTarget()');
      const litPx = await px13(covAim13);
      const hideClicked = await c.evalExpr(clickByText('/^Hide$/'));
      await sleep(600);
      const afterHide = await c.json('window.__dbg.aeon.bandLensTarget()');
      const hidePx = await px13(covAim13);
      check('13c', 'the HIDE chip on a lit lens: bandLensTarget === null and the covered pixel '
        + 'is byte-identical to its lens-off value',
        litAgain !== null && JSON.stringify(litPx) === JSON.stringify(onPx)
        && hideClicked === true && afterHide === null
        && JSON.stringify(hidePx) === JSON.stringify(offRef),
        `re-lit target=${JSON.stringify(litAgain)} px=${JSON.stringify(litPx)}; Hide chip clicked=${hideClicked}; `
        + `after Hide target=${JSON.stringify(afterHide)} px=${JSON.stringify(hidePx)} (off-ref ${JSON.stringify(offRef)})`);
    } else {
      check('13b', 'ESCAPE on a lit lens clears it', false, 'COULD NOT MEASURE — see 13z');
      check('13c', 'the HIDE chip on a lit lens clears it', false, 'COULD NOT MEASURE — see 13z');
    }
    await c.evalExpr(`window.__dbg.setView(0, 0, ${ZOOM})`);
    await sleep(400);

    // ---- 12. TEARDOWN: nothing written -----------------------------------
    const hashEnd = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('12a', 'the override document is byte-identical to the state this run found',
      hashEnd === hash0, `${hash0} -> ${hashEnd}`);

  } finally {
    if (c) c.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`
    + (unmeasured.length ? `, ${unmeasured.length} NOT MEASURABLE on this document` : ''));
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  if (unmeasured.length) {
    console.log('NOT MEASURABLE (not a pass — the subject does not exist here):');
    for (const u of unmeasured) console.log(`  ${u}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
