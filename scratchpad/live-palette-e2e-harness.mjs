#!/usr/bin/env node
// DOES MOVING A SLIDER IN THE REAL APP RECOLOUR THE REAL GAME?
//
// `palette-push-harness.mjs` proved the CLIENT can do it. This proves the whole
// path: Electron renderer -> IPC -> main -> unix socket -> oracle-aether ->
// aeon's palette compose. Nothing between the artist's hand and the glass is
// stubbed.
//
// Two processes, two connections:
//   - the app under xvfb with CDP, driven like a person (click the Aether
//     badge, move a slider);
//   - an INDEPENDENT observer client on the same socket, reading
//     `Palette_Buffer` out of the running machine. The app's own client is not
//     asked whether it worked, because a component reporting on itself is not
//     evidence.
//
// ROW 5 IS THE CONTROL: line 0 is the character palette and Pal_Base excludes
// it, so a line-0 drag must move the EDITOR and leave the GAME alone. Without
// it, rows 3-4 would pass identically if the push ignored `line` entirely.
//
// Usage: node scratchpad/live-palette-e2e-harness.mjs   (VERBOSE=1 for logs)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import * as http from 'node:http';
import * as esbuild from 'esbuild';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9375);
const ROOT = AURORA_DIR;
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const SERVER = siblingPathOrUnresolved('oracle', 'target/release/oracle-aether');
const ROM = siblingPathOrUnresolved('aeon', 's4.bin');
const AEONDIR = siblingPathOrUnresolved('aeon');
const SOCK = join(tmpdir(), `aur-e2e-${process.pid}.sock`);
const SHOTS = join(ROOT, 'scratchpad/shots-live-palette');
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}

function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const list = await getJSON('/json/list');
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text}`);
    return r.result.value;
  };
  return { ready, send, evalExpr, json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)), close: () => ws.close() };
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), 'aurora-e2e-'));
  let emu = null, app = null, c = null, observer = null;
  try {
    // --- the emulator, and an OBSERVER client that is not the app's ---------
    const { AetherClient } = await import(await (async () => {
      const out = join(workDir, 'client.mjs');
      await esbuild.build({
        entryPoints: [join(ROOT, 'src/main/aether/client.ts')],
        bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
      });
      return out;
    })());

    emu = spawn(SERVER, [ROM], {
      env: { ...process.env, ORACLE_SOCKET: SOCK }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let elog = '';
    emu.stdout.on('data', (d) => { elog += d; if (process.env.VERBOSE) process.stdout.write(`[emu] ${d}`); });
    emu.stderr.on('data', (d) => { elog += d; if (process.env.VERBOSE) process.stderr.write(`[emu!] ${d}`); });
    for (let i = 0; i < 60 && !elog.includes('listening on'); i++) await sleep(200);
    check('setup-1', 'the emulator is serving', elog.includes('listening on'), SOCK);

    observer = new AetherClient({ connect: () => net.connect(SOCK), socketPath: SOCK });
    await observer.connect();
    const paletteBuffer = await observer.resolve('Palette_Buffer');
    await observer.call('emulator/pause', {});
    await observer.call('emulator/run_frames', { frames: 400 });
    const composed = async (line) => {
      const r = await observer.call('emulator/read_memory', {
        addr: '0x' + (paletteBuffer + line * 32).toString(16).toUpperCase(), len: 32,
      });
      return Buffer.from(r.bytes.replace(/^0x/i, ''), 'hex');
    };

    // --- the app -----------------------------------------------------------
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ORACLE_SOCKET: SOCK };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    for (let i = 0; i < 40; i++) {
      const st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st?.open) break;
      await sleep(400);
    }
    check('setup-2', 'the aeon project is open in the app',
      (await c.json('window.__dbg.aeon.state()')).open === true);

    // --- Row 1: connect by CLICKING the badge, like a person ---------------
    const clicked = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /Aether/.test(e.textContent || ''));
      if (!b) return 'no-badge'; b.click(); return 'clicked';
    })()`);
    await sleep(2500);
    const st = await c.json('window.__dbg ? (window.__aether ?? null) : null').catch(() => null);
    const badgeText = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /Aether/.test(e.textContent || ''));
      return b ? b.textContent.replace(/\\s+/g, ' ').trim() : null;
    })()`);
    check('1', 'clicking the Aether badge connects, and the badge says so',
      clicked === 'clicked' && /connected/i.test(badgeText ?? ''), `badge="${badgeText}" (${clicked})`);
    await shot(c, 'connected');

    // --- Row 2: the IPC -> main -> socket path, driven at its seam ---------
    const LINE = 2;
    const before = await composed(LINE);
    const words = Array.from({ length: 16 }, (_, i) => ((i * 0x111) & 0x0eee));
    const expected = Buffer.alloc(32);
    words.forEach((w, i) => { expected[i * 2] = (w >> 8) & 0xff; expected[i * 2 + 1] = w & 0xff; });

    check('2', 'the app reports the link up and live palette available',
      (await c.json('window.__dbg.aether.state()')).status === 'connected'
      && (await c.json('window.__dbg.aether.state()')).palette === true,
      JSON.stringify(await c.json('window.__dbg.aether.state()')));

    await c.evalExpr(`window.__dbg.aether.push(${LINE}, ${JSON.stringify(words)})`);
    await sleep(900);                                   // clear the store's throttle
    await observer.call('emulator/run_frames', { frames: 4 });
    const after = await composed(LINE);
    check('3', 'the pushed line reached the running game',
      after.equals(expected),
      `before=${before.subarray(0, 8).toString('hex')} after=${after.subarray(0, 8).toString('hex')} want=${expected.subarray(0, 8).toString('hex')}`);

    // --- Row 4: THE CONTROL. Line 0 must never reach the game -------------
    // Pal_Base covers lines 1-3; line 0 is the character palette. Without this
    // row, row 3 would pass identically if the push ignored `line` entirely.
    const zeroBefore = await composed(0);
    const zeroWords = Array.from({ length: 16 }, () => 0x0e0e);
    await c.evalExpr(`window.__dbg.aether.push(0, ${JSON.stringify(zeroWords)})`);
    await sleep(900);
    await observer.call('emulator/run_frames', { frames: 4 });
    const zeroAfter = await composed(0);
    check('4', 'a line-0 push is refused and the game keeps the character palette',
      zeroAfter.equals(zeroBefore),
      `line0 before=${zeroBefore.subarray(0, 8).toString('hex')} after=${zeroAfter.subarray(0, 8).toString('hex')}`);

    // ...and line 2 is still what row 3 put there, so row 4 did not simply
    // fail to write anything at all.
    check('5', 'line 2 still holds the row-3 push (the control did not break pushing)',
      (await composed(LINE)).equals(expected));

    // --- Row 6: a REAL slider drag in the real UI -------------------------
    // The rows above drive the seam under the UI. This one moves the actual
    // control an artist moves, so the port -> store -> IPC wiring is exercised
    // rather than assumed.
    await c.evalExpr(`(() => {
      const pills = [...document.querySelectorAll('button')];
      const p = pills.find((e) => e.textContent.trim() === 'Palette');
      if (p) p.click(); return !!p;
    })()`);
    await sleep(1500);
    // A swatch must be SELECTED before the RGB sliders mount — the grid shows
    // sliders for the selected entry, not one set per swatch. Pick line 2
    // index 5, which is inside Pal_Base and not the transparent index.
    const picked = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('button')]
        .find((e) => /^line 2, index 5 —/.test(e.title || ''));
      if (!b) return 'no-swatch'; b.click(); return 'picked';
    })()`);
    await sleep(900);
    const sliderDriven = await c.evalExpr(`(() => {
      const ranges = [...document.querySelectorAll('input[type=range]')];
      if (!ranges.length) return 'no-sliders';
      const el = ranges[0];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const max = Number(el.max || 7);
      setter.call(el, String(el.value === String(max) ? max - 1 : max));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'moved';
    })()`);
    await sleep(1200);
    await observer.call('emulator/run_frames', { frames: 4 });
    const pushErr = (await c.json('window.__dbg.aether.state()')).pushError ?? null;
    check('6', 'moving a real palette slider pushes without error',
      picked === 'picked' && sliderDriven === 'moved' && pushErr === null,
      `swatch=${picked} slider=${sliderDriven} pushError=${pushErr}`);

    // ...and the game actually moved with it, so row 6 is not just "no error".
    await observer.call('emulator/run_frames', { frames: 4 });
    const afterSlider = await composed(LINE);
    check('7', 'and the game line changed as a result of the slider',
      !afterSlider.equals(expected),
      `was=${expected.subarray(8, 14).toString('hex')} now=${afterSlider.subarray(8, 14).toString('hex')}`);
    await shot(c, 'after-slider');

  } finally {
    try { observer?.disconnect(); } catch { /* */ }
    if (c) { try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* */ } await sleep(2000); try { c.close(); } catch { /* */ } }
    for (const p of [app, emu]) {
      if (!p) continue;
      try { process.kill(-p.pid, 'SIGTERM'); } catch { /* */ }
    }
    await sleep(500);
    for (const p of [app, emu]) { if (p) { try { process.kill(-p.pid, 'SIGKILL'); } catch { /* */ } } }
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
    try { rmSync(SOCK, { force: true }); } catch { /* */ }
    try { rmSync(workDir, { recursive: true, force: true }); } catch { /* */ }
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) process.exit(1);
}

async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, 'base64'));
  } catch { /* */ }
}

main().catch((e) => { console.error(e); process.exit(1); });
