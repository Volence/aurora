#!/usr/bin/env node
// DOES PRESSING F7 OVER THE MAP PUT SONIC AT THE WORLD PIXEL UNDER THE CURSOR?
//
//     npm run harness:f7-warp-landing
//
// Needs, in the tree the run is AGAINST (read the `root:` / `pinned:` lines):
//     VITE_AURORA_DEBUG=1 npm run build
// From an agent worktree, BOTH of these or you silently measure main's dist/:
//     ELECTRON_BIN=<main checkout>/node_modules/.bin/electron AURORA_BUILT_TREE=<worktree>
//
// ═══ WHAT THIS CLOSES (MAPVIEWPORT-UNTESTED, "the warp's landing in the running game")
//
// `test/live/aeon-warp-correspondence.test.ts` (ROADMAP row 140) proved the MATH: a
// world pixel handed to the shipped `warpTargetFor` + `warpTo` lands the player on that
// pixel. It says of itself that it does NOT cover `screenToWorld`, and it never goes near
// the app: no key, no cursor, no IPC. This harness is the missing chain, end to end:
//
//   a REAL mouse move (CDP Input.dispatchMouseEvent at an INTEGER client pixel)
//     -> MapViewport's `cursorClient` ref
//   a REAL F7 (CDP Input.dispatchKeyEvent, not a DOM dispatchEvent)
//     -> the window keydown handler (`F7 — play from cursor`) -> screenToWorld
//     -> warpTargetFor -> aetherStore.warp -> IPC -> main's AetherClient
//     -> the engine's DEBUG warp mailbox -> Player_1 in RAM.
//
// ═══ WHO IS ASKED WHAT
//
// Two processes this harness started, two connections:
//   * its OWN headless `oracle-aether` on a mkdtemp socket, against a COPY of aeon's
//     `s4.debug.bin` + `s4.debug.lst` taken at the start of the run (so another lane
//     rebuilding aeon mid-run cannot swap the machine out from under the rows). The app
//     is launched with ORACLE_SOCKET pointing there. It never touches /tmp/oracle.sock,
//     $XDG_RUNTIME_DIR/oracle.sock, or any socket it did not create: those can be the
//     owner's on-screen game.
//   * an OBSERVER AetherClient of its own on that socket, reading Player_1's SST x_pos /
//     y_pos (16.16 fixed; the pixel is the high word) straight out of RAM. The app is
//     never asked whether the warp worked; its toast is printed as a NOTE, never a row.
//
// ═══ WHERE EVERY NUMBER COMES FROM
//
//   * The EXPECTED world pixel is derived from the integer aim pixel through the map's
//     own screen->world contract (MapViewport `screenToWorld` + effects-guides
//     `canvasYToWorldY`): world = vp + (client - canvasRect.origin) / zoom, with vp/zoom
//     read back from the app's view store (`__dbg.view()`) and the rect from the canvas
//     itself, AFTER the hover and BEFORE the key. NEVER from `warpTargetFor`'s output:
//     a perturbation there would move the request and the expectation together.
//     The view is set so each derived world point is an exact integer (the residual is
//     printed and must be < 0.01), so no rounding convention is being assumed either.
//   * SST offsets, SCREEN_HEIGHT and SECTION_SIZE_SHIFT come from the ROM's OWN listing
//     (`EQU SST_x_pos = ...`), and that listing is bound to the ROM bytes by its digest
//     (`DIGEST-ROM crc=...`), which row 0b checks against the CRC32 of the copied ROM.
//     No aeon source file is read at all, so there is no "which revision" gap between
//     constants and ROM. The aeon HEAD, and the newest aeon commit at or before the ROM's
//     mtime, are printed for the record.
//   * The engine's clamp edges (`Player_Bound_Right/Bottom`, row 140's finding: the
//     engine clamps tighter than the editor) are read LIVE, and both points must sit
//     inside them and inside the app's act.
//
// ═══ WHAT MAKES IT NON-VACUOUS
//
//   * TWO POINTS FAR APART, at different ZOOMS (A at 1, B at 0.5). One point passes
//     against a stuck value (row 140's mutation 2); zoom 1 alone cannot see a missing
//     `/ zoom`.
//   * Before each F7 the player is NOT at the target, on EITHER axis (rows .pre).
//   * Hovering alone does not move the player (rows .hover): the key is the trigger.
//   * The app's Aether link names THIS run's socket (row 2c), and the player moving in
//     THIS instance's RAM is causal evidence the app wrote to it: nothing else is
//     connected to a mkdtemp socket.
//   * The camera did not move between the expectation's read and the key (rows .view).
//   * Every row prints dpr, canvas rect, aim, view and the derived world point, and no
//     claim reads two runs: dpr has been seen at both 1 and 1.35 on this host.
//   * Unmeasurable is loud: no level live, no attach, an unreadable RAM value, a missing
//     listing constant -> `HARNESS ABORTED` and exit 2, never a green row.
//
// Red-first evidence (warpTargetFor pinned to a constant; a +8 x offset in the F7
// path): docs/reviews/2026-09-25-f7-warp-landing.md.
//
// ⚠ It writes NOTHING in the aeon tree: no save, no build. It reads s4.debug.bin and
// s4.debug.lst once, to copy them. It never touches any `mcp__oracle__*` tool.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, copyFileSync, readFileSync, statSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import * as http from 'node:http';
import * as esbuild from 'esbuild';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9487);
/**
 * Optional `SCALE=1.35`: pass `--force-device-scale-factor` so a run can be made at a
 * FRACTIONAL dpr on demand, rather than waiting for Xvfb to infer one (it has been seen
 * at both 1 and 1.35 on this host). At 1.35 the canvas rect is fractional, which is the
 * case the integer aim exists for. Unset = whatever the window gives, printed per row.
 */
const SCALE = process.env.SCALE ? Number(process.env.SCALE) : null;
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
assertFreshBuild(RUN);
assertDebugBuild(RUN);
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const SERVER = siblingPathOrUnresolved('oracle', 'target/release/oracle-aether');
const AEONDIR = siblingPathOrUnresolved('aeon');
const ROM_SRC = siblingPathOrUnresolved('aeon', 's4.debug.bin');
const LST_SRC = siblingPathOrUnresolved('aeon', 's4.debug.lst');

/**
 * Frames run from power-on before the act is trusted: the budget row 140 and
 * warp-tearing measured this ROM booting under. Gate rows 1a-1c refuse to report if
 * it was not enough.
 */
const BOOT_FRAMES = 600;

/**
 * The two targets, in WORLD pixels. Row 140's points: high in the act (open air, so the
 * one frame that runs after the consume cannot snap the player onto a floor), and the
 * deltas (777, 333) are deliberately not round so a grid snap cannot coincide.
 */
const TARGETS = [
  { id: 'A', world: { x: 1024, y: 96 }, zoom: 1 },
  { id: 'B', world: { x: 1801, y: 429 }, zoom: 0.5 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = JSON.stringify;
const hex = (n) => '0x' + (n >>> 0).toString(16).toUpperCase();

class Aborted extends Error {}
const abort = (why) => { throw new Aborted(why); };

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok });
  if (!ok) fails.push(id);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

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
  throw new Aborted('CDP target never appeared');
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
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${J(m.error)}`)) : resolve(m.result)));
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

/** `EQU NAME = $HEX` out of the ROM's own listing, or an abort naming it. */
function listingEqu(lst, name) {
  const m = new RegExp(`^EQU ${name} = \\$([0-9A-Fa-f]+)\\s*$`, 'm').exec(lst);
  if (m === null) abort(`the listing has no "EQU ${name} = $..." line: this run cannot derive it`);
  return Number.parseInt(m[1], 16);
}

function gitOut(dir, args) {
  try { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim(); } catch { return '(unreadable)'; }
}

async function main() {
  if (!(await portFree())) abort(`port ${PORT} ALREADY serves a CDP target; set PORT`);
  for (const [what, p] of [['oracle-aether', SERVER], ['aeon s4.debug.bin', ROM_SRC], ['aeon s4.debug.lst', LST_SRC]]) {
    if (!existsSync(p)) abort(`${what} is absent at ${p}: nothing here can be measured (do not build it from a harness)`);
  }

  // ---- 0. The ROM, its listing, and which build they are ----------------------------
  const workDir = mkdtempSync(join(tmpdir(), 'aur-f7-'));
  const SOCK = join(workDir, 'o.sock');
  if (Buffer.byteLength(SOCK) >= 100) abort(`socket path ${SOCK} is too long for a unix socket`);
  const ROM = join(workDir, 's4.debug.bin');
  const LST = join(workDir, 's4.debug.lst');
  const romMtime = statSync(ROM_SRC).mtime;
  copyFileSync(ROM_SRC, ROM);
  copyFileSync(LST_SRC, LST);
  const lst = readFileSync(LST, 'utf8');
  const romCrc = (crc32(readFileSync(ROM)) >>> 0).toString(16).padStart(8, '0');
  const digestRom = /^DIGEST-ROM crc=([0-9a-f]{8}) size=(\d+)/m.exec(lst);
  const aeonHead = gitOut(AEONDIR, ['log', '-1', '--format=%H %cI']);
  const aeonAtRom = gitOut(AEONDIR, ['log', '-1', `--until=${romMtime.toISOString()}`, '--format=%H %cI']);
  note('provenance',
    `aeon ${AEONDIR}: HEAD ${aeonHead}; newest commit at or before the ROM's mtime ${romMtime.toISOString()}: ${aeonAtRom}\n`
    + `        ROM copy ${ROM} crc32 ${romCrc}; listing digest ${digestRom ? `crc=${digestRom[1]} size=${digestRom[2]}` : '(none)'}; `
    + `assembler ${(/^DIGEST-ASSEMBLER (.*)$/m.exec(lst) ?? [])[1] ?? '(none)'}`);
  check('0a', '[anti-vacuous] the listing is a DEBUG build (the warp mailbox is DEBUG-shape only)',
    /^DIGEST-SHAPE .*\bdebug=1\b/m.test(lst), (/^DIGEST-SHAPE (.*)$/m.exec(lst) ?? [])[1]);
  check('0b', '[anti-vacuous] the listing and the ROM are ONE build: the listing\'s DIGEST-ROM crc is the ROM copy\'s crc32',
    digestRom !== null && digestRom[1] === romCrc, `digest ${digestRom?.[1]} vs rom ${romCrc}`);
  if (digestRom === null || digestRom[1] !== romCrc) abort('the listing does not describe this ROM: every constant below would be about another build');
  const OFF_X = listingEqu(lst, 'SST_x_pos');
  const OFF_Y = listingEqu(lst, 'SST_y_pos');
  const SCREEN_HEIGHT = listingEqu(lst, 'SCREEN_HEIGHT');
  const SECTION_PX = 1 << listingEqu(lst, 'SECTION_SIZE_SHIFT');
  note('constants from the ROM\'s own listing', `SST_x_pos ${hex(OFF_X)}, SST_y_pos ${hex(OFF_Y)}, SCREEN_HEIGHT ${SCREEN_HEIGHT}, section ${SECTION_PX}px`);

  // ---- the emulator, private socket, and the observer --------------------------------
  let emu = null, app = null, c = null, observer = null;
  try {
    const out = join(workDir, 'client.mjs');
    await esbuild.build({
      entryPoints: [join(ROOT, 'src/main/aether/client.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    });
    const { AetherClient } = await import(out);

    emu = spawn(SERVER, [ROM, '--socket', SOCK], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let elog = '';
    emu.stdout.on('data', (d) => { elog += d; if (process.env.VERBOSE) process.stdout.write(`[emu] ${d}`); });
    emu.stderr.on('data', (d) => { elog += d; if (process.env.VERBOSE) process.stderr.write(`[emu!] ${d}`); });
    for (let i = 0; i < 100 && !elog.includes('listening on'); i++) await sleep(100);
    if (!elog.includes('listening on')) abort(`oracle-aether never announced its socket: ${J(elog.slice(-400))}`);
    note('emulator', elog.trim().split('\n').join('\n        '));

    observer = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK, log: () => {} });
    await observer.connect();
    // NO loadSymbols from the observer, on purpose: the app's client never calls it
    // either, and relies on the server loading the listing beside the ROM. Loading it
    // here would hand the app a symbol table no real session has.
    const status0 = await observer.call('emulator/status');
    check('0c', '[anti-vacuous] the server runs THIS run\'s ROM copy and bound THIS run\'s listing copy',
      status0.romPath === ROM && status0.symbolsPath === LST, `romPath ${status0.romPath}; symbolsPath ${status0.symbolsPath}; symbols ${status0.symbolCount}`);

    const readBytes = async (addr, len) => {
      const r = await observer.call('emulator/read_memory', { addr: hex(addr), len });
      const b = Buffer.from(String(r?.bytes ?? '').replace(/^0x/i, ''), 'hex');
      if (b.length !== len) abort(`read_memory ${hex(addr)} len ${len} came back ${b.length} bytes: RAM is unreadable`);
      return b;
    };
    const readWord = async (a) => (await readBytes(a, 2)).readUInt16BE(0);
    const readLong = async (a) => (await readBytes(a, 4)).readUInt32BE(0);

    // ---- 1. GATE: a level must be live -----------------------------------------------
    await observer.call('emulator/pause');
    await observer.call('emulator/run_frames', { frames: BOOT_FRAMES });
    const actPtr = await readLong(await observer.resolve('Current_Act_Ptr'));
    const player = await observer.resolve('Player_1');
    const leader = (0xff0000 | await readWord(await observer.resolve('Camera_Target'))) & 0xffffff;
    const boundRight = await readWord(await observer.resolve('Player_Bound_Right'));
    const boundBottom = await readWord(await observer.resolve('Player_Bound_Bottom'));
    check('1a', '[gate] an act is loaded: Current_Act_Ptr is a plausible ROM pointer', actPtr !== 0 && actPtr < 0x400000, hex(actPtr));
    check('1b', '[gate] the camera leader IS Player_1 (the mailbox places the leader, so that is the object to read)',
      leader === (player & 0xffffff), `leader ${hex(leader)} Player_1 ${hex(player)}`);
    check('1c', '[gate] the act bounds are live', boundRight > 0 && boundBottom > 0, `Player_Bound_Right ${boundRight}, Player_Bound_Bottom ${boundBottom}`);
    if (!(actPtr !== 0 && actPtr < 0x400000 && leader === (player & 0xffffff) && boundRight > 0 && boundBottom > 0)) {
      abort('no level is live in the engine: every figure below would be about a menu');
    }
    const readPlayer = async () => ({
      x: (await readLong(player + OFF_X)) >>> 16,
      y: (await readLong(player + OFF_Y)) >>> 16,
    });

    // ---- 2. The app, attached to THIS socket -------------------------------------------
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ORACLE_SOCKET: SOCK };
    delete env.DISPLAY;
    delete env.EXODUS_SOCKET;
    app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON,
      ...(SCALE !== null ? [`--force-device-scale-factor=${SCALE}`] : []), MAIN],
      { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    let dbg = false;
    for (let i = 0; i < 60 && !dbg; i++) {
      dbg = await c.evalExpr('typeof window.__dbg === "object"').catch(() => false);
      if (!dbg) await sleep(300);
    }
    if (!dbg) abort('no window.__dbg: this is not a VITE_AURORA_DEBUG=1 build');

    // The renderer can still be settling (a reload collects the pending promise:
    // "Promise was collected" on the first run), so the open's own promise is not
    // trusted; the app's STATE below is what gates.
    await sleep(2500);
    for (let i = 0; i < 60 && !(await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)); i++) await sleep(300);
    await c.evalExpr(`window.__dbg.aeon.open(${J(AEONDIR)})`)
      .catch((e) => note('aeon.open promise did not resolve (the state poll decides)', e.message));
    let st = null;
    for (let i = 0; i < 50; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st?.open && st.sections > 0) break;
      await sleep(400);
    }
    check('2a', '[gate] the aeon project is open in the app, with an act', !!(st?.open && st.sections > 0), J(st));
    if (!(st?.open && st.sections > 0)) abort('the aeon project did not open');
    await sleep(1500);

    await c.evalExpr('window.__dbg.aether.connect()');
    let ast = null;
    for (let i = 0; i < 30; i++) {
      ast = await c.json('window.__dbg.aether.state()');
      if (ast.status === 'connected') break;
      await sleep(300);
    }
    check('2b', '[gate] the app\'s Aether link is up', ast?.status === 'connected', J(ast));
    check('2c', '[anti-vacuous] the app attached to THIS run\'s private socket, not a default one',
      ast?.socketPath === SOCK, `app socketPath ${ast?.socketPath}; ours ${SOCK}; implementation ${ast?.implementation}`);
    if (ast?.status !== 'connected' || ast?.socketPath !== SOCK) abort('the app is not attached to this run\'s emulator');

    const canvasInfo = () => c.json(String.raw`(() => { const cv = document.getElementById('map-canvas');
      if (!cv) return null; const r = cv.getBoundingClientRect();
      return { dpr: window.devicePixelRatio, left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
    const cv0 = await canvasInfo();
    if (!cv0 || cv0.width < 200 || cv0.height < 200) abort(`the map canvas is not on screen: ${J(cv0)}`);
    if (SCALE !== null) {
      check('2d', `[anti-vacuous] SCALE=${SCALE} took: devicePixelRatio reads ${SCALE}`, Math.abs(cv0.dpr - SCALE) < 1e-6, `dpr ${cv0.dpr}`);
    }
    note('environment', `SCALE ${SCALE ?? 'unset (native)'}; dpr ${cv0.dpr}; map canvas rect ${J(cv0)}; app act ${st.zone}/${st.act} grid ${st.gridWidth}x${st.gridHeight}; `
      + `engine clamp edges (${boundRight}, ${boundBottom})`);

    const mouse = (type, x, y) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'none', buttons: 0 });
    const pressF7 = async () => {
      const k = { key: 'F7', code: 'F7', windowsVirtualKeyCode: 118, nativeVirtualKeyCode: 118 };
      await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
    };
    const toasts = () => c.json('window.__dbg.aeon.toasts()');

    const landed = [];
    for (const T of TARGETS) {
      const P = T.id;
      const W = T.world;
      // Both axes inside the engine's tighter clamp AND inside the app's act, so no
      // clamp applies and the contract is identity.
      check(`${P}.in`, `[anti-vacuous] target ${P} (${W.x},${W.y}) sits inside the engine clamp and the app's act`,
        W.x < boundRight && W.y < boundBottom
          && W.x < (st.gridWidth ?? 0) * SECTION_PX && W.y < (st.gridHeight ?? 0) * SECTION_PX,
        `engine edges (${boundRight},${boundBottom}); app act ${st.gridWidth}x${st.gridHeight} sections of ${SECTION_PX}px`);

      // AIM: an INTEGER client pixel well inside the canvas. Then set the view so the
      // world point under that integer pixel is exactly W; the expectation below is
      // re-derived from what the app REPORTS back, not from these numbers.
      const g = await canvasInfo();
      const aim = { x: Math.round(g.left + g.width * 0.4), y: Math.round(g.top + g.height * 0.4) };
      const vpX = W.x - (aim.x - g.left) / T.zoom;
      const vpY = W.y - (aim.y - g.top) / T.zoom;
      if (vpX < 0 || vpY < 0) {
        // setViewport clamps vp at 0; move the aim toward the canvas origin instead.
        // FLOOR, so (aim - origin) never exceeds W * zoom and the view stays >= 0.
        aim.x = Math.floor(g.left + Math.min(g.width * 0.4, W.x * T.zoom));
        aim.y = Math.floor(g.top + Math.min(g.height * 0.4, W.y * T.zoom));
      }
      await c.evalExpr(`window.__dbg.setView(${Math.max(0, W.x - (aim.x - g.left) / T.zoom)}, ${Math.max(0, W.y - (aim.y - g.top) / T.zoom)}, ${T.zoom})`);
      await sleep(400);

      // WHAT IS UNDER THE AIM. A hover delivered to something ABOVE the map (a panel,
      // a toast) never reaches MapViewport's mousemove, so F7 would aim at a stale
      // cursor; this row says so instead of letting .x/.y fail for the wrong reason.
      const hit = await c.json(String.raw`(() => { const cv = document.getElementById('map-canvas');
        const el = document.elementFromPoint(${aim.x}, ${aim.y});
        return { tag: el ? el.tagName : null, id: el ? el.id : null,
          inside: !!(el && cv && (el === cv || cv.parentElement.contains(el))) }; })()`);
      check(`${P}.hit`, '[anti-vacuous] the aim pixel hit-tests inside the map canvas\'s container', hit.inside === true, J(hit));

      const before = await readPlayer();
      await mouse('mouseMoved', aim.x, aim.y);
      await sleep(600);
      const afterHover = await readPlayer();

      // THE EXPECTATION, from the app's own report, after the hover and before the key.
      const rect = await canvasInfo();
      const view = await c.json('window.__dbg.view()');
      const worldF = { x: view.x + (aim.x - rect.left) / view.zoom, y: view.y + (aim.y - rect.top) / view.zoom };
      const expect = { x: Math.round(worldF.x), y: Math.round(worldF.y) };
      const resid = Math.max(Math.abs(worldF.x - expect.x), Math.abs(worldF.y - expect.y));
      note(`${P} geometry`, `dpr ${rect.dpr}; canvas rect left ${rect.left} top ${rect.top} ${rect.width}x${rect.height}; `
        + `aim client (${aim.x},${aim.y}); view ${J(view)}; derived world (${worldF.x}, ${worldF.y}) -> (${expect.x},${expect.y}); residual ${resid.toExponential(2)}`);
      if (!Number.isInteger(aim.x) || !Number.isInteger(aim.y)) abort(`aim ${J(aim)} is not an integer client pixel`);
      if (resid >= 0.01) abort(`the derived world point is not an integer pixel (residual ${resid}): the geometry is ambiguous, not the feature`);
      check(`${P}.aim`, `[anti-vacuous] the derived world point is the target this row set out to hit`,
        expect.x === W.x && expect.y === W.y, `derived (${expect.x},${expect.y}) target (${W.x},${W.y})`);

      check(`${P}.pre`, `[anti-vacuous] before F7 the player is NOT at the target, on either axis`,
        before.x !== expect.x && before.y !== expect.y, `player (${before.x},${before.y}) target (${expect.x},${expect.y})`);
      check(`${P}.hover`, `[control] hovering alone does not move the player (the key is the trigger)`,
        afterHover.x === before.x && afterHover.y === before.y, `before (${before.x},${before.y}) after hover (${afterHover.x},${afterHover.y})`);

      const nToasts = (await toasts()).length;
      await pressF7();
      let tl = [];
      for (let i = 0; i < 50; i++) {
        tl = await toasts();
        if (tl.length > nToasts) break;
        await sleep(200);
      }
      const toast = tl.length > nToasts ? tl[tl.length - 1] : null;
      note(`${P} app toast (printed, never evidence)`, J(toast));
      await sleep(300);
      const view2 = await c.json('window.__dbg.view()');
      check(`${P}.view`, '[anti-vacuous] the camera did not move between the expectation\'s read and the key',
        view2.x === view.x && view2.y === view.y && view2.zoom === view.zoom, `${J(view)} -> ${J(view2)}`);

      const got = await readPlayer();
      landed.push({ P, got, expect });
      console.log(`        ${P}: aim (${aim.x},${aim.y}) -> world (${expect.x},${expect.y}) -> engine (${got.x},${got.y})  delta (${got.x - expect.x},${got.y - expect.y})`);
      check(`${P}.x`, `F7 over the map put Player_1's x at the world pixel under the cursor (read from RAM)`, got.x === expect.x, `engine ${got.x} want ${expect.x}`);
      check(`${P}.y`, `F7 over the map put Player_1's y at the world pixel under the cursor (read from RAM)`, got.y === expect.y, `engine ${got.y} want ${expect.y}`);
    }

    // THE TWO-POINT CONTROL: two landings, differing by exactly what was asked.
    const [a, b] = landed;
    check('AB', '[control] the two landings differ by exactly the distance between the two cursor points (a stuck value fails here)',
      b.got.x - a.got.x === b.expect.x - a.expect.x && b.got.y - a.got.y === b.expect.y - a.expect.y
        && b.got.x !== a.got.x && b.got.y !== a.got.y,
      `landed delta (${b.got.x - a.got.x},${b.got.y - a.got.y}) asked (${b.expect.x - a.expect.x},${b.expect.y - a.expect.y})`);
  } finally {
    try { observer?.disconnect(); } catch { /* gone */ }
    try { c?.close(); } catch { /* gone */ }
    if (app) await killTree(app);
    if (emu) await killTree(emu, { reap: false });
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().then(() => {
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}).catch((e) => {
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed before the abort`);
  console.error(`HARNESS ABORTED: ${e instanceof Aborted ? e.message : (e?.stack ?? e)}`);
  process.exit(2);
});
