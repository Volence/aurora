// ═══════════════════════════════════════════════════════════════════════════
// panel-overflow — EVERY SCROLLING COLUMN, BY NAME, IN ONE OF FOUR STATES
// ═══════════════════════════════════════════════════════════════════════════
//
//     npm run harness:panel-overflow
//
// `Panel` closes its inline axis twice over (its docblock has the measurements:
// 89px of sticky strip dragged by a wheel, 511px by a `Tab` focus jump). The
// price of closing it is that a child WIDER THAN ITS COLUMN no longer moves
// anything. It is simply clipped, and a truncated label looks like a short one.
//
// Until 2026-09-06 exactly one column was watched for that: row `[9a]` of
// scratchpad/coldread-fixes-harness.mjs, which measures EFFECTS. There are
// fifteen scrolling `Panel` call sites. This sweep is the other fourteen.
//
// ── WHAT MAKES THIS DIFFERENT FROM A WIDER [9a] ───────────────────────────
//
// Most of these columns need something open before they exist at all: an aeon
// checkout, an s1disasm checkout, a document. A sweep that measured whatever it
// happened to find and printed "0 overflows" would go GREEN BY LOOKING AT
// NOTHING, which is the precise defect this parcel was booked for.
//
// So the census is NOT derived from the DOM. `window.__dbg.panels().census`
// comes from src/renderer/components/ui/panel-columns.ts, which
// src/renderer/components/__tests__/panel-columns.test.ts pins to the call
// sites in both directions. Every census row is printed, every run, in one of:
//
//   CLEAN         measured; scrollWidth <= clientWidth.
//   OVERFLOW      measured; a child is being clipped. The offending leaf nodes
//                 are printed with it, because scrollWidth alone names nobody.
//   UNMEASURABLE  NOT REACHED, with the reason. Never a pass. Makes the run
//                 non-zero.
//   DEAD          the census itself declares that nothing mounts this column,
//                 and a vitest proves the claim (nothing imports the symbol).
//
// ⚠ WHY `DEAD` IS A FOURTH STATE AND NOT UNMEASURABLE. There is exactly one:
// `EffectsScenePanel.tsx` exports an `EffectsPanels` that no file imports (the
// Effects facet declares a local component of the same name and mounts that).
// Calling it UNMEASURABLE would make this run non-zero forever for a reason
// nobody can act on, and a gate that is permanently red teaches its readers to
// ignore the exit code. Calling it CLEAN would be a lie. So it is its own
// state, printed loudly, counted separately, and its claim is held by a test
// rather than by this comment.
//
// ── WHAT THIS HARNESS DOES NOT DO ─────────────────────────────────────────
//
// ⚠ IT NEVER SAVES AND NEVER BUILDS. It opens the aeon and s1disasm checkouts
// READ ONLY, presses no Ctrl+S and no Build and Run. The ONE gesture in here
// that would write anything is creating a canvas document (the canvas mode
// column cannot exist without one), and that phase refuses to run against a
// checkout at its default location: it needs `PANEL_SWEEP_CANVAS_DIR` pointed
// at a throwaway copy, and says so in the UNMEASURABLE reason when it is unset.
//
// ── RUN ───────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=$PWD \
//   npm run harness:panel-overflow
//
// Two variables, not one: a linked worktree has neither `node_modules/.bin/
// electron` nor a `dist/` of its own, so with only the first the run-root
// resolver walks up and BORROWS the main checkout's built tree, and every row
// below would describe an app this branch did not build. The run root is
// printed and a borrowed one is refused.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9541);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = join(ROOT, 'scratchpad/shots-panel-overflow');

/**
 * ⚠ ITS OWN VARIABLE, WITH NO DEFAULT, and the difference is the point. The
 * canvas column is the only one whose gesture WRITES (a new canvas document is
 * written at creation), so it is the only one that may not point at a checkout
 * somebody is working in. Unset means the column reports UNMEASURABLE naming
 * this variable, which is a true statement about the run; a default would make
 * it a write nobody asked for.
 */
const CANVAS_DIR = process.env.PANEL_SWEEP_CANVAS_DIR ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── row bookkeeping ────────────────────────────────────────────────────────
//
// One row per CENSUS entry, filled in as the sweep reaches things. Seeded from
// the census with every column already UNMEASURABLE, so a phase that throws
// half way leaves the untouched columns saying "not reached" rather than
// vanishing from the table.

const rows = new Map();          // id -> { id, label, owner, reach, state, detail }
const notes = [];

function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
  notes.push(what);
}

function setRow(id, state, detail) {
  const r = rows.get(id);
  if (!r) { note('census has no such column', `${id} (a stray id, reported below)`); return; }
  r.state = state; r.detail = detail;
  const tag = { CLEAN: 'CLEAN       ', OVERFLOW: 'OVERFLOW    ', UNMEASURABLE: 'UNMEASURABLE', DEAD: 'DEAD        ' }[state];
  console.log(`${tag}  ${id}  ${r.label}\n        ${detail}`);
}

/** A rig row: something about the harness itself, not about a column. */
const rig = [];
function rigCheck(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  rig.push({ id, name, ok, detail });
}

// ── CDP plumbing (the shape every harness in here uses) ────────────────────

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
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
}

async function waitForDbg(c) {
  for (let i = 0; i < 60; i++) {
    if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
    await sleep(300);
  }
  return false;
}

/** A CLEAN SESSION. One window holds one project, and opening a second project
 *  on top of the first leaves the first workspace on screen, which is how a
 *  sweep measures the previous engine's column twice under two names. */
async function freshSession(c) {
  await c.evalExpr('localStorage.clear()');
  await c.send('Page.reload');
  await sleep(4000);
  return waitForDbg(c);
}

// ── the measurement ────────────────────────────────────────────────────────

/**
 * Poll until `id` is mounted, then return its measurement.
 *
 * The id is the proof the RIGHT column is on screen: ids are unique per call
 * site (panel-columns.test.ts holds that), so finding one cannot be the
 * previous facet's column answering for this one. That is the failure mode a
 * "did the facet switch?" check would miss, because switchFacet reports the
 * facet it set whether or not anything re-rendered.
 */
async function measure(c, id, ms = 6000) {
  for (let i = 0; i < ms / 250; i++) {
    const p = await c.json('window.__dbg.panels()').catch(() => null);
    const m = p?.mounted.find((x) => x.id === id);
    if (m) return m;
    await sleep(250);
  }
  return null;
}

/**
 * OPEN EVERY CARD, THEN MEASURE.
 *
 * ⚠ THIS IS THE ROW THAT WAS VACUOUS ON ITS FIRST CUT, and it failed exactly
 * the way `[9d]` did in the coldread harness. A plant was put in the aeon
 * Objects column (an unbreakable path token in a `<code>`, the shape of the
 * real 2026-09-05 defect), the app was rebuilt, and the sweep still said CLEAN.
 * The cause is one line of CollapsibleSection: `{!collapsed && children}`. A
 * shut card renders NO CHILDREN, so a column with its cards shut can hold a
 * child twice its width and measure 0px. Several sections in this shell are
 * `defaultCollapsed`, and a fresh session (which this sweep takes on purpose)
 * gets every one of those defaults.
 *
 * So the condition is CREATED rather than waited for, the way `[9a]` opens the
 * CYCLES card before it believes its own reading, and a column with a card
 * still shut is UNMEASURABLE rather than clean. `revealSections` goes through
 * the app's own `revealPanel`, the same write the header click performs.
 */
async function openAllCards(c, id) {
  let last = [];
  for (let round = 0; round < 8; round++) {
    const m = await measure(c, id, 2000);
    if (!m) return { m: null, opened: last };
    const shut = m.sections.filter((s) => s.collapsed).map((s) => s.id);
    if (!shut.length) return { m, opened: last };
    const r = await c.json('window.__dbg.revealSections()');
    last = [...new Set([...last, ...r.revealed])];
    await sleep(500);
  }
  return { m: await measure(c, id, 2000), opened: last };
}

function record(id, m, howReached, opened = []) {
  if (!m) {
    setRow(id, 'UNMEASURABLE', `${howReached}, but no element carrying data-panel-column="${id}" `
      + 'ever appeared, so NOTHING about this column was measured');
    return;
  }
  const shut = m.sections.filter((s) => s.collapsed).map((s) => s.id);
  const cards = `${m.sections.length} card(s), ${opened.length} opened by this sweep`;
  if (shut.length) {
    setRow(id, 'UNMEASURABLE', `${howReached}: ${cards}, but ${shut.length} would not open `
      + `(${JSON.stringify(shut)}). A shut card renders no children, so a reading taken now is a `
      + 'reading of a screen this column has not got. Nothing was concluded about it.');
    return;
  }
  const geom = `scrollWidth ${m.scrollWidth} clientWidth ${m.clientWidth} `
    + `overflow ${m.overflow}px scrollLeft ${m.scrollLeft} · ${cards} (${howReached})`;
  if (m.overflow > 0) {
    setRow(id, 'OVERFLOW', `${geom}\n        clipped past the right edge: `
      + (m.offenders.length ? JSON.stringify(m.offenders) : '(no leaf node found past the edge; the '
        + 'overflow is in a container with children, so widen the offender scan)'));
  } else {
    setRow(id, 'CLEAN', geom);
  }
}

/**
 * ⚠ EVERY RUN PLANTS A VIOLATION AND WATCHES IT CAUGHT, ON A REAL COLUMN.
 *
 * A sweep of fifteen columns that all measure 0px is indistinguishable from a
 * sweep whose measurement is broken. This is the difference, and it runs on the
 * first column that measures clean rather than on a fixture, so it exercises
 * the same `panels()` path every row above it uses.
 *
 * ⚠ THE TOKEN IS UNBREAKABLE ON PURPOSE, and this is not fussiness. The first
 * plant tried here was `data/editor/ojz_bg_ingame-forest-v15-1786630615596.bin`
 * and the sweep stayed GREEN through a rebuild: HYPHENS ARE SOFT WRAP
 * OPPORTUNITIES (so are slashes), so the token broke across lines and never
 * went off the edge. That is the same shape as `[9d]` in
 * scratchpad/coldread-fixes-harness.mjs, which passed on both sides of its own
 * fix because its planted button wrapped. The string below is the one that
 * column's own plant uses and is proven to overflow: its longest unbroken run
 * is `a_preset_id_nobody_has_authored_yet`, and `_` is not a break opportunity.
 *
 * AND IT IS UNPLANTED AGAIN, with a second reading: a row that only ever sees
 * the number go up cannot tell a live measurement from a stuck one.
 */
const PLANT_TEXT = 'data/editor/effects/presets/a_preset_id_nobody_has_authored_yet.json';
let selfTested = false;

async function selfTest(c, id) {
  selfTested = true;
  const plant = String.raw`
    (() => {
      const s = document.querySelector('[${'data-panel-column'}="${id}"]');
      if (!s) return null;
      document.getElementById('panel-sweep-plant')?.remove();
      const d = document.createElement('div');
      d.id = 'panel-sweep-plant';
      d.style.fontSize = '11px';
      const code = document.createElement('code');
      code.textContent = ${JSON.stringify(PLANT_TEXT)};
      d.appendChild(code);
      s.appendChild(d);
      return true;
    })()`;
  const ok = await c.evalExpr(plant);
  if (!ok) {
    rigCheck('r4', `a planted over-wide child in ${id} is CAUGHT`, false,
      'the plant could not be attached: the column left the DOM between the reading and the plant, '
      + 'so the instrument was NOT exercised and every clean row above is unwitnessed');
    return;
  }
  await sleep(400);
  const planted = await measure(c, id, 3000);
  rigCheck('r4', `a planted over-wide child in ${id} is CAUGHT`,
    planted !== null && planted.overflow > 0,
    planted === null ? 'the column vanished' : `overflow ${planted.overflow}px `
      + `(scrollWidth ${planted.scrollWidth} vs clientWidth ${planted.clientWidth}), offenders `
      + `${JSON.stringify(planted.offenders.slice(0, 2))}. A 0 here means the measurement is not `
      + 'working and every CLEAN row in the table is worthless.');
  await c.evalExpr(`document.getElementById('panel-sweep-plant')?.remove(); 1`);
  await sleep(400);
  const after = await measure(c, id, 3000);
  rigCheck('r5', 'and removing it puts the column back to clean (the reading is live, not stuck)',
    after !== null && after.overflow <= 0,
    after === null ? 'the column vanished' : `overflow ${after.overflow}px after the plant was removed`);
}

/** Every column whose reach is `kind`, in census order. */
function columnsWithReach(kind) {
  return [...rows.values()].filter((r) => r.reach.startsWith(`${kind}:`));
}
const facetOf = (r) => r.reach.split(': ')[1];

// ── phases ─────────────────────────────────────────────────────────────────

async function sweepFacets(c, kind, howReached) {
  for (const r of columnsWithReach(kind)) {
    const facet = facetOf(r);
    const got = await c.json(`window.__dbg.aeon.setFacet(${JSON.stringify(facet)})`).catch(() => null);
    if (got === null) {
      setRow(r.id, 'UNMEASURABLE', `${howReached}, but switchFacet(${facet}) returned null `
        + '(no active tab, or the profile does not grant this facet), so nothing was measured');
      continue;
    }
    await sleep(700);
    const { m, opened } = await openAllCards(c, r.id);
    record(r.id, m, `${howReached}, facet ${got.facet} (tool ${got.tool})`, opened);
    // The first column that measures clean is where the instrument proves it
    // can still see an overflow at all. Done AFTER that column is recorded, and
    // the plant is removed again, so nothing below reads a poisoned screen.
    if (!selfTested && rows.get(r.id).state === 'CLEAN') await selfTest(c, r.id);
  }
}

async function key(c, k, code, vk, modifiers = 0, text) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(text ? { text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(120);
}

/**
 * The canvas column, through the app's own New Canvas gesture.
 *
 * ⚠ THIS IS THE ONE PHASE THAT WRITES. `createCanvasDocument` writes the
 * document at creation, so the column cannot be reached without putting a file
 * in the open project. Hence the refusal above the call site rather than a
 * default path.
 */
async function sweepCanvas(c) {
  if (!CANVAS_DIR) {
    setRow('canvas-mode', 'UNMEASURABLE',
      'CanvasMode returns null without a loaded document (CanvasMode.tsx: `if (!doc) return null`), '
      + 'and the only gesture that makes one WRITES the document into the open project. This sweep '
      + 'refuses to write into a checkout somebody works in. Set PANEL_SWEEP_CANVAS_DIR to a '
      + 'throwaway copy of a project and re run to measure it.');
    return;
  }
  if (CANVAS_DIR === S1DIR || CANVAS_DIR === AEONDIR) {
    setRow('canvas-mode', 'UNMEASURABLE',
      `PANEL_SWEEP_CANVAS_DIR names the resolver's own default location (${CANVAS_DIR}). That is a `
      + 'checkout somebody works in, and this phase writes. Point it at a copy.');
    return;
  }
  if (!(await freshSession(c))) {
    setRow('canvas-mode', 'UNMEASURABLE', 'the app did not come back with __dbg after a reload');
    return;
  }
  await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(CANVAS_DIR)})`).catch((e) => note('canvas openDir threw', e.message));
  for (let i = 0; i < 40; i++) {
    if ((await c.json('window.__dbg.projStatus()')).zones > 0) break;
    await sleep(400);
  }
  await c.evalExpr('window.__dbg.activate("ghz", 1)').catch(() => {});
  await sleep(3000);

  // Ctrl+K, type the command, Enter. Retried, because it is three separate
  // events and a dropped one surfaces far away as "the form is null".
  const dlgOpen = String.raw`(() => !!document.querySelector('[role="dialog"][aria-label="New Canvas"]'))()`;
  let opened = false;
  for (let i = 0; i < 3 && !opened; i++) {
    await key(c, 'Escape', 'Escape', 27);
    await sleep(300);
    await key(c, 'k', 'KeyK', 75, 2);
    await sleep(700);
    await c.send('Input.insertText', { text: 'New Canvas' });
    await sleep(500);
    await key(c, 'Enter', 'Enter', 13);
    await sleep(900);
    opened = await c.evalExpr(dlgOpen);
  }
  if (!opened) {
    await shot(c, 'canvas-no-dialog');
    setRow('canvas-mode', 'UNMEASURABLE',
      'the New Canvas dialog did not open after three Ctrl+K attempts, so no canvas document '
      + 'exists and CanvasMode cannot mount. Shot: shots-panel-overflow/canvas-no-dialog.png');
    return;
  }
  // ⚠ THE NAME IS NOT OPTIONAL, and the first cut of this phase did not type
  // one. The field renders its suggestion as a PLACEHOLDER (grey
  // `green-hill-cliffs`), which looks filled in a screenshot and is an empty
  // value to the form: Create was clicked at the right pixel, the dialog stayed
  // open, and the row reported "the Create click left no canvas document" for a
  // gesture that was never accepted. Typed through a real focus and
  // `Input.insertText`, the way the canvas harness types into it.
  await c.evalExpr(String.raw`
    (() => {
      const d = document.querySelector('[role="dialog"][aria-label="New Canvas"]');
      const i = d && d.querySelector('input');
      if (i) i.focus();
      return !!i;
    })()`);
  // ⚠ A UNIQUE NAME PER RUN. The copy this phase writes into KEEPS the document
  // it created, so a second run with a fixed name met the app's own duplicate
  // refusal, the dialog stayed open, and the row reported "the Create click
  // left no canvas document" for the second run of an identical rig. A harness
  // that only works the first time reads as a flake in whatever it is measuring.
  const canvasName = `panel-sweep-${Date.now().toString(36)}`;
  await sleep(200);
  await c.send('Input.insertText', { text: canvasName });
  await sleep(400);
  const named = await c.evalExpr(String.raw`
    (() => { const d = document.querySelector('[role="dialog"][aria-label="New Canvas"]');
      const i = d && d.querySelector('input'); return i ? i.value : null; })()`);
  // ANTI VACUOUS: without this, an empty name and a broken click are the same
  // UNMEASURABLE line, and the second reads as the first.
  note('canvas name typed', JSON.stringify(named));

  // The primary button is found by its text, the way a person finds it.
  const aim = await c.json(String.raw`
    (() => {
      const d = document.querySelector('[role="dialog"][aria-label="New Canvas"]');
      const b = [...d.querySelectorAll('button')].find((e) => /^(Create|Add|New Canvas)$/i.test((e.textContent||'').trim()));
      if (!b) return { ok: false, buttons: [...d.querySelectorAll('button')].map((e) => (e.textContent||'').trim()) };
      const r = b.getBoundingClientRect();
      return { ok: true, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
               dpr: window.devicePixelRatio, rect: { l: r.left, t: r.top, w: r.width, h: r.height } };
    })()`);
  if (!aim.ok) {
    setRow('canvas-mode', 'UNMEASURABLE',
      `the New Canvas dialog opened but carries no Create button this sweep recognises `
      + `(buttons: ${JSON.stringify(aim.buttons)})`);
    return;
  }
  // An INTEGER client pixel, and the rect and dpr printed beside it: dpr varies
  // run to run on this box, so a fractional aim is a different gesture between
  // two runs of the same harness.
  note('canvas Create aim', `${aim.x},${aim.y} dpr ${aim.dpr} rect ${JSON.stringify(aim.rect)}`);
  const base = { x: aim.x, y: aim.y, button: 'left', clickCount: 1, buttons: 1 };
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
  await sleep(2500);
  const docs = await c.json('window.__dbg.canvas.docIds()').catch(() => []);
  if (!docs.length) {
    await shot(c, 'canvas-no-doc');
    const stillOpen = await c.evalExpr(dlgOpen);
    setRow('canvas-mode', 'UNMEASURABLE',
      'the Create click left no canvas document in the store, so CanvasMode still returns null '
      + `(name field held ${JSON.stringify(named)}, dialog still open: ${stillOpen}). `
      + 'Shot: shots-panel-overflow/canvas-no-doc.png');
    return;
  }
  const canvas = await openAllCards(c, 'canvas-mode');
  record('canvas-mode', canvas.m, `canvas document ${docs[0]} created`, canvas.opened);
  await shot(c, 'canvas-mode');
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  assertFreshBuild(RUN);
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const haveDbg = await waitForDbg(c);
    rigCheck('r1', 'the debug hooks are installed (a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? 'window.__dbg is present' : 'window.__dbg never appeared: this is a plain build, so '
        + 'NOTHING below could be measured');
    if (!haveDbg) return;

    const havePanels = await c.evalExpr('typeof window.__dbg.panels === "function"');
    rigCheck('r2', 'and this build carries the panels() probe', havePanels === true,
      havePanels ? 'window.__dbg.panels is a function'
        : 'window.__dbg.panels is missing: the built tree predates CLIP-UNWATCHED-COLUMNS, so every '
          + 'row below would be UNMEASURABLE for a reason that has nothing to do with the columns');
    if (!havePanels) return;

    const census = (await c.json('window.__dbg.panels()')).census;
    for (const e of census) rows.set(e.id, { ...e, state: 'UNMEASURABLE', detail: 'not reached by this run' });
    rigCheck('r3', 'the census has columns in it', census.length > 0,
      `${census.length} columns declared in components/ui/panel-columns.ts: `
      + census.map((e) => e.id).join(', '));

    // ── the DEAD entries, settled before anything is driven ────────────────
    for (const r of columnsWithReach('unmounted')) {
      setRow(r.id, 'DEAD', `${r.owner}: ${r.reach}. panel-columns.test.ts holds the claim `
        + '(it fails if any file imports the symbol).');
    }

    // ── PHASE 1: aeon ──────────────────────────────────────────────────────
    const aeonCols = columnsWithReach('aeon-facet');
    await freshSession(c);
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => note('aeon open threw', e.message));
    let ast = null;
    for (let i = 0; i < 40; i++) {
      ast = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (ast && ast.open) break;
      await sleep(400);
    }
    if (!ast || !ast.open) {
      for (const r of aeonCols) {
        setRow(r.id, 'UNMEASURABLE', `the aeon project at ${AEONDIR} did not open `
          + `(aeon.state() = ${JSON.stringify(ast)}), so this facet never rendered`);
      }
    } else {
      note('aeon open', `${AEONDIR} · ${JSON.stringify(ast).slice(0, 200)}`);
      await sleep(2500);
      await sweepFacets(c, 'aeon-facet', 'aeon project open');
      await shot(c, 'aeon-last-facet');
    }

    // ── PHASE 2: classic (s1disasm) ────────────────────────────────────────
    const s1Cols = columnsWithReach('s1-facet');
    await freshSession(c);
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`)
      .catch((e) => note('openDir threw', e.message));
    let proj = null;
    for (let i = 0; i < 40; i++) {
      proj = await c.json('window.__dbg.projStatus()').catch(() => null);
      if (proj && proj.zones > 0) break;
      await sleep(400);
    }
    if (!proj || proj.zones === 0) {
      for (const r of s1Cols) {
        setRow(r.id, 'UNMEASURABLE', `the classic project at ${S1DIR} did not open `
          + `(projStatus() = ${JSON.stringify(proj)}), so this facet never rendered`);
      }
    } else {
      note('classic open', `${S1DIR} · ${JSON.stringify(proj)}`);
      await c.evalExpr('window.__dbg.activate("ghz", 1)').catch((e) => note('activate threw', e.message));
      await sleep(4000);
      note('classic level', JSON.stringify(await c.json('window.__dbg.levelState()').catch(() => null)));
      await sweepFacets(c, 's1-facet', 'classic project open');
      await shot(c, 'classic-last-facet');
    }

    // ── PHASE 3: sprite mode ───────────────────────────────────────────────
    // Reached the way the other sprite harnesses reach it, on the classic
    // project this phase leaves open.
    if (proj && proj.zones > 0) {
      await c.evalExpr('window.__dbg.editObjectArt(0x41)').catch((e) => note('editObjectArt threw', e.message));
      await sleep(3000);
      const sp = await c.json('window.__dbg.spriteState()').catch(() => null);
      if (!sp || sp.activeDocId === null) {
        setRow('sprite-mode', 'UNMEASURABLE',
          `editObjectArt(0x41) left no active sprite document (spriteState() = ${JSON.stringify(sp)}), `
          + 'so SpriteMode never mounted');
      } else {
        const sprite = await openAllCards(c, 'sprite-mode');
        record('sprite-mode', sprite.m, `sprite document ${sp.activeDocId} open`, sprite.opened);
        await shot(c, 'sprite-mode');
      }
    } else {
      setRow('sprite-mode', 'UNMEASURABLE',
        'SpriteMode needs an object art document, which needs a classic project, and the classic '
        + 'project did not open (see the s1 rows above)');
    }

    // ── PHASE 4: canvas mode ───────────────────────────────────────────────
    await sweepCanvas(c);
  } finally {
    // ── THE TABLE. Printed in the finally block ON PURPOSE: a sweep that threw
    // half way through still owes the reader which columns it reached, and a
    // table only the happy path prints is exactly the "could not look" that
    // reads as "looked and found nothing".
    console.log(`\n${'═'.repeat(78)}`);
    console.log('EVERY SCROLLING COLUMN IN THE SHELL');
    console.log('═'.repeat(78));
    const width = Math.max(...[...rows.keys()].map((k) => k.length), 4);
    for (const r of rows.values()) {
      console.log(`  ${r.state.padEnd(13)} ${r.id.padEnd(width)}  ${r.label}`);
    }
    const by = (s) => [...rows.values()].filter((r) => r.state === s);
    const clean = by('CLEAN'), over = by('OVERFLOW'), un = by('UNMEASURABLE'), dead = by('DEAD');
    console.log('═'.repeat(78));
    console.log(`${rows.size} columns: ${clean.length} clean, ${over.length} OVERFLOWING, `
      + `${un.length} UNMEASURABLE, ${dead.length} dead (nothing mounts them)`);
    if (over.length) {
      console.log('\nOVERFLOWING:');
      for (const r of over) console.log(`  ${r.id}: ${r.detail}`);
    }
    if (un.length) {
      console.log('\nUNMEASURABLE (not a pass, not a zero):');
      for (const r of un) console.log(`  ${r.id}: ${r.detail}`);
    }
    if (!selfTested && rows.size) {
      // Booked BEFORE rigFails is taken, so it reaches the exit code. A sweep
      // whose plant never ran has witnessed nothing, whatever the table says.
      rigCheck('r4', 'a planted over-wide child is CAUGHT', false,
        'NO column measured clean, so the plant never ran and nothing witnessed that this sweep '
        + 'can still see an overflow. Read every row above as unproven.');
    }
    const rigFails = rig.filter((r) => !r.ok);
    if (rigFails.length) {
      console.log('\nRIG FAILURES (the sweep did not witness its own instrument):');
      for (const r of rigFails) console.log(`  [${r.id}] ${r.name}: ${r.detail}`);
    }
    if (!rows.size) console.log('\nNO CENSUS WAS READ AT ALL. Every column above is missing, not clean.');
    console.log(`shots: ${SHOTS}`);
    // A run that could not reach a column is NOT a pass, and neither is a run
    // that never read the census.
    process.exitCode = (over.length || un.length || rigFails.length || !rows.size) ? 1 : 0;

    try { c?.close(); } catch { /* closing */ }
    const { killTree } = await import('./lib/harness-guard.mjs');
    await killTree(child);
    console.log(`port free after teardown: ${await portFree()}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
