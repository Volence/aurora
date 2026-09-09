// ═══════════════════════════════════════════════════════════════════════════
// save-contract — THE FOUR HALVES OF THE SAVE CONTRACT, DRIVEN
// ═══════════════════════════════════════════════════════════════════════════
//
// ── WHAT THIS MEASURES ───────────────────────────────────────────────────
//
// Two UX seats walked the app on 2026-09-07 without being able to see each
// other and converged on the save contract
// (docs/reviews/2026-09-09-uxpair-reconciliation.md C1; the seats' own reports
// are uxa-walk.md F2 and uxb-audit.md F2/F3/F7/F9). The packet is
// docs/reviews/2026-09-09-save-contract.md and it names each receipt R1..R5;
// the row ids below carry those names.
//
// ⚠ WHY THIS EXISTS BESIDE A UNIT SUITE. The node rows in
// src/renderer/shell/__tests__/save-contract.test.ts assert the STORE and the
// PURE RULES. They cannot assert that a Ctrl+S keystroke reaches a handler at
// all — the platform decides that — and they cannot read the accessibility
// tree of a rendered tab strip. Both receipts came from a UI walk and both are
// measured here, on a real window, with real Input.dispatch* events.
//
// ⚠ FOUR PREDICATES, AND THEY ARE NOT SYNONYMS. Every row below says which one
// it reads, because a control that confirms one while the instrument keys on
// another passes and proves nothing:
//
//   (a) THE STORE BELIEVES  — window.__dbg.aeon.state().dirty / dirtyActs
//   (b) THE SCREEN SHOWS    — a DOM element a person can see
//   (c) A TOOL CAN READ IT  — an ACCESSIBLE NAME (aria-label), not a `title`.
//                             A `title` is a hover. Scanning for it would be
//                             green before the fix and prove nothing.
//   (d) THE BYTES MOVED     — statSync on the file in the clone.
//
// ── RUN ──────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   ELECTRON_BIN=<a checkout with node_modules>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:save-contract
//
// AEON_DIR is OPTIONAL and, when set, is only ever READ: this harness clones
// into mktemp and the app never opens the resolved tree.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { existsSync, statSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9561);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;

/** aeon, THROUGH THE RESOLVER — read-only. Never opened by the app. */
const AEON_SRC = siblingPathOrUnresolved('aeon');

const ZONE = 'ojz';
const ACT = 'act1';
const ACT_EDITOR_REL = `games/sonic4/data/editor/${ZONE}/${ACT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURED  [${id}] ${name}\n        ${why}`);
  unmeasured.push(`[${id}] ${name} — ${why}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
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
/** THE GESTURE UNDER TEST. modifiers=2 is Ctrl, and it is a REAL key event: a
 *  synthetic one the app ignores would no-op and read as "not reproduced". */
const ctrlS = (c) => key(c, 's', 'KeyS', 83, 2);

/**
 * A REAL POINTER TARGET, measured immediately before the press. The rect comes
 * back so the caller dispatches at INTEGER client pixels (dpr varies run to run
 * on this box), and a coordinate measured in an EARLIER step lands somewhere
 * else the moment a panel reflows.
 */
const RECT_BY = (re, tag = 'button', attr = 'text') => String.raw`
(() => {
  const read = (e) => ${attr === 'title' ? '(e.getAttribute("title") || "")'
    : '(((e.textContent || "") + " " + (e.getAttribute("aria-label") || "")).trim())'};
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})].find((e) => ${re}.test(read(e)));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, disabled: !!el.disabled,
           dpr: window.devicePixelRatio };
})()`;

/** PREDICATE (b): the dirty marker AS THE SCREEN HOLDS IT, plus its size. */
const DOT_ON_SCREEN = String.raw`
(() => {
  const els = [...document.querySelectorAll('[role="tablist"] span')]
    .filter((s) => /unsaved/i.test(s.getAttribute('title') || ''));
  return els.map((s) => {
    const r = s.getBoundingClientRect();
    return { title: s.getAttribute('title'), w: Math.round(r.width), h: Math.round(r.height) };
  });
})()`;

/**
 * PREDICATE (c): the WHOLE DOCUMENT scanned for an ACCESSIBLE NAME that says
 * unsaved. Deliberately NOT a `title` scan: a title is a hover, it was already
 * there before the fix, and a row that counted it would be green over the
 * defect. This is seat B's own instrument, narrowed to the predicate that
 * matters.
 */
const UNSAVED_ACCESSIBLE_NAMES = String.raw`
(() => [...document.querySelectorAll('*')]
  .filter((e) => /unsaved/i.test(e.getAttribute('aria-label') || ''))
  .map((e) => ({ tag: e.tagName, role: e.getAttribute('role'), name: e.getAttribute('aria-label') })))()`;

/** Every toast currently on screen, by its text. PREDICATE: the app told a person. */
const TOASTS = String.raw`
(() => [...document.querySelectorAll('*')]
  .filter((e) => e.children.length === 0 && /Ctrl\+S wrote nothing/.test(e.textContent || ''))
  .map((e) => (e.textContent || '').trim()))()`;

/** THE GESTURE LEDGER — the last row asserts every drive found its control. */
const driven = [];
async function clickRect(c, rect) {
  const x = Math.round(rect.x + rect.w / 2);
  const y = Math.round(rect.y + rect.h / 2);
  await mouse(c, 'mousePressed', x, y);
  await mouse(c, 'mouseReleased', x, y);
  return { x, y };
}
async function pressBy(c, label, re, tag, attr) {
  const r = await c.json(RECT_BY(re, tag, attr));
  driven.push({ label, found: r !== null });
  if (r === null) { note(`gesture "${label}" found NO control`, `${re}`); return null; }
  const at = await clickRect(c, r);
  await sleep(700);
  return { at, rect: r };
}

async function main() {
  // ═══ WHICH TREE IS ACTUALLY UNDER TEST — ASSERTED, NOT READ OFF A BANNER ═══
  if (RUN.borrowed) {
    throw new Error('REFUSING: the run root was BORROWED, not this tree — the app under test '
      + `would be ${RUN.root}, whose dist/ does not contain this worktree's edits. Set `
      + 'AURORA_BUILT_TREE, and give this tree a VITE_AURORA_DEBUG=1 npm run build.');
  }
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}.`);
  }
  note('run root', `${RUN.root} · borrowed=${RUN.borrowed === true} · electron=${ELECTRON}`);
  assertFreshBuild(RUN);
  assertDebugBuild(RUN);

  if (!existsSync(AEON_SRC)) {
    throw new Error(`aeon did not resolve to an existing tree (${AEON_SRC}) — this harness needs `
      + 'a project to clone. Set AEON_DIR or EMPYREAN_SUITE_ROOT.');
  }

  // ── THE CLONE. The app opens THIS and never the resolved tree.
  const WORK = mkdtempSync(join(tmpdir(), 'save-contract-'));
  const CLONE = join(WORK, 'clone');
  mkdirSync(CLONE, { recursive: true });
  for (const rel of ['project.json', 'games']) {
    cpSync(join(AEON_SRC, rel), join(CLONE, rel), { recursive: true, dereference: false });
  }
  note('working copy', `${CLONE}\n        cloned (READ-ONLY) from ${AEON_SRC}`);

  // ── [0a] THE BOUNDARY, stamped for [6a].
  const srcActDir = join(AEON_SRC, ACT_EDITOR_REL);
  const srcNames = ['section_0.objects.json', 'section_4.objects.json'];
  const srcStamps = srcNames.map((f) => `${f}: ${stamp(join(srcActDir, f))}`);
  check('0a', 'the app will open a CLONE under mktemp, never the resolved aeon tree',
    resolve(CLONE).startsWith(resolve(tmpdir())) && resolve(CLONE) !== resolve(AEON_SRC),
    `clone ${CLONE}\n        source ${AEON_SRC} (stamped for [6a])\n        ${srcStamps.join('\n        ')}`);

  // ── [0b] ANTI-VACUITY: the file whose bytes row [2a] watches must be there
  //        BEFORE anything is driven. An absence proves nothing against a
  //        directory that never had the file.
  const objectsFile = join(CLONE, ACT_EDITOR_REL, 'section_0.objects.json');
  check('0b', 'the act file the save must write EXISTS in the clone before a gesture is driven',
    existsSync(objectsFile), `${objectsFile}: ${stamp(objectsFile)}`);

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
    // a NATIVE FOLDER PICKER, which is invisible to this rig
    // (docs/reviews/2026-09-09-rig-native-dialog-blindspot.md): pressable, no
    // crash, nothing appears, promise never settles. Nothing below that touches
    // the SAVE CONTRACT uses `__dbg` to act — every placement, every close,
    // every undo and every Ctrl+S is a real input event.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(CLONE)})`);
    for (let i = 0; i < 60; i++) {
      const s = await c.json('window.__dbg.aeon.state()');
      if (s && s.open) break;
      await sleep(300);
    }
    const opened = await c.json('window.__dbg.aeon.state()');
    check('0c', 'the clone opened and the act tab is up', opened && opened.open === true
      && opened.zone === ZONE && opened.act === ACT, JSON.stringify(opened));
    if (!opened || !opened.open) throw new Error('the clone did not open; nothing below is measurable');
    await sleep(1200);

    const objectCount = async () => c.evalExpr(
      '(() => { let n = 0; for (let i = 0; i < 200; i++) { '
      + 'if (window.__dbg.aeon.objectAt(0, i)) n++; else break; } return n; })()');

    /** Arm Place Object on the Objects facet and press the map. A REAL click. */
    async function placeObject(label, x, y) {
      await pressBy(c, `${label}: Objects facet`, String.raw`/^Objects$/`, 'button', 'text');
      await pressBy(c, `${label}: Place Object tool`, String.raw`/^Place Object$/`, 'button', 'title');
      await pressBy(c, `${label}: spring type`, String.raw`/^spring: /`, 'button', 'title');
      const before = await objectCount();
      await mouse(c, 'mousePressed', x, y);
      await mouse(c, 'mouseReleased', x, y);
      await sleep(1200);
      const after = await objectCount();
      driven.push({ label: `${label}: map press`, found: after > before });
      return { before, after };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [1] THE STATE IS VISIBLE, AND READABLE BY SOMETHING OTHER THAN A MOUSE
    //     Receipt R3 (uxb F3: a full-DOM scan for an unsaved marker returns []).
    // ═══════════════════════════════════════════════════════════════════════
    const placed = await placeObject('1', 700, 420);
    const state1 = await c.json('window.__dbg.aeon.state()');
    check('1a', 'a placed object makes the STORE dirty (predicate a)',
      placed.after === placed.before + 1 && state1.dirty === true
      && state1.dirtyActs.includes(`${ZONE}/${ACT}`),
      `objects ${placed.before} -> ${placed.after}; dirtyActs ${JSON.stringify(state1.dirtyActs)}`);

    const dots = await c.json(DOT_ON_SCREEN);
    check('1b', 'and the tab strip SHOWS a marker (predicate b)',
      Array.isArray(dots) && dots.length === 1, JSON.stringify(dots));

    const names = await c.json(UNSAVED_ACCESSIBLE_NAMES);
    check('1c', 'R3: and the marker has an ACCESSIBLE NAME, so a screen reader and a DOM '
      + 'scan can both find the state (predicate c, NOT the title)',
      Array.isArray(names) && names.length >= 1 && names.some((n) => /unsaved/i.test(n.name)),
      `aria-labels matching /unsaved/i: ${JSON.stringify(names)}\n        `
      + `(before the fix this list was [] while ${JSON.stringify(dots)} was on screen)`);

    // ═══════════════════════════════════════════════════════════════════════
    // [2] CTRL+S ON THE LEVEL TAB REACHES DISK
    //     Receipt R1, and the row that RE-SCOPES the reconciliation's
    //     "Ctrl+S is a silent no-op on a level surface": with the level tab
    //     ACTIVE it is not.
    // ═══════════════════════════════════════════════════════════════════════
    const beforeSave = stamp(objectsFile);
    await ctrlS(c);
    await sleep(3000);
    const afterSave = stamp(objectsFile);
    const state2 = await c.json('window.__dbg.aeon.state()');
    check('2a', 'R1: Ctrl+S with the level tab active MOVES THE BYTES (predicate d) and '
      + 'clears the store (predicate a)',
      afterSave !== beforeSave && state2.dirty === false && state2.dirtyActs.length === 0,
      `${objectsFile}\n        before: ${beforeSave}\n        after:  ${afterSave}\n        `
      + `state: ${JSON.stringify(state2)}`);
    const dotsAfterSave = await c.json(DOT_ON_SCREEN);
    check('2b', 'and the marker leaves the screen (predicate b)',
      Array.isArray(dotsAfterSave) && dotsAfterSave.length === 0, JSON.stringify(dotsAfterSave));

    // ═══════════════════════════════════════════════════════════════════════
    // [3] UNDOING BACK TO THE SAVED POINT CLEARS THE DOT
    //     Receipt R5 (uxb F9).
    // ═══════════════════════════════════════════════════════════════════════
    const placed3 = await placeObject('3', 760, 460);
    const state3a = await c.json('window.__dbg.aeon.state()');
    check('3a', 'one more placement is dirty again', state3a.dirty === true,
      `objects ${placed3.before} -> ${placed3.after}; ${JSON.stringify(state3a.dirtyActs)}`);

    await pressBy(c, '3: Undo', String.raw`/^Undo$/`, 'button', 'text');
    await sleep(900);
    const state3b = await c.json('window.__dbg.aeon.state()');
    const count3b = await objectCount();
    const dots3b = await c.json(DOT_ON_SCREEN);
    check('3b', 'R5: undoing back to the saved content clears the dirty state AND the marker',
      state3b.dirty === false && state3b.dirtyActs.length === 0
      && count3b === placed3.before && dots3b.length === 0,
      `objects back to ${count3b} (was ${placed3.before} at the save); `
      + `state ${JSON.stringify(state3b)}; dots ${JSON.stringify(dots3b)}`);

    // ═══════════════════════════════════════════════════════════════════════
    // [4] A CLOSE THAT KEEPS THE EDIT MUST KEEP THE UNDO
    //     Receipt R4 (uxb F2). The measured pre-fix state: the object survived,
    //     dirty survived, and Undo AND Redo came back DISABLED.
    // ═══════════════════════════════════════════════════════════════════════
    const placed4 = await placeObject('4', 820, 380);
    const state4a = await c.json('window.__dbg.aeon.state()');
    check('4a', 'a fourth placement is dirty and undoable before the close',
      state4a.dirty === true && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === true,
      `objects ${placed4.before} -> ${placed4.after}`);

    const closed = await pressBy(c, '4: Close tab', String.raw`/^Close tab$/`, 'span', 'title');
    await sleep(1500);
    const tabsAfterClose = await c.json(
      "[...document.querySelectorAll('[role=\"tablist\"] > div')].map((d) => d.title)");
    const stateClosed = await c.json('window.__dbg.aeon.state()');
    check('4b', 'the close KEEPS the edit (this is why it is not a discard)',
      !tabsAfterClose.includes('Oracle Jungle Zone · act1') && stateClosed.dirty === true,
      `tabs ${JSON.stringify(tabsAfterClose)}; state ${JSON.stringify(stateClosed)}; `
      + `pressed at ${JSON.stringify(closed && closed.at)}`);

    // ═══════════════════════════════════════════════════════════════════════
    // [5] CTRL+S THAT WRITES NOTHING WHILE WORK IS UNSAVED MUST SAY SO
    //     Receipt R2 (uxb F3's second half). The tab is closed, so the active
    //     tab is Home and no saver owns it - which is exactly the state seat B
    //     pressed Ctrl+S in and got no message of any kind.
    // ═══════════════════════════════════════════════════════════════════════
    const dirtyBeforeHomeSave = (await c.json('window.__dbg.aeon.state()')).dirtyActs;
    await ctrlS(c);
    await sleep(2500);
    const toasts = await c.json(TOASTS);
    const dirtyAfterHomeSave = (await c.json('window.__dbg.aeon.state()')).dirtyActs;
    check('5a', 'R2: Ctrl+S on a tab no saver owns, with an act unsaved, TELLS THE USER',
      Array.isArray(toasts) && toasts.length >= 1,
      `toast(s): ${JSON.stringify(toasts)}\n        `
      + `dirtyActs before ${JSON.stringify(dirtyBeforeHomeSave)} after `
      + `${JSON.stringify(dirtyAfterHomeSave)} (unchanged is CORRECT - the narrow routing `
      + 'stands; what changed is that it is no longer silent)');

    // ── Reopen and read the undo state back: the R4 receipt's second half.
    await pressBy(c, '4: reopen the act', String.raw`/Oracle Jungle Zone/`, 'button', 'text');
    await sleep(2500);
    const reopened = await c.json(
      '({ canUndo: window.__dbg.aeon.canUndo(), '
      + 'undoBtn: (() => { const b = [...document.querySelectorAll("button")]'
      + '.find((x) => x.textContent.trim() === "Undo"); return b ? b.disabled : null; })(), '
      + 'redoBtn: (() => { const b = [...document.querySelectorAll("button")]'
      + '.find((x) => x.textContent.trim() === "Redo"); return b ? b.disabled : null; })() })');
    const countReopened = await objectCount();
    check('4c', 'R4: and the undo history SURVIVES the close, so the kept edit can still be '
      + 'taken back',
      reopened.canUndo === true && reopened.undoBtn === false && countReopened === placed4.after,
      `${JSON.stringify(reopened)}; objects ${countReopened} (was ${placed4.after} before the close)`
      + '\n        before the fix: canUndo=false, Undo disabled, Redo disabled, object still there');

    // ═══════════════════════════════════════════════════════════════════════
    // [6] THE BOUNDARY AND THE LEDGER
    // ═══════════════════════════════════════════════════════════════════════
    const srcAfter = srcNames.map((f) => `${f}: ${stamp(join(srcActDir, f))}`);
    check('6a', 'aeon\'s own checkout is BYTE-FOR-BYTE where it was — nothing here wrote to it',
      srcAfter.join('|') === srcStamps.join('|'),
      `before:\n        ${srcStamps.join('\n        ')}\n        after:\n        ${srcAfter.join('\n        ')}`);

    const bad = driven.filter((x) => !x.found);
    check('6b', 'EVERY scripted gesture found its control and moved the app',
      driven.length > 0 && bad.length === 0,
      `${driven.length} gesture(s); ${bad.length} did not land`
      + (bad.length ? `: ${JSON.stringify(bad, null, 1)}` : ''));
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    const { killTree } = await import('./lib/harness-guard.mjs');
    await killTree(child);
    if (!process.env.KEEP_WORK) rmSync(WORK, { recursive: true, force: true });
    else note('working copy KEPT', WORK);
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`${results.filter((r) => r.ok).length}/${results.length} rows passed · `
    + `${fails.length} failed · ${unmeasured.length} unmeasured`);
  if (fails.length) console.log(`FAILED: ${fails.join(', ')}`);
  if (unmeasured.length) console.log(`UNMEASURED: ${unmeasured.join(', ')}`);
  process.exitCode = (fails.length || unmeasured.length) ? 1 : 0;
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e?.message ?? e}`); process.exitCode = 1; });
