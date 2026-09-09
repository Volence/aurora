#!/usr/bin/env node
// DOES THE ROW-REMAP ROW EXPORT A SHIFT, REFUSE A BAD PLANE LINE, AND SAY WHAT
// WILL NOT BUILD — ON SCREEN? (EW-9-ROWREMAP-CONTROL.)
//
// ============================================================================
// WHY A HARNESS AND NOT A TEST
// ============================================================================
//
// `test/formats/effects-row-remap.test.ts` proves the codec round-trips the key,
// that `rowRemapWithHeightShift` writes the shift, that `rowRemapPlaneYRefusal`
// refuses past 511, and that `rowRemapPreconditions` reports the three
// conditions. It cannot prove any of this:
//
//        AN AUTHOR TURNS A STRIP'S `Row remap` ROW ON, PICKS THE OPTION THAT
//        READS ITS LINE COUNT, AND THE DOCUMENT HOLDS THE SHIFT — NOT THE LINES
//        — WHILE A SENTENCE UNDER THAT ROW SAYS IT WILL NOT BUILD YET, AND THE
//        SENTENCE IS WHERE THE AUTHOR WOULD READ IT.
//
// and it cannot on principle, three times over:
//
//   1. THE UNIT IS A SEAM. The suite calls `rowRemapWithHeightShift` directly.
//      That the PICKER calls it with `o.shift` rather than with the LINE COUNT
//      it is labelled by is a property of the wiring, and only the running app
//      has it. Every value 3..7 is legal, so the wrong wiring produces a band
//      FOUR TIMES TOO TALL with a green build and no refusal anywhere.
//      (docs/superpowers/.../seam-has-no-author.)
//   2. THE PLANE-LINE REFUSAL IS A WIRING FACT. `refuse` on `NumberField` is
//      what withholds the commit; `min`/`max` on an `<input type="number">` look
//      identical in source and stop no typed value — so a source-level assertion
//      about the bound is the shape of the bug, not a check on it.
//
//      ⚠ THIS PARAGRAPH USED TO SAY the bound was the ONLY enforcement of
//      `plane_y`'s ceiling anywhere in the pipeline, "aeon's own ensure tests
//      `>= 0` alone". THAT IS NO LONGER TRUE and row [5b] asserted it as a
//      requirement on the app for a day after it stopped being true: aeon landed
//      an engine-side `< 512` guard (aeon d593070a) the same night, and the
//      vendored contract now calls this schema ONE OF TWO ENFORCEMENTS of the
//      511 ceiling. [5b] derives that phrase, and the OTHER enforcer's identity,
//      FROM THE CONTRACT'S OWN DESCRIPTION rather than typing either, so the
//      next amendment moves the row instead of aging it into a false demand.
//   3. A WARNING THAT IS NOT PAINTED IS NOT A WARNING. The three `scene()`
//      preconditions are the whole point of the parcel: they are refused by
//      aeon's GENERATOR, so an author who does not read them here reads them in
//      a build log. "The function returns a string" is not that.
//
// So every row below drives the REAL controls and reads the MODEL back
// (`window.__dbg.aeon.scenesJson()`), never the widget, except where the widget
// is explicitly the "the gesture landed" witness.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE GESTURE NEVER LANDED, so "the document did not change" is true because
//     nothing happened. Row [5c] types a LEGAL plane line through the same path
//     and requires the model to MOVE — the anti-vacuous floor for [5a]. Row [4a]
//     requires the model to move too, and to a specific value.
//
//   • THE SCENE WAS ALREADY REMAPPED. Row [2a] reads every layer out of the
//     model BEFORE anything is touched and requires NONE to carry a remap;
//     aeon's shipped `ojz_act1_depth.json` carries none, and the row prints what
//     it read so contamination is visible rather than silent.
//
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. ⚠ MEASURED IN THIS REPO:
//     `checkVisibility()` → true and `getClientRects().length` → 1 on an element
//     sitting 2,635px OUTSIDE its scroller. So every paint row compares the
//     leaf's RECT AGAINST THE SCROLLER'S OWN BOX and requires a strict
//     `elementFromPoint`; the trio is printed as evidence and is never the gate.
//
//   • A DIFFERENT CONTROL WAS DRIVEN. The select, the box and the picker are
//     found by their `title`s, which are built from `LAYER_ROW_REMAP_ROW` — not
//     "the Nth select in the column", which moves as sections expand.
//
//   • THE HARNESS AGREED WITH THE APP BY CONSTRUCTION. Every bound, the
//     shift/line relation and the reserved names are re-derived IN THIS PROCESS
//     from the VENDORED SCHEMA JSON, never imported from the module under test.
//
//   • THE WARNING FIRED FOR EVERY STRIP. Row [6c] is a DISCRIMINATING PAIR: the
//     "nothing to vary" sentence must appear on the strip that has no curve and
//     must NOT appear on the strip that has one, in the same read.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER — and nothing here
// claims a band visibly compresses on screen: that needs the built ROM, and
// aeon's generator half (9b) does not exist yet, so no ROM can be built through
// this path at all. That is the foreground lane's to take.
//
// CLEANUP IS BY PID — `spawnGuarded` + `killTree`, awaited.
//
// RUN:
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AEON_DIR=<writable copy> npm run harness:row-remap-control
//
//   ⚠ FRESH COPY PER RUN. This harness AUTHORS a remap into a scene and never
//   saves, so nothing reaches disk — but row [2a]'s floor describes aeon's
//   shipped file, and a copy another harness has saved into is not that fixture.
//
//   PLANT=lines-not-shift … row [4a] reads the option's LINE COUNT as if it had
//                           been written, the exact defect this file exists to
//                           catch. [4a] must FAIL.
//   PLANT=widget          … row [5a] reads the plane box's own value instead of
//                           the model, the vacuous shape. [5a] must FAIL.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9473);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 97);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-row-remap-control`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';
const SCENE_ID = process.env.SCENE_ID ?? 'ojz_act1_depth';

// ---------------------------------------------------------------------------
// THE CONTRACT, RE-DERIVED IN THIS PROCESS FROM THE VENDORED BYTES
// ---------------------------------------------------------------------------
//
// NOT imported from `scene-ui.ts`. The properties under test are "the app
// exports the SHIFT" and "the app holds the contract's plane-line ceiling";
// asking the module under test what the shift and the ceiling are would make
// every row agree with the app by construction.
const SCHEMA = JSON.parse(readFileSync(
  `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
const RR_NODE = SCHEMA.$defs.layer.properties.rowRemap;
const RR_PAYLOAD = RR_NODE.oneOf.find((b) => b.properties?.plane_y).properties;
const PLANE_Y = RR_PAYLOAD.plane_y;
const HEIGHT = RR_PAYLOAD.height_shift;
// EVERY SHIFT THE CONTRACT ADMITS, read from whichever shape it uses. This node
// was `minimum 3 / maximum 7` through empyrean 60d9f6a and is `enum [4]` at
// 2e5046e; the min/max loop this replaced computed `undefined..undefined` = []
// against the amended contract, which is a FALSE ZERO wearing a working loop's
// clothes — the banner below would have printed a blank contract line under the
// words "ALL READ FROM THE VENDORED SCHEMA". Still not imported from
// `scene-ui.ts`, for the reason stated above: the app must not be asked what the
// contract says.
const SHIFTS = (() => {
  if (Array.isArray(HEIGHT.enum)) return [...HEIGHT.enum].sort((x, y) => x - y);
  if (HEIGHT.const !== undefined) return [HEIGHT.const];
  if (typeof HEIGHT.minimum === 'number' && typeof HEIGHT.maximum === 'number') {
    const out = [];
    for (let s = HEIGHT.minimum; s <= HEIGHT.maximum; s++) out.push(s);
    return out;
  }
  throw new Error('the vendored contract admits no derivable height_shift set: it carries '
    + 'neither an enum, nor a const, nor a numeric minimum/maximum pair. This harness cannot '
    + 'report on a picker whose legal values it cannot name.');
})();
/** `H = 1 << shift`, spelled here rather than imported — the whole hazard. */
const linesFor = (shift) => 1 << shift;
/** The reserved names, found by the `{"not": {}}` idiom, not listed. */
const RESERVED = Object.keys(RR_PAYLOAD).filter(
  (k) => RR_PAYLOAD[k] && typeof RR_PAYLOAD[k].not === 'object'
    && RR_PAYLOAD[k].not !== null && Object.keys(RR_PAYLOAD[k].not).length === 0);
/** The one shift the contract says builds today, or null once 9b lands. */
const BUILDABLE = (() => {
  const m = /TODAY ONLY (\d+) BUILDS/.exec(String(HEIGHT.description));
  return m ? Number(m[1]) : null;
})();
/**
 * A shift that is legal and does NOT build — the one row [4a] picks, or
 * `undefined` when the contract admits no such shift.
 *
 * ⚠ THE `BUILDABLE === null` ARM IS NOT DECORATION. `SHIFTS.find((s) => s !==
 * BUILDABLE)` alone returns the FIRST admitted shift when `BUILDABLE` is null,
 * because every number differs from null — so "a shift that does not build"
 * would silently mean "the shift that does", and [4a] would pick the value
 * already seeded and pass on a no-op. Found while re-deriving this file against
 * empyrean 2e5046e, where `BUILDABLE` reads null for the first time.
 */
const UNBUILDABLE = BUILDABLE === null
  ? undefined
  : SHIFTS.find((s) => s !== BUILDABLE);

/**
 * HOW MANY THINGS ENFORCE THE PLANE-LINE CEILING, AND WHICH — read from the
 * contract, never typed. THIS IS WHY THE ROW EXISTS IN THIS SHAPE.
 *
 * [5b] used to demand the painted sentence call Aurora's bound the
 * `ONLY ENFORCEMENT` of the ceiling. That was a TYPED LITERAL of a fact, and the
 * fact changed under it: aeon landed an engine-side `< 512` guard and aurora
 * correctly retired the claim, so the row went red asking the app to put a
 * FALSEHOOD back in front of an author. A row may never be relaxed to pass, but
 * a row asserting something untrue must be rewritten to the truth — and written
 * so the NEXT amendment moves it too, which a literal cannot be.
 *
 * So both halves come out of `plane_y`'s own description:
 *   • the phrase `ONE OF <n> ENFORCEMENTS` — if a third enforcer lands and the
 *     contract says THREE, this needle says THREE and the row stays red until
 *     the app's sentence says three as well;
 *   • the OTHER enforcer, as the contract identifies it: the possessive names
 *     WHOSE it is (`aeon`) and the hyphenated qualifier names WHERE it lives
 *     (`engine-side`). Reword the contract to, say, a link-time check in sigil
 *     and both needles move with it.
 *
 * Each derivation THROWS rather than degrading to no check. A regex that stops
 * matching must not quietly hand back `undefined` and leave a green row testing
 * nothing — the exact false-zero the `SHIFTS` loop above was rebuilt to avoid.
 */
const PLANE_Y_DESC = String(PLANE_Y.description ?? '');
const CEILING_ENFORCEMENTS = (() => {
  const m = /ONE OF (\w+) ENFORCEMENTS?/i.exec(PLANE_Y_DESC);
  if (!m) {
    throw new Error('the vendored contract\'s plane_y description no longer carries an '
      + '"ONE OF <n> ENFORCEMENTS" phrase. Row [5b] reads how many things enforce this ceiling '
      + 'from that phrase and asserts the app says the same; re-derive it against the amended '
      + 'contract rather than typing whatever it says today.');
  }
  return m[0];
})();
/** Who owns the enforcement that is NOT this schema, and where it lives. */
const OTHER_ENFORCER = (() => {
  const paren = /ONE OF \w+ ENFORCEMENTS?[^(]*\(([^)]*)\)/i.exec(PLANE_Y_DESC);
  if (!paren) {
    throw new Error(`the contract says "${CEILING_ENFORCEMENTS}" but no longer lists them in a `
      + 'parenthetical, so the OTHER enforcer cannot be named. Row [5b] requires the app to name '
      + 'it; re-derive against the amended contract.');
  }
  // The list runs to the first `;`; what follows is the keep-both warning, not a
  // member of it. "this schema" is the enforcement the app IS — the other is the
  // one the app must tell the author about.
  const members = paren[1].split(';')[0].split(/,\s*and\s+/).map((s) => s.trim());
  const other = members[members.length - 1];
  const actor = /([A-Za-z]+)'s\b/.exec(other);
  const qualifier = /\b[a-z]+-[a-z]+\b/.exec(other);
  if (members.length < 2 || !actor || !qualifier) {
    throw new Error(`the contract's enforcement list ${JSON.stringify(paren[1].split(';')[0])} `
      + 'no longer names a second enforcer with a possessive owner and a hyphenated qualifier. '
      + 'Row [5b] derives both from it rather than typing "aeon" and "engine-side"; re-derive.');
  }
  return { clause: other, actor: actor[1], qualifier: qualifier[0] };
})();

/**
 * THE FOUR REFUSALS AEON'S GENERATOR OWNS, in the contract's own words.
 *
 * Re-derived here from the vendored bytes, NOT imported from `scene-ui.ts`,
 * for this file's standing reason: the property under test is that the app
 * paints the CONTRACT'S clause under the row, and asking the module under test
 * what the clause says would make [6a]/[6b] agree with it by construction.
 * Rows [6a] and [6b] typed `MUST declare anchor` and `at most ONE layer` as
 * literals; they now assert the whole clause, and an amendment to its wording
 * moves the harness and the app together instead of aging one against the other.
 */
const GENERATOR_REFUSALS = (() => {
  const head = /REFUSALS THIS SCHEMA DOES NOT ENCODE[^:]*:([\s\S]*?)(?:\.\s|\.$)/
    .exec(String(RR_NODE.description ?? ''));
  if (!head) {
    throw new Error('the vendored contract no longer carries a "REFUSALS THIS SCHEMA DOES NOT '
      + 'ENCODE ...:" clause. Rows [6a] and [6b] read the sentences the app must paint from that '
      + 'clause; re-derive against the amended contract.');
  }
  // A clause is what follows the last `): ` in its own text — the first one comes
  // back carrying the tail of aeon's `file:line` citation otherwise.
  const clauses = head[1].split(';')
    .map((c) => c.replace(/^[\s\S]*?\):\s*/, '').trim())
    .filter((c) => c.length > 0);
  const find = (what, needle) => {
    const hit = clauses.find((c) => needle.test(c));
    if (hit === undefined) {
      throw new Error(`the contract's refusal clause no longer states the "${what}" condition `
        + `(looked for ${needle}). It has ${clauses.length} clause(s): ${JSON.stringify(clauses)}.`);
    }
    return hit;
  };
  return {
    anchor: find('no anchor declared', /declare anchor/),
    single: find('more than one remapped layer', /at most ONE layer/),
  };
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

/** The remap on/off `<select>` for one strip, by the row's own title. */
const RR_SELECT = (layer) => String.raw`
(() => [...document.querySelectorAll('select')]
  .find((s) => (s.title || '').startsWith('Layer ' + ${layer} + ' rowRemap: ')) || null)()`;

/** The plane-line box for one strip. */
const RR_BOX = (layer) => String.raw`
(() => [...document.querySelectorAll('input[type="number"]')]
  .find((i) => (i.title || '').startsWith('Layer ' + ${layer} + ' rowRemap.plane_y')) || null)()`;

/** The height picker for one strip. */
const RR_HEIGHT = (layer) => String.raw`
(() => [...document.querySelectorAll('select')]
  .find((s) => (s.title || '').startsWith('Layer ' + ${layer} + ' rowRemap.height_shift')) || null)()`;

/**
 * The leaf carrying `needle`, MEASURED AGAINST ITS SCROLLER.
 *
 * `insideScroller` and `hitInside` are the gate. `visible` and `rects` are
 * recorded because they are the two that do NOT discriminate — both go green on
 * an element scrolled thousands of pixels out of its own scroller.
 */
const PAINTED_LEAF = (needle, afterSelector, { ci = false } = {}) => String.raw`
(() => {
  const anchor = ${afterSelector};
  // ci: fold case before comparing. Used ONLY by [5b], whose needle is derived
  // from the contract's own SHOUTED phrase. The claim there is the FACT — how
  // many things enforce the ceiling — and a row that reddens because the app
  // sentence-cased a phrase is a row the next reader relaxes. Every other needle
  // stays exact, because it names a specific string the app either paints or
  // does not.
  const fold = (s) => (${ci} ? String(s).toLowerCase() : String(s));
  const NEEDLE = fold(${JSON.stringify(needle)});
  // 'div,span', NOT 'div'. MEASURED: the precondition sentences are wrapped in a
  // <span> (the testid Hint drops), so the Hint <div> HAS a child carrying the
  // needle and the leaf rule excluded it while the sentence was plainly on
  // screen — a paint row that goes red for a reason that is not about paint.
  const leaves = [...document.querySelectorAll('div,span')]
    .filter((d) => fold(d.innerText || '').includes(NEEDLE)
                && ![...d.children].some((k) => fold(k.innerText || '').includes(NEEDLE)));
  const leaf = leaves[0] || null;
  if (!leaf) return { leaf: false, candidates: leaves.length };
  leaf.scrollIntoView({ block: 'center' });
  let sc = leaf.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const b = leaf.getBoundingClientRect();
  const cb = sc ? sc.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    leaf: true, text: (leaf.innerText || '').trim(),
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
    scroller: cb ? { top: Math.round(cb.top), bottom: Math.round(cb.bottom) } : null,
    insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
    // ⚠ TWO DIFFERENT QUESTIONS, AND STRICT CONTAINMENT ANSWERS BOTH AT ONCE.
    // "is this sentence on screen" and "does this sentence FIT IN ITS BOX" are
    // separate properties, and a block TALLER than its scroller fails
    // containment at every scroll position while being plainly readable. That is
    // a real finding about the BLOCK, but it is not evidence about the
    // sentence's WORDS, and a row asserting the words must not inherit it — see
    // rows [5b] and [5b2], which were one row until it went red for both reasons
    // at once and neither could be told from the other.
    //
    // The on-screen half is: the leaf's own CENTRE lies in the scroller's box,
    // AND elementFromPoint at that centre hits the leaf. Together those defeat
    // the hazard containment was added for (an element 2,635px outside its
    // scroller, where checkVisibility and getClientRects both go green) at any
    // block height, because a block scrolled that far has its centre outside too.
    centreInScroller: !!(cb && (b.top + b.bottom) / 2 >= cb.top
                            && (b.top + b.bottom) / 2 <= cb.bottom),
    tallerThanScroller: !!(cb && (b.bottom - b.top) > (cb.bottom - cb.top)),
    hitInside: !!(hit && (hit === leaf || leaf.contains(hit) || hit.contains(leaf))),
    afterControl: anchor ? (anchor.compareDocumentPosition(leaf) & 4) === 4 : null,
    visible: typeof leaf.checkVisibility === 'function' ? leaf.checkVisibility() : null,
    rects: leaf.getClientRects().length,
  };
})()`;

/**
 * How many precondition hints one strip's card is painting, with their text.
 *
 * ⚠ `innerText`, NEVER `textContent`, AND THAT IS THE WHOLE GATE. The mechanism
 * half of each advisory is in the DOM while collapsed (`display: none`, not
 * unmounted — `Advisory`'s docblock says so and says why: find-in-page must
 * still reach it). `textContent` therefore returns the folded sentence whether
 * the disclosure works, is stuck shut, or was never wired at all, and a row
 * reading it would pass on a permanently hidden paragraph. `innerText` on a
 * RENDERED node reports only what is laid out, so a row that reads it after
 * clicking is reporting on the click.
 */
const PRECONDITIONS = (layer) => String.raw`
(() => {
  const nodes = [...document.querySelectorAll(
    '[data-testid="layer-' + ${layer} + '-rowremap-precondition"]')];
  return nodes.map((n) => (n.innerText || '').trim());
})()`;

/**
 * OPEN EVERY "Why this happens" ON ONE STRIP'S PRECONDITIONS, and report what
 * the click did — never whether a container exists.
 *
 * The contract quotes moved behind this disclosure at `73fc44bf`, and rows [6a]
 * and [6b] were written before it. RULED HOUSE STYLE, NOT A DEGRADATION, and the
 * ruling is a measurement rather than a preference — see the packet
 * `docs/reviews/2026-09-06-rowremap-three-red.md` §2. In one line: the
 * PRECONDITION itself (the diagnosis, naming the missing input and the guilty
 * strips) is on screen with nothing clicked, which [6a] measures below; only
 * aeon's VERBATIM WORDING is folded, and unfolding it puts back a block measured
 * at 165px in a box whose floor is 129px — a paragraph no scroll position shows
 * whole. So the rows learn to click.
 *
 * ⚠ THE CLICK AND THE READ-BACK ARE TWO EVALUATIONS, NOT ONE, AND THAT COST A
 * RUN. Reading `aria-expanded` in the same synchronous pass that clicked reports
 * the state BEFORE React re-renders — every button came back "false" while the
 * folded sentence was demonstrably painted in the very next measurement. A
 * disclosure gate that reads its own attribute too early is a gate that fails on
 * a working app, which is the shape this whole file exists to refuse.
 *
 * `WHY_STATE` is the read-back, and a row must never be satisfied by either of
 * these returning a button count: they say whether the click LANDED, so a red
 * row that never opened can be told from a red row whose sentence is gone.
 */
const EXPAND_WHYS = (layer, kind = 'precondition') => String.raw`
(() => {
  const cards = [...document.querySelectorAll(${JSON.stringify(`[data-testid$="-rowremap-${kind}"]`)})]
    .filter((c) => c.getAttribute('data-testid').startsWith('layer-' + ${layer} + '-'));
  const buttons = cards.flatMap((c) => [...c.querySelectorAll('button[aria-expanded]')]);
  let clicked = 0;
  for (const b of buttons) {
    if (b.getAttribute('aria-expanded') !== 'true') { b.click(); clicked++; }
  }
  return { cards: cards.length, buttons: buttons.length, clicked };
})()`;

/** What the disclosures of one kind on one strip say AFTER the re-render. */
const WHY_STATE = (layer, kind = 'precondition') => String.raw`
(() => {
  const buttons = [...document.querySelectorAll(${JSON.stringify(`[data-testid$="-rowremap-${kind}"]`)})]
    .filter((c) => c.getAttribute('data-testid').startsWith('layer-' + ${layer} + '-'))
    .flatMap((c) => [...c.querySelectorAll('button[aria-expanded]')]);
  return {
    buttons: buttons.length,
    expanded: buttons.map((b) => b.getAttribute('aria-expanded')),
    allOpen: buttons.length > 0 && buttons.every((b) => b.getAttribute('aria-expanded') === 'true'),
  };
})()`;

/**
 * THE SHAPE OF ONE WHOLE PROSE BLOCK, found by its own testid.
 *
 * ⚠ WHY NOT `PAINTED_LEAF`. That one finds the deepest node carrying a NEEDLE,
 * which is the right subject for "are these words on screen" and the wrong one
 * for "does this block fit in its box": a block split into a diagnosis, a
 * disclosure button and a remedy has no single leaf holding all of it, so a leaf
 * measurement would report one paragraph of a block and call it the block. Row
 * [5b2] asks about the BLOCK, so it measures the advisory root — the node
 * `Advisory` puts its testid on, for the reason its own prop comment gives.
 *
 * `found` is reported rather than assumed. A block that is not on the page has
 * no height and would satisfy every containment test ever written, so the row
 * that uses this gates on `found === 1` and the words are [5b]'s to prove.
 */
const BLOCK_SHAPE = (testid) => String.raw`
(() => {
  const nodes = [...document.querySelectorAll(${JSON.stringify(`[data-testid="${testid}"]`)})];
  if (nodes.length !== 1) return { found: nodes.length };
  const el = nodes[0];
  el.scrollIntoView({ block: 'center' });
  let sc = el.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
  const b = el.getBoundingClientRect();
  const cb = sc ? sc.getBoundingClientRect() : null;
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    found: 1, text: (el.innerText || '').trim(),
    rect: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
    scroller: cb ? { top: Math.round(cb.top), bottom: Math.round(cb.bottom) } : null,
    insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
    tallerThanScroller: !!(cb && (b.bottom - b.top) > (cb.bottom - cb.top)),
    hitInside: !!(hit && (hit === el || el.contains(hit) || hit.contains(el))),
  };
})()`;

async function main() {
  const t0 = Date.now();
  console.log('=== row-remap-control harness ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log(`    contract    : plane_y ${PLANE_Y.minimum}..${PLANE_Y.maximum}; `
    + `height_shift admits {${SHIFTS.join(', ')}} = `
    + `${SHIFTS.map((s) => `${s}→${linesFor(s)}ln`).join(' ')}; `
    + `reserved ${JSON.stringify(RESERVED)}; builds today: ${BUILDABLE}`
    + ' — ALL READ FROM THE VENDORED SCHEMA IN THIS PROCESS');
  console.log(`    ceiling     : ${CEILING_ENFORCEMENTS} — this schema, and `
    + `${OTHER_ENFORCER.actor}'s ${OTHER_ENFORCER.qualifier} guard `
    + `("${OTHER_ENFORCER.clause}"). Row [5b] requires the app to say so.`);
  console.log(`    refusals    : anchor "${GENERATOR_REFUSALS.anchor}"; `
    + `single "${GENERATOR_REFUSALS.single}" — rows [6a]/[6b] require these words, not a `
    + 'paraphrase, behind the "Why this happens" disclosure they were folded into.');
  if (UNBUILDABLE === undefined) {
    // NOT A DEFECT AND NOT A PASS. Through empyrean 60d9f6a `height_shift` was a
    // 3..7 range of which four rungs were legal and unbuildable, so [4a] had a
    // value to pick that the app should still write and [4b] had a warning to
    // find painted. At 2e5046e the key is `enum [4]`: the enum IS the buildable
    // set, so that population is EMPTY BY CONSTRUCTION. Rows [4a] and [4b]
    // measure nothing and must not be rendered as green — that is the whole
    // "loud on unmeasurable" rule this file is built on. They return the moment
    // the contract admits a second rung.
    console.log(`\n  ⚠ [4a] NOT RUN, NOT PASSED ([4b] runs its retirement arm instead): `
      + `the contract admits `
      + `{${SHIFTS.join(', ')}} and names `
      + `${BUILDABLE === null ? 'no shift as the one that builds' : `${BUILDABLE} as buildable`}, `
      + 'so there is NO legal-but-unbuildable shift to pick. The unit row [4a] has an empty '
      + 'population and measures nothing in this run; [4b] runs as [4b-retired] instead, which '
      + 'asserts the warning is painted for nobody.\n');
  }

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
    const layerN = async (n) => (await scene())?.layers?.[n] ?? null;
    const boxText = async (n) => c.json(String.raw`(() => {
      const el = ${RR_BOX(n)};
      return el ? { shown: el.value } : { shown: null };
    })()`);

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
    check('1b', `aeon's own ${SCENE_ID}.json is loaded — a real scene to author into`,
      scenes.some((s) => s.id === SCENE_ID),
      `${scenes.length} scene(s): ${JSON.stringify(scenes)}`);
    if (!scenes.some((s) => s.id === SCENE_ID)) {
      throw new Error(`${SCENE_ID} absent — every row below would be vacuous`);
    }
    check('1c', 'the Effects facet mounts',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1400);

    // ═══ SELECT AFTER THE PANEL MOUNTS, AND THEN ASSERT IT TOOK ═══
    //
    // THE SELECTION IS NOT THIS HARNESS'S TO KEEP. `EffectsScenePanel` carries a
    // "the selection follows the active section" effect (aurora `4b9b3f6a`, cold
    // read C2 — the owner called the old behaviour the most disorienting thing on
    // the tab): on mount it calls `setSelectedEffectsSceneId(sceneSelectionFollow(
    // library, section))`, which for section 0 of this project is
    // `ojz_act1_start`. A `selectScene` issued BEFORE the mount is therefore
    // OVERWRITTEN by the app, correctly and by design.
    //
    // ⚠ AND THE OVERWRITE IS SILENT, which is what actually cost the rows below.
    // With the call in its old place the panel painted `ojz_act1_start`'s cards
    // while every row here read `ojz_act1_depth` out of `scenesJson()`. The
    // WIDGET rows ([2b], [3b], [4c], [7b]) went on passing — they read the DOM,
    // and the DOM was a real, correct row-remap control, just for another
    // document — while the six DOCUMENT rows ([3a], [3a2], [4a], [5a], [5c],
    // [6c]) read a scene nothing had touched. MEASURED 2026-09-06: the write
    // landed on `ojz_act1_start` layer 3 as `{plane_y: 112, height_shift: 4}`
    // while this file asserted about `ojz_act1_depth` layer 3 and found nothing.
    //
    // So the fix is the ORDER, and [1c2] is the gate that makes a future
    // overwrite impossible to miss: the precondition every row below rests on is
    // now ASSERTED, in the app's own words, instead of assumed.
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);
    await sleep(900);
    const selectedNow = await c.json('window.__dbg.aeon.selectedScene()');
    check('1c2', 'and the panel is EDITING the scene every row below asserts against',
      selectedNow === SCENE_ID,
      `selectedScene() = ${JSON.stringify(selectedNow)}, wanted ${JSON.stringify(SCENE_ID)}. `
      + 'The panel follows the active section\'s sceneRef on mount (aurora 4b9b3f6a), so a '
      + 'selection made before the mount is overwritten; every document row below would then '
      + 'read a scene nothing on screen is editing.');
    if (selectedNow !== SCENE_ID) {
      throw new Error(`the panel is editing ${selectedNow}, not ${SCENE_ID} — `
        + 'every document row below would be vacuous');
    }

    const opened = await c.evalExpr(OPEN_SECTION(String.raw`/^Layers \(/`, RR_SELECT(0)));
    await sleep(900);

    // WHICH STRIPS. One that already has a CURVE (so "nothing to vary" is
    // satisfied and does not mask the anchor sentence) and one that has none
    // (so [6c] is a discriminating pair). Chosen FROM THE DOCUMENT, not typed.
    const doc0 = await scene();
    const CURVED = doc0.layers.findIndex((l) => l.curve !== undefined && l.curve !== 'none');
    const PLAIN = doc0.layers.findIndex((l) => l.curve === undefined || l.curve === 'none');
    check('1d', 'the scene offers one strip WITH a curve and one WITHOUT — the pair [6c] needs',
      CURVED >= 0 && PLAIN >= 0 && CURVED !== PLAIN,
      `curved strip = ${CURVED}, plain strip = ${PLAIN}; `
      + `curves = ${JSON.stringify(doc0.layers.map((l) => l.curve ?? null))}`);
    if (CURVED < 0 || PLAIN < 0) throw new Error('no such pair in this scene');

    // ---- 2. THE ROW EXISTS AND NOTHING IS REMAPPED YET --------------------
    check('2a', 'ANTI-VACUOUS: NO strip carries a rowRemap before anything is touched',
      doc0.layers.every((l) => l.rowRemap === undefined || l.rowRemap === 'none'),
      `rowRemap per strip = ${JSON.stringify(doc0.layers.map((l) => l.rowRemap ?? null))}`);
    check('2a2', 'and the scene declares NO anchor — so the anchor precondition is live here',
      doc0.anchor === undefined || doc0.anchor === 'none',
      `anchor = ${JSON.stringify(doc0.anchor ?? null)}, `
      + `deform_bg = ${JSON.stringify(doc0.deform_bg ?? null)}`);

    const sel = await c.json(String.raw`(() => {
      const el = ${RR_SELECT(CURVED)};
      if (!el) return { found: false,
        titles: [...document.querySelectorAll('select')].map((s) => (s.title || '').slice(0, 44)) };
      el.scrollIntoView({ block: 'center' });
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      const b = el.getBoundingClientRect();
      const cb = sc ? sc.getBoundingClientRect() : null;
      const hit = document.elementFromPoint(
        Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
      return {
        found: true, value: el.value,
        options: [...el.options].map((o) => o.value + '=' + o.text),
        title: (el.title || '').slice(0, 140),
        insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
        hitIsSelect: hit === el,
        visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
        rects: el.getClientRects().length,
      };
    })()`);
    check('2b', 'the ROW REMAP row is on the layer card, painted inside its scroller, hit-testable',
      sel.found === true && sel.insideScroller === true && sel.hitIsSelect === true
      && sel.value === 'none' && sel.options.length === 2,
      JSON.stringify(sel) + (sel.found ? '' : ` (Layers section → ${opened})`));
    if (sel.found !== true) throw new Error('the row-remap select was not found');

    check('2c', 'no plane box and no height picker while the row says none',
      (await c.json(`!!${RR_BOX(CURVED)}`)) === false
      && (await c.json(`!!${RR_HEIGHT(CURVED)}`)) === false);

    check('2d', `neither reserved name (${RESERVED.join(', ')}) is offered anywhere on the card`,
      (await c.json(String.raw`(() => {
        const titles = [...document.querySelectorAll('select,input')]
          .map((e) => (e.title || ''));
        return ${JSON.stringify(RESERVED)}
          .filter((k) => titles.some((t) => t.includes('rowRemap.' + k)));
      })()`)).length === 0);

    // ---- 3. TURNING IT ON SEEDS A LEGAL PAYLOAD ---------------------------
    await setSelect(RR_SELECT(CURVED), 'ladder');
    await sleep(800);
    const seeded = (await layerN(CURVED))?.rowRemap;
    // ⚠ `plane_y` IS A RANGE AND `height_shift` IS A SET, AND THIS ROW MUST NOT
    // TREAT THEM ALIKE. `HEIGHT.minimum`/`HEIGHT.maximum` are what this row used
    // to read, and under `enum [4]` that node carries NEITHER — so the test was
    // `4 >= undefined && 4 <= undefined`, FALSE for a perfectly legal payload,
    // and the message printed "height_shift undefined..undefined" while pointing
    // at the app. Membership is `SHIFTS.includes(...)`, the same rule
    // `scene-ui.ts` states for its own bounds constant ("Nothing may test
    // membership through this constant"), and it survives a SPARSE enum such as
    // `[4, 7]` that a min..max pair would wrongly widen to admit 5 and 6.
    check('3a', 'switching the row on writes a payload legal on BOTH fields',
      seeded && Number.isInteger(seeded.plane_y) && Number.isInteger(seeded.height_shift)
      && seeded.plane_y >= PLANE_Y.minimum && seeded.plane_y <= PLANE_Y.maximum
      && SHIFTS.includes(seeded.height_shift),
      `strip ${CURVED} rowRemap = ${JSON.stringify(seeded)}; contract plane_y `
      + `${PLANE_Y.minimum}..${PLANE_Y.maximum}, height_shift one of {${SHIFTS.join(', ')}}`);
    // ⚠ THIS ROW USED TO BE UNFAILABLE UNDER THE CONTRACT IT RUNS AGAINST TODAY.
    // It read `BUILDABLE === null || seeded?.height_shift === BUILDABLE`, and
    // `BUILDABLE` has read null since empyrean 2e5046e retired the "TODAY ONLY n
    // BUILDS" clause — so the whole row short-circuited TRUE before looking at
    // the seed at all, and printed "seeded shift undefined" while PASSING. A row
    // that goes green when its subject is `undefined` is not a weak gate, it is
    // an anti-gate: it stood beside [3a]'s red saying the seed was fine.
    //
    // The clause retiring is not the same event as the SEED going wrong, so the
    // row is now two claims: the seed is ALWAYS a shift the contract admits
    // (checkable under every contract this key has ever had, and the half that
    // catches a `?? BOUNDS.min` fallback degrading to `undefined`), and WHERE the
    // contract still names a buildable shift, it is that one.
    check('3a2', 'and the seed is a shift the contract ADMITS — and, where the contract still '
      + 'names one, the shift that BUILDS',
      SHIFTS.includes(seeded?.height_shift)
      && (BUILDABLE === null || seeded.height_shift === BUILDABLE),
      `seeded shift ${JSON.stringify(seeded?.height_shift)}; the contract admits `
      + `{${SHIFTS.join(', ')}} and `
      + (BUILDABLE === null
        ? 'names no shift as the one that builds, so only ADMISSION is asserted here'
        : `says ${BUILDABLE} builds today`));

    const picker = await c.json(String.raw`(() => {
      const el = ${RR_HEIGHT(CURVED)};
      if (!el) return { found: false };
      return { found: true, value: el.value,
        options: [...el.options].map((o) => ({ value: o.value, text: o.text })) };
    })()`);
    console.log('        the height picker as an author sees it:\n'
      + (picker.options ?? []).map((o) => `          ${o.value}  ${o.text}`).join('\n'));
    check('3b', 'the picker offers EVERY legal shift, labelled in LINES, valued by SHIFT',
      picker.found === true
      && picker.options.map((o) => Number(o.value)).join(',') === SHIFTS.join(',')
      && SHIFTS.every((s) => picker.options
        .find((o) => Number(o.value) === s).text.includes(String(linesFor(s)))),
      JSON.stringify(picker));
    check('3b2', 'and exactly one option is marked as the one that builds today',
      BUILDABLE === null
        ? picker.options.every((o) => !/builds/.test(o.text))
        : picker.options.filter((o) => /builds/.test(o.text)).length === 1
          && /builds/.test(picker.options.find((o) => Number(o.value) === BUILDABLE).text),
      JSON.stringify((picker.options ?? []).map((o) => o.text)));

    // ---- 4. THE UNIT — THE WHOLE PARCEL ----------------------------------
    //
    // Pick the option that READS as a line count and require the document to
    // hold the SHIFT. A wiring that wrote `o.lines` would be schema-legal for
    // nothing (a line count is outside 3..7) — but a wiring that wrote the
    // label's number for a picker labelled differently, or that wrote the
    // OPTION INDEX, lands a legal shift that is not the one picked. Both are
    // caught by asserting the exact value.
    if (UNBUILDABLE !== undefined) {
      const wantLines = linesFor(UNBUILDABLE);
      await setSelect(RR_HEIGHT(CURVED), UNBUILDABLE);
      await sleep(800);
      const afterPick = PLANT === 'lines-not-shift'
        ? { height_shift: wantLines }
        : (await layerN(CURVED))?.rowRemap;
      check('4a', `picking the "${wantLines} lines" option writes the SHIFT ${UNBUILDABLE}, not `
        + `${wantLines}`,
        afterPick?.height_shift === UNBUILDABLE,
        `document holds ${JSON.stringify(afterPick)}. A picker that exported the LINE COUNT `
        + `would hold ${wantLines}; the contract admits {${SHIFTS.join(', ')}}, so the wrong `
        + 'wiring can land a band four times too tall rather than a refusal');

      const notBuilt = await c.json(PAINTED_LEAF('does NOT BUILD', RR_HEIGHT(CURVED)));
      check('4b', 'and a PAINTED sentence says that shift does not build yet, and names what does',
        BUILDABLE === null
          ? notBuilt.leaf === false
          : notBuilt.leaf === true && notBuilt.insideScroller === true
            && notBuilt.hitInside === true && notBuilt.afterControl === true
            && notBuilt.text.includes(String(linesFor(BUILDABLE))),
        JSON.stringify(notBuilt));
    } else {
      // THE RETIREMENT, MEASURED ON SCREEN. [4a] has no value to pick, but the
      // claim that the buildability warning went quiet is checkable exactly
      // here: with the row on and the seed picked, no "does NOT BUILD" sentence
      // may be painted anywhere on it. This is the half of [4b] that survives an
      // empty population, and rendering the whole section as a skip would have
      // thrown it away.
      const noneBuilt = await c.json(PAINTED_LEAF('does NOT BUILD', RR_HEIGHT(CURVED)));
      check('4b-retired', 'the contract admits only buildable shifts, so NO "does NOT BUILD" '
        + 'sentence is painted on the row',
        noneBuilt.leaf === false, JSON.stringify(noneBuilt));
    }

    await setSelect(RR_HEIGHT(CURVED), BUILDABLE ?? SHIFTS[0]);
    await sleep(700);
    const cleared = await c.json(PAINTED_LEAF('does NOT BUILD', RR_HEIGHT(CURVED)));
    check('4c', 'and it CLEARS when the buildable shift is picked back',
      cleared.leaf === false, JSON.stringify(cleared));

    // ---- 5. THE PLANE LINE, WHOSE CEILING NOTHING ELSE ENFORCES -----------
    const held = (await layerN(CURVED))?.rowRemap?.plane_y;
    const over = String(PLANE_Y.maximum + 1);
    await clickAt(RR_BOX(CURVED));
    await sleep(250);
    await typeText(over);
    await sleep(800);
    const overBox = await boxText(CURVED);
    const afterOver = PLANT === 'widget'
      ? { plane_y: Number(overBox.shown) }
      : (await layerN(CURVED))?.rowRemap;
    // ⚠ WHAT THIS ROW ASSERTS, AND WHY IT IS NOT "the document is unchanged".
    // `NumberField` commits ON EVERY KEYSTROKE, so typing a three-digit number
    // walks the document through its PREFIXES: "5" and "51" are both legal
    // plane lines and both commit, and only "512" is withheld. MEASURED HERE on
    // the first run of this file — the document held 51. That is a real (and
    // PRE-EXISTING, shared with the drift and ramp boxes) wart, printed below
    // and booked, not swept up: it leaves the box SHOWING 512 while the document
    // holds 51.
    //
    // The property this row exists for is narrower and is the one that reaches
    // a ROM: THE OUT-OF-RANGE VALUE NEVER LANDS. That is what is gated. Writing
    // the row as "unchanged" would have been asserting something false about a
    // control that is behaving correctly on the axis that matters.
    const prefixCommitted = afterOver?.plane_y !== held;
    check('5a', `typing ${over} (one past the plane's last line) never REACHES the document`,
      overBox.shown === over
      && afterOver?.plane_y !== Number(over)
      && afterOver?.plane_y >= PLANE_Y.minimum && afterOver?.plane_y <= PLANE_Y.maximum,
      `box shows ${JSON.stringify(overBox.shown)} (the keys LANDED); document holds `
      + `${JSON.stringify(afterOver)} — never ${over}. This line USED TO SAY aeon would not `
      + `catch ${over} either; it would now — the contract lists ${CEILING_ENFORCEMENTS} of this `
      + `ceiling and the second is "${OTHER_ENFORCER.clause}". Aurora's is still the one an `
      + 'author meets, and the only one that acts before a build.'
      + (prefixCommitted
        ? `\n        ⚠ PREFIX COMMIT (pre-existing NumberField behaviour, not this row's `
          + `subject): the document moved ${held} -> ${afterOver?.plane_y} on the way, because `
          + `every prefix of "${over}" is itself a legal plane line and the field commits per `
          + 'keystroke. The box and the document now DISAGREE until the next commit.'
        : ''));

    // ⚠ THIS ROW WAS REWRITTEN, NOT RELAXED. It required the sentence to call
    // this bound the `ONLY ENFORCEMENT` of the ceiling. Aurora retired that claim
    // because it became FALSE (aeon d593070a landed an engine-side `< 512`
    // guard), so the row was demanding a falsehood in front of an author — the
    // one repair a red row must never get is the app being changed to satisfy it.
    // The expectation now states the TRUE fact, and both halves of it are read
    // out of the contract (see CEILING_ENFORCEMENTS / OTHER_ENFORCER): the count,
    // and the other enforcer's owner and where it lives. It is STRICTLY MORE than
    // the old row asked — the sentence must still carry the ceiling, and must now
    // also name the second enforcer, so an app that quietly drops the second
    // enforcer from the sentence reddens this row.
    //
    // ⚠ AND IT NOW LEARNS TO CLICK, FOR [6a]'S RULED REASON AND NOT TO BE
    // SATISFIED. The mechanism half of this refusal moved behind the same
    // "Why this happens" disclosure the preconditions use, because as ONE
    // paragraph the block did not fit its box — that is [5b2] below, and the
    // fix for it. So the pair is the same discriminating one [6a] runs:
    //
    //   (1) the DIAGNOSIS is painted under the control, unclicked, carrying the
    //       contract's own range;
    //   (2) the ENFORCEMENTS clause is NOT painted while the disclosure is shut
    //       — `hitInside`, never `leaf`: `innerText` on a `display:none` node
    //       falls back to `textContent`, so the folded sentence is findable by
    //       text while invisible;
    //   (3) after the click it IS painted, naming the other enforcer.
    //
    // Read together these cannot be satisfied by finding a container: (2) fails
    // if the clause was on screen all along, (3) fails if it never arrives, and
    // both needles are still DERIVED from the vendored contract.
    //
    // ⚠ EVERY SHUT MEASUREMENT IS TAKEN BEFORE THE CLICK, INCLUDING [5b2]'S,
    // which is printed after this row but measured above it. A block measured
    // after its own disclosure was opened is a different block.
    const overShape = await c.json(BLOCK_SHAPE(`layer-${CURVED}-rowremap-planey-refusal`));
    const overDiag = await c.json(
      PAINTED_LEAF(`${PLANE_Y.minimum}..${PLANE_Y.maximum}`, RR_BOX(CURVED)));
    const overShut = await c.json(PAINTED_LEAF(CEILING_ENFORCEMENTS, RR_BOX(CURVED), { ci: true }));
    const overClicked = await c.json(EXPAND_WHYS(CURVED, 'planey-refusal'));
    await sleep(350);
    const overOpened = { ...overClicked, ...(await c.json(WHY_STATE(CURVED, 'planey-refusal'))) };
    const overWhy = await c.json(PAINTED_LEAF(CEILING_ENFORCEMENTS, RR_BOX(CURVED), { ci: true }));
    const overWhyText = (overWhy.text ?? '').toLowerCase();
    check('5b', `and the PAINTED reason says this bound is ${CEILING_ENFORCEMENTS} of the ceiling, `
      + `naming ${OTHER_ENFORCER.actor}'s ${OTHER_ENFORCER.qualifier} guard as the other `
      + '— the range on screen, the enforcements behind the disclosure: shut, then open',
      overDiag.leaf === true && overDiag.centreInScroller === true
      && overDiag.hitInside === true && overDiag.afterControl === true
      && overShut.hitInside === false
      && overOpened.allOpen === true
      && overWhy.leaf === true && overWhy.centreInScroller === true && overWhy.hitInside === true
      && overWhy.afterControl === true
      && overWhyText.includes(OTHER_ENFORCER.actor.toLowerCase())
      && overWhyText.includes(OTHER_ENFORCER.qualifier.toLowerCase()),
      `(1) range on screen, unclicked: ${JSON.stringify(overDiag)}`
      + `\n        (2) enforcements SHUT (findable by text, NOT painted): ${JSON.stringify(overShut)}`
      + `\n        (3) disclosure: ${JSON.stringify(overOpened)}`
      + `\n            enforcements OPEN: ${JSON.stringify(overWhy)}`
      + '\n        wanted, ALL DERIVED FROM THE VENDORED CONTRACT: the range '
      + `${PLANE_Y.minimum}..${PLANE_Y.maximum} on screen, and behind the disclosure the phrase `
      + `"${CEILING_ENFORCEMENTS}" with the other enforcer named by owner `
      + `("${OTHER_ENFORCER.actor}") and place ("${OTHER_ENFORCER.qualifier}") — the contract's `
      + `own second member is "${OTHER_ENFORCER.clause}"`);

    // ⚠ THE OTHER HALF [5b] USED TO CARRY SILENTLY, NOW A ROW OF ITS OWN — AND
    // THE APP FINDING IT WAS LEFT RED FOR IS FIXED.
    //
    // Strict containment was one clause among five in [5b], so when this block
    // grew taller than its own box the row went red beside four green clauses
    // and read as "the sentence is wrong". It is not: the words are right (the
    // row above measures them). The BLOCK did not fit. Recorded once at
    // f872db04 as a rect 504..735 in a scroller 545..694 and never booked, then
    // measured again at 280px in a scroller 129px tall and booked as an app
    // change out of that parcel's scope.
    //
    // The bar is the app's OWN. `Advisory`'s docblock (EW-LAYER-CARD-SCROLLER)
    // rules that a prose block in a layer card taller than the section's floor —
    // floor minus header, the smallest box the shell may ever give it — is
    // "a paragraph no scroll position shows whole", and converted the two blocks
    // it measured for it. This one was not a standing block so a static census
    // could not have seen it: it is composed at refusal time by `NumberField`,
    // which appends the ALREADY-MOVED warning to the provider's refusal — and
    // EVERY refusal here carries that tail, because every prefix of a number past
    // the ceiling is itself a legal plane line and commits on the way.
    //
    // ⚠ THE SUBJECT IS THE BLOCK, SO THE MEASUREMENT IS THE BLOCK'S OWN ROOT and
    // not a leaf inside it: split across a diagnosis, a disclosure button and a
    // remedy, no single leaf holds the whole advisory, and a leaf reading would
    // report one paragraph and call it the block. `found === 1` is a gate and not
    // a note — an advisory that is not on the page fits every box there is.
    check('5b2', 'and that reason FITS IN THE BOX it is painted in',
      overShape.found === 1
      && overShape.insideScroller === true && overShape.tallerThanScroller === false,
      (overShape.found !== 1
        ? `NO BLOCK: ${overShape.found} node(s) carry the advisory's testid, so this row is `
          + 'reporting its own absence and not its subject. The advisory is only mounted while a '
          + 'value stands refused; read [5a] and [5b] first, because a block that is not there '
          + 'fits every box there is.'
        : `block ${overShape.rect.bottom - overShape.rect.top}px in a scroller `
          + `${overShape.scroller ? overShape.scroller.bottom - overShape.scroller.top : '?'}px `
          + `tall (${JSON.stringify(overShape.rect)} vs ${JSON.stringify(overShape.scroller)}), `
          + `measured SHUT. This says NOTHING about the sentence's words — [5b] is the row that `
          + 'measures those, and this one is about the BLOCK against the smallest box the shell '
          + 'may give it. That is the bar Advisory\'s own docblock sets '
          + `(EW-LAYER-CARD-SCROLLER).\n        text, shut: ${JSON.stringify(overShape.text)}`));

    // ANTI-VACUOUS FLOOR: without this every refusal row above is satisfied by
    // a box that accepts nothing at all.
    const legalY = Math.min(PLANE_Y.maximum, 200);
    await clickAt(RR_BOX(CURVED));
    await sleep(250);
    await typeText(String(legalY));
    await sleep(800);
    const afterLegal = (await layerN(CURVED))?.rowRemap;
    check('5c', 'ANTI-VACUOUS FLOOR: a LEGAL plane line typed the same way DOES reach the document',
      afterLegal?.plane_y === legalY,
      `typed ${legalY} → ${JSON.stringify(afterLegal)}; was ${held}. This also measures `
      + 'SELECT-ON-FOCUS: without it the digits would append to what the box held');

    // ---- 6. THE THREE PRECONDITIONS, ON SCREEN ---------------------------
    // ⚠ ONE ROW, THREE MEASUREMENTS, READ AS A DISCRIMINATING PAIR ACROSS A
    // CLICK. `73fc44bf` split each precondition into a DIAGNOSIS that is always
    // on screen and a MECHANISM — the contract's verbatim clause — behind a
    // collapsed "Why this happens". This row was written before that and read
    // only the visible half, so it asked for the contract's words where the
    // contract's words no longer are. RULED HOUSE STYLE (packet §2): the
    // precondition an author must act on is painted with nothing clicked, which
    // is measurement (1) below and is the half that must NEVER move behind a
    // disclosure. So the row learns to click — and proves the click did it:
    //
    //   (1) the DIAGNOSIS is painted under the control, unclicked;
    //   (2) the CONTRACT'S CLAUSE is NOT painted while the disclosure is shut —
    //       ⚠ and this is exactly why the gate is `hitInside`, not `leaf`.
    //       `innerText` on a `display:none` node FALLS BACK TO textContent per
    //       spec, so the folded sentence IS findable by text while invisible.
    //       The rect-against-scroller and elementFromPoint pair is what tells
    //       the two apart, which is what `Advisory`'s own docblock demands;
    //   (3) after the click it IS painted, in the contract's words.
    //
    // Read together these cannot be satisfied by finding the container: (2)
    // fails if the sentence was already on screen, (3) fails if it never
    // arrives, and both quote the clause DERIVED from the vendored schema.
    const anchorWhy = await c.json(PAINTED_LEAF('declares no anchor', RR_SELECT(CURVED)));
    const anchorQuoteShut = await c.json(
      PAINTED_LEAF(GENERATOR_REFUSALS.anchor, RR_SELECT(CURVED)));
    const clickedCurved = await c.json(EXPAND_WHYS(CURVED));
    await sleep(350);
    const openedCurved = { ...clickedCurved, ...(await c.json(WHY_STATE(CURVED))) };
    const anchorQuote = await c.json(PAINTED_LEAF(GENERATOR_REFUSALS.anchor, RR_SELECT(CURVED)));
    check('6a', 'the NO-ANCHOR precondition is painted under the row unclicked, and the '
      + 'contract\'s own clause is behind its disclosure — shut, then open',
      anchorWhy.leaf === true && anchorWhy.insideScroller === true
      && anchorWhy.hitInside === true && anchorWhy.afterControl === true
      && anchorQuoteShut.hitInside === false
      && openedCurved.allOpen === true
      && anchorQuote.leaf === true && anchorQuote.insideScroller === true
      && anchorQuote.hitInside === true && anchorQuote.afterControl === true,
      `(1) diagnosis, unclicked: ${JSON.stringify(anchorWhy)}`
      + `\n        (2) clause SHUT (findable by text, NOT painted): ${JSON.stringify(anchorQuoteShut)}`
      + `\n        (3) disclosure: ${JSON.stringify(openedCurved)}`
      + `\n            clause OPEN: ${JSON.stringify(anchorQuote)}`
      + `\n        the clause, derived from the vendored contract: "${GENERATOR_REFUSALS.anchor}"`);

    // Turn a SECOND strip on: both cards must now say so, and each must name the
    // OTHER strip's index rather than its own.
    await setSelect(RR_SELECT(PLAIN), 'ladder');
    await sleep(900);
    // Turning the second strip on adds a NEW advisory to the curved card, which
    // mounts collapsed like any other — so both cards are read shut, then opened
    // again here rather than relying on [6a]'s click.
    const shutCurved = await c.json(PRECONDITIONS(CURVED));
    const shutPlain = await c.json(PRECONDITIONS(PLAIN));
    const clickedC = await c.json(EXPAND_WHYS(CURVED));
    const clickedP = await c.json(EXPAND_WHYS(PLAIN));
    await sleep(350);
    const openedC = { ...clickedC, ...(await c.json(WHY_STATE(CURVED))) };
    const openedP = { ...clickedP, ...(await c.json(WHY_STATE(PLAIN))) };
    const onCurved = await c.json(PRECONDITIONS(CURVED));
    const onPlain = await c.json(PRECONDITIONS(PLAIN));
    console.log(`        strip ${CURVED} says:\n${onCurved.map((t) => '          ' + t).join('\n')}`);
    console.log(`        strip ${PLAIN} says:\n${onPlain.map((t) => '          ' + t).join('\n')}`);
    // Same shape as [6a], on the clause the OTHER strip's existence raises. The
    // shut half is what stops this from becoming "the row found a disclosure":
    // the clause must be absent from the laid-out text before the click and
    // present after it, and the node carrying it must name the OTHER strip's
    // index — the fact only this surface can state, and the one the contract
    // cannot. `PRECONDITIONS` reads `innerText` on a RENDERED node, so a folded
    // paragraph is excluded from both reads; see its docblock.
    const namesOther = (texts, other) => texts.some(
      (t) => t.includes(GENERATOR_REFUSALS.single) && t.includes(String(other)));
    check('6b', 'a SECOND remapped strip is reported on BOTH cards, each naming the other — the '
      + 'strip in the diagnosis, the contract\'s clause behind the disclosure',
      !shutCurved.some((t) => t.includes(GENERATOR_REFUSALS.single))
      && !shutPlain.some((t) => t.includes(GENERATOR_REFUSALS.single))
      && openedC.allOpen === true && openedP.allOpen === true
      && namesOther(onCurved, PLAIN) && namesOther(onPlain, CURVED),
      `SHUT, the clause is not laid out: ${JSON.stringify({ shutCurved, shutPlain })}`
      + `\n        disclosures: ${JSON.stringify({ curved: openedC, plain: openedP })}`
      + `\n        OPEN: ${JSON.stringify({ onCurved, onPlain })}`
      + `\n        the clause, derived from the vendored contract: "${GENERATOR_REFUSALS.single}"`);

    // THE DISCRIMINATING PAIR. "Nothing to vary" must appear on the strip with
    // no curve and must NOT appear on the strip that has one — read together, so
    // a warning that fired for every strip cannot pass.
    check('6c', 'NOTHING-TO-VARY appears on the strip with no curve and NOT on the one with a '
      + 'curve — read in the same pass',
      onPlain.some((t) => /nothing for the remap to vary/.test(t))
      && !onCurved.some((t) => /nothing for the remap to vary/.test(t)),
      JSON.stringify({ plain: onPlain.length, curved: onCurved.length }));

    const capNote = await c.json(PAINTED_LEAF('CAP_ROW_REMAP', RR_SELECT(CURVED)));
    check('6d', 'and the ONE condition Aurora cannot check is named rather than left silent',
      capNote.leaf === true && capNote.insideScroller === true && capNote.hitInside === true,
      JSON.stringify(capNote));

    // ---- 7. BACK TO NONE CLEARS THE KEY ----------------------------------
    await setSelect(RR_SELECT(PLAIN), 'none');
    await sleep(700);
    const off = await layerN(PLAIN);
    check('7a', 'switching back to none CLEARS the key — absent, never a written "none"',
      off !== null && off.rowRemap === undefined,
      `strip ${PLAIN} = ${JSON.stringify(off)}`);
    check('7b', 'and its plane box and height picker go away with it',
      (await c.json(`!!${RR_BOX(PLAIN)}`)) === false
      && (await c.json(`!!${RR_HEIGHT(PLAIN)}`)) === false);

    // A shot with the row ON, the preconditions painted, and an unbuildable shift
    // picked WHERE ONE EXISTS — what the owner has not seen. Under a contract
    // whose admitted set is exactly its buildable set there is no such shift, so
    // the shot frames the buildable one rather than sending `undefined` into the
    // picker and photographing whatever that leaves behind.
    await setSelect(RR_HEIGHT(CURVED), UNBUILDABLE ?? BUILDABLE ?? SHIFTS[0]);
    await sleep(800);
    const framed = await c.json(String.raw`(() => {
      const el = ${RR_SELECT(CURVED)};
      if (!el) return null;
      let sc = el.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1)) sc = sc.parentElement;
      if (!sc) return { scrolled: false };
      const b = el.getBoundingClientRect(), cb = sc.getBoundingClientRect();
      sc.scrollTop += (b.top - cb.top) - 8;
      return { scrolled: true, scrollTop: Math.round(sc.scrollTop),
               scrollerHeight: Math.round(sc.clientHeight) };
    })()`);
    await sleep(400);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/row-remap-control.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshot  : ${SHOTS}/row-remap-control.png  (${JSON.stringify(framed)})`);
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
  console.log('NOT MEASURED HERE: that a band visibly compresses toward a surface. That needs a '
    + 'built ROM in an emulator, and aeon\'s generator half (9b) does not exist yet, so no ROM '
    + 'can be built through the document path at all. Foreground lane\'s to take.');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
