// ═══════════════════════════════════════════════════════════════════════════
// scene-anchor-writer — AUTHOR `scene.anchor` THROUGH THE UI, AND PROVE THE
// TOP-OF-RANGE SENTINEL CANNOT BE AUTHORED BY ACCIDENT
// ═══════════════════════════════════════════════════════════════════════════
//
// `docs/reviews/2026-09-05-sec7-scene.md` §4(b) found the gap by hitting it: a
// scene was authored entirely through the panel, `rowRemap` was set, and the
// build refused with aeon's precondition 2 — "add `anchor: SceneAnchor.At(ch,
// dsa, dsb)`" — for a key Aurora had a live READER for and no writer at all.
//
// This harness is the other half of the claim. The node suite
// (`src/renderer/providers/__tests__/effects-scene-anchor.test.ts`) proves the
// writer's rules; it cannot see a `<select>`. What only a run against the real
// app can answer is whether the OPTIONS ON SCREEN carry those rules — and that
// is the half the hazard lives in.
//
// ── THE HAZARD, IN ONE PARAGRAPH ──────────────────────────────────────────
//
// ⚠⚠ `anchor.at.dsa` / `dsb` ARE 0..15 AND **15 IS THE OFF SENTINEL**. The
// value is a right-shift of the deform table's sample — aeon's `deform_asr`,
// floor division by 2^n (engine/level/parallax_dsl.emp) — so a BIGGER number
// is LESS motion and the top of the range is none at all. A spinner or a slider
// dragged toward its maximum therefore authors "does not move", and the
// document validates, builds, ships and renders a flat plane. Rows [5a]/[5b]
// are that hazard measured on the live DOM rather than argued about:
//
//   [5a]  drive each ladder to its LAST option — the end of a drag — and read
//         the document back. The value written must NOT be the sentinel.
//   [5b]  drive each ladder to its OFF entry and read the document back. The
//         value written MUST be the sentinel, and the anchor must still be
//         declared: one plane's off is not the feature's off.
//
// Neither row trusts a label: the option list is READ OUT OF THE DOM and the
// verdict is taken from the document the app holds.
//
// ── WHAT IS AUTHORED ──────────────────────────────────────────────────────
//
// aeon's precondition 1 names three routes to a legal `rowRemap`. This run
// authors ROUTE (c) — a `curve:` on the remapped strip — and it SAVES that,
// because route (b) (an anchor with a live `dsb` plus a `deform_bg` table) is
// authorable here and does NOT build: an editor-authored deform table becomes
// the head label of the generated act section and sigil's alignment table has
// no row for it. Row [6b] drives route (b) anyway and reads it back, so the
// BLOCKED is a measurement rather than a story; §6 of the packet has the whole
// refusal.
//
//   layer 0   sky            top 0
//   layer 1   the surface    at the anchored channel's band top
//   layer 2   underwater     carries the `rowRemap` and the `curve`
//   anchor    channel 0, BOTH planes off — the pure-boundary anchor aeon names
//             as the one that composes with a curve
//
// ── RUN ───────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a WRITABLE aeon clone> npm run harness:scene-anchor-writer
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

const PORT = Number(process.env.PORT ?? 9527);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ THE OVERRIDE IS READ THROUGH THE RESOLVER, NEVER OFF `process.env`. This
// harness SAVES, so it genuinely REQUIRES an explicit override — the case
// `checkoutOverride` exists for. Reading `process.env.AEON_DIR` by hand sees
// ONE spelling and silently misses the aliases and the disagreement refusal.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';
const SHOTS = join(ROOT, 'docs/captures/2026-09-05-scene-anchor-writer');

const SCENE_ID = 'aurora_anchor_waterline';
const SECTION = 2;
/** The channel the split latches to. aeon's own `ojz_act1_start` anchors on 0. */
const CHANNEL = 0;
/** A live plane-B shift — a rung, deliberately nowhere near the sentinel. */
const LIVE_DSB = 2;
/** Route (c)'s variation: the far end of the remapped strip's Plane-B ramp. */
const CURVE_TO = 'FACTOR_1_8';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** NOT a pass and NOT a zero — its own bucket, and it makes the run non-zero. */
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name} — ${why}`);
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
 * A CAPTURE OF THE ROWS THIS PARCEL ADDED, not of wherever the panel happens to
 * be parked. The scene column is taller than the window, so a bare screenshot
 * shows `V factor` and nothing this parcel wrote. Scrolling for a PICTURE is
 * not a gesture and is never used to reach a control — every drive above finds
 * its element by title, which does not care where the scroller is.
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
    options: [...el.options].map((o) => ({ value: o.value, label: o.textContent, title: o.title })),
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
 * caller dispatches a real press/release at INTEGER client pixels —
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
    // ⚠ checkVisibility() and getClientRects() BOTH go green on an element
    // scrolled far outside its scroller, so the rect is compared to the
    // SCROLLER's box and both are printed beside any positional claim.
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
 * THE SCENE SECTION ARRIVES COLLAPSED, and that is deliberate product
 * behaviour (`defaultCollapsed` on `aeon.effects.scene`, persisted per author).
 * Every scene-level control — v_factor, bob, reels, the two deform tables and
 * the anchor rows — is NOT IN THE DOM until an author opens it.
 *
 * ⚠ THIS IS THE ROW THAT WOULD HAVE FAKED A FINDING. The first run of this
 * harness reported "no select whose title starts `anchor —` is on screen" on a
 * build that has one, and read as "the control was never added". A `no-element`
 * on a collapsed section is NAVIGATION MISSING, not a control missing — the
 * same mistake the sec7 packet's §7 records for the sub-tab bar.
 *
 * The header is opened by a REAL POINTER GESTURE on its title span, which is
 * what an author clicks; `CollapsibleSection`'s own `isHeaderAction` walk
 * refuses to toggle for anything interactive on the path, and a plain span is
 * not. Idempotent by MEASUREMENT rather than by assumption: it clicks, looks
 * for a control that only exists inside the section, and clicks once more if it
 * is still absent (the section may have arrived open from persisted state and
 * been closed by the first click).
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

/** The anchor's three numbers, off the document the app holds. */
async function anchorOf(c) {
  const doc = await c.json(`(${SCENE_JSON()})`);
  const a = doc && doc.anchor;
  return (a && a !== 'none' && a.at) ? a.at : null;
}

const ANCHOR_SEL = (field) => SEL_BY_TITLE(String.raw`/^anchor\.at\.${field}\b/`);

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  // ⚠ BOTH VARIABLES OR NEITHER. A worktree has no `node_modules/.bin/electron`
  // and no `dist/`, so without AURORA_BUILT_TREE the resolver walks UP and
  // borrows the MAIN checkout's built tree — every row then runs green against
  // an app this parcel did not build.
  if (RUN.borrowed) {
    throw new Error(`REFUSING: the run root was BORROWED from ${RUN.root}, which is not the tree `
      + 'this harness was started from. Set AURORA_BUILT_TREE to the worktree and give it a '
      + '`node_modules/.bin/electron` (symlink the main checkout\'s) and a '
      + '`VITE_AURORA_DEBUG=1 npm run build`.');
  }
  // The resolver answers with a PATH whether or not anything is there, so an
  // absent bundle otherwise reaches xvfb-run and surfaces ~45s later as the
  // thoroughly misleading "CDP target never appeared".
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone — this harness SAVES. '
      + 'Never point it at the live checkout.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM, AND THE CHOICE IS LOAD-BEARING. Through the
  // override-aware `siblingPath` this guard breaks BOTH ways: it would refuse a
  // legitimate clone (comparing the value against itself) and it would PASS the
  // real tree, which is failing OPEN on exactly the case it exists for.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), which is `
      + 'a live lane tree another agent may be editing. This harness SAVES — point it at a clone.');
  }

  const SCENE_PATH = join(AEONDIR, 'games/sonic4/data/editor/effects', `${SCENE_ID}.json`);
  const META_PATH = join(AEONDIR, 'games/sonic4/data/editor/ojz/act1', `section_${SECTION}.meta.json`);
  const metaBefore = existsSync(META_PATH);
  const sceneBefore = existsSync(SCENE_PATH);
  note('before', `section_${SECTION}.meta.json exists=${metaBefore} · ${SCENE_ID}.json exists=${sceneBefore}`);

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
    if (!haveDbg) throw new Error('window.__dbg absent — needs a VITE_AURORA_DEBUG=1 build');

    // ⚠ THE ONE NON-UI DOOR, AND IT IS DECLARED. aeon's only real open route is
    // a NATIVE FOLDER PICKER that CDP cannot drive. Everything after this line
    // is real UI interaction; this step is NOT UI evidence and the packet says so.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    await sleep(3500);
    const st = await c.json('window.__dbg.aeon.state()');
    check('1a', 'the aeon clone opened', st && st.open === true, JSON.stringify(st));
    await shot(c, '01-opened');

    // ⚠ THE EFFECTS TAB FIRST. Its sub-tab bar is not rendered until the tab is
    // open, so `[data-effects-sub-tab]` legitimately matches nothing beforehand
    // — a "no-sub-tab" there is navigation missing, not a control missing.
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

    // Three strips: sky, surface, underwater.
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

    // ── [3] THE GAP IS CLOSED: the anchor toggle EXISTS ────────────────────
    //
    // The sec7 packet's row [7b] is the shape of this one, inverted. There a
    // control's ABSENCE was the measurement; here its PRESENCE is, and the
    // before-state is on record in that packet.
    //
    // OPEN THE SECTION FIRST — see `openSection`. A `no-element` read off a
    // collapsed section is navigation missing, not a control missing, and
    // reading it the other way would write up this parcel's own control as
    // never having landed.
    const toggleSel = SEL_BY_TITLE(String.raw`/^anchor —/`);
    const opened = await openSection(c, String.raw`/^Scene: /`, toggleSel, 'Scene');
    note('scene section', JSON.stringify(opened));
    await shot(c, '03-scene-section-open');
    const toggle = await c.json(OPTIONS_OF(toggleSel));
    check('3a', 'an anchor control exists on the scene panel',
      toggle !== null && toggle.options.length === 2,
      toggle === null ? 'no select whose title starts "anchor —" is on screen'
        : JSON.stringify(toggle));
    // Off first: the shift ladders must NOT be on screen while the anchor is
    // off, or an author could set a shift on a scene that declares no anchor.
    const hiddenWhenOff = await c.evalExpr(`!(${ANCHOR_SEL('dsb')})`);
    check('3b', 'the shift ladders are absent while the anchor is off', hiddenWhenOff === true,
      `dsb ladder present with anchor off = ${!hiddenWhenOff}`);

    await drive(c, 'anchor on', SET_SELECT(toggleSel, 'on'));
    await sleep(600);
    const seeded = await anchorOf(c);
    check('3c', 'turning the anchor ON seeds BOTH planes at the no-deform sentinel',
      seeded !== null && seeded.dsa === 15 && seeded.dsb === 15,
      `anchor.at = ${JSON.stringify(seeded)} — a split, and no deform nobody asked for. `
      + 'aeon\'s own refusal names this shape: "a PURE-BOUNDARY anchor (dsa 15, dsb 15) '
      + 'composes with curves".');
    await shotAt(c, ANCHOR_SEL('dsb'), '03-anchor-on');

    // ── [4] THE LADDERS ON SCREEN ─────────────────────────────────────────
    const ladders = {};
    for (const field of ['dsa', 'dsb']) {
      const l = await c.json(OPTIONS_OF(ANCHOR_SEL(field)));
      ladders[field] = l;
      note(`${field} ladder`, l === null ? 'ABSENT' : JSON.stringify(l.options.map((o) => o.label)));
    }
    check('4a', 'both planes have their own ladder on screen',
      ladders.dsa !== null && ladders.dsb !== null,
      `dsa=${ladders.dsa === null ? 'absent' : ladders.dsa.options.length + ' options'} · `
      + `dsb=${ladders.dsb === null ? 'absent' : ladders.dsb.options.length + ' options'}`);

    // THE SENTINEL APPEARS EXACTLY ONCE AND WEARS A NAME. Measured off the DOM:
    // exactly one option carries the value 15, its label says "off", and it says
    // it WITHOUT the number — a list whose off entry read "15" would be the trap
    // wearing a label.
    for (const field of ['dsa', 'dsb']) {
      const l = ladders[field];
      if (l === null) { cannotMeasure(`4b.${field}`, 'the sentinel is named', 'ladder absent'); continue; }
      const sentinels = l.options.filter((o) => o.value === '15');
      const named = sentinels.length === 1 && /^off\b/.test(sentinels[0].label)
        && !/\b15\b/.test(sentinels[0].label);
      check(`4b.${field}`, `the ${field} ladder names 15 as "off", once, without the number`,
        named, JSON.stringify(sentinels));
      // …and it is FIRST, next to the quietest rung rather than the loudest.
      check(`4c.${field}`, `the ${field} ladder puts off at the TOP, away from the loud end`,
        l.options[0]?.value === '15' && l.options[l.options.length - 1]?.value === '0',
        `first=${JSON.stringify(l.options[0])} last=${JSON.stringify(l.options[l.options.length - 1])}`);
    }

    // ── [5a] ⚠ THE EXTREME. Drive each ladder to its LAST option — the far
    // end of a drag — and read the document back. It must NOT be the sentinel.
    for (const field of ['dsa', 'dsb']) {
      const l = ladders[field];
      if (l === null) { cannotMeasure(`5a.${field}`, 'the extreme is not the sentinel', 'ladder absent'); continue; }
      const last = l.options[l.options.length - 1];
      const r = await drive(c, `${field} -> last option`, SET_SELECT(ANCHOR_SEL(field), last.value));
      await sleep(400);
      const at = await anchorOf(c);
      check(`5a.${field}`,
        `driving the ${field} ladder to its EXTREME authors the LOUDEST shift, not the sentinel`,
        r === 'ok' && at !== null && at[field] === Number(last.value) && at[field] !== 15,
        `last option = ${JSON.stringify(last)} · document now anchor.at.${field} = `
        + `${at === null ? 'no anchor' : at[field]}. 15 is the no-deform sentinel; a control `
        + 'that clamped toward its maximum would have written it here.');
    }
    await shotAt(c, ANCHOR_SEL('dsb'), '04-ladders-at-extreme');

    // ── [5b] ⚠ AND OFF REALLY WRITES THE SENTINEL, from that live state.
    for (const field of ['dsa', 'dsb']) {
      const l = ladders[field];
      if (l === null) { cannotMeasure(`5b.${field}`, 'off writes the sentinel', 'ladder absent'); continue; }
      const off = l.options.find((o) => /^off\b/.test(o.label));
      const before = await anchorOf(c);
      const r = await drive(c, `${field} -> off`, SET_SELECT(ANCHOR_SEL(field), off.value));
      await sleep(400);
      const at = await anchorOf(c);
      check(`5b.${field}`, `choosing OFF on ${field} writes the sentinel, and the anchor STAYS declared`,
        r === 'ok' && before !== null && before[field] !== 15
        && at !== null && at[field] === 15,
        `before=${before === null ? 'none' : before[field]} after=${at === null ? 'NO ANCHOR' : at[field]}. `
        + 'One plane\'s off is not the feature\'s off — the anchor is still there, still splitting.');
    }

    // ── [5c] The channel row is NOT a third ladder ────────────────────────
    const chan = await c.json(OPTIONS_OF(SEL_BY_TITLE(String.raw`/^anchor\.at\.channel\b/`)));
    if (chan === null) {
      cannotMeasure('5c', 'the channel row has no off', 'no channel select on screen');
    } else {
      check('5c', 'the channel row offers NO off — its top is an ordinary channel',
        chan.options.every((o) => !/\boff\b|\bnone\b/i.test(o.label)),
        JSON.stringify(chan.options.map((o) => o.label)));
    }

    // ── [6] THE WATERLINE ─────────────────────────────────────────────────
    //
    // ⚠ ROUTE (c), NOT ROUTE (b), AND THE REASON IS A BUILD REFUSAL THIS RUN
    // FOUND. aeon's precondition 1 names three ways to give a `rowRemap`
    // something to vary; the first cut of this harness took route (b) — an
    // anchor with a live `dsb` and a `deform_bg` table — because that is the
    // one aeon calls "how the shipped waterline gets its variation". It is
    // AUTHORABLE (row [6b] drives it and reads it back) and it does not BUILD:
    //
    //   error: native build (sonic4 plain): [layout.undeclared-alignment]
    //     section `ojz_effects_editor_act1` (head label `EditorDeform_sine_1_256`)
    //     has NO declared alignment in `sigil_harness::section_align::DECLARED`
    //
    // An editor-authored deform table is emitted as the FIRST label of the
    // generated act module (`pub data EditorDeform_sine_1_256`, the dedup block
    // at its top), which CHANGES that section's head label — and sigil's
    // alignment table is keyed by head label and has a row only for
    // `EditorSceneBinding_OJZ_Act1_Sec0`. It is a sigil/aeon declaration, not
    // an Aurora field, and the label encodes the generator's parameters so no
    // single extra row would cover it. See the packet's BLOCKED section.
    //
    // aeon's own `scene()` guards ACCEPTED that document — the refusal is at
    // layout, after every comptime `ensure` ran — so route (b) is blocked on
    // one missing declaration and not on anything about the anchor.
    //
    // Route (c) is a `curve:` on the remapped strip, and it composes with the
    // anchor precisely because the seed leaves both planes on the sentinel:
    // aeon refuses a curve beside an anchor with LIVE shifts, and names the
    // pure-boundary anchor as the case that composes.
    for (const [i, top, fa, fb] of [[0, 0, 'FACTOR_1_8', 'FACTOR_1_8'],
      [1, 3, 'FACTOR_1', 'FACTOR_1_2'], [2, 162, 'FACTOR_3_4', 'FACTOR_1_4']]) {
      await drive(c, `layer ${i} top`,
        SET_INPUT(NUM_BY_TITLE(String.raw`/^Layer ${i} Screen line\b/`), top));
      await drive(c, `layer ${i} fa`, SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${i} fa\b/`), fa));
      await drive(c, `layer ${i} fb`, SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${i} fb\b/`), fb));
    }
    await drive(c, 'anchor channel', SET_SELECT(
      SEL_BY_TITLE(String.raw`/^anchor\.at\.channel\b/`), CHANNEL));
    // The remap, on the strip below the split, and the curve that feeds it.
    await drive(c, 'layer 2 rowRemap',
      SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer 2 rowRemap\b/`), 'ladder'));
    await sleep(400);
    await drive(c, 'layer 2 curve.to',
      SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer 2 curve\.to\b/`), CURVE_TO));
    await sleep(500);
    await shotAt(c, ANCHOR_SEL('dsb'), '05-waterline-authored');

    const doc = await c.json(`(${SCENE_JSON()})`);
    check('6a', 'the scene carries the anchor, the curve and the remap — route (c), all from the UI',
      doc && doc.anchor && doc.anchor.at
      && doc.anchor.at.channel === CHANNEL
      && doc.anchor.at.dsa === 15 && doc.anchor.at.dsb === 15
      && doc.layers?.[2]?.rowRemap && doc.layers[2].rowRemap !== 'none'
      && doc.layers?.[2]?.curve && doc.layers[2].curve !== 'none',
      `anchor=${JSON.stringify(doc?.anchor)} layer2.curve=${JSON.stringify(doc?.layers?.[2]?.curve)} `
      + `layer2.rowRemap=${JSON.stringify(doc?.layers?.[2]?.rowRemap)}`);

    // ── [6b] ROUTE (b) IS AUTHORABLE — driven, read back, and UNDONE ──────
    //
    // The BLOCKED above is a claim about the BUILD, not about the editor, and
    // the difference is worth measuring rather than asserting: the table and
    // the live shift both go in through their own controls and both come back
    // out of the document. Then both are taken off again, so what this run
    // SAVES is the shape that builds.
    //
    // ⚠ AND ON THE WAY THROUGH, THE REFUSAL THIS CONTROL MAKES REACHABLE FOR
    // THE FIRST TIME. A curve layer beside an anchor with LIVE shifts is
    // refused by aeon's `scene()`; until this parcel no Aurora gesture could
    // produce that pair, so `curveAnchorDeformAdvisory` had only hand-edited
    // files to fire on. Drive it deliberately, read the sentence off the
    // screen, and only then take the curve off — which is the ordering an
    // author following the advisory would use.
    await drive(c, 'anchor dsb live (while the curve is still on)',
      SET_SELECT(ANCHOR_SEL('dsb'), LIVE_DSB));
    await sleep(500);
    const clashText = await c.evalExpr('document.body.innerText');
    check('6b0', 'the panel WARNS when a curve meets an anchor with live shifts — a pair the '
      + 'editor could not author before this parcel',
      /the build refuses the pair/.test(clashText),
      'aeon: "the anchor writes those shifts into every strip below the split ... it would be '
      + 'curve and deform at once and the build refuses the pair". The advisory already '
      + 'existed for hand-edited files; this is the first gesture that can reach the state.');
    await shotAt(c, ANCHOR_SEL('dsb'), '05a-curve-anchor-refusal');
    // ⚠ THE `none` OPTION'S VALUE IS `__none__`, NOT `none`. Driving the label
    // is a `no-such-option`, which the ledger catches — it did, on the run
    // before this one, and the curve stayed on through the whole route-(b)
    // probe. The document that probe then reported was one aeon REFUSES for a
    // different reason, which is exactly the misattribution the ledger exists
    // to stop.
    await drive(c, 'layer 2 curve off',
      SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer 2 curve\.to\b/`), '__none__'));
    await drive(c, 'deform_bg on', SET_SELECT(SEL_BY_TITLE(String.raw`/^deform_bg\b/`), 'on'));
    await sleep(500);
    const routeB = await c.json(`(${SCENE_JSON()})`);
    check('6b', 'ROUTE (b) IS AUTHORABLE IN AURORA — a table and a live anchor dsb, both from controls',
      routeB && routeB.deform_bg && routeB.deform_bg !== 'none'
      && routeB.anchor?.at?.dsb === LIVE_DSB,
      `deform_bg=${JSON.stringify(routeB?.deform_bg)} anchor=${JSON.stringify(routeB?.anchor)}. `
      + 'aeon\'s scene() ACCEPTS this; sigil refuses the SECTION it creates '
      + '([layout.undeclared-alignment], head label EditorDeform_sine_1_256). That is the '
      + 'BLOCKED, and it is a sigil declaration rather than an Aurora field.');
    const clearText = await c.evalExpr('document.body.innerText');
    check('6b1', 'and dropping the curve clears that warning — the advisory tracks the state, '
      + 'it is not stuck on',
      !/the build refuses the pair/.test(clearText),
      'the same page, the same anchor shifts, the curve gone.');
    await shotAt(c, ANCHOR_SEL('dsb'), '05b-route-b-authored');
    // …and back to the shape that builds.
    await drive(c, 'anchor dsb off', SET_SELECT(ANCHOR_SEL('dsb'), 15));
    await drive(c, 'deform_bg off', SET_SELECT(SEL_BY_TITLE(String.raw`/^deform_bg\b/`), 'none'));
    await drive(c, 'layer 2 curve.to back on',
      SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer 2 curve\.to\b/`), CURVE_TO));
    await sleep(500);
    const restored = await c.json(`(${SCENE_JSON()})`);
    check('6c', 'and it comes back off cleanly — no table, no live shift, the curve restored',
      restored && restored.deform_bg === undefined
      && restored.anchor?.at?.dsb === 15 && restored.anchor?.at?.dsa === 15
      && restored.layers?.[2]?.curve && restored.layers[2].curve !== 'none',
      `deform_bg=${JSON.stringify(restored?.deform_bg)} anchor=${JSON.stringify(restored?.anchor)} `
      + `layer2.curve=${JSON.stringify(restored?.layers?.[2]?.curve)}`);

    // ── [7] THE PRECONDITIONS, READ OFF THE SCREEN ────────────────────────
    //
    // Not off a helper — off the rendered text, because the claim is that an
    // AUTHOR is no longer being told to add something they cannot add. The
    // BEFORE reading is the sec7 packet's, and the sentence is quoted from the
    // reader that produces it.
    const pageText = await c.evalExpr('document.body.innerText');
    check('7a', 'the panel no longer says "this scene declares no anchor"',
      !/declares no anchor/.test(pageText),
      'that sentence is `rowRemapPreconditions` precondition 2, which had no control to '
      + 'send an author to until this parcel.');
    check('7b', 'and it no longer says the remap has nothing to vary',
      !/nothing for the remap to vary/.test(pageText),
      'precondition 1, cleared here by route (c) — a `curve:` on the remapped strip. Route '
      + '(b) (a live anchor dsb WITH a deform_bg table, aeon\'s own "how the shipped waterline '
      + 'gets its variation") clears it too and is driven at [6b]; it is not what this run '
      + 'SAVES, because the table it creates does not build — see the packet\'s BLOCKED.');
    // ANTI-VACUOUS: the rowRemap row really is on screen, so the two absences
    // above are absences of a warning rather than absences of the whole card.
    check('7c', 'the rowRemap row is on screen, so [7a]/[7b] are about a warning and not a missing card',
      /rowRemap|Row remap/i.test(pageText)
      || (await c.evalExpr(`!!(${SEL_BY_TITLE(String.raw`/^Layer 2 rowRemap\b/`)})`)) === true,
      'the remap control was found on the page');

    // ── [7d] THE REMAP COMES OFF BEFORE THE SAVE, AND THE REASON IS A
    // SECOND BUILD REFUSAL THIS RUN FOUND ─────────────────────────────────
    //
    // Route (c) satisfies aeon's COMPTIME guard — the build compiles, links and
    // writes `s4.bin` — and then aeon's POST-SIGIL gate refuses the image:
    //
    //   row_remap_gate: FAIL
    //     - EditorSceneBinding_OJZ_Act1_Sec2 band 2: pcfg_deform_table_bg is
    //       NULL, so the per-line sample loop is flat-pathed ... `scene()`'s
    //       comptime guard requires a table alongside a live shift
    //
    // The gate demands a TABLE, which is routes (a)/(b); the comptime guard it
    // cites accepts a `curve:` with no table at all, which is route (c). So the
    // two disagree, and the table route is the one sigil will not link (see
    // [6b]). Both blockers are aeon/sigil declarations; neither is a field
    // Aurora is missing.
    //
    // So what this run SAVES is the anchor without the remap — which is the
    // claim that CAN be carried to a green ROM today. The remap's own
    // preconditions were measured on screen at [7a]/[7b] before it came off.
    await drive(c, 'layer 2 rowRemap off',
      SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer 2 rowRemap\b/`), 'none'));
    await sleep(500);
    const noRemap = await c.json(`(${SCENE_JSON()})`);
    check('7d', 'the remap comes off cleanly, leaving the anchor and the curve',
      noRemap && noRemap.layers?.[2]?.rowRemap === undefined
      && noRemap.anchor?.at?.channel === CHANNEL
      && noRemap.layers?.[2]?.curve && noRemap.layers[2].curve !== 'none',
      `layer2=${JSON.stringify(noRemap?.layers?.[2])} anchor=${JSON.stringify(noRemap?.anchor)}. `
      + 'Taken off because aeon\'s post-sigil `row_remap_gate` refuses a remapped band whose '
      + '`pcfg_deform_table_bg` is NULL — a table this scene cannot carry, because the section '
      + 'sigil then builds for it has no declared alignment. See the packet\'s BLOCKED.');

    // ── [8] BIND AND SAVE ─────────────────────────────────────────────────
    const secSel = SEL_BY_TITLE(String.raw`/^The section both bindings on this tab act on\b/`);
    const pick = await drive(c, `active section = ${SECTION}`, SET_SELECT(secSel, SECTION));
    await sleep(800);
    const bindSel = SEL_BY_TITLE(String.raw`/^Which effects scene this section uses\b/`);
    const bound = await drive(c, 'sceneRef binding', SET_SELECT(bindSel, SCENE_ID));
    await sleep(800);
    const ref = await c.evalExpr(`window.__dbg.aeon.sceneRef(${SECTION})`);
    check('8a', `section ${SECTION}'s sceneRef is "${SCENE_ID}", set through the assignment control`,
      pick === 'ok' && bound === 'ok' && ref === SCENE_ID, `sceneRef(${SECTION}) = ${JSON.stringify(ref)}`);

    await ctrlS(c);
    await sleep(2500);
    await shot(c, '06-after-save');

    check('8b', 'the app WROTE the scene document', existsSync(SCENE_PATH),
      `${SCENE_PATH} existed_before=${sceneBefore} exists_now=${existsSync(SCENE_PATH)}`);
    if (existsSync(SCENE_PATH)) {
      const onDisk = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));
      check('8c', 'THE ANCHOR IS ON DISK, in the shape aeon\'s render_anchor reads',
        onDisk.anchor && onDisk.anchor.at
        && onDisk.anchor.at.channel === CHANNEL
        && onDisk.anchor.at.dsa === 15 && onDisk.anchor.at.dsb === 15,
        JSON.stringify(onDisk.anchor));
      check('8d', 'and the round trip is complete — the saved file carries the curve, no table '
        + 'and no remap, which is the shape that builds',
        onDisk.deform_bg === undefined
        && onDisk.layers?.[2]?.rowRemap === undefined
        && onDisk.layers?.[2]?.curve && onDisk.layers[2].curve !== 'none',
        JSON.stringify(onDisk).slice(0, 700));
    } else {
      cannotMeasure('8c', 'the anchor reached disk', 'the scene file was never written');
    }
    check('8e', `the app WROTE section_${SECTION}.meta.json`, existsSync(META_PATH),
      `existed_before=${metaBefore} exists_now=${existsSync(META_PATH)}`);

    // ── [9] THE LEDGER. Last, so it covers every gesture above. ───────────
    const bad = driven.filter((d) => d.r !== 'ok');
    check('9a', 'EVERY gesture found its control and drove it',
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
