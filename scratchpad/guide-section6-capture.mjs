#!/usr/bin/env node
// §6 OF THE IN-APP GUIDE, PAINTED — the before/after evidence for the two
// sentences of docs/reviews/2026-09-05-guide-sentences.md.
//
// WHY A SCREENSHOT AND NOT A STRING ASSERTION. `guides.test.ts` proves the
// markdown parses and `aeon-build-path-currency.test.ts` proves the claims
// still match aeon. Neither can show what an AUTHOR SEES, and the whole defect
// class here is "a sentence a person reads and acts on". The deliverable is a
// picture of the paragraph in the running application.
//
// The guide is reachable from the HOME tab's Guides card, so this needs NO aeon
// project, NO save and NO build of a ROM. Nothing is written outside `OUT`.
//
// ⚠ NO EMULATOR, EVER. Nothing here runs a ROM or touches an Aether socket.
//
// RUN (both variables — without the second the run-root resolver walks up and
// borrows the MAIN checkout's dist/, so the shot would be of an app this
// worktree did not build):
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   OUT=<file.png> node scratchpad/guide-section6-capture.mjs
//
//   PLANT=no-anchor  … look for a heading id that does not exist, so the scroll
//                      lands nowhere. The run must ABORT rather than save a
//                      picture of the top of the document and call it §6.

import { AURORA_DIR } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9463);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 97);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const OUT = process.env.OUT;
if (!OUT) throw new Error('OUT must name the .png to write');
const PLANT = process.env.PLANT ?? '';
const ANCHOR = PLANT === 'no-anchor' ? 'save-and-build-PLANTED' : 'save-and-build';

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

function must(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  if (!ok) throw new Error(`ABORT: ${name} — a picture taken past this point would not be evidence`);
}

async function main() {
  console.log('=== guide §6 capture ===');
  console.log(`    node   : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    load   : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    OUT    : ${OUT}`);
  console.log(`    anchor : #${ANCHOR}`);

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
    let haveDbg = false;
    for (let i = 0; i < 60 && !haveDbg; i++) {
      haveDbg = await c.evalExpr('typeof window.__dbg === "object"').catch(() => false);
      if (!haveDbg) await sleep(300);
    }
    must('this is a VITE_AURORA_DEBUG=1 build (window.__dbg exists)', haveDbg);

    // The real gesture a first-time reader makes: the Guides card on Home.
    const opened = await c.evalExpr(String.raw`
      (() => {
        const el = [...document.querySelectorAll('button')]
          .find((b) => /Backgrounds that move/.test((b.textContent || '')));
        if (!el) return 'no guide card on Home';
        el.click();
        return 'clicked';
      })()`);
    must('the Guides card on Home was found and clicked', opened === 'clicked', String(opened));
    await sleep(1200);

    const pane = await c.json(String.raw`
      (() => {
        const p = document.querySelector('[data-guide="effects-first-run"]');
        if (!p) return { found: false };
        const r = p.getBoundingClientRect();
        return { found: true, chars: (p.textContent || '').length,
                 x: r.x, y: r.y, w: r.width, h: r.height };
      })()`);
    must('the guide pane is on screen', pane.found === true, JSON.stringify(pane));
    must('the guide pane is not blank', pane.chars > 3000, `${pane.chars} rendered chars`);

    // Scroll §6 to the top of the pane. `scrollIntoView` inside the scroller is
    // what the rail's own links do, so this is the app's own motion.
    const scrolled = await c.json(String.raw`
      (() => {
        const p = document.querySelector('[data-guide="effects-first-run"]');
        const h = p.querySelector('#' + CSS.escape(${JSON.stringify(ANCHOR)}));
        if (!h) return { ok: false, why: 'no such heading id in the rendered document' };
        p.scrollTop += h.getBoundingClientRect().top - p.getBoundingClientRect().top - 8
                       + ${Number(process.env.SCROLL_EXTRA ?? 0)};
        const pr = p.getBoundingClientRect(), hr = h.getBoundingClientRect();
        return { ok: true, scrollTop: p.scrollTop, headingTop: hr.top, paneTop: pr.top,
                 paneBottom: pr.bottom, text: (h.textContent || '').trim() };
      })()`);
    must(`#${ANCHOR} exists in the rendered document`, scrolled.ok === true, JSON.stringify(scrolled));
    // ⚠ NOT `checkVisibility()`: an element scrolled out of its scroller still
    // reports visible. The heading's rect is compared to the SCROLLER's box.
    //
    // With SCROLL_EXTRA the heading is deliberately pushed off the top, so the
    // row asserts the DISPLACEMENT instead of dropping to "we scrolled
    // somewhere" — a continuation shot has to prove it is a continuation OF
    // THIS SECTION and not a picture of an arbitrary scroll position.
    const extra = Number(process.env.SCROLL_EXTRA ?? 0);
    const offset = scrolled.paneTop - scrolled.headingTop;
    must(extra === 0
      ? '§6 is inside the painted pane, not merely "visible"'
      : `§6 sits exactly SCROLL_EXTRA=${extra}px above the painted pane`,
    extra === 0
      ? (scrolled.headingTop >= scrolled.paneTop - 1 && scrolled.headingTop < scrolled.paneBottom)
      : Math.abs(offset - (extra - 8)) <= 2,
    `heading top ${scrolled.headingTop.toFixed(1)}, pane [${scrolled.paneTop.toFixed(1)}, ${scrolled.paneBottom.toFixed(1)}], offset ${offset.toFixed(1)} — "${scrolled.text}"`);
    await sleep(400);

    const dpr = await c.evalExpr('window.devicePixelRatio');
    console.log(`    dpr    : ${dpr}`);
    const clip = {
      x: Math.round(pane.x), y: Math.round(pane.y),
      width: Math.round(pane.w), height: Math.round(Math.min(pane.h, 720)), scale: 1,
    };
    const shot = await c.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
    console.log(`PASS  wrote ${OUT} (clip ${JSON.stringify(clip)})`);
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    await killTree(child);
  }
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exitCode = 1; });
