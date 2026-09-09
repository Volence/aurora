#!/usr/bin/env node
// IS THE EDIT THAT Ctrl+Z ON A CHUNK DOCUMENT DESTROYED RECOVERABLE BY REDO?
//
// `docs/reviews/2026-09-09-chunk-undo-measure.md` measured the defect and left
// exactly one thing derived (its §5):
//
//     Only the `Undo` chip's `disabled` was read. Whether the destroyed
//     zone-art edit can be recovered with Ctrl+Shift+Z was NOT measured, and it
//     matters to how bad this is: a recoverable loss and an unrecoverable one
//     are different rows.
//
// This harness is that row. It rebuilds the SAME discriminating setup — a
// zone-art edit made on ANOTHER document first, then a doc-local gesture on a
// chunk document, then Ctrl+Z — and then presses REDO and reads the ZONE-ART
// WITNESS.
//
// ⚠ A CANVAS HASH CANNOT ANSWER THIS. A chunk document's atlas-backed cells are
// drawn from the ZONE TILESET, so reverting a zone tile repaints the chunk's
// canvas while the document itself is untouched; the previous packet's first run
// read that repaint as "the stroke was taken back" and misreported. Every row
// below reads `zoneArtHash()` (FNV over the zone's tileset bytes, sampled while
// the composer shows some other document) for the zone-art half, and
// `artDocPixelAt` / `artDocCollisionAt` / `artDocCellAt` for the doc-local half.
// The canvas hash is REPORTED as an observation and asserted on nothing.
//
// THE FOUR CELLS THIS EXISTS TO FILL:
//
//   1  Does Redo restore the eaten zone-art edit?     row R3 (and R10 for the
//      other binding the app offers, Ctrl+Shift+Z)
//   2  Is the Redo control ENABLED at that moment?    rows R2a (the chip the
//      author actually sees) and R2b (the store behind it)
//      ("enabled and wrong" and "disabled and inert" are different defects and
//       the author can tell them apart BEFORE pressing.)
//   3  Does Redo instead do something to the author's own doc-local work?  R4
//   4  What happens on a SECOND press — the undo eats edits one at a time, so
//      the stack has depth and the redo side may too.  rows R5, R6, R7, R8, R9
//
// AND TWO ROWS BEYOND THE FOUR:
//
//   S  TILE STAMP. The measurement drove pencil (P3b) and collision paint;
//      paste/cut/selection-move/the seven transforms/tile-stamp/palette-apply
//      stayed derived. Tile stamp is the one driven here because a chunk IS a
//      nametable of atlas tiles — placing a tile into a cell is the PRIMARY
//      authoring gesture on a chunk document, so if any of the six is going to
//      be performed on one it is this. The rest stay derived and the packet
//      says so.
//
//   X  TRUNCATION. After the misfire has eaten an edit, the author keeps
//      working. If their next gesture is a REAL zone-art command (census path
//      P3a — the identical pencil stroke on an ATLAS-BACKED cell of the same
//      chunk document), a normal undo stack truncates its redo side. Whether
//      the eaten edit survives that is the difference between "recoverable if
//      you notice immediately" and "recoverable only if you do nothing else".
//
// ⚠ THE RECOVERY ROWS ARE WRITTEN TO PASS IF REDO IS A CLEAN ROUND TRIP.
// R0/R3/R4/R5/R7/R8/R9/R10/S4 all go GREEN when the destroyed edit comes back.
// The harness must not prefer the alarming answer: a green run there LOWERS the
// severity of the measured defect and that is a real result, not a failure to
// find one.
//
// TWO ROWS ARE RED BY DESIGN while the defect stands, and this file EXITS 1 for
// them:
//
//   S3  the twin of the previous packet's T2, for a third gesture.
//   X3  the rescue Redo offers does not survive the author's next real
//       zone-art command.
//
// Each goes GREEN by itself the day it is fixed. The summary line names
// whichever fired.
//
// ⚠ dpr varies run to run on this box. Every aim is an INTEGER client pixel; the
// doc pixel is derived from that integer through PixelViewport's own
// `floor((client - rect.left) / zoom)` and the cell it lands in is ASSERTED to
// be the cell aimed at.
//
// ⚠ THE SETUP CAN SILENTLY DEGRADE. Row Z1 is FATAL: if the tileset double-click
// does not open a live-tile document, the setup edits land on the CHUNK document
// still open (census P3a) and every row below measures a weaker experiment that
// still reproduces. The previous run found the Tileset panel at y=2796 in a
// 1050px window. Scroll first, re-read the rect, then assert.
//
// EXITS 1 BY DESIGN while the measured defect stands (rows S3 and X3, plus any
// recovery row that turns out red). The summary line says which fired.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:chunk-undo-redo

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9421);
const ROOT = AURORA_DIR;
const AEON = siblingPathOrUnresolved('aeon');
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const SHOTS = `${ROOT}/scratchpad/shots-chunk-undo-redo`;
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CDP plumbing ────────────────────────────────────────────────────────────
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
  console.log(`NOTE  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok: null });
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-chunk-undo-redo/${name}.png`);
}

// ── FIXTURE: a hardlinked copy; the live aeon tree is never opened ───────────
function hardlinkCopy(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync('cp', ['-al', AEON, dest]);
  return dest;
}

// The composer canvas is the ONE canvas PixelViewport renders with inline
// `cursor: crosshair` + `imageRendering: pixelated`. REFUSES rather than picking
// the first when that names more than one.
const PROBE = String.raw`
(() => {
  const all = [...document.querySelectorAll('canvas')];
  const mine = all.filter(c => c.style.cursor === 'crosshair' && c.style.imageRendering === 'pixelated');
  if (mine.length !== 1) {
    return { installed: false, candidates: mine.length, canvases: all.length };
  }
  const cv = mine[0];
  const g = cv.getContext('2d', { willReadFrequently: true });
  window.__au = {
    el: cv,
    rect: () => cv.getBoundingClientRect().toJSON(),
    size: () => ({ w: cv.width, h: cv.height }),
    hash: () => {
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i+1]*3 + d[i+2]*7) >>> 0; }
      return h;
    },
    docPixel: (x, y, zoom) => {
      const r = cv.getBoundingClientRect();
      return { px: Math.floor((x - r.left) / zoom), py: Math.floor((y - r.top) / zoom) };
    },
  };
  return { installed: true, canvases: all.length };
})()`;

/** Both history chips, by their own visible text, read the way the AUTHOR reads
 *  them: `disabled` is what greys the control out before anything is pressed. */
const CHIPS = String.raw`
(() => {
  const find = (t) => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === t);
  const u = find('Undo'), r = find('Redo');
  return {
    undo: u ? { present: true, disabled: !!u.disabled } : { present: false, disabled: null },
    redo: r ? { present: true, disabled: !!r.disabled } : { present: false, disabled: null },
  };
})()`;

async function mouse(c, type, x, y, clickCount = 1) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mousePressed' ? 1 : 0, clickCount,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function park(c) { await mouse(c, 'mouseMoved', 4, 4); await sleep(150); }

async function main() {
  console.log(`AEON (read-only source of the fixture): ${AEON}`);
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);

  const FIXTURE = join(ROOT, 'scratchpad/fixtures/aeon-chunk-undo-redo');
  console.log('\nBUILDING THE HARDLINKED FIXTURE (the aeon tree is never opened)…');
  hardlinkCopy(FIXTURE);
  console.log(`  fixture: ${FIXTURE}`);
  if (!existsSync(join(FIXTURE, 'project.json'))) throw new Error('fixture has no project.json');

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
    check('0a', 'window.__dbg exists (VITE_AURORA_DEBUG=1 build) [precondition]', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npx electron-vite build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');
    const haveRedoHook = await c.evalExpr('typeof window.__dbg.aeon.canRedo === "function"');
    check('0a2', 'the read-only canRedo() hook is present in this build [precondition]', haveRedoHook,
      `typeof window.__dbg.aeon.canRedo = ${haveRedoHook ? 'function' : 'MISSING — rebuild'}`);
    if (!haveRedoHook) throw new Error('canRedo() hook missing — the build predates this harness');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(FIXTURE)})`)
      .catch((e) => console.log('        open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('0b', 'the fixture aeon project is open with sections [precondition]',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(1200);

    const facet = await c.json(`window.__dbg.aeon.setFacet('art')`);
    check('0c', 'the Art facet is focused [precondition]', facet?.facet === 'art', JSON.stringify(facet));
    await sleep(900);
    await c.json('window.__dbg.revealSections()').catch(() => null);
    await sleep(400);

    const dpr = await c.evalExpr('window.devicePixelRatio');
    const zoneTiles = await c.evalExpr('window.__dbg.aeon.zoneTileCount()');
    console.log(`\n        devicePixelRatio for this run: ${dpr}   zone tileset tiles: ${zoneTiles}`);
    check('0d', 'the open zone has a tileset the zone-art witness can read [precondition]',
      typeof zoneTiles === 'number' && zoneTiles > 1, `zoneTileCount()=${zoneTiles}`);

    const zoneHash = () => c.evalExpr('window.__dbg.aeon.zoneArtHash()');
    const focused = () => c.evalExpr('window.__dbg.aeon.focusedDocId()');
    const canUndo = () => c.evalExpr('window.__dbg.aeon.canUndo()');
    const canRedo = () => c.evalExpr('window.__dbg.aeon.canRedo()');
    const chips = () => c.json(CHIPS);
    const openInfo = () => c.json('window.__dbg.aeon.artChunkOpen()');
    const collAt = (i) => c.evalExpr(`window.__dbg.aeon.artDocCollisionAt('a', ${i})`);
    const cellAt = (cx, cy) => c.json(`window.__dbg.aeon.artDocCellAt(${cx}, ${cy})`);
    const canvasHash = async () => {
      const inst = await c.json(PROBE);
      if (!inst.installed) return null;
      return c.evalExpr('window.__au.hash()');
    };

    const pressAt = async (p, clicks = 1) => {
      await mouse(c, 'mouseMoved', p.x, p.y);
      for (let i = 1; i <= clicks; i++) {
        await mouse(c, 'mousePressed', p.x, p.y, i);
        await mouse(c, 'mouseReleased', p.x, p.y, i);
        if (i < clicks) await sleep(90);
      }
    };
    const clickSelector = async (selector) => {
      const p = await c.json(`(() => {
        const b = document.querySelector(${JSON.stringify(selector)});
        if (!b) return null;
        b.scrollIntoView({block:'center'});
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
                 label: b.getAttribute('aria-label') || b.getAttribute('title') || '' };
      })()`);
      if (!p) return null;
      await pressAt(p); await sleep(500);
      return p;
    };
    const answerDiscard = async (id, what) => {
      const asked = await c.json(`(() => {
        const b = [...document.querySelectorAll('button')]
          .find(b => /^Discard & (close|open)$/.test(b.innerText.trim()));
        if (!b) return { dialog: false };
        const r = b.getBoundingClientRect();
        return { dialog: true, label: b.innerText.trim(),
                 x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
      })()`);
      if (asked.dialog) { await pressAt(asked); await sleep(800); }
      if (id) {
        note(id, what, asked.dialog ? `the unsaved-work dialog was up; pressed "${asked.label}"`
          : 'no dialog — the document was clean');
      }
      return asked.dialog;
    };

    const cellTitles = await c.json(`(() => [...document.querySelectorAll('button[title]')]
      .filter(b => b.querySelector('canvas'))
      .filter(b => { const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8; })
      .map(b => b.getAttribute('title')))()`);
    check('0e', 'the Chunk Library panel is on screen with cells to open [precondition]',
      Array.isArray(cellTitles) && cellTitles.length > 0, `${cellTitles?.length ?? 0} chunk cells`);
    if (!cellTitles || !cellTitles.length) throw new Error('no chunk library cells on screen');

    const openChunkByTitle = async (title, id, what) => {
      const cell = await c.json(`(() => {
        const b = [...document.querySelectorAll('button[title]')]
          .filter(el => el.querySelector('canvas'))
          .find(el => el.getAttribute('title') === ${JSON.stringify(title)});
        if (!b) return null;
        b.scrollIntoView({block:'center'});
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
                 title: b.getAttribute('title') };
      })()`);
      if (!cell) { if (id) note(id, 'the chunk library cell could not be located', title); return null; }
      await pressAt(cell, 2);
      await sleep(700);
      await answerDiscard(id ? `${id}x` : null, 'answered the open guard while opening the chunk');
      await sleep(1000);
      const o = await openInfo();
      if (id) note(id, what ?? `opened the chunk by double-clicking "${cell.title}"`, JSON.stringify(o));
      return o;
    };

    let plan = null;

    /** Choose an EMPTY (atlasTile === null) cell of the open chunk document that
     *  is on screen — the doc-local aim — AND, separately, an ATLAS-BACKED cell,
     *  which row X needs to produce a REAL zone-art command (census P3a) from
     *  the same document. Both are asserted to be the cell aimed at. */
    const planAim = async () => {
      const inst = await c.json(PROBE);
      if (!inst.installed) return { error: 'the pixel canvas is not uniquely identifiable' };
      const rect = await c.json('window.__au.rect()');
      const size = await c.json('window.__au.size()');
      const o = await openInfo();
      const zoom = size.w / (o.widthTiles * 8);
      const view = await c.json('({ w: window.innerWidth, h: window.innerHeight })');
      // TWO empty cells, not one. Row S's tile stamp turns its cell into an
      // ATLAS-BACKED one, and a pencil stroke on an atlas-backed cell is census
      // path P3a — a real zone-art command. Row X, which needs one more
      // DOC-LOCAL gesture after row S has run, must therefore aim somewhere row
      // S has not been, or its own precondition is false for a reason that has
      // nothing to do with what it is measuring.
      let empty = null, empty2 = null, atlas = null;
      for (let cy = 0; cy < o.heightTiles; cy++) {
        for (let cx = 0; cx < o.widthTiles; cx++) {
          const px = Math.round(rect.x + (cx * 8 + 4) * zoom);
          const py = Math.round(rect.y + (cy * 8 + 4) * zoom);
          if (px < 4 || py < 4 || px > view.w - 4 || py > view.h - 4) continue;
          if (px < rect.x || py < rect.y || px > rect.x + rect.width || py > rect.y + rect.height) continue;
          const cell = await cellAt(cx, cy);
          if (!cell) continue;
          const dp = await c.json(`window.__au.docPixel(${px}, ${py}, ${zoom})`);
          if ((dp.px >> 3) !== cx || (dp.py >> 3) !== cy) continue;
          if (cell.atlasTile === null && !empty) {
            const collIndex = (cy >> 1) * (o.widthTiles >> 1) + (cx >> 1);
            empty = { cx, cy, px, py, dp, collIndex };
          } else if (cell.atlasTile === null && !empty2) {
            empty2 = { cx, cy, px, py, dp };
          } else if (cell.atlasTile !== null && !atlas) {
            atlas = { cx, cy, px, py, dp, atlasTile: cell.atlasTile };
          }
          if (empty && empty2 && atlas) break;
        }
        if (empty && empty2 && atlas) break;
      }
      if (!empty) return { error: 'no EMPTY, on-screen cell in this chunk document' };
      return { ...empty, empty2, atlas, zoom, rect, size,
               widthTiles: o.widthTiles, heightTiles: o.heightTiles, view };
    };

    const strokeAt = async (px, py) => {
      await mouse(c, 'mouseMoved', px, py);
      await mouse(c, 'mousePressed', px, py);
      await sleep(60);
      await mouse(c, 'mouseReleased', px, py);
      await sleep(700);
      await park(c);
    };

    /**
     * THE INTEGER CLIENT PIXEL FOR ONE DOC CELL, RE-DERIVED FROM THE RECT AS IT
     * IS RIGHT NOW.
     *
     * ⚠ Not a tidy-up. Arming a tool goes through `scrollIntoView` on the tool
     * rail's button, and the tools further down the rail scroll ancestors the
     * ones at the top do not — `Tile stamp` is ninth, `Pencil` is first. A run
     * that armed the stamp and then reused a client point derived before the
     * scroll dispatched its press at a coordinate the canvas no longer occupied:
     * the gesture landed on nothing, the cell did not change, and the Ctrl+Z
     * after it STILL ate a zone-art edit — a row that looks exactly like the
     * finding while measuring a no-op. Measured on the first run of this
     * harness: `atlasTile null -> null` with the tool correctly armed.
     *
     * The DOC pixel is invariant under this (a cell centre is always
     * `(cx*8+4, cy*8+4)`), so the doc-local witness is the same pixel across
     * every row; only the client integer moves.
     */
    const aimFor = async (cx, cy) => {
      const inst = await c.json(PROBE);
      if (!inst.installed) return { error: 'the pixel canvas is not uniquely identifiable' };
      const rect = await c.json('window.__au.rect()');
      const view = await c.json('({ w: window.innerWidth, h: window.innerHeight })');
      const px = Math.round(rect.x + (cx * 8 + 4) * plan.zoom);
      const py = Math.round(rect.y + (cy * 8 + 4) * plan.zoom);
      const dp = await c.json(`window.__au.docPixel(${px}, ${py}, ${plan.zoom})`);
      return {
        px, py, dp, rect,
        onScreen: px >= 4 && py >= 4 && px <= view.w - 4 && py <= view.h - 4
          && px >= rect.x && py >= rect.y && px <= rect.x + rect.width && py <= rect.y + rect.height,
        inCell: (dp.px >> 3) === cx && (dp.py >> 3) === cy,
      };
    };
    /** Arm a tool BY ITS OWN dock button, then re-derive the aim, then assert
     *  the aim is still inside the cell it names before dispatching anything. */
    const armAndAim = async (selector, cx, cy, id, what) => {
      await clickSelector(selector);
      await sleep(300);
      const aim = await aimFor(cx, cy);
      const ok = !aim.error && aim.onScreen && aim.inCell;
      check(id, what, ok,
        aim.error ? aim.error
          : `aim INTEGER client (${aim.px},${aim.py}) -> doc pixel (${aim.dp.px},${aim.dp.py}) `
            + `in cell (${aim.dp.px >> 3},${aim.dp.py >> 3}), wanted cell (${cx},${cy}); `
            + `onScreen=${aim.onScreen}; rect=${JSON.stringify(aim.rect)}`);
      return ok ? aim : null;
    };
    const pencilStroke = async (cx, cy, id) => {
      const aim = await armAndAim('button[aria-label^="Pencil"]', cx, cy, id,
        `the Pencil is armed and its aim still lands in cell (${cx},${cy}) [precondition]`);
      if (!aim) throw new Error(`the pencil aim left cell (${cx},${cy}) — nothing below could be measured`);
      await strokeAt(aim.px, aim.py);
      return aim;
    };

    // Ctrl+Z, and the TWO redo gestures the app binds (LevelWorkspace's key
    // handler: Ctrl+Y, or Ctrl+Shift+Z). CDP modifier bits: Alt 1, Ctrl 2,
    // Meta 4, Shift 8.
    const ctrlZ = async () => { await key(c, 'z', 'KeyZ', 90, 2); await sleep(1200); await park(c); };
    const ctrlY = async () => { await key(c, 'y', 'KeyY', 89, 2); await sleep(1200); await park(c); };
    const ctrlShiftZ = async () => { await key(c, 'Z', 'KeyZ', 90, 10); await sleep(1200); await park(c); };

    // ══ SETUP A — the chunk document and the doc-local aim ══════════════════
    console.log('\n══ SETUP A — a chunk document with an EMPTY, on-screen cell ══');
    let CHUNK_TITLE = null, CHUNK_ID = null, chunkMeta = null;
    for (const title of cellTitles.slice(0, 12)) {
      const o = await openChunkByTitle(title, null);
      if (!o || o.chunkId === null) continue;
      const p = await planAim();
      if (p.error) { console.log(`        "${title}": ${p.error}; next chunk`); continue; }
      CHUNK_TITLE = title; CHUNK_ID = o.chunkId; plan = p;
      chunkMeta = await c.json(`window.__dbg.aeon.chunkInfo(${JSON.stringify(o.chunkId)})`);
      break;
    }
    check('A0', 'a CHUNK document with an EMPTY, on-screen cell is open [precondition]',
      CHUNK_TITLE !== null && plan !== null && !plan.error,
      JSON.stringify({ chunk: CHUNK_TITLE, id: CHUNK_ID, meta: chunkMeta }));
    if (CHUNK_TITLE === null) {
      fails.push('[A0] could not choose a doc-local aim');
      throw new Error('could not construct the setup: no chunk with an empty on-screen cell');
    }
    console.log(`        chunk under test: ${CHUNK_ID} "${CHUNK_TITLE}" ${JSON.stringify(chunkMeta)}`);
    console.log(`        dpr=${dpr}  canvas attr ${plan.size.w}x${plan.size.h}  `
      + `rect=${JSON.stringify(plan.rect)}  zoom=${plan.zoom}`);
    console.log(`        doc-local aim INTEGER client (${plan.px},${plan.py}) -> doc pixel `
      + `(${plan.dp.px},${plan.dp.py}) -> cell (${plan.cx},${plan.cy}) [EMPTY], `
      + `collision cell index ${plan.collIndex}`);
    note('A0b', 'the two further aims row X needs: a SECOND empty cell, and an ATLAS-BACKED one '
      + '(census path P3a from the same document)',
      `second empty cell: ${plan.empty2 ? `(${plan.empty2.cx},${plan.empty2.cy})` : 'NONE on screen'}; `
      + `atlas-backed cell: ${plan.atlas
        ? `(${plan.atlas.cx},${plan.atlas.cy}) atlasTile=${plan.atlas.atlasTile}`
        : 'NONE on screen'}`
      + `${plan.empty2 && plan.atlas ? '' : ' — row X will be SKIPPED and stays derived'}`);

    const startChips = await chips();
    check('A1', 'BOTH history chips are present, and both are DISABLED before anything is edited [precondition]',
      startChips.undo.present && startChips.redo.present
      && startChips.undo.disabled === true && startChips.redo.disabled === true,
      `Undo disabled=${startChips.undo.disabled}, Redo disabled=${startChips.redo.disabled}, `
      + `canUndo()=${await canUndo()}, canRedo()=${await canRedo()}, focusedDocId()=${await focused()}`);

    // ══ SETUP B — THREE zone-art edits, on ANOTHER document ═════════════════
    //
    // Three, not two: the fourth cell asks what a SECOND press does, and a stack
    // two deep cannot separate "the redo side has depth" from "the redo side has
    // exactly one entry". Three lets the run walk down and back up.
    console.log('\n══ SETUP B — THREE zone-art edits on a LIVE-TILE document ══');
    await c.evalExpr(`(() => {
      const g = [...document.querySelectorAll('canvas')].find(c => c.style.position === 'absolute'
        && c.style.imageRendering === 'pixelated' && c.style.width === '100%' && !c.style.cursor);
      if (g) g.scrollIntoView({ block: 'center' });
      return !!g;
    })()`);
    await sleep(600);
    const tsPoint = await c.json(`(() => {
      const all = [...document.querySelectorAll('canvas')];
      const grid = all.filter(c => c.style.position === 'absolute'
        && c.style.imageRendering === 'pixelated'
        && c.style.width === '100%' && !c.style.cursor);
      if (grid.length !== 1) return { ambiguous: grid.length, canvases: all.length };
      const r = grid[0].getBoundingClientRect();
      if (r.width < 32 || r.height < 32) return { tooSmall: r.toJSON() };
      if (r.top < 0 || r.bottom > window.innerHeight) return { offScreen: r.toJSON(), view: window.innerHeight };
      return { x: Math.round(r.left + 12), y: Math.round(r.top + 12), rect: r.toJSON() };
    })()`);
    check('Z0', 'the tileset panel grid canvas is uniquely identifiable AND on screen [precondition]',
      !!tsPoint && tsPoint.x !== undefined, JSON.stringify(tsPoint));
    if (!tsPoint || tsPoint.x === undefined) throw new Error('cannot reach the tileset panel');
    await pressAt(tsPoint, 2);
    await sleep(800);
    await answerDiscard('Z0b', 'answered the open guard while opening the live tile');
    await sleep(900);
    const liveOpen = await c.json(`(() => {
      const t = [...document.querySelectorAll('*')].map(e => e.textContent || '')
        .filter(s => /^tile #\\d+, used /.test(s.trim()));
      return { liveHeader: t.length > 0, sample: t[0] ? t[0].trim().slice(0, 60) : null };
    })()`);
    const liveInfo = await openInfo();
    const liveOk = liveOpen.liveHeader && !!liveInfo && liveInfo.chunkId === null && liveInfo.widthTiles === 1;
    check('Z1', 'a LIVE-TILE document is open (the tileset panel names the atlas tile) [precondition]',
      liveOk, JSON.stringify({ ...liveOpen, open: liveInfo }));
    if (!liveOk) throw new Error('could not construct the discriminating setup: '
      + 'the tileset double-click did not open a live-tile document, so a zone-art edit '
      + 'made on ANOTHER document could not be staged');

    await clickSelector('button[aria-label^="Pencil"]');
    await sleep(300);
    const liveInst = await c.json(PROBE);
    const liveRect = liveInst.installed ? await c.json('window.__au.rect()') : null;
    check('Z2', 'the live-tile composer canvas is measurable [precondition]', !!liveRect,
      JSON.stringify(liveInst));
    if (!liveRect) throw new Error('cannot measure the live-tile canvas');

    const zoneStroke = async (ox, oy) => {
      const ax = Math.round(liveRect.x) + ox, ay = Math.round(liveRect.y) + oy;
      const before = await zoneHash();
      await strokeAt(ax, ay);
      const after = await zoneHash();
      return { ax, ay, before, after, moved: after !== before };
    };
    const zoneEdits = [];
    for (const [ox, oy] of [[12, 12], [28, 12], [44, 12], [12, 28], [28, 28], [44, 28], [12, 44], [28, 44], [44, 44]]) {
      const s = await zoneStroke(ox, oy);
      console.log(`        [Z] stroke at INTEGER client (${s.ax},${s.ay}) — zoneArtHash `
        + `${s.before} -> ${s.after}${s.moved ? '' : '  (no change; next offset)'}`);
      if (s.moved) zoneEdits.push(s);
      if (zoneEdits.length === 3) break;
    }
    check('Z3', 'THREE real zone-art edits landed on the zone-art stack [precondition]',
      zoneEdits.length === 3 && (await canUndo()) === true,
      `${zoneEdits.length} edits, canUndo()=${await canUndo()}, focusedDocId()=${await focused()}`);
    if (zoneEdits.length !== 3) throw new Error('could not build the discriminating setup: fewer than three zone-art edits landed');
    const Z0v = zoneEdits[0].before;       // before any of them
    const Z1v = zoneEdits[0].after;        // after edit 1
    const Z2v = zoneEdits[1].after;        // after edit 2
    const Z3v = zoneEdits[2].after;        // after edit 3
    const LADDER = { start: Z0v, e1: Z1v, e2: Z2v, e3: Z3v };
    const nameOf = (h) => h === Z0v ? 'START (all three gone)' : h === Z1v ? 'after edit1 (two gone)'
      : h === Z2v ? 'after edit2 (one gone)' : h === Z3v ? 'after edit3 (INTACT)' : `an off-ladder value ${h}`;
    console.log(`        zone-art ladder: start ${Z0v} -> e1 ${Z1v} -> e2 ${Z2v} -> e3 ${Z3v}`);
    const distinct = new Set([Z0v, Z1v, Z2v, Z3v]).size === 4;
    check('Z4', 'the four ladder values are DISTINCT, so every rung below is identifiable [precondition]',
      distinct, JSON.stringify(LADDER));
    if (!distinct) throw new Error('ladder values collide — a rung could not be told from another');
    const zRedo = await chips();
    check('Z5', 'REDO is disabled after three fresh edits and no undo [precondition]',
      zRedo.redo.disabled === true && (await canRedo()) === false,
      `Redo chip disabled=${zRedo.redo.disabled}, canRedo()=${await canRedo()}`);

    // ══ back to the SAME chunk document ═════════════════════════════════════
    const reopened = await openChunkByTitle(CHUNK_TITLE, 'B0',
      `re-opened the SAME chunk from its library cell ("${CHUNK_TITLE}")`);
    check('B1', 'the SAME chunk document is open again [precondition]',
      !!reopened && reopened.chunkId === CHUNK_ID && reopened.dirty === false,
      JSON.stringify({ want: CHUNK_ID, got: reopened }));
    const zoneAfterReopen = await zoneHash();
    check('B2', 'closing the live-tile document did NOT revert the three zone-art edits [control]',
      zoneAfterReopen === Z3v, `zoneArtHash after re-opening the chunk: ${zoneAfterReopen} (${nameOf(zoneAfterReopen)})`);
    const cellNow = await cellAt(plan.cx, plan.cy);
    check('B3', 'the aimed cell is EMPTY again on the re-opened document [precondition]',
      !!cellNow && cellNow.atlasTile === null, JSON.stringify(cellNow));
    // Re-derive the GEOMETRY after the re-open; the CELL is not re-chosen.
    const instT = await c.json(PROBE);
    const rectT = instT.installed ? await c.json('window.__au.rect()') : null;
    const sameRect = !!rectT && Math.round(rectT.x) === Math.round(plan.rect.x)
      && Math.round(rectT.y) === Math.round(plan.rect.y)
      && Math.round(rectT.width) === Math.round(plan.rect.width);
    if (!sameRect && rectT) {
      const rederive = async (cx, cy) => {
        const px = Math.round(rectT.x + (cx * 8 + 4) * plan.zoom);
        const py = Math.round(rectT.y + (cy * 8 + 4) * plan.zoom);
        const dp = await c.json(`window.__au.docPixel(${px}, ${py}, ${plan.zoom})`);
        return { px, py, dp };
      };
      const e = await rederive(plan.cx, plan.cy);
      note('B4a', 'the canvas moved after the re-open; the aim was re-derived for the same doc cell',
        `was (${plan.px},${plan.py}) -> doc (${plan.dp.px},${plan.dp.py}); `
        + `now (${e.px},${e.py}) -> doc (${e.dp.px},${e.dp.py})`);
      plan = { ...plan, ...e };
      if (plan.atlas) plan.atlas = { ...plan.atlas, ...(await rederive(plan.atlas.cx, plan.atlas.cy)) };
    }
    const dpNow = await c.json(`window.__au.docPixel(${plan.px}, ${plan.py}, ${plan.zoom})`);
    check('B4', 'the aim still lands in the EMPTY cell it was chosen from [precondition]',
      dpNow.px === plan.dp.px && dpNow.py === plan.dp.py
      && (plan.dp.px >> 3) === plan.cx && (plan.dp.py >> 3) === plan.cy,
      `aim (${plan.px},${plan.py}) -> doc pixel (${dpNow.px},${dpNow.py}) in cell (${plan.cx},${plan.cy})`);

    // ══ ROW R — THE QUESTION ════════════════════════════════════════════════
    console.log('\n══ ROW R — a doc-local pencil stroke, Ctrl+Z, then REDO ══');
    const docPixel = () => c.evalExpr(`window.__dbg.aeon.artDocPixelAt(${plan.dp.px}, ${plan.dp.py})`);
    const rDoc0 = await docPixel();
    const rPix0 = await canvasHash();
    await pencilStroke(plan.cx, plan.cy, 'R0aim');
    const rDoc1 = await docPixel();
    const rPix1 = await canvasHash();
    const rZoneAfterStroke = await zoneHash();
    const rChips1 = await chips();
    console.log(`        [R] doc pixel (${plan.dp.px},${plan.dp.py}) ${rDoc0} -> ${rDoc1}   `
      + `canvas ${rPix0} -> ${rPix1}`);
    check('R0a', 'the pencil stroke LANDS on the chunk document [precondition]',
      rDoc0 !== null && rDoc1 !== null && rDoc0 !== rDoc1, `doc pixel ${rDoc0} -> ${rDoc1}`);
    check('R0b', 'the pencil stroke is DOC-LOCAL — it moved no zone art (not census P3a) [precondition]',
      rZoneAfterStroke === Z3v, `zoneArtHash ${Z3v} -> ${rZoneAfterStroke} (${nameOf(rZoneAfterStroke)})`);
    check('R0', 'REDO is still disabled after the doc-local gesture and before any undo',
      rChips1.redo.disabled === true && (await canRedo()) === false,
      `Redo chip disabled=${rChips1.redo.disabled}, canRedo()=${await canRedo()}, `
      + `Undo chip disabled=${rChips1.undo.disabled}, focusedDocId()=${await focused()}`);

    // ── the misfire, reproduced, so the redo rows have something to recover ──
    await ctrlZ();
    const rZoneAfterZ1 = await zoneHash();
    const rDoc2 = await docPixel();
    const rPix2 = await canvasHash();
    console.log(`        [R] Ctrl+Z #1 -> zoneArtHash ${rZoneAfterStroke} -> ${rZoneAfterZ1} `
      + `(${nameOf(rZoneAfterZ1)});  doc pixel ${rDoc1} -> ${rDoc2};  canvas ${rPix1} -> ${rPix2}`);
    const ate = rZoneAfterZ1 === Z2v;
    note('R1', 'the measured misfire, reproduced here so the recovery rows have a victim',
      ate ? `Ctrl+Z after a DOC-LOCAL stroke moved the zone art ${Z3v} -> ${rZoneAfterZ1}, which is `
        + 'the state BEFORE the third zone-art edit — the edit made on the OTHER document is gone'
        : `Ctrl+Z left the zone art at ${rZoneAfterZ1} (${nameOf(rZoneAfterZ1)}) — the misfire did NOT `
        + 'reproduce in this run, and every recovery row below is therefore vacuous');
    check('R1v', 'the misfire reproduced, so the recovery rows are not vacuous [precondition]',
      ate, `zoneArtHash after Ctrl+Z #1: ${rZoneAfterZ1} (${nameOf(rZoneAfterZ1)}), want ${Z2v}`);
    if (!ate) throw new Error('the misfire did not reproduce: there is no destroyed edit to try to recover');

    // ── CELL 2: is the Redo control enabled at that moment? ──────────────────
    const rChips2 = await chips();
    const rCanRedo2 = await canRedo();
    const rFocus2 = await focused();
    check('R2a', 'CELL 2 — the Redo CHIP is ENABLED at the moment the eaten edit could be recovered',
      rChips2.redo.disabled === false,
      `Redo chip disabled=${rChips2.redo.disabled} (false = the author is offered the control), `
      + `Undo chip disabled=${rChips2.undo.disabled}, focusedDocId()=${rFocus2}`);
    check('R2b', 'CELL 2 — the store agrees: focusedHistory().canRedo is true',
      rCanRedo2 === true, `canRedo()=${rCanRedo2}`);
    await shot(c, 'R-after-ctrl-z-redo-chip');

    // ── CELL 1: does Redo restore the eaten zone-art edit? ───────────────────
    await ctrlY();
    const rZoneAfterY1 = await zoneHash();
    const rDoc3 = await docPixel();
    const rPix3 = await canvasHash();
    console.log(`        [R] Ctrl+Y #1 -> zoneArtHash ${rZoneAfterZ1} -> ${rZoneAfterY1} `
      + `(${nameOf(rZoneAfterY1)});  doc pixel ${rDoc2} -> ${rDoc3};  canvas ${rPix2} -> ${rPix3}`);
    check('R3', 'CELL 1 — REDO RESTORES the zone-art edit the chunk document\'s Ctrl+Z destroyed',
      rZoneAfterY1 === Z3v,
      rZoneAfterY1 === Z3v
        ? `zoneArtHash is back at ${Z3v} — the eaten edit is RECOVERABLE by Ctrl+Y`
        : `zoneArtHash after Ctrl+Y: ${rZoneAfterY1} (${nameOf(rZoneAfterY1)}), want ${Z3v}`);

    // ── CELL 3: does Redo touch the author's own doc-local work? ─────────────
    check('R4', 'CELL 3 — Redo did NOT disturb the author\'s doc-local stroke',
      rDoc3 === rDoc1,
      `doc pixel: after the stroke ${rDoc1}, after Ctrl+Z ${rDoc2}, after Ctrl+Y ${rDoc3} `
      + `(canvas hash ${rPix1} -> ${rPix2} -> ${rPix3}; the canvas MOVES on both presses because this `
      + `chunk's atlas-backed cells are drawn from the zone tile being reverted and restored)`);
    note('R4b', 'the canvas hash across the whole press sequence, reported and asserted on NOTHING',
      `${rPix0} (before) -> ${rPix1} (stroke) -> ${rPix2} (Ctrl+Z) -> ${rPix3} (Ctrl+Y); `
      + `the Ctrl+Z and Ctrl+Y repaints are the zone tile, not the stroke`);

    // ── CELL 4: what a SECOND press does, on both sides ──────────────────────
    console.log('\n══ ROW R (depth) — three Ctrl+Z, then three Ctrl+Y ══');
    const downLadder = [];
    for (let i = 1; i <= 3; i++) {
      await ctrlZ();
      const h = await zoneHash();
      downLadder.push(h);
      console.log(`        [R] Ctrl+Z #${i + 1} -> ${h} (${nameOf(h)})   canRedo()=${await canRedo()}`);
    }
    check('R5', 'the undo side has DEPTH: three presses walk the zone art down all three rungs',
      downLadder[0] === Z2v && downLadder[1] === Z1v && downLadder[2] === Z0v,
      `${downLadder.map((h) => `${h} (${nameOf(h)})`).join(' -> ')}`);
    const chipsBottom = await chips();
    check('R6', 'at the bottom the Undo chip is DISABLED and the Redo chip is ENABLED',
      chipsBottom.undo.disabled === true && chipsBottom.redo.disabled === false,
      `Undo disabled=${chipsBottom.undo.disabled}, Redo disabled=${chipsBottom.redo.disabled}, `
      + `canUndo()=${await canUndo()}, canRedo()=${await canRedo()}`);
    const upLadder = [];
    for (let i = 1; i <= 3; i++) {
      await ctrlY();
      const h = await zoneHash();
      upLadder.push(h);
      console.log(`        [R] Ctrl+Y #${i + 1} -> ${h} (${nameOf(h)})   canRedo()=${await canRedo()}`);
    }
    check('R7', 'CELL 4 — the SECOND and THIRD Redo presses each restore one more rung',
      upLadder[0] === Z1v && upLadder[1] === Z2v && upLadder[2] === Z3v,
      `${upLadder.map((h) => `${h} (${nameOf(h)})`).join(' -> ')}`);
    const rDocTop = await docPixel();
    check('R8', 'after the whole round trip the zone art is INTACT and so is the doc-local stroke',
      upLadder[2] === Z3v && rDocTop === rDoc1,
      `zoneArtHash ${upLadder[2]} (${nameOf(upLadder[2])}); doc pixel ${rDocTop}, the stroke left ${rDoc1}`);
    const chipsTop = await chips();
    check('R9', 'at the top the Redo chip is DISABLED again (the redo side is exhausted)',
      chipsTop.redo.disabled === true && (await canRedo()) === false,
      `Redo disabled=${chipsTop.redo.disabled}, canRedo()=${await canRedo()}`);
    // The OTHER binding the app offers for the same action. One press each way,
    // so a reader who only knows Ctrl+Shift+Z is not left with a derived answer.
    await ctrlZ();
    const shiftDown = await zoneHash();
    await ctrlShiftZ();
    const shiftUp = await zoneHash();
    console.log(`        [R] Ctrl+Z -> ${shiftDown} (${nameOf(shiftDown)});  `
      + `Ctrl+Shift+Z -> ${shiftUp} (${nameOf(shiftUp)})`);
    check('R10', 'Ctrl+Shift+Z recovers the eaten edit exactly as Ctrl+Y does',
      shiftDown === Z2v && shiftUp === Z3v,
      `Ctrl+Z put the zone art at ${shiftDown} (${nameOf(shiftDown)}); `
      + `Ctrl+Shift+Z put it at ${shiftUp} (${nameOf(shiftUp)})`);
    await shot(c, 'R-after-round-trip');

    // ══ ROW S — TILE STAMP, the one derived gesture driven here ═════════════
    //
    // Chosen because a chunk IS a nametable of atlas tiles: stamping a tile into
    // a cell is the primary authoring gesture on a chunk document, so of the six
    // still-derived gestures it is the one most likely to be performed on one.
    // Paste / cut / selection move / the seven transforms / palette-apply stay
    // DERIVED and the packet says so rather than inferring from this row.
    console.log('\n══ ROW S — TILE STAMP on the chunk document ══');
    const sZone0 = await zoneHash();
    const sCell0 = await cellAt(plan.cx, plan.cy);
    const sAim = await armAndAim('button[aria-label="Tile stamp"]', plan.cx, plan.cy, 'S0aim',
      `the Tile stamp\'s aim still lands in cell (${plan.cx},${plan.cy}) after the rail scrolled to it `
      + '[precondition]');
    const sTool = (await openInfo())?.tool;
    check('S0', 'the Tile stamp tool is armed [precondition]', sTool === 'tile-stamp',
      `artChunkOpen().tool = ${sTool}`);
    if (!sAim) throw new Error('the tile stamp aim left its cell — the row below would measure a no-op');
    await strokeAt(sAim.px, sAim.py);
    const sCell1 = await cellAt(plan.cx, plan.cy);
    const sZone1 = await zoneHash();
    const sChips1 = await chips();
    console.log(`        [S] cell (${plan.cx},${plan.cy}) ${JSON.stringify(sCell0)} -> ${JSON.stringify(sCell1)}`);
    console.log(`        [S] zoneArtHash ${sZone0} -> ${sZone1} (${nameOf(sZone1)})`);
    check('S1', 'the tile stamp LANDS on the chunk document [precondition]',
      !!sCell0 && !!sCell1 && JSON.stringify(sCell0) !== JSON.stringify(sCell1)
      && sCell1.atlasTile !== null,
      `cell (${plan.cx},${plan.cy}) ${JSON.stringify(sCell0)} -> ${JSON.stringify(sCell1)} `
      + '(the whole nametable entry, not just atlasTile — `stampTile` REPLACES the cell object, and '
      + '`applyTileCell` early-returns on a stamp that would change nothing)');
    check('S2', 'the tile stamp is DOC-LOCAL — it moved no zone art [precondition]',
      sZone1 === sZone0, `zoneArtHash ${sZone0} -> ${sZone1}`);
    note('S2b', 'the Undo control at the moment of the tile stamp',
      `Undo chip disabled=${sChips1.undo.disabled}, canUndo()=${await canUndo()}, `
      + `Redo chip disabled=${sChips1.redo.disabled}, focusedDocId()=${await focused()}`);
    await ctrlZ();
    const sCell2 = await cellAt(plan.cx, plan.cy);
    const sZone2 = await zoneHash();
    console.log(`        [S] Ctrl+Z -> cell ${JSON.stringify(sCell2)}   `
      + `zoneArtHash ${sZone1} -> ${sZone2} (${nameOf(sZone2)})`);
    // RED BY DESIGN while the measured defect stands — the twin of the previous
    // packet's T2, for a third gesture.
    check('S3', 'THE FINDING, third gesture: Ctrl+Z after a DOC-LOCAL TILE STAMP leaves '
      + 'the zone-art edits alone',
      sZone2 === sZone1,
      sZone2 === sZone1 ? `zone art unchanged at ${sZone2}`
        : `zoneArtHash went ${sZone1} -> ${sZone2}, which is ${nameOf(sZone2)}`);
    check('S3b', 'the tile stamp itself is NOT taken back by that Ctrl+Z',
      !!sCell2 && sCell2.atlasTile === sCell1.atlasTile,
      `atlasTile after Ctrl+Z: ${sCell2?.atlasTile}, after the stamp: ${sCell1?.atlasTile}`);
    await ctrlY();
    const sZone3 = await zoneHash();
    const sCell3 = await cellAt(plan.cx, plan.cy);
    console.log(`        [S] Ctrl+Y -> zoneArtHash ${sZone2} -> ${sZone3} (${nameOf(sZone3)})   `
      + `cell ${JSON.stringify(sCell3)}`);
    check('S4', 'the edit the TILE STAMP\'s Ctrl+Z ate is recoverable by Redo too',
      sZone3 === sZone1, `zoneArtHash after Ctrl+Y: ${sZone3} (${nameOf(sZone3)}), want ${sZone1}`);
    await shot(c, 'S-tile-stamp-after-redo');

    // ══ ROW X — DOES THE AUTHOR'S NEXT REAL EDIT TRUNCATE THE RESCUE? ═══════
    //
    // Runs LAST because it deliberately destroys the redo side.
    console.log('\n══ ROW X — a real zone-art command AFTER the misfire ══');
    if (!plan.atlas || !plan.empty2) {
      note('X0', 'SKIPPED and still DERIVED: this chunk did not offer both a SECOND empty on-screen cell '
        + 'and an ATLAS-BACKED one, so a doc-local gesture row S has not touched and a census-P3a command '
        + 'could not both be made from this document',
        JSON.stringify({ chunk: CHUNK_TITLE, empty2: plan.empty2 ?? null, atlas: plan.atlas ?? null }));
    } else {
      const xZone0 = await zoneHash();
      const xDocAt = () => c.evalExpr('window.__dbg.aeon.artDocPixelAt('
        + `${plan.empty2.cx * 8 + 4}, ${plan.empty2.cy * 8 + 4})`);
      const xDoc0 = await xDocAt();
      // A SECOND empty cell: row S's stamp made the first one atlas-backed, and
      // a pencil stroke there would be census P3a rather than the doc-local
      // gesture this row needs.
      await pencilStroke(plan.empty2.cx, plan.empty2.cy, 'X0aim');
      const xZoneStroke = await zoneHash();
      const xDoc1 = await xDocAt();
      check('X0', 'a fresh stroke LANDED on the document and moved no zone art [precondition]',
        xZoneStroke === xZone0 && xDoc0 !== null && xDoc1 !== null && xDoc0 !== xDoc1,
        `zoneArtHash ${xZone0} -> ${xZoneStroke}; doc pixel `
        + `(${plan.empty2.cx * 8 + 4},${plan.empty2.cy * 8 + 4}) ${xDoc0} -> ${xDoc1}`);
      await ctrlZ();
      const xZoneZ = await zoneHash();
      const xAte = xZoneZ !== xZoneStroke;
      check('X1', 'the misfire ate an edit again, so there is something to lose [precondition]',
        xAte, `zoneArtHash ${xZoneStroke} -> ${xZoneZ} (${nameOf(xZoneZ)})`);
      const xChips = await chips();
      note('X1b', 'Redo is offered at this instant',
        `Redo chip disabled=${xChips.redo.disabled}, canRedo()=${await canRedo()}`);
      // Now the author keeps working — and their next stroke is a REAL zone-art
      // command, because it lands on an ATLAS-BACKED cell (census path P3a).
      await pencilStroke(plan.atlas.cx, plan.atlas.cy, 'X2aim');
      const xZoneP3a = await zoneHash();
      check('X2', 'the stroke on the ATLAS-BACKED cell IS a real zone-art command [precondition]',
        xZoneP3a !== xZoneZ,
        `zoneArtHash ${xZoneZ} -> ${xZoneP3a} at cell (${plan.atlas.cx},${plan.atlas.cy}), `
        + `atlasTile ${plan.atlas.atlasTile}`);
      const xChips2 = await chips();
      const xCanRedo = await canRedo();
      await ctrlY();
      const xZoneY = await zoneHash();
      console.log(`        [X] after the new command, Redo chip disabled=${xChips2.redo.disabled}, `
        + `canRedo()=${xCanRedo};  Ctrl+Y -> ${xZoneY}`);
      check('X3', 'the eaten edit is STILL recoverable after the author makes another real edit',
        xCanRedo === true && xChips2.redo.disabled === false && xZoneY !== xZoneP3a,
        xCanRedo
          ? `Redo still offered; Ctrl+Y moved the zone art ${xZoneP3a} -> ${xZoneY}`
          : `THE REDO SIDE WAS TRUNCATED by the new command: Redo chip disabled=${xChips2.redo.disabled}, `
            + `canRedo()=${xCanRedo}, and Ctrl+Y left the zone art at ${xZoneY}. The edit the misfire ate `
            + `is now UNRECOVERABLE.`);
      await shot(c, 'X-after-truncation');
    }

    console.log('\n══ SUMMARY ═════════════════════════════════════════════════');
    console.log(`  chunk ${CHUNK_ID} (${chunkMeta?.name}), empty-cell aim (${plan.cx},${plan.cy}) `
      + `at integer client (${plan.px},${plan.py}), dpr=${dpr}`);
    console.log(`  zone-art ladder  start=${Z0v}  e1=${Z1v}  e2=${Z2v}  e3=${Z3v}`);
    console.log(`  CELL 1  Redo after the misfire: zone ${rZoneAfterZ1} -> ${rZoneAfterY1} `
      + `(want ${Z3v}) — ${rZoneAfterY1 === Z3v ? 'RESTORED' : 'NOT RESTORED'}`);
    console.log(`  CELL 2  Redo chip disabled=${rChips2.redo.disabled}, canRedo()=${rCanRedo2} `
      + `at that instant`);
    console.log(`  CELL 3  doc-local stroke across the presses: ${rDoc1} -> ${rDoc2} -> ${rDoc3} `
      + `(${rDoc3 === rDoc1 ? 'untouched by Redo' : 'CHANGED by Redo'})`);
    console.log(`  CELL 4  three Ctrl+Z ${downLadder.join(' -> ')} ; three Ctrl+Y ${upLadder.join(' -> ')}`);
    writeFileSync(`${SHOTS}/rows.json`, JSON.stringify({
      dpr, chunkId: CHUNK_ID, chunkMeta,
      plan: { ...plan, view: undefined },
      ladder: LADDER,
      redo: {
        zoneAfterStroke: rZoneAfterStroke, zoneAfterUndo1: rZoneAfterZ1, zoneAfterRedo1: rZoneAfterY1,
        chipDisabledAtUndo: rChips2.redo.disabled, canRedoAtUndo: rCanRedo2,
        docPixel: [rDoc0, rDoc1, rDoc2, rDoc3], canvas: [rPix0, rPix1, rPix2, rPix3],
        downLadder, upLadder, shiftDown, shiftUp,
      },
      results,
    }, null, 2));
    const passes = results.filter((r) => r.ok === true).length;
    const failed = results.filter((r) => r.ok === false).length;
    const notes = results.filter((r) => r.ok === null).length;
    console.log(`\n  ${passes} pass, ${failed} fail, ${notes} note — ${results.length} rows total`);
    if (fails.length) console.log(`  FAILING: ${fails.join(', ')}`);
    const byDesign = ['S3', 'X3'].filter((id) => results.some((r) => r.id === id && r.ok === false));
    if (byDesign.length) {
      console.log(`  ⚠ EXITS 1 BY DESIGN — ${byDesign.join(', ')} ${byDesign.length > 1 ? 'ARE' : 'IS'} `
        + 'THE FINDING, not a broken instrument. S3: a doc-local TILE STAMP on a CHUNK document leaves '
        + 'Ctrl+Z pointed at the zone-art stack, the third gesture measured to do so. X3: the rescue '
        + 'Redo offers is TRUNCATED by the author\'s next real zone-art command, after which the eaten '
        + 'edit is gone for good. Lens row ART-UNDO-CHUNK-SPLIT; see '
        + 'docs/reviews/2026-09-09-chunk-undo-redo.md. Each goes GREEN by itself the day it is fixed.');
    }
    const recovery = ['R3', 'R7', 'R8', 'S4'].filter((id) => results.some((r) => r.id === id && r.ok === false));
    console.log(recovery.length
      ? `  ⚠ THE IMMEDIATE RESCUE IS BROKEN TOO — ${recovery.join(', ')} failed: pressing Redo straight `
        + 'after the misfire does NOT bring the destroyed edit back.'
      : '  THE IMMEDIATE RESCUE WORKS — pressed straight after the misfire, Redo DOES restore the '
        + 'destroyed zone-art edit, on both bindings and to full stack depth, without touching the '
        + 'author\'s own doc-local work. That LOWERS the severity of the measured misfire. What it does '
        + 'not lower is row X: the rescue survives only until the author\'s next real zone-art command.');
    console.log('HARNESS-END-MARKER');
  } finally {
    if (c) c.close();
    await killTree(child);
  }
}

await main();
process.exit(fails.length ? 1 : 0);
