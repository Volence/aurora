#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// effects-cold-read-harness — an INTERACTIVE driver for a cold read of the
// Effects authoring surface.
//
//     npm run harness:effects-cold-read
//
// ═══ WHY THIS IS A SERVER AND NOT A SCRIPT ════════════════════════════════
//
// Every other harness in scratchpad/ encodes a KNOWN sequence of gestures and
// asserts about the result. A cold read cannot do that: the whole point is that
// the operator does not know what the next gesture is until they have looked at
// the screen the previous one produced. So this file launches the app exactly
// the way the other harnesses do — same guards, same xvfb, same ownership rules
// — and then opens a small loopback control port so a human (or an agent
// driving through a shell) can send one gesture at a time and take a screenshot
// after each.
//
// ═══ THE THREE RIG TRAPS THIS FILE IS BUILT AROUND ════════════════════════
//
// 1. `element.click()` IS NOT A CLICK. If the app listens for pointer/mouse
//    events a synthetic `.click()` no-ops, every later reading comes off the
//    PREVIOUS screen, and the operator writes up "the control does nothing" as
//    a product defect when it is the rig. `/click` therefore sends real
//    `Input.dispatchMouseEvent` press/release, and REFUSES (never silently
//    clicks something else) when `elementFromPoint` at the aim is not the
//    element asked for.
//
// 2. `devicePixelRatio` varies run to run on this box (1 and 1.35 both
//    observed). At 1.35 element rects are fractional, so `rect.top + N` asks
//    for a coordinate that does not exist and the app resolves one pixel off —
//    which presents as an off-by-one in a feature that is fine. Every aim is
//    rounded to INTEGER client pixels before it is sent, and dpr + the raw rect
//    are returned with every click so they can be printed beside any positional
//    finding.
//
// 3. `checkVisibility()` and `getClientRects()` BOTH GO GREEN on an element
//    scrolled far outside its scroller. `/probe` therefore returns the
//    element's rect AND its nearest scrolling ancestor's rect, so a visibility
//    claim can be made by comparing the two rather than by trusting either.
//
// ═══ WHAT IT DOES NOT DO ══════════════════════════════════════════════════
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
// ⚠ IT NEVER PRESSES BUILD & RUN. The operator is forbidden to launch the game
//   from the UI (Aurora's bus client ATTACHES to whatever holds the socket
//   chain rather than spawning its own, so a press could push a ROM into a game
//   window the owner has open). Building is done by a shell command against a
//   private clone instead.
// ⚠ IT NEVER OPENS /home/volence/sonic_hacks/aeon. `PROJECT` must be a path the
//   operator passes in, and the intended value is a throwaway `git clone`.
//
// ═══ THE ONE DEBUG-DOOR CONCESSION, STATED OUT LOUD ═══════════════════════
//
// `window.__dbg.aeon.open(<path>)` is used to open the project, because aeon's
// only real UI route to a project is a native folder picker that CDP cannot
// drive. THAT STEP IS NOT COLD-READ EVIDENCE and the report says so.
// Everything after it is real UI interaction through /click and /key.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// From a linked worktree:  ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
// ═══════════════════════════════════════════════════════════════════════════

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);                       // the checkout this file lives in
const PORT = Number(process.env.PORT ?? 9611);    // CDP
const CTRL = Number(process.env.CTRL ?? 9612);    // this file's control port
const PROJECT = process.env.PROJECT;
const SHOTS = process.env.SHOTS ?? join(ROOT, 'docs/captures/2026-09-05-effects-cold-read');

// ⚠ THE ELECTRON BINARY IS NOT IN A WORKTREE. npm resolves `node_modules` UP
// the tree for every package, so a worktree looks fully installed — but
// `node_modules/.bin/` is not walked, so `.bin/electron` is simply absent and
// the failure only shows at launch. ELECTRON_BIN is how a worktree run borrows
// the main checkout's binary, and it is REQUIRED rather than guessed: a silent
// fallback to a path that does not exist is the same invisible failure.
const ELECTRON = process.env.ELECTRON_BIN;
const MAIN = join(ROOT, 'dist/main/index.mjs');

if (!PROJECT) {
  console.error('PROJECT=<path to a THROWAWAY aeon clone> is required. Never the owner\'s tree.');
  process.exit(2);
}
if (PROJECT.replace(/\/+$/, '') === '/home/volence/sonic_hacks/aeon') {
  console.error('REFUSED: PROJECT is the owner\'s live aeon working tree. Clone it first.');
  process.exit(2);
}
if (!ELECTRON) {
  console.error('ELECTRON_BIN is required (a worktree has no node_modules/.bin/electron).');
  process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── THE ROWS THIS FILE DOES ASSERT ─────────────────────────────────────────
//
// An interactive driver has no fixed gesture sequence to assert about — that is
// the point of a cold read. But it DOES have a rig, and a rig that came up
// wrong is exactly what makes an operator write "the control does nothing" as a
// product defect. So the BOOT preconditions are real rows with a real red: if
// any of them fails the driver REFUSES to hand over the control port, because
// every reading taken through a broken rig is worse than no reading.
const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}

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

// ── real input ─────────────────────────────────────────────────────────────
async function mouse(c, type, x, y, button = 'left') {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button, buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
  });
}
/**
 * ⚠ `text` IS NOT DECORATION. A CDP keyDown WITHOUT `text` produces a keydown
 * and NO keypress. Blink activates a focused <button> on SPACE at keyup and on
 * ENTER at keypress — two different paths — so the textless form activates
 * Space and silently does nothing for Enter. A key the browser never turns into
 * a press is this repo's synthetic-event failure wearing a different hat.
 */
async function key(c, k, code, vk, modifiers = 0, text = undefined) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  // ⚠ ONE keyDown-WITH-text, NOT keyDown + a separate `char`. Blink synthesises
  // the keypress from a keyDown that carries `text`; sending `char` as well
  // types EVERY CHARACTER TWICE. Measured here on the first attempt —
  // "coldread_drift" arrived as "ccoollddrreeaadd__ddrriifftt".
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(text ? { text } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

/**
 * WHAT IS UNDER A POINT, and WHERE THE SCROLLER IS.
 *
 * Trap 3: `checkVisibility()` and `getClientRects()` both go GREEN on an
 * element scrolled 2,635px out of its scroller, so neither can carry a
 * visibility claim on its own. The scroller's own box is returned beside the
 * element's so the comparison can actually be made and PRINTED.
 */
const PROBE_FN = String.raw`(sel, nth) => {
  const els = [...document.querySelectorAll(sel)];
  const el = els[nth ?? 0];
  if (!el) return { found: false, count: els.length };
  let sc = el.parentElement;
  while (sc && sc !== document.body) {
    const cs = getComputedStyle(sc);
    if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) break;
    sc = sc.parentElement;
  }
  const b = el.getBoundingClientRect();
  const s = (sc || document.documentElement).getBoundingClientRect();
  return {
    found: true, count: els.length, dpr: window.devicePixelRatio,
    rect: { x: b.left, y: b.top, w: b.width, h: b.height },
    scroller: { tag: (sc||document.documentElement).tagName, cls: ((sc||document.documentElement).className||'').slice(0,60),
                x: s.left, y: s.top, w: s.width, h: s.height },
    insideScroller: b.top >= s.top - 1 && b.bottom <= s.bottom + 1 && b.left >= s.left - 1 && b.right <= s.right + 1,
    text: (el.textContent || '').trim().slice(0, 120),
    tag: el.tagName, type: el.getAttribute('type'), value: el.value ?? null,
    disabled: !!el.disabled, aria: el.getAttribute('aria-label'), title: el.getAttribute('title'),
  };
}`;

async function main() {
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const appLog = [];
  const cap = (tag) => (d) => {
    const s = `[${tag}] ${d}`;
    appLog.push(s);
    if (appLog.length > 400) appLog.shift();
    if (process.env.VERBOSE) process.stdout.write(s);
  };
  child.stdout.on('data', cap('app'));
  child.stderr.on('data', cap('app!'));

  let c;
  let server;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Console.enable').catch(() => {});
    const conLog = [];
    c.send('Log.enable').catch(() => {});
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    const hasDbg = await c.evalExpr('typeof window.__dbg === "object"').catch(() => false);
    check('r1', 'window.__dbg is present (the build carries VITE_AURORA_DEBUG=1 hooks)', hasDbg,
      hasDbg ? 'a plain build has no hooks and no way in' : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!hasDbg) throw new Error('window.__dbg absent — this needs a VITE_AURORA_DEBUG=1 build');
    // Renderer console, captured so a cold reader can tell "the app threw" from
    // "the control does nothing".
    await c.evalExpr(String.raw`(() => {
      if (window.__cr) return;
      window.__cr = { log: [] };
      for (const k of ['log','warn','error']) {
        const orig = console[k].bind(console);
        console[k] = (...a) => { try { window.__cr.log.push(k + ': ' + a.map(String).join(' ')); } catch {} ; orig(...a); };
      }
      window.addEventListener('error', (e) => window.__cr.log.push('window.error: ' + e.message));
      window.addEventListener('unhandledrejection', (e) => window.__cr.log.push('unhandledrejection: ' + String(e.reason)));
    })()`);

    // ⚠ THE ONE DEBUG-DOOR STEP. Not cold-read evidence; the report says so.
    await c.evalExpr(`void window.__dbg.aeon.open(${JSON.stringify(PROJECT)})`);
    await sleep(2500);
    // WHAT "OPENED" MEANS IS READ, NOT ASSUMED. The debug surface's own shape is
    // not pinned here — a row that demands a key this build does not publish
    // reddens on the harness's guess, not on the app. So: poll for a non-null
    // state, and print WHOLE what came back, plus the aeon debug API's own key
    // list, so a red row says which of the two it is.
    let ast = null;
    for (let i = 0; i < 30 && ast === null; i++) {
      ast = await c.json('window.__dbg.aeon.state() ?? null').catch((e) => ({ __threw: String(e.message).slice(0, 200) }));
      if (ast && ast.__threw) { const t = ast; ast = null; if (i === 29) ast = t; }
      if (ast === null) await sleep(500);
    }
    const aeonKeys = await c.json('Object.keys(window.__dbg.aeon ?? {})').catch(() => []);
    check('r2', 'the throwaway aeon clone actually opened', !!ast && !ast.__threw,
      `__dbg.aeon keys = ${JSON.stringify(aeonKeys)}\n        state = ${JSON.stringify(ast).slice(0, 400)}`);
    check('r3', 'the opened project is NOT the owner\'s live aeon working tree',
      !JSON.stringify(ast ?? {}).includes('/home/volence/sonic_hacks/aeon"')
      && PROJECT.replace(/\/+$/, '') !== '/home/volence/sonic_hacks/aeon',
      `PROJECT=${PROJECT}`);
    // ⚠ A "READY" line over a broken rig is how a rig defect becomes a product
    // defect in somebody's report. Refuse the handover instead.
    if (fails.length) {
      console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows PASS · FAILED: ${fails.join(', ')}`);
      throw new Error('BOOT ROWS RED — refusing to hand over the control port');
    }
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} boot rows PASS · 0 failed`);

    server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://x');
      const body = await new Promise((r) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => r(b)); });
      const ok = (v) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
      const bad = (e) => { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e && e.message || e) })); };
      try {
        if (url.pathname === '/js') return ok({ value: await c.json(`(${body})`) });
        if (url.pathname === '/rawjs') return ok({ value: await c.evalExpr(body) });
        if (url.pathname === '/probe') {
          const { sel, nth } = JSON.parse(body);
          return ok(await c.json(`(${PROBE_FN})(${JSON.stringify(sel)}, ${nth ?? 0})`));
        }
        if (url.pathname === '/click') {
          // Accept either an explicit {x,y} or a {sel,nth} to aim at.
          const p = JSON.parse(body);
          let x = p.x, y = p.y, geom = null;
          if (p.sel !== undefined) {
            geom = await c.json(String.raw`(() => {
              const els = [...document.querySelectorAll(${JSON.stringify(p.sel)})];
              const el = els[${p.nth ?? 0}];
              if (!el) return null;
              el.scrollIntoView({ block: 'center', inline: 'center' });
              const b = el.getBoundingClientRect();
              return { dpr: devicePixelRatio, left: b.left, top: b.top, w: b.width, h: b.height,
                       vw: innerWidth, vh: innerHeight, count: els.length,
                       text: (el.textContent||'').trim().slice(0,60), disabled: !!el.disabled };
            })()`);
            if (!geom) return bad(`HANDLE ABSENT: ${p.sel}[${p.nth ?? 0}] resolved to nothing`);
            await sleep(120);
            const g2 = await c.json(String.raw`(() => {
              const el = [...document.querySelectorAll(${JSON.stringify(p.sel)})][${p.nth ?? 0}];
              const b = el.getBoundingClientRect();
              return { dpr: devicePixelRatio, left: b.left, top: b.top, w: b.width, h: b.height, vw: innerWidth, vh: innerHeight };
            })()`);
            Object.assign(geom, g2);
            // INTEGER client pixels — trap 2.
            x = Math.round(geom.left + geom.w / 2) + (p.dx ?? 0);
            y = Math.round(geom.top + geom.h / 2) + (p.dy ?? 0);
          }
          if (!Number.isFinite(x) || !Number.isFinite(y)) return bad('no aim: pass {x,y} or {sel}');
          x = Math.round(x); y = Math.round(y);
          const hit = await c.json(String.raw`(() => {
            const el = document.elementFromPoint(${x}, ${y});
            const want = ${p.sel !== undefined ? `[...document.querySelectorAll(${JSON.stringify(p.sel)})][${p.nth ?? 0}]` : 'null'};
            return { tag: el?el.tagName:null, cls: el?String(el.className).slice(0,60):null,
                     text: el ? (el.textContent||'').trim().slice(0,60) : null,
                     isTarget: want ? (el === want || want.contains(el) || el.contains(want)) : null };
          })()`);
          // REFUSE rather than click whatever is underneath — trap 1's other half.
          if (p.sel !== undefined && !hit.isTarget && !p.force) {
            return bad(`AIM REFUSED: (${x},${y}) lands on <${hit.tag}> "${hit.text}", not ${p.sel}[${p.nth ?? 0}]`);
          }
          const btn = p.button ?? 'left';
          await mouse(c, 'mouseMoved', x, y, btn);
          await mouse(c, 'mousePressed', x, y, btn);
          await sleep(40);
          await mouse(c, 'mouseReleased', x, y, btn);
          await sleep(p.settle ?? 450);
          return ok({ aim: { x, y }, geom, hit });
        }
        if (url.pathname === '/drag') {
          const p = JSON.parse(body);
          await mouse(c, 'mouseMoved', Math.round(p.x0), Math.round(p.y0));
          await mouse(c, 'mousePressed', Math.round(p.x0), Math.round(p.y0));
          const steps = p.steps ?? 10;
          for (let i = 1; i <= steps; i++) {
            await mouse(c, 'mouseMoved', Math.round(p.x0 + (p.x1 - p.x0) * i / steps), Math.round(p.y0 + (p.y1 - p.y0) * i / steps));
            await sleep(20);
          }
          await mouse(c, 'mouseReleased', Math.round(p.x1), Math.round(p.y1));
          await sleep(p.settle ?? 400);
          return ok({ from: [p.x0, p.y0], to: [p.x1, p.y1] });
        }
        if (url.pathname === '/wheel') {
          // A REAL wheel, not `el.scrollTop = n`. A panel that scrolls on wheel
          // and a panel that scrolls on a programmatic assignment are not the
          // same panel, and the difference is exactly the class of defect this
          // rig exists to avoid attributing to the app.
          const p = JSON.parse(body);
          await c.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel', x: Math.round(p.x), y: Math.round(p.y),
            deltaX: p.dx ?? 0, deltaY: p.dy ?? 200, modifiers: p.modifiers ?? 0,
          });
          await sleep(p.settle ?? 250);
          return ok({ at: [p.x, p.y], dy: p.dy ?? 200 });
        }
        if (url.pathname === '/text') {
          // Which element carries a given literal, and where it is — the aiming
          // primitive for a panel whose controls carry no stable selector.
          const p = JSON.parse(body);
          return ok(await c.json(String.raw`(() => {
            const want = ${JSON.stringify(p.t)};
            const hits = [...document.querySelectorAll('*')].filter((e) =>
              (e.innerText || '').trim().startsWith(want) && e.children.length <= (${p.maxKids ?? 4}));
            return hits.map((e) => { const b = e.getBoundingClientRect(); return {
              tag: e.tagName, x: Math.round(b.left), y: Math.round(b.top),
              w: Math.round(b.width), h: Math.round(b.height),
              text: (e.innerText || '').trim().slice(0, 60) }; });
          })()`));
        }
        if (url.pathname === '/key') {
          const p = JSON.parse(body);
          await key(c, p.key, p.code, p.vk, p.modifiers ?? 0, p.text);
          await sleep(p.settle ?? 250);
          return ok({ sent: p.key });
        }
        if (url.pathname === '/type') {
          // Types into whatever has focus, one char at a time, the real channel.
          const p = JSON.parse(body);
          for (const ch of String(p.text)) {
            // See `key()` above: keyDown-with-text ALREADY produces the keypress.
            await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch, unmodifiedText: ch });
            await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
            await sleep(20);
          }
          await sleep(p.settle ?? 300);
          return ok({ typed: p.text });
        }
        if (url.pathname === '/shot') {
          const name = url.searchParams.get('name') || `shot-${Date.now()}`;
          const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
          const f = join(SHOTS, `${name}.png`);
          writeFileSync(f, Buffer.from(data, 'base64'));
          return ok({ file: f, bytes: Buffer.from(data, 'base64').length });
        }
        if (url.pathname === '/console') {
          const v = await c.json('window.__cr ? window.__cr.log.slice(-60) : []');
          return ok({ renderer: v, main: appLog.slice(-40) });
        }
        if (url.pathname === '/clearconsole') {
          await c.evalExpr('window.__cr && (window.__cr.log.length = 0)');
          appLog.length = 0;
          return ok({ cleared: true });
        }
        if (url.pathname === '/quit') { ok({ bye: true }); setTimeout(() => process.exit(0), 100); return; }
        return bad(`unknown path ${url.pathname}`);
      } catch (e) { return bad(e); }
    });
    await new Promise((r) => server.listen(CTRL, '127.0.0.1', r));
    console.log(`READY ctrl=${CTRL} cdp=${PORT} project=${PROJECT} shots=${SHOTS}`);
    // Park. The operator drives; /quit ends it.
    await new Promise(() => {});
  } finally {
    // ⚠ AWAITED. A dropped killTree promise skips the grace and leaks the tree —
    // a known defect in this repo, closed by rule G5 of check-harness-guards.
    try { server?.close(); } catch { /* nothing to close */ }
    await killTree(child);
  }
}

process.on('SIGINT', () => process.exit(130));
main().catch(async (e) => { console.error('FATAL', e); process.exit(1); });
