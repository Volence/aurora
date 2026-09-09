#!/usr/bin/env node
// WHICH COMMIT PATH IN THE ART COMPOSER IS UNDOABLE — the census, driven.
//
// UX seat B filed F1 as "a paint stroke in the Art composer cannot be undone".
// That headline is too broad to act on: `ComposerCanvas.commitWrites` has FOUR
// commit paths and its own docblock claims one of them (bgOverride) is undoable
// and has a committed test saying so. So the question this harness answers is
// not "is the art canvas undoable" but WHICH PATH the seat's gesture took, and
// what each of the others does under the SAME gesture.
//
// Rows A and B are each a matched hash triple (before / after paint / after
// Ctrl+Z) taken at the same coordinate in the same run; C and D extend the same
// question to the other doc-local writer and to the other way a doc-local
// document is created:
//
//   A  doc-local          New Tile 1x1 (the seat's own gesture)
//   B  live-tile          double-click a tileset tile, then the same stroke
//   C  doc-local, TILE-SPACE   the COLLISION tool on a New Block — `applyTileCell`,
//                         a writer that never reaches `commitWrites` at all, read
//                         through the doc's own collision plane rather than a
//                         pixel hash. Carries the DIRTY-FLAG rows too.
//   D  doc-local, MAP CAPTURE  the map's right-click "Edit 128x128 chunk region",
//                         which opens DIRTY on purpose — so unwinding it must end
//                         dirty, not clean.
//
// B is the row that makes A a defect rather than a design: the SAME canvas
// component, the SAME gesture, one store field apart.
//
// ⚠ dpr varies run to run on this box (observed 1 and 1.35). Every aim below is
// an INTEGER client pixel and the doc pixel it lands on is derived from that
// integer through the app's own arithmetic ((client - rect.left) / zoom), then
// printed. Nothing here compares a fractional rect to anything.
//
// ⚠ THIS HARNESS EXITED 1 BY DESIGN UNTIL 2026-09-09, and rows A2/A3 were the
// finding: a stroke on a doc-local composer document recorded no undo step, and
// the fix was PARKED on the design question in
// docs/reviews/2026-09-09-art-undo-path.md §4. That question was answered (option
// 1: a per-document stack for PURE doc-local documents only) and the fix landed
// on `parcel/art-undo-fix`, so this run is now expected GREEN.
//
// ⚠ NOT ONE ASSERTION IN A2/A3 CHANGED WHEN IT WENT GREEN — only this header's
// statement of what to expect, and the epilogue that named them as expected red.
// Rows C and D were ADDED alongside, and rows B and D2 are what keep the whole
// thing from being self-confirming: B (live-tile) passing is what says the
// instrument itself works — if B ever fails, suspect the harness before believing
// anything A says — and D2 asserts a dirty flag comes back TRUE, so a fix that
// simply forced every document clean on undo would fail here.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:art-undo-path

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9417);
const ROOT = AURORA_DIR;
const AEON = siblingPathOrUnresolved('aeon');
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const SHOTS = `${ROOT}/scratchpad/shots-art-undo-path`;
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── CDP plumbing (same shape as bg-tile-picker-harness.mjs) ──────────────────
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
  console.log(`        shot -> scratchpad/shots-art-undo-path/${name}.png`);
}

// ── FIXTURE: a hardlinked copy; the live aeon tree is never opened ───────────
function hardlinkCopy(dest) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync('cp', ['-al', AEON, dest]);
  return dest;
}

// ── THE PAGE-SIDE PROBE ─────────────────────────────────────────────────────
//
// The composer / sprite canvas is the ONE canvas PixelViewport renders: inline
// `cursor: crosshair` + `imageRendering: pixelated` (its own source, the
// <canvas> element at the bottom of PixelViewport.tsx). Every other canvas on
// screen (tileset panel, its overlay, chunk library thumbnails) sets neither.
// The probe REFUSES when that does not name exactly one element, rather than
// silently picking the first, because "which canvas did you hash" is precisely
// what a wrong answer here would hide.
const PROBE = String.raw`
(() => {
  const all = [...document.querySelectorAll('canvas')];
  const mine = all.filter(c => c.style.cursor === 'crosshair' && c.style.imageRendering === 'pixelated');
  if (mine.length !== 1) {
    return { installed: false, candidates: mine.length, canvases: all.length,
             sizes: all.map(c => [c.width, c.height, c.style.cursor || '-']) };
  }
  const cv = mine[0];
  const g = cv.getContext('2d', { willReadFrequently: true });
  window.__au = {
    el: cv,
    rect: () => cv.getBoundingClientRect().toJSON(),
    size: () => ({ w: cv.width, h: cv.height }),
    dpr: () => window.devicePixelRatio,
    hash: () => {
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 4) { h = (h * 31 + d[i] + d[i+1]*3 + d[i+2]*7) >>> 0; }
      return h;
    },
    /** The doc pixel an INTEGER client point lands on, in PixelViewport's own
     *  arithmetic: floor((client - rect.left) / zoom). zoom is recovered from
     *  the element, not typed: width attribute / (tilesX * 8). */
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

  const FIXTURE = join(ROOT, 'scratchpad/fixtures/aeon-art-undo');
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
    check('0c', "the Art facet is focused [precondition]", facet?.facet === 'art', JSON.stringify(facet));
    await sleep(800);

    const dpr = await c.evalExpr('window.devicePixelRatio');
    console.log(`\n        devicePixelRatio for this run: ${dpr}`);

    // ═══ shared row body ═══════════════════════════════════════════════════
    //
    // One stroke, three hashes at the same coordinate, plus the Undo chip and
    // the focused stack's own canUndo() on both sides. `offsets` are candidate
    // INTEGER offsets into the canvas; the first that actually moves the hash
    // is the one measured, and the row goes CANNOT-MEASURE (not "undoable") if
    // none of them do.
    async function undoRow(id, label, offsets, opts = {}) {
      const inst = await c.json(PROBE);
      if (!inst.installed) {
        note(id, `${label} — CANNOT MEASURE: the pixel canvas is not uniquely identifiable`,
          JSON.stringify(inst));
        fails.push(`[${id}] ${label} (could not measure)`);
        return null;
      }
      const rect = await c.json('window.__au.rect()');
      const size = await c.json('window.__au.size()');
      // Zoom is RECOVERED from the element, never typed: PixelViewport sets
      // width = tilesX * 8 * zoom, so zoom = width / (tilesX * 8).
      const zoomReal = opts.zoom ?? (size.w / (Math.max(1, opts.tilesX ?? 1) * 8));
      console.log(`\n  [${id}] ${label}`);
      console.log(`        dpr=${dpr}  canvas attr ${size.w}x${size.h}  `
        + `rect=${JSON.stringify(rect)}  zoom=${zoomReal}`);

      await park(c);
      const before = await c.evalExpr('window.__au.hash()');
      const chipBefore = await c.json(UNDO_CHIP);
      const canUndoBefore = await c.evalExpr('window.__dbg.aeon.canUndo()');

      let aimed = null, afterPaint = before;
      for (const [ox, oy] of offsets) {
        const ax = Math.round(rect.x) + ox;
        const ay = Math.round(rect.y) + oy;
        const dp = await c.json(`window.__au.docPixel(${ax}, ${ay}, ${zoomReal})`);
        await mouse(c, 'mouseMoved', ax, ay);
        await mouse(c, 'mousePressed', ax, ay);
        await sleep(60);
        await mouse(c, 'mouseReleased', ax, ay);
        await sleep(700);
        await park(c);
        const h = await c.evalExpr('window.__au.hash()');
        if (h !== before) { aimed = { ax, ay, dp }; afterPaint = h; break; }
        console.log(`        aim (${ax},${ay}) -> doc px (${dp.px},${dp.py}) left the hash unchanged; next offset`);
      }
      if (aimed === null) {
        note(id, `${label} — CANNOT MEASURE: no offset moved the canvas hash`,
          `tried ${JSON.stringify(offsets)}; the stroke never landed, so undo cannot be judged`);
        fails.push(`[${id}] ${label} (stroke never landed)`);
        return null;
      }
      console.log(`        aimed INTEGER client (${aimed.ax},${aimed.ay}) -> doc pixel `
        + `(${aimed.dp.px},${aimed.dp.py})`);
      const chipAfter = await c.json(UNDO_CHIP);
      const canUndoAfter = await c.evalExpr('window.__dbg.aeon.canUndo()');

      await key(c, 'z', 'KeyZ', 90, 2);   // 2 = Ctrl
      await sleep(1200);
      await park(c);
      const afterZ = await c.evalExpr('window.__au.hash()');
      const chipZ = await c.json(UNDO_CHIP);

      const undone = afterZ === before;
      const row = { id, label, before, afterPaint, afterZ, undone,
        chipBefore, chipAfter, chipZ, canUndoBefore, canUndoAfter, aimed, zoom: zoomReal };
      console.log(`        hash ${before} -> ${afterPaint} -> ${afterZ}   `
        + `Undo chip disabled: ${chipBefore.disabled} -> ${chipAfter.disabled} -> ${chipZ.disabled}   `
        + `canUndo(): ${canUndoBefore} -> ${canUndoAfter}`);
      return row;
    }

    const rows = [];

    const clickText = async (text) => {
      const p = await c.json(`(() => {
        const b = [...document.querySelectorAll('button')].find(b => b.innerText.replace(/\\s+/g,' ').trim().startsWith(${JSON.stringify(text)}));
        if (!b) return null;
        b.scrollIntoView({block:'center'});
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), label: b.innerText.replace(/\\s+/g,' ').trim() };
      })()`);
      if (!p) return null;
      await mouse(c, 'mouseMoved', p.x, p.y);
      await mouse(c, 'mousePressed', p.x, p.y);
      await mouse(c, 'mouseReleased', p.x, p.y);
      await sleep(900);
      return p;
    };


    /** Press a button by CSS selector (icon buttons have no innerText). */
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
      await mouse(c, 'mouseMoved', p.x, p.y);
      await mouse(c, 'mousePressed', p.x, p.y);
      await mouse(c, 'mouseReleased', p.x, p.y);
      await sleep(500);
      return p;
    };

    /** Press the first element matching `selector` whose `title` matches `re`. */
    const clickSelectorMatching = async (selector, re) => {
      const p = await c.json(`(() => {
        const rx = new RegExp(${JSON.stringify(re)});
        const b = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .find(el => rx.test(el.getAttribute('title') || ''));
        if (!b) return null;
        b.scrollIntoView({block:'center'});
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2),
                 label: b.getAttribute('title') };
      })()`);
      if (!p) return null;
      await mouse(c, 'mouseMoved', p.x, p.y);
      await mouse(c, 'mousePressed', p.x, p.y);
      await mouse(c, 'mouseReleased', p.x, p.y);
      await sleep(500);
      return p;
    };

    // ══ ROW B — live-tile path: double-click a tileset tile ════════════════
    // The tileset panel's grid canvas, identified by TilesetPanel's OWN inline
    // style (`styles.canvas`: absolute, 100%/100%, pixelated, and — unlike the
    // composer canvas — no cursor). Its overlay sibling sets pointerEvents:none
    // and carries no imageRendering, so the filter names one element. The click
    // handlers are on the WRAPPER, so a press anywhere in that box is the
    // panel's own gesture. Refuses rather than guessing when it is not unique.
    const tsPoint = await c.json(`(() => {
      const all = [...document.querySelectorAll('canvas')];
      const grid = all.filter(c => c.style.position === 'absolute'
        && c.style.imageRendering === 'pixelated'
        && c.style.width === '100%' && !c.style.cursor);
      if (grid.length !== 1) return { ambiguous: grid.length, canvases: all.length };
      const r = grid[0].getBoundingClientRect();
      if (r.width < 32 || r.height < 32) return { tooSmall: r.toJSON() };
      return { x: Math.round(r.left + 12), y: Math.round(r.top + 12), rect: r.toJSON() };
    })()`);
    if (tsPoint && tsPoint.x === undefined) {
      note('B0x', 'the tileset panel grid canvas could not be identified', JSON.stringify(tsPoint));
    }
    if (tsPoint && tsPoint.x !== undefined) {
      await mouse(c, 'mouseMoved', tsPoint.x, tsPoint.y);
      await mouse(c, 'mousePressed', tsPoint.x, tsPoint.y, 1);
      await mouse(c, 'mouseReleased', tsPoint.x, tsPoint.y, 1);
      await sleep(120);
      await mouse(c, 'mousePressed', tsPoint.x, tsPoint.y, 2);
      await mouse(c, 'mouseReleased', tsPoint.x, tsPoint.y, 2);
      await sleep(1200);
    }
    const liveOpen = await c.json(`(() => {
      const t = [...document.querySelectorAll('*')].map(e => e.textContent || '')
        .filter(s => /^tile #\\d+, used /.test(s.trim()));
      // A modal confirm ("this document has unsaved changes") would swallow the
      // open and look exactly like "the double-click did nothing", so say which.
      const dialog = [...document.querySelectorAll('button')]
        .some(b => /discard|don't save|do not save/i.test(b.innerText));
      return { liveHeader: t.length > 0, sample: t[0] ? t[0].trim().slice(0, 60) : null,
               confirmDialogUp: dialog };
    })()`);
    check('B0', 'a LIVE-TILE document is open (the tileset panel names the atlas tile) [precondition]',
      liveOpen.liveHeader, JSON.stringify({ ...liveOpen, clickedAt: tsPoint }));
    if (liveOpen.liveHeader) {
      const b = await undoRow('B', 'LIVE-TILE path — atlas tile opened in place, pencil stroke',
        [[12, 12], [20, 20], [28, 28], [36, 36], [44, 44], [52, 52], [60, 60]], { tilesX: 1 });
      if (b) {
        rows.push(b);
        check('B1', 'a stroke on a live-tile document LANDS (hash moved) [precondition]',
          b.afterPaint !== b.before, `${b.before} -> ${b.afterPaint}`);
        check('B2', 'Ctrl+Z takes back a stroke on a LIVE-TILE document (the in-canvas control)',
          b.undone, b.undone ? `restored to ${b.before}` : `hash after Ctrl+Z is ${b.afterZ}`);
        check('B3', 'the Undo control offers itself after a stroke on a live-tile document',
          b.chipAfter.disabled === false || b.canUndoAfter === true,
          `chip disabled=${b.chipAfter.disabled}, canUndo()=${b.canUndoAfter}`);
        await shot(c, 'B-live-tile-after-ctrl-z');
      }
    }

    // ══ ROW A — the seat's own gesture: New Tile 1x1, doc-local path ════════
    //
    // The launcher (and with it the New Tile button) only renders while NO
    // document is open — art-facet.tsx renders `open ? <ComposerCanvas/> :
    // <launcher>`. Row B left a live-tile document open, so close it through
    // the facet's own "New…" control first. Row B's Ctrl+Z already put that
    // document back, so this close is clean and raises no confirm.
    const closed = await clickText('New…');
    note('A00', 'closed row B\'s document through the facet\'s own "New…" control',
      JSON.stringify(closed));
    await sleep(600);
    const newTile = await clickText('New Tile');
    check('A0', "the 'New Tile 1x1 (8px)' button was pressed (the seat's own entry) [precondition]",
      newTile !== null, JSON.stringify(newTile));
    if (newTile) {
      await sleep(700);
      const a = await undoRow('A', 'DOC-LOCAL path — New Tile 1x1, pencil stroke',
        [[12, 12], [20, 20], [28, 28], [36, 36], [44, 44], [52, 52]], { tilesX: 1 });
      if (a) {
        rows.push(a);
        check('A1', 'a stroke on a New Tile document LANDS (hash moved) [precondition]',
          a.afterPaint !== a.before, `${a.before} -> ${a.afterPaint}`);
        check('A2', 'Ctrl+Z takes back a stroke on a New Tile document',
          a.undone, a.undone ? `restored to ${a.before}`
            : `hash after Ctrl+Z is ${a.afterZ}, which is ${a.afterZ === a.afterPaint ? 'BYTE-IDENTICAL to after the paint' : 'a third value'}`);
        check('A3', 'the Undo control offers itself after a stroke on a New Tile document',
          a.chipAfter.disabled === false || a.canUndoAfter === true,
          `chip disabled=${a.chipAfter.disabled}, canUndo()=${a.canUndoAfter}`);
        await shot(c, 'A-doc-local-after-ctrl-z');
      }
    }

    // Close whatever is open through the facet's own "New…" control, DISCARDING
    // if the app asks. The discard arm is not decoration: with the fix reverted
    // row A leaves its document dirty, so the dialog is up and every row after
    // this one would fail for the wrong reason — an instrument that only works
    // on the green side cannot be used to show the red side.
    const closeDocDiscarding = async (id) => {
      await clickText('New…');
      await sleep(400);
      const asked = await c.json(`(() => {
        const b = [...document.querySelectorAll('button')]
          .find(b => /^Discard & (close|open)$/.test(b.innerText.trim()));
        if (!b) return { dialog: false };
        const r = b.getBoundingClientRect();
        return { dialog: true, label: b.innerText.trim(),
                 x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
      })()`);
      if (asked.dialog) {
        await mouse(c, 'mouseMoved', asked.x, asked.y);
        await mouse(c, 'mousePressed', asked.x, asked.y);
        await mouse(c, 'mouseReleased', asked.x, asked.y);
        await sleep(700);
      }
      note(id, 'closed the open document through "New…"',
        asked.dialog ? `the unsaved-strokes dialog was up; pressed "${asked.label}"`
          : 'no dialog — the document was clean');
    };

    // ══ ROW C — P5: the TILE-SPACE writer, on a New Block ══════════════════
    //
    // `applyTileCell` (tile-stamp / collision / palette-apply) is not a branch of
    // `commitWrites` — it is wired straight to the viewport's host-pointer hook,
    // so a fix that covered only the pixel path would leave the same document
    // half undoable. Measured through the doc's OWN collision plane
    // (`__dbg.aeon.artDocCollisionAt`) instead of a canvas hash, because a
    // collision word is an exact number and a hash cannot say WHICH cell moved.
    //
    // A New BLOCK and not a New Tile: collision is stored per 16px cell
    // (chunkCellCount = (w>>1)*(h>>1)), so a 1x1-tile document has ZERO cells and
    // nothing to paint. 2x2 tiles is exactly one cell, index 0.
    await closeDocDiscarding('C00');
    // The launcher's label is "Block 16×16 px (2×2 tiles)" — NOT "New Block".
    // Matched on the leading word the way `clickText` matches, and asserted
    // rather than assumed: the first version of this row typed the name the
    // handler gives the DOCUMENT (`New Block (16×16)`) and found no button.
    const newBlock = await clickText('Block');
    check('C0', "the launcher's 'Block 16×16 px (2×2 tiles)' button was pressed [precondition]",
      newBlock !== null, JSON.stringify(newBlock));
    if (newBlock) {
      await sleep(700);
      // Arm the Collision tool by its accessible name — ToolButton renders an
      // icon and an aria-label and no text, so innerText cannot find it.
      const armed = await clickSelector('button[aria-label="Collision paint"]');
      await sleep(400);
      // …AND ARM A SHAPE. `selectedCollisionProfile` defaults to 0, and
      // `selectedCollisionWord` maps shape 0 to AIR_CELL, so the default brush
      // paints air — onto a fresh document whose cells are already air, which
      // `paintDocCollision` correctly refuses as an unchanged write. The first
      // version of this row skipped the palette and measured 0 -> 0, which reads
      // exactly like "the tool-space writer does nothing" and is instead the app
      // being right. The shape buttons carry a `title` of the form
      // "#<shape> · <class> · <solidity>", which is how one is found here.
      const shape = await clickSelectorMatching('button[title]', String.raw`^#\d+ `);
      await sleep(400);
      note('C0b', 'armed the collision tool and a real (non-air) shape',
        JSON.stringify({ tool: armed, shape }));
      const openC = await c.json('window.__dbg.aeon.artChunkOpen()');
      check('C1', 'a PURE DOC-LOCAL document is open with the collision tool armed [precondition]',
        !!openC && openC.chunkId === null && openC.tool === 'collision' && openC.dirty === false,
        JSON.stringify(openC));

      const inst = await c.json(PROBE);
      const rect = inst.installed ? await c.json('window.__au.rect()') : null;
      if (rect) {
        const collAt = () => c.evalExpr(`window.__dbg.aeon.artDocCollisionAt('a', 0)`);
        const cBefore = await collAt();
        const ax = Math.round(rect.x) + 8, ay = Math.round(rect.y) + 8;
        console.log(`\n  [C] TILE-SPACE path — collision paint on a New Block`);
        console.log(`        dpr=${dpr}  rect=${JSON.stringify(rect)}  aim INTEGER (${ax},${ay})`);
        await mouse(c, 'mouseMoved', ax, ay);
        await mouse(c, 'mousePressed', ax, ay);
        await sleep(60);
        await mouse(c, 'mouseReleased', ax, ay);
        await sleep(700);
        const cAfter = await collAt();
        const dirtyAfter = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty ?? null;
        const canUndoAfter = await c.evalExpr('window.__dbg.aeon.canUndo()');
        await key(c, 'z', 'KeyZ', 90, 2);
        await sleep(1000);
        const cZ = await collAt();
        const dirtyZ = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty ?? null;
        console.log(`        collisionA[0] ${cBefore} -> ${cAfter} -> ${cZ}   `
          + `dirty: false -> ${dirtyAfter} -> ${dirtyZ}   canUndo(): ${canUndoAfter}`);
        check('C2', 'a collision stroke LANDS on the doc plane (the word moved) [precondition]',
          cBefore !== cAfter && cAfter !== null, `${cBefore} -> ${cAfter}`);
        check('C3', 'Ctrl+Z takes back a TILE-SPACE (applyTileCell) write on a doc-local document',
          cAfter !== cBefore && cZ === cBefore, `after Ctrl+Z collisionA[0] is ${cZ}, want ${cBefore}`);
        check('C4', 'the Undo control offers itself after a tile-space write', canUndoAfter === true,
          `canUndo()=${canUndoAfter}`);
        // The save-contract half: `open.dirty` is the composer's unsaved-work
        // flag, and undoing back to the state the document OPENED in must clear
        // it — the same rule `markUndone` gave an act (docs/reviews/
        // 2026-09-09-save-contract.md R5). A New Block opens CLEAN, so clean is
        // the right answer HERE; row D2 is the other direction.
        check('C5', 'the write marks the document dirty [precondition]', dirtyAfter === true,
          `dirty after the stroke: ${dirtyAfter}`);
        check('C6', 'undoing back to the start state CLEARS dirty on a document that opened clean',
          dirtyZ === false, `dirty after Ctrl+Z: ${dirtyZ}`);
      } else {
        note('C2', 'TILE-SPACE row — CANNOT MEASURE: the pixel canvas is not uniquely identifiable',
          JSON.stringify(inst));
        fails.push('[C2] tile-space row (could not measure)');
      }
    }

    // ══ ROW D — a MAP-CAPTURE document, which opens DIRTY ══════════════════
    //
    // The other way a pure doc-local document is created: right-click the map and
    // take a 16x16-tile region into the composer. Two things make it worth its own
    // row rather than "same as A". Its cells are ATLAS-BACKED (docFromSectionRegion
    // carries the section's nametable words), so the stroke copies-on-write into a
    // fresh local tile instead of painting an empty cell; and it opens with
    // `dirty: true` ("copied off the map and not yet in the library"), so unwinding
    // it must land on DIRTY. A fix that cleared the flag on every undo would pass
    // C6 and fail D2 — which is why both directions are here.
    await closeDocDiscarding('D00');
    const mapFacet = await c.json(`window.__dbg.aeon.setFacet('map')`);
    check('D0a', 'the Map facet is focused [precondition]', mapFacet?.facet === 'map',
      JSON.stringify(mapFacet));
    await sleep(900);
    const mapPoint = await c.json(`(() => {
      const cv = document.getElementById('map-canvas');
      if (!cv) return null;
      const r = cv.getBoundingClientRect();
      if (r.width < 64 || r.height < 64) return { tooSmall: r.toJSON() };
      return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2), rect: r.toJSON() };
    })()`);
    if (mapPoint && mapPoint.x !== undefined) {
      await c.send('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: mapPoint.x, y: mapPoint.y, button: 'right', buttons: 2, clickCount: 1,
      });
      await c.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: mapPoint.x, y: mapPoint.y, button: 'right', buttons: 0, clickCount: 1,
      });
      await sleep(500);
    }
    const capture = await clickText('Edit 128×128 chunk region');
    check('D0b', 'the map\'s "Edit 128×128 chunk region" item was pressed [precondition]',
      capture !== null, JSON.stringify({ capture, mapPoint }));
    if (capture) {
      await sleep(1200);
      // RE-ARM THE PENCIL. The tool is store state and survives a document
      // change, so row C leaves `collision` armed and this row's "pencil stroke"
      // would be a collision paint that moves no pixel — which presents as
      // "the stroke never landed" and would have been read as a defect in the
      // capture path. Asserted below rather than assumed.
      await clickSelector('button[aria-label^="Pencil"]');
      await sleep(400);
      const openD = await c.json('window.__dbg.aeon.artChunkOpen()');
      check('D0c', 'a 16×16-tile MAP-CAPTURE document is open, DIRTY on arrival, pencil armed [precondition]',
        !!openD && openD.chunkId === null && openD.widthTiles === 16 && openD.dirty === true
        && openD.tool === 'pencil',
        JSON.stringify(openD));
      const d = await undoRow('D', 'MAP-CAPTURE path — "Edit 128×128 chunk region", pencil stroke',
        [[12, 12], [20, 20], [28, 28], [36, 36], [44, 44], [52, 52]], { tilesX: 16 });
      if (d) {
        rows.push(d);
        const dirtyZ = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty ?? null;
        check('D1', 'Ctrl+Z takes back a stroke on a MAP-CAPTURE document',
          d.undone, d.undone ? `restored to ${d.before}` : `hash after Ctrl+Z is ${d.afterZ}`);
        check('D2', 'undoing a document that OPENED DIRTY leaves it dirty, not clean',
          dirtyZ === true, `dirty after Ctrl+Z: ${dirtyZ}`);
        await shot(c, 'D-map-capture-after-ctrl-z');
      }
    }

    console.log('\n══ SUMMARY ═════════════════════════════════════════════════');
    for (const r of rows) {
      console.log(`  ${r.id} ${r.label}`);
      console.log(`     ${r.before} -> ${r.afterPaint} -> ${r.afterZ}  `
        + `${r.undone ? 'UNDONE' : 'NOT UNDONE'}  (chip disabled after paint: ${r.chipAfter.disabled}, `
        + `canUndo(): ${r.canUndoAfter})`);
    }
    writeFileSync(`${SHOTS}/rows.json`, JSON.stringify({ dpr, rows, results }, null, 2));
    const passes = results.filter((r) => r.ok === true).length;
    const failed = results.filter((r) => r.ok === false).length;
    const notes = results.filter((r) => r.ok === null).length;
    console.log(`\n  ${passes} pass, ${failed} fail, ${notes} note — ${results.length} rows total`);
    if (fails.length) console.log(`  FAILING: ${fails.join(', ')}`);
    // Until 2026-09-09 A2/A3 were EXPECTED RED and this block said so. They are
    // the fixed rows now, so the note points the other way: if they go red again
    // the per-document composer stack has stopped being reached, and the first
    // thing to read is `focusedDocId()`'s composer branch.
    const regressed = ['A2', 'A3', 'C3', 'D1'].filter((id) =>
      results.some((r) => r.id === id && r.ok === false));
    if (regressed.length) {
      console.log(`  REGRESSION (these were fixed on parcel/art-undo-fix): ${regressed.join(', ')} `
        + '— a pure doc-local composer document is recording no undo step again. See '
        + 'docs/reviews/2026-09-09-art-undo-fix.md.');
    }
    console.log('HARNESS-END-MARKER');
  } finally {
    if (c) c.close();
    await killTree(child);
  }
}

await main();
process.exit(fails.length ? 1 : 0);
