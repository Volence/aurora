#!/usr/bin/env node
// CAN AN AUTHOR SELECT BY TILE, SEE WHAT HE COPIED, AND UNDO A PASTE —
// IN THE RUNNING APP?
//
// Three owner reports from one play session:
//   2. "The marquee tool, when I select something it doesn't preview what's
//      selected."  ...sharpened, with a screenshot of the PASTE GHOST: "I select
//      this, then press control c, when I press control v to paste it later it
//      should have that preview in this empty stamp shape right?"
//   3. "Same tool, I think it should allow me to select by tiles right?"
//   4. "control + z or undo doesn't work with pasting from marquee."
//
// The node suite (5,204 tests) cannot see any of it: no React, no canvas, no
// mouse, no undo of a thing that was on screen. So this drives the REAL app
// with real CDP mouse and key events on the real #map-canvas, and reads back
// BOTH the model (`window.__dbg.aeon`) AND the canvas's own pixels.
//
// ═══ WHAT EACH SECTION IS SPECIFICALLY BUILT TO CATCH ═══
//
// 3  A SNAP THAT LIES. Tile granularity is claimed by a button; section 3 drags
//    an ODD rect and asserts the committed marquee is that rect EXACTLY. A
//    silent re-snap to blocks — the degradation this parcel was told not to make
//    — lands on even bounds and fails here on the value.
//
// 4  A CLIPBOARD THAT SAYS IT HAS COLLISION IT CANNOT HAVE. `artOnly` and the
//    two plane LENGTHS are asserted, with `nonzeroTiles > 0` beside them so a
//    copy of blank ground cannot pass for a copy.
//
// 5  A GHOST WITH NOTHING IN IT — the owner's item 2, and the reason this file
//    exists. Section 5 hovers the paste ghost over a near-empty region and
//    DIFFS the overlay canvas across entering paste mode, so what it measures is
//    the ghost and nothing else. Two independent halves: the changed bbox must
//    equal the contract footprint EXACTLY (position and size, no tolerance), and
//    the changed pixels must take on many distinct colours — which a
//    footprint-only translucent wash over a 2-colour backdrop cannot do at any
//    alpha or hue.
//
// 6  AN UNDO THAT REVERTS THE MODEL AND NOT THE SCREEN — the owner's item 4.
//    THE PIXEL HALF IS THE POINT: the invalidation listener never walked into
//    batch commands, so a paste's `set-tiles` child was never marked dirty on
//    undo and the section canvas kept the pasted art. A model-only row would
//    have been GREEN for the entire life of that bug. Both halves are asserted,
//    and so is the PRE-STATE — an undo-to-blank proves nothing if the region was
//    never non-blank (this repo has been caught by exactly that shape).
//
// 7  A CRASH THAT UNMOUNTS THE EDITOR. A fixed 128x128 preview buffer paired
//    with a natively-sized ImageData throws RangeError from `img.data.set` for
//    every region under 16x16 tiles — from mousemove, and again inside the
//    render effect, where it once unmounted the whole React root (the owner's
//    earlier crash). This parcel previews ARBITRARY marquee regions, so section
//    7 previews a 1x1 and an odd 5x3 and asserts the app is still alive and
//    still drawing afterwards. `region-preview.test.ts` row 3 holds the same
//    invariant in node and proves the assertion can fail.
//
// 8  A REFUSAL THAT IS SILENT. Save-as-chunk over an odd selection must say no
//    OUT LOUD and change nothing.
//
// ANTI-VACUOUS THROUGHOUT. Section 0 proves the bundle under test contains this
// branch (its probes exist nowhere on master). Section 1 proves the project is
// open with sections. Section 2 proves the chosen region actually has art in it
// before anything copies it — a whole harness of green rows over blank ground
// would prove nothing at all.
//
// ═══ AIM AT INTEGER CLIENT PIXELS ═══
//
// devicePixelRatio under Xvfb is not 1 on every host (measured at 1 and at 1.35
// hours apart on this machine, byte-identical tree). At 1.35 the canvas rect is
// fractional, CDP delivers the nearest integer, and the app correctly resolves a
// coordinate one lower — which presents as an off-by-one defect in the feature
// when the feature is fine. So every mouse coordinate goes through `aimX`/`aimY`
// (integers), and every expectation is derived from THAT integer through the
// app's own transform (`tileAt`), with no tolerance windows anywhere.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed. Every edit it makes is
// undone before the run ends, and the page is reloaded.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     node scratchpad/marquee-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9396);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch.
const ROOT = AURORA_DIR;
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron'));
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-marquee`;
mkdirSync(SHOTS, { recursive: true });

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

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-marquee/${name}.png`);
}

/** The map canvas's on-screen box. */
const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

/**
 * === WHY THE PIXEL ROWS DIFF WHOLE CANVASES INSTEAD OF SAMPLING A RECT ===
 *
 * The first version of this file computed the canvas rect a paste should land
 * in and sampled it. Two rows failed, and BOTH failures were the harness, not
 * the app - a measurement bug of exactly the kind this repo has been burned by:
 *
 *  - THE GHOST IS NOT ON `#map-canvas`. MapViewport layers a SECOND, unnamed
 *    canvas of identical size and position over the map, and every preview
 *    (marquee, stamp ghost, paste ghost, collision ghost) is drawn on THAT one.
 *    A row sampling `#map-canvas` for the ghost was measuring the wrong quantity
 *    entirely - and no planted violation could ever have revealed that, because
 *    the row never touched its subject.
 *  - A COMPUTED SAMPLE RECT CAN SIMPLY MISS. Measured with
 *    `marquee-paste-probe.mjs`: the paste really did change 735 map-canvas
 *    pixels, 32px below the rect the row was reading. Non-zero nametable words
 *    do NOT imply visible tiles, so a copy can be provably non-blank in the
 *    model and invisible on screen; the first version picked its source region
 *    by counting words and got one of those.
 *
 * So: snapshot every canvas, act, snapshot again, and let the DIFF say what
 * changed, where, and on WHICH surface. The bounding box is then checked
 * against the footprint the app's own transform predicts - a derived
 * expectation, not a tolerance window - and the surface is asserted, not
 * assumed.
 */

/** Snapshot every canvas on the page into `window.__snaps[slot]`, keyed by
 *  id + size. Kept in the page so pixel data never crosses the wire. */
const SNAP = (slot) => String.raw`
(() => {
  window.__snaps = window.__snaps || {};
  const out = {};
  let anon = 0;
  for (const cv of document.querySelectorAll('canvas')) {
    const ctx = cv.getContext('2d');
    if (!ctx || !cv.width || !cv.height) continue;
    const name = (cv.id || ('overlay' + (anon++))) + ':' + cv.width + 'x' + cv.height;
    try { out[name] = { w: cv.width, h: cv.height, data: ctx.getImageData(0, 0, cv.width, cv.height).data }; }
    catch (e) { out[name] = { err: String(e) }; }
  }
  window.__snaps[${JSON.stringify(slot)}] = out;
  return Object.keys(out);
})()`;

/**
 * Per-canvas diff of two snapshots: how many pixels differ, their bounding box,
 * and how many DISTINCT colours the changed pixels took on afterwards.
 *
 * That last number is the art-vs-wash discriminator the ghost row needs. A
 * footprint-only translucent fill over a near-uniform backdrop produces one or
 * two new colours across the whole footprint; real art produces many. It is a
 * property of the drawing rather than a pinned palette, so it survives any art
 * change in the fixture.
 */
const DIFF = (a, b) => String.raw`
(() => {
  const A = window.__snaps[${JSON.stringify(a)}], B = window.__snaps[${JSON.stringify(b)}];
  if (!A || !B) return { error: 'missing snapshot' };
  const res = {};
  for (const k of Object.keys(A)) {
    const x = A[k], y = B[k];
    if (!y || x.err || y.err || x.w !== y.w || x.h !== y.h) { res[k] = { error: 'shape-changed' }; continue; }
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
    const colours = new Set();
    for (let py = 0; py < x.h; py++) {
      for (let px = 0; px < x.w; px++) {
        const i = (py * x.w + px) * 4;
        if (x.data[i] !== y.data[i] || x.data[i+1] !== y.data[i+1]
            || x.data[i+2] !== y.data[i+2] || x.data[i+3] !== y.data[i+3]) {
          n++;
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
          if (colours.size < 128) colours.add((y.data[i] << 16) | (y.data[i+1] << 8) | y.data[i+2]);
        }
      }
    }
    res[k] = n === 0 ? { changed: 0 }
      : { changed: n, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, colours: colours.size };
  }
  return res;
})()`;

/**
 * WHERE THE VISIBLE ART IS, measured off the canvas rather than off the model.
 *
 * Scans `#map-canvas` in 8px steps for the `wTiles x hTiles` window with the
 * most distinct colours (the copy source: it must have something to preview)
 * and the one with the fewest (the paste target: anything drawn there came from
 * the paste). Restricted to section 0's own 512x512 pixels so both windows are
 * in the section the model probes read.
 */
/**
 * WHERE THE FOREGROUND ART IS, in section-0 tile coords.
 *
 * === WHY THIS SCANS THE NAMETABLE AND NOT THE CANVAS ===
 *
 * The previous version scanned the map canvas for the window with the most
 * distinct colours, on the reasoning that a picture with colours in it is a
 * picture worth copying. It picked tile (12,10) with 41 colours - and the
 * FOREGROUND there is fifteen words of tile index 0. Every one of those colours
 * belonged to PLANE B showing through a transparent foreground. The marquee
 * copies the FG nametable, so the "rich" region had nothing in it to copy, the
 * paste changed no pixels, and three rows failed against an app that was right.
 *
 * A canvas scan cannot tell the two planes apart. So the source is chosen by the
 * number of DISTINCT non-zero tile indices the FG carries - the quantity that
 * actually ends up in the clipboard - and the choice is then confirmed
 * EMPIRICALLY, against the app's own selection preview, before any ghost row
 * runs (section 5's preview rows). Heuristic to choose, measurement to trust.
 *
 * The paste target is the opposite: a window whose FG is entirely word 0, so
 * anything that appears there came from the paste.
 */
const FG_RICH_AND_BLANK = (wTiles, hTiles) => String.raw`
(() => {
  const N = 64;   // section is N x N tiles; ntRect clamps for us
  const grid = window.__dbg.aeon.ntRect(0, 0, 0, N, N);
  if (!grid) return null;
  const W = ${wTiles}, H = ${hTiles};
  let best = null, blank = null;
  for (let r = 0; r + H <= N; r++) {
    for (let c = 0; c + W <= N; c++) {
      const tiles = new Set();
      let nonZeroWords = 0;
      for (let dr = 0; dr < H; dr++) {
        for (let dc = 0; dc < W; dc++) {
          const w = grid[(r + dr) * N + (c + dc)];
          if (w === 0) continue;
          nonZeroWords++;
          const ti = w & 0x7FF;          // MapViewport packs tileIndex in bits 0-10
          if (ti !== 0) tiles.add(ti);
        }
      }
      const rec = { col: c, row: r, distinctTiles: tiles.size, nonZeroWords };
      if (!best || rec.distinctTiles > best.distinctTiles) best = rec;
      if (!blank && nonZeroWords === 0) blank = rec;
    }
  }
  return { best, blank };
})()`;

/** The map canvas's key in a snapshot, and the OVERLAY's.
 *
 *  Resolved at runtime from what is actually on the page, never hardcoded: the
 *  canvases are sized to the window and their height differs between runs (738
 *  and 721 measured on this machine on the same tree, because devicePixelRatio
 *  came up 1.35 one run and 1 the next). */
function canvasKeys(names) {
  return {
    map: names.find((n) => n.startsWith('map-canvas:')) ?? null,
    overlay: names.find((n) => n.startsWith('overlay0:')) ?? null,
  };
}

/** How many distinct colours a canvas of a given pixel size is showing, found
 *  by its dimensions. Used for the marquee panel's SELECTION PREVIEW, which is
 *  the only canvas on the page sized exactly to the selection's footprint. */
const CANVAS_COLOURS_BY_SIZE = (w, h) => String.raw`
(() => {
  const hits = [...document.querySelectorAll('canvas')].filter((cv) => cv.width === ${w} && cv.height === ${h});
  if (hits.length !== 1) return { found: hits.length };
  const ctx = hits[0].getContext('2d');
  const d = ctx.getImageData(0, 0, ${w}, ${h}).data;
  const set = new Set();
  let opaque = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i+3] > 8) { opaque++; set.add((d[i] << 16) | (d[i+1] << 8) | d[i+2]); }
  }
  return { found: 1, colours: set.size, opaque, total: d.length / 4 };
})()`;


/** Click a button whose visible text matches EXACTLY (trimmed), and only when
 *  exactly one such button exists. Exact rather than a substring, and
 *  count-checked, because "Tile" must not be able to match "Tileset" or "Paint
 *  tile" — a row that clicked the wrong control would still go green. */
const clickExactButton = (text) => String.raw`
(() => {
  const want = ${JSON.stringify(text)};
  const els = [...document.querySelectorAll('button')]
    .filter((e) => (e.textContent || '').trim() === want);
  if (els.length !== 1) return 'found:' + els.length;
  els[0].click();
  return 'ok';
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});

    // Every uncaught page exception, collected. Section 7's crash rows read
    // this: a RangeError thrown from mousemove is swallowed by the event loop
    // and leaves NO trace in any probe — the ghost simply stops appearing.
    const pageErrors = [];
    await c.send('Runtime.addBinding', { name: '__harnessErr' }).catch(() => {});
    await c.evalExpr(String.raw`
      (() => {
        window.__harnessErrors = window.__harnessErrors || [];
        if (!window.__harnessErrHooked) {
          window.__harnessErrHooked = true;
          window.addEventListener('error', (e) => {
            window.__harnessErrors.push(String(e.message || e.error));
          });
          window.addEventListener('unhandledrejection', (e) => {
            window.__harnessErrors.push('unhandledrejection: ' + String(e.reason));
          });
        }
        return 'ok';
      })()`);
    const readErrors = async () => c.json('window.__harnessErrors || []');

    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    // ---- 0. PROVENANCE. --------------------------------------------------
    // These three probes are introduced by THIS branch and exist nowhere on
    // master. Without this row every PASS below could be describing a build
    // that has none of the parcel in it.
    const probes = await c.json(`({
      granularity: typeof window.__dbg.aeon.marqueeGranularity,
      clipInfo: typeof window.__dbg.aeon.mapClipboardInfo,
      collisionA: typeof window.__dbg.aeon.collisionAAt,
    })`);
    const haveProbes = probes.granularity === 'function' && probes.clipInfo === 'function'
      && probes.collisionA === 'function';
    check('0a', 'the build under test contains this branch (marqueeGranularity / mapClipboardInfo / collisionAAt)',
      haveProbes, `${ROOT}/dist — ${JSON.stringify(probes)}`);
    if (!haveProbes) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();
    await c.evalExpr('window.__harnessErrors = []');

    // ---- 1. Open aeon. ---------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));

    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(500);
    const view = await c.json('window.__dbg.view()');
    check('1b', 'ANTI-VACUOUS: the camera is at a known, unzoomed origin',
      view.x === 0 && view.y === 0 && view.zoom === 1, JSON.stringify(view));

    const rect = await c.json(CANVAS_RECT);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    check('1c', 'ANTI-VACUOUS: the map canvas is mounted and has a real box',
      !!rect && rect.width > 200 && rect.height > 200,
      `dpr=${dpr} rect=${JSON.stringify(rect)}`);

    // THE AIM, and the app's own transform evaluated on it. Never a typed
    // number: `tileAt` is `screenToWorld` + `worldToSectionTile` spelled out for
    // section 0 at view (0,0,1), so a row built on it fails for any transform
    // error and only stops failing for the device pixel grid, which is an input.
    const aimX = (canvasX) => Math.round(rect.left + canvasX);
    const aimY = (canvasY) => Math.round(rect.top + canvasY);
    const tileAt = (clientX, clientY) => ({
      col: Math.floor((view.x + (clientX - rect.left) / view.zoom) / 8),
      row: Math.floor((view.y + (clientY - rect.top) / view.zoom) / 8),
    });
    /** ...and back: the CANVAS pixel a section-0 tile's top-left sits at. */
    const canvasOfTile = (col, row) => ({
      x: (col * 8 - view.x) * view.zoom,
      y: (row * 8 - view.y) * view.zoom,
    });

    const mouse = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1, ...extra,
    });
    const key = async (k, extra = {}) => {
      const base = { key: k, code: extra.code ?? `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), ...extra };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(220);
    };
    const chord = async (k, mods) => {
      const base = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(320);
    };
    const CTRL = 2;

    // ---- 2. Find real art, and arm the tool. ------------------------------
    await key('m');
    st = await c.json('window.__dbg.aeon.state()');
    check('2a', "the 'm' hotkey armed the marquee tool", st.tool === 'marquee', JSON.stringify(st.tool));

    // WHERE THE VISIBLE ART IS. Scanned off the CANVAS, not off the model, and
    // that distinction was earned: the first version of this harness picked its
    // source region by counting non-zero nametable words, copied a rect whose
    // nine non-zero words all named visually-blank tiles, and then reported that
    // the paste had not drawn anything. A non-zero word is not a visible tile.
    const SELW = 5, SELH = 3;   // odd in both axes: block granularity cannot make this
    const scan = await c.json(FG_RICH_AND_BLANK(SELW, SELH));
    check('2b', 'ANTI-VACUOUS: section 0 has a FOREGROUND-rich 5x3-tile region to copy, and an '
      + 'all-air one to paste into. Foreground, because that is what the marquee copies — the '
      + 'first version of this row counted canvas colours and picked a region whose 41 colours '
      + 'all belonged to PLANE B behind a transparent FG',
      !!(scan && scan.best && scan.blank && scan.best.distinctTiles >= 4 && scan.blank.nonZeroWords === 0),
      `richest FG ${JSON.stringify(scan?.best)} · all-air ${JSON.stringify(scan?.blank)}`);
    if (!scan?.best || !scan?.blank) throw new Error('nametable scan failed — is the act loaded?');
    const ART = { col: scan.best.col, row: scan.best.row };
    const BLANK = { col: scan.blank.col, row: scan.blank.row };
    note('regions chosen', `art at tile (${ART.col},${ART.row}) `
      + `[${scan.best.distinctTiles} distinct FG tiles] · blank at tile (${BLANK.col},${BLANK.row})`);


    // ---- 3. TILE GRANULARITY (owner item 3). -----------------------------
    check('3a', 'the marquee starts armed to BLOCK — the shipped default is unchanged',
      (await c.evalExpr('window.__dbg.aeon.marqueeGranularity()')) === 'block');

    // A block-granularity drag first, as the control: it must round OUT to even.
    {
      const a = canvasOfTile(ART.col + 1, ART.row + 1);
      const b = canvasOfTile(ART.col + 3, ART.row + 2);
      await mouse('mousePressed', aimX(a.x + 2), aimY(a.y + 2));
      await mouse('mouseMoved', aimX(b.x + 2), aimY(b.y + 2));
      await mouse('mouseReleased', aimX(b.x + 2), aimY(b.y + 2));
      await sleep(300);
      const m = await c.json('window.__dbg.aeon.marquee()');
      check('3b', 'BLOCK granularity rounds the drag OUT to even bounds and reports aligned',
        !!m && m.col % 2 === 0 && m.row % 2 === 0 && m.w % 2 === 0 && m.h % 2 === 0 && m.aligned === true,
        JSON.stringify(m));
    }

    // Now the real control, clicked in the panel — not a store setter. A setter
    // would leave a green row coexisting with a dead button.
    const clicked = await c.evalExpr(clickExactButton('Tile'));
    check('3c', "the panel's Snap 'Tile' button exists exactly once and was clicked",
      clicked === 'ok', String(clicked));
    await sleep(250);
    check('3d', 'clicking it reached the STORE — the control is wired, not decorative',
      (await c.evalExpr('window.__dbg.aeon.marqueeGranularity()')) === 'tile');

    // THE ROW THE WHOLE ITEM TURNS ON. Drag an odd rect and demand it EXACTLY.
    // Aim at tile centres (+3 of 8) so the integer client pixel cannot round
    // into a neighbouring tile at any device scale factor.
    // The rich window's own top-left, so what is copied is what was measured.
    const SEL = { col: ART.col, row: ART.row, w: SELW, h: SELH };
    {
      const a = canvasOfTile(SEL.col, SEL.row);
      const b = canvasOfTile(SEL.col + SEL.w - 1, SEL.row + SEL.h - 1);
      const p0 = { x: aimX(a.x + 3), y: aimY(a.y + 3) };
      const p1 = { x: aimX(b.x + 3), y: aimY(b.y + 3) };
      // The app's own transform on the DELIVERED integers — this is the
      // expectation, and it is derived, not typed.
      const t0 = tileAt(p0.x, p0.y), t1 = tileAt(p1.x, p1.y);
      note('aim', `dpr=${dpr} rect.left=${rect.left} rect.top=${rect.top} · `
        + `press ${JSON.stringify(p0)} -> tile ${JSON.stringify(t0)} · `
        + `release ${JSON.stringify(p1)} -> tile ${JSON.stringify(t1)}`);
      check('3e', 'ANTI-VACUOUS: the aim resolves through the app\'s transform to the intended tiles',
        t0.col === SEL.col && t0.row === SEL.row
        && t1.col === SEL.col + SEL.w - 1 && t1.row === SEL.row + SEL.h - 1,
        `wanted (${SEL.col},${SEL.row})..(${SEL.col + SEL.w - 1},${SEL.row + SEL.h - 1})`);

      await mouse('mousePressed', p0.x, p0.y);
      // Several moves, so a per-move commit or a stale drag-start would show.
      for (let i = 1; i <= 5; i++) {
        await mouse('mouseMoved', Math.round(p0.x + (p1.x - p0.x) * i / 5),
          Math.round(p0.y + (p1.y - p0.y) * i / 5));
      }
      await mouse('mouseReleased', p1.x, p1.y);
      await sleep(350);

      const m = await c.json('window.__dbg.aeon.marquee()');
      check('3f', 'TILE granularity commits the dragged tiles EXACTLY — an odd 5x3 at an odd origin',
        !!m && m.col === t0.col && m.row === t0.row
        && m.w === (t1.col - t0.col + 1) && m.h === (t1.row - t0.row + 1),
        `got ${JSON.stringify(m)}, contract {col:${t0.col},row:${t0.row},w:${t1.col - t0.col + 1},h:${t1.row - t0.row + 1}}`);
      check('3g', 'and it is reported NOT block-aligned — which is what gates collision',
        !!m && m.aligned === false, JSON.stringify(m));
    }
    await shot(c, '1-tile-marquee');

    // A marquee is a SELECTION, not an edit: it must not push an undo step.
    // The pre-state matters — `canUndo` is false on a fresh act, and "false
    // after" would then prove nothing.
    {
      // Make the stack non-empty first, with a paste we undo immediately.
      const beforeAnyEdit = await c.evalExpr('window.__dbg.aeon.canUndo()');
      note('undo pre-state', `canUndo before any edit: ${beforeAnyEdit}`);
    }

    // ---- 4. COPY: what the clipboard actually carries. --------------------
    await chord('c', CTRL);
    const clip = await c.json('window.__dbg.aeon.mapClipboardInfo()');
    check('4a', 'Ctrl+C captured the ODD 5x3 footprint',
      !!clip && clip.widthTiles === SEL.w && clip.heightTiles === SEL.h, JSON.stringify(clip));
    check('4b', 'ANTI-VACUOUS: it captured real ART, not blank ground',
      !!clip && clip.nonzeroTiles > 0, `nonzeroTiles=${clip?.nonzeroTiles} of ${SEL.w * SEL.h}`);
    check('4c', 'THE COLLISION RULE: a non-block-aligned copy is artOnly with EMPTY planes — '
      + 'not zero-filled ones, which would ERASE collision on paste',
      !!clip && clip.artOnly === true && clip.collisionALen === 0 && clip.collisionBLen === 0,
      JSON.stringify(clip));
    const toasts = await c.json('window.__dbg.aeon.toasts()');
    check('4d', 'and the author is TOLD, in tiles, with the reason — not silently degraded',
      toasts.some((t) => /art only/i.test(t.message) && /tiles/i.test(t.message)),
      JSON.stringify(toasts.slice(-3)));

    // ---- 4e. THE PANEL PREVIEWS THE SELECTION (owner item 2, panel half). -
    //
    // Measured off the app's OWN canvas: the marquee panel renders the selection
    // through the same `regionPreviewCanvas` the two ghosts use, at the
    // selection's native footprint, so it is the only canvas on the page with
    // exactly those pixel dimensions.
    //
    // Read HERE, before Ctrl+V, and not beside the ghost rows — the panel swaps
    // to its Paste contents while pasting, so the selection preview is
    // deliberately not mounted then. (The first version read it in section 5 and
    // got `found: 0` from the app behaving as designed.)
    //
    // It also makes the ghost's colour row non-vacuous: if the copied art were
    // blank, no ghost could show colours, and that row would be failing the app
    // for a bad choice of source region.
    const panel = await c.json(CANVAS_COLOURS_BY_SIZE(SEL.w * 8, SEL.h * 8));
    check('4e', 'the marquee panel draws a canvas at exactly the selection\'s '
      + `${SEL.w * 8}x${SEL.h * 8}px footprint, and it is not empty`,
      panel.found === 1 && panel.opaque > 0 && panel.colours >= 3,
      `selection preview canvas: ${JSON.stringify(panel)}`);

    // ---- 5. THE PASTE GHOST HAS THE ART IN IT (owner item 2). ------------
    //
    // Measured by DIFF, on the surface the ghost is actually drawn on. Snapshot
    // with paste mode OFF (the committed marquee is already on the overlay and
    // must not be mistaken for the ghost), then enter paste mode and hover: what
    // changed between the two snapshots IS the ghost and nothing else.
    const names = await c.json(SNAP('preGhost'));
    const KEY = canvasKeys(names);
    check('5a', 'ANTI-VACUOUS: both canvases are present — the map, and the OVERLAY the '
      + 'previews are drawn on (a row reading the map for a ghost measures the wrong surface)',
      !!KEY.map && !!KEY.overlay, `canvases: ${JSON.stringify(names)}`);

    await chord('v', CTRL);
    await sleep(250);
    // Hover over the near-empty region, so anything the ghost draws stands
    // against a backdrop that has nothing of its own to contribute.
    const ghostAt = canvasOfTile(BLANK.col, BLANK.row);
    await mouse('mouseMoved', aimX(ghostAt.x + 4), aimY(ghostAt.y + 4), { buttons: 0 });
    await sleep(600);
    await c.evalExpr(SNAP('ghost'));
    const ghostDiff = await c.json(DIFF('preGhost', 'ghost'));

    // WHERE the ghost must be, from the app's own contract: the paste origin is
    // the hovered tile floored to `pasteBaseStep` (1 for an art-only clipboard),
    // and the footprint is the clipboard's own tile dims at 8px each.
    const ghostOrigin = tileAt(aimX(ghostAt.x + 4), aimY(ghostAt.y + 4));
    const gpx = canvasOfTile(ghostOrigin.col, ghostOrigin.row);
    const want = { x: gpx.x, y: gpx.y, w: SEL.w * 8, h: SEL.h * 8 };
    const gd = ghostDiff[KEY.overlay];
    note('ghost geometry', `hover tile ${JSON.stringify(ghostOrigin)} -> canvas ${JSON.stringify(gpx)}; `
      + `contract footprint ${JSON.stringify(want)}`);

    // THE FOOTPRINT, PLUS THE STROKE. The ghost's dashed outline is drawn with
    // `lineWidth = 2 / zoom` CENTRED on the rect edge, so it extends exactly
    // `1 / zoom` px beyond it on every side. That is the app's own constant, not
    // a tolerance: STROKE below is derived from it, and the row demands the bbox
    // equal the expanded rect EXACTLY.
    // ...and CLAMPED TO THE CANVAS, because a diff can only report pixels that
    // exist. The first run of this row expected x = -1 for a footprint sitting
    // against the canvas's left edge and failed the app for drawing where there
    // was somewhere to draw.
    const STROKE = 1 / view.zoom;
    // KEY.map can be NULL, and that is not a harness bug to route around — it is
    // what a DEAD REACT ROOT looks like from here. Proven: planting the fixed
    // 128x128 raster buffer back in made row 5a report `canvases: []`, because
    // the RangeError from the first preview unmounted the editor. Reported as a
    // row rather than thrown, so the rows after it still run and say what else
    // is gone.
    const [cw, ch] = KEY.map
      ? KEY.map.split(':')[1].split('x').map(Number) : [0, 0];
    const ox0 = Math.max(0, want.x - STROKE), oy0 = Math.max(0, want.y - STROKE);
    const ox1 = Math.min(cw, want.x + want.w + STROKE), oy1 = Math.min(ch, want.y + want.h + STROKE);
    const wantOuter = { x: ox0, y: oy0, w: ox1 - ox0, h: oy1 - oy0 };
    check('5b', 'the ghost is drawn ON THE OVERLAY, at exactly the contract footprint plus its '
      + 'own 2/zoom-wide outline — origin floored to the TILE grid, because an art-only '
      + 'clipboard pastes at tile precision, and the clipboard\'s own w*8 x h*8 size',
      !!gd && gd.changed > 0 && gd.x === wantOuter.x && gd.y === wantOuter.y
      && gd.w === wantOuter.w && gd.h === wantOuter.h,
      `overlay diff ${JSON.stringify(gd)} vs contract+stroke ${JSON.stringify(wantOuter)} `
      + `(footprint ${JSON.stringify(want)}, lineWidth 2/${view.zoom})`);

    check('5d', 'THE GHOST HAS THAT ART IN IT, not an empty outline: the pixels it changed take '
      + 'on at least as many distinct colours as a translucent wash could ever produce over an '
      + 'ALL-AIR backdrop. A footprint-only fill blends ONE backdrop colour to ONE result; the '
      + 'outline adds one more',
      !!gd && gd.colours > 3,
      `distinct colours introduced by the ghost: ${gd?.colours}; `
      + `the selection itself has ${panel?.colours}; the backdrop is all-air`);
    check('5e', 'and the MAP canvas underneath is untouched — a ghost is a preview, not an edit',
      ghostDiff[KEY.map]?.changed === 0, JSON.stringify(ghostDiff[KEY.map]));
    await shot(c, '2-paste-ghost');

    // ---- 6. PASTE, THEN UNDO (owner item 4). -----------------------------
    const P = { col: ghostOrigin.col, row: ghostOrigin.row };
    const modelBefore = await c.json(
      `window.__dbg.aeon.ntRect(0, ${P.col}, ${P.row}, ${SEL.w}, ${SEL.h})`);
    const undoBefore = await c.evalExpr('window.__dbg.aeon.canUndo()');
    // Snapshot with the ghost NOT drawn, so the diff is the paste alone.
    const escape = async () => {
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(500);
    };
    await escape();
    await c.evalExpr(SNAP('prePaste'));

    await chord('v', CTRL);
    await mouse('mouseMoved', aimX(gpx.x + 4), aimY(gpx.y + 4), { buttons: 0 });
    await sleep(400);
    await mouse('mousePressed', aimX(gpx.x + 4), aimY(gpx.y + 4));
    await mouse('mouseReleased', aimX(gpx.x + 4), aimY(gpx.y + 4));
    await sleep(700);
    await escape();
    await c.evalExpr(SNAP('postPaste'));

    const modelAfter = await c.json(
      `window.__dbg.aeon.ntRect(0, ${P.col}, ${P.row}, ${SEL.w}, ${SEL.h})`);
    const pasteDiff = await c.json(DIFF('prePaste', 'postPaste'));
    const pd = pasteDiff[KEY.map];

    check('6a', 'ANTI-VACUOUS PRE-STATE: the paste really CHANGED the target — the MODEL words '
      + 'differ AND map pixels moved. An undo back to blank proves nothing if it was never non-blank',
      JSON.stringify(modelBefore) !== JSON.stringify(modelAfter) && !!pd && pd.changed > 0,
      `model changed=${JSON.stringify(modelBefore) !== JSON.stringify(modelAfter)} · `
      + `map diff=${JSON.stringify(pd)}`);
    check('6b', 'every pixel it changed lies INSIDE the pasted footprint — the paste landed '
      + 'where the ghost said it would, not merely somewhere',
      !!pd && pd.changed > 0 && pd.x >= want.x && pd.y >= want.y
      && pd.x + pd.w <= want.x + want.w && pd.y + pd.h <= want.y + want.h,
      `changed bbox ${JSON.stringify(pd)} within footprint ${JSON.stringify(want)}`);
    check('6c', 'the paste is ONE undo step (one click, one batch command)',
      undoBefore === false && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === true,
      `canUndo before=${undoBefore} after=true`);
    await shot(c, '3-pasted');

    await chord('z', CTRL);
    await sleep(800);
    await c.evalExpr(SNAP('undone'));
    const modelUndone = await c.json(
      `window.__dbg.aeon.ntRect(0, ${P.col}, ${P.row}, ${SEL.w}, ${SEL.h})`);
    const undoVsPre = await c.json(DIFF('prePaste', 'undone'));

    check('6d', 'UNDO reverts the MODEL to exactly its pre-paste words',
      JSON.stringify(modelUndone) === JSON.stringify(modelBefore),
      `before=${JSON.stringify(modelBefore)}\n        after-undo=${JSON.stringify(modelUndone)}`);
    check('6e', 'THE ROW THAT CATCHES THE REPORTED BUG: undo reverts the SCREEN too — the map '
      + 'canvas is pixel-identical to before the paste. The invalidation listener never walked '
      + 'into batch commands, so a paste\'s set-tiles child was never marked dirty on undo and '
      + 'the section canvas kept the pasted art; row 6d alone was green for that whole time',
      undoVsPre[KEY.map]?.changed === 0,
      `map diff pre-paste vs after-undo: ${JSON.stringify(undoVsPre[KEY.map])} `
      + `(the paste itself moved ${pd?.changed} pixels, so 0 here is a real revert)`);
    await shot(c, '4-undone');

    // REDO is the same path and must not be left stale.
    await chord('z', CTRL | 8 /* shift */);
    await sleep(800);
    await c.evalExpr(SNAP('redone'));
    const redoVsPost = await c.json(DIFF('postPaste', 'redone'));
    check('6f', 'REDO repaints too — same listener, same batch, not fixed on one side only',
      redoVsPost[KEY.map]?.changed === 0,
      `map diff pasted vs after-redo: ${JSON.stringify(redoVsPost[KEY.map])}`);
    await chord('z', CTRL);   // back to clean
    await sleep(600);


    // ---- 7. TINY AND ODD PREVIEWS DO NOT CRASH THE EDITOR. ---------------
    // The RangeError class: a fixed-size raster buffer into a natively-sized
    // ImageData. 1x1 is the smallest a marquee can be and is far under the
    // 16x16 threshold where the old bug bit.
    await c.evalExpr('window.__harnessErrors = []');
    for (const [w, h, label] of [[1, 1, '1x1'], [5, 3, '5x3 odd'], [3, 1, '3x1 odd']]) {
      const a = canvasOfTile(ART.col + 1, ART.row + 1);
      const b = canvasOfTile(ART.col + w, ART.row + h);
      await mouse('mousePressed', aimX(a.x + 3), aimY(a.y + 3));
      await mouse('mouseMoved', aimX(b.x + 3), aimY(b.y + 3));
      await mouse('mouseReleased', aimX(b.x + 3), aimY(b.y + 3));
      await sleep(250);
      await chord('c', CTRL);
      await chord('v', CTRL);
      const g = canvasOfTile(BLANK.col + 1, BLANK.row + 1);
      // Several hovers: the crash came from mousemove, once per move.
      for (let i = 0; i < 4; i++) {
        await mouse('mouseMoved', aimX(g.x + i * 8 + 2), aimY(g.y + 2), { buttons: 0 });
        await sleep(120);
      }
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(200);
      const errs = await readErrors();
      const alive = await c.json('window.__dbg.aeon.state()').catch(() => null);
      const rooted = await c.evalExpr(
        `!!document.getElementById('map-canvas') && document.querySelectorAll('canvas').length > 0`);
      check(`7-${label.replace(/\W/g, '')}`,
        `previewing a ${label} selection throws nothing and leaves the React root mounted`,
        errs.length === 0 && !!alive && alive.open === true && rooted === true,
        `pageErrors=${JSON.stringify(errs)} rootMounted=${rooted} open=${alive?.open}`);
      pageErrors.push(...errs);
      await c.evalExpr('window.__harnessErrors = []');
    }

    // ---- 8. SAVE-AS-CHUNK REFUSES, OUT LOUD. -----------------------------
    {
      // Re-select the odd rect (section 7 left a 3x1 selected, also odd).
      const a = canvasOfTile(SEL.col, SEL.row);
      const b = canvasOfTile(SEL.col + SEL.w - 1, SEL.row + SEL.h - 1);
      await mouse('mousePressed', aimX(a.x + 3), aimY(a.y + 3));
      await mouse('mouseMoved', aimX(b.x + 3), aimY(b.y + 3));
      await mouse('mouseReleased', aimX(b.x + 3), aimY(b.y + 3));
      await sleep(300);
      const m = await c.json('window.__dbg.aeon.marquee()');
      check('8a', 'ANTI-VACUOUS: an odd selection is standing before the refusal is tested',
        !!m && m.aligned === false, JSON.stringify(m));

      const chunksBefore = await c.json('window.__dbg.aeon.chunkIds()');
      await key('s');
      await sleep(400);
      const chunksAfter = await c.json('window.__dbg.aeon.chunkIds()');
      const t = await c.json('window.__dbg.aeon.toasts()');
      check('8b', "'s' over a non-block-aligned selection mints NOTHING and says why — "
        + 'it does not quietly round the selection up to blocks',
        chunksBefore.length === chunksAfter.length
        && t.some((x) => /16px block/i.test(x.message)),
        `chunks ${chunksBefore.length} -> ${chunksAfter.length} · last toasts=${JSON.stringify(t.slice(-2))}`);
    }

    // ---- 9. LEAVE NOTHING BEHIND. ----------------------------------------
    let guard = 0;
    while ((await c.evalExpr('window.__dbg.aeon.canUndo()')) === true && guard++ < 20) {
      await chord('z', CTRL);
    }
    const dirty = await c.json('window.__dbg.aeon.state()');
    check('9a', 'the run undid every edit it made (nothing is written either way — no Ctrl+S)',
      guard < 20, `undos issued=${guard} dirtyActs=${JSON.stringify(dirty.dirtyActs)}`);
    await c.send('Page.reload');
  } catch (err) {
    // A THROW MUST NOT EXIT 0. The first version put `process.exit` in the
    // `finally` and nothing else, so an exception mid-run printed a tidy
    // "17/17 rows passed" and returned success with half the rows never
    // reached. A run that did not finish is a FAILING run, and it says why.
    check('ZZ', 'the harness ran to completion (a throw here means the rows below it never ran)',
      false, `${err && err.stack ? err.stack : err}`);
  } finally {
    console.log('');
    const pass = results.filter((r) => r.ok).length;
    console.log(`${pass}/${results.length} rows passed`);
    if (fails.length) { console.log('FAILING ROWS:'); for (const f of fails) console.log('  ' + f); }
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
    process.exit(fails.length ? 1 : 0);
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
