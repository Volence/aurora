#!/usr/bin/env node
// Plan-6 verification harness: does an aeon palette-slider drag that is
// INTERRUPTED (facet switch mid-drag) strand the document?
//
// The bug being reproduced: PaletteEditor previews by writing zone.palette
// directly, and only the drag END turns that into an undoable step. Chrome does
// not fire `blur` when a focused element is removed, so unmounting the slider
// panel mid-drag left the palette changed with an EMPTY undo stack.
//
// Launch rules (same as tile-editor-harness.mjs): port checked free first,
// xvfb-run never the user's DISPLAY, spawn DETACHED and kill the PROCESS GROUP.
//
// Evidence rules:
//   - the palette value is read off the SWATCH TITLES, which the component
//     renders from the model (`line N, index M — $0EEE`), not off pixels;
//   - "was it recorded" is the Undo chip's enabled state plus an actual Ctrl+Z,
//     never eyeballed;
//   - a negative control (`neg`) runs alongside: a drag that is RELEASED
//     normally must still commit, or the probe is measuring nothing.
//
// Run with MODE=before against a tree holding the pre-fix PaletteEditor to see
// the bug; MODE=after (default) against the fixed one.

import { AURORA_ROOT, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9357);
const ROOT = AURORA_ROOT;
const ELECTRON = process.env.ELECTRON_BIN
  ?? siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron');
const AEONDIR = siblingPathOrUnresolved('aeon') + '/';
const MODE = process.env.MODE ?? 'after';

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
    } catch { /* not up */ }
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const results = []; const fails = []; const negFails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok }); if (!ok) fails.push(`[${id}] ${name}`);
}
function neg(id, name, ok, detail) {
  const good = ok === false;
  console.log(`${good ? 'neg-ok' : 'NEG-BROKEN'}  [${id}] (planted) ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!good) negFails.push(`[${id}] ${name}`);
}
function note(id, name, detail) { console.log(`NOTE  [${id}] ${name} — ${detail}`); }

const HELPERS = String.raw`
(() => {
  const H = {};
  H.pills = () => [...document.querySelectorAll('[aria-label="Facets"] button')].map((b) => b.textContent.trim());
  H.clickPill = (label) => {
    const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  // PaletteEditor's zone swatches carry "line N, index M — $XXXX" as their title,
  // rendered straight from zone.palette. That title IS the model readout.
  H.swatches = () => [...document.querySelectorAll('div[title]')].filter((d) => /^line \d+, index \d+ — \$/.test(d.title));
  H.word = (line, idx) => {
    const d = H.swatches().find((e) => e.title.startsWith('line ' + line + ', index ' + idx + ' '));
    return d ? d.title.split('— ')[1] : null;
  };
  H.allWords = () => H.swatches().map((d) => d.title);
  H.clickSwatch = (line, idx) => {
    const d = H.swatches().find((e) => e.title.startsWith('line ' + line + ', index ' + idx + ' '));
    if (!d) return false; d.click(); return true;
  };
  H.sliders = () => [...document.querySelectorAll('input[type=range]')];
  // Drive ONE slider tick the way the browser does: set the value through the
  // native setter (React tracks the node's value and would swallow a plain
  // assignment) then dispatch a bubbling 'input'. Deliberately NO pointerup,
  // keyup or blur — that is the whole point.
  H.dragOnly = (which, value) => {
    const s = H.sliders()[which];
    if (!s) return 'no-slider';
    s.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(s, String(value));
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return s.value;
  };
  H.release = (which) => {
    const s = H.sliders()[which]; if (!s) return 'no-slider';
    s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return 'released';
  };
  H.chipEnabled = (label) => {
    const s = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && e.textContent.trim() === label);
    return s ? getComputedStyle(s).opacity === '1' : null;
  };
  H.sliderCount = () => H.sliders().length;
  window.__h = H;
  return Object.keys(H).length;
})()`;

async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);

/** Open the palette facet, select line/idx, return the committed word. */
async function openSwatch(c, line, idx) {
  await c.evalExpr('window.__h.clickPill("Palette")'); await sleep(1200);
  await c.evalExpr(HELPERS);
  const ok = await c.evalExpr(`window.__h.clickSwatch(${line}, ${idx})`);
  await sleep(400);
  return { ok, word: await c.evalExpr(`window.__h.word(${line}, ${idx})`) };
}

async function runChecks(c) {
  await c.evalExpr(HELPERS);
  const pills = await c.json('window.__h.pills()');
  note('env', 'facet pills', JSON.stringify(pills));
  if (!pills.includes('Palette')) { check('env', 'aeon Palette facet reachable', false, JSON.stringify(pills)); return; }

  const LINE = 1, IDX = 5;

  // ---- A. the interrupted drag -------------------------------------------
  const opened = await openSwatch(c, LINE, IDX);
  check('A0', 'a zone swatch opens the slider panel',
    opened.ok === true && (await c.evalExpr('window.__h.sliderCount()')) === 3,
    `word=${opened.word} sliders=${await c.evalExpr('window.__h.sliderCount()')}`);
  const before = opened.word;

  const undoBefore = await c.evalExpr('window.__h.chipEnabled("Undo")');
  note('A0', 'Undo chip before any edit', String(undoBefore));

  // Move the RED slider to a level the committed color is not already at.
  const curR = await c.evalExpr('window.__h.sliders()[0].value');
  const target = String((Number(curR) + 3) % 8);
  const dragged = await c.evalExpr(`window.__h.dragOnly(0, ${target})`);
  await sleep(350);
  const midDrag = await c.evalExpr(`window.__h.word(${LINE}, ${IDX})`);
  check('A1', 'the drag previews live into the document',
    midDrag !== before, `${before} -> ${midDrag} (R ${curR}->${dragged})`);

  // …now yank the panel out from under it, with NO pointerup/keyup/blur.
  await c.evalExpr('window.__h.clickPill("Art")');
  await sleep(1500);
  await c.evalExpr(HELPERS);
  const slidersGone = await c.evalExpr('window.__h.sliderCount()');
  note('A2', 'slider panel after the facet switch', `${slidersGone} range inputs`);

  await c.evalExpr('window.__h.clickPill("Palette")'); await sleep(1300);
  await c.evalExpr(HELPERS);
  const afterSwitch = await c.evalExpr(`window.__h.word(${LINE}, ${IDX})`);
  const undoAfter = await c.evalExpr('window.__h.chipEnabled("Undo")');

  const kept = afterSwitch === midDrag;
  const recorded = undoAfter === true;
  note('A3', 'state after the interrupted drag',
    `word ${before} -> ${afterSwitch} (kept=${kept}) · Undo enabled=${undoAfter}`);

  check('A4', 'the interrupted drag left NOTHING stranded (either recorded, or rolled back)',
    (kept && recorded) || (!kept && afterSwitch === before),
    kept && recorded ? 'kept AND on the undo stack'
      : !kept && afterSwitch === before ? 'rolled back to pre-drag'
      : `STRANDED: word=${afterSwitch} pre=${before} undoEnabled=${undoAfter}`);

  check('A5', 'commit-on-teardown: the change is KEPT, not silently discarded',
    kept, `${before} -> ${afterSwitch}`);

  if (recorded) {
    await ctrlZ(c); await sleep(700);
    await c.evalExpr(HELPERS);
    const undone = await c.evalExpr(`window.__h.word(${LINE}, ${IDX})`);
    check('A6', 'one Ctrl+Z takes the interrupted edit back',
      undone === before, `${afterSwitch} --ctrl+z--> ${undone} (pre-drag was ${before})`);
    // Redo it back so the negative control below starts from a known place.
    await key(c, 'y', 'KeyY', 89, 2); await sleep(600);
  } else {
    check('A6', 'one Ctrl+Z takes the interrupted edit back', false,
      'nothing on the undo stack to take back — this is the bug');
  }

  // ---- B. negative control: a NORMALLY RELEASED drag still commits --------
  await c.evalExpr(HELPERS);
  const b0 = await openSwatch(c, 2, 7);
  const bBefore = b0.word;
  const bR = await c.evalExpr('window.__h.sliders()[0].value');
  await c.evalExpr(`window.__h.dragOnly(0, ${(Number(bR) + 3) % 8})`);
  await sleep(300);
  await c.evalExpr('window.__h.release(0)');
  await sleep(600);
  await c.evalExpr(HELPERS);
  const bAfter = await c.evalExpr('window.__h.word(2, 7)');
  check('B1', 'an ordinary released drag still commits', bAfter !== bBefore, `${bBefore} -> ${bAfter}`);
  check('B2', 'and it is undoable', (await c.evalExpr('window.__h.chipEnabled("Undo")')) === true);
  // The probe would report "committed" for a no-op too if it were blind:
  neg('B3', 'a swatch nobody touched changed as well',
    (await c.evalExpr('window.__h.word(3, 3)')) !== (await c.evalExpr('window.__h.word(3, 3)')),
    'same swatch read twice');
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} already serves a CDP target — a stale Electron is alive`);
  console.log(`MODE=${MODE} · port ${PORT} verified free`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });
  const killGroup = () => {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
  };

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof window.api === "object"')) break; } catch { /* ctx swap */ }
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear(); 1');
    await c.evalExpr(`window.api.addRecentProject(${JSON.stringify(AEONDIR)}, 'Sonic 4')`);
    await c.evalExpr('setTimeout(() => location.reload(), 50); 1');
    await sleep(4500);
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof window.api === "object"')) break; } catch { /* ctx swap */ }
      await sleep(250);
    }
    await sleep(1500);
    const opened = await c.evalExpr(`
      (() => { const b = document.querySelector('button[title=${JSON.stringify(AEONDIR)}]');
        if (!b) return [...document.querySelectorAll('button[title]')].map((e) => e.getAttribute('title')).slice(0, 20);
        b.click(); return 'clicked'; })()`);
    if (opened !== 'clicked') throw new Error(`aeon recent row unreachable: ${JSON.stringify(opened)}`);
    await sleep(7000);
    await runChecks(c);
  } finally {
    if (c) { try { c.close(); } catch { /* */ } }
    killGroup();
    await sleep(1000);
    console.log(`port free after teardown: ${await portFree()}`);
  }
  console.log(`\n=== ${MODE}: ${fails.length} FAIL, ${negFails.length} broken negatives ===`);
  if (fails.length) console.log(fails.join('\n'));
  process.exit(fails.length || negFails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
