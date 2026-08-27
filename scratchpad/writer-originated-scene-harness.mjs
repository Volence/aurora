#!/usr/bin/env node
// WRITER-ORIGINATED EFFECTS SCENE — author one in the running app, save it
// through the app's own Ctrl+S, and take the bytes off disk untouched.
//
// WHY THIS EXISTS (ROADMAP item 31). `test/fixtures/effects/canopy_dusk.json` is
// writer-CERTIFIED: hand-written for shape coverage, then proven byte-identical
// through `serializeEffectsScene(parseEffectsScene(GOLDEN))`. That is a real
// implementation cross-check, but it is not corroboration of the VALUES, because
// a hand-written fixture was derived by reading the same schema the codec reads.
// Two derivations that share a frame are echo. A file that falls out of a real
// authoring session was enumerated over the UI's own option lists — a parameter
// nobody chose while writing the schema — which is what breaks the shared frame.
//
// THEREFORE: nothing in this harness types a JSON key, and nothing hand-edits the
// result. Every value that lands in the document is either
//   • the app's own default (never touched — a create writes minimal keys), or
//   • the option at a computed INDEX into a `<select>`'s own option list, or
//   • a number derived from the layer index by one rule stated once, below.
//
// THE GESTURE RULE, in full (this is the provenance):
//   R1  scene id typed into the real `new_scene_id` field, then "New" clicked.
//   R2  the Name field takes a real keystroke.
//   R3  "Add layer" is clicked until the control REFUSES (it disables itself at
//       the ceiling), so the count is the app's own and not a number chosen
//       here. `LAYERS` can still pin it, and a pinned run prints the pin beside
//       the measured ceiling so it can never be mistaken for a ceiling-driven
//       one — but ROADMAP row 60's run is ceiling-driven and the pin is unset.
//
//       THE PIN'S HISTORY, because it explains the file's shape. The ceiling was
//       8 when this fixture was originated (2026-08-23); ROADMAP row 56 raised
//       it to 16 (empyrean 277bc15, `layers` maxItems 8 -> 16) and nobody re-ran
//       the fixture, so it went stale against its own gesture rule. Row 59
//       PINNED LAYERS=8 rather than fix it, because a ceiling-driven re-run
//       moves ~9 lines at once (eight layer blocks + three N-derived scalars)
//       and would have confounded the one-line-delta corroboration row 59's own
//       re-origination rested on. Row 60 pays that debt, and pays for the lost
//       corroboration a different way: the delta is PREDICTED IN ADVANCE from
//       R4/R5/R6 and compared line by line, and the first eight layers must come
//       back byte-identical to the 8-layer file as a continuity anchor.
//   R4  layer i: world_y = i * 32.
//
//       ⚠ THE SELECTOR FOR THIS ROW WAS ROTTED TOO, and row 60 found it — a
//       FIFTH rot of the same family as row 59's four. The card's top spinner is
//       titled with the app's OWN label for the scene's vertical space
//       (`layerTopBounds().label`), which is `world_y` on an UNLOCKED scene and
//       `Screen line` on a locked one. A new scene seeds `v_factor` at the LOCK
//       SENTINEL, so the label at R4 time is "Screen line" and the old
//       `/^Layer i world_y/` matched NOTHING: SET_INPUT returned 'no-element'
//       and R4 drove nothing at all. It stayed invisible for the worst possible
//       reason — `addLayerCommand` pushes `last.world_y + 32`, so the app's own
//       default for a stack of added layers IS `i * 32`, exactly what R4
//       prescribes. Row 5b ("every layer took its enumerated world_y") is
//       therefore NON-DISCRIMINATING and always was; row 8a is the catcher.
//       The selector now names both labels the app can render.
//   R5  layer i: fa = the option at index i of that select's own option list.
//   R6  layer i: fb = the option at index (len - 1 - i) of the same list.
//       For i = 0 that is the LAST option, which is the custom-packed sentinel —
//       so the packed triple in the emitted file is whatever the app seeds, never
//       something typed here.
//   R7  scene v_factor = N WRAPPED INTO THE CONTROL'S OWN RANGE, typed into the
//       real spinner: `min + (N % (max - min + 1))`. It USED to be "the option
//       at index N of the v_factor select", and that select is gone: ROADMAP
//       item 35 retyped `v_factor` from a $defs/factor to a plain 0..15 shift
//       count, so the control is a bounded number field. N is the same number
//       R8 uses and for the same reason — the app's own ceiling, not a number
//       picked here.
//
//       ⚠ THE WRAP IS ROW 60's, AND IT IS FORCED, not decoration. The rule read
//       plainly "v_factor = N" until 2026-08-27, with an explicit rider that it
//       is deliberately NOT the field's `max`, because `max` is also the
//       new-scene default (`newEffectsScene` seeds `EFFECTS_V_FACTOR_LOCK`) and
//       a fixture carrying it would prove the control moved nothing. Row 56
//       raised the layer ceiling to 16 while this control's range stayed 0..15,
//       so at N=16 the plain rule OVERFLOWS and the app's clamp folds it onto
//       `max` — the one value the rule was written to avoid. The `%` is the same
//       wrap R5 already applies when an index runs past the end of a list
//       (`factorOpts[i % factorOpts.length]`), so the amended rule is the
//       fixture's own existing discipline rather than a new one. Row 6h pins the
//       result away from `max` so the collision cannot come back silently.
//       The affordance itself is checked separately (row 6d).
//   R8  v_center = N, v_offset = -N.
//   R9  transition = the LAST option that select offers. It USED to read
//       "precision and transition"; ROADMAP row 59 retired `precision` — aeon
//       deleted the storage (scene_dsl.emp:422-423) and empyrean 0bd4753 cut the
//       key from the schema — so the control is gone and the gesture is one
//       select, not two. Its ABSENCE is measured instead, on the rendered
//       surface, by row 6f: the node suite cannot see a React tree, so "the
//       dropdown is gone" is a claim only a live app can settle.
//   R10 the section-assignment select is set to the scene's id.
//   R11 Ctrl+S, dispatched as a real key event to the real window.
//
// ⚠ IT WRITES TO A COPY, NEVER TO AEON. `AEON_DIR` here defaults to a copy of the
// aeon tree under this session's scratchpad. aeon's own tree is another session's
// live working directory and is never opened, never saved to, never read for
// anything but that copy.
//
// ANTI-VACUOUS. The effects directory must not exist before the save (row 1b),
// the scene must reach the MODEL and not just the screen (row 3c), the layer
// count must be > 1 (row 4a), and the emitted file must contain that many layers
// (row 7c). A run where the panel never mounted cannot pass any of them.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/writer-originated-scene-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9394);
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
// A WRITABLE COPY of the aeon project. Never aeon's own tree.
const AEONDIR = process.env.AEON_DIR;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
const SHOTS = `${ROOT}/scratchpad/shots-writer-originated`;
mkdirSync(SHOTS, { recursive: true });

// The layer count. Unset = the app's own ceiling (fully derived, the original
// rule). Set = pinned, and the run prints BOTH so a pinned run can never be
// mistaken for a ceiling-driven one. See R3 above for why row 59 pinned it.
const LAYERS_PIN = process.env.LAYERS ? Number(process.env.LAYERS) : null;

const SCENE_ID = process.env.SCENE_ID ?? 'writer_session_ojz';
const SCENE_NAME = process.env.SCENE_NAME ?? 'Oracle Jungle Zone — writer session';
const OUT = process.env.OUT ?? `${ROOT}/scratchpad/writer-originated-emitted.json`;
const SCENE_FILE = `${AEONDIR}/games/sonic4/data/editor/effects/${SCENE_ID}.json`;

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
  console.log(`        shot → scratchpad/shots-writer-originated/${name}.png`);
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

// EVERY GESTURE GOES THROUGH HERE, and the ledger it builds is row 8a.
//
// ⚠ THIS IS THE HIGHEST-VALUE ROW IN THE HARNESS, and it exists because the
// instrument has now been caught FIVE times driving nothing while reporting
// green (row 59 found three end-anchored selectors, row 60 found the layer-top
// spinner's). Every one of them presented identically: `SET_INPUT` returned
// 'no-element', the control kept the app's default, and the default was ITSELF a
// legal value — so a row asserting "this field holds one of the schema's legal
// answers" passed whether the gesture landed or never fired.
//
// A per-value row cannot close that on its own; only a row that watches the
// GESTURE rather than the value can. So: nothing calls `c.evalExpr(SET_INPUT(…))`
// directly any more. `drive()` records the selector's own verdict, and row 8a
// asserts every one of them came back 'ok' — a claim no default can satisfy,
// because a default is what you get when the answer is 'no-element'.
const driven = [];
// How many gestures the deform sequence (R12..R16) issued this run. Counted as
// the sequence runs rather than pinned, because the number depends on which
// `tableRef` FORM each attachment's index rule lands on — `zero` has no
// parameters and `sine` has two — and a pinned total would have to be re-typed
// every time the schema grows a generator. Zero until R12 runs.
let DEFORM_DRIVES = 0;
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

const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;
const NUM_BY_TITLE = (re) => `[...document.querySelectorAll('input[type=number]')].find((e) => ${re}.test(e.title || ''))`;

// ⚠ A WORKAROUND THAT OUTLIVED ITS DEFECT, AND THEN BECAME ONE. Corrected by the
// overseer 2026-08-27 in review of row 60; the three faults below are a SIXTH rot,
// found by reading rather than by running, because running could not see it.
//
// THE ORIGINAL DEFECT, now FIXED: CollapsibleSection wrapped its whole PanelHeader
// — including the `right` action slot — in `<div onClick={toggle}>`, so every
// "Add layer" click also toggled the section it lived in. Seven adds is an odd
// number of toggles, which is why this harness's first run found "Layers (8/8)"
// over an empty panel. **That was fixed at `5041f6e`** ("a header ACTION click
// must not toggle its CollapsibleSection"): `isHeaderAction` now walks from the
// click target to the header and refuses the toggle when an interactive element
// is on the path. Adds no longer toggle anything.
//
// WHAT THAT LEFT BEHIND, and why it is worse than a dead comment:
//
//   1. The `open()` probe was `/^Layer 0 fa$/`, END-anchored. The title is
//      `Layer 0 fa — how far Plane A, …`, so it matched nothing and open() could
//      ONLY EVER RETURN FALSE — the same end-anchoring that caused rot 2, in the
//      one place row 59 did not re-cut.
//   2. So this block CLICKS ON EVERY CALL, and since 5041f6e those clicks are now
//      THE ONLY THING TOGGLING THE SECTION. It is called once per add plus once
//      after, so the section ends open **iff that count happens to be even**.
//      LAYERS=8 gives 7+1 and the ceiling run gives 15+1: both even, both lucky.
//      An odd count would have collapsed the section, unrendered every layer card
//      (`{!collapsed && children}`) and failed most of the run — presenting as a
//      broken feature rather than a broken workaround.
//   3. Row 4b asserted "the Layers section is open" and accepted the return value
//      `'clicked'` as proof. `'clicked'` says a click HAPPENED. The row's claim is
//      about the STATE AFTERWARDS. It could not fail, which is bar 2e exactly.
//
// The lesson is the one this harness keeps teaching in new places: a workaround is
// a claim about the code around it, and nothing re-checks it when that code is
// fixed. The probe is now \b-anchored, the block REPORTS ITS OUTCOME rather than
// its action, and 4b reads the state.
const EXPAND_LAYERS = String.raw`
(() => {
  // ⚠ THE PROBE IS \b-ANCHORED FOR ROT 2's REASON, AND END-ANCHORING IT HERE
  // WAS A LIVE DEFECT UNTIL 2026-08-27. The fa select's title reads
  // "Layer 0 fa — how far Plane A, …" (providers/effects-aeon.ts,
  // PLANE_FACTOR_ROWS.fa.title), so /^Layer 0 fa$/ matched NOTHING and open()
  // could only ever return false. See the block above this constant for what
  // that cost.
  const open = () => [...document.querySelectorAll('select')].some((e) => /^Layer 0 fa\b/.test(e.title || ''));
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer'
      && /^Layers \(/.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) return 'no-header';
  hdr.click();
  // REPORT THE OUTCOME, NOT THE ACTION. Returning 'clicked' told row 4b that a
  // click happened; 4b was asserting the section is OPEN. Those are different
  // claims and the row accepted the wrong one for months.
  return open() ? 'clicked-open' : 'clicked-shut';
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
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

    // ---- 1. Open the COPY. Its editor/effects/ must not exist yet. --------
    check('1b', 'no effects scene file exists on disk before the session', !existsSync(SCENE_FILE),
      SCENE_FILE);
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the copied aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');

    // ---- 2. The Effects facet. -------------------------------------------
    await sleep(2500);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the facet bar offers an Effects pill', clicked === true, `click=${clicked}`);
    await sleep(1500);
    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(Scenes|Layers|Section assignment|Scene —)/.test(t))`);
    check('2b', 'the Effects panel is mounted (its own headings are on screen)',
      headings.some((h) => h === 'Scenes'), JSON.stringify(headings));

    // ---- 3. R1/R2: create the scene, name it. ----------------------------
    const typed = await drive(c, 'R1 new_scene_id', SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    check('3a', 'the new-scene id field accepts a real keystroke', typed === 'ok', `typed=${typed}`);
    const pressedNew = await c.evalExpr(clickByText('/^New$/'));
    check('3b', 'the New button is on screen and clickable', pressedNew === true, `new=${pressedNew}`);
    await sleep(900);
    let scenes = await c.json('window.__dbg.aeon.scenes()');
    // WAS `scenes.length === 1 && scenes[0].id === SCENE_ID`, and that stopped
    // being true for a reason that has nothing to do with this harness: when the
    // fixture was originated (2026-08-23) the aeon project had NO
    // games/sonic4/data/editor/effects/ directory at all, so the scene this
    // session created was the only one and index 0 was safe. The project has
    // since gained real scenes (ojz_act1_start, ojz_act1_depth), so index 0 is
    // now somebody else's scene — which is why every `doc[0]` below became
    // `sceneOf(doc)`. Addressing BY ID is what the rows meant all along.
    check('3c', 'clicking New created the scene in the MODEL, not just on screen',
      scenes.some((x) => x.id === SCENE_ID),
      // Anti-vacuous: the pre-existing scenes are visible too, so a green here
      // is the new scene appearing rather than the model being unreadable.
      `${scenes.length} scenes: ${JSON.stringify(scenes.map((x) => x.id))}`);

    // The Name field is the ONE text input on the surface with neither a title
    // nor a placeholder (the Filter box and new_scene_id both have placeholders).
    const named = await drive(c, 'R2 name', SET_INPUT(
      `[...document.querySelectorAll('input')].find(e => e.type === 'text'
         && !e.getAttribute('placeholder') && !e.title)`,
      SCENE_NAME));
    check('3d0', 'the Name field was found and took a real keystroke', named === 'ok', `named=${named}`);
    await sleep(600);
    // The scene THIS session authored, by id — never by index. See row 3c.
    const sceneOf = (d) => {
      const hit = (d ?? []).find((x) => x && x.id === SCENE_ID);
      if (!hit) throw new Error(`the authored scene ${SCENE_ID} is not in the document`);
      return hit;
    };
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('3d', 'the typed name reached the DOCUMENT', sceneOf(doc).name === SCENE_NAME,
      `name=${JSON.stringify(sceneOf(doc).name)}`);

    // ---- 4. R3: add layers. Until the control refuses, or to LAYERS_PIN. ---
    // The ceiling is MEASURED either way (see `ceiling` below), so a pinned run
    // still reports what the app would have allowed. That is what keeps the pin
    // honest rather than hiding the very staleness it exists to sidestep.
    let adds = 0;
    let refused = false;
    for (let i = 0; i < 32; i++) {
      if (LAYERS_PIN !== null && adds + 1 >= LAYERS_PIN) break;
      const r = await c.evalExpr(clickByText('/Add layer/'));
      if (r !== true) { refused = true; break; }
      adds++;
      await sleep(400);
      // See EXPAND_LAYERS: the add click also toggles the section it lives in.
      await c.evalExpr(EXPAND_LAYERS);
      await sleep(250);
    }
    const expanded = await c.evalExpr(EXPAND_LAYERS);
    await sleep(400);
    // ⚠ THIS ROW USED TO ACCEPT `'clicked'`, WHICH REPORTS AN ACTION AND NOT A
    // STATE — it could not fail. It now takes only the two return values that
    // mean the section is actually open, and cross-checks against the DOM by
    // the same predicate EXPAND_LAYERS uses, so a future rot in that probe
    // reddens the row instead of quietly disarming it.
    const layersOnScreen = await c.json(
      `[...document.querySelectorAll('select')].some((e) => /^Layer 0 fa\\b/.test(e.title || ''))`);
    check('4b', 'the Layers section is open, so its cards are on screen to be driven',
      (expanded === 'already-open' || expanded === 'clicked-open') && layersOnScreen === true,
      `expand=${expanded} layer0ControlsRendered=${layersOnScreen}`);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const N = sceneOf(doc).layers.length;
    // The app's OWN ceiling, read off the panel rather than inferred from where
    // the clicking stopped — a pinned run never reaches the ceiling, so the two
    // are different numbers and the row must not confuse them.
    const ceiling = await c.json(`(() => {
      const m = /\\((\\d+)\\s*\\/\\s*(\\d+)/.exec(document.body.innerText || '');
      return { layersTitle: m ? { shown: +m[1], max: +m[2] } : null };
    })()`);
    check('4a', LAYERS_PIN === null
      ? "the layer stack grew to the app's own ceiling (not a number typed here)"
      : `the layer stack reached the PINNED count (${LAYERS_PIN}), and the app's own `
        + 'ceiling is reported beside it, not hidden by the pin',
      adds > 0 && N === adds + 1
      && (LAYERS_PIN === null ? refused : N === LAYERS_PIN)
      // Anti-vacuous in both modes: more than one layer, and a pin may never
      // exceed what the app would allow.
      && N > 1
      && (ceiling.layersTitle === null || N <= ceiling.layersTitle.max),
      `${adds} Add-layer clicks → ${N} layers; pin=${LAYERS_PIN ?? 'none (ceiling-driven)'}; `
      + `refused=${refused}; app ceiling reads ${JSON.stringify(ceiling.layersTitle)}`);
    // ROW 4c — the staleness this fixture's R3 note is about, MEASURED. It is a
    // report, not a pass/fail on row 59: if the app's ceiling is above the count
    // this fixture carries, the fixture is stale against its own gesture rule and
    // a ceiling re-origination is owed. Row 59 deliberately does not do it, to
    // keep its own delta interpretable.
    check('4c', 'the app ceiling vs this run\'s layer count is REPORTED, not assumed',
      ceiling.layersTitle !== null,
      ceiling.layersTitle === null
        ? 'could not read the "Layers (n/m)" title — ceiling UNMEASURED'
        : `app ceiling ${ceiling.layersTitle.max}, this run authored ${N}`
          + (ceiling.layersTitle.max > N
            ? ` — STALE by ${ceiling.layersTitle.max - N}: a ceiling re-origination is owed (own ROADMAP row)`
            : ' — at the ceiling'));

    // ---- 5. R4/R5/R6: enumerate the factor selects by INDEX. --------------
    if (process.env.INVENTORY) {
      const inv = await c.json(`({
        selects: [...document.querySelectorAll('select')].map(e => e.title),
        inputs: [...document.querySelectorAll('input')].map(e => e.title + '|' + e.type + '|' + (e.getAttribute('placeholder')||'')),
        headings: [...document.querySelectorAll('span')].map(e => (e.textContent||'').trim()).filter(t => t.length && t.length < 40),
      })`);
      console.log('        INVENTORY', JSON.stringify(inv, null, 1));
    }
    const factorOpts = await c.json(
      `(() => { const s = ${SEL_BY_TITLE('/Layer 0 fa/')}; return s ? [...s.options].map(o => o.value) : null; })()`);
    check('5a', 'the layer factor select has options in it (a derivation that yielded undefined renders empty)',
      Array.isArray(factorOpts) && factorOpts.length > 1,
      `${factorOpts?.length} options: ${JSON.stringify(factorOpts)}`);
    if (!Array.isArray(factorOpts) || factorOpts.length < 2) throw new Error('empty factor select');

    for (let i = 0; i < N; i++) {
      await drive(c, `R4 layer ${i} top`,
        SET_INPUT(NUM_BY_TITLE(`/^Layer ${i} (world_y|Screen line)\\b/`), i * 32));
      await sleep(180);
      // `\\b`, NOT `$`. These read `/^Layer i fa$/` until 2026-08-27 and had
      // SILENTLY STOPPED MATCHING: the factor rows' titles gained an explanatory
      // suffix (`PLANE_FACTOR_ROWS.fa.title` = "fa — how far Plane A, the
      // foreground level plane, scrolls per pixel of camera movement"), so an
      // end-anchored title match found nothing, SET_INPUT returned 'no-element',
      // and every layer kept its default FACTOR_1. The fixture has not been
      // re-originated since 2026-08-23, which is why nobody saw it. Row 5c is
      // what catches this — see its note.
      await drive(c, `R5 layer ${i} fa`,
        SET_INPUT(SEL_BY_TITLE(`/^Layer ${i} fa\\b/`), factorOpts[i % factorOpts.length]));
      await sleep(180);
      await drive(c, `R6 layer ${i} fb`, SET_INPUT(SEL_BY_TITLE(`/^Layer ${i} fb\\b/`),
        factorOpts[(factorOpts.length - 1 - i + factorOpts.length) % factorOpts.length]));
      await sleep(180);
    }
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5b', 'every layer took its enumerated world_y',
      sceneOf(doc).layers.every((l, i) => l.world_y === i * 32),
      JSON.stringify(sceneOf(doc).layers.map((l) => l.world_y)));
    // ROW 5c EARNED ITS KEEP ON 2026-08-27. It is the only row that can tell
    // "the session drove the factor selects" from "the session left every layer
    // at the app's default", because FACTOR_1 is BOTH a legal enumerated answer
    // and the default. Layer 0's fb is the one cell where the enumeration lands
    // on the packed sentinel — a value no default ever produces — so a run that
    // silently drove nothing cannot fake it. It went red here, which is how the
    // rotted `$`-anchored selectors above were found.
    check('5c', 'layer 0 fb is a PACKED triple, seeded by the app, not typed here',
      typeof sceneOf(doc).layers[0].fb === 'object' && sceneOf(doc).layers[0].fb !== null,
      JSON.stringify(sceneOf(doc).layers[0].fb));
    // ROW 5d — ROADMAP row 60, and it is a REPORT of the thing that rotted.
    //
    // The card's top spinner is titled with the app's OWN label for the scene's
    // vertical space, and that label CHANGES with `v_factor` (`world_y` unlocked,
    // `Screen line` locked). R4's selector named only one of the two, and a new
    // scene starts in the other. This prints the title the app actually rendered,
    // so the next re-originator sees the moving part instead of rediscovering it.
    // The pass/fail is only "there IS one per layer"; row 8a is what says the
    // gesture reached it.
    const topTitles = await c.json(
      `[...document.querySelectorAll('input[type=number]')].map(e => e.title)
         .filter(t => /^Layer \\d+ /.test(t) && /\\(\\d+\\.\\.\\d+\\)/.test(t)
                      && !/ (vsplit|shift_|phase|amplitude|period)/.test(t))`);
    check('5d', 'every layer card has a top spinner, under whatever label the app '
      + 'gives the scene\'s vertical space',
      topTitles.length === N,
      `${topTitles.length} tops for ${N} layers; layer 0 reads ${JSON.stringify(topTitles[0])}`);

    // ---- 6. R7/R8/R9: scene-level fields. --------------------------------
    // ITEM 35, ON THE RENDERED SURFACE. `v_factor` is a shift count, so its
    // control must be a bounded number input and must NOT be the factor picker.
    // Read the affordance off the DOM before driving it: what the running app
    // offers is the parameter this whole item turned on, and the node suite
    // cannot see it.
    const vfCtl = await c.json(`(() => {
      const sel = [...document.querySelectorAll('select')]
        .find(e => /v_factor/.test(e.title || ''));
      const inp = [...document.querySelectorAll('input')]
        .find(e => /^v_factor/.test(e.title || ''));
      return {
        isSelect: !!sel,
        selOptions: sel ? [...sel.options].map(o => o.value) : null,
        isNumber: !!inp && inp.type === 'number',
        min: inp ? inp.min : null,
        max: inp ? inp.max : null,
      };
    })()`);
    check('6d', 'v_factor is a bounded NUMBER control, and offers no FACTOR_* name',
      vfCtl.isNumber && !vfCtl.isSelect
      && Number(vfCtl.min) === 0 && Number(vfCtl.max) > Number(vfCtl.min),
      JSON.stringify(vfCtl));
    check('6e', 'the v_factor control the session drives is NOT the layer factor picker',
      !(vfCtl.selOptions || []).some((o) => /^FACTOR_/.test(o)),
      `select options at v_factor: ${JSON.stringify(vfCtl.selOptions)}`);
    // R7's WRAP, computed off the control's OWN advertised bounds — see the R7
    // note at the top for why the plain `= N` rule could not survive row 56.
    const vfMin = Number(vfCtl.min);
    const vfMax = Number(vfCtl.max);
    const V_FACTOR = vfMin + (N % (vfMax - vfMin + 1));
    await drive(c, 'R7 v_factor', SET_INPUT(NUM_BY_TITLE('/^v_factor/'), V_FACTOR));
    await sleep(300);
    await drive(c, 'R8 v_center', SET_INPUT(NUM_BY_TITLE('/^v_center/'), N));
    await sleep(300);
    // `/^v_offset$/` until 2026-08-27, same silent no-match as the factor rows
    // above: the title is "v_offset — signed pixel offset added after the shift,
    // …". Row 6b is what caught it, by reading the DOCUMENT rather than trusting
    // the gesture — the key was simply absent from the authored scene.
    await drive(c, 'R8 v_offset', SET_INPUT(NUM_BY_TITLE('/^v_offset\\b/'), -N));
    await sleep(300);
    // ROW 6f — ROADMAP row 59, ON THE RENDERED SURFACE.
    //
    // THE BAR THIS ROW EXISTS FOR: ~5,000 node tests pass while a feature is
    // visibly broken, because vitest cannot see React or a mounted panel. The
    // node suite can prove `SCENE_FORM_CHOICES` has no `precision` key and that
    // the panel SOURCE has no literal; only a running app can prove there is no
    // `Precision` dropdown on screen.
    //
    // MEASURED THREE WAYS, because each alone has an alternative green path:
    //   (a) no <select> whose title mentions precision — but a control rendered
    //       with a changed title would slip past that, so
    //   (b) no visible LABEL reading "Precision" anywhere in the panel, and
    //   (c) the Scene section is genuinely MOUNTED and populated, so (a) and (b)
    //       are not passing because the panel failed to render at all. (c) is
    //       the one that makes the other two mean anything: an unmounted panel
    //       trivially contains no Precision control.
    const precGone = await c.json(`(() => {
      const titled = [...document.querySelectorAll('select')]
        .filter(e => /precision/i.test(e.title || ''));
      const labels = [...document.querySelectorAll('label, span, div')]
        .filter(e => e.children.length === 0
          && (e.textContent || '').trim().toLowerCase() === 'precision');
      const transition = [...document.querySelectorAll('select')]
        .filter(e => /^transition$/.test(e.title || ''));
      const vfactor = [...document.querySelectorAll('input')]
        .filter(e => /^v_factor/.test(e.title || ''));
      return {
        precisionSelects: titled.length,
        precisionLabels: labels.length,
        transitionSelects: transition.length,
        vFactorInputs: vfactor.length,
        selectsInPanel: document.querySelectorAll('select').length,
      };
    })()`);
    check('6f', 'the RETIRED Precision control is GONE from the running app '
      + '(and the Scene form around it is really mounted)',
      precGone.precisionSelects === 0
      && precGone.precisionLabels === 0
      // Anti-vacuous: its ROW-MATES are on screen, so the two zeroes above are
      // an absent control, not an absent panel.
      && precGone.transitionSelects === 1
      && precGone.vFactorInputs === 1
      && precGone.selectsInPanel > 1,
      JSON.stringify(precGone));

    const transOpts = await c.json(
      `(() => { const s = ${SEL_BY_TITLE('/^transition$/')}; return s ? [...s.options].map(o => o.value) : null; })()`);
    check('6a', 'the transition select has options in it',
      Array.isArray(transOpts) && transOpts.length > 0,
      `transition=${JSON.stringify(transOpts)}`);
    await drive(c, 'R9 transition',
      SET_INPUT(SEL_BY_TITLE('/^transition$/'), transOpts[transOpts.length - 1]));
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    // ROW 6b LIKEWISE. It reads the model rather than trusting that a gesture
    // landed, so a selector that matches nothing shows up as a missing key.
    check('6b', 'the scene-level enumerated choices reached the DOCUMENT',
      sceneOf(doc).v_factor === V_FACTOR
      && sceneOf(doc).v_center === N && sceneOf(doc).v_offset === -N
      && sceneOf(doc).transition === transOpts[transOpts.length - 1],
      JSON.stringify({ v_center: sceneOf(doc).v_center, v_offset: sceneOf(doc).v_offset,
        transition: sceneOf(doc).transition, v_factor: sceneOf(doc).v_factor }));
    // ROW 6h — ROADMAP row 60. R7's rider, PINNED instead of merely written down.
    //
    // `newEffectsScene` seeds `v_factor` at the LOCK SENTINEL, which is the
    // control's own `max`. So `v_factor === max` in the document is exactly the
    // state "the spinner was never moved", and R7's whole point is to land
    // somewhere else. Row 6b cannot say this: it compares against V_FACTOR,
    // which the same collision would have folded onto `max` too. This row reads
    // the DOCUMENT against the CONTROL'S OWN max — a comparison no arithmetic in
    // this file can satisfy vacuously.
    check('6h', 'the v_factor in the document is NOT the control\'s max '
      + '(= the lock sentinel = the new-scene default), so the spinner really moved',
      sceneOf(doc).v_factor !== vfMax
      // Anti-vacuous: it is still a legal shift count in the control's range.
      && Number.isInteger(sceneOf(doc).v_factor)
      && sceneOf(doc).v_factor >= vfMin && sceneOf(doc).v_factor <= vfMax,
      `v_factor=${sceneOf(doc).v_factor}, control range [${vfMin},${vfMax}], `
      + `N=${N}, rule min + (N % range) = ${V_FACTOR}`);
    // ROW 6g — the retired key must not reach the DOCUMENT by any other route.
    // 6f watches the screen; this watches the model the writer will serialise.
    // A default seeded in `newEffectsScene`, or a stale command replayed from
    // history, would put `precision` back in the file without any control on
    // screen, and 6f alone would stay green through it.
    check('6g', 'no `precision` key reached the authored DOCUMENT',
      !('precision' in sceneOf(doc)),
      `scene keys: ${JSON.stringify(Object.keys(sceneOf(doc)))}`);

    // ---- R12..R16: the DEFORM attachments (ROADMAP row 60). --------------
    //
    // Row 58 shipped controls for `deform_fg`, `deform_bg`, a layer's `deform`,
    // `v_deform` and `left_column_mask` on 2026-08-27, and this fixture could
    // exercise none of them. Row 59 deliberately did not widen the sequence,
    // for the same one-line-delta reason it pinned the layer count; row 60 pays
    // both debts, in two commits so each delta stays interpretable.
    //
    // THE RULES, in the same voice as R4..R9 — every value is an INDEX into a
    // control's own option list, or the layer ceiling N, or a bound the control
    // itself advertises. Nothing below is a number somebody chose:
    //
    //   R12  every deform TOGGLE is set to the LAST option its own select
    //        offers (`shared` / `columns` / `own`) — R9's rule, one control over.
    //   R13  the k-th deform attachment, counted in the order the PANEL renders
    //        them, takes the table form at index k of the table select's own
    //        option list. k = 0 deform_fg, 1 deform_bg, 2 v_deform, 3 the layer
    //        attachment. With four attachments the rule reaches indices 0..3 and
    //        never index 5, the `.bin` branch — which is the one form that would
    //        need a typed path, i.e. a writer's choice. The rule excludes it by
    //        arithmetic rather than by an exception.
    //   R14  every deform INTEGER takes N, the app's layer ceiling — the same
    //        number R7/R8 use — clamped by the control's own advertised bounds.
    //        Two exceptions, and each is FORCED rather than preferred:
    //          • `period` takes the control's own `max` divided by N. `max` IS
    //            the table length (the schema derives both from one sentence),
    //            the build refuses a period that does not divide it, and max/N
    //            is exact because both are powers of two. The plain rule would
    //            author a scene aeon rejects.
    //          • `shift_a` / `shift_b` take `max - N` clamped, R6's complement.
    //            Their schema DEFAULT is `max` (15 = "this plane takes none of
    //            it"), which is exactly what `layerDeformFromToggle` seeds, so
    //            the plain rule would land on the app's own seed and assert
    //            nothing — the row-5c trap, one field over.
    //   R15  `left_column_mask` = the LAST option its select offers. R9's rule
    //        again, and the last option is `accept` — the one value the engine
    //        accepts unconditionally. The rule is checked against the option's
    //        own `disabled` flag (row 8c), because `sprite_mask` is rendered
    //        DISABLED and a rule that landed on it would author a refused scene.
    //   R16  the LAYER attachment goes on the LAST strip, index N-1 — "the
    //        last", the same selector R6 and R9 use. One strip, not all of them,
    //        so the delta stays confined and row 8e can prove the rule is a rule.
    //
    // ⚠ `v_deform` AND `left_column_mask` ARE MUTUALLY GATED BY THE ENGINE
    // (scene_dsl.emp:1288 refuses per-column V-deform with no policy, :1293
    // refuses a declared policy with no V-deform), which is why Aurora's
    // `vDeformToggleCommand` clears both keys in one undo step. R12 and R15 are
    // therefore driven as the PAIR the app treats them as, and row 8d checks the
    // emitted document satisfies the gate in both directions.
    const LAST = (opts) => opts[opts.length - 1].value;
    const optionsOf = async (re) => c.json(
      `(() => { const s = ${SEL_BY_TITLE(re)};
        return s ? [...s.options].map(o => ({ value: o.value, disabled: !!o.disabled })) : null; })()`);
    const boundsOf = async (re) => c.json(
      `(() => { const e = ${NUM_BY_TITLE(re)};
        return e ? { found: true, min: e.min, max: e.max } : { found: false }; })()`);
    // R14, as one function so the rule is written once.
    const deformInt = (key, min, max) => {
      if (key === 'period') return Math.floor(max / N);
      if (key === 'shift_a' || key === 'shift_b') return Math.max(min, max - N);
      if (max === null) return N;
      return Math.min(max, Math.max(min ?? 0, N));
    };
    // Drive one number control by R14, deriving the value from the bounds the
    // control itself advertises. A control that is not on screen still gets its
    // gesture ISSUED, so row 8a sees the 'no-element' rather than the row
    // silently doing nothing — the failure mode this whole parcel is about.
    const driveInt = async (label, re, key) => {
      const b = await boundsOf(re);
      const min = b.found && b.min !== '' ? Number(b.min) : null;
      const max = b.found && b.max !== '' ? Number(b.max) : null;
      const v = b.found ? deformInt(key, min, max) : 0;
      await drive(c, label, SET_INPUT(NUM_BY_TITLE(re), v));
      await sleep(160);
      return v;
    };
    // One attachment's table sub-form: the form at index k, then every parameter
    // row that form renders, each by R14. The parameter list is read from the DOM
    // ONCE, before the loop that drives it, so a loop that skipped an entry would
    // show up as a shortfall in row 8a's count rather than shrinking the target.
    const driveTable = async (prefix, k) => {
      const sel = `/^${prefix} table\\b/`;
      const opts = await optionsOf(sel);
      if (!opts || opts.length <= k) throw new Error(`${prefix}: table select has no index ${k}`);
      await drive(c, `R13 ${prefix} table`, SET_INPUT(SEL_BY_TITLE(sel), opts[k].value));
      await sleep(400);
      // The form's own parameter rows: number inputs the sub-form titled with
      // this attachment's prefix. `speed` is titled the same way and takes the
      // same rule, so it rides along rather than being a second code path.
      const params = await c.json(
        `[...document.querySelectorAll('input[type=number]')]
           .map(e => e.title || '')
           .filter(t => t.startsWith(${JSON.stringify(`${prefix} `)}))
           .map(t => t.slice(${prefix.length + 1}).split(/[ (]/)[0])`);
      const got = {};
      for (const key of params) {
        got[key] = await driveInt(`R14 ${prefix} ${key}`, `/^${prefix} ${key}\\b/`, key);
      }
      return { form: opts[k].value, params: got, formOptions: opts.map((o) => o.value) };
    };

    const attach = {};
    for (const [k, key] of ['deform_fg', 'deform_bg', 'v_deform'].entries()) {
      const toggle = await optionsOf(`/^${key}\\b/`);
      if (!toggle) throw new Error(`${key}: no toggle select on screen`);
      await drive(c, `R12 ${key} on`, SET_INPUT(SEL_BY_TITLE(`/^${key}\\b/`), LAST(toggle)));
      await sleep(500);
      attach[key] = { toggleValue: LAST(toggle), ...(await driveTable(key, k)) };
    }
    // `amp_shift` is the one v_deform field the sub-form does not title with the
    // attachment's prefix (its title starts with the key itself), so it is driven
    // by its own title — same R14 rule, no second rule.
    attach.v_deform.params.amp_shift = await driveInt(
      'R14 v_deform amp_shift', '/^amp_shift\\b/', 'amp_shift');

    // R15 — the policy the gate makes MANDATORY, driven in the same breath.
    const maskOpts = await optionsOf('/^left_column_mask\\b/');
    if (!maskOpts) throw new Error('left_column_mask row is not on screen — the gate is unsatisfiable');
    const maskPick = maskOpts[maskOpts.length - 1];
    await drive(c, 'R15 left_column_mask', SET_INPUT(SEL_BY_TITLE('/^left_column_mask\\b/'), maskPick.value));
    await sleep(400);

    // R16 — the LAST strip takes its own attachment.
    const L = N - 1;
    const layerToggle = await optionsOf(`/^Layer ${L} deform\\.own\\b/`);
    if (!layerToggle) throw new Error(`layer ${L} has no deform toggle on screen`);
    await drive(c, `R12 layer ${L} deform on`,
      SET_INPUT(SEL_BY_TITLE(`/^Layer ${L} deform\\.own\\b/`), LAST(layerToggle)));
    await sleep(500);
    const layerTable = await driveTable(`Layer ${L} deform`, 3);
    const layerOwn = { ...layerTable, params: { ...layerTable.params } };
    for (const key of ['shift_a', 'shift_b', 'phase', 'speed']) {
      layerOwn.params[key] = await driveInt(
        `R14 layer ${L} ${key}`, `/^Layer ${L} ${key}\\b/`, key);
    }
    await sleep(500);

    // The gesture count R12..R16 issued, derived from the FORMS the index rule
    // landed on rather than pinned: `zero` has no parameters and `sine` has two,
    // so a literal here would have to be re-typed every time the schema grows a
    // generator. 3 scene toggles + 3 table selects + their parameter rows, the
    // one amp_shift, the policy, the layer toggle + its table select + its
    // parameter rows + its four own fields.
    DEFORM_DRIVES = 3 + 3
      + Object.values(attach).reduce((n, a) => n + Object.keys(a.params).length, 0)
      + 1 + 1 + 1 + Object.keys(layerTable.params).length + 4;

    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const S = sceneOf(doc);
    // ROW 8b — THE ROW THAT CAN ONLY PASS IF THE GESTURES LANDED.
    //
    // Every toggle SEEDS a legal attachment (`sceneDeformFromToggle` →
    // `{table: sine(amplitude 1, period 256), speed: 0}`), so a row asserting
    // "deform_fg holds a legal sceneDeform" would pass through a run whose
    // parameter gestures all missed — the exact shape of the five rots this
    // harness has now had. So this row asserts the R13/R14 VALUES, and asserts
    // separately that each one is NOT the seed the toggle would have left.
    const fg = S.deform_fg?.shared, bg = S.deform_bg?.shared, vd = S.v_deform?.columns;
    const seedEscape = fg && bg && vd
      && fg.table.amplitude !== 1 && fg.table.period !== 256 && fg.speed !== 0
      && bg.table.amplitude !== 1 && bg.table.period !== 256 && bg.speed !== 0
      && vd.speed !== 0 && vd.amp_shift !== 0;
    check('8b', 'the three scene deform attachments reached the DOCUMENT at the '
      + 'rule\'s values, and not one of them is the seed its toggle would have left',
      fg?.table?.generator === attach.deform_fg.form
      && fg.table.amplitude === attach.deform_fg.params.amplitude
      && fg.table.period === attach.deform_fg.params.period
      && fg.speed === attach.deform_fg.params.speed
      && bg?.table?.generator === attach.deform_bg.form
      && bg.table.amplitude === attach.deform_bg.params.amplitude
      && bg.table.period === attach.deform_bg.params.period
      && bg.speed === attach.deform_bg.params.speed
      && vd?.table?.generator === attach.v_deform.form
      && vd.speed === attach.v_deform.params.speed
      && vd.amp_shift === attach.v_deform.params.amp_shift
      && seedEscape,
      JSON.stringify({ deform_fg: S.deform_fg, deform_bg: S.deform_bg, v_deform: S.v_deform,
        forms: attach.deform_fg.formOptions, seedEscape }));
    // ROW 8c — R15's rule checked against the option's OWN disabled flag. The
    // engine refuses `sprite_mask` outright and the panel renders it DISABLED, so
    // a "last option" rule that landed on it would author a scene the build
    // rejects. This row is what makes the rule safe rather than lucky.
    check('8c', 'the policy the LAST-option rule picked is one the app offers as '
      + 'PICKABLE (not the engine-refused, disabled one)',
      maskPick.disabled === false
      && S.left_column_mask === maskPick.value
      // Anti-vacuous: the select really does render the refused value, so the
      // "not disabled" half is a fact about this option and not about an empty
      // list.
      && maskOpts.some((o) => o.disabled),
      JSON.stringify({ picked: maskPick, offered: maskOpts, inDoc: S.left_column_mask }));
    // ROW 8d — THE MUTUAL GATE, both directions, transcribed from the engine.
    //   :1288  v_deform on  + policy undeclared -> REFUSED
    //   :1293  v_deform off + policy declared   -> REFUSED
    // The panel's `vDeformToggleCommand` clears both keys together for exactly
    // this reason; this row proves the document the session produced would not be
    // refused by either arm, rather than trusting that it wouldn't.
    check('8d', 'the emitted scene satisfies the v_deform / left_column_mask '
      + 'MUTUAL gate in both directions',
      ('v_deform' in S) === ('left_column_mask' in S)
      && S.v_deform?.columns !== undefined
      && S.left_column_mask !== 'undeclared' && S.left_column_mask !== 'sprite_mask',
      JSON.stringify({ v_deform: 'v_deform' in S, left_column_mask: S.left_column_mask }));
    // ROW 8e — R16 is a RULE, not "every layer". The last strip carries the
    // attachment and the one above it carries no `deform` key at all; and the
    // cross-field guard aeon applies to an `own` table (a strip with its own
    // table needs a scene table on some plane, scene_dsl's own ensure) holds.
    const own = S.layers[L].deform?.own;
    check('8e', `the LAST strip (${L}) carries its own deform at the rule's values, `
      + 'the strip above it carries none, and the scene attaches a plane table',
      own !== undefined
      && own.table.generator === layerTable.form
      && own.shift_a === layerOwn.params.shift_a && own.shift_b === layerOwn.params.shift_b
      && own.phase === layerOwn.params.phase && own.speed === layerOwn.params.speed
      // NOT the seed: layerDeformFromToggle seeds shift_a/shift_b at the schema
      // default 15 and phase/speed at 0, which is why R14 complements the shifts.
      && own.shift_a !== 15 && own.shift_b !== 15 && own.phase !== 0 && own.speed !== 0
      && S.layers[L - 1].deform === undefined
      && S.layers[L].curve === undefined
      && (S.deform_fg !== undefined || S.deform_bg !== undefined),
      JSON.stringify({ own, above: S.layers[L - 1].deform, curve: S.layers[L].curve }));

    // ---- R10: assign the scene to the active section. --------------------
    const assigned = await drive(c, 'R10 sceneRef',
      SET_INPUT(SEL_BY_TITLE('/sceneRef/'), SCENE_ID));
    await sleep(600);
    const activeSection = await c.evalExpr('window.__dbg.aeon.activeSection()');
    const ref = await c.evalExpr(`window.__dbg.aeon.sceneRef(${activeSection})`);
    check('6c', "the assignment reached the section's sceneRef in the model",
      assigned === 'ok' && ref === SCENE_ID,
      `section ${activeSection} sceneRef=${JSON.stringify(ref)}`);

    // ---- 8. THE BLANKET GESTURE LEDGER (ROADMAP row 60). -----------------
    //
    // ⚠ READ THE `drive()` NOTE ABOVE BEFORE TOUCHING THIS. Five separate
    // selectors in this harness have now been caught matching NOTHING while the
    // run reported green, because the control they missed kept a default that is
    // itself a legal value. Every value row in this file can be fooled by that;
    // this row cannot, because it does not look at a value at all — it asserts
    // that every selector the session used FOUND ITS ELEMENT.
    //
    // THE COUNT IS ASSERTED TOO, and derived, not pinned: two typed fields
    // (R1, R2), three per layer (R4/R5/R6), three scene spinners (R7, R8 x2),
    // the transition select (R9) and the section assignment (R10), plus the
    // deform gestures the run actually issued. A silently SKIPPED gesture leaves
    // no 'no-element' behind, so a ledger that only checked its entries would
    // miss exactly the failure a `continue` introduces.
    const expectedDrives = 2 + 3 * N + 3 + 1 + 1 + DEFORM_DRIVES;
    const missed = driven.filter((d) => d.r !== 'ok');
    check('8a', 'EVERY gesture found its control — no selector returned `no-element`, '
      + 'and the session issued exactly the gestures the rule prescribes',
      missed.length === 0 && driven.length === expectedDrives,
      `${driven.length} gestures issued (rule prescribes ${expectedDrives}), `
      + `${missed.length} missed`
      + (missed.length ? `: ${JSON.stringify(missed.slice(0, 12))}` : ''));
    await shot(c, '1-authored-scene');

    // ---- 7. R11: SAVE, through the app's own Ctrl+S. ---------------------
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
    check('7a', 'Ctrl+S wrote the scene file through the app\'s own save path', sawFile,
      `${SCENE_FILE}\n        toasts: ${JSON.stringify(toasts.map((t) => `${t.type}:${t.message}`.slice(0, 80)))}`);
    if (!sawFile) throw new Error('no file written — nothing below can be measured');

    const bytes = readFileSync(SCENE_FILE);
    const text = bytes.toString('utf8');
    const parsed = JSON.parse(text);
    check('7b', 'the emitted file is the scene the session authored',
      parsed.id === SCENE_ID && parsed.name === SCENE_NAME, `id=${parsed.id}`);
    check('7c', 'the emitted file carries every layer the session added (not an empty stub)',
      Array.isArray(parsed.layers) && parsed.layers.length === N,
      `${parsed.layers?.length} layers in the file, ${N} in the model`);
    check('7d', 'the emitted file is non-trivial', bytes.length > 200, `${bytes.length} bytes`);
    // ROW 7f — the end of the chain: screen (6f), model (6g), FILE ON DISK.
    // This is the one that matters for the fixture, because the fixture IS these
    // bytes. Checked on the raw text as well as the parse, so a key that
    // survived as a string but not as JSON could not hide.
    check('7f', 'the retired `precision` is absent from the emitted FILE',
      !('precision' in parsed) && !/precision/.test(text),
      `keys=${JSON.stringify(Object.keys(parsed))}`);
    // ITEM 35: the value the engine reads must be a number the engine can read.
    // The old select wrote 'FACTOR_0', which folds to the byte 255.
    // ROW 8f — the end of the deform chain: screen (the gestures), model (8b/8e),
    // FILE ON DISK. The fixture IS these bytes, so a key that reached the model
    // and not the writer would be invisible to every row above.
    //
    // AND THE BUILD'S OWN RULE ON `period`, checked against the number the CONTROL
    // advertises rather than a 256 typed here: sigil refuses a generator whose
    // period does not divide the table length, and the table length is what the
    // period spinner's `max` is. R14's max/N exists precisely to satisfy this, so
    // this row is what says the exception earned its place.
    const periodMax = (await boundsOf('/^deform_fg period\\b/')).max;
    const fileFg = parsed.deform_fg?.shared;
    check('8f', 'every deform key reached the emitted FILE, and its generator '
      + 'periods divide the table length the control itself advertises',
      parsed.deform_fg !== undefined && parsed.deform_bg !== undefined
      && parsed.v_deform !== undefined && parsed.left_column_mask !== undefined
      && parsed.layers[N - 1].deform !== undefined
      && Number(periodMax) > 0
      && Number(periodMax) % fileFg.table.period === 0
      && Number(periodMax) % parsed.deform_bg.shared.table.period === 0,
      JSON.stringify({ keys: Object.keys(parsed), periodMax,
        fg: fileFg?.table, bg: parsed.deform_bg?.shared?.table,
        lastLayer: parsed.layers[N - 1].deform }));
    check('7e', 'the emitted v_factor is an integer in the control\'s own range',
      Number.isInteger(parsed.v_factor)
      && parsed.v_factor >= Number(vfCtl.min) && parsed.v_factor <= Number(vfCtl.max),
      `v_factor=${JSON.stringify(parsed.v_factor)} range=[${vfCtl.min},${vfCtl.max}]`);
    writeFileSync(OUT, bytes);
    console.log(`\n        emitted bytes → ${OUT} (${bytes.length} bytes)`);
    console.log(`        sha256 = ${(await import('node:crypto')).createHash('sha256').update(bytes).digest('hex')}`);
    console.log('---- FILE AS EMITTED ----');
    console.log(text);
    console.log('---- END ----');
    await shot(c, '2-after-save');
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
