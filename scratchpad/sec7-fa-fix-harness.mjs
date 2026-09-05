// ═══════════════════════════════════════════════════════════════════════════
// sec7-fa-fix — CORRECT section 7's Plane A factors THROUGH THE REAL UI
// ═══════════════════════════════════════════════════════════════════════════
//
// `ojz_act1_sec7_worldwater` (landed in aeon at c1d0a6be) sets `fa` BELOW
// FACTOR_1 on two of its three layers — FACTOR_1_8 on layer 0, FACTOR_3_4 on
// layer 2. `fa` is Plane A, and aeon calls Plane A "the gameplay plane"
// (engine/level/parallax.emp:2505); its own scene guard says "In a
// side-scrolling scene fa tracks the camera (FACTOR_1)" (scene_dsl.emp:2105).
// So the foreground scrolls at a rate the camera does not and the geometry
// slides under the player — which is what the owner saw: "only thing I see in
// section 7 is the fg loading wrong?".
//
// ── WHAT THIS DOES, AND WHY IT DOES IT THIS WAY ──────────────────────────
//
// It opens a THROWAWAY aeon clone that already carries the landed scene,
// selects that scene from the panel's own picker with a real pointer gesture,
// drives the three `fa` controls to FACTOR_1, and saves with Ctrl+S.
//
// ⚠ IT DOES NOT RE-CREATE THE DOCUMENT. The dispatch's bar is "keep everything
// else exactly as it is", and a from-scratch re-author is the shape most likely
// to quietly move something else — the exact risk the leaf diff exists to
// catch. Editing the three controls a person would edit is BOTH the smaller
// change and the more honest answer to "can the UI express this".
//
// ⚠ NO HAND-EDITED JSON ANYWHERE. If a control cannot be reached or refuses the
// value, the row FAILS and the file is left alone. That is a finding.
//
// ── THE PROOF ────────────────────────────────────────────────────────────
//
// [5a] a PARSED LEAF DIFF of the saved document against the landed one. The
// changed-leaf set must be exactly the `fa` of the layers whose value moved.
// Anything else changing is a re-author silently doing something else.
//
// ── RUN ──────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a WRITABLE aeon CLONE> \
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:sec7-fa-fix
//
// Never against the live aeon checkout: this harness SAVES.

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9527);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ READ THROUGH THE RESOLVER, NEVER OFF `process.env`. This harness SAVES, so
// it genuinely REQUIRES an explicit override — the case `checkoutOverride`
// exists for. Reading `process.env.AEON_DIR` by hand sees ONE spelling and
// misses the aliases, the disagreement refusal, and set-but-names-nothing.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';

const SCENE_ID = 'ojz_act1_sec7_worldwater';
/** The landed bytes, vendored into this repo by the dispatch — the diff BASE. */
const LANDED = join(ROOT, 'docs/captures/2026-09-05-sec7-scene', `${SCENE_ID}.json`);
/** Where the corrected document is delivered, AS THE APP WROTE IT. */
const OUT_DIR = join(ROOT, 'docs/captures/2026-09-05-sec7-fa-fix');

/** The whole change: Plane A tracks the camera on every layer. */
const WANT_FA = 'FACTOR_1';

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
    writeFileSync(`${OUT_DIR}/${name}.png`, Buffer.from(data, 'base64'));
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

// ⚠ NEVER END-ANCHOR A TITLE REGEX — titles carry long schema-description
// suffixes, and `/^Layer 0 fa$/` once matched nothing for weeks while every
// layer kept its default: a rig fault that reads exactly like a dead feature.
const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

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

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/**
 * A REAL POINTER TARGET, found by text or aria-label. ⚠ `element.click()` IS
 * NOT A CLICK where the app listens for pointer events; the rect comes back so
 * the caller dispatches press/release at INTEGER client pixels
 * (`devicePixelRatio` varies run to run on this box).
 */
const RECT_BY = (re, tag = 'button', attr = 'textContent') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(${attr === 'title' ? '(e.getAttribute("title") || "")'
      : '(((e.textContent || "") + " " + (e.getAttribute("aria-label") || "")).trim())'}));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const sc = el.closest('[style*="overflow"]') || document.scrollingElement;
  const s = sc ? sc.getBoundingClientRect() : null;
  return {
    x: r.x, y: r.y, w: r.width, h: r.height, disabled: !!el.disabled,
    dpr: window.devicePixelRatio,
    scroller: s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null,
    // ⚠ checkVisibility() and getClientRects() BOTH go green on an element
    // scrolled far outside its scroller, so the rect is compared to the
    // SCROLLER's box and both are printed beside any positional claim.
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

/** THE GESTURE LEDGER — row [6a] asserts every drive said 'ok'. */
const driven = [];
async function drive(c, label, expr) {
  const r = await c.evalExpr(expr);
  driven.push({ label, r });
  if (r !== 'ok') note(`gesture "${label}" returned`, JSON.stringify(r));
  return r;
}

// ── THE PARSED LEAF DIFF ──────────────────────────────────────────────────
//
// Flatten both documents to `path -> scalar` and compare the two maps. A leaf
// is a scalar; arrays are indexed. This is what makes "only the fa values
// moved" a MEASUREMENT rather than an eyeball over two pretty-prints — key
// ORDER, whitespace and a re-serialised number all wash out, and an added or
// removed key is caught as a leaf that exists on one side only.
function leaves(v, path = '', out = new Map()) {
  if (v !== null && typeof v === 'object') {
    if (Array.isArray(v)) v.forEach((e, i) => leaves(e, `${path}[${i}]`, out));
    else for (const k of Object.keys(v).sort()) leaves(v[k], path === '' ? k : `${path}.${k}`, out);
    // An EMPTY object or array is itself a leaf — otherwise `{}` and a deleted
    // key are indistinguishable and a real removal would diff as nothing.
    if (Object.keys(v).length === 0) out.set(path, Array.isArray(v) ? '[]' : '{}');
    return out;
  }
  out.set(path, v);
  return out;
}
function leafDiff(before, after) {
  const A = leaves(before);
  const B = leaves(after);
  const changed = [];
  for (const [k, v] of A) {
    if (!B.has(k)) changed.push({ path: k, from: v, to: '(absent)' });
    else if (JSON.stringify(B.get(k)) !== JSON.stringify(v)) changed.push({ path: k, from: v, to: B.get(k) });
  }
  for (const [k, v] of B) if (!A.has(k)) changed.push({ path: k, from: '(absent)', to: v });
  return { changed, leavesBefore: A.size, leavesAfter: B.size };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // ═══ WHICH TREE IS ACTUALLY UNDER TEST — ASSERTED, NOT READ OFF A BANNER ═══
  // With no pin, `run-root.mjs` WALKS UP and borrows the nearest built tree —
  // the main checkout. It launches, looks healthy, and every row measures
  // somebody else's app. Nothing announces that as a failure.
  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree — the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this worktree's edits. Give this tree `
      + 'BOTH `node_modules/.bin/electron` and a `VITE_AURORA_DEBUG=1 npm run build`, or set '
      + 'AURORA_BUILT_TREE.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}. Left alone `
        + 'this reaches xvfb-run and fails ~45s later as "CDP target never appeared", which reads '
        + 'as a timing problem rather than a missing build.');
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone — this harness SAVES.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM, and the choice is load-bearing: through the
  // override-aware `siblingPath` this guard breaks BOTH ways, because AEON_DIR
  // is always set here — it would compare the clone against itself, and would
  // PASS for the real tree. That is failing open on the one case it guards.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), a live `
      + 'lane tree another agent may be editing. This harness SAVES — point it at a clone.');
  }

  const SCENE_PATH = join(AEONDIR, 'games/sonic4/data/editor/effects', `${SCENE_ID}.json`);
  if (!existsSync(SCENE_PATH)) throw new Error(`the clone does not carry ${SCENE_PATH}`);
  if (!existsSync(LANDED)) throw new Error(`the landed capture is missing: ${LANDED}`);

  const landed = JSON.parse(readFileSync(LANDED, 'utf8'));
  const cloneBefore = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));
  // ⚠ THE BASE IS ASSERTED, NOT ASSUMED. If the clone's copy already differed
  // from the vendored capture, every leaf-diff row below would be describing
  // two unrelated documents and would still look tidy.
  const baseDiff = leafDiff(landed, cloneBefore);
  check('0a', 'the clone\'s scene IS the landed document, leaf for leaf — the diff has a base',
    baseDiff.changed.length === 0,
    `${baseDiff.leavesBefore} leaves in the capture, ${baseDiff.leavesAfter} in the clone; `
    + `${baseDiff.changed.length} differ${baseDiff.changed.length ? `: ${JSON.stringify(baseDiff.changed)}` : ''}`);
  const wrongBefore = (landed.layers ?? [])
    .map((l, i) => ({ i, fa: l.fa }))
    .filter((l) => l.fa !== WANT_FA);
  note('the defect, off the landed bytes',
    `${wrongBefore.length} of ${landed.layers.length} layers carry fa != ${WANT_FA}: `
    + wrongBefore.map((l) => `L${l.i}=${l.fa}`).join(' '));

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
    if (!haveDbg) throw new Error('window.__dbg absent — needs a VITE_AURORA_DEBUG=1 build');

    // ⚠ THE ONE NON-UI DOOR, AND IT IS DECLARED. aeon's only real open route is
    // a NATIVE FOLDER PICKER that CDP cannot drive. Everything after this line
    // is real UI interaction; this step is NOT UI evidence and the report says so.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    await sleep(3500);
    const st = await c.json('window.__dbg.aeon.state()');
    check('1a', 'the aeon clone opened', st && st.open === true, JSON.stringify(st));

    // ── [1b] Effects tab, then the Parallax sub-tab ───────────────────────
    // The sub-tab bar is not rendered until the Effects tab is open, so a
    // "no-sub-tab" beforehand is navigation missing, not a control missing.
    const fxRect = await c.json(RECT_BY(String.raw`/^Effects$/`, 'button,div,span,a'));
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
    await shot(c, '01-parallax-tab');

    // ── [2a] SELECT THE SCENE FROM THE PANEL'S OWN PICKER ─────────────────
    // The picker is one <button> per scene carrying `title="<label> (<id>)"`,
    // with a plain onClick — so a REAL press/release at integer client pixels
    // is the gesture, not `__dbg.selectScene`.
    const pickRect = await c.json(RECT_BY(
      new RegExp(`\\(${SCENE_ID}\\)`).toString(), 'button', 'title'));
    if (pickRect === null) {
      cannotMeasure('2a', 'select the scene through the panel\'s picker',
        `no button carries a title containing "(${SCENE_ID})" — the Scenes section may be collapsed`);
    } else {
      note('scene picker rect', `x=${pickRect.x} y=${pickRect.y} w=${pickRect.w} h=${pickRect.h} `
        + `dpr=${pickRect.dpr} insideScroller=${pickRect.insideScroller} `
        + `scroller=${JSON.stringify(pickRect.scroller)}`);
      const at = await clickRect(c, pickRect);
      note('clicked the scene row at integer client px', `(${at.x}, ${at.y})`);
      await sleep(1000);
      const sel = await c.json(`(${SCENE_JSON()})`);
      check('2a', `a REAL pointer gesture selected "${SCENE_ID}" and its card is on screen`,
        sel !== null && Array.isArray(sel.layers) && sel.layers.length === landed.layers.length,
        `the card holds ${sel && sel.layers ? sel.layers.length : 'n/a'} layer(s)`);
    }
    await shot(c, '02-scene-selected');

    // ── [2b] THE ADVISORY THIS PARCEL ADDED, ON SCREEN, BEFORE THE FIX ────
    // The half-two claim end to end: with the broken values loaded the panel
    // now SAYS so. Counted, and compared against the landed document's own
    // count of offending layers rather than against a number typed here.
    const advisoryText = 'fa tracks the camera (FACTOR_1)';
    const sayingBefore = await c.evalExpr(
      `[...document.querySelectorAll('*')].filter((e) => e.children.length === 0 `
      + `&& (e.textContent || '').includes(${JSON.stringify(advisoryText)})).length`);
    check('2b', 'the NEW advisory is on screen for every layer whose fa does not track the camera',
      sayingBefore === wrongBefore.length && wrongBefore.length > 0,
      `${sayingBefore} advisory element(s) rendered; the document carries ${wrongBefore.length} `
      + `offending layer(s) (${wrongBefore.map((l) => `L${l.i}=${l.fa}`).join(' ')}). `
      + 'This is the sentence the panel did NOT say when the scene was first authored.');

    // ── [3] THE ONLY EDIT: fa -> FACTOR_1 on every layer ──────────────────
    //
    // EVERY layer is driven, including the one already holding FACTOR_1. That
    // is deliberate: it makes "the UI rewrote an identical value" a thing the
    // leaf diff can OBSERVE rather than a thing this harness avoided finding.
    for (let i = 0; i < landed.layers.length; i++) {
      const r = await drive(c, `layer ${i} fa`,
        SET_SELECT(SEL_BY_TITLE(String.raw`/^Layer ${i} fa\b/`), WANT_FA));
      if (r !== 'ok') {
        // ⚠ BLOCKED IS A FINDING, NOT A FALLBACK. Nothing here reaches for the
        // file: a hand-edit would destroy the only evidence that the control
        // could not express the value.
        check('3a', `layer ${i}'s fa control accepted ${WANT_FA}`, false,
          `the gesture returned ${JSON.stringify(r)} — BLOCKED. The document is left alone; a `
          + 'hand-edit here would prove nothing about the UI, which is the whole claim.');
      }
      await sleep(200);
    }
    await sleep(400);
    const inApp = await c.json(`(${SCENE_JSON()})`);
    const faNow = (inApp?.layers ?? []).map((l) => l.fa);
    check('3a', `every layer's fa is ${WANT_FA} in the document the APP holds`,
      faNow.length === landed.layers.length && faNow.every((f) => f === WANT_FA),
      `fa = ${JSON.stringify(faNow)}`);
    await shot(c, '03-fa-corrected');

    // ── [3b] AND THE ADVISORY IS GONE ─────────────────────────────────────
    const sayingAfter = await c.evalExpr(
      `[...document.querySelectorAll('*')].filter((e) => e.children.length === 0 `
      + `&& (e.textContent || '').includes(${JSON.stringify(advisoryText)})).length`);
    check('3b', 'with Plane A tracking the camera the advisory falls silent',
      sayingAfter === 0, `${sayingBefore} before -> ${sayingAfter} after`);

    // ── [4] SAVE — Ctrl+S, the only save gesture there is ─────────────────
    note('dirty before save', String(await c.evalExpr('!!(window.__dbg.aeon.state() || {}).dirty')));
    await ctrlS(c);
    await sleep(2500);
    await shot(c, '04-after-save');

    const onDisk = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));
    check('4a', 'the APP wrote the scene file — its fa values changed on disk',
      (onDisk.layers ?? []).every((l) => l.fa === WANT_FA),
      `on disk: fa = ${JSON.stringify((onDisk.layers ?? []).map((l) => l.fa))}`);

    // ── [5a] THE LEAF DIFF — the row this parcel turns on ─────────────────
    const d = leafDiff(landed, onDisk);
    const changedPaths = d.changed.map((x) => x.path).sort();
    // The EXPECTED set is derived from the landed document, not typed: the
    // `fa` of every layer whose value actually had to move. If the UI rewrites
    // the identical value on layer 1 the file is byte-identical there anyway,
    // so that leaf simply does not appear — which is the tighter outcome.
    const expected = wrongBefore.map((l) => `layers[${l.i}].fa`).sort();
    console.log('\n        ── PARSED LEAF DIFF (landed -> app-written) ──');
    for (const x of d.changed) console.log(`        ${x.path}: ${JSON.stringify(x.from)} -> ${JSON.stringify(x.to)}`);
    if (d.changed.length === 0) console.log('        (no leaves changed)');
    check('5a', 'THE ONLY CHANGED LEAVES ARE fa — nothing else moved',
      JSON.stringify(changedPaths) === JSON.stringify(expected),
      `changed = ${JSON.stringify(changedPaths)}\n        expected = ${JSON.stringify(expected)}\n`
      + `        ${d.leavesBefore} leaves before, ${d.leavesAfter} after`);
    check('5b', 'every changed leaf lands on FACTOR_1 and none is a removal or an addition',
      d.changed.length > 0 && d.changed.every((x) => x.to === WANT_FA)
      && d.changed.every((x) => x.from !== '(absent)' && x.to !== '(absent)'),
      JSON.stringify(d.changed));
    check('5c', 'the leaf COUNT is unchanged — no key was added or dropped',
      d.leavesBefore === d.leavesAfter, `${d.leavesBefore} -> ${d.leavesAfter}`);

    // ── DELIVER THE BYTES, AS THE APP WROTE THEM ─────────────────────────
    copyFileSync(SCENE_PATH, join(OUT_DIR, `${SCENE_ID}.json`));
    note('delivered', join(OUT_DIR, `${SCENE_ID}.json`));

    // ── [6a] THE LEDGER. Last, so it covers every gesture above. ─────────
    const bad = driven.filter((x) => x.r !== 'ok');
    check('6a', 'EVERY gesture found its control and drove it',
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
