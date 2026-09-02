#!/usr/bin/env node
// DOES AN AUTHOR ACTUALLY SEE A BOUNDED STACK, AND CAN HE GET AT WHAT IT HID?
//
// ROADMAP row O43. `toastStack` and `overflowLabel` are pure and 14 vitest rows
// cover them — and NOT ONE OF THEM CAN SEE THE SCREEN. `ToastContainer` is
// `.tsx`, which this repo does not collect at all, so "the selector is correct
// and the component still maps the raw array", "the overflow row renders behind
// the toasts", and "the row is there and nothing happens when you click it" are
// all invisible to the node suite and all present exactly as "the cap does not
// work". This file is the only instrument that can tell.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. A CAP THAT IS ACTUALLY A DROP. The whole hazard of this parcel is that
//    hiding an error silently is WORSE than a wall of them. So §3 asserts the
//    STORE still holds every toast at the moment the SCREEN is showing four —
//    two numbers from two different places, which is the only way to tell a cap
//    from a deletion.
//
// 2. AN OVERFLOW ROW THAT LIES. The count is not compared to a literal. It is
//    rebuilt from what is on screen (`store total − painted rows`) and from the
//    painted rows' own severities, so a row that printed a constant, or printed
//    zero because it could not measure, fails here.
//
// 3. A DEAD END. A count with no way to reach the messages behind it is the
//    failure mode that is worse than the wall. §5 clicks the row with a real
//    mouse event and requires every hidden toast to appear.
//
// 4. AN AIM THAT IS WRONG WHILE THE FEATURE IS FINE. The click target is an
//    INTEGER client pixel at the row's own rect centre, and §5 asserts
//    `elementFromPoint` returns that row BEFORE dispatching — a strip that is
//    covered, or a `pointerEvents` rule that made the row unclickable, says so
//    in its own words instead of presenting as "expanding is broken".
//
// 5. A VACUOUS FIXTURE. ⚠ THIS PARCEL'S OWN TRAP: pushing twelve ERRORS would
//    pass every row below while the error-promotion rule was completely broken.
//    The fixture is SIX ERRORS FIRST, THEN SIX WARNINGS — `saveAllDirty`'s
//    literal shape, failures then acknowledgements — so a build that simply kept
//    the newest four would paint four warnings and §4 fails naming them.
//    Warnings rather than successes only because a success expires in 2.2s and
//    this run needs its fixture alive across a click; the selector does not
//    distinguish the two (both are "not an error").
//
// ═══ HOW TO RUN ═══
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build   # __dbg exists ONLY here
//   node scratchpad/toast-overflow-harness.mjs    # or: npm run harness:toast-overflow
//
// Screenshots land in scratchpad/shots-toast-overflow/.

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9419);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron'));
const SHOTS = `${ROOT}/scratchpad/shots-toast-overflow`;
mkdirSync(SHOTS, { recursive: true });

// ── THE FIXTURE, AND WHY EVERY NUMBER IS THAT NUMBER ───────────────────────
// SIX of each: more than any plausible cap (so the overflow row must appear
// whatever MAX_VISIBLE_TOASTS is set to, and this file never spells it), and
// enough errors that some of them are hidden too — an overflow of nothing but
// warnings would never exercise the "(N errors)" clause.
const N_ERR = 6;
const N_WARN = 6;
// Messages carry their index so a painted row can be attributed exactly. The
// prose is the real markUnreadable sentence, so the screenshots show what an
// author would actually be reading, at the real length.
const ERR = (i) => `games/sonic4/data/editor/ojz/act1/section_${i}.meta.json exists but could not be read (Unexpected token). Aurora is showing empty data for it and will NOT overwrite the file — fix it by hand and reopen.`;
const WARN = (i) => `Section ${i}: these cells sit behind a loop, so the engine may read a different chunk than the one shown.`;

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

const results = [];
const fails = [];
const misses = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
/** Say it IMMEDIATELY when a probe came back with nothing — a control that was
 *  never found makes every row after it meaningless, and finding that out in a
 *  blanket row at the end costs a whole run. */
function watchMiss(where, v) {
  if (v === 'no-element' || v === null || v === false || (v && v.error)) {
    misses.push(`${where}: ${JSON.stringify(v)}`);
    console.log(`MISS       ${where}: ${JSON.stringify(v)}`);
  }
  return v;
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-toast-overflow/${name}.png`);
}

// ── reading the strip off the SCREEN, not out of the store ────────────────
// The toast rectangles are the only elements in the app titled "Dismiss", and
// the overflow / collapse rows are the only ones titled "Show all" / "Collapse".
// Reading by title rather than by class keeps this independent of the inline
// style objects, which are exactly what a redesign moves.
const PAINTED = String.raw`
(() => {
  const rows = [...document.querySelectorAll('[title="Dismiss"]')].map((e) => (e.textContent || '').trim());
  const over = [...document.querySelectorAll('[title="Show all"]')].map((e) => (e.textContent || '').trim());
  const coll = [...document.querySelectorAll('[title="Collapse"]')].map((e) => (e.textContent || '').trim());
  return { rows, over, coll };
})()`;

/** The overflow row's rect, its integer centre, and what is actually AT that
 *  centre — asked live, because the strip moves as rows appear and disappear. */
const OVERFLOW_AIM = String.raw`
(() => {
  const el = document.querySelector('[title="Show all"]');
  if (!el) return 'no-element';
  const r = el.getBoundingClientRect();
  const px = Math.round(r.left + r.width / 2);
  const py = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(px, py);
  return { px, py, w: Math.round(r.width), h: Math.round(r.height),
           isSelf: hit === el, hitText: hit ? (hit.getAttribute('title') || hit.tagName) : null };
})()`;

const COLLAPSE_AIM = String.raw`
(() => {
  const el = document.querySelector('[title="Collapse"]');
  if (!el) return 'no-element';
  const r = el.getBoundingClientRect();
  const px = Math.round(r.left + r.width / 2);
  const py = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(px, py);
  return { px, py, isSelf: hit === el, hitText: hit ? (hit.getAttribute('title') || hit.tagName) : null };
})()`;

async function mouse(c, type, x, y, extra = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', pointerType: 'mouse',
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
  });
  await sleep(extra.settle ?? 90);
}
async function click(c, x, y) {
  await mouse(c, 'mouseMoved', x, y, { settle: 40 });
  await mouse(c, 'mousePressed', x, y, { settle: 40 });
  await mouse(c, 'mouseReleased', x, y, { settle: 250 });
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
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    if (!(await c.evalExpr('typeof window.__dbg === "object"'))) {
      throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');
    }

    // ---- 0. PROVENANCE ----------------------------------------------------
    const havePush = await c.evalExpr('typeof window.__dbg.pushToasts === "function"');
    check('0a', 'the build under test has the seam this run drives', havePush === true, `${ROOT}/dist`);

    // ---- 1. CONTROL: the strip is empty before anything is pushed ---------
    // Without this, "four rows on screen" is compatible with a build that paints
    // four of its own and none of mine.
    let painted = watchMiss('painted@before', await c.json(PAINTED));
    check('1a', 'CONTROL: nothing is on the toast strip before the run pushes anything',
      painted.rows.length === 0 && painted.over.length === 0 && painted.coll.length === 0,
      JSON.stringify({ rows: painted.rows.length, over: painted.over.length, coll: painted.coll.length }));
    await shot(c, '00-before');

    // ---- 2. Push the flood, through the app's own addToast ----------------
    const items = [
      ...Array.from({ length: N_ERR }, (_, i) => ({ message: ERR(i), type: 'error' })),
      ...Array.from({ length: N_WARN }, (_, i) => ({ message: WARN(i), type: 'warning' })),
    ];
    await c.evalExpr(`window.__dbg.pushToasts(${JSON.stringify(items)})`);
    await sleep(300);

    const stored = await c.json('window.__dbg.toasts()');
    check('2a', `all ${items.length} toasts really reached the store`,
      stored.length === items.length, `store holds ${stored.length}`);

    // ---- 3. THE CAP IS A CAP, NOT A DELETION ------------------------------
    painted = watchMiss('painted@capped', await c.json(PAINTED));
    const nPainted = painted.rows.length;
    check('3a', 'the SCREEN paints fewer toasts than the STORE holds',
      nPainted > 0 && nPainted < stored.length,
      `painted ${nPainted} of ${stored.length}`);
    check('3b', 'and the store did NOT lose the rest — a cap, not a drop',
      stored.length === items.length, `store still holds ${stored.length}`);

    // ---- 4. AN ERROR IS NEVER WHAT GETS HIDDEN ---------------------------
    // The fixture put six warnings on AFTER six errors. A build that kept the
    // newest N paints warnings here.
    const paintedErrors = painted.rows.filter((t) => t.includes('could not be read')).length;
    check('4a', 'every painted row is one of the ERRORS, though six warnings arrived after them',
      paintedErrors === nPainted, `${paintedErrors}/${nPainted} painted rows are errors`);

    // ---- 5. THE OVERFLOW ROW, AND ITS COUNT ------------------------------
    check('5a', 'an overflow row is painted', painted.over.length === 1,
      JSON.stringify(painted.over));
    // Rebuilt from the two independent readings — never from a literal, and
    // never from the number the row itself printed.
    const hidden = stored.length - nPainted;
    const hiddenErrors = N_ERR - paintedErrors;
    const expected = `+${hidden} more (${hiddenErrors} error${hiddenErrors === 1 ? '' : 's'}) — click to show all`;
    check('5b', 'and its count is the real one, rebuilt from the store and the screen',
      painted.over[0] === expected, `saw    "${painted.over[0]}"\n        wanted "${expected}"`);
    await shot(c, '01-capped');

    // ---- 6. IT IS REACHABLE ----------------------------------------------
    const aim = watchMiss('overflow aim', await c.json(OVERFLOW_AIM));
    note('overflow row aim', JSON.stringify(aim));
    check('6a', 'the overflow row is what the pointer would actually hit at its centre',
      aim.isSelf === true, `hit=${aim.hitText} at (${aim.px},${aim.py})`);
    await click(c, aim.px, aim.py);

    const opened = watchMiss('painted@open', await c.json(PAINTED));
    check('6b', 'clicking it shows EVERY toast the stack was holding',
      opened.rows.length === stored.length, `${opened.rows.length} painted, store ${stored.length}`);
    check('6c', 'and the ones that were hidden are really among them — the warnings are back',
      opened.rows.filter((t) => t.includes('behind a loop')).length === N_WARN,
      `${opened.rows.filter((t) => t.includes('behind a loop')).length}/${N_WARN} warnings painted`);
    check('6d', 'the overflow row is replaced by a collapse row, so the state is escapable',
      opened.over.length === 0 && opened.coll.length === 1, JSON.stringify(opened.coll));
    await shot(c, '02-expanded');

    // ---- 7. AND IT COLLAPSES ---------------------------------------------
    const cAim = watchMiss('collapse aim', await c.json(COLLAPSE_AIM));
    check('7a', 'the collapse row is what the pointer would hit at its centre',
      cAim.isSelf === true, `hit=${cAim.hitText} at (${cAim.px},${cAim.py})`);
    await click(c, cAim.px, cAim.py);
    const closed = watchMiss('painted@closed', await c.json(PAINTED));
    check('7b', 'and the stack goes back to the bounded one',
      closed.rows.length === nPainted && closed.over.length === 1,
      `${closed.rows.length} painted, over=${JSON.stringify(closed.over)}`);
    await shot(c, '03-collapsed');

    // ---- 8. THE BLANKET ---------------------------------------------------
    check('8a', 'BLANKET: no probe in this run came back `no-element`, null or false',
      misses.length === 0, misses.length === 0 ? 'clean' : misses.join('\n        '));
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
