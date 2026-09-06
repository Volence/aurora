#!/usr/bin/env node
// DOES THE PICTURE UNDER THE CURSOR SHOW WHAT THE CLICK WILL AUTHOR?
// LOOPS-P / loops-hover-half, the running app.
//
// ═══ THE ROW THIS CLOSES ════════════════════════════════════════════════════
//
// docs/reviews/2026-09-04-loops-two-way-mark.md §8 row 2: "the hover preview
// does not depict the half". Precisely: it drew the stroke's GEOMETRY footprint
// (one 16px outline per cell — correct, and unchanged) and NOTHING about the
// MARK. At "Half (8px)" the author saw a 16px outline for a write about to touch
// one 8px sub-column of it.
//
// ═══ WHY A NODE TEST CANNOT SEE ANY OF THIS ═════════════════════════════════
//
// The suite proves the GEOMETRY of the footprint (crossover-preview.test.ts,
// 6 rows). It cannot see:
//
//   1. THAT MapViewport DRAWS IT AT ALL. A pure function nobody calls passes
//      every one of those rows.
//   2. THAT THE PREVIEW AND THE CLICK AGREE. The claim is about two code paths
//      answering one question at one cursor position, and only a real gesture
//      produces the cursor position.
//   3. THE REDRAW TRIGGER. Moving from one half of a cell to the other is "the
//      same cell" by the cellCol/cellRow test the trigger used to make, so the
//      preview would keep drawing the FIRST half while the click marked the
//      second. Only a real mousemove across a cell's own midline exercises it.
//
// ═══ HOW THE PREVIEW IS MEASURED — DIFF IMAGING, NOT A COLOUR PIN ═══════════
//
// The ghost has its own canvas (`#map-preview-canvas`), so this reads THE
// GHOST'S PIXELS, never a screenshot of the composite. And it does not look for
// a colour: it captures the canvas with the crossover brush at `keep` (which
// authors nothing, so no mark is drawn), then again at `hand-off`, and DIFFS.
// Nothing else in drawCollisionPreview reads the crossover brush, so the
// changed pixels ARE the mark's footprint — derived, with no colour constant
// copied into this file and no dependence on what the mark is drawn in.
//
// ⚠ THE dpr TRAP. `devicePixelRatio` has been seen at 1 and at 1.35 on this box
// hours apart. Two separate defences: every aim is an INTEGER client pixel and
// is verified by inverting the transform (`aimAtTile`, taken from
// two-way-mark-harness), and the preview canvas's BACKING STORE is sized in CSS
// px by MapViewport itself (`pcv.width = Math.floor(rect.width)`), so the pixel
// arithmetic below never touches dpr at all. The CSS-to-backing scale is
// measured and printed beside every geometric row anyway, because "it should be
// 1" is not a measurement.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run: AEON_DIR=<writable copy> ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//        npm run harness:loops-hover-half

import { AURORA_DIR, checkoutOverride, siblingDefaultPath } from '../test/support/sibling-root.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';
import { spawnGuarded, killTree, restoreDiscoveryNow, describeDiscovery,
         discoverySnapshot } from './lib/harness-guard.mjs';
import { readFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9437);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const OVERRIDE = checkoutOverride('aeon');
const AEONDIR = OVERRIDE?.value ?? null;
const SHOTS = `${ROOT}/scratchpad/shots-loops-hover-half`;
mkdirSync(SHOTS, { recursive: true });

if (!AEONDIR || !existsSync(join(AEONDIR, 'games/sonic4/data/editor/ojz/act1'))) {
  console.log(`HARNESS REFUSES: ${OVERRIDE?.name ?? 'AEON_DIR'}=${AEONDIR ?? '(unset)'} is not an `
    + 'aeon checkout with editor data. Materialise a fresh writable COPY:');
  console.log('        git -C <live aeon> archive origin/master | tar -x -C "$COPY"');
  process.exit(2);
}
{
  // ⚠ AND IT MUST NOT BE THE LIVE TREE. This harness pokes and paints into the
  // open document. Compared against `siblingDefaultPath`, not `siblingPath` —
  // with the override set the latter answers with the override itself and the
  // guard would compare a value to itself.
  const live = siblingDefaultPath('aeon');
  if (live && resolvePath(AEONDIR) === resolvePath(live)) {
    console.log(`HARNESS REFUSES: ${OVERRIDE.name} names the LIVE aeon checkout (${live}).`);
    console.log('        This harness paints. Point it at a writable copy.');
    process.exit(2);
  }
}

// ── THE GRID, READ OUT OF AURORA'S OWN SOURCE ──────────────────────────────
//
// No `8` and no `16` is typed as an expectation. A literal here would be the
// copied-pin defect the seam exists to prevent, and a harness is not exempt.
const XOVER_SRC = `${ROOT}/src/core/collision/layer-transition.ts`;
const CELL_SRC = `${ROOT}/src/core/collision/collision-cell.ts`;
const TYPES_SRC = `${ROOT}/src/core/model/s4-types.ts`;
const LENS_SRC = `${ROOT}/src/renderer/canvas/both-planes-lens.ts`;

function num(path, re, what) {
  const m = re.exec(readFileSync(path, 'utf8'));
  if (!m) throw new Error(`could not derive ${what} out of ${path}`);
  return Number(m[1]);
}
const X_SHIFT = num(XOVER_SRC, /export const CROSSOVER_SHIFT\s*=\s*(\d+)/, 'CROSSOVER_SHIFT');
const X_VMASK = num(XOVER_SRC, /export const CROSSOVER_VALUE_MASK\s*=\s*(0x[0-9A-Fa-f]+|\d+)/, 'CROSSOVER_VALUE_MASK');
const SUB_COLS = num(CELL_SRC, /export const CELL_SUBTILE_COLS\s*=\s*(\d+)/, 'CELL_SUBTILE_COLS');
const SUB_ROWS = num(CELL_SRC, /export const CELL_SUBTILE_ROWS\s*=\s*(\d+)/, 'CELL_SUBTILE_ROWS');
const STW = num(TYPES_SRC, /export const SECTION_TILES_WIDE\s*=\s*(\d+)/, 'SECTION_TILES_WIDE');
const CELL_PX = num(LENS_SRC, /export const BOTH_PLANES_CELL_PX\s*=\s*(\d+)/, 'BOTH_PLANES_CELL_PX');
/** The 8px sub-tile, DERIVED exactly as canvas/crossover-preview.ts derives it
 *  (CROSSOVER_SUBTILE_PX = BOTH_PLANES_CELL_PX / CELL_SUBTILE_COLS). */
const TILE_PX = CELL_PX / SUB_COLS;

const ZOOM = 4;
const SEC = 0;
const XNAME = ['none', 'to-a', 'to-b', 'RESERVED'];
const hex = (w) => (w === null || w === undefined ? 'null' : `0x${(w >>> 0).toString(16).padStart(4, '0')}`);
const xoverOf = (w) => (w === null || w === undefined ? 'null' : XNAME[(w >> X_SHIFT) & X_VMASK]);

/** The sub-tile indices of one cell. Restated only because a harness cannot
 *  import TypeScript; cross-checked against the running build in row [geom]. */
const cellTiles = (cc, cr) => {
  const out = [];
  for (let r = 0; r < SUB_ROWS; r++) for (let c = 0; c < SUB_COLS; c++) {
    out.push((cr * SUB_ROWS + r) * STW + cc * SUB_COLS + c);
  }
  return out;
};

// ── plumbing (shape shared with two-way-mark-harness.mjs) ──────────────────
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
  console.log(`        shot → scratchpad/shots-loops-hover-half/${name}.png`);
}
async function mouse(c, type, x, y, buttons) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: buttons ?? (type === 'mousePressed' ? 1 : 0), clickCount: type === 'mouseMoved' ? 0 : 1,
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

/**
 * ⚠ THE AIM IS INVERTED RATHER THAN TRUSTED (taken from two-way-mark-harness).
 * Every aim is an INTEGER client pixel, and it is verified by inverting the
 * transform and checking it lands in the 8px SUB-TILE that was meant. A miss is
 * a thrown refusal, not a red feature row.
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

// ── THE PREVIEW CANVAS, READ DIRECTLY ──────────────────────────────────────
const PREVIEW_GEOM = String.raw`(() => {
  const cv = document.getElementById('map-preview-canvas');
  if (!cv) return { missing: true };
  const b = cv.getBoundingClientRect();
  return { w: cv.width, h: cv.height, left: b.left, top: b.top, rw: b.width, rh: b.height };
})()`;
/** Latch the current ghost as the baseline for the next diff, and report how
 *  many pixels it has drawn at all (the anti-vacuity number: a baseline of zero
 *  means the ghost never ran and every diff below would be measuring nothing). */
const PREVIEW_LATCH = String.raw`(() => {
  const cv = document.getElementById('map-preview-canvas');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  window.__hhBase = d.slice();
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) n++;
  return { drawn: n, w: cv.width, h: cv.height };
})()`;
/** The bounding box, in BACKING-STORE px, of every pixel that changed since the
 *  latch. With the crossover brush the only thing that moved, that box IS the
 *  mark's footprint. */
const PREVIEW_DIFF = String.raw`(() => {
  const cv = document.getElementById('map-preview-canvas');
  const cur = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const base = window.__hhBase;
  if (!base || base.length !== cur.length) return { error: 'baseline missing or resized' };
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
  for (let y = 0; y < cv.height; y++) {
    for (let x = 0; x < cv.width; x++) {
      const i = (y * cv.width + x) * 4;
      if (cur[i] !== base[i] || cur[i+1] !== base[i+1] || cur[i+2] !== base[i+2] || cur[i+3] !== base[i+3]) {
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return n === 0 ? { n: 0 } : { n, x0, x1, y0, y1, w: cv.width, h: cv.height };
})()`;

/** Click a palette button by its `title` — the REAL control, never a store poke. */
const clickByTitle = (re) => String.raw`
(() => {
  const el = [...document.querySelectorAll('button')].find((e) => ${re}.test(e.getAttribute('title') || ''));
  if (!el) return 'no-element';
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const MARK_CELL_RE = '/Mark the WHOLE 16px cell/';
const MARK_HALF_RE = '/Mark only the 8px half-cell/';
const HANDOFF_RE = '/Mark each painted cell/';
const KEEP_RE = '/Leave each cell.{0,3}s crossover exactly as it is/';

async function main() {
  console.log('\n=== DERIVED FROM AURORA SOURCE (nothing below is typed) ===');
  console.log(`  CELL_SUBTILE_COLS=${SUB_COLS} CELL_SUBTILE_ROWS=${SUB_ROWS} SECTION_TILES_WIDE=${STW}`);
  console.log(`  BOTH_PLANES_CELL_PX=${CELL_PX} → sub-tile = ${TILE_PX}px · CROSSOVER_SHIFT=${X_SHIFT}`);
  console.log(`  so at zoom ${ZOOM}: a CELL mark is ${CELL_PX * ZOOM} canvas px wide, a HALF is ${TILE_PX * ZOOM}.`);

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

    console.log(`\n=== OPENING ${AEONDIR} ===`);
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    for (let i = 0; i < 60; i++) {
      const st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) { note('project open', JSON.stringify(st)); break; }
      await sleep(500);
    }
    if (!(await c.json('window.__dbg.aeon.state()')).open) throw new Error('aeon project never opened');

    await c.evalExpr("window.__dbg.aeon.setLayer('fg')");
    const facet = await c.json("window.__dbg.aeon.setFacet('collision')");
    await c.evalExpr("document.getElementById('map-canvas').focus()");
    await key(c, 'c', 'KeyC', 67);
    await sleep(250);
    const toolNow = (await c.json('window.__dbg.aeon.state()')).tool;
    check('arm', "the REAL hotkey 'c' armed paint-collision on the collision facet",
      toolNow === 'paint-collision', `facet=${facet?.facet} tool=${toolNow}`);
    if (toolNow !== 'paint-collision') {
      throw new Error('paint-collision never armed — every row below would measure a ghost that '
        + 'never draws and would go green on its absence. Refusing to run them.');
    }

    const pg = await c.json(PREVIEW_GEOM);
    if (pg.missing) {
      throw new Error('#map-preview-canvas absent — dist/ predates this parcel; rebuild with VITE_AURORA_DEBUG=1');
    }
    const dpr = await c.evalExpr('window.devicePixelRatio');
    /** CSS px -> backing-store px. MapViewport sizes the backing store from the
     *  CONTAINER'S CSS RECT, so this is 1 by construction and dpr never enters —
     *  but it is measured, because "should be" is not a measurement. */
    const SCALE = pg.w / pg.rw;
    note('preview canvas', `backing ${pg.w}x${pg.h} · css rect (${pg.left},${pg.top}) ${pg.rw}x${pg.rh} `
      + `· css→backing scale=${SCALE} · devicePixelRatio=${dpr}`);

    const enc = await c.json('window.__dbg.aeon.crossoverEncoding()');
    check('geom', 'the running build\'s crossover encoding matches the source this harness parsed (dist is not stale)',
      enc.shift === X_SHIFT && enc.valueMask === X_VMASK,
      `run shift=${enc.shift} mask=${enc.valueMask} vs source ${X_SHIFT}/${X_VMASK}`);

    const CC = 40, CR = 20;
    const BASE = 0x3001;
    const recorded = new Set();
    async function seed(cc, cr, word) {
      const idx = cellTiles(cc, cr);
      for (const plane of ['a', 'b']) {
        for (const i of idx) {
          const was = await collAt(c, plane, i);
          if (!recorded.has(`${plane}:${i}`)) { recorded.add(`${plane}:${i}`); restore.push({ plane, index: i, word: was }); }
          if ((await poke(c, plane, i, word)) === null) {
            throw new Error(`FIXTURE REFUSED: collisionPoke(${plane},${i}) returned null`);
          }
        }
      }
      return idx;
    }
    const undoAll = async (why) => {
      for (let i = 0; i < 40; i++) await key(c, 'z', 'KeyZ', 90, 2);
      await sleep(200);
      note('undo', `stack drained (${why})`);
    };

    /** Park the cursor on a DIFFERENT cell and come back, so the ghost is
     *  redrawn after a palette change the mouse did not cause. */
    async function rehover(aim, park) {
      await mouse(c, 'mouseMoved', park.x, park.y, 0);
      await sleep(120);
      await mouse(c, 'mouseMoved', aim.x, aim.y, 0);
      await sleep(180);
    }
    /** The expected footprint of sub-tile columns [tc, tc+n) in backing px. */
    const expectBand = (vp, tc, n) => ({
      x0: Math.round((tc * TILE_PX - vp.x) * vp.zoom * SCALE),
      w: Math.round(n * TILE_PX * vp.zoom * SCALE),
    });
    const bandOf = (d) => ({ x0: d.x0, w: d.x1 - d.x0 + 1 });

    /**
     * Hover at `tileCol` with the crossover brush at `keep`, latch, arm
     * `hand-off`, hover again, diff. Returns the mark's footprint.
     * `armWidth` clicks the REAL mark-width chip, never the arm hook.
     */
    async function footprintAt(tileCol, tileRow, widthChip, park) {
      await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', "
        + "xFlip: false, yFlip: false, brush: 1, bothPlanes: true, crossover: 'hand-off' })");
      const clickedW = await c.evalExpr(clickByTitle(widthChip));
      await sleep(150);
      if (clickedW !== true) throw new Error(`could not arm the mark-width chip ${widthChip}: ${clickedW}`);
      // BASELINE: the same hover with the brush authoring NOTHING.
      await c.evalExpr(clickByTitle(KEEP_RE));
      await sleep(150);
      const aim = await aimAtTile(c, tileCol, tileRow);
      await rehover(aim, park);
      const latch = await c.json(PREVIEW_LATCH);
      // THE MARK: only the crossover brush changed.
      await c.evalExpr(clickByTitle(HANDOFF_RE));
      await sleep(150);
      await rehover(aim, park);
      const diff = await c.json(PREVIEW_DIFF);
      return { aim, latch, diff };
    }

    await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', "
      + "xFlip: false, yFlip: false, brush: 1, bothPlanes: true, crossover: 'hand-off' })");
    await seed(CC, CR, BASE);
    const tileRow = CR * SUB_ROWS;
    const leftCol = CC * SUB_COLS, rightCol = CC * SUB_COLS + SUB_COLS - 1;
    await setView(c, Math.max(0, leftCol * TILE_PX - 60), Math.max(0, tileRow * TILE_PX - 60), ZOOM);
    await sleep(250);
    const vp = await view(c);
    const park = await aimAtTile(c, leftCol - SUB_COLS * 3, tileRow);
    note('geometry', `view x=${vp.x} y=${vp.y} zoom=${vp.zoom} · cell (${CC},${CR}) · `
      + `sub-columns ${leftCol}/${rightCol} · park tile ${leftCol - SUB_COLS * 3}`);

    // ═══════════════════════════════════════════════════════════════════════
    // [c] THE GHOST DRAWS A MARK AT ALL — the row master fails outright
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [c] arming the crossover brush CHANGES the picture under the cursor ===');
    const half0 = await footprintAt(leftCol, tileRow, MARK_HALF_RE, park);
    checkNonDiscriminating('c0', 'CONTROL: the hover ghost drew SOMETHING with the brush at `keep`',
      half0.latch.drawn > 0,
      `green on master too; ${half0.latch.drawn} non-transparent px. It only rules out "the ghost `
      + 'never ran", which would make every diff below an empty box.');
    check('c1', '⚠ arming the crossover brush ADDS a mark to the ghost — on master the crossover '
      + 'brush changed the picture under the cursor NOT AT ALL',
      half0.diff.n > 0, `${half0.diff.n} px changed · box ${JSON.stringify(half0.diff)}`);
    await shot(c, 'c-half-left-hover');

    // ═══════════════════════════════════════════════════════════════════════
    // [w] IT IS A HALF, AND IT IS THE HALF THE CURSOR IS IN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n=== [w] the mark is drawn one 8px sub-column wide, on the aimed side ===');
    const wantL = expectBand(vp, leftCol, 1);
    const gotL = bandOf(half0.diff);
    check('w1', `the LEFT-half hover draws a band ${TILE_PX}px wide (${wantL.w} canvas px at zoom ${vp.zoom}), `
      + 'not a whole cell',
      gotL.w === wantL.w,
      `got x0=${gotL.x0} w=${gotL.w} · want x0=${wantL.x0} w=${wantL.w} · scale=${SCALE} dpr=${dpr} `
      + `· aimed integer client (${half0.aim.x},${half0.aim.y})`);
    check('w2', 'and it sits on the LEFT sub-column of the cell, where the cursor is',
      gotL.x0 === wantL.x0, `got ${gotL.x0} want ${wantL.x0}`);

    const half1 = await footprintAt(rightCol, tileRow, MARK_HALF_RE, park);
    const wantR = expectBand(vp, rightCol, 1);
    const gotR = bandOf(half1.diff);
    check('w3', '⚠ THE RIGHT-half hover draws the OTHER sub-column — a preview that always drew the '
      + 'left half, or one whose parity is inverted, fails HERE and nowhere else',
      gotR.w === wantR.w && gotR.x0 === wantR.x0,
      `got x0=${gotR.x0} w=${gotR.w} · want x0=${wantR.x0} w=${wantR.w} · aimed integer client `
      + `(${half1.aim.x},${half1.aim.y}) vs left (${half0.aim.x},${half0.aim.y})`);
    check('w4', 'the two hovers were two DIFFERENT integer pixels on the SAME screen, one sub-tile apart',
      half1.aim.x - half0.aim.x === TILE_PX * ZOOM && half0.aim.vp.x === half1.aim.vp.x,
      `dx=${half1.aim.x - half0.aim.x} expected ${TILE_PX * ZOOM} · viewport x ${half0.aim.vp.x} vs ${half1.aim.vp.x}`);
    await shot(c, 'w-half-right-hover');

    // The CONTROL: the same brush at Cell width draws the whole cell.
    const cellHover = await footprintAt(leftCol, tileRow, MARK_CELL_RE, park);
    const wantC = expectBand(vp, leftCol, SUB_COLS);
    const gotC = bandOf(cellHover.diff);
    check('w5', `⚠ THE CONTROL: the SAME hover at Cell width draws ${SUB_COLS}x wider — so [w1] is `
      + 'about the mark width and not about the ghost being small',
      gotC.w === wantC.w && gotC.x0 === wantC.x0 && gotC.w === SUB_COLS * gotL.w,
      `cell x0=${gotC.x0} w=${gotC.w} · want x0=${wantC.x0} w=${wantC.w} · half was ${gotL.w}`);
    await shot(c, 'w-cell-width-hover');

    // ═══════════════════════════════════════════════════════════════════════
    // [s] THE SEAM — the picture, then the click, at the SAME pixel
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ⚠ THIS IS THE ROW THE PARCEL IS ABOUT. Everything above says the ghost
    // draws a half; this says it is THE SAME half the click writes. A preview
    // that computed its own span would pass every row above and fail this one
    // the moment the shared rule moved — which is the mutation the review packet
    // records against it.
    console.log('\n=== [s] the ghost\'s footprint IS the sub-column the click marks ===');
    for (const [side, tc] of [['left', leftCol], ['right', rightCol]]) {
      await undoAll(`before the ${side} seam gesture`);
      const idx = await seed(CC, CR, BASE);
      const fp = await footprintAt(tc, tileRow, MARK_HALF_RE, park);
      const drawn = bandOf(fp.diff);
      // The click, at the very pixel the footprint was measured at.
      await mouse(c, 'mousePressed', fp.aim.x, fp.aim.y);
      await mouse(c, 'mouseReleased', fp.aim.x, fp.aim.y);
      await sleep(300);
      const marked = [];
      for (const i of idx) if (xoverOf(await collAt(c, 'a', i)) !== 'none') marked.push(i);
      const cols = [...new Set(marked.map((i) => i % STW))].sort((a, b) => a - b);
      checkNonDiscriminating(`s0-${side}`, `CONTROL: the ${side} click reached the cell at all`,
        marked.length > 0, `green on master too; ${marked.length} sub-tiles marked`);
      // The footprint the WRITE implies, in the same backing px the ghost was
      // measured in — derived from the sub-columns that actually carry a mark,
      // never from the side this loop asked for.
      const wantFromWrite = cols.length === 0 ? null
        : { x0: expectBand(fp.aim.vp, cols[0], 1).x0, w: expectBand(fp.aim.vp, cols[0], cols.length).w };
      check(`s1-${side}`, '⚠ THE SEAM: what the ghost drew and what the click WROTE are the same '
        + 'sub-columns, at the same pixel',
        wantFromWrite !== null && drawn.x0 === wantFromWrite.x0 && drawn.w === wantFromWrite.w,
        `ghost x0=${drawn.x0} w=${drawn.w} · written sub-columns [${cols.join(',')}] → x0=`
        + `${wantFromWrite?.x0} w=${wantFromWrite?.w} · aimed integer client (${fp.aim.x},${fp.aim.y}) `
        + `· cell words ${idx.map((i) => `${i}`).join('/')}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // [m] ACROSS THE CELL'S OWN MIDLINE, WITHOUT LEAVING THE CELL
    // ═══════════════════════════════════════════════════════════════════════
    //
    // The redraw trigger used to ask only "different cell / different Alt". A
    // move from one half to the other is the SAME cell, so the ghost would keep
    // showing the first half while the click marked the second — the parcel's
    // own defect reintroduced by the cheapness guard. Nothing else exercises it:
    // the [w] rows above park elsewhere between hovers on purpose.
    console.log('\n=== [m] moving across the midline, staying inside one cell, moves the mark ===');
    await undoAll('before the midline move');
    await c.json("window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', "
      + "xFlip: false, yFlip: false, brush: 1, bothPlanes: true, crossover: 'hand-off' })");
    await c.evalExpr(clickByTitle(MARK_HALF_RE));
    await sleep(150);
    const aimL = await aimAtTile(c, leftCol, tileRow);
    const aimR = await aimAtTile(c, rightCol, tileRow);
    await rehover(aimL, park);
    const latchL = await c.json(PREVIEW_LATCH);
    // ONE move. No park, no leaving the cell.
    await mouse(c, 'mouseMoved', aimR.x, aimR.y, 0);
    await sleep(220);
    const dMid = await c.json(PREVIEW_DIFF);
    const wantMove = { from: expectBand(vp, leftCol, 1), to: expectBand(vp, rightCol, 1) };
    check('m1', '⚠ the ghost FOLLOWED the cursor across the midline — with the old cell-keyed redraw '
      + 'trigger nothing repaints and this diff is empty',
      dMid.n > 0, `${dMid.n} px changed · ${JSON.stringify(dMid)} · latch drew ${latchL.drawn} px`);
    check('m2', 'and what changed spans exactly the two sub-columns (the old band cleared, the new one drawn)',
      dMid.n > 0 && bandOf(dMid).x0 === wantMove.from.x0
      && bandOf(dMid).w === wantMove.from.w + wantMove.to.w,
      `changed box x0=${bandOf(dMid).x0} w=${bandOf(dMid).w} · want x0=${wantMove.from.x0} `
      + `w=${wantMove.from.w + wantMove.to.w}`);
    await shot(c, 'm-midline-move');

    // ── [r] restore the in-memory document ────────────────────────────────
    console.log('\n=== [r] putting the in-memory document back ===');
    await undoAll('final');
    for (const { plane, index, word } of restore) await poke(c, plane, index, word);
    let bad = 0;
    for (const { plane, index, word } of restore) if ((await collAt(c, plane, index)) !== word) bad++;
    check('r1', 'every cell this run touched is back to the word it started with, in memory',
      bad === 0, `${restore.length - bad}/${restore.length} cells restored`);
    note('[TAG-FOREGROUND]', 'Nothing here touches an emulator. This is a claim about the EDITOR\'s '
      + 'picture and its write, not about what aeon does with the bytes.');
    note('the suite', 'NO harness:* script runs in `npm test`. If the MapViewport wiring regresses — '
      + 'as opposed to the geometry in crossover-preview.test.ts — nothing in the suite catches it.');
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
  console.log('HARNESS-END loops-hover-half');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error('\nHARNESS ERROR:', e);
  console.log('HARNESS-END loops-hover-half');
  process.exit(2);
});
