#!/usr/bin/env node
// DOES THE REELS ROW REALLY DO WHAT THE NODE ROWS SAY? (EW-REELS-PANEL.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// `test/formats/effects-reels-panel.test.ts` is 36 green rows and it cannot see
// any of this:
//
//        AN AUTHOR OPENS THE SCENE FORM, TURNS THE REELS ON, TYPES `3` INTO THE
//        LEFTMOST STRIP'S BOX — AND THE DOCUMENT HOLDS 3, NOT 768 — WHILE A
//        SENTENCE SAYING THE EFFECT RENDERS IN NO RELEASE BUILD IS PAINTED
//        ABOVE THE FIVE BOXES.
//
// and it CANNOT, on principle. The node suite has no React and no browser: it
// can assert that the component's SOURCE names `REELS_ROW.debug.short`, which is
// a claim about a string in a file, not about a pixel on a screen. This repo has
// shipped a `data-testid` that never reached the DOM (`Hint` drops unknown
// props) with a source-level row green over it. So every row below drives the
// REAL app through CDP with REAL key events and reads the MODEL back, never the
// widget.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE KEYSTROKES NEVER LANDED, so "the document does not hold 768" is true
//     because nothing happened. Row [4a] types a LEGAL rate through the same
//     path and requires the model to MOVE to exactly it; that is the
//     anti-vacuous floor for the whole file, and it runs BEFORE the refusal
//     rows rather than after, so a dead input cannot bank a refusal row first.
//
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. Hidden text is still in
//     `textContent`. Every painted row asserts `checkVisibility()`, a non-empty
//     `getClientRects()`, a strict `elementFromPoint` at the leaf's own centre,
//     AND that the leaf's rect sits inside its SCROLLER's box — because
//     `checkVisibility()` and `getClientRects()` both go green on an element
//     scrolled thousands of pixels out of its scroll container.
//
//   • THE SENTENCE IS THE HARNESS'S OWN WORDS. The DEBUG disclosure is read
//     HERE out of the vendored schema at startup and the row requires the
//     PAINTED text to contain it. A row matching a phrase typed into this file
//     would pass over a panel that typed the same phrase — which is the exact
//     drift the derivation exists to prevent.
//
//   • A DIFFERENT CONTROL WAS DRIVEN. The boxes are found by their `title`,
//     which is composed from the SCHEMA's geometry (`reels.rates[i] — screen X
//     …`), not by "the Nth number input in the column": the column also holds V
//     factor, V center, V offset and every layer's screen line, and which one is
//     Nth depends on what is expanded.
//
//   • THE ORDER ROW PASSED UNDER A SORT. [6a] writes a value at the RIGHTMOST
//     strip that would sort to the FRONT and compares the EXACT SEQUENCE. A
//     membership assertion would pass under a sort and is worthless here.
//
// ⚠ dpr AND THE RECT ARE PRINTED BESIDE EVERY AIM. `devicePixelRatio` has been
// observed at both 1 and 1.35 in one session on this machine and a fractional
// rect presents as an off-by-one in a feature that is fine.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER — and none would
// help: aeon's generator arm for `reels` does not exist yet and the effect is
// DEBUG-tier, so nothing authored here can reach a ROM.
//
// CLEANUP IS BY PID — `spawnGuarded` + `killTree`, awaited.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   ELECTRON_BIN=<a checkout with node_modules> \
//   AEON_DIR=<writable copy> npm run harness:reels-panel
//
//   ⚠ FRESH COPY PER RUN. This harness AUTHORS into a scene document (it must —
//   the whole subject is what a control writes) and never saves, so nothing
//   reaches disk. It still opens the project, so an aeon copy another harness
//   has saved into is not the fixture this one describes; every row prints what
//   it read so a contaminated copy is visible rather than silent.
//
//   PLANT=x256   … multiply the typed rate by 256 before comparing, i.e. read
//                  the model as a panel copied from the drift path would have
//                  written it. Reported with the honest count of how many rows
//                  still pass, which is the SIZE of the hazard rather than an
//                  assertion about it.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9461);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 96);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-reels-panel`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';

/**
 * ⚠ THE CONTRACT'S OWN SENTENCE AND THE CONTRACT'S OWN BOUNDS, READ HERE.
 *
 * Not imported from `scene-ui.ts` and not typed into this file. Importing the
 * module under test would make the row "the panel paints what the module says",
 * which is true of a module that says the wrong thing; typing the words in would
 * make it "the panel paints what this harness says", which drifts the moment the
 * contract does. Reading the vendored JSON is the third option and the only one
 * that measures the panel against the CONTRACT.
 */
const SCHEMA = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
const REELS_DESC = SCHEMA.properties.reels.description;
const RATES_NODE = SCHEMA.properties.reels.properties.rates;
const BAND_COUNT = RATES_NODE.minItems;
const RATE_MIN = RATES_NODE.items.minimum;
const RATE_MAX = RATES_NODE.items.maximum;
const STRIP_W = Number(/screen X (\d+)i\.\.(\d+)i\+(\d+)/.exec(REELS_DESC)[1]);
const DEBUG_SENTENCE = /so (a scene saved with reels shows NOTHING in a release build)/
  .exec(REELS_DESC)[1];
/** The ×256 that must never be applied here — read from drift's own node. */
const DRIFT_UNITS = (() => {
  const drift = JSON.stringify(SCHEMA.$defs ?? SCHEMA.properties);
  const m = /1\/(\d+)\s*px/.exec(drift) ?? /(\d+)ths? of a pixel/.exec(drift);
  return m ? Number(m[1]) : 256;
})();

console.log(`    CONTRACT    : ${BAND_COUNT} strips of ${STRIP_W}px, rates ${RATE_MIN}..${RATE_MAX}`);
console.log(`    DISCLOSURE  : "${DEBUG_SENTENCE}"`);

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

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
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

/**
 * One strip's box, found by the title the panel composes from the SCHEMA's own
 * geometry.
 *
 * ⚠ NOT "the Nth number input". The Scene form also holds V factor, V center and
 * V offset, and the layer cards hold a screen line and a drift rate each; which
 * input is Nth depends entirely on what is expanded. This selector names the
 * strip.
 */
const REEL_BOX = (i) => String.raw`
(() => {
  const want = 'reels.rates[' + ${i} + ']';
  return [...document.querySelectorAll('input[type="number"]')]
    .find((el) => (el.title || '').startsWith(want)) || null;
})()`;

/** The reels toggle, found by the row's own label rather than by position. */
const REELS_SELECT = String.raw`
(() => {
  const sels = [...document.querySelectorAll('select')]
    .filter((s) => (s.title || '').startsWith('reels —'));
  return sels[0] || null;
})()`;

/**
 * The leaf element carrying `text`, PAINTED — and paint is four questions, not
 * one.
 *
 * `checkVisibility()` and `getClientRects()` both return green for an element
 * scrolled far out of its scroll container, which this repo has been bitten by;
 * so the rect is also compared to the nearest SCROLLER's box. All four readings
 * are returned rather than folded into a boolean, so a row can print what it
 * actually measured.
 */
const PAINTED_LEAF = (needle, afterSelector) => String.raw`
(() => {
  const anchor = ${afterSelector};
  const leaves = [...document.querySelectorAll('div,span')]
    .filter((d) => (d.innerText || '').includes(${JSON.stringify(needle)})
                && ![...d.children].some((k) => (k.innerText || '').includes(${JSON.stringify(needle)})));
  const leaf = leaves[0] || null;
  if (!leaf) return { leaf: false, candidates: leaves.length };
  leaf.scrollIntoView({ block: 'center' });
  const b = leaf.getBoundingClientRect();
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  let sc = leaf.parentElement;
  while (sc && sc.scrollHeight <= sc.clientHeight + 1) sc = sc.parentElement;
  const sb = sc ? sc.getBoundingClientRect() : null;
  return {
    leaf: true, text: (leaf.innerText || '').trim(),
    title: (leaf.getAttribute('title') || '').slice(0, 120),
    rects: leaf.getClientRects().length,
    visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
    hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
    afterControl: anchor ? (anchor.compareDocumentPosition(leaf) & 4) === 4 : null,
    insideScroller: sb ? (b.top >= sb.top - 1 && b.bottom <= sb.bottom + 1) : null,
    dpr: window.devicePixelRatio, rect: b.toJSON(),
  };
})()`;

async function main() {
  const t0 = Date.now();
  console.log('=== reels-panel harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    uptime      : ${Math.round(os.uptime() / 3600)}h   ${new Date().toISOString()}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);

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

    // A real click on an element's painted centre, then real key events.
    //
    // ⚠ IT BLURS FIRST. Clicking an already-focused input fires no `focus`, so
    // the select-on-focus never runs and the next keystrokes APPEND — which is
    // how `effects-refusal-harness` once produced `40112200`.
    const clickAt = async (selector) => {
      await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0');
      const p = await c.json(String.raw`(() => {
        const el = ${selector};
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2),
                 dpr: window.devicePixelRatio, rect: b.toJSON() };
      })()`);
      if (!p) return null;
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
    const scenes = async () => JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const reelsOf = async (id) => (await scenes()).find((s) => s.id === id)?.reels ?? null;

    // ---- 1. THE SUBJECT: an act, the Effects tab, the Scene form. --------
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

    const loaded = await scenes();
    check('1b', 'the project carries at least one effects scene to author into',
      loaded.length > 0, `${loaded.length} scene(s): ${JSON.stringify(loaded.map((s) => s.id))}`);
    if (loaded.length === 0) throw new Error('no scenes — every row below would be vacuous');
    // DERIVED FROM THE APP, not typed: whichever scene the panel resolves to.
    const SCENE = loaded[0].id;
    console.log(`    SCENE       : ${SCENE}`);

    check('1c', 'the Effects facet mounts',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1400);
    await c.evalExpr(SUBTAB('parallax'));
    await sleep(1000);

    const opened = await c.evalExpr(OPEN_SECTION(
      String.raw`/^Scene — ` + SCENE + String.raw`(?!\s—)/`, REELS_SELECT));
    await sleep(900);
    const toggle = await c.json(String.raw`(() => {
      const el = ${REELS_SELECT};
      if (!el) return { found: false };
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      return { found: true, value: el.value, title: (el.title || '').slice(0, 90),
               options: [...el.options].map((o) => o.value),
               dpr: window.devicePixelRatio, rect: b.toJSON(),
               rects: el.getClientRects().length,
               visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null };
    })()`);
    check('1d', 'the Reels row exists, is PAINTED, and offers exactly off/on',
      toggle.found === true && toggle.rects > 0 && toggle.visible !== false
      && JSON.stringify(toggle.options) === JSON.stringify(['none', 'on']),
      toggle.found === false ? `NOT FOUND (section open → ${opened})` : JSON.stringify(toggle));
    if (toggle.found !== true) throw new Error('the Reels toggle was not found');

    check('1e', 'ANTI-VACUOUS: the scene carries NO reels before anything is clicked',
      (await reelsOf(SCENE)) === null,
      `reels = ${JSON.stringify(await reelsOf(SCENE))}`);

    // ---- 2. TURNING IT ON WRITES THE KEY, WITH FIVE DISTINCT RATES. ------
    await c.evalExpr(String.raw`(() => {
      const el = ${REELS_SELECT};
      el.value = 'on';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(900);
    const seeded = await reelsOf(SCENE);
    check('2a', 'the toggle writes `reels` with exactly the contract\'s band count, all distinct',
      seeded !== null && Array.isArray(seeded.rates)
      && seeded.rates.length === BAND_COUNT
      && new Set(seeded.rates).size === BAND_COUNT
      && seeded.rates.every((r) => Number.isInteger(r) && r >= RATE_MIN && r <= RATE_MAX),
      JSON.stringify(seeded));
    // ⚠ THE SEED IS NOT ALL-ZERO, which is the one shape a ×256 unit error hides
    // in — and which `uniqueItems` would refuse anyway.
    check('2b', 'the seed is not the all-stationary document',
      seeded !== null && seeded.rates.some((r) => r !== 0), JSON.stringify(seeded?.rates));

    // ---- 3. THE REQUIRED DISCLOSURE, PAINTED. ----------------------------
    const debugNote = await c.json(PAINTED_LEAF(DEBUG_SENTENCE, REEL_BOX(0)));
    check('3a', 'the DEBUG-tier sentence is PAINTED, and it is the CONTRACT\'s words',
      debugNote.leaf === true && debugNote.rects > 0 && debugNote.visible !== false
      && debugNote.hitInside === true && debugNote.insideScroller !== false
      && debugNote.text.includes(DEBUG_SENTENCE),
      JSON.stringify(debugNote));
    check('3b', 'and the long form rides the same element\'s title',
      debugNote.leaf === true && /DEBUG-ONLY/.test(debugNote.title)
      && debugNote.title.length > debugNote.text.length,
      `title=${JSON.stringify(debugNote.title)} text=${JSON.stringify(debugNote.text)}`);

    // ---- 4. THE ANTI-VACUOUS FLOOR, BEFORE ANY REFUSAL ROW. --------------
    //
    // Without this, every refusal row below is satisfied by a box that accepts
    // nothing at all. It runs FIRST so a dead input cannot bank a refusal.
    const box0 = await c.json(String.raw`(() => {
      const el = ${REEL_BOX(0)};
      if (!el) return { found: false };
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return { found: true, value: el.value, title: (el.title || '').slice(0, 110),
               min: el.getAttribute('min'), max: el.getAttribute('max'),
               dpr: window.devicePixelRatio, rect: b.toJSON(),
               rects: el.getClientRects().length, hitIsBox: hit === el };
    })()`);
    check('4a', 'strip 0\'s box is found BY ITS SCHEMA-DERIVED TITLE, painted, hit-testable',
      box0.found === true && box0.rects > 0 && box0.hitIsBox === true
      && box0.title.includes(`screen X 0..${STRIP_W - 1}`),
      JSON.stringify(box0));
    if (box0.found !== true) throw new Error('strip 0 box not found — nothing below can be typed');
    check('4b', 'the spinner\'s min/max are the SCHEMA\'s span, not the guidance range',
      Number(box0.min) === RATE_MIN && Number(box0.max) === RATE_MAX,
      `min=${box0.min} max=${box0.max} against contract ${RATE_MIN}..${RATE_MAX}`);

    // ⚠ THE FLOOR'S VALUE IS DERIVED FROM WHAT THE DOCUMENT ALREADY HOLDS, and
    // the first version of this row was not. It typed the contract's worked
    // example (3) into strip 0 — and 3 was already strip 2's rate, so
    // `uniqueItems` REFUSED it and the anti-vacuous floor read as a failure of
    // hazard 1 while the panel was behaving exactly as specified. The control
    // acted inside its own sample window. So: the smallest positive rate the
    // scene does NOT already carry, printed.
    const WANT = (() => {
      for (let r = 1; r <= RATE_MAX; r++) if (!seeded.rates.includes(r)) return r;
      throw new Error('no free rate — the seed fills the span, which cannot happen');
    })();
    console.log(`    FLOOR VALUE : ${WANT} (absent from ${JSON.stringify(seeded.rates)})`);
    await clickAt(REEL_BOX(0));
    await sleep(250);
    await typeText(String(WANT));
    await sleep(700);
    const afterLegal = await reelsOf(SCENE);
    const read0 = PLANT === 'x256' ? afterLegal.rates[0] * DRIFT_UNITS : afterLegal.rates[0];
    check('4c', `ANTI-VACUOUS FLOOR + HAZARD 1: typing ${WANT} lands ${WANT}, never ${WANT * DRIFT_UNITS}`,
      read0 === WANT,
      `model rates = ${JSON.stringify(afterLegal.rates)}; strip 0 = ${read0} `
      + `(was ${seeded.rates[0]}); a panel copied from the drift path would hold `
      + `${WANT * DRIFT_UNITS}`);
    check('4d', 'and the box shows the value that committed',
      (await c.evalExpr(String.raw`(${REEL_BOX(0)}).value`)) === String(WANT));

    // ---- 5. THE ×256 TYPED IN, AND THE REFUSAL PAINTED. ------------------
    //
    // ⚠ 768 REGARDLESS OF THE FLOOR VALUE. This is the contract's OWN worked
    // example — "a panel copied from the drift panel would emit 768 for an
    // intended 3" — and tying it to the floor's derived value would have made
    // the number this row types depend on what the seed happened to be.
    const OOPS = String(3 * DRIFT_UNITS);
    await clickAt(REEL_BOX(0));
    await sleep(250);
    await typeText(OOPS);
    await sleep(700);
    const afterOops = await reelsOf(SCENE);
    // ⚠ THE PROPERTY IS "THE DOCUMENT NEVER HOLDS THE ×256", not "the document
    // did not move". `NumberField` commits per keystroke — its long-standing
    // contract — so `7` and `76` are legal rates and DO land; only `768` does
    // not. Measured, and it is why the sentence names what is held.
    check('5a', `the ×256 (${OOPS}) NEVER reaches the document`,
      afterOops.rates[0] !== Number(OOPS)
      && afterOops.rates[0] >= RATE_MIN && afterOops.rates[0] <= RATE_MAX,
      `model rates = ${JSON.stringify(afterOops.rates)} — the per-keystroke prefixes are `
      + `legal rates and landed; ${OOPS} did not`);
    const oopsRefusal = await c.json(PAINTED_LEAF('SIGNED WHOLE PIXELS PER FRAME', REEL_BOX(0)));
    check('5b', 'a PAINTED refusal under the box names the unit and the ×256 prohibition',
      oopsRefusal.leaf === true && oopsRefusal.rects > 0 && oopsRefusal.visible !== false
      && oopsRefusal.hitInside === true && oopsRefusal.afterControl === true
      && oopsRefusal.insideScroller !== false
      && /MUST NOT be applied here/.test(oopsRefusal.text)
      && oopsRefusal.text.includes(OOPS),
      JSON.stringify(oopsRefusal));

    // ---- 6. HAZARD 3 — screen order, driven at the RIGHTMOST strip. ------
    //
    // The value is the BOTTOM of the legal span, so it would sort to the FRONT.
    // A membership assertion cannot tell; the exact sequence can.
    const beforeOrder = (await reelsOf(SCENE)).rates.slice();
    const LAST = BAND_COUNT - 1;
    await clickAt(REEL_BOX(LAST));
    await sleep(250);
    await typeText(String(RATE_MIN));
    await sleep(700);
    const afterOrder = (await reelsOf(SCENE)).rates.slice();
    const expected = beforeOrder.slice();
    expected[LAST] = RATE_MIN;
    check('6a', 'writing the rightmost strip leaves the other four AT THEIR OWN INDICES',
      JSON.stringify(afterOrder) === JSON.stringify(expected),
      `before ${JSON.stringify(beforeOrder)} → after ${JSON.stringify(afterOrder)}, `
      + `expected ${JSON.stringify(expected)}`);
    check('6b', 'ANTI-VACUOUS: the result is NOT its own sorted form, so a sort would show',
      JSON.stringify(afterOrder) !== JSON.stringify([...afterOrder].sort((a, b) => a - b)),
      `sorted would be ${JSON.stringify([...afterOrder].sort((a, b) => a - b))}`);
    // ⚠ THE LABEL IS THE CHEAP DEFENCE AGAINST HAZARD 3 and the only one an
    // author sees. A strip number would be a second copy of the array index; the
    // pixels are the thing that makes a reordered array look wrong on screen.
    const labels = await c.json(String.raw`(() => {
      const out = [];
      for (let i = 0; i < ${BAND_COUNT}; i++) {
        const el = [...document.querySelectorAll('input[type="number"]')]
          .find((e) => (e.title || '').startsWith('reels.rates[' + i + ']'));
        if (!el) { out.push(null); continue; }
        const row = el.parentElement;
        out.push(row ? (row.innerText || '').split('\n')[0].trim() : null);
      }
      return out;
    })()`);
    check('6c', 'each box is labelled with the PIXELS it owns, ascending left to right',
      labels.every((l, i) => typeof l === 'string' && l.includes(String(i * STRIP_W))
                             && l.includes(String(i * STRIP_W + STRIP_W - 1))),
      `labels = ${JSON.stringify(labels)} against spans derived from the contract's `
      + `${STRIP_W}px stride`);

    // ---- 7. HAZARD 2 — zero is a value, and uniqueItems caps it at one. ---
    await clickAt(REEL_BOX(1));
    await sleep(250);
    await typeText('0');
    await sleep(700);
    const afterZero = (await reelsOf(SCENE)).rates.slice();
    check('7a', 'ZERO COMMITS — a stationary strip is a real authored choice here',
      afterZero[1] === 0, `model rates = ${JSON.stringify(afterZero)}`);
    // A second zero is a DUPLICATE, which `uniqueItems` refuses.
    await clickAt(REEL_BOX(2));
    await sleep(250);
    await typeText('0');
    await sleep(700);
    const afterSecondZero = (await reelsOf(SCENE)).rates.slice();
    check('7b', 'a SECOND zero never reaches the document — uniqueItems caps it at one strip',
      afterSecondZero[2] !== 0 && afterSecondZero[1] === 0,
      `model rates = ${JSON.stringify(afterSecondZero)}`);
    const dupRefusal = await c.json(PAINTED_LEAF('PAIRWISE DISTINCT', REEL_BOX(2)));
    check('7c', 'and a PAINTED refusal names BOTH strips and says zero is legal',
      dupRefusal.leaf === true && dupRefusal.rects > 0 && dupRefusal.visible !== false
      && dupRefusal.hitInside === true && dupRefusal.insideScroller !== false
      && /strips 1 and 2/.test(dupRefusal.text)
      && /Zero IS a legal rate/.test(dupRefusal.text),
      JSON.stringify(dupRefusal));

    // ---- 8. THE BINDING NOTE IS ALWAYS ON, AND SILENCE IS NOT A PASS. ----
    const bindingNote = await c.json(PAINTED_LEAF('REFUSES a reels key', REEL_BOX(0)));
    check('8a', 'the binding RULE is painted whenever the key is present',
      bindingNote.leaf === true && bindingNote.rects > 0 && bindingNote.visible !== false
      && bindingNote.insideScroller !== false,
      JSON.stringify(bindingNote).slice(0, 400));

    // ---- 9. OFF DELETES THE KEY. -----------------------------------------
    await c.evalExpr(String.raw`(() => {
      const el = ${REELS_SELECT};
      el.value = 'none';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(900);
    check('9a', 'turning it off DELETES the key — absent is absent, there is no "none"',
      (await reelsOf(SCENE)) === null,
      `reels = ${JSON.stringify(await reelsOf(SCENE))}`);
    check('9b', 'and the five boxes are gone with it',
      (await c.evalExpr(String.raw`(${REEL_BOX(0)}) === null`)) === true);

    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/reels-panel.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/reels-panel.png`);
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
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
