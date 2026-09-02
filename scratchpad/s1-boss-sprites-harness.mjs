#!/usr/bin/env node
// DO THE S1 BOSSES OPEN AS SPRITE DOCS — LEVEL-FREE? (boss-sprites sweep)
//
// Sibling of s1-anim-harness.mjs (same scaffold: real VITE_AURORA_DEBUG=1 build
// under xvfb+CDP, real s1disasm, everything read back through window.__dbg /
// the DOM, never a loader's return value). No emulator — nothing here needs a
// running machine.
//
// The claim under test: the boss art rows are BASE-map, zone-free links
// (shared PLC_Boss/PLC_EggmanSBZ2/PLC_FZBoss bincludes), so a boss sprite doc
// opens with NO act loaded at all — the objectArtIsZoneFree path. Rows:
//   1  the app boots and opens s1disasm as a classic project WITHOUT opening
//      any act (levelState stays un-ready — the level-free premise)
//   2  GHZ boss ($3D, Nem_Eggman + Map_Eggman) checks out LEVEL-FREE:
//      doc:sprite:s1:61, exactly 13 frames (HAND-DERIVED from Map_Eggman's 13
//      mappingsTableEntry rows: .ship, .facenormal1/2, .facelaugh1/2,
//      .facehit, .facepanic, .facedefeat, .flame1/2, .blank, .escapeflame1/2),
//      and _anim/Eggman.asm arrives: 12 anims in table order with ship
//      (1 step, frame 0, dur 15) pre-loaded — and the level is STILL not open
//   3  Eggman's SBZ2 base ($82, Nem_Sbz2Eggman + Map_SEgg) also opens
//      level-free: doc:sprite:s1:130, 11 frames (HAND-DERIVED: .stand, .laugh1,
//      .laugh2, .jump1, .jump2, .surprise, .starjump, .running1, .running2,
//      .intube, .cockpit), 7 anims (Ani_SEgg), stand = frame 0 dur 126
//   4  ANTI-VACUOUS control: a ZONE-scoped id (Crabmeat $1F, ghz-only) must
//      REFUSE the level-free open — editObjectArt resolves false and the
//      checked-out doc stays $82's. Proves rows 2/3 passed because the
//      zone-free classification does work, not because anything opens.
//   5  Boss Wrecking Ball ($48) shows the BALL (owner finding 2026-08-20): the
//      doc is doc:sprite:s1:72 with exactly 4 frames (HAND-DERIVED from
//      _maps/GHZ Ball.asm's mappingsTable: .shiny, .check1, .check2, .check3 —
//      the giant ball Obj48 swings, Map_GBall @ Nem_Ball "artnem/GHZ Giant
//      Ball.nem", _incObj/3D,48:479-480), on a 48x48 canvas (piece union
//      -$18..$18 both axes), and EVERY frame draws a substantial ball:
//      >=800 nonzero pixels of the 2304 (a 24px-radius disc is ~1810).
//      An empty canvas (coverage 0) FAILS — anti-vacuous by construction.
//   6  Eggman's exhaust tail frames are NONBLANK: $3D's doc frames 11/12
//      (.escapeflame1/2 — tiles $12A+ = Nem_Exhaust "artnem/Boss - Exhaust
//      Flame.nem" at ArtTile_Eggman+$12A, _Constants.asm:584) each draw
//      >=100 nonzero pixels; frame 8 (.flame1, tile $2D inside Nem_Eggman)
//      stays nonblank; and frame 10 (.blank, ZERO spritePiece rows in the
//      source) is EXACTLY 0 — the control that proves coverage can fail.
//
// A STALE dist/ MAKES EVERY ROW VACUOUS — same guard as s1-anim-harness.mjs:
// refuse to run when any source file is newer than the built main bundle.
//
// Usage: node scratchpad/s1-boss-sprites-harness.mjs   (VERBOSE=1 for app logs)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9387);
const ROOT = AURORA_DIR;   // this worktree
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = join(ROOT, 'scratchpad/shots-s1-boss');
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  return { ready, send, evalExpr, json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)), close: () => ws.close() };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}

// HAND-TRANSCRIBED from /home/volence/sonic_hacks/s1disasm/_anim/Eggman.asm —
// the 12 dc.w table rows in order; per-anim duration is the script's first
// dc.b byte. NEVER derived from the parser under test.
const ANI_EGGMAN_NAMES = [
  'ship', 'facenormal1', 'facenormal2', 'facenormal3', 'facelaugh', 'facehit',
  'facepanic', 'blank', 'flame1', 'flame2', 'facedefeat', 'escapeflame',
];

async function main() {
  // --- Stale-dist guard (see header) ---------------------------------------
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  if (!existsSync(join(S1DIR, 'artnem/Boss - Main.nem'))) throw new Error(`${S1DIR}/artnem/Boss - Main.nem missing — nothing to test`);

  let app = null, c = null;
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3500);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // --- Row 1: open s1disasm, but NO act — the level-free premise ----------
    // Fire-and-poll rather than awaiting the store promise: the open triggers
    // enough renderer churn that CDP can garbage-collect the awaited promise
    // ("Promise was collected") — projStatus is the readback that matters.
    await c.evalExpr(`void window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = { zones: 0 };
    for (let i = 0; i < 30 && !(proj.zones > 0); i++) {
      await sleep(500);
      proj = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    }
    // Opening the project auto-opens the first act (GHZ1). The level-free
    // scenario under test is a sprite tab with NO act loaded (session restore /
    // "Edit art…" before any level) — so drop the level doc the same way a
    // restored session starts: no ref, no doc. The rows below then prove the
    // checkout works from NOTHING and never re-opens an act behind our back.
    await sleep(1000);
    await c.evalExpr('window.__dbg.resetLevel()');
    await c.evalExpr('window.__dbg.resetAct()');
    await sleep(300);
    const lvl0 = await c.json('window.__dbg.levelState()');
    check('1', 'the app opened s1disasm as a classic project with NO act loaded',
      proj.zones > 0 && lvl0.status !== 'ready' && lvl0.zone === null,
      `proj=${JSON.stringify(proj)} level=${JSON.stringify(lvl0)}`);

    // --- Row 2: GHZ boss ($3D) checks out LEVEL-FREE ------------------------
    const opened = await c.evalExpr('window.__dbg.editObjectArt(0x3d)');
    await sleep(1500);
    const st = await c.json('window.__dbg.spriteState()');
    const lvl1 = await c.json('window.__dbg.levelState()');
    await shot(c, 'ghz-boss-doc');
    const namesOk = st.anims.length === 12 && st.anims.every((a, i) => a.name === ANI_EGGMAN_NAMES[i]);
    const shipOk = namesOk
      && st.anims[0].steps.length === 1
      && st.anims[0].steps[0].frameIndex === 0 && st.anims[0].steps[0].duration === 15
      && st.anims[4].steps.length === 2 // facelaugh: dc.b 4 / dc.b 3, 4
      && st.anims[4].steps.every((s, j) => s.frameIndex === 3 + j && s.duration === 4);
    const shipLoaded = st.steps.length === 1 && st.steps[0].frameIndex === 0 && st.steps[0].duration === 15;
    check('2', 'GHZ boss ($3D) opens level-free: doc:sprite:s1:61, 13 Map_Eggman frames, 12 Ani_Eggman anims, ship pre-loaded, still no act',
      opened === true && st.activeDocId === 'doc:sprite:s1:61' && st.frames === 13
      && shipOk && shipLoaded && lvl1.status !== 'ready',
      `opened=${opened} doc=${st.activeDocId} frames=${st.frames} anims=${st.anims.map((a) => `${a.name}(${a.steps.length})`).join(',')} steps0=${JSON.stringify(st.steps[0] ?? null)} level=${JSON.stringify(lvl1)}`);

    // --- Row 3: Eggman's SBZ2 base ($82) also opens level-free --------------
    const opened2 = await c.evalExpr('window.__dbg.editObjectArt(0x82)');
    await sleep(1500);
    const st2 = await c.json('window.__dbg.spriteState()');
    await shot(c, 'sbz2-eggman-doc');
    const standOk = st2.anims.length === 7
      && st2.anims[0].name === 'stand'
      && st2.anims[0].steps.length === 1
      && st2.anims[0].steps[0].frameIndex === 0 && st2.anims[0].steps[0].duration === 126;
    check('3', 'Eggman SBZ2 base ($82) opens level-free: doc:sprite:s1:130, 11 Map_SEgg frames, 7 Ani_SEgg anims, stand = frame 0 @126',
      opened2 === true && st2.activeDocId === 'doc:sprite:s1:130' && st2.frames === 11 && standOk,
      `opened=${opened2} doc=${st2.activeDocId} frames=${st2.frames} anims=${st2.anims.map((a) => `${a.name}(${a.steps.length})`).join(',')}`);

    // --- Row 4: anti-vacuous — a zone-scoped id REFUSES the level-free open -
    const opened3 = await c.evalExpr('window.__dbg.editObjectArt(0x1f)'); // Crabmeat: ghz-scoped, NOT zone-free
    await sleep(1200);
    const st3 = await c.json('window.__dbg.spriteState()');
    await shot(c, 'crabmeat-refused');
    check('4', 'Crabmeat ($1F, zone-scoped) refuses the level-free open — the checked-out doc stays $82\'s',
      opened3 === false && st3.activeDocId === 'doc:sprite:s1:130' && st3.frames === 11,
      `opened=${opened3} doc=${st3.activeDocId} frames=${st3.frames}`);

    // --- Row 5: Wrecking Ball ($48) shows the BALL ---------------------------
    const opened4 = await c.evalExpr('window.__dbg.editObjectArt(0x48)');
    await sleep(1500);
    const st4 = await c.json('window.__dbg.spriteState()');
    await shot(c, 'wrecking-ball-doc');
    const ballCov = st4.frameCoverage ?? [];
    const ballAllSolid = ballCov.length === 4 && ballCov.every((n) => n >= 800);
    check('5', 'Wrecking Ball ($48) opens as the GIANT BALL: doc:sprite:s1:72, 4 Map_GBall frames on a 48x48 canvas, every frame >=800 nonzero px',
      opened4 === true && st4.activeDocId === 'doc:sprite:s1:72' && st4.frames === 4
      && st4.frameW === 48 && st4.frameH === 48 && ballAllSolid,
      `opened=${opened4} doc=${st4.activeDocId} frames=${st4.frames} canvas=${st4.frameW}x${st4.frameH} coverage=${JSON.stringify(ballCov)}`);

    // --- Row 6: Eggman's exhaust tail frames are NONBLANK --------------------
    const opened5 = await c.evalExpr('window.__dbg.editObjectArt(0x3d)');
    await sleep(1500);
    const st5 = await c.json('window.__dbg.spriteState()');
    await shot(c, 'eggman-flame-frames');
    const cov = st5.frameCoverage ?? [];
    check('6', 'Eggman ($3D) tail frames draw: .escapeflame1/2 (11/12) >=100 px each, .flame1 (8) nonblank, .blank (10) EXACTLY 0',
      opened5 === true && st5.activeDocId === 'doc:sprite:s1:61' && st5.frames === 13
      && (cov[11] ?? 0) >= 100 && (cov[12] ?? 0) >= 100 && (cov[8] ?? 0) >= 50 && cov[10] === 0,
      `opened=${opened5} doc=${st5.activeDocId} frames=${st5.frames} cov[8]=${cov[8]} cov[10]=${cov[10]} cov[11]=${cov[11]} cov[12]=${cov[12]}`);
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* gone */ } }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
