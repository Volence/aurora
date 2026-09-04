#!/usr/bin/env node
// ITEM 29 — DOES THE REAL PANEL AUTHOR A MOVING BAND? `phaseFill: 'shift'`
// THROUGH THE UI, ON THE LIVE 448/448 DOCUMENT, TO A SAVED FILE WHOSE BANKS
// ARE PRE-SHIFTED PHASES.
//
// The insert-roomy harness (bganim-insert-roomy-harness.mjs, whose shape this
// copies) proved the two authoring doors click-for-click. What it could not
// prove is MOTION: every band it saved carried copy-of-phase-0 banks, which
// the runtime draws identically at every step. This harness selects the new
// "pre-shifted (moves)" fill in the panel, promotes a range on aeon's LIVE
// saturated document, saves with a real Ctrl+S keystroke, and then holds the
// SAVED FILE to the contract's own definition of phases — "pre-shifted art 1px
// apart, selected by step & 7" — with bank k derived INDEPENDENTLY here by a
// whole-pixel-grid roll of bank 0. The app is never asked whether it worked.
//
// DIRECTION, derived not chosen (same derivation as
// test/formats/bg-anim-band-phase-shift.test.ts): aeon's runtime coarse DMA
// (engine/level/bg_anim.emp — slot column j holds art column j+coarse) and
// aeon's own generator (tools/forest_bg_gen.py — `pat_pixel((v + ph) % PAT_W)`)
// both put bank k's pixel at x equal to bank 0's pixel at (x + k) mod
// pattern_px. Slots are COLUMN-MAJOR (bg_anim.emp header), tiles row-major 8x8.
//
// ═══ HERMETIC, AND PINNED ═══ exactly the roomy harness's arrangement: the
// LIVE state runs in a mkdtemp `git -C <aeon> archive <SHA> | tar -x` checkout,
// so nothing here can touch aeon's working tree or trip its staleness gate.
// Nothing builds or runs the band; the saved document is emitted for the
// injector/emulator stage, which is the overseer's, in the foreground.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run: node scratchpad/bganim-phase-shift-harness.mjs
//   env AEON_DIR (default ../aeon), AEON_SHA (default: the roomy provenance
//   sidecar's pin), BAND=CxR (default 2x1), PORT, VERBOSE, EMIT_DIR
import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEON = siblingPathOrUnresolved('aeon');   // honours AEON_DIR at step 1
const FIXTURES = `${ROOT}/test/fixtures/bg-override`;
const PROVENANCE = JSON.parse(readFileSync(`${FIXTURES}/editor_bg_override.roomy.provenance.json`, 'utf8'));
const AEON_SHA = process.env.AEON_SHA ?? PROVENANCE.aeon.revision;
const SHOTS = `${ROOT}/scratchpad/shots-bganim-phase-shift`;
const EMIT_DIR = process.env.EMIT_DIR ?? `${ROOT}/scratchpad/item29-emit`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(EMIT_DIR, { recursive: true });

// ═══ EXPECTATIONS DERIVED FROM THE VENDORED CONTRACT, NOT TYPED IN ═══
const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const TILE_CAPACITY = CONTRACT.constants.BG_TILE_CAPACITY.value;
const PHASE_BANKS = CONTRACT.constants.BGANIM_PHASE_BANKS.value;
const TILE_W = CONTRACT.constants.TILE_WIDTH_PX.value;
const LAYOUT_WORDS = 64 * 64;
const AEON_TILE_INDEX_MASK = 0x7FF;

// ═══ THE INDEPENDENT INSTRUMENT: column-major tiles ⇄ pixel grid, and a roll ═══
function gridOf(tiles, cols, rows) {
  const w = cols * TILE_W, h = rows * TILE_W;
  const grid = Array.from({ length: h }, () => new Array(w).fill(-1));
  for (let col = 0; col < cols; col++) {
    for (let r = 0; r < rows; r++) {
      const tile = tiles[col * rows + r];                       // column-major slot
      for (let py = 0; py < TILE_W; py++) {
        for (let px = 0; px < TILE_W; px++) {
          grid[r * TILE_W + py][col * TILE_W + px] = tile[py * TILE_W + px];  // row-major tile
        }
      }
    }
  }
  return grid;
}
function rollLeft(grid, k) {                                    // out[y][x] = grid[y][(x+k) mod w]
  const w = grid[0].length;
  return grid.map((line) => line.map((_, x) => line[(x + k) % w]));
}
function tilesOf(grid, cols, rows) {
  const out = [];
  for (let col = 0; col < cols; col++) {
    for (let r = 0; r < rows; r++) {
      const tile = new Array(TILE_W * TILE_W);
      for (let py = 0; py < TILE_W; py++) {
        for (let px = 0; px < TILE_W; px++) {
          tile[py * TILE_W + px] = grid[r * TILE_W + py][col * TILE_W + px];
        }
      }
      out.push(tile);
    }
  }
  return out;
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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

// ⚠ THE FORM IS BEHIND A SUB-TAB AND A DISCLOSURE NOW, AND NEITHER USED TO BE
// TOUCHED (O50 triage, 2026-09-03). Two 2026-09-02 moves:
//   • `aeon.bganim.new` is on the `tileAnim` sub-tab
//     (providers/effects-sub-tabs.ts) and the facet arrives on `parallax`. A
//     section on an inactive tab is NOT MOUNTED.
//   • the disclosure is titled `New tile animation` (BgAnimBandPanel.tsx:635,
//     renamed at 023e0ed9) and arrives COLLAPSED, and a collapsed
//     CollapsibleSection renders no children at all.
// So the phase-fill select, the cols/rows/base fields and Promote were all
// absent from the DOM, and rows 3a/3b/4a/5a reported the CONTROLS as missing —
// which reads exactly like a deleted feature.
const SELECT_TILE_ANIM_TAB = String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="tileAnim"]');
  if (!t) return 'no-tab-bar';
  t.click();
  return 'clicked';
})()`;
const OPEN_NEW_BAND = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => (h.firstElementChild.textContent || '').trim() === 'New tile animation');
  if (!hdr) return 'no-section';
  if (hdr.parentElement.parentElement.children.length > 1) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-bganim-phase-shift/${name}.png`);
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
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;
const SELECT_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;
const INPUT_BY_TITLE = (re) => `[...document.querySelectorAll('input')].find((e) => ${re}.test(e.title || ''))`;
const BODY_TEXT = `(document.body.innerText || '').replace(/\\s+/g, ' ')`;

/** The whole picture as the APP holds it, one string per cell (aeon's resolver). */
const RENDER_IN_APP = String.raw`
(() => {
  const out = new Array(${LAYOUT_WORDS});
  for (let i = 0; i < ${LAYOUT_WORDS}; i++) {
    const w = window.__dbg.aeon.bgOverrideLayoutAt(i);
    if (w === 0) { out[i] = 'B'; continue; }
    const t = window.__dbg.aeon.bgOverrideTileAt(w & ${AEON_TILE_INDEX_MASK});
    out[i] = (w & ~${AEON_TILE_INDEX_MASK}) + ':' + (t ? t.join(',') : 'DANGLING');
  }
  return out;
})()`;
function renderFile(doc) {
  return doc.layout.map((w) => {
    if (w === 0) return 'B';
    const t = doc.tiles[w & AEON_TILE_INDEX_MASK];
    return (w & ~AEON_TILE_INDEX_MASK) + ':' + (t ? t.join(',') : 'DANGLING');
  });
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** A pinned, hermetic checkout of aeon — the LIVE document at AEON_SHA. */
function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), 'aurora-item29-'));
  const tar = execFileSync('git', ['-C', AEON, 'archive', AEON_SHA], { maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1 << 30 });
  return { dir, file: `${dir}/games/sonic4/data/editor_bg_override.json` };
}

async function launch() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });
  const c = cdp(await waitForTarget());
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
  await c.evalExpr('localStorage.clear()');
  await c.send('Page.reload');
  await sleep(4000);
  await waitDbg();
  return { child, c };
}

/**
 * Teardown, VERIFIED rather than timed.
 *
 * ⚠ WHAT THIS REPLACES. The `finally` below used to SIGTERM the group, wait a
 * FIXED `sleep(1500)`, and then `rmSync(dir)` — no SIGKILL if the tree ignored
 * the SIGTERM, and no check that anything had actually gone. The census
 * (docs/reviews/2026-09-04-o78-residual-census.md §2) caught this shape in the
 * sibling `bganim-insert-roomy-harness.mjs` with its own tell on 1 of 4 runs:
 * the run that failed a row and aborted early reached the exit net with its
 * tree still alive, the three clean runs did not. It passed or failed by luck.
 * **A fixed-duration wait is not a wait; only a verified one is.**
 *
 * `killTree` is the O65 ordered sequence — app pids SIGTERMed first, a bounded
 * grace spent waiting for them to be GONE (not zombies), then the wrapper's
 * group so the X server goes down under nothing, then SIGKILL over what is
 * left, then the X-artifact reap — and it RETURNS the survivor list, which is
 * the whole point: `sleep()` cannot tell you it failed and this can. It was
 * already imported by this file and never called. The port is polled after it
 * because the port is what the NEXT run of this harness depends on:
 * `launch()` opens with `if (!(await portFree())) throw`.
 *
 * LOUD, NEVER SILENT: an unkillable survivor and a port that never frees are
 * both WARNed with what was observed, and neither throws — a `finally` must
 * not throw over the failure it is cleaning up after.
 */
async function teardown(child, dir) {
  const { survivors, tree } = await killTree(child);
  if (survivors.length) {
    console.log(`WARN       teardown could NOT kill ${survivors.length} of ${tree.length} process(es) `
      + `after SIGTERM, grace and SIGKILL: ${survivors.join(',')} — the tree this run launched is still up`);
  }
  for (let i = 0; i < 30 && !(await portFree()); i++) await sleep(500);
  if (!(await portFree())) {
    console.log(`WARN       port ${PORT} is STILL SERVING a CDP target 15 s after the tree was killed — `
      + 'the next run of this harness will refuse to launch');
  }
  rmSync(dir, { recursive: true, force: true });
}

async function main() {
  console.log(`DERIVED FROM THE VENDORED CONTRACT (${CONTRACT.source.repo}@${CONTRACT.source.commit.slice(0, 7)}):`);
  console.log(`  BG_TILE_CAPACITY = ${TILE_CAPACITY}   PHASE_BANKS = ${PHASE_BANKS}   TILE_WIDTH_PX = ${TILE_W}`);
  console.log(`  aeon: ${AEON} @ ${AEON_SHA} (git archive → mkdtemp; the working tree is never opened)`);

  const { dir, file } = makeProject();
  const placedBytes = readFileSync(file);
  const placed = JSON.parse(placedBytes.toString('utf8'));
  writeFileSync(`${EMIT_DIR}/live-before.json`, placedBytes);
  console.log(`\n=== LIVE: ${file}\n    placed ${placedBytes.length} B sha256 ${sha(placedBytes).slice(0, 16)}… (${placed.tiles.length} tiles)`);

  // Geometry: BAND=CxR or 2x1 (colBytes = 32, a power of two; patternPx = 16).
  const [COLS, ROWS] = (process.env.BAND ?? '2x1').split('x').map(Number);
  const N = COLS * ROWS;
  // The promoted range must be ROLL-ASYMMETRIC or every motion row is vacuous:
  // scan the placed blob for the first base whose band-grid differs from its
  // own 1px roll. Derived from the document, never assumed of it.
  const firstPromotable = Array.isArray(placed.anims)
    ? placed.anims.reduce((s, a) => s + a.cols * a.rows, 0) : 0;
  let BASE = -1;
  for (let b = firstPromotable; b + N <= placed.tiles.length; b++) {
    const g = gridOf(placed.tiles.slice(b, b + N), COLS, ROWS);
    if (!eq(rollLeft(g, 1), g)) { BASE = b; break; }
  }
  check('0a', `a roll-asymmetric ${COLS}x${ROWS} range exists in the live blob [anti-vacuous floor]`,
    BASE >= 0, `base=${BASE}`);
  if (BASE < 0) throw new Error('every candidate range is roll-symmetric — nothing could prove motion');

  const { child, c } = await launch();
  try {
    // ── open and reach the band panel (the roomy harness's preamble) ──
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(dir)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the hermetic pinned checkout opened as a project, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2000);
    const pill = await c.evalExpr(clickByText('/^Effects$/'));
    check('1b', 'the Effects pill is on the facet bar [instrument]', pill === true);
    await sleep(1500);
    const tabbed = await c.evalExpr(SELECT_TILE_ANIM_TAB);
    await sleep(1000);
    const subTab = await c.evalExpr('window.__dbg.parallaxPreview().subTab');
    check('1c', 'the Tile anim sub-tab is active, so the creation form is MOUNTED [instrument]',
      subTab === 'tileAnim',
      `SELECT_TILE_ANIM_TAB -> ${JSON.stringify(tabbed)}; store subTab=${JSON.stringify(subTab)}`);
    const openedNew = await c.evalExpr(OPEN_NEW_BAND);
    await sleep(800);
    check('1d', 'the New tile animation disclosure is OPEN — it arrives collapsed, and a collapsed '
      + 'section renders NO children [instrument]',
      openedNew === 'clicked' || openedNew === 'already-open',
      `OPEN_NEW_BAND -> ${JSON.stringify(openedNew)}`);

    // ── preconditions: THIS document, saturated, bandless ──
    const status = await c.json('window.__dbg.aeon.bgOverrideStatus()');
    const budget0 = await c.json('window.__dbg.aeon.bandBudget()');
    check('2a', 'the override document loaded', !!(status && status.present && status.unreadable === null),
      JSON.stringify(status));
    check('2b', `the model holds the live file: ${placed.tiles.length}/${TILE_CAPACITY} tiles, saturated`,
      budget0.tiles === placed.tiles.length && budget0.tileCapacity === TILE_CAPACITY
        && budget0.tileSlotsRemaining === TILE_CAPACITY - placed.tiles.length,
      JSON.stringify(budget0));
    const bands0 = await c.json('window.__dbg.aeon.bands()');
    check('2c', 'ZERO bands before any click — a band found later is THIS run\'s',
      bands0.length === 0 && !Array.isArray(placed.anims), `bands=${bands0.length}`);

    // ── the FILL SELECTOR: exists, defaults to copy, takes 'shift' ──
    const fillSel = await c.json(`(() => { const el = ${SELECT_BY_TITLE('/phase fill —/')}; `
      + 'return el ? { value: el.value, options: [...el.options].map(o => o.value) } : null; })()');
    check('3a', "the Banks 1–7 selector exists, offers copy/blank/shift, and DEFAULTS to 'copy'",
      !!fillSel && fillSel.value === 'copy'
        && eq([...fillSel.options].sort(), ['blank', 'copy', 'shift']),
      JSON.stringify(fillSel));
    const pickedFill = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/phase fill —/'), 'shift'));
    await sleep(400);
    const noteText = await c.evalExpr(BODY_TEXT);
    check('3b', "selecting 'shift' takes, and the panel's note now promises motion",
      // ⚠ THE NOTE'S OWN WORDS moved at 023e0ed9: the provider writes "so the
      // TILE ANIMATION MOVES with no further authoring"
      // (providers/bg-anim-aeon.ts:186-187). "band MOVES" is the retired
      // spelling — the word the vocabulary split removed for naming two
      // features. Taken from the provider, not from a passing run.
      pickedFill === 'ok' && /pre-shifted 1 px per bank/.test(noteText)
        && /tile animation MOVES with no further authoring/.test(noteText),
      pickedFill === 'ok' ? (noteText.match(/banks 1–7 are phase 0[^.]*\./) || ['note not found'])[0] : pickedFill);

    // ── geometry + base, then PROMOTE ──
    const typedCols = await c.evalExpr(SET_INPUT(INPUT_BY_TITLE('/^cols —/'), COLS));
    const chosenRows = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/rows —/'), ROWS));
    const typedBase = await c.evalExpr(SET_INPUT(INPUT_BY_TITLE('/^static base —/'), BASE));
    check('4a', `the form takes ${COLS}x${ROWS} from tile ${BASE}`,
      typedCols === 'ok' && chosenRows === 'ok' && typedBase === 'ok',
      `cols=${typedCols} rows=${chosenRows} base=${typedBase}`);
    await sleep(400);
    const pictureBefore = await c.json(RENDER_IN_APP);
    await shot(c, '1-before-promote');
    const clicked = await c.evalExpr(clickByText('/^Promote$/', 'button'));
    await sleep(900);
    const bands1 = await c.json('window.__dbg.aeon.bands()');
    const budget1 = await c.json('window.__dbg.aeon.bandBudget()');
    check('5a', 'the click created the band IN THE MODEL, at slot 0, with the form\'s geometry',
      clicked === true && bands1.length === 1 && bands1[0].cols === COLS && bands1[0].rows === ROWS
        && bands1[0].slotBase === 0 && bands1[0].phaseBanks === PHASE_BANKS,
      `click=${clicked} bands=${JSON.stringify(bands1)}`);
    if (bands1.length !== 1) throw new Error('no band in the model');
    check('5b', 'promotion spent NO tiles — the blob length is unchanged at capacity',
      budget1.tiles === budget0.tiles && budget1.tileSlotsRemaining === budget0.tileSlotsRemaining,
      `tiles ${budget0.tiles} -> ${budget1.tiles}`);
    const pictureAfter = await c.json(RENDER_IN_APP);
    const changedCells = pictureBefore.filter((v, i) => v !== pictureAfter[i]).length;
    check('5c', 'IN THE APP: the picture AT REST is unchanged, cell for cell — shift touches only banks 1..',
      changedCells === 0 && !pictureAfter.some((v) => /DANGLING/.test(v)),
      `${changedCells} of ${LAYOUT_WORDS} cells differ`);
    await shot(c, '2-after-promote');

    // ── Ctrl+S as a KEYSTROKE, then the saved file under the contract ──
    const hashBefore = sha(placedBytes);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
    let hashAfter = hashBefore;
    for (let i = 0; i < 40; i++) { await sleep(400); hashAfter = sha(readFileSync(file)); if (hashAfter !== hashBefore) break; }
    check('6a', 'Ctrl+S changed the bytes on disk [precondition for every row below]',
      hashAfter !== hashBefore, `before ${hashBefore.slice(0, 16)}… after ${hashAfter.slice(0, 16)}…`);
    if (hashAfter === hashBefore) throw new Error('nothing was written');
    const savedBytes = readFileSync(file);
    writeFileSync(`${EMIT_DIR}/live-promoted-shift.json`, savedBytes);
    const saved = JSON.parse(savedBytes.toString('utf8'));
    check('6b', `the saved file carries ONE band, ${COLS}x${ROWS}, with exactly ${PHASE_BANKS} banks`,
      Array.isArray(saved.anims) && saved.anims.length === 1
        && saved.anims[0].cols === COLS && saved.anims[0].rows === ROWS
        && Array.isArray(saved.anims[0].phases) && saved.anims[0].phases.length === PHASE_BANKS,
      `anims=${JSON.stringify((saved.anims ?? []).map((a) => ({ cols: a.cols, rows: a.rows, banks: a.phases?.length })))}`);
    const phases = saved.anims[0].phases;
    check('6c', 'prefix identity: the saved phases[0] IS tiles[0..n), and it is the PROMOTED range\'s art',
      eq(phases[0], saved.tiles.slice(0, N)) && eq(phases[0], placed.tiles.slice(BASE, BASE + N)),
      `n=${N} base=${BASE}`);

    // THE HEADLINE ROW: bank k of the SAVED FILE equals bank 0 rolled k px,
    // derived here by the independent grid roll — for every bank, exactly.
    const g0 = gridOf(phases[0], COLS, ROWS);
    let allMatch = true, anyDiffers = false;
    const detail = [];
    for (let k = 0; k < PHASE_BANKS; k++) {
      const expected = tilesOf(rollLeft(g0, k), COLS, ROWS);
      const match = eq(phases[k], expected);
      if (!match) allMatch = false;
      if (k > 0 && !eq(phases[k], phases[0])) anyDiffers = true;
      detail.push(`bank${k}:${match ? 'roll-ok' : 'MISMATCH'}`);
    }
    check('6d', `SAVED FILE: bank k = bank 0 rolled k px for ALL ${PHASE_BANKS} banks (independent roll)`,
      allMatch, detail.join(' '));
    check('6e', 'and the banks actually DIFFER from bank 0 — the band will visibly move [anti-vacuous]',
      anyDiffers, anyDiffers ? 'banks 1.. differ from bank 0' : 'all banks identical — no motion');

    // FILE vs FILE image invariance at rest, through aeon's resolver.
    const before = renderFile(placed);
    const after = renderFile(saved);
    const diffs = before.filter((v, i) => v !== after[i]).length;
    check('6f', 'SAVED vs PLACED: zero resolved cells differ at rest, over a multi-image nametable',
      diffs === 0 && new Set(before).size > 1 && saved.tiles.length === placed.tiles.length,
      `resolved diffs ${diffs}; ${new Set(before).size} distinct images; tiles ${saved.tiles.length}`);

    writeFileSync(`${EMIT_DIR}/aurora-claims.json`, JSON.stringify({
      item: 29, aeonSha: AEON_SHA, band: { cols: COLS, rows: ROWS, staticBase: BASE, phaseFill: 'shift' },
      budgetBefore: budget0, budgetAfter: budget1,
    }, null, 2));
    console.log(`  emitted → ${EMIT_DIR}/{live-before,live-promoted-shift,aurora-claims}.json`);
  } finally {
    try { c.close(); } catch { /* */ }
    await teardown(child, dir);
  }

  console.log(`\n${'='.repeat(70)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log(`  ${f}`)); }
  console.log('NOTE: this proves the UI authored a SHIFT-filled band and the saved file holds');
  console.log('the contract\'s pre-shifted phases. Whether the band MOVES on hardware is the');
  console.log('injector + emulator stage (ROADMAP 29-ROM), which is the overseer\'s, in the');
  console.log('foreground: python3 scratchpad/bganim-promoted-vs-aeon-injector.py <EMIT_DIR> --after live-promoted-shift.json');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e.message}`); process.exit(2); });
