#!/usr/bin/env node
// CAN AN AGENT JUDGE A COLLISION LAYOUT FROM DATA, OVER THE REAL WIRE?
//
// `paint_collision` had a write half and no read half. This harness drives the
// new `editor/get_collision_region` — and the `words` write form that makes it
// round-trip — over the REAL Aether HTTP binding: the express route, the zod
// layer, the Electron IPC bridge, `handleAgentRequest`. NONE of that is
// reachable from the ~5,500-row node suite, which passes green while a feature
// is visibly broken.
//
// ═══ WHAT WOULD MAKE THESE ROWS VACUOUS, AND WHAT IS DONE ABOUT IT ═══
//
// A read is the easiest thing in this repo to make vacuously green: a row that
// reads a region and asserts "it came back" proves nothing, and a row that
// compares a read against itself proves less.
//
// So no row below asserts on the read alone. Every one either
//   (a) asserts a value DERIVED from a write this harness made through a
//       DIFFERENT road (the agent wire writes, `__dbg.aeon.collisionAt` reads,
//       or vice versa), or
//   (b) asserts a value derived from the app's OWN source constants, parsed at
//       run time (§CONSTS), never typed here, or
//   (c) is a live SEARCH over the real act's real shape table that DIES if it
//       comes up empty.
//
// ═══ THE TWO CLAIMS THAT NEEDED AUTHORED FIXTURES ═══
//
// 1. MIXED CELLS. A 16px cell is stored as FOUR 8px sub-tile words, and nothing
//    in Aurora enforces that they agree — `project/aeon/load.ts` fills the
//    engine baseline one strip byte per 8px tile. No shipped act has a
//    disagreeing cell, so there is nothing to FIND: rows [r2*] AUTHOR the
//    disagreement with `__dbg.aeon.collisionPoke`, the harness-only fixture
//    hook that writes ONE sub-tile (no command can).
//
// 2. THE UNOWNED BITS. Every cell in every shipped act holds ZERO in bits 15:14,
//    so `0` preserved and `0` stripped are the same sixteen bits and a row over
//    real content can only land heads. Rows [r3*] author a non-zero value there
//    and PRINT it.
//
// ═══ WHICH ROWS DISCRIMINATE ═══
//
// On master the method does not exist at all, so every row calling it goes red
// there — which proves reachability and nothing else. The rows that discriminate
// against a PLAUSIBLE WRONG READER (one that samples the top-left sub-tile the
// way OverlayRenderer.drawCollisionOverlay does, or that re-packs the word from
// its unpacked view) are called out in the printed summary, and were MEASURED by
// running this file against a build carrying exactly those two plants.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
// ⚠ IT WRITES NOTHING TO DISK. No Ctrl+S, no save call; every agent paint is
//   undone and every poke is put back byte for byte before exit.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     npm run harness:collision-read

import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9414);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-collision-read`;
mkdirSync(SHOTS, { recursive: true });

// ── §CONSTS — the app's own numbers, PARSED, never typed ───────────────────
//
// A literal 128 or 0x3FFF in this file would be the copied-pin defect this repo
// keeps paying for: move a constant and the pin stays confidently wrong while
// measuring the wrong thing. Everything below is read out of source at run time
// and THROWS if it cannot be located — a check that cannot find its own subject
// must not run.
function readSrc(rel) { return readFileSync(`${ROOT}/${rel}`, 'utf8'); }
function num(src, name, where) {
  const m = new RegExp(`export const ${name}\\s*=\\s*(\\d+)`).exec(src);
  if (!m) throw new Error(`could not read ${name} out of ${where} — REFUSING TO GUESS`);
  return Number(m[1]);
}
const TYPES_SRC = readSrc('src/core/model/s4-types.ts');
const REGION_SRC = readSrc('src/core/collision/collision-region-read.ts');
const STW = num(TYPES_SRC, 'SECTION_TILES_WIDE', 's4-types.ts');
const STH = num(TYPES_SRC, 'SECTION_TILES_HIGH', 's4-types.ts');
const MAX_CELLS = num(REGION_SRC, 'COLLISION_REGION_MAX_CELLS', 'collision-region-read.ts');
// The cell extent is DERIVED the way the module derives it (tiles / 2), and the
// derivation is cross-checked against `cellTileIndices`'s own arithmetic below.
const CELLS_W = STW / 2;
const CELLS_H = STH / 2;

// The owned/unowned masks come from `packCollisionCell`'s OWN field expressions,
// parsed out of the encoder, exactly as `collision-word.ts` derives them.
function collisionOwnedMask() {
  const src = readSrc('src/core/collision/collision-cell-word.ts');
  const body = /export function packCollisionCell\([\s\S]*?\n\}/.exec(src)?.[0];
  if (!body) throw new Error('could not find packCollisionCell — REFUSING TO GUESS bit positions');
  const shape = /shape\s*&\s*(0x[0-9A-Fa-f]+)/.exec(body);
  const xf = /xFlip\s*\?\s*(0x[0-9A-Fa-f]+)/.exec(body);
  const yf = /yFlip\s*\?\s*(0x[0-9A-Fa-f]+)/.exec(body);
  const sol = /SOLIDITY_BITS\[c\.solidity\]\s*<<\s*(\d+)/.exec(body);
  if (!shape || !xf || !yf || !sol) {
    throw new Error('packCollisionCell no longer has the four-field shape this harness derives from');
  }
  const SHAPE = Number(shape[1]);
  const XF = Number(xf[1]);
  const YF = Number(yf[1]);
  const SOL = 3 << Number(sol[1]);
  const parts = [SHAPE, XF, YF, SOL];
  let owned = 0;
  for (const p of parts) {
    if (owned & p) throw new Error(`derived collision fields overlap: ${parts.map((x) => x.toString(16))}`);
    owned |= p;
  }
  return { SHAPE, XF, YF, SOL, OWNED: owned, UNOWNED: (~owned) & 0xFFFF, SOL_SHIFT: Number(sol[1]) };
}
const F = collisionOwnedMask();
/** The app's own packer, re-derived from the parsed field positions. */
const pack = (shape, xFlip, yFlip, solidityBits) =>
  ((shape & F.SHAPE) | (xFlip ? F.XF : 0) | (yFlip ? F.YF : 0) | ((solidityBits & 3) << F.SOL_SHIFT)) & 0xFFFF;
const SOLIDITY_ALL = 3;

/** The glyphs, parsed out of the module rather than typed — so a renamed glyph
 *  breaks the derivation loudly instead of turning a row silently vacuous. */
function glyph(name) {
  const m = new RegExp(`export const ${name} = '((?:\\\\.|[^'])*)'`).exec(REGION_SRC);
  if (!m) throw new Error(`could not read ${name} out of collision-region-read.ts`);
  return JSON.parse(`"${m[1]}"`);
}
const G = {
  AIR: glyph('GLYPH_AIR'), MIXED: glyph('GLYPH_MIXED'), UNKNOWN: glyph('GLYPH_UNKNOWN'),
  UP_RIGHT: glyph('GLYPH_SLOPE_UP_RIGHT'), UP_LEFT: glyph('GLYPH_SLOPE_UP_LEFT'),
};

const hex = (w) => (w === null || w === undefined ? 'null' : `0x${(w >>> 0).toString(16).padStart(4, '0')}`);

// ── discovery-file + process-tree machinery (from tile-attribute-harness) ──
//
// ⚠ BOTH OF THESE HIT THE OWNER'S OWN APP. (1) The launched app OVERWRITES the
// shared discovery file, so a harness reading it afterwards can talk to the
// owner's running Aurora and paint into his open document while reporting its
// own rows green. (2) `child.kill()` kills the `xvfb-run` WRAPPER, not the
// Electron under it, so the throwaway survives holding the port. Snapshot +
// restore, and killTree over /proc, both in ONE finally.
const DISCOVERY_FILES = ['.aurora', '.sonic-level-editor'].map((sub) => join(homedir(), sub, 'mcp.json'));
function snapshotDiscovery() {
  return DISCOVERY_FILES.map((f) => {
    try { return { f, content: readFileSync(f, 'utf8') }; } catch { return { f, content: null }; }
  });
}
function restoreDiscovery(snap) {
  for (const { f, content } of snap) {
    try {
      if (content === null) rmSync(f, { force: true });
      else writeFileSync(f, content);
    } catch (e) { console.log(`        WARN: could not restore ${f}: ${e.message}`); }
  }
}
function descendants(root) {
  const parent = new Map();
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const m = /^PPid:\s*(\d+)$/m.exec(readFileSync(`/proc/${d}/status`, 'utf8'));
      if (m) parent.set(Number(d), Number(m[1]));
    } catch { /* raced with exit */ }
  }
  const out = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of parent) {
      if (!out.has(pid) && out.has(ppid)) { out.add(pid); grew = true; }
    }
  }
  return out;
}
function killPids(pids) {
  let n = 0;
  for (const pid of [...pids].reverse()) {
    try { process.kill(pid, 'SIGKILL'); n++; } catch { /* already gone */ }
  }
  return n;
}

let rpcId = 1;
async function rpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/aether`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params }),
  });
  return { status: res.status, body: await res.json() };
}

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
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const results = [];
const fails = [];
const nonDiscriminating = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
function nondisc(id, why) {
  nonDiscriminating.push(id);
  console.log(`NON-DISCRIMINATING  [${id}]\n        ${why}`);
}
/** LOUD ON UNMEASURABLE: a subject that could not be found is not a pass. */
function unmeasurable(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: false });
  fails.push(`[${id}] ${name} (UNMEASURABLE: ${why})`);
}

async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

// ── the cell <-> sub-tile arithmetic, from the app's own cellTileIndices ────
const cellSubIndices = (cc, cr) => {
  const tc = cc * 2, tr = cr * 2;
  return [tr * STW + tc, tr * STW + tc + 1, (tr + 1) * STW + tc, (tr + 1) * STW + tc + 1];
};

async function main() {
  console.log('\n=== §CONSTS — DERIVED FROM THE APP\'S OWN SOURCE, NOT TYPED HERE ===');
  console.log(`  SECTION_TILES ${STW}x${STH}  ->  cell space ${CELLS_W}x${CELLS_H}`);
  console.log(`  COLLISION_REGION_MAX_CELLS = ${MAX_CELLS}`);
  console.log(`  collision word: shape ${hex(F.SHAPE)} xFlip ${hex(F.XF)} yFlip ${hex(F.YF)} `
    + `solidity ${hex(F.SOL)} (<<${F.SOL_SHIFT})`);
  console.log(`  OWNED ${hex(F.OWNED)}   UNOWNED (nobody's) ${hex(F.UNOWNED)}`);
  console.log(`  glyphs: air '${G.AIR}' mixed '${G.MIXED}' unknown '${G.UNKNOWN}' `
    + `upRight '${G.UP_RIGHT}' upLeft '${G.UP_LEFT}'`);
  if (F.UNOWNED === 0) {
    throw new Error('packCollisionCell now owns all sixteen bits — the preservation rows below '
      + 'would be vacuous. REFUSING TO RUN.');
  }

  if (!(await portFree())) throw new Error(`port ${PORT} already serving a CDP target — kill it first`);
  const discoverySnapshot = snapshotDiscovery();
  console.log(`  discovery snapshot: ${discoverySnapshot
    .map((d) => `${d.f} ${d.content === null ? '(absent)' : `${d.content.length}B`}`).join(' · ')}`);

  const child = spawn('/usr/bin/xvfb-run', [
    '-a', '--server-args=-screen 0 1600x1000x24',
    ELECTRON, '.', `--remote-debugging-port=${PORT}`, '--no-sandbox',
  ], {
    cwd: ROOT,
    env: { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ELECTRON_DISABLE_SECURITY_WARNINGS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[app] ${d}`));
  child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write(`[app!] ${d}`));

  /** Every poke this run made, so the `finally` can put the plane back. */
  const pokes = [];
  let c;
  const t0 = Date.now();
  try {
    const ws = await waitForTarget();
    c = cdp(ws);
    await c.ready;

    let hasDbg = 'undefined';
    for (let i = 0; i < 60; i++) {
      hasDbg = await c.evalExpr('typeof window.__dbg');
      if (hasDbg === 'object') break;
      await sleep(500);
    }
    if (hasDbg !== 'object') {
      throw new Error('window.__dbg absent after 30s — this needs a VITE_AURORA_DEBUG=1 build of dist/');
    }

    console.log('\n=== OPENING THE REAL AEON PROJECT ===');
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    for (let i = 0; i < 60; i++) {
      const st = await c.json('window.__dbg.aeon.state()');
      if (st.open && st.sections > 0) { note('project open', JSON.stringify(st)); break; }
      await sleep(500);
    }
    const st0 = await c.json('window.__dbg.aeon.state()');
    if (!st0.open) throw new Error('aeon project never opened');

    // ── PROVENANCE: THE PORT IS OURS OR NOTHING BELOW RUNS ────────────────
    let disc = null;
    for (let i = 0; i < 60 && !disc; i++) {
      const ours = descendants(child.pid);
      for (const f of DISCOVERY_FILES) {
        try {
          const j = JSON.parse(readFileSync(f, 'utf8'));
          if (j.port && ours.has(j.pid)) { disc = { ...j, from: f }; break; }
        } catch { /* not written yet, or not ours */ }
      }
      if (!disc) await sleep(250);
    }
    const MCP = disc?.port ?? -1;
    const info = disc ? await rpc(MCP, 'editor/get_project_info', {}) : null;
    const dbgState = await c.json('window.__dbg.aeon.state()');
    const wireSections = info?.body?.result?.sections?.filter(Boolean).length ?? -1;
    note('agent wire', disc
      ? `${disc.from} port=${disc.port} pid=${disc.pid} (a descendant of ${child.pid}) · `
        + `wire sections=${wireSections} · CDP sections=${dbgState.sections} · zone=${info?.body?.result?.zone}`
      : `no discovery file naming a pid under ${child.pid} — refusing to use anyone else's port`);
    check('w0', 'the Aether wire is THIS app, looking at THIS document',
      !!disc && wireSections === dbgState.sections && info?.body?.result?.zone === dbgState.zone,
      disc ? `port ${disc.port} pid ${disc.pid} · sections wire ${wireSections} vs cdp ${dbgState.sections}`
           : 'no discovery file owned by this run');
    if (!disc || wireSections !== dbgState.sections) {
      unmeasurable('r*', 'every collision-read row',
        'provenance failed — every row below would be describing another app');
      return;
    }

    const SEC = 0;
    const read = (x, y, w, h, extra = {}) =>
      rpc(MCP, 'editor/get_collision_region', { section: SEC, plane: 'a', x, y, w, h, ...extra });
    const paint = (params) => rpc(MCP, 'editor/paint_collision', { section: SEC, plane: 'a', ...params });
    const collAt = (i) => c.evalExpr(`window.__dbg.aeon.collisionAt(${SEC}, 'a', ${i})`);
    /** Capture a sub-tile index's ORIGINAL word so the `finally` can put it back.
     *  RESTORATION DOES NOT DEPEND ON THE UNDO STACK: [r7] issues dozens of
     *  paints, and a rewind that ran out of depth would leave the owner's act
     *  quietly modified while every row above still read green. */
    const remember = async (indices) => {
      for (const i of indices) {
        if (!pokes.some((p) => p.i === i)) pokes.push({ i, orig: await collAt(i) });
      }
    };
    /** Remember every sub-tile of a CELL rectangle. */
    const rememberRect = async (x, y, w, h) => {
      for (let r = 0; r < h; r++) for (let cc = 0; cc < w; cc++) await remember(cellSubIndices(x + cc, y + r));
    };
    const poke = async (i, w) => {
      await remember([i]);
      return c.evalExpr(`window.__dbg.aeon.collisionPoke(${SEC}, 'a', ${i}, ${w})`);
    };
    // Undo through the app's OWN hotkey, like every other harness here — the
    // debug surface exposes canUndo() but not undo(), on purpose.
    const undoAll = async (label) => {
      let n = 0;
      while (n < 400 && (await c.evalExpr('window.__dbg.aeon.canUndo()'))) {
        await key(c, 'z', 'KeyZ', 90, 2);
        await sleep(40);
        n++;
      }
      if (label) note('rewind', `${label}: ${n} undo step(s)`);
    };

    // Every cell this run will touch, captured BEFORE anything writes.
    const CX = 40, CY = 20, CW = 4, CH = 3;   // [r1] the non-uniform pattern
    const MX = 50, MY = 30;                   // [r2] the authored mixed cell
    const UX = 51, UY = 31;                   // [r3] the unowned-bit carrier
    const DX = 60, DY = 40;                   // [r4] the round-trip destination
    const SX = 0, SY = 100, SW = 64;          // [r7] the shape-search strip
    await rememberRect(CX, CY, CW, CH);
    await rememberRect(MX, MY, 1, 1);
    await rememberRect(UX, UY, 1, 1);
    await rememberRect(DX, DY, CW, CH);
    await rememberRect(SX, SY, SW, 1);
    note('restore plan', `${pokes.length} sub-tile words captured before any write`);

    // ═══ [a1] THE THING A HUMAN ACTUALLY LOOKS AT ═══════════════════════
    //
    // ⚠ THE FIRST DRAFT OF [a1b] WAS A FALSE PASS, and it is recorded here rather
    // than quietly fixed. It stripped row labels with `.slice(1)` +
    // `replace(/^\s*\d+ /)`, which leaves the ONES RULER intact (there is no space
    // after its digits), and then asserted "some char is not '.'". The ruler's own
    // digits satisfied that. The row printed PASS over a region that was
    // ENTIRELY AIR — a guard aimed at the wrong observable, which planting a
    // violation would never have caught, because the property really was false
    // and the row really was green.
    //
    // The fix is two rows aimed at two different things: the GRID SHAPE, taken
    // from the last `h` lines by position (never by pattern-matching content),
    // and the CONTENT, taken from the JSON `words` array rather than from the
    // picture. And the window is now FOUND, not assumed — section 0's top-left
    // corner is genuinely empty, which is why the bad matcher went unnoticed.
    console.log('\n=== [a1] the ascii view of a REAL region of the REAL act ===');
    /** The `h` glyph lines of an ascii block, by POSITION. The ruler lines are
     *  0 or 2 leading lines depending on whether the window spans a tens
     *  boundary, so counting from the END is the only stable rule. */
    const glyphRows = (ascii, h) => ascii.split('\n').slice(-h).map((l) => l.replace(/^\s*\d+ /, ''));

    // FIND a window with real collision in it. Scans the whole section in
    // budget-sized reads and keeps the densest 24x12 window. DIES if the whole
    // section is air, because then every glyph row below would be vacuous.
    const AW = 24, AH = 12;
    let best = null;
    for (const qy of [0, CELLS_H / 2]) {
      for (const qx of [0, CELLS_W / 2]) {
        const q = await read(qx, qy, CELLS_W / 2, CELLS_H / 2);
        const qw = q.body.result?.words;
        if (!qw) continue;
        const side = CELLS_W / 2;
        for (let ry = 0; ry + AH <= side; ry += AH) {
          for (let rx = 0; rx + AW <= side; rx += AW) {
            let solid = 0;
            for (let r = 0; r < AH; r++) {
              for (let cc = 0; cc < AW; cc++) {
                const v = qw[(ry + r) * side + (rx + cc)];
                if (v !== 0 && v !== null) solid++;
              }
            }
            if (!best || solid > best.solid) best = { x: qx + rx, y: qy + ry, solid };
          }
        }
      }
    }
    if (!best || best.solid === 0) {
      unmeasurable('a1', 'the ascii view of a real region',
        'the entire section is air — there is nothing for a human to glance at, and every '
        + 'glyph row below would be vacuous');
    } else {
      note('window search', `densest ${AW}x${AH} window in section ${SEC} plane A is at `
        + `cell (${best.x},${best.y}) with ${best.solid}/${AW * AH} non-air cells — FOUND, not assumed`);
      const real = await read(best.x, best.y, AW, AH, { ascii: true });
      console.log(real.body.result.ascii.split('\n').map((l) => `        ${l}`).join('\n'));
      note('real region stats', `mixedCells=${real.body.result.mixedCells} `
        + `cellsWithUnownedBits=${real.body.result.cellsWithUnownedBits} `
        + `profilesLoaded=${real.body.result.profilesLoaded}`);
      const rows = glyphRows(real.body.result.ascii, AH);
      check('a1', `the ascii grid is exactly ${AH} lines of ${AW} glyphs`,
        rows.length === AH && rows.every((l) => l.length === AW),
        `${rows.length} glyph lines, widths ${[...new Set(rows.map((l) => l.length))].join('/')}`);
      // CONTENT, asserted off the JSON — never off the picture, which is what the
      // false pass above did.
      const solidCells = real.body.result.words.filter((w) => w !== 0 && w !== null).length;
      check('a1b', 'the window really carries collision (counted from words[], not from the glyphs)',
        solidCells === best.solid && solidCells > 0,
        `${solidCells} non-air cells of ${AW * AH}`);
      check('a1c', 'and the PICTURE agrees with the JSON: exactly the air cells are air glyphs',
        rows.join('').split('').filter((ch) => ch === G.AIR).length
          === real.body.result.words.filter((w) => w === 0).length,
        `${rows.join('').split('').filter((ch) => ch === G.AIR).length} air glyphs vs `
        + `${real.body.result.words.filter((w) => w === 0).length} zero words`);
    }

    // ═══ [r1] THE READ AGREES WITH A WRITE MADE ON A DIFFERENT ROAD ════════
    console.log('\n=== [r1] the read reports what the WRITE put there (per-cell words) ===');
    await undoAll('before [r1]');
    // A deliberately NON-UNIFORM pattern — the case the fill form provably
    // cannot express, which is the whole premise of the `words` form.
    const pattern = Array.from({ length: CW * CH }, (_, i) => (i % 3 === 0 ? 0 : pack(1 + (i % 7), false, false, SOLIDITY_ALL)));
    const pr = await paint({ x: CX, y: CY, w: CW, h: CH, words: pattern });
    note('paint reply', JSON.stringify(pr.body.result ?? pr.body.error));
    const r1 = await read(CX, CY, CW, CH);
    check('r1-pre', 'the pattern is genuinely non-uniform (no single word could fill it)',
      new Set(pattern).size > 1, `${new Set(pattern).size} distinct words in ${pattern.length} cells`);
    check('r1', 'the read returns EXACTLY the words the agent wrote, row-major',
      JSON.stringify(r1.body.result?.words) === JSON.stringify(pattern),
      `wrote  ${pattern.map(hex).join(' ')}\n        read   ${(r1.body.result?.words ?? []).map(hex).join(' ')}`);
    // and the DOCUMENT agrees, read through a road that is not the tool
    const docFirst = await collAt(cellSubIndices(CX, CY)[0]);
    check('r1b', 'the DOCUMENT holds it too (read through __dbg, not the tool\'s own reply)',
      docFirst === pattern[0], `__dbg says ${hex(docFirst)}, the tool said ${hex(pattern[0])}`);

    // ═══ [r2] MIXED — the claim this whole parcel turns on ═════════════════
    console.log('\n=== [r2] a cell whose four 8px sub-tiles DISAGREE ===');
    const idx = cellSubIndices(MX, MY);
    const wA = pack(3, false, false, SOLIDITY_ALL);
    const wB = pack(9, false, false, SOLIDITY_ALL);
    for (const i of idx) await poke(i, wA);
    await poke(idx[3], wB);                      // ONE sub-tile differs
    note('authored fixture', `cell (${MX},${MY}) sub-tiles = `
      + `${[wA, wA, wA, wB].map(hex).join(' ')} — no shipped act has such a cell, so it is AUTHORED`);
    const live = [];
    for (const i of idx) live.push(await collAt(i));
    check('r2-pre', 'the fixture really landed (the four sub-tiles really differ)',
      new Set(live).size === 2, live.map(hex).join(' '));
    const r2 = await read(MX, MY, 1, 1, { ascii: true });
    const cell2 = r2.body.result?.cells?.[0]?.[0];
    check('r2', 'the read does NOT sample — word is null and mixed is true',
      cell2?.word === null && cell2?.mixed === true, JSON.stringify(cell2));
    check('r2b', 'all four sub-tile words are reported, in order',
      JSON.stringify(cell2?.sub) === JSON.stringify([wA, wA, wA, wB]),
      `sub = ${(cell2?.sub ?? []).map(hex).join(' ')}`);
    check('r2c', 'it offers NO single shape/solidity to be mistaken for the cell',
      cell2 !== undefined && cell2.shape === undefined && cell2.solidity === undefined,
      `shape=${cell2?.shape} solidity=${cell2?.solidity}`);
    check('r2d', 'mixedCells counts it and words[] carries null there',
      r2.body.result?.mixedCells === 1 && r2.body.result?.words?.[0] === null,
      `mixedCells=${r2.body.result?.mixedCells} words=${JSON.stringify(r2.body.result?.words)}`);
    check('r2e', 'the ascii marks it loudly rather than drawing a clean shape',
      typeof r2.body.result?.ascii === 'string' && r2.body.result.ascii.includes(G.MIXED),
      JSON.stringify(r2.body.result?.ascii));
    // and the write half refuses to guess at it
    const wrote = await paint({ x: MX, y: MY, w: 1, h: 1, words: r2.body.result.words });
    check('r2f', 'feeding the null straight back SKIPS the cell instead of inventing a word',
      wrote.body.result?.skipped === 1 && wrote.body.result?.painted === 0,
      JSON.stringify(wrote.body.result ?? wrote.body.error));
    const stillMixed = [];
    for (const i of idx) stillMixed.push(await collAt(i));
    check('r2g', 'and the cell is byte-for-byte untouched by that round trip',
      JSON.stringify(stillMixed) === JSON.stringify(live), stillMixed.map(hex).join(' '));

    // ═══ [r3] THE BITS NOBODY OWNS ═════════════════════════════════════════
    console.log('\n=== [r3] bits 15:14 — owned by no Aurora field, and not ours to strip ===');
    const uidx = cellSubIndices(UX, UY);
    const base = pack(5, false, true, SOLIDITY_ALL);
    const carrier = (base | F.UNOWNED) & 0xFFFF;
    note('authored fixture', `${hex(base)} | unowned ${hex(F.UNOWNED)} = ${hex(carrier)} — `
      + 'every cell in every shipped act holds ZERO there, so this MUST be authored or the row is a coin');
    for (const i of uidx) await poke(i, carrier);
    const r3 = await read(UX, UY, 1, 1);
    const cell3 = r3.body.result?.cells?.[0]?.[0];
    check('r3-pre', 'the carrier really differs from the same cell without those bits',
      carrier !== base, `${hex(carrier)} vs ${hex(base)}`);
    check('r3', 'the read returns the RAW word — the unowned bits survive',
      cell3?.word === carrier, `read ${hex(cell3?.word)}, expected ${hex(carrier)}`);
    check('r3b', 'cellsWithUnownedBits reports them, so a reply-only agent learns they exist',
      r3.body.result?.cellsWithUnownedBits === 1, `${r3.body.result?.cellsWithUnownedBits}`);
    check('r3c', 'the unpacked view still describes the fields Aurora DOES own',
      cell3?.shape === 5 && cell3?.yFlip === true && cell3?.solidity === 'all',
      JSON.stringify(cell3));

    // ═══ [r4] THE ROUND TRIP, OVER THE WIRE, ONTO A SCRIBBLED DESTINATION ══
    console.log('\n=== [r4] read a region, write it somewhere else, read it back ===');
    await paint({ x: DX, y: DY, w: CW, h: CH, word: pack(2, false, false, SOLIDITY_ALL) }); // scribble first
    const src = await read(CX, CY, CW, CH);
    const beforeDest = await read(DX, DY, CW, CH);
    check('r4-pre', 'the destination did NOT already look like the source',
      JSON.stringify(beforeDest.body.result?.words) !== JSON.stringify(src.body.result?.words),
      `dest ${(beforeDest.body.result?.words ?? []).map(hex).join(' ')}`);
    await paint({ x: DX, y: DY, w: CW, h: CH, words: src.body.result.words });
    const afterDest = await read(DX, DY, CW, CH);
    check('r4', 'the read\'s own words array, fed straight back, reproduces the region',
      JSON.stringify(afterDest.body.result?.words) === JSON.stringify(src.body.result?.words),
      `src  ${(src.body.result?.words ?? []).map(hex).join(' ')}\n        dest ${(afterDest.body.result?.words ?? []).map(hex).join(' ')}`);

    // ═══ [r5] EXACTLY ONE FORM ═════════════════════════════════════════════
    console.log('\n=== [r5] paint_collision takes EITHER word OR words, never both ===');
    const both = await paint({ x: CX, y: CY, w: 1, h: 1, word: 0, words: [0] });
    check('r5', 'passing both is refused, and the refusal names both fields',
      !!both.body.error && /word/.test(both.body.error.message ?? '') && /words/.test(both.body.error.message ?? ''),
      JSON.stringify(both.body.error ?? both.body.result));
    const neither = await paint({ x: CX, y: CY, w: 1, h: 1 });
    check('r5b', 'passing neither is refused',
      !!neither.body.error, JSON.stringify(neither.body.error ?? neither.body.result));
    nondisc('r5b', 'on master, omitting `word` was refused by ZOD (it was required). This row is red '
      + 'both ways only because master lacks the tool; it pins that making `word` optional did not open '
      + 'a hole, and its discriminator against a WRONG new handler is [r5].');
    const wrongLen = await paint({ x: CX, y: CY, w: 2, h: 2, words: [0, 0, 0] });
    check('r5c', 'a words array of the wrong length is refused, naming both counts',
      !!wrongLen.body.error && /3/.test(wrongLen.body.error.message ?? '') && /4/.test(wrongLen.body.error.message ?? ''),
      JSON.stringify(wrongLen.body.error ?? wrongLen.body.result));

    // ═══ [r6] THE FILL FORM IS UNCHANGED (shared ground) ═══════════════════
    console.log('\n=== [r6] the existing fill form still fills ===');
    await undoAll('before [r6]');
    const fillWord = pack(4, true, false, SOLIDITY_ALL);
    const fr = await paint({ x: CX, y: CY, w: 2, h: 2, word: fillWord });
    const r6 = await read(CX, CY, 2, 2);
    check('r6', 'word:<w> still fills every cell of the rectangle, 4 sub-tiles each',
      (r6.body.result?.words ?? []).length === 4
        && (r6.body.result?.words ?? []).every((w) => w === fillWord)
        && fr.body.result?.painted === 16,
      `painted=${fr.body.result?.painted} words=${(r6.body.result?.words ?? []).map(hex).join(' ')}`);
    nondisc('r6', 'this is the pre-existing behaviour, deliberately unchanged. It is a REGRESSION guard '
      + 'on shared ground (the lp2-loop-paint lane is in this file too), not evidence of anything new.');

    // ═══ [r7] THE GLYPH HONOURS THE FLIP — a LIVE search, not a guess ══════
    console.log('\n=== [r7] the ascii glyph honours the word\'s X-flip (live shape search) ===');
    await undoAll('before [r7]');
    const lastGlyphLine = (res) => (res.body.result?.ascii ?? '').split('\n').pop().replace(/^\s*\d+ /, '');
    const stripGlyphs = async (base) => {
      const words = Array.from({ length: SW }, (_, i) => pack(base + i, false, false, SOLIDITY_ALL));
      await paint({ x: SX, y: SY, w: SW, h: 1, words });
      return lastGlyphLine(await read(SX, SY, SW, 1, { ascii: true }));
    };
    // A LIVE SEARCH over the REAL act's REAL shape table, batched: one paint and
    // one read per SW shapes. It reports UNMEASURABLE rather than going quietly
    // green if the table holds no shape the reader draws as "rises to the right".
    let slopeShape = null;
    let scanned = 0;
    for (let base = 1; base <= 193 && slopeShape === null; base += SW) {
      const row = await stripGlyphs(base);
      scanned = base + SW - 1;
      note(`shape scan ${base}..${scanned}`, row);
      const at = row.indexOf(G.UP_RIGHT);
      if (at >= 0) slopeShape = base + at;
    }
    if (slopeShape === null) {
      unmeasurable('r7', 'the glyph honours the word\'s X-flip',
        `no shape in 1..${scanned} of this act's table renders as '${G.UP_RIGHT}' — nothing to mirror`);
    } else {
      note('live fixture', `shape ${slopeShape} of the REAL table renders '${G.UP_RIGHT}'`);
      await paint({ x: SX, y: SY, w: 1, h: 1, word: pack(slopeShape, false, false, SOLIDITY_ALL) });
      const g0 = lastGlyphLine(await read(SX, SY, 1, 1, { ascii: true }));
      await paint({ x: SX, y: SY, w: 1, h: 1, word: pack(slopeShape, true, false, SOLIDITY_ALL) });
      const g1 = lastGlyphLine(await read(SX, SY, 1, 1, { ascii: true }));
      check('r7-pre', 'the unflipped shape really renders as the slope the search found',
        g0 === G.UP_RIGHT, `'${g0}'`);
      check('r7', 'the same shape with xFlip set renders MIRRORED',
        g1 === G.UP_LEFT, `unflipped '${g0}' -> flipped '${g1}' (expected '${G.UP_LEFT}')`);
    }

    // ═══ [r8] THE COORDS ARE CELLS, NOT TILES ══════════════════════════════
    console.log('\n=== [r8] the read is bounded in CELL space, not tile space ===');
    const edge = await read(CELLS_W - 1, CELLS_H - 1, 1, 1);
    const past = await read(CELLS_W, 0, 1, 1);
    check('r8', `the last cell (${CELLS_W - 1},${CELLS_H - 1}) reads and (${CELLS_W},0) is refused`,
      !!edge.body.result && !!past.body.error,
      `edge=${edge.body.result ? 'ok' : JSON.stringify(edge.body.error)} · `
      + `past=${past.body.error ? JSON.stringify(past.body.error.message) : 'ACCEPTED — bounds are wrong'}`);
    check('r8b', 'the last cell\'s sub-tiles really are the plane\'s last indices',
      Math.max(...cellSubIndices(CELLS_W - 1, CELLS_H - 1)) === STW * STH - 1,
      `max sub index ${Math.max(...cellSubIndices(CELLS_W - 1, CELLS_H - 1))} vs plane last ${STW * STH - 1}`);

    // ═══ [r9] THE PER-CALL CELL BUDGET ═════════════════════════════════════
    console.log('\n=== [r9] the per-call cell budget refuses loudly ===');
    // Derived: the smallest square strictly over the budget that still fits the
    // section, so the row moves with COLLISION_REGION_MAX_CELLS.
    const side = Math.min(CELLS_W, Math.floor(Math.sqrt(MAX_CELLS)) + 1);
    const over = await read(0, 0, side, side);
    check('r9', `a ${side}x${side} = ${side * side} cell read is refused and the message names the ${MAX_CELLS}-cell limit`,
      side * side > MAX_CELLS && !!over.body.error && (over.body.error.message ?? '').includes(String(MAX_CELLS)),
      JSON.stringify(over.body.error?.message ?? 'ACCEPTED'));
    const atLimit = await read(0, 0, Math.floor(Math.sqrt(MAX_CELLS)), Math.floor(Math.sqrt(MAX_CELLS)));
    check('r9b', 'a read exactly AT the budget is accepted (the limit is not off by one)',
      !!atLimit.body.result && atLimit.body.result.words.length === MAX_CELLS,
      `${atLimit.body.result?.words?.length ?? JSON.stringify(atLimit.body.error)} cells`);

    await c.send('Page.captureScreenshot', { format: 'png' }).then(({ data }) => {
      writeFileSync(`${SHOTS}/after.png`, Buffer.from(data, 'base64'));
    }).catch(() => {});

    // ── PUT EVERYTHING BACK ───────────────────────────────────────────────
    console.log('\n=== restoring the document ===');
    await undoAll('teardown');
    for (const p of pokes) {
      await c.evalExpr(`window.__dbg.aeon.collisionPoke(${SEC}, 'a', ${p.i}, ${p.orig ?? 0})`);
    }
    let dirty = 0;
    for (const p of pokes) {
      if ((await collAt(p.i)) !== (p.orig ?? 0)) dirty++;
    }
    check('z1', 'every sub-tile this run touched is back to the word it started with',
      dirty === 0, `${pokes.length} sub-tiles captured before any write, ${dirty} still differ`);
    note('z-note', 'no Ctrl+S and no save call is issued anywhere in this file, and the app has no '
      + 'autosave (shell/close-guard.ts) \u2014 so nothing this run did can reach disk. That is a '
      + 'property of THIS FILE, stated rather than measured, which is why it is a NOTE and not a row.');
  } finally {
    console.log('\n=== TEARDOWN ===');
    try { c?.close(); } catch { /* already gone */ }
    // SNAPSHOT THE TREE FIRST, THEN KILL. `child` is the xvfb-run WRAPPER; once
    // it dies its children reparent to init and become unfindable.
    const tree = [...descendants(child.pid)];
    console.log(`        process tree under ${child.pid}: ${tree.join(' ')}`);
    child.kill('SIGKILL');
    console.log(`        killTree: SIGKILLed ${killPids(tree)} pids`);
    restoreDiscovery(discoverySnapshot);
    console.log('        discovery files restored');
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n=== ${pass}/${results.length} rows passed  (wall clock ${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
  if (nonDiscriminating.length) {
    console.log(`NON-DISCRIMINATING ROWS (named above, and not evidence of the fix): ${nonDiscriminating.join(', ')}`);
  }
  if (fails.length) {
    console.log('FAILED:');
    for (const f of fails) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
