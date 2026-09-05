#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// FULL SCREEN, OR A 16-PIXEL SLIVER — THE RAMP CARD'S SCROLL-MODE SENTENCE,
// IN THE REAL APP
//
// A VSRAM `ramp` produces ONE OF TWO COMPLETELY DIFFERENT EFFECTS and the
// preset document is IDENTICAL either way: VDP $0B bit 2 is raised by the SCENE
// bound to the SECTION bound to the preset. The node suite cannot see React, so
// this drives the built app under CDP and measures the four cases that only
// exist once three documents are joined on a running surface:
//
//   [c0] NOTHING BINDS IT      → neither arm is asserted
//   [c1] bound, scene flat     → FULL-SCREEN, naming the section and the scene
//   [c2] bound, scene v_deform → ONE 16-PIXEL COLUMN, with the MEASURED span
//   [c3] two sections DISAGREE → "no single answer", naming which gets which
//   [c4] bound, scene unresolvable → NOT DECIDED, naming act_parallax_config
//   [av] ⚠ THE ANTI-VACUOUS ROW
//
// ═══ ⚠ [av] IS THE ROW THAT CANNOT PASS FOR THE WRONG REASON ═══════════════
//
// Every other row expects one arm, so each would still pass against a sentence
// HARD-WIRED to that arm. [av] holds the PRESET DOCUMENT byte-identical — read
// back through `window.__dbg.aeon.presetsJson()` before and after — holds the
// binding identical, and moves exactly one thing: the bound scene's `v_deform`,
// through the scene panel's own toggle. It then requires the two sentences to
// DIFFER and each to carry its own arm. No constant string can do that, and
// neither can a derivation keyed on the preset, the section index or the ramp's
// own numbers, because none of them moved.
//
// ═══ ⚠ EVERY "IT SAYS X" ROW ASSERTS THE BINDINGS THAT MAKE X TRUE ═════════
//
// A sentence saying "full-screen" is worthless as evidence unless the run also
// shows that the section really binds this preset (`__dbg.aeon.rasterRef(n)`),
// that its `sceneRef` really names the scene (`__dbg.aeon.sceneRef(n)`), and
// that the scene really does or does not carry a `v_deform`
// (`__dbg.aeon.scenesJson()`). All three are read from the MODEL, beside the
// sentence, on the same run, and printed.
//
// ═══ ⚠ THIS RUN READS NO LINE NUMBERS ═════════════════════════════════════
//
// The card's display-span readout WAS contested by one line — a real ROM
// rendered 5..223 where the panel derived 4..223, at two different tops
// (2026-09-03). It SETTLED in the ROM's favour at empyrean `e9409dc`: the
// contract now says the first written value displays on `top + 2`, Aurora
// re-vendored it, and the readout derives it. ⚠ THAT "REAL ROM" WAS ORACLE'S
// RUST CORE, and empyrean `bfc000e` (2026-09-04) put the attribution into the
// contract: the legacy C++ core reads both raster tiers one line earlier on the
// same ROM bytes and is disqualified as a referee for being self-inconsistent by
// 79-83 of 224 rows between two identical boots; the landing line is UNPINNED in
// the Rust core's own recon; NO HARDWARE REFEREE exists. What settled is that
// two readers agree, not that the machine answered. Nothing here touched it before or
// after, which is the point — the subject is the HORIZONTAL extent, and
// `harness: ramp-control` owns the vertical one.
//
// ═══ ⚠ THE PROBE IDS ARE NAMESPACED, AND THAT IS NOT DECORATION ═══════════
//
// This harness opens aeon's LIVE checkout read-only and creates its fixtures
// THROUGH THE PANELS, so every id it types shares a namespace with everything
// aeon commits. `ramp_probe` was a sibling harness's id until aeon landed a real
// `ramp_probe.json` and that harness silently began editing THEIR document. The
// `aurora_local_` prefix is the fix. Do not shorten it.
//
// ⚠ IT WRITES NOTHING TO DISK. No save is issued and the app has no autosave;
// every fixture is a command in the app's own history and is walked back at the
// end. The sibling aeon checkout is opened READ-ONLY.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     npm run harness:ramp-scroll-mode
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
//                          AURORA_BUILT_TREE=<this worktree>
// ═══════════════════════════════════════════════════════════════════════════

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync } from 'node:fs';
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
const SHOTS = join(ROOT, 'scratchpad/shots-ramp-scroll-mode');
mkdirSync(SHOTS, { recursive: true });

const PRESET_ID = 'aurora_local_rampmode_probe';
const SCENE_FLAT = 'aurora_local_rampmode_flat';
const SCENE_VDEF = 'aurora_local_rampmode_vdef';

// The three leads the panel paints, quoted from
// src/core/formats/effects/ramp-scroll-mode.ts. Kept here as literals ON
// PURPOSE: this file is an OUTSIDE reader of the app, and importing the
// constant would let a sentence that had been silently emptied still match
// itself. If a lead changes, this harness must be edited — that is the point.
const LEAD_FULL = 'FULL-SCREEN:';
const LEAD_COLUMN = 'ONE 16-PIXEL COLUMN:';
const LEAD_SPLIT = 'TWO DIFFERENT EFFECTS, BY SECTION:';
const LEAD_UNBOUND = 'FULL-SCREEN OR A 16-PIXEL COLUMN — THE BINDING DECIDES:';
const LEAD_UNKNOWN = 'NOT DECIDED BY ANY DOCUMENT AURORA CAN READ:';
const ALL_LEADS = [LEAD_FULL, LEAD_COLUMN, LEAD_SPLIT, LEAD_UNBOUND, LEAD_UNKNOWN];

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
    const { writeFileSync } = await import('node:fs');
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}

async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);

// ═══ THE SELECTS ARE DRIVEN BY THE NATIVE SETTER PLUS A REAL `change` ═══════
//
// STATED RATHER THAN HIDDEN, exactly as `ramp-control-harness.mjs` states it: a
// native `<select>`'s popup is a browser-process widget that cannot be opened
// under Xvfb, so the value setter plus a real `change` event is the idiom every
// select-driving harness in this repo uses. It goes through React's own
// listener, so it exercises the handler and the command; what it does NOT
// exercise is reachability, and [f0] covers that separately by asserting each
// select is present, visible, INSIDE ITS SCROLLER and enabled before use.
//
// ⚠ AND NONE OF THESE SELECTS IS THE SUBJECT OF A ROW. The subject here is a
// SENTENCE the panel derives; the selects are setup that puts the model into
// the state the sentence is read in. That is what makes the setter acceptable
// here where it would not be for "what happens when an author types".
const SET_SELECT = (finder, value) => String.raw`
(() => {
  const el = ${finder};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const SET_INPUT = (finder, value) => String.raw`
(() => {
  const el = ${finder};
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

// ── the in-page finders, every one addressed by its own `title` or data
//    attribute, never by position. Four near-identical `<select>`s live in this
//    column (section, scene, raster, v_deform) and "the third select" would
//    silently measure a neighbour the first time the column reflowed.
const SEL_SECTION = "document.querySelector('[data-effects-section-picker] select')";
const SEL_SCENE_ASSIGN = "[...document.querySelectorAll('select')]"
  + ".find((s) => (s.getAttribute('title')||'').startsWith('Which effects scene this section uses'))";
const SEL_RASTER_ASSIGN = "[...document.querySelectorAll('select')]"
  + ".find((s) => (s.getAttribute('title')||'').startsWith('Which raster band preset this section uses'))";
const SEL_VDEFORM = "[...document.querySelectorAll('select')]"
  + ".find((s) => (s.getAttribute('title')||'').startsWith('v_deform — a per-column VERTICAL table'))";
const SEL_RASTER_PROGRAM = String.raw`(() => {
  const row = [...document.querySelectorAll('span')]
    .filter((s) => (s.textContent || '').trim() === 'Raster' && s.parentElement)
    .map((s) => s.parentElement)
    .find((r) => r.querySelector('select'));
  return row ? row.querySelector('select') : null;
})()`;

/**
 * The geometry + enabled reading printed before any select is driven.
 *
 * `inScroller` is the honest visibility question: `checkVisibility()` and
 * `getClientRects()` both go GREEN on an element scrolled thousands of pixels
 * out of its own scroller, so the rect is compared against the SCROLLING
 * ANCESTOR's box and not merely against zero.
 */
const readEl = (c, finder) => c.json(String.raw`(() => {
  const el = ${finder};
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
           disabled: !!el.disabled,
           visible: cs.visibility !== 'hidden' && cs.display !== 'none' && b.width > 0 && b.height > 0,
           inScroller: b.bottom > sb.top && b.top < sb.bottom && b.right > sb.left && b.left < sb.right,
           scroller: sc ? (sc.className || sc.tagName) : 'viewport',
           value: 'value' in el ? String(el.value) : null,
           options: el.tagName === 'SELECT' ? [...el.options].map((o) => o.value) : null };
})()`);

/**
 * THE SENTENCE, AS PAINTED — a real element whose rect lands inside its own
 * scroller, plus its full `innerText` and its `title`.
 *
 * ⚠ THE NEEDLE IS MATCHED IN THE PAGE AGAINST THE WHOLE innerText. `text` below
 * is a TRUNCATED PREVIEW for the console and must never be what a row tests: a
 * sibling harness went red against a sentence that really was on screen because
 * a row searched a 400-character slice. Print a slice, assert on the whole.
 */
const readSentence = (c) => c.json(String.raw`(() => {
  const leads = ${JSON.stringify(ALL_LEADS)};
  const hit = [...document.querySelectorAll('span')]
    .filter((e) => leads.some((l) => (e.innerText || '').includes(l)))
    .pop();
  if (!hit) return null;
  hit.scrollIntoView({ block: 'center' });
  const b = hit.getBoundingClientRect();
  let sc = hit.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  const sb = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const full = (hit.innerText || '').trim().replace(/\s+/g, ' ');
  return {
    tag: hit.tagName, w: b.width, h: b.height,
    inScroller: b.bottom > sb.top && b.top < sb.bottom && b.right > sb.left && b.left < sb.right,
    scroller: sc ? (sc.className || sc.tagName) : 'viewport',
    full,
    title: hit.getAttribute('title') || '',
    text: full.slice(0, 240) + (full.length > 240 ? ' …[console preview only]' : ''),
  };
})()`);

/** Every needle present, and every forbidden lead absent — one condition. */
function says(s, needles, forbidden = []) {
  if (!s || !s.inScroller || s.w <= 0 || s.h <= 0) return false;
  return needles.every((n) => s.full.includes(n)) && forbidden.every((n) => !s.full.includes(n));
}

/** The probe preset's document, as the MODEL holds it. */
async function presetDoc(c) {
  const all = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
  return all.find((p) => p.id === PRESET_ID) ?? null;
}
/** One scene, as the MODEL holds it. */
async function sceneDoc(c, id) {
  const all = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
  return all.find((s) => s.id === id) ?? null;
}
/** The bindings, read from the model beside every sentence. */
async function bindings(c, sections) {
  const out = {};
  for (const n of sections) {
    out[n] = {
      raster: await c.evalExpr(`window.__dbg.aeon.rasterRef(${n})`),
      scene: await c.evalExpr(`window.__dbg.aeon.sceneRef(${n})`),
    };
  }
  return out;
}

async function toParallax(c) {
  await c.evalExpr(SUBTAB('parallax'));
  await sleep(900);
}
async function toColour(c) {
  await c.evalExpr(SUBTAB('colour'));
  await sleep(900);
  await c.evalExpr(OPEN_SECTION(String.raw`/^Raster band presets\b/`,
    `document.querySelector('input[placeholder="new_preset_id"]')`));
  await sleep(500);
  await c.evalExpr(OPEN_SECTION(String.raw`/^Preset: ` + PRESET_ID + String.raw`(?![-a-z0-9_ ])/`,
    `${SEL_RASTER_PROGRAM}`));
  await sleep(600);
}

/** Point both per-section bindings at one section index. */
async function setSection(c, n) {
  const r = await c.evalExpr(SET_SELECT(SEL_SECTION, String(n)));
  await sleep(700);
  const now = await c.evalExpr('window.__dbg.aeon.activeSection()');
  if (now !== n) throw new Error(`could not make section ${n} active (setter said ${r}, active=${now})`);
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
    await c.evalExpr(CLICK_BY_TEXT('/^Effects$/'));
    await sleep(1500);

    // ══════════════════════════════════════════════════════════════════════
    // Which two sections can carry a binding at all
    // ══════════════════════════════════════════════════════════════════════
    await toParallax(c);
    const picker = await readEl(c, SEL_SECTION);
    if (!picker) throw new Error('the section picker is not on screen — nothing below can be driven');
    const nonEmpty = await c.json(String.raw`(() => {
      const el = ${SEL_SECTION};
      return [...el.options].filter((o) => !/empty/.test(o.textContent || '')).map((o) => Number(o.value));
    })()`);
    note('sections offered', `${picker.options.length} options; non-empty = ${JSON.stringify(nonEmpty)}`);
    if (nonEmpty.length < 2) {
      throw new Error(`this act has ${nonEmpty.length} non-empty section(s); the disagreement row `
        + 'needs two. Nothing below is measurable.');
    }
    const S1 = nonEmpty[0];
    const S2 = nonEmpty[1];

    // ══════════════════════════════════════════════════════════════════════
    // FIXTURE — two scenes of this run's own making, differing in ONE key
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== FIXTURE: two scenes, identical but for `v_deform` ===');
    await c.evalExpr(OPEN_SECTION(String.raw`/^Scenes$/`,
      `document.querySelector('input[placeholder="new_scene_id"]')`));
    await sleep(700);
    for (const id of [SCENE_FLAT, SCENE_VDEF]) {
      await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, id));
      await sleep(350);
      await c.evalExpr(CLICK_BY_TEXT('/^New$/'));
      await sleep(1100);
    }
    // Turn the per-column table ON for the second one, through the panel's own
    // toggle — which is also what makes `left_column_mask` legal in the same
    // command, so the fixture is a document the engine would accept.
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_VDEF)})`);
    await sleep(800);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Scene: ` + SCENE_VDEF + String.raw`(?![-a-z0-9_ ])/`,
      SEL_VDEFORM));
    await sleep(800);
    const vdefSel = await readEl(c, SEL_VDEFORM);
    note('aim: V deform toggle', JSON.stringify(vdefSel));
    await c.evalExpr(SET_SELECT(SEL_VDEFORM, 'on'));
    await sleep(1000);

    const flat = await sceneDoc(c, SCENE_FLAT);
    const vdef = await sceneDoc(c, SCENE_VDEF);
    await shot(c, 'fixture-scenes');
    check('f0', 'ANTI-VACUOUS FIXTURE (scenes): both probe scenes exist, and they differ in EXACTLY '
      + 'the key the rule turns on — one has NO `v_deform`, the other has a `v_deform.columns`. '
      + 'Every arm below is about that one key, so two identical scenes would make [c1] and [c2] '
      + 'green for a reason that has nothing to do with the rule',
      !!flat && !!vdef
      && (flat.v_deform === undefined || flat.v_deform === 'none')
      && !!vdef.v_deform && typeof vdef.v_deform === 'object' && !!vdef.v_deform.columns
      && !!vdefSel && vdefSel.disabled === false && vdefSel.visible === true
      && vdefSel.inScroller === true,
      `flat = ${JSON.stringify(flat)}\n        vdef = ${JSON.stringify(vdef)}`);

    // ══════════════════════════════════════════════════════════════════════
    // FIXTURE — a RAMP preset, created and converted through the panel
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== FIXTURE: a ramp preset, created through the panel ===');
    await c.evalExpr(SUBTAB('colour'));
    await sleep(1000);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Raster band presets\b/`,
      `document.querySelector('input[placeholder="new_preset_id"]')`));
    await sleep(700);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_preset_id"]')`, PRESET_ID));
    await sleep(350);
    await c.evalExpr(CLICK_BY_TEXT('/^New$/'));
    await sleep(1200);
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);
    await sleep(900);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Preset: ` + PRESET_ID + String.raw`(?![-a-z0-9_ ])/`,
      SEL_RASTER_PROGRAM));
    await sleep(900);
    const progSel = await readEl(c, SEL_RASTER_PROGRAM);
    note('aim: raster program select', JSON.stringify(progSel));
    await c.evalExpr(SET_SELECT(SEL_RASTER_PROGRAM, 'ramp'));
    await sleep(1200);

    const ramp0 = await presetDoc(c);
    const s0 = await readSentence(c);
    await shot(c, 'fixture-ramp');
    check('f1', 'ANTI-VACUOUS FIXTURE (preset): the probe preset exists, is a RAMP document (not '
      + 'bands, not somebody else\'s file), and the scroll-mode sentence is PAINTED — a real '
      + 'element whose rect lands inside its own scroller. Every row below reads that element, so '
      + 'a sentence that never mounted would make the "does not say X" halves green for free',
      !!ramp0 && ramp0.ramp !== undefined && ramp0.bands === undefined
      && !!s0 && s0.inScroller === true && s0.w > 0 && s0.h > 0,
      `document = ${JSON.stringify(ramp0)}\n        sentence = ${JSON.stringify(s0 && {
        tag: s0.tag, w: s0.w, h: s0.h, inScroller: s0.inScroller, scroller: s0.scroller,
        length: s0.full.length, text: s0.text })}`);
    if (!ramp0 || ramp0.ramp === undefined) {
      throw new Error('the fixture is not a ramp document — nothing below is measurable');
    }

    // ══════════════════════════════════════════════════════════════════════
    // [c0] NOTHING BINDS IT
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [c0] nothing binds this preset ===');
    const b0 = await bindings(c, nonEmpty);
    const boundAtAll = Object.values(b0).some((b) => b.raster === PRESET_ID);
    check('c0', 'UNBOUND: with no section naming this preset, the panel asserts NEITHER arm — it '
      + 'says the binding decides it and points at the control that makes one. "Probably '
      + 'full-screen, that is the common case" would be exactly the drawn lie this row removes. '
      + 'The binding half is asserted from the MODEL, not inferred from the sentence',
      boundAtAll === false
      && says(s0, [LEAD_UNBOUND, 'no section binds this preset', 'Section row above'],
        [LEAD_FULL, LEAD_COLUMN, LEAD_SPLIT]),
      `rasterRef/sceneRef per section = ${JSON.stringify(b0)}\n        sentence = ${s0 && s0.text}`);

    // ══════════════════════════════════════════════════════════════════════
    // [c1] BOUND, AND THE SCENE HAS NO v_deform → FULL-SCREEN
    // ══════════════════════════════════════════════════════════════════════
    console.log(`\n=== [c1] section ${S1} binds it, scene ${SCENE_FLAT} (no v_deform) ===`);
    await setSection(c, S1);
    const rasterSel = await readEl(c, SEL_RASTER_ASSIGN);
    note('aim: per-section raster select', JSON.stringify(rasterSel));
    await c.evalExpr(SET_SELECT(SEL_RASTER_ASSIGN, PRESET_ID));
    await sleep(900);
    await toParallax(c);
    await c.evalExpr(OPEN_SECTION(String.raw`/^Section assignment$/`, SEL_SCENE_ASSIGN));
    await sleep(700);
    const sceneSel = await readEl(c, SEL_SCENE_ASSIGN);
    note('aim: per-section scene select', JSON.stringify(sceneSel));
    await c.evalExpr(SET_SELECT(SEL_SCENE_ASSIGN, SCENE_FLAT));
    await sleep(900);
    await toColour(c);
    const b1 = await bindings(c, [S1]);
    const doc1 = await presetDoc(c);
    const s1 = await readSentence(c);
    await shot(c, 'c1-full');
    check('c1', `FULL-SCREEN: section ${S1} binds this preset and its scene carries no `
      + '`v_deform`, so the card says the ramp scrolls the FULL WIDTH and names the section and '
      + 'the scene that made it true. Asserted with the two refs read from the model AND the '
      + 'scene document read back — the sentence alone would prove nothing',
      b1[S1].raster === PRESET_ID && b1[S1].scene === SCENE_FLAT
      && (flat.v_deform === undefined || flat.v_deform === 'none')
      && says(s1, [LEAD_FULL, 'FULL WIDTH', `Section ${S1}`, `"${SCENE_FLAT}"`],
        [LEAD_COLUMN, LEAD_SPLIT, LEAD_UNBOUND]),
      `bindings = ${JSON.stringify(b1)}; scene.v_deform = ${JSON.stringify(flat.v_deform)}\n`
      + `        sentence = ${s1 && s1.text}`);

    // ══════════════════════════════════════════════════════════════════════
    // [c2] THE SAME DOCUMENT, THE SAME BINDING, THE OTHER SCENE → ONE COLUMN
    // ══════════════════════════════════════════════════════════════════════
    console.log(`\n=== [c2] the same binding, scene ${SCENE_VDEF} (v_deform) ===`);
    await toParallax(c);
    await c.evalExpr(SET_SELECT(SEL_SCENE_ASSIGN, SCENE_VDEF));
    await sleep(900);
    await toColour(c);
    const b2 = await bindings(c, [S1]);
    const doc2 = await presetDoc(c);
    const s2 = await readSentence(c);
    await shot(c, 'c2-column');
    check('c2', `ONE 16-PIXEL COLUMN: the same preset, the same section, a scene that DOES carry a `
      + '`v_deform` — and the card now says the ramp scrolls a single 16-pixel column, with the '
      + 'span the aeon lane MEASURED (x = 4-19) and an explicit "not x = 0-15". A tidy 0-15 would '
      + 'be a drawn lie: the plane\'s own H-scroll offsets the strip',
      b2[S1].raster === PRESET_ID && b2[S1].scene === SCENE_VDEF
      && !!vdef.v_deform && !!vdef.v_deform.columns
      && says(s2, [LEAD_COLUMN, '16-pixel column', `Section ${S1}`, `"${SCENE_VDEF}"`,
        'x = 4-19', 'not x = 0-15', 'CAP_PER_COL_VSRAM'],
      [LEAD_FULL, LEAD_SPLIT, LEAD_UNBOUND]),
      `bindings = ${JSON.stringify(b2)}; scene.v_deform = ${JSON.stringify(vdef.v_deform)}\n`
      + `        sentence = ${s2 && s2.text}`);

    // ══════════════════════════════════════════════════════════════════════
    // [av] ⚠ THE ANTI-VACUOUS ROW
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [av] the sentence is DERIVED, not hard-wired ===');
    check('av', '⚠ ANTI-VACUOUS: the PRESET DOCUMENT is byte-identical across [c1] and [c2] (read '
      + 'back from the model both times), the binding is the same section and the same preset, and '
      + 'the ONLY thing that moved is one key on a DIFFERENT document — yet the two sentences '
      + 'DIFFER and each carries its own arm. A sentence hard-wired to either arm cannot pass '
      + 'this, and neither can one derived from the preset, the section index or the ramp\'s own '
      + 'five numbers, because none of them moved',
      !!doc1 && !!doc2 && JSON.stringify(doc1) === JSON.stringify(doc2)
      && b1[S1].raster === b2[S1].raster && b1[S1].raster === PRESET_ID
      && !!s1 && !!s2 && s1.full !== s2.full
      && s1.full.includes(LEAD_FULL) && !s1.full.includes(LEAD_COLUMN)
      && s2.full.includes(LEAD_COLUMN) && !s2.full.includes(LEAD_FULL),
      `document identical = ${JSON.stringify(doc1) === JSON.stringify(doc2)} `
      + `(${JSON.stringify(doc1)})\n        sceneRef moved ${b1[S1].scene} → ${b2[S1].scene}\n`
      + `        [c1] said: ${s1 && s1.text}\n        [c2] said: ${s2 && s2.text}`);

    // ══════════════════════════════════════════════════════════════════════
    // [c3] TWO SECTIONS, TWO ANSWERS
    // ══════════════════════════════════════════════════════════════════════
    console.log(`\n=== [c3] sections ${S1} and ${S2} disagree ===`);
    await setSection(c, S2);
    await c.evalExpr(SET_SELECT(SEL_RASTER_ASSIGN, PRESET_ID));
    await sleep(900);
    await toParallax(c);
    await c.evalExpr(SET_SELECT(SEL_SCENE_ASSIGN, SCENE_FLAT));
    await sleep(900);
    await toColour(c);
    const b3 = await bindings(c, [S1, S2]);
    const s3 = await readSentence(c);
    await shot(c, 'c3-split');
    check('c3', `DISAGREEMENT: section ${S1} takes a v_deform scene and section ${S2} does not, so `
      + 'there is NO SINGLE ANSWER — the card says so and names WHICH section gets WHICH. Not the '
      + 'majority, not the first, not the "usual" one: with two sections a majority rule would '
      + 'have had to invent a tie-break, and with three it would quietly tell one author the '
      + 'wrong thing',
      b3[S1].raster === PRESET_ID && b3[S2].raster === PRESET_ID
      && b3[S1].scene === SCENE_VDEF && b3[S2].scene === SCENE_FLAT
      && says(s3, [LEAD_SPLIT, 'no single answer', `Section ${S1}`, `Section ${S2}`,
        `"${SCENE_FLAT}"`, `"${SCENE_VDEF}"`],
      [LEAD_FULL, LEAD_COLUMN, LEAD_UNBOUND]),
      `bindings = ${JSON.stringify(b3)}\n        sentence = ${s3 && s3.text}`);

    // ══════════════════════════════════════════════════════════════════════
    // [c4] BOUND, AND THE SCENE CANNOT BE RESOLVED AT ALL
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [c4] bound, and the scene is the act default — which this act does not set ===');
    // Unbind S2 so the answer is about one section, then take S1's own scene
    // back to "Act default". aeon's project.json has `sceneRef: null` on the
    // act, so this is the bottom of the chain: the engine's hand-authored
    // config, which Aurora has never read.
    await setSection(c, S2);
    await c.evalExpr(SET_SELECT(SEL_RASTER_ASSIGN, ''));
    await sleep(900);
    await setSection(c, S1);
    await toParallax(c);
    await c.evalExpr(SET_SELECT(SEL_SCENE_ASSIGN, ''));
    await sleep(900);
    await toColour(c);
    const b4 = await bindings(c, [S1, S2]);
    const actScene = await c.json('(window.__dbg.aeon.state() || {})');
    const s4 = await readSentence(c);
    await shot(c, 'c4-unknown');
    check('c4', 'THE FOURTH CASE, WHICH IS THE DEFAULT ONE IN AEON\'S TREE: the section binds the '
      + 'preset but its `sceneRef` is the ACT DEFAULT, and this act names no editor scene — so the '
      + 'scroll config is aeon\'s hand-authored `act_parallax_config`, a file this editor has '
      + 'never opened. The card says NOT DECIDED and names it, rather than folding the case into '
      + '"full-screen" and asserting something about a document nobody here has read',
      b4[S1].raster === PRESET_ID && b4[S1].scene === null && b4[S2].raster === null
      && says(s4, [LEAD_UNKNOWN, 'act_parallax_config', 'act_descriptor.emp',
        'Aurora does not read'],
      [LEAD_FULL, LEAD_COLUMN, LEAD_SPLIT, LEAD_UNBOUND]),
      `bindings = ${JSON.stringify(b4)}; app state = ${JSON.stringify(actScene)}\n`
      + `        sentence = ${s4 && s4.text}`);

    // ══════════════════════════════════════════════════════════════════════
    // [hv] THE SPLIT — painted short, contract long, on the SAME element
    // ══════════════════════════════════════════════════════════════════════
    console.log('\n=== [hv] the painted/hover split ===');
    check('hv', 'THE SPLIT IS REAL AND BOTH HALVES ARE REACHABLE: the painted sentence is at '
      + 'author length and the SAME element carries the contract text on its `title` — the '
      + 'measured aeon chain, the two engine sources, and the capability conjunct with the game '
      + 'on each side of it. This panel once rendered 8,059 characters before its first control, '
      + 'so the long half must be a hover; a rule an author must ACT ON must not be',
      !!s4 && s4.title.length > s4.full.length
      && ['$0B bit 2', 'pcfg_v_deform_table_bg', 'scene_dsl.emp', 'parallax.emp',
        'CAP_PER_COL_VSRAM', 'sonic4', 'demo', 'ddaab282',
        'RELAYED, NOT MEASURED HERE'].every((n) => s4.title.includes(n)),
      `painted ${s4 ? s4.full.length : 0} chars, title ${s4 ? s4.title.length : 0} chars\n`
      + `        title = ${s4 ? s4.title.slice(0, 300) : '(none)'}…`);

    // ══════════════════════════════════════════════════════════════════════
    // Leave the app as we found it. Nothing was written to disk — no save is
    // issued and the app has no autosave — but the history is walked back so a
    // following run opens on the same documents.
    // ══════════════════════════════════════════════════════════════════════
    // ⚠ THE UNDO NEEDS THE KEYBOARD OUT OF A TEXT BOX: `LevelWorkspace`'s
    // `isTypingTarget` deliberately does not steal Ctrl+Z from an input.
    await c.evalExpr("(() => { const a = document.activeElement; if (a && a.blur) a.blur(); })()");
    await sleep(200);
    for (let i = 0; i < 80 && (await c.evalExpr('window.__dbg.aeon.canUndo()')); i++) {
      await ctrlZ(c); await sleep(110);
      if ((await presetDoc(c)) === null && (await sceneDoc(c, SCENE_VDEF)) === null
        && (await sceneDoc(c, SCENE_FLAT)) === null) break;
    }
    const leftP = await presetDoc(c);
    const leftA = await sceneDoc(c, SCENE_FLAT);
    const leftB = await sceneDoc(c, SCENE_VDEF);
    const leftRefs = await bindings(c, [S1, S2]);
    check('z', 'this run leaves nothing behind: the probe preset and both probe scenes are walked '
      + 'back out of the model by the app\'s own history, and both per-section bindings are back '
      + 'to what they were. Nothing was ever written to disk — no save is issued, and the sibling '
      + 'aeon checkout was opened READ-ONLY',
      leftP === null && leftA === null && leftB === null
      && leftRefs[S1].raster === null && leftRefs[S2].raster === null,
      `preset = ${JSON.stringify(leftP)}; scenes = ${JSON.stringify([leftA, leftB])}; `
      + `refs = ${JSON.stringify(leftRefs)}`);

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
