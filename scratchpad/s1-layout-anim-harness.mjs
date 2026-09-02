#!/usr/bin/env node
// DO PLACED OBJECTS ANIMATE IN THE RUNNING APP — WITHOUT TOUCHING THE DOC?
//
// Parcel 2 of the S1 animation line: the unit suite proves the preview clock's
// frame selection (timeline duration+1 convention, sync phase-lock, curation
// integrity) — none of that proves the real View-menu toggle drives real ring
// pixels in the real viewport, or that playback never writes the document. So
// this drives the built app under xvfb over CDP (scaffold lifted from
// animated-art-harness.mjs — same launch/teardown, stale-dist guard, frozen
// performance.now clock):
//
//   • GHZ act 1, view centred on a REAL Ring placement (found via
//     __dbg.classic.listObjects(0x25), never hardcoded coordinates).
//   • Anti-vacuous: the ring strip must exist (__auroraObjAnim.keys carries
//     '37:sync:spin'), and the sampled ring patch must be NONBLANK (≥2 distinct
//     colors) before any change/freeze row is believed.
//   • The Sync2 spin: frame steps every 8 game frames (period derived in the
//     unit suite from the transcribed channel + the timeline conversion): the
//     patch CHANGES at t=8, changes again at t=16, and returns pixel-identical
//     at t=32 (one full 4-frame cycle).
//   • Phase-lock: a SECOND ring placement's patch is pixel-identical to the
//     first at every sampled tick (one shared channel, no per-object clocks).
//   • Pause: toggling play off freezes the preview — patches sampled 500ms
//     apart under the REAL clock are identical, and equal the never-played
//     static render.
//   • Doc untouched: __dbg.classic.docHash() (tiles+palettes+objects+start)
//     is identical before play, during play, and after.
//   • Cost: the real-clock section reports __auroraObjAnimPerf (per-pass ms of
//     the object-preview draw) over ~4s of free-running playback.

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9407);
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
// A git worktree checkout has no node_modules of its own — fall back to the
// main repo's electron binary (worktrees live under <repo>/.claude/worktrees/).
const ELECTRON = [
  `${ROOT}/node_modules/.bin/electron`,
  join(ROOT, '../../..', 'node_modules/.bin/electron'),
].find(existsSync);
if (!ELECTRON) throw new Error('electron binary not found (npm install?)');
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots-objanim`;
mkdirSync(SHOTS, { recursive: true });

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
  console.log(`        shot → scratchpad/shots-objanim/${name}.png`);
}

const CANVAS = `[...document.querySelectorAll('canvas')].sort((a,b) => b.width*b.height - a.width*a.height)[0]`;

/** Sample a w×h RGBA patch whose WORLD top-left is (lx, ly). */
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

const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
/** Distinct RGBA colors in a patch — the nonblank (anti-dead-pixel) gate. */
function distinctColors(patch) {
  const s = new Set();
  for (let i = 0; i < patch.length; i += 4) s.add(`${patch[i]},${patch[i + 1]},${patch[i + 2]}`);
  return s.size;
}

// The toggle was renamed 'Play animated art' → 'Play animations' when the
// object half landed on the same toggle; match the stable prefix.
const PLAY_LABEL = `[...document.querySelectorAll('label')].find((l) => l.textContent.includes('Play anim'))`;

async function togglePlay(c) {
  const opened = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('View'))`);
  if (!opened) throw new Error('View menu button not found');
  const clicked = await clickEl(c, PLAY_LABEL);
  if (!clicked) throw new Error("'Play animations' entry not in the open View menu");
  const checked = await c.evalExpr(`(${PLAY_LABEL}).querySelector('input').checked`);
  await mouse(c, 'mousePressed', 30, 500); await sleep(40);
  await mouse(c, 'mouseReleased', 30, 500, { buttons: 0 });
  await sleep(500);
  return checked;
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

// The ring strip's key: id 0x25 = 37 decimal, sync entry 'spin' (stripKeyFor).
const RING_STRIP = '37:sync:spin';
// 16x16 world patch centred on a ring anchor (the S1 ring frame is 16x16).
const RING_W = 16;

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS: refuse to run when any source file
  // is newer than the built main bundle.
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} \\( -name '*.ts' -o -name '*.tsx' \\) -print0 | xargs -0 stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }

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
    await sleep(1500); // static object sprites finish loading

    // Two DISTINCT ring placements close enough to share one screen at zoom 2
    // (the phase-lock row needs both on the canvas at once).
    const rings = await c.json('window.__dbg.classic.listObjects(0x25)');
    check('2', 'GHZ1 places at least two rings', rings.length >= 2, `${rings.length} ring groups`);
    // The viewport canvas is a pane, not the whole window — at zoom 2 it shows
    // roughly 430x370 world px, so the pair must sit well inside that.
    let ringA = rings[0], ringB = null;
    for (const a of rings) {
      const b = rings.find((r) => r !== a && Math.abs(r.x - a.x) < 280 && Math.abs(r.y - a.y) < 200
        && (r.x !== a.x || r.y !== a.y) && Math.abs(r.x - a.x) + Math.abs(r.y - a.y) > 40);
      if (b) { ringA = a; ringB = b; break; }
    }
    check('3', 'two rings share one screen', ringB !== null,
      ringB ? `A=(${ringA.x},${ringA.y}) B=(${ringB.x},${ringB.y})` : 'no close pair');
    if (!ringB) throw new Error('cannot continue without two on-screen rings');
    const viewX = Math.max(0, (ringA.x + ringB.x) / 2 - 200);
    const viewY = Math.max(0, (ringA.y + ringB.y) / 2 - 170);
    await c.evalExpr(`window.__dbg.setView(${viewX}, ${viewY}, 2)`);
    await sleep(900);

    const patchA = () => samplePatch(c, ringA.x - RING_W / 2, ringA.y - RING_W / 2, RING_W, RING_W);
    const patchB = () => samplePatch(c, ringB.x - RING_W / 2, ringB.y - RING_W / 2, RING_W, RING_W);

    const staticA = await patchA();
    const staticB = await patchB();
    check('4', 'the ring patch is NONBLANK before play (anti-dead-pixel gate)',
      distinctColors(staticA) >= 2 && distinctColors(staticB) >= 2,
      `A colors=${distinctColors(staticA)} B colors=${distinctColors(staticB)}`);
    const docBefore = await c.evalExpr('window.__dbg.classic.docHash()');
    await shot(c, 'ghz-rings-static');

    // --- play on, frozen clock ---------------------------------------------
    await c.evalExpr(FREEZE);
    const on = await togglePlay(c);
    check('5', "the View menu's play toggle checks on", on === true);
    // Strips load async (IPC + bitmaps) — wait for the diagnostics to publish.
    let diag = null;
    for (let i = 0; i < 30; i++) {
      diag = await c.json('window.__auroraObjAnim ?? null');
      if (diag && diag.strips > 0) break;
      await sleep(400);
    }
    check('6', 'object strips loaded, and the RING strip exists (anti-vacuous: the sampled object HAS an anim)',
      diag !== null && diag.keys.includes(RING_STRIP), JSON.stringify(diag));
    check('6b', 'a SCRIPT strip loaded too (a badnik locomotion anim, not just the sync channel)',
      diag !== null && diag.keys.some((k) => /:a\d+$/.test(k)), JSON.stringify(diag?.keys));
    await sleep(600);

    const s0 = await patchA();
    check('7', 'play frame 0 (t=0) is pixel-identical to the static render (Sync2 starts at frame 0)',
      eq(s0, staticA), `t0 vs static: ${eq(s0, staticA)}`);

    // Phase-lock reading: two DIFFERENT placements sit on different level art,
    // so their patches can never be compared pixel-for-pixel (a ring frame has
    // transparent holes). What the shared channel DOES pin is the step
    // boundaries: mid-hold NEITHER ring has stepped, on the boundary BOTH have,
    // and after one full cycle BOTH are back — per-object clocks would drift
    // these apart. (Exact frame equality is the unit suite's phase-lock row.)
    await advanceTo(c, 0, 4.5); // mid-hold: Sync2 period = 8 (derived in the unit suite)
    const m4 = await patchA();
    const m4b = await patchB();
    check('8', 'mid-hold (t=4) NEITHER ring has stepped', eq(m4, s0) && eq(m4b, staticB));

    await advanceTo(c, 4.5, 8.5);
    const s8 = await patchA();
    const s8b = await patchB();
    await shot(c, 'ghz-rings-t8');
    check('9', "the ring's rendered preview CHANGES frame at t=8", !eq(s8, s0));
    check('9b', 'phase-lock: the SECOND ring steps on the same tick', !eq(s8b, staticB));

    await advanceTo(c, 8.5, 16.5);
    const s16 = await patchA();
    check('10', 'and changes again at t=16 (frame 2)', !eq(s16, s8) && !eq(s16, s0));

    await advanceTo(c, 16.5, 32.5);
    const s32 = await patchA();
    const s32b = await patchB();
    check('11', 'one full 4-frame cycle later (t=32) the patch is pixel-identical to t=0 again',
      eq(s32, s0));
    check('12', 'phase-lock: the second ring is ALSO back at its t=0 pixels', eq(s32b, staticB));

    const docDuring = await c.evalExpr('window.__dbg.classic.docHash()');
    check('13', 'the document is UNTOUCHED during play (docHash: tiles+palettes+objects+start)',
      docDuring === docBefore, `before=${docBefore} during=${docDuring}`);

    // --- pause: toggle off freezes the preview -----------------------------
    await advanceTo(c, 32.5, 40.5); // park mid-cycle (frame 1) so pause ≠ frame 0 by luck
    const off = await togglePlay(c);
    await c.evalExpr(UNFREEZE);
    await sleep(400);
    const p1 = await patchA();
    await sleep(500);
    const p2 = await patchA();
    check('14', 'pause freezes the preview (REAL clock, samples 500ms apart identical)',
      off === false && eq(p1, p2));
    check('15', 'and the paused view is the never-played static render', eq(p1, staticA));

    const docAfter = await c.evalExpr('window.__dbg.classic.docHash()');
    check('16', 'the document is UNTOUCHED after the whole session', docAfter === docBefore,
      `before=${docBefore} after=${docAfter}`);

    // --- real clock: does it move on its own, and what does it cost? -------
    const perfBefore = await c.json('window.__auroraObjAnimPerf ?? {draws:0,sumMs:0,maxMs:0}');
    const on2 = await togglePlay(c);
    const runT0 = Date.now();
    await sleep(4000); // free-running playback over the whole visible act
    let moved = false;
    let a = await patchA();
    for (let i = 0; i < 6 && !moved; i++) {
      await sleep(220);
      const b = await patchA();
      if (!eq(a, b)) moved = true;
      a = b;
    }
    const uptimeMs = Date.now() - runT0;
    await shot(c, 'ghz-rings-real-clock');
    check('17', 'the ring spins under the REAL clock (samples 220ms apart differ)', on2 === true && moved);
    const perfAfter = await c.json('window.__auroraObjAnimPerf ?? {draws:0,sumMs:0,maxMs:0}');
    const dDraws = perfAfter.draws - perfBefore.draws;
    const dSum = perfAfter.sumMs - perfBefore.sumMs;
    console.log(`        object-preview pass: ${dDraws} draws over ${(uptimeMs / 1000).toFixed(1)}s uptime, `
      + `avg ${(dSum / Math.max(1, dDraws)).toFixed(2)}ms, max ${perfAfter.maxMs.toFixed(2)}ms`);
    check('18', 'the object-preview pass holds frame budget (avg < 8ms)',
      dDraws > 0 && dSum / dDraws < 8, `avg ${(dSum / Math.max(1, dDraws)).toFixed(2)}ms over ${dDraws} draws`);

    const off2 = await togglePlay(c);
    await sleep(400);
    const finalPatch = await patchA();
    check('19', 'toggle off restores the never-played static render',
      off2 === false && eq(finalPatch, staticA));
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
