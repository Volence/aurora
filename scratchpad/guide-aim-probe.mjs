#!/usr/bin/env node
// DIAGNOSTIC, NOT A GATE. Answers exactly one question: when the harness asks
// CDP to release at `rect.top + 380`, what does the APP actually see?
//
// It measures, at the moment of each event, from inside the page, with a
// capture-phase window listener that touches nothing the app owns:
//   - e.clientY as delivered
//   - #map-canvas's LIVE getBoundingClientRect().top at that instant
//   - the difference, which is what screenToWorld feeds the transform
// plus devicePixelRatio and the visual viewport, since a scaling pipeline is
// one of the two candidate shapes.
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9396);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = existsSync(`${ROOT}/node_modules/.bin/electron`)
  ? `${ROOT}/node_modules/.bin/electron` : siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron');
const AEONDIR = siblingPathOrUnresolved('aeon');
const SCENE_ID = 'aim_probe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(path) {
  return new Promise((res, rej) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path, timeout: 1500 }, (r) => {
      let d = ''; r.on('data', (c) => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('t'))); req.on('error', rej);
  });
}
async function waitForTarget() {
  for (let i = 0; i < 90; i++) {
    try {
      const l = await getJSON('/json/list');
      const p = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(500);
  }
  throw new Error('no CDP target');
}
function cdp(url) {
  const ws = new WebSocket(url); let id = 1; const pend = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = id++;
    pend.set(i, (m) => (m.error ? rej(new Error(`${method}: ${JSON.stringify(m.error)}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evalExpr = async (e) => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''));
    return r.result.value;
  };
  const json = async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}
const SET_INPUT = (sel, v) => String.raw`
(() => { const el = ${sel}; if (!el) return 'no-element';
  const p = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(p,'value').set.call(el, ${JSON.stringify(String(v))});
  el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; })()`;
const clickByText = (re) => String.raw`
(() => { const el = [...document.querySelectorAll('button')].find((e) => ${re}.test(((e.textContent||'')+' '+(e.getAttribute('aria-label')||'')).trim()));
  if (!el) return false; el.click(); return true; })()`;

const SPY = String.raw`
(() => {
  window.__aim = [];
  const rec = (ev) => {
    const cv = document.getElementById('map-canvas');
    const r = cv ? cv.getBoundingClientRect() : null;
    window.__aim.push({
      type: ev.type, clientY: ev.clientY, pageY: ev.pageY, screenY: ev.screenY,
      rectTop: r ? r.top : null, delta: r ? ev.clientY - r.top : null,
    });
  };
  for (const t of ['mousedown','mousemove','mouseup']) window.addEventListener(t, rec, true);
  return 'spying';
})()`;

async function main() {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, '--force-device-scale-factor=1', `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  let c;
  try {
    c = cdp(await waitForTarget()); await c.ready;
    await c.send('Runtime.enable'); await c.send('Page.enable').catch(() => {});
    for (let i = 0; i < 60; i++) { if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break; await sleep(300); }
    await c.evalExpr('localStorage.clear()'); await c.send('Page.reload'); await sleep(4000);
    for (let i = 0; i < 60; i++) { if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break; await sleep(300); }
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
    for (let i = 0; i < 40; i++) { const s = await c.json('window.__dbg.aeon.state()').catch(() => null); if (s && s.open) break; await sleep(400); }
    await sleep(2500);
    await c.evalExpr(clickByText('/^Effects$/')); await sleep(1200);
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/')); await sleep(800);
    await c.evalExpr(SET_INPUT(`[...document.querySelectorAll('input[type=number]')].find(e => /^Layer 0 world_y/.test(e.title||''))`, 200));
    await c.evalExpr('window.__dbg.setView(0, 0, 1)'); await sleep(900);

    const env2 = await c.json(`({ dpr: window.devicePixelRatio, iw: window.innerWidth, ih: window.innerHeight,
      vv: window.visualViewport ? { offsetTop: window.visualViewport.offsetTop, scale: window.visualViewport.scale } : null,
      view: window.__dbg.view() })`);
    console.log('ENV        ', JSON.stringify(env2));
    const rect = await c.json(`(() => { const r = document.getElementById('map-canvas').getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
    console.log('RECT@4a    ', JSON.stringify(rect), '  <- what the harness aims with');

    // THE HARNESS'S ONE EXTRA STEP between capturing `rect` and the drag.
    const beforeShot = await c.json(`document.getElementById('map-canvas').getBoundingClientRect().top`);
    await c.send('Page.captureScreenshot', { format: 'png' });
    await sleep(400);
    const afterShot = await c.json(`document.getElementById('map-canvas').getBoundingClientRect().top`);
    console.log(`SCREENSHOT  rect.top ${beforeShot} -> ${afterShot}`);

    await c.evalExpr(SPY);
    const px = Math.round(rect.width * 0.5);
    const m = (type, y, buttons) => c.send('Input.dispatchMouseEvent',
      { type, x: rect.left + px, y, button: 'left', buttons, clickCount: 1 });

    // Exactly the harness's aim: press at rect.top+200, release at rect.top+380.
    // INTEGER AIMS. The delivered clientY was an integer even when the request
    // was fractional (453.993 -> 453), so ask only for integers and see whether
    // they arrive intact.
    const aimAt = (canvasY) => Math.round(rect.top + canvasY);
    console.log(`AIM         press ${aimAt(200)}  release ${aimAt(380)}  (rect.top=${rect.top})`);
    await m('mouseMoved', aimAt(200), 0); await sleep(300);
    await m('mousePressed', aimAt(200), 1);
    for (let i = 1; i <= 10; i++) { await m('mouseMoved', aimAt(200 + (180 * i) / 10), 1); await sleep(40); }
    // THE HARNESS'S MID-DRAG STEPS, with the button still held: two reads and a
    // screenshot, between the last mousemove and the release.
    const midGuides = await c.json('window.__dbg.aeon.guides()');
    console.log('MID-DRAG    preview canvasY=' + midGuides.rows[0].canvasY);
    await c.evalExpr('window.__dbg.aeon.scenesJson()');
    await c.send('Page.captureScreenshot', { format: 'png' });
    await sleep(400);
    const midTop = await c.json(`document.getElementById('map-canvas').getBoundingClientRect().top`);
    console.log('MID-DRAG    rect.top after the screenshot = ' + midTop);
    await m('mouseReleased', aimAt(380), 0);
    await sleep(700);

    const aim = await c.json('window.__aim');
    console.log('\nEVENTS AS THE PAGE SAW THEM (asked for clientY = rect.top + offset):');
    for (const a of aim) {
      console.log(`  ${a.type.padEnd(10)} clientY=${a.clientY}  pageY=${a.pageY}  screenY=${a.screenY}`
        + `  rectTop=${a.rectTop}  clientY-rectTop=${a.delta}`);
    }
    const doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const scene = doc.find((s) => s.id === SCENE_ID);
    const contract = Math.round(env2.view.y + (aimAt(380) - rect.top) / env2.view.zoom);
    console.log(`\nRESULT      aimed clientY=${aimAt(380)}; contract from that aim = ${contract};`
      + ` document holds ${scene.layers[0].world_y}`);
    console.log('GUIDES     ', JSON.stringify((await c.json('window.__dbg.aeon.guides()')).rows));
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ }
  }
}
main().catch((e) => { console.error('PROBE ERROR:', e); process.exit(2); });
