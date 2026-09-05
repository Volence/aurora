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
//   5. THE BAND WARNING IS ON SCREEN, ON THE ONE CHANNEL IT CAN REACH. aeon
//      publishes the screen band each patch channel is confined to, and the fit
//      test is ONE-DIRECTIONAL. Channel 0 is 218 lines and the widest rung
//      travels 128px, so the warning CAN NEVER FIRE THERE — every other row in
//      this file drives channel 0, so a row written the obvious way would be
//      silent forever and read as coverage. Rows [10*] drive CHANNEL 1 (2
//      lines) and keep channel 0 as the control in the same breath.
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

// ── THE SCREEN BANDS, ALSO READ IN THIS PROCESS ──────────────────────────────
//
// aeon's generated sidecar, vendored at a pinned revision. Read here from the
// FILE, and the travel formula PARSED out of its own `how_to_use`, for the same
// reason the ladders above are: importing the app's `channel-bands.ts` would
// make the rows below say "the panel shows what the provider computes", which
// they cannot fail. aeon's own sentence said `256 >> amp_shift` — PEAK, half
// the real travel — until aeon 8d217dd4, so the factor is never remembered.
const BANDS = JSON.parse(
  readFileSync(`${ROOT}/src/core/formats/effects/aeon-effects-channel-bands.json`, 'utf8'));
const BAND = (ch) => BANDS.channels[String(ch)] ?? null;
/** The channels aeon DECLARES a band for, ascending — the feature's coverage. */
const EFFECTS_DECLARED = Object.keys(BANDS.channels).map(Number).sort((a, b) => a - b);
const TRAVEL_FORMULA = (() => {
  // ⚠ THE TAIL IS `EXCEEDS`, AND ONLY `EXCEEDS`. `CHBAND-PROSE-REPIN` closed
  // 2026-09-05. The SECOND of the two byte-identical copies of this regex; the
  // other is in src/core/formats/effects/channel-bands.ts. aeon's sentence used
  // to open clearance-shaped (`... whole pixels) is <=`) while the SAME string
  // said `never a clearance` further down; it was restated in the refusal
  // direction at aeon b8913cda, a transitional arm here accepted both across
  // the migration, and that arm is now deleted at BOTH copies together.
  //
  // ⚠ AND THIS COPY STAYS INDEPENDENT. It deliberately does NOT import
  // channel-bands.ts (see the note above): importing it would make the rows
  // below say "the panel shows what the provider computes", which they cannot
  // fail. Edit it in place; do not "fix" the duplication by importing. What
  // keeps the two copies honest is that they are compared byte for byte in
  // test/formats/effects-channel-bands-prose-repin.test.ts — this one throws on
  // no-match and nothing runs it on the way to a green suite, so left to itself
  // it is the copy that would silently stay behind.
  //
  // Only the multiplier and the base are read (2 and 256); the comparison
  // direction is hard-coded in REFUSED_ON below and is never inferred here.
  const m = /PEAK-TO-PEAK TRAVEL \((\d+) \* \((\d+) >> amp_shift\), whole pixels\) EXCEEDS channels\[c\]\.lines/
    .exec(BANDS.how_to_use ?? '');
  if (!m) throw new Error('the vendored bands sidecar no longer states the peak-to-peak fit formula in the refusal direction ("... whole pixels) EXCEEDS channels[c].lines"). If it says "is <=" it has regressed to the retired clearance-shaped wording — refused, not accepted (CHBAND-PROSE-REPIN)');
  return { mult: Number(m[1]), base: Number(m[2]) };
})();
const TRAVEL_PX = (s) => TRAVEL_FORMULA.mult * (TRAVEL_FORMULA.base >> s);
/** The rungs that CANNOT fit channel `ch`, widest first. Empty is a real answer. */
const REFUSED_ON = (ch) => {
  const b = BAND(ch);
  return b === null ? [] : AMP_SHIFTS.filter((s) => TRAVEL_PX(s) > b.lines);
};

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

/**
 * A CONTROL IN CHANNEL **N**'S CARD — and it exists because `IN_ROW` above
 * cannot express the row this parcel needs.
 *
 * `IN_ROW` takes the FIRST element whose row-label matches, which for `Travel`
 * is always channel 0's. That was harmless until EW-TIMELINE-CLOCK: aeon
 * declares channel 0's band as 218 screen lines and the WIDEST rung on the
 * amplitude ladder travels 128px, so the band warning CAN NEVER FIRE ON
 * CHANNEL 0. A row driving `TRAVEL_SEL` and looking for that sentence would be
 * silent forever and would read as coverage. The warning is reachable only on
 * channel 1 (2 lines), which is a second card with an identically-labelled row.
 *
 * `Card` renders each channel's `Field`s as siblings, and a `Field` is
 * `<div><span>label</span>{control}</div>` — so the card is the grandparent of
 * the `Channel N` label, and every row inside it is found by the same
 * label rule `IN_ROW` uses, scoped to that subtree.
 */
const CARD = (n) => String.raw`
(() => {
  const lab = [...document.querySelectorAll('span')]
    .find((s) => new RegExp('^Channel ' + ${JSON.stringify(String(n))} + '$')
      .test((s.textContent || '').trim()));
  const row = lab && lab.parentElement;
  return (row && row.parentElement) || null;
})()`;

const IN_CARD_ROW = (n, labelRe, tag) => String.raw`
(() => {
  const card = ${CARD(n)};
  if (!card) return null;
  return [...card.querySelectorAll(${JSON.stringify(tag)})]
    .find((el) => {
      const row = el.parentElement;
      const lab = row && row.firstElementChild;
      return !!(lab && lab.tagName === 'SPAN' && ${labelRe}.test((lab.textContent || '').trim()));
    }) || null;
})()`;

/**
 * Every sentence painted inside ONE channel's card.
 *
 * ⚠ NOT `WARNINGS`, WHICH READS THE WHOLE SECTION. A section-wide text match is
 * satisfied by any other refusal on this surface — the seed refusal, the
 * extend refusal, the motion-without-seed advisory — so a row asserting "the
 * band sentence is on screen" against it would pass on somebody else's
 * sentence (bar 2c: a matcher loose enough to catch a neighbouring error
 * reports coverage it does not have). This is scoped to the card whose control
 * produced the state.
 */
const CARD_TEXT = (n) => String.raw`
(() => {
  const card = ${CARD(n)};
  if (!card) return { found: false };
  return { found: true, text: (card.innerText || '').trim() };
})()`;

/**
 * THE COLOUR ONE SENTENCE IS ACTUALLY PAINTED IN, inside channel N's card.
 *
 * `Hint` renders `NOTE` (`--text-lo`) or, with `tone="warning"`, `WARN`
 * (`--warning`). Reading the JSX would only prove what the source says; this
 * reads `getComputedStyle` off the live node and resolves BOTH tokens off the
 * document root in the same call, so the row compares three measured values
 * rather than one measured value against a colour typed into this file.
 */
const TONE_IN_CARD = (n, needle) => String.raw`
(() => {
  const card = ${CARD(n)};
  if (!card) return { found: false };
  const el = [...card.querySelectorAll('div')]
    .filter((d) => (d.textContent || '').includes(${JSON.stringify(needle)}))
    .filter((d) => ![...d.children].some((k) => (k.textContent || '').includes(${JSON.stringify(needle)})))
    .pop();
  if (!el) return { found: false, cardText: (card.innerText || '').trim() };
  const cs = getComputedStyle(el);
  const rs = getComputedStyle(document.documentElement);
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  const resolve = (v) => { probe.style.color = ''; probe.style.color = v; return getComputedStyle(probe).color; };
  const note = resolve(rs.getPropertyValue('--text-lo').trim());
  const warn = resolve(rs.getPropertyValue('--warning').trim());
  probe.remove();
  return { found: true, colour: cs.color, note, warn, text: (el.textContent || '').trim() };
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

/**
 * CAN THE AUTHOR READ THE CONTROL HE IS ABOUT TO SET? — the [W*] rows.
 *
 * ═══ WHY A THIRD WIDTH PROBE EXISTS, AND WHY IT DOES NOT REUSE THE OTHER TWO ═══
 *
 * `effects-column-harness`'s `[L2]` asks whether a LABEL fits its column. That
 * is one of the two ways this column runs out of room, and it is the one that
 * announces itself: an over-wide label WRAPS, and a wrap is two line boxes you
 * can count. The other way is silent. The label column and the control share a
 * fixed-width row, so every pixel `LABEL_W` takes, a `<select style="flex:1">`
 * loses — and a select that runs out of room does not wrap and does not
 * overflow. It ELLIPSES, which is the layout absorbing the overflow so
 * completely that the element's own geometry stops carrying any trace of it.
 *
 * ⚠ THIS IS EXACTLY `[r4]`'s DEFECT IN A SECOND PLACE, AND IT IS WORSE HERE.
 * `[r4]` measured a wrapped label with a DOM Range and got the union of its line
 * boxes — a number bounded by the column, so a label wanting 84px reported 42.
 * A `<select>` has the same trap and no escape hatch: `scrollWidth` is clamped
 * to `clientWidth`, the option text is not a DOM text node a Range can select,
 * and `checkVisibility()` is `true` on a select showing three words of eight.
 * EVERY quantity the element will volunteer about itself is post-truncation.
 *
 * ═══ THE OBSERVABLE, AND WHY IT CANNOT BE BOUNDED BY THE COLUMN ═══
 *
 * The width the select WOULD need to show a given choice in full, measured on a
 * clone that is not in the layout at all:
 *
 *   - clone the live select, so padding, border, font size and the UA's own
 *     dropdown arrow come along and nothing here has to guess at any of them;
 *   - DELETE EVERY OPTION BUT ONE, because a `<select>` sized to its whole list
 *     answers a question about the longest option, and what truncates on screen
 *     is whichever one is currently chosen;
 *   - `position: absolute` off-screen with `width: max-content`, `flex: none`
 *     and `maxWidth: none`, so no flex line, no column and no `minWidth: 0`
 *     can bound the answer;
 *   - measure, then remove it in the same synchronous turn.
 *
 * ⚠ AND IT IS ASKED OF EVERY OPTION, NOT ONLY THE SELECTED ONE. Every option in
 * the list becomes the current choice the moment someone picks it, so a gate on
 * the selected option alone is green on the state the fixture happens to leave
 * behind and silent about the two an author reaches next. The three-state
 * pickers here are the case that matters: this run authors a channel, so `Movement`
 * sits on `sweep` and the row would never measure `no motion — …` at all.
 *
 * It is appended INSIDE the live row rather than to `<body>`, so it inherits
 * the same font-family the real control renders in. A probe measured against
 * the body's font would answer a question about a different typeface.
 *
 * ⚠ AND THE PROBE IS PROVEN ABLE TO SEE BOTH ANSWERS — row `[W0]`. A clone
 * technique that silently returned the rendered width (an option that failed to
 * detach, `max-content` unsupported, the style overrides not applying) would
 * report EVERY control as a perfect fit, forever, and this row would be the
 * same green whether or not anything fit. So `[W0]` requires the run to have
 * measured at least one control needing MORE than it has and at least one
 * needing LESS — a spread, not a verdict — and it prints every number it read.
 * Only then is `[W1]`'s judgement worth anything.
 */
const FIT = (sectionRe = ANCHORS_RE) => String.raw`(() => {
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${sectionRe}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) return { found: false };
  const root = hdr.parentElement;
  const out = [];
  for (const sel of root.querySelectorAll('select')) {
    const row = sel.parentElement;
    const labelEl = row && row.firstElementChild !== sel ? row.firstElementChild : null;
    const label = labelEl ? (labelEl.textContent || '').replace(/\s+/g, ' ').trim() : '?';
    const choice = sel.options[sel.selectedIndex]
      ? sel.options[sel.selectedIndex].textContent.trim() : '';
    const have = Math.ceil(sel.getBoundingClientRect().width);
    const widthOf = (value, overrideText) => {
      try {
        const probe = sel.cloneNode(true);
        for (const o of [...probe.options]) if (o.value !== value) o.remove();
        if (probe.options.length !== 1) return -1;
        if (overrideText !== undefined) probe.options[0].textContent = overrideText;
        probe.style.position = 'absolute';
        probe.style.left = '-99999px';
        probe.style.top = '0px';
        probe.style.width = 'max-content';
        probe.style.minWidth = '0px';
        probe.style.maxWidth = 'none';
        probe.style.flex = 'none';
        row.appendChild(probe);
        const w = Math.ceil(probe.getBoundingClientRect().width);
        probe.remove();
        return w;
      } catch (e) { return -1; }
    };
    const need = widthOf(sel.value);
    // Every option, because every one of them is one click from being the value
    // on screen. Reported per option so the gate's own artifact names WHICH
    // choice does not fit rather than only that one of them does not.
    const opts = [...sel.options].map((o) => ({
      text: o.textContent.trim(), w: widthOf(o.value), selected: o.value === sel.value,
    }));
    // The LABEL's own fit, on the same terms [L2] uses: the width one
    // unwrapped line would need, which is NOT what a Range over a label that
    // has already wrapped reports.
    let labelNeed = -1; let labelHave = -1;
    if (labelEl) {
      labelHave = labelEl.clientWidth;
      const prev = labelEl.style.whiteSpace;
      labelEl.style.whiteSpace = 'nowrap';
      const rg = document.createRange();
      rg.selectNodeContents(labelEl);
      labelNeed = Math.ceil(rg.getBoundingClientRect().width);
      labelEl.style.whiteSpace = prev;
    }
    // THE PROBE PROVING ITSELF, ON THIS RUN, IN THIS ROW'S OWN FONT.
    //
    // The anti-vacuity problem a fit gate has is that its healthy state is
    // "everything fits" — so "some control did not fit" cannot be its evidence
    // of life, or the gate goes vacuous on the very day the defect is fixed.
    // Instead the SAME widthOf is asked for the selected option's text with a
    // long run of Ms welded onto it. A clone that were silently reporting the
    // rendered width, or ignoring max-content, or failing to detach its
    // options, would hand back the same number for both. This one must come
    // back strictly wider AND past the room the select actually has.
    const calText = choice + ' MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM';
    const calW = widthOf(sel.value, calText);
    out.push({ label, choice, have, need, labelHave, labelNeed, opts, calW, calText });
  }
  const col = ${STRIP} ? ${STRIP}.parentElement : null;
  return { found: true, columnW: col ? Math.round(col.getBoundingClientRect().width) : -1,
           controls: out };
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

    // ── W. THE CONTROLS ARE LEGIBLE, NOT MERELY PRESENT ────────────────────
    //
    // Every row above this one asks whether a control is THERE, whether it
    // offers the schema's rungs, and whether what it writes is what was asked
    // for. Not one of them asks whether the author can READ it. The owner's
    // standing complaint about this tooling is "so confusing and convoluted...
    // I was just lost", and O56 booked the same finding again as controls that
    // were reachable in one click and "very quietly labelled". A control whose
    // current value is ellipsed to three words of eight has not shipped, and
    // twenty-five green rows said nothing about it.
    await c.evalExpr(OPEN_SECTION(ANCHORS_RE, CHANNEL_SEL));
    await sleep(500);
    const fit = await c.json(FIT());
    if (fit.found !== true) throw new Error('the anchors section was not found for the [W*] rows');
    // ⚠ THE ARTIFACT IS PRINTED, NOT SUMMARISED. A width gate that says only
    // "3 controls truncate" cannot be audited for its AIM by anyone who did not
    // write it. Every option's own number is on screen beside the room it has,
    // so a reader can check that the quantity being judged is one that can
    // still be too wide after the layout has absorbed the overflow.
    const allOpts = fit.controls.flatMap(
      (r) => r.opts.map((o) => ({ ...o, label: r.label, have: r.have })));
    const shown = (o) => `"${o.label}" ${o.selected ? '→' : ' ·'} "${o.text}": `
      + `needs ${o.w}px, has ${o.have}px`;
    const unmeasured = allOpts.filter((o) => !(o.w > 0));
    const tooWide = allOpts.filter((o) => o.w > 0 && o.w > o.have);
    const fits = allOpts.filter((o) => o.w > 0 && o.w <= o.have);
    // ⚠ [W0] IS WHAT MAKES [W1] MEAN ANYTHING, AND IT CANNOT BE "SOMETHING DID
    // NOT FIT". A fit gate's healthy state is that everything fits, so evidence
    // of life drawn from the app's own defects expires the day they are fixed —
    // which is the day the gate starts mattering. So the probe is proved on
    // text it MAKES too long: the selected option plus forty Ms, through the
    // same `widthOf`, in the same row, in the same font. A clone reporting the
    // rendered width, ignoring `max-content`, or failing to detach its options
    // returns the same number for both, and this row says so.
    const cal = fit.controls.map((r) => ({
      label: r.label, need: r.need, calW: r.calW, have: r.have,
      grew: r.calW > r.need, past: r.calW > r.have,
    }));
    const calBad = cal.filter((x) => !(x.grew && x.past) || !(x.need > 0));
    check('W0', 'ANTI-VACUOUS: the fit probe is PROVEN able to report a control that does not fit '
      + '— the same measurement, on each select\'s own choice with 40 Ms welded on, comes back '
      + 'strictly wider and past the room the select has',
      calBad.length === 0 && cal.length > 0 && unmeasured.length === 0,
      `${allOpts.length} options over ${fit.controls.length} selects in a ${fit.columnW}px column `
      + `(dpr ${await c.evalExpr('window.devicePixelRatio')}); ${tooWide.length} need more room, `
      + `${fits.length} fit, ${unmeasured.length} UNMEASURABLE\n        `
      + cal.map((x) => `"${x.label}": real choice ${x.need}px → padded ${x.calW}px in ${x.have}px `
        + `(grew ${x.grew}, past the box ${x.past})`).join('\n        '));
    // ⚠ EVERY OPTION, NOT THE SELECTED ONE. See the FIT docblock: an option the
    // fixture did not happen to select is one click from being what the author
    // is reading, and a gate that skips it ships a truncated screen.
    check('W1', 'every choice EVERY select here can show is shown in full — not just the one this '
      + 'run happens to have selected',
      tooWide.length === 0 && unmeasured.length === 0,
      unmeasured.length
        ? `COULD NOT MEASURE ${unmeasured.length} option(s): `
          + unmeasured.map((o) => `"${o.label}"/"${o.text}"`).join(', ')
        : tooWide.length
          ? tooWide.map((o) => `TRUNCATED by ${o.w - o.have}px — ${shown(o)}`).join('\n        ')
          : `all ${allOpts.length} options fit; tightest is `
            + shown(allOpts.reduce((a, o) => (o.have - o.w < a.have - a.w ? o : a), allOpts[0]))
            + ` (${allOpts.reduce((m, o) => Math.min(m, o.have - o.w), Infinity)}px to spare)`);
    // The label half, asked in the section [L2] cannot see: [L2] measures the
    // Parallax column, and this section is on another sub-tab and therefore
    // UNMOUNTED while that harness runs.
    //
    // ⚠ W2 HAS ITS OWN FORMATTER AND THAT IS NOT AN ACCIDENT. It first reused
    // `shown`, which is written for OPTION records — so on its very first red
    // run it printed `"Channel 0" · "undefined": needs undefinedpx` for all six
    // labels. The row was RIGHT and its evidence was worthless, and no green run
    // could ever have shown that: a gate's failure message is only exercised
    // when it fails, which is the one moment somebody needs to read it.
    const shownLabel = (r) => `"${r.label}": needs ${r.labelNeed}px, `
      + `has ${r.labelHave}px of label column`;
    const labelBad = fit.controls.filter((r) => !(r.labelNeed > 0) || r.labelNeed > r.labelHave);
    const widestLabel = fit.controls.reduce(
      (a, r) => (r.labelNeed > a.labelNeed ? r : a), fit.controls[0]);
    check('W2', 'and no label in this section is wider than the shared label column it sits in',
      labelBad.length === 0,
      labelBad.length
        ? labelBad.map((r) => (r.labelNeed > 0
          ? `TOO WIDE by ${r.labelNeed - r.labelHave}px — ${shownLabel(r)}`
          : `COULD NOT MEASURE — ${shownLabel(r)}`)).join('\n        ')
        : `all ${fit.controls.length} labels fit; widest is ${shownLabel(widestLabel)} `
          + `(${widestLabel.labelHave - widestLabel.labelNeed}px to spare)`);

    // ── W3. THE SAME MEASUREMENT NEXT DOOR — REPORTED, DELIBERATELY NOT GATED ──
    //
    // `aeon.effects.preset.channels` is the sibling section on this same tab,
    // drawing the same `Field` rows into the same 190px selects from the same
    // three-state vocabulary. It is NOT this parcel's surface and its strings
    // were not touched, so a gate here would leave this file red over somebody
    // else's wording and teach the next reader to skip it. It is measured
    // anyway, because "I did not look" and "I looked and it is fine" are
    // different claims and only one of them is worth writing down.
    //
    // ⚠ IF THIS PRINTS TRUNCATIONS THEY ARE REAL DEFECTS, not noise, and they
    // belong in the packet with these numbers beside them. The gate that would
    // own them is a copy of [W1] pointed at this section, once its wording has
    // an owner.
    const CHANNELS_RE = String.raw`/^Preset — .* — cycles, variants\b/`;
    await c.evalExpr(OPEN_SECTION(CHANNELS_RE, `document.querySelector('#aeon\\\\.effects\\\\.preset\\\\.channels select')`));
    await sleep(700);
    const nfit = await c.json(FIT(CHANNELS_RE));
    if (nfit.found !== true || nfit.controls.length === 0) {
      note('W3', 'THE NEIGHBOURING SECTION WAS NOT MEASURED: '
        + `found=${nfit.found}, ${nfit.found ? nfit.controls.length : '-'} selects. `
        + 'Not a pass — nothing was checked next door.');
    } else {
      const nOpts = nfit.controls.flatMap(
        (r) => r.opts.map((o) => ({ ...o, label: r.label, have: r.have })));
      const nBad = nOpts.filter((o) => o.w > 0 && o.w > o.have);
      note('W3', `NEIGHBOUR "cycles, variants" (not gated here): ${nOpts.length} options over `
        + `${nfit.controls.length} selects, ${nBad.length} TRUNCATED.`
        + (nBad.length
          ? `\n        ` + [...new Set(nBad.map((o) => `"${o.text}" needs ${o.w}px, has ${o.have}px`))]
            .join('\n        ')
          : ' Every choice fits.'));
    }

    // ── 10. THE SWEEP THAT CANNOT FIT ITS BAND, ON SCREEN ──────────────────
    //
    // EW-TIMELINE-CLOCK's second half. aeon publishes the screen band each
    // patch channel's boundary is confined to, and its fit test is
    // ONE-DIRECTIONAL: travel > lines is CERTAIN, travel <= lines is CANNOT
    // TELL because the latched line is (anchor - Camera_Y) and the camera
    // decides where the sweep sits.
    //
    // ⚠ THESE ROWS AIM AT CHANNEL 1, AND THE REASON IS THE WHOLE PARCEL.
    // Channel 0 is 218 lines and the widest rung travels 128px, so the warning
    // CANNOT FIRE THERE — a row driving the section's first `Travel` select
    // (which is what every other row here does) would be silent forever with
    // the rule inverted, deleted, or aimed at the wrong field, and would read
    // as coverage. `[10b]` measures channel 0 as the CONTROL, in the same
    // breath as `[10a]` fires on channel 1, so the pair distinguishes "the
    // warning works" from "the warning is a constant".
    await c.evalExpr(OPEN_SECTION(ANCHORS_RE, CHANNEL_SEL));
    await sleep(500);

    const B0 = BAND(0);
    const B1 = BAND(1);
    const REFUSED1 = REFUSED_ON(1);
    console.log(`    bands       : ch0 ${B0 ? `[${B0.lo},${B0.hi}] ${B0.lines} lines` : 'NONE'}`
      + `   ch1 ${B1 ? `[${B1.lo},${B1.hi}] ${B1.lines} lines` : 'NONE'}`);
    console.log(`    refusable   : ch0 rungs ${JSON.stringify(REFUSED_ON(0))}`
      + `   ch1 rungs ${JSON.stringify(REFUSED1)}  (from the VENDORED sidecar, in this process)`);

    // Channel 0 must be sweeping for channel 1's card to exist at all: the
    // arrays are positional and never given a hole, so index 1 is offered only
    // when index 0 is spelled.
    await c.evalExpr(SET_SELECT(MOVEMENT_SEL, 'sweep'));
    await sleep(700);
    const MOVEMENT_1 = IN_CARD_ROW(1, String.raw`/^Movement$/`, 'select');
    const swept1 = await c.evalExpr(SET_SELECT(MOVEMENT_1, 'sweep'));
    await sleep(800);
    const TRAVEL_1 = IN_CARD_ROW(1, String.raw`/^Travel$/`, 'select');
    // The WIDEST rung, which is the loudest violation the ladder can express.
    const WIDE = REFUSED1[0];
    const setWide = WIDE === undefined ? 'no-refusable-rung' : await c.evalExpr(SET_SELECT(TRAVEL_1, WIDE));
    await sleep(700);
    await c.evalExpr(SCROLL_TO(TRAVEL_1));
    await sleep(300);
    const card1 = await c.json(CARD_TEXT(1));
    const travel1Paint = await c.json(PAINT(TRAVEL_1));
    const wideTravel = WIDE === undefined ? null : TRAVEL_PX(WIDE);
    // The five things the sentence must carry, each checked separately so a
    // failure names which half of it is wrong.
    const says = (s) => card1.found === true && card1.text.includes(s);
    check('10a', `⚠ A SWEEP THAT CANNOT FIT IS CALLED OUT ON SCREEN, in channel 1's own card: `
      + `${wideTravel}px of travel against a ${B1 ? B1.lines : '?'}-line band, with BOTH edge `
      + 'behaviours named and neither called "clipped"',
      swept1 === 'ok' && setWide === 'ok' && WIDE !== undefined && B1 !== null
      && says(`${wideTravel} px of travel`)
      && says('channel 1')
      && says(`${B1.lo}–${B1.hi}`)
      && says(`${wideTravel} > ${B1.lines}`)
      // Past hi: NOT EMITTED, and explicitly not pinned to hi.
      && says('not emitted at all') && says(`does not pin to ${B1.hi}`)
      // Below lo: still emitted, clamped up, visible. The opposite outcome.
      && says(`clamped up to ${B1.lo}`) && says('stays visible')
      && !/clip/i.test(card1.text)
      // ...and it is PAINTED where the control is, not merely in the DOM.
      && travel1Paint.found === true && travel1Paint.insideScroller === true,
      `movement→${swept1}  travel→${setWide} (amp_shift ${WIDE} = ${wideTravel}px)\n        `
      + `Travel select rect ${JSON.stringify(travel1Paint.rect)} `
      + `insideScroller=${travel1Paint.insideScroller} hitIsSelf=${travel1Paint.hitIsSelf}\n        `
      + `CARD 1 TEXT ON SCREEN:\n        `
      + (card1.found ? card1.text.split('\n').map((l) => `| ${l}`).join('\n        ') : '(no card)'));

    // ⚠ THE CONTROL, AND IT IS NOT A FORMALITY. This is the row that separates
    // "the warning is computed per channel" from "the warning is a constant
    // string rendered whenever a sweep exists".
    const card0 = await c.json(CARD_TEXT(0));
    check('10b', 'CONTROL: the SAME rung on CHANNEL 0 paints NO band warning — channel 0 is '
      + `${B0 ? B0.lines : '?'} lines and the widest rung travels ${TRAVEL_PX(AMP_SHIFTS[0])}px, so `
      + 'no legal sweep can be refused there and the sentence must be absent',
      REFUSED_ON(0).length === 0
      && card0.found === true
      && !card0.text.includes('cannot fit channel')
      && !/clamped up to/.test(card0.text)
      // ...and no CLEARANCE either. Added after a plant painting "Fits ✓" on
      // every cannot-tell channel left this row green while [10c] caught it:
      // an absence-of-warning row does not, by itself, forbid a reassurance.
      && !/\bfits\b/i.test(card0.text) && !/✓/.test(card0.text),
      `ch0 refusable rungs = ${JSON.stringify(REFUSED_ON(0))} (empty is the measured fact)\n        `
      + `CARD 0 TEXT ON SCREEN:\n        `
      + (card0.found ? card0.text.split('\n').map((l) => `| ${l}`).join('\n        ') : '(no card)'));

    // ⚠ AND NO CLEARANCE, EVER. travel == lines is the widest that FITS by the
    // contract's own arithmetic, and it is still CANNOT TELL: where the sweep
    // sits inside [lo, hi] is camera-decided. A green "fits" badge here is the
    // tempting build and the one this data forbids.
    const NARROW = AMP_SHIFTS[AMP_SHIFTS.length - 1];
    const setNarrow = await c.evalExpr(SET_SELECT(TRAVEL_1, NARROW));
    await sleep(700);
    const card1Narrow = await c.json(CARD_TEXT(1));
    check('10c', `⚠ NO CLEARANCE IS EVER PAINTED: at ${TRAVEL_PX(NARROW)}px of travel — exactly `
      + `channel 1's ${B1 ? B1.lines : '?'} lines, the widest that fits — the warning goes away and `
      + 'NOTHING replaces it. "travel <= lines" is CANNOT TELL, not a pass',
      setNarrow === 'ok' && card1Narrow.found === true
      && !card1Narrow.text.includes('cannot fit channel')
      && !/\bfits\b/i.test(card1Narrow.text)
      && !/\bok\b/i.test(card1Narrow.text)
      && !/✓/.test(card1Narrow.text),
      `travel→${setNarrow} (amp_shift ${NARROW} = ${TRAVEL_PX(NARROW)}px, band lines `
      + `${B1 ? B1.lines : '?'})\n        CARD 1 TEXT ON SCREEN:\n        `
      + (card1Narrow.found
        ? card1Narrow.text.split('\n').map((l) => `| ${l}`).join('\n        ')
        : '(no card)'));

    // ── 10d. THE CHANNEL AEON DOCUMENTS NOTHING ABOUT, ON SCREEN ───────────
    //
    // ⚠ THIS IS A PRESENCE ROW — A DISCRIMINATOR — AND [10b]/[10c] ARE NOT.
    // Those two are absence assertions and go green against an app with no
    // band feature at all; this one names a sentence that must be PAINTED, so
    // it reddens when the advisory is missing, mis-worded, or aimed at the
    // wrong channel. It is stated so nobody reads three rows as three proofs.
    //
    // ⚠ AND IT AIMS AT CHANNEL 2, NOT CHANNEL 0 OR 1. `RASTER_MAX_PATCH` is 4
    // and aeon declares bands for 0 and 1, so channel 2 is the FIRST channel
    // with no declaration — the silence this parcel replaced. A row driving
    // the section's first `Travel` (channel 0) would measure a channel that
    // HAS a band and could never see this sentence. The undeclared channel is
    // read from the vendored sidecar in this process, not assumed to be 2.
    const NOBAND = (() => {
      for (let c = 0; c < MAX_PATCH; c++) if (BAND(c) === null) return c;
      return null;
    })();
    if (NOBAND === null || NOBAND >= MAX_PATCH) {
      note('10d', 'NOT MEASURED, NOT A PASS: aeon now declares a band for every channel this '
        + 'panel offers, so there is no no-band card to look at. The advisory this row is about '
        + 'cannot appear and this row can prove nothing — re-point it or delete it.');
    } else {
      // Channel N's card exists only once N-1 is spelled: the arrays are
      // positional and are never given a hole, so walk up to it.
      let opened = 'ok';
      for (let ch = 2; ch <= NOBAND && opened === 'ok'; ch++) {
        opened = await c.evalExpr(SET_SELECT(IN_CARD_ROW(ch, String.raw`/^Movement$/`, 'select'), 'sweep'));
        await sleep(800);
      }
      await sleep(400);
      const TRAVEL_N = IN_CARD_ROW(NOBAND, String.raw`/^Travel$/`, 'select');
      await c.evalExpr(SCROLL_TO(TRAVEL_N));
      await sleep(300);
      const cardN = await c.json(CARD_TEXT(NOBAND));
      const travelNPaint = await c.json(PAINT(TRAVEL_N));
      const cardDeclared = await c.json(CARD_TEXT(EFFECTS_DECLARED[0]));
      const tone = await c.json(TONE_IN_CARD(NOBAND, 'aeon declares no screen band'));
      const saysN = (t) => cardN.found === true && cardN.text.includes(t);
      check('10d', `⚠ A CHANNEL WITH NO DECLARED BAND SAYS SO — channel ${NOBAND}'s card states the `
        + `coverage gap (${BANDS.game} declares bands for ${JSON.stringify(EFFECTS_DECLARED)} only), `
        + 'in the NEUTRAL hint colour and with no clearance anywhere in it',
        opened === 'ok'
        && saysN(`aeon declares no screen band for channel ${NOBAND}`)
        && saysN(BANDS.game)
        && saysN('patchable(lo:, hi:)')
        && saysN('never as a clearance')
        // NOT a refusal, and not a reassurance either.
        && !cardN.text.includes('cannot fit channel')
        && !/\bfits\b/i.test(cardN.text) && !/✓/.test(cardN.text)
        // ⚠ PER-CHANNEL, NOT A CONSTANT: a declared channel must NOT carry it.
        // Without this the row passes on a string rendered under every sweep.
        && cardDeclared.found === true
        && !cardDeclared.text.includes('aeon declares no screen band')
        // TONE, MEASURED: `--text-lo`, not `--warning`. Reaching an undeclared
        // channel is not the author's mistake and there is nothing to fix, and
        // a warning with no remedy teaches an author to ignore the colour.
        && tone.found === true && tone.colour === tone.note && tone.colour !== tone.warn
        // ...and it is PAINTED where the control is.
        && travelNPaint.found === true && travelNPaint.insideScroller === true,
        `undeclared channel ${NOBAND} (declared: ${JSON.stringify(EFFECTS_DECLARED)})  `
        + `open→${opened}\n        `
        + `hint colour ${tone.found ? `${tone.colour} (--text-lo ${tone.note}, --warning ${tone.warn})` : 'NOT FOUND'}\n        `
        + `Travel select rect ${JSON.stringify(travelNPaint.rect)} `
        + `insideScroller=${travelNPaint.insideScroller} hitIsSelf=${travelNPaint.hitIsSelf}\n        `
        + `CARD ${NOBAND} TEXT ON SCREEN:\n        `
        + (cardN.found ? cardN.text.split('\n').map((l) => `| ${l}`).join('\n        ') : '(no card)'));
    }

    // Put channel 1 back to the violating rung so the capture below shows the
    // sentence this parcel adds.
    if (WIDE !== undefined) { await c.evalExpr(SET_SELECT(TRAVEL_1, WIDE)); await sleep(500); }

    // ── 9. THE CAPTURE FOR THE OWNER ───────────────────────────────────────
    // ⚠ THE LOOK IS UNRATIFIED. He ruled the shape of this facet, not this
    // section's appearance; the packet parks these and names what I would
    // change.
    //
    // ⚠ THE COLUMN IS SCROLLED TO THE SECTION FIRST. The first version of this
    // capture shot the arrival scroll position and the section it is about was
    // 764px below the frame — a screenshot of the wrong screen, handed to the
    // owner as "the look". The scroll offset is printed with the file.
    await c.evalExpr(OPEN_SECTION(ANCHORS_RE, CHANNEL_SEL));
    await sleep(500);
    const shotScroll = await c.evalExpr(SCROLL_TO(PREVIEW));
    await sleep(600);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/anchors-section-open.png`, Buffer.from(shot.data, 'base64'));
    console.log(`    screenshot  : ${SHOTS}/anchors-section-open.png`);
    note('9a', 'the shot above is the section OPEN with one channel authored and a sweep running, '
      + `with the column scrolled ${shotScroll}px to put the card in frame.`);
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
