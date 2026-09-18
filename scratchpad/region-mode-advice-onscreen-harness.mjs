// ═══════════════════════════════════════════════════════════════════════════
// region-mode-advice-onscreen — ARE THE FOUR REGION-MODE SENTENCES PAINTED?
// ═══════════════════════════════════════════════════════════════════════════
//
// ── THE SUBJECT ───────────────────────────────────────────────────────────
//
// A parcel landed 2026-09-18 fixing four notes in the Effects tab that still
// told an author sections bind scenes on an act where REGIONS do:
//
//     docs/reviews/2026-09-18-scene-relation-region-mode-rest.md
//
// Its own "On-screen checks for the overseer" section says, in as many words,
// "Not run here: this lane does not drive the app. All four are pure string
// functions and the node suite can reach every arm, but only a real screen can
// say they are PAINTED." This file is that screen, for its five checks:
//
//   1. Effects > Parallax, LAYERS: the line reads "(per scene; scenes are
//      bound on region rows)" and its HOVER says "a region can bind its own
//      scene".
//   2. A scene with a `reels` key: NO binding warning on the scene a region
//      binds, and the REGION-worded warning on a scene no region binds.
//   3. A scene carrying `v_deform`: NO SECTION is named in the V-deform
//      sentence.
//   4. The Editing select on an act slot with no section: the SECTION
//      ASSIGNMENT hint leads with the region-mode sentence.
//   5. CONTROL, a section-mode act: all four sentences are the ones that
//      shipped.
//
// ── ⚠ THREE OF THE FIVE DO NOT SURVIVE CONTACT WITH THE FIXTURE ───────────
//
// Read the rows, not this list, but the run reports all three loudly:
//
//   • CHECK 5 IS UNMEASURABLE. The live aeon checkout has exactly ONE act
//     (`games/sonic4/data/levels/ojz/act1`) and it carries a regions.json, so
//     there is NO section-mode act to control against. A missing control is
//     "did not run", never a finding, and nothing is substituted for it: [c5]
//     is reported UNMEASURABLE and counted apart from the passes. The
//     mode-dependence evidence that check 5 was reaching for is supplied
//     instead by the RED-FIRST MUTATIONS in the packet beside this file, which
//     flip each region arm to its section wording and watch the rows go red.
//
//   • CHECK 4's PRECONDITION DOES NOT EXIST ON THIS ACT. OJZ act 1 has nine
//     sections, 0..8, and NONE of them is empty — the Editing select offers
//     "Section 0".."Section 8" with no "(empty)" option, measured by [c4a].
//     There is therefore no act slot an author can move that select to that
//     reaches `sectionAssignmentEmptyHint` at all. [c4b] reaches the state the
//     only way left — `__dbg.aeon.setActiveSection(9)`, one past the last
//     section, which is `act.sections[9] === undefined` and so the same branch
//     — and SAYS SO in the row. It is a real paint of the real provider on the
//     real panel; it is NOT a gesture an author can make on this act.
//
//   • CHECK 3 IS VACUOUS ON THE SHIPPED regions.json, and [c3a] is the row
//     that says so rather than the row that passes quietly. `sec4` binds
//     `ojz_act1_depth` and carries NO `rasterRef`; no region in the file
//     carries both refs (which is exactly what the packet's `[c10]` derives
//     from the same file). So with `v_deform` on there is NO V-DEFORM SENTENCE
//     AT ALL — and there was none before the fix either, because every section
//     sidecar `rasterRef` is null too. "No section is named" is true of an
//     empty panel, of a crashed renderer and of this. [c3b] is the row with a
//     subject: one region is given a `rasterRef` IN THE SESSION (through
//     `__dbg.aeon.setRegions`, the real codec and the real command, never
//     disk), and the sentence that then appears must name a REGION and must
//     not contain the word "Section".
//
// ── WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING ────────────
//
//   • THE PANEL RENDERED NOTHING. Three of the four checks are ABSENCE-shaped
//     ("no warning", "no section named", "no longer implies"), and an absent
//     sentence is what a blank panel, an unopened project, a crashed renderer
//     and a wrong selection all produce. EVERY absence row here carries a
//     POSITIVE CONTROL IN THE SAME READ: the panel had its subject, the right
//     document is selected, and the sentence expected INSTEAD is painted.
//       - [c2a] (no warning on the bound scene) reads, in the same evaluation,
//         that the Reels select says "on", that the always-on unit hint and the
//         debug note are painted, and that `[data-testid="reels-binding-
//         advisory"]` appears for the OTHER scene in [c2b] of the same run.
//       - [c3b] is not an absence at all: the sentence must be PAINTED, exact,
//         and must name `Region <id>`. The absence half ("Section" absent) is
//         asserted only about a string that is definitely on screen.
//       - [c4b] asserts the region sentence is painted and that the shipped
//         section-mode sentence is NOT, and [c4c] shows the same panel one
//         slot over painting the binding control instead of any hint.
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. Hidden text is still in
//     `textContent`. Every on-screen claim asserts `checkVisibility()`, a
//     non-empty `getClientRects()` and a STRICT `elementFromPoint` hit at the
//     leaf's own centre (`hit === leaf || leaf.contains(hit)`; an ancestor
//     catching the point is NOT a pass).
//   • A SENTENCE INSIDE A COLLAPSED SECTION IS NOT IN THE DOM AT ALL.
//     `ui/CollapsibleSection.tsx` renders `{!collapsed && children}`, and
//     `aeon.effects.scene` — which holds checks 2 and 3 — is
//     `defaultCollapsed`. A row asking `checkVisibility()` of it would throw on
//     a null and read as a harness bug. So every sentence is measured TWICE:
//     `domNodes` (elements whose *textContent*, hidden text included, holds it;
//     0 means not even in the document) AND the painted-leaf report. [dis]
//     prints the arrival state of all three sections before anything is opened.
//   • ⚠ CHECK 1's HOVER IS A `title` ATTRIBUTE AND HAS NO CLIENT RECTS OF ITS
//     OWN. [c1b] does NOT dress that up as a visibility assertion. It reads the
//     attribute OFF THE SAME `<span>` element that [c1a] proved painted,
//     hit-tested and carrying the count line, and the row says that is what it
//     did. A browser tooltip cannot be provoked or measured from CDP.
//   • THE HARNESS TYPED THE SENTENCE IT WANTED TO SEE. Every expected sentence
//     is composed here (the derivations are templates with interpolations;
//     there is nothing in `src/` to read whole), so rows [d1]-[d4] are the
//     anti-drift gate: the provider's own string literals, SLICED OUT OF `src/`
//     at run time, must be substrings of what this file expects. A reword in
//     `src/` reds [d1]-[d4] instead of silently agreeing with a stale copy.
//   • A DIFFERENT CONTROL WAS DRIVEN. Every control is found by its accessible
//     label, its `title` (the app's own prose constant, read from source), or
//     the app's `data-section` / `data-effects-sub-tab` / `data-testid` routing
//     keys — never "the third element in the column". Ambiguity THROWS
//     (`lib/strict-aim.mjs`); it does not pick the first hit.
//   • THE FIXTURE MOVED. The project is the LIVE aeon checkout, which another
//     lane edits. [fx] prints the resolved path and the md5 of
//     `games/sonic4/data/editor/ojz/act1/regions.json` beside this repo's
//     vendored copy, and EVERY id below is derived from the live file at run
//     time. A mismatch is printed loudly and the run CARRIES ON, because the
//     rows measure the app either way.
//
// ── RED-FIRST: WHICH ROWS DISCRIMINATE, MEASURED RATHER THAN ASSERTED ─────
//
// Five narrow mutations, each applied to the committed baseline, REBUILT (the
// harness drives `dist/`, so an unrebuilt mutation measures the unmutated app
// and prints a false green), run, then restored with `git show HEAD:<path> >
// <path>` and re-checked clean with `git status --porcelain`. Baseline and
// restored baseline both: 29/29, 0 failed, 1 UNMEASURABLE.
//
//   m1  layerCountLine's region arm → the section clause      [d1] [c1a] [c1a2] [c1b]
//   m2  layerCountTitle's region arm → the section hover      [d1] [c1b] [c1b2]
//   m3  reelsBindingAdvisories' mode predicate → `if (false…` [c2a] [c2b] [c2b2]
//   m4  vDeformRampAdvisory's mode predicate → `if (false…`   [c3b]
//   m5  sectionAssignmentEmptyHint's mode test → `if (true)`  [c4b]
//
// ⚠ [c1b] IS NOT INDEPENDENT OF [c1a] AND SAYS SO. Its claim is "the PAINTED
// element carries the attribute", so it requires the painted element and m1
// reds it too. m2 is the mutation that separates them: it reds [c1b]/[c1b2]
// and leaves [c1a] green.
//
// ⚠ AND [c3a], [c4a], [dis], [fx], [1a]-[1e], [2a0], [c2b0], [c2b1], [c3a0],
// [c3b0] PASS REGARDLESS. They are instrument checks and fixture statements,
// not evidence for the fix. [c3a] in particular WOULD PASS ON
// MASTER-BEFORE-THE-FIX, and its own detail line says so.
//
// m3's red is worth reading rather than counting: the section arm puts the
// section-worded warning ON SCREEN on `ojz_act1_depth`, the document region
// sec4 binds at rung 1 and the one aeon's generator ACCEPTS. That is the
// packet's "the warning fired hardest on the compliant document", photographed.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER.
// ⚠ NOTHING IS WRITTEN TO THE AEON TREE. No save is ever issued. The two
//   session-only mutations are stated in their own rows: a scene created
//   through the panel's "Scene id" + New control ([c2b]), and one region given
//   a `rasterRef` through `__dbg.aeon.setRegions` ([c3b]), whose docblock says
//   it "does not touch disk, in either direction". Both are made after every
//   row that depends on the shipped state has already been measured.
//
// CLEANUP IS BY PID — `spawnGuarded` + `killTree`, awaited.
//
// ── RUN ───────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build       # or there is no window.__dbg
//   ELECTRON_BIN=<main aurora checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:region-mode-advice-onscreen
//
// FROM A LINKED WORKTREE you need BOTH env vars or you silently measure the
// MAIN checkout's `dist/`. The run PRINTS which tree answered — read it.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';
import { aimOne, showSubTabOrThrow, openSectionOrThrow } from './lib/strict-aim.mjs';
import { SECTION_COLLAPSED_ATTR } from './lib/effects-sections.mjs';

const PORT = Number(process.env.PORT ?? 9631);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-region-mode-advice`;
mkdirSync(SHOTS, { recursive: true });

/** The act the packet names. The only act in this project, and it is region mode. */
const REGIONS_REL = 'games/sonic4/data/editor/ojz/act1/regions.json';
/** This repo's committed copy of aeon's shared golden (provenance beside it). */
const VENDORED = `${ROOT}/test/fixtures/regions/ojz_act1.regions.json`;

/** The scene created IN THE SESSION for the reels floor. Never saved. */
const BORN_SCENE = 'harness_unbound_reels_scene';

const SCENE_TAB = 'parallax';
const LAYERS_SECTION = 'aeon.effects.layers';
const SCENE_SECTION = 'aeon.effects.scene';
const ASSIGN_SECTION = 'aeon.effects.assign';
const SCENES_SECTION = 'aeon.effects.scenes';

const SCENE_PROVIDER = `${ROOT}/src/renderer/providers/effects-aeon.ts`;
const PRESET_PROVIDER = `${ROOT}/src/renderer/providers/effects-preset.ts`;
const SCENE_CODEC = `${ROOT}/src/core/formats/effects/scene.ts`;
const RAMP_MODULE = `${ROOT}/src/core/formats/effects/ramp-scroll-mode.ts`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

const results = [];
const fails = [];
const unmeasurable = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/**
 * A row that COULD NOT BE RUN. Counted apart from both passes and failures, on
 * the rule that a missing control is "did not run" and never a finding. It is
 * NOT a pass: the aggregate prints it separately and loudly.
 */
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ⚠⚠ ${why}`);
  unmeasurable.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ANTI-DRIFT GATE: the provider's own literals, sliced out of src/
// ═══════════════════════════════════════════════════════════════════════════
//
// Same instrument as `delete-refusal-onscreen-harness.mjs`, and it is anchored
// in the OWNING FUNCTION first for that file's recorded reason: a bare
// `indexOf` of a marker can wander into a neighbouring function's docblock and
// slice prose, which makes the gate unsatisfiable rather than strict.
const HOLE = '<<<INTERP>>>';

/** The source text of one declaration, from its opening line to `endMarker`. */
function sliceFrom(file, startMarker, endMarker, what) {
  const src = readFileSync(file, 'utf8');
  const a = src.indexOf(startMarker);
  if (a < 0) {
    throw new Error(`CANNOT MEASURE: ${file} no longer contains ${JSON.stringify(startMarker)} — `
      + `the anti-drift slice for ${what} is lost and the gate would pass vacuously.`);
  }
  const b = src.indexOf(endMarker, a + startMarker.length);
  if (b < 0) {
    throw new Error(`CANNOT MEASURE: ${JSON.stringify(endMarker)} does not follow `
      + `${JSON.stringify(startMarker)} in ${file} — the anti-drift slice for ${what} is lost.`);
  }
  return src.slice(a, b);
}

/**
 * Every string literal of a source slice, with `${...}` spans REMOVED rather
 * than extracted: a ternary interpolation carries BOTH arms, and keeping them
 * would demand the singular sentence contain the plural words too.
 *
 * 8 chars minimum: long enough that a fragment is a PHRASE rather than a word
 * like `binds` that appears everywhere.
 */
function literalsOf(slice) {
  const body = slice.replace(/\$\{[^{}]*\}/g, HOLE);
  const out = [];
  // ⚠ TEMPLATES FIRST, AND THEN REMOVED FROM THE BODY. Running the
  // single-quote matcher over text that still holds a backtick template makes
  // the APOSTROPHE in `aeon's generator` open a bogus quoted run that closes on
  // the next real literal's opening quote — which is how the first draft of [d2]
  // produced a 60-character "fragment" spanning a `+` and a newline and went red
  // against a panel that was painting the sentence correctly.
  let rest = body;
  for (const m of body.matchAll(/`([^`]*)`/g)) {
    out.push(...m[1].split(HOLE));
    rest = rest.replace(m[0], '\u0001');
  }
  for (const m of rest.matchAll(/'((?:[^'\\]|\\.)*)'/g)) out.push(m[1].replace(/\\'/g, "'"));
  return [...new Set(out.filter((s) => s.length >= 8))];
}

/**
 * One `export const NAME = '...' + '...' ;` value, read from source.
 *
 * ⚠ IT CONCATENATES. The first draft read only the FIRST quoted chunk, which
 * silently truncated `REELS_BINDING_ADVICE_TAIL` — a two-literal constant — and
 * made [c2b] fail against a panel that was painting the whole sentence
 * correctly. A gate that reads part of a constant is a gate that measures a
 * string nothing produces.
 */
function constString(file, name) {
  const src = readFileSync(file, 'utf8');
  const at = src.indexOf(`${name} =`);
  if (at < 0) throw new Error(`CANNOT MEASURE: ${name} is not declared in ${file}`);
  const end = src.indexOf(';', at);
  if (end < 0) throw new Error(`CANNOT MEASURE: ${name} has no terminating ; in ${file}`);
  const decl = src.slice(at + name.length + 2, end);
  const parts = [...decl.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  if (parts.length === 0) {
    throw new Error(`CANNOT MEASURE: ${name} is not a quoted string (or concatenation) in ${file}`);
  }
  return parts.join('');
}

// ═══════════════════════════════════════════════════════════════════════════
// IN-PAGE MEASUREMENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A SENTENCE, measured twice on purpose.
 *
 * `domNodes` counts elements whose **textContent** contains it — hidden text
 * included, and 0 means it is not in the document at all, which is what a
 * collapsed `CollapsibleSection` produces. That number is NEVER what "on
 * screen" is asserted on. The rest is the painted leaf: the innermost element
 * carrying the text, its boxes, `checkVisibility`, and a STRICT hit test at its
 * own centre.
 *
 * `titleAttr` is the leaf's own `title` (and its nearest ancestor's), reported
 * BECAUSE A HOVER HAS NO GEOMETRY. See [c1b]: reading it off an element already
 * proven painted is the honest form, and the row says so.
 */
const SENTENCE_REPORT = (needle) => String.raw`
(() => {
  const needle = ${JSON.stringify(needle)};
  const all = [...document.querySelectorAll('*')]
    .filter((e) => (e.textContent || '').includes(needle));
  const leaves = all.filter((e) =>
    ![...e.children].some((k) => (k.textContent || '').includes(needle)));
  const leaf = leaves[0] || null;
  if (!leaf) return { domNodes: all.length, leaf: false, leaves: 0 };
  leaf.scrollIntoView({ block: 'center' });
  const b = leaf.getBoundingClientRect();
  // THE HIT TEST IS ON A LINE BOX, NOT ON THE UNION BOX. A sentence in a 200px
  // column is an INLINE element wrapped over a dozen line boxes, and
  // getBoundingClientRect returns their UNION - a rectangle the element does not
  // paint, whose centre can legitimately land in the leading between two lines
  // and hit the parent. Testing the widest getClientRects() entry tests a point
  // the element really occupies; it is no weaker (the hit must still be the leaf
  // or inside it) and it stops a wrap from reading as an occlusion.
  const boxes = [...leaf.getClientRects()];
  const widest = boxes.length === 0 ? b
    : boxes.reduce((w, r) => (r.width * r.height > w.width * w.height ? r : w), boxes[0]);
  const hit = document.elementFromPoint(
    Math.round(widest.left + widest.width / 2), Math.round(widest.top + widest.height / 2));
  const text = (leaf.textContent || '').trim();
  const withTitle = leaf.closest('[title]');
  return {
    domNodes: all.length, leaf: true, leaves: leaves.length,
    exact: text === needle,
    text: text.slice(0, 500),
    rects: leaf.getClientRects().length,
    visible: typeof leaf.checkVisibility === 'function'
      ? leaf.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
    hitIsLeaf: !!(hit && (hit === leaf || leaf.contains(hit))),
    hitTag: hit ? hit.tagName : null,
    hitBox: { x: Math.round(widest.x), y: Math.round(widest.y), w: Math.round(widest.width), h: Math.round(widest.height) },
    titleAttr: leaf.getAttribute('title'),
    nearestTitle: withTitle ? withTitle.getAttribute('title') : null,
    rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
  };
})()`;

/** The painted report for ONE element expression (no text search). */
const ELEMENT_REPORT = (selectorExpr) => String.raw`
(() => {
  const el = ${selectorExpr};
  if (!el) return { present: false };
  el.scrollIntoView({ block: 'center' });
  const b = el.getBoundingClientRect();
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    present: true,
    tag: el.tagName,
    value: 'value' in el ? String(el.value) : null,
    text: (el.textContent || '').trim().slice(0, 300),
    title: el.getAttribute('title'),
    rects: el.getClientRects().length,
    visible: typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
    hitIsEl: !!(hit && (hit === el || el.contains(hit))),
    rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
  };
})()`;

/** Every `[data-testid="reels-binding-advisory"]` on screen, painted or not. */
const ADVISORY_REPORT = String.raw`
(() => {
  const els = [...document.querySelectorAll('[data-testid="reels-binding-advisory"]')];
  return els.map((el) => {
    el.scrollIntoView({ block: 'center' });
    const b = el.getBoundingClientRect();
    // The widest LINE BOX, for SENTENCE_REPORT's reason: a wrapped inline's
    // union rect is not a box it paints.
    const boxes = [...el.getClientRects()];
    const widest = boxes.length === 0 ? b
      : boxes.reduce((w, r) => (r.width * r.height > w.width * w.height ? r : w), boxes[0]);
    const hit = document.elementFromPoint(
      Math.round(widest.left + widest.width / 2), Math.round(widest.top + widest.height / 2));
    return {
      text: (el.textContent || '').trim(),
      rects: el.getClientRects().length,
      visible: typeof el.checkVisibility === 'function'
        ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
      hitIsEl: !!(hit && (hit === el || el.contains(hit))),
    };
  });
})()`;

/** Drive a real `change` through React's synthetic layer. */
const SET_SELECT = (selectorExpr, value) => String.raw`
(() => {
  const el = ${selectorExpr};
  if (![...el.options].some((o) => o.value === ${JSON.stringify(String(value))})) {
    return 'no-such-option: ' + JSON.stringify([...el.options].map((o) => o.value));
  }
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

/** The one `<select>` carrying this exact `title` — the app's own prose key. */
const SELECT_BY_TITLE = (title, where) => aimOne(
  `<select> with title ${JSON.stringify(title.slice(0, 60))}…`, where,
  `[...document.querySelectorAll('select')].filter((e) => e.getAttribute('title') === ${JSON.stringify(title)})`);

// ═══════════════════════════════════════════════════════════════════════════
// CDP plumbing (the shape every harness in this directory uses)
// ═══════════════════════════════════════════════════════════════════════════
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
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res); ws.addEventListener('error', rej);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error
      ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate',
      { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`eval threw: ${r.exceptionDetails.text} `
        + `${r.exceptionDetails.exception?.description ?? ''}`);
    }
    return r.result.value;
  };
  const json = async (expr) => JSON.parse(await evalExpr(`JSON.stringify(${expr})`));
  return { ready, send, evalExpr, json, close: () => ws.close() };
}

// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const t0 = Date.now();
  console.log('=== region-mode-advice-onscreen harness ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    run root    : ${RUN.root}  borrowed=${RUN.borrowed === true}`);
  console.log(`    electron    : ${ELECTRON}`);
  console.log(`    main bundle : ${MAIN}`);
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}`);
  }
  assertFreshBuild(RUN);

  // ── [fx] THE FIXTURE, PRINTED BEFORE ANY ROW ────────────────────────────
  const regionsPath = join(AEONDIR, REGIONS_REL);
  console.log(`    aeon        : ${AEONDIR}`);
  if (!existsSync(regionsPath)) {
    throw new Error(`REFUSING: ${regionsPath} does not exist. Every row below would be vacuous.`);
  }
  const liveMd5 = md5(regionsPath);
  const vendMd5 = existsSync(VENDORED) ? md5(VENDORED) : 'ABSENT';
  console.log(`    regions.json: ${regionsPath}`);
  console.log(`    md5 (live)  : ${liveMd5}`);
  console.log(`    md5 (vendor): ${vendMd5}   ${VENDORED}`);
  check('fx', 'the LIVE aeon regions.json is byte-identical to this repo\'s vendored copy',
    liveMd5 === vendMd5,
    liveMd5 === vendMd5
      ? `both ${liveMd5}`
      : `⚠⚠ THE FIXTURE HAS MOVED UNDER THIS RUN. live=${liveMd5} vendored=${vendMd5}. `
        + 'Every id below is DERIVED from the LIVE file, so the rows still measure the app — but '
        + 'the packet\'s numbers were written against the vendored blob and a comparison with '
        + 'them is no longer like for like.');

  // ── The anti-drift slices, read BEFORE the app is launched ──────────────
  //
  // Each slice is the REGION ARM ONLY. Folding the section arm in would make a
  // gate that cannot be satisfied rather than one that is strict.
  const layerLineSrc = sliceFrom(SCENE_PROVIDER,
    'export function layerCountLine(', 'export function layerCountTitle(', 'layerCountLine');
  const layerTitleSrc = sliceFrom(SCENE_PROVIDER,
    'export function layerCountTitle(', 'function actBindsScenesOnRegions(', 'layerCountTitle');
  const LAYER_REGION_CLAUSE = 'scenes are bound on region rows';
  const LAYER_SECTION_CLAUSE = 'scenes are assigned per section';
  const HOVER_REGION = 'a region can bind its own scene';
  const HOVER_SECTION = 'a section can bind its own scene';

  const reelsSrc = sliceFrom(SCENE_CODEC,
    'export function reelsBindingWarning(', 'export const REELS_BINDING_ADVICE_TAIL', 'reelsBindingWarning');
  const reelsWords = sliceFrom(SCENE_CODEC,
    'const REELS_BINDING_WORDS = Object.freeze({', '});', 'REELS_BINDING_WORDS');
  const REELS_TAIL = constString(SCENE_CODEC, 'REELS_BINDING_ADVICE_TAIL');
  // The region row of REELS_BINDING_WORDS, read rather than typed.
  const reelsRegionWords = (() => {
    const m = reelsWords.match(/region:\s*Object\.freeze\(\{\s*scope:\s*'([^']*)',\s*plural:\s*'([^']*)',\s*bound:\s*'([^']*)'/);
    if (!m) throw new Error('CANNOT MEASURE: REELS_BINDING_WORDS.region is no longer three quoted words');
    return { scope: m[1], plural: m[2], bound: m[3] };
  })();
  const reelsSectionWords = (() => {
    const m = reelsWords.match(/section:\s*Object\.freeze\(\{\s*scope:\s*'([^']*)'/);
    if (!m) throw new Error('CANNOT MEASURE: REELS_BINDING_WORDS.section scope is no longer quoted');
    return m[1];
  })();

  // ⚠ THE NARROWED CLAUSE ONLY. `vDeformRampSentenceFor` also composes the
  // UNKNOWN-preset arm ("… is not a preset in this project", "… is not decidable
  // from here"), which this run does not provoke; folding those literals in made
  // the gate UNSATISFIABLE rather than strict, which is the same defect as a
  // slice that wanders. The slice is the one `parts.push` the narrowed rows take.
  const rampComposerSrc = sliceFrom(RAMP_MODULE,
    'if (narrowed.length > 0) {', 'if (unknown.length > 0) {', 'vDeformRampSentenceFor narrowed arm');
  const RAMP_LEAD_NARROWED = (() => {
    const m = readFileSync(RAMP_MODULE, 'utf8').match(/narrowed:\s*'((?:[^'\\]|\\.)*)'/);
    if (!m) throw new Error('CANNOT MEASURE: V_DEFORM_RAMP_LEAD.narrowed is no longer quoted');
    return m[1].replace(/\\'/g, "'");
  })();
  const RAMP_COL_PX = (() => {
    const m = readFileSync(RAMP_MODULE, 'utf8')
      .match(/export const RAMP_SCROLL_COLUMN_WIDTH_PX\s*=\s*(\d+)/);
    if (!m) throw new Error('CANNOT MEASURE: RAMP_SCROLL_COLUMN_WIDTH_PX is no longer a literal');
    return Number(m[1]);
  })();
  const RAMP_REGION_ONE = (() => {
    const m = readFileSync(RAMP_MODULE, 'utf8')
      .match(/region:\s*Object\.freeze\(\{\s*one:\s*'([^']*)'/);
    if (!m) throw new Error('CANNOT MEASURE: V_DEFORM_RAMP_BINDER_WORDS.region.one is no longer quoted');
    return m[1];
  })();

  const REGION_MODE_SCENE_LEAD = constString(SCENE_PROVIDER, 'REGION_MODE_SCENE_LEAD');
  const emptyHintSrc = sliceFrom(SCENE_PROVIDER,
    'export function sectionAssignmentEmptyHint(', '\n}\n', 'sectionAssignmentEmptyHint');

  // The `title` strings the run uses to AIM at controls, read from source so a
  // reword stops the run at the aim rather than five rows later.
  const REELS_TITLE = (() => {
    const s = sliceFrom(SCENE_PROVIDER, 'export const REELS_ROW = Object.freeze({', '});', 'REELS_ROW');
    const m = s.match(/title:\s*'((?:[^'\\]|\\.)*)'\s*\+\s*'((?:[^'\\]|\\.)*)'\s*\+\s*EFFECTS_REELS_DEBUG_NOTE\.short/);
    if (!m) throw new Error('CANNOT MEASURE: REELS_ROW.title is no longer two literals plus the debug note');
    // The third term is derived from the contract at module load and cannot be
    // read here, so the aim uses a PREFIX rather than the whole attribute.
    return (m[1] + m[2]).replace(/\\'/g, "'");
  })();
  const REELS_UNIT_HINT = (() => {
    const s = sliceFrom(SCENE_PROVIDER, 'export const REELS_ROW = Object.freeze({', '});', 'REELS_ROW');
    const m = s.match(/unitHint:\s*'((?:[^'\\]|\\.)*)'\s*\+\s*'((?:[^'\\]|\\.)*)'/);
    if (!m) throw new Error('CANNOT MEASURE: REELS_ROW.unitHint is no longer two literals');
    return (m[1] + m[2]).replace(/\\'/g, "'");
  })();
  const V_DEFORM_TITLE = (() => {
    const s = sliceFrom(SCENE_PROVIDER, 'export const V_DEFORM_ROW = Object.freeze({', '});', 'V_DEFORM_ROW');
    const m = s.match(/title:\s*'((?:[^'\\]|\\.)*)'/);
    if (!m) throw new Error('CANNOT MEASURE: V_DEFORM_ROW.title is no longer a single literal');
    return m[1].replace(/\\'/g, "'");
  })();
  note('control titles read from source',
    `reels(prefix)=${JSON.stringify(REELS_TITLE.slice(0, 48))}… v_deform=${JSON.stringify(V_DEFORM_TITLE.slice(0, 48))}…`);

  // ── THE EXPECTED SENTENCES, composed here from source words + derived ids ─
  const reelsWarningFor = (sceneId) =>
    `EDITOR-SIDE WARNING, not the refusal: ${reelsRegionWords.scope} names "${sceneId}" in `
    + `its sceneRef, and aeon's generator refuses a reels key on a scene whose ${reelsRegionWords.plural} resolve `
    + 'through a preset or the act default instead of an editor sceneRef (the association table '
    + `is keyed on the lowered config label, which is unique only for a sceneRef-bound ${reelsRegionWords.bound}). `
    + REELS_TAIL;

  const rampSentenceFor = (regionId, presetId) =>
    `${RAMP_LEAD_NARROWED} V deform puts VSRAM in per-column mode, and `
    + `${RAMP_REGION_ONE} ${regionId} binds this scene and preset "${presetId}", whose VSRAM ramp `
    + `therefore scrolls a single ${RAMP_COL_PX}-pixel column instead of the full width. That ramp `
    + 'is edited in the Colour panel, and its own card says the same thing from the other side. '
    + 'Assumes this game declares CAP_PER_COL_VSRAM; sonic4 does.';

  const emptyHintFor = (index) =>
    `${REGION_MODE_SCENE_LEAD} Section ${index} is empty as well, but that is not `
    + 'why this panel binds nothing: no section of this act takes a scene. To bind one, use the '
    + 'Regions panel, under Bindings.';
  const shippedSectionHintFor = (index) => `Section ${index} is empty: nothing to assign a scene to.`;

  // ── [d1]-[d4] THE ANTI-DRIFT GATES ──────────────────────────────────────
  check('d1', 'ANTI-DRIFT: layerCountLine/layerCountTitle still spell the region clause and hover this file expects',
    layerLineSrc.includes(`'${LAYER_REGION_CLAUSE}'`)
    && layerLineSrc.includes(`'${LAYER_SECTION_CLAUSE}'`)
    && layerTitleSrc.includes(`'${HOVER_REGION}'`)
    && layerTitleSrc.includes(`'${HOVER_SECTION}'`),
    `${SCENE_PROVIDER}: region clause ${JSON.stringify(LAYER_REGION_CLAUSE)} and hover `
    + `${JSON.stringify(HOVER_REGION)} both present, and BOTH SECTION ARMS still present so the `
    + 'rows below can assert the section wording is absent rather than merely unspelled');

  const reelsLiterals = literalsOf(reelsSrc).filter((s) => !s.startsWith('The one-sided'));
  const expectedReels = reelsWarningFor(BORN_SCENE);
  const missingReels = reelsLiterals.filter((f) => !expectedReels.includes(f));
  check('d2', 'ANTI-DRIFT: every literal of reelsBindingWarning + the region words is in the expected reels sentence',
    reelsLiterals.length >= 3 && missingReels.length === 0 && expectedReels.includes(REELS_TAIL),
    `${reelsLiterals.length} fragment(s) from ${SCENE_CODEC}`
    + (missingReels.length ? `\n        NOT IN THE EXPECTED SENTENCE: ${JSON.stringify(missingReels)}`
      : `\n        region words = ${JSON.stringify(reelsRegionWords)}; section scope = ${JSON.stringify(reelsSectionWords)}`));

  // The narrowed arm carries a plural ternary (`binds`/`bind`); the HOLE removal
  // in `literalsOf` already drops both arms of it, so nothing needs filtering.
  const rampLiterals = literalsOf(rampComposerSrc);
  const expectedRamp = rampSentenceFor('REGION_ID', 'PRESET_ID');
  const missingRamp = rampLiterals.filter((f) => !expectedRamp.includes(f));
  check('d3', 'ANTI-DRIFT: the narrowed-arm literals of vDeformRampSentenceFor are in the expected V-deform sentence',
    rampLiterals.length >= 3 && missingRamp.length === 0,
    `${rampLiterals.length} fragment(s) from ${RAMP_MODULE}; lead=${JSON.stringify(RAMP_LEAD_NARROWED)} `
    + `binder=${JSON.stringify(RAMP_REGION_ONE)} column=${RAMP_COL_PX}px`
    + (missingRamp.length ? `\n        NOT IN THE EXPECTED SENTENCE: ${JSON.stringify(missingRamp)}` : ''));

  const hintLiterals = literalsOf(emptyHintSrc).filter((s) => !s.includes('nothing to assign'));
  const expectedHint = emptyHintFor(99);
  const missingHint = hintLiterals.filter((f) => !expectedHint.includes(f));
  check('d4', 'ANTI-DRIFT: the region arm of sectionAssignmentEmptyHint is in the expected SECTION ASSIGNMENT hint',
    hintLiterals.length >= 2 && missingHint.length === 0
    && expectedHint.startsWith(REGION_MODE_SCENE_LEAD)
    && emptyHintSrc.includes('nothing to assign a scene to.'),
    `${hintLiterals.length} fragment(s) from ${SCENE_PROVIDER}; lead read from source = `
    + `${JSON.stringify(REGION_MODE_SCENE_LEAD)}`
    + (missingHint.length ? `\n        NOT IN THE EXPECTED HINT: ${JSON.stringify(missingHint)}` : ''));

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, MAIN],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    const waitDbg = async () => {
      for (let i = 0; i < 60; i++) {
        if (await c.evalExpr('!!(window.__dbg && window.__dbg.aeon)').catch(() => false)) return true;
        await sleep(300);
      }
      return false;
    };
    if (!(await waitDbg())) throw new Error('no __dbg — rebuild with VITE_AURORA_DEBUG=1');

    // localStorage HOLDS THE PERSISTED DISCLOSURE STATE (shell/panel-state), and
    // a previous run's click would override `defaultCollapsed` in either
    // direction — which is exactly what [dis] is about.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    if (!(await waitDbg())) throw new Error('no __dbg after reload');
    check('0a', 'window.__dbg.aeon exists (a VITE_AURORA_DEBUG=1 build) and storage is cleared',
      true, 'localStorage.clear() + Page.reload — every disclosure state below is the ARRIVAL state');

    // ── 1. THE ACT ────────────────────────────────────────────────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw (a collected promise is normal):', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the LIVE aeon project is open, on the act the packet names',
      !!(st && st.open) && st.zone === 'ojz' && st.act === 'act1', JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can measure anything');
    await sleep(2000);

    const reg = await c.json('window.__dbg.aeon.regions()');
    check('1b', 'the act is in REGION MODE with a READABLE regions.json — the arm all four fixes live in',
      reg.kind === 'open' && reg.count > 0 && reg.actId === 'act1',
      `${JSON.stringify(reg)} — kind must be 'open': 'none' takes the SECTION arm and 'refused' `
      + 'takes the cannot-tell arm, and neither speaks the sentences these rows expect');
    if (reg.kind !== 'open') throw new Error(`regions kind = ${reg.kind}; the region arm is unreachable`);

    const doc = await c.json('window.__dbg.aeon.regionsDocument()');
    const scenes = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const presetDocs = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));

    // Section sidecars, read off the running app. A sidecar that still carried a
    // ref would put a SECOND clause in two of these sentences, so the exact-text
    // rows below are only correct while these are empty — a measurement, not an
    // assumption.
    const sidecars = [];
    for (let i = 0; i < 16; i++) {
      const r = await c.evalExpr(`JSON.stringify([window.__dbg.aeon.rasterRef(${i}), window.__dbg.aeon.sceneRef(${i})])`);
      const [rr, sr] = JSON.parse(r);
      if (rr !== null || sr !== null) sidecars.push({ i, rasterRef: rr, sceneRef: sr });
    }
    check('1c', 'every section sidecar rasterRef/sceneRef is null — the sentences have ONE clause',
      sidecars.length === 0,
      sidecars.length === 0
        ? `${st.sections} section(s) on the act, none carrying a ref (aeon's check_mode_conflict `
          + 'refuses one beside a regions.json, and this is that rule holding on disk)'
        : `⚠ SIDECARS CARRY REFS: ${JSON.stringify(sidecars)} — the exact-text rows below would `
          + 'then be wrong about the app rather than about the fix');

    // ── DERIVING THE SUBJECTS FROM THE FIXTURE ────────────────────────────
    const regionsBinding = (field, id) => {
      const out = [];
      for (const r of doc.regions) {
        if ((r[field] ?? null) === id && !out.includes(r.id)) out.push(r.id);
      }
      return out;
    };
    /** A scene that HAS a `reels` key and that exactly one region binds. */
    const boundReelsScene = (() => {
      for (const s of scenes) {
        if (s.reels === undefined) continue;
        const b = regionsBinding('sceneRef', s.id);
        if (b.length === 1) return { id: s.id, region: b[0], layers: s.layers.length };
      }
      return null;
    })();
    check('1d', 'the fixture yields check 2\'s POSITIVE subject: a scene carrying `reels` that exactly one region binds',
      boundReelsScene !== null,
      `${JSON.stringify(boundReelsScene)}; scenes with a reels key = `
      + `${JSON.stringify(scenes.filter((s) => s.reels !== undefined).map((s) => s.id))}; `
      + `region sceneRefs = ${JSON.stringify(doc.regions.filter((r) => (r.sceneRef ?? null) !== null)
        .map((r) => [r.id, r.sceneRef]))}`);
    if (boundReelsScene === null) {
      throw new Error('no shipped scene both carries `reels` and is bound by exactly one region — '
        + 'check 2 has no positive subject and every row below it would be vacuous');
    }

    const unboundScenes = scenes.filter((s) => regionsBinding('sceneRef', s.id).length === 0);
    const rampPresets = presetDocs.filter((p) => p.ramp !== undefined).map((p) => p.id);
    note('what the fixture does NOT have',
      `scenes no region binds: ${unboundScenes.length === 0 ? 'NONE — check 2\'s negative subject '
        + `must be created in the session` : JSON.stringify(unboundScenes.map((s) => s.id))}\n        `
      + `scenes carrying v_deform: ${JSON.stringify(scenes.filter((s) => s.v_deform !== undefined).map((s) => s.id))}`
      + ' — check 3 must turn one on in the session\n        '
      + `regions carrying BOTH a sceneRef and a rasterRef: ${JSON.stringify(doc.regions
        .filter((r) => (r.sceneRef ?? null) !== null && (r.rasterRef ?? null) !== null).map((r) => r.id))}`
      + ` — check 3's sentence has no subject without one\n        presets carrying a ramp: ${JSON.stringify(rampPresets)}`);

    // ── 2. THE EFFECTS FACET, AND WHAT AN AUTHOR MEETS ON ARRIVAL ─────────
    await c.evalExpr(`(() => { const b = ${aimOne('the Effects facet pill',
      'the workspace facet bar',
      `[...document.querySelectorAll('button')].filter((e) => (e.textContent || '').trim() === 'Effects')`)};
      b.click(); return 'ok'; })()`);
    await sleep(1500);
    await c.evalExpr(showSubTabOrThrow(SCENE_TAB));
    await sleep(1200);
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(boundReelsScene.id)})`);
    await sleep(1000);

    const arrival = {};
    for (const s of [SCENES_SECTION, LAYERS_SECTION, SCENE_SECTION, ASSIGN_SECTION]) {
      arrival[s] = await c.evalExpr(SECTION_COLLAPSED_ATTR(s));
    }
    check('dis', 'AS IT ARRIVES: checks 1 and 4 are open on the page; checks 2 and 3 are behind a SHUT disclosure',
      arrival[LAYERS_SECTION] === 'false' && arrival[ASSIGN_SECTION] === 'false'
      && arrival[SCENE_SECTION] === 'true',
      `${JSON.stringify(arrival)}\n        `
      + 'CollapsibleSection renders `{!collapsed && children}`, so the reels and V-deform '
      + 'sentences are NOT IN THE DOM at all until the Scene section is opened — which is why '
      + 'every row below prints domNodes beside the painted-leaf report.');

    // ══════════════════════════════════════════════════════════════════════
    // CHECK 1 — the LAYERS line and its hover
    // ══════════════════════════════════════════════════════════════════════
    //
    // The cap is read out of the SECTION TITLE, which is the app's own second
    // rendering of `EFFECTS_LAYER_COUNT.max` (`Layers (n/m per scene)`), rather
    // than typed here: the constant is derived from the contract schema at
    // module load and there is no literal in `src/` to read.
    const layersTitle = await c.evalExpr(`(() => { const el = ${aimOne(
      `the header of [data-section="${LAYERS_SECTION}"]`, 'the Parallax sub-tab',
      `document.querySelectorAll('[data-section="${LAYERS_SECTION}"] > :first-child')`)};
      return (el.textContent || '').trim(); })()`);
    const capM = /Layers \((\d+)\/(\d+) per scene\)/.exec(layersTitle);
    check('1e', 'the LAYERS section header prints the live layer count and the cap — the cap this row reads',
      capM !== null && Number(capM[1]) === boundReelsScene.layers,
      `header = ${JSON.stringify(layersTitle)}; model layers = ${boundReelsScene.layers}`);
    if (capM === null) throw new Error('the LAYERS header no longer prints `Layers (n/m per scene)`');
    const LAYER_LINE = `${boundReelsScene.layers} of ${capM[2]} layers (per scene; ${LAYER_REGION_CLAUSE})`;

    const c1 = await c.json(SENTENCE_REPORT(LAYER_LINE));
    check('c1a', 'CHECK 1: the LAYERS line is PAINTED and reads the REGION-mode clause',
      c1.leaf === true && c1.exact === true && c1.rects > 0 && c1.visible === true
      && c1.hitIsLeaf === true,
      `EXPECTED ${JSON.stringify(LAYER_LINE)}\n        GOT ${JSON.stringify(c1)}`);

    const c1Section = await c.json(SENTENCE_REPORT(LAYER_SECTION_CLAUSE));
    check('c1a2', 'CHECK 1, the absence half: the SECTION clause is not anywhere in the document',
      c1Section.leaf === false && c1Section.domNodes === 0,
      `${JSON.stringify(LAYER_SECTION_CLAUSE)} → ${JSON.stringify(c1Section)}\n        `
      + 'ANTI-VACUOUS: [c1a] above proves the line IS painted in the same read, so this is not '
      + 'the absence an empty panel would produce. [d1] proves the section arm is still in src/.');

    // ⚠ [c1b] IS NOT A VISIBILITY ASSERTION AND DOES NOT PRETEND TO BE.
    // A `title` is a hover: it has no client rects of its own, a browser tooltip
    // cannot be provoked from CDP, and there is no element to hit-test. What is
    // measurable — and what this row claims, exactly — is that the attribute is
    // carried by the element [c1a] just proved is painted, hit-tested and
    // reading the count line. The `nearestTitle` in the report below is read off
    // `leaf.closest('[title]')` in the SAME evaluation as the geometry.
    check('c1b', 'CHECK 1, the hover: the PAINTED count-line element carries title="a region can bind its own scene"',
      c1.leaf === true && c1.rects > 0 && c1.hitIsLeaf === true
      && (c1.titleAttr === HOVER_REGION || c1.nearestTitle === HOVER_REGION),
      `title on the leaf = ${JSON.stringify(c1.titleAttr)}; nearest ancestor with one = `
      + `${JSON.stringify(c1.nearestTitle)}\n        `
      + '⚠ HOW THIS WAS ESTABLISHED: the attribute was READ OFF the element whose rects, '
      + 'checkVisibility and strict centre hit test are reported by [c1a] in the same page '
      + 'evaluation. A hover has no geometry of its own; this row asserts the attribute is on '
      + 'the painted element, NOT that a tooltip was seen.');
    check('c1b2', 'CHECK 1, the hover\'s absence half: no element on the page carries the SECTION hover',
      (await c.evalExpr(`document.querySelectorAll('[title=${JSON.stringify(HOVER_SECTION)}]').length`)) === 0,
      `[title="${HOVER_SECTION}"] count = `
      + `${await c.evalExpr(`document.querySelectorAll('[title=${JSON.stringify(HOVER_SECTION)}]').length`)}; `
      + `[title="${HOVER_REGION}"] count = `
      + `${await c.evalExpr(`document.querySelectorAll('[title=${JSON.stringify(HOVER_REGION)}]').length`)} `
      + '(the second number is the positive control: the region hover IS on the page)');

    await shot(c, 'check1-LAYERS-region-clause');

    // ══════════════════════════════════════════════════════════════════════
    // CHECK 2 — the reels binding advisory
    // ══════════════════════════════════════════════════════════════════════
    const opened = await c.evalExpr(openSectionOrThrow(SCENE_SECTION));
    await sleep(1200);
    check('2a0', 'the Scene form opens (checks 2 and 3 live inside it)',
      (await c.evalExpr(SECTION_COLLAPSED_ATTR(SCENE_SECTION))) === 'false',
      `openSectionOrThrow → ${opened}`);

    const REELS_SELECT = SELECT_BY_TITLE_PREFIX(REELS_TITLE);
    const reelsCtl = await c.json(ELEMENT_REPORT(REELS_SELECT));
    const unitHint = await c.json(SENTENCE_REPORT(REELS_UNIT_HINT));
    const advisoriesBound = await c.json(ADVISORY_REPORT);
    const sectionWordedAnywhere = await c.json(SENTENCE_REPORT(reelsSectionWords));
    check('c2a', 'CHECK 2a: NO binding warning on the scene a region binds — with the reels row proven ON SCREEN and ON',
      advisoriesBound.length === 0
      && reelsCtl.present === true && reelsCtl.value === 'on' && reelsCtl.rects > 0
      && reelsCtl.visible === true && reelsCtl.hitIsEl === true
      && unitHint.leaf === true && unitHint.rects > 0 && unitHint.visible === true
      && sectionWordedAnywhere.domNodes === 0,
      `region ${boundReelsScene.region} binds "${boundReelsScene.id}" (derived from ${REGIONS_REL}) and `
      + 'that scene carries a reels key ON DISK\n        '
      + `[data-testid="reels-binding-advisory"] on screen: ${advisoriesBound.length} `
      + `${JSON.stringify(advisoriesBound)}\n        `
      + `POSITIVE CONTROLS in the same read — Reels select ${JSON.stringify(reelsCtl)}\n        `
      + `always-on unit hint ${JSON.stringify({ leaf: unitHint.leaf, rects: unitHint.rects, visible: unitHint.visible, hitIsLeaf: unitHint.hitIsLeaf })}\n        `
      + `and the section-worded scope ${JSON.stringify(reelsSectionWords)} appears in `
      + `${sectionWordedAnywhere.domNodes} element(s) — 0 is the absence this check is about`);

    await shot(c, 'check2a-bound-scene-no-warning');

    // ── the NEGATIVE subject: a scene no region binds ─────────────────────
    //
    // Every shipped scene of this act is bound by a region, so the negative case
    // has no subject on disk. One is CREATED IN THE SESSION through the panel's
    // own "Scene id" + New control and NEVER SAVED, exactly as
    // `delete-refusal-onscreen-harness.mjs` does for its own floor.
    note('check 2\'s negative subject',
      unboundScenes.length === 0
        ? `all ${scenes.length} shipped scene(s) are region-bound — creating "${BORN_SCENE}" in the SESSION, never saved`
        : `"${unboundScenes[0].id}" is unbound on disk; "${BORN_SCENE}" is created anyway so the row `
          + 'has the same shape in both worlds');
    const scenesOpen = await c.evalExpr(openSectionOrThrow(SCENES_SECTION));
    await sleep(700);
    const typeInto = async (selectorExpr, text) => {
      await c.evalExpr('(document.activeElement && document.activeElement.blur()), 0');
      const p = await c.json(String.raw`(() => {
        const el = ${selectorExpr};
        el.scrollIntoView({ block: 'center' });
        const b = el.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
      })()`);
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
      }
      for (const ch of text) {
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
        await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
      }
    };
    const NEW_ID_BOX = aimOne('the "Scene id" input', 'the Scenes section (EffectsScenePanel.tsx)',
      `document.querySelectorAll('input[placeholder="new_scene_id"]')`);
    await typeInto(NEW_ID_BOX, BORN_SCENE);
    await sleep(400);
    await c.evalExpr(`(() => { const b = ${aimOne('the New chip beside "Scene id"',
      'the Scenes section (Chip renders a real <button> when it has a handler)',
      `[...document.querySelectorAll('button')].filter((e) => (e.textContent || '').trim() === 'New')`)};
      b.click(); return 'ok'; })()`);
    await sleep(1400);
    const scenes2 = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    const born = scenes2.some((s) => s.id === BORN_SCENE);
    check('c2b0', 'a scene NO region binds exists to measure — created in the SESSION through the panel\'s own control, never saved',
      born && regionsBinding('sceneRef', BORN_SCENE).length === 0,
      `scenes now ${JSON.stringify(scenes2.map((s) => s.id))}; regions binding "${BORN_SCENE}": `
      + `${JSON.stringify(regionsBinding('sceneRef', BORN_SCENE))}; scenes section open → ${scenesOpen}`);
    if (!born) throw new Error(`"${BORN_SCENE}" was not created — check 2's negative case has no subject`);

    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(BORN_SCENE)})`);
    await sleep(1000);
    if ((await c.evalExpr(SECTION_COLLAPSED_ATTR(SCENE_SECTION))) === 'true') {
      await c.evalExpr(openSectionOrThrow(SCENE_SECTION));
      await sleep(900);
    }
    const setReels = await c.evalExpr(SET_SELECT(SELECT_BY_TITLE_PREFIX(REELS_TITLE), 'on'));
    await sleep(1200);
    const bornDoc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'))
      .find((s) => s.id === BORN_SCENE);
    check('c2b1', 'the created scene really carries a `reels` key now — the advisory\'s own gate',
      bornDoc !== undefined && bornDoc.reels !== undefined,
      `SET_SELECT → ${setReels}; document = ${JSON.stringify(bornDoc?.reels ?? null)}`);

    const EXPECT_REELS = reelsWarningFor(BORN_SCENE);
    const advisoriesFree = await c.json(ADVISORY_REPORT);
    const reelsSentence = await c.json(SENTENCE_REPORT(EXPECT_REELS));
    check('c2b', 'CHECK 2b: the REGION-worded warning is PAINTED on a scene no region binds',
      advisoriesFree.length === 1
      && advisoriesFree[0].text === EXPECT_REELS
      && advisoriesFree[0].rects > 0 && advisoriesFree[0].visible === true
      && advisoriesFree[0].hitIsEl === true
      && reelsSentence.leaf === true && reelsSentence.exact === true,
      `EXPECTED ${JSON.stringify(EXPECT_REELS)}\n        `
      + `ADVISORY ELEMENTS ${JSON.stringify(advisoriesFree)}\n        `
      + `LEAF ${JSON.stringify(reelsSentence)}\n        `
      + `it must say ${JSON.stringify(reelsRegionWords.scope)} and not `
      + `${JSON.stringify(reelsSectionWords)} — that swap is the whole of the item-2 fix`);
    check('c2b2', 'CHECK 2b, the absence half: the SECTION-worded scope is nowhere in the warning or the document',
      (await c.json(SENTENCE_REPORT(reelsSectionWords))).domNodes === 0,
      `${JSON.stringify(reelsSectionWords)} → `
      + `${JSON.stringify(await c.json(SENTENCE_REPORT(reelsSectionWords)))}\n        `
      + 'ANTI-VACUOUS: [c2b] proves the warning IS painted in the same state, so this is not the '
      + 'absence a blank panel would give.');

    await shot(c, 'check2b-unbound-scene-region-warning');

    // ══════════════════════════════════════════════════════════════════════
    // CHECK 3 — the V-deform sentence
    // ══════════════════════════════════════════════════════════════════════
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(boundReelsScene.id)})`);
    await sleep(1000);
    if ((await c.evalExpr(SECTION_COLLAPSED_ATTR(SCENE_SECTION))) === 'true') {
      await c.evalExpr(openSectionOrThrow(SCENE_SECTION));
      await sleep(900);
    }
    const setVd = await c.evalExpr(SET_SELECT(SELECT_BY_TITLE(V_DEFORM_TITLE,
      'the Scene form (EffectsScenePanel.tsx, V_DEFORM_ROW)'), 'on'));
    await sleep(1200);
    const vdDoc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'))
      .find((s) => s.id === boundReelsScene.id);
    check('c3a0', 'the region-bound scene carries `v_deform` now — the panel\'s own gate on the sentence',
      vdDoc !== undefined && vdDoc.v_deform !== undefined,
      `SET_SELECT → ${setVd}; v_deform = ${JSON.stringify(vdDoc?.v_deform ?? null)} `
      + '(turned on IN THE SESSION through the panel\'s own Select; no shipped scene of this act '
      + 'carries the key, and nothing is saved)');

    // ── [c3a] THE SHIPPED FIXTURE, AND WHY THE PACKET'S CHECK 3 IS VACUOUS ─
    const rampLeadAnywhere = await c.json(SENTENCE_REPORT('V deform puts VSRAM in per-column mode'));
    const sectionNamed = await c.json(SENTENCE_REPORT('Section '));
    check('c3a', 'CHECK 3 ON THE SHIPPED regions.json: there is NO V-deform sentence at all, so "no section is named" is VACUOUS',
      rampLeadAnywhere.leaf === false && rampLeadAnywhere.domNodes === 0,
      `V-deform sentence in the document: ${JSON.stringify(rampLeadAnywhere)}\n        `
      + '⚠ THIS ROW IS NOT EVIDENCE FOR THE FIX AND SAYS SO. No region in this act carries a '
      + 'sceneRef AND a rasterRef, so `vDeformRampRegionBindings` yields nothing and the sentence '
      + 'is null; every section sidecar rasterRef is null too ([1c]), so `vDeformRampBindings` '
      + 'yielded nothing BEFORE the fix either. This row would pass on master-before-the-fix. '
      + '[c3b] is the row with a subject.\n        '
      + `(for scale, the string "Section " appears in ${sectionNamed.domNodes} element(s) `
      + 'elsewhere on the page, which is why "no section is named" cannot be asked of the whole '
      + 'document — [c3b] asks it of the sentence itself)');

    // ── [c3b] ONE REGION GIVEN A rasterRef, IN THE SESSION ────────────────
    //
    // `__dbg.aeon.setRegions` goes through `parseRegionsDocument` and the real
    // `set-regions` command; its own docblock says it "does not touch disk, in
    // either direction". The document below is the LIVE one, read back from the
    // app, with ONE key added to the region that already binds this scene.
    if (rampPresets.length === 0) {
      cannotMeasure('c3b', 'CHECK 3 with a subject: a region binding this scene AND a ramp preset',
        'no preset in this project carries a `ramp`, so there is no narrowing to describe. '
        + 'Nothing is substituted.');
    } else {
      const RAMP_PRESET = rampPresets[0];
      const REGION = boundReelsScene.region;
      const mutated = JSON.parse(JSON.stringify(doc));
      let touched = 0;
      for (const r of mutated.regions) {
        if (r.id === REGION) { r.rasterRef = RAMP_PRESET; touched += 1; }
      }
      const setRes = await c.json(`window.__dbg.aeon.setRegions(${JSON.stringify(JSON.stringify(mutated))})`);
      await sleep(1400);
      const docNow = await c.json('window.__dbg.aeon.regionsDocument()');
      const nowBoth = docNow.regions.filter((r) => (r.sceneRef ?? null) !== null && (r.rasterRef ?? null) !== null);
      check('c3b0', 'a region binding this scene now also binds a ramp preset — IN THE SESSION, through the real codec, never on disk',
        setRes.ok === true && nowBoth.length === 1 && nowBoth[0].id === REGION
        && nowBoth[0].rasterRef === RAMP_PRESET,
        `setRegions → ${JSON.stringify(setRes)}; ${touched} entry(ies) of region ${REGION} given `
        + `rasterRef ${JSON.stringify(RAMP_PRESET)} (a preset whose document carries a ramp: `
        + `${JSON.stringify(rampPresets)}); regions with both refs now ${JSON.stringify(nowBoth.map((r) => r.id))}`
        + '\n        ⚠ `setRegions` "does not touch disk, in either direction" (debug-hooks.ts). '
        + 'No save is issued by this run.');

      if ((await c.evalExpr(SECTION_COLLAPSED_ATTR(SCENE_SECTION))) === 'true') {
        await c.evalExpr(openSectionOrThrow(SCENE_SECTION));
        await sleep(900);
      }
      const EXPECT_RAMP = rampSentenceFor(REGION, RAMP_PRESET);
      const ramp = await c.json(SENTENCE_REPORT(EXPECT_RAMP));
      check('c3b', 'CHECK 3: the V-deform sentence is PAINTED, names a REGION, and names no section',
        ramp.leaf === true && ramp.exact === true && ramp.rects > 0 && ramp.visible === true
        && ramp.hitIsLeaf === true
        && ramp.text.includes(`${RAMP_REGION_ONE} ${REGION}`)
        && !ramp.text.includes('Section ') && !ramp.text.includes('section '),
        `EXPECTED ${JSON.stringify(EXPECT_RAMP)}\n        GOT ${JSON.stringify(ramp)}\n        `
        + 'THE ABSENCE HALF IS ASKED OF THE SENTENCE ITSELF, not of the page: the sentence is '
        + `proven painted first, then required to contain ${JSON.stringify(`${RAMP_REGION_ONE} ${REGION}`)} `
        + 'and neither "Section " nor "section ". Before the fix this surface walked the SECTIONS '
        + 'and would have named one (or, on this act, said nothing at all).');
      await shot(c, 'check3-vdeform-region-sentence');
    }

    // ══════════════════════════════════════════════════════════════════════
    // CHECK 4 — the SECTION ASSIGNMENT hint on an empty slot
    // ══════════════════════════════════════════════════════════════════════
    const editingOpts = await c.json(`(() => { const s = ${aimOne('the "Editing" section select',
      'the sticky section strip (SectionPicker.tsx)',
      `[...document.querySelectorAll('select')].filter((e) => e.getAttribute('title') === 'The section both bindings on this tab act on.')`)};
      return { value: s.value, options: [...s.options].map((o) => o.textContent) }; })()`);
    const emptyOption = editingOpts.options.find((o) => /\(empty\)/.test(o)) ?? null;
    check('c4a', 'CHECK 4\'s PRECONDITION, measured rather than assumed: does the Editing select offer an EMPTY act slot?',
      true,
      `options = ${JSON.stringify(editingOpts.options)}\n        `
      + (emptyOption === null
        ? `⚠⚠ NO. This act has ${st.sections} sections, 0..${st.sections - 1}, and NONE is empty `
          + '(SectionPicker labels an empty one "Section N (empty)" — see its own comment, "an '
          + 'empty section is offered and labelled, not hidden"). THE PACKET\'S CHECK 4 AS WORDED '
          + '— "move the Editing select to an act slot with no section" — IS NOT PERFORMABLE ON '
          + 'THIS FIXTURE. [c4b] reaches the same provider branch the only way left and says how.'
        : `an empty slot IS offered: ${JSON.stringify(emptyOption)} — [c4b] uses it`));

    // The populated-slot control FIRST, so the absence in [c4b] has a partner.
    await c.evalExpr('window.__dbg.aeon.setActiveSection(0)');
    await sleep(900);
    // ⚠ THE LEAD ALONE IS NOT THE DISCRIMINATOR, and the first draft of this row
    // was wrong about that. `REGION_MODE_SCENE_LEAD` is hoisted and SHARED: the
    // scene selection relation opens with the same sentence and is painted on
    // every slot ("… Edits below change <scene>, which region <id> binds."). So
    // the control asks for the absence of the EMPTY HINT, which is check 4's
    // actual subject, and for the presence of the binding control it replaces.
    const boundSlotHint = await c.json(SENTENCE_REPORT(emptyHintFor(0)));
    const leadElsewhere = await c.json(SENTENCE_REPORT(REGION_MODE_SCENE_LEAD));
    const assignBody = await c.json(ELEMENT_REPORT(
      `document.querySelector('[data-section="${ASSIGN_SECTION}"]')`));
    check('c4c', 'CHECK 4\'s POSITIVE CONTROL: on a POPULATED slot the SECTION ASSIGNMENT panel paints its binding control and NO empty hint',
      assignBody.present === true && assignBody.rects > 0 && assignBody.visible === true
      && /Section 0/.test(assignBody.text) && boundSlotHint.leaf === false
      && boundSlotHint.domNodes === 0,
      `[data-section="${ASSIGN_SECTION}"] ${JSON.stringify({ rects: assignBody.rects, visible: assignBody.visible, hitIsEl: assignBody.hitIsEl })}\n        `
      + `its text: ${JSON.stringify(assignBody.text)}\n        `
      + `the EMPTY hint for this slot: ${JSON.stringify(boundSlotHint)}\n        `
      + `⚠ the region-mode LEAD is on screen here anyway — ${JSON.stringify(leadElsewhere.text ?? null)} — `
      + 'because it is hoisted and shared with the scene selection relation, so its PRESENCE is '
      + 'not what check 4 is about.\n        '
      + 'This is what makes [c4b] below non-vacuous: the SAME panel, one slot over, says something '
      + 'ELSE — so an absent hint there is a state of the panel and not a dead panel.');

    const EMPTY_SLOT = emptyOption !== null
      ? Number(/Section (\d+)/.exec(emptyOption)[1]) : st.sections;
    const how = emptyOption !== null
      ? `the Editing select's own "${emptyOption}" option`
      : `__dbg.aeon.setActiveSection(${EMPTY_SLOT}) — one past the last section, so `
        + `act.sections[${EMPTY_SLOT}] is undefined and the provider takes the SAME empty branch. `
        + '⚠ NOT A GESTURE AN AUTHOR CAN MAKE ON THIS ACT: see [c4a]. The paint below is the real '
        + 'provider on the real panel; the route to it is a debug door.';
    if (emptyOption !== null) {
      await c.evalExpr(SET_SELECT(aimOne('the "Editing" section select', 'the sticky section strip',
        `[...document.querySelectorAll('select')].filter((e) => e.getAttribute('title') === 'The section both bindings on this tab act on.')`),
      String(EMPTY_SLOT)));
    } else {
      await c.evalExpr(`window.__dbg.aeon.setActiveSection(${EMPTY_SLOT})`);
    }
    await sleep(1200);

    const EXPECT_HINT = emptyHintFor(EMPTY_SLOT);
    const hint = await c.json(SENTENCE_REPORT(EXPECT_HINT));
    const shippedHint = await c.json(SENTENCE_REPORT(shippedSectionHintFor(EMPTY_SLOT)));
    check('c4b', 'CHECK 4: the SECTION ASSIGNMENT hint is PAINTED and LEADS with the region-mode sentence',
      hint.leaf === true && hint.exact === true && hint.rects > 0 && hint.visible === true
      && hint.hitIsLeaf === true && hint.text.startsWith(REGION_MODE_SCENE_LEAD)
      && shippedHint.leaf === false && shippedHint.domNodes === 0,
      `REACHED BY: ${how}\n        `
      + `EXPECTED ${JSON.stringify(EXPECT_HINT)}\n        GOT ${JSON.stringify(hint)}\n        `
      + `the SHIPPED section-mode sentence ${JSON.stringify(shippedSectionHintFor(EMPTY_SLOT))} → `
      + `${JSON.stringify(shippedHint)} (0 domNodes is the "no longer implies a populated section `
      + 'could take a scene" half, and [c4c] above is its positive control)');

    await shot(c, 'check4-empty-slot-region-lead');

    // ══════════════════════════════════════════════════════════════════════
    // CHECK 5 — the section-mode control
    // ══════════════════════════════════════════════════════════════════════
    cannotMeasure('c5', 'CHECK 5, the CONTROL: a section-mode act showing the four sentences that shipped',
      `NO SECTION-MODE ACT EXISTS ON THIS MACHINE'S aeon CHECKOUT. ${AEONDIR} carries exactly one `
      + 'act — games/sonic4/data/levels/ojz/act1, and games/sonic4/data/editor holds exactly one '
      + `act directory, ojz/act1 — and it HAS a regions.json (${REGIONS_REL}, md5 ${liveMd5}). `
      + '`actHasRegionsFile` is file presence and nothing else, so there is no act on disk that '
      + 'takes the section arm.\n        NOTHING IS SUBSTITUTED FOR IT. A missing control is "did '
      + 'not run", never a finding: this run does NOT clear the regions document in the session to '
      + 'manufacture one, and does NOT write to the aeon tree.\n        The mode-dependence this '
      + 'control was reaching for is supplied instead by the RED-FIRST MUTATIONS recorded in the '
      + 'landing report: each region arm is flipped to its section wording in src/, the tree is '
      + 'rebuilt, and the rows above go red. That proves the sentences MOVE WITH THE MODE '
      + 'PREDICATE; it does not prove a real section-mode act paints correctly, and this row stays '
      + 'open until one exists.');
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`${pass}/${results.length} rows passed · ${fails.length} failed · `
    + `${unmeasurable.length} UNMEASURABLE (not a pass, not a failure — did not run) · `
    + `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (fails.length) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  if (unmeasurable.length) {
    console.log('UNMEASURABLE — READ THE ROW, IT IS NOT A PASS:');
    for (const u of unmeasurable) console.log(`  ${u}`);
  }
  process.exit(fails.length ? 1 : 0);
}

/**
 * The one `<select>` whose `title` STARTS WITH this prefix.
 *
 * A prefix rather than the whole attribute for `REELS_ROW.title`, whose third
 * term is derived from the contract document at module load and so cannot be
 * read out of `src/` by this file. The prefix is still two full source literals
 * long and is read from source, so a reword stops the run at the aim.
 */
function SELECT_BY_TITLE_PREFIX(prefix) {
  return aimOne(`<select> whose title starts with ${JSON.stringify(prefix.slice(0, 50))}…`,
    'the Scene form (EffectsScenePanel.tsx)',
    `[...document.querySelectorAll('select')].filter((e) => (e.getAttribute('title') || '').startsWith(${JSON.stringify(prefix)}))`);
}

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-region-mode-advice/${name}.png`);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
