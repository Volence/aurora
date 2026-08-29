#!/usr/bin/env node
// ITEM 24 — DOES THE REAL PANEL INSERT A BRAND-NEW BAND ON A ROOMY DOCUMENT?
//
// Items 28/29 proved PROMOTE through the UI on aeon's saturated 448/448
// document. INSERT — the gesture that grows the blob — has never been clicked
// against a document with room, because no such document existed until aeon's
// generator gained `band_reserve` and this parcel produced
// `test/fixtures/bg-override/editor_bg_override.roomy.json` with it (see the
// `.provenance.json` beside it: the generator's own run, gate intact, printed
// `unique tiles: 320/320`).
//
// ═══ BOTH DOCUMENT STATES, ONE HARNESS (item 28's bar) ═══
//
//   ROOMY  — the fixture above, swapped into a hermetic copy of aeon. The
//            capacity readout must show the DERIVED free count, "Add band"
//            must be enabled, the click must land IN THE MODEL, Ctrl+S must
//            change bytes on disk, and the saved file must carry one band,
//            a blob grown by exactly cols*rows, and an unchanged picture.
//   LIVE   — aeon's own document at the pinned revision (448/448, no bands).
//            "Add band" must be DISABLED with the provider's refusal on screen,
//            and "Promote" must be enabled — the peer gesture still works.
//
// ═══ HERMETIC, AND PINNED ═══
//
// Each state runs in its own mkdtemp: `git -C <aeon> archive <SHA> | tar -x`,
// so the app opens a checkout of the PUSHED revision, never the sibling
// working tree (another lane's live directory), and nothing this harness
// writes can reach aeon or trip its level-staleness gate. THE COST, STATED:
// nothing here builds, assembles or runs the band; the saved document is
// EMITTED for the injector stage (`bganim-promoted-vs-aeon-injector.py
// --after live-inserted.json`) and that stage is the overseer's, in the
// foreground.
//
// ═══ ANTI-VACUOUS ═══
//
// Every claim row is gated on an instrument row that proves the panel
// rendered THIS document (tile count on screen equals the model's, which
// equals the file's), and the roomy run refuses to reach its save unless the
// click created a band in the model with the geometry the form asked for.
// The image-invariance row compares the SAVED FILE against the file that was
// PLACED, through a resolver written from aeon's nametable loop — the app is
// never asked whether it worked.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run: node scratchpad/bganim-insert-roomy-harness.mjs
//   env AEON_DIR (default ../aeon), AEON_SHA (default: the provenance sidecar's),
//       STATES=roomy,live (default both), BAND=CxR (default derived), EMIT_DIR, PORT, VERBOSE
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, existsSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9396);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEON = process.env.AEON_DIR ?? join(dirname(ROOT.replace(/\/\.claude\/worktrees\/[^/]+$/, '')), 'aeon');
const FIXTURES = `${ROOT}/test/fixtures/bg-override`;
const PROVENANCE = JSON.parse(readFileSync(`${FIXTURES}/editor_bg_override.roomy.provenance.json`, 'utf8'));
const AEON_SHA = process.env.AEON_SHA ?? PROVENANCE.aeon.revision;
const STATES = (process.env.STATES ?? 'roomy,live').split(',');
const SHOTS = `${ROOT}/scratchpad/shots-bganim-insert`;
const EMIT_DIR = process.env.EMIT_DIR ?? `${ROOT}/scratchpad/item24-emit`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(EMIT_DIR, { recursive: true });

// ═══ EXPECTATIONS DERIVED FROM THE VENDORED CONTRACT, NOT TYPED IN ═══
const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const TILE_CAPACITY = CONTRACT.constants.BG_TILE_CAPACITY.value;
const PHASE_BANKS = CONTRACT.constants.BGANIM_PHASE_BANKS.value;
const LAYOUT_WORDS = 64 * 64;
// aeon inject_editor_bg.py's nametable loop: `if word != 0: idx = word & 0x7FF`
const AEON_TILE_INDEX_MASK = 0x7FF;

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

// ═══ "New band" ARRIVES COLLAPSED (ROADMAP item 41) ═══
// It is a creation form and was measured as the tallest box in the effects
// column (474px of 1229px), so the item-41 layout pass gave it
// `defaultCollapsed`. A collapsed CollapsibleSection renders NO children at
// all, so every control below this point would come back `null` and read as
// "the control is missing" — which is exactly the defect these harnesses were
// written to detect. Opened the way a human opens it: a click on its header.
const OPEN_NEW_BAND = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => (h.firstElementChild.textContent || '').trim() === 'New band');
  if (!hdr) return 'no-section';
  if (hdr.parentElement.parentElement.children.length > 1) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

// ⚠ `BG animation bands` ARRIVES COLLAPSED TOO, since ROADMAP item 45's open
// tail (the 1280x800 parcel): the column could not reach zero at that height
// with five sections open, and the band list is the one section in it that is
// not about the parallax scene the facet arrives on. The same reasoning as
// `New band` above therefore applies to it, and so does the same fix — a
// collapsed CollapsibleSection renders NO children, so the band cards, the
// Demote/Remove buttons and the blob-budget readout below all come back `null`
// and read as "missing" unless this runs first. Opened by clicking its header,
// the way a human opens it.
const OPEN_BAND_LIST = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => /^BG animation bands/.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-section';
  if (hdr.parentElement.parentElement.children.length > 1) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

const results = [];
const fails = [];
let stateTag = '';
function check(id, name, ok, detail) {
  const tag = `${stateTag}.${id}`;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${tag}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id: tag, name, ok });
  if (!ok) fails.push(`[${tag}] ${name}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-bganim-insert/${name}.png`);
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

/** The whole picture as the APP holds it, one string per cell, through the probe surface. */
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

/** The same resolver over a FILE, in node — independent of the app. */
function renderFile(doc) {
  return doc.layout.map((w) => {
    if (w === 0) return 'B';
    const t = doc.tiles[w & AEON_TILE_INDEX_MASK];
    return (w & ~AEON_TILE_INDEX_MASK) + ':' + (t ? t.join(',') : 'DANGLING');
  });
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

/** A pinned, hermetic checkout of aeon with the chosen override document in place. */
function makeProject(state) {
  const dir = mkdtempSync(join(tmpdir(), `aurora-item24-${state}-`));
  const tar = execFileSync('git', ['-C', AEON, 'archive', AEON_SHA], { maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1 << 30 });
  const target = `${dir}/games/sonic4/data/editor_bg_override.json`;
  if (state === 'roomy') copyFileSync(`${FIXTURES}/editor_bg_override.roomy.json`, target);
  // 'live' keeps the archived file — aeon's own document at AEON_SHA.
  return { dir, file: target };
}

async function launch() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
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

/** Open the project and reach the band panel; the shared preamble for both states. */
async function openAndReach(c, dir) {
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
  if (!st || !st.open) throw new Error('project did not open — everything below would be vacuous');
  await sleep(2000);
  const pill = await c.evalExpr(clickByText('/^Effects$/'));
  check('2a', 'the Effects pill is on the facet bar [instrument]', pill === true);
  await sleep(1500);
  await c.evalExpr(OPEN_BAND_LIST);
  await sleep(400);
  const openedNewBand = await c.evalExpr(OPEN_NEW_BAND);
  if (openedNewBand === 'no-section') throw new Error('no "New band" section on screen');
  await sleep(900);
  const headings = await c.json(
    `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
      .filter(t => /^(BG animation bands|New band$|From existing tiles$|From new art$)/.test(t))`);
  check('2b', 'the band panel is mounted with BOTH sources as peers [instrument]',
    headings.some((h) => h.startsWith('BG animation bands'))
      && headings.includes('From existing tiles') && headings.includes('From new art'),
    JSON.stringify(headings));
}

/** Rows shared by both states: the panel rendered THIS document. */
async function preconditions(c, placedDoc) {
  const status = await c.json('window.__dbg.aeon.bgOverrideStatus()');
  const budget = await c.json('window.__dbg.aeon.bandBudget()');
  const bands = await c.json('window.__dbg.aeon.bands()');
  const present = !!(status && status.present && status.unreadable === null);
  check('3a', 'the override document loaded [precondition]', present, JSON.stringify(status));
  if (!present) throw new Error('no override document');
  const expectedFree = TILE_CAPACITY - placedDoc.tiles.length;
  check('3b', `the model holds the PLACED file's tile count (${placedDoc.tiles.length}) and derives free = capacity - tiles = ${expectedFree}`,
    budget.tileCapacity === TILE_CAPACITY && budget.tiles === placedDoc.tiles.length
      && budget.tileSlotsRemaining === expectedFree, JSON.stringify(budget));
  check('3c', 'ZERO bands before any click — a band found later is THIS run\'s',
    bands.length === 0 && !Array.isArray(placedDoc.anims), `bands=${bands.length}`);
  const text = await c.evalExpr(BODY_TEXT);
  const printed = (text.match(/Blob\s+(\d+)\/(\d+)\s+tiles\s+·\s+(\d+)\s+free/) || null);
  check('3d', 'the panel PRINTS the blob arithmetic, and the printed numbers are the derived ones [anti-vacuous]',
    !!printed && Number(printed[1]) === placedDoc.tiles.length && Number(printed[2]) === TILE_CAPACITY
      && Number(printed[3]) === expectedFree,
    printed ? printed[0] : 'no "Blob N/N tiles · N free" on screen');
  return { budget, expectedFree, text };
}

async function runRoomy() {
  stateTag = 'roomy';
  const { dir, file } = makeProject('roomy');
  const placedBytes = readFileSync(file);
  const placed = JSON.parse(placedBytes.toString('utf8'));
  writeFileSync(`${EMIT_DIR}/live-before.json`, placedBytes);
  console.log(`\n=== ROOMY: ${file}\n    placed ${placedBytes.length} B sha256 ${sha(placedBytes).slice(0, 16)}… (${placed.tiles.length} tiles)`);
  const { child, c } = await launch();
  try {
    await openAndReach(c, dir);
    const { budget: budget0, expectedFree } = await preconditions(c, placed);
    check('3e', 'the roomy document has FREE ROOM — the property this whole state exists for',
      expectedFree > 0 && budget0.tileSlotsRemaining > 0, `free=${expectedFree}`);
    if (expectedFree <= 0) throw new Error('fixture has no room — nothing to insert');

    // Geometry DERIVED from the free room: rows 4, cols = a quarter of what fits,
    // at least 1 — or BAND=CxR from the environment. The override exists because
    // aeon's injector at a840d68f caps the act's `ojz_bg_anim` section at
    // BGANIM_PLACER_CEILING = 1026 B (2 + 44/band + 256/slot): at most 3 slots in
    // one band today (sigil BGANIM-PLACE). A derived 8x4 proves the WRITER; a
    // BAND=3x1 run emits a document that pin's injector can also accept.
    const ROWS = process.env.BAND ? Number(process.env.BAND.split('x')[1]) : 4;
    const COLS = process.env.BAND ? Number(process.env.BAND.split('x')[0])
      : Math.max(1, Math.floor(expectedFree / ROWS / 4));
    const N = COLS * ROWS;
    const typedCols = await c.evalExpr(SET_INPUT(INPUT_BY_TITLE('/^cols —/'), COLS));
    const chosenRows = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/rows —/'), ROWS));
    check('4a', `the cols field and rows picker take real input (${COLS}x${ROWS} = ${N} slots)`,
      typedCols === 'ok' && chosenRows === 'ok', `cols=${typedCols} rows=${chosenRows}`);
    await sleep(400);
    const costLine = (await c.evalExpr(BODY_TEXT)).match(/costs\s+(\d+)\s+slots?\s+·\s+(\d+)\s+free/);
    check('4b', 'the "From new art" line prices the band at cols*rows against the derived free count',
      !!costLine && Number(costLine[1]) === N && Number(costLine[2]) === expectedFree,
      costLine ? costLine[0] : 'no cost line');
    const addBtn = await c.json(CONTROL_BY_TEXT('/^Add band$/'));
    check('4c', 'ADD BAND (insert) is ENABLED on the roomy document, and its title is not a refusal',
      !!addBtn && addBtn.disabled === false && /^Add a blank/.test(addBtn.title), JSON.stringify(addBtn));
    const promoteBtn = await c.json(CONTROL_BY_TEXT('/^Promote$/'));
    check('4d', 'PROMOTE is enabled too — the two sources are peers, neither gated on the other',
      !!promoteBtn && promoteBtn.disabled === false, JSON.stringify(promoteBtn));
    if (!addBtn || addBtn.disabled !== false) throw new Error('Add band unavailable — cannot insert');

    const pictureBefore = await c.json(RENDER_IN_APP);
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    await shot(c, 'roomy-1-before-click');
    const clicked = await c.evalExpr(clickByText('/^Add band$/'));
    await sleep(900);

    const bands1 = await c.json('window.__dbg.aeon.bands()');
    const budget1 = await c.json('window.__dbg.aeon.bandBudget()');
    const hash1 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('5a', 'the click created the band IN THE MODEL', clicked === true && bands1.length === 1,
      `click=${clicked} bands=${bands1.length}`);
    if (bands1.length !== 1) throw new Error('no band in the model');
    const band = bands1[0];
    check('5b', 'the band carries the geometry the FORM asked for, at slot 0 (the prefix)',
      band.cols === COLS && band.rows === ROWS && band.tileCount === N && band.slotBase === 0
        && band.phaseBanks === PHASE_BANKS, JSON.stringify(band));
    check('5c', `insertion grew the blob by EXACTLY cols*rows (${N}) and the free count fell by the same`,
      budget1.tiles === budget0.tiles + N && budget1.tileSlotsRemaining === budget0.tileSlotsRemaining - N,
      `tiles ${budget0.tiles} -> ${budget1.tiles}, free ${budget0.tileSlotsRemaining} -> ${budget1.tileSlotsRemaining}`);
    check('5d', 'the document actually changed (hash moved) — the write-back landed in the store',
      hash0 !== null && hash1 !== null && hash0 !== hash1, `hash ${hash0} -> ${hash1}`);
    const text1 = await c.evalExpr(BODY_TEXT);
    const printed1 = text1.match(/Blob\s+(\d+)\/(\d+)\s+tiles\s+·\s+(\d+)\s+free/);
    check('5e', 'the panel RE-PRINTED the new arithmetic after the click',
      !!printed1 && Number(printed1[1]) === budget0.tiles + N && Number(printed1[3]) === expectedFree - N,
      printed1 ? printed1[0] : 'no readout');
    const pictureAfter = await c.json(RENDER_IN_APP);
    const changedCells = pictureBefore.filter((v, i) => v !== pictureAfter[i]).length;
    const drawn = pictureBefore.filter((v) => v !== 'B').length;
    check('5f', 'IN THE APP: every drawn cell resolves to the same attrs+bitmap after the insert',
      changedCells === 0 && drawn === LAYOUT_WORDS && !pictureAfter.some((v) => /DANGLING/.test(v)),
      `${changedCells} of ${LAYOUT_WORDS} cells differ; ${drawn} drawn`);
    await shot(c, 'roomy-2-after-click');

    // Ctrl+S as a KEYSTROKE — the binding a user reaches, not the probe's saver.
    const hashBefore = sha(placedBytes);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2 });
    let hashAfter = hashBefore;
    for (let i = 0; i < 40; i++) { await sleep(400); hashAfter = sha(readFileSync(file)); if (hashAfter !== hashBefore) break; }
    check('6a', 'Ctrl+S changed the bytes on disk [precondition for every row below]',
      hashAfter !== hashBefore, `before ${hashBefore.slice(0, 16)}… after ${hashAfter.slice(0, 16)}…`);
    if (hashAfter === hashBefore) throw new Error('nothing was written');
    const savedBytes = readFileSync(file);
    writeFileSync(`${EMIT_DIR}/live-inserted.json`, savedBytes);
    let saved = null;
    try { saved = JSON.parse(savedBytes.toString('utf8')); } catch { /* below */ }
    check('6b', 'the saved file parses', saved !== null);
    if (!saved) throw new Error('saved file does not parse');
    check('6c', 'the saved file carries anims.length === 1 with this run\'s geometry',
      Array.isArray(saved.anims) && saved.anims.length === 1
        && saved.anims[0].cols === COLS && saved.anims[0].rows === ROWS
        && Array.isArray(saved.anims[0].phases) && saved.anims[0].phases.length === PHASE_BANKS,
      `anims=${JSON.stringify(saved.anims ?? null).slice(0, 120)}`);
    check('6d', `tiles.length grew by the band's tile count: ${placed.tiles.length} + ${N}`,
      Array.isArray(saved.tiles) && saved.tiles.length === placed.tiles.length + N,
      `tiles=${saved.tiles ? saved.tiles.length : 'absent'}`);
    check('6e', 'layout is still 4096 words, and the band\'s phase 0 IS tiles[0..n)',
      Array.isArray(saved.layout) && saved.layout.length === LAYOUT_WORDS
        && JSON.stringify(saved.tiles.slice(0, N)) === JSON.stringify(saved.anims[0].phases[0]),
      `layout=${saved.layout ? saved.layout.length : 'absent'}`);
    // The strongest row: FILE vs FILE, no app in the loop, aeon's resolver.
    const before = renderFile(placed);
    const after = renderFile(saved);
    const diffs = before.filter((v, i) => v !== after[i]).length;
    const movedWords = placed.layout.filter((w, i) => w !== saved.layout[i]).length;
    const nonBlank = placed.layout.filter((w) => w !== 0).length;
    check('6f', 'SAVED FILE vs PLACED FILE: zero resolved cells differ while every non-blank word moved',
      diffs === 0 && nonBlank > 0 && movedWords === nonBlank && new Set(before).size > 1,
      `resolved diffs ${diffs}; raw words moved ${movedWords}/${nonBlank}; ${new Set(before).size} distinct images`);

    writeFileSync(`${EMIT_DIR}/aurora-claims.json`, JSON.stringify({
      state: 'roomy', aeonSha: AEON_SHA, band, budgetBefore: budget0, budgetAfter: budget1,
      savedAnims: saved.anims.map((a) => ({ cols: a.cols, rows: a.rows, driver: a.driver ?? null })),
      tileCount: saved.tiles.length,
    }, null, 2));
    console.log(`  emitted → ${EMIT_DIR}/{live-before,live-inserted,aurora-claims}.json`);
  } finally {
    try { c.close(); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    await sleep(1500);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function runLive() {
  stateTag = 'live';
  const { dir, file } = makeProject('live');
  const placedBytes = readFileSync(file);
  const placed = JSON.parse(placedBytes.toString('utf8'));
  console.log(`\n=== LIVE (aeon @ ${AEON_SHA.slice(0, 8)}): ${file}\n    ${placedBytes.length} B sha256 ${sha(placedBytes).slice(0, 16)}… (${placed.tiles.length} tiles)`);
  const { child, c } = await launch();
  try {
    await openAndReach(c, dir);
    const { budget, expectedFree, text } = await preconditions(c, placed);
    check('3e', 'the live document is SATURATED — free = 0 — the property this state exists for',
      expectedFree === 0 && budget.tileSlotsRemaining === 0 && placed.tiles.length === TILE_CAPACITY,
      `free=${expectedFree}`);
    const addBtn = await c.json(CONTROL_BY_TEXT('/^Add band$/'));
    const refusalRe = /adding a band puts its \d+ tile\(s\) INTO the blob, and the blob has 0 free slot\(s\) of (\d+)/;
    check('4a', 'ADD BAND is DISABLED, and its title is the provider\'s refusal naming 0 free of the contract\'s capacity',
      !!addBtn && addBtn.disabled === true && refusalRe.test(addBtn.title)
        && Number((addBtn.title.match(refusalRe) || [])[1]) === TILE_CAPACITY,
      JSON.stringify(addBtn));
    check('4b', 'the refusal text is ON SCREEN under the control, not only in a tooltip',
      refusalRe.test(text), (text.match(refusalRe) || ['not found'])[0]);
    const promoteBtn = await c.json(CONTROL_BY_TEXT('/^Promote$/'));
    check('4c', 'PROMOTE is ENABLED on the saturated document — the peer gesture that spends no slots',
      !!promoteBtn && promoteBtn.disabled === false, JSON.stringify(promoteBtn));
    const clicked = await c.evalExpr(clickByText('/^Add band$/'));
    const bands = await c.json('window.__dbg.aeon.bands()');
    check('4d', 'clicking the disabled control does nothing: still zero bands',
      clicked === 'disabled' && bands.length === 0, `click=${clicked} bands=${bands.length}`);
    await shot(c, 'live-1-insert-refused');
  } finally {
    try { c.close(); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    await sleep(1500);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`DERIVED FROM THE VENDORED CONTRACT (${CONTRACT.source.repo}@${CONTRACT.source.commit.slice(0, 7)}):`);
  console.log(`  BG_TILE_CAPACITY = ${TILE_CAPACITY}   PHASE_BANKS = ${PHASE_BANKS}`);
  console.log(`  aeon: ${AEON} @ ${AEON_SHA} (git archive → mkdtemp per state; the working tree is never opened)`);
  for (const s of STATES) {
    try {
      if (s === 'roomy') await runRoomy();
      else if (s === 'live') await runLive();
      else throw new Error(`unknown state ${s}`);
    } catch (e) {
      check('X', `state aborted: ${e.message}`, false);
    }
  }
  console.log(`\n${'='.repeat(70)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log(`  ${f}`)); }
  console.log('NOTE: this proves the UI INSERTED and SAVED a band on a roomy document, and');
  console.log('refused on the saturated one. Whether aeon accepts the inserted document is the');
  console.log('injector stage: python3 scratchpad/bganim-promoted-vs-aeon-injector.py <EMIT_DIR> --after live-inserted.json');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e.message}`); process.exit(2); });
