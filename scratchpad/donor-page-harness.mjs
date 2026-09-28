#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// S2-DONOR-PAGE, 2026-09-25: open a converted donor zone, marquee it, paste it
// into a clip act, and undo the paste, in the RUNNING app, on a COPY of aeon,
// on a private virtual display. Plan: docs/superpowers/plans/2026-09-25-s2-donor-page.md.
// ═══════════════════════════════════════════════════════════════════════════
//
// ROWS (each prints PASS / FAIL / UNMS with the numbers it compared):
//   DP.0  setup: the copy opens, and a real click on the Donors pill shows the page.
//   DP.1  ABSENT: the copy has no donors/ (checked on disk) and the page says so,
//         naming the converter command EXACTLY as the tree's CONVERTER_COMMAND
//         spells it, and the directory to run it in.
//   DP.2  the harness runs that command in the copy; a real click on "Look again"
//         lists every zone it wrote (read back from disk, not from the app).
//   DP.3  a real click opens EHZ; the page DREW it: per section, pixels drawn iff
//         zone.json says the section has painted cells, and the donor canvas,
//         read back with getImageData, is non-blank inside the crop.
//   DP.4  a real drag marquees; the rectangle is the tree's own marqueeRect of
//         the world points the integer aims map back to, every coordinate a
//         multiple of 8, inside the crop, and the readout says it.
//   DP.5  real clicks and keys start a new clip act.
//   DP.6  a real click on Paste writes clips.json: READ FROM DISK it holds exactly
//         the clip (no region_id), aeon's own loader accepts the file on disk,
//         and aeon's own bake of that file puts the donor's words AND both
//         collision planes at the destination, byte for byte against the donor's
//         section files, both read from disk by this harness.
//   DP.7  a real click places a second paste over the first; aeon REFUSES it
//         (R10) and the page shows aeon's words; clips.json on disk is unchanged.
//   DP.8  a real Ctrl+Z undoes the paste (the file it created is gone from disk);
//         a real click on Redo writes the same bytes back.
//   ROW 213 (aeon 1d9afb25) adds two:
//   DP.6e the readout's per-clip pool grid shows, cell for cell, the pool.per_clip
//         row of the clipact.json the HARNESS's own bake of the file on disk
//         wrote; each column's tooltip is that file's per_clip_fields meaning;
//         the note names the act's pool.tiles and pool.pages; nothing is totalled.
//   DP.7s the R10 refusal is shown STRUCTURALLY: the rule tag reads R10 and the
//         subjects name both clips, first claimant first, ids read from the file
//         on disk and the draft (not from the app's store).
//   ROW 222 (open half) and ROW 213 (b), 2026-09-28, add:
//   DP.5s before the first paste the form names the song the paste inherits: for
//         a new act, "none inherited" and why (the tree's zoneSongLine of the
//         act, and the harness sees the act has no file on disk).
//   DP.6s the success summary repeats that sentence word for word.
//   DP.7o the R10 refusal outlines BOTH subjects on the target pane: the pane's
//         own paint report carries two dashed warning outlines tagged R10 at the
//         clip on disk and the draft; the CANVAS, read back along the refused
//         rectangle's top edge, shows the warning colour in dashes, where the
//         same edge read just before the refusal showed none (the control).
//   DP.7l leaving the page (real clicks: another facet pill, then Donors) clears
//         the refusal and its outlines, canvas read back again.
//   DP.7e the same paste refused again (anti-vacuous for this row), then a REAL
//         edit of the clip id clears it, canvas read back again.
//   DP.9s a real click on the copy's s2_ehz_cpz act: the form names the song its
//         EHZ clips carry, read by the harness from that clips.json on disk.
//   DP.10 A REAL BAKE REFUSAL ON SCREEN (the row the bake-json packet booked):
//         the harness paints the copy's EHZ collision (aeon's own C4 paint: the
//         reserved bits 15:14 on one cell inside the marquee, both planes), then
//         a real paste into a fresh act passes aeon's loader and is REFUSED by
//         aeon's BAKE: the page shows stage bake, the rule and the clip exactly
//         as the harness's OWN bake --json of the same manifest names them, the
//         clip is outlined dashed with that rule, and nothing is written.
//   DP.10t the rule tag is drawn UNDER the clip's id label, not over it: the
//         canvas read back in the id label's band holds no warning pixel and
//         the band below it does (found by eye in this parcel's first shot,
//         where "C4" printed over "ehz_2x").
//   ROW 219 (a), 2026-09-28: the REAL s2_ehz_cpz act (aeon's own clips.json in
//   the copy, chosen by DP.9s's real click), not an act the harness built:
//   DP.11a the act list names every clip act in the copy (read from its disk),
//         and the facts line is that clips.json's grid, clip and corridor counts.
//   DP.11b the target pane holds the whole act (both world corners in view) and
//         drew it from aeon's bake: a section drew iff the harness's OWN bake of
//         the file paints a cell there; the canvas, read back per section, is
//         non-blank over every painted section and blank over every section no
//         clip or corridor rectangle touches.
//   DP.11c aeon's readout is the harness's own bake: the act line (pool tiles,
//         pages, worst window, collision entries), the pool grid cell for cell
//         over every clip and corridor, aeon's tile sum holding, and one
//         collision line per clip. SHOT_DIR saves donor-page-real-s2_ehz_cpz.png.
//   ROW 235 (a), 2026-09-28: the drafted paste belongs to ONE act:
//   DP.6n after the first paste fills the one-section act, no section origin
//         is free for the marquee (the harness finds none, from the clips.json on
//         disk): the draft has no destination, the pane draws no accent outline,
//         Paste is disabled, and the form SAYS so (data-donors-no-free, naming
//         the act and the rectangle's size).
//   DP.11d the draft DP.7 placed by a click on hx_donor_act, carried into the
//         real click on s2_ehz_cpz, where it would overlap a rectangle on disk
//         (checked first; UNMEASURABLE if not): it is re-placed at the harness's
//         OWN first free section origin, row by row, over every clip, corridor
//         and shaft in that clips.json; the pane's accent outline and the Place
//         at fields say the same spot; a REAL click on Paste is not refused and
//         writes that dst_rect (read from disk); a real click on Undo puts the
//         file back byte for byte. DP.11b's "untouched sections are blank"
//         leaves out the sections the draft's own outline touches.
//
// EXPECTATIONS COME FROM THE TREE: CONVERTER_COMMAND, marqueeRect, marqueeReadout,
// clipsManifestPath and suggestDestination are bundled from the tree under test
// with esbuild and CALLED; zone.json and every section file are read from the
// copy's disk. Every aim is an INTEGER client pixel, derived back to a world
// point through the pane's own published view and rect, printed with dpr.
//
// NO EMULATOR, EVER. NOTHING WRITES OUTSIDE THE COPY: the copy is a fresh
// mkdtemp per run made from AEON_DIR, which must itself be a copy (the harness
// refuses the live sibling); the converter, the paste and the bakes all run in
// it; it is deleted at the end (KEEP_COPY=1 keeps it). Cleanup by PID:
// spawnGuarded + await killTree.
//
// RUN (from a worktree, BOTH variables, or the main checkout's dist answers):
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a copy of aeon> AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<electron> \
//     node scratchpad/donor-page-harness.mjs

import { AURORA_DIR, siblingDefaultPath, checkoutOverride, siblingRoot, SUITE_ROOT_ENV } from '../test/support/sibling-root.mjs';
import { readFileSync, existsSync, cpSync, mkdtempSync, rmSync, realpathSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree, RUN_PROFILE_DIR } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const ROOT = AURORA_DIR;
const HERE = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const RUN = announceRunRoot(runTarget(ROOT));
assertFreshBuild(RUN);
assertDebugBuild(RUN);
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const PORT = Number(process.env.PORT ?? 9447);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);
const uptime = () => String(spawnSync('uptime', { encoding: 'utf8' }).stdout || '').trim();
const sha = (b) => createHash('sha256').update(b).digest('hex');

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
const SUITE = siblingRoot();
if (!SUITE) {
  console.log(`HARNESS REFUSES: no suite root (${SUITE_ROOT_ENV}); aeon's tools in a copy outside it cannot find their donors.`);
  process.exit(2);
}
/** A fresh copy per run, WITHOUT donors/ (so the absent state is real) and
 *  without .git, .claude or any bake output. */
function makeCopy() {
  const dir = realpathSync(mkdtempSync(join(os.tmpdir(), 'donor-page-aeon-')));
  cpSync(AEON.value, dir, {
    recursive: true,
    filter: (src) => {
      const rel = relative(AEON.value, src);
      const segs = rel.split('/');
      if (segs.some((s) => s === '.git' || s === '.claude' || s === 'baked')) return false;
      return !(rel === 'games/sonic4/data/donors' || rel.startsWith('games/sonic4/data/donors/'));
    },
  });
  if (LIVE_AEON && samePath(dir, LIVE_AEON)) throw new Error('refusing: the copy resolved to the live tree');
  return dir;
}
const SOCK_DIR = mkdtempSync(join(os.tmpdir(), 'donor-page-sock-'));
const SOCK = join(SOCK_DIR, 'o.sock');

// ═══ THE ORACLE: the tree's own functions, bundled and called ══════════════
const git = (...args) => spawnSync('git', ['-C', RUN.root, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
const HEAD_SHA = git('rev-parse', 'HEAD').stdout.trim();
async function loadOracle() {
  const req = createRequire(`${RUN.root}/package.json`);
  const esb = req('esbuild');
  const bundle = async (p) => {
    const r = esb.buildSync({ entryPoints: [`${RUN.root}/${p}`], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' });
    return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
  };
  const tree = await bundle('src/core/formats/donors/donor-tree.ts');
  const marq = await bundle('src/core/formats/donors/donor-marquee.ts');
  const doc = await bundle('src/core/formats/donors/clip-manifest-doc.ts');
  for (const [m, f] of [[tree, 'CONVERTER_COMMAND'], [tree, 'parseZoneManifest'], [marq, 'marqueeRect'], [marq, 'marqueeReadout'],
    [doc, 'clipsManifestPath'], [doc, 'suggestDestination'], [doc, 'newClipManifest'], [doc, 'zoneSong'], [doc, 'zoneSongLine']]) {
    if (m[f] === undefined) throw new Error(`ORACLE: ${f} missing from the tree`);
  }
  return { ...tree, ...marq, ...doc };
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
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} gave no answer in 45s`)); }, 45000);
    pending.set(id, (m) => { clearTimeout(timer); if (m.error) reject(new Error(`${method}: ${J(m.error)}`)); else resolve(m.result); });
    ws.send(J({ id, method, params }));
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

// ═══ THE DRIVER: real Input events only ════════════════════════════════════
const CTRL = 2;
function driver(c) {
  const mouse = (type, x, y, button = 'none', buttons = 0, modifiers = 0) =>
    c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1, modifiers });
  const aim = (selectorExpr) => c.json(String.raw`(() => {
    const el = ${selectorExpr};
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
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
  const realClick = async (selectorExpr) => {
    const p = await aim(selectorExpr);
    if (!p || !p.hitOk) return p;
    await clickAt(p);
    return p;
  };
  const drag = async (a, b, steps = 8) => {
    await mouse('mouseMoved', a.x, a.y);
    await mouse('mousePressed', a.x, a.y, 'left', 1);
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(a.x + ((b.x - a.x) * i) / steps);
      const y = Math.round(a.y + ((b.y - a.y) * i) / steps);
      await mouse('mouseMoved', x, y, 'left', 1);
      await sleep(25);
    }
    await mouse('mouseReleased', b.x, b.y, 'left', 0);
    await sleep(400);
  };
  const typeText = async (text) => {
    for (const ch of text) {
      await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
    }
    await sleep(200);
  };
  const chord = async (k, mods = 0) => {
    const p = { key: k, code: `Key${k.toUpperCase()}`, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods };
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(350);
  };
  const FACET = (label) => `[...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === ${J(label)}) || null`;
  const st = () => c.json('window.__dbg.donors.state()');
  const waitFor = async (pred, what, tries = 80, ms = 250, { soft = false } = {}) => {
    let s = null;
    for (let i = 0; i < tries; i++) { s = await st(); if (pred(s)) return s; await sleep(ms); }
    // SOFT: the row itself judges the state it was left with, so a property that
    // never arrived prints as that row's FAIL instead of aborting the run.
    if (soft) return s;
    throw new Error(`timed out waiting for ${what}: ${J(s).slice(0, 600)}`);
  };
  /** Pane geometry from the pane's own report: view (scale, ox, oy) and rect. */
  const pane = async (name) => (await st())[name === 'donor' ? 'donorPane' : 'targetPane'];
  const clientOf = (P, wx, wy) => ({ x: P.rect.left + (wx - P.view.ox) * P.view.scale, y: P.rect.top + (wy - P.view.oy) * P.view.scale });
  const worldAt = (P, cx, cy) => ({ x: (cx - P.rect.left) / P.view.scale + P.view.ox, y: (cy - P.rect.top) / P.view.scale + P.view.oy });
  return { c, mouse, aim, clickAt, realClick, drag, typeText, chord, FACET, st, waitFor, pane, clientOf, worldAt };
}

// ═══ DISK HELPERS: what the harness reads with its own eyes ════════════════
function stitched(zoneDir, zone, suffix) {
  const st = zone.grid.section_px / 8;
  const cols = zone.grid.w * st;
  const out = new Uint16Array(cols * zone.grid.h * st);
  for (let sy = 0; sy < zone.grid.h; sy++) {
    for (let sx = 0; sx < zone.grid.w; sx++) {
      const b = readFileSync(join(zoneDir, `section_${sy * zone.grid.w + sx}.${suffix}.bin`));
      for (let r = 0; r < st; r++) for (let q = 0; q < st; q++) {
        out[(sy * st + r) * cols + sx * st + q] = b.readUInt16BE((r * st + q) * 2);
      }
    }
  }
  return { words: out, cols };
}
const aeonTool = (copy, args) => spawnSync('python3', args, {
  cwd: copy, encoding: 'utf8', env: { ...process.env, [SUITE_ROOT_ENV]: SUITE }, maxBuffer: 64 << 20,
});

async function main() {
  const t0 = Date.now();
  const tStart = new Date().toISOString();
  console.log('=== donor-page harness (S2-DONOR-PAGE) ===');
  console.log(`    UTC start    : ${tStart}`);
  console.log(`    uptime       : ${uptime()}`);
  console.log(`    root         : ${RUN.root}`);
  console.log(`    pinned       : ${RUN.source}`);
  console.log(`    in-tree      : ${samePath(RUN.root, HERE) ? 'yes' : 'NO'} (tree under test ${RUN.root}; this file lives in ${HERE})`);
  console.log(`    HEAD         : ${HEAD_SHA}`);
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'src').stdout.trim();
  console.log(`    src on disk  : ${dirty ? `DIFFERS FROM HEAD:\n${dirty}` : 'identical to HEAD'}`);
  console.log(`    ORACLE_SOCKET: ${SOCK}   profile: ${RUN_PROFILE_DIR}   PORT ${PORT}   DISPLAY: xvfb-run -a (never :0)`);
  const O = await loadOracle();
  console.log(`    oracle       : CONVERTER_COMMAND ${J(O.CONVERTER_COMMAND)}; marqueeRect, marqueeReadout, clipsManifestPath, suggestDestination bundled from ${RUN.root}/src`);
  const COPY = makeCopy();
  console.log(`    aeon source  : ${AEON.name}=${AEON.value}   (live sibling ${LIVE_AEON ?? 'unresolved'}: refused if equal)`);
  console.log(`    copy         : ${COPY}   suite root handed to aeon's tools: ${SUITE}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target; refusing to start.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ORACLE_SOCKET: SOCK, [SUITE_ROOT_ENV]: SUITE };
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
    c = cdp(page.webSocketDebuggerUrl);
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const waitDbg = async () => {
      for (let i = 0; i < 100; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object" && !!window.__dbg.donors').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg.donors: rebuild with VITE_AURORA_DEBUG=1');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3000);
    if (!(await waitDbg())) throw new Error('no __dbg after reload');
    const dpr = await c.evalExpr('window.devicePixelRatio');
    console.log(`    dpr          : ${dpr}   window ${J(await c.json('({ iw: innerWidth, ih: innerHeight })'))}`);
    const d = driver(c);
    try { await rows(d, O, COPY, dpr); } catch (e) {
      check('DP.ABORT', `the run stopped early, so every row after the last one printed did NOT run: ${e.message.slice(0, 300)}`, false);
    }
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
    try { rmSync(SOCK_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
    if (!process.env.KEEP_COPY) { try { rmSync(COPY, { recursive: true, force: true }); } catch { /* */ } }
    console.log(`    copy ${process.env.KEEP_COPY ? `KEPT at ${COPY}` : `deleted: ${existsSync(COPY) ? 'NO, still there' : 'yes'}`}`);
  }

  const pass = results.filter((r) => r.ok === true).length;
  console.log(`\n════ ${pass}/${results.length} rows PASS · ${fails.length} FAIL · ${unmeasurable.length} UNMEASURABLE · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     UTC start ${tStart}   UTC end ${new Date().toISOString()}   uptime at end ${uptime()}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  console.log('END-OF-RUN');
  process.exit(fails.length || unmeasurable.length ? 1 : 0);
}

async function rows(d, O, COPY, dpr) {
  const { c } = d;
  // SHOT_DIR=<dir> saves a PNG of the window at two points, for a person to
  // look at. Never read by a row: a picture is not a measurement here.
  // `clip` (client px, optional) shoots one region magnified by `clip.scale`.
  const shot = async (name, clip = null) => {
    if (!process.env.SHOT_DIR) return;
    const r = await c.send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
    const f = join(process.env.SHOT_DIR, `donor-page-${name}.png`);
    writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log(`    shot         : ${f}`);
  };
  // The target canvas READ BACK along the inside of a world rectangle's top
  // edge (the 2px stroke band), counting pixels in DONOR_MARK_WARN (#FBBF24)
  // and the runs they form: a dashed warning edge has several runs, a solid one
  // one, none has zero. Aimed through the pane's own published view and rect.
  const WARN_RGB = [0xFB, 0xBF, 0x24];
  const edgeRead = async (r) => {
    const T = await d.pane('target');
    const x0 = T.rect.left + (r.x - T.view.ox) * T.view.scale; const x1 = T.rect.left + (r.x + r.w - T.view.ox) * T.view.scale;
    const y = T.rect.top + (r.y - T.view.oy) * T.view.scale;
    const got = await c.json(String.raw`(() => { const cv = document.querySelector('[data-zone-pane-canvas="target"]'); if (!cv) return null;
      const b = cv.getBoundingClientRect(); const k = cv.width / b.width; const ctx = cv.getContext('2d');
      const px0 = Math.max(0, Math.ceil((${x0} - b.left + 8) * k)), px1 = Math.min(cv.width, Math.floor((${x1} - b.left - 8) * k));
      const py = Math.round((${y} - b.top + 1) * k);
      if (px1 <= px0 || py < 0 || py >= cv.height) return { n: 0 };
      const img = ctx.getImageData(px0, py, px1 - px0, 1).data; let warn = 0, runs = 0, prev = false;
      for (let i = 0; i < img.length; i += 4) {
        const on = Math.abs(img[i] - ${WARN_RGB[0]}) < 12 && Math.abs(img[i + 1] - ${WARN_RGB[1]}) < 12 && Math.abs(img[i + 2] - ${WARN_RGB[2]}) < 12;
        if (on) warn++; if (on && !prev) runs++; prev = on;
      }
      return { n: img.length / 4, warn, runs, k, py }; })()`);
    return { ...got, view: T.view, paints: T.paints };
  };
  // Warning pixels in a box given in screen px from the rectangle's top-left
  // corner on the target canvas (the label bands; the dashed edge is excluded
  // by starting 4 px in).
  const bandRead = async (r, box) => {
    const T = await d.pane('target');
    const ox = T.rect.left + (r.x - T.view.ox) * T.view.scale; const oy = T.rect.top + (r.y - T.view.oy) * T.view.scale;
    return c.json(String.raw`(() => { const cv = document.querySelector('[data-zone-pane-canvas="target"]'); if (!cv) return null;
      const b = cv.getBoundingClientRect(); const k = cv.width / b.width; const ctx = cv.getContext('2d');
      const x0 = Math.round((${ox} - b.left + ${box.x0}) * k), y0 = Math.round((${oy} - b.top + ${box.y0}) * k);
      const w = Math.round((${box.x1} - ${box.x0}) * k), h = Math.round((${box.y1} - ${box.y0}) * k);
      const img = ctx.getImageData(x0, y0, w, h).data; let warn = 0, lit = 0;
      for (let i = 0; i < img.length; i += 4) {
        if (Math.abs(img[i] - ${WARN_RGB[0]}) < 40 && Math.abs(img[i + 1] - ${WARN_RGB[1]}) < 40 && Math.abs(img[i + 2] - ${WARN_RGB[2]}) < 40) warn++;
        if (img[i] + img[i + 1] + img[i + 2] > 200) lit++;
      }
      return { n: img.length / 4, warn, lit }; })()`);
  };
  const dashedOf = (P) => (P && Array.isArray(P.outlines) ? P.outlines.filter((o) => o.dashed) : null);
  const accentOf = (P) => (P && Array.isArray(P.outlines) ? P.outlines.filter((o) => o.tone === 'accent') : null);
  // ROW 235 (a): what "free" means, written HERE from aeon's R8 and R10 wording
  // (inside the act; no overlap with any clip, corridor or shaft dst_rect in the
  // clips.json ON DISK), not bundled from the tree, so a wrong app predicate
  // disagrees with it. Section origins, row by row.
  const rectsOnDisk = (man) => [...(man.clips ?? []), ...(man.corridors ?? []), ...(man.shafts ?? [])].map((k) => k.dst_rect);
  const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const freeOn = (man, r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= man.act.grid_w * 2048 && r.y + r.h <= man.act.grid_h * 2048
    && !rectsOnDisk(man).some((p) => hits(p, r));
  const freeOrigins = (man, w, h) => {
    const out = [];
    for (let y = 0; y < man.act.grid_h * 2048; y += 2048) for (let x = 0; x < man.act.grid_w * 2048; x += 2048) if (freeOn(man, { x, y, w, h })) out.push({ x, y });
    return out;
  };

  // ── DP.0 ────────────────────────────────────────────────────────────────
  const opened = await c.evalExpr(`window.__dbg.aeon.open(${J(COPY)})`).catch((e) => `threw: ${e.message}`);
  let s0 = null;
  for (let i = 0; i < 80; i++) { s0 = await c.json('window.__dbg.aeon.state()').catch(() => null); if (s0 && s0.open && s0.act) break; await sleep(250); }
  await sleep(600);
  const pill = await d.realClick(d.FACET('Donors'));
  await sleep(800);
  const hasPage = await c.evalExpr('!!document.querySelector("[data-donors-canvas]")');
  check('DP.0', 'the copy opens (setup via __dbg.aeon.open) and a REAL click on the Donors pill shows the page',
    !!(pill && pill.hitOk) && hasPage && !!s0 && s0.open, `open ${J(opened)}; state ${J(s0)}; pill aim ${J(pill)}; page ${hasPage}`);
  if (!hasPage) return;

  // ── DP.1 absent ─────────────────────────────────────────────────────────
  const donorsDir = join(COPY, 'games/sonic4/data/donors');
  const s1 = await d.waitFor((s) => s.listing !== null, 'the listing');
  const dom1 = await c.json(String.raw`(() => { const el = document.querySelector('[data-donors-state]'); const cmd = document.querySelector('[data-donors-command]');
    return { state: el && el.getAttribute('data-donors-state'), cmd: cmd ? cmd.firstElementChild.textContent : null, where: cmd ? cmd.lastElementChild.textContent : null }; })()`);
  check('DP.1', 'ABSENT: the copy has no donors/ ON DISK, the page says absent, and names the converter command EXACTLY as the tree spells it, run in the copy',
    !existsSync(donorsDir) && s1.listing.state === 'absent' && dom1.state === 'absent' && dom1.cmd === O.CONVERTER_COMMAND && dom1.where === `run in ${COPY}`,
    `on disk ${existsSync(donorsDir) ? 'PRESENT' : 'absent'}; listing ${J(s1.listing)}; DOM ${J(dom1)}; tree command ${J(O.CONVERTER_COMMAND)}`);

  // ── DP.2 run the named command, then Look again ─────────────────────────
  const argv = O.CONVERTER_COMMAND.split(' ');
  const conv = aeonTool(COPY, argv.slice(1));
  const onDisk = existsSync(donorsDir)
    ? readdirSync(donorsDir).flatMap((dn) => readdirSync(join(donorsDir, dn)).filter((z) => existsSync(join(donorsDir, dn, z, 'zone.json'))).map((z) => `${dn}/${z}`)).sort()
    : [];
  const look = await d.realClick('document.querySelector("[data-donors-refresh]")');
  const s2 = await d.waitFor((s) => s.listing && s.listing.state === 'present', 'the present listing');
  const listed = s2.listing.donors.flatMap((x) => x.zones.map((z) => `${x.donor}/${z}`)).sort();
  const buttons = await c.json('[...document.querySelectorAll("[data-donor-zone]")].map((b) => b.getAttribute("data-donor-zone")).sort()');
  check('DP.2', `the harness ran the page's own command in the copy (exit ${conv.status}); a REAL click on "Look again" lists exactly the zones it wrote, read back from disk`,
    conv.status === 0 && onDisk.length === 6 && J(listed) === J(onDisk) && J(buttons) === J(onDisk) && !!(look && look.hitOk),
    `converter tail ${J(String(conv.stdout).trim().split('\n').slice(-1)[0])}; on disk ${J(onDisk)}; listed ${J(listed)}; buttons ${J(buttons)}`);
  if (conv.status !== 0) return;

  // ── DP.3 open EHZ, it DREW ──────────────────────────────────────────────
  const zoneDir = join(donorsDir, 's2disasm/EHZ');
  const zone = JSON.parse(readFileSync(join(zoneDir, 'zone.json'), 'utf8'));
  const man = O.parseZoneManifest(readFileSync(join(zoneDir, 'zone.json'), 'utf8'));
  await d.realClick('document.querySelector("[data-donor-zone=\\"s2disasm/EHZ\\"]")');
  const s3 = await d.waitFor((s) => s.zone && s.donorCompose && s.donorCompose.zone === 's2disasm/EHZ' && s.donorPane && s.donorPane.bitmaps > 0, 'EHZ drawn');
  await sleep(500);
  const P = await d.pane('donor');
  const drewIff = zone.sections.map((sec) => {
    const got = s3.donorCompose.sections.find((x) => x.n === sec.n);
    return { n: sec.n, painted: sec.painted_cells, drawn: got ? got.drawnPixels : null };
  });
  const iffOk = drewIff.every((x) => x.drawn !== null && (x.painted > 0) === (x.drawn > 0)) && drewIff.some((x) => x.drawn > 0);
  // The canvas itself, read back: the crop's on-screen box, pixel by pixel.
  const box = { x0: P.view ? (man.cropPx.x - P.view.ox) * P.view.scale : 0, y0: (man.cropPx.y - P.view.oy) * P.view.scale,
    x1: (man.cropPx.x + man.cropPx.w - P.view.ox) * P.view.scale, y1: (man.cropPx.y + man.cropPx.h - P.view.oy) * P.view.scale };
  const canvasRead = await c.json(String.raw`(() => { const cv = document.querySelector('[data-zone-pane-canvas="donor"]'); if (!cv) return null;
    const k = cv.width / cv.getBoundingClientRect().width; const ctx = cv.getContext('2d');
    const x0 = Math.max(0, Math.ceil((${box.x0} + 2) * k)), y0 = Math.max(0, Math.ceil((${box.y0} + 2) * k));
    const x1 = Math.min(cv.width, Math.floor((${box.x1} - 2) * k)), y1 = Math.min(cv.height, Math.floor((${box.y1} - 2) * k));
    if (x1 <= x0 || y1 <= y0) return { area: 0 };
    const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data; let drawn = 0;
    for (let i = 3; i < img.length; i += 4) if (img[i] !== 0) drawn++;
    return { area: (x1 - x0) * (y1 - y0), drawn, backing: [cv.width, cv.height], k }; })()`);
  const share = canvasRead && canvasRead.area ? canvasRead.drawn / canvasRead.area : 0;
  check('DP.3', 'a REAL click opens EHZ and the page DREW it: each section drew pixels iff zone.json gives it painted cells, and the donor canvas, read back, is non-blank inside the crop',
    iffOk && !!canvasRead && canvasRead.area > 1000 && share > 0.2,
    `dpr ${dpr}; pane ${J(P)}; per section ${J(drewIff)}; canvas read ${J(canvasRead)} (share ${share.toFixed(3)})`);

  await shot('opened');
  // ── DP.4 marquee by a real drag ─────────────────────────────────────────
  // Integer aims whose back-mapped cell origin sits on the 16-px collision grid,
  // so the rectangle can be pasted on a section boundary (aeon R12).
  // x and y are searched independently: each integer client step moves the
  // world point by 1/scale px, so some step lands in an even-indexed cell.
  const p0 = d.clientOf(P, 2048 + 24, 128 + 24);
  let ax = null; let ay = null;
  for (let k = 0; k < 40 && ax === null; k++) {
    const cx = Math.round(p0.x) + k;
    if (Math.floor(d.worldAt(P, cx, Math.round(p0.y)).x / 8) % 2 === 0) ax = cx;
  }
  for (let k = 0; k < 40 && ay === null; k++) {
    const cy = Math.round(p0.y) + k;
    if (Math.floor(d.worldAt(P, Math.round(p0.x), cy).y / 8) % 2 === 0) ay = cy;
  }
  const a2 = ax !== null && ay !== null ? { x: ax, y: ay } : null;
  const bpt = d.clientOf(P, 2048 + 1500, 128 + 700);
  const b = { x: Math.round(bpt.x), y: Math.round(bpt.y) };
  if (!a2) { check('DP.4', 'a real drag marquees', 'UNMEASURABLE', 'no integer aim on the 16-px grid near the target point'); return; }
  const wa = d.worldAt(P, a2.x, a2.y);
  const wb = d.worldAt(P, b.x, b.y);
  const expected = O.marqueeRect(wa, wb, man.cropPx);
  await d.drag(a2, b);
  const s4 = await d.waitFor((s) => s.marquee !== null, 'the marquee');
  const readout = await c.evalExpr('(document.querySelector("[data-donor-readout]") || {}).textContent || null');
  const m = s4.marquee;
  const on8 = m && ['x', 'y', 'w', 'h'].every((k) => m[k] % 8 === 0);
  const inCrop = m && m.x >= man.cropPx.x && m.y >= man.cropPx.y && m.x + m.w <= man.cropPx.x + man.cropPx.w && m.y + m.h <= man.cropPx.y + man.cropPx.h;
  check('DP.4', 'a REAL drag marquees exactly the tree\'s marqueeRect of the world points the integer aims map back to: every coordinate a multiple of 8, inside the crop, and the readout says so',
    J(m) === J(expected) && on8 && inCrop && readout === O.marqueeReadout(expected) && m.x % 16 === 0 && m.y % 16 === 0,
    `dpr ${dpr}; rect ${J(P.rect)}; view ${J(P.view)}; aims ${J(a2)} -> ${J(wa)}, ${J(b)} -> ${J(wb)}; expected ${J(expected)}; store ${J(m)}; readout ${J(readout)}`);
  if (!m) return;

  // ── DP.5 start a new clip act ───────────────────────────────────────────
  const ACT = 'hx_donor_act';
  await d.realClick('document.querySelector("[data-donors-act-new]")');
  const idIn = await d.realClick('document.querySelector("[data-donors-new-act-id]")');
  await d.typeText(ACT);
  const start = await d.realClick('document.querySelector("[data-donors-new-act-start]")');
  const s5 = await d.waitFor((s) => s.paste.target && s.paste.target.actId === ACT, 'the new target');
  check('DP.5', `real clicks and typed keys start a new clip act ${ACT}, not yet on disk`,
    !!(idIn && idIn.hitOk) && !!(start && start.hitOk) && s5.paste.target.onDisk === false && !existsSync(join(COPY, O.clipsManifestPath(ACT))),
    `target ${J(s5.paste.target)}; draft ${J(s5.draft)}`);

  // ── DP.5s the song line, before the paste (row 222) ─────────────────────
  const songDom = () => c.evalExpr('(document.querySelector("[data-donors-song]") || {}).textContent || null');
  await sleep(300);
  const song5 = await songDom();
  const wantSong5 = O.zoneSongLine(O.zoneSong(O.newClipManifest(ACT, 1, 1), 's2disasm', 'EHZ'));
  check('DP.5s', 'before the first paste the form names the song it inherits: none, because the act has no s2disasm EHZ clip (no file on disk), in the tree\'s own sentence',
    song5 === wantSong5 && /^Song: none inherited \(/.test(song5 ?? '') && !existsSync(join(COPY, O.clipsManifestPath(ACT))),
    `DOM ${J(song5)}; tree ${J(wantSong5)}`);

  // ── DP.6 paste, and read everything back from disk ──────────────────────
  const hold = { gridW: Math.ceil(m.w / 2048), gridH: Math.ceil(m.h / 2048) };
  const wantDst = O.suggestDestination(O.newClipManifest(ACT, hold.gridW, hold.gridH), hold.gridW, hold.gridH, m);
  const s5b = await d.waitFor((s) => s.draft.clipId !== '' && s.draft.dst !== null, 'the suggested id and destination');
  const pasteBtn = await d.realClick('document.querySelector("[data-donors-paste-button]")');
  const s6 = await d.waitFor((s) => s.paste.outcome && !s.paste.busy, 'the paste outcome', 160);
  const path = join(COPY, O.clipsManifestPath(ACT));
  const fileText = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const file = fileText ? JSON.parse(fileText) : null;
  const clip = file && file.clips && file.clips[0];
  const wantClip = { id: s5b.draft.clipId, donor: 's2disasm', zone: 'EHZ', src_rect: { x: m.x, y: m.y, w: m.w, h: m.h }, dst_rect: { x: wantDst.x, y: wantDst.y, w: m.w, h: m.h } };
  check('DP.6a', 'a REAL click on Paste writes clips.json: READ FROM DISK it holds exactly the one clip (src = the marquee, dst = the tree\'s suggested section origin), and NO region_id',
    !!(pasteBtn && pasteBtn.hitOk) && s6.paste.outcome.kind === 'pasted' && !!clip && file.clips.length === 1 && J(clip) === J(wantClip)
      && file.schema === 1 && file.units === 'world_px' && file.id === ACT && !('region_id' in clip),
    `outcome ${J(s6.paste.outcome)}; on disk ${fileText ? fileText.replace(/\s+/g, ' ') : 'ABSENT'}; want ${J(wantClip)}`);
  const song6 = await c.evalExpr('(document.querySelector("[data-donors-outcome-song]") || {}).textContent || null');
  check('DP.6s', 'the success summary repeats the song sentence the form showed before the paste, word for word',
    !!song5 && song6 === song5, `summary ${J(song6)}; form before ${J(song5)}`);
  if (!fileText) return;
  const v = aeonTool(COPY, ['tools/clip_manifest.py', 'validate', path, '--donor-root', donorsDir]);
  check('DP.6b', 'aeon\'s own loader, run by the harness on the file ON DISK, accepts it',
    v.status === 0 && /clips\.json OK/.test(v.stdout), `exit ${v.status}; ${String(v.stdout).trim().split('\n')[0]}`);
  const outDir = mkdtempSync(join(os.tmpdir(), 'donor-page-bake-'));
  let harnessClipact = null;
  try {
    const bk = aeonTool(COPY, ['tools/clip_act_bake.py', 'bake', path, '--out', outDir]);
    if (bk.status === 0 && existsSync(join(outDir, 'clipact.json'))) harnessClipact = JSON.parse(readFileSync(join(outDir, 'clipact.json'), 'utf8'));
    const st = zone.grid.section_px / 8;
    const bad = [];
    let compared = 0; let paintedCells = 0;
    if (bk.status === 0) {
      const secN = (Math.floor(wantDst.y / 2048)) * file.act.grid_w + Math.floor(wantDst.x / 2048);
      for (const suffix of ['tiles', 'collattr', 'collattrb']) {
        const donor = stitched(zoneDir, zone, suffix);
        const baked = readFileSync(join(outDir, `section_${secN}.${suffix}.bin`));
        for (let r = 0; r < m.h / 8; r++) for (let q = 0; q < m.w / 8; q++) {
          const want = donor.words[(m.y / 8 + r) * donor.cols + m.x / 8 + q];
          const lr = (wantDst.y % 2048) / 8 + r; const lq = (wantDst.x % 2048) / 8 + q;
          const got = baked.readUInt16BE((lr * st + lq) * 2);
          compared++;
          if (suffix === 'tiles' && (want & 0x7ff)) paintedCells++;
          if (want !== got && bad.length < 5) bad.push(`${suffix} (${q},${r}) donor ${want} baked ${got}`);
        }
      }
    }
    check('DP.6c', 'aeon\'s own bake of that file, READ BACK FROM DISK, puts the donor\'s words AND both collision planes at the destination, byte for byte against the donor\'s own section files',
      bk.status === 0 && bad.length === 0 && compared === 3 * (m.w / 8) * (m.h / 8) && paintedCells > 100,
      `bake exit ${bk.status}; ${compared} cells compared over 3 planes, ${paintedCells} painted; mismatches ${J(bad)}`);
  } finally { rmSync(outDir, { recursive: true, force: true }); }
  const s6d = await d.waitFor((s) => s.targetCompose && s.targetCompose.act === ACT, 'the target pane composed');
  const t0 = s6d.targetCompose.sections.find((x) => x.n === 0);
  check('DP.6d', 'the target pane drew the pasted clip from the bake\'s bytes (section 0 drew pixels)',
    !!t0 && t0.drawnPixels > 0, `target compose ${J(s6d.targetCompose)}; pane ${J(s6d.targetPane)}`);

  // ── DP.6e the per-clip pool grid, against the harness's own bake ────────
  const pool = harnessClipact && harnessClipact.pool;
  if (!pool || !Array.isArray(pool.per_clip)) {
    check('DP.6e', 'the per-clip pool grid', 'UNMEASURABLE', `the harness's bake wrote no pool.per_clip (aeon predates 1d9afb25?): ${J(pool && Object.keys(pool))}`);
  } else {
    await sleep(500);
    const dom6e = await c.json(String.raw`(() => {
      const box = document.querySelector('[data-donors-pool-rows]');
      const cells = {}; for (const el of document.querySelectorAll('[data-donors-pool-cell]')) cells[el.getAttribute('data-donors-pool-cell')] = el.textContent;
      const heads = {}; for (const el of document.querySelectorAll('[data-donors-pool-head]')) heads[el.getAttribute('data-donors-pool-head')] = el.getAttribute('title');
      const ids = [...document.querySelectorAll('[data-donors-pool-id]')].map((el) => el.getAttribute('data-donors-pool-id'));
      const note = (document.querySelector('[data-donors-pool-note]') || {}).textContent || null;
      return { state: box && box.getAttribute('data-donors-pool-rows'), cells, heads, ids, note, broken: !!document.querySelector('[data-donors-pool-broken]') }; })()`);
    const fields = ['tiles', 'tiles_added', 'pages_touched', 'pages_exclusive'];
    const want = {};
    for (const r of pool.per_clip) for (const f of fields) want[`clip:${r.index}:${f}`] = String(r[f]);
    for (const r of pool.per_corridor || []) for (const f of fields) want[`corridor:${r.index}:${f}`] = String(r[f]);
    const wantHeads = Object.fromEntries(fields.map((f) => [f, pool.per_clip_fields[f]]));
    const wantIds = [...pool.per_clip, ...(pool.per_corridor || [])].map((r) => r.id);
    check('DP.6e', 'the readout\'s per-clip pool grid equals, cell for cell, pool.per_clip of the clipact.json the HARNESS\'s own bake wrote; column tooltips are that file\'s per_clip_fields; the note names pool.tiles and pool.pages; no invariant flagged',
      dom6e.state === 'present' && J(dom6e.cells) === J(want) && J(dom6e.heads) === J(wantHeads) && J(dom6e.ids) === J(wantIds)
        && !!dom6e.note && dom6e.note.includes(String(pool.tiles)) && dom6e.note.includes(`${pool.pages} pages`) && !dom6e.broken,
      `harness bake pool ${pool.tiles} tiles / ${pool.pages} pages, per_clip ${J(pool.per_clip)}; DOM ${J(dom6e).slice(0, 700)}`);
  }

  // ── DP.6n no free spot, said on the page (row 235 (a)) ──────────────────
  {
    const man6 = JSON.parse(readFileSync(path, 'utf8'));
    const free6 = freeOrigins(man6, m.w, m.h);
    if (free6.length > 0) {
      check('DP.6n', 'with no free section origin left, the form says so', 'UNMEASURABLE', `the act on disk still has free origins for ${m.w} x ${m.h}: ${J(free6)}`);
    } else {
      const s6n = await d.waitFor((s) => s.draft.dst === null && s.draft.placement === 'none-free', 'the none-free placement', 40, 250, { soft: true });
      await sleep(300);
      const dom6n = await c.json(String.raw`(() => { const el = document.querySelector('[data-donors-no-free]');
        const b = document.querySelector('[data-donors-paste-button]');
        return { act: el ? el.getAttribute('data-donors-no-free') : null, text: el ? el.textContent : null, pasteDisabled: !!(b && b.disabled) }; })()`);
      const acc6 = accentOf(s6n.targetPane);
      check('DP.6n', `after the paste fills ${ACT}, no section origin is free for the ${m.w} x ${m.h} marquee (the harness finds none on disk): the draft has NO destination, the pane draws no accent outline, Paste is disabled, and the form says so, naming the act and the size`,
        s6n.draft.dst === null && s6n.draft.placement === 'none-free' && dom6n.act === ACT && !!dom6n.text && dom6n.text.includes(`${m.w} x ${m.h}`)
          && dom6n.text.includes(ACT) && J(acc6) === '[]' && dom6n.pasteDisabled,
        `on disk ${J(rectsOnDisk(man6))} in ${man6.act.grid_w} x ${man6.act.grid_h}; draft ${J(s6n.draft)}; DOM ${J(dom6n)}; accent ${J(acc6)}`);
    }
  }

  await shot('pasted');
  // ── DP.7 a paste aeon refuses ───────────────────────────────────────────
  const shaBefore = sha(readFileSync(path));
  const T = await d.pane('target');
  const tp = d.clientOf(T, wantDst.x + 64, wantDst.y + 64);
  const tAim = { x: Math.round(tp.x), y: Math.round(tp.y) };
  await d.clickAt(tAim);
  const s7a = await d.waitFor((s) => s.draft.dst !== null && s.draft.dst.x === wantDst.x && s.draft.dst.y === wantDst.y && s.draft.clipId !== '', 'the overlapping placement');
  const refusedRect = { x: wantDst.x, y: wantDst.y, w: m.w, h: m.h };
  await sleep(300);
  const edgeBefore = await edgeRead(refusedRect);
  await d.realClick('document.querySelector("[data-donors-paste-button]")');
  const s7 = await d.waitFor((s) => s.paste.outcome && !s.paste.busy && s.paste.outcome.kind !== 'pasted', 'the refusal', 160);
  const shown = await c.evalExpr('(document.querySelector("[data-donors-refusal]") || {}).textContent || null');
  const dom7 = await c.json(String.raw`(() => { const n = document.querySelector('[data-donors-refusal-note]');
    return n ? { rule: (n.querySelector('[data-donors-note-rule]') || {}).textContent, subjects: (n.querySelector('[data-donors-note-subjects]') || {}).textContent,
      attr: n.getAttribute('data-donors-refusal-note'), stage: (document.querySelector('[data-donors-stage]') || { getAttribute: () => null }).getAttribute('data-donors-stage') } : null; })()`);
  await shot('refused');
  check('DP.7', 'a REAL click on the target pane places a second paste over the first; aeon REFUSES it naming R10, the page shows aeon\'s own words, and clips.json on disk is byte-identical',
    s7.paste.outcome.kind === 'refused' && /R10/.test(s7.paste.outcome.text) && !!shown && /R10/.test(shown) && sha(readFileSync(path)) === shaBefore,
    `target aim ${J(tAim)} (view ${J(T.view)}, rect ${J(T.rect)}); draft ${J(s7a.draft)}; outcome ${J(s7.paste.outcome).slice(0, 400)}`);
  const firstId = JSON.parse(readFileSync(path, 'utf8')).clips[0].id;
  const wantSubjects = `clip 0 ${firstId} and clip 1 ${s7a.draft.clipId}`;
  check('DP.7s', 'the R10 refusal is shown STRUCTURALLY: the rule tag reads R10 and the subjects name both clips, first claimant first (ids from the file on disk and the draft)',
    !!dom7 && dom7.rule === 'R10' && dom7.attr === 'R10' && dom7.subjects === wantSubjects && dom7.stage === 'validate',
    `DOM ${J(dom7)}; want subjects ${J(wantSubjects)}`);

  // ── DP.7o the refused subjects, outlined on the target pane (row 213 (b)) ─
  const clip0 = JSON.parse(readFileSync(path, 'utf8')).clips[0].dst_rect;
  const s7o = await d.waitFor((s) => (dashedOf(s.targetPane) ?? []).length > 0, 'the refused outlines', 40, 250, { soft: true });
  await sleep(300);
  const dash7 = dashedOf(s7o.targetPane);
  const want7 = [{ rect: clip0, tone: 'warning', dashed: true, tag: 'R10' }, { rect: refusedRect, tone: 'warning', dashed: true, tag: 'R10' }];
  const edge7 = await edgeRead(refusedRect);
  check('DP.7o', 'the R10 refusal outlines BOTH subjects: the pane painted two dashed warning outlines tagged R10 (clip 0 as on disk, clip 1 the draft), and the canvas edge, read back, shows the warning colour in DASHES where it showed none just before the refusal',
    J(dash7) === J(want7) && edgeBefore.warn === 0 && edge7.warn > 0.2 * edge7.n && edge7.warn < 0.9 * edge7.n && edge7.runs >= 3,
    `dpr ${dpr}; dashed ${J(dash7)}; want ${J(want7)}; edge before ${J(edgeBefore)}; edge now ${J(edge7)}`);

  // ── DP.7l leaving the page clears the refusal ───────────────────────────
  const pills = await c.json('[...document.querySelectorAll(\'[aria-label="Facets"] button\')].map((b) => b.textContent.trim())');
  const other = pills.find((t) => t !== 'Donors') ?? null;
  const away = other ? await d.realClick(d.FACET(other)) : null;
  await sleep(600);
  const gone = await c.evalExpr('!document.querySelector("[data-donors-canvas]")');
  const back7 = await d.realClick(d.FACET('Donors'));
  const s7l = await d.waitFor((s) => s.targetPane && s.targetPane.paints > 0 && (dashedOf(s.targetPane) ?? [1]).length === 0, 'the target pane repainted without outlines', 40, 250, { soft: true });
  await sleep(400);
  const edge7l = await edgeRead(refusedRect);
  check('DP.7l', `leaving the page (a REAL click on the ${J(other)} pill, which unmounts the page, then back on Donors) clears the refusal and its outlines; the canvas edge reads no warning`,
    !!(away && away.hitOk) && gone && !!(back7 && back7.hitOk) && (s7l.paste.outcome === null || s7l.paste.outcome.kind !== 'refused')
      && J(dashedOf(s7l.targetPane)) === '[]' && edge7l.warn === 0,
    `pills ${J(pills)}; unmounted ${gone}; outcome ${J(s7l.paste.outcome && s7l.paste.outcome.kind)}; dashed ${J(dashedOf(s7l.targetPane))}; edge ${J(edge7l)}`);

  // ── DP.7e the same paste refused again, then a real edit clears it ──────
  await d.realClick('document.querySelector("[data-donors-paste-button]")');
  const s7r = await d.waitFor((s) => s.paste.outcome && !s.paste.busy && s.paste.outcome.kind === 'refused' && (dashedOf(s.targetPane) ?? []).length === 2, 'the refusal again', 160, 250, { soft: true });
  const edge7r = await edgeRead(refusedRect);
  const idBox = await d.realClick('document.querySelector("[data-donors-clip-id]")');
  await c.evalExpr('(() => { const el = document.querySelector("[data-donors-clip-id]"); el.setSelectionRange(el.value.length, el.value.length); })()');
  await d.typeText('x');
  const s7e = await d.waitFor((s) => s.paste.outcome === null, 'the refusal cleared', 40, 250, { soft: true });
  await sleep(400);
  const edge7e = await edgeRead(refusedRect);
  check('DP.7e', 'the same paste is refused again with both outlines (anti-vacuous), and a REAL keystroke in the clip id clears the refusal and its outlines; the canvas edge reads no warning',
    s7r.paste.outcome && s7r.paste.outcome.kind === 'refused' && edge7r.warn > 0 && !!(idBox && idBox.hitOk)
      && s7e.paste.outcome === null && J(dashedOf(s7e.targetPane)) === '[]' && edge7e.warn === 0
      && !(await c.evalExpr('!!document.querySelector("[data-donors-refusal]")')),
    `again ${J(s7r.paste.outcome && s7r.paste.outcome.kind)}, edge ${J(edge7r)}; draft after ${J(s7e.draft)}; outcome ${J(s7e.paste.outcome)}; dashed ${J(dashedOf(s7e.targetPane))}; edge ${J(edge7e)}`);

  // ── DP.8 undo by a real Ctrl+Z, redo by a real click ────────────────────
  const pasted = readFileSync(path);
  await c.evalExpr('document.activeElement && document.activeElement !== document.body && document.activeElement.blur()');
  const focus = (await d.st()).focusedDocId;
  await d.chord('z', CTRL);
  const s8 = await d.waitFor((s) => s.paste.outcome && s.paste.outcome.kind === 'undone', 'the undo', 40, 250, { soft: true });
  const goneAfterUndo = !existsSync(path);
  check('DP.8a', 'a REAL Ctrl+Z on the Donors facet undoes the paste: the clips.json it created is GONE from disk',
    focus === 'doc:donor-paste' && goneAfterUndo && !!s8.paste.outcome && s8.paste.outcome.removed === true,
    `focused doc ${focus}; outcome ${J(s8.paste.outcome)}; on disk ${goneAfterUndo ? 'absent' : 'STILL THERE'}`);
  await d.realClick('document.querySelector("[data-donors-redo]")');
  const s8b = await d.waitFor((s) => s.paste.outcome && s.paste.outcome.kind === 'redone', 'the redo', 80);
  const back = existsSync(path) ? readFileSync(path) : null;
  check('DP.8b', 'a REAL click on Redo writes the paste back, byte-identical to what the paste wrote',
    !!back && Buffer.compare(back, pasted) === 0, `outcome ${J(s8b.paste.outcome)}; bytes ${back ? back.length : 'ABSENT'} vs ${pasted.length}`);

  // ── DP.9s the song an existing act's zone carries (row 222) ─────────────
  const EXIST = 's2_ehz_cpz';
  const existPath = join(COPY, O.clipsManifestPath(EXIST));
  if (!existsSync(existPath)) {
    check('DP.9s', `the form names ${EXIST}'s EHZ song`, 'UNMEASURABLE', `${existPath} is not in the copy`);
    check('DP.11', `the real ${EXIST} act on the page`, 'UNMEASURABLE', `${existPath} is not in the copy`);
  } else {
    const ehzSongs = [...new Set(JSON.parse(readFileSync(existPath, 'utf8')).clips.filter((k) => k.donor === 's2disasm' && k.zone === 'EHZ').map((k) => k.music ?? null))];
    // Row 235 (a): the draft as it stands on the PREVIOUS act, just before the click.
    const pre9 = await d.st();
    const actBtn = await d.realClick(`document.querySelector('[data-donors-act="${EXIST}"]')`);
    const s9 = await d.waitFor((s) => s.paste.target && s.paste.target.actId === EXIST && !s.paste.busy, `${EXIST} chosen`, 240);
    await sleep(300);
    const song9 = await songDom();
    check('DP.9s', `a REAL click on ${EXIST}: the form names the song its s2disasm EHZ clips carry, read by the harness from that clips.json ON DISK`,
      !!(actBtn && actBtn.hitOk) && ehzSongs.length === 1 && typeof ehzSongs[0] === 'string' && song9 === `Song: ${ehzSongs[0]} (from s2disasm EHZ)`,
      `songs on disk ${J(ehzSongs)}; DOM ${J(song9)}; target ${J(s9.paste.target && s9.paste.target.actId)}`);
    await bigAct(EXIST, existPath);
    await carriedDraft(EXIST, existPath, pre9);
  }

  // ── DP.11d the draft carried from another act lands FREE (row 235 (a)) ───
  // `pre` is the page's state just before DP.9s's real click on `actId`: the
  // draft DP.7 placed by a click on the harness's own act. Every expectation
  // is read from `actId`'s clips.json ON DISK by the harness's own R8/R10
  // oracle (`freeOrigins`), never from the tree.
  async function carriedDraft(actId, manPath, pre) {
    const before = readFileSync(manPath);
    const man = JSON.parse(before.toString('utf8'));
    const rects = rectsOnDisk(man);
    const carried = pre && pre.draft && pre.draft.dst ? { x: pre.draft.dst.x, y: pre.draft.dst.y, w: m.w, h: m.h } : null;
    const fromAct = pre && pre.paste && pre.paste.target ? pre.paste.target.actId : null;
    if (!carried || fromAct === actId || rects.every((r) => !hits(r, carried))) {
      check('DP.11d', `a draft carried onto ${actId} lands free`, 'UNMEASURABLE',
        `the premise is not there: before the click the draft was ${J(pre && pre.draft)} on ${J(fromAct)}; on ${actId} it overlaps ${J(carried ? rects.filter((r) => hits(r, carried)) : null)}`);
      return;
    }
    const want = freeOrigins(man, m.w, m.h)[0] ?? null;
    if (!want) {
      check('DP.11d', `a draft carried onto ${actId} lands free`, 'UNMEASURABLE', `the harness finds no free section origin for ${m.w} x ${m.h} on ${actId}`);
      return;
    }
    const s = await d.waitFor((q) => q.paste.target && q.paste.target.actId === actId && q.draft.dst !== null
      && (accentOf(q.targetPane) ?? []).length === 1, `the draft on ${actId}`, 40, 250, { soft: true });
    const dst = s.draft.dst;
    const rect = dst ? { x: dst.x, y: dst.y, w: m.w, h: m.h } : null;
    const overlapped = rect ? rects.filter((r) => hits(r, rect)) : null;
    const acc = accentOf(s.targetPane);
    const fields = await c.json(String.raw`(() => { const f = [...document.querySelectorAll('[data-donors-paste] input[type="number"]')];
      return f.map((i) => i.value); })()`);
    await shot(`carried-${actId}`);
    const pasteBtn = await d.realClick('document.querySelector("[data-donors-paste-button]")');
    const sp = await d.waitFor((q) => q.paste.outcome && !q.paste.busy, `the paste on ${actId}`, 480, 250, { soft: true });
    const afterText = readFileSync(manPath, 'utf8');
    const after = JSON.parse(afterText);
    const added = after.clips.length === man.clips.length + 1 ? after.clips[after.clips.length - 1] : null;
    const outcome = sp.paste.outcome;
    let undone = null;
    if (outcome && outcome.kind === 'pasted') {
      await d.realClick('document.querySelector("[data-donors-undo]")');
      await d.waitFor((q) => q.paste.outcome && q.paste.outcome.kind === 'undone' && !q.paste.busy, 'the undo', 160, 250, { soft: true });
      undone = Buffer.compare(readFileSync(manPath), before) === 0;
    }
    check('DP.11d', `the draft DP.7 placed on ${fromAct}, carried into a REAL click on ${actId} where it overlapped ${rects.filter((r) => hits(r, carried)).length} rectangle(s) on disk, lands at the harness's own first free section origin (no clip, corridor or shaft on disk); the pane's accent outline and the Place at fields say that spot; a REAL Paste there is NOT refused and writes that dst_rect to disk; a REAL Undo puts the file back byte for byte`,
      !!rect && J(dst) === J(want) && J(overlapped) === '[]' && freeOn(man, rect)
        && J(acc) === J([{ rect, label: s.draft.clipId, tone: 'accent' }]) && J(fields) === J([String(want.x), String(want.y)])
        && !!(pasteBtn && pasteBtn.hitOk) && !!outcome && outcome.kind === 'pasted' && !!added && J(added.dst_rect) === J(rect)
        && undone === true,
      `carried ${J(carried)} from ${fromAct}; want ${J(want)}; draft ${J(s.draft)}; overlaps on disk ${J(overlapped)}; accent ${J(acc)}; fields ${J(fields)}; `
        + `outcome ${J(outcome).slice(0, 500)}; added ${J(added)}; undo restored bytes ${J(undone)}`);
  }

  // ── DP.11 the REAL s2_ehz_cpz act, on the page (row 219 (a)) ────────────
  // Every row before this builds its own one- or two-section act. This is the
  // act aeon ships: its clips.json in the copy, as DP.9s just chose it with a
  // real click. Every expectation is read from that file ON DISK and from the
  // HARNESS's own bake of it (aeon's CLI, in the copy), never typed here.
  async function bigAct(actId, manPath) {
    const man = JSON.parse(readFileSync(manPath, 'utf8'));
    const gw = man.act.grid_w; const gh = man.act.grid_h;
    const corridors = man.corridors ?? [];
    const outDir = mkdtempSync(join(os.tmpdir(), 'donor-page-big-'));
    let own = null;
    try {
      const bk = aeonTool(COPY, ['tools/clip_act_bake.py', 'bake', manPath, '--out', outDir]);
      if (bk.status === 0 && existsSync(join(outDir, 'clipact.json'))) {
        const clipact = JSON.parse(readFileSync(join(outDir, 'clipact.json'), 'utf8'));
        // Per section, from the bake's own files: cells a zone claims (key >= 0)
        // whose tile is not aeon's blank (index 0, "the blank tile every act carries").
        const painted = []; const cells = [];
        for (let n = 0; n < gw * gh; n++) {
          const t = join(outDir, `section_${n}.tiles.bin`); const k = join(outDir, `section_${n}.zonekey.bin`);
          if (!existsSync(t) || !existsSync(k)) { painted.push(null); cells.push(null); continue; }
          const tb = readFileSync(t); const kb = readFileSync(k); let p = 0;
          for (let i = 0; i < kb.length; i++) if (kb.readInt8(i) >= 0 && (tb.readUInt16BE(i * 2) & 0x7ff) !== 0) p++;
          painted.push(p); cells.push(kb.length);
        }
        own = { exit: bk.status, clipact, painted, cells };
      } else own = { exit: bk.status, stderr: String(bk.stderr).slice(-400) };
    } finally { rmSync(outDir, { recursive: true, force: true }); }
    if (!own || own.exit !== 0 || !own.clipact) {
      check('DP.11', `the real ${actId} act on the page`, 'UNMEASURABLE', `the harness's own bake of ${manPath} did not answer: ${J(own)}`);
      return;
    }
    const pool = own.clipact.pool;
    console.log(`    ${actId}      : on disk ${gw} x ${gh} sections, clips ${J(man.clips.map((k) => k.id))}, corridors ${J(corridors.map((k) => k.id))}; `
      + `harness bake: pool ${pool.tiles} tiles / ${pool.pages} pages, painted cells per section ${J(own.painted)}`);

    // DP.11a the act list names every clip act aeon holds in the copy.
    const clipsRoot = join(COPY, dirname(dirname(O.clipsManifestPath(actId))));
    const actsOnDisk = readdirSync(clipsRoot).filter((a) => existsSync(join(COPY, O.clipsManifestPath(a)))).sort();
    const actsDom = await c.json('[...document.querySelectorAll("[data-donors-act]")].map((b) => b.getAttribute("data-donors-act")).sort()');
    const facts = await c.evalExpr('(document.querySelector("[data-donors-target-facts]") || {}).textContent || null');
    const wantFacts = `${O.clipsManifestPath(actId)}: ${gw} x ${gh} sections, ${man.clips.length} clip(s), ${corridors.length} corridor(s); on disk. Build it in aeon with S2CLIP=${actId} ./build.sh.`;
    check('DP.11a', `the act list holds every clip act in the copy (read from its disk), and the chosen ${actId}'s facts are its clips.json's: grid, clip and corridor counts`,
      J(actsDom) === J(actsOnDisk) && actsDom.includes(actId) && facts === wantFacts,
      `on disk ${J(actsOnDisk)}; DOM ${J(actsDom)}; facts ${J(facts)}; want ${J(wantFacts)}`);

    // DP.11b the pane holds the whole act and drew it from the bake: a section
    // drew iff the harness's own bake gives it a painted cell, and on the canvas
    // (read back) every painted section is non-blank and every section no clip
    // or corridor rectangle touches is blank.
    const s11 = await d.waitFor((s) => s.targetCompose && s.targetCompose.act === actId && s.targetPane && s.targetPane.bitmaps > 0, `${actId} composed`, 240, 250, { soft: true });
    await sleep(600);
    const T11 = await d.pane('target');
    const comp = s11.targetCompose && s11.targetCompose.act === actId ? s11.targetCompose.sections : [];
    const drewIff = own.painted.map((p, n) => ({ n, painted: p, drawn: (comp.find((x) => x.n === n) || { drawnPixels: null }).drawnPixels }));
    const iffOk = drewIff.length === gw * gh && drewIff.every((x) => x.painted !== null && x.drawn !== null && (x.painted > 0) === (x.drawn > 0))
      && drewIff.some((x) => x.painted > 0) && drewIff.some((x) => x.painted === 0);
    const W = gw * 2048; const H = gh * 2048;
    const tl = d.clientOf(T11, 0, 0); const br = d.clientOf(T11, W, H);
    const inView = T11.worldW === W && T11.worldH === H && tl.x >= T11.rect.left - 1 && tl.y >= T11.rect.top - 1
      && br.x <= T11.rect.left + T11.rect.width + 1 && br.y <= T11.rect.top + T11.rect.height + 1;
    // Row 235 (a): the drafted paste now lands on a FREE spot, i.e. in a section
    // no clip or corridor touches, and its accent outline (a fill and a stroke)
    // draws there. Those sections are left out of "blank", by the pane's own
    // paint report of the accent outline; at least one untouched section must
    // remain (checked below), so the clause cannot empty itself.
    const draftRects = (accentOf(s11.targetPane) ?? []).map((o) => o.rect);
    const rects = [...man.clips, ...corridors].map((k) => k.dst_rect).concat(draftRects);
    const touched = (n) => { const sx = (n % gw) * 2048; const sy = Math.floor(n / gw) * 2048;
      return rects.some((r) => r.x < sx + 2048 && r.x + r.w > sx && r.y < sy + 2048 && r.y + r.h > sy); };
    const boxes = own.painted.map((_, n) => { const a = d.clientOf(T11, (n % gw) * 2048, Math.floor(n / gw) * 2048); const b2 = d.clientOf(T11, (n % gw + 1) * 2048, (Math.floor(n / gw) + 1) * 2048);
      return { n, x0: a.x - T11.rect.left, y0: a.y - T11.rect.top, x1: b2.x - T11.rect.left, y1: b2.y - T11.rect.top }; });
    const read = await c.json(String.raw`(() => { const cv = document.querySelector('[data-zone-pane-canvas="target"]'); if (!cv) return null;
      const b = cv.getBoundingClientRect(); const k = cv.width / b.width; const ctx = cv.getContext('2d');
      return ${J(boxes)}.map((q) => { const x0 = Math.ceil((q.x0 + 3) * k), y0 = Math.ceil((q.y0 + 3) * k), x1 = Math.floor((q.x1 - 3) * k), y1 = Math.floor((q.y1 - 3) * k);
        if (x1 <= x0 || y1 <= y0) return { n: q.n, area: 0 };
        const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data; let drawn = 0; let opaque = 0;
        for (let i = 3; i < img.length; i += 4) { if (img[i] !== 0) drawn++; if (img[i] >= 250) opaque++; }
        const a = (x1 - x0) * (y1 - y0);
        return { n: q.n, area: a, share: +(drawn / a).toFixed(3), opaque: +(opaque / a).toFixed(3) }; }); })()`);
    // ART IS OPAQUE, THE CLIP'S OWN FILL IS NOT: a clip rectangle is filled at
    // alpha 0.06 (DONOR_MARK_FAINT_FILL), so "any alpha" over a section inside a
    // clip reads non-blank with NO art drawn (found by a plant that dropped the
    // bitmaps: 0.506 either way). So a painted section must show OPAQUE pixels
    // over at least a quarter of the share its painted cells cover (cells hold
    // transparent pixels too), and an untouched one no pixel at all.
    const canvasOk = !!read && read.every((r) => r.area > 100)
      && read.filter((r) => own.painted[r.n] > 0).every((r) => r.opaque > 0 && r.opaque >= 0.25 * (own.painted[r.n] / own.cells[r.n]))
      && read.filter((r) => !touched(r.n)).every((r) => r.share === 0)
      && read.some((r) => !touched(r.n));
    check('DP.11b', `the target pane holds the whole ${gw} x ${gh}-section act (both world corners in the pane) and drew it from aeon's bake: each section drew iff the harness's own bake paints a cell there, and the canvas, read back, is non-blank over every painted section and blank over every section no clip or corridor touches`,
      inView && iffOk && canvasOk,
      `dpr ${dpr}; pane ${J({ rect: T11.rect, view: T11.view, worldW: T11.worldW, worldH: T11.worldH })}; corners ${J({ tl, br })}; per section ${J(drewIff)}; canvas ${J(read)}; untouched ${J(own.painted.map((_, n) => n).filter((n) => !touched(n)))}`);

    // DP.11c aeon's readout for the act: the act line, the pool grid cell for
    // cell, and one collision line per clip, all against the harness's bake.
    const dom11 = await c.json(String.raw`(() => {
      const cells = {}; for (const el of document.querySelectorAll('[data-donors-pool-cell]')) cells[el.getAttribute('data-donors-pool-cell')] = el.textContent;
      const ids = [...document.querySelectorAll('[data-donors-pool-id]')].map((el) => el.getAttribute('data-donors-pool-id'));
      const box = document.querySelector('[data-donors-pool-rows]');
      return { act: (document.querySelector('[data-donors-readout-act]') || {}).textContent || null, state: box && box.getAttribute('data-donors-pool-rows'), cells, ids,
        sum: (document.querySelector('[data-donors-pool-sum]') || { getAttribute: () => null }).getAttribute('data-donors-pool-sum'),
        broken: !!document.querySelector('[data-donors-pool-broken]'), note: (document.querySelector('[data-donors-bake-note]') || {}).textContent || null,
        clipLines: [...document.querySelectorAll('[data-donors-readout-clip]')].map((el) => el.getAttribute('data-donors-readout-clip')) }; })()`);
    const fields = ['tiles', 'tiles_added', 'pages_touched', 'pages_exclusive'];
    const wantCells = {};
    for (const r of pool.per_clip) for (const f of fields) wantCells[`clip:${r.index}:${f}`] = String(r[f]);
    for (const r of pool.per_corridor || []) for (const f of fields) wantCells[`corridor:${r.index}:${f}`] = String(r[f]);
    const vp = own.clipact.verdict_at_placement; const col = own.clipact.collision;
    const wantAct = `${pool.tiles} pool tiles in ${pool.pages} pages; worst camera window ${vp.worst} of ${vp.frames} frames (${vp.over} over budget); ${col.attr_entries} of ${col.cap} collision attr entries`;
    const wantIds = [...pool.per_clip, ...(pool.per_corridor || [])].map((r) => r.id);
    const wantClipLines = (col.per_clip || []).map((p) => p.clip);
    check('DP.11c', `aeon's readout for ${actId} is the harness's own bake of it: the act line (pool tiles, pages, worst window, collision entries), the pool grid cell for cell over every clip and corridor, aeon's tile sum holding, and one collision line per clip`,
      !dom11.note && !!dom11.act && dom11.act.replace(/\s+/g, ' ').includes(wantAct) && dom11.state === 'present'
        && J(dom11.cells) === J(wantCells) && J(dom11.ids) === J(wantIds) && dom11.sum === 'holds' && !dom11.broken
        && J(dom11.clipLines) === J(wantClipLines) && wantClipLines.length === man.clips.length,
      `DOM ${J(dom11).slice(0, 900)}; want act ${J(wantAct)}; want ids ${J(wantIds)}; want collision lines ${J(wantClipLines)}`);
    await shot(`real-${actId}`);
    // For a person: the target pane magnified 2x, and aeon's readout scrolled into
    // view (it sits below the fold of the side panel on this window).
    await shot(`real-${actId}-pane`, { x: T11.rect.left, y: T11.rect.top, width: T11.rect.width, height: T11.rect.height, scale: 2 });
    await c.evalExpr('(document.querySelector("[data-donors-readout]") || { scrollIntoView() {} }).scrollIntoView({ block: "start" })');
    await sleep(300);
    await shot(`real-${actId}-readout`);
  }

  // ── DP.10 a real bake refusal, on screen ────────────────────────────────
  // aeon's own C4 paint (tools/test_clip_bake_json.py, and gen_bake_json.py
  // here): 2 << PLANE_RESERVED_SHIFT on plane A and 1 << it on plane B, one
  // cell, inside the marquee. The copy is this run's own and is deleted.
  const shiftRun = aeonTool(COPY, ['-c', 'import sys; sys.path.insert(0, "tools"); import collision_pipeline as CP; print(CP.PLANE_RESERVED_SHIFT)']);
  const SHIFT = Number(String(shiftRun.stdout).trim());
  if (shiftRun.status !== 0 || !Number.isInteger(SHIFT)) {
    check('DP.10', 'a real bake refusal on screen', 'UNMEASURABLE', `could not read PLANE_RESERVED_SHIFT from the copy: exit ${shiftRun.status} ${J(String(shiftRun.stderr).slice(-300))}`);
    return;
  }
  const st10 = zone.grid.section_px / 8;
  const cell = { r: m.y / 8 + 4, c: m.x / 8 + 4 };
  const secN10 = Math.floor(cell.r / st10) * zone.grid.w + Math.floor(cell.c / st10);
  const off10 = ((cell.r % st10) * st10 + (cell.c % st10)) * 2;
  for (const [suffix, word] of [['collattr', 2 << SHIFT], ['collattrb', 1 << SHIFT]]) {
    const f = join(zoneDir, `section_${secN10}.${suffix}.bin`);
    const buf = readFileSync(f);
    buf.writeUInt16BE(word, off10);
    writeFileSync(f, buf);
  }
  const ACT10 = 'hx_c4_act';
  await d.realClick('document.querySelector("[data-donors-act-new]")');
  await d.realClick('document.querySelector("[data-donors-new-act-id]")');
  await d.typeText(ACT10);
  await d.realClick('document.querySelector("[data-donors-new-act-start]")');
  const s10a = await d.waitFor((s) => s.paste.target && s.paste.target.actId === ACT10 && s.draft.clipId !== '' && s.draft.dst !== null, 'the C4 act and draft');
  // The candidate the page will send, rebuilt by the tree's own document code,
  // baked by the HARNESS with aeon's own CLI: that answer is the expectation.
  const d10 = s10a.draft;
  const cand = { schema: 1, units: 'world_px', id: ACT10, act: { grid_w: Math.ceil(m.w / 2048), grid_h: Math.ceil(m.h / 2048) },
    clips: [{ id: d10.clipId, donor: 's2disasm', zone: 'EHZ', src_rect: { x: m.x, y: m.y, w: m.w, h: m.h }, dst_rect: { x: d10.dst.x, y: d10.dst.y, w: m.w, h: m.h } }] };
  const candDir = mkdtempSync(join(os.tmpdir(), 'donor-page-c4-'));
  let own = null;
  try {
    writeFileSync(join(candDir, 'clips.json'), `${JSON.stringify(cand, null, 2)}\n`);
    const vv = aeonTool(COPY, ['tools/clip_manifest.py', 'validate', join(candDir, 'clips.json'), '--donor-root', donorsDir, '--json']);
    const bb = aeonTool(COPY, ['tools/clip_act_bake.py', 'bake', join(candDir, 'clips.json'), '--out', join(candDir, 'out'), '--json']);
    own = { validateExit: vv.status, bakeExit: bb.status, bake: (() => { try { return JSON.parse(bb.stdout); } catch { return null; } })() };
  } finally { rmSync(candDir, { recursive: true, force: true }); }
  const ownRefusal = own && own.bake && own.bake.refusals && own.bake.refusals[0];
  await sleep(300);
  const edge10before = await edgeRead({ x: d10.dst.x, y: d10.dst.y, w: m.w, h: m.h });
  const paste10 = await d.realClick('document.querySelector("[data-donors-paste-button]")');
  const s10 = await d.waitFor((s) => s.paste.outcome && !s.paste.busy, 'the C4 outcome', 240);
  const dom10 = await c.json(String.raw`(() => { const n = document.querySelector('[data-donors-refusal-note]');
    return n ? { rule: (n.querySelector('[data-donors-note-rule]') || {}).textContent, subjects: (n.querySelector('[data-donors-note-subjects]') || {}).textContent,
      stage: (document.querySelector('[data-donors-stage]') || { getAttribute: () => null }).getAttribute('data-donors-stage') } : null; })()`);
  const s10o = await d.waitFor((s) => (dashedOf(s.targetPane) ?? []).length > 0, 'the C4 outline', 40, 250, { soft: true });
  await sleep(300);
  const rect10 = { x: d10.dst.x, y: d10.dst.y, w: m.w, h: m.h };
  const edge10 = await edgeRead(rect10);
  const wantSubj10 = ownRefusal ? ownRefusal.subjects.map((x) => `${x.kind} ${x.index} ${x.id}`).join(' and ') : null;
  await shot('bake-refused');
  check('DP.10', 'A REAL BAKE REFUSAL ON SCREEN: over the painted donor, aeon\'s loader accepts and aeon\'s BAKE refuses the paste; the page shows stage bake with the rule and clip exactly as the harness\'s own bake --json names them (C4, the pasted clip), outlines that clip dashed and tagged with the rule, and writes nothing',
    !!own && own.validateExit === 0 && own.bakeExit === 1 && !!ownRefusal && ownRefusal.rule === 'C4' && !!(paste10 && paste10.hitOk)
      && s10.paste.outcome.kind === 'refused' && s10.paste.outcome.stage === 'bake'
      && !!dom10 && dom10.stage === 'bake' && dom10.rule === ownRefusal.rule && dom10.subjects === wantSubj10
      && J(dashedOf(s10o.targetPane)) === J([{ rect: rect10, tone: 'warning', dashed: true, tag: ownRefusal.rule }])
      && edge10before.warn === 0 && edge10.warn > 0.2 * edge10.n && edge10.runs >= 3
      && !existsSync(join(COPY, O.clipsManifestPath(ACT10))),
    `painted cell ${J(cell)} (section ${secN10}, shift ${SHIFT}); harness's own validate exit ${own && own.validateExit}, bake exit ${own && own.bakeExit}, refusal ${J(ownRefusal).slice(0, 300)}; `
      + `page outcome ${J(s10.paste.outcome && { kind: s10.paste.outcome.kind, stage: s10.paste.outcome.stage })}; DOM ${J(dom10)} (want subjects ${J(wantSubj10)}); dashed ${J(dashedOf(s10o.targetPane))}; edge before ${J(edge10before)}, after ${J(edge10)}`);

  // ── DP.10t the tag sits under the id label ──────────────────────────────
  // ZonePane draws an outline's label with its baseline 13 px below the top
  // edge (11 px font) and the tag's 26 px below (10 px bold): the id band is
  // rows 3..14, the tag band rows 17..28, both from 4 px in, 40 px wide.
  const idBand = await bandRead(rect10, { x0: 4, x1: 44, y0: 3, y1: 15 });
  const tagBand = await bandRead(rect10, { x0: 4, x1: 44, y0: 17, y1: 29 });
  // (`lit` is printed, not judged: the art under the rectangle is bright, so it
  // read 480/480 in both bands and could not tell a label from no label.)
  check('DP.10t', 'the rule tag is drawn UNDER the clip\'s id label, not over it: the id band holds no warning pixel, the band below holds the warning tag',
    !!idBand && !!tagBand && idBand.warn === 0 && tagBand.warn > 5,
    `id band ${J(idBand)}; tag band ${J(tagBand)}; rect ${J(rect10)}`);
}

main().catch((e) => { console.error(e); process.exit(3); });
