#!/usr/bin/env node
// THE HANDOVER BAND — the first BgAnim band meant to actually MOVE in the ROM,
// authored through Aurora's REAL UI on a copy of aeon's live shipped OJZ act-1
// background, at aeon's CURRENT PUSHED revision.
//
// Descended from scratchpad/bganim-phase-shift-harness.mjs (item 29), which is
// left untouched as the regression it is. What is different here, and why:
//
//   * THE PIN IS RESOLVED, NOT TYPED. `git ls-remote origin refs/heads/master`
//     every run, printed loudly, recorded in the provenance sidecar. A built-in
//     default revision is the exact defect that made the item-27 probe certify
//     against a months-old injector; a constant here would reintroduce it.
//   * 8x4 FROM TILE 2, and both halves of that are MEASURED, not chosen:
//       - roll-asymmetric (rows 0b/0c), else every motion row is vacuous;
//       - DRAWN BY THE LAYOUT (row 0d). This is the property that makes a
//         PROMOTION non-vacuous and it is the one an insert cannot have:
//         `planBandInsertion` only remaps existing layout words
//         (`idx < slotBase ? idx : idx + n`), so an inserted band is real in
//         the blob and invisible on screen. Promotion converts tiles the
//         layout ALREADY draws, so it is on screen by construction.
//   * driver = timer, chosen in the panel's own Driver select. A timer band
//     animates while the camera is still, which is what makes it watchable.
//   * phaseFill = 'shift'. `'copy'` (the promote default) produces a band that
//     validates perfectly and is visually inert. This run refuses to accept a
//     band whose banks equal bank 0 (row 6e).
//
// NOT AUTHORABLE THROUGH THE UI, and therefore NOT in the saved document:
//   `rate_shift`. The panel has no control for it (BgAnimBandPanel.tsx builds
//   its BandSpec from cols/rows/phaseFill/driver only), so the key is left out
//   and aeon's own default applies. Row 6g reads that default out of the
//   VENDORED CONTRACT and prints it rather than asserting a number this file
//   made up. Stated, not silently degraded.
//
// HERMETIC: the live state runs in a mkdtemp `git -C <aeon> archive <SHA> |
// tar -x` checkout. aeon's working tree is READ at a revision and never
// written. Nothing here builds, assembles or runs anything — the ROM half is
// the overseer's, in the foreground.
//
// THE HARNESS NEVER ASKS THE APP WHETHER IT WORKED. Every row below the save
// reads the SAVED FILE off disk and judges it against a roll computed here.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run: node scratchpad/handover/handover-band-harness.mjs
//   env AEON_DIR, AEON_SHA (default: resolved pushed master), BAND=CxR
//       (default 8x4), BASE (default 2), PORT, VERBOSE, EMIT_DIR
import { AURORA_DIR, siblingPathOrUnresolved } from '../../test/support/sibling-root.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as http from 'node:http';
import { spawnGuarded, killTree } from '../lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from '../lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9398);
const HERE = dirname(fileURLToPath(import.meta.url));
// HERE is scratchpad/handover, so the repo root is TWO levels up — not one.
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
// READ-ONLY (`git -C AEON show`), so the default location is fine here; the
// resolver honours AEON_DIR at step 1. This used to hand-roll the sibling by
// string-surgery on the worktree path, which is the derivation `sibling-root`
// exists to be the only copy of.
const AEON = siblingPathOrUnresolved('aeon');
// THE PIN. Resolved from the remote unless the caller pins it explicitly.
const AEON_SHA = process.env.AEON_SHA ?? execFileSync(
  'git', ['-C', AEON, 'ls-remote', 'origin', 'refs/heads/master'], { encoding: 'utf8' },
).split('\t')[0].trim();
const SHOTS = `${HERE}/shots`;
const EMIT_DIR = process.env.EMIT_DIR ?? `${HERE}/emit`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(EMIT_DIR, { recursive: true });

// ═══ EXPECTATIONS DERIVED FROM THE VENDORED CONTRACT, NOT TYPED IN ═══
const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const TILE_CAPACITY = CONTRACT.constants.BG_TILE_CAPACITY.value;
const PHASE_BANKS = CONTRACT.constants.BGANIM_PHASE_BANKS.value;
const TILE_W = CONTRACT.constants.TILE_WIDTH_PX.value;
const MAX_BANDS = CONTRACT.constants.BGANIM_MAX_BANDS.value;
const RATE_SHIFT_DEFAULT = CONTRACT.bandKeys.rate_shift.default;
const DRIVER_DEFAULT = CONTRACT.bandKeys.driver.default;
const LAYOUT_WORDS = 64 * 64;
const AEON_TILE_INDEX_MASK = 0x7FF;

// ═══ THE INDEPENDENT INSTRUMENT: column-major slots ⇄ pixel grid, and a roll ═══
// DIRECTION, derived not chosen (the same derivation as
// test/formats/bg-anim-band-phase-shift.test.ts): aeon's runtime coarse DMA
// (engine/level/bg_anim.emp — slot column j holds art column j+coarse) and
// aeon's generator (tools/forest_bg_gen.py — `pat_pixel((v + ph) % PAT_W)`)
// both put bank k's pixel at x equal to bank 0's pixel at (x + k) mod
// pattern_px. Slots are COLUMN-MAJOR; tiles are row-major 8x8.
function gridOf(tiles, cols, rows) {
  const w = cols * TILE_W, h = rows * TILE_W;
  const grid = Array.from({ length: h }, () => new Array(w).fill(-1));
  for (let col = 0; col < cols; col++) {
    for (let r = 0; r < rows; r++) {
      const tile = tiles[col * rows + r];
      for (let py = 0; py < TILE_W; py++) {
        for (let px = 0; px < TILE_W; px++) {
          grid[r * TILE_W + py][col * TILE_W + px] = tile[py * TILE_W + px];
        }
      }
    }
  }
  return grid;
}
function rollLeft(grid, k) {
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
  console.log(`        shot → scratchpad/handover/shots/${name}.png`);
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
const CONTROL_BY_TEXT = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return null;
  return { text: (el.textContent || '').trim(), disabled: !!el.disabled, title: el.title || '' };
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
  const dir = mkdtempSync(join(tmpdir(), 'aurora-handover-'));
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

async function main() {
  console.log(`DERIVED FROM THE VENDORED CONTRACT (${CONTRACT.source.repo}@${CONTRACT.source.commit.slice(0, 7)}):`);
  console.log(`  BG_TILE_CAPACITY=${TILE_CAPACITY}  PHASE_BANKS=${PHASE_BANKS}  TILE_WIDTH_PX=${TILE_W}  MAX_BANDS=${MAX_BANDS}`);
  console.log(`  contract defaults: driver=${DRIVER_DEFAULT}  rate_shift=${RATE_SHIFT_DEFAULT}`);
  console.log(`\n  aeon: ${AEON}`);
  console.log(`  PIN : ${AEON_SHA}  ${process.env.AEON_SHA ? '(pinned by env)' : '(RESOLVED from origin/master this run)'}`);
  console.log('  (git archive → mkdtemp; aeon\'s working tree is never opened or written)');

  const { dir, file } = makeProject();
  const placedBytes = readFileSync(file);
  const placed = JSON.parse(placedBytes.toString('utf8'));
  writeFileSync(`${EMIT_DIR}/live-before.json`, placedBytes);
  console.log(`\n=== LIVE: games/sonic4/data/editor_bg_override.json`);
  console.log(`    ${placedBytes.length} B  sha256 ${sha(placedBytes).slice(0, 16)}…  `
    + `${placed.tiles.length} tiles, ${placed.layout.length} layout words`);

  const [COLS, ROWS] = (process.env.BAND ?? '8x4').split('x').map(Number);
  const N = COLS * ROWS;
  const BASE = Number(process.env.BASE ?? 2);

  // ── 0. THE THREE THINGS THAT MAKE THIS BAND NON-VACUOUS ──────────────
  check('0a', `the live document carries NO bands — any band found later is THIS run's`,
    !Array.isArray(placed.anims) || placed.anims.length === 0,
    `anims=${JSON.stringify(placed.anims ?? null)}`);
  const room = TILE_CAPACITY - placed.tiles.length;
  check('0b', `promotion is the entry point under test (the blob has ${room} free slot(s); `
    + 'promotion spends none of them, which is why it works at ANY occupancy)',
    placed.tiles.length + N <= TILE_CAPACITY && BASE + N <= placed.tiles.length,
    `tiles=${placed.tiles.length}/${TILE_CAPACITY}  range=${BASE}..${BASE + N}`);
  const g0placed = gridOf(placed.tiles.slice(BASE, BASE + N), COLS, ROWS);
  const asym = [...Array(PHASE_BANKS - 1)].map((_, i) => !eq(rollLeft(g0placed, i + 1), g0placed));
  check('0c', `tiles ${BASE}..${BASE + N} are ROLL-ASYMMETRIC at every bank offset 1..${PHASE_BANKS - 1} `
    + '[anti-vacuous: a roll-symmetric range would satisfy every motion row while standing still]',
    asym.every(Boolean), `offsets differing from bank 0: ${asym.map((v, i) => (v ? i + 1 : null)).filter(Boolean).join(',')}`);
  // THE PROMOTION-SPECIFIC PROPERTY. A band nothing draws is invisible however
  // valid its bytes are. This is exactly what an INSERT cannot have.
  const drawn = placed.layout.filter((w) => {
    const idx = w & AEON_TILE_INDEX_MASK;
    return w !== 0 && idx >= BASE && idx < BASE + N;
  }).length;
  check('0d', `the promoted range is GENUINELY DRAWN: layout cells pointing into ${BASE}..${BASE + N}`,
    drawn > 0, `${drawn} of ${placed.layout.length} cells (${(100 * drawn / placed.layout.length).toFixed(1)}% of the screen)`);
  if (!asym.every(Boolean) || drawn === 0) throw new Error('the chosen range cannot prove a visible moving band');

  const { child, c } = await launch();
  try {
    // ── 1. open, and reach the band panel by real clicks ──
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

    // ── 2. preconditions, read off the running app ──
    const status = await c.json('window.__dbg.aeon.bgOverrideStatus()');
    const budget0 = await c.json('window.__dbg.aeon.bandBudget()');
    check('2a', 'the override document loaded', !!(status && status.present && status.unreadable === null),
      JSON.stringify(status));
    check('2b', `the model holds the live file: ${placed.tiles.length}/${TILE_CAPACITY} tiles, ${room} free`,
      budget0.tiles === placed.tiles.length && budget0.tileCapacity === TILE_CAPACITY
        && budget0.tileSlotsRemaining === room, JSON.stringify(budget0));
    const bands0 = await c.json('window.__dbg.aeon.bands()');
    check('2c', 'ZERO bands before any click', bands0.length === 0, `bands=${bands0.length}`);
    const panelText0 = await c.evalExpr(BODY_TEXT);
    const printedBlob = (panelText0.match(/Blob\s+\d+\/\d+\s+tiles[^.]*?free/) || [null])[0];
    check('2d', "the panel PRINTS Aurora's own blob arithmetic (the number aeon's injector "
      + 'is set against below)', !!printedBlob, printedBlob ?? 'no "Blob N/N tiles … free" on screen');

    // ── 3. the form: geometry, driver, fill, base — all by real input ──
    const typedCols = await c.evalExpr(SET_INPUT(INPUT_BY_TITLE('/^cols —/'), COLS));
    const chosenRows = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/rows —/'), ROWS));
    const typedBase = await c.evalExpr(SET_INPUT(INPUT_BY_TITLE('/^static base —/'), BASE));
    check('3a', `the form takes ${COLS}x${ROWS} from tile ${BASE}`,
      typedCols === 'ok' && chosenRows === 'ok' && typedBase === 'ok',
      `cols=${typedCols} rows=${chosenRows} base=${typedBase}`);
    const fillSel = await c.json(`(() => { const el = ${SELECT_BY_TITLE('/phase fill —/')}; `
      + 'return el ? { value: el.value, options: [...el.options].map(o => o.value) } : null; })()');
    check('3b', "the Banks 1–7 selector offers copy/blank/shift and DEFAULTS to 'copy' "
      + '[the default is the INERT one — this is why the run must change it]',
      !!fillSel && fillSel.value === 'copy' && eq([...fillSel.options].sort(), ['blank', 'copy', 'shift']),
      JSON.stringify(fillSel));
    const pickedFill = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/phase fill —/'), 'shift'));
    const pickedDriver = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/Which scalar drives/'), 'timer'));
    await sleep(400);
    const noteText = await c.evalExpr(BODY_TEXT);
    check('3c', "selecting 'shift' takes, and the panel's note promises motion",
      pickedFill === 'ok' && /pre-shifted 1 px per bank/.test(noteText)
        && /band MOVES with no further authoring/.test(noteText),
      pickedFill === 'ok' ? (noteText.match(/banks 1–7 are phase 0[^.]*\./) || ['note not found'])[0] : pickedFill);
    check('3d', "the Driver select takes 'timer' — a timer band animates with the camera still",
      pickedDriver === 'ok', `driver=${pickedDriver}`);

    // ── 4. PROMOTE ──
    const promoteBtn = await c.json(CONTROL_BY_TEXT('/^Promote$/'));
    check('4a', 'PROMOTE is enabled', !!promoteBtn && promoteBtn.disabled === false, JSON.stringify(promoteBtn));
    const pictureBefore = await c.json(RENDER_IN_APP);
    await shot(c, '1-before-promote');
    const clicked = await c.evalExpr(clickByText('/^Promote$/', 'button'));
    await sleep(1200);
    const bands1 = await c.json('window.__dbg.aeon.bands()');
    const budget1 = await c.json('window.__dbg.aeon.bandBudget()');
    check('4b', "the click created the band IN THE MODEL, at slot 0, with the form's geometry and driver",
      clicked === true && bands1.length === 1 && bands1[0].cols === COLS && bands1[0].rows === ROWS
        && bands1[0].slotBase === 0 && bands1[0].phaseBanks === PHASE_BANKS
        && bands1[0].driver === 'timer' && bands1[0].driverIsExplicit === true,
      `click=${clicked} bands=${JSON.stringify(bands1)}`);
    if (bands1.length !== 1) throw new Error('no band in the model');
    check('4c', 'promotion spent NO tiles — blob length and free slots both unchanged',
      budget1.tiles === budget0.tiles && budget1.tileSlotsRemaining === budget0.tileSlotsRemaining,
      `tiles ${budget0.tiles} -> ${budget1.tiles}, free ${budget0.tileSlotsRemaining} -> ${budget1.tileSlotsRemaining}`);
    const pictureAfter = await c.json(RENDER_IN_APP);
    const changedCells = pictureBefore.filter((v, i) => v !== pictureAfter[i]).length;
    check('4d', 'IN THE APP: the picture AT REST is unchanged cell for cell — shift touches only banks 1..',
      changedCells === 0 && !pictureAfter.some((v) => /DANGLING/.test(v)),
      `${changedCells} of ${LAYOUT_WORDS} cells differ`);
    await shot(c, '2-after-promote');

    // ── 5. SAVE with a real Ctrl+S keystroke ──
    const hashBefore = sha(placedBytes);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
    let hashAfter = hashBefore;
    for (let i = 0; i < 40; i++) { await sleep(400); hashAfter = sha(readFileSync(file)); if (hashAfter !== hashBefore) break; }
    check('5a', 'Ctrl+S changed the bytes on disk [precondition for every row below]',
      hashAfter !== hashBefore, `before ${hashBefore.slice(0, 16)}… after ${hashAfter.slice(0, 16)}…`);
    if (hashAfter === hashBefore) throw new Error('nothing was written');
    const savedBytes = readFileSync(file);
    writeFileSync(`${EMIT_DIR}/live-promoted-shift.json`, savedBytes);
    const saved = JSON.parse(savedBytes.toString('utf8'));

    // ── 6. THE SAVED FILE, judged against a roll computed HERE ──
    check('6a', `the saved file carries ONE band, ${COLS}x${ROWS}, with exactly ${PHASE_BANKS} banks`,
      Array.isArray(saved.anims) && saved.anims.length === 1
        && saved.anims[0].cols === COLS && saved.anims[0].rows === ROWS
        && Array.isArray(saved.anims[0].phases) && saved.anims[0].phases.length === PHASE_BANKS,
      `anims=${JSON.stringify((saved.anims ?? []).map((a) => ({ cols: a.cols, rows: a.rows, banks: a.phases?.length })))}`);
    const anim = saved.anims[0];
    check('6b', "the saved band spells driver 'timer'", anim.driver === 'timer', `driver=${JSON.stringify(anim.driver)}`);
    const phases = anim.phases;
    check('6c', 'prefix identity: saved phases[0] IS tiles[0..n) AND is the PROMOTED range\'s original art',
      eq(phases[0], saved.tiles.slice(0, N)) && eq(phases[0], placed.tiles.slice(BASE, BASE + N)),
      `n=${N} base=${BASE}`);

    // THE HEADLINE ROW.
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
    check('6e', 'and banks 1.. actually DIFFER from bank 0 — the band will visibly MOVE '
      + "[the 'copy' default would pass 6d and fail here]", anyDiffers,
      anyDiffers ? 'banks 1.. differ from bank 0' : 'all banks identical — no motion');

    const before = renderFile(placed);
    const after = renderFile(saved);
    const diffs = before.filter((v, i) => v !== after[i]).length;
    check('6f', 'SAVED vs PLACED: zero resolved cells differ at rest, over a multi-image nametable',
      diffs === 0 && new Set(before).size > 1 && saved.tiles.length === placed.tiles.length,
      `resolved diffs ${diffs}; ${new Set(before).size} distinct images; tiles ${saved.tiles.length}`);
    const drawnAfter = saved.layout.filter((w) => {
      const idx = w & AEON_TILE_INDEX_MASK;
      return w !== 0 && idx < N;
    }).length;
    check('6g', 'and the BAND\'S OWN SLOTS (0..n) are what those cells now draw — the count '
      + 'carried over from row 0d, so the moving art is on screen',
      drawnAfter === drawn, `${drawnAfter} cells draw slots 0..${N} (row 0d measured ${drawn})`);
    console.log(`\n  NOTE (not a row — a stated limitation): the panel has no rate_shift control, so\n`
      + `  the saved band leaves the key out and aeon's default rate_shift=${RATE_SHIFT_DEFAULT} applies\n`
      + `  (step = driver >> ${RATE_SHIFT_DEFAULT}). rate_shift is NOT authorable through Aurora's UI today.`
      + `\n  saved band keys: ${Object.keys(anim).filter((k) => k !== 'phases').join(', ')}`);

    writeFileSync(`${EMIT_DIR}/aurora-claims.json`, JSON.stringify({
      artifact: 'handover band', aeonSha: AEON_SHA,
      band: { cols: COLS, rows: ROWS, staticBase: BASE, phaseFill: 'shift', driver: 'timer' },
      rateShiftAuthorable: false, rateShiftEffective: RATE_SHIFT_DEFAULT,
      printedBlob, budgetBefore: budget0, budgetAfter: budget1,
      layoutCellsDrawingTheBand: drawn,
      savedSha256: sha(savedBytes),
    }, null, 2));
    console.log(`  emitted → ${EMIT_DIR}/{live-before,live-promoted-shift,aurora-claims}.json`);
  } finally {
    try { c.close(); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    await sleep(1500);
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`\n${'='.repeat(70)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log(`  ${f}`)); }
  console.log('NOTE: this stage proves the UI authored a shift-filled TIMER band on aeon\'s live');
  console.log('document and that the SAVED bytes hold pre-shifted phases. Whether aeon accepts');
  console.log('it is the composition stage; whether it MOVES on hardware is the ROM stage,');
  console.log('which is the overseer\'s, in the foreground.');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e.message}`); process.exit(2); });
