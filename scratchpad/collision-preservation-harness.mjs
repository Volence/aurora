#!/usr/bin/env node
// DOES A COLLISION STROKE DESTROY THE BITS OF THE CELL IT DOES NOT OWN?
//
// `packCollisionCell` writes four fields into a 16-bit collision cell word —
// shape 0..9, xFlip 10, yFlip 11, solidity 12..13 — and leaves 15:14 alone.
// Every paint site then wrote the palette's word WHOLESALE:
//
//     const oldColl = ce[index];
//     if (oldColl !== word) entries.push({ index, oldColl, newColl: word });
//
// so a stroke replaced the entire cell and zeroed anything the palette word did
// not carry. `history.ts` applies it with a plain `arr[i] = e.newColl`, which
// faithfully carries the loss through undo and redo.
//
// The node suite proves the RULE MODULE (test/editing/collision-word.test.ts).
// It cannot prove the GESTURE: it cannot see React, a canvas, or a mouse. When
// this same question was asked of the NAMETABLE word earlier today, reading
// found two truncation sites and the sweep found four — and the two extra were
// DRAG BRANCHES, reachable only through a real gesture and invisible to every
// one of ~5,300 unit tests. So this file drives the REAL app: the real aeon
// project, the collision tool armed by its REAL hotkey ('c', tool-meta.ts), a
// REAL mouse press and a REAL mouse drag on the real map canvas, and then reads
// the authored word back out of the document.
//
// ═══ THE ANTI-VACUOUS RULE THIS WHOLE FILE IS BUILT AROUND ═══
//
// EVERY CELL IN EVERY SHIPPED ACT HOLDS ZERO IN BITS 15:14. So a row that
// paints over real content emits the same artifact whether preservation works
// or is completely absent: `0` preserved and `0` truncated are the same sixteen
// bits. Such a row is not a weak measurement, it is a coin that always lands
// heads, and it would stay green through a total removal of the rule.
//
// The nametable harness could dodge this — it FOUND real priority cells with
// `ntRect` and painted over those. Here there is nothing to find, and §FIXTURE
// proves that in-run: [f0] counts how many cells of the scanned region carry
// unowned bits and expects ZERO, which is the measurement that says every row
// below MUST author its own destination.
//
// So every preservation row AUTHORS its destination first, through
// `__dbg.aeon.collisionPoke` (a fixture-only writer added to debug-hooks.ts for
// exactly this reason), and then RE-READS it and refuses to continue unless the
// authored bits are really there. A fixture that silently failed to land would
// make every row that depends on it vacuous, so the poke returning null or
// reading back clean is a LOUD failure, never a skipped row.
//
// And the converse control: a "preserve everything" bug — a writer that stopped
// painting at all — would sail through every preservation row on its own. So
// every phase pairs its preservation row with a CONTROL row asserting the owned
// fields DID change to the armed brush.
//
// ═══ THE MASKS ARE DERIVED, NEVER TYPED ═══
//
// A hard-coded `0xC000` here would be exactly the copied-pin defect this repo
// keeps paying for: move a field and the pin stays green while measuring the
// wrong bits. §BITS parses the four field expressions straight out of
// `packCollisionCell`'s own body in src/core/collision/collision-cell-word.ts,
// self-checks that they are pairwise disjoint, and derives the unowned mask as
// the complement. If the function's shape changes it THROWS rather than
// guessing — a check that cannot locate its own subject must not run.
//
// ═══ WHAT BITS 15:14 ARE, AND WHY THIS FILE ENCODES NO MEANING FOR THEM ═══
//
// Read at a COMMITTED peer revision, never through a sibling's working tree:
//     git -C ../aeon show b76576ea:tools/collision_pipeline.py
// `bake_plane_cell` — the encoding Aurora's per-plane data feeds — reads
// 13:12 as this plane's solidity and never looks at 15:14. `bake_cell`, the
// legacy single-word encoding in the SAME file, has PATH_B_SOL_SHIFT = 14 and
// reads them as path-B solidity. This harness proves the bits SURVIVE. It does
// not claim, and must not claim, what they mean.
//
// ═══ THE dpr TRAP ═══
//
// `devicePixelRatio` varies run-to-run under Xvfb here (1 and 1.35 observed in
// one session). At 1.35 `getBoundingClientRect()` is fractional, CDP delivers
// the nearest integer, and the off-by-one presents as a bug in the feature when
// the feature is fine. So:
//   • [aim] prints dpr, the canvas rect and `canvas.width`, and asserts the
//     app's own contract (`canvas.width = rect.width`, CSS px, never × dpr);
//   • every aim is computed from `view()` READ BACK OFF THE STORE through the
//     app's own transform, and ROUNDED TO AN INTEGER before it is sent;
//   • every aim is then VERIFIED by inverting that transform on the integer,
//     and REFUSES to proceed unless it lands in the cell it meant. An
//     off-by-one is a loud refusal here, never a red feature row.
//
// ⚠ IT WRITES NOTHING TO DISK. No Ctrl+S, no save call; the app has no autosave
// (shell/close-guard.ts). Poked fixture cells are restored explicitly at the
// end and the restoration is asserted.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:collision-preservation
//                     (or) node scratchpad/collision-preservation-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9413);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch instead.
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-collision-preservation`;
mkdirSync(SHOTS, { recursive: true });

// ── §BITS — the collision field layout, READ OUT OF THE APP'S OWN SOURCE ────
//
// Not typed here, for the reason in the header. This parses the four field
// expressions out of `packCollisionCell`'s body and rebuilds the masks from the
// literals the function itself uses.
const WORD_SRC = `${ROOT}/src/core/collision/collision-cell-word.ts`;
const TYPES_SRC = `${ROOT}/src/core/model/s4-types.ts`;
function collisionFields() {
  const src = readFileSync(WORD_SRC, 'utf8');
  const body = /export function packCollisionCell\([\s\S]*?\n\}/.exec(src)?.[0];
  if (!body) throw new Error(`could not locate packCollisionCell in ${WORD_SRC}`);
  const grab = (re, what) => {
    const m = re.exec(body);
    if (!m) throw new Error(`could not derive ${what} from packCollisionCell's body`);
    return Number(m[1]);
  };
  const f = {
    SHAPE: grab(/c\.shape\s*&\s*(0x[0-9A-Fa-f]+)/, 'shape mask'),
    XF: grab(/c\.xFlip\s*\?\s*(0x[0-9A-Fa-f]+)/, 'xFlip bit'),
    YF: grab(/c\.yFlip\s*\?\s*(0x[0-9A-Fa-f]+)/, 'yFlip bit'),
    SOL_SHIFT: grab(/SOLIDITY_BITS\[c\.solidity\]\s*<<\s*(\d+)/, 'solidity shift'),
  };
  f.SOL = 0x3 << f.SOL_SHIFT;
  // SELF-CHECK on the derivation, not on the app: four disjoint fields.
  const parts = [f.SHAPE, f.XF, f.YF, f.SOL];
  let union = 0;
  for (const p of parts) {
    if (union & p) throw new Error(`derived collision fields overlap: ${parts.map((x) => x.toString(16))}`);
    union |= p;
  }
  f.OWNED = union;
  f.UNOWNED = (~union) & 0xFFFF;
  if (f.UNOWNED === 0) {
    throw new Error('the owned mask covers all 16 bits — every preservation row here would be vacuous');
  }
  return f;
}
const F = collisionFields();
/** The value every preservation row authors: every unowned bit lit. DERIVED. */
const PROBE = F.UNOWNED;

const hex = (w) => (w === null || w === undefined ? 'null' : `0x${(w >>> 0).toString(16).padStart(4, '0')}`);
const SOLNAMES = ['none', 'top', 'sides-bottom', 'all'];
const describe = (w) => (w === null || w === undefined ? 'null' : `${hex(w)} [shape=${w & F.SHAPE}`
  + ` sol=${SOLNAMES[(w & F.SOL) >> F.SOL_SHIFT]}${w & F.XF ? ' XF' : ''}${w & F.YF ? ' YF' : ''}`
  + ` unowned=${hex(w & F.UNOWNED)}]`);

// ── the project's own geometry, read out of the app's constants ────────────
function constFrom(name) {
  const src = readFileSync(TYPES_SRC, 'utf8');
  const m = new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(src);
  if (!m) throw new Error(`could not read ${name} out of ${TYPES_SRC}`);
  return Number(m[1]);
}
const STW = constFrom('SECTION_TILES_WIDE');
const TILE_PX = 8;
const ZOOM = 4;
/** The four 8px sub-tile indices of one 16px collision cell — the same
 *  expansion `cellTileIndices` does, which is what a paint writes. */
const cellTiles = (cellCol, cellRow) => {
  const c = cellCol * 2, r = cellRow * 2;
  return [r * STW + c, r * STW + c + 1, (r + 1) * STW + c, (r + 1) * STW + c + 1];
};

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
  console.log(`        shot → scratchpad/shots-collision-preservation/${name}.png`);
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
const collAt = (c, s, p, i) => c.evalExpr(`window.__dbg.aeon.collisionAt(${s}, '${p}', ${i})`);
const poke = (c, s, p, i, w) => c.evalExpr(`window.__dbg.aeon.collisionPoke(${s}, '${p}', ${i}, ${w})`);

/**
 * THE AIM, and the thing that makes it trustworthy. Identical in shape to the
 * nametable harness's — see the dpr section of the header.
 */
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
  const backWorldX = (x - rect.left) / vp.zoom + vp.x;
  const backWorldY = (y - rect.top) / vp.zoom + vp.y;
  const landsCol = Math.floor((backWorldX - origin.x) / TILE_PX);
  const landsRow = Math.floor((backWorldY - origin.y) / TILE_PX);
  if (landsCol !== col || landsRow !== row) {
    throw new Error(
      `AIM REFUSED: meant tile (${col},${row}), integer (${x},${y}) lands in (${landsCol},${landsRow}). `
      + `vp=${JSON.stringify(vp)} rect=${JSON.stringify(rect)}`);
  }
  return { x, y, vp, rect };
}

async function main() {
  console.log(`\n=== DERIVED COLLISION FIELDS (from ${WORD_SRC.replace(ROOT + '/', '')}) ===`);
  console.log(`  shape ${hex(F.SHAPE)} · xFlip ${hex(F.XF)} · yFlip ${hex(F.YF)}`
    + ` · solidity ${hex(F.SOL)} (<<${F.SOL_SHIFT})`);
  console.log(`  OWNED   = ${hex(F.OWNED)}   (the union — what a stroke may write)`);
  console.log(`  UNOWNED = ${hex(F.UNOWNED)}   (the complement — what it must preserve)`);
  console.log(`  probe value every preservation row authors = ${hex(PROBE)}`);
  console.log(`  SECTION_TILES_WIDE = ${STW}`);
  console.log('  peer grounding: git -C ../aeon show b76576ea:tools/collision_pipeline.py');

  // WAIT for the port rather than failing on it. The gate says to run the final
  // number MORE THAN TWICE, and a previous run's Electron can still be tearing
  // down seconds after this process exits — so a bare "already serving" abort
  // makes back-to-back runs flake, and a flaky repeat is how a result ends up
  // being read from a single run after all. Still a hard failure if something
  // is genuinely camped on the port.
  for (let i = 0; i < 60 && !(await portFree()); i++) {
    if (i === 0) note('port', `${PORT} still serving — waiting for the previous run to exit`);
    await sleep(1000);
  }
  if (!(await portFree())) throw new Error(`port ${PORT} still serving a CDP target after 60s — kill it first`);

  const child = spawnGuarded('/usr/bin/xvfb-run', [
    '-a', '--server-args=-screen 0 1600x1000x24',
    ELECTRON, '.', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  ], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    // DETACHED so the whole tree can be signalled as a PROCESS GROUP below.
    // `xvfb-run` execs a shell that starts Electron as a CHILD, so killing the
    // spawned pid reaps the wrapper and leaves Electron holding the debug port.
    // That orphan is what made the second consecutive run abort with "port
    // already serving" — i.e. it turned "run the final number more than twice"
    // into "read it from one run", which is the trap this gate names.
    detached: true,
  });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  let c;
  const restore = [];   // { sec, plane, index, word } — put back before exit
  try {
    const ws = await waitForTarget();
    c = cdp(ws);
    await c.ready;

    // POLLED, not sampled once: `__dbg` arrives from a dynamically imported
    // chunk, so a single read can race it and report "no debug build" on a
    // build that is fine.
    let hasDbg = 'undefined';
    for (let i = 0; i < 60; i++) {
      hasDbg = await c.evalExpr('typeof window.__dbg');
      if (hasDbg === 'object') break;
      await sleep(500);
    }
    if (hasDbg !== 'object') {
      throw new Error('window.__dbg absent after 30s — this needs a VITE_AURORA_DEBUG=1 build of dist/');
    }
    const hasPoke = await c.evalExpr('typeof window.__dbg.aeon.collisionPoke');
    if (hasPoke !== 'function') {
      throw new Error('__dbg.aeon.collisionPoke absent — dist/ predates this parcel; rebuild');
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

    const SEC = 0;
    const PLANE = 'a';
    const origin = await c.json(`window.__dbg.aeon.sectionOrigin ? window.__dbg.aeon.sectionOrigin(${SEC}) : {x:0,y:0}`);
    note('section 0 world origin', JSON.stringify(origin));

    // ═══ §FIXTURE — the measurement that says the rows MUST author ════════
    //
    // Seed the planes the way a paint would, then count how many cells of the
    // scanned region already carry unowned bits. The answer is expected to be
    // ZERO, and that zero is the whole reason for `collisionPoke`.
    console.log('\n=== §FIXTURE: why every row below has to author its destination ===');
    await c.evalExpr(`window.__dbg.aeon.collisionPoke(${SEC}, 'a', 0, window.__dbg.aeon.collisionAt(${SEC}, 'a', 0) ?? 0)`);
    const SCAN_TILES = 64 * STW;
    const scanned = await c.json(String.raw`(() => {
      let carrying = 0, drawn = 0, n = 0;
      for (let i = 0; i < ${SCAN_TILES}; i++) {
        const w = window.__dbg.aeon.collisionAt(${SEC}, '${PLANE}', i);
        if (w === null) continue;
        n++;
        if (w & ${F.UNOWNED}) carrying++;
        if (w & ${F.SHAPE}) drawn++;
      }
      return { n, carrying, drawn };
    })()`);
    note('section 0, first 64 rows, as the app holds it',
      `${scanned.n} cells read · ${scanned.drawn} with a shape · ${scanned.carrying} carrying unowned bits`);
    check('f0', 'ZERO real cells carry unowned bits — so a row painting over real content would be VACUOUS',
      scanned.n > 0 && scanned.carrying === 0,
      `cells=${scanned.n} carrying=${scanned.carrying}. This is the measurement that forces `
      + 'every preservation row below to AUTHOR its destination with collisionPoke.');
    if (scanned.n === 0) {
      throw new Error('no collision cells readable — every row below would be meaningless. Refusing to run them.');
    }

    // ── arm the collision tool with its REAL hotkey ───────────────────────
    //
    // THE FACET COMES FIRST, and this is not a detail: tool hotkeys are
    // facet-scoped (`toolForKey` only arms a tool `toolsForFacet` offers), and
    // `paint-collision` lives on the COLLISION facet alone (facet-tools.ts:26).
    // The first run of this harness pressed 'c' on Layout, armed nothing, and
    // both preservation rows went GREEN ON THE BROKEN BUILD — green because no
    // stroke had happened at all. That is exactly the alternative green-path
    // the CONTROL rows exist to catch, and they caught it. The [arm] row is now
    // fatal rather than merely red, because everything after it is vacuous
    // without it.
    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");
    const facet = await c.json("window.__dbg.aeon.setFacet('collision')");
    note('facet', JSON.stringify(facet));
    await c.evalExpr("document.getElementById('map-canvas').focus()");
    await key(c, 'c', 'KeyC', 67);
    await sleep(150);
    const toolNow = (await c.json('window.__dbg.aeon.state()')).tool;
    check('arm', "the REAL hotkey 'c' armed paint-collision on the collision facet",
      toolNow === 'paint-collision', `facet=${facet?.facet} tool = ${toolNow}`);
    if (toolNow !== 'paint-collision') {
      throw new Error('paint-collision never armed — every gesture row below would measure a stroke '
        + 'that did not happen, and would go green on its absence. Refusing to run them.');
    }

    // Arm a brush that is GUARANTEED to differ from what we seed, so "the paint
    // happened" is itself checkable. Shape 1 + 'all' + xFlip, through the app's
    // own palette setters, and the app tells us the word it will paint.
    const armed = await c.json(`window.__dbg.aeon.armCollisionBrush({ plane: '${PLANE}', shape: 1, solidity: 'all', xFlip: true, yFlip: false, brush: 1 })`);
    note('armed brush', `plane ${armed.plane} · word ${describe(armed.word)}`);
    check('arm2', 'the armed brush word is non-air and sets owned bits only',
      (armed.word & F.SHAPE) !== 0 && (armed.word & F.UNOWNED) === 0,
      describe(armed.word));

    /** Park so tile (col,row) sits comfortably inside the canvas, then aim. */
    async function parkAndAim(col, row) {
      const vx = Math.max(0, origin.x + col * TILE_PX - 200);
      const vy = Math.max(0, origin.y + row * TILE_PX - 150);
      await setView(c, vx, vy, ZOOM);
      await sleep(120);
      return aimAtTile(c, col, row, origin);
    }

    /**
     * AUTHOR one collision cell's four sub-tiles with unowned bits set, and
     * REFUSE to continue unless they are really there.
     *
     * A fixture that silently failed to land is the failure mode that turns a
     * whole phase vacuous, so this is loud and fatal rather than a skip.
     */
    async function seedCell(cellCol, cellRow, seedOwned) {
      const idx = cellTiles(cellCol, cellRow);
      const want = ((seedOwned & F.OWNED) | PROBE) & 0xFFFF;
      for (const i of idx) {
        const was = await collAt(c, SEC, PLANE, i);
        restore.push({ index: i, word: was ?? 0 });
        const got = await poke(c, SEC, PLANE, i, want);
        if (got === null) throw new Error(`FIXTURE REFUSED: collisionPoke(${SEC},${PLANE},${i}) returned null`);
      }
      const back = [];
      for (const i of idx) back.push(await collAt(c, SEC, PLANE, i));
      if (!back.every((w) => (w & F.UNOWNED) === PROBE)) {
        throw new Error(`FIXTURE REFUSED: cell (${cellCol},${cellRow}) did not read back with unowned bits `
          + `${hex(PROBE)} — got ${back.map(describe).join(' · ')}. Every row using it would be vacuous.`);
      }
      return { idx, want, back };
    }

    /** Rewind the document, so a phase never inherits the previous one's damage. */
    async function undoAll(label) {
      let n = 0;
      while (n < 30 && (await c.evalExpr('window.__dbg.aeon.canUndo()'))) {
        await key(c, 'z', 'KeyZ', 90, 2);
        await sleep(120);
        n++;
      }
      note('rewind', `${label}: ${n} undo step(s)`);
    }

    // A shape that differs from the armed brush, so the control row can tell
    // "the stroke landed" from "nothing happened".
    const SEED_OWNED = (0x2A5 & F.SHAPE) | F.YF | (0x1 << F.SOL_SHIFT);

    // ═══ [p] THE PRESS — MapViewport.paintCollisionCell via handleMouseDown ═
    console.log('\n=== [p] collision paint, a REAL single press, over an AUTHORED cell ===');
    const P_CELL = { col: 6, row: 6 };
    const P = await seedCell(P_CELL.col, P_CELL.row, SEED_OWNED);
    note('seeded', `cell (${P_CELL.col},${P_CELL.row}) tiles [${P.idx}] := ${describe(P.want)}`);
    check('p0', 'the press destination REALLY carries unowned bits before the stroke (NOT vacuous)',
      P.back.every((w) => (w & F.UNOWNED) === PROBE),
      P.back.map(describe).join(' · '));

    const aimP = await parkAndAim(P_CELL.col * 2, P_CELL.row * 2);
    note('aim', `cell (${P_CELL.col},${P_CELL.row}) → tile (${P_CELL.col * 2},${P_CELL.row * 2}) `
      + `→ integer client (${aimP.x},${aimP.y}) via view ${JSON.stringify(aimP.vp)}`);
    await mouse(c, 'mousePressed', aimP.x, aimP.y);
    await mouse(c, 'mouseReleased', aimP.x, aimP.y);
    await sleep(250);
    const afterP = [];
    for (const i of P.idx) afterP.push(await collAt(c, SEC, PLANE, i));
    note('words', `before ${describe(P.want)}\n        after  ${afterP.map(describe).join('\n               ')}`);

    // The anti-vacuous half FIRST: if the paint did not happen, the row below
    // is not a measurement of preservation.
    check('p1', 'CONTROL: the press actually painted the armed brush into all four sub-tiles',
      afterP.every((w) => (w & F.OWNED) === (armed.word & F.OWNED)),
      `armed owned ${hex(armed.word & F.OWNED)}; got ${afterP.map((w) => hex(w & F.OWNED)).join(' ')} `
      + `(seed owned was ${hex(P.want & F.OWNED)})`);
    check('p2', "a real PRESS preserves the cell's unowned bits",
      afterP.every((w) => (w & F.UNOWNED) === PROBE),
      `want unowned ${hex(PROBE)}; got ${afterP.map((w) => hex(w & F.UNOWNED)).join(' ')}`);
    await shot(c, 'p-after-press');
    await undoAll('after press phase');

    // ═══ [d] THE DRAG — the SAME function reached from handleMouseMove ═════
    //
    // This is the branch the nametable sweep's two hidden sites lived in: a
    // press handler and a drag handler are two different functions writing the
    // same word, and an enumeration by TOOL finds one of them. Here the press
    // and the drag both route through `paintCollisionCell` (MapViewport ~:2653
    // and ~:2901), so one fix should cover both — this row is what proves that
    // claim rather than asserting it from a reading.
    console.log('\n=== [d] collision paint, a REAL press-and-DRAG onto a second AUTHORED cell ===');
    const D_FROM = { col: 4, row: 10 };
    const D_TO = { col: 8, row: 10 };
    const DF = await seedCell(D_FROM.col, D_FROM.row, SEED_OWNED);
    const DT = await seedCell(D_TO.col, D_TO.row, SEED_OWNED);
    check('d0', 'the DRAG destination REALLY carries unowned bits before the stroke (NOT vacuous)',
      DT.back.every((w) => (w & F.UNOWNED) === PROBE),
      DT.back.map(describe).join(' · '));

    const aimFrom = await parkAndAim(D_FROM.col * 2, D_FROM.row * 2);
    const aimTo = await aimAtTile(c, D_TO.col * 2, D_TO.row * 2, origin);
    note('drag aim', `from cell (${D_FROM.col},${D_FROM.row}) client (${aimFrom.x},${aimFrom.y}) `
      + `→ to cell (${D_TO.col},${D_TO.row}) client (${aimTo.x},${aimTo.y})`);
    await mouse(c, 'mousePressed', aimFrom.x, aimFrom.y);
    await sleep(60);
    // Walk it, the way a hand does — a single jump can skip the move handler's
    // cell-change test entirely.
    const STEPS = 8;
    for (let s = 1; s <= STEPS; s++) {
      const mx = Math.round(aimFrom.x + ((aimTo.x - aimFrom.x) * s) / STEPS);
      const my = Math.round(aimFrom.y + ((aimTo.y - aimFrom.y) * s) / STEPS);
      await mouse(c, 'mouseMoved', mx, my, 1);
      await sleep(40);
    }
    await mouse(c, 'mouseReleased', aimTo.x, aimTo.y);
    await sleep(250);
    const afterD = [];
    for (const i of DT.idx) afterD.push(await collAt(c, SEC, PLANE, i));
    note('words', `before ${describe(DT.want)}\n        after  ${afterD.map(describe).join('\n               ')}`);

    check('d1', 'CONTROL: the DRAG actually painted the armed brush into the far cell',
      afterD.every((w) => (w & F.OWNED) === (armed.word & F.OWNED)),
      `armed owned ${hex(armed.word & F.OWNED)}; got ${afterD.map((w) => hex(w & F.OWNED)).join(' ')} `
      + `(seed owned was ${hex(DT.want & F.OWNED)})`);
    check('d2', "a real DRAG preserves the far cell's unowned bits",
      afterD.every((w) => (w & F.UNOWNED) === PROBE),
      `want unowned ${hex(PROBE)}; got ${afterD.map((w) => hex(w & F.UNOWNED)).join(' ')}`);
    await shot(c, 'd-after-drag');

    // ═══ [u] UNDO restores the whole sixteen bits ══════════════════════════
    //
    // `history.ts` applies with a plain `arr[i] = e.oldColl`, so undo is only
    // faithful if `oldColl` captured the unowned bits too. Cheap to check and
    // it is the half of the round trip nothing else here touches.
    console.log('\n=== [u] undo restores the full word, unowned bits included ===');
    await undoAll('after drag phase');
    const undone = [];
    for (const i of DT.idx) undone.push(await collAt(c, SEC, PLANE, i));
    check('u1', 'undo puts back the authored word EXACTLY, unowned bits included',
      undone.every((w) => w === DT.want),
      `want ${describe(DT.want)}; got ${undone.map(describe).join(' · ')}`);

    // ── restore the poked fixture cells ──────────────────────────────────
    console.log('\n=== restoring (nothing was ever written to disk) ===');
    for (const r of restore) await poke(c, SEC, PLANE, r.index, r.word);
    const restored = [];
    for (const r of restore) restored.push((await collAt(c, SEC, PLANE, r.index)) === r.word);
    check('r1', 'every poked fixture cell is back to the word this run found',
      restored.every(Boolean),
      `${restored.filter(Boolean).length}/${restored.length} cells restored`);
    note('disk', 'no save was issued; the app has no autosave (shell/close-guard.ts)');
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    // Negative pid = the whole process GROUP (see `detached` above), so
    // Electron goes down with its xvfb-run wrapper instead of outliving it.
    const killGroup = (sig) => { try { process.kill(-child.pid, sig); } catch { /* already gone */ } };
    killGroup('SIGTERM');
    await sleep(500);
    killGroup('SIGKILL');
    // And CONFIRM it: a teardown that silently failed is how the next run
    // aborts on a port this one was supposed to have released.
    for (let i = 0; i < 30 && !(await portFree()); i++) await sleep(500);
    if (!(await portFree())) console.log(`WARN       port ${PORT} still held after teardown`);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} ════`);
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e); process.exit(2); });
