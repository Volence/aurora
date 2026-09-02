#!/usr/bin/env node
// Plan-6 / H3.1 verification harness: does the classic Art composer FILL the
// canvas slot it is given, on all three tiers?
//
// Same launch discipline as tile-editor-harness.mjs (read its header): the
// electron bin is a node shim, so spawn DETACHED and kill the PROCESS GROUP;
// verify the debug port is free before AND after; xvfb-run, never the desktop.
//
// Evidence rules:
//   - Geometry is read off getBoundingClientRect / clientHeight, never eyeballed.
//   - The element chain is walked from the TIER TAB BAR (Chunk,Block,Tile), not
//     matched on a style string, so a style edit cannot silently re-point the
//     probe at a different box.
//   - Negative controls (`neg`) are assertions KNOWN FALSE; the run FAILS if one
//     of them passes.
//
// MODE: `node composer-fill-harness.mjs before|after` — writes
// scratchpad/fill-<mode>.json and scratchpad/shots-fill/<mode>-<tier>.png.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const MODE = process.argv[2] === 'after' ? 'after' : 'before';
const PORT = Number(process.env.PORT ?? 9357);
const ROOT = AURORA_DIR;
const ELECTRON = process.env.ELECTRON_BIN
  ?? siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron');
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots-fill`;
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
async function portFree() {
  try { await getJSON('/json/version'); return false; } catch { return true; }
}
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
const negFails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok, detail });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function neg(id, name, ok, detail) {
  const good = ok === false;
  console.log(`${good ? 'neg-ok' : 'NEG-BROKEN'}  [${id}] (planted) ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  results.push({ id, name: `(planted false) ${name}`, ok: good, detail, negative: true });
  if (!good) negFails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name} — ${detail}`);
  results.push({ id, name, ok: null, detail });
}

// ---------------------------------------------------------------------------
// In-page helpers. The composer chain is walked from the tier tab bar outwards.
// ---------------------------------------------------------------------------
const INSTALL = String.raw`
(() => {
  const H = {};
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom),
             clientH: e.clientHeight, scrollH: e.scrollHeight, clientW: e.clientWidth, scrollW: e.scrollWidth }; };
  H.R = R;

  H.clickPill = (label) => {
    const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  // The tier tab bar: the one div whose three children read exactly Chunk,Block,Tile.
  H.tabBar = () => [...document.querySelectorAll('div')].find((d) => d.children.length === 3
    && [...d.children].map((k) => k.textContent.trim()).join(',') === 'Chunk,Block,Tile');
  H.clickTier = (label) => {
    const bar = H.tabBar(); if (!bar) return false;
    const b = [...bar.children].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  H.activeTier = () => {
    const bar = H.tabBar(); if (!bar) return null;
    const on = [...bar.children].find((b) => getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)');
    return on ? on.textContent.trim() : null;
  };

  // dockHead = tabBar.parentElement ; dock = dockHead.parentElement ;
  // dockContent = dockHead.nextElementSibling ; tabBody = dockContent.firstElementChild ;
  // slot (ClassicComposerCanvas's fill wrapper) = dock.parentElement
  H.chain = () => {
    const bar = H.tabBar(); if (!bar) return null;
    const head = bar.parentElement, dock = head && head.parentElement;
    const content = head && head.nextElementSibling;
    const body = content && content.firstElementChild;
    const slot = dock && dock.parentElement;
    return { slot, dock, head, content, body };
  };
  H.cols = () => {
    const c = H.chain(); if (!c || !c.body) return null;
    return [...c.body.children].map((el) => ({ ...R(el), tag: el.tagName,
      canvas: (() => { const cv = el.querySelector('canvas'); return cv ? { w: cv.width, h: cv.height, cssW: Math.round(cv.getBoundingClientRect().width), cssH: Math.round(cv.getBoundingClientRect().height) } : null; })(),
      scrollers: [...el.querySelectorAll('div')].filter((d) => { const s = getComputedStyle(d); return s.overflowY === 'auto' || s.overflowY === 'scroll'; })
        .map((d) => ({ ...R(d) })) }));
  };
  H.measure = () => {
    const c = H.chain(); if (!c) return null;
    const out = { tier: H.activeTier(), slot: R(c.slot), dock: R(c.dock), head: R(c.head), content: R(c.content), body: R(c.body) };
    // Dead space = the room inside dockContent that tabBody does not occupy,
    // measured at the BOTTOM (tabBody starts at the top of the content box).
    out.dead = out.content && out.body ? out.content.clientH - out.body.h : null;
    out.cols = H.cols();
    // The tallest visible thing in the body, to say what the user actually sees.
    out.contentScrolls = out.content ? out.content.scrollH > out.content.clientH + 1 : null;
    return out;
  };
  // Any element in the Art right-hand PANEL column, to confirm the palette
  // section is still reachable without a column scrollbar.
  // CollapsibleSection's title sits in a <span> next to a chevron <span>, so the
  // title element is NOT childless — matching on children.length === 0 found
  // nothing and reported null, which the first BEFORE run silently accepted.
  H.artColumn = () => {
    const panel = [...document.querySelectorAll('div')].find((d) => d.style && d.style.width === '260px');
    if (!panel) return null;
    const spans = [...panel.querySelectorAll('span')].filter((s) => s.textContent.trim().endsWith('Palette') && s.children.length <= 1);
    const pal = spans[spans.length - 1] || null;
    const pr = panel.getBoundingClientRect();
    return { panel: R(panel), panelScrolls: panel.scrollHeight > panel.clientHeight + 1,
             paletteHeaderBottom: pal ? Math.round(pal.getBoundingClientRect().bottom) : null,
             paletteInView: pal ? Math.round(pal.getBoundingClientRect().bottom) <= Math.round(pr.bottom) : null,
             nHeads: spans.length };
  };
  H.rail = () => [...document.querySelectorAll('div')].filter((d) => d.style && d.style.width === '44px').length;
  H.gridCanvasCss = () => {
    const c = H.chain(); if (!c || !c.body) return null;
    // clientWidth/Height, NOT getBoundingClientRect: the rect is the BORDER box
    // and styles.gridCanvas carries a 1px border, so a correct 1:1 canvas reads
    // as attr+2 through the rect. The content box is what the bitmap is drawn
    // into and is what canvasLocalPoint's scale term divides by.
    // (No backticks in here — this block lives inside a template literal.)
    return [...c.body.querySelectorAll('canvas')].map((cv) => {
      const s = getComputedStyle(cv);
      return { attrW: cv.width, attrH: cv.height, cssW: cv.clientWidth, cssH: cv.clientHeight,
               styleW: cv.style.width || '(unset)', styleH: cv.style.height || '(unset)',
               rendering: s.imageRendering, border: s.borderTopWidth,
               integer: cv.width === cv.clientWidth && cv.height === cv.clientHeight };
    });
  };
  window.__f = H;
  return Object.keys(H).length;
})()`;

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`   shot: ${name}.png`);
}

async function main() {
  if (!(await portFree())) {
    throw new Error(`port ${PORT} ALREADY serves a CDP target — a previous Electron is alive.`);
  }
  console.log(`port ${PORT} verified free · MODE=${MODE}`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  const killGroup = () => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
  };

  const measured = {};
  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    let dbgOk = false;
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof window.__dbg === "object"')) { dbgOk = true; break; } } catch { /* ctx swap */ }
      await sleep(300);
    }
    if (!dbgOk) throw new Error('__dbg never installed — was the build made with VITE_AURORA_DEBUG=1?');

    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
    await sleep(1800);
    await c.evalExpr('window.__dbg.activate("ghz", 1)');
    await sleep(4000);
    const lvl = await c.evalExpr('window.__dbg.levelState()');
    if (lvl.status !== 'ready') throw new Error(`act not ready: ${JSON.stringify(lvl)}`);
    await c.evalExpr(INSTALL);
    note('env', 'act ready', JSON.stringify(lvl));

    await c.evalExpr('window.__f.clickPill("Art")'); await sleep(1200);
    await c.evalExpr(INSTALL);
    note('env', 'window', await c.evalExpr('innerWidth + "x" + innerHeight'));

    for (const tier of ['Chunk', 'Block', 'Tile']) {
      const clicked = await c.evalExpr(`window.__f.clickTier(${JSON.stringify(tier)})`);
      await sleep(900);
      await c.evalExpr(INSTALL);
      const m = await c.json('window.__f.measure()');
      const canvases = await c.json('window.__f.gridCanvasCss()');
      const rail = await c.evalExpr('window.__f.rail()');
      const col = await c.json('window.__f.artColumn()');
      measured[tier] = { clicked, m, canvases, rail, artColumn: col };
      await shot(c, `${MODE}-${tier.toLowerCase()}`);

      const dead = m.dead;
      console.log(`\n--- ${tier} (${MODE}) ---`);
      console.log(`  slot        h=${m.slot.h}`);
      console.log(`  dock        h=${m.dock.h}`);
      console.log(`  dockContent clientH=${m.content.clientH} scrollH=${m.content.scrollH} scrolls=${m.contentScrolls}`);
      console.log(`  tabBody     h=${m.body.h}`);
      console.log(`  DEAD SPACE  ${dead}px  (${m.content.clientH ? Math.round((dead / m.content.clientH) * 100) : '?'}% of the slot)`);
      console.log(`  columns     ${JSON.stringify(m.cols.map((x) => ({ h: x.h, w: x.w, canvas: x.canvas })))}`);
      console.log(`  canvases    ${JSON.stringify(canvases)}`);
      console.log(`  rail divs   ${rail}`);
      console.log(`  art column  ${JSON.stringify(col)}`);
    }

    // ---------------- assertions ----------------
    for (const tier of ['Chunk', 'Block', 'Tile']) {
      const { m } = measured[tier];
      // BOTH SIDES. `< 40` alone passes for a body that has OVERSHOT the slot by
      // 3000px, which is exactly what the first attempt at this fix did (basis
      // `auto` + unbounded strips) — a one-sided bound would have called that a
      // success. `>= -4` allows only rounding.
      check(`fill-${tier}`, `${tier}: tabBody fills the dock content box and does not overshoot it`,
        m.dead !== null && m.dead < 40 && m.dead >= -4 && m.contentScrolls === false,
        `dead=${m.dead}px of ${m.content.clientH}px; dockContent scrolls=${m.contentScrolls} (scrollH=${m.content.scrollH})`);
    }
    // Chunk/Block canvases must stay integer-scaled (no CSS-stretched bitmap).
    for (const tier of ['Chunk', 'Block']) {
      const cvs = measured[tier].canvases.filter((x) => x.attrW > 40); // skip thumbnails
      check(`crisp-${tier}`, `${tier}: the editor canvas is drawn 1:1 (backing store == CSS box), so pixels stay crisp`,
        cvs.length > 0 && cvs.every((x) => x.integer),
        JSON.stringify(cvs));
    }
    // Tile: the rail is present; Chunk/Block: absent.
    check('rail', 'the tool rail is on Tile only',
      measured.Chunk.rail === 0 && measured.Block.rail === 0 && measured.Tile.rail === 1,
      `chunk=${measured.Chunk.rail} block=${measured.Block.rail} tile=${measured.Tile.rail}`);
    // The Art panel column still reaches Palette with no column scrollbar.
    check('column', 'the Art column shows Palette with no column scrollbar',
      measured.Tile.artColumn && measured.Tile.artColumn.panelScrolls === false && measured.Tile.artColumn.paletteInView === true,
      JSON.stringify(measured.Tile.artColumn));

    // ---- negative controls: assertions known false ----
    neg('n1', 'the dock content box has zero height (the probe is reading a detached node)',
      measured.Tile.m.content.clientH === 0, `clientH=${measured.Tile.m.content.clientH}`);
    neg('n1b', 'the Art panel column contains no section titled Palette',
      measured.Tile.artColumn.nHeads === 0, `spans matched=${measured.Tile.artColumn.nHeads}`);
    neg('n2', 'the tier tab bar has four tiers',
      (await c.evalExpr('window.__f.tabBar() ? window.__f.tabBar().children.length : 0')) === 4, 'planted');
    neg('n3', 'the Chunk editor canvas is 1px square',
      measured.Chunk.canvases.some((x) => x.attrW === 1), 'planted');
  } finally {
    if (c) { try { c.close(); } catch { /* */ } }
    killGroup();
    await sleep(1000);
    console.log(`port free after teardown: ${await portFree()}`);
  }

  writeFileSync(`${ROOT}/scratchpad/fill-${MODE}.json`, JSON.stringify({ mode: MODE, measured, results }, null, 2));
  console.log('\n================ SUMMARY ================');
  console.log(`mode=${MODE} checks: ${results.filter((r) => !r.negative && r.ok !== null).length}, fails: ${fails.length}`);
  if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
  if (negFails.length) console.log('!!! NEGATIVE CONTROLS THAT DID NOT FAIL (harness is blind):\n  ' + negFails.join('\n  '));
  else console.log('all negative controls correctly reported FAIL');
  // BEFORE is expected to fail the fill checks — that is the defect. Only the
  // negative controls gate the exit code in that mode.
  if (negFails.length || (MODE === 'after' && fails.length)) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
