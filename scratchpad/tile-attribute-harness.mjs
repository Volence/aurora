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
// ONE PHASE IS THE EXCEPTION AND SAYS SO: the [bg] rows. This project's
// background carries 4,088 drawn words and ZERO priority ones (row [bg0]
// measures that in-run), so there is no real cell to paint over. That phase
// therefore AUTHORS its destination with the app's own brush first — [bg1],
// which master cannot pass — and only then tests preservation against it.
//
// The phases also REWIND between each other (`undoAll`). Without that, a phase
// would inherit the previous one's damage: on master [p1] truncates the
// priority+flip cell, so a later row reading that same cell would find the bits
// already gone and could go green on their ABSENCE rather than on the rule.
// Two rows of an earlier draft of this file did exactly that.
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
// ═══ THE SECOND ROAD: THE AGENT (ROADMAP O12, 2026-08-29) ═══
//
// The [w*] rows drive `editor/paint_region` over the REAL Aether HTTP binding —
// no mouse at all — because the agent's copy of this defect lived on a road no
// gesture reaches. `NametableEntrySpec.pri` is OPTIONAL, and `!!spec.pri`
// collapsed an OMITTED field into an authored `false`, so an agent bulk-painting
// over authored art cleared every priority bit it covered.
//
// Those rows cross the express route, the zod layer and the IPC bridge, which no
// node test touches, and they read the answer back out of the DOCUMENT through
// `__dbg.aeon.ntAt` — never off the tool's own reply.
//
// [w1] and [w4] are the discriminators (they FAIL on the pre-O12 handler).
// [w2] [w3] [w5] [w6] are green BOTH WAYS and say so out loud where they run:
// they rule out the cheap green-paths and pin the ruling that the FLIPS are not
// a defect, and they are not evidence of the fix.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:tile-attributes
//                     (or) node scratchpad/tile-attribute-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import * as http from 'node:http';
import { spawnGuarded, killTree, restoreDiscoveryNow, readDiscoveryNow, resolveOwnedDiscovery } from './lib/harness-guard.mjs';

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

// ── §WIRE — the AGENT road (ROADMAP O12) ───────────────────────────────────
//
// Everything above drives a MOUSE. The agent never touches one: it POSTs
// `editor/paint_region` to the Aether binding, which crosses the express route,
// the zod layer (`entrySchema`), the Electron IPC bridge and only then reaches
// `handleAgentRequest`. NONE of that is reachable from the node suite, and it is
// exactly where "an optional field quietly becomes false" would live — the
// defect O12 fixes IS an optional field quietly becoming false.
//
// So the [w*] rows send the real request over the real socket and read the
// result back out of the DOCUMENT through `__dbg.aeon.ntAt` — never off the
// reply, which is the tool reporting on itself.
//
// ═══ PROVENANCE, AND THE THING THAT ACTUALLY BIT ═══
//
// The app publishes its port to ~/.aurora/mcp.json (and the legacy
// ~/.sonic-level-editor/mcp.json). That file is SHARED — the owner's own Aurora
// writes it too. Measured on 2026-08-29 while building this phase: the owner's
// Aurora held the default port 38473 and was serving a live project. Painting
// through a port found in that file would have mutated HIS open document and
// then read ours back; every row would have gone green describing nothing.
//
// So the port is NOT taken from the file's value alone. It is taken from the
// file and then CHECKED: the `pid` it names must be a descendant of the process
// this harness spawned. Nothing else is accepted, and the phase reports
// UNMEASURABLE rather than guessing.
//
// ═══ AND THE FILE IS PUT BACK ═══
//
// Two hazards were observed in the first run of this phase, BOTH of which
// predate it and hit every harness in this repo that launches the app:
//
//   1. the launched app OVERWRITES the shared discovery file, so the owner's
//      tooling starts resolving to the harness's throwaway instance;
//   2. `child.kill()` kills the `xvfb-run` wrapper, NOT the Electron under it,
//      so the throwaway instance SURVIVES the harness and keeps holding both
//      the port and the file it wrote.
//
// `snapshotDiscovery()`/`restoreDiscovery()` put the files back byte for byte
// (or delete them if they did not exist), and `killTree()` kills the actual
// Electron. Both run in the same `finally` as the CDP teardown.
// ── O16: THIS BLOCK MOVED TO scratchpad/lib/harness-guard.mjs ──────────────
//
// It was pasted here and in tile-attribute-harness.mjs, which is two copies of
// the same treatment and exactly how this repo ended up with four open-coded
// paint words and three broken collision writers (see
// src/core/editing/brush-word.ts). There are ~90 launchers in scratchpad/; the
// guards live in one module and every one of them imports it. `killTree` there
// is also strictly better than what was here: it SIGTERMs first and gives
// Chromium a grace period to flush localStorage before the SIGKILL, and it
// prints the argv of every process it killed.

let rpcId = 1;
/** One JSON-RPC call over the REAL Aether HTTP binding. Returns the envelope. */
async function rpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/aether`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });
  return { status: res.status, body: await res.json() };
}
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
  // §WIRE: the launched app will OVERWRITE the shared discovery files. The
  // byte-for-byte snapshot is taken by `spawnGuarded` below, BEFORE the app can
  // touch them, and put back in the `finally` — the owner's Aurora publishes to
  // the same paths.

  const child = spawnGuarded('/usr/bin/xvfb-run', [
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
    // POLLED, not sampled once. `__dbg` is installed from a dynamically
    // imported chunk, so the CDP target can exist a beat before the hook does —
    // a single read raced it and reported "no debug build" on a build that was
    // fine, which is a false negative about the harness rather than the app.
    let hasDbg = 'undefined';
    for (let i = 0; i < 60; i++) {
      hasDbg = await c.evalExpr('typeof window.__dbg');
      if (hasDbg === 'object') break;
      await sleep(500);
    }
    if (hasDbg !== 'object') {
      throw new Error('window.__dbg absent after 30s — this needs a VITE_AURORA_DEBUG=1 build of dist/');
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

    /**
     * Rewind the document to where this run found it.
     *
     * Called between phases because a phase that inherited the PREVIOUS phase's
     * damage would measure the wrong thing: on master, [p1] truncates the
     * priority+flip cell, so a later row reading that same cell would find its
     * bits already gone and could go green on the absence rather than on the
     * rule. Two rows of this harness did exactly that before this existed.
     */
    async function undoAll(label) {
      let n = 0;
      while (n < 20 && (await c.evalExpr('window.__dbg.aeon.canUndo()'))) {
        await key(c, 'z', 'KeyZ', 90, 2);
        await sleep(120);
        n++;
      }
      note('rewind', `${label}: ${n} undo step(s)`);
    }

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
    note('NON-DISCRIMINATING ON MASTER',
      '[p1c] is green on the BROKEN build too — master hard-clears the flip bits, which is '
      + 'accidentally what this rule asks for with an unflipped brush. It is here to pin the rule '
      + 'going forward, NOT as evidence of the fix. Its discriminators are [b6b]/[b6c], where the '
      + 'brush is armed and the bits must follow it in both directions.');
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
    await undoAll('before the brush phase — every row below needs the ORIGINAL document');
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
    //
    // THE PRECONDITION IS ITS OWN ROW. [b6c] paints over the cell [b6b] just
    // flipped; if [b6b] had silently not flipped it, [b6c] would go green on a
    // bit that was never there. This states the destination explicitly.
    check('b6c-pre', 'the destination for the flip-OFF row REALLY carries the flip first',
      (afterF & F.HF) === F.HF, describe(afterF));
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

    // ═══ [w] THE AGENT ROAD — editor/paint_region over the REAL Aether wire ═
    //
    // Same rule, same document, NO MOUSE. See §WIRE for the provenance guards
    // and for why the port is derived rather than typed.
    //
    // dpr is IRRELEVANT to this whole phase: nothing here sends a coordinate.
    // That is worth saying rather than assuming — [aim] above still governs the
    // mouse rows, and these rows are immune to the trap it defends against.
    //
    // WHICH ROWS DISCRIMINATE (measured, not asserted — see the run log):
    //   [w1] [w4]  FAIL on the pre-O12 handler. These are the fix.
    //   [w2] [w3] [w5] [w6]  GREEN BOTH WAYS. They pin the rule and rule out the
    //             cheap green-paths ("the app always sets bit 15" / "never sets
    //             it" / "nothing was painted"), and they are NOT evidence of the
    //             fix. The header prints this; so does the packet.
    console.log('\n=== [w] the AGENT road: editor/paint_region over the real socket ===');
    await undoAll('before the agent phase');

    {
      // THE PORT IS OURS OR THE PHASE DOES NOT RUN. The discovery file is
      // shared with the owner's Aurora (see §WIRE), so its `port` is only
      // accepted once its `pid` is shown to be a descendant of the process this
      // harness spawned. `ours` is recomputed on every poll: the app writes the
      // file a beat after launch, and the pid set grows as Electron forks.
      const owned = await resolveOwnedDiscovery({ roots: [child.pid], timeoutMs: 15000 });
      // PRINT THE ARTIFACT THIS ROW JUDGES — the bytes seen and every refusal.
      for (const r of owned.rejected ?? []) console.log(`        prov refused ${r}`);
      if (owned.ok) console.log(`        prov ${owned.from} said ${owned.raw.trim()}`);
      const disc = owned.ok ? { port: owned.port, pid: owned.pid, from: owned.from } : null;
      const MCP_PORT = disc?.port ?? -1;
      const info = disc ? await rpc(MCP_PORT, 'editor/get_project_info', {}) : null;
      const dbgState = await c.json('window.__dbg.aeon.state()');
      const wireSections = info?.body?.result?.sections?.filter(Boolean).length ?? -1;
      note('agent wire', disc
        ? `${disc.from} port=${disc.port} pid=${disc.pid} (a descendant of ${child.pid}) · `
          + `wire sections=${wireSections} · CDP sections=${dbgState.sections} · `
          + `zone=${info?.body?.result?.zone}`
        : `no discovery file naming a pid under ${child.pid} — refusing to use anyone else's port`);
      check('w0', 'the Aether wire is THIS app, looking at THIS document',
        !!disc && wireSections === dbgState.sections
          && info?.body?.result?.zone === dbgState.zone,
        disc ? `port ${disc.port} pid ${disc.pid} · sections wire ${wireSections} vs cdp ${dbgState.sections}`
             : 'no discovery file owned by this run');

      if (!disc || wireSections !== dbgState.sections) {
        unmeasurable('w1', 'the agent path preserves priority',
          'provenance failed — every row below would be describing another app');
      } else {
        const tilesetSize = info.body.result.tilesetSize;
        note('tileset', `${tilesetSize} tiles — every armed index below is taken modulo this`);
        /** A tile index guaranteed to differ from `w`'s and to be in range. */
        const otherTile = (w) => (((w & F.TILE) + 1) % tilesetSize) || 1;

        // ── [w1] OMITTED pri over a REAL priority cell ────────────────────
        const wBefore = await ntAt(c, SEC, idxPF);
        check('w1-pre', 'the agent phase\'s destination REALLY carries priority',
          (wBefore & F.PRI) === F.PRI, describe(wBefore));
        const t1 = otherTile(wBefore);
        const r1 = await rpc(MCP_PORT, 'editor/paint_region', {
          section: SEC, x: priFlip.col, y: priFlip.row, w: 1, h: 1,
          entries: [{ tile: t1, pal: 1 }],       // NO pri, NO hf, NO vf
        });
        const wAfter = await ntAt(c, SEC, idxPF);
        note('w1 word', `before ${describe(wBefore)}\n        after  ${describe(wAfter)}`
          + `\n        reply  ${JSON.stringify(r1.body.result ?? r1.body.error)}`);
        // ANTI-VACUOUS FIRST: if the request never landed, nothing below is a
        // measurement of preservation — it is a measurement of silence.
        check('w1a', 'the wire request actually painted the tile it named',
          (wAfter & F.TILE) === t1,
          `sent tile ${t1}, document now holds ${wAfter & F.TILE} (was ${wBefore & F.TILE})`);
        check('w1', 'an OMITTED pri PRESERVES the destination\'s priority bit (THE DEFECT)',
          (wAfter & F.PRI) === (wBefore & F.PRI),
          `before PRI=${!!(wBefore & F.PRI)}  after PRI=${!!(wAfter & F.PRI)}`);
        check('w5', 'an OMITTED hf/vf lands UNFLIPPED — a flip is which PICTURE, not the cell',
          (wAfter & (F.HF | F.VF)) === 0,
          `before flips=${hex(wBefore & (F.HF | F.VF))}  after flips=${hex(wAfter & (F.HF | F.VF))}`);
        note('NON-DISCRIMINATING ON THE BROKEN BUILD',
          '[w5] is green before the fix too — the old handler also cleared the flip bits, which is '
          + 'accidentally what the rule asks for when the request names no flip. It PINS the '
          + 'ruling (the flips are NOT a defect) and is not evidence of the fix.');

        // ── [w2] pri:false must still CLEAR — keep has to stay honest ──────
        //
        // REWIND FIRST. Without it this row's destination is the cell [w1] just
        // painted, so on a BROKEN build it would be reading a cell whose bit
        // [w1] destroyed — the "green on an absence an earlier row created"
        // failure mode this file's header warns about. (Measured: the planted
        // red-first run turned [w2-pre] red for exactly that reason, which is
        // the guard working, but an ambiguous red is worth one rewind to avoid.)
        await undoAll('before the pri:false row');
        const c2Before = await ntAt(c, SEC, idxPF);
        const t2 = otherTile(c2Before);
        await rpc(MCP_PORT, 'editor/paint_region', {
          section: SEC, x: priFlip.col, y: priFlip.row, w: 1, h: 1,
          entries: [{ tile: t2, pal: 1, pri: false }],
        });
        const c2After = await ntAt(c, SEC, idxPF);
        check('w2-pre', 'the pri:false destination REALLY carries priority first',
          (c2Before & F.PRI) === F.PRI, describe(c2Before));
        check('w2', 'an EXPLICIT pri:false CLEARS a set bit — an agent can still author "off"',
          (c2After & F.PRI) === 0 && (c2After & F.TILE) === t2,
          `${describe(c2Before)} → ${describe(c2After)}`);
        note('NON-DISCRIMINATING', '[w2] is green on the broken build too (it cleared bit 15 '
          + 'unconditionally). It rules out the green-path "the app always sets priority"; its '
          + 'discriminator is [w1].');

        // ── [w3] pri:true must SET it on a cell that had none ─────────────
        await undoAll('before the pri:true row');
        const c3Before = await ntAt(c, SEC, idxPC);
        const t3 = otherTile(c3Before);
        await rpc(MCP_PORT, 'editor/paint_region', {
          section: SEC, x: priClear.col, y: priClear.row, w: 1, h: 1,
          entries: [{ tile: t3, pal: 1, pri: true }],
        });
        const c3After = await ntAt(c, SEC, idxPC);
        check('w3-pre', 'the pri:true destination REALLY lacks priority first',
          (c3Before & F.PRI) === 0, describe(c3Before));
        check('w3', 'an EXPLICIT pri:true SETS it on a cell that had none',
          (c3After & F.PRI) === F.PRI && (c3After & F.TILE) === t3,
          `${describe(c3Before)} → ${describe(c3After)}`);
        note('NON-DISCRIMINATING', '[w3] is green on the broken build too (`!!true` is true). It '
          + 'rules out "the app never sets priority".');

        // ── [w4] THE SHAPE OF THE REPORTED BUG: a BULK region ─────────────
        //
        // One request covering cells whose priority DIFFERS. A rule applied
        // once per request rather than once per cell passes [w1] and fails
        // here, which is why a 1x1 row is not enough.
        await undoAll('before the bulk agent row');
        const RW = 3, RH = 2;
        let rect = null;
        const live = await ntRect(c, SEC, 0, 0, STW, 64);
        for (let r = 0; r < 62 && !rect; r++) {
          for (let cc = 0; cc + RW <= STW && !rect; cc++) {
            const words = [];
            for (let dr = 0; dr < RH; dr++) {
              for (let dc = 0; dc < RW; dc++) words.push(live[(r + dr) * STW + cc + dc]);
            }
            const anyPri = words.some((w) => w & F.PRI), anyNot = words.some((w) => !(w & F.PRI));
            if (words.every((w) => w & F.TILE) && anyPri && anyNot) rect = { col: cc, row: r, words };
          }
        }
        if (!rect) {
          unmeasurable('w4', 'a bulk region decides PER CELL',
            `no ${RW}x${RH} rect of drawn cells with MIXED priority found in rows 0..63 — the row `
            + 'would be vacuous');
        } else {
          note('w4 subject', `(${rect.col},${rect.row}) ${RW}x${RH}: `
            + rect.words.map((w) => (w & F.PRI ? 'PRI' : '---')).join(' '));
          const t4 = otherTile(rect.words[0]);
          await rpc(MCP_PORT, 'editor/paint_region', {
            section: SEC, x: rect.col, y: rect.row, w: RW, h: RH,
            entries: Array.from({ length: RW * RH }, () => ({ tile: t4, pal: 0 })),
          });
          const after4 = [];
          for (let dr = 0; dr < RH; dr++) {
            for (let dc = 0; dc < RW; dc++) {
              after4.push(await ntAt(c, SEC, (rect.row + dr) * STW + rect.col + dc));
            }
          }
          check('w4a', 'the bulk request painted every cell it named',
            after4.every((w) => (w & F.TILE) === t4),
            `sent tile ${t4}; cells now ${after4.map((w) => w & F.TILE).join(',')}`);
          check('w4', 'a BULK region keeps EACH cell\'s own priority — per cell, not per request',
            after4.every((w, i) => (w & F.PRI) === (rect.words[i] & F.PRI)),
            `before ${rect.words.map((w) => (w & F.PRI ? 1 : 0)).join('')}  `
            + `after ${after4.map((w) => (w & F.PRI ? 1 : 0)).join('')}`);

          // ── [w6] one request = one undo step, and it restores the WORD ──
          const canUndo = await c.evalExpr('window.__dbg.aeon.canUndo()');
          await key(c, 'z', 'KeyZ', 90, 2);
          await sleep(200);
          const undone = [];
          for (let dr = 0; dr < RH; dr++) {
            for (let dc = 0; dc < RW; dc++) {
              undone.push(await ntAt(c, SEC, (rect.row + dr) * STW + rect.col + dc));
            }
          }
          check('w6', 'ONE undo restores the whole 3x2 request, priority bits included',
            canUndo === true && undone.every((w, i) => w === rect.words[i]),
            `canUndo=${canUndo}  restored ${undone.map(hex).join(' ')}`);
          note('NON-DISCRIMINATING', '[w6] is green on the broken build too — `oldNt` was always '
            + 'captured whole. It is the anti-vacuous guard for [w4]: it proves the words [w4] '
            + 'read were really written by the request and are really undoable.');
        }
        await shot(c, 'w-agent-paint-region');
      }
      await undoAll('after the agent phase');
    }


    // ═══ [bg] the FOURTH site — the background plane (MapViewport ~:1755) ══
    //
    // WHICH FIXTURE THIS PHASE USES, AND WHY IT IS NOT A REAL CELL.
    //
    // Everywhere else in this file the destination is a REAL authored cell. Not
    // here, and the reason is a measurement: OJZ act 1's background carries
    // 4,088 drawn words, 1,876 hFlipped and 2,100 vFlipped — and ZERO with the
    // priority bit. There is no real high-priority background cell to paint
    // over, in this project or (per the same scan) any of its acts.
    //
    // The flips cannot stand in for it. Under this rule a flip FOLLOWS THE
    // BRUSH, so a background cell losing its hFlip to an unflipped stroke is
    // CORRECT behaviour, not the defect. A row asserting flip preservation here
    // would be asserting the opposite of the rule.
    //
    // So the phase is two steps, and the destination's non-zero bit is authored
    // by the APP'S OWN brush rather than fabricated by the harness:
    //
    //   [bg1] arm `Priority: on`, paint, and demand the bit appear. On master
    //         this is impossible — the site hard-cleared bit 15 — so the row is
    //         fully discriminating on its own.
    //   [bg2] return the brush to `keep`, paint the SAME cell again with a
    //         different tile, and demand the bit survive. Its destination now
    //         genuinely carries priority, and [bg1] is what proves it does.
    console.log('\n=== [bg] the background paint path, same word layout, same rule ===');
    await undoAll('before the background phase');
    await c.evalExpr("window.__dbg.aeon.setLayer('bg')");
    await sleep(200);

    const bgW = await c.evalExpr('(window.__dbg.aeon.bgWidth ? window.__dbg.aeon.bgWidth() : 64)');
    // Count what the background actually holds, so the claim above is measured
    // in THIS run rather than quoted from a scan done elsewhere.
    const bgStats = await c.json(String.raw`(() => {
      const d = window.__dbg.aeon; let words = 0, drawn = 0, pri = 0, hf = 0, vf = 0;
      for (let i = 0; i < 8192; i++) {
        const w = d.bgAt(i); if (w === null) break;
        words++;
        if (w & ${F.TILE}) drawn++;
        if (w & ${F.PRI}) pri++;
        if (w & ${F.HF}) hf++;
        if (w & ${F.VF}) vf++;
      }
      return { words, drawn, pri, hf, vf };
    })()`);
    note('the background as the app resolves it',
      `${bgStats.words} words · ${bgStats.drawn} drawn · ${bgStats.pri} priority · `
      + `${bgStats.hf} hFlip · ${bgStats.vf} vFlip  (source: ${await c.evalExpr('window.__dbg.aeon.bgSource()')})`);
    check('bg0', 'the background really has NO priority cells — so the fixture below must be app-authored',
      bgStats.pri === 0 && bgStats.drawn > 0,
      `${bgStats.pri} priority words among ${bgStats.drawn} drawn`);

    // Pick a drawn background cell well inside the plane.
    let bgSlot = null;
    for (let i = 0; i < bgStats.words; i++) {
      const w = await ntAtBg(c, i);
      if (w !== null && (w & F.TILE)) { bgSlot = { i, w }; break; }
    }
    if (bgSlot === null) {
      unmeasurable('bg1', 'the BG paint path authors and preserves priority',
        'no drawn background word found — the whole phase would be vacuous');
    } else {
      const bgCol = bgSlot.i % bgW, bgRow = Math.floor(bgSlot.i / bgW);
      note('bg subject', `slot ${bgSlot.i} = (${bgCol},${bgRow}) ${describe(bgSlot.w)}`);
      // The BG pick is a BLOB-LOCAL index; keep it small and in range.
      const bgTileA = ((bgSlot.w & F.TILE) + 1) & 0x3F || 1;
      const bgTileB = ((bgSlot.w & F.TILE) + 2) & 0x3F || 2;

      await c.evalExpr("document.getElementById('map-canvas').focus()");
      await key(c, 't', 'KeyT', 84);
      await sleep(120);

      async function paintBg(tile) {
        await c.evalExpr(`window.__dbg.aeon.setSelectedTile(${tile}, 0)`);
        const vxb = Math.max(0, bgCol * TILE_PX - 200), vyb = Math.max(0, bgRow * TILE_PX - 150);
        await setView(c, vxb, vyb, ZOOM);
        await sleep(120);
        const a = await aimAtCell(c, bgCol, bgRow, { x: 0, y: 0 });
        await mouse(c, 'mousePressed', a.x, a.y);
        await mouse(c, 'mouseReleased', a.x, a.y);
        await sleep(250);
        return { word: await ntAtBg(c, bgSlot.i), aim: a };
      }

      // [bg1] AUTHOR it. Impossible on master.
      await c.evalExpr(clickByTitle(String(chipOn)));
      await sleep(150);
      const bgOn = await paintBg(bgTileA);
      note('bg aim', `(${bgCol},${bgRow}) → integer client (${bgOn.aim.x},${bgOn.aim.y})`);
      check('bg1', 'the BG stroke can AUTHOR priority (the site goes through the same brush)',
        (bgOn.word & F.PRI) === F.PRI && (bgOn.word & F.TILE) === bgTileA,
        `before ${describe(bgSlot.w)}  after ${describe(bgOn.word)}  (armed tile ${bgTileA})`);

      // [bg2] and PRESERVE it, over a destination bg1 just proved is non-zero.
      await c.evalExpr(clickByTitle(String(chipKeep)));
      await sleep(150);
      check('bg2-pre', 'the preservation destination REALLY carries priority now',
        (bgOn.word & F.PRI) === F.PRI, describe(bgOn.word));
      const bgKeep = await paintBg(bgTileB);
      check('bg2', 'a "keep" BG stroke preserves that priority bit while changing the tile',
        (bgKeep.word & F.PRI) === F.PRI && (bgKeep.word & F.TILE) === bgTileB,
        `before ${describe(bgOn.word)}  after ${describe(bgKeep.word)}  (armed tile ${bgTileB})`);
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
    // SNAPSHOT THE TREE FIRST, THEN KILL. `child` is the xvfb-run WRAPPER, and
    // the Electron under it survives a kill on the wrapper — it keeps holding
    // its port and the discovery file it wrote. Reading the tree AFTER the
    // SIGTERM finds nothing: the orphans have already been reparented to init,
    // so they are no longer descendants of anything this harness knows about.
    // (Measured: two Electron processes outlived the first two runs of this
    // phase exactly that way.)
    await killTree(child);
    for (const d of restoreDiscoveryNow()) console.log(`cleanup: restored ${d}`);
    console.log(`cleanup: discovery on disk after restore:\n        ${readDiscoveryNow()}`);
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
