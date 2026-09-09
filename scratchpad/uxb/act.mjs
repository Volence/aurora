#!/usr/bin/env node
// UX SEAT B — a PLAN of real gestures against the live session.
//
// `drive.mjs` evaluates page script, which is fine for reading the screen but
// is not a gesture: `.click()` is not a click (a synthetic event the app
// ignores no-ops and the row reads "not reproduced" forever). Anything the
// audit files as "I pressed this" is dispatched here as a real
// `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent`.
//
// Usage: node act.mjs <plan.json>
// Plan is an array of steps:
//   { "eval": "return ...;" }        page script, result printed
//   { "click": { "x": 1, "y": 2 } }  real mouse press+release (clickCount opt)
//   { "move":  { "x": 1, "y": 2 } }  real mouse move
//   { "key":   { "key":"a","code":"KeyA","vk":65,"text":"a" } }
//   { "shot":  "name" }              screenshot into $UXB_SHOTS
//   { "sleep": 800 }
import { readFileSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';

const PORT = Number(process.env.AURORA_DEBUG_PORT ?? 39302);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function getJSON(p, t = 3000) {
  return new Promise((res, rej) => {
    const q = http.get({ host: '127.0.0.1', port: PORT, path: p, timeout: t }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    });
    q.on('timeout', () => q.destroy(new Error('timeout'))); q.on('error', rej);
  });
}
async function waitTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await getJSON('/json/list');
      const p = l.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP target on port ' + PORT);
}
function cdp(u) {
  const ws = new WebSocket(u); let n = 1; const pend = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const ready = new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  const send = (meth, params = {}) => new Promise((res, rej) => {
    const id = n++;
    pend.set(id, m => m.error ? rej(new Error(`${meth}: ${JSON.stringify(m.error)}`)) : res(m.result));
    ws.send(JSON.stringify({ id, method: meth, params }));
  });
  return { ready, send, close: () => ws.close() };
}

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const c = cdp(await waitTarget());
await c.ready;
await c.send('Runtime.enable');
await c.send('Page.enable').catch(() => {});

const out = [];
try {
  for (const [i, step] of plan.entries()) {
    if ('sleep' in step) { await sleep(step.sleep); continue; }
    if ('move' in step) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: step.move.x, y: step.move.y });
      await sleep(120); continue;
    }
    // Locate-then-press, in one step. The press is still a REAL
    // Input.dispatchMouseEvent; only the coordinate is measured in the page
    // immediately before it. This exists because a plan that hard-codes a
    // coordinate measured in an EARLIER step lands somewhere else the moment
    // the panel reflows — that is the instrument's defect, not the app's, and
    // it manufactured two false observations in this walk before it was fixed.
    if ('clickAt' in step) {
      const r = await c.send('Runtime.evaluate', {
        expression: `(() => { ${step.clickAt} })()`, returnByValue: true,
      });
      const p = r.result.value;
      if (!p || typeof p.x !== 'number') { out.push({ i, LOCATE_FAILED: p }); continue; }
      const { clickCount = 1, button = 'left' } = step;
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button, clickCount });
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button, clickCount });
      out.push({ i, pressedAt: p });
      await sleep(step.after ?? 400); continue;
    }
    if ('click' in step) {
      const { x, y, clickCount = 1, button = 'left' } = step.click;
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount });
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount });
      await sleep(step.after ?? 350); continue;
    }
    if ('key' in step) {
      const k = step.key;
      await c.send('Input.dispatchKeyEvent', {
        type: k.text ? 'keyDown' : 'rawKeyDown', key: k.key, code: k.code,
        windowsVirtualKeyCode: k.vk, modifiers: k.mod ?? 0, ...(k.text ? { text: k.text } : {}),
      });
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, modifiers: k.mod ?? 0,
      });
      await sleep(step.after ?? 250); continue;
    }
    if ('shot' in step) {
      const dir = process.env.UXB_SHOTS;
      if (!dir) throw new Error('UXB_SHOTS unset — the seat must name its evidence directory');
      await sleep(350);
      const s = await c.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${dir}/${step.shot}.png`, Buffer.from(s.data, 'base64'));
      out.push({ i, shot: `${dir}/${step.shot}.png` }); continue;
    }
    if ('eval' in step) {
      const r = await c.send('Runtime.evaluate', {
        expression: `(async () => { ${step.eval} })()`, awaitPromise: true, returnByValue: true,
      });
      out.push({ i, value: r.exceptionDetails
        ? { ERROR: r.exceptionDetails.text, detail: r.exceptionDetails.exception?.description }
        : r.result.value });
      continue;
    }
    out.push({ i, UNKNOWN_STEP: step });
  }
} finally { c.close(); }
console.log(JSON.stringify(out, null, 2));
process.exit(0);
