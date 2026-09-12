#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// CDP SWEEP 3, 2026-09-12. Three fixes proven only by node tests, looked at on
// a running app, on COPIES of the projects, on a private virtual display.
// ═══════════════════════════════════════════════════════════════════════════
//
// SOURCES (where a packet and the tree disagree the tree wins and the output
// says so):
//   docs/reviews/2026-09-12-classic-failed-open.md            section 7, F-1 to F-4
//   docs/reviews/2026-09-12-paste-status-bar-and-art-only.md  section 10, F-1 to F-5 (+ section 9 O-1, width)
//   docs/reviews/2026-09-12-paste-hint-and-chosen.md          section 7, F-1, F-2
//
// ROW PREFIXES
//   CFO.*  classic-failed-open         (PART=classic)
//   PSB.*  paste-status-bar-and-art-only (PART=paste)
//   PHC.*  paste-hint-and-chosen       (PART=paste)
//   PART=all (the default) runs classic first, then paste, in ONE launch.
//
// THE COPIES. Never a live tree.
//   * aeon: a tarball made by `git -C <aeon> archive -o <tar> <sha>` (env
//     SWEEP3_AEON_TAR). Per run, copy A is extracted and extended exactly as
//     cdp-sweep-2's makeCopy does (act2 in ojz, zone `zb` drawn with an inverted
//     tile set, a name suffix), so zone B exists. Copy X is extracted and its
//     project.json has zones[0].id deleted: engine stays "s4", so the classic
//     router hands it to the aeon loader, and loadS4Config throws.
//   * Sonic 1: a tarball made by `git -C <s1disasm> archive -o <tar> HEAD` (env
//     SWEEP3_S1_TAR), extracted twice (S1a, S1b) into mkdtemp directories.
//
// EXPECTATIONS COME FROM THE APP'S OWN SOURCE. `src/core/editing/map-clipboard.ts`
// of the tree under test is bundled with esbuild at start and `pasteLayerOffer`,
// `PASTE_HINT`, `COLLISION_ONLY_HERE`, `OTHER_TILESET_REFUSAL` are imported from
// it. Sentences that live in React files are read out of the source text with a
// regex that must match exactly once (loud if not): the not-recognized banner
// (classicProjectStore.ts), the loader reason (s4-config.ts), the bar's paste
// label (map-status-model.ts), the stamp line (map-status-aeon.ts), the
// no-collision toast (MapViewport.tsx), the chosen-dead style
// (MarqueePasteOptions.tsx). The CLICK is a second, independent oracle: where a
// line names a gesture refused / pasting nothing / landing, a real click with
// that gesture is made and its toast and the word planes are read.
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//   * A SYNTHETIC EVENT THE APP IGNORES. Every gesture is Input.dispatchMouse
//     Event / dispatchKeyEvent / insertText at an INTEGER client pixel after a
//     hit test. `__dbg` is used for READS, camera setup, and opening the aeon
//     copy for the paste part only (that open is not the step under test). The
//     classic rows ARE about the Home path box: typed, Enter pressed, for real.
//   * TEXT IN THE DOM THAT IS NOT ON SCREEN. Every "on screen" read is the
//     paint test (rects, a strict hit at the integer centre, containment in the
//     nearest scroller's box and the viewport), plus a capture of the box.
//   * A BANNER LEFT OVER FROM THE STEP BEFORE. The banner is dismissed by a real
//     click and read absent before each failing open.
//   * A FIELD THAT NEVER CLEARS. "Keeps the typo" is only a claim because the
//     same field is read EMPTY after each successful open (CFO.0b, CFO.F4.a).
//   * A PREMISE THAT IS ABSENT. F-2's stale project exists only if the aeon
//     store still holds copy A while Sonic 1 is open: CFO.F2.0 reads it.
//     Zone B is another tile set only if its zone-art hash differs: PSB.0a.
//     Paste is armed only if the bar's label turns to the paste label and the
//     ghost's paint count advances.
//   * A STATUS LINE THAT OFFERS NOTHING. A line offering no gesture offers no
//     refused one; each wording row compares the WHOLE line to the module's.
//   * TWO RUNS STITCHED. Every row's evidence comes from the run printing it;
//     dpr and rects are printed beside the rows. Width is measured at two
//     window widths IN ONE RUN.
//   * A TOAST IN A CAPTURE. Toasts are dismissed by real clicks, and no capture
//     used in a pixel compare is taken while one is painted.
//
// NO EMULATOR, EVER. ORACLE_SOCKET points inside a directory this file makes
// with mkdtemp; nothing here presses the Aether badge. Nothing presses a
// button that opens a native dialog (Open Project, Browse).
// CLEANUP IS BY PID: spawnGuarded + awaited killTree.
//
// RUN (from a worktree, BOTH variables, or the main checkout's dist answers):
//   VITE_AURORA_DEBUG=1 npm run build
//   SWEEP3_AEON_TAR=<tar> SWEEP3_S1_TAR=<tar> AURORA_BUILT_TREE=<this tree> \
//     ELECTRON_BIN=<electron> [PART=classic|paste|all] [RUN_TAG=run1] \
//     node scratchpad/cdp-sweep-3-0912-harness.mjs

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
import { spawnGuarded, killTree, RUN_PROFILE_DIR } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
assertFreshBuild(RUN);
assertDebugBuild(RUN);
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const PORT = Number(process.env.PORT ?? 9412);
const PART = process.env.PART ?? 'all';
if (!['classic', 'paste', 'all'].includes(PART)) throw new Error('PART must be classic, paste or all');
const TAG = process.env.RUN_TAG ?? new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const CAP_REL = 'docs/captures/2026-09-12-cdp-sweep-3';
const CAPTURES = `${ROOT}/${CAP_REL}`;
mkdirSync(CAPTURES, { recursive: true });

const AEON_TAR = process.env.SWEEP3_AEON_TAR ?? '';
const S1_TAR = process.env.SWEEP3_S1_TAR ?? '';
for (const [n, t] of [['SWEEP3_AEON_TAR', AEON_TAR], ['SWEEP3_S1_TAR', S1_TAR]]) {
  if (!t || !existsSync(t)) {
    console.log(`HARNESS REFUSES: ${n} must name a tarball made with git archive (see the header).`);
    process.exit(2);
  }
}

const SOCK_DIR = mkdtempSync('/tmp/cdps3-sock-');
const SOCK = join(SOCK_DIR, 'o.sock');
for (const forbidden of ['/tmp/oracle.sock', `${process.env.XDG_RUNTIME_DIR ?? '/nonexistent'}/oracle.sock`]) {
  if (SOCK === forbidden) throw new Error(`refusing: ORACLE_SOCKET would be ${forbidden}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══ THE ORACLE: the tree's own modules and source strings ═════════════════
const SRC = (p) => readFileSync(`${RUN.root}/${p}`, 'utf8');
/** One regex, exactly one match, or the harness stops: an expectation that
 *  could not be read is not an expectation. */
function fromSource(file, re, what) {
  const text = SRC(file);
  const all = [...text.matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))];
  if (all.length !== 1) throw new Error(`ORACLE: ${what} matched ${all.length} times in ${file} (want 1): ${re}`);
  return all[0];
}
async function loadOracle() {
  const req = createRequire(`${RUN.root}/package.json`);
  const esb = req('esbuild');
  const r = esb.buildSync({
    entryPoints: [`${RUN.root}/src/core/editing/map-clipboard.ts`], bundle: true, format: 'esm',
    platform: 'node', write: false, logLevel: 'error',
  });
  const m = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
  for (const k of ['pasteLayerOffer', 'PASTE_HINT', 'PASTE_ESC', 'COLLISION_ONLY_HERE', 'OTHER_TILESET_REFUSAL']) {
    if (m[k] === undefined) throw new Error(`ORACLE: map-clipboard.ts exports no ${k}`);
  }
  const notRecognized = fromSource('src/renderer/state/classicProjectStore.ts',
    /`"\$\{dir\}"( is not a recognized project\.)\\n`/, 'the not-recognized sentence')[1];
  const zoneNoId = fromSource('src/core/config/s4-config.ts',
    /if \(!zone\.id\) throw new Error\('([^']+)'\)/, 'the loader reason for a zone with no id')[1];
  // ⚠ The red-first build (846fcaf2 reverted) aborted here: before the fix the
  // same `label: 'Paste'` sat in a multi-line block. Both shapes are accepted;
  // still exactly one match, still loud on zero.
  const pasteLabel = fromSource('src/renderer/components/shared/map-status-model.ts',
    /if \(s\.pasting\)\s*(?:\{\s*)?return \{\s*label: '([^']+)'/, 'the bar label while pasting')[1];
  const stampSuffix = fromSource('src/renderer/providers/map-status-aeon.ts',
    /return `Chunk: \$\{selectedChunkId\}([^`]*)`/, 'the stamp line')[1];
  const stampNone = fromSource('src/renderer/providers/map-status-aeon.ts',
    /if \(!selectedChunkId\) return '([^']+)'/, 'the stamp line with no chunk')[1];
  const nc = fromSource('src/renderer/components/MapViewport.tsx',
    /'(This clipboard carries no collision: [^']*)'\s*\+\s*'([^']*)'/, 'the no-collision toast');
  const chosenDead = fromSource('src/renderer/components/MarqueePasteOptions.tsx',
    /planeChosenDead: \{ opacity: ([0-9.]+), borderColor: T\.warning, borderStyle: '([a-z]+)' \}/, 'the chosen-dead style');
  const plainDead = fromSource('src/renderer/components/MarqueePasteOptions.tsx',
    /planeDead: \{ opacity: ([0-9.]+),/, 'the plain dead style');
  const homeLabels = {
    none: fromSource('src/renderer/components/home/HomeTab.tsx', /label="(…or type a project directory path)"/, 'the no-project field label')[1],
    switch: fromSource('src/renderer/components/home/HomeTab.tsx', /label="(…or type another project directory path)"/, 'the switch field label')[1],
  };
  return {
    m, notRecognized, zoneNoId, pasteLabel, stampSuffix, stampNone,
    noCollision: nc[1] + nc[2],
    chosenDead: { opacity: chosenDead[1], borderStyle: chosenDead[2] }, plainDeadOpacity: plainDead[1],
    homeLabels,
  };
}

// ═══ THE COPIES ════════════════════════════════════════════════════════════
const ED = 'games/sonic4/data/editor';
const liveAeon = (() => { try { return siblingDefaultPath('aeon'); } catch { return null; } })();
const liveS1 = (() => { try { return siblingDefaultPath('s1disasm'); } catch { return null; } })();
function extract(tar, prefix) {
  const dir = mkdtempSync(`/tmp/cdps3-${prefix}-`);
  for (const live of [liveAeon, liveS1]) {
    if (live && resolvePath(dir) === resolvePath(live)) throw new Error('refusing: a copy is a live tree');
  }
  const x = spawnSync('tar', ['-x', '-f', tar, '-C', dir]);
  if (x.status !== 0) throw new Error(`tar -x exited ${x.status}: ${x.stderr}`);
  return realpathSync(dir);
}
/** cdp-sweep-2's makeCopy, unchanged in what it adds. */
function makeAeonCopy(label) {
  const dir = extract(AEON_TAR, `aeon${label}`);
  const pj = JSON.parse(readFileSync(`${dir}/project.json`, 'utf8'));
  if (pj.zones.length !== 1 || pj.zones[0].id !== 'ojz' || pj.zones[0].acts.length !== 1) {
    throw new Error(`the published tree is not the one-zone one-act shape: ${JSON.stringify(pj.zones.map((z) => [z.id, z.acts.map((a) => a.id)]))}`);
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
  pj.name = `${pj.name} (sweep3 ${label})`;
  writeFileSync(`${dir}/project.json`, `${JSON.stringify(pj, null, 2)}\n`);
  return { dir, name: pj.name };
}
/** F-3's broken checkout: engine stays "s4", zones[0].id is deleted. */
function makeBrokenAeon() {
  const dir = extract(AEON_TAR, 'aeonX');
  const pj = JSON.parse(readFileSync(`${dir}/project.json`, 'utf8'));
  delete pj.zones[0].id;
  writeFileSync(`${dir}/project.json`, `${JSON.stringify(pj, null, 2)}\n`);
  return { dir, engine: pj.engine };
}
function tarCommit(tar) {
  const r = spawnSync('git', ['get-tar-commit-id'], { input: readFileSync(tar) });
  return r.status === 0 ? String(r.stdout).trim() : `(unreadable: exit ${r.status})`;
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
function diffImgs(a, b) {
  if (!a || !b || a.w !== b.w || a.h !== b.h) return { comparable: false, sizes: a && b ? [a.w, a.h, b.w, b.h] : null };
  let n = 0;
  for (let i = 0; i < a.w * a.h; i++) {
    const o = i * 4;
    if (a.px[o] !== b.px[o] || a.px[o + 1] !== b.px[o + 1] || a.px[o + 2] !== b.px[o + 2]) n++;
  }
  return { comparable: true, changed: n, total: a.w * a.h };
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
  // ⚠ RUN 1 HUNG for ten minutes inside one CDP call (a clip capture after two
  // that had returned) and printed nothing. Every call now has a deadline, so a
  // hang is a LOUD error naming the method, never a silent stall.
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
const J = (x) => JSON.stringify(x);

/** THE PAINT TEST (cdp-sweep-0911's): rects, a strict hit at the integer
 *  centre, the nearest scroller's box on both axes, and the viewport. */
const PAINTED = (selectorExpr) => String.raw`
(() => {
  const el = ${selectorExpr};
  if (!el) return { found: false };
  const b = el.getBoundingClientRect();
  let sc = el.parentElement;
  while (sc && sc !== document.body) {
    const cs = getComputedStyle(sc);
    if (/(auto|scroll)/.test(cs.overflowY + ' ' + cs.overflowX)) break;
    sc = sc.parentElement;
  }
  const sb = sc && sc !== document.body ? sc.getBoundingClientRect() : null;
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    found: true, text: (el.innerText || el.textContent || el.value || '').trim().slice(0, 400),
    rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) },
    rects: el.getClientRects().length,
    visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
    hitInside: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))),
    inScrollerBox: sb ? (b.top >= sb.top - 0.5 && b.bottom <= sb.bottom + 0.5 && b.left >= sb.left - 0.5 && b.right <= sb.right + 0.5) : null,
    inViewport: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
    dpr: window.devicePixelRatio,
  };
})()`;
const onScreen = (p) => !!(p && p.found && p.rects > 0 && p.hitInside === true && p.inViewport === true && p.inScrollerBox !== false);

const TOASTS = String.raw`
(() => [...document.querySelectorAll('div[title="Dismiss"]')].map((el) => {
  const b = el.getBoundingClientRect();
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    text: (el.innerText || '').trim(), x: cx, y: cy,
    rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) },
    rects: el.getClientRects().length,
    hitInside: !!(hit && (hit === el || el.contains(hit))),
    inViewport: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
    border: getComputedStyle(el).borderTopColor,
  };
}))()`;
const toastPainted = (t) => !!(t && t.rects > 0 && t.hitInside === true && t.inViewport === true);

async function main() {
  const t0 = Date.now();
  console.log('=== cdp-sweep-3 2026-09-12 harness ===');
  console.log(`    PART         : ${PART}`);
  console.log(`    node         : ${process.version}`);
  console.log(`    loadavg      : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    ORACLE_SOCKET: ${SOCK}   (private; made by this run)`);
  console.log(`    profile      : ${RUN_PROFILE_DIR}   (pinned by spawnGuarded, fresh per process)`);
  console.log(`    PORT         : ${PORT}   DISPLAY: xvfb-run -a (never :0)`);
  console.log(`    captures     : ${CAP_REL}   tag ${TAG}`);
  console.log(`    aeon tarball : ${AEON_TAR}   commit ${tarCommit(AEON_TAR)}`);
  console.log(`    s1 tarball   : ${S1_TAR}   commit ${tarCommit(S1_TAR)}`);
  const O = await loadOracle();
  console.log(`    oracle       : ${RUN.root}/src/core/editing/map-clipboard.ts bundled; PASTE_HINT ${J(O.m.PASTE_HINT)}`);
  const A = makeAeonCopy('A');
  const X = makeBrokenAeon();
  const S1a = extract(S1_TAR, 's1a');
  const S1b = extract(S1_TAR, 's1b');
  console.log(`    copy A       : ${A.dir}   name ${J(A.name)}`);
  console.log(`    copy X       : ${X.dir}   (zones[0].id deleted, engine ${J(X.engine)})`);
  console.log(`    copy S1a     : ${S1a}`);
  console.log(`    copy S1b     : ${S1b}`);

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
    console.log(`    dpr at start : ${await c.evalExpr('window.devicePixelRatio')}`);
    const d = driver(c, page);
    if (PART !== 'paste') {
      try { await classicPart(d, O, { A, X, S1a, S1b }); } catch (e) {
        await d.shot('classic-aborted').catch(() => {});
        check('CFO.ABORT', `the classic part stopped early: rows after this point did NOT run (${e.message})`, 'UNMEASURABLE', e.stack);
      }
    }
    if (PART !== 'classic') {
      try { await pastePart(d, O, { A }); } catch (e) {
        await d.shot('paste-aborted').catch(() => {});
        check('PSB.ABORT', `the paste part stopped early: rows after this point did NOT run (${e.message})`, 'UNMEASURABLE', e.stack);
      }
    }
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
    try { rmSync(SOCK_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
    if (!process.env.KEEP_COPY) {
      for (const dir of [A.dir, X.dir, S1a, S1b]) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } }
    }
  }

  const pass = results.filter((r) => r.ok === true).length;
  console.log(`\n════ PART=${PART}: ${pass}/${results.length} rows PASS · ${fails.length} FAIL · ${unmeasurable.length} UNMEASURABLE · `
    + `${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     loadavg at end ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  console.log('END-OF-RUN');
  process.exit(fails.length || unmeasurable.length ? 1 : 0);
}

// ═══ THE DRIVER: gestures, reads, captures ═════════════════════════════════
const ALT = 1; const CTRL = 2; const SHIFT = 8;
function driver(c, page) {
  const mouse = (type, x, y, button = 'none', buttons = 0, modifiers = 0) =>
    c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1, modifiers });
  /** Aim at the element's integer centre, only if a hit test lands on it. */
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
  const namedKey = async (k, vk, text) => {
    const p = { key: k, code: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...p, ...(text ? { text } : {}) });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    await sleep(300);
  };
  const shot = async (name) => {
    const s = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURES}/${name}-${TAG}.png`, Buffer.from(s.data, 'base64'));
    console.log(`   shot: ${CAP_REL}/${name}-${TAG}.png`);
    return `${CAP_REL}/${name}-${TAG}.png`;
  };
  /** A capture of one element's box (integer clip, inside the viewport), decoded. */
  // ⚠ RUN 1 (second attempt) ABORTED THE CLASSIC PART HERE: the Home path box
  // sat BELOW the viewport (top 873 in an 872px window), the clip came out with
  // height -1, and Chromium never answers a capture with a non-positive clip.
  // So an element outside the viewport is scrolled into view first (DOM
  // positioning for a picture, not a gesture: nothing is clicked), and a clip
  // that is still not positive is refused out loud rather than sent.
  const grabEl = async (selectorExpr, name, pad = 2) => {
    const r = await c.json(String.raw`(() => { const el = ${selectorExpr}; if (!el) return null;
      let b = el.getBoundingClientRect(); let scrolled = false;
      if (b.top < 0 || b.left < 0 || b.bottom > innerHeight || b.right > innerWidth) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' }); scrolled = true; b = el.getBoundingClientRect();
      }
      return { x: b.left, y: b.top, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight, scrolled }; })()`);
    if (!r || r.w <= 0 || r.h <= 0) { console.log(`   capture ${name}: element absent or empty ${J(r)}`); return null; }
    const x = Math.max(0, Math.floor(r.x) - pad); const y = Math.max(0, Math.floor(r.y) - pad);
    const x1 = Math.min(r.vw, Math.ceil(r.x + r.w) + pad); const y1 = Math.min(r.vh, Math.ceil(r.y + r.h) + pad);
    const clip = { x, y, width: x1 - x, height: y1 - y, scale: 1 };
    if (clip.width <= 0 || clip.height <= 0) { console.log(`   capture ${name}: REFUSED, the clip is not positive after scrolling ${J({ r, clip })}`); return null; }
    if (r.scrolled) console.log(`   capture ${name}: the element was outside the viewport and was scrolled into view for the picture`);
    const s = await c.send('Page.captureScreenshot', { format: 'png', clip });
    const buf = Buffer.from(s.data, 'base64');
    const path = `${CAP_REL}/${name}-${TAG}.png`;
    writeFileSync(`${ROOT}/${path}`, buf);
    console.log(`   clip: ${path}  (clip ${J(clip)})`);
    return { path, clip, img: decodePng(buf) };
  };
  const toasts = () => c.json(TOASTS).catch(() => []);
  const toastStore = () => c.json('window.__dbg.aeon.toasts()').catch(() => []);
  /** Every painted toast dismissed by a real click on it; then none left. */
  const clearToasts = async () => {
    for (let i = 0; i < 12; i++) {
      const ts = await toasts();
      if (ts.length === 0) return true;
      const t = ts.find(toastPainted) ?? ts[0];
      if (toastPainted(t)) await clickAt({ x: t.x, y: t.y });
      else await sleep(400);
    }
    for (let i = 0; i < 60; i++) { if ((await toasts()).length === 0) return true; await sleep(250); }
    return false;
  };
  const waitToast = async (pred, maxMs = 4000) => {
    const t = Date.now();
    while (Date.now() - t < maxMs) {
      const hit = (await toasts()).find((x) => pred(x.text));
      if (hit) return hit;
      await sleep(80);
    }
    return null;
  };
  const dpr = () => c.evalExpr('window.devicePixelRatio');
  const tabs = () => c.json(`[...document.querySelectorAll('[role="tablist"] > div')].map((t) => t.title)`);
  const HOME_TAB = String.raw`[...document.querySelectorAll('[role="tablist"] > div')].find((t) => t.title === 'Home') || null`;
  const pressTab = async (sel) => { const p = await realClick(sel); await sleep(700); return p; };
  const FACET = (label) => `[...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === ${J(label)}) || null`;
  const facets = () => c.json(`[...document.querySelectorAll('[aria-label="Facets"] button')].map((b) => b.textContent.trim())`);
  return {
    c, page, mouse, aim, clickAt, realClick, chord, namedKey, shot, grabEl, toasts, toastStore, clearToasts, waitToast,
    dpr, tabs, HOME_TAB, pressTab, FACET, facets,
  };
}

/** The window's width, through the Browser domain: the page session first,
 *  the browser endpoint second. Returns what it used, so the report can say. */
async function windowControl(d) {
  try {
    const w = await d.c.send('Browser.getWindowForTarget');
    return { via: 'page session', windowId: w.windowId, bounds: w.bounds, send: d.c.send, close: () => {} };
  } catch (e1) {
    const ver = await getJSON('/json/version');
    const b = cdp(ver.webSocketDebuggerUrl);
    await b.ready;
    const w = await b.send('Browser.getWindowForTarget', { targetId: d.page.id });
    return { via: `browser endpoint (page session said: ${e1.message})`, windowId: w.windowId, bounds: w.bounds, send: b.send, close: () => b.close() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PART classic: docs/reviews/2026-09-12-classic-failed-open.md section 7.
// One cold start, then F-1, F-3, F-4, F-2 in that order (F-2 needs an aeon
// project opened BEFORE Sonic 1, which F-4's second switch provides).
// ═══════════════════════════════════════════════════════════════════════════
async function classicPart(d, O, { A, X, S1a, S1b }) {
  const { c } = d;
  const PATH_INPUT = `document.querySelector('input[aria-label="Project directory path"]')`;
  const HEADER_EL = String.raw`(() => { const input = ${PATH_INPUT};
    const wrap = input ? input.closest('[data-testid="open-by-path"]') : null;
    const col = wrap ? wrap.parentElement : null;
    return col ? [...col.children].find((k) => k.tagName === 'DIV' && k.firstElementChild
      && /^(S1|AEON)$/.test((k.firstElementChild.textContent || '').trim())) || null : null; })()`;
  const HOME = String.raw`(() => {
    const input = ${PATH_INPUT};
    const wrap = input ? input.closest('[data-testid="open-by-path"]') : null;
    const header = ${HEADER_EL};
    const hb = header ? header.getBoundingClientRect() : null;
    return {
      field: input ? input.value : null,
      fieldLabel: wrap && wrap.firstElementChild ? wrap.firstElementChild.textContent.trim() : null,
      chip: header ? header.children[0].textContent.trim() : null,
      name: header && header.children[1] ? header.children[1].textContent.trim() : null,
      dir: header && header.children[2] ? header.children[2].textContent.trim() : null,
      headerRect: hb ? { x: +hb.x.toFixed(2), y: +hb.y.toFixed(2), w: +hb.width.toFixed(2), h: +hb.height.toFixed(2) } : null,
    };
  })()`;
  const FIELD_WRAP = `document.querySelector('[data-testid="open-by-path"]')`;
  const TABSTRIP = `document.querySelector('[role="tablist"]')`;
  const BANNER_BTN = String.raw`([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Dismiss'
    && b.parentElement && b.parentElement.firstElementChild && b.parentElement.firstElementChild.tagName === 'SPAN') || null)`;
  const BANNER = `(() => { const b = ${BANNER_BTN}; return b ? b.parentElement : null; })()`;
  const bannerNow = () => c.json(PAINTED(BANNER));
  const bannerText = () => c.evalExpr(`(() => { const b = ${BANNER}; return b ? b.firstElementChild.innerText : null; })()`);
  const home = () => c.json(HOME);
  const proj = () => c.json('window.__dbg.projStatus()');
  const lvl = () => c.json('window.__dbg.levelState()');
  const aeonSt = () => c.json('window.__dbg.aeon.state()').catch((e) => ({ error: e.message }));
  const bannerPresent = () => c.evalExpr(`!!(${BANNER})`);
  const dismissBanner = async () => {
    const was = await bannerPresent();
    const p = was ? await d.realClick(BANNER_BTN) : null;
    await sleep(300);
    return { was, pressed: p, goneAfter: !(await bannerPresent()) };
  };
  /** Home tab, a real click in the path box, Ctrl+A, Backspace, the path, Enter. */
  const typedOpen = async (path, done, maxMs = 40000) => {
    const homeTab = await d.pressTab(d.HOME_TAB);
    const field = await d.realClick(PATH_INPUT);
    await sleep(150);
    await d.chord('a', CTRL);
    await d.namedKey('Backspace', 8);
    const cleared = await c.evalExpr(`(${PATH_INPUT}).value`);
    await c.send('Input.insertText', { text: path });
    await sleep(200);
    const typed = await c.evalExpr(`(${PATH_INPUT}).value`);
    // THE MID-OPEN TRACE. ⚠ Run 2 read "the act is still loaded" AFTER a
    // successful switch too: the shell reopened the same tab id in the new
    // project. So "still loaded" after a FAILED open means something only if the
    // act never left 'ready' while the open ran. An in-page 4 ms sampler records
    // every change of (project status, act status, zone, act) from before Enter
    // to after the outcome; a successful switch is its control (it must show a
    // drop, or the sampler cannot see one).
    await c.evalExpr(String.raw`(() => { clearInterval(window.__sweepTraceTimer); window.__sweepTrace = []; let last = null;
      const tick = () => { const p = window.__dbg.projStatus(); const l = window.__dbg.levelState();
        const k = p.status + '|' + l.status + '|' + l.zone + '|' + l.act;
        if (k !== last) { last = k; window.__sweepTrace.push({ p: p.status, l: l.status, z: l.zone, a: l.act, t: Math.round(performance.now()) }); } };
      tick(); window.__sweepTraceTimer = setInterval(tick, 4); return true; })()`);
    await d.namedKey('Enter', 13, '\r');
    const t = Date.now(); let settled = false;
    while (Date.now() - t < maxMs) { if (await done().catch(() => false)) { settled = true; break; } await sleep(250); }
    const waitedMs = Date.now() - t;
    await sleep(1000);
    const trace = await c.json('(() => { clearInterval(window.__sweepTraceTimer); return window.__sweepTrace || []; })()');
    return { homeTab, field, cleared, typedOk: typed === path, settled, waitedMs, trace };
  };
  /** The project stayed open and the act stayed loaded for the whole open. */
  const steady = (tr) => Array.isArray(tr) && tr.length > 0 && tr.every((x) => x.p === 'open' && x.l === 'ready' && x.z === 'ghz' && String(x.a) === '1');
  const traceStr = (tr) => (tr || []).map((x) => `${x.p}/${x.l}/${x.z}${x.a}@${x.t}`).join(' > ');
  const LEVEL_CARDS = String.raw`(() => { const w = ${FIELD_WRAP}; const col = w ? w.parentElement : null; if (!col) return [];
    return [...col.querySelectorAll('button')].filter((b) => /^Open /.test(b.title || '')).map((b) => ({ title: b.title, disabled: b.disabled })); })()`;
  const GHZ1_CARD = String.raw`(() => { const w = ${FIELD_WRAP}; const col = w ? w.parentElement : null; if (!col) return null;
    return [...col.querySelectorAll('button')].find((b) => /^Open /.test(b.title || '') && !b.disabled
      && /green hill|ghz/i.test(b.title) && /\b1\b/.test(b.title.replace(/^Open /, ''))) || null; })()`;
  /** A real click on Home's Green Hill act 1 card; wait for the act; back to Home. */
  const openGhz1 = async () => {
    await d.pressTab(d.HOME_TAB);
    const cards = await c.json(LEVEL_CARDS);
    const card = await d.realClick(GHZ1_CARD, { scroll: true });
    const cardTitle = await c.evalExpr(`(() => { const b = ${GHZ1_CARD}; return b ? b.title : null; })()`);
    let l = null;
    for (let i = 0; i < 80; i++) {
      l = await lvl().catch(() => null);
      if (l && l.status === 'ready' && l.zone === 'ghz' && String(l.act) === '1') break;
      await sleep(250);
    }
    await sleep(800);
    const tabList = await d.tabs();
    await d.pressTab(d.HOME_TAB);
    return { cards, card, cardTitle, tabTitle: cardTitle ? cardTitle.replace(/^Open /, '') : null, lvl: l, tabList };
  };
  const actReady = (l) => !!(l && l.status === 'ready' && l.zone === 'ghz' && String(l.act) === '1');

  const TYPO = `${S1a}-typo`;
  const wantNotRecognized = `"${TYPO}"${O.notRecognized}`;
  console.log(`\n──── classic: cold start ────  typo path ${J(TYPO)}; expected banner head ${J(wantNotRecognized)}; F-3 loader reason ${J(O.zoneNoId)}`);

  // ── CFO.0a: cold start ────────────────────────────────────────────────────
  await d.pressTab(d.HOME_TAB);
  const h0 = await home(); const p0 = await proj(); const a0 = await aeonSt();
  check('CFO.0a', 'COLD START: nothing open (classic closed, no aeon project), Home shows the no-project field, no banner',
    p0.status === 'closed' && a0.open === false && h0.fieldLabel === O.homeLabels.none && h0.chip === null && !(await bannerPresent()),
    `dpr ${await d.dpr()}; projStatus ${J(p0)}; aeon ${J(a0)}; home ${J(h0)}`);

  // ── CFO.0b: open S1a through the Home path box ───────────────────────────
  const o1 = await typedOpen(S1a, async () => (await proj()).status === 'open' && (await home()).dir === S1a);
  const h1 = await home();
  const S1_LABEL = h1.name;
  check('CFO.0b', 'S1a opened through Home\'s path box (real click, typed, Enter): Home is the S1 project page naming S1a, and the field EMPTIED on success (the control for "keeps the typo")',
    o1.typedOk && o1.settled && !!(o1.field && o1.field.hitOk) && h1.chip === 'S1' && h1.dir === S1a && h1.field === '' && h1.fieldLabel === O.homeLabels.switch,
    `field aim ${J(o1.field)}; settled ${o1.settled} after ${o1.waitedMs}ms; home ${J(h1)}; projStatus ${J(await proj())}`);

  // ── CFO.0c: a level tab, act loaded ──────────────────────────────────────
  const g1 = await openGhz1();
  check('CFO.0c', 'Green Hill act 1 opened from Home\'s Levels card by a real click: its tab is listed and the act is loaded',
    !!(g1.card && g1.card.hitOk) && actReady(g1.lvl) && g1.tabList.includes(g1.tabTitle),
    `cards ${J(g1.cards)}; aim ${J(g1.card)}; levelState ${J(g1.lvl)}; tabs ${J(g1.tabList)}`);
  const TAB_TITLE = g1.tabTitle;

  // ── F-1: a bad path with S1 resident ─────────────────────────────────────
  console.log('\n──── CFO F-1: a typo in the path box, Sonic 1 resident ────');
  const b0 = await bannerPresent();
  const f1 = await typedOpen(TYPO, bannerPresent, 15000);
  const f1Banner = await bannerNow(); const f1Text = await bannerText();
  const f1Home = await home(); const f1Proj = await proj(); const f1Lvl = await lvl(); const f1Tabs = await d.tabs();
  const f1Caps = [await d.grabEl(BANNER, 'cfo-F1-banner'), await d.grabEl(HEADER_EL, 'cfo-F1-home-header'),
    await d.grabEl(FIELD_WRAP, 'cfo-F1-field'), await d.grabEl(TABSTRIP, 'cfo-F1-tabstrip')].map((x) => x && x.path);
  await d.shot('cfo-F1-full');
  check('CFO.F1.a', 'F-1: the red banner is PAINTED and begins with the classic store\'s own not-recognized sentence for the typed path (no banner before the Enter)',
    !b0 && onScreen(f1Banner) && typeof f1Text === 'string' && f1Text.startsWith(wantNotRecognized),
    `dpr ${await d.dpr()}; banner before ${b0}; paint ${J(f1Banner)}; text ${J(f1Text)}; captures ${J(f1Caps)}`);
  check('CFO.F1.b', 'F-1: Home STAYS on the S1 project page (chip S1, the S1 name, S1a\'s path, the switch field) and the classic project is still open',
    f1Home.chip === 'S1' && f1Home.name === S1_LABEL && f1Home.dir === S1a && f1Home.fieldLabel === O.homeLabels.switch && f1Proj.status === 'open',
    `home ${J(f1Home)}; projStatus ${J(f1Proj)}`);
  check('CFO.F1.c', 'F-1: the field KEEPS the typo', f1Home.field === TYPO, `field ${J(f1Home.field)}; typed ok ${f1.typedOk}`);
  check('CFO.F1.d', 'F-1: the level tab is still there and its act is still loaded, and it NEVER left loaded while the open ran (the project never left open either: the mid-open trace)',
    f1Tabs.includes(TAB_TITLE) && actReady(f1Lvl) && steady(f1.trace),
    `tabs ${J(f1Tabs)}; levelState ${J(f1Lvl)}; trace ${traceStr(f1.trace)}`);

  // ── F-3: an aeon checkout that fails to load, S1 resident ────────────────
  console.log('\n──── CFO F-3: the path of an aeon checkout whose project.json fails to load ────');
  const dm3 = await dismissBanner();
  const f3 = await typedOpen(X.dir, bannerPresent, 20000);
  const f3Banner = await bannerNow(); const f3Text = await bannerText();
  const f3Home = await home(); const f3Proj = await proj(); const f3Lvl = await lvl(); const f3Tabs = await d.tabs(); const f3Aeon = await aeonSt();
  const f3Caps = [await d.grabEl(BANNER, 'cfo-F3-banner'), await d.grabEl(HEADER_EL, 'cfo-F3-home-header'),
    await d.grabEl(TABSTRIP, 'cfo-F3-tabstrip')].map((x) => x && x.path);
  await d.shot('cfo-F3-full');
  check('CFO.F3.0', 'CONTROL: the F-1 banner was dismissed by a real click and was absent before this Enter',
    dm3.was && dm3.goneAfter && !!(dm3.pressed && dm3.pressed.hitOk), J(dm3));
  check('CFO.F3.a', 'F-3: the banner is painted and says the AEON LOADER\'s reason (s4-config.ts), not the not-recognized sentence',
    onScreen(f3Banner) && f3Text === O.zoneNoId && !String(f3Text).includes(O.notRecognized),
    `dpr ${await d.dpr()}; loader reason printed by the app: ${J(f3Text)}; paint ${J(f3Banner)}; typed ${f3.typedOk}; captures ${J(f3Caps)}`);
  check('CFO.F3.b', 'F-3: Sonic 1 STAYS open (Home names S1a, classic open, the level tab and its act survive) and no aeon project was loaded',
    f3Home.chip === 'S1' && f3Home.dir === S1a && f3Proj.status === 'open' && f3Tabs.includes(TAB_TITLE) && actReady(f3Lvl) && f3Aeon.open === false
      && steady(f3.trace),
    `home ${J(f3Home)}; projStatus ${J(f3Proj)}; levelState ${J(f3Lvl)}; tabs ${J(f3Tabs)}; aeon ${J(f3Aeon)}; trace ${traceStr(f3.trace)}`);

  // ── F-4: the successes still switch ──────────────────────────────────────
  console.log('\n──── CFO F-4: S1a to S1b, then S1b to aeon ────');
  const dm4 = await dismissBanner();
  // ⚠ RUN 2 FAILED THIS ROW ON A PREMISE THE PACKET NEVER STATED. It asserted
  // "the act is dropped" as an end state; the packet's F-4 says only "the
  // successes still switch". On screen the shell reopened the same tab id
  // (level:ghz:1) in the new project, so the act read 'ready' again and Home was
  // no longer the active pane. The row now asks what the packet asks (the
  // switch), and the TRACE is the control for F-1/F-3/F-2's trace rows: here it
  // must show the act leaving 'ready', or the sampler cannot see a drop at all.
  const homeShownBefore4a = (await home()).headerRect;
  const f4a = await typedOpen(S1b, async () => (await proj()).status === 'open' && (await home()).dir === S1b);
  const f4aAfterOpen = { headerRectBeforeHomePress: (await home()).headerRect, tabs: await d.tabs(), levelState: await lvl() };
  await d.pressTab(d.HOME_TAB);
  const f4aHome = await home(); const f4aLvl = await lvl(); const f4aTabs = await d.tabs();
  const f4aCap = await d.grabEl(HEADER_EL, 'cfo-F4a-home-header');
  const dropped4a = (f4a.trace || []).some((x) => x.l !== 'ready');
  check('CFO.F4.a', 'F-4 CONTROL: a SUCCESSFUL Sonic 1 to Sonic 1 open switches (Home names S1b, classic open, no banner, the field emptied), and the mid-open trace SEES the act leave loaded',
    dm4.goneAfter && f4a.settled && f4aHome.chip === 'S1' && f4aHome.dir === S1b && (await proj()).status === 'open'
      && !(await bannerPresent()) && f4aHome.field === '' && dropped4a,
    `dismiss ${J(dm4)}; home ${J(f4aHome)}; trace ${traceStr(f4a.trace)}; right after the open ${J(f4aAfterOpen)}; Home header before ${J(homeShownBefore4a)}; `
    + `levelState after ${J(f4aLvl)}; tabs ${J(f4aTabs)}; capture ${f4aCap && f4aCap.path}`);
  if (actReady(f4aLvl)) {
    note('OBS-F4a', `after the successful S1a to S1b switch the Green Hill tab stayed listed and act ghz 1 is loaded again (in S1b), and Home was not the active pane `
      + `(header rect ${J(f4aAfterOpen.headerRectBeforeHomePress)}): the shell reopened the same tab id in the new project. Observed, not judged.`);
  }
  const f4b = await typedOpen(A.dir, async () => (await aeonSt()).open === true && (await proj()).status === 'closed' && (await home()).chip === 'AEON', 60000);
  const f4bAfterOpen = { headerRectBeforeHomePress: (await home()).headerRect, tabs: await d.tabs() };
  await d.pressTab(d.HOME_TAB);
  const f4bHome = await home(); const f4bProj = await proj(); const f4bAeon = await aeonSt(); const f4bTitle = await c.evalExpr('document.title');
  const f4bCap = await d.grabEl(HEADER_EL, 'cfo-F4b-home-header');
  note('F4b', `right after the aeon open, before pressing Home: ${J(f4bAfterOpen)}; trace ${traceStr(f4b.trace)}`);
  check('CFO.F4.b', 'F-4 CONTROL: a SUCCESSFUL Sonic 1 to aeon open switches: Home names aeon copy A (chip AEON), classic closed, aeon open',
    f4b.settled && f4bHome.chip === 'AEON' && f4bHome.name === A.name && f4bProj.status === 'closed' && f4bAeon.open === true,
    `home ${J(f4bHome)}; projStatus ${J(f4bProj)}; aeon ${J(f4bAeon)}; title ${J(f4bTitle)}; capture ${f4bCap && f4bCap.path}`);

  // ── F-2: aeon, then Sonic 1, then F-1 again ──────────────────────────────
  console.log('\n──── CFO F-2: aeon open, then S1a, then F-1 again ────');
  await d.clearToasts();
  const f2o = await typedOpen(S1a, async () => (await proj()).status === 'open' && (await home()).dir === S1a);
  const f2Pre = { home: await home(), aeon: await aeonSt(), proj: await proj() };
  check('CFO.F2.0', 'PREMISE: Sonic 1 opened over aeon copy A, and the aeon store STILL holds copy A underneath (the stale project F-2 is about exists)',
    f2o.settled && f2Pre.home.chip === 'S1' && f2Pre.home.dir === S1a && f2Pre.aeon.open === true,
    J(f2Pre));
  const g2 = await openGhz1();
  const b2 = await bannerPresent();
  const f2 = await typedOpen(TYPO, bannerPresent, 15000);
  const f2Banner = await bannerNow(); const f2Text = await bannerText();
  const f2Home = await home(); const f2Proj = await proj(); const f2Lvl = await lvl(); const f2Tabs = await d.tabs();
  const f2Caps = [await d.grabEl(BANNER, 'cfo-F2-banner'), await d.grabEl(HEADER_EL, 'cfo-F2-home-header'),
    await d.grabEl(TABSTRIP, 'cfo-F2-tabstrip')].map((x) => x && x.path);
  await d.shot('cfo-F2-full');
  check('CFO.F2.a', 'F-2: after the failed open Home STILL names the Sonic 1 project (chip S1, S1 name, S1a), NOT aeon copy A; the banner is painted with the not-recognized sentence',
    !b2 && onScreen(f2Banner) && String(f2Text).startsWith(wantNotRecognized)
      && f2Home.chip === 'S1' && f2Home.name === S1_LABEL && f2Home.name !== A.name && f2Home.dir === S1a && f2Proj.status === 'open',
    `dpr ${await d.dpr()}; level ${J(g2.lvl)}; banner ${J(f2Text)}; home ${J(f2Home)}; projStatus ${J(f2Proj)}; captures ${J(f2Caps)}`);
  check('CFO.F2.b', 'F-2: and, as in F-1, the field keeps the typo and the level tab and its act survive',
    f2Home.field === TYPO && f2Tabs.includes(TAB_TITLE) && actReady(f2Lvl) && steady(f2.trace),
    `field ${J(f2Home.field)}; tabs ${J(f2Tabs)}; levelState ${J(f2Lvl)}; typed ${f2.typedOk}; trace ${traceStr(f2.trace)}`);
  await dismissBanner();
}

// ═══════════════════════════════════════════════════════════════════════════
// PART paste: paste-status-bar-and-art-only section 10 F-1 to F-5 (+ O-1), and
// paste-hint-and-chosen section 7 F-1, F-2, on aeon copy A (zones ojz and zb).
// ═══════════════════════════════════════════════════════════════════════════
async function pastePart(d, O, { A }) {
  const { c } = d;
  const off = O.m.pasteLayerOffer;
  const WITH = { artOnly: false }; const ARTONLY = { artOnly: true };
  const HOMEFIT = { art: true, collision: true }; const OTHERZONE = { art: false, collision: true };
  const ESC_TAIL = ` · ${O.m.PASTE_ESC}`;
  const gesturesOf = (statusHint) => (statusHint.endsWith(ESC_TAIL) ? statusHint.slice(0, -ESC_TAIL.length) : null);
  const st = () => c.json('window.__dbg.aeon.state()');
  const ghost = () => c.json('window.__dbg.aeon.pasteGhost()').catch(() => null);
  const clipInfo = () => c.json('window.__dbg.aeon.mapClipboardInfo()');
  const canUndo = () => c.evalExpr('window.__dbg.aeon.canUndo()');
  const marqueeNow = () => c.json('window.__dbg.aeon.marquee()');
  const selectedChunk = () => c.json('window.__dbg.aeon.selectedChunk()');
  const WORDS = String.raw`(() => {
    const a = window.__dbg.aeon; const s = a.state(); const n = (s.gridWidth || 0) * (s.gridHeight || 0);
    let h = 2166136261 >>> 0; let words = 0;
    for (let i = 0; i < n; i++) {
      for (const g of [a.ntRect(i, 0, 0, 256, 256), a.collRect(i, 0, 0, 256, 256, 'a'), a.collRect(i, 0, 0, 256, 256, 'b')]) {
        if (!g) { h = Math.imul(h ^ 0x5eed, 16777619) >>> 0; continue; }
        words += g.length;
        for (let k = 0; k < g.length; k++) h = Math.imul(h ^ g[k], 16777619) >>> 0;
      }
    }
    return { zone: s.zone, act: s.act, words, hash: h };
  })()`;
  const words = () => c.json(WORDS);
  const canvasRect = () => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
    const b = cv.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, dpr: window.devicePixelRatio }; })()`);

  // ── places (cdp-sweep-2's) ────────────────────────────────────────────────
  const LEVELS = `document.querySelector('[data-section="explorer.levels"]')`;
  const LEVELS_HEADER = String.raw`(() => { const s = ${LEVELS}; if (!s || !s.firstElementChild) return null;
    return s.firstElementChild.querySelector('span') || s.firstElementChild; })()`;
  const ROW = (label) => String.raw`(() => { const s = ${LEVELS}; if (!s) return null;
    return [...s.querySelectorAll('button')].find((b) => (b.querySelector('span')?.textContent || '').trim() === ${J(label)}) || null; })()`;
  const A1 = 'Oracle Jungle Zone · act1';
  const B1 = 'Sweep Zone B · act1';
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
      s = await st().catch(() => null);
      if (s && s.zone === zone && s.act === act && (await canvasRect())) break;
      await sleep(250);
    }
    await sleep(700);
    return { clicked, state: s };
  };

  // ── the bar, the panel ────────────────────────────────────────────────────
  const BAR_FOOTER = String.raw`([...document.querySelectorAll('footer')].find((f) => f.querySelector('button[aria-label="Zoom in"]') && f.getBoundingClientRect().height > 0) || null)`;
  const BAR = String.raw`(() => { const f = ${BAR_FOOTER}; if (!f) return { found: false };
    const inner = f.children[0] && f.children[0].firstElementChild; const sp = inner ? [...inner.children] : [];
    return { found: true, n: sp.length, label: sp[0] ? sp[0].textContent : null, layer: sp[1] ? sp[1].textContent : null,
      zone: sp[2] ? sp[2].textContent : null, scope: sp[3] ? sp[3].textContent : null, context: sp[4] ? sp[4].textContent : null }; })()`;
  const BAR_LEFT = `(() => { const f = ${BAR_FOOTER}; return f ? f.children[0] : null; })()`;
  const bar = async () => {
    const b = await c.json(BAR);
    if (!b.found || b.n !== 5) note('BAR', `SHAPE GUARD: the bar is not the five-span shape this file reads: ${J(b)}`);
    return b;
  };
  const LAYERS_LABEL = String.raw`([...document.querySelectorAll('span')].find((s) => s.textContent.trim() === 'Layers' && s.nextElementSibling && s.nextElementSibling.tagName === 'BUTTON' && s.getBoundingClientRect().width > 0) || null)`;
  const LAYERS_ROW = `(() => { const l = ${LAYERS_LABEL}; return l ? l.parentElement : null; })()`;
  const PANEL_ROOT = `(() => { const l = ${LAYERS_LABEL}; return l ? l.parentElement.parentElement : null; })()`;
  const POST_FLIP = String.raw`(() => { const root = ${PANEL_ROOT}; if (!root) return [];
    const kids = [...root.children];
    const flip = kids.find((k) => [...k.children].some((s) => s.tagName === 'SPAN' && s.textContent.trim() === 'Flip'));
    if (!flip) return [];
    return kids.slice(kids.indexOf(flip) + 1).filter((k) => k.tagName === 'DIV' && !k.querySelector('button, input, canvas')); })()`;
  const PANEL_HINT = `(() => { const a = ${POST_FLIP}; return a.length ? a[a.length - 1] : null; })()`;
  const WARN_LINE = `(() => { const a = ${POST_FLIP}; return a.length > 1 ? a[0] : null; })()`;
  const PANEL_NOTICE = `(() => { const r = ${LAYERS_ROW}; const n = r ? r.nextElementSibling : null; return n && !n.querySelector('button') ? n : null; })()`;
  const hintText = () => c.evalExpr(`(() => { const h = ${PANEL_HINT}; return h ? h.textContent : null; })()`);
  const noticeText = () => c.evalExpr(`(() => { const h = ${PANEL_NOTICE}; return h ? h.textContent : null; })()`);
  const HINT_GEOM = String.raw`(() => { const h = ${PANEL_HINT}; if (!h) return null;
    const b = h.getBoundingClientRect();
    let sc = h.parentElement; while (sc && sc !== document.body) { const cs = getComputedStyle(sc); if (/(auto|scroll)/.test(cs.overflowY + ' ' + cs.overflowX)) break; sc = sc.parentElement; }
    const sb = sc && sc !== document.body ? sc.getBoundingClientRect() : null;
    const rg = document.createRange(); rg.selectNodeContents(h);
    const lines = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    return { rect: { x: +b.x.toFixed(2), w: +b.width.toFixed(2), right: +b.right.toFixed(2), h: +b.height.toFixed(2) },
      column: sb ? { x: +sb.left.toFixed(2), right: +sb.right.toFixed(2), w: +sb.width.toFixed(2) } : null,
      lines, scrollW: h.scrollWidth, clientW: h.clientWidth,
      insideColumn: sb ? (b.left >= sb.left - 0.5 && b.right <= sb.right + 0.5) : null }; })()`;
  const BTN_IN = (row, label) => String.raw`(() => { const l = [...document.querySelectorAll('span')].find((s) => s.textContent.trim() === ${J(row)} && s.nextElementSibling && s.nextElementSibling.tagName === 'BUTTON' && s.getBoundingClientRect().width > 0);
    return l ? [...l.parentElement.querySelectorAll('button')].find((b) => b.textContent.trim() === ${J(label)}) || null : null; })()`;
  const LAYER_BTNS = String.raw`(() => { const l = ${LAYERS_LABEL}; if (!l) return null;
    return [...l.parentElement.querySelectorAll('button')].map((b) => { const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
      return { label: b.textContent.trim(), disabled: b.disabled, opacity: cs.opacity, borderStyle: cs.borderTopStyle,
        borderColor: cs.borderTopColor, background: cs.backgroundColor, rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) } }; }); })()`;
  const layerBtns = () => c.json(LAYER_BTNS);
  /** The live chosen button: the one whose background no other shares. */
  const chosenLive = (btns) => {
    if (!btns) return null;
    const u = btns.filter((b) => btns.filter((x) => x.background === b.background).length === 1);
    return u.length === 1 ? u[0].label : null;
  };
  const warnColor = () => c.evalExpr(`(() => { const w = ${WARN_LINE}; return w ? getComputedStyle(w).color : null; })()`);
  const setLayers = async (label) => { const p = await d.realClick(BTN_IN('Layers', label)); await sleep(300); return p; };
  const setSnap = async (label) => { const p = await d.realClick(BTN_IN('Snap', label)); await sleep(300); return p; };

  // ── open copy A (setup: the open is not the step under test) ────────────
  console.log('\n──── paste: open aeon copy A (setup, __dbg.aeon.open) ────');
  await d.clearToasts();
  const opened = await c.evalExpr(`window.__dbg.aeon.open(${J(A.dir)})`).catch((e) => `threw: ${e.message}`);
  let s0 = null;
  for (let i = 0; i < 80; i++) { s0 = await st().catch(() => null); if (s0 && s0.open) break; await sleep(250); }
  if (!s0 || !s0.open) throw new Error(`aeon copy A did not open: ${J(opened)} ${J(s0)}`);
  // A banner from the classic part would move the canvas box: dismiss it for real.
  const bannerBtn = String.raw`([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Dismiss' && b.parentElement && b.parentElement.firstElementChild && b.parentElement.firstElementChild.tagName === 'SPAN') || null)`;
  if (await c.evalExpr(`!!${bannerBtn}`)) await d.realClick(bannerBtn);
  const toA = await openRow(A1, 'ojz', 'act1');
  await d.realClick(d.FACET('Layout'));
  await sleep(600);
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');
  await sleep(300);
  const R = await canvasRect();
  if (!R) throw new Error('no map canvas after opening ojz act1');
  await expandLevels();
  const rows = await c.json(String.raw`(() => { const s = ${LEVELS}; return s ? [...s.querySelectorAll('button')].map((b) => (b.querySelector('span')?.textContent || '').trim()) : null; })()`);
  const facetList = await d.facets();
  const artA = await c.evalExpr('window.__dbg.aeon.zoneArtHash()');
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
  if (!pick || !pick.H) throw new Error(`no copyable region / paste target: ${J(pick)}`);
  const S = pick.S; const Ht = pick.H;
  const tilePx = (col, row) => ({ x: Math.round(R.x + col * 8 + 3), y: Math.round(R.y + row * 8 + 3) });
  const Hpt = tilePx(Ht.col, Ht.row);
  note('0', `dpr ${R.dpr}; map canvas ${J(R)}; open ${J(opened)}; row ${J(toA.clicked)}; S ${J(S)} H ${J(Ht)} aim ${J(Hpt)}`);
  check('PSB.0a', 'aeon copy A is open on ojz act1 with both zones listed and the Layout and Collision facets present',
    s0.open && toA.state && toA.state.zone === 'ojz' && !!rows && rows.includes(A1) && rows.includes(B1) && facetList.includes('Layout') && facetList.includes('Collision'),
    `rows ${J(rows)}; facets ${J(facetList)}; state ${J(toA.state)}`);
  const sameGeometry = async (where) => {
    const now = await canvasRect();
    if (!now || now.x !== R.x || now.y !== R.y || now.w !== R.w || now.h !== R.h) {
      await d.shot(`geometry-moved-${where}`);
      throw new Error(`the map canvas box moved before ${where}: ${J(R)} -> ${J(now)}`);
    }
  };
  const hover = async () => {
    await d.mouse('mouseMoved', Hpt.x + 48, Hpt.y + 48); await sleep(120);
    await d.mouse('mouseMoved', Hpt.x, Hpt.y); await sleep(350);
  };
  const drag = async (col, row, w, h) => {
    const a = tilePx(col, row); const b = tilePx(col + w - 1, row + h - 1);
    await d.mouse('mouseMoved', a.x, a.y);
    await d.mouse('mousePressed', a.x, a.y, 'left', 1);
    await d.mouse('mouseMoved', Math.round((a.x + b.x) / 2), Math.round((a.y + b.y) / 2), 'left', 1);
    await d.mouse('mouseMoved', b.x, b.y, 'left', 1);
    await d.mouse('mouseReleased', b.x, b.y, 'left', 0);
    await sleep(300);
    return { from: a, to: b };
  };
  /** Ctrl+V after every toast is gone; the arming toast (if any) is returned. */
  const arm = async (expectToast = null) => {
    await d.clearToasts();
    const before = await ghost();
    await d.chord('v', CTRL);
    const t = expectToast ? await d.waitToast((x) => x === expectToast) : null;
    await hover();
    return { toast: t, before, after: await ghost() };
  };
  /** THE CLICK AS ORACLE. A real click at H with a gesture's modifiers: its
   *  toast (if any), whether it wrote (the undo stack moved or the word planes
   *  changed), and whether paste mode is still on. A write is undone with
   *  Ctrl+Z so the next gesture starts from the same stack. */
  const gesture = async (mods) => {
    await d.clearToasts();
    const u0 = await canUndo(); const w0 = await words();
    await hover();
    await d.clickAt(Hpt, mods);
    const t = await d.waitToast(() => true, 1500);
    const u1 = await canUndo(); const w1 = await words();
    const b = await bar();
    const wrote = (u0 === false && u1 === true) || w1.hash !== w0.hash;
    let undone = null;
    if (wrote) { await d.chord('z', CTRL); undone = await canUndo(); }
    return { toast: t ? t.text : null, wrote, canUndo: [u0, u1], hashMoved: w1.hash !== w0.hash, pastingAfter: b.label === O.pasteLabel, undoneTo: undone };
  };
  const MODS = { plain: 0, alt: ALT, shift: SHIFT };

  // ═════════════════════════════════════════════════════════════════════════
  // PSB F-5: same zone, a block-aligned copy.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── PSB F-5: zone A, a block-aligned copy, Ctrl+V ────');
  await d.chord('m');
  await setSnap('Block');
  await setLayers('Both');
  const lb5 = await layerBtns();
  await drag(S.col, S.row, 4, 4);
  const m5 = await marqueeNow();
  await d.chord('c', CTRL);
  const copied5 = await d.waitToast((t) => /^Copied /.test(t));
  const ci5 = await clipInfo();
  const bar5a = await bar();
  const a5 = await arm();
  const bar5 = await bar(); const hint5 = await hintText();
  const e5 = off(WITH, HOMEFIT, 'both');
  await d.clearToasts();
  const cap5 = [await d.grabEl(BAR_LEFT, 'psb-F5-bar'), await d.grabEl(PANEL_HINT, 'psb-F5-panel-hint')].map((x) => x && x.path);
  check('PSB.F5.a', 'F-5 PREMISE: the block-aligned copy carries collision, Layers is on Both, and Ctrl+V ARMED (the bar label turned to the paste label, the ghost paints)',
    !!copied5 && !!ci5 && ci5.artOnly === false && ci5.collisionALen > 0 && chosenLive(lb5) === 'Both'
      && bar5a.label !== O.pasteLabel && bar5.label === O.pasteLabel && !!(a5.after && a5.after.pasting),
    `dpr ${await d.dpr()}; marquee ${J(m5)}; clipboard ${J(ci5)}; layers ${J(lb5 && lb5.map((b) => [b.label, b.background]))}; bar before ${J(bar5a)}; ghost ${J(a5.after)}`);
  check('PSB.F5.b', 'F-5: the STATUS BAR reads the home line from the armed offer ("Click to paste · hold Alt ..., Shift ... · Esc to stop"), not the old neutral line',
    bar5.context === e5.statusHint, `bar ${J(bar5)}; want ${J(e5.statusHint)}; captures ${J(cap5)}`);
  check('PSB.F5.c', 'F-5 CONTROL: the panel hint is PASTE_HINT byte for byte, and the bar says its gestures without the flip keys',
    hint5 === O.m.PASTE_HINT && hint5 === e5.hint && hint5.startsWith(gesturesOf(bar5.context ?? '') ?? ' '),
    `panel ${J(hint5)}`);
  await d.namedKey('Escape', 27);

  // ═════════════════════════════════════════════════════════════════════════
  // PSB F-1 / PHC F-1: zone B, Ctrl+V, Layers on Both, then Collision.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── PSB F-1 / PHC F-1: zone B, Ctrl+V, Layers Both then Collision ────');
  const toB = await openRow(B1, 'zb', 'act1');
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');
  await sameGeometry('F-1');
  const artB = await c.evalExpr('window.__dbg.aeon.zoneArtHash()');
  const barB0 = await bar();
  const aB = await arm(O.m.COLLISION_ONLY_HERE);
  const barB = await bar(); const hintB = await hintText(); const noticeB = await noticeText(); const lbB = await layerBtns();
  const geomB = await c.json(HINT_GEOM);
  const eB = off(WITH, OTHERZONE, 'both');
  check('PSB.F1.0', 'F-1 PREMISE: zone B opened by a real Explorer click, its tile set differs (zone-art hash), the switch left paste mode OFF, and Ctrl+V armed with COLLISION_ONLY_HERE painted',
    !!(toB.clicked && toB.clicked.hitOk) && toB.state.zone === 'zb' && artA !== artB && barB0.label !== O.pasteLabel
      && toastPainted(aB.toast) && barB.label === O.pasteLabel,
    `dpr ${await d.dpr()}; zoneArtHash ojz ${artA} zb ${artB}; bar before ${J(barB0)}; toast ${J(aB.toast)}; ghost ${J(aB.after)}`);
  await d.clearToasts();
  const capB = [await d.grabEl(BAR_LEFT, 'psb-F1-bar-both'), await d.grabEl(PANEL_HINT, 'phc-F1-panel-hint-both'),
    await d.grabEl(LAYERS_ROW, 'psb-F1-layers-both')].map((x) => x && x.path);
  await d.shot('psb-F1-full-both');
  check('PSB.F1.a', 'F-1: the bar reads the paste label, then "Shift+click to paste collision only · a plain click and Alt+click are refused here · Esc to stop" (the offer\'s statusHint)',
    barB.label === O.pasteLabel && barB.context === eB.statusHint, `bar ${J(barB)}; want ${J(eB.statusHint)}; captures ${J(capB)}`);
  check('PSB.F1.b', 'F-1: the panel hint says the SAME gestures, with the flip keys (panel = offer.hint, and the bar\'s gesture part is its head)',
    hintB === eB.hint && hintB.startsWith(`${gesturesOf(barB.context ?? '') ?? ' '} · `),
    `panel ${J(hintB)}; notice ${J(noticeB)}; buttons ${J(lbB && lbB.map((b) => [b.label, b.disabled]))}`);
  check('PHC.F1.a', 'PHC F-1: in another zone with Layers on Both the panel hint reads the offer\'s line AND wraps inside its column (2+ lines, no horizontal overflow, inside the scroller)',
    hintB === eB.hint && !!geomB && geomB.lines >= 2 && geomB.scrollW <= geomB.clientW && geomB.insideColumn === true,
    `geometry ${J(geomB)}`);

  // ── the width question (PSB F-1, O-1) ────────────────────────────────────
  const BAR_GEOM = String.raw`(() => {
    const f = ${BAR_FOOTER}; if (!f) return { found: false };
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2), right: +b.right.toFixed(2), bottom: +b.bottom.toFixed(2) }; };
    const inWin = (el) => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5 && b.width > 0; };
    const left = f.children[0]; const right = f.children[1]; const inner = left.firstElementChild; const sp = [...inner.children];
    const one = sp[0].getBoundingClientRect().height;
    const ctx = sp[4];
    const rg = document.createRange(); rg.selectNodeContents(ctx);
    const ctxLines = new Set([...rg.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size;
    const zin = f.querySelector('button[aria-label="Zoom in"]'); const zout = f.querySelector('button[aria-label="Zoom out"]');
    // ⚠ RUN 1 read right.lastElementChild, which is the right half's own
    // wrapper ("−100%+Aether ..."), not the badge. The badge is the LAST child
    // of the right half's inner span (MapStatusBar: the marginLeft span around
    // port.right), and its text must name Aether or the read is refused below.
    const rInner = right.firstElementChild;
    const badge = rInner && rInner.lastElementChild && /Aether/.test(rInner.lastElementChild.textContent || '') ? rInner.lastElementChild : null;
    if (!badge) return { found: false, why: 'no Aether badge span as the last child of the right half' };
    return { found: true, innerWidth, innerHeight, outerWidth, outerHeight, dpr: window.devicePixelRatio,
      footer: r(f), left: r(left), leftScrollW: left.scrollWidth, leftClientW: left.clientWidth,
      inner: r(inner), innerScrollW: inner.scrollWidth, innerClientW: inner.clientWidth,
      context: { ...r(ctx), text: ctx.textContent, lines: ctxLines, scrollW: ctx.scrollWidth, clientW: ctx.clientWidth },
      oneRowH: +one.toFixed(2), wraps: inner.getBoundingClientRect().height > one * 1.5 || ctxLines > 1,
      clipped: left.scrollWidth > left.clientWidth + 0.5 || inner.scrollWidth > inner.clientWidth + 0.5 || ctx.scrollWidth > ctx.clientWidth + 0.5,
      overflowsFooter: inner.getBoundingClientRect().bottom > f.getBoundingClientRect().bottom + 0.5 || inner.getBoundingClientRect().top < f.getBoundingClientRect().top - 0.5,
      zoomIn: { ...r(zin), inWindow: inWin(zin) }, zoomOut: { ...r(zout), inWindow: inWin(zout) },
      badge: { ...r(badge), inWindow: inWin(badge), text: (badge.textContent || '').trim().slice(0, 60) },
      rightOverlapsLeft: right.getBoundingClientRect().left < left.getBoundingClientRect().right - 0.5 };
  })()`;
  const widthOk = (g) => !!(g && g.found && !g.wraps && !g.clipped && !g.overflowsFooter && g.zoomIn.inWindow && g.zoomOut.inWindow && g.badge.inWindow && !g.rightOverlapsLeft);
  const gW1 = await c.json(BAR_GEOM);
  const capW1 = [await d.grabEl(BAR_FOOTER, 'psb-W-harness-default-bar', 0)].map((x) => x && x.path);
  await d.shot('psb-W-harness-default-full');
  // ⚠ RUN 1: Electron answers `Browser.getWindowForTarget` with "wasn't found"
  // on BOTH the page session and the browser endpoint, so the Browser domain
  // cannot resize this window. Two methods, tried in order and NAMED in the
  // row: (1) `window.resizeTo` from the page, a real window resize, accepted
  // only if innerWidth actually moves to what the new outer width implies;
  // (2) `Emulation.setDeviceMetricsOverride` at width 1280, an EMULATED
  // viewport (the page lays out at 1280 inside the same window), cleared after.
  let gW2 = null; let capW2 = null; let wErr = []; let restored = null; let via = null;
  const outer0 = await c.json('({ w: outerWidth, h: outerHeight, iw: innerWidth, ih: innerHeight })');
  try { const wc = await windowControl(d); wErr.push(`Browser domain answered: ${J(wc.bounds)}`); wc.close(); }
  catch (e) { wErr.push(`Browser domain: ${e.message}`); }
  const measureAt = async (label) => {
    gW2 = await c.json(BAR_GEOM);
    capW2 = [await d.grabEl(BAR_FOOTER, `psb-W-1280-bar`, 0)].map((x) => x && x.path);
    await d.shot('psb-W-1280-full');
    via = label;
  };
  await c.evalExpr(`window.resizeTo(1280, ${outer0.h})`).catch((e) => wErr.push(`resizeTo threw: ${e.message}`));
  let moved = false;
  for (let i = 0; i < 30; i++) { const iw = await c.evalExpr('innerWidth'); if (iw !== outer0.iw) { moved = true; break; } await sleep(150); }
  await sleep(700);
  if (moved) {
    await measureAt(`window.resizeTo(1280, ${outer0.h}): a real window resize`);
    await c.evalExpr(`window.resizeTo(${outer0.w}, ${outer0.h})`).catch(() => {});
    for (let i = 0; i < 30; i++) { if ((await c.evalExpr('innerWidth')) === outer0.iw) break; await sleep(150); }
    await sleep(700);
  } else {
    wErr.push(`window.resizeTo did not move innerWidth (still ${await c.evalExpr('innerWidth')})`);
    try {
      await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: outer0.ih, deviceScaleFactor: 0, mobile: false });
      for (let i = 0; i < 30; i++) { if ((await c.evalExpr('innerWidth')) === 1280) break; await sleep(150); }
      await sleep(700);
      await measureAt(`Emulation.setDeviceMetricsOverride width 1280: an EMULATED 1280px viewport inside the ${outer0.w}px window, not a window resize`);
    } catch (e) { wErr.push(`Emulation: ${e.message}`); }
    await c.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
    for (let i = 0; i < 30; i++) { if ((await c.evalExpr('innerWidth')) === outer0.iw) break; await sleep(150); }
    await sleep(700);
  }
  restored = await c.evalExpr('innerWidth');
  check('PSB.F1.W1', `F-1 / O-1 at the HARNESS's default window (outer ${outer0.w}x${outer0.h}, innerWidth ${gW1.innerWidth}): the bar's left half is on one row, unclipped, and the zoom controls and Aether badge are inside the window`,
    gW1.found ? widthOk(gW1) : 'UNMEASURABLE', `geometry ${J(gW1)}; captures ${J(capW1)}`);
  if (gW2 === null || !gW2.found) {
    check('PSB.F1.W2', 'F-1 / O-1 at 1280 wide', 'UNMEASURABLE', `no method reached 1280: ${J(wErr)}; geometry ${J(gW2)}`);
  } else {
    check('PSB.F1.W2', `F-1 / O-1 at 1280 wide (via ${via}; innerWidth ${gW2.innerWidth}): one row, unclipped, zoom and badge inside the window`,
      gW2.innerWidth === 1280 || moved ? widthOk(gW2) : 'UNMEASURABLE',
      `geometry ${J(gW2)}; captures ${J(capW2)}; attempts ${J(wErr)}; restored innerWidth ${restored} (was ${outer0.iw})`);
  }
  if (restored !== outer0.iw) throw new Error(`the window width was not restored: innerWidth ${restored}, was ${outer0.iw}; every later aim would be off`);
  await sameGeometry('F-1 clicks (after the resize and restore)');

  // ── the click agrees with the line, zone B, Layers Both ──────────────────
  const gB = {};
  gB.plain = await gesture(MODS.plain);
  if (!gB.plain.pastingAfter) await arm(O.m.COLLISION_ONLY_HERE);
  gB.alt = await gesture(MODS.alt);
  if (!gB.alt.pastingAfter) await arm(O.m.COLLISION_ONLY_HERE);
  gB.shift = await gesture(MODS.shift);
  check('PSB.F1.c', 'F-1, THE CLICK: a plain click and Alt+click are REFUSED with OTHER_TILESET_REFUSAL and write nothing; Shift+click WRITES (what the line says)',
    gB.plain.toast === O.m.OTHER_TILESET_REFUSAL && !gB.plain.wrote && gB.alt.toast === O.m.OTHER_TILESET_REFUSAL && !gB.alt.wrote
      && gB.shift.wrote && gB.shift.toast !== O.m.OTHER_TILESET_REFUSAL,
    J(gB));
  if (!gB.shift.pastingAfter) await arm(O.m.COLLISION_ONLY_HERE);
  const pc = await setLayers('Collision');
  const barBc = await bar(); const hintBc = await hintText(); const lbBc = await layerBtns();
  const eBc = off(WITH, OTHERZONE, 'collision');
  await d.clearToasts();
  const capBc = [await d.grabEl(BAR_LEFT, 'psb-F1-bar-collision'), await d.grabEl(PANEL_HINT, 'phc-F1-panel-hint-collision')].map((x) => x && x.path);
  check('PSB.F1.d', 'F-1: Layers switched to Collision by a real click while pasting: the bar reads "Click or Shift+click to paste collision only · Alt+click is refused here · Esc to stop"',
    !!(pc && pc.hitOk) && chosenLive(lbBc) === 'Collision' && barBc.label === O.pasteLabel && barBc.context === eBc.statusHint,
    `aim ${J(pc)}; bar ${J(barBc)}; want ${J(eBc.statusHint)}; captures ${J(capBc)}`);
  check('PHC.F1.b', 'PHC F-1: and the panel hint reads the same gestures with the flip keys', hintBc === eBc.hint, `panel ${J(hintBc)}`);
  await d.namedKey('Escape', 27);

  // ═════════════════════════════════════════════════════════════════════════
  // PSB F-2: the Collision facet, where the Paste panel is not mounted.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── PSB F-2: Collision facet, Ctrl+V in zone B ────');
  const pb2 = await setLayers('Both');
  const lb2 = await layerBtns();
  const fc = await d.realClick(d.FACET('Collision'));
  let panelGone = false;
  for (let i = 0; i < 30; i++) { if (!(await c.evalExpr(`!!${LAYERS_LABEL}`))) { panelGone = true; break; } await sleep(150); }
  await sleep(500);
  const a2 = await arm(O.m.COLLISION_ONLY_HERE);
  await d.clearToasts();
  const bar2 = await bar();
  const gest = gesturesOf(eB.statusHint);
  const holders = await c.json(String.raw`(() => { const want = ${J(gest)}; const out = [];
    for (const el of document.querySelectorAll('body *')) { const t = el.textContent || ''; if (!t.includes(want)) continue;
      if ([...el.children].some((k) => (k.textContent || '').includes(want))) continue;
      const b = el.getBoundingClientRect(); if (b.width === 0 || b.height === 0) continue;
      out.push({ tag: el.tagName, text: t.slice(0, 140) }); }
    return out; })()`);
  const cap2 = [await d.grabEl(BAR_LEFT, 'psb-F2-bar')].map((x) => x && x.path);
  await d.shot('psb-F2-full');
  check('PSB.F2.a', 'F-2: in the Collision facet (no Paste panel mounted) Ctrl+V arms and the bar reads F-1\'s line; it is the ONLY element on screen saying the gestures',
    !!(fc && fc.hitOk) && chosenLive(lb2) === 'Both' && panelGone && toastPainted(a2.toast)
      && bar2.label === O.pasteLabel && bar2.context === eB.statusHint && holders.length === 1,
    `dpr ${await d.dpr()}; facet aim ${J(fc)}; Both aim ${J(pb2 && pb2.hitOk)}; panel gone ${panelGone}; bar ${J(bar2)}; holders ${J(holders)}; captures ${J(cap2)}`);
  await d.namedKey('Escape', 27);
  await d.realClick(d.FACET('Layout'));
  await sleep(600);

  // ═════════════════════════════════════════════════════════════════════════
  // PSB F-3: the stamp tool armed, a chunk selected, Ctrl+V in zone B, Esc.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── PSB F-3: stamp tool, a chunk, Ctrl+V, Esc ────');
  await d.chord('k');
  const tool3 = (await st()).tool;
  const sel0 = await selectedChunk();
  const barK0 = await bar();
  const CELL = String.raw`([...document.querySelectorAll('button')].find((b) => b.title && !/^tile /i.test(b.title) && !/blank/i.test(b.title)
    && b.querySelector(':scope > canvas') && b.getBoundingClientRect().width > 0) || null)`;
  const cellTitle = await c.evalExpr(`(() => { const b = ${CELL}; return b ? b.title : null; })()`);
  const cell = await d.realClick(CELL, { scroll: true });
  const sel1 = await selectedChunk();
  const barK1 = await bar();
  const stampLine = (id) => `Chunk: ${id}${O.stampSuffix}`;
  const want0 = sel0 === null ? O.stampNone : stampLine(sel0);
  if (sel1 === null || !(cell && cell.hitOk)) {
    check('PSB.F3.0', 'F-3 PREMISE: the stamp tool armed and a chunk selected by a real click', 'UNMEASURABLE',
      `tool ${tool3}; cell ${J(cellTitle)} aim ${J(cell)}; selected ${J(sel0)} -> ${J(sel1)}`);
  } else {
    check('PSB.F3.0', 'F-3 CONTROL: with the stamp tool armed the bar says the stamp\'s own line, before and after a real click selects a chunk',
      tool3 === 'stamp-chunk' && barK0.context === want0 && barK1.context === stampLine(sel1),
      `tool ${tool3}; before ${J(barK0.context)} (want ${J(want0)}); cell ${J(cellTitle)} aim ${J(cell)}; after ${J(barK1.context)} (want ${J(stampLine(sel1))})`);
    const a3 = await arm(O.m.COLLISION_ONLY_HERE);
    await d.clearToasts();
    const barK2 = await bar();
    const capK2 = await d.grabEl(BAR_LEFT, 'psb-F3-bar-pasting');
    check('PSB.F3.a', 'F-3: Ctrl+V with the stamp armed: the bar reads F-1\'s paste line, not "Chunk: ... · Alt: art only"',
      toastPainted(a3.toast) && barK2.label === O.pasteLabel && barK2.context === eB.statusHint && !String(barK2.context).includes('Chunk:'),
      `tool ${(await st()).tool}; bar ${J(barK2)}; capture ${capK2 && capK2.path}`);
    await d.namedKey('Escape', 27);
    const barK3 = await bar();
    const capK3 = await d.grabEl(BAR_LEFT, 'psb-F3-bar-after-esc');
    check('PSB.F3.b', 'F-3: Esc, and the stamp\'s line comes back', barK3.label !== O.pasteLabel && barK3.context === stampLine(sel1),
      `bar ${J(barK3)}; capture ${capK3 && capK3.path}`);
  }
  await d.chord('m');

  // ═════════════════════════════════════════════════════════════════════════
  // PSB F-4 / PHC F-2: zone A, an art-only (unaligned) copy.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── PSB F-4 / PHC F-2: zone A, a 3x3 tile copy ────');
  const toA2 = await openRow(A1, 'ojz', 'act1');
  await c.evalExpr('window.__dbg.setView(0, 0, 1)');
  await sameGeometry('F-4');
  await d.chord('m');
  const pcol = await setLayers('Collision');
  const lbC0 = await layerBtns();
  await setSnap('Tile');
  await drag(S.col + 1, S.row + 1, 3, 3);
  const m4 = await marqueeNow();
  const lbC1 = await layerBtns(); const warn1 = await warnColor();
  const colBtn = (btns) => (btns || []).find((b) => b.label === 'Collision') || null;
  const isChosenDead = (b, warn) => !!(b && b.disabled && b.opacity === O.chosenDead.opacity && b.borderStyle === O.chosenDead.borderStyle && b.borderColor === warn);
  await d.clearToasts();
  const capC1 = await d.grabEl(LAYERS_ROW, 'phc-F2-copyside-layers');
  check('PHC.F2.a', 'PHC F-2, the copy side: Layers set to Collision (a real click, while it was live), then an unaligned 3x3 selection stands: Collision is greyed WITH the chosen mark (dashed, the warning colour, the chosen-dead opacity)',
    !!(pcol && pcol.hitOk) && chosenLive(lbC0) === 'Collision' && !!m4 && m4.w === 3 && m4.h === 3 && isChosenDead(colBtn(lbC1), warn1),
    `dpr ${await d.dpr()}; row ${J(toA2.clicked && toA2.clicked.hitOk)}; before the drag ${J(colBtn(lbC0))}; marquee ${J(m4)}; Collision now ${J(colBtn(lbC1))}; warning colour ${J(warn1)}; want ${J(O.chosenDead)}; capture ${capC1 && capC1.path}`);
  await d.chord('c', CTRL);
  const copied4 = await d.waitToast((t) => /^Copied /.test(t));
  const ci4 = await clipInfo();
  const a4 = await arm();
  const bar4 = await bar(); const hint4 = await hintText(); const lb4 = await layerBtns(); const warn4 = await warnColor();
  const e4c = off(ARTONLY, HOMEFIT, 'collision');
  await d.clearToasts();
  const cap4 = [await d.grabEl(BAR_LEFT, 'psb-F4-bar-collision'), await d.grabEl(PANEL_HINT, 'psb-F4-panel-hint-collision'),
    await d.grabEl(LAYERS_ROW, 'phc-F2-pasting-layers')].map((x) => x && x.path);
  const capColDead = await d.grabEl(BTN_IN('Layers', 'Collision'), 'phc-F2-collision-chosen-dead', 1);
  check('PSB.F4.a', 'F-4, Layers on Collision: the art-only copy ARMED at home; panel "Alt+click to paste art only · a plain click and Shift+click paste nothing · X flips ..." and the bar the same without the flips',
    !!copied4 && !!ci4 && ci4.artOnly === true && bar4.label === O.pasteLabel && hint4 === e4c.hint && bar4.context === e4c.statusHint,
    `clipboard ${J(ci4)}; ghost ${J(a4.after)}; panel ${J(hint4)}; bar ${J(bar4)}; captures ${J(cap4)}`);
  check('PHC.F2.b', 'PHC F-2, pasting: Collision stays set and shows as chosen and unavailable (dashed, the warning colour, the chosen-dead opacity)',
    isChosenDead(colBtn(lb4), warn4), `Collision ${J(colBtn(lb4))}; warning colour ${J(warn4)}; capture ${capColDead && capColDead.path}`);
  const g4 = { shift: await gesture(MODS.shift), plain: await gesture(MODS.plain), alt: await gesture(MODS.alt) };
  check('PSB.F4.b', 'F-4, THE CLICK: Shift+click and a plain click show the "carries no collision" toast and write nothing; Alt+click writes (what the line says)',
    g4.shift.toast === O.noCollision && !g4.shift.wrote && g4.plain.toast === O.noCollision && !g4.plain.wrote && g4.alt.wrote,
    J(g4));
  await d.namedKey('Escape', 27);
  const pboth = await setLayers('Both');
  const lb4b = await layerBtns();
  await d.clearToasts();
  const capColPlain = await d.grabEl(BTN_IN('Layers', 'Collision'), 'phc-F2-collision-plain-dead', 1);
  const dCol = capColDead && capColPlain ? diffImgs(capColDead.img, capColPlain.img) : { comparable: false };
  const cB = colBtn(lb4b);
  check('PHC.F2.c', 'PHC F-2 CONTROL: with Layers on Both, Collision is greyed in the PLAIN unavailable look (the plain opacity, not dashed), and its picture differs from the chosen-and-unavailable one',
    !!(pboth && pboth.hitOk) && chosenLive(lb4b) === 'Both' && !!cB && cB.disabled && cB.opacity === O.plainDeadOpacity && cB.borderStyle !== O.chosenDead.borderStyle
      && dCol.comparable && dCol.changed > 0,
    `Collision ${J(cB)}; pixel diff chosen-dead vs plain-dead ${J(dCol)}; capture ${capColPlain && capColPlain.path}`);
  const a4b = await arm();
  const bar4b = await bar(); const hint4b = await hintText();
  const e4b = off(ARTONLY, HOMEFIT, 'both');
  await d.clearToasts();
  const cap4b = [await d.grabEl(BAR_LEFT, 'psb-F4-bar-both'), await d.grabEl(PANEL_HINT, 'psb-F4-panel-hint-both')].map((x) => x && x.path);
  await d.shot('psb-F4-full-both');
  check('PSB.F4.c', 'F-4, Layers on Both: panel "Click or Alt+click to paste art only · Shift+click pastes nothing · X flips ..." and the bar the same without the flips',
    bar4b.label === O.pasteLabel && hint4b === e4b.hint && bar4b.context === e4b.statusHint,
    `ghost ${J(a4b.after)}; panel ${J(hint4b)}; bar ${J(bar4b)}; captures ${J(cap4b)}`);
  const g4b = { shift: await gesture(MODS.shift), plain: await gesture(MODS.plain) };
  check('PSB.F4.d', 'F-4, THE CLICK: Shift+click still shows the "carries no collision" toast and writes nothing; a plain click writes',
    g4b.shift.toast === O.noCollision && !g4b.shift.wrote && g4b.plain.wrote, J(g4b));
  await d.namedKey('Escape', 27);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok === true).length}/${results.length} rows had run: this is NOT a pass over the rows that never ran.`);
  console.log('END-OF-RUN');
  process.exit(2);
});
