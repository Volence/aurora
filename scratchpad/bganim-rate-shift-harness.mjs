#!/usr/bin/env node
// CAN AN AUTHOR SET A BAND'S SPEED, IN THE RUNNING APP?  (ROADMAP item 44)
//
// Until this parcel, BgAnimBandPanel built its BandSpec from cols/rows/
// phaseFill/driver only, so EVERY band a human authored moved at exactly one
// speed — aeon's default. Everything under the panel already carried the key:
// the model, the codec, both command doors, both agent doors, and the panel's
// own read-only display of `rate_shift` on each band row. The suite had ~4,400
// green tests over that stack while the one thing an author touches was absent.
// That is bar 1 in one sentence, and it is why this file exists: the node suite
// cannot see a form, so a control's existence is not a node-testable fact.
//
// ═══ WHAT EACH ROW IS BUILT TO CATCH ═══
//
// 1. A CONTROL THAT IS NOT THERE, or is there and unreachable. Section 4 counts
//    the actual <select>'s options in the DOM and names them, the way the
//    reference harness's 4a/4b do — a derivation yielding undefined renders an
//    EMPTY select, which on screen looks exactly like a panel still loading.
//
// 2. A DEFAULT THAT GETS WRITTEN INTO THE FILE. The whole point of the
//    "(default)" state is that the key is ABSENT, so the document tracks
//    whatever the consumer's default becomes. A control seeded at today's value
//    that always writes it produces a band that LOOKS identical in the panel
//    (same effective rate) and has frozen the rate in the JSON forever. Only
//    `rateShiftIsExplicit` tells those apart, and section 5 reads it.
//
// 3. A TYPED VALUE THAT ESCAPES THE CLAMP. `min` on <input type="number">
//    governs the spinner and `:invalid` and stops NOTHING an author types
//    (ROADMAP item 37, and item 40 tracks two sites still carrying the defect).
//    Section 7 puts a negative and a fraction into the real box and reads both
//    the box and the model back.
//
// ═══ WHICH ROWS DO NOT DISCRIMINATE (stated up front) ═══
//
//   • 2a/2b (the Effects pill, the band panel's headings) and 3a (the document
//     loaded) are INSTRUMENT CHECKS and preconditions. They would pass on any
//     aeon project with this facet, control or no control. Every row below 3a
//     aborts the run if 3a fails, so a tree without editor_bg_override.json
//     reads as "could not measure" rather than as silent vacuity.
//   • 3b (a band slot is free) is a precondition too: at the 4-band ceiling
//     Promote is disabled and sections 5–7 would be measuring a dead button.
//   • 8b (the rAF counter advanced) proves only that the page is alive; it is
//     the anti-vacuous companion to 8a.
//   • 9a (nothing was saved) is a property of THIS HARNESS, not of the app —
//     it would also hold if every gesture above had failed.
//
// Every other row asserts a MODEL fact that moved, and asserts the instrument
// saw its subject first: each promotion row requires the band count to have
// GONE UP before it says anything about the band it created (the reference
// harness reported three rows green over a promotion that never happened, on
// 2026-08-22, and that is the bug this discipline comes from).
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed; every gesture is undone
// with a real Ctrl+Z and row 9a hashes aeon's file before and after.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/bganim-rate-shift-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9397);
// Defaults to the tree this FILE lives in — a pinned path would silently serve
// another checkout's dist/.
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const OVERRIDE_FILE = `${AEONDIR}/games/sonic4/data/editor_bg_override.json`;
const SHOTS = `${ROOT}/scratchpad/shots-bganim-rate-shift`;
mkdirSync(SHOTS, { recursive: true });

// ═══ EXPECTATIONS COME FROM THE VENDORED CONTRACT, NOT FROM THIS FILE ═══
// A `2` typed here would be a second copy of the default the whole parcel exists
// to stop the panel from copying.
const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const RATE_DEFAULT = CONTRACT.bandKeys.rate_shift.default;
const RATE_KIND = CONTRACT.bandKeys.rate_shift.kind;
const MAX_BANDS = CONTRACT.constants.BGANIM_MAX_BANDS.value;
// A value that is legal and NOT the default, derived rather than picked.
const CUSTOM_RATE = RATE_DEFAULT + 1;

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

// ═══ "New band" ARRIVES COLLAPSED (ROADMAP item 41) ═══
// It is a creation form and was measured as the tallest box in the effects
// column (474px of 1229px), so the item-41 layout pass gave it
// `defaultCollapsed`. A collapsed CollapsibleSection renders NO children at
// all, so every control below this point would come back `null` and read as
// "the control is missing" — which is exactly the defect these harnesses were
// written to detect. Opened the way a human opens it: a click on its header.
const OPEN_NEW_BAND = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => (h.firstElementChild.textContent || '').trim() === 'New band');
  if (!hdr) return 'no-section';
  if (hdr.parentElement.parentElement.children.length > 1) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

// ⚠ `BG animation bands` ARRIVES COLLAPSED TOO, since ROADMAP item 45's open
// tail (the 1280x800 parcel): the column could not reach zero at that height
// with five sections open, and the band list is the one section in it that is
// not about the parallax scene the facet arrives on. The same reasoning as
// `New band` above therefore applies to it, and so does the same fix — a
// collapsed CollapsibleSection renders NO children, so the band cards, the
// Demote/Remove buttons and the blob-budget readout below all come back `null`
// and read as "missing" unless this runs first. Opened by clicking its header,
// the way a human opens it.
const OPEN_BAND_LIST = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => /^BG animation bands/.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-section';
  if (hdr.parentElement.parentElement.children.length > 1) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-bganim-rate-shift/${name}.png`);
}

// React ignores a plain `el.value = x`: its synthetic onChange never fires. The
// native setter plus a bubbling input/change event is what a real keystroke
// looks like from React's side — not a shortcut past the component, the only way
// to reach it from outside. (Row 7c ALSO types with real key events, because
// this path is the one place a harness could accidentally bypass the field.)
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
const CONTROL_BY_TEXT = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return null;
  return { text: (el.textContent || '').trim(), disabled: !!el.disabled, title: el.title || '' };
})()`;
const SELECT_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;
const INPUT_BY_TITLE = (re) => `[...document.querySelectorAll('input')].find((e) => ${re}.test(e.title || ''))`;

// The rate control's two halves, as the DOM actually holds them.
const RATE_SELECT = SELECT_BY_TITLE('/rate_shift — HIGHER IS SLOWER/');
const RATE_BOX = INPUT_BY_TITLE('/step = driver >>/');

const RATE_UI = String.raw`
(() => {
  const s = ${RATE_SELECT};
  const box = ${RATE_BOX};
  return {
    select: s ? {
      value: s.value,
      title: (s.title || '').replace(/\s+/g, ' '),
      options: [...s.options].map(o => ({
        v: o.value, label: (o.textContent || '').trim(), title: (o.title || '').replace(/\s+/g, ' '),
      })),
    } : null,
    box: box ? { value: box.value, min: box.getAttribute('min'), max: box.getAttribute('max'),
                 title: (box.title || '').replace(/\s+/g, ' ') } : null,
  };
})()`;

const REPAINT_PROBE = String.raw`
(() => {
  if (window.__rsProbe) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
  window.__rsProbe = P;
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

const fileHash = () => (existsSync(OVERRIDE_FILE)
  ? createHash('sha256').update(readFileSync(OVERRIDE_FILE)).digest('hex') : 'absent');

async function main() {
  console.log(`\nDERIVED FROM THE VENDORED CONTRACT (${CONTRACT.source.repo}@${CONTRACT.source.commit.slice(0, 7)}):`);
  console.log(`  rate_shift: kind=${RATE_KIND}  default=${RATE_DEFAULT}  `
    + `max declared=${Object.hasOwn(CONTRACT.bandKeys.rate_shift, 'max')}`);
  console.log(`  custom value this run authors = ${CUSTOM_RATE}   BGANIM_MAX_BANDS = ${MAX_BANDS}\n`);

  const hashBefore = fileHash();
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open the REAL aeon tree. ------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the aeon project is open, with sections [precondition]',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');

    // ---- 2. INSTRUMENT CHECKS (do not discriminate). --------------------
    await sleep(2500);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill [instrument check]', clicked === true,
      `click=${clicked}`);
    await sleep(1200);
    await c.evalExpr(OPEN_BAND_LIST);
    await sleep(400);
    const openedNewBand = await c.evalExpr(OPEN_NEW_BAND);
    if (openedNewBand === 'no-section') throw new Error('no "New band" section on screen');
    await sleep(900);
    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(BG animation bands|New band$)/.test(t))`);
    check('2b', 'the BAND panel is mounted — its own headings [instrument check]',
      headings.some((h) => h.startsWith('BG animation bands')) && headings.includes('New band'),
      JSON.stringify(headings));

    // ---- 3. Preconditions. ----------------------------------------------
    const status = await c.json('window.__dbg.aeon.bgOverrideStatus()');
    const budget0 = await c.json('window.__dbg.aeon.bandBudget()');
    const present = !!(status && status.present && status.unreadable === null);
    check('3a', 'aeon\'s editor_bg_override.json loaded [precondition]', present,
      JSON.stringify(status));
    if (!present) throw new Error('no override document — every row below would be vacuous');
    check('3b', `a band slot is free (${budget0.bands}/${MAX_BANDS} used) [precondition — at the `
      + 'ceiling Promote is dead and 5–7 would measure a disabled button]',
      budget0.bandsRemaining >= 1, JSON.stringify(budget0));
    if (budget0.bandsRemaining < 1) throw new Error('no band slot free');

    // ---- 4. THE CONTROL IS ON SCREEN AND REACHABLE. ---------------------
    let ui = await c.json(RATE_UI);
    check('4a', 'a rate_shift control exists in the New band form', ui.select !== null,
      ui.select ? `value=${JSON.stringify(ui.select.value)}` : 'no <select> whose title names rate_shift');
    if (!ui.select) throw new Error('no rate control — that IS the defect, and 5–7 cannot run');
    // THE ROW THIS EXISTS FOR: an empty <select> is indistinguishable on screen
    // from a panel that has not loaded. Count the options and NAME them.
    check('4b', 'it offers exactly two states — "(default)" which OMITS the key, and "custom"',
      ui.select.options.length === 2
      && ui.select.options.some((o) => o.v === '')
      && ui.select.options.some((o) => o.v === 'custom'),
      JSON.stringify(ui.select.options.map((o) => `${o.v}:${o.label}`)));
    // The default it PRINTS is the contract's, read from the JSON here and not
    // typed: a panel with a literal would pass a node test forever.
    const defaultOpt = ui.select.options.find((o) => o.v === '');
    check('4c', `the "(default)" option prints the CONTRACT'S default (${RATE_DEFAULT})`,
      !!defaultOpt && defaultOpt.label.includes(String(RATE_DEFAULT)),
      defaultOpt ? JSON.stringify(defaultOpt.label) : 'n/a');
    // THE DIRECTION, on the rendered control rather than in a source comment.
    check('4d', 'the control says HIGHER IS SLOWER where an author will read it',
      /HIGHER IS SLOWER/.test(ui.select.title)
      && ui.select.options.every((o) => /SLOWER|default/i.test(o.title)),
      JSON.stringify(ui.select.title.slice(0, 120)));
    // At "(default)" there is NO number box — the shape that makes "the key is
    // absent" a state rather than a value.
    check('4e', 'at (default) there is no number box at all — absence is a state, not a value',
      ui.box === null, JSON.stringify(ui.box));
    await shot(c, '1-rate-control-default');

    // Geometry small enough to promote repeatedly: 1x1.
    await c.evalExpr(SET_INPUT(INPUT_BY_TITLE('/^cols —/'), 1));
    await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/rows —/'), 1));
    await sleep(300);

    const baseBands = await c.json('window.__dbg.aeon.bands()');
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');

    /**
     * Promote with whatever the form currently holds, read the band back, then
     * undo with a REAL Ctrl+Z. Returns null when the promotion never landed,
     * which every caller treats as a failing row rather than dereferencing it.
     */
    async function promoteReadUndo(shotName) {
      const before = await c.json('window.__dbg.aeon.bands()');
      const clickedP = await c.evalExpr(clickByText('/^Promote$/'));
      await sleep(900);
      const after = await c.json('window.__dbg.aeon.bands()');
      const landed = after.length === before.length + 1;
      if (shotName) await shot(c, shotName);
      const band = landed ? after[after.length - 1] : null;
      if (landed) {
        // BLUR FIRST, AND THIS IS NOT HOUSEKEEPING. Row 7c types into the number
        // box with real key events, which leaves it FOCUSED — and a Ctrl+Z
        // delivered to a focused <input> is consumed by the input's own native
        // undo stack and never reaches the app's shortcut. The first run of this
        // file left an extra band standing for exactly that reason and rows
        // 7e/7f went red over it. That is a property of THIS INSTRUMENT (an
        // author pressing Ctrl+Z inside a text field expects the field to
        // undo); the harness has to leave the field before it can measure the
        // document's undo.
        await c.evalExpr('document.activeElement && document.activeElement.blur(); "ok"');
        for (const type of ['rawKeyDown', 'char', 'keyUp']) {
          await c.send('Input.dispatchKeyEvent', {
            type, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90,
            modifiers: 2, text: type === 'char' ? 'z' : undefined,
          });
        }
        await sleep(700);
      }
      const restored = await c.json('window.__dbg.aeon.bands()');
      return { landed, band, click: clickedP, undone: restored.length === before.length };
    }

    // ---- 5. (default) → THE KEY IS ABSENT. ------------------------------
    const promoteCtl = await c.json(CONTROL_BY_TEXT('/^Promote$/'));
    check('5a', 'Promote is spendable [instrument check for 5b–7d]',
      !!promoteCtl && promoteCtl.disabled === false, JSON.stringify(promoteCtl));
    const r5 = await promoteReadUndo('2-promoted-at-default');
    check('5b', 'promoting at (default) put a band IN THE MODEL', r5.landed,
      `click=${r5.click} bands ${baseBands.length} → ${r5.landed ? baseBands.length + 1 : '(unchanged)'}`);
    // THE ROW THE WHOLE "OMIT THE KEY" DESIGN TURNS ON. A control seeded at the
    // default and always written produces a band with the SAME rateShift and
    // rateShiftIsExplicit === true — identical in the panel, frozen in the JSON.
    check('5c', 'and the document does NOT spell rate_shift: the file keeps tracking aeon\'s default',
      r5.landed && r5.band.rateShiftIsExplicit === false && r5.band.rateShift === RATE_DEFAULT,
      r5.band ? `rateShift=${r5.band.rateShift} explicit=${r5.band.rateShiftIsExplicit} `
        + `(contract default ${RATE_DEFAULT})` : 'no band — see 5b');
    check('5d', 'and Ctrl+Z took it back out', r5.undone, `bands back to ${baseBands.length}`);

    // ---- 6. custom → THE KEY IS SPELLED, AT THE AUTHOR'S VALUE. ---------
    const pickedCustom = await c.evalExpr(SET_INPUT(RATE_SELECT, 'custom'));
    await sleep(400);
    ui = await c.json(RATE_UI);
    check('6a', 'picking "custom" reveals a number box, seeded at the contract default',
      pickedCustom === 'ok' && ui.box !== null && Number(ui.box.value) === RATE_DEFAULT,
      JSON.stringify(ui.box));
    if (!ui.box) throw new Error('no number box after choosing custom — 6b–7d cannot run');
    // No invented ceiling: the contract declares none, and a UI that refused a
    // value aeon bakes is worse than one that permits a useless one.
    check('6b', 'the box carries min=0 and NO max, matching the contract\'s nonNegativeInt',
      ui.box.min === '0' && ui.box.max === null && RATE_KIND === 'nonNegativeInt',
      `min=${ui.box.min} max=${ui.box.max} kind=${RATE_KIND}`);
    const typed = await c.evalExpr(SET_INPUT(RATE_BOX, CUSTOM_RATE));
    await sleep(400);
    ui = await c.json(RATE_UI);
    check('6c', `the box takes ${CUSTOM_RATE} and its tooltip states the consequence`,
      typed === 'ok' && Number(ui.box.value) === CUSTOM_RATE
      && new RegExp(`step = driver >> ${CUSTOM_RATE}\\b`).test(ui.box.title)
      && /HIGHER IS SLOWER/.test(ui.box.title),
      `value=${ui.box.value} title=${JSON.stringify(ui.box.title.slice(0, 110))}`);
    const r6 = await promoteReadUndo('3-promoted-custom-rate');
    check('6d', `promoting wrote rate_shift=${CUSTOM_RATE} into the document, EXPLICITLY`,
      r6.landed && r6.band.rateShift === CUSTOM_RATE && r6.band.rateShiftIsExplicit === true,
      r6.band ? `rateShift=${r6.band.rateShift} explicit=${r6.band.rateShiftIsExplicit}`
        : `no band — click=${r6.click}`);
    check('6e', 'and Ctrl+Z took it back out', r6.undone, `undone=${r6.undone}`);

    // ---- 7. THE CLAMP: what the spinner cannot stop. --------------------
    // `min` governs the spinner and `:invalid` only (ROADMAP item 37). These
    // rows put values a spinner would never produce into the real box.
    const typedNeg = await c.evalExpr(SET_INPUT(RATE_BOX, -3));
    await sleep(400);
    ui = await c.json(RATE_UI);
    check('7a', 'a typed NEGATIVE is clamped in the field itself, not left for the codec to refuse',
      typedNeg === 'ok' && Number(ui.box.value) === 0, `box now ${JSON.stringify(ui.box.value)}`);
    const r7 = await promoteReadUndo();
    check('7b', 'and the model got 0 — a legal rate — rather than -3',
      r7.landed && r7.band.rateShift === 0 && r7.band.rateShiftIsExplicit === true,
      r7.band ? `rateShift=${r7.band.rateShift} explicit=${r7.band.rateShiftIsExplicit}`
        : `no band — click=${r7.click}`);

    // REAL KEYSTROKES, not the native setter — the one place a harness could
    // accidentally be testing its own event dispatch instead of the field.
    await c.evalExpr(`(() => { const b = ${RATE_BOX}; if (!b) return 'no-box'; b.focus(); b.select(); return 'ok'; })()`);
    await c.send('Input.insertText', { text: '2.7' });
    await sleep(500);
    ui = await c.json(RATE_UI);
    const focusedIsBox = await c.evalExpr(
      `document.activeElement === ${RATE_BOX} || document.activeElement === document.body`);
    check('7c', 'a FRACTION typed with real key events rounds to an integer in the field',
      Number(ui.box.value) === 3,
      `box now ${JSON.stringify(ui.box.value)} (typed "2.7" via Input.insertText; `
      + `focus-was-box=${focusedIsBox})`);
    const r7d = await promoteReadUndo('4-clamped-fraction');
    check('7d', 'and the model got the integer 3, never 2.7 (the codec refuses non-integers)',
      r7d.landed && r7d.band.rateShift === 3 && Number.isInteger(r7d.band.rateShift),
      r7d.band ? `rateShift=${r7d.band.rateShift}` : `no band — click=${r7d.click}`);
    check('7e', 'every gesture in 5–7 was undone: the band list is where it started',
      (await c.json('window.__dbg.aeon.bands()')).length === baseBands.length,
      `bands ${baseBands.length} → ${(await c.json('window.__dbg.aeon.bands()')).length}`);
    const hashEnd = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('7f', 'and the in-memory document is byte-for-byte the one it started as',
      hashEnd === hash0, `${hash0} → ${hashEnd}`);

    // ---- 8. Still no clock. ---------------------------------------------
    // The panel now renders a derived sentence on every keystroke. That must not
    // have cost the viewport's measured zero-idle-repaint property.
    const probe = await c.evalExpr(REPAINT_PROBE);
    check('8a-setup', 'the repaint probe bound to the live map canvas', probe === 'installed',
      `probe=${probe}`);
    await c.evalExpr('window.__rsProbe.repaints = 0; window.__rsProbe.ticks = 0; window.__rsProbe.start()');
    await sleep(3000);
    await c.evalExpr('window.__rsProbe.stop()');
    const idle = await c.json('({repaints: window.__rsProbe.repaints, ticks: window.__rsProbe.ticks, bound: window.__rsProbe.bound()})');
    check('8a', 'the rate control starts NO clock: zero map repaints over 3s idle',
      idle.repaints === 0 && idle.bound === true, JSON.stringify(idle));
    check('8b', 'and the page was provably still painting [anti-vacuous companion to 8a]',
      idle.ticks > 60, `${idle.ticks} rAF ticks in 3s`);

    // ---- 9. Nothing was written. ----------------------------------------
    const hashAfter = fileHash();
    check('9a', 'aeon\'s editor_bg_override.json is untouched [harness property, not a finding]',
      hashAfter === hashBefore, `${hashBefore.slice(0, 12)} → ${hashAfter.slice(0, 12)}`);
    await c.send('Page.reload').catch(() => {});
  } finally {
    if (c) c.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed`);
  if (fails.length) {
    console.log('FAILURES:');
    for (const f of fails) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
