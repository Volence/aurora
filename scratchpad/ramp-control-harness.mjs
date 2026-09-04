#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// THE `ramp` AUTHORING CONTROL, IN THE REAL APP
//
// The node suite cannot see React, so ~3,400 rows pass there while a control is
// visibly dead. This drives the built app under CDP and measures the four things
// that only exist on a rendered surface:
//
//   [cv] the raster-program switch CONVERTS the document and is ONE Ctrl+Z
//   [dc] the band controls on a ramp document are DISABLED **and carry a
//        painted sentence** — the sentence is asserted, not just the flag
//   [sp] the `top + lines` span pair is refused AT AUTHOR TIME, with the
//        schema's own number, and the document does not move
//   [rt] an unrepresentable rate is refused, names what IS available, and
//        NOTHING SNAPS — plus the legal sibling that proves the field is live
//   [ns] the SIGN disclosure: a NEGATIVE value is disclosed as unbuildable (and
//        the refusal that RECOMMENDS `-1` says so beside its true arithmetic),
//        and on a POSITIVE document the sentence is GONE
//   [ds] the display readout shows the write span AND the screen span, one
//        line apart
//
// ═══ ⚠ NO ROW HERE MAY PASS VACUOUSLY ═════════════════════════════════════
//
// Every "it refused" row asserts the DOCUMENT is unchanged, read back through
// `window.__dbg.aeon.presetsJson()`, and every "it acted" row asserts the
// document really CHANGED — not that a handler ran, not that a class toggled.
// A control wired to nothing refuses everything for free.
//
// ⚠ AND NO EXPECTATION IS A LITERAL FROM THE CONTRACT. The span bound is READ
// OFF THE APP'S OWN REFUSAL SENTENCE and then checked against the arithmetic an
// author would do (it must be below the pair they typed and above the `top` they
// have); the display lag is checked as a DELTA between the two spans the readout
// paints, derived from the document's own `top`/`lines`. A rig that hardcoded
// 223, or `+ 1`, would stay green through a contract change that moved either —
// which is the retroactivity rule applied to an instrument.
//
// ═══ ⚠ THE DISABLED CHIP IS NOT MEASURED BY CLICKING IT ═══════════════════
//
// A disabled `<button>` fires no `onClick`, so "I clicked it and nothing
// happened" is green however the code behaves — the green-by-construction shape
// this repo has been bitten by. `[dc]` therefore measures what an author can
// actually see: the chip is disabled, AND the refusal is PAINTED (`innerText` of
// a real element whose rect lands inside its scroller), AND the sentence says
// the thing it must say. The click is a NOTE, not a row.
//
// ═══ ⚠ NOT `el.click()` — AND WHERE THAT RULE STOPS ═══════════════════════
//
// Every NUMBER is typed with `Input.insertText` into a box focused by a REAL
// mouse press at an integer client pixel, verified with `elementFromPoint`
// first — that is the whole subject of [sp] and [rt], and a synthetic `input`
// event there would prove nothing about what an author's keystrokes do.
//
// THE `<select>` IS DIFFERENT AND THE DIFFERENCE IS STATED RATHER THAN HIDDEN.
// `convertChannel` below TRIES a real `ArrowDown` on the focused element first
// and reports which gesture actually drove the change. A native select's popup
// is a browser-process widget that cannot be driven under Xvfb, so when the key
// does not move it the fallback is the native value setter plus `change` — the
// SAME idiom every other select-driving harness in this repo uses
// (`anchor-authoring`, `band-preset`, `bganim-band`, ...). That is a real
// `change` event through React's own listener, so it exercises the handler; what
// it does NOT exercise is reachability, and [f0] covers that separately by
// asserting the select is present, visible, INSIDE ITS SCROLLER and enabled
// before anything touches it. The gesture used is PRINTED on every run.
//
// The other synthetic events here are SETUP only — the facet pill, the sub-tab,
// the section headers and the panel's own `New`.
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
// Run:                     npm run harness:ramp-control
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9487);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = join(ROOT, 'scratchpad/shots-ramp-control');
mkdirSync(SHOTS, { recursive: true });

// ═══ THE DISPLAY GEOMETRY IS TWO NUMBERS AND THIS RUN TYPES NEITHER ═══
//
// ⚠ A .mjs HARNESS IMPORTS NOTHING FROM THE TYPESCRIPT, so it cannot read
// `EFFECTS_PRESET_RAMP_VSRAM_*` and a number typed here would sit stale through
// a contract change with nothing to notice — which is exactly what happened to
// the `=== 1` this replaced. So the harness parses the SAME vendored schema
// sentences the codec parses, with its own regexes, and refuses loudly if either
// moves. That makes this run a SECOND independent reading of the contract rather
// than a restatement of the module's parse.
//
// The two are different quantities and differ by exactly one because `j` STARTS
// AT 1 (the interpreter adds the step before it writes, so `start` is never
// emitted): value j displays on `top + j + INDEX_LAG`, and the FIRST value —
// index 1 — therefore displays on `top + FIRST_LINE_OFFSET`. A SPAN takes the
// offset; only a sentence quantifying over j takes the lag.
const { FIRST_LINE_OFFSET, INDEX_LAG } = (() => {
  const schema = JSON.parse(readFileSync(
    join(ROOT, 'src/core/formats/effects/aurora-effects-preset.schema.json'), 'utf8'));
  // ⚠ TWO DIFFERENT NODES: the per-index rule is in the KEY's paragraph
  // (`properties.ramp`), the first-line rule on the FIELD
  // (`$defs.ramp.properties.top`). Reading either from the other finds nothing.
  const rampProse = String(schema.properties.ramp.description ?? '');
  const topProse = String(schema.$defs.ramp.properties.top.description ?? '');
  const lagM = /value j \(= start \+ j\*step\) displays on screen line top \+ j \+ (\d+)/
    .exec(rampProse);
  const offM = /DISPLAYS on top \+ (\d+)/.exec(topProse);
  if (!lagM || !offM) {
    throw new Error(
      'ramp-control-harness: aurora-effects-preset.schema.json no longer states the ramp display '
      + 'geometry in the shape this run reads it from (per-index sentence '
      + `${lagM ? 'found' : 'MISSING'}, top sentence ${offM ? 'found' : 'MISSING'}). Re-read the `
      + 'schema and update the derivation — do NOT hardcode either number.');
  }
  const lag = Number(lagM[1]);
  const off = Number(offM[1]);
  if (off !== lag + 1) {
    throw new Error(
      `ramp-control-harness: the schema's two ramp display sentences no longer agree — per-index `
      + `lag ${lag} puts the first value (j = 1) on top + ${lag + 1}, but the top sentence says `
      + `top + ${off}. One of them moved, or j no longer starts at 1. Re-read both.`);
  }
  return { FIRST_LINE_OFFSET: off, INDEX_LAG: lag };
})();

// ⚠ THIS ID MUST NOT COLLIDE WITH A PRESET AEON SHIPS, and it did.
//
// This harness opens aeon's LIVE checkout read-only and creates its fixture
// THROUGH THE PANEL, so its probe id shares a namespace with every preset aeon
// commits. `ramp_probe` was this file's id from 2026-09-03 — and hours later
// aeon landed a REAL `ramp_probe.json` (their `15c15340`, item 6 step 4, tracked
// in their git). From then on `New` did not make a fresh document: the panel
// selected AEON'S ramp preset, and the fixture that promises "a fresh BANDS
// preset" handed every row below a ramp.
//
// Caught by `[f0]`, which asserts the fixture IS a bands document with an
// ENABLED chip before any row reads anything — the anti-vacuous row refusing to
// let 18 rows measure somebody else's file. Without it this harness would have
// edited aeon's committed preset in the model and reported confidently on it.
//
// The prefix is the fix: an id no other repo would author. Do not shorten it.
const PRESET_ID = 'aurora_local_rampctl_probe';

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
  const el = window.__rp.el(${JSON.stringify(handle)});
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
    const want = window.__rp.el(${JSON.stringify(handle)});
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
 * ⚠ NOT the native-value-setter trick. That is fine for SETUP, and it is exactly
 * wrong for the subject of a row about what happens when an author types.
 */
async function typeInto(c, handle, text, label) {
  // ⚠ DROP THE FOCUS FIRST, AND THIS IS NOT COSMETIC. Clicking a box that is
  // ALREADY focused fires no `focus` event, so `NumberField`'s own
  // select-on-focus never runs and `Input.insertText` INSERTS at the caret
  // instead of replacing — "200" then "159" becomes "200159", which is refused
  // for a reason that has nothing to do with the row. Measured: it turned three
  // rows red on the first run of this harness. Blurring makes the press a real
  // focus change, which is what an author's click on a different field is.
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
  const el = window.__rp.el('rasterSelect');
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
 * ⚠ EVERY FIELD IS ADDRESSED BY ITS OWN LABEL, never by position. `Top`,
 * `Lines`, `addr`, `Start` and `Step` are five near-identical spinners inside one
 * card — the near-identical-control hazard this repo names by name — so each is
 * resolved by walking the `Field` row whose label span reads exactly that word.
 * A row that addressed "the second NumberField" would silently measure its
 * neighbour the first time the card's order changed.
 */
const INSTALL_HANDLES = String.raw`
(() => {
  const rowFor = (label) => [...document.querySelectorAll('span')]
    .filter((s) => (s.textContent || '').trim() === label && s.parentElement)
    .map((s) => s.parentElement)
    .find((row) => row.querySelector('input, select')) || null;
  const fieldInput = (label) => { const r = rowFor(label); return r ? r.querySelector('input') : null; };
  window.__rp = {
    el(h) {
      if (h === 'rasterSelect') { const r = rowFor('Raster'); return r ? r.querySelector('select') : null; }
      if (h === 'top') return fieldInput('Top');
      if (h === 'lines') return fieldInput('Lines');
      if (h === 'addr') return fieldInput('addr');
      if (h === 'start') return fieldInput('Start');
      if (h === 'step') return fieldInput('Step');
      if (h === 'addBand') return [...document.querySelectorAll('button')]
        .find((b) => /^Add raster band$/.test((b.textContent || '').trim())) || null;
      return null;
    },
    /** Every visible text node in the panel column, for a PAINTED-sentence row. */
    painted() {
      return [...document.querySelectorAll('div,span')]
        .filter((e) => e.children.length === 0 || e.childElementCount === 0)
        .map((e) => (e.innerText || e.textContent || '').trim())
        .filter((t) => t.length > 0);
    },
    /**
     * Is this sentence PAINTED — in a real element whose rect lands in its
     * scroller — and does it SAY the things it must?
     *
     * ⚠ THE NEEDLES ARE MATCHED IN THE PAGE, AGAINST THE FULL innerText. The
     * 'text' field below is a TRUNCATED PREVIEW for the console and must never
     * be what a row tests: the first version of this returned 400 characters and
     * a row looking for a phrase in the tail went red against a sentence that
     * really was on screen. Print a slice, assert on the whole.
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
        text: full.slice(0, 260) + (full.length > 260 ? ' …[truncated for the console only]' : ''),
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
 * does; it is tried first and, if the document moves, that is the gesture the
 * row was driven by. Under Xvfb the select's popup is a browser-process widget
 * this harness cannot reach, so the fallback is the native value setter plus a
 * real `change` — React's own listener, the same idiom every other
 * select-driving harness here uses. Either way the RETURN VALUE names the
 * gesture and it is printed beside the row, so nobody has to guess which one
 * this run measured.
 */
async function convertChannel(c, want) {
  const focused = await c.evalExpr('window.__rp.focusSelect()');
  await arrowDown(c);
  await sleep(1000);
  const after = await doc(c);
  const got = after && (after.ramp !== undefined ? 'ramp' : 'bands');
  if (got === want) return `REAL ArrowDown on the focused <select> (focus: ${focused})`;
  await c.evalExpr(SET_SELECT(want));
  await sleep(1000);
  return `native value setter + real \`change\` event (focus: ${focused}; a real ArrowDown `
    + 'did NOT move a closed <select> under Xvfb, so the popup-free path was used — see the '
    + 'header for why this is SETUP-class here and what [f0] covers instead)';
}

/** The probe preset's document, as the MODEL holds it. */
async function doc(c) {
  const all = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
  return all.find((p) => p.id === PRESET_ID) ?? null;
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
    check('f0', 'ANTI-VACUOUS FIXTURE: the probe preset exists and is a BANDS document, the raster '
      + 'switch is on screen, and `Add raster band` is PRESENT, VISIBLE, IN ITS SCROLLER and '
      + 'ENABLED — every [dc] row below is about that chip going dead, so a chip that was already '
      + 'dead (or already off screen) would make them green for a reason that has nothing to do '
      + 'with the ramp',
      !!bandsDoc && Array.isArray(bandsDoc.bands) && bandsDoc.bands.length >= 1
      && bandsDoc.ramp === undefined
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
    // [cv] THE CONVERSION — destructive, and ONE Ctrl+Z
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [cv] the raster-program switch: bands → ramp, and back in one undo ===');
    const gesture = await convertChannel(c, 'ramp');
    const rampDoc = await doc(c);
    await shot(c, 'cv-converted');
    check('cv-a', 'the switch REALLY CONVERTED THE DOCUMENT — `ramp` is present with all five keys, '
      + 'and the `bands` key is GONE, not emptied. ⚠ THE CLAIM IS ABOUT THE DOCUMENT, read back '
      + 'through the model, not about a handler having run or a select showing a new label',
      !!rampDoc && rampDoc.ramp !== undefined && !('bands' in rampDoc)
      && ['top', 'lines', 'target', 'start', 'step'].every((k) => k in rampDoc.ramp),
      `driven by: ${gesture}; document = ${JSON.stringify(rampDoc)} (was ${BANDS_JSON})`);
    check('cv-b', 'and it never authored the BOTH-KEYS document the schema refuses — exactly one '
      + 'raster program at every instant',
      !!rampDoc && ['bands', 'ramp'].filter((k) => k in rampDoc).length === 1,
      `keys = ${rampDoc ? JSON.stringify(Object.keys(rampDoc).sort()) : 'none'}`);

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
    note('[cv] re-converting for the rows below', await convertChannel(c, 'ramp'));
    await c.evalExpr(INSTALL_HANDLES);
    const ramp0 = await doc(c);
    if (!ramp0 || ramp0.ramp === undefined) {
      throw new Error('the second conversion did not take — the rows below have no ramp to measure');
    }
    note('[cv] the ramp under test', JSON.stringify(ramp0.ramp));

    // ══════════════════════════════════════════════════════════════════════
    // [dc] THE DEAD BAND CONTROL — disabled AND carrying a sentence
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [dc] the band controls on a ramp document ===');
    const addPost = await readHandle(c, 'addBand');
    const sentence = await c.json(`window.__rp.paintedRect('carries a ramp, not bands', `
      + `['carries a ramp, not bands', 'EXACTLY ONE raster program', 'no combinator', `
      + `'one undo step'])`);
    await shot(c, 'dc-dead-chip');
    check('dc-a', 'the `Add raster band` chip is DISABLED on a ramp document',
      !!addPost && addPost.disabled === true,
      `chip = ${JSON.stringify(addPost)}`);
    check('dc-b', '⚠ AND IT CARRIES A SENTENCE, WHICH IS THE ROW THAT MATTERS — the refusal is '
      + 'PAINTED in a real element whose rect lands inside its own scroller (not merely present in '
      + 'the DOM, and not hover-only), and it SAYS THE THING: which document, the exactly-one-'
      + 'raster-program rule, and the way out. A row that asserted only the disabled flag would pass '
      + 'for a control that had greyed out for an unrelated reason — this repo has been bitten by '
      + 'that three times',
      !!sentence && sentence.inScroller === true && sentence.w > 0 && sentence.h > 0
      && sentence.allPresent === true,
      `painted refusal = ${JSON.stringify(sentence)}`);
    check('dc-c', 'the same sentence is on the chip\'s own title, so a pointer finds it too',
      !!addPost && typeof addPost.title === 'string'
      && addPost.title.includes('carries a ramp, not bands'),
      `chip title = ${JSON.stringify(addPost && addPost.title)}`);
    note('[dc] NO "I CLICKED THE DISABLED CHIP" ROW IS SHIPPED, and that is deliberate',
      'A disabled <button> fires no onClick, so "I pressed it and the document did not move" is '
      + 'green however the code behaves — the green-by-construction shape the nine-parcel refused '
      + 'for `Remove layer`. What an author can actually perceive is measured instead: the flag, '
      + 'the painted sentence, and the title.');

    // ══════════════════════════════════════════════════════════════════════
    // [sp] THE SPAN PAIR — refused at author time, with the schema's number
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [sp] the top + lines pair, refused at the control ===');
    const before = await doc(c);
    const want = before.ramp.top + 200;      // top 64 + lines 200 = 264, over the bound
    await typeInto(c, 'lines', '200', 'Lines');
    const afterSpan = await doc(c);
    const spanSentence = await c.json(`window.__rp.paintedRect('ramp lines:', `
      + `['top + lines must be at most', 'THE PER-FIELD MAXIMA ARE NOT', 'the largest top is'])`);
    const spanBound = await c.evalExpr(String.raw`(() => {
      const m = /top \+ lines must be at most (\d+)/.exec(
        (document.body.innerText || ''));
      return m ? Number(m[1]) : null;
    })()`);
    await shot(c, 'sp-refused');
    check('sp-a', 'a `lines` that makes top + lines exceed the interlock is REFUSED AT TYPING TIME '
      + 'and the DOCUMENT DOES NOT MOVE — the two halves in one condition, because a refusal that '
      + 'only paints is decoration and a silent withhold is the defect this parcel exists to remove',
      afterSpan.ramp.lines === before.ramp.lines
      && !!spanSentence && spanSentence.inScroller === true && spanSentence.allPresent === true,
      `lines ${before.ramp.lines} → ${afterSpan.ramp.lines} (unchanged=`
      + `${afterSpan.ramp.lines === before.ramp.lines}); typed 200 against top ${before.ramp.top}, `
      + `which would have spanned to ${want}; painted refusal = ${JSON.stringify(spanSentence)}`);
    check('sp-b', 'the refusal carries the SCHEMA\'S OWN number for the bound — read off the screen '
      + 'and checked against the arithmetic the author would do, so a retyped or drifted constant '
      + 'shows up here',
      spanBound !== null && spanBound < want && spanBound > before.ramp.top,
      `the sentence on screen says the bound is ${spanBound}; the typed pair spans to ${want}. `
      + '⚠ The number is READ FROM THE APP, never asserted against a literal in this file — the '
      + 'constant is derived from the contract\'s prose and a hardcoded 223 here would survive a '
      + 'contract change that moved it.');
    // ANTI-VACUOUS PARTNER: the same field DOES take a value that fits.
    const fits = spanBound - before.ramp.top;
    await typeInto(c, 'lines', String(fits), 'Lines (a value that fits)');
    const afterFits = await doc(c);
    check('sp-c', 'ANTI-VACUOUS: the very same field accepts the largest value the pair admits, so '
      + '[sp-a] measured a REFUSAL and not a dead box',
      afterFits.ramp.lines === fits,
      `typed ${fits} (= ${spanBound} - top ${before.ramp.top}); lines is now ${afterFits.ramp.lines}`);

    // ══════════════════════════════════════════════════════════════════════
    // [rt] THE RATE THAT CANNOT BE TYPED
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [rt] -0.5 has no spelling: refused, named, and NOT snapped ===');
    const beforeRate = await doc(c);
    await typeInto(c, 'step', '-0.5', 'Step');
    const afterRate = await doc(c);
    const rateSentence = await c.json(`window.__rp.paintedRect('HAS NO SPELLING', `
      + `['HAS NO SPELLING', 'The nearest rates you CAN have are -1 and 0', `
      + `'not rounded to either', 'frac256 is a MAGNITUDE'])`);
    await shot(c, 'rt-refused');
    check('rt-a', '⚠ -0.5 IS REFUSED AND NOTHING SNAPPED: the document\'s `step` is BYTE-IDENTICAL '
      + 'to what it was — not rounded to 0, not rounded to -1, not written as {whole: 0, frac256: '
      + '128} (which would be +0.5 and is the sign bug this encoding invites)',
      JSON.stringify(afterRate.ramp.step) === JSON.stringify(beforeRate.ramp.step),
      `step ${JSON.stringify(beforeRate.ramp.step)} → ${JSON.stringify(afterRate.ramp.step)}`);
    check('rt-b', 'and the refusal NAMES WHAT THE AUTHOR CAN HAVE — the two nearest representable '
      + 'rates — rather than only saying no. A refusal without them sends the author hunting for a '
      + 'nearby value that does not exist either, because the whole interval between -1 and 0 is '
      + 'unreachable in this encoding',
      !!rateSentence && rateSentence.inScroller === true && rateSentence.allPresent === true,
      `painted refusal = ${JSON.stringify(rateSentence)}`);
    // ANTI-VACUOUS PARTNER, and it is also the SIGN RULE on screen.
    await typeInto(c, 'step', '-1.5', 'Step (a rate that DOES have a spelling)');
    const afterLegal = await doc(c);
    check('rt-c', 'ANTI-VACUOUS, and the sign rule end to end: -1.5 IS representable and lands as '
      + '{whole: -1, frac256: 128} — the frac is a MAGNITUDE and the sign is the whole part\'s, so '
      + 'the naive reading of that pair (-0.5) is a whole pixel out with both numbers still in '
      + 'range. Typed in the real box, read back out of the real document',
      !!afterLegal.ramp.step && afterLegal.ramp.step.whole === -1
      && afterLegal.ramp.step.frac256 === 128,
      `step is now ${JSON.stringify(afterLegal.ramp.step)} after typing -1.5`);

    // ══════════════════════════════════════════════════════════════════════
    // [ns] THE SIGN: a NEGATIVE value does not reach the game, a POSITIVE
    //      one does — and the panel must say EXACTLY that much
    //
    // ⚠ THE ROW ABOVE ([rt-c]) IS THE REASON THIS BLOCK EXISTS. `-1.5` is
    // representable, the codec writes it, the document is well-formed, the
    // schema accepts it, and aeon's GENERATOR accepts it — and the ROM still
    // does not build, because `raster_ramp_program` declares `rrp_start` /
    // `rrp_step` as `u32` and forwards the signed value RAW. So [rt-c] is a
    // green row about a document that cannot ship, and nothing above it says so.
    //
    // AND THE SCOPE IS THE HARD PART. "ramp does not reach the game" RETIRED
    // earlier the same day and re-arming it would be a false warning. A POSITIVE
    // ramp builds and runs, so [ns-d] drives the surface to a positive document
    // and requires the sentence to be GONE. Presence without absence would pass
    // on a leaf that always speaks.
    //
    // The needles are the exported constants' own words
    // (core/formats/effects/ramp-sign-lag.ts: RAMP_SIGN_LAG_LEAD,
    // RAMP_SIGN_CAVEAT_LEAD); `ramp-sign-lag-disclosure.test.ts` pins THIS FILE's
    // copies against those constants, so a re-word cannot leave this rig green
    // against words the app no longer paints.
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [ns] the SIGN: negative does not build, positive does ===');
    const NS_LEAD = 'A NEGATIVE value here does not reach the game.';
    const NS_CAVEAT = 'A NEGATIVE ONE WILL NOT BUILD TODAY';

    // ── [ns-a] the refusal that RECOMMENDED -1 now says -1 will not build ──
    const beforeCav = await doc(c);
    await typeInto(c, 'step', '-0.5', 'Step (the unrepresentable rate, again)');
    const afterCav = await doc(c);
    // ⚠ THE NEEDLES ARE BUILT AS DATA AND `JSON.stringify`d IN, never spliced as
    // escaped source. A needle written `'\`step\`...'` inside a template literal
    // reaches the page correctly and leaves BACKSLASHES in this file, so the
    // node-side row that pins these copies against the exported constants can
    // no longer find them — measured, not imagined.
    const NS_CAVEAT_NEEDLES = ['The nearest rates you CAN have are -1 and 0', NS_CAVEAT,
      'does not fit u32', 'still the nearest value this ENCODING can spell'];
    const caveatSentence = await c.json('window.__rp.paintedRect(\'HAS NO SPELLING\', '
      + `${JSON.stringify(NS_CAVEAT_NEEDLES)})`);
    await shot(c, 'ns-caveat');
    check('ns-a', '⚠ THE REFUSAL STILL NAMES -1 AND 0 — THE ARITHMETIC IS NOT CORRUPTED — AND IT '
      + 'NOW SAYS -1 WILL NOT BUILD. A refusal that names a nearest-representable alternative '
      + 'carries the authority of a fix: the author types -0.5, is told to use -1, and THAT '
      + 'document fails at emission. The neighbours are a true fact about the ENCODING and are '
      + 'left alone; the build limitation rides beside them. And the document did not move',
      !!caveatSentence && caveatSentence.inScroller === true && caveatSentence.allPresent === true
      && JSON.stringify(afterCav.ramp.step) === JSON.stringify(beforeCav.ramp.step),
      `painted refusal = ${JSON.stringify(caveatSentence)}; step `
      + `${JSON.stringify(beforeCav.ramp.step)} → ${JSON.stringify(afterCav.ramp.step)} `
      + `(unchanged=${JSON.stringify(afterCav.ramp.step) === JSON.stringify(beforeCav.ramp.step)})`);

    // ── [ns-b] a representable NEGATIVE: the document MOVES and speaks ────
    await typeInto(c, 'start', '0', 'Start (positive, so only `step` is named)');
    await typeInto(c, 'step', '-1.5', 'Step (a representable NEGATIVE)');
    const negDoc = await doc(c);
    // ⚠ THE SEARCH NEEDLE IS FROM THE BODY, NOT THE LEAD, AND THAT IS LOAD-
    // BEARING. `paintedRect` takes the LAST `div,span` whose innerText contains
    // the needle — the innermost one. The leaf paints its lead in its own
    // `<span>` for emphasis and the rest as a sibling TEXT NODE, so searching by
    // the lead lands on that 46-character span and every body needle reports
    // false against a sentence that is fully on screen. Measured on the first
    // run of this row. Searching by a phrase that appears ONLY in the body
    // resolves to the containing Hint, whose innerText is the whole sentence —
    // lead included, which is why the lead stays in the needle list.
    const NS_NEG_NEEDLES = [NS_LEAD, '`step` (px per scanline) is negative',
      'raster_ramp_program', 'u32', 'A POSITIVE value in the same field builds and runs today',
      'this is about the sign, not about `ramp`'];
    const negSentence = await c.json('window.__rp.paintedRect(\'raster_ramp_program\', '
      + `${JSON.stringify(NS_NEG_NEEDLES)})`);
    await shot(c, 'ns-negative');
    check('ns-b', '⚠ A REPRESENTABLE NEGATIVE LANDS IN THE DOCUMENT AND THE PANEL DISCLOSES IT. '
      + 'The two halves in one condition: `step` really is {whole: -1, frac256: 128} in the model '
      + '(so this is not a refusal that withheld the edit) AND the sentence is painted, names the '
      + 'field, names the mechanism, and says in as many words that a POSITIVE value in the same '
      + 'box builds — the scope that keeps this from re-arming the `ramp` claim that retired',
      !!negDoc.ramp.step && negDoc.ramp.step.whole === -1 && negDoc.ramp.step.frac256 === 128
      && !!negSentence && negSentence.inScroller === true && negSentence.allPresent === true,
      `step = ${JSON.stringify(negDoc.ramp.step)}; start = ${JSON.stringify(negDoc.ramp.start)}; `
      + `painted disclosure = ${JSON.stringify(negSentence)}`);

    // ── [ns-c] `start` is the same u32 and the same raw forward ──────────
    await typeInto(c, 'start', '-2', 'Start (also NEGATIVE)');
    const bothDoc = await doc(c);
    const NS_BOTH_NEEDLES = [NS_LEAD, '`start` (px) and `step` (px per scanline) are negative'];
    const bothSentence = await c.json('window.__rp.paintedRect(\'raster_ramp_program\', '
      + `${JSON.stringify(NS_BOTH_NEEDLES)})`);
    await shot(c, 'ns-both');
    check('ns-c', '`start` is disclosed too, and the sentence names BOTH — `rrp_start` is the same '
      + '`u32` and the same raw forward as `rrp_step`, so a run that merely BEGINS below the rest '
      + 'position is as unbuildable as one that ramps upward. A disclosure scoped to `step` alone '
      + 'would leave the other half silent',
      !!bothDoc.ramp.start && bothDoc.ramp.start.whole === -2
      && !!bothSentence && bothSentence.inScroller === true && bothSentence.allPresent === true,
      `start = ${JSON.stringify(bothDoc.ramp.start)}; painted = ${JSON.stringify(bothSentence)}`);

    // ── [ns-d] THE OTHER DIRECTION: positive, and the sentence is GONE ────
    await typeInto(c, 'start', '0', 'Start (back to a positive document)');
    await typeInto(c, 'step', '1.5', 'Step (POSITIVE — this one builds)');
    const posDoc = await doc(c);
    // BOTH ENDS OF THE SENTENCE, because the lead lives in its own span and the
    // body in a sibling text node — a check on one alone could go null while the
    // other was still painted. Neither phrase appears anywhere else on the
    // surface (the rate refusal's caveat shares the MECHANISM words, not these).
    const stillThere = await c.json(`window.__rp.paintedRect(${JSON.stringify(NS_LEAD)})`);
    const stillBody = await c.json('window.__rp.paintedRect('
      + `${JSON.stringify('A POSITIVE value in the same field builds and runs today')})`);
    await shot(c, 'ns-positive');
    check('ns-d', '⚠ AND ON A POSITIVE DOCUMENT THE SENTENCE IS GONE. This is the direction the '
      + 'parcel exists for: "ramp does not reach the game" RETIRED earlier the same day, and a '
      + 'disclosure that spoke on every ramp would be a FALSE WARNING — the same defect as the '
      + 'recommendation that opened this row, wearing the other hat. The document really is '
      + 'positive (so the surface was driven, not merely left alone) and nothing on screen says a '
      + 'negative word',
      !!posDoc.ramp.step && posDoc.ramp.step.whole === 1 && posDoc.ramp.step.frac256 === 128
      && !!posDoc.ramp.start && posDoc.ramp.start.whole === 0 && posDoc.ramp.start.frac256 === 0
      && stillThere === null && stillBody === null,
      `start = ${JSON.stringify(posDoc.ramp.start)}, step = ${JSON.stringify(posDoc.ramp.step)}; `
      + `paintedRect(lead) = ${JSON.stringify(stillThere)}, paintedRect(body) = `
      + `${JSON.stringify(stillBody)} (both must be null)`);

    // ══════════════════════════════════════════════════════════════════════
    // [ds] THE DISPLAY READOUT
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [ds] the display readout: the write span AND the screen span ===');
    const dsDoc = await doc(c);
    const readout = await c.json(`window.__rp.paintedRect('shows on screen lines')`);
    await shot(c, 'ds-readout');
    const wTop = dsDoc.ramp.top;
    const wBot = dsDoc.ramp.top + dsDoc.ramp.lines - 1;
    const shown = readout ? /shows on screen lines (\d+)-(\d+)/.exec(readout.text) : null;
    const wrote = readout ? /writes on lines (\d+)-(\d+)/.exec(readout.text) : null;
    check('ds-a', 'the readout paints BOTH spans, and the numbers agree with the DOCUMENT — the '
      + 'write span is the document\'s own `top`..`top + lines - 1`',
      !!wrote && Number(wrote[1]) === wTop && Number(wrote[2]) === wBot,
      `document top=${wTop} lines=${dsDoc.ramp.lines} (write span ${wTop}-${wBot}); readout = `
      + `${JSON.stringify(readout)}`);
    check('ds-b', `⚠ AND THE SCREEN SPAN IS EXACTLY ${FIRST_LINE_OFFSET} LINE(S) LATER, at BOTH `
      + 'ends. This is the judgement made visible: the Top field and the file are in the ENGINE\'s '
      + 'numbers, and this readout — the only screen-line claim on the surface — adds the offset. '
      + 'No stage of the engine path compensates (engine lane, 2026-09-03), so a readout that did '
      + 'not add it would be one line high everywhere AND WOULD LOOK CORRECT. ⚠ THE EXPECTED DELTA '
      + 'IS THE FIRST-LINE OFFSET AND NOT THE PER-INDEX LAG — they are different quantities that '
      + `differ by one (j starts at 1), and this run PARSED both out of the vendored schema: `
      + `offset ${FIRST_LINE_OFFSET} from the top sentence, per-index lag ${INDEX_LAG} from the `
      + 'ramp description. Neither number is typed here',
      !!shown && !!wrote
      && Number(shown[1]) - Number(wrote[1]) === FIRST_LINE_OFFSET
      && Number(shown[2]) - Number(wrote[2]) === FIRST_LINE_OFFSET,
      `writes ${wrote && wrote[0]} · ${shown && shown[0]} · delta at first=`
      + `${shown && wrote ? Number(shown[1]) - Number(wrote[1]) : 'n/a'} at last=`
      + `${shown && wrote ? Number(shown[2]) - Number(wrote[2]) : 'n/a'} · expected `
      + `${FIRST_LINE_OFFSET} (schema-derived)`);
    check('ds-c', 'the reason is reachable on the readout itself, not only in a docblock',
      !!readout && (await c.evalExpr(String.raw`(() => {
        const e = [...document.querySelectorAll('span')]
          .filter((s) => /shows on screen lines/.test(s.textContent || '')).pop();
        return !!(e && (e.getAttribute('title') || '').includes('N+1 VSRAM latency'));
      })()`)) === true,
      'the readout\'s own `title` carries RAMP_DISPLAY_LAG_NOTE, which states the latency and that '
      + 'no stage of the engine path compensates.');

    // ══════════════════════════════════════════════════════════════════════
    // WITNESS MODE — `RAMP_WITNESS_OUT=<path>` authors the document aeon's
    // end-to-end proof runs against, THROUGH THE PANEL, and writes it out.
    //
    // WHY THIS LIVES HERE rather than in a throwaway script: the whole value of
    // the witness is that the document was AUTHORED, not hand-written — a
    // hand-written fixture proves the generator, a panel-authored one proves
    // the product. That claim is only as good as its reproducibility, so the
    // authoring path is committed and anyone can regenerate the file.
    //
    // THE SPAN IS DERIVED, NOT CHOSEN: `{top: 3, lines: 220}` is the longest
    // legal run that also ends EXACTLY on the span bound — `lines` at its
    // maximum and `top + lines === EFFECTS_PRESET_RAMP_SPAN_MAX`. ⚠ WHERE IT
    // DISPLAYS WAS RESTATED ON 2026-09-03 (empyrean `e9409dc`) and the old note
    // here said 4..223: it displays on 5..224, so its LAST value lands one past
    // the bottom of a 224-line screen and only 219 of the 220 lines can be seen.
    // That is the contract's own arithmetic, and it is still the right subject
    // for a witness — a display-offset error falls off the end of the screen
    // instead of shifting subtly. `step` is -1.5, the
    // schema's own worked example, so the ROM proves the SIGN RULE end to end
    // and not merely the plumbing; `addr` 2 is plane B full-width, measured by
    // the engine lane (VSCR 0 at the probe point) rather than chosen.
    // ══════════════════════════════════════════════════════════════════════
    if (process.env.RAMP_WITNESS_OUT) {
      console.log('\n=== WITNESS MODE: authoring aeon\'s subject through the panel ===');
      const TYPED = [['top', '3'], ['lines', '220'], ['addr', '2'],
                     ['start', '0'], ['step', '-1.5']];
      for (const [h, v] of TYPED) await typeInto(c, h, v, `${h} (witness)`);
      const w = await doc(c);
      if (!w || !w.ramp) throw new Error('witness: no ramp document to write');
      writeFileSync(process.env.RAMP_WITNESS_OUT, JSON.stringify(w, null, 2) + '\n');
      console.log('WITNESS WRITTEN → ' + process.env.RAMP_WITNESS_OUT);
      console.log('  TYPED BY HAND, in the panel: '
        + TYPED.map(([h, v]) => `${h}=${v}`).join(', '));
      console.log('  DERIVED BY THE CODEC, not typed: '
        + `start=${JSON.stringify(w.ramp.start)} step=${JSON.stringify(w.ramp.step)} `
        + `target=${JSON.stringify(w.ramp.target)}`);
      console.log('  write span (ENGINE lines, what the file says): '
        + `${w.ramp.top}..${w.ramp.top + w.ramp.lines - 1}`);
      console.log(`  display span (SCREEN lines, +${FIRST_LINE_OFFSET} — schema-derived, NOT `
        + 'typed): '
        + `${w.ramp.top + FIRST_LINE_OFFSET}..`
        + `${w.ramp.top + w.ramp.lines - 1 + FIRST_LINE_OFFSET}`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // Leave the app as we found it — the probe preset was never saved, but the
    // history is walked back so a following run opens on the same document.
    // ══════════════════════════════════════════════════════════════════════
    // ⚠ AND THE UNDO NEEDS THE KEYBOARD OUT OF A TEXT BOX. `LevelWorkspace`'s
    // `isTypingTarget` deliberately does not steal Ctrl+Z from an input, so an
    // undo walk that begins with focus in a number field walks nowhere.
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
