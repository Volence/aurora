#!/usr/bin/env node
// UX SEAT B — one gesture (or one batch of gestures) against the live session.
//
// `session.mjs` owns the app; this attaches to its CDP port, evaluates the
// expression in the file named on argv, prints the JSON result, and detaches.
// Splitting them is what lets the walk be a walk: the order of the next gesture
// depends on what the last one showed.
//
// Usage:  node drive.mjs <step.js>            evaluate a file
//         node drive.mjs --shot <name>        capture a screenshot
//         node drive.mjs --shot <name> <step.js>
//
// Screenshots land in UXB_SHOTS (required when --shot is used) so the seat's
// evidence directory is the operator's choice, not a literal here.
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

const args = process.argv.slice(2);
let shot = null;
if (args[0] === '--shot') { shot = args[1]; args.splice(0, 2); }
const stepFile = args[0] ?? null;

const c = cdp(await waitTarget());
await c.ready;
await c.send('Runtime.enable');
await c.send('Page.enable').catch(() => {});

// A step file gets `send` for raw CDP through a tiny bridge: it is evaluated in
// the page, so anything needing Input.* is expressed as a directive the step
// returns rather than called directly.  Simple and enough for a walk.
try {
  if (stepFile) {
    const src = readFileSync(stepFile, 'utf8');
    const r = await c.send('Runtime.evaluate', {
      expression: `(async () => { ${src} })()`,
      awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) {
      console.log(JSON.stringify({ ERROR: r.exceptionDetails.text,
        detail: r.exceptionDetails.exception?.description }, null, 2));
    } else {
      console.log(JSON.stringify(r.result.value, null, 2));
    }
  }
  if (shot) {
    const dir = process.env.UXB_SHOTS;
    if (!dir) throw new Error('UXB_SHOTS is unset — the seat must name its evidence directory');
    await sleep(350);
    const s = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${dir}/${shot}.png`, Buffer.from(s.data, 'base64'));
    console.log(`SHOT ${dir}/${shot}.png`);
  }
} finally { c.close(); }
process.exit(0);
