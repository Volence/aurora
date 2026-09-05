// ═══════════════════════════════════════════════════════════════════════════
// rowremap-author - AUTHOR A ROW REMAP THROUGH THE REAL UI AND SAVE IT
// ═══════════════════════════════════════════════════════════════════════════
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// `docs/reviews/2026-09-05-scene-anchor-writer.md` §6 recorded `rowRemap` as
// BLOCKED end to end, on two aeon/sigil declarations, and its harness therefore
// took the remap OFF again before saving (its row [7d]). Both blockers landed
// on aeon `origin/master` at `1072a05c` the same day:
//
//   1. the generated act module's HEAD LABEL no longer encodes a payload name,
//      so an editor-authored deform table LINKS (aeon `072adc8b`);
//   2. `row_remap_gate.py`'s visibility arm now treats a band as varying if a
//      table is attached OR `CURVE_FLAG_ACTIVE_BIT` is set, which is what its
//      own cited authority always permitted.
//
// So this harness is the previous one with its retreat removed: it authors the
// remap AND SAVES IT, and the ROM is built from what the app wrote.
//
// ── WHAT IS AUTHORED, AND WHY EACH VALUE ────────────────────────────────
//
//   layer 0  top 0    fa FACTOR_1  fb FACTOR_1_8                     sky
//   layer 1  top 96   fa FACTOR_1  fb FACTOR_1_8  curve -> FACTOR_1_2
//                                  rowRemap { plane_y 96, 16 lines }  THE WATER
//   layer 2  top 160  fa FACTOR_1  fb FACTOR_1_2                     under it
//   anchor   channel 0, BOTH planes off (the no-deform sentinel)
//
// * ROUTE (c). aeon's precondition 1 names three ways to give the remap
//   something to vary; (c) is "a `curve:` on that layer" and needs no deform
//   table. Route (b) is now buildable too, but (c) is the smaller claim and it
//   is the one the fixed gate's own end-to-end probe used.
// * THE ANCHOR IS PURE-BOUNDARY. `dsa`/`dsb` are 0..15 with 15 meaning NO
//   DEFORM, and aeon refuses a curve beside an anchor carrying LIVE shifts.
//   15/15 is not the extreme case, it is the PERMITTED one, and it is what the
//   toggle seeds.
// * ⚠ THE CURVE RAMPS UPWARD. `fb` is the factor at the strip's TOP and
//   `curve.to` the factor at its BOTTOM (aeon `scene_dsl.emp:441`), and a
//   DESCENDING curve garbles the background - bisected on a live machine today
//   (aeon `df3b8810`, "a DESCENDING parallax curve garbles the background and
//   an ascending one does not"; mechanism unestablished). FACTOR_1_8 ->
//   FACTOR_1_2 goes up, and it lands on layer 2's own `fb` so the two strips
//   meet without a step. Rows [7a]/[7b] measure that Aurora says NOTHING about
//   this direction, which is this run's finding rather than its assumption.
// * `fa` IS FACTOR_1 ON EVERY STRIP. aeon `7ee97fe1` found a non-FACTOR_1 `fa`
//   tears the FOREGROUND, independently of the curve defect.
//
// ── DISTRUST A CLEAN RESULT ─────────────────────────────────────────────
//
// Every verdict below is taken from the DOCUMENT THE APP HOLDS or from the FILE
// THE APP WROTE, never from a helper this repo also ships. The save rows print
// the file's existence before and after, and [9b] re-reads the bytes off disk
// rather than trusting the in-memory copy. Nothing here hand-edits the app's
// output: a gap found by a control refusing is the deliverable.
//
// ── RUN ─────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a WRITABLE aeon CLONE> \
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:rowremap-author
//
// Never against the live aeon checkout: this harness SAVES.

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9529);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ THE OVERRIDE IS READ THROUGH THE RESOLVER, NEVER OFF `process.env`. This
// harness SAVES, so it genuinely REQUIRES an explicit override.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';
const SHOTS = join(ROOT, 'docs/captures/2026-09-05-rowremap');

const SCENE_ID = 'aurora_rowremap_waterline';
const SECTION = 2;
/** The patch channel the split latches to. aeon's own `ojz_act1_start` uses 0. */
const CHANNEL = 0;
/** The strip that carries the water: its curve and its remap. */
const REMAP_LAYER = 1;
/** The BG plane line where that strip's art paints the surface. */
const PLANE_Y = 96;
/** Plane B at the strip's TOP, and at its BOTTOM. Upward: see the banner. */
const CURVE_FROM = 'FACTOR_1_8';
const CURVE_TO = 'FACTOR_1_2';
/**
 * A DESCENDING far end, used ONLY to measure what the panel says about one.
 * Below `CURVE_FROM` on the same 1/N ladder, so the ramp runs downhill.
 * Driven at [7b] and taken straight back off; it is never saved.
 */
const CURVE_DOWN = 'FACTOR_1_16';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** NOT a pass and NOT a zero - its own bucket, and it makes the run non-zero. */
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name} - ${why}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

function getJSON(path, timeoutMs = 1500) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (r) => {
      let d = ''; r.on('data', (ch) => (d += ch));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', rej);
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
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${JSON.stringify(m.error)}`)) : res(m.result)));
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

async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}
/** Scrolling is used ONLY for a picture, never to reach a control. */
async function shotAt(c, selectorExpr, name) {
  await c.evalExpr(`(() => { const e = ${selectorExpr};
    if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  await sleep(350);
  await shot(c, name);
}

async function mouse(c, type, x, y, button = 'left') {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button, buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlS = (c) => key(c, 's', 'KeyS', 83, 2);

// ── SELECTORS ──────────────────────────────────────────────────────────────
//
// ⚠ NEVER END-ANCHOR A TITLE REGEX. Titles carry long schema-description
// suffixes. Every pattern below is a PREFIX with `\b`.
//
// ⚠ AND THE ROW REMAP ROW HAS *TWO* SELECTS whose titles both begin
// `Layer N rowRemap` - the on/off toggle and the height picker
// (`rowRemap.height_shift`). `find()` returns whichever renders first, so a
// pattern that matched both would drive the toggle while reporting the height.
// The toggle's pattern carries a negative lookahead for the dot.
const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;
const NUM_BY_TITLE = (re) => `[...document.querySelectorAll('input[type=number]')].find((e) => ${re}.test(e.title || ''))`;

const SET_SELECT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  if (![...el.options].some((o) => o.value === ${JSON.stringify(String(value))})) {
    return 'no-such-option: ' + JSON.stringify([...el.options].map((o) => o.value));
  }
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

/** The whole option list of one select, as the DOM holds it. */
const OPTIONS_OF = (selector) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return null;
  return {
    value: el.value,
    options: [...el.options].map((o) => ({
      value: o.value, label: o.textContent, title: o.title, disabled: !!o.disabled,
    })),
  };
})()`;

/** One number input's own advertised bounds, read back off the DOM. */
const NUMBER_STATE = (selector) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return null;
  return { value: el.value, min: el.min, max: el.max };
})()`;

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/**
 * A REAL POINTER GESTURE target, found by text.
 *
 * ⚠ `element.click()` IS NOT A CLICK where the app listens for pointer events.
 * This returns the rect so the caller dispatches a real press/release at
 * INTEGER client pixels, and it prints the rect against its SCROLLER's box -
 * `checkVisibility()` and `getClientRects()` both go green on an element
 * scrolled far outside its scroller.
 */
const RECT_BY_TEXT = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const sc = el.closest('[style*="overflow"]') || document.scrollingElement;
  const s = sc ? sc.getBoundingClientRect() : null;
  return {
    x: r.x, y: r.y, w: r.width, h: r.height, disabled: !!el.disabled,
    dpr: window.devicePixelRatio,
    scroller: s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null,
    insideScroller: s ? (r.top >= s.top - 1 && r.bottom <= s.bottom + 1) : null,
  };
})()`;

async function clickRect(c, rect) {
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h / 2);
  await mouse(c, 'mousePressed', x, y);
  await mouse(c, 'mouseReleased', x, y);
  return { x, y };
}

/**
 * THE GESTURE LEDGER. Every drive is recorded with what it returned, and row
 * [10a] asserts they ALL said 'ok'. Without it a selector that matches nothing
 * leaves the control at a legal default, and a later read of that default is
 * indistinguishable from success.
 */
const driven = [];
async function drive(c, label, expr) {
  const r = await c.evalExpr(expr);
  driven.push({ label, r });
  if (r !== 'ok') note(`gesture "${label}" returned`, JSON.stringify(r));
  return r;
}

/**
 * THE SCENE SECTION ARRIVES COLLAPSED (`defaultCollapsed` on
 * `aeon.effects.scene`), so the anchor rows are NOT IN THE DOM until an author
 * opens it. A `no-element` read off a collapsed section is NAVIGATION MISSING,
 * not a control missing, and reading it the other way writes up a live control
 * as absent. Opened by a REAL pointer gesture on the header's title span, and
 * idempotent BY MEASUREMENT: it probes for a control that exists only inside
 * the section and clicks again if it is still absent.
 */
const HEADER_SPAN_RECT = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('span')]
    .filter((e) => ${re}.test((e.textContent || '').trim()))
    .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const sc = el.closest('[style*="overflow"]') || document.scrollingElement;
  const s = sc ? sc.getBoundingClientRect() : null;
  return {
    x: r.x, y: r.y, w: r.width, h: r.height, text: (el.textContent || '').trim(),
    dpr: window.devicePixelRatio,
    scroller: s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null,
    insideScroller: s ? (r.top >= s.top - 1 && r.bottom <= s.bottom + 1) : null,
  };
})()`;

async function openSection(c, titleRe, probeExpr, label) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await c.evalExpr(`!!(${probeExpr})`)) return { open: true, attempt: attempt - 1 };
    const rect = await c.json(HEADER_SPAN_RECT(titleRe));
    if (rect === null) return { open: false, attempt, why: 'no header span matched' };
    note(`${label} header rect`, `x=${rect.x} y=${rect.y} w=${rect.w} h=${rect.h} `
      + `dpr=${rect.dpr} insideScroller=${rect.insideScroller} text=${JSON.stringify(rect.text)}`);
    const at = await clickRect(c, rect);
    note(`clicked ${label} header at integer client px`, `(${at.x}, ${at.y})`);
    await sleep(700);
  }
  return { open: await c.evalExpr(`!!(${probeExpr})`), attempt: 2 };
}

/** The selected scene as the APP holds it. */
function SCENE_JSON() {
  return String.raw`(() => {
  const raw = window.__dbg.aeon.scenesJson ? window.__dbg.aeon.scenesJson() : null;
  if (!raw) return null;
  const all = JSON.parse(raw);
  const list = Array.isArray(all) ? all : (all.scenes || []);
  return list.find((s) => s && s.id === ${JSON.stringify(SCENE_ID)}) || null;
})()`;
}

const ANCHOR_SEL = (field) => SEL_BY_TITLE(String.raw`/^anchor\.at\.${field}\b/`);
const REMAP_TOGGLE = SEL_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} rowRemap\b(?!\.)/`);
const REMAP_HEIGHT = SEL_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} rowRemap\.height_shift\b/`);
const REMAP_PLANEY = NUM_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} rowRemap\.plane_y\b/`);
const CURVE_SEL = SEL_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} curve\.to\b/`);

/** The remap payload, off the document the app holds. */
async function remapOf(c) {
  const doc = await c.json(`(${SCENE_JSON()})`);
  const rr = doc && doc.layers && doc.layers[REMAP_LAYER] && doc.layers[REMAP_LAYER].rowRemap;
  return (rr && rr !== 'none') ? rr : null;
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  // ⚠ BOTH VARIABLES OR NEITHER. A worktree has no `node_modules/.bin/electron`
  // and no `dist/`, so without AURORA_BUILT_TREE the resolver walks UP and
  // borrows the MAIN checkout's built tree - every row then runs green against
  // an app this parcel did not build.
  if (RUN.borrowed) {
    throw new Error(`REFUSING: the run root was BORROWED from ${RUN.root}, which is not the tree `
      + 'this harness was started from. Set AURORA_BUILT_TREE to the worktree.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone - this harness SAVES.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM. Through the override-aware `siblingPath` this
  // guard breaks BOTH ways: it would refuse a legitimate clone and it would
  // PASS the real tree, failing open on exactly the case it exists for.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), which is `
      + 'a live lane tree another agent may be editing. This harness SAVES.');
  }

  const SCENE_PATH = join(AEONDIR, 'games/sonic4/data/editor/effects', `${SCENE_ID}.json`);
  const META_PATH = join(AEONDIR, 'games/sonic4/data/editor/ojz/act1', `section_${SECTION}.meta.json`);
  const metaBefore = existsSync(META_PATH);
  const sceneBefore = existsSync(SCENE_PATH);
  note('before', `section_${SECTION}.meta.json exists=${metaBefore} · ${SCENE_ID}.json exists=${sceneBefore}`);
  // ANTI-VACUOUS: if the scene file were already there, every "the app wrote
  // it" row below would be measuring somebody else's bytes.
  check('0a', 'the clone carries NO scene at this id before the app opens it', !sceneBefore,
    `${SCENE_PATH} exists_before=${sceneBefore}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});

    let haveDbg = false;
    for (let i = 0; i < 40 && !haveDbg; i++) {
      haveDbg = await c.evalExpr('!!(window.__dbg && window.__dbg.aeon)');
      if (!haveDbg) await sleep(500);
    }
    if (!haveDbg) throw new Error('window.__dbg absent - needs a VITE_AURORA_DEBUG=1 build');

    // ⚠ THE ONE NON-UI DOOR, AND IT IS DECLARED. aeon's only real open route is
    // a NATIVE FOLDER PICKER that CDP cannot drive. Everything after this line
    // is real UI interaction; this step is NOT UI evidence.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    await sleep(3500);
    const st = await c.json('window.__dbg.aeon.state()');
    check('1a', 'the aeon clone opened', st && st.open === true, JSON.stringify(st));
    await shot(c, '01-opened');

    const fxRect = await c.json(RECT_BY_TEXT(String.raw`/^Effects$/`, 'button,div,span,a'));
    if (fxRect === null) {
      cannotMeasure('1b', 'reach the Effects tab', 'nothing on screen reads exactly "Effects"');
    } else {
      note('Effects tab rect', `x=${fxRect.x} y=${fxRect.y} w=${fxRect.w} h=${fxRect.h} `
        + `dpr=${fxRect.dpr} insideScroller=${fxRect.insideScroller}`);
      await clickRect(c, fxRect);
      await sleep(1200);
      check('1b', 'the Parallax sub-tab is reachable once the Effects tab is open',
        (await drive(c, 'sub-tab parallax', SUBTAB('parallax'))) === 'ok');
    }
    await sleep(800);

    // ── [2] CREATE THE SCENE, through the panel's own New affordance ───────
    const idIn = `document.querySelector('input[placeholder="new_scene_id"]')`;
    const idOk = await drive(c, 'scene id field', SET_INPUT(idIn, SCENE_ID));
    const newRect = await c.json(RECT_BY_TEXT(String.raw`/^New$/`));
    if (newRect === null) {
      cannotMeasure('2a', 'create the scene through the UI',
        'no button whose text is exactly "New" is on screen');
    } else {
      note('New button rect', `x=${newRect.x} y=${newRect.y} w=${newRect.w} h=${newRect.h} `
        + `dpr=${newRect.dpr} insideScroller=${newRect.insideScroller}`);
      const at = await clickRect(c, newRect);
      note('clicked New at integer client px', `(${at.x}, ${at.y})`);
      await sleep(1200);
      const scenes = await c.json('window.__dbg.aeon.scenes()');
      const made = Array.isArray(scenes) && scenes.some((s) => (s.id ?? s) === SCENE_ID);
      check('2a', `a REAL pointer gesture created scene "${SCENE_ID}"`, idOk === 'ok' && made,
        `scenes now: ${JSON.stringify(scenes)}`);
    }
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);
    await sleep(600);

    for (let n = 1; n < 3; n++) {
      const r = await c.json(RECT_BY_TEXT(String.raw`/Add layer|^Add$/`));
      if (r === null || r.disabled) { note('Add layer unavailable', JSON.stringify(r)); break; }
      await clickRect(c, r);
      await sleep(500);
    }
    const afterAdd = await c.json(`(${SCENE_JSON()})`);
    check('2b', 'the panel\'s Add gesture built 3 strips',
      afterAdd && Array.isArray(afterAdd.layers) && afterAdd.layers.length === 3,
      `layers = ${afterAdd && afterAdd.layers ? afterAdd.layers.length : 'n/a'}`);
    await shot(c, '02-scene-created');

    if (process.env.DUMP_TITLES) {
      const titles = await c.json(String.raw`
        [...document.querySelectorAll('select,input')]
          .map((e) => e.tagName + '[' + (e.type || '') + '] ' + (e.title || '(no title)'))`);
      note('CONTROLS ON SCREEN', titles.join('\n        '));
    }

    // ── [3] THE THREE STRIPS ──────────────────────────────────────────────
    for (const [i, top, fa, fb] of [[0, 0, 'FACTOR_1', 'FACTOR_1_8'],
      [1, 96, 'FACTOR_1', CURVE_FROM], [2, 160, 'FACTOR_1', 'FACTOR_1_2']]) {
      await drive(c, `layer ${i} top`,
        SET_INPUT(NUM_BY_TITLE(String.raw`/^Layer ${i} Screen line\b/`), top));
      await drive(c, `layer ${i} fa`, SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${i} fa\b/`), fa));
      await drive(c, `layer ${i} fb`, SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${i} fb\b/`), fb));
    }
    await sleep(500);
    const strips = await c.json(`(${SCENE_JSON()})`);
    check('3a', 'all three strips took their top and both factors from the controls',
      strips && strips.layers?.length === 3
      && strips.layers[0].world_y === 0 && strips.layers[1].world_y === 96
      && strips.layers[2].world_y === 160
      && strips.layers.every((l) => l.fa === 'FACTOR_1')
      && strips.layers[1].fb === CURVE_FROM,
      JSON.stringify(strips?.layers));

    // ── [4] THE ANCHOR - precondition 2 ───────────────────────────────────
    // ⚠ THESE TWO PATTERNS MATCH LIVE UI TEXT AND THE CHARACTER IS AN EM DASH.
    // It is spelled as a `\u2014` ESCAPE because no committed file here may carry
    // the literal one (owner ruling, 2026-09-05, all tools) - and because a
    // pattern that quietly matched a HYPHEN instead would find nothing and read
    // as "the anchor control was never added", which is the exact misreading
    // the anchor packet's section 3 records. The escape is a regex escape, so the
    // pattern the app sees is unchanged.
    const toggleSel = SEL_BY_TITLE(String.raw`/^anchor \u2014/`);
    const opened = await openSection(c, String.raw`/^Scene \u2014 /`, toggleSel, 'Scene');
    note('scene section', JSON.stringify(opened));
    await drive(c, 'anchor on', SET_SELECT(toggleSel, 'on'));
    await sleep(500);
    await drive(c, 'anchor channel', SET_SELECT(
      SEL_BY_TITLE(String.raw`/^anchor\.at\.channel\b/`), CHANNEL));
    await sleep(500);
    const withAnchor = await c.json(`(${SCENE_JSON()})`);
    const at = withAnchor?.anchor?.at ?? null;
    check('4a', 'the anchor is declared on the requested channel, both planes on the '
      + 'no-deform sentinel - the shape aeon names as composing with a curve',
      at !== null && at.channel === CHANNEL && at.dsa === 15 && at.dsb === 15,
      `anchor.at = ${JSON.stringify(at)}`);
    await shotAt(c, ANCHOR_SEL('dsb'), '03-anchor-on');

    // ── [5] THE CURVE - precondition 1, route (c) ─────────────────────────
    const curveList = await c.json(OPTIONS_OF(CURVE_SEL));
    if (curveList === null) {
      cannotMeasure('5a', 'the curve picker is on screen', `no select matches ${CURVE_SEL}`);
    } else {
      note('curve.to options', JSON.stringify(curveList.options.map((o) => o.value)));
    }
    const curveOk = await drive(c, `layer ${REMAP_LAYER} curve.to (UPWARD)`,
      SET_SELECT(CURVE_SEL, CURVE_TO));
    await sleep(500);
    const withCurve = await c.json(`(${SCENE_JSON()})`);
    check('5a', `the remapped strip ramps Plane B UPWARD, ${CURVE_FROM} at its top to `
      + `${CURVE_TO} at its bottom`,
      curveOk === 'ok'
      && withCurve?.layers?.[REMAP_LAYER]?.fb === CURVE_FROM
      && JSON.stringify(withCurve?.layers?.[REMAP_LAYER]?.curve) === JSON.stringify({ to: CURVE_TO }),
      `fb=${JSON.stringify(withCurve?.layers?.[REMAP_LAYER]?.fb)} `
      + `curve=${JSON.stringify(withCurve?.layers?.[REMAP_LAYER]?.curve)}. aeon df3b8810: "a `
      + 'DESCENDING parallax curve garbles the background and an ascending one does not".');

    // ── [6] THE REMAP ITSELF ──────────────────────────────────────────────
    const remapOn = await drive(c, `layer ${REMAP_LAYER} rowRemap on`,
      SET_SELECT(REMAP_TOGGLE, 'ladder'));
    await sleep(600);
    const seeded = await remapOf(c);
    check('6a', 'turning the remap ON seeds it from the strip\'s own top, at a shift that BUILDS',
      remapOn === 'ok' && seeded !== null && seeded.plane_y === 96 && seeded.height_shift === 4,
      `rowRemap = ${JSON.stringify(seeded)} - the seed is the strip's own world_y clamped into `
      + 'rowRemap\'s own range, and the height is the one shift aeon can generate a ladder for.');

    // ⚠ [6b] THE HEIGHT PICKER'S EXTREME. `height_shift` is a SHIFT, not a line
    // count, and only ONE of its five legal values has a generated ladder. The
    // top of the range is therefore a value the build REFUSES BY NAME - the
    // same top-of-range shape as the anchor's sentinel, with a different
    // consequence. Drive the list to its last option and read BOTH the document
    // and the screen: the value must be written verbatim (never converted to a
    // line count) and the panel must say it does not build.
    const heights = await c.json(OPTIONS_OF(REMAP_HEIGHT));
    if (heights === null) {
      cannotMeasure('6b', 'the height picker\'s extreme is disclosed', 'no height select on screen');
      cannotMeasure('6c', 'the buildable option is marked', 'no height select on screen');
    } else {
      note('height options', JSON.stringify(heights.options.map((o) => `${o.value}:${o.label}`)));
      const last = heights.options[heights.options.length - 1];
      await drive(c, 'height -> last option', SET_SELECT(REMAP_HEIGHT, last.value));
      await sleep(500);
      const atExtreme = await remapOf(c);
      const screenAtExtreme = await c.evalExpr('document.body.innerText');
      check('6b', 'driving the height picker to its EXTREME writes the SHIFT verbatim and the '
        + 'panel says that value does not build',
        atExtreme !== null && atExtreme.height_shift === Number(last.value)
        && atExtreme.height_shift !== (1 << Number(last.value))
        && /does NOT BUILD/.test(screenAtExtreme),
        `last option = ${JSON.stringify(last)} · document now height_shift = `
        + `${atExtreme?.height_shift}. The file stores a SHIFT; ${1 << Number(last.value)} would `
        + 'be the line count, and exporting that would land a band eight times too tall with a '
        + 'GREEN build. The warning under the row is `rowRemapBuildableToday`.');
      // …and exactly one option is marked as the one that builds.
      const marked = heights.options.filter((o) => /builds today/.test(o.label));
      check('6c', 'exactly ONE option is marked as building today, and nothing is hidden',
        marked.length === 1 && heights.options.length === 5,
        `${heights.options.length} options offered, ${marked.length} marked: `
        + `${JSON.stringify(marked.map((o) => o.label))}. The list is NOT filtered - an author `
        + 'who opened a hand-authored shift 6 must see their own file in it.');
      await shotAt(c, REMAP_HEIGHT, '04-height-extreme');
      // Back to the one that builds, through the same control.
      const buildable = heights.options.find((o) => /builds today/.test(o.label));
      if (buildable !== undefined) {
        await drive(c, 'height -> the buildable option', SET_SELECT(REMAP_HEIGHT, buildable.value));
        await sleep(500);
      }
      const restored = await remapOf(c);
      const screenRestored = await c.evalExpr('document.body.innerText');
      check('6d', 'and choosing the marked option clears that warning - the row tracks the '
        + 'state rather than being stuck on',
        restored !== null && restored.height_shift === 4 && !/does NOT BUILD/.test(screenRestored),
        `height_shift back to ${restored?.height_shift}`);
    }

    // [6e] plane_y is typed, and its ceiling is REFUSED rather than clamped.
    const planeState = await c.json(NUMBER_STATE(REMAP_PLANEY));
    if (planeState === null) {
      cannotMeasure('6e', 'plane_y refuses past its ceiling', 'no plane_y input on screen');
    } else {
      note('plane_y box', JSON.stringify(planeState));
      const over = Number(planeState.max) + 1;
      const before = await remapOf(c);
      await drive(c, `plane_y -> ${over} (past the ceiling)`, SET_INPUT(REMAP_PLANEY, over));
      await sleep(500);
      const after = await remapOf(c);
      const refusalText = await c.evalExpr('document.body.innerText');
      check('6e', `typing ${over} into plane_y is REFUSED and does not silently clamp to `
        + `${planeState.max}`,
        after !== null && before !== null && after.plane_y === before.plane_y
        && after.plane_y !== over && after.plane_y !== Number(planeState.max),
        `plane_y stayed ${after?.plane_y} (was ${before?.plane_y}); the box's own advertised max `
        + `is ${planeState.max}. A clamp would substitute a number the author did not type, and `
        + 'this range is the contract\'s ONLY enforcement - aeon checks the floor and not the '
        + 'ceiling.');
      // ⚠ AND THE AUTHOR IS TOLD WHY. The first run of this harness probed for
      // the string "plane_y" and reported "Refusal on screen = false", which
      // reads exactly like a silent refusal - a control that eats a keystroke
      // and explains nothing. It was the PROBE that was wrong: the sentence
      // `rowRemapPlaneYRefusal` produces never says "plane_y", it names the
      // range. Matched here on the wording the function actually emits, so a
      // real silence would fail this row instead of being excused by it.
      check('6e2', 'and the refusal is on screen, in the contract\'s own words',
        /outside the Plane-B line range/.test(refusalText),
        'the sentence is rowRemapPlaneYRefusal\'s: "... is outside the Plane-B line range '
        + '0..511. This bound is the CONTRACT\'S ONLY ENFORCEMENT: aeon checks the floor and '
        + 'not the ceiling, so a larger value would build clean and emit a window pointing '
        + 'nowhere."');
      await drive(c, `plane_y -> ${PLANE_Y}`, SET_INPUT(REMAP_PLANEY, PLANE_Y));
      await sleep(500);
    }

    const authored = await remapOf(c);
    check('6f', 'the remap now carries the plane line and the buildable height, both typed '
      + 'or picked through their own controls',
      authored !== null && authored.plane_y === PLANE_Y && authored.height_shift === 4,
      `rowRemap = ${JSON.stringify(authored)}`);
    await shotAt(c, REMAP_TOGGLE, '05-remap-authored');

    // ── [7] ⚠ THE CURVE'S DIRECTION - WHAT THE PANEL DOES NOT SAY ─────────
    //
    // Route (c) is the only route to a buildable remap that needs no deform
    // table, and it runs entirely through the curve picker. A DESCENDING curve
    // garbles the background (aeon `df3b8810`, bisected on a live machine
    // today), and aeon's `layer()` refuses only the DEGENERATE case where the
    // two ends are equal. So the question this run has to answer is whether an
    // author driving that picker is told anything about direction.
    //
    // Measured, not assumed: drive the picker DOWN, read the rendered text, and
    // put it straight back. Nothing descending is ever saved.
    const downOk = await drive(c, `layer ${REMAP_LAYER} curve.to (DOWNWARD, probe only)`,
      SET_SELECT(CURVE_SEL, CURVE_DOWN));
    await sleep(600);
    const downDoc = await c.json(`(${SCENE_JSON()})`);
    const downText = await c.evalExpr('document.body.innerText');
    const downOption = curveList === null ? null
      : curveList.options.find((o) => o.value === CURVE_DOWN) ?? null;
    check('7a', `a DESCENDING far end (${CURVE_FROM} down to ${CURVE_DOWN}) is offered, `
      + 'enabled, and authored without objection',
      downOk === 'ok'
      && JSON.stringify(downDoc?.layers?.[REMAP_LAYER]?.curve) === JSON.stringify({ to: CURVE_DOWN })
      && (downOption === null || downOption.disabled === false),
      `option = ${JSON.stringify(downOption)} · document now `
      + `curve=${JSON.stringify(downDoc?.layers?.[REMAP_LAYER]?.curve)} over fb=`
      + `${JSON.stringify(downDoc?.layers?.[REMAP_LAYER]?.fb)}`);
    // ⚠ THIS ROW IS INVERTED FROM ITS FIRST RUN, AND THAT IS THE PARCEL.
    // On the first pass it asserted the panel said NOTHING - `!/(descend|
    // garbl)/i` over the rendered text - and it PASSED, which is how the gap
    // was measured rather than argued. `curveDescendingAdvisory` landed after
    // that reading; the row now asserts the sentence is there. The before
    // state is on record in the packet and in that commit.
    check('7b', 'the panel now WARNS that the ramp runs downward, off the rendered text',
      /ramps DOWNWARD/.test(downText) && /garbl/i.test(downText),
      'aeon df3b8810: "a DESCENDING parallax curve garbles the background and an ascending one '
      + 'does not. Every curve shipped in this tree ramps upward, so nothing had ever exercised '
      + 'the other direction." aeon\'s layer() refuses only the DEGENERATE case (both ends '
      + 'equal), so before this parcel nothing between the picker and the ROM mentioned '
      + 'direction. It is a WARNING and not a refusal - see [7e].');
    await shotAt(c, CURVE_SEL, '06-descending-curve-warned');
    await drive(c, `layer ${REMAP_LAYER} curve.to back UPWARD`, SET_SELECT(CURVE_SEL, CURVE_TO));
    await sleep(500);
    const backUp = await c.json(`(${SCENE_JSON()})`);
    check('7c', 'the probe is undone - the saved scene ramps upward',
      JSON.stringify(backUp?.layers?.[REMAP_LAYER]?.curve) === JSON.stringify({ to: CURVE_TO }),
      `curve=${JSON.stringify(backUp?.layers?.[REMAP_LAYER]?.curve)}`);

    // ── [7d] ⚠ THE ALIAS PAIR, WHICH A BUILD REFUSED ─────────────────────
    //
    // `FACTOR_LOCKED` and `FACTOR_0` are ONE VALUE with two spellings (aeon
    // `parallax_dsl.emp`: `pub const FACTOR_0 = FACTOR_LOCKED`, both $0FF).
    // `curveGoesNowhere` compared SPELLINGS, so Aurora greyed nothing and said
    // nothing while aeon's layer() guard 4 - which compares the packed VALUE -
    // refused the pair and wrote no ROM:
    //
    //   error: layer(): curve: To(255) is the same factor as this layer's fb
    //
    // Both halves of that pair have real controls, so this is reachable by
    // gestures rather than only by a hand edit. `fb` is driven for real; then
    // the curve list is read off the DOM, where the fix has to show up as the
    // ENGINE'S OWN REFUSAL attached to BOTH spellings.
    const fbSel = SEL_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} fb\b/`);
    const fbToZero = await drive(c, `layer ${REMAP_LAYER} fb -> FACTOR_0`,
      SET_SELECT(fbSel, 'FACTOR_0'));
    await sleep(600);
    const aliasList = await c.json(OPTIONS_OF(CURVE_SEL));
    const greyed = aliasList === null ? []
      : aliasList.options.filter((o) => o.disabled).map((o) => o.value);
    check('7d', 'with fb on FACTOR_0 the curve picker greys BOTH spellings of that one factor',
      fbToZero === 'ok' && greyed.includes('FACTOR_0') && greyed.includes('FACTOR_LOCKED'),
      `disabled options = ${JSON.stringify(greyed)}. Before this parcel only the matching `
      + 'SPELLING was greyed, so an author could land FACTOR_LOCKED on an fb of FACTOR_0 and '
      + 'the build refused it. The option carries the engine\'s own reason: '
      + `${JSON.stringify(aliasList?.options.find((o) => o.value === 'FACTOR_LOCKED')?.title)}`);
    await shotAt(c, CURVE_SEL, '06b-alias-greyed');
    // Restore fb, and re-assert the greying FOLLOWED it rather than being stuck
    // on - a picker that disabled those two always would pass [7d] for free.
    await drive(c, `layer ${REMAP_LAYER} fb back to ${CURVE_FROM}`,
      SET_SELECT(fbSel, CURVE_FROM));
    await sleep(600);
    const afterRestore = await c.json(OPTIONS_OF(CURVE_SEL));
    const greyedNow = afterRestore === null ? []
      : afterRestore.options.filter((o) => o.disabled).map((o) => o.value);
    check('7e', 'and the greying tracks fb - back on ' + CURVE_FROM + ' only that one value is '
      + 'refused, and the DESCENDING option is NOT greyed',
      greyedNow.length === 1 && greyedNow[0] === CURVE_FROM
      && !greyedNow.includes(CURVE_DOWN),
      `disabled options = ${JSON.stringify(greyedNow)}. aeon REFUSES the equal pair and PERMITS `
      + 'a descending one, so Aurora greys the first and only warns about the second: the '
      + 'mechanism behind the garbling is unestablished, and a control that refused it would '
      + 'be Aurora inventing a rule the engine does not have.');

    // ── [8] THE PRECONDITIONS, READ OFF THE SCREEN ────────────────────────
    const pageText = await c.evalExpr('document.body.innerText');
    check('8a', 'the panel no longer says the remap has nothing to vary (precondition 1)',
      !/nothing for the remap to vary/.test(pageText),
      'cleared by route (c) - a curve on the remapped strip.');
    check('8b', 'the panel no longer says this scene declares no anchor (precondition 2)',
      !/declares no anchor/.test(pageText), 'cleared by the anchor above.');
    check('8c', 'and no second strip carries a remap (precondition 3)',
      !/also carries a row remap/.test(pageText) && !/also carry a row remap/.test(pageText),
      'the engine keeps ONE per-frame mark; a second remapped strip would silently win.');
    // ANTI-VACUOUS: the three absences above are absences of a WARNING, not of
    // the whole card. The row itself, and the note about the one precondition
    // Aurora cannot check, are both on screen.
    check('8d', 'the rowRemap row and its capability note are both on screen, so [8a]-[8c] '
      + 'are about warnings and not a missing card',
      (await c.evalExpr(`!!(${REMAP_TOGGLE})`)) === true
      && /cannot check the fourth condition/.test(pageText),
      'the fourth condition (the game raising CAP_ROW_REMAP) is not a function of a scene file '
      + 'and is stated as a note rather than a verdict.');

    // ── [9] BIND AND SAVE ─────────────────────────────────────────────────
    const secSel = SEL_BY_TITLE(String.raw`/^The section both bindings on this tab act on\b/`);
    const pick = await drive(c, `active section = ${SECTION}`, SET_SELECT(secSel, SECTION));
    await sleep(800);
    const bindSel = SEL_BY_TITLE(String.raw`/^Which effects scene this section uses\b/`);
    const bound = await drive(c, 'sceneRef binding', SET_SELECT(bindSel, SCENE_ID));
    await sleep(800);
    const ref = await c.evalExpr(`window.__dbg.aeon.sceneRef(${SECTION})`);
    check('9a', `section ${SECTION}'s sceneRef is "${SCENE_ID}", set through the assignment control`,
      pick === 'ok' && bound === 'ok' && ref === SCENE_ID, `sceneRef(${SECTION}) = ${JSON.stringify(ref)}`);
    await shot(c, '07-bound');

    await ctrlS(c);
    await sleep(3000);
    await shot(c, '08-after-save');

    check('9b', 'the app WROTE the scene document', existsSync(SCENE_PATH),
      `${SCENE_PATH} existed_before=${sceneBefore} exists_now=${existsSync(SCENE_PATH)}`);
    if (existsSync(SCENE_PATH)) {
      const onDisk = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));
      note('ON DISK', JSON.stringify(onDisk, null, 1));
      check('9c', 'THE ROW REMAP IS ON DISK, in the shape aeon\'s render_row_remap reads',
        onDisk.layers?.[REMAP_LAYER]?.rowRemap
        && onDisk.layers[REMAP_LAYER].rowRemap.plane_y === PLANE_Y
        && onDisk.layers[REMAP_LAYER].rowRemap.height_shift === 4,
        JSON.stringify(onDisk.layers?.[REMAP_LAYER]?.rowRemap));
      check('9d', 'and beside it the two keys aeon\'s scene() preconditions need: the anchor, '
        + 'and an UPWARD curve on that same strip',
        onDisk.anchor?.at?.channel === CHANNEL
        && onDisk.anchor.at.dsa === 15 && onDisk.anchor.at.dsb === 15
        && JSON.stringify(onDisk.layers?.[REMAP_LAYER]?.curve) === JSON.stringify({ to: CURVE_TO })
        && onDisk.layers[REMAP_LAYER].fb === CURVE_FROM,
        `anchor=${JSON.stringify(onDisk.anchor)} `
        + `layer${REMAP_LAYER}=${JSON.stringify(onDisk.layers?.[REMAP_LAYER])}`);
      check('9e', 'the saved document carries NO deform table - route (c) needs none, and the '
        + 'file proves the remap is not leaning on one',
        onDisk.deform_bg === undefined && onDisk.deform_fg === undefined
        && onDisk.layers.every((l) => l.deform === undefined),
        `deform_bg=${JSON.stringify(onDisk.deform_bg)} deform_fg=${JSON.stringify(onDisk.deform_fg)}`);
      check('9f', 'exactly ONE strip carries a remap',
        onDisk.layers.filter((l) => l.rowRemap !== undefined && l.rowRemap !== 'none').length === 1,
        `remapped strips = ${JSON.stringify(onDisk.layers
          .map((l, i) => (l.rowRemap !== undefined && l.rowRemap !== 'none' ? i : -1))
          .filter((i) => i >= 0))}`);
      // ⚠ THE CONTROL THAT MAKES THE ROM STILL THIS RUN'S. The ROM handed over
      // was built from the document the FIRST pass saved; this pass runs
      // against an app whose curve row has since gained two behaviours. If the
      // bytes the app writes had moved, that ROM would no longer be the one
      // this harness authors, and every hash in the packet would be about a
      // document nothing here produced any more. Compared against the COMMITTED
      // capture, byte for byte, rather than re-derived from the same objects.
      const capture = join(SHOTS, `${SCENE_ID}.json`);
      if (existsSync(capture)) {
        const now = readFileSync(SCENE_PATH);
        const then = readFileSync(capture);
        check('9h', 'the app still writes the IDENTICAL document, so the built ROM is still '
          + 'this scene\'s',
          Buffer.compare(now, then) === 0,
          `${now.length} B now vs ${then.length} B in the committed capture. The curve fix is a `
          + 'reader and an advisory; it must not have changed a single authored byte.');
      } else {
        cannotMeasure('9h', 'the saved bytes match the committed capture',
          `no capture at ${capture} to compare against`);
      }
      writeFileSync(capture, readFileSync(SCENE_PATH));
    } else {
      cannotMeasure('9c', 'the remap reached disk', 'the scene file was never written');
    }
    check('9g', `the app WROTE section_${SECTION}.meta.json`, existsSync(META_PATH),
      `existed_before=${metaBefore} exists_now=${existsSync(META_PATH)}`);
    if (existsSync(META_PATH)) writeFileSync(join(SHOTS, `section_${SECTION}.meta.json`), readFileSync(META_PATH));

    // ── [10] THE LEDGER. Last, so it covers every gesture above. ──────────
    const bad = driven.filter((d) => d.r !== 'ok');
    check('10a', 'EVERY gesture found its control and drove it',
      driven.length > 0 && bad.length === 0,
      `${driven.length} gesture(s); ${bad.length} did not return 'ok'`
      + (bad.length ? `: ${JSON.stringify(bad, null, 1)}` : ''));
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    const { killTree } = await import('./lib/harness-guard.mjs');
    await killTree(child);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} rows passed · `
    + `${fails.length} failed · ${unmeasured.length} unmeasured`);
  if (fails.length) console.log(`FAILED: ${fails.join(', ')}`);
  if (unmeasured.length) console.log(`UNMEASURED: ${unmeasured.join(', ')}`);
  process.exitCode = (fails.length || unmeasured.length) ? 1 : 0;
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.message ?? e}`); process.exitCode = 1; });
