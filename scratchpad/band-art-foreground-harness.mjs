#!/usr/bin/env node
// ===========================================================================
// ROW 51's FOREGROUND: CAN AN AUTHOR OPEN A BANK FROM THE STRIP, DRAW, AND
// HAVE THE FILE THAT SHIPS STILL PASS AEON'S OWN GATE?
// ===========================================================================
//
// Row 51 shipped band-art authoring on 2026-08-26 with an explicit tail that
// had never been run:
//
//     drive the real app under CDP — open a bank from the strip, draw a
//     stroke, confirm the map repaints the band's cells and the saved file
//     passes the injector
//
// This is that. It is NOT the ROM half (that needs an emulator and is the
// owner's); nothing here touches oracle or any emulator MCP tool.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. A BANK THAT OPENED, BUT NOT THAT BANK. Every bank of one band produces a
//    composer canvas of the SAME size and the SAME aspect, so "a crosshair
//    canvas appeared with the band's aspect" is true after clicking any of the
//    eight — the existing demo (band-trunk-demo.mjs, D2) asserts exactly that
//    and would stay green if `openBank(k)` ignored `k`. Section 3 clicks bank 0
//    FIRST, reads the target back, then clicks bank 6 and reads it again: the
//    readout has to MOVE. Section 4 then closes it from the other side — a
//    stroke drawn with bank 6 open must land in `phases[6]` and nowhere else.
//
// 2. AN UNDO THAT IS SHORT — OR ABSENT. A stroke that commits per-mousemove
//    leaves N undo steps where there should be one, and a stroke that never
//    commits leaves nothing to undo; both are real failure shapes for a
//    composer whose write path is "doc-local unless bgOverride is set". So the
//    strokes here are MULTI-PIXEL DRAGS, and one Ctrl+Z has to take the WHOLE
//    stroke back — measured by hashing the document, not by sampling one pixel
//    (a per-move commit would return that one pixel and leave the rest).
//
// 3. AN EDIT THAT NEVER REACHED THE PICTURE. Section 5 samples the MAP CANVAS
//    with getImageData at a cell whose layout word names one of the band's
//    slots, before and after. A model-only assertion cannot tell a repaint from
//    a stale canvas, and MapViewport has no clock — nothing repaints it on a
//    timer, so if the edit does not push a repaint the pixels do not move.
//
// 4. THE ONE-WRITER RULE BREAKING. `tiles[base+t]` and `phases[0][t]` are two
//    copies of one fact; aeon's `validate_band_coherence` refuses the file if
//    they drift. Section 5 asserts them EQUAL after the apply and again after
//    the undo, and section 7 asks AEON'S OWN TOOL about the file the app saved.
//
// 5. A GATE THAT ONLY EVER SEES VALID INPUT. Section 7 runs the repo's existing
//    gate (src/core/editing/__tests__/bg-override-art-injector-gate.test.ts)
//    with `AURORA_FG_GATE_FILE` pointed at the saved file. That file's
//    foreground block ACCEPTS the save AND plants `phases[0][0] != prefix` in a
//    copy of that same file and requires a REFUSAL naming the band. Both halves
//    or neither.
//
// ═══ ANTI-VACUOUS, AND THE SUBJECT IS ASSERTED ═══
//
// Three harnesses in this repo reported green while measuring nothing on
// 2026-08-26 alone. Every row that asserts a change here is paired with proof
// the instrument reached its subject: the project open with sections [1a]; the
// override the source the map is reading and a real band present [2a]; the
// strip carrying eight banks [3a]; the composer canvas identified by the
// document's OWN dimensions rather than by being the only crosshair canvas
// [4a]; the map canvas painting something at the watched cell BEFORE the stroke
// and a CONTROL cell that must NOT move [5f/5g].
//
// ═══ AIM AT INTEGERS. dpr VARIES RUN TO RUN HERE. ═══
//
// devicePixelRatio has been observed at both 1 and 1.35 in one session on this
// machine, which makes canvas rects fractional and puts a requested coordinate
// on no device pixel. Every aim below is an INTEGER client pixel, and every one
// is RE-DERIVED back to the doc pixel through the same floor() the surface uses
// before it is trusted; a disagreement aborts rather than being reported as a
// feature defect. dpr and every rect are PRINTED each run.
//
// ⚠ NEVER OPENS THE LIVE AEON TREE. It hardlink-copies it and opens the copy,
// because section 6 presses a real Ctrl+S. The live override is hashed before
// and after and asserted byte-identical [8a].
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/band-art-foreground-harness.mjs
// ===========================================================================

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9412);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const LIVE_AEON = process.env.LIVE_AEON ?? '/home/volence/sonic_hacks/aeon';
const WORKTREE = `${ROOT}/scratchpad/fixtures/aeon-band-art-fg`;
if (WORKTREE.replace(/\/$/, '') === LIVE_AEON.replace(/\/$/, '')) {
  throw new Error('refusing to run against the LIVE aeon tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-band-art-fg`;
mkdirSync(SHOTS, { recursive: true });
const SCREEN = process.env.SCREEN ?? '1680x1050';

// ── EVERY CONSTANT IS READ, NOT TYPED ────────────────────────────────────────
const CONTRACT = JSON.parse(readFileSync(
  join(ROOT, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));
const konst = (name) => {
  const v = CONTRACT?.constants?.[name]?.value;
  if (typeof v !== 'number') throw new Error(`contract has no constants.${name}.value`);
  return v;
};
const OVERRIDE_REL = CONTRACT.path;
const TILE_W = konst('TILE_WIDTH_PX');
const TILE_PIXELS = konst('TILE_PIXELS');
const IDX_MASK = konst('LAYOUT_TILE_INDEX_MASK');
const PHASE_BANKS = konst('BGANIM_PHASE_BANKS');
const TILE_PIXEL_MAX = konst('TILE_PIXEL_MAX');
/** Plane B's width in cells — read out of the repo's own authority, not typed. */
const BG_WIDTH = (() => {
  const src = readFileSync(join(ROOT, 'src/core/formats/bg-tiles.ts'), 'utf8');
  const m = /export const BG_WIDTH = (\d+);/.exec(src);
  if (!m) throw new Error('could not read BG_WIDTH out of src/core/formats/bg-tiles.ts');
  return Number(m[1]);
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ── CDP plumbing (the shape bganim-strip-range-harness.mjs uses) ─────────────
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
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** A THIRD VERDICT, and it is NOT GREEN. */
function unmeasurable(id, name, why) {
  console.log(`NOT-MEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: false, nm: true });
  unmeasured.push(`[${id}] ${name} — ${why}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
let shotN = 0;
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  const file = `${String(++shotN).padStart(2, '0')}-${name}.png`;
  writeFileSync(`${SHOTS}/${file}`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-band-art-fg/${file}`);
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

/** Open one CollapsibleSection by header text (bands ARRIVE collapsed, item 49). */
const OPEN_SECTION = (re) => String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => ${re}.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-section';
  const open = hdr.parentElement.parentElement.children.length > 1;
  if (open) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

const CROSSHAIR_CANVASES = String.raw`
(() => [...document.querySelectorAll('canvas')]
  .filter((cv) => getComputedStyle(cv).cursor === 'crosshair')
  .map((cv) => { const r = cv.getBoundingClientRect();
    return { w: cv.width, h: cv.height,
             left: r.left, top: r.top, cssW: r.width, cssH: r.height }; }))()`;

const MAP_RECT = String.raw`
(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, cw: cv.width, ch: cv.height }; })()`;

/**
 * The 8x8 block a BG cell occupies on the map, as packed RGBA ints.
 *
 * The CALLER supplies the viewport it set, so this never asks the app where it
 * thinks it is looking — the shape bg-override-paints-harness.mjs uses.
 */
const MAP_CELL = (col, row, vp, cellPx) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas'); if (!cv) return null;
  const g = cv.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  const x = Math.round((${col} * ${cellPx} - ${vp.x}) * ${vp.zoom});
  const y = Math.round((${row} * ${cellPx} - ${vp.y}) * ${vp.zoom});
  const w = Math.round(${cellPx} * ${vp.zoom});
  if (x < 0 || y < 0 || x + w > cv.width || y + w > cv.height) return null;
  const d = g.getImageData(x, y, w, w).data;
  const out = [];
  for (let i = 0; i < d.length; i += 4) {
    out.push(((d[i] << 24) | (d[i+1] << 16) | (d[i+2] << 8) | d[i+3]) >>> 0);
  }
  return out;
})()`;

// ── THE FIXTURE TREE ─────────────────────────────────────────────────────────
function freshCopy() {
  rmSync(WORKTREE, { recursive: true, force: true });
  mkdirSync(dirname(WORKTREE), { recursive: true });
  execFileSync('cp', ['-al', LIVE_AEON, WORKTREE]);
  // Break the hardlink on the ONE file this run writes, so a Ctrl+S can never
  // reach through it into the live tree.
  const p = join(WORKTREE, OVERRIDE_REL);
  const text = readFileSync(p, 'utf8');
  rmSync(p);
  writeFileSync(p, text);
  return p;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7 — THE REAL SIBLING TOOL, THROUGH THE REPO'S EXISTING GATE
// ═══════════════════════════════════════════════════════════════════════════
//
// Deliberately NOT a second python invocation. The gate test file already owns
// tool resolution, the module load, the ACCEPT/REFUSE parse and the
// skip-with-a-message when the sibling checkout is absent; a copy of that here
// would be a second way for this repo to ask aeon the same question, and the
// two would drift. `AURORA_FG_GATE_FILE` is the door that file grew for this.
function runInjectorGate(savedPath) {
  const r = spawnSync(
    'npx', ['vitest', 'run', 'src/core/editing/__tests__/bg-override-art-injector-gate.test.ts',
      '--reporter=verbose'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, AURORA_FG_GATE_FILE: savedPath },
      timeout: 240000 },
  );
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// ═══════════════════════════════════════════════════════════════════════════
async function drive() {
  const overridePath = freshCopy();
  const liveOverride = join(LIVE_AEON, OVERRIDE_REL);
  const liveBefore = sha(readFileSync(liveOverride));
  const beforeText = readFileSync(overridePath, 'utf8');
  const beforeDoc = JSON.parse(beforeText);
  console.log(`\n=== ROW 51 FOREGROUND — the aeon tree opened is a COPY: ${WORKTREE}`);
  console.log(`    override: ${beforeDoc.tiles.length} tiles, ${beforeDoc.layout.length} layout words, `
    + `${(beforeDoc.anims ?? []).length} band(s)\n`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  // ⚠ `SCALE=1.35 node …` forces a fractional canvas rect on purpose — the
  // condition that once turned an aiming error into a phantom off-by-one bug
  // report. Xvfb's inferred device scale varies run to run here anyway; every
  // aim below re-derives through the surface's own formula either way.
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', `-screen 0 ${SCREEN}x24`, ELECTRON,
      ...(process.env.SCALE ? [`--force-device-scale-factor=${process.env.SCALE}`] : []),
      `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  let savedPath = null;
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

    // ---- 0. PROVENANCE ----------------------------------------------------
    // `bandPhaseTile` and `bgArtOpen` are introduced by THIS branch. Without
    // this row every PASS below could describe a build that has neither, with
    // the bank-identity rows silently reading `undefined`.
    const probes = await c.json(`({
      bandPhaseTile: typeof window.__dbg.aeon.bandPhaseTile,
      bgArtOpen: typeof window.__dbg.aeon.bgArtOpen })`);
    check('0a', 'the build under test carries this branch\'s band-art probes '
      + '(bandPhaseTile + bgArtOpen) — without them the bank-identity rows read undefined',
      probes.bandPhaseTile === 'function' && probes.bgArtOpen === 'function',
      `${JSON.stringify(probes)} · ${ROOT}/dist`);
    if (probes.bandPhaseTile !== 'function' || probes.bgArtOpen !== 'function') {
      throw new Error('wrong build — VITE_AURORA_DEBUG=1 npm run build on this branch');
    }

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. OPEN THE COPY --------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(WORKTREE)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon COPY is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');
    await sleep(2500);

    const dpr = await c.evalExpr('window.devicePixelRatio');
    const innerVp = await c.json('({ w: window.innerWidth, h: window.innerHeight })');
    note(`ENVIRONMENT  devicePixelRatio=${dpr}  window=${innerVp.w}x${innerVp.h}  screen=${SCREEN}`
      + `${process.env.SCALE ? `  SCALE=${process.env.SCALE}` : ''}`
      + '   (printed because dpr varies run to run on this machine)');

    // ---- 2. THE SUBJECT ----------------------------------------------------
    // A band index only means something in THIS document, and a map row only
    // means something when the map is READING this document. Both asserted.
    await c.evalExpr('window.__dbg.aeon.setLayer("bg")');
    await sleep(700);
    const bgSource = await c.evalExpr('window.__dbg.aeon.bgSource()');
    const bands = await c.json('window.__dbg.aeon.bands()');
    const budget = await c.json('window.__dbg.aeon.bandBudget()');
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const band = bands[0];
    check('2a', 'ANTI-VACUOUS: the map is reading the OVERRIDE, a band exists with a real '
      + 'animated prefix, and the document serializes (the serializer refuses an incoherent one)',
      bgSource === 'override' && bands.length > 0
      && band.tileCount === band.cols * band.rows && band.tileCount > 0
      && budget.firstPromotableSlot === budget.animatedSlots && hash0 !== null,
      `bgSource=${bgSource} bands=${bands.length} band0=${band.cols}x${band.rows}`
      + `=${band.tileCount} slots @base ${band.slotBase} · budget=${JSON.stringify(budget)}`
      + ` · hash=${hash0}`);
    if (bgSource !== 'override' || bands.length === 0) {
      throw new Error('the subject is not what this harness measures — see [2a]');
    }
    check('2b', 'ANTI-VACUOUS: the band carries all 8 phase banks in the model, so a row about '
      + `bank k has a bank k to be about`,
      band.phaseBanks === PHASE_BANKS,
      `phaseBanks=${band.phaseBanks}, contract BGANIM_PHASE_BANKS=${PHASE_BANKS}`);

    // ---- 3. THE STRIP, AND WHICH BANK IT OPENS -----------------------------
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1400);
    const sect = await c.evalExpr(OPEN_SECTION('/^BG animation bands/'));
    await sleep(800);
    note(`"BG animation bands" section: ${sect} (it ARRIVES collapsed — item 49)`);
    const strip = await c.json(String.raw`
      (() => { const s = document.querySelector('[data-band-bank-strip="0"]'); if (!s) return null;
        return { banks: [...s.querySelectorAll('canvas[data-bank]')]
                   .map((cv) => Number(cv.getAttribute('data-bank'))),
                 hint: (s.textContent || '').trim().slice(0, 80) }; })()`);
    check('3a', `ANTI-VACUOUS: band 0's card carries a strip of ${PHASE_BANKS} phase-bank `
      + 'thumbnails, one per bank, each a click target',
      !!strip && strip.banks.length === PHASE_BANKS
      && strip.banks.every((b, i) => b === i),
      `banks ${JSON.stringify(strip && strip.banks)} — "${strip && strip.hint}"`);
    if (!strip || strip.banks.length !== PHASE_BANKS) {
      throw new Error('no bank strip — see [3a]');
    }
    await shot(c, 'effects-band-card');

    /**
     * Click bank k on the strip, from wherever the app currently is.
     *
     * ⚠ THE STRIP UNMOUNTS AFTER EVERY CLICK. `openBank` ends with
     * `switchFacet(..., 'art')`, and the band panel lives in the EFFECTS facet
     * — so the second click of a two-click identity check finds no thumbnail
     * unless the facet is walked back first. Measured: without this the first
     * run of [3b] reported "bank 6 did not open" against a perfectly good
     * feature, which is exactly the mis-aimed-instrument-as-defect shape the
     * header warns about. The section is re-opened too (it arrives collapsed
     * and a facet round trip can put it back).
     */
    const clickBank = async (k) => {
      await c.evalExpr(clickByText('/^Effects$/'));
      await sleep(1200);
      await c.evalExpr(OPEN_SECTION('/^BG animation bands/'));
      await sleep(600);
      const r = await c.evalExpr(
        `(() => { const cv = document.querySelector('[data-band-bank-strip="0"] canvas[data-bank="${k}"]');`
        + ` if (!cv) return 'no-thumb'; cv.click(); return 'clicked'; })()`);
      await sleep(1500);
      return r;
    };
    const artOpen = () => c.json('window.__dbg.aeon.bgArtOpen()');

    // ⚠ THE ROW THE DEMO COULD NOT WRITE. Every bank of one band opens a
    // composer of identical size and aspect, so "a canvas appeared" is true
    // after clicking any of the eight. Clicking TWO different banks and
    // requiring the reported target to MOVE is what separates `openBank(k)`
    // from `openBank(anything)`.
    const openedBefore = await artOpen();
    const clicked0 = await clickBank(0);
    const open0 = await artOpen();
    const BANK = PHASE_BANKS - 2;          // 6 — neither 0 nor the last
    const clickedK = await clickBank(BANK);
    const openK = await artOpen();
    check('3b', `clicking bank 0 then bank ${BANK} on the strip opens THOSE banks in the Art `
      + "facet's composer — the reported target MOVES with the click, which is the only thing "
      + 'that separates openBank(k) from openBank(anything)',
      clicked0 === 'clicked' && clickedK === 'clicked'
      && !!open0 && open0.target.kind === 'bank' && open0.target.bandIndex === 0 && open0.target.bank === 0
      && !!openK && openK.target.kind === 'bank' && openK.target.bandIndex === 0 && openK.target.bank === BANK,
      `clicks: bank 0 -> ${clicked0}, bank ${BANK} -> ${clickedK}`
      + `\n        before=${JSON.stringify(openedBefore)}\n        after bank 0 = ${JSON.stringify(open0)}`
      + `\n        after bank ${BANK} = ${JSON.stringify(openK)}`);
    if (!openK || openK.target.bank !== BANK) throw new Error(`bank ${BANK} did not open — see [3b]`);
    check('3c', 'and the composer document is the band\'s own cols x rows, named for the bank',
      openK.widthTiles === band.cols && openK.heightTiles === band.rows
      && /band 0/.test(openK.name) && new RegExp(`bank ${BANK}`).test(openK.name),
      `${openK.widthTiles}x${openK.heightTiles} (band is ${band.cols}x${band.rows}), `
      + `name=${JSON.stringify(openK.name)}`);
    // ⚠ DOES NOT INDEPENDENTLY DISCRIMINATE the identity claim: the panel
    // derives `selectedBank` from the SAME store field [3b] reads, so this is
    // one fact rendered twice. It is kept because it asserts a DIFFERENT
    // property — that the strip SHOWS which bank is open. A bank open with no
    // visual mark is a real (if smaller) defect, and nothing else here sees it.
    // Back to Effects: `openBank` left the app on the Art facet, and the strip
    // is not mounted there (see clickBank's note).
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1200);
    await c.evalExpr(OPEN_SECTION('/^BG animation bands/'));
    await sleep(600);
    const marks = await c.json(String.raw`
      (() => [...document.querySelectorAll('[data-band-bank-strip="0"] canvas[data-bank]')]
        .map((cv) => ({ bank: Number(cv.getAttribute('data-bank')),
                        border: getComputedStyle(cv).borderTopColor })))()`);
    const markedBanks = (() => {
      const counts = new Map();
      for (const m of marks) counts.set(m.border, (counts.get(m.border) ?? 0) + 1);
      const odd = marks.filter((m) => counts.get(m.border) === 1);
      return odd.map((m) => m.bank);
    })();
    check('3d', `the strip MARKS the open bank — exactly one thumbnail carries a border colour `
      + 'no other thumbnail has, and it is the one that was clicked '
      + '(NOT an independent check of [3b]: the panel reads the same store field — see the note)',
      markedBanks.length === 1 && markedBanks[0] === BANK,
      `${JSON.stringify(marks)} → uniquely-bordered ${JSON.stringify(markedBanks)}, opened ${BANK}`);

    // ---- 4. A STROKE IN BANK k, AND ONE UNDO -------------------------------
    // The composer canvas identified through the DOCUMENT'S OWN dimensions,
    // never "the only crosshair canvas": the thumbnails and the map are
    // canvases too, and a run that grabbed the wrong one would report a
    // feature defect that is really a mis-aimed instrument.
    await c.evalExpr(clickByText('/^Art$/'));
    await sleep(1400);
    const canvases = await c.json(CROSSHAIR_CANVASES);
    const docW = band.cols * TILE_W, docH = band.rows * TILE_W;
    const surface = canvases.find((k) => k.cssW > 0 && k.cssH > 0
      && Math.abs(k.cssW / docW - k.cssH / docH) < 1e-6 && k.cssW / docW >= 2);
    check('4a', `ANTI-VACUOUS: the composer surface is on screen and is the open document's own `
      + `${band.cols}x${band.rows} tiles (${docW}x${docH} doc px) at an integer-ish zoom`,
      !!surface, `crosshair canvases ${JSON.stringify(canvases)}`);
    if (!surface) throw new Error('no composer canvas — see [4a]');
    const zoom = surface.cssW / docW;
    note(`SURFACE  rect=${JSON.stringify(surface)}  zoom=${zoom} css px per doc px  `
      + `(dpr=${dpr}; every aim below is an integer client pixel re-derived through floor())`);

    /** An INTEGER client aim for a doc pixel, re-derived, or null. */
    const aimDoc = (x, y) => {
      const cx = Math.round(surface.left + (x + 0.5) * zoom);
      const cy = Math.round(surface.top + (y + 0.5) * zoom);
      const dx = Math.floor((cx - surface.left) / zoom);
      const dy = Math.floor((cy - surface.top) / zoom);
      if (dx !== x || dy !== y) return null;
      return { x: cx, y: cy, dx, dy };
    };

    const armPencil = async () => {
      const r = await c.evalExpr(String.raw`
        (() => { const b = [...document.querySelectorAll('button')]
          .find((e) => /^Pencil/.test((e.title || '') + (e.getAttribute('aria-label') || '')));
          if (!b) return 'no-button'; b.click(); return 'clicked'; })()`);
      await sleep(400);
      return r;
    };
    const armed = await armPencil();
    const toolNow = (await artOpen())?.tool;
    check('4b', 'the Pencil is armed from the real tool dock (a click, not a store poke)',
      armed === 'clicked' && toolNow === 'pencil', `dock=${armed} artStore.tool=${toolNow}`);

    /** The whole document as the model holds it: static prefix + all 8 banks. */
    const snapshot = async () => c.json(String.raw`
      (() => {
        const out = { tiles: [], banks: [] };
        for (let s = 0; s < ${band.tileCount}; s++) {
          out.tiles.push(window.__dbg.aeon.bgOverrideTileAt(${band.slotBase} + s));
        }
        for (let k = 0; k < ${PHASE_BANKS}; k++) {
          const b = [];
          for (let s = 0; s < ${band.tileCount}; s++) b.push(window.__dbg.aeon.bandPhaseTile(0, k, s));
          out.banks.push(b);
        }
        return out;
      })()`);

    /** Doc cell (c,r) is slot c*rows + r — COLUMN-MAJOR, the runtime's order. */
    const slotOf = (cx, ry) => cx * band.rows + ry;
    const pxOf = (snap, whichBank, x, y) => {
      const t = whichBank === null
        ? snap.tiles[slotOf(x >> 3, y >> 3)]
        : snap.banks[whichBank][slotOf(x >> 3, y >> 3)];
      return t ? t[(y & 7) * TILE_W + (x & 7)] : null;
    };

    /**
     * A horizontal run of 6 doc pixels inside ONE tile row, placed in the
     * middle of the pattern so it cannot fall off the document. Six is chosen
     * so a colour differing from all of them always exists in 0..15.
     */
    const RUN = 6;
    const strokeY = Math.floor(docH / 2);
    const strokeX0 = Math.floor((docW - RUN) / 2);
    const strokePixels = Array.from({ length: RUN }, (_, i) => ({ x: strokeX0 + i, y: strokeY }));
    const aims = strokePixels.map((p) => aimDoc(p.x, p.y));
    check('4c', `ANTI-VACUOUS for the aim: every one of the ${RUN} doc pixels in the stroke has an `
      + 'INTEGER client aim that re-derives to itself through the surface\'s own floor()',
      aims.every((a) => a !== null),
      `y=${strokeY}, x=${strokeX0}..${strokeX0 + RUN - 1} → ${JSON.stringify(aims)}`);
    if (aims.some((a) => a === null)) throw new Error('no usable aim — see [4c]');

    const snapBefore = await snapshot();
    const currentAt = strokePixels.map((p) => pxOf(snapBefore, BANK, p.x, p.y));
    const COLOUR = (() => {
      for (let v = 0; v <= TILE_PIXEL_MAX; v++) if (!currentAt.includes(v)) return v;
      return null;
    })();
    check('4d', 'ANTI-VACUOUS for the write: a paint index exists that DIFFERS from what every '
      + 'stroked pixel already holds — a stroke that repainted the value already there would '
      + 'be green everywhere below and prove nothing',
      COLOUR !== null,
      `bank ${BANK} currently holds ${JSON.stringify(currentAt)} at the stroke; painting ${COLOUR}`);
    if (COLOUR === null) throw new Error('no distinguishing colour — see [4d]');
    await c.evalExpr(`window.__dbg.setPaintColor(${COLOUR})`);

    const mouse = (type, x, y, buttons) => c.send('Input.dispatchMouseEvent',
      { type, x, y, button: 'left', clickCount: 1, buttons: buttons ?? (type === 'mouseReleased' ? 0 : 1) });
    /** ONE stroke, dispatched as press + a move per doc pixel + release. */
    const stroke = async (pts) => {
      await mouse('mouseMoved', pts[0].x, pts[0].y, 0); await sleep(60);
      await mouse('mousePressed', pts[0].x, pts[0].y); await sleep(80);
      for (let i = 1; i < pts.length; i++) { await mouse('mouseMoved', pts[i].x, pts[i].y); await sleep(50); }
      await mouse('mouseReleased', pts[pts.length - 1].x, pts[pts.length - 1].y, 0);
      await sleep(700);
    };
    const hashBeforeStroke = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    await stroke(aims);
    await shot(c, `composer-bank${BANK}-stroked`);
    const snapAfter = await snapshot();
    const landed = strokePixels.map((p) => pxOf(snapAfter, BANK, p.x, p.y));
    check('4e', `THE STROKE LANDED IN BANK ${BANK}: every doc pixel the drag crossed holds the `
      + 'painted index in phases[' + BANK + ']',
      landed.every((v) => v === COLOUR),
      `phases[${BANK}] at the stroke = ${JSON.stringify(landed)}, painted ${COLOUR} `
      + `(was ${JSON.stringify(currentAt)})`);

    // THE DISCRIMINATING ROW FOR THE BANK IDENTITY, from the other side: a
    // stroke drawn with bank k open must reach phases[k] and NOTHING else. A
    // commit routed to `set-bg-override-tiles` instead would move the static
    // prefix and phases[0], and [4e] alone cannot see that.
    const otherBanksMoved = snapAfter.banks
      .map((b, k) => (k === BANK || same(b, snapBefore.banks[k]) ? null : k))
      .filter((k) => k !== null);
    check('4f', `and NOWHERE ELSE: the static prefix and every other bank are byte-identical — a `
      + 'bank-k stroke is not a prefix write',
      same(snapAfter.tiles, snapBefore.tiles) && otherBanksMoved.length === 0,
      `static prefix moved: ${!same(snapAfter.tiles, snapBefore.tiles)}; `
      + `other banks that moved: ${JSON.stringify(otherBanksMoved)}`);

    // ONE UNDO, MEASURED ON THE WHOLE DOCUMENT. A per-mousemove commit would
    // return the LAST pixel and leave the other five; a hash comparison sees
    // that, a single-pixel sample does not.
    const hashAfterStroke = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('4g', 'ANTI-VACUOUS for the undo: the stroke really moved the document, so [4h] is not '
      + 'comparing a document to itself',
      hashAfterStroke !== null && hashBeforeStroke !== null && hashAfterStroke !== hashBeforeStroke,
      `hash ${hashBeforeStroke} -> ${hashAfterStroke}`);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await sleep(900);
    const snapUndo = await snapshot();
    const hashUndo = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('4h', 'ONE Ctrl+Z takes the WHOLE stroke back — the document hashes back to exactly '
      + `what it was before the drag (a per-mousemove commit would return 1 of the ${RUN} pixels `
      + 'and leave the rest, which a single-pixel sample cannot see)',
      hashUndo === hashBeforeStroke && same(snapUndo.banks[BANK], snapBefore.banks[BANK]),
      `hash ${hashAfterStroke} -> ${hashUndo} (want ${hashBeforeStroke}); `
      + `phases[${BANK}] identical to before: ${same(snapUndo.banks[BANK], snapBefore.banks[BANK])}`);

    // ---- 5. BANK 0, THE PREFIX RULE, AND THE MAP ---------------------------
    // Bank 0 IS the static slots. This is the rule the ONE tile writer exists
    // for: `tiles[base+t] == phases[0][t]`, on apply AND on undo.
    const clicked0b = await clickBank(0);
    const open0b = await artOpen();
    check('5a', 'ANTI-VACUOUS: bank 0 is now the open document (the rule below is about the '
      + 'ANIMATED PREFIX, and only bank 0 writes it)',
      clicked0b === 'clicked' && !!open0b && open0b.target.kind === 'bank' && open0b.target.bank === 0,
      JSON.stringify(open0b));

    // Where on the MAP this stroke will show. Chosen from the LAYOUT — read in
    // ONE page-side loop — before anything is drawn, so the observation point
    // is a cell that really names a slot the stroke covers.
    const layout = await c.json(String.raw`
      (() => { const out = []; for (let i = 0; i < ${beforeDoc.layout.length}; i++)`
      + ` out.push(window.__dbg.aeon.bgOverrideLayoutAt(i)); return out; })()`);
    // Paint a FULL TILE COLUMN of the pattern: doc x in [col*8, col*8+8), all
    // rows. That covers `rows` slots, which maximises the chance that some cell
    // on screen names one of them.
    const PAINT_COL = Math.floor(band.cols / 2);
    const paintedSlots = Array.from({ length: band.rows }, (_, r) => band.slotBase + slotOf(PAINT_COL, r));

    const VP = { x: 0, y: 0, zoom: 1 };
    await c.evalExpr(clickByText('/^Effects$/')).catch(() => {});
    await sleep(1000);
    const bgOn = await c.evalExpr(clickByText('/^BG$/'));
    await sleep(800);
    await c.evalExpr(`window.__dbg.setView(${VP.x}, ${VP.y}, ${VP.zoom})`);
    await sleep(700);
    const mapRect = await c.json(MAP_RECT);
    // MapViewport draws Plane B ALONE when `editingLayer === 'bg'` and
    // composites FG over it otherwise, so a sample taken on FG watches the
    // level and reports "nothing changed" about a plane it was never showing.
    const layerNow = (await c.json('window.__dbg.aeon.selectedTile()')).layer;
    const srcNow = await c.evalExpr('window.__dbg.aeon.bgSource()');
    check('5b0', 'ANTI-VACUOUS: the map is on the BACKGROUND plane and still resolving it from '
      + 'the OVERRIDE — a sample taken on FG, or against the library, watches a picture this '
      + 'stroke cannot reach',
      layerNow === 'bg' && srcNow === 'override' && !!mapRect,
      `editingLayer=${layerNow} bgSource=${srcNow} · BG chip click=${bgOn} · `
      + `rect=${JSON.stringify(mapRect)} · view=${JSON.stringify(VP)}`);

    const onScreen = (i) => {
      const col = i % BG_WIDTH, row = Math.floor(i / BG_WIDTH);
      const x = Math.round((col * TILE_W - VP.x) * VP.zoom);
      const y = Math.round((row * TILE_W - VP.y) * VP.zoom);
      const w = Math.round(TILE_W * VP.zoom);
      return mapRect && x >= 0 && y >= 0 && x + w <= mapRect.cw && y + w <= mapRect.ch
        ? { col, row } : null;
    };
    let watch = null, control = null;
    for (let i = 0; i < layout.length; i++) {
      const w = layout[i];
      if (!w) continue;                                  // the consumer's blank escape
      const slot = w & IDX_MASK;
      const pos = onScreen(i);
      if (!pos) continue;
      if (!watch && paintedSlots.includes(slot)) watch = { i, slot, ...pos };
      // The CONTROL is a cell whose slot is past the whole animated prefix —
      // static art this stroke cannot reach by any route.
      if (!control && slot >= budget.animatedSlots) control = { i, slot, ...pos };
      if (watch && control) break;
    }
    const cellPixels = async (cell) => (cell ? c.json(MAP_CELL(cell.col, cell.row, VP, TILE_W)) : null);
    const watchBefore = await cellPixels(watch);
    const controlBefore = await cellPixels(control);
    const painting = watchBefore && new Set(watchBefore).size > 1;
    check('5b', 'ANTI-VACUOUS for the map: an on-screen cell whose layout word names a slot this '
      + 'stroke WILL cover, a CONTROL cell naming static art past the whole prefix, and the map '
      + 'canvas is actually PAINTING at the watched cell (more than one colour in its 8x8)',
      !!watch && !!control && painting,
      `watch=${JSON.stringify(watch)} control=${JSON.stringify(control)} · `
      + `painted slots ${JSON.stringify(paintedSlots)} · `
      + `watched cell distinct colours=${watchBefore ? new Set(watchBefore).size : 'n/a'}`);

    // ⚠ THE ROW THAT STOPS [5h] BEING FREE. The band PREVIEW draws over plane B
    // when the `playAnimatedArt` overlay is on, and it runs on a frame clock —
    // a watched cell that is animating changes on its own, and "different after
    // the stroke" would then be true whatever the stroke did. It defaults OFF
    // (viewStore) and this run clears localStorage, but a default is a claim
    // about the code, not about this process: sample the same cell twice, a
    // second apart, with nothing happening in between, and require it STILL.
    await sleep(1100);
    const watchIdle = await cellPixels(watch);
    const controlIdle = await cellPixels(control);
    check('5b2', 'ANTI-VACUOUS for the repaint: with NOTHING happening the watched cell and the '
      + 'control are byte-identical a second later — the map is not animating under [5h], so a '
      + 'difference there can only have come from the stroke',
      !!watchIdle && same(watchIdle, watchBefore) && !!controlIdle && same(controlIdle, controlBefore),
      `watched cell still after 1.1s idle: ${same(watchIdle, watchBefore)}; `
      + `control still: ${same(controlIdle, controlBefore)}`);

    // Back to the composer and draw the column.
    await c.evalExpr(clickByText('/^Art$/'));
    await sleep(1400);
    const surface2 = (await c.json(CROSSHAIR_CANVASES))
      .find((k) => k.cssW > 0 && Math.abs(k.cssW / docW - k.cssH / docH) < 1e-6 && k.cssW / docW >= 2);
    check('5c', 'ANTI-VACUOUS: the composer surface is back on screen after the facet round trip, '
      + 'so the aims below are computed against the box that is actually there',
      !!surface2, `${JSON.stringify(surface2)} (section 4 measured ${JSON.stringify(surface)})`);
    if (!surface2) throw new Error('composer gone after the round trip — see [5c]');
    const zoom2 = surface2.cssW / docW;
    const aimDoc2 = (x, y) => {
      const cx = Math.round(surface2.left + (x + 0.5) * zoom2);
      const cy = Math.round(surface2.top + (y + 0.5) * zoom2);
      if (Math.floor((cx - surface2.left) / zoom2) !== x
        || Math.floor((cy - surface2.top) / zoom2) !== y) return null;
      return { x: cx, y: cy };
    };
    const colX = PAINT_COL * TILE_W + Math.floor(TILE_W / 2);
    const colPixels = Array.from({ length: docH }, (_, y) => ({ x: colX, y }));
    const colAims = colPixels.map((p) => aimDoc2(p.x, p.y));
    check('5d', 'ANTI-VACUOUS for the aim: every doc pixel of the painted column re-derives to '
      + 'itself through the surface\'s own floor()',
      colAims.every((a) => a !== null),
      `x=${colX}, y=0..${docH - 1}, zoom=${zoom2} → ${colAims.filter((a) => a === null).length} bad aims`);
    if (colAims.some((a) => a === null)) throw new Error('no usable column aim — see [5d]');

    const snapPre0 = await snapshot();
    const colCurrent = colPixels.map((p) => pxOf(snapPre0, 0, p.x, p.y));
    const COLOUR0 = (() => {
      for (let v = 0; v <= TILE_PIXEL_MAX; v++) if (!colCurrent.includes(v)) return v;
      return null;
    })();
    if (COLOUR0 === null) {
      unmeasurable('5e', 'a bank-0 stroke writes the static prefix and phases[0] together',
        `every index 0..${TILE_PIXEL_MAX} already appears down the painted column, so no colour `
        + 'distinguishes the write from what is there');
      throw new Error('no distinguishing colour for the column — see [5e]');
    }
    await c.evalExpr(`window.__dbg.setPaintColor(${COLOUR0})`);
    const hashPre0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    await stroke(colAims);
    await shot(c, 'composer-bank0-column');
    const snapPost0 = await snapshot();

    const staticLanded = colPixels.map((p) => pxOf(snapPost0, null, p.x, p.y));
    const phase0Landed = colPixels.map((p) => pxOf(snapPost0, 0, p.x, p.y));
    check('5e', 'A BANK-0 STROKE WRITES THE STATIC PREFIX: every doc pixel of the column holds '
      + `the painted index in tiles[slot_base + slot]`,
      staticLanded.every((v) => v === COLOUR0),
      `tiles at the column = ${JSON.stringify(staticLanded)} (painted ${COLOUR0}, `
      + `was ${JSON.stringify(colCurrent)})`);
    // THE RULE THE ONE TILE WRITER EXISTS FOR, on apply. Asserted over the
    // WHOLE prefix, not only the stroked pixels — a writer that updated the
    // stroked half of a tile in one copy and not the other would pass a
    // pixel-wise check at the stroke and still ship an incoherent file.
    const coherentApply = snapPost0.tiles.every((t, s) => same(t, snapPost0.banks[0][s]));
    check('5f', 'AND phases[0] MOVES WITH IT — tiles[base+t] == phases[0][t] for every one of the '
      + `${band.tileCount} prefix slots after the stroke; and the document still SERIALIZES, `
      + 'which Aurora refuses to do when that rule is broken',
      coherentApply && (await c.evalExpr('window.__dbg.aeon.bgOverrideHash()')) !== null,
      `coherent over all ${band.tileCount} slots: ${coherentApply}; `
      + `phases[0] at the column = ${JSON.stringify(phase0Landed)}`);
    const banks17Moved = snapPost0.banks
      .map((b, k) => (k === 0 || same(b, snapPre0.banks[k]) ? null : k)).filter((k) => k !== null);
    check('5g', 'and banks 1..7 are byte-identical — drawing phase 0 is not a regenerate',
      banks17Moved.length === 0, `banks that moved: ${JSON.stringify(banks17Moved)}`);

    // ---- THE MAP ----------------------------------------------------------
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1400);
    const mapRect2 = await c.json(MAP_RECT);
    const rectStable = same(mapRect2, mapRect);
    const watchAfter = rectStable ? await cellPixels(watch) : null;
    const controlAfter = rectStable ? await cellPixels(control) : null;
    await shot(c, 'map-after-bank0-stroke');
    if (!rectStable) {
      unmeasurable('5h', 'the map repaints the band\'s cells',
        `the map canvas box moved across the facet round trip (${JSON.stringify(mapRect)} -> `
        + `${JSON.stringify(mapRect2)}), so a before/after pixel comparison would be reading two `
        + 'different places');
    } else {
      check('5h', 'THE MAP REPAINTS THE BAND\'S CELLS: the 8x8 the watched cell occupies on '
        + '#map-canvas is DIFFERENT after the stroke — sampled with getImageData, not inferred '
        + 'from the model',
        !!watchAfter && !same(watchAfter, watchBefore),
        `cell ${watch && watch.i} (slot ${watch && watch.slot}, col ${watch && watch.col}, `
        + `row ${watch && watch.row}): ${watchBefore ? new Set(watchBefore).size : '?'} distinct `
        + `colours before, ${watchAfter ? new Set(watchAfter).size : '?'} after; identical: `
        + `${same(watchAfter, watchBefore)}`);
      check('5i', 'ANTI-VACUOUS for the repaint: the CONTROL cell — static art past the whole '
        + 'animated prefix — is byte-identical, so [5h] is a targeted repaint and not the whole '
        + 'canvas having been redrawn differently',
        !!controlAfter && same(controlAfter, controlBefore),
        `control cell ${control && control.i} (slot ${control && control.slot}, past `
        + `${budget.animatedSlots} animated slots): identical ${same(controlAfter, controlBefore)}`);
    }

    // ---- THE RULE ON UNDO -------------------------------------------------
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'z', code: 'KeyZ',
      windowsVirtualKeyCode: 90, nativeVirtualKeyCode: 90, modifiers: 2 });
    await sleep(900);
    const snapUndo0 = await snapshot();
    const hashUndo0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const coherentUndo = snapUndo0.tiles.every((t, s) => same(t, snapUndo0.banks[0][s]));
    check('5j', 'THE RULE HOLDS ON UNDO TOO: one Ctrl+Z takes the whole column back, the static '
      + 'prefix and phases[0] revert TOGETHER, and the document hashes back to what it was '
      + 'before the stroke',
      hashUndo0 === hashPre0 && coherentUndo
      && same(snapUndo0.tiles, snapPre0.tiles) && same(snapUndo0.banks[0], snapPre0.banks[0]),
      `hash -> ${hashUndo0} (want ${hashPre0}); coherent ${coherentUndo}; `
      + `tiles restored ${same(snapUndo0.tiles, snapPre0.tiles)}; `
      + `phases[0] restored ${same(snapUndo0.banks[0], snapPre0.banks[0])}`);
    if (rectStable) {
      const watchUndone = same(await c.json(MAP_RECT), mapRect) ? await cellPixels(watch) : null;
      check('5k', 'and the MAP goes back with it — an undo that moved only the model reads to an '
        + 'author as "Ctrl+Z did nothing"',
        !!watchUndone && same(watchUndone, watchBefore),
        `watched cell back to its before-pixels: ${same(watchUndone, watchBefore)}`);
    }

    // ---- 6. REDRAW AND SAVE ------------------------------------------------
    // The stroke is put back (the undo above consumed it) so the file handed to
    // aeon's gate carries a real band-art edit rather than the fixture.
    await c.evalExpr(clickByText('/^Art$/'));
    await sleep(1400);
    const surface3 = (await c.json(CROSSHAIR_CANVASES))
      .find((k) => k.cssW > 0 && Math.abs(k.cssW / docW - k.cssH / docH) < 1e-6 && k.cssW / docW >= 2);
    check('6a', 'ANTI-VACUOUS: the composer is still usable after the undo and the facet round '
      + 'trips, and the box has not moved from section 5\'s',
      !!surface3 && same(surface3, surface2), `${JSON.stringify(surface3)}`);
    if (!surface3 || !same(surface3, surface2)) throw new Error('composer box moved — see [6a]');
    await c.evalExpr(`window.__dbg.setPaintColor(${COLOUR0})`);
    await stroke(colAims);
    const snapSave = await snapshot();
    check('6b', 'the column is redrawn (the undo did not leave the surface dead) and the prefix '
      + 'is coherent going into the save',
      colPixels.every((p) => pxOf(snapSave, null, p.x, p.y) === COLOUR0)
      && snapSave.tiles.every((t, s) => same(t, snapSave.banks[0][s])),
      `redrawn: ${colPixels.every((p) => pxOf(snapSave, null, p.x, p.y) === COLOUR0)}`);

    const dirtyBefore = (await c.json('window.__dbg.aeon.state()')).dirty;
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS',
      windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS',
      windowsVirtualKeyCode: 83, nativeVirtualKeyCode: 83, modifiers: 2 });
    await sleep(3000);
    const afterText = readFileSync(overridePath, 'utf8');
    const afterDoc = JSON.parse(afterText);
    const onDiskCarries = colPixels.every((p) => {
      const slot = band.slotBase + slotOf(p.x >> 3, p.y >> 3);
      const t = afterDoc.tiles[slot];
      return !!t && t[(p.y & 7) * TILE_W + (p.x & 7)] === COLOUR0;
    });
    const onDiskPhase0 = colPixels.every((p) => {
      const s = slotOf(p.x >> 3, p.y >> 3);
      const t = afterDoc.anims?.[0]?.phases?.[0]?.[s];
      return !!t && t[(p.y & 7) * TILE_W + (p.x & 7)] === COLOUR0;
    });
    check('6c', 'A REAL Ctrl+S WROTE IT INTO editor_bg_override.json ON DISK — the file the '
      + 'injector bakes — carrying the stroke in BOTH copies (tiles and anims[0].phases[0])',
      afterText !== beforeText && onDiskCarries && onDiskPhase0,
      `file ${afterText === beforeText ? 'UNCHANGED' : `changed (${beforeText.length} -> `
        + `${afterText.length} bytes)`}; tiles carry the stroke: ${onDiskCarries}; `
      + `phases[0] carries it: ${onDiskPhase0}; dirty before save: ${dirtyBefore}`);
    if (afterText === beforeText) throw new Error('nothing was saved — see [6c]');
    savedPath = overridePath;

    // Only the band's art moved. A save that rewrote the layout as well would
    // still pass the gate, and would still be a defect.
    check('6d', 'and the LAYOUT is untouched — a band-art stroke is not a layout stamp',
      same(afterDoc.layout, beforeDoc.layout),
      `${afterDoc.layout.length} words, identical: ${same(afterDoc.layout, beforeDoc.layout)}`);

    // ---- 8. THE LIVE TREE ---------------------------------------------------
    check('8a', 'THE LIVE AEON TREE WAS NEVER WRITTEN: its editor_bg_override.json hashes to '
      + 'exactly what it did before this run (the app opened a hardlink COPY, and the one file '
      + 'this run writes had its link broken first)',
      sha(readFileSync(liveOverride)) === liveBefore,
      `${LIVE_AEON}: ${liveBefore.slice(0, 16)} -> ${sha(readFileSync(liveOverride)).slice(0, 16)}`);
  } finally {
    try { c && c.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
    await sleep(500);
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
  }
  return savedPath;
}

async function main() {
  let savedPath = null;
  try {
    savedPath = await drive();
  } catch (e) {
    console.error(`\nDRIVE ERROR: ${e.stack || e.message}`);
    fails.push('[drive] the CDP run did not complete');
  }

  // ---- 7. AEON'S OWN GATE, OVER THE FILE THE APP JUST SAVED ---------------
  if (!savedPath) {
    unmeasurable('7a', 'the saved file passes aeon\'s validate_band_coherence',
      'the CDP run never produced a saved file, so there is nothing to gate');
    unmeasurable('7b', 'a planted incoherent copy of that same file is REFUSED naming the band',
      'the CDP run never produced a saved file, so there is nothing to poison');
  } else {
    console.log(`\n── SECTION 7: aeon's own gate over ${savedPath} ──`);
    const g = runInjectorGate(savedPath);
    const line = /Tests\s+(.*)$/m.exec(g.out);
    const poison = /foreground poison verdict: (.*)$/m.exec(g.out);
    // ⚠ A SKIPPED ROW MUST NEVER READ AS A PASS. vitest prints `↓` for a skip
    // and `✓` for a pass on the same line shape, so the two are counted apart
    // here rather than "the file was mentioned" being taken for "it ran".
    const fgRan = (g.out.match(/✓ .*the file the REAL APP saved/g) ?? []).length;
    const fgSkipped = (g.out.match(/↓ .*the file the REAL APP saved/g) ?? []).length;
    const skipped = fgRan === 0
      || /aeon tool not found|the foreground rows are SKIPPED/.test(g.out);
    console.log(g.out.split('\n').filter((l) =>
      /the file the REAL APP saved|REFUSES a planted|ACCEPTS |Tests |Test Files |foreground poison|SKIPPED/.test(l)
    ).join('\n'));
    note(`GATE ROWS  ${fgRan} foreground row(s) RAN, ${fgSkipped} skipped`);
    if (skipped) {
      unmeasurable('7a', 'the saved file passes aeon\'s validate_band_coherence',
        `the sibling aeon tool was not found, so the gate rows SKIPPED rather than ran — see the `
        + 'gate test\'s own warning above');
      unmeasurable('7b', 'a planted incoherent copy of that same file is REFUSED naming the band',
        'same — the tool was absent');
    } else {
      check('7a', 'THE SAVED FILE PASSES THE INJECTOR: aeon\'s own validate_band_coherence '
        + 'ACCEPTS what the app wrote, run through the repo\'s existing gate '
        + '(bg-override-art-injector-gate.test.ts) rather than a second invocation of the tool',
        g.status === 0 && fgRan === 3, `vitest exit=${g.status} · ${line ? line[1] : 'no summary line'} `
        + `· foreground rows that RAN: ${fgRan} (want 3), skipped ${fgSkipped}`);
      check('7b', 'AND THE GATE CAN FAIL: the same saved file with phases[0][0] perturbed is '
        + 'REFUSED, and the refusal NAMES THE BAND — without this row every accept above is the '
        + 'vacuous shape this repo keeps finding',
        !!poison && /^REFUSE/.test(poison[1]) && /band \d+: phases\[0\] != tiles\[/.test(poison[1]),
        poison ? poison[1] : 'the gate test printed no foreground poison verdict');
    }
  }

  const nm = results.filter((r) => r.nm).length;
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length - nm} PASSED`
    + (nm ? `, ${nm} NOT MEASURABLE` : '')
    + (fails.length ? `\nFAILED: ${fails.join(', ')}` : ''));
  if (unmeasured.length) console.log(`NOT MEASURABLE: ${unmeasured.join(' | ')}`);
  console.log(`shots in scratchpad/shots-band-art-fg/`);
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
