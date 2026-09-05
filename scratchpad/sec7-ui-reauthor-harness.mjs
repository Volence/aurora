// ═══════════════════════════════════════════════════════════════════════════
// sec7-ui-reauthor — AUTHOR THE SHIPPED SECTION-7 DOCUMENT THROUGH THE REAL UI
// ═══════════════════════════════════════════════════════════════════════════
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// `ojz_act1_sec7_worldwater`'s final, agreed shape was bisected on a live
// machine over eight builds and then **assembled BY HAND** — the bytes were
// typed, not authored in Aurora — because the owner was waiting. That is a
// departure from this project's entire claim, which is that *an effect a person
// builds in Aurora reaches a ROM*. This harness discharges it: it authors that
// exact document through real UI gestures and proves the app-written bytes
// against the committed hand-made ones.
//
// THE DELIVERABLE IS THE COMPARISON, not the document. A difference is the
// finding and is worth MORE than a match; nothing here ever hand-edits the
// app's output to make the two agree — that would destroy the only evidence
// this harness exists to produce.
//
// ── TWO PATHS, AND WHY BOTH ──────────────────────────────────────────────
//
// [B] FROM THE EXISTING SCENE. The clone carries aeon's landed, BROKEN document
//     (fa below FACTOR_1 on two layers, a curve on two layers, world_y 3, no
//     v_offset). Driving that to the target is the exact transformation the
//     hand-assembly performed, and it is the only path that exercises REMOVING
//     A CURVE — a gesture the dispatch flags as possibly unreachable.
//
// [A] FROM SCRATCH. In a SECOND clone that carries no such file at all, create
//     the scene at the target id through the "Scene id" + New control and
//     author all five fields on three layers from the factory defaults. This is
//     the strictly stronger claim (origination, not repair) and it is the one
//     that answers "can Aurora author this document" rather than "can Aurora
//     patch this document".
//
// Both are compared against the SAME committed blob.
//
// ⚠ PATH A GETS ITS OWN CLONE, AND THE FIRST VERSION OF THIS HARNESS DID NOT.
// It ran both paths against ONE clone, deleting the scene through the UI in
// between — and its path-A rows came out green while measuring PATH B'S FILE.
// Two facts conspired: the UI's Delete does not remove the file (row [4a], a
// real finding this kept), and the save layer compares before writing, so path
// A's identical document produced NO WRITE AT ALL. Its "from-scratch" bytes
// were path B's bytes, unread and unwritten, and the inode never moved. Two
// clones is what makes path A's file provably its own.
//
// ── DISTRUST A CLEAN RESULT ──────────────────────────────────────────────
//
// A byte-identical file is exactly what a harness measuring the WRONG SUBJECT
// also produces. So, before believing either result:
//   [0a] the committed capture is pinned by its GIT BLOB HASH, recomputed here
//        from the bytes — not by path, and not by "it looked right".
//   [0b] the clone's starting document is asserted DIFFERENT from the target,
//        with the differing leaves printed. A base that already matched would
//        make every row below vacuous and tidy.
//   [5z] path A's clone is asserted to carry NO such file before the app opens,
//        so the document compared afterwards cannot be a survivor of path B.
//   every path prints the file's inode+mtime before and after its save, and a
//        save that did not move the inode is a FAILED row, not a quiet pass.
//
// ── THE CLAMP HAZARD THIS MEASURES ON PURPOSE ────────────────────────────
//
// `clampLayerTop` narrows a locked scene's layer top to `3+v_offset .. 223+
// v_offset` FOR A LAYER THAT EMITS A FIRE (i.e. carries a vsplit). With
// v_offset 288 that is 291..511 — and the target's layer 2 holds world_y 162
// WITH a vsplit. So the order of gestures decides whether the document is
// authorable at all: set the top while the layer has no vsplit and 162 lands;
// turn the vsplit on first and the same box clamps to 291. Row [5d] reads the
// control's own advertised bound back off the DOM after the fact, so the
// finding is a measurement rather than a reading of the source.
//
// ── RUN ──────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a WRITABLE aeon CLONE> \
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:sec7-ui-reauthor
//
// Never against the live aeon checkout: this harness SAVES and DELETES.

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import {
  writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync, statSync,
  mkdtempSync, cpSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9531);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ THROUGH THE RESOLVER, NEVER OFF `process.env`. This harness SAVES and
// DELETES, so it genuinely REQUIRES an explicit override — the case
// `checkoutOverride` exists for. Reading `process.env.AEON_DIR` by hand sees
// ONE spelling and misses the aliases and the disagreement refusal.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';

const SCENE_ID = 'ojz_act1_sec7_worldwater';
/** The committed hand-made document — the thing being reproduced. */
const TARGET = join(ROOT, 'docs/captures/2026-09-05-sec7-final', `${SCENE_ID}.json`);
/** The blob the dispatch names. Recomputed from bytes, so the base is PINNED. */
const TARGET_BLOB = '3ff07f9bfb51393ba7003699eeb11d799879b682';
/** Where the app-written documents are delivered, EXACTLY AS SAVED. */
const OUT_DIR = join(ROOT, 'docs/captures/2026-09-05-sec7-ui-reauthor');

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

/** git's own blob id, so the base is pinned to the dispatch's hash, not a path. */
function gitBlob(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}
function stamp(p) {
  if (!existsSync(p)) return 'ABSENT';
  const s = statSync(p);
  return `ino=${s.ino} mtimeMs=${Math.round(s.mtimeMs)} size=${s.size}`;
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

// ⚠ NEVER END-ANCHOR A TITLE REGEX — every title here carries a long schema
// description after the field name (`fa — how far Plane A, …`), and a
// `/^Layer 0 fa$/` matches nothing while looking like a dead control.
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

/**
 * Drive a `NumberField`. It is a CONTROLLED `<input type=number>` holding its
 * own text, so the native value setter is what React's onChange sees; a bare
 * `el.value = x` sets the DOM property React already owns and fires nothing.
 *
 * ⚠ It commits on EVERY keystroke that parses, which is why the whole number is
 * set in ONE event: typing 1,6,2 would commit 1 then 16 then 162, and each
 * intermediate goes through the caller's clamp. One event, one commit.
 */
const SET_NUMBER = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.blur();
  return 'ok';
})()`;

/** The `title` a control actually advertises — its bound is written into it. */
const TITLE_OF = (selector) => String.raw`
(() => { const el = ${selector}; return el ? (el.title || '') : null; })()`;

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/**
 * A REAL POINTER TARGET, found by text or aria-label or title. ⚠
 * `element.click()` IS NOT A CLICK where the app listens for pointer events;
 * the rect comes back so the caller dispatches press/release at INTEGER client
 * pixels (`devicePixelRatio` varies run to run on this box).
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

/** THE GESTURE LEDGER — the last row asserts every drive said 'ok'. */
const driven = [];
async function drive(c, label, expr) {
  const r = await c.evalExpr(expr);
  driven.push({ label, r });
  if (r !== 'ok') note(`gesture "${label}" returned`, JSON.stringify(r));
  return r;
}

// ── THE PARSED LEAF DIFF ──────────────────────────────────────────────────
//
// Flatten both documents to `path -> scalar` and compare the maps. A leaf is a
// scalar; arrays are indexed. This is what makes "identical" a MEASUREMENT
// rather than an eyeball over two pretty-prints — key ORDER, whitespace and a
// re-serialised number all wash out, and an added or removed key is caught as a
// leaf that exists on one side only.
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
function printDiff(label, d) {
  console.log(`\n        ── PARSED LEAF DIFF (${label}) ──`);
  for (const x of d.changed) console.log(`        ${x.path}: ${JSON.stringify(x.from)} -> ${JSON.stringify(x.to)}`);
  if (d.changed.length === 0) console.log('        (no leaves differ)');
  console.log(`        ${d.leavesBefore} leaves left, ${d.leavesAfter} right`);
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

// ═══ THE DOCUMENT, AS A GESTURE PLAN ══════════════════════════════════════
//
// Derived from the committed target at run time — nothing below is typed twice.
// The ORDER is the load-bearing part: `vsplit` is driven LAST on every layer,
// because turning it on narrows that layer's `world_y` box to 291..511 (see the
// clamp-hazard block at the top) and a top of 162 could then never be typed.
function gesturePlan(target) {
  const steps = [];
  steps.push({ kind: 'scene-number', field: 'v_factor', title: String.raw`/^v_factor\b/`, value: target.v_factor });
  steps.push({ kind: 'scene-number', field: 'v_offset', title: String.raw`/^v_offset\b/`, value: target.v_offset });
  target.layers.forEach((l, i) => {
    steps.push({ kind: 'layer-number', layer: i, field: 'world_y',
      title: String.raw`/^Layer ${i} (Screen line|world_y)\b/`, value: l.world_y });
    steps.push({ kind: 'layer-select', layer: i, field: 'fa', title: String.raw`/^Layer ${i} fa\b/`, value: l.fa });
    steps.push({ kind: 'layer-select', layer: i, field: 'fb', title: String.raw`/^Layer ${i} fb\b/`, value: l.fb });
    // A curve is `none` unless the target names one. Driving it EVEN WHEN the
    // target has none is deliberate: "the UI can REMOVE a curve" is the
    // dispatch's flagged risk, and only a driven gesture can answer it.
    steps.push({ kind: 'layer-select', layer: i, field: 'curve', title: String.raw`/^Layer ${i} curve\.to\b/`,
      value: l.curve && l.curve !== 'none' ? l.curve.to : '__none__' });
  });
  // vsplit LAST, all layers, after every top has landed.
  target.layers.forEach((l, i) => {
    const at = l.vsplit && typeof l.vsplit.at === 'number' ? l.vsplit.at : null;
    steps.push({ kind: 'layer-select', layer: i, field: 'vsplit', title: String.raw`/^Layer ${i} vsplit\.at\b/`,
      value: at === null ? 'none' : 'at' });
    if (at !== null) {
      steps.push({ kind: 'layer-number', layer: i, field: 'vsplit.at',
        title: String.raw`/^Layer ${i} vsplit\.at \(/`, value: at });
    }
  });
  return steps;
}

async function runPlan(c, plan, tag) {
  for (const s of plan) {
    const label = `${tag} ${s.kind === 'scene-number' ? '' : `L${s.layer} `}${s.field} = ${s.value}`;
    const expr = s.kind === 'layer-select'
      ? SET_SELECT(SEL_BY_TITLE(s.title), s.value)
      : SET_NUMBER(NUM_BY_TITLE(s.title), s.value);
    const r = await drive(c, label, expr);
    if (r !== 'ok') {
      // ⚠ BLOCKED IS A FINDING, NOT A FALLBACK. Nothing here reaches for the
      // file: a hand-edit would prove nothing about the UI, which is the claim.
      note(`BLOCKED — ${label}`, `the gesture returned ${JSON.stringify(r)}; the document is left alone`);
    }
    await sleep(120);
  }
  await sleep(400);
}

/** Expand a CollapsibleSection by clicking its header, if its body is missing. */
async function ensureSection(c, titleRe, probeExpr) {
  if (await c.evalExpr(`!!(${probeExpr})`)) return 'already-open';
  const r = await c.json(RECT_BY(titleRe, 'span'));
  if (r === null) return 'no-header';
  await clickRect(c, r);
  await sleep(500);
  return (await c.evalExpr(`!!(${probeExpr})`)) ? 'opened' : 'still-closed';
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // ═══ WHICH TREE IS ACTUALLY UNDER TEST — ASSERTED, NOT READ OFF A BANNER ═══
  // With no pin, `run-root.mjs` WALKS UP and borrows the nearest built tree —
  // the main checkout. It launches, looks healthy, and every row measures
  // somebody else's app. Nothing announces that as a failure.
  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree — the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this worktree's edits. Set `
      + 'AURORA_BUILT_TREE, and give this tree a VITE_AURORA_DEBUG=1 npm run build.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) {
      throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
    }
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone — this harness SAVES and DELETES.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM, and the choice is load-bearing: through the
  // override-aware `siblingPath` this guard breaks BOTH ways, because AEON_DIR
  // is always set here — it would compare the clone against itself and would
  // PASS for the real tree. That is failing open on the one case it guards.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), the `
      + 'owner\'s live tree. This harness SAVES and DELETES — point it at a clone.');
  }

  // ── TWO WORKING COPIES, so neither path can read the other's bytes and the
  // caller's clone is never mutated (a re-run starts from the same place).
  const scenePathIn = (root) => join(root, 'games/sonic4/data/editor/effects', `${SCENE_ID}.json`);
  if (!existsSync(TARGET)) throw new Error(`the committed target is missing: ${TARGET}`);
  if (!existsSync(scenePathIn(AEONDIR))) throw new Error(`the clone does not carry ${scenePathIn(AEONDIR)}`);

  const WORK = mkdtempSync(join(tmpdir(), 'sec7-reauthor-run-'));
  const DIR_B = join(WORK, 'path-b');
  const DIR_A = join(WORK, 'path-a');
  note('working copies', `${DIR_B}\n        ${DIR_A}`);
  for (const d of [DIR_B, DIR_A]) cpSync(AEONDIR, d, { recursive: true, dereference: false });
  const SCENE_B = scenePathIn(DIR_B);
  const SCENE_A = scenePathIn(DIR_A);
  // Path A authors into a project that has NEVER held this document. Removing
  // the file here is a SETUP step on a throwaway copy — it is not an edit to
  // any document, and nothing about the file being compared later comes from it.
  rmSync(SCENE_A, { force: true });

  // ── [0a] THE BASE IS PINNED BY HASH, NOT BY PATH ──────────────────────
  const targetBytes = readFileSync(TARGET);
  const blob = gitBlob(targetBytes);
  check('0a', 'the document being reproduced IS the blob the dispatch names',
    blob === TARGET_BLOB, `git blob ${blob}\n        expected  ${TARGET_BLOB}`);
  const target = JSON.parse(targetBytes.toString('utf8'));

  // ── [0b] AND THE CLONE'S STARTING DOCUMENT IS NOT ALREADY IT ──────────
  // ⚠ THE ANTI-VACUITY ROW. If the clone already held the target, every
  // "identical" below would be true without the UI doing anything at all.
  const cloneBefore = JSON.parse(readFileSync(SCENE_B, 'utf8'));
  const baseDiff = leafDiff(target, cloneBefore);
  printDiff('committed target -> path B\'s STARTING document', baseDiff);
  check('0b', 'path B starts from a DIFFERENT document, so a match cannot be vacuous',
    baseDiff.changed.length > 0,
    `${baseDiff.changed.length} leaf/leaves differ before anything is driven`);
  check('0c', 'path A starts from NO SUCH FILE, so its match cannot be path B\'s bytes',
    !existsSync(SCENE_A), `${SCENE_A}: ${stamp(SCENE_A)}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  const plan = gesturePlan(target);
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
    // a NATIVE FOLDER PICKER that CDP cannot drive. Opening a project is the
    // ONLY step in this harness that is not a UI gesture, and the report says
    // so; everything that touches the DOCUMENT is real UI interaction.
    async function openProject(dir, tag) {
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(dir)})`);
      await sleep(3500);
      const s = await c.json('window.__dbg.aeon.state()');
      check(`${tag}-open`, `the aeon clone for ${tag} opened (${dir})`,
        s && s.open === true, JSON.stringify(s));
      const fx = await c.json(RECT_BY(String.raw`/^Effects$/`, 'button,div,span,a'));
      if (fx === null) {
        cannotMeasure(`${tag}-nav`, 'reach the Effects tab', 'nothing on screen reads exactly "Effects"');
        return;
      }
      note(`Effects tab rect (${tag})`, `x=${fx.x} y=${fx.y} w=${fx.w} h=${fx.h} `
        + `dpr=${fx.dpr} insideScroller=${fx.insideScroller}`);
      await clickRect(c, fx);
      await sleep(1200);
      check(`${tag}-nav`, `the Parallax sub-tab is reachable in ${tag}`,
        (await drive(c, `${tag} sub-tab parallax`, SUBTAB('parallax'))) === 'ok');
      await sleep(600);
    }

    /** Click the picker row for the scene. Returns the doc the app then holds. */
    async function selectScene(tag) {
      const r = await c.json(RECT_BY(new RegExp(`\\(${SCENE_ID}\\)`).toString(), 'button', 'title'));
      if (r === null) return null;
      note(`scene picker rect (${tag})`, `x=${r.x} y=${r.y} w=${r.w} h=${r.h} `
        + `dpr=${r.dpr} insideScroller=${r.insideScroller}`);
      const at = await clickRect(c, r);
      note(`clicked the scene row at integer client px (${tag})`, `(${at.x}, ${at.y})`);
      await sleep(900);
      return c.json(`(${SCENE_JSON()})`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PATH B — DRIVE THE LANDED (BROKEN) DOCUMENT TO THE TARGET
    // ═══════════════════════════════════════════════════════════════════════
    note('PATH B', 'editing the landed, broken scene into the target — the exact '
      + 'transformation the hand-assembly performed, and the only path that removes a curve');
    await openProject(DIR_B, 'B');
    const selB = await selectScene('B');
    check('2a', `PATH B: a REAL pointer gesture selected "${SCENE_ID}"`,
      selB !== null && Array.isArray(selB.layers),
      `the card holds ${selB && selB.layers ? selB.layers.length : 'n/a'} layer(s)`);
    // The scene-level section is `defaultCollapsed` — v_factor / v_offset are
    // not in the DOM until its header is clicked.
    const openedB = await ensureSection(c, String.raw`/^Scene: /`, NUM_BY_TITLE(String.raw`/^v_offset\b/`));
    check('2b', 'the scene-level section (v_factor / v_offset) is reachable',
      openedB === 'already-open' || openedB === 'opened', `ensureSection -> ${openedB}`);
    await shot(c, '01-path-b-before');

    const bStampBefore = stamp(SCENE_B);
    await runPlan(c, plan, 'B');
    printDiff('committed target -> the document the APP HOLDS (path B, pre-save)',
      leafDiff(target, await c.json(`(${SCENE_JSON()})`)));
    await shot(c, '02-path-b-driven');

    note('dirty before save (B)', String(await c.evalExpr('!!(window.__dbg.aeon.state() || {}).dirty')));
    await ctrlS(c);
    await sleep(2500);
    const bStampAfter = stamp(SCENE_B);
    // ⚠ A SAVE THAT DID NOT MOVE THE INODE IS A FAILED ROW, NOT A QUIET PASS.
    // The save layer compares before writing, so a document equal to what is
    // already on disk produces NO WRITE — and every comparison after it would
    // then be reading bytes this run never authored.
    check('3a', 'PATH B: the APP actually WROTE the file — its inode/mtime/size moved',
      bStampAfter !== bStampBefore, `before: ${bStampBefore}\n        after:  ${bStampAfter}`);

    const bBytes = readFileSync(SCENE_B);
    copyFileSync(SCENE_B, join(OUT_DIR, `${SCENE_ID}.from-existing.json`));
    const dB = leafDiff(target, JSON.parse(bBytes.toString('utf8')));
    printDiff('committed target -> path B\'s APP-WRITTEN file', dB);
    check('3b', 'PATH B: the app-written document is LEAF-IDENTICAL to the committed one',
      dB.changed.length === 0,
      dB.changed.length === 0 ? `${dB.leavesBefore} leaves, all equal`
        : `${dB.changed.length} differing leaf/leaves: ${JSON.stringify(dB.changed)}`);
    check('3c', 'PATH B: and BYTE-identical — the same git blob as the hand-made file',
      gitBlob(bBytes) === TARGET_BLOB, `app blob ${gitBlob(bBytes)}\n        target    ${TARGET_BLOB}`);

    // ═══════════════════════════════════════════════════════════════════════
    // [4] A SIDE FINDING THIS PARCEL TRIPPED OVER — DELETE IS NOT PERSISTED
    // ═══════════════════════════════════════════════════════════════════════
    //
    // The first version of this harness used the panel's Delete button to clear
    // the way for path A. The scene left the panel, the file did not leave the
    // disk, and the "from-scratch" document that followed was the deleted file's
    // own bytes. `buildSavePlan` (core/project/aeon/save.ts) pushes a write for
    // every scene IN the library and has no removal step at all; the only
    // `unlink` in the writer is guarded-write's orphan `.tmp` cleanup.
    //
    // These rows measure the USER-VISIBLE consequence rather than the source:
    // delete, save, RE-OPEN the project, and ask whether the scene is back.
    const delRect = await c.json(RECT_BY(new RegExp(`Delete scene ${SCENE_ID}`).toString(), 'button'));
    if (delRect === null) {
      cannotMeasure('4a', 'delete the scene through the UI', 'no button carries that aria-label');
      cannotMeasure('4b', 'reload after the delete', 'the delete was never driven');
    } else {
      await clickRect(c, delRect);
      await sleep(700);
      const goneFromPanel = (await c.json(`(${SCENE_JSON()})`)) === null;
      await ctrlS(c);
      await sleep(2000);
      check('4a', 'REPORTED, NOT ASSERTED GREEN: the panel\'s Delete removes the scene from the '
        + 'session but the SAVE leaves its file on disk',
        true,
        `gone from the panel: ${goneFromPanel} · file after delete+save: ${stamp(SCENE_B)} `
        + `(it held ${bStampAfter})`);
      const stillOnDisk = existsSync(SCENE_B);
      // The consequence, measured: re-open the very same project.
      await openProject(DIR_B, 'B-reload');
      const backAfterReload = (await c.json(`(${SCENE_JSON()})`)) !== null;
      check('4b', 'DEFECT: a scene deleted in the panel and saved COMES BACK on the next open — '
        + 'the delete is not persisted',
        // Not an assertion that the defect is fine: the row is TRUE when the
        // defect is present, and its name says which way round that is.
        stillOnDisk && backAfterReload,
        `file still on disk after delete+save: ${stillOnDisk} · scene present again after `
        + `re-opening the project: ${backAfterReload}. buildSavePlan writes every scene in the `
        + 'library and has no removal step (src/core/project/aeon/save.ts).');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PATH A — AUTHOR FROM SCRATCH, IN A PROJECT THAT NEVER HELD THE DOCUMENT
    // ═══════════════════════════════════════════════════════════════════════
    note('PATH A', 'creating the scene at the target id in a second clone and authoring '
      + 'every field from the factory defaults');
    // ⚠ [5z] THE ANTI-VACUITY ROW, RE-ASSERTED IMMEDIATELY BEFORE THE APP IS
    // POINTED AT THIS TREE. Between [0c] and here the app saved twice; this is
    // the reading that actually covers the document compared below.
    check('5z', 'path A\'s clone STILL holds no such file the moment before it is opened',
      !existsSync(SCENE_A), `${SCENE_A}: ${stamp(SCENE_A)}`);
    await openProject(DIR_A, 'A');

    const absentFromPicker = await c.json(
      RECT_BY(new RegExp(`\\(${SCENE_ID}\\)`).toString(), 'button', 'title'));
    check('4c', 'path A\'s project does not list the scene at all — nothing to select',
      absentFromPicker === null, `picker row: ${JSON.stringify(absentFromPicker)}`);

    // Create at the target id through the "Scene id" field + New chip.
    const idInput = String.raw`[...document.querySelectorAll('input[type=text],input:not([type])')]
      .find((e) => (e.placeholder || '') === 'new_scene_id')`;
    await drive(c, 'A type the scene id', String.raw`
(() => {
  const el = ${idInput};
  if (!el) return 'no-element';
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    .call(el, ${JSON.stringify(SCENE_ID)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'ok';
})()`);
    await sleep(300);
    const newRect = await c.json(RECT_BY(String.raw`/^New$/`, 'button'));
    if (newRect === null) {
      cannotMeasure('5b', 'create the scene through the UI', 'no "New" button on screen');
    } else {
      note('New chip rect', `x=${newRect.x} y=${newRect.y} w=${newRect.w} h=${newRect.h} `
        + `disabled=${newRect.disabled} insideScroller=${newRect.insideScroller}`);
      await clickRect(c, newRect);
      await sleep(900);
      const fresh = await c.json(`(${SCENE_JSON()})`);
      check('5a', 'PATH A: a fresh scene exists at the target id, from the factory defaults',
        fresh !== null && Array.isArray(fresh.layers) && fresh.layers.length === 1,
        `the new document is ${JSON.stringify(fresh)}`);
    }

    // The Add-layer button, once per missing layer.
    for (let i = 1; i < target.layers.length; i++) {
      const addRect = await c.json(RECT_BY(String.raw`/Add layer/`, 'button'));
      if (addRect === null) { note('Add layer', 'button not found'); break; }
      await clickRect(c, addRect);
      await sleep(400);
    }
    const grown = await c.json(`(${SCENE_JSON()})`);
    check('5c', `PATH A: the Add-layer button grew the scene to ${target.layers.length} layers`,
      grown !== null && grown.layers.length === target.layers.length,
      `the scene holds ${grown ? grown.layers.length : 'n/a'} layer(s)`);

    await ensureSection(c, String.raw`/^Scene: /`, NUM_BY_TITLE(String.raw`/^v_offset\b/`));
    await runPlan(c, plan, 'A');
    printDiff('committed target -> the document the APP HOLDS (path A, pre-save)',
      leafDiff(target, await c.json(`(${SCENE_JSON()})`)));
    await shot(c, '03-path-a-driven');

    // ── [5d] THE CLAMP HAZARD, MEASURED OFF THE DOM ──────────────────────
    // With the vsplit now ON, layer 2's top box advertises a bound that
    // EXCLUDES the value the document holds. The finding is the title string,
    // read back off the live control rather than reasoned from the source.
    const topTitles = [];
    for (let i = 0; i < target.layers.length; i++) {
      topTitles.push(await c.evalExpr(
        TITLE_OF(NUM_BY_TITLE(String.raw`/^Layer ${i} (Screen line|world_y)\b/`))));
    }
    note('what each layer-top box ADVERTISES once the document is authored',
      topTitles.map((t, i) => `L${i}: ${JSON.stringify(t)}`).join('\n        '));
    const outOfBound = target.layers
      .map((l, i) => ({ i, top: l.world_y,
        at: l.vsplit && typeof l.vsplit.at === 'number' ? l.vsplit.at : null }))
      .filter((l) => l.at !== null)
      .filter(({ i, top }) => {
        const m = /\((-?\d+)\.\.(-?\d+)\)/.exec(topTitles[i] || '');
        return m && (top < Number(m[1]) || top > Number(m[2]));
      });
    check('5d', 'REPORTED, NOT ASSERTED GREEN: a fire-emitting layer\'s top box advertises a bound '
      + 'its own value is outside — so this document is authorable ONLY vsplit-last',
      true,
      outOfBound.length === 0
        ? 'no fire-emitting layer\'s top falls outside its advertised bound'
        : outOfBound.map(({ i, top }) => `L${i} holds ${top}, box says ${topTitles[i]}`).join('; '));

    note('dirty before save (A)', String(await c.evalExpr('!!(window.__dbg.aeon.state() || {}).dirty')));
    await ctrlS(c);
    await sleep(2500);
    await shot(c, '04-path-a-saved');
    check('5e', 'PATH A: the APP created a file where the project had none',
      existsSync(SCENE_A), `${SCENE_A}: ${stamp(SCENE_A)}`);

    if (existsSync(SCENE_A)) {
      const aBytes = readFileSync(SCENE_A);
      copyFileSync(SCENE_A, join(OUT_DIR, `${SCENE_ID}.from-scratch.json`));
      const dA = leafDiff(target, JSON.parse(aBytes.toString('utf8')));
      printDiff('committed target -> path A\'s APP-WRITTEN file', dA);
      check('5f', 'PATH A: the from-scratch document is LEAF-IDENTICAL to the committed one',
        dA.changed.length === 0,
        dA.changed.length === 0 ? `${dA.leavesBefore} leaves, all equal`
          : `${dA.changed.length} differing leaf/leaves: ${JSON.stringify(dA.changed)}`);
      check('5g', 'PATH A: and BYTE-identical — the same git blob as the hand-made file',
        gitBlob(aBytes) === TARGET_BLOB, `app blob ${gitBlob(aBytes)}\n        target    ${TARGET_BLOB}`);
    } else {
      cannotMeasure('5f', 'compare path A\'s document', 'no file was written');
      cannotMeasure('5g', 'compare path A\'s bytes', 'no file was written');
    }

    // ── THE LEDGER. Last, so it covers every gesture above. ──────────────
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

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.message ?? e}`); process.exitCode = 1; });
