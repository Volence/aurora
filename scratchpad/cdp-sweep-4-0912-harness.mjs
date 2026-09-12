#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// CDP SWEEP 4, 2026-09-12. The map viewport's remaining ON-SCREEN arms, looked
// at on a running app, on a COPY of aeon, on a private virtual display.
// ═══════════════════════════════════════════════════════════════════════════
//
// SOURCES (the "foreground-only, tagged" lists; where a packet and the tree
// disagree the tree wins and the output says so):
//   docs/reviews/2026-09-12-map-coverage-6.md  F-1 (Plane focus mid-drag)
//   docs/reviews/2026-09-12-map-coverage-5.md  the stamp ghost during a link
//       hover, the Chunk links readout and Detach chip
//   docs/reviews/2026-09-11-map-coverage-4.md  the guide drag, the screen
//       frame's LOCKED-scene arm, resolveEscape's lens arm (all behind the
//       Effects facet), the paste ghost, the collision hover preview with its
//       crossover rects, the band preview, the hover bar's legibility.
//   EXCLUDED: the warp's landing in the running game (needs the emulator).
//
// PARTS (env PART, comma list; default all, in this order):
//   hover      HB.*   the hover bar (writeHoverReadout, styles.hoverBar)
//   stamp      SG.*   the stamp ghost during a link hover; CL.* the Chunk links panel
//   paste      PG.*   the paste ghost (art, the tile-set gate, collision shading)
//   collision  XO.*   the collision hover preview and its crossover rects
//   plane      F1.*   map-coverage-6 F-1
//   effects    GD.* guide drag, SF.* screen frame LOCKED arm, ESC.* the lens
//              arm of resolveEscape, BAND.* the band preview, OBS.DPR
//
// EXPECTATIONS COME FROM THE CODE, NOT FROM A SCREENSHOT.
//   * Four modules of the tree under test are bundled with esbuild and CALLED:
//     crossover-preview.ts (crossoverPreviewRects), collision-cell.ts
//     (crossoverSpanForCursor), bganim-preview.ts (bandPreviewStates,
//     editorPanToCameraPx, bandStepKey, bandSlotSource), map-clipboard.ts
//     (pasteBaseStep). No plant ever touches these four files.
//   * Literals that live in React/canvas files (colours, the ghost alpha, the
//     hover bar's background, the readout templates) are read with a regex
//     that must match exactly once, FROM THE COMMITTED HEAD (`git show
//     HEAD:<path>`), not from the working tree. A red-first plant edits the
//     working tree; an expectation read from the planted file would move with
//     the plant and could never go red. The run prints which files on disk
//     differ from HEAD, so a red run shows its plant.
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//   * A SYNTHETIC EVENT THE APP IGNORES. Every gesture is Input.dispatchMouse
//     Event / dispatchKeyEvent at an INTEGER client pixel after a hit test.
//     `__dbg` is used for READS, camera setup (setView), opening the copy, and
//     turning the collision overlay on for PG.c (setOverlay, the store action
//     the View menu calls). No step under test goes through a debug door.
//   * A LAYER THAT IS NOT ON SCREEN. Each drawing row reads BOTH the layer's
//     own pixels (map-preview-canvas / map-canvas getImageData) AND a
//     screenshot of the composite, against a reference screenshot of the same
//     box without the drawing.
//   * AN EMPTY CANVAS / AN UNLOADED PROJECT. Each part opens with a PREMISE
//     row that must see its subject (the chunk picked, the stamp landed, the
//     paste armed, the scene selected, the band cells on screen, ...).
//   * TWO RUNS STITCHED. dpr and the canvas rect are printed per part, in the
//     run that prints the rows.
//
// NO EMULATOR, EVER. ORACLE_SOCKET points inside a directory this file makes
// with mkdtemp; nothing here presses the Aether badge or F7. Nothing presses a
// button that opens a native dialog. CLEANUP IS BY PID: spawnGuarded + killTree.
//
// RUN (from a worktree, BOTH variables, or the main checkout's dist answers):
//   VITE_AURORA_DEBUG=1 npm run build
//   SWEEP4_AEON_TAR=<git archive tar> AURORA_BUILT_TREE=<this tree> \
//     ELECTRON_BIN=<electron> [PART=...] [RUN_TAG=run1] \
//     node scratchpad/cdp-sweep-4-0912-harness.mjs

import { AURORA_DIR, siblingDefaultPath } from '../test/support/sibling-root.mjs';
import {
  mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, mkdtempSync, rmSync, realpathSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve as resolvePath } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import * as zlib from 'node:zlib';
import { spawnGuarded, killTree, RUN_PROFILE_DIR, descendants, cmdlineOf, isXvfbProcess } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
assertFreshBuild(RUN);
assertDebugBuild(RUN);
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const PORT = Number(process.env.PORT ?? 9431);
const ALL_PARTS = ['hover', 'stamp', 'paste', 'collision', 'plane', 'effects'];
const PARTS = (process.env.PART ?? 'all') === 'all' ? ALL_PARTS : String(process.env.PART).split(',');
for (const p of PARTS) if (!ALL_PARTS.includes(p)) throw new Error(`PART ${p} is not one of ${ALL_PARTS.join(', ')}`);
const TAG = process.env.RUN_TAG ?? new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const CAP_REL = 'docs/captures/2026-09-12-cdp-sweep-4';
const CAPTURES = `${ROOT}/${CAP_REL}`;
mkdirSync(CAPTURES, { recursive: true });

const AEON_TAR = process.env.SWEEP4_AEON_TAR ?? '';
if (!AEON_TAR || !existsSync(AEON_TAR)) {
  console.log('HARNESS REFUSES: SWEEP4_AEON_TAR must name a tarball made with git archive (see the header).');
  process.exit(2);
}
const SOCK_DIR = mkdtempSync('/tmp/cdps4-sock-');
const SOCK = join(SOCK_DIR, 'o.sock');
for (const forbidden of ['/tmp/oracle.sock', `${process.env.XDG_RUNTIME_DIR ?? '/nonexistent'}/oracle.sock`]) {
  if (SOCK === forbidden) throw new Error(`refusing: ORACLE_SOCKET would be ${forbidden}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

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
  const text = SRC_HEAD(file);
  const all = [...text.matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))];
  if (all.length !== 1) throw new Error(`ORACLE: ${what} matched ${all.length} times in HEAD:${file} (want 1): ${re}`);
  return all[0];
}
function parseColour(s) {
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s.trim());
  if (m) return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 };
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/.exec(s.trim());
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  throw new Error(`ORACLE: cannot parse colour ${s}`);
}
async function loadOracle() {
  const req = createRequire(`${RUN.root}/package.json`);
  const esb = req('esbuild');
  const bundle = async (p) => {
    const r = esb.buildSync({ entryPoints: [`${RUN.root}/${p}`], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' });
    return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
  };
  const xoPrev = await bundle('src/renderer/canvas/crossover-preview.ts');
  const cell = await bundle('src/core/collision/collision-cell.ts');
  const band = await bundle('src/core/formats/bg-override/bganim-preview.ts');
  const clip = await bundle('src/core/editing/map-clipboard.ts');
  for (const [m, k] of [[xoPrev, 'crossoverPreviewRects'], [cell, 'crossoverSpanForCursor'], [band, 'bandPreviewStates'],
    [band, 'editorPanToCameraPx'], [band, 'bandStepKey'], [band, 'bandSlotSource'], [clip, 'pasteBaseStep']]) {
    if (typeof m[k] !== 'function') throw new Error(`ORACLE: the bundle exports no ${k}`);
  }
  const CC = 'src/renderer/canvas/canvas-colors.ts';
  const colour = (name) => parseColour(fromHead(CC, new RegExp(`export const ${name} = '([^']+)'`), name)[1]);
  const MV = 'src/renderer/components/MapViewport.tsx';
  // The ghost alpha: BOTH ghosts write the same literal with the same comment.
  const alphaText = SRC_HEAD(MV);
  const alphas = [...alphaText.matchAll(/ctx\.globalAlpha = ([0-9.]+);\s+\/\/ clearly a preview, still readable as art/g)].map((m) => +m[1]);
  if (alphas.length !== 2 || alphas[0] !== alphas[1]) throw new Error(`ORACLE: the two ghost alphas are not two equal literals: ${J(alphas)}`);
  // ⚠ DEV RUN 1 ABORTED HERE: a `[^}]*?` walk stopped inside `${T.border}`.
  // The block is matched as written, whole, instead.
  const hb = fromHead(MV, /hoverBar: \{\s*position: 'absolute', bottom: 0, left: 0, right: 0,\s*padding: '4px 12px', background: 'rgba\((\d+), (\d+), (\d+), ([0-9.]+)\)',\s*borderTop: `1px solid \$\{T\.border\}`,\s*fontSize: T\.([a-zA-Z0-9]+), fontFamily: T\.([a-zA-Z]+), color: T\.([a-zA-Z]+),/, 'styles.hoverBar');
  const hoverBar = [null, hb[1], hb[2], hb[3], hb[4], hb[7]];
  const hoverFont = hb[5];
  fromHead(MV, /bar\.innerHTML = `Sec \$\{info\.sectionIndex\} \| Tile \(\$\{info\.col\}, \$\{info\.row\}\) \| Pos \$\{Math\.floor\(world\.x\)\}, \$\{Math\.floor\(world\.y\)\}\$\{extra\}`;/, 'the section readout template');
  const CL = 'src/renderer/components/ChunkLinkOptions.tsx';
  fromHead(CL, /`Under cursor: \$\{chunkName\(hovered\.chunkId\)\} \(#\$\{hovered\.id\}\)`/, 'the readout template');
  const noLink = fromHead(CL, /: '(Under cursor: no chunk link)'\}/, 'the no-link readout')[1];
  const clColour = fromHead(CL, /data-testid="chunk-link-hover"\s*style=\{\{ fontSize: T\.([a-zA-Z0-9]+), color: hovered \? T\.([a-zA-Z]+) : T\.([a-zA-Z]+) \}\}/s, 'the readout style');
  const detachTitle = fromHead(CL, /\? `(Detach placement #)\$\{hovered\.id\}(: [^`]+)`/, 'the Detach title');
  fromHead(CL, /disabled=\{!hovered\}\s*>Detach<\/Chip>/, 'the Detach chip gate');
  const GUIDE_GRAB_PX = +fromHead('src/renderer/canvas/effects-guides.ts', /export const GUIDE_GRAB_PX = (\d+);/, 'GUIDE_GRAB_PX')[1];
  const FRAME_GRAB_PX = +fromHead('src/renderer/canvas/screen-frame.ts', /export const SCREEN_FRAME_GRAB_PX = (\d+);/, 'SCREEN_FRAME_GRAB_PX')[1];
  return {
    xoPrev, cell, band, clip, alpha: alphas[0], GUIDE_GRAB_PX, FRAME_GRAB_PX,
    SELECTION_MARQUEE: colour('SELECTION_MARQUEE'), MAP_MARQUEE_FILL: colour('MAP_MARQUEE_FILL'),
    CROSSOVER_FILL: colour('CROSSOVER_FILL'), COLLISION_PREVIEW_PRIMARY: colour('COLLISION_PREVIEW_PRIMARY'),
    COLLISION_PREVIEW_FILL: colour('COLLISION_PREVIEW_FILL'),
    SCREEN_FRAME_LINE: colour('SCREEN_FRAME_LINE'), EFFECTS_GUIDE_LINE: colour('EFFECTS_GUIDE_LINE'),
    EFFECTS_GUIDE_ACTIVE: colour('EFFECTS_GUIDE_ACTIVE'),
    hoverBg: { r: +hoverBar[1], g: +hoverBar[2], b: +hoverBar[3], a: +hoverBar[4] }, hoverColourToken: hoverBar[5], hoverFont,
    noLink, clFont: clColour[1], clHovered: clColour[2], clIdle: clColour[3],
    detachTitle: (id) => `${detachTitle[1]}${id}${detachTitle[2]}`,
  };
}
/** Token name (T.textBase) to its CSS custom property (--text-base). */
const TOKEN_VAR = { textBase: '--text-base', textLo: '--text-lo', textHi: '--text-hi', textFaint: '--text-faint', tXs: '--text-xs-size', tSm: '--text-sm-size', t2xs: '--text-2xs-size', fontMono: '--font-mono' };

// ═══ THE COPY ══════════════════════════════════════════════════════════════
const ED = 'games/sonic4/data/editor';
const liveAeon = (() => { try { return siblingDefaultPath('aeon'); } catch { return null; } })();
function extract(tar, prefix) {
  const dir = mkdtempSync(`/tmp/cdps4-${prefix}-`);
  if (liveAeon && resolvePath(dir) === resolvePath(liveAeon)) throw new Error('refusing: a copy is a live tree');
  const x = spawnSync('tar', ['-x', '-f', tar, '-C', dir]);
  if (x.status !== 0) throw new Error(`tar -x exited ${x.status}: ${x.stderr}`);
  return realpathSync(dir);
}
/** cdp-sweep-2/3's makeCopy (act2, zone zb on an inverted tile set), plus one
 *  UNLOCKED control scene: ojz_act1_start with v_factor 0 under a new id. */
function makeAeonCopy() {
  const dir = extract(AEON_TAR, 'aeon');
  const pj = JSON.parse(readFileSync(`${dir}/project.json`, 'utf8'));
  if (pj.zones.length !== 1 || pj.zones[0].id !== 'ojz' || pj.zones[0].acts.length !== 1) {
    throw new Error(`the published tree is not the one-zone one-act shape: ${J(pj.zones.map((z) => [z.id, z.acts.map((a) => a.id)]))}`);
  }
  const act1 = pj.zones[0].acts[0];
  cpSync(`${dir}/${ED}/ojz/act1`, `${dir}/${ED}/ojz/act2`, { recursive: true });
  cpSync(`${dir}/${ED}/ojz/act1`, `${dir}/${ED}/zb/act1`, { recursive: true });
  const tiles = readFileSync(`${dir}/${pj.zones[0].tileset}`);
  writeFileSync(`${dir}/${ED}/zb_tiles.bin`, Buffer.from(tiles.map((b) => 0xFF - b)));
  pj.zones[0].acts.push({ ...act1, id: 'act2', dataPath: `${ED}/ojz/act2/` });
  pj.zones.push({
    id: 'zb', name: 'Sweep Zone B', tileset: `${ED}/zb_tiles.bin`, palette: pj.zones[0].palette,
    acts: [{ ...act1, dataPath: `${ED}/zb/act1/` }],
  });
  pj.name = `${pj.name} (sweep4)`;
  writeFileSync(`${dir}/project.json`, `${JSON.stringify(pj, null, 2)}\n`);
  const start = JSON.parse(readFileSync(`${dir}/${ED}/effects/ojz_act1_start.json`, 'utf8'));
  const unlocked = { ...start, id: 'sweep4_unlocked', name: 'Sweep 4 unlocked control', v_factor: 0 };
  delete unlocked.anchor;
  writeFileSync(`${dir}/${ED}/effects/sweep4_unlocked.json`, `${JSON.stringify(unlocked, null, 2)}\n`);
  const bgo = JSON.parse(readFileSync(`${dir}/games/sonic4/data/editor_bg_override.json`, 'utf8'));
  return { dir, name: pj.name, anims: Array.isArray(bgo.anims) ? bgo.anims : [] };
}
function tarCommit(tar) {
  const r = spawnSync('git', ['get-tar-commit-id'], { input: readFileSync(tar) });
  return r.status === 0 ? String(r.stdout).trim() : `(unreadable: exit ${r.status})`;
}

// ═══ PNG ═══════════════════════════════════════════════════════════════════
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

// ═══ COLOUR ARITHMETIC ═════════════════════════════════════════════════════
const over = (fg, a, bg) => ({ r: Math.round(fg.r * a + bg.r * (1 - a)), g: Math.round(fg.g * a + bg.g * (1 - a)), b: Math.round(fg.b * a + bg.b * (1 - a)) });
const dist = (p, q) => Math.max(Math.abs(p.r - q.r), Math.abs(p.g - q.g), Math.abs(p.b - q.b));
const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (p) => 0.2126 * lin(p.r) + 0.7152 * lin(p.g) + 0.0722 * lin(p.b);
const contrast = (p, q) => { const a = lum(p); const b = lum(q); return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)); };
const rgbOf = (s) => parseColour(s);
const fmt = (p) => (p ? `rgb(${p.r},${p.g},${p.b})` : 'null');
/** THE LAYER IS WHAT IS ON SCREEN: every pixel of `rect` in the screenshot is
 *  the layer's own pixel composited over the reference (the same box captured
 *  without the drawing), within 3 per channel. */
function compositeMatch(d, L, ref, shot, rect) {
  let n = 0; let ok = 0; const bad = [];
  for (let yy = Math.floor(rect.y); yy < rect.y + rect.h; yy++) {
    for (let xx = Math.floor(rect.x); xx < rect.x + rect.w; xx++) {
      const q = d.lp(L, xx, yy); const s0 = ref.px(xx, yy); const s1 = shot.px(xx, yy);
      if (!q || !s0 || !s1) continue;
      n++;
      const want = over(q, q.a / 255, s0);
      if (dist(want, s1) <= 3) ok++; else if (bad.length < 4) bad.push({ xx, yy, layer: q, ref: fmt(s0), want: fmt(want), got: fmt(s1) });
    }
  }
  return { n, ok, ratio: n ? +(ok / n).toFixed(4) : 0, bad };
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
  // Every call has a deadline (sweep-3 run 0 hung ten minutes on a clip capture).
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
const findings = [];
function check(id, name, ok, detail) {
  const tag = ok === 'UNMEASURABLE' ? 'UNMS' : ok ? 'PASS' : 'FAIL';
  const la = os.loadavg().map((n) => n.toFixed(2)).join('/');
  console.log(`${tag}  [${id}] ${name}   [load ${la}]${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (ok === 'UNMEASURABLE') unmeasurable.push(`[${id}] ${name}`);
  else if (!ok) fails.push(`[${id}] ${name}`);
}
/** A FOURTH verdict, NOT counted as pass or fail: app behaviour measured against
 *  a statement in the code that another line of the same code contradicts.
 *  Its green state would need a src change, which this parcel may not make. */
function finding(id, name, holds, detail) {
  console.log(`${holds ? 'FINDING-HOLDS' : 'FINDING'}  [${id}] ${name}\n        ${detail}`);
  if (!holds) findings.push(`[${id}] ${name}`);
}
const note = (id, text) => console.log(`NOTE  [${id}] ${text}`);

// ═══ THE REAL X POINTER ════════════════════════════════════════════════════
// ⚠ DEV RUN 2 WAS POISONED BY IT. Xvfb's pointer sits at the screen centre,
// (840, 525), which is INSIDE the centred 1400x900 window: client (700, 422).
// Chromium synthesizes a mouse move at the REAL pointer from time to time (a
// tooltip window appearing or going is enough), so the app saw a move to
// (700, 422) that no gesture made: the hover bar re-aimed, the paste ghost and
// the collision preview jumped, the stamp's link hover went to null, and a guide
// DRAG committed world_y 316 (= 422 - the canvas top 106) instead of 120.
// So the pointer of OUR private display is parked outside the window, through
// libX11's XWarpPointer, before anything is measured, and every mouse event the
// page receives is recorded so a stray that still gets through is LOUD.
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

async function main() {
  const t0 = Date.now();
  console.log('=== cdp-sweep-4 2026-09-12 harness ===');
  console.log(`    PARTS        : ${PARTS.join(',')}`);
  console.log(`    node         : ${process.version}`);
  console.log(`    loadavg      : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    ORACLE_SOCKET: ${SOCK}   (private; made by this run)`);
  console.log(`    profile      : ${RUN_PROFILE_DIR}`);
  console.log(`    PORT         : ${PORT}   DISPLAY: xvfb-run -a (never :0)`);
  console.log(`    captures     : ${CAP_REL}   tag ${TAG}`);
  console.log(`    aeon tarball : ${AEON_TAR}   commit ${tarCommit(AEON_TAR)}`);
  const O = await loadOracle();
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'src').stdout.trim();
  console.log(`    oracle       : literals from HEAD ${HEAD_SHA}; four modules bundled from ${RUN.root}/src`);
  const selfPath = 'scratchpad/cdp-sweep-4-0912-harness.mjs';
  const selfHash = git('hash-object', selfPath).stdout.trim();
  const selfHead = git('rev-parse', `HEAD:${selfPath}`).stdout.trim();
  console.log(`    harness      : blob ${selfHash} (${selfHash === selfHead ? 'as committed at HEAD' : `DIFFERS from HEAD's ${selfHead || 'none'}`})`);
  console.log(`    src on disk  : ${dirty ? `DIFFERS FROM HEAD (a plant?):\n${dirty.split('\n').map((l) => `                   ${l}`).join('\n')}` : 'identical to HEAD'}`);
  const A = makeAeonCopy();
  console.log(`    copy         : ${A.dir}   name ${J(A.name)}   bg-override bands ${A.anims.length}`);

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
    const parked = parkXPointer(child.pid);
    console.log(`    X pointer    : ${parked.ok ? 'PARKED outside the window' : 'NOT PARKED'}: ${parked.why}`);
    if (!parked.ok) check('SETUP.PARK', 'the private display\'s real pointer is parked outside the window (dev run 2)', 'UNMEASURABLE', parked.why);
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
    console.log(`    move log     : ${await c.evalExpr(MOVE_LOG)}`);
    const d = driver(c);
    const S = await setup(d, A);
    const st0 = await d.strays();
    if (st0.length) check('SETUP.STRAY', 'no mouse event reached the page at a position this harness never sent', 'UNMEASURABLE', J(st0.slice(0, 10)));
    const parts = { hover: hoverPart, stamp: stampPart, paste: pastePart, collision: collisionPart, plane: planePart, effects: effectsPart };
    for (const p of ALL_PARTS) {
      if (!PARTS.includes(p)) continue;
      console.log(`\n════════ PART ${p} ════════`);
      try { await parts[p](d, O, S); } catch (e) {
        await d.shot(`${p}-aborted`).catch(() => {});
        check(`${p.toUpperCase()}.ABORT`, `the ${p} part stopped early: rows after this point did NOT run (${e.message})`, 'UNMEASURABLE', e.stack);
      }
      // A stray move poisons every row of the part it lands in (dev run 2).
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
  console.log(`\n════ PARTS=${PARTS.join(',')}: ${pass}/${results.length} rows PASS · ${fails.length} FAIL · ${unmeasurable.length} UNMEASURABLE · `
    + `${findings.length} FINDING (not counted) · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     loadavg at end ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  if (findings.length) { console.log('FINDINGS:'); for (const f of findings) console.log(`  ${f}`); }
  console.log('END-OF-RUN');
  process.exit(fails.length || unmeasurable.length ? 1 : 0);
}

// ═══ THE DRIVER ════════════════════════════════════════════════════════════
const ALT = 1; const CTRL = 2; const SHIFT = 8;
const SENT = new Set();
function driver(c) {
  const mouse = (type, x, y, button = 'none', buttons = 0, modifiers = 0) => {
    SENT.add(`${x},${y}`);
    return c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1, modifiers });
  };
  /** Events the page received since the last call at a position never sent. */
  const strays = async () => {
    const log = await c.json('(() => { const l = window.__mvlog || []; window.__mvlog = []; return l; })()').catch(() => []);
    return log.filter(([, x, y]) => !SENT.has(`${x},${y}`));
  };
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
  const namedKey = async (k, code, vk, text) => {
    const p = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p, ...(text ? { text, unmodifiedText: text } : {}) });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(300);
  };
  const escape = () => namedKey('Escape', 'Escape', 27);
  const blur = () => c.evalExpr('document.activeElement && document.activeElement !== document.body && document.activeElement.blur()');
  const shot = async (name) => {
    const s = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURES}/${name}-${TAG}.png`, Buffer.from(s.data, 'base64'));
    console.log(`   shot: ${CAP_REL}/${name}-${TAG}.png`);
    return `${CAP_REL}/${name}-${TAG}.png`;
  };
  /** An integer CSS clip, captured, decoded; `px(x, y)` samples by CSS pixel. */
  const grab = async (rect, name = null) => {
    const vw = await c.json('({ w: innerWidth, h: innerHeight })');
    const x = Math.max(0, Math.floor(rect.x)); const y = Math.max(0, Math.floor(rect.y));
    const x1 = Math.min(vw.w, Math.ceil(rect.x + rect.w)); const y1 = Math.min(vw.h, Math.ceil(rect.y + rect.h));
    const clip = { x, y, width: x1 - x, height: y1 - y, scale: 1 };
    if (clip.width <= 0 || clip.height <= 0) throw new Error(`capture ${name}: REFUSED, a non-positive clip ${J(clip)}`);
    const s = await c.send('Page.captureScreenshot', { format: 'png', clip });
    const buf = Buffer.from(s.data, 'base64');
    let path = null;
    if (name) { path = `${CAP_REL}/${name}-${TAG}.png`; writeFileSync(`${ROOT}/${path}`, buf); console.log(`   clip: ${path}  (clip ${J(clip)})`); }
    const img = decodePng(buf);
    const ratio = img.w / clip.width;
    const px = (cx, cy) => {
      const ix = Math.floor((cx + 0.5 - clip.x) * ratio); const iy = Math.floor((cy + 0.5 - clip.y) * ratio);
      if (ix < 0 || iy < 0 || ix >= img.w || iy >= img.h) return null;
      const o = (iy * img.w + ix) * 4;
      return { r: img.px[o], g: img.px[o + 1], b: img.px[o + 2] };
    };
    return { clip, img, ratio, px, path };
  };
  /** A canvas's OWN pixels over a CSS rect, one sample per CSS pixel (the
   *  backing pixel under that CSS pixel's centre). Un-premultiplied RGBA. */
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
  const dpr = () => c.evalExpr('window.devicePixelRatio');
  const FACET = (label) => `[...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === ${J(label)}) || null`;
  // ⚠ DEV RUN 2: the first "Plane" label in the DOM was not the palette's (its
  // A button sat at y=4 and failed the hit test). A candidate whose button is
  // hit-testable wins; the first found is only the fallback, and a realClick
  // on it then fails loudly with the aim printed.
  const BTN_IN = (row, label) => String.raw`(() => { const ls = [...document.querySelectorAll('span')].filter((s) => s.textContent.trim() === ${J(row)} && s.nextElementSibling && s.nextElementSibling.tagName === 'BUTTON' && s.getBoundingClientRect().width > 0);
    let first = null;
    for (const l of ls) { const b = [...l.parentElement.querySelectorAll('button')].find((x) => x.textContent.trim() === ${J(label)}); if (!b) continue; first = first || b;
      const r = b.getBoundingClientRect(); const h = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      if (h && (h === b || b.contains(h))) return b; }
    return first; })()`;
  const canvasRect = () => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
    const b = cv.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, dpr: window.devicePixelRatio }; })()`);
  const view = () => c.json('window.__dbg.view()');
  const setView = async (x, y, z) => { await c.evalExpr(`window.__dbg.setView(${x}, ${y}, ${z})`); await sleep(450); return view(); };
  const st = () => c.json('window.__dbg.aeon.state()');
  /** The rect, dpr and view this part aims against, printed in the run. */
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
    const row = a.parentElement && a.parentElement.firstElementChild ? (a.parentElement.firstElementChild.textContent || '').trim() : null;
    return { tag: a.tagName, text: (a.textContent || '').trim().slice(0, 40), row, isBody: a === document.body }; })()`);
  const tokens = () => c.json(String.raw`(() => { const out = {};
    for (const [k, v] of ${J(Object.entries(TOKEN_VAR))}) { const d = document.createElement('div');
      if (v.endsWith('-size')) d.style.fontSize = 'var(' + v + ')'; else if (v.startsWith('--font')) d.style.fontFamily = 'var(' + v + ')'; else d.style.color = 'var(' + v + ')';
      document.body.appendChild(d); const cs = getComputedStyle(d);
      out[k] = v.endsWith('-size') ? cs.fontSize : v.startsWith('--font') ? cs.fontFamily : cs.color; d.remove(); }
    return out; })()`);
  return {
    c, mouse, strays, aim, clickAt, realClick, chord, namedKey, escape, blur, shot, grab, layerPixels, lp, toasts, clearToasts,
    dpr, FACET, BTN_IN, canvasRect, view, setView, st, geometry, clientOf, aimWorld, worldAt, hoverTo, active, tokens,
  };
}

// ═══ SETUP: the copy open on ojz act1, Layout facet ═══════════════════════
const LEVELS = `document.querySelector('[data-section="explorer.levels"]')`;
const LEVELS_HEADER = String.raw`(() => { const s = ${LEVELS}; if (!s || !s.firstElementChild) return null;
  return s.firstElementChild.querySelector('span') || s.firstElementChild; })()`;
const ROW = (label) => String.raw`(() => { const s = ${LEVELS}; if (!s) return null;
  return [...s.querySelectorAll('button')].find((b) => (b.querySelector('span')?.textContent || '').trim() === ${J(label)}) || null; })()`;
const A1 = 'Oracle Jungle Zone · act1';
const B1 = 'Sweep Zone B · act1';
async function setup(d, A) {
  const { c } = d;
  const expandLevels = async () => {
    for (let i = 0; i < 3; i++) {
      const cur = await c.evalExpr(`(() => { const s = ${LEVELS}; return s ? s.getAttribute('data-section-collapsed') : 'absent'; })()`);
      if (cur !== 'true') return cur;
      await d.realClick(LEVELS_HEADER);
      await sleep(400);
    }
    return 'still-collapsed';
  };
  const openRow = async (label, zone, act) => {
    await expandLevels();
    const clicked = await d.realClick(ROW(label), { scroll: true });
    let s = null;
    for (let i = 0; i < 60; i++) {
      s = await d.st().catch(() => null);
      if (s && s.zone === zone && s.act === act && (await d.canvasRect())) break;
      await sleep(250);
    }
    await sleep(700);
    return { clicked, state: s };
  };
  console.log('\n──── setup: open the aeon copy (__dbg.aeon.open, setup only), then ojz act1 by a real Explorer click ────');
  const opened = await c.evalExpr(`window.__dbg.aeon.open(${J(A.dir)})`).catch((e) => `threw: ${e.message}`);
  let s0 = null;
  for (let i = 0; i < 80; i++) { s0 = await d.st().catch(() => null); if (s0 && s0.open) break; await sleep(250); }
  if (!s0 || !s0.open) throw new Error(`aeon copy did not open: ${J(opened)} ${J(s0)}`);
  const toA = await openRow(A1, 'ojz', 'act1');
  await d.realClick(d.FACET('Layout'));
  await sleep(600);
  const scenes = await c.json('window.__dbg.aeon.scenes()');
  check('SETUP.0', 'the aeon copy is open on ojz act1 by a real Explorer click, and its scene library carries the three locked scenes and the unlocked control',
    !!(toA.clicked && toA.clicked.hitOk) && toA.state && toA.state.zone === 'ojz' && toA.state.act === 'act1'
      && ['ojz_act1_start', 'ojz_act1_floor', 'sweep4_unlocked'].every((id) => scenes.some((x) => x.id === id)),
    `open ${J(opened)}; row aim ${J(toA.clicked)}; state ${J(toA.state)}; scenes ${J(scenes.map((x) => x.id))}`);
  return { A, openRow, expandLevels };
}

/** The Layout facet, the view tool, no paste, no marquee, no lens. */
async function neutral(d) {
  await d.clearToasts();
  await d.blur();
  await d.escape(); await d.escape();
  const f = await d.realClick(d.FACET('Layout'));
  await sleep(500);
  await d.blur();
  await d.chord('v');
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART hover. writeHoverReadout + styles.hoverBar (map-coverage-4's list:
// "whether the hover bar is legible on screen").
// ═══════════════════════════════════════════════════════════════════════════
async function hoverPart(d, O) {
  const { c } = d;
  await neutral(d);
  await d.setView(0, 0, 1);
  const G = await d.geometry('hover');
  const BAR = String.raw`(() => { const cv = document.getElementById('map-canvas'); const ct = cv ? cv.parentElement : null; if (!ct) return null;
    const bar = [...ct.children].find((k) => k.tagName === 'DIV' && getComputedStyle(k).position === 'absolute' && getComputedStyle(k).bottom === '0px' && getComputedStyle(k).pointerEvents === 'none');
    return bar || null; })()`;
  const barRead = () => c.json(String.raw`(() => { const el = ${BAR}; if (!el) return { found: false };
    const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); const ct = el.parentElement.getBoundingClientRect();
    return { found: true, display: cs.display, text: el.innerText, rect: { x: b.x, y: b.y, w: b.width, h: b.height, bottom: b.bottom, right: b.right },
      container: { x: ct.x, y: ct.y, w: ct.width, h: ct.height, bottom: ct.bottom },
      fontSize: cs.fontSize, color: cs.color, background: cs.backgroundColor, fontFamily: cs.fontFamily,
      paddingLeft: cs.paddingLeft, borderTop: cs.borderTopWidth, scrollW: el.scrollWidth, clientW: el.clientWidth }; })()`);
  // CONTROL: the pointer outside the map, so onMouseLeave has hidden the bar.
  await d.mouse('mouseMoved', Math.round(G.R.x + G.R.w / 2), Math.round(G.R.y + 40));
  await sleep(150);
  await d.mouse('mouseMoved', Math.max(5, Math.round(G.R.x - 60)), Math.round(G.R.y + 40));
  await sleep(350);
  const hidden = await barRead();
  const strip = { x: G.R.x, y: G.R.y + G.R.h - 34, w: Math.min(G.R.w, 900), h: 34 };
  const ref = await d.grab(strip, 'hb-ref-no-bar');
  check('HB.0', 'CONTROL: with the pointer off the map the hover bar is display:none (onMouseLeave), so a painted bar below is the hover\'s doing',
    hidden.found && hidden.display === 'none', J(hidden));
  // THE HOVER: an integer aim; the expected text derived from THAT integer.
  const aim = { x: Math.round(G.R.x + 101), y: Math.round(G.R.y + 61) };
  await d.mouse('mouseMoved', aim.x, aim.y);
  await sleep(400);
  const w = d.worldAt(G, aim.x, aim.y);
  const wantText = `Sec 0 | Tile (${Math.floor(w.x / 8)}, ${Math.floor(w.y / 8)}) | Pos ${Math.floor(w.x)}, ${Math.floor(w.y)}`;
  const bar = await barRead();
  const tk = await d.tokens();
  const shot = await d.grab(strip, 'hb-bar');
  await d.shot('hb-full');
  // The bar's padding zone: background only, never a glyph. Expected per pixel:
  // styles.hoverBar's background (HEAD) composited over the reference pixel.
  let padN = 0; let padOk = 0; const padBad = [];
  if (bar.found && bar.display === 'flex') {
    const pl = parseFloat(bar.paddingLeft);
    for (let yy = Math.ceil(bar.rect.y) + 2; yy <= Math.floor(bar.rect.bottom) - 2; yy++) {
      for (let xx = Math.ceil(bar.rect.x) + 1; xx <= Math.floor(bar.rect.x + pl) - 2; xx++) {
        const r0 = ref.px(xx, yy); const s1 = shot.px(xx, yy); if (!r0 || !s1) continue;
        padN++;
        const want = over(O.hoverBg, O.hoverBg.a, r0);
        if (dist(want, s1) <= 2) padOk++; else if (padBad.length < 4) padBad.push({ x: xx, y: yy, ref: fmt(r0), want: fmt(want), got: fmt(s1) });
      }
    }
  }
  check('HB.a', 'the hover bar is ON SCREEN after a real hover: display flex, the container\'s bottom strip, the readout for the INTEGER aim (writeHoverReadout\'s template), and its padding is styles.hoverBar\'s background composited over the map in 95%+ of pixels',
    bar.found && bar.display === 'flex' && bar.text === wantText && Math.abs(bar.rect.bottom - bar.container.bottom) <= 0.5
      && Math.abs(bar.rect.x - bar.container.x) <= 0.5 && Math.abs(bar.rect.w - bar.container.w) <= 0.5 && padN > 20 && padOk / padN >= 0.95,
    `aim ${J(aim)} world ${J(w)}; text ${J(bar.text)} want ${J(wantText)}; bar rect ${J(bar.rect)} container ${J(bar.container)}; `
    + `padding pixels ${padOk}/${padN} match over(${J(O.hoverBg)}, ref) (first misses ${J(padBad)}); captures ${ref.path}, ${shot.path}`);
  // LEGIBILITY: what can be measured. The row gates only what the code states
  // (the tokens and that glyphs of the text colour are painted); the contrast
  // and the fit are reported, and "legible" is the owner's look call.
  const textRgb = rgbOf(bar.color || 'rgb(0,0,0)');
  const tokRgb = rgbOf(tk[O.hoverColourToken] || 'rgb(0,0,0)');
  let glyph = 0; let maxC = 0; const bgSamples = [];
  if (bar.found && bar.display === 'flex') {
    const pl = parseFloat(bar.paddingLeft);
    for (let yy = Math.ceil(bar.rect.y) + 2; yy <= Math.floor(bar.rect.bottom) - 2; yy++) {
      for (let xx = Math.ceil(bar.rect.x + pl); xx <= Math.min(Math.floor(bar.rect.x + pl + 560), Math.floor(strip.x + strip.w) - 1); xx++) {
        const s1 = shot.px(xx, yy); if (!s1) continue;
        if (dist(s1, tokRgb) <= 24) glyph++;
      }
    }
    for (let yy = Math.ceil(bar.rect.y) + 2; yy <= Math.floor(bar.rect.bottom) - 2; yy++) {
      const s1 = shot.px(Math.ceil(bar.rect.x) + 3, yy); if (s1) bgSamples.push(s1);
    }
    for (const bg of bgSamples) maxC = Math.max(maxC, contrast(textRgb, bg));
  }
  const bgMed = bgSamples.length ? bgSamples[Math.floor(bgSamples.length / 2)] : null;
  const ratio = bgMed ? contrast(textRgb, bgMed) : null;
  check('HB.b', `LEGIBILITY, the code's half: the text is the ${O.hoverColourToken} token and the ${O.hoverFont} size (styles.hoverBar, HEAD), and glyph pixels of that colour are painted in the bar`,
    bar.found && bar.color === tk[O.hoverColourToken] && bar.fontSize === tk[O.hoverFont] && glyph >= 20,
    `MEASURED: font-size ${bar.fontSize} (token ${O.hoverFont} = ${tk[O.hoverFont]}); colour ${bar.color} (token ${O.hoverColourToken} = ${tk[O.hoverColourToken]}); `
    + `font ${J(bar.fontFamily)}; glyph pixels within 24 of the text colour: ${glyph}; composited background (median of the padding column) ${fmt(bgMed)}; `
    + `WCAG contrast text/background ${ratio}; bar height ${bar.rect && bar.rect.h}px; text box scrollWidth ${bar.scrollW} clientWidth ${bar.clientW} (fits: ${bar.scrollW <= bar.clientW}). LOOK CALL FOR THE OWNER: capture ${shot.path}`);
  // The LONGEST readout line: the collision arm (overlay on). Measured, not gated.
  await c.evalExpr("window.__dbg.setOverlay('showCollision', true)");
  await sleep(300);
  await d.mouse('mouseMoved', aim.x + 1, aim.y); await sleep(150); await d.mouse('mouseMoved', aim.x, aim.y); await sleep(400);
  const barColl = await barRead();
  const shotColl = await d.grab({ x: G.R.x, y: G.R.y + G.R.h - 34, w: G.R.w, h: 34 }, 'hb-bar-collision-line');
  note('HB.c', `MEASURED, the longest readout (collision overlay on): ${J(barColl.text)}; bar ${J(barColl.rect)}; scrollWidth ${barColl.scrollW} clientWidth ${barColl.clientW} (fits on one row: ${barColl.scrollW <= barColl.clientW && barColl.rect.h <= bar.rect.h + 0.5}); capture ${shotColl.path}`);
  await c.evalExpr("window.__dbg.setOverlay('showCollision', false)");
  await sleep(300);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART stamp. map-coverage-5: the stamp ghost during a link hover with a chunk
// picked; the Chunk links panel's readout and Detach chip on screen.
// ═══════════════════════════════════════════════════════════════════════════
async function stampPart(d, O) {
  const { c } = d;
  await neutral(d);
  await d.setView(0, 0, 1);
  const G = await d.geometry('stamp');
  await d.chord('k');
  const tool = (await d.st()).tool;
  const CELLS = String.raw`[...document.querySelectorAll('button')].filter((b) => b.title && !/^tile /i.test(b.title) && !/blank/i.test(b.title)
    && b.querySelector(':scope > canvas') && b.getBoundingClientRect().width > 0)`;
  const CELL_N = (n) => `(${CELLS}[${n}] || null)`;
  const nCells = await c.evalExpr(`${CELLS}.length`);
  const pick = async (n) => { const p = await d.realClick(CELL_N(n), { scroll: true }); return { aim: p, id: await c.json('window.__dbg.aeon.selectedChunk()') }; };
  const X = await pick(0);
  const xi = X.id ? await c.json(`window.__dbg.aeon.chunkInfo(${J(X.id)})`) : null;
  // Where to stamp: section 0, chunk-aligned, whose hovered tile is unlinked now.
  const wT = xi ? xi.widthTiles : 16; const hT = xi ? xi.heightTiles : 16;
  const spot = await c.json(String.raw`(() => { const a = window.__dbg.aeon; const out = [];
    for (const [bc, br] of [[${wT} * 2, ${hT}], [${wT} * 3, ${hT}], [${wT} * 2, ${hT} * 2], [${wT}, ${hT}]]) {
      let linked = 0; for (let r = 0; r < ${hT}; r++) for (let q = 0; q < ${wT}; q++) if (a.chunkLinkAt(0, bc + q, br + r)) linked++;
      out.push({ bc, br, linked }); }
    return out; })()`);
  const P = spot.find((s) => s.linked === 0) ?? spot[0];
  const p0 = await c.json('window.__dbg.aeon.chunkPlacements(0)');
  const stampAim = d.aimWorld(G, (P.bc + wT / 2) * 8, (P.br + hT / 2) * 8);
  await d.hoverTo(stampAim);
  await d.clickAt(stampAim);
  await sleep(300);
  const p1 = await c.json('window.__dbg.aeon.chunkPlacements(0)');
  const added = p1.filter((q) => !p0.some((o) => o.id === q.id));
  // The hovered tile for the ghost: inside the placement, off its diagonal.
  const hovTile = { col: P.bc + Math.floor(wT * 0.75), row: P.br + Math.floor(hT * 0.25) };
  const hovAim = d.aimWorld(G, hovTile.col * 8 + 4, hovTile.row * 8 + 4);
  const hovW = d.worldAt(G, hovAim.x, hovAim.y);
  // REF: the view tool (the stamp branch's else clears the ghost on a move).
  await d.chord('v');
  await d.hoverTo(hovAim);
  // Y: another chunk, picked by a real click.
  await d.chord('k');
  let Y = null;
  for (let n = 1; n < Math.min(nCells, 40); n++) {
    const y = await pick(n);
    if (!y.id || y.id === X.id) continue;
    const yi = await c.json(`window.__dbg.aeon.chunkInfo(${J(y.id)})`);
    if (yi && yi.nonzeroTiles > 0) { Y = { ...y, info: yi }; break; }
  }
  if (!Y) throw new Error(`no second chunk with art to pick (cells ${nCells})`);
  const yBase = { col: Math.floor(Math.floor(hovW.x / 8) / Y.info.widthTiles) * Y.info.widthTiles,
    row: Math.floor(Math.floor(hovW.y / 8) / Y.info.heightTiles) * Y.info.heightTiles };
  const gTL = d.clientOf(G, yBase.col * 8, yBase.row * 8);
  const gRect = { x: gTL.x, y: gTL.y, w: Y.info.widthTiles * 8 * G.V.zoom, h: Y.info.heightTiles * 8 * G.V.zoom };
  const clipRect = { x: gRect.x - 16, y: gRect.y - 16, w: gRect.w + 32, h: gRect.h + 32 };
  // The REF capture needs the stamp tool OFF: capture it now with the view tool.
  await d.chord('v');
  await d.hoverTo(hovAim);
  const ref = await d.grab(clipRect, 'sg-ref-no-ghost');
  await d.chord('k');
  await d.hoverTo(hovAim);
  const lh = await c.json('window.__dbg.aeon.linkHover()');
  const sel = await c.json('window.__dbg.aeon.selectedChunk()');
  const ghostShot = await d.grab(clipRect, 'sg-ghost-during-link-hover');
  const L = await d.layerPixels('map-preview-canvas', clipRect);
  check('SG.0', 'PREMISE: the stamp tool armed; a REAL click stamped chunk X (a new placement in section 0); chunk Y picked by a real click in the grid; and the link hover NAMES the new placement of X',
    tool === 'stamp-chunk' && added.length === 1 && added[0].chunkId === X.id && sel === Y.id && Y.id !== X.id
      && !!lh && lh.sectionIndex === 0 && lh.placementId === added[0].id && lh.chunkId === X.id,
    `dpr ${G.R.dpr}; X ${J(X)} (${J(xi)}); spot ${J(P)} of ${J(spot)}; added ${J(added)}; Y ${J({ id: Y.id, aim: Y.aim, info: Y.info })}; linkHover ${J(lh)}; selected ${J(sel)}`);
  // The ghost's OWN pixels, and the screen against the reference.
  const aGhost = Math.round(O.alpha * 255);
  const inset = 3;
  let inN = 0; let inArt = 0; let ringN = 0; let ringInk = 0; let edgeN = 0; let edgeOk = 0; let changedIn = 0; let changedRing = 0;
  for (let yy = Math.floor(clipRect.y); yy < clipRect.y + clipRect.h; yy++) {
    for (let xx = Math.floor(clipRect.x); xx < clipRect.x + clipRect.w; xx++) {
      const q = d.lp(L, xx, yy); const s0 = ref.px(xx, yy); const s1 = ghostShot.px(xx, yy);
      if (!q || !s0 || !s1) continue;
      const cx = xx + 0.5; const cy = yy + 0.5;
      const inside = cx >= gRect.x + inset && cx <= gRect.x + gRect.w - inset && cy >= gRect.y + inset && cy <= gRect.y + gRect.h - inset;
      const outside = cx < gRect.x - 4 || cx > gRect.x + gRect.w + 4 || cy < gRect.y - 4 || cy > gRect.y + gRect.h + 4;
      const onEdge = !inside && !outside && (Math.abs(cy - gRect.y) < 0.9 || Math.abs(cy - (gRect.y + gRect.h)) < 0.9 || Math.abs(cx - gRect.x) < 0.9 || Math.abs(cx - (gRect.x + gRect.w)) < 0.9)
        && cx > gRect.x + 3 && cx < gRect.x + gRect.w - 3 || (!inside && !outside && (Math.abs(cx - gRect.x) < 0.9 || Math.abs(cx - (gRect.x + gRect.w)) < 0.9) && cy > gRect.y + 3 && cy < gRect.y + gRect.h - 3);
      const diff = dist(s0, s1) > 0;
      if (inside) { inN++; if (Math.abs(q.a - aGhost) <= 1) inArt++; if (diff) changedIn++; }
      if (outside) { ringN++; if (q.a !== 0) ringInk++; if (diff) changedRing++; }
      if (onEdge) { edgeN++; if (q.a === 255 && dist(q, O.SELECTION_MARQUEE) <= 2) edgeOk++; }
    }
  }
  check('SG.a', `DURING THE LINK HOVER the stamp ghost is drawn: its layer holds chunk Y's art at the ghost alpha (${O.alpha} = ${aGhost}/255, HEAD) inside the snapped rect, the SELECTION_MARQUEE outline on its edge, nothing outside; and on screen the rect changed against the no-ghost reference while the ring around it did not`,
    inN > 0 && inArt >= 16 && edgeN > 0 && edgeOk / edgeN >= 0.9 && ringN > 0 && ringInk === 0 && changedIn > 0 && changedRing === 0
      && compositeMatch(d, L, ref, ghostShot, clipRect).ratio >= 0.99,
    `ghost rect (derived: base ${J(yBase)} of Y ${Y.info.widthTiles}x${Y.info.heightTiles} from the integer aim ${J(hovAim)}) ${J(gRect)}; `
    + `layer: inside ${inArt}/${inN} at alpha ${aGhost}; edge ${edgeOk}/${edgeN} SELECTION_MARQUEE; ring ${ringInk}/${ringN} inked; `
    + `screen vs reference: changed inside ${changedIn}, changed in the ring ${changedRing}; screen = over(layer, reference) ${J(compositeMatch(d, L, ref, ghostShot, clipRect))}; captures ${ref.path}, ${ghostShot.path}`);

  // ── the Chunk links panel, WHILE the placement is hovered ─────────────────
  const tk = await d.tokens();
  const READOUT = `document.querySelector('[data-testid="chunk-link-hover"]')`;
  // Chip (ui/primitives.tsx) is a <button> only when it has a handler, and a
  // <span> at opacity 0.5 otherwise: found by its text among the row's children.
  const CHIP = String.raw`(() => { const r = ${READOUT}; return r ? [...r.parentElement.children].find((b) => b.textContent.trim() === 'Detach') || null : null; })()`;
  const elRead = (sel) => c.json(String.raw`(() => { const el = ${sel}; if (!el) return { found: false };
    const b = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    let sc = el.parentElement; while (sc && sc !== document.body) { const s = getComputedStyle(sc); if (/(auto|scroll)/.test(s.overflowY + ' ' + s.overflowX)) break; sc = sc.parentElement; }
    const sb = sc && sc !== document.body ? sc.getBoundingClientRect() : null;
    const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2); const hit = document.elementFromPoint(cx, cy);
    return { found: true, tag: el.tagName, text: (el.textContent || '').trim(), title: el.title || null, disabled: !!el.disabled,
      rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) },
      fontSize: cs.fontSize, color: cs.color, background: cs.backgroundColor, opacity: cs.opacity,
      scrollW: el.scrollWidth, clientW: el.clientWidth, hitInside: !!(hit && (hit === el || el.contains(hit))),
      inScroller: sb ? (b.left >= sb.left - 0.5 && b.right <= sb.right + 0.5 && b.top >= sb.top - 0.5 && b.bottom <= sb.bottom + 0.5) : null,
      scroller: sb ? { x: +sb.x.toFixed(2), w: +sb.width.toFixed(2), y: +sb.y.toFixed(2), h: +sb.height.toFixed(2) } : null,
      inViewport: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth }; })()`);
  // Scroll the panel's readout into view (DOM positioning for the reading, not a
  // gesture), with the pointer still parked on the map.
  await c.evalExpr(`(() => { const r = ${READOUT}; if (r) r.scrollIntoView({ block: 'nearest' }); return !!r; })()`);
  await sleep(250);
  const ro = await elRead(READOUT);
  const chip = await elRead(CHIP);
  const xName = xi ? xi.name : X.id;
  const wantRo = `Under cursor: ${xName} (#${lh ? lh.placementId : '?'})`;
  const roCap = ro.found ? await d.grab({ x: ro.rect.x - 4, y: ro.rect.y - 4, w: Math.max(ro.rect.w, 10) + (chip.found ? chip.rect.w + 20 : 0) + 8, h: Math.max(ro.rect.h, chip.found ? chip.rect.h : 0) + 8 }, 'cl-readout-and-detach-hovered') : null;
  const bgUnder = (cap, rect) => {
    if (!cap) return null;
    const counts = new Map();
    for (let yy = Math.floor(rect.y); yy < rect.y + rect.h; yy++) for (let xx = Math.floor(rect.x); xx < rect.x + rect.w; xx++) {
      const p = cap.px(xx, yy); if (!p) continue; const k = `${p.r},${p.g},${p.b}`; counts.set(k, (counts.get(k) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) return null; const [r, g, b] = top[0].split(',').map(Number); return { r, g, b };
  };
  const roBg = ro.found ? bgUnder(roCap, ro.rect) : null;
  const chipBg = chip.found ? bgUnder(roCap, chip.rect) : null;
  const onScr = (e) => e.found && e.hitInside && e.inViewport && e.inScroller !== false;
  check('CL.a', `the readout is ON SCREEN naming the hovered placement ("Under cursor: <X's name> (#id)"), in the ${O.clHovered} token (ChunkLinkOptions: hovered ? T.${O.clHovered} : T.${O.clIdle}) at the ${O.clFont} size, unclipped`,
    onScr(ro) && ro.text === wantRo && ro.color === tk[O.clHovered] && ro.fontSize === tk[O.clFont] && ro.scrollW <= ro.clientW,
    `MEASURED: ${J(ro)}; want ${J(wantRo)}; colour token ${O.clHovered} = ${tk[O.clHovered]}; size token = ${tk[O.clFont]}; panel background under it ${fmt(roBg)}; `
    + `WCAG contrast ${roBg ? contrast(rgbOf(ro.color), roBg) : 'n/a'}. LOOK CALL FOR THE OWNER: capture ${roCap && roCap.path}`);
  check('CL.b', 'the Detach chip is ON SCREEN and ENABLED while a placement is named, its title naming that placement (disabled={!hovered}, the title template, HEAD)',
    onScr(chip) && chip.tag === 'BUTTON' && chip.disabled === false && chip.opacity === '1' && chip.title === O.detachTitle(lh ? lh.placementId : -1) && chip.scrollW <= chip.clientW,
    `MEASURED: ${J(chip)}; want title ${J(O.detachTitle(lh ? lh.placementId : -1))}; chip background (screen) ${fmt(chipBg)}; `
    + `WCAG contrast text/chip ${chipBg ? contrast(rgbOf(chip.color), chipBg) : 'n/a'}. LOOK CALL FOR THE OWNER: capture ${roCap && roCap.path}`);

  // THE CHIP'S SIZE, measured against what Chip states (red run red-cl and dev
  // run 3 both read 13px): the button's style ends `font: 'inherit', fontSize:
  // T.tXs` and its comment promises "a chip in a 13px bar is still 11px".
  const chipStyle = fromHead('src/renderer/components/ui/primitives.tsx',
    /style=\{\{ \.\.\.style, font: 'inherit', fontSize: T\.([a-zA-Z0-9]+), lineHeight: 1, margin: 0, textAlign: 'left' \}\}/, 'Chip button style');
  finding('CL.FONT', `the enabled Detach chip is at Chip's own ${chipStyle[1]} size (primitives.tsx Chip: style {...style, font: 'inherit', fontSize: T.${chipStyle[1]}}; "a chip in a 13px bar is still 11px")`,
    chip.found && chip.tag === 'BUTTON' && chip.fontSize === tk[chipStyle[1]],
    `MEASURED: Detach chip ${J({ tag: chip.tag, fontSize: chip.fontSize, disabled: chip.disabled })}; token ${chipStyle[1]} = ${tk[chipStyle[1]]}; the readout beside it ${ro.fontSize}. `
    + 'Why, from the code (not measured here): the spread `style` already carries fontSize, so the later fontSize keeps that EARLIER key position and `font: inherit`, set after it, resets the size to the parent\'s.');

  // ── CONTROL: an UNLINKED tile, the same pick ──────────────────────────────
  const un = await c.json(String.raw`(() => { const a = window.__dbg.aeon;
    for (const [col, row] of [[${P.bc} + ${wT} * 2 + 3, ${P.br} + 2], [${P.bc} - ${wT} + 3, ${P.br} + ${hT} + 2], [3, ${P.br} + 2], [${P.bc} + 3, ${P.br} + ${hT} + 3]]) {
      if (col >= 0 && row >= 0 && !a.chunkLinkAt(0, col, row)) return { col, row }; } return null; })()`);
  if (!un) throw new Error('no unlinked control tile near the stamp');
  const unAim = d.aimWorld(G, un.col * 8 + 4, un.row * 8 + 4);
  const unW = d.worldAt(G, unAim.x, unAim.y);
  const uBase = { col: Math.floor(Math.floor(unW.x / 8) / Y.info.widthTiles) * Y.info.widthTiles, row: Math.floor(Math.floor(unW.y / 8) / Y.info.heightTiles) * Y.info.heightTiles };
  const uTL = d.clientOf(G, uBase.col * 8, uBase.row * 8);
  const uRect = { x: uTL.x, y: uTL.y, w: Y.info.widthTiles * 8 * G.V.zoom, h: Y.info.heightTiles * 8 * G.V.zoom };
  await d.hoverTo(unAim);
  const lh2 = await c.json('window.__dbg.aeon.linkHover()');
  const L2 = await d.layerPixels('map-preview-canvas', { x: uRect.x + 3, y: uRect.y + 3, w: Math.max(1, uRect.w - 6), h: Math.max(1, uRect.h - 6) });
  let uArt = 0; for (let k = 3; k < L2.px.length; k += 4) if (Math.abs(L2.px[k] - aGhost) <= 1) uArt++;
  check('SG.b', 'CONTROL, NOT during a link hover: over an unlinked tile the hover writes null and the ghost is drawn at ITS snapped rect all the same (so SG.a is about the link-hover arm)',
    lh2 === null && uArt >= 16, `tile ${J(un)} aim ${J(unAim)}; linkHover ${J(lh2)}; ghost rect ${J(uRect)}; ghost-alpha pixels ${uArt}/${L2.px.length / 4}`);
  const ro2 = await elRead(READOUT); const chip2 = await elRead(CHIP);
  const roCap2 = ro2.found ? await d.grab({ x: ro2.rect.x - 4, y: ro2.rect.y - 4, w: ro2.rect.w + (chip2.found ? chip2.rect.w + 20 : 0) + 8, h: Math.max(ro2.rect.h, chip2.found ? chip2.rect.h : 0) + 8 }, 'cl-readout-and-detach-unlinked') : null;
  check('CL.c', `CONTROL: over the unlinked tile the readout says ${J(O.noLink)} in the ${O.clIdle} token and Detach is disabled`,
    ro2.found && ro2.text === O.noLink && ro2.color === tk[O.clIdle] && chip2.found && (chip2.tag === 'SPAN' || chip2.disabled === true) && chip2.opacity === '0.5',
    `readout ${J(ro2)}; chip ${J({ tag: chip2.tag, disabled: chip2.disabled, title: chip2.title, opacity: chip2.opacity })}; capture ${roCap2 && roCap2.path}`);
  // Leave the document as found: undo the stamp.
  await d.chord('v');
  await d.chord('z', CTRL);
  const p2 = await c.json('window.__dbg.aeon.chunkPlacements(0)');
  note('SG.cleanup', `Ctrl+Z after the part: placements in section 0 ${p1.length} -> ${p2.length}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART paste. The paste ghost (MapViewport drawCollisionPreview's paste arm).
// ═══════════════════════════════════════════════════════════════════════════
async function pastePart(d, O, S) {
  const { c } = d;
  await neutral(d);
  const toA = await S.openRow(A1, 'ojz', 'act1');
  await d.realClick(d.FACET('Layout')); await sleep(400);
  await d.setView(0, 0, 1);
  const G = await d.geometry('paste');
  const LAYERS_BTN = (label) => d.BTN_IN('Layers', label);
  const SNAP_BTN = (label) => d.BTN_IN('Snap', label);
  const visC = Math.min(64, Math.floor(G.R.w / 8)); const visR = Math.min(64, Math.floor((G.R.h - 40) / 8));
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
  if (!pick || !pick.H) throw new Error(`no copyable region / paste target: ${J(pick)}`);
  const tilePx = (col, row) => ({ x: Math.round(G.R.x + (col * 8 + 3 - G.V.x) * G.V.zoom), y: Math.round(G.R.y + (row * 8 + 3 - G.V.y) * G.V.zoom) });
  const Hpt = tilePx(pick.H.col + 1, pick.H.row + 1);
  const drag = async (col, row, w, h) => {
    const a = tilePx(col, row); const b = tilePx(col + w - 1, row + h - 1);
    await d.mouse('mouseMoved', a.x, a.y);
    await d.mouse('mousePressed', a.x, a.y, 'left', 1);
    await d.mouse('mouseMoved', Math.round((a.x + b.x) / 2), Math.round((a.y + b.y) / 2), 'left', 1);
    await d.mouse('mouseMoved', b.x, b.y, 'left', 1);
    await d.mouse('mouseReleased', b.x, b.y, 'left', 0);
    await sleep(300);
  };
  await d.chord('m');
  await d.realClick(SNAP_BTN('Block')); await sleep(250);
  await d.realClick(LAYERS_BTN('Both')); await sleep(250);
  await drag(pick.S.col, pick.S.row, 4, 4);
  await d.chord('c', CTRL);
  await sleep(300);
  const ci = await c.json('window.__dbg.aeon.mapClipboardInfo()');
  // The ghost rect, derived from the integer aim through pasteBaseStep (bundled).
  const step = O.clip.pasteBaseStep({ artOnly: ci.artOnly, widthTiles: ci.widthTiles, heightTiles: ci.heightTiles });
  const hw = d.worldAt(G, Hpt.x, Hpt.y);
  const base = { col: Math.floor(Math.floor(hw.x / 8) / step) * step, row: Math.floor(Math.floor(hw.y / 8) / step) * step };
  const tl = d.clientOf(G, base.col * 8, base.row * 8);
  const gRect = { x: tl.x, y: tl.y, w: ci.widthTiles * 8 * G.V.zoom, h: ci.heightTiles * 8 * G.V.zoom };
  const clipRect = { x: gRect.x - 12, y: gRect.y - 12, w: gRect.w + 24, h: gRect.h + 24 };
  await d.clearToasts();
  await d.hoverTo(Hpt);
  const refA = await d.grab(clipRect, 'pg-ref-home');
  await d.chord('v', CTRL);
  await d.clearToasts();
  await d.hoverTo(Hpt);
  const gh = await c.json('window.__dbg.aeon.pasteGhost()');
  const shotA = await d.grab(clipRect, 'pg-ghost-home');
  const LA = await d.layerPixels('map-preview-canvas', clipRect);
  const aArt = Math.round((O.alpha + O.MAP_MARQUEE_FILL.a * (1 - O.alpha)) * 255);
  const aFill = Math.round(O.MAP_MARQUEE_FILL.a * 255);
  const measure = (L, ref, shot, rect) => {
    let inN = 0; let art = 0; let fillOnly = 0; let over1 = 0; let ringN = 0; let ringInk = 0; let edgeN = 0; let edgeOk = 0; let ringChanged = 0; let inChanged = 0; let fillFormulaN = 0; let fillFormulaOk = 0;
    const alphas = new Map();
    for (let yy = Math.floor(clipRect.y); yy < clipRect.y + clipRect.h; yy++) {
      for (let xx = Math.floor(clipRect.x); xx < clipRect.x + clipRect.w; xx++) {
        const q = d.lp(L, xx, yy); const s0 = ref.px(xx, yy); const s1 = shot.px(xx, yy); if (!q || !s0 || !s1) continue;
        const cx = xx + 0.5; const cy = yy + 0.5;
        const inside = cx >= rect.x + 3 && cx <= rect.x + rect.w - 3 && cy >= rect.y + 3 && cy <= rect.y + rect.h - 3;
        const outside = cx < rect.x - 4 || cx > rect.x + rect.w + 4 || cy < rect.y - 4 || cy > rect.y + rect.h + 4;
        const edge = !inside && !outside && (Math.abs(cy - rect.y) < 0.9 || Math.abs(cy - (rect.y + rect.h)) < 0.9) && cx > rect.x + 1 && cx < rect.x + rect.w - 1;
        if (inside) {
          inN++; alphas.set(q.a, (alphas.get(q.a) || 0) + 1);
          if (Math.abs(q.a - aArt) <= 2) art++;
          if (Math.abs(q.a - aFill) <= 1) fillOnly++;
          if (q.a > aFill + 2) over1++;
          if (dist(s0, s1) > 0) inChanged++;
          fillFormulaN++; if (dist(over(O.MAP_MARQUEE_FILL, O.MAP_MARQUEE_FILL.a, s0), s1) <= 2) fillFormulaOk++;
        }
        if (outside) { ringN++; if (q.a !== 0) ringInk++; if (dist(s0, s1) > 0) ringChanged++; }
        if (edge) { edgeN++; if (q.a >= 250 && dist(q, O.SELECTION_MARQUEE) <= 2) edgeOk++; }
      }
    }
    return { inN, art, fillOnly, over1, ringN, ringInk, ringChanged, inChanged, edgeN, edgeOk, fillFormulaN, fillFormulaOk,
      alphaTop: [...alphas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) };
  };
  const mA = measure(LA, refA, shotA, gRect);
  check('PG.0', 'PREMISE: a block-aligned 4x4 copy carrying collision; Ctrl+V armed; the published hover is the base derived from the INTEGER aim through pasteBaseStep',
    !!toA.state && ci.artOnly === false && ci.collisionALen > 0 && gh.pasting === true && !!gh.hover
      && gh.hover.sectionIndex === 0 && gh.hover.baseCol === base.col && gh.hover.baseRow === base.row,
    `dpr ${G.R.dpr}; clipboard ${J(ci)}; step ${step}; aim ${J(Hpt)} world ${J(hw)}; base ${J(base)}; report ${J(gh)}`);
  check('PG.a', `HOME ZONE: the ghost's layer holds the clipboard's ART (alpha ${aArt}/255 = ghost ${O.alpha} under the ${O.MAP_MARQUEE_FILL.a} fill) inside the derived rect, a SELECTION_MARQUEE dashed edge, nothing outside; on screen the rect changed and the ring did not`,
    mA.art >= 16 && mA.edgeN > 0 && mA.edgeOk / mA.edgeN >= 0.25 && mA.ringInk === 0 && mA.inChanged > 0 && mA.ringChanged === 0
      && compositeMatch(d, LA, refA, shotA, clipRect).ratio >= 0.99,
    `rect ${J(gRect)}; ${J(mA)}; screen = over(layer, reference) ${J(compositeMatch(d, LA, refA, shotA, clipRect))}; captures ${refA.path}, ${shotA.path}`);
  await d.escape();

  // ── zone B: another tile set, so the art gate (clipboardFitsTileset) closes ──
  const toB = await S.openRow(B1, 'zb', 'act1');
  await d.realClick(d.FACET('Layout')); await sleep(400);
  await d.setView(0, 0, 1);
  const GB = await d.geometry('paste zone B');
  if (GB.R.x !== G.R.x || GB.R.y !== G.R.y || GB.R.w !== G.R.w || GB.R.h !== G.R.h) throw new Error(`the canvas moved between zones: ${J(G.R)} -> ${J(GB.R)}`);
  await d.clearToasts();
  await d.hoverTo(Hpt);
  const refB = await d.grab(clipRect, 'pg-ref-zone-b');
  await d.chord('v', CTRL);
  await d.clearToasts();
  await d.hoverTo(Hpt);
  const ghB = await c.json('window.__dbg.aeon.pasteGhost()');
  const shotB = await d.grab(clipRect, 'pg-ghost-zone-b');
  const LB = await d.layerPixels('map-preview-canvas', clipRect);
  const mB = measure(LB, refB, shotB, gRect);
  check('PG.b', `ANOTHER TILE SET: the ghost draws its footprint, the ${O.MAP_MARQUEE_FILL.a} fill and the edge but NO ART (the showArt gate): every interior pixel of its layer is the fill alpha ${aFill}, and on screen the interior is exactly the fill over the reference`,
    !!toB.state && toB.state.zone === 'zb' && ghB.pasting === true && mB.inN > 0 && mB.fillOnly === mB.inN && mB.art === 0
      && mB.fillFormulaOk / mB.fillFormulaN >= 0.99 && mB.edgeN > 0 && mB.edgeOk / mB.edgeN >= 0.25,
    `zone ${J(toB.state && toB.state.zone)}; report ${J(ghB)}; ${J(mB)}; captures ${refB.path}, ${shotB.path}`);

  // ── collision shading, zone B (no art to confuse the alpha) ───────────────
  await c.evalExpr("window.__dbg.setOverlay('showCollision', true)");
  await sleep(300);
  await d.hoverTo(Hpt);
  const words = await c.json('window.__dbg.aeon.mapClipboardWords()');
  const cellsW = ci.widthTiles >> 1; const cellsH = ci.heightTiles >> 1;
  const aShade = Math.round((1 - (1 - O.MAP_MARQUEE_FILL.a) * (1 - O.COLLISION_PREVIEW_FILL.a)) * 255);
  const LS = await d.layerPixels('map-preview-canvas', clipRect);
  const cells = [];
  for (let cy = 0; cy < cellsH; cy++) for (let cx = 0; cx < cellsW; cx++) {
    const p = d.clientOf(GB, (base.col + cx * 2) * 8 + 8, (base.row + cy * 2) * 8 + 8);
    const q = d.lp(LS, p.x, p.y);
    const want = words.collisionA[cy * cellsW + cx] !== 0 ? aShade : aFill;
    cells.push({ cx, cy, word: words.collisionA[cy * cellsW + cx], alpha: q && q.a, want, ok: !!q && Math.abs(q.a - want) <= 1 });
  }
  const shadeCap = await d.grab(clipRect, 'pg-ghost-zone-b-collision-shading');
  check('PG.c', `COLLISION SHADING (overlay on): each 16px cell of the ghost is shaded (alpha ${aShade}) exactly where the clipboard's plane A word is nonzero, and fill-only (${aFill}) where it is zero`,
    cells.length > 0 && cells.some((x) => x.word !== 0) && cells.every((x) => x.ok),
    `cells ${J(cells)}; capture ${shadeCap.path}`);
  await c.evalExpr("window.__dbg.setOverlay('showCollision', false)");
  await d.escape();
  await S.openRow(A1, 'ojz', 'act1');
}

// ═══════════════════════════════════════════════════════════════════════════
// PART collision. The collision hover preview and its crossover rects.
// ═══════════════════════════════════════════════════════════════════════════
async function collisionPart(d, O) {
  const { c } = d;
  await neutral(d);
  const fc = await d.realClick(d.FACET('Collision'));
  await sleep(700);
  if ((await d.st()).tool !== 'paint-collision') await d.chord('c');
  await d.setView(0, 0, 4);
  const G = await d.geometry('collision');
  const shapeBtn = await d.realClick(String.raw`([...document.querySelectorAll('button')].filter((b) => /^#\d+/.test(b.title || '') && b.getBoundingClientRect().width > 0)[2] || null)`, { scroll: true });
  await d.realClick(d.BTN_IN('Brush', '1'));
  const loopHand = await d.realClick(String.raw`(() => { const l = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === 'Loop' && s.nextElementSibling && s.nextElementSibling.tagName === 'BUTTON');
    return l ? [...l.parentElement.querySelectorAll('button')].find((b) => /^Hand /.test(b.textContent.trim())) || null : null; })()`);
  const half = await d.realClick(d.BTN_IN('Mark', 'Half (8px)'));
  const brush = await c.json('window.__dbg.aeon.armCollisionBrush({})');
  const markVisible = await c.evalExpr(`!!(${d.BTN_IN('Mark', 'Half (8px)')})`);
  check('XO.0', 'PREMISE: the Collision facet by a real click, paint-collision armed, a shape picked, the Loop brush on Hand-off and the Mark width on Half, all by real clicks (the Mark row renders only while the brush authors)',
    !!(fc && fc.hitOk) && (await d.st()).tool === 'paint-collision' && !!(shapeBtn && shapeBtn.hitOk) && !!(loopHand && loopHand.hitOk) && !!(half && half.hitOk)
      && brush.crossover === 'hand-off' && brush.crossoverSpanMode === 'half' && markVisible,
    `dpr ${G.R.dpr}; brush ${J(brush)}; aims ${J({ fc, shapeBtn, loopHand, half })}`);
  // The cell and its halves, aimed at integers; the span and the rects derived
  // by the tree's own functions from the INTEGER aim's tile column.
  const cell = { cc: 3, cr: 2 };
  const aimL = d.aimWorld(G, cell.cc * 16 + 4, cell.cr * 16 + 8);
  const aimR = d.aimWorld(G, cell.cc * 16 + 12, cell.cr * 16 + 8);
  const cellTL = d.clientOf(G, cell.cc * 16, cell.cr * 16);
  const cellRect = { x: cellTL.x, y: cellTL.y, w: 16 * G.V.zoom, h: 16 * G.V.zoom };
  const clipRect = { x: cellRect.x - 10, y: cellRect.y - 10, w: cellRect.w + 20, h: cellRect.h + 20 };
  const derive = (aimP) => {
    const w = d.worldAt(G, aimP.x, aimP.y);
    const col = Math.floor(w.x / 8); const row = Math.floor(w.y / 8);
    const span = O.cell.crossoverSpanForCursor('half', col);
    const rects = O.xoPrev.crossoverPreviewRects({ targets: [{ cellCol: col >> 1, cellRow: row >> 1 }], span, width: 256, offsetX: 0, offsetY: 0 })
      .map((r) => { const p = d.clientOf(G, r.x, r.y); return { x: p.x, y: p.y, w: r.w * G.V.zoom, h: r.h * G.V.zoom }; });
    return { col, row, span, rects };
  };
  const orange = (q) => !!q && q.a >= 100 && q.r - q.b >= 80;
  const halves = (L, shot, ref) => {
    const out = { left: { n: 0, or: 0, dor: 0 }, right: { n: 0, or: 0, dor: 0 } };
    for (let yy = Math.floor(cellRect.y) + 3; yy < cellRect.y + cellRect.h - 3; yy++) {
      for (let xx = Math.floor(cellRect.x) + 3; xx < cellRect.x + cellRect.w - 3; xx++) {
        const cx = xx + 0.5; const mid = cellRect.x + cellRect.w / 2;
        if (Math.abs(cx - mid) < 3) continue;
        const side = cx < mid ? out.left : out.right;
        const q = d.lp(L, xx, yy); side.n++; if (orange(q)) side.or++;
        const s0 = ref.px(xx, yy); const s1 = shot.px(xx, yy);
        if (s0 && s1 && (s1.r - s1.b) - (s0.r - s0.b) >= 40) side.dor++;
      }
    }
    return out;
  };
  // REF: the pointer on a far cell (the preview follows the pointer, not this cell).
  await d.hoverTo(d.aimWorld(G, cell.cc * 16 + 16 * 6 + 8, cell.cr * 16 + 16 * 3 + 8));
  const ref = await d.grab(clipRect, 'xo-ref-other-cell');
  await d.hoverTo(aimL);
  const eL = derive(aimL);
  const LL = await d.layerPixels('map-preview-canvas', clipRect);
  const sL = await d.grab(clipRect, 'xo-hover-left-half');
  const hL = halves(LL, sL, ref);
  // The orange box on the layer against the union of the derived rects.
  const box = (L) => { let x0 = 1e9; let y0 = 1e9; let x1 = -1e9; let y1 = -1e9;
    for (let j = 0; j < L.h; j++) for (let i = 0; i < L.w; i++) { const o = (j * L.w + i) * 4; const q = { r: L.px[o], g: L.px[o + 1], b: L.px[o + 2], a: L.px[o + 3] };
      if (orange(q)) { x0 = Math.min(x0, L.x0 + i); y0 = Math.min(y0, L.y0 + j); x1 = Math.max(x1, L.x0 + i + 1); y1 = Math.max(y1, L.y0 + j + 1); } }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  const union = (rs) => ({ x: Math.min(...rs.map((r) => r.x)), y: Math.min(...rs.map((r) => r.y)), w: Math.max(...rs.map((r) => r.x + r.w)) - Math.min(...rs.map((r) => r.x)), h: Math.max(...rs.map((r) => r.y + r.h)) - Math.min(...rs.map((r) => r.y)) });
  const near = (a, b) => !!a && !!b && Math.abs(a.x - b.x) <= 1.5 && Math.abs(a.y - b.y) <= 1.5 && Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2;
  // ⚠ DEV RUN 2: an "orange bounding box" also caught the shape ghost's 3 px
  // solid-edge frame round the whole cell. The span is judged per COLUMN of the
  // cell's interior (4 px in from every edge, clear of that frame) instead.
  const profile = (L, u) => {
    const x0 = Math.ceil(cellRect.x) + 4; const x1 = Math.floor(cellRect.x + cellRect.w) - 4;
    const y0 = Math.ceil(cellRect.y) + 4; const y1 = Math.floor(cellRect.y + cellRect.h) - 4;
    let inCols = 0; let inOk = 0; let outCols = 0; let outOk = 0; const bad = [];
    for (let xx = x0; xx < x1; xx++) {
      const cx = xx + 0.5; let n = 0; let or = 0;
      for (let yy = y0; yy < y1; yy++) { n++; if (orange(d.lp(L, xx, yy))) or++; }
      const inside = cx >= u.x + 1.5 && cx <= u.x + u.w - 1.5; const outside = cx < u.x - 1 || cx > u.x + u.w + 1;
      if (inside) { inCols++; if (or / n >= 0.9) inOk++; else if (bad.length < 6) bad.push({ xx, frac: +(or / n).toFixed(2) }); }
      if (outside) { outCols++; if (or === 0) outOk++; else if (bad.length < 6) bad.push({ xx, frac: +(or / n).toFixed(2) }); }
    }
    return { inCols, inOk, outCols, outOk, bad };
  };
  const uL = union(eL.rects); const pL = profile(LL, uL); const cL = compositeMatch(d, LL, ref, sL, clipRect);
  check('XO.a', `LEFT HALF hovered: crossoverSpanForCursor('half', col ${eL.col}) = ${J(eL.span)}; every interior column inside crossoverPreviewRects' box is CROSSOVER_FILL on the layer, no column outside it is, and the screen is the layer over the reference`,
    eL.span === 'left' && pL.inCols > 0 && pL.inOk === pL.inCols && pL.outCols > 0 && pL.outOk === pL.outCols && cL.ratio >= 0.99,
    `aim ${J(aimL)}; derived rects ${J(eL.rects)} (union ${J(uL)}); column profile ${J(pL)}; halves ${J(hL)}; screen = over(layer, reference) ${J(cL)}; captures ${ref.path}, ${sL.path}`);
  await d.hoverTo(aimR);
  const eR = derive(aimR);
  const LR = await d.layerPixels('map-preview-canvas', clipRect);
  const sR = await d.grab(clipRect, 'xo-hover-right-half');
  const hR = halves(LR, sR, ref);
  const uR = union(eR.rects); const pR = profile(LR, uR); const cR = compositeMatch(d, LR, ref, sR, clipRect);
  check('XO.b', `RIGHT HALF hovered: the span is ${J(eR.span)} and the fill moves to the columns of the right half's rects, the screen still the layer over the reference`,
    eR.span === 'right' && pR.inCols > 0 && pR.inOk === pR.inCols && pR.outCols > 0 && pR.outOk === pR.outCols && cR.ratio >= 0.99,
    `aim ${J(aimR)}; derived rects ${J(eR.rects)} (union ${J(uR)}); column profile ${J(pR)}; halves ${J(hR)}; screen ${J(cR)}; capture ${sR.path}`);
  // CONTROL: Keep (the brush does not author), the preview itself still drawn.
  const keep = await d.realClick(d.BTN_IN('Loop', 'Keep'));
  await d.hoverTo(aimL);
  const LK = await d.layerPixels('map-preview-canvas', clipRect);
  const sK = await d.grab(clipRect, 'xo-hover-keep');
  const hK = halves(LK, sK, ref);
  // The primary outline: COLLISION_PREVIEW_PRIMARY on the cell's border (the
  // stroke is 1.5 px inset 0.75 px: the first pixel inside each edge).
  let pN = 0; let pOk = 0; const pBad = [];
  const P = O.COLLISION_PREVIEW_PRIMARY;
  // ⚠ DEV RUN 2: the stroke is laid OVER the scope outline and the shape
  // ghost's edge, so the pixel is the primary colour composited, e.g. (127,188,245)
  // at 255: within 12 of COLLISION_PREVIEW_PRIMARY, alpha at least 0.9.
  const sampleEdge = (xx, yy) => { const q = d.lp(LK, xx, yy); pN++; if (q && q.a >= Math.round(0.9 * 255) && dist(q, P) <= 12) pOk++; else if (pBad.length < 4) pBad.push({ xx, yy, q }); };
  for (let xx = Math.ceil(cellRect.x) + 4; xx < cellRect.x + cellRect.w - 4; xx += 3) { sampleEdge(xx, Math.floor(cellRect.y)); sampleEdge(xx, Math.ceil(cellRect.y + cellRect.h) - 1); }
  for (let yy = Math.ceil(cellRect.y) + 4; yy < cellRect.y + cellRect.h - 4; yy += 3) { sampleEdge(Math.floor(cellRect.x), yy); sampleEdge(Math.ceil(cellRect.x + cellRect.w) - 1, yy); }
  const brush2 = await c.json('window.__dbg.aeon.armCollisionBrush({})');
  check('XO.c', 'CONTROL: Loop on Keep (crossoverBrushAuthors false): no crossover fill anywhere in the hovered cell',
    !!(keep && keep.hitOk) && brush2.crossover === 'keep' && hK.left.or === 0 && hK.right.or === 0 && compositeMatch(d, LK, ref, sK, clipRect).ratio >= 0.99,
    `brush ${J(brush2)}; halves ${J(hK)}; screen ${J(compositeMatch(d, LK, ref, sK, clipRect))}; capture ${sK.path}`);
  check('XO.p', 'the collision hover preview itself is drawn at the hovered cell: the COLLISION_PREVIEW_PRIMARY outline on its four edges (HEAD colour)',
    pN > 0 && pOk / pN >= 0.9, `cell ${J(cellRect)}; primary edge pixels ${pOk}/${pN}; first misses ${J(pBad)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART plane. map-coverage-6 F-1: focus stays on Plane A through the press;
// Tab reaches B; Space fires B without ending the drag.
// ═══════════════════════════════════════════════════════════════════════════
async function planePart(d) {
  const { c } = d;
  await neutral(d);
  const fc = await d.realClick(d.FACET('Collision'));
  await sleep(700);
  if ((await d.st()).tool !== 'paint-collision') await d.chord('c');
  // ⚠ DEV RUN 3: the collision part's shape pick scrolled the palette, leaving
  // the Plane row above its scroller's visible box (y=4, under the tab strip,
  // hit test failed). Every palette click here scrolls its button into view.
  const keepAim = await d.realClick(d.BTN_IN('Loop', 'Keep'), { scroll: true });
  const brushAim = await d.realClick(d.BTN_IN('Brush', '1'), { scroll: true });
  await d.setView(0, 0, 2);
  const G = await d.geometry('plane');
  const shape = await d.realClick(String.raw`([...document.querySelectorAll('button')].filter((b) => /^#\d+/.test(b.title || '') && b.getBoundingClientRect().width > 0)[3] || null)`, { scroll: true });
  // Four cells in a row, every sub-tile air on BOTH planes, on screen at zoom 2.
  const maxCC = Math.floor((G.R.w / G.V.zoom) / 16) - 6; const maxCR = Math.floor((G.R.h / G.V.zoom) / 16) - 6;
  const found = await c.json(String.raw`(() => { const a = window.__dbg.aeon; const idx = (cc, cr) => [0, 1].flatMap((dy) => [0, 1].map((dx) => (2 * cr + dy) * 256 + 2 * cc + dx));
    for (let cr = 3; cr < ${maxCR}; cr++) for (let cc = 3; cc < ${maxCC}; cc++) {
      let ok = true; for (let k = 0; k < 4 && ok; k++) for (const i of idx(cc + k, cr)) if (a.collisionAt(0, 'a', i) !== 0 || a.collisionAt(0, 'b', i) !== 0) { ok = false; break; }
      if (ok) return { cc, cr }; }
    return null; })()`);
  if (!found) throw new Error('no four air cells in a row on screen');
  const cellsIdx = (k) => [0, 1].flatMap((dy) => [0, 1].map((dx) => (2 * found.cr + dy) * 256 + 2 * (found.cc + k) + dx));
  const words = () => c.json(String.raw`(() => { const a = window.__dbg.aeon; const out = { a: [], b: [] };
    for (let k = 0; k < 4; k++) { const idx = [0, 1].flatMap((dy) => [0, 1].map((dx) => (2 * ${found.cr} + dy) * 256 + 2 * (${found.cc} + k) + dx));
      out.a.push(idx.map((i) => a.collisionAt(0, 'a', i))); out.b.push(idx.map((i) => a.collisionAt(0, 'b', i))); }
    return out; })()`);
  const cellAim = (k) => d.aimWorld(G, (found.cc + k) * 16 + 8, found.cr * 16 + 8);
  const painted = (row) => row.every((w) => w !== 0);
  const clean = (row) => row.every((w) => w === 0);
  const w0 = await words();
  // 1. Plane A by a real mouse click.
  const aBtn = await d.realClick(d.BTN_IN('Plane', 'A'), { scroll: true });
  const f1 = await d.active();
  const brush1 = await c.json('window.__dbg.aeon.armCollisionBrush({})');
  const plane1 = brush1.plane;
  check('F1.a', 'after a REAL click on Plane A, focus is on that button (the Plane buttons do not call actAndDropFocus) and the plane is A',
    !!(aBtn && aBtn.hitOk) && !!f1 && f1.tag === 'BUTTON' && f1.text === 'A' && f1.row === 'Plane' && plane1 === 'a' && brush1.crossover === 'keep',
    `dpr ${G.R.dpr}; facet ${J(fc && fc.hitOk)}; shape ${J(shape && shape.hitOk)}; Keep ${J(keepAim && keepAim.hitOk)}; brush 1 ${J(brushAim && brushAim.hitOk)}; aim ${J(aBtn)}; activeElement ${J(f1)}; brush ${J(brush1)}; cells from ${J(found)}`);
  // 2. A press held on the map, moved one cell.
  const c1 = cellAim(0); const c2 = cellAim(1); const c3 = cellAim(2); const c4 = cellAim(3);
  await d.mouse('mouseMoved', c1.x, c1.y);
  await d.mouse('mousePressed', c1.x, c1.y, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', c2.x, c2.y, 'left', 1); await sleep(150);
  const f2 = await d.active();
  const w1 = await words();
  check('F1.b', 'with the press HELD on the map (and the stroke painting cells 1 and 2 on A) focus is STILL on Plane A: the collision press calls preventDefault',
    !!f2 && f2.tag === 'BUTTON' && f2.text === 'A' && f2.row === 'Plane' && painted(w1.a[0]) && painted(w1.a[1]),
    `activeElement ${J(f2)}; plane A cells 1,2 ${J(w1.a.slice(0, 2))}`);
  // 3. Tab.
  await d.namedKey('Tab', 'Tab', 9);
  const f3 = await d.active();
  check('F1.c', 'Tab, with the button still held: focus moves to Plane B',
    !!f3 && f3.tag === 'BUTTON' && f3.text === 'B' && f3.row === 'Plane', `activeElement ${J(f3)}`);
  // 4. Space.
  await d.namedKey(' ', 'Space', 32, ' ');
  const plane4 = (await c.json('window.__dbg.aeon.armCollisionBrush({})')).plane;
  const f4 = await d.active();
  // 5. The drag goes on: cells 3 and 4, then release.
  await d.mouse('mouseMoved', c3.x, c3.y, 'left', 1); await sleep(150);
  await d.mouse('mouseMoved', c4.x, c4.y, 'left', 1); await sleep(150);
  const w2 = await words();
  check('F1.d', 'Space fires B (pickPlane: the store\'s plane is B) WITHOUT ending the drag: moving on with the button held paints cells 3 and 4 on plane B',
    plane4 === 'b' && !!f4 && f4.text === 'B' && painted(w2.b[2]) && painted(w2.b[3]),
    `plane ${plane4}; activeElement ${J(f4)}; plane B cells 3,4 ${J(w2.b.slice(2))}`);
  await d.mouse('mouseReleased', c4.x, c4.y, 'left', 0); await sleep(300);
  const w3 = await words();
  await d.chord('z', CTRL);
  const w4 = await words();
  await d.chord('z', CTRL);
  const w5 = await words();
  const same = (x, y) => J(x) === J(y);
  check('F1.e', 'the stroke landed as TWO commands, newest first (recordPaint\'s plane clause): A holds cells 1,2 and B cells 3,4; the first Ctrl+Z takes back only the B run; the second takes back the A run',
    painted(w3.a[0]) && painted(w3.a[1]) && clean(w3.a[2]) && clean(w3.a[3]) && clean(w3.b[0]) && clean(w3.b[1]) && painted(w3.b[2]) && painted(w3.b[3])
      && painted(w4.a[0]) && painted(w4.a[1]) && same(w4.b, w0.b) && same(w5.a, w0.a) && same(w5.b, w0.b),
    `after release ${J(w3)}; after one undo ${J(w4)}; after two ${J(w5)}; before ${J(w0)}`);
  await d.realClick(d.BTN_IN('Plane', 'A'));
  await d.blur();
}

// ═══════════════════════════════════════════════════════════════════════════
// PART effects. The guide drag, the screen frame's LOCKED arm, resolveEscape's
// lens arm, the band preview (all behind the Effects facet), and OBS.DPR.
// ═══════════════════════════════════════════════════════════════════════════
async function effectsPart(d, O, S) {
  const { c } = d;
  await neutral(d);
  const fe = await d.realClick(d.FACET('Effects'));
  await sleep(900);
  await d.blur();
  await d.chord('v');
  const SCENE_BTN = (id) => String.raw`([...document.querySelectorAll('button')].find((b) => (b.title || '').endsWith(${J(`(${id})`)})) || null)`;
  const pickScene = async (id) => { const p = await d.realClick(SCENE_BTN(id), { scroll: true }); await sleep(500); return p; };
  const sceneDoc = async (id) => JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()')).find((s) => s.id === id) ?? null;
  const cyan = (p) => !!p && Math.min(p.g, p.b) - p.r >= 60;
  const VIEW_MENU = String.raw`([...document.querySelectorAll('button')].find((b) => /^\s*View\s*$/.test(b.textContent || '')) || null)`;
  /** A View-menu row toggled by real clicks: open the menu, click the row, close it. */
  const viewMenuToggle = async (prefix) => {
    const m1 = await d.realClick(VIEW_MENU); await sleep(350);
    const r = await d.realClick(String.raw`([...document.querySelectorAll('label')].find((l) => (l.textContent || '').trim().startsWith(${J(prefix)})) || null)`);
    await sleep(300);
    const m2 = await d.realClick(VIEW_MENU); await sleep(300);
    return { menu: !!(m1 && m1.hitOk), row: !!(r && r.hitOk), closed: !!(m2 && m2.hitOk) };
  };
  /** The SESSION anchor: on the unlocked scene with the toggle on, the frame is drawn at it. */
  const sessionAnchor = async () => {
    await pickScene('sweep4_unlocked');
    const on = await viewMenuToggle('Screen frame');
    const f = await c.json('window.__dbg.aeon.screenFrame()');
    const off = await viewMenuToggle('Screen frame');
    return { anchor: f.anchor, active: f.active, toggles: [on, off], toggleAfter: (await c.json('window.__dbg.overlays()')).showScreenFrame };
  };

  // ── GD: the guide drag, locked scene ojz_act1_start ──────────────────────
  const pS = await pickScene('ojz_act1_start');
  await d.setView(0, 0, 1);
  const G = await d.geometry('effects');
  const g0 = await c.json('window.__dbg.aeon.guides()');
  const doc0 = await sceneDoc('ojz_act1_start');
  const L2 = 2;
  const row0 = g0.rows && g0.rows[L2];
  const gx = Math.round(G.R.x + 300);
  const pressY = row0 ? Math.round(G.R.y + row0.canvasY) : null;
  const band = { x: gx - 40, y: G.R.y + 40, w: 120, h: 160 };
  const shotG0 = await d.grab(band, 'gd-before');
  check('GD.0', 'PREMISE: the Effects facet by a real click, the locked scene picked by a real click in the scene list, and the last repaint drew one guide per layer (layer 2 at its world_y, on screen as a cyan line)',
    !!(fe && fe.hitOk) && !!(pS && pS.hitOk) && (await c.json('window.__dbg.aeon.selectedScene()')) === 'ojz_act1_start' && g0.active && g0.sceneId === 'ojz_act1_start'
      && g0.space === 'screen' && !!doc0 && g0.rows.length === doc0.layers.length && !!row0 && row0.worldY === doc0.layers[L2].world_y && cyan(shotG0.px(gx, pressY)),
    `dpr ${G.R.dpr}; guides ${J({ active: g0.active, id: g0.sceneId, space: g0.space, rows: g0.rows && g0.rows.map((r) => [r.index, r.worldY, r.canvasY]) })}; press row ${pressY} pixel ${fmt(shotG0.px(gx, pressY))}; capture ${shotG0.path}`);
  // The drag: press on the line, 40 px down, held.
  const dy = 40;
  await d.mouse('mouseMoved', gx, pressY);
  await sleep(150);
  await d.mouse('mousePressed', gx, pressY, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', gx, pressY + dy / 2, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', gx, pressY + dy, 'left', 1); await sleep(300);
  // Expected: canvasYToLayerTop = vpY + canvasY / zoom (guideOriginWorldY is 0),
  // clampLayerTop rounds inside 0..PLANE_LINE_SPAN-1 (no vsplit on this layer).
  const want = Math.round(G.V.y + (pressY + dy - G.R.y) / G.V.zoom);
  const g1 = await c.json('window.__dbg.aeon.guides()');
  const doc1 = await sceneDoc('ojz_act1_start');
  const newRow = Math.round(G.R.y + (want - G.V.y) * G.V.zoom);
  const shotG1 = await d.grab(band, 'gd-dragging');
  const litNew = shotG1.px(gx, newRow);
  check('GD.a', `the press on layer 2 (within GUIDE_GRAB_PX ${O.GUIDE_GRAB_PX}) takes a DRAG that previews: the drawn guide sits at world_y ${want} (vpY + canvasY/zoom of the integer cursor), EFFECTS_GUIDE_ACTIVE on screen there, while the document still holds ${doc0 && doc0.layers[L2].world_y}`,
    g1.dragIndex === L2 && g1.rows[L2].worldY === want && !!doc1 && doc1.layers[L2].world_y === doc0.layers[L2].world_y && dist(litNew, O.EFFECTS_GUIDE_ACTIVE) <= 4,
    `guides ${J({ dragIndex: g1.dragIndex, row: g1.rows[L2] })}; document ${doc1 && doc1.layers[L2].world_y}; pixel at the new row ${newRow}: ${fmt(litNew)} (want ${fmt(O.EFFECTS_GUIDE_ACTIVE)}); capture ${shotG1.path}`);
  await d.mouse('mouseReleased', gx, pressY + dy, 'left', 0); await sleep(400);
  const doc2 = await sceneDoc('ojz_act1_start');
  await d.mouse('mouseMoved', gx + 200, pressY + dy + 60); await sleep(300);
  const shotG2 = await d.grab(band, 'gd-released');
  await d.chord('z', CTRL);
  const doc3 = await sceneDoc('ojz_act1_start');
  const shotG3 = await d.grab(band, 'gd-undone');
  check('GD.b', 'RELEASE commits ONE undo step: the document holds the dragged world_y, the line is on screen at its new row and not at the old one; one Ctrl+Z puts the old world_y and the old line back',
    !!doc2 && doc2.layers[L2].world_y === want && !!doc3 && doc3.layers[L2].world_y === doc0.layers[L2].world_y
      && cyan(shotG2.px(gx, newRow)) && !cyan(shotG2.px(gx, pressY)) && cyan(shotG3.px(gx, pressY)) && !cyan(shotG3.px(gx, newRow)),
    `layers after release ${J(doc2 && doc2.layers.map((l) => l.world_y))}; after release ${doc2 && doc2.layers[L2].world_y}; after Ctrl+Z ${doc3 && doc3.layers[L2].world_y}; pixels: released new ${fmt(shotG2.px(gx, newRow))} old ${fmt(shotG2.px(gx, pressY))}; undone old ${fmt(shotG3.px(gx, pressY))} new ${fmt(shotG3.px(gx, newRow))}; captures ${shotG2.path}, ${shotG3.path}`);

  // ── SF: the screen frame's LOCKED-scene arm ──────────────────────────────
  await d.setView(0, 200, 1);
  const session0 = await sessionAnchor();
  const pU = await pickScene('sweep4_unlocked');
  const V = await d.setView(0, 200, 1);
  const GF = await d.geometry('frame');
  const toggle = (await c.json('window.__dbg.overlays()')).showScreenFrame;
  const fU = await c.json('window.__dbg.aeon.screenFrame()');
  const gU = await c.json('window.__dbg.aeon.guides()');
  const frameClip = { x: GF.R.x, y: GF.R.y, w: Math.min(GF.R.w, 420), h: Math.min(GF.R.h - 40, 380) };
  const refF = await d.grab(frameClip, 'sf-ref-unlocked-no-frame');
  check('SF.0', 'CONTROL: the UNLOCKED scene (v_factor 0) picked by a real click, the frame toggle OFF: no frame is drawn',
    !!(pU && pU.hitOk) && toggle === false && gU.space === 'act' && fU.active === false,
    `dpr ${GF.R.dpr}; toggle ${toggle}; guides space ${gU.space}; frame ${J(fU)}; capture ${refF.path}`);
  const pF = await pickScene('ojz_act1_floor');
  await sleep(300);
  const docF = await sceneDoc('ojz_act1_floor');
  const fL = await c.json('window.__dbg.aeon.screenFrame()');
  const gL = await c.json('window.__dbg.aeon.guides()');
  const sess = (await c.json('window.__dbg.aeon.state()')) && await c.json('window.__dbg.view()');
  const shotF = await d.grab(frameClip, 'sf-locked-frame');
  // Expected rect: screenFrameRect(frameAnchorFor(locked, session)) =
  // ((session.x - vpX) * zoom, (v_offset - vpY) * zoom, 320 * zoom, 224 * zoom).
  const vo = docF ? docF.v_offset : null;
  const want0 = { x: (0 - V.x) * V.zoom, y: (vo - V.y) * V.zoom, w: fL.rect ? fL.rect.w : null, h: fL.rect ? fL.rect.h : null };
  const guideRows = (gL.rows || []).map((r) => Math.round(r.canvasY));
  const nearGuide = (cy) => guideRows.some((g) => Math.abs(cy - g) <= 3);
  const edge = (rect) => {
    // The right and bottom edges (the top coincides with a guide on this scene,
    // the left sits on the canvas border): stroke centred on round(x)+0.5 + w.
    const rx = Math.round(rect.x) + Math.round(rect.w); const by = Math.round(rect.y) + Math.round(rect.h);
    let n = 0; let ok = 0; let outN = 0; let outSame = 0; const bad = [];
    for (let cy = Math.round(rect.y) + 10; cy < by - 10; cy += 4) {
      if (nearGuide(cy)) continue;
      const X = Math.round(GF.R.x + rx); const Y = Math.round(GF.R.y + cy);
      const s0 = refF.px(X, Y); const s1 = shotF.px(X, Y); if (!s0 || !s1) continue;
      n++; const wnt = over(O.SCREEN_FRAME_LINE, O.SCREEN_FRAME_LINE.a, s0); if (dist(wnt, s1) <= 3) ok++; else if (bad.length < 3) bad.push({ X, Y, want: fmt(wnt), got: fmt(s1) });
      const o0 = refF.px(X + 3, Y); const o1 = shotF.px(X + 3, Y); if (o0 && o1) { outN++; if (dist(o0, o1) === 0) outSame++; }
    }
    for (let cx = Math.round(rect.x) + 20; cx < rx - 10; cx += 4) {
      const X = Math.round(GF.R.x + cx); const Y = Math.round(GF.R.y + by);
      const s0 = refF.px(X, Y); const s1 = shotF.px(X, Y); if (!s0 || !s1) continue;
      n++; const wnt = over(O.SCREEN_FRAME_LINE, O.SCREEN_FRAME_LINE.a, s0); if (dist(wnt, s1) <= 3) ok++; else if (bad.length < 6) bad.push({ X, Y, want: fmt(wnt), got: fmt(s1) });
      const o0 = refF.px(X, Y + 3); const o1 = shotF.px(X, Y + 3); if (o0 && o1) { outN++; if (dist(o0, o1) === 0) outSame++; }
    }
    return { n, ok, outN, outSame, bad, rx, by };
  };
  const eF = fL.rect ? edge(want0) : null;
  check('SF.a', `LOCKED scene, toggle still OFF: the frame is drawn (showFrame's guideSpace === 'screen' arm) at the rect derived from frameAnchorFor: x from the session anchor, y from the scene's v_offset ${vo}; on screen its right and bottom edges are SCREEN_FRAME_LINE over the reference, and 3 px outside is untouched`,
    !!(pF && pF.hitOk) && gL.space === 'screen' && fL.active === true && !!fL.anchor && fL.anchor.y === vo && fL.anchor.x === 0
      && !!fL.rect && Math.abs(fL.rect.x - want0.x) < 0.01 && Math.abs(fL.rect.y - want0.y) < 0.01 && !!eF && eF.n > 20 && eF.ok / eF.n >= 0.9 && eF.outN > 0 && eF.outSame === eF.outN,
    `scene v_offset ${vo}; frame report ${J(fL)}; want x ${want0.x} y ${want0.y}; view ${J(sess)}; edge ${J(eF)}; captures ${refF.path}, ${shotF.path}`);
  // The drag: the RIGHT edge (not near a guide), 24 right and 16 down.
  const gxF = Math.round(GF.R.x + fL.rect.x + fL.rect.w); const gyF = Math.round(GF.R.y + fL.rect.y + fL.rect.h / 2 + 30);
  const sessBefore = await c.json('window.__dbg.view()');
  const sfBefore = await c.json('window.__dbg.aeon.screenFrame()');
  await d.mouse('mouseMoved', gxF, gyF); await sleep(150);
  await d.mouse('mousePressed', gxF, gyF, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', gxF + 12, gyF + 8, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', gxF + 24, gyF + 16, 'left', 1); await sleep(200);
  const dragging = await c.json('window.__dbg.aeon.screenFrame()');
  await d.mouse('mouseReleased', gxF + 24, gyF + 16, 'left', 0); await sleep(400);
  const docF2 = await sceneDoc('ojz_act1_floor');
  const fL2 = await c.json('window.__dbg.aeon.screenFrame()');
  await d.mouse('mouseMoved', Math.round(GF.R.x + GF.R.w - 30), Math.round(GF.R.y + GF.R.h - 60)); await sleep(300);
  const shotF2 = await d.grab(frameClip, 'sf-locked-frame-after-drag');
  const wantVo = vo + Math.round(16 / V.zoom);
  const wantX = Math.round(24 / V.zoom);
  const rowNew = Math.round(GF.R.y + (wantVo - V.y) * V.zoom + fL.rect.h);
  const colNew = Math.round(GF.R.x + (wantX - V.x) * V.zoom + fL.rect.w);
  await d.chord('z', CTRL);
  const docF3 = await sceneDoc('ojz_act1_floor');
  const fL3 = await c.json('window.__dbg.aeon.screenFrame()');
  check('SF.b', `the LOCKED frame's Y IS the document: a real drag of its edge by (+24, +16) writes v_offset ${vo} -> ${wantVo} (endFrameDrag -> commitVOffset), the frame is redrawn there (its bottom edge on screen at row ${rowNew}), and ONE Ctrl+Z puts v_offset back`,
    dragging.dragging === true && !!docF2 && docF2.v_offset === wantVo && !!fL2.anchor && fL2.anchor.y === wantVo && fL2.anchor.x === wantX
      && dist(shotF2.px(colNew - 40, rowNew), over(O.SCREEN_FRAME_LINE, O.SCREEN_FRAME_LINE.a, refF.px(colNew - 40, rowNew) || { r: 0, g: 0, b: 0 })) <= 3
      && !!docF3 && docF3.v_offset === vo && !!fL3.anchor && fL3.anchor.y === vo,
    `press ${J({ x: gxF, y: gyF })}; mid-drag ${J(dragging)}; after release v_offset ${docF2 && docF2.v_offset}, frame ${J(fL2)}; bottom-edge pixel ${fmt(shotF2.px(colNew - 40, rowNew))}; `
    + `after Ctrl+Z v_offset ${docF3 && docF3.v_offset}, frame ${J(fL3)}; capture ${shotF2.path}`);
  const session1 = await sessionAnchor();
  note('SF.obs', `the SESSION anchor (read as the unlocked scene's frame with the toggle on): before the locked drag ${J(session0)}; after it (and its Ctrl+Z) ${J(session1)}. `
    + `Locked frame report before the drag ${J(sfBefore.anchor)} (view ${J(sessBefore)}), after release ${J(fL2.anchor)}. `
    + `endFrameDrag writes setScreenFrame(anchor.x, frameYIsVOffset(scene) ? startAnchor.y : anchor.y); startAnchor is the RESOLVED anchor, i.e. the v_offset at the press; `
    + `its comment reads "X always, and Y too when it is not the document's". Observed, not judged.`);

  // ── ESC: resolveEscape's lens arm ────────────────────────────────────────
  await d.setView(0, 0, 1);
  const GE = await d.geometry('escape');
  await d.realClick(String.raw`([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'BG' && b.getBoundingClientRect().width > 0) || null)`);
  await sleep(400);
  await d.blur();
  await d.namedKey('n', 'KeyN', 78);
  const toolE = (await d.st()).tool;
  const budget = await c.json('window.__dbg.aeon.bandBudget()');
  const cellE = await c.json(String.raw`(() => { const a = window.__dbg.aeon; const R = ${J(GE.R)};
    for (let i = 0; i < 4096; i++) { const w = a.bgOverrideLayoutAt(i); if (!w) continue; const slot = w & 0x7FF;
      if (slot >= ${budget.animatedSlots}) continue; const col = i % 64, row = Math.floor(i / 64);
      if (col < 12 || row < 2) continue; const x = R.x + col * 8 + 4, y = R.y + row * 8 + 4;
      if (x > R.x + R.w - 20 || y > R.y + R.h - 60) continue; return { cell: i, col, row, slot, x: Math.round(x), y: Math.round(y) }; }
    return null; })()`);
  if (!cellE) throw new Error(`no animated BG cell on screen (animated slots ${budget.animatedSlots})`);
  const pxRect = { x: cellE.x - 2, y: cellE.y - 2, w: 5, h: 5 };
  const offRef = await d.grab(pxRect, null);
  await d.clickAt({ x: cellE.x, y: cellE.y });
  const lit = await c.json('window.__dbg.aeon.bandLens()');
  const tgt = await c.json('window.__dbg.aeon.bandLensTarget()');
  const litShot = await d.grab(pxRect, null);
  const litCap = await d.grab({ x: cellE.x - 60, y: cellE.y - 40, w: 160, h: 80 }, 'esc-lens-lit');
  check('ESC.0', 'PREMISE: in the Effects facet the mark-band tool (a real `n`) and a REAL click on an animated BG cell light the lens on a band, and the clicked cell is washed on screen',
    toolE === 'mark-band' && lit.active === true && !!tgt && tgt.kind === 'band' && dist(litShot.px(cellE.x, cellE.y), offRef.px(cellE.x, cellE.y)) > 0,
    `dpr ${GE.R.dpr}; cell ${J(cellE)}; lens ${J(lit)}; target ${J(tgt)}; pixel off ${fmt(offRef.px(cellE.x, cellE.y))} lit ${fmt(litShot.px(cellE.x, cellE.y))}; capture ${litCap.path}`);
  await d.blur();
  await d.escape();
  const tgt2 = await c.json('window.__dbg.aeon.bandLensTarget()');
  const lens2 = await c.json('window.__dbg.aeon.bandLens()');
  const escShot = await d.grab(pxRect, null);
  const escCap = await d.grab({ x: cellE.x - 60, y: cellE.y - 40, w: 160, h: 80 }, 'esc-after-escape');
  check('ESC.a', 'ESCAPE in the Effects facet (no paste, no marquee): resolveEscape answers \'lens\', the target is cleared, the lens stops drawing, and the cell is byte-identical to its lens-off pixel',
    tgt2 === null && lens2.active === false && dist(escShot.px(cellE.x, cellE.y), offRef.px(cellE.x, cellE.y)) === 0,
    `target ${J(tgt2)}; lens ${J({ active: lens2.active })}; pixel ${fmt(escShot.px(cellE.x, cellE.y))} vs off ${fmt(offRef.px(cellE.x, cellE.y))}; capture ${escCap.path}`);
  // CONTROL: the arm's facet condition. Re-light, leave the facet, Escape there.
  await d.clickAt({ x: cellE.x, y: cellE.y });
  const tgt3 = await c.json('window.__dbg.aeon.bandLensTarget()');
  const lf = await d.realClick(d.FACET('Layout')); await sleep(600);
  await d.blur();
  await d.escape();
  const tgt4 = await c.json('window.__dbg.aeon.bandLensTarget()');
  await d.realClick(d.FACET('Effects')); await sleep(700);
  const lens5 = await c.json('window.__dbg.aeon.bandLens()');
  check('ESC.b', 'CONTROL: re-lit, then Escape pressed in the LAYOUT facet leaves the target standing (inEffectsFacet is false there), and back in Effects the lens is still drawn',
    !!tgt3 && !!(lf && lf.hitOk) && !!tgt4 && J(tgt4) === J(tgt3) && lens5.active === true,
    `re-lit ${J(tgt3)}; after Escape in Layout ${J(tgt4)}; lens back in Effects ${J({ active: lens5.active })}`);
  await d.blur();
  await d.escape();

  // ── BAND: the band preview (playAnimatedArt) ─────────────────────────────
  await d.chord('v');
  // The scene list is on the parallax sub-tab (dev run 4): pick first, then switch.
  const pickedBand = await pickScene('sweep4_unlocked');
  const sub = await d.realClick(`document.querySelector('[data-effects-sub-tab="tileAnim"]')`);
  await sleep(500);
  const sceneBand = await c.json('window.__dbg.aeon.selectedScene()');
  const pp = await c.json('window.__dbg.parallaxPreview()');
  const bands = await c.json('window.__dbg.aeon.bands()');
  const band0 = bands[0];
  if (!band0 || A_ANIMS(S).length === 0) throw new Error(`no band in the copy's bg override: ${J(bands)}`);
  const keyAt = (vx) => O.band.bandStepKey(O.band.bandPreviewStates(A_ANIMS(S), { cameraXPx: O.band.editorPanToCameraPx(vx), cameraYPx: 0, gameFrame: 0 }));
  const statesAt = (vx) => O.band.bandPreviewStates(A_ANIMS(S), { cameraXPx: O.band.editorPanToCameraPx(vx), cameraYPx: 0, gameFrame: 0 });
  const k1 = keyAt(0);
  let c2 = null; let c3 = null;
  for (let vx = 1; vx <= 1024 && (c2 === null || c3 === null); vx++) {
    const k = keyAt(vx);
    if (c2 === null && k !== k1) c2 = vx;
    if (c3 === null && k === k1 && vx >= 8) c3 = vx;
  }
  const layout = await c.json('(() => { const a = window.__dbg.aeon; const o = []; for (let i = 0; i < 4096; i++) o.push(a.bgOverrideLayoutAt(i)); return o; })()');
  await d.setView(0, 0, 1);
  const GBd = await d.geometry('band');
  // Cells on screen at every pan used, clear of the guides (rows < 200) and the label column.
  const pans = [0, c2, c3].filter((x) => x !== null);
  const maxPan = Math.max(...pans);
  const onAll = (col, row) => pans.every((vx) => col * 8 - vx >= 90 && col * 8 - vx + 8 <= GBd.R.w - 10) && row * 8 >= 240 && row * 8 + 8 <= GBd.R.h - 50;
  const bandCells = []; const staticCells = [];
  for (let i = 0; i < layout.length; i++) {
    const w = layout[i]; if (!w) continue; const col = i % 64; const row = Math.floor(i / 64);
    if (!onAll(col, row)) continue;
    const slot = w & 0x7FF;
    if (slot >= band0.slotBase && slot < band0.slotBase + band0.tileCount) bandCells.push({ i, col, row, slot });
    else if (slot >= budgetSlots(bands)) staticCells.push({ i, col, row, slot });
  }
  const capCells = async (vx, name) => {
    await d.setView(vx, 0, 1);
    await d.mouse('mouseMoved', Math.max(5, Math.round(GBd.R.x - 80)), Math.round(GBd.R.y + 100)); await sleep(350);
    const g = await d.grab({ x: GBd.R.x, y: GBd.R.y + 230, w: GBd.R.w, h: Math.max(20, GBd.R.h - 280) }, name);
    const read = (cellList) => cellList.map((q) => { const out = []; for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) { const p = g.px(Math.round(GBd.R.x + q.col * 8 - vx + xx), Math.round(GBd.R.y + q.row * 8 + yy)); out.push(p ? `${p.r},${p.g},${p.b}` : 'x'); } return out.join(';'); });
    return { band: read(bandCells), stat: read(staticCells), path: g.path };
  };
  const diffCount = (a, b) => a.reduce((n, v, k) => n + (v !== b[k] ? 1 : 0), 0);
  const ov0 = (await c.json('window.__dbg.overlays()')).playAnimatedArt;
  const off1 = await capCells(0, 'band-off-pan0');
  const off2 = await capCells(c2, `band-off-pan${c2}`);
  check('BAND.0', 'PREMISE: Effects facet on the tile-animation sub-tab (the parallax composite is off there), the BG plane from the OVERRIDE, the preview OFF, band 0\'s cells and static cells on screen at every pan used, and bandPreviewStates gives pan 0 and pan c2 different step keys and pan c3 the same one',
    !!(sub && sub.hitOk) && sceneBand === 'sweep4_unlocked' && pp.on === false && (await c.evalExpr('window.__dbg.aeon.bgSource()')) === 'override' && (await c.json('window.__dbg.aeon.selectedTile()')).layer === 'bg'
      && ov0 === false && bandCells.length > 0 && staticCells.length > 0 && c2 !== null && c3 !== null,
    `dpr ${GBd.R.dpr}; scene ${J(sceneBand)} (pick ${J(pickedBand && pickedBand.hitOk)}); parallaxPreview ${J(pp)}; band 0 ${J(band0)}; keys pan0 ${J(k1)} c2=${c2} ${J(c2 !== null ? keyAt(c2) : null)} c3=${c3} ${J(c3 !== null ? keyAt(c3) : null)}; band cells ${bandCells.length}, static cells ${staticCells.length}`);
  check('BAND.c', 'CONTROL, preview OFF: the band cells are pixel-identical at pan 0 and pan c2 (the plane alone is static in the world)',
    bandCells.length > 0 && diffCount(off1.band, off2.band) === 0 && diffCount(off1.stat, off2.stat) === 0,
    `changed band cells ${diffCount(off1.band, off2.band)}/${bandCells.length}, static ${diffCount(off1.stat, off2.stat)}/${staticCells.length}; captures ${off1.path}, ${off2.path}`);
  // ON, through the View menu (a real click on the menu, then on its row).
  await d.realClick(String.raw`([...document.querySelectorAll('button')].find((b) => /^\s*View\s*$/.test(b.textContent || '') ) || null)`);
  await sleep(400);
  const row = await d.realClick(String.raw`([...document.querySelectorAll('label')].find((l) => (l.textContent || '').trim() === 'Play animations') || null)`);
  await sleep(300);
  await d.realClick(String.raw`([...document.querySelectorAll('button')].find((b) => /^\s*View\s*$/.test(b.textContent || '') ) || null)`);
  await sleep(300);
  const ov1 = (await c.json('window.__dbg.overlays()')).playAnimatedArt;
  const on1 = await capCells(0, 'band-on-pan0');
  const on2 = await capCells(c2, `band-on-pan${c2}`);
  const on3 = await capCells(c3, `band-on-pan${c3}`);
  // Which cells SHOULD change between pan 0 and c2: the phase art of the slot
  // each draws (bandSlotSource under the state's coarse shift), bank vs bank.
  const s1 = statesAt(0)[0]; const s2 = statesAt(c2)[0];
  const bandDef = A_ANIMS(S)[0];
  const phaseDiff = await c.json(String.raw`(() => { const a = window.__dbg.aeon; const cells = ${J(bandCells.map((q) => q.slot - band0.slotBase))};
    const src = ${J(bandCells.map((q) => [O.band.bandSlotSource(q.slot - band0.slotBase, bandDef, s1.coarseColumns), O.band.bandSlotSource(q.slot - band0.slotBase, bandDef, s2.coarseColumns)]))};
    return cells.map((_, k) => { const t1 = a.bandPhaseTile(0, ${s1.bank}, src[k][0]); const t2 = a.bandPhaseTile(0, ${s2.bank}, src[k][1]);
      return JSON.stringify(t1) !== JSON.stringify(t2); }); })()`);
  const changed = on1.band.map((v, k) => v !== on2.band[k]);
  const expectChange = phaseDiff.filter(Boolean).length;
  const falseMoves = changed.filter((ch, k) => ch && !phaseDiff[k]).length;
  check('BAND.a', 'preview ON (View > Play animations, real clicks): between pan 0 and pan c2 the band cells whose phase art differs CHANGE on screen, no other band cell changes, and the static cells stay identical',
    ov1 === true && !!(row && row.hitOk) && expectChange > 0 && changed.filter(Boolean).length > 0 && falseMoves === 0 && diffCount(on1.stat, on2.stat) === 0,
    `states pan0 ${J({ step: s1.step, bank: s1.bank, coarse: s1.coarseColumns })} pan c2 ${J({ step: s2.step, bank: s2.bank, coarse: s2.coarseColumns })}; `
    + `cells whose phase art differs ${expectChange}/${bandCells.length}; changed on screen ${changed.filter(Boolean).length}; changed without a phase difference ${falseMoves}; static changed ${diffCount(on1.stat, on2.stat)}; captures ${on1.path}, ${on2.path}`);
  check('BAND.b', 'preview ON: pan 0 and pan c3 share a step key, and every band cell is identical between them',
    diffCount(on1.band, on3.band) === 0 && diffCount(on1.stat, on3.stat) === 0,
    `changed band cells ${diffCount(on1.band, on3.band)}; static ${diffCount(on1.stat, on3.stat)}; capture ${on3.path}`);

  // ── OBS.DPR: where the guide line lands at a scale factor of 1.35 ───────────
  await dprObservation(d, O, pickScene);
}
const A_ANIMS = (S) => S.A.anims;
/** The first static slot: the walk's tail (bandSlotBases' last entry). */
function budgetSlots(bands) { return bands.reduce((n, b) => n + b.tileCount, 0); }

async function dprObservation(d, O, pickScene) {
  const { c } = d;
  const native = await d.dpr();
  await d.realClick(`document.querySelector('[data-effects-sub-tab="parallax"]')`).catch(() => null);
  await pickScene('ojz_act1_start');
  await d.chord('v');
  await c.evalExpr("window.__dbg.aeon.setBandLensTarget(null)").catch(() => null);
  // Device rows of one screenshot column lit in the guide's cyan, as CSS rows
  // relative to the canvas top; device columns of one row lit in the frame's
  // orange, as CSS columns relative to the canvas left.
  const scanRows = async (G, name) => {
    const clip = { x: G.R.x + 280, y: G.R.y + 20, w: 40, h: 170 };
    const img = await d.grab(clip, name);
    const lit = []; const ix = Math.floor((G.R.x + 300 + 0.5 - clip.x) * img.ratio);
    for (let iy = 0; iy < img.img.h; iy++) {
      const o = (iy * img.img.w + ix) * 4; const p = { r: img.img.px[o], g: img.img.px[o + 1], b: img.img.px[o + 2] };
      if (Math.min(p.g, p.b) - p.r >= 60) lit.push(+((iy + 0.5) / img.ratio + clip.y - G.R.y).toFixed(2));
    }
    return { lit, path: img.path, ratio: img.ratio };
  };
  const scanCols = async (G, cssY, name) => {
    const clip = { x: G.R.x + 150, y: G.R.y + cssY - 2, w: 250, h: 5 };
    const img = await d.grab(clip, name);
    const lit = []; const iy = Math.floor((G.R.y + cssY + 0.5 - clip.y) * img.ratio);
    for (let ix = 0; ix < img.img.w; ix++) {
      const o = (iy * img.img.w + ix) * 4; const p = { r: img.img.px[o], g: img.img.px[o + 1], b: img.img.px[o + 2] };
      if (p.r >= 180 && p.r - p.b >= 100) lit.push(+((ix + 0.5) / img.ratio + clip.x - G.R.x).toFixed(2));
    }
    return { lit, path: img.path };
  };
  /** A press at a CSS row with nothing moved, released: which guide it grabbed. */
  const grabAt = async (G, cssY) => {
    const x = Math.round(G.R.x + 300); const y = Math.round(G.R.y + cssY);
    await d.mouse('mouseMoved', x, y); await sleep(150);
    // ⚠ DEV RUN 5: a press with no motion repaints nothing, so the report's
    // dragIndex stayed null even where the press grabbed. A 1 px nudge and back
    // (held) repaints; the release then commits nothing (worldY === start).
    await d.mouse('mousePressed', x, y, 'left', 1); await sleep(200);
    await d.mouse('mouseMoved', x, y + 1, 'left', 1); await sleep(300);
    const g = await c.json('window.__dbg.aeon.guides()');
    await d.mouse('mouseMoved', x, y, 'left', 1); await sleep(200);
    await d.mouse('mouseReleased', x, y, 'left', 0); await sleep(300);
    return { at: { x, y, cssY }, dragIndex: g.dragIndex, hoverIndex: g.hoverIndex, paints: g.paints };
  };
  // CONTROL at the native scale: the scan finds the guides where the hit test measures.
  await d.setView(0, 1, 1); await d.setView(0, 0, 1);
  const G0 = await d.geometry(`OBS.DPR control (native ${native})`);
  const g0 = await c.json('window.__dbg.aeon.guides()');
  const nat = await scanRows(G0, 'obs-dpr-native-guides');
  // The grab instrument's own control: at the native scale a press on layer 2's row grabs it.
  const grabNative = await grabAt(G0, g0.rows && g0.rows[2] ? g0.rows[2].canvasY : 80);
  const iw = await c.json('({ w: innerWidth, h: innerHeight })');
  const EMU = 1.35;
  await c.send('Emulation.setDeviceMetricsOverride', { width: iw.w, height: iw.h, deviceScaleFactor: EMU, mobile: false });
  await sleep(600);
  await d.setView(0, 1, 1); await d.setView(0, 0, 1);
  const G = await d.geometry(`OBS.DPR (EMULATED deviceScaleFactor ${EMU}; native ${native})`);
  const g = await c.json('window.__dbg.aeon.guides()');
  const row = g.rows && g.rows[2];
  const cssRow = row ? row.canvasY : null;
  const emu = await scanRows(G, 'obs-dpr-emulated-guides');
  const drawn = emu.lit.length ? emu.lit.reduce((b, y) => (Math.abs(y - cssRow / EMU) < Math.abs(b - cssRow / EMU) ? y : b), emu.lit[0]) : null;
  const grabDrawn = drawn !== null ? await grabAt(G, drawn) : null;
  const grabCss = await grabAt(G, cssRow);
  // The frame. ⚠ DEV RUN 3: an orange scan along a row found the whole row,
  // because the parallax composite paints art INSIDE the frame. So the
  // composite is switched off (the tile-animation sub-tab) and one row is
  // diffed between the unlocked scene (no frame, toggle off) and the locked
  // floor scene: the only columns that differ are the frame's vertical edges.
  void scanCols;
  // ⚠ DEV RUN 4: the scene list is on the PARALLAX sub-tab; picked from
  // tileAnim, nothing was picked (the frame report came back at y -200). Pick
  // there, then switch.
  const PARALLAX_TAB = `document.querySelector('[data-effects-sub-tab="parallax"]')`;
  const TILEANIM_TAB = `document.querySelector('[data-effects-sub-tab="tileAnim"]')`;
  await d.realClick(PARALLAX_TAB); await sleep(400);
  const pu = await pickScene('sweep4_unlocked');
  await d.realClick(TILEANIM_TAB); await sleep(400);
  await d.setView(0, 201, 1); await d.setView(0, 200, 1);
  const Gf = await d.geometry('OBS.DPR frame (EMULATED)');
  const rowY = 200;
  const rowClip = { x: Gf.R.x, y: Gf.R.y + rowY - 2, w: 420, h: 5 };
  const refRow = await d.grab(rowClip, 'obs-dpr-emulated-frame-ref');
  const sceneRef = await c.json('window.__dbg.aeon.selectedScene()');
  await d.realClick(PARALLAX_TAB); await sleep(400);
  const pf = await pickScene('ojz_act1_floor');
  await d.realClick(TILEANIM_TAB); await sleep(400);
  await d.setView(0, 201, 1); await d.setView(0, 200, 1);
  const sceneFr = await c.json('window.__dbg.aeon.selectedScene()');
  const RfNow = await d.canvasRect();
  note('OBS.DPR.frame.setup', `picks ${J({ unlocked: pu && pu.hitOk, floor: pf && pf.hitOk })}; scene for the reference ${J(sceneRef)}, for the frame ${J(sceneFr)}; `
    + `composite ${J(await c.json('window.__dbg.parallaxPreview()'))}; canvas then ${J(Gf.R)} now ${J(RfNow)}`);
  const fr = await c.json('window.__dbg.aeon.screenFrame()');
  const frameLeft = fr.rect ? fr.rect.x : null;
  const frameRight = fr.rect ? fr.rect.x + fr.rect.w : null;
  const frRow = await d.grab(rowClip, 'obs-dpr-emulated-frame');
  const cols = { lit: [], path: frRow.path };
  const iyR = Math.floor((Gf.R.y + rowY + 0.5 - rowClip.y) * frRow.ratio);
  for (let ix = 0; ix < frRow.img.w; ix++) {
    const o = (iyR * frRow.img.w + ix) * 4;
    if (frRow.img.px[o] !== refRow.img.px[o] || frRow.img.px[o + 1] !== refRow.img.px[o + 1] || frRow.img.px[o + 2] !== refRow.img.px[o + 2]) {
      cols.lit.push(+((ix + 0.5) / frRow.ratio + rowClip.x - Gf.R.x).toFixed(2));
    }
  }
  note('OBS.DPR.frame', `EMULATED: the frame report rect ${J(fr.rect)} (left CSS x ${frameLeft}, right ${frameRight}); columns of canvas row ${rowY} that differ between the unlocked and the locked scene: ${J(cols.lit)}; `
    + `identity-transform prediction left ${frameLeft !== null ? (frameLeft / EMU).toFixed(2) : 'n/a'}, right ${frameRight !== null ? (frameRight / EMU).toFixed(2) : 'n/a'}; captures ${refRow.path}, ${frRow.path}`);
  finding('OBS.DPR', `at an EMULATED scale factor of ${EMU} the guides and the screen frame are drawn where their hit tests measure (layerGuideGeometry canvasY, screenFrameRect, both in CSS pixels); redraw's docblock says "every line below it goes on drawing in CSS pixels", while drawLayerGuides and drawScreenFrame reset the transform to identity`,
    emu.lit.some((y) => Math.abs(y - cssRow) <= 1.5) && cols.lit.some((x) => Math.abs(x - frameRight) <= 1.5),
    `CONTROL at dpr ${G0.R.dpr}: guide rows (report) ${J(g0.rows && g0.rows.map((r) => r.canvasY))}, lit cyan ${J(nat.lit)} (${nat.path}), a press on layer 2's row ${J(grabNative)}. `
    + `EMULATED dpr ${G.R.dpr}: guide rows (report) ${J(g.rows && g.rows.map((r) => r.canvasY))}, lit cyan ${J(emu.lit)} (identity-transform prediction for layer 2 ${cssRow !== null ? (cssRow / EMU).toFixed(2) : 'n/a'}) (${emu.path}); `
    + `a press on the DRAWN line ${J(grabDrawn)}, a press on the row the hit test measures ${J(grabCss)}; `
    + `frame right edge (report) CSS x ${frameRight}, orange columns found ${J(cols.lit)} (identity prediction ${frameRight !== null ? (frameRight / EMU).toFixed(2) : 'n/a'}) (${cols.path})`);
  await c.send('Emulation.clearDeviceMetricsOverride');
  await sleep(600);
  await d.setView(0, 1, 1); await d.setView(0, 0, 1);
  note('OBS.DPR.restore', `emulation cleared: devicePixelRatio ${await d.dpr()} (native ${native}); canvas ${J(await d.canvasRect())}`);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok === true).length}/${results.length} rows had run: this is NOT a pass over the rows that never ran.`);
  console.log('END-OF-RUN');
  process.exit(2);
});
