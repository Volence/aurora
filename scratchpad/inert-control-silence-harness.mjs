#!/usr/bin/env node
// A CONTROL THE APP WILL NOT LET YOU USE SAYS WHY, IN THE PAGE, WITHOUT A HOVER.
// EW-INERT-CONTROL-SILENCE (EFFECTS-W1), from the cold read of 2026-09-05, C5.
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST, AND WHY *THIS* HARNESS AND NOT THE SIBLING ONE
// ============================================================================
//
// `curve-option-disabled-harness.mjs` already proves the neighbouring claim:
// the refused option is PRESENT, DISABLED, and carries the engine's reason in
// its `title`. That was ROADMAP row 13 and it holds. It is not this claim.
//
// The cold reader met exactly that surface and wrote: "one entry of `B curve
// to` is labelled (engine refuses) and nothing says why ... I worked out by
// inspection that the refused entry is always that layer's current Plane B
// value ... but that is a deduction, not something the screen says." A `title`
// on a disabled `<option>` is not something the screen says. Chromium draws a
// `<select>` popup as a NATIVE widget outside the page (measured, and written
// into the sibling harness's own banner: `Page.captureScreenshot` cannot see
// one), so that string is out of reach of a screenshot, out of reach of a
// keyboard user who never lands on a disabled row, and out of reach of anyone
// who does not think to hover a dead entry.
//
//        THE CLAIM HERE IS: WITH NOTHING HOVERED AND NOTHING OPENED, A
//        SENTENCE IS PAINTED IN THE PAGE, UNDER THE CONTROL, THAT NAMES THE
//        REFUSED VALUE ON *THIS* LAYER AND SAYS WHY THE ENGINE WILL NOT TAKE IT.
//
// ⚠ NO ROW BELOW READS A `title`, AN `aria-*` OR ANY HOVER STATE. That is the
// point: a row that read a title would go green on the exact surface the cold
// reader called silent. `document.title` and element titles are never touched
// after row [3c], which reads one only to PRINT it as evidence of what the old
// route carried, and is not a gate.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE SELECTOR MATCHES NOTHING and every `.find()` is `undefined`. Row [3a]
//     asserts the curve picker was FOUND and holds a full option list before
//     anything is read off it, and `PLANT=rot-selector` end-anchors the title
//     regexp the way five real rots in this repo were shaped, so [3a] must
//     catch it and the run must ABORT rather than report §4 as green.
//
//   • THE SENTENCE IS `curveAdvisory`, NOT THE NEW ROW HINT. That advisory has
//     said almost these words since parcel H, and it fires only when the
//     document ALREADY carries `curve.to == fb`. Row [2c] reads the document
//     back and requires `curve` to be ABSENT, so the state under test is a
//     legal document with nothing chosen: the state the cold reader was in, and
//     the state in which the old surface said nothing at all. Row [4d] also
//     requires the found text to START with the row's own base hint, which
//     `curveAdvisory` does not.
//
//   • THE TEXT IS IN THE DOM AND NOT ON THE SCREEN. `checkVisibility()` and
//     `getClientRects()` both go GREEN on an element scrolled thousands of
//     pixels out of its own scroller - measured in this repo. Row [4c]
//     therefore compares the element's rect to its NEAREST CLIPPER's box
//     (`overflow-y` other than visible, OR a real scroll overflow - an
//     overflow:hidden ancestor clips without ever being scrollable, and the
//     first cut of this walk fell straight through one) and hit-tests its
//     integer centre with `elementFromPoint`; the trio is PRINTED as evidence
//     and is never the gate. The element is scrolled into view FIRST: being
//     unreachable by scrolling is the defect, being below the fold is not.
//
//   • THE SENTENCE IS A STATIC STRING. The refused entry is a DIFFERENT one on
//     each layer, which is what made the cold reader deduce the rule instead of
//     reading it. Row [5a] drives `fb` to a second named factor IN THE SAME RUN
//     and requires the sentence to follow it and to stop naming the first.
//
//   • THE SENTENCE IS ALWAYS THERE, INCLUDING WHERE THERE IS NOTHING TO SAY -
//     which would be the height regression this parcel was told to avoid. Row
//     [5b] drives `fb` to a PACKED triple that NO published name claims (found
//     by reading aeon's transcribed factor table out of this repo, never
//     typed), where the picker refuses nothing, and requires the clause to be
//     GONE. [5c] then reports the clause's height cost as the difference
//     between those two states measured at ONE geometry in ONE run.
//
//   • THE CLAUSE LEAKED ONTO ROWS THAT REFUSE NOTHING. Row [7a] reads the
//     `fa`/`fb` hint in the same run and requires it to carry no refusal.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. Every rect, dpr, hit test and height is
// read in one session and printed together. No coordinate is fractional.
//
// ⚠ NO EMULATOR, EVER. Nothing here runs a ROM and nothing presses Build & Run.
//
// CLEANUP IS BY PID - `spawnGuarded` + awaited `killTree`. No `pkill`.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:inert-control-silence
//
//   The copy is written to (a scene is created and saved is NOT called, but the
//   store is mutated), so a fresh copy per run is the honest habit.
//
//   PLANT=rot-selector   … end-anchor the curve picker's title regexp, so it
//                          matches nothing. [3a] must catch it and abort.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9462);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 92);
const ROOT = AURORA_DIR;
// WHICH BUILT TREE THIS RUNS AGAINST (O72) - a linked worktree has no dist/ of
// its own until it is built, and `announceRunRoot` says BORROWED when the tree
// carrying the build is not this one. A BORROWED run measures someone else's
// code and must not be read as a verdict on this branch.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself - never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-inert-control-silence`;
mkdirSync(SHOTS, { recursive: true });

const PLANT = process.env.PLANT ?? '';
const SCENE_ID = process.env.SCENE_ID ?? 'inert_control_silence';
// TWO NAMED FACTORS, both mid-list on purpose: `FACTOR_1` is the seed and
// `FACTOR_LOCKED`/`FACTOR_0` are an alias pair, so either could be greyed by an
// accident that had nothing to do with the rule under test.
const FB_A = process.env.FB_A ?? 'FACTOR_1_4';
const FB_B = process.env.FB_B ?? 'FACTOR_3_8';

// ---------------------------------------------------------------------------
// THE PACKED TRIPLE NO PUBLISHED NAME CLAIMS - DERIVED, NEVER TYPED.
//
// A typed triple goes quietly vacuous the day aeon publishes a name for it, and
// row [5b] would then be measuring the WRONG state while still printing PASS.
// The published set is read out of `factor-decode.ts`, which transcribes aeon's
// `parallax_dsl.emp:25-40` verbatim, and the first unclaimed triple in the 9-bit
// space is searched for. If the space were somehow full this THROWS rather than
// skipping the row: an unmeasurable control is not a green one.
// ---------------------------------------------------------------------------
function unpublishedTriple() {
  const src = readFileSync(`${ROOT}/src/core/formats/effects/factor-decode.ts`, 'utf8');
  const rows = [...src.matchAll(/FACTOR_[A-Z0-9_]+:\s*Object\.freeze\(\{\s*s1:\s*(\d+),\s*s2:\s*(\d+),\s*op:\s*(\d+)\s*\}\)/g)];
  if (rows.length < 10) {
    throw new Error(`factor-decode.ts yielded only ${rows.length} published triples - the parse rotted`);
  }
  const pack = (s1, s2, op) => ((op & 1) << 8) | ((s2 & 15) << 4) | (s1 & 15);
  const published = new Set(rows.map((m) => pack(+m[1], +m[2], +m[3])));
  for (let s1 = 0; s1 <= 15; s1++) {
    for (let s2 = 0; s2 <= 15; s2++) {
      for (const op of [0, 1]) {
        if (!published.has(pack(s1, s2, op))) return { s1, s2, op, published: published.size };
      }
    }
  }
  throw new Error('every 9-bit triple is a published factor - row 5b cannot be measured');
}

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

// `\b`, NEVER `$` - the live title carries an explanatory suffix, and five
// selectors in a sibling harness were caught matching nothing by end-anchoring.
const CURVE_SEL = (i) => (PLANT === 'rot-selector'
  ? `/^Layer ${i} curve\\.to$/`
  : `/^Layer ${i} curve\\.to\\b/`);
const FB_SEL = (i) => `/^Layer ${i} fb\\b/`;
const SEL_BY_TITLE = (re) => `[...document.querySelectorAll('select')].find((e) => ${re}.test(e.title || ''))`;

const SET_SELECT = (re, value) => String.raw`
(() => {
  const el = ${SEL_BY_TITLE(re)};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
    .set.call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

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
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const EXPAND_SECTION = (titleRe, openProbe) => String.raw`
(() => {
  const open = () => ${openProbe};
  if (open()) return 'already-open';
  const hdr = [...document.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer' && ${titleRe}.test((d.textContent || '').trim()))
    .pop();
  if (!hdr) return 'no-header';
  hdr.click();
  return open() ? 'clicked-open' : 'clicked-shut';
})()`;

// ---------------------------------------------------------------------------
// THE READER. It finds a LEAF element (no element children) whose own rendered
// text matches, then measures it against its NEAREST SCROLLER - never against
// the window, because a rect inside a window is exactly what an element
// scrolled out of its own pane still has.
// ---------------------------------------------------------------------------
const READ_PAINTED = (re) => String.raw`
(() => {
  const leaves = [...document.querySelectorAll('div, span, p')]
    .filter((d) => d.children.length === 0 && ${re}.test((d.textContent || '').trim()));
  if (leaves.length === 0) return { found: false, count: 0 };
  const el = leaves[leaves.length - 1];
  // BRING IT INTO VIEW FIRST, THEN MEASURE. Scrolling to the control you are
  // using is what a person does; being unable to reach it by scrolling is the
  // defect. The first run measured the policy row at y=1524 in a 1600px
  // viewport and called it unpainted, which was true of the SCROLL POSITION and
  // not of the sentence.
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  // ⚠ THE NEAREST CLIPPER, NOT THE NEAREST SCROLLER. An ancestor with
  // overflow:hidden clips without ever being scrollable, so a walk that looked
  // only for scrollHeight > clientHeight fell all the way through to the window
  // and compared against a box nothing was clipped by.
  let sc = el.parentElement;
  while (sc && getComputedStyle(sc).overflowY === 'visible'
         && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const raw = sc ? sc.getBoundingClientRect() : null;
  const box = raw
    ? { top: Math.max(raw.top, 0), bottom: Math.min(raw.bottom, window.innerHeight),
        left: Math.max(raw.left, 0), right: Math.min(raw.right, window.innerWidth) }
    : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
  const insideScroller = r.top >= box.top - 1 && r.bottom <= box.bottom + 1
    && r.left >= box.left - 1 && r.right <= box.right + 1;
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  const hitIsUs = hit !== null && (hit === el || el.contains(hit) || hit.contains(el));
  return {
    found: true, count: leaves.length, text: (el.textContent || '').trim(),
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    scroller: sc ? { top: Math.round(box.top), bottom: Math.round(box.bottom),
                     tag: sc.tagName, overflowY: getComputedStyle(sc).overflowY,
                     scrollTop: Math.round(sc.scrollTop) }
      : { top: 0, bottom: window.innerHeight, note: 'no clipper: measured against the window' },
    insideScroller, hitPoint: [cx, cy], hitIsUs,
    // EVIDENCE, NEVER THE GATE - both of these go green on an element scrolled
    // thousands of pixels out of its scroller.
    evidence: { checkVisibility: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
                clientRects: el.getClientRects().length },
  };
})()`;

async function main() {
  const t0 = Date.now();
  const TRIPLE = unpublishedTriple();
  console.log('=== inert-control-silence harness (EW-INERT-CONTROL-SILENCE, cold read C5) ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}   fb A=${FB_A}  fb B=${FB_B}`);
  console.log(`    unclaimed triple (derived from factor-decode.ts, ${TRIPLE.published} published): `
    + `s1=${TRIPLE.s1} s2=${TRIPLE.s2} op=${TRIPLE.op}`);

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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npx electron-vite build');
    if (!haveDbg) throw new Error('no __dbg - nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open the COPY, mount Effects, make a scene THROUGH THE UI. ----
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the COPIED aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open - nothing below can be measured');

    await sleep(2500);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    check('1b', 'the Effects facet mounts', clicked === true, `click → ${clicked}`);
    await sleep(1200);

    const typed = await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    const pressedNew = await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    const scenes = await c.json('window.__dbg.aeon.scenes()');
    check('1c', 'clicking New created the scene in the MODEL, not just on screen',
      typed === 'ok' && pressedNew === true && scenes.some((x) => x.id === SCENE_ID),
      `typed=${typed} new=${pressedNew}; ${scenes.length} scenes: ${JSON.stringify(scenes.map((x) => x.id))}`);
    const expanded = await c.evalExpr(EXPAND_SECTION('/^Layers \\(/',
      `[...document.querySelectorAll('select')].some((e) => /^Layer 0 fa\\b/.test(e.title || ''))`));
    await sleep(500);
    check('1d', 'the Layers section is OPEN, so its cards are on screen to be read',
      expanded === 'already-open' || expanded === 'clicked-open', `layers → ${expanded}`);

    // A TALLER VIEWPORT, because the section is the constraint and not the
    // feature: at the launch geometry the Layers section paints ~200px, which
    // cannot hold the control and the sentence under it at once. dpr is kept
    // NATIVE (`deviceScaleFactor: 0`); only the height changes.
    await c.send('Emulation.setDeviceMetricsOverride',
      { width: 1400, height: 1600, deviceScaleFactor: 0, mobile: false });
    await sleep(800);

    // ---- 2. Drive fb, and READ THE DOCUMENT BACK. ------------------------
    const setFb = await c.evalExpr(SET_SELECT(FB_SEL(0), FB_A));
    check('2a', `Plane B factor driven to ${FB_A}`, setFb === 'ok', `set → ${setFb}`);
    await sleep(500);
    const readDoc = async () => {
      const doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
      return doc.find((s) => s.id === SCENE_ID);
    };
    let scene = await readDoc();
    check('2b', `the DOCUMENT carries fb ${FB_A} on layer 0 (not just the widget)`,
      scene !== undefined && scene.layers[0].fb === FB_A,
      `layer 0 fb = ${JSON.stringify(scene && scene.layers[0].fb)}`);
    // ⚠ THE CONTROL THAT MAKES THIS A NEW CLAIM. `curveAdvisory` has said almost
    // these words since parcel H and fires ONLY on a document that already
    // carries the refused value. With no `curve` key there is nothing for it to
    // say, so anything §4 finds is the row's own permanent sentence.
    check('2c', 'the layer carries NO curve, so curveAdvisory is provably silent here',
      scene !== undefined && scene.layers[0].curve === undefined,
      `layer 0 curve = ${JSON.stringify(scene && scene.layers[0].curve)} (must be undefined)`);

    // ---- 3. The dead entry itself. ---------------------------------------
    const curve = await c.json(String.raw`
      (() => {
        const el = ${SEL_BY_TITLE(CURVE_SEL(0))};
        if (!el) return null;
        return { value: el.value, options: [...el.options].map((o) => ({
          value: o.value, label: o.textContent, disabled: o.disabled, title: o.title })) };
      })()`);
    check('3a', 'the curve picker was FOUND and holds a full option list',
      curve !== null && Array.isArray(curve.options) && curve.options.length > 3,
      curve === null ? 'NO ELEMENT MATCHED - selector rot' : `${curve.options.length} options`);
    if (curve === null) throw new Error('curve picker not found - rows 3b..7a cannot be measured');

    const dead = curve.options.filter((o) => o.disabled);
    check('3b', `exactly the layer's own fb is dead, and it is still OFFERED (never dropped)`,
      dead.length === 1 && dead[0].value === scene.layers[0].fb,
      `disabled: ${JSON.stringify(dead.map((o) => o.value))}; document fb = ${scene.layers[0].fb}`);

    // The label a person reads on the grey row. NOT a title: the title is
    // printed beside it only to show what the old, unreachable route carried.
    const label = dead.length === 1 ? dead[0].label : '';
    check('3c', "the dead option's own LABEL carries a reason, not just the word refused",
      label.startsWith(`${FB_A} (`)
      && !/\(engine refuses\)/.test(label)
      && /Plane B/.test(label),
      `label   = ${JSON.stringify(label)}\n        (title, for contrast, is the OLD unreachable route: `
      + `${JSON.stringify(dead.length === 1 ? dead[0].title : null)})`);

    // ---- 4. THE CLAIM: the sentence is PAINTED, with nothing hovered. -----
    // ⚠ A BROAD FINDER ON PURPOSE. An earlier cut searched for the exact phrase
    // this fix ships, which turned every PARTIAL break into a total one: a
    // generic "one entry is greyed" - the sentence a plausible simpler fix would
    // have written - vanished from the finder and aborted the run at [4a],
    // instead of being caught by [4b] as the naming failure it actually is.
    // Poison must resemble reality, so the finder must match the near-miss too.
    const painted = await c.json(READ_PAINTED(`/is greyed/`));
    check('4a', 'a sentence about the refusal is rendered in the page at all',
      painted.found === true, `matches=${painted.count} text=${JSON.stringify(painted.text ?? null)}`);
    if (!painted.found) throw new Error('no painted sentence - rows 4b..5c cannot be measured');

    check('4b', "it names THIS layer's refused value and gives the engine's reason",
      painted.text.includes(FB_A)
      && /so fb itself \(.*\) is greyed/.test(painted.text)
      && /a ramp with equal ends is refused by the build/.test(painted.text),
      `text = ${JSON.stringify(painted.text)}`);

    // ⚠ THE PAINT TEST. `checkVisibility()` and `getClientRects()` are printed
    // as evidence and are NOT the gate: both go green on an element scrolled
    // thousands of pixels out of its own scroller.
    check('4c', 'it is inside its own scroller\'s painted box AND hit-tests to itself',
      painted.insideScroller === true && painted.hitIsUs === true
      && painted.rect.w > 0 && painted.rect.h > 0,
      `rect=${JSON.stringify(painted.rect)} scroller=${JSON.stringify(painted.scroller)} `
      + `insideScroller=${painted.insideScroller} hitAt=${JSON.stringify(painted.hitPoint)} `
      + `hitIsUs=${painted.hitIsUs}\n        evidence (NOT the gate): `
      + `${JSON.stringify(painted.evidence)}`);

    check('4d', "it is the ROW's permanent hint, not curveAdvisory wearing its clothes",
      painted.text.startsWith("Plane B speed ramps from fb at this strip's top"),
      `starts: ${JSON.stringify(painted.text.slice(0, 80))} - and the document still carries no curve (2c)`);

    // ---- 5. Controls, in the SAME run. -----------------------------------
    await c.evalExpr(SET_SELECT(FB_SEL(0), FB_B));
    await sleep(600);
    scene = await readDoc();
    const moved = await c.json(READ_PAINTED(`/is greyed/`));
    check('5a', `the sentence FOLLOWS the layer: fb ${FB_B} now, and ${FB_A} is no longer named`,
      scene.layers[0].fb === FB_B && moved.found === true
      && moved.text.includes(FB_B) && !moved.text.includes(FB_A),
      `document fb = ${scene.layers[0].fb}\n        text = ${JSON.stringify(moved.found ? moved.text : null)}`);

    // The bare hint's own height, measured with the clause present.
    const withClause = moved.found ? moved.rect.h : null;

    // A PACKED TRIPLE NO NAME CLAIMS: the picker refuses nothing there, so the
    // clause must be gone. This is the structural gate under the height
    // argument - "it costs height only when there is something to say".
    await c.evalExpr(SET_SELECT(FB_SEL(0), '__packed__'));
    await sleep(500);
    const spun = await c.json(String.raw`
      (() => {
        const sel = ${SEL_BY_TITLE(FB_SEL(0))};
        if (!sel) return { ok: false, why: 'no fb select' };
        // The packed spinners live in the SAME wrapper as the fb select, so the
        // curve row's own expander cannot be driven by accident.
        const wrap = sel.parentElement;
        const nums = [...wrap.querySelectorAll('input[type=number]')];
        const ops = [...wrap.querySelectorAll('select')].filter((s) => /^op:/.test(s.title || ''));
        if (nums.length < 2 || ops.length < 1) return { ok: false, why: 'spinners not open', nums: nums.length };
        const setN = (el, v) => {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        setN(nums[0], ${TRIPLE.s1});
        setN(nums[1], ${TRIPLE.s2});
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(ops[0], '${TRIPLE.op}');
        ops[0].dispatchEvent(new Event('input', { bubbles: true }));
        ops[0].dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true };
      })()`);
    await sleep(800);
    scene = await readDoc();
    const gone = await c.json(READ_PAINTED(`/is greyed/`));
    const bare = await c.json(READ_PAINTED(`/^Plane B speed ramps from fb at this strip's top/`));
    check('5b', 'with fb on an UNCLAIMED packed triple nothing is refused, and the clause is GONE',
      spun.ok === true
      && typeof scene.layers[0].fb === 'object'
      && scene.layers[0].fb.s1 === TRIPLE.s1 && scene.layers[0].fb.s2 === TRIPLE.s2
      && gone.found === false && bare.found === true,
      `spun=${JSON.stringify(spun)} document fb = ${JSON.stringify(scene.layers[0].fb)}\n        `
      + `clause present? ${gone.found}   base hint still painted? ${bare.found} `
      + `${JSON.stringify(bare.found ? bare.text : null)}`);

    // ---- 5c. WHAT THE CLAUSE COSTS, at ONE geometry, in ONE run. ----------
    const withoutClause = bare.found ? bare.rect.h : null;
    const measurable = typeof withClause === 'number' && typeof withoutClause === 'number'
      && withClause > 0 && withoutClause > 0;
    check('5c', 'the height the clause costs was MEASURED (an unmeasurable cost is not a green one)',
      measurable,
      measurable
        ? `hint height with the clause = ${withClause}px, without = ${withoutClause}px, `
          + `COST = ${withClause - withoutClause}px per layer card at this geometry`
        : `could not measure: with=${withClause} without=${withoutClause}`);

    // ---- 6. The policy row's own dead entry. ------------------------------
    //
    // `sprite_mask` is the one option on this tab that is disabled
    // UNCONDITIONALLY. Its row only renders once the scene has a per-column V
    // deform (`leftColumnMaskRowVisible`), so the V deform is turned ON here
    // rather than the row being excluded for being absent.
    await c.evalExpr(SET_SELECT(FB_SEL(0), FB_A));
    await sleep(400);
    // ⚠ THE PROBE IS RE-READ AFTER A SLEEP, NOT IN THE CLICK'S OWN TICK. The
    // first run read `clicked-shut` from a header click that HAD worked: React
    // had not re-rendered yet, and the row below then drove a control this row
    // had just called absent. A probe that runs before the effect it is probing
    // for is a false negative that reads exactly like a real one.
    const V_DEFORM_PRESENT = `[...document.querySelectorAll('select')].some((e) => /^v_deform:/.test(e.title || ''))`;
    const sceneClick = await c.evalExpr(EXPAND_SECTION('/^Scene: /', V_DEFORM_PRESENT));
    await sleep(900);
    const sceneOpen = await c.evalExpr(V_DEFORM_PRESENT);
    check('6a', 'the SCENE card is open, so the V deform row is on screen to be driven',
      sceneOpen === true, `header → ${sceneClick}; v_deform row present after re-render: ${sceneOpen}`);
    const vOn = await c.evalExpr(SET_SELECT('/^v_deform:/', 'on'));
    await sleep(800);
    scene = await readDoc();
    check('6b', 'per-column V deform is ON in the document, so the policy row must exist',
      vOn === 'ok' && scene.v_deform !== undefined && scene.v_deform !== 'none',
      `set=${vOn} v_deform = ${JSON.stringify(scene.v_deform ?? null)}`);
    const policy = await c.json(String.raw`
      (() => {
        const el = [...document.querySelectorAll('select')].find((e) => /^left_column_mask:/.test(e.title || ''));
        if (!el) return null;
        return { options: [...el.options].map((o) => ({
          value: o.value, label: o.textContent, disabled: o.disabled })) };
      })()`);
    check('6c', 'the policy picker is on screen and greys sprite_mask, with a reason in its LABEL',
      policy !== null
      && policy.options.some((o) => o.value === 'sprite_mask' && o.disabled
        && o.label !== 'sprite_mask (engine refuses)' && /engine/.test(o.label)),
      policy === null ? 'NO left_column_mask PICKER FOUND'
        : JSON.stringify(policy.options.map((o) => [o.label, o.disabled])));
    const policyHint = await c.json(READ_PAINTED(`/sprite_mask is greyed/`));
    check('6d', "sprite_mask's reason is PAINTED under the row, with the way out named",
      policyHint.found === true
      && /left-column strip emission/.test(policyHint.text)
      && /factor0_lock or accept/.test(policyHint.text)
      && policyHint.insideScroller === true && policyHint.hitIsUs === true,
      `text = ${JSON.stringify(policyHint.found ? policyHint.text : null)}\n        `
      + `rect=${JSON.stringify(policyHint.rect ?? null)} inside=${policyHint.insideScroller} `
      + `hitIsUs=${policyHint.hitIsUs} evidence (NOT the gate)=${JSON.stringify(policyHint.evidence ?? null)}`);

    // ---- 7. The no-leak control. -----------------------------------------
    const planeHint = await c.json(READ_PAINTED(`/A = foreground, B = background/`));
    check('7a', 'the fa/fb rows, which refuse NOTHING, carry no refusal clause',
      planeHint.found === true && !/greyed/.test(planeHint.text),
      `text = ${JSON.stringify(planeHint.found ? planeHint.text : null)}`);

    // ---- 8. The photograph. ----------------------------------------------
    const env3 = await c.json('({ dpr: window.devicePixelRatio, inner: [window.innerWidth, window.innerHeight] })');
    console.log(`        CAPTURE ENV  dpr=${env3.dpr}  inner=${JSON.stringify(env3.inner)}  (height overridden; dpr native)`);
    const clip = await c.json(String.raw`
      (() => {
        const el = ${SEL_BY_TITLE(CURVE_SEL(0))};
        const leaves = [...document.querySelectorAll('div, span, p')]
          .filter((d) => d.children.length === 0 && /is greyed/.test((d.textContent || '').trim()));
        const adv = leaves[leaves.length - 1];
        if (adv) adv.scrollIntoView({ block: 'center' });
        const a = el.getBoundingClientRect();
        const b = (adv || el).getBoundingClientRect();
        const top = Math.floor(Math.min(a.top, b.top)) - 28;
        const bottom = Math.ceil(Math.max(a.bottom, b.bottom)) + 8;
        const left = Math.floor(Math.min(a.left, b.left)) - 96;
        const right = Math.ceil(Math.max(a.right, b.right)) + 8;
        return { x: left, y: top, width: right - left, height: bottom - top, foundAdvisory: !!adv };
      })()`);
    await sleep(500);
    console.log(`        CLIP      ${JSON.stringify(clip)}  <- integer, from the row's and the sentence's own rects`);
    const full = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/1-effects-panel.png`, Buffer.from(full.data, 'base64'));
    const clipped = await c.send('Page.captureScreenshot',
      { format: 'png', clip: { ...clip, scale: 3 } });
    writeFileSync(`${SHOTS}/2-curve-row-says-why.png`, Buffer.from(clipped.data, 'base64'));
    console.log(`        SHOT PATH ${SHOTS}/2-curve-row-says-why.png`);
    check('8a', 'both captures are real images, not a blank server',
      Buffer.from(clipped.data, 'base64').length > 5000
      && Buffer.from(full.data, 'base64').length > 20000,
      `clip ${Buffer.from(clipped.data, 'base64').length}B, full ${Buffer.from(full.data, 'base64').length}B`);
  } finally {
    try { c && c.close(); } catch { /* ignore */ }
    // BY PID ONLY. No `pkill` on a pattern anywhere in this file: from a
    // worktree that kills the owner's editor and spares this run's orphan.
    await killTree(child.pid);
  }

  console.log(`\n=== ${results.length} rows, ${fails.length} failed, ${((Date.now() - t0) / 1000).toFixed(1)}s ===`);
  if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
