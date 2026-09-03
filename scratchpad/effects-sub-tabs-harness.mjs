#!/usr/bin/env node
// THREE SUB-TABS, ONE JOB EACH — EW-SHAPE-TABS, the owner's
// `three_sub_tabs_plus_section_strip` ruling (decisions.jsonl d-26b).
//
// ============================================================================
// WHY A HARNESS AND NOT A NODE ROW
// ============================================================================
//
// `src/renderer/providers/__tests__/effects-sub-tabs.test.ts` pins the TABLE
// (every section belongs to exactly one tab, read from the panels' own source)
// and the SEAM (a reveal switches the tab before it notifies). Neither can see
// any of the four claims this parcel actually makes, because the node suite has
// no layout:
//
//   1. THE TAB BAR IS PERMANENT — painted and hit-testable from the bottom of
//      the column, on a tab whose column really does scroll.
//   2. ONE JOB SHOWS ONE PANEL — the other two jobs' sections are NOT IN THE
//      DOM. Unmounted, not hidden: `display: none` would keep every text
//      finder in this repo green while the control was unreachable.
//   3. THE LAYERS LIST GOT A HEIGHT. The pre-parcel column was over-subscribed
//      before the list was reached, so the list sat on its floor: a 129px
//      window onto ~2,400px of cards. The floor is read out of
//      ui/CollapsibleSection.tsx IN THIS PROCESS and the row asserts the
//      section is no longer standing on it.
//   4. THE VERB ON THE TOOLBAR REACHES THE PANEL. `Add blank tile animation`
//      is on the tool-options bar, which is on screen from every sub-tab, and
//      the band it makes lands two tabs away. Before this parcel there was one
//      shut door (a collapsed section); there are now two.
//
// ============================================================================
// ⚠ THE TRAP EVERY PAINT ROW HERE IS WRITTEN AROUND
// ============================================================================
//
// `checkVisibility()` and `getClientRects()` BOTH RETURN TRUE/1 for an element
// scrolled entirely out of its own scroller — measured in this repo at 2,635px
// out (`scratchpad/effects-strip-delta-probe.mjs`). Two thirds of this repo's
// usual paint trio would pass the exact defect this parcel is about. So every
// paint row below compares the element's rect against the SCROLLER'S OWN BOX
// and requires a strict `elementFromPoint`; the trio is printed as evidence and
// is never the gate.
//
// ⚠ AND ABSENCE IS ASSERTED WITH ITS OWN PRESENCE. A row that only says "the
// Colour sections are not on the Parallax tab" passes when the finder is broken,
// when the project failed to open, and when the panel rendered nothing at all.
// Every absence row below asserts the SAME finder finds this tab's own sections
// in the same breath.
//
// ⚠ THIS HARNESS MUTATES THE COPY IN MEMORY (row [5a] adds a tile animation to
//   the open document; nothing is saved). Run it against a FRESH extract.
// ⚠ NO EMULATOR, EVER.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:effects-sub-tabs
//
//   PLANT=rot-tabs … find the tab bar by an attribute nothing carries. [2a]
//                    must catch it and the run must ABORT.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9462);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 94);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-sub-tabs`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';

// ── THE CONTRACT, READ IN THIS PROCESS ───────────────────────────────────────
//
// Not imported from the app and not typed as a literal: the list floor is a
// number in ui/CollapsibleSection.tsx, and row [4a]'s whole claim is "the layers
// section is no longer standing on that floor". A literal here would go stale
// silently the day the floor moves, and would then assert nothing.
const FLOOR = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/components/ui/CollapsibleSection.tsx`, 'utf8');
  const m = /const SECTION_LIST_MIN_HEIGHT = (\d+)/.exec(src);
  if (!m) throw new Error('could not read SECTION_LIST_MIN_HEIGHT — the floor this row is about');
  return Number(m[1]);
})();

/**
 * WHICH SECTION TITLES BELONG TO WHICH TAB — derived from the app's own table,
 * by reading `providers/effects-sub-tabs.ts` for the ids and the panels for the
 * title each id renders. The harness must not carry a second opinion about the
 * grouping; what it carries is the on-screen consequence.
 */
const TABS = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/providers/effects-sub-tabs.ts`, 'utf8');
  const out = [];
  for (const m of src.matchAll(/id: '(\w+)',\s*\n\s*label: '([^']+)',[\s\S]*?sections: \[([^\]]+)\]/g)) {
    out.push({
      id: m[1], label: m[2],
      sections: [...m[3].matchAll(/'([^']+)'/g)].map((s) => s[1]),
    });
  }
  if (out.length !== 3) throw new Error(`expected 3 sub-tabs in the table, parsed ${out.length}`);
  return out;
})();

/**
 * The HEADING an id draws, so an absence can be asserted against what an author
 * would look for. Titles are what the column paints; ids never reach the DOM.
 */
const TITLE_OF = {
  'aeon.effects.scenes': 'SCENES',
  'aeon.effects.layers': 'LAYERS (',
  'aeon.effects.scene': 'SCENE — ',
  'aeon.effects.assign': 'SECTION ASSIGNMENT',
  'aeon.effects.timeline': 'RASTER TIMELINE',
  'aeon.effects.presets': 'RASTER BAND PRESETS',
  'aeon.effects.preset.bands': 'PRESET — ',
  'aeon.effects.preset.channels': 'CYCLES',
  'aeon.effects.preset.anchors': 'MOVING ANCHORS',
  'aeon.bganim.bands': 'TILE ANIMATIONS (',
  'aeon.bganim.new': 'NEW TILE ANIMATION',
};

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

const BAR = PLANT === 'rot-tabs'
  ? `document.querySelector('[data-effects-sub-tabs-XXX]')`
  : `document.querySelector('[data-effects-sub-tabs]')`;
const STRIP = `document.querySelector('[data-effects-section-strip]')`;

/**
 * The tab bar's shape and paint, measured against the column's own box.
 *
 * ⚠ THE COLUMN IS THE STRIP'S PARENT, NOT "the nearest ancestor that
 * overflows". Every harness in this family walks up for an overflowing box,
 * which is right when the subject is a column that scrolls — and this parcel's
 * whole result is that the Parallax tab does NOT scroll any more (row [4b]).
 * The walk therefore returned null on the very tab the shape fixed, and the
 * first run of this harness failed [2a] for that reason and no other. The
 * scrollport is the `Panel`, whether or not it currently overflows.
 */
const BAR_PAINT = String.raw`(() => {
  const bar = ${BAR};
  if (!bar) return { found: false };
  const strip = ${STRIP};
  const sc = strip ? strip.parentElement : null;
  const b = bar.getBoundingClientRect();
  const cb = sc ? sc.getBoundingClientRect() : null;
  const tabs = [...bar.querySelectorAll('[data-effects-sub-tab]')].map((t) => {
    const r = t.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return {
      id: t.getAttribute('data-effects-sub-tab'),
      label: (t.textContent || '').trim(),
      selected: t.getAttribute('aria-selected') === 'true',
      role: t.getAttribute('role'),
      titleLen: (t.title || '').length,
      hitIsTab: hit === t,
    };
  });
  return {
    found: true, tabs,
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) },
    col: cb ? { top: Math.round(cb.top), bottom: Math.round(cb.bottom) } : null,
    insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
    scroll: sc ? { top: Math.round(sc.scrollTop), h: Math.round(sc.clientHeight),
                   sh: Math.round(sc.scrollHeight) } : null,
    // Recorded, NEVER the gate — both were true on the 2,635px-out defect.
    visible: typeof bar.checkVisibility === 'function' ? bar.checkVisibility() : null,
    rects: bar.getClientRects().length,
  };
})()`;

/**
 * WHICH SECTION HEADERS THE COLUMN IS PAINTING, right now.
 *
 * Read off the header elements themselves (the uppercase `PanelHeader` row)
 * rather than a text search over the whole column, so a word appearing inside a
 * paragraph cannot be mistaken for a section being present.
 */
const HEADERS = String.raw`(() => {
  const col = ${STRIP} ? ${STRIP}.parentElement : null;
  if (!col) return { found: false };
  const heads = [...col.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer')
    .map((d) => (d.innerText || '').trim().split('\n')[0]);
  return {
    found: true, heads,
    column: { h: Math.round(col.clientHeight), sh: Math.round(col.scrollHeight) },
  };
})()`;

/** The LAYERS section and the scroller inside it, or null when it is not shown. */
const LAYERS = String.raw`(() => {
  const col = ${STRIP} ? ${STRIP}.parentElement : null;
  if (!col) return { found: false };
  const head = [...col.querySelectorAll('div')]
    .find((d) => d.style && d.style.cursor === 'pointer' && /^layers \(/i.test((d.innerText || '').trim()));
  if (!head) return { found: false, heads: [...col.querySelectorAll('div')]
    .filter((d) => d.style && d.style.cursor === 'pointer').map((d) => (d.innerText || '').trim().slice(0, 24)) };
  const section = head.parentElement;
  const sb = section.getBoundingClientRect();
  const inner = [...section.querySelectorAll('div')]
    .find((d) => d.scrollHeight > d.clientHeight + 1 && d.clientHeight > 0);
  const cb = col.getBoundingClientRect();
  return {
    found: true,
    section: Math.round(sb.height),
    inner: inner ? { h: Math.round(inner.clientHeight), sh: Math.round(inner.scrollHeight) } : null,
    insideScroller: sb.top >= cb.top - 1 && sb.bottom <= cb.bottom + 1,
  };
})()`;

const CLICK_TAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-tab';
  t.click();
  return 'ok';
})()`;

const SCROLL_END = String.raw`(() => {
  const col = ${STRIP} ? ${STRIP}.parentElement : null;
  if (!col) return -1;
  col.scrollTop = col.scrollHeight;
  return Math.round(col.scrollTop);
})()`;

async function main() {
  const t0 = Date.now();
  console.log('=== effects-sub-tabs harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log(`    list floor  : ${FLOOR}px — READ FROM ui/CollapsibleSection.tsx IN THIS PROCESS`);
  console.log('    the table, READ FROM providers/effects-sub-tabs.ts IN THIS PROCESS:');
  for (const t of TABS) console.log(`      ${t.label.padEnd(10)} ${t.sections.join(' · ')}`);

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

    // A CLEAN ARRIVAL. Section disclosures persist in localStorage, and every
    // claim below about a DEFAULT state is a claim about what a first-time
    // author sees — which the previous run would otherwise have edited.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    const openProject = async () => {
      await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch(() => {});
      for (let i = 0; i < 40; i++) {
        const s = await c.json('window.__dbg.aeon.state()').catch(() => null);
        if (s && s.open) return s;
        await sleep(400);
      }
      return null;
    };
    const st = await openProject();
    check('1a', 'the COPIED aeon project is open, with the nine sections this act has',
      !!(st && st.open && st.sections === 9), JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open');
    await sleep(2500);
    check('1b', 'the Effects facet mounts', (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1500);

    // ---- 2. THE BAR: three tabs, one selected, permanent. ------------------
    const bar = await c.json(BAR_PAINT);
    check('2a', 'the sub-tab bar is FOUND, painted inside the column, with the three jobs the '
      + 'table names — and Parallax selected on arrival',
      bar.found === true && bar.insideScroller === true
      && bar.tabs.length === 3
      && bar.tabs.every((t, i) => t.label === TABS[i].label && t.id === TABS[i].id)
      && bar.tabs.every((t) => t.hitIsTab === true && t.role === 'tab' && t.titleLen > 60)
      && bar.tabs.filter((t) => t.selected).length === 1
      && bar.tabs[0].selected === true,
      bar.found === false
        ? 'NO ELEMENT MATCHED — finder rot, or the bar is not rendered'
        : JSON.stringify(bar));
    if (bar.found !== true) throw new Error('the sub-tab bar was not found — nothing below can be measured');

    // PERMANENCE, on a tab whose column really does scroll. Parallax's does
    // not on arrival — which is itself row [4b] — so this is taken on Colour.
    await c.evalExpr(CLICK_TAB('colour'));
    await sleep(1200);
    const atTop = await c.json(BAR_PAINT);
    const scrolledTo = await c.evalExpr(SCROLL_END);
    await sleep(700);
    const atBottom = await c.json(BAR_PAINT);
    check('2b', 'AT THE BOTTOM OF A SCROLLING TAB the bar is still inside the scroller and every '
      + 'tab is hit-testable',
      atBottom.insideScroller === true && atBottom.tabs.every((t) => t.hitIsTab === true)
      && atBottom.scroll.top > 0
      && atBottom.scroll.top >= atBottom.scroll.sh - atBottom.scroll.h - 2
      && atBottom.scroll.sh > atBottom.scroll.h + 100,
      `${JSON.stringify(atBottom)}\n        scrolled from ${atTop.scroll.top} to ${scrolledTo}`
      + `\n        ⚠ the two that do NOT discriminate: checkVisibility=${atBottom.visible} `
      + `rects=${atBottom.rects} — both were TRUE at top=-2635 before the strip parcel`);

    // THE STRIP IS OUTSIDE THE TABS. It is the same element across a switch,
    // it is still the column's FIRST CHILD (the picker harness's [2a]), and
    // the section it names does not reset.
    const stripAcross = await c.json(String.raw`(() => {
      const before = ${STRIP};
      const sel = before ? before.querySelector('select') : null;
      const wasFirst = before && before.parentElement.firstElementChild === before;
      const wasValue = sel ? sel.value : null;
      document.querySelector('[data-effects-sub-tab="tileAnim"]').click();
      return { wasFirst, wasValue, sameNode: null };
    })()`);
    await sleep(900);
    const stripAfter = await c.json(String.raw`(() => {
      const p = ${STRIP};
      if (!p) return { found: false };
      const s = p.querySelector('select');
      const b = p.getBoundingClientRect();
      const cb = p.parentElement.getBoundingClientRect();
      const sb = s ? s.getBoundingClientRect() : null;
      const hit = sb ? document.elementFromPoint(
        Math.round(sb.left + sb.width / 2), Math.round(sb.top + sb.height / 2)) : null;
      return {
        found: true, first: p.parentElement.firstElementChild === p,
        value: s ? s.value : null, hitIsSelect: hit === s,
        insideScroller: b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1,
        // The bar is INSIDE the strip's sticky box — that is where its
        // permanence comes from, and a bar that had been re-parented out of it
        // would still pass [2b] on a short column.
        carriesTheBar: !!p.querySelector('[data-effects-sub-tabs]'),
      };
    })()`);
    check('2c', 'the STRIP is outside the tabs: still the column\'s first child, still naming the '
      + 'same section, still hit-testable after a tab switch — and it is what carries the bar',
      stripAcross.wasFirst === true && stripAfter.found === true && stripAfter.first === true
      && stripAfter.value === stripAcross.wasValue && stripAfter.hitIsSelect === true
      && stripAfter.insideScroller === true && stripAfter.carriesTheBar === true,
      `${JSON.stringify(stripAcross)} → ${JSON.stringify(stripAfter)}`);

    // ---- 3. ONE JOB, ONE PANEL — presence AND absence, in one breath. ------
    const seen = {};
    for (const tab of TABS) {
      await c.evalExpr(CLICK_TAB(tab.id));
      await sleep(1100);
      seen[tab.id] = await c.json(HEADERS);
    }
    const titlesOf = (tab) => tab.sections.map((s) => TITLE_OF[s]);
    const shows = (heads, title) => heads.some((h) => h.toUpperCase().includes(title.toUpperCase()));
    const report = TABS.map((t) => `${t.label}: ${JSON.stringify(seen[t.id].heads)}`).join('\n        ');
    check('3a', 'each tab paints ITS OWN sections — the finder that the absence rows use, proven '
      + 'on presence first',
      TABS.every((t) => titlesOf(t).every((title) => shows(seen[t.id].heads, title))),
      report);
    check('3b', 'and NONE of the other two jobs\' sections is in the DOM at all — unmounted, not '
      + 'hidden',
      TABS.every((t) => TABS.filter((o) => o.id !== t.id)
        .every((other) => titlesOf(other).every((title) => !shows(seen[t.id].heads, title)))),
      report);
    // THE WALKTHROUGH'S §c1, ON SCREEN. The two features called "band" were
    // adjacent sections in one list; they can no longer be looked at together.
    //
    // ⚠ THIS ROW IS NOT DISCRIMINATING ON ITS OWN, and poison 1 proved it: with
    // every tab rendering the Parallax panel, NEITHER band feature is on screen
    // and this row goes GREEN on a build where the tabs are decoration. A pair
    // that never appears never fails to appear together. It is only meaningful
    // given [3a], which requires each tab to paint its own sections first, and
    // it is kept because that conjunction is the claim — not because it can
    // carry it alone.
    check('3c', '⚠ THE TWO "BAND" FEATURES ARE NEVER ON SCREEN TOGETHER (walkthrough §c1) — '
      + 'meaningful only with [3a]; see the comment above',
      TABS.every((t) => !(shows(seen[t.id].heads, 'TILE ANIMATIONS (')
        && shows(seen[t.id].heads, 'RASTER BAND PRESETS'))),
      report);

    // ---- 4. THE LAYERS LIST GOT A HEIGHT. ---------------------------------
    await c.evalExpr(CLICK_TAB('parallax'));
    await sleep(1200);
    const layers = await c.json(LAYERS);
    check('4a', `the LAYERS list is no longer standing on the ${FLOOR}px floor — it takes a real `
      + 'share of the column',
      layers.found === true && layers.insideScroller === true
      && layers.section > FLOOR + 40 && layers.inner !== null
      && layers.inner.sh > layers.inner.h * 2,
      `${JSON.stringify(layers)}\n        floor read from source: ${FLOOR}px; before this parcel `
      + 'the section measured exactly the floor and the window inside it 129px');

    const col = await c.json(HEADERS);
    check('4b', 'and the Parallax tab does not scroll at all on arrival — 1.0 screens, where the '
      + 'single column was 2.5 on arrival and 6.5 with everything open',
      col.found === true && col.column.sh <= col.column.h + 1,
      JSON.stringify(col.column));

    // ---- 5. THE SEAM: a toolbar verb reaches a panel two tabs away. --------
    const before = await c.json(String.raw`(() => {
      const heads = ${HEADERS};
      const t = document.querySelector('[data-effects-sub-tab="parallax"]');
      return { heads: heads.heads, parallaxSelected: t.getAttribute('aria-selected') === 'true' };
    })()`);
    check('5a', 'ANTI-VACUOUS: standing on Parallax, no tile-animation section is on screen',
      before.parallaxSelected === true
      && !shows(before.heads, 'TILE ANIMATIONS (')
      && !shows(before.heads, 'NEW TILE ANIMATION'),
      JSON.stringify(before));

    const clicked = await c.evalExpr(clickByText('/^Add blank tile animation$/'));
    await sleep(1600);
    const after = await c.json(String.raw`(() => {
      const heads = ${HEADERS};
      const bar = ${BAR};
      const card = document.querySelector('[id^="aeon-band-card-"]');
      const cb = card ? card.getBoundingClientRect() : null;
      const col = ${STRIP}.parentElement;
      const colb = col.getBoundingClientRect();
      const hit = cb ? document.elementFromPoint(
        Math.round(cb.left + cb.width / 2), Math.round(cb.top + cb.height / 2)) : null;
      return {
        heads: heads.heads,
        selected: [...bar.querySelectorAll('[data-effects-sub-tab]')]
          .filter((t) => t.getAttribute('aria-selected') === 'true')
          .map((t) => t.getAttribute('data-effects-sub-tab')),
        card: !!card,
        cardInsideScroller: !!(cb && cb.top >= colb.top - 1 && cb.bottom <= colb.bottom + 1),
        cardHit: !!(hit && (hit === card || card.contains(hit))),
      };
    })()`);
    check('5b', '⚠ THE SEAM: the toolbar verb switches to Tile anim, opens the section, and the '
      + 'card it made is PAINTED inside the column',
      clicked === true && after.selected.length === 1 && after.selected[0] === 'tileAnim'
      && shows(after.heads, 'TILE ANIMATIONS (')
      && after.card === true && after.cardInsideScroller === true && after.cardHit === true,
      `chip click → ${clicked}; ${JSON.stringify(after)}`);

    // ---- 6. THE CAPTURE FOR THE OWNER. ------------------------------------
    // ⚠ He ruled the SHAPE from an ASCII mockup and an argument; d-26b's own
    // note says the visual detail is UNRATIFIED. One shot per tab, from a clean
    // arrival, because the arrival state is the one every measurement above is
    // about and the one he will meet.
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();
    await openProject();
    await sleep(2500);
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1500);
    for (const tab of TABS) {
      await c.evalExpr(CLICK_TAB(tab.id));
      await sleep(1100);
      const shot = await c.send('Page.captureScreenshot', { format: 'png' });
      const path = `${SHOTS}/effects-sub-tab-${tab.id}.png`;
      writeFileSync(path, Buffer.from(shot.data, 'base64'));
      console.log(`    screenshot  : ${path}`);
    }
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
