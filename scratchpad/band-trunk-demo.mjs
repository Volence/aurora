#!/usr/bin/env node
// ===========================================================================
// BAND TRUNK DEMO — draw a vertical trunk into a BgAnim band, in the real app.
// ===========================================================================
//
// Not a gate. This exists to SHOW the owner the band-art road end to end:
//
//   1. the Effects facet, the band card, the 8-thumbnail bank strip
//   2. clicking bank 0 opens that band in the Art facet's composer
//   3. the RECTANGLE tool draws a vertical trunk in one drag
//   4. the map repaints every cell that names one of the band's slots
//   5. `Shift` derives banks 1-7 from phase 0 — eight frames from one drawing
//
// It still ASSERTS the things a screenshot cannot prove (the pixels landed in
// the slots we aimed at; the banks actually changed), because a demo that only
// produces pictures cannot tell a working feature from a convincing one.
//
// NEVER WRITES THE LIVE AEON TREE. It opens a writable copy and does not save
// at all — the drawing lives in the editor's history and is thrown away with
// the process. The copy's override is refreshed from the live file by the
// caller so what is drawn on is what actually ships.
//
// Aim discipline per docs/OVERSEER.md §Instruments: every mouse position is an
// integer client pixel derived from the canvas's own measured rect, because
// dpr varies run to run here and a fractional aim lands one row off.
// ===========================================================================

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9401);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN ?? `${ROOT}/node_modules/.bin/electron`;
const LIVE_AEON = '/home/volence/sonic_hacks/aeon';
const AEONDIR = process.env.AEON_DIR ?? `${ROOT}/scratchpad/fixtures/aeon-bg-writable`;
if (AEONDIR.replace(/\/$/, '') === LIVE_AEON) throw new Error('refusing to open the LIVE aeon tree');
const SHOTS = `${ROOT}/scratchpad/shots-band-trunk`;
mkdirSync(SHOTS, { recursive: true });
const SCREEN = process.env.SCREEN ?? '1680x1050';
const [SCREEN_W, SCREEN_H] = SCREEN.split('x').map(Number);

const CONTRACT = JSON.parse(readFileSync(join(ROOT, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8'));
const OVERRIDE_PATH = join(AEONDIR, CONTRACT.path);
const BEFORE_TEXT = readFileSync(OVERRIDE_PATH, 'utf8');
if (BEFORE_TEXT !== readFileSync(join(LIVE_AEON, CONTRACT.path), 'utf8')) {
  throw new Error("the copy's override differs from the live one — refresh it first");
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
      if (page) return page;
    } catch { /* not up */ }
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const results = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
}
function note(what, detail) { console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`); }
let shotN = 0;
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  const file = `${String(++shotN).padStart(2, '0')}-${name}.png`;
  writeFileSync(`${SHOTS}/${file}`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-band-trunk/${file}`);
  return file;
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

/** Open a collapsible section by its header text (bands arrive COLLAPSED, item 49). */
const OPEN_SECTION = (re) => String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => ${re}.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-section';
  const open = hdr.parentElement.parentElement.children.length > 1;
  if (open) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

/** The composer canvas: crosshair cursor, aspect = cols/rows. */
const CROSSHAIR_CANVASES = String.raw`
(() => [...document.querySelectorAll('canvas')]
  .filter((cv) => getComputedStyle(cv).cursor === 'crosshair')
  .map((cv) => { const r = cv.getBoundingClientRect();
    return { w: cv.width, h: cv.height, left: r.left, top: r.top, cssW: r.width, cssH: r.height }; }))()`;

const CANVAS_RECT = String.raw`
(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
  const r = cv.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`;

const PIXEL_AT = (x, y) => String.raw`
(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
  const ctx = cv.getContext('2d'); if (!ctx) return null;
  const d = ctx.getImageData(Math.round(${x}), Math.round(${y}), 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] }; })()`;

async function main() {
  console.log(`\n=== BAND TRUNK DEMO — viewport ${SCREEN} ===`);
  console.log(`    tree opened (a COPY, never the live one): ${AEONDIR}\n`);
  if (!(await portFree())) throw new Error(`port ${PORT} already serves a CDP target`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1920x1200x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    const page = await waitForTarget();
    c = cdp(page.webSocketDebuggerUrl);
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
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // Window to the demo frame.
    const bounds = await c.send('Browser.getWindowForTarget', {}).catch(() => null);
    if (bounds) {
      await c.send('Browser.setWindowBounds', {
        windowId: bounds.windowId, bounds: { left: 0, top: 0, width: SCREEN_W, height: SCREEN_H, windowState: 'normal' },
      }).catch(() => {});
      await sleep(900);
    }
    const vp = await c.json('({ w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio })');
    note(`viewport ${vp.w}x${vp.h}, devicePixelRatio ${vp.dpr} (printed because it varies run to run here)`);

    const mouse = (type, x, y, clickCount = 1) => c.send('Input.dispatchMouseEvent',
      { type, x, y, button: 'left', buttons: type === 'mouseMoved' ? 0 : 1, clickCount });
    const dragTo = async (x0, y0, x1, y1, steps = 8) => {
      await mouse('mouseMoved', x0, y0, 0); await sleep(70);
      await mouse('mousePressed', x0, y0); await sleep(90);
      for (let i = 1; i <= steps; i++) {
        await mouse('mouseMoved', Math.round(x0 + (x1 - x0) * i / steps), Math.round(y0 + (y1 - y0) * i / steps));
        await sleep(45);
      }
      await mouse('mouseReleased', x1, y1); await sleep(600);
    };
    const facet = async (name) => { const ok = await c.evalExpr(clickByText(`/^${name}$/`)); await sleep(1000); return ok; };
    const hash = () => c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const tileAt = (i) => c.json(`window.__dbg.aeon.bgOverrideTileAt(${i})`);

    // ---- open the aeon copy -------------------------------------------------
    const opened = await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    await sleep(2500);
    note(`opened: ${JSON.stringify(opened)}`);

    // =====================================================================
    // 1 — the Effects facet: the band card and its bank strip
    // =====================================================================
    await facet('Effects');
    const sect = await c.evalExpr(OPEN_SECTION('/^BG animation bands/'));
    await sleep(700);
    note(`"BG animation bands" section: ${sect} (it ARRIVES collapsed — item 49)`);
    const bands = await c.json('window.__dbg.aeon.bands()');
    const band0 = bands[0];
    note(`band 0: ${band0.cols} cols x ${band0.rows} rows = ${band0.tileCount} slots, `
      + `driver ${band0.driver}, pattern ${band0.cols * 8}px, slots ${band0.slotBase}..${band0.slotBase + band0.tileCount - 1}`);

    // The trunk's footprint, derived from the band's geometry BEFORE anything is
    // drawn — an 8px-wide bar down the middle of the pattern, full height. The
    // map cell we watch has to name one of THESE slots, or the row would be
    // asking whether an unpainted tile changed (it would not, and the demo would
    // report a defect that is really a badly chosen observation point).
    const docW = band0.cols * 8, docH = band0.rows * 8;
    const trunkX0 = Math.floor(docW / 2) - 4;
    const trunkX1 = trunkX0 + 7;
    const colFrom = Math.floor(trunkX0 / 8), colTo = Math.floor(trunkX1 / 8);
    const expectSlots = [];
    for (let cc = colFrom; cc <= colTo; cc++) for (let rr = 0; rr < band0.rows; rr++) expectSlots.push(band0.slotBase + cc * band0.rows + rr);
    expectSlots.sort((x, y) => x - y);
    const strip = await c.json(String.raw`
      (() => { const s = document.querySelector('[data-band-bank-strip="0"]'); if (!s) return null;
        return { thumbs: [...s.querySelectorAll('canvas[data-bank]')].map((cv) => cv.getAttribute('data-bank')),
                 hint: (s.textContent || '').trim().slice(0, 90) }; })()`);
    check('D1', 'the band card carries a strip of 8 phase banks, each clickable to draw',
      !!strip && strip.thumbs.length === 8, `banks ${JSON.stringify(strip && strip.thumbs)} — "${strip && strip.hint}"`);
    await shot(c, 'effects-band-card');

    // A cell on screen that shows one of this band's slots, so we can watch the
    // map repaint. Chosen by reading the LAYOUT, never assumed.
    // THE MAP ARRIVES ON THE FOREGROUND PLANE. A band is background art, so a
    // pixel read taken on FG watches empty sky and reports "nothing changed"
    // about a tile it was never showing — which is a badly aimed observation,
    // not a defect. Switch the plane, and say so in the output.
    const bgOn = await c.evalExpr(clickByText('/^BG$/'));
    await sleep(900);
    note(`map plane switched to BG: ${bgOn} (it arrives on FG; the band is background art)`);
    const viewE = await c.json('window.__dbg.view()');
    const rectE = await c.json(CANVAS_RECT);
    const PLANE_COLS = 64;
    const CELL = 8;
    const MASK = CONTRACT.constants.LAYOUT_TILE_INDEX_MASK.value;
    // Built in ONE page-side loop — 4096 round trips would take longer than the demo.
    const layout = await c.json(String.raw`
      (() => { const out = []; for (let i = 0; i < 4096; i++) out.push(window.__dbg.aeon.bgOverrideLayoutAt(i)); return out; })()`);
    let covered = null;
    if (Array.isArray(layout) && layout.length) {
      for (let i = 0; i < layout.length && !covered; i++) {
        const slot = layout[i] & MASK;
        if (!expectSlots.includes(slot)) continue;
        const col = i % PLANE_COLS, row = Math.floor(i / PLANE_COLS);
        const cx = Math.round(rectE.left + (col * CELL + CELL / 2) * viewE.zoom);
        const cy = Math.round(rectE.top + (row * CELL + CELL / 2) * viewE.zoom);
        if (cx > rectE.left + rectE.width - 2 || cy > rectE.top + rectE.height - 2) continue;
        covered = { cell: i, slot, aim: { x: cx, y: cy } };
      }
    }
    const px = async (aim) => c.json(PIXEL_AT(`${aim.x} - ${rectE.left}`, `${aim.y} - ${rectE.top}`));
    const pixBefore = covered ? await px(covered.aim) : null;
    if (covered) note(`watching map cell ${covered.cell}, slot ${covered.slot} — one the trunk WILL cover (${JSON.stringify(expectSlots)}) — at (${covered.aim.x},${covered.aim.y}); pixel now ${JSON.stringify(pixBefore)}`);
    else note(`no on-screen cell names a slot the trunk will cover (${JSON.stringify(expectSlots)}) at this view — the map row will be skipped`);

    // =====================================================================
    // 2 — click bank 0: the Art facet opens that band as a document
    // =====================================================================
    const h0 = await hash();
    await c.evalExpr(`document.querySelector('[data-band-bank-strip="0"] canvas[data-bank="0"]').click()`);
    await sleep(1400);
    const canvases = await c.json(CROSSHAIR_CANVASES);
    const doc = canvases.find((k) => Math.abs(k.w / k.h - band0.cols / band0.rows) < 0.01);
    check('D2', `clicking bank 0 opens it in the Art facet as a ${band0.cols}x${band0.rows}-tile document`,
      !!doc, `crosshair canvases ${JSON.stringify(canvases)}`);
    if (!doc) throw new Error('no composer canvas — cannot draw');
    await shot(c, 'composer-bank0-before');

    // =====================================================================
    // 3 — arm the RECTANGLE tool and draw a vertical trunk in ONE drag
    // =====================================================================
    const armed = await c.evalExpr(String.raw`
      (() => { const b = [...document.querySelectorAll('button')].find((e) => (e.title || '').startsWith('Rectangle'));
        if (!b) return 'no-button'; b.click(); return 'clicked'; })()`);
    await sleep(400);
    const toolNow = await c.evalExpr('window.__dbg.aeon.state().tool').catch(() => null);
    check('D3', 'the Rectangle tool is armed from the tool dock (a real click, not a store poke)',
      armed === 'clicked', `dock click=${armed} tool=${toolNow}`);

    // THE TRUNK COLOUR IS DERIVED FROM THE LEVEL'S OWN PALETTE, not typed. The
    // index->RGB map is recovered from the app's OWN render: every pixel of the
    // bank canvas has a known index (the tile arrays) and a rendered colour, so
    // reading both gives the palette this background actually draws through —
    // no new debug door, and no guess about which line is in force.
    const paletteMap = await c.json(String.raw`
      (() => {
        const cv = [...document.querySelectorAll('canvas')].filter((k) => getComputedStyle(k).cursor === 'crosshair')[0];
        const ctx = cv.getContext('2d');
        const z = cv.width / (${band0.cols} * 8);
        const out = {};
        for (let cc = 0; cc < ${band0.cols}; cc++) for (let rr = 0; rr < ${band0.rows}; rr++) {
          const t = window.__dbg.aeon.bgOverrideTileAt(${band0.slotBase} + cc * ${band0.rows} + rr);
          if (!t) continue;
          for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const idx = t[y * 8 + x];
            if (out[idx]) continue;
            const d = ctx.getImageData(Math.floor((cc * 8 + x) * z + z / 2), Math.floor((rr * 8 + y) * z + z / 2), 1, 1).data;
            out[idx] = [d[0], d[1], d[2]];
          }
        }
        return out;
      })()`);
    const barks = Object.entries(paletteMap)
      .map(([i, [r, g, b]]) => ({ i: Number(i), r, g, b, warmth: r - b, lum: 0.3 * r + 0.6 * g + 0.1 * b }))
      // Bark is a DESATURATED warm tone: green sits between blue and red rather
      // than at either end. Without the `g` band a pure red (255,0,0) wins the
      // warmth sort outright, which is how the first run picked one.
      .filter((k) => k.r - k.g >= 20 && k.g - k.b >= 8 && k.lum >= 40 && k.lum <= 170)
      .sort((x, y) => y.warmth - x.warmth);
    const COLOUR = process.env.TRUNK_COLOUR ? Number(process.env.TRUNK_COLOUR) : (barks[0]?.i ?? 6);
    note(`palette recovered from the render: ${JSON.stringify(paletteMap)}`);
    note(`trunk colour ${COLOUR}${barks[0] && COLOUR === barks[0].i
      ? ` — the warmest mid-luminance bark tone in this background's own palette (rgb ${barks[0].r},${barks[0].g},${barks[0].b})`
      : ' — from TRUNK_COLOUR'}`);
    await c.evalExpr(`window.__dbg.setPaintColor(${COLOUR})`);

    // The trunk: a vertical bar the full height of the band, centred on the
    // pattern. Derived from the band's own geometry, never typed.
    const zoom = doc.cssW / docW;
    const docPx = (x, y) => ({
      x: Math.round(doc.left + (x + 0.5) * zoom),
      y: Math.round(doc.top + (y + 0.5) * zoom),
    });
    const a = docPx(trunkX0, 0), b = docPx(trunkX1, docH - 1);
    note(`trunk: doc ${docW}x${docH}px at zoom ${zoom}; rect x ${trunkX0}..${trunkX1}, y 0..${docH - 1}; `
      + `drag (${a.x},${a.y}) -> (${b.x},${b.y}) — integer client pixels`);
    const tilesBefore = [];
    for (let s = 0; s < band0.tileCount; s++) tilesBefore.push(await tileAt(band0.slotBase + s));
    await dragTo(a.x, a.y, b.x, b.y, 10);
    await sleep(700);
    await shot(c, 'composer-trunk-drawn');

    // Did the pixels land where the drag aimed? Column-major: doc cell (c,r) is
    // slot c*rows + r.
    const tilesAfter = [];
    for (let s = 0; s < band0.tileCount; s++) tilesAfter.push(await tileAt(band0.slotBase + s));
    const changedSlots = tilesAfter
      .map((t, s) => (JSON.stringify(t) === JSON.stringify(tilesBefore[s]) ? null : band0.slotBase + s))
      .filter((s) => s !== null);
    check('D4', 'ONE rectangle drag paints a full-height vertical trunk across exactly the tile columns it spanned',
      JSON.stringify(changedSlots) === JSON.stringify(expectSlots),
      `changed slots ${JSON.stringify(changedSlots)} vs expected ${JSON.stringify(expectSlots)} (cols ${colFrom}..${colTo}, all ${band0.rows} rows)`);
    const h1 = await hash();
    check('D5', 'the document still serializes after the edit (the writer refuses phases[0] != the static prefix)',
      h1 !== null && h1 !== h0, `hash ${h0} -> ${h1}`);

    // =====================================================================
    // 4 — back to the map: every cell naming a painted slot repaints
    // =====================================================================
    await facet('Effects');
    await sleep(900);
    await shot(c, 'map-with-trunk');
    if (covered) {
      const rectE2 = await c.json(CANVAS_RECT);
      const pixAfter = JSON.stringify(rectE2) === JSON.stringify(rectE) ? await px(covered.aim) : null;
      check('D6', 'the map repaints the band cells — the level shows the trunk without a save or a build',
        pixAfter !== null && JSON.stringify(pixAfter) !== JSON.stringify(pixBefore),
        `cell ${covered.cell} pixel ${JSON.stringify(pixBefore)} -> ${JSON.stringify(pixAfter)}`);
    }

    // =====================================================================
    // 5 — Shift: eight frames derived from the one drawing
    // =====================================================================
    const banksBefore = await c.json('window.__dbg.aeon.bands()[0].phases ?? null').catch(() => null);
    const bankHashBefore = await c.json(String.raw`
      (() => { const out = {};
        for (const cv of document.querySelectorAll('[data-band-bank-strip="0"] canvas[data-bank]')) {
          const ctx = cv.getContext('2d'); const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let h = 2166136261; for (let i = 0; i < d.length; i += 4) { h ^= d[i] + d[i + 1] * 3 + d[i + 2] * 7; h = Math.imul(h, 16777619); }
          out[cv.getAttribute('data-bank')] = h >>> 0; }
        return out; })()`);
    const shifted = await c.evalExpr(String.raw`
      (() => { const s = document.querySelector('[data-band-bank-strip="0"]'); if (!s) return 'no-strip';
        const b = [...s.querySelectorAll('button')].find((e) => /Shift/.test((e.textContent || '')));
        if (!b) return 'no-button'; if (b.disabled) return 'disabled'; b.click(); return 'clicked'; })()`);
    await sleep(1400);
    const bankHashAfter = await c.json(String.raw`
      (() => { const out = {};
        for (const cv of document.querySelectorAll('[data-band-bank-strip="0"] canvas[data-bank]')) {
          const ctx = cv.getContext('2d'); const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let h = 2166136261; for (let i = 0; i < d.length; i += 4) { h ^= d[i] + d[i + 1] * 3 + d[i + 2] * 7; h = Math.imul(h, 16777619); }
          out[cv.getAttribute('data-bank')] = h >>> 0; }
        return out; })()`);
    const movedBanks = Object.keys(bankHashAfter).filter((k) => bankHashAfter[k] !== bankHashBefore[k]);
    check('D7', 'Shift derives banks 1-7 from the drawing — eight animation frames from one trunk, bank 0 untouched',
      shifted === 'clicked' && movedBanks.length === 7 && !movedBanks.includes('0'),
      `click=${shifted} banks that changed: ${JSON.stringify(movedBanks)}`);
    void banksBefore;
    // Bring the strip into view before the shot — D7 passes off canvas hashes,
    // but the POINT of this frame is that a person can see eight frames of the
    // trunk stepping across the pattern, and it sits below the fold by default.
    await c.evalExpr(String.raw`
      (() => { const s = document.querySelector('[data-band-bank-strip="0"]');
        if (s) s.scrollIntoView({ block: 'center' }); return !!s; })()`);
    await sleep(700);
    await shot(c, 'bank-strip-after-shift');

    // Nothing was saved. Prove it against the file on disk.
    const onDisk = readFileSync(OVERRIDE_PATH, 'utf8');
    check('D8', 'NOTHING was written to disk — the drawing lives in the editor only, and the live aeon tree was never opened',
      onDisk === BEFORE_TEXT, `copy's override byte-identical to before: ${onDisk === BEFORE_TEXT}; live tree opened: no`);

    const pass = results.filter((r) => r.ok).length;
    console.log(`\n=== ${pass}/${results.length} ===`);
    console.log(`shots in scratchpad/shots-band-trunk/`);
    if (pass !== results.length) process.exitCode = 1;
  } finally {
    try { c && c.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
    await sleep(600);
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
  }
}

main().catch((e) => { console.error(`\nFATAL: ${e.stack || e.message}`); process.exitCode = 2; });
