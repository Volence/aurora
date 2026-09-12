#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// SWITCH-WINDOW ON SCREEN, 2026-09-12. The cancellation that (c1) puts on the
// existing error banner, looked at in a running app, on COPIES of the
// projects, on a private virtual display.
// ═══════════════════════════════════════════════════════════════════════════
//
// SOURCE: docs/reviews/2026-09-12-switch-window-fix.md, section 9 (T-1), and the
// review that asked for this file (its rework section records the run).
//
// WHY A HARNESS. The node suite (src/renderer/state/__tests__/switch-window-edit
// .test.ts) proves the stores refuse the commit and set the error. It cannot see
// the window: whether that error is PAINTED, and whether the level the user was
// editing is still the one on screen, are properties of the running app.
//
// THE DETERMINISTIC WAY IN. A person cannot land an edit inside a switch's
// window, which is milliseconds. But each open's first await is an IPC round
// trip (the classic bridge's first file probe, the aeon loader's first read),
// so an edit issued SYNCHRONOUSLY in the same Runtime.evaluate, right after the
// open call returns its promise, always lands inside the window:
//     const p = __dbg.openDir(S1b); __dbg.classic.stampLayoutCell('fg'); await p
// `stampLayoutCell` is debug-level-edit.ts: a real `classicSetLayoutCells`
// commit, the same call a map stroke makes. The open is `__dbg.openDir` /
// `__dbg.aeon.open`, the primitives with no guard; with no dialog the consent
// token is taken at the primitive's start, which is before the edit.
//
// ROWS
//   SW.0   setup: S1a open, a level tab loaded by a real click on Home's card.
//   SW.a   classic to classic, an edit inside the window: the cancellation
//          sentence is PAINTED, S1a is still the open project, the stamped cell
//          is still in the document, the level tab still shows its unsaved dot.
//   SW.b   classic to aeon, the same: is the aeon loader's setError VISIBLE AT
//          ALL while a classic project is resident? If it is not, the
//          cancellation is silent on that road, and that is a FINDING printed as
//          a FAIL, never softened.
//   SW.c1  CONTROL: classic to classic with no edit commits, no banner.
//   SW.c2  CONTROL: classic to aeon with no edit commits, no banner.
//   Before every open the banner is read ABSENT.
//
// EXPECTATIONS COME FROM THE APP'S OWN SOURCE. `src/renderer/state/edit-consent.ts`
// of the tree under test is bundled with esbuild at start and its
// `openCancelledMessage` gives the sentence; the unsaved dot's accessible name
// is read out of DirtyDot.tsx with a regex that must match exactly once.
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//   * TEXT IN THE DOM THAT IS NOT ON SCREEN. Every "on screen" read is the
//     paint test (rects, a strict hit at the integer centre, containment in
//     the nearest scroller's box and the viewport); dpr and rects are printed.
//   * A BANNER LEFT OVER FROM THE STEP BEFORE. It is dismissed by a real click
//     and read absent before each open.
//   * AN EDIT THAT LANDED AFTER THE OPEN. The same evaluate reads the classic
//     project's status right after the stamp: it must still be 'open' (for the
//     aeon road, no aeon project yet), so the edit is known to have landed
//     inside the window, not after a commit.
//   * AN EDIT THAT CHANGED NOTHING. The stamp report must say `docChanged`
//     (its `cellAfter` is read from the doc). After each cancelled open the
//     cell is read back by the NEXT stamp, which reads it (`from`) before it
//     writes: no hook reads a layout cell, and `docHash` does not hash the
//     layout planes (run 2 found that: it did not move when the stamp did). So
//     that read writes, and it is only ever taken after the row's evidence.
//   * A CONTROL THAT CANNOT FAIL. The controls are the same opens with the
//     stamp taken out: they must COMMIT (the new project on Home), so a
//     harness that "sees a banner" for any open would fail them.
//
// THE COPIES. Never a live tree. Both come from COMMITTED revisions through
// `git archive` (review bar 19): s1disasm at its checkout's HEAD commit, aeon
// at `origin/master` (project.json + games/sonic4/data, as the suite uses). The
// peer paths are used only as `git -C` arguments.
//
// NO EMULATOR, EVER. ORACLE_SOCKET points inside a directory this file makes
// with mkdtemp; nothing here presses the Aether badge. Nothing presses a
// button that opens a native dialog. CLEANUP IS BY PID: spawnGuarded + awaited
// killTree.
//
// RUN (from a worktree, BOTH variables, or the main checkout's dist answers):
//   VITE_AURORA_DEBUG=1 npm run build
//   AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<electron> [RUN_TAG=run1] \
//     node scratchpad/switch-window-onscreen-harness.mjs

import { AURORA_DIR, siblingPath, siblingDefaultPath } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve as resolvePath } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree, RUN_PROFILE_DIR } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild, assertDebugBuild } from './lib/run-root.mjs';

const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
assertFreshBuild(RUN);
assertDebugBuild(RUN);
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const PORT = Number(process.env.PORT ?? 9433);
const TAG = process.env.RUN_TAG ?? new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const CAP_REL = 'docs/captures/2026-09-12-switch-window-onscreen';
const CAPTURES = `${ROOT}/${CAP_REL}`;
mkdirSync(CAPTURES, { recursive: true });

const SOCK_DIR = mkdtempSync('/tmp/swos-sock-');
const SOCK = join(SOCK_DIR, 'o.sock');
for (const forbidden of ['/tmp/oracle.sock', `${process.env.XDG_RUNTIME_DIR ?? '/nonexistent'}/oracle.sock`]) {
  if (SOCK === forbidden) throw new Error(`refusing: ORACLE_SOCKET would be ${forbidden}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (x) => JSON.stringify(x);

// ═══ THE ORACLE: the tree's own modules and source strings ═════════════════
const SRC = (p) => readFileSync(`${RUN.root}/${p}`, 'utf8');
function fromSource(file, re, what) {
  const text = SRC(file);
  const all = [...text.matchAll(new RegExp(re.source, `${re.flags.replace('g', '')}g`))];
  if (all.length !== 1) throw new Error(`ORACLE: ${what} matched ${all.length} times in ${file} (want 1): ${re}`);
  return all[0];
}
async function loadOracle() {
  const req = createRequire(`${RUN.root}/package.json`);
  const esb = req('esbuild');
  const r = esb.buildSync({
    entryPoints: [`${RUN.root}/src/renderer/state/edit-consent.ts`], bundle: true, format: 'esm',
    platform: 'node', write: false, logLevel: 'error',
  });
  const m = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
  if (typeof m.openCancelledMessage !== 'function') throw new Error('ORACLE: edit-consent.ts exports no openCancelledMessage');
  const dirtyLabel = fromSource('src/renderer/shell/DirtyDot.tsx',
    /export const DIRTY_DOT_LABEL = '([^']+)';/, 'the unsaved dot\'s accessible name')[1];
  return { level: m.openCancelledMessage(['level']), dirtyLabel };
}

// ═══ THE COPIES: git archive of committed revisions, never a working tree ══
const GIT_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const liveAeon = (() => { try { return siblingDefaultPath('aeon'); } catch { return null; } })();
const liveS1 = (() => { try { return siblingDefaultPath('s1disasm'); } catch { return null; } })();
function gitOut(repo, args, what) {
  const r = spawnSync('git', ['-C', repo, ...args], { env: GIT_ENV, maxBuffer: 1 << 30 });
  if (r.status !== 0) {
    throw new Error(`HARNESS CANNOT MEASURE (not an Aurora result): ${what}: git -C ${repo} ${args.join(' ')} `
      + `exited ${r.status}: ${String(r.stderr).trim()}`);
  }
  return r.stdout;
}
function archive(name, ref, paths) {
  const repo = siblingPath(name);
  if (!repo) throw new Error(`HARNESS CANNOT MEASURE: no suite root resolves the ${name} checkout`);
  const sha = String(gitOut(repo, ['rev-parse', '--verify', `${ref}^{commit}`], `${name} ${ref}`)).trim();
  const tar = gitOut(repo, ['archive', sha, ...paths], `${name} archive`);
  return { name, ref, sha, tar };
}
function extract(a, label) {
  const dir = mkdtempSync(`/tmp/swos-${label}-`);
  for (const live of [liveAeon, liveS1]) {
    if (live && resolvePath(dir) === resolvePath(live)) throw new Error('refusing: a copy is a live tree');
  }
  const x = spawnSync('tar', ['-x', '-C', dir], { input: a.tar, maxBuffer: 1 << 20 });
  if (x.status !== 0) throw new Error(`tar -x of ${a.name} @ ${a.sha} exited ${x.status}: ${x.stderr}`);
  return realpathSync(dir);
}

// ═══ CDP ═══════════════════════════════════════════════════════════════════
function getJSON(path, timeoutMs = 2000) {
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
  for (let i = 0; i < 150; i++) {
    try {
      const list = await getJSON('/json/list');
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
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
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP ${method} gave no answer in 45s`));
    }, 45000);
    pending.set(id, (m) => { clearTimeout(timer); if (m.error) reject(new Error(`${method}: ${J(m.error)}`)); else resolve(m.result); });
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

const results = [];
const fails = [];
const unmeasurable = [];
function check(id, name, ok, detail) {
  const tag = ok === 'UNMEASURABLE' ? 'UNMS' : ok ? 'PASS' : 'FAIL';
  const la = os.loadavg().map((n) => n.toFixed(2)).join('/');
  console.log(`${tag}  [${id}] ${name}   [load ${la}]${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (ok === 'UNMEASURABLE') unmeasurable.push(`[${id}] ${name}`);
  else if (!ok) fails.push(`[${id}] ${name}`);
}

/** THE PAINT TEST (cdp-sweep-0911's): rects, a strict hit at the integer
 *  centre, the nearest scroller's box on both axes, and the viewport. */
const PAINTED = (selectorExpr) => String.raw`
(() => {
  const el = ${selectorExpr};
  if (!el) return { found: false, dpr: window.devicePixelRatio };
  const b = el.getBoundingClientRect();
  let sc = el.parentElement;
  while (sc && sc !== document.body) {
    const cs = getComputedStyle(sc);
    if (/(auto|scroll)/.test(cs.overflowY + ' ' + cs.overflowX)) break;
    sc = sc.parentElement;
  }
  const sb = sc && sc !== document.body ? sc.getBoundingClientRect() : null;
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  return {
    found: true, text: (el.innerText || el.textContent || '').trim().slice(0, 400),
    rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) },
    rects: el.getClientRects().length, centre: { x: cx, y: cy },
    hitInside: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))),
    inScrollerBox: sb ? (b.top >= sb.top - 0.5 && b.bottom <= sb.bottom + 0.5 && b.left >= sb.left - 0.5 && b.right <= sb.right + 0.5) : null,
    inViewport: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
    dpr: window.devicePixelRatio,
  };
})()`;
const onScreen = (p) => !!(p && p.found && p.rects > 0 && p.hitInside === true && p.inViewport === true && p.inScrollerBox !== false);

async function main() {
  const t0 = Date.now();
  console.log('=== switch-window on-screen harness, 2026-09-12 ===');
  console.log(`    node         : ${process.version}`);
  console.log(`    loadavg      : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}   uptime ${Math.round(os.uptime())} s`);
  console.log(`    ORACLE_SOCKET: ${SOCK}   (private; made by this run)`);
  console.log(`    profile      : ${RUN_PROFILE_DIR}   (pinned by spawnGuarded, fresh per process)`);
  console.log(`    PORT         : ${PORT}   DISPLAY: xvfb-run -a (never :0)`);
  console.log(`    captures     : ${CAP_REL}   tag ${TAG}`);
  const O = await loadOracle();
  console.log(`    oracle       : ${RUN.root}/src/renderer/state/edit-consent.ts bundled; level sentence ${J(O.level)}; dot label ${J(O.dirtyLabel)}`);
  const s1 = archive('s1disasm', 'HEAD', ['.']);
  const aeon = archive('aeon', 'origin/master', ['project.json', 'games/sonic4/data']);
  console.log(`    s1disasm     : ${s1.ref} @ ${s1.sha}   ${s1.tar.length} archive bytes`);
  console.log(`    aeon         : ${aeon.ref} @ ${aeon.sha}   ${aeon.tar.length} archive bytes`);
  const S1a = extract(s1, 's1a');
  const S1b = extract(s1, 's1b');
  const AEONc = extract(aeon, 'aeon');
  console.log(`    copy S1a     : ${S1a}\n    copy S1b     : ${S1b}\n    copy aeon    : ${AEONc}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target; refusing to start.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1', ORACLE_SOCKET: SOCK };
  delete env.DISPLAY;
  delete env.EXODUS_SOCKET;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    const page = await waitForTarget();
    c = cdp(page.webSocketDebuggerUrl);
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    let dbg = false;
    for (let i = 0; i < 100 && !dbg; i++) {
      dbg = await c.evalExpr('typeof window.__dbg === "object"').catch(() => false);
      if (!dbg) await sleep(300);
    }
    if (!dbg) throw new Error('no __dbg: rebuild with VITE_AURORA_DEBUG=1');
    console.log(`    dpr at start : ${await c.evalExpr('window.devicePixelRatio')}`);
    try { await rows(c, O, { S1a, S1b, AEONc }); } catch (e) {
      check('SW.ABORT', `the run stopped early: rows after this point did NOT run (${e.message})`, 'UNMEASURABLE', e.stack);
    }
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
    try { rmSync(SOCK_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
    if (!process.env.KEEP_COPY) {
      for (const dir of [S1a, S1b, AEONc]) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } }
    }
  }

  const pass = results.filter((r) => r.ok === true).length;
  console.log(`\n════ switch-window on-screen: ${pass}/${results.length} rows PASS · ${fails.length} FAIL · ${unmeasurable.length} UNMEASURABLE · `
    + `${((Date.now() - t0) / 1000).toFixed(1)}s · s1disasm ${s1.sha.slice(0, 12)} · aeon ${aeon.sha.slice(0, 12)} ════`);
  console.log(`     loadavg at end ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}   uptime ${Math.round(os.uptime())} s`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  console.log('END-OF-RUN');
  process.exit(fails.length || unmeasurable.length ? 1 : 0);
}

// ═══ THE ROWS ══════════════════════════════════════════════════════════════
async function rows(c, O, { S1a, S1b, AEONc }) {
  const mouse = (type, x, y, button = 'none', buttons = 0) =>
    c.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: 1 });
  const aim = (selectorExpr, scroll = false) => c.json(String.raw`(() => {
    const el = ${selectorExpr};
    if (!el) return null;
    if (${scroll}) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const b = el.getBoundingClientRect();
    const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, hitOk: !!(hit && (hit === el || el.contains(hit))), dpr: window.devicePixelRatio,
      rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) } };
  })()`);
  const realClick = async (selectorExpr, { scroll = false } = {}) => {
    const p = await aim(selectorExpr, scroll);
    if (!p || !p.hitOk) return p;
    await mouse('mouseMoved', p.x, p.y);
    await mouse('mousePressed', p.x, p.y, 'left', 1);
    await sleep(40);
    await mouse('mouseReleased', p.x, p.y, 'left', 0);
    await sleep(400);
    return p;
  };
  const shot = async (name) => {
    const s = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${CAPTURES}/${name}-${TAG}.png`, Buffer.from(s.data, 'base64'));
    console.log(`   shot: ${CAP_REL}/${name}-${TAG}.png`);
  };
  const HOME_TAB = String.raw`[...document.querySelectorAll('[role="tablist"] > div')].find((t) => t.title === 'Home') || null`;
  const pressHome = async () => { const p = await realClick(HOME_TAB); await sleep(700); return p; };
  const tabs = () => c.json(`[...document.querySelectorAll('[role="tablist"] > div')].map((t) => t.title)`);
  const PATH_INPUT = `document.querySelector('input[aria-label="Project directory path"]')`;
  const HEADER_EL = String.raw`(() => { const input = ${PATH_INPUT};
    const wrap = input ? input.closest('[data-testid="open-by-path"]') : null;
    const col = wrap ? wrap.parentElement : null;
    return col ? [...col.children].find((k) => k.tagName === 'DIV' && k.firstElementChild
      && /^(S1|AEON)$/.test((k.firstElementChild.textContent || '').trim())) || null : null; })()`;
  /** Home's project header, read where the user reads it. */
  const home = async () => {
    await pressHome();
    return c.json(String.raw`(() => { const header = ${HEADER_EL};
      return { chip: header ? header.children[0].textContent.trim() : null,
        name: header && header.children[1] ? header.children[1].textContent.trim() : null,
        dir: header && header.children[2] ? header.children[2].textContent.trim() : null }; })()`);
  };
  const BANNER_BTN = String.raw`([...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Dismiss'
    && b.parentElement && b.parentElement.firstElementChild && b.parentElement.firstElementChild.tagName === 'SPAN') || null)`;
  const BANNER = `(() => { const b = ${BANNER_BTN}; return b ? b.parentElement : null; })()`;
  const BANNER_TEXT = `(() => { const b = ${BANNER}; return b ? b.firstElementChild : null; })()`;
  const bannerPaint = () => c.json(PAINTED(BANNER_TEXT));
  const bannerPresent = () => c.evalExpr(`!!(${BANNER})`);
  const dismissBanner = async () => {
    const was = await bannerPresent();
    const p = was ? await realClick(BANNER_BTN) : null;
    await sleep(300);
    return { was, pressed: p, goneAfter: !(await bannerPresent()) };
  };
  const proj = () => c.json('window.__dbg.projStatus()');
  const lvl = () => c.json('window.__dbg.levelState()');
  const aeonSt = () => c.json('window.__dbg.aeon.state()').catch((e) => ({ error: e.message }));
  const DOT_ON = (title) => String.raw`(() => { const t = [...document.querySelectorAll('[role="tablist"] > div')].find((x) => x.title === ${J(title)});
    return t ? t.querySelector('[role="img"][aria-label=${J(O.dirtyLabel)}]') : null; })()`;
  const FIELD_WRAP = `document.querySelector('[data-testid="open-by-path"]')`;
  const GHZ1_CARD = String.raw`(() => { const w = ${FIELD_WRAP}; const col = w ? w.parentElement : null; if (!col) return null;
    return [...col.querySelectorAll('button')].find((b) => /^Open /.test(b.title || '') && !b.disabled
      && /green hill|ghz/i.test(b.title) && /\b1\b/.test(b.title.replace(/^Open /, ''))) || null; })()`;
  const actReady = (l) => !!(l && l.status === 'ready' && l.zone === 'ghz' && String(l.act) === '1');
  const waitFor = async (pred, maxMs) => {
    const t = Date.now();
    while (Date.now() - t < maxMs) { if (await pred().catch(() => false)) return true; await sleep(250); }
    return false;
  };

  /** Start an open and POLL for its outcome.
   *  ⚠ RUN 1 ABORTED at SW.c2 with `Runtime.evaluate: {"code":-32000,"message":"Promise was
   *  collected"}`: Chromium can collect a long promise that `awaitPromise` is waiting on
   *  (classic-wheel-passive-harness.mjs and s1-boss-sprites-harness.mjs record the same). So no
   *  evaluate here awaits an open: the page records the outcome on `window.__swOut` and this
   *  polls it. `body` must declare `p` (the open's promise) and may declare `pre` (synchronous
   *  reads, returned at once). */
  const openAndWait = async (body, maxMs = 40000) => {
    const key = `sw${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const pre = JSON.parse(await c.evalExpr(String.raw`(() => {
      window.__swOut = window.__swOut || {};
      const rec = { done: false };
      window.__swOut[${J(key)}] = rec;
      ${body}
      p.then((v) => { rec.done = true; rec.out = v; }, (e) => { rec.done = true; rec.err = String((e && e.message) || e); });
      return JSON.stringify(typeof pre === 'undefined' ? {} : pre);
    })()`));
    const t = Date.now();
    let rec = null;
    while (Date.now() - t < maxMs) {
      rec = await c.json(`window.__swOut[${J(key)}]`).catch(() => null);
      if (rec && rec.done) break;
      await sleep(150);
    }
    const out = !rec || !rec.done ? { timedOut: maxMs } : rec.err !== undefined ? { threw: rec.err } : rec.out;
    return { pre, out };
  };
  /** The open and the edit in ONE synchronous evaluate: the edit lands before the open's first IPC
   *  await resolves. ⚠ RUN 1 also read `{}` from this row's first version: it handed `c.json` an
   *  async IIFE, and `c.json` stringified the PENDING promise instead of awaiting it. */
  const openWithEdit = async (openCall) => {
    const { pre, out } = await openAndWait(String.raw`
      const p = ${openCall};
      const stamp = window.__dbg.classic.stampLayoutCell('fg');
      const pre = { stamp, inWindow: { classic: window.__dbg.projStatus().status, aeonOpen: window.__dbg.aeon.state().open } };`);
    return { ...pre, out };
  };
  /** THE STAMPED CELL, READ BACK. ⚠ RUN 2: `__dbg.classic.docHash()` hashes tiles, objects and
   *  palettes, NOT the layout planes, so it stayed put while the stamp changed an fg cell; and no
   *  hook reads a layout cell. The read used instead is the next stamp's own: `stampLayoutCell`
   *  reads the cell (`from`, via chooseLayoutStamp over the doc) BEFORE it writes. So this reads by
   *  writing, and it is only ever called after a row's other evidence is taken. */
  const readCellByStamp = () => c.json("window.__dbg.classic.stampLayoutCell('fg')");
  const sameCell = (a, b) => !!(a && b && a.ok && b.ok && a.plane === b.plane && a.x === b.x && a.y === b.y);
  const stampOk = (r) => !!(r.stamp && r.stamp.ok && r.stamp.docChanged);

  // ── SW.0: setup ─────────────────────────────────────────────────────────
  console.log('\n──── setup: S1a open, a level tab loaded by a real click ────');
  const o0 = (await openAndWait(`const p = window.__dbg.openDir(${J(S1a)});`)).out;
  await waitFor(async () => (await proj()).status === 'open', 20000);
  const h0 = await home();
  const card = await realClick(GHZ1_CARD, { scroll: true });
  const cardTitle = await c.evalExpr(`(() => { const b = ${GHZ1_CARD}; return b ? b.title : null; })()`);
  const TAB_TITLE = cardTitle ? cardTitle.replace(/^Open /, '') : null;
  await waitFor(async () => actReady(await lvl()), 20000);
  await sleep(800);
  const l0 = await lvl(); const tabs0 = await tabs(); const dot0 = await c.json(PAINTED(DOT_ON(TAB_TITLE)));
  await pressHome();
  check('SW.0', 'SETUP: S1a is open (Home names it), Green Hill act 1 was opened by a real click on Home\'s card, its tab is listed, the act is loaded and CLEAN (no unsaved dot yet)',
    o0 === 'opened' && h0.chip === 'S1' && h0.dir === S1a && !!(card && card.hitOk) && actReady(l0)
      && tabs0.includes(TAB_TITLE) && dot0.found === false,
    `dpr ${await c.evalExpr('window.devicePixelRatio')}; openDir ${J(o0)}; home ${J(h0)}; card aim ${J(card)}; levelState ${J(l0)}; tabs ${J(tabs0)}; dot ${J(dot0)}`);

  // ── SW.a: classic to classic, an edit inside the window ────────────────
  console.log('\n──── SW.a: classic to classic, __dbg.classic.stampLayoutCell inside the window ────');
  const ba = await bannerPresent();
  const ra = await openWithEdit(`window.__dbg.openDir(${J(S1b)})`);
  await sleep(600);
  const pa = await bannerPaint(); const ha = await home(); const la = await lvl();
  const da = await c.json(PAINTED(DOT_ON(TAB_TITLE)));
  await shot('sw-a-cancelled');
  check('SW.a.0', 'SW.a premise: the stamp changed the document INSIDE the window (the classic project still open, no aeon project, in the same evaluate)',
    stampOk(ra) && ra.inWindow.classic === 'open', `result ${J(ra)}`);
  check('SW.a.1', 'SW.a: no banner before the open; the open reports error; the banner is PAINTED and reads edit-consent.ts\'s own level sentence, exactly',
    !ba && ra.out === 'error' && onScreen(pa) && pa.text === O.level,
    `banner before ${ba}; open returned ${J(ra.out)}; paint ${J(pa)}; want ${J(O.level)}`);
  check('SW.a.2', 'SW.a: S1a is still the open project (Home\'s header names S1a, not S1b), with its act loaded',
    ha.chip === 'S1' && ha.dir === S1a && actReady(la), `home ${J(ha)}; levelState ${J(la)}`);
  const ka = await readCellByStamp();
  check('SW.a.3', 'SW.a: the stamped cell is still in the document after the cancelled open (the next stamp read the same cell and found the value this one wrote)',
    sameCell(ra.stamp, ka) && ka.from === ra.stamp.to,
    `stamp in the window ${J(ra.stamp)}; read back by the next stamp ${J(ka)}`);
  check('SW.a.4', 'SW.a: the level tab still shows its unsaved dot, painted', onScreen(da), `dot ${J(da)}`);

  // ── SW.b: classic to aeon, an edit inside the window ───────────────────
  console.log('\n──── SW.b: classic to aeon, the same edit; is the aeon loader\'s error visible while classic is resident? ────');
  const dmb = await dismissBanner();
  const bb = await bannerPresent();
  const rb = await openWithEdit(`window.__dbg.aeon.open(${J(AEONc)})`);
  await sleep(600);
  const pb = await bannerPaint(); const hb = await home(); const lb = await lvl(); const ab = await aeonSt();
  const db = await c.json(PAINTED(DOT_ON(TAB_TITLE)));
  await shot('sw-b-cancelled');
  check('SW.b.0', 'SW.b premise: the stamp changed the document INSIDE the window (the classic project still open, no aeon project yet)',
    stampOk(rb) && rb.inWindow.classic === 'open' && rb.inWindow.aeonOpen === false, `result ${J(rb)}`);
  check('SW.b.1', 'SW.b: the previous banner was dismissed by a real click and read absent; the aeon open reports false',
    dmb.goneAfter && !bb && rb.out === false, `dismiss ${J(dmb)}; banner before ${bb}; open returned ${J(rb.out)}`);
  check('SW.b.2', 'SW.b THE KEY QUESTION: the aeon loader\'s cancellation IS PAINTED while a classic project is resident, reading edit-consent.ts\'s level sentence exactly (a FAIL here is the FINDING that the cancellation is silent on this road)',
    onScreen(pb) && pb.text === O.level, `paint ${J(pb)}; want ${J(O.level)}`);
  check('SW.b.3', 'SW.b: S1a is still the open project with its act loaded, and no aeon project was committed',
    hb.chip === 'S1' && hb.dir === S1a && actReady(lb) && ab.open === false, `home ${J(hb)}; levelState ${J(lb)}; aeon ${J(ab)}`);
  const kb = await readCellByStamp();
  check('SW.b.4', 'SW.b: the stamped cell is still in the document (read back by the next stamp), and the unsaved dot is still painted',
    sameCell(rb.stamp, kb) && kb.from === rb.stamp.to && onScreen(db),
    `stamp in the window ${J(rb.stamp)}; read back by the next stamp ${J(kb)}; dot ${J(db)}`);

  // ── SW.c1: CONTROL, classic to classic with no edit ─────────────────────
  console.log('\n──── SW.c1: CONTROL, classic to classic, no edit ────');
  const dmc1 = await dismissBanner();
  const bc1 = await bannerPresent();
  const oc1 = (await openAndWait(`const p = window.__dbg.openDir(${J(S1b)});`)).out;
  await sleep(1200);
  const hc1 = await home(); const pc1 = await c.json(PAINTED(BANNER_TEXT));
  check('SW.c1', 'CONTROL: with no edit, the same classic open COMMITS: banner absent before and after, Home names S1b',
    dmc1.goneAfter && !bc1 && oc1 === 'opened' && hc1.chip === 'S1' && hc1.dir === S1b && pc1.found === false,
    `dismiss ${J(dmc1)}; banner before ${bc1}; open ${J(oc1)}; home ${J(hc1)}; banner after ${J(pc1)}`);

  // ── SW.c2: CONTROL, classic to aeon with no edit ────────────────────────
  console.log('\n──── SW.c2: CONTROL, classic to aeon, no edit ────');
  const bc2 = await bannerPresent();
  const oc2 = (await openAndWait(`const p = window.__dbg.aeon.open(${J(AEONc)});`)).out;
  await sleep(1500);
  const hc2 = await home(); const pc2 = await c.json(PAINTED(BANNER_TEXT)); const ac2 = await aeonSt(); const prc2 = await proj();
  await shot('sw-c2-committed');
  // Home shows NO directory for an aeon project (HomeTab.tsx renders `{dir && ...}` from the classic
  // store only; run 2 read `dir: null`), so what it offers to name the copy is the project's name,
  // read here from the copy's own project.json.
  const aeonName = JSON.parse(readFileSync(`${AEONc}/project.json`, 'utf8')).name;
  if (hc2.dir === null) console.log(`NOTE  [SW.c2] Home shows no directory for an aeon project; it names ${J(hc2.name)}`);
  check('SW.c2', 'CONTROL: with no edit, the same aeon open COMMITS: banner absent before and after, the classic project closed, Home is the AEON page naming the copy\'s project',
    !bc2 && oc2 === true && ac2.open === true && prc2.status === 'closed' && hc2.chip === 'AEON' && hc2.name === aeonName && pc2.found === false,
    `banner before ${bc2}; open ${J(oc2)}; aeon ${J(ac2)}; projStatus ${J(prc2)}; home ${J(hc2)}; banner after ${J(pc2)}`);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok === true).length}/${results.length} rows had run: this is NOT a pass over the rows that never ran.`);
  console.log('END-OF-RUN');
  process.exit(2);
});
