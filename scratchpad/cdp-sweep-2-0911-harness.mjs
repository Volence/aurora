#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// CDP SWEEP 2, 2026-09-11. Two aeon-map fixes proven only by node tests,
// looked at on a running app, on COPIES of aeon's published tree.
// ═══════════════════════════════════════════════════════════════════════════
//
// SOURCES (where a packet and the tree disagree the tree wins and the output
// says so):
//   docs/reviews/2026-09-11-map-remount-clear.md  section 9, F-1 to F-3
//   docs/reviews/2026-09-11-paste-across-tilesets.md section 8, F-1 to F-5
//
// ROWS
//   R1  marquee survives a Layout -> Art -> Layout round trip; CONTROL a real
//       act switch clears it.
//   R2  an armed paste is OFF after the same trip and leaves no ghost; CONTROL
//       the ghost was painted before the trip, and Ctrl+V re-arms after it.
//   R3  marquee + armed paste, then the SECOND copy (same zone/act ids) is
//       opened: both clear; CONTROL the same Home round trip WITHOUT an open
//       keeps both.
//   R4  copy in zone A, Ctrl+V in zone B refused with OTHER_TILESET_REFUSAL
//       verbatim, nothing written; back in zone A it pastes.
//   R5  act 1 -> act 2 of one zone pastes (the copy's act 2 is added by this
//       file, see THE COPY below).
//   R6  the second copy refuses the clipboard; reopening the first copy also
//       refuses it (ratified, paste packet section 4a); CONTROL a fresh Ctrl+C
//       in the reopened copy arms.
//   R7  after every refusal the map's PIXELS are unchanged: a screenshot clip
//       of the map canvas box, decoded and compared pixel by pixel, taken only
//       once no toast is on screen; CONTROL a real paste at the same point
//       changes the same clip.
//
// THE COPY. aeon's published tip has ONE zone with ONE act. This file extracts
// a fresh copy per project per run from a tarball made by
//   git -C <aeon checkout> archive -o <tar> <origin/master sha>
// and then, IN THE COPY ONLY, adds to project.json:
//   * act `act2` in zone `ojz`: a byte copy of act1's data directory (R5, and
//     R1's control, whose map must look identical to act1's);
//   * zone `zb` ("Sweep Zone B"), one act: a byte copy of act1's data, drawn
//     with `zb_tiles.bin`, which is ojz_tiles.bin with every 4bpp pixel v
//     replaced by 15 - v (a raw 4bpp file, core/formats/tiles.ts), so every
//     tile differs and zone B visibly is another tile set;
//   * a project NAME suffix, `(sweep C1)` / `(sweep C2)`, which the window
//     title carries, so a run can SEE which copy is open. The name is not an
//     id: zone and act ids are identical in both copies.
// The loader was read first: every zone parses its own tileset file
// (load.ts:508), the per-act reads are the dataPath's section files plus the
// strip/bg paths, and a zone id with no effects wiring is recorded, not fatal
// (load.ts:757).
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//   * A DOM FLAG FOR A PICTURE. Every "on screen" claim here is read off a
//     screenshot of the map canvas's box, and every "unchanged" is a pixel
//     compare of two such clips. The store probes are printed beside them.
//   * A GHOST PROBE THAT CANNOT GO FALSE. `__dbg.aeon.pasteGhost()` is only
//     published while pasting (MapViewport.tsx:3814), so its `pasting` field
//     never reads false. "Paste mode is off" is read as: real mouse moves over
//     the canvas leave its `paints` counter where it was (the paste branch of
//     mousemove is tool-independent and publishes on every move it handles).
//     CONTROL: the same moves while armed advance it.
//   * A SYNTHETIC EVENT THE APP IGNORES. Every gesture is Input.dispatchMouse
//     Event / Input.dispatchKeyEvent at an INTEGER client pixel, after a hit
//     test. `__dbg` is used for reads and for camera setup (`setView`) only.
//   * A TOAST IN THE CLIP. Toasts are fixed-position and can overlap the map
//     box, so every compared capture waits until NO toast is painted.
//   * TWO RUNS STITCHED INTO ONE OBSERVATION. Every row's evidence is printed
//     by the run that produced it; dpr and rects are printed beside the rows.
//
// NO EMULATOR, EVER. ORACLE_SOCKET points inside a directory this file makes
// with mkdtemp; nothing here presses the Aether badge.
// CLEANUP IS BY PID: spawnGuarded + awaited killTree.
//
// RUN (from a worktree, BOTH variables, or the main checkout's dist answers):
//   VITE_AURORA_DEBUG=1 npm run build
//   SWEEP2_AEON_TAR=<tar> AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<electron> \
//     node scratchpad/cdp-sweep-2-0911-harness.mjs

import { AURORA_DIR, siblingDefaultPath } from '../test/support/sibling-root.mjs';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, mkdtempSync, rmSync, realpathSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve as resolvePath } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { spawnGuarded, killTree, RUN_PROFILE_DIR } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const PORT = Number(process.env.PORT ?? 9493);
const TAG = process.env.RUN_TAG ?? new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const CAPTURES = `${ROOT}/docs/captures/2026-09-11-cdp-sweep-2`;
mkdirSync(CAPTURES, { recursive: true });

const REFUSAL = 'Not pasted: the copied tiles belong to another tile set, so pasting them here would put '
  + 'different tiles down. Copy again from a map that uses this tile set.';

const TAR = process.env.SWEEP2_AEON_TAR ?? '';
if (!TAR || !existsSync(TAR)) {
  console.log('HARNESS REFUSES: SWEEP2_AEON_TAR must name a tarball of aeon\'s published tree, made with');
  console.log('        git -C <aeon checkout> archive -o <tar> <origin/master sha>');
  process.exit(2);
}

const SOCK_DIR = mkdtempSync('/tmp/cdps2-sock-');
const SOCK = join(SOCK_DIR, 'o.sock');
for (const forbidden of ['/tmp/oracle.sock', `${process.env.XDG_RUNTIME_DIR ?? '/nonexistent'}/oracle.sock`]) {
  if (SOCK === forbidden) throw new Error(`refusing: ORACLE_SOCKET would be ${forbidden}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══ THE COPY ══════════════════════════════════════════════════════════════
const ED = 'games/sonic4/data/editor';
function makeCopy(label) {
  const dir = mkdtempSync(`/tmp/cdps2-${label}-`);
  const live = siblingDefaultPath('aeon');
  if (live && resolvePath(dir) === resolvePath(live)) throw new Error('refusing: the copy is the live aeon tree');
  const x = spawnSync('tar', ['-x', '-f', TAR, '-C', dir]);
  if (x.status !== 0) throw new Error(`tar -x exited ${x.status}: ${x.stderr}`);
  const pj = JSON.parse(readFileSync(`${dir}/project.json`, 'utf8'));
  if (pj.zones.length !== 1 || pj.zones[0].id !== 'ojz' || pj.zones[0].acts.length !== 1) {
    throw new Error(`the published tree is not the one-zone one-act shape this file extends: ${JSON.stringify(pj.zones.map((z) => [z.id, z.acts.map((a) => a.id)]))}`);
  }
  const act1 = pj.zones[0].acts[0];
  cpSync(`${dir}/${ED}/ojz/act1`, `${dir}/${ED}/ojz/act2`, { recursive: true });
  cpSync(`${dir}/${ED}/ojz/act1`, `${dir}/${ED}/zb/act1`, { recursive: true });
  const tiles = readFileSync(`${dir}/${pj.zones[0].tileset}`);
  const inv = Buffer.from(tiles.map((b) => 0xFF - b));   // each nibble v -> 15 - v
  writeFileSync(`${dir}/${ED}/zb_tiles.bin`, inv);
  pj.zones[0].acts.push({ ...act1, id: 'act2', dataPath: `${ED}/ojz/act2/` });
  pj.zones.push({
    id: 'zb', name: 'Sweep Zone B', tileset: `${ED}/zb_tiles.bin`, palette: pj.zones[0].palette,
    acts: [{ ...act1, dataPath: `${ED}/zb/act1/` }],
  });
  pj.name = `${pj.name} (sweep ${label})`;
  writeFileSync(`${dir}/project.json`, `${JSON.stringify(pj, null, 2)}\n`);
  return { dir: realpathSync(dir), name: pj.name, tileBytes: tiles.length };
}

// ═══ PNG, decoded here so a compare is of pixels, not of encoder output ════
function decodePng(buf) {
  let p = 8; let w = 0; let h = 0; let depth = 0; let ctype = 0; let lace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; lace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || lace !== 0 || (ctype !== 2 && ctype !== 6)) throw new Error(`unsupported PNG depth ${depth} type ${ctype} interlace ${lace}`);
  const bpp = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    const line = Buffer.from(raw.subarray(rp, rp + stride));
    rp += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c; const pa = Math.abs(pp - a); const pb = Math.abs(pp - b); const pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (f !== 0) throw new Error(`PNG filter ${f}`);
      line[i] = v & 0xFF;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4; const s = x * bpp;
      px[o] = line[s]; px[o + 1] = line[s + 1]; px[o + 2] = line[s + 2]; px[o + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}

/** Pixel compare of two clips of the SAME client box. `box` (client px,
 *  relative to the clip's origin) optionally counts how many of the changed
 *  pixels fall inside it. */
function diff(a, b, box = null) {
  if (!a || !b) return { comparable: false };
  if (a.img.w !== b.img.w || a.img.h !== b.img.h) return { comparable: false, sizes: [a.img.w, a.img.h, b.img.w, b.img.h] };
  const s = a.img.w / a.clip.width;
  let n = 0; let inside = 0; let x0 = 1e9; let y0 = 1e9; let x1 = -1; let y1 = -1;
  for (let y = 0; y < a.img.h; y++) {
    for (let x = 0; x < a.img.w; x++) {
      const o = (y * a.img.w + x) * 4;
      if (a.img.px[o] !== b.img.px[o] || a.img.px[o + 1] !== b.img.px[o + 1] || a.img.px[o + 2] !== b.img.px[o + 2]) {
        n++;
        if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
        const cx = x / s; const cy = y / s;
        if (box && cx >= box.x && cx < box.x + box.w && cy >= box.y && cy < box.y + box.h) inside++;
      }
    }
  }
  return {
    comparable: true, changed: n, total: a.img.w * a.img.h, inside: box ? inside : null,
    bboxClient: n ? { x: +(x0 / s).toFixed(1), y: +(y0 / s).toFixed(1), x1: +(x1 / s).toFixed(1), y1: +(y1 / s).toFixed(1) } : null,
  };
}

// ═══ CDP ═══════════════════════════════════════════════════════════════════
function getJSON(path, timeoutMs = 2000) {
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
  for (let i = 0; i < 150; i++) {
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

const results = [];
const fails = [];
const unmeasurable = [];
function check(id, name, ok, detail) {
  const tag = ok === 'UNMEASURABLE' ? 'UNMS' : ok ? 'PASS' : 'FAIL';
  const la = os.loadavg().map((n) => n.toFixed(2)).join('/');
  console.log(`${tag}  [${id}] ${name}   [load ${la}]${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (ok === 'UNMEASURABLE') unmeasurable.push(`[${id}] ${name}`);
  else if (!ok) fails.push(`[${id}] ${name}`);
}
const note = (id, text) => console.log(`NOTE  [${id}] ${text}`);

const TOASTS = String.raw`
(() => [...document.querySelectorAll('div[title="Dismiss"]')].map((el) => {
  const b = el.getBoundingClientRect();
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    text: (el.innerText || '').trim(),
    rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) },
    rects: el.getClientRects().length,
    hitInside: !!(hit && (hit === el || el.contains(hit))),
    inViewport: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
    border: getComputedStyle(el).borderTopColor, dpr: window.devicePixelRatio,
  };
}))()`;
const toastPainted = (t) => !!(t && t.rects > 0 && t.hitInside === true && t.inViewport === true);

async function main() {
  const t0 = Date.now();
  console.log('=== cdp-sweep-2 2026-09-11 harness ===');
  console.log(`    node         : ${process.version}`);
  console.log(`    loadavg      : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    ORACLE_SOCKET: ${SOCK}   (private; made by this run)`);
  console.log(`    profile      : ${RUN_PROFILE_DIR}   (pinned by spawnGuarded, fresh per process)`);
  console.log(`    captures     : ${CAPTURES}   tag ${TAG}`);
  console.log(`    aeon tarball : ${TAR}`);
  const C1 = makeCopy('C1');
  const C2 = makeCopy('C2');
  console.log(`    copy C1      : ${C1.dir}   name ${JSON.stringify(C1.name)}   ojz_tiles.bin ${C1.tileBytes} bytes`);
  console.log(`    copy C2      : ${C2.dir}   name ${JSON.stringify(C2.name)}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ORACLE_SOCKET: SOCK };
  delete env.DISPLAY;
  delete env.EXODUS_SOCKET;
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
      for (let i = 0; i < 100; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg: rebuild with VITE_AURORA_DEBUG=1');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3000);
    if (!(await waitDbg())) throw new Error('no __dbg after reload');
    console.log(`    dpr at start : ${await c.evalExpr('window.devicePixelRatio')}`);
    await sweep({ c, C1, C2 });
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
    try { rmSync(SOCK_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
    if (!process.env.KEEP_COPY) {
      for (const d of [C1.dir, C2.dir]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* */ } }
    }
  }

  const pass = results.filter((r) => r.ok === true).length;
  console.log(`\n════ ${pass}/${results.length} rows PASS · ${fails.length} FAIL · ${unmeasurable.length} UNMEASURABLE · `
    + `${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     loadavg at end ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  console.log('END-OF-RUN');
  process.exit(fails.length ? 1 : 0);
}

async function sweep({ c, C1, C2 }) {
  // ── gestures ────────────────────────────────────────────────────────────
  const mouse = (type, x, y, button = 'none', buttons = 0) =>
    c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
  const realClick = async (selectorExpr, { scroll = false, down = false } = {}) => {
    const p = await c.json(String.raw`(() => {
      const el = ${selectorExpr};
      if (!el) return null;
      if (${scroll}) el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const b = el.getBoundingClientRect();
      const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, hitOk: !!(hit && (hit === el || el.contains(hit))), dpr: window.devicePixelRatio,
        rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) } };
    })()`);
    if (!p || !p.hitOk) return p;
    await mouse('mouseMoved', p.x, p.y);
    await mouse('mousePressed', p.x, p.y, 'left', 1);
    await sleep(40);
    await mouse('mouseReleased', p.x, p.y, 'left', 0);
    if (down) await sleep(0);
    return p;
  };
  const chord = async (k, mods = 0) => {
    const p = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods };
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(350);
  };
  const namedKey = async (k, vk, text) => {
    const p = { key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p, ...(text ? { text } : {}) });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(300);
  };
  const typeText = async (s) => {
    for (const ch of s) {
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
    await sleep(200);
  };
  const CTRL = 2;

  // ── reads ───────────────────────────────────────────────────────────────
  const st = () => c.json('window.__dbg.aeon.state()');
  const marqueeNow = () => c.json('window.__dbg.aeon.marquee()');
  const paints = () => c.json('window.__dbg.aeon.pasteGhost()');
  const clipInfo = () => c.json('window.__dbg.aeon.mapClipboardInfo()');
  const canUndo = () => c.evalExpr('window.__dbg.aeon.canUndo()');
  const title = () => c.evalExpr('document.title');
  const dpr = () => c.evalExpr('window.devicePixelRatio');
  const view = () => c.json('window.__dbg.view()');
  const toastsDom = () => c.json(TOASTS).catch(() => []);
  const toastStore = () => c.json('window.__dbg.aeon.toasts()').catch(() => []);
  /** FNV over EVERY word plane of every section of the open act: nametable
   *  and both collision planes, 256x256 each. */
  const WORDS = String.raw`(() => {
    const a = window.__dbg.aeon; const s = a.state(); const n = (s.gridWidth || 0) * (s.gridHeight || 0);
    let h = 2166136261 >>> 0; let words = 0; let planes = 0;
    for (let i = 0; i < n; i++) {
      for (const g of [a.ntRect(i, 0, 0, 256, 256), a.collRect(i, 0, 0, 256, 256, 'a'), a.collRect(i, 0, 0, 256, 256, 'b')]) {
        if (!g) { h = Math.imul(h ^ 0x5eed, 16777619) >>> 0; continue; }
        planes++; words += g.length;
        for (let k = 0; k < g.length; k++) h = Math.imul(h ^ g[k], 16777619) >>> 0;
      }
    }
    return { zone: s.zone, act: s.act, sections: n, planes, words, hash: h };
  })()`;
  const words = () => c.json(WORDS);

  const canvasRect = async () => c.json(String.raw`(() => {
    const cv = document.getElementById('map-canvas'); if (!cv) return null;
    const b = cv.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, dpr: window.devicePixelRatio,
      vw: innerWidth, vh: innerHeight };
  })()`);

  const clipOf = (r) => {
    const x = Math.ceil(r.x); const y = Math.ceil(r.y);
    const x1 = Math.floor(Math.min(r.x + r.w, r.vw)); const y1 = Math.floor(Math.min(r.y + r.h, r.vh));
    return { x, y, width: x1 - x, height: y1 - y, scale: 1 };
  };
  /** A screenshot of the map canvas's box, decoded. Saved when named. */
  const grab = async (name) => {
    const r = await canvasRect();
    if (!r) return null;
    const clip = clipOf(r);
    const s = await c.send('Page.captureScreenshot', { format: 'png', clip });
    const buf = Buffer.from(s.data, 'base64');
    if (name) {
      writeFileSync(`${CAPTURES}/${name}-${TAG}.png`, buf);
      console.log(`   clip: docs/captures/2026-09-11-cdp-sweep-2/${name}-${TAG}.png  (clip ${JSON.stringify(clip)})`);
    }
    return { clip, img: decodePng(buf) };
  };
  const shot = async (name) => {
    const s = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURES}/${name}-${TAG}.png`, Buffer.from(s.data, 'base64'));
    console.log(`   shot: docs/captures/2026-09-11-cdp-sweep-2/${name}-${TAG}.png`);
  };
  /** No toast may be in a compared clip. Polls; returns how long it took. */
  const waitNoToasts = async (maxMs = 20000) => {
    const t = Date.now();
    for (;;) {
      const ts = await toastsDom();
      if (ts.length === 0) return { waitedMs: Date.now() - t, left: [] };
      if (Date.now() - t > maxMs) return { waitedMs: Date.now() - t, left: ts.map((x) => x.text) };
      await sleep(250);
    }
  };
  const waitToast = async (pred, maxMs = 4000) => {
    const t = Date.now();
    while (Date.now() - t < maxMs) {
      const hit = (await toastsDom()).find((x) => pred(x.text));
      if (hit) return hit;
      await sleep(80);
    }
    return null;
  };

  // ── places ──────────────────────────────────────────────────────────────
  const FACET = (label) => `[...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)}) || null`;
  const LEVELS = `document.querySelector('[data-section="explorer.levels"]')`;
  const LEVELS_HEADER = String.raw`(() => { const s = ${LEVELS}; if (!s || !s.firstElementChild) return null;
    return s.firstElementChild.querySelector('span') || s.firstElementChild; })()`;
  const ROW = (label) => String.raw`(() => { const s = ${LEVELS}; if (!s) return null;
    return [...s.querySelectorAll('button')].find((b) => (b.querySelector('span')?.textContent || '').trim() === ${JSON.stringify(label)}) || null; })()`;
  const HOME_TAB = String.raw`[...document.querySelectorAll('[role="tablist"] > div')].find((t) => t.title === 'Home') || null`;
  const TAB = (t) => String.raw`[...document.querySelectorAll('[role="tablist"] > div')].find((x) => x.title === ${JSON.stringify(t)}) || null`;
  const PATH_INPUT = `document.querySelector('input[aria-label="Project directory path"]')`;
  const A1 = 'Oracle Jungle Zone · act1';
  const A2 = 'Oracle Jungle Zone · act2';
  const B1 = 'Sweep Zone B · act1';

  const expandLevels = async () => {
    for (let i = 0; i < 3; i++) {
      const cur = await c.evalExpr(`(() => { const s = ${LEVELS}; return s ? s.getAttribute('data-section-collapsed') : 'absent'; })()`);
      if (cur !== 'true') return cur;
      await realClick(LEVELS_HEADER);
      await sleep(400);
    }
    return 'still-collapsed';
  };
  /** A real click on an Explorer level row, then wait for the store to say so. */
  const openRow = async (label, zone, act) => {
    await expandLevels();
    const clicked = await realClick(ROW(label), { scroll: true });
    let s = null;
    for (let i = 0; i < 60; i++) {
      s = await st().catch(() => null);
      if (s && s.zone === zone && s.act === act && (await canvasRect())) break;
      await sleep(250);
    }
    await sleep(700);
    return { clicked, state: s };
  };
  /** Home tab, the typed-path field, Enter. The GUARDED user door. */
  const openByTypedPath = async (dir, expectName) => {
    const home = await realClick(HOME_TAB);
    await sleep(700);
    const field = await realClick(PATH_INPUT);
    await sleep(150);
    // ⚠ RUN 1: the switch-case field KEEPS the last path it opened (the Home
    // pane is kept alive), and a click puts the caret at its end, so the second
    // typed open APPENDED: "/tmp/cdps2-C2-…/tmp/cdps2-C1-…", a red "not a
    // recognized project" banner, and a 66px layout shift that re-aimed every
    // later row. Read it, then clear it with real keys before typing.
    const fieldBefore = await c.evalExpr(`(() => { const f = ${PATH_INPUT}; return f ? f.value : null; })()`);
    await chord('a', CTRL);
    await namedKey('Backspace', 8);
    const fieldCleared = await c.evalExpr(`(() => { const f = ${PATH_INPUT}; return f ? f.value : null; })()`);
    await typeText(dir);
    const typed = await c.evalExpr(`(() => { const f = ${PATH_INPUT}; return f ? f.value : null; })()`);
    await namedKey('Enter', 13, '\r');
    let t = '';
    for (let i = 0; i < 80; i++) {
      t = await title();
      const s = await st().catch(() => null);
      if (t.includes(expectName) && s && s.open) break;
      await sleep(250);
    }
    await sleep(1200);
    return { home, field, fieldBefore, fieldCleared, typedOk: typed === dir, title: t };
  };
  /** Back to the level after an open from Home: the level tab if one is
   *  listed, else the Explorer row. Neither calls setTool (tab-activation/
   *  level.ts writes only setCurrentAct). */
  const backToLevel = async (label, zone, act) => {
    const active = await c.evalExpr(String.raw`(() => { const t = [...document.querySelectorAll('[role="tablist"] > div')]
      .find((x) => /inset 0(px)? 2px 0(px)? (?!transparent)/.test(getComputedStyle(x).boxShadow) && !/transparent/.test(getComputedStyle(x).boxShadow));
      return t ? t.title : null; })()`);
    const tabs = await c.json(`[...document.querySelectorAll('[role="tablist"] > div')].map((t) => t.title)`);
    let how = 'already';
    if (active !== label) {
      if (tabs.includes(label)) {
        const p = await c.json(String.raw`(() => { const el = ${TAB(label)}; const b = el.getBoundingClientRect();
          return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
        await mouse('mouseMoved', p.x, p.y);
        await mouse('mousePressed', p.x, p.y, 'left', 1);
        await sleep(40);
        await mouse('mouseReleased', p.x, p.y, 'left', 0);
        how = `tab press at (${p.x}, ${p.y})`;
      } else {
        await openRow(label, zone, act);
        how = 'explorer row';
      }
    }
    for (let i = 0; i < 40; i++) { if (await canvasRect()) break; await sleep(200); }
    await sleep(700);
    return { active, tabs, how };
  };
  const pressTab = async (sel) => {
    const p = await c.json(String.raw`(() => { const el = ${sel}; if (!el) return null; const b = el.getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
    if (!p) return null;
    await mouse('mouseMoved', p.x, p.y);
    await mouse('mousePressed', p.x, p.y, 'left', 1);
    await sleep(40);
    await mouse('mouseReleased', p.x, p.y, 'left', 0);
    await sleep(700);
    return p;
  };

  // ═════════════════════════════════════════════════════════════════════════
  // 0. Open C1 through Home's typed-path field.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── 0: open copy C1 through the typed-path field on Home ────');
  const o0 = await openByTypedPath(C1.dir, C1.name);
  const s0 = await st();
  check('0a', 'C1 opened by a real click, typed path and Enter; title names C1; the first act is ojz act1',
    !!(o0.field && o0.field.hitOk) && o0.typedOk && o0.title.includes(C1.name) && s0.open && s0.zone === 'ojz' && s0.act === 'act1',
    `field ${JSON.stringify(o0.field)}; typed ${o0.typedOk}; title ${JSON.stringify(o0.title)}; state ${JSON.stringify(s0)}`);
  if (!s0.open) throw new Error('C1 did not open');
  await backToLevel(A1, 'ojz', 'act1');
  await expandLevels();
  const rows = await c.json(String.raw`(() => { const s = ${LEVELS}; return s ? [...s.querySelectorAll('button')].map((b) => (b.querySelector('span')?.textContent || '').trim()) : null; })()`);
  const facets = await c.json(`[...document.querySelectorAll('[aria-label="Facets"] button')].map((b) => b.textContent.trim())`);
  check('0b', 'the copy loaded all three levels this file added (ojz act1, ojz act2, Sweep Zone B act1) and the facet bar has Layout and Art',
    !!rows && [A1, A2, B1].every((l) => rows.includes(l)) && facets.includes('Layout') && facets.includes('Art'),
    `rows ${JSON.stringify(rows)}; facets ${JSON.stringify(facets)}`);

  const layout = await realClick(FACET('Layout'));
  await sleep(600);
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');     // camera SETUP, printed
  await sleep(300);
  const R = await canvasRect();
  const dpr0 = await dpr();
  // A foreground-rich 4x4 block-aligned region, and a paste target H whose
  // words differ from it, both inside the visible part of section 0.
  const visC = Math.min(64, Math.floor(R.w / 8)); const visR = Math.min(64, Math.floor(R.h / 8));
  const pick = await c.json(String.raw`(() => {
    const a = window.__dbg.aeon; const N = 256; const g = a.ntRect(0, 0, 0, N, N); if (!g) return null;
    const VC = ${visC}, VR = ${visR}; let best = null;
    for (let r = 2; r + 4 <= VR - 2; r += 2) for (let c = 2; c + 4 <= VC - 20; c += 2) {
      const t = new Set(); for (let dr = 0; dr < 4; dr++) for (let dc = 0; dc < 4; dc++) { const w = g[(r + dr) * N + c + dc]; if ((w & 0x7FF) !== 0) t.add(w & 0x7FF); }
      if (!best || t.size > best.distinct) best = { col: c, row: r, distinct: t.size };
    }
    if (!best) return null;
    let H = null;
    for (const dc of [16, 20, 24, -16]) {
      const hc = best.col + dc, hr = best.row; if (hc < 2 || hc + 4 > VC - 2) continue;
      let differ = 0; for (let dr = 0; dr < 4; dr++) for (let k = 0; k < 4; k++) if (g[(hr + dr) * N + hc + k] !== g[(best.row + dr) * N + best.col + k]) differ++;
      if (differ > 0) { H = { col: hc, row: hr, differ }; break; }
    }
    return { S: best, H };
  })()`);
  note('0', `dpr ${dpr0}; map canvas rect ${JSON.stringify(R)}; view ${JSON.stringify(await view())}; layout click ${JSON.stringify(layout)}; pick ${JSON.stringify(pick)}`);
  if (!pick || !pick.H) throw new Error(`no copyable region / paste target: ${JSON.stringify(pick)}`);
  const S = { ...pick.S, w: 4, h: 4 };
  const Ht = pick.H;
  const tilePx = (col, row) => ({ x: Math.round(R.x + col * 8 + 3), y: Math.round(R.y + row * 8 + 3) });
  const boxOf = (col, row, w, h, pad = 3) => ({ x: col * 8 - pad + (R.x - Math.ceil(R.x)), y: row * 8 - pad + (R.y - Math.ceil(R.y)), w: w * 8 + 2 * pad, h: h * 8 + 2 * pad });
  const S_BOX = boxOf(S.col, S.row, 4, 4);
  const H_BOX = boxOf(Ht.col, Ht.row, 4, 4);
  const Hpt = tilePx(Ht.col, Ht.row);
  const Hpt2 = tilePx(Ht.col + 6, Ht.row + 6);
  // PARK: outside the map canvas, so no tool hover is drawn into a clip.
  const PARK = await c.json(String.raw`(() => { const r = document.getElementById('map-canvas').getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.max(2, Math.round(r.top) - 6);
    const hit = document.elementFromPoint(x, y); return { x, y, hitTag: hit ? hit.tagName : null, onCanvas: hit && hit.id === 'map-canvas' }; })()`);
  note('0', `S ${JSON.stringify(S)} box ${JSON.stringify(S_BOX)}; H ${JSON.stringify(Ht)} aim ${JSON.stringify(Hpt)} box ${JSON.stringify(H_BOX)}; park ${JSON.stringify(PARK)}`);
  const park = async () => { await mouse('mouseMoved', PARK.x, PARK.y); await sleep(350); };
  /** Every aim below is derived from R. RUN 1: a banner moved the canvas box
   *  66px and the rows after it aimed at other tiles, reading as app failures.
   *  So a phase REFUSES to run on a box that has moved. */
  const sameGeometry = async (where) => {
    const now = await canvasRect();
    if (!now || now.x !== R.x || now.y !== R.y || now.w !== R.w || now.h !== R.h) {
      await shot(`geometry-moved-${where}`);
      throw new Error(`the map canvas box moved before ${where}: ${JSON.stringify(R)} -> ${JSON.stringify(now)}`);
    }
  };
  const hover = async () => {                // a real move off H and back onto it
    await mouse('mouseMoved', Hpt2.x, Hpt2.y); await sleep(120);
    await mouse('mouseMoved', Hpt.x, Hpt.y); await sleep(350);
  };
  const dragMarquee = async () => {
    const a = tilePx(S.col, S.row); const b = tilePx(S.col + 3, S.row + 3);
    await mouse('mouseMoved', a.x, a.y);
    await mouse('mousePressed', a.x, a.y, 'left', 1);
    await mouse('mouseMoved', Math.round((a.x + b.x) / 2), Math.round((a.y + b.y) / 2), 'left', 1);
    await mouse('mouseMoved', b.x, b.y, 'left', 1);
    await mouse('mouseReleased', b.x, b.y, 'left', 0);
    await sleep(300);
    return { from: a, to: b };
  };
  const clickAt = async (p) => {
    await mouse('mouseMoved', p.x, p.y);
    await mouse('mousePressed', p.x, p.y, 'left', 1);
    await sleep(40);
    await mouse('mouseReleased', p.x, p.y, 'left', 0);
    await sleep(400);
  };
  const waitCanvas = async (want) => {
    for (let i = 0; i < 40; i++) { if (!!(await canvasRect()) === want) return true; await sleep(150); }
    return false;
  };

  await chord('m');
  const tool0 = (await st()).tool;
  await park();
  await waitNoToasts();
  const A0 = await grab('r1-A0-no-marquee');
  await sleep(900);
  const A0b = await grab();
  const nullCtl = diff(A0, A0b);
  check('0c', 'NULL CONTROL: two clips of the untouched map 0.9s apart are pixel-identical (the map does not animate under these compares)',
    nullCtl.comparable && nullCtl.changed === 0, `tool ${tool0}; ${JSON.stringify(nullCtl)}`);
  // Reference: the marquee tool hovering H, nothing armed, no marquee.
  await hover();
  const REF_H = await grab('r3-ref-hover-clean');
  await park();

  // ═════════════════════════════════════════════════════════════════════════
  // R1: the marquee survives a facet round trip through Art.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── R1: marquee, Layout -> Art -> Layout ────');
  const drag1 = await dragMarquee();
  await park();
  const M1 = await marqueeNow();
  const A1c = await grab('r1-A1-marquee-drawn');
  const d01 = diff(A0, A1c, S_BOX);
  check('R1.1', 'a real drag drew a marquee: the probe holds it and the clip shows it, inside its own box',
    !!M1 && M1.w === 4 && M1.h === 4 && d01.changed > 0 && d01.inside > 0,
    `dpr ${await dpr()}; drag ${JSON.stringify(drag1)}; marquee ${JSON.stringify(M1)}; diff(A0, A1) ${JSON.stringify(d01)}`);

  await c.evalExpr(`document.getElementById('map-canvas').__sweepMark = 'before-art'`);
  const art1 = await realClick(FACET('Art'));
  const goneInArt = await waitCanvas(false);
  await sleep(600);
  await shot('r1-art-facet');
  const lay1 = await realClick(FACET('Layout'));
  const backInLayout = await waitCanvas(true);
  await sleep(800);
  const markAfter = await c.evalExpr(`document.getElementById('map-canvas').__sweepMark ?? null`);
  check('R1.2', 'the trip REMOUNTED the map: #map-canvas left the DOM under Art and a NEW element came back',
    !!(art1 && art1.hitOk) && !!(lay1 && lay1.hitOk) && goneInArt && backInLayout && markAfter === null,
    `Art ${JSON.stringify(art1)}; Layout ${JSON.stringify(lay1)}; absent under Art ${goneInArt}; back ${backInLayout}; mark on the returned element ${JSON.stringify(markAfter)}`);
  await park();
  const M2 = await marqueeNow();
  const A2c = await grab('r1-A2-after-art-trip');
  const d12 = diff(A1c, A2c);
  const d02 = diff(A0, A2c, S_BOX);
  const v1 = await view();
  await shot('r1-after-art-trip-full');
  check('R1.3', 'THE ROW: after the Art round trip the marquee is still there, in the store and on screen (clip identical to before the trip)',
    JSON.stringify(M2) === JSON.stringify(M1) && d12.comparable && d12.changed === 0 && d02.inside > 0,
    `dpr ${await dpr()}; view ${JSON.stringify(v1)}; marquee ${JSON.stringify(M2)}; diff(A1, A2) ${JSON.stringify(d12)}; diff(A0, A2) ${JSON.stringify(d02)}`);

  await chord('c', CTRL);
  const copied = await waitToast((t) => /^Copied /.test(t));
  const ci1 = await clipInfo();
  check('R1.4', 'and Ctrl+C copies it: a painted `Copied ...` toast and a 4x4 clipboard holding real art',
    !!copied && toastPainted(copied) && !!ci1 && ci1.widthTiles === 4 && ci1.heightTiles === 4 && ci1.nonzeroTiles > 0,
    `toast ${JSON.stringify(copied)}; clipboard ${JSON.stringify(ci1)}`);

  // CONTROL: a real act switch clears it.
  const toA2 = await openRow(A2, 'ojz', 'act2');
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');
  await park();
  await waitNoToasts();
  const M3 = await marqueeNow();
  const A3c = await grab('r1-A3-control-act2');
  const d03 = diff(A0, A3c, S_BOX);
  check('R1.5', 'CONTROL: a real act switch (Explorer row, act 2, a byte copy of act 1) clears it: probe null, clip identical to the pre-marquee A0',
    !!(toA2.clicked && toA2.clicked.hitOk) && toA2.state.act === 'act2' && M3 === null && d03.comparable && d03.changed === 0,
    `row ${JSON.stringify(toA2.clicked)}; state ${JSON.stringify(toA2.state)}; marquee ${JSON.stringify(M3)}; diff(A0, A3) ${JSON.stringify(d03)}`);

  // ═════════════════════════════════════════════════════════════════════════
  // R2: an armed paste is off after the Art round trip, and no ghost stays.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── R2: armed paste, Layout -> Art -> Layout ────');
  const toA1 = await openRow(A1, 'ojz', 'act1');
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');
  const facetBack = await realClick(FACET('Layout'));
  await chord('m');
  await dragMarquee();
  await chord('c', CTRL);
  await waitNoToasts();
  await hover();
  const B0 = await grab('r2-B0-marquee-hover-unarmed');
  const pA = (await paints()).paints;
  await chord('v', CTRL);
  await hover();
  const g1 = await paints();
  const B1c = await grab('r2-B1-ghost-armed');
  const d01b = diff(B0, B1c, H_BOX);
  check('R2.1', 'CONTROL: Ctrl+V armed the paste: real moves advance the ghost\'s paint count, and the ghost is painted at H',
    g1.pasting === true && g1.paints > pA && d01b.inside > 0,
    `row back to act1 ${JSON.stringify(toA1.state)}; layout ${JSON.stringify(facetBack && facetBack.hitOk)}; paints ${pA} -> ${g1.paints}; ghost ${JSON.stringify(g1)}; diff(B0, B1) ${JSON.stringify(d01b)}`);
  await shot('r2-armed-full');

  await realClick(FACET('Art'));
  const gone2 = await waitCanvas(false);
  await sleep(500);
  await realClick(FACET('Layout'));
  const back2 = await waitCanvas(true);
  await sleep(800);
  const pB = (await paints()).paints;
  await hover();
  await mouse('mouseMoved', Hpt.x + 40, Hpt.y + 24); await sleep(150);
  await mouse('mouseMoved', Hpt.x, Hpt.y); await sleep(350);
  const pC = (await paints()).paints;
  const toolAfter = (await st()).tool;
  check('R2.2', 'THE ROW, paste mode: after the trip, real moves over the map leave the ghost\'s paint count where it was, so paste mode is OFF',
    gone2 && back2 && pC === pB,
    `remount ${gone2}/${back2}; paints ${pB} -> ${pC} across 4 moves; tool after the trip ${toolAfter}`);
  // Re-arm the marquee TOOL in case the facet moved it. Runs 3 and 4 read it as
  // still 'marquee' after the trip, so this is belt and braces; setTool keeps
  // the marquee either way and clears only `pasting` and `selection`.
  await chord('m');
  await hover();
  const B2c = await grab('r2-B2-after-art-trip');
  const d02b = diff(B0, B2c);
  const d12b = diff(B1c, B2c, H_BOX);
  check('R2.3', 'THE ROW, the picture: hovering H after the trip gives the unarmed picture B0 exactly (marquee kept, no ghost)',
    d02b.comparable && d02b.changed === 0 && d12b.inside > 0,
    `dpr ${await dpr()}; diff(B0, B2) ${JSON.stringify(d02b)}; diff(B1 ghost, B2) ${JSON.stringify(d12b)}; marquee ${JSON.stringify(await marqueeNow())}`);

  // ═════════════════════════════════════════════════════════════════════════
  // R3: a second copy with the SAME zone/act ids clears both.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── R3: marquee + armed paste, then the SECOND copy is opened ────');
  await chord('v', CTRL);
  await hover();
  const g3 = await paints();
  const D1 = await grab('r3-D1-both-on-screen');
  const dD1 = { marquee: diff(REF_H, D1, S_BOX), ghost: diff(REF_H, D1, H_BOX) };
  const M4 = await marqueeNow();
  check('R3.0', 'PRECONDITION on screen: the marquee AND the paste ghost are both painted (against the clean hover reference)',
    !!M4 && g3.pasting === true && dD1.marquee.inside > 0 && dD1.ghost.inside > 0,
    `marquee ${JSON.stringify(M4)}; ghost ${JSON.stringify(g3)}; ${JSON.stringify(dD1)}`);
  await shot('r3-before-open-full');

  // CONTROL: the Home round trip itself, with no open, keeps both.
  //
  // ⚠ RUNS 1 AND 2 went red here on the WHOLE clip, and both reds were the
  // map's coordinate readout bar (MapViewport `hoverBarRef`), not the marquee
  // or the ghost: `onMouseLeave` hides it (MapViewport.tsx:4453) and the only
  // line that shows it again (:3993) sits AFTER the paste branch's `return`
  // (:3814), so in paste mode the readout stays hidden once the cursor has left
  // the map. Pre-existing, and not what this control is about. So the control
  // reads the marquee box and the ghost box, and every OTHER changed pixel must
  // lie inside the readout bar's own rect while that bar flips flex -> none.
  const HOVERBAR = String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
    const bar = [...cv.parentElement.querySelectorAll('div')].find((d) => d.style.bottom === '0px'
      && d.style.position === 'absolute' && /^(Sec |BG |Pos )/.test(d.textContent || ''));
    if (!bar) return { found: false };
    const b = bar.getBoundingClientRect();
    return { found: true, display: bar.style.display, text: bar.textContent,
      rect: { x: b.left, y: b.top, w: b.width, h: b.height } }; })()`;
  const bar0 = await c.json(HOVERBAR);
  await c.evalExpr(`document.getElementById('map-canvas').__sweepMark = 'R3'`);
  await pressTab(HOME_TAB);
  const onHomeMark = await c.evalExpr(`(() => { const cv = document.getElementById('map-canvas'); return cv ? (cv.__sweepMark ?? null) : 'absent'; })()`);
  const onHomeRect = await canvasRect();
  const back0 = await backToLevel(A1, 'ojz', 'act1');
  const pD = (await paints()).paints;
  await hover();
  const pE = (await paints()).paints;
  const M5 = await marqueeNow();
  const D1b = await grab('r3-D1b-after-home-trip');
  await shot('r3-after-home-trip-full');
  const bar1 = await c.json(HOVERBAR);
  const barBox = bar0 && bar0.found
    ? { x: bar0.rect.x - D1.clip.x, y: bar0.rect.y - D1.clip.y, w: bar0.rect.w, h: bar0.rect.h } : null;
  const dHome = diff(D1, D1b);
  const dHomeS = diff(D1, D1b, S_BOX);
  const dHomeH = diff(D1, D1b, H_BOX);
  const dHomeBar = barBox ? diff(D1, D1b, barBox) : { inside: null };
  const onlyTheBar = dHome.changed === 0
    || (dHomeBar.inside === dHome.changed && bar0.display === 'flex' && bar1 && bar1.display === 'none');
  check('R3.1', 'CONTROL: Home and back WITHOUT an open keeps both (map mounted but hidden on Home; moves still advance the ghost; '
    + 'the marquee box and the ghost box are pixel-identical, and any other change is the readout bar alone)',
    onHomeMark === 'R3' && !!M5 && pE > pD && dHome.comparable && dHomeS.inside === 0 && dHomeH.inside === 0 && onlyTheBar,
    `on Home: canvas mark ${JSON.stringify(onHomeMark)}, rect ${JSON.stringify(onHomeRect)}; back ${JSON.stringify(back0)}; paints ${pD} -> ${pE}; marquee ${JSON.stringify(M5)}\n`
    + `        whole clip ${JSON.stringify(dHome)}; marquee box ${dHomeS.inside}; ghost box ${dHomeH.inside}; `
    + `readout bar ${JSON.stringify(bar0)} -> ${JSON.stringify(bar1)}, changed pixels inside its rect ${dHomeBar.inside}`);
  if (dHome.changed > 0 && onlyTheBar) {
    note('OBS2', 'in paste mode the map\'s coordinate readout stays hidden after the cursor leaves the map and comes back '
      + `(bar display ${bar0.display} -> ${bar1.display}); pre-existing, MapViewport.tsx:3814 returns before :3993`);
  }

  const clipBeforeC2 = await clipInfo();
  const o3 = await openByTypedPath(C2.dir, C2.name);
  const s3 = await st();
  const M6 = await marqueeNow();
  const mark3 = await c.evalExpr(`(() => { const cv = document.getElementById('map-canvas'); return cv ? (cv.__sweepMark ?? null) : 'absent'; })()`);
  check('R3.2', 'the SECOND copy opened through the typed path: title names C2, and the open act has the SAME ids (ojz, act1)',
    o3.typedOk && o3.title.includes(C2.name) && s3.zone === 'ojz' && s3.act === 'act1',
    `field ${JSON.stringify(o3.field)}; title ${JSON.stringify(o3.title)}; state ${JSON.stringify(s3)}`);
  const back3 = await backToLevel(A1, 'ojz', 'act1');
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');
  await sleep(300);
  const pF = (await paints()).paints;
  await hover();
  await mouse('mouseMoved', Hpt.x + 40, Hpt.y + 24); await sleep(150);
  await mouse('mouseMoved', Hpt.x, Hpt.y); await sleep(350);
  const pG = (await paints()).paints;
  const tool3 = (await st()).tool;
  await waitNoToasts();
  await hover();
  const D2 = await grab('r3-D2-after-second-copy');
  const dD2 = diff(REF_H, D2);
  await shot('r3-after-open-full');
  check('R3.3', 'THE ROW: after the open, the marquee is gone (probe null) and paste mode is off (moves leave the paint count), and the clip equals the clean hover reference',
    M6 === null && pG === pF && dD2.comparable && dD2.changed === 0,
    `marquee right after the open ${JSON.stringify(M6)}; back ${JSON.stringify(back3)}; tool ${tool3}; paints ${pF} -> ${pG}; diff(REF_H, D2) ${JSON.stringify(dD2)}; clipboard kept ${JSON.stringify(clipBeforeC2)} -> ${JSON.stringify(await clipInfo())}`);
  check('R3.4', 'the packet\'s source claim: the map stayed MOUNTED across the project open (the same #map-canvas element carries the mark)',
    mark3 === 'R3', `mark after the open ${JSON.stringify(mark3)}`);

  // ═════════════════════════════════════════════════════════════════════════
  // R6 (+R7): the second copy refuses; reopening the first also refuses.
  // ═════════════════════════════════════════════════════════════════════════
  /** One refusal, measured in full. The click uses the SELECT tool, whose own
   *  click at H is first shown to paint nothing (a null click control). */
  const refusalAt = async (id, where) => {
    await sameGeometry(id);
    await chord('s');
    await park();
    await waitNoToasts();
    await hover();
    const E0 = await grab(`${id}-E0-before`);
    await clickAt(Hpt);
    await hover();
    const E0c = await grab();
    const nullClick = diff(E0, E0c);
    const w0 = await words(); const u0 = await canUndo();
    const p0 = (await paints()).paints;
    const storeBefore = (await toastStore()).length;
    await chord('v', CTRL);
    const t = await waitToast((x) => x === REFUSAL);
    await sleep(300);
    await shot(`${id}-refusal-toast-full`);
    const store = await toastStore();
    await hover();
    const p1 = (await paints()).paints;
    await clickAt(Hpt);
    await hover();
    const p2 = (await paints()).paints;
    const w1 = await words(); const u1 = await canUndo();
    const gone = await waitNoToasts();
    await hover();
    const E1 = await grab(`${id}-E1-after`);
    const dE = diff(E0, E1, H_BOX);
    const refusalToasts = store.filter((x) => x.message === REFUSAL);
    check(`${id}.a`, `${where}: Ctrl+V is REFUSED with the sentence from map-clipboard.ts verbatim, painted, warning tier`,
      !!t && t.text === REFUSAL && toastPainted(t) && refusalToasts.length > 0 && refusalToasts.every((x) => x.type === 'warning'),
      `dpr ${await dpr()}; toast ${JSON.stringify(t)}; store ${JSON.stringify(refusalToasts)} (had ${storeBefore} before)`);
    check(`${id}.b`, `${where}: nothing is armed (moves leave the paint count) and a click at H writes NOTHING (every word plane, the undo stack)`,
      p1 === p0 && p2 === p0 && w1.hash === w0.hash && w1.words === w0.words && w1.words > 0 && u1 === u0,
      `paints ${p0} -> ${p1} -> ${p2}; words ${JSON.stringify(w0)} -> ${JSON.stringify(w1)}; canUndo ${u0} -> ${u1}`);
    check(`${id}.R7`, `R7 at ${where}: after the refusal and the click the map clip is pixel-identical (null click control first)`,
      nullClick.comparable && nullClick.changed === 0 && dE.comparable && dE.changed === 0 && gone.left.length === 0,
      `null click ${JSON.stringify(nullClick)}; diff(E0, E1) ${JSON.stringify(dE)}; toast gone after ${gone.waitedMs}ms`);
  };

  console.log('\n──── R6a: in the SECOND copy, Ctrl+V with the first copy\'s clipboard ────');
  await refusalAt('r6a', 'second copy C2');

  console.log('\n──── R6b: reopen the FIRST copy, Ctrl+V ────');
  const o6 = await openByTypedPath(C1.dir, C1.name);
  const back6 = await backToLevel(A1, 'ojz', 'act1');
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');
  check('R6.0', 'the FIRST copy reopened through the typed path (title names C1), on ojz act1; the clipboard survived',
    o6.typedOk && o6.title.includes(C1.name) && (await st()).zone === 'ojz' && !!(await clipInfo()),
    `field ${JSON.stringify(o6.field)}; value before clearing ${JSON.stringify(o6.fieldBefore)}, after ${JSON.stringify(o6.fieldCleared)}; `
    + `typed ${o6.typedOk}; title ${JSON.stringify(o6.title)}; back ${JSON.stringify(back6)}; clipboard ${JSON.stringify(await clipInfo())}`);
  note('OBS', `the switch-case typed-path field held ${JSON.stringify(o6.fieldBefore)} when Home was shown again `
    + `(C2 was opened through it earlier: ${JSON.stringify(C2.dir)}); R3's open of C2 found it holding ${JSON.stringify(o3.fieldBefore)}`);
  await refusalAt('r6b', 'reopened first copy C1');

  // CONTROL: a fresh copy in the reopened C1 arms.
  await sameGeometry('R6.1');
  await chord('m');
  await dragMarquee();
  await chord('c', CTRL);
  await waitNoToasts();
  await hover();
  const K0 = await grab();
  const pk0 = (await paints()).paints;
  await chord('v', CTRL);
  await hover();
  const pk1 = (await paints()).paints;
  const K1 = await grab('r6-control-fresh-copy-armed');
  const refusedNow = (await toastsDom()).some((x) => x.text === REFUSAL);
  const dK = diff(K0, K1, H_BOX);
  check('R6.1', 'CONTROL: after a fresh Ctrl+C in the reopened copy, Ctrl+V ARMS (paint count moves, ghost painted, no refusal)',
    pk1 > pk0 && dK.inside > 0 && !refusedNow, `paints ${pk0} -> ${pk1}; diff ${JSON.stringify(dK)}; refusal toast ${refusedNow}`);
  await namedKey('Escape', 27);

  // ═════════════════════════════════════════════════════════════════════════
  // R4 (+R7): zone A to zone B refuses; back in zone A it pastes.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── R4: copy in zone A (ojz), Ctrl+V in zone B ────');
  const artA = await c.evalExpr('window.__dbg.aeon.zoneArtHash()');
  const toB = await openRow(B1, 'zb', 'act1');
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');
  const artB = await c.evalExpr('window.__dbg.aeon.zoneArtHash()');
  await park();
  await waitNoToasts();
  await shot('r4-zone-b-full');
  check('R4.0', 'zone B opened by a real Explorer click, and its tile set really differs (zone-art hash)',
    !!(toB.clicked && toB.clicked.hitOk) && toB.state.zone === 'zb' && artA !== artB,
    `row ${JSON.stringify(toB.clicked)}; state ${JSON.stringify(toB.state)}; zoneArtHash ojz ${artA} vs zb ${artB}`);
  await refusalAt('r4', 'zone B');

  console.log('\n──── R4 back in zone A, then R5 act 1 -> act 2 ────');
  /** A paste that should LAND: arms, click at H writes, the clip changes. */
  const pasteLands = async (id, where, label, zone, act) => {
    const to = await openRow(label, zone, act);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sameGeometry(id);
    await chord('s');
    await park();
    await waitNoToasts();
    const P0 = await grab(`${id}-P0-before`);
    const w0 = await words();
    const pp0 = (await paints()).paints;
    await chord('v', CTRL);
    await hover();
    const pp1 = (await paints()).paints;
    const refused = (await toastsDom()).some((x) => x.text === REFUSAL);
    await clickAt(Hpt);
    const w1 = await words(); const u1 = await canUndo();
    await namedKey('Escape', 27);
    await park();
    await waitNoToasts();
    const P1 = await grab(`${id}-P1-after-paste`);
    const dP = diff(P0, P1, H_BOX);
    check(`${id}`, `${where}: Ctrl+V arms with no refusal, the click at H WRITES, and the clip changes at H`,
      !!(to.clicked && to.clicked.hitOk) && to.state.zone === zone && to.state.act === act
        && pp1 > pp0 && !refused && w1.hash !== w0.hash && u1 === true && dP.inside > 0,
      `dpr ${await dpr()}; row ${JSON.stringify(to.clicked)}; state ${JSON.stringify(to.state)}; paints ${pp0} -> ${pp1}; refusal toast ${refused}; `
      + `words ${w0.hash} -> ${w1.hash}; canUndo ${u1}; diff(P0, P1) ${JSON.stringify(dP)}`);
    return dP;
  };
  const r4back = await pasteLands('r4.back', 'back in zone A (ojz act1)', A1, 'ojz', 'act1');
  const r5 = await pasteLands('r5', 'act 1 -> act 2 of ojz', A2, 'ojz', 'act2');
  check('R7.control', 'R7 CONTROL: a real paste at H DOES change the same clip, so the refusal rows\' zero is an instrument that can see a paste',
    r4back.inside > 0 && r5.inside > 0, `zone A ${JSON.stringify(r4back)}; act 2 ${JSON.stringify(r5)}`);
  await shot('r5-after-paste-full');
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok === true).length}/${results.length} rows had run: this is NOT a pass over the rows that never ran.`);
  console.log('END-OF-RUN');
  process.exit(2);
});
