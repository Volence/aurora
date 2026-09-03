#!/usr/bin/env node
// S1 SONIC SPRITE (Parcel A) + spring frame swap + Boss Items doorway — the
// real app under CDP. Sibling of s1-library-presentation-harness.mjs (same
// scaffold: VITE_AURORA_DEBUG=1 build under xvfb+CDP, real s1disasm,
// everything read back through window.__dbg / the DOM).
//
//   1  boot, open s1disasm, GHZ1 ready
//   2  LEVEL-FREE OPEN: with the level store reset to IDLE, Edit-art on $01
//      still checks Sonic's doc out (zone-free base row) — 88 frames
//   3a HONEST RENDER: frame 1 (MS_Stand) draws substantially (coverage>400 —
//      anti-vacuous, a recognizable sprite not a stray pixel); frame 0
//      (MS_Null) is genuinely blank
//   3b HONEST TIMELINE: the anim picker holds exactly the entries the fixture's
//      own `Ani_Sonic` table declares, in table order.
//
//      ⚠ THIS ROW USED TO ASSERT THE OPPOSITE, AND THAT IS WHY IT WAS RED.
//      Until 2026-09-03 row 3 read `anims.length === 0 && steps.length === 0`
//      with the comment "the sonani dialect stays unparsed — no fake anims".
//      That was true when it was written and stopped being true at
//      `72921f62` (2026-08-21, "Sonic's timeline opens — sonani link
//      un-excluded, 31 anims, specials honest-dynamic"): the picker is
//      populated on purpose now. The row was asserting the ABSENCE of a
//      feature the product shipped, so it went red on the app getting better
//      and stayed red for thirteen days — nothing in `package.json` names this
//      file, so nothing re-ran it.
//
//      The replacement is NOT a relaxation. `31` is never typed here: the
//      expectation is READ OUT OF THE FIXTURE at run time (`id_*: sonani`
//      rows in `_anim/Sonic.asm`, which is exactly what
//      `core/import/sonic-anim-import.ts` names an entry after — `idLabel`
//      minus its `id_` prefix), and compared as an ordered list of NAMES, so
//      a parser that drops, reorders, invents or mis-labels an entry fails
//      naming it. A frozen count could not see any of those.
//
//      `steps` (the PLAYABLE timeline, a different field from the picker)
//      is still asserted empty on open, as its own row 3c — nothing
//      auto-selects an anim — so that claim fails by its own name instead of
//      as part of a three-way conjunction.
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

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9393);
const ROOT = AURORA_DIR;   // this worktree
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const S1DIR = siblingPathOrUnresolved('s1disasm');
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

/**
 * THE EXPECTATION FOR ROW 3b, DERIVED FROM THE FIXTURE — never a pin.
 *
 * `_anim/Sonic.asm` declares its animation table as one `id_<Name>: sonani
 * SonAni_<Name>` line per entry under `Ani_Sonic:`. `sonic-anim-import.ts`
 * walks those same rows in order and names each entry `idLabel.replace(/^id_/,
 * '')`, so this is the parser's input read independently, not a copy of its
 * output. Returns `null` when the file cannot be read or holds no table rows —
 * the caller REFUSES on that rather than comparing against an empty list, which
 * would make "the app parsed nothing" and "the fixture has nothing" the same
 * green.
 */
function fixtureSonicAnimNames(s1dir) {
  let text;
  try { text = readFileSync(join(s1dir, '_anim/Sonic.asm'), 'utf8'); }
  catch { return null; }
  const names = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^id_(\w+):\s*sonani\b/);
    if (m) names.push(m[1]);
  }
  return names.length ? names : null;
}

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS. Both halves of that question name
  // the tree the run is AGAINST, never the tree this file lives in — the O52
  // block in lib/run-root.mjs says why, and this is the only spelling of it.
  assertFreshBuild(RUN);
  if (!existsSync(join(S1DIR, 'artunc/Sonic.unc'))) throw new Error(`${S1DIR}/artunc/Sonic.unc missing — nothing to test`);

  let app = null, c = null;
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN], {
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

    // --- Row 3a: honest render ----------------------------------------------
    check('3a', 'frame 1 (MS_Stand) renders substantially; frame 0 (MS_Null) is blank',
      sSonic.frameCoverage[1] > 400 && sSonic.frameCoverage[0] === 0,
      `coverage[0..2]=${JSON.stringify(sSonic.frameCoverage.slice(0, 3))}`);

    // --- Row 3b: honest timeline, against the FIXTURE's own table ------------
    const wantAnims = fixtureSonicAnimNames(S1DIR);
    if (wantAnims === null) {
      throw new Error(`${S1DIR}/_anim/Sonic.asm could not be read, or holds no "id_*: sonani" table `
        + 'rows, so row [3b] has no expectation to compare against. This is UNMEASURABLE, not a '
        + 'pass: an empty expectation would match an app that parsed nothing.');
    }
    const gotAnims = sSonic.anims.map((a) => a.name);
    const animsMatch = JSON.stringify(gotAnims) === JSON.stringify(wantAnims);
    check('3b', `the anim picker is exactly the fixture's Ani_Sonic table (${wantAnims.length} entries), in table order`,
      animsMatch,
      animsMatch
        ? `${gotAnims.length} entries, first/last = ${gotAnims[0]}/${gotAnims[gotAnims.length - 1]}`
        : `want ${wantAnims.length} ${JSON.stringify(wantAnims)}\n        got  ${gotAnims.length} ${JSON.stringify(gotAnims)}`
          + `\n        missing=${JSON.stringify(wantAnims.filter((n) => !gotAnims.includes(n)))}`
          + ` extra=${JSON.stringify(gotAnims.filter((n) => !wantAnims.includes(n)))}`);

    // --- Row 3c: nothing auto-selects into the PLAYABLE timeline -------------
    check('3c', 'opening the doc loads no steps into the playable timeline (no anim auto-selected)',
      sSonic.steps.length === 0, `steps=${sSonic.steps.length}`);

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
