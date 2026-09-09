#!/usr/bin/env node
// DOES EVERY REFUSAL ON THE SCENE PANEL FIT THE BOX IT IS PAINTED IN?
// (REFUSAL-SIBLINGS-UNMEASURED, batch parcel/refusal-box.)
//
// ============================================================================
// THE POPULATION, WHICH IS WHY THIS IS A FILE AND NOT TWO MORE ROWS ELSEWHERE
// ============================================================================
//
// `EffectsScenePanel` has THREE `NumberField`s that hand a refusal back to the
// card, and every one of them lands in the same scroller:
//
//     layer drift rate      `layer-<i>-drift-refusal`     never measured
//     rowRemap plane line   `layer-<i>-rowremap-planey-refusal`   MEASURED and
//                           FIXED (280px in a 129px box -> 119px) by the parcel
//                           this batch is named after
//     reel strip rate       `reel-<i>-refusal`            never measured
//
// The fixed one is measured by `harness:row-remap-control` row [5b2], and that
// row is where the BAR is written down: `Advisory`'s own docblock
// (EW-LAYER-CARD-SCROLLER) rules that a prose block in a layer card taller than
// the section's floor is "a paragraph no scroll position shows whole". The two
// siblings were left deliberately unmeasured by that parcel rather than assumed
// broken or assumed fine, and this file is the measurement.
//
// It is NOT in the row-remap harness because that file's name is its scope: a
// name that outlives what it covers is how a reader learns to distrust a whole
// chain, and this population is "a refusal block on the scene panel", not "the
// row-remap control". It IS deliberately shaped like [5b2] so the three numbers
// are comparable.
//
// ⚠ WHY A STATIC CENSUS CANNOT ANSWER THIS, restated because it is the reason
// the fixed one went unnoticed for so long: these blocks are COMPOSED AT REFUSAL
// TIME. `NumberField` appends `refusalWithCommittedDrift` to whatever the
// provider returned, on every refusal, because every prefix of a too-long number
// is itself a legal value and commits on the way. No standing string in the
// source is the sentence an author reads.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE BLOCK IS NOT THERE. A block that is not on the page has no height and
//     fits every box ever built. Every fit row gates on `found === 1` and is
//     preceded by a row proving the value was actually REFUSED (the document did
//     not take it) in the same pass.
//
//   • THE INSTRUMENT CANNOT SEE AN OVERFLOW AT ALL. Row [0b] injects a block
//     taller than the scroller, measures it with the SAME expression, and
//     requires `tallerThanScroller` true and `insideScroller` false. Without it
//     a fit row proves only that the expression returns something.
//
//   • THE MEASUREMENT IS OF THE SPAN AND NOT THE BLOCK. `Hint` takes
//     {children, under, tone, style} and DROPS anything else, so a testid can
//     only be carried by a span INSIDE it -- and the span excludes the Hint's own
//     padding, which would make every block read shorter than it is. So the
//     measurement is taken on the span's PARENT, and the row prints both so the
//     difference is visible rather than assumed.
//
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. `checkVisibility()` and
//     `getClientRects()` both go true on an element scrolled thousands of pixels
//     out of its own scroller (measured in this repo). The gate is the rect
//     against the SCROLLER'S box plus a strict `elementFromPoint`; the trio is
//     printed as evidence and is never the gate.
//
//   • A DIFFERENT CONTROL WAS DRIVEN. Every box is found by its own `title`,
//     built by the panel from the row descriptors, never "the Nth number input".
//
//   • THE BOUNDS AGREED WITH THE APP BY CONSTRUCTION. Both refused values are
//     derived IN THIS PROCESS from the vendored schema, never imported from the
//     module under test.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER, and nothing here
// claims anything about a ROM: this is about text a person reads in the editor.
//
// CLEANUP IS BY PID -- `spawnGuarded` + `killTree`, awaited.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:refusal-box-fit
//
//   From a linked worktree also set AURORA_BUILT_TREE to the tree you just built
//   and ELECTRON_BIN to an electron binary, because a worktree has no
//   node_modules and no dist of its own. ⚠ WITHOUT AURORA_BUILT_TREE the run-root
//   resolver BORROWS the nearest built tree and says so on its first line -- which
//   is a build of somebody else's sources, and it measured the PRE-FIX refusal as
//   though it were current on the first attempt at this parcel.
//
//   ⚠ FRESH COPY PER RUN. This harness authors into a scene and never saves.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9474);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 98);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-refusal-box-fit`;
mkdirSync(SHOTS, { recursive: true });
const SCENE_ID = process.env.SCENE_ID ?? 'ojz_act1_depth';

// ---------------------------------------------------------------------------
// THE BOUNDS, RE-DERIVED IN THIS PROCESS FROM THE VENDORED BYTES
// ---------------------------------------------------------------------------
//
// NOT imported from `scene-ui.ts` or from the providers. The question is whether
// the APP refuses what the CONTRACT refuses and then fits its own answer on
// screen; asking the app what the bound is would make the refusal rows agree with
// it by construction.
const SCHEMA = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));

/** Drift's wire bound, and the px/frame the box actually shows. */
const DRIFT = (() => {
  const node = SCHEMA.$defs.layer.properties.drift;
  const payload = (node.oneOf ?? []).map((b) => b.properties?.rate).find((r) => r);
  if (!payload || typeof payload.maximum !== 'number') {
    throw new Error('the vendored contract no longer states a numeric maximum for drift.rate; '
      + 'this harness derives the refused value from it rather than typing one.');
  }
  // The box is in px/frame and the file is in 1/256ths, and the DIVISOR IS READ
  // FROM THE DESCRIPTION rather than typed: aeon's generator does not convert, so
  // the factor is a contract fact and a typed 256 here would be a second author.
  const perPx = /1 px\/frame = (\d+)/.exec(String(payload.description ?? node.description ?? ''));
  if (!perPx) {
    throw new Error('the contract no longer states "1 px/frame = <n>" for drift; the px/frame '
      + 'the box shows cannot be derived from the wire bound without it.');
  }
  const units = Number(perPx[1]);
  const maxPx = payload.maximum / units;
  return { units, maxPx, refusedPx: maxPx + 1, wireMax: payload.maximum };
})();

/** The reel rate bound and the strip count, both from the contract. */
const REELS = (() => {
  const rates = SCHEMA.properties.reels.properties.rates;
  if (typeof rates.items?.maximum !== 'number' || typeof rates.minItems !== 'number') {
    throw new Error('the vendored contract no longer states a numeric maximum and a strip count '
      + 'for reels.rates; this harness derives the refused value from them.');
  }
  return { max: rates.items.maximum, min: rates.items.minimum, strips: rates.minItems,
    refused: rates.items.maximum + 1 };
})();

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
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res); ws.addEventListener('error', rej);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error
      ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate',
      { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} `
        + `${r.exceptionDetails.exception?.description ?? ''}`);
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
  if (!hdr) return 'no-header';
  hdr.click();
  return 'clicked';
})()`;

const BY_TITLE = (tag, prefix) => String.raw`
(() => [...document.querySelectorAll(${JSON.stringify(tag)})]
  .find((e) => (e.title || '').startsWith(${JSON.stringify(prefix)})) || null)()`;

const DRIFT_SELECT = (layer) => BY_TITLE('select', `Layer ${layer} `);
const DRIFT_BOX = (layer) => String.raw`
(() => [...document.querySelectorAll('input[type="number"]')]
  .find((i) => /^Layer ${layer} .*(rate|px\/frame)/i.test(i.title || '')) || null)()`;
const REEL_BOX = (strip) => String.raw`
(() => [...document.querySelectorAll('input[type="number"]')]
  .find((i) => /reel/i.test(i.title || '') && /strip ${strip}\b/i.test(i.title || '')) || null)()`;

/**
 * THE BLOCK A TESTID SITS IN, measured against its own scroller.
 *
 * ⚠ WHICH NODE IS THE BLOCK DEPENDS ON WHAT PAINTS IT, AND GETTING THAT WRONG
 * COST A RUN IN EACH DIRECTION.
 *
 *   · A `Hint` DROPS a `data-testid`, so a refusal painted as a hint carries
 *     its own on a span INSIDE the Hint. The span's rect excludes the Hint's
 *     padding, so measuring the span reports the block SHORTER than it is --
 *     an error in the direction that makes the row pass. Climb to the parent.
 *   · An `Advisory` puts the testid on the BLOCK ROOT. Climbing from there
 *     reaches the whole layer card: measured, the repaired drift block read
 *     932px with 796px of "padding", which is the CARD and not the block, and
 *     would have kept the row red after a correct fix.
 *
 * So the rule is derived from the node: a bare SPAN is prose inside a Hint and
 * its parent is the block; anything else already IS the block. Both rects are
 * returned, so a future third shape is visible rather than silently mismeasured.
 *
 * `insideScroller` and `hitInside` are the gate. `visible` and `rects` are printed
 * because they do NOT discriminate: both go true on an element scrolled thousands
 * of pixels out of its scroller.
 */
const BLOCK_SHAPE = (testid) => String.raw`
(() => {
  const nodes = [...document.querySelectorAll(${JSON.stringify(`[data-testid="${testid}"]`)})];
  if (nodes.length !== 1) return { found: nodes.length };
  const span = nodes[0];
  const el = (span.tagName === 'SPAN' && span.parentElement) ? span.parentElement : span;
  el.scrollIntoView({ block: 'center' });
  let sc = el.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const b = el.getBoundingClientRect();
  const sb = span.getBoundingClientRect();
  const cb = sc ? sc.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    found: 1, text: (el.innerText || '').trim(), node: span.tagName, measured: el.tagName,
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
    blockHeight: Math.round(b.bottom - b.top),
    spanHeight: Math.round(sb.bottom - sb.top),
    scroller: cb ? { top: Math.round(cb.top), bottom: Math.round(cb.bottom) } : null,
    scrollerHeight: cb ? Math.round(cb.bottom - cb.top) : null,
    insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
    tallerThanScroller: !!(cb && (b.bottom - b.top) > (cb.bottom - cb.top)),
    hitInside: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))),
    visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
    rects: el.getClientRects().length,
  };
})()`;

/**
 * THE CALIBRATION: put a block TALLER than the scroller inside it, measured with
 * the same expression. Without this, a green fit row proves only that the
 * expression returned an object.
 */
const CALIBRATE = String.raw`
(() => {
  const anchor = document.querySelector('[data-testid="reels-debug-note"]')
    || document.querySelector('input[type="number"]');
  if (!anchor) return { staged: false, why: 'no anchor inside the card' };
  let sc = anchor.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  if (!sc) return { staged: false, why: 'no scrolling ancestor' };
  const probe = document.createElement('div');
  probe.setAttribute('data-testid', 'refusal-box-calibration');
  // A MINIMUM HEIGHT AS WELL AS A HEIGHT, MEASURED: with the height alone the
  // probe came back 18px tall inside a 129px scroller and the calibration row
  // reported the instrument as broken. The card's scroller is a flex column, so a
  // plain height on a flex item is a BASIS the container may shrink. No backticks
  // in this comment: it lives inside a String.raw template.
  const want = String(Math.round(sc.getBoundingClientRect().height) + 200) + 'px';
  probe.style.flex = 'none';
  probe.style.height = want;
  probe.style.minHeight = want;
  probe.innerHTML = '<span data-testid="refusal-box-calibration-span">probe</span>';
  sc.appendChild(probe);
  return { staged: true };
})()`;
const UNCALIBRATE = String.raw`
(() => {
  const p = document.querySelector('[data-testid="refusal-box-calibration"]');
  if (p) p.remove();
  return !p;
})()`;

async function main() {
  const t0 = Date.now();
  console.log('=== refusal-box-fit harness ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log(`    bounds      : drift rate max ${DRIFT.wireMax} wire units at `
    + `${DRIFT.units}/px = ${DRIFT.maxPx} px/frame, so ${DRIFT.refusedPx} px/frame is refused; `
    + `reel rate ${REELS.min}..${REELS.max} over ${REELS.strips} strips, so ${REELS.refused} is `
    + 'refused — ALL READ FROM THE VENDORED SCHEMA IN THIS PROCESS');
  console.log('    the bar     : Advisory\'s own docblock (EW-LAYER-CARD-SCROLLER) — a prose '
    + 'block taller than the section\'s floor is a paragraph no scroll position shows whole. '
    + 'The fixed sibling measures 119px in a 129px box (harness:row-remap-control [5b2]).');

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
    check('1b', `aeon's own ${SCENE_ID}.json is loaded`,
      scenes.some((s) => s.id === SCENE_ID), JSON.stringify(scenes));
    if (!scenes.some((s) => s.id === SCENE_ID)) throw new Error(`${SCENE_ID} absent`);

    check('1c', 'the Effects facet mounts',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1400);

    // THE PANEL FOLLOWS THE ACTIVE SECTION'S sceneRef ON MOUNT (aurora 4b9b3f6a),
    // so a selection made before the mount is silently overwritten and every
    // document row would read a scene nothing on screen is editing.
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);
    await sleep(900);
    const selectedNow = await c.json('window.__dbg.aeon.selectedScene()');
    check('1c2', 'and the panel is EDITING the scene every row below asserts against',
      selectedNow === SCENE_ID,
      `selectedScene() = ${JSON.stringify(selectedNow)}, wanted ${JSON.stringify(SCENE_ID)}`);
    if (selectedNow !== SCENE_ID) throw new Error(`the panel is editing ${selectedNow}`);

    await c.evalExpr(OPEN_SECTION(String.raw`/^Layers \(/`,
      String.raw`document.querySelector('input[type="number"]')`));
    await sleep(900);

    // ---- 0b. THE INSTRUMENT, CALIBRATED ----------------------------------
    const staged = await c.json(CALIBRATE);
    const probe = staged.staged ? await c.json(BLOCK_SHAPE('refusal-box-calibration-span')) : null;
    await c.evalExpr(UNCALIBRATE);
    check('0b', 'INSTRUMENT CALIBRATION: a block deliberately taller than the scroller is '
      + 'reported as NOT fitting',
      staged.staged === true && probe !== null && probe.found === 1
      && probe.tallerThanScroller === true && probe.insideScroller === false,
      `staged: ${JSON.stringify(staged)}\n        probe: ${JSON.stringify(probe)}\n        `
      + 'Without this row a green fit below proves only that the expression returned an object.');

    // ---- 2. THE DRIFT REFUSAL --------------------------------------------
    const LAYER = 0;
    const driftSel = await c.json(String.raw`(() => {
      const el = [...document.querySelectorAll('select')]
        .find((s) => /^Layer ${LAYER} .*drift/i.test(s.title || ''));
      return el ? { title: el.title, value: el.value } : null;
    })()`);
    check('2a', 'the layer card carries a drift row for this strip',
      driftSel !== null, JSON.stringify(driftSel));
    if (driftSel === null) throw new Error('no drift select — every drift row would be vacuous');

    await setSelect(String.raw`(() => [...document.querySelectorAll('select')]
      .find((s) => /^Layer ${LAYER} .*drift/i.test(s.title || '')) || null)()`, 'rate');
    await sleep(900);
    const driftBox = await c.json(String.raw`(() => {
      const el = ${DRIFT_BOX(LAYER)};
      return el ? { title: el.title, shown: el.value } : null;
    })()`);
    check('2b', 'switching drift on reveals its rate box',
      driftBox !== null, JSON.stringify(driftBox));
    if (driftBox === null) throw new Error('no drift rate box');

    const heldDrift = (await scene())?.layers?.[LAYER]?.drift ?? null;
    await clickAt(DRIFT_BOX(LAYER));
    await sleep(250);
    await typeText(String(DRIFT.refusedPx));
    await sleep(800);
    const afterDrift = (await scene())?.layers?.[LAYER]?.drift ?? null;
    const driftWire = typeof afterDrift === 'object' && afterDrift !== null
      ? afterDrift.rate : null;
    check('2c', `typing ${DRIFT.refusedPx} px/frame (one past the contract's bound) never `
      + 'REACHES the document',
      driftWire === null || Math.abs(driftWire) <= DRIFT.wireMax,
      `document holds ${JSON.stringify(afterDrift)}; the contract's bound is `
      + `${DRIFT.wireMax} wire units. Was ${JSON.stringify(heldDrift)}. This row is the `
      + 'precondition for [2d]: a refusal that never fired paints no block, and a block that '
      + 'is not there fits every box there is.');

    const driftShape = await c.json(BLOCK_SHAPE(`layer-${LAYER}-drift-refusal`));
    check('2d', 'and the DRIFT refusal FITS IN THE BOX it is painted in',
      driftShape.found === 1
      && driftShape.insideScroller === true && driftShape.tallerThanScroller === false,
      (driftShape.found !== 1
        ? `NO BLOCK: ${driftShape.found} node(s) carry the testid, so this row is reporting its `
          + 'own absence and not its subject. Read [2c] first.'
        : `block ${driftShape.blockHeight}px (span ${driftShape.spanHeight}px, so the Hint's own `
          + `padding is ${driftShape.blockHeight - driftShape.spanHeight}px) in a scroller `
          + `${driftShape.scrollerHeight}px tall — ${JSON.stringify(driftShape.rect)} vs `
          + `${JSON.stringify(driftShape.scroller)}.\n        `
          + `insideScroller ${driftShape.insideScroller}, tallerThanScroller `
          + `${driftShape.tallerThanScroller}, hitInside ${driftShape.hitInside}; the `
          + `non-discriminating pair, printed as evidence: visible ${driftShape.visible}, rects `
          + `${driftShape.rects}.\n        text: ${JSON.stringify(driftShape.text)}`));

    // ---- 3. THE REEL REFUSAL ---------------------------------------------
    //
    // ⚠ A DIFFERENT SECTION AND A DIFFERENT BOX. The reels row is in
    // `aeon.effects.scene`, not in the layer list, so its refusal lands in THAT
    // section's scroller. Both are measured against their own box rather than
    // against one number, which is what the bar says: the floor is per section.
    const sceneOpened = await c.evalExpr(OPEN_SECTION(String.raw`/^Scene: /`,
      String.raw`[...document.querySelectorAll('select')].find(
        (s) => (s.title || '').startsWith('reels:'))`));
    await sleep(900);
    const reelToggle = await c.evalExpr(String.raw`(() => {
      const el = [...document.querySelectorAll('select')]
        .find((s) => (s.title || '').startsWith('reels:'));
      if (!el) return 'no-select';
      const on = [...el.options].find((o) => o.value !== 'none');
      if (!on) return 'no-on-option';
      el.value = on.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.value;
    })()`);
    await sleep(1200);
    const reelBoxes = await c.json(String.raw`(() => [...document.querySelectorAll('input[type="number"]')]
      .filter((i) => (i.title || '').startsWith('reels.rates['))
      .map((i) => ({ title: i.title.slice(0, 40), shown: i.value })))()`);
    check('3a', `switching the reels on reveals ${REELS.strips} rate boxes`,
      reelBoxes.length === REELS.strips,
      `section -> ${JSON.stringify(sceneOpened)}; toggle -> ${JSON.stringify(reelToggle)}; `
      + `boxes: ${JSON.stringify(reelBoxes)}. The count is the contract's minItems/maxItems, `
      + 'which are both the strip count.');
    if (reelBoxes.length === 0) throw new Error('no reel rate boxes — the reel rows are vacuous');

    const STRIP = 0;
    const reelSelector = String.raw`
(() => [...document.querySelectorAll('input[type="number"]')]
  .find((i) => (i.title || '').startsWith('reels.rates[' + ${STRIP} + ']')) || null)()`;
    const heldRates = (await scene())?.reels?.rates ?? null;
    await clickAt(reelSelector);
    await sleep(250);
    await typeText(String(REELS.refused));
    await sleep(800);
    const afterRates = (await scene())?.reels?.rates ?? null;
    check('3b', `typing ${REELS.refused} (one past the contract's i8 ceiling) never REACHES the `
      + 'document',
      Array.isArray(afterRates)
      && afterRates.every((r) => r >= REELS.min && r <= REELS.max),
      `document holds ${JSON.stringify(afterRates)}; the contract admits ${REELS.min}..`
      + `${REELS.max}. Was ${JSON.stringify(heldRates)}.`);

    const reelShape = await c.json(BLOCK_SHAPE(`reel-${STRIP}-refusal`));
    check('3c', 'and the REEL refusal FITS IN THE BOX it is painted in',
      reelShape.found === 1
      && reelShape.insideScroller === true && reelShape.tallerThanScroller === false,
      (reelShape.found !== 1
        ? `NO BLOCK: ${reelShape.found} node(s) carry the testid, so this row is reporting its `
          + 'own absence and not its subject. Read [3b] first.'
        : `block ${reelShape.blockHeight}px (span ${reelShape.spanHeight}px, so the Hint's own `
          + `padding is ${reelShape.blockHeight - reelShape.spanHeight}px) in a scroller `
          + `${reelShape.scrollerHeight}px tall — ${JSON.stringify(reelShape.rect)} vs `
          + `${JSON.stringify(reelShape.scroller)}.\n        `
          + `insideScroller ${reelShape.insideScroller}, tallerThanScroller `
          + `${reelShape.tallerThanScroller}, hitInside ${reelShape.hitInside}; the `
          + `non-discriminating pair, printed as evidence: visible ${reelShape.visible}, rects `
          + `${reelShape.rects}.\n        text: ${JSON.stringify(reelShape.text)}`));

    const shot = await c.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot) {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(`${SHOTS}/refusal-box-fit.png`, Buffer.from(shot.data, 'base64'));
      console.log(`\n    screenshot  : ${SHOTS}/refusal-box-fit.png`);
    }
  } finally {
    if (c) c.close();
    await killTree(child);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n════ ${passed}/${results.length} rows · ${((Date.now() - t0) / 1000).toFixed(1)}s ════`);
  if (fails.length > 0) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  console.log('NOT MEASURED HERE: whether the SENTENCES are right. This file is about the BLOCK '
    + 'against the smallest box the shell may give it; the words are the providers\' unit tests '
    + 'and the row-remap harness\'s [5b] to prove.');
  process.exitCode = fails.length === 0 ? 0 : 1;
}

main().catch(async (e) => {
  console.error('HARNESS ERROR:', e.message);
  process.exitCode = 1;
});
