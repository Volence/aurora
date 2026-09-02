#!/usr/bin/env node
// CAN AN AUTHOR MIRROR A SELECTION — AND DOES THE PICTURE ACTUALLY MIRROR?
//
// The owner: *"if I have something selected with marquee, because flip is free,
// how do I actually flip it?"* — then *"Yes I'd like the marquee flip built
// please"*. Built at BOTH moments (the pending clipboard in paste mode, and a
// committed marquee in place), on one transform.
//
// The ~5,400-test node suite cannot see React, a canvas, or a keystroke. So
// this drives the REAL app with real CDP mouse and key events on the real
// `#map-canvas` and reads back BOTH the model (`window.__dbg.aeon`) AND the
// canvas's own pixels.
//
// ═══ WHAT EACH SECTION IS SPECIFICALLY BUILT TO CATCH ═══
//
// THE DEFECT THIS PARCEL EXISTS TO AVOID IS A HALF-TRANSFORM. Mirroring a
// region means BOTH reversing the order of the words along the axis AND
// toggling each word's own flip bit. Reverse-only puts every tile in the right
// PLACE drawn the wrong way round; toggle-only mirrors every tile WHERE IT
// STANDS. Both look nearly right on symmetric art, which is most of a tiled
// background — so every model row here compares against the TWO-PART transform
// computed in this file from masks PARSED OUT OF THE TWO CODECS' SOURCE, and
// section 5 asserts the drawn PIXELS are a mirror, which neither half can fake.
//
// 3  THE KEY IS UNLISTED. An unlisted key is an undiscoverable feature (this
//    repo's recurring complaint), so the paste panel's own hint line is read
//    from the live DOM in BOTH of its states.
//
// 4  IN-PLACE FLIP. Model + pixels + ONE undo entry. The undo row is not
//    decoration: the batch-command repaint defect fixed on 2026-08-28
//    (`notifyCommandApplied` not walking into batches) is exactly this shape,
//    and a model-only row would have been green through its entire life.
//
// 5  THE PICTURE, AND THE MONEY ROW. The clipboard is pasted twice into blank
//    ground — once as copied, once flipped — so the two land SIDE BY SIDE. The
//    combined 2W-wide window must then be its own left-right mirror, asserted
//    on the MODEL (word-for-word, through the parsed masks) and on the CANVAS
//    (pixel-for-pixel, exact, no tolerance). A reverse-only flip fails the pixel
//    half while passing nothing; a toggle-only flip fails both.
//
// 6  GRANULARITY IS NOT SILENTLY CHANGED. An odd (art-only) selection flips art
//    and leaves collision EXACTLY as it was — asserted with a companion row
//    proving the art really moved, so "collision untouched" is not "nothing
//    happened".
//
// ANTI-VACUOUS THROUGHOUT. Section 0 proves the bundle under test contains this
// branch. Section 2 proves the chosen region has real foreground art AND real
// authored collision before anything flips it.
//
// ⚠ AIM AT INTEGER CLIENT PIXELS. devicePixelRatio under Xvfb is not 1 on every
// host here (measured at 1 and at 1.35 hours apart on a byte-identical tree).
// Every mouse coordinate goes through `aimX`/`aimY` and every expectation is
// derived from THAT integer through the app's own transform. dpr, rect and aim
// are printed.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed; every edit is undone.
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:marquee-flip

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = process.env.AURORA_ROOT
  ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron'));
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-marquee-flip`;
mkdirSync(SHOTS, { recursive: true });

// ═══ THE MASKS, PARSED OUT OF THE TWO CODECS' SOURCE ═══
//
// NOT out of `region-flip.ts` — that is the thing under test, and an
// expectation read from it would be self-consistent by construction. These come
// from `packNametableWord` and `packCollisionCell` themselves, which is a third
// independent derivation (the node suite's row 1 pins the module's own derived
// masks against the two DECODERS; this pins the harness's against the two
// ENCODERS). The derivation is printed by row 0b.
function parseMasks() {
  const nt = readFileSync(`${ROOT}/src/core/model/s4-types.ts`, 'utf8');
  const cw = readFileSync(`${ROOT}/src/core/collision/collision-cell-word.ts`, 'utf8');
  const g = (src, re, label) => {
    const m = src.match(re);
    if (!m) throw new Error(`could not parse ${label} out of source — the codec changed shape`);
    return m[1];
  };
  const ntH = 1 << Number(g(nt, /\(\(hFlip \? 1 : 0\) << (\d+)\)/, 'nametable hFlip shift'));
  const ntV = 1 << Number(g(nt, /\(\(vFlip \? 1 : 0\) << (\d+)\)/, 'nametable vFlip shift'));
  const collX = Number(g(cw, /c\.xFlip \? (0x[0-9A-Fa-f]+) : 0/, 'collision xFlip mask'));
  const collY = Number(g(cw, /c\.yFlip \? (0x[0-9A-Fa-f]+) : 0/, 'collision yFlip mask'));
  const collShape = Number(g(cw, /\(c\.shape & (0x[0-9A-Fa-f]+)\)/, 'collision shape mask'));
  return { ntH, ntV, collX, collY, collShape };
}
const MASK = parseMasks();

/** THE TWO-PART TRANSFORM, spelled out here independently of the app. */
function flipRegion(words, w, h, axis, kind) {
  const out = new Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const sr = axis === 'v' ? h - 1 - r : r;         // half one: reverse
      const sc = axis === 'h' ? w - 1 - c : c;
      const word = words[sr * w + sc];
      out[r * w + c] = kind === 'art'                   // half two: toggle
        ? (word ^ (axis === 'h' ? MASK.ntH : MASK.ntV))
        : ((word & MASK.collShape) === 0 ? word
          : (word ^ (axis === 'h' ? MASK.collX : MASK.collY)));
    }
  }
  return out;
}
/** THE HALF-TRANSFORMS, so a green row can be asked what else could have
 *  produced it. Never used as an expectation — only to prove the expectation
 *  discriminates. */
function reverseOnly(words, w, h, axis) {
  const out = new Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    out[r * w + c] = words[(axis === 'v' ? h - 1 - r : r) * w + (axis === 'h' ? w - 1 - c : c)];
  }
  return out;
}
function toggleOnly(words, axis, kind) {
  return words.map((word) => (kind === 'art'
    ? (word ^ (axis === 'h' ? MASK.ntH : MASK.ntV))
    : ((word & MASK.collShape) === 0 ? word : (word ^ (axis === 'h' ? MASK.collX : MASK.collY)))));
}

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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-marquee-flip/${name}.png`);
}

const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

/** Snapshot every canvas into `window.__snaps[slot]` (marquee-harness's shape:
 *  the ghost is on a SECOND, unnamed overlay canvas, so a row that reads
 *  `#map-canvas` for a preview is measuring the wrong surface entirely). */
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

const DIFF = (a, b) => String.raw`
(() => {
  const A = window.__snaps[${JSON.stringify(a)}], B = window.__snaps[${JSON.stringify(b)}];
  if (!A || !B) return { error: 'missing snapshot' };
  const res = {};
  for (const k of Object.keys(A)) {
    const x = A[k], y = B[k];
    if (!y || x.err || y.err || x.w !== y.w || x.h !== y.h) { res[k] = { error: 'shape-changed' }; continue; }
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
    for (let py = 0; py < x.h; py++) {
      for (let px = 0; px < x.w; px++) {
        const i = (py * x.w + px) * 4;
        if (x.data[i] !== y.data[i] || x.data[i+1] !== y.data[i+1]
            || x.data[i+2] !== y.data[i+2] || x.data[i+3] !== y.data[i+3]) {
          n++;
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
      }
    }
    res[k] = n === 0 ? { changed: 0 }
      : { changed: n, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  return res;
})()`;

/**
 * IS THIS CANVAS WINDOW ITS OWN LEFT-RIGHT MIRROR? Exact, per RGBA byte.
 *
 * The money measurement. It is a property of the DRAWN PIXELS, so no half of
 * the transform can produce it: reverse-only leaves every tile drawn the wrong
 * way round (the window's halves are equal, not mirrored), toggle-only leaves
 * the halves neither. Reported as counts, not a boolean, so a failure says how
 * close it got — and `distinct` is the anti-vacuous companion: a window of
 * uniform colour is trivially symmetric.
 */
const MIRROR_H = (x, y, w, h) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return { error: 'no map canvas' };
  const d = cv.getContext('2d').getImageData(${x}, ${y}, ${w}, ${h}).data;
  let same = 0, diff = 0;
  const colours = new Set();
  const where = [];
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let py = 0; py < ${h}; py++) {
    for (let px = 0; px < ${w}; px++) {
      const i = (py * ${w} + px) * 4;
      const j = (py * ${w} + (${w} - 1 - px)) * 4;
      const ok = d[i] === d[j] && d[i+1] === d[j+1] && d[i+2] === d[j+2] && d[i+3] === d[j+3];
      if (ok) same++;
      else {
        diff++;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        if (where.length < 6) where.push([px, py, (d[i]<<16)|(d[i+1]<<8)|d[i+2], (d[j]<<16)|(d[j+1]<<8)|d[j+2]]);
      }
      if (colours.size < 64) colours.add((d[i] << 16) | (d[i+1] << 8) | d[i+2]);
    }
  }
  return { same, diff, total: ${w} * ${h}, distinct: colours.size,
    box: diff ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null, where };
})()`;

/**
 * A CRISP CROP OF THE MAP CANVAS, for the owner's display.
 *
 * Nearest-neighbour upscaled IN THE PAGE rather than by `Page.captureScreenshot`
 * with a `clip`+`scale`: that path re-rasterises the page and resamples the
 * canvas smoothly, which turns 8x8 pixel art into mush. `imageSmoothingEnabled
 * = false` on a local 2D context is the only way to enlarge this content and
 * still be showing what the engine will show.
 */
const CROP = (x, y, w, h, scale) => String.raw`
(() => {
  const src = document.getElementById('map-canvas');
  if (!src) return null;
  const out = document.createElement('canvas');
  out.width = ${w} * ${scale}; out.height = ${h} * ${scale};
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, ${x}, ${y}, ${w}, ${h}, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
})()`;

/** WHERE THE FOREGROUND ART IS, in section-0 tile coords — BLOCK-ALIGNED, and
 *  with authored collision under it. A canvas scan cannot tell plane A from
 *  plane B (marquee-harness learned that the hard way: it picked a window whose
 *  41 colours all belonged to the BACKGROUND behind a transparent foreground),
 *  so the source is chosen by DISTINCT NON-ZERO FG TILE INDICES — the quantity
 *  that ends up in the clipboard. Also required: the tiles must not already be
 *  a left-right mirror of themselves, or every row below is vacuous. */
const FG_RICH_AND_BLANK = (wTiles, hTiles, blankW) => String.raw`
(() => {
  const N = 64;
  const grid = window.__dbg.aeon.ntRect(0, 0, 0, N, N);
  if (!grid) return null;
  const W = ${wTiles}, H = ${hTiles}, BW = ${blankW};
  let best = null, blank = null;
  for (let r = 0; r + H <= N; r += 2) {
    for (let c = 0; c + W <= N; c += 2) {
      const tiles = new Set();
      let nonZeroWords = 0;
      for (let dr = 0; dr < H; dr++) for (let dc = 0; dc < W; dc++) {
        const w = grid[(r + dr) * N + (c + dc)];
        if (w === 0) continue;
        nonZeroWords++;
        const ti = w & 0x7FF;
        if (ti !== 0) tiles.add(ti);
      }
      // Not already symmetric: at least one word differs from its mirror
      // partner's tile index, so a flip has something visible to do.
      let asym = 0;
      for (let dr = 0; dr < H; dr++) for (let dc = 0; dc < W; dc++) {
        if ((grid[(r + dr) * N + (c + dc)] & 0x7FF) !== (grid[(r + dr) * N + (c + W - 1 - dc)] & 0x7FF)) asym++;
      }
      const rec = { col: c, row: r, distinctTiles: tiles.size, nonZeroWords, asym };
      if (rec.asym > 0 && (!best || rec.distinctTiles > best.distinctTiles)) best = rec;
    }
  }
  // A blank landing strip WIDE ENOUGH FOR TWO copies side by side, and AWAY
  // FROM THE SECTION'S OWN LEFT/RIGHT EDGE. Measured, not guessed: the first
  // run of the pixel-mirror row landed the pair at col 0 and reported exactly
  // 64 mismatching pixels — columns x=0 and x=63 of a 64x32 window, i.e. the
  // section OUTLINE the renderer draws down the section's left edge, which has
  // no partner on the interior side. The art mirrored perfectly; the instrument
  // was reading a border into the measurement.
  for (let r = 0; r + H <= N && !blank; r += 2) {
    for (let c = 2; c + BW <= N - 2 && !blank; c += 2) {
      let nz = 0;
      for (let dr = 0; dr < H; dr++) for (let dc = 0; dc < BW; dc++) if (grid[(r + dr) * N + (c + dc)] !== 0) nz++;
      if (nz === 0) blank = { col: c, row: r };
    }
  }
  return { best, blank };
})()`;

/** The hint line the marquee/paste panel prints, read from the LIVE DOM. */
const PANEL_HINT = String.raw`
(() => {
  const hits = [...document.querySelectorAll('div')]
    .map((e) => (e.textContent || '').trim())
    .filter((t) => /Ctrl\+C copy|Click to paste/.test(t) && t.length < 260);
  return hits.length ? hits[hits.length - 1] : null;
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
    await c.evalExpr(String.raw`
      (() => {
        window.__harnessErrors = window.__harnessErrors || [];
        if (!window.__harnessErrHooked) {
          window.__harnessErrHooked = true;
          window.addEventListener('error', (e) => window.__harnessErrors.push(String(e.message || e.error)));
          window.addEventListener('unhandledrejection', (e) => window.__harnessErrors.push('rej: ' + String(e.reason)));
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

    // ---- 0. PROVENANCE + THE DERIVATION. ---------------------------------
    const probes = await c.json(`({
      clipWords: typeof window.__dbg.aeon.mapClipboardWords,
      collRect: typeof window.__dbg.aeon.collRect,
      ntRect: typeof window.__dbg.aeon.ntRect,
    })`);
    const haveProbes = probes.clipWords === 'function' && probes.collRect === 'function'
      && probes.ntRect === 'function';
    check('0a', 'the build under test contains this branch (mapClipboardWords / collRect)',
      haveProbes, `${ROOT}/dist — ${JSON.stringify(probes)}`);
    if (!haveProbes) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    // THE DERIVATION, SHOWN. Masks parsed out of the two CODECS, never out of
    // the module under test. Row 0b also names the trap: the two layouts share
    // exactly one bit position, and crossing them yields plausible output.
    check('0b', 'the two word layouts are parsed out of their own codecs and are NOT the same — '
      + 'nametable hFlip/vFlip sit one bit ABOVE collision xFlip/yFlip, so the art masks and '
      + 'the collision masks overlap in exactly one position',
      MASK.ntH === MASK.collX * 2 && MASK.ntV === MASK.collY * 2
      && MASK.ntH === MASK.collY && (MASK.ntH & MASK.collX) === 0,
      `parsed from src/core/model/s4-types.ts and src/core/collision/collision-cell-word.ts: `
      + `ntH=0x${MASK.ntH.toString(16)} ntV=0x${MASK.ntV.toString(16)} `
      + `collX=0x${MASK.collX.toString(16)} collY=0x${MASK.collY.toString(16)} `
      + `collShape=0x${MASK.collShape.toString(16)}`);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();
    await c.evalExpr('window.__harnessErrors = []');

    // ---- 1. Open aeon, park the camera. ----------------------------------
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
    check('1b', 'ANTI-VACUOUS: the camera is at a known, unzoomed origin — one canvas pixel '
      + 'is one world pixel, which is what licenses the pixel-mirror rows',
      view.x === 0 && view.y === 0 && view.zoom === 1, JSON.stringify(view));

    const rect = await c.json(CANVAS_RECT);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    check('1c', 'ANTI-VACUOUS: the map canvas is mounted and has a real box',
      !!rect && rect.width > 200 && rect.height > 200,
      `dpr=${dpr} rect=${JSON.stringify(rect)}`);

    const aimX = (canvasX) => Math.round(rect.left + canvasX);
    const aimY = (canvasY) => Math.round(rect.top + canvasY);
    const tileAt = (clientX, clientY) => ({
      col: Math.floor((view.x + (clientX - rect.left) / view.zoom) / 8),
      row: Math.floor((view.y + (clientY - rect.top) / view.zoom) / 8),
    });
    const canvasOfTile = (col, row) => ({
      x: (col * 8 - view.x) * view.zoom, y: (row * 8 - view.y) * view.zoom,
    });

    const mouse = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1, ...extra,
    });
    const key = async (k, extra = {}) => {
      const base = {
        key: k, code: extra.code ?? `Key${k.toUpperCase()}`,
        windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), ...extra,
      };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(320);
    };
    const chord = async (k, mods) => {
      const base = {
        key: k, code: `Key${k.toUpperCase()}`,
        windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods,
      };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(360);
    };
    const escape = async () => {
      for (const type of ['keyDown', 'keyUp']) {
        await c.send('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      }
      await sleep(450);
    };
    const CTRL = 2;
    const dragSelect = async (col, row, w, h) => {
      const a = canvasOfTile(col, row), b = canvasOfTile(col + w - 1, row + h - 1);
      const p0 = { x: aimX(a.x + 3), y: aimY(a.y + 3) };
      const p1 = { x: aimX(b.x + 3), y: aimY(b.y + 3) };
      await mouse('mousePressed', p0.x, p0.y);
      for (let i = 1; i <= 4; i++) {
        await mouse('mouseMoved', Math.round(p0.x + (p1.x - p0.x) * i / 4),
          Math.round(p0.y + (p1.y - p0.y) * i / 4));
      }
      await mouse('mouseReleased', p1.x, p1.y);
      await sleep(350);
      return { p0, p1, t0: tileAt(p0.x, p0.y), t1: tileAt(p1.x, p1.y) };
    };

    // ---- 2. Find asymmetric art with collision under it. -----------------
    await key('m');
    st = await c.json('window.__dbg.aeon.state()');
    check('2a', "the 'm' hotkey armed the marquee tool", st.tool === 'marquee', JSON.stringify(st.tool));

    const SELW = 4, SELH = 4;
    const scan = await c.json(FG_RICH_AND_BLANK(SELW, SELH, SELW * 2));
    check('2b', `ANTI-VACUOUS: section 0 has a block-aligned ${SELW}x${SELH}-tile region whose `
      + 'FOREGROUND is rich AND NOT already its own left-right mirror, plus an all-air strip '
      + `${SELW * 2} tiles wide to land two copies side by side`,
      !!(scan?.best && scan?.blank && scan.best.distinctTiles >= 4 && scan.best.asym > 0),
      `richest asymmetric FG ${JSON.stringify(scan?.best)} · blank strip ${JSON.stringify(scan?.blank)}`);
    if (!scan?.best || !scan?.blank) throw new Error('nametable scan failed — is the act loaded?');
    const ART = { col: scan.best.col, row: scan.best.row };
    const BLANK = { col: scan.blank.col, row: scan.blank.row };
    note('regions chosen', `art at tile (${ART.col},${ART.row}) `
      + `[${scan.best.distinctTiles} distinct FG tiles, ${scan.best.asym} asymmetric words] · `
      + `blank strip at (${BLANK.col},${BLANK.row})`);

    // ---- 3. THE PANEL NAMES THE KEY, IN BOTH ITS STATES. ------------------
    // An unlisted key is an undiscoverable feature. Read from the live DOM,
    // never from a constant in the source.
    await dragSelect(ART.col, ART.row, SELW, SELH);
    const hintSel = await c.evalExpr(PANEL_HINT);
    check('3a', "with a selection standing, the panel's own hint line names BOTH flip keys "
      + 'and which way each mirrors',
      typeof hintSel === 'string' && /X flips/.test(hintSel) && /Y top/.test(hintSel)
      && /left/.test(hintSel), JSON.stringify(hintSel));
    await chord('c', CTRL);
    await chord('v', CTRL);
    await sleep(300);
    const hintPaste = await c.evalExpr(PANEL_HINT);
    check('3b', 'and in PASTE mode it names them too, beside the modifiers that were already '
      + 'listed there — the same two letters mean the same mirror at both moments',
      typeof hintPaste === 'string' && /X flips/.test(hintPaste) && /Y top/.test(hintPaste)
      && /Alt for art only/.test(hintPaste), JSON.stringify(hintPaste));
    check('3c', 'ANTI-VACUOUS: the two hint states are DIFFERENT strings, so 3a and 3b are not '
      + 'both reading one static line',
      hintSel !== hintPaste, `sel=${JSON.stringify(hintSel)}\n        paste=${JSON.stringify(hintPaste)}`);
    await escape();

    // ---- 4. IN-PLACE FLIP: model, pixels, one undo. ----------------------
    await dragSelect(ART.col, ART.row, SELW, SELH);
    let m = await c.json('window.__dbg.aeon.marquee()');
    check('4a', 'ANTI-VACUOUS: a block-aligned marquee is standing over the chosen art',
      !!m && m.col === ART.col && m.row === ART.row && m.w === SELW && m.h === SELH
      && m.aligned === true, JSON.stringify(m));

    const ntBefore = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    const collBeforeA = await c.json(`window.__dbg.aeon.collRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH}, 'a')`);
    const undoBefore = await c.evalExpr('window.__dbg.aeon.canUndo()');
    await c.evalExpr(SNAP('preFlip'));

    await key('x');
    const ntAfter = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    const collAfterA = await c.json(`window.__dbg.aeon.collRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH}, 'a')`);
    await c.evalExpr(SNAP('postFlip'));
    const flipDiff = await c.json(DIFF('preFlip', 'postFlip'));
    const names = await c.json(SNAP('postFlip2'));
    const MAPKEY = names.find((n) => n.startsWith('map-canvas:')) ?? null;

    const wantNt = flipRegion(ntBefore, SELW, SELH, 'h', 'art');
    check('4b', 'THE TWO-PART TRANSFORM, on the MODEL: every word came from the mirrored column '
      + 'AND had its own hFlip bit toggled. Expectation computed here from masks parsed out of '
      + 'the CODECS, not from the module under test',
      eq(ntAfter, wantNt),
      `before=${JSON.stringify(ntBefore)}\n        after =${JSON.stringify(ntAfter)}`
      + `\n        want  =${JSON.stringify(wantNt)}`);
    check('4c', 'NEITHER HALF ALONE WOULD HAVE PRODUCED IT — the result differs from '
      + 'reverse-only AND from toggle-only, on this region',
      !eq(ntAfter, reverseOnly(ntBefore, SELW, SELH, 'h'))
      && !eq(ntAfter, toggleOnly(ntBefore, 'h', 'art'))
      && !eq(ntAfter, ntBefore),
      `reverse-only=${JSON.stringify(reverseOnly(ntBefore, SELW, SELH, 'h'))}`
      + `\n        toggle-only =${JSON.stringify(toggleOnly(ntBefore, 'h', 'art'))}`);

    // COLLISION. Tile-resolution words, so a cell that was written
    // non-uniformly across its four tiles is visible rather than averaged away.
    const cellsW = SELW >> 1, cellsH = SELH >> 1;
    const cellsOf = (tileWords) => {
      const out = [];
      for (let cy = 0; cy < cellsH; cy++) for (let cx = 0; cx < cellsW; cx++) out.push(tileWords[(cy * 2) * SELW + cx * 2]);
      return out;
    };
    const uniform = (tileWords) => {
      for (let cy = 0; cy < cellsH; cy++) for (let cx = 0; cx < cellsW; cx++) {
        const w0 = tileWords[(cy * 2) * SELW + cx * 2];
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1]]) {
          if (tileWords[(cy * 2 + dr) * SELW + cx * 2 + dc] !== w0) return false;
        }
      }
      return true;
    };
    const haveColl = Array.isArray(collBeforeA) && Array.isArray(collAfterA);
    check('4d', 'ANTI-VACUOUS: the region has an authored collision plane under it, and it is '
      + '2x2-uniform per cell before the flip — a flip of an absent plane proves nothing',
      haveColl && uniform(collBeforeA), haveColl
        ? `plane A cells before: ${JSON.stringify(cellsOf(collBeforeA))}`
        : 'collRect returned null — LOUD: the collision half of this run is UNMEASURABLE');
    if (haveColl) {
      const wantCells = flipRegion(cellsOf(collBeforeA), cellsW, cellsH, 'h', 'collision');
      check('4e', 'COLLISION FLIPPED TOO, with ITS OWN bits (bit 10, not the nametable\'s bit 11) '
        + '— the cells reversed and each cell\'s xFlip toggled, and every cell is still '
        + '2x2-uniform so art and collision cannot have desynced',
        eq(cellsOf(collAfterA), wantCells) && uniform(collAfterA),
        `before cells=${JSON.stringify(cellsOf(collBeforeA))}`
        + `\n        after cells =${JSON.stringify(cellsOf(collAfterA))}`
        + `\n        want cells  =${JSON.stringify(wantCells)}`);
    }

    // PIXELS. The footprint, and nothing outside it.
    const fp = canvasOfTile(ART.col, ART.row);
    const want = { x: fp.x, y: fp.y, w: SELW * 8, h: SELH * 8 };
    const fd = flipDiff[MAPKEY];
    check('4f', 'THE SCREEN CHANGED, and only inside the selection — the batch command reached '
      + "the renderer's invalidation listener (a batch that does not is the 2026-08-28 defect: "
      + 'model right, canvas stale)',
      !!fd && fd.changed > 0 && fd.x >= want.x && fd.y >= want.y
      && fd.x + fd.w <= want.x + want.w && fd.y + fd.h <= want.y + want.h,
      `map diff ${JSON.stringify(fd)} within footprint ${JSON.stringify(want)}`);

    check('4g', 'ONE UNDO ENTRY for the whole flip', undoBefore === false
      && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === true,
      `canUndo before=${undoBefore} after=true`);
    await shot(c, '1-flipped-in-place');

    await chord('z', CTRL);
    await sleep(700);
    await c.evalExpr(SNAP('undone'));
    const ntUndone = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    const undoDiff = await c.json(DIFF('preFlip', 'undone'));
    check('4h', 'UNDO reverts the MODEL exactly', eq(ntUndone, ntBefore),
      `after-undo=${JSON.stringify(ntUndone)}`);
    check('4i', 'UNDO reverts the SCREEN too — pixel-identical to before the flip. Row 4h alone '
      + 'was green for the whole life of the batch-repaint defect',
      undoDiff[MAPKEY]?.changed === 0,
      `map diff pre-flip vs after-undo: ${JSON.stringify(undoDiff[MAPKEY])} `
      + `(the flip itself moved ${fd?.changed} pixels)`);

    // 4j: FLIP TWICE IS THE IDENTITY, on the running app. NECESSARY AND NOT
    // SUFFICIENT — it also passes if the key does nothing — so it is paired
    // with 4k, which proves the single flip changed the model.
    await key('x');
    const once = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    await key('x');
    const twice = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    check('4j', 'flipping the same selection twice restores it exactly', eq(twice, ntBefore));
    check('4k', 'THE ROW 4j CANNOT DO: the SINGLE flip changed the model. A dead key passes 4j',
      !eq(once, ntBefore), `one flip moved ${once.filter((w, i) => w !== ntBefore[i]).length} of ${once.length} words`);
    let guard = 0;
    while ((await c.evalExpr('window.__dbg.aeon.canUndo()')) === true && guard++ < 8) await chord('z', CTRL);

    // 4l: THE OTHER AXIS IS A DIFFERENT TRANSFORM, and uses the OTHER bit.
    await dragSelect(ART.col, ART.row, SELW, SELH);
    await key('y');
    const ntV = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    check('4l', 'Y mirrors top↕bottom with the VERTICAL bit — a different result from X, and '
      + 'not merely X under another name',
      eq(ntV, flipRegion(ntBefore, SELW, SELH, 'v', 'art'))
      && !eq(ntV, flipRegion(ntBefore, SELW, SELH, 'h', 'art')),
      `after Y=${JSON.stringify(ntV)}\n        want  =${JSON.stringify(flipRegion(ntBefore, SELW, SELH, 'v', 'art'))}`);
    guard = 0;
    while ((await c.evalExpr('window.__dbg.aeon.canUndo()')) === true && guard++ < 8) await chord('z', CTRL);

    // ---- 5. THE CLIPBOARD FLIP, AND THE PICTURE. -------------------------
    await dragSelect(ART.col, ART.row, SELW, SELH);
    await chord('c', CTRL);
    const clipBefore = await c.json('window.__dbg.aeon.mapClipboardWords()');
    check('5a', 'ANTI-VACUOUS: the clipboard holds the region, with collision (block-aligned)',
      !!clipBefore && clipBefore.widthTiles === SELW && clipBefore.heightTiles === SELH
      && clipBefore.collisionA.length === cellsW * cellsH,
      `w=${clipBefore?.widthTiles} h=${clipBefore?.heightTiles} collALen=${clipBefore?.collisionA.length}`);

    await chord('v', CTRL);
    const ghostAt = canvasOfTile(BLANK.col, BLANK.row);
    await mouse('mouseMoved', aimX(ghostAt.x + 4), aimY(ghostAt.y + 4), { buttons: 0 });
    await sleep(500);
    await c.evalExpr(SNAP('preGhostFlip'));
    const ghostNames = await c.json(SNAP('preGhostFlip'));
    const OVKEY = ghostNames.find((n) => n.startsWith('overlay0:')) ?? null;

    await key('x');
    const clipAfter = await c.json('window.__dbg.aeon.mapClipboardWords()');
    await c.evalExpr(SNAP('postGhostFlip'));
    const ghostDiff = await c.json(DIFF('preGhostFlip', 'postGhostFlip'));

    check('5b', 'X IN PASTE MODE FLIPS THE CLIPBOARD, both halves, on the model',
      eq(clipAfter?.nametable, flipRegion(clipBefore.nametable, SELW, SELH, 'h', 'art'))
      && eq(clipAfter?.collisionA, flipRegion(clipBefore.collisionA, cellsW, cellsH, 'h', 'collision')),
      `clip after=${JSON.stringify(clipAfter?.nametable)}`);
    check('5c', 'and it does NOT change what the clipboard CARRIES — same footprint, same plane '
      + 'lengths. A flip must not upgrade or downgrade a selection',
      clipAfter?.widthTiles === SELW && clipAfter?.heightTiles === SELH
      && clipAfter?.collisionA.length === clipBefore.collisionA.length
      && clipAfter?.collisionB.length === clipBefore.collisionB.length,
      JSON.stringify({ w: clipAfter?.widthTiles, h: clipAfter?.heightTiles, a: clipAfter?.collisionA.length }));
    check('5d', 'THE GHOST REPAINTED — the pending paste on the OVERLAY canvas changed under the '
      + 'stationary cursor. `mapClipboard` is not a redraw dependency, so nothing else would '
      + 'have put the mirrored art on screen',
      !!ghostDiff[OVKEY] && ghostDiff[OVKEY].changed > 0, JSON.stringify(ghostDiff[OVKEY]));
    check('5e', 'and the MAP underneath is untouched — flipping a pending paste is not an edit',
      ghostDiff[MAPKEY]?.changed === 0, JSON.stringify(ghostDiff[MAPKEY]));
    check('5f', 'flipping the clipboard pushed NO undo step',
      (await c.evalExpr('window.__dbg.aeon.canUndo()')) === false);

    // THE PICTURE: paste the mirror, then the original, so they land SIDE BY
    // SIDE and the pair is its own mirror. (Mirror first because the clipboard
    // is currently flipped; a second X puts it back.)
    const pasteAt = async (col, row) => {
      const p = canvasOfTile(col, row);
      await mouse('mouseMoved', aimX(p.x + 4), aimY(p.y + 4), { buttons: 0 });
      await sleep(350);
      await mouse('mousePressed', aimX(p.x + 4), aimY(p.y + 4));
      await mouse('mouseReleased', aimX(p.x + 4), aimY(p.y + 4));
      await sleep(600);
      return tileAt(aimX(p.x + 4), aimY(p.y + 4));
    };
    const tMirror = await pasteAt(BLANK.col, BLANK.row);
    await key('x');                       // back to the original orientation
    const tOrig = await pasteAt(BLANK.col + SELW, BLANK.row);
    check('5g', 'ANTI-VACUOUS: both pastes resolved to the intended block-aligned origins',
      tMirror.col === BLANK.col && tMirror.row === BLANK.row
      && tOrig.col === BLANK.col + SELW && tOrig.row === BLANK.row,
      `mirror→${JSON.stringify(tMirror)} original→${JSON.stringify(tOrig)}`);
    await escape();
    await sleep(400);

    const pair = await c.json(
      `window.__dbg.aeon.ntRect(0, ${BLANK.col}, ${BLANK.row}, ${SELW * 2}, ${SELH})`);
    const pairMirror = flipRegion(pair, SELW * 2, SELH, 'h', 'art');
    check('5h', 'THE MODEL MONEY ROW: the mirror and the original, side by side, form a window '
      + 'that is its OWN left-right mirror — word for word, through the parsed masks',
      eq(pair, pairMirror), `${SELW * 2}x${SELH} window: `
      + `${pair.filter((w, i) => w !== pairMirror[i]).length} of ${pair.length} words disagree`);
    check('5i', 'ANTI-VACUOUS: that window is not blank and not two identical copies',
      pair.some((w) => w !== 0)
      && !eq(pair.slice(0, SELW), pair.slice(SELW, SELW * 2)),
      `nonzero=${pair.filter((w) => w !== 0).length}/${pair.length}`);

    const pairPx = canvasOfTile(BLANK.col, BLANK.row);
    const mir = await c.json(MIRROR_H(pairPx.x, pairPx.y, SELW * 16, SELH * 8));
    check('5j', 'THE PIXEL MONEY ROW: the DRAWN pair is its own left-right mirror, exactly, '
      + 'per RGBA byte. Neither half-transform can produce this — reverse-only leaves the two '
      + 'copies IDENTICAL rather than mirrored, toggle-only leaves them neither',
      !!mir && mir.diff === 0 && mir.distinct > 3,
      `same=${mir?.same} diff=${mir?.diff} of ${mir?.total} px, ${mir?.distinct} distinct colours `
      + `at canvas (${pairPx.x},${pairPx.y}) ${SELW * 16}x${SELH * 8}`
      + `\n        mismatch box=${JSON.stringify(mir?.box)} samples=${JSON.stringify(mir?.where)}`);
    await shot(c, '2-mirrored-pair');

    // THE CONTROL: the same measurement over the ORIGINAL region, which is not
    // symmetric — without this, "mirror" could just mean "this art is
    // symmetric anyway" and 5j would be describing the fixture, not the flip.
    const artPx = canvasOfTile(ART.col, ART.row);
    const ctrl = await c.json(MIRROR_H(artPx.x, artPx.y, SELW * 8, SELH * 8));
    check('5k', 'THE CONTROL: the SOURCE region alone is NOT its own mirror, so row 5j is '
      + 'measuring the flip and not a symmetric fixture',
      !!ctrl && ctrl.diff > 0,
      `source region same=${ctrl?.same} diff=${ctrl?.diff} of ${ctrl?.total}`);

    // THE PICTURE FOR HIS DISPLAY: the same pair, 8x nearest-neighbour, so the
    // mirror is readable at a glance. Taken from the SAME canvas rows 5j/5k just
    // measured, in the same session — not a separate staged render.
    const crop = await c.evalExpr(CROP(pairPx.x, pairPx.y, SELW * 16, SELH * 8, 8));
    if (typeof crop === 'string' && crop.startsWith('data:image/png;base64,')) {
      writeFileSync(`${SHOTS}/4-mirror-closeup.png`, Buffer.from(crop.split(',')[1], 'base64'));
      console.log('        shot → scratchpad/shots-marquee-flip/4-mirror-closeup.png (8x, nearest-neighbour)');
    }
    const cropSrc = await c.evalExpr(CROP(artPx.x, artPx.y, SELW * 8, SELH * 8, 8));
    if (typeof cropSrc === 'string' && cropSrc.startsWith('data:image/png;base64,')) {
      writeFileSync(`${SHOTS}/5-source-closeup.png`, Buffer.from(cropSrc.split(',')[1], 'base64'));
      console.log('        shot → scratchpad/shots-marquee-flip/5-source-closeup.png (8x, the unflipped source)');
    }

    guard = 0;
    while ((await c.evalExpr('window.__dbg.aeon.canUndo()')) === true && guard++ < 12) await chord('z', CTRL);

    // ---- 6. AN ART-ONLY SELECTION FLIPS ART ONLY. ------------------------
    const clickTile = await c.evalExpr(String.raw`
      (() => {
        const els = [...document.querySelectorAll('button')].filter((e) => (e.textContent || '').trim() === 'Tile');
        if (els.length !== 1) return 'found:' + els.length;
        els[0].click();
        return 'ok';
      })()`);
    check('6a', "the panel's Snap 'Tile' button exists exactly once and was clicked",
      clickTile === 'ok', String(clickTile));
    await sleep(250);

    const OC = ART.col + 1, OR = ART.row + 1, OW = 3, OH = 1;
    await dragSelect(OC, OR, OW, OH);
    m = await c.json('window.__dbg.aeon.marquee()');
    check('6b', 'ANTI-VACUOUS: an ODD, non-block-aligned selection is standing',
      !!m && m.col === OC && m.row === OR && m.w === OW && m.h === OH && m.aligned === false,
      JSON.stringify(m));

    const oNtBefore = await c.json(`window.__dbg.aeon.ntRect(0, ${OC}, ${OR}, ${OW}, ${OH})`);
    const oCollBefore = await c.json(`window.__dbg.aeon.collRect(0, ${OC}, ${OR}, 8, 4, 'a')`);
    await key('x');
    const oNtAfter = await c.json(`window.__dbg.aeon.ntRect(0, ${OC}, ${OR}, ${OW}, ${OH})`);
    const oCollAfter = await c.json(`window.__dbg.aeon.collRect(0, ${OC}, ${OR}, 8, 4, 'a')`);

    check('6c', 'an art-only selection flips its ART, both halves, including the CENTRE column '
      + 'of an odd run — which stays put and still has its own flip bit toggled',
      eq(oNtAfter, flipRegion(oNtBefore, OW, OH, 'h', 'art'))
      && oNtAfter[1] === (oNtBefore[1] ^ MASK.ntH),
      `before=${JSON.stringify(oNtBefore)}\n        after =${JSON.stringify(oNtAfter)}`
      + `\n        want  =${JSON.stringify(flipRegion(oNtBefore, OW, OH, 'h', 'art'))}`);
    check('6d', 'THE DESYNC ROW: it leaves COLLISION EXACTLY as it was — collision is stored per '
      + '16px block and this rectangle owns none, so flipping it would be inventing data',
      eq(oCollAfter, oCollBefore),
      `${(oCollAfter ?? []).filter((w, i) => w !== (oCollBefore ?? [])[i]).length} collision words changed`);
    check('6e', 'ANTI-VACUOUS COMPANION: the art really did move, so "collision untouched" is '
      + 'not "nothing happened"',
      !eq(oNtAfter, oNtBefore));
    const t6 = await c.json('window.__dbg.aeon.toasts()');
    check('6f', 'and the author is TOLD it was art only, with the reason — not silently degraded',
      t6.some((t) => /art only/i.test(t.message) && /16px block/i.test(t.message)),
      JSON.stringify(t6.slice(-2)));
    await shot(c, '3-art-only-flip');

    // ---- 7. LEAVE NOTHING BEHIND. ---------------------------------------
    guard = 0;
    while ((await c.evalExpr('window.__dbg.aeon.canUndo()')) === true && guard++ < 30) await chord('z', CTRL);
    const errs = await readErrors();
    check('7a', 'the run undid every edit it made (nothing is written either way — no Ctrl+S), '
      + 'and the page threw nothing',
      guard < 30 && errs.length === 0, `undos issued=${guard} pageErrors=${JSON.stringify(errs)}`);
    await c.send('Page.reload');
  } catch (err) {
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
