#!/usr/bin/env node
// CAN AN AUTHOR ACTUALLY PAINT A LOOP? — LP-2, the running app.
//
// Two things the node suite cannot see, and one of them is a build error in
// another repo:
//
//   1. "SOLID ON BOTH PATHS" — one stroke, two collision planes, one undo step.
//      The merge must happen against EACH plane's own destination cell. A single
//      merge broadcast to both would copy plane A's reserved bits onto plane B.
//   2. THE LOOP CROSSOVER — bits 15:14 of the per-plane word, per aeon's anchor
//      (`git -C ../aeon show aa2a9f29:docs/LOOP_CROSSOVER_ENCODING.md`). Per
//      plane the field has only TWO legal values: a plane-A cell carrying
//      "go to A" is a SELF-MARK that aeon's bake HARD-ERRORS on (rule R2). So a
//      both-planes stroke must write TO_B on A and TO_A on B — the opposite
//      values, not a copy.
//
// The ~5,500-row node suite cannot see React, a canvas, a mouse gesture or an
// IPC round trip. Both defects above are one line of a component away.
//
// ═══ THE ANTI-VACUITY PROBLEM, AND HOW EACH PHASE ESCAPES IT ═══
//
// Aeon measured all 18 shipped plane files at `fde35b2f`: bits 15:14 are ZERO
// in every one of 65,536 cells each. So there is NO real cell to paint over
// that could distinguish a correct writer from a broken one — `0` preserved and
// `0` copied from the other plane's `0` are the same sixteen bits.
//
// Unlike the nametable harness, which FINDS real priority cells, this one has
// nothing to find and says so: row [fx0] MEASURES that zero live, and every
// crossover row then AUTHORS its destination through `__dbg.aeon.collisionPoke`
// with a value it re-reads and THROWS on if it did not land.
//
// The both-planes rows author DIFFERENT crossover values into plane A and plane
// B, deliberately, so "each plane kept its own" and "one value was broadcast"
// are distinguishable. Two zeros would not be.
//
// ═══ ⚠ IT MUST NOT WRITE A CROSSOVER INTO THE OWNER'S REAL LEVEL DATA ═══
//
// `tools/repaint_ojz_collision.py::repaint_word` in aeon rebuilds a cell word
// from solidity and shape alone and DISCARDS bits 15:14 unconditionally. It has
// already been run against section 0. Until aeon's refusal guard lands, a
// crossover written into his files is a crossover a later re-run silently
// erases.
//
// So: this harness paints in MEMORY ONLY. It issues no save, the app has no
// autosave (shell/close-guard.ts), every poke is recorded and put back, and row
// [r1] asserts every touched cell is byte-identical to what this run found.
//
// ═══ THE BIT POSITIONS ARE NEVER TYPED HERE ═══
//
// §BITS parses the collision word's four fields out of `packCollisionCell`'s
// own body and the crossover field out of `layer-transition.ts`, then
// SELF-CHECKS that they are disjoint and that the crossover field is exactly
// the complement — and it cross-checks the running BUILD's own constants
// through `__dbg.aeon.crossoverEncoding()`, which is the only thing that can
// catch a stale `dist/`. A literal `0xC000` in this file would be the
// copied-pin defect the whole parcel is about.
//
// ═══ THE dpr TRAP ═══
//
// `devicePixelRatio` has been observed at both 1 and 1.35 on this box hours
// apart. Row [aim] prints dpr, the canvas rect and `canvas.width` and asserts
// the app's own contract; every aim is computed from `view()` read back off the
// store, rounded to an integer, and then VERIFIED by inverting the transform —
// an off-by-one is a thrown refusal, never a red feature row.
//
// ═══ THE TWO LIVE HAZARDS, BOTH HANDLED ═══
//
// The launched app OVERWRITES the shared discovery file ~/.aurora/mcp.json (the
// owner's Aurora publishes there too), and `child.kill()` kills the `xvfb-run`
// WRAPPER rather than the Electron under it. `snapshotDiscovery()` /
// `restoreDiscovery()` and `killTree()` run in the same `finally`, and the
// agent phase uses a port ONLY once the pid the file names is proven a
// descendant of the process this harness spawned — otherwise it reports
// UNMEASURABLE rather than painting into somebody else's document.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:loop-paint

// O16: the discovery/teardown machinery is SHARED, not pasted. This harness
// arrived on master carrying its own correct-but-private copies; they are
// replaced here so a future fix to the guard reaches this file too.
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawnGuarded, killTree, restoreDiscoveryNow, describeDiscovery,
         discoverySnapshot, resolveOwnedDiscovery, descendants } from './lib/harness-guard.mjs';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9414);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron'));
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-loop-paint`;
mkdirSync(SHOTS, { recursive: true });

// ── §BITS — the field layout, READ OUT OF THE APP'S OWN SOURCE ─────────────
const WORD_SRC = `${ROOT}/src/core/collision/collision-cell-word.ts`;
const XOVER_SRC = `${ROOT}/src/core/collision/layer-transition.ts`;
const TYPES_SRC = `${ROOT}/src/core/model/s4-types.ts`;

function collisionFields() {
  const src = readFileSync(WORD_SRC, 'utf8');
  const body = /export function packCollisionCell\([\s\S]*?\n\}/.exec(src)?.[0];
  if (!body) throw new Error(`could not find packCollisionCell in ${WORD_SRC}`);
  const mShape = /c\.shape\s*&\s*(0x[0-9A-Fa-f]+)/.exec(body);
  const mXf = /c\.xFlip\s*\?\s*(0x[0-9A-Fa-f]+)/.exec(body);
  const mYf = /c\.yFlip\s*\?\s*(0x[0-9A-Fa-f]+)/.exec(body);
  const mSol = /SOLIDITY_BITS\[c\.solidity\]\s*<<\s*(\d+)/.exec(body);
  if (!mShape || !mXf || !mYf || !mSol) {
    throw new Error('packCollisionCell no longer has the four-field shape this harness derives from. '
      + 'REFUSING TO GUESS bit positions.');
  }
  const f = {
    SHAPE: Number(mShape[1]), XF: Number(mXf[1]), YF: Number(mYf[1]),
    SOL_SHIFT: Number(mSol[1]), SOL: 0x3 << Number(mSol[1]),
  };
  f.OWNED = f.SHAPE | f.XF | f.YF | f.SOL;
  f.UNOWNED = (~f.OWNED) & 0xFFFF;
  const parts = [f.SHAPE, f.XF, f.YF, f.SOL];
  let union = 0;
  for (const p of parts) {
    if (union & p) throw new Error(`derived collision fields overlap: ${parts.map((x) => x.toString(16))}`);
    union |= p;
  }
  if (union !== f.OWNED) throw new Error('owned mask disagrees with the union of the fields');
  return f;
}
function crossoverField() {
  const src = readFileSync(XOVER_SRC, 'utf8');
  const shift = /export const CROSSOVER_SHIFT\s*=\s*(\d+)/.exec(src);
  const mask = /export const CROSSOVER_VALUE_MASK\s*=\s*(0x[0-9A-Fa-f]+|\d+)/.exec(src);
  const vals = {};
  for (const name of ['NONE', 'TO_A', 'TO_B', 'RESERVED']) {
    const m = new RegExp(`export const CROSSOVER_${name}\\s*=\\s*(\\d+)`).exec(src);
    if (!m) throw new Error(`CROSSOVER_${name} not found in ${XOVER_SRC}`);
    vals[name] = Number(m[1]);
  }
  if (!shift || !mask) throw new Error(`could not derive the crossover field out of ${XOVER_SRC}`);
  return { SHIFT: Number(shift[1]), VMASK: Number(mask[1]), BITS: Number(mask[1]) << Number(shift[1]), V: vals };
}
function sectionTilesWide() {
  const m = /export const SECTION_TILES_WIDE\s*=\s*(\d+)/.exec(readFileSync(TYPES_SRC, 'utf8'));
  if (!m) throw new Error(`could not read SECTION_TILES_WIDE out of ${TYPES_SRC}`);
  return Number(m[1]);
}
const F = collisionFields();
const X = crossoverField();
const STW = sectionTilesWide();

const hex = (w) => (w === null || w === undefined ? 'null' : `0x${(w >>> 0).toString(16).padStart(4, '0')}`);
const XNAME = ['none', 'to-a', 'to-b', 'RESERVED'];
const xoverOf = (w) => (w === null || w === undefined ? 'null' : XNAME[(w >> X.SHIFT) & X.VMASK]);
const describe = (w) => (w === null || w === undefined ? 'null'
  : `${hex(w)} [shape=${w & F.SHAPE} sol=${(w & F.SOL) >> F.SOL_SHIFT}`
    + `${w & F.XF ? ' XF' : ''}${w & F.YF ? ' YF' : ''} xover=${xoverOf(w)}]`);
/** A word with a chosen crossover, built from the DERIVED field. */
const withX = (word, v) => (((word & ~X.BITS) | (v << X.SHIFT)) & 0xFFFF);

// ── discovery-file and process hazards ─────────────────────────────────────
// Was: private copies of DISCOVERY_FILES / snapshotDiscovery / restoreDiscovery
// / descendants. Now imported from lib/harness-guard.mjs (O16). `descendants`
// is still used directly below to name the tree in the log.
function killPids(pids) {
  let n = 0;
  for (const pid of [...pids].reverse()) { try { process.kill(pid, 'SIGKILL'); n++; } catch { /* gone */ } }
  return n;
}

let rpcId = 1;
async function rpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/aether`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });
  return { status: res.status, body: await res.json() };
}

const TILE_PX = 8;
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
/** Rows that are green on master too — named in the OUTPUT, not only the packet. */
const nonDiscriminating = new Set();
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function checkNonDiscriminating(id, name, ok, detail) {
  nonDiscriminating.add(id);
  check(id, `${name}  [DOES NOT DISCRIMINATE]`, ok, detail);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
function unmeasurable(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: false });
  fails.push(`[${id}] ${name} (UNMEASURABLE: ${why})`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-loop-paint/${name}.png`);
}

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
const collAt = (c, s, p, i) => c.evalExpr(`window.__dbg.aeon.collisionAt(${s}, '${p}', ${i})`);
const poke = (c, s, p, i, w) => c.evalExpr(`window.__dbg.aeon.collisionPoke(${s}, '${p}', ${i}, ${w})`);
const audit = (c, s) => c.json(`window.__dbg.aeon.crossoverAudit(${s})`);
const bothLens = (c) => c.json('window.__dbg.aeon.bothPlanesLens()');
const xoverLens = (c) => c.json('window.__dbg.aeon.crossoverLens()');

/** The four 8px sub-tile indices of one 16px collision cell. */
const cellTiles = (cc, cr) => [
  (cr * 2) * STW + cc * 2, (cr * 2) * STW + cc * 2 + 1,
  (cr * 2 + 1) * STW + cc * 2, (cr * 2 + 1) * STW + cc * 2 + 1,
];

async function aimAtTile(c, col, row, origin) {
  const vp = await view(c);
  const rect = await c.json(String.raw`(() => {
    const b = document.getElementById('map-canvas').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  })()`);
  const worldX = origin.x + col * TILE_PX + TILE_PX / 2;
  const worldY = origin.y + row * TILE_PX + TILE_PX / 2;
  const x = Math.round(rect.left + (worldX - vp.x) * vp.zoom);
  const y = Math.round(rect.top + (worldY - vp.y) * vp.zoom);
  const backCol = Math.floor(((x - rect.left) / vp.zoom + vp.x - origin.x) / TILE_PX);
  const backRow = Math.floor(((y - rect.top) / vp.zoom + vp.y - origin.y) / TILE_PX);
  if (backCol !== col || backRow !== row) {
    throw new Error(`AIM REFUSED: meant tile (${col},${row}), integer (${x},${y}) lands in `
      + `(${backCol},${backRow}). vp=${JSON.stringify(vp)} rect=${JSON.stringify(rect)}`);
  }
  // ⚠ AND IT MUST BE ON THE CANVAS. Landing in the right CELL is not enough:
  // a cell scrolled past the right edge still inverts to the cell you meant,
  // because the transform is affine and does not know where the canvas stops.
  // CDP happily dispatches a mouse event at a coordinate outside the element,
  // nothing handles it, and the whole thing presents as "the drag did not
  // paint" — a red feature row about a parking mistake. Measured: the drag
  // phase's far cell was 49 px past the right edge on the first run and all
  // three of its rows went red.
  const inRect = x >= rect.left && x < rect.left + rect.width
              && y >= rect.top && y < rect.top + rect.height;
  if (!inRect) {
    throw new Error(`AIM REFUSED: tile (${col},${row}) is OFF THE CANVAS at integer (${x},${y}); `
      + `rect is (${rect.left},${rect.top}) ${rect.width}x${rect.height}. Park the viewport so the `
      + 'whole gesture fits before aiming — this is a harness bug, not a feature failure.');
  }
  return { x, y, vp, rect };
}

/** Click a palette chip by its `title` — the real control, not a store poke. */
const clickByTitle = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('button')].find((e) => ${re}.test(e.getAttribute('title') || ''));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

// ── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== DERIVED FIELDS (from ${WORD_SRC.replace(ROOT + '/', '')} and ${XOVER_SRC.replace(ROOT + '/', '')}) ===`);
  console.log(`  shape ${hex(F.SHAPE)} · xFlip ${hex(F.XF)} · yFlip ${hex(F.YF)} · solidity ${hex(F.SOL)} (<<${F.SOL_SHIFT})`);
  console.log(`  OWNED by the shape brush = ${hex(F.OWNED)}`);
  console.log(`  CROSSOVER field          = ${hex(X.BITS)} (<<${X.SHIFT}, mask ${X.VMASK})`
    + `  values none=${X.V.NONE} to-a=${X.V.TO_A} to-b=${X.V.TO_B} RESERVED=${X.V.RESERVED}`);
  console.log(`  SECTION_TILES_WIDE = ${STW}`);
  console.log('  peer anchor: git -C ../aeon show aa2a9f29:docs/LOOP_CROSSOVER_ENCODING.md');
  if ((F.OWNED & X.BITS) !== 0) {
    throw new Error(`DERIVATION SELF-CHECK FAILED: the crossover field ${hex(X.BITS)} overlaps the `
      + `shape brush's owned mask ${hex(F.OWNED)}. Refusing to run.`);
  }
  if (X.BITS !== F.UNOWNED) {
    throw new Error(`DERIVATION SELF-CHECK FAILED: crossover ${hex(X.BITS)} is not the complement of `
      + `owned ${hex(F.OWNED)} (${hex(F.UNOWNED)}). One of the two derivations is wrong.`);
  }

  if (!(await portFree())) throw new Error(`port ${PORT} already serving a CDP target — kill it first`);
  // spawnGuarded takes the discovery snapshot itself, on its first call, and
  // registers this pid as an owned root for resolveOwnedDiscovery.
  const child = spawnGuarded('/usr/bin/xvfb-run', [
    '-a', '--server-args=-screen 0 1600x1000x24',
    ELECTRON, '.', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  ], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  console.log(`  discovery snapshot: ${describeDiscovery(discoverySnapshot())}`);
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  /** Every cell this run poked or painted, with the word it found there. */
  const restore = [];
  let c;
  try {
    const ws = await waitForTarget();
    c = cdp(ws);
    await c.ready;

    let hasDbg = 'undefined';
    for (let i = 0; i < 60; i++) {
      hasDbg = await c.evalExpr('typeof window.__dbg');
      if (hasDbg === 'object') break;
      await sleep(500);
    }
    if (hasDbg !== 'object') throw new Error('window.__dbg absent after 30s — needs a VITE_AURORA_DEBUG=1 build of dist/');
    for (const hook of ['collisionPoke', 'crossoverAudit', 'crossoverEncoding', 'crossoverLens', 'bothPlanesLens']) {
      if ((await c.evalExpr(`typeof window.__dbg.aeon.${hook}`)) !== 'function') {
        throw new Error(`__dbg.aeon.${hook} absent — dist/ predates this parcel; rebuild with VITE_AURORA_DEBUG=1`);
      }
    }

    // ── [enc] THE RUNNING BUILD'S OWN CONSTANTS ──────────────────────────
    //
    // The only row that can catch a STALE dist/. Everything else in this file
    // reads source; this reads what is actually executing.
    const encRun = await c.json('window.__dbg.aeon.crossoverEncoding()');
    note('encoding, as the RUNNING build holds it', JSON.stringify(encRun));
    check('enc', 'the running build\'s crossover encoding matches the source module (dist is not stale)',
      encRun.shift === X.SHIFT && encRun.valueMask === X.VMASK && encRun.bits === X.BITS
      && encRun.none === X.V.NONE && encRun.toA === X.V.TO_A && encRun.toB === X.V.TO_B
      && encRun.reserved === X.V.RESERVED,
      `run ${JSON.stringify(encRun)} vs source shift=${X.SHIFT} mask=${X.VMASK} bits=${hex(X.BITS)}`);

    console.log('\n=== OPENING THE REAL AEON PROJECT ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    for (let i = 0; i < 60; i++) {
      const st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) { note('project open', JSON.stringify(st)); break; }
      await sleep(500);
    }
    const st0 = await c.json('window.__dbg.aeon.state()');
    if (!st0.open) throw new Error('aeon project never opened');

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

    const SEC = 0;
    const origin = await c.json(`window.__dbg.aeon.sectionOrigin ? window.__dbg.aeon.sectionOrigin(${SEC}) : {x:0,y:0}`);
    note('section 0 world origin', JSON.stringify(origin));

    // ── arm the collision tool, facet FIRST ──────────────────────────────
    //
    // Tool hotkeys are facet-scoped and `paint-collision` lives only on the
    // collision facet. The collision-preservation harness pressed 'c' on Layout
    // once, armed nothing, and both of its preservation rows went GREEN ON THE
    // BROKEN BUILD — green on the ABSENCE of a stroke. [arm] is fatal here.
    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");
    const facet = await c.json("window.__dbg.aeon.setFacet('collision')");
    await c.evalExpr("document.getElementById('map-canvas').focus()");
    await key(c, 'c', 'KeyC', 67);
    await sleep(150);
    const toolNow = (await c.json('window.__dbg.aeon.state()')).tool;
    check('arm', "the REAL hotkey 'c' armed paint-collision on the collision facet",
      toolNow === 'paint-collision', `facet=${facet?.facet} tool=${toolNow}`);
    if (toolNow !== 'paint-collision') {
      throw new Error('paint-collision never armed — every gesture row below would measure a stroke '
        + 'that did not happen and would go green on its absence. Refusing to run them.');
    }

    // ── §FIXTURES ────────────────────────────────────────────────────────
    console.log('\n=== §FIXTURES: what section 0 actually holds ===');
    const a0 = await audit(c, SEC);
    if (!a0) throw new Error('crossoverAudit returned null — section 0 is not loaded');
    note('section 0, both planes, as the app holds it',
      `${a0.cells} cells · ${a0.solidBoth} solid on BOTH · ${a0.divergent} solid on exactly one · `
      + `${a0.marksA} crossovers on A · ${a0.marksB} on B · severity ${a0.severity}`);
    check('fx0', 'ZERO real cells carry a crossover — so a row painting over real content would be VACUOUS',
      a0.marksA === 0 && a0.marksB === 0 && a0.reserved === 0,
      `marksA=${a0.marksA} marksB=${a0.marksB} reserved=${a0.reserved} — this zero is WHY every `
      + 'crossover row below authors its own fixture');
    check('fx1', 'section 0 holds REAL authored collision, so the both-planes rows are not over an empty section',
      a0.solidBoth + a0.divergent > 0,
      `solidBoth=${a0.solidBoth} divergent=${a0.divergent}`);

    async function parkAndAim(col, row) {
      await setView(c, Math.max(0, origin.x + col * TILE_PX - 200), Math.max(0, origin.y + row * TILE_PX - 150), ZOOM);
      await sleep(120);
      return aimAtTile(c, col, row, origin);
    }

    /**
     * AUTHOR one collision cell on ONE plane with a chosen crossover, and
     * REFUSE to continue unless it really landed. Records the prior word so
     * [r1] can put it back.
     */
    async function seed(cellCol, cellRow, plane, ownedWord, xValue) {
      const idx = cellTiles(cellCol, cellRow);
      const want = withX(ownedWord & F.OWNED, xValue);
      for (const i of idx) {
        const was = await collAt(c, SEC, plane, i);
        restore.push({ plane, index: i, word: was ?? 0 });
        if ((await poke(c, SEC, plane, i, want)) === null) {
          throw new Error(`FIXTURE REFUSED: collisionPoke(${SEC},${plane},${i}) returned null`);
        }
      }
      const back = [];
      for (const i of idx) back.push(await collAt(c, SEC, plane, i));
      if (!back.every((w) => w === want)) {
        throw new Error(`FIXTURE REFUSED: cell (${cellCol},${cellRow}) plane ${plane} did not read back `
          + `as ${describe(want)} — got ${back.map(describe).join(' · ')}. Rows using it would be vacuous.`);
      }
      return { idx, want, back };
    }

    /**
     * The ORIGINAL word at a cell — the first time this run saw it, before any
     * seeding. Later seeds of the same cell must not become its "original".
     */
    function originalOf(plane, index) {
      const hit = restore.find((r) => r.plane === plane && r.index === index);
      return hit ? hit.word : null;
    }

    /**
     * Rewind the document to where this run found it: undo every COMMAND, then
     * put back every cell any phase POKED.
     *
     * ⚠ THE SECOND HALF IS NOT OPTIONAL AND ITS ABSENCE COST TWO ROWS.
     *
     * `collisionPoke` is a fixture writer — it bypasses the command stack on
     * purpose, so no amount of Ctrl+Z removes a seed. The first run of this
     * harness rewound only the commands, so the [o] phase inherited the [x]
     * phase's two-way pair and measured `pairs=4, oneWay=4` on a section it
     * believed held one one-way mark. Both [o] rows failed, and they failed
     * describing the harness rather than the app.
     *
     * That is precisely the failure the tile-attribute harness's `undoAll`
     * exists to prevent, one mechanism further down: it only ever had commands
     * to rewind, and this file has commands AND pokes.
     */
    async function rewind(label) {
      let n = 0;
      while (n < 30 && (await c.evalExpr('window.__dbg.aeon.canUndo()'))) {
        await key(c, 'z', 'KeyZ', 90, 2);
        await sleep(120);
        n++;
      }
      const seen = new Set();
      let poked = 0;
      for (const { plane, index } of restore) {
        const k = `${plane}:${index}`;
        if (seen.has(k)) continue;
        seen.add(k);
        await poke(c, SEC, plane, index, originalOf(plane, index));
        poked++;
      }
      note('rewind', `${label}: ${n} undo step(s) + ${poked} seeded cell(s) put back`);
    }
    const undoAll = rewind;

    // A seed shape that DIFFERS from the armed brush, so a control row can tell
    // "the stroke landed" from "nothing happened".
    const SEED_OWNED = (0x2A5 & F.SHAPE) | F.YF | (0x1 << F.SOL_SHIFT);

    // ═══ [b] "SOLID ON BOTH PATHS" — one press, two planes ════════════════
    console.log('\n=== [b] the A+B brush: one REAL press, both collision planes ===');
    const armedB = await c.json(
      "window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', xFlip: true, "
      + "yFlip: false, brush: 1, bothPlanes: true, crossover: 'keep' })");
    note('armed brush', `plane ${armedB.plane} · bothPlanes ${armedB.bothPlanes} · `
      + `crossover ${armedB.crossover} · word ${describe(armedB.word)}`);
    check('b0', 'the A+B mode is armed through the app\'s own setter, and the brush word is non-air',
      armedB.bothPlanes === true && (armedB.word & F.SHAPE) !== 0 && (armedB.word & X.BITS) === 0,
      `bothPlanes=${armedB.bothPlanes} word=${describe(armedB.word)}`);
    check('b0b', 'arming A+B SURFACED the both-planes lens (the author can see the plane they are not on)',
      (await c.json('window.__dbg.overlays ? window.__dbg.overlays() : null'))?.showSolidBothPlanes === true
        || (await bothLens(c)).active === true,
      JSON.stringify(await bothLens(c)));

    const B_CELL = { col: 6, row: 6 };
    // ⚠ DIFFERENT crossover values on the two planes, deliberately. Two zeros
    // could not tell "each plane kept its own" from "one value was broadcast".
    const bA = await seed(B_CELL.col, B_CELL.row, 'a', SEED_OWNED, X.V.TO_B);
    const bB = await seed(B_CELL.col, B_CELL.row, 'b', SEED_OWNED, X.V.TO_A);
    check('b1', 'the two planes REALLY carry DIFFERENT crossovers before the stroke (NOT vacuous)',
      bA.back.every((w) => xoverOf(w) === 'to-b') && bB.back.every((w) => xoverOf(w) === 'to-a'),
      `A ${describe(bA.back[0])}\n        B ${describe(bB.back[0])}`);

    const aimB = await parkAndAim(B_CELL.col * 2, B_CELL.row * 2);
    note('aim', `cell (${B_CELL.col},${B_CELL.row}) → tile (${B_CELL.col * 2},${B_CELL.row * 2}) `
      + `→ integer client (${aimB.x},${aimB.y}) via view ${JSON.stringify(aimB.vp)}`);
    await mouse(c, 'mousePressed', aimB.x, aimB.y);
    await mouse(c, 'mouseReleased', aimB.x, aimB.y);
    await sleep(250);
    const afterBA = []; for (const i of bA.idx) afterBA.push(await collAt(c, SEC, 'a', i));
    const afterBB = []; for (const i of bB.idx) afterBB.push(await collAt(c, SEC, 'b', i));
    note('words', `A after ${afterBA.map(describe).join('\n                ')}`);
    note('words', `B after ${afterBB.map(describe).join('\n                ')}`);

    // The anti-vacuous half FIRST.
    check('b2', 'CONTROL: the press wrote the armed brush into plane A (the aimed plane)',
      afterBA.every((w) => (w & F.OWNED) === (armedB.word & F.OWNED)),
      `armed ${hex(armedB.word & F.OWNED)} got ${afterBA.map((w) => hex(w & F.OWNED)).join(' ')}`);
    check('b3', '⚠ ONE press also wrote plane B — the second plane is not left half-finished',
      afterBB.every((w) => (w & F.OWNED) === (armedB.word & F.OWNED)),
      `armed ${hex(armedB.word & F.OWNED)} got ${afterBB.map((w) => hex(w & F.OWNED)).join(' ')} `
      + `(seed owned was ${hex(bB.want & F.OWNED)})`);
    check('b4', '⚠ each plane kept ITS OWN crossover — the merge was NOT computed once and broadcast',
      afterBA.every((w) => xoverOf(w) === 'to-b') && afterBB.every((w) => xoverOf(w) === 'to-a'),
      `A xover ${afterBA.map(xoverOf).join(' ')} (want to-b) · B xover ${afterBB.map(xoverOf).join(' ')} (want to-a)`);
    await shot(c, 'b-both-planes-press');

    // ── [u] ONE gesture, ONE undo, BOTH planes ───────────────────────────
    await key(c, 'z', 'KeyZ', 90, 2);
    await sleep(200);
    const undoA = []; for (const i of bA.idx) undoA.push(await collAt(c, SEC, 'a', i));
    const undoB = []; for (const i of bB.idx) undoB.push(await collAt(c, SEC, 'b', i));
    check('u1', '⚠ ONE undo restores BOTH planes exactly — a both-planes stroke is one step',
      undoA.every((w) => w === bA.want) && undoB.every((w) => w === bB.want),
      `A ${undoA.map(hex).join(' ')} want ${hex(bA.want)} · B ${undoB.map(hex).join(' ')} want ${hex(bB.want)}`);

    // ═══ [d] THE DRAG — handleMouseMove, the OTHER caller of the same function ═
    //
    // The claim "press and drag share one function, so one fix covers both" is a
    // READING of MapViewport until a drag is actually driven. It was measured
    // for the SHAPE brush by the collision-preservation harness; the A+B mode
    // and the crossover brush are new state that the drag path reads through its
    // own latched refs (`paintBothPlanes`, `paintCrossover`), so it is a
    // different claim and gets its own rows.
    console.log('\n=== [d] a REAL drag: the far cell gets both planes and both values ===');
    await undoAll('before the drag phase');
    await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', "
      + "xFlip: true, yFlip: false, brush: 1, bothPlanes: true, crossover: 'hand-off' })");
    const D_FROM = { col: 30, row: 12 };
    const D_TO = { col: 34, row: 12 };
    const dFromA = await seed(D_FROM.col, D_FROM.row, 'a', SEED_OWNED, X.V.NONE);
    await seed(D_FROM.col, D_FROM.row, 'b', SEED_OWNED, X.V.NONE);
    const dToA = await seed(D_TO.col, D_TO.row, 'a', SEED_OWNED, X.V.NONE);
    const dToB = await seed(D_TO.col, D_TO.row, 'b', SEED_OWNED, X.V.NONE);
    check('d0', 'the drag DESTINATION carries no crossover and the seed shape before the drag',
      dToA.back.every((w) => xoverOf(w) === 'none' && (w & F.OWNED) === (dToA.want & F.OWNED)),
      `${describe(dToA.back[0])}`);

    // WORLD px, and at zoom 4 the canvas spans only ~219 of them — so the margin
    // has to leave room for the whole drag, not just its start. `aimAtTile`
    // refuses loudly if it does not.
    await setView(c, Math.max(0, origin.x + D_FROM.col * 2 * TILE_PX - 40),
      Math.max(0, origin.y + D_FROM.row * 2 * TILE_PX - 40), ZOOM);
    await sleep(150);
    const aimFrom = await aimAtTile(c, D_FROM.col * 2, D_FROM.row * 2, origin);
    const aimTo = await aimAtTile(c, D_TO.col * 2, D_TO.row * 2, origin);
    note('aim', `drag cell (${D_FROM.col},${D_FROM.row}) to (${D_TO.col},${D_TO.row}) = integer client `
      + `(${aimFrom.x},${aimFrom.y}) to (${aimTo.x},${aimTo.y})`);
    await mouse(c, 'mousePressed', aimFrom.x, aimFrom.y);
    // Intermediate moves, so the drag really traverses rather than teleporting.
    for (let k = 1; k <= 6; k++) {
      const t = k / 6;
      await mouse(c, 'mouseMoved',
        Math.round(aimFrom.x + (aimTo.x - aimFrom.x) * t),
        Math.round(aimFrom.y + (aimTo.y - aimFrom.y) * t), 1);
      await sleep(30);
    }
    await mouse(c, 'mouseReleased', aimTo.x, aimTo.y);
    await sleep(300);
    const dAfterA = []; for (const i of dToA.idx) dAfterA.push(await collAt(c, SEC, 'a', i));
    const dAfterB = []; for (const i of dToB.idx) dAfterB.push(await collAt(c, SEC, 'b', i));
    note('words', `far cell A ${dAfterA.map(describe).join('\n                     ')}`);
    note('words', `far cell B ${dAfterB.map(describe).join('\n                     ')}`);
    check('d1', 'CONTROL: the DRAG reached the far cell at all (its shape changed)',
      dAfterA.every((w) => (w & F.OWNED) !== (dToA.want & F.OWNED)),
      `${dAfterA.map((w) => hex(w & F.OWNED)).join(' ')} vs seed ${hex(dToA.want & F.OWNED)}`);
    check('d2', 'the DRAG wrote BOTH planes at the far cell — the A+B mode survives the move path',
      dAfterA.every((w) => (w & F.OWNED) === (armedB.word & F.OWNED))
      && dAfterB.every((w) => (w & F.OWNED) === (armedB.word & F.OWNED)),
      `A ${dAfterA.map((w) => hex(w & F.OWNED)).join(' ')} · B ${dAfterB.map((w) => hex(w & F.OWNED)).join(' ')}`);
    check('d3', "the DRAG wrote each plane's OWN crossover value at the far cell",
      dAfterA.every((w) => xoverOf(w) === 'to-b') && dAfterB.every((w) => xoverOf(w) === 'to-a'),
      `A ${dAfterA.map(xoverOf).join(' ')} · B ${dAfterB.map(xoverOf).join(' ')}`);
    await key(c, 'z', 'KeyZ', 90, 2);
    await sleep(250);
    const dBackFar = await collAt(c, SEC, 'a', dToA.idx[0]);
    const dBackNear = await collAt(c, SEC, 'a', dFromA.idx[0]);
    check('d4', 'the WHOLE drag is still ONE undo step — both ends revert together',
      dBackFar === dToA.want && dBackNear === dFromA.want,
      `far ${hex(dBackFar)} want ${hex(dToA.want)} · near ${hex(dBackNear)} want ${hex(dFromA.want)}`);
    await shot(c, 'd-drag-both-planes');

    // ── [l] the both-planes LENS actually drew ───────────────────────────
    //
    // ⚠ THE VIEWPORT HAS TO BE PARKED WHERE THE CELLS ARE, and the first run of
    // this phase was not. The lens is WINDOWED to the viewport by design (a
    // section is 128x128 cells and an act holds 9 of them here, so an unwindowed
    // scan would cost the frame budget), and section 0's 1,056 solid-on-both
    // cells are not at the origin. Parked at (0,0) the lens correctly reported
    // `active, sectionsWithPlaneB=9, veils=0` — a true statement about an empty
    // window, and a row that read it as a feature failure.
    //
    // So the phase FINDS a real solid-on-both cell through the app's own
    // accessor and parks on it. That is also what makes the row non-vacuous:
    // it names the cell, and it dies if the search comes up empty.
    await undoAll('before the lens phase');
    const planeAAll = await c.json(`window.__dbg.aeon.collRect(${SEC}, 0, 0, ${STW}, ${STW}, 'a')`);
    const planeBAll = await c.json(`window.__dbg.aeon.collRect(${SEC}, 0, 0, ${STW}, ${STW}, 'b')`);
    if (!planeAAll || !planeBAll) throw new Error('collRect returned null — section 0 has no authored plane');
    const solid = (w) => (w & F.SHAPE) !== 0 && ((w & F.SOL) >> F.SOL_SHIFT) !== 0;
    let bothCell = null;
    for (let i = 0; i < planeAAll.length && !bothCell; i++) {
      if (solid(planeAAll[i]) && solid(planeBAll[i])) {
        bothCell = { tileCol: i % STW, tileRow: Math.floor(i / STW), a: planeAAll[i], b: planeBAll[i] };
      }
    }
    check('l0', 'a REAL cell solid on BOTH planes was found to park the lens on (the row is not vacuous)',
      !!bothCell,
      bothCell ? `tile (${bothCell.tileCol},${bothCell.tileRow}) A=${describe(bothCell.a)} B=${describe(bothCell.b)}`
               : 'none found — [l1] below would be measuring an empty window');
    if (!bothCell) throw new Error('no solid-on-both cell in section 0 — refusing to run [l1]');
    await c.evalExpr("window.__dbg.setOverlay('showSolidBothPlanes', true)");
    await setView(c, Math.max(0, bothCell.tileCol * TILE_PX - 200),
      Math.max(0, bothCell.tileRow * TILE_PX - 150), 2);
    await sleep(400);
    const bl = await bothLens(c);
    note('both-planes lens report', JSON.stringify(bl));
    check('l1', 'the both-planes lens RAN and veiled real cells (active, plane B present, veils > 0)',
      bl.active === true && bl.reason === null && bl.sectionsWithPlaneB > 0 && bl.veils > 0,
      `active=${bl.active} reason=${bl.reason} sectionsWithPlaneB=${bl.sectionsWithPlaneB} veils=${bl.veils} paints=${bl.paints}`);
    // CONTROL: the toggle is what drives it, not the mere presence of the cells.
    await c.evalExpr("window.__dbg.setOverlay('showSolidBothPlanes', false)");
    await c.evalExpr('window.__dbg.aeon.repaint && window.__dbg.aeon.repaint()');
    await setView(c, Math.max(0, bothCell.tileCol * TILE_PX - 201),
      Math.max(0, bothCell.tileRow * TILE_PX - 150), 2);
    await sleep(400);
    const blOff = await bothLens(c);
    check('l2', 'CONTROL: with the toggle OFF the same window veils NOTHING and says why',
      blOff.active === false && blOff.reason === 'off' && blOff.veils === 0 && blOff.paints > bl.paints,
      `active=${blOff.active} reason=${blOff.reason} veils=${blOff.veils} paints=${blOff.paints} (was ${bl.paints})`);
    await c.evalExpr("window.__dbg.setOverlay('showSolidBothPlanes', true)");
    await shot(c, 'l-both-planes-lens');

    // ═══ [x] THE LOOP CROSSOVER — a REAL press with the hand-off brush ════
    console.log('\n=== [x] the crossover brush: a REAL press writes a two-way handoff ===');
    await undoAll('before the crossover phase');

    // Arm through the REAL chip, by its title, not a store poke.
    const clicked = await c.evalExpr(clickByTitle('/Mark each painted cell/'));
    check('x0', 'the REAL "hand-off" chip exists in the collision palette and was clicked',
      clicked === true, `click → ${clicked}`);
    const armedX = await c.json('window.__dbg.aeon.armCollisionBrush({})');
    check('x0b', 'clicking it armed the crossover brush AND surfaced the crossover lens',
      armedX.crossover === 'hand-off' && (await xoverLens(c)).active === true,
      `brush=${armedX.crossover} lens=${JSON.stringify(await xoverLens(c))}`);
    if (armedX.crossover !== 'hand-off') {
      throw new Error('the crossover brush never armed — every row below would measure a stroke that '
        + 'wrote nothing to the field. Refusing to run them.');
    }

    const X_CELL = { col: 10, row: 8 };
    const xA = await seed(X_CELL.col, X_CELL.row, 'a', SEED_OWNED, X.V.NONE);
    const xB = await seed(X_CELL.col, X_CELL.row, 'b', SEED_OWNED, X.V.NONE);
    check('x1', 'the destination carries NO crossover before the stroke (NOT vacuous)',
      xA.back.every((w) => xoverOf(w) === 'none') && xB.back.every((w) => xoverOf(w) === 'none'),
      `A ${xoverOf(xA.back[0])} · B ${xoverOf(xB.back[0])}`);

    const aimX = await parkAndAim(X_CELL.col * 2, X_CELL.row * 2);
    note('aim', `cell (${X_CELL.col},${X_CELL.row}) → integer client (${aimX.x},${aimX.y})`);
    await mouse(c, 'mousePressed', aimX.x, aimX.y);
    await mouse(c, 'mouseReleased', aimX.x, aimX.y);
    await sleep(250);
    const xAfterA = []; for (const i of xA.idx) xAfterA.push(await collAt(c, SEC, 'a', i));
    const xAfterB = []; for (const i of xB.idx) xAfterB.push(await collAt(c, SEC, 'b', i));
    note('words', `A after ${xAfterA.map(describe).join('\n                ')}`);
    note('words', `B after ${xAfterB.map(describe).join('\n                ')}`);

    check('x2', '⚠ the press wrote a crossover into plane A — "leave A" = to-b',
      xAfterA.every((w) => xoverOf(w) === 'to-b'),
      `got ${xAfterA.map(xoverOf).join(' ')}`);
    check('x3', '⚠ the SAME press wrote the OPPOSITE value into plane B — "leave B" = to-a',
      xAfterB.every((w) => xoverOf(w) === 'to-a'),
      `got ${xAfterB.map(xoverOf).join(' ')} — a copy of A\'s value would be to-b, which is a SELF-MARK `
      + "and a HARD BUILD ERROR in aeon's bake (rule R2)");
    check('x4', 'NOTHING anywhere reached the RESERVED value 3',
      ![...xAfterA, ...xAfterB].some((w) => xoverOf(w) === 'RESERVED'),
      `A ${xAfterA.map(xoverOf).join(' ')} · B ${xAfterB.map(xoverOf).join(' ')}`);

    const aPair = await audit(c, SEC);
    check('x5', 'the paint-time audit sees a COMPLETE two-way crossover: pairs>0, oneWay=0, selfMarks=0',
      aPair.pairs > 0 && aPair.oneWay === 0 && aPair.selfMarks === 0 && aPair.reserved === 0,
      `pairs=${aPair.pairs} oneWay=${aPair.oneWay} selfMarks=${aPair.selfMarks} reserved=${aPair.reserved} `
      + `severity=${aPair.severity}`);
    const xl = await xoverLens(c);
    note('crossover lens report', JSON.stringify(xl));
    check('x6', 'the crossover lens drew the PAIRED colour and no one-way colour',
      xl.active === true && xl.pairedVeils > 0 && xl.oneWayVeils === 0,
      `paired=${xl.pairedVeils} oneWay=${xl.oneWayVeils} plane=${xl.plane} paints=${xl.paints}`);
    await shot(c, 'x-crossover-pair');

    // ── [o] A ONE-WAY crossover — the mistake nothing else can see ────────
    //
    // THE ROW THIS PARCEL WAS ASSIGNED. Aeon's build does NOT check reachability
    // (anchor §8.2: "Aurora checks the loop"), and on the map a half-painted
    // loop looks identical to a finished one, because each plane's collision
    // overlay is drawn separately.
    console.log('\n=== [o] a ONE-WAY crossover: painted on one plane only ===');
    await undoAll('before the one-way phase');
    await c.json("window.__dbg.aeon.armCollisionBrush({ bothPlanes: false, crossover: 'hand-off' })");
    const O_CELL = { col: 14, row: 8 };
    const oA = await seed(O_CELL.col, O_CELL.row, 'a', SEED_OWNED, X.V.NONE);
    const oB = await seed(O_CELL.col, O_CELL.row, 'b', SEED_OWNED, X.V.NONE);
    const aPre = await audit(c, SEC);
    check('o0', 'the section carries NO crossover before this phase — the rewind really rewound',
      aPre.marksA === 0 && aPre.marksB === 0,
      `marksA=${aPre.marksA} marksB=${aPre.marksB} — a non-zero here means an earlier phase's `
      + 'fixture survived, and [o2]/[o3] below would be measuring it instead of this stroke');
    const aimO = await parkAndAim(O_CELL.col * 2, O_CELL.row * 2);
    await mouse(c, 'mousePressed', aimO.x, aimO.y);
    await mouse(c, 'mouseReleased', aimO.x, aimO.y);
    await sleep(250);
    const oAfterA = []; for (const i of oA.idx) oAfterA.push(await collAt(c, SEC, 'a', i));
    const oAfterB = []; for (const i of oB.idx) oAfterB.push(await collAt(c, SEC, 'b', i));
    check('o1', 'CONTROL: with A+B OFF the stroke marked plane A and left plane B unmarked',
      oAfterA.every((w) => xoverOf(w) === 'to-b') && oAfterB.every((w) => xoverOf(w) === 'none'),
      `A ${oAfterA.map(xoverOf).join(' ')} · B ${oAfterB.map(xoverOf).join(' ')}`);
    const aOne = await audit(c, SEC);
    check('o2', '⚠ the audit FLAGS it: oneWay > 0 and severity is "warn" — a loop that works one way',
      aOne.oneWay > 0 && aOne.severity === 'warn' && aOne.pairs === 0,
      `oneWay=${aOne.oneWay} pairs=${aOne.pairs} severity=${aOne.severity} first at index ${aOne.oneWayAt?.[0]}`);
    const xl2 = await xoverLens(c);
    check('o3', '⚠ the lens draws it in the ONE-WAY colour, not the paired one',
      xl2.oneWayVeils > 0 && xl2.pairedVeils === 0,
      `paired=${xl2.pairedVeils} oneWay=${xl2.oneWayVeils}`);
    await shot(c, 'o-one-way-crossover');

    // ── [s] the SELF-MARK refusal, for data that did not come from the brush ─
    console.log('\n=== [s] the self-mark refusal ===');
    const refuseA = await c.evalExpr("window.__dbg.aeon.crossoverRefusal('a', 'to-a')");
    const refuseB = await c.evalExpr("window.__dbg.aeon.crossoverRefusal('b', 'to-b')");
    const allowA = await c.evalExpr("window.__dbg.aeon.crossoverRefusal('a', 'to-b')");
    check('s1', 'the app REFUSES a self-mark on either plane and names the plane to use instead',
      typeof refuseA === 'string' && /plane B/.test(refuseA)
      && typeof refuseB === 'string' && /plane A/.test(refuseB),
      `A: ${refuseA}\n        B: ${refuseB}`);
    check('s2', 'CONTROL: the LEGAL value on the same plane is allowed — it is not refusing everything',
      allowA === null, `crossoverRefusal('a','to-b') → ${allowA}`);
    // A poked self-mark is data the brush cannot make; the audit must still see it.
    await undoAll('before the self-mark audit row');
    const S_CELL = { col: 18, row: 8 };
    await seed(S_CELL.col, S_CELL.row, 'a', SEED_OWNED, X.V.TO_A);   // ILLEGAL on plane A
    const aSelf = await audit(c, SEC);
    check('s3', '⚠ the audit catches a self-mark that arrived from somewhere other than the brush',
      aSelf.selfMarks > 0 && aSelf.severity === 'error',
      `selfMarks=${aSelf.selfMarks} severity=${aSelf.severity} first at index ${aSelf.selfMarkAt?.[0]}`);
    // ...and the reserved value 3, which nothing in Aurora can author at all.
    const R_CELL = { col: 20, row: 8 };
    await seed(R_CELL.col, R_CELL.row, 'a', SEED_OWNED, X.V.RESERVED);
    const aRes = await audit(c, SEC);
    check('s4', '⚠ the audit catches the RESERVED value 3 and does not count it as a crossover',
      aRes.reserved > 0 && aRes.severity === 'error',
      `reserved=${aRes.reserved} marksA=${aRes.marksA} severity=${aRes.severity}`);
    // The two illegal fixtures are put back by `rewind` at the top of the next
    // phase, along with every other seed — one mechanism, not a special case
    // here that could be forgotten the next time a phase is added.

    // ═══ [w] THE AGENT ROAD — editor/paint_collision over the real socket ══
    console.log('\n=== [w] the AGENT road: editor/paint_collision over the real Aether wire ===');
    await undoAll('before the agent phase');
    {
      // O16: ownership by DESCENT, through the shared resolver — never by
      // reading the shared discovery file and trusting whatever port it names.
      const owned = await resolveOwnedDiscovery({ roots: [child.pid], timeoutMs: 15000 });
      if (!owned.ok) console.log(`        UNMEASURABLE: ${owned.why}`);
      const disc = owned.ok ? { port: owned.port, pid: owned.pid, from: owned.from } : null;
      const MCP_PORT = disc?.port ?? -1;
      const info = disc ? await rpc(MCP_PORT, 'editor/get_project_info', {}) : null;
      const dbgState = await c.json('window.__dbg.aeon.state()');
      const wireSections = info?.body?.result?.sections?.filter(Boolean).length ?? -1;
      note('agent wire', disc
        ? `${disc.from} port=${disc.port} pid=${disc.pid} (a descendant of ${child.pid}) · `
          + `wire sections=${wireSections} · CDP sections=${dbgState.sections}`
        : `no discovery file naming a pid under ${child.pid} — refusing to use anyone else's port`);
      check('w0', 'the Aether wire is THIS app, looking at THIS document',
        !!disc && wireSections === dbgState.sections,
        disc ? `port ${disc.port} pid ${disc.pid}` : 'no discovery file owned by this run');

      if (!disc || wireSections !== dbgState.sections) {
        unmeasurable('w1', 'the agent path writes a two-way crossover',
          'provenance failed — every row below would be describing another app');
      } else {
        const W_CELL = { col: 24, row: 10 };
        const wA = await seed(W_CELL.col, W_CELL.row, 'a', SEED_OWNED, X.V.NONE);
        const wB = await seed(W_CELL.col, W_CELL.row, 'b', SEED_OWNED, X.V.NONE);
        const reply = await rpc(MCP_PORT, 'editor/paint_collision', {
          section: SEC, plane: 'both', x: W_CELL.col, y: W_CELL.row, w: 1, h: 1,
          word: armedB.word, crossover: 'hand-off',
        });
        note('agent reply', JSON.stringify(reply.body?.result ?? reply.body));
        // Read the answer out of the DOCUMENT, never off the tool's own reply.
        const wAfterA = []; for (const i of wA.idx) wAfterA.push(await collAt(c, SEC, 'a', i));
        const wAfterB = []; for (const i of wB.idx) wAfterB.push(await collAt(c, SEC, 'b', i));
        check('w1', '⚠ the agent\'s plane:"both" wrote BOTH planes, each with ITS OWN handoff value',
          wAfterA.every((w) => xoverOf(w) === 'to-b') && wAfterB.every((w) => xoverOf(w) === 'to-a'),
          `A ${wAfterA.map(xoverOf).join(' ')} · B ${wAfterB.map(xoverOf).join(' ')}`);
        check('w2', 'CONTROL: it also wrote the SHAPE on both planes — this is not "nothing happened"',
          wAfterA.every((w) => (w & F.OWNED) === (armedB.word & F.OWNED))
          && wAfterB.every((w) => (w & F.OWNED) === (armedB.word & F.OWNED)),
          `A ${wAfterA.map((w) => hex(w & F.OWNED)).join(' ')} · B ${wAfterB.map((w) => hex(w & F.OWNED)).join(' ')}`);
        check('w3', 'the reply reports the two planes SEPARATELY (painted / paintedOther), never summed',
          typeof reply.body?.result?.painted === 'number'
          && typeof reply.body?.result?.paintedOther === 'number'
          && reply.body.result.paintedOther > 0,
          `painted=${reply.body?.result?.painted} paintedOther=${reply.body?.result?.paintedOther}`);
        check('w4', 'the reply carries the paint-time AUDIT, so an agent with no lens still sees a one-way loop',
          !!reply.body?.result?.crossoverAudit
          && typeof reply.body.result.crossoverAudit.oneWay === 'number'
          && typeof reply.body.result.crossoverAudit.severity === 'string',
          JSON.stringify(reply.body?.result?.crossoverAudit));

        // OMITTING the field must mean KEEP, not "clear" — the collapse that
        // cleared every priority bit on the nametable road.
        const reply2 = await rpc(MCP_PORT, 'editor/paint_collision', {
          section: SEC, plane: 'a', x: W_CELL.col, y: W_CELL.row, w: 1, h: 1,
          word: (armedB.word ^ 0x1) & F.OWNED,
        });
        const wKeep = []; for (const i of wA.idx) wKeep.push(await collAt(c, SEC, 'a', i));
        check('w5', '⚠ OMITTING "crossover" means KEEP — an agent repainting a shape does not erase a loop',
          wKeep.every((w) => xoverOf(w) === 'to-b'),
          `after a shape-only repaint: ${wKeep.map(xoverOf).join(' ')} (want to-b) · `
          + `reply painted=${reply2.body?.result?.painted}`);
        checkNonDiscriminating('w6', 'the shape-only repaint really did change the shape',
          wKeep.every((w) => (w & F.SHAPE) !== (armedB.word & F.SHAPE)),
          `${wKeep.map((w) => hex(w & F.OWNED)).join(' ')} vs armed ${hex(armedB.word & F.OWNED)} — `
          + 'green on master too: it only rules out "the second call did nothing"');
      }
    }

    // ── [r] restore ──────────────────────────────────────────────────────
    console.log('\n=== [r] putting the document back ===');
    await undoAll('final');
    for (const { plane, index, word } of restore) await poke(c, SEC, plane, index, word);
    let bad = 0;
    for (const { plane, index, word } of restore) {
      if ((await collAt(c, SEC, plane, index)) !== word) bad++;
    }
    check('r1', 'every cell this run touched is back to the word it started with',
      bad === 0, `${restore.length - bad}/${restore.length} cells restored`);
    const aEnd = await audit(c, SEC);
    check('r2', '⚠ the section carries NO crossover at exit — nothing was left in the owner\'s data',
      aEnd.marksA === 0 && aEnd.marksB === 0 && aEnd.reserved === 0 && aEnd.selfMarks === 0,
      `marksA=${aEnd.marksA} marksB=${aEnd.marksB} reserved=${aEnd.reserved} selfMarks=${aEnd.selfMarks}`);
    note('disk', 'no save was issued; the app has no autosave (shell/close-guard.ts). '
      + 'aeon tools/repaint_ojz_collision.py discards bits 15:14, so a crossover left in his FILES '
      + 'would be silently erased by a later re-run — which is why this harness never writes one.');
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    // O16: killTree snapshots the tree BEFORE the first signal and gives a grace
    // period before SIGKILL — a bare SIGKILL loses Chromium's localStorage flush.
    // killTree prints the tree it saw, the SIGKILL count and any survivors
    // itself. A second summary line here was both redundant and WRONG: its
    // `killed` counts SIGKILLs, so the ideal outcome — everything exited on
    // SIGTERM inside the grace period — printed as "killed 0 of 9", which reads
    // exactly like a teardown that failed.
    await killTree(child);
    restoreDiscoveryNow();
    console.log('cleanup: discovery files restored to their pre-run state');
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} ════`);
  if (nonDiscriminating.size) {
    console.log(`NON-DISCRIMINATING rows (green on master too): ${[...nonDiscriminating].join(', ')}`);
  }
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(2); });
