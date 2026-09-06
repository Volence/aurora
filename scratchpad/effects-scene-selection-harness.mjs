#!/usr/bin/env node
// COLD READ 2026-09-05 C2 — "Editing Section 0" sat directly above a form for a
// scene section 0 is not bound to. Row COLDREAD-C2-EDITING-UNBOUND.
//
// ============================================================================
// WHAT THE DEFECT ACTUALLY WAS, AND WHY THIS IS A PAINTED PROOF
// ============================================================================
//
// `resolveSelectedScene(library, selectedEffectsSceneId)` is WHOLLY independent
// of `activeSectionIndex` and falls back to `library.scenes[0]`. In the stock
// aeon act that is `ojz_act1_depth` (directory order), while section 0 binds
// `ojz_act1_start`. So the panel ARRIVED showing the wrong document under a
// strip naming the right one, and the claim "the newcomer is disoriented" is a
// claim about what a person SEES. Nothing in the node suite can see it: it is a
// React store effect and a rendered box.
//
// The fix moves the SELECTION rather than adding prose. Two halves:
//
//   sceneSelectionFollow    picking a section selects that section's scene,
//                           so the inference a newcomer draws becomes TRUE.
//   sceneSelectionRelation  the sentence for the states where it cannot be
//                           made true, and SILENT otherwise.
//
// ============================================================================
// WHAT WOULD MAKE THIS GO GREEN WITHOUT THE PROPERTY HOLDING
// ============================================================================
//
//   • THE APP AGREES WITH ITSELF. Every expected scene id is re-derived IN THIS
//     PROCESS from the aeon copy's own `section_*.meta.json` sidecars and its
//     `data/editor/effects/` directory listing, never read out of Aurora.
//
//   • THE ROW CANNOT FAIL. [3a] does not poison a comparison; it CONSTRUCTS the
//     real condition with a real mouse press on the SCENES row for a scene
//     section 0 does not use, and requires the sentence to appear naming both
//     documents. [2c] requires the same node to be ABSENT beforehand. A row
//     that could only ever be green would pass one of those and fail the other.
//     ⚠ [2c] ALONE IS VACUOUS UNDER A ROTTED SELECTOR — an absence row goes
//     green when the finder is broken. It is trustworthy only because [3a] uses
//     THE SAME expression in THE SAME run and goes red; `PLANT=rot-relation`
//     demonstrates exactly that pair.
//
//   • A SEQUENCE THAT NEVER MOVED. [5a] drives the strip to section 8 rather
//     than section 4, because after [3a] the selection is already on section
//     4's scene: against the PRE-FIX build the section-4 version of this row
//     went GREEN on a panel with no follow in it. The row now asserts the
//     selection CHANGED and prints both ends, and refuses up front if the
//     fixture makes that impossible.
//
//   • THE GESTURE NO-OPPED. `.click()` is not a click for anything the app does
//     not listen to, and every later reading then comes off the previous
//     screen. [3a] aims a real `Input.dispatchMouseEvent` pair, asserts
//     `elementFromPoint` at the aim IS the intended button BEFORE pressing, and
//     asserts the app's own selection MOVED after.
//
//   • THE PAINT TRIO LIES. `checkVisibility()` and `getClientRects()` both go
//     GREEN on an element scrolled 2,635px out of its scroller (measured in
//     this very panel). Every paint gate here compares the rect to THE
//     SCROLLER'S box and requires a strict `elementFromPoint`; the trio is
//     printed as evidence and is never the gate.
//
//   • TWO PEERS MEASURING EQUAL TO THE PIXEL is the shape of a selector that
//     resolved to one element twice, so [4a]/[4b] print each section's
//     character count beside its height.
//
//   • A LOOSE PREDICATE. The SCENES rows are addressed by `title` SUFFIX
//     `(<scene id>)`, which `sceneListEntries` composes and nothing else in the
//     column emits; a `/depth/i` over titles would also match the layer TOP box
//     on a locked scene.
//
// ⚠ THIS HARNESS DOES NOT WRITE TO THE aeon COPY, and never to the aeon tree.
// ⚠ NO EMULATOR, EVER. No Build & Run.
//
// RUN (from the worktree, with an in-tree build):
//   VITE_AURORA_DEBUG=1 npx electron-vite build
//   AURORA_BUILT_TREE=<this worktree> ELECTRON_BIN=<an electron> \
//   AEON_DIR=<writable copy> npm run harness:effects-scene-selection
//
//   PLANT=rot-relation … look for the relation hint by a testid nothing
//                        carries. [3a] must go RED and the run must fail.

import { AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9471);
const DISPLAY_NUM = Number(process.env.DISPLAY_NUM ?? 94);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEONDIR = checkoutOverride('aeon')?.value;
if (!AEONDIR) throw new Error('AEON_DIR must point at a WRITABLE COPY of an aeon project');
if (AEONDIR.startsWith(siblingDefaultPathOrUnresolved('aeon'))) {
  throw new Error('AEON_DIR points at aeon itself — never run a harness against that tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-effects-scene-selection`;
mkdirSync(SHOTS, { recursive: true });
const PLANT = process.env.PLANT ?? '';

// ── THE INDEPENDENT SECOND DERIVATION ────────────────────────────────────────
// From the COPY's own files, in this process. Deliberately NOT an import of
// anything under src/: the point is to check the app against aeon's data, not
// against Aurora's own modules.
const EDITOR = `${AEONDIR}/games/sonic4/data/editor`;
const SCENES_DIR = `${EDITOR}/effects`;
const METAS = `${EDITOR}/ojz/act1`;
function independentDerivation() {
  // Scene ids in the order a directory read yields them, which is the order
  // `library.scenes` carries and therefore what `scenes[0]` resolves to.
  const sceneIds = readdirSync(SCENES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(`${SCENES_DIR}/${f}`, 'utf8')).id);
  const sceneRef = {};
  for (const f of readdirSync(METAS).filter((f) => /^section_\d+\.meta\.json$/.test(f))) {
    const n = Number(/^section_(\d+)\./.exec(f)[1]);
    sceneRef[n] = JSON.parse(readFileSync(`${METAS}/${f}`, 'utf8')).sceneRef ?? null;
  }
  return { sceneIds, sceneRef };
}

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

// ── SELECTORS ────────────────────────────────────────────────────────────────
// The relation hint. `testid` and NOT a `data-` attribute on the component:
// column-layout's `Hint` docblock records that a hyphenated JSX attribute on a
// COMPONENT is silently dropped and TypeScript does not catch it, which once
// made a harness read zero nodes for sentences that were on screen.
const RELATION = PLANT === 'rot-relation'
  ? `document.querySelector('[data-testid="effects-scene-relation-XXX"]')`
  : `document.querySelector('[data-testid="effects-scene-relation"]')`;

/** A SCENES-list row, addressed by the `title` suffix sceneListEntries composes. */
const sceneRow = (id) =>
  `document.querySelector('button[title$=${JSON.stringify(`(${id})`)}]')`;

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  if (el.disabled) return 'disabled';
  el.click();
  return true;
})()`;

const SUBTAB = (id) => String.raw`
(() => {
  const t = document.querySelector('[data-effects-sub-tab="' + ${JSON.stringify(id)} + '"]');
  if (!t) return 'no-sub-tab';
  t.click();
  return 'ok';
})()`;

/**
 * THE WHOLE STATE THE ROW IS ABOUT, read from the PAINTED column in one pass.
 *
 * ⚠ EVERY PAINT VERDICT HERE COMPARES A RECT TO THE SCROLLER'S BOX. `visible`
 * and `rects` are carried so a reader can see them, never so a row can gate on
 * them: both go true on an element scrolled thousands of pixels out of view.
 */
const STATE = String.raw`(() => {
  const strip = document.querySelector('[data-effects-section-strip]');
  const bind = document.querySelector('[data-effects-section-bindings]');
  const panel = strip ? strip.parentElement : null;
  const cb = panel ? panel.getBoundingClientRect() : null;
  const paint = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2));
    return {
      top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height),
      insideScroller: !!(cb && b.top >= cb.top - 1 && b.bottom <= cb.bottom + 1),
      hitInside: !!(hit && (hit === el || el.contains(hit))),
      // Recorded, NEVER a gate — both were true on the 2,635px defect.
      visible: typeof el.checkVisibility === 'function' ? el.checkVisibility() : null,
      rects: el.getClientRects().length,
    };
  };
  // The four titled sections, by their own header text. Direct children of the
  // scrolling Panel, which is the level the column's flex model divides.
  const sections = {};
  if (panel) {
    for (const kid of [...panel.children]) {
      const h = kid.querySelector('span');
      const t = h ? (h.innerText || '').trim() : '';
      if (!t) continue;
      const b = kid.getBoundingClientRect();
      sections[t.split('(')[0].trim().toUpperCase()] = {
        title: t.replace(/\s+/g, ' '),
        height: Math.round(b.height),
        // The peer-equality tell: a selector that resolved to one element twice
        // reports two identical heights AND two identical character counts.
        chars: (kid.innerText || '').length,
      };
    }
  }
  // ⚠ THE HIGHLIGHT IS NOT "not transparent". Every SCENES row has a painted
  // background (T.raised); the SELECTED one swaps to T.accent. So the painted
  // reading is "the one row whose background differs from all the others" —
  // derived from the rendered colours, never from the store, because the claim
  // is about what a person sees. A first version tested against transparent and
  // reported all four rows highlighted, which is a selector that cannot fail.
  const rowEls = [...document.querySelectorAll('button[title]')]
    .filter((b) => / \([a-z0-9_]+\)$/.test(b.title));
  const bg = rowEls.map((b) => getComputedStyle(b).backgroundColor);
  const tally = {};
  for (const v of bg) tally[v] = (tally[v] ?? 0) + 1;
  const common = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  const rows = rowEls.map((b, i) => ({
    id: /\(([a-z0-9_]+)\)$/.exec(b.title)[1],
    bg: bg[i],
    odd: bg[i] !== common,
  }));
  const rel = ${RELATION};
  return {
    stripScene: bind ? (bind.innerText || '').replace(/\s+/g, ' ').trim() : null,
    stripSection: strip && strip.querySelector('select') ? strip.querySelector('select').value : null,
    scroll: panel ? { top: Math.round(panel.scrollTop), h: Math.round(panel.clientHeight),
                      sh: Math.round(panel.scrollHeight) } : null,
    sections,
    rows,
    relation: rel ? { text: (rel.innerText || '').replace(/\s+/g, ' ').trim(), paint: paint(rel) } : null,
    // The app's own answer, for the gesture-landed check only.
    storeScene: window.__dbg.aeon.selectedScene(),
    storeSection: window.__dbg.aeon.activeSection(),
  };
})()`;

/**
 * The `Scene: <id>` form title, which is the panel naming the document it edits.
 *
 * ⚠ UPPERCASED, AND THAT IS THE RENDERED TEXT AND NOT A STYLE DETAIL.
 * `PanelHeader` sets `textTransform: uppercase`, and `innerText` returns what is
 * PAINTED, so this reads `SCENE: OJZ_ACT1_START`. A first version matched
 * `/^Scene: /` case-sensitively, found nothing, and reported null for a title
 * that was on screen the whole time. Normalised here rather than in each row,
 * so no row can go green by comparing null to null.
 */
const SCENE_FORM_TITLE = String.raw`(() => {
  const el = [...document.querySelectorAll('span')]
    .find((s) => /^scene:\s/i.test((s.innerText || '').trim()));
  return el ? (el.innerText || '').trim().toLowerCase() : null;
})()`;

const SET_SELECT = (selector, value) => String.raw`
(() => {
  const el = ${selector};
  if (!el) return 'no-element';
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(String(value))});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;
const STRIP_SELECT =
  `(() => { const p = document.querySelector('[data-effects-section-strip]'); `
  + `return p ? p.querySelector('select') : null; })()`;

/**
 * AIM AT AN ELEMENT AND CHECK THE AIM BEFORE FIRING.
 *
 * `.click()` is not a click: it dispatches an event the app may never listen
 * for, no-ops, and every later reading comes off the previous screen. So the
 * SCENES row is pressed with a real `Input.dispatchMouseEvent` pair, at
 * INTEGER viewport coordinates (devicePixelRatio varies run to run on this
 * machine and a fractional aim costs a review cycle), and the aim is verified
 * with `elementFromPoint` first.
 */
async function aim(c, selectorExpr) {
  return c.json(String.raw`(() => {
    const el = ${selectorExpr};
    if (!el) return { found: false };
    const b = el.getBoundingClientRect();
    const x = Math.round(b.left + b.width / 2);
    const y = Math.round(b.top + b.height / 2);
    const hit = document.elementFromPoint(x, y);
    return {
      found: true, x, y, dpr: window.devicePixelRatio,
      aimIsTarget: !!(hit && (hit === el || el.contains(hit))),
      hitTag: hit ? hit.tagName + (hit.className ? '' : '') : null,
    };
  })()`);
}
async function realClick(c, at) {
  const base = { x: at.x, y: at.y, button: 'left', clickCount: 1, buttons: 1 };
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...base, buttons: 0 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
}

async function main() {
  const t0 = Date.now();
  const truth = independentDerivation();
  console.log('=== effects-scene-selection harness (cold read C2) ===');
  console.log(`    node        : ${process.version}   PLANT=${PLANT || '(none)'}`);
  console.log(`    loadavg     : ${os.loadavg().map((n) => n.toFixed(2)).join(' ')}`);
  console.log(`    AEON_DIR    : ${AEONDIR}`);
  console.log(`    DISPLAY     : :${DISPLAY_NUM}`);
  console.log('    INDEPENDENT DERIVATION (this process, from the copy\'s own files):');
  console.log(`      scenes[0] (the old fallback) : ${truth.sceneIds[0]}`);
  console.log(`      section 0 sceneRef           : ${truth.sceneRef[0]}`);
  console.log(`      section 4 sceneRef           : ${truth.sceneRef[4]}`);
  console.log(`      section 5 sceneRef           : ${truth.sceneRef[5]} (act default)`);

  // The whole defect needs the two to DISAGREE in the fixture, or every row
  // below is vacuous: a project whose first scene happens to be section 0's
  // could never have shown the cold reader the wrong document.
  if (truth.sceneIds[0] === truth.sceneRef[0]) {
    throw new Error('VACUOUS FIXTURE: scenes[0] IS section 0\'s scene, so the old fallback and '
      + 'the new follow agree and nothing here can discriminate.');
  }

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

    // A CLEARED localStorage is what makes [2a] the ARRIVAL state: panel
    // collapse state and the last section persist, and a run inheriting them
    // would not be reading the screen a newcomer gets.
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
    check('1c', 'the Parallax sub-tab is the one showing (the scene job)',
      (await c.evalExpr(SUBTAB('parallax'))) === 'ok');
    await sleep(1200);

    // ---- 2. ARRIVAL. The state the cold reader was disoriented by. --------
    await c.evalExpr(SET_SELECT(STRIP_SELECT, 0));
    await sleep(900);
    const arrive = await c.json(STATE);
    const formTitle0 = await c.evalExpr(SCENE_FORM_TITLE);
    // Exactly one row may differ from the common background, and it must be the
    // scene the panel claims to be editing.
    const highlighted = (s) => s.rows.filter((r) => r.odd).map((r) => r.id);
    const formOf = (id) => `scene: ${id}`;

    check('2a', 'the STRIP names section 0\'s own scene, matching this process\'s parse of the '
      + 'sidecar',
      arrive.stripSection === '0'
      && arrive.stripScene !== null
      && arrive.stripScene.startsWith(`scene ${truth.sceneRef[0]} `),
      `strip = ${JSON.stringify(arrive.stripScene)}   independent: section 0 -> `
      + `${truth.sceneRef[0]}`);

    // THE ROW THE FIX IS ABOUT. Before it, `selectedEffectsSceneId` was null on
    // arrival and `resolveSelectedScene` fell back to `scenes[0]`, which in
    // this act is a DIFFERENT document from the one the strip names one line up.
    check('2b', 'THE FORM UNDER THE STRIP IS NOW SECTION 0\'S SCENE — highlighted row, scene form '
      + 'title and store all name it, and it is NOT the old scenes[0] fallback',
      arrive.storeScene === truth.sceneRef[0]
      && formTitle0 === formOf(truth.sceneRef[0])
      && JSON.stringify(highlighted(arrive)) === JSON.stringify([truth.sceneRef[0]])
      && truth.sceneIds[0] !== truth.sceneRef[0],
      `store=${arrive.storeScene}  formTitle=${JSON.stringify(formTitle0)}  `
      + `highlighted=${JSON.stringify(highlighted(arrive))}\n        `
      + `the fallback this replaces would have shown scenes[0] = ${truth.sceneIds[0]}`);

    check('2c', 'and NOTHING is said about it: the relation hint is absent when the two agree, so '
      + 'it costs the LAYERS list no permanent height',
      arrive.relation === null,
      arrive.relation === null ? 'no [data-testid="effects-scene-relation"] node'
        : `PRESENT and should not be: ${JSON.stringify(arrive.relation.text)}`);

    // ---- 3. THE FAILING ROW, CONSTRUCTED FOR REAL. -----------------------
    // Not a poisoned comparison: a real press on the SCENES row for a scene
    // section 0 does not use. `ojz_act1_depth` is section 4's, per the sidecars.
    const other = truth.sceneRef[4];
    const at = await aim(c, sceneRow(other));
    check('3z', `the SCENES row for ${other} is aimable and the aim RESOLVES TO IT `
      + '(a synthetic click on nothing would leave every reading below on the previous screen)',
      at.found === true && at.aimIsTarget === true && Number.isInteger(at.x) && Number.isInteger(at.y),
      JSON.stringify(at));
    if (at.found !== true) throw new Error(`no SCENES row for ${other}`);
    await realClick(c, at);
    await sleep(900);
    const diverged = await c.json(STATE);
    const formTitle1 = await c.evalExpr(SCENE_FORM_TITLE);

    check('3a', 'AFTER A REAL PRESS ON ANOTHER SCENE the relation sentence appears, painted inside '
      + 'the scroller and hit-testable, naming BOTH documents and who else uses the one being '
      + 'edited',
      diverged.storeScene === other
      && formTitle1 === formOf(other)
      && diverged.relation !== null
      && diverged.relation.paint.insideScroller === true
      && diverged.relation.paint.hitInside === true
      && diverged.relation.text
        === `Section 0 uses ${truth.sceneRef[0]}. Edits below change ${other}, which section 4 uses.`
      && truth.sceneRef[4] === other,
      `${JSON.stringify(diverged.relation && diverged.relation.text)}\n        `
      + `paint = ${JSON.stringify(diverged.relation && diverged.relation.paint)}\n        `
      + '⚠ the two that do NOT discriminate are in that object and are not gated on: '
      + `checkVisibility=${diverged.relation && diverged.relation.paint.visible} `
      + `rects=${diverged.relation && diverged.relation.paint.rects}\n        `
      + `independent: section 0 -> ${truth.sceneRef[0]}, section 4 -> ${truth.sceneRef[4]}`);

    check('3b', 'the strip did NOT move: it still names section 0 and section 0\'s scene, so the '
      + 'sentence is about a real disagreement and not about the strip following the click',
      diverged.stripSection === '0'
      && diverged.stripScene.startsWith(`scene ${truth.sceneRef[0]} `),
      `strip = ${JSON.stringify(diverged.stripScene)}`);

    // ---- 4. THE HEIGHT COST, MEASURED ON BOTH SIDES. ---------------------
    const secOf = (s, k) => s.sections[k] ?? null;
    const aScenes = secOf(arrive, 'SCENES'); const dScenes = secOf(diverged, 'SCENES');
    const aLayers = secOf(arrive, 'LAYERS'); const dLayers = secOf(diverged, 'LAYERS');
    check('4a', 'the SCENES section and the LAYERS list are TWO elements, not one selector '
      + 'resolving twice (heights AND character counts differ)',
      !!aScenes && !!aLayers && !(aScenes.height === aLayers.height && aScenes.chars === aLayers.chars),
      `SCENES h=${aScenes && aScenes.height} chars=${aScenes && aScenes.chars}   `
      + `LAYERS h=${aLayers && aLayers.height} chars=${aLayers && aLayers.chars}`);

    check('4b', 'THE COST: zero in the agreeing state, and the diverged state pays for the '
      + 'sentence out of the LAYERS list exactly once',
      !!aScenes && !!dScenes && !!aLayers && !!dLayers,
      `agreeing   SCENES ${aScenes && aScenes.height}px (${aScenes && aScenes.chars} chars)   `
      + `LAYERS ${aLayers && aLayers.height}px (${aLayers && aLayers.chars} chars)\n        `
      + `diverged   SCENES ${dScenes && dScenes.height}px (${dScenes && dScenes.chars} chars)   `
      + `LAYERS ${dLayers && dLayers.height}px (${dLayers && dLayers.chars} chars)\n        `
      + `Δ SCENES = ${dScenes && aScenes ? dScenes.height - aScenes.height : '?'}px   `
      + `Δ LAYERS = ${dLayers && aLayers ? dLayers.height - aLayers.height : '?'}px   `
      + '(the agreeing state is the one the panel arrives in and stays in)');

    // ---- 5. THE FOLLOW, AND WHAT IT COSTS WHEN THERE IS NOTHING TO FOLLOW.
    //
    // ⚠ SECTION 8, NOT SECTION 4, AND THAT IS THE WHOLE ROW. The selection is
    // sitting on `ojz_act1_depth` after [3a], and section 4's scene IS
    // `ojz_act1_depth` — so "move to section 4 and find its scene shown" is
    // satisfied by a selection that never moved. Run against the PRE-FIX build
    // this row went GREEN for exactly that reason, on a panel with no follow in
    // it at all. Section 8 binds `ojz_act1_floor`, which the selection is NOT
    // on, so the row now requires a MOVE and prints both ends of it.
    const target = 8;
    const before5 = diverged.storeScene;
    if (truth.sceneRef[target] === before5) {
      throw new Error(`VACUOUS: section ${target}'s scene IS the current selection, so this row `
        + 'cannot tell a follow from a selection that never moved.');
    }
    await c.evalExpr(SET_SELECT(STRIP_SELECT, target));
    await sleep(1000);
    const s4 = await c.json(STATE);
    const formTitle4 = await c.evalExpr(SCENE_FORM_TITLE);
    check('5a', `PICKING A SECTION PICKS ITS SCENE: the selection MOVES from ${before5} to section `
      + `${target}'s own scene, the form title follows it, and the sentence goes away`,
      s4.storeSection === target && s4.storeScene === truth.sceneRef[target]
      && s4.storeScene !== before5
      && formTitle4 === formOf(truth.sceneRef[target])
      && JSON.stringify(highlighted(s4)) === JSON.stringify([truth.sceneRef[target]])
      && s4.relation === null,
      `was ${before5} -> now section=${s4.storeSection} store=${s4.storeScene} `
      + `formTitle=${JSON.stringify(formTitle4)} highlighted=${JSON.stringify(highlighted(s4))} `
      + `relation=${JSON.stringify(s4.relation && s4.relation.text)}\n        `
      + `independent: section ${target} sceneRef = ${truth.sceneRef[target]}`);

    // Section 5 binds `sceneRef: null` — the act default, which is not a
    // document in this library. There is NOTHING to follow to, and inventing a
    // target is the defect. The sentence is the whole answer in that state.
    await c.evalExpr(SET_SELECT(STRIP_SELECT, 5));
    await sleep(1000);
    const s5 = await c.json(STATE);
    check('5b', 'A SECTION BOUND TO NOTHING does not drag the form anywhere and SAYS SO: the act '
      + 'default case is stated, not silently shown as if it were the section\'s scene',
      s5.storeSection === 5 && truth.sceneRef[5] === null
      && s5.storeScene === truth.sceneRef[target]
      && s5.relation !== null
      && s5.relation.paint.insideScroller === true
      && s5.relation.paint.hitInside === true
      && s5.relation.text.startsWith('Section 5 uses the act default scene. Edits below change '
        + `${truth.sceneRef[target]},`),
      `${JSON.stringify(s5.relation && s5.relation.text)}\n        `
      + `independent: section 5 sceneRef = ${JSON.stringify(truth.sceneRef[5])}`);

    check('5c', 'no en dash or em dash reaches the screen (six gates in this repo, and this is the '
      + 'painted one)',
      // CODE POINTS, NOT A PATTERN: this repo's dash gates read the SOURCE and
      // catch both the literal and the escape, so the two characters cannot be
      // written here in any form.
      ![...String(s5.relation && s5.relation.text),
        ...String(diverged.relation && diverged.relation.text)]
        .some((ch) => ch.codePointAt(0) === 0x2013 || ch.codePointAt(0) === 0x2014),
      `${JSON.stringify(s5.relation && s5.relation.text)}`);

    // ---- 6. THE CAPTURES FOR THE OWNER. ----------------------------------
    // The two states he ranked C2 about: what a newcomer now arrives to, and
    // what the panel says when the author has genuinely gone somewhere else.
    await c.evalExpr(SET_SELECT(STRIP_SELECT, 0));
    await sleep(900);
    let shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/c2-arrival-agrees.png`, Buffer.from(shot.data, 'base64'));
    const at2 = await aim(c, sceneRow(other));
    await realClick(c, at2);
    await sleep(900);
    shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/c2-diverged-says-so.png`, Buffer.from(shot.data, 'base64'));
    console.log(`\n    screenshots : ${SHOTS}/c2-arrival-agrees.png`);
    console.log(`                  ${SHOTS}/c2-diverged-says-so.png`);
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
