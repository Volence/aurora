// ═══════════════════════════════════════════════════════════════════════════
// layer-dsa-dsb - AUTHOR A STRIP'S OWN DEFORM AMPLITUDE THROUGH THE UI, AND
// PROVE THE TOP-OF-RANGE SENTINEL CANNOT BE AUTHORED BY ACCIDENT
// ═══════════════════════════════════════════════════════════════════════════
//
// `docs/reviews/2026-09-05-scene-anchor-writer.md` §10 row 3 recorded the gap:
// that parcel gave the ANCHOR's `dsa`/`dsb` a control and left the LAYER's pair
// hand-edit-only. This closes it.
//
// The node suite (`src/renderer/providers/__tests__/effects-layer-shift.test.ts`)
// proves the writer's rules; it cannot see a `<select>`. What only a run against
// the real app can answer is whether the OPTIONS ON SCREEN carry those rules -
// and that is the half the hazard lives in.
//
// ── THE HAZARD, IN ONE PARAGRAPH ──────────────────────────────────────────
//
// ⚠⚠ A LAYER'S `dsa`/`dsb` ARE 0..15 AND **15 IS THE OFF SENTINEL**. aeon's
// `layer()` banner says it outright: "dsa/dsb: per-plane deform-amplitude shifts
// (15 = no deform on that plane)". The value is a right-shift of the deform
// table's sample, so a BIGGER number is LESS motion and the top of the range is
// none at all. A spinner or slider dragged toward its maximum therefore authors
// "does not move", and the document validates, builds, ships and renders flat.
// Rows [5a]/[5b] are that hazard measured on the live DOM:
//
//   [5a]  drive each ladder to its LAST option - the end of a drag - and read
//         the document back. The value written must NOT be the sentinel.
//   [5b]  drive each ladder to its OFF entry from a LIVE shift and read the
//         document back. The plane must read off, and the STRIP must still be
//         there: one plane's off is not the layer's off.
//
// Neither row trusts a label: the option list is READ OUT OF THE DOM and the
// verdict is taken from the document the app holds.
//
// ── THE SECOND QUESTION, WHICH IS NOT THE ANCHOR'S ────────────────────────
//
// The anchor's `at` requires all three of its keys, so its sentinel has exactly
// one spelling. A LAYER's pair is OPTIONAL with `default: 15`, so absent and 15
// are the same document - and BOTH conventions are live in aeon's tree today:
//
//   ojz_act1_start / _depth / _floor      13 layers, every one spells dsa/dsb 15
//   ojz_act1_sec7_worldwater (Aurora's)    3 layers, every one omits them
//
// So OFF clears the key UNLESS the file spells it. Rows [6a]/[6b] measure both
// directions ON THOSE REAL FILES rather than on a fixture: a scene that omits
// them must not GAIN them, and a scene that spells them must not LOSE them.
//
// ── RUN ───────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   AEON_DIR=<a WRITABLE aeon clone> npm run harness:layer-dsa-dsb
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

const PORT = Number(process.env.PORT ?? 9531);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ READ THROUGH THE RESOLVER, NEVER OFF `process.env`. This harness SAVES, so
// it genuinely REQUIRES an explicit override - the case `checkoutOverride`
// exists for. Reading `process.env.AEON_DIR` by hand sees ONE spelling and
// silently misses the aliases and the disagreement refusal.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';
const SHOTS = join(ROOT, 'docs/captures/2026-09-05-layer-dsa-dsb');

/** The scene this run authors from scratch, to drive the two ladders on. */
const SCENE_ID = 'aurora_layer_amplitude';
/**
 * The two REAL files the round-trip rows measure, one per convention. Not
 * fixtures: these are the documents in aeon's tree, and the whole write rule
 * exists so that both survive a panel that now has a control for the key.
 */
const OMITS_ID = 'ojz_act1_sec7_worldwater';   // Aurora-authored: no dsa/dsb keys
const SPELLS_ID = 'ojz_act1_start';            // aeon-authored: dsa 15, dsb 15

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
/**
 * A CAPTURE OF THE ROWS THIS PARCEL ADDED, not of wherever the panel is parked.
 * Scrolling is for the PICTURE only and is never used to reach a control -
 * every drive below finds its element by title, which does not care where the
 * scroller is.
 */
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
// suffixes; `/^Layer 0 fa$/` once silently matched nothing for weeks while
// every layer kept its default. Every pattern below is a PREFIX with `\b`.
const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

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
  const r = el.getBoundingClientRect();
  const sc = el.closest('[style*="overflow"]') || document.scrollingElement;
  const s = sc ? sc.getBoundingClientRect() : null;
  return {
    value: el.value,
    options: [...el.options].map((o) => ({ value: o.value, label: o.textContent, title: o.title })),
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    dpr: window.devicePixelRatio,
    scroller: s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null,
    // ⚠ checkVisibility() and getClientRects() BOTH go green on an element
    // scrolled far outside its scroller, so the rect is compared to the
    // SCROLLER's box and both are printed beside any positional claim.
    insideScroller: s ? (r.top >= s.top - 1 && r.bottom <= s.bottom + 1) : null,
  };
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
 * ⚠ `element.click()` IS NOT A CLICK where the app listens for pointer events:
 * a synthetic click no-ops, every later reading comes off the previous screen,
 * and the rig gets written up as a product defect. This returns the rect so the
 * caller dispatches a real press/release at INTEGER client pixels -
 * `devicePixelRatio` varies run to run on this box and a fractional target
 * resolves one pixel off.
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
 * [9a] asserts they ALL said 'ok'. Without it a selector that matches nothing
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
 * A SECTION MAY ARRIVE COLLAPSED, and a `no-element` on a collapsed section is
 * NAVIGATION MISSING, not a control missing - the mistake the anchor packet's
 * §3 records costing it a run. Opened by a REAL POINTER GESTURE on the title
 * span, idempotent BY MEASUREMENT: it clicks, probes for a control that only
 * exists inside the section, and clicks again if it is still absent.
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

/** One scene as the APP holds it. */
function SCENE_JSON(id) {
  return String.raw`(() => {
  const raw = window.__dbg.aeon.scenesJson ? window.__dbg.aeon.scenesJson() : null;
  if (!raw) return null;
  const all = JSON.parse(raw);
  const list = Array.isArray(all) ? all : (all.scenes || []);
  return list.find((s) => s && s.id === ${JSON.stringify(id)}) || null;
})()`;
}

/**
 * The panel's scene picker is a LIST OF BUTTONS, one per scene, each titled
 * `<label> (<id>)`.
 *
 * ⚠⚠ THIS WAS A `<select>` DRIVE AND IT SILENTLY HIT THE WRONG CONTROL. The
 * first version found "the first <select> carrying an option whose value is this
 * scene id" - which is the SECTION's `sceneRef` dropdown, not the picker. Every
 * gesture returned `ok`, the ledger was clean, and the panel never changed
 * scene: rows [7a]/[7b] then read the ladder of the scene that was ALREADY
 * selected and passed, because by that point in the run every plane on it was
 * off and "shows off" was true of the wrong card. A green row measuring the
 * wrong subject, which is the failure `DISTRUST A CLEAN RESULT` names. It also
 * means that drive was rebinding a section's sceneRef as a side effect.
 *
 * Caught because [8d]/[8e] compared against the FILE and found it unwritten,
 * and then because the value the shipped scenes were supposed to receive turned
 * up in `aurora_layer_amplitude.json` instead. `SELECTED_SCENE` below is the
 * assertion that stops it recurring: the picked button must actually BE the
 * selected one, checked on screen, before any row reads a ladder.
 */
const SCENE_BUTTON_RECT = (id) => String.raw`
(() => {
  const el = [...document.querySelectorAll('button')]
    .find((e) => (e.title || '').endsWith('(' + ${JSON.stringify(id)} + ')'));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const sc = el.closest('[style*="overflow"]') || document.scrollingElement;
  const s = sc ? sc.getBoundingClientRect() : null;
  return {
    x: r.x, y: r.y, w: r.width, h: r.height, title: el.title,
    dpr: window.devicePixelRatio,
    scroller: s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null,
    insideScroller: s ? (r.top >= s.top - 1 && r.bottom <= s.bottom + 1) : null,
  };
})()`;

/**
 * WHICH scene the panel currently shows, read off the screen.
 *
 * The selected button is the one painted in the accent colour; exactly one is.
 * Derived from the DOM rather than from a store handle so it measures what an
 * author would see.
 */
const SELECTED_SCENE = String.raw`
(() => {
  const btns = [...document.querySelectorAll('button')]
    .filter((e) => /\(([a-z][a-z0-9_]*)\)$/.test(e.title || ''));
  if (btns.length === 0) return null;
  const by = new Map();
  for (const b of btns) {
    const bg = getComputedStyle(b).backgroundColor;
    by.set(bg, [...(by.get(bg) || []), (b.title.match(/\(([a-z][a-z0-9_]*)\)$/) || [])[1]]);
  }
  // The accent is whichever background exactly ONE button carries.
  for (const [, ids] of by) if (ids.length === 1) return ids[0];
  return null;
})()`;

const SHIFT_SEL = (i, field) => SEL_BY_TITLE(String.raw`/^Layer ${i} ${field}\b/`);

/** The sentinel, taken from the CONTRACT the app was built from, never typed. */
const SCHEMA = JSON.parse(readFileSync(
  join(ROOT, 'src/core/formats/effects/aurora-effects-scene.schema.json'), 'utf8'));
const SENTINEL = SCHEMA.$defs.layer.properties.dsa.maximum;
const LOUDEST = SCHEMA.$defs.layer.properties.dsa.minimum;

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  // ⚠ BOTH VARIABLES OR NEITHER. A worktree has no `node_modules/.bin/electron`
  // and no `dist/`, so without AURORA_BUILT_TREE the resolver walks UP and
  // borrows the MAIN checkout's built tree - every row then runs green against
  // an app this parcel did not build.
  if (RUN.borrowed) {
    throw new Error(`REFUSING: the run root was BORROWED from ${RUN.root}, which is not the tree `
      + 'this harness was started from. Set AURORA_BUILT_TREE to the worktree and give it a '
      + '`node_modules/.bin/electron` and a `VITE_AURORA_DEBUG=1 npm run build`.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  note('sentinel, read from the committed contract',
    `$defs.layer.properties.dsa: minimum=${LOUDEST} maximum=${SENTINEL} `
    + `default=${SCHEMA.$defs.layer.properties.dsa.default} - the top of the range IS the off `
    + 'value, which is the whole hazard');
  assertFreshBuild(RUN);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone - this harness SAVES. '
      + 'Never point it at the live checkout.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM, AND THE CHOICE IS LOAD-BEARING. Through the
  // override-aware `siblingPath` this guard breaks BOTH ways: it would refuse a
  // legitimate clone (comparing the value against itself) and it would PASS the
  // real tree, which is failing OPEN on exactly the case it exists for.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), which is `
      + 'a live lane tree another agent may be editing. This harness SAVES - point it at a clone.');
  }

  const scenePath = (id) => join(AEONDIR, 'games/sonic4/data/editor/effects', `${id}.json`);
  const readScene = (id) => (existsSync(scenePath(id))
    ? JSON.parse(readFileSync(scenePath(id), 'utf8')) : null);

  // The two real files, as they stand BEFORE anything is driven. Printed rather
  // than assumed: the whole round-trip claim is a comparison against these.
  const omitsBefore = readScene(OMITS_ID);
  const spellsBefore = readScene(SPELLS_ID);
  note(`${OMITS_ID} BEFORE`, omitsBefore === null ? 'ABSENT'
    : JSON.stringify(omitsBefore.layers.map((l) => ({ dsa: l.dsa, dsb: l.dsb }))));
  note(`${SPELLS_ID} BEFORE`, spellsBefore === null ? 'ABSENT'
    : JSON.stringify(spellsBefore.layers.map((l) => ({ dsa: l.dsa, dsb: l.dsb }))));

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
    // is real UI interaction; this step is NOT UI evidence and the packet says so.
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

    // ── [2] A SCENE OF OUR OWN, through the panel's New affordance ─────────
    const idIn = `document.querySelector('input[placeholder="new_scene_id"]')`;
    const idOk = await drive(c, 'scene id field', SET_INPUT(idIn, SCENE_ID));
    const newRect = await c.json(RECT_BY_TEXT(String.raw`/^New$/`));
    if (newRect === null) {
      cannotMeasure('2a', 'create the scene through the UI',
        'no button whose text is exactly "New" is on screen');
    } else {
      const at = await clickRect(c, newRect);
      note('clicked New at integer client px', `(${at.x}, ${at.y})`);
      await sleep(1200);
      const scenes = await c.json('window.__dbg.aeon.scenes()');
      const made = Array.isArray(scenes) && scenes.some((s) => (s.id ?? s) === SCENE_ID);
      check('2a', `a REAL pointer gesture created scene "${SCENE_ID}"`, idOk === 'ok' && made,
        `scenes now: ${JSON.stringify(scenes)}`);
    }

    // The layer list may be collapsed; a missing control there is navigation.
    const layersOpen = await openSection(c, String.raw`/^Layers\b/`,
      SHIFT_SEL(0, 'dsa'), 'Layers');
    note('Layers section', JSON.stringify(layersOpen));

    // ── [3] THE TWO LADDERS ARE ON SCREEN ──────────────────────────────────
    const ladders = {};
    for (const field of ['dsa', 'dsb']) {
      const o = await c.json(OPTIONS_OF(SHIFT_SEL(0, field)));
      ladders[field] = o;
      if (o === null) {
        cannotMeasure(`3.${field}`, `the layer 0 ${field} ladder is on screen`,
          `no <select> whose title starts "Layer 0 ${field}" is in the DOM`);
        continue;
      }
      check(`3.${field}`, `the layer 0 ${field} ladder is on screen`, true,
        `rect x=${o.rect.x} y=${o.rect.y} w=${o.rect.w} h=${o.rect.h} dpr=${o.dpr} `
        + `insideScroller=${o.insideScroller} · ${o.options.length} options · value=${o.value}`);
    }

    // ── [4] WHAT THE LADDER OFFERS - read off the DOM, not off the source ──
    for (const field of ['dsa', 'dsb']) {
      const o = ladders[field];
      if (o === null || o === undefined) continue;
      const values = o.options.map((x) => Number(x.value));
      const off = o.options.filter((x) => /off/i.test(x.label));
      check(`4a.${field}`, `the ${field} ladder names OFF exactly once, and its label carries no number`,
        off.length === 1 && !new RegExp(`\\b${SENTINEL}\\b`).test(off[0].label),
        `off entry: ${JSON.stringify(off[0])}`);
      // THE ROW THE PARCEL EXISTS FOR: the sentinel is not a RUNG. It appears
      // once, as the off entry, and nowhere else on the list.
      const rungs = o.options.filter((x) => !/off/i.test(x.label)).map((x) => Number(x.value));
      check(`4b.${field}`, `the ${field} ladder does NOT offer the sentinel ${SENTINEL} as a rung`,
        !rungs.includes(SENTINEL) && values.filter((v) => v === SENTINEL).length === 1,
        `rungs = ${JSON.stringify(rungs)}`);
      check(`4c.${field}`, `off sits FIRST, beside the quietest rung and opposite the loudest`,
        /off/i.test(o.options[0].label) && Number(o.options[o.options.length - 1].value) === LOUDEST,
        JSON.stringify(o.options.map((x) => x.label)));
    }

    // ── [5a] DRIVEN TO THE EXTREME - the end of a drag ─────────────────────
    for (const field of ['dsa', 'dsb']) {
      const o = ladders[field];
      if (o === null || o === undefined) continue;
      const last = o.options[o.options.length - 1];
      const r = await drive(c, `layer 0 ${field} -> last option`,
        SET_SELECT(SHIFT_SEL(0, field), last.value));
      await sleep(500);
      const doc = await c.json(`(${SCENE_JSON(SCENE_ID)})`);
      const got = doc && doc.layers && doc.layers[0] ? doc.layers[0][field] : undefined;
      check(`5a.${field}`,
        `driving the ${field} ladder to its EXTREME authors the LOUDEST shift, not the sentinel`,
        r === 'ok' && got === LOUDEST && got !== SENTINEL,
        `last option = ${JSON.stringify(last)}\n        document now layer 0 ${field} = `
        + `${JSON.stringify(got)}. ${SENTINEL} is the no-deform sentinel; a control that clamped `
        + 'toward its maximum would have written it here.');
    }
    await shotAt(c, SHIFT_SEL(0, 'dsa'), '02-both-planes-loudest');

    // ── [5b] CHOOSING OFF, from a LIVE shift ──────────────────────────────
    for (const field of ['dsa', 'dsb']) {
      const o = ladders[field];
      if (o === null || o === undefined) continue;
      const off = o.options.find((x) => /off/i.test(x.label));
      const before = await c.json(`(${SCENE_JSON(SCENE_ID)})`);
      const was = before.layers[0][field];
      const r = await drive(c, `layer 0 ${field} -> off`, SET_SELECT(SHIFT_SEL(0, field), off.value));
      await sleep(500);
      const doc = await c.json(`(${SCENE_JSON(SCENE_ID)})`);
      const after = doc.layers[0][field];
      const effective = after === undefined ? SENTINEL : after;
      check(`5b.${field}`,
        `choosing OFF on ${field} turns the plane off, and the STRIP is still there`,
        r === 'ok' && effective === SENTINEL && doc.layers.length === before.layers.length,
        `before=${JSON.stringify(was)} after=${JSON.stringify(after)} (effective ${effective}). `
        + 'One plane\'s off is not the strip\'s off - the layer is still in the scene and still '
        + `scrolling (${doc.layers.length} layers, world_y ${doc.layers[0].world_y}).`);
      // THE WRITE DECISION, measured on the app's own document: this scene was
      // created by Aurora and never carried the key, so OFF must not add it.
      check(`5c.${field}`,
        `and OFF did not ADD a "${field}" key to a document that never carried one`,
        !Object.prototype.hasOwnProperty.call(doc.layers[0], field),
        `layer 0 keys = ${JSON.stringify(Object.keys(doc.layers[0]))}`);
    }

    // ── [6] THE ADVISORY: a live shift with no table does nothing ──────────
    await drive(c, 'layer 0 dsb -> a live rung', SET_SELECT(SHIFT_SEL(0, 'dsb'), String(LOUDEST + 1)));
    await sleep(600);
    const advisory = await c.json(String.raw`
      [...document.querySelectorAll('[data-testid$="-shift-advisory"]')].map((e) => e.textContent)`);
    check('6a', 'a live shift with no table to sample says so on screen',
      Array.isArray(advisory) && advisory.length >= 1 && /flat-path/i.test(advisory.join(' ')),
      JSON.stringify(advisory));
    // Framed on the ADVISORY, not on the ladder: the sentence is the subject of
    // this capture and it sits below the two rows, so centring the select left
    // it out of frame in the first run.
    await shotAt(c, `document.querySelector('[data-testid$="-shift-advisory"]')`,
      '03-live-shift-advisory');

    // ── [7] ROUND TRIP ON THE TWO REAL FILES ──────────────────────────────
    //
    // Both conventions are in aeon's tree and both must survive a panel that
    // now has a control for the key.
    // ⚠ A DISCRIMINATING CONTROL, left deliberately on screen. My own scene's
    // Plane A is parked on a LIVE rung, so if a later row is still looking at
    // ITS card the ladder reads that rung and not `off`. Without this the
    // "shows off" rows pass on the wrong scene, which is exactly what happened.
    await drive(c, 'layer 0 dsa -> a live rung, as a CONTROL for the picker',
      SET_SELECT(SHIFT_SEL(0, 'dsa'), String(LOUDEST + 4)));
    await sleep(500);
    const mineDsa = (await c.json(`(${SCENE_JSON(SCENE_ID)})`)).layers[0].dsa;
    note('picker control', `${SCENE_ID} layer 0 dsa parked at ${mineDsa} - any row below that `
      + 'reads `off` therefore is NOT looking at this scene\'s card');

    for (const [id, tag, expectSpelled] of [
      [OMITS_ID, '7a', false],
      [SPELLS_ID, '7b', true],
    ]) {
      const btn = await c.json(SCENE_BUTTON_RECT(id));
      if (btn === null) {
        cannotMeasure(tag, `round-trip ${id}`, `no scene button titled "... (${id})" is on screen`);
        continue;
      }
      note(`${id} button rect`, `x=${btn.x} y=${btn.y} w=${btn.w} h=${btn.h} dpr=${btn.dpr} `
        + `insideScroller=${btn.insideScroller} title=${JSON.stringify(btn.title)}`);
      const at = await clickRect(c, btn);
      driven.push({ label: `pick scene ${id}`, r: 'ok' });
      note(`clicked the ${id} scene button at integer client px`, `(${at.x}, ${at.y})`);
      await sleep(1200);
      // THE ASSERTION THAT STOPS A VACUOUS PASS: the panel really moved.
      const now = await c.evalExpr(SELECTED_SCENE);
      if (now !== id) {
        cannotMeasure(tag, `round-trip ${id}`,
          `the panel still shows ${JSON.stringify(now)} after clicking ${id}'s button - every `
          + 'reading below would have come off the wrong card');
        continue;
      }
      const o = await c.json(OPTIONS_OF(SHIFT_SEL(0, 'dsa')));
      if (o === null) {
        cannotMeasure(tag, `round-trip ${id}`, 'the layer 0 dsa ladder is not in the DOM');
        continue;
      }
      // Whatever the spelling, the ladder must SHOW off - the two spellings are
      // the same state and a form that rendered one of them blank would be
      // inventing a third.
      const showsOff = Number(o.value) === SENTINEL;
      // Choose OFF on an already-off field: the no-op that must not rewrite the
      // author's line either way.
      const off = o.options.find((x) => /off/i.test(x.label));
      await drive(c, `${id} layer 0 dsa -> off (already off)`,
        SET_SELECT(SHIFT_SEL(0, 'dsa'), off.value));
      await sleep(500);
      const doc = await c.json(`(${SCENE_JSON(id)})`);
      const has = Object.prototype.hasOwnProperty.call(doc.layers[0], 'dsa');
      check(tag, `${id}: the ladder shows OFF and the ${expectSpelled ? 'SPELLED 15 SURVIVES' : 'OMISSION SURVIVES'}`,
        showsOff && has === expectSpelled,
        `select value=${o.value} · layer 0 dsa key present in the app's document = ${has} `
        + `(expected ${expectSpelled}) · layer 0 keys = ${JSON.stringify(Object.keys(doc.layers[0]))}`);
    }
    await shotAt(c, SHIFT_SEL(0, 'dsa'), '04-shipped-scene-shows-off');

    // ── [8] SAVE, and read the two files off DISK ─────────────────────────
    await ctrlS(c);
    await sleep(2500);
    const omitsAfter = readScene(OMITS_ID);
    const spellsAfter = readScene(SPELLS_ID);
    const mine = readScene(SCENE_ID);

    check('8a', `${OMITS_ID} on DISK still omits dsa/dsb on every layer`,
      omitsAfter !== null
        && omitsAfter.layers.every((l) => l.dsa === undefined && l.dsb === undefined),
      omitsAfter === null ? 'the file is absent'
        : JSON.stringify(omitsAfter.layers.map((l) => ({ dsa: l.dsa, dsb: l.dsb }))));
    check('8b', `${SPELLS_ID} on DISK still SPELLS dsa/dsb 15 on every layer`,
      spellsAfter !== null
        && spellsAfter.layers.every((l) => l.dsa === SENTINEL && l.dsb === SENTINEL),
      spellsAfter === null ? 'the file is absent'
        : JSON.stringify(spellsAfter.layers.map((l) => ({ dsa: l.dsa, dsb: l.dsb }))));
    // ANTI-VACUOUS: the run really did write something, so [8a]/[8b] are
    // "unchanged by a save that happened" and not "unchanged because nothing
    // was saved". ⚠ DISTRUST A CLEAN RESULT - two files that look identical to
    // their BEFORE state are exactly what a save that never ran looks like.
    check('8c', `the run DID author a file: ${SCENE_ID}.json carries the live shift`,
      mine !== null && mine.layers[0].dsb === LOUDEST + 1,
      mine === null ? `${scenePath(SCENE_ID)} was never written`
        : `layer 0 = ${JSON.stringify(mine.layers[0])}`);

    // ── [8d]/[8e] THE ROWS WITH TEETH ─────────────────────────────────────
    //
    // ⚠ [8a] AND [8b] ARE WEAKER THAN THEY READ, AND THE FIRST RUN PROVED IT.
    // Checking mtimes afterwards showed only `aurora_layer_amplitude.json` was
    // written: the two round-trip files were never REWRITTEN, so "the spelling
    // survived" was "the file was never touched". That is a true statement about
    // a no-op gesture and it is NOT the claim the write rule needs.
    //
    // These two rows force a real rewrite - a live shift on ONE layer - and then
    // ask what happened to the OTHER layers' spelling. That is the serializer
    // being exercised on the exact question, rather than sitting the round out.
    //
    // ⚠ THE EDIT IS ON LAYER 0, AND THE FIRST DRAFT AIMED AT LAYER 1 AND GOT
    // `no-element`. The card list renders ONLY THE SELECTED STRIP, so
    // `Layer 1 dsb` is legitimately not in the DOM until layer 1 is selected -
    // navigation missing, not a control missing, the same reading the anchor
    // packet records for a collapsed section. The gesture ledger is what caught
    // it; without it both rows would have reported "unchanged" off a gesture
    // that never landed, which is indistinguishable from the file being
    // faithfully preserved. Editing layer 0 makes the claim STRONGER anyway:
    // layers 1..n are strips the author never selected, let alone touched.
    for (const [id, tag, expectSpelled] of [
      [SPELLS_ID, '8d', true],
      [OMITS_ID, '8e', false],
    ]) {
      const before = readScene(id);
      const btn = await c.json(SCENE_BUTTON_RECT(id));
      if (btn === null || before === null) {
        cannotMeasure(tag, `rewrite ${id}`, 'no scene button, or the file is absent');
        continue;
      }
      await clickRect(c, btn);
      driven.push({ label: `pick scene ${id} for a real edit`, r: 'ok' });
      await sleep(1200);
      const now = await c.evalExpr(SELECTED_SCENE);
      if (now !== id) {
        cannotMeasure(tag, `rewrite ${id}`,
          `the panel still shows ${JSON.stringify(now)} after clicking ${id}'s button`);
        continue;
      }
      const r = await drive(c, `${id} layer 0 dsb -> live`,
        SET_SELECT(SHIFT_SEL(0, 'dsb'), String(LOUDEST + 2)));
      await sleep(600);
      await ctrlS(c);
      await sleep(2500);
      const after = readScene(id);
      if (after === null) { cannotMeasure(tag, `rewrite ${id}`, 'the file vanished'); continue; }
      const rewritten = JSON.stringify(after) !== JSON.stringify(before);
      const edited = after.layers[0] && after.layers[0].dsb === LOUDEST + 2;
      // Every layer EXCEPT the edited one must keep the convention it had.
      const others = after.layers.filter((_, i) => i !== 0);
      const kept = expectSpelled
        ? others.every((l) => l.dsa === SENTINEL && l.dsb === SENTINEL)
        : others.every((l) => l.dsa === undefined && l.dsb === undefined);
      // And the edited layer's OTHER plane keeps its convention too - the write
      // touched dsb, so dsa on that same strip is an untouched neighbour.
      const siblingKept = expectSpelled
        ? after.layers[0].dsa === SENTINEL
        : after.layers[0].dsa === undefined;
      check(tag,
        `${id}: REWRITTEN by a real edit, and every untouched plane keeps its `
        + `${expectSpelled ? 'SPELLED 15' : 'OMISSION'}`,
        r === 'ok' && rewritten && edited && kept && siblingKept,
        `rewritten=${rewritten} · layer 0 dsb now ${JSON.stringify(after.layers[0].dsb)} `
        + `(edited=${edited}) · layer 0 dsa ${JSON.stringify(after.layers[0].dsa)} `
        + `(siblingKept=${siblingKept}) · ${others.length} untouched layers kept=${kept}\n        `
        + `on disk: ${JSON.stringify(after.layers.map((l) => ({ dsa: l.dsa, dsb: l.dsb })))}`);
    }

    // ── [9] THE LEDGER ────────────────────────────────────────────────────
    const bad = driven.filter((d) => d.r !== 'ok');
    check('9a', `all ${driven.length} gestures returned ok`, bad.length === 0,
      bad.length === 0 ? `${driven.length}/${driven.length}` : JSON.stringify(bad));

    await shot(c, '05-final');
  } finally {
    try { c && c.close(); } catch { /* closing */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`layer-dsa-dsb: ${passed}/${results.length} rows passed · `
    + `${fails.length} failed · ${unmeasured.length} unmeasured`);
  if (fails.length) console.log(`FAILED:\n  ${fails.join('\n  ')}`);
  if (unmeasured.length) console.log(`UNMEASURED:\n  ${unmeasured.join('\n  ')}`);
  console.log(`captures: ${SHOTS}`);
  if (fails.length || unmeasured.length) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
