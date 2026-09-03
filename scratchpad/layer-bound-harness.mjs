#!/usr/bin/env node
// WHEN A LAYER GUIDE STOPS MOVING, DOES ANYTHING ON SCREEN SAY WHY?
//
// ═══ THE REPORT THIS EXISTS FOR ═══
//
// The owner, twice, on the effects facet:
//
//   *"layers are still bound to the window view — like I can't move that above
//    the orange line"*     L2 y=67   · camera x=0 · v_offset=64
//   *"I can drag the view box below l2 though."*
//                         L2 y=138  · camera x=0 · v_offset=135
//
// Both readings land exactly on `EFFECTS_FIRE_LINE_MIN + v_offset` (3+64=67,
// 3+135=138). He was dragging the guide up until it stopped, so it parked on the
// fire floor each time, and the floor tracked `v_offset` across a 71-line move.
//
// HIS INTERPRETATION WAS THE MOST REASONABLE ONE AVAILABLE. On a locked scene
// the screen frame's top edge IS `v_offset` (`frameAnchorFor`/`commitVOffset`),
// so the floor sits three lines under the box and moves with it — welded, as far
// as anything visible goes. The correlation was perfect; the cause was invisible.
//
// So the defect is NOT that the clamp is wrong. The clamp is exactly the
// engine's `fire()` ensure. The defect is that **the clamp was silent**, and a
// clamp that cannot explain itself is indistinguishable from a bug.
//
// ═══ WHY THIS CANNOT BE A NODE TEST ═══
//
// Every noun in the report is invisible to vitest: a canvas, a mouse drag, a
// pan/zoom transform, a repaint. The node suite passes in the thousands over
// this feature and cannot tell a drawn sentence from an undrawn one, or a wall
// with a label from a wall without. This file drives the REAL app with REAL CDP
// mouse events on the REAL `#map-canvas` and reads back the MODEL, the app's own
// published draw report, and the canvas's PIXELS.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. A BOUND MISTAKEN FOR A WALL. Section 8 repeats the whole owner's case at a
//    SECOND `v_offset` and asserts the floor MOVED with it. ⚠ A row pinned at one
//    `v_offset` cannot tell a fire bound from a fixed wall — which is precisely
//    the confusion that produced this report, so a suite that could not tell them
//    apart either would be re-shipping the bug as its own test.
//
// 2. "EVERYTHING IS STUCK" PASSING AS "THE FIRE BOUND WORKS". Section 6 drags a
//    CONTROL layer — same scene, same gesture, no `vsplit`, so no fire and no
//    narrowed bound — to a row far above the fire floor and asserts it gets
//    there. Without this row, section 5 cannot distinguish a working bound from
//    a frozen canvas.
//
// 3. AN ADVISORY THAT IS ALWAYS ON. Sections 6b and 7 assert SILENCE: a guide
//    dragged nowhere near its bound, and a control layer, say nothing. An
//    advisory that is permanently on screen is read as decoration inside a day.
//
// 4. A SENTENCE THAT IS PUBLISHED BUT NEVER PAINTED. Section 5d samples the map
//    canvas's actual pixels for the refusal colour at the row the app says it
//    drew the held guide on, AND at rows 24px above and below, which must NOT be
//    that colour. A row that only asked "is anything reddish anywhere" would
//    pass on a red background.
//
// 5. THE `v_offset` HOLE (section 9). `setSceneFieldCommand` writes one key and
//    re-checks nothing, so raising `v_offset` lifts the fire floor PAST an
//    already-placed layer and leaves the document holding a top the bake refuses
//    — reached without ever dragging the layer. Section 9 performs exactly that
//    and asserts (a) the layer really is left behind, so the hole is REAL and
//    documented rather than assumed, and (b) the canvas now SAYS so.
//
// 6. A GUIDE THE VIEWPORT REALLY DOES IMPRISON (section 10). Separate mechanism,
//    separate question, asked because the owner's words point at it: can a guide
//    be dragged to a `world_y` that is currently scrolled off the top? There is
//    no window `mousemove` listener and no pointer capture on this gesture, only
//    a window `mouseup`, so this is a genuinely open question about the container
//    hit box rather than about any clamp. Measured, not assumed.
//
// ═══ AIM AT INTEGER CLIENT PIXELS ═══
//
// `devicePixelRatio` is not stable under Xvfb here — observed at 1 and at 1.35
// hours apart on one host. At 1.35 the canvas rect is fractional
// (`top: 73.99304962158203`), CDP delivers the nearest INTEGER clientY, and the
// app correctly resolves a world row one lower. That presents as an off-by-one
// in the feature when the feature is fine, and it cost a full review cycle on
// the very guide-drag gesture this file drives.
//
// So: every coordinate goes through `aimY`, which rounds to the integer client
// pixel CDP will actually deliver, and every expectation is derived from THAT
// integer through the app's own contract (`worldYAt`). No tolerance windows
// anywhere.
//
// ═══ EVERY NUMBER IS DERIVED, NONE IS TYPED ═══
//
// `67` and `138` appear nowhere below as literals. `EFFECTS_FIRE_LINE_MIN` /
// `_MAX` are PARSED OUT OF `src/renderer/providers/effects-aeon.ts` at startup
// (section D prints the parse), `v_offset` is read back off the live document,
// and the floor is computed as `FIRE_MIN + v_offset`. A literal would pass while
// the contract said something else — this repo's most-repeated defect.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed. The run ends by undoing
// the session back to the fixture's own scene list.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     node scratchpad/layer-bound-harness.mjs
//              or:         ./scratchpad/run-layer-bound.sh   (the named runner)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
// SELF-LOCATING, never a pinned path: run from a worktree this must serve THAT
// worktree's dist/, or a "re-verified after merge" run silently re-verifies the
// branch. Same reasoning and the same incident as effects-guides-harness.
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
const SHOTS = `${ROOT}/scratchpad/shots-layer-bound`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'bound_probe';
/** The owner's two readings, as `v_offset` values. Section 8 is the whole
 *  reason there are TWO: one alone cannot tell a bound from a wall. */
const VO_A = 64;
const VO_B = 135;
/** Where the fire layer starts — well inside every bound under test, so the
 *  press itself never triggers a notice. */
const FIRE_START = 200;
/** The control layer's start row. Below the fire layer, on screen at zoom 1. */
const CTRL_START = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// THE CONTRACT, PARSED FROM SOURCE (gate (c): derived, with the derivation shown)
// ---------------------------------------------------------------------------

const PROVIDER_SRC = `${ROOT}/src/renderer/providers/effects-aeon.ts`;
function parseConst(src, name) {
  const m = new RegExp(`export const ${name}\\s*=\\s*(-?\\d+)`).exec(src);
  if (!m) throw new Error(`could not parse ${name} out of ${PROVIDER_SRC} — the harness `
    + 'must not fall back to a literal, so this is fatal rather than defaulted');
  return Number(m[1]);
}
const SRC = readFileSync(PROVIDER_SRC, 'utf8');
const FIRE_MIN = parseConst(SRC, 'EFFECTS_FIRE_LINE_MIN');
const FIRE_MAX = parseConst(SRC, 'EFFECTS_FIRE_LINE_MAX');
/** THE CONTRACT UNDER TEST, in one line: a fire layer's top floor on a locked
 *  scene. `layerTopBounds` computes `max(0, EFFECTS_FIRE_LINE_MIN + v_offset)`. */
const fireFloor = (vo) => Math.max(0, FIRE_MIN + vo);
const fireCeil = (vo) => Math.min(511, FIRE_MAX + vo);

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
  console.log(`        shot → scratchpad/shots-layer-bound/${name}.png`);
}

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

const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  const pr = cv.parentElement.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height,
           parentTop: pr.top, parentLeft: pr.left, parentHeight: pr.height };
})()`;

/** One pixel off the LIVE map canvas — the context the app already drew with,
 *  so this reads the composited result rather than a fresh surface. */
const PIXEL_AT = (x, y) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(Math.round(${x}), Math.round(${y}), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] };
})()`;

const REPAINT_PROBE = String.raw`
(() => {
  if (window.__boundProbe) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
  window.__boundProbe = P;
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
})()`;

/**
 * How RED a pixel is, as a plain channel distance.
 *
 * `EFFECTS_GUIDE_REFUSED` is `rgba(255,96,96,0.95)` composited over whatever the
 * map painted, so the exact triple is unpredictable and a hardcoded one would be
 * a pin. What IS predictable is the SHAPE: red high, green and blue both much
 * lower. The threshold is set above the screen frame's amber
 * (`rgba(255,170,60)` -> 85) on purpose, because the fire floor is always three
 * rows from the frame and the two must not be confused.
 */
function redness(p) {
  if (!p) return -1;
  return p.r - Math.max(p.g, p.b);
}
const RED_MIN = 120;

function sceneOf(doc) { return doc.find((s) => s.id === SCENE_ID) ?? null; }

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const screen = process.env.SCREEN ?? '1680x1050';
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', `-screen 0 ${screen}x24`, ELECTRON, MAIN],
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

    // ---- D. THE DERIVATION, PRINTED. -------------------------------------
    note('CONTRACT PARSED FROM SOURCE (no literals below):',
      `EFFECTS_FIRE_LINE_MIN=${FIRE_MIN} EFFECTS_FIRE_LINE_MAX=${FIRE_MAX} `
      + `from ${PROVIDER_SRC}\n        `
      + `=> floor(v_offset ${VO_A}) = ${FIRE_MIN}+${VO_A} = ${fireFloor(VO_A)}; `
      + `floor(v_offset ${VO_B}) = ${FIRE_MIN}+${VO_B} = ${fireFloor(VO_B)}   `
      + `[the owner observed exactly these two]`);
    check('0z', 'ANTI-VACUOUS: the parsed contract reproduces BOTH of the owner\'s readings',
      fireFloor(VO_A) === 67 && fireFloor(VO_B) === 138,
      `derived ${fireFloor(VO_A)} and ${fireFloor(VO_B)}; he reported 67 and 138. `
      + 'These two comparisons are the ONLY place those numbers appear, and they are a '
      + 'cross-check of the parse against the field report — never a source of truth.');

    // ---- 0. PROVENANCE. ---------------------------------------------------
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.guides === "function"');
    check('0a', 'ANTI-VACUOUS: the build under test has the guide probe at all',
      haveProbe === true, `${RUN.root}/dist`);
    if (!haveProbe) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

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
    check('2a', 'the facet bar offers an Effects pill',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1200);

    // ---- 3. The fixture: one FIRE layer and one CONTROL layer. ------------
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(800);
    // A second layer, so there is a control in the SAME scene under the SAME
    // gesture. A control in another scene would also be testing scene selection.
    //
    // ⚠ BY `aria-label`, NOT BY TEXT. `IconButton` renders its glyph as the
    // child and the label as `title`/`aria-label`, so this button's
    // text-plus-label reads "Add Add layer" and a `/^Add$/` match silently finds
    // NOTHING — which is exactly how the first run of this harness produced a
    // one-layer scene, a control row with no control in it, and a crash.
    const added = await c.evalExpr(String.raw`
      (() => { const b = document.querySelector('button[aria-label="Add layer"]');
               if (!b) return 'no-button'; b.click(); return 'ok'; })()`);
    await sleep(800);
    check('3a0', 'ANTI-VACUOUS: the Add-layer control was found and clicked',
      added === 'ok', `click result = ${JSON.stringify(added)}`);

    const topField = (i) =>
      `[...document.querySelectorAll('input[type=number]')].find(e => new RegExp('^Layer ${i} (world_y|Screen line)').test(e.title||''))`;
    const voField = `[...document.querySelectorAll('input[type=number]')].find(e => /^v_offset — /.test(e.title||''))`;
    const vsplitSel = (i) =>
      `[...document.querySelectorAll('select')].find(e => new RegExp('^Layer ${i} vsplit\\\\.at').test(e.title||''))`;

    // ⚠ EVERY FIELD WRITE IS CHECKED. `SET_INPUT` returns 'no-element' when its
    // selector misses, and the first run of this harness swallowed exactly that
    // and then asserted against a fixture it had never built.
    const setField = async (id, name, selector, value) => {
      const r = await c.evalExpr(SET_INPUT(selector, value));
      check(id, name, r === 'ok', `set result = ${JSON.stringify(r)} (wanted ${value})`);
      await sleep(400);
    };
    await setField('3a1', 'ANTI-VACUOUS: layer 0\'s top field exists and took a value', topField(0), FIRE_START);
    await setField('3a2', 'ANTI-VACUOUS: layer 1\'s top field exists and took a value', topField(1), CTRL_START);
    // LAYER 0 BECOMES A FIRE. `layerEmitsFire` is the VARIANT test — a `vsplit`
    // attachment present, `at: 0` included — so this select is the whole switch.
    await setField('3a3', 'the layer card offers a Plane B split control on layer 0', vsplitSel(0), 'at');
    // ⚠ THE SCENE FORM ARRIVES COLLAPSED SINCE d-26b (2026-09-02,
    // docs/reviews/2026-09-02-effects-sub-tabs.md, §3): `aeon.effects.scene` —
    // the section holding v_center/v_offset — is `defaultCollapsed`, and a
    // collapsed section renders no body, so its spinners are UNMOUNTED rather
    // than hidden. `voField` therefore missed and every row downstream of
    // v_offset (18 of them) was measuring a scene whose v_offset had never been
    // set. The layer cards are in `aeon.effects.layers`, which is still open on
    // arrival, which is why [3a1]/[3a2] passed and only this one did not.
    //
    // IDEMPOTENT, and it reports which door it had to open. The Layers and Scene
    // sections are both on the Parallax sub-tab, which is the default, so no tab
    // switch is needed here — [3a3b] would say so if that ever changed.
    const sceneForm = await c.evalExpr(String.raw`
      (() => {
        const has = () => [...document.querySelectorAll('input')]
          .some((e) => /^v_offset — /.test(e.title || ''));
        if (has()) return 'already-open';
        const hdr = [...document.querySelectorAll('div')]
          .filter((d) => d.style && d.style.cursor === 'pointer'
                      && /^SCENE\s*—/i.test((d.innerText || '').trim()))[0];
        if (!hdr) return 'no-scene-header';
        hdr.click();
        return 'clicked';
      })()`);
    await sleep(900);
    check('3a3b', 'INSTRUMENT: the Scene form is open — it arrives collapsed since d-26b, and '
      + 'a collapsed section is UNMOUNTED, not hidden',
      sceneForm === 'clicked' || sceneForm === 'already-open', `open -> ${sceneForm}`);
    await setField('3a4', 'ANTI-VACUOUS: the scene\'s v_offset field exists and took the owner\'s value',
      voField, VO_A);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(800);

    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    let sc = sceneOf(doc);
    const view = await c.json('window.__dbg.view()');
    check('3b', 'ANTI-VACUOUS: the scene exists, is LOCKED, and holds v_offset',
      !!sc && sc.v_factor === 15 && sc.v_offset === VO_A,
      `id=${sc?.id} v_factor=${sc?.v_factor} v_offset=${sc?.v_offset}`);
    check('3c', '⚠ THE CONTROL EXISTS AND IS REALLY A CONTROL: L0 carries a vsplit, L1 does not',
      !!sc && sc.layers.length === 2
      && sc.layers[0].vsplit !== undefined && sc.layers[1].vsplit === undefined,
      `L0.vsplit=${JSON.stringify(sc?.layers?.[0]?.vsplit)} L1.vsplit=${JSON.stringify(sc?.layers?.[1]?.vsplit)}`
      + ' — without this the section-6 control row proves nothing');
    check('3d', 'ANTI-VACUOUS: both layers parked at known rows, camera pinned',
      sc.layers[0].world_y === FIRE_START && sc.layers[1].world_y === CTRL_START
      && view.x === 0 && view.y === 0 && view.zoom === 1,
      `tops=${JSON.stringify(sc.layers.map((l) => l.world_y))} view=${JSON.stringify(view)}`);

    if (!sc || sc.layers.length !== 2) {
      // LOUD ON UNMEASURABLE. Everything below asks about a two-layer scene; with
      // one layer the rows would crash or, worse, quietly measure the wrong layer.
      throw new Error(`FIXTURE NOT BUILT: expected 2 layers, got ${sc?.layers?.length}. `
        + 'Every row below is unmeasurable and none is reported as green.');
    }

    // ---- 4. Aim, and what the app says it drew. ---------------------------
    let rect = await c.json(CANVAS_RECT);
    /**
     * RE-READ THE BOX BEFORE EVERY SECTION THAT AIMS.
     *
     * ⚠ A RECT CAPTURED ONCE IS A STALE RECT. Run 5 of this harness reported
     * `[10b] reached 149, unconstrained 150` — an off-by-one that looks exactly
     * like the feature being wrong, and was the HARNESS deriving its expectation
     * from a `rect.top` measured many seconds and several panel re-renders
     * earlier, while the app resolved the cursor against the live one. Same
     * family as the dpr trap in the docblock: the app was right both times and
     * the harness was asking about a position that had moved.
     */
    const refreshRect = async (where) => {
      const next = await c.json(CANVAS_RECT);
      if (next.top !== rect.top || next.left !== rect.left
          || next.width !== rect.width || next.height !== rect.height) {
        note(`canvas box MOVED before ${where} — re-aiming off the live rect`,
          `was ${JSON.stringify(rect)}\n        now ${JSON.stringify(next)}`);
        rect = next;
      }
      return rect;
    };
    const dpr = await c.evalExpr('window.devicePixelRatio');
    check('4a', 'ANTI-VACUOUS: the map canvas is mounted and has a real box',
      !!rect && rect.width > 200 && rect.height > 200, JSON.stringify(rect));
    let guides = await c.json('window.__dbg.aeon.guides()');
    check('4b', 'ANTI-VACUOUS: the last repaint DREW guides, this scene, one row per layer',
      guides.active === true && guides.sceneId === SCENE_ID
      && guides.rows.length === 2 && guides.paints > 0,
      JSON.stringify({ active: guides.active, id: guides.sceneId, rows: guides.rows.length, paints: guides.paints }));
    check('4c', 'PROVENANCE: the draw report carries a per-row `notice` (this branch, not master)',
      guides.rows.length > 0 && 'notice' in guides.rows[0],
      `row0 keys = ${JSON.stringify(Object.keys(guides.rows[0] ?? {}))}`);

    const mouse = (type, x, y) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
    });
    const aimXOf = () => Math.round(rect.left + rect.width * 0.5);
    /**
     * X for a PIXEL probe — canvas-local, never the client X the mouse uses.
     *
     * ⚠ THESE TWO SPACES ARE NOT THE SAME AND THE DIFFERENCE HID HERE. `getImageData`
     * indexes the backing store, which `MapViewport` sizes as `canvas.width =
     * rect.width` (1:1 with CSS px, no dpr scaling), so canvas x = client x -
     * rect.left. Passing the client X sampled a column `rect.left` too far right;
     * it happened to keep working ONLY because a guide line spans the full canvas
     * width, so every column hits it. That is a coincidence, not a measurement, and
     * it would have silently mis-sampled the moment anything narrower was probed.
     */
    const probeX = () => Math.round(rect.width * 0.5);
    /** The integer client pixel CDP will actually deliver for a canvas row. */
    const aimY = (canvasY) => Math.round(rect.top + canvasY);
    /** The app's own contract, evaluated on a DELIVERED client pixel. Never a
     *  typed number: this is `canvasYToLayerTop` spelled out (origin 0 in both
     *  spaces), so it fails for any transform error and stops failing only for
     *  the device grid, which is an input rather than behaviour. */
    const worldYAt = (clientY, v) => Math.round(v.y + (clientY - rect.top) / v.zoom);
    /** Canvas row a world Y lands on, same contract, other direction. */
    const canvasYOf = (worldY, v) => (worldY - v.y) * v.zoom;
    check('4d', 'ANTI-VACUOUS: the aim is on the integer device grid, and recorded',
      Number.isInteger(aimY(0)) && Number.isInteger(aimXOf()),
      `dpr=${dpr} rect=${JSON.stringify(rect)}  aimX=${aimXOf()}  `
      + `canvasY 0 -> clientY ${aimY(0)}; the owner's floor ${fireFloor(VO_A)} -> clientY ${aimY(fireFloor(VO_A))}`);

    /** Press on a guide, walk to a target canvas row, and stop WITHOUT releasing
     *  — so the live notice can be read mid-gesture, which is the whole point. */
    const dragTo = async (fromCanvasY, toCanvasY, steps = 8) => {
      await mouse('mouseMoved', aimXOf(), aimY(fromCanvasY));
      await sleep(250);
      await mouse('mousePressed', aimXOf(), aimY(fromCanvasY));
      await sleep(200);
      for (let i = 1; i <= steps; i++) {
        await mouse('mouseMoved', aimXOf(), aimY(fromCanvasY + ((toCanvasY - fromCanvasY) * i) / steps));
        await sleep(70);
      }
      await sleep(350);
    };
    const release = async (canvasY) => { await mouse('mouseReleased', aimXOf(), aimY(canvasY)); await sleep(500); };

    // =====================================================================
    // 5. THE OWNER'S CASE, at his first v_offset.
    // =====================================================================
    await refreshRect("section 5 (the owner's case)");
    const FLOOR_A = fireFloor(VO_A);
    // Aim well ABOVE the floor: he was dragging up until it stopped.
    const PUSH_TO = Math.max(4, FLOOR_A - 45);
    await dragTo(canvasYOf(FIRE_START, view), PUSH_TO);
    guides = await c.json('window.__dbg.aeon.guides()');
    const held = guides.rows[0];
    check('5a', "THE OWNER'S CASE: the fire layer is HELD at EFFECTS_FIRE_LINE_MIN + v_offset",
      held.worldY === FLOOR_A,
      `cursor asked for world ${worldYAt(aimY(PUSH_TO), view)}, guide sits at ${held.worldY}, `
      + `contract floor = ${FIRE_MIN} + ${VO_A} = ${FLOOR_A}`);
    check('5b', '⚠ THE RED ROW: something on screen EXPLAINS the stop, mid-gesture',
      held.notice !== null && held.notice !== undefined && typeof held.notice.text === 'string'
      && held.notice.tone === 'held',
      `notice = ${JSON.stringify(held.notice)}`);
    const t5 = held.notice?.text ?? '';
    check('5c', 'it names the REASON, not just the number: the fire rule, v_offset, and the view box',
      t5.includes('raster fire') && t5.includes(`${FIRE_MIN}..${FIRE_MAX}`)
      && t5.includes(`v_offset (${VO_A})`) && /view box/i.test(t5) && t5.includes(String(FLOOR_A)),
      JSON.stringify(t5));
    check('5d', 'ANTI-VACUOUS: the CONTROL layer, same scene same repaint, says nothing',
      guides.rows[1].notice === null,
      `L1 (no vsplit) at world ${guides.rows[1].worldY}: ${JSON.stringify(guides.rows[1].notice)}`);

    // ---- 5e. IS IT ON THE GLASS, or only in the model? --------------------
    const lineY = Math.round(canvasYOf(FLOOR_A, view));
    const onLine = Math.max(
      redness(await c.json(PIXEL_AT(probeX(), lineY))),
      redness(await c.json(PIXEL_AT(probeX(), lineY + 1))));
    const above = redness(await c.json(PIXEL_AT(probeX(), lineY - 24)));
    const below = redness(await c.json(PIXEL_AT(probeX(), lineY + 24)));
    check('5e', 'the held guide is PAINTED in the refusal colour — and only there',
      onLine >= RED_MIN && above < RED_MIN && below < RED_MIN,
      `redness on the line (canvasY ${lineY}) = ${onLine}, 24px above = ${above}, `
      + `24px below = ${below}; threshold ${RED_MIN} (set above the screen frame's amber, 85). `
      + 'The two off-line samples are what stop this passing on a red background.');
    // ---- 5f. AND IS THE SENTENCE ITSELF ON THE GLASS? --------------------
    // ⚠ 5e ABOVE PROVES ONLY THAT THE LINE TURNED RED. A line changing colour is
    // not an explanation, and the whole parcel is about the explanation — so a
    // suite that stopped at 5e would be asserting the decoration and trusting
    // the substance. The plate is drawn at canvas x=8 with a 2px rule in the
    // refusal colour down its left edge; this scans that column beside the
    // guide, where the plate is, and the same column well above it, where it is
    // not. Sampled as a COLUMN rather than one pixel because the plate's height
    // depends on how many lines the sentence wraps to, which is a font
    // measurement and not something to pin.
    const scanCol = async (x, y0, y1) => {
      let hits = 0;
      for (let y = y0; y <= y1; y += 3) {
        if (redness(await c.json(PIXEL_AT(x, y))) >= RED_MIN) hits++;
      }
      return hits;
    };
    const plateHits = await scanCol(9, lineY + 12, lineY + 44);
    const plateCtrl = await scanCol(9, lineY - 64, lineY - 32);
    check('5f', 'the SENTENCE is painted too, not merely published — its plate is on the canvas',
      plateHits >= 4 && plateCtrl === 0,
      `refusal-coloured samples in the plate's left rule (x=9, ${lineY + 12}..${lineY + 44}) = `
      + `${plateHits}/12; same column 64..32px ABOVE the guide = ${plateCtrl}/12. `
      + 'The control column is what stops this passing on a red-tinted canvas, and 5e '
      + 'alone would have proven only that the LINE changed colour.');
    await shot(c, 'held-at-floor-vo64');
    await release(PUSH_TO);

    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('5g', 'the commit agrees with the preview: the document got the floor, not the cursor',
      sceneOf(doc).layers[0].world_y === FLOOR_A,
      `world_y=${sceneOf(doc).layers[0].world_y}`);
    guides = await c.json('window.__dbg.aeon.guides()');
    check('5h', 'the notice CLEARS on release — it is a gesture answer, not permanent chrome',
      guides.rows[0].notice === null, JSON.stringify(guides.rows[0].notice));

    // =====================================================================
    // 6. THE CONTROL. Same gesture, a layer with no split, far above the floor.
    // =====================================================================
    await refreshRect('section 6 (the control)');
    const CTRL_TO = Math.max(4, FLOOR_A - 45);
    await dragTo(canvasYOf(CTRL_START, view), CTRL_TO);
    guides = await c.json('window.__dbg.aeon.guides()');
    const ctrlExpect = worldYAt(aimY(CTRL_TO), view);
    check('6a', '⚠ NOT EVERYTHING IS STUCK: the no-split layer moves FREELY above the fire floor',
      guides.rows[1].worldY === ctrlExpect && ctrlExpect < FLOOR_A,
      `L1 reached world ${guides.rows[1].worldY}; contract for delivered clientY `
      + `${aimY(CTRL_TO)} is ${ctrlExpect}, which is ${FLOOR_A - ctrlExpect} rows above the fire floor `
      + `${FLOOR_A}. If this row is red the section-5 pass means "the canvas is frozen".`);
    check('6b', 'and it says NOTHING while doing it — the advisory is not always-on',
      guides.rows[1].notice === null, JSON.stringify(guides.rows[1].notice));
    await release(CTRL_TO);

    // =====================================================================
    // 7. SILENCE IN THE MIDDLE: a fire layer dragged nowhere near its bound.
    // =====================================================================
    await refreshRect('section 7 (silence)');
    const MID = Math.round((FLOOR_A + fireCeil(VO_A)) / 2);
    await dragTo(canvasYOf(FLOOR_A, view), canvasYOf(MID, view));
    guides = await c.json('window.__dbg.aeon.guides()');
    check('7a', 'a fire layer dragged well inside its bound says nothing',
      guides.rows[0].notice === null && guides.rows[0].worldY === worldYAt(aimY(canvasYOf(MID, view)), view),
      `at world ${guides.rows[0].worldY} (bound ${FLOOR_A}..${fireCeil(VO_A)}): `
      + `${JSON.stringify(guides.rows[0].notice)}`);
    await release(canvasYOf(MID, view));

    // =====================================================================
    // 8. ⚠ THE DISCRIMINATING SECTION: a BOUND, not a WALL.
    //    The owner's second reading. If the floor did not move with v_offset,
    //    everything above would pass over a hard-coded 67 just as happily.
    // =====================================================================
    await setField('8a0', 'the v_offset field took the owner\'s SECOND value', voField, VO_B);
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('8a', 'ANTI-VACUOUS: v_offset really moved to the owner\'s second value',
      sceneOf(doc).v_offset === VO_B, `v_offset=${sceneOf(doc).v_offset}`);
    await refreshRect('section 8 (the second v_offset)');
    const FLOOR_B = fireFloor(VO_B);
    await dragTo(canvasYOf(MID, view), Math.max(4, FLOOR_B - 45));
    guides = await c.json('window.__dbg.aeon.guides()');
    check('8b', '⚠ THE FLOOR MOVED WITH v_offset — a fire bound, not a fixed wall',
      guides.rows[0].worldY === FLOOR_B && FLOOR_B !== FLOOR_A,
      `v_offset ${VO_A} -> floor ${FLOOR_A}; v_offset ${VO_B} -> floor ${guides.rows[0].worldY}, `
      + `contract ${FIRE_MIN} + ${VO_B} = ${FLOOR_B}. The owner observed exactly this pair.`);
    const t8 = guides.rows[0].notice?.text ?? '';
    check('8c', 'and the sentence moved with it: it quotes the NEW v_offset, not the old',
      t8.includes(`v_offset (${VO_B})`) && !t8.includes(`v_offset (${VO_A})`)
      && t8.includes(String(FLOOR_B)),
      JSON.stringify(t8));
    await shot(c, 'held-at-floor-vo135');
    await release(Math.max(4, FLOOR_B - 45));

    // =====================================================================
    // 9. ⚠ THE HOLE: moving the view box strands a layer under the floor.
    //    `setSceneFieldCommand` writes one key and re-checks no layer, so this
    //    reaches an unbakeable document WITHOUT ever dragging the layer.
    // =====================================================================
    const VO_C = 400;
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const beforeTop = sceneOf(doc).layers[0].world_y;
    await setField('9a0', 'the v_offset field took a value that strands the placed layer', voField, VO_C);
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const afterTop = sceneOf(doc).layers[0].world_y;
    check('9a', '⚠ THE HOLE IS REAL: raising v_offset lifts the floor PAST a placed layer, silently',
      afterTop === beforeTop && beforeTop < fireFloor(VO_C),
      `top stayed ${afterTop} while the floor rose ${fireFloor(VO_B)} -> ${fireFloor(VO_C)}. `
      + `The layer is now ${fireFloor(VO_C) - afterTop} rows below its own legal minimum, and `
      + 'no layer gesture was ever made. This row DOCUMENTS a hole; it is not a feature passing.');
    guides = await c.json('window.__dbg.aeon.guides()');
    check('9b', 'THE FIX FOR IT: the canvas now marks the stranded layer, with no gesture asking',
      guides.rows[0].notice !== null && guides.rows[0].notice?.tone === 'illegal',
      `notice = ${JSON.stringify(guides.rows[0].notice)}`);
    const t9 = guides.rows[0].notice?.text ?? '';
    check('9c', 'and it says the BOX moved the floor — the causal link the author needs',
      /moving the box moved this floor/i.test(t9) && t9.includes(`v_offset (${VO_C})`),
      JSON.stringify(t9));
    check('9d', 'ANTI-VACUOUS: the control layer is still silent — only the fire layer is stranded',
      guides.rows[1].notice === null, JSON.stringify(guides.rows[1].notice));
    const strandY = Math.round(canvasYOf(afterTop, view));
    const strandRed = Math.max(
      redness(await c.json(PIXEL_AT(probeX(), strandY))),
      redness(await c.json(PIXEL_AT(probeX(), strandY + 1))));
    check('9e', 'the stranded guide is PAINTED refused, with no cursor anywhere near it',
      strandRed >= RED_MIN
      && redness(await c.json(PIXEL_AT(probeX(), strandY - 24))) < RED_MIN,
      `redness on the line = ${strandRed} at canvasY ${strandY}; threshold ${RED_MIN}`);
    await shot(c, 'stranded-by-v-offset');

    // =====================================================================
    // 10. THE SEPARATE QUESTION: does the WINDOW constrain the drag?
    //     Different mechanism from the clamp. There is no window `mousemove`
    //     and no pointer capture on this gesture — only a window `mouseup` —
    //     so whether a guide can be dragged to a row scrolled off the top is a
    //     real question about the container hit box. MEASURED, not assumed.
    // =====================================================================
    await setField('10a0', 'v_offset restored for the viewport question', voField, VO_A);
    await setField('10a1', 'the control layer is parked back on a known row', topField(1), CTRL_START);
    await refreshRect('section 10 (the window question)');
    const PAN_Y = 200;
    await c.evalExpr(`window.__dbg.setView(0, ${PAN_Y}, 1)`);
    await sleep(800);
    const view2 = await c.json('window.__dbg.view()');
    check('10a', 'ANTI-VACUOUS: the view really panned, and the control guide is on screen',
      view2.y === PAN_Y && canvasYOf(CTRL_START, view2) > 0
      && canvasYOf(CTRL_START, view2) < rect.height,
      `view=${JSON.stringify(view2)} L1 world ${CTRL_START} -> canvasY ${canvasYOf(CTRL_START, view2)}`);
    // Drag UP and keep going past the canvas's top edge.
    const OFF_BY = 50;
    await dragTo(canvasYOf(CTRL_START, view2), -OFF_BY, 10);
    guides = await c.json('window.__dbg.aeon.guides()');
    const reached = guides.rows[1].worldY;
    const freeExpect = worldYAt(aimY(-OFF_BY), view2);   // vp.y - 50, if unconstrained
    const wallExpect = worldYAt(aimY(0), view2);         // vp.y, if the window is the wall
    note('THE WINDOW QUESTION, measured',
      `canvas rect.top=${rect.top} parentTop=${rect.parentTop} parentHeight=${rect.parentHeight}; `
      + `dragged to clientY ${aimY(-OFF_BY)} (${OFF_BY}px above the canvas top). `
      + `L1 reached world ${reached}. Unconstrained contract = ${freeExpect}; `
      + `window-bounded = ${wallExpect}.`);
    check('10b', 'a guide CAN be dragged to a world row scrolled off the top of the view',
      reached === freeExpect && freeExpect < wallExpect,
      `reached ${reached}; unconstrained ${freeExpect}, window-bounded ${wallExpect}. `
      + 'If this row is RED and `reached` equals the window-bounded value, the owner\'s '
      + 'literal words are a SECOND, separate bug: the gesture is imprisoned by the '
      + 'viewport independently of any value clamp.');
    await release(-OFF_BY);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(600);

    // =====================================================================
    // 11. NO CLOCK WAS ADDED. The notice draws inside the pass that already ran.
    // =====================================================================
    const installed = await c.evalExpr(REPAINT_PROBE);
    check('11a', 'ANTI-VACUOUS: the repaint probe bound to the live #map-canvas',
      installed === 'installed' || installed === 'already', `install=${installed}`);
    guides = await c.json('window.__dbg.aeon.guides()');
    check('11b', 'ANTI-VACUOUS: guides ARE drawn during the idle measurement',
      guides.active === true && guides.rows.length === 2,
      JSON.stringify({ active: guides.active, rows: guides.rows.length }));
    // SETTLE FIRST. One run in six reported a single idle repaint, and the cause
    // was a repaint already SCHEDULED when the counters were zeroed landing just
    // after them — a race in the measurement, not a clock in the app. Waiting for
    // the app to go quiet before zeroing removes the race WITHOUT weakening the
    // assertion, which stays a hard `=== 0`.
    await sleep(1500);
    await c.evalExpr('window.__boundProbe.repaints = 0; window.__boundProbe.ticks = 0; window.__boundProbe.start()');
    await sleep(3000);
    const idle = await c.json(
      '({ repaints: window.__boundProbe.repaints, ticks: window.__boundProbe.ticks, bound: window.__boundProbe.bound() })');
    await c.evalExpr('window.__boundProbe.stop()');
    check('11c', 'ANTI-VACUOUS: the page IS still painting and the probe is still bound',
      idle.ticks > 60 && idle.bound === true, JSON.stringify(idle));
    check('11d', 'the bound notice adds NO idle map repaints (MapViewport 37/37 stays conditioned)',
      idle.repaints === 0,
      `${idle.repaints} repaints over 3.0s idle against ${idle.ticks} rAF ticks`);

    // ---- 12. Leave the tree as found. ------------------------------------
    const undo = async () => {
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await sleep(400);
    };
    let undos = 0;
    for (let i = 0; i < 60; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await undo();
      undos++;
    }
    const scenesEnd = await c.json('window.__dbg.aeon.scenes()');
    check('12a', 'the whole session undoes back to the fixture — nothing was saved',
      undos > 0 && JSON.stringify(scenesEnd.map((s) => s.id)) === JSON.stringify(scenes0.map((s) => s.id)),
      `${undos} undos; left ${JSON.stringify(scenesEnd.map((s) => s.id))}, `
      + `found ${JSON.stringify(scenes0.map((s) => s.id))}`);
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
  console.log(
    '\nROWS THAT DO NOT DISCRIMINATE, named so nobody counts them twice:\n'
    + '  [3a] [4a] [4b] [10a] [11a] [11b] [11c] — anti-vacuous setup rows. They prove the\n'
    + '      instrument saw its subject; none of them can fail for the bound being wrong.\n'
    + '  [9a] — DOCUMENTS A HOLE. It passes because the app does NOT re-clamp on a v_offset\n'
    + '      change. It would go red if someone fixed the hole by silently moving layers,\n'
    + '      which is a change we would want to notice, but it is not a feature passing.\n'
    + '  [0z] — a cross-check of the source parse against the field report. The two literals\n'
    + '      in this file live there and nowhere else, and nothing asserts behaviour on them.\n'
    + 'THE DISCRIMINATING ROWS: [5a] [5b] [5c] [5e] [5f] [6a] [7a] [8b] [8c] [9b] [9c] [9e] [10b].\n'
    + '  [8b]/[8c] are the ones a hard-coded floor cannot survive; [6a]/[5d]/[9d] are the ones\n'
    + '  a frozen canvas cannot survive; [5e]/[9e] are the ones a published-but-unpainted\n'
    + '  sentence cannot survive.');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
