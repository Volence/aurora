#!/usr/bin/env node
// WHAT GOVERNS THE HEIGHT OF THE BOX THE LAYER CARDS READ IN, AND HOW WOULD AN
// AUTHOR KNOW A SENTENCE HAD FALLEN OUT OF IT?
//
// EW-LAYER-CARD-SCROLLER. The row arrives as "a 163.5px sentence in a 149.5px
// box"; `docs/reviews/2026-09-05-plane-y-referent.md` already rewrote it once,
// because the advisory ALREADY on that row is the same height and also does not
// fit. This instrument exists because BOTH of the citations offered for that box
// name a constant that does not govern it:
//
//   the review     "a ~150px box (column-layout's LIST floor)" — column-layout
//                  declares no floor at all; its only 154 is a WIDTH in a prose
//                  comment about a select.
//   the row's own  `maxHeight: 154` on EffectsScenePanel's SCENE_LIST and
//   restatement    BandPresetPanel's PRESET_LIST — the SCENE picker and the
//                  PRESET picker. Neither is an ancestor of a layer card.
//
// So this harness does not cite the box. It WALKS TO IT from a sentence an
// author is reading and prints the whole chain, with each element's own
// computed overflow / height / flex / minHeight / maxHeight, so the constant
// that governs it is read off the running app.
//
// ═══ WHAT IT IS BUILT TO CATCH ═══
//
// 1. A HEIGHT WITHOUT ITS TEXT. Every advisory is reported as {height, chars}.
//    Two peers equal to the pixel is the shape of a selector that resolved to
//    one element twice, and only the character count can tell that from a
//    coincidence of near-equal texts.
// 2. A BOX MEASURED IN THE WRONG STATE. The layers list is `flex: 1 1 0`, so
//    its height is whatever the OTHER sections leave. Every measurement below
//    is taken twice — on arrival, and with the scene form open — and both are
//    printed, because a single figure would be one column state reported as the
//    design.
// 3. VISIBILITY THAT MEANS NOTHING. `checkVisibility()` and `getClientRects()`
//    both go green on an element scrolled far out of its scroller. Reachability
//    here is a comparison of the element's rect to THE SCROLLER'S box, and the
//    visibility trio is printed as evidence beside it, never as the gate.
// 4. A SECOND FACET THAT WAS NEVER MEASURED. The list floor is not this panel's
//    number: `SECTION_LIST_MIN_HEIGHT` lives in ui/CollapsibleSection and every
//    facet with a `variant="list"` section stands on it. Phase D measures the
//    OTHER facets' list sections, so a change to that number is measured where
//    it also lands.
//
// ⚠ NO EMULATOR, NO ROM BUILD, NO SAVE. Nothing here opens an Aether socket or
// presses Build and Run. The scene edits live in the app's memory. AEON_DIR must
// still name a disposable COPY, because "never saves" is a property of this file
// today and not of the application.
//
// RUN (both variables; without the second the resolver borrows the MAIN
// checkout's dist/ and the measurement is of an app this tree did not build):
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<a disposable aeon copy> \
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:layer-card-height

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9477);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEON_OVERRIDE = checkoutOverride('aeon');
const AEONDIR = AEON_OVERRIDE === null ? null : AEON_OVERRIDE.value;
const OUT = process.env.OUT ?? `${ROOT}/scratchpad/shots-layer-card-height`;
mkdirSync(OUT, { recursive: true });

if (!AEONDIR) throw new Error('AEON_DIR must name a DISPOSABLE aeon copy');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at the live aeon checkout. Point it at a copy.');
}

// ── THE CONTRACT, READ IN THIS PROCESS ──────────────────────────────────────
// Not typed as a literal. The floor is a number in ui/CollapsibleSection.tsx and
// several rows below are about whether a box is standing on it; a literal here
// would go stale silently the day it moves and would then assert nothing.
const SHELL_SRC = readFileSync(`${ROOT}/src/renderer/components/ui/CollapsibleSection.tsx`, 'utf8');
const FLOOR = (() => {
  const m = /const SECTION_LIST_MIN_HEIGHT = (\d+)/.exec(SHELL_SRC);
  if (!m) throw new Error('could not read SECTION_LIST_MIN_HEIGHT - the floor these rows are about');
  return Number(m[1]);
})();

/** Shipped, locked (v_factor 15), five layers. */
const SCENE_ID = process.env.SCENE_ID ?? 'ojz_act1_depth';
/** The layer the reach sentence goes on: top 80, next 112, so a 32-line band. */
const LAYER = 2;
const PLANE_Y = 96;

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
  results.push({ id, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> ${name}.png`);
}

const CLICK_BY_TEXT = (re, tag = 'button,div,span,a') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

const SET_CONTROL = (selector, value) => String.raw`
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

/**
 * THE CHAIN FROM A SENTENCE TO EVERY BOX THAT COULD BE CLIPPING IT.
 *
 * Not "find the scroller": that is the walk the prior row used, and it stops at
 * the FIRST overflowing ancestor, which tells you nothing about whether a second
 * one above it is also clipped. This walks all the way to `<body>` and reports
 * every level, so the answer to "which constant governs this box" is read rather
 * than cited.
 */
const CHAIN = (sel) => String.raw`
(() => {
  const el = ${sel};
  if (!el) return { found: false };
  const out = [];
  let n = el;
  for (let i = 0; n && n !== document.body && i < 20; i++) {
    const cs = getComputedStyle(n);
    const r = n.getBoundingClientRect();
    out.push({
      i,
      tag: n.tagName.toLowerCase(),
      testid: n.getAttribute('data-testid') || null,
      h: Math.round(r.height * 100) / 100,
      client: n.clientHeight,
      scroll: n.scrollHeight,
      overflowY: cs.overflowY,
      flex: cs.flex,
      minH: cs.minHeight,
      maxH: cs.maxHeight,
      // A scroller that is CLIPPING right now, as opposed to one that merely
      // declares it might.
      clipping: (cs.overflowY === 'auto' || cs.overflowY === 'scroll')
        && n.scrollHeight > n.clientHeight + 1,
      // What the user can SEE of that fact: the classic scrollbar's width. Zero
      // means the fact is admitted to script and to nobody else.
      barPx: n.offsetWidth - n.clientWidth,
    });
    n = n.parentElement;
  }
  return { found: true, chain: out };
})()`;

/**
 * EVERY PROSE BLOCK INSIDE ONE SCROLLING BOX, WITH ITS CHARACTER COUNT.
 *
 * ⚠ THE PREDICATE IS THE COMPONENT'S OWN SIGNATURE, NOT A GUESS ABOUT SHAPE.
 * The first version of this census filtered on `display: block` and "contains no
 * control", and that quietly excluded every `Advisory` in the panel, because an
 * Advisory renders a `<button>` (its "why this happens" disclosure) INSIDE the
 * hint. A census that cannot see the very component the fix is going to use
 * would have reported the fix as complete while the tallest blocks on screen
 * were the ones it could not count.
 *
 * `overflowWrap: anywhere` is `Hint`'s own declaration and column-layout's
 * docblock says in as many words that the LABEL column deliberately has none
 * ("there is deliberately no `overflowWrap`"), so the computed value identifies
 * a hint and nothing else. `Advisory` renders a `Hint`, so it is counted.
 *
 * EVERY HEIGHT COMES WITH ITS CHARACTER COUNT. Two blocks reporting the same
 * height to the pixel is the shape of a selector that resolved to one element
 * twice; only the text length can tell that from a coincidence of near-equal
 * prose.
 */
const BLOCKS = (bodySel) => String.raw`
(() => {
  const body = ${bodySel};
  if (!body) return { found: false };
  const r0 = body.getBoundingClientRect();
  const out = [];
  for (const n of body.querySelectorAll('div')) {
    if (getComputedStyle(n).overflowWrap !== 'anywhere') continue;
    // A hint nested inside a hint would be counted twice.
    if (n.parentElement && n.parentElement.closest
        && [...body.querySelectorAll('div')].some((o) => o !== n && o.contains(n)
             && getComputedStyle(o).overflowWrap === 'anywhere')) continue;
    const txt = (n.textContent || '').trim();
    const r = n.getBoundingClientRect();
    const disclosure = n.querySelector('button[aria-expanded]');
    out.push({
      testid: (n.querySelector('[data-testid]') || n).getAttribute('data-testid'),
      h: Math.round(r.height * 100) / 100,
      chars: txt.length,
      // An Advisory mechanism is display:none until opened, so its text is
      // in textContent and NOT in the height. Both are reported: a block that
      // is short because its mechanism is folded is a different thing from one
      // that is short because somebody deleted words.
      folded: disclosure ? disclosure.getAttribute('aria-expanded') === 'false' : null,
      text: txt.slice(0, 64),
    });
  }
  return {
    found: true,
    boxH: Math.round(r0.height * 100) / 100,
    boxClient: body.clientHeight,
    boxScroll: body.scrollHeight,
    // What the container admits about being cut, and what the eye can see of it.
    barPx: body.offsetWidth - body.clientWidth,
    blocks: out.sort((a, b) => b.h - a.h),
  };
})()`;

/**
 * THE COLUMN'S SECTIONS, STRUCTURALLY.
 *
 * `PanelHeader` is rendered by exactly one component (ui/CollapsibleSection), so
 * its computed signature identifies a titled section and nothing else, and the
 * header's grandparent is the section box. section-column-harness's derivation,
 * reused so this file carries no list of names.
 */
const SECTIONS = String.raw`
(() => {
  const heads = [...document.querySelectorAll('div')].filter((d) => {
    const cs = getComputedStyle(d);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && d.firstElementChild && d.firstElementChild.tagName === 'SPAN';
  });
  const out = [];
  for (const h of heads) {
    const box = h.parentElement && h.parentElement.parentElement;
    if (!box) continue;
    const r = box.getBoundingClientRect();
    if (r.width === 0) continue;
    const cs = getComputedStyle(box);
    const body = [...box.children].find((c) => c !== h.parentElement);
    out.push({
      title: (h.textContent || '').trim().slice(0, 40),
      x: Math.round(r.x),
      h: Math.round(r.height * 100) / 100,
      flexGrow: cs.flexGrow,
      minH: cs.minHeight,
      maxH: cs.maxHeight,
      bodyH: body ? Math.round(body.getBoundingClientRect().height * 100) / 100 : null,
      bodyScroll: body ? body.scrollHeight : null,
      bodyClient: body ? body.clientHeight : null,
      bodyOverflowY: body ? getComputedStyle(body).overflowY : null,
    });
  }
  return out.sort((a, b) => a.x - b.x || 0);
})()`;

async function main() {
  console.log('=== layer card height ===');
  console.log(`    aeon copy : ${AEONDIR}`);
  console.log(`    list floor: ${FLOOR}px - READ FROM ui/CollapsibleSection.tsx IN THIS PROCESS`);
  if (RUN.borrowed) throw new Error('run root is BORROWED - set AURORA_BUILT_TREE to this worktree');
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});

    let haveDbg = false;
    for (let i = 0; i < 40 && !haveDbg; i++) {
      haveDbg = await c.evalExpr('!!(window.__dbg && window.__dbg.aeon)').catch(() => false);
      if (!haveDbg) await sleep(500);
    }
    check('0a', 'this is a VITE_AURORA_DEBUG=1 build (window.__dbg.aeon exists)', haveDbg);
    if (!haveDbg) throw new Error('no __dbg - a blank React tree is the known worktree fault');

    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    await sleep(3500);
    const st = await c.json('window.__dbg.aeon.state()');
    check('0b', 'the aeon copy opened', st && st.open === true, JSON.stringify(st));

    check('0c', 'the Effects tab is reachable',
      (await c.evalExpr(CLICK_BY_TEXT(String.raw`/^Effects$/`))) === true);
    await sleep(1200);
    await c.evalExpr(CLICK_BY_TEXT(String.raw`/^Parallax$/`));
    await sleep(900);
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);
    await sleep(1200);

    note('window', JSON.stringify(await c.json(
      '({w: innerWidth, h: innerHeight, dpr: devicePixelRatio})')));
    note('[A] sections on arrival', JSON.stringify(await c.json(SECTIONS), null, 1));

    // Author the reach sentence, through the panel's own controls.
    await c.evalExpr(String.raw`
        (() => {
          const el = [...document.querySelectorAll('select')].find((s) =>
            /Layer ${LAYER} /.test(s.title || '')
            && [...s.options].map((o) => o.value).join(',') === 'none,ladder');
          if (!el) return 'no-element';
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
            .set.call(el, 'ladder');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return 'ok';
        })()`);
    await sleep(800);
    const planeIn = String.raw`[...document.querySelectorAll('input[type="number"]')]
      .find((e) => /Layer ${LAYER} rowRemap\.plane_y/.test(e.title || ''))`;
    await c.evalExpr(SET_CONTROL(planeIn, PLANE_Y));
    await sleep(700);
    const topIn = String.raw`[...document.querySelectorAll('input[type="number"]')]
      .find((e) => /^Layer ${LAYER} (Screen line|world_y)/.test(e.title || ''))`;
    await c.evalExpr(SET_CONTROL(topIn, 84));
    await sleep(1100);

    const reach = String.raw`document.querySelector('[data-testid="layer-${LAYER}-rowremap-reach"]')`;
    const chain = await c.json(CHAIN(reach));
    note('[B] the chain from the reach sentence outward', JSON.stringify(chain, null, 1));

    const bodySel = String.raw`(() => {
      const el = ${reach};
      let n = el;
      while (n && !(getComputedStyle(n).overflowY === 'auto')) n = n.parentElement;
      return n;
    })()`;
    // ── THE BOX, AND THE BOX THIS BOX MAY BECOME ─────────────────────────
    //
    // ⚠ THE BAR IS NOT THE BOX ON SCREEN. The layers section is `flex: 1 1 0`,
    // so its height is whatever the other sections leave AT THIS WINDOW SIZE. A
    // block measured against today's box passes on a tall window and is clipped
    // on a short one, with nothing to say which run was the honest one. The
    // shell publishes the answer: `SECTION_LIST_MIN_HEIGHT` is the least a list
    // section may ever be squeezed to, so the FLOOR minus this section's own
    // header is the smallest box this list can ever hand a block, and that is
    // the bar. Both numbers are printed; the header comes off the running app.
    const geom = await c.json(String.raw`
      (() => {
        const b = ${bodySel};
        if (!b) return { found: false };
        const section = b.parentElement;
        const sr = section.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return {
          found: true,
          section: Math.round(sr.height * 100) / 100,
          box: Math.round(br.height * 100) / 100,
          header: Math.round((sr.height - br.height) * 100) / 100,
          sectionMinH: getComputedStyle(section).minHeight,
          onTheFloor: Math.abs(sr.height - parseFloat(getComputedStyle(section).minHeight)) < 1,
        };
      })()`);
    check('1a', 'the box the layer cards read in was found, and it is the body of a list section '
      + 'standing on the shell floor this process read from source',
      geom.found === true && geom.header > 0 && parseFloat(geom.sectionMinH) === FLOOR,
      JSON.stringify(geom) + `  (floor from source: ${FLOOR}px)`);
    const BAR = Math.round((FLOOR - geom.header) * 100) / 100;
    note('the bar', `${BAR}px = the ${FLOOR}px floor minus this section's own ${geom.header}px `
      + `header. Today's box is ${geom.box}px, and it is bigger only because this window is.`);

    const census = await c.json(BLOCKS(bodySel));
    note('[C] every prose block in that box', JSON.stringify(census, null, 1));
    note('[C2] the column with the sentence authored', JSON.stringify(await c.json(SECTIONS), null, 1));
    await shot(c, '01-arrival-with-reach');

    // ANTI-VACUITY, both halves. A census that found nothing, or one that could
    // not see the component the fix uses, would pass every row beneath it.
    const tagged = census.blocks.filter((b) => b.testid !== null).map((b) => b.testid);
    check('1b', 'the census sees this panel\'s prose at all, and the two blocks this row is about '
      + 'are among them',
      census.found === true && census.blocks.length >= 20
      && tagged.includes(`layer-${LAYER}-rowremap-reach`)
      && tagged.includes(`layer-${LAYER}-rowremap-precondition`),
      `${census.blocks.length} blocks; tagged: ${JSON.stringify(tagged)}`);
    // ⚠ THE PREDICATE MUST BE ABLE TO SEE AN `Advisory`, or the fix below is
    // invisible to its own gate. The first draft of this census could not: it
    // filtered out anything containing a control, and an Advisory renders its
    // "why this happens" disclosure as a <button> INSIDE the hint.
    check('1c', 'and it can see an Advisory - a hint whose mechanism is folded behind a '
      + 'disclosure - rather than only a plain one',
      census.blocks.some((b) => b.folded !== null),
      `folded flags: ${JSON.stringify(census.blocks.map((b) => b.folded))}`);

    // ── THE PROPERTY ─────────────────────────────────────────────────────
    //
    // A scroller is a legitimate device while every INDIVISIBLE block inside it
    // fits: the author brings the part they want into view. It stops being one
    // the moment a single paragraph is taller than the box, because then NO
    // scroll position shows that paragraph whole and the reader has to hold its
    // top half in memory while fetching the bottom. The list's atom stopped
    // being a 24px row when prose moved into it, and nothing noticed.
    const overToday = census.blocks.filter((b) => b.h > census.boxH + 1);
    const overBar = census.blocks.filter((b) => b.h > BAR + 1);
    check('2a', 'no prose block in the layer cards is taller than the box on screen',
      overToday.length === 0,
      `box ${census.boxH}px; over it: ${JSON.stringify(overToday)}`);
    check('2b', 'no prose block is taller than the SMALLEST box this list can ever be given '
      + `(${BAR}px), which is the bar that does not move with the window`,
      overBar.length === 0,
      `bar ${BAR}px; tallest blocks: ${JSON.stringify(census.blocks.slice(0, 4))}`);

    // ── WHAT THE DOM ADMITS, AND WHAT IT HIDES ───────────────────────────
    //
    // The width axis one file over cannot admit an ellipsis at all: a select
    // clamps `scrollWidth`, so nothing about the element afterwards says
    // anything was cut. This axis is NOT that. The CONTAINER admits being cut,
    // to script and to the eye. What nothing admits is WHICH block is cut: a
    // clipped paragraph and a merely-long list produce the identical signal.
    const admits = await c.json(String.raw`
      (() => {
        const el = ${reach};
        const b = ${bodySel};
        // 'start', not 'center': centring a block TALLER than its box puts the
        // top ABOVE the box, the one position an author cannot start reading
        // from.
        el.scrollIntoView({ block: 'start' });
        const r = el.getBoundingClientRect();
        const s = b.getBoundingClientRect();
        return {
          container: { scroll: b.scrollHeight, client: b.clientHeight,
                       scrollbarPx: b.offsetWidth - b.clientWidth },
          block: { h: Math.round(r.height * 100) / 100,
                   topInside: r.top >= s.top - 1 && r.top < s.bottom,
                   bottomInside: r.bottom <= s.bottom + 1,
                   cutPx: Math.round(Math.max(0, r.bottom - s.bottom) * 100) / 100,
                   // Printed as EVIDENCE, never as a gate: both go green on a
                   // block scrolled far out of its scroller.
                   checkVisibility: el.checkVisibility ? el.checkVisibility() : null,
                   clientRects: el.getClientRects().length },
        };
      })()`);
    note('[V] what the container admits and what the block admits', JSON.stringify(admits, null, 1));
    check('3a', 'the CONTAINER admits being cut, and a reader can see it: scrollHeight exceeds '
      + 'clientHeight and a real scrollbar is drawn',
      admits.container.scroll > admits.container.client + 1 && admits.container.scrollbarPx > 0,
      JSON.stringify(admits.container));
    check('3b', 'scrollIntoView({block: "start"}) puts the block\'s TOP inside the box, so a block '
      + 'that still does not fit is a READING problem and not a reachability one',
      admits.block.topInside === true, JSON.stringify(admits.block));
    await shot(c, '02-tallest-block-at-top');

    // ── THE SECOND FACET ─────────────────────────────────────────────────
    //
    // ⚠ THE FLOOR IS NOT THIS PANEL'S NUMBER. `SECTION_LIST_MIN_HEIGHT` lives in
    // ui/CollapsibleSection and EVERY facet with a `variant="list"` section
    // stands on it, so a number moved here lands there too. The width axis one
    // file over has that written down: `LABEL_W` 64 -> 100 measured green on
    // effects-column-harness 25/25 and broke three controls on the panel next
    // door the same day, which is why anchor-authoring-harness [W0]-[W2] exists.
    // NOTHING WAS THE [W0] OF THE HEIGHT AXIS. Every instrument that reads this
    // floor - effects-column r9, effects-sub-tabs [4a] - reads it in the EFFECTS
    // column. These rows are that second measurement, and they also carry the
    // property above out of this panel: it is a claim about list sections, not
    // about layer cards.
    for (const tab of ['Layout', 'Rings', 'Objects']) {
      const clicked = await c.evalExpr(CLICK_BY_TEXT(`/^${tab}$/`));
      await sleep(1500);
      const facet = await c.json(String.raw`
        (() => {
          const heads = [...document.querySelectorAll('div')].filter((d) => {
            const cs = getComputedStyle(d);
            return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
              && d.firstElementChild && d.firstElementChild.tagName === 'SPAN';
          });
          const out = [];
          for (const h of heads) {
            const sec = h.parentElement && h.parentElement.parentElement;
            if (!sec) continue;
            const cs = getComputedStyle(sec);
            if (cs.flexGrow !== '1') continue;          // a list section, structurally
            const r = sec.getBoundingClientRect();
            // The Explorer is persistent and its groups are titled sections too;
            // a run that forgot this would measure it once per facet and report
            // three green columns that are all the same column.
            if (r.width === 0 || r.x < 300) continue;
            const body = [...sec.children].find((k) => k !== h.parentElement);
            const bh = body ? body.getBoundingClientRect().height : null;
            const blocks = [];
            if (body) {
              for (const n of body.querySelectorAll('div')) {
                if (getComputedStyle(n).overflowWrap !== 'anywhere') continue;
                const rr = n.getBoundingClientRect();
                blocks.push({ h: Math.round(rr.height * 100) / 100,
                              chars: (n.textContent || '').trim().length });
              }
            }
            out.push({
              title: (h.textContent || '').trim().slice(0, 28),
              section: Math.round(r.height * 100) / 100,
              floor: parseFloat(cs.minHeight),
              onTheFloor: Math.abs(r.height - parseFloat(cs.minHeight)) < 1,
              box: bh === null ? null : Math.round(bh * 100) / 100,
              boxScroll: body ? body.scrollHeight : null,
              header: bh === null ? null : Math.round((r.height - bh) * 100) / 100,
              blocks,
            });
          }
          return out;
        })()`);
      note(`[S] ${tab} facet, its list sections`,
        `${clicked ? '' : 'TAB NOT CLICKED  '}${JSON.stringify(facet)}`);
      check(`4${tab[0].toLowerCase()}`, `${tab}'s list sections stand on the same ${FLOOR}px floor, `
        + 'and no prose block in one is taller than the smallest box that floor allows',
        clicked === true && facet.length > 0
        && facet.every((s) => s.floor === FLOOR)
        && facet.every((s) => s.blocks.every((b) => b.h <= FLOOR - s.header + 1)),
        JSON.stringify(facet));
    }
    await c.evalExpr(CLICK_BY_TEXT(String.raw`/^Effects$/`));
    await sleep(1400);
    await c.evalExpr(CLICK_BY_TEXT(String.raw`/^Parallax$/`));
    await sleep(900);
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);
    await sleep(1300);

    // ── WHICH DECLARATION IS ACTUALLY BINDING ────────────────────────────
    //
    // Not inferred from the stylesheet: one property at a time is relaxed on
    // the LIVE element and the box is re-measured, then put back. A property
    // whose removal does not move the box was not the one holding it. This is
    // the row that kills "make the box bigger": if the column has spare height
    // the section is not taking, some declaration is holding it back and the
    // parcel is a tuning job. If the children already sum to the column, there
    // is no pixel to find and the content is the only variable left.
    const bind = await c.json(String.raw`
      (() => {
        const el = ${reach};
        let body = el; while (body && getComputedStyle(body).overflowY !== 'auto') body = body.parentElement;
        const section = body.parentElement;
        const column = section.parentElement;
        const cs = getComputedStyle(column);
        const kids = [...column.children].map((k) => {
          const r = k.getBoundingClientRect();
          const ks = getComputedStyle(k);
          return { h: Math.round(r.height * 100) / 100, flex: ks.flex,
                   minH: ks.minHeight, maxH: ks.maxHeight,
                   text: (k.textContent || '').trim().slice(0, 28) };
        });
        const measure = () => ({ body: Math.round(body.getBoundingClientRect().height * 100) / 100,
                                 section: Math.round(section.getBoundingClientRect().height * 100) / 100 });
        const relax = (node, prop, value) => {
          const had = node.style[prop];
          node.style[prop] = value;
          const got = measure();
          node.style[prop] = had;
          return got;
        };
        return {
          column: { h: Math.round(column.getBoundingClientRect().height * 100) / 100,
                    client: column.clientHeight, scroll: column.scrollHeight,
                    display: cs.display, dir: cs.flexDirection, overflowY: cs.overflowY },
          kids,
          kidSum: Math.round(kids.reduce((a, k) => a + k.h, 0) * 100) / 100,
          before: measure(),
          sectionMaxHeightNone: relax(section, 'maxHeight', 'none'),
          sectionFlexBasisAuto: relax(section, 'flexBasis', 'auto'),
          bodyFlexGrow1: relax(body, 'flexGrow', '1'),
        };
      })()`);
    note('[E] the column, its children, and what each cap is worth when relaxed',
      JSON.stringify(bind, null, 1));
    check('5a', 'THE COLUMN HAS NOTHING SPARE: its children already sum to its own height, so the '
      + 'list section is taking every pixel there is and no cap is holding it back',
      Math.abs(bind.kidSum - bind.column.h) < 1
      && bind.sectionMaxHeightNone.body === bind.before.body
      && bind.sectionFlexBasisAuto.body === bind.before.body
      && bind.bodyFlexGrow1.body === bind.before.body,
      `column ${bind.column.h}px, children sum ${bind.kidSum}px; relaxing max-height -> `
      + `${bind.sectionMaxHeightNone.body}, flex-basis -> ${bind.sectionFlexBasisAuto.body}, `
      + `body flex-grow -> ${bind.bodyFlexGrow1.body} (all against ${bind.before.body})`);
    check('5b', 'and the section is ABOVE the shell floor, so the floor is not what is squeezing '
      + 'it either: raising that number would only make this column overflow',
      bind.before.section > FLOOR,
      `section ${bind.before.section}px against a ${FLOOR}px floor`);

  } finally {
    if (c) c.close();
    await killTree(child);
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} rows`);
  if (fails.length) { console.log(fails.join('\n')); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
