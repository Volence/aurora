#!/usr/bin/env node
// Plan-6 verification harness: classic's Art > Tile tier on the shared pixel
// substrate. Drives the BUILT (VITE_AURORA_DEBUG=1) app under xvfb over CDP.
//
// Launch rules learned the hard way on this branch:
//   - node_modules/.bin/electron is a NODE SHIM. Spawn DETACHED and kill the
//     whole PROCESS GROUP, or the real Electron keeps the debug port and the
//     next run silently attaches to the previous window.
//   - Verify the port is free BEFORE launching.
//   - xvfb-run, never the user's DISPLAY.
//
// Evidence rules:
//   - Pixel readback off the tile canvas, not eyeballed screenshots.
//   - Undo is COUNTED (Ctrl+Z presses to return to a known grid / to empty the
//     stack, read off the Undo chip's enabled state), never eyeballed.
//   - Negative controls run alongside the real checks (`neg(...)`); the run
//     FAILS if any of them passes.

import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 9351);
const ROOT = '/home/volence/sonic_hacks/aurora/.claude/worktrees/ux-plan6';
const ELECTRON = '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron';
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const AEONDIR = '/home/volence/sonic_hacks/aeon/';
const SHOTS = `${ROOT}/scratchpad/shots`;
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
async function portFree() {
  try { await getJSON('/json/version'); return false; } catch { return true; }
}
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

// ---------------------------------------------------------------------------
const results = [];
const fails = [];
const negFails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, detail });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** A NEGATIVE CONTROL: the assertion is KNOWN FALSE. If it reports ok, the probe is blind. */
function neg(id, name, ok, detail) {
  const good = ok === false;
  console.log(`${good ? 'neg-ok' : 'NEG-BROKEN'}  [${id}] (planted) ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  results.push({ id, name: `(planted false) ${name}`, ok: good, detail, negative: true });
  if (!good) negFails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name} — ${detail}`);
  results.push({ id, name, ok: null, detail });
}

// ---------------------------------------------------------------------------
// In-page helpers. All geometry lives here so the driver never guesses layout.
// ---------------------------------------------------------------------------
const INSTALL_HELPERS = String.raw`
(() => {
  const H = {};
  H.rail = () => [...document.querySelectorAll('div')].find((d) => d.style && d.style.width === '44px');
  H.railDivs = () => [...document.querySelectorAll('div')].filter((d) => d.style && d.style.width === '44px').length;
  H.railTools = () => { const r = H.rail(); return r ? [...r.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')) : null; };
  H.clickTool = (label) => {
    const r = H.rail(); if (!r) return 'no-rail';
    const b = [...r.querySelectorAll('button[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith(label));
    if (!b) return 'no-tool'; b.click(); return 'clicked';
  };
  H.activeTool = () => {
    const r = H.rail(); if (!r) return null;
    const b = [...r.querySelectorAll('button[aria-label]')].find((e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return b ? b.getAttribute('aria-label') : null;
  };

  H.optionBar = () => {
    const cands = [...document.querySelectorAll('div')].filter(
      (d) => d.style && d.style.height === '32px' && d.style.display === 'flex' && d.style.borderBottom);
    return cands.find((d) => [...d.querySelectorAll('button')].some((b) => (b.title || '').startsWith('Mirror mode'))) || cands[0] || null;
  };
  H.barButtons = () => { const b = H.optionBar(); return b ? [...b.querySelectorAll('button')].map((e) => ({
    title: e.title, text: e.textContent.trim(), disabled: e.disabled, opacity: getComputedStyle(e).opacity })) : null; };
  H.barText = () => { const b = H.optionBar(); return b ? b.innerText.replace(/\s+/g, ' ').trim() : null; };
  H.barSpans = () => { const b = H.optionBar(); return b ? [...b.querySelectorAll('span')].filter((s) => s.children.length === 0).map((s) => s.textContent.trim()) : null; };
  H.clickBar = (title) => {
    const bar = H.optionBar(); if (!bar) return 'no-bar';
    const b = [...bar.querySelectorAll('button')].find((e) => e.title === title);
    if (!b) return 'no-button';
    if (b.disabled) return 'disabled';
    b.click(); return 'clicked';
  };

  H.clickPill = (label) => {
    const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  H.clickTier = (label) => {
    const b = [...document.querySelectorAll('button')].find((e) => {
      if (e.textContent.trim() !== label) return false;
      const p = e.parentElement;
      if (!p || p.children.length !== 3) return false;
      const kids = [...p.children].map((k) => k.textContent.trim()).join(',');
      return kids === 'Chunk,Block,Tile';
    });
    if (!b) return false; b.click(); return true;
  };
  H.activeTier = () => {
    const bar = [...document.querySelectorAll('div')].find((d) => [...d.children].length === 3
      && [...d.children].map((k) => k.textContent.trim()).join(',') === 'Chunk,Block,Tile');
    if (!bar) return null;
    const on = [...bar.children].find((b) => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return on ? on.textContent.trim() : null;
  };

  // ---- the tile canvas (inside TileTab's fixed 240x240 overflow:auto box) ----
  // Found via the HOLDER (the margin:auto centring div), not by a literal
  // '240px' box: H3.1 made the viewport take the editor column's size, so the
  // old style-string match would silently find nothing and every zoom/pan/hit
  // check below would report "no tile canvas" rather than a result.
  H.canvas = () => {
    const holder = [...document.querySelectorAll('div')].find(
      (d) => d.style && d.style.margin === 'auto' && d.querySelector('canvas'));
    return holder ? holder.querySelector('canvas') : null;
  };
  H.scroller = () => { const c = H.canvas(); return c ? c.parentElement.parentElement : null; };
  H.zoom = () => { const c = H.canvas(); return c ? c.width / 8 : null; };
  H.ctx = () => { const c = H.canvas(); return c ? c.getContext('2d', { willReadFrequently: true }) : null; };
  H.grid = () => {
    const c = H.canvas(), g = H.ctx(); if (!c || !g) return null;
    const z = c.width / 8, out = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = g.getImageData(Math.floor((x + 0.5) * z), Math.floor((y + 0.5) * z), 1, 1).data;
      out.push(d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3]);
    }
    return out;
  };
  H.hash = () => {
    const c = H.canvas(), g = H.ctx(); if (!c || !g) return null;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { h ^= d[i] + (d[i+1] << 3) + (d[i+2] << 6) + (d[i+3] << 9); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  H.point = (x, y) => {
    const s = H.scroller(), c = H.canvas(); if (!s || !c) return null;
    const z = c.width / 8;
    const lx = (x + 0.5) * z, ly = (y + 0.5) * z;
    let cr = c.getBoundingClientRect(); const sr = s.getBoundingClientRect();
    const relX = cr.left - sr.left + lx, relY = cr.top - sr.top + ly;
    if (relX < 10 || relX > sr.width - 10) s.scrollLeft += relX - sr.width / 2;
    if (relY < 10 || relY > sr.height - 10) s.scrollTop += relY - sr.height / 2;
    cr = c.getBoundingClientRect();
    const px = cr.left + lx, py = cr.top + ly;
    const r2 = s.getBoundingClientRect();
    return { x: Math.round(px), y: Math.round(py), zoom: z,
             inView: px >= r2.left && px <= r2.right && py >= r2.top && py <= r2.bottom };
  };
  H.pixelAtScreen = (sx, sy) => {
    const c = H.canvas(); if (!c) return null;
    const r = c.getBoundingClientRect(), z = c.width / 8;
    const x = Math.floor((sx - r.left) / z), y = Math.floor((sy - r.top) / z);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return { x, y };
  };
  H.scroll = () => { const s = H.scroller(); return s ? { l: Math.round(s.scrollLeft), t: Math.round(s.scrollTop) } : null; };
  H.canvasStyle = () => { const c = H.canvas(); if (!c) return null; const cs = getComputedStyle(c); return { cursor: cs.cursor, opacity: cs.opacity }; };

  // ---- swatch row (16 buttons, title "index N" / "index 0 — transparent") ----
  // TileTab's own 16-swatch row: 22x22 inline-styled buttons titled "index N".
  // Scoped by SIZE because ClassicPalettePanel also emits four buttons titled
  // "index 0 — transparent" (13x16), which a title-only filter picks up.
  H.swatches = () => [...document.querySelectorAll('button[title]')]
    .filter((b) => /^index \d+/.test(b.title) && b.style && b.style.width === '22px');
  H.pickSwatch = (i) => { const s = H.swatches(); if (!s[i]) return false; s[i].click(); return true; };
  H.selectedSwatch = () => {
    const s = H.swatches();
    return { count: s.length, index: s.findIndex((b) => getComputedStyle(b).borderWidth.startsWith('2px')),
             widths: s.map((b) => getComputedStyle(b).borderWidth).join(' ') };
  };

  H.tileTitle = () => { const s = [...document.querySelectorAll('span')].find((e) => /^Tile \$[0-9A-F]+$/.test(e.textContent.trim())); return s ? s.textContent.trim() : null; };
  H.lockedBanner = () => {
    const d = [...document.querySelectorAll('div')].find((e) => e.textContent.trim().startsWith('\u{1F512} tile') && e.children.length === 0);
    return d ? d.textContent.trim() : null;
  };
  H.pasteBtn = () => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Paste'); return b ? { disabled: b.disabled } : null; };
  H.copy = () => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Copy'); if (!b) return false; b.click(); return true; };
  H.thumbs = () => [...document.querySelectorAll('button[title^="tile $"]')];
  H.lockedThumbs = () => H.thumbs().filter((b) => b.textContent.includes('\u{1F512}')).slice(0, 6).map((b) => b.title);
  H.thumbTitle = (i) => { const t = H.thumbs(); return t[i] ? t[i].title : null; };
  H.clickThumb = (title) => { const b = H.thumbs().find((e) => e.title === title); if (!b) return false; b.click(); return true; };
  H.chipEnabled = (label) => {
    const s = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && e.textContent.trim() === label);
    return s ? getComputedStyle(s).opacity === '1' : null;
  };
  H.toasts = () => document.body.innerText.split('\n').map((l) => l.trim())
    .filter((l) => /view-only|square selection|refused|failed:/i.test(l));

  // ---- thumbnail repaint counter (TileThumb canvases are exactly 26x26) ----
  H.armThumbCounter = () => {
    const P = CanvasRenderingContext2D.prototype;
    if (!P.__origDrawImage) {
      P.__origDrawImage = P.drawImage;
      window.__thumbDraws = 0;
      P.drawImage = function (...a) { if (this.canvas && this.canvas.width === 26) window.__thumbDraws++; return P.__origDrawImage.apply(this, a); };
    }
    window.__thumbDraws = 0; return true;
  };
  H.thumbDraws = () => window.__thumbDraws;

  // ---- the DRAWN marquee, read back off the canvas ----
  // PixelViewport strokes the committed selection in SELECTION_MARQUEE
  // (#94e2d5 — Catppuccin teal, canvas-colors.ts:85), dashed, 1px, at
  // sel * zoom + 0.5. Scanning for that colour is the only way to see WHERE the
  // marquee is from outside React: the canvas is 8*zoom, so the bbox of the teal
  // pixels divided by zoom is the selection in art px.
  // (No backticks in here — this whole block lives inside a template literal.)
  H.selectionShape = () => {
    const c = H.canvas(); if (!c) return null;
    const g = c.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const z = c.width / 8;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - 148) < 40 && Math.abs(d[i + 1] - 226) < 40 && Math.abs(d[i + 2] - 213) < 40) {
        const p = i / 4, px = p % c.width, py = (p / c.width) | 0;
        n++;
        if (px < x0) x0 = px; if (py < y0) y0 = py;
        if (px > x1) x1 = px; if (py > y1) y1 = py;
      }
    }
    if (x1 < 0) return null;
    return { x: Math.round(x0 / z), y: Math.round(y0 / z),
             w: Math.round((x1 - x0 + 1) / z), h: Math.round((y1 - y0 + 1) / z), n, z };
  };

  H.contextMenuProbe = () => {
    const c = H.canvas(); if (!c) return null;
    const r = c.getBoundingClientRect();
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 });
    const notCancelled = c.dispatchEvent(ev);
    return { defaultPrevented: ev.defaultPrevented, notCancelled };
  };

  window.__h = H;
  return Object.keys(H).length;
})()`;

// ---------------------------------------------------------------------------
async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);
const esc = (c) => key(c, 'Escape', 'Escape', 27, 0);

async function clickPixel(c, x, y) {
  const pt = await c.json(`window.__h.point(${x}, ${y})`);
  if (!pt) throw new Error('no tile canvas');
  await mouse(c, 'mousePressed', pt.x, pt.y);
  await sleep(50);
  await mouse(c, 'mouseReleased', pt.x, pt.y, { buttons: 0 });
  await sleep(220);
  return pt;
}
async function dragPixels(c, x0, y0, x1, y1, mid) {
  const a = await c.json(`window.__h.point(${x0}, ${y0})`);
  await mouse(c, 'mousePressed', a.x, a.y);
  await sleep(50);
  const b = await c.json(`window.__h.point(${x1}, ${y1})`);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await mouse(c, 'mouseMoved', Math.round(a.x + (b.x - a.x) * i / steps), Math.round(a.y + (b.y - a.y) * i / steps));
    await sleep(30);
  }
  let midResult;
  if (mid) midResult = await mid();
  await mouse(c, 'mouseReleased', b.x, b.y, { buttons: 0 });
  await sleep(280);
  return midResult;
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`   shot: ${name}.png`);
}

const grid = (c) => c.json('window.__h.grid()');
const diff = (a, b) => { const o = []; for (let i = 0; i < 64; i++) if (a[i] !== b[i]) o.push([i % 8, (i / 8) | 0]); return o; };
const same = (a, b) => !!a && !!b && a.join('|') === b.join('|');

/** Ctrl+Z until the Undo chip goes disabled; returns the press count. */
async function drain(c, limit = 60) {
  let n = 0;
  while (n < limit && (await c.evalExpr('window.__h.chipEnabled("Undo")')) === true) { await ctrlZ(c); await sleep(230); n++; }
  return n;
}
/** Ctrl+Z until the tile grid matches `target`; returns press count, or -1. */
async function undoUntilGrid(c, target, limit = 8) {
  for (let n = 1; n <= limit; n++) {
    await ctrlZ(c); await sleep(260);
    if (same(await grid(c), target)) return n;
  }
  return -1;
}

// ---------------------------------------------------------------------------
async function main() {
  if (!(await portFree())) {
    throw new Error(`port ${PORT} ALREADY serves a CDP target — a previous Electron is alive. Refusing to attach to a stale window.`);
  }
  console.log(`port ${PORT} verified free`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;   // xvfb-run supplies its own; never the user's desktop
  const child = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  const killGroup = () => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    try { execSync(`pkill -f 'ux-plan6/dist/main/index.mjs' 2>/dev/null; true`, { shell: '/bin/bash' }); } catch { /* */ }
  };

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    let dbgOk = false;
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof window.__dbg === "object"')) { dbgOk = true; break; } } catch { /* ctx swap */ }
      await sleep(300);
    }
    if (!dbgOk) throw new Error('__dbg never installed — was the build made with VITE_AURORA_DEBUG=1?');
    note('env', '__dbg surface', JSON.stringify(await c.evalExpr('Object.keys(window.__dbg)')));

    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(1800);
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(4000);
    const lvl = await c.evalExpr('window.__dbg.levelState()');
    if (lvl.status !== 'ready') throw new Error(`act not ready: ${JSON.stringify(lvl)}`);
    console.log(`classic act ready: ${JSON.stringify(lvl)}`);
    await c.evalExpr(INSTALL_HELPERS);
    await runChecks(c);
  } finally {
    if (c) { try { c.close(); } catch { /* */ } }
    killGroup();
    await sleep(1000);
    console.log(`port free after teardown: ${await portFree()}`);
  }

  writeFileSync(`${SHOTS}/results.json`, JSON.stringify(results, null, 2));
  console.log('\n================ SUMMARY ================');
  console.log(`checks: ${results.filter((r) => !r.negative && r.ok !== null).length}, fails: ${fails.length}`);
  if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
  if (negFails.length) console.log('!!! NEGATIVE CONTROLS THAT DID NOT FAIL (harness is blind):\n  ' + negFails.join('\n  '));
  else console.log('all negative controls correctly reported FAIL');
  if (fails.length || negFails.length) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
async function runChecks(c) {
  const reinstall = () => c.evalExpr(INSTALL_HELPERS);

  await c.evalExpr('window.__h.clickPill("Art")'); await sleep(1000); await reinstall();
  const tierOk = await c.evalExpr('window.__h.clickTier("Tile")'); await sleep(800); await reinstall();
  note('setup', 'Art facet + Tile tier', `clickTier=${tierOk} activeTier=${await c.evalExpr('window.__h.activeTier()')} tile=${await c.evalExpr('window.__h.tileTitle()')}`);

  // ===== A1 =====
  const railTools = await c.json('window.__h.railTools()');
  const railDivs = await c.evalExpr('window.__h.railDivs()');
  const EXPECT8 = ['Pencil (paint pixels)', 'Eraser (paint color 0)', 'Fill (flood fill)', 'Eyedropper (pick color)',
                   'Line', 'Rectangle', 'Select (marquee)', 'Dither brush'];
  check('1', 'Tile tier: one 44px rail with exactly 8 tools (pencil, eraser, fill, eyedropper, line, rect, select, dither)',
    railDivs === 1 && JSON.stringify(railTools) === JSON.stringify(EXPECT8),
    `railDivs=${railDivs} tools=${JSON.stringify(railTools)}`);
  neg('1n', 'the rail has 9 tools', !!railTools && railTools.length === 9, `actual length ${railTools ? railTools.length : 'null'}`);
  await shot(c, '01-tile-tier');

  // ===== A3 / A4 =====
  const barBtns = await c.json('window.__h.barButtons()');
  const barSpans = await c.json('window.__h.barSpans()');
  const barText = await c.evalExpr('window.__h.barText()');
  const titles = (barBtns || []).map((b) => b.title);
  const TRANSFORM_TITLES = ['Flip horizontal', 'Flip vertical', 'Rotate 90° (square docs/selections only)',
                            'Wrap-shift up', 'Wrap-shift down', 'Wrap-shift left', 'Wrap-shift right'];
  const hasMirror = titles.some((t) => t && t.startsWith('Mirror mode'));
  const hasZoom = titles.includes('Zoom in') && titles.includes('Zoom out');
  const hasAllTransforms = TRANSFORM_TITLES.every((t) => titles.includes(t));
  const hasRpt = titles.includes('Toggle 3×3 repeat preview') || (barBtns || []).some((b) => b.text === 'Rpt');
  const hasBrushSpace = (barSpans || []).includes('px') && (barSpans || []).includes('tile');
  const hasPaletteLine = /palette line/i.test(barText || '');

  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(350);
  const hasPixelPerfect = /Pixel-perfect/.test((await c.evalExpr('window.__h.barText()')) || '');
  await c.evalExpr('window.__h.clickTool("Dither")'); await sleep(400);
  const ditherTitles = await c.json('(window.__h.barButtons()||[]).map(b=>b.title)');
  const hasDitherCfg = ditherTitles.some((t) => t && /Checker|Sparse/.test(t));
  await shot(c, '02-options-dither');
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(350);

  check('3', 'options bar = mirror + dither config + pixel-perfect + transform grid + zoom, and NO brush-space / Rpt / palette-line',
    hasMirror && hasDitherCfg && hasPixelPerfect && hasAllTransforms && hasZoom && !hasRpt && !hasBrushSpace && !hasPaletteLine,
    `mirror=${hasMirror} ditherCfg=${hasDitherCfg} pixelPerfect=${hasPixelPerfect} transforms(7/7)=${hasAllTransforms} zoom=${hasZoom} | `
    + `brushSpace=${hasBrushSpace} Rpt=${hasRpt} paletteLine=${hasPaletteLine}\n        bar text: ${JSON.stringify(barText)}`);

  const tBtns = (barBtns || []).filter((b) => TRANSFORM_TITLES.includes(b.title));
  const allEnabled = tBtns.length === 7 && tBtns.every((b) => b.disabled === false && b.opacity === '1');
  check('4', 'the transform grid renders ENABLED (not greyed out) under classic',
    allEnabled, JSON.stringify(tBtns.map((b) => ({ t: b.title, disabled: b.disabled, opacity: b.opacity }))));
  neg('4n', 'every transform button is disabled', tBtns.length === 7 && tBtns.every((b) => b.disabled === true), 'planted');

  // ===== A2: rail absent on chunk/block =====
  const railPer = {};
  for (const tier of ['Chunk', 'Block', 'Tile']) {
    await c.evalExpr(`window.__h.clickTier(${JSON.stringify(tier)})`); await sleep(700); await reinstall();
    railPer[tier] = { railDivs: await c.evalExpr('window.__h.railDivs()'), optionBar: await c.evalExpr('window.__h.optionBar() ? 1 : 0') };
    if (tier !== 'Tile') await shot(c, `03-${tier.toLowerCase()}-tier-no-rail`);
  }
  check('2', 'Chunk and Block tiers draw NO 44px rail CONTAINER (and no options bar)',
    railPer.Chunk.railDivs === 0 && railPer.Block.railDivs === 0 && railPer.Tile.railDivs === 1,
    JSON.stringify(railPer));
  neg('2n', 'the rail container survives on the Chunk tier', railPer.Chunk.railDivs > 0, `chunk railDivs=${railPer.Chunk.railDivs}`);

  // ===== B: drawing =====
  await c.evalExpr('window.__h.clickTier("Tile")'); await sleep(700); await reinstall();
  await c.evalExpr('window.__h.clickThumb(window.__h.thumbTitle(16))'); await sleep(600); await reinstall();
  note('B0', 'working tile', `${await c.evalExpr('window.__h.tileTitle()')} (thumb #16), zoom ${await c.evalExpr('window.__h.zoom()')}`);

  const preDrain = await drain(c);
  note('B0b', 'undo stack drained first', `${preDrain} presses`);
  check('7-pre', 'precondition for the undo counting: the art undo stack starts EMPTY',
    (await c.evalExpr('window.__h.chipEnabled("Undo")')) === false, 'Undo chip disabled');

  const g0 = await grid(c), g0b = await grid(c);
  neg('B-probe', 'the pixel-readback probe reports a change when NOTHING happened',
    !same(g0, g0b), `idle diff = ${diff(g0, g0b).length} pixels`);

  // --- 5: FILL ---
  await c.evalExpr('window.__h.pickSwatch(6)'); await sleep(200);
  const armFill = await c.evalExpr('window.__h.clickTool("Fill")'); await sleep(350);
  const activeFill = await c.evalExpr('window.__h.activeTool()');
  const beforeFill = await grid(c);
  await clickPixel(c, 4, 4);
  const afterFill = await grid(c);
  const filled = diff(beforeFill, afterFill).length;
  check('5', 'Fill is selectable AND actually fills',
    armFill === 'clicked' && activeFill === 'Fill (flood fill)' && filled > 0,
    `arm=${armFill} activeTool="${activeFill}" pixels changed by one fill click = ${filled}`);
  await shot(c, '04-after-fill');
  const undoOnAfterFill = await c.evalExpr('window.__h.chipEnabled("Undo")');
  const fillPresses = await drain(c);
  check('7a', 'ONE fill = exactly ONE Ctrl+Z (stack drains in 1, tile restored)',
    undoOnAfterFill === true && fillPresses === 1 && same(await grid(c), beforeFill),
    `undo enabled after fill=${undoOnAfterFill}; presses to empty the stack=${fillPresses}; tile restored=${same(await grid(c), beforeFill)}`);

  // --- 6a: PENCIL ---
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(300);
  const beforePencil = await grid(c);
  await dragPixels(c, 1, 1, 6, 6);
  const afterPencil = await grid(c);
  const pencilChanged = diff(beforePencil, afterPencil);
  check('6a', 'Pencil draws (a drag writes a run of pixels)', pencilChanged.length >= 3,
    `${pencilChanged.length} pixels changed: ${JSON.stringify(pencilChanged)}`);
  await shot(c, '05-after-pencil-drag');
  const pencilPresses = await drain(c);
  check('7b', 'ONE pencil DRAG = exactly ONE Ctrl+Z (not one per pixel)',
    pencilPresses === 1 && same(await grid(c), beforePencil),
    `presses to empty the stack=${pencilPresses} (a per-pixel stack would need ${pencilChanged.length}); tile restored=${same(await grid(c), beforePencil)}`);

  // --- 6b: LINE ---
  await c.evalExpr('window.__h.clickTool("Line")'); await sleep(300);
  const beforeLine = await grid(c);
  const hLine0 = await c.evalExpr('window.__h.hash()');
  const lineMid = await dragPixels(c, 0, 7, 7, 0, async () => ({ hash: await c.evalExpr('window.__h.hash()') }));
  const afterLine = await grid(c);
  check('6b', 'Line PREVIEWS while dragging and COMMITS on release',
    lineMid.hash !== hLine0 && diff(beforeLine, afterLine).length > 0,
    `canvas changed mid-drag (preview)=${lineMid.hash !== hLine0}; committed pixels=${diff(beforeLine, afterLine).length}`);
  await shot(c, '06-after-line');
  const linePresses = await drain(c);
  check('7b2', 'one line gesture = one undo step', linePresses === 1, `presses=${linePresses}`);

  // --- 6c: RECT ---
  await c.evalExpr('window.__h.clickTool("Rectangle")'); await sleep(300);
  const beforeRect = await grid(c);
  const hRect0 = await c.evalExpr('window.__h.hash()');
  const rectMid = await dragPixels(c, 1, 1, 5, 5, async () => ({ hash: await c.evalExpr('window.__h.hash()') }));
  const afterRect = await grid(c);
  check('6c', 'Rect PREVIEWS while dragging and COMMITS on release',
    rectMid.hash !== hRect0 && diff(beforeRect, afterRect).length > 0,
    `canvas changed mid-drag (preview)=${rectMid.hash !== hRect0}; committed pixels=${diff(beforeRect, afterRect).length}`);
  const rectPresses = await drain(c);
  check('7b3', 'one rect gesture = one undo step', rectPresses === 1, `presses=${rectPresses}`);

  // --- 8: EYEDROPPER ---
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(250);
  await c.evalExpr('window.__h.pickSwatch(9)'); await sleep(220);
  await clickPixel(c, 2, 2);
  await c.evalExpr('window.__h.pickSwatch(3)'); await sleep(250);
  const selBefore = await c.json('window.__h.selectedSwatch()');
  await c.evalExpr('window.__h.clickTool("Eyedropper")'); await sleep(300);
  await clickPixel(c, 2, 2);
  const selAfter = await c.json('window.__h.selectedSwatch()');
  check('8', 'Eyedropper picks a colour into the swatch row',
    selAfter.index === 9 && selBefore.index === 3,
    `painted (2,2) with index 9, armed index ${selBefore.index}, eyedropped -> index ${selAfter.index} (${selAfter.count} swatches)`
    + `\n        border widths before: ${selBefore.widths}\n        border widths after:  ${selAfter.widths}`);
  await shot(c, '07-eyedropper');
  await drain(c);

  // --- 9: right-click ---
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(250);
  await c.evalExpr('window.__h.pickSwatch(5)'); await sleep(220);
  const selRc0 = await c.json('window.__h.selectedSwatch()');
  const gRc0 = await grid(c);
  const rcPt = await c.json('window.__h.point(3,3)');
  await mouse(c, 'mousePressed', rcPt.x, rcPt.y, { button: 'right', buttons: 2 });
  await sleep(80);
  await mouse(c, 'mouseReleased', rcPt.x, rcPt.y, { button: 'right', buttons: 0 });
  await sleep(350);
  const gRc1 = await grid(c);
  const selRc1 = await c.json('window.__h.selectedSwatch()');
  const cm = await c.json('window.__h.contextMenuProbe()');
  const undoRc = await c.evalExpr('window.__h.chipEnabled("Undo")');
  check('9', 'right-click on the tile canvas is NOT intercepted (no eyedrop, no draw, contextmenu default left intact)',
    same(gRc0, gRc1) && selRc1.index === selRc0.index && cm.defaultPrevented === false && cm.notCancelled === true && undoRc === false,
    `tile unchanged=${same(gRc0, gRc1)}; selected swatch ${selRc0.index}->${selRc1.index}; `
    + `contextmenu defaultPrevented=${cm.defaultPrevented} (no app handler cancels it); undo stack still empty=${undoRc === false}`);

  // --- 7c: TRANSFORM = one undo step ---
  await drain(c);
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(200);
  await c.evalExpr('window.__h.pickSwatch(11)'); await sleep(200);
  await clickPixel(c, 0, 0);                 // asymmetric mark; stack depth 1
  const baseT = await grid(c);
  const clickT = await c.evalExpr('window.__h.clickBar("Flip horizontal")');
  await sleep(600);
  const afterT = await grid(c);
  check('T', 'a transform button in classic actually transforms the tile',
    clickT === 'clicked' && !same(baseT, afterT), `click=${clickT}; pixels changed=${diff(baseT, afterT).length}`);
  const tPresses = await undoUntilGrid(c, baseT);
  const restDrain = await drain(c);
  check('7c', 'ONE transform = exactly ONE Ctrl+Z',
    tPresses === 1 && restDrain === 1,
    `Ctrl+Z presses to get back to the pre-transform tile=${tPresses}; presses left to empty the stack afterwards=${restDrain} (the 1 pencil dot)`);
  await shot(c, '08-after-transform-undo');

  // --- pendingAction is cleared on every path (the cross-engine slot) ---
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(200);
  await clickPixel(c, 0, 0);
  const baseD = await grid(c);
  await c.evalExpr('window.__h.clickBar("Flip horizontal")'); await sleep(550);
  const d1 = await grid(c);
  await c.evalExpr('window.__h.clickBar("Flip horizontal")'); await sleep(550);
  const d2 = await grid(c);
  check('18a', 'artStore.pendingAction is cleared by the classic consumer (same transform twice fires twice; two flips = identity)',
    !same(baseD, d1) && same(baseD, d2),
    `flip #1 changed the tile=${!same(baseD, d1)}; flip #2 brought it back=${same(baseD, d2)} `
    + `(if the slot were NOT cleared the second click would write an unchanged value and never re-fire)`);
  await drain(c);

  // ===== C: zoom and pan =====
  /** Wheel one notch over art pixel (px,py) and report whether it stayed put. */
  const anchorTest = async (px, py) => {
    const before = await c.json(`window.__h.zoom()`);
    const box = await c.json(`(() => { const s = window.__h.scroller(), c = window.__h.canvas();
      const sr = s.getBoundingClientRect(), cr = c.getBoundingClientRect();
      return { canvasW: cr.width, boxW: sr.width, canvasH: cr.height, boxH: sr.height,
               centred: cr.width < sr.width,
               fitsBoth: cr.width <= s.clientWidth && cr.height <= s.clientHeight,
               offsetInScroller: Math.round(cr.left - sr.left + s.scrollLeft) }; })()`);
    const pt = await c.json(`window.__h.point(${px}, ${py})`);
    const pxBefore = await c.json(`window.__h.pixelAtScreen(${pt.x}, ${pt.y})`);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: -120, button: 'none', buttons: 0 });
    await sleep(800);
    const after = await c.json(`window.__h.zoom()`);
    const pxAfter = await c.json(`window.__h.pixelAtScreen(${pt.x}, ${pt.y})`);
    return { before, after, pxBefore, pxAfter, box, pt,
             held: !!pxBefore && !!pxAfter && pxAfter.x === pxBefore.x && pxAfter.y === pxBefore.y };
  };
  // THE INVARIANT IS CONDITIONAL, and H3.1 is what made that visible. An anchor
  // is held by adjusting the scroller's scroll offsets, so it can only be held
  // when there is scroll room to spend: while the canvas FITS the viewport the
  // holder's `margin: auto` centres it, `scrollLeft` is pinned at 0, and a zoom
  // simply grows the picture about the centre. That is the correct behaviour for
  // a picture that is entirely on screen (every image editor does it), and it
  // used to be unobservable here only because the box was 240px, so an 8x8 tile
  // overflowed it at any zoom above 30. With the box at 549x590 the tile fits up
  // to zoom 64, so the centred branch is now the normal one — hence: zoom must
  // change, and the pixel must be held IF the canvas overflows, else the view
  // must still be centred rather than jumping to a corner.
  const anchorSmall = await anchorTest(6, 6);          // default zoom: canvas well inside the box
  // BOTH axes: the box is 549x590 and the canvas grows square, so "fits" has to
  // mean fits, not fits-horizontally. (10b's shrunk window fits on width and
  // overflows on height, which is exactly the case a width-only test would
  // mislabel.)
  const fits = anchorSmall.box.fitsBoth;
  // `fits || held` — and 10b below, which runs the SAME probe against a window
  // short enough to overflow and requires `held`, is what stops this being a
  // hole: the anchoring path is still asserted, just where it can apply.
  check('10', 'wheel zoom works, and holds the pixel under the cursor whenever there is scroll room to hold it',
    anchorSmall.after > anchorSmall.before && (fits || anchorSmall.held),
    `canvas FITS the viewport=${fits} (so the view is centred and there is no scroll to anchor with); held=${anchorSmall.held}; `
    + `zoom ${anchorSmall.before} -> ${anchorSmall.after}; pixel under the cursor `
    + `${JSON.stringify(anchorSmall.pxBefore)} -> ${JSON.stringify(anchorSmall.pxAfter)}; `
    + `canvas ${anchorSmall.box.canvasW}px inside a ${anchorSmall.box.boxW}px box (centred=${anchorSmall.box.centred}, `
    + `canvas origin sits ${anchorSmall.box.offsetInScroller}px into the scroller's content box)`);
  await shot(c, '09-zoomed-in');
  neg('10n', 'the wheel notch left the zoom unchanged', anchorSmall.after === anchorSmall.before, 'planted');
  // Repeat with the canvas LARGER than the box (no auto-centring offset) to
  // localise whichever way the first one went.
  //
  // NO ZOOM-IN CLICKS HERE, and that is the point. This used to click "Zoom in"
  // three times first, which is x2 each (ArtToolOptions:262) against artStore's
  // 2..64 clamp — so it parked the editor ON the ceiling and the wheel notch that
  // follows could not raise the zoom at all. `after > before` was then
  // unsatisfiable and 10b failed for a reason that had nothing to do with
  // anchoring. Check 10 above already left it at 48, i.e. a 384px canvas.
  //
  // THE WINDOW IS SHRUNK FIRST, and that is new with H3.1. The viewport box was
  // a fixed 240x240, so a 384px canvas overflowed it by construction; the box
  // now takes the editor column (measured 549x590 at 1400x872), and an 8x8 tile
  // cannot exceed that at ANY zoom — 64 is only 512px. So the overflow-and-pan
  // path, which 10b/11a/11b are entirely about, is unreachable at a full-size
  // window and has to be produced by making the window short. That also
  // exercises the refit: the box is now resize-driven.
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 560, deviceScaleFactor: 1, mobile: false });
  await sleep(700); await reinstall();
  note('C10z', 'window shrunk to 1400x560 for the overflow/pan checks',
    JSON.stringify(await c.json(`(() => { const s = window.__h.scroller(), v = window.__h.canvas();
      return { box: [Math.round(s.clientWidth), Math.round(s.clientHeight)], canvas: [v.width, v.height] }; })()`)));
  const anchorBig = await anchorTest(4, 4);
  check('10b', 'anchored zoom HOLDS the pixel when the canvas overflows its box',
    anchorBig.after > anchorBig.before && anchorBig.held && anchorBig.box.fitsBoth === false,
    `the canvas genuinely overflows here (fitsBoth=${anchorBig.box.fitsBoth}, canvas ${anchorBig.box.canvasW}x${anchorBig.box.canvasH} `
    + `in a ${Math.round(anchorBig.box.boxW)}x${Math.round(anchorBig.box.boxH)} box) — so this is the branch check 10 cannot reach; `
    + `zoom ${anchorBig.before} -> ${anchorBig.after}; pixel under the cursor `
    + `${JSON.stringify(anchorBig.pxBefore)} -> ${JSON.stringify(anchorBig.pxAfter)}; `
    + `canvas ${anchorBig.box.canvasW}px inside a ${anchorBig.box.boxW}px box (centred=${anchorBig.box.centred}, `
    + `canvas origin ${anchorBig.box.offsetInScroller}px into the scroller's content box)`);
  for (let i = 0; i < 12; i++) { const z = await c.evalExpr('window.__h.zoom()'); if (z <= 24) break; await c.evalExpr('window.__h.clickBar("Zoom out")'); await sleep(300); }
  await sleep(300);

  // --- 13: the tile strip must not repaint while zooming ---
  await c.evalExpr('window.__h.armThumbCounter()');
  const wPt = await c.json('window.__h.point(4,4)');
  for (const d of [-120, -120, 120, 120]) {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: wPt.x, y: wPt.y, deltaX: 0, deltaY: d, button: 'none', buttons: 0 });
    await sleep(400);
  }
  const zoomDraws = await c.evalExpr('window.__h.thumbDraws()');
  await c.evalExpr('window.__h.armThumbCounter()');
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(250);
  await clickPixel(c, 7, 7); await sleep(600);
  const editDraws = await c.evalExpr('window.__h.thumbDraws()');
  check('13', 'the right-hand tile strip does NOT repaint while zooming',
    zoomDraws === 0 && editDraws > 0,
    `thumbnail-canvas draws during 4 wheel notches = ${zoomDraws}; and the SAME counter sees ${editDraws} draw(s) after one committed stroke (so it is not blind)`);
  neg('13n', 'the thumbnail counter sees nothing even when the tile is edited', editDraws === 0, 'planted');
  await drain(c);

  // --- 11: pan without drawing ---
  for (let i = 0; i < 3; i++) { await c.evalExpr('window.__h.clickBar("Zoom in")'); await sleep(350); }
  await sleep(400);
  note('C11z', 'zoom for the pan test', String(await c.evalExpr('window.__h.zoom()')));
  const gPan0 = await grid(c);
  const sPan0 = await c.json('window.__h.scroll()');
  const mPt = await c.json('window.__h.point(4,4)');
  await mouse(c, 'mousePressed', mPt.x, mPt.y, { button: 'middle', buttons: 4 });
  for (let i = 1; i <= 5; i++) { await mouse(c, 'mouseMoved', mPt.x - i * 8, mPt.y - i * 6, { button: 'middle', buttons: 4 }); await sleep(50); }
  await mouse(c, 'mouseReleased', mPt.x - 40, mPt.y - 30, { button: 'middle', buttons: 0 });
  await sleep(450);
  const sPan1 = await c.json('window.__h.scroll()');
  const gPan1 = await grid(c);
  check('11a', 'MIDDLE-drag pans the tile view without drawing',
    (sPan1.l !== sPan0.l || sPan1.t !== sPan0.t) && same(gPan0, gPan1),
    `scroll ${JSON.stringify(sPan0)} -> ${JSON.stringify(sPan1)}; tile pixels unchanged=${same(gPan0, gPan1)}`);

  const sSp0 = await c.json('window.__h.scroll()');
  const gSp0 = await grid(c);
  const sPt = await c.json('window.__h.point(4,4)');
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await sleep(200);
  await mouse(c, 'mousePressed', sPt.x, sPt.y);
  for (let i = 1; i <= 5; i++) { await mouse(c, 'mouseMoved', sPt.x + i * 8, sPt.y + i * 6); await sleep(50); }
  await mouse(c, 'mouseReleased', sPt.x + 40, sPt.y + 30, { buttons: 0 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
  await sleep(450);
  const sSp1 = await c.json('window.__h.scroll()');
  const gSp1 = await grid(c);
  const undoPan = await c.evalExpr('window.__h.chipEnabled("Undo")');
  check('11b', 'SPACE-drag pans the tile view without drawing',
    (sSp1.l !== sSp0.l || sSp1.t !== sSp0.t) && same(gSp0, gSp1) && undoPan === false,
    `scroll ${JSON.stringify(sSp0)} -> ${JSON.stringify(sSp1)}; tile pixels unchanged=${same(gSp0, gSp1)}; undo stack still empty=${undoPan === false}`);
  await shot(c, '10-panned');
  await drain(c);

  // --- 12: hit-test at zoom 2 and 64 ---
  const hitAt = async (target, tx, ty, swatch) => {
    for (let i = 0; i < 12; i++) {
      const z = await c.evalExpr('window.__h.zoom()');
      if (z === target) break;
      await c.evalExpr(`window.__h.clickBar(${z < target ? '"Zoom in"' : '"Zoom out"'})`);
      await sleep(320);
    }
    await sleep(350);
    const z = await c.evalExpr('window.__h.zoom()');
    await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(250);
    await c.evalExpr(`window.__h.pickSwatch(${swatch})`); await sleep(250);
    const before = await grid(c);
    const pt = await clickPixel(c, tx, ty);
    const after = await grid(c);
    const d = diff(before, after);
    await drain(c);
    return { zoom: z, changed: d, pt };
  };
  const hit2 = await hitAt(2, 5, 3, 13);
  check('12a', 'a click lands on the correct pixel at zoom 2',
    hit2.zoom === 2 && hit2.changed.length === 1 && hit2.changed[0][0] === 5 && hit2.changed[0][1] === 3,
    `rendered zoom=${hit2.zoom}; clicked art pixel (5,3) at screen ${JSON.stringify(hit2.pt)}; pixel(s) that changed=${JSON.stringify(hit2.changed)}`);
  await shot(c, '11-zoom2-hittest');
  const hit64 = await hitAt(64, 6, 1, 13);
  check('12b', 'a click lands on the correct pixel at zoom 64',
    hit64.zoom === 64 && hit64.changed.length === 1 && hit64.changed[0][0] === 6 && hit64.changed[0][1] === 1,
    `rendered zoom=${hit64.zoom}; clicked art pixel (6,1) at screen ${JSON.stringify(hit64.pt)}; pixel(s) that changed=${JSON.stringify(hit64.changed)}`);
  await shot(c, '12-zoom64-hittest');
  neg('12n', 'clicking (6,1) at zoom 64 changed pixel (0,0)',
    hit64.changed.length === 1 && hit64.changed[0][0] === 0 && hit64.changed[0][1] === 0, 'planted');

  for (let i = 0; i < 12; i++) { const z = await c.evalExpr('window.__h.zoom()'); if (z <= 24) break; await c.evalExpr('window.__h.clickBar("Zoom out")'); await sleep(300); }
  await sleep(400);
  // Back to the real window for section D. Leaving the override on would mean
  // the locked-tile checks ran against a layout no user has.
  await c.send('Emulation.clearDeviceMetricsOverride');
  await sleep(700); await reinstall();

  // ===== D: locked tiles =====
  await c.evalExpr('window.__h.copy()'); await sleep(450);
  const pasteUnlocked = await c.json('window.__h.pasteBtn()');
  const lockedTitles = await c.json('window.__h.lockedThumbs()');
  note('D-lock', 'locked (🔒) thumbnails found', JSON.stringify(lockedTitles));
  if (!lockedTitles.length) {
    check('14', 'locked tile behaviour', false, 'COULD NOT TEST — no 🔒 thumbnail found in the strip');
  } else {
    await c.evalExpr(`window.__h.clickThumb(${JSON.stringify(lockedTitles[0])})`); await sleep(700); await reinstall();
    const banner = await c.evalExpr('window.__h.lockedBanner()');
    const cstyle = await c.json('window.__h.canvasStyle()');
    const pasteLocked = await c.json('window.__h.pasteBtn()');
    await drain(c);

    await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(250);
    await c.evalExpr('window.__h.pickSwatch(15)'); await sleep(220);
    const gL0 = await grid(c);
    const hL0 = await c.evalExpr('window.__h.hash()');
    const lockMid = await dragPixels(c, 1, 1, 6, 6, async () => ({ hash: await c.evalExpr('window.__h.hash()') }));
    const gL1 = await grid(c);
    await c.evalExpr('window.__h.clickTool("Fill")'); await sleep(250);
    await clickPixel(c, 4, 4);
    const gL2 = await grid(c);
    const undoLocked = await c.evalExpr('window.__h.chipEnabled("Undo")');

    await c.evalExpr('window.__h.pickSwatch(15)'); await sleep(220);
    const selL0 = await c.json('window.__h.selectedSwatch()');
    await c.evalExpr('window.__h.clickTool("Eyedropper")'); await sleep(300);
    let picked = null;
    outer: for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      await clickPixel(c, x, y);
      const s = await c.json('window.__h.selectedSwatch()');
      if (s.index !== selL0.index) { picked = { x, y, from: selL0.index, to: s.index }; break outer; }
    }
    await shot(c, '13-locked-tile');
    check('14', 'locked tile: pencil+fill inert with NO ghost preview; red banner + not-allowed cursor + 0.6 opacity; eyedropper still works; Paste disabled',
      !!banner && cstyle.cursor === 'not-allowed' && cstyle.opacity === '0.6'
      && same(gL0, gL1) && same(gL0, gL2) && lockMid.hash === hL0 && undoLocked === false
      && picked !== null && !!pasteLocked && pasteLocked.disabled === true && !!pasteUnlocked && pasteUnlocked.disabled === false,
      `banner=${JSON.stringify(banner)}; cursor=${cstyle.cursor}; opacity=${cstyle.opacity}; `
      + `pencil-drag inert=${same(gL0, gL1)}; NO ghost preview mid-drag (whole-canvas hash unchanged)=${lockMid.hash === hL0}; `
      + `fill inert=${same(gL0, gL2)}; undo stack still empty=${undoLocked === false}; `
      + `eyedropper=${JSON.stringify(picked)}; Paste disabled here=${pasteLocked && pasteLocked.disabled}, and enabled on the unlocked tile=${pasteUnlocked && !pasteUnlocked.disabled}`);
    neg('14n', 'the locked tile committed the pencil stroke', !same(gL0, gL1), 'planted');

    // --- 14b: the marquee on a locked tile cannot be DRAGGED OFF its region ---
    // `select` is not a read-only tool. A pointerdown INSIDE an existing marquee
    // takes the controller's move branch, which cuts the region out of the
    // snapshot and returns relocated pixels PLUS a moved marquee. The pixels are
    // refused by the lock; the marquee was not, so it ended up marking a region
    // its contents never went to. TileTab now withholds the selection from
    // `controller.begin` while locked (PixelViewport's `gestureSelection`), so the
    // same drag can only draw a NEW marquee over an unchanged snapshot.
    await c.evalExpr('window.__h.clickTool("Select")'); await sleep(300);
    const shapeNone = await c.json('window.__h.selectionShape()');
    const gS0 = await grid(c);
    await dragPixels(c, 0, 0, 2, 2);
    await sleep(350);
    const shape1 = await c.json('window.__h.selectionShape()');
    await shot(c, '13b-locked-marquee');
    await dragPixels(c, 1, 1, 5, 5);        // pointerdown INSIDE the marquee
    await sleep(350);
    const shape2 = await c.json('window.__h.selectionShape()');
    const gS1 = await grid(c);
    const undoSel = await c.evalExpr('window.__h.chipEnabled("Undo")');
    await shot(c, '13c-locked-marquee-after-inside-drag');
    const box = (s) => (s ? `${s.x},${s.y} ${s.w}x${s.h}` : 'none');
    check('14b', 'a locked tile still TAKES marquees, and a drag inside one redraws it instead of moving it',
      box(shape1) === '0,0 3x3' && box(shape2) === '1,1 5x5' && same(gS0, gS1) && undoSel === false,
      `no marquee before the drag=${JSON.stringify(shapeNone)}; after dragging (0,0)->(2,2)=${box(shape1)} `
      + `(rule 2: selecting works on a view-only tile); after dragging INSIDE it (1,1)->(5,5)=${box(shape2)} `
      + `— the pre-fix answer was the moved 4,4 3x3; pixels unchanged=${same(gS0, gS1)}; undo stack still empty=${undoSel === false}`);
    neg('14bn', 'the marquee slid to where the refused pixels would have gone', box(shape2) === '4,4 3x3', 'planted');
  }

  // back to an editable tile
  await c.evalExpr('window.__h.clickThumb(window.__h.thumbTitle(16))'); await sleep(700); await reinstall();
  await drain(c);

  // --- 15: Escape mid-stroke ---
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(250);
  await c.evalExpr('window.__h.pickSwatch(13)'); await sleep(250);
  const gE0 = await grid(c);
  const escInfo = await dragPixels(c, 0, 3, 7, 3, async () => {
    const during = await c.evalExpr('window.__h.hash()');
    await esc(c); await sleep(300);
    return { during, afterEsc: await c.evalExpr('window.__h.hash()'), gridAfterEsc: await grid(c) };
  });
  const gE1 = await grid(c);
  const undoE = await c.evalExpr('window.__h.chipEnabled("Undo")');
  check('15a', 'Escape mid-stroke clears the preview and commits NOTHING',
    same(gE0, escInfo.gridAfterEsc) && same(gE0, gE1) && undoE === false,
    `whole-canvas hash during the stroke=${escInfo.during}, after Esc=${escInfo.afterEsc}; `
    + `grid back to baseline right after Esc=${same(gE0, escInfo.gridAfterEsc)}; unchanged after the release=${same(gE0, gE1)}; undo stack still empty=${undoE === false}`);
  await shot(c, '14-after-escape');
  const gE2 = await grid(c);
  await dragPixels(c, 0, 5, 7, 5);
  const gE3 = await grid(c);
  const nextPresses = await drain(c);
  check('15b', 'the NEXT stroke after an Escape commits normally (one gesture, one undo)',
    diff(gE2, gE3).length >= 3 && nextPresses === 1,
    `pixels committed by the next stroke=${diff(gE2, gE3).length}; undo presses to empty the stack=${nextPresses}`);

  // --- 16: marquee-scoped transform ---
  await c.evalExpr('window.__h.clickTool("Pencil")'); await sleep(250);
  await c.evalExpr('window.__h.pickSwatch(7)'); await sleep(250);
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [5, 5], [7, 7], [6, 7]]) await clickPixel(c, x, y);
  const gM0 = await grid(c);
  await c.evalExpr('window.__h.clickTool("Select")'); await sleep(300);
  await dragPixels(c, 0, 0, 2, 2);
  await sleep(350);
  await shot(c, '15-marquee');
  const mClick = await c.evalExpr('window.__h.clickBar("Flip horizontal")');
  await sleep(650);
  const gM1 = await grid(c);
  const mChanged = diff(gM0, gM1);
  const insideOnly = mChanged.length > 0 && mChanged.every(([x, y]) => x <= 2 && y <= 2);
  check('16', 'a marquee-scoped transform changes ONLY the marquee',
    mClick === 'clicked' && insideOnly,
    `3x3 marquee at (0,0)-(2,2); pixels changed=${JSON.stringify(mChanged)} — all must lie inside 0..2 x 0..2 `
    + `(pixels were painted at (5,5),(7,7),(6,7) outside it and must be untouched)`);
  neg('16n', 'the marquee transform touched a pixel outside the marquee', mChanged.some(([x, y]) => x > 2 || y > 2), 'planted');
  await shot(c, '16-marquee-transform');

  // --- 17: non-square marquee + rotate ---
  // The new marquee must START OUTSIDE the 3x3 one check 16 left behind: with
  // `select` armed, a drag that begins INSIDE an existing selection MOVES its
  // pixels instead of drawing a new marquee (PixelEditController.moveRegion) —
  // which is what an earlier round of this harness did, leaving a 3x3 SQUARE
  // selection under the rotate and reporting a phantom product failure.
  await c.evalExpr('window.__h.clickTool("Select")'); await sleep(300);
  await dragPixels(c, 4, 4, 7, 5);       // 4x2, clear of the (0,0)-(2,2) marquee
  await sleep(400);
  const selShape = await c.json('window.__h.selectionShape ? window.__h.selectionShape() : null');
  note('17-sel', 'marquee for the rotate refusal', `dragged (4,4)->(7,5) = 4x2 (non-square), ${JSON.stringify(selShape)}`);
  const gR0 = await grid(c);
  const rClick = await c.evalExpr('window.__h.clickBar("Rotate 90° (square docs/selections only)")');
  await sleep(700);
  const gR1 = await grid(c);
  const toasts = await c.json('window.__h.toasts()');
  await shot(c, '17-rotate-refusal');
  check('17', 'non-square marquee + rotate shows a refusal toast and corrupts nothing',
    rClick === 'clicked' && toasts.some((t) => /square selection/i.test(t)) && same(gR0, gR1),
    `click=${rClick}; toasts on screen=${JSON.stringify(toasts)}; tile unchanged=${same(gR0, gR1)}`);
  await drain(c);

  // ===== 18: cross-engine =====
  await c.evalExpr('window.__h.clickBar("Flip horizontal")'); await sleep(600);
  await drain(c);
  let opened = await c.evalExpr(`
    (() => { const b = document.querySelector('button[title=${JSON.stringify(AEONDIR)}]');
             if (!b) return 'not-found'; b.click(); return 'clicked'; })()`);
  if (opened !== 'clicked') {
    await c.evalExpr(`(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Home');
      if (b) { b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b.click(); } return !!b; })()`);
    await sleep(1500);
    opened = await c.evalExpr(`
      (() => { const b = document.querySelector('button[title=${JSON.stringify(AEONDIR)}]');
               if (!b) return JSON.stringify([...document.querySelectorAll('button[title]')].map((e)=>e.getAttribute('title')).slice(0,30));
               b.click(); return 'clicked'; })()`);
  }
  if (opened !== 'clicked') {
    check('18', 'clicking a classic transform leaks nothing into a subsequently-opened aeon project',
      false, `COULD NOT TEST — no aeon recents row reachable: ${opened}`);
  } else {
    await sleep(7000);
    await reinstall();
    await shot(c, '18-aeon-opened');
    const pills = await c.json(`[...document.querySelectorAll('[aria-label="Facets"] button')].map(b=>b.textContent.trim())`);
    await c.evalExpr('window.__h.clickPill("Art")'); await sleep(3000);
    await reinstall();
    await shot(c, '19-aeon-art-facet');
    const CANVHASH = `
      (() => {
        const cs = [...document.querySelectorAll('canvas')].filter((e) => e.width > 64 && e.height > 64);
        if (!cs.length) return null;
        const g = cs[0].getContext('2d', { willReadFrequently: true });
        const d = g.getImageData(0, 0, Math.min(cs[0].width, 320), Math.min(cs[0].height, 320)).data;
        let h = 2166136261;
        for (let i = 0; i < d.length; i += 4) { h ^= d[i] + (d[i+1] << 3) + (d[i+2] << 6); h = Math.imul(h, 16777619); }
        return { hash: h >>> 0, w: cs[0].width, ht: cs[0].height, n: cs.length };
      })()`;
    const h1 = await c.json(CANVHASH);
    await sleep(3000);
    const h2 = await c.json(CANVHASH);
    const undoAeon = await c.evalExpr('window.__h.chipEnabled("Undo")');
    check('18', 'opening aeon after a classic transform applies NOTHING there (pendingAction did not leak)',
      !!h1 && !!h2 && h1.hash === h2.hash && undoAeon === false,
      `aeon pills=${JSON.stringify(pills)}; aeon art canvas stable across 3s=${!!h1 && !!h2 && h1.hash === h2.hash} `
      + `(${JSON.stringify(h1)} vs ${JSON.stringify(h2)}); aeon Undo chip enabled=${undoAeon} (a leaked transform would have pushed an undo entry)`);
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 800);
});
