#!/usr/bin/env node
// DOES A HEADER ACTION BUTTON STILL TOGGLE THE SECTION IT SITS IN?
//
// ROADMAP item 32. `CollapsibleSection` wraps its whole header row in
// `<div onClick={toggle}>` and `IconButton` does not stop propagation, so every
// control in the `right` slot ALSO flipped the section. It was found by a real
// gesture under CDP — the item-31 harness saw "Layers (8/8)" on screen over an
// EMPTY panel, because the 7th (odd) `Add layer` click collapsed the section it
// had just filled — and it cannot be found any other way in this repo: the node
// suite has no jsdom, no happy-dom and no `@testing-library/react`, so its
// ~4,400 tests cannot render a component, let alone watch a click bubble.
//
// SO EVERY CLICK BELOW IS A REAL MOUSE EVENT. Not `el.click()`: CDP
// `Input.dispatchMouseEvent` at measured coordinates, through the browser's own
// hit testing, with `document.elementFromPoint` asserted at those coordinates
// first so a row can never be measuring a click that landed somewhere else.
//
// -------------------------------------------------------------------------
// THE TWO OBSERVABLES, AND WHICH ONE IS LOAD-BEARING
// -------------------------------------------------------------------------
// `toggle` does two things: it re-renders (a collapsed section renders
// `{!collapsed && children}`, so its children leave the DOM) and it writes
// through to persisted panel state (`shell/panel-state.ts` →
// localStorage['aurora.shell.panels']).
//
// Both are asserted. The PERSISTED WRITE is the load-bearing one, because the
// DOM observable has a second way to come back green: a section that unmounts
// and remounts re-reads `loadPanelState()` at mount, so a stray remount could
// repaint an expanded section over a state that had genuinely been toggled.
// The localStorage blob cannot be un-written by a re-render. The DOM row is
// kept anyway because it is the symptom the user actually sees.
//
// The storage KEY is not taken on faith either — it is private to
// panel-state.ts, so row 2b requires the title toggle to WRITE
// `"aeon.effects.layers":true` into it. A wrong key reads back `null` and that
// row goes red rather than quietly making every later "unchanged" row true by
// comparing null to null.
//
// -------------------------------------------------------------------------
// THE TRAP THIS HARNESS IS BUILT AROUND (item 32's trap (a))
// -------------------------------------------------------------------------
// `toggle` early-returns when `collapsedOverride !== undefined`. A guard aimed
// at a section that has an override PASSES WITH THE FIX DELETED, because the
// subject was never reachable. `Explorer` really does pass one, so this is not
// hypothetical.
//
// Rows 2a–2c are the antidote and they run BEFORE the subject rows: the title
// is clicked and the section MUST collapse, in the DOM and in storage, and then
// MUST come back. A section with an override cannot pass those. They are not
// scaffolding — they are also requirement 2 (the title/chevron/dead space must
// still toggle), which is what stops "delete the onClick" from passing this
// file.
//
// -------------------------------------------------------------------------
// PLANTED-DEFECT NOTE — a green run of this file proves nothing on its own
// -------------------------------------------------------------------------
// Reverting the header div from `onClick={onHeaderClick}` back to
// `onClick={toggle}` and rebuilding takes this file to 24/31, with:
//
//   FAIL [3b.1] click 1: the section is STILL EXPANDED after the action
//        "Layers (2/8)" body 0px, 0 body nodes, 0 cards for 2 layers
//   FAIL [3c.1] click 1: persisted panel state was NOT written for aeon.effects.layers
//        before={"aeon.effects.layers":false}  after={"aeon.effects.layers":true}
//   FAIL [4b]   at 8/8 the panel is NOT empty — the heading and the body agree
//        heading "Layers (8/8)" over 0 cards, 0 body nodes, body 0px
//   FAIL [5c]   Delete did not write aeon.effects.scene into persisted panel state
//
// (verified 2026-08-24, when the ceiling was 8 and the heading had no suffix —
// the quoted strings above are that run's, not today's; see LAYER_MAX below).
// Row 4b is the ORIGINAL defect report reproduced verbatim. Note what click 2
// does in that run: it PASSES, because the second stray toggle cancels the
// first. That is why section 3 asserts after every click instead of at the end —
// a run that only looked at the final state would have been green for even
// counts and this bug shipped once already.
//
// ⚠ O50 TRIAGE, 2026-09-03 — THIS FILE WAS RED FOR THREE INSTRUMENT REASONS AT
// ONCE, AND ONLY THE FIRST WAS VISIBLE. The heading finder was dead (see
// LAYER_MAX's block), which aborted the run at [1a] and hid the other two:
// the growth loop's ceiling literal (8, now 16) and the CARD COUNTER, which had
// been returning 0 for every card the app drew because it keyed on a spinner
// title that only exists on an UNLOCKED scene (see LAYER_CARDS's block). The
// app was never at fault: 31/31 after the three repairs, with the card counter
// re-proven red-first by renaming the Remove button's label (8 rows red, all
// and only the card-dependent ones).
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/section-header-action-harness.mjs

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9433);
// ROOT is the tree this FILE lives in, never a hardcoded path — run from the
// main clone a pinned path silently serves a worktree's dist/, which makes a
// "re-verified on master" run a re-verification of the branch. (The effects
// harness was caught doing exactly that at landing on 2026-08-22.)
const ROOT = AURORA_DIR;
// A git worktree has no node_modules of its own, so the BINARY and the app ROOT
// are allowed to come from different trees.
// WHICH BUILT TREE THIS RUNS AGAINST (O72) — question 2, and NOT `ROOT`'s
// question 1. A linked worktree has no node_modules/ and no dist/, so the tree
// carrying the build can be a different directory from the one this file lives
// in; `announceRunRoot` prints which tree was chosen and marks it BORROWED when
// it is not this one. See scratchpad/lib/run-root.mjs.
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;      // still honours ELECTRON_BIN
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-section-header-action`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'hdr_action_probe';
// The panel-state localStorage key. Private to shell/panel-state.ts, so it is
// mirrored here — and row 2b proves the mirror is right by requiring a real
// toggle to appear under it.
const PANEL_KEY = 'aurora.shell.panels';
const LAYERS_ID = 'aeon.effects.layers';
const SCENE_SECTION_ID = 'aeon.effects.scene';

/**
 * ⚠ THE LAYERS HEADING AND ITS CEILING ARE BOTH READ, NEVER PINNED — O50
 * triage, 2026-09-03, and this file was RED for both at once.
 *
 * It matched `/^Layers \(\d+\/\d+\)$/` and required the ceiling state to read
 * exactly `Layers (8/8)`. Two independent things had moved under it:
 *
 *   • the heading has read `Layers (n/MAX per scene)` since wave 1 — the panel
 *     composes it as `Layers (${n}/${EFFECTS_LAYER_COUNT.max} per scene)`
 *     (components/effects/EffectsScenePanel.tsx), so the `$`-anchored pattern
 *     found NOTHING and every row of this file was unreachable behind [1a];
 *   • `maxItems` went 8 -> 16 at empyrean `277bc15`
 *     (core/formats/effects/aurora-effects-scene.schema.provenance.json), so
 *     even a repaired pattern would have stalled the growth loop at a ceiling
 *     the app no longer has.
 *
 * A literal here would be a SECOND authority for a number the schema already
 * owns — `scene-ui.ts` says so in as many words — so the maximum is read out of
 * the schema file the app itself compiles, and the heading pattern is built
 * from it. `LAYER_MAX` is printed in the banner so a run says which ceiling it
 * measured against.
 */
const LAYER_MAX = (() => {
  const schema = JSON.parse(readFileSync(
    `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
  const n = schema?.properties?.layers?.maxItems;
  if (typeof n !== 'number') {
    throw new Error('effects scene schema properties.layers has no numeric maxItems — '
      + 'this harness reads the ceiling from the schema and refuses to guess one');
  }
  return n;
})();
/**
 * The heading the Layers section actually paints, as a source-derived regex
 * LITERAL — every consumer below interpolates this into a CDP expression where
 * a `/…/` literal is what is wanted, so the escaping is done once, here.
 */
const LAYERS_RE = String.raw`/^Layers \(\d+\/${LAYER_MAX} per scene\)$/`;
/** The same at the ceiling, for the row that reproduces the original report. */
const LAYERS_AT_MAX = new RegExp(
  String.raw`^Layers \(${LAYER_MAX}\/${LAYER_MAX} per scene\)$`);

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
/** A row that could not be MEASURED is a failure, never a pass and never a 0. */
function unmeasurable(id, name, why) { check(id, name, false, `COULD NOT MEASURE: ${why}`); }

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-section-header-action/${name}.png`);
}

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
  el.click();
  return true;
})()`;

// ---------------------------------------------------------------------------
// The section probe.
//
// Finds a CollapsibleSection by the TEXT of its heading, then reports the
// geometry of the three places a click can land in its header (the title, the
// dead space, the action control) plus the two things that say whether it is
// expanded: whether it has a body taller than its header, and how many of its
// children are rendered at all.
//
// The DOM walk mirrors the component: section div > click wrapper > PanelHeader
// div > span(title) + right. The header is identified by being the DIV with
// real horizontal padding, which is PanelHeader's own style, rather than by a
// class this codebase does not use.
// ---------------------------------------------------------------------------
const SECTION_PROBE = (titleRe) => String.raw`
(() => {
  const spans = [...document.querySelectorAll('span')];
  const hdrSpan = spans.find((e) => ${titleRe}.test((e.textContent || '').trim()));
  if (!hdrSpan) return { found: false, why: 'no heading matching ${titleRe}' };
  let header = hdrSpan;
  while (header && !(header.tagName === 'DIV'
         && parseFloat(getComputedStyle(header).paddingLeft) > 0)) {
    header = header.parentElement;
  }
  if (!header) return { found: false, why: 'heading has no PanelHeader div above it' };
  const wrapper = header.parentElement;              // the div carrying the toggle
  const section = wrapper && wrapper.parentElement;  // the CollapsibleSection div
  if (!section) return { found: false, why: 'no section div above the header' };
  const hr = header.getBoundingClientRect();
  const sr = section.getBoundingClientRect();
  const tr = hdrSpan.getBoundingClientRect();
  // The action control: the interactive thing living in the right slot.
  const action = header.querySelector('button, [role="button"], input, select');
  const ar = action ? action.getBoundingClientRect() : null;
  // Everything the section renders below its header. A collapsed section
  // renders NO children, so this is 0 and the body height is 0 too.
  const bodyKids = [...section.children].filter((el) => el !== wrapper).length;
  const at = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.tagName + (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : '')
              + ':' + (el.textContent || '').trim().slice(0, 24) : 'none';
  };
  // The title TEXT, located by a Range over the text node itself rather than by
  // guessing an inset: the heading span leads with the chevron, so "left + a few
  // px" lands on an <svg> and a row asserting it hit the title would be lying.
  // The chevron gets its own point, because requirement 2 names it.
  const inner = hdrSpan.querySelector('span') || hdrSpan;
  const chev = inner.querySelector('span, svg');
  const textNode = [...inner.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  let titlePt = { x: Math.round(tr.left + tr.width - 4), y: Math.round(tr.top + tr.height / 2) };
  if (textNode) {
    const rg = document.createRange(); rg.selectNodeContents(textNode);
    const rr = rg.getBoundingClientRect();
    if (rr.width > 0) titlePt = { x: Math.round(rr.left + rr.width / 2), y: Math.round(rr.top + rr.height / 2) };
  }
  const cr = chev ? chev.getBoundingClientRect() : null;
  const chevronPt = cr && cr.width > 0
    ? { x: Math.round(cr.left + cr.width / 2), y: Math.round(cr.top + cr.height / 2) } : null;
  const deadGap = ar ? Math.round(ar.left - tr.right) : Math.round(hr.right - tr.right);
  const deadPt = ar
    ? { x: Math.round((tr.right + ar.left) / 2), y: Math.round(hr.top + hr.height / 2) }
    : { x: Math.round((tr.right + hr.right) / 2), y: Math.round(hr.top + hr.height / 2) };
  const actionPt = ar
    ? { x: Math.round(ar.left + ar.width / 2), y: Math.round(ar.top + ar.height / 2) }
    : null;
  return {
    found: true,
    title: (hdrSpan.textContent || '').trim(),
    headerH: Math.round(hr.height),
    sectionH: Math.round(sr.height),
    bodyH: Math.round(sr.height - hr.height),
    bodyKids,
    hasAction: !!action,
    actionLabel: action ? (action.getAttribute('aria-label') || action.title || '') : null,
    actionDisabled: action ? !!action.disabled : null,
    deadGap,
    titlePt, deadPt, actionPt, chevronPt,
    atTitle: at(titlePt.x, titlePt.y),
    atDead: at(deadPt.x, deadPt.y),
    atAction: actionPt ? at(actionPt.x, actionPt.y) : null,
    atChevron: chevronPt ? at(chevronPt.x, chevronPt.y) : null,
  };
})()`;

/**
 * How many layer CARDS are rendered — the children the user came for.
 *
 * ⚠ WHAT IDENTIFIES A CARD, AND WHY IT IS NOT THE TOP SPINNER'S TITLE ANY MORE
 * (O50 triage, 2026-09-03). This counter had been reporting 0 for every card
 * the app actually drew, hidden behind a `[1a]` no run could get past.
 *
 * It keyed on `/^Layer \d+ world_y/` over the top spinner's `title`. The panel
 * composes that title as ``Layer ${i} ${top.label} (…)``, and `top.label` is
 * `world_y` ONLY ON AN UNLOCKED SCENE: `layerTopBounds`
 * (renderer/providers/effects-aeon.ts) returns `label: 'Screen line'` whenever
 * `layerTopSpace(scene) === 'screen'`, which is what the scene this file
 * creates through the real New button is. So the FIELD never moved — the
 * SCENE'S SPACE decides the word, and a counter keyed on one arm of that branch
 * reads 0 on the other. The comment that used to sit here reasoned "the
 * spinner's title is the field's own name, so it moves only if the field does";
 * that is exactly the trap. The title carries a VALUE, not just a name.
 *
 * The identity no scene state can rewrite is the card's own Remove control:
 * `IconButton` with `label={'Remove layer ' + i}` renders a real
 * `<button aria-label="Remove layer N">` (components/ui/primitives.tsx), one per
 * card, present in every state (merely disabled at the layer floor).
 *
 * AND IT RETURNS THE ARTIFACT, NOT JUST THE COUNT — a bare 0 cannot distinguish
 * "the app drew no cards" (a defect) from "the finder moved" (an instrument
 * fault), which is precisely the confusion that cost this triage a run. The
 * caller prints the spinner titles it saw. docs/OVERSEER.md bar 2d(iii).
 */
const LAYER_CARDS = String.raw`
(() => {
  const hdrSpan = [...document.querySelectorAll('span')]
    .find(e => ${LAYERS_RE}.test((e.textContent || '').trim()));
  if (!hdrSpan) return -1;
  let header = hdrSpan;
  while (header && !(header.tagName === 'DIV'
         && parseFloat(getComputedStyle(header).paddingLeft) > 0)) header = header.parentElement;
  const section = header.parentElement.parentElement;
  // The bordered box, not a row inside it — the effects harness learned that a
  // naive text query counts both and reports 4 cards for 2. Cards are counted
  // by their own Remove button, NOT by the top spinner's title; the docblock
  // above says why, and why the title reads 0 on a locked scene.
  const bordered = [...section.querySelectorAll('div')].filter((d) =>
    parseFloat(getComputedStyle(d).borderTopWidth) >= 1);
  const numTitles = [...section.querySelectorAll('input[type=number]')]
    .map((e) => e.title || '');
  const n = bordered.filter((d) =>
    [...d.querySelectorAll('button[aria-label]')]
      .some((e) => /^Remove layer \d+$/.test(e.getAttribute('aria-label') || ''))).length;
  return { n, bordered: bordered.length, numbers: numTitles.length,
           sample: numTitles.slice(0, 3) };
})()`;

/** `{n, …}` from `LAYER_CARDS`, or a `{n:-1}` shaped value when the heading is gone. */
async function layerCards(c) {
  const v = await c.json(LAYER_CARDS);
  return (v === -1 || v === null) ? { n: -1, bordered: 0, numbers: 0, sample: [] } : v;
}
/** The one-line artifact a row prints beside its count. */
const cardsNote = (v) => `${v.n} cards (${v.bordered} bordered boxes, ${v.numbers} number `
  + `spinners; e.g. ${JSON.stringify(v.sample)})`;

const panelState = (c) => c.evalExpr(`localStorage.getItem(${JSON.stringify(PANEL_KEY)})`);

/**
 * A REAL MOUSE CLICK, at coordinates, through the browser's hit testing.
 * `el.click()` would dispatch a synthetic event straight at a chosen node and
 * would happily "click" a control that is covered, off-screen or disabled —
 * i.e. it can manufacture the very propagation this file is about.
 */
async function clickAt(c, pt) {
  const base = { x: pt.x, y: pt.y, button: 'left', clickCount: 1, buttons: 1 };
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
  await sleep(450);
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
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
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // PRINT THE CEILING THIS RUN MEASURED AGAINST. It is read from the schema
    // and it has moved once already (8 -> 16); a run that does not say which
    // number it used cannot be reconciled with an older one that used the other.
    console.log(`        schema ceiling: layers maxItems = ${LAYER_MAX}`);
    console.log(`        heading finder: ${LAYERS_RE}`);

    // ---- 0. Get to a real section with a real header action. --------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('0b', 'the aeon project is open, with sections', !!(st && st.open && st.sections > 0),
      JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');

    await sleep(2500);
    const onEffects = await c.evalExpr(clickByText('/^Effects$/'));
    check('0c', 'the Effects facet is reachable', onEffects === true);
    await sleep(1200);

    // The fixture scene is AUTHORED here, through the real form. Nothing is
    // saved: Ctrl+S is never pressed, so the aeon tree is left as found.
    const typed = await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    const pressedNew = typed === 'ok' && await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    const scenes = await c.json('window.__dbg.aeon.scenes()');
    // ADDRESSED BY ID, NOT BY POSITION, and that is a repair rather than a
    // preference. This row used to assert `scenes.length === 1 && scenes[0].id
    // === SCENE_ID`, which was true only while aeon's tree carried NO scene of
    // its own. It gained one on 2026-08-26 (`ojz_act1_start`, the handover-band
    // fixture) and every model-side row below silently started reading THAT
    // scene's layer count instead of this fixture's: nine rows went red at once
    // with the panel behaving perfectly, because the DOM side was right and the
    // model side was pointed at a different object. Measured on the tree before
    // and after ROADMAP item 41's layout pass — 22/31 both times, same nine
    // rows — so the break is the fixture's, not that parcel's.
    const sceneOf = (list) => list.find((s) => s.id === SCENE_ID) ?? null;
    check('0d', 'the fixture scene exists, so the Scene and Layers sections are mounted',
      sceneOf(scenes) !== null,
      `typed=${typed} new=${pressedNew} scenes=${JSON.stringify(scenes)}`);
    await sleep(700);

    // ---- 1. ANTI-VACUOUS: the instrument can see its subject. -------------
    let p = await c.json(SECTION_PROBE(LAYERS_RE));
    if (!p.found) {
      unmeasurable('1a', 'the Layers section is on screen', p.why);
      throw new Error(`no subject: ${p.why}`);
    }
    let cards = await layerCards(c);
    check('1a', 'the Layers section is on screen, EXPANDED, with visible children',
      p.bodyKids > 0 && p.bodyH > 0 && cards.n > 0,
      `"${p.title}" header ${p.headerH}px, body ${p.bodyH}px, ${p.bodyKids} body nodes, `
      + cardsNote(cards));
    check('1b', 'its header carries a real ACTION control, and it is enabled',
      p.hasAction === true && p.actionDisabled === false && /Add layer/i.test(p.actionLabel || ''),
      `action=${JSON.stringify(p.actionLabel)} disabled=${p.actionDisabled}`);
    // Requirement 2 needs somewhere that is neither title nor button to click.
    check('1c', 'the header row has dead space between the title and the action',
      p.deadGap >= 8, `gap = ${p.deadGap}px (title ends, action begins)`);
    // The coordinates are only worth anything if the browser agrees what is
    // under them. Without this a "click" can quietly land on the wrong node and
    // every row below becomes fiction.
    check('1d', 'the four click points hit what this harness thinks they hit',
      /^SPAN/.test(p.atTitle) && !/BUTTON/.test(p.atTitle)
      && !/BUTTON/.test(p.atDead)
      && !!p.chevronPt && !/BUTTON/.test(p.atChevron || 'BUTTON')
      && /BUTTON|SPAN/.test(p.atAction || ''),
      `title@${p.titlePt.x},${p.titlePt.y} → ${p.atTitle}\n        `
      + `chevron@${p.chevronPt ? p.chevronPt.x + ',' + p.chevronPt.y : '—'} → ${p.atChevron}\n        `
      + `dead@${p.deadPt.x},${p.deadPt.y} → ${p.atDead}\n        `
      + `action@${p.actionPt.x},${p.actionPt.y} → ${p.atAction}`);
    await shot(c, '1-layers-expanded');

    // ---- 2. THE TOGGLE IS ALIVE (requirement 2, and trap (a)'s antidote). --
    //
    // If this section carried a `collapsedOverride`, `toggle` would early-return
    // and EVERY subject row below would pass with the fix deleted. These rows
    // are the proof that it does not: the title click has to really collapse it,
    // in the DOM and in storage, and the second click has to bring it back.
    const before2 = await panelState(c);
    await clickAt(c, p.titlePt);
    let after2 = await panelState(c);
    let q = await c.json(SECTION_PROBE(LAYERS_RE));
    check('2a', 'clicking the TITLE collapses the section (children leave the DOM)',
      q.found && q.bodyKids === 0 && q.bodyH === 0 && (await layerCards(c)).n === 0,
      `body ${q.bodyH}px, ${q.bodyKids} body nodes`);
    // This is also the row that validates PANEL_KEY: a wrong key reads null and
    // fails here instead of making every "unchanged" row below trivially true.
    check('2b', `clicking the TITLE writes through to persisted panel state under ${PANEL_KEY}`,
      typeof after2 === 'string' && JSON.parse(after2)[LAYERS_ID] === true,
      `before=${before2} after=${after2}`);
    await clickAt(c, p.titlePt);
    // A collapsed header sits where it did, but re-measure anyway rather than
    // reusing stale coordinates across a relayout.
    p = await c.json(SECTION_PROBE(LAYERS_RE));
    cards = await layerCards(c);
    const after2b = await panelState(c);
    check('2c', 'clicking the TITLE again re-expands it, in the DOM and in storage',
      p.found && p.bodyKids > 0 && cards.n > 0 && JSON.parse(after2b)[LAYERS_ID] === false,
      `body ${p.bodyH}px, ${cardsNote(cards)}, state=${after2b}`);

    // Requirement 2's other half: DEAD SPACE in the header row still toggles.
    // A fix that narrowed the hit target to the title alone would pass 2a–2c
    // and fail here.
    await clickAt(c, p.deadPt);
    let q3 = await c.json(SECTION_PROBE(LAYERS_RE));
    const afterDead = await panelState(c);
    check('2d', 'clicking DEAD SPACE in the header row still toggles (the hit target is the row)',
      q3.found && q3.bodyKids === 0 && JSON.parse(afterDead)[LAYERS_ID] === true,
      `body ${q3.bodyH}px, ${q3.bodyKids} body nodes, state=${afterDead}`);
    await clickAt(c, p.deadPt);
    p = await c.json(SECTION_PROBE(LAYERS_RE));
    check('2e', 'and dead space brings it back',
      p.found && p.bodyKids > 0 && (await layerCards(c)).n > 0,
      `body ${p.bodyH}px, state=${await panelState(c)}`);

    // The CHEVRON is the one part of the header that looks like a control, and
    // is the part most likely to be caught by an over-broad "did they click
    // something interactive?" rule. It has to keep toggling.
    if (!p.chevronPt) {
      unmeasurable('2f', 'the chevron toggles the section', 'no chevron rect in the header');
    } else {
      await clickAt(c, p.chevronPt);
      const q4 = await c.json(SECTION_PROBE(LAYERS_RE));
      const afterChev = await panelState(c);
      check('2f', 'clicking the CHEVRON still toggles',
        q4.found && q4.bodyKids === 0 && JSON.parse(afterChev)[LAYERS_ID] === true,
        `body ${q4.bodyH}px, ${q4.bodyKids} body nodes, state=${afterChev}`);
      await clickAt(c, q4.chevronPt ?? p.chevronPt);
      p = await c.json(SECTION_PROBE(LAYERS_RE));
      check('2g', 'and the chevron brings it back, so the section is expanded for the subject rows',
        p.found && p.bodyKids > 0 && (await layerCards(c)).n > 0,
        `body ${p.bodyH}px, state=${await panelState(c)}`);
    }

    // ---- 3. THE SUBJECT: the action click must not toggle. -----------------
    //
    // Odd click counts are the ones that showed the bug (an even number of
    // stray toggles cancels out and looks fine), so the assertions are made
    // after EVERY click, starting with the first.
    const stateBefore3 = await panelState(c);
    for (let n = 1; n <= 3; n++) {
      const layersBefore = sceneOf(await c.json('window.__dbg.aeon.scenes()')).layers;
      const shot0 = await c.json(SECTION_PROBE(LAYERS_RE));
      if (!shot0.found || !shot0.actionPt) {
        unmeasurable(`3a.${n}`, `click ${n}: the Add layer control is on screen`,
          shot0.why ?? 'no action control in the header');
        break;
      }
      await clickAt(c, shot0.actionPt);
      const layersAfter = sceneOf(await c.json('window.__dbg.aeon.scenes()')).layers;
      const after = await c.json(SECTION_PROBE(LAYERS_RE));
      const cardsAfter = await layerCards(c);
      const stateAfter = await panelState(c);
      // ANTI-VACUOUS, and the alternative green-path this row exists to close:
      // a click that never reached the button also never toggles anything, so
      // 3b/3c would pass for the wrong reason. The MODEL has to have moved.
      check(`3a.${n}`, `click ${n}: the Add layer click really reached the button (layers ${layersBefore}→${layersAfter})`,
        layersAfter === layersBefore + 1, `model layers ${layersBefore} → ${layersAfter}`);
      check(`3b.${n}`, `click ${n}: the section is STILL EXPANDED after the action`,
        after.found && after.bodyKids > 0 && after.bodyH > 0 && cardsAfter.n === layersAfter,
        `"${after.title}" body ${after.bodyH}px, ${after.bodyKids} body nodes, `
        + `${cardsNote(cardsAfter)} for ${layersAfter} layers`);
      // THE LOAD-BEARING ROW. A re-render can put children back; nothing puts
      // an unwanted localStorage write back.
      check(`3c.${n}`, `click ${n}: persisted panel state was NOT written for ${LAYERS_ID}`,
        stateAfter === stateBefore3,
        `before=${stateBefore3}\n        after =${stateAfter}`);
    }
    await shot(c, '2-after-add-layer-clicks');

    // ---- 4. THE ORIGINAL SYMPTOM, at the schema's ceiling. -----------------
    //
    // Item 32 was found at "Layers (8/8) over an empty panel". Growing the stack
    // to the maximum reproduces the exact reported state rather than a nearby
    // one — and the last click is the 7th, the odd one that did it.
    let scene = sceneOf(await c.json('window.__dbg.aeon.scenes()'));
    let guardTrips = 0;
    while (scene.layers < LAYER_MAX && guardTrips < LAYER_MAX + 4) {
      const s = await c.json(SECTION_PROBE(LAYERS_RE));
      if (!s.found || !s.actionPt || s.actionDisabled) break;
      await clickAt(c, s.actionPt);
      scene = sceneOf(await c.json('window.__dbg.aeon.scenes()'));
      guardTrips++;
    }
    const atMax = await c.json(SECTION_PROBE(LAYERS_RE));
    const cardsAtMax = await layerCards(c);
    const stateAtMax = await panelState(c);
    check('4a', 'the stack really did grow to the schema maximum through the real control',
      scene.layers === LAYER_MAX && LAYERS_AT_MAX.test(atMax.title || ''),
      `model layers=${scene.layers}, heading="${atMax.title}"`);
    // The literal defect report: the heading says 8/8 and there is nothing
    // under it.
    check('4b', `at ${LAYER_MAX}/${LAYER_MAX} the panel is NOT empty — the heading and the body agree`,
      cardsAtMax.n === LAYER_MAX && atMax.bodyKids > 0,
      `heading "${atMax.title}" over ${cardsNote(cardsAtMax)}, ${atMax.bodyKids} body nodes, `
      + `body ${atMax.bodyH}px`);
    check('4c', 'seven Add-layer clicks left persisted panel state untouched',
      stateAtMax === stateBefore3, `before=${stateBefore3}\n        after =${stateAtMax}`);
    await shot(c, `3-layers-${LAYER_MAX}-of-${LAYER_MAX}`);

    // ---- 5. THE OTHER INTERACTIVE CALL SITE: Delete scene. ----------------
    //
    // Clicking Delete UNMOUNTS the section, so the DOM observable says nothing
    // here — which is precisely why the persisted write is the load-bearing one.
    // If the delete had toggled `aeon.effects.scene` on the way out, the write
    // would survive the unmount and be waiting for the next session.
    const sceneProbe = await c.json(SECTION_PROBE('/^Scene: /'));
    if (!sceneProbe.found || !sceneProbe.actionPt) {
      unmeasurable('5a', 'the Scene section and its Delete control are on screen',
        sceneProbe.why ?? 'no action control in the Scene header');
    } else {
      check('5a', 'the Scene section is on screen with an enabled Delete action',
        sceneProbe.actionDisabled === false && /Delete scene/i.test(sceneProbe.actionLabel || ''),
        `action=${JSON.stringify(sceneProbe.actionLabel)}`);
      const stateBefore5 = await panelState(c);
      await clickAt(c, sceneProbe.actionPt);
      const scenesAfter = await c.json('window.__dbg.aeon.scenes()');
      const stateAfter5 = await panelState(c);
      check('5b', 'the Delete click reached the button (the FIXTURE scene left the model)',
        sceneOf(scenesAfter) === null, `scenes=${JSON.stringify(scenesAfter)}`);
      check('5c', `Delete did not write ${SCENE_SECTION_ID} into persisted panel state`,
        stateAfter5 === stateBefore5
        && !(JSON.parse(stateAfter5 ?? '{}')[SCENE_SECTION_ID] === true),
        `before=${stateBefore5}\n        after =${stateAfter5}`);
    }

    // ---- 6. THE NARROWNESS CHECK: a NON-interactive right slot still toggles.
    //
    // `Explorer` and `ProjectSetupTab` pass a plain <span> counter in `right`,
    // and that span is part of the generous header hit area today. The blunt
    // fix — wrapping the whole slot in a stopPropagation div — would break this
    // and nothing else in this file would notice. Explorer's groups are the
    // live example, and their `collapsedOverride` is `undefined` while the
    // filter box is empty, so the toggle is reachable.
    const cnt = await c.json(String.raw`
      (() => {
        // A count badge in an Explorer header: a span holding only digits that
        // sits inside a PanelHeader div.
        const spans = [...document.querySelectorAll('span')];
        const badge = spans.find((e) => {
          if (!/^\d+$/.test((e.textContent || '').trim())) return false;
          let p = e.parentElement;
          return !!(p && p.tagName === 'DIV'
                    && getComputedStyle(p).textTransform === 'uppercase'
                    && parseFloat(getComputedStyle(p).paddingLeft) > 0);
        });
        if (!badge) return { found: false, why: 'no digits-only count badge in any PanelHeader' };
        const header = badge.parentElement;
        const section = header.parentElement.parentElement;
        const wrapper = header.parentElement;
        const heading = (header.querySelector('span') || {}).textContent || '';
        const r = badge.getBoundingClientRect();
        return {
          found: true, heading: heading.trim(), count: badge.textContent.trim(),
          bodyKids: [...section.children].filter((el) => el !== wrapper).length,
          pt: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
        };
      })()`);
    if (!cnt.found) {
      unmeasurable('6a', 'a section with a NON-interactive right slot is on screen', cnt.why);
    } else {
      const before6 = await panelState(c);
      await clickAt(c, cnt.pt);
      const after6 = await c.json(String.raw`
        (() => {
          const spans = [...document.querySelectorAll('span')];
          const badge = spans.find((e) => {
            if (!/^\d+$/.test((e.textContent || '').trim())) return false;
            let p = e.parentElement;
            return !!(p && p.tagName === 'DIV'
                      && getComputedStyle(p).textTransform === 'uppercase'
                      && parseFloat(getComputedStyle(p).paddingLeft) > 0);
          });
          if (!badge) return { found: false };
          const header = badge.parentElement, wrapper = header.parentElement;
          const section = wrapper.parentElement;
          return { found: true,
            bodyKids: [...section.children].filter((el) => el !== wrapper).length };
        })()`);
      const state6 = await panelState(c);
      check('6a', 'a plain <span> in the right slot STILL toggles — the fix did not widen into the whole slot',
        after6.found && after6.bodyKids !== cnt.bodyKids && state6 !== before6,
        `"${cnt.heading}" (${cnt.count}) body nodes ${cnt.bodyKids} → ${after6.bodyKids}\n        `
        + `before=${before6}\n        after =${state6}`);
    }
    await shot(c, '4-final');
  } finally {
    if (c) {
      try { await c.send('Runtime.evaluate', { expression: 'window.close()' }); } catch { /* */ }
      await sleep(2500);
      try { c.close(); } catch { /* */ }
    }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* */ }
    try { execSync('sleep 3', { shell: '/bin/bash' }); } catch { /* */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* */ }
    // The bracket keeps the pattern from matching this very command line.
    // O16: a `pkill -f` on a dist path is NOT an ownership test — it matched the
    // OWNER'S Aurora and (from a worktree) spared this run's own orphan. killTree()
    // below signals only pids descended from what this harness spawned.
    await sleep(1000);
    console.log(`\nport free after teardown: ${await portFree()}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) {
    console.log(`FAILED ROWS (${fails.length}):`);
    for (const f of fails) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
