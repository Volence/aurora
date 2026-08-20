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
//
// A STALE dist/ MAKES EVERY ROW VACUOUS — same guard as s1-anim-harness.mjs:
// refuse to run when any source file is newer than the built main bundle.
//
// Usage: node scratchpad/s1-boss-sprites-harness.mjs   (VERBOSE=1 for app logs)

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9387);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // this worktree
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
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
    app = spawn('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
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
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* gone */ } }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
