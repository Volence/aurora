// ═══════════════════════════════════════════════════════════════════════════
// rowremap-author - AUTHOR A ROW REMAP THROUGH THE REAL UI AND SAVE IT
// ═══════════════════════════════════════════════════════════════════════════
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// `docs/reviews/2026-09-05-scene-anchor-writer.md` §6 recorded `rowRemap` as
// BLOCKED end to end, on two aeon/sigil declarations, and its harness therefore
// took the remap OFF again before saving (its row [7d]). Both blockers landed
// on aeon `origin/master` at `1072a05c` the same day:
//
//   1. the generated act module's HEAD LABEL no longer encodes a payload name,
//      so an editor-authored deform table LINKS (aeon `072adc8b`);
//   2. `row_remap_gate.py`'s visibility arm now treats a band as varying if a
//      table is attached OR `CURVE_FLAG_ACTIVE_BIT` is set, which is what its
//      own cited authority always permitted.
//
// So this harness is the previous one with its retreat removed: it authors the
// remap AND SAVES IT, and the ROM is built from what the app wrote.
//
// ── WHAT IS AUTHORED, AND WHY EACH VALUE ────────────────────────────────
//
//   layer 0  top 0    fa FACTOR_1  fb FACTOR_1_8                     sky
//   layer 1  top 96   fa FACTOR_1  fb FACTOR_1_8  curve -> FACTOR_1_2
//                                  rowRemap { plane_y 96, 16 lines }  THE WATER
//   layer 2  top 160  fa FACTOR_1  fb FACTOR_1_2                     under it
//   anchor   channel 0, BOTH planes off (the no-deform sentinel)
//
// * ROUTE (c). aeon's precondition 1 names three ways to give the remap
//   something to vary; (c) is "a `curve:` on that layer" and needs no deform
//   table. Route (b) is now buildable too, but (c) is the smaller claim and it
//   is the one the fixed gate's own end-to-end probe used.
// * THE ANCHOR IS PURE-BOUNDARY. `dsa`/`dsb` are 0..15 with 15 meaning NO
//   DEFORM, and aeon refuses a curve beside an anchor carrying LIVE shifts.
//   15/15 is not the extreme case, it is the PERMITTED one, and it is what the
//   toggle seeds.
// * THE CURVE RAMPS UPWARD, AND THAT IS NO LONGER A SAFETY CLAIM. `fb` is the
//   factor at the strip's TOP and `curve.to` the factor at its BOTTOM (aeon
//   `scene_dsl.emp:441`). FACTOR_1_8 -> FACTOR_1_2 goes up, and it lands on
//   layer 2's own `fb` so the two strips meet without a step. This banner used
//   to say a DESCENDING curve garbles the background (aeon `df3b8810`); aeon
//   REFUTED THE DIRECTION on 2026-09-06 (`92663a53`: an ascending mirror
//   garbles too, a small descending one is clean) and Aurora re-pointed its
//   advisory onto the per-line SHEAR RATE (`f432e4e6`,
//   `src/core/formats/effects/curve-rate.ts`). Upward is kept because it is
//   the document the ROM hand-off was built from ([9h]); row [7b] measures the
//   rate advisory in both directions and on both sides of its bar.
// * `fa` IS FACTOR_1 ON EVERY STRIP. aeon `7ee97fe1` found a non-FACTOR_1 `fa`
//   tears the FOREGROUND, independently of the curve defect.
//
// ── DISTRUST A CLEAN RESULT ─────────────────────────────────────────────
//
// Every verdict below is taken from the DOCUMENT THE APP HOLDS or from the FILE
// THE APP WROTE, never from a helper this repo also ships. The save rows print
// the file's existence before and after, and [9b] re-reads the bytes off disk
// rather than trusting the in-memory copy. Nothing here hand-edits the app's
// output: a gap found by a control refusing is the deliverable.
//
// ── RUN ─────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a WRITABLE aeon CLONE> \
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:rowremap-author
//
// Never against the live aeon checkout: this harness SAVES.
//
// ── WHERE A RUN WRITES ITS PICTURES AND DOCUMENTS ───────────────────────
//
// A per-run temp dir, named on the `captures:` line, and NOT the committed
// captures in `docs/captures/2026-09-05-rowremap/` (every run used to rewrite
// nine of those PNGs). To refresh the committed set deliberately, add
// `SHOTS=<that directory, absolute>`. [9h] compares against the capture AS
// COMMITTED (`git show HEAD:...`), so a refresh cannot compare a run with
// itself. See lib/capture-dir.mjs.

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';
import { SECTION_SCENE_FORM, openEffectsSectionState } from './lib/effects-sections.mjs';
import { captureDir, committedBytes } from './lib/capture-dir.mjs';

const PORT = Number(process.env.PORT ?? 9529);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ THE OVERRIDE IS READ THROUGH THE RESOLVER, NEVER OFF `process.env`. This
// harness SAVES, so it genuinely REQUIRES an explicit override.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';
/** The COMMITTED capture directory, relative to the checkout. [9h] reads it at HEAD. */
const CAPTURES_REL = 'docs/captures/2026-09-05-rowremap';
/** This run's output directory, resolved in main() by captureDir. */
let SHOTS = null;

const SCENE_ID = 'aurora_rowremap_waterline';
const SECTION = 2;
/** The patch channel the split latches to. aeon's own `ojz_act1_start` uses 0. */
const CHANNEL = 0;
/** The strip that carries the water: its curve and its remap. */
const REMAP_LAYER = 1;
/** The BG plane line where that strip's art paints the surface. */
const PLANE_Y = 96;
/** Plane B at the strip's TOP, and at its BOTTOM. Upward: see the banner. */
const CURVE_FROM = 'FACTOR_1_8';
const CURVE_TO = 'FACTOR_1_2';
/**
 * A DESCENDING far end, used ONLY to measure what the panel says about one.
 * Below `CURVE_FROM` on the same 1/N ladder, so the ramp runs downhill.
 * Driven at [7b] and taken straight back off; it is never saved.
 */
const CURVE_DOWN = 'FACTOR_1_16';

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
/** Scrolling is used ONLY for a picture, never to reach a control. */
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
// suffixes. Every pattern below is a PREFIX with `\b`.
//
// ⚠ AND THE ROW REMAP ROW HAS *TWO* SELECTS whose titles both begin
// `Layer N rowRemap` - the on/off toggle and the height picker
// (`rowRemap.height_shift`). `find()` returns whichever renders first, so a
// pattern that matched both would drive the toggle while reporting the height.
// The toggle's pattern carries a negative lookahead for the dot.
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
    options: [...el.options].map((o) => ({
      value: o.value, label: o.textContent, title: o.title, disabled: !!o.disabled,
    })),
  };
})()`;

/** One number input's own advertised bounds, read back off the DOM. */
const NUMBER_STATE = (selector) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return null;
  return { value: el.value, min: el.min, max: el.max };
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
 * ⚠ `element.click()` IS NOT A CLICK where the app listens for pointer events.
 * This returns the rect so the caller dispatches a real press/release at
 * INTEGER client pixels, and it prints the rect against its SCROLLER's box -
 * `checkVisibility()` and `getClientRects()` both go green on an element
 * scrolled far outside its scroller.
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
 * [10a] asserts they ALL said 'ok'. Without it a selector that matches nothing
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
 * THE SCENE SECTION ARRIVES COLLAPSED (`defaultCollapsed` on
 * `aeon.effects.scene`), so the anchor rows are NOT IN THE DOM until an author
 * opens it. A `no-element` read off a collapsed section is NAVIGATION MISSING,
 * not a control missing, and reading it the other way writes up a live control
 * as absent.
 *
 * ⚠ OPENED BY ITS ID, NOT ITS TITLE (RIGS-DEAD-NEEDLE-LEFTOVERS, 2026-09-13).
 * The private opener that stood here hunted the header's title span for
 * `Scene` followed by an em dash, which the app stopped painting in `24541886`
 * (the 2026-09-05 dash sweep), and it probed for "open" with the anchor toggle
 * needle below, which died the same afternoon. So it answered
 * `no header span matched`, clicked nothing, and every anchor gesture came back
 * `no-element`. The title is composed per document (`Scene: <id>`), so there
 * is no stable string to type. The door is now `openEffectsSectionState` on
 * SECTION_SCENE_FORM, the helper the five rigs of ROADMAP row 170 use, and it
 * is a row ([4s0]) judged on the app's own `data-section-collapsed` read back
 * AFTER the click, never on the click's return value.
 *
 * ⚠ AND THE ANCHOR TOGGLE IS FOUND BY ITS KEY, INSIDE THAT SECTION. Its title
 * was `anchor` + em dash + prose until `d70da895` reworded it to
 * `anchor: the world-anchored band split...` (`ANCHOR_ROW.title` in
 * `providers/effects-aeon.ts`). The key is contract (`scene.anchor`), the
 * punctuation after it is prose: `effects-deform`'s rule, and the one row 170
 * applied to the factor pickers. So the pattern is the key followed by
 * anything that is NOT another key character and NOT a dot, because the
 * anchor's own rows are titled `anchor.at.channel`, `anchor.at.dsa` and
 * `anchor.at.dsb`, and a boundary that let the dot through would count them as
 * toggles too. [4s1] measures that with those rows on screen.
 */
const SCENE_FORM_SELECTS = `[...document.querySelectorAll('[data-section=${JSON.stringify(SECTION_SCENE_FORM)}] select')]`;
const SCENE_FORM_SEL = (re) => `${SCENE_FORM_SELECTS}.find((e) => ${re}.test(e.title || ''))`;
const SCENE_FORM_COUNT = (re) => `${SCENE_FORM_SELECTS}.filter((e) => ${re}.test(e.title || '')).length`;
const ANCHOR_KEY = String.raw`/^anchor(?![a-z0-9_.])/`;
const ANCHOR_AT_KEY = String.raw`/^anchor\.at\./`;

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

const ANCHOR_SEL = (field) => SEL_BY_TITLE(String.raw`/^anchor\.at\.${field}\b/`);
const REMAP_TOGGLE = SEL_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} rowRemap\b(?!\.)/`);
const REMAP_HEIGHT = SEL_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} rowRemap\.height_shift\b/`);
const REMAP_PLANEY = NUM_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} rowRemap\.plane_y\b/`);
const CURVE_SEL = SEL_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} curve\.to\b/`);

/** The remap payload, off the document the app holds. */
async function remapOf(c) {
  const doc = await c.json(`(${SCENE_JSON()})`);
  const rr = doc && doc.layers && doc.layers[REMAP_LAYER] && doc.layers[REMAP_LAYER].rowRemap;
  return (rr && rr !== 'none') ? rr : null;
}

// ═══ THE ORACLE: every expectation [6b] [6c] [7b] hold is read out of SOURCE ═══
//
// ROWREMAP-STALE-ROWS-AND-CAPTURES (2026-09-13). Those three rows were red on
// every run because each carried a TYPED literal of a fact the app then changed
// on purpose: five height options with one marked (`208ef48b` made the contract
// `enum [4]`), and a "ramps DOWNWARD" warning (`f432e4e6` withdrew it after aeon
// refuted the direction). The repair is `docs/reviews/2026-09-06-rowremap-three-red.md`
// §1's: the expectation is DERIVED, so the next amendment moves the row instead
// of aging it. Every read below throws rather than degrading to no check.
//
// Read from `RUN.root`, the tree whose build is under test, never this file's
// own checkout (the two differ only when a run is borrowed, which main refuses).
const SRC_TEXT = (rel) => readFileSync(join(RUN.root, rel), 'utf8');
/** One capture group of a pattern that must match EXACTLY once in a source file. */
function fromSource(rel, re, what) {
  const all = [...SRC_TEXT(rel).matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))];
  if (all.length !== 1) {
    throw new Error(`ORACLE: ${what} matched ${all.length} times in ${rel} (want exactly 1): ${re}`);
  }
  return all[0][1];
}

/**
 * aeon's per-line shear rate, `tools/depth_onset_probe.py` `rate_mean`:
 * `e / (len(seg) - 1)`, the step between ADJACENT lines, so a band of N lines
 * has N - 1 of them. WRITTEN HERE, NOT IMPORTED from `curve-rate.ts`: an app
 * that changed its divisor must disagree with this, not move with it.
 */
const rateMean = (excursionPx, spanLines) =>
  (spanLines < 2 ? null : Math.abs(excursionPx) / (spanLines - 1));

/** A canonical stringify (sorted keys), so a rebuilt object compares equal. */
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

async function loadOracle() {
  // ── height_shift: the SET the vendored contract admits, by this rig's own reader ──
  const schemaRel = 'src/core/formats/effects/aurora-effects-scene.schema.json';
  const schema = JSON.parse(SRC_TEXT(schemaRel));
  const branches = schema?.$defs?.layer?.properties?.rowRemap?.oneOf;
  if (!Array.isArray(branches)) throw new Error(`ORACLE: ${schemaRel} has no $defs.layer.properties.rowRemap.oneOf`);
  const payload = branches.filter((b) => b && b.properties && 'plane_y' in b.properties);
  if (payload.length !== 1) {
    throw new Error(`ORACLE: ${payload.length} rowRemap branches carry plane_y in ${schemaRel} (want 1)`);
  }
  const hs = payload[0].properties.height_shift;
  // The three shapes JSON Schema bounds an integer with, read as JSON Schema
  // means them. NOT `admittedIntegers` from scene-ui.ts: that is the app's
  // reading of this node, and the row checks the app against the contract.
  let admitted;
  let shape;
  if (Array.isArray(hs?.enum)) { admitted = [...hs.enum]; shape = `enum ${JSON.stringify(hs.enum)}`; }
  else if (hs?.const !== undefined) { admitted = [hs.const]; shape = `const ${JSON.stringify(hs.const)}`; }
  else if (Number.isInteger(hs?.minimum) && Number.isInteger(hs?.maximum)) {
    admitted = [];
    for (let v = hs.minimum; v <= hs.maximum; v++) admitted.push(v);
    shape = `minimum ${hs.minimum} / maximum ${hs.maximum}`;
  } else {
    throw new Error(`ORACLE: ${schemaRel} height_shift carries no enum, const or minimum/maximum`);
  }
  if (admitted.length === 0 || !admitted.every(Number.isInteger)) {
    throw new Error(`ORACLE: ${schemaRel} height_shift admits ${JSON.stringify(admitted)}, not a non-empty integer set`);
  }
  admitted.sort((a, b) => a - b);
  // The contract's own "TODAY ONLY n BUILDS" clause: present, one rung builds and
  // the rest are legal-but-refused; absent (since empyrean 2e5046e), the enum IS
  // the buildable set and nothing is marked.
  const clause = /TODAY ONLY (\d+) BUILDS/.exec(String(hs.description ?? ''));
  const buildable = clause === null ? null : Number(clause[1]);
  // The two needles, read out of the composers so a rewording moves them:
  // the suffix the picker appends to the buildable option, and the unbuildable
  // warning `rowRemapBuildableToday` paints under the row.
  const suffix = fromSource('src/renderer/providers/effects-aeon.ts',
    /buildsSuffix: '([^']+)'/, 'the picker\'s builds-today suffix').trim();
  const unbuildable = fromSource('src/core/formats/effects/scene-ui.ts',
    /is a legal shift that (does NOT BUILD)\b/, 'rowRemapBuildableToday\'s warning');

  // ── the curve rate: aeon's two transcribed arms, the screen, the decode ──
  const req = createRequire(join(RUN.root, 'package.json'));
  const esb = req('esbuild');
  const built = esb.buildSync({
    stdin: {
      contents: [
        'export { CURVE_RATE_ARMS, CURVE_RATE_ARM_SPAN_LINES } from \'./src/core/formats/effects/curve-rate.ts\';',
        'export { decodeFactorScroll } from \'./src/core/formats/effects/factor-decode.ts\';',
        'export { SCREEN_WIDTH, SCREEN_HEIGHT } from \'./src/core/model/screen.ts\';',
        'export { SECTION_PIXEL_SIZE } from \'./src/core/model/s4-types.ts\';',
      ].join('\n'),
      resolveDir: RUN.root, loader: 'ts', sourcefile: 'rowremap-author-oracle.ts',
    },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
  });
  const m = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
  for (const k of ['CURVE_RATE_ARMS', 'CURVE_RATE_ARM_SPAN_LINES', 'decodeFactorScroll',
    'SCREEN_WIDTH', 'SCREEN_HEIGHT', 'SECTION_PIXEL_SIZE']) {
    if (m[k] === undefined) throw new Error(`ORACLE: the source bundle exports no ${k}`);
  }
  // THE BAR: the LOWEST rate aeon measured GARBLING (curve-rate.ts's own
  // docblock says why the garbled end and not the clean one), recomputed from
  // the transcribed excursions and span with this rig's rate formula.
  const garbled = m.CURVE_RATE_ARMS.filter((a) => a.garbled);
  if (garbled.length === 0) throw new Error('ORACLE: CURVE_RATE_ARMS carries no garbled arm');
  const bar = Math.min(...garbled.map((a) => rateMean(a.excursionPx, m.CURVE_RATE_ARM_SPAN_LINES)));
  // The lock sentinel, out of the schema's v_factor description: the band span
  // below is only a document quantity on a LOCKED scene.
  const lock = Number(fromSource(schemaRel, /(\d+) is the LOCK SENTINEL/, 'v_factor\'s lock sentinel'));
  return {
    height: { rel: schemaRel, shape, admitted, buildable, suffix, unbuildable },
    curve: {
      bar, lock, arms: m.CURVE_RATE_ARMS, armSpan: m.CURVE_RATE_ARM_SPAN_LINES,
      decode: m.decodeFactorScroll, SCREEN_WIDTH: m.SCREEN_WIDTH, SCREEN_HEIGHT: m.SCREEN_HEIGHT,
      SECTION_PIXEL_SIZE: m.SECTION_PIXEL_SIZE,
    },
  };
}

/**
 * A LOCKED scene's screen span for one layer, derived here: under `.v_locked`
 * Step 4a's `vs` is `v_offset`, and with `vs` 0 the plane-to-screen rotation is
 * the identity, so each band runs from its own top to the next band's top (or
 * the screen's bottom), every top clamped to the screen. Anything else is
 * reported, never guessed.
 */
function bandSpan(doc, i, cur) {
  if (!doc || !Array.isArray(doc.layers) || !doc.layers[i]) return { span: null, why: `no layer ${i}` };
  if (doc.v_factor !== cur.lock) return { span: null, why: `v_factor ${doc.v_factor} is not the lock sentinel ${cur.lock}` };
  if ((doc.v_offset ?? 0) !== 0) return { span: null, why: `v_offset ${doc.v_offset}: only the unrotated case is derived here` };
  const tops = doc.layers.map((l) => l.world_y);
  if (tops.some((t, k) => k > 0 && t < tops[k - 1])) return { span: null, why: `tops do not ascend: ${JSON.stringify(tops)}` };
  const top = Math.min(tops[i], cur.SCREEN_HEIGHT);
  const next = i + 1 < tops.length ? Math.min(tops[i + 1], cur.SCREEN_HEIGHT) : cur.SCREEN_HEIGHT;
  return { span: Math.max(0, next - top), why: null };
}

/**
 * THE CURVE ROW'S OWN BLOCKS: the siblings under the row holding the curve
 * picker, up to the next row that holds a control.
 *
 * `Field` renders its row as a div whose first child is the label SPAN, titled
 * with the row's title, which the picker's own title ends with
 * (`Layer N <LAYER_CURVE_ROW.title>`). Under it, in `EffectsScenePanel.tsx`
 * order: `curveRowHint` (ALWAYS rendered), then `curveAdvisory` (the degenerate
 * refusal, only when to == fb), then `curveRateAdvisory` (the shear rate). So a
 * curve that trips nothing leaves exactly ONE block, and every extra block is a
 * sentence the panel added. Scoped to the row, never `document.body`, so another
 * card's warning cannot answer for this one.
 */
const CURVE_ROW_BLOCKS = (selector) => String.raw`
(() => {
  const sel = ${selector};
  if (!sel) return null;
  let row = sel.parentElement;
  while (row && !(row.firstElementChild && row.firstElementChild.tagName === 'SPAN'
    && row.firstElementChild.title && sel.title.endsWith(row.firstElementChild.title))) {
    row = row.parentElement;
  }
  if (!row) return { row: false, blocks: [] };
  const blocks = [];
  for (let b = row.nextElementSibling; b && !b.querySelector('select,input'); b = b.nextElementSibling) {
    blocks.push({ text: (b.innerText || '').trim(), rendered: b.getClientRects().length > 0 });
  }
  return { row: true, blocks };
})()`;

/**
 * One measured state of the remapped strip's curve: what the rig DERIVES the
 * advisory must do, and what the curve row actually shows.
 */
async function curveState(c, name, cur, maxCamX) {
  await sleep(600);
  const doc = await c.json(`(${SCENE_JSON()})`);
  const L = doc?.layers?.[REMAP_LAYER];
  const fb = L?.fb ?? null;
  const to = L?.curve?.to ?? null;
  const { span, why } = bandSpan(doc, REMAP_LAYER, cur);
  const top = to === null || fb === null ? null : cur.decode(maxCamX, fb);
  const bottom = to === null || fb === null ? null : cur.decode(maxCamX, to);
  const excursion = top === null ? null : Math.abs(top - bottom);
  const rate = excursion === null || span === null ? null : rateMean(excursion, span);
  const expect = rate === null ? null : (rate >= cur.bar ? 'present' : 'absent');
  const dir = top === null ? null : (bottom > top ? 'ascending' : bottom < top ? 'descending' : 'flat');
  const seen = await c.json(CURVE_ROW_BLOCKS(CURVE_SEL));
  const needles = rate === null ? null : [rate.toFixed(2), String(maxCamX), cur.bar.toFixed(2)];
  let observed;
  if (seen === null || !seen.row) observed = 'no-row';
  else if (needles !== null
    && seen.blocks.filter((b) => b.rendered && needles.every((n) => b.text.includes(n))).length === 1) {
    observed = 'present';
  } else if (seen.blocks.length === 1) observed = 'absent';
  else observed = 'other';
  return {
    name, fb, to, span, why, excursion, dir,
    rate: rate === null ? null : Number(rate.toFixed(4)), expect, observed, needles,
    blocks: seen === null ? null : seen.blocks.map((b) => `${b.rendered ? '' : '[NOT RENDERED] '}${b.text.slice(0, 160)}`),
  };
}

async function main() {

  // ⚠ BOTH VARIABLES OR NEITHER. A worktree has no `node_modules/.bin/electron`
  // and no `dist/`, so without AURORA_BUILT_TREE the resolver walks UP and
  // borrows the MAIN checkout's built tree - every row then runs green against
  // an app this parcel did not build.
  if (RUN.borrowed) {
    throw new Error(`REFUSING: the run root was BORROWED from ${RUN.root}, which is not the tree `
      + 'this harness was started from. Set AURORA_BUILT_TREE to the worktree.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);
  SHOTS = captureDir({ root: ROOT, committedRel: CAPTURES_REL, label: 'rowremap-author' }).dir;
  const ORACLE = await loadOracle();
  note('oracle: height_shift', `${ORACLE.height.rel} admits ${JSON.stringify(ORACLE.height.admitted)} `
    + `(${ORACLE.height.shape}); TODAY ONLY clause: ${ORACLE.height.buildable ?? 'ABSENT'}; `
    + `mark needle ${JSON.stringify(ORACLE.height.suffix)}; warning needle ${JSON.stringify(ORACLE.height.unbuildable)}`);
  note('oracle: curve bar', `${ORACLE.curve.bar.toFixed(4)} px/line = min over garbled arms `
    + `${JSON.stringify(ORACLE.curve.arms.filter((a) => a.garbled))} / (${ORACLE.curve.armSpan} - 1); `
    + `lock sentinel ${ORACLE.curve.lock}; SCREEN ${ORACLE.curve.SCREEN_WIDTH}x${ORACLE.curve.SCREEN_HEIGHT}; `
    + `SECTION_PIXEL_SIZE ${ORACLE.curve.SECTION_PIXEL_SIZE}`);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone - this harness SAVES.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM. Through the override-aware `siblingPath` this
  // guard breaks BOTH ways: it would refuse a legitimate clone and it would
  // PASS the real tree, failing open on exactly the case it exists for.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), which is `
      + 'a live lane tree another agent may be editing. This harness SAVES.');
  }

  const SCENE_PATH = join(AEONDIR, 'games/sonic4/data/editor/effects', `${SCENE_ID}.json`);
  const META_PATH = join(AEONDIR, 'games/sonic4/data/editor/ojz/act1', `section_${SECTION}.meta.json`);
  const metaBefore = existsSync(META_PATH);
  const sceneBefore = existsSync(SCENE_PATH);
  note('before', `section_${SECTION}.meta.json exists=${metaBefore} · ${SCENE_ID}.json exists=${sceneBefore}`);
  // ANTI-VACUOUS: if the scene file were already there, every "the app wrote
  // it" row below would be measuring somebody else's bytes.
  check('0a', 'the clone carries NO scene at this id before the app opens it', !sceneBefore,
    `${SCENE_PATH} exists_before=${sceneBefore}`);

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
    // is real UI interaction; this step is NOT UI evidence.
    //
    // ⚠ CAUGHT, THE WAY EVERY SIBLING RIG CATCHES IT (RIGS-DEAD-NEEDLE-LEFTOVERS,
    // 2026-09-13). On this build the call answers the CDP error
    // `Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}` and
    // the project opens anyway. Uncaught, it killed this rig after [0a], before
    // it reached a single control, in every run of EFFECTS-RIGS-FIVE-MORE. Why
    // the promise is collected is a different defect and is NOT measured here;
    // [1a] below is what says whether the project really opened.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
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

    // ── [3] THE THREE STRIPS ──────────────────────────────────────────────
    for (const [i, top, fa, fb] of [[0, 0, 'FACTOR_1', 'FACTOR_1_8'],
      [1, 96, 'FACTOR_1', CURVE_FROM], [2, 160, 'FACTOR_1', 'FACTOR_1_2']]) {
      await drive(c, `layer ${i} top`,
        SET_INPUT(NUM_BY_TITLE(String.raw`/^Layer ${i} Screen line\b/`), top));
      await drive(c, `layer ${i} fa`, SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${i} fa\b/`), fa));
      await drive(c, `layer ${i} fb`, SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${i} fb\b/`), fb));
    }
    await sleep(500);
    const strips = await c.json(`(${SCENE_JSON()})`);
    check('3a', 'all three strips took their top and both factors from the controls',
      strips && strips.layers?.length === 3
      && strips.layers[0].world_y === 0 && strips.layers[1].world_y === 96
      && strips.layers[2].world_y === 160
      && strips.layers.every((l) => l.fa === 'FACTOR_1')
      && strips.layers[1].fb === CURVE_FROM,
      JSON.stringify(strips?.layers));

    // ── [4] THE ANCHOR - precondition 2 ───────────────────────────────────
    // The door first, and it is a row: see SCENE_FORM_SEL. A shut form stops
    // the run here instead of speaking first as a missing anchor at [4a].
    const sceneForm = await openEffectsSectionState(c, SECTION_SCENE_FORM, { settleMs: 900 });
    check('4s0', 'INSTRUMENT: the Scene form is open, so the anchor rows below are in the DOM: '
      + 'it arrives collapsed',
      sceneForm.ok === true
      && (sceneForm.section === 'clicked' || sceneForm.section === 'already-open'),
      `open -> ${JSON.stringify(sceneForm)} via [data-section="${SECTION_SCENE_FORM}"]. The verdict `
      + 'is the app\'s own data-section-collapsed read back AFTER the click, not the click\'s '
      + 'return value: a header whose handler was removed still takes a click.');
    if (!sceneForm.ok) throw new Error(sceneForm.why);
    const toggleSel = SCENE_FORM_SEL(ANCHOR_KEY);
    await drive(c, 'anchor on', SET_SELECT(toggleSel, 'on'));
    await sleep(500);
    // The aim, measured where it can be wrong: with the anchor ON its three
    // `anchor.at.*` rows are on screen beside the toggle, so a key boundary that
    // let the dot through would count four here.
    const aim = await c.json(`({ toggles: ${SCENE_FORM_COUNT(ANCHOR_KEY)}, `
      + `atRows: ${SCENE_FORM_COUNT(ANCHOR_AT_KEY)}, `
      + `options: (() => { const e = ${toggleSel}; `
      + 'return e ? [...e.options].map((o) => o.value) : null; })() })');
    check('4s1', 'INSTRUMENT: exactly ONE select in the Scene form carries the anchor key, with '
      + 'its anchor.at rows on screen beside it, and it is the none/on toggle',
      aim.toggles === 1 && aim.atRows > 0
      && JSON.stringify(aim.options) === JSON.stringify(['none', 'on']),
      `${JSON.stringify(aim)} for ${ANCHOR_KEY} in [data-section="${SECTION_SCENE_FORM}"]`);
    await drive(c, 'anchor channel', SET_SELECT(
      SEL_BY_TITLE(String.raw`/^anchor\.at\.channel\b/`), CHANNEL));
    await sleep(500);
    const withAnchor = await c.json(`(${SCENE_JSON()})`);
    const at = withAnchor?.anchor?.at ?? null;
    check('4a', 'the anchor is declared on the requested channel, both planes on the '
      + 'no-deform sentinel - the shape aeon names as composing with a curve',
      at !== null && at.channel === CHANNEL && at.dsa === 15 && at.dsb === 15,
      `anchor.at = ${JSON.stringify(at)}`);
    await shotAt(c, ANCHOR_SEL('dsb'), '03-anchor-on');

    // ── [5] THE CURVE - precondition 1, route (c) ─────────────────────────
    const curveList = await c.json(OPTIONS_OF(CURVE_SEL));
    if (curveList === null) {
      cannotMeasure('5a', 'the curve picker is on screen', `no select matches ${CURVE_SEL}`);
    } else {
      note('curve.to options', JSON.stringify(curveList.options.map((o) => o.value)));
    }
    const curveOk = await drive(c, `layer ${REMAP_LAYER} curve.to (UPWARD)`,
      SET_SELECT(CURVE_SEL, CURVE_TO));
    await sleep(500);
    const withCurve = await c.json(`(${SCENE_JSON()})`);
    check('5a', `the remapped strip ramps Plane B UPWARD, ${CURVE_FROM} at its top to `
      + `${CURVE_TO} at its bottom`,
      curveOk === 'ok'
      && withCurve?.layers?.[REMAP_LAYER]?.fb === CURVE_FROM
      && JSON.stringify(withCurve?.layers?.[REMAP_LAYER]?.curve) === JSON.stringify({ to: CURVE_TO }),
      `fb=${JSON.stringify(withCurve?.layers?.[REMAP_LAYER]?.fb)} `
      + `curve=${JSON.stringify(withCurve?.layers?.[REMAP_LAYER]?.curve)}. Upward because it is the `
      + 'document the ROM hand-off was built from ([9h]), not because direction is safe: aeon '
      + 'refuted the direction on 2026-09-06 (92663a53), and [7b] measures the rate advisory both ways.');

    // ── [6] THE REMAP ITSELF ──────────────────────────────────────────────
    const remapOn = await drive(c, `layer ${REMAP_LAYER} rowRemap on`,
      SET_SELECT(REMAP_TOGGLE, 'ladder'));
    await sleep(600);
    const seeded = await remapOf(c);
    check('6a', 'turning the remap ON seeds it from the strip\'s own top, at a shift that BUILDS',
      remapOn === 'ok' && seeded !== null && seeded.plane_y === 96 && seeded.height_shift === 4,
      `rowRemap = ${JSON.stringify(seeded)} - the seed is the strip's own world_y clamped into `
      + 'rowRemap\'s own range, and the height is the one shift aeon can generate a ladder for.');

    // ⚠ [6b] / [6c] ASK WHAT THE CONTRACT ADMITS, NOT WHAT IT ONCE ADMITTED
    // (ROWREMAP-STALE-ROWS-AND-CAPTURES, 2026-09-13). They were written against
    // empyrean `60d9f6a`, where `height_shift` was `minimum 3 / maximum 7` and the
    // description carried "TODAY ONLY 4 BUILDS": five legal values, one buildable,
    // so the top of the range was a legal document and a red build, and the rows
    // wanted five options, one marked, and a warning at the extreme. `208ef48b`
    // re-vendored empyrean `2e5046e`: the key is `enum [4]`, the enum IS the
    // buildable set, the clause is gone, and the picker offers exactly what the
    // enum admits and marks nothing (`admittedIntegers` and
    // `EFFECTS_ROW_REMAP_BUILDABLE_SHIFT` in scene-ui.ts). The rows were not
    // relaxed: they now read the admitted set and the clause out of the vendored
    // schema (ORACLE.height), so they move with the next amendment in either
    // direction. `height_shift` is still a SHIFT and not a line count: the unit
    // hazard is what [6b] checks on the option VALUES.
    //
    // ⚠ WHAT THE DRIVE CAN AND CANNOT SHOW TODAY. With one admitted value, the
    // seed ([6a]) already holds it, so driving "the last option" cannot move the
    // document. The verbatim-shift half is carried by the option VALUES (a picker
    // whose values were line counts offers '16', not '4') and by [9c] on disk.
    const H = ORACLE.height;
    const heights = await c.json(OPTIONS_OF(REMAP_HEIGHT));
    if (heights === null) {
      cannotMeasure('6b', 'the height picker offers the admitted shifts', 'no height select on screen');
      cannotMeasure('6c', 'the buildable marks follow the contract', 'no height select on screen');
    } else {
      note('height options', JSON.stringify(heights.options.map((o) => `${o.value}:${o.label}`)));
      const values = heights.options.map((o) => o.value);
      const want = H.admitted.map(String);
      const labelsNameBoth = heights.options.length > 0 && heights.options.every((o) => {
        const s = Number(o.value);
        return Number.isInteger(s) && o.label.includes(String(1 << s)) && o.label.includes(String(s));
      });
      const last = heights.options[heights.options.length - 1];
      await drive(c, 'height -> last option', SET_SELECT(REMAP_HEIGHT, last.value));
      await sleep(500);
      const atLast = await remapOf(c);
      const screenAtLast = await c.evalExpr('document.body.innerText');
      // The unbuildable warning is owed only when the contract names ONE rung that
      // builds and the value driven is another. Today it names none.
      const warnWanted = H.buildable !== null && Number(last.value) !== H.buildable;
      const warnSeen = screenAtLast.includes(H.unbuildable);
      check('6b', 'the height picker offers EXACTLY the shifts the vendored schema admits, each '
        + 'option\'s value is the SHIFT and its label names the lines beside it, and driving the '
        + 'last one writes that shift verbatim',
        JSON.stringify(values) === JSON.stringify(want) && labelsNameBoth
        && atLast !== null && atLast.height_shift === Number(last.value)
        && atLast.height_shift !== (1 << Number(last.value))
        && warnSeen === warnWanted,
        `offered values ${JSON.stringify(values)} vs admitted ${JSON.stringify(want)} (${H.rel} `
        + `height_shift: ${H.shape}) · labels ${JSON.stringify(heights.options.map((o) => o.label))} `
        + `name the lines (1 << shift) and the shift: ${labelsNameBoth} · last option `
        + `${JSON.stringify(last)} -> document height_shift = ${atLast?.height_shift} · `
        + `"${H.unbuildable}" on screen: ${warnSeen}, owed: ${warnWanted} (TODAY ONLY clause: `
        + `${H.buildable ?? 'absent'}). The file stores a SHIFT; ${1 << Number(last.value)} would be `
        + 'the line count.');
      // …and the options marked as building are exactly the ones the contract names.
      const marked = heights.options.filter((o) => o.label.includes(H.suffix)).map((o) => o.value);
      const wantMarked = H.buildable === null ? [] : [String(H.buildable)];
      check('6c', 'the options marked as building are exactly the ones the contract names as '
        + 'building (none while the enum IS the buildable set), and nothing admitted is hidden',
        heights.options.length === H.admitted.length && heights.options.length > 0
        && JSON.stringify(marked) === JSON.stringify(wantMarked),
        `${heights.options.length} option(s) offered for ${H.admitted.length} admitted; marked with `
        + `${JSON.stringify(H.suffix)}: ${JSON.stringify(marked)}, owed ${JSON.stringify(wantMarked)} `
        + `(TODAY ONLY clause in the vendored description: ${H.buildable ?? 'absent'}). The list is `
        + 'NOT filtered - an author who opened a hand-authored file must see its value in it.');
      await shotAt(c, REMAP_HEIGHT, '04-height-extreme');
      // Back to the one that builds, through the same control, when one is marked.
      const buildable = heights.options.find((o) => o.label.includes(H.suffix));
      if (buildable !== undefined) {
        await drive(c, 'height -> the buildable option', SET_SELECT(REMAP_HEIGHT, buildable.value));
        await sleep(500);
      }
      const restored = await remapOf(c);
      const screenRestored = await c.evalExpr('document.body.innerText');
      check('6d', 'and choosing the marked option clears that warning - the row tracks the '
        + 'state rather than being stuck on',
        restored !== null && restored.height_shift === 4 && !screenRestored.includes(H.unbuildable),
        `height_shift back to ${restored?.height_shift}. `
        + (buildable === undefined
          ? 'NO OPTION IS MARKED (the contract names no buildable rung), so nothing was driven and '
            + 'this row measured only that no unbuildable warning is on screen; its "tracks the '
            + 'state" half is dormant with the apparatus until the clause returns.'
          : `drove the marked option ${JSON.stringify(buildable.label)}.`));
    }

    // [6e] plane_y is typed, and its ceiling is REFUSED rather than clamped.
    const planeState = await c.json(NUMBER_STATE(REMAP_PLANEY));
    if (planeState === null) {
      cannotMeasure('6e', 'plane_y refuses past its ceiling', 'no plane_y input on screen');
    } else {
      note('plane_y box', JSON.stringify(planeState));
      const over = Number(planeState.max) + 1;
      const before = await remapOf(c);
      await drive(c, `plane_y -> ${over} (past the ceiling)`, SET_INPUT(REMAP_PLANEY, over));
      await sleep(500);
      const after = await remapOf(c);
      const refusalText = await c.evalExpr('document.body.innerText');
      check('6e', `typing ${over} into plane_y is REFUSED and does not silently clamp to `
        + `${planeState.max}`,
        after !== null && before !== null && after.plane_y === before.plane_y
        && after.plane_y !== over && after.plane_y !== Number(planeState.max),
        `plane_y stayed ${after?.plane_y} (was ${before?.plane_y}); the box's own advertised max `
        + `is ${planeState.max}. A clamp would substitute a number the author did not type. This `
        + 'range is ONE OF TWO enforcements of the ceiling (the vendored plane_y description, since '
        + '208ef48b: aeon landed an engine-side < 512 guard at d593070a), and the one an author meets.');
      // ⚠ AND THE AUTHOR IS TOLD WHY. The first run of this harness probed for
      // the string "plane_y" and reported "Refusal on screen = false", which
      // reads exactly like a silent refusal - a control that eats a keystroke
      // and explains nothing. It was the PROBE that was wrong: the sentence
      // `rowRemapPlaneYRefusal` produces never says "plane_y", it names the
      // range. Matched here on the wording the function actually emits, so a
      // real silence would fail this row instead of being excused by it.
      check('6e2', 'and the refusal is on screen, in the contract\'s own words',
        /outside the Plane-B line range/.test(refusalText),
        'the sentence is rowRemapPlaneYRefusal\'s: "... is outside the Plane-B line range '
        + '0..511." This row reads only that range clause; the sentence\'s tail about who '
        + 'enforces the ceiling changed with 208ef48b and is row-remap-control [5b]\'s subject.');
      await drive(c, `plane_y -> ${PLANE_Y}`, SET_INPUT(REMAP_PLANEY, PLANE_Y));
      await sleep(500);
    }

    const authored = await remapOf(c);
    check('6f', 'the remap now carries the plane line and the buildable height, both typed '
      + 'or picked through their own controls',
      authored !== null && authored.plane_y === PLANE_Y && authored.height_shift === 4,
      `rowRemap = ${JSON.stringify(authored)}`);
    await shotAt(c, REMAP_TOGGLE, '05-remap-authored');

    // ── [7] THE CURVE: THE SHEAR-RATE ADVISORY, BOTH DIRECTIONS, BOTH SIDES ──
    //
    // Route (c) is the only route to a buildable remap that needs no deform
    // table, and it runs entirely through the curve picker. aeon's `layer()`
    // refuses only the DEGENERATE case where the two ends are equal, so what
    // an author is told under that picker is the only warning between it and
    // a ROM.
    //
    // ⚠ THIS BLOCK WAS ABOUT DIRECTION, AND AEON REFUTED DIRECTION. It first
    // measured that the panel said NOTHING about a descending ramp, then (after
    // `curveDescendingAdvisory` landed) that it WARNED "ramps DOWNWARD". aeon
    // refuted the direction on 2026-09-06 (`92663a53`: an ascending mirror of
    // the same spread garbles, a small descending curve is clean), and
    // `f432e4e6` replaced that warning with `curveRateAdvisory`, which fires when
    // the band's PER-LINE SHEAR RATE at the act's furthest camera x reaches the
    // lowest rate aeon has measured garbling, in EITHER direction. [7b] measures
    // that, with every state's verdict DERIVED here (ORACLE.curve: the rig's own
    // rate formula over `curve-rate.ts`'s transcribed arms, the engine decode,
    // the band span off the document, the camera clamp off the open act), never
    // read off the app.
    //
    // THE FOUR STATES, all on the remapped strip:
    //   A  CURVE_FROM -> CURVE_DOWN over the authored band    descending
    //   B  CURVE_FROM -> CURVE_TO, the shape that is saved     ascending
    //   C  PROBE_FB -> PROBE_TO over the same band             descending
    //   D  C's curve, the band grown to the screen's bottom (the advisory's own
    //      remedy: "spread the same ramp over a taller band")
    // C and D differ ONLY in span, so they are the pair that crosses the bar. If
    // the derivation ever stops putting a state on each side of it, or stops
    // putting one of each direction above it, [7b] is UNMEASURED, never a pass.
    // Every probe is undone, and [7c] asserts the document is the one [6f] left.
    const cur = ORACLE.curve;
    /**
     * C's ends: 1/16 over 1/32, the smallest step between two named factors
     * (the rest of the set is on sixteenths). Chosen so a band the rig CAN grow
     * crosses the bar; whether it does is computed below, not assumed.
     */
    const PROBE_FB = 'FACTOR_1_16';
    const PROBE_TO = 'FACTOR_1_32';
    const fbSel = SEL_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER} fb\b/`);
    const nextTopSel = NUM_BY_TITLE(String.raw`/^Layer ${REMAP_LAYER + 1} Screen line\b/`);
    const actState = await c.json('window.__dbg.aeon.state()');
    // aeon's camera clamp, `[0, level_width - SCREEN_WIDTH]`, which is the range
    // `curveRateAdvisory` is documented to read (`actReach().travelX`).
    const maxCamX = Number.isInteger(actState?.gridWidth)
      ? Math.max(0, actState.gridWidth * cur.SECTION_PIXEL_SIZE - cur.SCREEN_WIDTH) : null;
    const before7 = await c.json(`(${SCENE_JSON()})`);
    const nextTop = before7?.layers?.[REMAP_LAYER + 1]?.world_y;
    const downOk = await drive(c, `layer ${REMAP_LAYER} curve.to (DOWNWARD, probe only)`,
      SET_SELECT(CURVE_SEL, CURVE_DOWN));
    await sleep(600);
    const downDoc = await c.json(`(${SCENE_JSON()})`);
    const downOption = curveList === null ? null
      : curveList.options.find((o) => o.value === CURVE_DOWN) ?? null;
    check('7a', `a DESCENDING far end (${CURVE_FROM} down to ${CURVE_DOWN}) is offered, `
      + 'enabled, and authored without objection',
      downOk === 'ok'
      && JSON.stringify(downDoc?.layers?.[REMAP_LAYER]?.curve) === JSON.stringify({ to: CURVE_DOWN })
      && (downOption === null || downOption.disabled === false),
      `option = ${JSON.stringify(downOption)} · document now `
      + `curve=${JSON.stringify(downDoc?.layers?.[REMAP_LAYER]?.curve)} over fb=`
      + `${JSON.stringify(downDoc?.layers?.[REMAP_LAYER]?.fb)}`);
    const probeable = maxCamX !== null && Number.isInteger(nextTop);
    const stateA = probeable ? await curveState(c, 'A descending', cur, maxCamX) : null;
    await shotAt(c, CURVE_SEL, '06-descending-curve-warned');
    await drive(c, `layer ${REMAP_LAYER} curve.to back UPWARD`, SET_SELECT(CURVE_SEL, CURVE_TO));
    await sleep(500);
    const stateB = probeable ? await curveState(c, 'B ascending, the saved shape', cur, maxCamX) : null;
    let stateC = null;
    let stateD = null;
    if (probeable) {
      await drive(c, `layer ${REMAP_LAYER} fb -> ${PROBE_FB} (rate probe)`, SET_SELECT(fbSel, PROBE_FB));
      await drive(c, `layer ${REMAP_LAYER} curve.to -> ${PROBE_TO} (rate probe)`,
        SET_SELECT(CURVE_SEL, PROBE_TO));
      stateC = await curveState(c, 'C descending, the same band', cur, maxCamX);
      await drive(c, `layer ${REMAP_LAYER + 1} top -> ${cur.SCREEN_HEIGHT} (rate probe: the band grows)`,
        SET_INPUT(nextTopSel, cur.SCREEN_HEIGHT));
      stateD = await curveState(c, 'D C\'s curve, the band grown', cur, maxCamX);
      // Undone in reverse, through the same controls.
      await drive(c, `layer ${REMAP_LAYER + 1} top back to ${nextTop}`, SET_INPUT(nextTopSel, nextTop));
      await drive(c, `layer ${REMAP_LAYER} curve.to back to ${CURVE_TO}`, SET_SELECT(CURVE_SEL, CURVE_TO));
      await drive(c, `layer ${REMAP_LAYER} fb back to ${CURVE_FROM}`, SET_SELECT(fbSel, CURVE_FROM));
      await sleep(600);
    }
    const states = [stateA, stateB, stateC, stateD];
    const printState = (s) => (s === null ? 'not measured' : `${s.name}: ${s.fb} -> ${s.to} (${s.dir}) `
      + `over ${s.span ?? `? (${s.why})`} lines, excursion ${s.excursion} px at camera x ${maxCamX}, `
      + `rate ${s.rate} vs bar ${cur.bar.toFixed(4)} -> OWED ${s.expect}, SAW ${s.observed}; `
      + `needles ${JSON.stringify(s.needles)}; blocks under the curve row ${JSON.stringify(s.blocks)}`);
    const presentDirs = new Set(states.filter((s) => s?.expect === 'present').map((s) => s.dir));
    const straddles = probeable && states.every((s) => s !== null && s.expect !== null)
      && states.some((s) => s.expect === 'absent')
      && presentDirs.has('ascending') && presentDirs.has('descending');
    const stateLines = states.map(printState).join('\n        ');
    if (!straddles) {
      cannotMeasure('7b', 'the shear-rate advisory tracks the derived bar in both directions',
        `the derived verdicts do not put a state on each side of the bar with both directions `
        + `above it (maxCamX=${maxCamX}, next strip's top=${nextTop}), so the row could only pass `
        + `vacuously:\n        ${stateLines}`);
    } else {
      check('7b', 'the shear-rate advisory under the curve row appears exactly when the band\'s '
        + 'per-line rate at the act\'s furthest camera x reaches the bar derived from aeon\'s '
        + 'garbled arm - in BOTH directions - and is absent below it',
        states.every((s) => s.observed === s.expect),
        `${stateLines}\n        bar = min over garbled arms of excursion / (${cur.armSpan} - 1) `
        + `(aeon rate_mean); maxCamX = gridWidth ${actState?.gridWidth} x ${cur.SECTION_PIXEL_SIZE} `
        + `- ${cur.SCREEN_WIDTH}. "present" is ONE rendered block under the row carrying the rate, `
        + 'the camera x and the bar; "absent" is the row\'s standing hint alone. It is advice and '
        + 'not a refusal - see [7e].');
    }
    const backUp = await c.json(`(${SCENE_JSON()})`);
    check('7c', 'every probe in [7] is undone - the scene is the one [6f] left, ramping upward',
      canon(backUp) === canon(before7)
      && JSON.stringify(backUp?.layers?.[REMAP_LAYER]?.curve) === JSON.stringify({ to: CURVE_TO }),
      `curve=${JSON.stringify(backUp?.layers?.[REMAP_LAYER]?.curve)} · document equal to the one `
      + `before [7a]: ${canon(backUp) === canon(before7)}`);

    // ── [7d] ⚠ THE ALIAS PAIR, WHICH A BUILD REFUSED ─────────────────────
    //
    // `FACTOR_LOCKED` and `FACTOR_0` are ONE VALUE with two spellings (aeon
    // `parallax_dsl.emp`: `pub const FACTOR_0 = FACTOR_LOCKED`, both $0FF).
    // `curveGoesNowhere` compared SPELLINGS, so Aurora greyed nothing and said
    // nothing while aeon's layer() guard 4 - which compares the packed VALUE -
    // refused the pair and wrote no ROM:
    //
    //   error: layer(): curve: To(255) is the same factor as this layer's fb
    //
    // Both halves of that pair have real controls, so this is reachable by
    // gestures rather than only by a hand edit. `fb` is driven for real; then
    // the curve list is read off the DOM, where the fix has to show up as the
    // ENGINE'S OWN REFUSAL attached to BOTH spellings.
    // `fbSel` is [7]'s, declared above for the rate probe.
    const fbToZero = await drive(c, `layer ${REMAP_LAYER} fb -> FACTOR_0`,
      SET_SELECT(fbSel, 'FACTOR_0'));
    await sleep(600);
    const aliasList = await c.json(OPTIONS_OF(CURVE_SEL));
    const greyed = aliasList === null ? []
      : aliasList.options.filter((o) => o.disabled).map((o) => o.value);
    check('7d', 'with fb on FACTOR_0 the curve picker greys BOTH spellings of that one factor',
      fbToZero === 'ok' && greyed.includes('FACTOR_0') && greyed.includes('FACTOR_LOCKED'),
      `disabled options = ${JSON.stringify(greyed)}. Before this parcel only the matching `
      + 'SPELLING was greyed, so an author could land FACTOR_LOCKED on an fb of FACTOR_0 and '
      + 'the build refused it. The option carries the engine\'s own reason: '
      + `${JSON.stringify(aliasList?.options.find((o) => o.value === 'FACTOR_LOCKED')?.title)}`);
    await shotAt(c, CURVE_SEL, '06b-alias-greyed');
    // Restore fb, and re-assert the greying FOLLOWED it rather than being stuck
    // on - a picker that disabled those two always would pass [7d] for free.
    await drive(c, `layer ${REMAP_LAYER} fb back to ${CURVE_FROM}`,
      SET_SELECT(fbSel, CURVE_FROM));
    await sleep(600);
    const afterRestore = await c.json(OPTIONS_OF(CURVE_SEL));
    const greyedNow = afterRestore === null ? []
      : afterRestore.options.filter((o) => o.disabled).map((o) => o.value);
    check('7e', 'and the greying tracks fb - back on ' + CURVE_FROM + ' only that one value is '
      + 'refused, and the DESCENDING option is NOT greyed',
      greyedNow.length === 1 && greyedNow[0] === CURVE_FROM
      && !greyedNow.includes(CURVE_DOWN),
      `disabled options = ${JSON.stringify(greyedNow)}. aeon REFUSES the equal pair and PERMITS `
      + 'a descending one (and says there is no engine defect, 92663a53), so Aurora greys the '
      + 'first and only advises about the shear rate of either: a control that refused a '
      + 'direction or a rate would be Aurora inventing a rule the engine does not have.');

    // ── [8] THE PRECONDITIONS, READ OFF THE SCREEN ────────────────────────
    const pageText = await c.evalExpr('document.body.innerText');
    check('8a', 'the panel no longer says the remap has nothing to vary (precondition 1)',
      !/nothing for the remap to vary/.test(pageText),
      'cleared by route (c) - a curve on the remapped strip.');
    check('8b', 'the panel no longer says this scene declares no anchor (precondition 2)',
      !/declares no anchor/.test(pageText), 'cleared by the anchor above.');
    check('8c', 'and no second strip carries a remap (precondition 3)',
      !/also carries a row remap/.test(pageText) && !/also carry a row remap/.test(pageText),
      'the engine keeps ONE per-frame mark; a second remapped strip would silently win.');
    // ANTI-VACUOUS: the three absences above are absences of a WARNING, not of
    // the whole card. The row itself, and the note about the one precondition
    // Aurora cannot check, are both on screen.
    check('8d', 'the rowRemap row and its capability note are both on screen, so [8a]-[8c] '
      + 'are about warnings and not a missing card',
      (await c.evalExpr(`!!(${REMAP_TOGGLE})`)) === true
      && /cannot check the fourth condition/.test(pageText),
      'the fourth condition (the game raising CAP_ROW_REMAP) is not a function of a scene file '
      + 'and is stated as a note rather than a verdict.');

    // ── [9] BIND AND SAVE ─────────────────────────────────────────────────
    const secSel = SEL_BY_TITLE(String.raw`/^The section both bindings on this tab act on\b/`);
    const pick = await drive(c, `active section = ${SECTION}`, SET_SELECT(secSel, SECTION));
    await sleep(800);
    const bindSel = SEL_BY_TITLE(String.raw`/^Which effects scene this section uses\b/`);
    const bound = await drive(c, 'sceneRef binding', SET_SELECT(bindSel, SCENE_ID));
    await sleep(800);
    const ref = await c.evalExpr(`window.__dbg.aeon.sceneRef(${SECTION})`);
    check('9a', `section ${SECTION}'s sceneRef is "${SCENE_ID}", set through the assignment control`,
      pick === 'ok' && bound === 'ok' && ref === SCENE_ID, `sceneRef(${SECTION}) = ${JSON.stringify(ref)}`);
    await shot(c, '07-bound');

    await ctrlS(c);
    await sleep(3000);
    await shot(c, '08-after-save');

    check('9b', 'the app WROTE the scene document', existsSync(SCENE_PATH),
      `${SCENE_PATH} existed_before=${sceneBefore} exists_now=${existsSync(SCENE_PATH)}`);
    if (existsSync(SCENE_PATH)) {
      const onDisk = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));
      note('ON DISK', JSON.stringify(onDisk, null, 1));
      check('9c', 'THE ROW REMAP IS ON DISK, in the shape aeon\'s render_row_remap reads',
        onDisk.layers?.[REMAP_LAYER]?.rowRemap
        && onDisk.layers[REMAP_LAYER].rowRemap.plane_y === PLANE_Y
        && onDisk.layers[REMAP_LAYER].rowRemap.height_shift === 4,
        JSON.stringify(onDisk.layers?.[REMAP_LAYER]?.rowRemap));
      check('9d', 'and beside it the two keys aeon\'s scene() preconditions need: the anchor, '
        + 'and an UPWARD curve on that same strip',
        onDisk.anchor?.at?.channel === CHANNEL
        && onDisk.anchor.at.dsa === 15 && onDisk.anchor.at.dsb === 15
        && JSON.stringify(onDisk.layers?.[REMAP_LAYER]?.curve) === JSON.stringify({ to: CURVE_TO })
        && onDisk.layers[REMAP_LAYER].fb === CURVE_FROM,
        `anchor=${JSON.stringify(onDisk.anchor)} `
        + `layer${REMAP_LAYER}=${JSON.stringify(onDisk.layers?.[REMAP_LAYER])}`);
      check('9e', 'the saved document carries NO deform table - route (c) needs none, and the '
        + 'file proves the remap is not leaning on one',
        onDisk.deform_bg === undefined && onDisk.deform_fg === undefined
        && onDisk.layers.every((l) => l.deform === undefined),
        `deform_bg=${JSON.stringify(onDisk.deform_bg)} deform_fg=${JSON.stringify(onDisk.deform_fg)}`);
      check('9f', 'exactly ONE strip carries a remap',
        onDisk.layers.filter((l) => l.rowRemap !== undefined && l.rowRemap !== 'none').length === 1,
        `remapped strips = ${JSON.stringify(onDisk.layers
          .map((l, i) => (l.rowRemap !== undefined && l.rowRemap !== 'none' ? i : -1))
          .filter((i) => i >= 0))}`);
      // ⚠ THE CONTROL THAT MAKES THE ROM STILL THIS RUN'S. The ROM handed over
      // was built from the document the FIRST pass saved; this pass runs
      // against an app whose curve row has since gained two behaviours. If the
      // bytes the app writes had moved, that ROM would no longer be the one
      // this harness authors, and every hash in the packet would be about a
      // document nothing here produced any more. Compared against the COMMITTED
      // capture, byte for byte, rather than re-derived from the same objects.
      //
      // ⚠ READ AT HEAD, NOT OFF THE WORKING TREE (ROWREMAP-STALE-ROWS-AND-CAPTURES).
      // A run may now write into the committed directory (SHOTS, the opt-in
      // refresh), and the old read of `${SHOTS}/<id>.json` would then compare a
      // run with its own previous output. `git show HEAD:<path>` is the capture
      // as committed, whatever the working copy or SHOTS say.
      const captureRel = `${CAPTURES_REL}/${SCENE_ID}.json`;
      const committed = committedBytes(ROOT, captureRel);
      if (committed.ok) {
        const now = readFileSync(SCENE_PATH);
        check('9h', 'the app still writes the IDENTICAL document, so the built ROM is still '
          + 'this scene\'s',
          Buffer.compare(now, committed.bytes) === 0,
          `${now.length} B now vs ${committed.bytes.length} B in the committed capture (git show `
          + `HEAD:${captureRel}, HEAD ${committed.rev.slice(0, 8)}). The curve fix is a reader and `
          + 'an advisory; it must not have changed a single authored byte.');
      } else {
        cannotMeasure('9h', 'the saved bytes match the committed capture', committed.why);
      }
      writeFileSync(join(SHOTS, `${SCENE_ID}.json`), readFileSync(SCENE_PATH));
    } else {
      cannotMeasure('9c', 'the remap reached disk', 'the scene file was never written');
    }
    check('9g', `the app WROTE section_${SECTION}.meta.json`, existsSync(META_PATH),
      `existed_before=${metaBefore} exists_now=${existsSync(META_PATH)}`);
    if (existsSync(META_PATH)) writeFileSync(join(SHOTS, `section_${SECTION}.meta.json`), readFileSync(META_PATH));

    // ── [10] THE LEDGER. Last, so it covers every gesture above. ──────────
    const bad = driven.filter((d) => d.r !== 'ok');
    check('10a', 'EVERY gesture found its control and drove it',
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
