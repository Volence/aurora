#!/usr/bin/env node
// DOES THE ANIMATED-ART PLAY TOGGLE ANIMATE THE RIGHT CELLS IN THE RUNNING APP?
//
// The unit tests prove the clock's sequences and the flip-exact placement
// rasterizer. Neither proves the toggle in the REAL View menu drives the REAL
// viewport overlay — or that toggling off restores the exact never-played
// pixels. So this drives the built app under xvfb over CDP, flips 'Play
// animated art' through the actual menu, and reads pixels at world coordinates
// measured OFFLINE from the real s1disasm data with the feature's own core
// (scratchpad/probe-anim-coords.mts — coordinates below are its output, never
// guessed):
//
//   GHZ act 1 (FG): waterfall cell of chunk $2b at layout(10,3) cell 68 —
//     sample (2634,836): frame 0 = void [10,12,18], frame 1 = [109,146,255].
//     Control: non-animated cell 0 of the same chunk, (2571,780) = [73,182,0].
//   SBZ act 1 (BG): smoke cell of chunk $34 at layout(0,0) cell 95 —
//     sample (248,93): resting/blank = void, puff-1 state 4 (t=212) =
//     [182,146,0]. The probe verified resting == never-played for the WHOLE
//     cell.
//
// DETERMINISM: the play clock derives its game frame from performance.now().
// The harness FREEZES performance.now() before toggling play on and advances
// it manually (window.__adv), so every sample lands on an exact clock frame:
//   GHZ: S0 at t=0, S1 at t=6 (waterfall stepped), S2 at t=12 (one FULL cycle
//   from S0). Anti-vacuous both ways: S0≠S1 AND S2==S0.
//   SBZ: t=0 (resting == static), t=212 (smoke visibly ON — proves the blank
//   assertions aren't sampling a dead pixel), t=300 (mid 3s blank gap ==
//   static again).
//
// Launch/teardown + stale-dist guard lifted from priority-lens-harness.mjs
// (a stale bundle once passed 19/19 against a planted defect).

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9403);
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const SHOTS = `${ROOT}/scratchpad/shots-anim`;
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
  console.log(`        shot → scratchpad/shots-anim/${name}.png`);
}

const CANVAS = `[...document.querySelectorAll('canvas')].sort((a,b) => b.width*b.height - a.width*a.height)[0]`;

async function samplePx(c, lx, ly) {
  return c.json(`(() => {
    const view = window.__dbg.view();
    const el = ${CANVAS};
    const cx = Math.round((${lx} - view.x) * view.zoom);
    const cy = Math.round((${ly} - view.y) * view.zoom);
    if (cx < 0 || cy < 0 || cx >= el.width || cy >= el.height) {
      throw new Error('sample (' + cx + ',' + cy + ') outside canvas ' + el.width + 'x' + el.height);
    }
    return [...el.getContext('2d').getImageData(cx, cy, 1, 1).data];
  })()`);
}

const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const px = (p) => `[${p.join(',')}]`;

// Matches the toggle across its rename ('Play animated art' → 'Play animations'
// when the object-preview half landed on the same toggle).
const PLAY_LABEL = `[...document.querySelectorAll('label')].find((l) => l.textContent.includes('Play anim'))`;

async function togglePlay(c) {
  const opened = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('View'))`);
  if (!opened) throw new Error('View menu button not found');
  const clicked = await clickEl(c, PLAY_LABEL);
  if (!clicked) throw new Error("'Play animated art' entry not in the open View menu");
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

// Probe-measured coordinates (see header).
const WF = { x: 2634, y: 836 };
const WF_FRAME1 = [109, 146, 255];
const CTRL = { x: 2571, y: 780 };
const CTRL_COLOR = [73, 182, 0];
const SMOKE = { x: 248, y: 93 };
const SMOKE_ON = [182, 146, 0];
// MZ act 1 (FG): magma cell of chunk $b at layout(6,1) cell 232 — 16 animated
// cells in that chunk; static color [255,255,0]. Run UNFROZEN: this is the
// heaviest zone (30 Hz magma), so it doubles as the frame-cost measurement.
const MAGMA = { x: 1672, y: 480 };

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
  const child = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
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
    // A mid-load page destroys eval contexts ("Promise was collected"), so
    // every startup eval retries until the context holds still.
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

    // --- GHZ act 1: the waterfall over a full cycle -------------------------
    const ghz = await openActReady(c, 'ghz', 1);
    check('1', 'GHZ act 1 loads', ghz.status === 'ready', JSON.stringify(ghz));
    await sleep(1200);
    await c.evalExpr('window.__dbg.setView(2500, 700, 2)');
    await sleep(900);

    const wfOff = await samplePx(c, WF.x, WF.y);
    const ctrlOff = await samplePx(c, CTRL.x, CTRL.y);
    // Trap-1 sentinel (audit §2.3): the DOC's waterfall slot tile, hashed
    // before and after the play session. Any playback that leaked into doc.tiles
    // would move this hash and poison the save path.
    const docHashBefore = await c.evalExpr('window.__dbg.classic.tileHash(0x378)');
    check('2', 'the control cell reads its probe-measured color before play',
      eq(ctrlOff.slice(0, 3), CTRL_COLOR), `ctrl=${px(ctrlOff)} expected rgb ${px(CTRL_COLOR)}`);
    await shot(c, 'ghz-play-off');

    await c.evalExpr(FREEZE);
    const on = await togglePlay(c);
    check('3', "the REAL View menu lists 'Play animated art' and the toggle checks it", on === true);
    await sleep(1000); // sources load (IPC) + first overlay paint at t=0

    const s0 = await samplePx(c, WF.x, WF.y);
    check('4', 'play frame 0 is pixel-identical to the static render (frame-0 blit)',
      eq(s0, wfOff), `t0=${px(s0)} static=${px(wfOff)}`);

    await advanceTo(c, 0, 6.5);
    const s1 = await samplePx(c, WF.x, WF.y);
    await shot(c, 'ghz-play-t6');
    check('5', 'the waterfall cell CHANGES at t=6 (frame 1)',
      !eq(s1, s0), `t6=${px(s1)} t0=${px(s0)}`);
    check('6', 'and t=6 shows the probe-predicted frame-1 color',
      eq(s1.slice(0, 3), WF_FRAME1), `t6=${px(s1)} expected rgb ${px(WF_FRAME1)}`);

    await advanceTo(c, 6.5, 12.5);
    const s2 = await samplePx(c, WF.x, WF.y);
    check('7', 'one FULL cycle apart (t=12) the cell is pixel-identical to t=0 again',
      eq(s2, s0) && !eq(s2, s1), `t12=${px(s2)} t0=${px(s0)} t6=${px(s1)}`);

    const ctrlDuring = await samplePx(c, CTRL.x, CTRL.y);
    check('8', 'the non-animated CONTROL cell never changed during play',
      eq(ctrlDuring, ctrlOff), `during=${px(ctrlDuring)} before=${px(ctrlOff)}`);

    const perf = await c.json('window.__auroraAnimArtPerf ?? null');
    console.log(`        overlay pass cost: ${perf ? `${perf.draws} draws, avg ${(perf.sumMs / perf.draws).toFixed(2)}ms, max ${perf.maxMs.toFixed(2)}ms` : 'n/a'}`);

    const offAgain = await togglePlay(c);
    await sleep(400);
    const wfAfter = await samplePx(c, WF.x, WF.y);
    const ctrlAfter = await samplePx(c, CTRL.x, CTRL.y);
    check('9', 'toggle off: waterfall cell is static and identical to the never-played render',
      offAgain === false && eq(wfAfter, wfOff) && eq(ctrlAfter, ctrlOff),
      `after=${px(wfAfter)} never-played=${px(wfOff)}`);
    const docHashAfter = await c.evalExpr('window.__dbg.classic.tileHash(0x378)');
    check('9b', 'doc.tiles was NEVER touched by playback (waterfall slot hash unchanged)',
      JSON.stringify(docHashBefore) === JSON.stringify(docHashAfter),
      `before=${JSON.stringify(docHashBefore)} after=${JSON.stringify(docHashAfter)}`);
    await c.evalExpr(UNFREEZE);

    // --- SBZ act 1 (BG plane): the smoke's long blank phases ----------------
    const sbz = await openActReady(c, 'sbz', 1);
    check('10', 'SBZ act 1 loads', sbz.status === 'ready', JSON.stringify(sbz));
    await sleep(1200);
    // The smoke families live on the BG plane — switch with the real chip.
    const bgClicked = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'BG')`);
    if (!bgClicked) { await c.evalExpr(`window.__dbg.aeon.setLayer('bg')`); }
    await sleep(600);
    await c.evalExpr('window.__dbg.setView(0, 0, 2)');
    await sleep(900);

    const smokeOff = await samplePx(c, SMOKE.x, SMOKE.y);
    await c.evalExpr(FREEZE);
    const on2 = await togglePlay(c);
    await sleep(1000);
    const sm0 = await samplePx(c, SMOKE.x, SMOKE.y);
    check('11', 'SBZ resting state (t=0, blank) matches today\'s static render exactly',
      on2 === true && eq(sm0, smokeOff), `t0=${px(sm0)} static=${px(smokeOff)}`);

    await advanceTo(c, 0, 212.5);
    const smOn = await samplePx(c, SMOKE.x, SMOKE.y);
    await shot(c, 'sbz-smoke-on');
    check('12', 'the puff is visibly ON mid-cycle (t=212, state 4) — the blank rows are not a dead pixel',
      !eq(smOn, sm0) && eq(smOn.slice(0, 3), SMOKE_ON), `t212=${px(smOn)} expected rgb ${px(SMOKE_ON)}`);

    await advanceTo(c, 212.5, 300.5);
    const smBlank = await samplePx(c, SMOKE.x, SMOKE.y);
    check('13', 'the 3s inter-puff blank phase (t=300) rests at the static pixels again',
      eq(smBlank, smokeOff), `t300=${px(smBlank)} static=${px(smokeOff)}`);

    const off2 = await togglePlay(c);
    await sleep(400);
    const smAfter = await samplePx(c, SMOKE.x, SMOKE.y);
    check('14', 'toggle off in SBZ restores the never-played render',
      off2 === false && eq(smAfter, smokeOff), `after=${px(smAfter)}`);
    await c.evalExpr(UNFREEZE);

    // --- MZ act 1 (FG, REAL clock): magma moves + the honest frame cost -----
    const mz = await openActReady(c, 'mz', 1);
    check('15', 'MZ act 1 loads', mz.status === 'ready', JSON.stringify(mz));
    await sleep(1200);
    // Back to FG (SBZ left the plane on BG).
    const fgClicked = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'FG')`);
    if (!fgClicked) { await c.evalExpr(`window.__dbg.aeon.setLayer('fg')`); }
    await sleep(600);
    await c.evalExpr('window.__dbg.setView(1500, 300, 2)');
    await sleep(900);

    const magmaOff = await samplePx(c, MAGMA.x, MAGMA.y);
    const perfBefore = await c.json('window.__auroraAnimArtPerf ?? {draws:0,sumMs:0,maxMs:0}');
    const on3 = await togglePlay(c);
    await sleep(3000); // free-running 30 Hz magma for 3 s
    let moved = false;
    let a = await samplePx(c, MAGMA.x, MAGMA.y);
    for (let i = 0; i < 6 && !moved; i++) {
      await sleep(500);
      const b = await samplePx(c, MAGMA.x, MAGMA.y);
      if (!eq(a, b)) moved = true;
      a = b;
    }
    await shot(c, 'mz-magma-play');
    check('16', 'the magma scrolls under the REAL clock (samples 500ms apart differ)',
      on3 === true && moved);
    const perfAfter = await c.json('window.__auroraAnimArtPerf ?? {draws:0,sumMs:0,maxMs:0}');
    const dDraws = perfAfter.draws - perfBefore.draws;
    const dSum = perfAfter.sumMs - perfBefore.sumMs;
    console.log(`        MZ overlay pass (real clock): ${dDraws} draws in ~6.5s, avg ${(dSum / Math.max(1, dDraws)).toFixed(2)}ms, max ${perfAfter.maxMs.toFixed(2)}ms`);
    check('17', 'the overlay pass holds frame budget in the heaviest zone (avg < 8ms)',
      dDraws > 0 && dSum / dDraws < 8, `avg ${(dSum / Math.max(1, dDraws)).toFixed(2)}ms over ${dDraws} draws`);

    const off3 = await togglePlay(c);
    await sleep(400);
    const magmaAfter = await samplePx(c, MAGMA.x, MAGMA.y);
    check('18', 'toggle off in MZ restores the never-played render',
      off3 === false && eq(magmaAfter, magmaOff), `after=${px(magmaAfter)} static=${px(magmaOff)}`);
  } finally {
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* */ }
      await sleep(2500);
      try { c.close(); } catch { /* */ }
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    try { execSync(`pkill -f '${ROOT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/dist/main/inde[x].mjs' 2>/dev/null; true`, { shell: '/bin/bash' }); } catch { /* */ }
    await sleep(1000);
    console.log(`\nport free after teardown: ${await portFree()}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
