#!/usr/bin/env node
// DOES THE VIEWPORT OCCLUDE OBJECT PREVIEWS THE WAY THE VDP DOES — AND KEEP
// THE HIDDEN PORTION DISCOVERABLE AS A GHOST — WITHOUT TOUCHING THE DOC?
//
// ROADMAP §5.1 item 7. The unit suite proves the per-pixel decision
// (core/level-classic/occlusion.ts), the priMask composition, and the pass
// structure (tagged fake canvases); none of that proves the REAL viewport
// paints the map pixel over a real monitor under real GHZ tree leaves. This
// drives the built app under xvfb over CDP (scaffold: s1-layout-anim-harness).
//
// THE TARGET IS FOUND BY SEARCH, NEVER HARDCODED: the harness bundles Aurora's
// own core (esbuild, same trick as scripts/render-classic-act.mjs), opens the
// same s1disasm the app opens, and searches GHZ act 1 for the pixel classes —
//   P_occ:     sprite opaque, tile HI, map opaque, map color ≠ sprite color
//   P_hitrans: sprite opaque, tile HI, map TRANSPARENT (per-pixel rule: a hi
//              tile's color-0 pixels must NOT erase the sprite)
//   P_free:    sprite opaque, tile LOW              (occlusion must not touch)
// P_occ and P_hitrans come from a monitor ($26) behind leaves (the owner's
// screenshot case — an invincibility monitor; the probe measured GHZ1 obj[12]
// $26 sub=$5 with 764 occluded px and ZERO low-tile pixels: the leaf canopy is
// solid hi-pri over the whole frame). P_free therefore comes from a NEARBY
// second object (any linked sprite, ring groups expanded) whose pixel sits on
// a LOW tile inside the same view — measured, never assumed.
//
// Rows:
//   (a) occlusion ON (the DEFAULT): P_occ shows the map pixel side of the
//       blend — it differs from the sprite color the flat composite shows, and
//       matches the expected ghost-over-map blend within tolerance.
//   (b) the ghost is PRESENT: P_occ differs from BOTH the plain-map render
//       (objects off) and the full-sprite render (occlusion off).
//   (c) hi-pri sprite pieces: measured over every linked object's mappings, NO
//       real act draws a resolvable hi-pri piece statically (Newtron frames
//       8/9 are anim-only and its curated preview is static; Wall of Lava /
//       Button / LZ Blocks pri pieces reference dynamically-loaded VRAM tiles
//       that render transparent) — the branch is proved in the unit suite
//       (object-sprite-pri.test.ts, classic-overlays-occlusion.test.ts row
//       're-raised ABOVE the ghost'). Reported as an explicit MEASURED-ABSENT
//       row here, not silently skipped.
//   (d) doc-hash sentinel: docHash identical before/after the whole session.
//   (e) cost: __auroraOcclPerf deltas over ~4s of free-running animated
//       playback (the pass runs per repaint; play makes repaints continuous).
//   (m) occlusion × animation, MZ act 1: MZ's lava/magma is largely HI-PRI and
//       ANIMATED (measured 4.9k hi-pri animated FG cells in act 1), so the
//       occluder must follow the play clock — a sprite pixel occluded by an
//       animated hi-pri cell shows the CURRENT frame's map pixel (frozen-clock
//       exact, expectations computed from animTilePatchesAt + renderChunk, the
//       same core the app patches with), not frozen frame-0 art.

import { spawn, execSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { build } from 'esbuild';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9409);
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const ELECTRON = [
  `${ROOT}/node_modules/.bin/electron`,
  join(ROOT, '../../..', 'node_modules/.bin/electron'),
].find(existsSync);
if (!ELECTRON) throw new Error('electron binary not found (npm install?)');
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const SHOTS = `${ROOT}/scratchpad/shots-occlusion`;
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(p, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: timeoutMs }, (res) => {
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

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  if (!r) return false;
  await mouse(c, 'mousePressed', r.x, r.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', r.x, r.y, { buttons: 0 });
  await sleep(250);
  return true;
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-occlusion/${name}.png`);
}

const CANVAS = `[...document.querySelectorAll('canvas')].sort((a,b) => b.width*b.height - a.width*a.height)[0]`;

/** Sample a w×h RGBA patch whose WORLD top-left is (lx, ly) (needs zoom 1). */
async function samplePatch(c, lx, ly, w, h) {
  return c.json(`(() => {
    const view = window.__dbg.view();
    const el = ${CANVAS};
    const cx = Math.round((${lx} - view.x) * view.zoom);
    const cy = Math.round((${ly} - view.y) * view.zoom);
    const cw = Math.round(${w} * view.zoom);
    const ch = Math.round(${h} * view.zoom);
    if (cx < 0 || cy < 0 || cx + cw > el.width || cy + ch > el.height) {
      throw new Error('patch (' + cx + ',' + cy + ' ' + cw + 'x' + ch + ') outside canvas ' + el.width + 'x' + el.height);
    }
    return [...el.getContext('2d').getImageData(cx, cy, cw, ch).data];
  })()`);
}

/** View-menu toggle by label prefix; returns the checkbox state after click. */
async function toggleMenu(c, labelPrefix) {
  const LABEL = `[...document.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(${JSON.stringify(labelPrefix)}))`;
  const opened = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('View'))`);
  if (!opened) throw new Error('View menu button not found');
  const clicked = await clickEl(c, LABEL);
  if (!clicked) throw new Error(`'${labelPrefix}' entry not in the open View menu`);
  const checked = await c.evalExpr(`(${LABEL}).querySelector('input').checked`);
  await mouse(c, 'mousePressed', 30, 500); await sleep(40);
  await mouse(c, 'mouseReleased', 30, 500, { buttons: 0 });
  await sleep(600); // depless render effect repaints on the store change
  return checked;
}

/** Freeze performance.now at its current value; window.__adv(ms) advances it. */
const FREEZE = `(() => {
  if (!window.__origNow) window.__origNow = performance.now.bind(performance);
  window.__t = window.__origNow();
  performance.now = () => window.__t;
  window.__adv = (ms) => { window.__t += ms; };
  return true;
})()`;
const UNFREEZE = `(() => { if (window.__origNow) performance.now = window.__origNow; return true; })()`;

/** Advance the frozen clock to game-frame t (+half a frame, so floor() is safe). */
async function advanceTo(c, fromT, toT) {
  await c.evalExpr(`window.__adv(${(((toT - fromT) * 1000) / 60).toFixed(3)})`);
  await sleep(300); // ≥2 real rAF ticks: play loop sees the step, redraw paints
}

async function openActReady(c, zone, act) {
  await c.evalExpr(`window.__dbg.openAct(${JSON.stringify(zone)}, ${act})`);
  for (let i = 0; i < 50; i++) {
    const lvl = await c.json('window.__dbg.levelState()');
    if (lvl.status === 'ready' && lvl.zone === zone && lvl.act === act) return lvl;
    await sleep(400);
  }
  throw new Error(`${zone}${act} never became ready`);
}

// ---------------------------------------------------------------------------
// Search half: bundle Aurora's core and derive the target monitor + expected
// colors from the SAME s1disasm data with the SAME code paths the app runs.
// ---------------------------------------------------------------------------
async function loadCore() {
  const entry = `
    export { s1Adapter } from ${JSON.stringify(join(ROOT, 'src/core/project/s1/index.ts'))};
    export { renderChunk } from ${JSON.stringify(join(ROOT, 'src/core/level-classic/render.ts'))};
    export { chunkPriorityMask, CHUNK_TILES } from ${JSON.stringify(join(ROOT, 'src/core/level-classic/priority-mask.ts'))};
    export { layoutCellAt, ringGroupPositions } from ${JSON.stringify(join(ROOT, 'src/renderer/components/classic/viewport-math.ts'))};
    export { renderResolvedObjectFrame, objectFrameRect } from ${JSON.stringify(join(ROOT, 'src/core/level-classic/object-sprite.ts'))};
    export { resolveObjectArt } from ${JSON.stringify(join(ROOT, 'src/core/project/profiles/s1-object-art.ts'))};
    export { resolveEffectiveObjectArt } from ${JSON.stringify(join(ROOT, 'src/core/project/profiles/object-subtype-rules.ts'))};
    export { indicesToRGBA } from ${JSON.stringify(join(ROOT, 'src/core/art/sprite-render.ts'))};
    export { decodeGenesisColor } from ${JSON.stringify(join(ROOT, 'src/core/formats/palette.ts'))};
    export { occlusionWinner } from ${JSON.stringify(join(ROOT, 'src/core/level-classic/occlusion.ts'))};
    export { animTilePatchesAt, animatedCellsForChunk, animatedTilesForZone, familiesForZone } from ${JSON.stringify(join(ROOT, 'src/core/level-classic/s1-anim-art.ts'))};
  `;
  const outfile = join(os.tmpdir(), `occl-core-${process.pid}.mjs`);
  await build({
    stdin: { contents: entry, resolveDir: ROOT, sourcefile: 'entry.ts', loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  rmSync(outfile, { force: true });
  return mod;
}

function realFs(root) {
  return {
    async exists(rel) { return fs.existsSync(path.join(root, rel)); },
    async read(rel) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel) { return fs.readdirSync(path.join(root, rel)); },
  };
}

/** Classify every opaque sprite pixel of one drawn frame at one anchor. */
function classifyPixels(core, doc, caches, frame, spriteRgba, rect, xflip, yflip) {
  const { chunkPriorityMask, CHUNK_TILES, layoutCellAt, renderChunk, occlusionWinner } = core;
  const maskFor = (id) => {
    if (!caches.mask.has(id)) caches.mask.set(id, chunkPriorityMask(doc, id));
    return caches.mask.get(id);
  };
  const rgbaFor = (id) => {
    let b = caches.rgba.get(id);
    if (!b) { b = renderChunk(doc, id); caches.rgba.set(id, b); }
    return b;
  };
  let pOcc = null, pFree = null, pHiTrans = null;
  for (let py = 0; py < frame.height; py++) {
    for (let px = 0; px < frame.width; px++) {
      const sx = xflip ? frame.width - 1 - px : px;
      const sy = yflip ? frame.height - 1 - py : py;
      const i = sy * frame.width + sx;
      if (frame.indices[i] === 0) continue;
      const sRGB = [spriteRgba[i * 4], spriteRgba[i * 4 + 1], spriteRgba[i * 4 + 2]];
      const wx = Math.round(rect.left) + px;
      const wy = Math.round(rect.top) + py;
      const col = Math.floor(wx / 256), row = Math.floor(wy / 256);
      const cell = layoutCellAt(doc.fg, col, row);
      if (cell === undefined) continue;
      const chunkId = cell & 0x7f;
      const mask = maskFor(chunkId);
      const lx = wx - col * 256, ly = wy - row * 256;
      const tileHi = mask ? mask[(ly >> 3) * CHUNK_TILES + (lx >> 3)] !== 0 : false;
      const rgba = rgbaFor(chunkId);
      const mo = (ly * 256 + lx) * 4;
      const mapOpaque = rgba[mo + 3] !== 0;
      const mRGB = [rgba[mo], rgba[mo + 1], rgba[mo + 2]];
      // The ONE rule, evaluated by the same core function the tests pin.
      const winner = occlusionWinner(false, tileHi, mapOpaque);
      if (winner === 'map') {
        // Require a clear color contrast so pixel assertions can't be vacuous.
        const d = Math.abs(mRGB[0] - sRGB[0]) + Math.abs(mRGB[1] - sRGB[1]) + Math.abs(mRGB[2] - sRGB[2]);
        if (!pOcc && d >= 60) pOcc = { wx, wy, sRGB, mRGB };
      } else if (tileHi && !mapOpaque) {
        if (!pHiTrans) pHiTrans = { wx, wy, sRGB };
      } else if (!tileHi) {
        if (!pFree) pFree = { wx, wy, sRGB };
      }
    }
  }
  return { pOcc, pFree, pHiTrans };
}

/** Render one placement's static frame the way the app does; null if unlinked. */
function renderPlacement(core, doc, obj, zone) {
  const { renderResolvedObjectFrame, resolveObjectArt, resolveEffectiveObjectArt, indicesToRGBA, decodeGenesisColor } = core;
  const base = resolveObjectArt(obj.id, zone);
  if (!base) return null;
  try {
    const { link, pieces } = resolveEffectiveObjectArt(obj.id, zone, obj.subtype, base);
    if (link.artSource !== 'file') return null; // keep the search simple: file-backed art only
    const artBytes = new Uint8Array(fs.readFileSync(path.join(S1DIR, link.artFile)));
    const mapText = fs.readFileSync(path.join(S1DIR, link.mapAsm), 'utf8');
    const frame = renderResolvedObjectFrame(
      { artSource: link.artSource, compression: link.compression, tileIndexOffset: link.tileIndexOffset, frame: link.frame, pieces },
      mapText, artBytes, null,
    );
    if (frame.width <= 0 || frame.height <= 0) return null;
    const line = doc.palettes[link.pal] ?? doc.palettes[0];
    const colors = [];
    for (let i = 0; i < 16; i++) colors.push(decodeGenesisColor(line[i] ?? 0));
    return { frame, spriteRgba: indicesToRGBA(frame.indices, colors) };
  } catch { return null; }
}

/**
 * Find (1) a monitor with P_occ + P_hitrans (the occluded case), and (2) a
 * NEARBY object pixel on a LOW tile (P_free) that shares one zoom-1 view.
 */
function findTarget(core, doc) {
  const { objectFrameRect, ringGroupPositions } = core;
  const caches = { mask: new Map(), rgba: new Map() };
  for (let oi = 0; oi < doc.objects.length; oi++) {
    const obj = doc.objects[oi];
    if (obj.id !== 0x26) continue;
    const r = renderPlacement(core, doc, obj, 'ghz');
    if (!r) continue;
    const rect = objectFrameRect(r.frame, obj.x, obj.y, obj.xflip, obj.yflip);
    const cls = classifyPixels(core, doc, caches, r.frame, r.spriteRgba, rect, obj.xflip, obj.yflip);
    if (!cls.pOcc || !cls.pHiTrans) continue;
    // Second half: the nearest other placement with a LOW-tile opaque pixel
    // inside the same view (≤ 900x550 world px of the monitor).
    for (let fi = 0; fi < doc.objects.length; fi++) {
      const fobj = doc.objects[fi];
      if (fi === oi) continue;
      if (Math.abs(fobj.x - obj.x) > 900 || Math.abs(fobj.y - obj.y) > 550) continue;
      const fr = renderPlacement(core, doc, fobj, 'ghz');
      if (!fr) continue;
      const anchors = fobj.id === 0x25 ? ringGroupPositions(fobj.subtype, fobj.x, fobj.y) : [{ x: fobj.x, y: fobj.y }];
      for (const a of anchors) {
        const frect = objectFrameRect(fr.frame, a.x, a.y, fobj.xflip, fobj.yflip);
        const fcls = classifyPixels(core, doc, caches, fr.frame, fr.spriteRgba, frect, fobj.xflip, fobj.yflip);
        if (fcls.pFree) {
          return {
            objIndex: oi, obj, rect, pOcc: cls.pOcc, pHiTrans: cls.pHiTrans,
            freeIndex: fi, freeObj: fobj, pFree: fcls.pFree,
          };
        }
      }
    }
  }
  return null;
}

/**
 * MZ half: find an occluded sprite pixel sitting on an ANIMATED hi-pri cell
 * whose map color CHANGES between clock t=0 and some small t — with the exact
 * expected colors at both, computed by patching a scratch pool with
 * animTilePatchesAt (the same core the app's play overlay patches with).
 */
function findAnimTarget(core, doc) {
  const {
    renderChunk, chunkPriorityMask, CHUNK_TILES, layoutCellAt, objectFrameRect,
    animTilePatchesAt, animatedCellsForChunk, animatedTilesForZone, familiesForZone,
  } = core;
  const sources = new Map();
  for (const f of familiesForZone('mz')) {
    if (!sources.has(f.file)) sources.set(f.file, new Uint8Array(fs.readFileSync(path.join(S1DIR, f.file))));
  }
  const animTiles = animatedTilesForZone('mz');
  const maskC = new Map();
  const maskFor = (id) => { if (!maskC.has(id)) maskC.set(id, chunkPriorityMask(doc, id)); return maskC.get(id); };
  const animCellsC = new Map();
  const animCellsFor = (id) => {
    if (!animCellsC.has(id)) animCellsC.set(id, new Set(animatedCellsForChunk(doc, id, animTiles).map((c) => c.cell)));
    return animCellsC.get(id);
  };
  // renderChunk at clock t, via a facade doc with a patched scratch pool.
  const rgbaAtT = new Map(); // `${t}:${chunkId}` → rgba
  const chunkAtT = (chunkId, t) => {
    const k = `${t}:${chunkId}`;
    let b = rgbaAtT.get(k);
    if (!b) {
      const scratch = doc.tiles.slice();
      for (const patch of animTilePatchesAt('mz', t, sources)) {
        const off = patch.start * 32;
        if (off + patch.bytes.length <= scratch.length) scratch.set(patch.bytes, off);
      }
      b = renderChunk({ ...doc, tiles: scratch }, chunkId);
      rgbaAtT.set(k, b);
    }
    return b;
  };
  for (let oi = 0; oi < doc.objects.length; oi++) {
    const obj = doc.objects[oi];
    if (obj.id === 0x25) continue; // rings animate themselves — keep the sprite static
    const r = renderPlacement(core, doc, obj, 'mz');
    if (!r) continue;
    const rect = objectFrameRect(r.frame, obj.x, obj.y, obj.xflip, obj.yflip);
    for (let py = 0; py < r.frame.height; py++) {
      for (let px = 0; px < r.frame.width; px++) {
        const sx = obj.xflip ? r.frame.width - 1 - px : px;
        const sy = obj.yflip ? r.frame.height - 1 - py : py;
        const i = sy * r.frame.width + sx;
        if (r.frame.indices[i] === 0) continue;
        const sRGB = [r.spriteRgba[i * 4], r.spriteRgba[i * 4 + 1], r.spriteRgba[i * 4 + 2]];
        const wx = Math.round(rect.left) + px;
        const wy = Math.round(rect.top) + py;
        const col = Math.floor(wx / 256), row = Math.floor(wy / 256);
        const cell = layoutCellAt(doc.fg, col, row);
        if (cell === undefined) continue;
        const chunkId = cell & 0x7f;
        const mask = maskFor(chunkId);
        const lx = wx - col * 256, ly = wy - row * 256;
        if (!mask || mask[(ly >> 3) * CHUNK_TILES + (lx >> 3)] === 0) continue;
        if (!animCellsFor(chunkId).has(((ly >> 4) * 16) + (lx >> 4))) continue;
        const mo = (ly * 256 + lx) * 4;
        const r0 = chunkAtT(chunkId, 0);
        if (r0[mo + 3] === 0) continue;
        const m0 = [r0[mo], r0[mo + 1], r0[mo + 2]];
        // sprite↔map contrast at t=0 so "occluded, not sprite" is assertable
        if (Math.abs(m0[0] - sRGB[0]) + Math.abs(m0[1] - sRGB[1]) + Math.abs(m0[2] - sRGB[2]) < 60) continue;
        for (let t = 1; t <= 48; t++) {
          const rt = chunkAtT(chunkId, t);
          if (rt[mo + 3] === 0) continue;
          const mt = [rt[mo], rt[mo + 1], rt[mo + 2]];
          if (Math.abs(mt[0] - m0[0]) + Math.abs(mt[1] - m0[1]) + Math.abs(mt[2] - m0[2]) >= 60) {
            // The STATIC pool (unpatched doc.tiles) is what occludes while play
            // is OFF — for MZ it is NOT the same as clock t=0 (the pool ships
            // holding an arbitrary resting state), so expect it separately;
            // it may even be transparent (→ the sprite shows un-occluded).
            const rs = renderChunk(doc, chunkId);
            const staticOpaque = rs[mo + 3] !== 0;
            const mStatic = staticOpaque ? [rs[mo], rs[mo + 1], rs[mo + 2]] : null;
            return { objIndex: oi, obj, wx, wy, sRGB, m0, t, mt, mStatic };
          }
        }
      }
    }
  }
  return null;
}

const eqRGB = (patchPix, rgb, tol = 0) =>
  Math.abs(patchPix[0] - rgb[0]) <= tol && Math.abs(patchPix[1] - rgb[1]) <= tol && Math.abs(patchPix[2] - rgb[2]) <= tol;

/** Expected occluded-pixel color: violet-tinted ghost at 0.4 over the map pixel.
 *  ghost = 0.55*violet + 0.45*sprite (source-atop), final = 0.4*ghost + 0.6*map. */
function expectedOccluded(sRGB, mRGB) {
  const V = [200, 90, 255];
  return [0, 1, 2].map((i) => Math.round(0.4 * (0.55 * V[i] + 0.45 * sRGB[i]) + 0.6 * mRGB[i]));
}

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS.
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} \\( -name '*.ts' -o -name '*.tsx' \\) -print0 | xargs -0 stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }

  // ---- search half (no app yet): derive the target from the real data ------
  const core = await loadCore();
  const handle = await core.s1Adapter.open(realFs(S1DIR));
  const ref = handle.levels.list().find((r) => r.zone.toLowerCase() === 'ghz' && r.act === 1);
  const doc = await handle.levels.read(ref);
  const target = findTarget(core, doc);
  check('search', 'GHZ1 has an occluded monitor + a nearby low-tile object pixel (found by search)',
    target !== null,
    target ? `monitor obj[${target.objIndex}] $26 sub=$${target.obj.subtype.toString(16)} at (${target.obj.x},${target.obj.y}); `
      + `P_occ=(${target.pOcc.wx},${target.pOcc.wy}) sprite=[${target.pOcc.sRGB}] map=[${target.pOcc.mRGB}]; `
      + `P_hitrans=(${target.pHiTrans.wx},${target.pHiTrans.wy}); `
      + `P_free=(${target.pFree.wx},${target.pFree.wy}) from obj[${target.freeIndex}] $${target.freeObj.id.toString(16)}`
      : 'none found');
  if (!target) throw new Error('cannot continue without a target');
  const { pOcc, pFree, pHiTrans } = target;

  // MZ half: occluded sprite pixel on an ANIMATED hi-pri cell, with exact
  // expected map colors at clock t=0 and at the first t where it changes.
  const mzRef = handle.levels.list().find((r) => r.zone.toLowerCase() === 'mz' && r.act === 1);
  const mzDoc = await handle.levels.read(mzRef);
  const animTarget = findAnimTarget(core, mzDoc);
  check('search-mz', 'MZ1 has an occluded sprite pixel on an ANIMATED hi-pri cell whose map color steps (found by search)',
    animTarget !== null,
    animTarget ? `obj[${animTarget.objIndex}] $${animTarget.obj.id.toString(16)} at (${animTarget.obj.x},${animTarget.obj.y}); `
      + `P_anim=(${animTarget.wx},${animTarget.wy}) sprite=[${animTarget.sRGB}] map(t0)=[${animTarget.m0}] map(t=${animTarget.t})=[${animTarget.mt}]`
      : 'none found');

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const evalRetry = async (expr, tries = 40) => {
      for (let i = 0; ; i++) {
        try { return await c.evalExpr(expr); } catch (e) {
          if (i >= tries) throw e;
          await sleep(500);
        }
      }
    };
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await evalRetry('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    await evalRetry(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let lvl = null;
    for (let i = 0; i < 50; i++) {
      lvl = await c.json('window.__dbg.levelState()');
      if (lvl.status === 'ready') break;
      await sleep(400);
    }
    check('setup', 'project opened and an act is ready', lvl?.status === 'ready', JSON.stringify(lvl));
    const ghz = await openActReady(c, 'ghz', 1);
    check('1', 'GHZ act 1 loads', ghz.status === 'ready', JSON.stringify(ghz));
    await sleep(1800); // static object sprites finish loading

    // Corroborate the search against the LIVE doc (same monitor placed there).
    const monitors = await c.json('window.__dbg.classic.listObjects(0x26)');
    const liveHasTarget = monitors.some((m) => m.x === target.obj.x && m.y === target.obj.y && m.subtype === target.obj.subtype);
    check('2', "the searched monitor exists in the app's live doc", liveHasTarget,
      `live monitors=${monitors.length}, target at (${target.obj.x},${target.obj.y})`);

    // Zoom 1 (1 world px = 1 canvas px), view covering all three points.
    const pts = [pOcc, pHiTrans, pFree];
    const minX = Math.min(...pts.map((p) => p.wx));
    const minY = Math.min(...pts.map((p) => p.wy));
    await c.evalExpr(`window.__dbg.setView(${Math.max(0, minX - 80)}, ${Math.max(0, minY - 80)}, 1)`);
    await sleep(900);
    const docBefore = await c.evalExpr('window.__dbg.classic.docHash()');

    /** One canvas pixel's [r,g,b] at world (wx, wy). */
    const pixel = async (wx, wy) => (await samplePatch(c, wx, wy, 1, 1)).slice(0, 3);

    // ---- DEFAULT view = occlusion ON ---------------------------------------
    const dfltOcc = await pixel(pOcc.wx, pOcc.wy);
    await shot(c, 'occlusion-on-default');

    // ---- occlusion OFF = the flat composite --------------------------------
    const occOff = await toggleMenu(c, 'Sprite occlusion');
    check('3', "toggling 'Sprite occlusion' OFF unchecks (it was ON by default)", occOff === false);
    const flatOcc = await pixel(pOcc.wx, pOcc.wy);
    await shot(c, 'occlusion-off-flat');
    check('4', 'flat composite shows the SPRITE color at P_occ (anti-vacuous baseline)',
      eqRGB(flatOcc, pOcc.sRGB, 2), `flat=${flatOcc} expected sprite=${pOcc.sRGB}`);
    const flatFree = await pixel(pFree.wx, pFree.wy);
    const flatHiTrans = await pixel(pHiTrans.wx, pHiTrans.wy);
    check('5', 'flat composite shows the sprite at P_free and P_hitrans too',
      eqRGB(flatFree, pFree.sRGB, 2) && eqRGB(flatHiTrans, pHiTrans.sRGB, 2),
      `free=${flatFree} vs ${pFree.sRGB}; hitrans=${flatHiTrans} vs ${pHiTrans.sRGB}`);

    // ---- objects OFF = the plain map ---------------------------------------
    const objsOff = await toggleMenu(c, 'Objects');
    check('6', "'Objects' toggles off", objsOff === false);
    const plainOcc = await pixel(pOcc.wx, pOcc.wy);
    check('7', 'plain map shows the MAP color at P_occ (the leaves pixel really is there)',
      eqRGB(plainOcc, pOcc.mRGB, 2), `map=${plainOcc} expected=${pOcc.mRGB}`);
    const objsOn = await toggleMenu(c, 'Objects');
    check('8', "'Objects' back on", objsOn === true);

    // ---- occlusion ON ------------------------------------------------------
    const occOn = await toggleMenu(c, 'Sprite occlusion');
    check('9', "'Sprite occlusion' back ON", occOn === true);
    await shot(c, 'occlusion-on');
    const got = await pixel(pOcc.wx, pOcc.wy);
    const exp = expectedOccluded(pOcc.sRGB, pOcc.mRGB);
    check('a1', '(a) P_occ no longer shows the sprite color — the map pixel side won',
      !eqRGB(got, pOcc.sRGB, 8), `got=${got} sprite=${pOcc.sRGB}`);
    check('a2', '(a) P_occ matches the expected ghost-over-map blend (±6/channel)',
      eqRGB(got, exp, 6), `got=${got} expected=${exp} (sprite=${pOcc.sRGB} map=${pOcc.mRGB})`);
    check('b1', '(b) the ghost is PRESENT: P_occ differs from the plain-map pixel too',
      !eqRGB(got, pOcc.mRGB, 4), `got=${got} plainMap=${pOcc.mRGB}`);
    const occFree = await pixel(pFree.wx, pFree.wy);
    check('a3', '(a) P_free is untouched — occlusion never erases sprite pixels on LOW tiles',
      eqRGB(occFree, pFree.sRGB, 2), `got=${occFree} sprite=${pFree.sRGB}`);
    const occHiTrans = await pixel(pHiTrans.wx, pHiTrans.wy);
    check('a4', "(a) P_hitrans is untouched — a hi tile's TRANSPARENT pixels do not occlude (per-pixel, not per-tile)",
      eqRGB(occHiTrans, pHiTrans.sRGB, 2), `got=${occHiTrans} sprite=${pHiTrans.sRGB}`);
    check('a5', 'the default view (before any toggling) was ALREADY the occluded one',
      eqRGB(dfltOcc, got, 2), `default=${dfltOcc} occluded=${got}`);

    // ---- (c): hi-pri sprite pieces — measured absent in real acts ----------
    note('c', 'hi-pri sprite pieces: MEASURED ABSENT in real static previews '
      + '(probe over every linked mapping: only Newtron anim frames 8/9 have resolvable pri pieces, '
      + 'and Newtron\'s curated preview is static; Wall of Lava/Button/LZ Blocks pri pieces point at '
      + 'dynamically-loaded VRAM tiles). The branch is proved in the unit suite: '
      + 'object-sprite-pri.test.ts (mask) + classic-overlays-occlusion.test.ts (re-raise above ghost).');

    // ---- perf meter over free-running playback -----------------------------
    const perf0 = await c.json('window.__auroraOcclPerf ?? {draws:0,sumMs:0,maxMs:0,builds:0}');
    check('10', 'the occlusion cost meter is LIVE (draws > 0 from the toggling above)',
      perf0.draws > 0, JSON.stringify(perf0));
    const playOn = await toggleMenu(c, 'Play anim');
    const runT0 = Date.now();
    await sleep(4000);
    const uptimeMs = Date.now() - runT0;
    const perf1 = await c.json('window.__auroraOcclPerf ?? {draws:0,sumMs:0,maxMs:0,builds:0}');
    const dDraws = perf1.draws - perf0.draws;
    const dSum = perf1.sumMs - perf0.sumMs;
    console.log(`        occlusion pass: ${dDraws} draws over ${(uptimeMs / 1000).toFixed(1)}s uptime, `
      + `avg ${(dSum / Math.max(1, dDraws)).toFixed(3)}ms, max ${perf1.maxMs.toFixed(2)}ms, hi-pri canvas builds ${perf1.builds}`);
    check('11', 'occlusion pass runs per repaint under playback and holds budget (avg < 5ms)',
      playOn === true && dDraws > 0 && dSum / Math.max(1, dDraws) < 5,
      `avg ${(dSum / Math.max(1, dDraws)).toFixed(3)}ms over ${dDraws} draws`);
    const playOff = await toggleMenu(c, 'Play anim');
    check('12', 'playback back off', playOff === false);
    await sleep(400);

    // ---- (d): doc untouched ------------------------------------------------
    const docAfter = await c.evalExpr('window.__dbg.classic.docHash()');
    check('d', '(d) the document is UNTOUCHED by the whole occlusion session (docHash sentinel)',
      docAfter === docBefore, `before=${docBefore} after=${docAfter}`);

    // ---- (m): occlusion × animation in MZ ----------------------------------
    if (animTarget) {
      const mz = await openActReady(c, 'mz', 1);
      check('m1', 'MZ act 1 loads', mz.status === 'ready', JSON.stringify(mz));
      await sleep(1800); // static object sprites finish loading
      await c.evalExpr(`window.__dbg.setView(${Math.max(0, animTarget.wx - 400)}, ${Math.max(0, animTarget.wy - 300)}, 1)`);
      await sleep(900);
      const mzDocBefore = await c.evalExpr('window.__dbg.classic.docHash()');
      const expect0 = expectedOccluded(animTarget.sRGB, animTarget.m0);
      const expectT = expectedOccluded(animTarget.sRGB, animTarget.mt);
      // Play OFF: the occluder is the STATIC pool art — measured separately
      // from clock t=0 (MZ's pool ships holding an arbitrary resting state; at
      // the found pixel it may even be transparent, in which case the sprite
      // legitimately shows un-occluded until play starts).
      const expectStatic = animTarget.mStatic
        ? expectedOccluded(animTarget.sRGB, animTarget.mStatic)
        : animTarget.sRGB;
      const mzStatic = await pixel(animTarget.wx, animTarget.wy);
      check('m2', `play OFF: the pixel matches the STATIC pool verdict (${animTarget.mStatic ? 'occluded blend' : 'transparent static art → sprite shows'}, ±6)`,
        eqRGB(mzStatic, expectStatic, 6), `got=${mzStatic} expected=${expectStatic} (sprite=[${animTarget.sRGB}] mapStatic=${animTarget.mStatic ? `[${animTarget.mStatic}]` : 'transparent'})`);
      await shot(c, 'mz-anim-occluder-static');
      // Frozen clock, play ON.
      await c.evalExpr(FREEZE);
      const mzPlayOn = await toggleMenu(c, 'Play anim');
      check('m3', "MZ 'Play animations' checks on", mzPlayOn === true);
      await sleep(600);
      const mzT0 = await pixel(animTarget.wx, animTarget.wy);
      check('m4', 'frozen t=0: the occluder is the clock-t0 blend (play starts at level init, NOT the resting pool state)',
        eqRGB(mzT0, expect0, 6), `got=${mzT0} expected=${expect0}`);
      await advanceTo(c, 0, animTarget.t + 0.5);
      const mzTn = await pixel(animTarget.wx, animTarget.wy);
      await shot(c, `mz-anim-occluder-t${animTarget.t}`);
      check('m5', `frozen t=${animTarget.t}: the occluder FOLLOWS the animation — current-frame map pixel over the sprite (±6)`,
        eqRGB(mzTn, expectT, 6), `got=${mzTn} expected=${expectT} (map stepped [${animTarget.m0}] → [${animTarget.mt}])`);
      check('m6', 'and it genuinely changed from the t=0 blend (anti-vacuous)',
        !eqRGB(mzTn, mzT0, 6), `t0=${mzT0} tN=${mzTn}`);
      const mzPlayOff = await toggleMenu(c, 'Play anim');
      await c.evalExpr(UNFREEZE);
      await sleep(500);
      const mzBack = await pixel(animTarget.wx, animTarget.wy);
      check('m7', 'play OFF again: back to the static-pool verdict',
        mzPlayOff === false && eqRGB(mzBack, expectStatic, 6), `got=${mzBack} expected=${expectStatic}`);
      const mzDocAfter = await c.evalExpr('window.__dbg.classic.docHash()');
      check('m8', 'MZ document untouched by the animated-occluder session',
        mzDocAfter === mzDocBefore, `before=${mzDocBefore} after=${mzDocAfter}`);
    }
  } finally {
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* */ }
      await sleep(2500);
      try { c.close(); } catch { /* */ }
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
    await sleep(1000);
    console.log(`\nport free after teardown: ${await portFree()}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
