#!/usr/bin/env node
// WHERE DOES A PASTE ACTUALLY LAND ON THE CANVAS?
//
// marquee-harness rows 5b/6a failed with the sampled pixel patch IDENTICAL
// before the paste, after it, after undo and after redo — while the MODEL
// provably changed. Either the paste is invisible, or the harness is sampling
// the wrong pixels. This probe answers that by diffing the WHOLE canvas and
// reporting the bounding box of what changed, instead of trusting a computed
// sample rect.
//
// Also dumps the map canvas itself (toDataURL) so a red row can be looked at
// without trusting a window screenshot's scale.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = existsSync(`${ROOT}/node_modules/.bin/electron`)
  ? `${ROOT}/node_modules/.bin/electron` : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron';
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const OUT = `${ROOT}/scratchpad/shots-marquee`;
mkdirSync(OUT, { recursive: true });

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
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('no CDP target');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
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
  const json = async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

/** Snapshot every canvas on the page, keyed by id/class, as a raw byte array
 *  we can diff. Stored on window so the diff never crosses the wire. */
const SNAP = (slot) => String.raw`
(() => {
  window.__snaps = window.__snaps || {};
  const out = {};
  for (const cv of document.querySelectorAll('canvas')) {
    const ctx = cv.getContext('2d');
    if (!ctx || !cv.width || !cv.height) continue;
    const keyName = (cv.id || cv.className || 'anon') + ':' + cv.width + 'x' + cv.height;
    try {
      out[keyName] = { w: cv.width, h: cv.height, data: ctx.getImageData(0, 0, cv.width, cv.height).data };
    } catch (e) { out[keyName] = { err: String(e) }; }
  }
  window.__snaps[${JSON.stringify(slot)}] = out;
  return Object.keys(out);
})()`;

/** Bounding box of every pixel that differs between two snapshots, per canvas. */
const DIFF = (a, b) => String.raw`
(() => {
  const A = window.__snaps[${JSON.stringify(a)}], B = window.__snaps[${JSON.stringify(b)}];
  const res = {};
  for (const k of Object.keys(A)) {
    const x = A[k], y = B[k];
    if (!y || x.err || y.err || x.w !== y.w || x.h !== y.h) { res[k] = 'shape-changed-or-error'; continue; }
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, n = 0;
    for (let py = 0; py < x.h; py++) {
      for (let px = 0; px < x.w; px++) {
        const i = (py * x.w + px) * 4;
        if (x.data[i] !== y.data[i] || x.data[i+1] !== y.data[i+1] || x.data[i+2] !== y.data[i+2] || x.data[i+3] !== y.data[i+3]) {
          n++;
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
        }
      }
    }
    res[k] = n === 0 ? { changed: 0 } : { changed: n, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }
  return res;
})()`;

async function main() {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    for (let i = 0; i < 40; i++) {
      const s = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (s && s.open) break;
      await sleep(400);
    }
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(600);

    const rect = await c.json(`(() => { const r = document.getElementById('map-canvas').getBoundingClientRect(); return {left:r.left, top:r.top, width:r.width, height:r.height}; })()`);
    const dpr = await c.evalExpr('window.devicePixelRatio');
    const canvases = await c.json(`[...document.querySelectorAll('canvas')].map(cv => ({ id: cv.id, cls: cv.className, w: cv.width, h: cv.height, css: cv.getBoundingClientRect().width + 'x' + cv.getBoundingClientRect().height, left: cv.getBoundingClientRect().left, top: cv.getBoundingClientRect().top }))`);
    console.log('dpr', dpr, 'map rect', JSON.stringify(rect));
    console.log('canvases:'); for (const cv of canvases) console.log('   ', JSON.stringify(cv));

    const mouse = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', {
      type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const chord = async (k, mods) => {
      const base = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(350);
    };
    const press = async (k) => {
      const base = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) };
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
      await sleep(250);
    };

    await press('m');
    const aimX = (cx) => Math.round(rect.left + cx);
    const aimY = (cy) => Math.round(rect.top + cy);
    const tileToCanvas = (col, row) => ({ x: col * 8, y: row * 8 });

    // Copy a dense block-aligned 8x8-tile region (block mode, default).
    const scan = await c.json(String.raw`
      (() => {
        const N = window.__dbg.aeon.ntRect(0, 0, 0, 64, 64);
        let best = null, worst = null;
        for (let r = 0; r + 8 <= 64; r += 2) for (let cc = 0; cc + 8 <= 64; cc += 2) {
          let n = 0;
          for (let dr = 0; dr < 8; dr++) for (let dc = 0; dc < 8; dc++) if (N[(r+dr)*64 + (cc+dc)] !== 0) n++;
          if (!best || n > best.n) best = { col: cc, row: r, n };
          if (!worst || n < worst.n) worst = { col: cc, row: r, n };
        }
        return { best, worst };
      })()`);
    console.log('art', JSON.stringify(scan.best), 'blank', JSON.stringify(scan.worst));

    const a = tileToCanvas(scan.best.col, scan.best.row);
    const b = tileToCanvas(scan.best.col + 7, scan.best.row + 7);
    await mouse('mousePressed', aimX(a.x + 3), aimY(a.y + 3));
    await mouse('mouseMoved', aimX(b.x + 3), aimY(b.y + 3));
    await mouse('mouseReleased', aimX(b.x + 3), aimY(b.y + 3));
    await sleep(300);
    console.log('marquee', JSON.stringify(await c.json('window.__dbg.aeon.marquee()')));
    await chord('c', 2);
    console.log('clip', JSON.stringify(await c.json('window.__dbg.aeon.mapClipboardInfo()')));

    const g = tileToCanvas(scan.worst.col, scan.worst.row);
    console.log('paste target tile', scan.worst.col, scan.worst.row, '-> canvas', JSON.stringify(g),
      '-> client', aimX(g.x + 4), aimY(g.y + 4));

    await chord('v', 2);
    await mouse('mouseMoved', aimX(g.x + 4), aimY(g.y + 4), { buttons: 0 });
    await sleep(600);
    console.log('snap ghost canvases:', JSON.stringify(await c.json(SNAP('ghost'))));

    // Move the ghost far away, then diff — that isolates the GHOST's pixels.
    await mouse('mouseMoved', aimX(g.x + 4), aimY(g.y + 200), { buttons: 0 });
    await sleep(600);
    await c.evalExpr(SNAP('ghost2'));
    console.log('GHOST MOVED diff:', JSON.stringify(await c.json(DIFF('ghost', 'ghost2')), null, 1));

    // Back, then commit the paste.
    await mouse('mouseMoved', aimX(g.x + 4), aimY(g.y + 4), { buttons: 0 });
    await sleep(400);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(500);
    await c.evalExpr(SNAP('pre'));
    const ntPre = await c.json(`window.__dbg.aeon.ntRect(0, ${scan.worst.col}, ${scan.worst.row}, 16, 16)`);

    await chord('v', 2);
    await mouse('mouseMoved', aimX(g.x + 4), aimY(g.y + 4), { buttons: 0 });
    await sleep(400);
    await mouse('mousePressed', aimX(g.x + 4), aimY(g.y + 4));
    await mouse('mouseReleased', aimX(g.x + 4), aimY(g.y + 4));
    await sleep(700);
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(600);
    await c.evalExpr(SNAP('post'));
    const ntPost = await c.json(`window.__dbg.aeon.ntRect(0, ${scan.worst.col}, ${scan.worst.row}, 16, 16)`);
    console.log('model changed:', JSON.stringify(ntPre) !== JSON.stringify(ntPost));
    console.log('PASTE diff:', JSON.stringify(await c.json(DIFF('pre', 'post')), null, 1));

    await chord('z', 2);
    await sleep(800);
    await c.evalExpr(SNAP('undone'));
    console.log('UNDO diff vs post:', JSON.stringify(await c.json(DIFF('post', 'undone')), null, 1));
    console.log('UNDO diff vs pre :', JSON.stringify(await c.json(DIFF('pre', 'undone')), null, 1));

    const url = await c.evalExpr(`document.getElementById('map-canvas').toDataURL('image/png')`);
    writeFileSync(`${OUT}/probe-map-canvas.png`, Buffer.from(url.split(',')[1], 'base64'));
    console.log('map canvas →', `${OUT}/probe-map-canvas.png`);
  } finally {
    try { c?.close(); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
  }
}
main().catch((e) => { console.error('PROBE ERROR', e); process.exit(2); });
