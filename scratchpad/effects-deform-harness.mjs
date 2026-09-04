#!/usr/bin/env node
// CAN AN AUTHOR ACTUALLY ATTACH A DEFORM, IN THE RUNNING APP?
//
// The Effects layer card carried its own gap as a comment — "deform is wave 2",
// on a read-only line that could PRINT a deform nobody could set. Wave 2 gives
// the panel four attachments (`deform_fg`, `deform_bg`, `v_deform`, a layer's
// `deform`), each pointing at one `$defs/tableRef` with SIX spellings.
//
// 5,056 vitest tests pass over that and not one of them can see a `<select>`.
// The node suite cannot tell a rendered row from an unrendered one, a wired
// onChange from an unwired one, or a warning that exists as a string from a
// warning that is on screen. So this file drives the REAL app: real DOM events
// on the real controls, real CDP key events for undo, and then reads the MODEL
// back through `window.__dbg.aeon.scenesJson()` and the DOM back through
// `document.querySelectorAll`.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. A FORM THAT OFFERS LESS THAN THE CONTRACT CARRIES. Section 4 reads the
//    committed schema OFF DISK and asserts the rendered `<option>` list is
//    exactly its `$defs/tableRef` branches. A picker hand-written with "a wave
//    or a file" passes every unit test that only checks what it was given.
//
// 2. A SUB-FORM THAT DOES NOT FOLLOW THE FORM. Row 4e switches the table to
//    `v_column_perspective` and asserts the rendered parameter ROWS change from
//    the schema's sine parameters to the schema's perspective parameters. A
//    sub-form that drew a fixed amplitude/period pair would still write a valid
//    document and would still pass a value-level check.
//
// 3. A WARNING THAT IS A STRING AND NOT A PIXEL. Every advisory row below reads
//    the rendered text of the panel, not the provider's return value.
//
// 4. THE GUARD NO CONTROL IN THIS PANEL CAN SATISFY. Turning `v_deform` on makes
//    `left_column_mask` MANDATORY at build time (aeon scene_dsl.emp P3 Task 12
//    guard 1) and this panel has no control for it. Row 6b is the whole reason
//    the advisory exists: an author who does not see it ships a scene the build
//    refuses with no way to fix it in the app.
//
// 5. AN UNDO STACK THAT COUNTS WRONG. Row 5a toggles an attachment on and
//    presses Ctrl+Z ONCE; the whole attachment must go, and the key must be
//    ABSENT rather than written back as the string "none".
//
// 6. A CROSS-DOCUMENT SENTENCE THAT WAS NEVER RENDERED (section 10,
//    VDEFORM-WITNESS, 2026-09-04). The v_deform sweep gave the V-deform row a
//    sentence about a document that is NOT on screen: turning the toggle on
//    narrows every VSRAM ramp bound to every section this scene is bound to,
//    and the row now says so — or DECLINES, when the binding is dangling or
//    unreadable. Until this section that sentence was held by node-level
//    wording rows only, which in this repo means nothing had ever seen it.
//    Row 10c reads the narrowing arm off the DOM; row 10d reads the DECLINE
//    arm, which is the one a happy-path harness never reaches and the one a
//    confident wrong sentence hides in.
//
// ANTI-VACUOUS THROUGHOUT. Every row that could pass on an empty panel has a
// companion proving the instrument saw its subject: the project is open with
// sections, the scene is in the model, the row's `<select>` was FOUND (a missing
// element reports `no-element`, never a silent pass), the document before the
// gesture is quoted alongside the document after.
//
// ═══ WHAT IS *NOT* PROVEN HERE, STATED UP FRONT ═══
//
//   • THE TWO-SOURCES ADVISORY (`advisoryLayerDeformConflicts`) IS NOT
//     REACHABLE FROM THIS PANEL. It fires when a layer has `deform.own`
//     alongside a non-default `dsa`/`dsb`/`phase`, and the card has no control
//     for those three — so no gesture can create the state. Row 7f asserts the
//     WIRING (the advisory is called and its output is rendered) against a
//     scene that does not trip it, which is a weaker claim, and says so. The
//     condition itself is covered red-first in the node suite.
//   • NOTHING HERE IS A PIXEL PROBE. This panel is DOM controls, not a canvas;
//     every reading is `textContent` / `value` / `title` off real elements. The
//     one canvas fact re-checked is section 8's idle-repaint count.
//   • NO EMULATOR. Nothing here touches oracle or any emulator MCP tool. What a
//     deform LOOKS like on hardware is a foreground follow-up.
//
// ═══ dpr AND AIM ═══
//
// Xvfb's inferred devicePixelRatio has been observed at both 1 and 1.35 hours
// apart on this host, which is what made `effects-guides-harness` report 28/28
// twice and then 26/28. NOTHING IN THIS FILE DERIVES AN EXPECTATION FROM A
// DEVICE PIXEL — every gesture is on a DOM element found by `title` — so the
// failure mode does not apply. dpr and the panel's box are printed anyway, at
// row 0c, so a run that ever does grow a pixel expectation has the number
// beside it. The one mouse event dispatched (row 5b's click on the layer card)
// aims at the INTEGER centre of the element's own rect.
//
// ⚠ IT WRITES NOTHING INTO ANY CHECKOUT. Ctrl+S is never pressed, and sections
// 1-9 leave the opened project exactly as found (row 9a undoes the whole session
// back to the fixture's own scene list). Section 10 does write — a ~16 MB COPY
// of the aeon project under `os.tmpdir()`, removed in the `finally` — because
// the state row 10d needs cannot be authored by any gesture this app has. It
// never touches the aeon working tree; that is the `//harness-canvas-writers`
// ruling in package.json (d-28, COPY ONLY WHERE IT CAN WRITE) applied here.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     node scratchpad/effects-deform-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch (the incident effects-scene-harness records).
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-effects-deform`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'deform_probe';

// ─── THE CONTRACT, READ OFF DISK ────────────────────────────────────────────
// Every expectation about which forms exist, what parameters they take and what
// ranges they have comes from HERE, not from a number typed into this file.
// Bar F: a clean constant across varied inputs suggests a confound, and the
// confound this specifically avoids is a harness that agrees with a hand-written
// picker because both were written from the same memory of the schema.
const SCHEMA = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
const TABLE_BRANCHES = SCHEMA.$defs.tableRef.oneOf;
const FORM_IDS = TABLE_BRANCHES.map(
  (b) => ('bin' in b.properties ? 'bin' : b.properties.generator.const));
/** The parameter keys the schema says a form takes, in its own `required` order. */
const paramsOf = (id) => {
  const b = TABLE_BRANCHES.find(
    (x) => (id === 'bin' ? 'bin' in x.properties : x.properties.generator?.const === id));
  return id === 'bin' ? [] : b.required.filter((k) => k !== 'generator');
};
const LAYER_DEFAULTS = {
  dsa: SCHEMA.$defs.layer.properties.dsa.default,
  dsb: SCHEMA.$defs.layer.properties.dsb.default,
  phase: SCHEMA.$defs.layer.properties.phase.default,
};
const MASK_VALUES = SCHEMA.properties.left_column_mask.enum;
const MASK_DEFAULT = SCHEMA.properties.left_column_mask.default;
const SEED_PERIOD = TABLE_BRANCHES[0].properties.period.maximum;
const SEED_AMPLITUDE = TABLE_BRANCHES[0].properties.amplitude.minimum;
const FIRST_FORM = FORM_IDS[0];

// ─── THE CROSS-DOCUMENT SENTENCE'S OWN CONSTANTS, READ OFF DISK ─────────────
//
// Section 10 asserts a PAINTED STRING, and a harness that types the string it
// expects is a harness that agrees with whatever it was written from. So every
// expectation down there is lifted out of the module that authors the sentence,
// by regex, at run time — the leading words of each arm, the pixel width, the
// two "why we cannot decide" templates and the head of the hover note.
//
// ⚠ FROM `RUN.root`, NOT `ROOT`. This reads the sources that BUILT THE BUNDLE
// UNDER TEST, which is question 2 (scratchpad/lib/run-root.mjs). A borrowed run
// executes another tree's `dist/`, and lifting the expected wording out of THIS
// checkout's `src/` while the app runs somebody else's build is exactly the
// mismatch that makes a red row unreadable. `SCHEMA` above still reads `ROOT`;
// that is the pre-O72 idiom and is left alone rather than swept here.
//
// ⚠ AND IT REFUSES RATHER THAN DEFAULTING. A regex that stops matching (the
// constant renamed, the quoting changed) must stop the run naming the constant
// it could not find — a silent fallback would let section 10 assert a string
// nothing in the app ever produces, and both halves would go red for a reason
// that has nothing to do with the screen.
const RAMP_MODE_SRC_PATH = `${RUN.root}/src/core/formats/effects/ramp-scroll-mode.ts`;
const RAMP_MODE_SRC = readFileSync(RAMP_MODE_SRC_PATH, 'utf8');
function fromRampModeSource(re, what) {
  const m = RAMP_MODE_SRC.match(re);
  if (m === null) {
    throw new Error(`could not read ${what} out of ${RAMP_MODE_SRC_PATH}. Section 10 derives `
      + 'every expected phrase from that module rather than typing it, so a constant that has '
      + 'been renamed or requoted stops the run here instead of turning into a wrong expectation.');
  }
  return m[1];
}
/** The hardware granule the sentence quotes — 16 today, never typed here. */
const COLUMN_WIDTH_PX = Number(fromRampModeSource(
  /export const RAMP_SCROLL_COLUMN_WIDTH_PX\s*=\s*(\d+);/, 'RAMP_SCROLL_COLUMN_WIDTH_PX'));
/**
 * The leading words of the two arms the V-deform row can paint.
 *
 * ⚠ SCOPED TO ITS OWN BLOCK, and that is not tidiness. `RAMP_SCROLL_LEAD` — the
 * OTHER end of the same defect, forty lines above it in the same file — also has
 * a key spelled `unknown`, and it is declared FIRST. A file-wide `/unknown:
 * '([^']*)'/` therefore lifts the RAMP CARD's words ("NOT DECIDED BY ANY
 * DOCUMENT AURORA CAN READ:") and row 10c would assert a string the scene panel
 * never paints. The block is extracted first and searched on its own.
 */
const V_DEFORM_LEAD_BLOCK = fromRampModeSource(
  /export const V_DEFORM_RAMP_LEAD = Object\.freeze\(\{([\s\S]*?)\}\);/, 'V_DEFORM_RAMP_LEAD');
function fromLeadBlock(key) {
  const m = V_DEFORM_LEAD_BLOCK.match(new RegExp(`${key}: '([^']*)'`));
  if (m === null) throw new Error(`V_DEFORM_RAMP_LEAD has no ${key} arm in ${RAMP_MODE_SRC_PATH}`);
  return m[1];
}
const V_DEFORM_LEAD = { narrowed: fromLeadBlock('narrowed'), unknown: fromLeadBlock('unknown') };
/** The first literal of the hover note — how the painted element is FOUND. */
const V_DEFORM_NOTE_HEAD = fromRampModeSource(
  /export const V_DEFORM_RAMP_NOTE: string =\s*'([^']*)'/, 'V_DEFORM_RAMP_NOTE head');
/**
 * The two DECLINE clauses, as templates, lifted from `unknownWhy` itself.
 *
 * This is the row that matters, so its expectation is not paraphrased: the
 * harness takes the module's own two backticked sentences and substitutes the
 * section index and preset id it OBSERVED through the probe. A mutation that
 * makes the decline branch claim an answer cannot satisfy either of them.
 */
const UNKNOWN_WHY_SRC = fromRampModeSource(
  /const unknownWhy = \(b: VDeformRampBinding\): string => \(([\s\S]*?)\);\n/, 'unknownWhy');
const UNKNOWN_WHY_TEMPLATES = (() => {
  const m = UNKNOWN_WHY_SRC.match(/\?\s*`([^`]*)`[\s\S]*?:\s*`([^`]*)`/);
  if (m === null) {
    throw new Error(`could not read unknownWhy's two clause templates out of ${RAMP_MODE_SRC_PATH}`);
  }
  const fill = (tpl) => (section, presetId) => tpl
    .replace('${b.section}', String(section))
    .replace('${b.presetId}', presetId);
  return { unreadable: fill(m[1]), dangling: fill(m[2]) };
})();
/** The refusal's own closing words — "…is not decidable from here". */
const NOT_DECIDABLE = fromRampModeSource(
  /(is not decidable from here)/, 'the decline clause\'s closing words');

// ─── THE ONE STATE NO GESTURE IN THIS APP CAN AUTHOR ───────────────────────
//
// Row 10c needs a section whose `rasterRef` names a preset Aurora cannot
// resolve, and THAT IS UNREACHABLE THROUGH THE UI BY DESIGN, measured rather
// than assumed:
//
//   • `presetRefOptions` offers `''` plus every LOADED preset, so the picker
//     cannot write an id that is not in the library; and
//   • `deletePresetRefusal` DISABLES the Delete button while any section binds
//     the preset, so the other order — bind, then delete out from under it — is
//     refused too.
//
// Both refusals are correct and neither is going away. The state is still
// entirely ordinary on disk — the sidecar is hand-editable and aeon's generator
// writes it too (`unassignablePresetRef`'s own docblock says so) — so the least
// artificial reach is DISK, and what is constructed is named here and printed
// by row 10a rather than buried:
//
//   a COPY of the real aeon project (never the peer's working tree — the
//   `//harness-canvas-writers` ruling, d-28 COPY ONLY WHERE IT CAN WRITE),
//   with exactly three added files:
//     section_5.meta.json   rasterRef -> an id with no document  (DANGLING)
//     section_6.meta.json   rasterRef -> a file that is not JSON (UNREADABLE)
//     presets/<that id>.json   the file that is not JSON
//
// Everything else in section 10 is a real gesture on a real control: the scene
// is authored through the form, the ramp preset is bound through the Colour
// panel's own `rasterRef` select, the sections are bound through the scene
// panel's own `sceneRef` select, and `v_deform` is toggled on the same control
// rows 6e-6m drive.
const WITNESS = Object.freeze({
  /** Bound to a REAL ramp preset through the UI — the narrowing arm. */
  narrowSection: 2,
  /** `rasterRef` names a preset id with no document at all. */
  danglingSection: 5,
  danglingPreset: 'vdeform_witness_absent',
  /** `rasterRef` names a document that exists and will not parse. */
  unreadableSection: 6,
  unreadablePreset: 'vdeform_witness_unreadable',
  /** The scene authored in the fixture run and bound to those sections. */
  sceneId: 'vdeform_witness_scene',
});

/**
 * Stand up the fixture copy and return its directory.
 *
 * ⚠ A COPY OF TWO PATHS, not of the aeon checkout: `project.json` and
 * `games/sonic4/data`, which is everything `project.json` points at (tileset,
 * palette, dataPath, stripPath, bgLayout, bgTiles, objectLibrary, chunkLibrary)
 * plus the two trees `section-wiring.ts` reads. ~16 MB. Copying the checkout
 * would drag in `.git` and every agent worktree under it.
 */
function buildWitnessFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-vdeform-witness-'));
  mkdirSync(join(dir, 'games/sonic4'), { recursive: true });
  cpSync(`${AEONDIR}/games/sonic4/data`, join(dir, 'games/sonic4/data'), { recursive: true });
  cpSync(`${AEONDIR}/project.json`, join(dir, 'project.json'));

  const metaDir = join(dir, 'games/sonic4/data/editor/ojz/act1');
  const patchMeta = (index, patch) => {
    const p = join(metaDir, `section_${index}.meta.json`);
    let doc = {};
    try { doc = JSON.parse(readFileSync(p, 'utf8')); } catch { doc = {}; }
    writeFileSync(p, `${JSON.stringify({ ...doc, ...patch }, null, 2)}\n`);
    return p;
  };
  const wrote = [
    patchMeta(WITNESS.danglingSection, { rasterRef: WITNESS.danglingPreset, sceneRef: null }),
    patchMeta(WITNESS.unreadableSection, { rasterRef: WITNESS.unreadablePreset, sceneRef: null }),
  ];
  const badPath = join(dir, 'games/sonic4/data/editor/effects/presets',
    `${WITNESS.unreadablePreset}.json`);
  // NOT empty and not truncated JSON — a file that is unmistakably not a preset,
  // so `parseEffectsPreset` throws and the loader files it under `unreadable`.
  writeFileSync(badPath, 'this file is deliberately not JSON, so the preset loader files it '
    + 'under `unreadable` and the V-deform row has something it genuinely cannot read.\n');
  wrote.push(badPath);
  return { dir, wrote };
}

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
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-effects-deform/${name}.png`);
}

// A React-controlled input ignores `el.value = x`; the native setter plus a
// bubbling event is what a real keystroke looks like from React's side. This is
// the established pattern for this panel's controls (effects-guides-harness):
// a `<select>` opened by a real mouse click renders a NATIVE popup CDP cannot
// drive, so the click is not available as a gesture for these rows.
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
  el.click();
  return true;
})()`;

/** Every control whose `title` starts with a prefix — the panel's own row ids. */
const CONTROLS_TITLED = (prefix) => String.raw`
[...document.querySelectorAll('select,input')]
  .filter((e) => (e.title || '').startsWith(${JSON.stringify(prefix)}))
  .map((e) => ({ tag: e.tagName, title: e.title, value: e.value,
                 options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.value) : null }))`;

/** A field row's LABEL text, for every row in the panel — what the eye reads. */
const LABELS_NEAR = (prefix) => String.raw`
[...document.querySelectorAll('select,input')]
  .filter((e) => (e.title || '').startsWith(${JSON.stringify(prefix)}))
  .map((e) => {
    const row = e.closest('div');
    const label = row && row.parentElement
      ? [...row.parentElement.children].find((n) => n === row)
      : null;
    const span = row ? row.querySelector('span') : null;
    return span ? (span.textContent || '').trim() : null;
  })`;

/** The whole right-hand panel's rendered text — where the advisories live. */
const PANEL_TEXT = String.raw`
(() => {
  const anchor = [...document.querySelectorAll('span')]
    .find((e) => /^Scenes$/.test((e.textContent || '').trim()));
  if (!anchor) return 'no-panel';
  let n = anchor;
  for (let i = 0; i < 12 && n.parentElement; i++) n = n.parentElement;
  return (n.textContent || '');
})()`;

/**
 * THE V-DEFORM ROW'S CROSS-DOCUMENT SENTENCE, AS A PIXEL — the element, its
 * text, its box and the box of the scroller it lives in.
 *
 * FOUND BY THE HOVER, NOT BY THE PAINTED WORDS. `V_DEFORM_RAMP_NOTE` is the same
 * string on BOTH arms, so this locator identifies the element without assuming
 * which sentence it is carrying — which is the whole point. A probe that found
 * the element by "starts with THIS NARROWS…" would report `no-element` for a
 * decline branch that had been mutated into a confident claim, and a row reading
 * that as "the narrowing sentence is absent" would go GREEN on the exact defect
 * this section exists to catch.
 *
 * ⚠ THE RECT IS COMPARED TO THE SCROLLER'S BOX, not to `checkVisibility()` and
 * not to `getClientRects().length`. Both of those are green for an element
 * scrolled thousands of pixels out of its own scroll container; this panel is
 * `<Panel width={300} scroll>` and the V-deform row sits well down it, so that
 * is the live failure mode here rather than a hypothetical one. The element is
 * scrolled into view first and the intersection is then MEASURED.
 */
const V_DEFORM_IMPACT = String.raw`
(() => {
  const el = [...document.querySelectorAll('span[title]')]
    .find((e) => (e.title || '').startsWith(${JSON.stringify(V_DEFORM_NOTE_HEAD)}));
  if (!el) return { found: false, text: null, rect: null, scroller: null, insideScroller: null };
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  let sc = el.parentElement;
  while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
  const s = sc ? sc.getBoundingClientRect() : null;
  const box = (b) => ({ left: b.left, top: b.top, width: b.width, height: b.height });
  return {
    found: true,
    text: el.textContent || '',
    titleLength: (el.title || '').length,
    rect: box(r),
    scroller: s ? { tag: sc.tagName, ...box(s) } : null,
    insideScroller: s === null ? null
      : (r.bottom > s.top && r.top < s.bottom && r.right > s.left && r.left < s.right),
  };
})()`;

/**
 * THE ANTI-VACUOUS HALF OF EVERY ROW IN SECTION 10, spelled once.
 *
 * A row asserting a substring is equally green over an empty string it never
 * looked at, so before any wording claim: the element was FOUND, it carries
 * non-empty text, it carries the long-form hover, and its box actually
 * intersects the box of the panel that scrolls it.
 */
function impactIsOnScreen(i) {
  return !!i && i.found === true && typeof i.text === 'string' && i.text.length > 0
    && i.titleLength > 0 && i.rect.width > 0 && i.rect.height > 0 && i.insideScroller === true;
}
/** What a reader checks the row's AIM against — printed, never summarised. */
function describeImpact(i) {
  if (!i || i.found !== true) return 'V-deform impact span: NOT IN THE DOM (no-element)';
  return `V-deform impact span: rect=${JSON.stringify(i.rect)} `
    + `scroller=${JSON.stringify(i.scroller)} insideScroller=${i.insideScroller} `
    + `hover=${i.titleLength} chars\n        RENDERED TEXT (${i.text.length} chars): ${i.text}`;
}

/** The scene under test, BY ID — never `doc[0]`; the fixture has scenes of its own. */
function sceneOf(doc) { return doc.find((s) => s.id === SCENE_ID) ?? null; }

/**
 * EVERY ROW THAT ASSERTS A WARNING IS *ABSENT* NEEDS THIS.
 *
 * `!/warning/.test(text)` is green when the panel is on screen and the warning
 * has cleared — and it is EQUALLY green when `text` is `'no-panel'`, an empty
 * string, or the panel failed to render at all. Failure state and success state
 * emitting the same artifact is exactly the vacuous-check shape, so the
 * subject check is spelled once here and every negative row below carries it:
 * the panel is present AND still drawing the row the warning belongs to.
 */
// ⚠ TWO SUBSTRINGS, NOT ONE ORDERED PATTERN. This was
// `/Deform fg[\s\S]*Layer 0/`, which also asserted that the scene form came
// BEFORE the layer list in the column — and EW-SHAPE-TABS (d-26b) swapped them,
// so that the list gets the column's spare height instead of the form. The
// claim this predicate exists to make is "both halves of the Parallax job are
// on screen"; the order was never part of it, and asserting it here made eight
// rows red for a reason that had nothing to do with what any of them measure.
const PANEL_ALIVE_PARTS = ['Deform fg', 'Layer 0'];
function panelIsDrawn(text) {
  return typeof text === 'string' && text !== 'no-panel'
    && PANEL_ALIVE_PARTS.every((part) => text.includes(part));
}

/**
 * THE SCENE FORM, OPENED — it arrives COLLAPSED since EW-SHAPE-TABS (d-26b),
 * which is what gives the layers list above it a real height on the Parallax
 * sub-tab. Every row below reads controls inside that form, so the arrival
 * state has to be opened the way an author opens it: one click on the header.
 * Idempotent — it returns 'already-open' when the form is showing.
 */
const OPEN_SCENE_FORM = String.raw`
(() => {
  const has = () => [...document.querySelectorAll('input')]
    .some((e) => (e.title || '').startsWith('v_offset'));
  if (has()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer'
                && /^SCENE\s*\u2014/i.test((d.innerText || '').trim()))[0];
  if (!hdr) return 'no-scene-header';
  hdr.click();
  return 'clicked';
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  /** Section 10's fixture copy — removed in the `finally`, never left behind. */
  let fixture = null;
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

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon. ----------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    // ---- 2. The Effects facet. -------------------------------------------
    await sleep(2500);
    const pill = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill', pill === true);
    await sleep(1200);
    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(Scenes|Layers|Section assignment)/.test(t))`);
    check('2b', 'ANTI-VACUOUS: the Effects panel is mounted',
      headings.includes('Scenes'), JSON.stringify(headings));
    // The scene form arrives collapsed since d-26b's sub-tabs; every deform row
    // is a control inside it.
    const openedForm = await c.evalExpr(OPEN_SCENE_FORM);
    await sleep(900);
    check('2c', 'the Scene form is open — it arrives collapsed since d-26b [instrument]',
      openedForm === 'clicked' || openedForm === 'already-open', `open → ${openedForm}`);

    // ---- 3. Author a scene through the real form. ------------------------
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(800);
    let scenes = await c.json('window.__dbg.aeon.scenes()');
    check('3a', 'ANTI-VACUOUS: the scene this harness authored exists in the model',
      scenes.some((s) => s.id === SCENE_ID) && scenes.length === scenes0.length + 1,
      `before=${JSON.stringify(scenes0.map((s) => s.id))} after=${JSON.stringify(scenes.map((s) => s.id))}`);
    const picked = await c.evalExpr('window.__dbg.aeon.selectedScene()');
    check('3b', 'the panel is editing THAT scene', picked === SCENE_ID, `selectedScene()=${picked}`);

    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('3c', 'ANTI-VACUOUS: the fresh scene carries NO deform key of any kind — '
      + 'every row below is a DELTA from nothing',
      sceneOf(doc) !== null
      && sceneOf(doc).deform_fg === undefined && sceneOf(doc).deform_bg === undefined
      && sceneOf(doc).v_deform === undefined && sceneOf(doc).layers[0].deform === undefined,
      JSON.stringify(sceneOf(doc)));

    // ---- 0. PROVENANCE, now that the form is on screen. -------------------
    // The deform rows exist NOWHERE on master, so finding one is what says the
    // bundle under test contains this parcel. Without it every PASS below could
    // be describing a build that has none of it.
    const fgRow = await c.json(CONTROLS_TITLED('deform_fg'));
    check('0a', 'the build under test contains the deform rows (this branch, not master)',
      fgRow.length > 0, `${RUN.root}/dist — controls titled deform_fg: ${JSON.stringify(fgRow)}`);
    if (fgRow.length === 0) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    const dpr = await c.evalExpr('window.devicePixelRatio');
    const panelBox = await c.json(String.raw`
      (() => {
        const el = [...document.querySelectorAll('select')].find((e) => (e.title||'').startsWith('deform_fg'));
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      })()`);
    check('0c', 'ANTI-VACUOUS: the environment is recorded, grid and all',
      typeof dpr === 'number' && panelBox.width > 0,
      `devicePixelRatio=${dpr}; deform_fg select rect=${JSON.stringify(panelBox)}; `
      + `NO expectation below is derived from a device pixel — every gesture is on a DOM `
      + `element found by title, so the fractional-rect failure mode does not apply. `
      + `Row 5b's mouse click aims at the integer centre `
      + `(${Math.round(panelBox.left + panelBox.width / 2)}, ${Math.round(panelBox.top + panelBox.height / 2)}).`);
    await shot(c, '1-panel-before');

    // ---- 4. THE SCENE-LEVEL PLANE ATTACHMENT. -----------------------------
    const setFg = async (v) => c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('deform_fg'))`, v));
    const toggled = await setFg('on');
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const fg = sceneOf(doc).deform_fg;
    check('4a', 'turning Deform fg ON writes SceneDeform.Shared into the document, '
      + 'seeded from the schema (first form, period = the whole table, amplitude = its minimum)',
      toggled === 'ok' && !!fg && !!fg.shared
      && fg.shared.table.generator === FIRST_FORM
      && fg.shared.table.period === SEED_PERIOD
      && fg.shared.table.amplitude === SEED_AMPLITUDE
      && fg.shared.speed === 0,
      `set=${toggled} deform_fg=${JSON.stringify(fg)} `
      + `schema seed: {generator:${FIRST_FORM}, amplitude:${SEED_AMPLITUDE}, period:${SEED_PERIOD}}`);

    // THE SUB-FORM IS ON SCREEN, and it is the schema's parameters, not a pair
    // somebody typed. This is the row that separates "the document is right"
    // from "the author can see and change it".
    let rows = await c.json(CONTROLS_TITLED('deform_fg'));
    const paramTitles = (rs, prefix) => rs
      .filter((r) => r.tag === 'INPUT')
      .map((r) => r.title.slice(prefix.length).trim().split(' ')[0]);
    // ⚠ "ONE SPINNER PER PARAMETER" IS NOT THE RULE ANY MORE — repaired in the
    // O50 triage, 2026-09-03. This row filtered `tag === 'INPUT'` and so counted
    // only NumberFields. ROADMAP row 63 moved `period` to a `<Select>`, on the
    // stated principle "A PICKER WHERE THE ENGINE ADMITS A SET, A SPINNER WHERE
    // IT ADMITS A RANGE": period must DIVIDE the table length, which no
    // min/max or clamp can express, and the spinner "advertised 247 values the
    // build refuses". So the row read `["amplitude","speed"]` against a schema
    // asking for `["amplitude","period"]` and went red because the app got
    // BETTER at the thing the row is about.
    //
    // The property the row exists for is "the author can see and change every
    // schema parameter", and that is unchanged — it is the CONTROL COUNT, not
    // the control's tag. So: one control per schema parameter plus speed, in
    // schema order, over inputs AND selects (the `table` picker itself is not a
    // parameter and is excluded by name, and asserted separately by [4c]).
    //
    // AND THE KIND IS STILL CHECKED, just not by pinning it: any parameter
    // rendered as a picker must SAY WHY on its own title — the divisor rule —
    // so a picker can never quietly replace a spinner without carrying the
    // engine constraint that justifies it. Both halves print their artifact.
    // The two non-parameter controls that share the prefix and are excluded BY
    // NAME rather than by position: the attachment's own on/off select (its
    // title continues straight into an em dash, so its "key" is not a word at
    // all) and the `table` form picker, which [4c] asserts separately. `bin` is
    // a path, not a numeric parameter, and belongs to one branch only.
    const paramControls = (rs, prefix) => rs
      .map((r) => ({ tag: r.tag, key: r.title.slice(prefix.length).trim().split(' ')[0],
                     title: r.title }))
      .filter((r) => /^[a-z][a-z0-9_]*$/.test(r.key) && r.key !== 'table' && r.key !== 'bin');
    const fgParams = paramControls(rows, 'deform_fg');
    const pickerJustified = fgParams
      .filter((r) => r.tag === 'SELECT')
      .every((r) => /must divide the \d+-byte table/.test(r.title));
    check('4b', 'the table sub-form RENDERS one CONTROL per schema parameter of the seeded form, '
      + 'plus speed — and any parameter offered as a PICKER rather than a spinner carries the '
      + 'engine rule that justifies it (row 63: a set, not a range)',
      fgParams.map((r) => r.key).join(',') === [...paramsOf(FIRST_FORM), 'speed'].join(',')
      && pickerJustified,
      `rendered=${JSON.stringify(fgParams.map((r) => `${r.key}:${r.tag}`))} `
      + `schema ${FIRST_FORM} requires ${JSON.stringify(paramsOf(FIRST_FORM))} (+ speed)`
      + `\n        picker titles=${JSON.stringify(fgParams.filter((r) => r.tag === 'SELECT')
        .map((r) => r.title))}`);

    // THE FORM PICKER OFFERS THE WHOLE CONTRACT. Six branches, not two.
    const formSelect = rows.find((r) => r.tag === 'SELECT' && / table — /.test(r.title));
    check('4c', 'the table picker offers EXACTLY the schema\'s tableRef branches, in schema order',
      !!formSelect && formSelect.options.join(',') === FORM_IDS.join(','),
      `rendered=${JSON.stringify(formSelect?.options)} schema=${JSON.stringify(FORM_IDS)}`);

    // …and it renders the whole attachment as a call, which no select+spinner can.
    check('4d', 'the picker\'s title spells the attachment as a call',
      !!formSelect && formSelect.title.includes(`${FIRST_FORM}(${SEED_AMPLITUDE}, ${SEED_PERIOD})`),
      `title=${JSON.stringify(formSelect?.title)}`);

    // ROW 4e — THE SUB-FORM FOLLOWS THE FORM. A picker that drew a fixed
    // amplitude/period pair would have passed 4a-4d.
    const OTHER = FORM_IDS.find((f) => f !== FIRST_FORM && paramsOf(f).length > 0
      && paramsOf(f).join() !== paramsOf(FIRST_FORM).join());
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('deform_fg') && / table — /.test(e.title))`,
      OTHER));
    await sleep(600);
    rows = await c.json(CONTROLS_TITLED('deform_fg'));
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('4e', `switching the table to ${OTHER} redraws the spinners as ITS parameters `
      + 'and rewrites the document to match',
      paramTitles(rows, 'deform_fg').join(',') === [...paramsOf(OTHER), 'speed'].join(',')
      && sceneOf(doc).deform_fg.shared.table.generator === OTHER
      && paramsOf(OTHER).every((k) => k in sceneOf(doc).deform_fg.shared.table),
      `rendered=${JSON.stringify(paramTitles(rows, 'deform_fg'))} `
      + `schema ${OTHER} requires ${JSON.stringify(paramsOf(OTHER))}; `
      + `document table=${JSON.stringify(sceneOf(doc).deform_fg.shared.table)}`);

    // ROW 4f — THE RAW .bin BRANCH, and its refusal ON SCREEN.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('deform_fg') && / table — /.test(e.title))`,
      'bin'));
    await sleep(500);
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input')].find(e => /^deform_fg bin —/.test(e.title||''))`,
      '../escape.bin'));
    await sleep(600);
    let text = await c.evalExpr(PANEL_TEXT);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('4f', 'a .bin path with a ".." segment is REFUSED on screen — and the document still '
      + 'holds it, because Aurora advises and sigil is the rulebook',
      /not a legal table path/.test(text)
      && sceneOf(doc).deform_fg.shared.table.bin === '../escape.bin',
      `refusal on screen=${/not a legal table path/.test(text)} `
      + `document bin=${JSON.stringify(sceneOf(doc).deform_fg.shared.table.bin)}`);
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input')].find(e => /^deform_fg bin —/.test(e.title||''))`,
      'tables/canopy.bin'));
    await sleep(600);
    text = await c.evalExpr(PANEL_TEXT);
    check('4g', 'a legal path clears the refusal — the row is not permanently red once tripped '
      + '(and the panel is still drawn, so the absence is an absence and not a blank screen)',
      !/not a legal table path/.test(text) && panelIsDrawn(text),
      `panel still says it: ${/not a legal table path/.test(text)}; `
      + `panel drawn: ${panelIsDrawn(text)} (${text.length} chars of panel text)`);
    await shot(c, '2-deform-fg-bin');

    // ---- 5. ONE GESTURE, ONE UNDO STEP. -----------------------------------
    const undo = async () => {
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await sleep(500);
    };
    // Four gestures got us here (on, form, bin form, path, path) — undo back to
    // "no deform_fg key at all" and count them, so a gesture that quietly wrote
    // TWO commands is caught by the count rather than by the end state.
    let undos = 0;
    for (let i = 0; i < 10; i++) {
      doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
      if (sceneOf(doc) && sceneOf(doc).deform_fg === undefined) break;
      await undo();
      undos++;
    }
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5a', 'the attachment undoes away entirely, and the key is ABSENT rather than the '
      + 'string "none" — five gestures, five undos',
      sceneOf(doc).deform_fg === undefined
      && !('deform_fg' in sceneOf(doc))
      && undos === 5,
      `${undos} undos; scene now ${JSON.stringify(sceneOf(doc))}`);

    // A REAL MOUSE EVENT, on the one control where it is meaningful: the layer
    // card's Remove/Add buttons are ordinary buttons, so a CDP click reaches
    // them. Aim is the INTEGER centre of the element's own rect.
    const addBox = await c.json(String.raw`
      (() => {
        const el = [...document.querySelectorAll('button')]
          .find((e) => /Add layer/.test((e.getAttribute('aria-label')||'') + ' ' + (e.textContent||'')));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
    const aimX = Math.round(addBox.x);
    const aimY = Math.round(addBox.y);
    const layersBefore = sceneOf(doc).layers.length;
    for (const type of ['mousePressed', 'mouseReleased']) {
      await c.send('Input.dispatchMouseEvent', {
        type, x: aimX, y: aimY, button: 'left', clickCount: 1,
        buttons: type === 'mousePressed' ? 1 : 0 });
    }
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5b', 'a REAL CDP mouse click on Add layer adds one — the panel responds to a pointer, '
      + 'not only to synthetic change events',
      sceneOf(doc).layers.length === layersBefore + 1,
      `dpr=${dpr} aim=(${aimX}, ${aimY}) layers ${layersBefore} -> ${sceneOf(doc).layers.length}`);

    // ---- 6. THE CROSS-FIELD ADVISORIES. -----------------------------------
    // 6a: a layer's own table with no scene table on either plane.
    const setLayerDeform = async (i, v) => c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('Layer ${i} deform.own'))`, v));
    const lay0 = await setLayerDeform(0, 'on');
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    text = await c.evalExpr(PANEL_TEXT);
    const own = sceneOf(doc).layers[0].deform;
    check('6a', "a layer's OWN table with no scene table on either plane is advised on screen, "
      + 'and the seed is the schema defaults of the very fields it lowers into',
      lay0 === 'ok'
      && !!own && own.own.shift_a === LAYER_DEFAULTS.dsa && own.own.shift_b === LAYER_DEFAULTS.dsb
      && own.own.phase === LAYER_DEFAULTS.phase
      && /attaches none on either plane/.test(text),
      `set=${lay0} deform=${JSON.stringify(own)} `
      + `schema defaults dsa/dsb/phase=${JSON.stringify(LAYER_DEFAULTS)}; `
      + `advisory on screen=${/attaches none on either plane/.test(text)}`);

    check('6b', 'the seed is SILENT and the card says so — an author is not left with a '
      + 'control that looks broken',
      /neither plane samples it/.test(text),
      `inert advisory on screen=${/neither plane samples it/.test(text)}`);

    // Give a plane amplitude: the inert advisory must clear, and only it.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input')].find(e => /^Layer 0 shift_b —/.test(e.title||''))`, '0'));
    await sleep(600);
    text = await c.evalExpr(PANEL_TEXT);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6c', 'lowering Shift B clears the inert advisory and leaves the OTHER one standing — '
      + 'the two are independent, not one warning wearing two sentences',
      !/neither plane samples it/.test(text)
      && /attaches none on either plane/.test(text)
      && panelIsDrawn(text)
      && sceneOf(doc).layers[0].deform.own.shift_b === 0,
      `inert=${/neither plane samples it/.test(text)} `
      + `no-scene-table=${/attaches none on either plane/.test(text)} `
      + `panel drawn=${panelIsDrawn(text)} `
      + `shift_b=${sceneOf(doc).layers[0].deform.own.shift_b}`);

    // Attach a scene table on the OTHER plane: the engine's condition is either
    // plane, so deform_bg must silence it.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('deform_bg'))`, 'on'));
    await sleep(700);
    text = await c.evalExpr(PANEL_TEXT);
    check('6d', 'attaching the table on deform_BG silences it — the guard is "either plane", '
      + 'and a check that only knew about fg would still be showing the warning',
      !/attaches none on either plane/.test(text) && panelIsDrawn(text),
      `still on screen=${/attaches none on either plane/.test(text)}; `
      + `panel drawn=${panelIsDrawn(text)}`);
    await shot(c, '3-layer-deform');

    // ---- 6e/6f. THE GUARD NO CONTROL HERE CAN SATISFY. --------------------
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('v_deform'))`, 'on'));
    await sleep(700);
    text = await c.evalExpr(PANEL_TEXT);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6e', 'turning V deform on writes SceneVDeform.Columns and RAISES the mandatory '
      + 'left_column_mask advisory — the build would refuse this scene',
      !!sceneOf(doc).v_deform && !!sceneOf(doc).v_deform.columns
      && /no left_column_mask policy/.test(text),
      `v_deform=${JSON.stringify(sceneOf(doc).v_deform)} `
      + `advisory on screen=${/no left_column_mask policy/.test(text)}`);
    // ═══ THE POLICY ROW (the follow-up) ═══
    //
    // Until this addition the advisory above ended "set it in the scene file by
    // hand — this panel has no control for it yet", which is a shipped control
    // that can author a build-refused scene with no in-app remedy. Rows 6f-6m
    // are the control that closes it, and they are built to catch the two ways
    // it could be there and still be wrong: a picker that offers a value the
    // ENGINE refuses outright, and a gate that only works in one direction.
    const maskSelect = String.raw`
      [...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('left_column_mask'))`;
    const maskOptions = await c.json(String.raw`
      (() => {
        const el = ${maskSelect};
        if (!el) return null;
        return { value: el.value,
                 options: [...el.options].map(o => ({ value: o.value, disabled: o.disabled })) };
      })()`);
    check('6f', 'the mandatory policy now has a ROW, offering exactly the schema enum in schema order',
      !!maskOptions && maskOptions.options.map((o) => o.value).join(',') === MASK_VALUES.join(',')
      && maskOptions.value === MASK_DEFAULT,
      `rendered=${JSON.stringify(maskOptions)} schema=${JSON.stringify(MASK_VALUES)} `
      + `default=${MASK_DEFAULT}`);

    check('6g', 'sprite_mask is RENDERED but DISABLED — the schema admits it and the engine '
      + 'refuses it outright, so it must be visible and unpickable',
      !!maskOptions
      && maskOptions.options.filter((o) => o.disabled).map((o) => o.value).join(',') === 'sprite_mask',
      `disabled options=${JSON.stringify(maskOptions?.options.filter((o) => o.disabled))}`);

    // …and factor0_lock is NOT disabled even though this scene cannot support
    // the claim (its layers are FACTOR_1). Aurora's own test of that
    // precondition is deliberately stricter than the engine's, so refusing the
    // value in the picker would be the editor refusing what the build accepts.
    check('6h', 'factor0_lock stays SELECTABLE on a scene that cannot make the claim — the '
      + 'editor advises, it does not refuse what the build might accept',
      !!maskOptions && maskOptions.options.find((o) => o.value === 'factor0_lock')?.disabled === false,
      `factor0_lock=${JSON.stringify(maskOptions?.options.find((o) => o.value === 'factor0_lock'))}`);

    // PICK IT, and watch the claim be adjudicated on screen.
    await c.evalExpr(SET_INPUT(maskSelect, 'factor0_lock'));
    await sleep(700);
    text = await c.evalExpr(PANEL_TEXT);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6i', 'choosing factor0_lock writes it AND raises the unsupportable-claim advisory, '
      + "naming the layer whose Plane B factor is not FACTOR_0",
      sceneOf(doc).left_column_mask === 'factor0_lock'
      && /left_column_mask factor0_lock:/.test(text)
      && /Plane B factor is FACTOR_1, not FACTOR_0/.test(text)
      && !/no left_column_mask policy/.test(text),
      `document=${JSON.stringify(sceneOf(doc).left_column_mask)} `
      + `claim advisory=${/left_column_mask factor0_lock:/.test(text)} `
      + `mandatory advisory cleared=${!/no left_column_mask policy/.test(text)}`);

    // LOCK EVERY LAYER'S fb TO FACTOR_0 through the panel's own factor pickers.
    // This is the row most at risk of being vacuous: a scene that FAILS the
    // precondition is trivial to write, so an assertion that only ever saw the
    // failing side would pass against a check that is hard-coded to refuse.
    // Driving it to the SUPPORTED side, on screen, is what makes it discriminate.
    const layerCount = sceneOf(doc).layers.length;
    for (let i = 0; i < layerCount; i++) {
      await c.evalExpr(SET_INPUT(
        `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('Layer ${i} fb —'))`,
        'FACTOR_0'));
      await sleep(250);
    }
    await sleep(600);
    text = await c.evalExpr(PANEL_TEXT);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const fbs = sceneOf(doc).layers.map((l) => l.fb);
    // THE REASON MUST CHANGE, not merely persist. Half one is now satisfied, so
    // the claim is adjudicated by half two — layer 0 still carries the own()
    // table row 6a attached, with the shift_b row 6c lowered to 0, and
    // deform_bg is attached from row 6d. A check that implemented only half one
    // would report the claim SUPPORTED here; one that refuses unconditionally
    // would still be quoting FACTOR_1.
    check('6j', 'locking EVERY layer to FACTOR_0 satisfies half one — and the refusal switches '
      + 'to HALF TWO rather than clearing or standing still',
      fbs.every((f) => f === 'FACTOR_0')
      && !/Plane B factor is FACTOR_1/.test(text)
      && /live Plane B deform amplitude/.test(text)
      && panelIsDrawn(text),
      `layer fbs=${JSON.stringify(fbs)} `
      + `half-one reason gone=${!/Plane B factor is FACTOR_1/.test(text)} `
      + `half-two reason present=${/live Plane B deform amplitude/.test(text)} `
      + `panel drawn=${panelIsDrawn(text)}`);

    // …AND NOW THE SUPPORTED SIDE, which is the half that makes this row a
    // measurement rather than an assertion that a refusal exists. Silence the
    // Plane-B amplitude (shift_b back to the no-sample sentinel) and the claim
    // becomes one this scene CAN make: the advisory must clear entirely.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('input')].find(e => /^Layer 0 shift_b —/.test(e.title||''))`,
      String(LAYER_DEFAULTS.dsb)));
    await sleep(700);
    text = await c.evalExpr(PANEL_TEXT);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6k', 'silencing the Plane B amplitude makes factor0_lock a claim this scene CAN '
      + 'make — the advisory clears, with the panel still drawn',
      sceneOf(doc).layers[0].deform.own.shift_b === LAYER_DEFAULTS.dsb
      && !/left_column_mask factor0_lock:/.test(text)
      && sceneOf(doc).left_column_mask === 'factor0_lock'
      && panelIsDrawn(text),
      `shift_b=${sceneOf(doc).layers[0].deform.own.shift_b} `
      + `policy still declared=${sceneOf(doc).left_column_mask} `
      + `advisory=${/left_column_mask factor0_lock:/.test(text)} `
      + `panel drawn=${panelIsDrawn(text)}`);

    // ═══ THE GATE IS MUTUAL ═══
    // Turning V deform OFF must take the policy with it, in ONE command: the
    // engine refuses a declared policy on a scene with no per-column V deform,
    // so a toggle that cleared one key would leave the author's document
    // build-refused for having turned a feature off.
    const beforeOff = { v: sceneOf(doc).v_deform !== undefined, m: sceneOf(doc).left_column_mask };
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('v_deform'))`, 'none'));
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    text = await c.evalExpr(PANEL_TEXT);
    const afterOff = sceneOf(doc);
    check('6l', 'turning V deform OFF clears left_column_mask WITH it — both keys absent, and '
      + 'the row leaves the form',
      beforeOff.v === true && beforeOff.m === 'factor0_lock'
      && !('v_deform' in afterOff) && !('left_column_mask' in afterOff)
      && !/adjudicates an artifact that cannot occur/.test(text)
      && panelIsDrawn(text),
      `before: v_deform set=${beforeOff.v} policy=${beforeOff.m}; `
      + `after: v_deform in doc=${'v_deform' in afterOff} policy in doc=${'left_column_mask' in afterOff}; `
      + `guard-2 advisory=${/adjudicates an artifact that cannot occur/.test(text)}; `
      + `panel drawn=${panelIsDrawn(text)}`);

    // ONE COMMAND, therefore ONE undo restores BOTH. A two-command toggle would
    // put v_deform back while the policy stayed cleared — which is the
    // build-refused state, reached by pressing undo.
    await undo();
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6m', 'ONE Ctrl+Z puts BOTH keys back — the two-key clear is one command',
      sceneOf(doc).v_deform !== undefined && sceneOf(doc).left_column_mask === 'factor0_lock',
      `after one undo: v_deform=${sceneOf(doc).v_deform === undefined ? 'absent' : 'set'} `
      + `policy=${JSON.stringify(sceneOf(doc).left_column_mask)}`);

    // 6n: the per-column / vsplit collision, through the panel's OWN vsplit
    // control — two independent rows of the form disagreeing, which is the only
    // kind of defect a cross-field advisory exists for.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => /^Layer 1 vsplit\.at/.test(e.title||''))`, 'at'));
    await sleep(700);
    text = await c.evalExpr(PANEL_TEXT);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('6n', 'a layer split authored while V deform is on raises the VSRAM collision, '
      + 'naming the layer',
      /layer 1 authors a Plane B split/.test(text)
      && !!sceneOf(doc).layers[1].vsplit,
      `advisory=${/layer 1 authors a Plane B split/.test(text)} `
      + `layer 1 vsplit=${JSON.stringify(sceneOf(doc).layers[1]?.vsplit)}`);
    await shot(c, '4-vdeform-advisories');

    // ---- 7. THE WIRING OF THE ADVISORY NOTHING CALLED. --------------------
    // WEAKER THAN THE ROWS ABOVE, DELIBERATELY LABELLED. The two-sources
    // condition needs a non-default dsa/dsb/phase alongside deform.own, and the
    // card has NO control for those three — so no gesture on this panel can
    // produce it. What is checked here is that the call site exists and renders
    // nothing when the condition is false, which is a real (if partial) claim:
    // a component that threw, or that rendered a stray empty warning, fails it.
    check('7a', 'NOT THE CONDITION, THE WIRING: advisoryLayerDeformConflicts is called for the '
      + 'selected scene and renders nothing on a scene that does not trip it',
      !/two-sources guard/.test(text) && panelIsDrawn(text),
      `the card is drawn (Layer 0 present=${/Layer 0/.test(text)}) and no two-sources warning `
      + 'is on it. The CONDITION is covered red-first in the node suite '
      + '(providers/__tests__/effects-aeon.test.ts + the codec\'s own tests); it is NOT '
      + 'reachable from this panel because dsa/dsb/phase have no control.');

    // ---- 7b. CURVE ∧ DEFORM ON ONE STRIP. --------------------------------
    // Two controls four rows apart on ONE card — the curve picker (parcel H)
    // and the deform toggle (wave 2) — authoring a pair the build forbids. This
    // is reachable entirely through the UI, which is what separates it from 7a.
    await c.evalExpr(SET_INPUT(
      `[...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('Layer 1 curve.to —'))`,
      'FACTOR_1_2'));
    await sleep(500);
    const curveOnly = await c.evalExpr(PANEL_TEXT);
    const lay1 = await setLayerDeform(1, 'on');
    await sleep(700);
    text = await c.evalExpr(PANEL_TEXT);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('7b', 'a curve AND a deform table on one strip is advised — and the curve alone was '
      + 'NOT, so the row is about the pair and not about either control',
      lay1 === 'ok'
      && !/both a curve and its own deform table/.test(curveOnly)
      && /both a curve and its own deform table/.test(text)
      && !!sceneOf(doc).layers[1].curve && !!sceneOf(doc).layers[1].deform,
      `curve alone advised=${/both a curve and its own deform table/.test(curveOnly)} `
      + `pair advised=${/both a curve and its own deform table/.test(text)} `
      + `layer 1 curve=${JSON.stringify(sceneOf(doc).layers[1]?.curve)} `
      + `deform=${sceneOf(doc).layers[1]?.deform === undefined ? 'absent' : 'own'}`);
    await shot(c, '5-curve-and-deform');

    // ---- 8. NO CLOCK WAS ADDED. -------------------------------------------
    const installed = await c.evalExpr(String.raw`
      (() => {
        if (window.__deformProbe) return 'already';
        const cv = document.getElementById('map-canvas');
        if (!cv) return 'no-map-canvas';
        const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
        window.__deformProbe = P;
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
      })()`);
    check('8a', 'ANTI-VACUOUS: the repaint probe bound to the live #map-canvas',
      installed === 'installed' || installed === 'already', `install=${installed}`);
    await c.evalExpr('window.__deformProbe.repaints = 0; window.__deformProbe.ticks = 0; window.__deformProbe.start()');
    await sleep(3000);
    const idle = await c.json(
      '({ repaints: window.__deformProbe.repaints, ticks: window.__deformProbe.ticks, bound: window.__deformProbe.bound() })');
    await c.evalExpr('window.__deformProbe.stop()');
    check('8b', 'ANTI-VACUOUS: the page IS still painting and the probe is still bound',
      idle.ticks > 60 && idle.bound === true, JSON.stringify(idle));
    check('8c', 'the deform rows add NO idle map repaints (MapViewport 37/37 stays conditioned)',
      idle.repaints === 0,
      `${idle.repaints} repaints over 3.0s idle against ${idle.ticks} rAF ticks`);

    // ---- 9. Leave the tree as found. --------------------------------------
    let teardown = 0;
    for (let i = 0; i < 80; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await undo();
      teardown++;
    }
    scenes = await c.json('window.__dbg.aeon.scenes()');
    check('9a', 'the whole session undoes back to the fixture — nothing was saved',
      teardown > 0 && JSON.stringify(scenes.map((s) => s.id)) === JSON.stringify(scenes0.map((s) => s.id)),
      `${teardown} undos; left ${JSON.stringify(scenes.map((s) => s.id))}, `
      + `found ${JSON.stringify(scenes0.map((s) => s.id))}`);

    // ═══════════════════════════════════════════════════════════════════════
    // 10. THE CROSS-DOCUMENT SENTENCE, ON SCREEN (VDEFORM-WITNESS)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // WHAT THIS SECTION EXISTS FOR. The 2026-09-04 sweep gave the V-deform row
    // a new painted sentence: turning `v_deform` on tells the author what it
    // just did to a VSRAM ramp bound elsewhere, and DECLINES where the binding
    // cannot be resolved. Every row holding that sentence until now has been a
    // node-level wording row — and the node suite in this repo cannot see React
    // or a rendered surface at all, which is the standing reason this file
    // exists. A painted string with no screen witness is precisely the gap.
    //
    // TWO ARMS, AND THE SECOND IS THE ONE THAT MATTERS. A happy-path harness
    // reaches the narrowing case and stops; the arm where Aurora must claim
    // NEITHER answer is the arm a confident wrong sentence hides in, and it is
    // unreachable through the UI (see WITNESS's block for the two refusals that
    // make it so, and for exactly what is constructed to get there).
    //
    // IT RUNS LAST, AFTER ROW 9's TEARDOWN, on purpose: it REOPENS the project
    // against the fixture copy, which discards the in-memory session above it.
    // Row 9a has already proven that session unwound to the fixture's own scene
    // list, so nothing is lost by replacing it here.
    fixture = buildWitnessFixture();
    note('THE CONSTRUCTED HALF, NAMED (row 10c cannot be reached through any gesture)',
      `fixture project = ${fixture.dir}\n        `
      + `a COPY of ${AEONDIR} (project.json + games/sonic4/data), never that working tree, `
      + `with three files written:\n        `
      + fixture.wrote.map((p) => `  ${p.slice(fixture.dir.length + 1)}`).join('\n        ')
      + `\n        section ${WITNESS.danglingSection} -> rasterRef "${WITNESS.danglingPreset}" `
      + `(no such document: DANGLING); section ${WITNESS.unreadableSection} -> rasterRef `
      + `"${WITNESS.unreadablePreset}" (a document that is not JSON: UNREADABLE). `
      + 'Everything else below is a real DOM event on a real control.');
    note('THE EXPECTATIONS, LIFTED OUT OF THE MODULE THAT AUTHORS THE SENTENCE',
      `${RAMP_MODE_SRC_PATH}\n        `
      + `RAMP_SCROLL_COLUMN_WIDTH_PX = ${COLUMN_WIDTH_PX}\n        `
      + `V_DEFORM_RAMP_LEAD.narrowed = ${JSON.stringify(V_DEFORM_LEAD.narrowed)}\n        `
      + `V_DEFORM_RAMP_LEAD.unknown  = ${JSON.stringify(V_DEFORM_LEAD.unknown)}\n        `
      + `unknownWhy dangling template  = ${JSON.stringify(UNKNOWN_WHY_TEMPLATES.dangling('N', 'ID'))}\n        `
      + `unknownWhy unreadable template = ${JSON.stringify(UNKNOWN_WHY_TEMPLATES.unreadable('N', 'ID'))}`);

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(fixture.dir)})`)
      .catch((e) => console.log('        fixture open threw:', e.message));
    let fst = null;
    for (let i = 0; i < 40; i++) {
      fst = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (fst && fst.open) break;
      await sleep(400);
    }
    await sleep(1500);
    // The facet and the scene form are re-established the way an author would
    // find them after opening a project: the pill, then the collapsed form.
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1200);
    const reopenedForm = await c.evalExpr(OPEN_SCENE_FORM);
    await sleep(900);

    const libraryPresets = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    const unreadablePresets = await c.json('window.__dbg.aeon.unreadablePresets()');
    // THE RAMP PRESET IS CHOSEN BY WHAT IT CARRIES, never by an id typed here:
    // `ramp` is the only preset shape per-column VSRAM mode can reach, so the
    // subject of row 10b is "a preset in this project whose document has one".
    const rampPreset = libraryPresets.find((p) => p.ramp !== undefined) ?? null;
    const danglingRef = await c.evalExpr(
      `window.__dbg.aeon.rasterRef(${WITNESS.danglingSection})`);
    const unreadableRef = await c.evalExpr(
      `window.__dbg.aeon.rasterRef(${WITNESS.unreadableSection})`);
    check('10a', 'ANTI-VACUOUS: the fixture project is open and carries all three subjects — '
      + 'a REAL ramp preset, a DANGLING rasterRef and an UNREADABLE one',
      !!(fst && fst.open && fst.sections > 0)
      && rampPreset !== null
      && danglingRef === WITNESS.danglingPreset
      && !libraryPresets.some((p) => p.id === WITNESS.danglingPreset)
      && unreadableRef === WITNESS.unreadablePreset
      && unreadablePresets.some((u) => u.path.endsWith(`/${WITNESS.unreadablePreset}.json`))
      && (reopenedForm === 'clicked' || reopenedForm === 'already-open'),
      `state=${JSON.stringify(fst)}\n        `
      + `ramp preset in library = ${rampPreset === null ? 'NONE' : rampPreset.id} `
      + `(chosen because its document carries a \`ramp\`, not by id)\n        `
      + `rasterRef(${WITNESS.danglingSection})=${JSON.stringify(danglingRef)} `
      + `present in library=${libraryPresets.some((p) => p.id === WITNESS.danglingPreset)}\n        `
      + `rasterRef(${WITNESS.unreadableSection})=${JSON.stringify(unreadableRef)} `
      + `unreadable=${JSON.stringify(unreadablePresets)}\n        `
      + `scene form=${reopenedForm}`);
    if (rampPreset === null) throw new Error('the fixture project has no ramp preset to narrow');

    // ---- The scene, authored through the form. ---------------------------
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, WITNESS.sceneId));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    const witnessSelected = await c.evalExpr('window.__dbg.aeon.selectedScene()');
    check('10b', 'ANTI-VACUOUS: the witness scene was authored through the real form and the '
      + 'panel is editing it',
      witnessSelected === WITNESS.sceneId,
      `selectedScene()=${witnessSelected}; scenes=`
      + `${JSON.stringify((await c.json('window.__dbg.aeon.scenes()')).map((s) => s.id))}`);

    // The two `<select>`s this section drives, found by their own titles.
    const SCENE_REF_SELECT = String.raw`
      [...document.querySelectorAll('select')]
        .find(e => (e.title||'').startsWith('Which effects scene this section uses (sceneRef)'))`;
    const RASTER_REF_SELECT = String.raw`
      [...document.querySelectorAll('select')]
        .find(e => (e.title||'').startsWith('Which raster band preset this section uses (rasterRef)'))`;
    const V_DEFORM_SELECT = String.raw`
      [...document.querySelectorAll('select')].find(e => (e.title||'').startsWith('v_deform'))`;
    // `setActiveSection` is the store action the section picker's own click
    // calls — the SAME setter, not a back door round a control. Both ref rows
    // draw whichever section is active, so this is how a harness reaches
    // section N's row at all.
    const focusSection = async (index) => {
      await c.evalExpr(`window.__dbg.aeon.setActiveSection(${index})`);
      await sleep(700);
    };
    /**
     * OPEN A COLLAPSED SECTION THE WAY AN AUTHOR DOES — one click on its header.
     *
     * ⚠ IDEMPOTENT, BY PROBING THE CONTROL AND NOT BY REMEMBERING. The header is
     * a TOGGLE and the collapse state is PERSISTED in localStorage, so a blind
     * click is an open on the first run of the day and a CLOSE on the second.
     * The first run of row 10c found `rasterRef select=no-element`: the Colour
     * tab's "Raster band presets" section is `defaultCollapsed`, and a
     * CollapsibleSection renders no children while it is shut.
     */
    const openCollapsible = async (title, controlExpr) => {
      const has = async () => c.evalExpr(`!!(${controlExpr})`);
      if (await has()) return 'already-open';
      const clicked = await c.evalExpr(String.raw`
        (() => {
          // CASE-INSENSITIVELY, because PanelHeader renders its title through
          // text-transform: uppercase and Chrome's innerText reports the
          // TRANSFORMED text. A case-sensitive startsWith found no header at
          // all and the run reported the row's own control as missing.
          const want = ${JSON.stringify(title)}.toUpperCase();
          const hdr = [...document.querySelectorAll('div')]
            .filter((d) => d.style && d.style.cursor === 'pointer'
                        && (d.innerText || '').trim().toUpperCase().startsWith(want))[0];
          if (!hdr) return 'no-header';
          hdr.click();
          return 'clicked';
        })()`);
      await sleep(900);
      return (await has()) ? `opened (${clicked})` : `STILL ABSENT (${clicked})`;
    };
    const subTab = async (id) => {
      const hit = await c.evalExpr(String.raw`
        (() => {
          const b = document.querySelector('[data-effects-sub-tab=${JSON.stringify(id)}]');
          if (!b) return 'no-tab';
          b.click();
          return 'clicked';
        })()`);
      await sleep(900);
      return hit;
    };

    // ---- 10c. THE NARROWING CASE, ON SCREEN. ------------------------------
    await focusSection(WITNESS.narrowSection);
    const colourTab = await subTab('colour');
    const presetsSection = await openCollapsible('Raster band presets', RASTER_REF_SELECT);
    const boundRamp = await c.evalExpr(SET_INPUT(RASTER_REF_SELECT, rampPreset.id));
    await sleep(700);
    await subTab('parallax');
    await c.evalExpr(OPEN_SCENE_FORM);
    await sleep(700);
    const boundScene = await c.evalExpr(SET_INPUT(SCENE_REF_SELECT, WITNESS.sceneId));
    await sleep(700);
    const narrowBindings = {
      section: await c.evalExpr('window.__dbg.aeon.activeSection()'),
      rasterRef: await c.evalExpr(`window.__dbg.aeon.rasterRef(${WITNESS.narrowSection})`),
      sceneRef: await c.evalExpr(`window.__dbg.aeon.sceneRef(${WITNESS.narrowSection})`),
    };
    // BEFORE the toggle: the row must not already be painting, or the assertion
    // after it would be describing something that was there all along.
    const impactBefore = await c.json(V_DEFORM_IMPACT);
    await c.evalExpr(SET_INPUT(V_DEFORM_SELECT, 'on'));
    await sleep(900);
    const impactNarrow = await c.json(V_DEFORM_IMPACT);
    await shot(c, '6-vdeform-narrows-a-ramp');
    // EVERY EXPECTED FRAGMENT IS DERIVED: the lead and the pixel width out of
    // ramp-scroll-mode.ts, the section index out of `activeSection()`, the
    // preset id off the preset whose document carries a `ramp`.
    const narrowNames = `Section ${narrowBindings.section} binds this scene and `
      + `preset "${rampPreset.id}"`;
    const narrowWidth = `single ${COLUMN_WIDTH_PX}-pixel column instead of the full width`;
    check('10c', 'THE NARROWING SENTENCE IS ON SCREEN: with a ramp preset and this scene bound '
      + 'to one section, turning V deform on PAINTS the consequence — naming the section, the '
      + 'preset, and the single 16-pixel column — and it was not there before the toggle',
      impactBefore.found === false
      && impactIsOnScreen(impactNarrow)
      && impactNarrow.text.startsWith(V_DEFORM_LEAD.narrowed)
      && impactNarrow.text.includes(narrowNames)
      && impactNarrow.text.includes(narrowWidth)
      && !impactNarrow.text.includes(V_DEFORM_LEAD.unknown),
      `gestures: colour tab=${colourTab} presets section=${presetsSection} `
      + `rasterRef select=${boundRamp} sceneRef select=${boundScene}\n        `
      + `model after the gestures: ${JSON.stringify(narrowBindings)}\n        `
      + `BEFORE the v_deform toggle → ${describeImpact(impactBefore)}\n        `
      + `AFTER  the v_deform toggle → ${describeImpact(impactNarrow)}\n        `
      + `derived expectations: startsWith ${JSON.stringify(V_DEFORM_LEAD.narrowed)}; `
      + `includes ${JSON.stringify(narrowNames)}; includes ${JSON.stringify(narrowWidth)}`);

    // ---- 10d. THE DECLINE CASE, ON SCREEN. --------------------------------
    //
    // THE ROW THIS PARCEL IS FOR. Unbind the section that CAN be answered, bind
    // the two that cannot, and read what the same element says. A confident
    // sentence here — "nothing was narrowed", or a narrowing claim about a
    // document Aurora never read — is the defect; the sentence must name WHICH
    // failure each section hit and claim NEITHER answer.
    await c.evalExpr(SET_INPUT(SCENE_REF_SELECT, ''));
    await sleep(700);
    for (const index of [WITNESS.danglingSection, WITNESS.unreadableSection]) {
      await focusSection(index);
      await c.evalExpr(OPEN_SCENE_FORM);
      await sleep(500);
      await c.evalExpr(SET_INPUT(SCENE_REF_SELECT, WITNESS.sceneId));
      await sleep(700);
    }
    const declineBindings = {
      narrowSectionSceneRef: await c.evalExpr(
        `window.__dbg.aeon.sceneRef(${WITNESS.narrowSection})`),
      danglingSceneRef: await c.evalExpr(
        `window.__dbg.aeon.sceneRef(${WITNESS.danglingSection})`),
      unreadableSceneRef: await c.evalExpr(
        `window.__dbg.aeon.sceneRef(${WITNESS.unreadableSection})`),
    };
    const impactDecline = await c.json(V_DEFORM_IMPACT);
    await shot(c, '7-vdeform-declines');
    const danglingClause = UNKNOWN_WHY_TEMPLATES.dangling(WITNESS.danglingSection, danglingRef);
    const unreadableClause = UNKNOWN_WHY_TEMPLATES.unreadable(
      WITNESS.unreadableSection, unreadableRef);
    check('10d', 'THE DECLINE IS ON SCREEN AND CLAIMS NEITHER ANSWER: with the only resolvable '
      + 'binding removed, the same element says WHICH failure each section hit — one id with no '
      + 'document, one document that will not parse — and that the answer is not decidable, '
      + 'with no narrowing claim anywhere in it',
      impactIsOnScreen(impactDecline)
      && impactDecline.text.startsWith(V_DEFORM_LEAD.unknown)
      && impactDecline.text.includes(danglingClause)
      && impactDecline.text.includes(unreadableClause)
      && impactDecline.text.includes(NOT_DECIDABLE)
      && !impactDecline.text.includes(V_DEFORM_LEAD.narrowed),
      `model after the gestures: ${JSON.stringify(declineBindings)}\n        `
      + `${describeImpact(impactDecline)}\n        `
      + `derived expectations: startsWith ${JSON.stringify(V_DEFORM_LEAD.unknown)}; `
      + `includes ${JSON.stringify(danglingClause)}; includes ${JSON.stringify(unreadableClause)}; `
      + `includes ${JSON.stringify(NOT_DECIDABLE)}; does NOT include `
      + `${JSON.stringify(V_DEFORM_LEAD.narrowed)}`);

    // ---- 10e. THE INSTRUMENT SAW ITS SUBJECT. -----------------------------
    //
    // The two rows above are substring claims, and a substring claim is green
    // over a window it never opened. This one asserts the OPPOSITE property in
    // one place: the element is a real box inside a real scroller, its two
    // readings DIFFER, and neither is empty — so a run in which the panel never
    // mounted, or mounted and stood still, cannot report 10c and 10d as passing.
    check('10e', 'ANTI-VACUOUS: the element the two rows judged is one painted box inside the '
      + 'panel scroller, and it said TWO DIFFERENT THINGS across the two states',
      impactIsOnScreen(impactNarrow) && impactIsOnScreen(impactDecline)
      && impactNarrow.text !== impactDecline.text
      && impactNarrow.titleLength === impactDecline.titleLength
      && panelIsDrawn(await c.evalExpr(PANEL_TEXT)),
      `narrow  ${(impactNarrow.text ?? '').length} chars, rect ${JSON.stringify(impactNarrow.rect)}\n        `
      + `decline ${(impactDecline.text ?? '').length} chars, rect ${JSON.stringify(impactDecline.rect)}\n        `
      + `same hover on both arms (${impactNarrow.titleLength ?? 'n/a'} chars) — the note is the mechanism, `
      + 'which does not change with the arm; the PAINTED half does');
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    // AWAITED, not dropped. `killTree` captures the process tree BEFORE it
    // signals and reaps the Xvfb display it started; dropping the promise (or
    // signalling the group by hand, which is what stood here) leaves the
    // reaping half unrun. It never matches a pattern — only this child's own
    // descendants — so a parallel lane's Electron is untouched.
    try { await killTree(child); } catch { /* already gone */ }
    if (fixture !== null) {
      try { rmSync(fixture.dir, { recursive: true, force: true }); }
      catch (e) { console.log(`        ⚠ fixture not removed: ${fixture.dir} (${e.message})`); }
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
