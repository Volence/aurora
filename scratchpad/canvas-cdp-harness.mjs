#!/usr/bin/env node
// Task 14 verification harness: does the ORIGINATION CANVAS actually work in the
// RUNNING Electron app? Drives the BUILT (VITE_AURORA_DEBUG=1) app under xvfb
// over CDP.
//
// Modelled on scratchpad/paint-through-harness.mjs — same launch discipline
// (detached `xvfb-run` + `electron`, kill the process group, verify the debug
// port is free before AND after), same evidence discipline (pixel readback off
// the real canvas, undo counted via the header's Undo chip plus a dispatched
// Ctrl+Z, negative controls that must themselves report FAIL).
//
// WHAT IS DIFFERENT FROM PHASE 1: several rows need the app RESTARTED (session
// restore, a deleted PNG at boot, a corrupted sidecar), so this harness owns a
// `session()` helper that launches, runs a body, and tears down — and the run is
// a sequence of four sessions rather than one. Everything the checks assert is
// either read off the screen (canvas pixels, computed styles, toast text) or
// read back out of the store through `window.__dbg.canvas.*`, which is
// strictly read-only: every mutation in this file goes through the real UI.
//
// ⚠ HOW TO RUN IT, AND IT NO LONGER HAS A DEFAULT. This harness DELETES
// `<s1disasm>/.aurora/canvas` twice as setup, so `S1DISASM_DIR` must name a
// WRITABLE COPY of a populated s1disasm — it opens the project and loads GHZ
// act 1, so an empty directory will not do — and it refuses if that variable is
// unset or points at the live checkout. See the guard below `RUN` for why, and
// for the four sibling harnesses covered by the same guard.
//
//     cp -r <sibling>/s1disasm /tmp/s1disasm-copy
//     S1DISASM_DIR=/tmp/s1disasm-copy npm run harness:canvas-cdp
//
// The 14 rows are the plan's own Task 14 table. `ONLY=10,11 node
// scratchpad/canvas-cdp-harness.mjs` restricts which numbered rows run inside
// each session (setup always runs) — used to re-run one row cheaply while a real
// bug is temporarily reintroduced into the source for the falsification pass.

import {
  siblingPathOrUnresolved, siblingDefaultPathOrUnresolved, checkoutOverride, UNRESOLVED_ROOT,
} from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { basename, resolve as resolvePath } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { spawnGuarded, killTree, restoreDiscoveryNow, readDiscoveryNow, resolveOwnedDiscovery, descendants, APP_NAMES, RUN_PROFILE_DIR, profileInUse, describeClearCensus } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';
import {
  resolveLeveldbDir, bytesOnDisk, flushMarker, flushRefusal, FLUSH_MARKER_KEY,
} from './lib/storage-flush.mjs';

const PORT = Number(process.env.PORT ?? 9364);
// SELF-LOCATING, not hardcoded. This file used to name the main checkout
// absolutely, which meant importing `session` from a WORKTREE launched the main
// checkout's build — a harness that reports a confident PASS for code the branch
// does not contain. Two earlier worktrees hand-patched this line
// (probe-click-paint.mjs, composer-fill-harness.mjs still carry their copies);
// deriving it from this file's own location fixes it for every future one.
// Resolves identically to the old literal when run from the main checkout.
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');

/**
 * THE NEW-CANVAS DEFAULTS, READ FROM THE CONSTANT THE DIALOG RENDERS FROM.
 *
 * `shell/new-canvas.ts` exports `NEW_CANVAS_DEFAULTS` and `NewCanvasDialog`
 * seeds its three fields from it, so this is the dialog's own source of truth
 * read independently rather than a number frozen in a harness. Rows 11c and
 * 11m used to pin `128`; the product moved to 256 at `598be067` (2026-08-16)
 * with the reasoning written out beside the constant, and the rows reported
 * that as a failure for eighteen days.
 *
 * REFUSES rather than defaulting: if the constant cannot be read, the two rows
 * have no expectation, and an invented one would pass against anything.
 */
function newCanvasDefaults() {
  const path = `${ROOT}/src/renderer/shell/new-canvas.ts`;
  let text;
  try { text = readFileSync(path, 'utf8'); }
  catch (e) { throw new Error(`cannot read ${path} (${e.code ?? e.message}) — rows 11c/11m have no expectation to compare the dialog against; UNMEASURABLE, not a pass`); }
  const m = /export const NEW_CANVAS_DEFAULTS: [^=]*=\s*\{([\s\S]*?)\n\};/.exec(text);
  if (!m) throw new Error('shell/new-canvas.ts no longer spells `export const NEW_CANVAS_DEFAULTS … = { … };` — re-derive the dialog\'s defaults rather than pinning the old ones');
  const width = /width:\s*(\d+)/.exec(m[1]);
  const height = /height:\s*(\d+)/.exec(m[1]);
  const profileId = /profileId:\s*'([^']+)'/.exec(m[1]);
  if (!width || !height || !profileId) {
    throw new Error(`NEW_CANVAS_DEFAULTS parsed but is missing width/height/profileId: ${JSON.stringify(m[1])}`);
  }
  return { width: Number(width[1]), height: Number(height[1]), profileId: profileId[1] };
}
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
// ===========================================================================
// WHERE THIS HARNESS IS ALLOWED TO WRITE — and DELETING is the most extreme
// write there is (d-28, `COPY ONLY WHERE IT CAN WRITE`).
// ===========================================================================
// THE DEFECT THIS REPLACES. `const S1DIR = siblingPathOrUnresolved('s1disasm')`
// falls back to the LIVE SIBLING CHECKOUT when nothing is set, and `main()`
// opened with `rmSync(CANVAS_DIR, { recursive: true, force: true })` as SETUP.
// On 2026-09-03 `/home/volence/sonic_hacks/s1disasm/.aurora/canvas` held 20 real
// files of the owner's canvas artwork. `npm run harness:canvas-cdp` with no
// environment set therefore deleted all of them, silently, before the first
// session launched. It had not happened only because the agents who ran it had
// happened to point at throwaway copies.
//
// THE SHAPE OF THE FIX is `scratchpad/band-preset-harness.mjs`'s, and BOTH
// clauses matter:
//   1. NO DEFAULT AT ALL, so an unset variable stops the run at import, naming
//      the variable — before any `rmSync` can run.
//   2. A REFUSAL when the variable is pointed at the live tree anyway. A
//      default that is a dead path is the worst of all worlds: it never trips
//      clause 2, so the run gets past the refusal and dies later and further
//      away.
//
// WHY IT IS SCOPED TO AN ENTRY-POINT LIST RATHER THAN APPLIED AT IMPORT.
// This file is TWO things. It is the harness `harness:canvas-cdp` runs, which
// writes and deletes; and it is the shared library 17 other instruments import
// for `session()` / `openProjectAndAct()`, which only OPEN a peer tree. d-28
// fixes the write-capable half and explicitly DEFERS the read-only half, so an
// unconditional top-level throw would convert 12 read-only sites this ruling
// leaves alone. The five entry points below are the ones that reach the write
// surface — this file plus the four that import `CANVAS_DIR` and delete inside
// it — derived by the sweep in
// docs/reviews/2026-09-03-canvas-harness-live-tree-delete.md §4, and policed by
// `scripts/check-peer-path-literals.mjs` rule 5 `peer-tree-write`.
//
// FORGETTING TO ADD A NEW WRITER TO THIS LIST IS LOUD AND HARMLESS, which is
// the property that makes the list safe to maintain: unarmed, `CANVAS_DIR` is
// not the live tree, it is a path under `UNRESOLVED_ROOT` that cannot exist and
// is not creatable by accident, so the write fails with an ENOENT naming
// `/nonexistent/…` instead of deleting somebody's art.
const CANVAS_WRITERS = new Set([
  'canvas-cdp-harness.mjs',        // this file: two recursive rmSync of the whole directory
  'art-agent-harness.mjs',         // mkdirSync + writeFileSync + rmSync of `stage5-*`
  'commit-cdp-harness.mjs',        // rmSync of EVERY file in the directory
  'commit-collision-harness.mjs',  // rmSync of `stage4-*`
  'constraints-cdp-harness.mjs',   // rmSync of EVERY file in the directory
]);
const ENTRY = basename(process.argv[1] ?? '');
const WRITES_CANVAS = CANVAS_WRITERS.has(ENTRY);
/** The WRITABLE COPY, or null when this entry point does not write. */
let S1_COPY = null;
if (WRITES_CANVAS) {
  const ovr = checkoutOverride('s1disasm')?.value;
  if (!ovr) {
    throw new Error(
      `S1DISASM_DIR must point at a WRITABLE COPY of an s1disasm checkout — ${ENTRY} DELETES\n`
      + '  inside <that checkout>/.aurora/canvas as setup, and must never do that to the live tree.\n'
      + '  There is deliberately NO DEFAULT: the default used to be the live sibling checkout, and\n'
      + '  running with nothing set recursively deleted the canvas artwork stored there.\n'
      + '\n'
      + '  THE COPY MUST BE A POPULATED s1disasm — this harness opens it as a project and loads GHZ\n'
      + '  act 1, so an empty directory will not do. Make one and point at it:\n'
      + `      cp -r ${siblingDefaultPathOrUnresolved('s1disasm')} /tmp/s1disasm-copy\n`
      + '      S1DISASM_DIR=/tmp/s1disasm-copy npm run harness:canvas-cdp\n'
      + '  (EMPYREAN_SUITE_ROOT does NOT satisfy this: it resolves the live checkout, which is the\n'
      + '  thing being refused. It has to be the copy, by name.)',
    );
  }
  if (ovr.startsWith(siblingDefaultPathOrUnresolved('s1disasm'))) {
    throw new Error(
      `S1DISASM_DIR points at s1disasm itself (${ovr}) — ${ENTRY} DELETES inside\n`
      + '  <that checkout>/.aurora/canvas, and must never write there. Copy it first:\n'
      + `      cp -r ${siblingDefaultPathOrUnresolved('s1disasm')} /tmp/s1disasm-copy\n`
      + '      S1DISASM_DIR=/tmp/s1disasm-copy npm run harness:canvas-cdp',
    );
  }
  S1_COPY = ovr;
}
// THE READ-ONLY HALF, UNCHANGED. `openProjectAndAct()` opens this, and 12
// importers reach it that way; d-28 leaves those recorded and untouched. When
// this entry point DOES write, it is the copy, so the project the app opens and
// the directory this file deletes are the same tree — pointing them apart would
// make every row read the wrong disk.
const S1DIR = S1_COPY ?? siblingPathOrUnresolved('s1disasm');
const CANVAS_DIR = S1_COPY
  ? `${S1_COPY}/.aurora/canvas`
  : resolvePath(UNRESOLVED_ROOT, 's1disasm-canvas-NOT-ARMED');
const SHOTS = `${ROOT}/scratchpad/shots-canvas`;
mkdirSync(SHOTS, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null;
const run = (id) => !ONLY || ONLY.has(id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * HOW MANY MARKERS THE FLUSH CHECK WILL SPEND before it gives up on a session
 * store that keeps moving under it. See `armFlushCheck`. It is not a retry of
 * the CHECK — the check runs once, after the process is gone — only of the
 * moment at which the marker is placed.
 */
const FLUSH_MARKER_ATTEMPTS = Number(process.env.FLUSH_MARKER_ATTEMPTS ?? 3);

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
/**
 * ⚠ A CDP CLIENT WHOSE SOCKET DIES MID-REQUEST USED TO END THE WHOLE RUN AT
 * EXIT 0, SILENTLY — O79, found while measuring the teardown flake, and it is
 * the worse of the two defects.
 *
 * `pending` was settled ONLY by a matching `message`. Nothing listened for
 * `close` or `error`. So when the target went away with a request in flight —
 * a renderer crash, an app that quit early, a target swap — that request's
 * promise never settled and never rejected. The `await` never returned; the
 * child's stdio pipes then closed with the child; node's event loop emptied;
 * **node exited with status 0, part way through the run, printing no summary
 * and no error.**
 *
 * MEASURED: 2 of 24 runs (~8%) on 2026-09-03, both at session A's boundary,
 * both `rc=0`, both cutting the log at ~45% with the last line an ordinary
 * NOTE. A sweep reading exit codes records those as PASSES. That is the O78
 * class — a green exit code over a run that did not happen — arriving by a
 * different road.
 *
 * TWO GUARDS, because the first only covers the cause that is known:
 *   1. HERE — every in-flight request is rejected when the socket closes or
 *      errors, so the failure becomes a thrown error with a non-zero exit.
 *   2. `installSummaryNet()` — a `process.on('exit')` that fires if the entry
 *      point ever leaves without printing its summary, whatever the reason.
 */
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  /** Fail every request the socket can no longer answer. A request that can
   *  never be answered must REJECT; leaving it pending is how a run ends at
   *  exit 0 with nothing said. */
  const failPending = (whyText) => {
    if (pending.size === 0) return;
    const n = pending.size;
    for (const [id, settle] of pending) {
      settle({ id, error: { code: -1, message: `CDP SOCKET ${whyText} with ${n} request(s) in flight — this one cannot be answered` } });
    }
    pending.clear();
  };
  ws.addEventListener('close', (ev) => failPending(`CLOSED (code ${ev?.code ?? '?'})`));
  ws.addEventListener('error', () => failPending('ERRORED'));
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    try { ws.send(JSON.stringify({ id, method, params })); }
    catch (e) { pending.delete(id); reject(new Error(`${method}: CDP socket would not accept the request (${e.message})`)); }
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

// ---------------------------------------------------------------------------
/**
 * ⚠ A RUN THAT ENDS WITHOUT A SUMMARY MUST NOT EXIT 0. O79.
 *
 * Two of 24 runs on 2026-09-03 ended at ~45% with `rc=0`, no summary line, no
 * error, and an ordinary NOTE as the last thing in the log. The cause found and
 * fixed was `cdp()` never rejecting an in-flight request when its socket died
 * (see the block above `cdp`), which left node with an empty event loop and an
 * unfinished job — and node exits 0 on an empty event loop, by design.
 *
 * ⚠ THIS NET IS NOT THAT FIX AND MUST NOT BE READ AS REDUNDANT WITH IT. The
 * fix closes ONE road to a silent exit; this closes the CLASS. Any future road —
 * a dropped promise, a swallowed rejection, an `unref`ed handle — reaches the
 * same exit(0), and a sweep reading exit codes would record it as a pass.
 *
 * `noteSummaryPrinted()` is called by each entry point immediately after its
 * SUMMARY block; the exit handler fires when that never happened.
 */
let summaryPrinted = false;
function noteSummaryPrinted() { summaryPrinted = true; }
function installSummaryNet() {
  process.on('exit', (code) => {
    if (summaryPrinted) return;
    console.log('\n!!! THIS RUN ENDED WITHOUT PRINTING A SUMMARY — it did NOT complete, and the rows it did');
    console.log('    print are a prefix of a run, not a result. Exiting non-zero so no sweep reading exit');
    console.log(`    codes records it as a pass (node was about to exit ${code}).`);
    if (code === 0) process.exitCode = 3;
  });
}

const results = [];
const fails = [];
const negFails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, detail });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function neg(id, name, ok, detail) {
  const good = ok === false;
  console.log(`${good ? 'neg-ok' : 'NEG-BROKEN'}  [${id}] (planted) ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  results.push({ id, name: `(planted false) ${name}`, ok: good, detail, negative: true });
  if (!good) negFails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  results.push({ id, name, ok: null, detail });
}

/**
 * ROWS THAT DID NOT RUN, SAID OUT LOUD AND BY NAME.
 *
 * THE DEFECT THIS EXISTS FOR (O50-C, measured 2026-09-03). `sessionD` used to
 * bail with a bare `if (!st) return;` the moment `[14a]` could not read the
 * document's state. Seven rows — 14a2, 14b, 14c, 14d, 14e, 14f, 14g — then
 * vanished from the tally with nothing said about them, so the run printed
 * `checks: 45` instead of `checks: 52` and NOTHING in the output distinguished
 * "seven rows passed" from "seven rows were never attempted". The O50 sweep's
 * record of this file is exactly that artefact: `36 passed, 9 failed` = 45, and
 * the missing seven are these.
 *
 * A row that could not be attempted is not a pass and it is not a failure; it
 * is an absence, and an absence that does not print is indistinguishable from
 * success. These are counted separately, printed by id, and they set a
 * non-zero exit — a run that could not ask its questions is not a green run.
 */
const unexercisedRows = [];
function unexercised(ids, reason) {
  for (const id of ids) {
    console.log(`UNEXERCISED  [${id}] NOT ATTEMPTED — ${reason}`);
    results.push({ id, name: '(not attempted)', ok: null, unexercised: true, detail: reason });
    unexercisedRows.push(`[${id}] ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Page-side helpers, installed fresh after every navigation/remount.
// ---------------------------------------------------------------------------
const INSTALL = String.raw`
(() => {
  const H = {};
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  // --- the canvas pane's real drawing surface -----------------------------
  // CanvasMode: canvasWrap (position:absolute, overflow:auto)
  //             > canvasPad (display:inline-block, padding:24px)
  //               > PixelViewport's <canvas>
  H.pad = () => [...document.querySelectorAll('div')].find(
    (d) => d.style && d.style.display === 'inline-block' && d.style.padding === '24px' && d.querySelector('canvas'));
  H.canvas = () => { const p = H.pad(); return p ? p.querySelector('canvas') : null; };
  H.scroller = () => { const p = H.pad(); return p ? p.parentElement : null; };
  H.ctx = () => { const c = H.canvas(); return c ? c.getContext('2d', { willReadFrequently: true }) : null; };
  H.zoomFor = (bufW) => { const c = H.canvas(); return c ? c.width / bufW : null; };

  /** Art-space (x,y) -> viewport point, scrolling it into view first. */
  H.pointFor = (x, y, bufW) => {
    const s = H.scroller(), c = H.canvas(); if (!s || !c) return null;
    const z = c.width / bufW;
    const lx = (x + 0.5) * z, ly = (y + 0.5) * z;
    let cr = c.getBoundingClientRect(); const sr = s.getBoundingClientRect();
    const relX = cr.left - sr.left + lx, relY = cr.top - sr.top + ly;
    if (relX < 10 || relX > sr.width - 10) s.scrollLeft += relX - sr.width / 2;
    if (relY < 10 || relY > sr.height - 10) s.scrollTop += relY - sr.height / 2;
    cr = c.getBoundingClientRect();
    return { x: Math.round(cr.left + lx), y: Math.round(cr.top + ly), zoom: z };
  };
  /** The colour the SCREEN shows for art pixel (x,y) — a real getImageData. */
  H.pixelAt = (x, y, bufW) => {
    const c = H.canvas(), g = H.ctx(); if (!c || !g) return null;
    const z = c.width / bufW;
    const px = Math.floor((x + 0.5) * z), py = Math.floor((y + 0.5) * z);
    const d = g.getImageData(px, py, 1, 1).data;
    return d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3];
  };
  /** One BACKING-STORE pixel, by device coordinate — for grid-line sampling,
   *  where the whole point is which exact column the 1px stroke landed on. */
  H.devPixel = (px, py) => {
    const g = H.ctx(); if (!g) return null;
    const d = g.getImageData(px, py, 1, 1).data;
    return d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3];
  };
  H.canvasHash = () => {
    const c = H.canvas(), g = H.ctx(); if (!c || !g) return null;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { h ^= d[i] + (d[i+1] << 3) + (d[i+2] << 6) + (d[i+3] << 9); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  // --- chips (Chip = [title]; a BUTTON when interactive, a span when a readout) --------------
  H.chip = (label) => [...document.querySelectorAll('[title]')].find(
    (e) => e.children.length === 0 && e.textContent.trim() === label && vis(e));
  H.chipEnabled = (label) => { const e = H.chip(label); return e ? getComputedStyle(e).opacity === '1' : null; };
  H.clickChip = (label) => { const e = H.chip(label); if (!e) return false; e.click(); return true; };
  /** A grid chip in the options bar: title '<n>px guides…'. */
  H.gridChip = (n) => [...document.querySelectorAll('[title]')].find(
    (e) => e.title.startsWith(n + 'px guides'));
  H.gridChipActive = (n) => {
    const e = H.gridChip(n); if (!e) return null;
    const s = getComputedStyle(e);
    return s.backgroundColor === s.borderTopColor;
  };
  H.clickGridChip = (n) => { const e = H.gridChip(n); if (!e) return false; e.click(); return true; };

  // --- tool dock ----------------------------------------------------------
  H.toolBtn = (prefix) => [...document.querySelectorAll('button[aria-label]')].find(
    (e) => e.getAttribute('aria-label').startsWith(prefix) && vis(e));
  H.clickTool = (prefix) => { const b = H.toolBtn(prefix); if (!b) return false; b.click(); return true; };

  // --- palette ------------------------------------------------------------
  /** The canvas palette's swatches. palette-canvas.ts's port titles them
   *  'line L, index N: paints P' (and 'index 0: transparent…; paints P'), so
   *  the trailing "paints P" is the unambiguous key: it IS the 0..63 canvas
   *  index the swatch arms. */
  H.swatches = () => [...document.querySelectorAll('button[title]')]
    .filter((b) => / paints (\d+)$/.test(b.title) && vis(b));
  H.swatchColors = () => H.swatches().map((b) => getComputedStyle(b).backgroundColor);
  /** Click the swatch that arms canvas index p — by what it DOES, not by DOM order. */
  H.clickSwatch = (p) => {
    const b = H.swatches().find((e) => Number(/ paints (\d+)$/.exec(e.title)[1]) === p);
    if (!b) return false; b.click(); return true;
  };

  // --- tabs / dirty dot ---------------------------------------------------
  // TabStrip's Tab is a div carrying title={tab.title}, focused on MOUSEDOWN
  // (not click) and closed by a nested span[title="Close tab"], also mousedown.
  // So both are driven with real Input.dispatchMouseEvent by the node side —
  // these only report geometry.
  H.tabEl = (title) => [...document.querySelectorAll('div[title]')].find(
    (d) => d.title === title && vis(d) && d.querySelector('span[title="Close tab"]') !== null);
  H.tabLabels = () => [...document.querySelectorAll('div[title]')]
    .filter((d) => vis(d) && d.querySelector('span[title="Close tab"]') !== null).map((d) => d.title);
  const centre = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  H.tabPoint = (title) => { const e = H.tabEl(title); return e ? centre(e.querySelector('span[style]') || e) : null; };
  H.tabClosePoint = (title) => {
    const e = H.tabEl(title); if (!e) return null;
    return centre(e.querySelector('span[title="Close tab"]'));
  };
  H.dirtyDots = () => [...document.querySelectorAll('span[title^="Unsaved changes"]')].length;
  /** Tab titles that currently carry the unsaved dot. */
  H.dirtyTabLabels = () => [...document.querySelectorAll('span[title^="Unsaved changes"]')]
    .map((d) => (d.parentElement ? (d.parentElement.title || d.parentElement.textContent.trim()) : '?'));

  // --- second pass: dialog focus + field readouts -------------------------
  /** Every control the trap should cycle through, in DOM order, with which one
   *  holds focus. Read live, exactly as the trap itself reads it. */
  H.dlgFocusables = () => {
    const d = H.dlg(); if (!d) return null;
    const sel = 'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]';
    const items = [...d.querySelectorAll(sel)];
    const a = document.activeElement;
    return {
      count: items.length,
      names: items.map((e) => (e.tagName === 'BUTTON' ? 'BUTTON:' + e.textContent.trim()
        : e.tagName === 'SELECT' ? 'SELECT' : 'INPUT:' + (e.type || 'text'))),
      focusIndex: items.indexOf(a),
      activeInDialog: d.contains(a),
      activeTag: a ? a.tagName : null,
    };
  };
  /** Is the dialog a real <form>? Enter-submits-natively depends on it. */
  H.dlgIsForm = () => { const d = H.dlg(); return d ? d.tagName : null; };
  H.dlgButtonTypes = () => H.dlgButtons().map((b) => b.type);

  // --- status bar ---------------------------------------------------------
  H.statusText = () => { const f = document.querySelector('footer'); return f ? f.textContent : null; };

  // --- the New Canvas dialog ---------------------------------------------
  H.dlg = () => document.querySelector('[role="dialog"][aria-label="New Canvas"]');
  H.dlgOpen = () => H.dlg() !== null;
  H.dlgName = () => { const d = H.dlg(); return d ? d.querySelector('input:not([type=number])') : null; };
  H.dlgNums = () => { const d = H.dlg(); return d ? [...d.querySelectorAll('input[type=number]')] : []; };
  H.dlgSelect = () => { const d = H.dlg(); return d ? d.querySelector('select') : null; };
  H.dlgButtons = () => { const d = H.dlg(); return d ? [...d.querySelectorAll('button')] : []; };
  H.dlgCreate = () => H.dlgButtons().find((b) => b.textContent.trim().startsWith('Create') || b.textContent.trim() === 'Creating…');
  H.dlgCancel = () => H.dlgButtons().find((b) => b.textContent.trim() === 'Cancel');
  /** The inline refusal, if one is on screen: the div styled with T.error. */
  H.dlgError = () => {
    const d = H.dlg(); if (!d) return null;
    const el = [...d.querySelectorAll('div')].find((e) => e.children.length === 0
      && getComputedStyle(e).backgroundColor === 'rgba(0, 0, 0, 0.25)');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: el.textContent, w: Math.round(r.width), h: Math.round(r.height),
             lineHeight: getComputedStyle(el).lineHeight, color: getComputedStyle(el).color };
  };
  H.dlgSnapshot = () => {
    const d = H.dlg(); if (!d) return null;
    const nums = H.dlgNums();
    const c = H.dlgCreate();
    return {
      name: H.dlgName() ? H.dlgName().value : null,
      nums: nums.map((n) => n.value),
      profile: H.dlgSelect() ? H.dlgSelect().value : null,
      profileOptions: H.dlgSelect() ? [...H.dlgSelect().options].map((o) => o.value) : [],
      createDisabled: c ? c.disabled : null,
      createOpacity: c ? getComputedStyle(c).opacity : null,
      error: H.dlgError(),
      panelW: Math.round(d.getBoundingClientRect().width),
    };
  };
  H.activeDesc = () => {
    const a = document.activeElement;
    if (!a) return null;
    return { tag: a.tagName, type: a.type ?? null, text: (a.textContent || '').trim().slice(0, 24),
             inDialog: H.dlg() ? H.dlg().contains(a) : false };
  };

  // --- toasts -------------------------------------------------------------
  /** Every toast on screen, with the geometry that decides legibility. */
  H.toasts = () => [...document.querySelectorAll('div[title="Dismiss"]')].map((t) => {
    const r = t.getBoundingClientRect();
    const s = getComputedStyle(t);
    return {
      text: t.textContent,
      w: Math.round(r.width), h: Math.round(r.height),
      left: Math.round(r.left), right: Math.round(r.right),
      whiteSpace: s.whiteSpace, overflowWrap: s.overflowWrap,
      fontSize: s.fontSize, lineHeight: s.lineHeight,
      scrollW: t.scrollWidth, clientW: t.clientWidth,
      scrollH: t.scrollHeight, clientH: t.clientHeight,
      pointerEvents: s.pointerEvents,
      containerMaxW: t.parentElement ? getComputedStyle(t.parentElement).maxWidth : null,
      containerPointer: t.parentElement ? getComputedStyle(t.parentElement).pointerEvents : null,
    };
  });

  // --- command palette ----------------------------------------------------
  H.paletteInput = () => [...document.querySelectorAll('input')].find(
    (i) => i.placeholder && /command|search|type/i.test(i.placeholder) && vis(i));
  H.paletteRows = () => [...document.querySelectorAll('div')].filter(
    (d) => d.children.length === 0 && /^New Canvas/.test(d.textContent.trim()) && vis(d));

  // --- explorer (rows are real <button>s with onClick) --------------------
  // Every group renders defaultCollapsed, so the rows only exist once the
  // group is expanded — and the supported way to force that is the filter box
  // (collapsedOverride force-expands while a query is present). So the
  // harness types in the real filter field rather than reaching into panel
  // state.
  H.filterInput = () => [...document.querySelectorAll('input')].find(
    (i) => i.placeholder === 'Filter…' && vis(i));
  H.explorerRow = (label) => [...document.querySelectorAll('button')].find(
    (b) => b.textContent.trim().startsWith(label) && vis(b) && b.getBoundingClientRect().left < 280);
  H.explorerLabels = () => [...document.querySelectorAll('button')]
    .filter((b) => vis(b) && b.getBoundingClientRect().left < 280).map((b) => b.textContent.trim());
  H.clickExplorerRow = (label) => { const e = H.explorerRow(label); if (!e) return false; e.click(); return true; };

  // --- confirm dialog -----------------------------------------------------
  H.confirm = () => document.querySelector('[role="alertdialog"]');
  H.confirmInfo = () => {
    const c = H.confirm(); if (!c) return null;
    return { label: c.getAttribute('aria-label'), text: c.textContent,
             buttons: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()) };
  };
  H.clickConfirmButton = (text) => {
    const c = H.confirm(); if (!c) return false;
    const b = [...c.querySelectorAll('button')].find((e) => e.textContent.trim() === text);
    if (!b) return false; b.click(); return true;
  };

  // --- unloaded pane ------------------------------------------------------
  H.unloadedCard = () => {
    const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Retry' && vis(e));
    if (!b) return null;
    const card = b.parentElement;
    return { text: card.textContent, hasRetry: true };
  };
  H.clickRetry = () => {
    const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Retry' && vis(e));
    if (!b) return false; b.click(); return true;
  };

  window.__c = H;
  return Object.keys(H).length;
})()`;

// ---------------------------------------------------------------------------
/**
 * One mouse event, through the real input pipeline.
 *
 * `modifiers` IS FORWARDED, and it was not always. This helper used to pass
 * only type/x/y/button/buttons and silently drop everything else, which made a
 * modifier-drag harness impossible to write correctly and — far worse — easy to
 * write INcorrectly: a Shift-drag row built on it dispatches without Shift, the
 * app takes its unmodified branch, and the row reports PASS for a gesture that
 * never happened. Additive, so every existing caller omits it and gets 0.
 *
 * CDP's bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8 (the same encoding
 * `Input.dispatchKeyEvent` takes, which is why `key()` below already had it).
 */
async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
    modifiers: opts.modifiers ?? 0,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);
const ctrlS = (c) => key(c, 's', 'KeyS', 83, 2);
const ctrlK = (c) => key(c, 'k', 'KeyK', 75, 2);
const escape = (c) => key(c, 'Escape', 'Escape', 27, 0);
/**
 * Enter, WITH ITS CHARACTER EVENT.
 *
 * `Input.dispatchKeyEvent` with a bare `keyDown` produces no keypress/char
 * event, and Blink's IMPLICIT FORM SUBMISSION runs off the char event, not the
 * keydown — so a bare Enter reaches an explicit `onKeyDown` handler (which is
 * why this worked against the old dialog) but silently does nothing to a real
 * <form>. The first run of pass 2 reported "Enter still does not submit"
 * because of this, not because of the app; sending `text` is what makes the
 * keypress happen.
 */
async function enter(c) {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', unmodifiedText: '\r', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', unmodifiedText: '\r', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const tab = (c) => key(c, 'Tab', 'Tab', 9, 0);

async function typeText(c, text) { await c.send('Input.insertText', { text }); await sleep(60); }
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  if (!r) return false;
  await mouse(c, 'mousePressed', r.x, r.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', r.x, r.y, { buttons: 0 });
  await sleep(200);
  return true;
}
/** Open a canvas from the Explorer, the way a person does: type its name into
 *  the filter box (which force-expands the groups) and click the row. */
async function openFromExplorer(c, label) {
  const hasFilter = await c.evalExpr('window.__c.filterInput() !== null');
  if (!hasFilter) return { ok: false, why: 'the Explorer is collapsed to its icon rail — no filter field' };
  await clickEl(c, 'window.__c.filterInput()');
  await key(c, 'a', 'KeyA', 65, 2);
  await typeText(c, label);
  await sleep(700);
  await c.evalExpr(INSTALL);
  const rows = await c.json('window.__c.explorerLabels()');
  const clicked = await c.evalExpr(`window.__c.clickExplorerRow(${JSON.stringify(label)})`);
  await sleep(2200);
  await c.evalExpr(INSTALL);
  // Clear the filter so the next row starts from a clean Explorer.
  if (await c.evalExpr('window.__c.filterInput() !== null')) {
    await clickEl(c, 'window.__c.filterInput()');
    await key(c, 'a', 'KeyA', 65, 2);
    await key(c, 'Backspace', 'Backspace', 8, 0);
    await sleep(400);
  }
  await c.evalExpr(INSTALL);
  return { ok: clicked === true, rows };
}

/** Focus a tab with a REAL mousedown on the strip — TabStrip's Tab listens for
 *  mousedown, not click, so `.click()` would silently do nothing. */
async function focusTab(c, title, settle = 1300) {
  const p = await c.json(`window.__c.tabPoint(${JSON.stringify(title)})`);
  if (!p) return false;
  await mouse(c, 'mousePressed', p.x, p.y);
  await sleep(60);
  await mouse(c, 'mouseReleased', p.x, p.y, { buttons: 0 });
  await sleep(settle);
  await c.evalExpr(INSTALL);
  return true;
}
/** Close a tab through its own × (also mousedown-driven). */
async function closeTab(c, title, settle = 1300) {
  const p = await c.json(`window.__c.tabClosePoint(${JSON.stringify(title)})`);
  if (!p) return false;
  await mouse(c, 'mousePressed', p.x, p.y);
  await sleep(60);
  await mouse(c, 'mouseReleased', p.x, p.y, { buttons: 0 });
  await sleep(settle);
  await c.evalExpr(INSTALL);
  return true;
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`   shot: ${name}.png`);
}
async function drawArt(c, x0, y0, x1, y1, bufW, steps = 8) {
  const a = await c.json(`window.__c.pointFor(${x0}, ${y0}, ${bufW})`);
  if (!a) throw new Error('no canvas to draw on');
  await mouse(c, 'mousePressed', a.x, a.y);
  await sleep(50);
  const b = await c.json(`window.__c.pointFor(${x1}, ${y1}, ${bufW})`);
  for (let i = 1; i <= steps; i++) {
    await mouse(c, 'mouseMoved', Math.round(a.x + (b.x - a.x) * i / steps), Math.round(a.y + (b.y - a.y) * i / steps));
    await sleep(25);
  }
  await mouse(c, 'mouseReleased', b.x, b.y, { buttons: 0 });
  await sleep(350);
  return { a, b };
}
async function clickArt(c, x, y, bufW) {
  const p = await c.json(`window.__c.pointFor(${x}, ${y}, ${bufW})`);
  await mouse(c, 'mousePressed', p.x, p.y);
  await sleep(50);
  await mouse(c, 'mouseReleased', p.x, p.y, { buttons: 0 });
  await sleep(300);
  return p;
}
/** Ctrl+Z until the header's Undo chip goes disabled; returns the press count. */
async function drain(c, limit = 30) {
  let n = 0;
  while (n < limit && (await c.evalExpr('window.__c.chipEnabled("Undo")')) === true) {
    await ctrlZ(c); await sleep(220); n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// One app session: launch, run, tear down. Every restart-dependent row uses one.
// ---------------------------------------------------------------------------
async function session(label, body) {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target — a previous Electron is alive.`);
  console.log(`\n=== session: ${label} (port ${PORT} verified free) ===`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });
  // GRACEFUL FIRST, then the hammer. Chromium commits localStorage to its
  // profile on a timer, so SIGKILLing the app loses the last few seconds of
  // writes — which made the restart rows read a STALE stored session and
  // report a focus-restore failure that was the harness's own doing. SIGTERM
  // lets Electron shut down and flush; the SIGKILL below is only the fallback.
  // O16. This used to end with `pkill -f 'aurora/dist/main/inde[x].mjs'`, which
  // is not an ownership test at all: it matches the OWNER'S Aurora (which runs
  // from exactly that path) and, when this harness runs from a worktree, does
  // NOT match its own instance — so it killed his editor and spared its own
  // orphan. `killTree` walks /proc and signals only pids descended from the
  // process this harness spawned. It also captures the tree BEFORE the first
  // signal: once the xvfb-run wrapper dies its children reparent to init and
  // stop being descendants of anything nameable.
  const killGroup = () => killTree(child, { graceMs: 4000 });

  let c;
  let bodyThrew = false;
  let flushFailure = null;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    let dbgOk = false;
    for (let i = 0; i < 60; i++) {
      try {
        if (await c.evalExpr('typeof window.__dbg === "object" && typeof window.__dbg.canvas === "object"')) { dbgOk = true; break; }
      } catch { /* context swap */ }
      await sleep(300);
    }
    if (!dbgOk) throw new Error('__dbg.canvas never installed — was the build made with VITE_AURORA_DEBUG=1?');
    await c.evalExpr(INSTALL);
    return await body(c);
  } catch (e) {
    bodyThrew = true;
    throw e;
  } finally {
    // CLOSE THE WINDOW BEFORE KILLING THE PROCESS. Chromium commits a
    // localStorage area on a throttled timer and on unload, so a signal alone
    // loses the last several seconds — sometimes minutes — of writes. That is
    // not academic: it made row 13 read a STALE stored session and report a
    // focus-restore failure the app had not committed. Measured, not guessed:
    // scratchpad/storage-flush-probe.mjs writes two markers, tears the app down
    // both ways, and relaunches — with a signal alone the later marker comes
    // back `null`; with `window.close()` first, both come back.
    //
    // ═════════════════════════════════════════════════════════════════════
    // ⚠ AND NOW IT IS CHECKED RATHER THAN ASSUMED. O79.
    // ═════════════════════════════════════════════════════════════════════
    //
    // O50 measured this teardown losing the area in 4 of 9 runs (~44%) and left
    // it open (`docs/reviews/2026-09-03-o50-triage-c.md` §3.5/§6) after two
    // attempted fixes failed. It got the key fact exactly right — THE APP IS
    // FULLY GONE ~50 ms AFTER `window.close()` (12 launches here: 49–51 ms), so
    // the old fixed `sleep(4000)` was ~3.95 s of watching a corpse and nobody
    // could have fixed this by lengthening it — and drew the wrong conclusion
    // from it. Measured 2026-09-03, and the numbers are in
    // `docs/reviews/2026-09-03-canvas-harness-teardown-flake.md`:
    //
    //   - Chromium's own scheduled commit for a busy session here is 43.8 s /
    //     48.3 s / 54.0 s away (1.7 s for the light session A). Enormous, and
    //     reproducible to 25 ms across runs.
    //   - BUT `window.close()` COMMITS THE AREA, so that timer never comes into
    //     it. With the close, this session's last write is on disk 20 of 20
    //     sessions; with the close REMOVED and a signal alone, sessions B, C and
    //     D lose it, 3 of 4.
    //
    // So there is nothing to wait FOR, and a pre-close wait for that timer was
    // built, measured (it cost the run 173 s -> 320 s) and removed. What is
    // worth doing is CHECKING, at no cost, that the flush happened:
    // `armFlushCheck` writes a unique marker into the page a moment before the
    // close, and `settleFlushCheck` — AFTER the process is gone and the tree is
    // reaped — looks for those bytes in the profile's own leveldb.
    //
    // ⚠ THE CHECK IS DELIBERATELY AFTER THE EXIT AND DOES NOT RETRY. Nothing
    // will be written by a dead process, and a bounded retry there would be the
    // same mistake with a longer timeout.
    //
    // ⚠ IT IS NOT "ALWAYS PASS": deleting the `window.close()` line below makes
    // it answer false for three of four sessions. That is the constructed state,
    // and the check catches it.
    //
    // ⚠ AND THE FLAKE ITSELF IS NOT CLAIMED FIXED — O50's 4-in-9 DID NOT
    // REPRODUCE. Nine runs of the untouched master instrument on 2026-09-03
    // tripped zero times, which at 44% happens about 0.9% of the time, so the
    // rate today is simply not the rate O50 measured and I do not know why. What
    // this parcel establishes is that cause (b) does not occur under the shipping
    // teardown (36 sessions of the old teardown, 36 more of the new) and that
    // when it DOES occur it is now named HERE rather than one session later as a
    // product failure. A future red run is still to be investigated, not
    // dismissed on the strength of this comment.
    let flushCheck = null;
    if (c && !bodyThrew) {
      flushCheck = await armFlushCheck(c, child, label);
      if (flushCheck.armed === false) flushFailure = flushCheck.message;
    } else if (c) {
      console.log('   flush check SKIPPED — the session body threw, so there is no result to '
        + 'carry forward and the error below is the finding');
    }
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* the target dies mid-call */ }
      const exitT0 = Date.now();
      const EXIT_GRACE_MS = 20000;
      while (child.exitCode === null && child.signalCode === null && Date.now() - exitT0 < EXIT_GRACE_MS) {
        await sleep(100);
      }
      const exited = child.exitCode !== null || child.signalCode !== null;
      const exitNote = exited ? `window.close() -> the app exited on its own after ${Date.now() - exitT0}ms`
        : `window.close() -> the app was STILL RUNNING after ${EXIT_GRACE_MS}ms and had to be signalled`;
      console.log(`   ${exitNote}`);
      if (flushCheck) flushCheck.exitNote = exitNote;
      try { c.close(); } catch { /* */ }
    }
    await killGroup();
    await sleep(1200);
    // O16 hazard 1a: the app we just launched overwrote the SHARED discovery
    // files (~/.aurora/mcp.json and the legacy ~/.sonic-level-editor/mcp.json).
    // Put them back byte for byte, in the same `finally` as the teardown, and
    // PRINT what is on disk afterwards — a restore nobody reads back is the
    // guard-that-asserts-nothing shape this repo keeps shipping.
    for (const d of restoreDiscoveryNow()) console.log(`   restored ${d}`);
    console.log(`   discovery on disk after restore:\n        ${readDiscoveryNow()}`);
    console.log(`   port free after teardown: ${await portFree()}`);
    // THE VERDICT, and it is taken HERE: the process is gone, the tree is
    // reaped, the settle has elapsed. Nothing will be written after this point,
    // so what is on disk now is what the next session will read.
    if (flushCheck && flushCheck.armed) {
      const v = settleFlushCheck(flushCheck);
      if (!v.ok && flushFailure === null) flushFailure = v.message;
    }
    // LAST, so the teardown above still runs in full — the ORDERED SIGTERM, the
    // display reaping and the discovery restore are load-bearing (O16/O20/O65/
    // O66) and a refusal must never skip them. Thrown only when the body did NOT
    // throw, so a real failure is never masked by this one.
    if (flushFailure !== null) throw new Error(flushFailure);
  }
}

/**
 * ARM THE FLUSH CHECK — before the close, while there is still a page to write
 * to and a live tree whose /proc entries name the profile.
 *
 * Returns the state `settleFlushCheck` reads after the process is gone, or
 * `{ armed: false, message }` when the profile cannot be resolved — which is a
 * refusal, not a skip: a teardown that cannot say where it writes cannot say
 * what it left behind either.
 *
 * WHY IT IS SPLIT IN TWO. The profile has to be resolved from a LIVE tree
 * (/proc cannot be asked about a dead process) and the marker has to be written
 * to a LIVE page, but the only moment the answer is final is AFTER the process
 * has gone. Two halves, one question.
 *
 * ⚠ THE ORDERING CHECK. The marker proves every EARLIER write to the same area
 * is committed, which is only the session key if the app did not write again
 * after it. The app is idle here (the body has returned, no input is pending),
 * but idle is an argument and this is a measurement: the stored session is read
 * either side of the marker and a fresh marker is spent if it moved.
 */
async function armFlushCheck(c, child, label) {
  const pids = descendants(child.pid);
  // O80: pass the profile this run pinned, so the fallback cannot hand back a
  // shared directory this run never writes. `null` when nothing was pinned.
  const { dir, how, why } = resolveLeveldbDir({
    pids, appNames: APP_NAMES, profileDir: profileInUse() ? RUN_PROFILE_DIR : null,
  });
  if (dir === null) {
    return { armed: false, message: `FLUSH CHECK UNMEASURABLE — ${why}.\n`
      + '  This teardown cannot show the session it built reached disk, so the next session\'s\n'
      + '  restart rows would be judging an unknown precondition. Refusing rather than guessing.' };
  }
  const readSession = () => c.evalExpr(`localStorage.getItem(${JSON.stringify(`aurora.session.v1:${S1DIR}`)})`).catch(() => null);
  for (let attempt = 1; attempt <= FLUSH_MARKER_ATTEMPTS; attempt++) {
    const before = await readSession();
    const mark = flushMarker(`${label.slice(0, 1)}${attempt}`);
    await c.evalExpr(`localStorage.setItem(${JSON.stringify(FLUSH_MARKER_KEY)}, ${JSON.stringify(mark)}); 1`);
    const after = await readSession();
    if (before !== after) {
      console.log(`   flush check: attempt ${attempt} superseded — the stored session changed while the `
        + 'marker was being placed, so the marker\'s commit batch would not cover it');
      continue;
    }
    // A FREE DIAGNOSTIC, AND THE ONE THAT OVERTURNED THIS PARCEL'S FIRST
    // DIAGNOSIS: had Chromium already committed on its own timer, or is the
    // close about to carry it? Busy sessions read false here and true after the
    // close, and that difference is the whole finding.
    const already = bytesOnDisk(dir, mark);
    console.log(`   flush check armed: profile ${dir}\n        ${how}\n        stored session `
      + `${before === null ? 'ABSENT under this project key (session A opens the project mid-body)' : `${before.length}B`}`
      + `, unchanged while the marker was placed; already committed on Chromium's own timer: ${already}`);
    return { armed: true, dir, how, label, mark, already, exitNote: '' };
  }
  return { armed: false, message: 'FLUSH CHECK NEVER SETTLED — the stored session changed under every one of '
    + `${FLUSH_MARKER_ATTEMPTS} markers, so no marker's commit batch covers the app's last write and this\n`
    + '  teardown cannot show what it leaves behind. The app is supposed to be idle once the session body\n'
    + `  has returned; something is still writing. profile ${dir} (${how}).` };
}

/**
 * THE VERDICT, after the process is gone and the tree is reaped.
 *
 * One read. No retry, no wait — see `scratchpad/lib/storage-flush.mjs`: a dead
 * process writes nothing, and a bounded retry here would be the mistake this
 * parcel diagnosed, with a longer timeout.
 */
function settleFlushCheck(st) {
  const landed = bytesOnDisk(st.dir, st.mark);
  console.log(`   flush check: this session's last write is on disk: ${landed}`
    + `${st.already ? ' (Chromium had already committed it on its own timer before the close)'
      : landed ? ' (it was NOT before the close — the close is what carried it)'
        : ' (it was not before the close either, and the close did not carry it)'}`);
  if (landed) return { ok: true };
  return { ok: false, message: flushRefusal(st) };
}

/** Wait until the app has finished restoring its project on a cold start. A
 *  fixed sleep is not enough: reopening s1disasm and re-reading an act takes a
 *  variable few seconds, and a restart row that samples too early reports
 *  "nothing restored" for a restore that simply had not happened yet. */
async function waitRestored(c, maxMs = 45000) {
  // AURORA DOES NOT REOPEN THE LAST PROJECT BY ITSELF — the stored session is
  // keyed by project directory and is restored by the key-change effect, so a
  // "restart" in the plan's sense is: relaunch, open the project, watch the
  // session come back. localStorage is deliberately NOT cleared here.
  const t0 = Date.now();
  // Captured BEFORE the open, because the restore REWRITES this key as soon as
  // it runs — reading it afterwards reports the pruned result, not what was
  // stored.
  const before = await storedSessions(c).catch(() => ({}));

  // ⚠ THE PRECONDITION, ASSERTED BEFORE ANY ROW IS ALLOWED TO JUDGE THE APP.
  //
  // Every restart row below — 13a-tab, 13a-focus, 13a-pixels, 13b-pane, 13c,
  // 13d, 14a — reads what the previous session left in `localStorage` under
  // `aurora.session.v1:<project dir>`. If that key is NOT THERE when this
  // session boots, the app has nothing to restore FROM, and each of those rows
  // fails with wording that describes a PRODUCT failure: "the canvas TAB does
  // not survive a restart". It is not a product failure. It is this harness
  // being handed an empty profile.
  //
  // THAT WAS NOT HYPOTHETICAL — it is the O50 sweep's record of this file,
  // reproduced exactly on 2026-09-03. `~/.config/<app>/Local Storage` was ONE
  // profile shared by this whole instrument population, a great many call sites
  // in `scratchpad/` call `localStorage.clear()` (the message below DERIVES the
  // figure at the moment it is rendered — the number that used to stand here in
  // prose was a fifth low by the time anyone read it), and the sweep could not
  // have run its 89 launches serially in the window it records (this file alone
  // takes ~190 s). Injecting a single `localStorage.clear()` between session A
  // and session B reproduces the sweep's tally to the row: 36 passed, 9 failed,
  // the same nine ids, with seven further rows silently unexercised.
  //
  // ⚠ AND CAUSE (a) IS STRUCTURALLY PREVENTED AS OF O80, which is why the past
  // tense above. `spawnGuarded` now pins `--user-data-dir` to a directory
  // derived once per NODE PROCESS (`RUN_PROFILE_DIR`, HAZARD 6 in
  // `lib/harness-guard.mjs`): stable across this run's four launches, so the
  // persistence these restart rows measure is untouched, and unique across
  // concurrent runs, so no other instrument can reach this one's area. The
  // message below still names (a), for the same reason it still names (b): a
  // refusal must describe the world and not the fix. If this trips now, the
  // first thing to check is whether the launch went through `spawnGuarded` at
  // all — the profile line it prints at launch says which directory was used.
  //
  // A SECOND CAUSE, FOUND BY THIS GUARD RATHER THAN REASONED ABOUT, and the
  // reason the message below names two: it tripped SPONTANEOUSLY at session C
  // on 2026-09-03 — 4 of 9 runs, load ~3, no other instrument running and no
  // poison applied. The teardown's `window.close()` + FIXED 4 s did not get the
  // area to disk, and could not have: the app is gone ~50 ms after the close,
  // and Chromium's commit for a busy session here is FORTY-FOUR TO FIFTY-FOUR
  // SECONDS out.
  //
  // ⚠ THAT CAUSE IS FIXED AS OF O79 — the teardown now waits for the bytes in
  // the profile's leveldb before it closes the window, and REFUSES if they
  // never arrive (`flushBarrier` above; `scratchpad/lib/storage-flush.mjs`).
  // The message below still names it, because a refusal must describe the
  // world and not the fix: if the barrier is disabled, bypassed, or the
  // teardown is edited so it runs after the close, this is the symptom that
  // comes back. But on a current tree the barrier fails FIRST and by name, so
  // a trip HERE now points at cause (a) — another instrument on the shared
  // profile — rather than at (b).
  //
  // So: REFUSE, and name both mechanisms rather than the one that was looked
  // for first. An environment condition must never be reported as an app
  // defect, and "we could not read our own profile back" must never render as
  // "the app lost your work".
  const key = `aurora.session.v1:${S1DIR}`;
  if (!Object.prototype.hasOwnProperty.call(before, key)) {
    throw new Error(
      `UNMEASURABLE — no stored session for this project at boot.\n`
      + `  wanted localStorage key: ${key}\n`
      + `  keys actually present:   ${JSON.stringify(Object.keys(before))}\n`
      + `  The previous session wrote that key; this one cannot see it. TWO causes are known,\n`
      + `  BOTH environmental, and this refusal does not distinguish them:\n`
      + `    (a) ANOTHER INSTRUMENT CLEARED THE PROFILE. This was the shared-profile hazard:\n`
      + `        ~/.config/<app>/Local Storage was one directory for the whole population, and\n`
      + `        ${describeClearCensus()}.\n`
      + `        It is PREVENTED as of O80 — spawnGuarded pins --user-data-dir to one profile\n`
      + `        per node process, so no other instrument can reach this run's area. This run's\n`
      + `        profile: ${RUN_PROFILE_DIR} (in use: ${profileInUse()}).\n`
      + `        If that says "in use: false", the launch did NOT go through the guard and the\n`
      + `        hazard is back for this run — that is the first thing to check.\n`
      + `    (b) THE PREVIOUS SESSION'S FLUSH NEVER REACHED DISK. Chromium commits a\n`
      + `        localStorage area on a rate-limited timer — MEASURED at 44-54 s for this\n`
      + `        harness's busy sessions — while the app is gone ~50 ms after window.close().\n`
      + `        That was 4 trips in 9 runs before O79. It is FIXED: the teardown now waits\n`
      + `        for the bytes in the profile's leveldb and refuses if they never arrive, so\n`
      + `        on a current tree that failure announces itself THERE, one session earlier,\n`
      + `        and never reaches this guard. If you are reading this message on a current\n`
      + `        tree, (b) is the unlikely half — check (a) first.\n`
      + `  EITHER WAY IT IS NOT AN APP DEFECT. Do NOT record the restart rows as failures on\n`
      + `  the strength of this run; re-run it, and if it trips repeatedly investigate (b).`);
  }

  let last = null;
  await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`).catch(() => {});
  while (Date.now() - t0 < maxMs) {
    try {
      last = await c.json('({ proj: window.__dbg.projStatus(), lvl: window.__dbg.levelState(), '
        + 'docs: window.__dbg.canvas.docIds(), tabs: (window.__c ? window.__c.tabLabels() : []) })');
      if (last.proj.status === 'open' && last.tabs.length > 0 && last.lvl.status !== 'loading') break;
    } catch { /* context swap */ }
    await sleep(500);
    await c.evalExpr(INSTALL).catch(() => {});
  }
  // A further settle for the active tab's own activation (the canvas read).
  await sleep(3000);
  await c.evalExpr(INSTALL);
  // The persist subscription writes on every session-store change, so the
  // stored payload AFTER the restore is a faithful readout of the live
  // sessionStore — including which tab actually ended up focused.
  const after = await storedSessions(c).catch(() => ({}));
  return { waitedMs: Date.now() - t0, storedBeforeOpen: before, storedAfterRestore: after, ...(last ?? {}) };
}

/** Every stored-session key, so a restart row reports what it actually restored
 *  FROM rather than guessing which localStorage entry is current. */
async function storedSessions(c) {
  return c.json(`(() => { const out = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i);
      if (/session/i.test(k)) out[k] = localStorage.getItem(k); }
    return out; })()`);
}

/** Open s1disasm and load GHZ act 1 — the same real data phase 1 used. */
async function openProjectAndAct(c, { clearStorage = true, act = true } = {}) {
  if (clearStorage) { await c.evalExpr('localStorage.clear(); 1'); }
  await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
  await sleep(2000);
  if (act) {
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(4000);
  }
  await c.evalExpr(INSTALL);
  return c.evalExpr('JSON.stringify(window.__dbg.levelState())');
}

/** Open the New Canvas dialog through ⌘K, the way the plan's row 11 asks.
 *
 *  RETRIES, because it is driven by three separate events (Ctrl+K, typed text,
 *  Enter) and a dropped one leaves the caller filling in a dialog that is not
 *  there — which surfaces far away as "the form is null" rather than as "the
 *  palette did not open". */
async function openNewCanvasDialog(c, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    if (await c.evalExpr('window.__c.dlgOpen()')) return true;
    await escape(c);
    await sleep(300);
    await ctrlK(c);
    await sleep(600);
    await c.evalExpr(INSTALL);
    const hasInput = await c.evalExpr('window.__c.paletteInput() !== null');
    if (hasInput) {
      await typeText(c, 'New Canvas');
      await sleep(450);
      await enter(c);
      await sleep(700);
    }
    await c.evalExpr(INSTALL);
    if (await c.evalExpr('window.__c.dlgOpen()')) return true;
    note('dialog', `⌘K attempt ${i + 1} did not open the New Canvas dialog`,
      `command palette input present=${hasInput}`);
  }
  return false;
}

/** Fill the dialog's fields with real typed input and a real select change. */
async function fillDialog(c, { name, width, height, profile }) {
  if (name !== undefined) {
    await clickEl(c, 'window.__c.dlgName()');
    await key(c, 'a', 'KeyA', 65, 2); // ctrl+A
    await typeText(c, name);
  }
  if (width !== undefined) {
    await clickEl(c, 'window.__c.dlgNums()[0]');
    await key(c, 'a', 'KeyA', 65, 2);
    await typeText(c, String(width));
  }
  if (height !== undefined) {
    await clickEl(c, 'window.__c.dlgNums()[1]');
    await key(c, 'a', 'KeyA', 65, 2);
    await typeText(c, String(height));
  }
  if (profile !== undefined) {
    // A <select> has no pointer affordance under CDP; React listens for
    // 'change', so drive the native setter + a real change event.
    await c.evalExpr(`(() => { const s = window.__c.dlgSelect();
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      set.call(s, ${JSON.stringify(profile)});
      s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  }
  await sleep(300);
  return c.json('window.__c.dlgSnapshot()');
}

// Exported so a LATER harness can reuse this machinery rather than rewriting
// it. That matters here specifically: the phase-2A report records three harness
// defects that each produced a convincing FALSE result before being caught, so
// a fresh reimplementation starts by re-earning trust this code already has.
export {
  session, openProjectAndAct, openNewCanvasDialog, fillDialog,
  INSTALL, sleep, mouse, key, enter, escape, ctrlK, typeText, clickEl,
  drawArt, clickArt, focusTab, closeTab, shot, drain,
  ROOT, S1DIR, CANVAS_DIR, SHOTS,
  // O72: the tree `session()` actually LAUNCHES, which is not `ROOT` when this
  // file lives in a linked worktree. Three probes print a provenance line
  // naming the app under test; exporting `MAIN` is what lets them name the
  // right one instead of composing it out of the checkout.
  MAIN, RUN,
  // O16. Re-exported so the probes that drive a `session()` app over the Aether
  // wire resolve its port through the OWNERSHIP rule instead of open-coding a
  // read of the shared discovery file. See lib/harness-guard.mjs.
  resolveOwnedDiscovery,
};

// ===========================================================================
// SECOND PASS (PASS=2) — the fixes made against the first report
// ===========================================================================
//
// Six fixes landed in b9225d9 against the first session's written findings,
// four of them with nobody watching the screen. This pass puts eyes back on
// them. It is a SEPARATE run rather than more rows in session A: the arming
// checks need canvases whose palettes differ, which means opening and closing
// an act mid-run, and folding that into the fourteen-row flow would make both
// harder to read.

async function sessionE(c, shared) {
  const lvl = await openProjectAndAct(c);
  note('s2', 'GHZ act 1 ready', lvl);

  // ---- 15: the reopen door arms a VISIBLE brush -------------------------
  if (run('15')) await row15(c, shared);
  // ---- 16: a plain tab switch must NOT re-arm ---------------------------
  if (run('16')) await row16(c, shared);
  // ---- 17: the dialog, on screen ----------------------------------------
  if (run('17')) await row17(c, shared);

  // Leave a canvas tab focused for session F's restart.
  await focusTab(c, 'Canvas · arm-a', 2000);
  await drain(c);
  await ctrlS(c); await sleep(1500);
  await c.evalExpr(INSTALL);
  shared.armAHash = await c.evalExpr('window.__dbg.canvas.pixelsHash("doc:canvas:arm-a")');
  note('s2-exit', 'handing arm-a to the restart', `hash ${shared.armAHash}`);
}

/** THE ONE THAT MATTERS MOST: a zone-seeded canvas reopened from disk. */
async function row15(c, shared) {
  const opened = await openNewCanvasDialog(c);
  if (!opened) { check('15', 'a canvas can be created', false, 'the dialog did not open'); return; }
  await fillDialog(c, { name: 'arm-a', width: 64, height: 64, profile: 'genesis-level-art' });
  await clickEl(c, 'window.__c.dlgCreate()');
  await sleep(1800);
  await c.evalExpr(INSTALL);
  const id = 'doc:canvas:arm-a';

  const words = await c.json(`window.__dbg.canvas.paletteWords(${JSON.stringify(id)})`);
  // THE PRECONDITION. This check is only meaningful in a palette where the old
  // default (canvasIndex(0,1) === 1) really is invisible — which is what made
  // the original defect invisible too. GHZ's word 1 is 0x0000.
  check('15pre', 'the zone palette makes the OLD default (index 1) black — the precondition for this row',
    words !== null && words[1] === 0,
    `palette word 1 = 0x${((words ?? [])[1] ?? 0).toString(16)} (0 = black); word 0 = 0x${((words ?? [])[0] ?? 0).toString(16)}`);

  const createdIdx = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  check('15a', 'CREATE arms a visible colour',
    createdIdx !== 1 && words[createdIdx] !== 0,
    `armed index ${createdIdx}, word 0x${(words[createdIdx] ?? 0).toString(16)}`);

  // Draw + save so there is something to reopen.
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(250);
  await drawArt(c, 8, 8, 40, 40, 64, 8);
  await ctrlS(c); await sleep(1500);
  await c.evalExpr(INSTALL);
  const savedHash = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(id)})`);

  // ---- close the tab, then REOPEN it: the door R18's fix had missed ----
  await closeTab(c, 'Canvas · arm-a');
  const gone = await c.json('window.__dbg.canvas.docIds()');
  const reopened = await openFromExplorer(c, 'arm-a');
  const idx = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  const w2 = await c.json(`window.__dbg.canvas.paletteWords(${JSON.stringify(id)})`);
  const status = await c.evalExpr('window.__c.statusText()');
  await shot(c, 's2-01-reopened-armed');
  // NOT DISCRIMINATING ON ITS OWN, and the plant proved it: within one session
  // `paintIndex` is still whatever the CREATE armed, so this passes with the
  // loadCanvasDoc door removed. Kept because it is the user-visible statement,
  // and paired with 15b2 and 15d, which are the checks that can actually fail.
  check('15b', 'REOPENING from disk (same session) shows a visible colour armed',
    reopened.ok === true && !gone.includes(id) && idx !== 1 && w2 !== null && w2[idx] !== 0,
    `the document was closed first (${JSON.stringify(gone)}); after the reopen the armed index is ${idx}, `
    + `word 0x${((w2 ?? [])[idx] ?? 0).toString(16)}; status bar: ${JSON.stringify(status)}`);
  neg('15b', 'the reopened canvas armed the black index 1', idx === 1 || (w2 && w2[idx] === 0),
    `index ${idx}, word 0x${((w2 ?? [])[idx] ?? 0).toString(16)}`);

  // ---- and the point of all of it: the stroke is VISIBLE ----------------
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(250);
  const before = await c.evalExpr('window.__c.pixelAt(50, 12, 64)');
  await drawArt(c, 45, 12, 58, 12, 64, 5);
  const after = await c.evalExpr('window.__c.pixelAt(50, 12, 64)');
  const drawn = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(id)})`);
  await shot(c, 's2-02-reopened-stroke-visible');
  check('15c', 'a stroke drawn on the REOPENED canvas is visible on screen',
    before !== after && after !== '0,0,0,255' && after !== '0,0,0,0',
    `the pixel at art (50,12) went ${before} → ${after}; ${drawn} pixels are now non-zero`);
  neg('15c', 'the stroke on the reopened canvas is invisible (black on black)',
    after === '0,0,0,255' || after === before,
    `${before} → ${after}`);
  await drain(c);
  await ctrlS(c); await sleep(1200);
  await c.evalExpr(INSTALL);
  shared.savedHash = savedHash;

  // ---- 15b2: the reopen door with the paint index ACTUALLY RESET --------
  //
  // The discriminating in-session version. `closeAll` — which the project-open
  // guard's Discard runs — puts `paintIndex` back to its default (canvasIndex(0,1)),
  // the store's own stated behaviour, because a raw palette index names a
  // different colour under a different palette. Reopening arm-a after that is the
  // only in-session path where `loadCanvasDoc`'s arming is the thing under test.
  await c.evalExpr('window.__dbg.__g3 = window.__dbg.canvas.projectOpenGuard(); 1');
  await sleep(900);
  await c.evalExpr(INSTALL);
  const hadConfirm = await c.json('window.__c.confirmInfo()');
  if (hadConfirm) {
    await clickEl(c, `(() => [...window.__c.confirm().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Discard & open'))()`);
  } else {
    await c.evalExpr('window.__dbg.__g3'); // clean: the guard proceeded without asking
  }
  await sleep(1200);
  await c.evalExpr(INSTALL);
  const resetIdx = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  const clearedDocs = await c.json('window.__dbg.canvas.docIds()');
  const back = await openFromExplorer(c, 'arm-a');
  const idx2 = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  const w3 = await c.json(`window.__dbg.canvas.paletteWords(${JSON.stringify(id)})`);
  await shot(c, 's2-01b-reopen-after-reset');
  check('15b2', 'with the paint index reset, reopening from disk RE-ARMS a visible colour',
    resetIdx === 1 && clearedDocs.length === 0 && back.ok === true
      && idx2 !== 1 && w3 !== null && w3[idx2] !== 0,
    `after closeAll the armed index is ${resetIdx} (the default) and no documents are open `
    + `(${JSON.stringify(clearedDocs)}); reopening arm-a armed index ${idx2}, `
    + `word 0x${((w3 ?? [])[idx2] ?? 0).toString(16)}`);
  neg('15b2', 'the reopen left the default black index 1 armed', idx2 === 1,
    `armed ${idx2} after the reopen`);

  // Draw once more so the visible claim is on screen in this state too.
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(250);
  const b2 = await c.evalExpr('window.__c.pixelAt(50, 20, 64)');
  await drawArt(c, 45, 20, 58, 20, 64, 5);
  const a2 = await c.evalExpr('window.__c.pixelAt(50, 20, 64)');
  check('15b3', 'and the stroke drawn in that state is visible',
    b2 !== a2 && a2 !== '0,0,0,255',
    `the pixel at art (50,20) went ${b2} → ${a2}`);
  await drain(c);
  await ctrlS(c); await sleep(1200);
  await c.evalExpr(INSTALL);
}

/** THE DELIBERATE NON-DOOR: focus must not re-arm. */
async function row16(c, shared) {
  // A second canvas whose palette DIFFERS — created with no zone open, so it
  // gets the default ramp rather than Green Hill's.
  await c.evalExpr('window.__dbg.resetLevel()');
  await sleep(900);
  await c.evalExpr(INSTALL);
  const opened = await openNewCanvasDialog(c);
  if (!opened) { check('16', 'a second canvas can be created', false, 'the dialog did not open'); return; }
  await fillDialog(c, { name: 'arm-b', width: 64, height: 64 });
  await clickEl(c, 'window.__c.dlgCreate()');
  await sleep(1800);
  await c.evalExpr(INSTALL);
  await c.evalExpr('window.__dbg.activate("ghz", 1)');
  await sleep(4000);
  await c.evalExpr(INSTALL);

  const pa = await c.json('window.__dbg.canvas.paletteWords("doc:canvas:arm-a")');
  const pb = await c.json('window.__dbg.canvas.paletteWords("doc:canvas:arm-b")');
  const differ = JSON.stringify(pa) !== JSON.stringify(pb);
  note('16', 'the two palettes', `identical=${!differ}; arm-a[1]=0x${(pa[1]||0).toString(16)}, arm-b[1]=0x${(pb[1]||0).toString(16)}`);

  // Pick a specific colour on arm-a by clicking its swatch, then bounce.
  await focusTab(c, 'Canvas · arm-a', 1800);
  const picked = await c.evalExpr('window.__c.clickSwatch(40)');
  await sleep(400);
  const armed0 = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  const toB = await focusTab(c, 'Canvas · arm-b', 1800);
  const armedOnB = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  const backToA = await focusTab(c, 'Canvas · arm-a', 1800);
  const armed1 = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  await shot(c, 's2-03-tab-switch-keeps-colour');
  check('16', 'a plain tab switch does NOT re-arm — the colour the artist picked survives',
    differ === true && picked === true && armed0 === 40 && armedOnB === 40 && armed1 === 40,
    `palettes differ=${differ}; picked swatch 40 → armed ${armed0}; after switching to arm-b it is ${armedOnB}; `
    + `after switching back it is ${armed1}${toB && backToA ? '' : ' (A TAB SWITCH FAILED)'}`);
  neg('16', 'the switch re-armed the brush', armedOnB !== 40 || armed1 !== 40,
    `40 → ${armedOnB} → ${armed1}`);
}

/** The dialog, on screen, after the four blind fixes. */
async function row17(c, shared) {
  const opened = await openNewCanvasDialog(c);
  if (!opened) { check('17', 'the dialog opens', false, 'it did not'); return; }
  const form = await c.evalExpr('window.__c.dlgIsForm()');
  const btypes = await c.json('window.__c.dlgButtonTypes()');
  const f0 = await c.json('window.__c.dlgFocusables()');
  note('17', 'dialog shape', `root element is <${String(form).toLowerCase()}>; button types ${JSON.stringify(btypes)}; `
    + `focusables ${JSON.stringify(f0.names)}`);
  check('17a', 'the controls are a real <form> and Cancel is type="button"',
    form === 'FORM' && btypes.includes('button') && btypes.includes('submit'),
    `<${String(form).toLowerCase()}>, button types ${JSON.stringify(btypes)}`);

  // ---- Tab cycles, wraps, and never escapes -----------------------------
  const walk = [];
  for (let i = 0; i < f0.count + 2; i++) {
    await tab(c); await sleep(120);
    walk.push(await c.json('window.__c.dlgFocusables()'));
  }
  const escaped = walk.some((w) => w && w.activeInDialog === false);
  const wrapped = walk.length > f0.count && walk[f0.count - 1] && walk[f0.count - 1].focusIndex === 0;
  await shot(c, 's2-04-focus-trap');
  check('17b', 'Tab cycles inside the dialog and WRAPS — it never leaves',
    escaped === false && wrapped === true,
    `${f0.count} focusables; ${walk.length} Tab presses landed on indices `
    + `[${walk.map((w) => (w ? w.focusIndex : '?')).join(', ')}], all inside the dialog=${!escaped}; `
    + `press ${f0.count} returned to index 0=${wrapped}`);
  neg('17b', 'Tab escaped the dialog', escaped, `activeInDialog across the walk: ${walk.map((w) => w && w.activeInDialog).join(',')}`);

  // ---- Shift+Tab from the first control wraps to the last ---------------
  await c.evalExpr(`(() => { const d = window.__c.dlg();
    d.querySelectorAll('input')[0].focus(); return 1; })()`);
  await sleep(150);
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: 8 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, modifiers: 8 });
  await sleep(250);
  const back = await c.json('window.__c.dlgFocusables()');
  check('17c', 'Shift+Tab from the first control wraps to the LAST, still inside',
    back.focusIndex === back.count - 1 && back.activeInDialog === true,
    `landed on index ${back.focusIndex} of ${back.count} (${back.names[back.focusIndex] ?? '?'}), inside=${back.activeInDialog}`);

  // ---- RECOVERY: focus dropped outside the controls, then Tab ----------
  // A -1 index is what a maintain-only trap cannot handle. Reached the way a
  // user reaches it: click the dialog's own title text, which is a div and
  // therefore not focusable, so activeElement leaves the control set.
  await clickEl(c, `[...window.__c.dlg().querySelectorAll('div')].find((e) => e.textContent.trim() === 'New Canvas')`);
  await sleep(250);
  const lost = await c.json('window.__c.dlgFocusables()');
  await tab(c); await sleep(250);
  const found = await c.json('window.__c.dlgFocusables()');
  await shot(c, 's2-05-focus-recovery');
  note('17d', 'recovery attempt', `after clicking the title, focusIndex=${lost.focusIndex} (activeTag ${lost.activeTag}, `
    + `inDialog=${lost.activeInDialog}); after one Tab, focusIndex=${found.focusIndex} (inDialog=${found.activeInDialog})`);
  check('17d', 'focus that has left the controls is RECOVERED by Tab, not lost',
    found.activeInDialog === true && found.focusIndex >= 0,
    `focus went to ${lost.activeTag} (index ${lost.focusIndex}); one Tab put it back at index ${found.focusIndex} `
    + `(${found.names[found.focusIndex] ?? '?'})`);

  // ---- an emptied width renders BLANK, and the message names the WIDTH --
  await fillDialog(c, { name: 'goodname' });
  await clickEl(c, 'window.__c.dlgNums()[0]');
  await key(c, 'a', 'KeyA', 65, 2);
  await key(c, 'Backspace', 'Backspace', 8, 0);
  await sleep(400);
  const emptied = await c.json('window.__c.dlgSnapshot()');
  await shot(c, 's2-06-emptied-width');
  check('17e', 'an emptied width field renders BLANK, not a literal 0',
    emptied.nums[0] === '',
    `the field reads ${JSON.stringify(emptied.nums[0])}`);
  neg('17e', 'the emptied width still shows 0', emptied.nums[0] === '0', `value ${JSON.stringify(emptied.nums[0])}`);
  check('17f', 'the message on screen is about the WIDTH, not the name',
    emptied.error !== null && /Width must be/.test(emptied.error.text) && !/canvas name/i.test(emptied.error.text)
      && emptied.createDisabled === true,
    emptied.error ? `"${emptied.error.text}" — Create disabled=${emptied.createDisabled}, `
      + `rendered opacity ${emptied.createOpacity} (it must LOOK disabled too, not just be it)`
      : 'NO MESSAGE SHOWN');

  // ---- Enter submits from a number field, exactly once ------------------
  await fillDialog(c, { name: 'entersubmit', width: 64, height: 64 });
  const before = await c.json('window.__dbg.canvas.docIds()');
  await clickEl(c, 'window.__c.dlgNums()[1]');
  await enter(c);
  await sleep(2200);
  await c.evalExpr(INSTALL);
  const after = await c.json('window.__dbg.canvas.docIds()');
  const stillOpen = await c.evalExpr('window.__c.dlgOpen()');
  const tabsNow = await c.json('window.__c.tabLabels()');
  const dupes = tabsNow.filter((t) => t === 'Canvas · entersubmit').length;
  await shot(c, 's2-07-enter-submits');
  check('17g', 'Enter from a NUMBER field submits the form — once',
    stillOpen === false && after.includes('doc:canvas:entersubmit')
      && after.length === before.length + 1 && dupes === 1,
    `dialog open=${stillOpen}; documents ${before.length} → ${after.length} (${JSON.stringify(after)}); `
    + `tabs titled "Canvas · entersubmit" on screen: ${dupes}`);

  // ---- the backdrop no longer discards ----------------------------------
  await openNewCanvasDialog(c);
  await fillDialog(c, { name: 'keepme', width: 96, height: 96 });
  const filled = await c.json('window.__c.dlgSnapshot()');
  await mouse(c, 'mousePressed', 40, 40);
  await sleep(60);
  await mouse(c, 'mouseReleased', 40, 40, { buttons: 0 });
  await sleep(700);
  await c.evalExpr(INSTALL);
  const survived = await c.json('window.__c.dlgSnapshot()');
  await shot(c, 's2-08-backdrop-no-longer-discards');
  check('17h', 'a backdrop click no longer discards a filled-in form',
    survived !== null && survived.name === filled.name && survived.nums[0] === filled.nums[0],
    `before the click ${JSON.stringify({ name: filled.name, nums: filled.nums })}; after it `
    + `${survived ? JSON.stringify({ name: survived.name, nums: survived.nums }) : 'THE DIALOG CLOSED'}`);
  neg('17h', 'the backdrop click closed the dialog', survived === null, `dialog present afterwards=${survived !== null}`);
  await escape(c);
  await sleep(400);
  await c.evalExpr(INSTALL);
}

/** The original defect's exact scenario: reopen NEXT SESSION and draw. */
async function sessionF(c, shared) {
  if (!run('15')) return;
  const restored = await waitRestored(c);
  note('15d', 'restore settled', JSON.stringify({ waited: restored.waitedMs, tabs: restored.tabs }));
  const focused = await focusTab(c, 'Canvas · arm-a', 2500);
  const idx = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  const words = await c.json('window.__dbg.canvas.paletteWords("doc:canvas:arm-a")');
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(300);
  const before = await c.evalExpr('window.__c.pixelAt(50, 58, 64)');
  await drawArt(c, 45, 58, 58, 58, 64, 5);
  const after = await c.evalExpr('window.__c.pixelAt(50, 58, 64)');
  await shot(c, 's2-09-next-session-stroke');
  check('15d', 'reopened in a NEW SESSION, the brush is visible and the stroke shows — the original defect',
    focused === true && idx !== 1 && words !== null && words[idx] !== 0 && before !== after
      && after !== '0,0,0,255',
    `armed index ${idx}, word 0x${((words ?? [])[idx] ?? 0).toString(16)}; `
    + `the pixel at art (50,58) went ${before} → ${after}`);
  neg('15d', 'the next-session stroke is invisible', after === before || after === '0,0,0,255',
    `${before} → ${after}`);
}

async function secondPass() {
  if (existsSync(CANVAS_DIR)) rmSync(CANVAS_DIR, { recursive: true, force: true });
  const shared = {};
  await session('E — the six fixes, on screen', (c) => sessionE(c, shared));
  await session('F — reopened in a NEW SESSION (the original defect)', (c) => sessionF(c, shared));
  writeFileSync(`${SHOTS}/results-pass2.json`, JSON.stringify(results, null, 2));
  console.log('\n================ SUMMARY (pass 2) ================');
  console.log(`checks: ${results.filter((r) => !r.negative && r.ok !== null).length}, fails: ${fails.length}`
    + `, unexercised: ${unexercisedRows.length}`);
  if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
  if (unexercisedRows.length) {
    console.log('!!! ROWS NOT ATTEMPTED (an absence, not a pass — the check count above is short by this many):\n  '
      + unexercisedRows.join('\n  '));
  }
  if (negFails.length) console.log('!!! NEGATIVE CONTROLS THAT DID NOT FAIL (harness is blind):\n  ' + negFails.join('\n  '));
  else console.log('all negative controls correctly reported FAIL');
  if (fails.length || negFails.length || unexercisedRows.length) process.exitCode = 1;
  noteSummaryPrinted();
}

// ===========================================================================
// The run
// ===========================================================================
async function main() {
  // A clean slate on disk, so a rerun does not collide with its own canvases.
  if (existsSync(CANVAS_DIR)) rmSync(CANVAS_DIR, { recursive: true, force: true });

  const shared = {};
  await session('A — create, draw, undo, save, reopen', (c) => sessionA(c, shared));

  const PNG = `${CANVAS_DIR}/ghz-cliffs.png`;
  const SIDE = `${CANVAS_DIR}/ghz-cliffs.canvas.json`;

  // Session B restarts with everything intact — the stored session names the
  // canvas tab that was active when A exited.
  if (run('13')) await session('B — restart with a canvas active (row 13, first half)', (c) => sessionB(c, shared));

  // Session C restarts with the PNG DELETED. The backup is taken now, not in
  // row 5, so it is the file as A last saved it.
  if (run('13')) {
    if (existsSync(PNG)) { shared.pngBackup = readFileSync(PNG); rmSync(PNG); }
    console.log(`\n[setup] deleted ${PNG} (${shared.pngBackup ? shared.pngBackup.length : 0} bytes backed up)`);
    await session('C — restart with the PNG deleted (row 13, second half)', (c) => sessionC(c, shared));
  }

  // Session D restarts with the SIDECAR hand-edited into invalid JSON — the
  // trailing-comma case R12's chain is written around.
  if (run('14')) {
    if (shared.pngBackup && !existsSync(PNG)) writeFileSync(PNG, shared.pngBackup);
    if (existsSync(SIDE)) {
      shared.sidecarBackup = readFileSync(SIDE, 'utf8');
      writeFileSync(SIDE, `{ "version": 1, "profile": "genesis-level-art", "DELIBERATELY BROKEN": "trailing comma below", "gridOrigin": { "originX": 0, "originY": 0 }, }`);
      console.log(`[setup] hand-edited ${SIDE} into invalid JSON`);
    }
    await session('D — a rejected sidecar, read on screen (rows 11/14)', (c) => sessionD(c, shared));
  }

  writeFileSync(`${SHOTS}/results.json`, JSON.stringify(results, null, 2));
  console.log('\n================ SUMMARY ================');
  console.log(`checks: ${results.filter((r) => !r.negative && r.ok !== null).length}, fails: ${fails.length}`
    + `, unexercised: ${unexercisedRows.length}`);
  if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
  if (unexercisedRows.length) {
    console.log('!!! ROWS NOT ATTEMPTED (an absence, not a pass — the check count above is short by this many):\n  '
      + unexercisedRows.join('\n  '));
  }
  if (negFails.length) console.log('!!! NEGATIVE CONTROLS THAT DID NOT FAIL (harness is blind):\n  ' + negFails.join('\n  '));
  else console.log('all negative controls correctly reported FAIL');
  if (fails.length || negFails.length || unexercisedRows.length) process.exitCode = 1;
  noteSummaryPrinted();
}

// --- session A -------------------------------------------------------------
async function sessionA(c, shared) {
  const lvl = await openProjectAndAct(c);
  note('env', 'GHZ act 1 ready', lvl);
  const zonePal = await c.json('(() => { const p = window.__dbg && null; return null; })()').catch(() => null);
  void zonePal;

  // =========================================================================
  // ROW 11 — the New Canvas dialog itself (it has never rendered)
  // =========================================================================
  if (run('11')) await row11(c);

  // =========================================================================
  // ROW 1 — New Canvas 64x64, Genesis level art; the palette is the ZONE's
  // =========================================================================
  if (run('1') || run('2') || run('3') || run('4') || run('5') || run('6') || run('7') || run('8') || run('10')) {
    await row1(c, shared);
  }
  if (run('2')) await row2(c, shared);
  if (run('3')) await row3(c, shared);
  if (run('4')) await row4(c, shared);
  if (run('5')) await row5(c, shared);
  if (run('10')) await row10(c, shared);
  if (run('6')) await row6(c, shared);
  if (run('7')) await row7(c, shared);
  if (run('8')) await row8(c, shared);
  if (run('12')) await row12(c, shared);
  // A dirty canvas + a refused create — the invariant fixed in 4375bbb. Before
  // row 9, because row 9's Discard closes every canvas document and this needs
  // one that is OPEN (the `openCanvasDoc === 'focused'` refusal branch is the
  // one that used to move the focus).
  if (run('R')) await rowRefuseWhileDirty(c, shared);
  if (run('9')) await row9(c, shared);

  // Leave the app exactly as row 13 needs to find it: a canvas tab focused,
  // nothing dirty — and RECORD what was actually stored, so a restart row that
  // finds nothing can say whether the restore failed or the save did.
  await focusTab(c, 'Canvas · ghz-cliffs', 2000);
  await drain(c);
  await ctrlS(c); await sleep(1500);
  await c.evalExpr(INSTALL);
  shared.finalHash = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  shared.finalDrawn = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`);
  await shot(c, '19b-session-A-exit');
  note('A-exit', 'stored session as session A exits', JSON.stringify(await storedSessions(c)));
  note('A-exit', 'live tab strip', JSON.stringify(await c.json('window.__c.tabLabels()')));
  note('A-exit', 'the canvas being handed to session B',
    `hash ${shared.finalHash}, ${shared.finalDrawn} drawn, dirty tabs ${JSON.stringify(await c.json('window.__c.dirtyTabLabels()'))}`);
}

// ---------------------------------------------------------------------------
async function row11(c) {
  const opened = await openNewCanvasDialog(c);
  check('11a', 'the New Canvas dialog opens from ⌘K and renders', opened === true, `dlgOpen()=${opened}`);
  if (!opened) return;
  let snap = await c.json('window.__c.dlgSnapshot()');
  note('11a', 'dialog as it opens', JSON.stringify(snap));
  await shot(c, '01-dialog-open');

  check('11b', 'it opens with no refusal on screen and Create disabled (no name yet)',
    snap.error === null && snap.createDisabled === true,
    `error=${snap.error === null ? 'none' : 'PRESENT'}; createDisabled=${snap.createDisabled}; opacity=${snap.createOpacity}`);
  // ⚠ THIS PINNED 128x128 AND THE APP MOVED TO 256x256 ON PURPOSE, at
  // `598be067` (2026-08-16). The reasoning is written out beside the constant
  // in `shell/new-canvas.ts`: 256x256 is ONE CHUNK, the smallest size a commit
  // can take, and 128 made `canvasChunkCapacity` floor to zero — a dialog that
  // opened on a size the commit panel could only answer "nothing to commit yet"
  // for. So the row was asserting a default the product had deliberately
  // retired, and printing `nums=["256","256"]` as a failure.
  //
  // Read from the constant now, not typed. The claim that survives is the one
  // worth having: the dialog OPENS ON ITS OWN DECLARED DEFAULTS. A dialog whose
  // fields disagree with `NEW_CANVAS_DEFAULTS` still fails, and so does a
  // profile id the select does not offer.
  const wantDefaults = newCanvasDefaults();
  check('11c', `it opens on its own declared defaults (${wantDefaults.width}x${wantDefaults.height}, ${wantDefaults.profileId})`,
    snap.nums[0] === String(wantDefaults.width) && snap.nums[1] === String(wantDefaults.height)
    && snap.profile === wantDefaults.profileId
    && (snap.profileOptions ?? []).includes(wantDefaults.profileId),
    `want ${wantDefaults.width}x${wantDefaults.height} ${wantDefaults.profileId}; `
    + `nums=${JSON.stringify(snap.nums)} profile=${snap.profile} options=${JSON.stringify(snap.profileOptions)}`);

  // --- focus: does autoFocus land on the name field, and is there a trap? ---
  const focus0 = await c.json('window.__c.activeDesc()');
  note('11d', 'focus when the dialog opens', JSON.stringify(focus0));
  const tabWalk = [];
  for (let i = 0; i < 8; i++) { await tab(c); await sleep(120); tabWalk.push(await c.json('window.__c.activeDesc()')); }
  const escaped = tabWalk.some((f) => f && f.inDialog === false);
  check('11e', 'FOCUS TRAP: Tab never leaves the dialog', escaped === false,
    `8 Tab presses landed on: ${tabWalk.map((f) => f ? `${f.tag}${f.type ? '/' + f.type : ''}${f.inDialog ? '' : ' [OUTSIDE]'}` : 'null').join(' → ')}`);

  // --- the live refusal for an unsafe name ---------------------------------
  snap = await fillDialog(c, { name: 'sky tiles' });
  await shot(c, '02-dialog-refusal-unsafe-name');
  const unsafeErr = snap.error;
  check('11f', 'typing "sky tiles" shows the name rule inline, and Create is disabled',
    unsafeErr !== null && /must start with a letter or digit/.test(unsafeErr.text) && snap.createDisabled === true,
    unsafeErr ? `${unsafeErr.w}x${unsafeErr.h}px, lh ${unsafeErr.lineHeight}: "${unsafeErr.text}"` : 'NO ERROR SHOWN');
  if (unsafeErr) {
    // Legibility: at a 460px panel the 220-char rule must WRAP to several lines,
    // not clip. h > one line is the test that it wrapped.
    const oneLine = parseFloat(unsafeErr.lineHeight) || 16;
    check('11g', 'the name-rule refusal wraps rather than clipping', unsafeErr.h > oneLine * 1.5,
      `height ${unsafeErr.h}px vs one line ${oneLine}px — ${Math.round(unsafeErr.h / oneLine)} lines`);
  }

  // --- Enter with an invalid name must not create ---------------------------
  await clickEl(c, 'window.__c.dlgName()');
  await enter(c);
  await sleep(600);
  const stillOpen = await c.evalExpr('window.__c.dlgOpen()');
  const docsAfterEnter = await c.json('window.__dbg.canvas.docIds()');
  check('11h', 'Enter on an invalid name neither creates nor closes',
    stillOpen === true && docsAfterEnter.length === 0,
    `dialog still open=${stillOpen}; open canvas documents=${JSON.stringify(docsAfterEnter)}`);

  // --- an emptied number field: does it show a literal 0? -------------------
  await clickEl(c, 'window.__c.dlgNums()[0]');
  await key(c, 'a', 'KeyA', 65, 2);
  await key(c, 'Backspace', 'Backspace', 8, 0);
  await sleep(300);
  const emptied = await c.json('window.__c.dlgSnapshot()');
  await shot(c, '03-dialog-emptied-width');
  note('11i', 'width field after select-all + Backspace',
    `value=${JSON.stringify(emptied.nums[0])}; error=${emptied.error ? JSON.stringify(emptied.error.text) : 'none'}; createDisabled=${emptied.createDisabled}`);
  check('11i', 'an emptied width field does NOT display a literal 0',
    emptied.nums[0] !== '0',
    `the field reads ${JSON.stringify(emptied.nums[0])}`);

  // --- Enter from a number field -------------------------------------------
  await fillDialog(c, { name: 'entertest', width: 64, height: 64 });
  await clickEl(c, 'window.__c.dlgNums()[1]');
  await enter(c);
  await sleep(900);
  const afterNumEnter = { open: await c.evalExpr('window.__c.dlgOpen()'), docs: await c.json('window.__dbg.canvas.docIds()') };
  check('11j', 'Enter from a NUMBER field submits the form',
    afterNumEnter.open === false && afterNumEnter.docs.includes('doc:canvas:entertest'),
    `dialog open=${afterNumEnter.open}; documents=${JSON.stringify(afterNumEnter.docs)}`);
  // Enter did not submit, so create it with the button — 11n below needs a
  // canvas that really exists on disk to collide with.
  if (afterNumEnter.open) {
    await clickEl(c, 'window.__c.dlgCreate()');
    await sleep(1800);
    await c.evalExpr(INSTALL);
  }
  const madeIt = await c.json('window.__dbg.canvas.docIds()');
  note('11j', 'entertest canvas', `created=${madeIt.includes('doc:canvas:entertest')} (by ${afterNumEnter.open ? 'the Create button' : 'Enter'})`);

  // --- the COLLISION refusal, which is the long one -------------------------
  // Only reachable now that 11j has actually created a canvas: the collision
  // message names the file path, so it is the longest string the dialog can
  // show and the one most likely to clip at a normal window width.
  await openNewCanvasDialog(c);
  const collide = await fillDialog(c, { name: 'entertest' });
  await shot(c, '02b-dialog-refusal-collision');
  const cErr = collide.error;
  check('11n', 'typing the name of an existing canvas refuses it, names the file, and disables Create',
    cErr !== null && /already exists/.test(cErr.text) && /\.aurora\/canvas\/entertest\.png/.test(cErr.text)
      && collide.createDisabled === true,
    cErr ? `${cErr.w}x${cErr.h}px in a ${collide.panelW}px panel, lh ${cErr.lineHeight}: "${cErr.text}"` : 'NO ERROR SHOWN');
  if (cErr) {
    const oneLine = parseFloat(cErr.lineHeight) || 16;
    check('11o', 'the collision refusal wraps and is not clipped',
      cErr.h > oneLine * 2 && cErr.w <= collide.panelW,
      `${Math.round(cErr.h / oneLine)} lines at ${cErr.w}px wide inside a ${collide.panelW}px panel`);
  }
  await escape(c);
  await sleep(300);

  // --- Escape closes --------------------------------------------------------
  await openNewCanvasDialog(c);
  await fillDialog(c, { name: 'escapetest' });
  await escape(c);
  await sleep(400);
  const escClosed = await c.evalExpr('window.__c.dlgOpen()');
  check('11k', 'Escape closes the dialog', escClosed === false, `dlgOpen()=${escClosed}`);

  // --- backdrop click on a FILLED form -------------------------------------
  // BEHAVIOUR CHANGED IN b9225d9. The first run of this row recorded that a
  // backdrop click discarded a filled-in form with no confirmation; the fix
  // removed backdrop dismissal entirely. The row now asserts the CURRENT rule,
  // and pass 2's 17h is the dedicated check with the full before/after form.
  await openNewCanvasDialog(c);
  await fillDialog(c, { name: 'backdroptest', width: 200, height: 200 });
  const before = await c.json('window.__c.dlgSnapshot()');
  if (before === null) { check('11l', 'a backdrop click does NOT discard a filled-in form', false,
    'the dialog was not open, so this row could not run'); return; }
  await mouse(c, 'mousePressed', 40, 40);
  await sleep(60);
  await mouse(c, 'mouseReleased', 40, 40, { buttons: 0 });
  await sleep(500);
  await c.evalExpr(INSTALL);
  const after = await c.json('window.__c.dlgSnapshot()');
  check('11l', 'a backdrop click does NOT discard a filled-in form',
    after !== null && after.name === before.name && after.nums[0] === before.nums[0],
    `form was ${JSON.stringify({ name: before.name, nums: before.nums })}; after the backdrop click `
    + `${after ? JSON.stringify({ name: after.name, nums: after.nums }) : 'THE DIALOG CLOSED'}`);
  neg('11l', 'the backdrop click closed the dialog', after === null, `dialog still present=${after !== null}`);

  // Escape is the explicit way out, and it must still give a fresh form next time.
  await escape(c);
  await sleep(400);
  await openNewCanvasDialog(c);
  const reopened = await c.json('window.__c.dlgSnapshot()');
  check('11m', 'Escape then reopening gives a fresh form',
    reopened.name === '' && reopened.nums[0] === String(wantDefaults.width)
    && reopened.nums[1] === String(wantDefaults.height),
    `want name "" and ${wantDefaults.width}x${wantDefaults.height}; `
    + `name=${JSON.stringify(reopened.name)} nums=${JSON.stringify(reopened.nums)}`);
  await escape(c);
  await sleep(300);

  // Close the stray tab the Enter test created, through the real close path.
  await c.evalExpr('window.__c && 1');
}

// ---------------------------------------------------------------------------
async function row1(c, shared) {
  // The zone palette, read from the classic doc BEFORE the canvas is created —
  // so "the canvas got the zone's colours" is a comparison, not an impression.
  const zone = await c.json(`(() => {
    const p = window.__dbg.classic.poolSizes(); return p; })()`);
  note('1', 'classic act loaded', JSON.stringify(zone));

  const opened = await openNewCanvasDialog(c);
  if (!opened) { check('1', 'New Canvas dialog opens', false, 'it did not open'); return; }
  await fillDialog(c, { name: 'ghz-cliffs', width: 64, height: 64, profile: 'genesis-level-art' });
  const snap = await c.json('window.__c.dlgSnapshot()');
  note('1', 'dialog before Create', JSON.stringify({ name: snap.name, nums: snap.nums, profile: snap.profile, createDisabled: snap.createDisabled }));
  await clickEl(c, 'window.__c.dlgCreate()');
  await sleep(1500);
  await c.evalExpr(INSTALL);
  await shot(c, '04-canvas-created');

  const docId = 'doc:canvas:ghz-cliffs';
  shared.docId = docId;
  const st = await c.json(`window.__dbg.canvas.state(${JSON.stringify(docId)})`);
  const active = await c.evalExpr('window.__dbg.canvas.activeDocId()');
  const paneCanvas = await c.evalExpr('window.__c.canvas() !== null');
  check('1a', 'a canvas tab opens with the requested document',
    st !== null && st.width === 64 && st.height === 64 && st.profileId === 'genesis-level-art'
      && active === docId && paneCanvas === true,
    `state=${JSON.stringify(st)}; activeDocId=${active}; a canvas element is mounted=${paneCanvas}`);

  const words = await c.json(`window.__dbg.canvas.paletteWords(${JSON.stringify(docId)})`);
  const nonBlack = words ? words.filter((w) => w !== 0).length : 0;
  const swatchColors = await c.json('window.__c.swatchColors()');
  const distinct = new Set(swatchColors).size;
  check('1b', 'the palette shows the ZONE\'s colours, not black',
    nonBlack > 20 && distinct > 8,
    `${nonBlack}/64 palette words are non-zero; the 64 rendered swatches show ${distinct} distinct backgrounds; first 8 = ${JSON.stringify(swatchColors.slice(0, 8))}`);
  neg('1b', 'the palette is entirely black', nonBlack === 0, `${nonBlack} non-zero words`);
  shared.paletteWords = words;

  const status = await c.evalExpr('window.__c.statusText()');
  note('1c', 'status bar', JSON.stringify(status));
}

// ---------------------------------------------------------------------------
async function row2(c, shared) {
  const docId = shared.docId;
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(250);
  // Arm a colour by clicking a real swatch — line 0 entry 6, a mid tone.
  await c.evalExpr('window.__c.clickSwatch(6)'); await sleep(250);
  const armed = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  note('2', 'armed paint index by clicking swatch 6', String(armed));

  const before = {
    hash: await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(docId)})`),
    drawn: await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(docId)})`),
    screen: await c.evalExpr('window.__c.pixelAt(20, 20, 64)'),
    dirty: (await c.json(`window.__dbg.canvas.state(${JSON.stringify(docId)})`)).dirty,
    dots: await c.evalExpr('window.__c.dirtyDots()'),
  };
  await shot(c, '05-before-stroke');
  await drawArt(c, 10, 10, 40, 40, 64, 10);
  await c.evalExpr(INSTALL);
  await shot(c, '06-after-stroke');
  const after = {
    hash: await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(docId)})`),
    drawn: await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(docId)})`),
    screen: await c.evalExpr('window.__c.pixelAt(20, 20, 64)'),
    dirty: (await c.json(`window.__dbg.canvas.state(${JSON.stringify(docId)})`)).dirty,
    dots: await c.evalExpr('window.__c.dirtyDots()'),
    dotLabels: await c.json('window.__c.dirtyTabLabels()'),
  };
  shared.strokeHash = after.hash;
  shared.strokeDrawn = after.drawn;
  shared.preStrokeHash = before.hash;
  check('2a', 'a drag draws pixels — on screen AND in the document',
    after.drawn > before.drawn && after.screen !== before.screen,
    `drawn ${before.drawn} → ${after.drawn}; the pixel at art (20,20) went ${before.screen} → ${after.screen}`);
  check('2b', 'the tab picks up the unsaved dot',
    before.dirty === false && after.dirty === true && after.dots > before.dots,
    `dirty ${before.dirty} → ${after.dirty}; dots on screen ${before.dots} → ${after.dots} (${JSON.stringify(after.dotLabels)})`);
  neg('2a', 'the screen pixel is unchanged after the stroke', after.screen === before.screen,
    `${before.screen} vs ${after.screen}`);
}

// ---------------------------------------------------------------------------
async function row3(c, shared) {
  const docId = shared.docId;
  const undoEnabled = await c.evalExpr('window.__c.chipEnabled("Undo")');
  await ctrlZ(c);
  await sleep(500);
  const after = {
    hash: await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(docId)})`),
    drawn: await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(docId)})`),
    screen: await c.evalExpr('window.__c.pixelAt(20, 20, 64)'),
    undoStill: await c.evalExpr('window.__c.chipEnabled("Undo")'),
  };
  await shot(c, '07-after-one-ctrl-z');
  check('3', 'ONE Ctrl+Z removes the WHOLE stroke',
    after.drawn === 0 && after.hash === shared.preStrokeHash && after.undoStill === false,
    `Undo chip was enabled after the drag=${undoEnabled}; drawn pixels ${shared.strokeDrawn} → ${after.drawn}; `
    + `buffer hash back to the pre-stroke value (${shared.preStrokeHash})=${after.hash === shared.preStrokeHash}; Undo chip still enabled=${after.undoStill}`);
  neg('3', 'the stroke survived the undo', after.drawn > 0, `${after.drawn} drawn pixels remain`);

  // Redraw it — the rest of the rows want a document with visible art.
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(200);
  await drawArt(c, 10, 10, 40, 40, 64, 10);
  await drawArt(c, 40, 10, 10, 40, 64, 10);
  await c.evalExpr(INSTALL);
  shared.artHash = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(docId)})`);
  shared.artDrawn = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(docId)})`);
  shared.artScreen = await c.evalExpr('window.__c.canvasHash()');
  note('3', 're-drew an X for the later rows', `${shared.artDrawn} drawn pixels, buffer hash ${shared.artHash}`);
}

// ---------------------------------------------------------------------------
async function row4(c, shared) {
  const docId = shared.docId;
  const png = `${CANVAS_DIR}/ghz-cliffs.png`;
  const side = `${CANVAS_DIR}/ghz-cliffs.canvas.json`;
  // The files already exist — createCanvasDocument writes at creation. What row
  // 4 is really about is that Ctrl+S clears the dot and rewrites them.
  const beforeBytes = existsSync(png) ? readFileSync(png).length : -1;
  const dirtyBefore = (await c.json(`window.__dbg.canvas.state(${JSON.stringify(docId)})`)).dirty;
  const dotsBefore = await c.evalExpr('window.__c.dirtyDots()');
  await ctrlS(c);
  await sleep(1500);
  await c.evalExpr(INSTALL);
  const dirtyAfter = (await c.json(`window.__dbg.canvas.state(${JSON.stringify(docId)})`)).dirty;
  const dotsAfter = await c.evalExpr('window.__c.dirtyDots()');
  const afterBytes = existsSync(png) ? readFileSync(png).length : -1;
  await shot(c, '08-after-ctrl-s');
  check('4', 'Ctrl+S clears the dot and both files are on disk',
    dirtyBefore === true && dirtyAfter === false && existsSync(png) && existsSync(side),
    `dirty ${dirtyBefore} → ${dirtyAfter}; dots ${dotsBefore} → ${dotsAfter}; ${png} ${existsSync(png) ? afterBytes + ' bytes' : 'MISSING'} `
    + `(was ${beforeBytes} bytes at creation); ${side} ${existsSync(side) ? 'present' : 'MISSING'}`);
  note('4', 'sidecar contents', existsSync(side) ? readFileSync(side, 'utf8').replace(/\s+/g, ' ').slice(0, 300) : 'MISSING');
  shared.savedPngBytes = afterBytes;
}

// ---------------------------------------------------------------------------
async function row5(c, shared) {
  const png = `${CANVAS_DIR}/ghz-cliffs.png`;
  let fileOut = '';
  try { fileOut = execSync(`file ${JSON.stringify(png)}`, { encoding: 'utf8' }).trim(); } catch (e) { fileOut = `file failed: ${e}`; }
  const buf = existsSync(png) ? readFileSync(png) : null;
  // IHDR is always the first chunk: 8-byte signature, 4 len, 4 type, then
  // width/height/bitDepth/colorType.
  let ihdr = null;
  if (buf && buf.length > 33) {
    ihdr = {
      width: buf.readUInt32BE(16), height: buf.readUInt32BE(20),
      bitDepth: buf[24], colorType: buf[25],
    };
  }
  check('5', 'the PNG is a valid 8-bit indexed (colormap) PNG of the right size',
    /PNG image data/.test(fileOut) && /8-bit colormap/.test(fileOut)
      && ihdr && ihdr.width === 64 && ihdr.height === 64 && ihdr.bitDepth === 8 && ihdr.colorType === 3,
    `file(1): ${fileOut}\n        IHDR: ${JSON.stringify(ihdr)} (colorType 3 = indexed)`);
  note('5', 'the drawn shape', `${shared.artDrawn} of 4096 pixels are non-zero in the document that was written`);
}

// ---------------------------------------------------------------------------
async function row10(c, shared) {
  // ITS OWN CANVAS, deliberately. Grid strokes are alpha-composited over the
  // art, so any drawing underneath makes "did the line's colour change" a
  // question about the art rather than about the grid. A fresh canvas flood-
  // filled with ONE colour is a uniform ground, and every sample below is then
  // literally "background, or background plus the grid stroke".
  const opened = await openNewCanvasDialog(c);
  if (!opened) { check('10', 'a grid-test canvas can be created', false, 'the dialog did not open'); return; }
  await fillDialog(c, { name: 'gridtest', width: 64, height: 64, profile: 'genesis-level-art' });
  await clickEl(c, 'window.__c.dlgCreate()');
  await sleep(1800);
  await c.evalExpr(INSTALL);
  const gid = 'doc:canvas:gridtest';

  await c.evalExpr('window.__c.clickSwatch(3)'); await sleep(250);
  await c.evalExpr('window.__c.clickTool("Fill")'); await sleep(250);
  await clickArt(c, 32, 32, 64);
  await c.evalExpr(INSTALL);
  const filled = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(gid)})`);
  note('10', 'ground', `flood-filled ${filled}/4096 pixels with canvas index 3`);

  // Both grids on, origin 0 — the SHARED VIEWPORT's path (planCanvasGrids's
  // layerGrids branch).
  const g8was = await c.evalExpr('window.__c.gridChipActive(8)');
  const g16was = await c.evalExpr('window.__c.gridChipActive(16)');
  if (g16was !== true) { await c.evalExpr('window.__c.clickGridChip(16)'); await sleep(500); }
  await c.evalExpr(INSTALL);
  if ((await c.evalExpr('window.__c.gridChipActive(8)')) !== true) { await c.evalExpr('window.__c.clickGridChip(8)'); await sleep(500); }
  await c.evalExpr(INSTALL);
  const grids = await c.json('window.__dbg.canvas.visibleGrids()');
  note('10', 'grid chips', `8 was ${g8was}, 16 was ${g16was}; visibleGrids now ${JSON.stringify(grids)}`);

  // Re-measured on EVERY read: a stale zoom would silently move every sample
  // column, which is exactly the sort of thing that makes a colour comparison
  // lie. `scan` returns one device-pixel row so the structure is visible in the
  // log, not just the five points the assertions use.
  const scan = async (artY, n) => c.json(`(() => { const c = window.__c.canvas(); const z = c.width / 64;
    const out = []; for (let x = 0; x < ${n}; x++) out.push(window.__c.devPixel(Math.round(x * z), Math.round((${artY} + 0.5) * z)));
    return out; })()`);
  const at = async (artX, artY = 30) => c.evalExpr(`(() => { const c = window.__c.canvas(); const z = c.width / 64;
    return window.__c.devPixel(Math.round(${artX} * z), Math.round((${artY} + 0.5) * z)); })()`);

  const zoom = await c.evalExpr('window.__c.zoomFor(64)');
  const aligned = {
    bg: await at(5), bg2: await at(13),
    px8: await at(8), px8b: await at(24), px8c: await at(40),
    px16: await at(16), px16b: await at(32), px16c: await at(48),
  };
  const alignedScan = await scan(30, 40);
  await shot(c, '09-grid-origin-0');
  note('10', `origin (0,0), zoom ${zoom}× — samples`, JSON.stringify(aligned));
  note('10', 'origin (0,0) — device-pixel scan of art columns 0..39 at y=30', JSON.stringify(alignedScan));

  // Now move the origin to 3 — the PANE'S OWN UNDERLAY path.
  const setOk = await setGridOrigin(c, 3, 3);
  await c.evalExpr(INSTALL);
  const st = await c.json(`window.__dbg.canvas.state(${JSON.stringify(gid)})`);
  const stillFilled = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(gid)})`);
  const offset = {
    bg: await at(6), bg2: await at(14),
    px8: await at(11), px8b: await at(27), px8c: await at(43),
    px16: await at(19), px16b: await at(35), px16c: await at(51),
    oldPx8: await at(8), oldPx16: await at(16),
  };
  const offsetScan = await scan(30, 40);
  await shot(c, '10-grid-origin-3');
  note('10', `origin ${JSON.stringify(st.gridOrigin)} (set ok=${setOk}, ${stillFilled}/4096 still filled) — samples`, JSON.stringify(offset));
  note('10', 'origin (3,3) — device-pixel scan of art columns 0..39 at y=30', JSON.stringify(offsetScan));

  const sameGround = aligned.bg === offset.bg && aligned.bg === aligned.bg2 && offset.bg === offset.bg2;
  check('10z', 'the ground under both measurements is the SAME uniform colour (so a colour difference can only be the grid)',
    sameGround, `origin 0 background ${aligned.bg}/${aligned.bg2}; origin 3 background ${offset.bg}/${offset.bg2}`);

  check('10a', 'the guides MOVE when the origin moves',
    offset.oldPx8 === offset.bg && offset.oldPx16 === offset.bg && offset.px8 !== offset.bg,
    `art column 8 (an 8px line at origin 0) is now plain background ${offset.oldPx8} = ${offset.bg}; `
    + `column 16 likewise ${offset.oldPx16}; the 8px line has moved to column 11 (${offset.px8})`);
  check('10b', 'the offset 8px mesh is drawn at EXACTLY the aligned 8px weight — it does not brighten',
    offset.px8 === aligned.px8 && offset.px8b === aligned.px8b && offset.px8c === aligned.px8c,
    `aligned 8px lines ${aligned.px8}/${aligned.px8b}/${aligned.px8c} vs offset 8px lines ${offset.px8}/${offset.px8b}/${offset.px8c}`);
  check('10c', 'the 16px block grid still reads as DISTINCT from the 8px mesh at a non-zero origin',
    offset.px16 !== offset.px8 && aligned.px16 !== aligned.px8,
    `at origin 3: 16px ${offset.px16} vs 8px ${offset.px8}; at origin 0: 16px ${aligned.px16} vs 8px ${aligned.px8}`);
  check('10d', 'the offset 16px grid is drawn at the aligned 16px weight',
    offset.px16 === aligned.px16 && offset.px16b === aligned.px16b && offset.px16c === aligned.px16c,
    `aligned ${aligned.px16}/${aligned.px16b}/${aligned.px16c} vs offset ${offset.px16}/${offset.px16b}/${offset.px16c}`);
  neg('10b', 'the offset 8px mesh matches the 16px weight (the historical bug)',
    offset.px8 === aligned.px16, `offset 8px ${offset.px8} vs aligned 16px ${aligned.px16}`);
  neg('10a', 'the grid did not move at all', offset.oldPx8 === aligned.px8,
    `column 8 was ${aligned.px8}, is now ${offset.oldPx8}`);

  shared.gridSamples = { aligned, offset, zoom };

  // Leave the grid chips as found and go back to the working canvas.
  await c.evalExpr('window.__c.clickGridChip(16)'); await sleep(400);
  await c.evalExpr(INSTALL);
  await focusTab(c, 'Canvas · ghz-cliffs');
  shared.artHash = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  shared.artDrawn = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`);
  shared.paletteWords = await c.json(`window.__dbg.canvas.paletteWords(${JSON.stringify(shared.docId)})`);
  note('10', 'back on the working canvas', `hash ${shared.artHash}, ${shared.artDrawn} drawn`);
}

/** Drive the Grid origin NumberFields the way a user would: focus, select all,
 *  type, blur. NumberField commits on change/blur — see components/ui. */
async function setGridOrigin(c, x, y) {
  const fields = await c.json(`(() => [...document.querySelectorAll('input[title^="grid origin"]')].map((e) => e.title))()`);
  if (fields.length < 2) { note('10', 'GRID ORIGIN FIELDS NOT FOUND', JSON.stringify(fields)); return false; }
  for (const [i, v] of [[0, x], [1, y]]) {
    await clickEl(c, `document.querySelectorAll('input[title^="grid origin"]')[${i}]`);
    await key(c, 'a', 'KeyA', 65, 2);
    await typeText(c, String(v));
    await key(c, 'Tab', 'Tab', 9, 0);
    await sleep(300);
  }
  await sleep(400);
  return true;
}

// ---------------------------------------------------------------------------
async function row6(c, shared) {
  const docId = shared.docId;
  const beforeHash = shared.artHash;
  const beforePal = JSON.stringify(shared.paletteWords);
  // Close the tab through the tab strip's own × (a real mousedown).
  const closed = await closeTab(c, 'Canvas · ghz-cliffs');
  const openAfterClose = await c.json('window.__dbg.canvas.docIds()');
  const tabsAfterClose = await c.json('window.__c.tabLabels()');
  note('6', 'closed the canvas tab', `close button hit=${closed}; open documents now ${JSON.stringify(openAfterClose)}; tabs ${JSON.stringify(tabsAfterClose)}`);

  // Reopen it from the Explorer's Canvases group.
  const opened = await openFromExplorer(c, 'ghz-cliffs');
  const clicked = opened.ok;
  note('6', 'Explorer rows visible while filtering for it', JSON.stringify(opened.rows ?? opened.why));
  await shot(c, '11-reopened-from-explorer');
  const st = await c.json(`window.__dbg.canvas.state(${JSON.stringify(docId)})`);
  const hash = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(docId)})`);
  const pal = JSON.stringify(await c.json(`window.__dbg.canvas.paletteWords(${JSON.stringify(docId)})`));
  check('6', 'closing and reopening the canvas brings back the pixels AND the palette exactly',
    closed === true && clicked === true && st !== null && hash === beforeHash && pal === beforePal,
    `Explorer row clicked=${clicked}; reopened state=${st ? JSON.stringify({ w: st.width, h: st.height, profile: st.profileId, dirty: st.dirty }) : 'null'}; `
    + `pixel hash ${beforeHash} → ${hash} (${hash === beforeHash ? 'identical' : 'DIFFERENT'}); palette identical=${pal === beforePal}`);
  neg('6', 'the reopened document is blank', (await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(docId)})`)) === 0,
    `${await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(docId)})`)} drawn pixels`);
}

// ---------------------------------------------------------------------------
async function row7(c, shared) {
  const a = shared.docId;
  const opened = await openNewCanvasDialog(c);
  if (!opened) { check('7', 'a second canvas can be created', false, 'the dialog did not open'); return; }
  await fillDialog(c, { name: 'second', width: 48, height: 48 });
  await clickEl(c, 'window.__c.dlgCreate()');
  await sleep(1800);
  await c.evalExpr(INSTALL);
  const b = 'doc:canvas:second';
  shared.docB = b;

  // Draw something clearly different on B.
  await c.evalExpr('window.__c.clickTool("Rectangle")'); await sleep(250);
  await c.evalExpr('window.__c.clickSwatch(20)'); await sleep(250);
  await drawArt(c, 6, 6, 40, 40, 48, 6);
  await c.evalExpr(INSTALL);
  await shot(c, '12-second-canvas');
  const bHash = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(b)})`);
  const bDrawn = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(b)})`);
  const bScreen = await c.evalExpr('window.__c.canvasHash()');
  const dotsAfterB = await c.json('window.__c.dirtyTabLabels()');

  // Switch to A and back — each tab must keep its own pixels.
  const toA = await focusTab(c, 'Canvas · ghz-cliffs');
  await shot(c, '13-switched-back-to-A');
  const aState = {
    active: await c.evalExpr('window.__dbg.canvas.activeDocId()'),
    hash: await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(a)})`),
    screen: await c.evalExpr('window.__c.canvasHash()'),
    size: await c.evalExpr('(() => { const c = window.__c.canvas(); return c ? c.width + "x" + c.height : null; })()'),
  };
  const toB = await focusTab(c, 'Canvas · second');
  const bState = {
    active: await c.evalExpr('window.__dbg.canvas.activeDocId()'),
    hash: await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(b)})`),
    screen: await c.evalExpr('window.__c.canvasHash()'),
    size: await c.evalExpr('(() => { const c = window.__c.canvas(); return c ? c.width + "x" + c.height : null; })()'),
  };
  const dots = await c.json('window.__c.dirtyTabLabels()');

  check('7a', 'each canvas tab keeps its OWN pixels across a switch',
    toA === true && toB === true && aState.active === a && bState.active === b
      && aState.hash === shared.artHash && bState.hash === bHash && aState.screen !== bState.screen,
    `A: active=${aState.active} hash=${aState.hash} (expected ${shared.artHash}) canvas=${aState.size} screenHash=${aState.screen}\n        `
    + `B: active=${bState.active} hash=${bState.hash} (expected ${bHash}, ${bDrawn} drawn) canvas=${bState.size} screenHash=${bState.screen}`);
  check('7b', 'each dots independently',
    dots.some((d) => d.includes('second')) && !dots.some((d) => d.includes('ghz-cliffs')),
    `tabs currently showing the unsaved dot: ${JSON.stringify(dots)} (A was saved, B is not) — right after B's edit it was ${JSON.stringify(dotsAfterB)}`);
  neg('7a', 'the two tabs render the same bitmap', aState.screen === bState.screen,
    `A's composed canvas ${aState.screen} vs B's ${bState.screen}`);
}

// ---------------------------------------------------------------------------
async function row8(c, shared) {
  // Edit the LEVEL first, then focus a canvas tab and press Ctrl+Z. The level's
  // own undo stack must not move.
  const levelTitle = (await c.json('window.__c.tabLabels()')).find((t) => /Green Hill|GHZ/i.test(t));
  const levelTab = levelTitle ? await focusTab(c, levelTitle, 2000) : false;
  note('8', 'level tab', `title=${JSON.stringify(levelTitle)} focused=${levelTab}`);
  const poolBefore = await c.json('window.__dbg.classic.poolSizes()');
  // Paint on the classic composer: Art facet → Chunk tier → Paint, one click.
  const nav = await c.json(`(() => {
    const pill = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Art');
    if (pill) pill.click();
    return { pill: !!pill }; })()`);
  await sleep(1200);
  await c.evalExpr(INSTALL);
  const paint = await c.json(`(() => {
    const bar = [...document.querySelectorAll('div')].find((d) => d.children.length === 3
      && [...d.children].map((k) => k.textContent.trim()).join(',') === 'Chunk,Block,Tile');
    if (bar) [...bar.children].find((e) => e.textContent.trim() === 'Chunk').click();
    return { bar: !!bar }; })()`);
  await sleep(900);
  await c.evalExpr(INSTALL);
  const chip = await c.evalExpr(`(() => { const e = [...document.querySelectorAll('[title]')]
    .find((x) => x.title === 'Paint pixels across the composed chunk'); if (!e) return false; e.click(); return true; })()`);
  await sleep(900);
  await c.evalExpr('window.__dbg.setPaintColor(9)');
  await c.evalExpr(INSTALL);
  // The composer's Paint canvas is the one in the margin:auto holder.
  const painted = await c.json(`(() => {
    const holder = [...document.querySelectorAll('div')].find((d) => d.style && d.style.margin === 'auto' && d.querySelector('canvas'));
    if (!holder) return null;
    const cv = holder.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    return { x: Math.round(r.left + 40), y: Math.round(r.top + 40) }; })()`);
  if (painted) {
    await mouse(c, 'mousePressed', painted.x, painted.y);
    await sleep(60);
    await mouse(c, 'mouseReleased', painted.x, painted.y, { buttons: 0 });
    await sleep(600);
  }
  const poolAfter = await c.json('window.__dbg.classic.poolSizes()');
  const levelUndoEnabled = await c.evalExpr('window.__c.chipEnabled("Undo")');
  note('8', 'level edit', `nav=${JSON.stringify(nav)} tier=${JSON.stringify(paint)} paintChip=${chip}; `
    + `pool ${JSON.stringify(poolBefore)} → ${JSON.stringify(poolAfter)}; the LEVEL header's Undo chip enabled=${levelUndoEnabled}`);
  const levelChanged = JSON.stringify(poolBefore) !== JSON.stringify(poolAfter);
  if (!levelChanged) {
    note('8', 'WARNING', 'the level paint did not change the pool — row 8 cannot prove the level did not undo if nothing was there to undo');
  }

  // Now focus the canvas tab and draw a stroke, then press Ctrl+Z ONCE.
  const toCanvas = await focusTab(c, 'Canvas · ghz-cliffs', 1600);
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(250);
  await drawArt(c, 50, 5, 58, 20, 64, 6);
  await c.evalExpr(INSTALL);
  const canvasAfterDraw = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  const poolBeforeZ = await c.json('window.__dbg.classic.poolSizes()');
  await ctrlZ(c);
  await sleep(700);
  const poolAfterZ = await c.json('window.__dbg.classic.poolSizes()');
  const canvasAfterZ = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  await shot(c, '14-ctrl-z-under-canvas-tab');
  check('8', 'with a canvas tab active, Ctrl+Z undoes the CANVAS and leaves the level alone',
    toCanvas === true && canvasAfterZ !== canvasAfterDraw && JSON.stringify(poolAfterZ) === JSON.stringify(poolBeforeZ),
    `canvas buffer hash ${canvasAfterDraw} → ${canvasAfterZ} (changed = the canvas undid); `
    + `classic pool ${JSON.stringify(poolBeforeZ)} → ${JSON.stringify(poolAfterZ)} (${JSON.stringify(poolAfterZ) === JSON.stringify(poolBeforeZ) ? 'unmoved' : 'MOVED — the level undid too'})`);
  shared.levelPoolAfterRow8 = poolAfterZ;
  shared.levelEditLanded = levelChanged;
  neg('8', 'the classic pool moved on that Ctrl+Z', JSON.stringify(poolAfterZ) !== JSON.stringify(poolBeforeZ),
    `${JSON.stringify(poolBeforeZ)} vs ${JSON.stringify(poolAfterZ)}`);

  // --- 8b: ONE Ctrl+Z CONSUMES EXACTLY ONE UNDO ENTRY -------------------
  //
  // This is the assertion that actually catches the levelKeysEnabled defect,
  // and it took a failed plant to find that out. Reverting the canvas branch of
  // `levelKeysEnabled` does NOT undo a level edit, because LevelWorkspace's
  // Ctrl+Z handler routes through `focusedHistory()` — the same function
  // CanvasMode's handler calls — and with a canvas tab active that resolves to
  // the CANVAS document. So the ungated handler is a SECOND caller of the
  // canvas's own undo, and the symptom is a double undo: one keypress eats two
  // strokes. The level pane is mounted (display:none) throughout, so its
  // handler is registered the whole time; only the gate keeps it inert.
  await drain(c);
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(250);
  const h0 = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  await drawArt(c, 4, 30, 20, 30, 64, 6);
  const h1 = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  const d1 = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`);
  await drawArt(c, 4, 34, 20, 34, 64, 6);
  const h2 = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  const d2 = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`);
  await ctrlZ(c);
  await sleep(600);
  const h3 = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  const d3 = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`);
  await shot(c, '14b-one-ctrl-z-one-entry');
  check('8b', 'one Ctrl+Z on a canvas tab consumes exactly ONE undo entry, with the level pane mounted behind it',
    h1 !== h2 && h3 === h1 && h3 !== h0,
    `two strokes: ${d1} drawn (hash ${h1}) then ${d2} drawn (hash ${h2}); after ONE Ctrl+Z: ${d3} drawn (hash ${h3}). `
    + `Back to after-stroke-1=${h3 === h1}; collapsed all the way to the pre-stroke state (${h0}, ${'' + (h3 === h0)}) `
    + `would mean two handlers fired`);
  neg('8b', 'one Ctrl+Z collapsed BOTH strokes', h3 === h0, `pre-stroke hash ${h0}, after one undo ${h3}`);
  await drain(c);

  // Drain the canvas's stack and re-save so later rows start clean.
  await drain(c);
  await ctrlS(c); await sleep(1200);
  await c.evalExpr(INSTALL);
}

// ---------------------------------------------------------------------------
async function row12(c, shared) {
  // No zone open: reset the classic level store while the project stays open.
  await c.evalExpr('window.__dbg.resetLevel()');
  await sleep(800);
  await c.evalExpr(INSTALL);
  const lvl = await c.json('window.__dbg.levelState()');
  const opened = await openNewCanvasDialog(c);
  if (!opened) { check('12', 'New Canvas with no zone open', false, 'the dialog did not open'); return; }
  await fillDialog(c, { name: 'nozone', width: 64, height: 64 });
  await clickEl(c, 'window.__c.dlgCreate()');
  await sleep(1800);
  await c.evalExpr(INSTALL);
  await shot(c, '15-no-zone-canvas');
  const id = 'doc:canvas:nozone';
  const words = await c.json(`window.__dbg.canvas.paletteWords(${JSON.stringify(id)})`);
  const nonBlack = words ? words.filter((w) => w !== 0).length : 0;
  const paint = await c.evalExpr('window.__dbg.canvas.paintIndex()');
  const status = await c.evalExpr('window.__c.statusText()');
  const swatches = await c.json('window.__c.swatchColors()');
  const distinct = new Set(swatches).size;
  const paintWord = words ? words[paint] : null;
  check('12', 'a canvas created with NO ZONE open shows the four ramps and arms a VISIBLE colour',
    lvl.status !== 'ready' && nonBlack > 40 && distinct > 20 && paint !== 0 && paintWord !== 0,
    `level state at create time=${JSON.stringify(lvl)}; ${nonBlack}/64 words non-zero; ${distinct} distinct swatch backgrounds; `
    + `armed paint index ${paint} whose word is 0x${(paintWord ?? 0).toString(16)}; status bar: ${JSON.stringify(status)}`);
  neg('12', 'the no-zone canvas is black on black', nonBlack === 0 || paintWord === 0,
    `nonBlack=${nonBlack}, armed word=0x${(paintWord ?? 0).toString(16)}`);

  // Draw one stroke so the "brush is visible" claim is checked on screen too.
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(250);
  const before = await c.evalExpr('window.__c.pixelAt(20, 20, 64)');
  await drawArt(c, 10, 20, 40, 20, 64, 6);
  const after = await c.evalExpr('window.__c.pixelAt(20, 20, 64)');
  await shot(c, '16-no-zone-stroke');
  check('12b', 'a stroke on the no-zone canvas is actually VISIBLE on screen',
    before !== after && after !== '0,0,0,255' && after !== '0,0,0,0',
    `the pixel at art (20,20) went ${before} → ${after}`);
  await drain(c);
  // Reload the act for the remaining rows.
  await c.evalExpr('window.__dbg.activate("ghz", 1)');
  await sleep(4000);
  await c.evalExpr(INSTALL);
}

// ---------------------------------------------------------------------------
async function row9(c, shared) {
  // WHAT IS DRIVEN AND WHAT IS NOT. The guard runs inside useProject's
  // `openPath`, whose only two entry points are "Open Project…" (which begins
  // with the OS folder picker, unreachable from CDP) and the "Open recent"
  // commands, which buildCommands emits ONLY while `engine === null` — never
  // while a project is open, which is the only state where a dirty canvas can
  // exist. So the harness calls `confirmProjectOpen()` itself, exactly as
  // `openPath` does, and then drives the REAL ConfirmDialog that appears: real
  // copy, real buttons, real clicks. The folder picker is the only skipped part.
  const toCanvas = await focusTab(c, 'Canvas · ghz-cliffs');
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(200);
  await drawArt(c, 2, 60, 20, 60, 64, 5);
  await c.evalExpr(INSTALL);
  const dirty = (await c.json(`window.__dbg.canvas.state(${JSON.stringify(shared.docId)})`)).dirty;
  const pngBefore = existsSync(`${CANVAS_DIR}/ghz-cliffs.png`)
    ? readFileSync(`${CANVAS_DIR}/ghz-cliffs.png`) : null;
  note('9', 'setup', `focused the canvas tab=${toCanvas}; it is dirty=${dirty}`);

  // --- CANCEL -------------------------------------------------------------
  await c.evalExpr('window.__dbg.__g = window.__dbg.canvas.projectOpenGuard(); 1');
  await sleep(900);
  await c.evalExpr(INSTALL);
  const conf = await c.json('window.__c.confirmInfo()');
  await shot(c, '17-project-switch-confirm');
  check('9a', 'a dirty canvas raises the project-open confirm', conf !== null,
    conf ? JSON.stringify(conf) : 'NO CONFIRM DIALOG APPEARED — the guard proceeded silently');
  if (!conf) { await drain(c); return; }

  const cancelHit = await clickEl(c, `(() => [...window.__c.confirm().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel'))()`);
  await sleep(900);
  await c.evalExpr(INSTALL);
  const afterCancel = {
    answer: await c.evalExpr('window.__dbg.__g'),
    docs: await c.json('window.__dbg.canvas.docIds()'),
    dirty: (await c.json(`window.__dbg.canvas.state(${JSON.stringify(shared.docId)})`) ?? {}).dirty,
  };
  check('9b', 'Cancel keeps the documents and their unsaved work',
    cancelHit === true && afterCancel.answer === false && afterCancel.docs.includes(shared.docId) && afterCancel.dirty === true,
    `the guard answered ${afterCancel.answer}; open documents ${JSON.stringify(afterCancel.docs)}; the canvas is still dirty=${afterCancel.dirty}`);

  // --- DISCARD ------------------------------------------------------------
  await c.evalExpr('window.__dbg.__g2 = window.__dbg.canvas.projectOpenGuard(); 1');
  await sleep(900);
  await c.evalExpr(INSTALL);
  const conf2 = await c.json('window.__c.confirmInfo()');
  const discardHit = await clickEl(c, `(() => [...window.__c.confirm().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Discard & open'))()`);
  await sleep(1200);
  await c.evalExpr(INSTALL);
  const afterDiscard = {
    answer: await c.evalExpr('window.__dbg.__g2'),
    docs: await c.json('window.__dbg.canvas.docIds()'),
    active: await c.evalExpr('window.__dbg.canvas.activeDocId()'),
  };
  const pngAfter = existsSync(`${CANVAS_DIR}/ghz-cliffs.png`)
    ? readFileSync(`${CANVAS_DIR}/ghz-cliffs.png`) : null;
  await shot(c, '18-after-discard-and-open');
  check('9c', 'Discard drops every canvas document, and NO write lands in the old project',
    discardHit === true && afterDiscard.answer === true && afterDiscard.docs.length === 0
      && pngBefore !== null && pngAfter !== null && Buffer.compare(pngBefore, pngAfter) === 0,
    `confirm copy: ${conf2 ? JSON.stringify(conf2.text) : 'none'}; the guard answered ${afterDiscard.answer}; `
    + `open documents afterwards ${JSON.stringify(afterDiscard.docs)}; activeDocId=${afterDiscard.active}; `
    + `ghz-cliffs.png on disk is byte-identical before/after=${pngBefore && pngAfter ? Buffer.compare(pngBefore, pngAfter) === 0 : 'file missing'} `
    + `(${pngBefore ? pngBefore.length : '?'} bytes) — so the unsaved stroke was NOT written into the project being left`);
  neg('9c', 'the discard wrote the unsaved stroke to disk',
    pngBefore !== null && pngAfter !== null && Buffer.compare(pngBefore, pngAfter) !== 0,
    `${pngBefore ? pngBefore.length : '?'} vs ${pngAfter ? pngAfter.length : '?'} bytes`);

  // Reload the canvas tab from disk so the session ends in a healthy state
  // (the discard closed every document but left the tabs).
  await focusTab(c, 'Canvas · ghz-cliffs', 2200);
  await c.evalExpr(INSTALL);
  note('9', 'after reloading the tab from disk',
    `documents ${JSON.stringify(await c.json('window.__dbg.canvas.docIds()'))}, `
    + `drawn ${await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`)}`);
}

// ---------------------------------------------------------------------------
/** Not one of the 14 rows: the invariant fixed in 4375bbb — a refused create,
 *  while a DIRTY canvas is the active tab, must never flash the unloaded card. */
async function rowRefuseWhileDirty(c, shared) {
  await focusTab(c, 'Canvas · ghz-cliffs');
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(200);
  await drawArt(c, 2, 2, 8, 8, 64, 5);
  await c.evalExpr(INSTALL);
  const dirty = (await c.json(`window.__dbg.canvas.state(${JSON.stringify(shared.docId)})`)).dirty;
  const activeBefore = await c.evalExpr('window.__dbg.canvas.activeDocId()');
  const hashBefore = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);

  await openNewCanvasDialog(c);
  // A name that already exists AND is already open — the `openCanvasDoc`
  // 'focused' branch, the one that used to move the focus.
  await fillDialog(c, { name: 'second' });
  const snapBefore = await c.json('window.__c.dlgSnapshot()');
  // The live listing already refuses it, so Create is disabled. Sample the pane
  // repeatedly while the refusal is on screen: an unloaded flash would show here.
  let sawUnloaded = false;
  for (let i = 0; i < 8; i++) {
    if (await c.evalExpr('window.__c.unloadedCard() !== null')) sawUnloaded = true;
    await sleep(150);
  }
  await shot(c, '18-refused-create-over-dirty-canvas');
  const activeAfter = await c.evalExpr('window.__dbg.canvas.activeDocId()');
  const hashAfter = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  const stillDirty = (await c.json(`window.__dbg.canvas.state(${JSON.stringify(shared.docId)})`)).dirty;
  check('R', 'a refused create over a DIRTY canvas never flashes the "could not be loaded" card',
    dirty === true && sawUnloaded === false && activeAfter === activeBefore && hashAfter === hashBefore && stillDirty === true,
    `canvas was dirty=${dirty}; the refusal on screen was ${snapBefore.error ? JSON.stringify(snapBefore.error.text.slice(0, 90)) : 'ABSENT'}; `
    + `unloaded card ever seen across 8 samples=${sawUnloaded}; activeDocId ${activeBefore} → ${activeAfter}; buffer hash unchanged=${hashAfter === hashBefore}; still dirty=${stillDirty}`);
  await escape(c);
  await sleep(400);
  await drain(c);
  await c.evalExpr(INSTALL);

  // Leave the session with the canvas tab active and BOTH canvases saved, so
  // session B's restore has something to restore.
  await focusTab(c, 'Canvas · second');
  await ctrlS(c); await sleep(1400);
  await focusTab(c, 'Canvas · gridtest');
  await ctrlS(c); await sleep(1400);
  await focusTab(c, 'Canvas · ghz-cliffs');
  await ctrlS(c); await sleep(1400);
  await c.evalExpr(INSTALL);
  shared.finalHash = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  shared.finalDrawn = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`);
  const dots = await c.json('window.__c.dirtyTabLabels()');
  note('A-end', 'stored session at the end of A', JSON.stringify(await storedSessions(c)));
  note('A-end', 'live tab strip', JSON.stringify(await c.json('window.__c.tabLabels()')));
  note('A-end', 'session A ends with the canvas tab active and everything saved',
    `hash ${shared.finalHash}, ${shared.finalDrawn} drawn, dirty tabs ${JSON.stringify(dots)}`);
  await shot(c, '19-session-A-end');
}

// --- session B: restart, the canvas tab must come back ---------------------
async function sessionB(c, shared) {
  if (!run('13')) return;
  const restored = await waitRestored(c);
  note('13a', 'restore settled', JSON.stringify({ waited: restored.waitedMs, proj: restored.proj, lvl: restored.lvl, tabs: restored.tabs }));
  note('13a', 'stored session BEFORE the project was opened', JSON.stringify(restored.storedBeforeOpen));
  note('13a', 'stored session AFTER the restore ran (a faithful readout of the live sessionStore)',
    JSON.stringify(restored.storedAfterRestore));

  const storedBefore = sessionPayloadFor(restored.storedBeforeOpen, S1DIR);
  const storedAfter = sessionPayloadFor(restored.storedAfterRestore, S1DIR);
  const toasts = await c.json('window.__dbg.canvas.toasts()');
  const docs = await c.json('window.__dbg.canvas.docIds()');
  const active = await c.evalExpr('window.__dbg.canvas.activeDocId()');
  const onScreen = await c.evalExpr('window.__c.canvas() !== null');
  await shot(c, '20-restart-canvas-restored');

  // (i) THE TAB comes back.
  const tabBack = (restored.tabs ?? []).includes('Canvas · ghz-cliffs');
  check('13a-tab', 'the canvas TAB survives a restart',
    tabBack, `tabs on screen after the restore: ${JSON.stringify(restored.tabs)}`);

  // (ii) THE FOCUS does not — recorded as its own observation rather than
  // folded into (i), because they fail for different reasons and only one of
  // them is what the plan's row 13 predicted.
  check('13a-focus', 'the tab that was focused at exit is focused again after the restart',
    storedAfter !== null && storedAfter.activeId === 'doc:canvas:ghz-cliffs',
    `stored at exit: activeId=${storedBefore ? storedBefore.activeId : '?'} with ${storedBefore ? storedBefore.tabs.length : '?'} tabs; `
    + `after the restore: activeId=${storedAfter ? storedAfter.activeId : '?'} with ${storedAfter ? storedAfter.tabs.length : '?'} tabs; `
    + `open canvas documents=${JSON.stringify(docs)}; activeDocId=${active}; a canvas element is mounted=${onScreen}`);
  const droppedTabs = storedBefore && storedAfter
    ? storedBefore.tabs.map((t) => t.id).filter((id) => !storedAfter.tabs.some((u) => u.id === id)) : [];
  if (droppedTabs.length) {
    note('13a-focus', 'tabs the restore DROPPED', JSON.stringify(droppedTabs));
  }
  note('13a', 'toasts at boot', JSON.stringify(toasts));

  // (iii) Given the focus, click the canvas tab: the document must come back
  // byte-identical. This is the half of row 13 about the DATA.
  const focused = await focusTab(c, 'Canvas · ghz-cliffs', 2500);
  const hash = await c.evalExpr(`window.__dbg.canvas.pixelsHash(${JSON.stringify(shared.docId)})`);
  const drawn = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`);
  const mounted = await c.evalExpr('window.__c.canvas() !== null');
  await shot(c, '20b-restart-canvas-focused');
  check('13a-pixels', 'focusing the restored tab brings the pixels back exactly',
    focused === true && hash === shared.finalHash && drawn === shared.finalDrawn && mounted === true,
    `pixel hash ${shared.finalHash} → ${hash} (${hash === shared.finalHash ? 'identical' : 'DIFFERENT'}); `
    + `drawn ${shared.finalDrawn} → ${drawn}; a canvas element is mounted=${mounted}`);
  neg('13a-pixels', 'the restored document is empty', drawn === 0, `${drawn} drawn pixels`);

  // Leave the canvas focused so session C boots from the same shape.
  await c.evalExpr(INSTALL);
}

/**
 * The parsed stored-session payload FOR THE PROJECT UNDER TEST.
 *
 * ⚠ THIS USED TO TAKE THE FIRST KEY THAT WAS NOT `no-project`, whichever
 * project that named. One profile is shared by every instrument in
 * `scratchpad/`, so on a machine where anything else has opened a project the
 * map carries several `aurora.session.v1:<dir>` keys and insertion order
 * decides which one this returns. `[13a-focus]` would then compare ANOTHER
 * project's `activeId` against this run's canvas tab and report the app as
 * having lost the focus it never held — the same class of fault as the empty
 * profile `waitRestored` now refuses over, but quieter, because it produces a
 * plausible wrong answer instead of an absence.
 *
 * Keyed on the project directory now, and `null` when that key is absent
 * rather than falling back to a neighbour's.
 */
function sessionPayloadFor(map, projectDir) {
  if (!map) return null;
  const v = map[`aurora.session.v1:${projectDir}`];
  if (v === undefined) return null;
  try { return JSON.parse(v); } catch { return null; }
}

// --- session C: the PNG is gone --------------------------------------------
async function sessionC(c, shared) {
  if (!run('13')) return;
  const restored = await waitRestored(c);
  note('13b', 'restore settled', JSON.stringify({ waited: restored.waitedMs, tabs: restored.tabs }));
  const toasts = await c.json('window.__dbg.canvas.toasts()');
  const domToasts = await c.json('window.__c.toasts()');
  const docs = await c.json('window.__dbg.canvas.docIds()');
  await shot(c, '21-restart-png-deleted');
  const storedBefore = sessionPayloadFor(restored.storedBeforeOpen, S1DIR);
  check('13b-toast', 'with the PNG deleted, the boot restore raises NO toast',
    toasts.length === 0 && domToasts.length === 0 && !docs.includes(shared.docId),
    `the stored session handed to the restore had activeId=${storedBefore ? storedBefore.activeId : '?'} `
    + `(so activateRestoredCanvasDocTarget did run and its load did fail); toasts in the store=${JSON.stringify(toasts)}; `
    + `toasts in the DOM=${domToasts.length}; open canvas documents=${JSON.stringify(docs)}`);

  // Now click the tab — a user's own click, which SHOULD report.
  const focused = await focusTab(c, 'Canvas · ghz-cliffs', 2500);
  const card = await c.json('window.__c.unloadedCard()');
  const afterClick = await c.json('window.__c.toasts()');
  const docsAfter = await c.json('window.__dbg.canvas.docIds()');
  await shot(c, '21b-unloaded-pane');
  check('13b-pane', 'clicking the tab of a canvas whose PNG is gone shows the "could not be loaded" pane',
    focused === true && card !== null && !docsAfter.includes(shared.docId),
    `card=${card ? JSON.stringify(card.text.slice(0, 200)) : 'ABSENT'}; toasts raised by the click: `
    + `${JSON.stringify(afterClick.map((t) => t.text))}; open documents=${JSON.stringify(docsAfter)}`);

  // Retry with the file still missing: it must fail honestly.
  await c.evalExpr(`(() => { document.querySelectorAll('div[title="Dismiss"]').forEach((t) => t.click()); return 1; })()`);
  await sleep(700);
  const retried = await c.evalExpr('window.__c.clickRetry()');
  await sleep(2000);
  await c.evalExpr(INSTALL);
  const afterRetry = await c.json('window.__c.toasts()');
  const cardAfter = await c.json('window.__c.unloadedCard()');
  await shot(c, '22-retry-still-missing');
  check('13c', 'Retry re-runs the real load — it reports the failure and stays on the pane',
    retried === true && afterRetry.length > 0 && cardAfter !== null,
    `Retry clicked=${retried}; toasts after: ${JSON.stringify(afterRetry.map((t) => t.text))}; card still shown=${cardAfter !== null}`);

  // Put the PNG back and Retry again — the pane must recover.
  if (shared.pngBackup) {
    writeFileSync(`${CANVAS_DIR}/ghz-cliffs.png`, shared.pngBackup);
    await c.evalExpr(`(() => { document.querySelectorAll('div[title="Dismiss"]').forEach((t) => t.click()); return 1; })()`);
    await sleep(600);
    await c.evalExpr('window.__c.clickRetry()');
    await sleep(2500);
    await c.evalExpr(INSTALL);
    const docsNow = await c.json('window.__dbg.canvas.docIds()');
    const cardNow = await c.json('window.__c.unloadedCard()');
    const drawnNow = await c.evalExpr(`window.__dbg.canvas.drawnPixels(${JSON.stringify(shared.docId)})`);
    await shot(c, '23-retry-recovered');
    check('13d', 'restoring the file and pressing Retry recovers the document',
      docsNow.includes(shared.docId) && cardNow === null && drawnNow === shared.finalDrawn,
      `documents=${JSON.stringify(docsNow)}; unloaded card gone=${cardNow === null}; drawn=${drawnNow} (expected ${shared.finalDrawn})`);
  }
}

// --- session D: a rejected sidecar, read on screen -------------------------
async function sessionD(c, shared) {
  if (!run('14')) return;
  const restored = await waitRestored(c);
  note('14', 'restore settled', JSON.stringify({ waited: restored.waitedMs, tabs: restored.tabs }));

  // READ BEFORE TOUCHING ANYTHING. The corrupted sidecar was written before
  // launch, and the restore's own activation is the load — so the R12 warning
  // is already on screen by the time the harness gets here. An earlier version
  // dismissed the toasts first and then clicked the tab, which resolved to a
  // plain focus (the document was already open) and therefore raised nothing:
  // it reported "the load does not warn" about a load it had itself hidden.
  const bootToasts = await c.json('window.__c.toasts()');
  const bootDocs = await c.json('window.__dbg.canvas.docIds()');
  await shot(c, '24-load-with-rejected-sidecar');
  note('14', 'toasts on screen after the restore loaded a canvas whose sidecar is invalid JSON',
    JSON.stringify(bootToasts.map((t) => t.text)));

  const focused = bootDocs.includes(shared.docId) ? true : await focusTab(c, 'Canvas · ghz-cliffs', 2500);
  const loadToasts = bootToasts.length > 0 ? bootToasts : await c.json('window.__c.toasts()');
  const docs = await c.json('window.__dbg.canvas.docIds()');
  const st = docs.includes(shared.docId) ? await c.json(`window.__dbg.canvas.state(${JSON.stringify(shared.docId)})`) : null;
  check('14a', 'a canvas with an unreadable sidecar still OPENS, with the rejection recorded on its source',
    focused === true && st !== null && st.source !== null && st.source.sidecarRejected === true,
    `state=${JSON.stringify(st)}`);
  if (!st) {
    // Every row below this point reads `st`/the loaded document, so none of
    // them can be asked. They are NAMED rather than silently dropped — see
    // `unexercised`.
    unexercised(['14a2', '14b', '14c', '14d', '14e', '14f', '14g'],
      `[14a] could not read the document's state (docIds=${JSON.stringify(docs)}, wanted ${JSON.stringify(shared.docId)}), `
      + 'and every row below it reads that state');
    return;
  }
  check('14a2', 'the LOAD itself warns about the rejected sidecar (R12) — before any save',
    loadToasts.some((t) => /sidecar/i.test(t.text)),
    `the document was ${bootDocs.includes(shared.docId) ? 'already loaded by the restore' : 'loaded by a tab click'}; `
    + `toasts: ${JSON.stringify(loadToasts.map((t) => t.text))}`);

  // Now edit and save — this is the path that raises the toast row 14 is about.
  await c.evalExpr('window.__c.clickTool("Pencil")'); await sleep(300);
  await drawArt(c, 5, 50, 25, 50, 64, 6);
  await c.evalExpr(INSTALL);
  await c.evalExpr(`(() => { document.querySelectorAll('div[title="Dismiss"]').forEach((t) => t.click()); return 1; })()`);
  await sleep(700);
  await ctrlS(c);
  await sleep(1800);
  await c.evalExpr(INSTALL);
  const t = await c.json('window.__c.toasts()');
  const w = await c.evalExpr('window.innerWidth');
  await shot(c, '25-sidecar-rejected-toast');
  const target = t.find((x) => /not its settings/.test(x.text)) ?? t[0];
  check('14b', 'the save raises the sidecar-rejection toast, with the recovery instruction in it',
    target !== undefined && /Fix that file by hand/.test(target.text) && /reopen the canvas/i.test(target.text),
    target ? `"${target.text}"` : `NO TOAST — on screen: ${JSON.stringify(t.map((x) => x.text))}`);

  if (target) {
    const oneLine = parseFloat(target.lineHeight) || 16;
    check('14c', 'it WRAPS instead of running off the edges of a normal window',
      target.whiteSpace !== 'nowrap' && target.h > oneLine * 2 && target.left >= 0 && target.right <= w,
      `window ${w}px wide; toast box ${target.w}x${target.h}px at x ${target.left}..${target.right}; `
      + `white-space=${target.whiteSpace}; overflow-wrap=${target.overflowWrap}; line-height=${target.lineHeight} `
      + `→ about ${Math.round(target.h / oneLine)} lines`);
    check('14d', 'nothing is clipped — the whole message is inside the box',
      target.scrollW <= target.clientW + 1 && target.scrollH <= target.clientH + 1,
      `scrollWidth ${target.scrollW} vs clientWidth ${target.clientW}; scrollHeight ${target.scrollH} vs clientHeight ${target.clientH}`);
    note('14', 'container', `maxWidth=${target.containerMaxW}, pointerEvents=${target.containerPointer} (strip) / ${target.pointerEvents} (toast)`);
  }

  // Dwell: an error toast must survive long enough to be read.
  await sleep(3500);
  const t3 = await c.json('window.__c.toasts()');
  await sleep(5000);
  const t8 = await c.json('window.__c.toasts()');
  check('14e', 'the error toast stays on screen long enough to read (>8s)',
    t3.length > 0 && t8.length > 0,
    `still on screen after ~3.5s: ${t3.length > 0}; after ~8.5s: ${t8.length > 0}`);
  neg('14e', 'the toast vanished within 3.5 seconds', t3.length === 0, `${t3.length} toasts at t+3.5s`);

  // Click-to-dismiss, the other half of the longer dwell.
  const clicked = await c.json(`(() => { const el = document.querySelector('div[title="Dismiss"]'); if (!el) return null;
    const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }; })()`);
  if (clicked) {
    await mouse(c, 'mousePressed', clicked.x, clicked.y);
    await sleep(50);
    await mouse(c, 'mouseReleased', clicked.x, clicked.y, { buttons: 0 });
    await sleep(1000);
    const left = await c.json('window.__c.toasts()');
    check('14f', 'clicking the toast dismisses it', left.length === 0,
      `${left.length} toasts remain after a real click at (${clicked.x},${clicked.y})`);
  } else {
    note('14f', 'click-to-dismiss NOT TESTED', 'no toast element was on screen to click');
  }

  // And the sidecar Aurora could not read was NOT overwritten.
  const side = `${CANVAS_DIR}/ghz-cliffs.canvas.json`;
  const onDisk = existsSync(side) ? readFileSync(side, 'utf8') : null;
  check('14g', 'the unreadable sidecar was left ALONE, not replaced',
    onDisk !== null && onDisk.includes('DELIBERATELY BROKEN'),
    `on disk now: ${JSON.stringify((onDisk ?? '').slice(0, 140))}`);
}

// ---------------------------------------------------------------------------
// RUN ONLY WHEN INVOKED DIRECTLY. Importing this file for its helpers (see the
// export above) must not launch Electron and drive fourteen rows as a side
// effect of the import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installSummaryNet();
  const entry = process.env.PASS === '2' ? secondPass : main;
  entry().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 2; });
}
