#!/usr/bin/env node
// ===========================================================================
// IS THE EFFECTS COLUMN MESSY?  — ROADMAP item 41, a MEASUREMENT instrument.
// ===========================================================================
//
// The owner looked at OJZ act 1's banded canopy scene in map mode and said
// "see how everything is a bit messy on the right panel". That is the whole
// brief, and it is an aesthetic claim about RENDERED GEOMETRY — so the ~4,500
// node tests cannot see it, cannot see the fix, and cannot see the fix breaking.
// Bar 1, verbatim. This file is the entire verification story for that parcel.
//
// It drives the REAL app under CDP against the REAL aeon tree, opens the REAL
// scene the owner was looking at (`ojz_act1_start`, "OJZ act 1 start — banded
// canopy"), and measures four things that "messy" decomposes into:
//
//   1. A RAGGED LABEL COLUMN. Both panels lay out `<span style={label}>` +
//      control in flex rows with a hand-set `minWidth: 68`. `minWidth` is a
//      FLOOR: a label wider than 68px pushes its own control right and no
//      other row follows it. So the controls do not line up, and the quantity
//      that says so is `firstControl.left - row.left` — the width of the label
//      column AS RENDERED, per row.
//
//      WHY THAT QUANTITY AND NOT THE ABSOLUTE x. Layer cards and band cards
//      are bordered, padded containers, so their rows start ~9px right of the
//      panel's rows and always will. An absolute-x rule would demand the cards
//      be un-nested, which is not what "the labels line up" means. The offset
//      from the row's own left edge is invariant to nesting and IS the label
//      column's width.
//
//   2. THREE LISTS SPLITTING ONE 300px COLUMN. `variant="list"` means "take an
//      equal share of what is left and scroll inside it" (ui/CollapsibleSection
//      docblock). Three of them, plus SECTION_LIST_MIN_HEIGHT = 160 as a floor,
//      in a column that is already over-subscribed, gives three competing
//      short scroll regions instead of one readable column. The observable is
//      `flex-grow: 1` on a section box — LIST_SECTION's own declaration, read
//      off the rendered element rather than off the source.
//
//   3. COMPETING SCROLLERS. Counted as elements inside the column whose
//      overflow is auto/scroll AND whose content actually exceeds them, so a
//      declared-but-never-engaged `overflowY: auto` is not counted as a
//      scrollbar the author has to deal with. The Panel itself is one of them.
//
//   4. SEVEN SECTIONS, SIX OF THEM OPEN ON ARRIVAL. Measured after a real
//      `localStorage.clear()` + reload, so it is the ARRIVAL state and not
//      whatever this machine's panel-state happened to hold.
//
// ===========================================================================
// WHICH OBSERVABLE EACH ROW USES, AND WHY IT CAN SEE THE CHANGE
// ===========================================================================
// docs/OVERSEER.md bar 2b is about this repo's other section harness and about
// exactly this kind of parcel: a row named "no section paints over the one
// below it" compared BORDER BOXES, while the defect it existed for moves a
// section's CHILDREN and leaves the box where flexbox put it. Both of that
// harness's false verdicts are live in this territory, and this parcel
// deliberately changes clipping and overflow. So, row by row:
//
//   [L1] control-column offset, from getBoundingClientRect of the row and of
//        its first control. NOT a source scan: a `minWidth` that is being
//        overrun by its own text renders wider than it declares, and only the
//        rect knows.
//   [L2] label overflow, from scrollWidth vs clientWidth and from rendered
//        height vs line height. A fixed label column that is too NARROW
//        truncates or wraps, which is the failure mode a fixed width invites
//        and the reason L1 alone is not enough.
//   [S1] `flex-grow` from getComputedStyle on the section box. The rendered
//        declaration, so a section that is collapsed (and therefore rendered
//        as CONTENT_SECTION whatever its variant says) counts as what it
//        actually is.
//   [S2] scrollHeight > clientHeight on elements whose computed overflow
//        scrolls. Engagement, not declaration.
//   [C1] PAINTED EXTENT, `contentBottom` — walks descendants for the lowest
//        painted pixel and STOPS AT ANY CLIPPING BOX, because descending into
//        an `overflow: auto` list would red-flag every capped list in the app.
//        This is the repaired observable from bar 2b, copied deliberately: a
//        border-box comparison cannot see the 954px shape and never could.
//        The border-box overlap is reported separately as [r.box].
//   [A1] which sections have a rendered body after a clean load. Not the
//        `defaultCollapsed` attribute — that is source, and a source scan
//        cannot tell you that the section also got force-expanded by an
//        override or that its body is empty for want of data.
//
// ===========================================================================
// ANTI-VACUITY (bar 3)
// ===========================================================================
// Every claim row below is GATED on the instrument rows, which prove the
// subject was on screen:
//   [i0] the aeon project is open and has sections     (store, not DOM)
//   [i1] the Effects facet is the mounted facet        (store, not DOM)
//   [i2] the banded canopy scene is the SELECTED scene (store, not DOM) — the
//        exact subject the owner was looking at, so a run against an empty
//        project cannot report a tidy column
//   [i3] the column was found, with N >= 5 titled sections, and they are NAMED
//   [i4] at least 8 labelled rows were found, and they are NAMED — an L1 that
//        found no rows would report "0 distinct offsets" and read as perfect
//   [i5] PHASE 2 — every section was clicked open and the row count went UP.
//        This parcel CLOSES the densest section on arrival, so phase 1 measures
//        a label column that contains none of its fields; a tidy verdict that
//        skips the densest section is this bar in a costume.
//   [i6] the only section excluded from the label rows is the declared foreign
//        one (see FOREIGN_SECTIONS), so the exclusion cannot grow silently
//   [V.set] the viewport is the size this run asked for
// A failed instrument row aborts: a verdict with no subject is not evidence.
//
// ===========================================================================
// RED-FIRST (bar 2). Each plant names ONE judge; the run fails if that judge
// stays green, whatever else happens to go red.
// ===========================================================================
//   PLANT=label     widen one label span at runtime      -> judge L1
//   PLANT=narrow    squeeze the label column to 20px     -> judge L2
//   PLANT=pair      splice a second label+control mid-row-> judge L3
//   PLANT=list      declare a second section flex-grow:1 -> judge S1
//   PLANT=scroller  cap a content body so it scrolls     -> judge S2
//   PLANT=overhang  take the scroller off the list body  -> judge C1
//                   (the 954px effects-panel shape, reproduced)
//   PLANT=arrival   expand a section that arrives closed -> judge A1
//
// ===========================================================================
//   VITE_AURORA_DEBUG=1 npm run build      # __dbg only exists with the flag
//   node scratchpad/effects-column-harness.mjs
//   SCREEN=1280x800 node scratchpad/effects-column-harness.mjs
//   PLANT=label node scratchpad/effects-column-harness.mjs
//   BASELINE=1 node scratchpad/effects-column-harness.mjs   # see below
//
// BASELINE=1 turns the TARGET rows (L1, L3, S1, S2, A1) into reports instead
// of gates, because on the pre-parcel tree they are red BY CONSTRUCTION — they
// state the shape the parcel is going to build. A baseline run that reported
// "4 failures" would be noise; a baseline run that reports the numbers is the
// before half of the evidence. The plants are never run in this mode.
//
// Screenshots -> scratchpad/shots-effects-column/. Writes nothing to disk in
// the project trees: no Ctrl+S is ever pressed and no command is executed.
// ===========================================================================

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9399);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-effects-column`;
mkdirSync(SHOTS, { recursive: true });

const SCREEN = process.env.SCREEN ?? '1680x1050';
const [SCREEN_W, SCREEN_H] = SCREEN.split('x').map(Number);
const PLANT = process.env.PLANT ?? '';
const BASELINE = process.env.BASELINE === '1';
const VIEWPORT = { requested: { w: SCREEN_W, h: SCREEN_H }, achieved: null, mechanism: 'none' };

/** The scene the owner was looking at. Read back from the store by [i2]. */
const SUBJECT_SCENE = 'ojz_act1_start';

/**
 * THE ARRIVAL STATE THIS PARCEL COMMITS TO, and the one number in this file
 * that is a design decision rather than a measurement.
 *
 * An author arriving at the Effects facet is looking at a scene: which one,
 * what it does, and which section uses it. Those three are open. The two
 * CREATION forms — "New band" and the properties readout — are not what
 * arrival is for, and between them they are the two densest boxes in the
 * column, so they arrive closed and one click away.
 *
 * "BG animation bands" arrives OPEN even though it is the other half of the
 * column: it is a readout of what the background already does, it is bounded
 * at four rows by the contract, and closing it would hide the fact that the
 * facet does bands at all.
 */
const EXPECTED_OPEN = ['Scenes', 'Scene', 'Layers', 'Section assignment', 'BG animation bands'];
const EXPECTED_CLOSED = ['New band', 'Properties'];

/**
 * THE ONE SECTION IN THIS COLUMN THIS PARCEL DOES NOT OWN, named rather than
 * quietly filtered out.
 *
 * `aeon.props` mounts `AeonPropertiesPanel`, which is the SAME panel Layout,
 * Objects, Rings and Collision mount (section-ids.test.ts calls that reuse
 * legal and explains why). Its label column is its own — measured at 148px
 * against this column's 68 — and moving it would move four other facets'
 * columns, which is not a design pass on two effects panels. It also arrives
 * COLLAPSED in this facet and did before this parcel, so it is not what the
 * owner was looking at.
 *
 * BOOKED, NOT FIXED. The disagreement is real and [r8] prints it every run, so
 * the exclusion cannot rot into an unexamined habit; and [i6] asserts the
 * excluded set is EXACTLY this list, so it cannot silently grow to swallow a
 * section this parcel does own.
 */
const FOREIGN_SECTIONS = ['Properties'];
const isForeign = (title) => FOREIGN_SECTIONS.includes(title.replace(/\s*[—(].*$/, '').trim());

/** Which row each plant must turn red. A plant whose judge stays green is a failed run. */
const PLANT_JUDGE = {
  label: 'L1', narrow: 'L2', pair: 'L3', list: 'S1', scroller: 'S2', overhang: 'C1', arrival: 'A1',
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
      if (page) return page;
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
/** A number, not a verdict. Reports ARE the measurement. */
function report(id, name, detail) {
  console.log(`  ..  [${id}] ${name}\n        ${detail}`);
  results.push({ id, name, ok: null });
}
/**
 * A row that this parcel is BUILDING. Red by construction on the pre-parcel
 * tree, so BASELINE=1 demotes it to a report rather than pretending the
 * before-measurement failed at something.
 */
function target(id, name, ok, detail) {
  if (BASELINE) return report(id, `${name} [TARGET — reported, not gated, on the baseline tree]`,
    `${ok ? 'already holds' : 'does not hold yet'} — ${detail}`);
  return check(id, name, ok, detail);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-effects-column/${name}.png`);
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

// ---------------------------------------------------------------------------
// THE COLUMN PROBE
// ---------------------------------------------------------------------------
// `ui/primitives.tsx`'s PanelHeader is rendered by exactly ONE component in the
// whole renderer (grep "<PanelHeader": only ui/CollapsibleSection). So a div
// with PanelHeader's computed signature IS a titled section header, its
// grandparent is the section box, and that box's parent is the column. The
// enumeration is therefore structural and one-to-one with the source call
// sites, rather than a list of titles somebody maintains.
//
// The Explorer is persistent and its groups are titled sections too, so the
// column is chosen as the one whose sections sit furthest RIGHT.
const COLUMN_PROBE = String.raw`
(() => {
  const R = (el) => { const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, bottom: r.bottom, right: r.right }; };
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const headers = [...document.querySelectorAll('div')].filter(isHeader);
  if (!headers.length) return { error: 'no PanelHeader on screen' };

  // section box = header -> toggle div -> section box
  const boxes = headers.map((h) => ({ header: h, box: h.parentElement && h.parentElement.parentElement }))
    .filter((s) => s.box);
  // The column = the parent shared by the RIGHTMOST family of section boxes.
  const byParent = new Map();
  for (const s of boxes) {
    const p = s.box.parentElement;
    if (!p) continue;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(s);
  }
  let column = null, best = -1;
  for (const [p, list] of byParent) {
    const left = p.getBoundingClientRect().left;
    if (left > best) { best = left; column = { el: p, list }; }
  }
  if (!column) return { error: 'no section column found' };
  const col = column.el;
  const colCS = getComputedStyle(col);
  const colRect = col.getBoundingClientRect();

  const clips = (el) => {
    const cs = getComputedStyle(el);
    return /auto|scroll|hidden/.test(cs.overflowY) || /auto|scroll|hidden/.test(cs.overflowX);
  };
  const scrolls = (el) => {
    const cs = getComputedStyle(el);
    return /auto|scroll/.test(cs.overflowY) || /auto|scroll/.test(cs.overflowX);
  };
  /**
   * THE LOWEST PAINTED PIXEL, STOPPING AT ANY CLIPPING BOX.
   * Border-box geometry cannot see a section whose CHILDREN spill below it
   * while flexbox holds the box still (OVERSEER bar 2b). Descending THROUGH an
   * overflow:auto list would red-flag every capped list in the app, which is
   * the opposite false verdict, so the walk stops there.
   */
  const contentBottom = (el) => {
    let b = el.getBoundingClientRect().bottom;
    if (clips(el)) return b;
    for (const k of el.children) {
      const kr = k.getBoundingClientRect();
      if (kr.width === 0 && kr.height === 0) continue;
      b = Math.max(b, contentBottom(k));
    }
    return b;
  };

  const sections = column.list.map(({ header, box }) => {
    const cs = getComputedStyle(box);
    const title = (header.firstElementChild.textContent || '').trim();
    // The toggle div is children[0]; anything after it is the body.
    const bodies = [...box.children].slice(1);
    const bodyH = bodies.reduce((a, k) => a + k.getBoundingClientRect().height, 0);
    return {
      title,
      expanded: bodies.length > 0,
      bodyNodes: bodies.length,
      bodyH: Math.round(bodyH),
      rect: R(box),
      contentBottom: contentBottom(box),
      flexGrow: cs.flexGrow, flexBasis: cs.flexBasis, minHeight: cs.minHeight, maxHeight: cs.maxHeight,
    };
  });

  // Every scroller inside (and including) the column, and whether it ENGAGED.
  const all = [col, ...col.querySelectorAll('*')];
  const scrollers = all.filter(scrolls).map((el) => ({
    tag: el.tagName,
    isColumn: el === col,
    engaged: el.scrollHeight > el.clientHeight + 1,
    over: el.scrollHeight - el.clientHeight,
    h: Math.round(el.getBoundingClientRect().height),
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 46),
  }));

  // ------------------------------------------------------------------
  // LABELLED ROWS. A row is a flex-row div in the column; a LABELLED row is
  // one whose first element child is a text <span> and which contains a form
  // control after it. Section headers are flex rows too and are excluded by
  // identity, not by guessing.
  // ------------------------------------------------------------------
  const headerSet = new Set(headers);
  const inHeader = (el) => { for (let p = el; p; p = p.parentElement) if (headerSet.has(p)) return true; return false; };
  const isControl = (el) => el.matches('input,select,textarea,button')
    || !!el.querySelector('input,select,textarea,button');
  const sectionOf = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const s = column.list.find((x) => x.box === p);
      if (s) return (s.header.firstElementChild.textContent || '').trim();
    }
    return '?';
  };
  const rows = [];
  for (const d of col.querySelectorAll('div')) {
    if (headerSet.has(d) || inHeader(d)) continue;
    const cs = getComputedStyle(d);
    if (cs.display !== 'flex' || cs.flexDirection !== 'row') continue;
    const kids = [...d.children];
    if (kids.length < 2) continue;
    const first = kids[0];
    if (first.tagName !== 'SPAN') continue;
    if (isControl(first)) continue;
    const text = (first.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    // THE CONTROL MUST BE THE LABEL'S IMMEDIATE SIBLING. "A label followed by
    // its control" is what a label column IS; a span with a control somewhere
    // later in the row is a card head or a readout, and folding those in would
    // measure a button's x against a label column it was never in.
    if (!isControl(kids[1])) continue;
    const ci = 1;
    const rowRect = d.getBoundingClientRect();
    const ctl = kids[ci];
    // The control the author's eye lines up on is the control ITSELF, not the
    // wrapper a panel happened to put around it.
    const ctlEl = ctl.matches('input,select,textarea,button') ? ctl
      : ctl.querySelector('input,select,textarea,button');
    const ctlRect = ctlEl.getBoundingClientRect();
    const lr = first.getBoundingClientRect();
    const lcs = getComputedStyle(first);
    // The label TEXT's own width, measured with a Range over its contents.
    // scrollWidth is clamped to clientWidth for visible overflow, so it
    // cannot answer "is the column wide enough" — this can, and it is what the
    // label-column width is derived FROM rather than guessed at.
    let naturalW = 0;
    try {
      const rg = document.createRange();
      rg.selectNodeContents(first);
      naturalW = Math.ceil(rg.getBoundingClientRect().width);
    } catch { naturalW = -1; }
    // How many (span immediately followed by a control) pairs the row holds.
    // More than one means a second label mid-row, which no label column can
    // include. Reported, not gated — a trailing hint span before a chip looks
    // the same from here, and saying so is the point.
    let pairs = 0;
    for (let i = 0; i < kids.length - 1; i++) {
      if (kids[i].tagName === 'SPAN' && !isControl(kids[i])
          && (kids[i].textContent || '').trim() && isControl(kids[i + 1])) pairs++;
    }
    rows.push({
      section: sectionOf(d), label: text,
      rowLeft: Math.round(rowRect.left * 10) / 10,
      ctlLeft: Math.round(ctlRect.left * 10) / 10,
      offset: Math.round((ctlRect.left - rowRect.left) * 10) / 10,
      labelW: Math.round(lr.width * 10) / 10,
      labelH: Math.round(lr.height * 10) / 10,
      overflowing: naturalW > first.clientWidth + 1,
      naturalW, scrollW: first.scrollWidth, clientW: first.clientWidth,
      lineH: lcs.lineHeight, fontSize: lcs.fontSize,
      pairs,
    });
  }

  // Headers reachable without scrolling the column.
  const visibleHeaders = column.list.filter(({ header }) => {
    const r = header.getBoundingClientRect();
    return r.top >= colRect.top - 1 && r.bottom <= colRect.bottom + 1;
  }).length;

  return {
    column: {
      rect: R(col), overflowY: colCS.overflowY,
      scrollHeight: col.scrollHeight, clientHeight: col.clientHeight,
      overflow: col.scrollHeight - col.clientHeight,
      width: Math.round(colRect.width),
    },
    sections, scrollers, rows, visibleHeaders,
  };
})()`;

/**
 * Click every collapsed section in the right-hand column open, by its header —
 * the gesture a human makes, not a store write. Returns what it clicked.
 */
const OPEN_ALL = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hs = [...document.querySelectorAll('div')].filter(isHeader)
    .filter((h) => h.getBoundingClientRect().left > 400);
  const clicked = [];
  for (const h of hs) {
    if (h.parentElement.parentElement.children.length > 1) continue;
    clicked.push((h.firstElementChild.textContent || '').trim());
    h.click();
  }
  return clicked;
})()`;

// --- the plants ------------------------------------------------------------
// Applied at RUNTIME through CDP: they restyle the live DOM into the shape
// whose absence the judged row asserts. No rebuild.
const PLANTS = {
  // A single label made wider than its column. This is the pre-parcel failure
  // in miniature: `minWidth` is a floor, so one long label moves its own
  // control and nothing follows it.
  label: String.raw`
(() => {
  const spans = [...document.querySelectorAll('span')]
    .filter((s) => /^(V factor|Driver|Cols|Name)$/.test((s.textContent||'').trim()));
  if (!spans.length) return 'no-label';
  spans[0].style.minWidth = '140px';
  spans[0].style.width = '140px';
  return 'planted:' + (spans[0].textContent||'').trim();
})()`,
  // The label column squeezed until its own text no longer fits — the failure
  // a FIXED width invites, and the one L1 alone cannot see.
  narrow: String.raw`
(() => {
  const spans = [...document.querySelectorAll('span')]
    .filter((s) => /^(V factor|Transition|Rate shift|Precision)$/.test((s.textContent||'').trim()));
  if (!spans.length) return 'no-label';
  for (const s of spans) { s.style.width = '20px'; s.style.minWidth = '20px'; s.style.overflow = 'hidden'; }
  return 'planted:' + spans.length;
})()`,
  // A second label+control pair spliced into a row that had one. This is the
  // `[V center][box][V offset][box]` shape, reproduced: the second label sits
  // at whatever x the first control ended at, which no label column governs.
  pair: String.raw`
(() => {
  const isControl = (el) => el.matches('input,select,textarea,button') || !!el.querySelector('input,select,textarea,button');
  const rows = [...document.querySelectorAll('div')].filter((d) => {
    if (d.getBoundingClientRect().left < 400) return false;
    const cs = getComputedStyle(d);
    if (cs.display !== 'flex' || cs.flexDirection !== 'row') return false;
    const k = [...d.children];
    return k.length >= 2 && k[0].tagName === 'SPAN' && (k[0].textContent||'').trim() && isControl(k[1]);
  });
  if (!rows.length) return 'no-row';
  const victim = rows[0];
  const s = document.createElement('span');
  s.textContent = 'Planted';
  s.style.cssText = 'font-size:11px;color:#888;flex-shrink:0;min-width:68px';
  const i = document.createElement('input');
  i.type = 'number'; i.value = '1'; i.style.width = '40px';
  victim.appendChild(s); victim.appendChild(i);
  return 'planted into "' + (victim.children[0].textContent||'').trim() + '"';
})()`,
  // A second section declaring itself a list. Reproduces "three lists split
  // one column" without touching CollapsibleSection.
  list: String.raw`
(() => {
  const isHeader = (el) => { if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN'; };
  const boxes = [...document.querySelectorAll('div')].filter(isHeader)
    .map((h) => h.parentElement.parentElement);
  const victim = boxes.filter((b) => getComputedStyle(b).flexGrow === '0')
    .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
  if (!victim) return 'no-content-section';
  victim.style.flex = '1 1 0';
  victim.style.minHeight = '160px';
  return 'planted';
})()`,
  // A content body capped until it scrolls: another competing scrollbar.
  scroller: String.raw`
(() => {
  const isHeader = (el) => { if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN'; };
  const boxes = [...document.querySelectorAll('div')].filter(isHeader)
    .map((h) => h.parentElement.parentElement)
    .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
  // Bodies that do NOT already scroll — capping one that does would add no
  // scrollbar at all.
  //
  // TWO OF THEM, AND THE COUNT IS THE WHOLE POINT. The first version of this
  // plant capped ONE body and came back GREEN, which is bar 2d's "a poison that
  // returns green" — but the cause was none of the three: S2 asserts AT MOST
  // TWO live scrollbars (the column, and the one list), the fixed column had
  // exactly one, and one extra is still two. The row was measuring exactly the
  // right quantity and reported it moving 1 -> 2; the PLANT simply had not
  // installed a violation of the stated property. A plant calibrated to
  // "something changed" is not a plant. Two extras is three, which is the
  // shape the row forbids.
  const victims = boxes.map((b) => b.children[1])
    .filter((b) => b && b.scrollHeight > 60 && !/auto|scroll/.test(getComputedStyle(b).overflowY))
    .slice(0, 2);
  if (victims.length < 2) return 'no-body';
  for (const v of victims) { v.style.maxHeight = '40px'; v.style.overflowY = 'auto'; }
  return 'planted:' + victims.length;
})()`,
  // THE 954px SHAPE. A list section keeps its share of the column and its body
  // stops clipping, so the data-sized content paints straight over the sections
  // beneath it while every border box stays exactly where flexbox put it.
  overhang: String.raw`
(() => {
  const isHeader = (el) => { if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN'; };
  const boxes = [...document.querySelectorAll('div')].filter(isHeader)
    .map((h) => h.parentElement.parentElement)
    .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
  const lists = boxes.filter((b) => getComputedStyle(b).flexGrow === '1');
  if (!lists.length) return 'no-list-section';
  let n = 0;
  for (const b of lists) {
    for (const body of [...b.children].slice(1)) { body.style.overflowY = 'visible'; n++; }
    b.style.maxHeight = '120px';
    b.style.flex = '0 0 120px';
    b.style.overflow = 'visible';
  }
  return 'planted:' + n;
})()`,
  // A section that arrives closed, opened. The arrival state is then not what
  // the panel declares, which is exactly what A1 measures.
  arrival: String.raw`
(() => {
  const isHeader = (el) => { if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN'; };
  const hs = [...document.querySelectorAll('div')].filter(isHeader)
    .filter((h) => h.getBoundingClientRect().left > 400);
  const closed = hs.find((h) => h.parentElement.parentElement.children.length === 1);
  if (!closed) return 'no-closed-section';
  const title = (h => (h.firstElementChild.textContent||'').trim())(closed);
  closed.click();
  return 'planted:' + title;
})()`,
};

async function setViewport(c, browserWsUrl, targetId, w, h) {
  const read = () => c.json('({ w: window.innerWidth, h: window.innerHeight })');
  const fits = (v) => Math.abs(v.w - w) <= 4 && Math.abs(v.h - h) <= 4;
  if (browserWsUrl && targetId) {
    try {
      const b = cdp(browserWsUrl); await b.ready;
      const { windowId } = await b.send('Browser.getWindowForTarget', { targetId });
      await b.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
      await b.send('Browser.setWindowBounds', { windowId, bounds: { width: w, height: h } });
      b.close();
      await sleep(1200);
      const after = await read();
      if (fits(after)) { VIEWPORT.achieved = after; VIEWPORT.mechanism = 'Browser.setWindowBounds'; return; }
    } catch { /* fall through */ }
  }
  await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const after = await read();
  if (fits(after)) { VIEWPORT.achieved = after; VIEWPORT.mechanism = 'Emulation.setDeviceMetricsOverride'; return; }
  VIEWPORT.achieved = after; VIEWPORT.mechanism = 'FAILED';
}

async function main() {
  console.log(`\n=== EFFECTS COLUMN — ROADMAP item 41 ===`);
  console.log(`viewport asked: ${SCREEN_W}x${SCREEN_H}   plant: ${PLANT || 'none'}   `
    + `mode: ${BASELINE ? 'BASELINE (targets reported, not gated)' : 'GATED'}\n`);
  if (BASELINE && PLANT) throw new Error('BASELINE and PLANT are mutually exclusive');

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1920x1200x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[main] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    const page = await waitForTarget();
    let browserWs = null;
    try { browserWs = (await getJSON('/json/version')).webSocketDebuggerUrl ?? null; } catch { /* none */ }
    c = cdp(page.webSocketDebuggerUrl);
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
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    // A REAL clean arrival: no persisted panel state from any earlier run.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    await setViewport(c, browserWs, page.id, SCREEN_W, SCREEN_H);
    check('V.set', `the page viewport is ${SCREEN_W}x${SCREEN_H}`,
      VIEWPORT.mechanism !== 'FAILED',
      `${JSON.stringify(VIEWPORT.achieved)} via ${VIEWPORT.mechanism}`);
    if (VIEWPORT.mechanism === 'FAILED') throw new Error('viewport not settable — every px below would be from a window nobody asked for');

    // ---- instrument rows -------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('i0', 'the aeon project is open, with sections [instrument — store, not DOM]',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    await sleep(2500);
    const clicked = await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1500);
    check('i1', 'the Effects facet pill was clicked [instrument]', clicked === true,
      `click=${clicked}`);
    if (clicked !== true) throw new Error('could not reach the Effects facet');

    // The SUBJECT: the owner's own scene, read off the DOM heading that names
    // the selected scene — the section title is `Scene — ${selected.id}`, and
    // no leftover paint can produce it for a scene that is not selected.
    const sceneTitles = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^Scene — /.test(t))`);
    const onSubject = sceneTitles.some((t) => t.includes(SUBJECT_SCENE));
    check('i2', `the selected scene is the owner's banded canopy (${SUBJECT_SCENE}) [instrument]`,
      onSubject, JSON.stringify(sceneTitles));
    if (!onSubject) throw new Error('the subject scene is not selected — a tidy verdict here would be about nothing');

    if (PLANT) {
      if (!PLANTS[PLANT]) throw new Error(`unknown PLANT=${PLANT}`);
      const r = await c.evalExpr(PLANTS[PLANT]);
      console.log(`\n*** PLANT=${PLANT} applied: ${r}  (judge = ${PLANT_JUDGE[PLANT]}) ***\n`);
      if (typeof r === 'string' && r.startsWith('no-')) {
        throw new Error(`plant ${PLANT} found no subject (${r}) — a plant that cannot install is not evidence`);
      }
      await sleep(600);
    }

    const m = await c.json(COLUMN_PROBE);
    if (m.error) throw new Error(`column probe: ${m.error}`);
    await shot(c, `column-${PLANT || (BASELINE ? 'baseline' : 'after')}-${SCREEN_W}x${SCREEN_H}`);

    const titles = m.sections.map((s) => s.title);
    check('i3', 'the effects column was found, with its titled sections [instrument]',
      m.sections.length >= 5 && m.column.width >= 240 && m.column.width <= 420,
      `${m.sections.length} sections in a ${m.column.width}px column: ${JSON.stringify(titles)}`);
    if (m.sections.length < 5) throw new Error('column not enumerable');

    // Rows in the sections these two panels own. See FOREIGN_SECTIONS.
    m.rows = m.rows.filter((r) => !isForeign(r.section));
    check('i4', 'labelled rows were found in the column [instrument]',
      m.rows.length >= 8,
      `${m.rows.length} rows: ${JSON.stringify(m.rows.map((r) => `${r.section}/${r.label}`))}`);
    if (m.rows.length < 8) throw new Error('no labelled rows — L1/L2 would be vacuous');

    // ---- L1: the label column -------------------------------------------
    const offsets = [...new Set(m.rows.map((r) => r.offset))].sort((a, b) => a - b);
    const spread = offsets.length ? offsets[offsets.length - 1] - offsets[0] : 0;
    const byOffset = {};
    for (const r of m.rows) (byOffset[r.offset] ??= []).push(`${r.section}/${r.label}`);
    target('L1', 'every labelled row starts its control at ONE label-column width',
      offsets.length === 1,
      `${offsets.length} distinct offsets, spread ${spread}px: ` + JSON.stringify(byOffset));

    // ---- L2: no label truncated or wrapped ------------------------------
    const bad = m.rows.filter((r) => r.overflowing
      || r.labelH > (parseFloat(r.lineH) || parseFloat(r.fontSize) * 1.6) + 2);
    const widest = m.rows.reduce((a, r) => (r.naturalW > a.naturalW ? r : a), m.rows[0]);
    check('L2', 'no label is truncated or wrapped by its own column',
      bad.length === 0,
      bad.length
        ? JSON.stringify(bad.map((r) => `${r.label}: text ${r.naturalW}px in ${r.clientW}px, h=${r.labelH} lineH=${r.lineH}`))
        : `${m.rows.length} labels all fit; widest text "${widest.label}" = ${widest.naturalW}px `
          + `in a ${widest.clientW}px column`);

    // ---- L3: ONE label per row ------------------------------------------
    // THE HALF OF "mixed label widths" THAT WAS ACTUALLY WRONG. A row holding
    // `[V center][box][V offset][box]` puts its second label at whatever x the
    // first control happened to end at — no shared width can govern it, and it
    // is what makes the column read ragged even when every FIRST label agrees.
    const multi = m.rows.filter((r) => r.pairs > 1);
    target('L3', 'no row holds a second label mid-row (one label, one column)',
      multi.length === 0,
      multi.length
        ? `${multi.length} rows: ` + JSON.stringify(multi.map((r) => `${r.section}/${r.label} x${r.pairs}`))
        : `all ${m.rows.length} rows hold exactly one label+control pair`);

    // ---- S1: how many lists share the column ----------------------------
    const lists = m.sections.filter((s) => s.flexGrow === '1');
    target('S1', 'at most ONE section takes a share of the column',
      lists.length <= 1,
      `${lists.length} list sections: ${JSON.stringify(lists.map((s) => s.title))} — `
      + `all: ${JSON.stringify(m.sections.map((s) => `${s.title}:grow=${s.flexGrow}`))}`);

    // ---- S2: competing scrollers ----------------------------------------
    const engaged = m.scrollers.filter((s) => s.engaged);
    target('S2', 'at most TWO scrollbars are live in the column (the column, and one list)',
      engaged.length <= 2,
      `${engaged.length} engaged of ${m.scrollers.length} declared: `
      + JSON.stringify(engaged.map((s) => `${s.isColumn ? 'COLUMN' : s.tag}(+${s.over}px):"${s.text}"`)));

    // ---- C1: nothing paints over the section below it -------------------
    const overlaps = [];
    const boxOverlaps = [];
    for (let i = 0; i < m.sections.length - 1; i++) {
      const a = m.sections[i], b = m.sections[i + 1];
      if (a.contentBottom > b.rect.y + 1) {
        overlaps.push(`${a.title} paints ${Math.round(a.contentBottom - b.rect.y)}px into ${b.title}`);
      }
      if (a.rect.bottom > b.rect.y + 1) {
        boxOverlaps.push(`${a.title} box overlaps ${b.title} by ${Math.round(a.rect.bottom - b.rect.y)}px`);
      }
    }
    check('C1', 'no section PAINTS over the one below it (painted extent, not border box)',
      overlaps.length === 0,
      overlaps.length ? JSON.stringify(overlaps)
        : `${m.sections.length} sections, largest painted extent past its own box: `
          + `${Math.round(Math.max(...m.sections.map((s) => s.contentBottom - s.rect.bottom)))}px`);
    report('r.box', 'border-box overlap (the strictly worse fault, reported separately)',
      boxOverlaps.length ? JSON.stringify(boxOverlaps) : 'none');

    // ---- A1: the arrival state ------------------------------------------
    const open = m.sections.filter((s) => s.expanded).map((s) => s.title);
    const closed = m.sections.filter((s) => !s.expanded).map((s) => s.title);
    const norm = (t) => t.replace(/\s*—.*$/, '').replace(/\s*\(.*$/, '').trim();
    const openN = open.map(norm).sort();
    const wantN = [...EXPECTED_OPEN].sort();
    target('A1', 'exactly the intended sections are open on arrival (clean panel state)',
      JSON.stringify(openN) === JSON.stringify(wantN),
      `open=${JSON.stringify(open)}  closed=${JSON.stringify(closed)}  want open=${JSON.stringify(EXPECTED_OPEN)}`
      + `  want closed=${JSON.stringify(EXPECTED_CLOSED)}`);

    // ---- the reports the owner is owed ----------------------------------
    report('r1', 'column overflow (how much taller its content is than the column)',
      `${m.column.overflow}px  (content ${m.column.scrollHeight}px in ${m.column.clientHeight}px, `
      + `overflowY: ${m.column.overflowY})`);
    report('r2', 'section headers reachable without scrolling the column',
      `${m.visibleHeaders} of ${m.sections.length}`);
    report('r3', 'per-section painted height',
      JSON.stringify(m.sections.map((s) => `${s.title}: box ${Math.round(s.rect.h)}px, body ${s.bodyH}px`)));
    report('r4', 'label TEXT widths, measured with a Range — what the label column must fit',
      JSON.stringify([...new Set(m.rows.map((r) => `${r.label}=${r.naturalW}px`))]));
    report('r5', 'label column width as rendered, per row',
      JSON.stringify(m.rows.map((r) => `${r.label}=${r.offset}`)));

    writeFileSync(`${SHOTS}/measure-${PLANT || (BASELINE ? 'baseline' : 'after')}-${SCREEN_W}x${SCREEN_H}.json`,
      JSON.stringify(m, null, 2));

    // ---- PHASE 2: the same questions with EVERY section open --------------
    // ANTI-VACUITY, AND IT IS NOT OPTIONAL HERE. `New band` is the densest box
    // in this column (item 44 added a rate control and a permanent explanatory
    // sentence to it) and this parcel closes it on arrival — so the rows above
    // measure a label column that does not include ANY of its fields. A tidy
    // verdict that skips the densest section is the vacuity bar in a costume.
    // Everything is opened by clicking real headers, and L1/L2/L3 are asked
    // again over the whole column.
    const opened = await c.json(OPEN_ALL);
    await sleep(900);
    const m2 = await c.json(COLUMN_PROBE);
    if (m2.error) throw new Error(`column probe (phase 2): ${m2.error}`);
    await shot(c, `all-open-${PLANT || (BASELINE ? 'baseline' : 'after')}-${SCREEN_W}x${SCREEN_H}`);
    const stillClosed = m2.sections.filter((s) => !s.expanded).map((s) => s.title);
    // THE PRECONDITION IS "EVERYTHING IS OPEN", not "the click changed
    // something": PLANT=arrival opens a section itself, so a growth test would
    // report the phase as unmeasurable for a reason that has nothing to do with
    // the phase. Growth is still printed, because a phase 2 that found no more
    // rows than phase 1 on an UNPLANTED tree means the collapsed sections are
    // empty and L1b is saying nothing new.
    const ownedNow = m2.rows.filter((r) => !isForeign(r.section)).length;
    const ok5 = stillClosed.length === 0 && ownedNow >= m.rows.length;
    check('i5', 'every section is open, and its rows are now under measurement [instrument]',
      ok5,
      `clicked ${JSON.stringify(opened)}; still closed: ${JSON.stringify(stillClosed)}; `
      + `owned rows ${m.rows.length} → ${ownedNow}`);
    if (ok5) {
      const mine = m2.rows.filter((r) => !isForeign(r.section));
      const foreign = m2.rows.filter((r) => isForeign(r.section));
      const excluded = [...new Set(foreign.map((r) => r.section.replace(/\s*[—(].*$/, '').trim()))];
      check('i6', 'exactly the declared foreign section was excluded from L1b/L2b/L3b [instrument]',
        JSON.stringify(excluded.sort()) === JSON.stringify([...FOREIGN_SECTIONS].sort()),
        `excluded ${JSON.stringify(excluded)}; declared ${JSON.stringify(FOREIGN_SECTIONS)}; `
        + `${mine.length} rows measured, ${foreign.length} set aside`);
      const off2 = [...new Set(mine.map((r) => r.offset))].sort((a, b) => a - b);
      const by2 = {};
      for (const r of mine) (by2[r.offset] ??= []).push(`${r.section}/${r.label}`);
      target('L1b', 'the label column still holds with EVERY section open',
        off2.length === 1,
        `${off2.length} distinct offsets over ${mine.length} rows: ` + JSON.stringify(by2));
      const bad2 = mine.filter((r) => r.overflowing
        || r.labelH > (parseFloat(r.lineH) || parseFloat(r.fontSize) * 1.6) + 2);
      const widest2 = mine.reduce((a, r) => (r.naturalW > a.naturalW ? r : a), mine[0]);
      check('L2b', 'no label anywhere in the column is truncated or wrapped',
        bad2.length === 0,
        bad2.length
          ? JSON.stringify(bad2.map((r) => `${r.label}: text ${r.naturalW}px in ${r.clientW}px`))
          : `${mine.length} labels; widest text "${widest2.label}" = ${widest2.naturalW}px `
            + `in a ${widest2.clientW}px column`);
      const multi2 = mine.filter((r) => r.pairs > 1);
      target('L3b', 'no row anywhere in the column holds a second label mid-row',
        multi2.length === 0,
        multi2.length
          ? JSON.stringify(multi2.map((r) => `${r.section}/${r.label} x${r.pairs}`))
          : `all ${mine.length} rows hold exactly one label+control pair`);
      report('r8', 'the foreign section this parcel does NOT own, and its disagreement',
        foreign.length
          ? JSON.stringify(foreign.map((r) => `${r.section}/${r.label}: label column ${r.offset}px `
            + `(this column's is ${off2[0]}px)`))
          : 'no foreign rows on screen');
      const eng2 = m2.scrollers.filter((s) => s.engaged);
      report('r6', 'with every section open — the worst case an author can reach by hand',
        `column overflow ${m2.column.overflow}px, ${eng2.length} live scrollbar(s), `
        + `${m2.visibleHeaders}/${m2.sections.length} headers reachable without scrolling`);
      report('r7', 'label TEXT widths in the sections that arrive closed',
        JSON.stringify([...new Set(m2.rows.filter((r) => !m.rows.some((q) => q.label === r.label))
          .map((r) => `${r.label}=${r.naturalW}px`))]));
      writeFileSync(`${SHOTS}/measure-allopen-${PLANT || (BASELINE ? 'baseline' : 'after')}`
        + `-${SCREEN_W}x${SCREEN_H}.json`, JSON.stringify(m2, null, 2));
    } else {
      check('L1b', 'the label column still holds with EVERY section open', false,
        'COULD NOT MEASURE: not every section opened');
    }

    // ---- plant invariants ------------------------------------------------
    if (PLANT) {
      const anyRed = results.some((r) => r.ok === false);
      check('P.invariant', 'a planted run has at least one RED row', anyRed,
        anyRed ? `red: ${JSON.stringify(fails)}` : 'EVERY ROW GREEN WITH A DEFECT INSTALLED');
      const judge = PLANT_JUDGE[PLANT];
      const jr = results.find((r) => r.id === judge);
      check('P.invariant2', `the plant's NAMED judge [${judge}] is what went red`,
        !!jr && jr.ok === false,
        jr ? `[${judge}] ok=${jr.ok}` : `[${judge}] did not run`);
    }
  } finally {
    if (c) c.close();
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ }
  }

  const gated = results.filter((r) => r.ok !== null);
  const passed = gated.filter((r) => r.ok).length;
  console.log(`\n${passed}/${gated.length} gated rows passed`
    + `  (${results.length - gated.length} reports)`);
  if (fails.length) {
    console.log('FAILING ROWS:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e.message); process.exit(2); });
