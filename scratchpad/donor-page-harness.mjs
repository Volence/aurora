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
    [doc, 'clipsManifestPath'], [doc, 'suggestDestination'], [doc, 'newClipManifest']]) {
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
  const waitFor = async (pred, what, tries = 80, ms = 250) => {
    let s = null;
    for (let i = 0; i < tries; i++) { s = await st(); if (pred(s)) return s; await sleep(ms); }
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
    await rows(d, O, COPY, dpr);
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
  const shot = async (name) => {
    if (!process.env.SHOT_DIR) return;
    const r = await c.send('Page.captureScreenshot', { format: 'png' });
    const f = join(process.env.SHOT_DIR, `donor-page-${name}.png`);
    writeFileSync(f, Buffer.from(r.data, 'base64'));
    console.log(`    shot         : ${f}`);
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
  if (!fileText) return;
  const v = aeonTool(COPY, ['tools/clip_manifest.py', 'validate', path, '--donor-root', donorsDir]);
  check('DP.6b', 'aeon\'s own loader, run by the harness on the file ON DISK, accepts it',
    v.status === 0 && /clips\.json OK/.test(v.stdout), `exit ${v.status}; ${String(v.stdout).trim().split('\n')[0]}`);
  const outDir = mkdtempSync(join(os.tmpdir(), 'donor-page-bake-'));
  try {
    const bk = aeonTool(COPY, ['tools/clip_act_bake.py', 'bake', path, '--out', outDir]);
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

  await shot('pasted');
  // ── DP.7 a paste aeon refuses ───────────────────────────────────────────
  const shaBefore = sha(readFileSync(path));
  const T = await d.pane('target');
  const tp = d.clientOf(T, wantDst.x + 64, wantDst.y + 64);
  const tAim = { x: Math.round(tp.x), y: Math.round(tp.y) };
  await d.clickAt(tAim);
  const s7a = await d.waitFor((s) => s.draft.dst !== null && s.draft.dst.x === wantDst.x && s.draft.dst.y === wantDst.y && s.draft.clipId !== '', 'the overlapping placement');
  await d.realClick('document.querySelector("[data-donors-paste-button]")');
  const s7 = await d.waitFor((s) => s.paste.outcome && !s.paste.busy && s.paste.outcome.kind !== 'pasted', 'the refusal', 160);
  const shown = await c.evalExpr('(document.querySelector("[data-donors-refusal]") || {}).textContent || null');
  await shot('refused');
  check('DP.7', 'a REAL click on the target pane places a second paste over the first; aeon REFUSES it naming R10, the page shows aeon\'s own words, and clips.json on disk is byte-identical',
    s7.paste.outcome.kind === 'refused' && /R10/.test(s7.paste.outcome.text) && !!shown && /R10/.test(shown) && sha(readFileSync(path)) === shaBefore,
    `target aim ${J(tAim)} (view ${J(T.view)}, rect ${J(T.rect)}); draft ${J(s7a.draft)}; outcome ${J(s7.paste.outcome).slice(0, 400)}`);

  // ── DP.8 undo by a real Ctrl+Z, redo by a real click ────────────────────
  const pasted = readFileSync(path);
  await c.evalExpr('document.activeElement && document.activeElement !== document.body && document.activeElement.blur()');
  const focus = (await d.st()).focusedDocId;
  await d.chord('z', CTRL);
  const s8 = await d.waitFor((s) => s.paste.outcome && s.paste.outcome.kind === 'undone', 'the undo', 80);
  const goneAfterUndo = !existsSync(path);
  check('DP.8a', 'a REAL Ctrl+Z on the Donors facet undoes the paste: the clips.json it created is GONE from disk',
    focus === 'doc:donor-paste' && goneAfterUndo && s8.paste.outcome.removed === true,
    `focused doc ${focus}; outcome ${J(s8.paste.outcome)}; on disk ${goneAfterUndo ? 'absent' : 'STILL THERE'}`);
  await d.realClick('document.querySelector("[data-donors-redo]")');
  const s8b = await d.waitFor((s) => s.paste.outcome && s.paste.outcome.kind === 'redone', 'the redo', 80);
  const back = existsSync(path) ? readFileSync(path) : null;
  check('DP.8b', 'a REAL click on Redo writes the paste back, byte-identical to what the paste wrote',
    !!back && Buffer.compare(back, pasted) === 0, `outcome ${J(s8b.paste.outcome)}; bytes ${back ? back.length : 'ABSENT'} vs ${pasted.length}`);
}

main().catch((e) => { console.error(e); process.exit(3); });
