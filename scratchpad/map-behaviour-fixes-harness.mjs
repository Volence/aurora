#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// MAP BEHAVIOUR FIXES, 2026-09-12. The four ruled map fixes (M1, M2, M4, M6)
// watched in the RUNNING app, on a COPY of aeon, on a private virtual display.
// ═══════════════════════════════════════════════════════════════════════════
//
// SOURCE. docs/reviews/2026-09-12-rulings-asked.md section 2 and "Rulings
// received" (the hub, 2026-09-12T07:08:52Z, in the owner's place): M1 drop
// focus, M2 put the plane in the key, M4 latch the brush size at the press, M6
// refresh the link hover on a stamp press. M3 is "leave it". M5 and M7 are
// PARKED for the owner: nothing here drives a paint-block drag, and nothing
// reads the cursor readout.
//
// PARTS (env PART, comma list; default all, in this order):
//   m1  M1.*  the Plane A/B buttons act and drop focus: a real click leaves
//            focus on <body>, and a real bare Space with a stroke held
//            presses no Plane button.
//   m2  M2.*  after a plane switch under a held stroke (Tab to Plane B, a real
//            Space), a move inside the SAME 16px cell paints it on plane B.
//   m4  M4.*  the collision brush SIZE is latched at the press: a size picked
//            mid-drag (Tab to the next Brush button, a real Space) does not
//            change the stroke, and the NEXT stroke uses it.
//   bw  BW.*  BRUSH-WORD-LATCH (hub ruling, empyrean OVERSEER-LOG
//            2026-09-12T09:39:48Z): the collision brush WORD is latched at
//            the press. The shape button the setup clicked keeps focus; with
//            the stroke held, a real Tab to the next shape button and a real
//            Space pick another word, and cells 3 and 4 of the stroke must
//            still carry the pressed word (cdp-sweep-4 section 5.4 O2 measured
//            them taking the new one). BW.b, BW.c, BW.d are controls that hold
//            with or without the latch; BW.a is the discriminating row.
//   abw ABW.* ART-BRUSH-WORD-LATCH (hub ruling, empyrean OVERSEER-LOG
//            2026-09-12T18:49:16Z, applying BRUSH-WORD-LATCH (a) to the Art
//            facet): the Art facet's collision brush (ComposerCanvas) keeps
//            the word it was pressed with. The composer's first chunk
//            document (opened by the aeon open), the Collision paint tool and
//            a shape button are armed by real clicks; the stroke is pressed on
//            the composer canvas and HELD; real Tabs move focus to a shape
//            button whose word differs and a real Space presses it; cells 3
//            and 4 must still carry the pressed word. ABW.b, ABW.c, ABW.d
//            are controls; ABW.a is the discriminating row. See
//            docs/reviews/2026-09-25-art-brush-word-latch.md.
//   abl ABL.* ART-BRUSH-LATCH-REST (hub ruling, empyrean OVERSEER-LOG
//            2026-09-25T07:43:58Z: "a stroke's inputs latch when it
//            starts"): the Art facet's TILE STAMP keeps the flips it was
//            pressed with. A chunk is opened in the composer by a real
//            double-click (as PART abw), the Tile stamp tool is armed by a
//            real click, a real X arms the H flip, a stroke is pressed on the
//            composer canvas and HELD across tiles 1 and 2, a real Y key
//            toggles the stamp's pending V flip (ComposerCanvas's window
//            keydown), and tiles 3 and 4 must still carry the flips of the
//            press. ABL.b and ABL.c are controls; ABL.a is the discriminating
//            row; ABL.d (the NEXT press carries the toggled flip) is what
//            shows the Y key fired at all.
//            See docs/reviews/2026-09-25-art-brush-latch-rest.md.
//   atl ATL.* ART-STROKE-FOLLOWUPS (a), TOOL-LATCH (hub ruling, empyrean
//            OVERSEER-LOG 2026-09-25T08:55:30Z: "the tool is a stroke input,
//            so it latches at the press"): a Tile stamp stroke is pressed on
//            the composer canvas and HELD across tiles 1 and 2, real Tabs move
//            focus to the tool rail's Collision paint button and a real Space
//            presses it (the store's tool is now collision), and tiles 3 and 4
//            must still be STAMPED, with no collision cell under them painted
//            (a shape is armed first by real clicks, so the collision brush
//            has a word that would paint).
//            ATL.b, ATL.c, ATL.d are controls; ATL.a is the discriminating row.
//   acj ACJ.* ART-STROKE-FOLLOWUPS (b), CANVAS-JUMP: the first write to a
//            CLEAN chunk document does not move the composer canvas. The
//            document open in the composer is reached by a real Art facet
//            click (or PART abw's double-click when none is open), the Tile
//            stamp is armed by a real click, one real click stamps a tile the
//            stamp changes, and the canvas rect must be the same before and
//            after (row 207's dev runs measured it 42px lower: the options
//            bar's "unsaved" badge made the doc header wrap, and the bar
//            grows to fit). A document that is already dirty cannot show a
//            FIRST write: UNMEASURABLE. ACJ.c is ART-STROKE-FOLLOWUPS (c),
//            UNDO-DIRTY: one real Ctrl+Z takes that first write back, and the
//            document must read clean again (the store's flag, and the
//            "unsaved" badge no longer visible). See
//            docs/reviews/2026-09-25-art-stroke-followups.md.
//   aob AOB.* ART-OPTIONS-BAR-HEIGHT (ROADMAP row 210; the aurora overseer's
//            look ruling, 2026-09-25): the Art facet's tool-options bar is
//            one row at a fixed height. AOB.0/AOB.a: every rail tool (HEAD's
//            ArtToolDock table) armed by a real click, the store's tool read
//            back, and the bar's height and the canvas rect the same under
//            each; AOB.b: nothing cut (content fits or the bar scrolls it).
//            AOB.N.*: the same census in a 1100px-wide window. AOB.t: the
//            shared-tile warning's full sentence (HEAD's SharedTileWarning) on
//            title and aria-label. AOB.w: the first write to a clean chunk
//            moves neither. AOB.s: the warning APPEARING on a first write to
//            an all-zero chunk and going on the undo moves neither (O3).
//            See docs/reviews/2026-09-25-art-options-bar-height.md.
//   m6  M6.*  a real stamp press under a still pointer names the placement it
//            made, in the store and in the Chunk links readout, with no move.
//
// EXPECTATIONS COME FROM THE TREE, NOT FROM A RUN.
//   * `collisionPaintTargets` (collision-paint.ts), `cellTileIndices`
//     (collision-cell.ts) and SECTION_TILES_WIDE/HIGH (s4-types.ts) are bundled
//     from the tree under test with esbuild and CALLED. The red-first mutations
//     are reverts of the four fixes and never touch these three files.
//     PART bw adds `collisionPaintWord` (core/editing/collision-word.ts) and
//     `unpackCollisionCell` (core/collision/collision-cell-word.ts), bundled
//     and called the same way; its red-first mutation reverts
//     MapViewport.tsx only and never touches either file.
//   * The Brush sizes and the Chunk links "no chunk link" text are read from
//     the COMMITTED HEAD (`git show HEAD:<path>`), each by a regex that must
//     match exactly once.
//   * Every aim is an INTEGER client pixel. The cell or tile it lands on is
//     derived back from that integer through the canvas rect and the view, and
//     printed with dpr and the rect, in the run that prints the rows.
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//   * A SYNTHETIC EVENT. Every gesture is Input.dispatchMouseEvent /
//     Input.dispatchKeyEvent. `__dbg` is used for READS, for setView and for
//     opening the copy; the plane, the brush size and the tool are changed by
//     real clicks and keys only (`armCollisionBrush({})`, an EMPTY selection,
//     sets nothing and is read for its return value).
//   * A STRAY MOVE (docs/reviews/2026-09-12-cdp-sweep-4.md section 5.3). Xvfb's
//     real pointer is parked outside the window and every mouse event the page
//     receives is logged: a part in which one arrives at a position this
//     harness never sent is UNMEASURABLE. M6 is the row a move would fake (the
//     move branch writes the same hover), so M6.a also requires that NO
//     mousemove at all reached the page between its press and its read.
//   * THE MAIN CHECKOUT'S dist/. `announceRunRoot` prints `root:`, and this
//     file prints `in-tree:` (whether the tree under test is the one it lives in).
//   * A PART THAT DID NOTHING. Each part opens with a premise row (air cells
//     found and on the map, the click hit its button, the plane or the size
//     really changed mid-drag); a part that cannot run says UNMEASURABLE.
//
// NO EMULATOR, EVER. ORACLE_SOCKET points into a mkdtemp of this run. NOTHING
// SAVES, and the project opened is still a fresh mkdtemp copy per run, made
// from AEON_DIR, which must itself be a copy: the harness refuses the live
// sibling. Cleanup by PID: spawnGuarded + await killTree.
//
// RUN (from a worktree, BOTH variables, or the main checkout's dist answers):
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a copy of aeon> AURORA_BUILT_TREE=<this tree> \
//     ELECTRON_BIN=<electron> [PART=m1,m2,m4,m6] \
//     node scratchpad/map-behaviour-fixes-harness.mjs

import { AURORA_DIR, siblingDefaultPath, checkoutOverride } from '../test/support/sibling-root.mjs';
import { readFileSync, existsSync, cpSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
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
const PORT = Number(process.env.PORT ?? 9433);
const ALL_PARTS = ['m1', 'm2', 'm4', 'bw', 'abw', 'abl', 'atl', 'acj', 'aob', 'm6'];
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
  const dir = realpathSync(mkdtempSync('/tmp/mbfix-aeon-'));
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
const SOCK_DIR = mkdtempSync('/tmp/mbfix-sock-');
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
async function loadOracle() {
  const req = createRequire(`${RUN.root}/package.json`);
  const esb = req('esbuild');
  const bundle = async (p) => {
    const r = esb.buildSync({ entryPoints: [`${RUN.root}/${p}`], bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error' });
    return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
  };
  const paint = await bundle('src/core/collision/collision-paint.ts');
  const cell = await bundle('src/core/collision/collision-cell.ts');
  const types = await bundle('src/core/model/s4-types.ts');
  if (typeof paint.collisionPaintTargets !== 'function') throw new Error('ORACLE: no collisionPaintTargets');
  if (typeof cell.cellTileIndices !== 'function') throw new Error('ORACLE: no cellTileIndices');
  const W = types.SECTION_TILES_WIDE; const H = types.SECTION_TILES_HIGH;
  if (!Number.isInteger(W) || !Number.isInteger(H)) throw new Error(`ORACLE: section size ${W}x${H}`);
  const PAL = 'src/renderer/components/CollisionPalette.tsx';
  const brushRow = fromHead(PAL, /\{\[([0-9, ]+)\]\.map\(\(n\) => \(\s*<button key=\{n\} onClick=\{\(\) => setBrush\(n\)\}/, 'the Brush row');
  const brushSizes = brushRow[1].split(',').map((s) => Number(s.trim()));
  const CL = 'src/renderer/components/ChunkLinkOptions.tsx';
  fromHead(CL, /`Under cursor: \$\{chunkName\(hovered\.chunkId\)\} \(#\$\{hovered\.id\}\)`/, 'the readout template');
  const noLink = fromHead(CL, /: '(Under cursor: no chunk link)'\}/, 'the no-link readout')[1];
  const sub = (cc, cr) => cell.cellTileIndices(cc, cr, W);
  // The page-side searches restate the sub-tile layout (they run thousands of
  // candidates in one evaluate). Checked here against the tree's own function.
  const pageSub = (cc, cr) => [0, 1].flatMap((dy) => [0, 1].map((dx) => (2 * cr + dy) * W + 2 * cc + dx));
  for (const [cc, cr] of [[0, 0], [3, 5], [17, 2]]) {
    if (J([...sub(cc, cr)].sort((a, b) => a - b)) !== J(pageSub(cc, cr))) throw new Error(`ORACLE: the page's sub-tile layout disagrees with cellTileIndices at (${cc},${cr})`);
  }
  const targets = (cc, cr, brush) => paint.collisionPaintTargets({
    cellCol: cc, cellRow: cr, brush, propagate: false,
    nametable: new Uint16Array(W * H), width: W, cellsW: W / 2, cellsH: H / 2,
  }).all;
  const footprint = (cellsList) => [...new Set(cellsList.flatMap((t) => sub(t.cellCol, t.cellRow)))].sort((a, b) => a - b);
  // PART bw's expected words: the tree's own merge rule ("the brush owns its
  // fields; each cell keeps the rest") and its decoder, never a typed mask.
  const cw = await bundle('src/core/editing/collision-word.ts');
  const ccw = await bundle('src/core/collision/collision-cell-word.ts');
  if (typeof cw.collisionPaintWord !== 'function') throw new Error('ORACLE: no collisionPaintWord');
  if (typeof ccw.unpackCollisionCell !== 'function') throw new Error('ORACLE: no unpackCollisionCell');
  const paintWord = (brushWord, oldWord) => cw.collisionPaintWord(brushWord, oldWord, 'keep', 'a');
  return { W, H, brushSizes, noLink, sub, targets, footprint, paintWord, unpack: ccw.unpackCollisionCell };
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
  console.log('=== map-behaviour-fixes 2026-09-12 harness ===');
  console.log(`    uptime       : ${uptime()}`);
  console.log(`    PARTS        : ${PARTS.join(',')}`);
  console.log(`    node         : ${process.version}`);
  console.log(`    root         : ${RUN.root}`);
  console.log(`    in-tree      : ${samePath(RUN.root, HERE) ? 'yes' : 'NO'} (the tree under test is ${RUN.root}; this file lives in ${HERE})`);
  console.log(`    ORACLE_SOCKET: ${SOCK}   (private; made by this run)`);
  console.log(`    profile      : ${RUN_PROFILE_DIR}`);
  console.log(`    PORT         : ${PORT}   DISPLAY: xvfb-run -a (never :0)`);
  const O = await loadOracle();
  console.log(`    oracle       : literals from HEAD ${HEAD_SHA}; collision-paint, collision-cell, s4-types, collision-word, collision-cell-word bundled from ${RUN.root}/src; brush sizes ${J(O.brushSizes)}; section ${O.W}x${O.H} tiles`);
  const selfPath = 'scratchpad/map-behaviour-fixes-harness.mjs';
  const selfHash = git('hash-object', selfPath).stdout.trim();
  const selfHead = git('rev-parse', `HEAD:${selfPath}`).stdout.trim();
  console.log(`    harness      : blob ${selfHash} (${selfHash === selfHead ? 'as committed at HEAD' : `DIFFERS from HEAD's ${selfHead || 'none'}`})`);
  const dirty = git('status', '--porcelain', '--untracked-files=no', '--', 'src').stdout.trim();
  console.log(`    src on disk  : ${dirty ? `DIFFERS FROM HEAD (a mutation?):\n${dirty.split('\n').map((l) => `                   ${l}`).join('\n')}` : 'identical to HEAD'}`);
  const A = makeCopy();
  console.log(`    aeon source  : ${AEON.name}=${AEON.value}   (live sibling ${LIVE_AEON ?? 'unresolved'}: refused if equal)`);
  console.log(`    copy         : ${A.dir}   project ${J(A.name)}`);

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
    const parts = { m1: m1Part, m2: m2Part, m4: m4Part, bw: bwPart, abw: abwPart, abl: ablPart, atl: atlPart, acj: acjPart, aob: aobPart, m6: m6Part };
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

// ═══ COLLISION HELPERS ═════════════════════════════════════════════════════
const SHAPE_N = (n) => String.raw`([...document.querySelectorAll('button')].filter((b) => /^#\d+/.test(b.title || '') && b.getBoundingClientRect().width > 0)[${n}] || null)`;
/** `armCollisionBrush` with an EMPTY selection writes nothing: a read. */
const brushRead = (d) => d.c.json('window.__dbg.aeon.armCollisionBrush({})');
const painted = (row) => Array.isArray(row) && row.length === 4 && row.every((w) => w !== 0 && w !== null);
const clean = (row) => Array.isArray(row) && row.every((w) => w === 0);
const same = (x, y) => J(x) === J(y);

/** The Collision facet, the collision brush, Keep, Brush 1, Plane A, a shape;
 *  camera at the origin, zoom 2. Every palette press is a real click. */
async function collisionSetup(d, label) {
  await neutral(d);
  const facet = await d.realClick(d.FACET('Collision'));
  await sleep(700);
  if ((await d.st()).tool !== 'paint-collision') await d.chord('c');
  const keep = await d.realClick(d.BTN_IN('Loop', 'Keep'), { scroll: true });
  const brush1 = await d.realClick(d.BTN_IN('Brush', '1'), { scroll: true });
  const planeA = await d.realClick(d.BTN_IN('Plane', 'A'), { scroll: true });
  const shape = await d.realClick(SHAPE_N(3), { scroll: true });
  await d.setView(0, 0, 2);
  const G = await d.geometry(label);
  const brush = await brushRead(d);
  const tool = (await d.st()).tool;
  const hits = { facet: !!facet?.hitOk, keep: !!keep?.hitOk, brush1: !!brush1?.hitOk, planeA: !!planeA?.hitOk, shape: !!shape?.hitOk };
  const ok = hits.facet && hits.brush1 && hits.planeA && hits.shape && tool === 'paint-collision'
    && brush.plane === 'a' && brush.crossover === 'keep' && brush.bothPlanes === false && brush.word !== 0;
  return { G, brush, tool, hits, ok };
}

/** The top-left cell of the first w x h block of cells that is air on every
 *  plane named, inside the visible map with a margin (two cells at the top for
 *  the legend, two at the bottom for the hover bar). Page-side for speed; the
 *  sub-tile layout it uses was checked against cellTileIndices at load. */
function findAir(d, O, G, w, h, planes) {
  const x0 = G.V.x; const y0 = G.V.y; const x1 = G.V.x + G.R.w / G.V.zoom; const y1 = G.V.y + G.R.h / G.V.zoom;
  const c0 = Math.ceil(x0 / 16) + 1; const r0 = Math.ceil(y0 / 16) + 2;
  const c1 = Math.floor(x1 / 16) - 1; const r1 = Math.floor(y1 / 16) - 2;
  return d.c.json(String.raw`(() => { const a = window.__dbg.aeon; const W = ${O.W};
    const sub = (cc, cr) => [0, 1].flatMap((dy) => [0, 1].map((dx) => (2 * cr + dy) * W + 2 * cc + dx));
    for (let cr = ${r0}; cr + ${h} <= ${r1}; cr++) for (let cc = ${c0}; cc + ${w} <= ${c1}; cc++) {
      let ok = true;
      for (let y = 0; y < ${h} && ok; y++) for (let x = 0; x < ${w} && ok; x++) for (const i of sub(cc + x, cr + y)) {
        for (const p of ${J(planes)}) if (a.collisionAt(0, p, i) !== 0) { ok = false; break; }
        if (!ok) break;
      }
      if (ok) return { cc, cr, searched: { c0: ${c0}, r0: ${r0}, c1: ${c1}, r1: ${r1} } };
    }
    return null; })()`);
}
/** Words of plane A and B over a list of cells (each four sub-tiles). */
function cellWords(d, O, cellsList) {
  const idx = cellsList.map((q) => O.sub(q.cc, q.cr));
  return d.c.json(String.raw`(() => { const a = window.__dbg.aeon; const idx = ${J(idx)};
    return { a: idx.map((ix) => ix.map((i) => a.collisionAt(0, 'a', i))), b: idx.map((ix) => ix.map((i) => a.collisionAt(0, 'b', i))) }; })()`);
}
/** An integer aim at world (wx, wy), the cell it lands on derived back from
 *  that integer, and whether the point is on the map's canvas. */
async function aimAt(d, G, wx, wy) {
  const p = d.aimWorld(G, wx, wy);
  const w = d.worldAt(G, p.x, p.y);
  return { ...p, world: { x: +w.x.toFixed(2), y: +w.y.toFixed(2) }, cell: { cc: Math.floor(w.x / 16), cr: Math.floor(w.y / 16) },
    tile: { col: Math.floor(w.x / 8), row: Math.floor(w.y / 8) }, onMap: await d.onMap(p) };
}
async function rectUnmoved(d, G) {
  const R = await d.canvasRect();
  return !!R && Math.abs(R.x - G.R.x) < 0.01 && Math.abs(R.y - G.R.y) < 0.01 && Math.abs(R.w - G.R.w) < 0.01 && Math.abs(R.h - G.R.h) < 0.01;
}

// ═══════════════════════════════════════════════════════════════════════════
// PART m1. CollisionPalette's Plane A and B act and then drop focus.
// ═══════════════════════════════════════════════════════════════════════════
async function m1Part(d, O) {
  const S = await collisionSetup(d, 'm1');
  const found = await findAir(d, O, S.G, 4, 1, ['a', 'b']);
  const cells = found ? [0, 1, 2, 3].map((k) => ({ cc: found.cc + k, cr: found.cr })) : [];
  const aims = [];
  for (const q of cells) aims.push(await aimAt(d, S.G, q.cc * 16 + 8, q.cr * 16 + 8));
  const aimsOk = aims.length === 4 && aims.every((p, k) => same(p.cell, cells[k]) && p.onMap);
  check('M1.0', 'PREMISE: the Collision facet, the collision brush, Plane A, Keep, Brush 1 and a shape by real clicks; four cells in a row that are air on BOTH planes, each aimed at an integer client pixel that lands on that cell of the map canvas',
    S.ok && !!found && aimsOk, `dpr ${S.G.R.dpr}; rect ${J(S.G.R)}; view ${J(S.G.V)}; hits ${J(S.hits)}; brush ${J(S.brush)}; cells ${J(found)}; aims ${J(aims)}`);
  if (!(S.ok && found && aimsOk)) return;
  const words = () => cellWords(d, O, cells);
  const w0 = await words();

  const bClick = await d.realClick(d.BTN_IN('Plane', 'B'), { scroll: true });
  const fB = await d.active(); const pB = (await brushRead(d)).plane;
  const aClick = await d.realClick(d.BTN_IN('Plane', 'A'), { scroll: true });
  const fA = await d.active(); const pA = (await brushRead(d)).plane;
  check('M1.a', 'a REAL click on Plane B, then one on Plane A: each moves the aimed plane, and after each document.activeElement is <body>, not the button (actAndDropFocus)',
    !!bClick?.hitOk && !!aClick?.hitOk && pB === 'b' && pA === 'a' && !!fB?.isBody && !!fA?.isBody,
    `B aim ${J(bClick)} -> plane ${pB}, activeElement ${J(fB)}; A aim ${J(aClick)} -> plane ${pA}, activeElement ${J(fA)}`);

  const unmoved = await rectUnmoved(d, S.G);
  await d.clicksDrain();
  await d.mouse('mouseMoved', aims[0].x, aims[0].y);
  await d.mouse('mousePressed', aims[0].x, aims[0].y, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', aims[1].x, aims[1].y, 'left', 1); await sleep(150);
  const fHeld = await d.active();
  const w1 = await words();
  await d.clicksDrain();
  await d.space();
  const spaceClicks = await d.clicksDrain();
  const pSpace = (await brushRead(d)).plane; const fSpace = await d.active();
  check('M1.b', 'with the stroke HELD (cells 1 and 2 painted on A), a real bare SPACE presses NO Plane button: no click event reaches one, focus is still <body>, and the aimed plane is still A',
    unmoved && !!fHeld?.isBody && painted(w1.a[0]) && painted(w1.a[1]) && !spaceClicks.some((k) => k.row === 'Plane') && pSpace === 'a' && !!fSpace?.isBody,
    `canvas unmoved ${unmoved}; activeElement while held ${J(fHeld)}; clicks the Space produced ${J(spaceClicks)}; plane ${pSpace}; activeElement after ${J(fSpace)}; A cells 1,2 ${J(w1.a.slice(0, 2))}`);
  await d.mouse('mouseMoved', aims[2].x, aims[2].y, 'left', 1); await sleep(150);
  await d.mouse('mouseMoved', aims[3].x, aims[3].y, 'left', 1); await sleep(150);
  await d.mouse('mouseReleased', aims[3].x, aims[3].y, 'left', 0); await sleep(300);
  const w2 = await words();
  await d.chord('z', CTRL);
  const w3 = await words();
  check('M1.c', 'CONTROL: the stroke went on on plane A over all four cells, plane B is untouched, and it is ONE undo step: one Ctrl+Z puts both planes back exactly',
    w2.a.every(painted) && same(w2.b, w0.b) && same(w3.a, w0.a) && same(w3.b, w0.b),
    `after release ${J(w2)}; after one Ctrl+Z ${J(w3)}; before ${J(w0)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART m2. After a plane switch under a held stroke, the cell under the
// pointer is painted on the new plane without leaving it.
// ═══════════════════════════════════════════════════════════════════════════
async function m2Part(d, O) {
  const S = await collisionSetup(d, 'm2');
  const found = await findAir(d, O, S.G, 2, 1, ['a', 'b']);
  if (!(S.ok && found)) {
    check('M2.0', 'PREMISE: the collision setup and two air cells in a row on both planes', 'UNMEASURABLE', `hits ${J(S.hits)}; brush ${J(S.brush)}; found ${J(found)}`);
    return;
  }
  const k = { cc: found.cc, cr: found.cr }; const k1 = { cc: found.cc + 1, cr: found.cr };
  const aIn = await aimAt(d, S.G, k.cc * 16 + 4, k.cr * 16 + 4);    // cell k, its top-left 8px tile
  const aIn2 = await aimAt(d, S.G, k.cc * 16 + 12, k.cr * 16 + 12); // the SAME cell, its bottom-right tile
  const aNext = await aimAt(d, S.G, k1.cc * 16 + 8, k1.cr * 16 + 8);
  const geomOk = same(aIn.cell, k) && same(aIn2.cell, k) && !same(aIn.tile, aIn2.tile) && same(aNext.cell, k1) && aIn.onMap && aIn2.onMap && aNext.onMap;
  const words = () => cellWords(d, O, [k, k1]);
  const w0 = await words();
  // ⚠ DEV RUN 1: collisionSetup's LAST click is a shape button, which keeps
  // focus, so Tab walked the shape grid for 150 presses and never came back to
  // the Plane row. F-1's real sequence starts with a click on Plane A, so the
  // part makes that click here, and records where it leaves focus.
  const aAgain = await d.realClick(d.BTN_IN('Plane', 'A'), { scroll: true });
  const f0 = await d.active();
  if (!aAgain?.hitOk) throw new Error(`the Plane A click missed: ${J(aAgain)}`);
  await d.mouse('mouseMoved', aIn.x, aIn.y);
  await d.mouse('mousePressed', aIn.x, aIn.y, 'left', 1); await sleep(150);
  const w1 = await words();
  // Tab to Plane B with the stroke held, counting the presses.
  let n = 0; let f = null; const stops = [];
  for (n = 1; n <= 150; n++) {
    await d.tab();
    f = await d.active();
    if (stops.length < 6) stops.push(f ? `${f.tag}:${f.text}:${f.row}` : null);
    if (f && f.tag === 'BUTTON' && f.text === 'B' && f.row === 'Plane') break;
  }
  const reached = !!f && f.tag === 'BUTTON' && f.text === 'B' && f.row === 'Plane';
  const unmoved = await rectUnmoved(d, S.G);
  await d.clicksDrain();
  if (reached) await d.space();
  const clicks = await d.clicksDrain();
  const pNow = (await brushRead(d)).plane; const fAfter = await d.active();
  const premise = geomOk && painted(w1.a[0]) && clean(w1.b[0]) && reached && unmoved
    && clicks.some((x) => x.row === 'Plane' && x.text === 'B') && pNow === 'b';
  check('M2.0', 'PREMISE: the press painted cell k on plane A; with the stroke held, Tab reached Plane B and a real Space pressed it (a click reached Plane B) and the aimed plane is B; the canvas did not move; the two aims inside cell k are ONE 16px cell and TWO 8px tiles',
    premise ? true : (reached ? false : 'UNMEASURABLE'),
    `dpr ${S.G.R.dpr}; rect ${J(S.G.R)}; view ${J(S.G.V)}; aims ${J({ aIn, aIn2, aNext })}; cell k on A after the press ${J(w1.a[0])}; `
    + `Tab presses ${reached ? n : `>${n - 1} (never reached)`}; first stops ${J(stops)}; focus before ${J(f0)}; clicks the Space produced ${J(clicks)}; plane ${pNow}; canvas unmoved ${unmoved}`);
  note('M2.focus', reached
    ? `the Plane A click left focus on ${J(f0)}; Tab from there reached Plane B in ${n} press(es); after the Space-pressed B, document.activeElement is ${J(fAfter)}`
    : `the Plane A click left focus on ${J(f0)}; Tab never reached Plane B in ${n - 1} presses, so no Space was sent`);
  if (premise) {
    await d.mouse('mouseMoved', aIn2.x, aIn2.y, 'left', 1); await sleep(200);
    const w2 = await words();
    check('M2.a', 'after the switch, a move INSIDE THE SAME 16px cell paints that cell on plane B (all four sub-tiles), and plane A keeps it',
      painted(w2.b[0]) && painted(w2.a[0]), `cell k on B ${J(w2.b[0])}; on A ${J(w2.a[0])}; before ${J({ a: w0.a[0], b: w0.b[0] })}`);
    await d.mouse('mouseMoved', aNext.x, aNext.y, 'left', 1); await sleep(200);
  }
  await d.mouse('mouseReleased', aNext.x, aNext.y, 'left', 0); await sleep(300);
  const w3 = await words();
  await d.chord('z', CTRL); const w4 = await words();
  if (premise) {
    await d.chord('z', CTRL);
    const w5 = await words();
    check('M2.b', 'CONTROL (M3, ruled "leave it"): the stroke went on onto the next cell on B, and landed as recordPaint\'s plane clause says: two commands, the first Ctrl+Z takes back the B run only, the second the A run',
      painted(w3.b[1]) && clean(w3.a[1]) && painted(w4.a[0]) && same(w4.b, w0.b) && same(w5.a, w0.a) && same(w5.b, w0.b),
      `after release ${J(w3)}; after one Ctrl+Z ${J(w4)}; after two ${J(w5)}; before ${J(w0)}`);
  }
  await d.realClick(d.BTN_IN('Plane', 'A'), { scroll: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// PART m4. The brush SIZE is latched at the press.
// ═══════════════════════════════════════════════════════════════════════════
async function m4Part(d, O) {
  const S = await collisionSetup(d, 'm4');
  const [small, big] = O.brushSizes;   // the Brush row's first two buttons, in DOM order and so in Tab order
  // How far the big brush reaches, asked of collisionPaintTargets itself.
  const probe = O.targets(60, 60, big);
  const rx = Math.max(...probe.map((t) => Math.abs(t.cellCol - 60)));
  const found = await findAir(d, O, S.G, 2 * rx + 1, 2 * rx + 1, ['a']);
  if (!(S.ok && found && small === 1 && big > 1 && rx >= 1)) {
    check('M4.0', 'PREMISE: the collision setup, a Brush row of 1 then a larger size, and an air window the larger brush fits in', 'UNMEASURABLE',
      `hits ${J(S.hits)}; brush ${J(S.brush)}; sizes ${J(O.brushSizes)}; reach ${rx}; found ${J(found)}`);
    return;
  }
  const Q = { cc: found.cc + rx, cr: found.cr + rx }; const P = { cc: Q.cc - 1, cr: Q.cr };
  const win = [];
  for (let y = 0; y <= 2 * rx; y++) for (let x = 0; x <= 2 * rx; x++) win.push(...O.sub(found.cc + x, found.cr + y));
  const latched = O.footprint([...O.targets(P.cc, P.cr, small), ...O.targets(Q.cc, Q.cr, small)]);
  const live = O.footprint([...O.targets(P.cc, P.cr, small), ...O.targets(Q.cc, Q.cr, big)]);
  const next = O.footprint(O.targets(Q.cc, Q.cr, big));
  if (same(latched, live)) throw new Error('ANTI-VACUOUS: the latched and the live footprints agree, so M4.a could not tell them apart');
  const readWin = () => d.c.json(`${J(win)}.map((i) => window.__dbg.aeon.collisionAt(0, 'a', i))`);
  const changed = (w, base) => win.filter((_, n) => w[n] !== base[n]).sort((a, b) => a - b);
  const aP = await aimAt(d, S.G, P.cc * 16 + 8, P.cr * 16 + 8);
  const aQ = await aimAt(d, S.G, Q.cc * 16 + 8, Q.cr * 16 + 8);

  const b1 = await d.realClick(d.BTN_IN('Brush', String(small)), { scroll: true });
  const f1 = await d.active(); const sel1 = await d.selectedIn('Brush');
  const unmoved = await rectUnmoved(d, S.G);
  const w0 = await readWin();
  await d.mouse('mouseMoved', aP.x, aP.y);
  await d.mouse('mousePressed', aP.x, aP.y, 'left', 1); await sleep(150);
  await d.tab();
  const f2 = await d.active();
  await d.clicksDrain();
  await d.space();
  const clicks = await d.clicksDrain();
  const sel2 = await d.selectedIn('Brush');
  const premise = !!b1?.hitOk && f1?.row === 'Brush' && f1?.text === String(small) && sel1?.selected === String(small)
    && f2?.row === 'Brush' && f2?.text === String(big) && clicks.some((x) => x.row === 'Brush' && x.text === String(big))
    && sel2?.selected === String(big) && unmoved && same(aP.cell, P) && same(aQ.cell, Q) && aP.onMap && aQ.onMap;
  check('M4.0', `PREMISE: a real click on Brush ${small} left focus on it (the Brush buttons keep focus; no ruling covers them); with the stroke pressed on cell P, Tab moved focus to Brush ${big} and a real Space pressed it: the palette now draws ${big} selected`,
    premise, `dpr ${S.G.R.dpr}; rect ${J(S.G.R)}; view ${J(S.G.V)}; window top-left ${J(found)} reach ${rx}; P ${J(aP)} Q ${J(aQ)}; focus after the click ${J(f1)}, drawn ${J(sel1)}; after Tab ${J(f2)}; clicks ${J(clicks)}; drawn after Space ${J(sel2)}; canvas unmoved ${unmoved}`);
  await d.mouse('mouseMoved', aQ.x, aQ.y, 'left', 1); await sleep(200);
  const w1 = await readWin();
  const got = changed(w1, w0);
  if (premise) {
    check('M4.a', `the size picked MID-DRAG does not change the stroke: moving on to cell Q paints exactly the ${small}x${small} cells P and Q (collisionPaintTargets at the size LATCHED at the press), not the ${big}x${big} area around Q`,
      same(got, latched), `changed ${got.length} sub-tiles; latched expects ${latched.length}, the live size would give ${live.length}; first changes ${J(got.slice(0, 12))}`);
  }
  await d.mouse('mouseReleased', aQ.x, aQ.y, 'left', 0); await sleep(300);
  await d.chord('z', CTRL);
  const w2 = await readWin();
  if (premise) check('M4.b', 'CONTROL: the stroke is ONE undo step: one Ctrl+Z puts the whole window back exactly', same(w2, w0), `after one Ctrl+Z ${changed(w2, w0).length} sub-tiles still differ`);
  await d.mouse('mouseMoved', aQ.x, aQ.y);
  await d.mouse('mousePressed', aQ.x, aQ.y, 'left', 1); await sleep(80);
  await d.mouse('mouseReleased', aQ.x, aQ.y, 'left', 0); await sleep(300);
  const w3 = await readWin();
  const got3 = changed(w3, w0);
  if (premise) {
    check('M4.c', `CONTROL: the NEXT stroke is pressed with the new size: a click on Q paints the ${big}x${big} area collisionPaintTargets gives for Q`,
      same(got3, next), `changed ${got3.length} sub-tiles; expected ${next.length}`);
  }
  await d.chord('z', CTRL);
  const w4 = await readWin();
  note('M4.cleanup', `after the control's Ctrl+Z ${changed(w4, w0).length} sub-tiles differ from the start`);
  await d.realClick(d.BTN_IN('Brush', String(small)), { scroll: true });
  await d.blur();
}

// ═══════════════════════════════════════════════════════════════════════════
// PART bw. BRUSH-WORD-LATCH: the collision brush WORD is latched at the press.
// The hub's ruling (empyrean docs/OVERSEER-LOG.md 2026-09-12T09:39:48Z, option
// (a)): shape, flip and solidity latch at the press as M4 latches size. The
// route is the one cdp-sweep-4 section 5.4 O2 measured: collisionSetup's LAST
// click is a shape button, which KEEPS focus (the ruling leaves palette focus
// alone), so with the stroke held a real Tab moves focus to the next shape
// button and a real Space presses it. Before the fix, cells 3 and 4 of the
// stroke took the new word. The expected cell words are the tree's own
// `collisionPaintWord` over each sub-tile's word before the stroke.
// ═══════════════════════════════════════════════════════════════════════════
/** The focused element, and whether it is one of SHAPE_N's shape buttons (a
 *  visible button titled `#<n> ...`), with its index in that list. */
const focusShape = (d) => d.c.json(String.raw`(() => { const a = document.activeElement;
  if (!a || a === document.body) return { body: true, shape: false, index: -1 };
  const list = [...document.querySelectorAll('button')].filter((b) => /^#\d+/.test(b.title || '') && b.getBoundingClientRect().width > 0);
  return { body: false, tag: a.tagName, title: (a.title || '').slice(0, 40) || null, shape: list.includes(a), index: list.indexOf(a) }; })()`);
async function bwPart(d, O) {
  const S = await collisionSetup(d, 'bw');
  const found = await findAir(d, O, S.G, 4, 1, ['a']);
  const cells = found ? [0, 1, 2, 3].map((k) => ({ cc: found.cc + k, cr: found.cr })) : [];
  const aims = [];
  for (const q of cells) aims.push(await aimAt(d, S.G, q.cc * 16 + 8, q.cr * 16 + 8));
  const aimsOk = aims.length === 4 && aims.every((p, k) => same(p.cell, cells[k]) && p.onMap);
  if (!(S.ok && found && aimsOk)) {
    check('BW.0', 'PREMISE: the collision setup and four cells in a row that are air on plane A, each aimed at an integer client pixel on that cell', 'UNMEASURABLE',
      `dpr ${S.G.R.dpr}; rect ${J(S.G.R)}; hits ${J(S.hits)}; brush ${J(S.brush)}; found ${J(found)}; aims ${J(aims)}`);
    return;
  }
  const words = () => cellWords(d, O, cells);
  const w0 = await words();
  /** What each sub-tile of the four cells carries if brush word W painted it. */
  const expectA = (W) => w0.a.map((row) => row.map((old) => O.paintWord(W, old)));
  const W1 = (await brushRead(d)).word;
  const f0 = await focusShape(d);
  const unmoved0 = await rectUnmoved(d, S.G);
  await d.clicksDrain();
  await d.mouse('mouseMoved', aims[0].x, aims[0].y);
  await d.mouse('mousePressed', aims[0].x, aims[0].y, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', aims[1].x, aims[1].y, 'left', 1); await sleep(150);
  const w1 = await words();
  const fHeld = await focusShape(d);
  await d.tab();
  const fTab = await focusShape(d);
  await d.clicksDrain();
  await d.space();
  const spaceClicks = await d.clicksDrain();
  const W2 = (await brushRead(d)).word;
  const unmoved1 = await rectUnmoved(d, S.G);
  const u1 = O.unpack(W1); const u2 = O.unpack(W2);
  const differs = Object.keys(u1).filter((k) => u1[k] !== u2[k]);
  const shapeClick = spaceClicks.some((k) => /^#\d+/.test(k.title || ''));
  const premise = unmoved0 && unmoved1 && f0.shape && fHeld.shape && fHeld.index === f0.index
    && fTab.shape && fTab.index !== f0.index && shapeClick && W2 !== W1
    && !same(expectA(W2), expectA(W1))
    && same(w1.a.slice(0, 2), expectA(W1).slice(0, 2));
  check('BW.0', 'PREMISE: the shape button the setup clicked keeps focus through the press; with the stroke HELD (cells 1 and 2 painted with the pressed word W1), a real Tab moved focus to ANOTHER shape button and a real Space pressed it (a click reached a shape button), so the store now selects a word W2 that paints differently (ANTI-VACUOUS); the canvas did not move',
    premise, `dpr ${S.G.R.dpr}; rect ${J(S.G.R)}; view ${J(S.G.V)}; cells ${J(cells)}; aims ${J(aims.map((p) => ({ x: p.x, y: p.y, world: p.world, cell: p.cell })))}; `
    + `focus after setup ${J(f0)}, while held ${J(fHeld)}, after Tab ${J(fTab)}; clicks the Space produced ${J(spaceClicks)}; `
    + `W1 ${W1} ${J(u1)} -> W2 ${W2} ${J(u2)} (fields that differ ${J(differs)}); A cells 1,2 after the press ${J(w1.a.slice(0, 2))}; canvas unmoved ${unmoved0}/${unmoved1}`);
  await d.mouse('mouseMoved', aims[2].x, aims[2].y, 'left', 1); await sleep(150);
  await d.mouse('mouseMoved', aims[3].x, aims[3].y, 'left', 1); await sleep(150);
  await d.mouse('mouseReleased', aims[3].x, aims[3].y, 'left', 0); await sleep(300);
  const w2 = await words();
  if (premise) {
    check('BW.a', 'the word picked MID-DRAG does not change the stroke: cells 3 and 4, painted AFTER the Space, carry the word LATCHED at the press (W1) like cells 1 and 2, not W2',
      same(w2.a, expectA(W1)),
      `A cells 1..4 ${J(w2.a)}; W1 paints ${J(expectA(W1)[0])} per cell; the live word W2 would paint ${J(expectA(W2)[0])}`);
    check('BW.b', 'CONTROL (green with or without the latch): cells 1 and 2, painted BEFORE the Space, carry W1, and plane B is untouched',
      same(w2.a.slice(0, 2), expectA(W1).slice(0, 2)) && same(w2.b, w0.b),
      `A cells 1,2 ${J(w2.a.slice(0, 2))}; B ${J(w2.b)}; B before ${J(w0.b)}`);
  }
  await d.chord('z', CTRL);
  const w3 = await words();
  if (premise) {
    check('BW.c', 'CONTROL: the stroke is ONE undo step: one Ctrl+Z puts both planes back exactly',
      same(w3.a, w0.a) && same(w3.b, w0.b), `after one Ctrl+Z ${J(w3)}; before ${J(w0)}`);
  }
  await d.mouse('mouseMoved', aims[0].x, aims[0].y);
  await d.mouse('mousePressed', aims[0].x, aims[0].y, 'left', 1); await sleep(80);
  await d.mouse('mouseReleased', aims[0].x, aims[0].y, 'left', 0); await sleep(300);
  const w4 = await words();
  if (premise) {
    check('BW.d', 'CONTROL: the NEXT press takes the word picked during the last stroke: a click on cell 1 paints it with W2, and cells 2 to 4 stay as they were',
      same(w4.a[0], expectA(W2)[0]) && same(w4.a.slice(1), w0.a.slice(1)),
      `A cells 1..4 ${J(w4.a)}; W2 paints ${J(expectA(W2)[0])} on cell 1`);
  }
  await d.chord('z', CTRL);
  const w5 = await words();
  note('BW.cleanup', `after the control's Ctrl+Z the four cells ${same(w5, w0) ? 'match' : 'DIFFER FROM'} the start`);
  await d.blur();
}

// ═══════════════════════════════════════════════════════════════════════════
// PART abw. ART-BRUSH-WORD-LATCH: the Art facet's collision brush WORD is
// latched at the press, as the map's is (PART bw). The composer's writer is a
// different function from the map's (ComposerCanvas.applyTileCell, reached from
// the hostPointer PixelViewport routes pointer events to), so PART bw says
// nothing about it. The document is the chunk the aeon open put in the
// composer (aeon-open.ts, `firstEditableChunk`); nothing is saved, and the
// project is this run's copy. The composer canvas does not preventDefault its
// press, so the press can take focus off the shape button the setup clicked:
// the route is therefore "real Tabs until focus is on a shape button other
// than the pressed one", every hop recorded, then one real Space.
// Expected words: the tree's own `collisionPaintWord` over each cell's word
// before the stroke.
// ═══════════════════════════════════════════════════════════════════════════
const COMPOSER_CANVAS = String.raw`([...document.querySelectorAll('canvas')].find((k) =>
  k.parentElement && k.parentElement.style.margin === 'auto'
  && k.parentElement.style.padding === '24px' && k.offsetParent !== null) || null)`;
/** The composer's document for PARTs abw and abl. Returns
 *  `{ hitOk, chunk, gridCells }`: hitOk means the chunk the real double-click
 *  aimed at is the one now open in the Art facet. */
async function openArtChunk(d) {
  const { c } = d;
  // The document: a chunk with art, at least 8 tiles wide (four 16px cells in a
  // row), opened by a REAL double-click on its Chunks grid thumbnail
  // (ChunkGrid's onDoubleClick -> chunk-grid-aeon `openChunkInComposer`, which
  // opens it in the composer and switches to the Art facet). The grid shows
  // under the stamp tool, as PART m6 uses it.
  await d.chord('k');
  const CELLS = String.raw`[...document.querySelectorAll('button')].filter((b) => b.title && !/^tile /i.test(b.title) && !/blank/i.test(b.title)
    && b.querySelector(':scope > canvas') && b.getBoundingClientRect().width > 0)`;
  const nCells = await c.evalExpr(`${CELLS}.length`);
  let X = null;
  for (let n = 0; n < Math.min(nCells, 40) && !X; n++) {
    const p = await d.realClick(`(${CELLS}[${n}] || null)`, { scroll: true });
    const id = await c.json('window.__dbg.aeon.selectedChunk()');
    const info = id ? await c.json(`window.__dbg.aeon.chunkInfo(${J(id)})`) : null;
    if (p && p.hitOk && info && info.nonzeroTiles > 0 && info.widthTiles >= 8 && info.heightTiles >= 2) X = { id, info, aim: { x: p.x, y: p.y } };
  }
  if (X) {
    // A real double-click: two presses, the second with clickCount 2.
    const dbl = async (x, y) => {
      SENT.add(`${x},${y}`);
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
      for (const n of [1, 2]) {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: n });
        await sleep(30);
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: n });
        await sleep(60);
      }
    };
    await dbl(X.aim.x, X.aim.y);
    await sleep(1200);
  }
  return { hitOk: (await c.json('window.__dbg.aeon.artChunkOpen()'))?.chunkId === X?.id && !!X, chunk: X, gridCells: nCells };
}

async function abwPart(d, O) {
  const { c } = d;
  await neutral(d);
  const facet = await openArtChunk(d);
  const tool = await d.realClick('document.querySelector(\'button[aria-label="Collision paint"]\')');
  await sleep(600);
  const doc = await c.json('window.__dbg.aeon.artChunkOpen()');
  const planeA = await d.realClick(d.BTN_IN('Plane', 'A'), { scroll: true });
  const shape = await d.realClick(SHAPE_N(3), { scroll: true });
  await sleep(200);
  const G = await c.json(String.raw`(() => { const cv = ${COMPOSER_CANVAS}; if (!cv) return null; const b = cv.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, cw: cv.width, ch: cv.height, dpr: window.devicePixelRatio }; })()`);
  const brush = await brushRead(d);
  const setupOk = !!facet?.hitOk && !!tool?.hitOk && !!planeA?.hitOk && !!shape?.hitOk && !!doc && doc.chunkId !== null
    && doc.tool === 'collision' && !!G && brush.plane === 'a' && brush.word !== 0;
  const zoom = G && doc ? G.cw / (doc.widthTiles * 8) : null;
  const cellsW = doc ? doc.widthTiles >> 1 : 0; const cellsH = doc ? doc.heightTiles >> 1 : 0;
  /** Integer aim at the centre of composer cell (cx, cy), the cell derived back
   *  from that integer, and whether the point is on the composer canvas. */
  const aimCell = async (cx, cy) => {
    const x = Math.round(G.x + (cx * 16 + 8) * zoom); const y = Math.round(G.y + (cy * 16 + 8) * zoom);
    const back = { cx: Math.floor((x - G.x) / zoom / 16), cy: Math.floor((y - G.y) / zoom / 16) };
    const on = await c.evalExpr(`document.elementFromPoint(${x}, ${y}) === ${COMPOSER_CANVAS}`);
    return { x, y, back, on };
  };
  let cells = null; let aims = null;
  if (setupOk && Number.isInteger(zoom) && zoom >= 1 && cellsW >= 4) {
    for (let cy = 0; cy < cellsH && !cells; cy++) {
      for (let cx = 0; cx + 4 <= cellsW && !cells; cx++) {
        const a = [];
        for (let k = 0; k < 4; k++) a.push(await aimCell(cx + k, cy));
        if (a.every((p, k) => p.on && p.back.cx === cx + k && p.back.cy === cy)) { cells = [0, 1, 2, 3].map((k) => ({ cx: cx + k, cy })); aims = a; }
      }
    }
  }
  if (!cells) {
    check('ABW.0', 'PREMISE: the Art facet, the Collision paint tool, Plane A and a shape armed by real clicks on a chunk document, and four cells in a row on the composer canvas, each aimed at an integer client pixel on that cell', 'UNMEASURABLE',
      `facet ${J(facet)}; tool ${J(tool)}; doc ${J(doc)}; planeA ${J(planeA)}; shape ${J(shape)}; canvas ${J(G)} zoom ${zoom}; brush ${J(brush)}`);
    return;
  }
  const idx = cells.map((q) => q.cy * cellsW + q.cx);
  const words = () => c.json(String.raw`(() => { const a = window.__dbg.aeon; const idx = ${J(idx)};
    return { a: idx.map((i) => a.artDocCollisionAt('a', i)), b: idx.map((i) => a.artDocCollisionAt('b', i)) }; })()`);
  const w0 = await words();
  const expectA = (W) => w0.a.map((old) => O.paintWord(W, old));
  const W1 = (await brushRead(d)).word;
  const f0 = await focusShape(d);
  await d.clicksDrain();
  await d.mouse('mouseMoved', aims[0].x, aims[0].y);
  await d.mouse('mousePressed', aims[0].x, aims[0].y, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', aims[1].x, aims[1].y, 'left', 1); await sleep(150);
  const w1 = await words();
  const fHeld = await focusShape(d);
  // Real Tabs until focus is on a shape button other than the pressed one.
  // Bounded; every hop is recorded. A Tab presses nothing (checked below).
  const hops = [];
  let fTab = fHeld;
  for (let n = 0; n < 60; n++) {
    await d.tab();
    fTab = await focusShape(d);
    hops.push(fTab.shape ? `shape#${fTab.index}` : (fTab.body ? 'BODY' : `${fTab.tag}:${fTab.title ?? ''}`));
    if (fTab.shape && fTab.index !== f0.index) break;
  }
  const tabClicks = await d.clicksDrain();
  await d.space();
  const spaceClicks = await d.clicksDrain();
  const W2 = (await brushRead(d)).word;
  const G1 = await c.json(String.raw`(() => { const cv = ${COMPOSER_CANVAS}; if (!cv) return null; const b = cv.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const unmoved = !!G1 && Math.abs(G1.x - G.x) < 0.01 && Math.abs(G1.y - G.y) < 0.01 && Math.abs(G1.w - G.w) < 0.01 && Math.abs(G1.h - G.h) < 0.01;
  const u1 = O.unpack(W1); const u2 = O.unpack(W2);
  const differs = Object.keys(u1).filter((k) => u1[k] !== u2[k]);
  const shapeClick = spaceClicks.some((k) => /^#\d+/.test(k.title || ''));
  const premise = unmoved && f0.shape && fTab.shape && fTab.index !== f0.index && tabClicks.length === 0 && shapeClick && W2 !== W1
    && !same(expectA(W2), expectA(W1))
    && same(w1.a.slice(0, 2), expectA(W1).slice(0, 2));
  check('ABW.0', 'PREMISE: on the composer\'s chunk document, with the stroke HELD (cells 1 and 2 painted with the pressed word W1), real Tabs moved focus to ANOTHER shape button (no Tab clicked anything) and a real Space pressed it (a click reached a shape button), so the store now selects a word W2 that paints differently (ANTI-VACUOUS); the canvas did not move',
    premise, `dpr ${G.dpr}; canvas ${J(G)} zoom ${zoom}; doc ${J(doc)}; cells ${J(cells)} idx ${J(idx)}; aims ${J(aims)}; `
    + `focus after setup ${J(f0)}, while held ${J(fHeld)}, Tab hops ${J(hops)}, final ${J(fTab)}; clicks during Tabs ${J(tabClicks)}; clicks the Space produced ${J(spaceClicks)}; `
    + `W1 ${W1} ${J(u1)} -> W2 ${W2} ${J(u2)} (fields that differ ${J(differs)}); A cells 1,2 after the press ${J(w1.a.slice(0, 2))} (before ${J(w0.a.slice(0, 2))}); canvas unmoved ${unmoved}`);
  await d.mouse('mouseMoved', aims[2].x, aims[2].y, 'left', 1); await sleep(150);
  await d.mouse('mouseMoved', aims[3].x, aims[3].y, 'left', 1); await sleep(150);
  await d.mouse('mouseReleased', aims[3].x, aims[3].y, 'left', 0); await sleep(400);
  const w2 = await words();
  if (premise) {
    check('ABW.a', 'the word picked MID-DRAG does not change the composer stroke: cells 3 and 4, painted AFTER the Space, carry the word LATCHED at the press (W1) like cells 1 and 2, not W2',
      same(w2.a, expectA(W1)),
      `A cells 1..4 ${J(w2.a)}; W1 paints ${J(expectA(W1))}; the live word W2 would paint ${J(expectA(W2))}`);
    check('ABW.b', 'CONTROL (green with or without the latch): cells 1 and 2, painted BEFORE the Space, carry W1, and plane B is untouched',
      same(w2.a.slice(0, 2), expectA(W1).slice(0, 2)) && same(w2.b, w0.b),
      `A cells 1,2 ${J(w2.a.slice(0, 2))}; B ${J(w2.b)}; B before ${J(w0.b)}`);
  }
  await d.blur();
  await d.chord('z', CTRL);
  await sleep(300);
  const w3 = await words();
  if (premise) {
    check('ABW.c', 'CONTROL: the stroke is ONE undo step: one Ctrl+Z puts both planes of the four cells back exactly',
      same(w3.a, w0.a) && same(w3.b, w0.b), `after one Ctrl+Z ${J(w3)}; before ${J(w0)}`);
  }
  await d.mouse('mouseMoved', aims[0].x, aims[0].y);
  await d.mouse('mousePressed', aims[0].x, aims[0].y, 'left', 1); await sleep(80);
  await d.mouse('mouseReleased', aims[0].x, aims[0].y, 'left', 0); await sleep(400);
  const w4 = await words();
  if (premise) {
    check('ABW.d', 'CONTROL: the NEXT press takes the word picked during the last stroke: a click on cell 1 paints it with W2, and cells 2 to 4 stay as they were',
      w4.a[0] === expectA(W2)[0] && same(w4.a.slice(1), w0.a.slice(1)),
      `A cells 1..4 ${J(w4.a)}; W2 paints ${expectA(W2)[0]} on cell 1; cells 2..4 before ${J(w0.a.slice(1))}`);
  }
  await d.blur();
  await d.chord('z', CTRL);
  await sleep(300);
  const w5 = await words();
  note('ABW.cleanup', `after the control's Ctrl+Z the four cells ${same(w5, w0) ? 'match' : 'DIFFER FROM'} the start`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART abl. ART-BRUSH-LATCH-REST: the Art facet's TILE STAMP keeps the inputs
// it was pressed with. Driven here: the flips, the stamp inputs a real key
// changes with the stroke held (ComposerCanvas's window keydown toggles
// `flipRef` whenever the art tool is the tile stamp and focus is not a text
// field; a composer press leaves focus on <body>, PART abw's O4). The Y flip is
// the one changed mid-stroke; the X flip is armed BEFORE the press so that a
// stamped cell differs from the chunk's own (the premise requires the five
// tiles to hold no flip before). The other inputs (tile, line, priority,
// palette-apply line, the collision plane) are node rows:
// composer-brush-latch-rest-mounted.test.ts, which also covers X and Y.
// Expected cells come from source: `stampTile` (core/art/composer-buffer.ts)
// writes `atlasTile: spec.tile`, `hf: spec.hf`, `vf: spec.vf`; the spec's tile
// is the armed `brushTile` (read with `artChunkOpen`, which writes nothing),
// and the flips start `{ hf: false, vf: false }` because ComposerCanvas resets
// `flipRef` to that whenever the open document changes, and this part opens a
// fresh one: after its one X, the press-time flips are hf true, vf false.
// ═══════════════════════════════════════════════════════════════════════════
async function ablPart(d, O) {
  const { c } = d;
  await neutral(d);
  // A chunk already open in the composer (PART abw leaves its document open and
  // DIRTY: final1 found that a double-click on a chunk then asks whether to
  // discard it, and the facet never switched) is reached by a real click on the
  // Art facet instead. Otherwise the real double-click of PART abw opens one.
  const already = await c.json('window.__dbg.aeon.artChunkOpen()');
  let facet;
  if (already && already.chunkId !== null) {
    const art = await d.realClick(d.FACET('Art'));
    await sleep(800);
    facet = { hitOk: !!art?.hitOk && (await c.json('window.__dbg.aeon.artChunkOpen()'))?.chunkId === already.chunkId, route: 'Art facet click, document already open', already, art };
  } else {
    facet = { ...(await openArtChunk(d)), route: 'double-click on the Chunks grid' };
  }
  const tool = await d.realClick('document.querySelector(\'button[aria-label="Tile stamp"]\')');
  await sleep(600);
  const doc = await c.json('window.__dbg.aeon.artChunkOpen()');
  const measure = () => c.json(String.raw`(() => { const cv = ${COMPOSER_CANVAS}; if (!cv) return null; const b = cv.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, cw: cv.width, ch: cv.height, dpr: window.devicePixelRatio }; })()`);
  const G = await measure();
  const setupOk = !!facet?.hitOk && !!tool?.hitOk && !!doc && doc.chunkId !== null && doc.tool === 'tile-stamp' && !!G;
  const zoom = G && doc ? G.cw / (doc.widthTiles * 8) : null;
  const T = doc ? doc.brushTile : null;
  /** What `stampTile` writes into a cell, in the three fields read. */
  const stamped = (hf, vf) => ({ t: T, hf, vf });
  const pickOne = (q) => (q ? { t: q.atlasTile, hf: q.hf, vf: q.vf } : null);
  const pick = (cs) => cs.map(pickOne);
  /** Integer aim at the centre of composer TILE (tx, ty), the tile derived back
   *  from that integer, and whether the point is on the composer canvas. */
  const aimTile = async (tx, ty) => {
    const x = Math.round(G.x + (tx * 8 + 4) * zoom); const y = Math.round(G.y + (ty * 8 + 4) * zoom);
    const back = { tx: Math.floor((x - G.x) / zoom / 8), ty: Math.floor((y - G.y) / zoom / 8) };
    const on = await c.evalExpr(`document.elementFromPoint(${x}, ${y}) === ${COMPOSER_CANVAS}`);
    return { x, y, back, on };
  };
  const cellAt = (tx, ty) => c.json(`window.__dbg.aeon.artDocCellAt(${tx}, ${ty})`);
  // No warm-up stamp. Row 207 stamped one first because the first write to a
  // clean chunk document moved the canvas 42px down under the held stroke;
  // ART-STROKE-FOLLOWUPS (b) reserved the "unsaved" badge's width, so the
  // stroke below can be the document's first write (and ABL.0's "the canvas
  // did not move" row checks that it still does not move).
  let tiles = null; let aims = null; let c0 = null;
  if (setupOk && Number.isInteger(zoom) && zoom >= 1 && doc.widthTiles >= 5) {
    // Five tiles in a row, each aimed back to itself, where
    // the stamp visibly changes tiles 1, 2 (to the press-time flips) and 5 (to
    // the flips after the Y key): so a stamped tile is told apart from an
    // untouched one.
    for (let ty = 0; ty < doc.heightTiles && !tiles; ty++) {
      for (let tx = 0; tx + 5 <= doc.widthTiles && !tiles; tx++) {
        const pre = [];
        for (let k = 0; k < 5; k++) pre.push(pickOne(await cellAt(tx + k, ty)));
        if (same(pre[0], stamped(true, false)) || same(pre[1], stamped(true, false)) || same(pre[4], stamped(true, true))) continue;
        const a = [];
        for (let k = 0; k < 5; k++) a.push(await aimTile(tx + k, ty));
        if (a.every((p, k) => p.on && p.back.tx === tx + k && p.back.ty === ty)) { tiles = [0, 1, 2, 3, 4].map((k) => ({ tx: tx + k, ty })); aims = a; }
      }
    }
  }
  if (!tiles) {
    check('ABL.0', 'PREMISE: the Art facet and the Tile stamp tool armed by real clicks on a chunk document, and five tiles in a row on the composer canvas, each aimed at an integer client pixel on that tile', 'UNMEASURABLE',
      `facet ${J(facet)}; tool ${J(tool)}; doc ${J(doc)}; canvas ${J(G)} zoom ${zoom}`);
    return;
  }
  const cells = () => c.json(String.raw`(() => { const a = window.__dbg.aeon; return ${J(tiles)}.map((t) => a.artDocCellAt(t.tx, t.ty)); })()`);
  const rect = () => c.json(String.raw`(() => { const cv = ${COMPOSER_CANVAS}; if (!cv) return null; const b = cv.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; })()`);
  const sameRect = (r) => !!r && Math.abs(r.x - G.x) < 0.01 && Math.abs(r.y - G.y) < 0.01 && Math.abs(r.w - G.w) < 0.01 && Math.abs(r.h - G.h) < 0.01;
  c0 = await cells();
  // Before the stroke: a real X turns the stamp's H flip ON (focus on <body>,
  // not a text field), so the stroke's cells carry flips the chunk's own do not.
  await d.blur();
  await d.clicksDrain();
  const fPre = await d.active();
  await d.chord('x');
  const preClicks = await d.clicksDrain();
  const Gpre = await rect();
  // The stroke: tiles 1..4 (tile 5 is left for the next press).
  await d.mouse('mouseMoved', aims[0].x, aims[0].y);
  await d.mouse('mousePressed', aims[0].x, aims[0].y, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', aims[1].x, aims[1].y, 'left', 1); await sleep(150);
  const c1 = await cells();
  const Gpress = await rect();
  const fHeld = await d.active();
  await d.chord('y');   // the stamp's Y flip, with the stroke held
  const keyClicks = await d.clicksDrain();
  const G1 = await rect();
  const unmoved = sameRect(Gpre) && sameRect(Gpress) && sameRect(G1);
  const toolAfter = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.tool;
  const premise = unmoved && !!fPre && fPre.isBody && preClicks.length === 0 && !!fHeld && fHeld.isBody && keyClicks.length === 0
    && toolAfter === 'tile-stamp' && same(pick(c1).slice(0, 2), [stamped(true, false), stamped(true, false)]);
  check('ABL.0', 'PREMISE: on the composer\'s chunk document with the Tile stamp armed (dirty or not: no warm-up stamp); a real X before the stroke armed H; the stroke is HELD (tiles 1 and 2 stamped with the armed tile, hf true, vf false: the flips at the press); focus is on <body> both times (not a text field, so the composer\'s X/Y handler runs); a real Y was sent and clicked nothing; the tool is still the stamp; the canvas did not move',
    premise, `dpr ${G.dpr}; document reached by ${facet.route}; canvas ${J(G)} zoom ${zoom}; dirty before the stroke ${doc.dirty}; before X ${J(Gpre)}, after the press ${J(Gpress)}, after Y ${J(G1)}; doc ${J(doc)}; tiles ${J(tiles)}; aims ${J(aims)}; `
    + `focus before X ${J(fPre)}, while held ${J(fHeld)}; clicks by X ${J(preClicks)}, by Y ${J(keyClicks)}; tool after ${toolAfter}; brushTile ${T}; `
    + `tiles 1..5 before ${J(pick(c0))}; tiles 1,2 after the press ${J(pick(c1).slice(0, 2))}`);
  await d.mouse('mouseMoved', aims[2].x, aims[2].y, 'left', 1); await sleep(150);
  await d.mouse('mouseMoved', aims[3].x, aims[3].y, 'left', 1); await sleep(150);
  await d.mouse('mouseReleased', aims[3].x, aims[3].y, 'left', 0); await sleep(400);
  const c2 = await cells();
  const pressFlips = [stamped(true, false), stamped(true, false), stamped(true, false), stamped(true, false)];
  if (premise) {
    check('ABL.a', 'the Y flip toggled MID-DRAG does not change the composer stroke: tiles 3 and 4, stamped AFTER the Y key, carry the flips LATCHED at the press (hf true, vf false) like tiles 1 and 2',
      same(pick(c2).slice(0, 4), pressFlips),
      `tiles 1..4 ${J(pick(c2).slice(0, 4))}; the press-time flips stamp ${J(stamped(true, false))}; the live flips would stamp ${J(stamped(true, true))}`);
    check('ABL.b', 'CONTROL (green with or without the latch): tiles 1 and 2, stamped BEFORE the Y key, carry the press-time flips, and tile 5, never entered, is unchanged',
      same(pick(c2).slice(0, 2), pressFlips.slice(0, 2)) && same(c2[4], c0[4]),
      `tiles 1,2 ${J(pick(c2).slice(0, 2))}; tile 5 ${J(c2[4])}, before ${J(c0[4])}`);
  }
  await d.blur();
  await d.chord('z', CTRL);
  await sleep(300);
  const c3 = await cells();
  if (premise) {
    check('ABL.c', 'CONTROL: the stroke is ONE undo step: one Ctrl+Z puts the five tiles back exactly',
      same(c3, c0), `after one Ctrl+Z ${J(c3)}; before ${J(c0)}`);
  }
  await d.mouse('mouseMoved', aims[4].x, aims[4].y);
  await d.mouse('mousePressed', aims[4].x, aims[4].y, 'left', 1); await sleep(80);
  await d.mouse('mouseReleased', aims[4].x, aims[4].y, 'left', 0); await sleep(400);
  const c4 = await cells();
  if (premise) {
    check('ABL.d', 'CONTROL, and the proof the Y key fired: the NEXT press takes the flips as they stand after the last stroke: a click on tile 5 stamps it hf true, vf true, and tiles 1 to 4 stay as they were',
      same(pick(c4)[4], stamped(true, true)) && same(c4.slice(0, 4), c0.slice(0, 4)),
      `tile 5 ${J(c4[4])}; the toggled flips stamp ${J(stamped(true, true))}; tiles 1..4 ${J(pick(c4).slice(0, 4))}, before ${J(pick(c0).slice(0, 4))}`);
  }
  await d.blur();
  await d.chord('z', CTRL);
  await sleep(300);
  const c5 = await cells();
  note('ABL.cleanup', `after the control's Ctrl+Z the five tiles ${same(c5, c0) ? 'match' : 'DIFFER FROM'} the start; dirty ${(await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty}`);
  // Leave the composer as PART abw leaves it for m6: both flips back off (real
  // X and Y keys) and the Collision paint tool armed (a real click).
  await d.chord('x');
  await d.chord('y');
  await d.realClick('document.querySelector(\'button[aria-label="Collision paint"]\')');
  await sleep(300);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART atl. ART-STROKE-FOLLOWUPS (a), TOOL-LATCH. A tool picked on the rail
// while a composer stroke is held must not change what the rest of the stroke
// does. The rail has no tool keys in the Art facet (ArtToolDock: buttons
// only), and a second pointer press cannot be sent with the button held, so the
// route is the keyboard one PART abw uses for a shape button: real Tabs until
// focus is on the rail's Collision paint button, then a real Space. Expected
// cells come from source: `stampTile` writes `atlasTile: spec.tile` with the
// flips ComposerCanvas holds (both off: a fresh document starts so, and PART abl
// turns both back off), and the collision brush would write
// `collisionPaintWord(word, old)` (the oracle's `paintWord`) on the plane
// `armCollisionBrush({})` reports.
// ═══════════════════════════════════════════════════════════════════════════
async function atlPart(d, O) {
  const { c } = d;
  await neutral(d);
  const already = await c.json('window.__dbg.aeon.artChunkOpen()');
  let facet;
  if (already && already.chunkId !== null) {
    const art = await d.realClick(d.FACET('Art'));
    await sleep(800);
    facet = { hitOk: !!art?.hitOk && (await c.json('window.__dbg.aeon.artChunkOpen()'))?.chunkId === already.chunkId, route: 'Art facet click, document already open', already, art };
  } else {
    facet = { ...(await openArtChunk(d)), route: 'double-click on the Chunks grid' };
  }
  // A collision word to switch TO: the Collision paint tool shows the palette,
  // and a real click on a shape button arms a word (as PART abw does), then a
  // real click arms the Tile stamp the stroke is pressed with.
  const collTool = await d.realClick('document.querySelector(\'button[aria-label="Collision paint"]\')');
  await sleep(400);
  const shape = await d.realClick(SHAPE_N(3), { scroll: true });
  await sleep(200);
  const tool = await d.realClick('document.querySelector(\'button[aria-label="Tile stamp"]\')');
  await sleep(600);
  const doc = await c.json('window.__dbg.aeon.artChunkOpen()');
  const rect = () => c.json(String.raw`(() => { const cv = ${COMPOSER_CANVAS}; if (!cv) return null; const b = cv.getBoundingClientRect();
    const nb = document.querySelector('button[title^="Close this document"]'); let bar = nb; while (bar && bar.parentElement && getComputedStyle(bar).minHeight !== '32px') bar = bar.parentElement;
    const br = bar ? bar.getBoundingClientRect() : null;
    return { x: b.left, y: b.top, w: b.width, h: b.height, cw: cv.width, dpr: window.devicePixelRatio, barH: br ? br.height : null }; })()`);
  let G = await rect();
  const setupOk = !!facet?.hitOk && !!collTool?.hitOk && !!shape?.hitOk && !!tool?.hitOk && !!doc && doc.chunkId !== null && doc.tool === 'tile-stamp' && !!G;
  const zoom = G && doc ? G.cw / (doc.widthTiles * 8) : null;
  const T = doc ? doc.brushTile : null;
  const brush = await brushRead(d);
  const cellsW = doc ? doc.widthTiles >> 1 : 0;
  const stamped = { t: T, hf: false, vf: false };
  const pickOne = (q) => (q ? { t: q.atlasTile, hf: q.hf, vf: q.vf } : null);
  const cellAt = (tx, ty) => c.json(`window.__dbg.aeon.artDocCellAt(${tx}, ${ty})`);
  const collAt = (plane, tx, ty) => c.json(`window.__dbg.aeon.artDocCollisionAt(${J(plane)}, ${(ty >> 1) * cellsW + (tx >> 1)})`);
  const aimTile = async (tx, ty) => {
    const x = Math.round(G.x + (tx * 8 + 4) * zoom); const y = Math.round(G.y + (ty * 8 + 4) * zoom);
    const back = { tx: Math.floor((x - G.x) / zoom / 8), ty: Math.floor((y - G.y) / zoom / 8) };
    const on = await c.evalExpr(`document.elementFromPoint(${x}, ${y}) === ${COMPOSER_CANVAS}`);
    return { x, y, back, on };
  };
  // Five tiles in a row, each aimed back to itself, where the stamp changes
  // tiles 1 to 4 and the collision brush would change the collision cell under
  // tile 3 or 4 (ANTI-VACUOUS both ways: a stamped tile and a collision-painted
  // one are told apart from an untouched one).
  let tiles = null; let aims = null;
  if (setupOk && Number.isInteger(zoom) && zoom >= 1 && doc.widthTiles >= 5 && brush && brush.word !== 0) {
    for (let ty = 0; ty < doc.heightTiles && !tiles; ty++) {
      for (let tx = 0; tx + 5 <= doc.widthTiles && !tiles; tx++) {
        const pre = [];
        for (let k = 0; k < 5; k++) pre.push(pickOne(await cellAt(tx + k, ty)));
        if (pre.slice(0, 4).some((q) => same(q, stamped))) continue;
        const w3 = await collAt(brush.plane, tx + 2, ty); const w4 = await collAt(brush.plane, tx + 3, ty);
        if (O.paintWord(brush.word, w3) === w3 && O.paintWord(brush.word, w4) === w4) continue;
        const a = [];
        for (let k = 0; k < 5; k++) a.push(await aimTile(tx + k, ty));
        if (a.every((p, k) => p.on && p.back.tx === tx + k && p.back.ty === ty)) { tiles = [0, 1, 2, 3, 4].map((k) => ({ tx: tx + k, ty })); aims = a; }
      }
    }
  }
  if (!tiles) {
    check('ATL.0', 'PREMISE: the Art facet and the Tile stamp armed by real clicks on a chunk document, and five tiles in a row on the composer canvas, each aimed at an integer client pixel on that tile, where the stamp and the collision brush would each paint differently', 'UNMEASURABLE',
      `facet ${J(facet)}; collision tool ${J(collTool)}; shape ${J(shape)}; tool ${J(tool)}; doc ${J(doc)}; canvas ${J(G)} zoom ${zoom}; brush ${J(brush)}`);
    return;
  }
  const state = () => c.json(String.raw`(() => { const a = window.__dbg.aeon; const ts = ${J(tiles)}; const W = ${cellsW};
    const ix = ts.map((t) => (t.ty >> 1) * W + (t.tx >> 1));
    return { cells: ts.map((t) => a.artDocCellAt(t.tx, t.ty)), a: ix.map((i) => a.artDocCollisionAt('a', i)), b: ix.map((i) => a.artDocCollisionAt('b', i)) }; })()`);
  const s0 = await state();
  const railFocus = () => c.json(String.raw`(() => { const a = document.activeElement; const t = document.querySelector('button[aria-label="Collision paint"]');
    return { body: a === document.body, onRail: !!t && a === t, tag: a && a.tagName, label: a && a.getAttribute ? a.getAttribute('aria-label') : null }; })()`);
  await d.blur();
  await d.clicksDrain();
  // The stroke: pressed on tile 1 with the Tile stamp, held across tile 2.
  await d.mouse('mouseMoved', aims[0].x, aims[0].y);
  await d.mouse('mousePressed', aims[0].x, aims[0].y, 'left', 1); await sleep(80);
  await d.mouse('mouseMoved', aims[1].x, aims[1].y, 'left', 1); await sleep(150);
  const s1 = await state();
  const fHeld = await railFocus();
  await d.clicksDrain();
  const hops = [];
  let f = fHeld;
  // Bounded; every hop is recorded (summarised: the count, and the last ten).
  // The Space is sent only once focus is on the rail's Collision paint button,
  // so a route that never got there presses nothing.
  for (let n = 0; n < 400 && !f.onRail; n++) {
    await d.tab();
    f = await railFocus();
    hops.push(f.body ? 'BODY' : `${f.tag}:${f.label ?? ''}`);
  }
  const tabClicks = await d.clicksDrain();
  if (f.onRail) await d.space();
  const spaceClicks = await d.clicksDrain();
  const toolMid = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.tool;
  // The options bar is tool-dependent, so arming another tool can move the
  // canvas (dev run 4: y 186 to 135, booked in the packet). The rest of the
  // stroke is aimed from the rect measured NOW, each aim derived back to its
  // tile, so tiles 3 to 5 are the tiles the part names whatever the layout did.
  const G0 = G;
  const G1 = await rect();
  G = G1;
  const reaim = [];
  if (G1) for (let k = 2; k < 5; k++) reaim.push(await aimTile(tiles[k].tx, tiles[k].ty));
  const reaimOk = reaim.length === 3 && reaim.every((p, k) => p.on && p.back.tx === tiles[k + 2].tx && p.back.ty === tiles[k + 2].ty);
  if (reaimOk) for (let k = 2; k < 5; k++) aims[k] = reaim[k - 2];
  const premise = reaimOk && f.onRail && tabClicks.length === 0 && spaceClicks.length > 0
    && toolMid === 'collision' && same(s1.cells.slice(0, 2).map(pickOne), [stamped, stamped]);
  check('ATL.0', 'PREMISE: on the composer\'s chunk document, a Tile stamp stroke is HELD (tiles 1 and 2 stamped); real Tabs moved focus to the rail\'s Collision paint button (no Tab clicked anything) and a real Space pressed it (a click reached the page), so the store\'s tool is now collision; tiles 3 to 5 re-aimed on the canvas as it stands after the switch',
    premise, `dpr ${G.dpr}; document reached by ${facet.route}; canvas ${J(G)} zoom ${zoom}; doc ${J(doc)}; brush ${J(brush)}; tiles ${J(tiles)}; aims ${J(aims)}; `
    + `focus while held ${J(fHeld)}; Tab hops ${hops.length}, the last ten ${J(hops.slice(-10))}; final ${J(f)}; clicks during Tabs ${J(tabClicks)}; clicks the Space produced ${J(spaceClicks)}; tool after ${toolMid}; `
    + `tiles 1,2 after the press ${J(s1.cells.slice(0, 2).map(pickOne))}; canvas before the switch ${J(G0)}, after ${J(G1)}; tiles 3..5 re-aimed ${J(reaim)}`);
  await d.mouse('mouseMoved', aims[2].x, aims[2].y, 'left', 1); await sleep(150);
  await d.mouse('mouseMoved', aims[3].x, aims[3].y, 'left', 1); await sleep(150);
  await d.mouse('mouseReleased', aims[3].x, aims[3].y, 'left', 0); await sleep(400);
  const s2 = await state();
  if (premise) {
    check('ATL.a', 'the tool picked MID-DRAG does not change the composer stroke: tiles 3 and 4, entered AFTER the Space, are STAMPED like tiles 1 and 2, and no collision cell under the five tiles changed on either plane',
      same(s2.cells.slice(0, 4).map(pickOne), [stamped, stamped, stamped, stamped]) && same(s2.a, s0.a) && same(s2.b, s0.b),
      `tiles 1..4 ${J(s2.cells.slice(0, 4).map(pickOne))}, the stamp writes ${J(stamped)}; collision A ${J(s2.a)} (before ${J(s0.a)}), B ${J(s2.b)} (before ${J(s0.b)}); the collision brush is ${J(brush)}`);
    check('ATL.b', 'CONTROL (green with or without the latch): tiles 1 and 2, stamped BEFORE the Space, carry the stamp, and tile 5, never entered, is unchanged',
      same(s2.cells.slice(0, 2).map(pickOne), [stamped, stamped]) && same(s2.cells[4], s0.cells[4]),
      `tiles 1,2 ${J(s2.cells.slice(0, 2).map(pickOne))}; tile 5 ${J(s2.cells[4])}, before ${J(s0.cells[4])}`);
  }
  await d.blur();
  await d.chord('z', CTRL);
  await sleep(300);
  const s3 = await state();
  if (premise) {
    check('ATL.c', 'CONTROL: the stroke is ONE undo step: one Ctrl+Z puts the five tiles and their collision cells back exactly',
      same(s3, s0), `after one Ctrl+Z ${J(s3)}; before ${J(s0)}`);
  }
  // The NEXT press takes the tool picked during the last stroke: a click on
  // tile 5 paints collision there and stamps nothing.
  await d.mouse('mouseMoved', aims[4].x, aims[4].y);
  await d.mouse('mousePressed', aims[4].x, aims[4].y, 'left', 1); await sleep(80);
  await d.mouse('mouseReleased', aims[4].x, aims[4].y, 'left', 0); await sleep(400);
  const s4 = await state();
  const w5 = s0[brush.plane][4];
  if (premise) {
    check('ATL.d', 'CONTROL: the NEXT press takes the tool picked during the last stroke: a click on tile 5 leaves the five nametable cells alone, and writes the brush word into the collision cell under tile 5',
      same(s4.cells, s0.cells) && s4[brush.plane][4] === O.paintWord(brush.word, w5),
      `tile 5 ${J(s4.cells[4])} (before ${J(s0.cells[4])}); collision under tile 5 on plane ${brush.plane}: ${s4[brush.plane][4]}, before ${w5}, the brush writes ${O.paintWord(brush.word, w5)}`);
  }
  if (!same(s4, s0)) { await d.blur(); await d.chord('z', CTRL); await sleep(300); }
  const s5 = await state();
  note('ATL.cleanup', `the five tiles and their collision cells ${same(s5, s0) ? 'match' : 'DIFFER FROM'} the start; dirty ${(await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty}; the Collision paint tool is left armed (as PART abl leaves it)`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART acj. ART-STROKE-FOLLOWUPS (b), CANVAS-JUMP. The first write to a clean
// chunk document must not move the composer canvas. Row 207's dev runs 1 to 3
// measured the canvas 42px lower after the first stamp: the tool-options bar's
// doc header gains an "unsaved" badge (workspace/facets/art-facet.tsx), the
// header's long shared-tile warning wraps, and OptionBar (ui/primitives.tsx)
// grows to fit it by design, pushing the canvas's scroller down. The rect is
// read with getBoundingClientRect before the press and after the release; the
// bar's rect is printed beside it so a red names its cause.
// ═══════════════════════════════════════════════════════════════════════════
async function acjPart(d) {
  const { c } = d;
  await neutral(d);
  const already = await c.json('window.__dbg.aeon.artChunkOpen()');
  let facet;
  if (already && already.chunkId !== null) {
    const art = await d.realClick(d.FACET('Art'));
    await sleep(800);
    facet = { hitOk: !!art?.hitOk && (await c.json('window.__dbg.aeon.artChunkOpen()'))?.chunkId === already.chunkId, route: 'Art facet click, document already open', already, art };
  } else {
    facet = { ...(await openArtChunk(d)), route: 'double-click on the Chunks grid' };
  }
  const tool = await d.realClick('document.querySelector(\'button[aria-label="Tile stamp"]\')');
  await sleep(600);
  const doc = await c.json('window.__dbg.aeon.artChunkOpen()');
  const rect = () => c.json(String.raw`(() => { const cv = ${COMPOSER_CANVAS}; if (!cv) return null; const b = cv.getBoundingClientRect();
    const nb = document.querySelector('button[title^="Close this document"]'); let bar = nb; while (bar && bar.parentElement && getComputedStyle(bar).minHeight !== '32px') bar = bar.parentElement;
    const br = bar ? bar.getBoundingClientRect() : null;
    return { x: b.left, y: b.top, w: b.width, h: b.height, cw: cv.width, dpr: window.devicePixelRatio,
      bar: br ? { y: br.top, h: br.height, text: (bar.innerText || '').replace(/\s+/g, ' ').slice(0, 120) } : null }; })()`);
  const G = await rect();
  const zoom = G && doc ? G.cw / (doc.widthTiles * 8) : null;
  const T = doc ? doc.brushTile : null;
  const pickOne = (q) => (q ? { t: q.atlasTile, hf: q.hf, vf: q.vf } : null);
  const cellAt = (tx, ty) => c.json(`window.__dbg.aeon.artDocCellAt(${tx}, ${ty})`);
  const setupOk = !!facet?.hitOk && !!tool?.hitOk && !!doc && doc.chunkId !== null && doc.tool === 'tile-stamp' && !!G && Number.isInteger(zoom) && zoom >= 1;
  if (setupOk && doc.dirty) {
    check('ACJ.0', 'PREMISE: the composer\'s chunk document is CLEAN, so the next write is its first', 'UNMEASURABLE',
      `the document is already dirty (an earlier part's edits were not undone back to clean): ${J(doc)}; reached by ${facet.route}`);
    return;
  }
  // The first tile on screen, row by row, that the stamp changes (the armed
  // tile with no flips, as ComposerCanvas starts a document) and whose integer
  // aim derives back to itself.
  let hit = null;
  if (setupOk) {
    for (let ty = 0; ty < doc.heightTiles && !hit; ty++) for (let tx = 0; tx < doc.widthTiles && !hit; tx++) {
      const before = pickOne(await cellAt(tx, ty));
      if (same(before, { t: T, hf: false, vf: false })) continue;
      const x = Math.round(G.x + (tx * 8 + 4) * zoom); const y = Math.round(G.y + (ty * 8 + 4) * zoom);
      const back = { tx: Math.floor((x - G.x) / zoom / 8), ty: Math.floor((y - G.y) / zoom / 8) };
      if (back.tx !== tx || back.ty !== ty) continue;
      if (!(await c.evalExpr(`document.elementFromPoint(${x}, ${y}) === ${COMPOSER_CANVAS}`))) continue;
      hit = { tx, ty, x, y, before };
    }
  }
  if (!hit) {
    check('ACJ.0', 'PREMISE: a clean chunk document, the Tile stamp armed by real clicks, and a tile on screen the stamp changes, aimed at an integer client pixel on that tile', 'UNMEASURABLE',
      `facet ${J(facet)}; tool ${J(tool)}; doc ${J(doc)}; canvas ${J(G)} zoom ${zoom}`);
    return;
  }
  await d.clickAt(hit);   // the FIRST write: one real click
  await sleep(300);
  const G1 = await rect();
  const after = pickOne(await cellAt(hit.tx, hit.ty));
  const dirty1 = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty;
  const premise = dirty1 === true && same(after, { t: T, hf: false, vf: false }) && !same(after, hit.before);
  check('ACJ.0', 'PREMISE: on the composer\'s CLEAN chunk document with the Tile stamp armed, one real click stamped a tile it changes, and the document is now dirty (this was its first write)',
    premise, `dpr ${G.dpr}; document reached by ${facet.route}; doc ${J(doc)}; zoom ${zoom}; tile ${J({ tx: hit.tx, ty: hit.ty })} aim (${hit.x},${hit.y}) before ${J(hit.before)} after ${J(after)}; dirty after ${dirty1}`);
  if (premise) {
    const moved = !(Math.abs(G1.x - G.x) < 0.01 && Math.abs(G1.y - G.y) < 0.01 && Math.abs(G1.w - G.w) < 0.01 && Math.abs(G1.h - G.h) < 0.01);
    check('ACJ.a', 'the first write to a clean chunk document does not move the composer canvas: its rect is the same before the press and after the release',
      !moved, `canvas before ${J({ x: G.x, y: G.y, w: G.w, h: G.h })} after ${J({ x: G1.x, y: G1.y, w: G1.w, h: G1.h })} (dy ${G1 ? (G1.y - G.y).toFixed(2) : '?'}); options bar before ${J(G.bar)} after ${J(G1?.bar)}`);
  }
  const badge = () => c.json(String.raw`(() => { const nb = document.querySelector('button[title^="Close this document"]'); if (!nb) return null;
    const b = [...nb.parentElement.querySelectorAll('span')].find((x) => x.textContent.trim() === 'unsaved'); if (!b) return { present: false, visible: false };
    const r = b.getBoundingClientRect(); return { present: true, visible: getComputedStyle(b).visibility === 'visible' && r.width > 0 }; })()`);
  const badge1 = await badge();
  await d.blur();
  await d.chord('z', CTRL);
  await sleep(300);
  const back = pickOne(await cellAt(hit.tx, hit.ty));
  const dirty2 = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty;
  const badge2 = await badge();
  if (premise) {
    check('ACJ.c', 'UNDO-DIRTY: one real Ctrl+Z takes the first write back (the tile matches its start) and the document reads CLEAN again: the store\'s flag is false and the "unsaved" badge, visible after the write, is not visible',
      same(back, hit.before) && dirty2 === false && !!badge1?.visible && !badge2?.visible,
      `tile after Ctrl+Z ${J(back)}, start ${J(hit.before)}; dirty after the write ${dirty1}, after Ctrl+Z ${dirty2}; badge after the write ${J(badge1)}, after Ctrl+Z ${J(badge2)}`);
  } else {
    note('ACJ.cleanup', `after one Ctrl+Z the tile ${same(back, hit.before) ? 'matches' : 'DIFFERS FROM'} its start; dirty ${dirty2}`);
  }
  // Leave the composer as PART abl leaves it for m6: the Collision paint tool armed.
  await d.realClick('document.querySelector(\'button[aria-label="Collision paint"]\')');
  await sleep(300);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART aob. ART-OPTIONS-BAR-HEIGHT (ROADMAP row 210; the aurora overseer's look
// ruling, 2026-09-25): the Art facet's tool-options bar is ONE row at a FIXED
// height that depends on neither the tool, the dirty state nor the shared-tile
// warning, so the composer canvas below it never moves. Row 209's packet
// measured it 88px under the Tile stamp and 37px under Collision paint at
// 1400x872 (its O1), and read that the warning can appear on a first write (O3).
//
// The rail's tools and their labels come from HEAD's ArtToolDock.tsx (its
// TOOLS table, every row matched); each is armed by a REAL click on its rail
// button and the store's tool is read back, so a census that switched nothing
// cannot pass (AOB.0). The warning's full sentence comes from HEAD's
// components/art/SharedTileWarning.tsx. The narrower width is a real window resize through
// Browser.setWindowBounds when the target allows it (the fallback, printed, is
// Emulation.setDeviceMetricsOverride), undone before the part ends.
// ═══════════════════════════════════════════════════════════════════════════
const AOB_RAIL = (() => {
  const src = SRC_HEAD('src/renderer/shell/ArtToolDock.tsx');
  const body = /const TOOLS[^=]*= \[([\s\S]*?)\n\];/.exec(src);
  if (!body) throw new Error('ORACLE: no TOOLS table in HEAD:src/renderer/shell/ArtToolDock.tsx');
  const rows = [...body[1].matchAll(/\['([a-z-]+)', '([^']+)', Icons\.\w+\]/g)].map((m) => ({ id: m[1], label: m[2] }));
  const lines = body[1].split('\n').filter((l) => l.trim().startsWith('['));
  if (rows.length < 2 || rows.length !== lines.length) throw new Error(`ORACLE: the TOOLS table has ${lines.length} rows, ${rows.length} parsed`);
  return rows;
})();
const AOB_WARNING = fromHead('src/renderer/components/art/SharedTileWarning.tsx',
  /export const SHARED_TILE_WARNING = "([^"]+)";/, 'the shared-tile warning sentence')[1];
/** The bar, found as PARTs atl and acj find it: up from the doc header's New…
 *  button to the OptionBar (its 32px floor). Everything a row needs about it. */
const AOB_READ = String.raw`(() => { const cv = ${COMPOSER_CANVAS}; const nb = document.querySelector('button[title^="Close this document"]');
  let bar = nb; while (bar && bar.parentElement && getComputedStyle(bar).minHeight !== '32px') bar = bar.parentElement;
  const b = cv ? cv.getBoundingClientRect() : null; const br = bar ? bar.getBoundingClientRect() : null;
  const warn = bar ? [...bar.querySelectorAll('span')].find((s) => s.children.length === 0 && s.textContent.includes('⚠')) || null : null;
  const cs = bar ? getComputedStyle(bar) : null;
  const kids = bar ? [...bar.children].map((k) => ({ h: k.getBoundingClientRect().height, t: (k.getAttribute('aria-label') || k.textContent || k.tagName).trim().slice(0, 24) })) : [];
  const tall = kids.reduce((m, k) => (m && m.h >= k.h ? m : k), null);
  return { tallest: tall, canvas: b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null, dpr: window.devicePixelRatio, iw: innerWidth, ih: innerHeight,
    bar: br ? { y: br.top, h: br.height, sb: bar.offsetHeight - bar.clientHeight, sw: bar.scrollWidth, cw: bar.clientWidth, sh: bar.scrollHeight, ch: bar.clientHeight, ox: cs.overflowX } : null,
    warn: warn ? { text: warn.textContent.trim(), title: warn.getAttribute('title'), aria: warn.getAttribute('aria-label'), h: warn.getBoundingClientRect().height } : null }; })()`;
const sameRect = (p, q) => !!p && !!q && ['x', 'y', 'w', 'h'].every((k) => Math.abs(p[k] - q[k]) < 0.01);

async function aobCensus(d, label) {
  const { c } = d;
  const rows = [];
  for (const t of AOB_RAIL) {
    const hit = await d.realClick(`document.querySelector(${J(`button[aria-label="${t.label}"]`)})`);
    await sleep(350);
    const tool = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.tool ?? null;
    const r = await c.json(AOB_READ);
    rows.push({ id: t.id, hit: !!hit?.hitOk, tool, barH: r.bar?.h ?? null, sb: r.bar?.sb, tallest: r.tallest, canvas: r.canvas, sw: r.bar?.sw, cw: r.bar?.cw, ox: r.bar?.ox, dpr: r.dpr, iw: r.iw, ih: r.ih });
  }
  console.log(`   CENSUS [${label}] window ${rows[0]?.iw}x${rows[0]?.ih} dpr ${rows[0]?.dpr}`);
  for (const r of rows) console.log(`     ${r.id.padEnd(14)} store tool ${String(r.tool).padEnd(14)} bar h ${r.barH}  canvas ${J(r.canvas)}  bar scroll/client w ${r.sw}/${r.cw} overflow-x ${r.ox} (scrollbar+border ${r.sb})  tallest item ${J(r.tallest)}`);
  return rows;
}
function aobCensusRows(id, label, rows) {
  const armed = rows.every((r) => r.hit && r.tool === r.id) && new Set(rows.map((r) => r.tool)).size === AOB_RAIL.length;
  check(`${id}.0`, `PREMISE (${label}): every one of the ${AOB_RAIL.length} rail tools (HEAD's ArtToolDock TOOLS table) was armed by a real click on its rail button, and the store's tool read back after each click is that tool: the census really switched tools`,
    armed, J(rows.map((r) => `${r.id}${r.hit ? '' : ' (MISS)'} -> ${r.tool}`)));
  if (!armed) return;
  const h0 = rows[0].barH; const g0 = rows[0].canvas;
  check(`${id}.a`, `(${label}) the options bar's height and the composer canvas rect are the SAME under every rail tool`,
    rows.every((r) => r.barH !== null && Math.abs(r.barH - h0) < 0.01 && sameRect(r.canvas, g0)),
    `bar heights ${J(Object.fromEntries(rows.map((r) => [r.id, r.barH])))}; canvas y ${J(Object.fromEntries(rows.map((r) => [r.id, r.canvas?.y])))}`);
  const clipped = rows.filter((r) => r.sw > r.cw && !['auto', 'scroll'].includes(r.ox));
  const scrolls = rows.filter((r) => r.sw > r.cw).map((r) => `${r.id} ${r.sw}/${r.cw}`);
  check(`${id}.b`, `CONTROL (${label}): nothing is silently cut: under every tool the bar's content either fits its width or the bar scrolls it (overflow-x auto or scroll)`,
    clipped.length === 0, `tools whose content is wider than the bar: ${scrolls.length ? scrolls.join(', ') : 'none'}; of those without a scrolling bar: ${J(clipped.map((r) => `${r.id} ${r.ox}`))}`);
}

async function aobPart(d) {
  const { c } = d;
  await neutral(d);
  const already = await c.json('window.__dbg.aeon.artChunkOpen()');
  let facet;
  if (already && already.chunkId !== null) {
    const art = await d.realClick(d.FACET('Art'));
    await sleep(800);
    facet = { hitOk: !!art?.hitOk && (await c.json('window.__dbg.aeon.artChunkOpen()'))?.chunkId === already.chunkId, route: 'Art facet click, document already open', already, art };
  } else {
    facet = { ...(await openArtChunk(d)), route: 'double-click on the Chunks grid' };
  }
  const doc0 = await c.json('window.__dbg.aeon.artChunkOpen()');
  console.log(`   rail from HEAD: ${J(AOB_RAIL.map((t) => t.id))}; warning from HEAD: ${J(AOB_WARNING)}; document reached by ${facet.route}: ${J(doc0)}`);
  if (!facet.hitOk || !doc0 || doc0.chunkId === null) {
    check('AOB.0', 'PREMISE: a chunk document open in the Art facet', 'UNMEASURABLE', J({ facet, doc0 }));
    return;
  }

  // 1. The census at the window as it stands (1400x872).
  const wide = await aobCensus(d, 'full window');
  aobCensusRows('AOB', 'full window', wide);

  // 2. The full sentence of the shared-tile warning stays reachable.
  const r0 = await c.json(AOB_READ);
  if (!r0.warn) {
    check('AOB.t', 'the shared-tile warning is on screen (this chunk has atlas tiles), so its full text can be asked for', 'UNMEASURABLE', J(r0));
  } else {
    check('AOB.t', 'the shared-tile warning\'s FULL sentence (HEAD\'s SharedTileWarning.tsx) is reachable on hover (title) and by assistive tech (aria-label), whatever the bar shows',
      r0.warn.title === AOB_WARNING && r0.warn.aria === AOB_WARNING, `warning ${J(r0.warn)}; the sentence ${J(AOB_WARNING)}`);
  }

  // 3. The first write on a CLEAN chunk document (PART acj's case, with the
  //    bar's height asked for too).
  const stamp = await d.realClick(`document.querySelector(${J('button[aria-label="Tile stamp"]')})`);
  await sleep(500);
  const doc = await c.json('window.__dbg.aeon.artChunkOpen()');
  const W0 = await c.json(AOB_READ);
  const cv = await c.json(`(() => { const k = ${COMPOSER_CANVAS}; return k ? k.width : null; })()`);
  const zoom = doc && cv ? cv / (doc.widthTiles * 8) : null;
  const pickOne = (q) => (q ? { t: q.atlasTile, hf: q.hf, vf: q.vf } : null);
  const cellAt = (tx, ty) => c.json(`window.__dbg.aeon.artDocCellAt(${tx}, ${ty})`);
  /** The first tile on screen the stamp changes, aimed at an integer client
   *  pixel that derives back to it and lands on the composer canvas. */
  const findTarget = async (G, dd) => {
    for (let ty = 0; ty < dd.heightTiles; ty++) for (let tx = 0; tx < dd.widthTiles; tx++) {
      const before = pickOne(await cellAt(tx, ty));
      if (same(before, { t: dd.brushTile, hf: false, vf: false })) continue;
      const x = Math.round(G.x + (tx * 8 + 4) * zoom); const y = Math.round(G.y + (ty * 8 + 4) * zoom);
      if (Math.floor((x - G.x) / zoom / 8) !== tx || Math.floor((y - G.y) / zoom / 8) !== ty) continue;
      if (!(await c.evalExpr(`document.elementFromPoint(${x}, ${y}) === ${COMPOSER_CANVAS}`))) continue;
      return { tx, ty, x, y, before };
    }
    return null;
  };
  const setupW = !!stamp?.hitOk && !!doc && doc.tool === 'tile-stamp' && !!W0.canvas && Number.isInteger(zoom) && zoom >= 1;
  if (setupW && doc.dirty) {
    check('AOB.w', 'PREMISE: the chunk document is CLEAN, so the next write is its first', 'UNMEASURABLE', J(doc));
  } else {
    const hit = setupW ? await findTarget(W0.canvas, doc) : null;
    if (!hit) {
      check('AOB.w', 'PREMISE: the Tile stamp armed by a real click and a tile on screen it changes', 'UNMEASURABLE', J({ stamp, doc, W0, zoom }));
    } else {
      await d.clickAt(hit);
      await sleep(300);
      const W1 = await c.json(AOB_READ);
      const after = pickOne(await cellAt(hit.tx, hit.ty));
      const dirty1 = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty;
      const wrote = dirty1 === true && !same(after, hit.before);
      check('AOB.w', 'the FIRST write to a clean chunk document (one real Tile stamp click that changed a tile and dirtied the document) moves neither the options bar\'s height nor the composer canvas',
        wrote && sameRect(W1.canvas, W0.canvas) && Math.abs(W1.bar.h - W0.bar.h) < 0.01,
        `dpr ${W0.dpr}; tile ${J({ tx: hit.tx, ty: hit.ty })} aim (${hit.x},${hit.y}) ${J(hit.before)} -> ${J(after)}; dirty ${dirty1}; bar h ${W0.bar.h} -> ${W1.bar.h}; canvas ${J(W0.canvas)} -> ${J(W1.canvas)}`);
      await d.blur();
      await d.chord('z', CTRL);
      await sleep(300);
      note('AOB.w.cleanup', `after one Ctrl+Z the tile ${same(pickOne(await cellAt(hit.tx, hit.ty)), hit.before) ? 'matches' : 'DIFFERS FROM'} its start; dirty ${(await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty}`);
    }
  }

  // 4. The census again at a narrower window.
  const want = { w: 1100, h: r0.ih };
  let how = null; let undo = null;
  try {
    const { windowId, bounds } = await c.send('Browser.getWindowForTarget');
    const dw = bounds.width - r0.iw;
    await c.send('Browser.setWindowBounds', { windowId, bounds: { width: want.w + dw } });
    await sleep(900);
    how = `Browser.setWindowBounds (outer ${bounds.width}x${bounds.height} -> width ${want.w + dw})`;
    undo = async () => { await c.send('Browser.setWindowBounds', { windowId, bounds: { width: bounds.width, height: bounds.height } }); };
  } catch (e) {
    await c.send('Emulation.setDeviceMetricsOverride', { width: want.w, height: want.h, deviceScaleFactor: 0, mobile: false });
    await sleep(900);
    how = `Emulation.setDeviceMetricsOverride (Browser.setWindowBounds refused: ${e.message})`;
    undo = async () => { await c.send('Emulation.clearDeviceMetricsOverride'); };
  }
  const nowW = await c.evalExpr('innerWidth');
  console.log(`   narrow window by ${how}: innerWidth ${nowW}`);
  if (Math.abs(nowW - want.w) > 2) {
    check('AOB.N.0', `PREMISE: the window is ${want.w}px wide`, 'UNMEASURABLE', `innerWidth ${nowW} by ${how}`);
  } else {
    const narrow = await aobCensus(d, `${nowW} wide`);
    aobCensusRows('AOB.N', `${nowW} wide`, narrow);
  }
  await undo();
  await sleep(900);
  const back = await c.json(AOB_READ);
  note('AOB.restore', `window back to ${back.iw}x${back.ih} (was ${r0.iw}x${r0.ih})`);

  // 5. O3: the warning appearing on a first write, and going on the undo. A
  //    library chunk whose nametable is all zero words opens with no atlas cell,
  //    so no warning; one stamp gives it one.
  const blank = await c.json(String.raw`(() => { const a = window.__dbg.aeon; for (const id of a.chunkIds()) { const i = a.chunkInfo(id);
    if (i && i.nonzeroTiles === 0 && i.widthTiles >= 2) return { id, ...i }; } return null; })()`);
  if (!blank) {
    // NOT a row, and said so: in a project with no all-zero library chunk the
    // warning cannot appear on a first write (every other chunk opens with an
    // atlas cell, so it is already on screen), and the part does not plant one.
    const n = await c.evalExpr('window.__dbg.aeon.chunkIds().length');
    note('AOB.s', `NOT DRIVEN: none of this project's ${n} library chunks has an all-zero nametable, so the shared-tile warning cannot APPEAR on a first write here (O3 is NOT MEASURED by this run, neither green nor red)`);
  } else {
    await neutral(d);
    await d.chord('k');
    const thumb = `([...document.querySelectorAll('button')].find((b) => (b.title || '').startsWith(${J(`${blank.name}: blank`)}) && b.querySelector(':scope > canvas')) || null)`;
    const p = await d.aim(thumb, true);
    if (p && p.hitOk) {
      SENT.add(`${p.x},${p.y}`);
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none', buttons: 0 });
      for (const n of [1, 2]) {
        await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: n });
        await sleep(30);
        await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: n });
        await sleep(60);
      }
      await sleep(1200);
    }
    const st2 = await d.realClick(`document.querySelector(${J('button[aria-label="Tile stamp"]')})`);
    await sleep(500);
    const bdoc = await c.json('window.__dbg.aeon.artChunkOpen()');
    const S0 = await c.json(AOB_READ);
    const opened = !!p?.hitOk && !!st2?.hitOk && !!bdoc && bdoc.chunkId === blank.id && !bdoc.dirty && bdoc.tool === 'tile-stamp' && !S0.warn;
    const hit = opened ? await findTarget(S0.canvas, bdoc) : null;
    if (!hit) {
      check('AOB.s', 'PREMISE: the all-zero chunk opened by a real double-click on its thumbnail, clean, Tile stamp armed, NO warning on screen, and a tile the stamp changes', 'UNMEASURABLE',
        J({ blank, thumb: p, stamp: st2, bdoc, warn: S0.warn, zoom }));
    } else {
      await d.clickAt(hit);
      await sleep(300);
      const S1 = await c.json(AOB_READ);
      await d.blur();
      await d.chord('z', CTRL);
      await sleep(300);
      const S2 = await c.json(AOB_READ);
      const dirty2 = (await c.json('window.__dbg.aeon.artChunkOpen()'))?.dirty;
      const toggled = !S0.warn && !!S1.warn && !S2.warn;
      check('AOB.s.0', 'PREMISE (O3): the shared-tile warning was absent on the clean all-zero chunk, APPEARED on the first stamp and went again on one real Ctrl+Z',
        toggled, `dpr ${S0.dpr}; chunk ${J(blank)}; tile ${J({ tx: hit.tx, ty: hit.ty })} aim (${hit.x},${hit.y}); warning ${J(S0.warn)} -> ${J(S1.warn)} -> ${J(S2.warn)}; dirty after Ctrl+Z ${dirty2}`);
      if (toggled) {
        check('AOB.s', 'the shared-tile warning appearing (first write) and disappearing (undo) moves neither the options bar\'s height nor the composer canvas',
          sameRect(S1.canvas, S0.canvas) && sameRect(S2.canvas, S0.canvas) && Math.abs(S1.bar.h - S0.bar.h) < 0.01 && Math.abs(S2.bar.h - S0.bar.h) < 0.01,
          `bar h ${S0.bar.h} -> ${S1.bar.h} -> ${S2.bar.h}; canvas ${J(S0.canvas)} -> ${J(S1.canvas)} -> ${J(S2.canvas)}`);
      }
    }
  }
  // Leave the composer as PART acj leaves it for m6: the Collision paint tool armed.
  await d.realClick('document.querySelector(\'button[aria-label="Collision paint"]\')');
  await sleep(300);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART m6. A stamp press refreshes the chunk-link hover.
// ═══════════════════════════════════════════════════════════════════════════
async function m6Part(d, O) {
  const { c } = d;
  await neutral(d);
  await d.setView(0, 0, 1);
  const G = await d.geometry('m6');
  await d.chord('k');
  const tool = (await d.st()).tool;
  const CELLS = String.raw`[...document.querySelectorAll('button')].filter((b) => b.title && !/^tile /i.test(b.title) && !/blank/i.test(b.title)
    && b.querySelector(':scope > canvas') && b.getBoundingClientRect().width > 0)`;
  const nCells = await c.evalExpr(`${CELLS}.length`);
  let X = null;
  for (let n = 0; n < Math.min(nCells, 40) && !X; n++) {
    const p = await d.realClick(`(${CELLS}[${n}] || null)`, { scroll: true });
    const id = await c.json('window.__dbg.aeon.selectedChunk()');
    const info = id ? await c.json(`window.__dbg.aeon.chunkInfo(${J(id)})`) : null;
    if (p && p.hitOk && info && info.nonzeroTiles > 0) X = { id, info, aim: p };
  }
  if (!(tool === 'stamp-chunk' && X)) {
    check('M6.0', 'PREMISE: the stamp tool armed and a chunk with art picked by a real click', 'UNMEASURABLE', `tool ${tool}; grid cells ${nCells}; X ${J(X)}`);
    return;
  }
  const wT = X.info.widthTiles; const hT = X.info.heightTiles;
  const maxCol = Math.floor((G.V.x + G.R.w / G.V.zoom) / 8) - 2; const maxRow = Math.floor((G.V.y + G.R.h / G.V.zoom) / 8) - 6;
  const spot = await c.json(String.raw`(() => { const a = window.__dbg.aeon;
    for (let br = ${hT}; br + ${hT} <= ${maxRow}; br += ${hT}) for (let bc = ${wT}; bc + ${wT} <= ${maxCol}; bc += ${wT}) {
      let linked = 0; for (let r = 0; r < ${hT}; r++) for (let q = 0; q < ${wT}; q++) if (a.chunkLinkAt(0, bc + q, br + r)) linked++;
      if (!linked) return { bc, br }; }
    return null; })()`);
  if (!spot) {
    check('M6.0', 'PREMISE: an unlinked chunk-aligned spot on screen', 'UNMEASURABLE', `chunk ${wT}x${hT}; bounds ${maxCol}x${maxRow}`);
    return;
  }
  const tile = { col: spot.bc + (wT >> 1), row: spot.br + (hT >> 1) };
  const p = d.aimWorld(G, tile.col * 8 + 4, tile.row * 8 + 4);
  const back = d.worldAt(G, p.x, p.y);
  const tileBack = { col: Math.floor(back.x / 8), row: Math.floor(back.y / 8) };
  const pOnMap = await d.onMap(p);
  const readout = () => c.json(String.raw`(() => { const el = document.querySelector('[data-testid="chunk-link-hover"]'); if (!el) return null;
    const b = el.getBoundingClientRect(); return { text: (el.textContent || '').trim(), w: b.width, h: b.height }; })()`);
  await d.hoverTo(p);
  const lh0 = await c.json('window.__dbg.aeon.linkHover()');
  const link0 = await c.json(`window.__dbg.aeon.chunkLinkAt(0, ${tileBack.col}, ${tileBack.row})`);
  const ro0 = await readout();
  const premise = same(tileBack, tile) && pOnMap && lh0 === null && link0 === null && !!ro0 && ro0.text === O.noLink;
  check('M6.0', 'PREMISE: the stamp tool armed and chunk X (with art) picked by a real click; the pointer rests, by real moves, on an UNLINKED tile of section 0: the link hover is null and the readout says the no-link text',
    premise, `dpr ${G.R.dpr}; rect ${J(G.R)}; view ${J(G.V)}; X ${J({ id: X.id, info: X.info })}; spot ${J(spot)}; aim ${J(p)} -> tile ${J(tileBack)} (want ${J(tile)}), on map ${pOnMap}; hover ${J(lh0)}; link ${J(link0)}; readout ${J(ro0)}`);
  if (!premise) return;
  const p0 = await c.json('window.__dbg.aeon.chunkPlacements(0)');
  await d.rawDrain();
  // The press and the release ONLY, at the point the pointer already rests on.
  await d.mouse('mousePressed', p.x, p.y, 'left', 1); await sleep(40);
  await d.mouse('mouseReleased', p.x, p.y, 'left', 0); await sleep(600);
  const raw = await d.rawDrain();
  const p1 = await c.json('window.__dbg.aeon.chunkPlacements(0)');
  const added = p1.filter((q) => !p0.some((o) => o.id === q.id));
  const lh1 = await c.json('window.__dbg.aeon.linkHover()');
  const link1 = await c.json(`window.__dbg.aeon.chunkLinkAt(0, ${tileBack.col}, ${tileBack.row})`);
  const ro1 = await readout();
  const kinds = raw.map((e) => e[0]).filter((t) => t !== 'mouseout');
  const moves = kinds.filter((t) => t === 'mousemove').length;
  const stampOk = added.length === 1 && added[0].chunkId === X.id && !!link1 && link1.id === added[0].id;
  const detail = `page events after the press ${J(raw)}; added ${J(added)}; link at the tile ${J(link1)}; hover ${J(lh1)}; readout ${J(ro1)}`;
  if (moves > 0) {
    check('M6.a', 'a real stamp press under a still pointer names the placement it made', 'UNMEASURABLE',
      `a mousemove reached the page after the press, and the move branch writes the same hover: this run cannot tell the press from the move. ${detail}`);
  } else {
    check('M6.a', 'a REAL stamp press, the pointer still, names the placement it just made: the link hover is {section 0, the new placement, chunk X}, and the page received exactly a press and a release, no move',
      stampOk && same(kinds, ['mousedown', 'mouseup']) && !!lh1 && lh1.sectionIndex === 0 && lh1.placementId === added[0].id && lh1.chunkId === X.id,
      detail);
    check('M6.b', 'the Chunk links panel says so without a move: its readout names placement #<id> ("Under cursor: <name> (#<id>)"), not the no-link text, and is laid out',
      stampOk && !!ro1 && ro1.text.startsWith('Under cursor: ') && ro1.text.endsWith(`(#${added[0].id})`) && ro1.text !== O.noLink && ro1.w > 0 && ro1.h > 0,
      `readout before ${J(ro0)}; after ${J(ro1)}; placement ${J(added[0] ?? null)}`);
  }
  await d.chord('z', CTRL);
  const p2 = await c.json('window.__dbg.aeon.chunkPlacements(0)');
  note('M6.cleanup', `after Ctrl+Z section 0 holds ${p2.length} placement(s) (${p0.length} before the stamp)`);
  await d.chord('v');
}

main().catch((e) => { console.error(e); process.exit(3); });
