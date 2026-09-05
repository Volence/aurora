// ═══════════════════════════════════════════════════════════════════════════
// sec7-drop-vsplit - REMOVE ONE KEY FROM SECTION 7's SCENE, THROUGH THE REAL UI
// ═══════════════════════════════════════════════════════════════════════════
//
// ── WHAT THIS DOES ───────────────────────────────────────────────────────
//
// `games/sonic4/data/editor/effects/ojz_act1_sec7_worldwater.json` carries
// `vsplit: { at: 67 }` on layer 2 (`world_y` 162). This drives the panel's
// `B split at` picker to `none`, saves through the app, and proves the ONLY
// change to the document is that key and its parent.
//
// ── WHY THE KEY GOES ─────────────────────────────────────────────────────
//
// A scene-level `vsplit` is the one layer attachment that does NOT ride the
// lowered `SceneCfgN` record. It lowers to a RASTER PROGRAM, and that program
// exists only if a hand-written call site names the scene:
// `scene_vsplit_fires(<Scene>)`. That call site exists for
// `Scene_Editor_ojz_act1_depth` and NOT for this scene, so the attachment
// reaches ZERO ROM BYTES. aeon's own `tools/test_vsplit_consumer_lint.py`
// carries the scene in `KNOWN_UNBOUND` for exactly this reason. Section 7's
// working split comes from the engine lane's hand-authored channel 3, which is
// a different mechanism; the key is inert and the document claims otherwise.
//
// ⚠ IT WAS NOT AN AUTHORING ERROR, and nothing here says it was. From inside
// the editor an effect the section ALREADY HAS and one the scene DECLARES look
// identical. That is a separate, already-booked defect. This harness adds no
// warning, no refusal and no advisory: it removes one key.
//
// ── DISTRUST A CLEAN RESULT ──────────────────────────────────────────────
//
// Both halves of this parcel produce a TIDY answer when they are measuring the
// wrong subject, so each one is fenced:
//
//   THE DOCUMENT. "only that key changed" is also what comparing two unrelated
//   documents prints. So `[0b]` asserts the working copy's starting file is
//   LEAF-FOR-LEAF the committed capture, and `[0c]` asserts that base actually
//   HOLDS `layers[2].vsplit.at` - without which "removed" is vacuously true.
//
//   THE ROM. The key is inert, so BEFORE and AFTER should hash the same. That
//   identity is the EVIDENCE - but a stale ROM gives the identical md5 and
//   means the opposite. So: the build's EXIT CODE is checked before anything is
//   hashed (`[R3a]`), the ROM is asserted NEWER than the generated `.emp` it
//   was built from (`[R3b]`), a no-change rebuild is run as a determinism
//   control (`[R1]`), and the generator is asked to CONFIRM DRIFT (`[R2a]`)
//   before it is allowed to regenerate - a generator that saw no change would
//   emit the same `.emp` and hand back the same ROM for the wrong reason.
//
// ── A TRAP THIS RIG WALKED INTO AND NOW DEFUSES ──────────────────────────
//
// `cp -a` on an aeon tree that has already run pytest copies `tools/__pycache__`,
// and the pytest-rewritten `.pyc` there records `co_filename` pointing at the
// tree it was COMPILED IN. The copy then executes the copy's own data while
// every traceback line names the ORIGINAL tree - a red result that reads as
// "you measured the wrong tree" when the values are in fact right. Measured
// here: `probe-aeon/tools/__pycache__/…-pytest-9.1.1.pyc -> …/suite/aeon/…`
// while `module.REPO` was `…/suite/probe-aeon`. The working copy is therefore
// stripped of `__pycache__` before anything runs in it.
//
// ── RUN ──────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a WRITABLE aeon CLONE, under a suite root with its peers> \
//   SIGIL_BUILD=<sigil/target/release/sigil> \
//   SIGIL_EMIT=<sigil/target/release/emit_sound_blob> \
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:sec7-drop-vsplit
//
// Never against the live aeon checkout: this harness SAVES and BUILDS.

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

const PORT = Number(process.env.PORT ?? 9537);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

// ⚠ THROUGH THE RESOLVER, NEVER OFF `process.env`. This harness SAVES and
// BUILDS, so it genuinely REQUIRES an explicit override.
const AEONDIR = checkoutOverride('aeon')?.value ?? '';

// These two name EXECUTABLES on this machine, not suite checkouts - the same
// class as `ELECTRON_BIN`, which lib/run-root.mjs reads directly and which is
// deliberately outside the resolver's `OWNED_ENV` for that reason.
const SIGIL_BUILD = process.env.SIGIL_BUILD ?? '';
const SIGIL_EMIT = process.env.SIGIL_EMIT ?? '';

const SCENE_ID = 'ojz_act1_sec7_worldwater';
const SCENE_REL = join('games/sonic4/data/editor/effects', `${SCENE_ID}.json`);
const GENERATED_REL = 'games/sonic4/data/generated/ojz/act1/effects_scenes.emp';
const ROM_REL = 's4.bin';

/** The committed capture the base is asserted against, and the blob pinning it. */
const TARGET = join(ROOT, 'docs/captures/2026-09-05-sec7-final', `${SCENE_ID}.json`);
const TARGET_BLOB = '3ff07f9bfb51393ba7003699eeb11d799879b682';
/** The leaf this parcel removes, and the only one that may move. */
const THE_LEAF = 'layers[2].vsplit.at';

/** Where the app-written document is delivered, EXACTLY AS SAVED. */
const OUT_DIR = join(ROOT, 'docs/captures/2026-09-05-sec7-vsplit-removed');

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

/** git's own blob id, so the base is pinned to a hash and not to a path. */
function gitBlob(buf) {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}
function md5(p) { return createHash('md5').update(readFileSync(p)).digest('hex'); }
function stamp(p) {
  if (!existsSync(p)) return 'ABSENT';
  const s = statSync(p);
  return `ino=${s.ino} mtimeMs=${Math.round(s.mtimeMs)} size=${s.size}`;
}
const mtimeMs = (p) => statSync(p).mtimeMs;
const iso = (ms) => new Date(ms).toISOString();

/**
 * ⚠ STRIP `__pycache__` FROM A COPIED TREE. See the trap block at the top: a
 * pytest-rewritten `.pyc` carries the path of the tree it was compiled in, so a
 * copy runs its own data while every traceback names the original.
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
// description after the field name, so `/^Layer 2 vsplit.at$/` matches nothing
// while looking like a dead control.
const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;
const NUM_BY_TITLE = (re) => `[...document.querySelectorAll('input[type=number]')].find((e) => ${re}.test(e.title || ''))`;

/**
 * Drive a `<select>` the way React sees it: the NATIVE value setter, then the
 * events the app listens for. `el.value = x` sets the property React already
 * owns and fires nothing, and `.click()` is not a gesture on a select at all.
 */
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

/** What a control CURRENTLY reads, off the live DOM - a measurement, not a guess. */
const READ_SELECT = (selector) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return null;
  return { value: el.value, options: [...el.options].map((o) => o.value), title: el.title || '' };
})()`;
const READ_NUMBER = (selector) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return null;
  return { value: el.value, title: el.title || '' };
})()`;

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
// "only that key changed" a MEASUREMENT rather than an eyeball over two
// pretty-prints: key ORDER, whitespace and a re-serialised number all wash out,
// and an added or removed key is caught as a leaf that exists on one side only.
function leaves(v, path = '', out = new Map()) {
  if (v !== null && typeof v === 'object') {
    if (Array.isArray(v)) v.forEach((e, i) => leaves(e, `${path}[${i}]`, out));
    else for (const k of Object.keys(v).sort()) leaves(v[k], path === '' ? k : `${path}.${k}`, out);
    // An EMPTY object or array is itself a leaf - otherwise `{}` and a deleted
    // key are indistinguishable and a real removal would diff as nothing. That
    // matters exactly here: the parent `vsplit` must GO, not become `{}`.
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

// ── THE aeon SIDE: build, regenerate, lint ────────────────────────────────

function run(cmd, args, cwd, extraEnv = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  });
  return {
    status: r.status, ms: Date.now() - t0,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    cmd: `${cmd} ${args.join(' ')}`,
  };
}

/**
 * One aeon build. `-nl` skips the tool-suite pytest lane, which CANNOT run in a
 * `git clone`: several of its files import out-of-repo DONOR artifacts that are
 * untracked in aeon and therefore absent from any clone (measured: 31 failed /
 * 7 errors, every one a `FileNotFoundError` on a donor, in the UNMODIFIED
 * clone). That is a STAGE limit and it is reported as one - the vsplit lint
 * itself needs no donor and is run separately, on both sides.
 */
function aeonBuild(dir, log) {
  const r = run('./build.sh', ['sonic4', '-nl'], dir,
    { SIGIL_BUILD, SIGIL_EMIT });
  writeFileSync(log, `$ ${r.cmd}\n(exit ${r.status}, ${r.ms} ms)\n\n${r.out}`);
  return r;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // ═══ WHICH TREE IS ACTUALLY UNDER TEST - ASSERTED, NOT READ OFF A BANNER ═══
  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree - the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this worktree's edits. Set `
      + 'AURORA_BUILT_TREE, and give this tree a VITE_AURORA_DEBUG=1 npm run build.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);

  if (AEONDIR === '' || !existsSync(AEONDIR)) {
    throw new Error('AEON_DIR must name a WRITABLE aeon clone - this harness SAVES and BUILDS.');
  }
  // ⚠ THE DEFAULT-LOCATION FORM. Through the override-aware `siblingPath` this
  // guard breaks BOTH ways, because AEON_DIR is always set here: it would
  // compare the clone against itself and PASS for the real tree, which is
  // failing open on the one case it guards.
  const liveAeon = siblingDefaultPathOrUnresolved('aeon');
  if (resolve(AEONDIR) === resolve(liveAeon)) {
    throw new Error(`Refusing: the override names aeon's DEFAULT checkout (${liveAeon}), the `
      + 'owner\'s live tree. This harness SAVES and BUILDS - point it at a clone.');
  }

  // ── THE WORKING COPY. A SIBLING of the clone, so the suite-root marker walk
  // above it still finds the peer checkouts aeon's tools require; a copy under
  // a bare `mktemp -d` has no suite root and aeon's tool lane refuses there.
  const WORK = join(dirname(AEONDIR), `sec7-drop-run-${process.pid}`);
  rmSync(WORK, { recursive: true, force: true });
  cpSync(AEONDIR, WORK, { recursive: true, dereference: false });
  const purged = stripPycache(WORK);
  note('working copy', `${WORK}\n        (copied from ${AEONDIR}; ${purged} __pycache__ dir(s) purged - `
    + 'a pytest-rewritten .pyc names the tree it was COMPILED in, so a copy runs its own data '
    + 'while every traceback names the original)');

  const SCENE = join(WORK, SCENE_REL);
  const GENERATED = join(WORK, GENERATED_REL);
  const ROM = join(WORK, ROM_REL);
  const LOGS = join(OUT_DIR, 'logs');
  mkdirSync(LOGS, { recursive: true });

  // ── [0a] THE COMMITTED CAPTURE IS PINNED BY HASH, NOT BY PATH ─────────
  if (!existsSync(TARGET)) throw new Error(`the committed capture is missing: ${TARGET}`);
  const targetBytes = readFileSync(TARGET);
  check('0a', 'the committed capture IS the blob the dispatch names',
    gitBlob(targetBytes) === TARGET_BLOB,
    `git blob ${gitBlob(targetBytes)}\n        expected  ${TARGET_BLOB}`);
  const target = JSON.parse(targetBytes.toString('utf8'));

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
    `clone blob ${gitBlob(baseBytes)}\n        capture    ${TARGET_BLOB}`);

  // ── [0c] ANTI-VACUITY: the key this parcel removes IS THERE to remove ──
  check('0c', `BASE: the document actually holds ${THE_LEAF}, so "removed" cannot be vacuous`,
    leaves(base).has(THE_LEAF),
    `${THE_LEAF} = ${JSON.stringify(leaves(base).get(THE_LEAF))}`);

  // ═══ THE ROM, BEFORE ══════════════════════════════════════════════════
  let romBefore = null;
  const haveSigil = SIGIL_BUILD !== '' && existsSync(SIGIL_BUILD)
    && SIGIL_EMIT !== '' && existsSync(SIGIL_EMIT);
  if (!haveSigil) {
    cannotMeasure('R0', 'build the BEFORE ROM',
      'SIGIL_BUILD / SIGIL_EMIT do not both name an existing file; aeon\'s build.sh requires them');
  } else {
    const b0 = aeonBuild(WORK, join(LOGS, 'build-before.log'));
    // ⚠ EXIT CODE FIRST. A hash read after a NON-ZERO build hashes the STALE
    // artifact and looks exactly like "nothing changed".
    check('R0', 'BEFORE: the baseline build succeeded', b0.status === 0,
      `exit ${b0.status} in ${b0.ms} ms · log docs/captures/…/logs/build-before.log`);
    if (b0.status === 0) {
      romBefore = { md5: md5(ROM), mtimeMs: mtimeMs(ROM), size: statSync(ROM).size };
      check('R0b', 'BEFORE: the ROM is NEWER than the generated effects module it was built from',
        romBefore.mtimeMs > mtimeMs(GENERATED),
        `s4.bin ${iso(romBefore.mtimeMs)}\n        ${GENERATED_REL} ${iso(mtimeMs(GENERATED))}`);
      note('BEFORE ROM', `md5 ${romBefore.md5} · ${romBefore.size} bytes · ${iso(romBefore.mtimeMs)}`);

      // ── [R1] THE DETERMINISM CONTROL ────────────────────────────────
      // Everything below turns on "the ROM did not change". That reading is
      // only available if a rebuild with NO input change is byte-identical AND
      // still moves the file's mtime - which is also what separates "inert
      // key" from "the build never ran".
      const b1 = aeonBuild(WORK, join(LOGS, 'build-control.log'));
      check('R1', 'CONTROL: a rebuild with NO input change is byte-identical AND moves the mtime',
        b1.status === 0 && md5(ROM) === romBefore.md5 && mtimeMs(ROM) > romBefore.mtimeMs,
        `exit ${b1.status} · md5 ${md5(ROM)} (was ${romBefore.md5}) · `
        + `mtime ${iso(mtimeMs(ROM))} (was ${iso(romBefore.mtimeMs)})`);
      romBefore.mtimeMs = mtimeMs(ROM);
    }
  }

  // ── THE VSPLIT LINT, BEFORE. Needs no donor, so it runs in a clone. ────
  const lintBefore = run('python3',
    ['-m', 'pytest', 'tools/test_vsplit_consumer_lint.py', '-q', '--no-header', '-p', 'no:cacheprovider'],
    WORK);
  writeFileSync(join(LOGS, 'vsplit-lint-before.log'), lintBefore.out);
  check('L0', 'BEFORE: aeon\'s vsplit-consumer lint is GREEN, with the scene under quarantine',
    lintBefore.status === 0 && /VSPLIT-NO-OP quarantine: Scene_Editor_ojz_act1_sec7_worldwater/.test(lintBefore.out),
    `exit ${lintBefore.status} · ${(lintBefore.out.match(/^\d+ passed.*$/m) ?? ['(no summary)'])[0]}`);

  // ═══ THE UI ═══════════════════════════════════════════════════════════
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
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
    const VSPLIT_SEL = SEL_BY_TITLE(String.raw`/^Layer 2 vsplit\.at\b/`);
    const VSPLIT_NUM = NUM_BY_TITLE(String.raw`/^Layer 2 vsplit\.at \(/`);
    const TOP_NUM = NUM_BY_TITLE(String.raw`/^Layer 2 (Screen line|world_y)\b/`);
    const selBefore = await c.json(READ_SELECT(VSPLIT_SEL));
    const numBefore = await c.json(READ_NUMBER(VSPLIT_NUM));
    const topBefore = await c.json(READ_NUMBER(TOP_NUM));
    check('2a', 'THE CONTROL: layer 2\'s "B split at" picker reads "at", with its row spinner beside it',
      selBefore !== null && selBefore.value === 'at' && numBefore !== null && numBefore.value === '67',
      `select ${JSON.stringify(selBefore)}\n        spinner ${JSON.stringify(numBefore)}`);
    note('layer 2 top box BEFORE the gesture', JSON.stringify(topBefore));

    // ── THE GESTURE. One control, one option. ─────────────────────────
    await drive(c, 'L2 vsplit -> none', SET_SELECT(VSPLIT_SEL, 'none'));
    await sleep(500);

    // ── [2b] AND WHAT IT READS AFTER ──────────────────────────────────
    const selAfter = await c.json(READ_SELECT(VSPLIT_SEL));
    const numAfter = await c.json(READ_NUMBER(VSPLIT_NUM));
    const topAfter = await c.json(READ_NUMBER(TOP_NUM));
    check('2b', 'the picker now reads "none" and the row spinner has LEFT the DOM',
      selAfter !== null && selAfter.value === 'none' && numAfter === null,
      `select ${JSON.stringify(selAfter)}\n        spinner ${JSON.stringify(numAfter)}`);

    // ⚠ THE KNOWN CLAMP, MEASURED ON BOTH SIDES OF THE GESTURE. `clampLayerTop`
    // narrows a locked scene's layer top to `3+v_offset .. 223+v_offset` for a
    // layer that EMITS A FIRE - 291..511 here - and this layer holds 162.
    // Removing the split RELEASES that narrowing, so the risk is the reverse of
    // the authoring order hazard: nothing may re-clamp `world_y` on the way out.
    note('layer 2 top box AFTER the gesture', JSON.stringify(topAfter));
    check('2c', 'THE CLAMP DID NOT MOVE THE TOP: layer 2 still reads 162 after the split is dropped',
      topAfter !== null && topAfter.value === '162',
      `top box now ${JSON.stringify(topAfter?.value)}; its advertised bound went\n        `
      + `${JSON.stringify(topBefore?.title)}\n        -> ${JSON.stringify(topAfter?.title)}`);

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
  const outBytes = readFileSync(SCENE);
  copyFileSync(SCENE, join(OUT_DIR, `${SCENE_ID}.json`));
  const d = leafDiff(target, JSON.parse(outBytes.toString('utf8')));
  printDiff('committed capture -> the APP-WRITTEN document', d);
  const only = d.changed.length === 1 && d.changed[0].path === THE_LEAF
    && d.changed[0].to === '(absent)';
  check('3b', `THE ONLY CHANGE IS ${THE_LEAF} AND ITS PARENT`, only,
    `${d.changed.length} leaf/leaves moved: ${JSON.stringify(d.changed)}\n        `
    + `${d.leavesBefore} leaves before, ${d.leavesAfter} after`);
  // The parent must be GONE, not `{}` - `leaves()` emits an empty object as its
  // own leaf, so an emptied parent would show as `layers[2].vsplit: "{}"`.
  const after = leaves(JSON.parse(outBytes.toString('utf8')));
  check('3c', 'the parent `vsplit` key is GONE, not left as an empty object',
    ![...after.keys()].some((k) => k.startsWith('layers[2].vsplit')),
    `remaining layers[2] leaves: ${JSON.stringify([...after.keys()].filter((k) => k.startsWith('layers[2]')))}`);
  check('3d', 'layer 2 still holds world_y 162 on disk - the clamp did not follow the removal',
    after.get('layers[2].world_y') === 162, `layers[2].world_y = ${after.get('layers[2].world_y')}`);
  note('the app-written blob', `${gitBlob(outBytes)}  (delivered to docs/captures/`
    + `${basename(OUT_DIR)}/${SCENE_ID}.json)`);

  if (!saved) {
    cannotMeasure('R2', 'measure the ROM after the removal', 'the app never wrote the file');
  } else if (!haveSigil || romBefore === null) {
    cannotMeasure('R2', 'measure the ROM after the removal',
      'there is no BEFORE ROM to compare against (see [R0])');
  } else {
    // ── [R2a] THE GENERATOR MUST SEE THE CHANGE ────────────────────────
    // Its drift gate answering OK here would mean the ROM identity below came
    // from a generator that never read the edit - the same md5 for the exactly
    // wrong reason.
    const chk = run('python3', ['tools/effects_gen.py', 'check'], WORK);
    check('R2a', 'aeon\'s effects drift gate SEES the removal - it reports DRIFT, not OK',
      chk.status !== 0 && /DRIFT/.test(chk.out), `exit ${chk.status}\n        ${chk.out.trim().split('\n')[0]}`);

    const empBefore = readFileSync(GENERATED, 'utf8');
    const emit = run('python3', ['tools/effects_gen.py', 'emit'], WORK);
    // The staleness stamp is the other half of a re-bake: a content manifest of
    // the editor sources, and the build refuses without it. For an
    // effects-only edit these two ARE the re-bake - `tools/regenerate-level.sh`
    // runs `effects_gen.py emit` then `level_staleness.py --stamp sonic4`, and
    // its other generators consume out-of-repo donors and read no scene
    // document at all.
    const stampR = run('python3', ['tools/level_staleness.py', '--stamp', 'sonic4'], WORK);
    check('R2b', 'the effects half of a re-bake ran (emit + editor-source stamp)',
      emit.status === 0 && stampR.status === 0,
      `emit exit ${emit.status} · stamp exit ${stampR.status}`);

    const empAfter = readFileSync(GENERATED, 'utf8');
    const empChanged = empBefore.split('\n')
      .map((l, i) => [l, empAfter.split('\n')[i]])
      .filter(([a, b]) => a !== b);
    check('R2c', 'exactly ONE line of the generated scene module moved, and it is that layer\'s',
      empChanged.length === 1 && /vsplit: SceneVSplit\.At\(67\)/.test(empChanged[0][0])
      && !/vsplit/.test(empChanged[0][1] ?? ''),
      empChanged.map(([a, b]) => `- ${a.trim()}\n        + ${(b ?? '(absent)').trim()}`).join('\n        '));

    // ── [R3] THE ROM AFTER ─────────────────────────────────────────────
    const b2 = aeonBuild(WORK, join(LOGS, 'build-after.log'));
    check('R3a', 'AFTER: the build succeeded - checked BEFORE anything is hashed',
      b2.status === 0, `exit ${b2.status} in ${b2.ms} ms · log docs/captures/…/logs/build-after.log`);
    if (b2.status !== 0) {
      cannotMeasure('R3c', 'compare the ROMs',
        'the AFTER build was RED, so s4.bin is the PREVIOUS build\'s artifact and its hash would '
        + 'be a stale ROM read as "nothing changed"');
    } else {
      // ⚠ THE FRESHNESS PROOF. A stale ROM and an inert key give the SAME md5
      // and mean opposite things, so the artifact is asserted newer than the
      // generated module it was built from before the hashes are compared.
      const romAfter = { md5: md5(ROM), mtimeMs: mtimeMs(ROM), size: statSync(ROM).size };
      check('R3b', 'AFTER: the ROM is NEWER than the regenerated effects module, and newer than '
        + 'the BEFORE ROM - so it is this build\'s artifact',
        romAfter.mtimeMs > mtimeMs(GENERATED) && romAfter.mtimeMs > romBefore.mtimeMs,
        `s4.bin        ${iso(romAfter.mtimeMs)}\n        `
        + `${GENERATED_REL} ${iso(mtimeMs(GENERATED))}\n        `
        + `BEFORE s4.bin ${iso(romBefore.mtimeMs)}`);
      // ⚠ THE EXPECTED RESULT IS IDENTITY, AND IT IS THE EVIDENCE. The
      // attachment reaches no ROM byte, so the ROM must not move. The rows
      // above are what make that reading available.
      check('R3c', 'THE ROM IS UNCHANGED - the removed key reached no ROM byte, which is the '
        + 'whole reason it goes',
        romAfter.md5 === romBefore.md5 && romAfter.size === romBefore.size,
        `before ${romBefore.md5} (${romBefore.size} B)\n        after  ${romAfter.md5} (${romAfter.size} B)`);
    }

    // ── [L1] THE QUARANTINE ARM THIS CLOSES ────────────────────────────
    const lintAfter = run('python3',
      ['-m', 'pytest', 'tools/test_vsplit_consumer_lint.py', '-q', '--no-header', '-p', 'no:cacheprovider'],
      WORK);
    writeFileSync(join(LOGS, 'vsplit-lint-after.log'), lintAfter.out);
    // REPORTED, NOT ASSERTED GREEN: the lint going RED here is the quarantine
    // doing its job - it FORCES the `KNOWN_UNBOUND` entry to be deleted in the
    // same change that resolves the scene. That deletion is aeon's, not this
    // parcel's, and this row is the evidence it is now owed.
    check('L1', 'REPORTED, NOT ASSERTED GREEN: the quarantine entry now FAILS its own lint, which '
      + 'is how it forces its deletion in the change that resolves the scene',
      lintAfter.status !== 0
      && /test_quarantine_entries_still_author_a_vsplit/.test(lintAfter.out),
      `exit ${lintAfter.status} · ${(lintAfter.out.match(/^\d+ failed.*$/m) ?? ['(no summary)'])[0]}\n        `
      + 'aeon must delete KNOWN_UNBOUND["Scene_Editor_ojz_act1_sec7_worldwater"] from '
      + 'tools/test_vsplit_consumer_lint.py in the same change.');
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
