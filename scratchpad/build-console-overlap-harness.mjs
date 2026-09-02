#!/usr/bin/env node
// CAN THE OWNER REACH THE BOTTOM OF THE RIGHT-HAND COLUMN WHILE THE BUILD
// CONSOLE IS OPEN?
//
// The report: "this right bar cuts off with the console thing popped up so I
// can't remove the last vsplit". The Remove button exists, it is enabled, and
// it cannot be clicked.
//
// ═══ WHY THIS FILE AND NOT A VITEST ROW ═══
//
// The node suite has no React, no layout engine and no compositor. ~5,100 rows
// pass over an app where a 260px overlay is parked on top of a column's last
// control. Nothing short of a real window with a real stacking context can see
// it, so this drives the real app over CDP.
//
// ═══ WHAT MADE THE FIRST ATTEMPT AT THIS WORTHLESS ═══
//
// A previous pass diagnosed a missing `minHeight: 0` on App.tsx's flex chain,
// patched it, and wrote a harness that SHRANK THE VIEWPORT and asked whether
// the last Remove button was reachable. It reported REACHABLE — and still
// reported REACHABLE with the patch reverted. The row measured a condition the
// defect does not live in: the console was never opened.
//
// So the condition here is THE CONSOLE BEING OPEN, at the window size the owner
// uses, and every row that asserts reachability is paired with the same
// assertion taken with the console CLOSED — so a row that can only ever return
// green is visible as one.
//
// ═══ THE PREDICATE: REACHABILITY, NOT VISIBILITY ═══
//
// A control below the fold is not a defect; a scroller brings it up. It is a
// defect only when NO scroll position can. `reach()` below therefore
//   1. scrollIntoView({block:'center'}) — scrolls every scrollable ancestor;
//   2. if that does not seat it, sweeps each scrollable ancestor's full
//      scrollTop range in 24 steps, checking at every stop;
//   3. at each stop asks TWO questions: is the box inside the viewport, AND
//      does `document.elementFromPoint` at its centre return this element?
//
// Question 2 is the one that matters here. An overlay makes a control
// visible-but-unclickable, and geometry alone cannot tell that from working.
// The failure detail names the element the hit test DID land on, so a red row
// says what is covering the button rather than merely that something is.
//
// ═══ HOW THE CONSOLE IS OPENED ═══
//
// `window.__dbg.aether.showFailedBuild(lines)` writes the SAME store object
// `aetherStore.build()`'s failure branch writes — state 'failed', the output
// lines, a `Build failed (exit N)` summary, `buildPanelOpen: true`. BuildPanel
// is a pure function of those five fields, so this is faithful for every
// question about where the panel lands. The only thing skipped is spawning
// build.sh, which the panel cannot observe. Running a real build was rejected:
// it writes into the owner's live aeon tree and reloads his live emulator.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed. The project it opens is
// a PRIVATE COPY (scratchpad/fixtures/aeon-console-fix), never ../aeon.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Make the fixture (gitignored — it is 56M of the owner's game data):
//   rsync -a --exclude=.git --exclude=docs --exclude=tools \
//     ../../aeon/ scratchpad/fixtures/aeon-console-fix/
// (games/, art/ and engine/ must come across WHOLE — an `--exclude=*.bin`
//  strips the tile blobs and the project then refuses to open.)
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     node scratchpad/build-console-overlap-harness.mjs

import { AURORA_DIR, checkoutOverride } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9411);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
// A PRIVATE COPY. The owner is building in ../aeon right now; this harness must
// not so much as open it.
// The default is a fixture inside this repo, never the live tree; the override
// goes through the resolver so it picks up the aliases and refuses a value that
// is set but names nothing.
const AEONDIR = checkoutOverride('aeon')?.value ?? resolve(ROOT, 'scratchpad/fixtures/aeon-console-fix');
const SCREEN = process.env.SCREEN ?? '1680x1050x24';
const SHOTS = `${ROOT}/scratchpad/shots-build-console`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'console_probe';
/** How many layers the probe scene gets. The cap is EFFECTS_LAYER_COUNT.max
 *  (16 at the time of writing); this asks for more than that and takes what the
 *  Add button gives, so the number is never a pin. */
const WANT_LAYERS = 16;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(path, timeoutMs = 1500) {
  return new Promise((resolve2, reject) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: timeoutMs }, (res) => {
      let d = ''; res.on('data', (ch) => (d += ch));
      res.on('end', () => { try { resolve2(JSON.parse(d)); } catch (e) { reject(e); } });
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
  const send = (method, params = {}) => new Promise((resolve2, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve2(m.result)));
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
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-build-console/${name}.png`);
}

const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const clickByLabel = (label) => String.raw`
(() => {
  const el = document.querySelector('[aria-label=' + ${JSON.stringify(JSON.stringify(label))} + ']');
  if (!el || el.disabled) return false;
  el.click();
  return true;
})()`;

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

// ── THE REACHABILITY PREDICATE ──────────────────────────────────────────────
// Installed once into the page, then called by expression. `reach(el)` returns
// the BEST outcome over every scroll position it can put the element at.
const INSTALL_REACH = String.raw`
(() => {
  const describe = (el) => {
    if (!el) return 'null';
    const bits = [el.tagName.toLowerCase()];
    const lab = el.getAttribute && el.getAttribute('aria-label');
    if (lab) bits.push('aria-label=' + JSON.stringify(lab));
    const txt = (el.textContent || '').trim().slice(0, 40);
    if (txt) bits.push('text=' + JSON.stringify(txt));
    return bits.join(' ');
  };
  // Walk UP naming each ancestor that has a z-index or is positioned — so a
  // red row can say WHICH overlay swallowed the click, not just that one did.
  const blamePath = (el) => {
    const out = [];
    let n = el;
    while (n && n !== document.body && out.length < 6) {
      const cs = getComputedStyle(n);
      out.push(describe(n) + (cs.position !== 'static' ? ' [' + cs.position + ' z=' + cs.zIndex + ']' : ''));
      n = n.parentElement;
    }
    return out.join(' < ');
  };
  const scrollables = (el) => {
    const out = [];
    let n = el.parentElement;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight - n.clientHeight > 1) out.push(n);
      n = n.parentElement;
    }
    return out;
  };
  const probe = (el) => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const inViewport = r.width > 0 && r.height > 0
      && r.top >= 0 && r.left >= 0 && r.bottom <= vh && r.right <= vw;
    const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
    const hit = (cx >= 0 && cy >= 0 && cx < vw && cy < vh) ? document.elementFromPoint(cx, cy) : null;
    const hitsSelf = !!hit && (hit === el || el.contains(hit) || el.contains(hit.parentElement));
    return {
      inViewport, hitsSelf, reachable: inViewport && hitsSelf,
      rect: { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2) },
      hit: describe(hit), blame: hitsSelf ? null : blamePath(hit),
      at: 'x=' + cx + ',y=' + cy,
    };
  };
  window.__reach = (el) => {
    if (!el) return { reachable: false, inViewport: false, hitsSelf: false, hit: 'NO SUCH ELEMENT' };
    const best = (a, b) => {
      if (!a) return b;
      // rank: reachable > inViewport > nothing
      const score = (x) => (x.reachable ? 2 : x.inViewport ? 1 : 0);
      return score(b) > score(a) ? b : a;
    };
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    let out = probe(el);
    if (out.reachable) return { ...out, tries: 1 };
    let tries = 1;
    const scr = scrollables(el);
    // Sweep every scrollable ancestor over its full range. A control is
    // UNREACHABLE only if no stop on any of these ladders seats it.
    for (const s of scr) {
      const max = s.scrollHeight - s.clientHeight;
      const saved = s.scrollTop;
      for (let i = 0; i <= 24; i++) {
        s.scrollTop = Math.round((max * i) / 24);
        tries++;
        const p = probe(el);
        out = best(out, p);
        if (out.reachable) return { ...out, tries, scrollers: scr.length };
      }
      s.scrollTop = saved;
    }
    return { ...out, tries, scrollers: scr.length };
  };
  window.__describeEl = describe;
  return 'installed';
})()`;

/** The right-hand properties column, found without a test hook: walk up from a
 *  control that only ever lives in it and take the widest ancestor still
 *  narrower than the window's half. */
const COLUMN = String.raw`
(() => {
  const seed = document.querySelector('[aria-label="Add layer"]')
    || document.querySelector('[aria-label^="Remove layer"]');
  if (!seed) return null;
  let n = seed, pick = null;
  while (n && n !== document.body) {
    const r = n.getBoundingClientRect();
    if (r.width > 0 && r.width < window.innerWidth / 2) pick = n;
    n = n.parentElement;
  }
  return pick;
})()`;

const COLUMN_BOX = String.raw`
(() => {
  const col = ${COLUMN};
  if (!col) return null;
  const r = col.getBoundingClientRect();
  return { left: +r.left.toFixed(2), right: +r.right.toFixed(2), top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) };
})()`;

const PANEL_BOX = String.raw`
(() => {
  const hdr = [...document.querySelectorAll('button')].find(b => (b.getAttribute('title')||'').startsWith('Close (Esc)'));
  if (!hdr) return null;
  let n = hdr;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (cs.zIndex === '40') {
      const r = n.getBoundingClientRect();
      return { left: +r.left.toFixed(2), right: +r.right.toFixed(2), top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), height: +r.height.toFixed(2), position: cs.position };
    }
    n = n.parentElement;
  }
  return null;
})()`;

/** Every ENABLED control in the right-hand column, in document order. */
const COLUMN_CONTROLS = String.raw`
(() => {
  const col = ${COLUMN};
  if (!col) return [];
  return [...col.querySelectorAll('button, input, select')].filter(e => !e.disabled);
})()`;

const REACH_LAST_REMOVE = String.raw`
(() => {
  const all = [...document.querySelectorAll('[aria-label^="Remove layer"]')].filter(e => !e.disabled);
  if (!all.length) return { reachable: false, hit: 'NO ENABLED "Remove layer" BUTTON', count: 0 };
  const el = all[all.length - 1];
  const out = window.__reach(el);
  return { ...out, count: all.length, label: el.getAttribute('aria-label') };
})()`;

const CENSUS = String.raw`
(() => {
  const ctrls = ${COLUMN_CONTROLS};
  const bad = [];
  for (const el of ctrls) {
    const r = window.__reach(el);
    if (!r.reachable) bad.push({ el: window.__describeEl(el), rect: r.rect, hit: r.hit, inViewport: r.inViewport });
  }
  return { total: ctrls.length, unreachable: bad.length, worst: bad.slice(0, 4) };
})()`;

const BUILD_LINES = Array.from({ length: 140 }, (_, i) =>
  i === 60 ? 'games/sonic4/code/level.asm(413): error: symbol undefined: Foo_Bar'
    : `  linking object ${String(i).padStart(3, '0')} ...`);

async function main() {
  const t0 = Date.now();
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', `-screen 0 ${SCREEN}`, ELECTRON, MAIN],
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
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    // ── 0. PROVENANCE + ENVIRONMENT ────────────────────────────────────────
    const haveHook = await c.evalExpr('typeof window.__dbg.aether.showFailedBuild === "function"');
    check('0a', 'the build under test carries the console instrument',
      haveHook === true, `${RUN.root}/dist`);
    if (!haveHook) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    const envInfo = await c.json(`({
      dpr: window.devicePixelRatio,
      inner: [window.innerWidth, window.innerHeight],
      ua: navigator.userAgent.match(/Electron\\/[\\d.]+/)?.[0] ?? '?',
    })`);
    const load = (await import('node:os')).loadavg().map((n) => n.toFixed(2)).join(' ');
    note(`ENV  dpr=${envInfo.dpr}  inner=${envInfo.inner.join('x')}  screen=${SCREEN}  ${envInfo.ua}`);
    note(`ENV  loadavg=${load}  harness uptime at boot=${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // ── 1. Open the PRIVATE aeon copy, reach the Effects facet ─────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    await sleep(2500);
    const pill = await c.evalExpr(clickByText('/^Effects$/'));
    check('1b', 'the facet bar offers an Effects pill', pill === true);
    await sleep(1200);

    // ── 2. Build the fixture: a scene with as many layers as the cap allows ─
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(700);
    for (let i = 0; i < WANT_LAYERS; i++) {
      const added = await c.evalExpr(clickByLabel('Add layer'));
      if (added !== true) break;
      await sleep(60);
    }
    await sleep(700);
    const doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const scene = doc.find((s) => s.id === SCENE_ID);
    check('2a', 'ANTI-VACUOUS: the probe scene exists and carries several layers',
      !!scene && scene.layers.length >= 4,
      `scene=${SCENE_ID} layers=${scene?.layers?.length}`);

    await c.evalExpr(INSTALL_REACH);

    // ── 3. CONTROL: console CLOSED. ────────────────────────────────────────
    // Without this the rows below could only ever be red, and a red row that
    // cannot go green asserts as little as a green one that cannot go red.
    const closedBox = await c.json(PANEL_BOX);
    check('3a', 'ANTI-VACUOUS: the build console is NOT mounted yet',
      closedBox === null, `panel box = ${JSON.stringify(closedBox)}`);
    const colClosed = await c.json(COLUMN_BOX);
    note(`right column box, console closed: ${JSON.stringify(colClosed)}`);
    const beforeRemove = await c.json(REACH_LAST_REMOVE);
    check('3b', 'CONTROL: with the console closed, the LAST Remove button is reachable',
      beforeRemove.reachable === true, JSON.stringify(beforeRemove));
    const censusClosed = await c.json(CENSUS);
    check('3c', 'CONTROL: with the console closed, EVERY enabled control in the column is reachable',
      censusClosed.unreachable === 0, JSON.stringify(censusClosed));
    await shot(c, '01-console-closed');

    // ── 4. THE CONDITION: the console is OPEN. ─────────────────────────────
    await c.evalExpr(`window.__dbg.aether.showFailedBuild(${JSON.stringify(BUILD_LINES)}, 2)`);
    await sleep(600);
    const openBox = await c.json(PANEL_BOX);
    check('4a', 'ANTI-VACUOUS: the build console is now mounted and on screen',
      !!openBox && openBox.height > 100, JSON.stringify(openBox));
    const colOpen = await c.json(COLUMN_BOX);
    note(`right column box, console open: ${JSON.stringify(colOpen)}`);
    await shot(c, '02-console-open');

    // ── 5. THE CATCHER. ────────────────────────────────────────────────────
    const afterRemove = await c.json(REACH_LAST_REMOVE);
    check('5a', "THE OWNER'S CONTROL: with the console open, the LAST Remove button is still reachable",
      afterRemove.reachable === true, JSON.stringify(afterRemove));
    const censusOpen = await c.json(CENSUS);
    check('5b', 'with the console open, EVERY enabled control in the column is still reachable',
      censusOpen.unreachable === 0, JSON.stringify(censusOpen));
    check('5c', 'the console does not overlap the right-hand column at all',
      !!openBox && !!colOpen && (openBox.right <= colOpen.left + 0.5 || openBox.top >= colOpen.bottom - 0.5),
      `console=${JSON.stringify(openBox)} column=${JSON.stringify(colOpen)}`);

    // ── 6. THE CONSOLE ITSELF MUST STAY USABLE. ────────────────────────────
    const closeReach = await c.json(String.raw`
      window.__reach([...document.querySelectorAll('button')]
        .find(b => (b.getAttribute('title')||'').startsWith('Close (Esc)')))`);
    check('6a', "the console's own Close button is reachable", closeReach.reachable === true,
      JSON.stringify(closeReach));
    const errReach = await c.json(String.raw`
      (() => {
        const el = [...document.querySelectorAll('div')]
          .find(d => d.children.length === 0 && /symbol undefined: Foo_Bar/.test(d.textContent||''));
        return el ? { ...window.__reach(el), found: true } : { found: false, reachable: false };
      })()`);
    check('6b', "the console's ERROR line is reachable (errors are why he opens it)",
      errReach.reachable === true, JSON.stringify(errReach));
    const tailReach = await c.json(String.raw`
      (() => {
        const el = [...document.querySelectorAll('div')]
          .find(d => d.children.length === 0 && /linking object 139/.test(d.textContent||''));
        return el ? { ...window.__reach(el), found: true } : { found: false, reachable: false };
      })()`);
    check('6c', "the console's LAST output line is reachable by scrolling the console",
      tailReach.reachable === true, JSON.stringify(tailReach));

    // ── 7. CLOSING IT MUST LEAVE NO RESIDUE. ───────────────────────────────
    // The trap in the "pad the scroller" fix: dead space, or a column that
    // never gets its height back.
    const colH_open = colOpen?.height;
    await c.evalExpr(String.raw`
      (() => { const b = [...document.querySelectorAll('button')]
        .find(x => (x.getAttribute('title')||'').startsWith('Close (Esc)')); if (b) b.click(); return !!b; })()`);
    await sleep(600);
    const colBack = await c.json(COLUMN_BOX);
    check('7a', 'closing the console gives the column its full height back',
      !!colBack && !!colClosed && Math.abs(colBack.height - colClosed.height) < 1,
      `closed-before=${colClosed?.height} open=${colH_open} closed-after=${colBack?.height}`);
    const backRemove = await c.json(REACH_LAST_REMOVE);
    check('7b', 'after closing, the LAST Remove button is reachable again',
      backRemove.reachable === true, JSON.stringify(backRemove));
    await shot(c, '03-console-closed-again');

    // ── 8. THE WIDER CAUSE: the canvas and the explorer are covered too. ───
    await c.evalExpr(`window.__dbg.aether.showFailedBuild(${JSON.stringify(BUILD_LINES)}, 2)`);
    await sleep(600);
    const box2 = await c.json(PANEL_BOX);
    const canvasBox = await c.json(String.raw`
      (() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
        const r = cv.getBoundingClientRect();
        return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), left: +r.left.toFixed(2), right: +r.right.toFixed(2) }; })()`);
    check('8a', 'the console does not cover the bottom of the map canvas',
      !!box2 && !!canvasBox && (box2.top >= canvasBox.bottom - 0.5),
      `console=${JSON.stringify(box2)} canvas=${JSON.stringify(canvasBox)}`);
    await c.evalExpr(String.raw`
      (() => { const b = [...document.querySelectorAll('button')]
        .find(x => (x.getAttribute('title')||'').startsWith('Close (Esc)')); if (b) b.click(); return !!b; })()`);

    // ── 9. A SHORT WINDOW MUST NOT BECOME ALL CONSOLE. ────────────────────
    // Reserving space has one failure mode an overlay does not have: on a
    // window shorter than the console the app itself gets squeezed to nothing.
    // `maxHeight: 50vh` is the guard, and this is what proves it is a guard
    // rather than a comment. (`Emulation.setDeviceMetricsOverride` resizes the
    // LAYOUT viewport, which is exactly the quantity the flex column divides.)
    await c.evalExpr(`window.__dbg.aether.showFailedBuild(${JSON.stringify(BUILD_LINES)}, 2)`);
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: 1400, height: 420, deviceScaleFactor: 0, mobile: false });
    await sleep(900);
    const shortPanel = await c.json(PANEL_BOX);
    const shortInner = await c.json('({ h: window.innerHeight })');
    check('9a', 'on a short window the console yields half the height, not all of it',
      !!shortPanel && shortPanel.height <= shortInner.h / 2 + 1 && shortPanel.height > 40,
      `innerHeight=${shortInner.h} console=${JSON.stringify(shortPanel)}`);
    const shortCanvas = await c.json(String.raw`
      (() => { const cv = document.getElementById('map-canvas'); if (!cv) return null;
        const r = cv.getBoundingClientRect(); return { top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2) }; })()`);
    check('9b', 'and the editor above it still has a real canvas',
      !!shortCanvas && shortCanvas.bottom - shortCanvas.top > 40, JSON.stringify(shortCanvas));
    await shot(c, '04-short-window');
    await c.send('Emulation.clearDeviceMetricsOverride');
    await c.evalExpr(String.raw`
      (() => { const b = [...document.querySelectorAll('button')]
        .find(x => (x.getAttribute('title')||'').startsWith('Close (Esc)')); if (b) b.click(); return !!b; })()`);

    // ── 10. THE HOME TAB. ─────────────────────────────────────────────────
    // The console is APP-GLOBAL: it must work on a tab with no EditorShell,
    // which is the reason the fix could not be mounted inside the shell. A
    // reserved-space console changes that tab's layout too, and nothing above
    // has looked at it.
    await c.evalExpr(clickByText('/^Home$/', 'div'));
    await sleep(900);
    await c.evalExpr(`window.__dbg.aether.showFailedBuild(${JSON.stringify(BUILD_LINES.slice(0, 20))}, 2)`);
    await sleep(700);
    const homePanel = await c.json(PANEL_BOX);
    // VISIBLE controls only. The app keeps every non-level tab MOUNTED behind
    // `display: none` (App.tsx's keep-alive), so a document-wide sweep picks up
    // ~12 zero-box buttons in hidden panes and reports them unreachable, which
    // they are and always were. `width > 0` is the filter; the row prints the
    // surviving count and requires > 10, so the filter cannot empty it.
    const VISIBLE = String.raw`
      [...document.querySelectorAll('button, input, select')].filter(e => {
        if (e.disabled) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })`;
    check('10a', 'ANTI-VACUOUS: the console opens on the Home tab too',
      !!homePanel && homePanel.height > 40, JSON.stringify(homePanel));
    const homeCensus = await c.json(String.raw`
      (() => {
        const ctrls = ${VISIBLE};
        const bad = [];
        for (const el of ctrls) { const r = window.__reach(el);
          if (!r.reachable) bad.push({ el: window.__describeEl(el), rect: r.rect, hit: r.hit }); }
        return { total: ctrls.length, unreachable: bad.length, worst: bad.slice(0, 3) };
      })()`);
    check('10b', 'every VISIBLE enabled control on the Home tab (console included) is reachable',
      homeCensus.unreachable === 0 && homeCensus.total > 10, JSON.stringify(homeCensus));
    await shot(c, '05-home-tab');

    // ── SUMMARY ────────────────────────────────────────────────────────────
    const pass = results.filter((r) => r.ok).length;
    console.log(`\n=== ${pass}/${results.length} rows passed ===`);
    if (fails.length) console.log('FAILING ROWS:\n  ' + fails.join('\n  '));
    console.log(`uptime ${(Date.now() - t0) / 1000}s  dpr=${envInfo.dpr}  loadavg=${load}`);
    process.exitCode = fails.length ? 1 : 0;
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 2; });
