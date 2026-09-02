#!/usr/bin/env node
// DOES THE MAP CANVAS PAINT THE BACKGROUND THE ROM IS BUILT FROM — AND WHERE
// DOES A STROKE ON IT LAND?
//
// Owner decision d-12 ("the game's copy wins"). The node suite has ~4,590 tests
// over this feature and cannot see one pixel of it: it cannot tell whether the
// override reached the canvas, whether the OTHER acts still paint what they used
// to, or — the row that matters most — whether a paint gesture writes the file
// the game is built from or one nobody bakes.
//
// ═══ THE DEFECT THIS EXISTS TO CATCH ═══
//
// Changing what the canvas SHOWS without settling what painting WRITES produces
// an edit that never reaches the project: the author paints, something changes
// on screen or does not, and either way the file that ships is untouched. There
// is no error, and it is indistinguishable from a correctly refused operation.
// So no row below asks the app whether it worked:
//
//   PIXELS   `getImageData` on `#map-canvas`, compared against the DOCUMENT'S OWN
//            TILES read from disk in node — palette-free (see canonicalise()).
//   THE FILE `editor_bg_override.json` read off disk after a real Ctrl+S, and
//            the BG-library binaries hashed before and after to prove the write
//            did NOT go to the old target.
//   THE DOM  the refusal toast's text, for the row where the answer is "nothing
//            was painted, and here is why".
//
// ═══ PALETTE-FREE PIXEL COMPARISON, AND WHY ═══
//
// A screen pixel is an RGBA colour; a document tile is a 0..15 palette index.
// Relating them needs the palette, its Genesis->RGB rule and the renderer's
// transparency convention — three chances to get a FALSE RED, and every one of
// them would be this harness re-implementing the thing under test.
//
// So both sides are canonicalised instead: replace each value by the order of
// its first appearance in the 8x8 cell. Two tiles with the same shape produce
// the same canonical string whatever palette is on. That is only a claim about
// SHAPE — which is why every pixel row also asserts the OTHER candidate's shape
// is DIFFERENT at the same cells. Cells are chosen in node, before the app
// starts, for exactly that property.
//
// ═══ THREE TREES, AND ONLY ONE OF THEM IS WRITTEN TO ═══
//
//   LIVE      /home/volence/sonic_hacks/aeon, opened READ-ONLY. Never saved.
//             The rows that prove the real project paints the real background.
//   UNBOUND   a hardlinked copy whose act declares a DIFFERENT generated
//             directory, so the override binds nothing. The anti-regression half.
//   WRITABLE  a pristine hardlinked copy. The paint rows save into this one.
//
// ⚠ Every file a fixture rewrites is UNLINKED first, so the hardlink breaks
// rather than the aeon tree being edited in place.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/bg-override-paints-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9399);
const ROOT = AURORA_DIR;
const AEON = siblingPathOrUnresolved('aeon');
const ELECTRON = process.env.ELECTRON_BIN ?? `${ROOT}/node_modules/.bin/electron`;
const SHOTS = `${ROOT}/scratchpad/shots-bg-override-paints`;
mkdirSync(SHOTS, { recursive: true });

// ── EVERY CONSTANT IS READ, NOT TYPED ────────────────────────────────────────
const CONTRACT = JSON.parse(readFileSync(
  join(ROOT, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));
const TILE_PIXELS = CONTRACT.constants.TILE_PIXELS.value;
const TILE_BYTES = CONTRACT.constants.TILE_BYTES.value;
const TILE_W = CONTRACT.constants.TILE_WIDTH_PX.value;
const IDX_MASK = CONTRACT.constants.LAYOUT_TILE_INDEX_MASK.value;
const OUT_DIR = CONTRACT.outputDir.value;
const OVERRIDE_REL = CONTRACT.path;
/** Plane B's width in cells — read out of the repo's own authority, not typed. */
const BG_WIDTH = (() => {
  const src = readFileSync(join(ROOT, 'src/core/formats/bg-tiles.ts'), 'utf8');
  const m = /export const BG_WIDTH = (\d+);/.exec(src);
  if (!m) throw new Error('could not read BG_WIDTH out of src/core/formats/bg-tiles.ts');
  return Number(m[1]);
})();
/** Nametable bit layout — read out of `unpackNametableWord`, not restated. */
const NT = (() => {
  const src = readFileSync(join(ROOT, 'src/core/model/s4-types.ts'), 'utf8');
  const grab = (re) => { const m = re.exec(src); if (!m) throw new Error(`nt bits: ${re}`); return Number(m[1]); };
  return {
    hFlip: grab(/hFlip: \(word & (0x[0-9A-Fa-f]+)\) !== 0/),
    vFlip: grab(/vFlip: \(word & (0x[0-9A-Fa-f]+)\) !== 0/),
    palShift: grab(/palette: \(word >> (\d+)\) & 0x3/),
  };
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash('sha256').update(b).digest('hex');

// ── CDP plumbing (same shape as bganim-motion-harness.mjs) ───────────────────
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
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}\n        ${detail}`);
  results.push({ id, name, ok: null });
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-bg-override-paints/${name}.png`);
}

// ── READING THE TWO BACKGROUNDS OFF DISK ─────────────────────────────────────
function readOverride(tree) {
  return JSON.parse(readFileSync(join(tree, OVERRIDE_REL), 'utf8'));
}
/** The BG-library entry the act's section 0 displays, straight off disk. */
function readLibraryEntry(tree) {
  const meta = JSON.parse(readFileSync(
    join(tree, 'games/sonic4/data/editor/ojz/act1/section_0.meta.json'), 'utf8'));
  const id = meta.bgLayoutRef;
  if (!id) return null;
  const dir = join(tree, 'games/sonic4/data/editor');
  const lb = readFileSync(join(dir, `ojz_bg_${id}.bin`));
  const lt = readFileSync(join(dir, `ojz_bg_${id}_tiles.bin`));
  const layout = [];
  for (let i = 0; i < lb.length / 2; i++) layout.push(lb.readUInt16BE(i * 2));
  // `parseBgTiles`: a BE byte-length header when it agrees with the body length,
  // else a headerless dump. Detected, never assumed — the loader's own rule.
  const hasHeader = lt.length >= 2 && (lt.length - 2) % TILE_BYTES === 0
    && lt.readUInt16BE(0) === lt.length - 2;
  const body = hasHeader ? lt.subarray(2) : lt;
  const tiles = [];
  for (let t = 0; t < body.length / TILE_BYTES; t++) {
    const px = [];
    for (let b = 0; b < TILE_BYTES; b++) { const v = body[t * TILE_BYTES + b]; px.push(v >> 4, v & 0xF); }
    tiles.push(px);
  }
  return { id, layout, tiles, layoutPath: join(dir, `ojz_bg_${id}.bin`), tilesPath: join(dir, `ojz_bg_${id}_tiles.bin`) };
}

/**
 * Replace each value by the order of its first appearance. The palette-free
 * comparison: this is what a screen cell and a document tile can be compared ON.
 */
function canonicalise(values) {
  const seen = new Map();
  let out = '';
  for (const v of values) {
    if (!seen.has(v)) seen.set(v, seen.size);
    out += seen.get(v).toString(36);
  }
  return out;
}
function applyFlips(px, hFlip, vFlip) {
  const out = new Array(TILE_PIXELS);
  for (let y = 0; y < TILE_W; y++) {
    for (let x = 0; x < TILE_W; x++) {
      out[y * TILE_W + x] = px[(vFlip ? TILE_W - 1 - y : y) * TILE_W + (hFlip ? TILE_W - 1 - x : x)];
    }
  }
  return out;
}
/** What cell `i` of `bg` looks like on screen, as a canonical shape. */
function cellShape(bg, i) {
  const word = bg.layout[i];
  if (!word) return null;                                  // blank cell: no shape
  const tile = bg.tiles[word & IDX_MASK];
  if (!tile) return null;
  return canonicalise(applyFlips(tile, (word & NT.hFlip) !== 0, (word & NT.vFlip) !== 0));
}

// ── FIXTURES ─────────────────────────────────────────────────────────────────
function hardlinkCopy(dest, force) {
  if (existsSync(dest)) {
    if (!force) return dest;
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync('cp', ['-al', AEON, dest]);
  return dest;
}
function write(path, bytes) {
  if (existsSync(path)) unlinkSync(path);   // break the hardlink, never edit through it
  writeFileSync(path, bytes);
}
/**
 * A tree whose act declares a DIFFERENT generated directory, so the override
 * binds nothing and the library must win.
 *
 * The retarget is DERIVED from the act's own stripPath (its last segment is
 * replaced), not typed: whatever aeon renames the act to, this still produces a
 * sibling directory that is not the injector's.
 */
function buildUnbound(dest) {
  rmSync(dest, { recursive: true, force: true });
  hardlinkCopy(dest, true);
  const p = join(dest, 'project.json');
  const cfg = JSON.parse(readFileSync(p, 'utf8'));
  const act = cfg.zones[0].acts[0];
  const before = act.stripPath;
  act.stripPath = before.replace(/([^/]+)\/?$/, '$1-unbound/');
  if (act.stripPath === before) throw new Error(`could not retarget stripPath ${before}`);
  write(p, JSON.stringify(cfg, null, 2) + '\n');
  return { dest, before, after: act.stripPath };
}

// ── THE PROBE, installed from outside ────────────────────────────────────────
const PROBE = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';
  window.__bp = {
    canvas: cv,
    // The 8x8 block a background cell occupies, as a flat list of packed RGBA
    // ints. World coords: BG cell (col,row) is at world (col*8, row*8), and the
    // CALLER supplies the viewport it set, so this never asks the app where it
    // thinks it is looking.
    cellPixels(col, row, vpX, vpY, zoom, cellPx) {
      const g = cv.getContext('2d', { willReadFrequently: true });
      const x = Math.round((col * cellPx - vpX) * zoom);
      const y = Math.round((row * cellPx - vpY) * zoom);
      const w = Math.round(cellPx * zoom);
      if (x < 0 || y < 0 || x + w > cv.width || y + w > cv.height) return null;
      const d = g.getImageData(x, y, w, w).data;
      const out = [];
      for (let i = 0; i < d.length; i += 4) {
        out.push(((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0);
      }
      return out;
    },
  };
  return 'installed';
})()`;

async function mouse(c, type, x, y, buttons) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', buttons: buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

/** Screen point for a BG cell, from the canvas rect and the viewport WE set. */
async function pointForCell(c, col, row, vp) {
  return c.json(String.raw`(() => {
    const cv = document.getElementById('map-canvas');
    const b = cv.getBoundingClientRect();
    return { x: Math.round(b.left + (${col} * 8 - ${vp.x}) * ${vp.zoom} + 4),
             y: Math.round(b.top + (${row} * 8 - ${vp.y}) * ${vp.zoom} + 4) };
  })()`);
}

const setView = (c, vp) => c.evalExpr(`window.__dbg.setView(${vp.x}, ${vp.y}, ${vp.zoom})`);
const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const VP = { x: 0, y: 0, zoom: 1 };
  const CELL_PX = TILE_W;

  console.log('\nREADING BOTH BACKGROUNDS OFF DISK (node, before the app exists)…');
  const liveDoc = readOverride(AEON);
  const liveLib = readLibraryEntry(AEON);
  if (!liveLib) throw new Error('section 0 declares no bgLayoutRef — nothing to contrast against');
  console.log(`  override: ${liveDoc.layout.length} layout words, ${liveDoc.tiles.length} tiles`);
  console.log(`  library "${liveLib.id}": ${liveLib.layout.length} layout words, ${liveLib.tiles.length} tiles`);
  const bgRows = Math.floor(liveDoc.layout.length / BG_WIDTH);
  console.log(`  plane measured from the document: ${BG_WIDTH} x ${bgRows} cells`);

  // THE CELLS EVERY PIXEL ROW USES. Chosen for four properties, all checked
  // here rather than hoped for:
  //   • the two blobs give the cell DIFFERENT canonical shapes (so the row can
  //     tell them apart at all);
  //   • both shapes use >= 3 distinct values (a two-value cell is a weak
  //     fingerprint and collides easily);
  //   • neither tile contains pixel value 0, which the renderer leaves
  //     transparent — so every screen pixel here is an opaque palette colour and
  //     the canonicalisation is not comparing shapes against the backdrop;
  //   • the cell is on the FIRST screenful at zoom 1, so it is visible without
  //     a pan.
  const overrideBg = { layout: liveDoc.layout, tiles: liveDoc.tiles };
  const candidates = [];
  for (let i = 0; i < liveDoc.layout.length && candidates.length < 24; i++) {
    const col = i % BG_WIDTH, row = Math.floor(i / BG_WIDTH);
    if (row > 24 || col > 40) continue;
    const ow = liveDoc.layout[i], lw = liveLib.layout[i];
    if (!ow || !lw) continue;
    const ot = liveDoc.tiles[ow & IDX_MASK], lt = liveLib.tiles[lw & IDX_MASK];
    if (!ot || !lt) continue;
    if (ot.includes(0) || lt.includes(0)) continue;
    const os = cellShape(overrideBg, i), ls = cellShape(liveLib, i);
    if (os === null || ls === null || os === ls) continue;
    if (new Set(ot).size < 3 || new Set(lt).size < 3) continue;
    candidates.push({ i, col, row, override: os, library: ls });
  }
  console.log(`  ${candidates.length} discriminating cells found`);
  if (candidates.length < 6) {
    throw new Error('fewer than 6 cells where the two backgrounds differ in SHAPE — the pixel '
      + 'rows would not discriminate. Re-derive the selection rather than loosening it.');
  }

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);

  console.log('\nBUILDING THE FIXTURES (hardlinked; the aeon tree is never edited)…');
  const UNBOUND = join(ROOT, 'scratchpad/fixtures/aeon-bg-unbound');
  const WRITABLE = join(ROOT, 'scratchpad/fixtures/aeon-bg-writable');
  const unbound = buildUnbound(UNBOUND);
  console.log(`  unbound:  stripPath ${unbound.before} -> ${unbound.after}`);
  rmSync(WRITABLE, { recursive: true, force: true });
  hardlinkCopy(WRITABLE, true);
  // The paint rows write here, so the document must be a real file of its own
  // rather than a hardlink into the aeon tree.
  const writablePath = join(WRITABLE, OVERRIDE_REL);
  write(writablePath, readFileSync(join(AEON, OVERRIDE_REL)));
  const writableLib = readLibraryEntry(WRITABLE);
  console.log(`  writable: ${WRITABLE}`);

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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build) [precondition]', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    /** Open a tree, park the camera, install the probe. Returns the state. */
    async function openTree(dir, label) {
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(dir)})`)
        .catch((e) => console.log('        open threw:', e.message));
      let st = null;
      for (let i = 0; i < 40; i++) {
        st = await c.json('window.__dbg.aeon.state()').catch(() => null);
        if (st && st.open) break;
        await sleep(400);
      }
      if (!st || !st.open) throw new Error(`${label} did not open — nothing below can be measured`);
      await sleep(1500);
      await c.evalExpr(`window.__dbg.aeon.setLayer('bg')`);
      await sleep(400);
      await setView(c, VP);
      await sleep(800);
      const installed = await c.evalExpr(PROBE);
      if (installed === 'no-map-canvas') throw new Error(`${label}: no map canvas`);
      return st;
    }

    /** Canonical shapes the CANVAS is showing at the chosen cells. */
    async function screenShapes() {
      const out = [];
      for (const cell of candidates) {
        const px = await c.json(
          `window.__bp.cellPixels(${cell.col}, ${cell.row}, ${VP.x}, ${VP.y}, ${VP.zoom}, ${CELL_PX})`);
        out.push(px === null ? null : { i: cell.i, shape: canonicalise(px), distinct: new Set(px).size });
      }
      return out;
    }

    // ══ PHASE 1 — THE LIVE PROJECT, READ-ONLY ════════════════════════════════
    console.log('\n── PHASE 1: the LIVE aeon tree (read-only, never saved) ──');
    const liveState = await openTree(AEON, 'the live aeon project');
    check('1a', 'the live aeon project is open, with sections [precondition]',
      liveState.sections > 0, JSON.stringify(liveState));
    await shot(c, '1-live-bg-plane');

    const liveShapes = await screenShapes();
    const read = liveShapes.filter((s) => s !== null);
    check('1b', 'the probe read every chosen cell, and none of them is a flat block '
      + '[anti-vacuous precondition]',
      read.length === candidates.length && read.every((s) => s.distinct >= 3),
      `${read.length}/${candidates.length} cells read; distinct colours per cell: `
      + read.map((s) => s.distinct).join(','));
    if (read.length !== candidates.length) {
      throw new Error('the probe read no pixels at some cells — the rows below would be vacuous');
    }

    // THE ROW. The canvas is compared against the document's OWN tiles, read off
    // disk before the app existed.
    const matchOverride = liveShapes.filter((s, k) => s.shape === candidates[k].override).length;
    const matchLibrary = liveShapes.filter((s, k) => s.shape === candidates[k].library).length;
    check('1c', `the canvas paints the OVERRIDE document's pixels at all ${candidates.length} `
      + 'discriminating cells',
      matchOverride === candidates.length,
      `${matchOverride}/${candidates.length} cells match the override's own tiles`);
    check('1d', 'and NOT the BG-library entry\'s — the two really are different pictures',
      matchLibrary === 0,
      `${matchLibrary}/${candidates.length} cells match the library entry "${liveLib.id}" `
      + `(${liveLib.tiles.length} tiles vs the override's ${liveDoc.tiles.length})`);

    const src = await c.evalExpr('window.__dbg.aeon.bgSource()');
    note('1e', 'the resolver agrees with the pixels (reported, not relied on)',
      `bgSource() = ${JSON.stringify(src)} — rows 1c/1d are the evidence; this line only makes a `
      + 'disagreement between the two legible.');

    // ══ PHASE 2 — AN ACT THE OVERRIDE DOES NOT BIND ══════════════════════════
    console.log('\n── PHASE 2: an act whose generated directory is NOT the injector\'s ──');
    await openTree(UNBOUND, 'the unbound fixture');
    await shot(c, '2-unbound-bg-plane');
    const unboundShapes = await screenShapes();
    const uRead = unboundShapes.filter((s) => s !== null);
    check('2a', 'the probe read every chosen cell on the unbound act too [anti-vacuous]',
      uRead.length === candidates.length && uRead.every((s) => s.distinct >= 3),
      `${uRead.length}/${candidates.length} cells read`);
    const uLib = unboundShapes.filter((s, k) => s && s.shape === candidates[k].library).length;
    const uOvr = unboundShapes.filter((s, k) => s && s.shape === candidates[k].override).length;
    check('2b', 'an act the override does NOT bind still paints its BG-LIBRARY background, '
      + 'unchanged', uLib === candidates.length,
      `${uLib}/${candidates.length} cells match the library entry (stripPath ${unbound.after})`);
    check('2c', 'and the override does not leak into it', uOvr === 0,
      `${uOvr}/${candidates.length} cells match the override`);

    // ══ PHASE 3 — WHERE DOES A STROKE LAND? ══════════════════════════════════
    console.log('\n── PHASE 3: the paint gesture, on a writable copy ──');
    await openTree(WRITABLE, 'the writable fixture');
    const wDoc = readOverride(WRITABLE);
    const libBefore = { layout: sha(readFileSync(writableLib.layoutPath)),
                        tiles: sha(readFileSync(writableLib.tilesPath)) };
    // The ACT's own background files, derived from project.json rather than
    // named here. `set-bg-tiles` with a null ref reaches THIS plane, so a stroke
    // that committed the wrong command lands here — and rows 3c/3e cannot see it,
    // because the live stroke already wrote the document by then. Measured: with
    // the command target deliberately reverted, 3b/3c/3d/3e all stayed green and
    // only this row and the undo rows moved.
    const wCfg = JSON.parse(readFileSync(join(WRITABLE, 'project.json'), 'utf8'));
    const actCfg = wCfg.zones[0].acts[0];
    const actBgPaths = [join(WRITABLE, actCfg.bgLayout), join(WRITABLE, actCfg.bgTiles)];
    const actBgBefore = actBgPaths.map((p) => sha(readFileSync(p)));
    const docBefore = readFileSync(writablePath, 'utf8');

    await key(c, 't', 'KeyT', 84);                 // arm paint-tile, the real key
    await sleep(300);
    const armed = (await c.json('window.__dbg.aeon.state()')).tool;
    check('3a', 'the paint-tile tool is armed by a real keypress [precondition]',
      armed === 'paint-tile', `tool = ${armed}`);

    // A cell whose current word is NOT what we are about to write, and a tile
    // index that really exists in the ROM-bound blob.
    const target = candidates[0];
    const oldWord = wDoc.layout[target.i];
    const newTile = (oldWord & IDX_MASK) === 1 ? 2 : 1;
    const paletteLine = (oldWord >> NT.palShift) & 0x3;
    const expectWord = (newTile & IDX_MASK) | (paletteLine << NT.palShift);
    console.log(`  painting cell ${target.i} (${target.col},${target.row}): `
      + `0x${oldWord.toString(16)} -> 0x${expectWord.toString(16)} (tile ${newTile}, `
      + `blob has ${wDoc.tiles.length})`);
    await c.evalExpr(`window.__dbg.aeon.setSelectedTile(${newTile}, ${paletteLine})`);
    await setView(c, VP);
    await sleep(300);

    const pt = await pointForCell(c, target.col, target.row, VP);
    await mouse(c, 'mousePressed', pt.x, pt.y);
    await sleep(60);
    await mouse(c, 'mouseReleased', pt.x, pt.y, 0);
    await sleep(500);

    const inDoc = await c.evalExpr(`window.__dbg.aeon.bgOverrideLayoutAt(${target.i})`);
    check('3b', 'the stroke reached the OVERRIDE DOCUMENT in the model',
      inDoc === expectWord,
      `bgOverrideLayoutAt(${target.i}) = ${inDoc === null ? 'null' : '0x' + inDoc.toString(16)}, `
      + `expected 0x${expectWord.toString(16)} (was 0x${oldWord.toString(16)})`);

    // AND IT SURVIVES A REAL SAVE, into the real file.
    await key(c, 's', 'KeyS', 83, 2);              // Ctrl+S
    await sleep(2500);
    const docAfterText = readFileSync(writablePath, 'utf8');
    const docAfter = JSON.parse(docAfterText);
    check('3c', 'Ctrl+S wrote it into editor_bg_override.json ON DISK — the file the ROM is '
      + 'built from',
      docAfterText !== docBefore && docAfter.layout[target.i] === expectWord,
      `on-disk layout[${target.i}] = 0x${(docAfter.layout[target.i] ?? 0).toString(16)}; `
      + `file ${docAfterText === docBefore ? 'UNCHANGED' : 'changed'} `
      + `(${docBefore.length} -> ${docAfterText.length} bytes)`);
    const changedCells = docAfter.layout
      .map((w, i) => (w === wDoc.layout[i] ? -1 : i)).filter((i) => i >= 0);
    check('3d', 'and it changed exactly the cell that was clicked, nothing else',
      JSON.stringify(changedCells) === JSON.stringify([target.i]),
      `cells that moved on disk: ${JSON.stringify(changedCells)}`);
    check('3e', 'the BG-LIBRARY binaries are byte-identical — the stroke did NOT go to the old '
      + 'target', sha(readFileSync(writableLib.layoutPath)) === libBefore.layout
      && sha(readFileSync(writableLib.tilesPath)) === libBefore.tiles,
      `${writableLib.id}: layout ${sha(readFileSync(writableLib.layoutPath)).slice(0, 12)} `
      + `(was ${libBefore.layout.slice(0, 12)})`);
    check('3e2', 'the ACT\'s own background binaries are byte-identical too — the stroke did not '
      + 'land on the act plane either',
      actBgPaths.every((p, k) => sha(readFileSync(p)) === actBgBefore[k]),
      actBgPaths.map((p, k) => `${p.split('/').pop()} ${sha(readFileSync(p)).slice(0, 12)} `
        + `(was ${actBgBefore[k].slice(0, 12)})`).join('; '));
    check('3f', 'the tiles and the bands are untouched — a layout paint is not a band edit',
      JSON.stringify(docAfter.tiles) === JSON.stringify(wDoc.tiles)
      && JSON.stringify(docAfter.anims ?? null) === JSON.stringify(wDoc.anims ?? null),
      `${docAfter.tiles.length} tiles, ${(docAfter.anims ?? []).length} bands`);

    // AND IT IS ONE UNDO STEP.
    await key(c, 'z', 'KeyZ', 90, 2);
    await sleep(600);
    const afterUndo = await c.evalExpr(`window.__dbg.aeon.bgOverrideLayoutAt(${target.i})`);
    check('3g', 'one Ctrl+Z takes the whole stroke back in the document',
      afterUndo === oldWord,
      `bgOverrideLayoutAt = ${afterUndo === null ? 'null' : '0x' + afterUndo.toString(16)}, `
      + `expected 0x${oldWord.toString(16)}`);
    // ...AND ON SCREEN. An undo that moved only the file reads as "Ctrl+Z did
    // nothing"; the mirror row in the node suite pins the mechanism, this one
    // pins the pixels.
    const undonePx = await c.json(
      `window.__bp.cellPixels(${target.col}, ${target.row}, ${VP.x}, ${VP.y}, ${VP.zoom}, ${CELL_PX})`);
    check('3h', 'and the CANVAS goes back with it',
      undonePx !== null && canonicalise(undonePx) === target.override,
      `screen shape after undo ${undonePx === null ? '(unread)' : canonicalise(undonePx).slice(0, 24)}`
      + ` vs the document's ${target.override.slice(0, 24)}`);
    await shot(c, '3-after-undo');

    // ══ PHASE 4 — THE REFUSAL IS LOUD ════════════════════════════════════════
    console.log('\n── PHASE 4: a tile the ROM-bound blob does not have ──');
    // The tile browser shows the ZONE TILESET, which is longer than the
    // override's blob. An index past the blob is not a tile: the consumer
    // rebases it into VRAM anyway, so it bakes cleanly and ships whatever sits
    // at that slot.
    const outside = docAfter.tiles.length + 5;
    await c.evalExpr(`window.__dbg.aeon.setSelectedTile(${outside}, ${paletteLine})`);
    const victim = candidates[1];
    const victimBefore = await c.evalExpr(`window.__dbg.aeon.bgOverrideLayoutAt(${victim.i})`);
    const pt2 = await pointForCell(c, victim.col, victim.row, VP);
    await mouse(c, 'mousePressed', pt2.x, pt2.y);
    await sleep(60);
    await mouse(c, 'mouseReleased', pt2.x, pt2.y, 0);
    await sleep(500);
    const victimAfter = await c.evalExpr(`window.__dbg.aeon.bgOverrideLayoutAt(${victim.i})`);
    check('4a', 'an out-of-blob tile paints NOTHING — the document is untouched',
      victimAfter === victimBefore,
      `layout[${victim.i}] ${victimBefore} -> ${victimAfter}`);
    const toasts = await c.json('window.__dbg.aeon.toasts()');
    const refusal = toasts.find((t) => /outside this background/.test(t.message));
    check('4b', 'and it SAYS SO on screen, naming the blob, the file and the fix — not a '
      + 'silent no-op', !!refusal && refusal.type === 'warning',
      refusal ? `${refusal.type}: ${refusal.message}` : `no refusal toast; saw ${JSON.stringify(toasts)}`);
    // The screen is the other half: a refusal must not paint either.
    const victimPx = await c.json(
      `window.__bp.cellPixels(${victim.col}, ${victim.row}, ${VP.x}, ${VP.y}, ${VP.zoom}, ${CELL_PX})`);
    check('4c', 'the canvas did not paint it either — refused, not "changed and lost"',
      victimPx !== null && canonicalise(victimPx) === victim.override,
      `screen shape ${victimPx === null ? '(unread)' : canonicalise(victimPx).slice(0, 24)} vs `
      + `the document's ${victim.override.slice(0, 24)}`);
    await shot(c, '4-refusal');
  } finally {
    if (c) c.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok === true).length;
  const noted = results.filter((r) => r.ok === null).length;
  console.log(`\n${passed}/${passed + fails.length} rows passed${noted ? `, ${noted} noted` : ''}`);
  if (fails.length) { console.log('FAILED:'); fails.forEach((f) => console.log(`  ${f}`)); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(2); });
