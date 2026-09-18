// ═══════════════════════════════════════════════════════════════════════════
// delete-refusal-onscreen — ARE THE TWO DELETE GUARDS ACTUALLY ON SCREEN?
// ═══════════════════════════════════════════════════════════════════════════
//
// ── THE SUBJECT ───────────────────────────────────────────────────────────
//
// Two guards shipped on 2026-09-17 and NEITHER HAS EVER BEEN SEEN RENDERED:
//
//     docs/reviews/2026-09-17-delete-preset-region-bound.md
//     docs/reviews/2026-09-17-delete-scene-no-guard.md
//
// Both packets' "Open" lists tag the same three things for a foreground seat.
// This file is that seat, for the first two of them:
//
//   1. On OJZ act 1 (REGION MODE) the Delete control for a document a REGION
//      binds is really GREYED, and the packet's sentence is really PAINTED.
//   2. The same control for a document NOTHING binds is really ENABLED.
//   3. (BOTH packets, item 2 of the scene one) THE REASON IS BEHIND A
//      DISCLOSURE. The Delete button sits in a `CollapsibleSection`'s
//      always-visible `right={...}` header; its `<Hint>` reason sits in the
//      `SectionBody`, and the section is `defaultCollapsed`.
//
// The ~10,190-row node suite proves the DERIVATIONS produce those sentences.
// It cannot see React, cannot see a canvas and cannot see a running app, so it
// cannot prove the app painted any of it. That is this file's whole subject.
//
// ── ⚠ WHAT THE OWNER'S READING OF ITEM 3 GETS *MORE THAN RIGHT* ───────────
//
// The brief asked for: "the reason has NO CLIENT RECTS / FAILS
// `checkVisibility()`". On this tree the truth is STRONGER and the rows below
// say so rather than restating the brief. `ui/CollapsibleSection.tsx` renders
//
//     {!collapsed && children}
//
// so a shut section has NO BODY IN THE DOM AT ALL. There is no element to ask
// `checkVisibility()` of. Rows [p3]/[s3] therefore measure BOTH halves and
// print both: `domNodes` (elements whose *textContent* — hidden text included —
// contains the sentence; 0 means not even in the document) AND the painted-leaf
// report (`leaf: false`). A row that only asked `checkVisibility()` would have
// thrown on a null element and been read as a harness bug.
//
// ── WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING ────────────
//
//   • THE PANEL RENDERED NOTHING. "Delete was disabled" is equally true of a
//     panel that disables everything and of a panel that is not on screen.
//     [p2]/[s2] are the anti-vacuous floor: a document NOTHING binds must show
//     the SAME control ENABLED, found by the same accessible label.
//   • THE SENTENCE IS IN THE DOM AND NOT ON SCREEN. Hidden text is still in
//     `textContent`, and this repo has shipped THREE rows that went green over
//     a permanently-collapsed disclosure. Every on-screen claim here asserts
//     `checkVisibility()`, a non-empty `getClientRects()`, a STRICT
//     `elementFromPoint` hit at the leaf's own centre (`hit === leaf ||
//     leaf.contains(hit)` — an ancestor catching the point is NOT a pass), and
//     document order relative to the control it is about.
//   • [p3]/[s3] ARE ABSENCE-SHAPED, which is what a broken build, an unopened
//     project and a crashed renderer all produce. So each of them asserts, in
//     the SAME read, that the Delete button IS painted and hit-testable and
//     reports the app's own `data-section-collapsed`; and [p4]/[s4] then make
//     the same sentence appear after one click, which no absence can do.
//   • THE HARNESS TYPED THE SENTENCE IT WANTED TO SEE. The expected sentences
//     are composed here from ids DERIVED FROM THE FIXTURE, and rows [dp]/[ds]
//     are the anti-drift gate: every string literal in the provider's own
//     region-binder branch (sliced out of `src/`) must be a substring of what
//     this file expects. A reword in `src/` reds [dp]/[ds] instead of silently
//     agreeing with a stale copy.
//   • A DIFFERENT CONTROL WAS DRIVEN. Every control is found by its ACCESSIBLE
//     LABEL (`IconButton` puts `label` on `aria-label`) or by the app's own
//     `data-section` / `data-effects-sub-tab` routing keys — never "the third
//     button in the column", which silently moves. Ambiguity THROWS
//     (`lib/strict-aim.mjs`), it does not pick the first hit.
//   • THE FIXTURE MOVED. The project is the LIVE aeon checkout, which another
//     lane edits. Row [fx] prints the resolved path and the md5 of
//     `games/sonic4/data/editor/ojz/act1/regions.json` and compares it with this
//     repo's vendored copy; every id below is DERIVED from the live file at run
//     time, never typed.
//
// ⚠ NOTHING IS STITCHED FROM TWO RUNS. ⚠ NO EMULATOR, EVER.
// ⚠ NOTHING IS WRITTEN TO THE AEON TREE: no save is issued, and no enabled
//   Delete is ever clicked. The ONE session-only mutation is [s0]: this act's
//   four scenes are ALL bound by a region, so the scene-side floor has no
//   subject on disk and one is CREATED IN THE SESSION through the panel's own
//   "Scene id" + New control. It never reaches a file (there is no autosave —
//   `shell/close-guard.ts`), and the row prints what it made.
//
// CLEANUP IS BY PID — `spawnGuarded` + `killTree`, awaited.
//
// ── RUN ───────────────────────────────────────────────────────────────────
//
//   VITE_AURORA_DEBUG=1 npm run build       # or there is no window.__dbg
//   ELECTRON_BIN=<main aurora checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   npm run harness:delete-refusal-onscreen
//
// FROM A LINKED WORKTREE you need BOTH env vars or you silently measure the
// MAIN checkout's `dist/` while every path in the output looks correct. The run
// PRINTS which tree answered on its `root:` line — read it.

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot, assertFreshBuild } from './lib/run-root.mjs';
import { aimOne, showSubTabOrThrow, openSectionOrThrow } from './lib/strict-aim.mjs';
import { SECTION_COLLAPSED_ATTR } from './lib/effects-sections.mjs';

const PORT = Number(process.env.PORT ?? 9623);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const SHOTS = `${ROOT}/scratchpad/shots-delete-refusal`;
mkdirSync(SHOTS, { recursive: true });

/** The act the two packets name. Both guards are region-mode guards and this is
 *  the only act in aeon's project.json that carries a regions.json. */
const REGIONS_REL = 'games/sonic4/data/editor/ojz/act1/regions.json';
/** This repo's committed copy of aeon's shared golden (provenance beside it). */
const VENDORED = `${ROOT}/test/fixtures/regions/ojz_act1.regions.json`;

/** The scene created IN THE SESSION for the scene-side floor. Never saved. */
const BORN_SCENE = 'harness_unbound_scene';

/** The two CollapsibleSections that hold a Delete in their header. */
const PRESET_SECTION = 'aeon.effects.preset.bands';
const SCENE_SECTION = 'aeon.effects.scene';
const PRESET_TAB = 'colour';
const SCENE_TAB = 'parallax';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

const results = [];
const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ANTI-DRIFT GATE: the provider's own literals, sliced out of src/
// ═══════════════════════════════════════════════════════════════════════════
//
// The expected sentences below are COMPOSED HERE, because the derivation is a
// template with three interpolations and there is nothing in `src/` to read
// whole. A composed sentence is a RETYPED sentence, and a retyped sentence goes
// green against a panel showing different words the day somebody rewords the
// provider. So the literals are read back out of source and required to be
// substrings of what this file expects.
//
// The slice is the REGION-BINDER BRANCH ONLY, between the two markers below:
// the other two arms of the same function (the unreadable-regions.json clause
// and the leftover-sidecar clause) speak sentences this run does not provoke,
// and folding them in would make the gate unsatisfiable rather than strict.
function regionBranchLiterals(file, startMarker, endMarker) {
  const src = readFileSync(file, 'utf8');
  const a = src.indexOf(startMarker);
  const b = src.indexOf(endMarker, a);
  if (a < 0 || b < 0) {
    throw new Error(`CANNOT MEASURE: ${file} no longer contains ${JSON.stringify(startMarker)} `
      + `followed by ${JSON.stringify(endMarker)} — the anti-drift gate has lost its slice and `
      + 'would otherwise pass vacuously.');
  }
  // ⚠ INTERPOLATIONS ARE REMOVED, NOT EXTRACTED. `${one ? 'binds' : 'bind'}`
  // carries BOTH arms of a ternary; keeping them would demand that the singular
  // sentence contain the plural words too. Removing the `${…}` spans leaves
  // exactly the text that is the same whatever the ids are.
  const body = src.slice(a, b).replace(/\$\{[^{}]*\}/g, ' ');
  const out = [];
  for (const m of body.matchAll(/`([^`]*)`/g)) out.push(...m[1].split(' '));
  for (const m of body.matchAll(/'((?:[^'\\]|\\.)*)'/g)) out.push(m[1].replace(/\\'/g, "'"));
  // 8 chars: long enough that a fragment is a PHRASE rather than a word like
  // `binds` that appears everywhere, short enough to keep every seam of the
  // concatenation ("` naming a `" is 10).
  return [...new Set(out.filter((s) => s.length >= 8))];
}

// ═══════════════════════════════════════════════════════════════════════════
// IN-PAGE MEASUREMENTS
// ═══════════════════════════════════════════════════════════════════════════

/** The ONE button carrying this accessible label, or a throw naming the label. */
const BUTTON_BY_LABEL = (label) => aimOne(
  `<button> with aria-label ${JSON.stringify(label)}`,
  'the Effects column (IconButton puts its `label` on aria-label AND title)',
  `document.querySelectorAll(${JSON.stringify(`button[aria-label="${label}"]`)})`);

/**
 * A CONTROL, as the author meets it: is it there, is it painted, can it be hit,
 * and is it greyed. `disabled` is the app's own property, not a colour guess.
 */
const CONTROL_REPORT = (selectorExpr) => String.raw`
(() => {
  const el = ${selectorExpr};
  el.scrollIntoView({ block: 'center' });
  const b = el.getBoundingClientRect();
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  return {
    label: el.getAttribute('aria-label'),
    disabled: el.disabled === true,
    rects: el.getClientRects().length,
    visible: typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
    // STRICT: the point must land ON the control or on something INSIDE it.
    // An ancestor catching the point means something is over the button.
    hitIsControl: !!(hit && (hit === el || el.contains(hit))),
    hitTag: hit ? (hit.getAttribute('aria-label') || hit.tagName) : null,
    rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
  };
})()`;

/**
 * A SENTENCE, measured twice on purpose.
 *
 * `domNodes` counts elements whose **textContent** contains it — hidden text
 * included. That is the number that tells a collapsed-disclosure row whether
 * the words are merely off screen or not in the document at all, and it is
 * NEVER what "is on screen" is asserted on.
 *
 * The rest is the painted leaf: the innermost element carrying the text, its
 * boxes, `checkVisibility`, a STRICT hit test at its own centre, and its
 * document position relative to the control it is about.
 */
const SENTENCE_REPORT = (needle, anchorExpr) => String.raw`
(() => {
  const needle = ${JSON.stringify(needle)};
  const all = [...document.querySelectorAll('*')]
    .filter((e) => (e.textContent || '').includes(needle));
  const leaves = all.filter((e) =>
    ![...e.children].some((k) => (k.textContent || '').includes(needle)));
  const leaf = leaves[0] || null;
  if (!leaf) return { domNodes: all.length, leaf: false, leaves: 0 };
  const anchor = ${anchorExpr};
  leaf.scrollIntoView({ block: 'center' });
  const b = leaf.getBoundingClientRect();
  const hit = document.elementFromPoint(
    Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
  const text = (leaf.textContent || '').trim();
  return {
    domNodes: all.length, leaf: true, leaves: leaves.length,
    exact: text === needle,
    text: text.slice(0, 400),
    rects: leaf.getClientRects().length,
    visible: typeof leaf.checkVisibility === 'function'
      ? leaf.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
    hitIsLeaf: !!(hit && (hit === leaf || leaf.contains(hit))),
    hitTag: hit ? hit.tagName : null,
    afterControl: (anchor.compareDocumentPosition(leaf) & 4) === 4,
    rect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
  };
})()`;

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
  console.log('=== delete-refusal-onscreen harness ===');
  console.log(`    node        : ${process.version}`);
  console.log(`    run root    : ${RUN.root}  borrowed=${RUN.borrowed === true}`);
  console.log(`    electron    : ${ELECTRON}`);
  console.log(`    main bundle : ${MAIN}`);
  for (const [what, p] of [['electron binary', ELECTRON], ['renderer/main bundle', MAIN]]) {
    if (!existsSync(p)) throw new Error(`REFUSING: the ${what} the resolver named does not exist: ${p}`);
  }
  assertFreshBuild(RUN);

  // ── [fx] THE FIXTURE, PRINTED BEFORE ANY ROW ────────────────────────────
  //
  // The project under test is ANOTHER LANE'S WORKING TREE. A moved fixture must
  // be VISIBLE rather than silent, so this is a row and not a comment.
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
        + 'Every id below is DERIVED from the LIVE file, so the rows still measure the app — '
        + 'but the packets\' numbers were written against the vendored blob and a comparison '
        + 'with them is no longer like for like.');

  // ── The anti-drift slices, read BEFORE the app is launched ──────────────
  const PRESET_PROVIDER = `${ROOT}/src/renderer/providers/effects-preset.ts`;
  const SCENE_PROVIDER = `${ROOT}/src/renderer/providers/effects-aeon.ts`;
  const presetLiterals = regionBranchLiterals(PRESET_PROVIDER,
    'const binders = regionsBindingPreset', 'const bound = sectionsBindingPreset');
  const sceneLiterals = regionBranchLiterals(SCENE_PROVIDER,
    'const binders = regionsBindingScene', 'const bound = sectionsBindingScene');
  // The row word the sentence points at, read from source rather than typed —
  // it is asserted equal to `BINDING_LABELS.<kind>` by the node suite, and
  // reading it here keeps this file on the same side of that assertion.
  const rowWord = (file, name) => {
    const m = readFileSync(file, 'utf8').match(new RegExp(`export const ${name}\\s*=\\s*'([^']*)'`));
    if (!m) throw new Error(`CANNOT MEASURE: ${name} not found in ${file}`);
    return m[1];
  };
  const RASTER_ROW = rowWord(PRESET_PROVIDER, 'REGION_RASTER_BINDING_ROW');
  const SCENE_ROW = rowWord(SCENE_PROVIDER, 'REGION_SCENE_BINDING_ROW');
  note('row words read from source', `raster=${JSON.stringify(RASTER_ROW)} scene=${JSON.stringify(SCENE_ROW)}`);

  /** The one-region sentence, with every variable part supplied by the caller. */
  const oneRegionSentence = (regionId, docId, row) =>
    `Region ${regionId} binds "${docId}". Deleting it would leave that binding naming a `
    + 'document that does not exist, and aeon\'s build refuses that by name. Select that region '
    + `in the Regions panel and use "revert to inherited" on its ${row} row, under Bindings, first.`;

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

    // ⚠ localStorage HOLDS THE PERSISTED DISCLOSURE STATE (shell/panel-state).
    // `defaultCollapsed` is only the ARRIVAL state and a previous run's click
    // would override it in either direction — which is exactly the state
    // [p3]/[s3] are about. Cleared, then reloaded, so those rows measure what
    // an author who has never touched these sections meets.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    if (!(await waitDbg())) throw new Error('no __dbg after reload');
    check('0a', 'window.__dbg.aeon exists (this is a VITE_AURORA_DEBUG=1 build) and storage is cleared',
      true, 'localStorage.clear() + Page.reload — the disclosure state below is the ARRIVAL state');

    // ── 1. THE ACT ────────────────────────────────────────────────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'the LIVE aeon project is open, on the act both packets name',
      !!(st && st.open) && st.zone === 'ojz' && st.act === 'act1', JSON.stringify(st));
    if (!st || !st.open) throw new Error('project did not open — nothing below can measure anything');
    await sleep(2000);

    const reg = await c.json('window.__dbg.aeon.regions()');
    check('1b', 'the act is in REGION MODE with a READABLE regions.json — both guards\' region arm',
      reg.kind === 'open' && reg.count > 0 && reg.actId === 'act1',
      `${JSON.stringify(reg)} — kind must be 'open': 'none' takes the SECTION arm and 'refused' `
      + 'takes the cannot-tell arm, and neither speaks the sentence these rows expect');
    if (reg.kind !== 'open') throw new Error(`regions kind = ${reg.kind}; the region arm is unreachable`);

    const doc = await c.json('window.__dbg.aeon.regionsDocument()');
    const presets = await c.json('window.__dbg.aeon.presets()');
    const scenes = await c.json('window.__dbg.aeon.scenes()');

    // Section sidecars, read off the running app. A sidecar that still carries a
    // ref would APPEND a second clause to the sentence, so the expectation
    // below is only correct while these are empty — which is a measurement, not
    // an assumption (the packets say aeon's own act has them all null).
    const sidecars = [];
    for (let i = 0; i < 16; i++) {
      const r = await c.evalExpr(`JSON.stringify([window.__dbg.aeon.rasterRef(${i}), window.__dbg.aeon.sceneRef(${i})])`);
      const [rr, sr] = JSON.parse(r);
      if (rr !== null || sr !== null) sidecars.push({ i, rasterRef: rr, sceneRef: sr });
    }
    check('1c', 'every section sidecar rasterRef/sceneRef is null — the sentence has ONE clause',
      sidecars.length === 0,
      sidecars.length === 0
        ? `${st.sections} section(s) on the act, none carrying a ref`
        : `⚠ SIDECARS CARRY REFS: ${JSON.stringify(sidecars)} — a document named by one of these `
          + 'gets a SECOND clause appended and the exact-text rows below would be wrong about the '
          + 'app rather than about the guard');

    // ── DERIVING THE FOUR SUBJECTS FROM THE FIXTURE ───────────────────────
    //
    // Nothing here is typed. `sec5`/`sec4` are what the packets measured on
    // 2026-09-17; this run finds whichever region row binds whichever document.
    const binders = (field, id) => {
      const out = [];
      for (const r of doc.regions) {
        const v = (r[field] ?? null);
        if (v === id && !out.includes(r.id)) out.push(r.id);
      }
      return out;
    };
    const pickBound = (field, library) => {
      for (const d of library) {
        const b = binders(field, d.id);
        if (b.length === 1) return { id: d.id, region: b[0] };
      }
      return null;
    };
    const pickFree = (field, library) =>
      library.find((d) => binders(field, d.id).length === 0) ?? null;

    const boundPreset = pickBound('rasterRef', presets);
    const freePreset = pickFree('rasterRef', presets);
    check('1d', 'the fixture yields BOTH preset subjects: one exactly one region binds, one none does',
      boundPreset !== null && freePreset !== null,
      `bound = ${JSON.stringify(boundPreset)}; free = ${freePreset?.id ?? 'NONE'}; `
      + `library = ${JSON.stringify(presets.map((p) => p.id))}`);
    if (!boundPreset || !freePreset) throw new Error('the preset subjects could not be derived');

    const boundScene = pickBound('sceneRef', scenes);
    check('1e', 'the fixture yields the bound SCENE subject: one exactly one region binds',
      boundScene !== null,
      `bound = ${JSON.stringify(boundScene)}; library = ${JSON.stringify(scenes.map((s) => s.id))}; `
      + `regions binding a scene = ${JSON.stringify(doc.regions.filter((r) => (r.sceneRef ?? null) !== null).map((r) => r.id))}`);
    if (!boundScene) throw new Error('the bound scene subject could not be derived');

    const PRESET_SENTENCE = oneRegionSentence(boundPreset.region, boundPreset.id, RASTER_ROW);
    const SCENE_SENTENCE = oneRegionSentence(boundScene.region, boundScene.id, SCENE_ROW);

    // ── [dp]/[ds] THE ANTI-DRIFT GATE ─────────────────────────────────────
    const missingP = presetLiterals.filter((f) => !PRESET_SENTENCE.includes(f));
    check('dp', 'ANTI-DRIFT: every literal of the provider\'s region-binder branch is in the expected PRESET sentence',
      presetLiterals.length >= 4 && missingP.length === 0,
      `${presetLiterals.length} fragment(s) from ${PRESET_PROVIDER}`
      + (missingP.length ? `\n        NOT IN THE EXPECTED SENTENCE: ${JSON.stringify(missingP)}`
        : `\n        e.g. ${JSON.stringify(presetLiterals.slice(0, 3))}`));
    const missingS = sceneLiterals.filter((f) => !SCENE_SENTENCE.includes(f));
    check('ds', 'ANTI-DRIFT: every literal of the provider\'s region-binder branch is in the expected SCENE sentence',
      sceneLiterals.length >= 4 && missingS.length === 0,
      `${sceneLiterals.length} fragment(s) from ${SCENE_PROVIDER}`
      + (missingS.length ? `\n        NOT IN THE EXPECTED SENTENCE: ${JSON.stringify(missingS)}`
        : `\n        e.g. ${JSON.stringify(sceneLiterals.slice(0, 3))}`));

    // ── 2. THE EFFECTS FACET ──────────────────────────────────────────────
    await c.evalExpr(`(() => { const b = ${aimOne('the Effects facet pill',
      'the workspace facet bar',
      `[...document.querySelectorAll('button')].filter((e) => (e.textContent || '').trim() === 'Effects')`)};
      b.click(); return 'ok'; })()`);
    await sleep(1500);

    // ══════════════════════════════════════════════════════════════════════
    // THE PRESET PANEL  (Effects > Colour > Raster band presets)
    // ══════════════════════════════════════════════════════════════════════
    await c.evalExpr(showSubTabOrThrow(PRESET_TAB));
    await sleep(1200);
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(boundPreset.id)})`);
    await sleep(900);

    const pLabel = `Delete preset ${boundPreset.id}`;
    const pCollapsedBefore = await c.evalExpr(SECTION_COLLAPSED_ATTR(PRESET_SECTION));
    const pCtl = await c.json(CONTROL_REPORT(BUTTON_BY_LABEL(pLabel)));
    check('p1', `the Delete control for a REGION-BOUND preset is PAINTED, hit-testable and GREYED`,
      pCtl.disabled === true && pCtl.rects > 0 && pCtl.visible !== false && pCtl.hitIsControl === true,
      `region ${boundPreset.region} binds "${boundPreset.id}" (derived from ${REGIONS_REL}); `
      + `${JSON.stringify(pCtl)}`);

    // ── [p3] THE TAGGED FINDING, BOTH PACKETS ─────────────────────────────
    const pHidden = await c.json(SENTENCE_REPORT(PRESET_SENTENCE, BUTTON_BY_LABEL(pLabel)));
    check('p3', 'AS IT ARRIVES: the greyed Delete is on screen and its REASON IS NOT — not even in the DOM',
      pCollapsedBefore === 'true' && pHidden.leaf === false && pHidden.domNodes === 0
      && pCtl.rects > 0 && pCtl.hitIsControl === true,
      `[data-section="${PRESET_SECTION}"] data-section-collapsed=${JSON.stringify(pCollapsedBefore)}; `
      + `sentence: ${JSON.stringify(pHidden)}\n        `
      + 'domNodes counts elements whose TEXTCONTENT (hidden text included) holds the sentence. '
      + '0 is STRONGER than the packets\' "no client rects": CollapsibleSection renders '
      + '`{!collapsed && children}`, so there is no element to ask checkVisibility() of. '
      + 'An author meets a greyed button with NO reason beside it.');

    // ── [p4] one click, and the same sentence is painted ──────────────────
    const pOpened = await c.evalExpr(openSectionOrThrow(PRESET_SECTION));
    await sleep(900);
    const pShown = await c.json(SENTENCE_REPORT(PRESET_SENTENCE, BUTTON_BY_LABEL(pLabel)));
    check('p4', 'AFTER EXPANDING: the reason is PAINTED under the control and reads the packet\'s sentence',
      pShown.leaf === true && pShown.exact === true && pShown.rects > 0
      && pShown.visible === true && pShown.hitIsLeaf === true && pShown.afterControl === true,
      `section open → ${pOpened}; ${JSON.stringify(pShown)}\n        `
      + `EXPECTED: ${JSON.stringify(PRESET_SENTENCE)}`);

    // ── [p2] THE ANTI-VACUOUS FLOOR ───────────────────────────────────────
    //
    // Without this, "Delete was disabled" is equally true of a panel that
    // disables every control and of one that renders nothing at all.
    await c.evalExpr(`window.__dbg.aeon.selectPreset(${JSON.stringify(freePreset.id)})`);
    await sleep(900);
    const fLabel = `Delete preset ${freePreset.id}`;
    const fCtl = await c.json(CONTROL_REPORT(BUTTON_BY_LABEL(fLabel)));
    const fHint = await c.json(SENTENCE_REPORT('Deleting it would leave', BUTTON_BY_LABEL(fLabel)));
    check('p2', 'ANTI-VACUOUS FLOOR: the SAME control for a preset NO region binds is ENABLED, with no reason painted',
      fCtl.disabled === false && fCtl.rects > 0 && fCtl.visible !== false && fCtl.hitIsControl === true
      && fHint.leaf === false,
      `"${freePreset.id}" is bound by no region and by no sidecar; ${JSON.stringify(fCtl)}\n        `
      + `refusal text present? ${JSON.stringify(fHint)} — NOT CLICKED: an enabled Delete on the `
      + 'live aeon tree is never pressed by this run');

    await shot(c, 'preset-expanded');

    // ══════════════════════════════════════════════════════════════════════
    // THE SCENE PANEL  (Effects > Parallax > Scene: <id>)
    // ══════════════════════════════════════════════════════════════════════
    await c.evalExpr(showSubTabOrThrow(SCENE_TAB));
    await sleep(1200);
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(boundScene.id)})`);
    await sleep(900);

    const sLabel = `Delete scene ${boundScene.id}`;
    const sCollapsedBefore = await c.evalExpr(SECTION_COLLAPSED_ATTR(SCENE_SECTION));
    const sCtl = await c.json(CONTROL_REPORT(BUTTON_BY_LABEL(sLabel)));
    check('s1', 'the Delete control for a REGION-BOUND scene is PAINTED, hit-testable and GREYED',
      sCtl.disabled === true && sCtl.rects > 0 && sCtl.visible !== false && sCtl.hitIsControl === true,
      `region ${boundScene.region} binds "${boundScene.id}" (derived from ${REGIONS_REL}); `
      + `${JSON.stringify(sCtl)}`);

    const sHidden = await c.json(SENTENCE_REPORT(SCENE_SENTENCE, BUTTON_BY_LABEL(sLabel)));
    check('s3', 'AS IT ARRIVES: the greyed Delete is on screen and its REASON IS NOT — not even in the DOM',
      sCollapsedBefore === 'true' && sHidden.leaf === false && sHidden.domNodes === 0
      && sCtl.rects > 0 && sCtl.hitIsControl === true,
      `[data-section="${SCENE_SECTION}"] data-section-collapsed=${JSON.stringify(sCollapsedBefore)}; `
      + `sentence: ${JSON.stringify(sHidden)}`);

    const sOpened = await c.evalExpr(openSectionOrThrow(SCENE_SECTION));
    await sleep(900);
    const sShown = await c.json(SENTENCE_REPORT(SCENE_SENTENCE, BUTTON_BY_LABEL(sLabel)));
    check('s4', 'AFTER EXPANDING: the reason is PAINTED under the control and reads the packet\'s sentence',
      sShown.leaf === true && sShown.exact === true && sShown.rects > 0
      && sShown.visible === true && sShown.hitIsLeaf === true && sShown.afterControl === true,
      `section open → ${sOpened}; ${JSON.stringify(sShown)}\n        `
      + `EXPECTED: ${JSON.stringify(SCENE_SENTENCE)}`);

    // ── [s0] THE SCENE-SIDE FLOOR HAS NO SUBJECT ON DISK ──────────────────
    //
    // All four of this act's scene documents are bound by a region (the packet
    // says so and [s0] re-measures it), so the enabled half cannot be shown
    // with a shipped file. One is CREATED IN THE SESSION, through the panel's
    // own control, and never saved.
    const freeScene = pickFree('sceneRef', scenes);
    note('scene-side floor',
      freeScene === null
        ? `all ${scenes.length} shipped scene(s) are region-bound — creating "${BORN_SCENE}" in the SESSION`
        : `"${freeScene.id}" is unbound on disk; "${BORN_SCENE}" is created anyway so the row is `
          + 'the same shape in both worlds');
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
    await sleep(1200);
    const scenes2 = await c.json('window.__dbg.aeon.scenes()');
    const born = scenes2.some((s) => s.id === BORN_SCENE);
    const bornBinders = binders('sceneRef', BORN_SCENE);
    check('s0', 'a scene NO region binds exists to measure — created in the SESSION, never saved',
      born && bornBinders.length === 0,
      `scenes now ${JSON.stringify(scenes2.map((s) => s.id))}; regions binding "${BORN_SCENE}": `
      + `${JSON.stringify(bornBinders)}; selected = ${await c.evalExpr('window.__dbg.aeon.selectedScene()')}`);
    if (!born) throw new Error(`"${BORN_SCENE}" was not created — the scene-side floor has no subject`);

    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(BORN_SCENE)})`);
    await sleep(900);
    const bLabel = `Delete scene ${BORN_SCENE}`;
    const bCtl = await c.json(CONTROL_REPORT(BUTTON_BY_LABEL(bLabel)));
    const bHint = await c.json(SENTENCE_REPORT('Deleting it would leave', BUTTON_BY_LABEL(bLabel)));
    check('s2', 'ANTI-VACUOUS FLOOR: the SAME control for a scene NO region binds is ENABLED, with no reason painted',
      bCtl.disabled === false && bCtl.rects > 0 && bCtl.visible !== false && bCtl.hitIsControl === true
      && bHint.leaf === false,
      `${JSON.stringify(bCtl)}\n        refusal text present? ${JSON.stringify(bHint)} — `
      + 'NOT CLICKED, and never saved');

    await shot(c, 'scene-expanded');
  } finally {
    try { c && c.close(); } catch { /* closing a dead socket is not a result */ }
    await killTree(child);
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${'═'.repeat(72)}`);
  console.log(`${pass}/${results.length} rows passed · ${fails.length} failed · `
    + `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (fails.length) {
    console.log('FAILING:');
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(fails.length ? 1 : 0);
}

async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-delete-refusal/${name}.png`);
}

main().catch((e) => {
  console.error(`\nHARNESS ABORTED: ${e.message}`);
  console.error(`  ${results.filter((r) => r.ok).length}/${results.length} rows had run — `
    + 'this is NOT a pass over the rows that never ran.');
  process.exit(2);
});
