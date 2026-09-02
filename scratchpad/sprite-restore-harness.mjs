#!/usr/bin/env node
// DOES A RESTORED SPRITE TAB COME BACK EDITABLE? (owner bug: reopen Aurora with
// an S1 object-art tab open and it shows "stored per zone … open one of the
// level tabs", forcing a manual level-tab dance; "Try again" self-serves nothing.)
//
// Modeled on classic-playtest-harness.mjs: the real VITE_AURORA_DEBUG=1 build
// under xvfb+CDP opening the REAL s1disasm. No emulator — nothing here needs one.
// The relaunch is a Page.reload: localStorage persists across it and the whole
// session-restore path (session-lifecycle's projectKey effect) is renderer-side,
// so a reload exercises exactly what an app relaunch exercises.
//
// Rows (written against the FIXED property — red-first on the broken build):
//   1  app boots, opens s1disasm, default session lands GHZ1 ready
//   2  editObjectArt($40 Moto Bug) checks its sprite-doc out with frames + anims
//   3  IDENTITY PERSISTED: the stored session payload carries the sprite tab AND
//      its zone/act key (workspace record s1Zone {zone:'ghz', act:1})
//   4  RELAUNCH (reload + openDir): no act is loaded — restore conditions hold
//   5  THE BUG ROW: the restored sprite tab self-serves — checked out, frames
//      loaded, NO "stored per zone" refusal in the DOM — while STILL no level
//      tab has been touched (no act loaded; classicLevelStore.ref stays null)
//   6  RING (shared art, measured: artnem/Rings.nem is one binclude,
//      sonic.asm:4682, queued by PLC_Main — _inc/Pattern Load Cues.asm:77 — for
//      every level): a level-free editObjectArt($25) opens with no act loaded
//   7  ANTI-VACUOUS CONTROL: a crafted legacy session (sprite tab $40 Moto Bug,
//      NO persisted zone) still refuses without a level — Moto Bug's art is
//      zone-stored (Nem_Motobug is queued only by PLC_GHZ, _inc/Pattern Load
//      Cues.asm:116) and with no zone key the checkout has nothing to resolve
//      the per-zone link against; the honest copy shows
//   8  …and "Try again" succeeds once a level makes the data loadable
//
// The owner's real stored session for s1disasm is snapshotted up front and
// restored on exit — this harness must not eat their tabs.
//
// Usage: node scratchpad/sprite-restore-harness.mjs   (VERBOSE=1 for app logs)

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9384);
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
const SESSION_KEY = `aurora.session.v1:${S1DIR}`;
const MOTOBUG_TAB = 'doc:sprite:s1:64';   // $40
const RING_TAB = 'doc:sprite:s1:37';      // $25
const REFUSAL = 'stored per zone';
const SHOTS = join(ROOT, 'scratchpad/shots-sprite-restore');
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

async function waitDbg(c) {
  for (let i = 0; i < 60; i++) {
    if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return;
    await sleep(300);
  }
  throw new Error('__dbg never appeared');
}
async function until(fn, tries = 40, ms = 250) {
  for (let i = 0; i < tries; i++) { if (await fn()) return true; await sleep(ms); }
  return false;
}

async function main() {
  // A STALE dist/ MAKES EVERY ROW VACUOUS: this repo's harnesses once passed
  // 19/19 against a planted source defect because the bundle predated the
  // plant. Refuse to run when any source file is newer than the built bundle.
  const distM = statSync(MAIN).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }

  let app = null, c = null;
  let ownerSession; // snapshot of the owner's real stored session for s1disasm
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
    await waitDbg(c);

    // Snapshot the owner's stored session, then clear ONLY that key.
    ownerSession = await c.evalExpr(`localStorage.getItem(${JSON.stringify(SESSION_KEY)})`);
    await c.evalExpr(`localStorage.removeItem(${JSON.stringify(SESSION_KEY)})`);

    // --- Row 1: open s1disasm; default session lands GHZ1 ------------------
    const opened = await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    const ghzReady = await until(async () => {
      const l = await c.json('window.__dbg.levelState()');
      return l.status === 'ready' && l.zone === 'ghz' && l.act === 1;
    });
    check('1', 'the app opened s1disasm and the default session landed GHZ act 1 ready',
      opened === 'opened' && ghzReady, `open=${opened}`);

    // --- Row 2: check out Moto Bug's art ($40) -----------------------------
    const edited = await c.evalExpr('window.__dbg.editObjectArt(0x40)');
    const sp2 = await c.json('window.__dbg.spriteState()');
    check('2', 'editObjectArt($40 Moto Bug) checked the sprite doc out with frames + anims',
      edited === true && sp2.activeDocId === MOTOBUG_TAB && sp2.frames > 0 && sp2.anims.length > 0,
      `activeDocId=${sp2.activeDocId} frames=${sp2.frames} anims=${sp2.anims.length}`);
    await shot(c, '1-checked-out');

    // --- Row 3: the persisted identity carries the zone/act key ------------
    const payload = JSON.parse(await c.evalExpr(`localStorage.getItem(${JSON.stringify(SESSION_KEY)})`) ?? 'null');
    const zoneKey = payload?.workspace?.[MOTOBUG_TAB]?.s1Zone ?? null;
    check('3', 'the stored session persists the sprite tab as active AND its zone/act key (s1Zone ghz/1)',
      payload?.activeId === MOTOBUG_TAB
      && payload?.tabs?.some((t) => t.id === MOTOBUG_TAB)
      && zoneKey?.zone === 'ghz' && zoneKey?.act === 1,
      `activeId=${payload?.activeId} s1Zone=${JSON.stringify(zoneKey)}`);
    const tabCountBefore = payload?.tabs?.length ?? -1;

    // --- Row 4: relaunch — restore conditions hold (no act loaded) ---------
    await c.send('Page.reload');
    await sleep(2500);
    await waitDbg(c);
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    // Give the restore effect + sprite activation a moment before asserting.
    await sleep(1000);
    const lvl4 = await c.json('window.__dbg.levelState()');
    check('4', 'after relaunch+openDir NO act is loaded (session restores tabs, not level data)',
      lvl4.zone === null && lvl4.act === null, `level=${JSON.stringify(lvl4)}`);

    // --- Row 5: THE BUG ROW — restored sprite tab self-serves --------------
    const restored = await until(async () => {
      const s = await c.json('window.__dbg.spriteState()');
      return s.activeDocId === MOTOBUG_TAB && s.frames > 0;
    });
    const sp5 = await c.json('window.__dbg.spriteState()');
    const refusalShown = await c.evalExpr(`document.body.innerText.includes(${JSON.stringify(REFUSAL)})`);
    const lvl5 = await c.json('window.__dbg.levelState()');
    check('5', 'the RESTORED Moto Bug tab is checked out and editable — no refusal, no level touched',
      restored && sp5.frames > 0 && sp5.anims.length > 0 && refusalShown === false
      && lvl5.zone === null && lvl5.act === null,
      `activeDocId=${sp5.activeDocId} frames=${sp5.frames} anims=${sp5.anims.length} refusalShown=${refusalShown} level=${JSON.stringify(lvl5)}`);
    await shot(c, '2-restored');
    const payload5 = JSON.parse(await c.evalExpr(`localStorage.getItem(${JSON.stringify(SESSION_KEY)})`) ?? 'null');
    check('5b', 'no hidden level tab was created by the restore (tab set unchanged)',
      (payload5?.tabs?.length ?? -2) === tabCountBefore
      && !(payload5?.tabs ?? []).some((t, i) => t.kind === 'level' && !(payload?.tabs ?? [])[i]),
      `tabs before=${tabCountBefore} after=${payload5?.tabs?.length}`);

    // --- Row 6: Ring is shared art — a level-free open works ---------------
    const ringOpened = await c.evalExpr('window.__dbg.editObjectArt(0x25)');
    const sp6 = await c.json('window.__dbg.spriteState()');
    const lvl6 = await c.json('window.__dbg.levelState()');
    check('6', 'Ring ($25, shared artnem/Rings.nem via PLC_Main) opens LEVEL-FREE with no act loaded',
      ringOpened === true && sp6.activeDocId === RING_TAB && sp6.frames > 0
      && lvl6.zone === null && lvl6.act === null,
      `opened=${ringOpened} activeDocId=${sp6.activeDocId} frames=${sp6.frames} level=${JSON.stringify(lvl6)}`);
    await shot(c, '3-ring-levelfree');

    // --- Row 7: control — a LEGACY session (no zone key) still refuses -----
    const legacy = JSON.stringify({
      tabs: [
        { id: 'home', kind: 'home', title: 'Home' },
        { id: MOTOBUG_TAB, kind: 'sprite-doc', title: 'Moto Bug' },
      ],
      activeId: MOTOBUG_TAB,
    });
    await c.evalExpr(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(legacy)})`);
    await c.send('Page.reload');
    await sleep(2500);
    await waitDbg(c);
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(1500);
    const sp7 = await c.json('window.__dbg.spriteState()');
    const refusal7 = await c.evalExpr(`document.body.innerText.includes(${JSON.stringify(REFUSAL)})`);
    check('7', 'CONTROL: zone-stored Moto Bug with NO persisted zone and no level still refuses honestly',
      sp7.activeDocId !== MOTOBUG_TAB && refusal7 === true,
      `activeDocId=${sp7.activeDocId} refusalShown=${refusal7}`);
    await shot(c, '4-legacy-refusal');

    // --- Row 8: the refusal GUARANTEES, and the come-back succeeds ---------
    // Two halves of the honest contract. (a) While the data is genuinely
    // unloadable (no zone from any source), "Try again" changes nothing — the
    // refusal is a guarantee, not a hedge. (b) Open a level and come back — the
    // owner's dance. Coming back is a tab-strip click, which runs the SAME
    // requestFocusTabId path the pane's button calls (the pane exists so there
    // is exactly one loading code path), and it must now succeed.
    const clickedWhileUnloadable = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('button')].find((e) => /Try again/.test(e.textContent || ''));
      if (!b) return 'no-button'; b.click(); return 'clicked';
    })()`);
    await sleep(1200);
    const sp8a = await c.json('window.__dbg.spriteState()');
    const stillRefused = await c.evalExpr(`document.body.innerText.includes(${JSON.stringify(REFUSAL)})`);
    check('8a', '"Try again" while genuinely unloadable changes nothing — the refusal guarantees',
      clickedWhileUnloadable === 'clicked' && sp8a.activeDocId !== MOTOBUG_TAB && stillRefused === true,
      `clicked=${clickedWhileUnloadable} activeDocId=${sp8a.activeDocId} refusalShown=${stillRefused}`);

    await c.evalExpr('window.__dbg.openAct("ghz", 1)');
    await until(async () => (await c.json('window.__dbg.levelState()')).status === 'ready');
    // The act load focused the LEVEL tab (useActTabSync); come back via the
    // sprite tab in the strip — requestFocusTabId, the button's own path.
    const cameBack = await c.evalExpr(`(() => {
      const t = [...document.querySelectorAll('*')].filter((e) =>
        e.textContent?.trim() === 'Moto Bug' && e.closest && !e.querySelector('*'));
      for (const e of t) {
        const target = e.closest('[role="tab"]') ?? e;
        target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        return 'clicked';
      }
      return 'no-tab';
    })()`);
    const retried = await until(async () => {
      const s = await c.json('window.__dbg.spriteState()');
      return s.activeDocId === MOTOBUG_TAB && s.frames > 0;
    });
    const sp8 = await c.json('window.__dbg.spriteState()');
    check('8b', 'coming back to the tab (the requestFocusTabId path "Try again" shares) loads it',
      cameBack === 'clicked' && retried && sp8.frames > 0,
      `cameBack=${cameBack} activeDocId=${sp8.activeDocId} frames=${sp8.frames}`);
    await shot(c, '5-try-again');
  } finally {
    // Put the owner's real session back before tearing the app down.
    try {
      if (c) {
        if (ownerSession != null) {
          await c.evalExpr(`localStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(ownerSession)})`);
        } else if (ownerSession === null) {
          await c.evalExpr(`localStorage.removeItem(${JSON.stringify(SESSION_KEY)})`);
        }
        c.close();
      }
    } catch { /* best effort */ }
    if (app?.pid) { try { process.kill(-app.pid, 'SIGTERM'); } catch { /* gone */ } }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed${fails.length ? ` — FAILING: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(`HARNESS ERROR: ${e.message}`); process.exit(2); });
