#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// THE `base_swap` AUTHORING CONTROL, IN THE REAL APP
//
// The node suite cannot see React, so ~3,400 rows pass there while a control is
// visibly dead. This drives the built app under CDP and measures the things
// that only exist on a rendered surface:
//
//   [cv] the raster-program switch CONVERTS the document into a base swap and
//        is ONE Ctrl+Z — measured by FULL JSON EQUALITY against the document as
//        it stood before the switch
//   [dc] the band controls on a base_swap document are DISABLED **and carry a
//        painted sentence** — the sentence is asserted, not just the flag
//   [ln] a fire line outside the engine's ensure is refused AT AUTHOR TIME, the
//        document does not move, and the sentence names the RAMP's different
//        maximum rather than leaving a reader to assume symmetry
//   [gr] an off-granule VRAM base is refused, NAMES THE TWO LEGAL BASES EITHER
//        SIDE, and NOTHING SNAPS — plus the legal sibling that proves the box
//        is live
//   [hx] the address is shown AS AN ADDRESS: the hex beside the box parses back
//        to the document's own decimal, and the panel ADMITS the contract names
//        no address (it stopped naming one at empyrean 8f56c2c)
//   [as] the two asymmetries with `ramp` are PAINTED, not hover-only
//
// ═══ ⚠ MIGRATED FOR THE LIST SHAPE 2026-09-04, AND **NOT YET RE-RUN** ══════
//
// `base_swap` became a LIST of per-plane bands at empyrean `8f56c2c`. This file
// was written against the single `{line, target}` object and read
// `.base_swap.line` / `.base_swap.target` in eighteen places; every one of those
// now yields `undefined`, and `undefined === undefined` is how a harness goes
// fully green over a control that is not on screen. The reads were repointed
// through `band0()`, which THROWS on the wrong shape rather than returning null.
//
// ⚠ THE MIGRATION IS A SOURCE CHANGE THAT NOTHING HAS EXECUTED. This rig drives
// the real app under CDP and the agent that migrated it did not run it. The
// rows below are the OLD rows aimed at the new shape; NOTHING here has been
// observed since the break, and the surface itself is new (a list container, an
// add control, a plane <Select>, a restore_line presence toggle) so there are
// rows this file does NOT yet have. Treat a green run as the first evidence,
// not a re-confirmation — and add rows for the new controls when it is run.
//
// ═══ ⚠ NO ROW HERE MAY PASS VACUOUSLY ═════════════════════════════════════
//
// Every "it refused" row asserts the DOCUMENT is unchanged, read back through
// `window.__dbg.aeon.presetsJson()`, and every "it acted" row asserts the
// document really CHANGED — not that a handler ran, not that a class toggled.
// A control wired to nothing refuses everything for free.
//
// ⚠ AND NO EXPECTATION IS A LITERAL FROM THE CONTRACT. The granule, the line
// range and the named address are all DERIVED FROM THE SCHEMA in the app, with
// module-load guards; a rig that typed 8192 or 223 or 57344 here would stay
// green through a re-vendor that moved any of them. So every bound below is
// READ OFF THE APP'S OWN SENTENCE and then checked against arithmetic an author
// would do — the neighbours must bracket the typed value, their gap must equal
// the granule the sentence names, the hex must parse back to the decimal in the
// document. The two values this file DOES type are deliberately absurd (`9999`
// for a screen line) or derived at run time from what the screen said.
//
// ═══ ⚠ THE DISABLED CHIP IS NOT MEASURED BY CLICKING IT ═══════════════════
//
// A disabled `<button>` fires no `onClick`, so "I clicked it and nothing
// happened" is green however the code behaves. `[dc]` measures what an author
// can actually see: the chip is disabled, AND the refusal is PAINTED (a real
// element whose rect lands inside its own scroller), AND it says the thing.
//
// ═══ ⚠ NOT `el.click()` — AND WHERE THAT RULE STOPS ═══════════════════════
//
// Every NUMBER is typed with `Input.insertText` into a box focused by a REAL
// mouse press at an integer client pixel, verified with `elementFromPoint`
// first. The `<select>` is the stated exception: `convertChannel` TRIES a real
// `ArrowDown` on the focused element first and REPORTS which gesture actually
// moved the document; a native select's popup is a browser-process widget that
// cannot be driven under Xvfb, so the fallback is the native value setter plus
// a real `change` — React's own listener, the idiom every other select-driving
// harness here uses. Reachability of that select is covered separately, in
// [f0]. The other synthetic events are SETUP only.
//
// ⚠ IT WRITES NOTHING TO DISK. No save is issued and the app has no autosave.
// The probe preset is created IN MEMORY through the panel's own New button and
// every edit is a command in the app's own history. The sibling aeon checkout is
// opened READ-ONLY — decision d-28's writable-copy rule binds harnesses that
// write, and this one does not.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:base-swap-control
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9489);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = join(ROOT, 'scratchpad/shots-base-swap-control');
mkdirSync(SHOTS, { recursive: true });

// ⚠ THIS ID MUST NOT COLLIDE WITH A PRESET AEON SHIPS, AND ITS SIBLING'S DID.
//
// This harness opens aeon's LIVE checkout read-only and creates its fixture
// THROUGH THE PANEL, so its probe id shares a namespace with every preset aeon
// commits. The ramp harness's id was `ramp_probe` — and hours later aeon landed
// a REAL `ramp_probe.json`, after which `New` did not make a fresh document:
// the panel selected AEON'S preset and every row measured somebody else's file.
//
// aeon ALREADY ships `ojz_sec6_baseswap`, so a short id here (`base_swap_probe`,
// `baseswap_probe`) is not hypothetical — it is the same accident waiting. The
// prefix is the fix: an id no other repo would author. Do not shorten it.
const PRESET_ID = 'aurora_local_baseswapctl_probe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
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
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);
const arrowDown = (c) => key(c, 'ArrowDown', 'ArrowDown', 40);

/**
 * The geometry + enabled/present reading every aim prints, taken just before the
 * gesture. `inScroller` is the honest visibility question: `checkVisibility()`
 * and `getClientRects()` both go GREEN on an element scrolled thousands of
 * pixels out of its own scroller, so the rect is compared against the SCROLLING
 * ANCESTOR's box and not merely against zero.
 */
const readHandle = (c, handle) => c.json(String.raw`(() => {
  const el = window.__bs.el(${JSON.stringify(handle)});
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const b = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  let sc = el.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) {
    sc = sc.parentElement;
  }
  const sb = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  return { dpr: window.devicePixelRatio, left: b.left, top: b.top, w: b.width, h: b.height,
           disabled: !!el.disabled, visible: cs.visibility !== 'hidden' && cs.display !== 'none' && b.width > 0 && b.height > 0,
           scroller: sc ? (sc.className || sc.tagName) : 'viewport',
           inScroller: b.bottom > sb.top && b.top < sb.bottom && b.right > sb.left && b.left < sb.right,
           text: (el.textContent || '').trim().slice(0, 40),
           title: el.getAttribute('title'),
           value: 'value' in el ? String(el.value) : null };
})()`);

/** A REAL press at an integer client pixel, verified with elementFromPoint first. */
async function pressHandle(c, handle, label) {
  const g = await readHandle(c, handle);
  if (!g) throw new Error(`HANDLE ABSENT: "${handle}" (${label}) resolved to nothing. Refusing to `
    + 'press — a run that cannot find its own subject measures nothing.');
  await sleep(120);
  const g2 = await readHandle(c, handle);
  const x = Math.round(g2.left + g2.w / 2);
  const y = Math.round(g2.top + g2.h / 2);
  const hit = await c.json(String.raw`(() => {
    const want = window.__bs.el(${JSON.stringify(handle)});
    const el = document.elementFromPoint(${x}, ${y});
    return { tag: el ? el.tagName : null, text: el ? (el.textContent || '').trim().slice(0, 32) : null,
             insideTarget: !!(want && el && (want === el || want.contains(el))) };
  })()`);
  note(`aim: ${label} [${handle}]`,
    `dpr=${g2.dpr} rect=(${g2.left},${g2.top},${g2.w}x${g2.h}) → integer client (${x},${y}) · `
    + `disabled=${g2.disabled} visible=${g2.visible} inScroller=${g2.inScroller} `
    + `(scroller=${g2.scroller}) · elementFromPoint = <${hit.tag}> "${hit.text}" `
    + `insideTarget=${hit.insideTarget}`);
  if (!hit.insideTarget) {
    throw new Error(`AIM REFUSED: integer (${x},${y}) for "${label}" [${handle}] lands on `
      + `<${hit.tag}> "${hit.text}", which is NOT inside the handle. Pressing it would measure `
      + 'something else.');
  }
  await mouse(c, 'mousePressed', x, y);
  await sleep(60);
  await mouse(c, 'mouseReleased', x, y);
  await sleep(300);
  return g2;
}

/**
 * TYPE A NUMBER THE WAY AN AUTHOR DOES: a real press to focus the box (which
 * makes `NumberField`'s onFocus select its contents, so the text REPLACES), then
 * `Input.insertText`, which goes through the browser's editing pipeline and
 * produces the real `input` event React's onChange is wired to.
 *
 * ⚠ THE BLUR FIRST IS NOT COSMETIC. Clicking a box that is ALREADY focused
 * fires no `focus` event, so select-on-focus never runs and `insertText`
 * INSERTS at the caret instead of replacing — "160" then "9999" becomes
 * "1609999", refused for a reason that has nothing to do with the row. It cost
 * the sibling harness three red rows on its first run.
 */
async function typeInto(c, handle, text, label) {
  const blurred = await c.evalExpr(
    "(() => { const a = document.activeElement; const t = a ? a.tagName : null; "
    + "if (a && a.blur) a.blur(); return t; })()");
  note(`focus: dropped <${blurred}> before typing into ${label}`,
    'so the press below is a real focus change and the box select-on-focus runs');
  await sleep(150);
  await pressHandle(c, handle, label);
  await c.send('Input.insertText', { text });
  await sleep(450);
}

const SET_SELECT = (value) => String.raw`
(() => {
  const el = window.__bs.el('rasterSelect');
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
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

const CLICK_BY_TEXT = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

const OPEN_SECTION = (re, proofSelector) => String.raw`
(() => {
  const open = () => !!(${proofSelector});
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${re}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) {
    const seen = [...document.querySelectorAll('div')]
      .filter((d) => d.style && d.style.cursor === 'pointer')
      .map((d) => (d.textContent || '').trim().slice(0, 56));
    return 'no-header; headers on screen: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

/**
 * THE IN-PAGE HANDLE TABLE.
 *
 * ⚠ EVERY FIELD IS ADDRESSED BY ITS OWN LABEL, never by position. `Line` and
 * `Target` are two near-identical spinners in one card — the near-identical-
 * control hazard this repo names by name — so each is resolved by walking the
 * `Field` row whose label span reads exactly that word. A row that addressed
 * "the second NumberField" would silently measure its neighbour the first time
 * the card's order changed. (`Line` is also an exact match against `Lines` in
 * the ramp card, which is a different card and never on screen at the same
 * time; the match is `===`, not a prefix, so it cannot cross over.)
 */
const INSTALL_HANDLES = String.raw`
(() => {
  const rowFor = (label) => [...document.querySelectorAll('span')]
    .filter((s) => (s.textContent || '').trim() === label && s.parentElement)
    .map((s) => s.parentElement)
    .find((row) => row.querySelector('input, select')) || null;
  const fieldInput = (label) => { const r = rowFor(label); return r ? r.querySelector('input') : null; };
  window.__bs = {
    el(h) {
      if (h === 'rasterSelect') { const r = rowFor('Raster'); return r ? r.querySelector('select') : null; }
      if (h === 'line') return fieldInput('Line');
      if (h === 'target') return fieldInput('Target');
      if (h === 'addBand') return [...document.querySelectorAll('button')]
        .find((b) => /^Add raster band$/.test((b.textContent || '').trim())) || null;
      return null;
    },
    /** The gloss span sitting in the Target field's own row, beside the box. */
    targetGloss() {
      const r = rowFor('Target');
      if (!r) return null;
      const spans = [...r.querySelectorAll('span')]
        .map((s) => (s.textContent || '').trim())
        .filter((t) => t.length > 0 && t !== 'Target');
      return spans.length ? spans[spans.length - 1] : null;
    },
    /**
     * Is this sentence PAINTED — in a real element whose rect lands in its
     * scroller — and does it SAY the things it must?
     *
     * ⚠ THE NEEDLES ARE MATCHED IN THE PAGE, AGAINST THE FULL innerText. The
     * 'text' field is a TRUNCATED PREVIEW for the console and must never be
     * what a row tests: a row looking for a phrase in the tail would go red
     * against a sentence that really is on screen.
     */
    paintedRect(needle, needles = []) {
      const hit = [...document.querySelectorAll('div,span')]
        .filter((e) => (e.innerText || '').includes(needle))
        .pop();
      if (!hit) return null;
      hit.scrollIntoView({ block: 'center' });
      const b = hit.getBoundingClientRect();
      let sc = hit.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      const sb = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      const full = (hit.innerText || '').trim().replace(/\s+/g, ' ');
      const has = {};
      for (const n of needles) has[n] = full.includes(n);
      return {
        tag: hit.tagName, w: b.width, h: b.height,
        inScroller: b.bottom > sb.top && b.top < sb.bottom && b.right > sb.left && b.left < sb.right,
        scroller: sc ? (sc.className || sc.tagName) : 'viewport',
        length: full.length,
        has,
        allPresent: needles.every((n) => full.includes(n)),
        full,
        text: full.slice(0, 300) + (full.length > 300 ? ' …[truncated for the console only]' : ''),
      };
    },
    focusSelect() { const s = this.el('rasterSelect'); if (!s) return 'absent'; s.focus(); return document.activeElement === s ? 'focused' : 'not-focused'; },
  };
  return 'ok';
})()`;

/**
 * DRIVE THE RASTER-PROGRAM SELECT, REAL GESTURE FIRST, AND SAY WHICH ONE WORKED.
 *
 * A real `ArrowDown` on the focused, CLOSED select is what an author's keyboard
 * does; it is tried first and, if the document moves to the channel asked for,
 * that is the gesture the row was driven by. Under Xvfb the popup is a
 * browser-process widget this harness cannot reach, so the fallback is the
 * native value setter plus a real `change` — React's own listener, the same
 * idiom every other select-driving harness here uses. Either way the RETURN
 * VALUE names the gesture and it is printed beside the row.
 *
 * ⚠ THE CHANNEL IS READ AS "IS THE KEY I ASKED FOR PRESENT", never as a
 * two-way test over the keys this file happens to know. A rig that asked
 * `after.ramp ? 'ramp' : 'bands'` is the same defect the panel had.
 */
async function convertChannel(c, want) {
  const focused = await c.evalExpr('window.__bs.focusSelect()');
  await arrowDown(c);
  await sleep(1000);
  const after = await doc(c);
  if (after && want in after) return `REAL ArrowDown on the focused <select> (focus: ${focused})`;
  await c.evalExpr(SET_SELECT(want));
  await sleep(1000);
  return `native value setter + real \`change\` event (focus: ${focused}; a real ArrowDown `
    + 'did NOT land on the wanted channel under Xvfb, so the popup-free path was used — see the '
    + 'header for why this is SETUP-class here and what [f0] covers instead)';
}

/** The probe preset's document, as the MODEL holds it. */
async function doc(c) {
  const all = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
  return all.find((p) => p.id === PRESET_ID) ?? null;
}

/**
 * BAND 0 of a base_swap document — the ONE place this file assumes a shape.
 *
 * ⚠ `base_swap` IS A LIST since empyrean `8f56c2c` (T3). It was one closed
 * `{line, target}` object, and eighteen rows in this file read `.base_swap.line`
 * / `.base_swap.target` directly. Every one of those reads would now be
 * `undefined` — and `undefined === undefined` is how a whole harness goes green
 * over a control that is not there. The reads go through here so a future shape
 * change breaks ONE function loudly instead of eighteen silently.
 *
 * It THROWS rather than returning null: a row that got `undefined` back would
 * compare two undefineds and pass.
 */
function band0(document) {
  const bands = document?.base_swap;
  if (!Array.isArray(bands) || bands.length === 0) {
    throw new Error(
      'the probe preset does not carry a base_swap LIST with at least one band (read: '
      + `${JSON.stringify(bands)}). Since empyrean 8f56c2c the key is an array, minItems 1; if it `
      + 'has changed shape again, fix this helper rather than letting every row below compare two '
      + 'undefineds and pass.',
    );
  }
  return bands[0];
}

/** `$E000` → 57344. The one piece of arithmetic this file does, on the app's own text. */
function hexOf(text) {
  const m = /\$([0-9A-Fa-f]+)/.exec(text ?? '');
  return m ? parseInt(m[1], 16) : null;
}

async function main() {
  assertFreshBuild(RUN);

  for (let i = 0; i < 60 && !(await portFree()); i++) {
    if (i === 0) note('port', `${PORT} still serving — waiting for a previous run to exit`);
    await sleep(1000);
  }
  if (!(await portFree())) throw new Error(`port ${PORT} still serves a CDP target after 60s`);

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
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('window.__dbg absent — needs a VITE_AURORA_DEBUG=1 build');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    if (!(await waitDbg())) throw new Error('window.__dbg absent after reload');

    console.log('\n=== BOOT: the real aeon project (READ-ONLY — no save is ever issued) ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => note('aeon open threw', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('b1', 'the aeon project is open, with sections', !!(st && st.open && st.sections > 0),
      JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');
    await sleep(1500);

    // ══════════════════════════════════════════════════════════════════════
    // FIXTURE — a bands preset of this run's own making
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== FIXTURE: a fresh BANDS preset, created through the panel ===');
    await c.evalExpr(CLICK_BY_TEXT('/^Effects$/'));
    await sleep(1500);
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1300);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Raster band presets\b/`,
      `document.querySelector('input[placeholder="new_preset_id"]')`));
    await sleep(900);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_preset_id"]')`, PRESET_ID));
    await sleep(400);
    await c.evalExpr(CLICK_BY_TEXT('/^New$/'));
    await sleep(1400);
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);
    await sleep(900);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Preset — ` + PRESET_ID + String.raw`(?![-a-z0-9_ ])/`,
      `[...document.querySelectorAll('button')].some(b => (b.textContent||'').trim() === 'Add raster band')`));
    await sleep(900);
    await c.evalExpr(INSTALL_HANDLES);

    const bandsDoc = await doc(c);
    const addPre = await readHandle(c, 'addBand');
    const selPre = await readHandle(c, 'rasterSelect');
    await shot(c, 'fixture-bands');
    check('f0', 'ANTI-VACUOUS FIXTURE: the probe preset exists and is a BANDS document of THIS '
      + 'run\'s making, the raster switch is on screen, and `Add raster band` is PRESENT, VISIBLE, '
      + 'IN ITS SCROLLER and ENABLED — every [dc] row below is about that chip going dead, so a '
      + 'chip that was already dead (or already off screen) would make them green for a reason '
      + 'that has nothing to do with the base swap. It is also the row that would catch this id '
      + 'colliding with a preset aeon ships, which is how the sibling harness lost 18 rows',
      !!bandsDoc && Array.isArray(bandsDoc.bands) && bandsDoc.bands.length >= 1
      && bandsDoc.base_swap === undefined && bandsDoc.ramp === undefined
      && !!addPre && addPre.disabled === false && addPre.visible === true && addPre.inScroller === true
      && !!selPre && selPre.value === 'bands',
      `document = ${JSON.stringify(bandsDoc)}; Add chip = ${JSON.stringify(addPre)}; raster select = `
      + `${JSON.stringify(selPre)}`);
    if (!bandsDoc || !addPre || addPre.disabled) {
      throw new Error('could not build a bands fixture with an ENABLED Add chip — every row below '
        + 'would be vacuous');
    }
    const BANDS_JSON = JSON.stringify(bandsDoc);

    // ══════════════════════════════════════════════════════════════════════
    // [f1] THE OPTION NO LONGER SAYS "not authorable here yet"
    // ══════════════════════════════════════════════════════════════════════
    const options = await c.json(String.raw`(() => {
      const el = window.__bs.el('rasterSelect');
      return el ? [...el.options].map((o) => ({ value: o.value, label: o.textContent })) : null;
    })()`);
    check('f1', 'THE SEAM THIS PARCEL FILLED, on screen: the dropdown offers `base_swap` and its '
      + 'label no longer carries "(not authorable here yet)" — the sentence that was the seam. '
      + 'Every option is offered as authorable',
      Array.isArray(options) && options.some((o) => o.value === 'base_swap')
      && options.every((o) => !/not authorable/.test(o.label)),
      `options = ${JSON.stringify(options)}`);

    // ══════════════════════════════════════════════════════════════════════
    // [cv] THE CONVERSION — destructive, and ONE Ctrl+Z
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [cv] the raster-program switch: bands → base_swap, and back in one undo ===');
    const advisory = await c.json(`window.__bs.paintedRect('switching DISCARDS', `
      + `['DISCARDS', 'ONE undo step', 'Ctrl+Z'])`);
    const gesture = await convertChannel(c, 'base_swap');
    const swapDoc = await doc(c);
    await shot(c, 'cv-converted');
    check('cv-0', 'the advisory NAMED WHAT WOULD BE DISCARDED before the gesture, painted under '
      + 'the control — `deletePresetRefusal`\'s ruling that a confirm asks "are you sure?" about a '
      + 'consequence the author cannot see. ⚠ AND IT PROMISES NO DESTINATION: it is painted before '
      + 'the author picks one, and it said "seeds a fresh ramp" until a third channel existed',
      !!advisory && advisory.inScroller === true && advisory.allPresent === true
      && !/fresh ramp|fresh base swap|fresh one-band/.test(advisory.full),
      `advisory = ${JSON.stringify(advisory && { ...advisory, full: undefined })}`);
    check('cv-a', 'the switch REALLY CONVERTED THE DOCUMENT — `base_swap` is present as a LIST whose first band carries every required key '
      + 'keys, and the `bands` key is GONE, not emptied. ⚠ THE CLAIM IS ABOUT THE DOCUMENT, read '
      + 'back through the model, not about a handler having run or a select showing a new label',
      !!swapDoc && swapDoc.base_swap !== undefined && !('bands' in swapDoc)
      && Array.isArray(swapDoc.base_swap) && swapDoc.base_swap.length >= 1
      && ['plane', 'line', 'target'].every((k) => k in swapDoc.base_swap[0]),
      `driven by: ${gesture}; document = ${JSON.stringify(swapDoc)} (was ${BANDS_JSON})`);
    check('cv-b', 'and it never authored the multi-key document the schema refuses — exactly one '
      + 'raster program at every instant',
      !!swapDoc && ['bands', 'ramp', 'base_swap'].filter((k) => k in swapDoc).length === 1,
      `keys = ${swapDoc ? JSON.stringify(Object.keys(swapDoc).sort()) : 'none'}`);

    // ⚠ THE BAR THIS CONTROL HAD TO CLEAR. One Ctrl+Z, and the bands come back
    // byte-identical — not "a bands document", the SAME one.
    await ctrlZ(c);
    await sleep(900);
    const undone = await doc(c);
    check('cv-z', '⚠ ONE Ctrl+Z RESTORES EXACTLY WHAT WAS THERE, byte for byte — the condition on '
      + 'building a destructive conversion at all (decision cards d-29/d-30). The comparison is a '
      + 'full JSON equality against the document as it stood BEFORE the switch, not a shape check',
      !!undone && JSON.stringify(undone) === BANDS_JSON,
      `before = ${BANDS_JSON}\n        after one undo = ${JSON.stringify(undone)}`);

    // Convert again for everything below.
    await c.evalExpr(INSTALL_HANDLES);
    note('[cv] re-converting for the rows below', await convertChannel(c, 'base_swap'));
    await c.evalExpr(INSTALL_HANDLES);
    const swap0 = await doc(c);
    if (!swap0 || swap0.base_swap === undefined) {
      throw new Error('the second conversion did not take — the rows below have no swap to measure');
    }
    note('[cv] the base swap under test', JSON.stringify(swap0.base_swap));

    // ⚠ AND THE OTHER DIRECTION, which is the half a one-way row would miss:
    // converting OUT of base_swap must restore the swap verbatim too.
    const SWAP_JSON = JSON.stringify(swap0);
    await c.evalExpr(INSTALL_HANDLES);
    const outGesture = await convertChannel(c, 'bands');
    const backToBands = await doc(c);
    await ctrlZ(c);
    await sleep(900);
    const swapBack = await doc(c);
    check('cv-y', '⚠ THE CONVERSION OUT IS ALSO ONE Ctrl+Z. base_swap → bands discards the swap, '
      + 'and one undo puts the SAME swap back — full JSON equality against the document before the '
      + 'switch. A parcel that measured only the way IN would ship a destructive control whose '
      + 'other direction nobody had pressed',
      !!backToBands && backToBands.base_swap === undefined && Array.isArray(backToBands.bands)
      && !!swapBack && JSON.stringify(swapBack) === SWAP_JSON,
      `driven by: ${outGesture}; after the switch out = ${JSON.stringify(backToBands)}\n`
      + `        before = ${SWAP_JSON}\n        after one undo = ${JSON.stringify(swapBack)}`);
    await c.evalExpr(INSTALL_HANDLES);
    if ((await doc(c)).base_swap === undefined) {
      note('[cv] restoring the swap for the rows below', await convertChannel(c, 'base_swap'));
      await c.evalExpr(INSTALL_HANDLES);
    }

    // ══════════════════════════════════════════════════════════════════════
    // [dc] THE DEAD BAND CONTROL — disabled AND carrying a sentence
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [dc] the band controls on a base_swap document ===');
    const addPost = await readHandle(c, 'addBand');
    const dcSentence = await c.json(`window.__bs.paintedRect('carries a base swap, not bands', `
      + `['carries a base swap, not bands', 'EXACTLY ONE raster program', 'no combinator', `
      + `'one undo step'])`);
    await shot(c, 'dc-dead-chip');
    check('dc-a', 'the `Add raster band` chip is DISABLED on a base_swap document',
      !!addPost && addPost.disabled === true,
      `chip = ${JSON.stringify(addPost)}`);
    check('dc-b', '⚠ AND IT CARRIES A SENTENCE, WHICH IS THE ROW THAT MATTERS — the refusal is '
      + 'PAINTED in a real element whose rect lands inside its own scroller (not merely present in '
      + 'the DOM, and not hover-only), and it SAYS THE THING: which document, the exactly-one-'
      + 'raster-program rule, and the way out. A row that asserted only the disabled flag would '
      + 'pass for a control that had greyed out for an unrelated reason — this repo has been '
      + 'bitten by that three times. ⚠ AND IT NAMES THE BASE SWAP: this predicate asked "is it '
      + 'ramp?" until 2026-09-03, and answered null here — the chip came back to LIFE on a '
      + 'document with no bands, every click a silent no-op',
      !!dcSentence && dcSentence.inScroller === true && dcSentence.w > 0 && dcSentence.h > 0
      && dcSentence.allPresent === true,
      `painted refusal = ${JSON.stringify({ ...dcSentence, full: undefined })}`);
    check('dc-c', 'the same sentence is on the chip\'s own title, so a pointer finds it too',
      !!addPost && typeof addPost.title === 'string'
      && addPost.title.includes('carries a base swap, not bands'),
      `chip title = ${JSON.stringify(addPost && addPost.title)}`);
    note('[dc] NO "I CLICKED THE DISABLED CHIP" ROW IS SHIPPED, and that is deliberate',
      'A disabled <button> fires no onClick, so "I pressed it and the document did not move" is '
      + 'green however the code behaves — the green-by-construction shape the nine-parcel refused '
      + 'for `Remove layer`. What an author can actually perceive is measured instead: the flag, '
      + 'the painted sentence, and the title.');

    // ══════════════════════════════════════════════════════════════════════
    // [as] THE TWO ASYMMETRIES WITH `ramp`, PAINTED
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [as] no capability gate, not DEBUG-gated — on screen, not in a docblock ===');
    const asym = await c.json(`window.__bs.paintedRect('capability gate', `
      + `['capability gate', 'DEBUG-gated', 'release ROM'])`);
    const asymTitle = await c.evalExpr(String.raw`(() => {
      const e = [...document.querySelectorAll('span')]
        .filter((s) => /capability gate/.test(s.textContent || '')).pop();
      return e ? (e.getAttribute('title') || '') : '';
    })()`);
    await shot(c, 'as-asymmetries');
    check('as-a', '⚠ BOTH ASYMMETRIES ARE PAINTED WHERE THE AUTHOR IS. A reader arriving from the '
      + 'ramp card carries CAP_DENSE_TIER and the DEBUG gate across and BOTH ARE WRONG here — and '
      + 'an assumed capability gate is exactly what a control parcel silently builds a disabled '
      + 'button around. Painted, in its scroller, not hover-only',
      !!asym && asym.inScroller === true && asym.w > 0 && asym.h > 0 && asym.allPresent === true,
      `painted = ${JSON.stringify({ ...asym, full: undefined })}`);
    check('as-b', 'and the CONTRACT\'S OWN wording is on the same element\'s title — the split: the '
      + 'author-length half painted, the schema\'s sentence (with its capability name and its ROM '
      + 'address) reachable on the same element rather than deleted',
      typeof asymTitle === 'string' && /CAP_DENSE_TIER/.test(asymTitle)
      && /DEBUG-gated/.test(asymTitle) && asymTitle.length > (asym ? asym.length : 0),
      `title (${asymTitle.length} chars) = ${JSON.stringify(asymTitle.slice(0, 220))}…`);

    // ══════════════════════════════════════════════════════════════════════
    // [hx] THE ADDRESS IS SHOWN AS AN ADDRESS
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [hx] the hex beside the box, and the contract\'s name on it ===');
    const hxDoc = await doc(c);
    const gloss = await c.evalExpr('window.__bs.targetGloss()');
    const summary = await c.json(`window.__bs.paintedRect('base register', `
      + `['re-pointed at']) `);
    await shot(c, 'hx-gloss');
    check('hx-a', '⚠ THE GLOSS BESIDE THE BOX IS THE SAME ADDRESS IN HEX, PARSED BACK AND COMPARED '
      + 'TO THE DOCUMENT — not a string this file recognises. An author meeting five decimal '
      + 'digits in a spinner has no way to know they are looking at a VRAM base at all',
      typeof gloss === 'string' && hexOf(gloss) === band0(hxDoc).target,
      `document target = ${band0(hxDoc).target}; gloss = ${JSON.stringify(gloss)}; the hex in it `
      + `parses to ${hexOf(gloss)}`);
    // ⚠ THIS ROW CHANGED SIDES AT `8f56c2c`, and the reason is worth reading
    // before "fixing" it back. It used to assert the contract's NAME for the
    // address was on screen (`VRAM_PLANE_B`), because `target`'s description
    // ended "targets 57344 ($E000, VRAM_PLANE_B)". The amendment rewrote that
    // description down to the range and the granule, so the contract names NO
    // authorable address any more — and the panel's rule has always been to name
    // nothing the contract does not. The correct on-screen behaviour is now to
    // SAY SO, and a VRAM_* name appearing here would mean the editor had started
    // inventing one.
    check('hx-b', '⚠ AND THE PANEL ADMITS IT CANNOT NAME THE ADDRESS. The contract stopped naming '
      + 'any VRAM base at empyrean 8f56c2c, so the gloss must say the contract names none rather '
      + 'than supplying a name Aurora would be making up — a wrong name on a VRAM base tells an '
      + 'author they are pointing a plane at a picture they are not',
      typeof gloss === 'string' && /names no VRAM base address/.test(gloss)
      && !/VRAM_[A-Z0-9_]+/.test(gloss),
      `gloss = ${JSON.stringify(gloss)}`);
    // ⚠ NOT `hexOf(summary.full)`, AND THE FIRST VERSION OF THIS ROW WAS. That
    // takes the FIRST `$` in the sentence, which is `$02` — the VDP register
    // number, not an address — so the row went red against a sentence that was
    // correct. The address is matched in its `$HEX (decimal)` pair form, the
    // same shape [gr-c] checks, so the two halves must agree with each other AND
    // with the document.
    const summaryPairs = summary
      ? [...summary.full.matchAll(/\$([0-9A-F]+) \((\d+)\)/g)]
        .map((m) => ({ hex: parseInt(m[1], 16), dec: Number(m[2]) }))
      : [];
    check('hx-c', 'the summary under the fields says what the swap DOES, in the document\'s own '
      + 'numbers — the line it fires on and the address in BOTH bases, agreeing with each other '
      + 'and with the document',
      !!summary && summary.inScroller === true && summary.allPresent === true
      && summary.full.includes(String(band0(hxDoc).line))
      && summaryPairs.some((p) => p.hex === p.dec && p.dec === band0(hxDoc).target),
      `document = ${JSON.stringify(hxDoc.base_swap)}; addresses in the summary = `
      + `${JSON.stringify(summaryPairs)}; summary = ${JSON.stringify(summary && summary.text)}`);

    // ══════════════════════════════════════════════════════════════════════
    // [gr] THE GRANULE — refused, neighbours named, nothing snapped
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [gr] an off-granule VRAM base: refused, named, and NOT snapped ===');
    const beforeGr = await doc(c);
    // ⚠ THE TYPED VALUE IS DERIVED FROM THE DOCUMENT, NOT FROM THE CONTRACT.
    // One less than a legal base is off-granule for ANY granule above 1, so this
    // row survives a re-vendor that changes the granule.
    const offGranule = band0(beforeGr).target - 1;
    await typeInto(c, 'target', String(offGranule), 'Target (one below a legal base)');
    const afterGr = await doc(c);
    const grSentence = await c.json(`window.__bs.paintedRect('granule', `
      + `['is not on the', 'DROPS the rest SILENTLY', 'NOT A RANGE ERROR', `
      + `'The nearest legal bases are', 'NOT snapped'])`);
    await shot(c, 'gr-refused');
    check('gr-a', '⚠ AN OFF-GRANULE BASE IS REFUSED AT TYPING TIME AND THE DOCUMENT DOES NOT MOVE '
      + '— the two halves in one condition, because a refusal that only paints is decoration and a '
      + 'silent withhold is the defect this parcel exists to remove. NOTHING SNAPPED: the target '
      + 'is byte-identical, not rounded to the nearest granule, which would have pointed the band\'s plane '
      + 'at a different picture without saying so',
      band0(afterGr).target === band0(beforeGr).target
      && !!grSentence && grSentence.inScroller === true && grSentence.allPresent === true,
      `target ${band0(beforeGr).target} → ${band0(afterGr).target} (unchanged=`
      + `${band0(afterGr).target === band0(beforeGr).target}); typed ${offGranule}; painted `
      + `refusal = ${JSON.stringify({ ...grSentence, full: undefined })}`);

    // THE NEIGHBOURS, READ OFF THE SCREEN AND CHECKED BY ARITHMETIC.
    const pair = grSentence
      ? [...grSentence.full.matchAll(/\$([0-9A-F]+) \((\d+)\)/g)].map((m) => ({
        hex: `$${m[1]}`, dec: Number(m[2]), agrees: parseInt(m[1], 16) === Number(m[2]),
      }))
      : [];
    const named = /The nearest legal bases are \$([0-9A-F]+) \((\d+)\) and \$([0-9A-F]+) \((\d+)\)/
      .exec(grSentence ? grSentence.full : '');
    const below = named ? Number(named[2]) : null;
    const above = named ? Number(named[4]) : null;
    const granule = /is not on the \$([0-9A-F]+) granule/.exec(grSentence ? grSentence.full : '');
    const granuleValue = granule ? parseInt(granule[1], 16) : null;
    check('gr-b', 'the refusal NAMES THE TWO LEGAL BASES either side, and they are the CLOSEST '
      + 'ones: they bracket the value that was typed, and the gap between them is exactly the '
      + 'granule the same sentence names. ⚠ EVERY NUMBER HERE IS READ OFF THE APP AND CHECKED BY '
      + 'ARITHMETIC — a rig that asserted 8192, or $C000 and $E000, would stay green through a '
      + 're-vendor that moved the granule',
      below !== null && above !== null && granuleValue !== null
      && below < offGranule && above > offGranule
      && above - below === granuleValue
      && below % granuleValue === 0 && above % granuleValue === 0,
      `sentence says: granule ${granule && granule[0]}, neighbours ${below} and ${above}; typed `
      + `${offGranule}; gap ${above !== null && below !== null ? above - below : 'n/a'} vs granule `
      + `${granuleValue}`);
    check('gr-c', 'and every address it prints agrees with itself in both bases — the hex and the '
      + 'decimal are the same number, so neither half of the pair can drift',
      pair.length >= 2 && pair.every((p) => p.agrees),
      `addresses printed = ${JSON.stringify(pair)}`);

    // ANTI-VACUOUS PARTNER: the same field DOES take a legal base.
    await typeInto(c, 'target', String(below), 'Target (the legal base below)');
    const afterLegal = await doc(c);
    check('gr-d', 'ANTI-VACUOUS: the very same box accepts the legal base the refusal offered, so '
      + '[gr-a] measured a REFUSAL and not a dead field',
      band0(afterLegal).target === below,
      `typed ${below} (offered by the refusal itself); target is now `
      + `${band0(afterLegal).target}`);
    const glossNow = await c.evalExpr('window.__bs.targetGloss()');
    check('gr-e', 'and the gloss beside the box FOLLOWED the new address — the hex tracks the '
      + 'document rather than being painted once',
      hexOf(glossNow) === band0(afterLegal).target,
      `gloss = ${JSON.stringify(glossNow)} for target ${band0(afterLegal).target}`);

    // ══════════════════════════════════════════════════════════════════════
    // [ln] THE FIRE LINE — and the range that is NOT the ramp's
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [ln] a fire line outside the engine\'s ensure ===');
    const beforeLn = await doc(c);
    // 9999 is not a contract number: it is an absurd screen line, larger than
    // any 224-line frame could hold whatever the schema says.
    await typeInto(c, 'line', '9999', 'Line (absurd)');
    const afterLn = await doc(c);
    const lnSentence = await c.json(`window.__bs.paintedRect('base_swap line:', `
      + `['is outside', 'frame-rewind interlock', 'NOT THE RAMP', 'line is still'])`);
    await shot(c, 'ln-refused');
    const lnRange = lnSentence
      ? /is outside (\d+)\.\.(\d+)/.exec(lnSentence.full) : null;
    const rampMax = lnSentence
      ? /ramp's top stops at (\d+)/.exec(lnSentence.full) : null;
    check('ln-a', 'a fire line outside the engine\'s own ensure is REFUSED at typing time and the '
      + 'document does not move',
      band0(afterLn).line === band0(beforeLn).line
      && !!lnSentence && lnSentence.inScroller === true && lnSentence.allPresent === true,
      `line ${band0(beforeLn).line} → ${band0(afterLn).line} (unchanged=`
      + `${band0(afterLn).line === band0(beforeLn).line}); painted refusal = `
      + `${JSON.stringify({ ...lnSentence, full: undefined })}`);
    check('ln-b', '⚠ AND IT STATES THE ASYMMETRY WITH THE RAMP rather than leaving the next reader '
      + 'to assume symmetry: a swap is one fire and reaches the last line before the rewind '
      + 'interlock, a ramp\'s run needs a line after it and stops one earlier. Both numbers are '
      + 'READ OFF THE SENTENCE and asserted to DIFFER — a rig carrying 223 and 222 would not '
      + 'notice if they ever converged',
      !!lnRange && !!rampMax && Number(rampMax[1]) === Number(lnRange[2]) - 1,
      `the sentence says base_swap line is ${lnRange && lnRange[0]} and the ramp's top stops at `
      + `${rampMax && rampMax[1]}`);
    // ANTI-VACUOUS PARTNER: the largest legal line, read off the app's sentence.
    const maxLine = lnRange ? Number(lnRange[2]) : null;
    await typeInto(c, 'line', String(maxLine), 'Line (the maximum the refusal named)');
    const afterMax = await doc(c);
    check('ln-c', 'ANTI-VACUOUS: the same box accepts the maximum the refusal itself named, so '
      + '[ln-a] measured a refusal and not a dead field',
      band0(afterMax).line === maxLine,
      `typed ${maxLine} (read off the app\'s own sentence); line is now ${band0(afterMax).line}`);

    // ══════════════════════════════════════════════════════════════════════
    // Leave the app as we found it — the probe preset was never saved, but the
    // history is walked back so a following run opens on the same document.
    // ⚠ THE UNDO NEEDS THE KEYBOARD OUT OF A TEXT BOX: `LevelWorkspace`'s
    // `isTypingTarget` deliberately does not steal Ctrl+Z from an input, so an
    // undo walk that begins with focus in a number field walks nowhere.
    // ══════════════════════════════════════════════════════════════════════
    await c.evalExpr("(() => { const a = document.activeElement; if (a && a.blur) a.blur(); })()");
    await sleep(200);
    for (let i = 0; i < 40 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(120);
      if ((await doc(c)) === null) break;
    }
    const left = await doc(c);
    check('z', 'the probe preset is walked back out of the model by the app\'s own history, so this '
      + 'run leaves nothing behind (and nothing was ever written to disk — no save is issued and '
      + 'the app has no autosave)',
      left === null,
      `probe preset after the undo walk = ${JSON.stringify(left)}`);

    console.log(`\n${'═'.repeat(75)}`);
    console.log(`RESULT  ${results.filter((r) => r.ok).length}/${results.length} rows passed`);
    if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
    console.log(`shots → ${SHOTS}`);
    console.log('═'.repeat(75));
  } finally {
    try { c && c.close(); } catch { /* closing */ }
    const { killTree } = await import('./lib/harness-guard.mjs');
    await killTree(child);
  }
  process.exitCode = fails.length ? 1 : 0;
}

main().catch(async (e) => {
  console.error(`\nHARNESS ERROR: ${e && e.message ? e.message : e}`);
  process.exitCode = 1;
});
