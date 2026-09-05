#!/usr/bin/env node
// DOES THE DRIFT ROW EXIST, CONVERT, AND REFUSE — ON SCREEN? (EW-DRIFT-CTL.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// `test/formats/effects-drift.test.ts` proves the conversion round-trips and
// that `driftPxPerFrameRefusal` refuses zero, rounds-to-zero and out-of-range.
// It cannot prove any of this:
//
//        AN AUTHOR SWITCHES A LAYER'S `Drift` ROW TO px/frame, TYPES `2`, AND
//        THE DOCUMENT HOLDS `{"rate": 512}` — TYPES `0`, AND THE DOCUMENT DOES
//        NOT CHANGE WHILE A SENTENCE NAMING THE WIRE VALUE IS PAINTED UNDER
//        THAT BOX.
//
// and it cannot on principle, twice over:
//
//   1. THE ×256 IS A SEAM. The suite calls `driftFromPxPerFrame` directly. That
//      the PANEL calls it — rather than writing the typed number straight into
//      `drift.rate`, which is a legal-looking document that builds 256x too
//      slow — is a property of the wiring, and only the running app has it.
//      (docs/superpowers/.../seam-has-no-author: a test per component and none
//      across the seam is how a chain of sound links holds nothing.)
//   2. THE REFUSAL IS A WIRING FACT. `refuse` on `NumberField` is what withholds
//      the commit; `min`/`max` on an `<input type="number">` look identical in
//      source and stop no typed value. A source-level assertion about validation
//      is the shape of the bug (EFFECTS-W1 defect 5).
//
// So every row below types with REAL KEY EVENTS through CDP and reads the MODEL
// back (`window.__dbg.aeon.scenesJson()`), never the widget.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE KEYSTROKES NEVER LANDED, so "the document did not change" is true
//     because nothing happened. Every refusal row requires the BOX to SHOW the
//     typed text in the same read as the model check, and row [6a] types a
//     LEGAL value through the same path and requires the model to MOVE — the
//     anti-vacuous floor for the whole file.
//
//   • THE ROW WAS ALREADY DRIFTING. Row [2a] reads the scene out of the model
//     BEFORE anything is touched and requires layer 0 to carry NO drift; aeon's
//     shipped `ojz_act1_depth.json` carries none, and the row prints it.
//
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. ⚠ MEASURED IN THIS REPO
//     TODAY: `checkVisibility()` → true and `getClientRects().length` → 1 on an
//     element sitting 2,635px OUTSIDE its scroller. So every paint row compares
//     the leaf's RECT AGAINST THE SCROLLER'S OWN BOX and requires a strict
//     `elementFromPoint`; the trio is printed as evidence and is never the gate.
//
//   • A DIFFERENT CONTROL WAS DRIVEN. The select and the box are found by their
//     `title`s, which are built from `LAYER_DRIFT_ROW` — not "the Nth number
//     input in the column", which would silently move as sections expand.
//
//   • THE ×256 WENT THE WRONG WAY, OR TWICE. Row [4a] asserts the exact wire
//     integer, computed HERE from the typed px value and the factor read out of
//     the VENDORED SCHEMA in this process — never imported from the module under
//     test, which would agree with itself no matter what it did.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER — and nothing here
// claims a layer visibly drifts on screen: that needs the built ROM and is the
// foreground lane's to take.
//
// CLEANUP IS BY PID — `spawnGuarded` + `killTree`, awaited.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:effects-drift
//
//   ⚠ FRESH COPY PER RUN. This harness AUTHORS a drift into a scene and never
//   saves, so nothing reaches disk — but row [2a]'s "layer 0 does not drift"
//   floor describes aeon's shipped file, and a copy another harness has saved
//   into is not that fixture. The floor prints what it read, so contamination is
//   visible rather than silent.
//
//   PLANT=no-refuse  … read the value back off the WIDGET instead of the model,
//                      the vacuous shape this file is built to fail.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9461);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 96);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-drift`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';
const SCENE_ID = process.env.SCENE_ID ?? 'ojz_act1_depth';

// ---------------------------------------------------------------------------
// THE FACTOR, RE-DERIVED IN THIS PROCESS FROM THE VENDORED CONTRACT
// ---------------------------------------------------------------------------
//
// NOT imported from `scene-ui.ts`. The property under test is "the app applies
// the contract's factor exactly once"; asking the module under test what the
// factor is would make every arithmetic row below agree with the app by
// construction. This reads the schema's own worked sentence, the same one the
// module derives from, out of the JSON file — an independent reader.
const SCHEMA = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
const DRIFT_NODE = SCHEMA.$defs.layer.properties.drift;
const UNITS_PER_PX = (() => {
  const m = /\b1 px\/frame = (\d+)\b/.exec(String(DRIFT_NODE.description));
  if (!m) throw new Error('the vendored schema no longer states "1 px/frame = <n>"');
  return Number(m[1]);
})();
const RATE = DRIFT_NODE.oneOf.find((b) => b.properties?.rate).properties.rate;
const MAX_PX = RATE.maximum / UNITS_PER_PX;

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

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
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
      .map((d) => (d.textContent || '').trim().slice(0, 48));
    return 'no-header: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

/**
 * The drift `<select>` for one layer, found by the row's own title — the string
 * `LAYER_DRIFT_ROW` builds and the panel is forbidden to retype.
 *
 * ⚠ NOT "the Nth select": the card also carries fa, fb, curve, vsplit and
 * deform pickers, and which one is Nth depends on what is expanded.
 */
const DRIFT_SELECT = (layer) => String.raw`
(() => [...document.querySelectorAll('select')]
  .find((s) => (s.title || '').startsWith('Layer ' + ${layer} + ' drift.rate: ')) || null)()`;

/** The px/frame box for one layer, by the same rule. */
const DRIFT_BOX = (layer) => String.raw`
(() => [...document.querySelectorAll('input[type="number"]')]
  .find((i) => (i.title || '').startsWith('Layer ' + ${layer} + ' drift.rate in PIXELS PER FRAME')) || null)()`;

/**
 * The leaf carrying `needle`, MEASURED AGAINST ITS SCROLLER.
 *
 * `insideScroller` and `hitInside` are the gate. `visible` and `rects` are
 * recorded because they are the two that do NOT discriminate — both go green on
 * an element scrolled thousands of pixels out of its own scroller, measured in
 * this repo (scratchpad/effects-strip-delta-probe.mjs).
 */
const PAINTED_LEAF = (needle, afterSelector) => String.raw`
(() => {
  const anchor = ${afterSelector};
  const leaves = [...document.querySelectorAll('div')]
    .filter((d) => (d.innerText || '').includes(${JSON.stringify(needle)})
                && ![...d.children].some((k) => (k.innerText || '').includes(${JSON.stringify(needle)})));
  const leaf = leaves[0] || null;
  if (!leaf) return { leaf: false, candidates: leaves.length };
  leaf.scrollIntoView({ block: 'center' });
  let sc = leaf.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const b = leaf.getBoundingClientRect();
  const cb = sc ? sc.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    leaf: true, text: (leaf.innerText || '').trim(),
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
    scroller: cb ? { top: Math.round(cb.top), bottom: Math.round(cb.bottom) } : null,
    insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
    hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
    afterControl: anchor ? (anchor.compareDocumentPosition(leaf) & 4) === 4 : null,
    // Recorded, NEVER the gate — both were true on the 2,635px-out defect.
    visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
    rects: leaf.getClientRects().length,
  };
})()`;

async function main() {
  const t0 = Date.now();
  console.log('=== effects-drift harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log(`    contract    : 1 px/frame = ${UNITS_PER_PX} wire units; `
    + `rate ${RATE.minimum}..${RATE.maximum} (±${MAX_PX} px/frame), `
    + `${JSON.stringify(RATE.not)} refused — READ FROM THE VENDORED SCHEMA IN THIS PROCESS`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
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
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', true);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // Blur first: clicking an ALREADY-focused input fires no `focus`, so the
    // select-on-focus never runs and the next keystrokes APPEND. A person leaves
    // the box between edits; the harness has to as well.
    const clickAt = async (selector) => {
      await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0');
      const p = await c.json(String.raw`(() => {
        const el = ${selector};
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
      })()`);
      if (!p) return false;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent',
          { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      return p;
    };
    const typeText = async (s) => {
      for (const ch of s) {
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    };
    const layer0 = async () => {
      const scenes = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
      return (scenes.find((s) => s.id === SCENE_ID) || { layers: [] }).layers[0] ?? null;
    };
    /** What the box SHOWS — the widget, used only as the "keys landed" witness. */
    const boxText = async () => c.json(String.raw`(() => {
      const el = ${DRIFT_BOX(0)};
      return el ? { shown: el.value } : { shown: null };
    })()`);

    // ---- 1. THE SUBJECT: the act, the Effects tab, the scene, its layers. --
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open', !!(st && st.open), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);

    const scenes = await c.json('window.__dbg.aeon.scenes()');
    check('1b', `aeon's own ${SCENE_ID}.json is loaded — a real scene to author into`,
      scenes.some((s) => s.id === SCENE_ID),
      `${scenes.length} scene(s): ${JSON.stringify(scenes)}`);
    if (!scenes.some((s) => s.id === SCENE_ID)) {
      throw new Error(`${SCENE_ID} absent — every row below would be vacuous`);
    }
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);

    check('1c', 'the Effects facet mounts',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1400);

    const opened = await c.evalExpr(OPEN_SECTION(String.raw`/^Layers \(/`, DRIFT_SELECT(0)));
    await sleep(900);

    // ---- 2. THE ROW EXISTS, AND LAYER 0 DOES NOT DRIFT YET. ---------------
    const before = await layer0();
    check('2a', `ANTI-VACUOUS: layer 0 of ${SCENE_ID} carries NO drift before anything is touched`,
      before !== null && (before.drift === undefined || before.drift === 'none'),
      `layer 0 = ${JSON.stringify(before)}`);

    const sel = await c.json(String.raw`(() => {
      const el = ${DRIFT_SELECT(0)};
      if (!el) return { found: false,
        titles: [...document.querySelectorAll('select')].map((s) => (s.title || '').slice(0, 40)) };
      el.scrollIntoView({ block: 'center' });
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      const b = el.getBoundingClientRect();
      const cb = sc ? sc.getBoundingClientRect() : null;
      const hit = document.elementFromPoint(
        Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return {
        found: true, value: el.value,
        options: [...el.options].map((o) => o.value + '=' + o.text),
        title: (el.title || '').slice(0, 120),
        insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
        hitIsSelect: hit === el,
        visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
        rects: el.getClientRects().length,
      };
    })()`);
    check('2b', 'the DRIFT ROW is on the layer card, painted inside its scroller, hit-testable',
      sel.found === true && sel.insideScroller === true && sel.hitIsSelect === true
      && sel.value === 'none' && sel.options.length === 2,
      JSON.stringify(sel) + (sel.found ? '' : ` (Layers section → ${opened})`));
    if (sel.found !== true) throw new Error('the drift select was not found — nothing below can run');

    check('2c', 'no px/frame box while the row says none — the number appears only when it applies',
      (await c.json(`!!${DRIFT_BOX(0)}`)) === false);

    // ---- 3. TURNING IT ON SEEDS A LEGAL, NON-ZERO RATE. -------------------
    //
    // Seeding 0 would be the shape aeon's build refuses (indistinguishable from
    // no drift at all in ROM), so a control that seeded it would land every new
    // drift in the refused state. The seed is checked against the CONTRACT read
    // in this process, not against the module's own constant.
    await c.evalExpr(String.raw`(() => {
      const el = ${DRIFT_SELECT(0)};
      el.value = 'rate';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(700);
    const seeded = await layer0();
    const seedRate = seeded?.drift?.rate;
    check('3a', 'switching the row to px/frame writes a LEGAL, NON-ZERO rate into the document',
      Number.isInteger(seedRate) && seedRate !== RATE.not.const
      && seedRate >= RATE.minimum && seedRate <= RATE.maximum,
      `layer 0 drift = ${JSON.stringify(seeded?.drift)} — `
      + `${seedRate / UNITS_PER_PX} px/frame; contract refuses ${RATE.not.const}`);

    const shownSeed = await boxText();
    check('3b', 'and the box SHOWS px/frame, not the wire value — the 256x hazard, on screen',
      Number(shownSeed.shown) === seedRate / UNITS_PER_PX
      && Number(shownSeed.shown) !== seedRate,
      `box shows ${JSON.stringify(shownSeed.shown)}; document holds ${seedRate}`);

    // ---- 4. THE ×256, ON THE REAL WRITE PATH. ----------------------------
    await clickAt(DRIFT_BOX(0));
    await sleep(250);
    await typeText('2');
    await sleep(700);
    const typed2 = PLANT === 'no-refuse'
      ? { drift: { rate: Number((await boxText()).shown) } }
      : await layer0();
    check('4a', 'typing `2` px/frame writes exactly 2 x the contract factor — the multiply, ONCE',
      typed2?.drift?.rate === 2 * UNITS_PER_PX,
      `box → document: 2 px/frame → ${JSON.stringify(typed2?.drift)}; `
      + `expected {"rate":${2 * UNITS_PER_PX}} (2 x ${UNITS_PER_PX}). `
      + `A MISSING multiply lands 2; a DOUBLED one lands ${2 * UNITS_PER_PX * UNITS_PER_PX}`);

    // The round trip the suite proves in memory, closed HERE against the real
    // widget: the number the app shows is the number that was typed.
    const shown2 = await boxText();
    check('4b', 'and the box reads back what was typed — the round trip, through the real control',
      shown2.shown === '2',
      `typed 2 → document ${typed2?.drift?.rate} → box shows ${JSON.stringify(shown2.shown)}`);

    // ---- 5. THE REFUSALS. -------------------------------------------------
    //
    // aeon FORWARDS Rate(0) and Rate(9000) as shape-legal and leaves them to a
    // build-time `ensure`, so this box is the only place an author learns the
    // bound before a red build.
    const held4 = typed2?.drift?.rate;

    await clickAt(DRIFT_BOX(0));
    await sleep(250);
    await typeText('0');
    await sleep(700);
    const afterZero = await layer0();
    const zeroBox = await boxText();
    check('5a', 'typing `0` is REFUSED — the document keeps the rate it had',
      zeroBox.shown === '0' && afterZero?.drift?.rate === held4,
      `box shows ${JSON.stringify(zeroBox.shown)} (the keys LANDED); `
      + `document still ${JSON.stringify(afterZero?.drift)}`);

    const zeroWhy = await c.json(PAINTED_LEAF('indistinguishable from no drift', DRIFT_BOX(0)));
    check('5b', 'and a PAINTED sentence under the box gives the REASON, and names the escape',
      zeroWhy.leaf === true && zeroWhy.insideScroller === true && zeroWhy.hitInside === true
      && zeroWhy.afterControl === true
      && zeroWhy.text.includes('"none"'),
      JSON.stringify(zeroWhy));

    // Rounds-to-zero — the case a naive `!== 0` guard lets straight through, and
    // the one that would build red with Aurora's name on it.
    await clickAt(DRIFT_BOX(0));
    await sleep(250);
    await typeText('0.001');
    await sleep(700);
    const afterTiny = await layer0();
    const tinyBox = await boxText();
    check('5c', 'a value that ROUNDS to zero on the wire is refused too, not silently flattened',
      tinyBox.shown === '0.001' && afterTiny?.drift?.rate === held4,
      `box shows ${JSON.stringify(tinyBox.shown)}; document still `
      + `${JSON.stringify(afterTiny?.drift)} — 0.001 x ${UNITS_PER_PX} rounds to 0`);

    // AND THIS IS THE ONE MOMENT THE ×256 IS VISIBLE TO AN AUTHOR. The sentence
    // that comes back is about `0` while the box holds `0.001`, so without the
    // wire gloss it reads as a non sequitur — and the conversion, invisible by
    // construction everywhere else, is never shown anywhere at all.
    const tinyWhy = await c.json(PAINTED_LEAF('in wire units', DRIFT_BOX(0)));
    check('5c2', 'and THAT sentence shows the conversion — the only place the multiply is visible',
      tinyWhy.leaf === true && tinyWhy.insideScroller === true && tinyWhy.hitInside === true
      && tinyWhy.text.startsWith('0.001 px/frame is 0 in wire units')
      && tinyWhy.text.includes(`1 px/frame = ${UNITS_PER_PX}`),
      JSON.stringify(tinyWhy));

    // Out of range — the taste bound Aurora holds because a scene it wrote
    // outside the contract would be a build failure with Aurora's name on it.
    const over = String(MAX_PX + 4);
    await clickAt(DRIFT_BOX(0));
    await sleep(250);
    await typeText(over);
    await sleep(700);
    const afterOver = await layer0();
    const overBox = await boxText();
    check('5d', `typing ${over} px/frame (past the contract's ±${MAX_PX}) is refused`,
      overBox.shown === over && Math.abs(afterOver?.drift?.rate ?? 0) <= RATE.maximum
      && afterOver?.drift?.rate !== Number(over) * UNITS_PER_PX,
      `box shows ${JSON.stringify(overBox.shown)}; document holds `
      + `${JSON.stringify(afterOver?.drift)} — never ${Number(over) * UNITS_PER_PX}`);

    const overWhy = await c.json(PAINTED_LEAF('TASTE bound', DRIFT_BOX(0)));
    check('5e', 'and that sentence names the contract\'s own bound and calls it a taste bound',
      overWhy.leaf === true && overWhy.insideScroller === true && overWhy.hitInside === true
      && overWhy.text.includes(String(RATE.maximum)),
      JSON.stringify(overWhy));

    // ---- 6. THE FLOOR, AND THE WAY BACK TO "none". -----------------------
    //
    // Without [6a] every refusal row above is satisfied by a box that accepts
    // nothing at all.
    await clickAt(DRIFT_BOX(0));
    await sleep(250);
    await typeText('6');
    await sleep(700);
    const legal = await layer0();
    check('6a', 'ANTI-VACUOUS FLOOR: a LEGAL value typed the same way DOES reach the document',
      legal?.drift?.rate === 6 * UNITS_PER_PX,
      `typed 6 px/frame (the corpus maximum) → ${JSON.stringify(legal?.drift)}; `
      + `was ${held4}. This also measures SELECT-ON-FOCUS: without it the digit `
      + 'would have been appended to whatever the box held');

    const cleared = await c.json(PAINTED_LEAF('indistinguishable from no drift', DRIFT_BOX(0)));
    check('6b', 'and the refusal CLEARS once a legal value commits',
      cleared.leaf === false, JSON.stringify(cleared));

    // "none" is the legal way to say a strip does not drift, and it is what the
    // row's own none state writes — the key CLEARED, not a zero.
    await c.evalExpr(String.raw`(() => {
      const el = ${DRIFT_SELECT(0)};
      el.value = 'none';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(700);
    const off = await layer0();
    check('6c', 'switching back to none CLEARS the key — never a zero the build would refuse',
      off !== null && (off.drift === undefined || off.drift === 'none'),
      `layer 0 = ${JSON.stringify(off)}`);
    check('6d', 'and the px/frame box goes away with it',
      (await c.json(`!!${DRIFT_BOX(0)}`)) === false);

    // A shot with the row ON and a refusal painted — what the owner has not seen.
    await c.evalExpr(String.raw`(() => {
      const el = ${DRIFT_SELECT(0)};
      el.value = 'rate';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(600);
    await clickAt(DRIFT_BOX(0));
    await sleep(250);
    await typeText('0');
    await sleep(800);
    // ⚠ THE BOX TO THE TOP OF ITS SCROLLER, not to the centre. The LAYERS list
    // is a ~129px scrolling window (measured, [5e]), and a refusal paragraph is
    // taller than half of it: centring the box puts the sentence below the fold
    // and the shot shows a control with no reason beside it. This is also the
    // finding worth reporting — the control and its refusal cannot both be fully
    // visible in that window, which is the PANEL LAYOUT's to fix, not this row's.
    const framed = await c.json(String.raw`(() => {
      const el = ${DRIFT_BOX(0)};
      if (!el) return null;
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      if (!sc) return { scrolled: false };
      const b = el.getBoundingClientRect(), cb = sc.getBoundingClientRect();
      sc.scrollTop += (b.top - cb.top) - 8;
      return { scrolled: true, scrollTop: Math.round(sc.scrollTop),
               scrollerHeight: Math.round(sc.clientHeight) };
    })()`);
    await sleep(400);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/effects-drift.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/effects-drift.png  (${JSON.stringify(framed)})`);
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
  console.log('NOT MEASURED HERE: that a layer visibly drifts on a screen. That needs the '
    + 'built ROM in an emulator and is the foreground lane\'s to take.');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
