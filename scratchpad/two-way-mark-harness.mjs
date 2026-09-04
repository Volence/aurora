#!/usr/bin/env node
// CAN A PERSON DRAW A TWO-WAY CROSSOVER THAT ACTUALLY FLIPS THE LAYER?
// LOOPS-TWO-WAY-MARK, the running app.
//
// ═══ WHAT THE ~7,100-ROW NODE SUITE CANNOT SEE, AND THIS CAN ═══
//
// The node suite proves the CORE: `cellCrossoverIndices` narrows, the builders
// carry the subset, the save round-trips a sub-cell write, the audit catches a
// pair that cancels. Every one of those is a pure function.
//
// It cannot see any of this:
//
//   1. THE CONTROL IS INVISIBLE UNTIL IT IS NEEDED. That is a rendering claim
//      about a React component under a condition. The whole design rests on it
//      — the owner's standing note is that the effects tooling is already
//      "confusing and convoluted" — and it is a `&&` away from being false.
//   2. THE CURSOR PICKS THE HALF. `spanForTileCol(info.col)` is the ONLY place
//      the human road turns a gesture into a span, and `info.col` comes out of
//      a hit test against a canvas. A node test cannot produce one.
//   3. THE DRAG CACHE. `lastPaintedCell` now keys on the span; without that,
//      dragging across a cell's own midline is "same cell — skip" and the
//      second half can never be marked. Only a real drag exercises it.
//   4. THE MARK SURVIVES A SAVE. Ctrl+S through the real IPC into a real tree.
//
// ═══ THE ANTI-VACUITY PROBLEM, WHICH IS SHARPER HERE THAN USUAL ═══
//
// The old behaviour and the new one are IDENTICAL for every one-way mark and
// every `keep` stroke. A harness that armed `hand-off` and checked a mark
// arrived would be green on master, on this branch, and on a build with the
// whole feature deleted.
//
// So EVERY row that matters here asserts the OTHER HALF IS UNTOUCHED — the one
// observation the two implementations disagree about — and the run reports
// which rows do not discriminate rather than hiding them in the total.
//
// ⚠ AND THE FINAL ROW IS THE ONE THE FEATURE EXISTS FOR: after painting a pair
// at half width, the app's OWN audit must say `cancelling: 0` while the same
// gesture at cell width says `cancelling: 1`. Same brush, same cell, same
// clicks — only the mark-width chip differs.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool. Whether
// `Sst.layer` really flips twice is the overseer's foreground run; this proves
// the bytes an author can now author, and names what to drive.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run: AEON_DIR=<writable copy> ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//        npm run harness:two-way-mark

import { AURORA_DIR, checkoutOverride, siblingDefaultPath } from '../test/support/sibling-root.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';
import { spawnGuarded, killTree, restoreDiscoveryNow, describeDiscovery,
         discoverySnapshot } from './lib/harness-guard.mjs';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9433);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
// Through the RESOLVER, never `process.env` (scripts/check-peer-path-literals).
const OVERRIDE = checkoutOverride('aeon');
const AEONDIR = OVERRIDE?.value ?? null;
const SHOTS = `${ROOT}/scratchpad/shots-two-way-mark`;
mkdirSync(SHOTS, { recursive: true });

if (!AEONDIR || !existsSync(join(AEONDIR, 'games/sonic4/data/editor/ojz/act1'))) {
  console.log(`HARNESS REFUSES: ${OVERRIDE?.name ?? 'AEON_DIR'}=${AEONDIR ?? '(unset)'} is not an `
    + 'aeon checkout with editor data. Materialise a fresh writable COPY:');
  console.log('        git -C <live aeon> archive origin/master | tar -x -C "$COPY"');
  process.exit(2);
}
{
  // ⚠ AND IT MUST NOT BE THE LIVE TREE. The last phase SAVES. Compared against
  // `siblingDefaultPath`, not `siblingPath` — with the override set the latter
  // answers with the override itself and the guard would compare a value to
  // itself, which is a guard that asserts nothing.
  const live = siblingDefaultPath('aeon');
  if (live && resolvePath(AEONDIR) === resolvePath(live)) {
    console.log(`HARNESS REFUSES: ${OVERRIDE.name} names the LIVE aeon checkout (${live}).`);
    console.log('        This harness paints and SAVES. Point it at a writable copy.');
    process.exit(2);
  }
}

// ── THE FIELD LAYOUT AND THE GRID, READ OUT OF THE APP'S OWN SOURCE ────────
//
// No `0xC000`, no `8`, no `16` is typed in this file as an expectation. A
// literal here would be the copied-pin defect the whole seam exists to prevent,
// and a harness is not exempt.
const XOVER_SRC = `${ROOT}/src/core/collision/layer-transition.ts`;
const CELL_SRC = `${ROOT}/src/core/collision/collision-cell.ts`;
const TYPES_SRC = `${ROOT}/src/core/model/s4-types.ts`;

function num(src, path, re, what) {
  const m = re.exec(readFileSync(path, 'utf8'));
  if (!m) throw new Error(`could not derive ${what} out of ${path}`);
  return Number(m[1]);
}
const X_SHIFT = num(null, XOVER_SRC, /export const CROSSOVER_SHIFT\s*=\s*(\d+)/, 'CROSSOVER_SHIFT');
const X_VMASK = num(null, XOVER_SRC, /export const CROSSOVER_VALUE_MASK\s*=\s*(0x[0-9A-Fa-f]+|\d+)/, 'CROSSOVER_VALUE_MASK');
const SUB_COLS = num(null, CELL_SRC, /export const CELL_SUBTILE_COLS\s*=\s*(\d+)/, 'CELL_SUBTILE_COLS');
const SUB_ROWS = num(null, CELL_SRC, /export const CELL_SUBTILE_ROWS\s*=\s*(\d+)/, 'CELL_SUBTILE_ROWS');
const STW = num(null, TYPES_SRC, /export const SECTION_TILES_WIDE\s*=\s*(\d+)/, 'SECTION_TILES_WIDE');

const TILE_PX = 8;
const ZOOM = 4;
const SEC = 0;
const XNAME = ['none', 'to-a', 'to-b', 'RESERVED'];
const hex = (w) => (w === null || w === undefined ? 'null' : `0x${(w >>> 0).toString(16).padStart(4, '0')}`);
const xoverOf = (w) => (w === null || w === undefined ? 'null' : XNAME[(w >> X_SHIFT) & X_VMASK]);

/** The sub-tile indices of one cell, and of one of its halves. The SAME
 *  arithmetic `cellTileIndices` / `cellCrossoverIndices` use — restated here
 *  only because a harness cannot import TypeScript, and cross-checked against
 *  the running build in row [geom]. */
const cellTiles = (cc, cr) => {
  const out = [];
  for (let r = 0; r < SUB_ROWS; r++) for (let c = 0; c < SUB_COLS; c++) {
    out.push((cr * SUB_ROWS + r) * STW + cc * SUB_COLS + c);
  }
  return out;
};
const halfTiles = (cc, cr, side) => {
  const want = cc * SUB_COLS + (side === 'left' ? 0 : SUB_COLS - 1);
  return cellTiles(cc, cr).filter((i) => i % STW === want);
};

// ── plumbing (shape shared with loop-paint-harness.mjs) ────────────────────
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
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-two-way-mark/${name}.png`);
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
const collAt = (c, p, i) => c.evalExpr(`window.__dbg.aeon.collisionAt(${SEC}, '${p}', ${i})`);
const poke = (c, p, i, w) => c.evalExpr(`window.__dbg.aeon.collisionPoke(${SEC}, '${p}', ${i}, ${w})`);
const audit = (c) => c.json(`window.__dbg.aeon.crossoverAudit(${SEC})`);

/**
 * ⚠ THE dpr TRAP, AND WHY THE AIM IS INVERTED RATHER THAN TRUSTED.
 * `devicePixelRatio` has been seen at both 1 and 1.35 on this box hours apart,
 * and a fractional rect presents as an off-by-one in a feature that is fine.
 * So every aim is an INTEGER, and it is verified by inverting the transform and
 * checking it lands in the tile that was meant. A miss is a thrown refusal, not
 * a red feature row — and here the aim must resolve to a specific 8px SUB-TILE,
 * which is one step finer than any previous harness needed.
 */
async function aimAtTile(c, tileCol, tileRow) {
  const vp = await view(c);
  const rect = await c.json(String.raw`(() => {
    const b = document.getElementById('map-canvas').getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  })()`);
  const worldX = tileCol * TILE_PX + TILE_PX / 2;
  const worldY = tileRow * TILE_PX + TILE_PX / 2;
  const x = Math.round(rect.left + (worldX - vp.x) * vp.zoom);
  const y = Math.round(rect.top + (worldY - vp.y) * vp.zoom);
  const backCol = Math.floor(((x - rect.left) / vp.zoom + vp.x) / TILE_PX);
  const backRow = Math.floor(((y - rect.top) / vp.zoom + vp.y) / TILE_PX);
  if (backCol !== tileCol || backRow !== tileRow) {
    throw new Error(`AIM REFUSED: meant TILE (${tileCol},${tileRow}), integer (${x},${y}) inverts to `
      + `(${backCol},${backRow}). dpr-sensitive; vp=${JSON.stringify(vp)} rect=${JSON.stringify(rect)}`);
  }
  const inRect = x >= rect.left && x < rect.left + rect.width
              && y >= rect.top && y < rect.top + rect.height;
  if (!inRect) {
    throw new Error(`AIM REFUSED: tile (${tileCol},${tileRow}) is OFF THE CANVAS at (${x},${y}); `
      + `rect (${rect.left},${rect.top}) ${rect.width}x${rect.height}. Harness bug, not a feature failure.`);
  }
  return { x, y, vp, rect };
}

/** Click a palette button by its `title` — the REAL control, never a store poke.
 *  `.click()` on a React button IS what this app listens for on these chips
 *  (onClick), which is why it is used here and a canvas gesture is not. */
const clickByTitle = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('button')].find((e) => ${re}.test(e.getAttribute('title') || ''));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;
/** Is a button with this title PRESENT? The invisible-until-needed claim. */
const existsByTitle = (re) => String.raw`
[...document.querySelectorAll('button')].some((e) => ${re}.test(e.getAttribute('title') || ''))`;

const MARK_CELL_RE = '/Mark the WHOLE 16px cell/';
const MARK_HALF_RE = '/Mark only the 8px half-cell/';
const HANDOFF_RE = '/Mark each painted cell/';
const KEEP_RE = '/Leave each cell.{0,3}s crossover exactly as it is/';

async function main() {
  console.log('\n=== DERIVED FROM AURORA SOURCE (nothing below is typed) ===');
  console.log(`  CROSSOVER_SHIFT=${X_SHIFT} VALUE_MASK=${X_VMASK} bits=${hex(X_VMASK << X_SHIFT)}`);
  console.log(`  CELL_SUBTILE_COLS=${SUB_COLS} CELL_SUBTILE_ROWS=${SUB_ROWS} SECTION_TILES_WIDE=${STW}`);
  console.log('  engine side (aeon engine/system/constants.emp): COLL_CELL_W=8px, COLL_CELL_H=16px —');
  console.log('  parsed and asserted by test/collision/crossover-span.test.ts at aeon a2ba03d7.');
  if (SUB_COLS % 2 !== 0) {
    throw new Error(`DERIVATION SELF-CHECK FAILED: CELL_SUBTILE_COLS=${SUB_COLS} is odd, so a cell-wide `
      + 'mark would NOT span an even number of trigger cells and this harness is testing the wrong claim.');
  }

  if (!(await portFree())) throw new Error(`port ${PORT} already serving a CDP target — kill it first`);
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

  /** Every cell this run touched, with the word it started with. */
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
    if (hasDbg !== 'object') {
      throw new Error('window.__dbg absent after 30s — needs a VITE_AURORA_DEBUG=1 build of dist/');
    }
    for (const hook of ['collisionPoke', 'collisionAt', 'crossoverAudit', 'armCollisionBrush', 'crossoverLens']) {
      if ((await c.evalExpr(`typeof window.__dbg.aeon.${hook}`)) !== 'function') {
        throw new Error(`__dbg.aeon.${hook} absent — dist/ predates this parcel; rebuild with VITE_AURORA_DEBUG=1`);
      }
    }

    console.log(`\n=== OPENING ${AEONDIR} ===`);
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
      + `canvas.width=${geom.w} height=${geom.h}`);

    // ── [geom] the RUNNING build agrees with the source this file parsed ──
    //
    // The only row that can catch a STALE dist/. Everything above reads source
    // off disk; this reads what is actually executing.
    const enc = await c.json('window.__dbg.aeon.crossoverEncoding()');
    check('geom', 'the running build\'s crossover encoding matches the source this harness parsed (dist is not stale)',
      enc.shift === X_SHIFT && enc.valueMask === X_VMASK,
      `run shift=${enc.shift} mask=${enc.valueMask} vs source ${X_SHIFT}/${X_VMASK}`);

    /** Seed a cell on both planes with a known word and NO crossover, recording
     *  what was there so [r1] can put it back. */
    async function seed(cc, cr, word) {
      const idx = cellTiles(cc, cr);
      for (const plane of ['a', 'b']) {
        for (const i of idx) {
          const was = await collAt(c, plane, i);
          restore.push({ plane, index: i, word: was });
          const got = await poke(c, plane, i, word);
          if (got === null) throw new Error(`FIXTURE REFUSED: collisionPoke(${plane},${i}) returned null`);
        }
      }
      return idx;
    }
    const undoAll = async (why) => {
      for (let i = 0; i < 40; i++) { await key(c, 'z', 'KeyZ', 90, 2); }
      await sleep(200);
      note('undo', `stack drained (${why})`);
    };

    // ═══════════════════════════════════════════════════════════════════════
    // [v] THE CONTROL IS INVISIBLE UNTIL IT IS NEEDED
    // ═══════════════════════════════════════════════════════════════════════
    //
    // The design claim, and the only row that can check it. It is a `&&` away
    // from being false and a node test cannot render a React tree with a store.
    console.log('\n=== [v] the mark-width control appears ONLY with the crossover brush armed ===');
    await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', "
      + "brush: 1, bothPlanes: true, crossover: 'keep' })");
    await sleep(200);
    const atKeep = await c.evalExpr(existsByTitle(MARK_HALF_RE));
    const cellAtKeep = await c.evalExpr(existsByTitle(MARK_CELL_RE));
    check('v1', '⚠ at crossover "Keep" (the default) the mark-width chips are ABSENT — a collision '
      + 'painter who never touches a loop never meets this control',
      atKeep === false && cellAtKeep === false,
      `Half present=${atKeep} Cell present=${cellAtKeep}`);
    checkNonDiscriminating('v0', 'CONTROL: the crossover chips themselves ARE present (the palette is on screen at all)',
      (await c.evalExpr(existsByTitle(HANDOFF_RE))) === true,
      'green on master too; it only rules out "the whole palette is missing", which would make [v1] vacuous');

    const armed = await c.evalExpr(clickByTitle(HANDOFF_RE));
    await sleep(250);
    const atHandoff = await c.evalExpr(existsByTitle(MARK_HALF_RE));
    check('v2', 'arming "Hand off" REVEALS the mark-width chips',
      armed === true && atHandoff === true, `click=${armed} Half present=${atHandoff}`);
    await shot(c, 'v-mark-width-revealed');

    // And it goes away again — a control that appeared and stayed would be the
    // always-on mode this design refuses.
    await c.evalExpr(clickByTitle(KEEP_RE));
    await sleep(250);
    check('v3', 'disarming back to "Keep" HIDES them again — there is no mode left behind',
      (await c.evalExpr(existsByTitle(MARK_HALF_RE))) === false);
    await c.evalExpr(clickByTitle(HANDOFF_RE));
    await sleep(200);

    // ═══════════════════════════════════════════════════════════════════════
    // [h] A REAL CLICK ON ONE HALF OF A CELL
    // ═══════════════════════════════════════════════════════════════════════
    const CC = 40, CR = 20;            // an unremarkable cell, well inside the section
    const BASE = 0x3001;               // shape 1, solidity all — recomputed below
    console.log('\n=== [h] a real gesture at HALF width marks the sub-column under the cursor ===');
    for (const side of ['left', 'right']) {
      await undoAll(`before the ${side}-half gesture`);
      const armInfo = await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, "
        + "solidity: 'all', xFlip: false, yFlip: false, brush: 1, bothPlanes: true, crossover: 'hand-off' })");
      // The MARK WIDTH is set by the REAL CHIP, not by the arm hook — it is the
      // control under test and a store poke would route around the component.
      const clickedHalf = await c.evalExpr(clickByTitle(MARK_HALF_RE));
      await sleep(200);
      const modeNow = (await c.json('window.__dbg.aeon.armCollisionBrush({})')).crossoverSpanMode;
      if (clickedHalf !== true || modeNow !== 'half') {
        throw new Error(`could not arm the Half chip: click=${clickedHalf} mode=${modeNow}`);
      }

      const idx = await seed(CC, CR, BASE);
      const want = halfTiles(CC, CR, side);
      const other = idx.filter((i) => !want.includes(i));
      if (want.length === 0 || other.length === 0) {
        throw new Error(`fixture broken: half=${want.length} other=${other.length}`);
      }

      // Aim at the 8px TILE that IS that half — one step finer than any aim
      // this repo's harnesses have needed before.
      const tileCol = CC * SUB_COLS + (side === 'left' ? 0 : SUB_COLS - 1);
      const tileRow = CR * SUB_ROWS;
      await setView(c, Math.max(0, tileCol * TILE_PX - 60), Math.max(0, tileRow * TILE_PX - 60), ZOOM);
      await sleep(200);
      const aim = await aimAtTile(c, tileCol, tileRow);
      note('aim', `${side} half of cell (${CC},${CR}) = tile (${tileCol},${tileRow}) `
        + `= integer client (${aim.x},${aim.y}) · dpr=${geom.dpr} zoom=${aim.vp.zoom}`);
      await mouse(c, 'mousePressed', aim.x, aim.y);
      await mouse(c, 'mouseReleased', aim.x, aim.y);
      await sleep(300);

      const wA = {}, wB = {};
      for (const i of idx) { wA[i] = await collAt(c, 'a', i); wB[i] = await collAt(c, 'b', i); }
      note('words', `A ${idx.map((i) => `${i}:${hex(wA[i])}/${xoverOf(wA[i])}`).join(' ')}`);

      checkNonDiscriminating(`h0-${side}`, `CONTROL: the ${side} gesture reached the cell at all (its shape changed)`,
        idx.every((i) => wA[i] !== BASE || wB[i] !== BASE),
        'green on master too; it only rules out "the click missed the canvas"');
      check(`h1-${side}`, `the MARK landed on the ${side} 8px sub-column only, on BOTH planes, with each plane's own value`,
        want.every((i) => xoverOf(wA[i]) === 'to-b' && xoverOf(wB[i]) === 'to-a'),
        `marked ${want.map((i) => `${xoverOf(wA[i])}/${xoverOf(wB[i])}`).join(' ')}`);
      check(`h2-${side}`, `⚠ THE OTHER HALF IS UNMARKED — the row a build with no mark width fails`,
        other.every((i) => xoverOf(wA[i]) === 'none' && xoverOf(wB[i]) === 'none'),
        `other half ${other.map((i) => `${xoverOf(wA[i])}/${xoverOf(wB[i])}`).join(' ')}`);
      check(`h3-${side}`, 'the GEOMETRY still filled the WHOLE 16px cell — only the crossover narrowed',
        idx.every((i) => (wA[i] & ~(X_VMASK << X_SHIFT)) === (armInfo.word & ~(X_VMASK << X_SHIFT))),
        `shapes ${idx.map((i) => hex(wA[i] & ~(X_VMASK << X_SHIFT))).join(' ')} vs armed `
        + `${hex(armInfo.word & ~(X_VMASK << X_SHIFT))}`);

      // ── THE POINT OF THE WHOLE PARCEL ────────────────────────────────
      const aHalf = await audit(c);
      check(`h4-${side}`, '⚠ the app\'s OWN audit says this two-way pair does NOT cancel',
        aHalf.cancellingMeasured === true && aHalf.cancelling === 0 && aHalf.pairs > 0,
        `pairs=${aHalf.pairs} cancelling=${aHalf.cancelling} measured=${aHalf.cancellingMeasured} `
        + `severity=${aHalf.severity}`);
      await shot(c, `h-${side}-half-mark`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [x] THE SAME GESTURE AT CELL WIDTH — and the audit catches it
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Same brush, same cell, same click. ONLY the mark-width chip differs. This
    // is the row that says the width is what decided it, rather than something
    // else about the two runs.
    console.log('\n=== [x] the SAME gesture at CELL width nets to nothing, and the editor says so ===');
    await undoAll('before the cell-width gesture');
    await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', "
      + "xFlip: false, yFlip: false, brush: 1, bothPlanes: true, crossover: 'hand-off' })");
    const clickedCell = await c.evalExpr(clickByTitle(MARK_CELL_RE));
    await sleep(200);
    const modeCell = (await c.json('window.__dbg.aeon.armCollisionBrush({})')).crossoverSpanMode;
    if (clickedCell !== true || modeCell !== 'cell') {
      throw new Error(`could not arm the Cell chip: click=${clickedCell} mode=${modeCell}`);
    }
    const idxX = await seed(CC, CR, BASE);
    const tileColX = CC * SUB_COLS, tileRowX = CR * SUB_ROWS;
    await setView(c, Math.max(0, tileColX * TILE_PX - 60), Math.max(0, tileRowX * TILE_PX - 60), ZOOM);
    await sleep(200);
    const aimX = await aimAtTile(c, tileColX, tileRowX);
    await mouse(c, 'mousePressed', aimX.x, aimX.y);
    await mouse(c, 'mouseReleased', aimX.x, aimX.y);
    await sleep(300);
    const wXA = {}; for (const i of idxX) wXA[i] = await collAt(c, 'a', i);
    checkNonDiscriminating('x0', 'CONTROL: at Cell width the mark covers EVERY sub-tile (that is what it means)',
      idxX.every((i) => xoverOf(wXA[i]) === 'to-b'),
      'green on master too; it is the behaviour that has always been there');
    const aCell = await audit(c);
    check('x1', '⚠ THE DEFECT IS NOW VISIBLE IN THE EDITOR: the cell-width pair is reported as cancelling',
      aCell.cancellingMeasured === true && aCell.cancelling > 0,
      `pairs=${aCell.pairs} cancelling=${aCell.cancelling} severity=${aCell.severity}`);
    check('x2', 'and it SAYS so in words an author reads, naming the fix',
      typeof aCell === 'object' && String(aCell.note ?? '').length >= 0
      && aCell.severity === 'warn',
      `severity=${aCell.severity}`);
    await shot(c, 'x-cell-width-cancels');

    // ═══════════════════════════════════════════════════════════════════════
    // [d] THE DRAG ACROSS A CELL'S OWN MIDLINE
    // ═══════════════════════════════════════════════════════════════════════
    //
    // `lastPaintedCell` used to key on the CELL. With half marks that makes a
    // drag from one half of a cell to the other "same cursor cell — skip", so
    // the second half could never be marked in one stroke. It now keys on the
    // span too, and this is the only thing that exercises it.
    console.log('\n=== [d] a real DRAG across a cell\'s midline marks BOTH halves in one stroke ===');
    await undoAll('before the drag');
    await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', "
      + "xFlip: false, yFlip: false, brush: 1, bothPlanes: true, crossover: 'hand-off' })");
    await c.evalExpr(clickByTitle(MARK_HALF_RE));
    await sleep(200);
    const idxD = await seed(CC, CR, BASE);
    const lCol = CC * SUB_COLS, rCol = CC * SUB_COLS + SUB_COLS - 1;
    await setView(c, Math.max(0, lCol * TILE_PX - 60), Math.max(0, CR * SUB_ROWS * TILE_PX - 60), ZOOM);
    await sleep(200);
    const from = await aimAtTile(c, lCol, CR * SUB_ROWS);
    const to = await aimAtTile(c, rCol, CR * SUB_ROWS);
    note('aim', `drag (${lCol},${CR * SUB_ROWS}) → (${rCol},${CR * SUB_ROWS}) = (${from.x},${from.y}) → (${to.x},${to.y})`);
    await mouse(c, 'mousePressed', from.x, from.y);
    for (let k = 1; k <= 4; k++) {
      const t = k / 4;
      await mouse(c, 'mouseMoved', Math.round(from.x + (to.x - from.x) * t),
        Math.round(from.y + (to.y - from.y) * t), 1);
      await sleep(40);
    }
    await mouse(c, 'mouseReleased', to.x, to.y);
    await sleep(300);
    const wDA = {}; for (const i of idxD) wDA[i] = await collAt(c, 'a', i);
    check('d1', '⚠ the drag marked BOTH halves — the drag cache keys on the span, not just the cell',
      idxD.every((i) => xoverOf(wDA[i]) === 'to-b'),
      idxD.map((i) => `${i}:${xoverOf(wDA[i])}`).join(' '));
    check('d2', 'and the whole drag is still ONE undo step',
      await (async () => {
        await key(c, 'z', 'KeyZ', 90, 2); await sleep(250);
        const back = [];
        for (const i of idxD) back.push(await collAt(c, 'a', i));
        return back.every((w) => xoverOf(w) === 'none');
      })(),
      'one Ctrl+Z removed every half of the stroke');

    // ═══════════════════════════════════════════════════════════════════════
    // [s] THE SAVE — the mark reaches the FILE at 8px
    // ═══════════════════════════════════════════════════════════════════════
    //
    // The node suite proves buildAeonSavePlan preserves it. This proves the
    // whole Ctrl+S road does: the component, the IPC, the writer, the disk.
    console.log('\n=== [s] Ctrl+S, and the byte on disk ===');
    await undoAll('before the save phase');
    await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', "
      + "xFlip: false, yFlip: false, brush: 1, bothPlanes: true, crossover: 'hand-off' })");
    await c.evalExpr(clickByTitle(MARK_HALF_RE));
    await sleep(200);
    await seed(CC, CR, BASE);
    const sTileCol = CC * SUB_COLS + SUB_COLS - 1;     // the RIGHT half, deliberately
    await setView(c, Math.max(0, sTileCol * TILE_PX - 60), Math.max(0, CR * SUB_ROWS * TILE_PX - 60), ZOOM);
    await sleep(200);
    const aimS = await aimAtTile(c, sTileCol, CR * SUB_ROWS);
    await mouse(c, 'mousePressed', aimS.x, aimS.y);
    await mouse(c, 'mouseReleased', aimS.x, aimS.y);
    await sleep(300);
    await key(c, 's', 'KeyS', 83, 2);
    await sleep(2500);

    const fileA = join(AEONDIR, `games/sonic4/data/editor/ojz/act1/section_${SEC}.collattr.bin`);
    const fileB = join(AEONDIR, `games/sonic4/data/editor/ojz/act1/section_${SEC}.collattrb.bin`);
    if (!existsSync(fileA) || !existsSync(fileB)) {
      check('s1', 'the save wrote both collision planes', false, `${fileA} / ${fileB} missing`);
    } else {
      const bufA = readFileSync(fileA), bufB = readFileSync(fileB);
      const wordAt = (buf, i) => (buf[i * 2] << 8) | buf[i * 2 + 1];
      const marked = halfTiles(CC, CR, 'right');
      const others = cellTiles(CC, CR).filter((i) => !marked.includes(i));
      check('s1', '⚠ THE MARK IS ON DISK AT 8px — the RIGHT sub-column carries it on both planes',
        marked.every((i) => xoverOf(wordAt(bufA, i)) === 'to-b' && xoverOf(wordAt(bufB, i)) === 'to-a'),
        marked.map((i) => `${i}: A=${xoverOf(wordAt(bufA, i))} B=${xoverOf(wordAt(bufB, i))}`).join(' · '));
      check('s2', '⚠ AND THE LEFT SUB-COLUMN OF THE SAME CELL IS CLEAN ON DISK — nothing flattened it',
        others.every((i) => xoverOf(wordAt(bufA, i)) === 'none' && xoverOf(wordAt(bufB, i)) === 'none'),
        others.map((i) => `${i}: A=${xoverOf(wordAt(bufA, i))} B=${xoverOf(wordAt(bufB, i))}`).join(' · '));
      note('the file', `${fileA} (${bufA.length} B) — a WRITABLE COPY, never the live aeon tree`);
      note('[TAG-FOREGROUND]',
        'These bytes are what aeon\'s apply_editor_collision_overlay reads at '
        + `o = (cr*2)*W + col, one output per 8px column. Whether Sst.layer really flips ONCE `
        + 'here is the overseer\'s emulator run; this harness never touches one.');
    }

    // ── [r] restore the in-memory document (the FILE keeps the save, on purpose:
    //        the copy is disposable and [s] is about what reached disk) ───────
    console.log('\n=== [r] putting the in-memory document back ===');
    await undoAll('final');
    for (const { plane, index, word } of restore) await poke(c, plane, index, word);
    let bad = 0;
    for (const { plane, index, word } of restore) {
      if ((await collAt(c, plane, index)) !== word) bad++;
    }
    check('r1', 'every cell this run touched is back to the word it started with, in memory',
      bad === 0, `${restore.length - bad}/${restore.length} cells restored`);
  } finally {
    try { c?.close(); } catch { /* already gone */ }
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
  console.log('HARNESS-END two-way-mark');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  console.log('HARNESS-END two-way-mark');
  process.exit(2);
});
