#!/usr/bin/env node
// STEP 1 OF EW-SHAPE-STRIP: WHAT DOES WAVE 1's PICKER ALREADY DO, AND WHAT IS LEFT?
//
// This is a MEASUREMENT, not a gate. It answers one question the lane is
// forbidden to assume: wave 1 shipped a section picker "first in the column,
// never collapsible" (effects-section-picker-harness 15/15), and the owner's
// chosen shape asks for a strip that is PERMANENT — visible without scrolling,
// from anywhere in the Effects tab. Those are different claims and this script
// measures which one holds today.
//
// It prints numbers. It asserts nothing.
//
// RUN: VITE_AURORA_DEBUG=1 npx electron-vite build
//      AEON_DIR=<writable copy> node scratchpad/effects-strip-delta-probe.mjs

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9457);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 91);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a probe against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-strip-delta`;
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
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

/** Everything about the picker's paint, at whatever scroll the column is at. */
const PICKER_PAINT = String.raw`(() => {
  const p = document.querySelector('[data-effects-section-picker]');
  if (!p) return { found: false };
  const b = p.getBoundingClientRect();
  // The column that actually scrolls.
  let sc = p.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const s = p.querySelector('select');
  const sb = s ? s.getBoundingClientRect() : null;
  const hit = sb ? document.elementFromPoint(
    Math.round(sb.left + sb.width / 2), Math.round(sb.top + sb.height / 2)) : null;
  return {
    found: true,
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) },
    rects: p.getClientRects().length,
    visible: typeof p.checkVisibility === 'function' ? p.checkVisibility() : null,
    hitIsSelect: hit === s,
    hitTag: hit ? (hit.tagName + (hit.className ? '' : '')) : null,
    scroller: sc ? {
      top: Math.round(sc.scrollTop), h: Math.round(sc.clientHeight),
      sh: Math.round(sc.scrollHeight),
      pickerTopInViewport: Math.round(b.top - sc.getBoundingClientRect().top),
      colTop: Math.round(sc.getBoundingClientRect().top),
      colBottom: Math.round(sc.getBoundingClientRect().bottom),
    } : null,
  };
})()`;

const SCROLL_TO = (px) => String.raw`(() => {
  const p = document.querySelector('[data-effects-section-picker]');
  let sc = p ? p.parentElement : null;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  if (!sc) return 'no-scroller';
  sc.scrollTop = ${px};
  return sc.scrollTop;
})()`;

async function main() {
  console.log('=== effects strip DELTA probe (measurement only) ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main],
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
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    for (let i = 0; i < 40; i++) {
      const st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    await sleep(2500);
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1500);

    console.log('\n--- A. AT THE TOP OF THE COLUMN (what wave 1\'s harness measures) ---');
    const top = await c.json(PICKER_PAINT);
    console.log(JSON.stringify(top, null, 2));

    console.log('\n--- B. EXPAND EVERY COLLAPSIBLE, then measure the column ---');
    const expanded = await c.evalExpr(String.raw`(() => {
      const col = document.querySelector('[data-effects-section-picker]').parentElement;
      const before = col.scrollHeight;
      const names = [];
      const hdrs = [...col.querySelectorAll('div')]
        .filter((d) => d.style && d.style.cursor === 'pointer');
      for (const h of hdrs) { names.push((h.textContent || '').trim().slice(0, 40)); h.click(); }
      return JSON.stringify({ before, clicked: names });
    })()`);
    console.log(`    headers: ${expanded}`);
    await sleep(2000);
    const grown = await c.evalExpr(String.raw`
      document.querySelector('[data-effects-section-picker]').parentElement.scrollHeight`);
    console.log(`    column scrollHeight with every section open: ${grown}px`);

    console.log('\n--- C. SCROLLED TO THE BOTTOM (the state that actually failed him) ---');
    const at = await c.evalExpr(SCROLL_TO(999999));
    await sleep(700);
    const bottom = await c.json(PICKER_PAINT);
    console.log(`    scrollTop now ${at}`);
    console.log(JSON.stringify(bottom, null, 2));
    const shot1 = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/before-bottom.png`, Buffer.from(shot1.data, 'base64'));

    console.log('\n--- D. SCROLLED TO THE RASTER BINDING (~the second binding) ---');
    const rasterPos = await c.json(String.raw`(() => {
      const s = [...document.querySelectorAll('select')]
        .find((x) => /^Which raster band preset this section uses \(rasterRef\)/.test(x.title || ''));
      if (!s) return { found: false };
      s.scrollIntoView({ block: 'center' });
      return { found: true, top: Math.round(s.getBoundingClientRect().top) };
    })()`);
    console.log(`    raster select: ${JSON.stringify(rasterPos)}`);
    await sleep(600);
    const atRaster = await c.json(PICKER_PAINT);
    console.log(JSON.stringify(atRaster, null, 2));

    console.log('\n--- E. WHAT THE PICKER SAYS ABOUT THE TWO CONDITIONS ---');
    const says = await c.json(String.raw`(() => {
      const p = document.querySelector('[data-effects-section-picker]');
      return { text: (p.innerText || '').replace(/\s+/g, ' ').trim() };
    })()`);
    console.log(JSON.stringify(says, null, 2));
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }
  console.log(`\n    shots: ${SHOTS}`);
}

main().catch((e) => { console.error(`\nPROBE ABORTED: ${e.message}`); process.exit(2); });
