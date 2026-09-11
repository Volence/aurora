#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// CDP SWEEP 2026-09-11 — four landed fixes, each proven only below a pixel,
// looked at on a running app.
// ═══════════════════════════════════════════════════════════════════════════
//
// SOURCES (the spec is the packets; where a packet and the tree disagree the
// tree wins and the output says so):
//   docs/reviews/2026-09-11-a-f3-art-save-width.md §8 (TAGGED FOR FOREGROUND)
//   docs/reviews/2026-09-11-uxpair-tail.md §6 (F-1, F-2, F-3)
//
// TWO PARTS, TWO PROCESSES, because they need different launch conditions and
// `spawnGuarded` pins ONE private profile per process:
//
//   PART=classic   rows R1 (A-F3 art-save toast) and R2 (F-1, unsaved after
//                  close), on a FRESH COPY of the vendored fixture
//                  `test/fixtures/s1disasm`, made by this file per run.
//   PART=home      rows R3 (F-2, the two socket sentences) and R4 (F-3, the
//                  empty filter) on a cold Home whose profile has never opened
//                  anything. R4 must be the first thing that profile sees, so it
//                  cannot share a process with PART=classic, which opens one.
//                  R3 runs LAST: the badge exists only in a LEVEL's status bar
//                  (providers/map-status-classic.ts, map-status-aeon.ts), so R3
//                  opens its own fixture copy and GHZ act 1 as setup.
//
// ═══ WHAT WOULD MAKE THESE GO GREEN WITHOUT THE PROPERTY HOLDING ═══════════
//
//   • TEXT IN THE DOM THAT IS NOT ON SCREEN. `checkVisibility()` and
//     `getClientRects()` go green 2,635px outside a scroller here. Every
//     "on screen" row asks for ALL of: client rects, a strict
//     `elementFromPoint` at the element's own integer centre, containment in
//     the nearest scrolling ancestor's box, and containment in the viewport.
//   • A SYNTHETIC EVENT THE APP IGNORES. Every gesture is `Input.dispatchMouse
//     Event` / `Input.dispatchKeyEvent` at an INTEGER client pixel, after a hit
//     test says the point lands on the intended element.
//   • A CONTROL THAT CANNOT READ DIFFERENTLY. Each row carries one: a clean
//     close shows no dot; the title before an edit has no marker; GHZ1's mtime
//     moving is what makes GHZ2's standing still mean anything; the ENOENT and
//     ECONNREFUSED sentences are read in one run and must differ; the
//     recents-listed arm of the filter must say a DIFFERENT sentence.
//   • TWO RUNS STITCHED INTO ONE OBSERVATION. Every row's evidence comes from
//     the run that prints it. dpr is printed on every coordinate row.
//
// ⚠ NO EMULATOR, EVER. `ORACLE_SOCKET` is set, on EVERY launch, to a path
// inside a directory this file creates with mkdtemp, so no press on the badge
// in any part can reach `/tmp/oracle.sock` or `$XDG_RUNTIME_DIR/oracle.sock`.
// The only socket file that ever exists there is a DEAD one R3 makes itself.
//
// CLEANUP IS BY PID: `spawnGuarded` + awaited `killTree`.
//
// RUN (from a worktree, BOTH variables, or the main checkout's dist answers):
//   VITE_AURORA_DEBUG=1 npm run build
//   PART=classic AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<an electron> \
//     node scratchpad/cdp-sweep-0911-harness.mjs
//   PART=home    AURORA_BUILT_TREE=<this tree> ELECTRON_BIN=<an electron> \
//     node scratchpad/cdp-sweep-0911-harness.mjs

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import {
  mkdirSync, writeFileSync, existsSync, cpSync, mkdtempSync, statSync, lstatSync, rmSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree, RUN_PROFILE_DIR } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PART = process.env.PART ?? '';
if (PART !== 'classic' && PART !== 'home') {
  throw new Error('PART must be `classic` (rows R1, R2) or `home` (rows R3, R4)');
}
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const PORT = Number(process.env.PORT ?? (PART === 'classic' ? 9491 : 9492));
const TAG = process.env.RUN_TAG ?? new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const CAPTURES = `${ROOT}/docs/captures/2026-09-11-cdp-sweep`;
mkdirSync(CAPTURES, { recursive: true });
const FIXTURE = `${ROOT}/test/fixtures/s1disasm`;

// The private dead-socket directory. Short on purpose: a unix socket path has a
// ~104-byte ceiling and the session scratchpad path is longer than that.
const SOCK_DIR = mkdtempSync('/tmp/cdps0911-');
const SOCK = join(SOCK_DIR, 'o.sock');
for (const forbidden of ['/tmp/oracle.sock', `${process.env.XDG_RUNTIME_DIR ?? '/nonexistent'}/oracle.sock`]) {
  if (SOCK === forbidden) throw new Error(`refusing: ORACLE_SOCKET would be ${forbidden}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
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
  console.log(`${tag}  [${id}] ${name}   [load ${la}]`
    + `${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, load: la });
  if (ok === 'UNMEASURABLE') unmeasurable.push(`[${id}] ${name}`);
  else if (!ok) fails.push(`[${id}] ${name}`);
}
const note = (id, text) => console.log(`NOTE  [${id}] ${text}`);

/**
 * THE PAINT TEST. Rects, a strict hit at the integer centre, the nearest
 * scrolling ancestor's box on BOTH axes, and the viewport. `checkVisibility`
 * is printed and never trusted alone.
 */
const PAINTED = (selectorExpr) => String.raw`
(() => {
  const el = ${selectorExpr};
  if (!el) return { found: false };
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
    found: true, text: (el.innerText || el.textContent || el.value || '').trim().slice(0, 240),
    rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) },
    rects: el.getClientRects().length,
    visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
    centre: { x: cx, y: cy },
    hitInside: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))),
    hitTag: hit ? hit.tagName : null,
    scroller: sb ? { y: +sb.top.toFixed(2), bottom: +sb.bottom.toFixed(2), x: +sb.left.toFixed(2), right: +sb.right.toFixed(2) } : null,
    inScrollerBox: sb ? (b.top >= sb.top - 0.5 && b.bottom <= sb.bottom + 0.5
                         && b.left >= sb.left - 0.5 && b.right <= sb.right + 0.5) : null,
    inViewport: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
    viewport: { w: innerWidth, h: innerHeight },
    dpr: window.devicePixelRatio,
  };
})()`;
const onScreen = (p) => !!(p && p.found && p.rects > 0 && p.hitInside === true
  && p.inViewport === true && p.inScrollerBox !== false);

/** One toast row per visible toast, each with the paint test's four parts. */
const TOASTS = String.raw`
(() => [...document.querySelectorAll('div[title="Dismiss"]')].map((el) => {
  const b = el.getBoundingClientRect();
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  const cs = getComputedStyle(el);
  return {
    text: (el.innerText || '').trim(),
    rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) },
    rects: el.getClientRects().length,
    hitInside: !!(hit && (hit === el || el.contains(hit))),
    inViewport: b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth,
    border: cs.borderTopColor, opacity: cs.opacity, dpr: window.devicePixelRatio,
  };
}))()`;
const toastPainted = (t) => !!(t && t.rects > 0 && t.hitInside === true && t.inViewport === true);

async function main() {
  const t0 = Date.now();
  const load0 = os.loadavg();
  console.log(`=== cdp-sweep 2026-09-11 harness, PART=${PART} ===`);
  console.log(`    node         : ${process.version}`);
  console.log(`    loadavg      : ${load0.map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    ORACLE_SOCKET: ${SOCK}   (private; the directory was made by this run)`);
  console.log(`    profile      : ${RUN_PROFILE_DIR}   (pinned by spawnGuarded, derived fresh per process)`);
  console.log(`    captures     : ${CAPTURES}   tag ${TAG}`);
  console.log(`    PORT         : ${PORT}   DISPLAY: xvfb-run -a (auto, never :0)`);

  let COPY = null;
  { // BOTH parts: classic edits it; home's R3 needs a level open for the badge to exist

    if (!existsSync(`${FIXTURE}/artnem/8x8 - GHZ1.nem`)) throw new Error(`fixture missing: ${FIXTURE}`);
    COPY = mkdtempSync(join(tmpdir(), 'cdps0911-s1-'));
    cpSync(FIXTURE, COPY, { recursive: true });
    if (COPY === FIXTURE || COPY.startsWith(`${ROOT}/test/`)) throw new Error('refusing: the copy is the fixture');
    console.log(`    project copy : ${COPY}   (fresh cpSync of ${FIXTURE})`);
  }

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
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
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const waitDbg = async () => {
      for (let i = 0; i < 100; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg: rebuild with VITE_AURORA_DEBUG=1');
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3000);
    if (!(await waitDbg())) throw new Error('no __dbg after reload');
    console.log(`    dpr at start : ${await c.evalExpr('window.devicePixelRatio')}`);

    const shot = async (name) => {
      const s = await c.send('Page.captureScreenshot', { format: 'png' });
      const p = `${CAPTURES}/${PART}-${name}-${TAG}.png`;
      writeFileSync(p, Buffer.from(s.data, 'base64'));
      console.log(`   shot: ${p.slice(ROOT.length + 1)}`);
    };
    /** A real press/release at the element's integer centre, only if a hit
     *  test says that point lands on it. Returns what it aimed at. */
    const realClick = async (selectorExpr, { scroll = false } = {}) => {
      const p = await c.json(String.raw`(() => {
        const el = ${selectorExpr};
        if (!el) return null;
        if (${scroll}) el.scrollIntoView({ block: 'center', inline: 'center' });
        const b = el.getBoundingClientRect();
        const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
        const hit = document.elementFromPoint(x, y);
        return { x, y, hitOk: !!(hit && (hit === el || el.contains(hit))),
                 hitTag: hit ? hit.tagName : null, dpr: window.devicePixelRatio,
                 rect: { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) } };
      })()`);
      if (!p || !p.hitOk) return p;
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none', buttons: 0 });
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
      await sleep(40);
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
      return p;
    };
    const key = async (k, code, vk, modifiers = 0) => {
      const p = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
      await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p });
      await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
    };
    const typeText = async (s) => {
      for (const ch of s) {
        const code = `Key${ch.toUpperCase()}`;
        const vk = ch.toUpperCase().charCodeAt(0);
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: vk });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk });
        await sleep(60);
      }
    };

    if (PART === 'classic') await classicPart({ c, COPY, shot, realClick, key });
    else await homePart({ c, COPY, shot, realClick, key, typeText });
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
    try { rmSync(SOCK_DIR, { recursive: true, force: true }); } catch { /* best effort */ }
    if (COPY && !process.env.KEEP_COPY) { try { rmSync(COPY, { recursive: true, force: true }); } catch { /* */ } }
  }

  const pass = results.filter((r) => r.ok === true).length;
  const load1 = os.loadavg();
  console.log(`\n════ PART=${PART}: ${pass}/${results.length} rows PASS · ${fails.length} FAIL · `
    + `${unmeasurable.length} UNMEASURABLE · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  console.log(`     loadavg at start ${load0.map((n) => n.toFixed(2)).join(' ')} · `
    + `at end ${load1.map((n) => n.toFixed(2)).join(' ')}`);
  if (fails.length) { console.log('FAILING:'); for (const f of fails) console.log(`  ${f}`); }
  if (unmeasurable.length) { console.log('UNMEASURABLE:'); for (const u of unmeasurable) console.log(`  ${u}`); }
  console.log('END-OF-RUN');
  process.exit(fails.length ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART=classic — R1 (A-F3) then R2 (F-1), one fixture copy, one launch.
// ═══════════════════════════════════════════════════════════════════════════
async function classicPart({ c, COPY, shot, realClick, key }) {
  const GHZ1 = `${COPY}/artnem/8x8 - GHZ1.nem`;
  const GHZ2 = `${COPY}/artnem/8x8 - GHZ2.nem`;
  const st = (p) => { const s = statSync(p, { bigint: true }); return { size: Number(s.size), mtimeNs: String(s.mtimeNs) }; };
  const pristine = { g1: st(GHZ1), g2: st(GHZ2) };
  console.log(`\n    stat BEFORE  : GHZ1 ${JSON.stringify(pristine.g1)}  GHZ2 ${JSON.stringify(pristine.g2)}`);

  const opened = await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(COPY)})`).then(() => 'ok', (e) => `threw: ${e.message}`);
  let ps = null;
  for (let i = 0; i < 60; i++) {
    ps = await c.json('window.__dbg.projStatus()').catch(() => null);
    if (ps && ps.status === 'open') break;
    await sleep(500);
  }
  check('0a', 'the COPIED fixture opened as a classic project (setup, through __dbg.openDir)',
    !!(ps && ps.status === 'open'), `openDir -> ${opened}; projStatus ${JSON.stringify(ps)}`);
  if (!ps || ps.status !== 'open') throw new Error('project did not open');
  await sleep(1500);

  const LEVELS = `document.querySelector('[data-section="explorer.levels"]')`;
  // ⚠ THE TITLE IS A BARE TEXT NODE beside the chevron span
  // (CollapsibleSection.tsx: `<span>{chevron}{title}</span>` inside the header
  // div that owns onClick), so NO element's own text is exactly "Levels". Run 1
  // hunted a leaf with that text, found null, sent no click, and read "no rows"
  // as the group's contents. The aim is the title span, first child of the
  // header div; its centre is on the word.
  const LEVELS_HEADER = String.raw`(() => { const s = ${LEVELS}; if (!s || !s.firstElementChild) return null;
    return s.firstElementChild.querySelector('span') || s.firstElementChild; })()`;
  const levelsCollapsed = () => c.evalExpr(`(() => { const s = ${LEVELS}; return s ? s.getAttribute('data-section-collapsed') : null; })()`);
  const setLevels = async (want) => {
    for (let i = 0; i < 3; i++) {
      const cur = await levelsCollapsed();
      if (cur === (want === 'collapsed' ? 'true' : 'false')) return cur;
      await realClick(LEVELS_HEADER);
      await sleep(500);
    }
    return levelsCollapsed();
  };
  const ROWS = String.raw`(() => { const s = ${LEVELS}; if (!s) return [];
    return [...s.querySelectorAll('button')].map((b) => ({ label: (b.querySelector('span')?.textContent || '').trim(),
      disabled: b.disabled, dot: !!b.querySelector('[aria-label="Unsaved changes"]') })); })()`;
  const ROW = (re) => String.raw`(() => { const s = ${LEVELS}; if (!s) return null;
    return [...s.querySelectorAll('button')].find((b) => ${re}.test((b.querySelector('span')?.textContent || '').trim())) || null; })()`;
  const ACT1 = String.raw`/green hill.*\b1\b|ghz.*\b1\b/i`;
  const ACT2 = String.raw`/green hill.*\b2\b|ghz.*\b2\b/i`;
  const TABS = String.raw`(() => [...document.querySelectorAll('[role="tablist"] > div')].map((t) => ({
    title: t.title, dirty: !!t.querySelector('[aria-label="Unsaved changes"]') })))()`;
  const ACTIVE_CLOSE = String.raw`(() => { const tabs = [...document.querySelectorAll('[role="tablist"] > div')];
    const t = tabs.find((x) => /green hill|ghz/i.test(x.title || '')); return t ? t.querySelector('span[title="Close tab"]') : null; })()`;

  const openAct1 = async () => {
    await setLevels('expanded');
    const rows = await c.json(ROWS);
    const clicked = await realClick(ROW(ACT1), { scroll: true });
    let lvl = null;
    for (let i = 0; i < 60; i++) {
      lvl = await c.json('window.__dbg.levelState()').catch(() => null);
      if (lvl && lvl.status === 'ready' && lvl.zone === 'ghz' && String(lvl.act) === '1') break;
      await sleep(500);
    }
    return { rows, clicked, lvl };
  };

  // ── Arm the Art > Tile tier on tile $30 with the pencil. Every step a real click.
  const armTile30 = async () => {
    const out = {};
    out.art = await realClick(`[...document.querySelectorAll('[aria-label="Facets"] button')].find((b) => b.textContent.trim() === 'Art') || null`);
    await sleep(1000);
    out.tier = await realClick(String.raw`[...document.querySelectorAll('button')].find((e) => {
      if (e.textContent.trim() !== 'Tile') return false; const p = e.parentElement;
      return !!p && p.children.length === 3 && [...p.children].map((k) => k.textContent.trim()).join(',') === 'Chunk,Block,Tile'; }) || null`);
    await sleep(800);
    const THUMB = String.raw`[...document.querySelectorAll('button[title^="tile "]')].find((b) => /^tile \$0*30\b/i.test(b.title)) || null`;
    out.thumbTitle = await c.evalExpr(`(() => { const b = ${THUMB}; return b ? b.title : null; })()`);
    out.thumbLocked = await c.evalExpr(`(() => { const b = ${THUMB}; return b ? b.textContent.includes('\u{1F512}') : null; })()`);
    out.thumb = await realClick(THUMB, { scroll: true });
    await sleep(600);
    out.tileTitle = await c.evalExpr(String.raw`(() => { const s = [...document.querySelectorAll('span')]
      .find((e) => /^Tile \$[0-9A-F]+$/.test(e.textContent.trim())); return s ? s.textContent.trim() : null; })()`);
    out.pencil = await realClick(String.raw`(() => { const r = [...document.querySelectorAll('div')].find((d) => d.style && d.style.width === '44px');
      return r ? [...r.querySelectorAll('button[aria-label]')].find((b) => b.getAttribute('aria-label').startsWith('Pencil')) || null : null; })()`);
    await sleep(300);
    return out;
  };
  const CANVAS = String.raw`(() => { const h = [...document.querySelectorAll('div')].find((d) => d.style && d.style.margin === 'auto' && d.querySelector('canvas'));
    return h ? h.querySelector('canvas') : null; })()`;
  /** Paint art pixel (px,py) of the edited tile with swatch `sw`, by a real press. */
  const paintPixel = async (px, py, sw) => {
    const swatch = await realClick(String.raw`[...document.querySelectorAll('button[title]')]
      .filter((b) => /^index \d+/.test(b.title) && b.style && b.style.width === '22px')[${sw}] || null`);
    await sleep(200);
    const pt = await c.json(String.raw`(() => { const cv = ${CANVAS}; if (!cv) return null;
      cv.scrollIntoView({ block: 'center', inline: 'center' });
      const r = cv.getBoundingClientRect(); const z = r.width / 8;
      const x = Math.round(r.left + (${px} + 0.5) * z), y = Math.round(r.top + (${py} + 0.5) * z);
      const hit = document.elementFromPoint(x, y);
      return { x, y, z: +z.toFixed(3), hitOk: hit === cv, dpr: window.devicePixelRatio,
               rect: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) } }; })()`);
    if (!pt || !pt.hitOk) return { swatch, pt };
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, button: 'none', buttons: 0 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 });
    await sleep(50);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(400);
    return { swatch, pt };
  };
  const hash30 = () => c.evalExpr('window.__dbg.classic.tileHash(0x30)');
  const paintUntilChanged = async (px, py) => {
    const before = await hash30();
    let last = null;
    for (const sw of [15, 1, 7]) {
      last = await paintPixel(px, py, sw);
      if ((await hash30()) !== before) return { before, after: await hash30(), ...last, swatchIndex: sw };
    }
    return { before, after: await hash30(), ...last, swatchIndex: null };
  };

  // ═════════════════════════════════════════════════════════════════════════
  // R1 — A-F3: a GHZ1 tile save, its toast, and GHZ2 on disk.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── R1: A-F3, a tile in GHZ1 painted and saved through Ctrl+S ────');
  const o1 = await openAct1();
  check('R1.0', 'GHZ act 1 opened by a REAL click on its Explorer row',
    !!(o1.lvl && o1.lvl.status === 'ready' && o1.clicked && o1.clicked.hitOk),
    `rows ${JSON.stringify(o1.rows)}; clicked ${JSON.stringify(o1.clicked)}; levelState ${JSON.stringify(o1.lvl)}`);
  if (!o1.lvl || o1.lvl.status !== 'ready') throw new Error('GHZ1 did not open');
  await sleep(1500);
  const titleBeforeEdit = await c.evalExpr('document.title');

  const arm1 = await armTile30();
  const paint1 = await paintUntilChanged(0, 0);
  const tabs1 = await c.json(TABS);
  check('R1.1', 'a real pencil press on tile $30 (Art > Tile) changed the tile, and the tab says so',
    paint1.after !== paint1.before && tabs1.some((t) => t.dirty),
    `arm ${JSON.stringify(arm1)}\n        paint ${JSON.stringify(paint1)}\n        tabs ${JSON.stringify(tabs1)}`);
  if (paint1.after === paint1.before) throw new Error('no pixel changed: nothing to save');
  await shot('r1-painted');

  await key('s', 'KeyS', 83, 2);            // Ctrl+S, the real window keydown path
  const tKey = Date.now();
  let first = null;
  for (let i = 0; i < 60 && !first; i++) {
    const ts = await c.json(TOASTS).catch(() => []);
    first = ts.find((t) => /^Saved \d+ level/.test(t.text)) || null;
    if (!first) await sleep(100);
  }
  const tFirst = Date.now() - tKey;
  const sampleAt = async (ms) => {
    const wait = tKey + ms - Date.now();
    if (wait > 0) await sleep(wait);
    const ts = await c.json(TOASTS).catch(() => []);
    return { atMs: Date.now() - tKey, toast: ts.find((t) => /^Saved \d+ level/.test(t.text)) || null };
  };
  const s1 = await sampleAt(1000);
  await shot('r1-toast-1s');
  const storeType = await c.json(`window.__dbg.toasts().filter((t) => /^Saved \\d+ level/.test(t.message))`);
  const s5 = await sampleAt(5000);
  await shot('r1-toast-5s');
  const s75 = await sampleAt(7500);
  const s11 = await sampleAt(11000);
  const after = { g1: st(GHZ1), g2: st(GHZ2) };
  console.log(`    stat AFTER   : GHZ1 ${JSON.stringify(after.g1)}  GHZ2 ${JSON.stringify(after.g2)}`);
  const text = first ? first.text : '';
  const m = /art grew: artnem\/8x8 - GHZ1\.nem (\d+) to (\d+) bytes \(\+(\d+)\)/.exec(text);

  check('R1.2', 'a save toast appears carrying the art clause `art grew: ... GHZ1.nem A to B bytes (+N)`',
    !!first && !!m, `first seen ${tFirst}ms after the chord: ${JSON.stringify(text)}`);
  check('R1.3', 'the toast is WARNING tier (the store), with its border colour printed off the screen',
    storeType.length > 0 && storeType.every((t) => t.type === 'warning'),
    `store ${JSON.stringify(storeType)}; painted border ${first ? first.border : 'n/a'}`);
  check('R1.4', 'it is PAINTED at ~1s: rects, hit at its integer centre, inside the viewport',
    toastPainted(s1.toast), JSON.stringify(s1));
  check('R1.5', 'it is STILL painted at ~5s and ~7.5s, past the 2.2s a success toast gets',
    toastPainted(s5.toast) && toastPainted(s75.toast), `${JSON.stringify(s5)}\n        ${JSON.stringify(s75)}`);
  check('R1.6', 'and it has left by ~11s (a timed 8s dwell, not a stuck toast)',
    s11.toast === null, JSON.stringify(s11));
  check('R1.7', 'GHZ2 on disk: bytes AND mtime unchanged',
    after.g2.size === pristine.g2.size && after.g2.mtimeNs === pristine.g2.mtimeNs,
    `GHZ2 ${JSON.stringify(pristine.g2)} -> ${JSON.stringify(after.g2)}`);
  check('R1.8', 'CONTROL for R1.7: GHZ1 on disk DID change (the save landed, so GHZ2 standing still means something)',
    after.g1.mtimeNs !== pristine.g1.mtimeNs,
    `GHZ1 ${JSON.stringify(pristine.g1)} -> ${JSON.stringify(after.g1)} (size delta ${after.g1.size - pristine.g1.size})`);
  check('R1.9', 'the toast\'s two sizes are the ones `stat` reads on this disk, and it never names GHZ2',
    !!m && Number(m[1]) === pristine.g1.size && Number(m[2]) === after.g1.size
      && Number(m[3]) === after.g1.size - pristine.g1.size && !/GHZ2/.test(text),
    m ? `toast ${m[1]} -> ${m[2]} (+${m[3]}); stat ${pristine.g1.size} -> ${after.g1.size}` : 'no art clause to compare');

  // ═════════════════════════════════════════════════════════════════════════
  // R2 — F-1: unsaved work stays visible after its tab closes.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── R2: F-1, a dirty level tab closed ────');
  const DOTS_ANY = String.raw`[...document.querySelectorAll('[aria-label="Unsaved changes"]')].length`;
  const SEAT_B = String.raw`[...document.querySelectorAll('[title]')].filter((e) => /unsaved/i.test(e.getAttribute('title'))).map((e) => e.getAttribute('title'))`;
  const HEADER_DOT = String.raw`(() => { const s = ${LEVELS}; return s ? s.querySelector('[aria-label="Unsaved changes"]') : null; })()`;

  // ── CONTROL: the same close on a CLEAN tab (R1's save left it clean).
  const tabsClean = await c.json(TABS);
  const titleClean = await c.evalExpr('document.title');
  const closeClean = await realClick(ACTIVE_CLOSE);
  await sleep(900);
  await setLevels('collapsed');
  const ctrl = {
    tabsBefore: tabsClean, titleBefore: titleClean, close: closeClean,
    tabsAfter: await c.json(TABS), title: await c.evalExpr('document.title'),
    dots: await c.evalExpr(DOTS_ANY), seatB: await c.json(SEAT_B),
    collapsed: await levelsCollapsed(), headerDot: await c.json(PAINTED(HEADER_DOT)),
  };
  await shot('r2-control-clean-close');
  check('R2.0', 'CONTROL: a CLEAN level tab closed leaves no marker anywhere (title, header, DOM scan, seat B\'s scan)',
    !!(closeClean && closeClean.hitOk) && !ctrl.tabsAfter.some((t) => /green hill|ghz/i.test(t.title))
      && !ctrl.title.startsWith('●') && ctrl.dots === 0 && ctrl.seatB.length === 0 && ctrl.headerDot.found === false
      && !titleBeforeEdit.startsWith('●'),
    `title before any edit ${JSON.stringify(titleBeforeEdit)}; ${JSON.stringify(ctrl)}`);

  // ── Dirty it again, then close.
  const o2 = await openAct1();
  await sleep(1200);
  const arm2 = await armTile30();
  const paint2 = await paintUntilChanged(1, 1);
  const tabsDirty = await c.json(TABS);
  const titleTabOpen = await c.evalExpr('document.title');
  check('R2.1', 'the level is dirty again by a real pencil press, and its TAB carries the dot',
    paint2.after !== paint2.before && tabsDirty.some((t) => t.dirty),
    `reopen ${JSON.stringify(o2.clicked)} ${JSON.stringify(o2.lvl)}; arm ${JSON.stringify(arm2)}; paint ${JSON.stringify(paint2)}; tabs ${JSON.stringify(tabsDirty)}; title ${JSON.stringify(titleTabOpen)}`);
  const mtimeBeforeSaveAll = st(GHZ1).mtimeNs;
  const closeDirty = await realClick(ACTIVE_CLOSE);
  await sleep(900);
  const tabsGone = await c.json(TABS);
  const stillEdited = await hash30();
  check('R2.2', 'the ✕ press closed the tab, and the edit is still resident (tile $30 still holds the paint)',
    !!(closeDirty && closeDirty.hitOk) && !tabsGone.some((t) => /green hill|ghz/i.test(t.title)) && stillEdited === paint2.after,
    `close ${JSON.stringify(closeDirty)}; tabs ${JSON.stringify(tabsGone)}; tileHash ${stillEdited} vs painted ${paint2.after}`);
  const titleClosed = await c.evalExpr('document.title');
  check('R2.3', 'document.title starts with `● Aurora - ` after the close',
    titleClosed.startsWith('● Aurora - '), JSON.stringify(titleClosed));

  const col = await setLevels('collapsed');
  const hdr = await c.json(PAINTED(HEADER_DOT));
  const hdrTitle = await c.evalExpr(`(() => { const d = ${HEADER_DOT}; return d ? d.getAttribute('title') : null; })()`);
  await shot('r2-dirty-closed-collapsed');
  check('R2.4', 'the COLLAPSED Levels header paints the dot (in the tree scroller\'s box, the viewport, and hit)',
    col === 'true' && onScreen(hdr), `collapsed=${col}; dot ${JSON.stringify(hdr)}; title ${JSON.stringify(hdrTitle)}`);

  await setLevels('expanded');
  await sleep(300);
  const rowDot = await c.json(PAINTED(String.raw`(() => { const b = ${ROW(ACT1)}; return b ? b.querySelector('[aria-label="Unsaved changes"]') : null; })()`));
  const act2Dot = await c.evalExpr(String.raw`(() => { const b = ${ROW(ACT2)}; return b ? !!b.querySelector('[aria-label="Unsaved changes"]') : 'no-act2-row'; })()`);
  const rowsNow = await c.json(ROWS);
  const scan = { dots: await c.evalExpr(DOTS_ANY), seatB: await c.json(SEAT_B) };
  await shot('r2-dirty-closed-expanded');
  check('R2.5', 'expanded, the GHZ act 1 ROW paints the dot; act 2\'s row does not (control)',
    onScreen(rowDot) && act2Dot === false, `row dot ${JSON.stringify(rowDot)}; act 2 dot ${JSON.stringify(act2Dot)}; rows ${JSON.stringify(rowsNow)}`);
  check('R2.6', 'a full-DOM scan for aria-label="Unsaved changes" is non-empty, and so is seat B\'s /unsaved/i title scan',
    scan.dots > 0 && scan.seatB.length > 0, JSON.stringify(scan));

  // ── Ctrl+Shift+S: everything clears.
  await key('S', 'KeyS', 83, 10);
  let cleared = null;
  for (let i = 0; i < 60; i++) {
    const t = await c.evalExpr('document.title');
    if (!t.startsWith('●')) { cleared = t; break; }
    await sleep(100);
  }
  await sleep(700);
  const toastsAfter = await c.json(TOASTS).catch(() => []);
  const fin = {
    title: await c.evalExpr('document.title'), dots: await c.evalExpr(DOTS_ANY), seatB: await c.json(SEAT_B),
    rowDot: await c.evalExpr(String.raw`(() => { const b = ${ROW(ACT1)}; return b ? !!b.querySelector('[aria-label="Unsaved changes"]') : 'no-row'; })()`),
    toasts: toastsAfter.map((t) => t.text),
  };
  const g1End = st(GHZ1);
  const g2End = st(GHZ2);
  await shot('r2-after-save-all');
  check('R2.7', 'Ctrl+Shift+S clears the title marker, every dot, and seat B\'s scan',
    cleared !== null && !fin.title.startsWith('●') && fin.dots === 0 && fin.seatB.length === 0 && fin.rowDot === false,
    JSON.stringify(fin));
  check('R2.8', 'CONTROL for R2.7: the chord actually WROTE (GHZ1 mtime moved), so the clearing is a save and not a lost edit; GHZ2 still untouched',
    g1End.mtimeNs !== mtimeBeforeSaveAll && g2End.mtimeNs === pristine.g2.mtimeNs && g2End.size === pristine.g2.size,
    `GHZ1 mtime ${mtimeBeforeSaveAll} -> ${g1End.mtimeNs} (size ${g1End.size}); GHZ2 ${JSON.stringify(g2End)} vs pristine ${JSON.stringify(pristine.g2)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// PART=home — R4 (F-3) first on the untouched profile, then R3 (F-2), then
// R4's recents-listed CONTROL arm last because it writes the recents file.
// ═══════════════════════════════════════════════════════════════════════════
async function homePart({ c, COPY, shot, realClick, key, typeText }) {
  const NOTHING = 'No project is open, so there is nothing to filter';
  const NO_RECENT = 'No recent project matches';
  const PREFIX = 'Aether: could not connect. ';
  const ENOENT = `No emulator is listening at ${SOCK}. There is no socket file at that path (connect ENOENT).`;
  const ECONN = `No emulator is listening at ${SOCK}. A socket file is there, but nothing answers on it; `
    + 'an emulator that has exited can leave one behind (connect ECONNREFUSED).';

  const FILTER = `document.querySelector('input[placeholder="Filter…"]')`;
  const EXPLORER = `(() => { const f = ${FILTER}; return f ? f.parentElement.parentElement : null; })()`;
  const LEAF = (s) => String.raw`(() => { const r = ${EXPLORER}; if (!r) return null;
    return [...r.querySelectorAll('div')].find((d) => (d.textContent || '').trim() === ${JSON.stringify(s)}
      && ![...d.children].some((k) => (k.textContent || '').trim() === ${JSON.stringify(s)})) || null; })()`;
  const OPEN_BTN = String.raw`(() => { const r = ${EXPLORER}; if (!r) return null;
    return [...r.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Open Project…') || null; })()`;
  // ⚠ AWAITED INSIDE THE PAGE. The first version passed the promise to
  // JSON.stringify, which prints `{}` for ANY promise, and the row read that
  // as "the shape has no list". RecentsState is `{ projects, read, reason, … }`
  // (src/shared/recents.ts), and `read` is printed because an empty `projects`
  // means opposite things for 'absent' and 'unreadable'.
  const recentsNow = async () => {
    const raw = await c.evalExpr('(async () => JSON.stringify(await window.api.getRecentProjects()))()')
      .then((s) => JSON.parse(s), (e) => ({ threw: e.message }));
    const list = raw && Array.isArray(raw.projects) ? raw.projects : null;
    return { raw: raw && raw.projects ? { read: raw.read, reason: raw.reason, projects: raw.projects.map((p) => p.path) } : raw,
      count: list ? list.length : null, read: raw ? raw.read : null };
  };
  const clearFilter = async () => {
    await realClick(FILTER);
    await key('a', 'KeyA', 65, 2);
    await key('Delete', 'Delete', 46, 0);
    await sleep(300);
  };

  // ═════════════════════════════════════════════════════════════════════════
  // R4 — F-3: the empty filter on a profile that has never opened anything.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── R4: F-3, `zon` typed into Filter… with no project and no recents ────');
  const rec0 = await recentsNow();
  const explorerText0 = await c.evalExpr(`(() => { const r = ${EXPLORER}; return r ? r.innerText : null; })()`);
  check('R4.0', 'PRECONDITION: this profile lists NO recent projects (fresh --user-data-dir)',
    rec0.count === 0, `getRecentProjects -> ${JSON.stringify(rec0.raw)}; Explorer reads ${JSON.stringify(explorerText0)}`);
  const beforeType = { sentence: await c.json(PAINTED(LEAF(NOTHING))), open: await c.json(PAINTED(OPEN_BTN)) };
  check('R4.1', 'CONTROL: before any typing the sentence is ABSENT and `Open Project…` is painted',
    beforeType.sentence.found === false && onScreen(beforeType.open), JSON.stringify(beforeType));
  const aim = await realClick(FILTER);
  await sleep(200);
  await typeText('zon');
  await sleep(500);
  const val = await c.evalExpr(`(() => { const f = ${FILTER}; return f ? f.value : null; })()`);
  const sentence = await c.json(PAINTED(LEAF(NOTHING)));
  const openBtn = await c.json(PAINTED(OPEN_BTN));
  const noMatches = await c.evalExpr(`(() => { const r = ${EXPLORER}; return r ? /No matches/.test(r.innerText) : null; })()`);
  await shot('r4-no-project-filter');
  check('R4.2', '`zon` is in the box, typed through real key events at an integer aim',
    val === 'zon' && !!(aim && aim.hitOk), `value ${JSON.stringify(val)}; aim ${JSON.stringify(aim)}`);
  check('R4.3', `"${NOTHING}" is PAINTED`, onScreen(sentence), JSON.stringify(sentence));
  check('R4.4', '`Open Project…` is STILL painted beside it', onScreen(openBtn), JSON.stringify(openBtn));
  check('R4.5', 'and the old false sentence `No matches` is nowhere in the Explorer', noMatches === false, `No matches present: ${noMatches}`);
  await clearFilter();

  // ═════════════════════════════════════════════════════════════════════════
  // R3 — F-2: the two socket sentences, no emulator anywhere. CALLED LAST (the
  // bottom of this function): the badge is mounted only in a LEVEL's status bar,
  // so R3 opens a project and an act, which writes this profile's recents. The
  // first run of this file looked for the badge on Home and found nothing.
  // ═════════════════════════════════════════════════════════════════════════
  const runR3 = async () => {
  console.log('\n──── R3: F-2, the badge pressed at a missing path, then at a dead socket ────');
  const opened = await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(COPY)})`).then(() => 'ok', (e) => `threw: ${e.message}`);
  for (let i = 0; i < 40; i++) {
    const ps = await c.json('window.__dbg.projStatus()').catch(() => null);
    if (ps && ps.status === 'open') break;
    await sleep(500);
  }
  await c.evalExpr('window.__dbg.activate("ghz", 1)').catch(() => {});
  let lvl = null;
  for (let i = 0; i < 60; i++) {
    lvl = await c.json('window.__dbg.levelState()').catch(() => null);
    if (lvl && lvl.status === 'ready') break;
    await sleep(500);
  }
  await sleep(1500);
  note('R3', `setup, not under test: openDir(copy) -> ${opened}; activate ghz 1 -> ${JSON.stringify(lvl)}`);
  const BADGE = `document.querySelector('button[aria-label^="Aether bus:"]')`;
  const badge0 = await c.json(PAINTED(BADGE));
  const toasts0 = await c.json(TOASTS).catch(() => []);
  check('R3.0', 'PRECONDITION: the badge is painted and offline, no refusal toast is up, and no file exists at ORACLE_SOCKET',
    onScreen(badge0) && /offline/.test(badge0.text) && !toasts0.some((t) => t.text.startsWith(PREFIX)) && !existsSync(SOCK),
    `badge ${JSON.stringify(badge0)}; toasts ${JSON.stringify(toasts0.map((t) => t.text))}; exists(${SOCK})=${existsSync(SOCK)}`);

  const waitToast = async (re) => {
    for (let i = 0; i < 80; i++) {
      const ts = await c.json(TOASTS).catch(() => []);
      const hit = ts.find((t) => re.test(t.text));
      if (hit) return hit;
      await sleep(100);
    }
    return null;
  };
  const press1 = await realClick(BADGE);
  const t1 = await waitToast(/ENOENT/);
  await sleep(300);
  const t1again = (await c.json(TOASTS).catch(() => [])).find((t) => /ENOENT/.test(t.text)) || t1;
  await shot('r3-enoent');
  const store1 = await c.json('window.__dbg.toasts().filter((t) => t.message.startsWith("Aether"))');
  check('R3.1', 'press 1 (no file): the toast reads the ENOENT sentence EXACTLY, and it is painted',
    !!(press1 && press1.hitOk) && !!t1again && t1again.text === PREFIX + ENOENT && toastPainted(t1again),
    `aim ${JSON.stringify(press1)}\n        toast ${JSON.stringify(t1again)}\n        expected ${JSON.stringify(PREFIX + ENOENT)}\n        store ${JSON.stringify(store1)}`);

  // A dead socket FILE: bind, then SIGKILL, so nothing unlinks it. The recipe of
  // src/main/aether/__tests__/socket-dead-link.test.ts. The child is gone when
  // spawnSync returns; nothing is left running.
  const r = spawnSync(process.execPath, ['-e',
    `require('net').createServer().listen(${JSON.stringify(SOCK)}, () => process.kill(process.pid, 'SIGKILL'))`],
  { timeout: 10000 });
  let isSock = false;
  try { isSock = lstatSync(SOCK).isSocket(); } catch { /* absent */ }
  note('R3', `dead socket made: child signal ${r.signal}, status ${r.status}; ${SOCK} isSocket=${isSock}`);
  if (!isSock) {
    check('R3.2', 'press 2 (dead socket file): the ECONNREFUSED sentence', 'UNMEASURABLE',
      `could not leave a socket file at ${SOCK} (signal ${r.signal})`);
  } else {
    for (let i = 0; i < 30; i++) {
      if (await c.evalExpr(`(() => { const b = ${BADGE}; return !!b && !b.disabled; })()`)) break;
      await sleep(100);
    }
    const press2 = await realClick(BADGE);
    const t2 = await waitToast(/ECONNREFUSED/);
    await sleep(300);
    const t2again = (await c.json(TOASTS).catch(() => [])).find((t) => /ECONNREFUSED/.test(t.text)) || t2;
    await shot('r3-econnrefused');
    const allNow = await c.json(TOASTS).catch(() => []);
    check('R3.2', 'press 2 (dead socket file): the toast reads the ECONNREFUSED sentence EXACTLY, and it is painted',
      !!(press2 && press2.hitOk) && !!t2again && t2again.text === PREFIX + ECONN && toastPainted(t2again),
      `aim ${JSON.stringify(press2)}\n        toast ${JSON.stringify(t2again)}\n        expected ${JSON.stringify(PREFIX + ECONN)}`);
    check('R3.3', 'CONTROL: the two presses said DIFFERENT things, and no toast carries the old raw relay',
      !!t1again && !!t2again && t1again.text !== t2again.text && !allNow.some((t) => /Aether socket error:/.test(t.text)),
      `toasts now ${JSON.stringify(allNow.map((t) => t.text))}`);
  }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // R4's CONTROL ARM: with a recent listed, the SAME typing says a different
  // sentence. Last, because it writes this private profile's recents file.
  // ═════════════════════════════════════════════════════════════════════════
  console.log('\n──── R4 control: the same `zon` with one recent project listed ────');
  let recentDir;
  do { recentDir = mkdtempSync('/tmp/cdps0911-recent-'); } while (/zon/i.test(recentDir));
  await c.evalExpr(`window.api.addRecentProject(${JSON.stringify(recentDir)}, 'sweep control')`);
  await c.send('Page.reload');
  await sleep(3500);
  const rec1 = await recentsNow();
  await realClick(FILTER);
  await sleep(200);
  await typeText('zon');
  await sleep(500);
  const ctrlSentence = await c.json(PAINTED(LEAF(NO_RECENT)));
  const ctrlNothing = await c.json(PAINTED(LEAF(NOTHING)));
  await shot('r4-control-with-recent');
  check('R4.6', `CONTROL: with one recent listed the same typing says "${NO_RECENT}" and NOT the no-project sentence`,
    rec1.count === 1 && onScreen(ctrlSentence) && ctrlNothing.found === false,
    `recents ${JSON.stringify(rec1.raw)}; sentence ${JSON.stringify(ctrlSentence)}; nothing-to-filter found=${ctrlNothing.found}`);
  try { rmSync(recentDir, { recursive: true, force: true }); } catch { /* */ }
  await clearFilter();
  await runR3();
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok === true).length}/${results.length} rows had run: `
    + 'this is NOT a pass over the rows that never ran.');
  console.log('END-OF-RUN');
  process.exit(2);
});
