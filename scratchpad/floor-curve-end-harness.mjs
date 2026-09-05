// ═══════════════════════════════════════════════════════════════════════════
// floor-curve-end - MOVE ONE LEAF IN THE FLOOR SCENE, THROUGH THE REAL UI
// ═══════════════════════════════════════════════════════════════════════════
//
// ── WHAT THIS DOES ───────────────────────────────────────────────────────
//
// `games/sonic4/data/editor/effects/ojz_act1_floor.json` carries
// `curve: { to: "FACTOR_1" }` on `layers[2]` (`world_y` 440, `fb FACTOR_0`).
// This drives that layer's `B curve to` picker to `FACTOR_1_32`, saves through
// the app, and proves the ONLY thing that moved in the document is that leaf.
//
// It is a SIBLING of `sec7-drop-vsplit-harness.mjs` and deliberately keeps its
// shape: the same base assertion, the same git-blob pinning, the same parsed
// leaf diff. The differences are stated rather than drifted into:
//
//   · that one REMOVED a key, so its leaf diff expects `-> (absent)` and it
//     has an extra row proving the parent did not survive as `{}`. This one
//     MOVES a scalar, so the expected diff is one `from -> to` pair and the
//     leaf COUNT must not change either.
//   · that one built a ROM, because the question was whether an inert key
//     reached any ROM byte. THIS PARCEL BUILDS NOTHING. Its output is the JSON
//     bytes and a blob id, carried to aeon by the overseer, and the owner has a
//     live game window on the socket chain: no build, no `Build & Run`, no
//     emulator. Anything wanting runtime confirmation is somebody else's row.
//
// ── DISTRUST A CLEAN RESULT ──────────────────────────────────────────────
//
// "exactly one leaf moved" is ALSO what a diff of two unrelated documents can
// print, and "the picker offered the value" is what a picker with NO disable
// rule at all prints. Both are fenced:
//
//   THE BASE. `[0a]`/`[0a2]` pin the committed capture to a blob id AND to
//   aeon's own `git show 7fdb8d0a:<path>` read out of the clone, so the capture
//   is the REVISION and not a working-tree read that happened to agree.
//   `[0b]`/`[0b2]` then assert the working copy's STARTING file is leaf-for-leaf
//   and byte-for-byte that capture, BEFORE anything is diffed. `[0c]` asserts
//   the base actually holds `layers[2].curve.to` at `FACTOR_1` - without which
//   "changed to FACTOR_1_32" is vacuously satisfiable.
//
//   THE PICKER. `FACTOR_1_32` being selectable proves nothing on its own if
//   NOTHING is disabled - a guard that asserts nothing passes everything. So
//   `[2a2]` requires the disable rule to be OBSERVABLY LIVE on this very
//   control: `curveFieldOptions` greys any option equal to this layer's `fb`,
//   `fb` is `FACTOR_0`, and `FACTOR_0`/`FACTOR_LOCKED` are one value under two
//   spellings - so the greyed set must be exactly those two, and their labels
//   must carry the reason as VISIBLE TEXT. A run where nothing is greyed is
//   reported as a FAIL, not read as "the option was available".
//
//   THE GESTURE. `.click()` is not a click and `el.value = x` is not a change:
//   the select is driven through the NATIVE value setter plus the events React
//   listens for, the control is RE-READ afterwards, and a save that did not
//   move the file's inode is a failed row rather than a quiet pass.
//
// ── RUN ──────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<a WRITABLE aeon CLONE> \
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   FLOOR_RUN=1 \
//   npm run harness:floor-curve-end
//
// Never against the live aeon checkout: this harness SAVES.

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import {
  writeFileSync, mkdirSync, readFileSync, existsSync, copyFileSync, statSync,
  cpSync, rmSync, readdirSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9541);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ THROUGH THE RESOLVER, NEVER OFF `process.env`. This harness SAVES, so it
// genuinely REQUIRES an explicit override.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';

const SCENE_ID = 'ojz_act1_floor';
const SCENE_REL = join('games/sonic4/data/editor/effects', `${SCENE_ID}.json`);

/** The aeon revision the base is asserted against, spelled once. */
const AEON_REV = '7fdb8d0a';

/** The committed capture the base is asserted against, and the blob pinning it. */
const TARGET = join(ROOT, 'docs/captures/2026-09-05-floor-base', `${SCENE_ID}.json`);
const TARGET_BLOB = '5c291583e502e96945cacd6993a4f6035eaf5c35';

/** The one leaf this parcel moves, and the only one that may move. */
const THE_LEAF = 'layers[2].curve.to';
const FROM = 'FACTOR_1';
const TO = 'FACTOR_1_32';

/** The layer whose card is driven, and the `fb` that decides what is greyed. */
const LAYER_INDEX = 2;
const LAYER_FB = 'FACTOR_0';
/**
 * `FACTOR_0` and `FACTOR_LOCKED` are ONE value with two spellings (aeon's
 * `parallax_dsl.emp` declares `FACTOR_0 = FACTOR_LOCKED`, both $0FF), so a
 * layer carrying either as `fb` greys BOTH rows. Naming one would describe half
 * of what the author is looking at.
 */
const EXPECTED_GREYED = ['FACTOR_0', 'FACTOR_LOCKED'];

/** Where the app-written document is delivered, EXACTLY AS SAVED. */
const RUN_LABEL = process.env.FLOOR_RUN ?? '1';
const OUT_DIR = join(ROOT, 'docs/captures/2026-09-05-floor-curve-end', `run-${RUN_LABEL}`);

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

/** git's own blob id, so the base and the result are pinned to hashes, not paths. */
function gitBlob(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}
function stamp(p) {
  if (!existsSync(p)) return 'ABSENT';
  const s = statSync(p);
  return `ino=${s.ino} mtimeMs=${Math.round(s.mtimeMs)} size=${s.size}`;
}

/**
 * ⚠ STRIP `__pycache__` FROM A COPIED TREE. A pytest-rewritten `.pyc` records
 * the path of the tree it was COMPILED in, so a copy runs its own data while
 * every traceback names the original. This harness runs no python, but the copy
 * is handed to aeon afterwards and the trap costs nothing to defuse.
 */
function stripPycache(dir) {
  let removed = 0;
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name === '__pycache__') { rmSync(join(d, e.name), { recursive: true, force: true }); removed++; }
      else if (e.name !== '.git') walk(join(d, e.name));
    }
  };
  walk(dir);
  return removed;
}

// ═══ CDP ══════════════════════════════════════════════════════════════════

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

// ⚠ NEVER END-ANCHOR A TITLE REGEX - every title here carries a long schema
// description after the field name, so `/^Layer 2 curve.to$/` matches nothing
// while looking like a dead control.
const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

/**
 * Drive a `<select>` the way React sees it: the NATIVE value setter, then the
 * events the app listens for. `el.value = x` sets the property React already
 * owns and fires nothing, and `.click()` is not a gesture on a select at all.
 *
 * ⚠ IT REFUSES A DISABLED OPTION rather than driving it. Setting `value` to a
 * disabled option succeeds silently in the DOM, so without this a refused
 * choice would look exactly like an accepted one.
 */
const SET_SELECT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  const opt = [...el.options].find((o) => o.value === ${JSON.stringify(String(value))});
  if (!opt) return 'no-such-option: ' + JSON.stringify([...el.options].map((o) => o.value));
  if (opt.disabled) return 'option-is-disabled: ' + JSON.stringify(opt.textContent);
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

/**
 * What a control CURRENTLY reads, off the live DOM - a measurement, not a guess.
 * The option rows carry `disabled` AND the rendered `text`, because the refusal
 * reason now ships as visible label text rather than a tooltip.
 */
const READ_SELECT = (selector) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return null;
  return {
    value: el.value,
    title: el.title || '',
    options: [...el.options].map((o) => ({
      value: o.value, disabled: !!o.disabled,
      text: (o.textContent || '').trim(), tip: o.getAttribute('title') || '',
    })),
  };
})()`;

/** Every curve picker on screen, so "which layer is this" is measured, not assumed. */
const ALL_CURVE_SELECTS = String.raw`
[...document.querySelectorAll('select')]
  .filter((e) => /^Layer \d+ curve\.to\b/.test(e.title || ''))
  .map((e) => ({ title: (e.title || '').slice(0, 24), value: e.value }))`;

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

/** THE GESTURE LEDGER - the last row asserts every drive said 'ok'. */
const driven = [];
async function drive(c, label, expr) {
  const r = await c.evalExpr(expr);
  driven.push({ label, r });
  if (r !== 'ok') note(`gesture "${label}" returned`, JSON.stringify(r));
  return r;
}

// ── THE PARSED LEAF DIFF ──────────────────────────────────────────────────
//
// Flatten both documents to `path -> scalar` and compare the maps. This makes
// "only that leaf changed" a MEASUREMENT rather than an eyeball over two
// pretty-prints: key ORDER, indentation, a trailing newline and a re-serialised
// number all wash out, and an added or removed key is caught as a leaf that
// exists on one side only.
function leaves(v, path = '', out = new Map()) {
  if (v !== null && typeof v === 'object') {
    if (Array.isArray(v)) v.forEach((e, i) => leaves(e, `${path}[${i}]`, out));
    else for (const k of Object.keys(v).sort()) leaves(v[k], path === '' ? k : `${path}.${k}`, out);
    // An EMPTY object or array is itself a leaf - otherwise `{}` and a deleted
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
  console.log(`        ${d.changed.length} leaf/leaves moved · ${d.leavesBefore} leaves left, ${d.leavesAfter} right`);
}

/** The selected scene as the APP holds it - a JSON string, then parsed. */
function SCENE_JSON() {
  return String.raw`(() => {
  const raw = window.__dbg.aeon.scenesJson ? window.__dbg.aeon.scenesJson() : null;
  if (!raw) return null;
  const all = JSON.parse(raw);
  const list = Array.isArray(all) ? all : (all.scenes || []);
  return list.find((s) => s && s.id === ${JSON.stringify(SCENE_ID)}) || null;
})()`;
}

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, cmd: `${cmd} ${args.join(' ')}` };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // ═══ WHICH TREE IS ACTUALLY UNDER TEST - ASSERTED, NOT READ OFF A BANNER ═══
  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree - the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this worktree's edits. Set `
      + 'AURORA_BUILT_TREE, and give this tree a VITE_AURORA_DEBUG=1 npx electron-vite build.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone - this harness SAVES.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM. Through the override-aware `siblingPath` this
  // guard breaks BOTH ways, because AEON_DIR is always set here: it would
  // compare the clone against itself and PASS for the real tree, which is
  // failing open on the one case it guards.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), the `
      + 'owner\'s live tree. This harness SAVES - point it at a clone.');
  }

  // ── THE WORKING COPY, FRESH FOR THIS RUN. Reproducibility is the point: two
  // runs must each start from an untouched copy of the same revision.
  const WORK = join(dirname(AEONDIR), `floor-curve-run-${RUN_LABEL}-${process.pid}`);
  rmSync(WORK, { recursive: true, force: true });
  cpSync(AEONDIR, WORK, { recursive: true, dereference: false });
  const purged = stripPycache(WORK);
  note('working copy', `${WORK}\n        (copied from ${AEONDIR}; ${purged} __pycache__ dir(s) purged)`);

  const SCENE = join(WORK, SCENE_REL);

  // ── [0a] THE COMMITTED CAPTURE IS PINNED BY HASH, NOT BY PATH ─────────
  if (!existsSync(TARGET)) throw new Error(`the committed capture is missing: ${TARGET}`);
  const targetBytes = readFileSync(TARGET);
  check('0a', 'the committed capture IS the blob this harness names',
    gitBlob(targetBytes) === TARGET_BLOB,
    `git blob ${gitBlob(targetBytes)}\n        expected  ${TARGET_BLOB}`);
  const target = JSON.parse(targetBytes.toString('utf8'));

  // ── [0a2] AND IT IS aeon's REVISION, read out of the clone's OBJECT STORE
  // rather than off its working tree - a working-tree read that happened to
  // agree would pass a path check and prove nothing about the commit.
  const rev = run('git', ['rev-parse', `${AEON_REV}:${SCENE_REL}`], WORK);
  const head = run('git', ['rev-parse', 'HEAD'], WORK);
  check('0a2', `the capture is the blob aeon holds AT ${AEON_REV}, by rev-parse in the clone`,
    rev.status === 0 && rev.out.trim() === TARGET_BLOB,
    `git rev-parse ${AEON_REV}:${SCENE_REL} -> ${rev.out.trim()}\n        `
    + `capture blob ${TARGET_BLOB}\n        clone HEAD ${head.out.trim()}`);

  // ── [0b] ⚠ THE BASE ASSERTION, BEFORE ANY DIFF ────────────────────────
  // Without this, the leaf diff below compares two unrelated documents and
  // still prints something tidy.
  if (!existsSync(SCENE)) throw new Error(`the working copy does not carry ${SCENE}`);
  const baseBytes = readFileSync(SCENE);
  const base = JSON.parse(baseBytes.toString('utf8'));
  const baseDiff = leafDiff(target, base);
  printDiff('committed capture -> the working copy\'s STARTING document', baseDiff);
  check('0b', 'BASE: the working copy\'s document is LEAF-FOR-LEAF the committed capture',
    baseDiff.changed.length === 0,
    baseDiff.changed.length === 0
      ? `${baseDiff.leavesBefore} leaves, all equal`
      : `${baseDiff.changed.length} differing leaf/leaves: ${JSON.stringify(baseDiff.changed)}`);
  check('0b2', 'BASE: and byte-identical - the same git blob',
    gitBlob(baseBytes) === TARGET_BLOB,
    `clone blob ${gitBlob(baseBytes)} (${baseBytes.length} bytes)\n        `
    + `capture    ${TARGET_BLOB} (${targetBytes.length} bytes)`);

  // ── [0c] ANTI-VACUITY: the leaf this parcel moves IS THERE, AT `FROM` ──
  const baseLeaves = leaves(base);
  check('0c', `BASE: the document holds ${THE_LEAF} = ${FROM}, so "changed to ${TO}" cannot be vacuous`,
    baseLeaves.get(THE_LEAF) === FROM,
    `${THE_LEAF} = ${JSON.stringify(baseLeaves.get(THE_LEAF))}`);
  check('0c2', `BASE: and layers[${LAYER_INDEX}].fb is ${LAYER_FB} - the value the picker greys`,
    baseLeaves.get(`layers[${LAYER_INDEX}].fb`) === LAYER_FB,
    `layers[${LAYER_INDEX}].fb = ${JSON.stringify(baseLeaves.get(`layers[${LAYER_INDEX}].fb`))}`);

  // ═══ THE UI ═══════════════════════════════════════════════════════════
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  // ⚠ THE OWNER HAS A LIVE GAME WINDOW ON THE SOCKET CHAIN. Nothing here presses
  // `Build & Run` and nothing builds a ROM, but the bus client attaches to
  // whatever holds the chain, so the socket is pointed at a path that does not
  // exist for the length of this run. A connection that cannot be made cannot
  // be made to the wrong thing.
  env.ORACLE_SOCKET = `/tmp/aurora-floor-dead-${process.pid}.sock`;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  let saved = false;
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
    // a NATIVE FOLDER PICKER that CDP cannot drive. Opening a project is the
    // only step here that is not a UI gesture; everything that touches the
    // DOCUMENT is a real UI interaction.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(WORK)})`);
    await sleep(3500);
    const st = await c.json('window.__dbg.aeon.state()');
    check('1a', `the working copy opened in the app (${WORK})`, st && st.open === true, JSON.stringify(st));

    const fx = await c.json(RECT_BY(String.raw`/^Effects$/`, 'button,div,span,a'));
    if (fx === null) {
      cannotMeasure('1b', 'reach the Effects tab', 'nothing on screen reads exactly "Effects"');
    } else {
      note('Effects tab rect', `x=${fx.x} y=${fx.y} w=${fx.w} h=${fx.h} dpr=${fx.dpr} `
        + `insideScroller=${fx.insideScroller}`);
      await clickRect(c, fx);
      await sleep(1200);
      check('1b', 'the Parallax sub-tab is reachable',
        (await drive(c, 'sub-tab parallax', SUBTAB('parallax'))) === 'ok');
      await sleep(600);
    }

    // Select the scene with a REAL pointer gesture on its picker row.
    const row = await c.json(RECT_BY(new RegExp(`\\(${SCENE_ID}\\)`).toString(), 'button', 'title'));
    if (row === null) throw new Error(`the scene picker has no row for ${SCENE_ID}`);
    note('scene picker rect', `x=${row.x} y=${row.y} w=${row.w} h=${row.h} dpr=${row.dpr} `
      + `insideScroller=${row.insideScroller}`);
    const at = await clickRect(c, row);
    note('clicked the scene row at integer client px', `(${at.x}, ${at.y})`);
    await sleep(900);

    const held = await c.json(`(${SCENE_JSON()})`);
    const heldDiff = leafDiff(base, held ?? {});
    check('1c', 'the app HOLDS the document that is on disk - leaf for leaf',
      held !== null && heldDiff.changed.length === 0,
      heldDiff.changed.length === 0 ? `${heldDiff.leavesBefore} leaves, all equal`
        : `${heldDiff.changed.length} differing: ${JSON.stringify(heldDiff.changed)}`);
    await shot(c, '01-before');

    // ── [2a] WHAT THE CONTROL READS BEFORE THE GESTURE ────────────────
    const CURVE_SEL = SEL_BY_TITLE(String.raw`/^Layer 2 curve\.to\b/`);
    const allCurves = await c.json(ALL_CURVE_SELECTS);
    note('every curve picker on screen', JSON.stringify(allCurves));
    const selBefore = await c.json(READ_SELECT(CURVE_SEL));
    check('2a', `THE CONTROL: layer ${LAYER_INDEX}'s "B curve to" picker reads ${FROM}`,
      selBefore !== null && selBefore.value === FROM,
      `value ${JSON.stringify(selBefore?.value)}\n        title ${JSON.stringify(selBefore?.title)}`);

    // ── [2a2] ⚠ THE DISABLE RULE MUST BE OBSERVABLY LIVE ON THIS CONTROL
    // `FACTOR_1_32` being offered proves nothing if NOTHING is greyed - that is
    // a guard that asserts nothing. `curveFieldOptions` greys the alias class of
    // this layer's own `fb`, which is FACTOR_0, so exactly two rows must be dead
    // and their labels must SAY WHY in visible text.
    const greyed = (selBefore?.options ?? []).filter((o) => o.disabled);
    const greyedValues = greyed.map((o) => o.value).sort();
    check('2a2', 'THE PICKER\'S REFUSAL IS ALIVE: exactly the fb alias class is greyed, '
      + 'with the reason as VISIBLE LABEL TEXT',
      greyedValues.length === EXPECTED_GREYED.length
      && greyedValues.every((v, i) => v === [...EXPECTED_GREYED].sort()[i])
      && greyed.every((o) => /same as Plane B/.test(o.text)),
      `greyed ${JSON.stringify(greyedValues)} (expected ${JSON.stringify([...EXPECTED_GREYED].sort())})\n        `
      + `labels ${JSON.stringify(greyed.map((o) => o.text))}`);

    // ── [2a3] AND THE VALUE THIS PARCEL WANTS IS OFFERED AND LIVE ─────
    const wanted = (selBefore?.options ?? []).find((o) => o.value === TO);
    check('2a3', `${TO} is present in the picker and NOT disabled - it is not ${LAYER_FB}, so `
      + 'guard 4 has nothing to say about it',
      wanted !== undefined && wanted.disabled === false,
      wanted === undefined ? `${TO} is not among ${JSON.stringify((selBefore?.options ?? []).map((o) => o.value))}`
        : `disabled=${wanted.disabled} · label ${JSON.stringify(wanted.text)} · tip ${JSON.stringify(wanted.tip)}`);
    if (wanted !== undefined && wanted.disabled === true) {
      cannotMeasure('BLOCKED', `drive the picker to ${TO}`,
        `the option is DISABLED. That is a real finding, not something to route around: the `
        + `harness refuses to drive a greyed option. Reason text: ${JSON.stringify(wanted.text)}`);
    }

    // ── THE GESTURE. One control, one option. ─────────────────────────
    await drive(c, `L${LAYER_INDEX} curve.to -> ${TO}`, SET_SELECT(CURVE_SEL, TO));
    await sleep(500);

    // ── [2b] AND WHAT IT READS AFTER ──────────────────────────────────
    const selAfter = await c.json(READ_SELECT(CURVE_SEL));
    check('2b', `the picker now reads ${TO}`,
      selAfter !== null && selAfter.value === TO,
      `value ${JSON.stringify(selAfter?.value)}`);

    // ── [2c] AND THE GREYED SET FOLLOWED THE RULE, NOT THE SELECTION ──
    // `curveFieldOptions` keys off `fb`, which this gesture did not touch, so
    // the same two rows must still be dead. A greyed set that MOVED would mean
    // the rule is reading the selection instead.
    const greyedAfter = (selAfter?.options ?? []).filter((o) => o.disabled).map((o) => o.value).sort();
    check('2c', 'the greyed set did NOT move - it keys off fb, which the gesture did not touch',
      greyedAfter.length === greyedValues.length && greyedAfter.every((v, i) => v === greyedValues[i]),
      `before ${JSON.stringify(greyedValues)}\n        after  ${JSON.stringify(greyedAfter)}`);

    const preSave = await c.json(`(${SCENE_JSON()})`);
    printDiff('the working copy\'s document -> what the APP HOLDS (pre-save)', leafDiff(base, preSave ?? {}));
    await shot(c, '02-after-gesture');

    // ── SAVE ──────────────────────────────────────────────────────────
    const before = stamp(SCENE);
    note('dirty before save', String(await c.evalExpr('!!(window.__dbg.aeon.state() || {}).dirty')));
    await ctrlS(c);
    await sleep(2500);
    const after = stamp(SCENE);
    // ⚠ A SAVE THAT DID NOT MOVE THE INODE IS A FAILED ROW, NOT A QUIET PASS.
    // The save layer compares before writing, so a document equal to what is
    // on disk produces NO WRITE - and every comparison after it would be
    // reading bytes this run never authored.
    check('3a', 'THE APP WROTE THE FILE - its inode/mtime/size moved',
      after !== before, `before: ${before}\n        after:  ${after}`);
    saved = after !== before;
    await shot(c, '03-saved');

    // ── THE LEDGER. Last, so it covers every gesture above. ───────────
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

  // ═══ THE DOCUMENT, AS THE APP WROTE IT ════════════════════════════════
  if (!saved) {
    cannotMeasure('3b', 'diff the app-written document', 'the app never wrote the file');
  } else {
    const outBytes = readFileSync(SCENE);
    copyFileSync(SCENE, join(OUT_DIR, `${SCENE_ID}.json`));
    const out = JSON.parse(outBytes.toString('utf8'));
    const d = leafDiff(target, out);
    printDiff('committed capture -> the APP-WRITTEN document', d);
    const only = d.changed.length === 1 && d.changed[0].path === THE_LEAF
      && d.changed[0].from === FROM && d.changed[0].to === TO;
    check('3b', `EXACTLY ONE LEAF MOVED, AND IT IS ${THE_LEAF}: ${FROM} -> ${TO}`, only,
      `${d.changed.length} leaf/leaves moved: ${JSON.stringify(d.changed)}`);
    // A MOVE, not an add or a remove: the leaf count on both sides must match,
    // or something was created or destroyed while the one diff row still read
    // tidy.
    check('3c', 'the leaf COUNT is unchanged - nothing was added and nothing removed',
      d.leavesBefore === d.leavesAfter,
      `${d.leavesBefore} leaves before, ${d.leavesAfter} after`);
    check('3d', 'the file still parses as one scene document with the same id and 3 layers',
      out.id === SCENE_ID && Array.isArray(out.layers) && out.layers.length === 3,
      `id ${JSON.stringify(out.id)} · ${Array.isArray(out.layers) ? out.layers.length : 'no'} layers`);

    const blob = gitBlob(outBytes);
    note('THE APP-WRITTEN DOCUMENT', `git blob ${blob}\n        ${outBytes.length} bytes\n        `
      + `delivered to docs/captures/2026-09-05-floor-curve-end/${basename(OUT_DIR)}/${SCENE_ID}.json`);
    writeFileSync(join(OUT_DIR, 'blob.txt'),
      `${blob}  ${outBytes.length}  ${SCENE_ID}.json  run-${RUN_LABEL}\n`);
    console.log(`\n        ── THE FINAL JSON, IN FULL (${outBytes.length} bytes, blob ${blob}) ──`);
    console.log(outBytes.toString('utf8').replace(/^/gm, '        '));
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} rows passed · `
    + `${fails.length} failed · ${unmeasured.length} unmeasured`);
  if (fails.length) console.log(`FAILED: ${fails.join(', ')}`);
  if (unmeasured.length) console.log(`UNMEASURED: ${unmeasured.join(', ')}`);
  console.log(`working copy left in place for inspection: ${WORK}`);
  process.exitCode = (fails.length || unmeasured.length) ? 1 : 0;
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.message ?? e}`); process.exitCode = 1; });
