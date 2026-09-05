// ═══════════════════════════════════════════════════════════════════════════
// sec7-worldwater — AUTHOR OJZ act 1 section 7's effects scene THROUGH THE UI
// ═══════════════════════════════════════════════════════════════════════════
//
// The parcel's whole definition of done is that an effect a PERSON builds in
// Aurora reaches a ROM. A hand-written scene document proves nothing about
// that, so every field below is set by driving the real panel and the file on
// disk is read back afterwards as the app wrote it.
//
// ── WHAT IS BEING AUTHORED ────────────────────────────────────────────────
//
// aeon bound `OJZ_Preset_Sec7` -> `OJZ_WorldWater`: two `patchable()` records
// with world anchors, which are channels 2 and 3 in the vendored
// `aeon-effects-channel-bands.json`:
//
//   the surface  channel 2  screen lines   3..160  (158 lines)  anchor 4320
//   the split    channel 3  screen lines 162..223  ( 62 lines)  anchor 4410
//
// 158 + 62 + 1 = 221. The line budget is EXACTLY FULL and widening one band
// costs the other; that is structural and nothing here tries to talk past it.
//
// ⚠ THE RECORDS THEMSELVES ARE AEON'S AND ARE ALREADY AUTHORED, in
// `ojz_effects.emp` at :1995 and :1998. What this harness authors is the
// AURORA SCENE that dresses them — layers, factors, rowRemap, deform, vsplit —
// and the `section_7.meta.json` whose `sceneRef` is the whole binding. No
// `.emp` edit is needed and none is made.
//
// ── THE TWO-DOCUMENT SPLIT, WHICH IS THE THING TO KNOW BEFORE READING ON ──
//
// Aurora keeps these in TWO documents with TWO different bindings, and the
// concepts do not sit where a reader expects:
//
//   SCENE   editor/effects/<id>.json          bound by `sceneRef`   (Parallax)
//           layers[] (world_y, fa, fb, dsa, dsb, deform, rowRemap, vsplit),
//           v_factor, v_center, v_offset, deform_fg/bg, v_deform
//
//   PRESET  editor/effects/presets/<id>.json  bound by `rasterRef`  (Colour)
//           bands, ramp, base_swap, boundary (= fx_tint_band + offscreen_ship
//           + patchable(ch, lo, hi)), patch_world_ys, patch_motion
//
// So `fx_vscroll_split` is a SCENE key (`layer.vsplit.at` IS the offset), while
// `fx_tint_band`, `offscreen_ship` and `patchable(lo:, hi:)` are PRESET keys.
// `patch_motion` is a PRESET key too — see row [7c], which is a REFUSAL, not an
// omission.
//
// ⚠ AND `dsa`/`dsb` ARE NOT `patch_world_ys`. They are per-layer DEFORM SHIFT
// AMOUNTS (0..15, 15 = "no sample"). Conflating them is a live hazard the panel
// warns about. Row [7b] is about their missing control.
//
// ── RUN ───────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a WRITABLE aeon clone> npm run harness:sec7-worldwater
//
// Never against the live aeon checkout: this harness SAVES.

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9521);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ THE OVERRIDE IS READ THROUGH THE RESOLVER, NEVER OFF `process.env`.
// This harness SAVES, so it genuinely REQUIRES an explicit override — which is
// exactly the case `checkoutOverride` exists for. Reading `process.env.AEON_DIR`
// by hand sees ONE spelling and silently misses the aliases, the disagreement
// refusal when two spellings disagree, and the set-but-names-nothing error.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';
const SHOTS = join(ROOT, 'docs/captures/2026-09-05-sec7-scene');

/** Long and unmistakably this parcel's, so it cannot collide with aeon's own. */
const SCENE_ID = 'ojz_act1_sec7_worldwater';
const SECTION = 7;

/** aeon's own numbers for the two records, from the vendored bands sidecar. */
const SURFACE = { channel: 2, lo: 3, hi: 160, lines: 158, anchor: 4320 };
const SPLIT = { channel: 3, lo: 162, hi: 223, lines: 62, anchor: 4410 };
/** `fx_vscroll_split(offset $0043)` — the offset IS `layer.vsplit.at`. */
const VSPLIT_AT = 0x43;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** NOT a pass and NOT a zero — its own bucket, and it makes the run non-zero. */
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
const ctrlS = (c) => key(c, 's', 'KeyS', 83, 2);

// ── SELECTORS ──────────────────────────────────────────────────────────────
//
// ⚠ NEVER END-ANCHOR A TITLE REGEX. Titles carry long schema-description
// suffixes, and `/^Layer 0 fa$/` once silently matched nothing for weeks while
// every layer kept its default — a rig fault that reads exactly like a feature
// that does not work. Every pattern below is a PREFIX with `\b`.

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

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/**
 * A REAL POINTER GESTURE on a button found by its text or aria-label.
 *
 * ⚠ `element.click()` IS NOT A CLICK. Where the app listens for pointer events
 * a synthetic `.click()` no-ops, every later reading comes off the previous
 * screen, and the rig gets written up as a product defect. This returns the
 * button's rect so the caller can dispatch a real press/release at INTEGER
 * client pixels — `devicePixelRatio` varies run to run on this box (seen at 1
 * and 1.35) and a fractional target resolves one pixel off.
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
    x: r.x, y: r.y, w: r.width, h: r.height,
    disabled: !!el.disabled,
    dpr: window.devicePixelRatio,
    scroller: s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null,
    // ⚠ checkVisibility() and getClientRects() BOTH go green on an element
    // scrolled far outside its scroller, so the rect is compared to the
    // SCROLLER's box and both are printed beside any positional claim.
    insideScroller: s ? (r.top >= s.top - 1 && r.bottom <= s.bottom + 1) : null,
  };
})()`;

/** Press and release at integer client pixels inside `rect`. */
async function clickRect(c, rect) {
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h / 2);
  await mouse(c, 'mousePressed', x, y);
  await mouse(c, 'mouseReleased', x, y);
  return { x, y };
}

/**
 * THE GESTURE LEDGER. Every drive is recorded with what it returned, and row
 * [8a] asserts they ALL said 'ok'. Without it a selector that matches nothing
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

// ── THE SCENE, AND WHY IT LOOKS LIKE THIS ─────────────────────────────────
//
// A Hydrocity waterline is three things stacked, and the two bands aeon
// declared are the seams between them:
//
//   layer 0  the sky / far bank, above everything. Slowest parallax, no
//            deform: a still backdrop is what makes the moving water read as
//            moving. world_y 0.
//   layer 1  THE SURFACE, at the 4320 anchor — channel 2's band. A `sine`
//            deform is the shimmer along the waterline; it is the one effect
//            that says "this is water" rather than "this is a floor".
//   layer 2  UNDERWATER, at the 4410 anchor — channel 3's band, and the layer
//            that carries `vsplit.at = 0x43`, the split's own offset. It gets
//            a `sine` deform too, at a DIFFERENT shift and speed from the
//            surface, so the two do not beat in lockstep and read as one sheet;
//            and a `ladder` rowRemap, which is what gives the depth its banding.
//
// Parallax direction: the underwater plane is set SLOWER than the surface. In
// a real Hydrocity the medium change is sold by the two halves disagreeing
// about how fast the world goes past, and slower-below is the half that reads
// as "heavier water" rather than "the camera is broken".
//
// ⚠⚠ THE LAYER TOP IS A SCREEN LINE HERE, NOT A WORLD Y — AND THAT IS RIGHT. ⚠⚠
//
// The control on screen is labelled `Layer i Screen line (0..511) — a plane
// line; the scene is locked`. At `v_factor` 15 (the sentinel: LOCKED) the
// layer top is in SCREEN space, so the world anchors 4320 and 4410 CANNOT be
// typed into it. That is not a missing control, and typing them anyway is the
// live hazard the panel warns about — a world Y entered where a plane line is
// expected "lands 256 times down the level, validates clean, and the band
// silently never appears".
//
// The world anchors belong to `patch_world_ys` on the PRESET document, reached
// by `rasterRef` — the other half of the two-document split, and out of this
// parcel's `sceneRef` binding. See row [7c].
//
// What the scene's tops SHOULD be is the thing the bands are actually declared
// in: aeon's sidecar says its numbers are "SCREEN LINES, 1:1 with the authored
// patchable(lo:, hi:)". So each strip starts at its own band's `lo`, and the
// scene and the bands are then stated in one coordinate system rather than two.
const LAYERS = [
  { i: 0, top: 0, fa: 'FACTOR_1_8', fb: 'FACTOR_1_8', deform: null, vsplit: null, rowRemap: null,
    curve: null, why: 'sky / far bank, above both bands' },
  // ⚠⚠ NO DEFORM ANYWHERE IN THIS SCENE, AND IT IS NOT A CHOICE. ⚠⚠
  //
  // Deform turned out to be UNAUTHORABLE through Aurora for sonic4, proved by
  // three successive build refusals rather than by reading:
  //
  //  1. A layer `deform: Own(..)` is refused unless the SCENE also attaches a
  //     plane-shared table — own() overrides the scene's table, it cannot BE
  //     the only one, or every other band samples from address 0.
  //  2. Attaching both then folds CAP_MULTI_DEFORM_TABLE ($0020) into the
  //     scene's capability mask — and sonic4's `SCANLINE_CAPS` is $0FDE, which
  //     does NOT declare that bit. Build-fatal: "an Aurora-authored scene
  //     demands a scanline service this game does not declare."
  //  3. Which leaves a SHARED table alone — and a layer only samples it with a
  //     live `dsa`/`dsb` (15 is the no-sample sentinel). `dsa` and `dsb` HAVE
  //     NO UI CONTROL AT ALL (row [7b]).
  //
  // So every route to a deform either needs a capability sonic4 does not have
  // or a control Aurora does not have. Widening SCANLINE_CAPS is an engine
  // decision in game.emp and is not this parcel's to make. The scene ships
  // without it and says so, rather than being quietly hand-edited into shape.
  { i: 1, top: SURFACE.lo, fa: 'FACTOR_1', fb: 'FACTOR_1_2', vsplit: null, rowRemap: null,
    curve: 'FACTOR_1_4',
    deform: null,
    why: 'THE SURFACE — channel 2\'s band top (line 3). Horizon compression via curve.' },
  // ⚠ NO `rowRemap` HERE, AND THAT IS THE PARCEL'S HEADLINE GAP — NOT AN
  // OVERSIGHT. The control exists and its own tooltip names this exact effect
  // ("Hydrocity's waterline"), but aeon's `scene()` constructor refuses a
  // remapped layer unless the scene also declares `anchor: SceneAnchor.At(ch,
  // dsa, dsb)` (design section 9.1 precondition 2) — and `scene.anchor` has NO
  // WRITER ANYWHERE IN AURORA: no control, no command, nothing. So the remap is
  // authorable but never BUILDABLE from the editor alone. Row [7d] measures it.
  // `curve` carries the depth ramp instead: it is precondition 1's option (c),
  // it has a real control, and it gives Plane B something to vary down the strip.
  { i: 2, top: SPLIT.lo, fa: 'FACTOR_3_4', fb: 'FACTOR_1_2', vsplit: VSPLIT_AT,
    rowRemap: null,
    curve: 'FACTOR_1_8',
    deform: null,
    why: 'UNDERWATER — channel 3\'s band top (line 162), the split itself, and '
      + 'the depth ramp. No own() deform: §2 forbids it beside the curve.' },
];

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  // ═══ WHICH TREE IS ACTUALLY UNDER TEST — ASSERTED, NOT READ OFF A BANNER ═══
  //
  // `run-root.mjs` calls a tree runnable only when it has BOTH
  // `node_modules/.bin/electron` AND `dist/main/index.mjs`. A worktree has
  // neither by default, so with no pin the resolver WALKS UP and BORROWS the
  // nearest built tree — the main checkout. It then launches, looks healthy,
  // and every row measures somebody else's app. Nothing announces it as a
  // failure, which makes it worse than a crash.
  //
  // ⚠ THIS HARNESS HIT IT. Its first run borrowed `/home/volence/sonic_hacks/aurora`
  // and reported `BORROWED AND DRIFTED: 4 source file(s) differ` — the four
  // step-1 edits — so it was measuring the OLD vendored channel-bands contract.
  // Every row was `no-element` so nothing was carried forward, but a subtler
  // drift would have produced a confident green about the wrong bytes.
  //
  // The fix here is to make the worktree GENUINELY RUNNABLE (both artifacts
  // present) rather than to pin around the problem, and then to REFUSE if the
  // resolver still borrowed. `AURORA_BUILT_TREE` is honoured too, for a caller
  // who would rather pin than populate.
  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree — '
      + `the app under test would be ${RUN.root}, whose dist/ does not contain this worktree's `
      + 'edits, and every row below would describe the wrong build. Give this tree BOTH '
      + '`node_modules/.bin/electron` (symlink the main checkout\'s) and a '
      + '`VITE_AURORA_DEBUG=1 npm run build`, or set AURORA_BUILT_TREE to a tree that has them.');
  }
  // The resolver answers with a PATH whether or not anything is there, so an
  // absent bundle otherwise reaches xvfb-run and surfaces ~45s later as the
  // thoroughly misleading "CDP target never appeared".
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}. `
        + 'Left alone this reaches xvfb-run and fails 45s later as "CDP target never appeared", '
        + 'which reads as a timing problem rather than a missing build.');
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);

  assertFreshBuild(RUN);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone — this harness SAVES. '
      + 'Never point it at the live checkout.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM, AND THE CHOICE IS LOAD-BEARING.
  //
  // What this guard defends is the live lane checkout at aeon's DEFAULT
  // location. `siblingDefaultPath` passes `allowCheckoutEnv: false` on purpose,
  // and that is the form to compare against.
  //
  // Through the override-aware `siblingPath` the guard breaks BOTH WAYS, because
  // this harness is always run with AEON_DIR naming a throwaway clone:
  //   - it would refuse a legitimate AEONDIR=<that clone>, comparing the value
  //     against itself; and, worse,
  //   - in that same state AEONDIR=<the real tree> would PASS, because the real
  //     tree is no longer what `siblingPath` names.
  // That is failing OPEN on precisely the case the guard exists for.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), which is `
      + 'a live lane tree another agent may be editing. This harness SAVES — point it at a clone.');
  }
  const SCENE_PATH = join(AEONDIR, 'games/sonic4/data/editor/effects', `${SCENE_ID}.json`);
  const META_PATH = join(AEONDIR, 'games/sonic4/data/editor/ojz/act1', `section_${SECTION}.meta.json`);

  // The state BEFORE, so "the app wrote it" is a difference and not a reading.
  const metaBefore = existsSync(META_PATH);
  const sceneBefore = existsSync(SCENE_PATH);
  note('before', `section_${SECTION}.meta.json exists=${metaBefore} · ${SCENE_ID}.json exists=${sceneBefore}`);

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

    const haveDbg = async () => {
      for (let i = 0; i < 40; i++) {
        if (await c.evalExpr('!!(window.__dbg && window.__dbg.aeon)')) return true;
        await sleep(500);
      }
      return false;
    };
    if (!(await haveDbg())) throw new Error('window.__dbg absent — needs a VITE_AURORA_DEBUG=1 build');

    // ⚠ THE ONE NON-UI DOOR, AND IT IS DECLARED. aeon's only real open route is
    // a NATIVE FOLDER PICKER that CDP cannot drive. Everything after this line
    // is real UI interaction; this step is NOT UI evidence and the report says so.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    await sleep(3500);
    const st = await c.json('window.__dbg.aeon.state()');
    check('1a', 'the aeon clone opened', st && st.open === true, JSON.stringify(st));
    await shot(c, '01-opened');

    // ── Reach the Parallax sub-tab, where the SCENE lives ──────────────────
    //
    // ⚠ THE EFFECTS TAB FIRST. Its sub-tab bar is not rendered until the tab
    // itself is open, so `[data-effects-sub-tab]` legitimately matches nothing
    // beforehand — a "no-sub-tab" here is navigation missing, not a control
    // missing, and reading it the other way would have written up the panel as
    // broken. Driven with a REAL pointer gesture at integer client pixels.
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
    await shot(c, '02-parallax-tab');

    // ── [2] CREATE THE SCENE, through the panel's own New affordance ───────
    const idIn = `document.querySelector('input[placeholder="new_scene_id"]')`;
    const idOk = await drive(c, 'scene id field', SET_INPUT(idIn, SCENE_ID));
    const newRect = await c.json(RECT_BY_TEXT(String.raw`/^New$/`));
    if (newRect === null) {
      cannotMeasure('2a', 'create the scene through the UI',
        'no button whose text is exactly "New" is on screen — the Scenes section may be collapsed');
    } else {
      note('New button rect', `x=${newRect.x} y=${newRect.y} w=${newRect.w} h=${newRect.h} `
        + `dpr=${newRect.dpr} insideScroller=${newRect.insideScroller} `
        + `scroller=${JSON.stringify(newRect.scroller)}`);
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
    await shot(c, '03-scene-created');

    // ── [3] LAYERS: add two more, so the stack is sky / surface / underwater ──
    for (let n = 1; n < LAYERS.length; n++) {
      const r = await c.json(RECT_BY_TEXT(String.raw`/Add layer|^Add$/`));
      if (r === null || r.disabled) { note('Add layer unavailable', JSON.stringify(r)); break; }
      await clickRect(c, r);
      await sleep(500);
    }
    const afterAdd = await c.json(`(${SCENE_JSON()})`);
    check('3a', `the panel's Add gesture built ${LAYERS.length} layers`,
      afterAdd !== null && Array.isArray(afterAdd.layers) && afterAdd.layers.length === LAYERS.length,
      `layers = ${afterAdd && afterAdd.layers ? afterAdd.layers.length : 'n/a'}`);

    // ⚠ THE CONTROLS ACTUALLY ON SCREEN, printed before anything is driven.
    // Selector guesses are how a rig writes itself up as a product defect; this
    // is the census that makes a `no-element` mean "absent" instead of "my
    // regex was wrong". It also records the world_y BOUNDS, which are narrowed
    // by the view box and silently clamp an out-of-range anchor.
    if (process.env.DUMP_TITLES) {
      const titles = await c.json(String.raw`
        [...document.querySelectorAll('select,input')]
          .map((e) => e.tagName + '[' + (e.type || '') + '] ' + (e.title || '(no title)'))`);
      note('CONTROLS ON SCREEN', titles.join('\n        '));
    }

    // ── [4] EVERY SCENE FIELD, SET THROUGH ITS OWN CONTROL ─────────────────
    for (const L of LAYERS) {
      // The top control is `Layer i Screen line (0..511)` while the scene is
      // locked — see the LAYERS block. Matched on its real label, not a guess.
      await drive(c, `layer ${L.i} top (screen line)`,
        SET_INPUT(NUM_BY_TITLE(String.raw`/^Layer ${L.i} Screen line\b/`), L.top));
      await drive(c, `layer ${L.i} fa`,
        SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${L.i} fa\b/`), L.fa));
      await drive(c, `layer ${L.i} fb`,
        SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${L.i} fb\b/`), L.fb));
      await sleep(200);

      if (L.curve !== null) {
        await drive(c, `layer ${L.i} curve.to`,
          SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${L.i} curve\.to\b/`), L.curve));
      }

      if (L.deform !== null) {
        // `deform.own`'s OPTION VALUES are 'none'/'on'; 'own' is only the
        // visible label. Driving the label is a no-such-option, which the
        // ledger catches rather than letting the strip keep its default.
        await drive(c, `layer ${L.i} deform.own`,
          SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${L.i} deform\.own\b/`), 'on'));
        await sleep(400);
        // These three appear only AFTER deform.own is on, and their titles are
        // `Layer i shift_a — ...`, with NO "deform" in them.
        for (const k of ['shift_a', 'shift_b', 'phase']) {
          await drive(c, `layer ${L.i} deform.own.${k}`,
            SET_INPUT(NUM_BY_TITLE(String.raw`/^Layer ${L.i} ${k}\b/`), L.deform[k]));
        }
      }

      if (L.rowRemap !== null) {
        await drive(c, `layer ${L.i} rowRemap`,
          SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${L.i} rowRemap\b/`), 'ladder'));
        await sleep(300);
        await drive(c, `layer ${L.i} rowRemap.plane_y`,
          SET_INPUT(NUM_BY_TITLE(String.raw`/^Layer ${L.i} rowRemap\.plane_y\b/`), L.rowRemap.plane_y));
        await drive(c, `layer ${L.i} rowRemap.height_shift`,
          SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${L.i} rowRemap\.height_shift\b/`),
            L.rowRemap.height_shift));
      }

      if (L.vsplit !== null) {
        await drive(c, `layer ${L.i} vsplit mode`,
          SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${L.i} vsplit\.at\b/`), 'at'));
        await sleep(300);
        await drive(c, `layer ${L.i} vsplit.at`,
          SET_INPUT(NUM_BY_TITLE(String.raw`/^Layer ${L.i} vsplit\.at\b/`), L.vsplit));
      }
      await sleep(200);
    }
    // ── [4b] THE SHARED DEFORM TABLE IS DELIBERATELY NOT ATTACHED ─────────
    //
    // An earlier cut of this harness attached `deform_fg`/`deform_bg` here to
    // satisfy own()'s precondition. That combination folds
    // CAP_MULTI_DEFORM_TABLE ($0020) into the scene mask and sonic4's
    // SCANLINE_CAPS ($0FDE) does not declare it, so the build refused. With
    // own() gone the shared table has nothing to sample it either — `dsa`/`dsb`
    // are 15 (no sample) and have no control — so attaching one would author a
    // table no line reads. See the LAYERS block for the full chain.
    check('4b', 'no deform is authored, and the scene\'s capability mask stays inside sonic4\'s',
      LAYERS.every((L) => L.deform === null),
      'CAP_MULTI_DEFORM_TABLE ($0020) is absent from sonic4 SCANLINE_CAPS ($0FDE), and every '
      + 'route to a deform needs either that capability or the dsa/dsb controls Aurora lacks.');

    await shot(c, '04-layers-authored');

    // ── [5] READ THE DOCUMENT BACK OUT OF THE APP ──────────────────────────
    const doc = await c.json(`(${SCENE_JSON()})`);
    const L = (i) => (doc && Array.isArray(doc.layers) ? doc.layers[i] : undefined) ?? {};
    check('5a', 'each strip starts on its own BAND\'S TOP SCREEN LINE',
      L(1).world_y === SURFACE.lo && L(2).world_y === SPLIT.lo,
      `layer1 top=${L(1).world_y} (want ${SURFACE.lo}, channel ${SURFACE.channel}'s lo) · `
      + `layer2 top=${L(2).world_y} (want ${SPLIT.lo}, channel ${SPLIT.channel}'s lo). `
      + 'The field is `world_y` in the FILE but the control is a SCREEN LINE while the scene is '
      + 'locked (v_factor 15), and aeon\'s bands are declared in screen lines 1:1, so the two are '
      + 'stated in one coordinate system. The WORLD anchors 4320/4410 are `patch_world_ys` on the '
      + 'PRESET and are not authorable here — see [7c].');
    check('5b', `fx_vscroll_split's offset is $${VSPLIT_AT.toString(16).padStart(4, '0')} `
      + '— authored as layer 2\'s vsplit.at',
      L(2).vsplit !== undefined && L(2).vsplit !== 'none' && L(2).vsplit
        && L(2).vsplit.at === VSPLIT_AT,
      `layer2.vsplit = ${JSON.stringify(L(2).vsplit)}`);
    // BOTH engine rules this scene had to learn the hard way, asserted on the
    // document the app actually holds:
    //   (a) no strip carries `curve` AND `deform` — aeon's layer() refuses the
    //       pair (the curve loop already spends all seven usable data registers
    //       and a sampled channel needs three more);
    //   (b) no strip carries a deform at all — every route to one needs either
    //       CAP_MULTI_DEFORM_TABLE, which sonic4 does not declare, or the
    //       dsa/dsb controls Aurora does not have. See the LAYERS block.
    const layersNow = Array.isArray(doc?.layers) ? doc.layers : [];
    check('5c', 'no strip pairs curve with deform, and none carries a deform at all',
      layersNow.length > 0
      && layersNow.every((l) => !(l.curve && l.deform))
      && layersNow.every((l) => !l.deform)
      && layersNow.some((l) => !!l.curve),
      `${layersNow.length} strip(s): `
      + layersNow.map((l, i) => `L${i}{curve=${JSON.stringify(l.curve ?? null)} `
        + `deform=${JSON.stringify(l.deform ?? null)}}`).join(' '));
    check('5d', 'the underwater layer carries a curve — the depth ramp rowRemap cannot give us',
      !!(L(2).curve && L(2).curve !== 'none'),
      `layer2.curve = ${JSON.stringify(L(2).curve)} · layer2.rowRemap = `
      + `${JSON.stringify(L(2).rowRemap)} (deliberately absent — see [7d])`);
    check('5e', 'parallax is SLOWER below the split than at the surface',
      L(1).fa === 'FACTOR_1' && L(2).fa === 'FACTOR_3_4',
      `layer1.fa=${L(1).fa} layer2.fa=${L(2).fa}`);

    // ── [6] BIND IT TO SECTION 7 — the whole point of section_7.meta.json ──
    // By TITLE, not by `[data-effects-section-picker]` — that attribute is not
    // in the DOM on this screen, and querying it returned no-element while the
    // control was plainly there. The census above is what settled it.
    const secSel = SEL_BY_TITLE(String.raw`/^The section both bindings on this tab act on\b/`);
    const pick = await drive(c, `active section = ${SECTION}`, SET_SELECT(secSel, SECTION));
    await sleep(800);
    const active = await c.evalExpr('window.__dbg.aeon.activeSection()');
    check('6a', `the section picker selected section ${SECTION}`,
      pick === 'ok' && Number(active) === SECTION, `activeSection() = ${active}`);

    const bindSel = SEL_BY_TITLE(String.raw`/^Which effects scene this section uses\b/`);
    const bound = await drive(c, 'sceneRef binding', SET_SELECT(bindSel, SCENE_ID));
    await sleep(800);
    const ref = await c.evalExpr(`window.__dbg.aeon.sceneRef(${SECTION})`);
    check('6b', `section ${SECTION}'s sceneRef is "${SCENE_ID}", set through the assignment control`,
      bound === 'ok' && ref === SCENE_ID, `sceneRef(${SECTION}) = ${JSON.stringify(ref)}`);
    await shot(c, '05-bound-to-section-7');

    // ── [7] WHAT THE UI COULD NOT EXPRESS — findings, not omissions ────────
    //
    // These rows PASS when the control is absent, because absence is the
    // measurement. Reaching for the JSON here would destroy the only evidence
    // that the control was missing.
    const dsaCtl = await c.evalExpr(
      `!!(${NUM_BY_TITLE(String.raw`/^Layer \d+ dsa\b/`)} || ${SEL_BY_TITLE(String.raw`/^Layer \d+ dsa\b/`)})`);
    const dsbCtl = await c.evalExpr(
      `!!(${NUM_BY_TITLE(String.raw`/^Layer \d+ dsb\b/`)} || ${SEL_BY_TITLE(String.raw`/^Layer \d+ dsb\b/`)})`);
    check('7b', 'GAP CONFIRMED ON SCREEN: no control exists for layer dsa/dsb',
      dsaCtl === false && dsbCtl === false,
      `dsa control present=${dsaCtl} · dsb control present=${dsbCtl}. The panel's own source says `
      + '"The card has no control for dsa/dsb/phase, so this state arrives from a HAND-EDITED '
      + 'file." NOT hand-edited here: the dispatch asked for dsa/dsb and the honest answer is '
      + 'that the UI cannot express them. This is the next queue row.');

    const anchorsOnTab = await c.evalExpr(
      `[...document.querySelectorAll('select,input')].some((e) => /patch_motion|moving anchors/i.test(e.title || ''))`);
    check('7c', 'patch_motion is NOT on the scene tab — it is a PRESET key, bound by rasterRef',
      anchorsOnTab === false,
      'patch_motion[2]/[3] cannot be authored into a SCENE at all: they live on the preset '
      + 'document (Colour tab, `rasterRef`), while this parcel\'s binding is `sceneRef`. Section '
      + '7\'s preset is aeon\'s own OJZ_Preset_Sec7 .emp record, and the dispatch says no .emp '
      + 'edit is needed — so making the edges move on their own is a SEPARATE binding, not a '
      + 'field this scene forgot.');

    // ── [8] THE TIMELINE STRIP, and whether it draws channels 2 and 3 ─────
    const strip = await c.evalExpr(`!!document.querySelector('#effects-raster-timeline')`);
    let tl = null;
    try { tl = await c.json('window.__dbg.aeon.rasterTimeline()'); } catch { /* absent */ }
    if (!strip && tl === null) {
      cannotMeasure('8b', 'does the timeline draw channels 2 and 3?',
        'neither #effects-raster-timeline nor __dbg.aeon.rasterTimeline() could be reached on '
        + 'this screen — the question is UNANSWERED, not answered "no"');
    } else {
      const s = JSON.stringify(tl);
      const mentionsChannel = /"channel"|channels/i.test(s ?? '');
      check('8b', 'the timeline strip has NO channel concept — so it draws neither 2 nor 3',
        mentionsChannel === false,
        `#effects-raster-timeline present=${strip}; rasterTimeline() keys = `
        + `${tl && typeof tl === 'object' ? JSON.stringify(Object.keys(tl)) : String(tl)}. `
        + 'Its "bands" are scene LAYERS and preset palette bands on the screen axis, not patch '
        + 'channels. It did not draw 0 and 1 either, so nothing regressed — but aeon\'s note that '
        + 'the sidecar carries 2 and 3 "so your timeline strip can draw them today" describes a '
        + 'strip Aurora has not built.');
    }

    // ── [9] SAVE — Ctrl+S, the only save gesture there is ─────────────────
    const dirty = await c.evalExpr('!!(window.__dbg.aeon.state() || {}).dirty');
    note('dirty before save', String(dirty));
    await ctrlS(c);
    await sleep(2500);
    await shot(c, '06-after-save');

    check('9a', `the app WROTE section_${SECTION}.meta.json (it did not exist before)`,
      metaBefore === false && existsSync(META_PATH),
      `${META_PATH} existed_before=${metaBefore} exists_now=${existsSync(META_PATH)}`);
    if (existsSync(META_PATH)) {
      const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
      check('9b', 'that file binds the scene by sceneRef', meta.sceneRef === SCENE_ID,
        JSON.stringify(meta));
    } else {
      cannotMeasure('9b', 'the meta sidecar binds the scene', 'the file was never written');
    }
    check('9c', 'the app WROTE the scene document', existsSync(SCENE_PATH),
      `${SCENE_PATH} exists=${existsSync(SCENE_PATH)}`);
    if (existsSync(SCENE_PATH)) {
      const onDisk = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));
      check('9d', 'the SAVED document carries the split offset and both band tops',
        onDisk.layers?.[2]?.vsplit?.at === VSPLIT_AT
        && onDisk.layers?.[1]?.world_y === SURFACE.lo
        && onDisk.layers?.[2]?.world_y === SPLIT.lo,
        JSON.stringify(onDisk).slice(0, 800));
    }

    // ── [8a] THE LEDGER. Last, so it covers every gesture above. ──────────
    const bad = driven.filter((d) => d.r !== 'ok');
    check('8a', 'EVERY gesture found its control and drove it',
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

/** The selected scene as the APP holds it — a JSON string, then parsed. */
function SCENE_JSON() {
  return String.raw`(() => {
  const raw = window.__dbg.aeon.scenesJson ? window.__dbg.aeon.scenesJson() : null;
  if (!raw) return null;
  const all = JSON.parse(raw);
  const list = Array.isArray(all) ? all : (all.scenes || []);
  return list.find((s) => s && s.id === ${JSON.stringify(SCENE_ID)}) || null;
})()`;
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.message ?? e}`); process.exitCode = 1; });
