#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// THE `boundary` AUTHORING SURFACE, IN THE REAL APP
//
// The node suite cannot see React, so ~7,000 rows pass there while a control is
// visibly dead. This drives the built app under CDP and measures the things that
// only exist on a rendered surface:
//
//   [f1] the Program row OFFERS `boundary`, labelled as the patched arm it is,
//        with no "(not authorable here yet)" on any option
//   [cv] the switch CONVERTS the document into a boundary and is ONE Ctrl+Z —
//        measured by FULL JSON EQUALITY against the document before the switch —
//        and the same in the other direction
//   [lg] ⚠ THE NO-BUILD WARNING IS ON SCREEN, in the card, painted, and it is
//        the SHARPER flavour: aeon's generator meets the key as an unknown
//        property and refuses the WHOLE DOCUMENT
//   [ad] the four advisories PAINT THEIR `enforced_by`, not just their text —
//        the field exists precisely so a surface cannot drop the attribution
//   [xf] ⚠ THE CROSS-FIELD RULES ARE **NOT** REFUSED. `lo > hi` is typed, the
//        document MOVES, and the advisory appears with aeon named as the
//        enforcer. A panel that had quietly become the only check would fail
//        here and pass everything else
//   [rf] a line outside the engine's ensure IS refused at author time, the
//        document does not move, and a legal sibling proves the box is live
//   [tr] the tint region's four members take a value NO schema keyword bounds —
//        the row that would catch an invented range for `entry` or `count`
//   [os] `offscreen_ship`'s third state really DELETES the key
//   [mv] ⚠ THE WHOLE POINT: seed and sweep the boundary's own channel under
//        "moving anchors" and watch the no-motion advisory RETIRE — and at the
//        WRONG index it does not, which is the half a one-sided row would miss
//
// ═══ ⚠ NO ROW HERE MAY PASS VACUOUSLY ═════════════════════════════════════
//
// Every "it refused" row asserts the DOCUMENT is unchanged, read back through
// `window.__dbg.aeon.presetsJson()`, and every "it acted" row asserts the
// document really CHANGED — not that a handler ran, not that a class toggled.
// A control wired to nothing refuses everything for free.
//
// ⚠ AND NO EXPECTATION IS A CONTRACT LITERAL. The line range, the channel range
// and the shipped water's own numbers are all DERIVED FROM THE SCHEMA in the
// app, with module-load guards; a rig that typed 223 or 100 here would stay
// green through a re-vendor that moved them. Every bound below is READ OFF THE
// APP'S OWN SENTENCE or off the document, and then checked by arithmetic an
// author would do. The values this file DOES type are deliberately absurd
// (`9999` for a screen line, `4242` for an unbounded field) or derived at run
// time from what the screen said.
//
// ═══ ⚠ NOT `el.click()` FOR ANYTHING THAT MEASURES ═══════════════════════
//
// Numbers are typed with `Input.insertText` into a box focused by a REAL mouse
// press at an INTEGER client pixel, verified with `elementFromPoint` first — dpr
// has been observed at both 1 and 1.35 in one session here and a fractional rect
// presents as an off-by-one in a feature that is fine, so the dpr and the rect
// are printed beside every aim. `<select>`s are the stated exception: a native
// select's popup is a browser-process widget that cannot be driven under Xvfb,
// so they go through the native value setter plus a real `change` — React's own
// listener, the idiom every other select-driving harness here uses. Section
// headers and sub-tabs are SETUP.
//
// ⚠ IT WRITES NOTHING TO DISK. No save is issued and the app has no autosave.
// The probe preset is created IN MEMORY through the panel's own New button and
// every edit is a command in the app's own history. The sibling aeon checkout is
// opened READ-ONLY.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool. Nothing
// here has seen a ROM and nothing here claims to — aeon's generator arm for this
// key has not landed, so a preset carrying it does not build at all today, which
// is exactly what [lg] measures being said on screen.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:boundary-control
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9493);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = join(ROOT, 'scratchpad/shots-boundary-control');
mkdirSync(SHOTS, { recursive: true });

// ⚠ THIS ID MUST NOT COLLIDE WITH A PRESET AEON SHIPS. This harness opens aeon's
// LIVE checkout read-only and creates its fixture THROUGH THE PANEL, so its
// probe id shares a namespace with every preset aeon commits — the ramp
// harness's short `ramp_probe` collided with a real file aeon landed hours later
// and every row after that measured somebody else's document. Do not shorten it.
const PRESET_ID = 'aurora_local_boundaryctl_probe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/**
 * ⚠ NOT A PASS AND NOT A ZERO. A row whose subject could not be reached says so
 * in its own bucket and makes the run non-zero, because "couldn't measure"
 * rendered as green is how a whole feature goes untested while a rig reports
 * success.
 */
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name} — ${why}`);
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
      .map((d) => (d.innerText || '').trim().split('\n')[0]);
    return 'no-header; headers on screen: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

/** Drive a real `change` through React's synthetic layer. */
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

/**
 * A CONTROL BY THE LABEL OF ITS OWN ROW, never by position. `Field` renders
 * `<div><span>label</span>{control}</div>`, so a control's parent's first child
 * is its label.
 *
 * ⚠ THE BOUNDARY CARD HAS FOUR NEAR-IDENTICAL SPINNERS (`Line`, `Channel`, `Lo`,
 * `Hi`) plus four more for the tint region, which is the near-identical-control
 * hazard this repo names by name. Every one is addressed by its exact label, as
 * an `===`-style anchored regex, so a row cannot silently measure its neighbour.
 */
const IN_ROW = (labelRe, tag) => String.raw`
(() => {
  return [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((el) => {
      const row = el.parentElement;
      const lab = row && row.firstElementChild;
      return !!(lab && lab.tagName === 'SPAN' && ${labelRe}.test((lab.textContent || '').trim()));
    }) || null;
})()`;

const PROGRAM_SEL = IN_ROW(String.raw`/^Program$/`, 'select');
const LINE_IN = IN_ROW(String.raw`/^Line$/`, 'input');
const CHANNEL_IN = IN_ROW(String.raw`/^Channel$/`, 'input');
const LO_IN = IN_ROW(String.raw`/^Lo$/`, 'input');
const HI_IN = IN_ROW(String.raw`/^Hi$/`, 'input');
const COUNT_IN = IN_ROW(String.raw`/^count$/`, 'input');
const OFFSCREEN_SEL = IN_ROW(String.raw`/^Offscreen$/`, 'select');
const ADD_BAND = String.raw`([...document.querySelectorAll('button')]
  .find((b) => /^Add raster band$/.test((b.textContent || '').trim())) || null)`;

/** The anchors section's per-channel controls, for the [mv] leg. */
const ANCHOR_CHANNEL_SEL = (i) => IN_ROW(new RegExp(`^Channel ${i}$`).source.replace(/^/, '/').replace(/$/, '/'), 'select');
const ANCHOR_MOVEMENT_SEL = String.raw`
(() => {
  return [...document.querySelectorAll('select')]
    .filter((el) => {
      const row = el.parentElement;
      const lab = row && row.firstElementChild;
      return !!(lab && lab.tagName === 'SPAN' && /^Movement$/.test((lab.textContent || '').trim()));
    })[0] || null;
})()`;

/**
 * IS THIS SENTENCE PAINTED — in a real element whose rect lands in its own
 * scroller — and does it SAY the things it must?
 *
 * ⚠ `checkVisibility()` and `getClientRects()` BOTH GO GREEN on an element
 * scrolled thousands of pixels out of its scroller, so the rect is compared
 * against the SCROLLING ANCESTOR's box and never merely against zero.
 *
 * ⚠ AND THE NEEDLES ARE MATCHED IN THE PAGE, AGAINST THE FULL innerText. The
 * `text` field returned is a TRUNCATED PREVIEW for the console and must never be
 * what a row tests.
 */
const PAINTED = (needle, needles = []) => String.raw`
(() => {
  const hit = [...document.querySelectorAll('div,span')]
    .filter((e) => (e.innerText || '').includes(${JSON.stringify(needle)}))
    .pop();
  if (!hit) return null;
  hit.scrollIntoView({ block: 'center' });
  const b = hit.getBoundingClientRect();
  let sc = hit.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  const sb = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const full = (hit.innerText || '').trim().replace(/\s+/g, ' ');
  const want = ${JSON.stringify(needles)};
  const has = {};
  for (const n of want) has[n] = full.includes(n);
  return {
    tag: hit.tagName, w: b.width, h: b.height,
    dpr: window.devicePixelRatio,
    inScroller: b.bottom > sb.top && b.top < sb.bottom && b.right > sb.left && b.left < sb.right,
    scroller: sc ? (sc.className || sc.tagName) : 'viewport',
    length: full.length,
    has,
    allPresent: want.every((n) => full.includes(n)),
    full,
    text: full.slice(0, 320) + (full.length > 320 ? ' …[truncated for the console only]' : ''),
  };
})()`;

/** The geometry + enabled/present reading every aim prints, taken just before the gesture. */
const readSel = (c, selector) => c.json(String.raw`(() => {
  const el = ${selector};
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
           value: 'value' in el ? String(el.value) : null };
})()`);

/** A REAL press at an INTEGER client pixel, verified with elementFromPoint first. */
async function pressSel(c, selector, label) {
  const g = await readSel(c, selector);
  if (!g) {
    throw new Error(`HANDLE ABSENT: "${label}" resolved to nothing. Refusing to press — a run `
      + 'that cannot find its own subject measures nothing.');
  }
  await sleep(120);
  const g2 = await readSel(c, selector);
  const x = Math.round(g2.left + g2.w / 2);
  const y = Math.round(g2.top + g2.h / 2);
  const hit = await c.json(String.raw`(() => {
    const want = ${selector};
    const el = document.elementFromPoint(${x}, ${y});
    return { tag: el ? el.tagName : null, text: el ? (el.textContent || '').trim().slice(0, 32) : null,
             insideTarget: !!(want && el && (want === el || want.contains(el))) };
  })()`);
  note(`aim: ${label}`,
    `dpr=${g2.dpr} rect=(${g2.left},${g2.top},${g2.w}x${g2.h}) → integer client (${x},${y}) · `
    + `disabled=${g2.disabled} visible=${g2.visible} inScroller=${g2.inScroller} `
    + `(scroller=${g2.scroller}) · elementFromPoint = <${hit.tag}> "${hit.text}" `
    + `insideTarget=${hit.insideTarget}`);
  if (!hit.insideTarget) {
    throw new Error(`AIM REFUSED: integer (${x},${y}) for "${label}" lands on <${hit.tag}> `
      + `"${hit.text}", which is NOT inside the handle. Pressing it would measure something else.`);
  }
  await mouse(c, 'mousePressed', x, y);
  await sleep(60);
  await mouse(c, 'mouseReleased', x, y);
  await sleep(300);
  return g2;
}

/**
 * TYPE A NUMBER THE WAY AN AUTHOR DOES.
 *
 * ⚠ THE BLUR FIRST IS NOT COSMETIC. Clicking a box that is ALREADY focused fires
 * no `focus` event, so `NumberField`'s select-on-focus never runs and
 * `insertText` INSERTS at the caret instead of replacing — "100" then "9999"
 * becomes "1009999", refused for a reason that has nothing to do with the row.
 */
async function typeInto(c, selector, text, label) {
  const blurred = await c.evalExpr(
    "(() => { const a = document.activeElement; const t = a ? a.tagName : null; "
    + "if (a && a.blur) a.blur(); return t; })()");
  note(`focus: dropped <${blurred}> before typing into ${label}`,
    'so the press below is a real focus change and the box select-on-focus runs');
  await sleep(150);
  await pressSel(c, selector, label);
  await c.send('Input.insertText', { text });
  await sleep(450);
}

/** The probe preset's document, as the MODEL holds it. */
async function doc(c) {
  const all = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
  return all.find((p) => p.id === PRESET_ID) ?? null;
}

/**
 * DRIVE THE PROGRAM SELECT AND SAY WHICH GESTURE MOVED THE DOCUMENT.
 *
 * ⚠ THE RESULT IS READ AS "IS THE KEY I ASKED FOR PRESENT", never as a two-way
 * test over the keys this file happens to know. A rig that asked
 * `after.boundary ? 'boundary' : 'bands'` is the same defect the panel had.
 */
async function convertArm(c, want) {
  const r = await c.evalExpr(SET_SELECT(PROGRAM_SEL, want));
  await sleep(900);
  const after = await doc(c);
  return `native value setter + real \`change\` (${r}); document now carries `
    + `${after ? Object.keys(after).filter((k) => ['bands', 'ramp', 'base_swap', 'boundary'].includes(k)).join(',') || 'nothing' : 'no document'}`;
}

const ARM_KEYS = ['bands', 'ramp', 'base_swap', 'boundary'];

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

    const bandsDoc = await doc(c);
    const addPre = await readSel(c, ADD_BAND);
    const selPre = await readSel(c, PROGRAM_SEL);
    await shot(c, 'fixture-bands');
    check('f0', 'ANTI-VACUOUS FIXTURE: the probe preset exists, is a BANDS document of THIS run\'s '
      + 'making, the Program switch is on screen showing `bands`, and `Add raster band` is PRESENT, '
      + 'VISIBLE, IN ITS SCROLLER and ENABLED. Every conversion row below is about that document '
      + 'changing shape, so a fixture that was already a boundary — or an id that collided with a '
      + 'preset aeon ships, which is how the ramp harness lost 18 rows — would make them green for '
      + 'a reason that has nothing to do with this parcel',
      !!bandsDoc && Array.isArray(bandsDoc.bands) && bandsDoc.bands.length >= 1
      && bandsDoc.boundary === undefined
      && !!addPre && addPre.disabled === false && addPre.visible === true && addPre.inScroller === true
      && !!selPre && selPre.value === 'bands',
      `document = ${JSON.stringify(bandsDoc)}\n        Add chip = ${JSON.stringify(addPre)}\n`
      + `        Program select = ${JSON.stringify(selPre)}`);
    if (!bandsDoc || !selPre) {
      throw new Error('could not build a bands fixture with a Program select — every row below '
        + 'would be vacuous');
    }
    const BANDS_JSON = JSON.stringify(bandsDoc);

    // ══════════════════════════════════════════════════════════════════════
    // [f1] THE ROW OFFERS THE FOURTH ARM
    // ══════════════════════════════════════════════════════════════════════
    const options = await c.json(String.raw`(() => {
      const el = ${PROGRAM_SEL};
      return el ? [...el.options].map((o) => ({ value: o.value, label: o.textContent })) : null;
    })()`);
    check('f1', 'THE SEAM THIS PARCEL FILLED, on screen: the Program row offers `boundary`, no '
      + 'option carries "(not authorable here yet)", and the boundary option\'s own label says it '
      + 'is the PATCHED arm — the classification the provider asserts against the schema at module '
      + 'load, painted where an author reads it',
      Array.isArray(options) && options.some((o) => o.value === 'boundary')
      && options.every((o) => !/not authorable/.test(o.label))
      && /\(patched, not raster\)/.test(options.find((o) => o.value === 'boundary')?.label ?? ''),
      `options = ${JSON.stringify(options)}`);
    check('f1b', 'and the row is labelled "Program", not "Raster" — it offers an arm that is not a '
      + 'raster program at all, and the old label taught the wrong model of why these four are '
      + 'exclusive',
      await c.evalExpr(String.raw`(() => {
        const el = ${PROGRAM_SEL};
        const lab = el && el.parentElement && el.parentElement.firstElementChild;
        return !!lab && (lab.textContent || '').trim() === 'Program';
      })()`),
      'the select was resolved by a row whose label reads exactly "Program"');

    // ══════════════════════════════════════════════════════════════════════
    // [cv] THE CONVERSION — destructive, and ONE Ctrl+Z, both directions
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [cv] bands → boundary, and back in one undo ===');
    const advisory = await c.json(PAINTED('switching DISCARDS',
      ['DISCARDS', 'ONE undo step', 'Ctrl+Z', 'patched channel']));
    const gesture = await convertArm(c, 'boundary');
    const bDoc = await doc(c);
    await shot(c, 'cv-converted');
    check('cv-0', 'the advisory NAMED WHAT WOULD BE DISCARDED before the gesture, painted under '
      + 'the control, AND it now states the exclusivity reason that is not the raster one — three '
      + 'arms share the raster slot, the fourth is refused alongside them because a record '
      + 'carrying both loses one destructively. It promises no destination: it is painted before '
      + 'the author picks one',
      !!advisory && advisory.inScroller === true && advisory.allPresent === true
      && !/fresh ramp|fresh base swap|fresh boundary/.test(advisory.full),
      `advisory = ${JSON.stringify(advisory && { ...advisory, full: undefined })}`);
    check('cv-a', 'the switch REALLY CONVERTED THE DOCUMENT — `boundary` is present with every '
      + 'required member, and `bands` is GONE, not emptied. ⚠ THE CLAIM IS ABOUT THE DOCUMENT, '
      + 'read back through the model, not about a handler having run',
      !!bDoc && bDoc.boundary !== undefined && !('bands' in bDoc)
      && ['line', 'channel', 'lo', 'hi', 'on', 'sh'].every((k) => k in bDoc.boundary)
      && bDoc.boundary.on && typeof bDoc.boundary.on.pal_region === 'object',
      `driven by: ${gesture}\n        document = ${JSON.stringify(bDoc)} (was ${BANDS_JSON})`);
    check('cv-b', 'and it never authored the multi-arm document the schema refuses — exactly one '
      + 'program at every instant',
      !!bDoc && ARM_KEYS.filter((k) => k in bDoc).length === 1,
      `arm keys = ${bDoc ? JSON.stringify(ARM_KEYS.filter((k) => k in bDoc)) : 'none'}`);

    await ctrlZ(c);
    await sleep(900);
    const undone = await doc(c);
    check('cv-z', '⚠ ONE Ctrl+Z RESTORES EXACTLY WHAT WAS THERE, byte for byte — the condition on '
      + 'building a destructive conversion at all (d-29/d-30). Full JSON equality against the '
      + 'document as it stood BEFORE the switch, not a shape check',
      !!undone && JSON.stringify(undone) === BANDS_JSON,
      `before = ${BANDS_JSON}\n        after one undo = ${JSON.stringify(undone)}`);

    note('[cv] re-converting for the rows below', await convertArm(c, 'boundary'));
    const b0 = await doc(c);
    if (!b0 || b0.boundary === undefined) {
      throw new Error('the second conversion did not take — the rows below have no boundary');
    }
    const BOUNDARY_JSON = JSON.stringify(b0);
    note('[cv] the boundary under test', JSON.stringify(b0.boundary));

    // ⚠ THE OTHER DIRECTION, which is the half a one-way row would miss: a
    // delete loop keyed to the raster list passes the way OUT and authors
    // bands + boundary on the way IN.
    const outGesture = await convertArm(c, 'bands');
    const backToBands = await doc(c);
    await ctrlZ(c);
    await sleep(900);
    const bBack = await doc(c);
    check('cv-y', '⚠ THE CONVERSION OUT IS ALSO ONE Ctrl+Z, AND NEITHER DIRECTION EVER HOLDS TWO '
      + 'ARMS. boundary → bands discards the boundary, one undo puts the SAME boundary back (full '
      + 'JSON equality), and the intermediate document carries exactly one arm key',
      !!backToBands && backToBands.boundary === undefined && Array.isArray(backToBands.bands)
      && ARM_KEYS.filter((k) => k in backToBands).length === 1
      && !!bBack && JSON.stringify(bBack) === BOUNDARY_JSON,
      `driven by: ${outGesture}\n        after the switch out = ${JSON.stringify(backToBands)}\n`
      + `        before = ${BOUNDARY_JSON}\n        after one undo = ${JSON.stringify(bBack)}`);
    if ((await doc(c)).boundary === undefined) {
      note('[cv] restoring the boundary for the rows below', await convertArm(c, 'boundary'));
    }

    // ══════════════════════════════════════════════════════════════════════
    // [lg] ⚠ THE NO-BUILD WARNING, ON SCREEN, IN ITS SHARPER FLAVOUR
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [lg] the disclosure: a preset under this key does not build at all ===');
    const lag = await c.json(PAINTED('Not consumed by the engine yet.',
      ['`boundary`', 'does not accept', 'WHOLE DOCUMENT', 'will not build',
        'nothing set below reaches a ROM', 'no emulator has shown', 'Measured', 'Expires']));
    await shot(c, 'lg-disclosure');
    check('lg-a', '⚠ THE NO-BUILD WARNING IS ON SCREEN IN THE BOUNDARY CARD, PAINTED (a real '
      + 'element whose rect lands inside its own scroller, not merely in the DOM and not '
      + 'hover-only), and it is the SHARPER flavour: aeon\'s generator does not accept the key at '
      + 'origin/master and refuses the WHOLE DOCUMENT, so a preset carrying it will not build at '
      + 'all. It also carries its own measurement date and its expiry condition, so a reader can '
      + 're-run the claim rather than trusting it',
      !!lag && lag.inScroller === true && lag.w > 0 && lag.h > 0 && lag.allPresent === true,
      `painted disclosure = ${JSON.stringify(lag && { ...lag, full: undefined })}`);
    check('lg-b', 'and it names THIS key and no other — the sentence is derived from the measured '
      + 'lag list, so a card that had hard-coded a sentence would keep naming whatever was true '
      + 'when it was typed',
      !!lag && /`boundary`/.test(lag.full)
      && !/`ramp`|`cycles`|`variants`|`base_swap`/.test(lag.full),
      `the sentence names: ${JSON.stringify((lag ? lag.full : '').match(/`[a-z_]+`/g))}`);

    // ══════════════════════════════════════════════════════════════════════
    // [ad] THE ADVISORIES, WITH THEIR ATTRIBUTION
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [ad] the four editor-side warnings, and who enforces each ===');
    const still = await c.json(PAINTED('this boundary follows patch channel',
      ['That is LEGAL and it BUILDS', 'SEEDED', 'SWEPT', 'Enforced by:',
        'nothing — this document is legal and builds']));
    await shot(c, 'ad-no-motion');
    const bNow = (await doc(c)).boundary;
    check('ad-a', '⚠ THE ADVISORY WITH NO ENGINE ENFORCER IS ON SCREEN, AND IT PAINTS ITS OWN '
      + 'ATTRIBUTION. A fresh boundary is a STILL boundary: nothing in aeon and nothing in Aurora '
      + 'refuses it, so an author who expected the shipped moving water and got a static line has '
      + 'no red anything to read — this sentence is the only thing that will tell them. And it '
      + 'carries "Enforced by: nothing — this document is legal and builds", which is the whole '
      + 'reason `enforced_by` is a FIELD: a surface that painted `text` alone would look '
      + 'completely fine and would have dropped it',
      !!still && still.inScroller === true && still.allPresent === true,
      `painted = ${JSON.stringify(still && { ...still, full: undefined })}`);
    check('ad-b', 'and it names the channel index AND both positional keys at that index — the '
      + 'check is INDEX-wise, and a sentence that only said "this needs a sweep" would be equally '
      + 'true of a document that authors one at the wrong index',
      !!still && still.full.includes(`patch_world_ys[${bNow.channel}]`)
      && still.full.includes(`patch_motion[${bNow.channel}]`),
      `boundary.channel = ${bNow.channel}; sentence = ${JSON.stringify(still && still.text)}`);

    // ══════════════════════════════════════════════════════════════════════
    // [xf] ⚠ THE CROSS-FIELD RULE IS NOT REFUSED — IT IS WARNED ABOUT
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [xf] lo > hi: the document MOVES, and aeon is named as the enforcer ===');
    const beforeXf = await doc(c);
    // Derived from the document, not from the contract: one above this
    // boundary's own `hi` is an inverted band whatever the schema's bounds are.
    const invert = beforeXf.boundary.hi + 1;
    await typeInto(c, LO_IN, String(invert), 'Lo (one above this document\'s own hi)');
    const afterXf = await doc(c);
    const loHi = await c.json(PAINTED('names an empty band',
      ['EDITOR-SIDE WARNING, not the refusal', 'Saving is not blocked', 'Enforced by:',
        'aeon', 'generator']));
    await shot(c, 'xf-inverted');
    check('xf-a', '⚠ THE PANEL DID NOT REFUSE IT, AND THAT IS THE ROW. `lo <= hi` is the '
      + 'GENERATOR\'s by the contract\'s own words; the schema accepts the violation and so does '
      + 'the codec. A control that greyed out or withheld the commit would look like diligence and '
      + 'would be refusing a document the contract accepts — and every other row in this file '
      + 'would stay green through it. The document really MOVED',
      !!afterXf && afterXf.boundary.lo === invert
      && afterXf.boundary.lo > afterXf.boundary.hi,
      `lo ${beforeXf.boundary.lo} → ${afterXf.boundary.lo}, hi ${afterXf.boundary.hi} (typed `
      + `${invert}, derived as hi + 1)`);
    check('xf-b', 'and the WARNING is painted instead, saying in its own words that it is an '
      + 'editor-side warning, that saving is not blocked, and NAMING AEON as what actually refuses '
      + 'it — never Aurora',
      !!loHi && loHi.inScroller === true && loHi.allPresent === true
      && !/Aurora refuses|refused by this editor/.test(loHi.full),
      `painted = ${JSON.stringify(loHi && { ...loHi, full: undefined })}`);
    // Put it back, from the document's own numbers.
    await typeInto(c, LO_IN, String(beforeXf.boundary.lo), 'Lo (back to what it was)');
    const restored = await doc(c);
    check('xf-c', 'ANTI-VACUOUS: the same box takes the original value back, so [xf-a] measured a '
      + 'live field and not a box that accepts anything because nothing is wired to it',
      restored.boundary.lo === beforeXf.boundary.lo,
      `lo is now ${restored.boundary.lo}`);

    // ══════════════════════════════════════════════════════════════════════
    // [rf] THE BOUNDED FIELD THAT **IS** REFUSED
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [rf] a screen line outside the engine\'s own ensure ===');
    const beforeRf = await doc(c);
    // 9999 is not a contract number: it is an absurd screen line, larger than
    // any 224-line frame could hold whatever the schema says.
    await typeInto(c, LINE_IN, '9999', 'Line (absurd)');
    const afterRf = await doc(c);
    const rfSentence = await c.json(PAINTED('boundary line:',
      ['is outside', 'SCREEN lines', 'Refused', 'line is still']));
    await shot(c, 'rf-refused');
    const rfRange = rfSentence ? /is outside (\d+)\.\.(\d+)/.exec(rfSentence.full) : null;
    check('rf-a', 'a screen line outside the contract\'s declared range IS refused at typing time '
      + 'and the document does not move — the two halves in one condition, because a refusal that '
      + 'only paints is decoration and a silent withhold is the defect this parcel removes',
      afterRf.boundary.line === beforeRf.boundary.line
      && !!rfSentence && rfSentence.inScroller === true && rfSentence.allPresent === true,
      `line ${beforeRf.boundary.line} → ${afterRf.boundary.line} (unchanged=`
      + `${afterRf.boundary.line === beforeRf.boundary.line}); painted refusal = `
      + `${JSON.stringify({ ...rfSentence, full: undefined })}`);
    // ANTI-VACUOUS PARTNER: the maximum the refusal itself named, read off the
    // screen rather than typed from the contract.
    const maxLine = rfRange ? Number(rfRange[2]) : null;
    if (maxLine === null) {
      cannotMeasure('rf-b', 'the refusal names the legal range and the box accepts its maximum',
        'the painted refusal did not carry an "is outside <min>..<max>" pair, so there was no '
        + 'app-derived value to type back. NOT a pass: the anti-vacuous partner did not run.');
    } else {
      await typeInto(c, LINE_IN, String(maxLine), 'Line (the maximum the refusal named)');
      const afterMax = await doc(c);
      check('rf-b', 'ANTI-VACUOUS: the same box accepts the maximum the refusal ITSELF named, so '
        + '[rf-a] measured a refusal and not a dead field. ⚠ The number is read off the app\'s own '
        + 'sentence — a rig carrying 223 would stay green through a re-vendor that moved it',
        afterMax.boundary.line === maxLine,
        `typed ${maxLine} (read off the app's own sentence); line is now ${afterMax.boundary.line}`);
    }

    // ══════════════════════════════════════════════════════════════════════
    // [tr] THE FOUR FIELDS THE CONTRACT DOES NOT BOUND
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [tr] the tint region: no range in the contract, and none invented here ===');
    const beforeTr = await doc(c);
    await typeInto(c, COUNT_IN, '4242', 'count (a value no schema keyword bounds)');
    const afterTr = await doc(c);
    const trHint = await c.json(PAINTED('no range in the contract',
      ['no range in the contract', 'engine']));
    await shot(c, 'tr-unbounded');
    check('tr-a', '⚠ THE ROW THAT WOULD CATCH AN INVENTED RANGE. `$defs.tint_region` declares '
      + 'slot/pal_line/entry/count as bare integers ON PURPOSE (§7.1\'s shape-only posture — the '
      + 'ranges are stream_pal_region\'s own ensures and the engine\'s message carries the '
      + 'measurement). A card that had decided `count` is 1..16 would refuse this, and every '
      + '"it refuses" row in this file would still be green. The value is written',
      afterTr.boundary.on.pal_region.count === 4242,
      `count ${beforeTr.boundary.on.pal_region.count} → `
      + `${afterTr.boundary.on.pal_region.count} (typed 4242)`);
    check('tr-b', 'and the card SAYS where the real bound lives instead of pretending there is '
      + 'none — painted, not hover-only',
      !!trHint && trHint.inScroller === true && trHint.allPresent === true,
      `painted = ${JSON.stringify(trHint && { ...trHint, full: undefined })}`);

    // ══════════════════════════════════════════════════════════════════════
    // [os] THE THIRD STATE REALLY DELETES THE KEY
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [os] offscreen_ship: absent is a state, and it is a different document ===');
    const beforeOs = await doc(c);
    const osOptions = await c.json(String.raw`(() => {
      const el = ${OFFSCREEN_SEL};
      return el ? { value: el.value, options: [...el.options].map((o) => o.value) } : null;
    })()`);
    await c.evalExpr(SET_SELECT(OFFSCREEN_SEL, 'absent'));
    await sleep(700);
    const osGone = await doc(c);
    await c.evalExpr(SET_SELECT(OFFSCREEN_SEL, 'off'));
    await sleep(700);
    const osOff = await doc(c);
    await shot(c, 'os-states');
    check('os-a', '⚠ THREE STATES, BECAUSE ABSENT IS ONE OF THEM. The key is OPTIONAL with '
      + 'patchable\'s own default of false, so "absent" and "false" mean the same thing to the '
      + 'engine and are DIFFERENT DOCUMENTS on disk — a two-way toggle would materialise the key '
      + 'on the first glance at the control, a diff on a file the author only looked at. "Not '
      + 'written" really DELETES the key, and "off" really writes it',
      !!osOptions && osOptions.options.join(',') === 'absent,off,on'
      && !('offscreen_ship' in osGone.boundary)
      && ('offscreen_ship' in osOff.boundary)
      && JSON.stringify(osOff.boundary) !== JSON.stringify(osGone.boundary),
      `select = ${JSON.stringify(osOptions)}\n        was = `
      + `${JSON.stringify(beforeOs.boundary.offscreen_ship)}; after "absent" the key is `
      + `${'offscreen_ship' in osGone.boundary ? 'STILL THERE' : 'gone'}; after "off" it is `
      + `${JSON.stringify(osOff.boundary.offscreen_ship)}`);

    // ══════════════════════════════════════════════════════════════════════
    // [mv] ⚠ THE WHOLE POINT: make the boundary MOVE
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [mv] seed + sweep the boundary\'s own channel, and watch the advisory retire ===');
    // Point the boundary at channel 0, which is the channel the anchors section
    // renders first — and read it back rather than assuming the type took.
    await typeInto(c, CHANNEL_IN, '0', 'Channel (0, the one the anchors section opens on)');
    const aimed = await doc(c);
    if (aimed.boundary.channel !== 0) {
      cannotMeasure('mv', 'the moving-water loop',
        `the boundary's channel could not be set to 0 (it reads ${aimed.boundary.channel}), so the `
        + 'anchors section below would be authoring a different index than the boundary follows '
        + 'and the row would prove nothing.');
    } else {
      const opened = await c.evalExpr(OPEN_SECTION(
        String.raw`/^Preset — .* — moving anchors\b/`,
        `${ANCHOR_CHANNEL_SEL(0)}`));
      note('[mv] opening the moving-anchors section', String(opened));
      await sleep(1200);
      const chanSel = await readSel(c, ANCHOR_CHANNEL_SEL(0));
      if (!chanSel) {
        cannotMeasure('mv', 'the moving-water loop',
          `the "Channel 0" picker in the moving-anchors section could not be found (section open: `
          + `${opened}). NOT a pass — the seed-and-sweep leg did not run.`);
      } else {
        const seeded = await c.evalExpr(SET_SELECT(ANCHOR_CHANNEL_SEL(0), 'authored'));
        await sleep(900);
        const swept = await c.evalExpr(SET_SELECT(ANCHOR_MOVEMENT_SEL, 'sweep'));
        await sleep(1000);
        const moving = await doc(c);
        await shot(c, 'mv-seeded-and-swept');
        check('mv-a', 'the anchor keys are authored AT THE BOUNDARY\'S OWN INDEX — a seed and a '
          + 'sweep at channel 0, in the same document as a boundary that follows channel 0. This '
          + 'is the document the whole feature is for',
          !!moving && Array.isArray(moving.patch_world_ys) && moving.patch_world_ys[0] !== null
          && moving.patch_world_ys[0] !== undefined
          && Array.isArray(moving.patch_motion) && !!moving.patch_motion[0]
          && !!moving.patch_motion[0].sweep
          && moving.boundary.channel === 0,
          `seed gesture: ${seeded}; sweep gesture: ${swept}\n        patch_world_ys = `
          + `${JSON.stringify(moving && moving.patch_world_ys)}; patch_motion = `
          + `${JSON.stringify(moving && moving.patch_motion)}; boundary.channel = `
          + `${moving && moving.boundary.channel}`);

        // Back to the preset section to read the advisory.
        await c.evalExpr(OPEN_SECTION(
          String.raw`/^Preset — ` + PRESET_ID + String.raw`(?![-a-z0-9_ ])/`,
          `${LINE_IN}`));
        await sleep(1000);
        const stillThere = await c.json(PAINTED('this boundary follows patch channel', []));
        await shot(c, 'mv-advisory-retired');
        check('mv-b', '⚠ AND THE no-motion SENTENCE RETIRES — on screen, in the card, because the '
          + 'document now seeds AND sweeps the index the boundary follows. A sentence that stayed '
          + 'up here would be the "workaround outlives its defect" shape: a warning that keeps '
          + 'warning after it stops being true, which teaches an author to ignore the panel',
          stillThere === null,
          `the no-motion sentence is ${stillThere === null ? 'gone' : 'STILL PAINTED: '
            + JSON.stringify(stillThere.text)}`);

        // ⚠ THE OTHER HALF, which is what makes [mv-b] a measurement of the
        // INDEX and not of the mere presence of the two keys.
        await typeInto(c, CHANNEL_IN, '1', 'Channel (1 — the keys stay at index 0)');
        await sleep(700);
        const wrongIndex = await doc(c);
        const back = await c.json(PAINTED('this boundary follows patch channel',
          ['patch_world_ys[1]', 'patch_motion[1]']));
        await shot(c, 'mv-wrong-index');
        check('mv-c', '⚠ AND AT THE WRONG INDEX IT COMES BACK, NAMING THE RIGHT ONE. The document '
          + 'still authors both positional keys — at index 0 — while the boundary now follows '
          + 'channel 1, and it sits just as still. A check that only asked "does this document '
          + 'have patch_motion?" would go quiet here and read as coverage',
          !!wrongIndex && wrongIndex.boundary.channel === 1
          && !!back && back.inScroller === true && back.allPresent === true,
          `boundary.channel = ${wrongIndex && wrongIndex.boundary.channel}; the keys are still at `
          + `index 0 (${JSON.stringify(wrongIndex && wrongIndex.patch_world_ys)}); sentence = `
          + `${JSON.stringify(back && back.text)}`);
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // Leave the app as we found it.
    // ⚠ THE UNDO WALK NEEDS THE KEYBOARD OUT OF A TEXT BOX: `LevelWorkspace`'s
    // `isTypingTarget` deliberately does not steal Ctrl+Z from an input, so a
    // walk that begins with focus in a number field walks nowhere.
    // ══════════════════════════════════════════════════════════════════════
    await c.evalExpr("(() => { const a = document.activeElement; if (a && a.blur) a.blur(); })()");
    await sleep(200);
    for (let i = 0; i < 60 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(120);
      if ((await doc(c)) === null) break;
    }
    const left = await doc(c);
    check('z', 'the probe preset is walked back out of the model by the app\'s own history, so '
      + 'this run leaves nothing behind (and nothing was ever written to disk — no save is issued '
      + 'and the app has no autosave)',
      left === null,
      `probe preset after the undo walk = ${JSON.stringify(left)}`);

    console.log(`\n${'═'.repeat(75)}`);
    console.log(`RESULT  ${results.filter((r) => r.ok).length}/${results.length} rows passed`);
    if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
    if (unmeasured.length) {
      console.log('UNMEASURED (NOT passes — the subject could not be reached):');
      for (const u of unmeasured) console.log(`  ${u}`);
    }
    console.log(`shots → ${SHOTS}`);
    console.log('═'.repeat(75));
  } finally {
    try { c && c.close(); } catch { /* closing */ }
    const { killTree } = await import('./lib/harness-guard.mjs');
    await killTree(child);
  }
  process.exitCode = (fails.length || unmeasured.length) ? 1 : 0;
}

main().catch(async (e) => {
  console.error(`\nHARNESS ERROR: ${e && e.message ? e.message : e}`);
  process.exitCode = 1;
});
