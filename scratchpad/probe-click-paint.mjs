#!/usr/bin/env node
// Throwaway diagnostic: why does a single eyedrop-then-pencil click sequence
// on the ChunkTab Paint canvas commit nothing?

import { AURORA_ROOT, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9363);
const ROOT = AURORA_ROOT;
const ELECTRON = process.env.ELECTRON_BIN
  ?? siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron');
const S1DIR = siblingPathOrUnresolved('s1disasm');
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}
async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}

const INSTALL = String.raw`
(() => {
  const H = {};
  H.rail = () => [...document.querySelectorAll('div')].find((d) => d.style && d.style.width === '44px');
  H.clickTool = (label) => {
    const r = H.rail(); if (!r) return 'no-rail';
    const b = [...r.querySelectorAll('button[aria-label]')].find((e) => e.getAttribute('aria-label').startsWith(label));
    if (!b) return 'no-tool'; b.click(); return 'clicked';
  };
  H.clickPill = (label) => {
    const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  H.tabBar = () => [...document.querySelectorAll('div')].find((d) => d.children.length === 3
    && [...d.children].map((k) => k.textContent.trim()).join(',') === 'Chunk,Block,Tile');
  H.clickTier = (label) => {
    const bar = H.tabBar(); if (!bar) return false;
    const b = [...bar.children].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  H.chipEl = (title) => [...document.querySelectorAll('span[title]')].find((e) => e.title === title);
  H.clickChip = (title) => { const e = H.chipEl(title); if (!e) return false; e.click(); return true; };
  H.chipActive = (title) => {
    const e = H.chipEl(title); if (!e) return null;
    const s = getComputedStyle(e);
    return s.backgroundColor === s.borderTopColor;
  };
  H.chipEnabled = (label) => {
    const s = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && e.textContent.trim() === label);
    return s ? getComputedStyle(s).opacity === '1' : null;
  };
  H.swatches = () => [...document.querySelectorAll('button[title]')]
    .filter((b) => /^index \d+/.test(b.title) && b.style && b.style.width === '22px');
  H.pickSwatch = (i) => { const s = H.swatches(); if (!s[i]) return false; s[i].click(); return true; };
  H.selectedSwatch = () => {
    const s = H.swatches();
    return { count: s.length, index: s.findIndex((b) => getComputedStyle(b).borderWidth.startsWith('2px')) };
  };
  H.canvas = () => {
    const holder = [...document.querySelectorAll('div')].find(
      (d) => d.style && d.style.margin === 'auto' && d.querySelector('canvas'));
    return holder ? holder.querySelector('canvas') : null;
  };
  H.scroller = () => { const c = H.canvas(); return c ? c.parentElement.parentElement : null; };
  H.pointFor = (x, y, bufW, bufH) => {
    const s = H.scroller(), c = H.canvas(); if (!s || !c) return null;
    const z = c.width / bufW;
    const lx = (x + 0.5) * z, ly = (y + 0.5) * z;
    let cr = c.getBoundingClientRect(); const sr = s.getBoundingClientRect();
    const relX = cr.left - sr.left + lx, relY = cr.top - sr.top + ly;
    if (relX < 10 || relX > sr.width - 10) s.scrollLeft += relX - sr.width / 2;
    if (relY < 10 || relY > sr.height - 10) s.scrollTop += relY - sr.height / 2;
    cr = c.getBoundingClientRect();
    const px = cr.left + lx, py = cr.top + ly;
    return { x: Math.round(px), y: Math.round(py), zoom: z };
  };
  H.canvasHash = () => {
    const c = H.canvas(); if (!c) return null;
    const g = c.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { h ^= d[i] + (d[i + 1] << 3) + (d[i + 2] << 6) + (d[i + 3] << 9); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  window.__p = H;
  return Object.keys(H).length;
})()`;

async function main() {
  if (!(await portFree())) throw new Error('port busy');
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  const killGroup = () => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
  };
  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    let dbgOk = false;
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof window.__dbg === "object" && typeof window.__dbg.classic === "object"')) { dbgOk = true; break; } } catch { /* */ }
      await sleep(300);
    }
    if (!dbgOk) throw new Error('__dbg.classic never installed');
    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(1800);
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(4000);
    await c.evalExpr(INSTALL);

    await c.evalExpr('window.__p.clickPill("Art")'); await sleep(1000); await c.evalExpr(INSTALL);
    await c.evalExpr('window.__p.clickTier("Chunk")'); await sleep(700); await c.evalExpr(INSTALL);
    await c.evalExpr('window.__dbg.classic.setSelectedChunk(1)'); await sleep(500); await c.evalExpr(INSTALL);
    const paintOk = await c.evalExpr('window.__p.clickChip("Paint pixels across the composed chunk")'); await sleep(500); await c.evalExpr(INSTALL);
    console.log('paintChipClicked', paintOk);
    const isolateOk = await c.evalExpr('window.__p.clickChip("Painted pixels land only where you painted")'); await sleep(400);
    console.log('isolateChipClicked', isolateOk);

    const rail = await c.evalExpr('!!window.__p.rail()');
    console.log('rail present', rail);
    const canvasInfo = await c.json('(() => { const c = window.__p.canvas(); return c ? {w:c.width,h:c.height} : null; })()');
    console.log('canvas', canvasInfo);

    const px = 30 + 10, py = 96 + 10; // shared.cellA=6 -> col6,row0 -> origin (96,0); +10,+10
    const clickTool1 = await c.evalExpr('window.__p.clickTool("Eyedropper")'); await sleep(250);
    console.log('clickTool eyedropper', clickTool1);
    const pt = await c.json(`window.__p.pointFor(${px}, ${py}, 256, 256)`);
    console.log('point for eyedrop', pt);
    await mouse(c, 'mousePressed', pt.x, pt.y); await sleep(80);
    await mouse(c, 'mouseReleased', pt.x, pt.y, { buttons: 0 }); await sleep(300);
    const sampled = await c.json('window.__p.selectedSwatch()');
    console.log('sampled after eyedrop', sampled);

    const different = sampled.index === 5 ? 9 : 5;
    const clickTool2 = await c.evalExpr('window.__p.clickTool("Pencil")'); await sleep(250);
    console.log('clickTool pencil', clickTool2);
    const pickOk = await c.evalExpr(`window.__p.pickSwatch(${different})`); await sleep(200);
    console.log('pickSwatch', different, pickOk);

    const hashBefore = await c.evalExpr('window.__p.canvasHash()');
    const undoBefore = await c.evalExpr('window.__p.chipEnabled("Undo")');
    console.log('hashBefore', hashBefore, 'undoBefore', undoBefore);

    const pt2 = await c.json(`window.__p.pointFor(${px}, ${py}, 256, 256)`);
    await mouse(c, 'mousePressed', pt2.x, pt2.y); await sleep(80);
    await mouse(c, 'mouseReleased', pt2.x, pt2.y, { buttons: 0 }); await sleep(400);

    const hashAfter = await c.evalExpr('window.__p.canvasHash()');
    const undoAfter = await c.evalExpr('window.__p.chipEnabled("Undo")');
    console.log('hashAfter', hashAfter, 'undoAfter', undoAfter, 'changed', hashAfter !== hashBefore);
  } finally {
    if (c) { try { c.close(); } catch { /* */ } }
    killGroup();
    await sleep(1000);
    console.log('port free after teardown:', await portFree());
  }
}
main().catch((e) => { console.error('ERROR', e); process.exitCode = 1; });
