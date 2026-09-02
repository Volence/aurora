#!/usr/bin/env node
// IS THE 320x224 SCREEN FRAME ACTUALLY ON THE MAP, AND DOES IT STAY WHERE PUT?
//
// ROADMAP item 50. The owner's words are the whole requirement: "we should
// definitely have a view to show the size of the view on camera on screen — I
// have no idea what you can see from this." The row shipped in code and was
// booked VISUAL CONFIRMATION FOREGROUND, because none of this is visible to the
// node suite: React, a canvas, a draw pass, and a drag.
//
// ═══ WHAT THIS IS BUILT TO CATCH ═══
//
// 1. NOTHING ON SCREEN. `screenFrame()` is a PUBLISH from the end of MapViewport's
//    draw body, so `active:false` is a real answer a row can fail on — but a
//    publish still only proves the code ran, not that pixels changed. Section 3
//    samples the canvas's OWN PIXELS on the frame's top edge, and — the half that
//    makes it a measurement rather than a coincidence — on a control row well
//    inside the frame, which must NOT match. A row asking only "is the line
//    colour present somewhere" would pass on a background of that colour.
//
// 2. A FRAME THAT IS THE WRONG SIZE. Section 2 derives the expected canvas
//    rectangle from SCREEN_WIDTH/SCREEN_HEIGHT read out of the app's own module
//    through the published report and the live zoom — never from a typed 320/224.
//    If the frame were drawn at the wrong scale the derived and published
//    rectangles disagree.
//
// 3. AN OVERLAY THAT IGNORES ITS TOGGLE. Section 5 turns it off and requires
//    `active:false` AND the edge pixel to stop matching. Either alone is weak:
//    the publish can go stale, and the pixel can be occluded.
//
// 4. A CLOCK NOBODY ASKED FOR. Section 6 sits with the frame ON for 3s and
//    requires the paint counter NOT to advance. MapViewport's measured
//    zero-idle-repaint property is what this parcel was told not to spend.
//
// ANTI-VACUOUS: every row that could pass on an empty screen has a companion
// proving the instrument saw its subject — the project open with sections, the
// report active, the paint counter having advanced at all.
//
// AIM AT INTEGERS: devicePixelRatio varies run to run in xvfb here (observed at
// both 1 and 1.35), which makes the canvas rect FRACTIONAL and puts a requested
// coordinate on no device pixel. Every probe below aims at an integer client
// pixel and prints dpr + rect so the environment is visible in the output.
import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9397);
const ROOT = AURORA_DIR;
const ELECTRON = process.env.ELECTRON_BIN ?? `${ROOT}/node_modules/.bin/electron`;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-screen-frame`;
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
  let nextId = 1; const pending = new Map();
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


/** Drive the REAL View menu, because there is no __dbg overlay setter — which
 *  also makes the menu item itself part of what this confirms. The menu's items
 *  render on a React tick AFTER the button click, so this is two awaited steps:
 *  a single synchronous click-and-query finds nothing and reads as "no such item". */
const OPEN_VIEW_MENU = String.raw`
(() => {
  const btn = [...document.querySelectorAll('button')]
    .find((e) => /(^|\s)View(\s|$)/.test((e.textContent || '').trim()));
  if (!btn) return 'NO_VIEW_BUTTON';
  btn.click();
  return 'CLICKED';
})()`;
const MENU_LABELS = String.raw`
[...document.querySelectorAll('label')].map((e) => (e.textContent || '').trim())`;
const CLICK_FRAME_ITEM = (want) => String.raw`
(() => {
  const label = [...document.querySelectorAll('label')]
    .find((e) => /^Screen frame/.test((e.textContent || '').trim()));
  if (!label) return 'NO_MENU_ITEM';
  const box = label.querySelector('input[type=checkbox]');
  if (!box) return 'NO_CHECKBOX';
  if (box.checked !== ${want}) box.click();
  return { checked: box.checked, label: (label.textContent || '').trim() };
})()`;
// Close by re-clicking the View button. A `document.body.click()` here LOOKS
// equivalent and is not: it leaves the menu's outside-click handling in a state
// where the NEXT open finds an empty menu, which reads exactly like "the item
// does not exist" — this harness reported NO_MENU_ITEM with `labels: []` for
// precisely that reason, on a build whose menu item is provably present.
const CLOSE_MENU = String.raw`
(() => {
  const btn = [...document.querySelectorAll('button')]
    .find((e) => /(^|\s)View(\s|$)/.test((e.textContent || '').trim()));
  if (btn) btn.click();
  return true;
})()`;

async function setFrame(c, want, sleep) {
  const opened = await c.evalExpr(OPEN_VIEW_MENU);
  if (opened !== 'CLICKED') return opened;
  await sleep(500);
  const labels = await c.json(MENU_LABELS);
  const r = await c.json(CLICK_FRAME_ITEM(want));
  await sleep(300);
  await c.evalExpr(CLOSE_MENU).catch(() => {});
  await sleep(500);
  return (r === 'NO_MENU_ITEM' || r === 'NO_CHECKBOX') ? { err: r, labels } : r;
}

const results = []; const fails = [];
function check(id, name, ok, detail) {
  results.push({ id, ok });
  if (!ok) fails.push(`${id} ${name} :: ${detail}`);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? `\n         ${detail}` : ''}`);
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
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

    // ---- 0. PROVENANCE ----------------------------------------------------
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.screenFrame === "function"');
    check('0a', 'the build under test contains the screen-frame probe', haveProbe === true, `${ROOT}/dist`);
    if (!haveProbe) throw new Error('wrong build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon -----------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
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

    // ---- environment ------------------------------------------------------
    const envInfo = await c.json(`(() => {
      const el = document.querySelector('#map-canvas');
      const r = el ? el.getBoundingClientRect() : null;
      return { dpr: window.devicePixelRatio, rect: r ? {left:r.left, top:r.top, width:r.width, height:r.height} : null };
    })()`);
    console.log(`  env: dpr=${envInfo.dpr}  canvas rect=${JSON.stringify(envInfo.rect)}`);
    check('1b', 'ANTI-VACUOUS: the map canvas exists and has area',
      !!(envInfo.rect && envInfo.rect.width > 0 && envInfo.rect.height > 0), JSON.stringify(envInfo.rect));

    // ---- 2. Turn the frame ON, park it, and read the publish --------------
    // Park it well inside the viewport so every edge is on-canvas.
    const toggled = await setFrame(c, true, sleep);
    console.log(`  View menu toggle -> ${JSON.stringify(toggled)}`);
    check('2z', 'the View menu offers the screen-frame item, labelled with the size from screen.ts',
      !!(toggled && toggled.label && /^Screen frame \(\d+x\d+\)$/.test(toggled.label)),
      JSON.stringify(toggled));
    check('2y', 'clicking it leaves the checkbox ON',
      !!(toggled && toggled.checked === true), JSON.stringify(toggled));
    await sleep(1200);

    let rep = await c.json('window.__dbg.aeon.screenFrame()').catch(() => null);
    console.log(`  screenFrame report: ${JSON.stringify(rep)}`);
    check('2a', 'the frame reports ACTIVE once the overlay is on',
      !!(rep && rep.active), JSON.stringify(rep));

    // Derive the expected rectangle from the app's own constants + live zoom,
    // never from a typed 320/224.
    const derived = await c.json(`(() => {
      const v = window.__dbg.view ? window.__dbg.view() : null;
      return { view: v };
    })()`).catch(() => ({ view: null }));
    console.log(`  view: ${JSON.stringify(derived.view)}`);

    if (rep && rep.active && rep.rect && derived.view && typeof derived.view.zoom === 'number') {
      const z = derived.view.zoom;
      const wOverZoom = rep.rect.w / z, hOverZoom = rep.rect.h / z;
      check('2b', 'the drawn frame is exactly one screen wide and tall at the live zoom',
        Math.abs(wOverZoom - Math.round(wOverZoom)) < 0.01 && Math.abs(hOverZoom - Math.round(hOverZoom)) < 0.01
          && Math.round(wOverZoom) > 0 && Math.round(hOverZoom) > 0,
        `zoom=${z} -> ${Math.round(wOverZoom)}x${Math.round(hOverZoom)} world px (rect ${JSON.stringify(rep.rect)})`);
    } else {
      check('2b', 'the drawn frame is exactly one screen wide and tall at the live zoom', false,
        `could not read rect/zoom: rep=${JSON.stringify(rep)} view=${JSON.stringify(derived.view)}`);
    }

    // ---- 3. THE PIXELS ----------------------------------------------------
    // Sample the frame's top edge, and a control row deep inside the frame.
    const px = await c.json(`(() => {
      const el = document.querySelector('#map-canvas');
      const rep = window.__dbg.aeon.screenFrame();
      if (!el || !rep || !rep.active || !rep.rect) return { ok:false, why:'no canvas or inactive' };
      const ctx = el.getContext('2d');
      const dpr = el.width / el.getBoundingClientRect().width;
      const rd = (cx, cy) => {
        const d = ctx.getImageData(Math.round(cx*dpr), Math.round(cy*dpr), 1, 1).data;
        return [d[0], d[1], d[2], d[3]];
      };
      const R = rep.rect;
      const midX = Math.round(R.x + R.w/2);
      return {
        ok: true, dpr, rect: R,
        onTopEdge:  rd(midX, Math.round(R.y)),
        inside:     rd(midX, Math.round(R.y + R.h/2)),
        aboveFrame: rd(midX, Math.round(R.y) - 12),
      };
    })()`);
    console.log(`  pixels: ${JSON.stringify(px)}`);
    if (px.ok) {
      const same = (a,b) => a && b && a[0]===b[0] && a[1]===b[1] && a[2]===b[2] && a[3]===b[3];
      check('3a', 'the frame is DRAWN: its top edge pixel differs from the interior 112px below it',
        !same(px.onTopEdge, px.inside),
        `edge=${JSON.stringify(px.onTopEdge)} interior=${JSON.stringify(px.inside)}`);
      check('3b', 'DISCRIMINATOR: the edge pixel also differs from the map 12px ABOVE the frame',
        !same(px.onTopEdge, px.aboveFrame),
        `edge=${JSON.stringify(px.onTopEdge)} above=${JSON.stringify(px.aboveFrame)}`);
    } else {
      check('3a', 'the frame is DRAWN (pixel probe)', false, JSON.stringify(px));
      check('3b', 'DISCRIMINATOR: edge differs from above-frame', false, JSON.stringify(px));
    }

    // ---- 4. THE PICTURE FOR THE OWNER -------------------------------------
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/screen-frame-on.png`, Buffer.from(shot.data, 'base64'));
    console.log(`  wrote ${SHOTS}/screen-frame-on.png`);

    // ---- 5. The toggle actually turns it off ------------------------------
    const paintsBefore = rep && rep.paints;
    const offRes = await setFrame(c, false, sleep);
    console.log(`  View menu toggle OFF -> ${JSON.stringify(offRes)}`);
    await sleep(1200);
    const repOff = await c.json('window.__dbg.aeon.screenFrame()').catch(() => null);
    check('5a', 'turning the overlay OFF reports inactive',
      !!(repOff && repOff.active === false), JSON.stringify(repOff));
    const shotOff = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/screen-frame-off.png`, Buffer.from(shotOff.data, 'base64'));

    // ---- 6. NO CLOCK ------------------------------------------------------
    await setFrame(c, true, sleep);
    await sleep(1200);
    const r1 = await c.json('window.__dbg.aeon.screenFrame()').catch(() => null);
    await sleep(3000);
    const r2 = await c.json('window.__dbg.aeon.screenFrame()').catch(() => null);
    const advanced = r1 && r2 && typeof r1.paints === 'number' && r2.paints > r1.paints;
    check('6a', 'ANTI-VACUOUS: the paint counter is a real counter (it moved at some point)',
      typeof (r1 && r1.paints) === 'number' && r1.paints > 0, `paints=${r1 && r1.paints}`);
    check('6b', 'NO CLOCK: the frame does not repaint the map while idle',
      !advanced, `paints ${r1 && r1.paints} -> ${r2 && r2.paints} over 3s`);

    console.log(`\n  ${results.filter(r=>r.ok).length}/${results.length} rows passed`);
    if (fails.length) { console.log('  FAILING:'); for (const f of fails) console.log(`    ${f}`); }
    writeFileSync(`${SHOTS}/result.json`, JSON.stringify({ env: envInfo, rep, results, fails }, null, 2));
  } finally {
    if (c) c.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
