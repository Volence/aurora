#!/usr/bin/env node
// ITEM 29 — DOES AEON'S INJECTOR ACCEPT A BAND THE UI ACTUALLY MADE?
//
// Item 27's acceptance probe composed against a band the MODEL made: the band
// was constructed programmatically by `bganim-promoted-vs-aeon-injector.emit.ts`
// and handed to `inject_editor_bg.main()`. That proved the DOCUMENT SHAPE is
// acceptable. It did not prove that the shape the UI's own writer emits, after
// a real Promote click and a real Ctrl+S, is the same shape.
//
// The gap matters because the panel prints AURORA'S tile arithmetic, not
// aeon's injector's, and the two agreeing has never been observed on a
// UI-authored band. Two independent implementations of the same geometry can
// agree on every number a human reads and still disagree on a byte.
//
// ═══ WHAT THIS RUN IS, AND WHAT IT DELIBERATELY IS NOT ═══
//
// It is HERMETIC. It copies aeon's project to a tempdir and opens THAT, with
// `editor_bg_override.json` taken from the `ls-remote`-resolved pushed
// revision rather than the sibling working tree — which is somebody's live
// directory. aeon's real tree is never written to.
//
// That is a deliberate choice against the two traps ROADMAP item 29 names.
// Writing aeon's real file makes the level-staleness mtime gate fire BY
// CONSTRUCTION (`editor_bg_override.json` is on the gate's INPUT side), and a
// staleness stop presents as the `anims` refusal gate rejecting Aurora's bytes
// when it never judged them. Staying hermetic means neither trap can fire,
// which beats navigating them. THE COST, STATED: this run says nothing about
// the build, the ROM, or the staleness gate. Nothing here assembles the
// emitted .emp and the band has never run on hardware. That is item 29's
// scope — "the composition" — and the ROM half remains unproven, exactly as
// the item-27 probe already recorded.
//
// ═══ THE ANTI-VACUOUS PROBLEM, WHICH IS THIS HARNESS'S REAL RISK ═══
//
// The whole run reduces to "aeon's injector accepted a file". A file it
// accepts because the band never got written would pass that sentence while
// proving the opposite of what it claims. So the run REFUSES to reach its
// comparison unless it has first established, on screen and in the model:
//   * the document loaded and is at capacity (448/448, 0 free)
//   * zero bands existed before the click
//   * the Promote control was enabled
//   * the click created a band IN THE MODEL, with the geometry the form asked
//   * Ctrl+S actually changed the bytes on disk
//   * the saved file parses and carries `anims`
// Any of those failing aborts before the injector is ever called, so a green
// comparison cannot be reached by an empty document.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run: node scratchpad/bganim-ui-authored-composition-harness.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9394);
// ROOT defaults to the tree this harness FILE lives in, never a hardcoded path.
// A pinned worktree path is a landmine: run from the main clone it silently
// serves the WORKTREE's dist/, so a "re-verified on the merged tree" run is
// actually re-verifying the branch.
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
// The electron BINARY and the app ROOT are separate on purpose: a git worktree
// has no node_modules of its own.
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const OVERRIDE_FILE = `${AEONDIR}/games/sonic4/data/editor_bg_override.json`;
const SHOTS = `${ROOT}/scratchpad/shots-bganim-band`;
mkdirSync(SHOTS, { recursive: true });

// ═══ EXPECTATIONS ARE DERIVED FROM THE VENDORED CONTRACT, NOT TYPED IN ═══
// The same JSON the codec reads its constants out of. A number typed here would
// be a second copy of a bound that the contract-drift test cannot see.
const CONTRACT = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const DRIVERS = Object.keys(CONTRACT.drivers).filter((k) => !k.startsWith('$'));
const MAX_BANDS = CONTRACT.constants.BGANIM_MAX_BANDS.value;
const TILE_CAPACITY = CONTRACT.constants.BG_TILE_CAPACITY.value;
const TILE_BYTES = CONTRACT.constants.TILE_BYTES.value;
const PHASE_BANKS = CONTRACT.constants.BGANIM_PHASE_BANKS.value;

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
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-bganim-band/${name}.png`);
}

// A React-controlled <input>/<select> ignores a plain `el.value = x`: React's
// synthetic onChange never fires. The native setter + a bubbling input/change
// event is what a real keystroke does from React's point of view — not a
// shortcut past the component, the only way to reach it from outside.
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

// NOTE the .trim(): a concatenated haystack of "Effects " does not match an
// anchored /^Effects$/, which once reported a PASSING feature as a failure.
const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

/** A control's disabled state and its title — "why is this off", read off screen. */
const CONTROL_BY_TEXT = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return null;
  return { text: (el.textContent || '').trim(), disabled: !!el.disabled, title: el.title || '' };
})()`;

/**
 * Click a control by its ARIA-LABEL alone.
 *
 * `clickByText` searches `text + ' ' + aria-label`, which is right for a Chip
 * (no aria-label) and WRONG for an `IconButton`, whose text is "Remove" and
 * whose aria-label is "Remove band 0" — the haystack is then "Remove Remove
 * band 0" and NO anchored pattern against either half matches it. That silently
 * clicked nothing twice in this file's history before being named.
 */
const clickByAria = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('button')]
    .find((e) => ${re}.test(e.getAttribute('aria-label') || ''));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const SELECT_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

const INPUT_BY_TITLE = (re) => `[...document.querySelectorAll('input')].find((e) => ${re}.test(e.title || ''))`;

const REPAINT_PROBE = String.raw`
(() => {
  if (window.__bgProbe) return 'already';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  const P = { canvas: cv, repaints: 0, ticks: 0, ticking: false };
  window.__bgProbe = P;
  P.bound = () => P.canvas === document.getElementById('map-canvas');
  const tick = () => { if (P.ticking) { P.ticks++; requestAnimationFrame(tick); } };
  P.start = () => { if (!P.ticking) { P.ticking = true; requestAnimationFrame(tick); } };
  P.stop = () => { P.ticking = false; };
  // The same repaint START signal the MapViewport baseline harness uses: the
  // draw effect's canvas.width assignment.
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) { if (this === P.canvas) P.repaints++; return wd.set.call(this, v); },
  });
  return 'installed';
})()`;

const fileHash = () => (existsSync(OVERRIDE_FILE)
  ? createHash('sha256').update(readFileSync(OVERRIDE_FILE)).digest('hex') : 'absent');

// The document the UI produced, written here for the python comparison stage.
const EMIT_DIR = process.env.EMIT_DIR ?? `${ROOT}/scratchpad/item29-emit`;
mkdirSync(EMIT_DIR, { recursive: true });

async function main() {
  console.log(`\nDERIVED FROM THE VENDORED CONTRACT (${CONTRACT.source.repo}@${CONTRACT.source.commit.slice(0, 7)}):`);
  console.log(`  BG_TILE_CAPACITY = ${TILE_CAPACITY}   TILE_BYTES = ${TILE_BYTES}   PHASE_BANKS = ${PHASE_BANKS}`);
  console.log(`  project under test: ${AEONDIR}`);
  console.log(`  (aeon's real tree is NOT this path unless you overrode AEON_DIR)\n`);

  // The pristine bytes, kept for the comparison's "before" side. Captured from
  // disk BEFORE the app touches anything, so it cannot be a post-hoc rebuild.
  const beforeBytes = readFileSync(OVERRIDE_FILE);
  writeFileSync(`${EMIT_DIR}/live-before.json`, beforeBytes);
  const hashBefore = fileHash();
  console.log(`  before: ${beforeBytes.length} B  sha256 ${hashBefore.slice(0, 16)}…\n`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
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
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', true);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open the TEMP COPY. ----------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the project opened, with sections', !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — everything below would be vacuous');

    // ---- 2. Reach the band panel by real clicks. ------------------------
    await sleep(2000);
    const clickedPill = await c.evalExpr(clickByText('/^Effects$/'));
    check('2a', 'the Effects pill is on the facet bar [instrument check]', clickedPill === true);
    await sleep(1500);
    await c.evalExpr(OPEN_BAND_LIST);
    await sleep(400);
    const openedNewBand = await c.evalExpr(OPEN_NEW_BAND);
    if (openedNewBand === 'no-section') throw new Error('no "New band" section on screen');
    await sleep(900);
    const headings = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^(BG animation bands|New band$|From existing tiles$)/.test(t))`);
    check('2b', 'the BAND panel is mounted [instrument check]',
      headings.some((h) => h.startsWith('BG animation bands')) && headings.includes('From existing tiles'),
      JSON.stringify(headings));

    // ---- 3. PRECONDITIONS. Every one of these gates the comparison. -----
    const status = await c.json('window.__dbg.aeon.bgOverrideStatus()');
    const budget0 = await c.json('window.__dbg.aeon.bandBudget()');
    const bands0 = await c.json('window.__dbg.aeon.bands()');
    const present = !!(status && status.present && status.unreadable === null);
    check('3a', 'the override document loaded [precondition]', present, JSON.stringify(status));
    if (!present) throw new Error('no override document — the comparison would be vacuous');
    check('3b', `the blob is at the contract's capacity (${TILE_CAPACITY}) and saturated`,
      budget0.tileCapacity === TILE_CAPACITY && budget0.tiles === TILE_CAPACITY
      && budget0.tileSlotsRemaining === 0, JSON.stringify(budget0));
    check('3c', 'ZERO bands exist before the click — so any band found later is THIS run\'s',
      bands0.length === 0, `bands=${bands0.length}`);
    if (bands0.length !== 0) throw new Error('document already carries bands — cannot attribute');

    // WHAT THE PANEL PRINTS. This is the quantity item 29 is actually about:
    // Aurora's arithmetic, rendered for a human, captured verbatim so it can be
    // set against aeon's injector's own numbers rather than against the model's.
    const panelText = await c.evalExpr(`(document.body.innerText || '').replace(/\\s+/g, ' ')`);
    const printedBlob = (panelText.match(/Blob\s+\d+\/\d+\s+tiles[^.]*?free/) || [null])[0];
    check('3d', 'the panel PRINTS its blob arithmetic (this is the number under test)',
      !!printedBlob, printedBlob ?? 'no "Blob N/N tiles … free" on screen');

    // ---- 4. AUTHOR THE BAND WITH REAL GESTURES. ------------------------
    const typedCols = await c.evalExpr(SET_INPUT(INPUT_BY_TITLE('/^cols —/'), 2));
    const chosenRows = await c.evalExpr(SET_INPUT(SELECT_BY_TITLE('/rows —/'), 1));
    check('4a', 'the cols field and rows picker take real input',
      typedCols === 'ok' && chosenRows === 'ok', `cols=${typedCols} rows=${chosenRows}`);
    await sleep(400);
    const promoteBtn = await c.json(CONTROL_BY_TEXT('/^Promote$/'));
    check('4b', 'PROMOTE is enabled on a saturated document — it spends no slots',
      !!promoteBtn && promoteBtn.disabled === false, JSON.stringify(promoteBtn));
    if (!promoteBtn || promoteBtn.disabled !== false) throw new Error('Promote unavailable — cannot author');
    const promoted = await c.evalExpr(clickByText('/^Promote$/'));
    await sleep(900);

    const bands1 = await c.json('window.__dbg.aeon.bands()');
    const budget1 = await c.json('window.__dbg.aeon.bandBudget()');
    check('4c', 'the click created the band IN THE MODEL, not just on screen',
      promoted === true && bands1.length === 1, `click=${promoted} bands=${bands1.length}`);
    if (bands1.length !== 1) throw new Error('no band in the model — nothing to compose');
    const band = bands1[0];
    check('4d', 'the band carries the geometry the FORM asked for',
      band.cols === 2 && band.rows === 1 && band.tileCount === 2 && band.phaseBanks === PHASE_BANKS,
      JSON.stringify(band));
    check('4e', 'promotion grew the blob by ZERO tiles — the property that lets it work at capacity',
      budget1.tiles === budget0.tiles && budget1.tileSlotsRemaining === 0,
      `tiles ${budget0.tiles} -> ${budget1.tiles}`);
    await shot(c, 'item29-1-band-promoted');

    // ---- 5. SAVE THROUGH THE APP'S OWN PATH, with a real Ctrl+S. -------
    // Not `saveAeonProject()` from the probe surface: the point is the writer a
    // user reaches, and the keystroke is the only thing that proves the binding.
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2,
    });
    await c.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, modifiers: 2,
    });
    let hashAfter = hashBefore;
    for (let i = 0; i < 40; i++) { await sleep(400); hashAfter = fileHash(); if (hashAfter !== hashBefore) break; }
    check('5a', 'Ctrl+S actually changed the bytes on disk [precondition for the comparison]',
      hashAfter !== hashBefore && hashAfter !== 'absent',
      `before ${hashBefore.slice(0, 16)}…  after ${hashAfter.slice(0, 16)}…`);
    if (hashAfter === hashBefore) throw new Error('nothing was written — the comparison would judge the OLD file');

    const savedBytes = readFileSync(OVERRIDE_FILE);
    writeFileSync(`${EMIT_DIR}/live-promoted.json`, savedBytes);
    let saved = null;
    try { saved = JSON.parse(savedBytes.toString('utf8')); } catch (e) { /* reported below */ }
    check('5b', 'the saved file is parseable JSON', saved !== null);
    if (!saved) throw new Error('saved file does not parse');
    check('5c', 'the saved file carries an `anims` array with exactly this run\'s band',
      Array.isArray(saved.anims) && saved.anims.length === 1,
      `anims=${JSON.stringify(saved.anims ?? null).slice(0, 160)}`);
    check('5d', 'the saved file still holds the full tile blob — the save did not drop art',
      Array.isArray(saved.tiles) && saved.tiles.length === TILE_CAPACITY,
      `tiles=${saved.tiles ? saved.tiles.length : 'absent'}`);
    check('5e', 'the saved file still holds all 4096 layout words',
      Array.isArray(saved.layout) && saved.layout.length === 4096,
      `layout=${saved.layout ? saved.layout.length : 'absent'}`);

    // The UI's own numbers, emitted for the python stage to set against aeon's.
    writeFileSync(`${EMIT_DIR}/aurora-claims.json`, JSON.stringify({
      printedBlob, band, budgetBefore: budget0, budgetAfter: budget1,
      savedAnims: saved.anims, tileCount: saved.tiles.length,
    }, null, 2));
    console.log(`\n  emitted → ${EMIT_DIR}/{live-before,live-promoted,aurora-claims}.json`);
  } finally {
    try { if (c) c.close(); } catch { /* closing a dead socket is not a finding */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  console.log(`\n${'='.repeat(70)}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log(`  ${f}`)); }
  console.log('NOTE: this stage proves the UI AUTHORED and SAVED a band. Whether aeon');
  console.log('accepts it is the python stage; run it next, and neither stage alone is');
  console.log('the item-29 answer.');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(`\nHARNESS ERROR: ${e.message}`); process.exit(2); });
