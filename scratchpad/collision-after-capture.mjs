#!/usr/bin/env node
// AFTER-state screenshots of aurora's aeon collision overlay.
//
// Purely a CAMERA: it opens the aeon project read-only, turns two View-menu
// overlays on through the REAL menu checkboxes, parks the camera on a measured
// CURVED SLOPE, and photographs it at three zooms plus an angles-off control.
// Nothing is painted, nothing is saved, no emulator is touched.
//
// The slope was found by scanning the aeon tree on disk (scratchpad/
// find-curved-slope.py + dump-region.py), not by eyeballing: section 0's
// collattr plane has a run of cells at 16px-cell (72..77, 33..36) whose
// resolved profiles carry angles 357/11/346/343/332/315/56 — a real curve, not
// a flat run — sitting on nonzero foreground art.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npx electron-vite build
// Run:                     node scratchpad/collision-before-capture.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const TAG = process.env.SHOT_TAG ?? '';
const SHOTS = `${ROOT}/scratchpad/collision-legibility`;
mkdirSync(SHOTS, { recursive: true });

/** The curved slope's world centre (section 0, 16px cells x72..77 y33..36). */
const CENTRE = { x: 1200, y: 560 };
/** The pinned CSS viewport + device scale factor — see the override below. */
const VIEWPORT = { width: 1400, height: 872, scale: 1 };

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

const log = (...a) => console.log(...a);
const env_report = {};

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

const CANVAS_RECT = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
})()`;

/** Click the View toolbar button (opens/closes the dropdown). */
const CLICK_VIEW = String.raw`
(() => {
  const b = [...document.querySelectorAll('button')]
    .find((e) => /^\s*View\b/.test((e.textContent || '').trim()));
  if (!b) return 'no-view-button';
  b.click();
  return 'clicked';
})()`;

/** Is the View dropdown rendered right now? */
const MENU_OPEN = String.raw`
[...document.querySelectorAll('label')].some(
  (l) => /^Collision \(path A\)$/.test((l.textContent || '').trim()))`;

/** Click one overlay checkbox by its label text (menu must already be open). */
const CLICK_OVERLAY = (label, want) => String.raw`
(() => {
  const lab = [...document.querySelectorAll('label')]
    .find((l) => (l.textContent || '').trim() === ${JSON.stringify(label)});
  if (!lab) return 'no-label';
  const box = lab.querySelector('input[type=checkbox]');
  if (!box) return 'no-checkbox';
  if (box.checked !== ${want ? 'true' : 'false'}) { box.click(); return 'clicked'; }
  return 'already';
})()`;

/** Every View-menu overlay checkbox's state (menu must be open). */
const READ_OVERLAYS = String.raw`
(() => {
  const out = {};
  for (const l of document.querySelectorAll('label')) {
    const b = l.querySelector('input[type=checkbox]');
    if (b) out[(l.textContent || '').trim()] = b.checked;
  }
  return out;
})()`;

/** The on-map collision legend's rows — proof the overlay is live, not just a flag. */
const LEGEND = String.raw`
(() => {
  const boxes = [...document.querySelectorAll('div')].filter(
    (d) => (d.firstElementChild?.textContent || '') === 'Collision'
      && /Solid \(all sides\)/.test(d.textContent || ''));
  if (!boxes.length) return null;
  const d = boxes[boxes.length - 1];
  return [...d.children].map((c) => (c.textContent || '').trim());
})()`;

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  const file = `${SHOTS}/${name}${TAG}.png`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  log(`        shot -> ${file}`);
  return file;
}
async function shotClip(c, name, clip) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } });
  const file = `${SHOTS}/${name}${TAG}.png`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  log(`        shot -> ${file}  clip=${JSON.stringify(clip)} scale=2`);
  return file;
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    // `-dpi 96` is NOT what pins the scale factor — MEASURED: with it present
    // this host still returned devicePixelRatio 1 on one run and 1.35 on the
    // next, which changes the PNG's pixel size (1400x872 vs 1890x1178) for a
    // byte-identical app. The pin is Emulation.setDeviceMetricsOverride below.
    ['-a', '-s', '-screen 0 1680x1050x24 -dpi 96', ELECTRON, MAIN],
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

    // ---- PIN THE DEVICE GRID --------------------------------------------
    // dpr varies run-to-run under Xvfb on this host (measured 1 and 1.35 on a
    // byte-identical tree, with and without `-dpi 96`), and a BEFORE at 1.35
    // against an AFTER at 1 is not a comparison — the PNGs are different sizes
    // and every stroke width is scaled differently. Overriding the metrics
    // makes both the CSS viewport and the scale factor an INPUT of this
    // harness rather than a property of whichever display Xvfb picked.
    await c.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORT.width, height: VIEWPORT.height,
      deviceScaleFactor: VIEWPORT.scale, mobile: false,
    });
    await sleep(600);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- open the aeon project ------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    if (!st || !st.open || !(st.sections > 0)) {
      throw new Error(`aeon did not open with sections: ${JSON.stringify(st)}`);
    }
    log('  aeon.state():', JSON.stringify(st));
    env_report.aeonState = st;
    await sleep(2500);

    // ---- Layout facet ----------------------------------------------------
    const layout = await c.evalExpr(clickByText('/^Layout$/'));
    log('  clicked Layout pill:', layout);
    await sleep(1200);

    // ---- overlays ON through the real View menu --------------------------
    /** Open the View dropdown, apply `want` to each named checkbox, read every
     *  checkbox back, close the dropdown. Real clicks on the real menu. */
    const setOverlays = async (pairs) => {
      if (!(await c.evalExpr(MENU_OPEN))) {
        await c.evalExpr(CLICK_VIEW);
        await sleep(500);
      }
      if (!(await c.evalExpr(MENU_OPEN))) throw new Error('View menu never opened');
      const acts = {};
      for (const [label, want] of pairs) {
        acts[label] = await c.evalExpr(CLICK_OVERLAY(label, want));
        await sleep(400);
      }
      const state = await c.json(READ_OVERLAYS);
      await c.evalExpr(CLICK_VIEW);
      await sleep(500);
      log('  View menu clicks:', JSON.stringify(acts));
      return state;
    };

    const overlays = await setOverlays([
      ['Collision (path A)', true],
      ['Collision angles', true],
    ]);
    log('  overlay checkbox readback:', JSON.stringify(overlays));
    env_report.overlays = overlays;
    await sleep(600);
    const legend = await c.json(LEGEND);
    log('  on-map collision legend rows:', JSON.stringify(legend));
    env_report.legend = legend;
    if (!(overlays['Collision (path A)'] && overlays['Collision angles'])) {
      throw new Error('overlays did not flip');
    }

    // ---- environment numbers --------------------------------------------
    const dpr = await c.evalExpr('window.devicePixelRatio');
    const rect = await c.json(CANVAS_RECT);
    const inner = await c.json('({ w: window.innerWidth, h: window.innerHeight })');
    log(`  devicePixelRatio = ${dpr}`);
    log(`  #map-canvas rect = ${JSON.stringify(rect)}`);
    log(`  window inner     = ${JSON.stringify(inner)}`);
    env_report.dpr = dpr; env_report.rect = rect; env_report.inner = inner;

    const shots = [];
    /**
     * Park the camera at a FIXED INTEGER world top-left per zoom.
     *
     * Deliberately NOT derived from the measured canvas rect. dpr varies
     * run-to-run under Xvfb here (observed 1 and 1.35 on this host), the rect
     * moves with it, and a rect-derived vpX makes the recipe unreproducible —
     * the AFTER capture would sit on a different world point than the BEFORE.
     * These three pairs put the curve at ~the middle of an 876x721 canvas.
     */
    const PARK = { 1: [762, 200], 4: [1090, 470], 8: [1145, 515] };
    const park = async (zoom) => {
      const [vpX, vpY] = PARK[zoom];
      await c.evalExpr(`window.__dbg.setView(${vpX}, ${vpY}, ${zoom})`);
      await sleep(1100);
      const v = await c.json('window.__dbg.view()');
      log(`  asked  {vpX:${vpX}, vpY:${vpY}, zoom:${zoom}}`);
      log(`  actual ${JSON.stringify(v)}`);
      return { asked: { vpX, vpY, zoom }, actual: v };
    };

    env_report.shots = {};

    env_report.shots['after-slope-z4'] = await park(4);
    shots.push(await shot(c, 'after-slope-z4'));

    env_report.shots['after-slope-z8'] = await park(8);
    shots.push(await shot(c, 'after-slope-z8'));

    env_report.shots['after-slope-z1'] = await park(1);
    shots.push(await shot(c, 'after-slope-z1'));

    // ---- control: angles OFF, same z4 centre -----------------------------
    env_report.shots['after-noangles-z4'] = await park(4);
    const offState = await setOverlays([['Collision angles', false]]);
    log('  overlays with angles OFF:', JSON.stringify(offState));
    env_report.overlaysAnglesOff = offState;
    await sleep(800);
    const legend2 = await c.json(LEGEND);
    log('  legend rows with angles OFF:', JSON.stringify(legend2));
    env_report.legendAnglesOff = legend2;
    shots.push(await shot(c, 'after-noangles-z4'));
    await setOverlays([['Collision angles', true]]);
    await sleep(600);

    // ---- the picker, on the Collision facet ------------------------------
    const collFacet = await c.evalExpr(clickByText('/^Collision$/'));
    log('  clicked Collision facet pill:', collFacet);
    await sleep(1800);
    await c.evalExpr(CLICK_VIEW); await sleep(500);
    const overlays2 = await c.json(READ_OVERLAYS);
    await c.evalExpr(CLICK_VIEW); await sleep(400);
    log('  overlays after entering Collision facet:', JSON.stringify(overlays2));
    env_report.overlaysOnCollisionFacet = overlays2;
    const rect2 = await c.json(CANVAS_RECT);
    log(`  #map-canvas rect on Collision facet = ${JSON.stringify(rect2)}`);
    env_report.rectCollisionFacet = rect2;
    // Same fixed park as the Layout-facet z4 shot, so the two are comparable.
    const [vpX2, vpY2] = PARK[4];
    await c.evalExpr(`window.__dbg.setView(${vpX2}, ${vpY2}, 4)`);
    await sleep(1100);
    env_report.shots['after-slope-z4-collision-facet'] = {
      asked: { vpX: vpX2, vpY: vpY2, zoom: 4 },
      actual: await c.json('window.__dbg.view()'),
    };
    shots.push(await shot(c, 'after-slope-z4-collision-facet'));

    const panel = await c.json(String.raw`
      (() => {
        const d = [...document.querySelectorAll('div')].filter(
          (e) => /Solid/.test(e.textContent || '') && /Jump-thru/.test(e.textContent || '')
            && Math.round(e.getBoundingClientRect().width) <= 260
            && Math.round(e.getBoundingClientRect().width) >= 200);
        if (!d.length) return null;
        const r = d[0].getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: r.height };
      })()`);
    log('  CollisionPalette panel rect:', JSON.stringify(panel));
    env_report.pickerRect = panel;
    if (panel) {
      shots.push(await shotClip(c, 'after-picker', {
        x: Math.floor(panel.x), y: Math.floor(panel.y),
        width: Math.ceil(panel.width), height: Math.ceil(Math.min(panel.height, 1000)),
      }));
    } else {
      log('  !! could not locate the CollisionPalette panel — full-window shot instead');
      shots.push(await shot(c, 'after-picker'));
    }

    log('\n=== ENVIRONMENT REPORT ===');
    log(JSON.stringify(env_report, null, 2));
    log('\n=== FILES ===');
    for (const f of shots) log('  ' + f);
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
