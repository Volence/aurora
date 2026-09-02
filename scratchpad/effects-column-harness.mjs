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
//   4. TOO MANY SECTIONS, TOO MANY OF THEM OPEN ON ARRIVAL. Measured after a
//      real `localStorage.clear()` + reload, so it is the ARRIVAL state and not
//      whatever this machine's panel-state happened to hold. The intended set is
//      EXPECTED_OPEN/EXPECTED_CLOSED below, and its history is written there.
//
//   5. THE SAME BAND ENUMERATED TWICE (added for ROADMAP item 45). Two sections
//      of this column each drew a card per band — the band editor's and the
//      preview's — which is 222px + 385px of one band said twice. `Band preview`
//      is now a strip inside `BG animation bands` and the per-band status lives
//      in the band card. [D1] counts, across the whole column, the elements that
//      ENUMERATE a band ("Band <n>" as the start of their own text); one per
//      band is the property. [D2] then proves the honesty label survived the
//      fold: its four named caveats are behind a disclosure chip, and the row
//      opens it and reads all four rather than trusting that "approximate" is
//      still backed by something.
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
//   [D1] the INNERMOST elements in the column whose own text begins "Band <n>".
//        Innermost, so a card and the row inside it are not counted twice; text,
//        not component identity, because the two cards this row exists to
//        forbid were written by two different components and the duplication an
//        AUTHOR sees is the words. Asked twice: [D1] at arrival and [D1b] with
//        every section open, because a duplicate hiding in a collapsed section
//        is still a duplicate and phase 1 cannot see it.
//   [D2] the four named caveats, read out of the DOM BEFORE and AFTER clicking
//        the disclosure chip. Absent-then-present is the property: absent-only
//        is a deleted label, present-only would mean the row could pass on text
//        that some other panel happened to be carrying.
//   [H1] scrollHeight vs clientHeight ON THE COLUMN, plus its computed
//        overflowY. The subtraction alone is not enough: a column switched to
//        `overflow: visible` paints past its own box, and a row that only
//        subtracted would call that a fit. So the row asserts the column IS a
//        clipping scroller first, and says COULD NOT MEASURE if it is not.
//   [H2] header rects against the column's rect. Reachability is a rendered
//        position, not a section count.
//   [H3] the same engagement test [S2] uses, tightened: after ROADMAP item 45's
//        open tail the column itself must not be one of the live scrollbars.
//
// ===========================================================================
// THE ENVIRONMENT IS PRINTED BESIDE THE NUMBERS — [r0]
// ===========================================================================
// docs/OVERSEER.md, 2026-08-26: Xvfb infers a device scale factor observed at
// BOTH 1 and 1.35 hours apart in the same session, and at 1.35 element rects
// come back fractional. Every height this file GATES on is a
// `scrollHeight - clientHeight` or a rect comparison with no rounding, so the
// scale factor does not enter the verdicts — but that is a claim, and a claim
// needs its evidence in the same run as the numbers it defends, so [r0] prints
// `devicePixelRatio`, the achieved inner size and the mechanism that set it.
// Corollary from the same entry: A RUN THAT PASSES TWICE HAS PROVEN NOTHING
// about stability here. Run the final figures more than twice, and never read
// two rows of one claim out of two different runs.
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
//   PLANT=duplicate a SECOND element enumerating band 0  -> judge D1b
//                   (the "Band 0 · 8x4 · timer" card item 45 removed)
//   PLANT=approx    delete the disclosure chip           -> judge D2
//   PLANT=overflow  1200px of filler into the column     -> judge H1
//                   (item 45's own open tail: a column that needs a scroll)
//   PLANT=visible   take the scroller OFF the column     -> judge H1
//                   (the wrong-observable escape: content that paints out of
//                    the column instead of scrolling would make H1's
//                    subtraction say "fits". It must say COULD NOT MEASURE.)
//   PLANT=nobands   DELETE the band section outright     -> judge D1
//                   (collapsed is one click away; deleted is invisible, and
//                    the arrival state this parcel chose stands or falls on
//                    that distinction being measurable)
//
// `duplicate` and `approx` are LATE plants — see LATE_PLANTS. `BG animation
// bands` arrives closed now, and a collapsed section renders no children, so
// both of their subjects only exist after phase 2 has opened it.
//
// [H2] IS NOT INDEPENDENTLY PLANTABLE and this file says so rather than
// inventing a plant that only looks like one: a section header can leave the
// column's box ONLY by the content exceeding the box, so any plant that reddens
// it reddens [H1] first. PLANT=overflow is its red — and the FIRST version of
// that plant, which appended its filler to the BOTTOM of the column, left [H2]
// green at 7/7 while [H1] and [H3] went red. The filler was the only thing out
// of reach. A plant calibrated to "the column now scrolls" is not a plant for
// "a header is now unreachable"; it inserts high in the column for that reason.
// [H3] does have an independent red — PLANT=scroller installs two extra live
// scrollbars while the column stays at zero overflow.
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

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9399);
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
// ⚠ 'Band preview' IS GONE FROM THIS LIST BECAUSE THE SECTION IS GONE — ROADMAP
// item 45, 2026-08-26. The ruling this comment used to carry is SUPERSEDED and is
// recorded here only so nobody re-derives it from an old shot of the column.
//
// WHAT IT USED TO SAY. Items 41 (this harness's parcel) and 42 (the motion
// preview) were built concurrently off one master; 42 added an eighth section,
// `Band preview`, and at landing the overseer ruled it ARRIVES OPEN — because it
// carried the per-band text explaining why a band was NOT previewing, and
// collapsing a feature's explanation of its own silence is the wrong default.
//
// WHY THAT IS NO LONGER A REASON. Decision d-12 ("the game's copy wins", item 46)
// made the canvas paint the override document, so on the overridden act there is
// no silence to explain — the readout is a driver/rate/cell-count line, not an
// apology. Item 45 then folded that per-band line into the band card it
// duplicated and deleted the section: `Band preview` is a STRIP inside
// `BG animation bands` now (playback chip, honesty label, two column-wide
// warnings), and the per-band verdict lives in each band's own card. Seven
// sections, five open. [D1] is the row that holds the fold — it fails if any band
// is enumerated twice anywhere in the column.
//
// THE REFUSAL PATH IS NOT DEAD: an act the override does not bind still shows it,
// inside the card. It was folded in, not deleted.
//
// ⚠ 'BG animation bands' MOVED FROM open TO closed — 2026-08-26, item 45's open
// tail (the 1280x800 parcel). The ruling above it, that closing the section
// "would hide the fact that the facet does bands at all", does not survive
// contact with the arithmetic OR with the DOM: a collapsed CollapsibleSection
// still renders its header, and that header reads `BG animation bands (1/4)` —
// the capability and the document's band count are both on screen while the
// section is shut.
//
// THE ARITHMETIC. At 1280x800 the column has 702px of client height. Measured
// on the merged tree, its section boxes are Scenes 137, Scene 207, Layers 160
// (its floor — it can give nothing), Section assignment 115, BG animation bands
// 286, New band 25, Properties 25 = 954px. Four of the five open sections are
// THE SCENE and total 619px; 619 + 286 + 50 does not fit in 702 by any
// arrangement, and the tightenings this parcel also made (a one-line scene
// picker, a one-fact assignment hint) are worth 42px between them. So the
// arrival state had to change, and only one section in this column is about
// something other than the scene the facet arrives on.
//
// EVERYTHING INSIDE IT IS ONE CLICK AWAY, WHICH IS THE STANDARD — the per-band
// verdicts, the refusal path, the playback chip and the honesty label all still
// exist and are all reachable by clicking one header. [D1b] and [D2] both run
// AFTER phase 2 opens every section, so this list changing cannot make either
// of them vacuous: [D1b] still fails if it finds nothing to count, and [D2]
// still fails if the four caveats are absent after the click.
const EXPECTED_OPEN = ['Scenes', 'Scene', 'Layers', 'Section assignment'];
const EXPECTED_CLOSED = ['BG animation bands', 'New band', 'Properties'];

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
  duplicate: 'D1b', approx: 'D2', overflow: 'H1', nobands: 'D1', visible: 'H1',
};

/**
 * PLANTS THAT CANNOT INSTALL UNTIL PHASE 2 HAS OPENED EVERY SECTION.
 *
 * `BG animation bands` arrives CLOSED now, and a collapsed CollapsibleSection
 * renders no children at all — so at phase 1 there is no band card to duplicate
 * and no `why approximate?` chip to delete. Applied at the top of the run both
 * plants would report `no-band` / `no-chip` and the harness would abort with
 * "a plant that cannot install is not evidence", which is TRUE and useless.
 *
 * They are applied instead immediately after OPEN_ALL and before the phase-2
 * probe, which is where their judges ([D1b], [D2]) read. THE PLANT IS NOT
 * WEAKER FOR IT: [D1b] is the row that asks the duplicate question over the
 * whole column with every section open, which is where a duplicate could hide
 * even when the section arrived open, and [D2] always ran last.
 */
const LATE_PLANTS = new Set(['duplicate', 'approx']);

/**
 * THE FOUR SENTENCES THE HONESTY LABEL MUST STILL BE ABLE TO SAY — [D2].
 *
 * Quoted from `BgAnimPreviewStrip`'s own text, one fragment per named caveat, so
 * a run that finds three of four fails and names the missing one. Item 45 moved
 * this text behind a disclosure chip to buy back column height; the whole point
 * of the row is that "moved behind a click" and "quietly diluted into
 * 'approximate'" look identical from the ROADMAP and completely different here.
 */
const APPROX_CAVEATS = [
  'The preview is approximate',
  "the editor's wall clock",
  'clamps its camera to the level',
  'The ROM is the truth channel',
];

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

// ---------------------------------------------------------------------------
// WHO ENUMERATES A BAND — the [D1] observable (ROADMAP item 45)
// ---------------------------------------------------------------------------
// The defect was two sections each drawing a card per band. The observable is
// therefore NOT "how many sections are there" (a column could grow a third band
// list and still have seven sections) and NOT "does BgAnimPreviewNote exist" (a
// source scan, and this file measures rendered geometry on principle). It is:
// how many places on screen START a line with "Band <n>".
//
// INNERMOST ONLY. A band card CONTAINS the row that titles it, and the card's
// own text begins with the same two words — counting both would report every
// tidy column as a duplicate. So an element counts only when no descendant of it
// also counts. That also makes the count independent of how deeply either panel
// happens to nest its cards.
//
// THE ANCHOR IS "^Band <n>" AND NOT A SUBSTRING. `Demote band 0 to static tiles`
// is an aria-label on a button whose text is "Demote"; a substring match would
// count it and a per-band action is not a per-band enumeration.
const BAND_ENUM_PROBE = String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const headers = [...document.querySelectorAll('div')].filter(isHeader);
  if (!headers.length) return { error: 'no PanelHeader on screen' };
  const boxes = headers.map((h) => ({ header: h, box: h.parentElement && h.parentElement.parentElement }))
    .filter((s) => s.box);
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
  const titleOf = (s) => (s.header.firstElementChild.textContent || '').trim();
  const sectionOf = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const s = column.list.find((x) => x.box === p);
      if (s) return titleOf(s);
    }
    return '?';
  };
  const norm = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  // "Band 0", "Band 0 · 8x4 · timer" — the index must END the token, so a
  // geometry glued straight onto it by textContent ("Band 08x4") is NOT a match
  // and the row that only titles the card is.
  const RE = /^Band (\d+)(?:[\s·]|$)/;
  const all = [...col.querySelectorAll('*')].filter((el) => RE.test(norm(el)));
  const innermost = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
  const hits = innermost.map((el) => ({
    index: Number(RE.exec(norm(el))[1]),
    section: sectionOf(el),
    text: norm(el).slice(0, 60),
  }));
  return { hits, sections: column.list.map(titleOf) };
})()`;

/** The four named caveats, read out of the whole page. Text, not a component. */
const CAVEAT_PROBE = (bits) => String.raw`
(() => {
  const t = (document.body.textContent || '').replace(/\s+/g, ' ');
  return ${JSON.stringify(bits)}.map((b) => ({ bit: b, present: t.includes(b) }));
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
  // THE DEFECT ITEM 45 REMOVED, PUT BACK. A second element enumerating band 0,
  // in the exact words the deleted `Band preview` card used. It is appended
  // beside the card's own title row rather than into a section of its own,
  // because D1 must fire on a duplicate ANYWHERE — a row that could only see a
  // duplicate in a separate section would be a row about section counts.
  duplicate: String.raw`
(() => {
  const RE = /^Band (\d+)(?:[\s·]|$)/;
  const norm = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const all = [...document.querySelectorAll('*')]
    .filter((el) => el.getBoundingClientRect().left > 400 && RE.test(norm(el)));
  const innermost = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
  if (!innermost.length) return 'no-band';
  const src = innermost[0];
  const clone = document.createElement('div');
  clone.textContent = norm(src).replace(RE, (m, n) => 'Band ' + n + ' ') + '· 8x4 · timer';
  src.parentElement.appendChild(clone);
  return 'planted:' + clone.textContent;
})()`,
  // THE DEFECT THIS PARCEL EXISTS TO REMOVE: a column with more content than it
  // can show. Item 45 closed with 214px of it at 1280x800 and said so plainly.
  //
  // A FIXED BLOCK, NOT "RE-OPEN THE SECTION THIS PARCEL CLOSED", and the reason
  // is that a plant must install the same violation at every frame this harness
  // runs at. Re-opening `BG animation bands` costs 286px, which overflows a
  // 1280x800 column and does NOT overflow a 1680x1050 one (it has 292px of
  // slack after this parcel) — so that plant would be green at one frame for a
  // reason that has nothing to do with the property, which is bar 2d exactly.
  // 1200px exceeds the slack at both frames by construction.
  //
  // ⚠ IT IS THE NAMED JUDGE FOR [H1] AND THE ONLY RED [H2] HAS, and that is not
  // sloppiness: a section header can leave the column's box ONLY by the content
  // exceeding the box, so [H2] is not violable without [H1] also being violated
  // and a plant that reddened it alone would be a fiction. [H3] does have an
  // independent red: PLANT=scroller installs two extra live scrollbars while
  // the column itself stays at zero overflow, which reddens [H3] without going
  // through [H1] at all.
  overflow: String.raw`
(() => {
  const isHeader = (el) => { if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN'; };
  const boxes = [...document.querySelectorAll('div')].filter(isHeader)
    .map((h) => h.parentElement.parentElement).filter(Boolean);
  const byParent = new Map();
  for (const b of boxes) {
    const p = b.parentElement; if (!p) continue;
    if (!byParent.has(p)) byParent.set(p, 0);
    byParent.set(p, byParent.get(p) + 1);
  }
  let col = null, best = -1;
  for (const [p] of byParent) {
    const left = p.getBoundingClientRect().left;
    if (left > best) { best = left; col = p; }
  }
  if (!col) return 'no-column';
  const filler = document.createElement('div');
  filler.style.cssText = 'height:1200px;flex:0 0 1200px';
  filler.textContent = 'planted overflow';
  // ⚠ AFTER THE FIRST SECTION, NOT AT THE END, AND THE FIRST VERSION OF THIS
  // PLANT GOT IT WRONG. Appended to the bottom of the column the filler is the
  // only thing that goes out of reach, so [H1] and [H3] went red and [H2]
  // stayed GREEN with 7/7 headers reachable — the plant reproduced "the column
  // scrolls" but NOT "a header is out of reach", which is the half of the
  // defect [H2] exists for. Inserted high, it pushes the later HEADERS below
  // the column's bottom edge, which is the 5-of-7 shape master actually had.
  col.insertBefore(filler, col.children[1] || null);
  return 'planted:1200px after section 1 of a '
    + Math.round(col.getBoundingClientRect().height) + 'px column';
})()`,
  // ⚠ THE WRONG-OBSERVABLE ESCAPE, PLANTED ON PURPOSE (OVERSEER bar 2b). [H1]
  // asks "does the content fit" by subtracting two numbers, and there is a way
  // to make that subtraction say YES while the column is in fact worse off than
  // before: take the scroller OFF it. With `overflow: visible` the content is
  // not clipped and not scrolled — it paints straight out of the column, over
  // whatever the shell draws below. This plant installs exactly that, and [H1]
  // must answer COULD NOT MEASURE rather than "fits". A green here would mean
  // the row is measuring the wrong quantity, which is the failure that cost
  // this repo `section-column-harness.mjs` row c1.
  visible: String.raw`
(() => {
  const isHeader = (el) => { if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN'; };
  const boxes = [...document.querySelectorAll('div')].filter(isHeader)
    .map((h) => h.parentElement.parentElement).filter(Boolean);
  let col = null, best = -1;
  for (const b of boxes) {
    const p = b.parentElement; if (!p) continue;
    const left = p.getBoundingClientRect().left;
    if (left > best) { best = left; col = p; }
  }
  if (!col) return 'no-column';
  col.style.overflowY = 'visible';
  col.style.overflowX = 'visible';
  return 'planted: the column no longer clips or scrolls (overflowY visible)';
})()`,
  // THE BAND SUBJECT MADE INVISIBLE RATHER THAN ONE CLICK AWAY — the exact
  // failure this parcel's arrival state is one attribute away from, and the one
  // thing the owner said must not happen. The whole defence of collapsing
  // `BG animation bands` is that its HEADER stays on screen naming the
  // capability and counting the document's bands; delete the section and the
  // column silently stops mentioning that this facet does bands at all. [D1]
  // must not confuse that with "arrives closed".
  nobands: String.raw`
(() => {
  const isHeader = (el) => { if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN'; };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .filter((h) => h.getBoundingClientRect().left > 400)
    .find((h) => /^BG animation bands/.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-bands-section';
  const box = hdr.parentElement.parentElement;
  const title = (hdr.firstElementChild.textContent || '').trim();
  box.remove();
  return 'planted: removed "' + title + '" from the column';
})()`,
  // THE HONESTY LABEL MADE UNREACHABLE. Not "hidden with CSS" — the chip is
  // REMOVED, which is what a parcel that quietly dropped the disclosure would
  // leave behind, and D2 cannot then open anything.
  approx: String.raw`
(() => {
  const btn = [...document.querySelectorAll('button')]
    .find((b) => /why approximate/i.test(b.textContent || ''));
  if (!btn) return 'no-chip';
  btn.remove();
  return 'planted';
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
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1920x1200x24', ELECTRON, MAIN],
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
    // ⚠ THE ENVIRONMENT, PRINTED BESIDE EVERY NUMBER THIS RUN REPORTS.
    // OVERSEER, 2026-08-26: Xvfb infers a device scale factor that has been
    // observed at BOTH 1 and 1.35 hours apart in the same session, and at 1.35
    // element rects come back fractional. Every height this file reports is a
    // `scrollHeight - clientHeight` on the column, which is INTEGER at any dpr
    // (both are integer CSS-pixel properties) — but that is a claim, and a
    // claim needs its evidence in the same run as the numbers it defends. So
    // dpr is printed here, and [r1] prints the raw pair it subtracted.
    const envInfo = await c.json(`({ dpr: window.devicePixelRatio,
      inner: [window.innerWidth, window.innerHeight],
      screen: [screen.width, screen.height] })`);
    report('r0', 'the environment these numbers were measured in',
      `devicePixelRatio ${envInfo.dpr} · innerWidth/Height ${JSON.stringify(envInfo.inner)} · `
      + `screen ${JSON.stringify(envInfo.screen)} · viewport mechanism ${VIEWPORT.mechanism}`);
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
    //
    // ⚠ THE SUBJECT IS NOW SELECTED BY CLICKING, NOT ASSUMED (2026-08-26, the
    // 1280x800 parcel). Until today this project had ONE effects scene, so
    // `resolveSelectedScene`'s "else the first scene" fallback landed on the
    // subject and the row only had to read it back. Aeon then landed
    // `ojz_act1_depth` (d-15, the OJZ showcase), which sorts FIRST — so on a
    // clean arrival this harness opened a scene the owner was never looking at
    // and [i2] correctly aborted the whole run rather than measure it. The row
    // stays an assertion; what changed is that the harness now makes the human
    // gesture that reaches the subject (click its button in the Scenes list)
    // instead of depending on a scene count nobody controls. It clicks each
    // scene button in turn and stops when the section title names the subject
    // BY ID, so a renamed scene cannot silently redirect it.
    const pickSubject = String.raw`
(async () => {
  const titles = () => [...document.querySelectorAll('span')]
    .map((e) => (e.textContent || '').trim()).filter((t) => /^Scene — /.test(t));
  if (titles().some((t) => t.includes(${JSON.stringify(SUBJECT_SCENE)}))) return 'already';
  const buttons = [...document.querySelectorAll('button')]
    .filter((b) => b.getBoundingClientRect().left > 400 && /\d+ layers?$/.test((b.textContent || '').trim()));
  for (const b of buttons) {
    b.click();
    await new Promise((r) => setTimeout(r, 250));
    if (titles().some((t) => t.includes(${JSON.stringify(SUBJECT_SCENE)}))) {
      return 'clicked:' + (b.textContent || '').trim();
    }
  }
  return 'NOT-FOUND among ' + buttons.length + ' scene buttons: '
    + JSON.stringify(buttons.map((b) => (b.textContent || '').trim()));
})()`;
    const picked = await c.evalExpr(pickSubject);
    await sleep(600);
    const sceneTitles = await c.json(
      `[...document.querySelectorAll('span')].map(e => (e.textContent||'').trim())
        .filter(t => /^Scene — /.test(t))`);
    const onSubject = sceneTitles.some((t) => t.includes(SUBJECT_SCENE));
    check('i2', `the selected scene is the owner's banded canopy (${SUBJECT_SCENE}) [instrument]`,
      onSubject, `${picked}; on screen: ${JSON.stringify(sceneTitles)}`);
    if (!onSubject) throw new Error('the subject scene is not selected — a tidy verdict here would be about nothing');

    const applyPlant = async (when) => {
      if (!PLANTS[PLANT]) throw new Error(`unknown PLANT=${PLANT}`);
      const r = await c.evalExpr(PLANTS[PLANT]);
      console.log(`\n*** PLANT=${PLANT} applied ${when}: ${r}  (judge = ${PLANT_JUDGE[PLANT]}) ***\n`);
      if (typeof r === 'string' && r.startsWith('no-')) {
        throw new Error(`plant ${PLANT} found no subject (${r}) — a plant that cannot install is not evidence`);
      }
      await sleep(600);
    };
    if (PLANT && !LATE_PLANTS.has(PLANT)) await applyPlant('at arrival');

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

    // ---- D1: ONE CARD PER BAND ------------------------------------------
    // ROADMAP item 45. See BAND_ENUM_PROBE for why this is the observable.
    const bandEnum = async (id, name) => {
      const e = await c.json(BAND_ENUM_PROBE);
      if (e.error) { check(id, name, false, `COULD NOT MEASURE: ${e.error}`); return null; }
      const per = {};
      for (const h of e.hits) (per[h.index] ??= []).push(`${h.section}:"${h.text}"`);
      const indices = Object.keys(per).map(Number).sort((a, b) => a - b);
      const dupes = indices.filter((i) => per[i].length > 1);
      // ANTI-VACUITY, and it is the whole risk in this row: "no band appears
      // twice" is trivially true of a column that draws no bands at all — which
      // is exactly what a collapsed section, a closed project or a renamed label
      // would produce. So the row FAILS when it found nothing to count, and
      // prints what it did find either way.
      const sawSubject = indices.length > 0;
      target(id, name, sawSubject && dupes.length === 0,
        sawSubject
          ? `${indices.length} band(s) enumerated ${JSON.stringify(indices)}; `
            + `${dupes.length} enumerated more than once. ${JSON.stringify(per)}`
          : 'NOTHING TO COUNT: no element in the column enumerates a band, so this row '
            + `would be vacuous. Column sections: ${JSON.stringify(e.sections)}`);
      return e;
    };
    // AT ARRIVAL the question changed, because the section that enumerates
    // bands arrives CLOSED (see EXPECTED_OPEN). Asking `bandEnum` here would
    // find nothing to count and fail on its own anti-vacuity clause — correctly,
    // and uselessly. What IS worth asserting at arrival is the pair of facts the
    // new arrival state rests on: the section is THERE (so the capability and
    // the band count are on screen), and it is SHUT (so it is costing the column
    // nothing). [D1b] then asks the duplicate question with it open.
    const bandsSection = m.sections.find((s) => /^BG animation bands/.test(s.title));
    const arrivalEnum = await c.json(BAND_ENUM_PROBE);
    target('D1', 'the band list is present in the column and arrives CLOSED, enumerating nothing',
      !!bandsSection && bandsSection.expanded === false
        && !arrivalEnum.error && arrivalEnum.hits.length === 0,
      bandsSection
        ? `"${bandsSection.title}" expanded=${bandsSection.expanded}, box ${Math.round(bandsSection.rect.h)}px; `
          + `${arrivalEnum.error ?? `${arrivalEnum.hits.length} band(s) enumerated at arrival`}`
        : `NO SECTION TITLED "BG animation bands" IN THE COLUMN — the capability and the `
          + `band count are not on screen at all. Sections: ${JSON.stringify(titles)}`);

    // ---- the reports the owner is owed ----------------------------------
    report('r1', 'column overflow (how much taller its content is than the column)',
      `${m.column.overflow}px  (content ${m.column.scrollHeight}px in ${m.column.clientHeight}px, `
      + `overflowY: ${m.column.overflowY}, dpr ${envInfo.dpr})`);
    report('r2', 'section headers reachable without scrolling the column',
      `${m.visibleHeaders} of ${m.sections.length}`);

    // ---- H1/H2/H3: DOES THE COLUMN FIT THIS SCREEN? -----------------------
    // ROADMAP item 45's open tail, made into a gate. Until now the column's
    // overflow was [r1], a REPORT — which is why 214px could be booked as
    // "still open" and nothing in any runner would ever go red about it again.
    //
    // THE EXPECTATION IS A PROPERTY, NOT A PIXEL (bar 8). "scrollHeight does not
    // exceed clientHeight" is derived from what a scroll container IS; no
    // measured height from this parcel or item 45's is written down anywhere,
    // and the headroom is REPORTED beside the verdict rather than asserted, so a
    // future section that eats it goes red on the property and not on a number
    // somebody would have had to remember to update.
    //
    // LOUD ON UNMEASURABLE, and the trap is specific: a column switched to
    // `overflow: visible` would paint its content straight past its own box, and
    // a row that only subtracted two numbers could report that as a fit. So the
    // row asserts the column IS a clipping scroller and prints the computed
    // value it read. [C1] guards the painting half from the other side.
    const colScrolls = /auto|scroll/.test(m.column.overflowY);
    const headroom = m.column.clientHeight - m.column.scrollHeight;
    target('H1', `the column's content FITS at ${SCREEN_W}x${SCREEN_H} — no column scrollbar`,
      colScrolls && m.column.clientHeight > 0 && m.column.overflow <= 0,
      colScrolls
        ? `content ${m.column.scrollHeight}px in ${m.column.clientHeight}px `
          + `→ overflow ${m.column.overflow}px, headroom ${headroom}px (dpr ${envInfo.dpr})`
        : `COULD NOT MEASURE A FIT: the column's overflowY is "${m.column.overflowY}", not a `
          + `scroller — content that did not fit would paint outside it and this subtraction `
          + `would be meaningless`);
    target('H2', 'every section header is reachable without scrolling the column',
      m.sections.length > 0 && m.visibleHeaders === m.sections.length,
      `${m.visibleHeaders} of ${m.sections.length} reachable: `
      + JSON.stringify(m.sections.map((s) => `${s.title}@${Math.round(s.rect.y)}`))
      + ` in a column at y ${Math.round(m.column.rect.y)}..${Math.round(m.column.rect.bottom)}`);
    // ⚠ [H1]'s "headroom" READS 0 EVEN WHEN THE COLUMN HAS ROOM TO SPARE, and a
    // reader who took it for the safety margin would be badly misled. The Layers
    // section is `flex: 1 1 0`, so it absorbs every spare pixel up to its own
    // content height: a column with 300px going begging shows headroom 0 and a
    // 300px-taller list. THE REAL MARGIN is how far the list can be squeezed
    // before it hits the floor the shell gives every list section — past that
    // point the column has nothing left to give and starts to overflow.
    //
    // DERIVED FROM THE RENDERED ELEMENT, not from the constant's value: the
    // floor is read as the list section's own computed `minHeight`, so if the
    // shell ever moves SECTION_LIST_MIN_HEIGHT this row follows it instead of
    // quietly disagreeing with it.
    const listSection = m.sections.find((s) => s.flexGrow === '1');
    const floorPx = listSection ? parseFloat(listSection.minHeight) : NaN;
    report('r9', 'the column\'s REAL margin — how much taller its content can get before it scrolls',
      listSection && Number.isFinite(floorPx)
        ? `${Math.round(listSection.rect.h - floorPx)}px: "${listSection.title}" is `
          + `${Math.round(listSection.rect.h)}px and its computed floor is ${floorPx}px, so that `
          + `much can be taken from it before the column itself must scroll`
        : `COULD NOT MEASURE: no section in this column has flex-grow 1`
          + `${listSection ? ` (minHeight computed as "${listSection.minHeight}")` : ''}`);

    // AT MOST ONE, NOT EXACTLY ONE, and the difference is a fixture dependency
    // this row refuses to take. "Exactly one" would be asserting that the Layers
    // list OVERFLOWS — true of the subject scene, which has five layers, and
    // false of a two-layer scene that simply fits. That is a property of the
    // aeon tree's content, not of this column's design, and a gate that goes red
    // when somebody deletes a layer is a gate people learn to ignore. The
    // property is the one item 45's open tail is about: THE COLUMN ITSELF must
    // not be a scrollbar, and nothing inside it may add a second. A list that
    // stopped clipping altogether is [C1]'s row, not this one.
    const engagedNow = m.scrollers.filter((s) => s.engaged);
    target('H3', 'the column itself is not a live scrollbar, and holds at most one',
      engagedNow.every((s) => !s.isColumn) && engagedNow.length <= 1,
      `${engagedNow.length} engaged of ${m.scrollers.length} declared: `
      + JSON.stringify(engagedNow.map((s) => `${s.isColumn ? 'THE COLUMN' : s.tag}(+${s.over}px):"${s.text}"`)));
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
    if (PLANT && LATE_PLANTS.has(PLANT)) await applyPlant('after every section was opened');
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
      // Asked again with EVERY section open: a duplicate card living in a
      // section that arrives closed is still a duplicate, and phase 1 cannot
      // see it. This is the same alternative-green-path argument [i5] makes for
      // the label rows.
      await bandEnum('D1b', 'no band is enumerated twice with EVERY section open');
    } else {
      check('L1b', 'the label column still holds with EVERY section open', false,
        'COULD NOT MEASURE: not every section opened');
    }

    // ---- D2: the honesty label survived being made compact ----------------
    // ROADMAP item 45 bought column height by putting the four named caveats
    // behind a disclosure chip. From a doc, "moved behind a click" and "diluted
    // to the word approximate" are the same sentence; here they are not.
    //
    // RUN LAST, DELIBERATELY: opening the disclosure adds a paragraph to the
    // column, and every height above ([r1], [r3], [r6], [C1]) would then be
    // measuring a state no author arrives in.
    const before = await c.json(CAVEAT_PROBE(APPROX_CAVEATS));
    const clickedApprox = await c.evalExpr(clickByText('/why approximate/i'));
    await sleep(400);
    const after = await c.json(CAVEAT_PROBE(APPROX_CAVEATS));
    const missing = after.filter((x) => !x.present).map((x) => x.bit);
    const leaked = before.filter((x) => x.present).map((x) => x.bit);
    target('D2', 'the four named approximations are one click away, in full, and not before',
      clickedApprox === true && missing.length === 0 && leaked.length === 0,
      `chip click -> ${JSON.stringify(clickedApprox)}; `
      + `after: ${after.map((x) => `${x.present ? 'ok' : 'MISSING'}: ${x.bit}`).join(' | ')}`
      + (leaked.length
        ? `; ALREADY ON SCREEN BEFORE THE CLICK (so the row could pass without the `
          + `disclosure working): ${JSON.stringify(leaked)}`
        : '; none of the four was on screen before the click'));
    if (clickedApprox === true) await shot(c, `caveats-${PLANT || 'after'}-${SCREEN_W}x${SCREEN_H}`);

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
