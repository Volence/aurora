#!/usr/bin/env node
// THE ART FACET'S CHUNK COLLISION BRUSH, OVER REAL MOUSE EVENTS.
//
// ═══ WHY THIS FILE EXISTS (O48) ═══
//
// docs/reviews/2026-08-28-collision-word-preservation.md §8 names one surface it
// could not close, in its own words:
//
//   "The Art facet's collision brush is not driven by the harness.
//    `paintDocCollision` is fixed and covered by node rows, but no CDP row
//    performs a real press-and-drag in the chunk composer. That is the same
//    class of gap the map rows exist to close, one surface over. A follow-up
//    parcel should extend the harness rather than trust the reading."
//
// The same review's §7 states the missing claim precisely: "press and drag share
// one function, so one fix covers both" is MEASURED for MapViewport (the
// collision-preservation harness's `[p2]` and `[d2]` are separate gestures
// against separate cells) and only READ for ComposerCanvas — `hostPointer.down`
// and `.move` both call `applyTileCell`, which is a claim about source text.
//
// The node suite cannot close it. `test/art/composer-collision-paint.test.ts`
// and `test/editing/collision-word.test.ts` call `paintDocCollision` directly;
// they never mount React, never dispatch a pointer event, and cannot tell a
// wired handler from a dead one. The rows below drive the REAL app: the REAL
// aeon project, the REAL Art facet pill, a REAL chunk thumbnail, a REAL click on
// the Collision paint tool in the rail, a REAL press and a REAL drag on the
// composer canvas — and then read the composer document's own words back.
//
//   VITE_AURORA_DEBUG=1 npm run build && npm run harness:composer-collision-gesture
//
// ═══ THE VACUITY TRAP THIS AREA SITS IN, AND HOW EACH ROW ANSWERS IT ═══
//
// `collision-word.ts` states it at the top of its own file: every cell in every
// shipped act — and every chunk in the library — holds ZERO in the bits the
// brush does not own. So on real content a writer that MERGES and a writer that
// REPLACES emit the same sixteen bits, and a row that paints over a real cell
// and checks the result can only ever be green.
//
//   [f0]  measures that, on THIS document, rather than asserting it: it scans
//         every cell of both planes and reports how many carry unowned bits. A
//         non-zero count would mean a real destination exists and this comment
//         is out of date — it is printed either way.
//   [p0]  [d0]  re-assert the AUTHORED pre-state as visible rows, so a fixture
//         that failed to land is a red row and not a silent green below it.
//   [p1]  [d1]  are CONTROLS: they assert the brush's OWNED half actually
//         changed. Without them "the unowned bits survived" is satisfied by a
//         stroke that never happened, which is the failure mode the map harness
//         hit on its own first run (§ that review's table).
//
// ═══ THE MASKS ARE READ OUT OF THE APP, NOT TYPED ═══
//
// A `0x3fff` here would be a pin that outlives the day `packCollisionCell` grows
// a field — the exact failure `collision-word.ts` states the rule as a mask
// COMPLEMENT to avoid. `__dbg.aeon.collisionWordMasks()` returns the module's
// own `COLLISION_CELL_OWNED_MASK` and its complement, and the fixture's unowned
// value is the lowest set bit of the complement, so the fixture follows the rule
// instead of restating it. Both are printed.
//
// ═══ THE dpr TRAP ═══
//
// `devicePixelRatio` varies run to run under Xvfb here. [aim] prints it beside
// the canvas rect and asserts the composer's own contract — the backing store is
// CSS px (`PixelViewport` sets width/height from tiles*size*zoom, never dpr) —
// and the zoom the click arithmetic uses is DERIVED from that, not assumed.
// Every aim is an integer and is verified with `document.elementFromPoint`
// before it is sent; a miss is a loud refusal, never a red feature row.
//
// ═══ SAFETY ═══
//
// The aeon checkout is OPENED ONLY, exactly as composer-priority-harness does.
// Nothing here calls save, and there is deliberately no save anywhere in this
// file: every write lands in the composer's IN-MEMORY document, which is a copy
// `docFromChunk` took at open. [z1] puts every cell this run touched back to the
// word it found there and re-reads it, so the row fails if a restore did not.
//
// ═══ RUNNING IT FROM A WORKTREE ═══
//
// A linked worktree has no `node_modules/` and no `dist/`, so the tree carrying
// the build can be a different directory from the one this file lives in;
// `announceRunRoot` prints which tree was chosen and marks it BORROWED when it
// is not this one. `ELECTRON_BIN` overrides the binary half. See
// scratchpad/lib/run-root.mjs.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { execSync } from 'node:child_process';
import { statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9427);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEON_DIR = siblingPathOrUnresolved('aeon');   // OPEN ONLY — never saved
const SHOTS = join(ROOT, 'scratchpad/shots-composer-collision');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = []; const notes = [];
function check(id, what, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok: pass }); if (!pass) fails.push(id);
}
function note(label, detail) {
  console.log(`NOTE  ${label}\n        ${detail}`);
  notes.push(label);
}
const HEX = (n) => (n === null || n === undefined ? 'null' : `0x${(n & 0xFFFF).toString(16).padStart(4, '0')}`);

function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map(); const exceptions = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description ?? d.text ?? '(unknown)');
    }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  return {
    ready, send, evalExpr, exceptions,
    json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)),
    close: () => ws.close(),
  };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}

// ── real mouse events. `buttons: 1` on the MOVE is what makes a drag a drag ──
async function mouse(c, type, x, y) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left',
    buttons: type === 'mouseReleased' ? 0 : (type === 'mousePressed' || type === 'mouseMovedDown' ? 1 : 0),
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
  });
}
/** A move with the button HELD — CDP has no separate type, so `buttons: 1` is
 *  the only thing that distinguishes a drag from a hover. Getting this wrong
 *  makes every drag row a hover and the far cell silently unpainted. */
async function dragMove(c, x, y) {
  await c.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x, y, button: 'left', buttons: 1, clickCount: 0,
  });
}
async function press(c, x, y) {
  await mouse(c, 'mouseMoved', x, y);
  await mouse(c, 'mousePressed', x, y);
}
async function release(c, x, y) { await mouse(c, 'mouseReleased', x, y); }

const clickByText = (sel, text) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})];
  const b = els.find((e) => e.textContent.trim() === ${JSON.stringify(text)});
  if (!b) return 'not-found: ' + JSON.stringify(els.slice(0, 12).map((e) => e.textContent.trim()));
  b.scrollIntoView(); b.click(); return 'clicked';
})()`;

/** The composer canvas — the one inside ComposerCanvas's own auto-margin /
 *  24px-padding holder, and only while it is on screen. Lifted verbatim from
 *  composer-priority-harness so the two cannot drift onto different canvases. */
const COMPOSER_CANVAS = `[...document.querySelectorAll('canvas')].find((k) =>
  k.parentElement && k.parentElement.style.margin === 'auto'
  && k.parentElement.style.padding === '24px' && k.offsetParent !== null)`;

/** The PLANE row's A/B buttons in the mounted collision palette, addressed
 *  through the row's own "Plane" label rather than by bare text — a repo this
 *  size has many buttons reading "A" and "B". */
const clickPlane = (which) => `(() => {
  const label = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === 'Plane');
  if (!label) return 'no-plane-row';
  const b = [...label.parentElement.querySelectorAll('button')]
    .find((e) => e.textContent.trim() === ${JSON.stringify(which)});
  if (!b) return 'no-button';
  b.scrollIntoView(); b.click(); return 'clicked';
})()`;

async function main() {
  const distM = statSync(MAIN).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }

  let app = null, c = null;
  /** index -> the word found there at first touch, for [z1]. */
  const touched = new Map();   // key `${plane}:${index}`
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run',
      ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
      { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    // A stored session can park the app on a dead tab; clear it, as every
    // sibling CDP harness in this directory does.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // ── [1] the real project, the real Art facet, a real chunk ─────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON_DIR)})`);
    await sleep(1500);
    const st0 = await c.json('window.__dbg.aeon.state()');
    await c.evalExpr(`window.__dbg.activate(${JSON.stringify(st0.zone)}, ${JSON.stringify(st0.act)})`);
    await sleep(900);
    const artPill = await c.evalExpr(clickByText('[aria-label="Facets"] button', 'Art'));
    await sleep(1200);
    const opened = await c.evalExpr(`(() => {
      const cells = [...document.querySelectorAll('button')].filter((e) => e.querySelector('canvas'));
      const b = cells[0];
      if (!b) return 'no-thumb';
      b.scrollIntoView();
      b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return 'dblclicked';
    })()`);
    await sleep(1400);
    const open1 = await c.json('window.__dbg.aeon.artChunkOpen()');
    check('1', 'the real aeon project opens and the Art facet mounts the composer on a real chunk',
      st0.open === true && artPill === 'clicked' && !!open1 && open1.chunkId !== null,
      `state=${JSON.stringify(st0)} artPill=${artPill} dbl=${opened} open=${JSON.stringify(open1)}`);
    if (!open1 || open1.chunkId === null) throw new Error('no composer document — nothing below can run');

    // ── [2] the Collision paint tool, armed by a REAL click on the rail ─────
    // The label is ArtToolDock's own ('collision', 'Collision paint'); a wrong
    // one here reports 'no-tool' rather than arming nothing quietly.
    const armTool = await c.evalExpr(`(() => {
      const b = document.querySelector('button[aria-label="Collision paint"]');
      if (!b) return 'no-tool'; b.click(); return 'clicked';
    })()`);
    await sleep(700);
    const armed = await c.json('window.__dbg.aeon.artChunkOpen()');
    // The art-variant palette mounts only for this tool on a tile-space doc
    // (art-facet.tsx `showCollisionPanel`), so its presence is the second half
    // of "the tool is really armed on this facet".
    const paletteUp = await c.evalExpr(
      `[...document.querySelectorAll('span')].some((s) => s.textContent.trim() === 'Plane')`);
    check('2', 'a real click on the rail arms Collision paint and the Art facet mounts its collision palette',
      armTool === 'clicked' && armed.tool === 'collision' && paletteUp === true,
      `click=${armTool} artStore.tool=${armed.tool} palette-mounted=${paletteUp}`);
    if (armed.tool !== 'collision') throw new Error('collision tool not armed — every gesture below would measure nothing');

    // Arm a non-air shape through the app's own setters (the palette's swatch
    // grid is a canvas-per-button; `armCollisionBrush` goes through
    // pickCollisionShape/setSelectedCollisionSolidity, the same calls a swatch
    // click makes). Called with {} below it is a pure read.
    const brush = await c.json(
      `window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all', xFlip: false, yFlip: false })`);
    const masks = await c.json('window.__dbg.aeon.collisionWordMasks()');
    // Lowest set bit of the complement — derived, so the fixture follows the
    // ownership rule rather than restating it as a literal.
    const UNOWNED_BIT = masks.unowned & -masks.unowned;
    note('the ownership rule, as the app computes it',
      `owned=${HEX(masks.owned)} unowned=${HEX(masks.unowned)} → fixture's unowned value = ${HEX(UNOWNED_BIT)}; `
      + `armed brush word=${HEX(brush.word)} on plane ${brush.plane.toUpperCase()}`);
    if (!masks.unowned || !UNOWNED_BIT) {
      throw new Error('the collision word has no unowned bits — the preservation claim has no subject here');
    }
    if ((brush.word & masks.owned) === 0) {
      throw new Error('the armed brush writes zero owned bits — the CONTROL rows could not discriminate');
    }

    // ── [aim] the geometry contract ────────────────────────────────────────
    const geo = await c.json(`(() => {
      const cv = ${COMPOSER_CANVAS};
      if (!cv) return { ok: false };
      const r = cv.getBoundingClientRect();
      return { ok: true, left: r.left, top: r.top, rectW: r.width, rectH: r.height,
        w: cv.width, h: cv.height, dpr: window.devicePixelRatio };
    })()`);
    if (!geo.ok) throw new Error('composer canvas not found — nothing below can run');
    const zoom = geo.w / (open1.widthTiles * 8);
    const CELLS_W = open1.widthTiles >> 1;
    const CELLS_H = open1.heightTiles >> 1;
    check('aim', 'the composer canvas backing store is CSS px, not dpr px — the click arithmetic depends on it',
      geo.w === Math.floor(geo.rectW) && Number.isInteger(zoom) && zoom >= 1,
      `dpr=${geo.dpr} rect=${geo.left.toFixed(1)},${geo.top.toFixed(1)} ${geo.rectW.toFixed(1)}x${geo.rectH.toFixed(1)} `
      + `canvas=${geo.w}x${geo.h} doc=${open1.widthTiles}x${open1.heightTiles} tiles → zoom=${zoom}, `
      + `${CELLS_W}x${CELLS_H} collision cells`);

    /** Screen point at the CENTRE of 16px collision cell (cx,cy). Integer. */
    const cellPoint = (cx, cy) => ({
      x: Math.round(geo.left + (cx * 16 + 8) * zoom),
      y: Math.round(geo.top + (cy * 16 + 8) * zoom),
    });
    const onCanvas = async (p) => c.evalExpr(
      `document.elementFromPoint(${p.x}, ${p.y}) === ${COMPOSER_CANVAS}`);
    const cellIndex = (cx, cy) => cy * CELLS_W + cx;
    const readCell = (plane, idx) => c.json(`window.__dbg.aeon.artDocCollisionAt('${plane}', ${idx})`);
    async function poke(plane, idx, word) {
      const key = `${plane}:${idx}`;
      if (!touched.has(key)) touched.set(key, await readCell(plane, idx));
      return c.json(`window.__dbg.aeon.artDocCollisionPoke('${plane}', ${idx}, ${word})`);
    }
    async function willTouch(plane, idx) {
      const key = `${plane}:${idx}`;
      if (!touched.has(key)) touched.set(key, await readCell(plane, idx));
    }

    // ── [f0] the vacuity measurement, on THIS document ─────────────────────
    const scan = await c.json(`(() => {
      let a = 0, b = 0, n = 0;
      for (let i = 0; i < ${CELLS_W * CELLS_H}; i++) {
        const wa = window.__dbg.aeon.artDocCollisionAt('a', i);
        const wb = window.__dbg.aeon.artDocCollisionAt('b', i);
        if (wa === null || wb === null) continue;
        n++;
        if (wa & ${masks.unowned}) a++;
        if (wb & ${masks.unowned}) b++;
      }
      return { cells: n, aUnowned: a, bUnowned: b };
    })()`);
    check('f0', 'ANTI-VACUOUS: ZERO real cells of this chunk carry unowned bits — so a row painting over '
      + 'real content would be VACUOUS, and the fixture below has to be AUTHORED',
      scan.cells === CELLS_W * CELLS_H && scan.aUnowned === 0 && scan.bUnowned === 0,
      `chunk ${open1.chunkId} (${open1.name}): ${scan.cells} cells read of ${CELLS_W * CELLS_H} expected; `
      + `carrying unowned bits: plane A ${scan.aUnowned}, plane B ${scan.bUnowned}`);

    // ── find two cells on screen, far enough apart for a real drag ─────────
    let pressCell = null, farCell = null;
    for (let cy = 0; cy < CELLS_H && !pressCell; cy++) {
      for (let cx = 0; cx < CELLS_W && !pressCell; cx++) {
        const p = cellPoint(cx, cy);
        if (await onCanvas(p)) pressCell = { cx, cy, ...p };
      }
    }
    if (!pressCell) throw new Error('no composer cell is on screen — every aim would miss');
    for (let cx = CELLS_W - 1; cx > pressCell.cx + 2 && !farCell; cx--) {
      const p = cellPoint(cx, pressCell.cy);
      if (await onCanvas(p)) farCell = { cx, cy: pressCell.cy, ...p };
    }
    if (!farCell) throw new Error('no second cell at least 3 cells away is on screen — a drag row would be a press row');
    note('the two destinations',
      `press cell (${pressCell.cx},${pressCell.cy}) idx ${cellIndex(pressCell.cx, pressCell.cy)} at screen `
      + `${pressCell.x},${pressCell.y}; drag far cell (${farCell.cx},${farCell.cy}) idx `
      + `${cellIndex(farCell.cx, farCell.cy)} at ${farCell.x},${farCell.y} — ${farCell.cx - pressCell.cx} cells apart`);
    await shot(c, '01-armed');

    // ═══ THE PRESS ═════════════════════════════════════════════════════════
    const pIdx = cellIndex(pressCell.cx, pressCell.cy);
    // A shape that is NOT the brush's, so [p1] can fail: the owned half has to
    // MOVE, not merely already agree.
    const other = await c.json(
      `window.__dbg.aeon.armCollisionBrush({ shape: 2, solidity: 'top', xFlip: true, yFlip: false })`);
    const FIXTURE = ((other.word & masks.owned) | UNOWNED_BIT) & 0xFFFF;
    await c.json(`window.__dbg.aeon.armCollisionBrush({ shape: 1, solidity: 'all', xFlip: false, yFlip: false })`);
    const brushNow = await c.json('window.__dbg.aeon.armCollisionBrush({})');
    const stored = await poke('a', pIdx, FIXTURE);
    const pBefore = await readCell('a', pIdx);
    check('p0', 'the press destination REALLY carries unowned bits before the stroke, and an owned half the '
      + 'brush must change (NOT vacuous)',
      stored === FIXTURE && pBefore === FIXTURE
      && (pBefore & masks.unowned) === UNOWNED_BIT
      && (pBefore & masks.owned) !== (brushNow.word & masks.owned),
      `fixture ${HEX(FIXTURE)} stored=${HEX(stored)} read-back=${HEX(pBefore)}; `
      + `unowned half ${HEX(pBefore & masks.unowned)}; owned half ${HEX(pBefore & masks.owned)} vs `
      + `brush's ${HEX(brushNow.word & masks.owned)}`);

    const dirtyBefore = (await c.json('window.__dbg.aeon.artChunkOpen()')).dirty;
    await press(c, pressCell.x, pressCell.y);
    await sleep(250);
    await release(c, pressCell.x, pressCell.y);
    await sleep(350);
    const pAfter = await readCell('a', pIdx);
    const dirtyAfter = (await c.json('window.__dbg.aeon.artChunkOpen()')).dirty;

    check('p1', 'CONTROL: a REAL press on the composer canvas painted the armed brush into the doc cell',
      (pAfter & masks.owned) === (brushNow.word & masks.owned) && dirtyAfter === true,
      `cell ${pIdx} ${HEX(pBefore)} → ${HEX(pAfter)}; owned half ${HEX(pAfter & masks.owned)} `
      + `vs brush ${HEX(brushNow.word & masks.owned)}; doc dirty ${dirtyBefore} → ${dirtyAfter}`);
    check('p2', "the press PRESERVED the cell's unowned bits — the composer's brush merges, it does not replace",
      (pAfter & masks.unowned) === UNOWNED_BIT,
      `unowned half ${HEX(pBefore & masks.unowned)} → ${HEX(pAfter & masks.unowned)} (want ${HEX(UNOWNED_BIT)}); `
      + `whole word ${HEX(pAfter)}`);
    await shot(c, '02-after-press');

    // ═══ THE DRAG ══════════════════════════════════════════════════════════
    // A cell the PRESS could not have reached, so [d1] measures the move path
    // and not the down path. The intermediate cells are asserted too: the move
    // handler fills the line between the last cell and this one
    // (`linePoints(...).slice(1)`), and a drag that only wrote its endpoints
    // would leave them air.
    const fIdx = cellIndex(farCell.cx, farCell.cy);
    const midCx = pressCell.cx + Math.floor((farCell.cx - pressCell.cx) / 2);
    const mIdx = cellIndex(midCx, pressCell.cy);
    const fStored = await poke('a', fIdx, FIXTURE);
    await willTouch('a', mIdx);
    const dBefore = await readCell('a', fIdx);
    const mBefore = await readCell('a', mIdx);
    check('d0', 'the DRAG destination is a DIFFERENT cell the press never touched, and it too really carries '
      + 'unowned bits before the stroke',
      fIdx !== pIdx && fStored === FIXTURE && dBefore === FIXTURE
      && (dBefore & masks.owned) !== (brushNow.word & masks.owned),
      `press idx ${pIdx}, drag idx ${fIdx} (${farCell.cx - pressCell.cx} cells away); fixture read-back `
      + `${HEX(dBefore)}; midpoint cell ${mIdx} starts at ${HEX(mBefore)}`);

    await press(c, pressCell.x, pressCell.y);
    await sleep(120);
    // Several intermediate moves with the button HELD — a single jump would
    // exercise `linePoints` and nothing else.
    const STEPS = 6;
    for (let s = 1; s <= STEPS; s++) {
      const x = Math.round(pressCell.x + ((farCell.x - pressCell.x) * s) / STEPS);
      await dragMove(c, x, pressCell.y);
      await sleep(70);
    }
    await release(c, farCell.x, farCell.y);
    await sleep(400);
    const dAfter = await readCell('a', fIdx);
    const mAfter = await readCell('a', mIdx);

    check('d1', 'CONTROL: the DRAG reached the far cell AND the cells on the line between — the move path '
      + 'writes, not just the press',
      (dAfter & masks.owned) === (brushNow.word & masks.owned)
      && (mAfter & masks.owned) === (brushNow.word & masks.owned),
      `far cell ${fIdx} ${HEX(dBefore)} → ${HEX(dAfter)}; midpoint ${mIdx} ${HEX(mBefore)} → ${HEX(mAfter)}; `
      + `brush owned half ${HEX(brushNow.word & masks.owned)}`);
    check('d2', "the DRAG preserved the far cell's unowned bits — press and drag really do share one writer",
      (dAfter & masks.unowned) === UNOWNED_BIT,
      `unowned half ${HEX(dBefore & masks.unowned)} → ${HEX(dAfter & masks.unowned)} (want ${HEX(UNOWNED_BIT)}); `
      + `whole word ${HEX(dAfter)}`);
    await shot(c, '03-after-drag');

    // ═══ THE PLANE PICK, THROUGH THE REAL PALETTE BUTTON ═══════════════════
    // The composer reads `editorStore.collisionPaintPlane` at paint time
    // (ComposerCanvas :383-388). Nothing else in this repo drives the palette's
    // own A/B buttons — every other harness arms the plane through a setter —
    // so this row covers the button AND the composer's read of it in one.
    const planeClick = await c.evalExpr(clickPlane('B'));
    await sleep(400);
    const planeNow = await c.json('window.__dbg.aeon.armCollisionBrush({})');
    // A THIRD cell: a plane-B write onto a cell this run already painted on A
    // could not tell "wrote B" from "wrote A again".
    let bCell = null;
    for (let cy = pressCell.cy + 1; cy < CELLS_H && !bCell; cy++) {
      const p = cellPoint(pressCell.cx, cy);
      if (await onCanvas(p)) bCell = { cx: pressCell.cx, cy, ...p };
    }
    if (!bCell) throw new Error('no third cell on a different row is on screen — the plane row cannot be isolated');
    const bIdx = cellIndex(bCell.cx, bCell.cy);
    await poke('b', bIdx, FIXTURE);
    await willTouch('a', bIdx);
    const bA0 = await readCell('a', bIdx);
    const bB0 = await readCell('b', bIdx);
    await press(c, bCell.x, bCell.y);
    await sleep(250);
    await release(c, bCell.x, bCell.y);
    await sleep(350);
    const bA1 = await readCell('a', bIdx);
    const bB1 = await readCell('b', bIdx);
    check('b1', 'the palette\'s own Plane B button aims the composer brush at plane B: the press writes B '
      + '(unowned bits kept) and leaves the SAME cell on plane A untouched',
      planeClick === 'clicked' && planeNow.plane === 'b'
      && (bB1 & masks.owned) === (brushNow.word & masks.owned)
      && (bB1 & masks.unowned) === UNOWNED_BIT
      && bA1 === bA0,
      `click=${planeClick} plane=${planeNow.plane}; cell ${bIdx} plane B ${HEX(bB0)} → ${HEX(bB1)}; `
      + `plane A ${HEX(bA0)} → ${HEX(bA1)} (must not move)`);
    await shot(c, '04-after-plane-b');

    // ── [z1] restore ───────────────────────────────────────────────────────
    // The document is a copy `docFromChunk` took at open and nothing here saves,
    // so this cannot reach the aeon checkout — it is the discipline, and the row
    // is what says the restore actually happened rather than being asserted.
    let restored = 0;
    const stuck = [];
    for (const [key, was] of touched) {
      const [plane, idxStr] = key.split(':');
      const idx = Number(idxStr);
      await c.json(`window.__dbg.aeon.artDocCollisionPoke('${plane}', ${idx}, ${was})`);
      const now = await readCell(plane, idx);
      if (now === was) restored++; else stuck.push(`${key} ${HEX(was)}≠${HEX(now)}`);
    }
    check('z1', 'every doc cell this run touched is back to the word it started with',
      restored === touched.size && stuck.length === 0,
      `${restored}/${touched.size} cells restored${stuck.length ? `; STUCK: ${stuck.join(', ')}` : ''}; `
      + `no save was issued — this file contains no save call, and the composer document is a copy `
      + `docFromChunk took at open`);

    // ── [x] nothing threw behind any of it ─────────────────────────────────
    check('x', 'the app threw no uncaught exception across the whole run',
      c.exceptions.length === 0,
      c.exceptions.length ? c.exceptions.slice(0, 4).join('\n        ') : 'none');
  } finally {
    if (c) c.close();
    if (app) await killTree(app);
  }

  console.log(`\n════ ${results.filter((r) => r.ok).length}/${results.length} ════`);
  if (fails.length) { console.log(`FAILED: ${fails.join(', ')}`); process.exit(1); }
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
