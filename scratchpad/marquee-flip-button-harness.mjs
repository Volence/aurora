#!/usr/bin/env node
// THE FLIP BUTTONS, CLICKED — not the keys pressed through a different door.
//
// `marquee-flip-harness.mjs` (row 83) proves the TRANSFORM on the running app,
// driven by the `X`/`Y` keys. This one exists because the owner asked for
// buttons — *"I think a button on the right panel would be nice too"* — and a
// button is only a real affordance if something CLICKS IT.
//
// ═══ THE RULE THIS FILE IS BUILT AROUND ═══
//
// ⭐ EVERY ROW BELOW MUST BE ABLE TO FAIL WHILE THE KEY ROWS PASS. That is the
// whole point: a harness that dispatched `x` and called it a button test would
// be testing the keys again through a different door, and would stay green if
// the buttons were deleted tomorrow. So nothing here dispatches a flip key.
// Every flip is `element.click()` on a button located in the LIVE DOM by its
// own label, and the locator reports `no-button` rather than throwing, so a
// missing control is a named failure and not a stack trace.
//
// ═══ WHAT ELSE IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. ⭐ THE GHOST NOT REPAINTING FROM THE BUTTON. `mapClipboard` is not a redraw
//    dependency and the paste ghost lives on a SECOND, unnamed overlay canvas.
//    The key path always repainted it inline; the panel cannot reach that
//    canvas, so `map-flip` holds the callback. Row B10 mirrors the pending
//    paste FROM THE BUTTON and requires the overlay's pixels to move. A build
//    where only the key repaints passes every key row and fails this one.
//
// 2. THE DISABLED STATE MEANING SOMETHING. Row B2 clicks the buttons with
//    nothing eligible and requires the model, the clipboard and the undo depth
//    all to be untouched — and requires the buttons to be PRESENT, because a
//    control that vanishes teaches nothing about when it applies.
//
// 3. A SECOND IMPLEMENTATION. The model expectation is computed here from masks
//    parsed out of the two CODECS (never out of `region-flip.ts`, the thing
//    under test), and rows B5c/B5d assert the result differs from each HALF of
//    the two-part transform — reverse-only and toggle-only both look nearly
//    right on tiled art.
//
// ═══ THREE DEFECTS THIS FILE HAD, FOUND BY PLANTING THE VIOLATION ═══
//
// Recorded because two of them are the "wrong quantity" failure mode and one is
// the "cross-row claim" one, and all three would have shipped as green.
//
//   • ROW B2d PASSED WITH THE BUTTONS DELETED. "Clicking a disabled button did
//     nothing" is TRIVIALLY TRUE when there is no button, and the row's own
//     ruled-out line pointed at B2a as its guard — but B2a failing does not
//     make B2d fail. A cross-row claim is not a guard; the condition is now IN
//     the row (`dead.h.found && dead.v.found`).
//   • THE RUN CRASHED instead of reporting. With no button, `dead.h.text` was
//     undefined and row B3 threw, losing every row after it — the failure mode
//     the locator's `no-button` return was supposed to prevent, reintroduced
//     one line later.
//   • ROW B5d PASSED ON A DEAD FLIP. Its region had no authored collision, and
//     `flipRegion` of an all-zero rectangle is an all-zero rectangle. Now gated
//     on the plane holding a shape (UNMEASURED otherwise, not counted) and on
//     the result differing from the input.
//
// ⚠ IT WRITES NOTHING TO DISK. It edits the in-memory act (that is the point of
// a flip) and never saves; no Ctrl+S is dispatched. ⚠ NO EMULATOR.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     PORT=9465 node scratchpad/marquee-flip-button-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9465);
const ROOT = AURORA_DIR;
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron'));
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTDIR = `${ROOT}/scratchpad/marquee-flip-button`;
const SHOTS = process.env.SHOTS === '1';

/** Pinned CSS viewport + device scale — dpr is unstable under Xvfb here, so it
 *  is an INPUT, and it is printed either way. */
const VIEWPORT = { width: 1400, height: 872, scale: 1 };

// ── The word masks, parsed out of the two ENCODERS. NOT out of region-flip.ts:
//    an expectation read from the module under test is self-consistent by
//    construction. Same derivation the key harness uses, and row B0b prints it.
function parseMasks() {
  const nt = readFileSync(`${ROOT}/src/core/model/s4-types.ts`, 'utf8');
  const cw = readFileSync(`${ROOT}/src/core/collision/collision-cell-word.ts`, 'utf8');
  const g = (src, re, label) => {
    const m = src.match(re);
    if (!m) throw new Error(`could not parse ${label} out of source — the codec changed shape`);
    return m[1];
  };
  return {
    ntH: 1 << Number(g(nt, /\(\(hFlip \? 1 : 0\) << (\d+)\)/, 'nametable hFlip shift')),
    ntV: 1 << Number(g(nt, /\(\(vFlip \? 1 : 0\) << (\d+)\)/, 'nametable vFlip shift')),
    collX: Number(g(cw, /c\.xFlip \? (0x[0-9A-Fa-f]+) : 0/, 'collision xFlip mask')),
    collY: Number(g(cw, /c\.yFlip \? (0x[0-9A-Fa-f]+) : 0/, 'collision yFlip mask')),
    collShape: Number(g(cw, /\(c\.shape & (0x[0-9A-Fa-f]+)\)/, 'collision shape mask')),
  };
}
const MASK = parseMasks();

/** The two-part transform, spelled out independently of the app. */
function flipRegion(words, w, h, axis, kind) {
  const out = new Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const sr = axis === 'v' ? h - 1 - r : r;
    const sc = axis === 'h' ? w - 1 - c : c;
    const word = words[sr * w + sc];
    out[r * w + c] = kind === 'art'
      ? (word ^ (axis === 'h' ? MASK.ntH : MASK.ntV))
      : ((word & MASK.collShape) === 0 ? word
        : (word ^ (axis === 'h' ? MASK.collX : MASK.collY)));
  }
  return out;
}
/** The HALVES — never an expectation, only proof that the expectation
 *  discriminates. Doing one and not the other looks nearly right on tiled art. */
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
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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

const log = (...a) => console.log(...a);
const results = [];
const fails = [];
function check(id, name, ok, detail) {
  log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
function ruledOut(id, what) { log(`  ruled out [${id}]: ${what}`); }

/**
 * THE BUTTON, LOCATED IN THE LIVE DOM BY ITS OWN LABEL.
 *
 * ⚠ It reports rather than throws: `no-button` is a NAMED failure a row can
 * assert on. And it reports the element's own text and disabled state, so a row
 * can never be satisfied by "something was clicked".
 *
 * The label match is on the visible text (`X ⇄` / `Y ⇅`), which is also what a
 * human is looking for — a row keyed on a test-id would keep passing after the
 * label became something nobody can find.
 */
const FLIP_BTN = (glyph, doClick) => String.raw`
(() => {
  const btns = [...document.querySelectorAll('button')]
    .filter((b) => (b.textContent || '').trim() === ${JSON.stringify(glyph)});
  if (!btns.length) return { found: false, why: 'no-button' };
  if (btns.length > 1) return { found: false, why: 'ambiguous', n: btns.length };
  const b = btns[0];
  const r = b.getBoundingClientRect();
  const out = { found: true, text: (b.textContent || '').trim(), disabled: !!b.disabled,
                title: b.getAttribute('title') || '', w: Math.round(r.width), h: Math.round(r.height),
                visible: r.width > 0 && r.height > 0 };
  if (${doClick ? 'true' : 'false'}) { b.click(); out.clicked = true; }
  return out;
})()`;

/** The panel's own prose line — read from the DOM, never from a source constant. */
const PANEL_HINT = String.raw`
(() => {
  const el = [...document.querySelectorAll('div')]
    .filter((d) => /Ctrl\+C copy|Click to paste/.test(d.textContent || '') && d.children.length === 0);
  return el.length ? el[el.length - 1].textContent.trim() : null;
})()`;

const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height, backingW: cv.width };
})()`;

/**
 * Snapshot EVERY canvas, keyed by id+size.
 *
 * ⚠ The paste ghost is drawn on a SECOND, UNNAMED overlay canvas, not on
 * `#map-canvas`. A row that read the map canvas for a ghost change would be
 * measuring the wrong surface entirely and would report "no change" on a
 * perfectly working repaint. Snapshotting all of them and diffing per-canvas is
 * how row B10 can say WHICH surface moved.
 */
const SNAP = (slot) => String.raw`
(() => {
  window.__bsnaps = window.__bsnaps || {};
  const out = {};
  let anon = 0;
  for (const cv of document.querySelectorAll('canvas')) {
    const ctx = cv.getContext('2d');
    if (!ctx || !cv.width || !cv.height) continue;
    const name = (cv.id || ('overlay' + (anon++))) + ':' + cv.width + 'x' + cv.height;
    try { out[name] = { w: cv.width, h: cv.height, data: ctx.getImageData(0, 0, cv.width, cv.height).data }; }
    catch (e) { out[name] = { err: String(e) }; }
  }
  window.__bsnaps[${JSON.stringify(slot)}] = out;
  return Object.keys(out);
})()`;

/** Per-canvas changed-pixel count and bounding box between two snapshots. */
const DIFF = (a, b) => String.raw`
(() => {
  const A = window.__bsnaps[${JSON.stringify(a)}], B = window.__bsnaps[${JSON.stringify(b)}];
  if (!A || !B) return { error: 'missing snapshot' };
  const res = {};
  for (const k of Object.keys(A)) {
    const x = A[k], y = B[k];
    if (!y || x.err || y.err || x.w !== y.w || x.h !== y.h) { res[k] = { error: 'shape-changed' }; continue; }
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
    for (let py = 0; py < x.h; py++) for (let px = 0; px < x.w; px++) {
      const i = (py * x.w + px) * 4;
      if (x.data[i] !== y.data[i] || x.data[i+1] !== y.data[i+1]
          || x.data[i+2] !== y.data[i+2] || x.data[i+3] !== y.data[i+3]) {
        n++;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
      }
    }
    res[k] = n ? { n, minX, minY, maxX, maxY } : { n: 0 };
  }
  return res;
})()`;

/**
 * Find a block-aligned region whose FOREGROUND is rich AND is not already its
 * own left-right mirror — otherwise "the flip changed the model" is a claim a
 * no-op could satisfy. Also finds an all-air strip, unused here but kept so the
 * scan matches the key harness's fixture choice exactly.
 */
const FG_RICH = (wTiles, hTiles) => String.raw`
(() => {
  const W = ${wTiles}, H = ${hTiles};
  let best = null;
  for (let row = 0; row + H <= 128; row += 2) {
    for (let col = 0; col + W <= 128; col += 2) {
      const words = window.__dbg.aeon.ntRect(0, col, row, W, H);
      if (!words) continue;
      const distinct = new Set(words.map((w) => w & 0x7ff));
      if (distinct.size < 4) continue;
      let asym = 0;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        if (words[r * W + c] !== words[r * W + (W - 1 - c)]) asym++;
      }
      if (asym === 0) continue;
      const score = distinct.size * 100 + asym;
      if (!best || score > best.score) best = { col, row, distinctTiles: distinct.size, asym, score };
    }
  }
  return best;
})()`;

/** An all-air strip, so the paste ghost is drawn over EMPTINESS. Over art, a
 *  mirrored ghost can overlap art that happens to match it and the pixel diff
 *  under-reports; over the void, every ghost pixel that moves is visible. */
const FG_BLANK = (wTiles, hTiles) => String.raw`
(() => {
  const W = ${wTiles}, H = ${hTiles};
  for (let row = 0; row + H <= 128; row += 2) {
    for (let col = 0; col + W <= 128; col += 2) {
      const words = window.__dbg.aeon.ntRect(0, col, row, W, H);
      if (!words) continue;
      if (words.every((w) => (w & 0x7ff) === 0)) return { col, row };
    }
  }
  return null;
})()`;

async function shoot(c, name, clip) {
  if (!SHOTS) return;
  mkdirSync(SHOTDIR, { recursive: true });
  const params = { format: 'png' };
  if (clip) params.clip = clip;
  const r = await c.send('Page.captureScreenshot', params);
  writeFileSync(`${SHOTDIR}/${name}.png`, Buffer.from(r.data, 'base64'));
  log(`  shot  ${SHOTDIR}/${name}.png${clip ? ` clip=${JSON.stringify(clip)}` : ''}`);
}

/** The panel that holds the buttons, so the review shot shows the CONTROL at a
 *  size a reader can judge rather than a 1400px window with a 31px button in
 *  the corner. Captured at scale 3. */
const PANEL_RECT = String.raw`
(() => {
  const b = [...document.querySelectorAll('button')].find((e) => (e.textContent || '').trim() === 'X ⇄');
  if (!b) return null;
  const panel = b.parentElement?.parentElement;
  if (!panel) return null;
  const r = panel.getBoundingClientRect();
  return { x: Math.floor(r.left), y: Math.floor(r.top),
           width: Math.ceil(Math.min(r.width, 320)), height: Math.ceil(Math.min(r.height, 560)) };
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24 -dpi 96', ELECTRON, `${ROOT}/dist/main/index.mjs`],
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
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    const probes = await c.json(`({
      clipWords: typeof window.__dbg.aeon.mapClipboardWords,
      collRect: typeof window.__dbg.aeon.collRect,
      ntRect: typeof window.__dbg.aeon.ntRect,
    })`);
    check('B0a', 'the build under test carries the model probes (ntRect / collRect / mapClipboardWords)',
      probes.clipWords === 'function' && probes.collRect === 'function' && probes.ntRect === 'function',
      `${ROOT}/dist — ${JSON.stringify(probes)}`);
    check('B0b', 'the word masks are parsed out of the two CODECS, not out of the module under test',
      MASK.ntH === MASK.collX * 2 && MASK.ntV === MASK.collY * 2 && (MASK.ntH & MASK.collX) === 0,
      `ntH=0x${MASK.ntH.toString(16)} ntV=0x${MASK.ntV.toString(16)} `
      + `collX=0x${MASK.collX.toString(16)} collY=0x${MASK.collY.toString(16)}`);

    await c.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width, height: VIEWPORT.height,
      deviceScaleFactor: VIEWPORT.scale, mobile: false,
    });
    await sleep(500);
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('B1a', 'ANTI-VACUOUS: the aeon project is open with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));

    await sleep(2000);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(600);
    const view = await c.json('window.__dbg.view()');
    const rect = await c.json(CANVAS_RECT);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    note('environment', `dpr=${dpr} view=${JSON.stringify(view)} rect=${JSON.stringify(rect)}`);
    check('B1b', 'ANTI-VACUOUS: camera at a known unzoomed origin and the map canvas is mounted — '
      + 'one canvas px is one world px, which is what licenses the pixel rows',
      view.x === 0 && view.y === 0 && view.zoom === 1 && !!rect && rect.width > 200,
      `view=${JSON.stringify(view)} rect=${JSON.stringify(rect)}`);

    // ⚠ INTEGER CLIENT PIXELS. dpr varies run-to-run under Xvfb here, and a
    // fractional aim has cost a review cycle in this repo before.
    const aimX = (canvasX) => Math.round(rect.left + canvasX);
    const aimY = (canvasY) => Math.round(rect.top + canvasY);
    const canvasOfTile = (col, row) => ({ x: (col * 8 - view.x) * view.zoom, y: (row * 8 - view.y) * view.zoom });
    const mouse = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra,
    });
    const key = async (k, extra = {}) => {
      const base = { key: k, code: extra.code ?? `Key${k.toUpperCase()}`,
        windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), ...extra };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(320);
    };
    const chord = async (k, mods) => {
      const base = { key: k, code: `Key${k.toUpperCase()}`,
        windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(380);
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
      note('drag aim (integer client px)', `${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`);
      await mouse('mousePressed', p0.x, p0.y);
      for (let i = 1; i <= 4; i++) {
        await mouse('mouseMoved', Math.round(p0.x + (p1.x - p0.x) * i / 4),
          Math.round(p0.y + (p1.y - p0.y) * i / 4));
      }
      await mouse('mouseReleased', p1.x, p1.y);
      await sleep(400);
    };
    /** ⭐ THE ONLY WAY THIS FILE FLIPS ANYTHING. No key is ever dispatched for a
     *  flip, so every row below can fail while the key harness stays green. */
    const clickFlip = async (glyph) => {
      const r = await c.json(FLIP_BTN(glyph, true));
      await sleep(450);
      return r;
    };
    const readFlip = (glyph) => c.json(FLIP_BTN(glyph, false));

    await key('m');
    st = await c.json('window.__dbg.aeon.state()');
    check('B1c', "ANTI-VACUOUS: the marquee tool is armed, so the panel that holds the buttons is mounted",
      st.tool === 'marquee', JSON.stringify(st.tool));

    // ───────── B2 ⭐ THE DISABLED STATE, AND IT MUST STILL BE THERE ─────────
    const dead = { h: await readFlip('X ⇄'), v: await readFlip('Y ⇅') };
    check('B2a', '⭐ with nothing selected and no paste pending, BOTH flip buttons are PRESENT, '
      + 'VISIBLE and DISABLED — a control that vanishes teaches nothing about when it applies',
      dead.h.found && dead.v.found && dead.h.visible && dead.v.visible
        && dead.h.disabled === true && dead.v.disabled === true,
      `X: ${JSON.stringify(dead.h)}\n        Y: ${JSON.stringify(dead.v)}`);
    check('B2b', '...and the disabled title SAYS WHAT IS MISSING rather than being an empty tooltip',
      /marquee|paste|selection/i.test(dead.h.title) && dead.h.title.length > 30,
      JSON.stringify(dead.h.title));

    const SELW = 4, SELH = 4;
    const scan = await c.json(FG_RICH(SELW, SELH));
    check('B2c', `ANTI-VACUOUS: section 0 has a block-aligned ${SELW}x${SELH}-tile region that is `
      + 'rich AND not already its own left-right mirror',
      !!(scan && scan.distinctTiles >= 4 && scan.asym > 0), JSON.stringify(scan));
    if (!scan) throw new Error('nametable scan failed — is the act loaded?');
    const ART = { col: scan.col, row: scan.row };

    const beforeDead = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    const undoAtStart = await c.evalExpr('window.__dbg.aeon.canUndo()');
    await clickFlip('X ⇄');
    await clickFlip('Y ⇅');
    const afterDead = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    // ⚠ GATED ON THE BUTTON EXISTING, and finding that out cost a plant. "A
    // disabled button did nothing" is TRIVIALLY TRUE when there is no button:
    // with the control deleted, B2a failed and this row sailed through green
    // while its own ruled-out line claimed B2a had it covered. A cross-row
    // claim is not a guard — the condition has to be IN the row.
    check('B2d', '⭐ clicking a DISABLED flip button does nothing at all — the model is byte-identical '
      + 'and no undo step appeared (and there WAS a button to click)',
      dead.h.found && dead.v.found && dead.h.clicked !== false
        && eq(beforeDead, afterDead)
        && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === undoAtStart,
      `buttons present=${dead.h.found && dead.v.found} model unchanged=${eq(beforeDead, afterDead)} `
      + `canUndo ${undoAtStart} -> ${await c.evalExpr('window.__dbg.aeon.canUndo()')}`);
    ruledOut('B2d', 'the click never reaching a button at all — the row now requires the elements '
      + 'itself rather than pointing at B2a, so this is a click that landed and was correctly refused');

    {
      const pr = await c.json(PANEL_RECT);
      if (pr) await shoot(c, 'panel-disabled', { ...pr, scale: 3 });
    }

    // ───────── B3 the prose survived; the button did not replace it ─────────
    const hintNoSel = await c.evalExpr(PANEL_HINT);
    check('B3', 'the panel STILL names the keys in prose — the button was added beside the '
      + 'sentence, not instead of it, and the button labels carry the letters too',
      typeof hintNoSel === 'string' && /X flips/.test(hintNoSel) && /Y top/.test(hintNoSel)
        && (dead.h.text ?? '').startsWith('X') && (dead.v.text ?? '').startsWith('Y'),
      `hint=${JSON.stringify(hintNoSel)}\n        labels=${JSON.stringify([dead.h.text, dead.v.text])}`);

    // ───────── B4 a standing selection ENABLES the same elements ─────────
    await dragSelect(ART.col, ART.row, SELW, SELH);
    const live = { h: await readFlip('X ⇄'), v: await readFlip('Y ⇅') };
    check('B4', 'a standing marquee ENABLES the same two buttons — the enablement moved, the '
      + 'controls did not appear',
      live.h.found && live.v.found && live.h.disabled === false && live.v.disabled === false
        && live.h.text === dead.h.text,
      `X: disabled ${dead.h.disabled} -> ${live.h.disabled}, title now ${JSON.stringify(live.h.title)}`);
    ruledOut('B4', 'a DIFFERENT pair of buttons appearing — the label is the locator and it is '
      + 'unchanged, and B2a already found these same two while disabled');
    {
      const pr = await c.json(PANEL_RECT);
      if (pr) await shoot(c, 'panel-enabled', { ...pr, scale: 3 });
    }

    // ───────── B5 ⭐ THE BUTTON FLIPS THE MAP ─────────
    const ntBefore = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    const collBefore = await c.json(`window.__dbg.aeon.collRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH}, 'a')`);
    const undoBefore = await c.evalExpr('window.__dbg.aeon.canUndo()');
    await c.evalExpr(SNAP('pre'));
    const clickRes = await clickFlip('X ⇄');
    await c.evalExpr(SNAP('post'));
    const ntAfter = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);

    check('B5a', '⭐ the CLICK landed on the real button (located by its own visible label)',
      clickRes.found === true && clickRes.clicked === true && clickRes.disabled === false,
      JSON.stringify(clickRes));
    check('B5b', '⭐ THE BUTTON MIRRORED THE MAP — every word came from the mirrored column AND '
      + 'had its own hFlip bit toggled',
      eq(ntAfter, flipRegion(ntBefore, SELW, SELH, 'h', 'art')),
      `before[0..3]=${JSON.stringify(ntBefore.slice(0, 4))}\n        `
      + `after [0..3]=${JSON.stringify(ntAfter.slice(0, 4))}\n        `
      + `expect[0..3]=${JSON.stringify(flipRegion(ntBefore, SELW, SELH, 'h', 'art').slice(0, 4))}`);
    check('B5c', 'NEITHER HALF ALONE would have produced it — the result differs from reverse-only '
      + 'AND from toggle-only on this fixture',
      !eq(ntAfter, reverseOnly(ntBefore, SELW, SELH, 'h'))
        && !eq(ntAfter, toggleOnly(ntBefore, 'h', 'art'))
        && !eq(ntAfter, ntBefore),
      `differs from reverse-only=${!eq(ntAfter, reverseOnly(ntBefore, SELW, SELH, 'h'))} `
      + `toggle-only=${!eq(ntAfter, toggleOnly(ntBefore, 'h', 'art'))} `
      + `unchanged=${eq(ntAfter, ntBefore)}`);
    // ⚠ THE COLLISION ROW IS ONLY WORTH RUNNING IF THERE IS COLLISION THERE.
    // `flipRegion` of an all-zero rectangle is an all-zero rectangle, so on a
    // region with no authored plane this row would pass on a DEAD flip, on a
    // wrong-axis flip, and on no flip at all — the first cut asserted only
    // `after === flip(before)` and could not have told any of those apart. Two
    // things fix it: the row is GATED on the rectangle actually holding a
    // collision shape (reported as UNMEASURED, not counted, when it does not),
    // and it additionally requires the result to DIFFER from the input.
    const collLive = collBefore && collBefore.some((w) => (w & MASK.collShape) !== 0);
    if (collLive) {
      const collAfter = await c.json(`window.__dbg.aeon.collRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH}, 'a')`);
      check('B5d', 'COLLISION came along, with ITS OWN bit (collision xFlip, not the nametable\'s)',
        eq(collAfter, flipRegion(collBefore, SELW, SELH, 'h', 'coll'))
          && !eq(collAfter, collBefore),
        `before[0..3]=${JSON.stringify(collBefore.slice(0, 4))} after[0..3]=${JSON.stringify(collAfter.slice(0, 4))}`);
    } else {
      note('B5d UNMEASURED', 'the richest-art region has NO authored collision shape under it '
        + `(collRect = ${JSON.stringify((collBefore ?? []).slice(0, 4))}...), and flipping an `
        + 'all-zero rectangle is an all-zero rectangle — the row would pass on a dead flip. '
        + 'The collision half is proven by marquee-flip-harness.mjs row 4e and by '
        + 'region-flip.test.ts, both on regions that have one.');
    }

    // ───────── B6 ONE undo step, and it reverts exactly ─────────
    check('B6a', 'ONE undo entry for the whole button press',
      undoBefore === false && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === true,
      `canUndo before=${undoBefore} after=true`);
    await chord('z', CTRL);
    const ntUndone = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    check('B6b', 'UNDO reverts the model exactly — the button\'s command is a real batch, not a '
      + 'pile of per-word writes',
      eq(ntUndone, ntBefore) && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === false,
      `restored=${eq(ntUndone, ntBefore)}`);
    ruledOut('B6a/B6b', 'many undo steps looking like one — B6b requires canUndo to be FALSE after a '
      + 'single Ctrl+Z, which a multi-step flip could not satisfy');

    // ───────── B7 the canvas moved, and the renderer cache was invalidated ────
    const diff = await c.json(DIFF('pre', 'post'));
    const mapKey = Object.keys(diff).find((k) => k.startsWith('map-canvas'));
    const mapDiff = mapKey ? diff[mapKey] : null;
    const selPx = { x0: ART.col * 8, y0: ART.row * 8, x1: (ART.col + SELW) * 8, y1: (ART.row + SELH) * 8 };
    check('B7', 'THE SCREEN CHANGED, and only inside the selection — the button\'s command reached '
      + 'the renderer-cache invalidation listener, which is the trap a new command path falls into',
      !!mapDiff && mapDiff.n > 0
        && mapDiff.minX >= selPx.x0 - 1 && mapDiff.maxX <= selPx.x1 + 1
        && mapDiff.minY >= selPx.y0 - 1 && mapDiff.maxY <= selPx.y1 + 1,
      `#map-canvas changed px=${mapDiff?.n} bbox=(${mapDiff?.minX},${mapDiff?.minY})-`
      + `(${mapDiff?.maxX},${mapDiff?.maxY}) vs selection (${selPx.x0},${selPx.y0})-(${selPx.x1},${selPx.y1})`);
    ruledOut('B7', 'a repaint of the whole canvas (the bbox is required to sit inside the selection, '
      + '±1px for the marquee outline) and a dead canvas (n > 0 required)');

    // ───────── B8 the OTHER button is the OTHER axis ─────────
    await clickFlip('Y ⇅');
    const ntV = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    check('B8', 'the Y button mirrors TOP↕BOTTOM with the vertical bit — a different result from X '
      + 'on the same fixture, so the two buttons are not wired to one axis',
      eq(ntV, flipRegion(ntBefore, SELW, SELH, 'v', 'art')) && !eq(ntV, ntAfter),
      `Y result matches the vertical transform=${eq(ntV, flipRegion(ntBefore, SELW, SELH, 'v', 'art'))}, `
      + `and differs from X's result=${!eq(ntV, ntAfter)}`);
    await chord('z', CTRL);
    await sleep(300);

    // ───────── B9/B10 ⭐ PASTE MODE, AND THE GHOST ─────────
    await chord('c', CTRL);
    await chord('v', CTRL);
    await sleep(400);
    // ⚠ PARK THE CURSOR OVER THE VOID FIRST, AND THIS IS NOT COSMETIC. The
    // ghost is drawn at the HOVER position; with no mousemove since the paste
    // began there may be no ghost on the overlay at all, and row B10 would then
    // report "nothing moved" on a perfectly working repaint — measuring the
    // absence of a ghost rather than the absence of a repaint. (Measured: the
    // first run of this file failed B10 for exactly that reason, with every
    // canvas at n=0 including the map.) Over the VOID rather than over art, so
    // a mirrored ghost cannot coincidentally match what is under it.
    const blank = await c.json(FG_BLANK(SELW * 2, SELH));
    check('B9z', 'ANTI-VACUOUS: an all-air strip exists to hover the ghost over, and the cursor '
      + 'is parked on it — the ghost is drawn at the hover position, so without this B10 would '
      + 'measure the absence of a GHOST rather than the absence of a REPAINT',
      !!blank, JSON.stringify(blank));
    if (blank) {
      const g = canvasOfTile(blank.col, blank.row);
      await mouse('mouseMoved', aimX(g.x + 4), aimY(g.y + 4), { buttons: 0 });
      await sleep(500);
    }
    const pasteBtn = await readFlip('X ⇄');
    const clipBefore = await c.json('window.__dbg.aeon.mapClipboardWords()');
    const mapBeforePaste = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    const undoBeforePaste = await c.evalExpr('window.__dbg.aeon.canUndo()');
    await c.evalExpr(SNAP('ghostPre'));
    const pasteClick = await clickFlip('X ⇄');
    await c.evalExpr(SNAP('ghostPost'));
    const clipAfter = await c.json('window.__dbg.aeon.mapClipboardWords()');
    const mapAfterPaste = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);

    check('B9a', 'in PASTE mode the same button is enabled and clicks',
      pasteBtn.found && pasteBtn.disabled === false && pasteClick.clicked === true,
      JSON.stringify(pasteBtn));
    check('B9b', '⭐ THE BUTTON MIRRORED THE PENDING PASTE, both halves, on the model',
      !!clipBefore && !!clipAfter
        && eq(clipAfter.nametable, flipRegion(clipBefore.nametable, clipBefore.widthTiles, clipBefore.heightTiles, 'h', 'art'))
        && !eq(clipAfter.nametable, clipBefore.nametable),
      `clip ${clipBefore?.widthTiles}x${clipBefore?.heightTiles}; `
      + `matches the transform=${!!clipAfter && eq(clipAfter.nametable, flipRegion(clipBefore.nametable, clipBefore.widthTiles, clipBefore.heightTiles, 'h', 'art'))}`);
    check('B9c', '...and it is NOT an edit: the map underneath is untouched and no undo step appeared',
      eq(mapBeforePaste, mapAfterPaste)
        && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === undoBeforePaste,
      `map unchanged=${eq(mapBeforePaste, mapAfterPaste)} canUndo ${undoBeforePaste} -> `
      + `${await c.evalExpr('window.__dbg.aeon.canUndo()')}`);

    // ⭐ THE ROW THAT ONLY A BUTTON TEST CAN FAIL. The key path repainted the
    // ghost inline; the panel cannot reach that canvas, so the repaint is a
    // registered callback. A build where only the key repaints passes every
    // key row in the sibling harness and fails HERE.
    const gdiff = await c.json(DIFF('ghostPre', 'ghostPost'));
    const overlayMoved = Object.entries(gdiff)
      .filter(([k]) => !k.startsWith('map-canvas'))
      .filter(([, v]) => v && !v.error && v.n > 0);
    const mapUnmoved = Object.entries(gdiff)
      .filter(([k]) => k.startsWith('map-canvas')).every(([, v]) => v && v.n === 0);
    check('B10', '⭐ DISCRIMINATING: clicking the BUTTON repainted the paste GHOST — the overlay '
      + 'canvas\'s own pixels moved (and the MAP canvas\'s did not), so the mirrored art is what '
      + 'is now under the cursor',
      overlayMoved.length > 0 && mapUnmoved,
      `overlays that changed: ${JSON.stringify(overlayMoved.map(([k, v]) => [k, v.n]))}\n        `
      + `full diff: ${JSON.stringify(gdiff)}`);
    ruledOut('B10', 'the MAP canvas moving instead (map-canvas keys are excluded, and B9c requires '
      + 'the map model to be untouched); a canvas that changed size rather than content '
      + '(shape-changed is reported as an error, not as a change)');

    await shoot(c, 'paste-ghost-flipped');
    await escape();
    let guard = 0;
    while ((await c.evalExpr('window.__dbg.aeon.canUndo()')) === true && guard++ < 8) await chord('z', CTRL);
    const ntFinal = await c.json(`window.__dbg.aeon.ntRect(0, ${ART.col}, ${ART.row}, ${SELW}, ${SELH})`);
    check('B11', 'the act is left exactly as found — every button-made edit undone, nothing saved',
      eq(ntFinal, ntBefore) && (await c.evalExpr('window.__dbg.aeon.canUndo()')) === false,
      `restored=${eq(ntFinal, ntBefore)} after ${guard} undo steps`);

    const passed = results.filter((r) => r.ok).length;
    log(`\n=== ${passed}/${results.length} PASSED ===`);
    if (fails.length) { log('FAILING ROWS:'); for (const f of fails) log('  ' + f); }
    log(`env: dpr=${dpr} rect=${JSON.stringify(rect)} viewport=${JSON.stringify(VIEWPORT)}`);
    process.exitCode = fails.length ? 1 : 0;
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
