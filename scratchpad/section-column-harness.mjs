#!/usr/bin/env node
// ===========================================================================
// WHAT DOES A NON-FACET SECTION COLUMN ACTUALLY DO ON SCREEN?
// ROADMAP §5.1 item 19 — a MEASUREMENT harness, not a fix harness.
// ===========================================================================
//
// Four surfaces mount `<CollapsibleSection>`s outside `workspace/facets`, and
// every one of their sections is `variant="content"` — the default — so
// `LIST_SECTION`'s share-of-the-column machinery never engages and each column
// degrades to a container scrollbar. `ui/primitives.tsx`'s Panel docblock calls
// that the escape hatch and names SpriteMode as the reason it exists. Nothing
// is asserted broken. What has never happened is the measurement.
//
//   SpriteMode        7 call sites in SpriteMode.tsx + 2 in S1ObjectSection,
//                     in one `<Panel width={240} scroll>`. THE COUNT DEPENDS ON
//                     THE SESSION (see below): 6, 7 or 9.
//   CanvasMode        3, in one `<Panel width={240} scroll>`.
//   Explorer          1 call site, rendered once PER GROUP, in the 240px tree
//                     scroller (styles.treeScroll = flex:1 overflowY:auto).
//   ProjectSetupTab   1 call site, rendered once PER GROUP, in a page scroller
//                     inside an 860px centred column — a document, not a column.
//
// -------------------------------------------------------------------------
// WHY SpriteMode HAS THREE DIFFERENT SECTION COUNTS
// -------------------------------------------------------------------------
// SpriteMode.tsx:49 reads `useProjectStore(s => s.project)` directly and :54
// reads the classic store's status; NEITHER goes through
// `state/open-project.ts`. So the two gates are independent:
//
//   always                       mapping, name, open, palette          = 4
//   + `project` (aeon resident)  export, character                     = 6
//   + `classicOpen`              s1-objects, s1-shared-objects,
//                                save-source                           = 7 or 9
//
// open-project.ts's own docblock says a classic open LEAVES a previously
// resident aeon project in the store, and no app-code path calls
// `useProjectStore.getState().reset()` (grep: tests only). So opening aeon
// FIRST and classic SECOND is a real, reachable session in which all nine
// mount at once. Phase C below drives exactly that order, and row [S9.nine] is
// what proves or refutes it — if the app does clear the aeon project, that row
// reports 7 and the nine-section premise is dead. That would be the most
// useful outcome this harness could have.
//
// The docblock's "SpriteMode mounts six" is the AEON-ONLY count, and it was
// also the aeon-only count at 5399202, the commit that wrote it (SpriteMode.tsx
// already had seven call sites that day). So it is not stale — it is
// unqualified. Row [S6.doc] tests it in the configuration where it is true.
//
// ===========================================================================
// WHAT THIS INSTRUMENT IS
// ===========================================================================
// ui/primitives.tsx's `PanelHeader` is rendered by exactly ONE component in the
// whole renderer — ui/CollapsibleSection (grep "<PanelHeader": no other call
// site). So a DOM element with PanelHeader's computed signature (textTransform
// uppercase + letterSpacing 1px + a leading <span>) is a titled section header
// and nothing else, and its grandparent is the section box:
//
//     <div style={CONTENT_SECTION | LIST_SECTION}>   <- the section box
//       <div onClick style={{cursor:'pointer'}}>     <- the toggle
//         <div ...PanelHeader...><span>TITLE</span>  <- what we match
//
// That makes the enumeration structural and one-to-one with the source call
// sites, rather than a list of names somebody maintains — which is the failure
// mode ROADMAP items 15 and 18 are both about.
//
// The Explorer is PERSISTENT: it is on screen behind every other surface, and
// its groups are titled sections too. So every measurement below is bounded to
// one x-range (`minLeft` / `maxLeft`) and says which. A run that forgot this
// would measure the Explorer four times and report four green columns —
// chunkgrid-hint-harness's row 5t, in another costume.
//
// ===========================================================================
// THE ROWS, AND WHICH OF THEM CAN GO RED
// ===========================================================================
// Read this before believing a green run. Some rows here are TRIPWIRES, not
// discriminators, and saying so is the point (object-label-harness's precedent:
// 23/23 with one row disclosed as passing on master too).
//
//   [i*] INSTRUMENT rows. Anti-vacuous. They assert the harness saw its
//        subject: the exact expected title set (i1), non-zero painted heights
//        (i2), a real shared scroll container (i3), a window of the size asked
//        for (i4), and — where the subject is data-driven — that the data is
//        actually there: the Explorer's ~102-row Object Library (E.i0) and the
//        canvas commit plan's 16 per-chunk rows (C.i0). A green claim row
//        underneath a red i-row means nothing.
//
//        E.i0 exists because of a trap this harness fell into while being
//        written: the Explorer's groups are `defaultCollapsed` and the obvious
//        way to open them all is the filter box (`collapsedOverride`), but a
//        query also FILTERS the items — so the widest tree in the app would
//        have been measured at its narrowest and reported as comfortable. The
//        groups are opened by clicking their real headers, unfiltered, instead.
//
//   [c1] NO SECTION PAINTS OVER THE ONE BELOW IT.
//        ** DOES NOT DISCRIMINATE ON THESE FOUR SURFACES AS THEY STAND. **
//        Every section here is CONTENT_SECTION = flexShrink:0 inside an
//        overflow:auto box, so overlap is structurally impossible: the stack
//        grows and the container scrolls. This row is the regression tripwire
//        for the shape that DID ship (the effects panel's 954px of layer cards)
//        and it goes red under PLANT=list-no-scroller. On an unplanted tree,
//        expect green for the trivial reason. Reported, not hidden.
//
//   [c2] EVERY SECTION IS REACHABLE BY SCROLLING ITS CONTAINER.
//        Discriminates: red under PLANT=clip. Not trivially green — Explorer's
//        root is overflow:hidden with the scroller nested inside it, and the
//        setup tab keeps its Apply footer OUTSIDE its scroller, so "which box
//        actually scrolls" is a real question on two of the four.
//
//   [c3] A ROW IS AT MOST TWO SCROLLBARS DEEP.
//        Discriminates: red under PLANT=nested. This is "is the nested scroll
//        confusing" made countable. Two of the four genuinely have depth 2
//        today — SpriteMode's scan list (maxHeight 220, SpriteMode.tsx:376) and
//        S1ObjectSection's row lists (maxHeight 240, :132) sit inside the Panel
//        scroller. Three would be the defect.
//
//   [c4] THE WHEEL CHAINS OUT OF AN EXHAUSTED INNER LIST.
//        Discriminates: red under PLANT=contain. Nested scrolling is only
//        confusing if the wheel DEAD-ENDS; nothing in this tree sets
//        overscroll-behavior, so chaining should work — but that has never been
//        checked on a real wheel event, which is the only place it is
//        observable. NOT MEASURED (not passed) where there is no inner list, or
//        where the outer column has nothing to scroll.
//
//   [c5] THE COLUMN'S NATURAL HEIGHT IS A PROPERTY OF ITS CONTENT, NOT OF THE
//        WINDOW. Cross-run self-check (`--compare`): the summed natural section
//        heights must agree within 4% between the two SCREEN sizes. If they do
//        not, every px number below is window-dependent and the "minimum window
//        height" finding is not a number at all. Reported NOT MEASURED from a
//        single run — never quietly skipped.
//
//   [r*] REPORTS. No verdict — these ARE the measurement. [r4] is the one the
//        ruling turns on:
//
//        r4 answers "would the flex column even help?" from real geometry. If
//        the tallest section were re-declared variant="list", its share would be
//        `container.clientHeight - (every other section's natural height)`.
//        When that share is below SECTION_LIST_MIN_HEIGHT (read out of
//        CollapsibleSection.tsx at startup, never re-typed here),
//        CollapsibleSection's own floor engages, the deficit goes back to
//        Panel's scrollbar, and the column scrolls EXACTLY AS IT DOES NOW —
//        i.e. the refactor is provably a no-op. r4 prints that share and that
//        verdict per surface, per window size.
//
// ===========================================================================
// HOW TO INVOKE
// ===========================================================================
//   cd /home/volence/sonic_hacks/aurora        # the MAIN checkout: ROOT below
//   VITE_AURORA_DEBUG=1 npm run build          # __dbg only exists with the flag
//
//   # the two window sizes, in either order; each writes a JSON summary
//   SCREEN=1680x1050 node scratchpad/section-column-harness.mjs
//   SCREEN=1280x800  node scratchpad/section-column-harness.mjs
//   # 800 tall is a 13" laptop with OS chrome; 1050 is what every other harness
//   # in this directory uses, so these numbers are comparable to theirs.
//
//   # then the cross-size self-check + the minimum-window-height derivation:
//   node scratchpad/section-column-harness.mjs --compare
//
//   # red-first: each plant must flip ONLY the rows named above
//   PLANT=clip             SCREEN=1280x800 node scratchpad/section-column-harness.mjs
//   PLANT=nested           SCREEN=1280x800 node scratchpad/section-column-harness.mjs
//   PLANT=contain          SCREEN=1280x800 node scratchpad/section-column-harness.mjs
//   PLANT=list-no-scroller SCREEN=1280x800 node scratchpad/section-column-harness.mjs
//
// Plants are applied AT RUNTIME through CDP (no rebuild): they restyle the live
// DOM into the shape whose absence the row asserts. `list-no-scroller`
// reproduces the effects-panel defect exactly — LIST_SECTION's flex declaration
// on a section whose body has no scroller — and is expected to go red ONLY on a
// column that is already over-subscribed, because that is the only condition
// under which flexbox squeezes rather than grows. A green c1 under that plant
// at 1680x1050 and a red one at 1280x800 is a FINDING, not a harness fault: it
// says which columns have room to spare.
//
// VERBOSE=1 tees Electron's stdout/stderr. Screenshots land in
// scratchpad/shots-section-column/.
// ===========================================================================

import { spawn, execSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9381);
const ROOT = '/home/volence/sonic_hacks/aurora';
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
const AEONDIR = '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-section-column`;
const SCREEN = process.env.SCREEN ?? '1680x1050';
const [SCREEN_W, SCREEN_H] = SCREEN.split('x').map(Number);
const PLANT = process.env.PLANT ?? '';
const SUMMARY = (s) => `${ROOT}/scratchpad/section-column-${s}.json`;
/** x past which the Explorer ends and a right-hand / page column begins. The
 *  Explorer is a fixed 240px wide (Explorer.tsx styles.root). */
const PAGE_X = 280;

/** CollapsibleSection.tsx's own floor. Read out of the source so r4's
 *  counterfactual uses the app's number rather than one re-typed here — if the
 *  constant is renamed or made non-literal this throws instead of quietly
 *  computing against a stale 160. */
const SECTION_LIST_MIN_HEIGHT = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/components/ui/CollapsibleSection.tsx`, 'utf8');
  const m = src.match(/const SECTION_LIST_MIN_HEIGHT = (\d+);/);
  if (!m) throw new Error('SECTION_LIST_MIN_HEIGHT is no longer a literal in CollapsibleSection.tsx — r4 cannot be computed');
  return Number(m[1]);
})();

mkdirSync(SHOTS, { recursive: true });

// --------------------------------------------------------------------------
// CDP plumbing (same shape as chunkgrid-hint-harness / object-label-harness)
// --------------------------------------------------------------------------
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
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

const mouse = (c, type, x, y, opts = {}) => c.send('Input.dispatchMouseEvent', {
  type, x, y, button: opts.button ?? 'left',
  buttons: opts.buttons ?? (type === 'mouseReleased' ? 0 : 1), clickCount: 1, modifiers: opts.modifiers ?? 0,
});
async function key(c, k, code, vk, modifiers = 0) {
  const base = { key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const ctrlK = (c) => key(c, 'k', 'KeyK', 75, 2);
const escapeKey = (c) => key(c, 'Escape', 'Escape', 27, 0);
/** Enter WITH its char event — a bare keyDown does not trigger Blink's implicit
 *  form submission (canvas-cdp-harness learned this the expensive way). */
async function enter(c) {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', unmodifiedText: '\r', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', unmodifiedText: '\r', ...base });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
const typeText = async (c, text) => { await c.send('Input.insertText', { text }); await sleep(60); };
async function clickAt(c, x, y) {
  await mouse(c, 'mousePressed', x, y); await sleep(40);
  await mouse(c, 'mouseReleased', x, y, { buttons: 0 }); await sleep(220);
}
async function clickEl(c, expr) {
  const r = await c.json(`(() => { const e = ${expr}; if (!e) return null; const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width/2), y: Math.round(b.top + b.height/2) }; })()`);
  if (!r) return false;
  await clickAt(c, r.x, r.y);
  return true;
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> scratchpad/shots-section-column/${name}.png`);
}

// --------------------------------------------------------------------------
// Result ledger
// --------------------------------------------------------------------------
const results = [];
const fails = [];
const notes = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(id, name, detail) {
  console.log(`NOTE  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  notes.push({ id, name, detail });
}
function report(id, lines) {
  console.log(`REPORT [${id}]`);
  for (const l of [].concat(lines)) console.log(`        ${l}`);
}

// ==========================================================================
// THE PROBE. Runs in the page; returns every titled section in the x-window
// currently selected, with the geometry a layout claim is made of.
// ==========================================================================
const INSTALL = String.raw`
window.__sc = (() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  const A = {};
  // The x-window this measurement is bounded to. The Explorer is persistent and
  // its groups are titled sections too, so an unbounded scan would enrol them
  // into every other surface's numbers.
  A.minLeft = 0;
  A.maxLeft = 1e9;

  /**
   * PanelHeader's computed signature. Rendered by ui/CollapsibleSection and by
   * nothing else in the renderer, so this is one-to-one with call sites.
   *
   * THE COLLISION CHECK, because a signature scan is only as good as what else
   * could match it. Two other styles in the tree pair uppercase with
   * letterSpacing 1px: HomeTab's sectionTitle (a DIV, but its children are bare
   * TEXT, so children[0] is undefined) and ProjectSetupTab's infoKey (a SPAN,
   * excluded by the tagName test). Everything else in src/renderer uses
   * letterSpacing 0.5. Both exclusions are load-bearing, not decoration.
   */
  const isHeader = (e) => {
    if (e.tagName !== 'DIV') return false;
    const s = getComputedStyle(e);
    if (s.textTransform !== 'uppercase') return false;
    if (s.letterSpacing !== '1px') return false;
    const first = e.children[0];
    return !!first && first.tagName === 'SPAN';
  };
  /** Every section header in the current x-window, in DOM order. */
  const hdrs = () => [...document.querySelectorAll('div')].filter(isHeader).filter(vis)
    .filter((e) => { const l = e.getBoundingClientRect().left; return l >= A.minLeft && l <= A.maxLeft; });
  const secOf = (h) => (h.parentElement ? h.parentElement.parentElement : null);
  const secEls = () => hdrs().map(secOf).filter(Boolean);

  const scrolls = (e) => {
    const s = getComputedStyle(e);
    return /(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflow);
  };
  /** Every scrollable ancestor, innermost first — the "how many bars deep" count. */
  const scrollAncestors = (e) => {
    const out = [];
    for (let p = e.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      if (scrolls(p)) out.push(p);
    }
    return out;
  };
  const containerOf = (sec) => scrollAncestors(sec)[0] || null;

  const box = (e) => { const r = e.getBoundingClientRect(); return {
    top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left),
    right: Math.round(r.right), h: Math.round(r.height), w: Math.round(r.width) }; };

  /** Descendant scrollers INSIDE one section — a nested list with its own bar. */
  const innerScrollers = (sec) => [...sec.querySelectorAll('*')].filter((e) => {
    if (!scrolls(e) || !vis(e)) return false;
    const s = getComputedStyle(e);
    // A box that declares overflow but can never overflow is not a scroller a
    // user ever meets; one with a maxHeight is a scroller waiting for data.
    return e.scrollHeight > e.clientHeight + 1 || s.maxHeight !== 'none';
  });

  A.headerEl = (t) => hdrs().find((e) => (e.children[0].textContent || '').trim() === t) || null;
  A.sectionEl = (t) => { const h = A.headerEl(t); return h ? secOf(h) : null; };

  A.sections = () => hdrs().map((h) => {
    const toggle = h.parentElement;
    const sec = secOf(h);
    const inner = sec ? innerScrollers(sec) : [];
    const cs = sec ? getComputedStyle(sec) : null;
    return {
      title: (h.children[0].textContent || '').trim(),
      right: h.children[1] ? (h.children[1].textContent || '').trim() : null,
      toggleIsPointer: toggle ? getComputedStyle(toggle).cursor === 'pointer' : false,
      header: box(h),
      section: sec ? box(sec) : null,
      // A collapsed section renders no children at all (CollapsibleSection:71),
      // so its box is just its header row.
      collapsed: sec ? sec.children.length === 1 : null,
      flexShrink: cs ? cs.flexShrink : null,
      flexGrow: cs ? cs.flexGrow : null,
      flexBasis: cs ? cs.flexBasis : null,
      minHeight: cs ? cs.minHeight : null,
      maxHeight: cs ? cs.maxHeight : null,
      overflowY: cs ? cs.overflowY : null,
      depth: sec ? scrollAncestors(sec).length : null,
      innerScrollers: inner.map((e) => ({
        h: Math.round(e.getBoundingClientRect().height),
        clientH: e.clientHeight, scrollH: e.scrollHeight,
        maxHeight: getComputedStyle(e).maxHeight,
        overscroll: getComputedStyle(e).overscrollBehaviorY,
        // Counted from the page, so a THIRD bar shows up as 3.
        depth: scrollAncestors(e).length,
      })),
    };
  });

  A.containerEl = () => { const s = secEls(); return s.length ? containerOf(s[0]) : null; };
  A.container = () => {
    const secs = secEls();
    if (!secs.length) return null;
    const conts = secs.map(containerOf);
    const first = conts[0];
    if (!first) return null;
    return {
      shared: conts.every((x) => x === first),
      clientH: first.clientHeight, scrollH: first.scrollHeight,
      clientW: first.clientWidth, scrollTop: first.scrollTop,
      overflowPx: first.scrollHeight - first.clientHeight,
      overflowY: getComputedStyle(first).overflowY,
      overflow: getComputedStyle(first).overflow,
      box: box(first),
      // How many boxes above it also scroll. Explorer nests its scroller in an
      // overflow:hidden root; the setup tab keeps a footer outside it.
      outerScrollers: scrollAncestors(first).length,
    };
  };
  A.setScrollTop = (v) => { const el = A.containerEl(); if (!el) return null; el.scrollTop = v; return el.scrollTop; };
  A.outerScrollTop = () => { const el = A.containerEl(); return el ? el.scrollTop : null; };

  A.scrollIntoViewByTitle = (t) => {
    const sec = A.sectionEl(t);
    if (!sec) return null;
    const el = containerOf(sec);
    if (!el) return null;
    // Bring the section's own top to the container's top, clamped by the
    // container's real scroll range — the same thing a user's scrollbar does.
    el.scrollTop = Math.min(el.scrollHeight - el.clientHeight,
      Math.max(0, sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop));
    const h = sec.children[0];
    const hb = h.getBoundingClientRect(); const cb = el.getBoundingClientRect();
    return { headerTop: Math.round(hb.top), headerBottom: Math.round(hb.bottom),
             contTop: Math.round(cb.top), contBottom: Math.round(cb.bottom),
             scrollTop: Math.round(el.scrollTop), maxScroll: el.scrollHeight - el.clientHeight };
  };
  A.headerPoint = (t) => {
    const h = A.headerEl(t);
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  };
  /** The innermost scroller inside a named section, parked at its bottom, with a
   *  point to put the wheel over. For the chaining row. */
  A.armInnerScroller = (t) => {
    const sec = A.sectionEl(t);
    if (!sec) return { armed: false, why: 'no such section' };
    const inner = innerScrollers(sec).filter((e) => e.scrollHeight > e.clientHeight + 1);
    if (!inner.length) return { armed: false, why: 'no inner scroller with anything to scroll' };
    const el = inner[inner.length - 1];
    el.scrollTop = el.scrollHeight;
    const r = el.getBoundingClientRect();
    const outer = scrollAncestors(el)[0] || null;
    return {
      armed: true,
      innerTop: Math.round(el.scrollTop), innerMax: el.scrollHeight - el.clientHeight,
      x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      outerTop: outer ? Math.round(outer.scrollTop) : null,
      outerMax: outer ? outer.scrollHeight - outer.clientHeight : null,
      overscroll: getComputedStyle(el).overscrollBehaviorY,
    };
  };

  // ---- plant helpers (see PLANTS below; kept here so they reuse this file's
  // one definition of "a section" rather than re-deriving it from a click point)
  A.plantClip = () => { const el = A.containerEl(); if (!el) return 'no container';
    el.style.overflow = 'hidden'; return 'clipped the shared container (' + el.clientHeight + 'px tall)'; };
  A.tallestTitle = () => { const s = A.sections(); if (!s.length) return null;
    return s.slice().sort((a, b) => (b.section ? b.section.h : 0) - (a.section ? a.section.h : 0))[0].title; };
  A.plantNested = () => { const t = A.tallestTitle(); const sec = t ? A.sectionEl(t) : null;
    if (!sec) return 'no section'; const body = sec.children[1];
    if (!body) return 'the tallest section is collapsed — nothing to nest into';
    body.style.overflowY = 'auto'; body.style.maxHeight = '120px';
    return 'nested a third bar into "' + t + '"'; };
  A.plantContain = () => { let n = 0;
    for (const e of document.querySelectorAll('*')) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1) {
        e.style.overscrollBehavior = 'contain'; n++; } }
    return 'contained ' + n + ' scrollers'; };
  A.plantListNoScroller = () => { const t = A.tallestTitle(); const sec = t ? A.sectionEl(t) : null;
    if (!sec) return 'no section';
    // LIST_SECTION, verbatim (CollapsibleSection.tsx:137) ...
    sec.style.flex = '1 1 0'; sec.style.minHeight = '160px'; sec.style.maxHeight = 'max-content';
    // ... and the half the effects panel was missing: no scroller inside it.
    for (const e of sec.querySelectorAll('*')) {
      const s = getComputedStyle(e);
      if (/(auto|scroll)/.test(s.overflowY)) { e.style.overflowY = 'visible'; e.style.maxHeight = 'none'; } }
    return 'LIST_SECTION applied to "' + t + '" with its inner scrollers removed'; };

  // ---- app-driving helpers ------------------------------------------------
  A.filterInput = () => [...document.querySelectorAll('input')].find(
    (i) => i.placeholder === 'Filter…' && vis(i)) || null;
  A.explorerRows = () => [...document.querySelectorAll('button')]
    .filter((b) => vis(b) && b.getBoundingClientRect().left < 280).map((b) => b.textContent.trim());
  A.clickExplorerRow = (label) => {
    const e = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim().indexOf(label) === 0 && vis(b) && b.getBoundingClientRect().left < 280);
    if (!e) return false; e.click(); return true;
  };
  A.dlg = () => document.querySelector('[role="dialog"][aria-label="New Canvas"]');
  A.dlgNums = () => { const d = A.dlg(); return d ? [...d.querySelectorAll('input[type=number]')] : []; };
  A.dlgCreate = () => { const d = A.dlg(); return d
    ? [...d.querySelectorAll('button')].find((b) => /^Creat/.test(b.textContent.trim())) : null; };
  A.paletteInput = () => [...document.querySelectorAll('input')].find(
    (i) => i.placeholder && /command|search|type/i.test(i.placeholder) && vis(i)) || null;
  /** Anti-vacuous readout for CanvasMode: CommitPlanView draws one "chunk N"
   *  label per 256x256 chunk. A canvas under 256px shows "nothing to commit
   *  yet" and the section collapses to one line — which would make every
   *  geometry row green for the wrong reason. */
  A.commitRows = () => [...document.querySelectorAll('span')]
    .filter((e) => /^chunk [0-9]+$/.test((e.textContent || '').trim())).length;
  A.win = () => ({ innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio });
  return A;
})();
true`;

const PLANT_CALLS = {
  clip: 'window.__sc.plantClip()',
  nested: 'window.__sc.plantNested()',
  contain: 'window.__sc.plantContain()',
  'list-no-scroller': 'window.__sc.plantListNoScroller()',
};

async function applyPlant(c, tag) {
  if (!PLANT) return;
  const call = PLANT_CALLS[PLANT];
  if (!call) throw new Error(`unknown PLANT=${PLANT}; known: ${Object.keys(PLANT_CALLS).join(', ')}`);
  const out = await c.evalExpr(call);
  note(`plant.${tag}`, `PLANT=${PLANT} applied to ${tag}`, String(out));
  await sleep(500);
}

/** Point the probe at one x-window and re-read the titles there. */
async function bound(c, minLeft, maxLeft) {
  await c.evalExpr(`window.__sc.minLeft = ${minLeft}; window.__sc.maxLeft = ${maxLeft}; true`);
  return c.json('window.__sc.sections().map((s) => s.title)');
}

// ==========================================================================
// ONE SURFACE, MEASURED
// ==========================================================================
/**
 * @param tag     row-id prefix, e.g. 'S9'
 * @param label   human name for the surface + configuration
 * @param expect  { titles } — the EXACT expected title set. The anti-vacuous
 *                spine: it proves the workspace on screen is the one this block
 *                claims to measure. chunkgrid-hint-harness's row 5t exists
 *                because four green "aeon" rows had measured classic twice.
 * @param opts    { minLeft, maxLeft, expandAll, wheelSection }
 *
 * The caller has ALREADY bounded the probe (see `bound`); this re-asserts the
 * same bounds so the block is self-contained if it is ever reordered.
 */
async function measureSurface(c, tag, label, expect, opts = {}) {
  const minLeft = opts.minLeft ?? 0;
  const maxLeft = opts.maxLeft ?? 1e9;
  await c.evalExpr(`window.__sc.minLeft = ${minLeft}; window.__sc.maxLeft = ${maxLeft}; true`);
  await sleep(300);

  // Expand everything first, through REAL header clicks, so the WORST case is
  // what gets measured. Explorer and the setup tab default their groups
  // collapsed, and SpriteMode collapses `sprite.open` in a classic session
  // (SpriteMode.tsx:223, defaultCollapsed={classicOpen}).
  if (opts.expandAll) {
    for (let pass = 0; pass < 4; pass++) {
      const collapsed = await c.json('window.__sc.sections().filter((s) => s.collapsed).map((s) => s.title)');
      if (!collapsed.length) break;
      for (const t of collapsed) {
        // SCROLL IT INTO VIEW FIRST. Each expansion pushes the headers below it
        // down, and a header that has moved past the bottom of the container
        // still has a non-zero rect — so a click at its coordinates would land
        // on whatever is painted there instead, silently expanding the wrong
        // section (or nothing) and reporting a shorter column than exists.
        await c.json(`window.__sc.scrollIntoViewByTitle(${JSON.stringify(t)})`);
        await sleep(120);
        const p = await c.json(`window.__sc.headerPoint(${JSON.stringify(t)})`);
        if (p) await clickAt(c, p.x, p.y);
      }
      await sleep(600);
    }
    const stillCollapsed = await c.json('window.__sc.sections().filter((s) => s.collapsed).map((s) => s.title)');
    if (stillCollapsed.length) {
      note(`${tag}.expand`, `${label}: ${stillCollapsed.length} section(s) would not expand`,
        JSON.stringify(stillCollapsed) + ' — the heights below UNDERSTATE the worst case');
    }
  }

  // ANTI-VACUOUS for a data-driven tree: the Explorer's Object Library carries
  // ~102 named S1 objects (s1-objects.ts's S1_OBJECT_LIST), and a run that
  // measured it filtered, collapsed or before the project loaded would report a
  // short, tidy column that no user ever sees. `rowFloor` says how many rows
  // must be on screen for the geometry below to be about the real thing.
  if (opts.rowFloor) {
    const rows = await c.evalExpr('window.__sc.explorerRows().length');
    check(`${tag}.i0`, `${label}: the tree is fully populated (>= ${opts.rowFloor} rows on screen)`,
      rows >= opts.rowFloor, `${rows} clickable rows in the Explorer column`);
  }

  await applyPlant(c, tag);
  await sleep(300);

  const secs = await c.json('window.__sc.sections()');
  const cont = await c.json('window.__sc.container()');
  const win = await c.json('window.__sc.win()');

  // ---- instrument rows --------------------------------------------------
  const titles = secs.map((s) => s.title);
  const want = expect.titles;
  const same = titles.length === want.length && want.every((t) => titles.includes(t));
  check(`${tag}.i1`, `${label}: exactly the ${want.length} expected sections are on screen`, same,
    `saw ${titles.length}: ${JSON.stringify(titles)}\n        wanted ${want.length}: ${JSON.stringify(want)}`);
  check(`${tag}.i2`, `${label}: every section header is painted (h > 0) and its toggle is a pointer`,
    secs.length > 0 && secs.every((s) => s.header.h > 0 && s.toggleIsPointer),
    secs.map((s) => `${s.title}=${s.header.h}px/${s.toggleIsPointer}`).join(' ') || '(no sections)');
  check(`${tag}.i3`, `${label}: every section shares ONE scroll container with a real height`,
    !!cont && cont.shared === true && cont.clientH > 0,
    cont ? `shared=${cont.shared} clientH=${cont.clientH} scrollH=${cont.scrollH} `
      + `overflowY=${cont.overflowY} overflow=${cont.overflow} outerScrollers=${cont.outerScrollers}` : 'no container');
  check(`${tag}.i4`, `${label}: the window is the size this run asked for (SCREEN=${SCREEN})`,
    Math.abs(win.innerH - SCREEN_H) <= 80 && Math.abs(win.innerW - SCREEN_W) <= 80,
    `innerW=${win.innerW} innerH=${win.innerH} dpr=${win.dpr} (asked ${SCREEN_W}x${SCREEN_H})`);

  if (!cont || !secs.length) {
    note(`${tag}.skip`, `${label}: NO MEASURABLE COLUMN — the claim rows for this surface are NOT MEASURED`);
    return null;
  }

  // ---- c1: nothing paints over the section below it ----------------------
  // TRIPWIRE, NOT A DISCRIMINATOR HERE. See the file header: every section is
  // flexShrink:0 in an overflow:auto box, so this is structurally green on an
  // unplanted tree. It guards the shape that DID ship (the effects panel).
  const overlaps = [];
  for (let i = 0; i + 1 < secs.length; i++) {
    const a = secs[i], b = secs[i + 1];
    if (!a.section || !b.section) continue;
    if (a.section.bottom > b.section.top + 1) {
      overlaps.push(`"${a.title}" bottom=${a.section.bottom} over "${b.title}" top=${b.section.top} `
        + `(${a.section.bottom - b.section.top}px of overlap)`);
    }
  }
  check(`${tag}.c1`, `${label}: no section paints over the one below it [TRIPWIRE — cannot go red unplanted]`,
    overlaps.length === 0, overlaps.length ? overlaps.join('\n        ') : `all ${Math.max(0, secs.length - 1)} consecutive pairs disjoint`);

  // ---- c2: every section is reachable by scrolling -----------------------
  const unreachable = [];
  for (const s of secs) {
    const r = await c.json(`window.__sc.scrollIntoViewByTitle(${JSON.stringify(s.title)})`);
    if (!r) { unreachable.push(`"${s.title}" has no scroll container`); continue; }
    const inside = r.headerTop >= r.contTop - 1 && r.headerBottom <= r.contBottom + 1;
    if (!inside) {
      unreachable.push(`"${s.title}" header ${r.headerTop}..${r.headerBottom} vs container `
        + `${r.contTop}..${r.contBottom} (scrolled to ${r.scrollTop} of ${r.maxScroll})`);
    }
  }
  await c.evalExpr('window.__sc.setScrollTop(0)');
  await sleep(250);
  check(`${tag}.c2`, `${label}: every section can be scrolled fully into view`,
    unreachable.length === 0, unreachable.length ? unreachable.join('\n        ') : `all ${secs.length} reachable`);

  // ---- c3: at most two scrollbars deep -----------------------------------
  const deep = [];
  for (const s of secs) {
    for (const inner of s.innerScrollers) {
      if (inner.depth > 2) deep.push(`"${s.title}" has a scroller ${inner.depth} bars deep (maxHeight=${inner.maxHeight})`);
    }
    if (s.depth !== null && s.depth > 1) deep.push(`"${s.title}"'s own box sits ${s.depth} scrollers deep`);
  }
  const maxDepth = Math.max(1, ...secs.flatMap((s) => s.innerScrollers.map((i) => i.depth)), ...secs.map((s) => s.depth ?? 1));
  check(`${tag}.c3`, `${label}: no row is more than two scrollbars deep`,
    deep.length === 0, deep.length ? deep.join('\n        ') : `deepest row is ${maxDepth} bar(s) deep`);

  // ---- c4: the wheel chains out of an exhausted inner list ---------------
  const wheelTarget = opts.wheelSection
    ?? (secs.find((s) => s.innerScrollers.some((i) => i.scrollH > i.clientH + 1))?.title ?? null);
  if (!wheelTarget) {
    note(`${tag}.c4`, `${label}: NOT MEASURED — no section here has an inner list with anything to scroll, `
      + 'so nested-scroll dead-ending cannot arise on this surface in this configuration');
  } else {
    const armed = await c.json(`window.__sc.armInnerScroller(${JSON.stringify(wheelTarget)})`);
    if (!armed || !armed.armed) {
      note(`${tag}.c4`, `${label}: NOT MEASURED — could not park "${wheelTarget}"'s inner list at its end`,
        JSON.stringify(armed));
    } else if (!armed.outerMax) {
      note(`${tag}.c4`, `${label}: NOT MEASURED — the outer column has nothing to scroll `
        + `(outerMax=${armed.outerMax}), so chaining has no observable effect at this window size`);
    } else {
      const before = armed.outerTop;
      for (let i = 0; i < 5; i++) {
        await c.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: armed.x, y: armed.y, deltaX: 0, deltaY: 120, modifiers: 0,
        });
        await sleep(140);
      }
      await sleep(500);
      const after = await c.evalExpr('window.__sc.outerScrollTop()');
      check(`${tag}.c4`, `${label}: a wheel over an exhausted inner list chains out to the column`,
        after > before,
        `inner "${wheelTarget}" parked at ${armed.innerTop}/${armed.innerMax}, `
        + `overscroll-behavior=${armed.overscroll}; column scrollTop ${before} -> ${after} (max ${armed.outerMax})`);
      await c.evalExpr('window.__sc.setScrollTop(0)');
    }
  }

  // ---- reports -----------------------------------------------------------
  const natural = secs.reduce((n, s) => n + (s.section?.h ?? 0), 0);
  const visibleAtTop = secs.filter((s) => s.header.top >= cont.box.top - 1 && s.header.bottom <= cont.box.bottom + 1).length;
  report(`${tag}.r1`, [
    `COLUMN  clientH=${cont.clientH}  scrollH=${cont.scrollH}  overflow=${cont.overflowPx}px`
      + `  (${cont.clientH ? (100 * cont.overflowPx / cont.clientH).toFixed(0) : '-'}% of a screenful)`
      + `  width=${cont.clientW}  outerScrollers=${cont.outerScrollers}`,
    `WINDOW  ${win.innerW}x${win.innerH}   SECTIONS ${secs.length}   natural stack height ${natural}px`,
  ]);
  report(`${tag}.r2`, secs.map((s) => {
    const inner = s.innerScrollers.map((i) => `${i.clientH}/${i.scrollH}@max${i.maxHeight}`).join(',') || '-';
    return `${String(s.section?.h ?? 0).padStart(5)}px  ${s.collapsed ? '[collapsed] ' : ''}${s.title}`
      + `   shrink=${s.flexShrink} grow=${s.flexGrow} basis=${s.flexBasis} inner=[${inner}]`;
  }));
  report(`${tag}.r3`, [
    `${visibleAtTop}/${secs.length} section headers are on screen with the column at scrollTop 0`,
  ]);

  // ---- r4: THE COUNTERFACTUAL, and the reason this parcel exists ---------
  const sorted = secs.slice().sort((a, b) => (b.section?.h ?? 0) - (a.section?.h ?? 0));
  const tallest = sorted[0];
  const tallestH = tallest.section?.h ?? 0;
  const others = natural - tallestH;
  const share = cont.clientH - others;
  const floored = share < SECTION_LIST_MIN_HEIGHT;
  report(`${tag}.r4`, [
    `IF "${tallest.title}" (${tallestH}px, the tallest) WERE variant="list":`,
    `  every other section keeps its natural height    = ${others}px`,
    `  the column has                                  = ${cont.clientH}px`,
    `  so its share would be                           = ${share}px`,
    `  SECTION_LIST_MIN_HEIGHT (read from source)      = ${SECTION_LIST_MIN_HEIGHT}px`,
    floored
      ? `  -> THE FLOOR ENGAGES. The section is pinned at ${SECTION_LIST_MIN_HEIGHT}px, the deficit goes back to `
        + `Panel's own scrollbar, and the column scrolls EXACTLY AS IT DOES NOW. The flex model is a NO-OP here.`
      : `  -> the flex model WOULD bind: a ${share}px share, above the floor. That section would gain its own `
        + `scrollbar and the column's ${cont.overflowPx}px of overflow would `
        + `${share >= tallestH ? 'not change — it already fits' : `drop to about ${Math.max(0, cont.overflowPx - (tallestH - share))}px`}.`,
  ]);

  await shot(c, `${tag}-${SCREEN}${PLANT ? `-plant-${PLANT}` : ''}`);
  return { tag, label, screen: SCREEN, plant: PLANT, sections: secs, container: cont, win, natural, share, floored };
}

// ==========================================================================
// Session helpers
// ==========================================================================
async function waitDbg(c) {
  for (let i = 0; i < 60; i++) {
    if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) return true;
    await sleep(300);
  }
  return false;
}
async function freshSession(c) {
  await c.evalExpr('localStorage.clear()').catch(() => {});
  await c.send('Page.reload');
  await sleep(4500);
  const ok = await waitDbg(c);
  if (!ok) throw new Error('__dbg never installed after reload — was the build made with VITE_AURORA_DEBUG=1?');
  await c.evalExpr(INSTALL);
}
async function openClassic(c) {
  await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`).catch((e) => note('open', 'classic open threw', e.message));
  let proj = null;
  for (let i = 0; i < 40; i++) {
    proj = await c.json('window.__dbg.projStatus()').catch(() => null);
    if (proj && proj.zones > 0) break;
    await sleep(400);
  }
  // An act has to finish loading before S1ObjectSection has a zone to list.
  let lvl = null;
  for (let i = 0; i < 40; i++) {
    lvl = await c.json('window.__dbg.levelState()').catch(() => null);
    if (lvl && lvl.status !== 'loading' && lvl.zone) break;
    await sleep(500);
  }
  await sleep(2000);
  await c.evalExpr(INSTALL);
  return { proj, lvl };
}
async function openAeon(c) {
  await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`).catch((e) => note('open', 'aeon open threw', e.message));
  let st = null;
  for (let i = 0; i < 40; i++) {
    st = await c.json('window.__dbg.aeon.state()').catch(() => null);
    if (st && st.open) break;
    await sleep(400);
  }
  await sleep(3000);
  await c.evalExpr(INSTALL);
  return st;
}
/** Type into the Explorer filter, which force-expands every group
 *  (`collapsedOverride`, Explorer.tsx:250) — the supported way in. */
async function explorerFilter(c, text) {
  const has = await c.evalExpr('window.__sc.filterInput() !== null');
  if (!has) return false;
  await clickEl(c, 'window.__sc.filterInput()');
  await key(c, 'a', 'KeyA', 65, 2);
  if (text) await typeText(c, text); else await key(c, 'Backspace', 'Backspace', 8, 0);
  await sleep(900);
  await c.evalExpr(INSTALL);
  return true;
}

// ==========================================================================
// MAIN
// ==========================================================================
async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  console.log(`=== section-column harness — SCREEN=${SCREEN}${PLANT ? `  PLANT=${PLANT}` : ''} ===`);
  console.log(`    SECTION_LIST_MIN_HEIGHT read from source = ${SECTION_LIST_MIN_HEIGHT}px`);
  console.log(`    uptime/load at start: ${execSync('uptime', { encoding: 'utf8' }).trim()}`);

  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run', ['-a', '-s', `-screen 0 ${SCREEN_W}x${SCREEN_H}x24`, ELECTRON, `${ROOT}/dist/main/index.mjs`], {
    cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  const measured = [];
  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    await waitDbg(c);

    // =====================================================================
    // PHASE A — a CLASSIC-ONLY session: Explorer, ProjectSetupTab,
    //           SpriteMode(7), CanvasMode(3 at its worst case)
    // =====================================================================
    await freshSession(c);
    const a = await openClassic(c);
    check('A.setup', 'the classic project (s1disasm) is open with an act loaded',
      !!(a.proj && a.proj.zones > 0) && !!(a.lvl && a.lvl.zone),
      `proj=${JSON.stringify(a.proj)} level=${JSON.stringify(a.lvl)}`);

    // --- Explorer -------------------------------------------------------
    // Its groups are `defaultCollapsed`, and the tempting way to open them all
    // is the filter box (`collapsedOverride`, Explorer.tsx:250). THAT WOULD BE
    // THE WRONG MEASUREMENT: a query force-expands the groups but also FILTERS
    // their items, so the widest tree would be measured at its narrowest. The
    // groups are expanded by clicking their real headers instead, with no query
    // — which is the state a user leaves behind and localStorage remembers.
    const expTitles = await bound(c, 0, PAGE_X);
    note('E.titles', 'Explorer groups on screen (no filter — every group expanded by clicking its header)',
      JSON.stringify(expTitles));
    measured.push(await measureSurface(c, 'E', 'Explorer (classic, all groups expanded, UNFILTERED)',
      { titles: expTitles }, { minLeft: 0, maxLeft: PAGE_X, expandAll: true, rowFloor: 100 }));

    // --- ProjectSetupTab -------------------------------------------------
    await explorerFilter(c, 'Project Setup');
    const openedSetup = await c.evalExpr(`window.__sc.clickExplorerRow('Project Setup')`);
    await sleep(2500);
    await explorerFilter(c, '');
    await sleep(800);
    check('P.setup', 'the Project Setup tab is open', openedSetup === true, `clicked=${openedSetup}`);
    if (openedSetup) {
      const pTitles = await bound(c, PAGE_X, 1e9);
      note('P.titles', 'ProjectSetupTab groups on screen', JSON.stringify(pTitles));
      measured.push(await measureSurface(c, 'P', 'ProjectSetupTab (classic, all groups expanded)',
        { titles: pTitles }, { minLeft: PAGE_X, expandAll: true }));
    }

    // --- SpriteMode, CLASSIC ONLY (expect 7) -----------------------------
    // editObjectArt is the same tab-open the object rows drive. $25 is a GHZ
    // object with art; any zone-resident object works.
    const openedSprite = await c.evalExpr('window.__dbg.editObjectArt(0x25)').catch((e) => `threw: ${e.message}`);
    await sleep(4000);
    await c.evalExpr(INSTALL);
    check('S7.setup', 'a sprite document is open in a CLASSIC-ONLY session',
      openedSprite === true, `editObjectArt(0x25) -> ${JSON.stringify(openedSprite)}`);
    const s7 = await bound(c, PAGE_X, 1e9);
    note('S7.titles', 'SpriteMode sections, classic-only session', JSON.stringify(s7));
    // The classic-only count: the four unconditional sections + the three the
    // classic gate adds. `project` is null here, so export/character are absent.
    check('S7.seven', 'SpriteMode mounts SEVEN sections in a classic-only session',
      s7.length === 7, `${s7.length}: ${JSON.stringify(s7)}`);
    measured.push(await measureSurface(c, 'S7', 'SpriteMode (classic only — seven)',
      { titles: s7 }, { minLeft: PAGE_X, expandAll: true, wheelSection: s7.find((t) => /objects$/i.test(t)) }));

    // --- CanvasMode, worst case (1024x1024 -> 16 commit rows) ------------
    // CommitPlanView renders one target row per 256x256 chunk
    // (CommitPlanView.tsx:128) with no cap and no scroller of its own, and
    // CANVAS_MAX_SIDE = 1024 (canvas-doc.ts:142) makes 4x4 = 16 the ceiling.
    // That is the largest a `canvas.commit` content section can ever be.
    let dlg = false;
    for (let i = 0; i < 3 && !dlg; i++) {
      await escapeKey(c); await sleep(300);
      await ctrlK(c); await sleep(700);
      await c.evalExpr(INSTALL);
      if (await c.evalExpr('window.__sc.paletteInput() !== null')) {
        await typeText(c, 'New Canvas'); await sleep(500); await enter(c); await sleep(900);
      }
      await c.evalExpr(INSTALL);
      dlg = await c.evalExpr('window.__sc.dlg() !== null');
    }
    check('C.setup', 'the New Canvas dialog opened', dlg === true, `dlgOpen=${dlg}`);
    if (dlg) {
      for (const [i, v] of [[0, '1024'], [1, '1024']]) {
        await clickEl(c, `window.__sc.dlgNums()[${i}]`);
        await key(c, 'a', 'KeyA', 65, 2);
        await typeText(c, v);
      }
      await sleep(500);
      await clickEl(c, 'window.__sc.dlgCreate()');
      await sleep(4000);
      await c.evalExpr(INSTALL);
      const rows = await c.evalExpr('window.__sc.commitRows()');
      check('C.i0', 'the commit plan really rendered its 16 per-chunk target rows',
        rows === 16, `"chunk N" labels on screen: ${rows} (a canvas under 256px would show none)`);
      const cTitles = await bound(c, PAGE_X, 1e9);
      note('C.titles', 'CanvasMode sections (1024x1024 canvas)', JSON.stringify(cTitles));
      measured.push(await measureSurface(c, 'C', 'CanvasMode (1024x1024 — worst case)',
        { titles: cTitles }, { minLeft: PAGE_X, expandAll: true }));
    }

    // =====================================================================
    // PHASE B — an AEON-ONLY session: SpriteMode(6), the docblock's number
    // =====================================================================
    await freshSession(c);
    const ast = await openAeon(c);
    const classicAfter = await c.json('window.__dbg.projStatus()').catch(() => null);
    check('B.setup', 'the aeon project is open and NO classic project is',
      !!(ast && ast.open) && !!(classicAfter && classicAfter.status !== 'open'),
      `aeon=${JSON.stringify(ast)} classic=${JSON.stringify(classicAfter)}`);
    if (ast && ast.open) {
      await explorerFilter(c, 'New Sprite');
      const newSprite = await c.evalExpr(`window.__sc.clickExplorerRow('New Sprite')`);
      await sleep(3500);
      await explorerFilter(c, '');
      await sleep(700);
      check('S6.setup', 'a sprite document is open in an AEON-ONLY session', newSprite === true, `clicked=${newSprite}`);
      const s6 = await bound(c, PAGE_X, 1e9);
      note('S6.titles', 'SpriteMode sections, aeon-only session', JSON.stringify(s6));
      // THE DOCBLOCK'S CLAIM, tested. ui/primitives.tsx:27 says "SpriteMode
      // mounts six". This is the configuration in which that is true.
      check('S6.doc', 'ui/primitives.tsx\'s "SpriteMode mounts six" holds in an aeon-only session',
        s6.length === 6, `${s6.length} sections: ${JSON.stringify(s6)}`);
      measured.push(await measureSurface(c, 'S6', 'SpriteMode (aeon only — the docblock\'s six)',
        { titles: s6 }, { minLeft: PAGE_X, expandAll: true }));

      // =================================================================
      // PHASE C — THE NINE. Aeon first, classic SECOND, without clearing:
      // open-project.ts's docblock says the resident aeon project survives a
      // classic open, and no app path resets it. If that is true, both gates
      // in SpriteMode.tsx are open at once and all nine sections mount.
      // =================================================================
      const cph = await openClassic(c);
      const both = await c.json('({ aeon: window.__dbg.aeon.state(), classic: window.__dbg.projStatus() })');
      check('S9.setup', 'BOTH projects are resident at once (aeon opened first, classic second)',
        !!(both.aeon && both.aeon.open) && both.classic.status === 'open', JSON.stringify(both));
      const opened9 = await c.evalExpr('window.__dbg.editObjectArt(0x25)').catch((e) => `threw: ${e.message}`);
      await sleep(4000);
      await c.evalExpr(INSTALL);
      check('S9.open', 'a sprite document is open with both projects resident',
        opened9 === true, `editObjectArt(0x25) -> ${JSON.stringify(opened9)} level=${JSON.stringify(cph.lvl)}`);
      const s9 = await bound(c, PAGE_X, 1e9);
      note('S9.titles', 'SpriteMode sections, BOTH projects resident', JSON.stringify(s9));
      // THE BOOKING'S CENTRAL NUMBER. Red here means the nine-section column is
      // NOT reachable and item 19's extreme case does not exist — which would be
      // the most useful possible outcome of this harness, not a failure of it.
      check('S9.nine', 'the nine-section SpriteMode column is REACHABLE (item 19\'s extreme case)',
        s9.length === 9, `${s9.length} sections: ${JSON.stringify(s9)}`);
      measured.push(await measureSurface(c, 'S9', 'SpriteMode (BOTH projects — the nine)',
        { titles: s9 }, { minLeft: PAGE_X, expandAll: true, wheelSection: s9.find((t) => /objects$/i.test(t)) }));
    }
  } finally {
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* */ }
      await sleep(3000);
      try { c.close(); } catch { /* */ }
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    try { execSync(`pkill -f 'aurora/dist/main/inde[x].mjs' 2>/dev/null; true`, { shell: '/bin/bash' }); } catch { /* */ }
    await sleep(1000);
    console.log(`\nport free after teardown: ${await portFree()}`);
  }

  const clean = measured.filter(Boolean);
  const file = SUMMARY(SCREEN + (PLANT ? `-plant-${PLANT}` : ''));
  writeFileSync(file, JSON.stringify({
    screen: SCREEN, plant: PLANT, when: new Date().toISOString(),
    uptime: execSync('uptime', { encoding: 'utf8' }).trim(),
    // The window as the PAGE saw it, not as xvfb was asked for — the two differ
    // by the OS frame, and every derived "needs a window N px tall" is computed
    // from this rather than from SCREEN_H.
    innerH: clean.length ? clean[0].win.innerH : null,
    innerW: clean.length ? clean[0].win.innerW : null,
    surfaces: clean.map((m) => ({
      tag: m.tag, label: m.label, natural: m.natural, share: m.share, floored: m.floored,
      clientH: m.container.clientH, scrollH: m.container.scrollH, overflowPx: m.container.overflowPx,
      sections: m.sections.map((s) => ({ title: s.title, h: s.section?.h ?? 0 })),
    })),
    results, notes,
  }, null, 2));
  console.log(`\nsummary -> ${file}`);
  compare(true);

  console.log(`\n    uptime/load at end: ${execSync('uptime', { encoding: 'utf8' }).trim()}`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed   (+${notes.length} NOT-MEASURED / context notes)`);
  if (fails.length) { console.log(`\nfailed rows:\n  ${fails.join('\n  ')}`); process.exit(1); }
}

/**
 * c5 — the natural stack height must be a property of the CONTENT, not of the
 * window — plus the minimum-window-height derivation both runs make possible.
 *
 * Reads the two UNPLANTED summaries. If both are not present this reports NOT
 * MEASURED rather than passing: a self-check that quietly skips is the vacuous-
 * guard failure this repo keeps finding.
 */
function compare(quiet = false) {
  const a = SUMMARY('1680x1050'), b = SUMMARY('1280x800');
  if (!existsSync(a) || !existsSync(b)) {
    const msg = `need BOTH ${a} and ${b}; run the harness at both SCREEN sizes, then --compare`;
    if (quiet) console.log(`\n[c5] cross-size self-check NOT MEASURED — ${msg}`);
    else note('c5', 'NOT MEASURED', msg);
    return;
  }
  const A = JSON.parse(readFileSync(a, 'utf8')), B = JSON.parse(readFileSync(b, 'utf8'));
  console.log('\n=== [c5] cross-size self-check: is the natural stack height a content property? ===');
  let worst = 0;
  let compared = 0;
  for (const sa of A.surfaces) {
    const sb = B.surfaces.find((s) => s.tag === sa.tag);
    if (!sb) { console.log(`  ${sa.tag}: only measured at 1680x1050 — NOT COMPARABLE`); continue; }
    compared++;
    const drift = Math.abs(sa.natural - sb.natural) / Math.max(1, sa.natural);
    worst = Math.max(worst, drift);
    console.log(`  ${sa.tag.padEnd(3)} natural ${String(sa.natural).padStart(5)}px @1050  vs `
      + `${String(sb.natural).padStart(5)}px @800   drift ${(drift * 100).toFixed(1)}%   `
      + `column ${sa.clientH}->${sb.clientH}   overflow ${sa.overflowPx}->${sb.overflowPx}px`);
  }
  if (!compared) { console.log('  NOTHING COMPARABLE — the two runs measured no surface in common.'); return; }
  const ok = worst <= 0.04;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [c5] the natural stack height is a content property `
    + `(worst drift ${(worst * 100).toFixed(1)}% across ${compared} surfaces, budget 4%)`);
  console.log('      If this is RED, every px number above is window-dependent and the');
  console.log('      "minimum window height" derivation below is not a number at all.');

  // WHAT WINDOW WOULD BE BIG ENOUGH? Derived, not modelled: the shell's chrome
  // (app bar + tool options + status bar) is whatever the two runs say it is —
  // `innerH - column.clientH` — read off BOTH sizes so a chrome that is itself
  // height-dependent shows up as a disagreement rather than hiding.
  console.log('\n=== MINIMUM WINDOW HEIGHT for a scrollbar-free column, per surface ===');
  for (const sa of A.surfaces) {
    const sb = B.surfaces.find((s) => s.tag === sa.tag);
    if (!sb) continue;
    const chromeA = A.innerH - sa.clientH;
    const chromeB = B.innerH - sb.clientH;
    const chrome = Math.round((chromeA + chromeB) / 2);
    console.log(`  ${sa.tag.padEnd(3)} ${sa.label}`);
    console.log(`      natural stack ${sa.natural}px + shell chrome ${chrome}px `
      + `(measured ${chromeA} @innerH ${A.innerH} / ${chromeB} @innerH ${B.innerH})`);
    console.log(`      -> needs a window about ${sa.natural + chrome}px tall to lose its scrollbar`);
    console.log(`      at 1050: column ${sa.clientH}px, overflow ${sa.overflowPx}px`
      + `   |   at 800: column ${sb.clientH}px, overflow ${sb.overflowPx}px`);
    if (Math.abs(chromeA - chromeB) > 24) {
      console.log('      WARNING: the chrome is not constant across the two sizes, so the');
      console.log('      "needs a window N px tall" number above is an ESTIMATE, not a measurement.');
    }
  }
}

if (process.argv.includes('--compare')) { compare(); }
else main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
