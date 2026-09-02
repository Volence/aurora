#!/usr/bin/env node
// Stage-4 plan 6, task H2.2 verification: ONE palette grid on FOUR screens.
//
//   ENGINE=aeon    → aeon Art column + aeon Palette facet
//   ENGINE=classic → classic Art column + classic Palette facet
//
// The suite cannot render React (node-only, .tsx not collected), so every claim
// about what these screens DO can only be made here.
//
// Launch rules (same as tile-editor-harness.mjs / palette-drag-harness.mjs):
// debug port checked free BEFORE and AFTER, xvfb-run never the user's DISPLAY,
// spawn DETACHED, kill by PROCESS GROUP.
//
// Evidence rules:
//   - a swatch's COLOUR is read from getComputedStyle, not eyeballed; under aeon
//     it is cross-checked against the CRAM word in the swatch's own title;
//   - "was it recorded" is the Undo chip plus a real Ctrl+Z, never inferred;
//   - every block carries NEGATIVE CONTROLS (`neg`) — conditions known to be
//     false. If one of them reports true the probe is blind and the whole run is
//     worthless, which is reported separately from the failures.

import { AURORA_ROOT, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';

const ENGINE = process.env.ENGINE ?? 'aeon';
const PORT = Number(process.env.PORT ?? (ENGINE === 'aeon' ? 9371 : 9372));
const ROOT = AURORA_ROOT;
const ELECTRON = process.env.ELECTRON_BIN
  ?? siblingPathOrUnresolved('aurora', 'node_modules/.bin/electron');
const AEONDIR = siblingPathOrUnresolved('aeon') + '/';
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots6`;
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
  results.push({ id, name, ok, detail }); if (!ok) fails.push(`[${id}] ${name} — ${detail}`);
}
/** A condition that MUST be false. If it is true the probe cannot see. */
function neg(id, name, ok, detail) {
  const good = ok === false;
  console.log(`${good ? 'neg-ok' : 'NEG-BROKEN'}  [${id}] (planted) ${name}${detail !== undefined ? ` — ${detail}` : ''}`);
  if (!good) negFails.push(`[${id}] ${name} — ${detail}`);
}
function note(id, name, detail) { console.log(`NOTE  [${id}] ${name} — ${detail}`); }

async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${ENGINE}-${name}.png`, Buffer.from(data, 'base64'));
  } catch (e) { note('shot', name, `failed: ${e.message}`); }
}

// ---------------------------------------------------------------------------
// In-page helpers. Re-installed after every facet switch (React remounts).
// ---------------------------------------------------------------------------
const HELPERS = String.raw`
(() => {
  const H = {};
  const LADDER = [0, 36, 73, 109, 146, 182, 219, 255];
  H.pills = () => [...document.querySelectorAll('[aria-label="Facets"] button')].map((b) => b.textContent.trim());
  H.clickPill = (label) => {
    const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === label);
    if (!b) return false; b.click(); return true;
  };
  // THE GRID, found structurally rather than by title: aeon's locked line 0
  // gives all sixteen swatches the SAME title, so titles cannot address a cell.
  // A palette row is any element with exactly 16 <button> children.
  H.rows = () => [...document.querySelectorAll('div')]
    .filter((d) => [...d.children].filter((c) => c.tagName === 'BUTTON').length === 16);
  H.cell = (line, idx) => {
    const row = H.rows()[line];
    return row ? [...row.children].filter((c) => c.tagName === 'BUTTON')[idx] ?? null : null;
  };
  H.shape = () => H.rows().map((r) => [...r.children].filter((c) => c.tagName === 'BUTTON').length);
  H.title = (l, i) => { const c = H.cell(l, i); return c ? c.getAttribute('title') : null; };
  H.titles = () => H.rows().map((r, l) => [...r.children].filter((c) => c.tagName === 'BUTTON').map((_, i) => H.title(l, i)));
  H.css = (l, i, prop) => { const c = H.cell(l, i); return c ? getComputedStyle(c)[prop] : null; };
  H.color = (l, i) => H.css(l, i, 'backgroundColor');
  H.rgb = (l, i) => {
    const m = /rgba?\((\d+), ?(\d+), ?(\d+)/.exec(H.color(l, i) || '');
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  H.isChecker = (l, i) => (H.css(l, i, 'backgroundImage') || 'none') !== 'none';
  H.onLadder = (l, i) => { const c = H.rgb(l, i); return c ? c.every((v) => LADDER.includes(v)) : false; };
  H.opacity = (l, i) => H.css(l, i, 'opacity');
  H.borderW = (l, i) => H.css(l, i, 'borderTopWidth');
  H.outlineW = (l, i) => H.css(l, i, 'outlineWidth');
  H.click = (l, i) => { const c = H.cell(l, i); if (!c) return 'no-cell'; c.click(); return 'clicked'; };
  H.rightClick = (l, i) => {
    const c = H.cell(l, i); if (!c) return 'no-cell';
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2 }));
    return 'menued';
  };
  // Aeon's line grips: the non-button child of a palette row.
  H.grips = () => H.rows().map((r) => [...r.children].find((c) => c.tagName !== 'BUTTON' && c.tagName !== 'SPAN') ?? null);
  H.gripInfo = () => H.grips().map((g) => (g ? { tag: g.tagName, draggable: g.getAttribute('draggable'), title: g.getAttribute('title'), cursor: getComputedStyle(g).cursor } : null));
  H.rightClickGrip = (l) => {
    const g = H.grips()[l]; if (!g) return 'no-grip';
    const r = g.getBoundingClientRect();
    g.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.x + 2, clientY: r.y + 2 }));
    return 'menued';
  };
  // The floating copy menu's item labels (PaletteCopyMenu).
  H.menuItems = () => [...document.querySelectorAll('span,div,button')]
    .map((e) => (e.children.length === 0 ? e.textContent.trim() : ''))
    .filter((t) => /^(Zone line \d|Standalone)/.test(t));
  H.menuHeading = () => {
    const e = [...document.querySelectorAll('div')]
      .find((x) => x.children.length === 0 && /^Copy (color|line) to$/.test(x.textContent.trim()));
    return e ? e.textContent.trim() : null;
  };
  H.clickMenuItem = (label) => {
    const e = [...document.querySelectorAll('span,button')]
      .find((x) => x.children.length === 0 && x.textContent.trim() === label);
    if (!e) return 'no-item';
    (e.closest('button') || e).click(); return 'clicked';
  };
  H.closeMenu = () => { document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); document.body.click(); };
  // HTML5 DnD, driven through React's delegated listeners. The payload rides a
  // module ref rather than dataTransfer, so bare DragEvents are enough.
  H.dragSwatch = (fromL, fromI, toL, toI) => {
    const a = H.cell(fromL, fromI), b = H.cell(toL, toI);
    if (!a || !b) return 'missing';
    a.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    b.dispatchEvent(new DragEvent('drop', { bubbles: true }));
    a.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    return 'dropped';
  };
  H.dragLine = (fromL, toL) => {
    const a = H.grips()[fromL], b = H.grips()[toL];
    if (!a || !b) return 'missing';
    a.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
    b.dispatchEvent(new DragEvent('drop', { bubbles: true }));
    a.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    return 'dropped';
  };
  H.sliders = () => [...document.querySelectorAll('input[type=range]')];
  H.sliderCount = () => H.sliders().length;
  H.heading = () => {
    const s = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && /·\s*Index \d+/.test(e.textContent));
    return s ? s.textContent.trim() : null;
  };
  H.noteText = () => {
    const d = [...document.querySelectorAll('div')].find((e) => e.children.length === 0 && /index 0 is transparent/.test(e.textContent));
    return d ? d.textContent.trim() : null;
  };
  H.hintText = () => {
    const d = [...document.querySelectorAll('div')].find((e) => e.children.length === 0 && /click a swatch to edit/.test(e.textContent));
    return d ? d.textContent.trim() : null;
  };
  H.gutter = () => H.rows().map((r) => { const s = [...r.children].find((c) => c.tagName === 'SPAN'); return s ? s.textContent.trim() : null; });
  // One slider tick the way the browser does it: React tracks the node's value,
  // so a plain assignment is swallowed. Deliberately NO pointerup/keyup/blur.
  H.dragOnly = (which, value) => {
    const s = H.sliders()[which]; if (!s) return 'no-slider';
    s.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(s, String(value));
    s.dispatchEvent(new Event('input', { bubbles: true }));
    return s.value;
  };
  H.release = (which) => {
    const s = H.sliders()[which]; if (!s) return 'no-slider';
    s.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return 'released';
  };
  H.sliderValue = (which) => { const s = H.sliders()[which]; return s ? s.value : null; };
  H.chipEnabled = (label) => {
    const s = [...document.querySelectorAll('span')].find((e) => e.children.length === 0 && e.textContent.trim() === label);
    return s ? getComputedStyle(s).opacity === '1' : null;
  };
  window.__h = H;
  return Object.keys(H).length;
})()`;

async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);

async function facet(c, label, ms = 1400) {
  await c.evalExpr(HELPERS);
  const ok = await c.evalExpr(`window.__h.clickPill(${JSON.stringify(label)})`);
  await sleep(ms);
  await c.evalExpr(HELPERS);
  return ok;
}

// ---------------------------------------------------------------------------
// Per-mount block: the grid itself, the policy differences, one edit + one undo.
// ---------------------------------------------------------------------------
async function checkMount(c, tag, pill) {
  const P = (id) => `${tag}.${id}`;
  await facet(c, pill);
  const shape = await c.json('window.__h.shape()');
  const expectRows = 4;
  check(P('1'), `${pill}: the grid renders ${expectRows}x16`,
    shape.length === expectRows && shape.every((n) => n === 16), `rows=${JSON.stringify(shape)}`);
  if (shape.length === 0) { note(P('1'), 'no grid — the rest of this mount is unreachable', ''); return null; }
  neg(P('1n'), 'a 5th palette row exists', shape.length === 5, `rows=${shape.length}`);

  // ---- colours -----------------------------------------------------------
  const ladder = await c.json('[0,1,2,3].map(l => [...Array(16).keys()].slice(1).every(i => window.__h.onLadder(l, i)))');
  check(P('2'), `${pill}: every swatch draws a quantized Genesis colour (3-bit ladder)`,
    ladder.every(Boolean), `per line: ${JSON.stringify(ladder)}`);
  const distinct = await c.evalExpr(`new Set([0,1,2,3].flatMap(l => [...Array(16).keys()].slice(1).map(i => window.__h.color(l,i)))).size`);
  check(P('3'), `${pill}: the grid is a real palette, not one colour repeated`, distinct > 8, `${distinct} distinct colours`);
  const checker0 = await c.json('[0,1,2,3].map(l => window.__h.isChecker(l, 0))');
  check(P('4'), `${pill}: index 0 of every line draws the transparency checker`,
    checker0.every(Boolean), JSON.stringify(checker0));
  neg(P('4n'), 'an ordinary swatch also draws the checker', await c.evalExpr('window.__h.isChecker(1, 5)'));

  if (ENGINE === 'aeon') {
    // The title carries the CRAM word, so the rendered pixel can be checked
    // against the model rather than merely being "some colour".
    const agree = await c.json(`
      [1,2,3].flatMap(l => [...Array(16).keys()].slice(1).map((i) => {
        const t = window.__h.title(l, i) || '';
        const m = /\\$([0-9A-F]{4})/.exec(t); if (!m) return 'no-word';
        const w = parseInt(m[1], 16);
        const dec = [Math.round(((w >> 1) & 7) * 255 / 7), Math.round(((w >> 5) & 7) * 255 / 7), Math.round(((w >> 9) & 7) * 255 / 7)];
        const got = window.__h.rgb(l, i);
        return JSON.stringify(dec) === JSON.stringify(got) ? 'ok' : (t + ' drew ' + JSON.stringify(got));
      })).filter(x => x !== 'ok')`);
    check(P('5'), `${pill}: every swatch's pixel matches the CRAM word in its own title`,
      agree.length === 0, agree.length ? JSON.stringify(agree.slice(0, 4)) : '45/45 agree');
  } else {
    check(P('5'), `${pill}: the gutter labels the four lines 0-3`,
      JSON.stringify(await c.json('window.__h.gutter()')) === JSON.stringify(['0', '1', '2', '3']),
      JSON.stringify(await c.json('window.__h.gutter()')));
  }

  // ---- line 0: the policy difference -------------------------------------
  await c.evalExpr('window.__h.click(0, 5)'); await sleep(350);
  const line0Sliders = await c.evalExpr('window.__h.sliderCount()');
  const line0Opacity = await c.evalExpr('window.__h.opacity(0, 5)');
  if (ENGINE === 'aeon') {
    check(P('6'), `${pill}: line 0 is LOCKED — dimmed, and a click opens nothing`,
      line0Sliders === 0 && line0Opacity === '0.35',
      `sliders=${line0Sliders} opacity=${line0Opacity} title=${JSON.stringify(await c.evalExpr('window.__h.title(0,5)'))}`);
    neg(P('6n'), 'line 1 is dimmed too', (await c.evalExpr('window.__h.opacity(1, 5)')) === '0.35');
  } else {
    check(P('6'), `${pill}: line 0 is EDITABLE — a click opens the sliders, nothing is dimmed`,
      line0Sliders === 3 && line0Opacity === '1',
      `sliders=${line0Sliders} opacity=${line0Opacity} heading=${JSON.stringify(await c.evalExpr('window.__h.heading()'))}`);
    neg(P('6n'), 'clicking line 0 opened FOUR sliders', line0Sliders === 4, `${line0Sliders}`);
  }

  // ---- index 0: the other policy difference ------------------------------
  await c.evalExpr('window.__h.click(1, 7)'); await sleep(300);   // open something first
  const openedBefore = await c.evalExpr('window.__h.sliderCount()');
  await c.evalExpr('window.__h.click(1, 0)'); await sleep(350);
  const afterIdx0 = await c.evalExpr('window.__h.sliderCount()');
  if (ENGINE === 'aeon') {
    // The outline is DECLARED 2px; the shell renders under a UI scale, so the
    // computed value is ~1.48px. What is checked is "an outline vs none", with
    // an unpicked swatch read in the same breath as the contrast.
    const outline = await c.evalExpr('window.__h.outlineW(1, 0)');
    const outlineOff = await c.evalExpr('window.__h.outlineW(3, 11)');
    check(P('7'), `${pill}: index 0 is CLICKABLE as the eraser — it takes the paint outline and opens no sliders`,
      afterIdx0 === 0 && parseFloat(outline) > 0 && parseFloat(outlineOff) === 0,
      `slidersBefore=${openedBefore} after=${afterIdx0} paintOutline=${outline} (unpicked swatch: ${outlineOff})`);
    check(P('8'), `${pill}: and there is no classic-style "not editable" note`,
      (await c.evalExpr('window.__h.noteText()')) === null, 'no note element');
    neg(P('7n'), 'a swatch nobody picked carries the paint outline',
      (await c.evalExpr('window.__h.outlineW(3, 11)')) === '2px');
  } else {
    const noteText = await c.evalExpr('window.__h.noteText()');
    check(P('7'), `${pill}: index 0 shows the "why there are no sliders" NOTE instead`,
      afterIdx0 === 0 && typeof noteText === 'string' && /index 0 is transparent/.test(noteText),
      `slidersBefore=${openedBefore} after=${afterIdx0} note=${JSON.stringify(noteText)}`);
    check(P('8'), `${pill}: the hint line is present`,
      typeof (await c.evalExpr('window.__h.hintText()')) === 'string',
      JSON.stringify(await c.evalExpr('window.__h.hintText()')));
    // Re-select an EDITABLE swatch and let React repaint before reading: the
    // note must go away with it. (Read without the wait this reported the
    // previous render's note and flagged the probe blind — a race in the check,
    // not in the panel.)
    await c.evalExpr('window.__h.click(1, 7)'); await sleep(400);
    neg(P('7n'), 'the note is still on screen with an editable swatch selected',
      (await c.evalExpr('window.__h.noteText()')) !== null,
      `sliders=${await c.evalExpr('window.__h.sliderCount()')}`);
  }

  // ---- an edit, and ONE Ctrl+Z -------------------------------------------
  const LINE = 1, IDX = 5;
  await c.evalExpr(`window.__h.click(${LINE}, ${IDX})`); await sleep(400);
  const sliders = await c.evalExpr('window.__h.sliderCount()');
  const heading = await c.evalExpr('window.__h.heading()');
  check(P('9'), `${pill}: clicking an editable swatch opens the three sliders under a heading`,
    sliders === 3 && typeof heading === 'string' && /Index 5/.test(heading),
    `sliders=${sliders} heading=${JSON.stringify(heading)}`);

  const before = await c.evalExpr(`window.__h.color(${LINE}, ${IDX})`);
  const r0 = Number(await c.evalExpr('window.__h.sliderValue(0)'));
  const targetR = (r0 + 3) % 8;
  await c.evalExpr(`window.__h.dragOnly(0, ${targetR})`); await sleep(300);
  const mid = await c.evalExpr(`window.__h.color(${LINE}, ${IDX})`);
  check(P('10'), `${pill}: dragging a slider changes the swatch live`,
    mid !== before, `${before} -> ${mid} (R ${r0} -> ${targetR})`);
  const untouched = await c.evalExpr(`window.__h.color(2, 9)`);
  await c.evalExpr('window.__h.release(0)'); await sleep(600);
  await c.evalExpr(HELPERS);
  const committed = await c.evalExpr(`window.__h.color(${LINE}, ${IDX})`);
  const undoOn = await c.evalExpr('window.__h.chipEnabled("Undo")');
  check(P('11'), `${pill}: releasing commits it and puts it on the undo stack`,
    committed === mid && undoOn === true, `word=${committed} undoEnabled=${undoOn}`);
  neg(P('11n'), 'a swatch nobody touched moved too',
    (await c.evalExpr('window.__h.color(2, 9)')) !== untouched, `${untouched}`);

  await shot(c, `${tag}-edited`);
  await ctrlZ(c); await sleep(700);
  await c.evalExpr(HELPERS);
  const undone = await c.evalExpr(`window.__h.color(${LINE}, ${IDX})`);
  check(P('12'), `${pill}: ONE Ctrl+Z takes the colour back`,
    undone === before, `${committed} --ctrl+z--> ${undone} (pre-drag ${before})`);
  neg(P('12n'), 'the undo also reverted a swatch that was never edited',
    (await c.evalExpr('window.__h.color(2, 9)')) !== untouched);
  return { before, committed };
}

// ---------------------------------------------------------------------------
async function runChecks(c) {
  await c.evalExpr(HELPERS);
  const pills = await c.json('window.__h.pills()');
  note('env', 'facet pills', JSON.stringify(pills));
  for (const p of ['Art', 'Palette']) {
    if (!pills.includes(p)) { check('env', `${p} facet reachable`, false, JSON.stringify(pills)); return; }
  }

  await checkMount(c, 'ART', 'Art');
  await checkMount(c, 'PAL', 'Palette');

  // ---- the interrupted drag ----------------------------------------------
  // A drag ended by the APP (a facet switch) rather than by the user. Chrome
  // fires no blur when a focused element is removed, so this is the path that
  // used to strand aeon's in-place preview with no undo entry and no dirty flag.
  await facet(c, 'Palette');
  const LINE = 2, IDX = 6;
  await c.evalExpr(`window.__h.click(${LINE}, ${IDX})`); await sleep(400);
  const pre = await c.evalExpr(`window.__h.color(${LINE}, ${IDX})`);
  const r0 = Number(await c.evalExpr('window.__h.sliderValue(0)'));
  await c.evalExpr(`window.__h.dragOnly(0, ${(r0 + 4) % 8})`); await sleep(300);
  const midDrag = await c.evalExpr(`window.__h.color(${LINE}, ${IDX})`);
  await facet(c, 'Art', 1600);                       // ← the panel is yanked away
  await facet(c, 'Palette', 1600);
  const after = await c.evalExpr(`window.__h.color(${LINE}, ${IDX})`);
  const undoOn = await c.evalExpr('window.__h.chipEnabled("Undo")');
  const kept = after === midDrag && after !== pre;
  const rolledBack = after === pre;
  check('X1', 'an interrupted drag strands NOTHING (either recorded, or rolled back)',
    (kept && undoOn === true) || rolledBack,
    kept ? `kept ${pre} -> ${after}, undoEnabled=${undoOn}` : rolledBack ? `rolled back to ${pre}` : `STRANDED at ${after} (pre ${pre}, undo ${undoOn})`);
  if (kept) {
    await ctrlZ(c); await sleep(700); await c.evalExpr(HELPERS);
    const back = await c.evalExpr(`window.__h.color(${LINE}, ${IDX})`);
    check('X2', 'and exactly ONE Ctrl+Z takes it back', back === pre, `${after} --ctrl+z--> ${back} (pre ${pre})`);
  } else {
    note('X2', 'no commit to undo', `classic previews locally: mid-drag ${midDrag}, after ${after}, pre ${pre}`);
    check('X2', 'the interrupted drag left the document exactly as it was',
      after === pre, `${pre} -> ${after}`);
  }

  if (ENGINE === 'classic') {
    // ---- Ctrl+Z after a palette edit hits the ZONE-ART document ----------
    // The claim is falsifiable without a layout edit: if the palette commit had
    // landed on the LAYOUT document, the Undo chip would be enabled on the
    // Layout facet (which resolves to that document) and disabled on Palette.
    await facet(c, 'Palette');
    await c.evalExpr('window.__h.click(3, 4)'); await sleep(350);
    const preU = await c.evalExpr('window.__h.color(3, 4)');
    const rv = Number(await c.evalExpr('window.__h.sliderValue(2)'));
    await c.evalExpr(`window.__h.dragOnly(2, ${(rv + 3) % 8})`); await sleep(250);
    await c.evalExpr('window.__h.release(2)'); await sleep(700);
    await c.evalExpr(HELPERS);
    const editedU = await c.evalExpr('window.__h.color(3, 4)');
    const undoOnPalette = await c.evalExpr('window.__h.chipEnabled("Undo")');
    await facet(c, 'Layout', 1600);
    const undoOnLayout = await c.evalExpr('window.__h.chipEnabled("Undo")');
    check('Z1', 'classic: a palette edit is undoable on the PALETTE/art document and invisible to the LAYOUT one',
      editedU !== preU && undoOnPalette === true && undoOnLayout === false,
      `edit ${preU} -> ${editedU} · Undo on Palette=${undoOnPalette}, on Layout=${undoOnLayout}`);
    neg('Z1n', 'the layout document has something to undo after only palette edits',
      undoOnLayout === true, `layout Undo enabled=${undoOnLayout}`);
    await facet(c, 'Palette', 1600);
    await ctrlZ(c); await sleep(700); await c.evalExpr(HELPERS);
    check('Z2', 'classic: that Ctrl+Z undoes the COLOUR',
      (await c.evalExpr('window.__h.color(3, 4)')) === preU,
      `${editedU} --ctrl+z--> ${await c.evalExpr('window.__h.color(3, 4)')}`);
  }

  if (ENGINE === 'aeon') {
    // ---- the grips and the copy menu, which stayed in PaletteEditor -------
    await facet(c, 'Art');
    const grips = await c.json('window.__h.gripInfo()');
    const okGrips = Array.isArray(grips) && grips.length === 4 && grips.every((g) => g && g.tag === 'DIV')
      && grips[0].draggable === 'false' && grips.slice(1).every((g) => g.draggable === 'true' && g.cursor === 'grab');
    check('D1', 'aeon: a drag grip per row, locked on line 0 and draggable on 1-3',
      okGrips, JSON.stringify(grips));
    neg('D1n', 'the locked line 0 grip is draggable', grips[0] && grips[0].draggable === 'true');

    // right-click a swatch → the copy menu
    await c.evalExpr('window.__h.rightClick(1, 5)'); await sleep(400);
    const items = await c.json('window.__h.menuItems()');
    const mHeading = await c.evalExpr('window.__h.menuHeading()');
    check('D2', 'aeon: right-clicking a swatch opens the "Copy to ▸" menu, with the locked line 0 absent',
      items.length > 0 && items.every((t) => !/^Zone line 0/.test(t)) && items.some((t) => /^Zone line [23] · idx 5/.test(t)),
      `heading=${JSON.stringify(mHeading)} items=${JSON.stringify(items)}`);
    neg('D2n', 'the menu offers the sprite-reserved line 0', items.some((t) => /^Zone line 0/.test(t)));

    // …and selecting an item performs the copy, on the undo stack.
    const srcColor = await c.evalExpr('window.__h.color(1, 5)');
    const dstBefore = await c.evalExpr('window.__h.color(2, 5)');
    if (srcColor !== dstBefore) {
      await c.evalExpr('window.__h.clickMenuItem("Zone line 2 · idx 5")'); await sleep(700);
      await c.evalExpr(HELPERS);
      const dstAfter = await c.evalExpr('window.__h.color(2, 5)');
      check('D3', 'aeon: the copy menu actually copies the colour', dstAfter === srcColor,
        `line2 idx5 ${dstBefore} -> ${dstAfter} (source ${srcColor})`);
      await ctrlZ(c); await sleep(600); await c.evalExpr(HELPERS);
      check('D4', 'aeon: and the copy is one undo step',
        (await c.evalExpr('window.__h.color(2, 5)')) === dstBefore,
        `${dstAfter} --ctrl+z--> ${await c.evalExpr('window.__h.color(2, 5)')}`);
    } else {
      note('D3', 'copy skipped', 'source and destination already the same colour');
    }
    await c.evalExpr('window.__h.closeMenu()'); await sleep(300);

    // …and the DnD path itself (React's delegated drag listeners; the payload
    // rides a module ref, so bare DragEvents carry it).
    await c.evalExpr(HELPERS);
    const s = await c.evalExpr('window.__h.color(1, 9)');
    const d0 = await c.evalExpr('window.__h.color(3, 9)');
    const dropped = await c.evalExpr('window.__h.dragSwatch(1, 9, 3, 9)'); await sleep(700);
    await c.evalExpr(HELPERS);
    const d1 = await c.evalExpr('window.__h.color(3, 9)');
    check('D5', 'aeon: dragging a swatch onto another copies it', s === d0 || d1 === s,
      `drag=${dropped} source ${s}, dest ${d0} -> ${d1}`);
    // The locked line must REFUSE a drop.
    const l0 = await c.evalExpr('window.__h.color(0, 9)');
    await c.evalExpr('window.__h.dragSwatch(1, 9, 0, 9)'); await sleep(600);
    await c.evalExpr(HELPERS);
    check('D6', 'aeon: the sprite-reserved line 0 refuses a drop',
      (await c.evalExpr('window.__h.color(0, 9)')) === l0, `line0 idx9 stayed ${l0}`);
    neg('D6n', 'line 0 accepted the drop', (await c.evalExpr('window.__h.color(0, 9)')) === s && s !== l0);
    await shot(c, 'dnd');
  }
  await shot(c, 'final');
}

// ---------------------------------------------------------------------------
async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} already serves a CDP target — a stale Electron is alive`);
  console.log(`ENGINE=${ENGINE} · port ${PORT} verified free`);
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
    await c.send('Page.enable').catch(() => {});
    for (let i = 0; i < 60; i++) {
      try { if (await c.evalExpr('typeof window.__dbg === "object"')) break; } catch { /* ctx swap */ }
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear(); 1');
    if (ENGINE === 'classic') {
      await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`);
      await sleep(1800);
      await c.evalExpr('window.__dbg.activate("ghz", 1)');
      await sleep(4500);
      const lvl = await c.evalExpr('window.__dbg.levelState()');
      if (lvl.status !== 'ready') throw new Error(`act not ready: ${JSON.stringify(lvl)}`);
      console.log(`classic act ready: ${JSON.stringify(lvl)}`);
    } else {
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
    }
    await runChecks(c);
  } finally {
    if (c) { try { c.close(); } catch { /* */ } }
    killGroup();
    await sleep(1000);
    console.log(`port free after teardown: ${await portFree()}`);
  }
  writeFileSync(`${SHOTS}/${ENGINE}-results.json`, JSON.stringify(results, null, 2));
  console.log(`\n=== ${ENGINE}: ${fails.length} FAIL, ${negFails.length} broken negatives ===`);
  if (fails.length) console.log('FAILED:\n  ' + fails.join('\n  '));
  if (negFails.length) console.log('!!! BLIND PROBES:\n  ' + negFails.join('\n  '));
  process.exit(fails.length || negFails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
