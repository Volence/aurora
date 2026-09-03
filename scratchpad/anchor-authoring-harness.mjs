#!/usr/bin/env node
// THE MOVING ANCHOR, ON SCREEN — EW-TIMELINE-CLOCK / ROADMAP row 95.
//
// ============================================================================
// WHY A HARNESS AND NOT (ONLY) A NODE ROW
// ============================================================================
//
// `src/renderer/providers/__tests__/effects-preset-anchors.test.ts` is 32 rows
// and it cannot see any of this. The node suite has no React, no layout and no
// clock: ~6,500 of its rows pass over a screen an author cannot use, and the
// observed rate for UI shipped on unit tests alone in this repo is three
// defects in ten minutes of real use. Four claims need the running app:
//
//   1. THE CONTROLS ARE REACHABLE. The section is declared on the Colour
//      sub-tab and its siblings are UNMOUNTED, so a section registered in the
//      table but never rendered — or rendered on the wrong tab — is invisible
//      to every text finder in this repo. Rows [2*].
//   2. THE SELECTS ARE THE LADDER, MEASURED OFF THE LIVE DOM. The whole hazard
//      of this key is that `amp_shift` is a base-2 logarithm and a control that
//      rounds one silently doubles the amplitude. Row [4a] reads the `<option>`
//      values out of the rendered select and compares them to the CODEC's
//      ladder, computed in THIS process; [4b] drives a real change and reads
//      the document back. Rows [4*].
//   3. THE VALUE THAT LANDS IS THE VALUE THAT WAS TYPED. `drift.rate` is
//      1/256 px per frame and the scene panel multiplies by 256 on export; a
//      world Y through that habit lands 256 times down the level, validates
//      clean, and the band silently never appears. Row [3c] types a number and
//      reads the DOCUMENT back. It is the row this parcel would be worthless
//      without.
//   4. THE CLOCK RUNS, AND COSTS THE MAP NOTHING. Rows [6*] and [7*].
//
// ============================================================================
// ⚠ THE IDLE-REPAINT PROPERTY, AND HOW ROW [6c] AVOIDS BEING VACUOUS
// ============================================================================
//
// MapViewport has a measured zero-idle-repaint property (37/37 rows,
// `scratchpad/mapviewport-baseline-harness.mjs`). This parcel adds the only
// timer in the editor, and "the clock does not spend it" is the claim.
//
// A row that just counts zero repaints is green on FOUR different failures: the
// probe not installed, the probe bound to a canvas React has replaced, the
// renderer wedged, and the clock never having started. So [6c] asserts all four
// of its own preconditions in the same breath:
//
//   * the probe reports `bound() === true` against the LIVE #map-canvas;
//   * the harness's OWN rAF ticker advanced (the renderer is alive);
//   * `__anchorFrames` advanced during the SAME window (the clock really ran);
//   * and [6d] pans the map and requires a repaint to be recorded, so the probe
//     is proven able to see one before [6c]'s zero is believed.
//
// ============================================================================
// ⚠ THE TRAPS EVERY PAINT ROW HERE IS WRITTEN AROUND
// ============================================================================
//
// `checkVisibility()` and `getClientRects()` BOTH return true/1 for an element
// scrolled entirely out of its own scroller — measured in this repo at 2,635px
// out. So every paint row compares the element's rect to the SCROLLER'S box and
// requires a strict `elementFromPoint`; the trio is printed as evidence and is
// never the gate.
//
// `.click()` is not a click when the app listens for something else — but every
// handler on this path is `onClick` or a React `change`, and the selects are
// driven through the native value setter plus `input`+`change`, which is what
// React's synthetic layer actually listens for.
//
// `devicePixelRatio` varies run to run on this box, so it is PRINTED and no
// expectation is derived from it; the preview's own backing store is derived
// from it inside the app and the rows below aim at integer CSS pixels.
//
// ⚠ THIS HARNESS MUTATES THE OPEN DOCUMENT IN MEMORY and SAVES NOTHING. Run it
//   against a FRESH extract.
// ⚠ NO EMULATOR, EVER. Nothing here has seen a ROM.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:anchor-authoring
//
//   PLANT=rot-section … look for the anchors section under a title nothing
//                       renders. [2a] must catch it and the run must ABORT.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9471);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 91);
const SCREEN = process.env.SCREEN ?? '1680x1050';
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-anchor-authoring`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';
const t0 = Date.now();
const upt = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

// ── THE CONTRACT, READ IN THIS PROCESS ───────────────────────────────────────
//
// ⚠ THE LADDERS ARE COMPUTED HERE FROM THE VENDORED SCHEMA, not imported from
// the app and not typed as literals. Row [4a]'s whole claim is "the select
// offers the schema's rungs"; a literal list here would agree with a provider
// that had drifted, and importing the provider's own option list would make the
// row say "the select shows what the provider says", which it cannot fail.
const SCHEMA = JSON.parse(
  readFileSync(`${ROOT}/src/core/formats/effects/aurora-effects-preset.schema.json`, 'utf8'));
const SWEEP = SCHEMA.$defs.anchor_sweep;
const num = (re, where, what) => {
  const m = re.exec(where);
  if (!m) throw new Error(`the schema no longer states ${what} in the shape ${re}`);
  return Number(m[1]);
};
const AMP_BASE = num(/peak excursion (\d+) >> amp_shift px/, SWEEP.properties.amp_shift.description,
  'the amplitude base');
const PERIOD_BASE = num(/one cycle is (\d+) << period_shift logic ticks/,
  SWEEP.properties.period_shift.description, 'the period base');
const HZ = num(/at (\d+) Hz/, SWEEP.description, 'the tick rate');
const range = (node) => Array.from(
  { length: node.maximum - node.minimum + 1 }, (_, i) => node.minimum + i);
const AMP_SHIFTS = range(SWEEP.properties.amp_shift);
const PERIOD_SHIFTS = range(SWEEP.properties.period_shift);
const AMP_PEAK = (s) => AMP_BASE >> s;
const PERIOD_SECONDS = (s) => (PERIOD_BASE * (2 ** s)) / HZ;
const MAX_PATCH = SCHEMA.properties.patch_world_ys.maxItems;
const SENTINEL = SCHEMA.properties.patch_world_ys.items.oneOf[0].not.const;
const WORLD_Y_MAX = SCHEMA.properties.patch_world_ys.items.oneOf[0].maximum;

/** The section id this parcel adds, and the tab the table puts it on. */
const SECTION_ID = 'aeon.effects.preset.anchors';
const OWNING_TAB = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/providers/effects-sub-tabs.ts`, 'utf8');
  for (const m of src.matchAll(/id: '(\w+)',[\s\S]*?sections: \[([^\]]+)\]/g)) {
    if (m[2].includes(`'${SECTION_ID}'`)) return m[1];
  }
  throw new Error(`${SECTION_ID} is in no sub-tab — a section nobody can reach`);
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
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(id, text) { console.log(`      [${id}] ${text}`); }

// ── PAGE-SIDE SNIPPETS ───────────────────────────────────────────────────────

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const CLICK_TAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-tab';
  t.click();
  return 'ok';
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
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return 'ok';
})()`;

/**
 * A CONTROL BY THE LABEL OF ITS OWN ROW, never by position. `Field` renders
 * `<div><span>label</span>{control}</div>`, so a control's parent's first child
 * is its label — the one thing unique per row in this section.
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

const STRIP = `document.querySelector('[data-effects-section-strip]')`;

/** Every section header the column is painting, right now. */
const HEADERS = String.raw`(() => {
  const col = ${STRIP} ? ${STRIP}.parentElement : null;
  if (!col) return { found: false };
  return {
    found: true,
    heads: [...col.querySelectorAll('div')]
      .filter((d) => d.style && d.style.cursor === 'pointer')
      .map((d) => (d.innerText || '').trim().split('\n')[0]),
  };
})()`;

const ANCHORS_RE = PLANT === 'rot-section'
  ? String.raw`/^Preset — .* — NO SUCH SECTION\b/`
  : String.raw`/^Preset — .* — moving anchors\b/`;

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
    return 'no-header: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

const CHANNEL_SEL = IN_ROW(String.raw`/^Channel 0$/`, 'select');
const MOVEMENT_SEL = IN_ROW(String.raw`/^Movement$/`, 'select');
const TRAVEL_SEL = IN_ROW(String.raw`/^Travel$/`, 'select');
const CYCLE_SEL = IN_ROW(String.raw`/^Cycle$/`, 'select');
const WORLDY_IN = IN_ROW(String.raw`/^World Y$/`, 'input[type="number"]');
const PREVIEW = `document.querySelector('[data-anchor-preview="0"]')`;

/**
 * A control's paint, judged against the SCROLLER'S box — never `checkVisibility`
 * or `getClientRects`, both of which are TRUE on an element 2,635px out of its
 * scroller. Those two are recorded as evidence and are never the gate.
 */
const PAINT = (selector) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return { found: false };
  const col = ${STRIP} ? ${STRIP}.parentElement : null;
  const r = el.getBoundingClientRect();
  const cb = col ? col.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(
    Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return {
    found: true,
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    insideScroller: !!(cb && r.top >= cb.top - 1 && r.bottom <= cb.bottom + 1),
    hitIsSelf: hit === el || el.contains(hit),
    tag: el.tagName,
    options: el.tagName === 'SELECT' ? [...el.options].map((o) => o.value) : null,
    value: 'value' in el ? el.value : null,
    labels: el.tagName === 'SELECT' ? [...el.options].map((o) => o.textContent.trim()) : null,
    // RECORDED, NEVER THE GATE — both were true on the 2,635px-out defect.
    visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
    rects: el.getClientRects().length,
  };
})()`;

/**
 * SCROLL A CONTROL INTO THE COLUMN'S VIEW BEFORE MEASURING IT.
 *
 * ⚠ NOT A WAY TO MAKE A PAINT ROW PASS. The claim a paint row makes here is
 * "this control is reachable and hit-testable", not "it happens to be in the
 * first 742px of a five-section column" — every section on this tab is below
 * the fold once the ones above it are open, which is what an accordion IS. What
 * would be a real defect is a control that cannot be brought into view at all,
 * or that is not hit-testable once it is; both are still measured, AFTER this.
 *
 * The scroll distance is REPORTED at [2e] so the fold cost of the new section
 * is on the record rather than hidden by this helper.
 */
const SCROLL_TO = (selector) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return -1;
  const col = ${STRIP} ? ${STRIP}.parentElement : null;
  if (!col) return -2;
  const before = Math.round(col.scrollTop);
  el.scrollIntoView({ block: 'center' });
  return Math.round(col.scrollTop) - before;
})()`;

/** The column's own extent, so the fold is a printed number and not a guess. */
const COLUMN = String.raw`(() => {
  const col = ${STRIP} ? ${STRIP}.parentElement : null;
  if (!col) return null;
  return { h: Math.round(col.clientHeight), sh: Math.round(col.scrollHeight),
           top: Math.round(col.scrollTop) };
})()`;

/** Every warning-toned sentence currently painted in the anchors section. */
const WARNINGS = String.raw`(() => {
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${ANCHORS_RE}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) return { found: false };
  const root = hdr.parentElement;
  return {
    found: true,
    text: (root.innerText || '').trim(),
  };
})()`;

// ── THE MAP-REPAINT PROBE ────────────────────────────────────────────────────
//
// Installed BY THE HARNESS, around MapViewport. The component is not modified
// and reports nothing about itself. Lifted verbatim in shape from
// `scratchpad/mapviewport-baseline-harness.mjs`, which is the instrument the
// 37/37 property was measured with — so the two numbers are comparable.
const INSTALL_PROBE = String.raw`
(() => {
  if (window.__mvProbe) return 'already-installed';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: [], ticks: 0, ticking: false };
  window.__mvProbe = P;
  P.mark = () => P.repaints.length;
  P.since = (n) => P.repaints.slice(n);
  P.bound = () => P.canvas === document.getElementById('map-canvas');
  P.rebind = () => { const el = document.getElementById('map-canvas'); if (el) P.canvas = el; return !!el; };
  const tick = () => { if (P.ticking) { P.ticks++; requestAnimationFrame(tick); } };
  P.startTicks = () => { if (!P.ticking) { P.ticking = true; requestAnimationFrame(tick); } };
  P.stopTicks = () => { P.ticking = false; };
  let cur = null;
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) {
      if (this === P.canvas) {
        const rec = { t0: performance.now(), ops: 0, blits: 0 };
        cur = rec;
        queueMicrotask(() => {
          if (rec.ops > 0) P.repaints.push({ at: rec.t0, ops: rec.ops, blits: rec.blits });
          if (cur === rec) cur = null;
        });
      }
      return wd.set.call(this, v);
    },
  });
  const proto = CanvasRenderingContext2D.prototype;
  const BLIT = { drawImage: 1, putImageData: 1 };
  for (const name of ['drawImage', 'putImageData', 'fillRect', 'clearRect', 'stroke', 'fill', 'fillText']) {
    const orig = proto[name];
    proto[name] = function (...args) {
      if (cur && this.canvas === P.canvas) { cur.ops++; if (BLIT[name]) cur.blits++; }
      return orig.apply(this, args);
    };
  }
  return 'installed';
})()`;

async function main() {
  console.log('=== anchor-authoring harness (EW-TIMELINE-CLOCK, ROADMAP row 95) ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}  screen ${SCREEN}`);
  console.log('    THE CONTRACT, COMPUTED IN THIS PROCESS FROM THE VENDORED SCHEMA:');
  console.log(`      amp rungs   : ${AMP_SHIFTS.map((s) => `${s}=${AMP_PEAK(s)}px`).join(' ')}`);
  console.log(`      period rungs: ${PERIOD_SHIFTS.map((s) => `${s}=${PERIOD_SECONDS(s).toFixed(2)}s`).join(' ')}`);
  console.log(`      max patch   : ${MAX_PATCH}   sentinel: ${SENTINEL}   world Y max: ${WORLD_Y_MAX}`);
  console.log(`      section     : ${SECTION_ID} → sub-tab "${OWNING_TAB}" (read from the table)`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', `-screen 0 ${SCREEN}x24`, RUN.electron, RUN.main],
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
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', true,
      `dpr = ${await c.evalExpr('window.devicePixelRatio')} — PRINTED, never derived from`);

    // A CLEAN ARRIVAL: disclosures persist, and every default-state claim below
    // is a claim about what a first-time author sees.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    const openProject = async () => {
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
      for (let i = 0; i < 40; i++) {
        const s = await c.json('window.__dbg.aeon.state()').catch(() => null);
        if (s && s.open) return s;
        await sleep(400);
      }
      return null;
    };
    const st = await openProject();
    check('1a', 'the COPIED aeon project is open', !!(st && st.open), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);
    check('1b', 'the Effects facet mounts', (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1500);

    // ── 2. REACHABILITY ────────────────────────────────────────────────────
    //
    // ⚠ ABSENCE ASSERTED WITH ITS OWN PRESENCE. A row that only says "the
    // anchors section is not on Parallax" is green when the finder is broken,
    // when the project failed to open and when the panel rendered nothing.
    const onArrival = await c.json(HEADERS);
    const shows = (heads, re) => heads.some((h) => new RegExp(re, 'i').test(h));
    check('2a', 'ANTI-VACUOUS: on the ARRIVAL tab the anchors section is not in the DOM at all — '
      + 'and the finder proves itself on a section that IS there',
      onArrival.found === true
      && !shows(onArrival.heads, 'moving anchors')
      && shows(onArrival.heads, '^Layers \\('),
      JSON.stringify(onArrival.heads));

    await c.evalExpr(CLICK_TAB(OWNING_TAB));
    await sleep(1200);
    const onColour = await c.json(HEADERS);
    const hasAnchors = onColour.found === true && shows(onColour.heads, 'moving anchors');
    check('2b', `the anchors section is PAINTED on the "${OWNING_TAB}" tab the table names — one `
      + 'click from the facet, no disclosure opened yet',
      hasAnchors,
      `${JSON.stringify(onColour.heads)}\n        (the tab was read from providers/effects-sub-tabs.ts, `
      + 'not chosen here)');
    if (!hasAnchors && PLANT === '') {
      throw new Error('the anchors section is not on its own tab — nothing below can be measured');
    }

    // Select a preset, so the section has a subject at all.
    const presets = await c.json('window.__dbg.aeon.presets()');
    const PRESET_ID = presets[0]?.id;
    check('2c', 'the project carries at least one preset, so the anchors section has a subject',
      !!PRESET_ID, JSON.stringify(presets));
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(PRESET_ID)})`);
    await sleep(800);

    const colShut = await c.json(COLUMN);
    const opened = await c.evalExpr(OPEN_SECTION(ANCHORS_RE, CHANNEL_SEL));
    await sleep(500);
    const scrolled = await c.evalExpr(SCROLL_TO(CHANNEL_SEL));
    await sleep(300);
    const chanPaint = await c.json(PAINT(CHANNEL_SEL));
    check('2d', 'the section OPENS on one click of its own header, and the Channel 0 picker is '
      + 'painted INSIDE the column and hit-testable',
      opened !== false && String(opened).startsWith('no-header') === false
      && chanPaint.found === true && chanPaint.insideScroller === true
      && chanPaint.hitIsSelf === true,
      `open → ${opened}; scrolled ${scrolled}px to reach it\n        ${JSON.stringify(chanPaint)}`
      + `\n        ⚠ the two that do NOT discriminate: checkVisibility=${chanPaint.visible} `
      + `rects=${chanPaint.rects}  uptime ${upt()}`);
    if (chanPaint.found !== true) throw new Error('the Channel 0 picker was not found');

    // ⚠ THE FOLD COST, REPORTED AND NOT ASSERTED. This section is the fifth on
    // the Colour tab and it is the tallest thing this panel can draw, so its
    // contents are below the fold the moment it opens — like every section on
    // this tab once the ones above it are open. There is no ruled budget to
    // gate against, so the numbers are PRINTED for the packet rather than
    // turned into a threshold this file would then own.
    const colOpen = await c.json(COLUMN);
    note('2e', `THE COLUMN, Colour tab: ${colShut.h}px visible against ${colShut.sh}px with the `
      + `anchors section SHUT (${(colShut.sh / colShut.h).toFixed(2)} screens), and ${colOpen.sh}px `
      + `with it OPEN and one channel drawn (${(colOpen.sh / colOpen.h).toFixed(2)} screens). `
      + `Reaching the first control took a ${scrolled}px scroll.`);

    // ── 3. THE SEED: three states, and the unit ────────────────────────────
    const docOf = async () => {
      const all = await c.json('JSON.parse(window.__dbg.aeon.presetsJson())');
      return all.find((p) => p.id === PRESET_ID);
    };
    const before = await docOf();
    check('3a', 'ANTI-VACUOUS: the chosen preset carries NEITHER anchor key before this run '
      + 'touches it',
      !('patch_world_ys' in before) && !('patch_motion' in before),
      JSON.stringify({ id: before.id, keys: Object.keys(before) }));

    const authored = await c.evalExpr(SET_SELECT(CHANNEL_SEL, 'authored'));
    await sleep(700);
    const afterAuthor = await docOf();
    await c.evalExpr(SCROLL_TO(WORLDY_IN));
    await sleep(250);
    const seedPaint = await c.json(PAINT(WORLDY_IN));
    check('3b', '⚠ 0 IS A REAL WORLD Y, SO A NEW CHANNEL IS NOT BORN ON ONE — picking "follow a '
      + 'world Y" writes a length-1 array with a non-zero seed, and the World Y field appears',
      authored === 'ok'
      && Array.isArray(afterAuthor.patch_world_ys)
      && afterAuthor.patch_world_ys.length === 1
      && typeof afterAuthor.patch_world_ys[0] === 'number'
      && afterAuthor.patch_world_ys[0] !== 0
      && seedPaint.found === true && seedPaint.insideScroller === true && seedPaint.hitIsSelf === true,
      `select → ${authored}; patch_world_ys = ${JSON.stringify(afterAuthor.patch_world_ys)}; `
      + `field ${JSON.stringify(seedPaint.rect)}`);

    // ⚠ THE ROW THIS PARCEL WOULD BE WORTHLESS WITHOUT.
    const TYPED = 320;
    await c.evalExpr(SET_INPUT(WORLDY_IN, TYPED));
    await sleep(700);
    const afterTyped = await docOf();
    check('3c', `⚠ THE UNIT: typing ${TYPED} writes ${TYPED}, NOT ${TYPED * 256} — nothing on this `
      + 'path multiplies (the drift.rate habit lands a world Y 256x down the level, where it '
      + 'validates clean and the band silently never appears)',
      afterTyped.patch_world_ys[0] === TYPED,
      `patch_world_ys = ${JSON.stringify(afterTyped.patch_world_ys)} — `
      + `the x256 value would be ${TYPED * 256}, inside the u16 range (max ${WORLD_Y_MAX})`);

    // The sentinel, refused ON SCREEN with a sentence naming the other spelling.
    await c.evalExpr(SET_INPUT(WORLDY_IN, SENTINEL));
    await sleep(700);
    const afterSentinel = await docOf();
    const warned = await c.json(WARNINGS);
    check('3d', `the engine sentinel ${SENTINEL} is REFUSED at the control — the document does not `
      + 'take it, and the sentence on screen points at the other spelling',
      afterSentinel.patch_world_ys[0] === TYPED
      && warned.found === true
      && warned.text.includes(String(SENTINEL))
      && /null/.test(warned.text),
      `patch_world_ys = ${JSON.stringify(afterSentinel.patch_world_ys)}\n        `
      + `sentence on screen: ${JSON.stringify(
        (warned.text || '').split('\n').filter((l) => l.includes(String(SENTINEL)))[0] ?? null)}`);

    // ── 4. THE LADDERS, MEASURED OFF THE LIVE DOM ──────────────────────────
    const swept = await c.evalExpr(SET_SELECT(MOVEMENT_SEL, 'sweep'));
    await sleep(800);
    const afterSweep = await docOf();
    check('4a', 'picking "sweep" writes a motion object whose two shifts are BOTH on the ladder',
      swept === 'ok'
      && Array.isArray(afterSweep.patch_motion)
      && afterSweep.patch_motion.length === 1
      && AMP_SHIFTS.includes(afterSweep.patch_motion[0].sweep.amp_shift)
      && PERIOD_SHIFTS.includes(afterSweep.patch_motion[0].sweep.period_shift),
      `select → ${swept}; patch_motion = ${JSON.stringify(afterSweep.patch_motion)}`);

    await c.evalExpr(SCROLL_TO(TRAVEL_SEL));
    await sleep(250);
    const travel = await c.json(PAINT(TRAVEL_SEL));
    const cycle = await c.json(PAINT(CYCLE_SEL));
    check('4b', '⚠ THE SELECTS ARE THE LADDER: the rendered options are EXACTLY the schema\'s '
      + 'rungs, in order, and each label carries the PHYSICAL quantity rather than the log',
      travel.found === true && cycle.found === true
      && JSON.stringify(travel.options) === JSON.stringify(AMP_SHIFTS.map(String))
      && JSON.stringify(cycle.options) === JSON.stringify(PERIOD_SHIFTS.map(String))
      && travel.labels.every((l, i) => l.includes(`${AMP_PEAK(AMP_SHIFTS[i])} px`))
      && cycle.labels.every((l, i) => l.includes(`${PERIOD_SECONDS(PERIOD_SHIFTS[i]).toFixed(2)} s`))
      && travel.insideScroller === true && travel.hitIsSelf === true,
      `travel  options ${JSON.stringify(travel.options)}\n        `
      + `travel  labels  ${JSON.stringify(travel.labels)}\n        `
      + `cycle   options ${JSON.stringify(cycle.options)}\n        `
      + `cycle   labels  ${JSON.stringify(cycle.labels)}\n        `
      + `expected amp ${JSON.stringify(AMP_SHIFTS)} / period ${JSON.stringify(PERIOD_SHIFTS)} `
      + '— COMPUTED IN THIS PROCESS FROM THE VENDORED SCHEMA');

    // ⚠ EVERY RUNG DRIVEN, AND THE DOCUMENT READ BACK. A control that rounded
    // by one rung would land the neighbour and be invisible in a spot check.
    const landed = [];
    for (const s of AMP_SHIFTS) {
      await c.evalExpr(SET_SELECT(TRAVEL_SEL, s));
      await sleep(260);
      const d = await docOf();
      landed.push([s, d.patch_motion[0].sweep.amp_shift]);
    }
    check('4c', '⚠ EVERY AMPLITUDE RUNG LANDS EXACTLY, none rounds to a neighbour — a base-2 '
      + 'shift off by one is a doubling that nothing downstream reports',
      landed.every(([asked, got]) => asked === got),
      `asked → got: ${JSON.stringify(landed)}  uptime ${upt()}`);

    const landedP = [];
    for (const s of PERIOD_SHIFTS) {
      await c.evalExpr(SET_SELECT(CYCLE_SEL, s));
      await sleep(260);
      const d = await docOf();
      landedP.push([s, d.patch_motion[0].sweep.period_shift]);
    }
    check('4d', 'every PERIOD rung lands exactly too',
      landedP.every(([asked, got]) => asked === got),
      `asked → got: ${JSON.stringify(landedP)}  uptime ${upt()}`);

    // ── 5. THE NO-OP AN AUTHOR WOULD OTHERWISE SHIP ────────────────────────
    await c.evalExpr(SET_SELECT(CHANNEL_SEL, 'unused'));
    await sleep(700);
    const noSeedDoc = await docOf();
    const noSeedText = await c.json(WARNINGS);
    check('5a', '⚠ A MOTION ON A CHANNEL WITH NO SEED IS CALLED OUT ON SCREEN, in the schema\'s '
      + 'own sentence — an author who ships this ships a no-op and nothing else would say so',
      noSeedDoc.patch_world_ys[0] === null
      && noSeedText.found === true
      && noSeedText.text.includes('A seed without a motion is legal and stationary'),
      `patch_world_ys = ${JSON.stringify(noSeedDoc.patch_world_ys)}\n        `
      + `sentence present: ${noSeedText.text.includes('A seed without a motion')}`);

    // Put the seed back, so the preview below is previewing a real channel.
    await c.evalExpr(SET_SELECT(CHANNEL_SEL, 'authored'));
    await sleep(600);
    const restored = await docOf();
    const goneText = await c.json(WARNINGS);
    check('5b', 'and the sentence GOES AWAY once the channel has a seed — it is a state, not a '
      + 'permanent banner',
      typeof restored.patch_world_ys[0] === 'number'
      && !goneText.text.includes('A seed without a motion is legal'),
      `patch_world_ys = ${JSON.stringify(restored.patch_world_ys)}`);

    // ── 6. THE CLOCK ───────────────────────────────────────────────────────
    const probe = await c.evalExpr(INSTALL_PROBE);
    const bound = await c.evalExpr('window.__mvProbe && window.__mvProbe.bound()');
    check('6a', 'the map-repaint probe is installed and BOUND to the live #map-canvas',
      (probe === 'installed' || probe === 'already-installed') && bound === true,
      `install → ${probe}; bound = ${bound}`);

    await c.evalExpr(SCROLL_TO(PREVIEW));
    await sleep(250);
    const previewPaint = await c.json(PAINT(PREVIEW));
    check('6b', 'the sweep preview canvas is PAINTED inside the column, at integer CSS pixels',
      previewPaint.found === true && previewPaint.insideScroller === true
      && previewPaint.hitIsSelf === true
      && previewPaint.rect.w > 0 && previewPaint.rect.h > 0,
      `${JSON.stringify(previewPaint.rect)}  dpr = ${await c.evalExpr('window.devicePixelRatio')}`);

    // ⚠ THE MEASUREMENT ROW, AND ITS FOUR PRECONDITIONS IN ONE BREATH.
    await c.evalExpr('window.__mvProbe.ticks = 0; window.__mvProbe.startTicks()');
    const mark = await c.evalExpr('window.__mvProbe.mark()');
    const f0 = await c.evalExpr(`(${PREVIEW}).__anchorFrames`);
    const px0 = await c.evalExpr(`(${PREVIEW}).toDataURL().slice(-96)`);
    const IDLE_MS = Number(process.env.IDLE_MS ?? 5000);
    await sleep(IDLE_MS);
    const f1 = await c.evalExpr(`(${PREVIEW}).__anchorFrames`);
    const px1 = await c.evalExpr(`(${PREVIEW}).toDataURL().slice(-96)`);
    const idleRepaints = (await c.json(`window.__mvProbe.since(${mark})`)).length;
    const ticks = await c.evalExpr('window.__mvProbe.ticks');
    const stillBound = await c.evalExpr('window.__mvProbe.bound()');
    await c.evalExpr('window.__mvProbe.stopTicks()');
    check('6c', `⚠ THE CLOCK RUNS AND THE MAP DOES NOT: over ${IDLE_MS / 1000}s with a sweep `
      + 'authored and nothing touched, the preview drew frames and its pixels changed, while '
      + 'MapViewport repainted ZERO times — with the probe still bound and the renderer alive',
      idleRepaints === 0 && stillBound === true
      && ticks > 60 && (f1 - f0) > 60 && px1 !== px0,
      `map repaints = ${idleRepaints}   preview frames = ${f1 - f0} (${f0} → ${f1})   `
      + `page rAF ticks = ${ticks}   pixels changed = ${px1 !== px0}   bound = ${stillBound}\n        `
      + 'ALL FIVE ARE THE ROW: a zero with no ticks is a dead renderer, a zero with no preview '
      + 'frames is a clock that never started, and a zero on an unbound probe is a probe watching '
      + `a canvas React replaced.  uptime ${upt()}`);

    // ANTI-VACUOUS FOR [6c]: prove the probe CAN see a repaint before its zero
    // is believed. A real overlay toggle is the cheapest repaint that does not
    // depend on this facet.
    //
    // ⚠ THE GESTURE HAS TO BE A REAL ONE THROUGH THE APP'S OWN VIEW STORE. The
    // first version of this row dispatched a `resize` event at `window` and
    // recorded ZERO repaints — MapViewport watches its ELEMENT through a
    // ResizeObserver, not the window, so the event went nowhere. A row whose
    // wake-up gesture is a no-op is a row that reports "the probe is broken"
    // about a working probe, which is the same false alarm one level down.
    const m2 = await c.evalExpr('window.__mvProbe.mark()');
    const panned = await c.evalExpr(`(async () => {
      if (typeof window.__dbg.setView !== 'function') return 'no-setView';
      window.__dbg.setView(211, 97, 1);
      await new Promise((r) => setTimeout(r, 300));
      return 'panned';
    })()`);
    await sleep(1200);
    const wakeRecs = await c.json(`window.__mvProbe.since(${m2})`);
    check('6d', 'ANTI-VACUOUS FOR [6c]: the probe DOES record a repaint when the map really '
      + 'repaints — so [6c]\'s zero is a measurement and not a broken instrument',
      panned === 'panned' && wakeRecs.length >= 1 && wakeRecs.some((r) => r.blits > 0),
      `pan → ${panned}; ${wakeRecs.length} repaint(s): ${JSON.stringify(wakeRecs)}  uptime ${upt()}`);

    // ── 7. THE CLOCK ONLY EXISTS WHILE SOMETHING IS ANIMATING ──────────────
    const pauseClicked = await c.evalExpr(clickByText('/^Pause$/'));
    await sleep(900);
    const gone = await c.evalExpr(`!!(${PREVIEW})`);
    const paused = await c.evalExpr(`!!document.querySelector('[data-anchor-preview-paused="0"]')`);
    check('7a', 'PAUSE removes the canvas entirely — the loop is torn down, not left idling on a '
      + 'frame that draws the same thing',
      pauseClicked === true && gone === false && paused === true,
      `click → ${pauseClicked}; canvas present = ${gone}; paused placeholder = ${paused}`);
    await c.evalExpr(clickByText('/^Play$/'));
    await sleep(900);

    // SETTING THE MOTION BACK TO "no motion" MUST REMOVE IT TOO.
    await c.evalExpr(SET_SELECT(MOVEMENT_SEL, 'still'));
    await sleep(800);
    const afterStill = await c.evalExpr(`!!(${PREVIEW})`);
    const stillDoc = await docOf();
    check('7b', 'and setting the movement back to "no motion" removes the preview — there is no '
      + 'loop when nothing is animating',
      afterStill === false && stillDoc.patch_motion[0] === null,
      `canvas present = ${afterStill}; patch_motion = ${JSON.stringify(stillDoc.patch_motion)}`);

    await c.evalExpr(SET_SELECT(MOVEMENT_SEL, 'sweep'));
    await sleep(800);
    const backOn = await c.evalExpr(`!!(${PREVIEW})`);
    await c.evalExpr(CLICK_TAB('parallax'));
    await sleep(1000);
    const offTab = await c.evalExpr(`!!(${PREVIEW})`);
    check('7c', 'and switching to another sub-tab UNMOUNTS it — the section is not hidden, it is '
      + 'gone, so no clock survives a tab switch',
      backOn === true && offTab === false,
      `preview on Colour = ${backOn}; on Parallax = ${offTab}`);

    // ── 8. THE HEADER ANNOUNCES ITSELF ─────────────────────────────────────
    await c.evalExpr(CLICK_TAB(OWNING_TAB));
    await sleep(1000);
    const heads = await c.json(HEADERS);
    const anchorHead = heads.heads.find((h) => /moving anchors/i.test(h)) ?? null;
    check('8a', `the shut section's own header now reads its channel count (n/${MAX_PATCH}), so a `
      + 'preset that uses the feature says so before anything is opened',
      anchorHead !== null && new RegExp(`\\(1/${MAX_PATCH}\\)`).test(anchorHead),
      `header text: ${JSON.stringify(anchorHead)}`);

    // ── 9. THE CAPTURE FOR THE OWNER ───────────────────────────────────────
    // ⚠ THE LOOK IS UNRATIFIED. He ruled the shape of this facet, not this
    // section's appearance; the packet parks these and names what I would
    // change.
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/anchors-section-open.png`, Buffer.from(shot.data, 'base64'));
    console.log(`    screenshot  : ${SHOTS}/anchors-section-open.png`);
    note('9a', 'the shot above is the section OPEN with one channel authored and a sweep running.');
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n════ ${pass}/${results.length} rows · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  if (fails.length) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
