#!/usr/bin/env node
// THE PARALLAX PREVIEW ARRIVES ON, AND STAYS OFF WHEN YOU TURN IT OFF —
// EW-SHAPE-PREVIEW, the third and last clause of the owner's
// `three_sub_tabs_plus_section_strip` ruling (decisions.jsonl d-26b).
//
// ============================================================================
// WHY A HARNESS AND NOT A NODE ROW
// ============================================================================
//
// `src/renderer/providers/__tests__/parallax-preview.test.ts` pins the RULE:
// a pure function of (facet, sub-tab, choice), the choice's permanence, and two
// structural claims read out of the source. It is 22 rows and it cannot see any
// of the four things this parcel actually promises, because the node suite has
// no canvas, no View menu and no facet bar:
//
//   1. ON BY DEFAULT MEANS PIXELS. A flag that reads `true` while nothing is
//      composited is the defect the curve-editor parcel already found once in
//      this exact feature: `blits` counted 81 real `drawImage` calls, the report
//      said `active: true`, ~5,300 node tests were green, and the author saw a
//      black rectangle. So [2b] requires the composite's own blit count, and
//      [2c] requires the pixels to differ from a run with the preview off.
//   2. THE OTHER FACETS ARE UNAFFECTED — SHOWN, NOT ASSUMED. Section 3 walks
//      the facet bar and, in each one, asks the canvas AND the View menu.
//   3. "IT KEEPS DOING THAT" IS THE THING TO DISPROVE. Section 4 turns the
//      preview off and then does every returning gesture there is: the other
//      sub-tabs, another facet, and a full application reload.
//   4. THE TWO SWITCHES CANNOT DISAGREE. Section 5 reads the chip and the menu
//      checkbox in the same breath, in three states.
//
// ============================================================================
// ⚠ THE TRAPS THIS FILE IS WRITTEN AROUND
// ============================================================================
//
// ⚠ THE DEFAULT CAN BE ANSWERED BY THIS HARNESS'S OWN HISTORY. The author's
// choice is persisted in localStorage on purpose (shell/preview-pref), and
// section 4 records one. Every row that measures the DEFAULT therefore runs
// after an explicit `localStorage.clear()` and a reload, and [2a] asserts
// `choice === null` in the same breath as `on === true` — a default that is
// really a stored `true` fails that row rather than passing this one.
//
// ⚠ AN ABSENCE ROW WITH NO PRESENCE BESIDE IT PASSES WHEN THE FINDER IS BROKEN.
// "the composite is not in Layout's View menu" is true of a menu that never
// opened, of a selector that matches nothing, and of an app that failed to
// start. Every absence row below finds a control that IS in that same menu, in
// the same evaluation, and reports both.
//
// ⚠ `checkVisibility()` AND `getClientRects()` BOTH GO GREEN ON AN ELEMENT
// SCROLLED OUT OF ITS OWN SCROLLER — measured in this repo. The chip rows
// compare the chip's rect to the TOOL BAR'S box and require a strict
// `elementFromPoint`; the trio is printed as evidence and is never the gate.
//
// ⚠ NO EMULATOR, EVER. Nothing here says what any of this looks like running.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:effects-preview-default
//
//   PLANT=rot-report  … read the composite through a report key nothing
//                       publishes. [2b] must catch it and the run must ABORT.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9467);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 97);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-preview-default`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';

// ── THE CONTRACT, READ IN THIS PROCESS ───────────────────────────────────────
//
// The View-menu label and the sub-tab the default is scoped to are both facts
// of the application, and a literal here would go stale silently the day either
// moves — which is how a row about a missing control starts asserting that a
// renamed one is missing. Read from the app's own source.
const MENU_LABEL = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/shell/ViewMenu.tsx`, 'utf8');
  const m = /PARALLAX_PREVIEW_LABEL = '([^']+)'/.exec(src);
  if (!m) throw new Error('could not read PARALLAX_PREVIEW_LABEL from ViewMenu.tsx');
  return m[1];
})();
const DEFAULT_TAB = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/providers/parallax-preview.ts`, 'utf8');
  const m = /PREVIEW_DEFAULT_TAB = '(\w+)'/.exec(src);
  if (!m) throw new Error('could not read PREVIEW_DEFAULT_TAB from parallax-preview.ts');
  return m[1];
})();
/** A control that IS in every aeon View menu — the anti-vacuous half of §3. */
const CONTROL_LABEL = 'Screen frame (';

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

const CLICK_TAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-tab';
  t.click();
  return 'ok';
})()`;

/** The app's OWN answer for what is on, plus its three inputs, side by side. */
const STATE = 'window.__dbg.parallaxPreview()';

/**
 * The composite's own report — `active`, and the number of real `drawImage`
 * calls the last painted frame made.
 *
 * ⚠ `blits` IS THE GATE AND `active` IS NOT ENOUGH. The curve-editor parcel
 * found this feature reporting `active: true` with 81 blits while the author
 * saw black, because something else cleared the canvas afterwards. `active`
 * alone would have gone green on that build.
 */
const REPORT = PLANT === 'rot-report'
  ? 'window.__dbg.aeon.cameraPreviewXXX()'
  : 'window.__dbg.aeon.cameraPreview()';

/**
 * THE `Parallax preview` CHIP: its state, and whether it is really on screen.
 *
 * `Chip active` is a style, so the ON/OFF signal read here is the chip's own
 * TITLE — the two branches share no opening word ("Stop compositing…" /
 * "Draw the real background…"), which is a fact of the component and is
 * asserted as such by [5a] before any row leans on it.
 */
const CHIP = String.raw`(() => {
  const chip = [...document.querySelectorAll('button')]
    .find((b) => /^Parallax preview$/.test((b.textContent || '').trim()));
  if (!chip) return { found: false };
  const bar = chip.parentElement;
  const r = chip.getBoundingClientRect();
  const br = bar.getBoundingClientRect();
  const hit = document.elementFromPoint(
    Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return {
    found: true,
    title: chip.title,
    saysOn: /^Stop compositing/.test(chip.title),
    saysOff: /^Draw the real background/.test(chip.title),
    // The gate: the chip's box against ITS SCROLLER'S box, plus a strict hit.
    insideBar: r.top >= br.top - 1 && r.bottom <= br.bottom + 1
      && r.left >= br.left - 1 && r.right <= br.right + 1,
    hitIsChip: hit === chip || chip.contains(hit),
    // Recorded, NEVER the gate — both go green on an element scrolled clean out
    // of its own scroller.
    visible: typeof chip.checkVisibility === 'function' ? chip.checkVisibility() : null,
    rects: chip.getClientRects().length,
  };
})()`;

const CLICK_VIEW_BUTTON = String.raw`
(() => {
  const b = [...document.querySelectorAll('button')]
    .find((e) => /(^|\s)View(\s|$)/.test((e.textContent || '').trim()));
  if (!b) return 'no-view-button';
  b.click();
  return true;
})()`;

/** Does this facet have a View menu at all? Not every one does — see [3c]. */
const HAS_VIEW_BUTTON = String.raw`
(() => [...document.querySelectorAll('button')]
  .some((e) => /(^|\s)View(\s|$)/.test((e.textContent || '').trim())))()`;

/**
 * WHAT THE OPEN View MENU CONTAINS — the parallax row AND a control that must
 * be in every aeon View menu, read in ONE evaluation.
 *
 * The pair is the point: an absence reported without a presence beside it is a
 * finder that broke, a menu that never opened and a genuinely scoped control,
 * all printing the same output.
 */
const MENU = String.raw`(() => {
  const labels = [...document.querySelectorAll('label')]
    .filter((l) => l.querySelector('input[type=checkbox]'));
  const row = labels.find((l) => (l.textContent || '').trim() === ${JSON.stringify(MENU_LABEL)});
  const control = labels.find((l) => (l.textContent || '').trim()
    .startsWith(${JSON.stringify(CONTROL_LABEL)}));
  return {
    rows: labels.length,
    parallax: row ? { checked: row.querySelector('input').checked } : null,
    control: control ? { checked: control.querySelector('input').checked } : null,
    all: labels.map((l) => (l.textContent || '').trim()),
  };
})()`;

/**
 * OPEN THE View MENU, READ IT, CLOSE IT — and this helper is here because the
 * FIRST version of this file got it wrong and [3c] caught it.
 *
 * ⚠ THE MENU BUTTON IS A TOGGLE AND `document.body.click()` DOES NOT CLOSE IT.
 * With a body-click as the close, every SECOND facet's "open" click shut a menu
 * that was already open, and the read came back with `rows: 0` — an empty menu,
 * in which the parallax row is absent for the most boring possible reason. The
 * absence half of [3c] passed on those facets and the PRESENCE half did not,
 * which is the entire reason that row carries a presence half: the measured
 * result was 14/0/14/0/14/1 rows across six facets, an alternation no scoping
 * rule could produce.
 *
 * So: click, verify the menu really came up, click again to try once more if it
 * did not, and close with the button that opened it.
 */
async function readMenu(c) {
  const hasButton = await c.evalExpr(HAS_VIEW_BUTTON);
  if (hasButton !== true) {
    return { rows: 0, parallax: null, control: null, all: [], hasButton: false };
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    await c.evalExpr(CLICK_VIEW_BUTTON);
    await sleep(500);
    const m = await c.json(MENU);
    if (m.rows > 0) {
      await c.evalExpr(CLICK_VIEW_BUTTON);   // the same toggle, closed
      await sleep(300);
      return { ...m, hasButton: true };
    }
  }
  return { rows: 0, parallax: null, control: null, all: [], hasButton: true, neverOpened: true };
}

const CLICK_MENU_ROW = String.raw`(() => {
  const l = [...document.querySelectorAll('label')]
    .find((e) => (e.textContent || '').trim() === ${JSON.stringify(MENU_LABEL)});
  if (!l) return 'no-row';
  l.querySelector('input[type=checkbox]').click();
  return 'ok';
})()`;

/** The facet pills the bar is offering, by name. */
const FACETS = String.raw`(() => [...document.querySelectorAll('button')]
  .map((b) => (b.textContent || '').trim())
  .filter((t) => /^(Layout|Objects|Rings|Collision|Effects|Palette|Art|Blocks|Chunks)$/.test(t)))()`;

async function main() {
  const t0 = Date.now();
  console.log('=== effects-preview-default harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log(`    menu label  : "${MENU_LABEL}"  — READ FROM ViewMenu.tsx IN THIS PROCESS`);
  console.log(`    default tab : ${DEFAULT_TAB}     — READ FROM parallax-preview.ts IN THIS PROCESS`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-n', String(DISPLAY_NUM), '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main],
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

    const openProject = async () => {
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
      for (let i = 0; i < 40; i++) {
        const s = await c.json('window.__dbg.aeon.state()').catch(() => null);
        if (s && s.open) return s;
        await sleep(400);
      }
      return null;
    };
    /** A FIRST-RUN ARRIVAL: no stored choice, no stored disclosures, reloaded. */
    const coldArrival = async () => {
      await c.evalExpr('localStorage.clear()');
      await c.send('Page.reload');
      await sleep(4000);
      await waitDbg();
      const st = await openProject();
      await sleep(2500);
      await c.evalExpr(clickByText('/^Effects$/'));
      await sleep(1800);
      return st;
    };

    const st = await coldArrival();
    check('1a', 'the COPIED aeon project is open, with the nine sections this act has',
      !!(st && st.open && st.sections === 9), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');

    // ---- 2. ON BY DEFAULT, ON THE PARALLAX SUB-TAB ------------------------
    const arrival = await c.json(STATE);
    check('2a', '⚠ ON BY DEFAULT: arriving on the Effects tab the composite is ON — and the '
      + 'author has recorded NO CHOICE, so it is the default speaking and not a stored yes',
      arrival.on === true && arrival.choice === null
      && arrival.subTab === DEFAULT_TAB && arrival.facet === 'parallax',
      JSON.stringify(arrival));

    const painted = await c.json(REPORT);
    check('2b', '⚠ AND IT IS PIXELS, NOT A FLAG: the composite reports active with real blits '
      + '— `active` alone went green once on a build that painted black over it',
      painted.active === true && painted.blits > 0 && typeof painted.sceneId === 'string',
      JSON.stringify({ active: painted.active, blits: painted.blits, sceneId: painted.sceneId,
        camX: painted.camX, bands: (painted.bands || []).length }));
    if (painted.active !== true) {
      throw new Error('the composite is not drawing on arrival — nothing below can be measured');
    }

    // THE DEFAULT IS THE SUB-TAB'S, and this is the row that says so: the same
    // undecided author, one click away, gets no composite on the other jobs.
    await c.evalExpr(CLICK_TAB('colour'));
    await sleep(1200);
    const onColour = await c.json(STATE);
    const colourReport = await c.json(REPORT);
    await c.evalExpr(CLICK_TAB('tileAnim'));
    await sleep(1200);
    const onTileAnim = await c.json(STATE);
    await c.evalExpr(CLICK_TAB(DEFAULT_TAB));
    await sleep(1200);
    const backOnParallax = await c.json(STATE);
    check('2c', 'the default is scoped to the PARALLAX job: undecided, it is off on Colour and '
      + 'Tile anim and on again on Parallax — measured in one pass, so "off everywhere" '
      + 'cannot pass this row',
      onColour.on === false && onColour.choice === null
      && colourReport.active === false && colourReport.blits === 0
      && onTileAnim.on === false && backOnParallax.on === true,
      `colour=${JSON.stringify(onColour)} report=${JSON.stringify({ active: colourReport.active, blits: colourReport.blits })}`
      + ` tileAnim=${JSON.stringify(onTileAnim)} back=${JSON.stringify(backOnParallax)}`);

    // ---- 3. THE OTHER FACETS ARE UNAFFECTED — SHOWN, NOT ASSUMED ----------
    const facets = await c.json(FACETS);
    const others = facets.filter((f) => f !== 'Effects');
    check('3a', '[anti-vacuous] the facet bar offers Effects and at least three other facets to '
      + 'check it against', facets.includes('Effects') && others.length >= 3,
      JSON.stringify(facets));

    const perFacet = [];
    for (const facet of others) {
      await c.evalExpr(clickByText(`/^${facet}$/`));
      await sleep(1200);
      const s = await c.json(STATE);
      const rep = await c.json(REPORT);
      const menu = await readMenu(c);
      perFacet.push({ facet, on: s.on, choice: s.choice, active: rep.active, blits: rep.blits,
        menuRow: menu.parallax, menuControl: menu.control, menuRows: menu.rows,
        hasMenu: menu.hasButton });
    }
    check('3b', '⚠ TAB-SCOPED: in every other facet the composite is OFF and paints nothing — '
      + 'and the author still has recorded no choice, so this is the scope refusing and not '
      + 'a value someone set',
      perFacet.length > 0 && perFacet.every((f) => f.on === false && f.choice === null
        && f.active === false && f.blits === 0),
      JSON.stringify(perFacet.map((f) => ({ f: f.facet, on: f.on, active: f.active, blits: f.blits }))));

    // ⚠ NOT EVERY FACET HAS A View MENU, and this row learned that the hard
    // way: `Art` has no View button at all, so it read an empty menu and the
    // first version of this row called that a broken finder — correctly, on the
    // information it had. A facet with no menu cannot offer the composite, and
    // saying so is a different fact from "the menu opened and the row was not
    // in it". Both are counted, and the STRONG half has to be the majority: if
    // every facet fell into the no-menu bucket this row would be measuring
    // nothing at all.
    const measured = perFacet.filter((f) => f.hasMenu && f.menuRows > 0);
    const noMenu = perFacet.filter((f) => !f.hasMenu);
    check('3c', '⚠ AND NO OTHER FACET\'S View MENU OFFERS IT — with the SAME finder proving, in '
      + `the same evaluation, that "${CONTROL_LABEL}…" IS in each menu that opened`,
      measured.length >= 3
      && measured.every((f) => f.menuRow === null && f.menuControl !== null)
      && noMenu.every((f) => f.menuRow === null)
      && measured.length + noMenu.length === perFacet.length,
      `${measured.length} facet(s) with a View menu, ${noMenu.length} without: `
      + JSON.stringify(perFacet.map((f) => ({ f: f.facet, hasMenu: f.hasMenu, rows: f.menuRows,
        parallaxRow: f.menuRow, control: f.menuControl }))));

    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1500);
    const backInEffects = await c.json(STATE);
    const backReport = await c.json(REPORT);
    const effectsMenu = await readMenu(c);
    check('3d', 'and coming back to Effects it is on again, with the row present and TICKED in '
      + 'this facet\'s View menu — the trip through four facets consumed nothing',
      backInEffects.on === true && backInEffects.choice === null
      && backReport.active === true && backReport.blits > 0
      && effectsMenu.parallax !== null && effectsMenu.parallax.checked === true,
      `${JSON.stringify(backInEffects)} report=${JSON.stringify({ active: backReport.active, blits: backReport.blits })}`
      + ` menu=${JSON.stringify(effectsMenu.parallax)}`);

    // ---- 4. "IT KEEPS DOING THAT" — the row this parcel exists to fail ----
    const chipBefore = await c.json(CHIP);
    check('4a', 'the `Parallax preview` chip is painted inside the tool bar, hit-testable, and '
      + 'says the preview is ON',
      chipBefore.found === true && chipBefore.insideBar === true && chipBefore.hitIsChip === true
      && chipBefore.saysOn === true && chipBefore.saysOff === false,
      `${JSON.stringify(chipBefore)}\n        ⚠ the two that do NOT discriminate: `
      + `checkVisibility=${chipBefore.visible} rects=${chipBefore.rects}`);

    await c.evalExpr(clickByText('/^Parallax preview$/'));
    await sleep(1200);
    const afterOff = await c.json(STATE);
    const offReport = await c.json(REPORT);
    check('4b', 'one click turns it off: the choice is RECORDED as false (not as `true`, which '
      + 'is what a toggle of the stored `null` would have written) and the canvas stops',
      afterOff.on === false && afterOff.choice === false
      && offReport.active === false && offReport.blits === 0,
      `${JSON.stringify(afterOff)} report=${JSON.stringify({ active: offReport.active, blits: offReport.blits })}`);

    // Every gesture a person calls "coming back".
    await c.evalExpr(CLICK_TAB('colour'));
    await sleep(900);
    await c.evalExpr(CLICK_TAB(DEFAULT_TAB));
    await sleep(1200);
    const afterSubTabRoundTrip = await c.json(STATE);
    await c.evalExpr(clickByText(`/^${others[0]}$/`));
    await sleep(1000);
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1500);
    const afterFacetRoundTrip = await c.json(STATE);
    const afterFacetReport = await c.json(REPORT);
    check('4c', '⚠ AND IT STAYS OFF WHEN HE COMES BACK — through the other sub-tab, and out to '
      + 'another facet and back. This is the row a default that re-asserted itself would fail, '
      + 'and it is the defect people describe as "it keeps doing that"',
      afterSubTabRoundTrip.on === false && afterSubTabRoundTrip.choice === false
      && afterFacetRoundTrip.on === false && afterFacetRoundTrip.choice === false
      && afterFacetReport.active === false,
      `subTabs=${JSON.stringify(afterSubTabRoundTrip)} facets=${JSON.stringify(afterFacetRoundTrip)}`);

    // THE SESSION BOUNDARY. A reload is a fresh renderer: the store is rebuilt
    // from scratch and the only thing that can carry the answer across is the
    // written-down choice.
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();
    await openProject();
    await sleep(2500);
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1800);
    const afterReload = await c.json(STATE);
    const reloadReport = await c.json(REPORT);
    check('4d', '⚠ AND IT SURVIVES A RESTART: after a full reload — a new renderer, a store '
      + 'built from nothing — the composite is still off and the choice is still recorded',
      afterReload.on === false && afterReload.choice === false
      && afterReload.subTab === DEFAULT_TAB && reloadReport.active === false,
      `${JSON.stringify(afterReload)} report=${JSON.stringify({ active: reloadReport.active, blits: reloadReport.blits })}`);

    // ---- 5. THE TWO SWITCHES CANNOT DISAGREE ------------------------------
    const chipOff = await c.json(CHIP);
    // Opened, read, OPERATED, closed — through the same toggle `readMenu` uses.
    let menuOff = { rows: 0, parallax: null };
    for (let attempt = 0; attempt < 2 && menuOff.rows === 0; attempt++) {
      await c.evalExpr(CLICK_VIEW_BUTTON);
      await sleep(500);
      menuOff = await c.json(MENU);
    }
    await c.evalExpr(CLICK_MENU_ROW);
    await sleep(1000);
    await c.evalExpr(CLICK_VIEW_BUTTON);
    await sleep(600);
    const afterMenuOn = await c.json(STATE);
    const menuOnReport = await c.json(REPORT);
    const chipOn = await c.json(CHIP);
    check('5a', 'the chip and the menu checkbox are ONE switch: both read OFF, the MENU turns it '
      + 'back on, and the CHIP is the thing that changes — in three states, so a chip whose '
      + 'title never changed could not pass',
      chipOff.saysOff === true && chipOff.saysOn === false
      && menuOff.parallax !== null && menuOff.parallax.checked === false
      && afterMenuOn.on === true && afterMenuOn.choice === true
      && menuOnReport.active === true && menuOnReport.blits > 0
      && chipOn.saysOn === true && chipOn.saysOff === false,
      `chipOff=${JSON.stringify({ saysOff: chipOff.saysOff, saysOn: chipOff.saysOn })}`
      + ` menuOff=${JSON.stringify(menuOff.parallax)} state=${JSON.stringify(afterMenuOn)}`
      + ` chipOn=${JSON.stringify({ saysOn: chipOn.saysOn })}`);

    // An explicit YES is a choice too, and it holds on the jobs the DEFAULT
    // says nothing about — which is what makes the choice facet-wide and the
    // default sub-tab-scoped, and is the pair [2c] is the other half of.
    await c.evalExpr(CLICK_TAB('colour'));
    await sleep(1200);
    const yesOnColour = await c.json(STATE);
    const yesReport = await c.json(REPORT);
    await c.evalExpr(CLICK_TAB(DEFAULT_TAB));
    await sleep(1000);
    check('5b', 'an explicit YES holds on the Colour job, where the DEFAULT was a no — the '
      + 'choice is facet-wide and only the default is scoped to Parallax',
      yesOnColour.on === true && yesOnColour.choice === true
      && yesReport.active === true && yesReport.blits > 0,
      `${JSON.stringify(yesOnColour)} report=${JSON.stringify({ active: yesReport.active, blits: yesReport.blits })}`);

    // ---- 6. THE CAPTURE FOR THE OWNER -------------------------------------
    // ⚠ FROM A COLD ARRIVAL, because the arrival state is what every row above
    // is about and the one he will meet. He has not seen any of this built.
    await coldArrival();
    const shotState = await c.json(STATE);
    const shotReport = await c.json(REPORT);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    const path = `${SHOTS}/effects-parallax-preview-default.png`;
    writeFileSync(path, Buffer.from(shot.data, 'base64'));
    console.log(`    screenshot  : ${path}`);
    check('6a', 'the capture is of a COLD arrival with the composite drawing — a shot of a '
      + 'stale choice would be a picture of the wrong claim',
      shotState.on === true && shotState.choice === null
      && shotReport.active === true && shotReport.blits > 0,
      `${JSON.stringify(shotState)} report=${JSON.stringify({ active: shotReport.active, blits: shotReport.blits })}`);
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
