#!/usr/bin/env node
// CURVE AND VSPLIT ARE REACHABLE — proven by driving the real app, ROADMAP row 61.
//
// ============================================================================
// WHY THIS EXISTS, AND WHY IT IS NOT A SECOND ORIGINATED FIXTURE
// ============================================================================
//
// Row 61 was BOOKED asking for a second writer-originated fixture — a
// `deform`-free session driving `curve`/`vsplit`, because row 60 widened
// `writer_session_ojz` to carry `deform` and `v_deform`, and aeon refuses
// `curve` beside a strip's `deform` (scene_dsl layer() guards) and `vsplit`
// beside a scene's `v_deform` (`:1288`/`:1293` family). The two remaining
// wave-1-authorable layer fields are therefore MUTUALLY EXCLUSIVE with the
// file that would have covered them.
//
// The row was RULED into this shape instead. A second originated fixture
// carries a second provenance record, a second pinned blob hash and a standing
// obligation to re-run a whole CDP session every time the contract moves — a
// bill that came due twice on 2026-08-27 alone. What row 61 actually needs to
// establish is narrow, and `canopy_dusk.json` (writer-CERTIFIED) already covers
// both fields for SHAPE. The uncovered claim is only this:
//
//        AN AUTHOR CAN REACH `curve` AND `vsplit` THROUGH THE UI.
//
// A harness can carry that without a recurring bill. This is that harness.
//
// WHY THE CLAIM IS WORTH PROVING AT ALL. ROADMAP row 57 found
// `openBgTileDocument` with ZERO callers anywhere outside its own definition
// and tests: fully unit-covered, and no user could ever invoke it. COVERAGE OF
// A FUNCTION SAYS NOTHING ABOUT WHETHER ANYTHING CALLS IT. That is the defect
// class ruled out here, and only a running app can rule it out.
//
// ============================================================================
// WHAT EACH FIELD MUST SHOW — the four points, and the row that carries each
// ============================================================================
//
//   1. the control EXISTS and is ENABLED on a scene where the field is legal
//        -> rows 3a (curve) and 4a (vsplit).  ⚠ SEE THE DISCLOSURE AT §D:
//           the "enabled" half of these rows is NON-DISCRIMINATING today.
//   2. a real gesture on it changes the DOCUMENT, not just the screen
//        -> rows 3c, 4c, 4e — every one reads `window.__dbg.aeon.scenesJson()`
//           back out of the model. Nothing here trusts that a click landed.
//   3. the changed value SURVIVES A SAVE and appears in the emitted file
//        -> rows 6b (curve) and 6c (vsplit), on the bytes off disk.
//   4. the value the document holds is THE ONE THE GESTURE ASKED FOR, not a
//        default that happens to look right
//        -> the `mustNotBeDefault` column below, asserted per row.
//
// ============================================================================
// §A. THE VALUE RULES, AND WHY NO DEFAULT CAN PRODUCE THEM
// ============================================================================
//
// This harness family has been caught TWICE authoring nothing while reporting
// green, both times because the app's own default is itself a legal value:
//
//   * row 59/60 found FIVE end-anchored selectors (`/^v_offset$/`) matched
//     against titles that had grown explanatory suffixes. SET_INPUT returned
//     'no-element', the field kept its default, and every row stayed green.
//   * `world_y`'s rule prescribed `i * 32` and `addLayerCommand` pushes
//     `last.world_y + 32` — so that row was NON-DISCRIMINATING and always had
//     been. Fixing it changed no bytes.
//
// So EVERY value row below asserts a value THE DEFAULT CANNOT PRODUCE, and the
// default is named beside it:
//
//   field         | the app's default              | this run asserts       | why the default cannot produce it
//   --------------|--------------------------------|------------------------|----------------------------------
//   layer.curve   | ABSENT (schema default "none"; | {to: <named factor>}   | the default is the ABSENCE OF THE
//                 | newEffectsLayer writes only    |                        | KEY. No factor name is reachable
//                 | world_y/fa/fb)                 |                        | without the picker moving.
//   layer.vsplit  | ABSENT (schema default "none") | {at: <VSPLIT_AT>}      | two independent escapes: the key is
//   (toggle)      | toggle ON seeds at = world_y   |                        | absent by default, AND the toggle's
//   (spinner)     | (vsplitFromToggle)             |                        | own seed is world_y, which is read
//                 |                                |                        | out of the document between the two
//                 |                                |                        | gestures and asserted DIFFERENT.
//
// THE CURVE RULE (C): the option at index floor(len/2) of the picker's own
// option list. Derived from the control, not typed. Three runtime assertions
// make it SAFE rather than lucky (row 3b):
//   * it is not `__none__`  — the none sentinel is the default,
//   * it is not `__packed__` — the custom escape hatch, which seeds a triple
//     the app chooses rather than a value this rule asked for,
//   * it is not equal to this layer's `fb` — aeon's layer() guard 4 refuses a
//     ramp whose two ends are equal, and `newEffectsLayer` seeds fb=FACTOR_1,
//     so a rule that landed there would author a scene the build rejects.
//
// THE VSPLIT RULE (V): the toggle takes the LAST of the two options its own
// select offers (`at`); the row spinner then takes
//   min + floor((max - min + 1) / 3)
// read off the control's OWN advertised bounds (0..511 -> 170).
//
// ⚠ THE ONE-THIRD IS NOT DECORATION. `15` is a no-op sentinel across this
// schema family (shift_a/shift_b 15 = "this plane takes none of it";
// EFFECTS_V_FACTOR_LOCK = 15 = locked), and a rule that reaches for "a large
// value" BY SATURATING lands on the sentinel and authors nothing while looking
// like it authored something. So no rule here saturates: not `max`, not `min`,
// not `max - N`. One third of the span is interior to the range by
// construction, and rows 4d/4f assert it is neither bound and not the seed.
//
// ============================================================================
// §B. HOW THE GESTURES ARE DELIVERED — two paths, on purpose
// ============================================================================
//
// PATH 1 (layers 0 and 1): the native value setter plus bubbling input/change,
// dispatched at the real DOM element FOUND BY ITS RENDERED TITLE. This is what
// a keystroke looks like to React and is the established gesture form of this
// repo's harness family (`writer-originated-scene-harness.mjs`). It proves the
// control is wired: React's onChange runs, the command runs, the model moves.
//
// PATH 2 (layer 2): REAL BROWSER INPUT. `Input.dispatchKeyEvent` through
// Chromium's own input pipeline — TYPEAHEAD on a focused `<select>` (typing the
// option's displayed text, which is how a keyboard user picks from a closed
// list), and typed digits into the row spinner. Nothing in path 2 goes near a
// JS event constructor: no `new Event`, no native value setter, no `.click()`.
// It is here because path 1 could in principle be answered with "you
// synthesised an event"; path 2 cannot. Path 2 is reported as its own rows
// (5a..5d) so that if the OS input path turns out undrivable headless, that is
// a BLOCKED sub-item and not a failed parcel — path 1 still carries the claim.
//
// ⚠ ARROW KEYS ARE NOT PATH 2's GESTURE, AND THE REASON IS MEASURED — see the
// three-point note above `key()`. A `<select>`'s ArrowDown opens a NATIVE popup
// CDP cannot reach; typeahead never opens it.
//
// NO ROW IN THIS HARNESS DERIVES AN EXPECTATION FROM A PIXEL COORDINATE.
// Nothing is aimed at `rect.top + N`. `devicePixelRatio`, the driven controls'
// rects, load average and uptime are printed beside every run anyway, as the
// standing bar requires — so a reader can see the environment even though this
// instrument is not exposed to the fractional-rect trap.
//
// ============================================================================
// §C. THE BLANKET LEDGER
// ============================================================================
//
// Every gesture goes through `drive()`, which records the selector's own
// verdict. ROW 7a asserts NOT ONE returned 'no-element', and that the count is
// exactly what the rules prescribe. No default can satisfy that row, because a
// default is what you get when the answer IS 'no-element'. Every title match
// uses `\b`, never `$`.
//
// ============================================================================
// §D. DISCLOSED NON-DISCRIMINATING ROWS
// ============================================================================
//
// The "and is ENABLED" half of rows 3a/4a CANNOT FAIL TODAY. Read the panel:
// neither the curve `FactorField`'s Select nor the vsplit Select is ever passed
// a `disabled` prop (EffectsScenePanel.tsx — `disabled` appears only on the
// Add/Remove layer buttons, the New chip, and individual engine-refused
// `<option>`s). So `el.disabled === false` is a fact about the component's
// source, not about this run. It is kept because it is the row-61 claim's
// literal wording and because a future parcel that disables these controls
// would then be caught — but it is NOT the catcher.
//
//   THE CATCHERS for "the control actually works" are rows 3c / 4c / 4e (the
//   document moved to the asked value) and row 7a (every selector found its
//   element). Those are the rows the red-first plants were run against.
//
// The "exists" half of 3a/4a IS discriminating: a control that never rendered
// returns null and reddens the row.
//
// ============================================================================
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:  AEON_DIR=<a WRITABLE COPY of an aeon project> \
//         node scratchpad/curve-vsplit-reachable-harness.mjs
//
// ⚠ IT WRITES TO A COPY, NEVER TO AEON. `AEON_DIR` must be a copy; aeon's own
// tree is another session's live working directory.
//
// PLANT KNOBS (red-first evidence; each is a DEFECT deliberately introduced):
//   PLANT=rot-curve-selector    end-anchor BOTH the curve probe's selector and
//                               the gesture's. Caught one row earlier, at 3a.
//   PLANT=rot-curve-gesture     end-anchor ONLY the gesture's selector — the
//                               exact shape of the five real rots: the control
//                               is on screen the whole time and only the
//                               gesture misses. Proves rows 3c and 7a catch it.
//
// The two load-bearing plants are NOT knobs here, because they are defects in
// the APP rather than in the instrument: unwiring the curve picker's `onChange`
// and pointing the vsplit spinner's `onChange` at the wrong field, both in
// `src/renderer/components/effects/EffectsScenePanel.tsx`, each rebuilt, run,
// and reverted. Their quoted failures are in the review packet.
// ============================================================================

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9411);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — this harness saves, and must never write there');
}
const SHOTS = `${ROOT}/scratchpad/shots-curve-vsplit-reachable`;
mkdirSync(SHOTS, { recursive: true });

const PLANT = process.env.PLANT ?? '';
const SCENE_ID = process.env.SCENE_ID ?? 'curve_vsplit_reach';
const SCENE_FILE = `${AEONDIR}/games/sonic4/data/editor/effects/${SCENE_ID}.json`;
const OUT = process.env.OUT ?? `${ROOT}/scratchpad/curve-vsplit-emitted.json`;

// Three layers: 0 carries the curve, 1 carries the split, 2 is driven by REAL
// browser input (§B path 2) and carries both. `addLayerCommand` pushes
// `last.world_y + 32`, so the tops come out 0 / 32 / 64 — which is exactly why
// no rule below is allowed to be `world_y`-shaped.
const LAYERS = 3;
const CURVE_LAYER = 0;
const SPLIT_LAYER = 1;
const KEYBOARD_LAYER = 2;

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
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-curve-vsplit-reachable/${name}.png`);
}

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

// EVERY GESTURE GOES THROUGH HERE — the ledger row 7a reads. See §C.
const driven = [];
async function drive(c, label, expr) {
  const r = await c.evalExpr(expr);
  driven.push({ label, r });
  return r;
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

// `\b`, NEVER `$`. Five selectors in the sibling harness were caught matching
// nothing because the titles they named had grown explanatory suffixes.
const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;
const NUM_BY_TITLE = (re) => `[...document.querySelectorAll('input[type=number]')].find((e) => ${re}.test(e.title || ''))`;

// The selectors under test, in one place so the PLANT knob can rot one of them
// exactly the way the five real rots were rotted.
// The GESTURE's selector, separate from the PROBE's, so a plant can rot the
// one that drives without rotting the one that looks — which is the exact shape
// all five real rots took: the control was on screen the whole time, and only
// the gesture missed it. `rot-curve-gesture` reproduces that; `rot-curve-selector`
// rots both and is caught one row earlier.
const CURVE_DRIVE_SEL = (i) => (PLANT === 'rot-curve-gesture'
  ? `/^Layer ${i} curve\\.to$/`
  : CURVE_SEL(i));
const CURVE_SEL = (i) => (PLANT === 'rot-curve-selector'
  // THE PLANT: end-anchored, as `/^v_offset$/` and `/^Layer i fa$/` were. The
  // rendered title is `Layer 0 curve.to: the Plane B factor at …`, so this
  // matches NOTHING and the picker keeps its default `none` — which is a legal
  // value, which is exactly why the real rots stayed invisible.
  ? `/^Layer ${i} curve\\.to$/`
  : `/^Layer ${i} curve\\.to\\b/`);
const VSPLIT_SEL = (i) => `/^Layer ${i} vsplit\\.at\\b/`;

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

// ---------------------------------------------------------------------------
// PATH 2: real browser input. Nothing below constructs a JS Event.
// ---------------------------------------------------------------------------
async function focusByTitle(c, cssKind, re) {
  const r = await c.evalExpr(String.raw`
    (() => {
      const el = [...document.querySelectorAll(${JSON.stringify(cssKind)})].find((e) => ${re}.test(e.title || ''));
      if (!el) return 'no-element';
      el.focus();
      return document.activeElement === el ? 'ok' : 'not-focused';
    })()`);
  return r;
}
// ⚠ THREE THINGS HERE WERE MEASURED, NOT REASONED, AND THE FIRST TWO RUNS OF
// THIS HARNESS PAID FOR EACH OF THEM. A probe settled all three
// (`scratchpad/_select-key-probe.mjs`, committed beside this file so the finding
// can be re-derived rather than believed; its output is quoted in the review
// packet):
//
//  1. **ArrowDown DOES NOT DRIVE A `<select>` HERE, in either event form.**
//     Nine `keyDown`/`keyUp` ArrowDowns on a focused picker left the field
//     `undefined`; so did `rawKeyDown`; so did a real mouse click on the
//     control followed by ArrowDown + Enter. Chromium's menulist opens a NATIVE
//     popup widget that lives outside the page, and CDP's Input domain cannot
//     reach into it. This is an instrument limit, not a defect in the control.
//  2. **TYPEAHEAD DOES.** Typing the option's own displayed text at a focused,
//     CLOSED select moves the selection and fires change — Chromium's built-in
//     select typeahead, and the way a keyboard user picks from a closed list
//     without ever opening it. The probe moved `transition` from `smooth` to
//     `instant` by typing `inst`. That is path 2's gesture for both pickers.
//  3. **A `keyDown` CARRYING `text` MUST NOT BE FOLLOWED BY A `char` EVENT.**
//     Sending both inserted EVERY DIGIT TWICE — the probe typed `123` into a
//     spinner and read back `112233`. One event per character.
//
// Ctrl+A does not select-all in this number input either (the probe's `123`
// APPENDED to the existing `0`), so the field is cleared with Backspaces.
async function key(c, keyName, code, vk, modifiers = 0, text) {
  const p = {
    type: text === undefined ? 'rawKeyDown' : 'keyDown',
    key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers,
  };
  if (text !== undefined) { p.text = text; p.unmodifiedText = text; }
  await c.send('Input.dispatchKeyEvent', p);
  await c.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers,
  });
  await sleep(100);
}
/** Real typed characters, one event each. `code` is best-effort; `text` is what lands. */
async function typeText(c, s) {
  for (const ch of s) {
    const up = ch.toUpperCase();
    const code = /[0-9]/.test(ch) ? `Digit${ch}` : /[A-Z]/.test(up) ? `Key${up}` : 'Minus';
    await key(c, ch, code, up.charCodeAt(0), 0, ch);
  }
}
const backspace = (c) => key(c, 'Backspace', 'Backspace', 8);

async function main() {
  const t0 = Date.now();
  console.log(`=== curve/vsplit reachability harness ===`);
  console.log(`    uptime      : ${(await import('node:child_process')).execSync('uptime').toString().trim()}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
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

    // ---- 1. Open the COPY, mount the Effects panel, create a FRESH scene. --
    //
    // A FRESH SCENE IS THE LEGAL CASE, and that is the point. `newEffectsScene`
    // writes {schema, id, layers:[one], v_factor: LOCK} and NOTHING ELSE — no
    // `deform_fg`, no `deform_bg`, no `v_deform`, no `left_column_mask`, and the
    // one seeded layer carries no `deform`. So both fields are legal here by
    // construction, and row 2c proves it on the created document rather than
    // asserting it from the source.
    check('1a', 'no scene file with this id exists on disk before the session',
      !existsSync(SCENE_FILE), SCENE_FILE);
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1b', 'the COPIED aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');

    await sleep(2500);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('1c', 'the facet bar offers an Effects pill and it clicks', clicked === true, `click=${clicked}`);
    await sleep(1500);

    const typed = await drive(c, 'G1 new_scene_id', SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    check('1d', 'the new-scene id field accepts a real keystroke', typed === 'ok', `typed=${typed}`);
    const pressedNew = await c.evalExpr(clickByText('/^New$/'));
    check('1e', 'the New button is on screen and clickable', pressedNew === true, `new=${pressedNew}`);
    await sleep(900);

    const sceneOf = (d) => {
      const hit = (d ?? []).find((x) => x && x.id === SCENE_ID);
      if (!hit) throw new Error(`the authored scene ${SCENE_ID} is not in the document`);
      return hit;
    };
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const scenes = await c.json('window.__dbg.aeon.scenes()');
    check('2a', 'clicking New created the scene in the MODEL, not just on screen',
      scenes.some((x) => x.id === SCENE_ID),
      // Anti-vacuous: the project's pre-existing scenes are listed too, so a
      // green here is the NEW scene appearing rather than the model being
      // unreadable or empty.
      `${scenes.length} scenes: ${JSON.stringify(scenes.map((x) => x.id))}`);

    // ---- 2. Grow to three layers. ---------------------------------------
    let adds = 0;
    for (let i = 0; i < LAYERS - 1; i++) {
      const r = await c.evalExpr(clickByText('/Add layer/'));
      if (r !== true) break;
      adds++;
      await sleep(400);
      await c.evalExpr(EXPAND_LAYERS);
      await sleep(250);
    }
    const expanded = await c.evalExpr(EXPAND_LAYERS);
    await sleep(400);
    const layersOnScreen = await c.json(
      `[...document.querySelectorAll('select')].some((e) => /^Layer 0 fa\\b/.test(e.title || ''))`);
    check('2b', 'the Layers section is OPEN, so its cards are on screen to be driven',
      (expanded === 'already-open' || expanded === 'clicked-open') && layersOnScreen === true,
      `expand=${expanded} layer0ControlsRendered=${layersOnScreen} adds=${adds}`);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const N = sceneOf(doc).layers.length;
    if (N !== LAYERS) throw new Error(`wanted ${LAYERS} layers, model has ${N}`);

    // ROW 2c — THE LEGALITY PRECONDITION, MEASURED ON THE DOCUMENT.
    //
    // Row 61's whole premise is that these two fields are mutually exclusive
    // with `deform` / `v_deform`. So the scene this run drives them on must
    // carry NEITHER — otherwise the rows below would be authoring a scene the
    // build rejects and would prove the wrong thing. Read off the created
    // document, not asserted from newEffectsScene's source.
    const S0 = sceneOf(doc);
    check('2c', 'the fresh scene is the LEGAL case for curve and vsplit — no scene '
      + 'deform, no v_deform, no left_column_mask, and no strip carries its own deform',
      S0.deform_fg === undefined && S0.deform_bg === undefined
      && S0.v_deform === undefined && S0.left_column_mask === undefined
      && S0.layers.every((l) => l.deform === undefined)
      // Anti-vacuous: there really are layers to have been checked.
      && S0.layers.length === LAYERS,
      JSON.stringify({ keys: Object.keys(S0), layerDeforms: S0.layers.map((l) => l.deform) }));

    // The environment lines the standing bar requires, taken from the live page.
    const envLive = await c.json(`({
      dpr: window.devicePixelRatio,
      inner: [window.innerWidth, window.innerHeight],
      curveRect: (() => { const e = ${SEL_BY_TITLE(CURVE_SEL(CURVE_LAYER))}; return e ? e.getBoundingClientRect().toJSON() : null; })(),
      vsplitRect: (() => { const e = ${SEL_BY_TITLE(VSPLIT_SEL(SPLIT_LAYER))}; return e ? e.getBoundingClientRect().toJSON() : null; })(),
    })`);
    console.log(`        LIVE ENV  dpr=${envLive.dpr} inner=${JSON.stringify(envLive.inner)}`);
    console.log(`        curve select  rect=${JSON.stringify(envLive.curveRect)}`);
    console.log(`        vsplit select rect=${JSON.stringify(envLive.vsplitRect)}`);
    console.log(`        (no row below derives an expectation from a pixel coordinate — §B)`);

    // ---- 3. CURVE. -------------------------------------------------------
    const curveCtl = await c.json(`(() => {
      const e = ${SEL_BY_TITLE(CURVE_SEL(CURVE_LAYER))};
      if (!e) return { found: false };
      const cs = getComputedStyle(e);
      return {
        found: true, disabled: e.disabled, ariaDisabled: e.getAttribute('aria-disabled'),
        inDisabledFieldset: !!e.closest('fieldset[disabled]'),
        pointerEvents: cs.pointerEvents, visibility: cs.visibility,
        title: e.title, value: e.value,
        options: [...e.options].map((o) => ({ value: o.value, label: o.text, disabled: !!o.disabled })),
      };
    })()`);
    // ROW 3a — POINT 1 for curve. ⚠ SEE §D: the "enabled" half is
    // NON-DISCRIMINATING today (the panel never passes `disabled` to this
    // Select). The EXISTS half and the "it renders a real option list" half are
    // discriminating: a picker derived to undefined renders empty.
    check('3a', 'the curve control EXISTS on the layer card and is ENABLED '
      + '(⚠ the enabled half is non-discriminating — §D; row 3c is the catcher)',
      curveCtl.found === true && curveCtl.disabled === false
      && curveCtl.inDisabledFieldset === false && curveCtl.pointerEvents !== 'none'
      && curveCtl.visibility !== 'hidden'
      && Array.isArray(curveCtl.options) && curveCtl.options.length > 2,
      JSON.stringify({ ...curveCtl, options: `${curveCtl.options?.length} options` })
      + `\n        title = ${JSON.stringify(curveCtl.title)}`);
    if (!curveCtl.found) throw new Error('no curve control — the reachability claim fails here, loudly');

    // RULE C, and the three runtime assertions that make it safe (§A).
    const curveOpts = curveCtl.options.map((o) => o.value);
    const CURVE_PICK = curveOpts[Math.floor(curveOpts.length / 2)];
    const layerFb = sceneOf(doc).layers[CURVE_LAYER].fb;
    check('3b', "rule C's pick is a real factor: not the `none` sentinel (the default), "
      + 'not the custom-packed escape hatch, and NOT this layer\'s own fb (which the engine refuses)',
      CURVE_PICK !== '__none__' && CURVE_PICK !== '__packed__'
      && /^FACTOR_/.test(CURVE_PICK)
      && JSON.stringify(CURVE_PICK) !== JSON.stringify(layerFb)
      // Anti-vacuous: the list really does carry the two sentinels the rule
      // must dodge, so "not a sentinel" is a fact about this pick and not
      // about a list that has none.
      && curveOpts.includes('__none__') && curveOpts.includes('__packed__'),
      `pick=${CURVE_PICK} at index ${Math.floor(curveOpts.length / 2)} of ${curveOpts.length}; `
      + `layer ${CURVE_LAYER} fb=${JSON.stringify(layerFb)}; options=${JSON.stringify(curveOpts)}`);

    const curveDefaultBefore = sceneOf(doc).layers[CURVE_LAYER].curve;
    await drive(c, `C layer ${CURVE_LAYER} curve.to`,
      SET_INPUT(SEL_BY_TITLE(CURVE_DRIVE_SEL(CURVE_LAYER)), CURVE_PICK));
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const curveAfter = sceneOf(doc).layers[CURVE_LAYER].curve;

    // ROW 3c — POINTS 2 AND 4 for curve, AND THE CATCHER for §D.
    //
    // THE ASSERTED VALUE THE DEFAULT CANNOT PRODUCE: the app's default for this
    // field is THE ABSENCE OF THE KEY (`newEffectsLayer` writes world_y/fa/fb
    // and nothing else; the schema default is the string "none"). No default
    // path in the app writes `{to: <a factor name>}` onto a layer. So this row
    // is red both when the gesture misses (the key stays absent) and when a
    // seeder writes something else.
    //
    // ALTERNATIVE GREEN PATHS RULED OUT, and how:
    //   (i)  "something else writes curve"  -> the OTHER layers must still
    //        carry no curve at all. A blanket seeder would light them up too.
    //   (ii) "the key was already there"    -> `curveDefaultBefore` is recorded
    //        immediately before the gesture and asserted undefined.
    //   (iii)"the value is a default that looks right" -> row 3b already proved
    //        the pick is neither sentinel and differs from fb, and this row
    //        compares against the exact string the rule computed.
    check('3c', 'a real gesture on the curve picker put THE ASKED-FOR FACTOR into the '
      + 'DOCUMENT — a value the app has no default path to produce',
      curveDefaultBefore === undefined
      && curveAfter !== undefined
      && curveAfter !== 'none'
      && curveAfter.to === CURVE_PICK
      && sceneOf(doc).layers.every((l, i) => i === CURVE_LAYER || l.curve === undefined),
      `before=${JSON.stringify(curveDefaultBefore)} after=${JSON.stringify(curveAfter)} `
      + `asked=${CURVE_PICK}\n        other layers' curve = `
      + JSON.stringify(sceneOf(doc).layers.map((l) => l.curve)));

    // ---- 4. VSPLIT. ------------------------------------------------------
    const vsCtl = await c.json(`(() => {
      const e = ${SEL_BY_TITLE(VSPLIT_SEL(SPLIT_LAYER))};
      if (!e) return { found: false };
      const cs = getComputedStyle(e);
      return {
        found: true, disabled: e.disabled, inDisabledFieldset: !!e.closest('fieldset[disabled]'),
        pointerEvents: cs.pointerEvents, visibility: cs.visibility,
        title: e.title, value: e.value,
        options: [...e.options].map((o) => ({ value: o.value, label: o.text, disabled: !!o.disabled })),
      };
    })()`);
    // ROW 4a — POINT 1 for vsplit. Same §D disclosure as 3a.
    check('4a', 'the vsplit control EXISTS on the layer card and is ENABLED '
      + '(⚠ the enabled half is non-discriminating — §D; rows 4c/4e are the catchers)',
      vsCtl.found === true && vsCtl.disabled === false
      && vsCtl.inDisabledFieldset === false && vsCtl.pointerEvents !== 'none'
      && vsCtl.visibility !== 'hidden'
      && Array.isArray(vsCtl.options) && vsCtl.options.length === 2
      && vsCtl.options[0].value === 'none' && vsCtl.value === 'none',
      JSON.stringify(vsCtl));
    if (!vsCtl.found) throw new Error('no vsplit control — the reachability claim fails here, loudly');

    // ROW 4b — the spinner is NOT on screen before the toggle. This is what
    // makes rows 4c/4e a two-stage proof rather than one: the row control only
    // exists because the toggle gesture created it.
    const spinnerBefore = await c.json(
      `(() => { const e = ${NUM_BY_TITLE(VSPLIT_SEL(SPLIT_LAYER))}; return e ? { found: true, value: e.value } : { found: false }; })()`);
    check('4b', 'the vsplit ROW spinner is absent before the toggle — so its later '
      + 'presence is something the gesture caused',
      spinnerBefore.found === false, JSON.stringify(spinnerBefore));

    // RULE V, stage 1: the LAST of the two options the select itself offers.
    const VSPLIT_TOGGLE = vsCtl.options[vsCtl.options.length - 1].value;
    const splitBefore = sceneOf(doc).layers[SPLIT_LAYER].vsplit;
    await drive(c, `V layer ${SPLIT_LAYER} vsplit toggle`,
      SET_INPUT(SEL_BY_TITLE(VSPLIT_SEL(SPLIT_LAYER)), VSPLIT_TOGGLE));
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const splitSeeded = sceneOf(doc).layers[SPLIT_LAYER].vsplit;
    // A PLANT MUST REDDEN ROWS, NOT CRASH THE INSTRUMENT. Plant C (the vsplit
    // toggle unwired) left `splitSeeded` undefined and row 4e threw on
    // `.at`, aborting the run before the save rows could be read — which
    // presents as a broken harness rather than as a caught defect.
    const seedAt = (splitSeeded && splitSeeded !== 'none') ? splitSeeded.at : null;
    const splitLayerTop = sceneOf(doc).layers[SPLIT_LAYER].world_y;

    // ROW 4c — POINT 2 for the vsplit TOGGLE.
    //
    // ⚠ THE VALUE HERE *IS* A SEED, ON PURPOSE, AND THAT IS WHY THIS ROW DOES
    // NOT CARRY POINT 4. `vsplitFromToggle` seeds `{at: clampVSplitAt(world_y)}`
    // — so `at === world_y` is what the app chooses, not what an author asked
    // for. What this row proves is the KEY APPEARED where the schema default is
    // its absence, which no default path produces. Point 4 is row 4e's job, and
    // this row's recorded seed is the number 4e is asserted DIFFERENT from.
    check('4c', 'the vsplit toggle put the KEY into the DOCUMENT (the schema default '
      + 'is its absence) — and the value it seeded is the app\'s own, recorded for row 4e',
      splitBefore === undefined
      && splitSeeded !== undefined && splitSeeded !== 'none'
      && typeof splitSeeded.at === 'number'
      && splitSeeded.at === splitLayerTop
      && sceneOf(doc).layers.every((l, i) => i === SPLIT_LAYER || l.vsplit === undefined),
      `before=${JSON.stringify(splitBefore)} seeded=${JSON.stringify(splitSeeded)} `
      + `(layer top = ${splitLayerTop})\n        other layers' vsplit = `
      + JSON.stringify(sceneOf(doc).layers.map((l) => l.vsplit)));

    // RULE V, stage 2: one third of the span the SPINNER itself advertises.
    const vsBounds = await c.json(
      `(() => { const e = ${NUM_BY_TITLE(VSPLIT_SEL(SPLIT_LAYER))};
        return e ? { found: true, min: e.min, max: e.max, disabled: e.disabled } : { found: false }; })()`);
    check('4d', 'the vsplit ROW spinner appeared once the split was on, enabled, and '
      + 'advertising the schema\'s own plane-row bounds',
      vsBounds.found === true && vsBounds.disabled === false
      && Number(vsBounds.min) === 0 && Number(vsBounds.max) > Number(vsBounds.min),
      JSON.stringify(vsBounds));
    const vMin = Number(vsBounds.min), vMax = Number(vsBounds.max);
    const VSPLIT_AT = vMin + Math.floor((vMax - vMin + 1) / 3);
    await drive(c, `V layer ${SPLIT_LAYER} vsplit.at`,
      SET_INPUT(NUM_BY_TITLE(VSPLIT_SEL(SPLIT_LAYER)), VSPLIT_AT));
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const splitTuned = sceneOf(doc).layers[SPLIT_LAYER].vsplit;

    // ROW 4e — POINTS 2 AND 4 for vsplit, AND THE CATCHER for §D.
    //
    // THE ASSERTED VALUE THE DEFAULT CANNOT PRODUCE, three ways over:
    //   * absent by default (`newEffectsLayer` never writes `vsplit`),
    //   * the TOGGLE's own seed is `world_y`, read out of the document at 4c
    //     and asserted different here — this is the exact trap that made the
    //     `world_y = i*32` row non-discriminating for months,
    //   * one third of the span is neither bound, so no clamp, no saturation
    //     and no `15`-family sentinel can land on it.
    //
    // ALTERNATIVE GREEN PATH RULED OUT: "the spinner writes to some other key
    // and this row reads the one the toggle already filled" — the value moved
    // FROM the recorded seed TO the asked number, so reading a stale key would
    // show the seed. The wrong-field plant (see the review packet) reddens it.
    check('4e', 'a real gesture on the vsplit ROW spinner moved the DOCUMENT off the '
      + 'toggle\'s seed and onto THE ASKED-FOR ROW',
      splitTuned !== undefined && splitTuned !== 'none' && seedAt !== null
      && splitTuned.at === VSPLIT_AT
      && splitTuned.at !== seedAt
      && splitTuned.at !== vMin && splitTuned.at !== vMax
      && sceneOf(doc).layers[SPLIT_LAYER].world_y === splitLayerTop,
      `seed=${seedAt} -> now=${JSON.stringify(splitTuned)} asked=${VSPLIT_AT} `
      + `bounds=[${vMin},${vMax}]\n        layer top unchanged at ${sceneOf(doc).layers[SPLIT_LAYER].world_y} `
      + '(a spinner wired to the wrong field would have moved it)');

    // ROW 4f — the same claim, said as a fact about the NUMBER rather than the
    // gesture: the row this run authored is interior to the control's range and
    // is not the layer top. A rule that saturated, or that quietly re-read the
    // seed, cannot satisfy it. (§A's sentinel trap.)
    check('4f', 'the authored split row is INTERIOR to the control\'s range and is not '
      + 'the layer top — nothing here was reached by saturating',
      VSPLIT_AT > vMin && VSPLIT_AT < vMax && VSPLIT_AT !== splitLayerTop
      && VSPLIT_AT !== 15,
      `VSPLIT_AT=${VSPLIT_AT}, bounds=(${vMin},${vMax}) exclusive, layer top=${splitLayerTop}`);

    await shot(c, '1-driven-by-dom-events');

    // ---- 5. PATH 2: REAL BROWSER INPUT on layer 2. -----------------------
    //
    // §B. Nothing below constructs a JS Event. These are Chromium's own key
    // events, delivered to whatever the page has focused. If the OS input path
    // turns out undrivable headless these rows go red on their own and the
    // claim still stands on rows 3c/4c/4e — which is why they are separate.
    // RULE C again, reached by TYPING THE OPTION'S OWN DISPLAYED TEXT. The
    // target is the same option path 1 picked, so row 5d can compare the two
    // paths; the text comes off the DOM (`o.text`), never typed here.
    const CURVE_LABEL = curveCtl.options[Math.floor(curveCtl.options.length / 2)].label;
    const kbCurveFocus = await focusByTitle(c, 'select', CURVE_SEL(KEYBOARD_LAYER));
    driven.push({ label: `K layer ${KEYBOARD_LAYER} focus curve`, r: kbCurveFocus });
    await typeText(c, CURVE_LABEL);
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const kbCurve = sceneOf(doc).layers[KEYBOARD_LAYER].curve;
    check('5a', `REAL keyboard input (typeahead "${CURVE_LABEL}" on the focused picker) `
      + 'reached the curve field in the DOCUMENT, at the same rule-C value',
      kbCurveFocus === 'ok' && kbCurve !== undefined && kbCurve !== 'none'
      && kbCurve.to === CURVE_PICK,
      `focus=${kbCurveFocus} curve=${JSON.stringify(kbCurve)} asked=${CURVE_PICK} `
      + `via typed text ${JSON.stringify(CURVE_LABEL)}`);

    const VSPLIT_LABEL = vsCtl.options[vsCtl.options.length - 1].label;
    const kbSplitFocus = await focusByTitle(c, 'select', VSPLIT_SEL(KEYBOARD_LAYER));
    driven.push({ label: `K layer ${KEYBOARD_LAYER} focus vsplit`, r: kbSplitFocus });
    await typeText(c, VSPLIT_LABEL);
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    // `?? { at: null }` so a path-2 FAILURE reddens its own rows instead of
    // throwing and taking the save rows down with it — §B's whole point is that
    // path 2 must be able to fail on its own.
    const kbSeed = sceneOf(doc).layers[KEYBOARD_LAYER].vsplit ?? { at: null };
    const kbTop = sceneOf(doc).layers[KEYBOARD_LAYER].world_y;
    check('5b', `REAL keyboard input (typeahead "${VSPLIT_LABEL}") turned the split ON in the DOCUMENT`,
      kbSplitFocus === 'ok' && kbSeed.at === kbTop && kbTop !== 0,
      `focus=${kbSplitFocus} vsplit=${JSON.stringify(kbSeed)} (layer top ${kbTop}) `
      + `via typed text ${JSON.stringify(VSPLIT_LABEL)}`);

    // Real typed digits into the row spinner. Rule V's arithmetic again, but
    // two thirds of the span, so this row's number is distinct from row 4e's
    // AND from this layer's own top — a value nothing in the app produces.
    const KB_AT = vMin + Math.floor(2 * (vMax - vMin + 1) / 3);
    const kbNumFocus = await focusByTitle(c, 'input[type=number]', VSPLIT_SEL(KEYBOARD_LAYER));
    driven.push({ label: `K layer ${KEYBOARD_LAYER} focus vsplit.at`, r: kbNumFocus });
    // Ctrl+A does not select-all in this input (measured — see `key()`), so the
    // seed is cleared a character at a time before the new row is typed.
    for (let i = 0; i < 8; i++) await backspace(c);
    await typeText(c, String(KB_AT));
    await key(c, 'Tab', 'Tab', 9);                 // blur, so the field commits
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const kbTuned = sceneOf(doc).layers[KEYBOARD_LAYER].vsplit;
    check('5c', 'REAL typed digits moved the split row in the DOCUMENT to the typed '
      + 'number — off the seed, and off every other layer\'s value',
      kbNumFocus === 'ok' && kbTuned !== undefined && kbTuned !== 'none'
      && kbTuned.at === KB_AT && kbTuned.at !== kbSeed.at
      && kbTuned.at !== VSPLIT_AT && kbTuned.at !== kbTop
      && kbTuned.at > vMin && kbTuned.at < vMax,
      `typed=${KB_AT} seed=${kbSeed.at} now=${JSON.stringify(kbTuned)} `
      + `(row 4e's layer holds ${VSPLIT_AT}, this layer's top is ${kbTop})`);

    // ROW 5d — the two paths agree. Path 1 and path 2 drove the SAME rule-C
    // option through two entirely different input mechanisms and the document
    // holds the same factor on both layers. A wiring that only responded to
    // synthesised events would split these two apart.
    check('5d', 'the DOM-event path and the REAL-INPUT path put the same factor on '
      + 'their respective layers — the control answers both',
      sceneOf(doc).layers[CURVE_LAYER].curve?.to === CURVE_PICK
      && sceneOf(doc).layers[KEYBOARD_LAYER].curve?.to === CURVE_PICK
      && sceneOf(doc).layers[SPLIT_LAYER].curve === undefined,
      JSON.stringify(sceneOf(doc).layers.map((l) => ({ curve: l.curve, vsplit: l.vsplit }))));

    // ---- 6. Assign, SAVE, and read the bytes off disk. -------------------
    const assigned = await drive(c, 'G2 sceneRef', SET_INPUT(SEL_BY_TITLE('/sceneRef/'), SCENE_ID));
    await sleep(600);
    check('6a', "the assignment reached the section's sceneRef in the model",
      assigned === 'ok'
      && (await c.evalExpr(
        `window.__dbg.aeon.sceneRef(window.__dbg.aeon.activeSection())`)) === SCENE_ID,
      `assigned=${assigned}`);

    // ---- 7. THE BLANKET LEDGER (§C) — asserted BEFORE the save, because a
    // rotted selector must redden the run even if the file still writes.
    const expectedDrives = 2   // G1 new_scene_id, G2 sceneRef
      + 1                      // C  curve picker (path 1)
      + 2                      // V  vsplit toggle + row spinner (path 1)
      + 3;                     // K  three focus calls (path 2)
    const missed = driven.filter((d) => d.r !== 'ok');
    check('7a', 'EVERY gesture found its control — no selector returned `no-element` — '
      + 'and the session issued exactly the gestures the rules prescribe',
      missed.length === 0 && driven.length === expectedDrives,
      `${driven.length} gestures issued (rules prescribe ${expectedDrives}), ${missed.length} missed`
      + (missed.length ? `: ${JSON.stringify(missed)}` : '')
      + `\n        ledger: ${JSON.stringify(driven.map((d) => `${d.label}=${d.r}`))}`);

    for (const type of ['keyDown', 'keyUp']) {
      await c.send('Input.dispatchKeyEvent', {
        type, key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2,
      });
    }
    let sawFile = false;
    for (let i = 0; i < 40; i++) {
      if (existsSync(SCENE_FILE)) { sawFile = true; break; }
      await sleep(500);
    }
    const toasts = await c.json('window.__dbg.aeon.toasts()');
    check('6d', "Ctrl+S wrote the scene file through the app's own save path", sawFile,
      `${SCENE_FILE}\n        toasts: ${JSON.stringify(toasts.map((t) => `${t.type}:${t.message}`.slice(0, 90)))}`);
    if (!sawFile) throw new Error('no file written — the save rows cannot be measured');

    const bytes = readFileSync(SCENE_FILE);
    const text = bytes.toString('utf8');
    const parsed = JSON.parse(text);

    // ROW 6b — POINT 3 for curve. Checked on the PARSE and on the RAW TEXT, so
    // a key that survived as a string but not as JSON (or vice versa) could not
    // hide. The negative half is what makes it discriminating: no OTHER layer
    // may carry a curve, so a writer that emitted a schema default onto every
    // layer would redden it rather than pass.
    check('6b', 'the authored CURVE survived the save and is in the emitted FILE, on '
      + 'exactly the strips the gestures named',
      parsed.layers[CURVE_LAYER].curve?.to === CURVE_PICK
      && parsed.layers[KEYBOARD_LAYER].curve?.to === CURVE_PICK
      && parsed.layers[SPLIT_LAYER].curve === undefined
      && new RegExp(`"curve"`).test(text) && text.includes(CURVE_PICK),
      `file layers' curve = ${JSON.stringify(parsed.layers.map((l) => l.curve))}`);

    // ROW 6c — POINT 3 for vsplit, and POINT 4 again on the bytes: the emitted
    // rows are the asked-for numbers, not the seeds, and not the layer tops.
    check('6c', 'the authored VSPLIT survived the save and is in the emitted FILE at '
      + 'the asked-for rows — not the toggle seeds, not the layer tops',
      parsed.layers[SPLIT_LAYER].vsplit?.at === VSPLIT_AT
      && parsed.layers[KEYBOARD_LAYER].vsplit?.at === KB_AT
      && parsed.layers[CURVE_LAYER].vsplit === undefined
      && parsed.layers[SPLIT_LAYER].vsplit.at !== parsed.layers[SPLIT_LAYER].world_y
      && parsed.layers[KEYBOARD_LAYER].vsplit.at !== parsed.layers[KEYBOARD_LAYER].world_y
      && text.includes('"vsplit"'),
      `file layers' vsplit = ${JSON.stringify(parsed.layers.map((l) => l.vsplit))}; `
      + `tops = ${JSON.stringify(parsed.layers.map((l) => l.world_y))}`);

    check('6e', 'the emitted file is the scene this session authored, with every layer',
      parsed.id === SCENE_ID && Array.isArray(parsed.layers) && parsed.layers.length === LAYERS
      && bytes.length > 200,
      `id=${parsed.id} layers=${parsed.layers?.length} bytes=${bytes.length}`);

    // ROW 6f — the file is still the LEGAL case. The whole ruling rests on
    // curve/vsplit being mutually exclusive with deform/v_deform, so a run that
    // somehow authored both would have proved nothing about reachability and a
    // great deal about a bug.
    check('6f', 'the emitted file carries curve and vsplit WITHOUT the deform keys they '
      + 'are mutually exclusive with — the row-61 conflict is not in this file',
      parsed.deform_fg === undefined && parsed.deform_bg === undefined
      && parsed.v_deform === undefined && parsed.left_column_mask === undefined
      && parsed.layers.every((l) => l.deform === undefined),
      `keys=${JSON.stringify(Object.keys(parsed))}`);

    writeFileSync(OUT, bytes);
    console.log(`\n        emitted bytes → ${OUT} (${bytes.length} bytes)`);
    console.log(`        sha256 = ${(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')}`);
    console.log('---- FILE AS EMITTED ----');
    console.log(text);
    console.log('---- END ----');
    await shot(c, '2-after-save');

    // ---- 8. THE OTHER HALF OF POINT 1: the ILLEGAL case is SURFACED. -----
    //
    // Row 61's point 1 says a control may legitimately be disabled or advised
    // against on a scene carrying deform/v_deform — "the engine's rule, not a
    // defect". That is only true if the app SAYS so. This runs AFTER the save,
    // on purpose, so the emitted bytes above stay the clean legal scene: it
    // turns the curve layer's own `deform` on and reads the advisory off the
    // rendered surface. Reported as a row because the claim "the illegal case
    // is legitimate" is worth nothing if the author is never told.
    const deformToggle = await c.evalExpr(SET_INPUT(
      SEL_BY_TITLE(`/^Layer ${CURVE_LAYER} deform\\.own\\b/`), 'on'));
    await sleep(700);
    const advisories = await c.json(`
      [...document.querySelectorAll('div,span,p')]
        .filter((e) => e.children.length === 0)
        .map((e) => (e.textContent || '').trim())
        .filter((t) => /curve and deform/i.test(t))`);
    check('8a', 'turning the SAME strip\'s deform on makes the app SAY the pair is '
      + 'refused — the illegal case is advised against, on screen, not silently allowed',
      deformToggle === 'ok' && advisories.length > 0,
      `toggle=${deformToggle}; advisories on screen: ${JSON.stringify(advisories)}`);
    await shot(c, '3-illegal-pair-advised');
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed   (wall ${((Date.now() - t0) / 1000).toFixed(1)}s, `
    + `loadavg now ${os.loadavg().map((n) => n.toFixed(2)).join(' ')})`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
