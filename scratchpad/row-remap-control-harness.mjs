#!/usr/bin/env node
// DOES THE ROW-REMAP ROW EXPORT A SHIFT, REFUSE A BAD PLANE LINE, AND SAY WHAT
// WILL NOT BUILD — ON SCREEN? (EW-9-ROWREMAP-CONTROL.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// `test/formats/effects-row-remap.test.ts` proves the codec round-trips the key,
// that `rowRemapWithHeightShift` writes the shift, that `rowRemapPlaneYRefusal`
// refuses past 511, and that `rowRemapPreconditions` reports the three
// conditions. It cannot prove any of this:
//
//        AN AUTHOR TURNS A STRIP'S `Row remap` ROW ON, PICKS THE OPTION THAT
//        READS "64 lines", AND THE DOCUMENT HOLDS `"height_shift": 6` — NOT 64
//        — WHILE A SENTENCE UNDER THAT ROW SAYS IT WILL NOT BUILD YET, AND THE
//        SENTENCE IS WHERE THE AUTHOR WOULD READ IT.
//
// and it cannot on principle, three times over:
//
//   1. THE UNIT IS A SEAM. The suite calls `rowRemapWithHeightShift` directly.
//      That the PICKER calls it with `o.shift` rather than with the LINE COUNT
//      it is labelled by is a property of the wiring, and only the running app
//      has it. Every value 3..7 is legal, so the wrong wiring produces a band
//      FOUR TIMES TOO TALL with a green build and no refusal anywhere.
//      (docs/superpowers/.../seam-has-no-author.)
//   2. THE PLANE-LINE REFUSAL IS A WIRING FACT. `refuse` on `NumberField` is
//      what withholds the commit; `min`/`max` on an `<input type="number">` look
//      identical in source and stop no typed value. And this bound is the ONLY
//      enforcement of `plane_y`'s ceiling anywhere in the pipeline — aeon's own
//      ensure tests `>= 0` alone — so a source-level assertion about it is the
//      shape of the bug, not a check on it.
//   3. A WARNING THAT IS NOT PAINTED IS NOT A WARNING. The three `scene()`
//      preconditions are the whole point of the parcel: they are refused by
//      aeon's GENERATOR, so an author who does not read them here reads them in
//      a build log. "The function returns a string" is not that.
//
// So every row below drives the REAL controls and reads the MODEL back
// (`window.__dbg.aeon.scenesJson()`), never the widget, except where the widget
// is explicitly the "the gesture landed" witness.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE GESTURE NEVER LANDED, so "the document did not change" is true because
//     nothing happened. Row [5c] types a LEGAL plane line through the same path
//     and requires the model to MOVE — the anti-vacuous floor for [5a]. Row [4a]
//     requires the model to move too, and to a specific value.
//
//   • THE SCENE WAS ALREADY REMAPPED. Row [2a] reads every layer out of the
//     model BEFORE anything is touched and requires NONE to carry a remap;
//     aeon's shipped `ojz_act1_depth.json` carries none, and the row prints what
//     it read so contamination is visible rather than silent.
//
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. ⚠ MEASURED IN THIS REPO:
//     `checkVisibility()` → true and `getClientRects().length` → 1 on an element
//     sitting 2,635px OUTSIDE its scroller. So every paint row compares the
//     leaf's RECT AGAINST THE SCROLLER'S OWN BOX and requires a strict
//     `elementFromPoint`; the trio is printed as evidence and is never the gate.
//
//   • A DIFFERENT CONTROL WAS DRIVEN. The select, the box and the picker are
//     found by their `title`s, which are built from `LAYER_ROW_REMAP_ROW` — not
//     "the Nth select in the column", which moves as sections expand.
//
//   • THE HARNESS AGREED WITH THE APP BY CONSTRUCTION. Every bound, the
//     shift/line relation and the reserved names are re-derived IN THIS PROCESS
//     from the VENDORED SCHEMA JSON, never imported from the module under test.
//
//   • THE WARNING FIRED FOR EVERY STRIP. Row [6c] is a DISCRIMINATING PAIR: the
//     "nothing to vary" sentence must appear on the strip that has no curve and
//     must NOT appear on the strip that has one, in the same read.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER — and nothing here
// claims a band visibly compresses on screen: that needs the built ROM, and
// aeon's generator half (9b) does not exist yet, so no ROM can be built through
// this path at all. That is the foreground lane's to take.
//
// CLEANUP IS BY PID — `spawnGuarded` + `killTree`, awaited.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:row-remap-control
//
//   ⚠ FRESH COPY PER RUN. This harness AUTHORS a remap into a scene and never
//   saves, so nothing reaches disk — but row [2a]'s floor describes aeon's
//   shipped file, and a copy another harness has saved into is not that fixture.
//
//   PLANT=lines-not-shift … row [4a] reads the option's LINE COUNT as if it had
//                           been written, the exact defect this file exists to
//                           catch. [4a] must FAIL.
//   PLANT=widget          … row [5a] reads the plane box's own value instead of
//                           the model, the vacuous shape. [5a] must FAIL.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9473);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 97);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-row-remap-control`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';
const SCENE_ID = process.env.SCENE_ID ?? 'ojz_act1_depth';

// ---------------------------------------------------------------------------
// THE CONTRACT, RE-DERIVED IN THIS PROCESS FROM THE VENDORED BYTES
// ---------------------------------------------------------------------------
//
// NOT imported from `scene-ui.ts`. The properties under test are "the app
// exports the SHIFT" and "the app holds the contract's plane-line ceiling";
// asking the module under test what the shift and the ceiling are would make
// every row agree with the app by construction.
const SCHEMA = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
const RR_NODE = SCHEMA.$defs.layer.properties.rowRemap;
const RR_PAYLOAD = RR_NODE.oneOf.find((b) => b.properties?.plane_y).properties;
const PLANE_Y = RR_PAYLOAD.plane_y;
const HEIGHT = RR_PAYLOAD.height_shift;
const SHIFTS = [];
for (let s = HEIGHT.minimum; s <= HEIGHT.maximum; s++) SHIFTS.push(s);
/** `H = 1 << shift`, spelled here rather than imported — the whole hazard. */
const linesFor = (shift) => 1 << shift;
/** The reserved names, found by the `{"not": {}}` idiom, not listed. */
const RESERVED = Object.keys(RR_PAYLOAD).filter(
  (k) => RR_PAYLOAD[k] && typeof RR_PAYLOAD[k].not === 'object'
    && RR_PAYLOAD[k].not !== null && Object.keys(RR_PAYLOAD[k].not).length === 0);
/** The one shift the contract says builds today, or null once 9b lands. */
const BUILDABLE = (() => {
  const m = /TODAY ONLY (\d+) BUILDS/.exec(String(HEIGHT.description));
  return m ? Number(m[1]) : null;
})();
/** A shift that is legal and does NOT build — the one row [4a] picks. */
const UNBUILDABLE = SHIFTS.find((s) => s !== BUILDABLE);

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
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const OPEN_SECTION = (re, proofSelector) => String.raw`
(() => {
  const open = () => !!(${proofSelector});
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${re}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) {
    const seen = [...document.querySelectorAll('div')]
      .filter((d) => d.style && d.style.cursor === 'pointer')
      .map((d) => (d.textContent || '').trim().slice(0, 48));
    return 'no-header: ' + JSON.stringify(seen);
  }
  hdr.click();
  return 'clicked';
})()`;

/** The remap on/off `<select>` for one strip, by the row's own title. */
const RR_SELECT = (layer) => String.raw`
(() => [...document.querySelectorAll('select')]
  .find((s) => (s.title || '').startsWith('Layer ' + ${layer} + ' rowRemap: ')) || null)()`;

/** The plane-line box for one strip. */
const RR_BOX = (layer) => String.raw`
(() => [...document.querySelectorAll('input[type="number"]')]
  .find((i) => (i.title || '').startsWith('Layer ' + ${layer} + ' rowRemap.plane_y')) || null)()`;

/** The height picker for one strip. */
const RR_HEIGHT = (layer) => String.raw`
(() => [...document.querySelectorAll('select')]
  .find((s) => (s.title || '').startsWith('Layer ' + ${layer} + ' rowRemap.height_shift')) || null)()`;

/**
 * The leaf carrying `needle`, MEASURED AGAINST ITS SCROLLER.
 *
 * `insideScroller` and `hitInside` are the gate. `visible` and `rects` are
 * recorded because they are the two that do NOT discriminate — both go green on
 * an element scrolled thousands of pixels out of its own scroller.
 */
const PAINTED_LEAF = (needle, afterSelector) => String.raw`
(() => {
  const anchor = ${afterSelector};
  // 'div,span', NOT 'div'. MEASURED: the precondition sentences are wrapped in a
  // <span> (the testid Hint drops), so the Hint <div> HAS a child carrying the
  // needle and the leaf rule excluded it while the sentence was plainly on
  // screen — a paint row that goes red for a reason that is not about paint.
  const leaves = [...document.querySelectorAll('div,span')]
    .filter((d) => (d.innerText || '').includes(${JSON.stringify(needle)})
                && ![...d.children].some((k) => (k.innerText || '').includes(${JSON.stringify(needle)})));
  const leaf = leaves[0] || null;
  if (!leaf) return { leaf: false, candidates: leaves.length };
  leaf.scrollIntoView({ block: 'center' });
  let sc = leaf.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const b = leaf.getBoundingClientRect();
  const cb = sc ? sc.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    leaf: true, text: (leaf.innerText || '').trim(),
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
    scroller: cb ? { top: Math.round(cb.top), bottom: Math.round(cb.bottom) } : null,
    insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
    hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
    afterControl: anchor ? (anchor.compareDocumentPosition(leaf) & 4) === 4 : null,
    visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
    rects: leaf.getClientRects().length,
  };
})()`;

/** How many precondition hints one strip's card is painting, with their text. */
const PRECONDITIONS = (layer) => String.raw`
(() => {
  const nodes = [...document.querySelectorAll(
    '[data-testid="layer-' + ${layer} + '-rowremap-precondition"]')];
  return nodes.map((n) => (n.innerText || '').trim());
})()`;

async function main() {
  const t0 = Date.now();
  console.log('=== row-remap-control harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log(`    contract    : plane_y ${PLANE_Y.minimum}..${PLANE_Y.maximum}; `
    + `height_shift ${HEIGHT.minimum}..${HEIGHT.maximum} = `
    + `${SHIFTS.map((s) => `${s}→${linesFor(s)}ln`).join(' ')}; `
    + `reserved ${JSON.stringify(RESERVED)}; builds today: ${BUILDABLE}`
    + ' — ALL READ FROM THE VENDORED SCHEMA IN THIS PROCESS');
  if (UNBUILDABLE === undefined) {
    throw new Error('the contract names no legal-but-unbuildable shift — row [4a] cannot run');
  }

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
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
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', true);

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    const clickAt = async (selector) => {
      await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0');
      const p = await c.json(String.raw`(() => {
        const el = ${selector};
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
      })()`);
      if (!p) return false;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent',
          { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      return p;
    };
    const typeText = async (s) => {
      for (const ch of s) {
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    };
    const setSelect = async (selector, value) => c.evalExpr(String.raw`(() => {
      const el = ${selector};
      if (!el) return false;
      el.value = ${JSON.stringify(String(value))};
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value;
    })()`);
    const scene = async () => {
      const scenes = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
      return scenes.find((s) => s.id === SCENE_ID) ?? null;
    };
    const layerN = async (n) => (await scene())?.layers?.[n] ?? null;
    const boxText = async (n) => c.json(String.raw`(() => {
      const el = ${RR_BOX(n)};
      return el ? { shown: el.value } : { shown: null };
    })()`);

    // ---- 1. THE SUBJECT --------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open', !!(st && st.open), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);

    const scenes = await c.json('window.__dbg.aeon.scenes()');
    check('1b', `aeon's own ${SCENE_ID}.json is loaded — a real scene to author into`,
      scenes.some((s) => s.id === SCENE_ID),
      `${scenes.length} scene(s): ${JSON.stringify(scenes)}`);
    if (!scenes.some((s) => s.id === SCENE_ID)) {
      throw new Error(`${SCENE_ID} absent — every row below would be vacuous`);
    }
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);

    check('1c', 'the Effects facet mounts',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1400);
    const opened = await c.evalExpr(OPEN_SECTION(String.raw`/^Layers \(/`, RR_SELECT(0)));
    await sleep(900);

    // WHICH STRIPS. One that already has a CURVE (so "nothing to vary" is
    // satisfied and does not mask the anchor sentence) and one that has none
    // (so [6c] is a discriminating pair). Chosen FROM THE DOCUMENT, not typed.
    const doc0 = await scene();
    const CURVED = doc0.layers.findIndex((l) => l.curve !== undefined && l.curve !== 'none');
    const PLAIN = doc0.layers.findIndex((l) => l.curve === undefined || l.curve === 'none');
    check('1d', 'the scene offers one strip WITH a curve and one WITHOUT — the pair [6c] needs',
      CURVED >= 0 && PLAIN >= 0 && CURVED !== PLAIN,
      `curved strip = ${CURVED}, plain strip = ${PLAIN}; `
      + `curves = ${JSON.stringify(doc0.layers.map((l) => l.curve ?? null))}`);
    if (CURVED < 0 || PLAIN < 0) throw new Error('no such pair in this scene');

    // ---- 2. THE ROW EXISTS AND NOTHING IS REMAPPED YET --------------------
    check('2a', 'ANTI-VACUOUS: NO strip carries a rowRemap before anything is touched',
      doc0.layers.every((l) => l.rowRemap === undefined || l.rowRemap === 'none'),
      `rowRemap per strip = ${JSON.stringify(doc0.layers.map((l) => l.rowRemap ?? null))}`);
    check('2a2', 'and the scene declares NO anchor — so the anchor precondition is live here',
      doc0.anchor === undefined || doc0.anchor === 'none',
      `anchor = ${JSON.stringify(doc0.anchor ?? null)}, `
      + `deform_bg = ${JSON.stringify(doc0.deform_bg ?? null)}`);

    const sel = await c.json(String.raw`(() => {
      const el = ${RR_SELECT(CURVED)};
      if (!el) return { found: false,
        titles: [...document.querySelectorAll('select')].map((s) => (s.title || '').slice(0, 44)) };
      el.scrollIntoView({ block: 'center' });
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      const b = el.getBoundingClientRect();
      const cb = sc ? sc.getBoundingClientRect() : null;
      const hit = document.elementFromPoint(
        Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return {
        found: true, value: el.value,
        options: [...el.options].map((o) => o.value + '=' + o.text),
        title: (el.title || '').slice(0, 140),
        insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
        hitIsSelect: hit === el,
        visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
        rects: el.getClientRects().length,
      };
    })()`);
    check('2b', 'the ROW REMAP row is on the layer card, painted inside its scroller, hit-testable',
      sel.found === true && sel.insideScroller === true && sel.hitIsSelect === true
      && sel.value === 'none' && sel.options.length === 2,
      JSON.stringify(sel) + (sel.found ? '' : ` (Layers section → ${opened})`));
    if (sel.found !== true) throw new Error('the row-remap select was not found');

    check('2c', 'no plane box and no height picker while the row says none',
      (await c.json(`!!${RR_BOX(CURVED)}`)) === false
      && (await c.json(`!!${RR_HEIGHT(CURVED)}`)) === false);

    check('2d', `neither reserved name (${RESERVED.join(', ')}) is offered anywhere on the card`,
      (await c.json(String.raw`(() => {
        const titles = [...document.querySelectorAll('select,input')]
          .map((e) => (e.title || ''));
        return ${JSON.stringify(RESERVED)}
          .filter((k) => titles.some((t) => t.includes('rowRemap.' + k)));
      })()`)).length === 0);

    // ---- 3. TURNING IT ON SEEDS A LEGAL PAYLOAD ---------------------------
    await setSelect(RR_SELECT(CURVED), 'ladder');
    await sleep(800);
    const seeded = (await layerN(CURVED))?.rowRemap;
    check('3a', 'switching the row on writes a payload legal on BOTH fields',
      seeded && Number.isInteger(seeded.plane_y) && Number.isInteger(seeded.height_shift)
      && seeded.plane_y >= PLANE_Y.minimum && seeded.plane_y <= PLANE_Y.maximum
      && seeded.height_shift >= HEIGHT.minimum && seeded.height_shift <= HEIGHT.maximum,
      `strip ${CURVED} rowRemap = ${JSON.stringify(seeded)}; contract plane_y `
      + `${PLANE_Y.minimum}..${PLANE_Y.maximum}, height_shift `
      + `${HEIGHT.minimum}..${HEIGHT.maximum}`);
    check('3a2', 'and the seed is the shift that BUILDS — a new remap is never born unbuildable',
      BUILDABLE === null || seeded?.height_shift === BUILDABLE,
      `seeded shift ${seeded?.height_shift}; contract says ${BUILDABLE} builds today`);

    const picker = await c.json(String.raw`(() => {
      const el = ${RR_HEIGHT(CURVED)};
      if (!el) return { found: false };
      return { found: true, value: el.value,
        options: [...el.options].map((o) => ({ value: o.value, text: o.text })) };
    })()`);
    console.log('        the height picker as an author sees it:\n'
      + (picker.options ?? []).map((o) => `          ${o.value}  ${o.text}`).join('\n'));
    check('3b', 'the picker offers EVERY legal shift, labelled in LINES, valued by SHIFT',
      picker.found === true
      && picker.options.map((o) => Number(o.value)).join(',') === SHIFTS.join(',')
      && SHIFTS.every((s) => picker.options
        .find((o) => Number(o.value) === s).text.includes(String(linesFor(s)))),
      JSON.stringify(picker));
    check('3b2', 'and exactly one option is marked as the one that builds today',
      BUILDABLE === null
        ? picker.options.every((o) => !/builds/.test(o.text))
        : picker.options.filter((o) => /builds/.test(o.text)).length === 1
          && /builds/.test(picker.options.find((o) => Number(o.value) === BUILDABLE).text),
      JSON.stringify((picker.options ?? []).map((o) => o.text)));

    // ---- 4. THE UNIT — THE WHOLE PARCEL ----------------------------------
    //
    // Pick the option that READS as a line count and require the document to
    // hold the SHIFT. A wiring that wrote `o.lines` would be schema-legal for
    // nothing (a line count is outside 3..7) — but a wiring that wrote the
    // label's number for a picker labelled differently, or that wrote the
    // OPTION INDEX, lands a legal shift that is not the one picked. Both are
    // caught by asserting the exact value.
    const wantLines = linesFor(UNBUILDABLE);
    await setSelect(RR_HEIGHT(CURVED), UNBUILDABLE);
    await sleep(800);
    const afterPick = PLANT === 'lines-not-shift'
      ? { height_shift: wantLines }
      : (await layerN(CURVED))?.rowRemap;
    check('4a', `picking the "${wantLines} lines" option writes the SHIFT ${UNBUILDABLE}, not `
      + `${wantLines}`,
      afterPick?.height_shift === UNBUILDABLE,
      `document holds ${JSON.stringify(afterPick)}. A picker that exported the LINE COUNT `
      + `would hold ${wantLines}; every value ${HEIGHT.minimum}..${HEIGHT.maximum} is legal, `
      + 'so the wrong wiring is a band four times too tall WITH A GREEN BUILD');

    const notBuilt = await c.json(PAINTED_LEAF('does NOT BUILD', RR_HEIGHT(CURVED)));
    check('4b', 'and a PAINTED sentence says that shift does not build yet, and names what does',
      BUILDABLE === null
        ? notBuilt.leaf === false
        : notBuilt.leaf === true && notBuilt.insideScroller === true
          && notBuilt.hitInside === true && notBuilt.afterControl === true
          && notBuilt.text.includes(String(linesFor(BUILDABLE))),
      JSON.stringify(notBuilt));

    await setSelect(RR_HEIGHT(CURVED), BUILDABLE ?? SHIFTS[0]);
    await sleep(700);
    const cleared = await c.json(PAINTED_LEAF('does NOT BUILD', RR_HEIGHT(CURVED)));
    check('4c', 'and it CLEARS when the buildable shift is picked back',
      cleared.leaf === false, JSON.stringify(cleared));

    // ---- 5. THE PLANE LINE, WHOSE CEILING NOTHING ELSE ENFORCES -----------
    const held = (await layerN(CURVED))?.rowRemap?.plane_y;
    const over = String(PLANE_Y.maximum + 1);
    await clickAt(RR_BOX(CURVED));
    await sleep(250);
    await typeText(over);
    await sleep(800);
    const overBox = await boxText(CURVED);
    const afterOver = PLANT === 'widget'
      ? { plane_y: Number(overBox.shown) }
      : (await layerN(CURVED))?.rowRemap;
    // ⚠ WHAT THIS ROW ASSERTS, AND WHY IT IS NOT "the document is unchanged".
    // `NumberField` commits ON EVERY KEYSTROKE, so typing a three-digit number
    // walks the document through its PREFIXES: "5" and "51" are both legal
    // plane lines and both commit, and only "512" is withheld. MEASURED HERE on
    // the first run of this file — the document held 51. That is a real (and
    // PRE-EXISTING, shared with the drift and ramp boxes) wart, printed below
    // and booked, not swept up: it leaves the box SHOWING 512 while the document
    // holds 51.
    //
    // The property this row exists for is narrower and is the one that reaches
    // a ROM: THE OUT-OF-RANGE VALUE NEVER LANDS. That is what is gated. Writing
    // the row as "unchanged" would have been asserting something false about a
    // control that is behaving correctly on the axis that matters.
    const prefixCommitted = afterOver?.plane_y !== held;
    check('5a', `typing ${over} (one past the plane's last line) never REACHES the document`,
      overBox.shown === over
      && afterOver?.plane_y !== Number(over)
      && afterOver?.plane_y >= PLANE_Y.minimum && afterOver?.plane_y <= PLANE_Y.maximum,
      `box shows ${JSON.stringify(overBox.shown)} (the keys LANDED); document holds `
      + `${JSON.stringify(afterOver)} — never ${over}. aeon would NOT catch ${over}: its `
      + `ensure tests >= 0 only.`
      + (prefixCommitted
        ? `\n        ⚠ PREFIX COMMIT (pre-existing NumberField behaviour, not this row's `
          + `subject): the document moved ${held} -> ${afterOver?.plane_y} on the way, because `
          + `every prefix of "${over}" is itself a legal plane line and the field commits per `
          + 'keystroke. The box and the document now DISAGREE until the next commit.'
        : ''));

    const overWhy = await c.json(PAINTED_LEAF('ONLY ENFORCEMENT', RR_BOX(CURVED)));
    check('5b', 'and the PAINTED reason says this bound is the only one in the pipeline',
      overWhy.leaf === true && overWhy.insideScroller === true && overWhy.hitInside === true
      && overWhy.afterControl === true
      && overWhy.text.includes(String(PLANE_Y.maximum)),
      JSON.stringify(overWhy));

    // ANTI-VACUOUS FLOOR: without this every refusal row above is satisfied by
    // a box that accepts nothing at all.
    const legalY = Math.min(PLANE_Y.maximum, 200);
    await clickAt(RR_BOX(CURVED));
    await sleep(250);
    await typeText(String(legalY));
    await sleep(800);
    const afterLegal = (await layerN(CURVED))?.rowRemap;
    check('5c', 'ANTI-VACUOUS FLOOR: a LEGAL plane line typed the same way DOES reach the document',
      afterLegal?.plane_y === legalY,
      `typed ${legalY} → ${JSON.stringify(afterLegal)}; was ${held}. This also measures `
      + 'SELECT-ON-FOCUS: without it the digits would append to what the box held');

    // ---- 6. THE THREE PRECONDITIONS, ON SCREEN ---------------------------
    const anchorWhy = await c.json(PAINTED_LEAF('declares no anchor', RR_SELECT(CURVED)));
    check('6a', 'the NO-ANCHOR precondition is painted under the row, in the contract\'s words',
      anchorWhy.leaf === true && anchorWhy.insideScroller === true
      && anchorWhy.hitInside === true && anchorWhy.afterControl === true
      && anchorWhy.text.includes('MUST declare anchor'),
      JSON.stringify(anchorWhy));

    // Turn a SECOND strip on: both cards must now say so, and each must name the
    // OTHER strip's index rather than its own.
    await setSelect(RR_SELECT(PLAIN), 'ladder');
    await sleep(900);
    const onCurved = await c.json(PRECONDITIONS(CURVED));
    const onPlain = await c.json(PRECONDITIONS(PLAIN));
    console.log(`        strip ${CURVED} says:\n${onCurved.map((t) => '          ' + t).join('\n')}`);
    console.log(`        strip ${PLAIN} says:\n${onPlain.map((t) => '          ' + t).join('\n')}`);
    check('6b', 'a SECOND remapped strip is reported on BOTH cards, each naming the other',
      onCurved.some((t) => /at most ONE layer/.test(t) && t.includes(String(PLAIN)))
      && onPlain.some((t) => /at most ONE layer/.test(t) && t.includes(String(CURVED))),
      JSON.stringify({ onCurved, onPlain }));

    // THE DISCRIMINATING PAIR. "Nothing to vary" must appear on the strip with
    // no curve and must NOT appear on the strip that has one — read together, so
    // a warning that fired for every strip cannot pass.
    check('6c', 'NOTHING-TO-VARY appears on the strip with no curve and NOT on the one with a '
      + 'curve — read in the same pass',
      onPlain.some((t) => /nothing for the remap to vary/.test(t))
      && !onCurved.some((t) => /nothing for the remap to vary/.test(t)),
      JSON.stringify({ plain: onPlain.length, curved: onCurved.length }));

    const capNote = await c.json(PAINTED_LEAF('CAP_ROW_REMAP', RR_SELECT(CURVED)));
    check('6d', 'and the ONE condition Aurora cannot check is named rather than left silent',
      capNote.leaf === true && capNote.insideScroller === true && capNote.hitInside === true,
      JSON.stringify(capNote));

    // ---- 7. BACK TO NONE CLEARS THE KEY ----------------------------------
    await setSelect(RR_SELECT(PLAIN), 'none');
    await sleep(700);
    const off = await layerN(PLAIN);
    check('7a', 'switching back to none CLEARS the key — absent, never a written "none"',
      off !== null && off.rowRemap === undefined,
      `strip ${PLAIN} = ${JSON.stringify(off)}`);
    check('7b', 'and its plane box and height picker go away with it',
      (await c.json(`!!${RR_BOX(PLAIN)}`)) === false
      && (await c.json(`!!${RR_HEIGHT(PLAIN)}`)) === false);

    // A shot with the row ON, an unbuildable shift picked and the preconditions
    // painted — what the owner has not seen.
    await setSelect(RR_HEIGHT(CURVED), UNBUILDABLE);
    await sleep(800);
    const framed = await c.json(String.raw`(() => {
      const el = ${RR_SELECT(CURVED)};
      if (!el) return null;
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      if (!sc) return { scrolled: false };
      const b = el.getBoundingClientRect(), cb = sc.getBoundingClientRect();
      sc.scrollTop += (b.top - cb.top) - 8;
      return { scrolled: true, scrollTop: Math.round(sc.scrollTop),
               scrollerHeight: Math.round(sc.clientHeight) };
    })()`);
    await sleep(400);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/row-remap-control.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/row-remap-control.png  (${JSON.stringify(framed)})`);
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n════ ${pass}/${results.length} rows · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  if (fails.length) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  console.log('NOT MEASURED HERE: that a band visibly compresses toward a surface. That needs a '
    + 'built ROM in an emulator, and aeon\'s generator half (9b) does not exist yet, so no ROM '
    + 'can be built through the document path at all. Foreground lane\'s to take.');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
