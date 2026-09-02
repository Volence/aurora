#!/usr/bin/env node
// DOES THE TILE PICKER SHOW THE ART A BG STROKE ACTUALLY WRITES?
//
// ROADMAP item 47. `ArtBrowser` showed `zone.tileset.tiles` — the FOREGROUND
// tileset, 919 tiles on the live tree — in BOTH layers, while `paintBgTile`
// packed that same index as a BLOB-LOCAL index into Plane B's tile blob (320
// tiles in the override document). So in BG mode an author saw one picture and
// painted another, and about two thirds of the picker's range did not name a
// background tile at all.
//
// ═══ WHY THE NODE SUITE CANNOT ANSWER THIS ═══
//
// ~4,600 vitest rows pass over this feature area while it is visibly broken:
// the picker is a virtualised CANVAS grid inside a React component, and node
// sees neither. The pure rules are pinned in
// src/renderer/providers/__tests__/tile-picker-source.test.ts; this file exists
// for the half that only the real app can answer — WHICH PIXELS ARE ON SCREEN,
// and where a click on them lands.
//
// So no row below asks the app whether it worked:
//
//   PIXELS   `getImageData` on `#art-browser-canvas`, compared against tile art
//            read OFF DISK IN NODE before the app exists — palette-free, via the
//            same canonical-shape trick as bg-override-paints-harness.mjs.
//   THE FILE `editor_bg_override.json` re-read from disk after a real Ctrl+S.
//   THE STORE `__dbg.aeon.selectedTile()` for what a real CLICK on the picker
//            selected — store state, not a component's claim about itself.
//   THE DOM  the count label, the hover label, and the refusal toast's text.
//
// ═══ THE ANTI-VACUOUS RULE, AND IT IS THE ROW THAT MATTERS ═══
//
// A pixel comparison between two tile arrays is worthless at any index where
// they happen to agree. Every slot these rows use is chosen IN NODE, BEFORE THE
// APP STARTS, for the property that the FG tileset and the BG blob give it
// DIFFERENT canonical shapes — and each phase asserts BOTH halves: the array it
// expects matches at every slot, AND the other array matches at none. A row that
// went green because the two arrays coincided would take the second half down
// with it.
//
// ═══ THE GEOMETRY IS CROSS-CHECKED, NOT ASSUMED ═══
//
// Reading "the cell for slot i" needs the grid's layout, and getting it wrong by
// one row would read a NEIGHBOUR's pixels — which could pass or fail for reasons
// that have nothing to do with the rule. So the pitch is read out of
// ArtBrowser.tsx's own source in node, and before any pixel row runs, the mouse
// is moved to each computed cell centre and the HOVER LABEL is required to name
// exactly that slot. If the mapping is off, that row goes red first and says so.
//
// ═══ THREE TREES, AND ONLY ONE OF THEM IS WRITTEN TO ═══
//
//   LIVE      /home/volence/sonic_hacks/aeon, opened READ-ONLY. Never saved.
//   WRITABLE  a hardlinked copy; the stroke rows save into this one.
//   (There is no third fixture here: the unbound/library path is covered by
//    bg-override-paints-harness.mjs and by the node rows, and duplicating it
//    would add runtime without adding a claim.)
//
// ⚠ Every file a fixture rewrites is UNLINKED first, so the hardlink breaks
// rather than the aeon tree being edited in place.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/bg-tile-picker-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9401);
const ROOT = AURORA_DIR;
const AEON = siblingPathOrUnresolved('aeon');
// node_modules may live above ROOT (a git worktree under the checkout resolves
// its dependencies from the parent tree), so this WALKS UP rather than assuming.
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const SHOTS = `${ROOT}/scratchpad/shots-bg-tile-picker`;
mkdirSync(SHOTS, { recursive: true });

// ── EVERY CONSTANT IS READ OUT OF THE REPO, NOT TYPED ────────────────────────
const CONTRACT = JSON.parse(readFileSync(
  join(ROOT, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));
const TILE_PIXELS = CONTRACT.constants.TILE_PIXELS.value;
const TILE_BYTES = CONTRACT.constants.TILE_BYTES.value;
const TILE_W = CONTRACT.constants.TILE_WIDTH_PX.value;
const IDX_MASK = CONTRACT.constants.LAYOUT_TILE_INDEX_MASK.value;
const OVERRIDE_REL = CONTRACT.path;

const BG_WIDTH = (() => {
  const src = readFileSync(join(ROOT, 'src/core/formats/bg-tiles.ts'), 'utf8');
  const m = /export const BG_WIDTH = (\d+);/.exec(src);
  if (!m) throw new Error('could not read BG_WIDTH out of src/core/formats/bg-tiles.ts');
  return Number(m[1]);
})();

/** The picker's grid geometry, read out of the component's OWN source. */
const GRID = (() => {
  const src = readFileSync(join(ROOT, 'src/renderer/components/ArtBrowser.tsx'), 'utf8');
  const m = /const itemSize = (\d+);/.exec(src);
  if (!m) throw new Error('could not read itemSize out of ArtBrowser.tsx');
  const gaps = [...src.matchAll(/itemSize \+ (\d+)/g)].map((g) => Number(g[1]));
  if (gaps.length === 0 || new Set(gaps).size !== 1) {
    throw new Error(`ArtBrowser's cell gap is not one consistent number: ${JSON.stringify(gaps)}`);
  }
  const itemSize = Number(m[1]);
  return { itemSize, pitch: itemSize + gaps[0], scale: itemSize / TILE_W };
})();

const NT_PAL_SHIFT = (() => {
  const src = readFileSync(join(ROOT, 'src/core/model/s4-types.ts'), 'utf8');
  const m = /palette: \(word >> (\d+)\) & 0x3/.exec(src);
  if (!m) throw new Error('could not read the nametable palette shift');
  return Number(m[1]);
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CDP plumbing (same shape as bg-override-paints-harness.mjs) ──────────────
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
  console.log(`        shot → scratchpad/shots-bg-tile-picker/${name}.png`);
}

// ── READING BOTH TILE ARRAYS OFF DISK ────────────────────────────────────────
/** `core/formats/tiles.ts parseTiles`: headerless 4bpp, 32 bytes per tile. */
function parseTiles(buf) {
  const out = [];
  for (let t = 0; t + TILE_BYTES <= buf.length; t += TILE_BYTES) {
    const px = [];
    for (let b = 0; b < TILE_BYTES; b++) { const v = buf[t + b]; px.push(v >> 4, v & 0xF); }
    out.push(px);
  }
  return out;
}
/** The zone's FOREGROUND tileset, at the path project.json itself names. */
function readFgTileset(tree) {
  const cfg = JSON.parse(readFileSync(join(tree, 'project.json'), 'utf8'));
  const rel = cfg.zones[0].tileset;
  return { path: join(tree, rel), tiles: parseTiles(readFileSync(join(tree, rel))) };
}
const readOverride = (tree) => JSON.parse(readFileSync(join(tree, OVERRIDE_REL), 'utf8'));

/** Replace each value by the order of its first appearance — the palette-free
 *  comparison a screen cell and a document tile can be made on. */
function canonicalise(values) {
  const seen = new Map();
  let out = '';
  for (const v of values) {
    if (!seen.has(v)) seen.set(v, seen.size);
    out += seen.get(v).toString(36);
  }
  return out;
}

// ── FIXTURES ─────────────────────────────────────────────────────────────────
function hardlinkCopy(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync('cp', ['-al', AEON, dest]);
  return dest;
}
function write(path, bytes) {
  if (existsSync(path)) unlinkSync(path);   // break the hardlink, never edit through it
  writeFileSync(path, bytes);
}

// ── THE PROBE, installed from outside ────────────────────────────────────────
//
// It knows the grid pitch (passed in from node, read out of the component's
// source) and NOTHING about which array the component chose — that is the thing
// under test.
const PROBE = (pitch, itemSize, scale) => String.raw`
(() => {
  const cv = document.getElementById('art-browser-canvas');
  if (!cv) return 'no-picker-canvas';
  cv.scrollIntoView({ block: 'center' });
  const PITCH = ${pitch}, ITEM = ${itemSize}, SCALE = ${scale};
  window.__pk = {
    cols: () => Math.max(1, Math.floor(cv.width / PITCH)),
    size: () => ({ w: cv.width, h: cv.height, rect: cv.getBoundingClientRect().toJSON() }),
    /** The 8x8 art drawn in slot i, downsampled out of its 2x thumbnail. */
    slotPixels(i) {
      const cols = Math.max(1, Math.floor(cv.width / PITCH));
      const x = (i % cols) * PITCH, y = Math.floor(i / cols) * PITCH;
      if (x < 0 || y < 0 || x + ITEM > cv.width || y + ITEM > cv.height) return null;
      const g = cv.getContext('2d', { willReadFrequently: true });
      const d = g.getImageData(x, y, ITEM, ITEM).data;
      const out = [];
      for (let py = 0; py < ITEM / SCALE; py++) {
        for (let px = 0; px < ITEM / SCALE; px++) {
          const o = ((py * SCALE) * ITEM + px * SCALE) * 4;
          out.push(((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0);
        }
      }
      return out;
    },
    /** Client coords of slot i's CENTRE, in the component's own arithmetic
     *  (it hit-tests with clientX - rect.left against canvas.width columns). */
    point(i) {
      const cols = Math.max(1, Math.floor(cv.width / PITCH));
      const b = cv.getBoundingClientRect();
      return { x: Math.round(b.left + (i % cols) * PITCH + ITEM / 2),
               y: Math.round(b.top + Math.floor(i / cols) * PITCH + ITEM / 2) };
    },
  };
  return 'installed';
})()`;

/** The two labels, straight out of the DOM around the picker canvas. */
const LABELS = String.raw`
(() => {
  const cv = document.getElementById('art-browser-canvas');
  if (!cv) return { count: null, hover: null };
  const panel = cv.closest('div').parentElement;      // canvasWrap -> container
  const spans = [...panel.querySelectorAll('span')].map((s) => s.textContent);
  return { count: spans[0] ?? null, hover: spans[1] ?? null };
})()`;

async function mouse(c, type, x, y, buttons) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: buttons ?? (type === 'mouseMoved' || type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const VP = { x: 0, y: 0, zoom: 1 };

  console.log('\nREADING BOTH TILE ARRAYS OFF DISK (node, before the app exists)…');
  const fg = readFgTileset(AEON);
  const liveDoc = readOverride(AEON);
  console.log(`  FG tileset  ${fg.path.split('/').pop()}: ${fg.tiles.length} tiles`);
  console.log(`  BG override ${OVERRIDE_REL.split('/').pop()}: ${liveDoc.tiles.length} tiles, `
    + `${liveDoc.layout.length} layout words`);
  if (fg.tiles.length === liveDoc.tiles.length) {
    console.log('  ⚠ the two arrays are the same LENGTH on this tree — the rows below still '
      + 'discriminate, because they compare SHAPES per slot, not counts.');
  }

  // THE SLOTS EVERY PIXEL ROW USES. Chosen for four properties, all CHECKED
  // here rather than hoped for:
  //   • the FG tileset and the BG blob give the slot DIFFERENT canonical shapes
  //     (so a row can tell the two arrays apart AT ALL);
  //   • both shapes use >= 3 distinct values (a two-value cell is a weak
  //     fingerprint and collides easily);
  //   • neither tile contains pixel value 0, which the rasterizer leaves
  //     transparent — so every sampled pixel is an opaque palette colour rather
  //     than the panel's backdrop showing through;
  //   • the slot is on the FIRST screenful of the picker (no scroll).
  const MAX_SLOT = 60;
  const slots = [];
  for (let i = 0; i < Math.min(MAX_SLOT, fg.tiles.length, liveDoc.tiles.length); i++) {
    const f = fg.tiles[i], b = liveDoc.tiles[i];
    if (f.includes(0) || b.includes(0)) continue;
    if (new Set(f).size < 3 || new Set(b).size < 3) continue;
    const fs = canonicalise(f), bs = canonicalise(b);
    if (fs === bs) continue;
    slots.push({ i, fg: fs, bg: bs });
  }
  console.log(`  ${slots.length} discriminating slots found in the first ${MAX_SLOT}`);
  if (slots.length < 5) {
    throw new Error(`fewer than 5 slots where the two arrays differ in SHAPE among the first `
      + `${MAX_SLOT} — the pixel rows would not discriminate. Re-derive the selection rather `
      + 'than loosening it.');
  }
  const USE = slots.slice(0, 8);
  console.log(`  using slots ${USE.map((s) => s.i).join(',')}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);

  console.log('\nBUILDING THE WRITABLE FIXTURE (hardlinked; the aeon tree is never edited)…');
  const WRITABLE = join(ROOT, 'scratchpad/fixtures/aeon-bg-picker-writable');
  hardlinkCopy(WRITABLE);
  const writablePath = join(WRITABLE, OVERRIDE_REL);
  write(writablePath, readFileSync(join(AEON, OVERRIDE_REL)));  // a real file, not a hardlink
  console.log(`  writable: ${WRITABLE}`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
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
      return st;
    }
    const setLayer = async (l) => {
      await c.evalExpr(`window.__dbg.aeon.setLayer('${l}')`);
      await sleep(500);
      const installed = await c.evalExpr(PROBE(GRID.pitch, GRID.itemSize, GRID.scale));
      if (installed !== 'installed') throw new Error(`picker probe: ${installed}`);
      await sleep(250);
    };
    const labels = () => c.json(LABELS);
    async function slotShapes(list) {
      const out = [];
      for (const s of list) {
        const px = await c.json(`window.__pk.slotPixels(${s.i})`);
        out.push(px === null ? null : { i: s.i, shape: canonicalise(px), distinct: new Set(px).size });
      }
      return out;
    }
    /** Move the real mouse to slot i's centre and read what the picker says. */
    async function hoverSlot(i) {
      const p = await c.json(`window.__pk.point(${i})`);
      // Two moves: the hover handler early-returns when the index has not
      // changed, so a single move onto a slot already hovered reports nothing.
      await mouse(c, 'mouseMoved', p.x, p.y + 1000);
      await sleep(30);
      await mouse(c, 'mouseMoved', p.x, p.y);
      await sleep(60);
      return (await labels()).hover;
    }

    // ══ PHASE 1 — BG MODE ON THE LIVE PROJECT (read-only) ════════════════════
    console.log('\n── PHASE 1: BG mode on the LIVE aeon tree (read-only, never saved) ──');
    const liveState = await openTree(AEON, 'the live aeon project');
    check('1a', 'the live aeon project is open, with sections [precondition]',
      liveState.sections > 0, JSON.stringify(liveState));
    await setLayer('bg');
    const size = await c.json('window.__pk.size()');
    const cols = await c.evalExpr('window.__pk.cols()');
    check('1b', 'the picker canvas is drawn and big enough to hold the chosen slots '
      + '[precondition]',
      size.w > 0 && size.h > 0 && Math.ceil((USE.at(-1).i + 1) / cols) * GRID.pitch <= size.h,
      `canvas ${size.w}x${size.h}, ${cols} cols, pitch ${GRID.pitch}; highest slot `
      + `${USE.at(-1).i} needs ${Math.ceil((USE.at(-1).i + 1) / cols) * GRID.pitch}px`);
    await shot(c, '1-bg-picker');

    // THE GEOMETRY CROSS-CHECK. Every pixel row below reads a rectangle this
    // harness computed; if that mapping is off by a cell, the rows would be
    // measuring a neighbour. The component's own hover readout is asked to name
    // the slot, and it must name exactly the one we aimed at.
    //
    // TWO SEPARATE QUESTIONS, TWO SEPARATE ROWS. "Did I aim at the right cell?"
    // is the precondition every pixel row depends on; "does the label name the
    // right SPACE?" is a rule in its own right. Fused, a wording regression
    // would abort the run as if the geometry had broken.
    const hovers = [];
    for (const s of USE) hovers.push({ i: s.i, label: await hoverSlot(s.i) });
    const labelIndex = (t) => { const m = /#(\d+)/.exec(t ?? ''); return m ? Number(m[1]) : null; };
    const aimed = hovers.every((h) => labelIndex(h.label) === h.i);
    check('1c', 'the mouse lands on the slot this harness thinks it does [geometry precondition '
      + 'for every pixel row]', aimed,
      hovers.map((h) => `${h.i}→${JSON.stringify(h.label)}`).join(' '));
    if (!aimed) {
      throw new Error('the slot→rectangle mapping is wrong; every pixel row below would be '
        + 'reading the wrong cell');
    }
    const wanted = (i) => `bg #${i} (0x${i.toString(16).toUpperCase()})`;
    check('1c2', 'and the BG hover label names the index in BLOB-LOCAL terms, not as a zone '
      + 'tile index', hovers.every((h) => h.label === wanted(h.i)),
      hovers.map((h) => JSON.stringify(h.label)).join(' '));

    const bgShapes = await slotShapes(USE);
    const readOk = bgShapes.filter((s) => s !== null);
    check('1d', 'the probe read every chosen slot, and none of them is a flat block '
      + '[anti-vacuous precondition]',
      readOk.length === USE.length && readOk.every((s) => s.distinct >= 3),
      `${readOk.length}/${USE.length} slots read; distinct colours per slot: `
      + readOk.map((s) => s.distinct).join(','));
    if (readOk.length !== USE.length) {
      throw new Error('the probe read no pixels at some slots — the rows below would be vacuous');
    }

    // THE ROW. Compared against the OVERRIDE DOCUMENT'S OWN TILES, read off disk
    // before the app existed.
    const bgMatchBlob = bgShapes.filter((s, k) => s.shape === USE[k].bg).length;
    const bgMatchFg = bgShapes.filter((s, k) => s.shape === USE[k].fg).length;
    check('1e', `in BG mode the picker draws the RESOLVED BLOB's art at all ${USE.length} `
      + 'discriminating slots', bgMatchBlob === USE.length,
      `${bgMatchBlob}/${USE.length} slots match editor_bg_override.json's own tiles `
      + `(${liveDoc.tiles.length} of them)`);
    check('1f', 'and NOT the zone TILESET\'s — which is what it used to draw',
      bgMatchFg === 0,
      `${bgMatchFg}/${USE.length} slots match ${fg.path.split('/').pop()} `
      + `(${fg.tiles.length} tiles)`);

    const bgLabels = await labels();
    check('1g', 'the count row says how many BACKGROUND tiles there are, and the number is the '
      + 'blob\'s', bgLabels.count === `${liveDoc.tiles.length} background tiles`,
      `count label ${JSON.stringify(bgLabels.count)}; the document on disk has `
      + `${liveDoc.tiles.length} tiles (the tileset has ${fg.tiles.length})`);

    const src = await c.evalExpr('window.__dbg.aeon.bgSource()');
    note('1h', 'the resolver agrees with the pixels (reported, not relied on)',
      `bgSource() = ${JSON.stringify(src)} — rows 1e/1f are the evidence; this line only makes a `
      + 'disagreement between the two legible.');

    // ══ PHASE 2 — FG MODE IS UNREGRESSED ═════════════════════════════════════
    console.log('\n── PHASE 2: the FG path, on the same tree ──');
    await setLayer('fg');
    await shot(c, '2-fg-picker');
    const fgHovers = [];
    for (const s of USE) fgHovers.push({ i: s.i, label: await hoverSlot(s.i) });
    const fgWanted = (i) => `#${i} (0x${i.toString(16).toUpperCase()})`;
    const fgAimed = fgHovers.every((h) => labelIndex(h.label) === h.i);
    check('2a', 'the mouse still lands on the slot aimed at in FG mode [geometry precondition]',
      fgAimed, fgHovers.map((h) => `${h.i}→${JSON.stringify(h.label)}`).join(' '));
    if (!fgAimed) throw new Error('FG slot→rectangle mapping is wrong');
    check('2a2', 'the FG hover label is a plain zone tile index — no blob prefix',
      fgHovers.every((h) => h.label === fgWanted(h.i)),
      fgHovers.map((h) => JSON.stringify(h.label)).join(' '));
    const fgShapes = await slotShapes(USE);
    const fgOk = fgShapes.filter((s) => s !== null);
    check('2b', 'the probe read every chosen slot in FG mode too [anti-vacuous]',
      fgOk.length === USE.length && fgOk.every((s) => s.distinct >= 3),
      `${fgOk.length}/${USE.length} slots read`);
    const fgMatchFg = fgShapes.filter((s, k) => s && s.shape === USE[k].fg).length;
    const fgMatchBlob = fgShapes.filter((s, k) => s && s.shape === USE[k].bg).length;
    check('2c', 'in FG mode the picker draws the ZONE TILESET, unchanged',
      fgMatchFg === USE.length,
      `${fgMatchFg}/${USE.length} slots match ${fg.path.split('/').pop()}`);
    check('2d', 'and the background blob does not leak into it', fgMatchBlob === 0,
      `${fgMatchBlob}/${USE.length} slots match the override document`);
    const fgLabels = await labels();
    check('2e', 'the FG count row is the tileset\'s, in the tileset\'s words',
      fgLabels.count === `${fg.tiles.length} tiles`,
      `count label ${JSON.stringify(fgLabels.count)}; ${fg.path.split('/').pop()} holds `
      + `${fg.tiles.length} tiles`);

    // ══ PHASE 3 — ONE PICK PER LAYER ═════════════════════════════════════════
    console.log('\n── PHASE 3: switching layers does not move the author\'s pick ──');
    const A = USE[0].i, B = USE[3].i;
    check('3a', 'the two slots this phase uses are different numbers [anti-vacuous]', A !== B,
      `A=${A} B=${B}`);
    const clickSlot = async (i) => {
      const p = await c.json(`window.__pk.point(${i})`);
      await mouse(c, 'mousePressed', p.x, p.y);
      await sleep(50);
      await mouse(c, 'mouseReleased', p.x, p.y, 0);
      await sleep(250);
    };
    await clickSlot(A);
    const afterFgClick = await c.json('window.__dbg.aeon.selectedTile()');
    check('3b', 'a real click on the picker in FG mode selects that zone tile',
      afterFgClick.layer === 'fg' && afterFgClick.fg === A, JSON.stringify(afterFgClick));
    await setLayer('bg');
    const onSwitch = await c.json('window.__dbg.aeon.selectedTile()');
    check('3c', 'switching to BG does NOT carry the foreground index across — and does not '
      + 'silently move it either',
      onSwitch.layer === 'bg' && onSwitch.bg !== A && onSwitch.fg === A,
      `${JSON.stringify(onSwitch)} — the BG pick is its own value, and the FG pick survived`);
    await clickSlot(B);
    const afterBgClick = await c.json('window.__dbg.aeon.selectedTile()');
    check('3d', 'a real click in BG mode selects a BLOB slot, leaving the FG pick alone',
      afterBgClick.bg === B && afterBgClick.fg === A, JSON.stringify(afterBgClick));
    await setLayer('fg');
    const backToFg = await c.json('window.__dbg.aeon.selectedTile()');
    check('3e', 'and switching back restores the foreground pick untouched',
      backToFg.layer === 'fg' && backToFg.fg === A && backToFg.bg === B,
      JSON.stringify(backToFg));

    // ══ PHASE 4 — THE PICK REACHES THE FILE THE ROM IS BUILT FROM ════════════
    console.log('\n── PHASE 4: pick in the picker, stroke the map, read the FILE back ──');
    await openTree(WRITABLE, 'the writable fixture');
    const wDoc = readOverride(WRITABLE);
    const docBefore = readFileSync(writablePath, 'utf8');

    // Arm the FOREGROUND pick with a DIFFERENT, in-range index first. The old
    // behaviour wrote `selectedTileIndex` — the FG pick — so if that ever comes
    // back, the word on disk is this number instead of the one clicked, and row
    // 4d says which it got.
    await setLayer('fg');
    const decoyFg = (USE[1].i + 1 < wDoc.tiles.length) ? USE[1].i + 1 : 1;
    await c.evalExpr(`window.__dbg.aeon.setSelectedTile(${decoyFg})`);
    await setLayer('bg');
    const pickSlot = USE[5].i;
    check('4a', 'the decoy foreground pick and the background pick are different, in-range '
      + 'numbers [anti-vacuous]',
      decoyFg !== pickSlot && decoyFg < wDoc.tiles.length && pickSlot < wDoc.tiles.length,
      `fg decoy ${decoyFg}, bg pick ${pickSlot}, blob ${wDoc.tiles.length} tiles`);
    await clickSlot(pickSlot);
    const armed = await c.json('window.__dbg.aeon.selectedTile()');
    const tool = (await c.json('window.__dbg.aeon.state()')).tool;
    check('4b', 'clicking the picker armed the paint-tile tool with that BLOB slot',
      armed.bg === pickSlot && armed.fg === decoyFg && tool === 'paint-tile',
      `${JSON.stringify(armed)}, tool ${tool}`);

    await c.evalExpr(`window.__dbg.setView(${VP.x}, ${VP.y}, ${VP.zoom})`);
    await sleep(400);
    // A background cell whose current word is not already what we are about to
    // write, so a no-op would be visible as a failure rather than a pass.
    const paletteLine = 0;
    const expectWord = (pickSlot & IDX_MASK) | ((paletteLine & 0x3) << NT_PAL_SHIFT);
    let target = -1;
    for (let i = 0; i < wDoc.layout.length; i++) {
      const col = i % BG_WIDTH, row = Math.floor(i / BG_WIDTH);
      if (row > 20 || col > 30) continue;
      if (wDoc.layout[i] !== expectWord) { target = i; break; }
    }
    check('4c', 'a target background cell exists that does not ALREADY hold the word this '
      + 'stroke writes [anti-vacuous]', target >= 0,
      `cell ${target} holds 0x${(wDoc.layout[target] ?? 0).toString(16)}, `
      + `stroke will write 0x${expectWord.toString(16)}`);
    await c.evalExpr(`window.__dbg.aeon.setSelectedTile(${pickSlot}, ${paletteLine})`);
    const pt = await c.json(String.raw`(() => {
      const cv = document.getElementById('map-canvas');
      const b = cv.getBoundingClientRect();
      return { x: Math.round(b.left + (${target % BG_WIDTH} * ${TILE_W} - ${VP.x}) * ${VP.zoom} + 4),
               y: Math.round(b.top + (${Math.floor(target / BG_WIDTH)} * ${TILE_W} - ${VP.y}) * ${VP.zoom} + 4) };
    })()`);
    await mouse(c, 'mousePressed', pt.x, pt.y);
    await sleep(60);
    await mouse(c, 'mouseReleased', pt.x, pt.y, 0);
    await sleep(500);
    await key(c, 's', 'KeyS', 83, 2);              // Ctrl+S
    await sleep(2500);

    const docAfterText = readFileSync(writablePath, 'utf8');
    const docAfter = JSON.parse(docAfterText);
    const wrote = docAfter.layout[target];
    check('4d', 'the file the ROM is built from now holds THE TILE THAT WAS PICKED IN THE '
      + 'PICKER — not the foreground index',
      docAfterText !== docBefore && wrote === expectWord,
      `on-disk layout[${target}] = 0x${(wrote ?? 0).toString(16)} (tile `
      + `${(wrote ?? 0) & IDX_MASK}); picked ${pickSlot}, fg decoy was ${decoyFg}; file `
      + `${docAfterText === docBefore ? 'UNCHANGED' : 'changed'}`);
    const moved = docAfter.layout.map((w, i) => (w === wDoc.layout[i] ? -1 : i)).filter((i) => i >= 0);
    check('4e', 'and it changed exactly the cell that was clicked, nothing else',
      JSON.stringify(moved) === JSON.stringify([target]),
      `cells that moved on disk: ${JSON.stringify(moved)}`);
    check('4f', 'the tile blob itself is untouched — picking from it is not editing it',
      JSON.stringify(docAfter.tiles) === JSON.stringify(wDoc.tiles),
      `${docAfter.tiles.length} tiles on disk, ${wDoc.tiles.length} before`);
    await shot(c, '4-after-stroke');

    // ══ PHASE 5 — THE REFUSAL IS STILL THERE ═════════════════════════════════
    console.log('\n── PHASE 5: the guard the picker can no longer trip is still armed ──');
    // The picker cannot offer an out-of-blob index any more, but a pick survives
    // a blob that shrinks under it and __dbg arms one directly. This row exists
    // because item 47 must not have quietly deleted the last line of defence.
    const outside = docAfter.tiles.length + 5;
    await c.evalExpr(`window.__dbg.aeon.setSelectedTile(${outside}, ${paletteLine})`);
    const victim = target + 1;
    const victimBefore = await c.evalExpr(`window.__dbg.aeon.bgAt(${victim})`);
    const pt2 = await c.json(String.raw`(() => {
      const cv = document.getElementById('map-canvas');
      const b = cv.getBoundingClientRect();
      return { x: Math.round(b.left + (${victim % BG_WIDTH} * ${TILE_W} - ${VP.x}) * ${VP.zoom} + 4),
               y: Math.round(b.top + (${Math.floor(victim / BG_WIDTH)} * ${TILE_W} - ${VP.y}) * ${VP.zoom} + 4) };
    })()`);
    await mouse(c, 'mousePressed', pt2.x, pt2.y);
    await sleep(60);
    await mouse(c, 'mouseReleased', pt2.x, pt2.y, 0);
    await sleep(500);
    const victimAfter = await c.evalExpr(`window.__dbg.aeon.bgAt(${victim})`);
    check('5a', 'an out-of-blob index still paints NOTHING', victimAfter === victimBefore,
      `layout[${victim}] ${victimBefore} -> ${victimAfter}`);
    const toasts = await c.json('window.__dbg.aeon.toasts()');
    // Matched on wording ONLY this refusal uses — a phrase two errors could
    // share would make this row green for the wrong reason.
    const refusal = toasts.find((t) => /outside this background/.test(t.message));
    check('5b', 'and it still SAYS SO, in wording that no longer claims the browser is showing '
      + 'the zone tileset',
      !!refusal && refusal.type === 'warning' && !/zone TILESET/.test(refusal.message)
      && new RegExp(`${docAfter.tiles.length} tiles`).test(refusal.message),
      refusal ? `${refusal.type}: ${refusal.message}` : `no refusal toast; saw ${JSON.stringify(toasts)}`);
    await shot(c, '5-refusal');
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
