#!/usr/bin/env node
// HOW MANY FILES DOES ONE Ctrl+S REWRITE? (EW-SAVE-NOISE, cold walkthrough d9.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// The node suite can drive `buildAeonSavePlan` and a mocked `window.api`; it
// cannot make the claim, which is the OWNER'S claim:
//
//        AN AUTHOR OPENS HIS PROJECT IN THE RUNNING EDITOR, CHANGES ONE THING,
//        PRESSES Ctrl+S, AND N FILES IN HIS GIT WORKING TREE MOVE.
//
// `docs/reviews/2026-09-02-effects-cold-walkthrough.md` d9 measured N = 25 by
// hand: two real edits, twenty-three files whose bytes moved and whose meaning
// did not, one of them a scene the author never opened. His own words about the
// surface are "it kept giving errors during build time that I would have to
// stop and revert the changes" — so the 23 are what makes reverting miserable,
// not a tidiness complaint. This makes the number repeatable.
//
// TWO MEASUREMENTS, and they answer different questions:
//
//   §2  A Ctrl+S WITH NO EDIT AT ALL. Pure re-serialisation: every file that
//       moves here moved for no reason a person can point at. This is the
//       23 in isolation and it needs no gesture, so nothing about the gesture
//       can be blamed for the number.
//   §4  ONE edit, then Ctrl+S. This is d9's shape. Every file that moves is
//       NAMED, so a real change and a rider cannot hide inside a total.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • NOTHING WAS EVER READ. A tree walk that matched nothing makes "0 files
//     moved" true for the wrong reason, in the most convincing possible way.
//     Row [1b] asserts the baseline walk saw a project-sized tree, and row [4a]
//     asserts the ONE file it expects really did move — an all-zero run fails
//     it. PLANT=blind-walk points the walk at an empty directory to show [1b]
//     is the row that catches it.
//   • THE SAVE NEVER RAN. A keystroke that reached nothing leaves everything
//     unchanged, which looks exactly like a perfect save. Rows [2a] and [4a]
//     require `dirty` to have been TRUE before the save and FALSE after, and
//     [4a]'s edit row asserts the model moved first.
//   • NOTHING IS LOADED. An unopened project has no sections and no save;
//     row [1a] refuses to continue unless the act opened with sections.
//   • THE EDIT WAS NOT ONE EDIT. Row [3a] reads the MODEL's binding back
//     (`__dbg.aeon.rasterRef`), never the widget, and [3b] asserts no OTHER
//     section moved — a gesture that bound two is visible.
//
// ⚠ THIS HARNESS SAVES, AND THE COPY IS CONSUMED. AEON_DIR must be a FRESH
// extract, per run. Nothing here can put the bytes back, and a second run over
// a consumed copy would measure a tree the first run already canonicalised —
// which is the specific way this instrument would flatter the fix:
//
//     git -C <aeon> archive <committed rev> | tar -x -C <fresh dir>
//
// The run REFUSES (exit 2) when the section it binds already carries a
// rasterRef, naming the file — that is the leftover that changes a verdict.
//
// ⚠ NO EMULATOR, EVER. Nothing here runs a ROM.
//
// CLEANUP IS BY PID — `spawnGuarded` + an awaited `killTree`. Never `pkill`:
// a `pkill -f` on a dist path matches the owner's own Aurora and spares this
// run's orphan.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<FRESH writable copy> npm run harness:save-file-count
// From a linked worktree, add AURORA_BUILT_TREE=<that worktree> (built there)
// and ELECTRON_BIN=<a checkout's node_modules/.bin/electron>, or the run
// measures somebody else's build and says BORROWED while doing it.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { readAeonShippedPreset } from './lib/aeon-shipped-preset.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9471);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 93);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, not `ROOT`'s question
// 1. `announceRunRoot` prints the tree and marks it BORROWED when it is not the
// one this file lives in. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a FRESH WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — this harness saves, and must never write there');
}
const SHOTS = `${ROOT}/scratchpad/shots-save-file-count`;
mkdirSync(SHOTS, { recursive: true });

const PLANT = process.env.PLANT ?? '';
/** aeon's own shipped preset document — a document this repo did not author, so
 *  binding it is not Aurora agreeing with itself.
 *
 *  ⚠ READ BY PATH, AT IMPORT, AND NOT LOOKED UP THROUGH THE APP. This id
 *  belongs to aeon and aeon has BOOKED a rename of it (their
 *  docs/DEFERRED_WORK.md, "PRESET-ID NAMESPACE COLLISION", 2026-09-03). This
 *  file used to carry the string `authored_probe` and discover its absence at
 *  row [3a] — "the select does not offer the option", four hundred lines into
 *  an Electron run, in a repo with an empty diff. Now the run refuses BEFORE
 *  the app launches, naming the absolute path and the booking, so their rename
 *  fails at the seam it crossed. See scratchpad/lib/aeon-shipped-preset.mjs. */
const SHIPPED = process.env.PRESET_ID ? null : readAeonShippedPreset(AEONDIR);
const PRESET_ID = process.env.PRESET_ID ?? SHIPPED.id;
if (SHIPPED) console.log(`    SHIPPED     : ${SHIPPED.path} (${SHIPPED.text.length}B, id ${SHIPPED.id}, ${SHIPPED.bands} band(s))`);
else console.log(`    SHIPPED     : OVERRIDDEN by PRESET_ID=${PRESET_ID} — the by-path identity check is SKIPPED`);
/** The section the ONE edit binds. Section 0 has a sidecar in aeon's tree
 *  ALREADY (and it is one of the two the walkthrough saw gain `rasterRef`), so
 *  the §4 write is a CHANGE to a tracked file rather than a new one — which is
 *  the harder case and the one d9 complained about. */
const SEC = Number(process.env.SEC ?? 0);
/** A section the run must NOT touch, so "one edit" is a measurement. */
const SEC_OTHER = 1;
const metaPath = (n) => `${AEONDIR}/games/sonic4/data/editor/ojz/act1/section_${n}.meta.json`;
/** The one file the §4 edit is ENTITLED to move. Derived from the section
 *  index, never typed as a whole path twice. */
const EDITED_REL = `games/sonic4/data/editor/ojz/act1/section_${SEC}.meta.json`;

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
function note(what, detail) {
  console.log(`NOTE  ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

// ── the tree walk ───────────────────────────────────────────────────────────

/**
 * Every file under `dir`, by content hash. `.git` is skipped — a `git archive`
 * extract has none, and a copy that did would drown the diff.
 *
 * PLANT=blind-walk points it at an empty directory instead, which is the
 * failure mode that makes every "0 files moved" row below true for the wrong
 * reason. Row [1b] is the floor that catches it.
 */
function snapshotTree(dir) {
  const root = PLANT === 'blind-walk' ? join(dir, '__no_such_dir__') : dir;
  const out = new Map();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const b = readFileSync(p);
        out.set(relative(root, p), { bytes: b.length, hash: createHash('sha1').update(b).digest('hex') });
      }
    }
  };
  if (!existsSync(root)) return out;
  walk(root);
  return out;
}

function diffTrees(before, after) {
  const changed = []; const added = []; const removed = [];
  for (const [p, a] of after) {
    const b = before.get(p);
    if (!b) added.push(p);
    else if (b.hash !== a.hash) changed.push({ path: p, from: b.bytes, to: a.bytes });
  }
  for (const p of before.keys()) if (!after.has(p)) removed.push(p);
  return { changed, added, removed };
}

/** Every path that moved in any way, as one sorted list — the number a person
 *  sees in `git status`. */
const movedPaths = (d) => [...d.changed.map((f) => f.path), ...d.added, ...d.removed].sort();

function report(label, d, before) {
  for (const f of d.changed) console.log(`        CHANGED ${f.path}  ${f.from} -> ${f.to} bytes`);
  for (const p of d.added) console.log(`        ADDED   ${p}`);
  for (const p of d.removed) console.log(`        REMOVED ${p}`);
  note(`${label}: ${movedPaths(d).length} of ${before.size} files moved`);
}

// ── page-side helpers ───────────────────────────────────────────────────────

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

/** Show one of the Effects column's three sub-tabs — its panels are UNMOUNTED,
 *  not hidden, until their job is shown (d-26b). */
const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

const SECTION_RE = String.raw`/^Raster band presets\b/`;

const OPEN_SECTION = (re, proofSelector) => String.raw`
(() => {
  const open = () => !!(${proofSelector});
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${re}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) return 'no-header';
  hdr.click();
  return 'clicked';
})()`;

/** The per-section raster select, found by the `title` the provider owns —
 *  never by position, which would match the scene assignment row instead. */
const SELECT = String.raw`
(() => {
  const re = /^Which raster band preset this section uses \(rasterRef\)/;
  return [...document.querySelectorAll('select')].find((s) => re.test(s.title || '')) || null;
})()`;

/** Drive a real `change` through React's synthetic layer. */
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

const ctrlS = async (c) => {
  const base = {
    key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2,
  };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
};

async function main() {
  const t0 = Date.now();
  console.log('=== save-file-count harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log(`    section     : ${SEC} (edited), ${SEC_OTHER} (must not move)`);

  // FRESH COPY PER RUN, ENFORCED, before anything launches. A Ctrl+S here
  // rewrites whatever the plan says needs rewriting; nothing in a `finally` can
  // put those bytes back (and a `finally` never runs on Ctrl+C anyway). The one
  // leftover that changes a verdict is a rasterRef on the section this run
  // binds, so that is what is read off disk and refused.
  for (const n of [SEC, SEC_OTHER]) {
    if (!existsSync(metaPath(n))) continue;
    let parsed = null;
    try { parsed = JSON.parse(readFileSync(metaPath(n), 'utf8')); } catch (e) {
      throw new Error(`LEFTOVER CHECK CANNOT READ ${metaPath(n)}: ${e.message} — `
        + 'refusing to launch over a sidecar it cannot classify');
    }
    if (parsed && parsed.rasterRef !== undefined && parsed.rasterRef !== null) {
      throw new Error(`LEFTOVER FROM A PRIOR RUN: ${metaPath(n)} already carries `
        + `rasterRef=${JSON.stringify(parsed.rasterRef)}. This harness binds section ${SEC} and `
        + 'measures what its save moved; a previous run left this, and that run\'s Ctrl+S also '
        + 'canonicalised the tree, so a second run here would measure an already-clean copy and '
        + 'flatter the fix. Re-materialise AEON_DIR from a committed aeon revision — '
        + 'FRESH COPY PER RUN.');
    }
  }

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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ── 1. THE SUBJECT, AND THE BASELINE ────────────────────────────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open, with sections, and CLEAN on arrival',
      !!(st && st.open && st.sections > 0 && st.dirty === false), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can be measured');
    await sleep(2500);

    // THE BASELINE IS TAKEN AFTER THE OPEN, never before the app launched:
    // opening a project is allowed to touch the tree, and a baseline that
    // predated it would attribute those bytes to the save.
    const base = snapshotTree(AEONDIR);
    check('1b', 'the baseline walk really saw a project — a walk that matched nothing '
      + 'makes every count below true for the wrong reason',
      base.size > 100, `${base.size} file(s) walked under ${AEONDIR}`);
    if (base.size === 0) throw new Error('baseline walk found nothing — refusing to report counts');

    // ── 2. Ctrl+S WITH NO EDIT AT ALL ───────────────────────────────────────
    //
    // The purest form of the defect. Nothing was authored, so every file that
    // moves here moved for a reason no person can point at.
    await ctrlS(c);
    await sleep(4000);
    const afterNoEdit = snapshotTree(AEONDIR);
    const dNoEdit = diffTrees(base, afterNoEdit);
    report('no-edit save', dNoEdit, base);
    check('2a', 'a save with NO EDIT moves NOTHING on disk',
      movedPaths(dNoEdit).length === 0,
      movedPaths(dNoEdit).length === 0
        ? 'nothing moved'
        : `${movedPaths(dNoEdit).length} file(s) moved with nothing authored: `
          + JSON.stringify(movedPaths(dNoEdit)));

    // ── 3. EXACTLY ONE EDITOR CHANGE ────────────────────────────────────────
    await c.evalExpr(clickByText(String.raw`/^Effects$/`));
    await sleep(1200);
    await c.evalExpr(SUBTAB('colour'));
    await sleep(900);
    await c.evalExpr(`window.__dbg.aeon.setActiveSection(${SEC})`);
    await sleep(600);
    const opened = await c.evalExpr(OPEN_SECTION(SECTION_RE, SELECT));
    await sleep(700);

    const options = await c.json(`(() => { const s = ${SELECT};
      return s ? [...s.options].map((o) => o.value) : null; })()`);
    check('3a', 'the raster-preset select is on screen and offers aeon\'s own shipped preset '
      + '— the floor for the gesture below',
      Array.isArray(options) && options.includes(PRESET_ID),
      `open=${JSON.stringify(opened)} options=${JSON.stringify(options)}`);
    if (!Array.isArray(options) || !options.includes(PRESET_ID)) {
      throw new Error('the control this harness edits through is not reachable');
    }

    const refBefore = await c.json(`window.__dbg.aeon.rasterRef(${SEC})`);
    const setRes = await c.evalExpr(SET_SELECT(SELECT, PRESET_ID));
    await sleep(1000);
    const refAfter = await c.json(`window.__dbg.aeon.rasterRef(${SEC})`);
    const otherRef = await c.json(`window.__dbg.aeon.rasterRef(${SEC_OTHER})`);
    const dirtyBefore = (await c.json('window.__dbg.aeon.state()')).dirty;
    check('3b', `ONE change: section ${SEC} is now bound in the MODEL, section ${SEC_OTHER} is not, `
      + 'and the project is dirty',
      refBefore === null && refAfter === PRESET_ID && otherRef === null && dirtyBefore === true,
      `set=${JSON.stringify(setRes)} ref(${SEC}) ${JSON.stringify(refBefore)} -> `
      + `${JSON.stringify(refAfter)}; ref(${SEC_OTHER})=${JSON.stringify(otherRef)}; `
      + `dirty=${dirtyBefore}`);

    // ── 4. ONE Ctrl+S, AND WHAT IT MOVED ────────────────────────────────────
    const beforeEditSave = snapshotTree(AEONDIR);
    await ctrlS(c);
    await sleep(4500);
    const dirtyAfter = (await c.json('window.__dbg.aeon.state()')).dirty;
    const afterEdit = snapshotTree(AEONDIR);
    const dEdit = diffTrees(beforeEditSave, afterEdit);
    report('one-edit save', dEdit, beforeEditSave);

    check('4a', 'a REAL Ctrl+S ran and cleared the dirty flag, and the ONE file the edit '
      + 'authored is the ONE file that moved',
      dirtyBefore === true && dirtyAfter === false
      && movedPaths(dEdit).length === 1 && movedPaths(dEdit)[0] === EDITED_REL,
      `dirty ${dirtyBefore} -> ${dirtyAfter}; moved ${JSON.stringify(movedPaths(dEdit))}; `
      + `expected exactly [${JSON.stringify(EDITED_REL)}]`);

    // The bytes, read off disk — a file that moved for the wrong reason is not
    // caught by counting it.
    let sidecar = null;
    try { sidecar = readFileSync(metaPath(SEC), 'utf8'); } catch { /* absent */ }
    check('4b', 'and the file that moved says what the author authored',
      !!sidecar && JSON.parse(sidecar).rasterRef === PRESET_ID,
      JSON.stringify(sidecar));

    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/save-file-count.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/save-file-count.png`);
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
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
