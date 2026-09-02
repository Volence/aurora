#!/usr/bin/env node
// Task 12 verification harness: does paint-through actually work in the RUNNING
// Electron app? Drives the BUILT (VITE_AURORA_DEBUG=1) app under xvfb over CDP.
// Modeled on scratchpad/tile-editor-harness.mjs and composer-fill-harness.mjs —
// same launch discipline (detached spawn, kill the process group, verify the
// debug port free before/after, xvfb-run never the desktop), same evidence
// rules (pixel readback off real canvases, undo COUNTED via the header's Undo
// chip + Ctrl+Z, negative controls that must themselves report FAIL).
//
// Six checks (2026-08-15 plan, Task 12):
//   1. one gesture (a ~6px drag) on a chunk surface = ONE undo entry
//   2. undo restores all three tiers (tile bytes, block cell, chunk cell) together
//   3. Isolate: painting a chunk cell leaves a SIBLING chunk (same shared block)
//      visually unchanged
//   4. Link: the same setup, but the sibling chunk DOES change
//   5. the A1 regression: one drag across TWO adjacent chunk cells sharing one
//      linked block — each must show its OWN paint, not swap/drop/merge
//   6. reserved tiles (GHZ platform/ledge art) are never claimed by an ordinary
//      Isolate divergence elsewhere
//
// `ONLY=5,6 node paint-through-harness.mjs` restricts which numbered checks run
// (setup always runs) — used to re-run a single check cheaply while a real bug
// is temporarily reintroduced into the source, for the mandatory falsification
// pass (see the report for what was actually broken and observed failing).

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9362);
// Repointed 2026-08-16: this was hardcoded to .claude/worktrees/ux-plan6, a
// worktree that no longer exists, so the harness could not run at all. Derived
// from this file's own location instead, which survives the next move.
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots-paint`;
mkdirSync(SHOTS, { recursive: true });
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map((s) => s.trim())) : null;
const run = (id) => !ONLY || ONLY.has(id);

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

// ---------------------------------------------------------------------------
const results = [];
const fails = [];
const negFails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, detail });
  if (!ok) fails.push(`[${id}] ${name}`);
}
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
// Page-side helpers. Generalized versions of tile-editor-harness's H — the
// composed Paint-mode canvas can be a 256x256 chunk surface, a 16x16 block
// surface, or an 8x8 tile, so every geometry function takes the art-space
// buffer width/height rather than assuming 8.
// ---------------------------------------------------------------------------
const INSTALL = String.raw`
(() => {
  const H = {};
  H.rail = () => [...document.querySelectorAll('div')].find((d) => d.style && d.style.width === '44px');
  H.railDivs = () => [...document.querySelectorAll('div')].filter((d) => d.style && d.style.width === '44px').length;
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

  H.clickPill = (label) => {
    const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  // The composer dock's tier tab bar: the one div whose three children read
  // exactly Chunk,Block,Tile (same detection as composer-fill-harness).
  H.tabBar = () => [...document.querySelectorAll('div')].find((d) => d.children.length === 3
    && [...d.children].map((k) => k.textContent.trim()).join(',') === 'Chunk,Block,Tile');
  H.clickTier = (label) => {
    const bar = H.tabBar(); if (!bar) return false;
    const b = [...bar.children].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  H.activeTier = () => {
    const bar = H.tabBar(); if (!bar) return null;
    const on = [...bar.children].find((b) => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return on ? on.textContent.trim() : null;
  };

  // Chip ([title]; a button when it does something, a span when it reports) helpers — Assign/Paint and Isolate/Link are both Chips,
  // matched by their exact title (unambiguous: only one tab is mounted at a
  // time — ClassicComposerDock renders each tab as a hard conditional on
  // composerTab, never all three at once).
  H.chipEl = (title) => [...document.querySelectorAll('[title]')].find((e) => e.title === title);
  H.clickChip = (title) => { const e = H.chipEl(title); if (!e) return false; e.click(); return true; };
  // Active chips render background === border color (T.accent for both);
  // inactive chips render background T.raised / border T.border, which differ.
  // Theme-independent: never hardcode the actual accent colour.
  H.chipActive = (title) => {
    const e = H.chipEl(title); if (!e) return null;
    const s = getComputedStyle(e);
    return s.backgroundColor === s.borderTopColor;
  };
  // The header's Undo/Redo chips (LevelWorkspace.tsx) — same span+opacity
  // pattern as tile-editor-harness's chipEnabled.
  H.chipEnabled = (label) => {
    const s = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && e.textContent.trim() === label);
    return s ? getComputedStyle(s).opacity === '1' : null;
  };

  // TileTab's own 16-swatch row (title 'index N' / 'index 0 — transparent',
  // 22px buttons) — the color picker for artStore.selectedColor, which is a
  // CROSS-ENGINE / CROSS-TIER singleton (see ChunkTab's header): picking a
  // color on the Tile tier and then switching to Chunk/Block keeps it armed.
  H.swatches = () => [...document.querySelectorAll('button[title]')]
    .filter((b) => /^index \d+/.test(b.title) && b.style && b.style.width === '22px');
  H.pickSwatch = (i) => { const s = H.swatches(); if (!s[i]) return false; s[i].click(); return true; };
  H.selectedSwatch = () => {
    const s = H.swatches();
    return { count: s.length, index: s.findIndex((b) => getComputedStyle(b).borderWidth.startsWith('2px')) };
  };

  // ---- the composed Paint-mode canvas (ChunkTab/BlockTab/TileTab's shared
  // PAINT_HOLDER shape: margin:auto div wrapping the canvas) ----
  H.canvas = () => {
    const holder = [...document.querySelectorAll('div')].find(
      (d) => d.style && d.style.margin === 'auto' && d.querySelector('canvas'));
    return holder ? holder.querySelector('canvas') : null;
  };
  H.scroller = () => { const c = H.canvas(); return c ? c.parentElement.parentElement : null; };
  H.ctx = () => { const c = H.canvas(); return c ? c.getContext('2d', { willReadFrequently: true }) : null; };
  H.zoomFor = (bufW) => { const c = H.canvas(); return c ? c.width / bufW : null; };
  // Art-space (x,y) -> screen point, scrolling the scroller to bring it into
  // view if needed. bufW/bufH are the composed surface's size in ART pixels
  // (256x256 for a chunk, 16x16 for a block, 8x8 for a tile).
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
  H.pixelAt = (x, y, bufW) => {
    const c = H.canvas(), g = H.ctx(); if (!c || !g) return null;
    const z = c.width / bufW;
    const px = Math.floor((x + 0.5) * z), py = Math.floor((y + 0.5) * z);
    const d = g.getImageData(px, py, 1, 1).data;
    return d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3];
  };
  // Whole-backing-store hash of the currently mounted Paint canvas — used to
  // compare a chunk's RENDERED surface before/after an edit made ELSEWHERE
  // (switch selectedChunk, re-hash), i.e. "what a person would see if they
  // opened this chunk", not a recomputation from store state.
  H.canvasHash = () => {
    const c = H.canvas(), g = H.ctx(); if (!c || !g) return null;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { h ^= d[i] + (d[i + 1] << 3) + (d[i + 2] << 6) + (d[i + 3] << 9); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  // The main classic level (map) viewport canvas — the biggest canvas on
  // screen once the composer dock (small) is not what's showing. Used only for
  // a supplementary visual record of an object sprite before/after.
  H.mapCanvas = () => {
    const cs = [...document.querySelectorAll('canvas')].filter((c) => c.width > 400 && c.height > 300);
    cs.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return cs[0] || null;
  };
  H.mapCanvasHash = () => {
    const c = H.mapCanvas(); if (!c) return null;
    const g = c.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { h ^= d[i] + (d[i + 1] << 3) + (d[i + 2] << 6); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  window.__p = H;
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

async function clickArt(c, x, y, bufW, bufH) {
  const pt = await c.json(`window.__p.pointFor(${x}, ${y}, ${bufW}, ${bufH})`);
  if (!pt) throw new Error('no paint canvas');
  await mouse(c, 'mousePressed', pt.x, pt.y);
  await sleep(50);
  await mouse(c, 'mouseReleased', pt.x, pt.y, { buttons: 0 });
  await sleep(250);
  return pt;
}
async function dragArt(c, x0, y0, x1, y1, bufW, bufH, steps = 6) {
  const a = await c.json(`window.__p.pointFor(${x0}, ${y0}, ${bufW}, ${bufH})`);
  await mouse(c, 'mousePressed', a.x, a.y);
  await sleep(50);
  const b = await c.json(`window.__p.pointFor(${x1}, ${y1}, ${bufW}, ${bufH})`);
  for (let i = 1; i <= steps; i++) {
    await mouse(c, 'mouseMoved', Math.round(a.x + (b.x - a.x) * i / steps), Math.round(a.y + (b.y - a.y) * i / steps));
    await sleep(30);
  }
  await mouse(c, 'mouseReleased', b.x, b.y, { buttons: 0 });
  await sleep(300);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`   shot: ${name}.png`);
}
/** Ctrl+Z until the Undo chip goes disabled; returns the press count. */
async function drain(c, limit = 30) {
  let n = 0;
  while (n < limit && (await c.evalExpr('window.__p.chipEnabled("Undo")')) === true) { await ctrlZ(c); await sleep(260); n++; }
  return n;
}
const chunkCellOrigin = (idx) => ({ x: (idx % 16) * 16, y: Math.floor(idx / 16) * 16 });

// ---------------------------------------------------------------------------
async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target — a previous Electron is alive.`);
  console.log(`port ${PORT} verified free${ONLY ? ` · ONLY=${[...ONLY].join(',')}` : ''}`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });
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
    await c.send('Page.enable').catch(() => {});
    let dbgOk = false;
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof window.__dbg === "object" && typeof window.__dbg.classic === "object"')) { dbgOk = true; break; } } catch { /* ctx swap */ }
      await sleep(300);
    }
    if (!dbgOk) throw new Error('__dbg.classic never installed — was the build made with VITE_AURORA_DEBUG=1?');

    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(1800);
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(4000);
    const lvl = await c.evalExpr('window.__dbg.levelState()');
    if (lvl.status !== 'ready') throw new Error(`act not ready: ${JSON.stringify(lvl)}`);
    await c.evalExpr(INSTALL);
    note('env', 'GHZ act 1 ready', JSON.stringify(lvl));

    // ---- candidates, computed once from the real doc ----
    const pool = await c.json('window.__dbg.classic.poolSizes()');
    const reserved = await c.json('window.__dbg.classic.reservedTiles()');
    const shared = await c.json('window.__dbg.classic.findSharedBlock()');
    const juicy = await c.json('window.__dbg.classic.findJuicyCell()');
    const adj = await c.json('window.__dbg.classic.findAdjacentSharedBlockCells()');
    const six = await c.json('window.__dbg.classic.sixDivergenceWrites()');
    note('candidates', 'poolSizes', JSON.stringify(pool));
    note('candidates', `reservedTiles: ${reserved.length} tiles, min ${reserved[0]}, max ${reserved[reserved.length - 1]}`, '');
    note('candidates', 'findSharedBlock', JSON.stringify(shared));
    note('candidates', 'findJuicyCell', JSON.stringify(juicy));
    note('candidates', 'findAdjacentSharedBlockCells', JSON.stringify(adj));
    note('candidates', 'sixDivergenceWrites', JSON.stringify(six));
    if (!shared || !juicy || !adj || !six?.writes?.length) {
      throw new Error('a required candidate was not found in the real GHZ act 1 doc — cannot proceed');
    }

    // ---- navigate to Art > Chunk, arm a color, ensure Isolate ----
    await c.evalExpr('window.__p.clickPill("Art")'); await sleep(1000); await c.evalExpr(INSTALL);
    await c.evalExpr('window.__p.clickTier("Tile")'); await sleep(600); await c.evalExpr(INSTALL);
    const swatchOk = await c.evalExpr('window.__p.pickSwatch(9)'); await sleep(250);
    const sel = await c.json('window.__p.selectedSwatch()');
    note('setup', 'armed color index 9 on the Tile tier (artStore.selectedColor is a cross-tier singleton)',
      `pickSwatch(9)=${swatchOk}; selected=${JSON.stringify(sel)}`);
    await c.evalExpr('window.__p.clickTier("Chunk")'); await sleep(700); await c.evalExpr(INSTALL);
    const tierOk = await c.evalExpr('window.__p.activeTier()');
    note('setup', 'Chunk tier active', String(tierOk));

    await runChecks(c, { pool, reserved, shared, juicy, adj, six });
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

async function ensureMode(c, chunkPaintTitle, divergeTitle) {
  if (chunkPaintTitle) {
    const active = await c.evalExpr(`window.__p.chipActive(${JSON.stringify(chunkPaintTitle)})`);
    if (!active) { await c.evalExpr(`window.__p.clickChip(${JSON.stringify(chunkPaintTitle)})`); await sleep(500); await c.evalExpr(INSTALL); }
  }
  if (divergeTitle) {
    const active = await c.evalExpr(`window.__p.chipActive(${JSON.stringify(divergeTitle)})`);
    if (!active) { await c.evalExpr(`window.__p.clickChip(${JSON.stringify(divergeTitle)})`); await sleep(400); await c.evalExpr(INSTALL); }
  }
}
const PAINT_CHIP = 'Paint pixels across the composed chunk';
const ISOLATE_CHIP = 'Painted pixels land only where you painted';
const LINK_CHIP = 'Painted pixels change every place the art is used';

async function runChecks(c, cand) {
  const { shared, juicy, adj, six, reserved } = cand;
  const reservedSet = new Set(reserved);

  // =========================================================================
  // CHECK 1 — one gesture = one undo entry
  // =========================================================================
  if (run('1')) {
    await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${shared.chunkAId})`); await sleep(500); await c.evalExpr(INSTALL);
    await ensureMode(c, PAINT_CHIP, ISOLATE_CHIP);
    const railDivs = await c.evalExpr('window.__p.railDivs()');
    note('1-setup', 'paint mode mounted the tool rail', `railDivs=${railDivs}`);
    const pre = await drain(c);
    note('1-setup', 'undo stack drained before the test', `${pre} presses`);
    await c.evalExpr('window.__p.clickTool("Pencil")'); await sleep(250);

    const origin = chunkCellOrigin(shared.cellA);
    await shot(c, '01-before-6px-drag');
    await dragArt(c, origin.x + 2, origin.y + 2, origin.x + 7, origin.y + 7, 256, 256, 6);
    await shot(c, '02-after-6px-drag');
    const undoAfterDrag = await c.evalExpr('window.__p.chipEnabled("Undo")');
    const presses = await drain(c);
    check('1', 'a ~6px drag on a chunk surface = exactly ONE undo entry',
      undoAfterDrag === true && presses === 1,
      `undo enabled right after the drag=${undoAfterDrag}; Ctrl+Z presses to empty the stack=${presses}`);

    // Falsify: three SEPARATE single-pixel clicks, each at a DIFFERENT point
    // and with a DIFFERENT color, each verified (via a canvas pixel readback)
    // to be a genuine change — not a no-op the no-op guard would refuse to
    // commit. This must need THREE undos, not one. If the harness's press
    // counting can't tell three gestures from one, this reports "ok" and the
    // run flags it.
    // shared.cellB indexes chunk B's cells, not chunk A's (still selected here)
    // — reuse chunk A's OWN cell (shared.cellA), at pixels clear of the earlier
    // (2,2)-(7,7) diagonal.
    const threeOrigin = chunkCellOrigin(shared.cellA);
    const pts = [[threeOrigin.x + 10, threeOrigin.y + 10, 3], [threeOrigin.x + 13, threeOrigin.y + 13, 7], [threeOrigin.x + 10, threeOrigin.y + 3, 11]];
    const perClickChanged = [];
    for (const [px, py, colorIdx] of pts) {
      const hashBeforeClick = await c.evalExpr('window.__p.canvasHash()');
      await c.evalExpr(`window.__dbg.setPaintColor(${colorIdx})`); await sleep(120);
      await clickArt(c, px, py, 256, 256);
      const hashAfterClick = await c.evalExpr('window.__p.canvasHash()');
      perClickChanged.push(hashAfterClick !== hashBeforeClick);
    }
    const threePresses = await drain(c);
    neg('1n', 'three SEPARATE single-pixel clicks (each independently verified as a real change) count as ONE undo step',
      threePresses === 1,
      `per-click canvas changed=${JSON.stringify(perClickChanged)}; presses to drain three separate gestures = ${threePresses} (expected 3, not 1)`);
    await c.evalExpr(`window.__dbg.setPaintColor(9)`); await sleep(120); // restore the armed color
  }

  // =========================================================================
  // CHECK 2 — undo restores all three tiers together
  // =========================================================================
  if (run('2')) {
    await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${juicy.chunkId})`); await sleep(500); await c.evalExpr(INSTALL);
    await ensureMode(c, PAINT_CHIP, ISOLATE_CHIP);
    await drain(c);
    await c.evalExpr('window.__p.clickTool("Pencil")'); await sleep(200);
    await c.evalExpr('window.__dbg.setPaintColor(9)'); await sleep(200);

    const poolBefore = await c.json('window.__dbg.classic.poolSizes()');
    const tileHashBefore = await c.evalExpr(`window.__dbg.classic.tileHash(${juicy.tileId})`);
    const blockCellBefore = await c.json(`window.__dbg.classic.blockCell(${juicy.blockId}, 0)`);
    const chunkCellBefore = await c.json(`window.__dbg.classic.chunkCell(${juicy.chunkId}, ${juicy.cellIndex})`);
    note('2-before', 'juicy cell before paint',
      `pool=${JSON.stringify(poolBefore)} tileHash=${tileHashBefore} blockCell(TL)=${JSON.stringify(blockCellBefore)} chunkCell=${JSON.stringify(chunkCellBefore)}`);

    const origin = chunkCellOrigin(juicy.cellIndex);
    await shot(c, '03-before-juicy-paint');
    await dragArt(c, origin.x + 2, origin.y + 2, origin.x + 5, origin.y + 5, 256, 256, 4);
    await shot(c, '04-after-juicy-paint');

    const poolAfter = await c.json('window.__dbg.classic.poolSizes()');
    const chunkCellAfter = await c.json(`window.__dbg.classic.chunkCell(${juicy.chunkId}, ${juicy.cellIndex})`);
    const newBlockId = chunkCellAfter.block;
    const newBlockCell = await c.json(`window.__dbg.classic.blockCell(${newBlockId}, 0)`);
    const newTileId = newBlockCell.tile;
    const newTileHash = await c.evalExpr(`window.__dbg.classic.tileHash(${newTileId})`);
    const origTileHashStill = await c.evalExpr(`window.__dbg.classic.tileHash(${juicy.tileId})`);
    const divergedFully =
      poolAfter.blocks === poolBefore.blocks + 1 &&
      newBlockId !== juicy.blockId &&
      newTileId !== juicy.tileId &&
      newTileHash !== tileHashBefore &&
      origTileHashStill === tileHashBefore; // the ORIGINAL tile is untouched — isolate diverged, didn't mutate in place
    check('2a-precondition', 'the paint stroke actually diverged all three tiers (new block, new tile, original untouched)',
      divergedFully,
      `pool ${JSON.stringify(poolBefore)} -> ${JSON.stringify(poolAfter)}; chunkCell.block ${juicy.blockId} -> ${newBlockId}; `
      + `block's TL tile ${juicy.tileId} -> ${newTileId}; new tile hash changed=${newTileHash !== tileHashBefore}; `
      + `ORIGINAL tile hash unchanged=${origTileHashStill === tileHashBefore}`);

    await ctrlZ(c); await sleep(400);
    const poolUndone = await c.json('window.__dbg.classic.poolSizes()');
    const chunkCellUndone = await c.json(`window.__dbg.classic.chunkCell(${juicy.chunkId}, ${juicy.cellIndex})`);
    const blockCellUndone = await c.json(`window.__dbg.classic.blockCell(${juicy.blockId}, 0)`);
    const tileHashUndone = await c.evalExpr(`window.__dbg.classic.tileHash(${juicy.tileId})`);
    await shot(c, '05-after-one-undo');
    check('2', 'ONE undo restores all three tiers together (pool sizes, chunk cell, block cell, tile bytes)',
      poolUndone.tiles === poolBefore.tiles && poolUndone.blocks === poolBefore.blocks &&
      chunkCellUndone.block === juicy.blockId &&
      blockCellUndone.tile === blockCellBefore.tile &&
      tileHashUndone === tileHashBefore,
      `pool after undo=${JSON.stringify(poolUndone)} (want ${JSON.stringify(poolBefore)}); `
      + `chunkCell.block after undo=${chunkCellUndone.block} (want ${juicy.blockId}); `
      + `blockCell(TL).tile after undo=${blockCellUndone.tile} (want ${blockCellBefore.tile}); `
      + `tileHash after undo=${tileHashUndone} (want ${tileHashBefore})`);
    neg('2n', 'after the ONE undo, the chunk cell still points at the DIVERGED block',
      chunkCellUndone.block === newBlockId, `chunkCell.block after undo=${chunkCellUndone.block}, diverged block was ${newBlockId}`);
    await drain(c);
  }

  // =========================================================================
  // CHECK 3 & 4 — Isolate isolates / Link propagates
  // =========================================================================
  if (run('3') || run('4')) {
    const originA = chunkCellOrigin(shared.cellA);

    // idle-noise negative control: hashing the same unchanged canvas twice
    // must NOT report a difference.
    await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${shared.chunkBId})`); await sleep(500); await c.evalExpr(INSTALL);
    await ensureMode(c, PAINT_CHIP, ISOLATE_CHIP);
    const idle0 = await c.evalExpr('window.__p.canvasHash()');
    const idle1 = await c.evalExpr('window.__p.canvasHash()');
    neg('34-idle', 'hashing chunk B\'s rendered canvas twice with nothing happening reports a difference',
      idle0 !== idle1, `hash ${idle0} vs ${idle1}`);

    const hashB_before = idle1;
    await shot(c, '06-chunkB-before');

    // ---- ISOLATE ----
    await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${shared.chunkAId})`); await sleep(500); await c.evalExpr(INSTALL);
    await ensureMode(c, PAINT_CHIP, ISOLATE_CHIP);
    await c.evalExpr('window.__p.clickTool("Pencil")'); await sleep(200);
    await c.evalExpr('window.__dbg.setPaintColor(9)'); await sleep(200);
    const chunkCellA0 = await c.json(`window.__dbg.classic.chunkCell(${shared.chunkAId}, ${shared.cellA})`);
    await dragArt(c, originA.x + 2, originA.y + 2, originA.x + 5, originA.y + 5, 256, 256, 4);
    const chunkCellA1 = await c.json(`window.__dbg.classic.chunkCell(${shared.chunkAId}, ${shared.cellA})`);
    await shot(c, '07-chunkA-after-isolate-paint');

    await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${shared.chunkBId})`); await sleep(500); await c.evalExpr(INSTALL);
    const hashB_afterIsolate = await c.evalExpr('window.__p.canvasHash()');
    await shot(c, '08-chunkB-after-isolate');

    if (run('3')) {
      check('3', 'Isolate: painting a chunk cell leaves a SIBLING chunk (sharing the same block) visually unchanged',
        chunkCellA1.block !== shared.blockId && hashB_afterIsolate === hashB_before,
        `chunk A's cell diverged: block ${chunkCellA0.block} -> ${chunkCellA1.block} (started shared at ${shared.blockId}); `
        + `chunk B's rendered canvas hash: ${hashB_before} -> ${hashB_afterIsolate} (unchanged=${hashB_afterIsolate === hashB_before})`);
      neg('3n', 'chunk A did NOT diverge (still shares the original block after an Isolate paint)',
        chunkCellA1.block === shared.blockId, `chunk A's cell block after paint=${chunkCellA1.block}`);
    }

    // restore: undo chunk A's isolate paint, confirm the shared relationship is back
    await drain(c);
    const chunkCellARestored = await c.json(`window.__dbg.classic.chunkCell(${shared.chunkAId}, ${shared.cellA})`);
    note('34-restore', 'chunk A restored after drain', JSON.stringify(chunkCellARestored));

    // ---- LINK ----
    if (run('4')) {
      await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${shared.chunkBId})`); await sleep(500); await c.evalExpr(INSTALL);
      const hashB_before2 = await c.evalExpr('window.__p.canvasHash()');

      await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${shared.chunkAId})`); await sleep(500); await c.evalExpr(INSTALL);
      await ensureMode(c, PAINT_CHIP, LINK_CHIP);
      const linkChipActive = await c.evalExpr(`window.__p.chipActive(${JSON.stringify(LINK_CHIP)})`);
      const isolateChipActive = await c.evalExpr(`window.__p.chipActive(${JSON.stringify(ISOLATE_CHIP)})`);
      await c.evalExpr('window.__p.clickTool("Pencil")'); await sleep(200);
      await c.evalExpr('window.__dbg.setPaintColor(11)'); await sleep(200);
      await dragArt(c, originA.x + 2, originA.y + 2, originA.x + 5, originA.y + 5, 256, 256, 4);
      await shot(c, '09-chunkA-after-link-paint');

      await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${shared.chunkBId})`); await sleep(500); await c.evalExpr(INSTALL);
      const hashB_afterLink = await c.evalExpr('window.__p.canvasHash()');
      await shot(c, '10-chunkB-after-link');

      check('4', 'Link: the same setup, but the sibling chunk DOES change',
        linkChipActive === true && isolateChipActive === false && hashB_afterLink !== hashB_before2,
        `Link chip active=${linkChipActive}, Isolate chip active=${isolateChipActive}; `
        + `chunk B's rendered canvas hash: ${hashB_before2} -> ${hashB_afterLink} (changed=${hashB_afterLink !== hashB_before2})`);
      neg('4n', 'chunk B is unchanged after a LINK-mode paint on the shared block',
        hashB_afterLink === hashB_before2, `hash ${hashB_before2} vs ${hashB_afterLink}`);

      await drain(c);
      await ensureMode(c, null, ISOLATE_CHIP); // leave the sticky mode back at the default for later checks
    }
  }

  // =========================================================================
  // CHECK 5 — the A1 regression: one drag across two adjacent shared cells
  // =========================================================================
  if (run('5')) {
    await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${adj.chunkId})`); await sleep(500); await c.evalExpr(INSTALL);
    await ensureMode(c, PAINT_CHIP, ISOLATE_CHIP);
    await drain(c);
    await c.evalExpr('window.__p.clickTool("Pencil")'); await sleep(200);
    await c.evalExpr('window.__dbg.setPaintColor(9)'); await sleep(200);

    const preA = await c.json(`window.__dbg.classic.chunkCell(${adj.chunkId}, ${adj.cellA})`);
    const preB = await c.json(`window.__dbg.classic.chunkCell(${adj.chunkId}, ${adj.cellB})`);
    note('5-pre', 'both adjacent cells share the block before painting', `A=${JSON.stringify(preA)} B=${JSON.stringify(preB)}`);

    const originA = chunkCellOrigin(adj.cellA);
    const originB = chunkCellOrigin(adj.cellB);
    const ptA = [originA.x + 12, originA.y + 8];
    const ptB = [originB.x + 4, originB.y + 8];
    const pixelBeforeA = await c.evalExpr(`window.__p.pixelAt(${ptA[0]}, ${ptA[1]}, 256)`);
    const pixelBeforeB = await c.evalExpr(`window.__p.pixelAt(${ptB[0]}, ${ptB[1]}, 256)`);

    await shot(c, '11-before-a1-drag');
    await dragArt(c, ptA[0], ptA[1], ptB[0], ptB[1], 256, 256, 8);
    await shot(c, '12-after-a1-drag');

    const pixelAfterA = await c.evalExpr(`window.__p.pixelAt(${ptA[0]}, ${ptA[1]}, 256)`);
    const pixelAfterB = await c.evalExpr(`window.__p.pixelAt(${ptB[0]}, ${ptB[1]}, 256)`);
    const postA = await c.json(`window.__dbg.classic.chunkCell(${adj.chunkId}, ${adj.cellA})`);
    const postB = await c.json(`window.__dbg.classic.chunkCell(${adj.chunkId}, ${adj.cellB})`);

    check('5', 'one drag across TWO adjacent chunk cells sharing one linked block: each shows its own paint, each diverges to its OWN block',
      postA.block !== adj.blockId && postB.block !== adj.blockId && postA.block !== postB.block &&
      pixelAfterA !== pixelBeforeA && pixelAfterB !== pixelBeforeB && pixelAfterA === pixelAfterB,
      `cell A block ${preA.block} -> ${postA.block}; cell B block ${preB.block} -> ${postB.block} `
      + `(both must differ from the shared origin ${adj.blockId} AND from each other); `
      + `pixel at A: ${pixelBeforeA} -> ${pixelAfterA}; pixel at B: ${pixelBeforeB} -> ${pixelAfterB} `
      + `(both must change, and land on the SAME painted color since one color was used throughout the stroke)`);
    neg('5n', 'the A1 bug signature: both cells diverged to the SAME cloned block',
      postA.block === postB.block, `cell A block=${postA.block}, cell B block=${postB.block}`);

    await drain(c);
    const restoredA = await c.json(`window.__dbg.classic.chunkCell(${adj.chunkId}, ${adj.cellA})`);
    const restoredB = await c.json(`window.__dbg.classic.chunkCell(${adj.chunkId}, ${adj.cellB})`);
    note('5-restore', 'both cells restored after drain', `A=${JSON.stringify(restoredA)} B=${JSON.stringify(restoredB)}`);
  }

  // =========================================================================
  // CHECK 6 — reserved tiles are spared across a batch of real divergences
  // =========================================================================
  if (run('6')) {
    await c.evalExpr(`window.__dbg.classic.setSelectedChunk(${six.chunkId})`); await sleep(500); await c.evalExpr(INSTALL);
    await ensureMode(c, PAINT_CHIP, ISOLATE_CHIP);
    await drain(c);
    await c.evalExpr('window.__p.clickTool("Pencil")'); await sleep(200);
    await c.evalExpr('window.__dbg.setPaintColor(9)'); await sleep(200);

    const hashesBefore = await c.json('window.__dbg.classic.allTileHashes()');
    const poolBefore = await c.json('window.__dbg.classic.poolSizes()');

    // supplementary visual record — a GHZ Platform (object $18) and Collapsing
    // Ledge (object $1A) both draw from the level tile pool via mappings; if
    // reservedTiles ever failed, an ordinary Isolate divergence pass right here
    // (chunk file index 0, same chunk sixDivergenceWrites targets) is exactly
    // the scenario the real unit test (reserved-tiles-real-act.test.ts) proved
    // corrupts one at the 5th claim when the guard is absent.
    const platform = await c.json('window.__dbg.classic.findObject(0x18)');
    const ledge = await c.json('window.__dbg.classic.findObject(0x1a)');
    let mapBefore = null, mapAfter = null;
    if (platform) {
      await c.evalExpr('window.__p.clickPill("Layout")').catch(() => {});
      await sleep(800);
      await c.evalExpr(`window.__dbg.setView(${platform.x - 200}, ${platform.y - 100}, 2)`);
      await sleep(900); await c.evalExpr(INSTALL);
      mapBefore = await c.evalExpr('window.__p.mapCanvasHash()');
      await shot(c, '13-platform-before');
      await c.evalExpr('window.__p.clickPill("Art")'); await sleep(800); await c.evalExpr(INSTALL);
      await c.evalExpr('window.__p.clickTier("Chunk")'); await sleep(600); await c.evalExpr(INSTALL);
      await ensureMode(c, PAINT_CHIP, ISOLATE_CHIP);
      await c.evalExpr('window.__p.clickTool("Pencil")'); await sleep(200);
      await c.evalExpr('window.__dbg.setPaintColor(9)'); await sleep(200);
    }

    for (const w of six.writes) {
      await clickArt(c, w.x + 4, w.y + 4, 256, 256);
    }
    await shot(c, '14-after-six-divergences');

    const hashesAfter = await c.json('window.__dbg.classic.allTileHashes()');
    const poolAfter = await c.json('window.__dbg.classic.poolSizes()');
    const changed = [];
    const maxLen = Math.max(hashesBefore.length, hashesAfter.length);
    for (let i = 0; i < maxLen; i++) if (hashesBefore[i] !== hashesAfter[i]) changed.push(i);
    const changedReserved = changed.filter((i) => reservedSet.has(i));

    check('6', 'six forced Isolate divergences (the proven reserved-tiles-real-act.test.ts fixture) never touch a reserved (object-art) tile',
      changed.length > 0 && changedReserved.length === 0,
      `pool ${JSON.stringify(poolBefore)} -> ${JSON.stringify(poolAfter)}; tiles changed=${changed.length} `
      + `(indices ${JSON.stringify(changed.slice(0, 12))}${changed.length > 12 ? '…' : ''}); `
      + `changed tiles that are RESERVED=${JSON.stringify(changedReserved)} (must be empty); `
      + `tile 0x3b (the documented first-claim collision from the unit test) hash unchanged=${hashesBefore[0x3b] === hashesAfter[0x3b]}`);
    neg('6n', 'the reserved tile 0x3b changed as a side effect of the six divergences',
      hashesBefore[0x3b] !== hashesAfter[0x3b], `hash 0x3b: ${hashesBefore[0x3b]} vs ${hashesAfter[0x3b]}`);
    neg('6n2', 'calling allTileHashes() twice with nothing happening in between reports a difference',
      JSON.stringify(hashesAfter) !== JSON.stringify(await c.json('window.__dbg.classic.allTileHashes()')), 'planted');

    if (platform) {
      await c.evalExpr('window.__p.clickPill("Layout")').catch(() => {});
      await sleep(800);
      await c.evalExpr(`window.__dbg.setView(${platform.x - 200}, ${platform.y - 100}, 2)`);
      await sleep(900); await c.evalExpr(INSTALL);
      mapAfter = await c.evalExpr('window.__p.mapCanvasHash()');
      await shot(c, '15-platform-after');
      note('6-visual', 'GHZ Platform ($18) area before/after six divergences (supplementary — screenshots 13/15)',
        `map canvas hash ${mapBefore} -> ${mapAfter} (equal=${mapBefore === mapAfter}); object at (${platform.x},${platform.y}); ledge at ${JSON.stringify(ledge)}`);
      await c.evalExpr('window.__p.clickPill("Art")'); await sleep(600); await c.evalExpr(INSTALL);
      await c.evalExpr('window.__p.clickTier("Chunk")'); await sleep(500); await c.evalExpr(INSTALL);
    } else {
      note('6-visual', 'GHZ Platform object ($18) not found in this act — skipped the supplementary screenshot', '');
    }

    await drain(c);
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 800);
});
