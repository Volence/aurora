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
// Rows, each a matched hash triple (before / after paint / after Ctrl+Z) taken
// at the same coordinate in the same run:
//
//   A  doc-local          New Tile 1x1 (the seat's own gesture)
//   B  live-tile          double-click a tileset tile, then the same stroke
//   C  doc-local, tile    the tile-STAMP tool on the same New Tile doc
//                         (applyTileCell, a fifth writer that is not
//                          commitWrites at all)
//   D  control            the sprite document's bitmap canvas
//
// B is the row that makes A a defect rather than a design: the SAME canvas
// component, the SAME gesture, one store field apart.
//
// ⚠ dpr varies run to run on this box (observed 1 and 1.35). Every aim below is
// an INTEGER client pixel and the doc pixel it lands on is derived from that
// integer through the app's own arithmetic ((client - rect.left) / zoom), then
// printed. Nothing here compares a fractional rect to anything.
//
// ⚠ THIS HARNESS IS EXPECTED TO EXIT 1 TODAY, and that is the finding, not a
// broken instrument. Rows A2 and A3 assert that a stroke on a doc-local composer
// document can be taken back; it cannot, and the fix is PARKED on a design
// question recorded in docs/reviews/2026-09-09-art-undo-path.md §4. The day that
// question is answered and the fix lands, this run goes green on its own. Row B
// (live-tile) passing is what says the instrument itself works: if B ever fails,
// suspect the harness before believing anything A says.
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
    const expectedRed = ['A2', 'A3'].filter((id) =>
      results.some((r) => r.id === id && r.ok === false));
    if (expectedRed.length) {
      console.log(`  EXPECTED RED (the finding, not a broken instrument): ${expectedRed.join(', ')} `
        + '— a doc-local composer document records no undo step. See '
        + 'docs/reviews/2026-09-09-art-undo-path.md §4 for the parked design question.');
    }
    console.log('HARNESS-END-MARKER');
  } finally {
    if (c) c.close();
    await killTree(child);
  }
}

await main();
process.exit(fails.length ? 1 : 0);
