#!/usr/bin/env node
// THE REFUSED CURVE VALUE IS NOT OFFERED AS A CHOICE — ROADMAP row 13.
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// The defect is a DROPDOWN OPTION. The node suite cannot see React, cannot
// render a `<select>` and cannot tell a provider that marks `disabled` apart
// from a component that marks it and throws it away — 5,661 vitest rows pass
// either way. `effects-wording.test.ts` holds the wiring by grepping the panel
// source, which is the best a node suite can do and is NOT the same claim as
// "the option is greyed in the running app".
//
// The gap is narrow and this file closes exactly it:
//
//        IN THE RUNNING APP, THE CURVE PICKER'S OPTION EQUAL TO THIS LAYER'S
//        `fb` IS PRESENT, DISABLED, AND CARRIES THE ENGINE'S REASON.
//
// Three separate claims, and the first is as load-bearing as the others: the
// remedy is DISABLED, never hidden. An option that vanished would satisfy "the
// author cannot pick it" while teaching them nothing and reading as a bug — and
// worse, a select whose current value has no option silently displays a
// different one, so a file carrying `curve.to == fb` would draw as `none`.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
// Every row below reads the LIVE DOM of the curve `<select>`, so the ways to
// fake it are:
//
//   • THE SELECTOR MATCHES NOTHING and every `.find()` is `undefined`. Rows
//     that then say "no disabled option found → fail" are honest, but a row
//     shaped "no ENABLED option equal to fb" would pass vacuously. Row 3a
//     therefore asserts the control was FOUND and has the expected option
//     COUNT before anything reads a flag off it, and PLANT=rot-selector
//     reproduces the rot end-anchored, the way five real ones were rotted.
//   • THE PICKER IS THE WRONG ONE — `fa`/`fb` are the same component and must
//     NOT be narrowed. Rows 4a/4b read those two controls in the same run and
//     require every option enabled, which is the control condition: if the
//     narrowing leaked, this harness fails rather than congratulating itself.
//   • fb IS NEVER ACTUALLY SET, so nothing could have been disabled. Row 2b
//     reads `fb` back off the document after driving it.
//
// ⚠ NOTHING HERE IS STITCHED FROM TWO RUNS. `dpr`, the rects, the clip and
// every option flag are read in ONE session and printed together, because
// `devicePixelRatio` on this machine has been observed at both 1 and 1.35 hours
// apart. No coordinate is fractional: the aim and the capture clip are integers
// DERIVED from the rect printed beside them, so the expectation and the aim are
// the same number.
//
// ⚠ WHAT THE SCREENSHOT SHOWS, AND WHY IT IS NOT AN OPEN DROPDOWN. Chromium
// draws a `<select>` popup as a NATIVE widget outside the page, so
// `Page.captureScreenshot` cannot see it — and an `import -window root` on this
// run's own pinned Xvfb display was tried and came back 1680x1050, 8-bit
// grayscale, TWO COLOURS, 353 bytes: under `xvfb-run` with no window manager
// the Electron window is not on the root surface at all. A blank PNG is worse
// evidence than none, so §5 photographs the state the rule exists for instead —
// see its own banner. The option flags for the CLOSED list are still measured,
// from the DOM, in rows 3b..3g.
//
// CLEANUP IS BY PID, ALWAYS. `killTree` from lib/harness-guard walks /proc for
// descendants of the pid THIS process spawned. No `pkill` on a pattern: from a
// worktree that kills the owner's editor and spares this run's orphan.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> node scratchpad/curve-option-disabled-harness.mjs
//   PLANT=rot-selector  … the selector rot, to prove row 3a is not vacuous

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9423);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 97);
const ROOT = AURORA_DIR;
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron'));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — this harness saves, and must never write there');
}
const SHOTS = `${ROOT}/scratchpad/shots-curve-option-disabled`;
mkdirSync(SHOTS, { recursive: true });

const PLANT = process.env.PLANT ?? '';
const SCENE_ID = process.env.SCENE_ID ?? 'curve_option_disabled';
// The factor driven into `fb`, and therefore the option that must go grey.
// A MIDDLE-OF-THE-LIST NAME ON PURPOSE: `FACTOR_1` is `factorFromSelect`'s seed
// and `FACTOR_LOCKED` is a sentinel, so either could be disabled by an accident
// that had nothing to do with the rule under test.
const FB = process.env.FB ?? 'FACTOR_1_4';
// The far end used for §5's back door: a DIFFERENT named factor, legal as a
// curve while `fb` is FB, which §5 then moves `fb` onto.
const LEGAL_TO = process.env.LEGAL_TO ?? 'FACTOR_3_8';

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

// `\b`, NEVER `$` — the rendered title carries an explanatory suffix, and five
// selectors in a sibling harness were caught matching nothing by end-anchoring.
const CURVE_SEL = (i) => (PLANT === 'rot-selector'
  // THE PLANT: end-anchored, as the five real rots were. The live title is
  // `Layer 0 curve.to — the Plane B factor at …`, so this matches NOTHING.
  ? `/^Layer ${i} curve\\.to$/`
  : `/^Layer ${i} curve\\.to\\b/`);
const FA_SEL = (i) => `/^Layer ${i} fa\\b/`;
const FB_SEL = (i) => `/^Layer ${i} fb\\b/`;
const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

/** Every option of one `<select>`, as the DOM actually holds it. */
const READ_OPTIONS = (re) => String.raw`
(() => {
  const el = ${SEL_BY_TITLE(re)};
  if (!el) return null;
  return {
    value: el.value,
    options: [...el.options].map((o) => ({
      value: o.value, label: o.textContent, disabled: o.disabled, title: o.title,
    })),
  };
})()`;

const SET_SELECT = (re, value) => String.raw`
(() => {
  const el = ${SEL_BY_TITLE(re)};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
    .set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

// A React-controlled input ignores `el.value = x`. The native setter plus a
// bubbling input/change event is what a real keystroke looks like to React.
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
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const EXPAND_LAYERS = String.raw`
(() => {
  const open = () => [...document.querySelectorAll('select')].some((e) => /^Layer 0 fa\b/.test(e.title || ''));
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer'
      && /^Layers \(/.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) return 'no-header';
  hdr.click();
  return open() ? 'clicked-open' : 'clicked-shut';
})()`;

async function main() {
  const t0 = Date.now();
  console.log('=== curve-option-disabled harness (ROADMAP row 13) ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}   fb under test: ${FB}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  // `-n` PINS the display, so `import` below can name the same server. `-a`
  // would pick a free one and leave the capture guessing.
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npx electron-vite build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open the COPY, mount Effects, create a fresh scene. -----------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');

    await sleep(2500);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('1b', 'the Effects facet mounts', clicked === true, `click → ${clicked}`);
    await sleep(1200);

    // The scene is made THROUGH THE UI — the id box and the New button — for
    // the same reason the rest of this file drives the DOM: a scene conjured
    // straight into the store would not prove the card can render one.
    const typed = await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    const pressedNew = await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    const scenes = await c.json('window.__dbg.aeon.scenes()');
    check('1c', 'clicking New created the scene in the MODEL, not just on screen',
      typed === 'ok' && pressedNew === true && scenes.some((x) => x.id === SCENE_ID),
      // Anti-vacuous: the project's pre-existing scenes are listed too, so a
      // green here is the NEW scene appearing rather than the model being empty.
      `typed=${typed} new=${pressedNew}; ${scenes.length} scenes: ${JSON.stringify(scenes.map((x) => x.id))}`);
    const expanded = await c.evalExpr(EXPAND_LAYERS);
    await sleep(500);
    check('1d', 'the Layers section is OPEN, so its cards are on screen to be read',
      expanded === 'already-open' || expanded === 'clicked-open', `layers → ${expanded}`);

    // ---- 2. Drive `fb`, and READ IT BACK. --------------------------------
    //
    // Reading it back is the row that stops the rest of the harness being a
    // story: if `fb` never landed, nothing could have been disabled and every
    // "not disabled" below would be true for the wrong reason.
    const setFb = await c.evalExpr(SET_SELECT(FB_SEL(0), FB));
    check('2a', `Plane B factor driven to ${FB}`, setFb === 'ok', `set → ${setFb}`);
    await sleep(500);
    const doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const scene = doc.find((s) => s.id === SCENE_ID);
    check('2b', `the DOCUMENT carries fb ${FB} on layer 0 (not just the widget)`,
      scene !== undefined && scene.layers[0].fb === FB,
      `layer 0 fb = ${JSON.stringify(scene && scene.layers[0].fb)}`);

    // ---- 3. THE CLAIM. ----------------------------------------------------
    const curve = await c.json(READ_OPTIONS(CURVE_SEL(0)));
    // ANTI-VACUOUS FLOOR: the control was found, and it holds the whole list.
    // Without this, a rotted selector makes every `.find()` undefined and a
    // carelessly-shaped row below would read that as "nothing wrong".
    check('3a', 'the curve picker was FOUND and holds a full option list',
      curve !== null && Array.isArray(curve.options) && curve.options.length > 3,
      curve === null ? 'NO ELEMENT MATCHED — selector rot' : `${curve.options.length} options`);
    if (curve === null) throw new Error('curve picker not found — rows 3b..4b cannot be measured');

    const refused = curve.options.find((o) => o.value === FB);
    check('3b', `the refused value ${FB} is STILL OFFERED (disabled, never hidden)`,
      refused !== undefined,
      refused === undefined
        ? `${FB} is ABSENT from the list — hiding is the wrong remedy: a select missing its own `
          + 'value shows a different one'
        : `present, label ${JSON.stringify(refused.label)}`);
    check('3c', `${FB} is DISABLED`, refused !== undefined && refused.disabled === true,
      `disabled = ${refused && refused.disabled}`);
    check('3d', 'the option SAYS it is refused, in the list itself',
      refused !== undefined && /\(engine refuses\)/.test(refused.label),
      `label = ${JSON.stringify(refused && refused.label)}`);
    check('3e', "the option carries the ENGINE'S REASON, naming the mechanism",
      refused !== undefined
        && /same factor as Plane B/.test(refused.title)
        && /the build refuses it/.test(refused.title),
      `title = ${JSON.stringify(refused && refused.title)}`);

    const others = curve.options.filter((o) => o.value !== FB);
    // ⚠ "EXACTLY ONE" MUST NAME WHICH ONE, or the row is half a claim. Measured:
    // with `disabled` deleted from the component this row went GREEN while 3c
    // and 3e went red — "no OTHER option is disabled" is trivially true when
    // NONE is. The conjunct below is what makes the row true or false about its
    // own sentence rather than about its easy half.
    check('3f', 'EXACTLY ONE option is disabled, and it is the refused one — narrowed, not crippled',
      refused !== undefined && refused.disabled === true
      && others.every((o) => o.disabled === false) && others.length > 2,
      `${others.length} other options, disabled: ${JSON.stringify(others.filter((o) => o.disabled).map((o) => o.value))}`);
    check('3g', 'the "none" state is still takeable — no curve is always legal',
      curve.options.some((o) => /^none/.test(o.label) && o.disabled === false));

    // ---- 4. THE CONTROL. `fa` / `fb` are the same component, unnarrowed. --
    for (const [id, sel, what] of [['4a', FA_SEL(0), 'fa'], ['4b', FB_SEL(0), 'fb']]) {
      const p = await c.json(READ_OPTIONS(sel));
      check(id, `the ${what} picker offers EVERY factor — the narrowing did not leak`,
        p !== null && p.options.length > 3 && p.options.every((o) => o.disabled === false),
        p === null ? 'NO ELEMENT' : `${p.options.length} options, ${p.options.filter((o) => o.disabled).length} disabled`);
    }

    // ---- 5. THE PICTURE. --------------------------------------------------
    //
    // dpr and the rect are read in THIS run and printed with the integer the
    // click is aimed at, because dpr here has been 1 and 1.35 on the same day
    // and a fractional target lands on the neighbouring pixel.
    const env2 = await c.json(String.raw`({
      dpr: window.devicePixelRatio,
      inner: [window.innerWidth, window.innerHeight],
      rect: (() => { const e = ${SEL_BY_TITLE(CURVE_SEL(0))}; return e ? e.getBoundingClientRect().toJSON() : null; })(),
    })`);
    const r = env2.rect;
    // INTEGER CLIENT PIXELS, derived from the rect and then printed, so the
    // expectation and the aim are the same number.
    const aimX = Math.round(r.left + r.width / 2);
    const aimY = Math.round(r.top + r.height / 2);
    console.log(`        LIVE ENV  dpr=${env2.dpr}  inner=${JSON.stringify(env2.inner)}`);
    console.log(`        RECT      left=${r.left} top=${r.top} w=${r.width} h=${r.height}`);
    console.log(`        AIM       (${aimX}, ${aimY})  <- integer client px, derived from the rect above`);
    check('5a', 'the aim is an integer client pixel inside the control',
      Number.isInteger(aimX) && Number.isInteger(aimY)
      && aimX >= Math.ceil(r.left) && aimX <= Math.floor(r.left + r.width)
      && aimY >= Math.ceil(r.top) && aimY <= Math.floor(r.top + r.height));

    // ⚠ THE OPEN POPUP CANNOT BE PHOTOGRAPHED HERE, AND THAT WAS MEASURED
    // RATHER THAN ASSUMED. Chromium draws a `<select>` menulist as a NATIVE
    // widget outside the page, so `Page.captureScreenshot` never sees it; and
    // an `import -window root` on this run's own Xvfb display came back
    // 1680x1050, 8-bit grayscale, TWO COLOURS, 353 bytes — a blank server.
    // Under `xvfb-run` with no window manager the Electron window is not on
    // the root surface at all, so there is nothing there to capture, popup or
    // otherwise. The sibling harness reached the same wall from the other side
    // ("CDP's Input domain cannot reach into the native popup ... an instrument
    // limit, not a defect in the control"). A blank PNG is worse evidence than
    // none, so that route is abandoned rather than shipped.
    //
    // WHAT IS PHOTOGRAPHED INSTEAD IS STRICTLY BETTER, and it is the case the
    // whole "disabled, never hidden" rule exists for. An author can still ARRIVE
    // at `to == fb` — not through the curve picker, which now refuses it, but by
    // moving `fb` ONTO a curve that was legal when they set it, two rows up on
    // the same card. That back door is real, no picker can close it, and it is
    // the state a hand-edited file carries too. In it, the closed control
    // DISPLAYS the refused option's own label and the advisory renders the
    // reason underneath — both in the page, both in one capture.
    const setLegalCurve = await c.evalExpr(SET_SELECT(CURVE_SEL(0), LEGAL_TO));
    await sleep(500);
    const beforeMove = await c.json(READ_OPTIONS(CURVE_SEL(0)));
    check('5b', `the curve was set to ${LEGAL_TO} while it was still legal`,
      setLegalCurve === 'ok' && beforeMove.value === LEGAL_TO,
      `select shows ${JSON.stringify(beforeMove.value)}`);
    // NOW MOVE `fb` ONTO IT — the back door, driven.
    const moveFb = await c.evalExpr(SET_SELECT(FB_SEL(0), LEGAL_TO));
    await sleep(700);
    check('5c', `Plane B moved onto the curve's far end (fb → ${LEGAL_TO})`, moveFb === 'ok');

    const after = await c.json(READ_OPTIONS(CURVE_SEL(0)));
    check('5d', 'the control still DISPLAYS its own value — the option was not dropped',
      after.value === LEGAL_TO,
      `select value = ${JSON.stringify(after.value)} (a dropped option would show a DIFFERENT one)`);
    check('5e', 'and the label it displays says the engine refuses it',
      /\(engine refuses\)/.test(after.options.find((o) => o.value === LEGAL_TO).label),
      `displayed label = ${JSON.stringify(after.options.find((o) => o.value === LEGAL_TO).label)}`);
    // THE REASON, RENDERED IN THE PAGE — not a tooltip, not a title attribute.
    const advisoryText = await c.evalExpr(String.raw`
      (() => {
        const hit = [...document.querySelectorAll('div')]
          .map((d) => (d.textContent || '').trim())
          .filter((t) => /the ramp goes nowhere and the build refuses it/.test(t));
        return hit.length ? hit[hit.length - 1] : '';
      })()`);
    check('5f', "the engine's REASON is rendered in the page, under the row that caused it",
      /curve to .* is the same factor as Plane B/.test(advisoryText)
      && /the ramp goes nowhere and the build refuses it/.test(advisoryText),
      `rendered: ${JSON.stringify(advisoryText)}`);

    // The capture. SCROLLED INTO VIEW FIRST — the layer cards live in an
    // `overflow-y: auto` section, so the card's own rect can extend well past
    // what the section actually paints, and the first cut of this clip
    // photographed a correct rectangle of a row that was not on screen. The
    // clip is taken from the CONTROL and the ADVISORY once both are painted,
    // and it is INTEGER, for the dpr reason printed above.
    // A TALLER VIEWPORT, BECAUSE THE SECTION IS THE CONSTRAINT AND NOT THE
    // FEATURE. At the launch geometry the Layers section paints ~200px, which
    // is not enough to hold the curve control AND the sentence under it at
    // once — a capture centred on either scrolled the other away. That is a
    // property of an 872px window with four sections in it, not of the row.
    // `deviceScaleFactor: 0` KEEPS THE NATIVE dpr: the height is what changes,
    // and the dpr printed below is still the environment's own.
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: 1400, height: 1600, deviceScaleFactor: 0, mobile: false,
    });
    await sleep(800);

    // THE ADVISORY is what is centred, not the control. Centring the SELECT
    // put the sentence below the section's scroll edge and the first capture
    // photographed a legible control over a clipped-off reason — the row it
    // exists to show. The advisory sits UNDER the control, so centring it
    // brings both into the painted area.
    const scrolled = await c.evalExpr(String.raw`
      (() => {
        const adv = [...document.querySelectorAll('div')]
          .filter((d) => /the ramp goes nowhere and the build refuses it/.test((d.textContent || '').trim())
            && d.children.length === 0).pop();
        if (!adv) return 'no-advisory';
        adv.scrollIntoView({ block: 'center' });
        return 'ok';
      })()`);
    await sleep(600);
    const card = await c.json(String.raw`(() => {
      const e = ${SEL_BY_TITLE(CURVE_SEL(0))};
      // The row's own <Field>, and the advisory that must appear beneath it.
      const row = e.closest('div');
      const adv = [...document.querySelectorAll('div')]
        .filter((d) => /the ramp goes nowhere and the build refuses it/.test((d.textContent || '').trim())
          && d.children.length === 0).pop();
      const a = row.getBoundingClientRect();
      const b = (adv || row).getBoundingClientRect();
      const top = Math.floor(Math.min(a.top, b.top)) - 28;
      const bottom = Math.ceil(Math.max(a.bottom, b.bottom)) + 8;
      const left = Math.floor(Math.min(a.left, b.left)) - 96;
      const right = Math.ceil(Math.max(a.right, b.right)) + 8;
      // IS THE ADVISORY ACTUALLY PAINTED? Its own rect is real even when the
      // scrolling section has clipped it away, which is exactly how the first
      // capture came back showing a control over an absent sentence. The test
      // is containment in the nearest scroller's box, not "does it have a rect".
      let painted = false;
      if (adv) {
        let sc = adv.parentElement;
        while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
        const box = sc ? sc.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
        painted = b.top >= box.top - 1 && b.bottom <= box.bottom + 1;
      }
      return { x: left, y: top, width: right - left, height: bottom - top,
               foundAdvisory: !!adv, paintedAdvisory: painted };
    })()`);
    check('5g0', 'the advisory was located and scrolled into the painted area for the clip',
      card.foundAdvisory === true && scrolled === 'ok' && card.paintedAdvisory === true,
      `scroll=${scrolled} clipSource=${card.foundAdvisory ? 'row + advisory' : 'ROW ONLY'} `
      + `advisoryInsideSection=${card.paintedAdvisory}`);
    const env3 = await c.json('({ dpr: window.devicePixelRatio, inner: [window.innerWidth, window.innerHeight] })');
    console.log(`        CAPTURE ENV  dpr=${env3.dpr}  inner=${JSON.stringify(env3.inner)}  (height overridden; dpr native)`);
    console.log(`        CLIP      ${JSON.stringify(card)}  <- integer, from the row's and the advisory's own rects`);
    const full = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/1-effects-panel.png`, Buffer.from(full.data, 'base64'));
    const clipped = await c.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: card.x, y: card.y, width: card.width, height: card.height, scale: 3 },
    });
    const shot = `${SHOTS}/2-refused-value-displayed-with-reason.png`;
    writeFileSync(shot, Buffer.from(clipped.data, 'base64'));
    console.log(`        SHOT PATH ${shot}`);
    check('5g', 'both captures are real images, not a blank server',
      Buffer.from(clipped.data, 'base64').length > 5000
      && Buffer.from(full.data, 'base64').length > 20000,
      `clip ${Buffer.from(clipped.data, 'base64').length}B, full ${Buffer.from(full.data, 'base64').length}B`);

    // ---- 5h. THE LIST ITSELF, PHOTOGRAPHED. ------------------------------
    //
    // A native menulist popup cannot be captured (see the file banner), so the
    // list is forced to render INLINE by setting `size` on the very same
    // `<select>`. THIS IS A CAPTURE TECHNIQUE, NOT A DIFFERENT CONTROL: the
    // `<option>` elements photographed are the ones React rendered, carrying the
    // `disabled` flag and the label the provider gave them — nothing is
    // rebuilt, and the greying is the browser's own for a disabled option. The
    // attribute is removed immediately after.
    //
    // The layer is put back to `fb = FB` with NO curve first, which is the state
    // an author is actually in when they open this list: a legal document, one
    // option greyed, nothing yet chosen.
    await c.evalExpr(SET_SELECT(CURVE_SEL(0), '__none__'));
    await sleep(300);
    await c.evalExpr(SET_SELECT(FB_SEL(0), FB));
    await sleep(600);
    const listRect = await c.json(String.raw`(() => {
      const e = ${SEL_BY_TITLE(CURVE_SEL(0))};
      e.size = 18;
      e.scrollIntoView({ block: 'center' });
      const b = e.getBoundingClientRect();
      return { x: Math.floor(b.left) - 4, y: Math.floor(b.top) - 4,
               width: Math.ceil(b.width) + 8, height: Math.ceil(b.height) + 8,
               disabledLabel: [...e.options].filter((o) => o.disabled).map((o) => o.textContent) };
    })()`);
    await sleep(500);
    console.log(`        LIST CLIP ${JSON.stringify(listRect)}`);
    const listShot = await c.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: listRect.x, y: listRect.y, width: listRect.width, height: listRect.height, scale: 2 },
    });
    const shot3 = `${SHOTS}/3-option-list-refused-value-greyed.png`;
    writeFileSync(shot3, Buffer.from(listShot.data, 'base64'));
    console.log(`        SHOT PATH ${shot3}`);
    check('5h', 'the rendered list greys exactly the refused value, and says so on the row',
      listRect.disabledLabel.length === 1 && listRect.disabledLabel[0] === `${FB} (engine refuses)`,
      `disabled rows in the rendered list: ${JSON.stringify(listRect.disabledLabel)}`);
    await c.evalExpr(String.raw`(() => { ${SEL_BY_TITLE(CURVE_SEL(0))}.removeAttribute('size'); return 'ok'; })()`);

    await c.send('Emulation.clearDeviceMetricsOverride');
    await sleep(400);
    // Put the layer back to a legal curve before section 6 drives the packed
    // path, so 6b is not reading a value this section left behind.
    await c.evalExpr(SET_SELECT(FB_SEL(0), FB));
    await sleep(400);

    // ---- 6. The advisory still covers what the picker cannot. -------------
    //
    // The packed path has no option to grey, so `curveAdvisory` is the only
    // thing standing there. Driving it proves the two-paths split is intact
    // rather than replaced.
    const setCurve = await c.evalExpr(SET_SELECT(CURVE_SEL(0), '__packed__'));
    await sleep(600);
    check('6a', 'the packed escape hatch is still reachable from the curve picker',
      setCurve === 'ok', `set → ${setCurve}`);
    const doc2 = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const s2 = doc2.find((s) => s.id === SCENE_ID);
    check('6b', 'choosing custom writes a packed triple, not a name',
      s2 !== undefined && s2.layers[0].curve !== undefined
      && typeof s2.layers[0].curve.to === 'object',
      `curve = ${JSON.stringify(s2 && s2.layers[0].curve)}`);
  } finally {
    try { c && c.close(); } catch { /* ignore */ }
    // BY PID ONLY. killTree walks /proc for descendants of the pid THIS
    // process spawned; nothing here signals a pid outside that set, and there
    // is no `pkill` on a pattern anywhere in this file.
    await killTree(child.pid);
  }

  console.log(`\n=== ${results.length} rows, ${fails.length} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
