#!/usr/bin/env node
// EW-SHAPE-TABS, STEP 1: HOW TALL IS THE EFFECTS COLUMN, AND HOW SHORT IS THE
// LAYERS LIST INSIDE IT?
//
// A MEASUREMENT. It asserts nothing, so it can be run against master's build and
// against this branch's and the two numbers compared without a gate deciding in
// advance what "better" means.
//
// It prints, at 1680x1050 under xvfb, with an aeon act open on the Effects tab:
//
//   • the scrolling column's clientHeight vs scrollHeight, in the DEFAULT
//     collapse state and again with every section expanded;
//   • the LAYERS list's own inner scroller — the 129px window onto a 2,466px
//     list the cold walkthrough measured (§a9) and the drift parcel hit again;
//   • every titled section's height, so the column's shape is attributable
//     rather than a single total.
//
// ⚠ THE COLLAPSE STATE IS PART OF THE MEASUREMENT. `localStorage.clear()` runs
// first, so "default" means what a first-time author actually sees rather than
// what the last run left behind.
//
// RUN: VITE_AURORA_DEBUG=1 npx electron-vite build
//      AEON_DIR=<writable copy> node scratchpad/effects-subtabs-geometry-probe.mjs
//      SUBTAB=Colour … measure one sub-tab (branch builds only; ignored before)

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9461);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 95);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a probe against that tree');
}
const SUBTAB = process.env.SUBTAB ?? '';
const SHOTS = `${ROOT}/scratchpad/shots-effects-subtabs`;
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

/**
 * THE COLUMN, ITS SECTIONS, AND THE LAYERS LIST INSIDE IT.
 *
 * The scroller is found from the strip upward — the same walk every harness in
 * this family uses — so the number is the box the author actually scrolls and
 * not whichever `<div>` happened to be first.
 */
const GEOMETRY = String.raw`(() => {
  const strip = document.querySelector('[data-effects-section-strip]');
  if (!strip) return { found: false };
  const col = strip.parentElement;
  const sections = [...col.children].map((k) => {
    const b = k.getBoundingClientRect();
    const head = k.querySelector('div[style*="cursor"]');
    return {
      title: ((head && head.innerText) || (k.innerText || '')).split('\n')[0].trim().slice(0, 34),
      h: Math.round(b.height),
    };
  });
  // The LAYERS list's own scroller: an inner box that overflows, inside the
  // section whose header says Layers.
  // CASE-INSENSITIVE (no backticks in here — this block is inside a template
  // literal). PanelHeader sets text-transform: uppercase and innerText reports
  // the RENDERED case, so a /^Layers/ finder matches nothing and prints
  // "layers: null", which reads exactly like "there is no list".
  const layerSection = [...col.querySelectorAll('div')]
    .find((d) => /^layers \(/i.test((d.innerText || '').trim()) && d.style && d.style.cursor === 'pointer');
  let inner = null;
  if (layerSection) {
    const body = layerSection.parentElement;
    const sc = [...body.querySelectorAll('div')]
      .find((d) => d.scrollHeight > d.clientHeight + 1 && d.clientHeight > 0);
    if (sc) inner = { h: Math.round(sc.clientHeight), sh: Math.round(sc.scrollHeight) };
    else {
      // No inner scroller at all: the list fits. Report the body's height so
      // "it fits" is distinguishable from "the finder missed it".
      const b = body.getBoundingClientRect();
      inner = { h: Math.round(b.height), sh: Math.round(b.height), fits: true };
    }
  }
  return {
    found: true,
    column: {
      h: Math.round(col.clientHeight), sh: Math.round(col.scrollHeight),
      screens: Math.round((col.scrollHeight / col.clientHeight) * 100) / 100,
    },
    layers: inner,
    sections,
  };
})()`;

async function main() {
  console.log('=== effects sub-tabs GEOMETRY probe (measurement only) ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    SUBTAB      : ${SUBTAB || '(none — pre-branch build, or the default tab)'}`);

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
    if (SUBTAB) {
      const hit = await c.evalExpr(clickByText(`/^${SUBTAB}$/`));
      console.log(`    sub-tab click "${SUBTAB}" → ${hit}`);
      await sleep(900);
    }

    console.log('\n--- A. DEFAULT COLLAPSE STATE (what a first-time author sees) ---');
    console.log(JSON.stringify(await c.json(GEOMETRY), null, 2));
    const shotA = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/geometry-default${SUBTAB ? `-${SUBTAB}` : ''}.png`,
      Buffer.from(shotA.data, 'base64'));

    console.log('\n--- B. EVERY SECTION EXPANDED ---');
    const clicked = await c.evalExpr(String.raw`(() => {
      const col = document.querySelector('[data-effects-section-strip]').parentElement;
      const names = [];
      for (const h of [...col.querySelectorAll('div')].filter((d) => d.style && d.style.cursor === 'pointer')) {
        const t = (h.innerText || '').trim().slice(0, 30);
        // Only OPEN: these headers toggle, so clicking an already-open one shuts it.
        if (h.parentElement && h.parentElement.children.length > 1) continue;
        names.push(t); h.click();
      }
      return JSON.stringify(names);
    })()`);
    console.log(`    opened: ${clicked}`);
    await sleep(1800);
    console.log(JSON.stringify(await c.json(GEOMETRY), null, 2));
    const shotB = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/geometry-expanded${SUBTAB ? `-${SUBTAB}` : ''}.png`,
      Buffer.from(shotB.data, 'base64'));
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }
  console.log(`\n    shots: ${SHOTS}`);
}

main().catch((e) => { console.error(`\nPROBE ABORTED: ${e.message}`); process.exit(2); });
