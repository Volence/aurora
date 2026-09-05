#!/usr/bin/env node
// DOES AN AUTHOR EVER LEARN THAT THE BACKGROUND STARTS OVER BEFORE THE ACT DOES?
//
// ═══ THE GAP THIS EXISTS BECAUSE OF (ROADMAP O21) ═══
//
// Plane B is 512 px on both axes and is blitted ONCE at level load; everything
// after that is scrolling. So a background repeats — horizontally that is the
// design, vertically it is a tear, and until this parcel NOTHING in Aurora said
// either thing anywhere. aeon measured the vertical seam on the running ROM
// (d-31, "camY 61 -> scroll -57 -> VDP row 455 ... confirmed by a
// background-only capture") and their own DEFERRED_WORK records that no build
// rule checks it.
//
// ═══ WHY THIS FILE AND NOT MORE VITEST ═══
//
// `bg-wrap.test.ts` proves the arithmetic. It cannot prove that a sentence
// reaches a human: the node suite sees no React, no DOM and no pixel. Every
// assertion below reads the LIVE panel.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. ⚠ THE TRAP THIS PARCEL IS SHAPED LIKE: **a correct implementation is
//    SILENT on every scene that ships, and so is a deleted one.** Both of
//    Aurora's scenes and 18 of aeon's 20 are `v_factor 15` (locked) and cannot
//    wrap. A harness that only looked at real scenes would go green over a
//    feature that had been ripped out. So every discriminating row here first
//    DROPS THE SPINNER OFF THE LOCK through the real control, and every one is
//    paired with a locked control that must be SILENT in the same session.
//
// 2. THE OPPOSITE FAILURE, WHICH WOULD BE WORSE THAN THE SILENCE IT REPLACED:
//    an advisory that fires on every act. Row [4b] sets the shift the arithmetic
//    says FITS and requires the sentence to go away again. A warning nobody can
//    turn off is a warning nobody reads.
//
// 3. A PROVIDER THAT RETURNS THE RIGHT STRING TO NOBODY. `textContent`,
//    `checkVisibility()` and `elementFromPoint` at the sentence's own centre —
//    a `display:none` hint still has text.
//
// 4. A HARNESS THAT AGREES WITH ITSELF. Every number required on screen is
//    derived HERE, from constants parsed out of committed source and from the
//    act's own grid read through `__dbg`, and never from the app's rendered
//    text. Reading the app's number back out of the app proves only that a
//    string round-tripped.
//
// 5. THE HORIZONTAL HALF, which is a TOOLTIP and not a row, and therefore
//    invisible to any check that only reads text nodes. Section 5 reads the
//    `title` ATTRIBUTE off the `fb` control.
//
// ═══ RUN ═══
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build   # __dbg exists ONLY here
//   npm run harness:bg-wrap
//
// It runs on its OWN Xvfb (`spawnGuarded` pins Ozone to x11 for exactly this
// reason) and never opens a window on the owner's session.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9411);
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
const SHOTS = `${ROOT}/scratchpad/shots-bg-wrap`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'bg_wrap_probe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── THE EXPECTED NUMBERS, DERIVED HERE, FROM SOURCE ────────────────────────
//
// Not one of them is typed. `PLANE_SPAN` is rebuilt from the vendored consumer
// contract and `bg-tiles.ts` — the same two authorities `PLANE_COLUMN_SPAN` and
// `PLANE_LINE_SPAN` are built from, reached independently — and the act's extent
// comes from its own grid, read live. If `bg-wrap.ts` started answering with a
// different arithmetic, these would disagree with it and the rows would fail.
function num(src, re, what) {
  const m = re.exec(src);
  if (!m) throw new Error(`CANNOT MEASURE: ${what} — the pattern no longer matches its source`);
  return Number(m[1]);
}
const CONTRACT = JSON.parse(
  readFileSync(`${ROOT}/src/core/formats/bg-override/bganim-consumer-contract.json`, 'utf8'));
const TILE_PX = CONTRACT.constants.TILE_WIDTH_PX.value;
const BG_WIDTH = num(readFileSync(`${ROOT}/src/core/formats/bg-tiles.ts`, 'utf8'),
  /export const BG_WIDTH = (\d+)/, 'BG_WIDTH');
const PLANE_SPAN = BG_WIDTH * TILE_PX;
const SECTION_PX = num(readFileSync(`${ROOT}/src/core/model/s4-types.ts`, 'utf8'),
  /export const SECTION_PIXEL_SIZE = (\d+)/, 'SECTION_PIXEL_SIZE');
const SCREEN_SRC = readFileSync(`${ROOT}/src/core/model/screen.ts`, 'utf8');
const SCREEN_H = num(SCREEN_SRC, /export const SCREEN_HEIGHT = (\d+)/, 'SCREEN_HEIGHT');
const SCREEN_W = num(SCREEN_SRC, /export const SCREEN_WIDTH = (\d+)/, 'SCREEN_WIDTH');
const LOCK = num(readFileSync(`${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8')
  .replace(/\s+/g, ' '), /"v_factor"\s*:\s*\{[^}]*?"maximum"\s*:\s*(\d+)/, 'v_factor maximum (the lock sentinel)');

/** The shift a scene is dropped to so it can wrap at all — the one aeon shipped OJZ on. */
const UNLOCKED_VF = 3;
/** The shift the advisory should recommend instead, for the act under test. */
const fittingVF = (travelY) => {
  for (let vf = UNLOCKED_VF + 1; vf < LOCK; vf++) if ((travelY >> vf) < PLANE_SPAN) return vf;
  return null;
};

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
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-bg-wrap/${name}.png`);
}

const SET_INPUT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

const V_FACTOR_INPUT = `[...document.querySelectorAll('input[type=number]')]`
  + `.find((e) => /^v_factor: /.test(e.title || ''))`;

/**
 * The advisory element, found by a phrase that is STRUCTURAL rather than
 * numeric, plus everything needed to insist it is really on screen.
 *
 * ⚠ LEAF-ONLY. `document.body.textContent` contains every phrase any descendant
 * renders, so a contains-check on an ancestor passes for a hint mounted inside a
 * `display:none` subtree.
 */
const WRAP_HINT = String.raw`
(() => {
  const want = 'starts over at camera Y';
  const leaf = [...document.querySelectorAll('*')].find((el) =>
    (el.textContent || '').includes(want)
    && ![...el.children].some((k) => (k.textContent || '').includes(want)));
  if (!leaf) return { found: false };
  leaf.scrollIntoView({ block: 'center' });
  const r = leaf.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  const vf = ${V_FACTOR_INPUT};
  const P = Node.DOCUMENT_POSITION_FOLLOWING;
  return {
    found: true,
    text: leaf.textContent || '',
    rects: leaf.getClientRects().length,
    visible: typeof leaf.checkVisibility === 'function'
      ? leaf.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
    inside: hit !== null && (hit === leaf || leaf.contains(hit)),
    hitText: hit ? (hit.textContent || '').slice(0, 60) : null,
    afterVFactor: vf ? (vf.compareDocumentPosition(leaf) & P) !== 0 : null,
  };
})()`;

/** The `fb` control's tooltip — the horizontal half lives in an ATTRIBUTE, not a text node. */
const FB_TITLES = String.raw`
[...document.querySelectorAll('select,input')]
  .map((e) => e.title || '')
  .filter((t) => /^Layer \d+ /.test(t) && /picture/.test(t))`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const screen = process.env.SCREEN ?? '1920x1080';
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', `-screen 0 ${screen}x24`, ELECTRON, MAIN],
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

    note('EXPECTATIONS DERIVED HERE, FROM COMMITTED SOURCE — nothing below is typed:',
      `BG_WIDTH ${BG_WIDTH} cells x TILE_WIDTH_PX ${TILE_PX} = PLANE_SPAN ${PLANE_SPAN} PLANE px\n        `
      + `SECTION_PIXEL_SIZE ${SECTION_PX} WORLD px; SCREEN ${SCREEN_W}x${SCREEN_H}\n        `
      + `v_factor lock sentinel ${LOCK} (schema maximum); probe shift ${UNLOCKED_VF}`);

    check('0a', 'ANTI-VACUOUS: the two spans this parcel rests on are 512 PLANE px, not 2048 WORLD px',
      PLANE_SPAN !== SECTION_PX && PLANE_SPAN === BG_WIDTH * TILE_PX,
      `PLANE_SPAN=${PLANE_SPAN}, SECTION_PIXEL_SIZE=${SECTION_PX} — the queue row compared these`);

    const haveScenes = await c.evalExpr('typeof window.__dbg.aeon.scenesJson === "function"');
    check('0b', 'ANTI-VACUOUS: the build under test has the scene probe at all',
      haveScenes === true, `${RUN.root}/dist`);
    if (!haveScenes) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon, and read the ACT rather than assuming it. ----------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    // LOUD ON UNMEASURABLE: every expectation below is a function of this grid.
    check('1b', 'the act reports a grid, so the expectations can be derived from it',
      typeof st.gridWidth === 'number' && typeof st.gridHeight === 'number',
      `gridWidth=${st.gridWidth} gridHeight=${st.gridHeight} — null here means the probe `
      + 'cannot see the act and NOTHING below measures anything');
    if (typeof st.gridHeight !== 'number') throw new Error('no act grid — cannot derive expectations');

    const travelY = st.gridHeight * SECTION_PX - SCREEN_H;
    const travelX = st.gridWidth * SECTION_PX - SCREEN_W;
    const ceiling = PLANE_SPAN << UNLOCKED_VF;
    const fitting = fittingVF(travelY);
    note('DERIVED FOR THIS ACT:',
      `grid ${st.gridWidth}x${st.gridHeight} -> extent ${st.gridWidth * SECTION_PX}x`
      + `${st.gridHeight * SECTION_PX} WORLD px -> camera travel ${travelX}x${travelY}\n        `
      + `at v_factor ${UNLOCKED_VF} the plane covers ${ceiling} px; the act travels ${travelY}\n        `
      + `-> ${travelY > ceiling ? 'IT WRAPS' : 'it fits'}; fitting shift = ${fitting}`);

    check('1c', 'ANTI-VACUOUS: this act is tall enough that v_factor 3 genuinely over-commits',
      travelY > ceiling,
      'if this act ever fits under the probe shift, every discriminating row below '
      + 'goes green on a deleted feature — pick a taller act rather than lowering the bar');

    // ---- 2. The Effects facet + a scene made through the real controls. ---
    await sleep(2500);
    check('2a', 'the facet bar offers an Effects pill',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1200);
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const probe = () => doc.find((s) => s.id === SCENE_ID) ?? null;
    check('2b', 'ANTI-VACUOUS: the probe scene exists and starts LOCKED, like every scene that ships',
      probe() !== null && probe().v_factor === LOCK,
      JSON.stringify(probe() && { id: probe().id, v_factor: probe().v_factor }));

    // ---- 3. THE PAIRED CONTROL: a locked plane says nothing. --------------
    let hint = await c.json(WRAP_HINT);
    check('3a', 'LOCKED CONTROL: no wrap advisory on a locked scene — the state every scene ships in',
      hint.found === false,
      'this is also what a DELETED feature looks like, which is why [4a] exists');
    await shot(c, 'locked-silent');

    // ---- 4. THE DISCRIMINATING ROWS: drop the spinner off the lock. -------
    check('4-setup', 'the V factor spinner is reachable and takes the shift',
      (await c.evalExpr(SET_INPUT(V_FACTOR_INPUT, UNLOCKED_VF))) === 'ok');
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('4-armed', 'ANTI-VACUOUS: the document really carries the unlocked shift now',
      probe() !== null && probe().v_factor === UNLOCKED_VF,
      `v_factor=${probe() && probe().v_factor}`);

    hint = await c.json(WRAP_HINT);
    check('4a', 'the wrap advisory APPEARS when the plane is dropped off the lock on a tall act',
      hint.found === true, hint.found ? hint.text.slice(0, 160) : 'nothing on screen says the background repeats');
    check('4b', 'it is really painted — boxes, checkVisibility, and a hit test at its own centre',
      hint.found === true && hint.rects > 0 && hint.visible === true && hint.inside === true,
      JSON.stringify({ rects: hint.rects, visible: hint.visible, inside: hint.inside, hitText: hint.hitText }));
    check('4c', 'it sits under the control that caused it, not in a corner',
      hint.afterVFactor === true, `afterVFactor=${hint.afterVFactor}`);

    // The numbers, each DERIVED ABOVE and required on screen. A wrong axis
    // anywhere in the chain lands a different number here.
    const wants = [
      [`the plane span (${PLANE_SPAN}px)`, `${PLANE_SPAN}px plane`],
      [`the ceiling at this shift (${ceiling}px)`, `${ceiling}px of camera travel`],
      [`this act's camera travel (${travelY}px)`, `travels ${travelY}px`],
      [`the seam's camera Y (${ceiling})`, `starts over at camera Y ${ceiling}`],
      [`the act shown past the seam (${travelY - ceiling}px)`, `last ${travelY - ceiling}px`],
      [`the remedy shift (${fitting})`, `v_factor to ${fitting}`],
    ];
    for (const [what, phrase] of wants) {
      check(`4d:${phrase.slice(0, 16)}`, `the sentence carries ${what}`,
        hint.found === true && hint.text.includes(phrase), `looked for "${phrase}"`);
    }
    check('4e', 'AND IT IS NOT THE SECTION SIZE — the number the queue row carried is absent',
      hint.found === true && !hint.text.includes(`${SECTION_PX}px`),
      `${SECTION_PX} is SECTION_PIXEL_SIZE, a WORLD-px foreground extent, and appears in no `
      + 'correct statement about where the plane wraps');
    await shot(c, 'unlocked-advisory');

    // ---- 4f. NOT A CLAMP. -------------------------------------------------
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('4f', 'ADVISORY, NEVER PREVENTION: the document still holds the shift it warned about',
      probe() !== null && probe().v_factor === UNLOCKED_VF,
      `v_factor=${probe() && probe().v_factor} — a rewrite here would be row 58 broken`);

    // ---- 4g. THE OPPOSITE FAILURE: does it ever shut up? ------------------
    check('4g-setup', 'the spinner takes the remedy the sentence recommended',
      (await c.evalExpr(SET_INPUT(V_FACTOR_INPUT, fitting))) === 'ok');
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    check('4g-armed', 'ANTI-VACUOUS: the document carries the remedy shift, still UNLOCKED',
      probe() !== null && probe().v_factor === fitting && fitting !== LOCK,
      `v_factor=${probe() && probe().v_factor}, lock=${LOCK}`);
    hint = await c.json(WRAP_HINT);
    check('4h', 'IT DOES NOT FIRE ON EVERY ACT: taking the remedy silences it, on a still-unlocked plane',
      hint.found === false,
      hint.found ? `still on screen: ${hint.text.slice(0, 120)}` : 'silent, as it must be');
    await shot(c, 'remedy-silent');

    // ---- 5. THE HORIZONTAL HALF, which is an ATTRIBUTE. -------------------
    const titles = await c.json(FB_TITLES);
    check('5a', 'every layer\'s fb control carries its repeat readout in its tooltip',
      Array.isArray(titles) && titles.length > 0,
      `${Array.isArray(titles) ? titles.length : 0} title(s); a new scene has one layer`);
    check('5b', 'the readout names the plane span and this act\'s HORIZONTAL travel',
      titles.some((t) => t.includes(`${PLANE_SPAN}px picture`) && t.includes(`${travelX}px`)),
      JSON.stringify(titles.slice(0, 2)));
    check('5c', 'it is a TOOLTIP and not a row — the same sentence is in no text node',
      (await c.evalExpr(String.raw`!document.body.textContent.includes('px picture')`)) === true,
      'horizontal repetition is the design; a visible line per layer per scene would be '
      + 'the panel-height defect O15 spent a parcel removing');

    // ---- 6. Leave the fixture as found. -----------------------------------
    for (let i = 0; i < 40; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await c.evalExpr('window.__dbg.aeon.undo && window.__dbg.aeon.undo()').catch(() => {});
      await sleep(60);
    }
    note('fixture left to the app\'s own undo stack; the probe scene is not written to disk '
      + 'unless the app was told to save, and this run never asks it to.');
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket */ }
    // O66: AWAITED. A dropped promise here reached the ordered grace only on
    // the green path (nothing exits, the event loop drains over it); on the red
    // path `process.exit(1)` below ran first and the exit net SIGKILLed the app
    // — the shape that left Chromium SIGTRAP cores (O65). Rule G5 in
    // check-harness-guards.mjs holds this line.
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); process.exit(1); }
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
