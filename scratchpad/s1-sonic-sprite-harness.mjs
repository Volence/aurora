#!/usr/bin/env node
// S1 SONIC SPRITE (Parcel A) + spring frame swap + Boss Items doorway — the
// real app under CDP. Sibling of s1-library-presentation-harness.mjs (same
// scaffold: VITE_AURORA_DEBUG=1 build under xvfb+CDP, real s1disasm,
// everything read back through window.__dbg / the DOM).
//
//   1  boot, open s1disasm, GHZ1 ready
//   2  LEVEL-FREE OPEN: with the level store reset to IDLE, Edit-art on $01
//      still checks Sonic's doc out (zone-free base row) — 88 frames
//   3  HONEST RENDER: frame 1 (MS_Stand) draws substantially (coverage>400 —
//      anti-vacuous, a recognizable sprite not a stray pixel); frame 0
//      (MS_Null) is genuinely blank; the timeline/picker are EMPTY (the
//      sonani dialect stays unparsed — no fake anims)
//   4  VENUE: the sprite list files Sonic under "Shared objects" (not "GHZ
//      objects"), and the Boss Items named doc row sits there too
//   5  SPRING SWAP: the $41 doc's frame 4 hashes 358b89d8 — the Nem_VSpring
//      render measured+hand-derived in s1-open-refusal.test.ts — and NOT the
//      old horizontal-pool 01af9749; frame 1 keeps 7e380bb1 (untouched range)
//   6  BOSS ITEMS DOORWAY: clicking its row opens doc:sprite:s1:bossitems —
//      8 Map_BossItems frames, the chain anchor lead frame nonblank
//
// A STALE dist/ MAKES EVERY ROW VACUOUS — same guard as the siblings: refuse
// to run when any source file is newer than the built main bundle.
//
// Usage: node scratchpad/s1-sonic-sprite-harness.mjs   (VERBOSE=1 for app logs)

import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9393);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));   // this worktree
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const SHOTS = join(ROOT, 'scratchpad/shots-s1-sonic');
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
async function mouse(c, type, x, y, opts = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: opts.button ?? 'left',
    buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1,
  });
}
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; e.scrollIntoView({block:'center'}); const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  if (!r) return false;
  await mouse(c, 'mousePressed', r.x, r.y);
  await sleep(40);
  await mouse(c, 'mouseReleased', r.x, r.y, { buttons: 0 });
  await sleep(300);
  return true;
}

// Same row scan as the library harness: sprite-mode object rows carry stable
// "…art + mappings" / "currently open" titles; the section header is the
// list's grandparent's first child (CollapsibleSection root = [header, …]).
const SPRITE_ROW_SCAN = `(() => {
  const rows = [...document.querySelectorAll('button')]
    .filter((b) => (b.title || '').includes('art + mappings') || (b.title || '').includes('currently open'));
  return rows.map((b) => {
    let sect = b.parentElement; // the list div
    const root = sect ? sect.parentElement : null;
    const header = root && root.firstElementChild ? root.firstElementChild.textContent.replace(/\\s+/g, ' ').trim() : '';
    return { text: b.textContent.replace(/\\s+/g, ' ').trim(), title: b.title, header };
  });
})()`;

async function main() {
  // --- Stale-dist guard (see header) ---------------------------------------
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  if (!existsSync(join(S1DIR, 'artunc/Sonic.unc'))) throw new Error(`${S1DIR}/artunc/Sonic.unc missing — nothing to test`);

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

    // --- Row 1: open s1disasm; GHZ1 auto-opens ------------------------------
    await c.evalExpr(`void window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    let proj = { zones: 0 };
    for (let i = 0; i < 30 && !(proj.zones > 0); i++) {
      await sleep(500);
      proj = await c.json('window.__dbg.projStatus()').catch(() => ({ zones: 0 }));
    }
    let lvl = { status: 'idle' };
    for (let i = 0; i < 30 && lvl.status !== 'ready'; i++) {
      await sleep(500);
      lvl = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
    }
    check('1', 'the app opened s1disasm and GHZ1 is ready',
      proj.zones > 0 && lvl.status === 'ready' && lvl.zone === 'ghz',
      `proj=${JSON.stringify(proj)} level=${JSON.stringify(lvl)}`);

    // --- Row 2: LEVEL-FREE Sonic open ---------------------------------------
    // Reset the level store to IDLE first: the checkout then has no act to
    // lean on, so a successful open proves the zone-free base-row path (the
    // audit's §4.4 exemption), not act-derived resolution.
    await c.evalExpr('window.__dbg.resetLevel()');
    await sleep(300);
    const lvlDown = await c.json('window.__dbg.levelState()');
    const sonicOpened = await c.evalExpr('window.__dbg.editObjectArt(0x01)');
    await sleep(2500);
    const sSonic = await c.json('window.__dbg.spriteState()');
    const lvlStillDown = await c.json('window.__dbg.levelState()');
    await shot(c, 'sonic-doc');
    check('2', 'LEVEL-FREE: with the level store idle, $01 checks out Sonic\'s doc — 88 frames',
      lvlDown.status !== 'ready' && sonicOpened === true && lvlStillDown.status !== 'ready'
      && sSonic.activeDocId === 'doc:sprite:s1:1' && sSonic.frames === 88,
      `levelBefore=${lvlDown.status} opened=${sonicOpened} levelAfter=${lvlStillDown.status} doc=${sSonic.activeDocId} frames=${sSonic.frames}`);

    // --- Row 3: honest render + honest empty timeline -----------------------
    check('3', 'frame 1 (MS_Stand) renders substantially; frame 0 (MS_Null) blank; NO anim entries (sonani stays unparsed)',
      sSonic.frameCoverage[1] > 400 && sSonic.frameCoverage[0] === 0
      && sSonic.anims.length === 0 && sSonic.steps.length === 0,
      `coverage[0..2]=${JSON.stringify(sSonic.frameCoverage.slice(0, 3))} anims=${sSonic.anims.length} steps=${sSonic.steps.length}`);

    // --- Setup for the venue scan: a level (the sprite list is zone-aware),
    // then sprite mode frontmost via the spring doc it also tests -------------
    await c.evalExpr("void window.__dbg.activate('ghz', 1)");
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      const l = await c.json('window.__dbg.levelState()').catch(() => ({ status: 'idle' }));
      if (l.status === 'ready') break;
    }
    await c.evalExpr('window.__dbg.editObjectArt(0x41)');
    await sleep(2000);

    // --- Row 4: Sonic + Boss Items under "Shared objects" -------------------
    const rows = await c.json(SPRITE_ROW_SCAN);
    await shot(c, 'sprite-list');
    const sonicRow = rows.find((r) => r.text.includes('Sonic'));
    const bossItemsRow = rows.find((r) => r.text.includes('Boss Items'));
    check('4', 'the sprite list files Sonic AND the Boss Items named doc under "Shared objects"',
      sonicRow?.header === 'Shared objects' && bossItemsRow?.header === 'Shared objects',
      `sonic=${JSON.stringify(sonicRow ?? null)} bossItems=${JSON.stringify(bossItemsRow ?? null)}`);

    // --- Row 5: the spring doc's per-frame art swap, by pixel hash ----------
    const sSpring = await c.json('window.__dbg.spriteState()');
    await shot(c, 'spring-doc');
    check('5', 'spring doc: frame 4 hashes 358b89d8 (Nem_VSpring — the measured fixed render), NOT the old 01af9749; frame 1 stays 7e380bb1',
      sSpring.activeDocId === 'doc:sprite:s1:65' && sSpring.frames === 6
      && sSpring.frameHashes[4] === '358b89d8' && sSpring.frameHashes[4] !== '01af9749'
      && sSpring.frameHashes[1] === '7e380bb1',
      `doc=${sSpring.activeDocId} frames=${sSpring.frames} hashes[1,4]=${JSON.stringify([sSpring.frameHashes?.[1], sSpring.frameHashes?.[4]])}`);

    // --- Row 6: the Boss Items doorway opens --------------------------------
    const clicked = await clickEl(c, `[...document.querySelectorAll('button')].find((b) => (b.title || '').startsWith("Open Boss Items"))`);
    await sleep(2000);
    const sBoss = await c.json('window.__dbg.spriteState()');
    await shot(c, 'bossitems-doc');
    check('6', 'clicking Boss Items opens doc:sprite:s1:bossitems — 8 Map_BossItems frames, the chain-anchor lead nonblank',
      clicked && sBoss.activeDocId === 'doc:sprite:s1:bossitems' && sBoss.frames === 8
      && sBoss.frameCoverage[0] > 0,
      `clicked=${clicked} doc=${sBoss.activeDocId} frames=${sBoss.frames} coverage[0]=${sBoss.frameCoverage?.[0]}`);
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGKILL'); } catch { /* gone */ } }
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
