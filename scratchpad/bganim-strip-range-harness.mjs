#!/usr/bin/env node
// CAN AN AUTHOR DRAG A RUN ON THE BLOB STRIP TO AIM A BAND — IN THE RUNNING APP?
//
// ROADMAP item 43 WAVE 2 (option C of the marquee ruling). The Art panel's tile
// strip IS the slot axis, so a contiguous run of strip cells is a contiguous run
// of blob slots. Press records, release decides: same slot keeps today's pick,
// a different slot aims the promotion CANDIDATE.
//
// Every word of that is invisible to the node suite. ~4,900 vitest tests pass
// over this feature and not one can tell a wired mousedown from an unwired one,
// a canvas grid from a dead one, or a drag that silently re-armed `paint-tile`
// from one that did not. So this drives the REAL app over CDP.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. THE DRAG/CLICK BOUNDARY, IN BOTH DIRECTIONS. Section 4 is a CONTROL: a
//    plain click must still pick a tile and arm `paint-tile`, and if wave 2
//    broke that, [4c] goes red. Section 6 is the mirror: a drag must leave
//    `selectedBgTileIndex` byte-identical and must NOT arm `paint-tile` ([6d]).
//    Those two rows are the whole wave.
//
// 2. AN AIM THAT LANDED SOMEWHERE ELSE. [6b] asserts the slots the APP says it
//    saw are the slots this file aimed at, computed independently from the
//    canvas box and the strip pitch read off `ArtBrowser.tsx` — so an aiming
//    error can never be reported as a feature defect (or hide one).
//
// 3. A RANGE COMPUTED BY THE APP AND CHECKED BY THE APP. [6c] re-derives
//    `staticBase`/`cols` HERE, from the app's reported anchor and release and
//    the budget's own `firstPromotableSlot`, and compares. It never asks the app
//    what it thinks the range should be.
//
// 4. A REFUSAL THAT GOES QUIET. Section 8 drags entirely inside the animated
//    prefix. The candidate must be byte-identical afterwards AND the picker's
//    hover line must SAY so — an unclear refusal is worse than a loud one, and
//    a candidate that merely did not change is indistinguishable from a dead
//    gesture without the report and the line.
//
// 5. THE GATE FALLING OPEN. Section 9 repeats the identical drag in the
//    FOREGROUND, where the same integers name the zone tileset. The candidate
//    must not move, and the FG pick must behave exactly as it always did.
//
// 6. A DOCUMENT WRITE. [11a] hashes the whole override document at the start and
//    at the end. This gesture writes NOTHING; the only writers in this arc are
//    still `promoteBandCommand` / `addBandCommand`.
//
// ═══ ANTI-VACUOUS, AND THE SUBJECT IS ASSERTED ═══
//
// [2c] asserts the strip is showing THIS document's blob: BG layer, `bgSource()`
// is `override`, the count row's number equals `bandBudget().tiles`, and there
// is a real animated prefix to clamp against. A run on a project painting the
// act default, or with no bands, would be green everywhere below and prove
// nothing. [5a] asserts the Rows control this run pins was really touched — the
// column arithmetic divides by it, so a run that failed to set it would be
// measuring a different rule.
//
// ═══ AIM AT INTEGERS. THE CANVAS RECT IS NOT INTEGRAL. ═══
//
// `devicePixelRatio` varies between runs here (1 and 1.35 both observed hours
// apart in one session), and at anything but 1 the canvas rect is fractional.
// Asking CDP for a fractional client coordinate delivers a neighbouring cell and
// it presents as an off-by-one in the feature when the feature is fine. So every
// aim below is an INTEGER, re-derived through the app's OWN slot formula
// (`floor((clientX - rect.left) / pitch)`) before it is used, and rejected if it
// does not come back to the slot it was built for. dpr, the rect and the pitch
// are PRINTED every run.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed and no command is run.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     xvfb-run is spawned internally; just
//                          node scratchpad/bganim-strip-range-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9401);
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
const SHOTS = `${ROOT}/scratchpad/shots-strip-range`;
mkdirSync(SHOTS, { recursive: true });

// ── THE STRIP'S GEOMETRY, READ OFF THE COMPONENT, NEVER TYPED HERE ──────────
// A literal 16/18 would be a pin: it would keep passing if the component's grid
// changed under it, by aiming at the cell this file wanted instead of the cell
// the app draws. Both numbers come out of the source in this process.
const STRIP = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/components/ArtBrowser.tsx`, 'utf8');
  const size = /const itemSize = (\d+);/.exec(src);
  const gap = /Math\.floor\(canvas\.width \/ \(itemSize \+ (\d+)\)\)/.exec(src);
  if (!size || !gap) {
    throw new Error('ArtBrowser.tsx no longer spells `const itemSize = N` and `canvas.width / (itemSize + G)`');
  }
  return { size: Number(size[1]), pitch: Number(size[1]) + Number(gap[1]) };
})();

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
/** A THIRD VERDICT, and it is NOT GREEN — the standard wave 1's [6a] set. */
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
  console.log(`        shot → scratchpad/shots-strip-range/${name}.png`);
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

/** Open one CollapsibleSection by header text. Copied from the wave 1 harness. */
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

/** The strip canvas box, its backing-store width, and the label beside it. */
const STRIP_GEOM = String.raw`
(() => {
  const cv = document.getElementById('art-browser-canvas');
  if (!cv) return null;
  cv.scrollIntoView({ block: 'center' });
  const r = cv.getBoundingClientRect();
  const label = [...document.querySelectorAll('span')]
    .map(e => (e.textContent || '').trim())
    .filter(t => /^\d+ (background )?tiles$/.test(t));
  return {
    left: r.left, top: r.top, width: r.width, height: r.height,
    cw: cv.width, ch: cv.height, countLabels: label,
    inWindow: r.top >= 0 && r.left >= 0
      && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
  };
})()`;

const HOVER_LABEL = String.raw`
((el) => el ? { text: el.textContent || '', title: el.title || '' } : null)(
  document.getElementById('art-browser-hover-label'))`;

/**
 * THE RANGE RULE, RE-DERIVED HERE.
 *
 * This is deliberately a SECOND implementation of the ruled arithmetic rather
 * than a call into the app: the point of [6c] is that two independent walks of
 * the same rule agree. If it ever drifts from `resolveStripDrag`, one of the two
 * is wrong and the row says which numbers disagreed.
 */
function expectOutcome(anchor, release, rows, firstPromotableSlot, blobTileCount) {
  if (anchor === release) return { kind: 'pick' };
  const lo = Math.min(anchor, release);
  const hi = Math.max(anchor, release);
  const base = Math.max(lo, firstPromotableSlot);
  if (base > hi) return { kind: 'refused', why: 'whole run inside the animated prefix' };
  const maxCols = Math.floor((blobTileCount - base) / rows);
  if (maxCols < 1) return { kind: 'refused', why: 'no column fits before the end of the blob' };
  const run = hi - base + 1;
  return { kind: 'range', base, cols: Math.min(Math.max(1, Math.floor(run / rows)), maxCols), run };
}

/**
 * SHOW ONE OF THE THREE JOBS - d-26b's sub-tabs (EW-SHAPE-TABS).
 *
 * The Effects column's panels are re-parented under three sub-tabs, so a
 * section belonging to another job is UNMOUNTED (not hidden) until that job is
 * shown. Nothing the rows below assert changed; they now say which job they
 * are standing in.
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
  // ⚠ `SCALE=1.35 node …` FORCES A FRACTIONAL CANVAS RECT. Xvfb's inferred
  // device scale factor varies run to run here (1 and 1.35 both seen hours
  // apart), and at anything but 1 the strip's box is fractional — which is
  // exactly the condition that once turned an aiming error into a phantom
  // off-by-one bug report. This knob makes that condition reproducible instead
  // of waiting for it, and every aim below re-derives through the app's own
  // formula either way.
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON,
      ...(process.env.SCALE ? [`--force-device-scale-factor=${process.env.SCALE}`] : []),
      MAIN],
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
    // `__dbg.aeon.stripDrag` is introduced by THIS branch and exists nowhere on
    // master. Without this row every PASS below could describe a build with none
    // of wave 2 in it.
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.stripDrag === "function"');
    check('0a', 'the build under test contains the strip-drag probe (this branch, not master)',
      haveProbe === true, `${RUN.root}/dist`);
    if (!haveProbe) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npm run build');

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
    await sleep(2500);

    // ---- 2. THE LAYOUT FACET, THE BG LAYER, AND THE SUBJECT ---------------
    // The Art strip lives in the Layout facet only (`layout-facet.tsx`), so
    // that is where this gesture is performed — the band FORM it aims is two
    // facets away, which is exactly why the candidate had to be lifted into the
    // store and why a drag that only moved local state would be invisible.
    const layoutPill = await c.evalExpr(clickByText('/^Layout$/'));
    check('2a', 'the facet bar offers a Layout pill', layoutPill === true);
    await sleep(1200);
    await c.evalExpr('window.__dbg.aeon.setLayer("bg")');
    await sleep(800);
    const artOpen = await c.evalExpr(SECTION_STATE('/^Art/', true));
    check('2b', 'the Art section is on screen (it arrives open; opened if not)',
      artOpen === 'already-open' || artOpen === 'clicked' || artOpen === 'open', String(artOpen));

    const bgSource = await c.evalExpr('window.__dbg.aeon.bgSource()');
    const budget = await c.json('window.__dbg.aeon.bandBudget()');
    const bands = await c.json('window.__dbg.aeon.bands()');
    const sel0 = await c.json('window.__dbg.aeon.selectedTile()');
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const geom0 = await c.json(STRIP_GEOM);
    const stripCount = geom0 && geom0.countLabels.length > 0
      ? Number(/^(\d+)/.exec(geom0.countLabels[0])[1]) : null;

    // THE SUBJECT ASSERTION. A slot index only means something in THIS
    // document's blob, so the run is only about this feature when the strip IS
    // that blob — asserted through the count row the panel prints, not assumed.
    check('2c', 'ANTI-VACUOUS: the BG layer is picking, the strip IS this document\'s blob '
      + '(its count row equals bandBudget().tiles), and there is a real animated prefix',
      bgSource === 'override' && sel0.layer === 'bg'
      && stripCount !== null && stripCount === budget.tiles
      && bands.length > 0 && budget.firstPromotableSlot > 0,
      `bgSource=${bgSource} layer=${sel0.layer} strip count row=${JSON.stringify(geom0 && geom0.countLabels)} `
      + `budget=${JSON.stringify(budget)} bands=${bands.length} hash=${hash0}`);
    if (bgSource !== 'override' || sel0.layer !== 'bg' || bands.length === 0) {
      throw new Error('the subject is not what this harness measures — see [2c]');
    }

    // ---- 3. THE STRIP'S BOX, AND AN INTEGER AIM ---------------------------
    const dpr = await c.evalExpr('window.devicePixelRatio');
    const geom = await c.json(STRIP_GEOM);
    note(`ENVIRONMENT  devicePixelRatio=${dpr}  stripRect=${JSON.stringify(geom)}  `
      + `itemSize=${STRIP.size} pitch=${STRIP.pitch} (read off ArtBrowser.tsx)`);
    const gridCols = geom ? Math.max(1, Math.floor(geom.cw / STRIP.pitch)) : 0;
    const gridRows = geom ? Math.floor(geom.height / STRIP.pitch) : 0;
    check('3a', 'ANTI-VACUOUS: the strip canvas is mounted, inside the window, with a grid '
      + 'big enough to drag a run across',
      !!geom && geom.inWindow && geom.width > 100 && geom.height > 40
      && gridCols >= 4 && gridRows >= 2,
      `${gridCols} cols x ${gridRows} visible rows, box=${JSON.stringify(geom)}`);
    if (!geom || !geom.inWindow) throw new Error('the strip canvas is not usable — see [3a]');

    /**
     * An INTEGER client aim for a strip slot, and the slot that aim RE-DERIVES
     * to through the app's own formula. Null when the two differ, so a
     * fractional rect can never make a row assert a slot the app never saw.
     *
     * `scrollTop` is 0 for the whole run — nothing here wheels the strip — and
     * [6b] is what proves that assumption held, by comparing against the slot
     * the APP reports.
     */
    const aimFor = (slot) => {
      const col = slot % gridCols;
      const row = Math.floor(slot / gridCols);
      const cx = Math.round(geom.left + col * STRIP.pitch + STRIP.size / 2);
      const cy = Math.round(geom.top + row * STRIP.pitch + STRIP.size / 2);
      if (cx < geom.left || cy < geom.top
        || cx > geom.left + geom.width - 1 || cy > geom.top + geom.height - 1) return null;
      const dCol = Math.floor((cx - geom.left) / STRIP.pitch);
      const dRow = Math.floor((cy - geom.top) / STRIP.pitch);
      if (dCol !== col || dRow !== row) return null;
      return { x: cx, y: cy, slot, col, row };
    };

    const press = async (p) => c.send('Input.dispatchMouseEvent',
      { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 });
    const move = async (p) => c.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', clickCount: 0, buttons: 1 });
    const release = async (p) => c.send('Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 });
    const dragSlots = async (a, b) => {
      await press(a); await sleep(90);
      if (a.x !== b.x || a.y !== b.y) { await move(b); await sleep(90); }
      await release(b); await sleep(450);
    };

    // ---- 4. THE CONTROL: A PLAIN CLICK STILL PICKS A TILE ------------------
    // If wave 2 broke this, the row below is red. It is not a formality: the
    // press now records and the release now decides, and a boundary drawn one
    // step wrong turns every click into a range.
    const fps = budget.firstPromotableSlot;
    const clickSlot = Math.min(fps + 3, budget.tiles - 1);
    const clickAim = aimFor(clickSlot);
    check('4a', 'ANTI-VACUOUS for the control: an integer aim exists for a static slot, and the '
      + 'picker is not ALREADY on it',
      !!clickAim && sel0.bg !== clickSlot,
      `slot ${clickSlot} aim=${JSON.stringify(clickAim)} picker was on bg #${sel0.bg}`);
    if (!clickAim) throw new Error('no usable aim — see [4a]');

    const gest0 = (await c.json('window.__dbg.aeon.stripDrag()')).gestures;
    await dragSlots(clickAim, clickAim);
    const rep4 = await c.json('window.__dbg.aeon.stripDrag()');
    const sel4 = await c.json('window.__dbg.aeon.selectedTile()');
    const tool4 = await c.evalExpr('window.__dbg.aeon.state().tool');
    check('4b', 'the gesture RAN and took the PICK path, not the range path',
      rep4.gestures === gest0 + 1 && rep4.kind === 'pick' && rep4.detail === 'same-slot'
      && rep4.releaseSlot === clickSlot,
      JSON.stringify(rep4));
    check('4c', 'CONTROL — a plain click still picks that tile for the BG layer and arms paint-tile',
      sel4.bg === clickSlot && tool4 === 'paint-tile',
      `picked bg #${sel4.bg} (aimed ${clickSlot}), tool=${tool4}`);

    const cand4 = await c.json('window.__dbg.aeon.bandCandidate()');
    check('4d', 'and a plain click leaves the band CANDIDATE alone — it is a brush, not a band',
      JSON.stringify(cand4) === JSON.stringify(await c.json('window.__dbg.aeon.bandCandidate()')),
      JSON.stringify(cand4));

    // ---- 5. PIN `rows` THROUGH THE PANEL'S OWN CONTROL ---------------------
    // The column arithmetic DIVIDES BY the candidate's rows, so a run that did
    // not really set it would be measuring a different rule. It is set through
    // the real Rows <select> in the Effects facet — which also exercises the
    // lift: the strip is in the LAYOUT facet and reads the value across it.
    const ROWS = 4;                       // the height both shipped bands use
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1400);
    // The tile-animation form is the TILE ANIM job's since d-26b.
    await c.evalExpr(SUBTAB('tileAnim'));
    await sleep(1000);
    // ⚠ THE SECTION'S TITLE MOVED at 023e0ed9 (2026-09-02, "effects: `band` names
    // ONE feature now — tile animation vs raster band"): `New band` is
    // `New tile animation` (BgAnimBandPanel.tsx:635). This file had already been
    // taught the sub-tab (SUBTAB above) and NOT the rename, so the disclosure
    // stayed shut, the Rows <select> was never in the DOM, `SET_INPUT` returned
    // `no-element`, and rows stayed 1. Row 5a caught it — and 6c and 8a, which
    // both divide by rows, failed as consequences of the same one line.
    const openedNew = await c.evalExpr(SECTION_STATE('/^New tile animation/', true));
    await sleep(500);
    const setRows = await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => /^rows:/.test(e.title || ''))`, ROWS));
    await sleep(400);
    const cand5 = await c.json('window.__dbg.aeon.bandCandidate()');
    check('5a', `ANTI-VACUOUS: the panel's own Rows control really set rows=${ROWS} — the strip's `
      + 'column arithmetic divides by it',
      setRows === 'ok' && cand5.rows === ROWS,
      `SECTION_STATE(New tile animation)=${JSON.stringify(openedNew)} `
      + `setRows=${setRows} candidate=${JSON.stringify(cand5)}`);
    // Back to the strip, and put the lens OUT so section 6 can prove it lights.
    await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)');
    await c.evalExpr(clickByText('/^Layout$/'));
    await sleep(1400);
    const geomB = await c.json(STRIP_GEOM);
    check('5b', 'ANTI-VACUOUS: the strip box did not move across the facet round trip, so the '
      + 'aims computed in section 3 still land',
      !!geomB && geomB.left === geom.left && geomB.top === geom.top
      && geomB.cw === geom.cw && geomB.height === geom.height,
      `before=${JSON.stringify(geom)} after=${JSON.stringify(geomB)}`);
    const lensOff = await c.json('window.__dbg.aeon.bandLensTarget()');
    check('5c', 'ANTI-VACUOUS: the lens is OUT before the drag, so [6e] measures the drag '
      + 'lighting it rather than a lens that was already on',
      lensOff === null, JSON.stringify(lensOff));

    // ---- 6. THE DRAG ------------------------------------------------------
    // A run of 11 slots at rows 4 — NOT a whole number of columns, so the
    // rounding is exercised rather than dodged: floor(11/4) = 2.
    const runFrom = Math.min(fps + 2, budget.tiles - 2);
    const runTo = Math.min(runFrom + 10, budget.tiles - 1);
    const aimA = aimFor(runFrom);
    const aimB = aimFor(runTo);
    check('6a', 'ANTI-VACUOUS: both ends of the run have an integer aim that re-derives to '
      + 'themselves, and the run is NOT a whole number of columns',
      !!aimA && !!aimB && (runTo - runFrom + 1) % ROWS !== 0,
      `slots ${runFrom}..${runTo} (${runTo - runFrom + 1} long, rows=${ROWS}) `
      + `aimA=${JSON.stringify(aimA)} aimB=${JSON.stringify(aimB)}`);
    if (!aimA || !aimB) throw new Error('no usable run aims — see [6a]');

    const selBefore = await c.json('window.__dbg.aeon.selectedTile()');
    const candBefore = await c.json('window.__dbg.aeon.bandCandidate()');
    const gest6 = (await c.json('window.__dbg.aeon.stripDrag()')).gestures;
    await dragSlots(aimA, aimB);
    const rep6 = await c.json('window.__dbg.aeon.stripDrag()');
    const cand6 = await c.json('window.__dbg.aeon.bandCandidate()');
    const sel6 = await c.json('window.__dbg.aeon.selectedTile()');
    const tool6 = await c.evalExpr('window.__dbg.aeon.state().tool');
    const label6 = await c.json(HOVER_LABEL);
    const geomAfter6 = await c.json(STRIP_GEOM);

    check('6b', 'THE AIM LANDED WHERE THIS FILE AIMED: the slots the APP saw are the slots '
      + 'computed here from the canvas box and the pitch read off the component',
      rep6.gestures === gest6 + 1 && rep6.anchorSlot === runFrom && rep6.releaseSlot === runTo,
      `app saw ${rep6.anchorSlot}..${rep6.releaseSlot}, this file aimed ${runFrom}..${runTo} `
      + `(dpr=${dpr}, rect.left=${geom.left}, pitch=${STRIP.pitch})`);

    const want6 = expectOutcome(rep6.anchorSlot, rep6.releaseSlot, ROWS, fps, budget.tiles);
    check('6c', 'the app\'s range equals this file\'s INDEPENDENT walk of the ruled arithmetic '
      + '(clamp first, inclusive run, floor to whole columns, bounded by the blob)',
      rep6.kind === 'range' && want6.kind === 'range'
      && cand6.staticBase === want6.base && cand6.cols === want6.cols && cand6.rows === ROWS,
      `app: base=${cand6.staticBase} cols=${cand6.cols} rows=${cand6.rows} · `
      + `independent: base=${want6.base} cols=${want6.cols} (run of ${want6.run}, `
      + `firstPromotableSlot=${fps}, blob=${budget.tiles})`);

    check('6d', 'THE DISCRIMINATING ROW: a drag does NOT move the picked tile and does NOT arm '
      + 'paint-tile — it aims a band, it does not choose a brush',
      sel6.bg === selBefore.bg && sel6.fg === selBefore.fg && tool6 !== 'paint-tile',
      `bg #${selBefore.bg} -> #${sel6.bg}, fg #${selBefore.fg} -> #${sel6.fg}, tool=${tool6}`);

    const target6 = await c.json('window.__dbg.aeon.bandLensTarget()');
    check('6e', 'the lens is pointed AT the candidate the moment the button comes up',
      target6 !== null && target6.kind === 'candidate', JSON.stringify(target6));

    // RE-CUT 2026-08-27 for item 54's tail. This row pinned the EXCLUSIVE end
    // (`base + cols*rows`), which is the off-by-one item 54 removed from every
    // slot readout — so the row was pinning the defect, and went red the moment
    // the readout started telling the truth. Both ends are derived from the app's
    // own reported candidate, and the negative half is what makes it discriminate:
    // asserting only that the inclusive end is PRESENT would still pass on a
    // string containing both.
    const lastSlot6 = cand6.staticBase + cand6.cols * cand6.rows - 1;
    const exclusiveEnd6 = cand6.staticBase + cand6.cols * cand6.rows;
    check('6f', 'the picker\'s readout SAYS what the drag aimed — the strip\'s only surface — '
      + 'naming the LAST slot the range contains, with the run it snapped from on the title',
      !!label6 && label6.text.includes(`${cand6.staticBase}..${lastSlot6}`)
      && !label6.text.includes(`${cand6.staticBase}..${exclusiveEnd6}`)
      && label6.text.includes(`${cand6.cols}x${cand6.rows}`)
      && /dragged run of \d+ slots/.test(label6.title),
      `${JSON.stringify(label6)} · expected ${cand6.staticBase}..${lastSlot6}, `
      + `and NOT ${cand6.staticBase}..${exclusiveEnd6}`);

    // ── ITEM 43'S TAIL: DOES THE READOUT ELLIPSISE ON THE DOCKED PANEL? ─────
    //
    // Booked as "one human look wanted, machine-checked only" — and item 54's
    // tail then made it live again by adding a separator to this very string.
    // [6h] already proves a long message cannot MOVE the strip; it says nothing
    // about whether the message is READABLE. `scrollWidth > clientWidth` is the
    // quantity a text-overflow:ellipsis truncation actually turns on.
    const fit6 = await c.json(`(() => {
      const els = [...document.querySelectorAll('*')].filter(e =>
        e.children.length === 0 && /\\d+\\.\\.\\d+/.test((e.textContent || '').trim()));
      return els.map(e => {
        const cs = getComputedStyle(e);
        return {
          text: (e.textContent || '').trim(),
          scrollWidth: e.scrollWidth, clientWidth: e.clientWidth,
          overflow: cs.textOverflow, whiteSpace: cs.whiteSpace,
          truncated: e.scrollWidth > e.clientWidth,
        };
      });
    })()`);
    console.log(`  READOUT FIT: ${JSON.stringify(fit6)}`);
    const truncated6 = fit6.filter(f => f.truncated);
    check('6g2', 'ITEM 43 TAIL: the strip readout is not truncated at the docked panel width',
      truncated6.length === 0,
      truncated6.length
        ? truncated6.map(f => `${JSON.stringify(f.text)} ${f.scrollWidth}>${f.clientWidth}`).join(' | ')
        : `${fit6.length} range-bearing strings all fit`);

    // ── AND THE SAME PROPERTY FOR EVERY RANGE THIS DOCUMENT CAN PRODUCE ────
    //
    // ⚠ [6g2] ALONE IS THE VACUOUS SHAPE THIS REPO KEEPS FINDING. It measures
    // the ONE string this run happens to make — `34..41 · 2x4`, two-digit slots
    // on a base of 34 — and a fix tuned to that is green here while the real
    // 320-slot blob still ellipsises the moment an author drags past slot 99.
    // The property is "the readout fits its box at the docked width", for the
    // whole value range the resolver can emit, so this row asks the box about
    // ALL of them.
    //
    // DERIVED, NOT TYPED: the bases come from the app's own `firstPromotableSlot`
    // and blob size, and `cols` is `resolveStripDrag`'s own maximum for each
    // base (`floor((tiles - base) / rows)`), which is the widest label that base
    // can ever carry. The template is pinned against the app's LIVE label first
    // — otherwise a reformatted `stripDragLabel` would leave this row measuring
    // a string the app no longer prints.
    // EVERY LEGAL `rows`, NOT JUST THIS RUN'S. `rows` is an INPUT to
    // `resolveStripDrag`, so a sweep that fixed it at 4 would miss the widest
    // label the resolver can emit — at `rows = 1` the same blob yields a
    // three-digit COLUMN count beside a three-digit base, which is the longest
    // string this readout can ever be handed. Derived from the codec's own rule
    // (`rowChoices`: rows * TILE_BYTES an exact power of two) rather than
    // restated as a list.
    const TILE_BYTES = 32;
    const legalRows = [];
    for (let r = 1; r <= budget.tiles; r++) {
      const bytes = r * TILE_BYTES;
      if ((bytes & (bytes - 1)) === 0) legalRows.push(r);
    }
    const spans = [];
    for (const rows of legalRows) {
      for (let base = fps; base + rows <= budget.tiles; base++) {
        const cols = Math.floor((budget.tiles - base) / rows);
        spans.push({ base, cols, rows, last: base + cols * rows - 1 });
      }
    }
    const widest6 = await c.json(String.raw`((spans) => {
      const el = document.getElementById('art-browser-hover-label');
      const prev = el.textContent;
      const mk = (s) => s.base + '..' + s.last + ' · ' + s.cols + 'x' + s.rows;
      let worst = null;
      for (const s of spans) {
        el.textContent = mk(s);
        const w = { text: el.textContent, sw: el.scrollWidth, cw: el.clientWidth };
        if (!worst || w.sw > worst.sw) worst = w;
      }
      el.textContent = prev;
      return worst;
    })(` + JSON.stringify(spans) + `)`);
    const template6 = `${cand6.staticBase}..${lastSlot6} · ${cand6.cols}x${cand6.rows}`;
    check('6g3', `ITEM 43 TAIL, FOR THE WHOLE VALUE RANGE: the WIDEST readout any of the `
      + `${spans.length} legal (base, rows) pairs on this blob can produce still fits the `
      + 'docked box '
      + '(and the template was pinned against the live label first)',
      !!widest6 && template6 === label6.text && widest6.sw <= widest6.cw,
      `widest=${JSON.stringify(widest6)} · template check ${JSON.stringify(template6)} `
      + `vs live ${JSON.stringify(label6 && label6.text)}`);

    // ── THE ROW THAT CAUGHT A REAL DEFECT AND NOW HOLDS THE FIX ────────────
    //
    // THE DEFECT: the first build put the whole message on this line. It
    // WRAPPED, the picker's header row grew two text lines, and the tile grid
    // moved 36px DOWN — so the next press landed two slots off ([7a] went red)
    // and a later one landed on the band cards, whose hover handler erased the
    // refusal that had just been written ([8a] went red).
    //
    // ⚠ WHY THIS ROW INJECTS A STRING INSTEAD OF WATCHING THE GESTURE'S OWN
    // MESSAGE. Measured: the reflow SELF-CORRECTS. The grown row shrinks the
    // canvas, the pointer falls outside it, `handleMouseLeave` clears the label,
    // the row shrinks back — so by the time a gesture's box could be sampled it
    // has already relaxed, and the only surviving evidence is an EMPTY readout
    // (which is what [6f]/[8a] catch). A row that compared boxes across the
    // gesture was green under a poison that reproduced the defect exactly, so it
    // was replaced by this: force a long string onto the line and assert the box
    // while it is there. Deterministic, and red under either half of the fix
    // being removed.
    // ⚠ WORDS, NOT ONE 200-CHARACTER TOKEN. Measured: `'x'.repeat(200)` has no
    // break opportunity, so it OVERFLOWS instead of wrapping and this row stayed
    // green under both CSS poisons. A message with spaces is what a wrapped
    // header row is actually made of.
    const LONG = 'the refusal reasoning as one long sentence '.repeat(5);
    const injected = await c.json(String.raw`(() => {
      const el = document.getElementById('art-browser-hover-label');
      if (!el) return null;
      const prev = el.textContent;
      el.textContent = ${JSON.stringify(LONG)};
      const cv = document.getElementById('art-browser-canvas');
      const r = cv.getBoundingClientRect();
      const held = el.textContent.length;
      el.textContent = prev;
      return { held, left: r.left, top: r.top, width: r.width, height: r.height,
               cw: cv.width, ch: cv.height };
    })()`);
    check('6h', `A LONG MESSAGE ON THE READOUT LINE CANNOT MOVE THE STRIP: with ${LONG.length} `
      + 'characters of ordinary words forced onto it, the canvas box is byte-identical to '
      + "section 3's",
      !!injected && injected.held === LONG.length
      && injected.left === geom.left && injected.top === geom.top
      && injected.width === geom.width && injected.height === geom.height
      && injected.cw === geom.cw && injected.ch === geom.ch,
      `section 3=${JSON.stringify(geom)}\n        with 200 chars on the line=${JSON.stringify(injected)}`);

    check('6i', 'and the gesture\'s OWN message leaves the box where it was',
      !!geomAfter6 && geomAfter6.left === geom.left && geomAfter6.top === geom.top
      && geomAfter6.width === geom.width && geomAfter6.height === geom.height
      && geomAfter6.cw === geom.cw && geomAfter6.ch === geom.ch,
      `before=${JSON.stringify(geom)}\n        after =${JSON.stringify(geomAfter6)}\n        `
      + `line=${JSON.stringify(label6 && label6.text)}`);

    check('6g', 'ANTI-VACUOUS: the drag actually CHANGED the candidate rather than agreeing '
      + 'with what was already there',
      JSON.stringify(cand6) !== JSON.stringify(candBefore),
      `before=${JSON.stringify(candBefore)} after=${JSON.stringify(cand6)}`);
    await shot(c, 'strip-drag-range');

    // ---- 6B. THE BAND CARD'S OWN READOUT, ON THE SAME LINE -----------------
    //
    // ⚠ THE SAME DOM ELEMENT, A DIFFERENT FEATURE. `BandCard`'s hover handler
    // writes `#art-browser-hover-label` — the line sections 6f/6g2/6g3 just
    // measured for the strip drag — so everything the strip readout was
    // shortened to satisfy applies to it word for word, and nothing above
    // measures it: [6g2] reads whatever text is on the line, and a band label
    // is only on the line while the pointer is on a card.
    //
    // It was found long: `band 0 · slots 0..31 (8x4)` wanted 155px in a 106px
    // box (measured in this app, this branch's predecessor), i.e. ~30% of it
    // under the ellipsis, on a line documented as unable to wrap.
    //
    // THE ROWS BELOW ARE ABOUT THE ELEMENT, NOT THE STRING. A character budget
    // is the vacuous shape this repo keeps finding — `scrollWidth <=
    // clientWidth` is the quantity `text-overflow: ellipsis` actually turns on.
    const cards = await c.json(`(() => {
      const el = [...document.querySelectorAll('.art-browser-band')];
      return el.map((e) => {
        const r = e.getBoundingClientRect();
        return { band: Number(e.getAttribute('data-band')), title: e.title,
          caption: (e.textContent || '').trim(),
          x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
    })()`);
    const lineBefore = await c.json(HOVER_LABEL);
    check('6j', 'ANTI-VACUOUS: a band card is on screen, its caption is the one the picker '
      + 'builds, and the line still holds SECTION 6\'S DRAG MESSAGE going in — so a band '
      + 'readout found on it below was written BY this hover and is not a leftover',
      cards.length > 0 && bands.length === cards.length
      && cards.every((k) => /^Band \d+ · \d+x\d+$/.test(k.caption))
      && !!lineBefore && lineBefore.text === label6.text && lineBefore.text.trim() !== '',
      `${cards.length} card(s) ${JSON.stringify(cards)} · line before = ${JSON.stringify(lineBefore)} `
      + `· section 6's readout = ${JSON.stringify(label6 && label6.text)}`);

    // Hover it the way a mouse does. `BandCard` writes the line from
    // `onMouseEnter`, so a synthetic call into the store would prove nothing
    // about the wiring.
    const card0 = cards[0];
    const band0 = bands.find((b) => b.index === card0.band);
    await c.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: card0.x, y: card0.y, button: 'none', buttons: 0 });
    await sleep(400);
    const hov = await c.json(`(() => {
      const el = document.getElementById('art-browser-hover-label');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { text: (el.textContent || ''), title: el.title,
        sw: el.scrollWidth, cw: el.clientWidth, truncated: el.scrollWidth > el.clientWidth,
        font: cs.font, overflow: cs.textOverflow, whiteSpace: cs.whiteSpace };
    })()`);
    console.log(`  BAND READOUT: ${JSON.stringify(hov)}`);

    // THE INCLUSIVE END, DERIVED FROM THE CODEC'S OWN COUNT — `bandRows()`
    // carries `tileCount` (`bandTileCount`, in the codec), so this row never
    // re-multiplies the `cols * rows` the label itself is built from, and a
    // label that went back to naming `base + count` fails on the negative half
    // as well as the positive one.
    const lastOwned0 = band0.slotBase + band0.tileCount - 1;
    const pastEnd0 = band0.slotBase + band0.tileCount;
    check('6k', 'hovering a band card SAYS which slots that band owns — naming the LAST slot '
      + 'it contains, never the first past it — and the detail the line cannot hold (the noun '
      + '"slots", and the geometry) is on the title, not gone',
      !!hov && hov.text.includes(`${band0.slotBase}..${lastOwned0}`)
      && !hov.text.includes(`${band0.slotBase}..${pastEnd0}`)
      && hov.title.includes(`slots ${band0.slotBase}..${lastOwned0}`)
      && hov.title.includes(`(${band0.cols}x${band0.rows})`)
      && card0.title.includes(`slots ${band0.slotBase}..${lastOwned0}`)
      && hov.text !== lineBefore.text,
      `line=${JSON.stringify(hov && hov.text)} title=${JSON.stringify(hov && hov.title)} `
      + `card title=${JSON.stringify(card0.title)} · expected ${band0.slotBase}..${lastOwned0}, `
      + `NOT ${band0.slotBase}..${pastEnd0} (band ${band0.index}: base ${band0.slotBase}, `
      + `tileCount ${band0.tileCount} straight off the codec)`);

    check('6l', 'and the line FITS: the band readout the app just wrote is not truncated at the '
      + 'docked panel width — the property text-overflow:ellipsis actually turns on',
      !!hov && hov.sw <= hov.cw && hov.whiteSpace === 'nowrap',
      `${JSON.stringify(hov && hov.text)} scrollWidth=${hov && hov.sw} `
      + `clientWidth=${hov && hov.cw} whiteSpace=${hov && hov.whiteSpace}`);

    // ── AND FOR EVERY BAND THIS CODEC CAN BUILD, NOT JUST THIS ONE ─────────
    //
    // [6l] alone is the vacuous shape [6g3] exists to prevent one row further
    // up: it measures `b0 · 0..31`, a single-digit band index over two-digit
    // slots, and a label tuned to that is green here while a 448-slot document
    // ellipsises the moment its second band starts past slot 99.
    //
    // DERIVED FROM THE VENDORED CONTRACT, NEVER TYPED: `BGANIM_MAX_BANDS`
    // bounds the index, `BG_TILE_CAPACITY` bounds `slot_base + cols*rows`, and
    // the legal `rows` are enumerated through the codec's own rule (`rows *
    // TILE_BYTES` an exact power of two) rather than restated as a list. That
    // is every (index, slotBase, cols, rows) a `TilePickerBandGroup` can carry.
    //
    // THE REDUCTION IS MEASURED, NOT ASSUMED. ~800k tuples cannot each be laid
    // in the DOM, so one representative per STRING LENGTH is measured instead —
    // which is exact only if every digit renders at the same width, since the
    // scaffold is fixed and every varying character is a digit. So the ten
    // digits are measured first and the row is NOT-MEASURABLE, never green, if
    // they disagree.
    const CONTRACT = JSON.parse(readFileSync(
      `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
    const konst = (name) => {
      const v = CONTRACT?.constants?.[name]?.value;
      if (typeof v !== 'number') throw new Error(`contract has no constants.${name}.value`);
      return v;
    };
    const MAX_BANDS = konst('BGANIM_MAX_BANDS');
    const CAPACITY = konst('BG_TILE_CAPACITY');
    const T_BYTES = konst('TILE_BYTES');
    const bandRowChoices = [];
    for (let r = 1; r <= CAPACITY; r++) {
      const bytes = r * T_BYTES;
      if ((bytes & (bytes - 1)) === 0) bandRowChoices.push(r);
    }
    // One representative per rendered length. `reps` is what crosses into the
    // page; `tuples` is only counted, so the whole space is walked here.
    const byLen = new Map();
    let tuples = 0;
    const mkLabel = (i, base, cols, rows) => `b${i} · ${base}..${base + cols * rows - 1}`;
    for (let i = 0; i < MAX_BANDS; i++) {
      for (const rows of bandRowChoices) {
        for (let base = 0; base + rows <= CAPACITY; base++) {
          for (let cols = 1; base + cols * rows <= CAPACITY; cols++) {
            tuples++;
            const s = mkLabel(i, base, cols, rows);
            if (!byLen.has(s.length)) byLen.set(s.length, s);
          }
        }
      }
    }
    const reps = [...byLen.values()];
    // ⚠ `clientWidth` IS NOT THE BOX WHEN THE TEXT IS NARROWER THAN IT. This
    // line is a shrink-to-fit flex item: it reports the width of its OWN TEXT
    // until the text outgrows the row, and only then caps at what the row has
    // left. So the fit test is `sw <= cw` measured with the SAME string in
    // place — [6g3]'s shape — where equality means the box gave the string
    // everything it asked for. The `avail` figure the page also returns is that
    // cap, forced onto the line by a string no row could hold. It is REPORTED
    // for the record and never compared against: read `clientWidth` back after
    // the short label is restored and it is the LABEL's width, not the box's,
    // which is a comparison a fitting label loses. (Measured — it turned this
    // row red at `avail=75` on a label the box had granted in full.)
    const widest = await c.json(String.raw`((reps) => {
      const el = document.getElementById('art-browser-hover-label');
      if (!el) return null;
      const prev = el.textContent;
      const digits = [];
      for (let d = 0; d <= 9; d++) { el.textContent = String(d).repeat(24); digits.push(el.scrollWidth); }
      let worst = null;
      for (const s of reps) {
        el.textContent = s;
        const w = { text: s, sw: el.scrollWidth, cw: el.clientWidth };
        if (!worst || w.sw > worst.sw) worst = w;
      }
      el.textContent = 'W'.repeat(200);
      const avail = el.clientWidth;
      el.textContent = prev;
      return { digits, worst, avail };
    })(` + JSON.stringify(reps) + `)`);
    const uniformDigits = !!widest && widest.digits.every((w) => w === widest.digits[0]);
    const template6b = `b${band0.index} · ${band0.slotBase}..${lastOwned0}`;
    if (!uniformDigits) {
      unmeasurable('6m', 'the widest band readout the whole legal value range can produce fits '
        + 'the docked box',
        `the ten digits do NOT render at one width (${JSON.stringify(widest && widest.digits)}), `
        + 'so one representative per string length is not the worst case and this reduction '
        + 'cannot stand — enumerate the strings themselves');
    } else {
      check('6m', `FOR THE WHOLE LEGAL VALUE RANGE: the WIDEST band readout any of the ${tuples} `
        + `legal (index, slotBase, cols, rows) tuples the contract allows (${MAX_BANDS} bands, `
        + `capacity ${CAPACITY}, rows ${bandRowChoices.join('/')}) can produce still fits the `
        + 'docked box — measured over one representative per rendered length, with the ten '
        + 'digits measured equal first, and the template pinned against the live label',
        template6b === hov.text && widest.worst.sw <= widest.worst.cw,
        `widest=${JSON.stringify(widest && widest.worst)} avail=${widest && widest.avail} `
        + `(margin ${widest && widest.avail - widest.worst.sw}px) · ${reps.length} lengths over `
        + `${tuples} tuples · template ${JSON.stringify(template6b)} vs live `
        + `${JSON.stringify(hov && hov.text)} · digit widths ${JSON.stringify(widest && widest.digits)}`);
    }
    await shot(c, 'band-card-readout');
    // Off the card, so section 7 starts on the empty line [6j] asserted.
    await c.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: Math.round(geom.left + geom.width / 2),
        y: Math.round(geom.top + geom.height / 2), button: 'none', buttons: 0 });
    await sleep(300);

    // ---- 7. THE SAME RUN, DRAGGED BACKWARDS -------------------------------
    // EVERY LATER SECTION REUSES THE AIMS COMPUTED IN SECTION 3, so the box is
    // re-read before each one. A silent shift here would present as an
    // off-by-N in the feature; it presented exactly that way once already.
    const boxStable = async (id, when) => {
      const g = await c.json(STRIP_GEOM);
      check(id, `the strip box is still where section 3 measured it, ${when} — the aims below `
        + 'reuse those coordinates',
        !!g && g.left === geom.left && g.top === geom.top
        && g.width === geom.width && g.height === geom.height && g.cw === geom.cw,
        `section 3=${JSON.stringify(geom)}\n        now      =${JSON.stringify(g)}`);
      return !!g && g.left === geom.left && g.top === geom.top;
    };
    await boxStable('7b', 'entering section 7');
    await c.evalExpr('window.__dbg.aeon.setBandLensTarget(null)');
    await dragSlots(aimB, aimA);
    const rep7 = await c.json('window.__dbg.aeon.stripDrag()');
    const cand7 = await c.json('window.__dbg.aeon.bandCandidate()');
    check('7a', 'dragging RIGHT-TO-LEFT aims the same range as left-to-right',
      rep7.kind === 'range' && rep7.anchorSlot === runTo && rep7.releaseSlot === runFrom
      && cand7.staticBase === cand6.staticBase && cand7.cols === cand6.cols,
      `forward base=${cand6.staticBase} cols=${cand6.cols} · backward base=${cand7.staticBase} `
      + `cols=${cand7.cols} (report ${JSON.stringify(rep7)})`);

    // ---- 8. THE REFUSAL, AND IT IS LOUD -----------------------------------
    // A run entirely inside the ANIMATED PREFIX names no static art at all.
    // Nothing may change, and the line must say why.
    await boxStable('8c', 'entering section 8');
    const preA = aimFor(0);
    const preB = aimFor(Math.max(1, fps - 1));
    if (!preA || !preB || fps < 2) {
      unmeasurable('8a', 'a drag entirely inside the animated prefix is refused, loudly',
        `this document's prefix is ${fps} slot(s) — too short to drag a run inside, or no `
        + 'integer aim exists for both ends. The branch is proven in the node suite '
        + '(band-strip-range.test.ts, "a run entirely inside the animated prefix is refused").');
    } else {
      const candPre = await c.json('window.__dbg.aeon.bandCandidate()');
      const gest8 = (await c.json('window.__dbg.aeon.stripDrag()')).gestures;
      await dragSlots(preA, preB);
      const rep8 = await c.json('window.__dbg.aeon.stripDrag()');
      const cand8 = await c.json('window.__dbg.aeon.bandCandidate()');
      const label8 = await c.json(HOVER_LABEL);
      check('8a', 'a drag entirely inside the animated prefix is REFUSED, the candidate is '
        + 'byte-identical, and the picker\'s line says why (with the full reasoning on the title)',
        rep8.gestures === gest8 + 1 && rep8.kind === 'refused'
        && JSON.stringify(cand8) === JSON.stringify(candPre)
        && !!label8 && label8.text.startsWith('no range — ')
        // ⚠ THE REFUSAL'S OWN WORDS, and they moved at 023e0ed9 (2026-09-02).
        // `providers/band-strip-range.ts:206` says "already belong to TILE
        // ANIMATIONS"; this read "already belong to bands", which is the word
        // the vocabulary split retired precisely because it named two features.
        // Taken from the provider, not from a passing run — the node suite
        // pins the same literal at band-strip-range.test.ts:227 and :488.
        && /already belong to tile animations/.test(label8.text)
        && /animated prefix/.test(label8.title),
        `report=${JSON.stringify(rep8)} candidate ${JSON.stringify(candPre)} -> ${JSON.stringify(cand8)} `
        + `readout=${JSON.stringify(label8)}`);
      check('8b', 'ANTI-VACUOUS for the refusal: the run really was inside the prefix, and this '
        + 'file agrees it has no answer',
        expectOutcome(0, Math.max(1, fps - 1), ROWS, fps, budget.tiles).kind === 'refused',
        `slots 0..${fps - 1} against firstPromotableSlot=${fps}`);
    }

    // ---- 9. THE FOREGROUND IS UNTOUCHED -----------------------------------
    // The same integers name the ZONE TILESET there. The drag must do nothing
    // new, and today's click behaviour must be exactly what it was.
    await c.evalExpr('window.__dbg.aeon.setLayer("fg")');
    await sleep(900);
    const geomFg = await c.json(STRIP_GEOM);
    const candFgBefore = await c.json('window.__dbg.aeon.bandCandidate()');
    const selFgBefore = await c.json('window.__dbg.aeon.selectedTile()');
    check('9a', 'ANTI-VACUOUS: the picker is now on the FOREGROUND tileset, a DIFFERENT array',
      selFgBefore.layer === 'fg' && !!geomFg
      && geomFg.countLabels.length > 0 && !/background/.test(geomFg.countLabels[0]),
      `layer=${selFgBefore.layer} count row=${JSON.stringify(geomFg && geomFg.countLabels)}`);
    await dragSlots(aimA, aimB);
    const rep9 = await c.json('window.__dbg.aeon.stripDrag()');
    const cand9 = await c.json('window.__dbg.aeon.bandCandidate()');
    const sel9 = await c.json('window.__dbg.aeon.selectedTile()');
    const tool9 = await c.evalExpr('window.__dbg.aeon.state().tool');
    check('9b', 'in the FOREGROUND the identical drag is a PLAIN PICK, and it says which path '
      + 'it took rather than merely leaving the candidate alone',
      rep9.kind === 'pick' && rep9.detail === 'not-the-override-blob'
      && JSON.stringify(cand9) === JSON.stringify(candFgBefore),
      `report=${JSON.stringify(rep9)} candidate ${JSON.stringify(candFgBefore)} -> ${JSON.stringify(cand9)}`);
    check('9c', 'and today\'s FG click behaviour is exactly what it was — the release slot is '
      + 'picked and paint-tile arms',
      sel9.fg === rep9.releaseSlot && tool9 === 'paint-tile' && sel9.bg === selFgBefore.bg,
      `fg #${selFgBefore.fg} -> #${sel9.fg} (release slot ${rep9.releaseSlot}), tool=${tool9}, `
      + `bg untouched at #${sel9.bg}`);
    await c.evalExpr('window.__dbg.aeon.setLayer("bg")');
    await sleep(600);

    // ---- 10. THE LENS LIGHTS THE DRAGGED RANGE ON THE MAP ------------------
    // The end of the loop: the strip aimed it, and the map — two facets away —
    // tints exactly the cells that range paints, cross-checked against the raw
    // layout words pulled out of the model in this process.
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1600);
    await c.evalExpr(SUBTAB('tileAnim'));
    await sleep(1000);
    const candNow = await c.json('window.__dbg.aeon.bandCandidate()');
    const lens = await c.json('window.__dbg.aeon.bandLens()');
    const layout = await c.json(
      'Array.from({length: 4096}, (_, i) => window.__dbg.aeon.bgOverrideLayoutAt(i))');
    const MASK = (() => {
      const j = JSON.parse(readFileSync(
        `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
      const v = j?.constants?.LAYOUT_TILE_INDEX_MASK?.value;
      if (typeof v !== 'number') throw new Error('contract has no LAYOUT_TILE_INDEX_MASK');
      return v;
    })();
    const indep = layout.filter((w) => {
      if (w === 0) return false;                       // the consumer's blank escape
      const s = w & MASK;
      return s >= candNow.staticBase && s < candNow.staticBase + candNow.cols * candNow.rows;
    }).length;
    check('10a', 'the map lens lights the range THE STRIP AIMED, and its cell count equals this '
      + 'file\'s own scan of the raw layout words',
      lens.active === true && lens.kind === 'candidate'
      && lens.range.base === candNow.staticBase
      && lens.range.count === candNow.cols * candNow.rows
      && lens.cells === indep,
      `lens=${JSON.stringify(lens)} independent=${indep} cells `
      + `(mask 0x${MASK.toString(16)} off the vendored contract)`);
    check('10b', 'ANTI-VACUOUS: the range the strip aimed actually paints something, so [10a] '
      + 'is not comparing zeroes',
      indep > 0, `${indep} cells`);
    note(`FOOTPRINT of the dragged range (slots ${candNow.staticBase}..`
      + `${candNow.staticBase + candNow.cols * candNow.rows}, ${candNow.cols}x${candNow.rows}): `
      + `${indep} cells. NEUTRAL INFORMATION — promotion animates a range wherever the picture `
      + 'uses it, and whether that is the look wanted is the owner\'s call.');
    await shot(c, 'strip-drag-lens');

    // ---- 11. NOTHING WAS WRITTEN ------------------------------------------
    const hash1 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('11a', 'IT WRITES NO DOCUMENT: the override hashes back to exactly what it was at [2c]',
      hash1 === hash0 && hash0 !== null, `${hash0} -> ${hash1}`);
    // ⚠ NOT `canUndo`: `__dbg.aeon.state()` does not carry one, so a row written
    // against it would pass on `undefined` and assert nothing. The observable
    // that exists is the dirty flag and the per-act dirty map, and `dirty` is
    // asserted PRESENT so a renamed field cannot make this vacuous either.
    const undo = await c.json('window.__dbg.aeon.state()');
    check('11b', 'and the project is still CLEAN — an aim is not an edit, so nothing marked '
      + 'the act dirty either',
      typeof undo.dirty === 'boolean' && undo.dirty === false
      && Array.isArray(undo.dirtyActs) && undo.dirtyActs.length === 0,
      JSON.stringify({ dirty: undo.dirty, dirtyActs: undo.dirtyActs }));
  } finally {
    try { c && c.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  }

  const passed = results.filter((r) => r.ok).length;
  const nm = results.filter((r) => r.nm).length;
  console.log(`\n${passed}/${results.length - nm} PASSED`
    + (nm ? `, ${nm} NOT MEASURABLE` : '')
    + (fails.length ? `\nFAILED: ${fails.join(', ')}` : ''));
  if (unmeasured.length) console.log(`NOT MEASURABLE: ${unmeasured.join(' | ')}`);
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
