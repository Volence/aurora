#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// MAPVIEWPORT FOREGROUND, 2026-09-28. The map surface's on-screen checks that
// the lens row MAPVIEWPORT-UNTESTED still lists, watched in the RUNNING app,
// on a COPY of aeon, on a private virtual display.
// ═══════════════════════════════════════════════════════════════════════════
//
// SOURCE. docs/lens-findings.jsonl, the last MAPVIEWPORT-UNTESTED line
// (2026-09-25T14:29:44Z), "WHAT REMAINS", nine items. SEVEN OF THE NINE ARE
// ALREADY ROWS of `npm run harness:cdp-sweep-4-0912` (built 2026-09-12, never
// cited by the ledger): the stamp ghost during a link hover (SG.*), the Chunk
// links panel (CL.*), the guide drag's Effects half (GD.*), the screen frame's
// locked arm (SF.*), resolveEscape's lens arm (ESC.*), the paste ghost (PG.*),
// the band preview (BAND.*) and the hover bar's code half (HB.*). They are
// re-run and re-planted on today's tree, NOT duplicated here. This file holds
// only what no harness asserts today:
//
// PARTS (env PART, comma list; default all, in this order):
//   xp     XP.*   item 7, the collision hover preview. cdp-sweep-4's XO.* rows
//                 were retired 2026-09-26 with the crossover brush (ROADMAP rows
//                 223+224), and no running-app row has looked at the plain
//                 shape ghost since.
//   gate   GT.*   item 3's OTHER half: the guide drag is gated on the Effects
//                 facet. GD.* and effects-guides 5b-6b prove the drag IN the
//                 facet, effects-guides 8b that Layout draws no guide; nothing
//                 pressed a guide's row OUTSIDE the facet.
//   hb     HBW.*  item 9 at the widths a window takes: nothing of the readout
//                 is cut; and the numbers a legibility call needs (NOTEs).
//   panel  CLV    item 2, a MEASUREMENT: CL.a scrolls the Chunk links readout
//                 into view before it looks; this reads it with no scroll.
//
// ═══ THE ROWS, AND WHAT EACH IS PLANTED AGAINST ═══════════════════════════
// Each claim row has a plant in MapViewport.tsx that should turn it (and only
// the rows listed) red; the packet quotes each plant, its red run and the
// restored green run.
//   XP.0  PREMISE (does not discriminate; it gates the part).
//   XP.a  the fill of the ghost is the oracle's silhouette of the brush word at
//         the hovered cell, and nowhere else on the layer.  plant: the shape
//         call gated off (`if (profile && false)`).
//   XP.p  the cursor cell's COLLISION_PREVIEW_PRIMARY outline on all four edges.
//         plant: the primary stroke removed.
//   XP.d  ON SCREEN: the screenshot is the layer over a no-ghost reference.
//         plant: the preview canvas `visibility: hidden`.
//   XP.c  the ghost follows a real move into the next cell.  plant: the hover
//         only set when none is held (`if (!prev)`).
//   XP.e  leaving the map empties the layer.  plant: onMouseLeave's preview clear
//         removed.
//   XP.b  the ghost carries the palette's H flip (mirrored silhouette).  plant:
//         the ghost word built with `userXFlip: false`.
//   GT.0  PREMISE (does not discriminate).
//   GT.c  CONTROL: in Effects the same press takes the guide (does not
//         discriminate the gate; it proves the aim is on a live guide's row).
//   GT.a  in LAYOUT the same world row's press does not move world_y and goes to
//         the marquee tool.  plant: activeGuideScene's facet check dropped.
//   HBW.a nothing of the longest readout is cut at 1400, 1100, 900, 700.
//         plants: styles.hoverBar gains `whiteSpace: 'nowrap'` (red at 900, the
//         packet's plant; 1400 and 1100 fit one line either way, so they do not
//         discriminate); styles.hoverBar loses `overflowWrap: 'anywhere'` (red
//         at 700 only: the collision arm's sparkline is one run with no break
//         opportunity, wider than the bar's content box; ROADMAP row 244).
//   HBW.find, HB.numbers, HB.lines, CLV   NOTES: measured, never counted.
//         (HBW.find was the 700 px finding; since row 244 700 is GATED in
//         HBW.a and HBW.find only prints the 700 line boxes.)
//
// EXPECTATIONS COME FROM THE TREE, NOT FROM A RUN (see loadOracle): the
// collision tables are decoded outside the app from the run's copy by the
// tree's own loader and resolveCell; colours from HEAD's canvas-colors.ts.
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//   * A SYNTHETIC EVENT. Every gesture is Input.dispatchMouseEvent /
//     dispatchKeyEvent at an INTEGER client pixel; the cell, tile or row it
//     lands on is derived back from that integer. `__dbg` is used for reads,
//     setView, opening the copy and the collision overlay toggle (hb setup).
//   * THE COMPONENT'S OWN WORD. No row reads a report the map publishes about
//     itself as its verdict: pixels (the preview canvas's backing store, and
//     screenshots), the saved-document JSON (`scenesJson`), the store's marquee
//     and brush word, and computed style / layout boxes.
//   * A STRAY MOVE. Xvfb's pointer is parked; a part in which a mouse event
//     arrives at a position this harness never sent is UNMEASURABLE.
//   * THE MAIN CHECKOUT'S dist/. `root:`/`pinned:`/`in-tree:` are printed.
//
// NO EMULATOR, EVER. ORACLE_SOCKET points into a mkdtemp of this run. NOTHING
// SAVES; the project is a fresh mkdtemp copy per run (under TMPDIR), made from
// AEON_DIR, which must itself be a copy: the harness refuses the live sibling.
//
// RUN (from a worktree, BOTH variables, or the main checkout's dist answers):
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   TMPDIR=<a dir under $HOME> AEON_DIR=<a copy of aeon> \
//     AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<electron> [PART=xp,gate,hb,panel] \
//     npm run harness:mapviewport-foreground

import { AURORA_DIR, siblingDefaultPath, checkoutOverride } from '../test/support/sibling-root.mjs';
import { readFileSync, existsSync, cpSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import * as zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree, RUN_PROFILE_DIR, descendants, cmdlineOf, isXvfbProcess } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const ROOT = AURORA_DIR;
const HERE = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const RUN = announceRunRoot(runTarget(ROOT));
assertFreshBuild(RUN);
assertDebugBuild(RUN);
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const PORT = Number(process.env.PORT ?? 9437);
const ALL_PARTS = ['xp', 'gate', 'hb', 'panel'];
const PARTS = (process.env.PART ?? 'all') === 'all' ? ALL_PARTS : String(process.env.PART).split(',');
for (const p of PARTS) if (!ALL_PARTS.includes(p)) throw new Error(`PART ${p} is not one of ${ALL_PARTS.join(', ')}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const uptime = () => String(spawnSync('uptime', { encoding: 'utf8' }).stdout || '').trim();

// ═══ THE COPY ══════════════════════════════════════════════════════════════
const AEON = checkoutOverride('aeon');
if (!AEON) {
  console.log('HARNESS REFUSES: AEON_DIR must name a COPY of an aeon project (see the header). Nothing ran.');
  process.exit(2);
}
const LIVE_AEON = (() => { try { return siblingDefaultPath('aeon'); } catch { return null; } })();
const samePath = (a, b) => { try { return realpathSync(a) === realpathSync(b); } catch { return false; } };
if (LIVE_AEON && samePath(AEON.value, LIVE_AEON)) {
  console.log(`HARNESS REFUSES: ${AEON.name}=${AEON.value} is the live aeon tree (${LIVE_AEON}). Point it at a copy.`);
  process.exit(2);
}
if (!existsSync(join(AEON.value, 'project.json'))) {
  console.log(`HARNESS REFUSES: ${AEON.value} has no project.json; it is not an aeon project.`);
  process.exit(2);
}
/** A fresh mkdtemp copy per run. `.git` and `.claude` are skipped: the second is
 *  the peer's own worktrees (gigabytes), and neither is part of the project. */
function makeCopy() {
  const dir = realpathSync(mkdtempSync(join(os.tmpdir(), 'mvfg-aeon-')));
  cpSync(AEON.value, dir, {
    recursive: true,
    filter: (src) => !relative(AEON.value, src).split('/').some((seg) => seg === '.git' || seg === '.claude'),
  });
  if (LIVE_AEON && samePath(dir, LIVE_AEON)) throw new Error('refusing: the copy resolved to the live tree');
  const pj = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  const z = pj.zones.find((x) => x.id === 'ojz');
  if (!z || !z.acts.some((a) => a.id === 'act1')) throw new Error(`the copy has no ojz act1: ${J(pj.zones.map((x) => x.id))}`);
  return { dir, name: pj.name, zoneName: z.name };
}
const SOCK_DIR = mkdtempSync(join(os.tmpdir(), 'mvfg-sock-'));
const SOCK = join(SOCK_DIR, 'o.sock');
for (const forbidden of ['/tmp/oracle.sock', `${process.env.XDG_RUNTIME_DIR ?? '/nonexistent'}/oracle.sock`]) {
  if (SOCK === forbidden) throw new Error(`refusing: ORACLE_SOCKET would be ${forbidden}`);
}

// ═══ THE ORACLE ════════════════════════════════════════════════════════════
const git = (...args) => spawnSync('git', ['-C', RUN.root, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
const HEAD_SHA = git('rev-parse', 'HEAD').stdout.trim();
const SRC_HEAD = (p) => {
  const r = git('show', `HEAD:${p}`);
  if (r.status !== 0) throw new Error(`ORACLE: git show HEAD:${p} exited ${r.status}: ${r.stderr}`);
  return r.stdout;
};
/** One regex, exactly one match in the COMMITTED file, or the harness stops. */
function fromHead(file, re, what) {
  const all = [...SRC_HEAD(file).matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))];
  if (all.length !== 1) throw new Error(`ORACLE: ${what} matched ${all.length} times in HEAD:${file} (want 1): ${re}`);
  return all[0];
}
function parseColour(str) {
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(str.trim());
  if (m) return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 };
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/.exec(str.trim());
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`ORACLE: cannot parse colour ${str}`);
}
/**
 * THE ORACLE. Every expectation comes from the tree, never from the app under
 * test and never from a typed number:
 *   * the collision profile set is decoded OUTSIDE the app, from the run's own
 *     copy of aeon, by the tree's own loader (`collisionTableSearchPaths`, then
 *     `loadCollisionProfilesFa`, the order `loadAeonProject` probes), a word is
 *     resolved by the tree's `resolveCell`, and `columnSolidRun` gives each
 *     column's solid run. Bundled with esbuild from `src/`; no plant in this
 *     parcel touches those files (every plant edits MapViewport.tsx).
 *   * colours and style literals are read from the COMMITTED HEAD with a regex
 *     that must match exactly once, so a plant in the working tree cannot move
 *     the expectation with it.
 */
async function loadOracle(copyDir) {
  const req = createRequire(`${RUN.root}/package.json`);
  const esb = req('esbuild');
  const r = esb.buildSync({
    stdin: {
      contents: [
        "export { loadCollisionProfilesFa, collisionTableSearchPaths } from './src/core/project/aeon/load.ts';",
        "export { resolveCell } from './src/core/collision/collision-cell-resolve.ts';",
        "export { columnSolidRun } from './src/core/collision/collision-render.ts';",
        "export { SECTION_TILES_WIDE } from './src/core/model/s4-types.ts';",
      ].join('\n'),
      resolveDir: RUN.root, loader: 'ts',
    },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error',
  });
  const m = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
  for (const k of ['loadCollisionProfilesFa', 'collisionTableSearchPaths', 'resolveCell', 'columnSolidRun']) {
    if (typeof m[k] !== 'function') throw new Error(`ORACLE: the bundle exports no ${k}`);
  }
  const raw = JSON.parse(readFileSync(join(copyDir, 'project.json'), 'utf8'));
  const fa = { read: async (rel) => new Uint8Array(readFileSync(join(copyDir, rel))) };
  // collisionTableSearchPaths lists `<dir>base/` then `<dir>` per candidate;
  // loadCollisionProfilesFa probes that same pair itself, so hand it each dir once.
  const dirs = [...new Set(m.collisionTableSearchPaths(raw).map((q) => q.replace(/base\/$/, '')))];
  let profiles = null; let from = null;
  for (const dir of dirs) { profiles = await m.loadCollisionProfilesFa(fa, dir); if (profiles) { from = dir; break; } }
  if (!profiles) throw new Error(`ORACLE: no collision profile set loaded from ${J(dirs)}`);
  /** The 16 columns' solid runs (cell-local px) for a word; null runs = air/unknown. */
  const runsOf = (word) => {
    const rc = m.resolveCell(profiles, word);
    if (!rc.profile) return { air: rc.air, known: rc.known, heights: null, runs: null };
    const heights = Array.from(rc.profile.heights);
    return { air: rc.air, known: rc.known, heights, runs: heights.map((h) => m.columnSolidRun(h)) };
  };
  const COL = 'src/renderer/canvas/canvas-colors.ts';
  const colour = (name) => parseColour(fromHead(COL, new RegExp(`export const ${name} = '([^']+)';`), name)[1]);
  const FILL = colour('COLLISION_PREVIEW_FILL');
  const PRIMARY = colour('COLLISION_PREVIEW_PRIMARY');
  const MV = 'src/renderer/components/MapViewport.tsx';
  const hbBg = parseColour(fromHead(MV, /padding: '4px 12px', background: '([^']+)',/, 'styles.hoverBar background')[1]);
  const noLink = fromHead('src/renderer/components/ChunkLinkOptions.tsx', /: '(Under cursor: no chunk link)'\}/, 'the no-link readout')[1];
  if (!Number.isInteger(m.SECTION_TILES_WIDE)) throw new Error(`ORACLE: SECTION_TILES_WIDE ${m.SECTION_TILES_WIDE}`);
  return { runsOf, profilesFrom: from, FILL, PRIMARY, hbBg, noLink, W: m.SECTION_TILES_WIDE };
}

// ═══ PNG + COLOUR (cdp-sweep-4's decoder and arithmetic, unchanged) ════════
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
const over = (fg, a, bg) => ({ r: Math.round(fg.r * a + bg.r * (1 - a)), g: Math.round(fg.g * a + bg.g * (1 - a)), b: Math.round(fg.b * a + bg.b * (1 - a)) });
const dist = (p, q) => Math.max(Math.abs(p.r - q.r), Math.abs(p.g - q.g), Math.abs(p.b - q.b));
const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = (p) => 0.2126 * lin(p.r) + 0.7152 * lin(p.g) + 0.0722 * lin(p.b);
const contrast = (p, q) => { const a = lum(p); const b = lum(q); return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)); };
const fmt = (p) => (p ? `rgb(${p.r},${p.g},${p.b})` : 'null');

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
      if (page) return page;
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
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} gave no answer in 45s (params ${JSON.stringify(params).slice(0, 160)})`));
    }, 45000);
    pending.set(id, (m) => { clearTimeout(timer); if (m.error) reject(new Error(`${method}: ${JSON.stringify(m.error)}`)); else resolve(m.result); });
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

// ═══ THE REAL X POINTER (cdp-sweep-4 section 5.3, the same remedy) ═════════
function parkXPointer(rootPid) {
  const pids = [...descendants(rootPid)];
  const xvfb = pids.map((p) => ({ p, argv: cmdlineOf(p) })).find((x) => isXvfbProcess(x.argv));
  const m = xvfb ? /\s:(\d+)\b/.exec(` ${xvfb.argv}`) : null;
  if (!m) return { ok: false, why: `no Xvfb among our child's descendants (${pids.length} pids)` };
  const n = Number(m[1]);
  if (n === 0) return { ok: false, why: 'refusing: the Xvfb display resolved to :0' };
  let env = null;
  for (const p of pids) {
    if (!/electron/.test(cmdlineOf(p))) continue;
    try {
      const e = Object.fromEntries(readFileSync(`/proc/${p}/environ`, 'utf8').split('\0').filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)]));
      if (e.DISPLAY === `:${n}`) { env = { DISPLAY: e.DISPLAY, XAUTHORITY: e.XAUTHORITY ?? '' }; break; }
    } catch { /* raced */ }
  }
  if (!env) return { ok: false, why: `no Electron process of ours carries DISPLAY=:${n}` };
  const py = String.raw`
import ctypes, sys
x = ctypes.cdll.LoadLibrary('libX11.so.6')
x.XOpenDisplay.restype = ctypes.c_void_p; x.XOpenDisplay.argtypes = [ctypes.c_char_p]
d = x.XOpenDisplay(None)
if not d: print('open failed'); sys.exit(3)
x.XDefaultRootWindow.restype = ctypes.c_ulong; x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
root = x.XDefaultRootWindow(d)
x.XDisplayWidth.argtypes = [ctypes.c_void_p, ctypes.c_int]; x.XDisplayHeight.argtypes = [ctypes.c_void_p, ctypes.c_int]
W = x.XDisplayWidth(d, 0); H = x.XDisplayHeight(d, 0)
def q():
    r = ctypes.c_ulong(); c = ctypes.c_ulong(); rx = ctypes.c_int(); ry = ctypes.c_int(); wx = ctypes.c_int(); wy = ctypes.c_int(); mk = ctypes.c_uint()
    x.XQueryPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong] + [ctypes.c_void_p] * 7
    x.XQueryPointer(d, root, ctypes.byref(r), ctypes.byref(c), ctypes.byref(rx), ctypes.byref(ry), ctypes.byref(wx), ctypes.byref(wy), ctypes.byref(mk))
    return (rx.value, ry.value)
before = q()
x.XWarpPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_int, ctypes.c_int]
x.XWarpPointer(d, 0, root, 0, 0, 0, 0, W - 1, H - 1)
x.XFlush.argtypes = [ctypes.c_void_p]; x.XFlush(d)
x.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]; x.XSync(d, 0)
print('screen %dx%d pointer %s -> %s' % (W, H, before, q()))
x.XCloseDisplay.argtypes = [ctypes.c_void_p]; x.XCloseDisplay(d)
`;
  const r = spawnSync('python3', ['-c', py], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8', timeout: 10000 });
  return { ok: r.status === 0, why: `display :${n} (Xvfb pid ${xvfb.p}); python exit ${r.status}; ${String(r.stdout).trim()} ${String(r.stderr).trim()}`.trim() };
}
/** Every mouse event the page receives, so a move nobody sent is visible. */
const MOVE_LOG = String.raw`(() => { if (window.__mvlog) return 'already'; window.__mvlog = [];
  for (const t of ['mousemove', 'mousedown', 'mouseup', 'mouseout']) window.addEventListener(t, (e) => {
    if (t === 'mouseout' && e.relatedTarget) return;
    window.__mvlog.push([t, e.clientX, e.clientY, e.buttons]); }, true);
  return 'installed'; })()`;
/** Every click event, with the button it reached and that button's row label:
 *  how a row sees that a real key press DID or did NOT press a button. */
const CLICK_LOG = String.raw`(() => { if (window.__clicklog) return 'already'; window.__clicklog = [];
  window.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    const row = b && b.parentElement && b.parentElement.firstElementChild ? (b.parentElement.firstElementChild.textContent || '').trim() : null;
    window.__clicklog.push({ target: e.target && e.target.tagName, text: b ? (b.textContent || '').trim() : null, row, title: b ? (b.title || null) : null, detail: e.detail }); }, true);
  return 'installed'; })()`;

async function main() {
  const t0 = Date.now();
  console.log('=== mapviewport-foreground 2026-09-28 harness ===');
  console.log(`    uptime       : ${uptime()}`);
  console.log(`    PARTS        : ${PARTS.join(',')}`);
  console.log(`    node         : ${process.version}`);
  console.log(`    root         : ${RUN.root}`);
  console.log(`    in-tree      : ${samePath(RUN.root, HERE) ? 'yes' : 'NO'} (the tree under test is ${RUN.root}; this file lives in ${HERE})`);
  console.log(`    ORACLE_SOCKET: ${SOCK}   (private; made by this run)`);
  console.log(`    profile      : ${RUN_PROFILE_DIR}`);
  console.log(`    PORT         : ${PORT}   DISPLAY: xvfb-run -a (never :0)`);
  const selfPath = 'scratchpad/mapviewport-foreground-harness.mjs';
  const selfHash = git('hash-object', selfPath).stdout.trim();
  const selfHead = git('rev-parse', `HEAD:${selfPath}`).stdout.trim();
  console.log(`    harness      : blob ${selfHash} (${selfHash === selfHead ? 'as committed at HEAD' : `DIFFERS from HEAD's ${selfHead || 'none'}`})`);
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'src').stdout.trim();
  console.log(`    src on disk  : ${dirty ? `DIFFERS FROM HEAD (a mutation?):\n${dirty.split('\n').map((l) => `                   ${l}`).join('\n')}` : 'identical to HEAD'}`);
  const A = makeCopy();
  console.log(`    aeon source  : ${AEON.name}=${AEON.value}   (live sibling ${LIVE_AEON ?? 'unresolved'}: refused if equal)`);
  console.log(`    copy         : ${A.dir}   project ${J(A.name)}`);
  const O = await loadOracle(A.dir);
  console.log(`    oracle       : literals from HEAD ${HEAD_SHA}; load.ts, collision-cell-resolve.ts, collision-render.ts bundled from ${RUN.root}/src; profiles decoded from the copy's ${O.profilesFrom}; FILL ${J(O.FILL)} PRIMARY ${J(O.PRIMARY)} hover-bar bg ${J(O.hbBg)}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target; refusing to start.`);
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
    const page = await waitForTarget();
    PAGE_TARGET_ID = page.id;
    const parked = parkXPointer(child.pid);
    console.log(`    X pointer    : ${parked.ok ? 'PARKED outside the window' : 'NOT PARKED'}: ${parked.why}`);
    if (!parked.ok) check('SETUP.PARK', 'the private display\'s real pointer is parked outside the window', 'UNMEASURABLE', parked.why);
    c = cdp(page.webSocketDebuggerUrl);
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
    console.log(`    dpr at start : ${await c.evalExpr('window.devicePixelRatio')}   window ${J(await c.json('({ ow: outerWidth, oh: outerHeight, iw: innerWidth, ih: innerHeight, sx: screenX, sy: screenY })'))}`);
    console.log(`    move log     : ${await c.evalExpr(MOVE_LOG)}   click log: ${await c.evalExpr(CLICK_LOG)}`);
    const d = driver(c);
    await setup(d, A);
    const st0 = await d.strays();
    if (st0.length) check('SETUP.STRAY', 'no mouse event reached the page at a position this harness never sent', 'UNMEASURABLE', J(st0.slice(0, 10)));
    const parts = { xp: xpPart, gate: gatePart, hb: hbPart, panel: panelPart };
    for (const p of ALL_PARTS) {
      if (!PARTS.includes(p)) continue;
      console.log(`\n════════ PART ${p} ════════`);
      try { await parts[p](d, O); } catch (e) {
        check(`${p.toUpperCase()}.ABORT`, `the ${p} part stopped early: rows after this point did NOT run (${e.message})`, 'UNMEASURABLE', e.stack);
      }
      const sp = await d.strays();
      if (sp.length) check(`${p.toUpperCase()}.STRAY`, `mouse events reached the page at positions this harness never sent during PART ${p}: its rows are suspect`, 'UNMEASURABLE', J(sp.slice(0, 10)));
      else note(`${p}.strays`, 'no mouse event reached the page at a position this harness did not send');
    }
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
    try { rmSync(SOCK_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
    if (!process.env.KEEP_COPY) { try { rmSync(A.dir, { recursive: true, force: true }); } catch { /* */ } }
  }

  const pass = results.filter((r) => r.ok === true).length;
  console.log(`\n════ PARTS=${PARTS.join(',')}: ${pass}/${results.length} rows PASS · ${fails.length} FAIL · ${unmeasurable.length} UNMEASURABLE · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     uptime at end ${uptime()}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  console.log('END-OF-RUN');
  process.exit(fails.length || unmeasurable.length ? 1 : 0);
}

// ═══ THE DRIVER ════════════════════════════════════════════════════════════
const CTRL = 2;
const SENT = new Set();
let PAGE_TARGET_ID = null;
function driver(c) {
  const mouse = (type, x, y, button = 'none', buttons = 0, modifiers = 0) => {
    SENT.add(`${x},${y}`);
    return c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1, modifiers });
  };
  let pendingStrays = [];
  /** Every mouse event the page logged since the last drain; strays are kept
   *  aside for the part-level check, so draining here never hides one. */
  const rawDrain = async () => {
    const log = await c.json('(() => { const l = window.__mvlog || []; window.__mvlog = []; return l; })()').catch(() => []);
    pendingStrays.push(...log.filter(([, x, y]) => !SENT.has(`${x},${y}`)));
    return log;
  };
  const strays = async () => { await rawDrain(); const s = pendingStrays; pendingStrays = []; return s; };
  const clicksDrain = () => c.json('(() => { const l = window.__clicklog || []; window.__clicklog = []; return l; })()').catch(() => []);
  const aim = (selectorExpr, scroll = false) => c.json(String.raw`(() => {
    const el = ${selectorExpr};
    if (!el) return null;
    if (${scroll}) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const b = el.getBoundingClientRect();
    const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, hitOk: !!(hit && (hit === el || el.contains(hit))), dpr: window.devicePixelRatio,
      rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) } };
  })()`);
  const clickAt = async (p, modifiers = 0) => {
    await mouse('mouseMoved', p.x, p.y);
    await mouse('mousePressed', p.x, p.y, 'left', 1, modifiers);
    await sleep(40);
    await mouse('mouseReleased', p.x, p.y, 'left', 0, modifiers);
    await sleep(400);
  };
  const realClick = async (selectorExpr, { scroll = false } = {}) => {
    const p = await aim(selectorExpr, scroll);
    if (!p || !p.hitOk) return p;
    await clickAt(p);
    return p;
  };
  const chord = async (k, mods = 0) => {
    const p = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods };
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(350);
  };
  const namedKey = async (k, code, vk, text, wait = 300) => {
    const p = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p, ...(text ? { text, unmodifiedText: text } : {}) });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(wait);
  };
  const tab = () => namedKey('Tab', 'Tab', 9, undefined, 60);
  const space = () => namedKey(' ', 'Space', 32, ' ');
  const escape = () => namedKey('Escape', 'Escape', 27);
  const blur = () => c.evalExpr('document.activeElement && document.activeElement !== document.body && document.activeElement.blur()');
  const toasts = () => c.json(String.raw`[...document.querySelectorAll('div[title="Dismiss"]')].map((el) => {
    const b = el.getBoundingClientRect(); return { text: (el.innerText || '').trim(), x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: b.width };
  })`).catch(() => []);
  const clearToasts = async () => {
    for (let i = 0; i < 12; i++) {
      const ts = await toasts();
      if (ts.length === 0) return true;
      const t = ts.find((x) => x.w > 0) ?? ts[0];
      await clickAt({ x: t.x, y: t.y });
    }
    for (let i = 0; i < 60; i++) { if ((await toasts()).length === 0) return true; await sleep(250); }
    return false;
  };
  const FACET = (label) => `[...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === ${J(label)}) || null`;
  /** A button by its row's own label and its text, preferring a hit-testable one. */
  const BTN_IN = (row, label) => String.raw`(() => { const ls = [...document.querySelectorAll('span')].filter((s) => s.textContent.trim() === ${J(row)} && s.nextElementSibling && s.nextElementSibling.tagName === 'BUTTON' && s.getBoundingClientRect().width > 0);
    let first = null;
    for (const l of ls) { const b = [...l.parentElement.querySelectorAll('button')].find((x) => x.textContent.trim() === ${J(label)}); if (!b) continue; first = first || b;
      const r = b.getBoundingClientRect(); const h = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      if (h && (h === b || b.contains(h))) return b; }
    return first; })()`;
  /** Which button of a palette row is drawn SELECTED: the one whose background
   *  differs from every other button in the row (planeSel over planeBtn). What
   *  the author sees, read from computed style, not from the store. */
  const selectedIn = (row) => c.json(String.raw`(() => { const l = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === ${J(row)} && s.nextElementSibling && s.nextElementSibling.tagName === 'BUTTON' && s.getBoundingClientRect().width > 0);
    if (!l) return null; const bs = [...l.parentElement.querySelectorAll('button')];
    const bg = bs.map((b) => getComputedStyle(b).backgroundColor); const n = {}; for (const x of bg) n[x] = (n[x] || 0) + 1;
    const odd = bs.filter((b, i) => n[bg[i]] === 1);
    return { labels: bs.map((b) => b.textContent.trim()), selected: odd.length === 1 ? odd[0].textContent.trim() : null }; })()`);
  const canvasRect = () => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
    const b = cv.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, dpr: window.devicePixelRatio }; })()`);
  /** Is this integer client point on the map's own canvas (not the hover bar,
   *  not a panel over it)? */
  const onMap = (p) => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return false;
    const h = document.elementFromPoint(${p.x}, ${p.y}); return !!(h && h.tagName === 'CANVAS' && cv.parentElement && cv.parentElement.contains(h)); })()`);
  const view = () => c.json('window.__dbg.view()');
  const setView = async (x, y, z) => { await c.evalExpr(`window.__dbg.setView(${x}, ${y}, ${z})`); await sleep(450); return view(); };
  const st = () => c.json('window.__dbg.aeon.state()');
  const geometry = async (label) => {
    const R = await canvasRect(); const V = await view();
    console.log(`   GEOMETRY [${label}] dpr ${R && R.dpr}; map canvas rect ${J(R)}; view ${J(V)}`);
    return { R, V };
  };
  const clientOf = (G, wx, wy) => ({ x: G.R.x + (wx - G.V.x) * G.V.zoom, y: G.R.y + (wy - G.V.y) * G.V.zoom });
  const aimWorld = (G, wx, wy) => { const p = clientOf(G, wx, wy); return { x: Math.round(p.x), y: Math.round(p.y) }; };
  const worldAt = (G, ax, ay) => ({ x: G.V.x + (ax - G.R.x) / G.V.zoom, y: G.V.y + (ay - G.R.y) / G.V.zoom });
  const hoverTo = async (p) => { await mouse('mouseMoved', p.x + 37, p.y + 23); await sleep(120); await mouse('mouseMoved', p.x, p.y); await sleep(400); };
  const active = () => c.json(String.raw`(() => { const a = document.activeElement; if (!a) return null;
    if (a === document.body) return { tag: 'BODY', text: null, row: null, isBody: true };
    const row = a.parentElement && a.parentElement.firstElementChild ? (a.parentElement.firstElementChild.textContent || '').trim() : null;
    return { tag: a.tagName, text: (a.textContent || '').trim().slice(0, 40), row, isBody: a === document.body }; })()`);
  return {
    c, mouse, rawDrain, strays, clicksDrain, aim, clickAt, realClick, chord, namedKey, tab, space, escape, blur, clearToasts,
    FACET, BTN_IN, selectedIn, canvasRect, onMap, view, setView, st, geometry, clientOf, aimWorld, worldAt, hoverTo, active,
  };
}

// ═══ SETUP: the copy open on ojz act1, Layout facet ═══════════════════════
const LEVELS = `document.querySelector('[data-section="explorer.levels"]')`;
const LEVELS_HEADER = String.raw`(() => { const s = ${LEVELS}; if (!s || !s.firstElementChild) return null;
  return s.firstElementChild.querySelector('span') || s.firstElementChild; })()`;
const ROW = (label) => String.raw`(() => { const s = ${LEVELS}; if (!s) return null;
  return [...s.querySelectorAll('button')].find((b) => (b.querySelector('span')?.textContent || '').trim() === ${J(label)}) || null; })()`;
async function setup(d, A) {
  const { c } = d;
  console.log('\n──── setup: open the aeon copy (__dbg.aeon.open, setup only), then ojz act1 by a real Explorer click ────');
  const opened = await c.evalExpr(`window.__dbg.aeon.open(${J(A.dir)})`).catch((e) => `threw: ${e.message}`);
  let s0 = null;
  for (let i = 0; i < 80; i++) { s0 = await d.st().catch(() => null); if (s0 && s0.open) break; await sleep(250); }
  if (!s0 || !s0.open) throw new Error(`aeon copy did not open: ${J(opened)} ${J(s0)}`);
  for (let i = 0; i < 3; i++) {
    const cur = await c.evalExpr(`(() => { const s = ${LEVELS}; return s ? s.getAttribute('data-section-collapsed') : 'absent'; })()`);
    if (cur !== 'true') break;
    await d.realClick(LEVELS_HEADER);
    await sleep(400);
  }
  const label = `${A.zoneName} · act1`;
  const clicked = await d.realClick(ROW(label), { scroll: true });
  let s = null;
  for (let i = 0; i < 60; i++) {
    s = await d.st().catch(() => null);
    if (s && s.zone === 'ojz' && s.act === 'act1' && (await d.canvasRect())) break;
    await sleep(250);
  }
  await sleep(700);
  await d.realClick(d.FACET('Layout'));
  await sleep(600);
  check('SETUP.0', 'the aeon copy is open on ojz act1, by a real click on its Explorer row',
    !!(clicked && clicked.hitOk) && !!s && s.zone === 'ojz' && s.act === 'act1',
    `open ${J(opened)}; row ${J(label)} aim ${J(clicked)}; state ${J(s)}`);
}

/** The Layout facet, the view tool, no toast, no paste, no marquee. */
async function neutral(d) {
  await d.clearToasts();
  await d.blur();
  await d.escape(); await d.escape();
  await d.realClick(d.FACET('Layout'));
  await sleep(500);
  await d.blur();
  await d.chord('v');
}

// ═══ HELPERS ═══════════════════════════════════════════════════════════════
const SHAPE_N = (n) => String.raw`([...document.querySelectorAll('button')].filter((b) => /^#\d+/.test(b.title || '') && b.getBoundingClientRect().width > 0)[${n}] || null)`;
const N_SHAPES = String.raw`[...document.querySelectorAll('button')].filter((b) => /^#\d+/.test(b.title || '') && b.getBoundingClientRect().width > 0).length`;
/** `armCollisionBrush` with an EMPTY selection writes nothing: a read of the brush word. */
const brushRead = (d) => d.c.json('window.__dbg.aeon.armCollisionBrush({})');
const same = (x, y) => J(x) === J(y);
/** An integer aim at world (wx, wy), and the cell/tile it lands on derived BACK from that integer. */
async function aimAt(d, G, wx, wy) {
  const p = d.aimWorld(G, wx, wy);
  const w = d.worldAt(G, p.x, p.y);
  return { ...p, world: { x: +w.x.toFixed(2), y: +w.y.toFixed(2) }, cell: { cc: Math.floor(w.x / 16), cr: Math.floor(w.y / 16) },
    tile: { col: Math.floor(w.x / 8), row: Math.floor(w.y / 8) }, onMap: await d.onMap(p) };
}
/** Two real moves that both stay inside the aimed 16px cell (a real move INTO it, then the aim). */
async function hoverIn(d, p) { await d.mouse('mouseMoved', p.x + 3, p.y + 2); await sleep(120); await d.mouse('mouseMoved', p.x, p.y); await sleep(350); }

/** Pixel reads that never ask the component: the canvas's own backing store and screenshots. */
function pixels(d) {
  const { c } = d;
  /** A canvas's OWN pixels over a CSS rect, one sample per CSS pixel (the backing
   *  pixel under that CSS pixel's centre). Un-premultiplied RGBA (cdp-sweep-4's). */
  const layerPixels = (id, rect) => c.json(String.raw`(() => {
    const cv = document.getElementById(${J(id)}); if (!cv) return null;
    const b = cv.getBoundingClientRect(); const ctx = cv.getContext('2d'); if (!ctx) return null;
    const sx = cv.width / b.width, sy = cv.height / b.height;
    const x0 = Math.floor(${rect.x}), y0 = Math.floor(${rect.y}), w = Math.round(${rect.w}), h = Math.round(${rect.h});
    const bx0 = Math.floor((x0 - b.left + 0.5) * sx), by0 = Math.floor((y0 - b.top + 0.5) * sy);
    const bx1 = Math.floor((x0 + w - 1 - b.left + 0.5) * sx), by1 = Math.floor((y0 + h - 1 - b.top + 0.5) * sy);
    const W = Math.max(1, bx1 - bx0 + 1), H = Math.max(1, by1 - by0 + 1);
    const data = ctx.getImageData(bx0, by0, W, H).data; const out = [];
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const bx = Math.floor((x0 + i - b.left + 0.5) * sx) - bx0, by = Math.floor((y0 + j - b.top + 0.5) * sy) - by0;
      const o = (by * W + bx) * 4; out.push(data[o], data[o + 1], data[o + 2], data[o + 3]);
    }
    return { x0, y0, w, h, scale: [sx, sy], px: out };
  })()`);
  const lp = (L, cx, cy) => {
    const i = Math.floor(cx) - L.x0; const j = Math.floor(cy) - L.y0;
    if (i < 0 || j < 0 || i >= L.w || j >= L.h) return null;
    const o = (j * L.w + i) * 4;
    return { r: L.px[o], g: L.px[o + 1], b: L.px[o + 2], a: L.px[o + 3] };
  };
  /** The WHOLE layer, page-side: nonzero-alpha backing pixels whose CSS centre lies
   *  outside `rect`, and how many of those are the fill colour. `rect` null = count all. */
  const census = (id, rect, fill) => c.json(String.raw`(() => {
    const cv = document.getElementById(${J(id)}); if (!cv) return null;
    const b = cv.getBoundingClientRect(); const ctx = cv.getContext('2d'); if (!ctx) return null;
    const sx = cv.width / b.width, sy = cv.height / b.height;
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data; const R = ${J(rect)}; const F = ${J(fill)};
    let nz = 0, fillOut = 0, total = 0; let bb = null;
    for (let by = 0; by < cv.height; by++) for (let bx = 0; bx < cv.width; bx++) {
      const o = (by * cv.width + bx) * 4; const a = d[o + 3]; if (!a) continue;
      total++;
      const x = b.left + (bx + 0.5) / sx, y = b.top + (by + 0.5) / sy;
      if (R && x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h) continue;
      nz++;
      if (F && Math.abs(d[o] - F.r) <= 4 && Math.abs(d[o + 1] - F.g) <= 4 && Math.abs(d[o + 2] - F.b) <= 4 && Math.abs(a - F.a) <= 2) fillOut++;
      if (!bb) bb = { x0: x, y0: y, x1: x, y1: y }; else { bb.x0 = Math.min(bb.x0, x); bb.y0 = Math.min(bb.y0, y); bb.x1 = Math.max(bb.x1, x); bb.y1 = Math.max(bb.y1, y); }
    }
    return { total, outside: nz, fillOutside: fillOut, bboxOutside: bb, backing: [cv.width, cv.height], rect: { x: b.left, y: b.top, w: b.width, h: b.height } };
  })()`);
  /** An integer CSS clip, captured and decoded in memory; `px(x, y)` samples by CSS pixel. */
  const grab = async (rect) => {
    const vw = await c.json('({ w: innerWidth, h: innerHeight })');
    const x = Math.max(0, Math.floor(rect.x)); const y = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(vw.w, Math.ceil(rect.x + rect.w)); const y1 = Math.min(vw.h, Math.ceil(rect.y + rect.h));
    const clip = { x, y, width: x1 - x, height: y1 - y, scale: 1 };
    if (clip.width <= 0 || clip.height <= 0) throw new Error(`capture: REFUSED, a non-positive clip ${J(clip)}`);
    const s = await c.send('Page.captureScreenshot', { format: 'png', clip });
    const img = decodePng(Buffer.from(s.data, 'base64'));
    const ratio = img.w / clip.width;
    const px = (cx, cy) => {
      const ix = Math.floor((cx + 0.5 - clip.x) * ratio); const iy = Math.floor((cy + 0.5 - clip.y) * ratio);
      if (ix < 0 || iy < 0 || ix >= img.w || iy >= img.h) return null;
      const o = (iy * img.w + ix) * 4;
      return { r: img.px[o], g: img.px[o + 1], b: img.px[o + 2] };
    };
    return { clip, img, ratio, px };
  };
  return { layerPixels, lp, census, grab };
}

// ═══════════════════════════════════════════════════════════════════════════
// PART xp (item 7). The collision hover preview: the selected shape's ghost at
// the hovered 16px cell, on #map-preview-canvas.
// ═══════════════════════════════════════════════════════════════════════════
const PREVIEW = 'map-preview-canvas';
/** The fill of the ghost as getImageData returns it (un-premultiplied), from HEAD's literal. */
const fillPx = (O) => ({ r: O.FILL.r, g: O.FILL.g, b: O.FILL.b, a: Math.round(O.FILL.a * 255) });
const isFill = (O, q) => !!q && q.a > 0 && dist(q, O.FILL) <= 4 && Math.abs(q.a - fillPx(O).a) <= 2;
/**
 * The ghost's fill against the oracle's silhouette for one cell box.
 * `sil(x, y)` is the distance class of a CSS pixel centre: 'in' (inside a
 * column's solid run by more than 1 CSS px), 'out' (outside every run, or
 * outside the box, by more than 1 CSS px), or 'edge' (within 1 px of a run
 * boundary, not judged: a fractional device grid can put either colour there).
 */
function silhouetteCheck(O, L, lp, box, runs, Z) {
  const cls = (x, y) => {
    const cx = x + 0.5 - box.x; const cy = y + 0.5 - box.y;
    if (cx < -1 || cy < -1 || cx > box.w + 1 || cy > box.h + 1) return 'out';
    if (cx < 1 || cy < 1 || cx > box.w - 1 || cy > box.h - 1) return 'edge';
    const col = Math.floor(cx / Z); const run = runs[col];
    const colLeft = col * Z; const colRight = colLeft + Z;
    const nearColEdge = (cx - colLeft < 1 || colRight - cx < 1);
    if (!run) return nearColEdge && (runs[col - 1] || runs[col + 1]) ? 'edge' : 'out';
    const top = run.y * Z; const bot = (run.y + run.h) * Z;
    if (cy > top + 1 && cy < bot - 1) {
      if (nearColEdge) {
        const nb = cx - colLeft < 1 ? runs[col - 1] : runs[col + 1];
        if (!nb || cy < nb.y * Z || cy > (nb.y + nb.h) * Z) return 'edge';
      }
      return 'in';
    }
    if (cy < top - 1 || cy > bot + 1) return nearColEdge ? 'edge' : 'out';
    return 'edge';
  };
  let silArea = 0; let fillIn = 0; let fillOut = 0; const outs = [];
  for (let y = L.y0; y < L.y0 + L.h; y++) for (let x = L.x0; x < L.x0 + L.w; x++) {
    const k = cls(x, y); const q = lp(L, x, y);
    if (k === 'in') { silArea++; if (isFill(O, q)) fillIn++; }
    else if (k === 'out' && isFill(O, q)) { fillOut++; if (outs.length < 4) outs.push({ x, y, q }); }
  }
  return { silArea, fillIn, fillOut, coverage: silArea ? +(fillIn / silArea).toFixed(3) : 0, outs };
}
/** The primary outline: the outermost CSS pixel ring inside the box, corners excluded. */
function primaryEdges(O, L, lp, box) {
  const x0 = Math.ceil(box.x); const y0 = Math.ceil(box.y); const x1 = Math.floor(box.x + box.w) - 1; const y1 = Math.floor(box.y + box.h) - 1;
  // PRIMARY is drawn LAST at alpha a (HEAD), over the scope outline and the shape's
  // edges; whatever lies under it can move a channel by at most (1 - a) * 255.
  const tol = Math.ceil((1 - O.PRIMARY.a) * 255) + 1;
  const hit = (q) => !!q && q.a >= 200 && dist(q, O.PRIMARY) <= tol;
  const edge = (pts) => {
    const n = pts.length; const k = pts.filter(([x, y]) => hit(lp(L, x, y))).length;
    const mid = pts[Math.floor(n / 2)];
    // The mid-edge pixel and its two inward neighbours, so a miss shows what IS there.
    const inward = mid ? [0, 1, 2].map((s) => { const [x, y] = mid; const dx = x === x0 ? s : x === x1 ? -s : 0; const dy = y === y0 ? s : y === y1 ? -s : 0; return lp(L, x + dx, y + dy); }) : [];
    return { n, k, mid: inward };
  };
  const span = (a, b) => Array.from({ length: Math.max(0, b - a - 5) }, (_, i) => a + 3 + i);
  return {
    top: edge(span(x0, x1).map((x) => [x, y0])), bottom: edge(span(x0, x1).map((x) => [x, y1])),
    left: edge(span(y0, y1).map((y) => [x0, y])), right: edge(span(y0, y1).map((y) => [x1, y])),
  };
}
const mirrorRuns = (runs) => [...runs].reverse();

async function xpPart(d, O) {
  const { c } = d; const P = pixels(d);
  await neutral(d);
  const facet = await d.realClick(d.FACET('Collision'));
  await sleep(700);
  if ((await d.st()).tool !== 'paint-collision') await d.chord('c');
  const brush1 = await d.realClick(d.BTN_IN('Brush', '1'), { scroll: true });
  const planeA = await d.realClick(d.BTN_IN('Plane', 'A'), { scroll: true });
  // A shape the ghost can be told apart from its mirror: picked by REAL clicks in
  // the palette, the first whose resolved profile (the oracle's) is asymmetric and
  // has a partial column at both ends, so both the run and the air are measured.
  const n = await c.evalExpr(N_SHAPES);
  let pick = null;
  for (let k = 0; k < Math.min(n, 80) && !pick; k++) {
    const a = await d.realClick(SHAPE_N(k), { scroll: true });
    if (!a || !a.hitOk) continue;
    const w = (await brushRead(d)).word; const ro = O.runsOf(w);
    if (!ro.runs) continue;
    const partial = (h) => Math.abs(h) >= 3 && Math.abs(h) <= 13;
    if (!same(ro.runs, mirrorRuns(ro.runs)) && [1, 2, 3].some((i) => partial(ro.heights[i])) && [12, 13, 14].some((i) => partial(ro.heights[i]))) pick = { k, word: w, ro, title: await c.evalExpr(`(${SHAPE_N(k)} || {}).title || null`) };
  }
  const Z = 4;
  await d.setView(0, 0, Z);
  const G = await d.geometry('xp');
  const tool = (await d.st()).tool;
  if (!pick || tool !== 'paint-collision') {
    check('XP.0', 'PREMISE: the collision brush armed and an asymmetric shape picked by a real click', 'UNMEASURABLE', `tool ${tool}; shapes ${n}; pick ${J(pick)}`);
    return;
  }
  const boxOf = (cc, cr) => ({ x: G.R.x + (cc * 16 - G.V.x) * G.V.zoom, y: G.R.y + (cr * 16 - G.V.y) * G.V.zoom, w: 16 * G.V.zoom, h: 16 * G.V.zoom });
  const grow = (b, m) => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });
  const T = await aimAt(d, G, 5 * 16 + 8, 5 * 16 + 8); // cell (5,5): clear of the legend and the hover bar
  const N = await aimAt(d, G, 6 * 16 + 8, 5 * 16 + 8); // its right neighbour
  const F = await aimAt(d, G, 10 * 16 + 8, 2 * 16 + 8); // a far cell, for the screen reference
  const box = boxOf(T.cell.cc, T.cell.cr); const boxN = boxOf(N.cell.cc, N.cell.cr);
  // The stem of the angle mark reaches OUT of the cell (collision-angle-mark: 6.5
  // cell px) with a 3 px casing, so "nothing else on the layer" is judged beyond it.
  const reach = Math.ceil(6.5 * G.V.zoom + 4);
  const census0 = await P.census(PREVIEW, null, fillPx(O));
  const premise = !!(facet && facet.hitOk && brush1 && brush1.hitOk && planeA && planeA.hitOk) && tool === 'paint-collision'
    && same(T.cell, { cc: 5, cr: 5 }) && same(N.cell, { cc: 6, cr: 5 }) && T.onMap && N.onMap && F.onMap && !!census0 && census0.total === 0;
  check('XP.0', 'PREMISE: Collision facet, the collision brush, Brush 1 and Plane A by real clicks; an ASYMMETRIC shape picked by a real click in the palette; the aims land on cells (5,5), (6,5) and a far cell, derived back from their integer pixels; with the pointer off the map the preview layer is empty',
    premise, `dpr ${G.R.dpr}; rect ${J(G.R)}; view ${J(G.V)}; shape ${J({ k: pick.k, title: pick.title, word: pick.word, heights: pick.ro.heights })}; aims T ${J(T)} N ${J(N)} F ${J(F)}; layer before ${J(census0)}`);
  if (!premise) return;

  // The screen reference: the pointer on the FAR cell, so the target box has no ghost.
  await hoverIn(d, F);
  const Lref = await P.layerPixels(PREVIEW, grow(box, 2));
  const refLayerEmpty = Lref && Lref.px.every((v, i) => i % 4 !== 3 || v === 0);
  const ref = await P.grab(grow(box, 6));
  // Off the map and back: the leave clears the hover, so the next move is a FRESH
  // hover of the target (the follow plant must not be able to fake XP.a).
  const off = await d.aim(d.BTN_IN('Plane', 'A'));
  await d.mouse('mouseMoved', off.x, off.y); await sleep(300);
  await hoverIn(d, T);
  const L1 = await P.layerPixels(PREVIEW, grow(box, reach));
  const S1 = silhouetteCheck(O, L1, P.lp, box, pick.ro.runs, G.V.zoom);
  const C1 = await P.census(PREVIEW, grow(box, 1), fillPx(O));
  const C1r = await P.census(PREVIEW, grow(box, reach), null);
  check('XP.a', "THE GHOST IS THE SELECTED SHAPE AT THE HOVERED CELL: on the preview layer, the fill colour (COLLISION_PREVIEW_FILL, HEAD) covers the oracle's silhouette of the brush word (resolveCell over the copy's own tables) and appears nowhere outside it, in the cell or anywhere else on the layer; nothing is drawn beyond the angle mark's reach",
    S1.fillOut === 0 && S1.coverage >= 0.5 && S1.silArea > 0 && C1.fillOutside === 0 && C1r.outside === 0,
    `box ${J(box)}; silhouette ${S1.silArea} px, fill inside ${S1.fillIn} (coverage ${S1.coverage}), fill OUTSIDE ${S1.fillOut} ${J(S1.outs)}; layer: fill outside the box ${C1.fillOutside}, anything beyond reach ${reach}px ${C1r.outside} ${J(C1r.bboxOutside)}`);
  const E1 = primaryEdges(O, L1, P.lp, box);
  const eOk = ['top', 'bottom', 'left', 'right'].every((k) => E1[k].n > 0 && E1[k].k / E1[k].n >= 0.9);
  check('XP.p', 'the hovered cell is outlined in COLLISION_PREVIEW_PRIMARY (HEAD) on all four edges of its box (the outermost CSS pixel ring inside the cell, corners excluded)',
    eOk, `edges ${J(E1)}`);
  // On screen: the composite equals the layer over the reference, and changed.
  const shot1 = await P.grab(grow(box, 6));
  let n1 = 0; let ok1 = 0; let changed = 0; let ringChanged = 0; const bad = [];
  for (let y = Math.floor(box.y) - 6; y < box.y + box.h + 6; y++) for (let x = Math.floor(box.x) - 6; x < box.x + box.w + 6; x++) {
    const s0 = ref.px(x, y); const s1 = shot1.px(x, y); if (!s0 || !s1) continue;
    const inBox = x >= Math.ceil(box.x) && x < Math.floor(box.x + box.w) && y >= Math.ceil(box.y) && y < Math.floor(box.y + box.h);
    if (!inBox) { if (dist(s0, s1) > 3 && (x < box.x - 5 || y < box.y - 5 || x > box.x + box.w + 4 || y > box.y + box.h + 4)) ringChanged++; continue; }
    const q = P.lp(L1, x, y); if (!q) continue;
    n1++; if (dist(s0, s1) > 3) changed++;
    const want = over(q, q.a / 255, s0);
    if (dist(want, s1) <= 3) ok1++; else if (bad.length < 4) bad.push({ x, y, layer: q, ref: fmt(s0), want: fmt(want), got: fmt(s1) });
  }
  check('XP.d', 'ON SCREEN: inside the hovered box the screenshot is the preview layer composited over the no-ghost reference (the pointer on a far cell) in at least 99% of pixels, and it did change there',
    refLayerEmpty && n1 > 0 && ok1 / n1 >= 0.99 && changed >= S1.fillIn * 0.5,
    `reference layer in the box empty ${refLayerEmpty}; composite ${ok1}/${n1}; changed ${changed} (fill px ${S1.fillIn}); outer ring changed ${ringChanged} (not judged: the stem may reach there); mismatches ${J(bad)}`);

  // Follow: one real move into the neighbour cell.
  await d.mouse('mouseMoved', N.x, N.y); await sleep(400);
  const L2 = await P.layerPixels(PREVIEW, grow({ x: box.x, y: box.y, w: boxN.x + boxN.w - box.x, h: box.h }, reach));
  const S2 = silhouetteCheck(O, L2, P.lp, boxN, pick.ro.runs, G.V.zoom);
  let oldFill = 0;
  for (let y = Math.ceil(box.y); y < box.y + box.h; y++) for (let x = Math.ceil(box.x); x < box.x + box.w; x++) if (isFill(O, P.lp(L2, x, y))) oldFill++;
  const C2 = await P.census(PREVIEW, grow(boxN, 1), fillPx(O));
  check('XP.c', 'the ghost FOLLOWS the pointer: after one real move into the neighbour cell the silhouette is in the new box, and the old box holds no fill',
    oldFill === 0 && S2.fillOut === 0 && S2.coverage >= 0.5 && C2.fillOutside === 0,
    `new box ${J(boxN)}: coverage ${S2.coverage}, fill outside the silhouette ${S2.fillOut}; fill left in the old box ${oldFill}; layer fill outside the new box ${C2.fillOutside}`);

  // Leave: the pointer onto the palette's H flip button (a real move off the map).
  const hBtn = await d.aim(d.BTN_IN('Flip', 'H ⇄'), true);
  await d.mouse('mouseMoved', hBtn.x, hBtn.y); await sleep(350);
  const C3 = await P.census(PREVIEW, null, fillPx(O));
  check('XP.e', 'the pointer leaving the map clears the ghost: the whole preview layer is empty (onMouseLeave drops the hover)',
    !!C3 && C3.total === 0, `layer after the leave ${J(C3)}; button ${J(hBtn)}`);

  // Flip: a real click on H, then back onto the target cell.
  await d.clickAt(hBtn);
  const w2 = (await brushRead(d)).word; const ro2 = O.runsOf(w2);
  const flipped = !!ro2.runs && same(ro2.runs, mirrorRuns(pick.ro.runs)) && w2 !== pick.word;
  await hoverIn(d, T);
  const L3 = await P.layerPixels(PREVIEW, grow(box, reach));
  const S3 = silhouetteCheck(O, L3, P.lp, box, ro2.runs || pick.ro.runs, G.V.zoom);
  const S3old = silhouetteCheck(O, L3, P.lp, box, pick.ro.runs, G.V.zoom);
  if (!flipped) check('XP.b', 'PREMISE for the flip: a real click on H flips the brush word to the mirror of the shape', 'UNMEASURABLE', `word ${pick.word} -> ${w2}; runs ${J(ro2.runs)}`);
  else {
    check('XP.b', "the ghost carries the brush's FLIP: after a real click on the palette's H the ghost at the same cell is the MIRRORED silhouette (the oracle's for the new word), and no longer the unflipped one",
      S3.fillOut === 0 && S3.coverage >= 0.5 && S3old.fillOut > 0,
      `word ${pick.word} -> ${w2} (mirrored runs, oracle); against the new silhouette: coverage ${S3.coverage}, fill outside ${S3.fillOut} ${J(S3.outs)}; against the OLD silhouette: fill outside ${S3old.fillOut}`);
  }
  // Cleanup: H back off by a real click.
  const hBtn2 = await d.aim(d.BTN_IN('Flip', 'H ⇄'), true);
  await d.clickAt(hBtn2);
  note('xp.cleanup', `H clicked again: word ${(await brushRead(d)).word} (started ${pick.word})`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART gate (item 3). The guide drag is gated on the Effects facet: outside it,
// a press on a guide's row does not take the guide; it goes to the armed tool.
// ═══════════════════════════════════════════════════════════════════════════
async function gatePart(d, O) {
  const { c } = d; const P = pixels(d);
  await neutral(d);
  const fe = await d.realClick(d.FACET('Effects'));
  await sleep(900);
  await d.blur();
  await d.chord('v');
  const SCENE = 'ojz_act1_start';
  const SCENE_BTN = String.raw`([...document.querySelectorAll('button')].find((b) => (b.title || '').endsWith(${J(`(${SCENE})`)})) || null)`;
  const pS = await d.realClick(SCENE_BTN, { scroll: true }); await sleep(500);
  const sceneDoc = async () => JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()')).find((s) => s.id === SCENE) ?? null;
  const cyan = (p) => !!p && Math.min(p.g, p.b) - p.r >= 60;
  await d.setView(0, 0, 1);
  const G = await d.geometry('gate effects');
  const g0 = await c.json('window.__dbg.aeon.guides()');
  const doc0 = await sceneDoc();
  const L = 2;
  const row0 = g0 && g0.rows && g0.rows[L];
  const wy0 = doc0 && doc0.layers[L] && doc0.layers[L].world_y;
  // The guide's canvas row as the app placed it, and its offset from the plain
  // world contract (vpY + canvasY/zoom); carried to the Layout facet unchanged.
  const k = row0 ? row0.canvasY - (wy0 - G.V.y) * G.V.zoom : null;
  const gx = Math.round(G.R.x + 300);
  const pressY = row0 ? Math.round(G.R.y + row0.canvasY) : null;
  const s0 = pressY !== null ? await P.grab({ x: gx - 2, y: pressY - 2, w: 5, h: 5 }) : null;
  const premise = !!(fe && fe.hitOk && pS && pS.hitOk) && (await c.json('window.__dbg.aeon.selectedScene()')) === SCENE && !!g0 && g0.active
    && !!row0 && row0.worldY === wy0 && !!s0 && cyan(s0.px(gx, pressY));
  check('GT.0', `PREMISE: the Effects facet and scene ${SCENE} by real clicks; layer ${L}'s guide is drawn (cyan on screen) at the canvas row the report gives for its world_y`,
    premise, `dpr ${G.R.dpr}; rect ${J(G.R)}; view ${J(G.V)}; row ${J(row0)}; world_y ${wy0}; offset k ${k}; press (${gx}, ${pressY}) pixel ${fmt(s0 && s0.px(gx, pressY))}`);
  if (!premise) return;
  // CONTROL, in Effects: the same kind of press takes the guide.
  const dy = 40;
  await d.mouse('mouseMoved', gx, pressY); await sleep(150);
  await d.mouse('mousePressed', gx, pressY, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', gx + 12, pressY + dy / 2, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', gx + 24, pressY + dy, 'left', 1); await sleep(250);
  await d.mouse('mouseReleased', gx + 24, pressY + dy, 'left', 0); await sleep(400);
  const docC = await sceneDoc();
  await d.chord('z', CTRL);
  const docU = await sceneDoc();
  check('GT.c', `CONTROL, Effects facet: a real press on layer ${L}'s row dragged ${dy}px down takes the guide (world_y ${wy0} -> ${wy0 + dy}), and one Ctrl+Z puts it back`,
    !!docC && docC.layers[L].world_y === wy0 + dy && !!docU && docU.layers[L].world_y === wy0,
    `after the drag ${docC && docC.layers[L].world_y}; after Ctrl+Z ${docU && docU.layers[L].world_y}`);
  // The Layout facet, marquee tool: the same world row.
  const fl = await d.realClick(d.FACET('Layout'));
  await sleep(700);
  await d.blur();
  await d.chord('m');
  await d.setView(0, 0, 1);
  const GL = await d.geometry('gate layout');
  const toolL = (await d.st()).tool;
  const gxL = Math.round(GL.R.x + 300);
  const yL = Math.round(GL.R.y + k + (wy0 - GL.V.y) * GL.V.zoom);
  const back = d.worldAt(GL, gxL, yL);
  const tile = { col: Math.floor(back.x / 8), row: Math.floor(back.y / 8) };
  const onMap = await d.onMap({ x: gxL, y: yL });
  const selL = await c.json('window.__dbg.aeon.selectedScene()');
  const m0 = await c.json('window.__dbg.aeon.marquee()');
  if (!(fl && fl.hitOk && toolL === 'marquee' && onMap && selL === SCENE && m0 === null)) {
    check('GT.a', 'PREMISE for the Layout press: the Layout facet by a real click, the marquee tool, the aim on the map, the scene still selected, no marquee yet', 'UNMEASURABLE',
      `facet ${J(fl)}; tool ${toolL}; aim (${gxL}, ${yL}) on map ${onMap}; scene ${selL}; marquee ${J(m0)}`);
    return;
  }
  await d.mouse('mouseMoved', gxL, yL); await sleep(150);
  await d.mouse('mousePressed', gxL, yL, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', gxL + 12, yL + dy / 2, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', gxL + 24, yL + dy, 'left', 1); await sleep(250);
  await d.mouse('mouseReleased', gxL + 24, yL + dy, 'left', 0); await sleep(400);
  const docL = await sceneDoc();
  const m1 = await c.json('window.__dbg.aeon.marquee()');
  const inM = !!m1 && tile.col >= m1.col && tile.col < m1.col + m1.w && tile.row >= m1.row && tile.row < m1.row + m1.h;
  check('GT.a', `THE GATE: in the LAYOUT facet the same press on layer ${L}'s world row, dragged the same way, does NOT take the guide (world_y stays ${wy0}); it goes to the armed marquee tool, whose committed selection contains the pressed tile`,
    !!docL && docL.layers[L].world_y === wy0 && inM,
    `Layout rect ${J(GL.R)} view ${J(GL.V)}; press (${gxL}, ${yL}) -> tile ${J(tile)}; world_y after ${docL && docL.layers[L].world_y}; marquee ${J(m1)}`);
  await d.escape();
}

// ═══════════════════════════════════════════════════════════════════════════
// PART hb (item 9). The hover bar at the app's window widths: nothing of the
// readout is cut, and the numbers a legibility call needs.
// ═══════════════════════════════════════════════════════════════════════════
const BAR = String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
  return [...cv.parentElement.children].find((e) => e.tagName === 'DIV' && getComputedStyle(e).position === 'absolute' && getComputedStyle(e).bottom === '0px' && /(^|\| )Pos /.test(e.textContent || '')) || null; })()`;
const BAR_READ = String.raw`(() => { const bar = ${BAR}; if (!bar) return null; const cont = bar.parentElement; const cs = getComputedStyle(bar);
  const rg = document.createRange(); rg.selectNodeContents(bar);
  const rects = [...rg.getClientRects()].map((r) => ({ l: +r.left.toFixed(2), t: +r.top.toFixed(2), r: +r.right.toFixed(2), b: +r.bottom.toFixed(2) }));
  const cb = cont.getBoundingClientRect(); const bb = bar.getBoundingClientRect(); const mc = document.getElementById('map-canvas').getBoundingClientRect();
  const tops = [...new Set(rects.map((r) => Math.round(r.t)))];
  return { text: bar.textContent, display: cs.display, color: cs.color, bg: cs.backgroundColor, font: cs.fontSize + ' ' + cs.fontFamily.split(',')[0], lineHeight: cs.lineHeight,
    whiteSpace: cs.whiteSpace, bar: { l: bb.left, t: bb.top, r: bb.right, b: bb.bottom, w: bb.width, h: bb.height }, cont: { l: cb.left, t: cb.top, r: cb.right, b: cb.bottom, overflow: getComputedStyle(cont).overflow },
    canvas: { w: mc.width, h: mc.height }, scrollW: bar.scrollWidth, clientW: bar.clientWidth, lines: tops.length, rects,
    inside: rects.every((r) => r.l >= cb.left - 0.5 && r.r <= cb.right + 0.5 && r.t >= cb.top - 0.5 && r.b <= cb.bottom + 0.5), win: { iw: innerWidth, ih: innerHeight } }; })()`;
async function hbPart(d, O) {
  const { c } = d; const P = pixels(d);
  await neutral(d);
  await c.evalExpr("window.__dbg.setOverlay('showCollision', true)"); await sleep(500);
  // The longest arm: a known, non-air collision cell of section 0 (the readout
  // gains shape, flips, solidity, angle and the sparkline). The camera is put
  // 120 px up and left of it, so it is on the map at every width measured.
  const cell = await c.json(String.raw`(() => { const a = window.__dbg.aeon;
    for (let cr = 0; cr < 64; cr++) for (let cc = 0; cc < ${O.W / 2}; cc++) { const i = (2 * cr) * ${O.W} + 2 * cc; const w = a.collisionAt(0, 'a', i); if (w) return { cc, cr, i, w }; }
    return null; })()`);
  if (!cell) { check('HBW.a', 'PREMISE: a non-air collision cell in section 0', 'UNMEASURABLE', 'none found'); return; }
  await d.setView(cell.cc * 16 - 120, cell.cr * 16 - 120, 1);
  const G = await d.geometry('hb');
  // A REAL window resize: the Browser domain lives on the browser-level endpoint,
  // not the page's socket. Emulation is the printed fallback, never silent.
  const w0 = await c.json('({ ow: outerWidth, iw: innerWidth, oh: outerHeight, ih: innerHeight })');
  const ver = await getJSON('/json/version');
  const B = cdp(ver.webSocketDebuggerUrl); await B.ready;
  let resize; let restore; let how;
  try {
    const { windowId, bounds } = await B.send('Browser.getWindowForTarget', { targetId: PAGE_TARGET_ID });
    const dw = bounds.width - w0.iw;
    resize = (W) => B.send('Browser.setWindowBounds', { windowId, bounds: { width: W + dw } });
    restore = () => B.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width, height: bounds.height } });
    how = `Browser.setWindowBounds on the browser endpoint (outer ${bounds.width}x${bounds.height}, frame ${dw}px)`;
  } catch (e) {
    resize = (W) => c.send('Emulation.setDeviceMetricsOverride', { width: W, height: w0.ih, deviceScaleFactor: 0, mobile: false });
    restore = () => c.send('Emulation.clearDeviceMetricsOverride');
    how = `Emulation.setDeviceMetricsOverride (Browser.getWindowForTarget refused: ${e.message})`;
  }
  console.log(`   resize by ${how}`);
  const widths = [w0.iw, 1100, 900, 700];
  const per = [];
  try {
    for (const W of widths) {
      await resize(W); await sleep(900);
      const iw = await c.evalExpr('innerWidth');
      if (Math.abs(iw - W) > 2) { per.push({ W, iw, resized: false }); continue; }
      const GW = await d.geometry(`hb ${W}`);
      const p = await aimAt(d, GW, cell.cc * 16 + 8, cell.cr * 16 + 8);
      if (!p.onMap) { per.push({ W, onMap: false, p }); continue; }
      await d.mouse('mouseMoved', p.x + 2, p.y + 1); await sleep(150); await d.mouse('mouseMoved', p.x, p.y); await sleep(400);
      const r = await c.json(BAR_READ);
      per.push({ W, p: { x: p.x, y: p.y, cell: p.cell }, ...r });
    }
  } finally {
    await restore(); await sleep(900);
    try { B.close(); } catch { /* a closed socket is not a result */ }
  }
  note('HB.resize', `innerWidth after restore ${await c.evalExpr('innerWidth')} (started ${w0.iw})`);
  for (const r of per) console.log(`   HB @${r.W}: ${J({ onMap: r.onMap !== false, lines: r.lines, bar: r.bar, cont: r.cont, canvas: r.canvas, scroll: [r.scrollW, r.clientW], inside: r.inside, whiteSpace: r.whiteSpace, text: r.text })}`);
  const mentions = (r) => /Coll A #\d+/.test(r.text || '');
  const cut = (r) => !(r.inside && r.scrollW <= r.clientW);
  const summary = (rs) => J(rs.map((r) => ({ W: r.W, lines: r.lines, inside: r.inside, scroll: [r.scrollW, r.clientW], h: r.bar && +r.bar.h.toFixed(1), canvasW: r.canvas && r.canvas.w, collArm: mentions(r) })));
  // GATED widths: the app's default (src/main/index.ts), 1100 (the narrower window
  // harness:map-behaviour-fixes' aob census treats as real), 900 and 700. At 700
  // the map canvas is 176 px wide and the collision arm's sparkline is one run
  // wider than the bar's content box: it was a finding printed as HBW.find
  // (docs/reviews/2026-09-28-mapviewport-foreground.md) and is gated since
  // ROADMAP row 244 (the ruled fix: the run wraps; no ellipsis, no minWidth).
  const gated = per;
  const couldNot = per.filter((r) => r.resized === false || r.onMap === false || r.display !== 'flex' || !mentions(r));
  check('HBW.a', `NOTHING OF THE READOUT IS CUT at the window widths ${J(gated.map((r) => r.W))} (the first is the app's own default): at each, the bar shows the longest arm (a known collision cell), every line box of its text lies inside the map container (overflow ${J(per[0] && per[0].cont && per[0].cont.overflow)}), and its scrollWidth does not exceed its clientWidth`,
    couldNot.length ? 'UNMEASURABLE' : gated.every((r) => !cut(r)),
    `cell ${J(cell)}; ${summary(gated)}${couldNot.length ? `; COULD NOT MEASURE ${J(couldNot.map((r) => ({ W: r.W, resized: r.resized, onMap: r.onMap, display: r.display })))}` : ''}`);
  const at700 = per.find((r) => r.W === 700);
  note('HBW.find', `window 700 px (GATED in HBW.a since row 244; this line only prints its line boxes): ${at700 && at700.display === 'flex' ? (cut(at700) ? 'the readout IS CUT' : 'nothing cut') : 'NOT MEASURED'}: ${at700 ? summary([at700]) : 'n/a'}; line boxes ${J(at700 && at700.rects)}`);
  // THE NUMBERS FOR THE LOOK CALL (not rows): contrast on the pixels actually
  // behind the bar, and on the worst case the 0.9 background allows.
  await d.geometry('hb default again');
  const p = await aimAt(d, G, cell.cc * 16 + 8, cell.cr * 16 + 8);
  await d.mouse('mouseMoved', p.x + 2, p.y + 1); await sleep(150); await d.mouse('mouseMoved', p.x, p.y); await sleep(400);
  const r = await c.json(BAR_READ);
  const txt = parseColour(r.color); const bgA = O.hbBg.a;
  const shot = await P.grab({ x: r.bar.l, y: r.bar.t, w: r.bar.w, h: r.bar.h });
  // Padding pixels: the bar's left 10 px (the 12 px padding minus a margin), full height minus the 1 px border.
  const pad = [];
  for (let y = Math.ceil(r.bar.t) + 2; y < r.bar.b - 1; y++) for (let x = Math.ceil(r.bar.l) + 1; x < r.bar.l + 10; x++) { const q = shot.px(x, y); if (q) pad.push(q); }
  const lums = pad.map((q) => ({ q, L: lum(q) })).sort((a, b) => a.L - b.L);
  const worstPad = lums.length ? lums[lums.length - 1].q : null;
  const white = over(O.hbBg, bgA, { r: 255, g: 255, b: 255 });
  const black = over(O.hbBg, bgA, { r: 0, g: 0, b: 0 });
  note('HB.numbers', `text ${fmt(txt)} at ${r.font}, line-height ${r.lineHeight}, bar ${+r.bar.h.toFixed(1)} px tall; background ${J(O.hbBg)}; padding pixels sampled ${pad.length}, brightest ${fmt(worstPad)} -> contrast ${worstPad ? contrast(txt, worstPad) : 'n/a'}, darkest ${fmt(lums.length ? lums[0].q : null)} -> ${lums.length ? contrast(txt, lums[0].q) : 'n/a'}; bounds the 0.9 background allows: over black ${fmt(black)} -> ${contrast(txt, black)}, over WHITE ${fmt(white)} -> ${contrast(txt, white)}`);
  note('HB.lines', `lines per window width: ${J(per.map((q) => ({ W: q.W, lines: q.lines, barH: q.bar && +q.bar.h.toFixed(1), mapH: q.canvas && +q.canvas.h.toFixed(1) })))}`);
  await c.evalExpr("window.__dbg.setOverlay('showCollision', false)");
}

// ═══════════════════════════════════════════════════════════════════════════
// PART panel (item 2, a MEASUREMENT, not a row): is the Chunk links readout on
// screen at the default window WITHOUT scrolling (cdp-sweep-4's CL.a scrolls it
// into view first)?
// ═══════════════════════════════════════════════════════════════════════════
async function panelPart(d, O) {
  const { c } = d;
  await neutral(d);
  await d.setView(0, 0, 1);
  const G = await d.geometry('panel');
  await d.chord('k');
  const p = await aimAt(d, G, 12 * 8 + 4, 7 * 8 + 4);
  await hoverIn(d, p);
  const r = await c.json(String.raw`(() => { const el = document.querySelector('[data-testid="chunk-link-hover"]'); if (!el) return null;
    const b = el.getBoundingClientRect(); let sc = el.parentElement;
    while (sc && sc !== document.body) { const o = getComputedStyle(sc).overflowY; if (o === 'auto' || o === 'scroll') break; sc = sc.parentElement; }
    const s = sc && sc !== document.body ? sc.getBoundingClientRect() : null;
    const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
    const hit = cy >= 0 && cy < innerHeight ? document.elementFromPoint(cx, cy) : null;
    return { text: (el.textContent || '').trim(), rect: { l: b.left, t: b.top, w: b.width, h: b.height }, win: { w: innerWidth, h: innerHeight },
      scroller: s ? { t: s.top, b: s.bottom, scrollTop: sc.scrollTop, scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight } : null,
      inWindow: b.top >= 0 && b.bottom <= innerHeight, inScroller: s ? (b.top >= s.top && b.bottom <= s.bottom) : null,
      hitIsIt: !!(hit && (hit === el || el.contains(hit))) }; })()`);
  note('CLV', `tool ${(await d.st()).tool}; hover aim ${J(p)}; the readout at the default window, no scrolling: ${J(r)}`);
}

main().catch((e) => { console.error(e); process.exit(3); });
