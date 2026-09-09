#!/usr/bin/env node
// DOES Ctrl+Z ON A CHUNK DOCUMENT TAKE BACK SOMEBODY ELSE'S EDIT?
//
// `docs/reviews/2026-09-09-art-undo-fix.md` §6.4 and lens row
// ART-UNDO-CHUNK-SPLIT both carry the same claim, DERIVED FROM SOURCE AND NEVER
// DRIVEN:
//
//     on a chunk document, a doc-local-only gesture followed by Ctrl+Z reaches
//     the ZONE-ART stack and takes back some other edit — one the author made
//     earlier, elsewhere, and believed was safe.
//
// A missing undo costs work not yet done. A WRONG undo destroys work already
// done, silently. So this harness exists to turn that sentence into a number in
// one direction or the other, and it must not prefer either: if the zone-art
// edit survives, the standing warning on Ctrl+Z is wrong and should be lifted.
//
// ⚠ THE DEFECT IS INVISIBLE WITH AN EMPTY ZONE-ART STACK. With nothing on it,
// Ctrl+Z after a doc-local gesture does nothing at all and reads as "undo is
// merely missing here" — exactly how UX seat B reported it, and exactly what the
// census and the fix packet both measured. The discriminating setup is a
// ZONE-ART EDIT FIRST, then the doc-local gesture on the chunk document, then
// Ctrl+Z.
//
// THE CONTROL VARIES ONE FIELD, not a subject. Rows C and T are the SAME chunk
// document, opened from the SAME library cell, the SAME two gestures at the SAME
// derived cell coordinates, in the SAME app session. The one difference is
// whether row Z has run in between — i.e. whether the zone-art stack has
// anything on it.
//
//   C   CONTROL   chunk doc, EMPTY zone-art stack: pencil on an empty cell, then
//                 collision paint. Ctrl+Z after each.
//   Z   SETUP     two pencil strokes on a LIVE-TILE document — two
//                 `set-tileset-tiles` commands, two entries on the zone-art
//                 stack. Witnessed by `zoneArtHash()`, which reads the zone's
//                 tileset bytes and NOT any canvas, so it can be sampled while
//                 the composer is showing some other document.
//   T   TREATMENT the same chunk document and the same two gestures with those
//                 two entries on the stack.
//
// ⚠ ROW C's C3 IS THE ANTI-VACUOUS CONTROL THE WHOLE THING RESTS ON. A pencil
// stroke on a chunk document is doc-local ONLY on a cell whose `atlasTile` is
// null; on an atlas-backed cell the same stroke IS a zone-art command (census
// path P3a) and would push its own entry, so a Ctrl+Z taking it back would look
// identical to the defect while being correct behaviour. The aim is therefore
// chosen from `artDocCellAt`, C0/T0c ASSERT the cell is empty, and C3/T2b say
// what the stroke on it did to the zone art.
//
// ══ WHAT THE OWNER'S RULING CHANGED, AND WHICH ROWS MOVED WITH IT ═══════════
//
// d-37 `route_onto_zone_stack` landed (docs/reviews/2026-09-09-chunk-undo-
// routing.md). Every gesture on a chunk document now records a `set-chunk` on
// the SAME `zoneart:<zone>` history the atlas-backed pencil already used, so:
//
//   • T2 and T5 — THE FINDING — go green with their assertions UNCHANGED. The
//     earlier zone-art edits survive the Ctrl+Z, which is what they always
//     asserted.
//   • SEVEN rows asserted the OLD behaviour and had to be re-aimed at the new
//     one. Each is now a STRONGER claim than the one it replaces, and each is
//     named here so a reader can see exactly what was changed and why:
//
//       C3, T2b  said "the stroke moved no zone art". A chunk in the library is
//                a nametable of atlas tiles and nothing else, so painting an
//                EMPTY cell has to materialise the painted tile into the zone
//                tileset — the same `sliceForSave` Save has always run, moved to
//                gesture time. They now assert the witness moved to a value that
//                is NONE of the ladder rungs, which is what "this is the
//                author's own new art, not somebody else's edit" looks like.
//       C5, C9,  said the author's own gesture was NOT taken back by Ctrl+Z.
//       T3, T6   That was the defect stated from the other side. They now assert
//                it IS taken back — the whole point of the ruling.
//       C6       said the Undo control stayed DISABLED through a doc-local
//                gesture on an empty stack. It now asserts the opposite: the
//                gesture ENABLES it, because it put a step on the stack.
//
//   • THE ONE-FIELD CONTROL IS UNTOUCHED and now pays off in the other
//     direction: C and T are still the same document, cell, aim and session
//     differing only in whether row Z ran, and after the fix they behave
//     IDENTICALLY. Before it, the same two gestures destroyed two zone-art
//     edits in T and looked inert in C.
//
// ⚠ dpr varies run to run on this box (seen at 1 and 1.35). Every aim below is
// an INTEGER client pixel; the doc pixel it lands on is derived from that
// integer through PixelViewport's own `floor((client - rect.left) / zoom)` with
// `zoom` recovered from the element, and printed, and the cell it lands in is
// asserted to be the cell that was aimed at.
//
// ⚠ IT WAS RED BY DESIGN AND IS NOT ANY MORE. Rows T2/T5 assert that the
// earlier zone-art edit SURVIVED the Ctrl+Z. They failed from 2026-09-09 until
// the routing fix landed the same day, which is what named the defect; they pass
// now, with the same assertions. THIS HARNESS EXITS 0 WHEN THE ROUTING IS
// CORRECT — a non-zero exit here is a REGRESSION, not a finding.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:chunk-undo-measure

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9419);
const ROOT = AURORA_DIR;
const AEON = siblingPathOrUnresolved('aeon');
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const SHOTS = `${ROOT}/scratchpad/shots-chunk-undo-measure`;
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CDP plumbing (same shape as art-undo-path-harness.mjs) ───────────────────
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
  console.log(`        shot -> scratchpad/shots-chunk-undo-measure/${name}.png`);
}

// ── FIXTURE: a hardlinked copy; the live aeon tree is never opened ───────────
function hardlinkCopy(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync('cp', ['-al', AEON, dest]);
  return dest;
}

// ── THE PAGE-SIDE PROBE ─────────────────────────────────────────────────────
// The composer canvas is the ONE canvas PixelViewport renders with inline
// `cursor: crosshair` + `imageRendering: pixelated`. REFUSES rather than picking
// the first when that names more than one — "which canvas did you hash" is
// exactly what a wrong answer here would hide.
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

const UNDO_CHIP = String.raw`
(() => {
  const b = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Undo');
  return b ? { present: true, disabled: !!b.disabled } : { present: false, disabled: null };
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
/** Park the pointer well off the canvas so the hover overlay is cleared before
 *  every hash — otherwise a hash difference could be a cursor, not a stroke. */
async function park(c) { await mouse(c, 'mouseMoved', 4, 4); await sleep(150); }

async function main() {
  console.log(`AEON (read-only source of the fixture): ${AEON}`);
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);

  const FIXTURE = join(ROOT, 'scratchpad/fixtures/aeon-chunk-undo');
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
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ── open the fixture through the debug door (never Open Project…) ────────
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
    const chip = () => c.json(UNDO_CHIP);
    const openInfo = () => c.json('window.__dbg.aeon.artChunkOpen()');
    const collAt = (i) => c.evalExpr(`window.__dbg.aeon.artDocCollisionAt('a', ${i})`);
    const canvasHash = async () => {
      const inst = await c.json(PROBE);
      if (!inst.installed) return null;
      return c.evalExpr('window.__au.hash()');
    };
    /** THE DOC-LOCAL WITNESS. `artDocPixelAt` reads the composer document's own
     *  pixel; the canvas hash cannot serve, because a chunk document's
     *  atlas-backed cells are drawn from the ZONE TILESET, so an undo that
     *  reverts a zone-art edit repaints the canvas without touching the
     *  document. The first run of this harness read the hash and got a THIRD
     *  value after Ctrl+Z — neither "restored" nor "kept" — which is that
     *  repaint, not the stroke. */
    const docPixel = () => plan
      ? c.evalExpr(`window.__dbg.aeon.artDocPixelAt(${plan.dp.px}, ${plan.dp.py})`)
      : Promise.resolve(null);

    // ── click helpers ───────────────────────────────────────────────────────
    const pressAt = async (p, clicks = 1) => {
      await mouse(c, 'mouseMoved', p.x, p.y);
      for (let i = 1; i <= clicks; i++) {
        await mouse(c, 'mousePressed', p.x, p.y, i);
        await mouse(c, 'mouseReleased', p.x, p.y, i);
        if (i < clicks) await sleep(90);
      }
    };
    const locateText = (text) => c.json(`(() => {
      const b = [...document.querySelectorAll('button')].find(b => b.innerText.replace(/\\s+/g,' ').trim().startsWith(${JSON.stringify(text)}));
      if (!b) return null;
      b.scrollIntoView({block:'center'});
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
               label: b.innerText.replace(/\\s+/g,' ').trim() };
    })()`);
    const clickText = async (text) => {
      const p = await locateText(text);
      if (!p) return null;
      await pressAt(p); await sleep(900);
      return p;
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
    /** Answer the app's own unsaved-work dialog if it is up. Not decoration: a
     *  dirty chunk document raises it on every open, and without this arm every
     *  row after the first would fail for the wrong reason. */
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
      note(id, what, asked.dialog ? `the unsaved-work dialog was up; pressed "${asked.label}"`
        : 'no dialog — the document was clean');
      return asked.dialog;
    };

    // ══ PICK THE CHUNK, AND OPEN IT FROM ITS LIBRARY CELL ═══════════════════
    //
    // A chunk document is reached by DOUBLE-CLICKING its cell in the Chunk
    // Library panel (`ChunkGrid`'s `onDoubleClick` → `openChunkInComposer`).
    // Located by the cell's `title`, which is the chunk's own name — and the
    // library cells are the only `button[title]` on screen that contain a
    // <canvas>, so the filter names them and nothing else.
    //
    // The SAME door is used to re-open the chunk between rows C and T. That is
    // not a convenience: a doc-local gesture is not undoable, so re-opening
    // from the library is the ONLY way to put the document back in the state
    // row C found it in, and rows C and T must start from the same state or the
    // "one field apart" claim is false.
    const cellTitles = await c.json(`(() => [...document.querySelectorAll('button[title]')]
      .filter(b => b.querySelector('canvas'))
      .filter(b => { const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8; })
      .map(b => b.getAttribute('title')))()`);
    check('0e', 'the Chunk Library panel is on screen with cells to open [precondition]',
      Array.isArray(cellTitles) && cellTitles.length > 0, `${cellTitles?.length ?? 0} chunk cells`);
    if (!cellTitles || !cellTitles.length) throw new Error('no chunk library cells on screen');

    /** Open one chunk from its library cell (a real double-click on the real
     *  grid), answering the app's own open guard. Returns what is open. */
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
      await answerDiscard(`${id}x`, 'answered the open guard while opening the chunk');
      await sleep(1000);
      const o = await openInfo();
      if (id) note(id, what ?? `opened the chunk by double-clicking "${cell.title}"`, JSON.stringify(o));
      return o;
    };

    // ── the two gestures, as functions, so C and T run IDENTICAL code ────────
    //
    // `plan` is computed once (from row C's document) and REUSED by row T, so
    // the two rows aim at the same cell and the same integer client pixel. If
    // they were each free to choose, a difference between the rows could be a
    // difference of aim.
    let plan = null;

    /** Choose an EMPTY (atlasTile === null) cell of the open chunk document that
     *  is on screen, and the integer client pixel that lands in it. Empty is the
     *  whole point: a stroke on an atlas-backed cell is a zone-art command
     *  (census P3a) and would be undoable for a legitimate reason. */
    const planAim = async () => {
      const inst = await c.json(PROBE);
      if (!inst.installed) return { error: 'the pixel canvas is not uniquely identifiable' };
      const rect = await c.json('window.__au.rect()');
      const size = await c.json('window.__au.size()');
      const o = await openInfo();
      const zoom = size.w / (o.widthTiles * 8);
      const view = await c.json('({ w: window.innerWidth, h: window.innerHeight })');
      for (let cy = 0; cy < o.heightTiles; cy++) {
        for (let cx = 0; cx < o.widthTiles; cx++) {
          const px = Math.round(rect.x + (cx * 8 + 4) * zoom);
          const py = Math.round(rect.y + (cy * 8 + 4) * zoom);
          if (px < 4 || py < 4 || px > view.w - 4 || py > view.h - 4) continue;
          if (px < rect.x || py < rect.y || px > rect.x + rect.width || py > rect.y + rect.height) continue;
          const cell = await c.json(`window.__dbg.aeon.artDocCellAt(${cx}, ${cy})`);
          if (!cell || cell.atlasTile !== null) continue;
          const dp = await c.json(`window.__au.docPixel(${px}, ${py}, ${zoom})`);
          if ((dp.px >> 3) !== cx || (dp.py >> 3) !== cy) continue;   // the aim must land in the cell aimed at
          // The collision plane is stored per 16px CELL: (w>>1) columns.
          const collIndex = (cy >> 1) * (o.widthTiles >> 1) + (cx >> 1);
          return { cx, cy, px, py, dp, zoom, rect, size, collIndex,
                   widthTiles: o.widthTiles, heightTiles: o.heightTiles, view };
        }
      }
      return { error: 'no EMPTY, on-screen cell in this chunk document' };
    };

    const pencilStroke = async () => {
      await clickSelector('button[aria-label^="Pencil"]');
      await sleep(300);
      await mouse(c, 'mouseMoved', plan.px, plan.py);
      await mouse(c, 'mousePressed', plan.px, plan.py);
      await sleep(60);
      await mouse(c, 'mouseReleased', plan.px, plan.py);
      await sleep(700);
      await park(c);
    };
    const collisionStroke = async () => {
      await clickSelector('button[aria-label="Collision paint"]');
      await sleep(300);
      // A real (non-air) shape. `selectedCollisionProfile` defaults to 0 and
      // shape 0 maps to AIR_CELL, so the default brush paints air onto cells
      // that may already be air and `paintDocCollision` correctly refuses it —
      // which reads exactly like "the tile-space writer does nothing".
      await c.json(`window.__dbg.aeon.armCollisionBrush({ plane: 'a', shape: 1, solidity: 'all' })`);
      await sleep(200);
      await mouse(c, 'mouseMoved', plan.px, plan.py);
      await mouse(c, 'mousePressed', plan.px, plan.py);
      await sleep(60);
      await mouse(c, 'mouseReleased', plan.px, plan.py);
      await sleep(700);
      await park(c);
    };

    const ctrlZ = async () => { await key(c, 'z', 'KeyZ', 90, 2); await sleep(1200); await park(c); };

    // ══ ROW C — CONTROL: the same gestures with an EMPTY zone-art stack ══════
    console.log('\n══ ROW C — CONTROL: chunk document, NOTHING on the zone-art stack ══');
    // Walk the library until a chunk yields an EMPTY, on-screen cell, rather
    // than assuming the first one does. A chunk with no empty cell has no
    // doc-local pencil gesture at all, and picking it would produce a P3a
    // stroke (a real zone-art command) dressed as the case under test.
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
    check('C0', 'a CHUNK document with an EMPTY, on-screen cell is open [precondition]',
      CHUNK_TITLE !== null && plan !== null && !plan.error,
      JSON.stringify({ chunk: CHUNK_TITLE, id: CHUNK_ID, meta: chunkMeta }));
    if (CHUNK_TITLE === null) {
      fails.push('[C0] could not choose a doc-local aim');
      throw new Error('could not construct the setup: no chunk with an empty on-screen cell');
    }
    const reopenChunk = (id) => openChunkByTitle(CHUNK_TITLE, id,
      `re-opened the SAME chunk from its library cell ("${CHUNK_TITLE}")`);
    console.log(`        chunk under test: ${CHUNK_ID} "${CHUNK_TITLE}" ${JSON.stringify(chunkMeta)}`);
    console.log(`        dpr=${dpr}  canvas attr ${plan.size.w}x${plan.size.h}  `
      + `rect=${JSON.stringify(plan.rect)}  zoom=${plan.zoom}`);
    console.log(`        aim INTEGER client (${plan.px},${plan.py}) -> doc pixel `
      + `(${plan.dp.px},${plan.dp.py}) -> cell (${plan.cx},${plan.cy}) [EMPTY], `
      + `collision cell index ${plan.collIndex}`);

    const cFocus0 = await focused();
    const cCan0 = await canUndo();
    const cChip0 = await chip();
    const cZone0 = await zoneHash();
    check('C1', 'the zone-art stack is EMPTY at the start of the control [precondition]',
      cCan0 === false && cChip0.disabled === true,
      `canUndo()=${cCan0}, Undo chip disabled=${cChip0.disabled}, focusedDocId()=${cFocus0}`);

    // C-pencil
    const cPixA = await canvasHash();
    const cDocA = await docPixel();
    await pencilStroke();
    const cPixB = await canvasHash();
    const cDocB = await docPixel();
    const cZone1 = await zoneHash();
    // ⚠ READ BEFORE THE Ctrl+Z, not after it. These two say what the STROKE did;
    // sampled after the press they say what the UNDO did, which is C4/C5's
    // question and reads as "the stroke changed nothing".
    const cCellAfter = await c.json(`window.__dbg.aeon.artDocCellAt(${plan.cx}, ${plan.cy})`);
    const cTilesAfter = await c.evalExpr('window.__dbg.aeon.zoneTileCount()');
    const cCan1 = await canUndo();
    const cChip1 = await chip();
    const cFocus1 = await focused();
    await ctrlZ();
    const cPixC = await canvasHash();
    const cDocC = await docPixel();
    const cZone2 = await zoneHash();
    console.log(`        [C pencil] canvas ${cPixA} -> ${cPixB} -> ${cPixC}`);
    console.log(`        [C pencil] doc pixel (${plan.dp.px},${plan.dp.py}) `
      + `${cDocA} -> ${cDocB} -> ${cDocC}`);
    console.log(`        [C pencil] zoneArtHash ${cZone0} -> ${cZone1} -> ${cZone2}   `
      + `canUndo ${cCan0}->${cCan1}   chip disabled ${cChip0.disabled}->${cChip1.disabled}`);
    check('C2', 'the pencil stroke LANDS on the chunk document [precondition]',
      cDocA !== null && cDocB !== null && cDocA !== cDocB
      && cPixA !== null && cPixB !== null && cPixA !== cPixB,
      `doc pixel ${cDocA} -> ${cDocB}; canvas ${cPixA} -> ${cPixB}`);
    // ⚠ RE-AIMED BY THE ROUTING FIX (d-37), and the header says why: the cell
    // aimed at is EMPTY, so the stroke has no atlas tile to paint into and the
    // fix MATERIALISES one — the same `sliceForSave` Save has always run, moved
    // to gesture time. The row still discriminates census path P3a from P3b: on
    // an atlas-backed cell the witness would move to an EDIT of an existing
    // tile, here it moves because a tile was APPENDED, and C3b reads the cell to
    // say which happened rather than inferring it from a hash.
    check('C3', 'the stroke on the EMPTY cell MATERIALISES its tile into the zone tileset '
      + '(owner ruling d-37 — a chunk in the library is a nametable of atlas tiles)',
      cZone1 !== cZone0 && cTilesAfter === zoneTiles + 1,
      `zoneArtHash ${cZone0} -> ${cZone1}; zoneTileCount ${zoneTiles} -> ${cTilesAfter}`);
    check('C3b', 'and the cell that was EMPTY now references that appended tile [precondition]',
      cCellAfter && cCellAfter.atlasTile === zoneTiles && cCellAfter.localId === null,
      `cell (${plan.cx},${plan.cy}) after the stroke: ${JSON.stringify(cCellAfter)} `
        + `(the tileset held ${zoneTiles} tiles before it)`);
    check('C4', 'with an empty stack, Ctrl+Z after the stroke puts the zone art back exactly',
      cZone2 === cZone0, `zoneArtHash after Ctrl+Z: ${cZone2}, want ${cZone0}`);
    // ⚠ RE-AIMED BY THE ROUTING FIX. This row asserted the defect from the other
    // side: the author's own gesture surviving their own Ctrl+Z. It now asserts
    // the ruling.
    check('C5', 'Ctrl+Z TAKES BACK the doc-local stroke',
      cDocC === cDocA && cDocC !== cDocB,
      `doc pixel ${cDocA} -> ${cDocB} (stroke) -> ${cDocC} (Ctrl+Z) `
        + `(canvas hash ${cPixB} -> ${cPixC})`);
    // ⚠ RE-AIMED BY THE ROUTING FIX. It asserted the Undo control stayed
    // DISABLED, i.e. that the gesture recorded nothing at all. That IS the
    // defect, so the row now asserts the gesture puts a step on a stack that was
    // empty a moment earlier — C1 is what makes "was empty" a measurement.
    check('C6', 'the doc-local stroke ENABLES the Undo control on a stack C1 found empty',
      cChip1.disabled === false && cCan1 === true,
      `chip disabled ${cChip0.disabled} -> ${cChip1.disabled}, canUndo() ${cCan0} -> ${cCan1}, `
        + `focusedDocId()=${cFocus1}`);

    // C-collision, on the same document
    const cColA = await collAt(plan.collIndex);
    await collisionStroke();
    const cColB = await collAt(plan.collIndex);
    const cZone3 = await zoneHash();
    await ctrlZ();
    const cColC = await collAt(plan.collIndex);
    const cZone4 = await zoneHash();
    console.log(`        [C collision] collisionA[${plan.collIndex}] ${cColA} -> ${cColB} -> ${cColC}`);
    console.log(`        [C collision] zoneArtHash ${cZone2} -> ${cZone3} -> ${cZone4}`);
    check('C7', 'the collision paint LANDS on the chunk document [precondition]',
      cColA !== null && cColB !== null && cColA !== cColB, `${cColA} -> ${cColB}`);
    check('C8', 'the collision paint and its Ctrl+Z change NO zone art — `set-chunk` carries '
      + 'both collision planes and touches no tile',
      cZone3 === cZone0 && cZone4 === cZone0,
      `zoneArtHash ${cZone2} -> ${cZone3} (paint) -> ${cZone4} (Ctrl+Z), want ${cZone0} throughout`);
    // ⚠ RE-AIMED BY THE ROUTING FIX, the same inversion as C5 and for the same
    // reason: this asserted that the author's own collision paint survived their
    // own Ctrl+Z.
    check('C9', 'Ctrl+Z TAKES BACK the collision paint',
      cColC === cColA && cColC !== cColB,
      `collisionA[${plan.collIndex}] ${cColA} -> ${cColB} (paint) -> ${cColC} (Ctrl+Z)`);
    await shot(c, 'C-control-after-ctrl-z');

    // ══ ROW Z — SETUP: put TWO zone-art edits on the stack ══════════════════
    //
    // Through the LIVE-TILE path, which the census and the fix packet both
    // measured as undoable on the zone-art stack. Two strokes on one live tile
    // are two `set-tileset-tiles` commands and so two stack entries — which is
    // what lets row T show the undo eating them ONE AT A TIME rather than
    // "something changed".
    console.log('\n══ ROW Z — SETUP: two real zone-art edits, via the live-tile path ══');
    // ⚠ SCROLLED INTO VIEW FIRST, and that is not tidying. On the first run of
    // this harness the panel sat at y=2796 in a 1050px-tall window; the
    // double-click was dispatched at a coordinate no element occupies, opened
    // nothing, and the row after it painted on the CHUNK document that was
    // still open — producing real zone-art edits through census path P3a and a
    // Z1 failure that was the only thing distinguishing the two. The rect is
    // re-read AFTER the scroll, and Z1 asserts a live-tile document is actually
    // open rather than trusting the click.
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
    check('Z0', 'the tileset panel grid canvas is uniquely identifiable [precondition]',
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
    // FATAL, on purpose. The claim under test is that the undo takes back an
    // edit made ELSEWHERE; if the setup edits were made from the chunk document
    // itself (census P3a) the rows below would still go red and would be
    // measuring a weaker thing. Rather than report that as the finding, stop.
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

    /** One stroke on the live tile at an integer offset; returns the zone-art
     *  hash it produced, or null if the offset changed nothing. */
    const zoneStroke = async (ox, oy) => {
      const ax = Math.round(liveRect.x) + ox, ay = Math.round(liveRect.y) + oy;
      const before = await zoneHash();
      await mouse(c, 'mouseMoved', ax, ay);
      await mouse(c, 'mousePressed', ax, ay);
      await sleep(60);
      await mouse(c, 'mouseReleased', ax, ay);
      await sleep(700);
      await park(c);
      const after = await zoneHash();
      return { ax, ay, before, after, moved: after !== before };
    };
    const zoneEdits = [];
    for (const [ox, oy] of [[12, 12], [28, 12], [44, 12], [12, 28], [28, 28], [44, 28], [12, 44], [28, 44]]) {
      const s = await zoneStroke(ox, oy);
      console.log(`        [Z] stroke at INTEGER client (${s.ax},${s.ay}) — zoneArtHash `
        + `${s.before} -> ${s.after}${s.moved ? '' : '  (no change; next offset)'}`);
      if (s.moved) zoneEdits.push(s);
      if (zoneEdits.length === 2) break;
    }
    const zAfterCan = await canUndo();
    const zAfterFocus = await focused();
    check('Z3', 'TWO real zone-art edits landed on the zone-art stack [precondition]',
      zoneEdits.length === 2 && zAfterCan === true,
      `${zoneEdits.length} edits, canUndo()=${zAfterCan}, focusedDocId()=${zAfterFocus}`);
    if (zoneEdits.length !== 2) throw new Error('could not build the discriminating setup: fewer than two zone-art edits landed');
    const ZONE_START = zoneEdits[0].before;              // before either edit
    const ZONE_ONE = zoneEdits[0].after;                 // after edit 1
    const ZONE_TWO = zoneEdits[1].after;                 // after edit 2
    console.log(`        zone-art witness: start ${ZONE_START} -> edit1 ${ZONE_ONE} -> edit2 ${ZONE_TWO}`);

    // ══ back to the SAME chunk document ═════════════════════════════════════
    const reopened = await reopenChunk('T00');
    check('T0a', 'the SAME chunk document is open again for the treatment [precondition]',
      !!reopened && reopened.chunkId === CHUNK_ID && reopened.dirty === false,
      JSON.stringify({ want: CHUNK_ID, got: reopened }));
    const zoneAfterReopen = await zoneHash();
    check('T0b', 'closing the live-tile document did NOT revert the two zone-art edits [control]',
      zoneAfterReopen === ZONE_TWO, `zoneArtHash after re-opening the chunk: ${zoneAfterReopen}, want ${ZONE_TWO}`);
    const cellNow = await c.json(`window.__dbg.aeon.artDocCellAt(${plan.cx}, ${plan.cy})`);
    check('T0c', 'the aimed cell is EMPTY again on the re-opened document [precondition]',
      !!cellNow && cellNow.atlasTile === null, JSON.stringify(cellNow));
    // The canvas geometry is re-derived after the re-open; the AIM is not.
    const instT = await c.json(PROBE);
    const rectT = instT.installed ? await c.json('window.__au.rect()') : null;
    const sameRect = !!rectT && Math.round(rectT.x) === Math.round(plan.rect.x)
      && Math.round(rectT.y) === Math.round(plan.rect.y)
      && Math.round(rectT.width) === Math.round(plan.rect.width);
    // If the panel scroll in row Z moved the composer, the aim is re-derived for
    // the SAME DOC CELL rather than reused blind — and the row below asserts the
    // re-derived integer lands on the same doc PIXEL, which is the thing the two
    // rows have to share. A client point reused across a moved rect would be a
    // different pixel wearing the same number.
    if (!sameRect && rectT) {
      const px = Math.round(rectT.x + (plan.cx * 8 + 4) * plan.zoom);
      const py = Math.round(rectT.y + (plan.cy * 8 + 4) * plan.zoom);
      const dp = await c.json(`window.__au.docPixel(${px}, ${py}, ${plan.zoom})`);
      note('T0d1', 'the canvas moved between the rows; the aim was re-derived for the same doc cell',
        `control (${plan.px},${plan.py}) -> doc (${plan.dp.px},${plan.dp.py}); `
        + `treatment (${px},${py}) -> doc (${dp.px},${dp.py})`);
      plan = { ...plan, px, py, dp };
    }
    check('T0d', 'the treatment aims at the SAME doc pixel of the SAME cell as the control [precondition]',
      !!rectT && plan.dp.px === (await c.json(`window.__au.docPixel(${plan.px}, ${plan.py}, ${plan.zoom})`)).px
      && (plan.dp.px >> 3) === plan.cx && (plan.dp.py >> 3) === plan.cy,
      `control rect ${JSON.stringify(plan.rect)}  treatment rect ${JSON.stringify(rectT)}  `
      + `aim (${plan.px},${plan.py}) -> doc pixel (${plan.dp.px},${plan.dp.py}) in cell (${plan.cx},${plan.cy})`);

    // ══ ROW T — TREATMENT: identical gestures, TWO entries on the stack ══════
    console.log('\n══ ROW T — TREATMENT: the same chunk document, the same two gestures, '
      + 'TWO zone-art edits on the stack ══');
    const tFocus0 = await focused();
    const tCan0 = await canUndo();
    const tChip0 = await chip();
    check('T1', 'the zone-art stack is NOT empty at the start of the treatment [precondition]',
      tCan0 === true, `canUndo()=${tCan0}, focusedDocId()=${tFocus0}, chip disabled=${tChip0.disabled}`);

    // T-pencil — the SAME gesture as C-pencil, at the SAME integer pixel
    const tPixA = await canvasHash();
    const tDocA = await docPixel();
    await pencilStroke();
    const tPixB = await canvasHash();
    const tDocB = await docPixel();
    const tZoneAfterStroke = await zoneHash();
    const tFocus1 = await focused();
    const tCan1 = await canUndo();
    const tChip1 = await chip();
    await ctrlZ();
    const tPixC = await canvasHash();
    const tDocC = await docPixel();
    const tZoneAfterZ = await zoneHash();
    console.log(`        [T pencil] canvas ${tPixA} -> ${tPixB} -> ${tPixC}`);
    console.log(`        [T pencil] doc pixel (${plan.dp.px},${plan.dp.py}) `
      + `${tDocA} -> ${tDocB} -> ${tDocC}`);
    console.log(`        [T pencil] zoneArtHash ${ZONE_TWO} -> ${tZoneAfterStroke} -> ${tZoneAfterZ}`);
    console.log(`        [T pencil] focusedDocId()=${tFocus1}   canUndo()=${tCan1}   `
      + `Undo chip disabled=${tChip1.disabled}`);
    check('T2a', 'the pencil stroke LANDS on the chunk document [precondition]',
      tDocA !== null && tDocB !== null && tDocA !== tDocB && tDocB === cDocB,
      `doc pixel ${tDocA} -> ${tDocB} (the control's stroke left ${cDocB}); canvas ${tPixA} -> ${tPixB}`);
    // ⚠ RE-AIMED BY THE ROUTING FIX (d-37), the twin of C3. The stroke moves the
    // witness because it materialises its own tile — and the assertion that
    // MATTERS for this experiment is that it moves it to a value that is NONE of
    // the ladder rungs. A move to ZONE_ONE or ZONE_START would be the stroke
    // reaching back into another document's edits, which is the thing under test.
    check('T2b', 'the pencil stroke moves the zone-art witness to ITS OWN new value, not to any '
      + 'earlier rung of the ladder [precondition]',
      tZoneAfterStroke !== ZONE_TWO && tZoneAfterStroke !== ZONE_ONE
        && tZoneAfterStroke !== ZONE_START,
      `zoneArtHash ${ZONE_TWO} -> ${tZoneAfterStroke} `
        + `(ladder: start=${ZONE_START}, edit1=${ZONE_ONE}, edit2=${ZONE_TWO})`);
    check('T2', 'THE FINDING: Ctrl+Z after a DOC-LOCAL pencil stroke leaves the earlier '
      + 'ZONE-ART edits alone',
      tZoneAfterZ === ZONE_TWO,
      tZoneAfterZ === ZONE_TWO ? `zone art unchanged at ${tZoneAfterZ}`
        : `zoneArtHash went ${ZONE_TWO} -> ${tZoneAfterZ}, which is `
          + `${tZoneAfterZ === ZONE_ONE ? 'THE STATE BEFORE THE SECOND ZONE-ART EDIT — the undo took back an edit on '
            + 'another document' : tZoneAfterZ === ZONE_START ? 'THE STATE BEFORE BOTH ZONE-ART EDITS' : 'a fourth value'}`);
    // ⚠ READ FROM THE DOCUMENT, NOT THE CANVAS. The first run of this harness
    // asserted this on the canvas hash and got a THIRD value — neither the
    // stroke's nor the pre-stroke one. That was the zone-art revert repainting
    // the chunk's ATLAS-BACKED cells underneath an untouched doc-local pixel:
    // the instrument could not tell "my stroke was taken back" from "somebody
    // else's tile was, and this document is showing it".
    // ⚠ RE-AIMED BY THE ROUTING FIX (d-37), the twin of C5. It asserted that the
    // author's own stroke SURVIVED their own Ctrl+Z, which together with T2's
    // failure was the whole defect: the press took back an edit on another
    // document and left this one alone. Both halves are now the other way round,
    // and T2 above is the half that did not have to change.
    check('T3', 'the doc-local stroke IS what that Ctrl+Z takes back',
      tDocC === tDocA && tDocC !== tDocB,
      `doc pixel ${tDocA} -> ${tDocB} (stroke) -> ${tDocC} (Ctrl+Z) `
        + `(canvas hash ${tPixB} -> ${tPixC})`);
    check('T4', 'the Undo control was ENABLED at the moment of the doc-local gesture '
      + '(and T2/T3 are what say the control now acts HERE rather than elsewhere)',
      tChip1.disabled === false && tCan1 === true,
      `chip disabled=${tChip1.disabled}, canUndo()=${tCan1}`);
    note('T4b', 'which document Ctrl+Z resolved to, read from the app',
      `focusedDocId() = ${tFocus1} (the control row read ${cFocus1})`);
    await shot(c, 'T-treatment-after-pencil-ctrl-z');

    // T-collision — the SAME gesture as C-collision
    const tColA = await collAt(plan.collIndex);
    await collisionStroke();
    const tColB = await collAt(plan.collIndex);
    const tZoneBeforeZ2 = await zoneHash();
    const tCan2 = await canUndo();
    const tChip2 = await chip();
    await ctrlZ();
    const tColC = await collAt(plan.collIndex);
    const tZoneAfterZ2 = await zoneHash();
    console.log(`        [T collision] collisionA[${plan.collIndex}] ${tColA} -> ${tColB} -> ${tColC}`);
    console.log(`        [T collision] zoneArtHash ${tZoneBeforeZ2} -> ${tZoneAfterZ2}   `
      + `canUndo()=${tCan2}  chip disabled=${tChip2.disabled}`);
    check('T5a', 'the collision paint LANDS on the chunk document [precondition]',
      tColA !== null && tColB !== null && tColA !== tColB, `${tColA} -> ${tColB}`);
    // The baseline is the hash AFTER the pencil row's Ctrl+Z, not before it —
    // that Ctrl+Z moved the zone art, which is the whole finding, and comparing
    // against the pre-Ctrl+Z value made this row fail for the previous row's
    // reason.
    check('T5b', 'the collision paint is DOC-LOCAL — it moved no zone art [precondition]',
      tZoneBeforeZ2 === tZoneAfterZ, `zoneArtHash ${tZoneAfterZ} -> ${tZoneBeforeZ2}`);
    check('T5', 'THE FINDING, second gesture: Ctrl+Z after a DOC-LOCAL collision paint '
      + 'leaves the earlier ZONE-ART edits alone',
      tZoneAfterZ2 === tZoneBeforeZ2,
      tZoneAfterZ2 === tZoneBeforeZ2 ? `zone art unchanged at ${tZoneAfterZ2}`
        : `zoneArtHash went ${tZoneBeforeZ2} -> ${tZoneAfterZ2} `
          + `(start=${ZONE_START}, after edit1=${ZONE_ONE}, after edit2=${ZONE_TWO})`);
    // ⚠ RE-AIMED BY THE ROUTING FIX (d-37), the twin of C9.
    check('T6', 'the collision paint IS what that Ctrl+Z takes back',
      tColC === tColA && tColC !== tColB,
      `collisionA[${plan.collIndex}] ${tColA} -> ${tColB} (paint) -> ${tColC} (Ctrl+Z)`);
    await shot(c, 'T-treatment-after-collision-ctrl-z');

    console.log('\n══ SUMMARY ═════════════════════════════════════════════════');
    console.log(`  chunk under test: ${CHUNK_ID} (${chunkMeta?.name}), `
      + `aim cell (${plan.cx},${plan.cy}) EMPTY, integer client (${plan.px},${plan.py}), dpr=${dpr}`);
    console.log(`  zone-art witness  start=${ZONE_START}  edit1=${ZONE_ONE}  edit2=${ZONE_TWO}`);
    console.log(`  CONTROL   (empty stack)  pencil: zone ${cZone0} -> ${cZone1} -> ${cZone2}   `
      + `collision: zone ${cZone2} -> ${cZone3} -> ${cZone4}`);
    console.log(`  TREATMENT (2 on stack)   pencil: zone ${ZONE_TWO} -> ${tZoneAfterStroke} -> ${tZoneAfterZ}   `
      + `collision: zone ${tZoneBeforeZ2} -> ${tZoneAfterZ2}`);
    console.log(`  doc-local witness  control pencil ${cDocA}->${cDocB}->${cDocC}, `
      + `treatment pencil ${tDocA}->${tDocB}->${tDocC}; `
      + `collision control ${cColA}->${cColB}->${cColC}, treatment ${tColA}->${tColB}->${tColC}`);
    console.log(`  focusedDocId()  control=${cFocus1}  treatment=${tFocus1}`);
    writeFileSync(`${SHOTS}/rows.json`, JSON.stringify({
      dpr, chunkId: CHUNK_ID, chunkMeta, plan: { ...plan, view: undefined },
      zone: { start: ZONE_START, edit1: ZONE_ONE, edit2: ZONE_TWO },
      control: { zone0: cZone0, zoneAfterPencil: cZone1, zoneAfterPencilZ: cZone2,
        zoneAfterColl: cZone3, zoneAfterCollZ: cZone4,
        pix: [cPixA, cPixB, cPixC], docPixel: [cDocA, cDocB, cDocC], coll: [cColA, cColB, cColC],
        focused: cFocus1, canUndo: cCan1, chipDisabled: cChip1.disabled },
      treatment: { zoneAfterPencil: tZoneAfterStroke, zoneAfterPencilZ: tZoneAfterZ,
        zoneBeforeCollZ: tZoneBeforeZ2, zoneAfterCollZ: tZoneAfterZ2,
        pix: [tPixA, tPixB, tPixC], docPixel: [tDocA, tDocB, tDocC], coll: [tColA, tColB, tColC],
        focused: tFocus1, canUndo: tCan1, chipDisabled: tChip1.disabled },
      results,
    }, null, 2));
    const passes = results.filter((r) => r.ok === true).length;
    const failed = results.filter((r) => r.ok === false).length;
    const notes = results.filter((r) => r.ok === null).length;
    console.log(`\n  ${passes} pass, ${failed} fail, ${notes} note — ${results.length} rows total`);
    if (fails.length) console.log(`  FAILING: ${fails.join(', ')}`);
    // ⚠ THE EPILOGUE INVERTED WITH THE FIX. It used to announce T2/T5 as RED BY
    // DESIGN. They are the rows the owner's ruling (d-37 `route_onto_zone_stack`,
    // docs/reviews/2026-09-09-chunk-undo-routing.md) was taken to close, so a red
    // one here is now a REGRESSION and says so in those words. Every other row
    // is a control or a precondition around them.
    const finding = ['T2', 'T5'].filter((id) => results.some((r) => r.id === id && r.ok === false));
    if (finding.length) {
      console.log(`  ⚠ REGRESSION — ${finding.join(', ')} IS THE ROW THE ROUTING FIX CLOSED: `
        + 'a doc-local gesture on a CHUNK document has gone back to leaving Ctrl+Z pointed at the '
        + 'zone-art stack, so pressing it destroys an earlier edit on a document the author is not '
        + 'looking at. Lens row ART-UNDO-CHUNK-SPLIT; see '
        + 'docs/reviews/2026-09-09-chunk-undo-routing.md and the measurement it replaced, '
        + 'docs/reviews/2026-09-09-chunk-undo-measure.md.');
    } else if (fails.length === 0) {
      console.log('  GREEN — every gesture on a chunk document records one step on '
        + 'zoneart:<zone>, Ctrl+Z takes back the AUTHOR\'S OWN gesture, and the earlier zone-art '
        + 'edits made on another document survive it (T2, T5). Owner ruling d-37 '
        + '`route_onto_zone_stack`; docs/reviews/2026-09-09-chunk-undo-routing.md.');
    }
    console.log('HARNESS-END-MARKER');
  } finally {
    if (c) c.close();
    await killTree(child);
  }
}

await main();
process.exit(fails.length ? 1 : 0);
