#!/usr/bin/env node
// DOES PAINTING A TILE DESTROY THE ATTRIBUTES THE AUTHOR NEVER TOUCHED?
//
// The owner, having just been given the priority lens: "Is there a way to draw
// the higher priority and such?" The answer was no — and looking for it turned
// up something worse. `packNametableWord` carries FIVE fields:
//
//     tileIndex 0..10 | hFlip 11 | vFlip 12 | palette 13..14 | priority 15
//
// and every interactive paint site in MapViewport wrote only TWO of them:
//
//     (selectedTileIndex & 0x7FF) | ((selectedPaletteLine & 0x3) << 13)
//
// So a stroke over a high-priority tile SILENTLY DROPPED IT BEHIND SONIC, and a
// stroke over a flipped tile un-flipped it. Invisible until today, because
// until today nothing in this engine could show priority at all.
//
// The ~5,200-row node suite cannot see React, a canvas, or a mouse gesture.
// Every defect the owner reported today shipped green through it. So this file
// drives the REAL app: the REAL aeon project, the REAL paint tool armed by its
// REAL hotkey, a REAL mouse press on the REAL map canvas, and then reads the
// nametable word back out of the document.
//
// ═══ THE ANTI-VACUOUS RULE THIS WHOLE FILE IS BUILT AROUND ═══
//
// A row that paints onto a cell whose attributes are ALREADY ZERO emits the
// same word whether the fix works or not. `0` preserved and `0` truncated are
// the same sixteen bits. Such a row is not a measurement, it is a coin that
// always lands heads.
//
// So EVERY preservation row here paints onto a destination whose attribute bits
// are NON-ZERO, and says so out loud: section 0 of Oracle Jungle Zone act 1
// holds 1,865 priority cells, 954 hFlipped and 2,800 vFlipped. The harness
// FINDS them live through `ntRect` (§FIXTURES) rather than authoring them — a
// constructed fixture proves the code path, a real cell proves the bug — and it
// PRINTS the word it found and DIES if the search comes up empty.
//
// ═══ THE BIT POSITIONS ARE DERIVED, NEVER TYPED ═══
//
// A hard-coded `0x8000` in this file would be exactly the copied-pin defect
// this repo keeps paying for: move the priority bit and the pin stays green
// while measuring the wrong bit. §BITS parses the field expressions straight
// out of `packNametableWord`'s own body in src/core/model/s4-types.ts, then
// self-checks that the five fields it recovered are pairwise disjoint and
// together cover exactly 0xFFFF. If the function's shape changes it THROWS
// rather than falling back to a guess — a check that cannot locate its own
// subject must not run.
//
// ═══ THE dpr TRAP ═══
//
// `devicePixelRatio` varies run-to-run under Xvfb here (observed 1 and 1.35 in
// one session). At 1.35 `getBoundingClientRect()` is fractional, CDP delivers
// the nearest integer, and the off-by-one presents as a bug in the feature when
// the feature is fine.
//
// This harness DOES send mouse coordinates — it must, because three of the four
// defective sites are only reachable through a real press and a real drag. So
// it defends explicitly:
//
//   • row [aim] prints dpr, the canvas rect and `canvas.width`, and asserts
//     `canvas.width === Math.floor(rect.width)` — the app's own contract
//     (MapViewport sets `canvas.width = rect.width`, CSS px, never × dpr);
//   • every aim is computed from `view()` READ BACK OFF THE STORE, through the
//     app's own transform `canvasX = (worldX - view.x) * view.zoom`, and is
//     ROUNDED TO AN INTEGER before it is sent;
//   • every aim is then VERIFIED: the harness re-derives which cell that
//     integer lands in and refuses to proceed unless it is the cell it meant.
//     An off-by-one becomes a loud refusal here, never a red feature row.
//
// ⚠ IT WRITES NOTHING TO DISK. No Ctrl+S, no save call; the app has no autosave
// (shell/close-guard.ts says so). Every paint is undone before exit and the
// words are asserted back to what they were.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:tile-attributes
//                     (or) node scratchpad/tile-attribute-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9411);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch instead.
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-tile-attributes`;
mkdirSync(SHOTS, { recursive: true });

// ── §BITS — the nametable field layout, READ OUT OF THE APP'S OWN SOURCE ────
//
// Not typed here, for the reason in the header. This parses the five field
// expressions out of `packNametableWord`'s body and rebuilds the masks from the
// shifts the function itself uses.
const TYPES_SRC = `${ROOT}/src/core/model/s4-types.ts`;
function nametableFields() {
  const src = readFileSync(TYPES_SRC, 'utf8');
  const body = /export function packNametableWord\([\s\S]*?\n\}/.exec(src)?.[0];
  if (!body) throw new Error(`could not find packNametableWord in ${TYPES_SRC}`);
  const mIdx = /\(\s*tileIndex\s*&\s*(0x[0-9A-Fa-f]+)\s*\)/.exec(body);
  const mHf = /\(\s*\(\s*hFlip\s*\?\s*1\s*:\s*0\s*\)\s*<<\s*(\d+)\s*\)/.exec(body);
  const mVf = /\(\s*\(\s*vFlip\s*\?\s*1\s*:\s*0\s*\)\s*<<\s*(\d+)\s*\)/.exec(body);
  const mPal = /\(\s*\(\s*palette\s*&\s*(0x[0-9A-Fa-f]+)\s*\)\s*<<\s*(\d+)\s*\)/.exec(body);
  const mPri = /\(\s*\(\s*priority\s*\?\s*1\s*:\s*0\s*\)\s*<<\s*(\d+)\s*\)/.exec(body);
  if (!mIdx || !mHf || !mVf || !mPal || !mPri) {
    throw new Error(
      'packNametableWord no longer has the five-field shape this harness derives from. '
      + 'REFUSING TO GUESS bit positions — fix the derivation, do not type a literal.');
  }
  const f = {
    TILE: Number(mIdx[1]),
    HF: 1 << Number(mHf[1]),
    VF: 1 << Number(mVf[1]),
    PAL: Number(mPal[1]) << Number(mPal[2]),
    PAL_SHIFT: Number(mPal[2]),
    PRI: 1 << Number(mPri[1]),
  };
  // SELF-CHECK on the derivation, not on the app: five disjoint fields that
  // together cover exactly one 16-bit word. A regex that matched the wrong
  // group would almost certainly break one of these.
  const parts = [f.TILE, f.HF, f.VF, f.PAL, f.PRI];
  let union = 0;
  for (const p of parts) {
    if (union & p) throw new Error(`derived fields overlap: ${parts.map((x) => x.toString(16))}`);
    union |= p;
  }
  if (union !== 0xFFFF) {
    throw new Error(`derived fields cover 0x${union.toString(16)}, not 0xFFFF`);
  }
  return f;
}
const F = nametableFields();
/** The attribute bits — everything the paint tool is NOT supposed to be
 *  authoring when the brush does not say so. Derived, like everything else. */
const ATTR = F.HF | F.VF | F.PRI;
const hex = (w) => (w === null || w === undefined ? 'null' : `0x${(w >>> 0).toString(16).padStart(4, '0')}`);
const describe = (w) => (w === null || w === undefined ? 'null' : `${hex(w)} [tile=${w & F.TILE}`
  + ` pal=${(w & F.PAL) >> F.PAL_SHIFT}${w & F.PRI ? ' PRI' : ''}${w & F.HF ? ' HF' : ''}${w & F.VF ? ' VF' : ''}]`);

// ── the project's own geometry, read out of the app's constants ────────────
function sectionTilesWide() {
  const src = readFileSync(TYPES_SRC, 'utf8');
  const m = /export const SECTION_TILES_WIDE\s*=\s*(\d+)/.exec(src);
  if (!m) throw new Error(`could not read SECTION_TILES_WIDE out of ${TYPES_SRC}`);
  return Number(m[1]);
}
const STW = sectionTilesWide();
/** A VDP pattern is 8x8 and a nametable word is one. */
const TILE_PX = 8;
/** One 8px tile becomes 32 canvas px, so the tile CENTRE is 16px clear of the
 *  cell boundary — an off-by-one in the aim cannot silently hit a neighbour. */
const ZOOM = 4;

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
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
/** LOUD ON UNMEASURABLE: a subject that could not be found is not a pass. */
function unmeasurable(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: false });
  fails.push(`[${id}] ${name} (UNMEASURABLE: ${why})`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-tile-attributes/${name}.png`);
}

// ── real input ─────────────────────────────────────────────────────────────
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

const setView = (c, x, y, zoom) => c.evalExpr(`window.__dbg.setView(${x}, ${y}, ${zoom})`);
const view = (c) => c.json('window.__dbg.view()');
const ntAt = (c, s, i) => c.evalExpr(`window.__dbg.aeon.ntAt(${s}, ${i})`);
const ntRect = (c, s, col, row, w, h) => c.json(`window.__dbg.aeon.ntRect(${s}, ${col}, ${row}, ${w}, ${h})`);

/**
 * THE AIM, and the thing that makes it trustworthy.
 *
 * `canvasX = (worldX - view.x) * view.zoom` is the app's OWN transform
 * (MapViewport's `scale(zoom); translate(-vpX,-vpY)`), and `view` is read back
 * off the store rather than assumed. The result is rounded to an integer BEFORE
 * it is sent, then the cell that integer actually lands in is re-derived and
 * compared with the cell we meant. A dpr-induced off-by-one becomes a thrown
 * refusal here instead of a red row about priority.
 */
async function aimAtCell(c, col, row, sectionOriginPx = { x: 0, y: 0 }) {
  const vp = await view(c);
  const rect = await c.json(String.raw`(() => {
    const b = document.getElementById('map-canvas').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  })()`);
  const worldX = sectionOriginPx.x + col * TILE_PX + TILE_PX / 2;
  const worldY = sectionOriginPx.y + row * TILE_PX + TILE_PX / 2;
  const x = Math.round(rect.left + (worldX - vp.x) * vp.zoom);
  const y = Math.round(rect.top + (worldY - vp.y) * vp.zoom);
  // VERIFY: invert the app's transform on the integer we are about to send.
  const backWorldX = (x - rect.left) / vp.zoom + vp.x;
  const backWorldY = (y - rect.top) / vp.zoom + vp.y;
  const landsCol = Math.floor((backWorldX - sectionOriginPx.x) / TILE_PX);
  const landsRow = Math.floor((backWorldY - sectionOriginPx.y) / TILE_PX);
  if (landsCol !== col || landsRow !== row) {
    throw new Error(
      `AIM REFUSED: meant cell (${col},${row}), integer (${x},${y}) lands in (${landsCol},${landsRow}). `
      + `vp=${JSON.stringify(vp)} rect=${JSON.stringify(rect)}`);
  }
  return { x, y, vp, rect };
}

/** Click one of the brush chips by its `title`, which this feature owns. */
const clickByTitle = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('button')]
    .find((e) => ${re}.test(e.getAttribute('title') || ''));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;
const chipStateByTitle = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('button')]
    .find((e) => ${re}.test(e.getAttribute('title') || ''));
  if (!el) return null;
  return { title: el.getAttribute('title'), pressed: el.getAttribute('aria-pressed') };
})()`;

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== DERIVED NAMETABLE FIELDS (from ${TYPES_SRC.replace(ROOT + '/', '')}) ===`);
  console.log(`  tileIndex mask ${hex(F.TILE)} · hFlip ${hex(F.HF)} · vFlip ${hex(F.VF)}`
    + ` · palette ${hex(F.PAL)} (<<${F.PAL_SHIFT}) · priority ${hex(F.PRI)}`);
  console.log(`  attribute bits under test (hFlip|vFlip|priority) = ${hex(ATTR)}`);
  console.log(`  SECTION_TILES_WIDE = ${STW}`);

  if (!(await portFree())) throw new Error(`port ${PORT} already serving a CDP target — kill it first`);

  const child = spawn('/usr/bin/xvfb-run', [
    '-a', '--server-args=-screen 0 1600x1000x24',
    ELECTRON, '.', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  ], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  try {
    const ws = await waitForTarget();
    c = cdp(ws);
    await c.ready;

    // ── the debug surface must exist, or nothing below means anything ──────
    const hasDbg = await c.evalExpr('typeof window.__dbg');
    if (hasDbg !== 'object') {
      throw new Error('window.__dbg absent — this needs a VITE_AURORA_DEBUG=1 build of dist/');
    }

    console.log('\n=== OPENING THE REAL AEON PROJECT ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    for (let i = 0; i < 60; i++) {
      const st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) { note('project open', JSON.stringify(st)); break; }
      await sleep(500);
    }
    const st0 = await c.json('window.__dbg.aeon.state()');
    if (!st0.open) throw new Error('aeon project never opened');

    // ── [aim] the dpr contract ────────────────────────────────────────────
    const geom = await c.json(String.raw`(() => {
      const cv = document.getElementById('map-canvas');
      const b = cv.getBoundingClientRect();
      return { dpr: window.devicePixelRatio, w: cv.width, h: cv.height,
               left: b.left, top: b.top, rw: b.width, rh: b.height };
    })()`);
    note('canvas geometry', `dpr=${geom.dpr} rect=(${geom.left},${geom.top},${geom.rw}x${geom.rh}) `
      + `canvas.width=${geom.w} canvas.height=${geom.h}`);
    check('aim', 'canvas backing store is CSS px, not dpr px (MapViewport: canvas.width = rect.width)',
      geom.w === Math.floor(geom.rw),
      `canvas.width=${geom.w}  Math.floor(rect.width)=${Math.floor(geom.rw)}  dpr=${geom.dpr}`);

    // ═══ §FIXTURES — real cells, found live, never authored ════════════════
    console.log('\n=== §FIXTURES: finding REAL cells that already carry the bits ===');
    const SEC = 0;
    // Scan a generous band of section 0 through the app's own accessor.
    const scan = await ntRect(c, SEC, 0, 0, STW, 64);
    if (!scan) throw new Error('ntRect returned null — section 0 is not loaded');
    const cellAt = (i) => ({ col: i % STW, row: Math.floor(i / STW), word: scan[i] });
    const all = scan.map((_, i) => cellAt(i));
    const nonZeroTile = (x) => (x.word & F.TILE) !== 0;

    // (a) a cell with priority AND at least one flip — the strongest destination.
    const priFlip = all.find((x) => nonZeroTile(x) && (x.word & F.PRI) && (x.word & (F.HF | F.VF)));
    // (b) a 2x2 block-aligned quad whose FOUR cells all carry priority.
    let quad = null;
    for (let r = 0; r < 62 && !quad; r += 2) {
      for (let c2 = 0; c2 < STW - 1 && !quad; c2 += 2) {
        const w = [scan[r * STW + c2], scan[r * STW + c2 + 1], scan[(r + 1) * STW + c2], scan[(r + 1) * STW + c2 + 1]];
        if (w.every((x) => (x & F.TILE) !== 0 && (x & F.PRI))) quad = { col: c2, row: r, words: w };
      }
    }
    // (c) two cells on ONE ROW, both priority, far enough apart for a drag.
    let pair = null;
    for (let r = 0; r < 64 && !pair; r++) {
      for (let c2 = 0; c2 + 8 < STW && !pair; c2++) {
        const a = scan[r * STW + c2], b = scan[r * STW + c2 + 8];
        if ((a & F.TILE) && (b & F.TILE) && (a & F.PRI) && (b & F.PRI)) {
          pair = { row: r, colA: c2, colB: c2 + 8, wordA: a, wordB: b };
        }
      }
    }
    // (d) a drawn cell with priority CLEAR — the destination for the "brush On"
    //     row. Its priority bit must START at 0 or that row proves nothing.
    const priClear = all.find((x) => nonZeroTile(x) && !(x.word & F.PRI) && !(x.word & (F.HF | F.VF)));

    const counts = {
      drawn: all.filter(nonZeroTile).length,
      pri: all.filter((x) => x.word & F.PRI).length,
      hf: all.filter((x) => x.word & F.HF).length,
      vf: all.filter((x) => x.word & F.VF).length,
    };
    note('section 0, rows 0..63, as the app holds it',
      `${counts.drawn} drawn cells · ${counts.pri} priority · ${counts.hf} hFlip · ${counts.vf} vFlip`);

    check('fx1', 'a REAL cell carrying priority AND a flip exists to paint over',
      !!priFlip,
      priFlip ? `(${priFlip.col},${priFlip.row}) = ${describe(priFlip.word)}` : 'none found in rows 0..63');
    check('fx2', 'a REAL block-aligned 2x2 whose four cells all carry priority exists',
      !!quad,
      quad ? `(${quad.col},${quad.row}) = ${quad.words.map(describe).join(' · ')}` : 'none found');
    check('fx3', 'two REAL priority cells on one row, 8 tiles apart, exist for the drag',
      !!pair,
      pair ? `row ${pair.row}: col ${pair.colA} ${describe(pair.wordA)} → col ${pair.colB} ${describe(pair.wordB)}` : 'none found');
    check('fx4', 'a REAL drawn cell with priority CLEAR exists for the brush-On row',
      !!priClear,
      priClear ? `(${priClear.col},${priClear.row}) = ${describe(priClear.word)}` : 'none found');
    if (!priFlip || !quad || !pair || !priClear) {
      throw new Error('FIXTURE SEARCH FAILED — every row below would be vacuous. Refusing to run them.');
    }

    // ── park the camera on section 0 and arm the paint tool ───────────────
    // Section 0's world origin: the harness asks the app, it does not assume.
    const origin = await c.json(`window.__dbg.aeon.sectionOrigin ? window.__dbg.aeon.sectionOrigin(${SEC}) : {x:0,y:0}`);
    note('section 0 world origin', JSON.stringify(origin));

    /** Park so `col,row` sits comfortably inside the canvas, then aim. */
    async function parkAndAim(col, row) {
      const vx = Math.max(0, origin.x + col * TILE_PX - 200);
      const vy = Math.max(0, origin.y + row * TILE_PX - 150);
      await setView(c, vx, vy, ZOOM);
      await sleep(120);
      return aimAtCell(c, col, row, origin);
    }

    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");
    // Focus the canvas so the tool hotkey lands, then arm Paint Tile with its
    // REAL hotkey (tool-meta.ts TOOL_KEYS['paint-tile'] = 't').
    await c.evalExpr("document.getElementById('map-canvas').focus()");
    await key(c, 't', 'KeyT', 84);
    await sleep(150);
    const toolNow = (await c.json('window.__dbg.aeon.state()')).tool;
    check('arm', "the REAL hotkey 't' armed paint-tile", toolNow === 'paint-tile', `tool = ${toolNow}`);

    /** Arm a tile index that is GUARANTEED to differ from the destination's, so
     *  "the paint happened" is itself checkable. */
    async function armTile(differentFrom) {
      const want = ((differentFrom & F.TILE) + 1) & F.TILE || 1;
      await c.evalExpr(`window.__dbg.aeon.setSelectedTile(${want}, 0)`);
      return want;
    }

    // ═══ [p1] THE RED ROW — paint-tile mousedown (MapViewport ~:2498) ══════
    console.log('\n=== [p1] paint-tile, single click, over a REAL priority+flip cell ===');
    const idxPF = priFlip.row * STW + priFlip.col;
    const beforePF = await ntAt(c, SEC, idxPF);
    const armedPF = await armTile(beforePF);
    const aimPF = await parkAndAim(priFlip.col, priFlip.row);
    note('aim', `cell (${priFlip.col},${priFlip.row}) → integer client (${aimPF.x},${aimPF.y}) `
      + `via view ${JSON.stringify(aimPF.vp)}`);
    await mouse(c, 'mousePressed', aimPF.x, aimPF.y);
    await mouse(c, 'mouseReleased', aimPF.x, aimPF.y);
    await sleep(200);
    const afterPF = await ntAt(c, SEC, idxPF);
    note('word', `before ${describe(beforePF)}\n        after  ${describe(afterPF)}`);
    // The anti-vacuous half FIRST: if the paint did not happen, nothing below
    // this is a measurement of preservation.
    check('p1a', 'the click actually painted the armed tile index (not a no-op)',
      (afterPF & F.TILE) === armedPF,
      `armed tile ${armedPF}, cell now holds tile ${afterPF & F.TILE} (was ${beforePF & F.TILE})`);
    check('p1b', "painting PRESERVES the destination's priority bit",
      (afterPF & F.PRI) === (beforePF & F.PRI),
      `before PRI=${!!(beforePF & F.PRI)}  after PRI=${!!(afterPF & F.PRI)}`);
    check('p1c', 'painting puts down the BRUSH\'s flips (both off) — the picker showed an unflipped tile',
      (afterPF & (F.HF | F.VF)) === 0,
      `before flips=${hex(beforePF & (F.HF | F.VF))}  after flips=${hex(afterPF & (F.HF | F.VF))}`);
    await shot(c, 'p1-after-paint-tile');

    // ═══ [p2] paint-block (MapViewport ~:2533) ════════════════════════════
    console.log('\n=== [p2] paint-block over a REAL 2x2 whose four cells all carry priority ===');
    await c.evalExpr("document.getElementById('map-canvas').focus()");
    await key(c, 'b', 'KeyB', 66);
    await sleep(150);
    const toolB = (await c.json('window.__dbg.aeon.state()')).tool;
    check('p2a', "the REAL hotkey 'b' armed paint-block", toolB === 'paint-block', `tool = ${toolB}`);
    const quadIdx = [
      quad.row * STW + quad.col, quad.row * STW + quad.col + 1,
      (quad.row + 1) * STW + quad.col, (quad.row + 1) * STW + quad.col + 1,
    ];
    const beforeQ = [];
    for (const i of quadIdx) beforeQ.push(await ntAt(c, SEC, i));
    const armedQ = await armTile(beforeQ[0]);
    const aimQ = await parkAndAim(quad.col, quad.row);
    note('aim', `block base (${quad.col},${quad.row}) → integer client (${aimQ.x},${aimQ.y})`);
    await mouse(c, 'mousePressed', aimQ.x, aimQ.y);
    await mouse(c, 'mouseReleased', aimQ.x, aimQ.y);
    await sleep(200);
    const afterQ = [];
    for (const i of quadIdx) afterQ.push(await ntAt(c, SEC, i));
    note('quad', `before ${beforeQ.map(describe).join('\n               ')}`);
    note('quad', `after  ${afterQ.map(describe).join('\n               ')}`);
    check('p2b', 'the block painted all four armed tile indices (base..base+3)',
      afterQ.every((w, k) => (w & F.TILE) === ((armedQ + k) & F.TILE)),
      `armed ${armedQ}..${armedQ + 3}, got ${afterQ.map((w) => w & F.TILE).join(',')}`);
    check('p2c', 'paint-block PRESERVES priority on all four cells',
      afterQ.every((w, k) => (w & F.PRI) === (beforeQ[k] & F.PRI)),
      `before PRI ${beforeQ.map((w) => !!(w & F.PRI)).join(',')}  after ${afterQ.map((w) => !!(w & F.PRI)).join(',')}`);
    check('p2d', 'the whole 2x2 is ONE undo step',
      (await c.evalExpr('window.__dbg.aeon.canUndo()')) === true);
    await key(c, 'z', 'KeyZ', 90, 2 /* Ctrl */);
    await sleep(200);
    const undoneQ = [];
    for (const i of quadIdx) undoneQ.push(await ntAt(c, SEC, i));
    check('p2e', 'one Ctrl+Z restores all four words exactly',
      undoneQ.every((w, k) => w === beforeQ[k]),
      `restored ${undoneQ.map(hex).join(',')}  wanted ${beforeQ.map(hex).join(',')}`);

    // ═══ [p3] the DRAG path (MapViewport ~:2845) — a third site ════════════
    console.log('\n=== [p3] paint-tile DRAG across two REAL priority cells ===');
    await c.evalExpr("document.getElementById('map-canvas').focus()");
    await key(c, 't', 'KeyT', 84);
    await sleep(150);
    const idxA = pair.row * STW + pair.colA, idxB = pair.row * STW + pair.colB;
    const beforeA = await ntAt(c, SEC, idxA), beforeB = await ntAt(c, SEC, idxB);
    const armedD = await armTile(beforeA);
    // Park once so BOTH cells are on screen, then aim each without re-parking.
    const vx = Math.max(0, origin.x + pair.colA * TILE_PX - 120);
    const vy = Math.max(0, origin.y + pair.row * TILE_PX - 150);
    await setView(c, vx, vy, ZOOM);
    await sleep(120);
    const aA = await aimAtCell(c, pair.colA, pair.row, origin);
    const aB = await aimAtCell(c, pair.colB, pair.row, origin);
    note('aim', `A (${pair.colA},${pair.row})→(${aA.x},${aA.y})   B (${pair.colB},${pair.row})→(${aB.x},${aB.y})`);
    await mouse(c, 'mousePressed', aA.x, aA.y);
    await mouse(c, 'mouseMoved', Math.round((aA.x + aB.x) / 2), aA.y);
    await mouse(c, 'mouseMoved', aB.x, aB.y);
    await mouse(c, 'mouseReleased', aB.x, aB.y);
    await sleep(250);
    const afterA = await ntAt(c, SEC, idxA), afterB = await ntAt(c, SEC, idxB);
    note('drag', `A before ${describe(beforeA)} after ${describe(afterA)}`);
    note('drag', `B before ${describe(beforeB)} after ${describe(afterB)}`);
    check('p3a', 'the drag painted BOTH ends (the mousemove branch really ran)',
      (afterA & F.TILE) === armedD && (afterB & F.TILE) === armedD,
      `A tile ${afterA & F.TILE}, B tile ${afterB & F.TILE}, armed ${armedD}`);
    check('p3b', "the DRAG branch preserves each cell's own priority bit",
      (afterA & F.PRI) === (beforeA & F.PRI) && (afterB & F.PRI) === (beforeB & F.PRI),
      `A ${!!(beforeA & F.PRI)}→${!!(afterA & F.PRI)}  B ${!!(beforeB & F.PRI)}→${!!(afterB & F.PRI)}`);
    await key(c, 'z', 'KeyZ', 90, 2);
    await sleep(200);
    check('p3c', 'the whole drag is ONE undo step',
      (await ntAt(c, SEC, idxA)) === beforeA && (await ntAt(c, SEC, idxB)) === beforeB,
      `A ${hex(await ntAt(c, SEC, idxA))} want ${hex(beforeA)}`);

    // ═══ [b*] THE AUTHORING HALF — the brush chips ════════════════════════
    console.log('\n=== [b*] the brush: can the owner actually SET priority and the flips? ===');
    const chipPri = /^Priority: /;
    const chipKeep = /^Priority: keep/;
    const chipOn = /^Priority: on/;
    const chipOff = /^Priority: off/;
    const chipHF = /^Brush: horizontal flip/;
    const chipVF = /^Brush: vertical flip/;

    const priChips = await c.json(String.raw`
      [...document.querySelectorAll('button')]
        .map((e) => e.getAttribute('title'))
        .filter((t) => t && /^Priority: |^Brush: /.test(t))`);
    note('brush chips on screen', JSON.stringify(priChips));
    check('b0', 'the brush exposes priority keep/on/off and both flips',
      priChips.length >= 5
        && priChips.some((t) => chipKeep.test(t)) && priChips.some((t) => chipOn.test(t))
        && priChips.some((t) => chipOff.test(t))
        && priChips.some((t) => chipHF.test(t)) && priChips.some((t) => chipVF.test(t)),
      `found ${priChips.length}: ${JSON.stringify(priChips)}`);

    const defaultKeep = await c.json(chipStateByTitle(String(chipKeep)));
    check('b1', 'priority defaults to KEEP — the non-destructive default',
      defaultKeep !== null && defaultKeep.pressed === 'true',
      JSON.stringify(defaultKeep));

    // THE LENS QUESTION, both directions.
    const lensBefore = await c.json('window.__dbg.aeon.priorityLens()');
    check('b2', 'at the KEEP default the priority lens is NOT force-enabled',
      lensBefore && lensBefore.active === false,
      `priorityLens() = ${JSON.stringify(lensBefore)}`);

    // ── brush ON, over a cell whose priority STARTS CLEAR ────────────────
    const okOn = await c.evalExpr(clickByTitle(String(chipOn)));
    check('b3a', 'the "on" chip is clickable', okOn === true, `click → ${okOn}`);
    await sleep(200);
    const lensAfter = await c.json('window.__dbg.aeon.priorityLens()');
    const toasts = await c.json('window.__dbg.aeon.toasts()');
    check('b3b', 'arming a NON-default priority brush surfaces the lens (you can see the field you are editing)',
      lensAfter && lensAfter.active === true,
      `priorityLens() = ${JSON.stringify(lensAfter)}`);
    check('b3c', 'and says so, rather than changing the view silently',
      toasts.some((t) => /priority lens/i.test(t.message)),
      JSON.stringify(toasts.map((t) => t.message)));

    const idxPC = priClear.row * STW + priClear.col;
    const beforePC = await ntAt(c, SEC, idxPC);
    check('b4a', 'the brush-On destination REALLY starts with priority clear (not a vacuous row)',
      (beforePC & F.PRI) === 0 && (beforePC & F.TILE) !== 0,
      `${describe(beforePC)}`);
    const armedPC = await armTile(beforePC);
    await c.evalExpr("document.getElementById('map-canvas').focus()");
    await key(c, 't', 'KeyT', 84);
    await sleep(120);
    const aimPC = await parkAndAim(priClear.col, priClear.row);
    await mouse(c, 'mousePressed', aimPC.x, aimPC.y);
    await mouse(c, 'mouseReleased', aimPC.x, aimPC.y);
    await sleep(200);
    const afterPC = await ntAt(c, SEC, idxPC);
    note('brush On', `before ${describe(beforePC)}  after ${describe(afterPC)}`);
    check('b4b', 'brush "on" SETS priority on a cell that had none',
      (afterPC & F.PRI) === F.PRI && (afterPC & F.TILE) === armedPC,
      `${describe(afterPC)} (armed tile ${armedPC})`);

    // ── brush OFF, over a cell whose priority is SET ─────────────────────
    // THIS IS THE DISCRIMINATOR for [p1b]/[p2c]/[p3b]. Without it, "the app
    // always sets bit 15" would be an alternative green path for every
    // preservation row above. It cannot be, because this row demands the bit
    // CLEAR on a cell that had it.
    const okOff = await c.evalExpr(clickByTitle(String(chipOff)));
    check('b5a', 'the "off" chip is clickable', okOff === true, `click → ${okOff}`);
    await sleep(150);
    const idxPF2 = priFlip.row * STW + priFlip.col;
    const beforePF2 = await ntAt(c, SEC, idxPF2);
    check('b5b', 'the brush-Off destination really HAS priority set (not a vacuous row)',
      (beforePF2 & F.PRI) === F.PRI, describe(beforePF2));
    const armedOff = await armTile(beforePF2);
    const aimOff = await parkAndAim(priFlip.col, priFlip.row);
    await mouse(c, 'mousePressed', aimOff.x, aimOff.y);
    await mouse(c, 'mouseReleased', aimOff.x, aimOff.y);
    await sleep(200);
    const afterOff = await ntAt(c, SEC, idxPF2);
    check('b5c', 'brush "off" CLEARS priority on a cell that had it — the discriminator for every preserve row',
      (afterOff & F.PRI) === 0 && (afterOff & F.TILE) === armedOff,
      `before ${describe(beforePF2)}  after ${describe(afterOff)}`);

    // ── the flips follow the BRUSH, in both directions ───────────────────
    await c.evalExpr(clickByTitle(String(chipKeep)));
    await sleep(120);
    const okHF = await c.evalExpr(clickByTitle(String(chipHF)));
    check('b6a', 'the horizontal-flip chip is clickable', okHF === true, `click → ${okHF}`);
    await sleep(150);
    const beforeF = await ntAt(c, SEC, idxPC);
    const armedF = await armTile(beforeF);
    const aimF = await parkAndAim(priClear.col, priClear.row);
    await mouse(c, 'mousePressed', aimF.x, aimF.y);
    await mouse(c, 'mouseReleased', aimF.x, aimF.y);
    await sleep(200);
    const afterF = await ntAt(c, SEC, idxPC);
    check('b6b', 'brush hFlip ON puts the flip bit down',
      (afterF & F.HF) === F.HF && (afterF & F.TILE) === armedF,
      `before ${describe(beforeF)}  after ${describe(afterF)}`);
    // …and OFF takes it away again: a flip is part of the PICTURE, so it
    // follows the brush rather than the destination. That asymmetry with
    // priority is the whole preservation rule, and this is where it is asserted.
    await c.evalExpr(clickByTitle(String(chipHF)));
    await sleep(150);
    const armedF2 = await armTile(afterF);
    const aimF2 = await parkAndAim(priClear.col, priClear.row);
    await mouse(c, 'mousePressed', aimF2.x, aimF2.y);
    await mouse(c, 'mouseReleased', aimF2.x, aimF2.y);
    await sleep(200);
    const afterF2 = await ntAt(c, SEC, idxPC);
    check('b6c', 'brush hFlip OFF takes it away — a flip follows the BRUSH, not the destination',
      (afterF2 & F.HF) === 0 && (afterF2 & F.TILE) === armedF2,
      `${describe(afterF)} → ${describe(afterF2)}`);
    await shot(c, 'b6-brush-chips');

    // ═══ [bg] the FOURTH site — the background plane (MapViewport ~:1751) ══
    console.log('\n=== [bg] the background paint path, same word layout, same defect ===');
    await c.evalExpr(clickByTitle(String(chipKeep)));
    await sleep(120);
    await c.evalExpr("window.__dbg.aeon.setLayer('bg')");
    await sleep(200);
    const bgLen = await c.evalExpr('(() => { const b = window.__dbg.aeon; let n = 0;'
      + ' for (let i = 0; i < 4096; i++) if (b.bgAt(i) !== null) n++; return n; })()');
    let bgCell = null;
    for (let i = 0; i < bgLen; i++) {
      const w = await ntAtBg(c, i);
      if (w !== null && (w & F.TILE) && (w & ATTR)) { bgCell = { i, w }; break; }
    }
    if (!bgCell) {
      unmeasurable('bg1', 'the BG paint path preserves attributes',
        `scanned ${bgLen} resolved BG words; none carries a drawn tile AND any of ${hex(ATTR)}. `
        + 'A row painted onto an all-zero-attribute cell emits the same word fixed or broken, so it '
        + 'is NOT reported as a pass. The FG rows above cover the same shared rule; this site is '
        + 'covered by node tests over the shared helper and TAGGED for a foreground re-check on a '
        + 'background that has attributes.');
    } else {
      note('bg subject', `slot ${bgCell.i} = ${describe(bgCell.w)} (source: ${await c.evalExpr('window.__dbg.aeon.bgSource()')})`);
      // The BG plane's own geometry: 8px cells on a plane `bgWidth` wide.
      const bgW = await c.evalExpr('(window.__dbg.aeon.bgWidth ? window.__dbg.aeon.bgWidth() : 64)');
      const col = bgCell.i % bgW, row = Math.floor(bgCell.i / bgW);
      await c.evalExpr(`window.__dbg.aeon.setSelectedTile(${((bgCell.w & F.TILE) + 1) & 0xF || 1}, 0)`);
      await c.evalExpr("document.getElementById('map-canvas').focus()");
      await key(c, 't', 'KeyT', 84);
      await sleep(120);
      const vxb = Math.max(0, col * TILE_PX - 200), vyb = Math.max(0, row * TILE_PX - 150);
      await setView(c, vxb, vyb, ZOOM);
      await sleep(120);
      const aimBg = await aimAtCell(c, col, row, { x: 0, y: 0 });
      await mouse(c, 'mousePressed', aimBg.x, aimBg.y);
      await mouse(c, 'mouseReleased', aimBg.x, aimBg.y);
      await sleep(250);
      const afterBg = await ntAtBg(c, bgCell.i);
      note('bg', `before ${describe(bgCell.w)}  after ${describe(afterBg)}`);
      check('bg1', 'the BG paint path preserves the cell\'s priority bit too',
        (afterBg & F.PRI) === (bgCell.w & F.PRI),
        `before ${describe(bgCell.w)}  after ${describe(afterBg)}`);
    }
    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");

    // ── restore: undo everything this run painted ────────────────────────
    console.log('\n=== restoring (nothing was ever written to disk) ===');
    for (let i = 0; i < 12; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await key(c, 'z', 'KeyZ', 90, 2);
      await sleep(120);
    }
    const restoredPF = await ntAt(c, SEC, idxPF);
    const restoredPC = await ntAt(c, SEC, idxPC);
    check('r1', 'every painted cell is back to the word it started with',
      restoredPF === beforePF && restoredPC === beforePC,
      `priFlip ${hex(restoredPF)} want ${hex(beforePF)} · priClear ${hex(restoredPC)} want ${hex(beforePC)}`);
    note('disk', 'no save was issued; the app has no autosave (shell/close-guard.ts)');
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    child.kill('SIGTERM');
    await sleep(500);
    child.kill('SIGKILL');
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} ════`);
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

/** One RESOLVED background word, through the viewport's own resolver. */
const ntAtBg = (c, i) => c.evalExpr(`window.__dbg.aeon.bgAt(${i})`);

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(2); });
