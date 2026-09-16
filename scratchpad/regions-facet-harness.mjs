/**
 * THE REGIONS FACET, ON SCREEN — editor spec §7 row 6's two named gates.
 *
 *   npm run build   # ⚠ VITE_AURORA_DEBUG=1, or there is no window.__dbg
 *   node scratchpad/regions-facet-harness.mjs
 *
 * FROM A LINKED WORKTREE you need all three, and the run PRINTS which tree
 * answered on its `root:` / `pinned:` / `in-tree:` lines — read them:
 *
 *   VITE_AURORA_DEBUG=1 npm run build
 *   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
 *   AURORA_BUILT_TREE=<this worktree>
 *
 * ELECTRON_BIN alone silently measures the MAIN checkout's dist/ while every
 * path in the output looks right.
 *
 * ═══ WHY THIS EXISTS WHEN THE NODE SUITE IS GREEN ═════════════════════════
 *
 * Aurora's ~9,900-row node suite cannot see React, cannot see a canvas and
 * cannot see a running app. `test/renderer/regions-panel.test.ts` proves the
 * DERIVATIONS are right; it cannot prove the app put any of them on screen, nor
 * that the facet appears, nor that arriving on it disarms the collision brush.
 * Those are this file's three subjects.
 *
 * ═══ THE TWO GATES §7 ROW 6 NAMES, AND HOW EACH IS KEPT NON-VACUOUS ═══════
 *
 * "panel snapshot: badge text differs per row" PASSES ON AN EMPTY LIST. Four
 * distinct strings out of zero nodes is `new Set([]).size === 0`, and a
 * `>= expected` phrasing would be green on a panel that rendered nothing at
 * all. So every badge row below is preceded by an INSTRUMENT row asserting the
 * panel had a subject: `__dbg.aeon.regions()` reports `kind: 'open'` with a
 * non-zero count, the DOM carries exactly that many region rows, and the badge
 * count is pinned to 4 rather than bounded below.
 *
 * "facet gating test" is the other absence-shaped one: "Regions does not appear
 * for classic" is what a broken build, an unopened project and a crashed
 * renderer all produce. So the classic half asserts the OTHER pills ARE there
 * in the same breath, and reports UNMEASURABLE — loudly, never green — if the
 * classic checkout is not on this machine.
 *
 * ═══ AND THE AIM: THE PROPERTY IS ABOUT TEXT ══════════════════════════════
 *
 * A guard can fire correctly on a violation and still be measuring the wrong
 * quantity — the precedent in this repo is a CDP row asserting on BOX GEOMETRY
 * for a property about TEXT. §7 row 6's property is the STRING each badge
 * renders, so every badge assertion below reads `textContent`. The boxes are
 * read too, but only as a SEPARATE non-vacuity claim (a `display: none` badge
 * has zero client rects and must not count as rendered text) — never as the
 * thing being asserted. The two are reported on different rows so neither can
 * stand in for the other.
 *
 * NO EMULATOR. Nothing here touches oracle or any ROM.
 */

import { AURORA_DIR, siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9421);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const ELECTRON = RUN.electron;
const MAIN = RUN.main;
const AEONDIR = siblingPathOrUnresolved('aeon');
const S1DIR = siblingPathOrUnresolved('s1disasm');
const SHOTS = `${ROOT}/scratchpad/shots-regions-facet`;
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── WHAT THE FACET DECLARES, PARSED FROM SOURCE ───────────────────────────
//
// The tool set is NOT typed here. A harness that retyped `['view']` would go
// green on its own copy the day the facet gained a tool — which is precisely
// the day the disambiguator's behaviour changes and somebody needs to know.
import { readFileSync } from 'node:fs';
const FACET_TOOLS_SRC = `${ROOT}/src/renderer/workspace/facet-tools.ts`;
function declaredTools(facet) {
  const src = readFileSync(FACET_TOOLS_SRC, 'utf8');
  const m = src.match(new RegExp(`^\\s*${facet}:\\s*\\[([^\\]]*)\\]`, 'm'));
  if (!m) throw new Error(`CANNOT MEASURE: FACET_TOOLS.${facet} not found in ${FACET_TOOLS_SRC}`);
  const ids = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (ids.length === 0) throw new Error(`CANNOT MEASURE: FACET_TOOLS.${facet} parsed to nothing`);
  return ids;
}
// ── THE ACT ROW'S SENTENCE, ALSO PARSED FROM SOURCE ───────────────────────
//
// Same reason as the tool set above, and it is the harder half of the 2026-09-16
// CALL 3 row: a sentence RETYPED here would go green against a panel showing
// different words, and the property is "these exact words are on screen". The
// provider holds one definition (`ACT_ROW_NOTE`); this reads it.
const PROVIDER_SRC = `${ROOT}/src/renderer/providers/regions-aeon.ts`;
function actRowNote() {
  const src = readFileSync(PROVIDER_SRC, 'utf8');
  const m = src.match(/export const ACT_ROW_NOTE\s*=\s*([\s\S]*?);\n/);
  if (!m) throw new Error(`CANNOT MEASURE: ACT_ROW_NOTE not found in ${PROVIDER_SRC}`);
  const parts = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)]
    .map((x) => x[1].replace(/\\'/g, "'"));
  if (parts.length === 0) throw new Error(`CANNOT MEASURE: ACT_ROW_NOTE parsed to nothing`);
  return parts.join('');
}
const ACT_NOTE_TEXT = actRowNote();

const REGION_TOOLS = declaredTools('regions');
const COLLISION_TOOLS = declaredTools('collision');
const LAYOUT_TOOLS = declaredTools('layout');

// ── The fixture. Built from the act's OWN grid, read off the running app. ──
function fixtureFor(actId, gridW, gridH, { hole = false, danglingBg = null, overlap = 0 } = {}) {
  const W = gridW * 2048;
  const H = gridH * 2048;
  const half = Math.floor(W / 2 / 16) * 16;
  const regions = [
    {
      id: 'forest', name: 'Forest, upper mid', preset: 'OJZ_Preset_Sec1',
      rect: { x: 0, y: 0, w: half, h: H },
      // THE RULING'S WARNING ARM. A `bg.layoutRef` naming nothing the BG library
      // holds is reachable in an act with ONE background — it is a hand-edit, a
      // rename, a partial checkout — which is exactly why the ALWAYS design
      // needs this arm regardless of how many backgrounds exist.
      ...(danglingBg === null ? {} : { bg: { layoutRef: danglingBg } }),
    },
  ];
  // The SECOND region is what makes the act tile exactly; omitting it leaves an
  // UNASSIGNED hole, which is the fixture the coverage row needs.
  if (!hole) {
    // `overlap` pulls the second region LEFT by that many pixels, so the two
    // share a strip and the act is still covered edge to edge: the only status
    // row that changes is `overlap`, which is what makes the CALL 1 pair below
    // a measurement of that row rather than of the document generally.
    regions.push({
      id: 'night', name: 'Night', preset: 'OJZ_Preset_Night',
      rect: { x: half - overlap, y: 0, w: W - half + overlap, h: H },
    });
  }
  return JSON.stringify({ schema: 1, act: actId, regions });
}

// ── CDP plumbing (the shape every harness in this directory uses) ──────────
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

const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** LOUD ON UNMEASURABLE: never rendered as 0, never as green. */
function cannotMeasure(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: null });
  unmeasured.push(`[${id}] ${name}: ${why}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-regions-facet/${name}.png`);
}

/** Every facet pill on screen, by its own text. */
const PILLS = String.raw`
(() => [...document.querySelectorAll('button')]
  .map((b) => (b.textContent || '').trim())
  .filter((t) => t.length > 0 && t.length < 24))()`;

/**
 * THE BADGES, AS TEXT AND AS BOXES — two answers, kept apart on purpose.
 *
 * `text` is the subject of §7 row 6. `rects`/`visible` are reported beside it so
 * a row can separately claim the text is RENDERED and not sitting in a
 * `display: none` subtree; they are never what "differs per row" is asserted on.
 */
const BADGES = String.raw`
(() => [...document.querySelectorAll('[data-binding-badge]')].map((el) => ({
  key: el.getAttribute('data-binding-badge'),
  text: (el.textContent || '').trim(),
  rects: el.getClientRects().length,
  visible: typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
})))()`;

/**
 * The background lines: their TEXT, their boxes, and their painted COLOUR.
 *
 * ⚠ THREE ANSWERS, THREE ROWS. The text is what the ruling is about; the rects
 * say it is painted at all; the colour is the separate claim that the DANGLING
 * arm renders in the warning tone. No hex is typed here — the warning row's
 * colour is compared against a NORMAL row's colour from the same list, so the
 * assertion is "these two are drawn differently", which is the property, rather
 * than "this equals a token I retyped".
 */
const BG_LABELS = String.raw`
(() => [...document.querySelectorAll('[data-region-bg]')].map((el) => ({
  row: el.getAttribute('data-region-bg'),
  text: (el.textContent || '').trim(),
  rects: el.getClientRects().length,
  color: getComputedStyle(el).color,
})))()`;

const ROW_IDS = String.raw`
(() => [...document.querySelectorAll('[data-region-row]')]
  .map((el) => el.getAttribute('data-region-row')))()`;

const STATUS_ROWS = String.raw`
(() => [...document.querySelectorAll('[data-status-row]')].map((el) => ({
  id: el.getAttribute('data-status-row'),
  text: (el.textContent || '').trim(),
  rects: el.getClientRects().length,
  color: getComputedStyle(el).color,
})))()`;

/**
 * THE ACT ROW'S NOTE LINE: its TEXT, and separately the tooltip it used to be.
 *
 * ⚠ `text` IS `textContent`, WHICH CANNOT SEE AN ATTRIBUTE. That is the whole
 * point of the CALL 3 row: the defect was the sentence living in a `title=`, so
 * a query that could match either would be green against it. `titleText` is
 * read from the enclosing `[title]` and reported BESIDE the text, never as a
 * substitute for it, so the two claims stay separable.
 */
const ACT_ROW_TEXT = String.raw`
(() => {
  const row = document.querySelector('[data-region-row="act"]');
  if (!row) return null;
  const note = row.querySelector('[data-region-note]');
  const titled = row.closest('[title]');
  return {
    rowText: (row.textContent || '').trim(),
    noteText: note ? (note.textContent || '').trim() : null,
    noteRects: note ? note.getClientRects().length : 0,
    noteVisible: note && typeof note.checkVisibility === 'function'
      ? note.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
    titleText: titled ? titled.getAttribute('title') : null,
  };
})()`;

const REVERTS = String.raw`
(() => [...document.querySelectorAll('[data-binding-revert]')]
  .map((el) => el.getAttribute('data-binding-revert')))()`;

const COLUMNS = String.raw`
(() => [...document.querySelectorAll('[data-panel-column]')]
  .map((el) => el.getAttribute('data-panel-column')))()`;

const clickRow = (id) => String.raw`
(() => {
  const el = document.getElementById(${JSON.stringify(`region-row-${id}`)});
  if (!el) return 'no-row';
  el.click();
  return 'ok';
})()`;

const clickRevert = (key) => String.raw`
(() => {
  const el = document.querySelector('[data-binding-revert=' + JSON.stringify(${JSON.stringify(key)}) + ']');
  if (!el) return 'no-control';
  el.click();
  return 'ok';
})()`;

/** Drive one binding's `<select>` the way a person does. */
const setBinding = (key, value) => String.raw`
(() => {
  const row = document.querySelector('[data-binding-row=' + JSON.stringify(${JSON.stringify(key)}) + ']');
  if (!row) return 'no-row';
  const el = row.querySelector('select');
  if (!el) return 'no-select';
  const opts = [...el.options].map((o) => o.value);
  if (!opts.includes(${JSON.stringify(value)})) return 'no-option:' + JSON.stringify(opts);
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
    .call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`;

/** The scene ids the scene picker offers, so a row can pick a real one. */
const SCENE_OPTIONS = String.raw`
(() => {
  const row = document.querySelector('[data-binding-row="scene"]');
  if (!row) return [];
  const el = row.querySelector('select');
  return el ? [...el.options].map((o) => o.value) : [];
})()`;

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const screen = process.env.SCREEN ?? '1680x1050';
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', `-screen 0 ${screen}x24`, ELECTRON, MAIN],
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

    note('FACET_TOOLS parsed from source (nothing is typed in this file):',
      `regions=${JSON.stringify(REGION_TOOLS)} collision=${JSON.stringify(COLLISION_TOOLS)} `
      + `layout=${JSON.stringify(LAYOUT_TOOLS)}`);

    const haveRegions = await c.evalExpr('typeof window.__dbg.aeon.setRegions === "function"');
    check('0a', 'ANTI-VACUOUS: the build under test has the regions probe at all',
      haveRegions === true, `${RUN.root}/dist — a stale build has no setRegions and every row below `
      + 'would measure the previous parcel');
    if (!haveRegions) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npm run build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ───────────────────────────────────────────────────────────────────────
    // 1. THE PROJECT, AND THE FACET GATING
    // ───────────────────────────────────────────────────────────────────────
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections and a grid',
      !!(st && st.open && st.sections > 0 && st.gridWidth > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');
    await sleep(2500);

    const pills = await c.json(PILLS);
    check('1b', 'the facet bar offers a Regions pill for an AEON project',
      pills.includes('Regions'), `pills = ${JSON.stringify(pills)}`);
    // ANTI-VACUOUS PARTNER: "Regions is there" is worthless if the bar is a
    // wall of every string on screen. The other map pills must be there too and
    // nothing else this harness names must be.
    check('1c', 'ANTI-VACUOUS: the pill list is a real facet bar (Layout, Collision, Effects all present)',
      ['Layout', 'Collision', 'Effects', 'Palette'].every((p) => pills.includes(p)),
      `pills = ${JSON.stringify(pills)}`);

    const set = async (facet) => c.json(`window.__dbg.aeon.setFacet(${JSON.stringify(facet)})`);
    let f = await set('regions');
    check('1d', 'switching to `regions` lands on `regions` (it is granted AND served)',
      f && f.facet === 'regions', JSON.stringify(f));
    await sleep(900);
    const cols = await c.json(COLUMNS);
    check('1e', "the Regions panel's own column is mounted (`aeon-regions`)",
      cols.includes('aeon-regions'), `columns on screen = ${JSON.stringify(cols)}`);
    await shot(c, '01-regions-facet');

    // ───────────────────────────────────────────────────────────────────────
    // 2. THE DISAMBIGUATOR (§3.1) — what step 6 can honestly assert
    // ───────────────────────────────────────────────────────────────────────
    //
    // The region RECTANGLE is step 8, so the claim is not "the region tool is
    // armed here"; it is the other half of the same property: the facet is what
    // decides which tool a drag means, and arriving on Regions DISARMS whatever
    // the previous facet armed. Both directions are exercised, and each has the
    // previous facet's own positive answer as its control — without that, "the
    // tool is `view` here" is equally consistent with a facet system that arms
    // `view` everywhere.
    // ⚠ THE FIRST DRAFT OF [2a] ASSERTED THE WRONG MECHANISM AND WENT RED
    // HONESTLY — kept here because the correction is the interesting part. It
    // read `setFacet('collision').tool === FACET_TOOLS.collision[0]`, i.e. "a
    // facet switch ARMS the facet default". It does not: `toolForFacet` KEEPS
    // the current tool when the target facet allows it, and collision's set is
    // `['paint-collision', 'view']`, so arriving there from `view` correctly
    // stays on `view`. The default is the FALLBACK, not a force. So the brush is
    // armed through its own dock button — the gesture an author makes — and the
    // claim below is the one §3.1 is actually about: the facet takes it away.
    await set('collision');
    await sleep(800);
    const armedBrush = await c.evalExpr(String.raw`
      (() => { const b = document.querySelector('button[aria-label="Paint Collision"]');
               if (!b) return 'no-button'; b.click(); return 'ok'; })()`);
    await sleep(500);
    const stBrush = await c.json('window.__dbg.aeon.state()');
    check('2a', 'CONTROL: the collision brush is genuinely ARMED on the Collision facet',
      armedBrush === 'ok' && stBrush.tool === 'paint-collision'
      && COLLISION_TOOLS.includes('paint-collision'),
      `dock click → ${armedBrush}; state().tool = ${stBrush.tool}; `
      + `FACET_TOOLS.collision = ${JSON.stringify(COLLISION_TOOLS)}`);
    const fr = await set('regions');
    check('2b', 'arriving on Regions DISARMS the collision brush and arms the facet default',
      fr && fr.tool === REGION_TOOLS[0] && fr.tool !== 'paint-collision',
      `setFacet('regions') → ${JSON.stringify(fr)}; FACET_TOOLS.regions[0] = ${REGION_TOOLS[0]}`);

    const fl = await set('layout');
    check('2c', 'CONTROL: the Layout facet arms its own default (the marquee lives in this set)',
      fl && LAYOUT_TOOLS.includes(fl.tool) && LAYOUT_TOOLS.includes('marquee'),
      `setFacet('layout') → ${JSON.stringify(fl)}; FACET_TOOLS.layout = ${JSON.stringify(LAYOUT_TOOLS)}`);
    // ARM THE MARQUEE THROUGH ITS OWN DOCK BUTTON, not through a store poke: the
    // claim below is that arriving on Regions takes away a tool the author had
    // armed, so the arming has to be the gesture an author makes. The label is
    // read off the app's own `aria-label`, which `ToolButton` sets from
    // `TOOL_LABELS`.
    await sleep(700);
    const armed = await c.evalExpr(String.raw`
      (() => { const b = document.querySelector('button[aria-label="Marquee"]');
               if (!b) return 'no-button'; b.click(); return 'ok'; })()`);
    await sleep(500);
    const stArmed = await c.json('window.__dbg.aeon.state()');
    check('2d', 'INSTRUMENT: the marquee is genuinely ARMED on Layout before the switch',
      armed === 'ok' && stArmed.tool === 'marquee',
      `dock click → ${armed}; state().tool = ${stArmed.tool}. Without this the row below is `
      + '"view is armed on Regions", which is also true of a facet system that arms view '
      + 'everywhere.');
    const fr2 = await set('regions');
    check('2e', 'arriving on Regions from Layout DISARMS the marquee and arms `view`',
      fr2 && fr2.tool === REGION_TOOLS[0] && fr2.tool !== 'marquee',
      `setFacet('regions') → ${JSON.stringify(fr2)}`);
    check('2f', 'the Regions facet declares exactly one tool, and it is a pure pan',
      REGION_TOOLS.length === 1 && REGION_TOOLS[0] === 'view',
      `parsed from ${FACET_TOOLS_SRC}: ${JSON.stringify(REGION_TOOLS)}. If this row goes red `
      + 'because step 8 added a region tool, the rows above need the OTHER half of §3.1 added, '
      + 'not this one relaxed.');

    // ───────────────────────────────────────────────────────────────────────
    // 3. THE SUBJECT — a regions document, through the real codec
    // ───────────────────────────────────────────────────────────────────────
    const before = await c.json('window.__dbg.aeon.regions()');
    check('3a', 'ANTI-VACUOUS CONTROL: the act starts with NO regions document, so anything below is this fixture',
      before.kind === 'none' && before.count === 0, JSON.stringify(before));

    const fixture = fixtureFor(st.act, st.gridWidth, st.gridHeight);
    const loaded = await c.json(
      `window.__dbg.aeon.setRegions(${JSON.stringify(fixture)})`);
    check('3b', 'the fixture is ACCEPTED by the real codec and lands on the act',
      loaded.ok === true && loaded.count === 2, JSON.stringify(loaded));
    await sleep(900);
    const after = await c.json('window.__dbg.aeon.regions()');
    check('3c', 'ANTI-VACUOUS: the model now holds two regions — the instrument HAS a subject',
      after.kind === 'open' && after.count === 2
      && after.ids.join(',') === 'forest,night', JSON.stringify(after));

    // RED-FIRST FOR THE CODEC DOOR ITSELF: a document the schema refuses must
    // come back as a refusal, not silently become the model. Otherwise [3b]'s
    // green is equally consistent with a door that accepts anything.
    const refused = await c.json(
      'window.__dbg.aeon.setRegions(JSON.stringify({ schema: 1, act: "x", regions: [] }))');
    const stillTwo = await c.json('window.__dbg.aeon.regions()');
    check('3d', 'CONTROL: a document the schema refuses is REFUSED, and the model is unchanged',
      refused.ok === false && stillTwo.count === 2,
      `${JSON.stringify(refused)} / model still ${stillTwo.count}`);

    const rowIds = await c.json(ROW_IDS);
    check('3e', 'the list renders one row per region PLUS the fixed `act` row (§3.4)',
      rowIds.join(',') === 'forest,night,act', `rows on screen = ${JSON.stringify(rowIds)}`);
    await shot(c, '02-list');

    // ═══ THE ACT ROW SAYS WHY IT IS READ-ONLY, IN TEXT — CALL 3 ═══════════
    //
    // ⚠ `textContent` CANNOT SEE AN ATTRIBUTE, AND THAT IS THE MEASUREMENT.
    // The defect was this sentence living only in a `title=` on the row's Card:
    // an author who never hovers never learns why the row takes no click. A
    // query matching either would be green against exactly that, so the text
    // and the tooltip are read into two separate fields and asserted on two
    // separate rows. The sentence itself is parsed out of the provider
    // (`ACT_ROW_NOTE`), never typed here.
    const actRow = await c.json(ACT_ROW_TEXT);
    check('3f', 'ANTI-VACUOUS: the act row is on screen with text of its own',
      !!actRow && actRow.rowText.length > 0 && /\bact\b/.test(actRow.rowText),
      actRow ? JSON.stringify(actRow.rowText.slice(0, 120)) : 'no act row at all');
    check('3g', 'its read-only reason is in the RENDERED TEXT, not only in the tooltip',
      !!actRow && actRow.noteText === ACT_NOTE_TEXT && actRow.rowText.includes(ACT_NOTE_TEXT),
      `parsed from ${PROVIDER_SRC}: ${JSON.stringify(ACT_NOTE_TEXT)}\n        `
      + `on screen: ${JSON.stringify(actRow?.noteText)}`);
    check('3h', 'and that line is PAINTED, not sitting in an unpainted subtree',
      !!actRow && actRow.noteRects > 0 && actRow.noteVisible !== false,
      `rects=${actRow?.noteRects} checkVisibility=${actRow?.noteVisible}`);
    check('3i', 'the tooltip is KEPT alongside it, saying the same words',
      !!actRow && actRow.titleText === ACT_NOTE_TEXT,
      `title=${JSON.stringify(actRow?.titleText)} — reported separately from the text above so `
      + 'neither can stand in for the other');
    await shot(c, '02a-act-row');

    // ───────────────────────────────────────────────────────────────────────
    // 4. THE BACKGROUND LABEL — ALWAYS, on every row (ruling 2026-09-16)
    // ───────────────────────────────────────────────────────────────────────
    const bgs = await c.json(BG_LABELS);
    check('4a', 'EVERY row carries a background line, including the act row',
      bgs.length === rowIds.length && bgs.length === 3,
      `bg lines = ${JSON.stringify(bgs)}`);
    check('4b', 'each line NAMES a background in words, and none is empty',
      bgs.every((b) => /^bg \S/.test(b.text)), JSON.stringify(bgs.map((b) => b.text)));
    // ⚠ THIS IS THE RULING'S OWN CASE. Today every act has one background, so
    // every line says the same thing — and under the CONDITIONAL design the
    // ruling rejected, every one of these would be ABSENT. The assertion is on
    // presence and content, never on rows differing from each other.
    check('4c', "the all-shared launch state still prints the line on every row (the ruling's ALWAYS)",
      bgs.length > 1 && new Set(bgs.map((b) => b.text)).size === 1,
      `all rows say ${JSON.stringify(bgs[0].text)} — identical, and present, which is the point`);
    check('4d', 'the lines are RENDERED, not sitting in an unpainted subtree',
      bgs.every((b) => b.rects > 0), JSON.stringify(bgs.map((b) => b.rects)));
    check('4e', 'CONTROL: with every ref resolving, NO row is drawn in a different colour',
      new Set(bgs.map((b) => b.color)).size === 1,
      `colours = ${JSON.stringify(bgs.map((b) => b.color))} — this is the baseline the `
      + 'dangling row below is measured against, so "different" cannot mean "always was".');

    // ═══ THE WARNING ARM, IN AN ACT WITH ONE BACKGROUND ═══════════════════
    //
    // The ruling's reasons 3 and 5: a dangling id can exist in a one-background
    // act, so the arm has to exist whatever the background count is. This act
    // has exactly one, which makes it the case the ruling names.
    const DANGLE = 'no_such_bg';
    const dangled = await c.json(
      `window.__dbg.aeon.setRegions(${JSON.stringify(
        fixtureFor(st.act, st.gridWidth, st.gridHeight, { danglingBg: DANGLE }))})`);
    check('4f', 'INSTRUMENT: a fixture with a DANGLING bg.layoutRef loaded',
      dangled.ok === true && dangled.count === 2, JSON.stringify(dangled));
    await sleep(800);
    const bgs2 = await c.json(BG_LABELS);
    const danglingRow = bgs2.find((b) => b.row === 'forest');
    const okRow = bgs2.find((b) => b.row === 'night');
    check('4g', `a dangling ref reads "bg MISSING ${DANGLE}" — never absence, never silence`,
      !!danglingRow && danglingRow.text === `bg MISSING ${DANGLE}`,
      JSON.stringify(danglingRow));
    check('4h', 'and it is drawn in a DIFFERENT colour from a resolving row in the same list',
      !!danglingRow && !!okRow && danglingRow.color !== okRow.color && danglingRow.rects > 0,
      `MISSING row ${danglingRow?.color} vs resolving row ${okRow?.color}`);
    check('4i', 'the resolving rows are UNCHANGED by the neighbour that dangles',
      !!okRow && /^bg \S/.test(okRow.text) && !/MISSING/.test(okRow.text),
      JSON.stringify(okRow));
    await shot(c, '02b-dangling-bg');

    // Put the clean fixture back: every row below is about a clean document.
    const restored = await c.json(
      `window.__dbg.aeon.setRegions(${JSON.stringify(
        fixtureFor(st.act, st.gridWidth, st.gridHeight))})`);
    check('4j', 'INSTRUMENT: the clean fixture is restored for the rows below',
      restored.ok === true && restored.count === 2, JSON.stringify(restored));
    await sleep(700);

    // ───────────────────────────────────────────────────────────────────────
    // 5. THE BADGES — §7 row 6's named gate
    // ───────────────────────────────────────────────────────────────────────
    const none = await c.json(BADGES);
    check('5a', 'CONTROL: with NOTHING selected the panel shows no bindings rows at all',
      none.length === 0,
      `badges before selection = ${JSON.stringify(none)} — this is the state in which "badge `
      + 'text differs per row" would pass vacuously, and it is asserted rather than skipped past');

    check('5b', 'INSTRUMENT: clicking a list row selects it',
      (await c.evalExpr(clickRow('forest'))) === 'ok');
    await sleep(700);
    const sel = await c.json('window.__dbg.aeon.regions()');
    check('5c', 'the selection reached the store, BY ID',
      sel.selectedRegionId === 'forest', JSON.stringify(sel));

    const badges = await c.json(BADGES);
    check('5d', 'ANTI-VACUOUS: exactly FOUR bindings rows are on screen (§3.4 names four)',
      badges.length === 4, `badges = ${JSON.stringify(badges)}`);
    check('5e', 'they are the four §3.4 keys, in §3.4 order',
      badges.map((b) => b.key).join(',') === 'preset,scene,raster,bg',
      badges.map((b) => b.key).join(','));

    // ═══ THE GATE. ON TEXT, WHICH IS WHAT THE PROPERTY IS ABOUT. ═══
    const texts = badges.map((b) => b.text);
    check('5f', 'BADGE TEXT DIFFERS PER ROW — the §7 row 6 gate, read off textContent',
      badges.length === 4 && new Set(texts).size === 4 && texts.every((t) => t.length > 0),
      `texts = ${JSON.stringify(texts)}`);
    // A SEPARATE CLAIM, deliberately not folded into the one above: the text is
    // painted. A guard aimed at boxes would answer a different question, so the
    // box answer gets its own row and is never the gate.
    check('5g', 'and every badge is actually PAINTED (non-zero client rects, checkVisibility true)',
      badges.every((b) => b.rects > 0 && b.visible !== false),
      JSON.stringify(badges.map((b) => ({ key: b.key, rects: b.rects, visible: b.visible }))));
    // The SHAPE of the four, so "distinct" cannot be satisfied by four
    // meaningless strings: one required row and three inherited ones.
    check('5h', 'one badge says the row is REQUIRED and three say what they inherit from the act',
      texts.filter((t) => /required/.test(t)).length === 1
      && texts.filter((t) => /^inherited \(act: .+\)$/.test(t)).length === 3,
      JSON.stringify(texts));
    await shot(c, '03-badges');

    // ───────────────────────────────────────────────────────────────────────
    // 6. DETACH ON EDIT, AND THE REVERT CONTROL (§3.4)
    // ───────────────────────────────────────────────────────────────────────
    const revertsBefore = await c.json(REVERTS);
    check('6a', 'CONTROL: a wholly-inherited region offers NO revert control on any row',
      revertsBefore.length === 0, JSON.stringify(revertsBefore));

    const sceneOpts = await c.json(SCENE_OPTIONS);
    const pick = sceneOpts.find((v) => v !== '');
    if (pick === undefined) {
      cannotMeasure('6b', 'detach on edit through the scene picker',
        `this checkout's effects scene library offers no scene to pick: options = `
        + `${JSON.stringify(sceneOpts)}. The picker is present and the inherit option is there; `
        + 'there is simply nothing to detach TO, so the transition was not exercised on screen.');
    } else {
      const r = await c.evalExpr(setBinding('scene', pick));
      check('6b', 'INSTRUMENT: the scene picker took a real scene id',
        r === 'ok', `setBinding('scene', ${JSON.stringify(pick)}) → ${r}`);
      await sleep(700);
      const afterEdit = await c.json(BADGES);
      const sceneBadge = afterEdit.find((b) => b.key === 'scene');
      check('6c', 'editing an INHERITED row makes it EXPLICIT, and the badge says so',
        sceneBadge && sceneBadge.text === 'explicit',
        `scene badge = ${JSON.stringify(sceneBadge)}`);
      const revertsAfter = await c.json(REVERTS);
      check('6d', 'and the "revert to inherited" control APPEARS on that row and nowhere else',
        revertsAfter.length === 1 && revertsAfter[0] === 'scene',
        JSON.stringify(revertsAfter));
      // The badges must STILL differ per row after a detachment — the state the
      // gate was written against is the inherited one, and this is the other.
      const t2 = afterEdit.map((b) => b.text);
      check('6e', 'the four badges still differ per row once one is explicit',
        new Set(t2).size === 4, JSON.stringify(t2));
      await shot(c, '04-detached');

      check('6f', 'INSTRUMENT: the revert control takes a click',
        (await c.evalExpr(clickRevert('scene'))) === 'ok');
      await sleep(700);
      const back = await c.json(BADGES);
      const sceneBack = back.find((b) => b.key === 'scene');
      check('6g', 'reverting puts the row back to inherited, naming the act value again',
        sceneBack && /^inherited \(act: .+\)$/.test(sceneBack.text),
        `scene badge = ${JSON.stringify(sceneBack)}`);
      check('6h', 'and the revert control disappears with it',
        (await c.json(REVERTS)).length === 0);
    }

    // ───────────────────────────────────────────────────────────────────────
    // 7. THE STATUS LINE — §2.5 live, including what is NOT checked
    // ───────────────────────────────────────────────────────────────────────
    const status = await c.json(STATUS_ROWS);
    check('7a', 'ANTI-VACUOUS: the status line renders rows at all',
      status.length >= 3, JSON.stringify(status.map((r) => r.id)));
    const minSpan = status.find((r) => r.id === 'min-span');
    check('7b', 'rule 4 is on screen as NOT CHECKED — unmeasurable is never drawn as a pass',
      !!minSpan && /NOT CHECKED/.test(minSpan.text) && /REGION_MIN_SPAN/.test(minSpan.text),
      minSpan ? minSpan.text.slice(0, 140) : 'no min-span row');
    const cover = status.find((r) => r.id === 'unassigned');
    check('7c', 'CONTROL: the exactly-tiling fixture reports coverage satisfied',
      !!cover && /Every pixel of the act is assigned/.test(cover.text),
      cover ? cover.text.slice(0, 120) : 'no unassigned row');

    // ⚠ THE COVERAGE ROW IS VACUOUS ALONE — the seam review said so of
    // `uncoveredRects`: `[]` is what a correct document and a dead instrument
    // both produce. Only punching a hole reddens it, so a hole is punched.
    const holed = await c.json(
      `window.__dbg.aeon.setRegions(${JSON.stringify(
        fixtureFor(st.act, st.gridWidth, st.gridHeight, { hole: true }))})`);
    check('7d', 'INSTRUMENT: the holed fixture loaded',
      holed.ok === true && holed.count === 1, JSON.stringify(holed));
    await sleep(800);
    const status2 = await c.json(STATUS_ROWS);
    const cover2 = status2.find((r) => r.id === 'unassigned');
    check('7e', 'a HOLE turns the coverage row into an UNASSIGNED warning naming the area',
      !!cover2 && /UNASSIGNED/.test(cover2.text) && /belongs to no region/.test(cover2.text),
      cover2 ? cover2.text.slice(0, 160) : 'no unassigned row');
    await shot(c, '05-unassigned');

    // ═══ THE OVERLAP ROW'S `ok` ARM — 2026-09-16 ruling, CALL 1 ═══════════
    //
    // ⚠ THE PAIR IS THE ROW. Until this ruling the overlap row was pushed only
    // `if (overlaps.length > 0)`, so a clean document said NOTHING and a reader
    // could not tell "checked, disjoint" from "this check did not run". The
    // green half alone is vacuous in the other direction: "no overlap warning
    // on a clean document" is also what a panel that renders no overlap row at
    // all produces, which is precisely the defect. So the SAME id is demanded
    // in BOTH documents, and the two arms are required to differ in tone.
    const clean = await c.json(
      `window.__dbg.aeon.setRegions(${JSON.stringify(
        fixtureFor(st.act, st.gridWidth, st.gridHeight))})`);
    check('7f', 'INSTRUMENT: the clean, exactly-tiling fixture is back',
      clean.ok === true && clean.count === 2, JSON.stringify(clean));
    await sleep(800);
    const status3 = await c.json(STATUS_ROWS);
    const ok3 = status3.find((r) => r.id === 'overlap');
    const cover3 = status3.find((r) => r.id === 'unassigned');
    check('7f2', 'a DISJOINT document still puts an `overlap` row on screen, and says it passed',
      !!ok3 && /No two regions overlap/.test(ok3.text) && ok3.rects > 0,
      ok3 ? `${JSON.stringify(ok3.text)} rects=${ok3.rects}`
        : 'NO overlap row on a clean document: this is the defect the ruling named');
    check('7f3', 'and it is drawn in the SAME tone as the other passing row, not as a warning',
      !!ok3 && !!cover3 && ok3.color === cover3.color,
      `overlap ${ok3?.color} vs unassigned(ok) ${cover3?.color} — the ok tone is taken from a `
      + 'row known to be ok in this same list, never from a hex typed here');

    // 16 px, because the fixture's own rectangles are 16-aligned; the number is
    // the grid the fixture builder uses, not a constant of the app.
    const OVER = 16;
    const overlapped = await c.json(
      `window.__dbg.aeon.setRegions(${JSON.stringify(
        fixtureFor(st.act, st.gridWidth, st.gridHeight, { overlap: OVER }))})`);
    check('7g', 'INSTRUMENT: an OVERLAPPING fixture is accepted by the codec (the load does not refuse it)',
      overlapped.ok === true && overlapped.count === 2, JSON.stringify(overlapped));
    await sleep(800);
    const status4 = await c.json(STATUS_ROWS);
    const bad4 = status4.find((r) => r.id === 'overlap');
    check('7h', 'the SAME row flips to the warning arm, naming both regions and the shared rectangle',
      !!bad4 && /forest and night/.test(bad4.text) && new RegExp(`${OVER}x`).test(bad4.text)
      && !/No two regions overlap/.test(bad4.text),
      bad4 ? bad4.text.slice(0, 170) : 'no overlap row on an OVERLAPPING document');
    check('7i', 'and the two arms are drawn DIFFERENTLY, so the pass is not the warning in silence',
      !!bad4 && !!ok3 && bad4.color !== ok3.color && bad4.rects > 0,
      `warning ${bad4?.color} vs ok ${ok3?.color}`);
    // The row mark on the list row is the other half of CALL 1 and already
    // landed at step 6; it is read here only as a cross-check that the
    // overlapping document really reached the panel and not just the status fn.
    const marked = await c.json(String.raw`
      (() => [...document.querySelectorAll('[data-region-overlap]')]
        .map((el) => (el.textContent || '').trim()))()`);
    check('7j', 'CROSS-CHECK: the list rows carry the symmetric `overlaps` mark for the same document',
      marked.length === 2 && marked.every((t) => /^overlaps \S/.test(t)),
      JSON.stringify(marked));
    await shot(c, '05b-overlap');

    const cleaned = await c.json(
      `window.__dbg.aeon.setRegions(${JSON.stringify(
        fixtureFor(st.act, st.gridWidth, st.gridHeight))})`);
    check('7k', 'INSTRUMENT: the clean fixture is restored, and the mark goes with the overlap',
      cleaned.ok === true && cleaned.count === 2, JSON.stringify(cleaned));
    await sleep(800);
    const unmarked = await c.json(String.raw`
      (() => document.querySelectorAll('[data-region-overlap]').length)()`);
    check('7l', 'the per-row mark is CONDITIONAL and the status row is not: mark gone, row still there',
      unmarked === 0
      && /No two regions overlap/.test((await c.json(STATUS_ROWS))
        .find((r) => r.id === 'overlap')?.text ?? ''),
      `marks on screen = ${unmarked}`);

    // ───────────────────────────────────────────────────────────────────────
    // 8. THE OTHER HALF OF THE GATING: classic does NOT get this facet
    // ───────────────────────────────────────────────────────────────────────
    if (!existsSync(S1DIR)) {
      cannotMeasure('8a', 'the Regions pill is absent for a CLASSIC project',
        `no classic checkout at ${S1DIR}, so the negative half of the facet gate was NOT `
        + 'measured. This is not a pass and must not be read as one.');
    } else {
      await c.evalExpr('localStorage.clear()');
      await c.send('Page.reload');
      await sleep(4000);
      await waitDbg();
      await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`)
        .catch((e) => console.log('        openDir threw:', e.message));
      await sleep(6000);
      const s1pills = await c.json(PILLS);
      // ⚠ THE ANTI-VACUOUS HALF, AND IT IS THE WHOLE ROW. "Regions is absent"
      // is what a failed open, a blank window and a crashed renderer all
      // produce, so the OTHER pills must be present in the same breath.
      check('8a', 'CONTROL: the classic project opened and its facet bar is really there',
        ['Layout', 'Objects', 'Palette'].every((p) => s1pills.includes(p)),
        `classic pills = ${JSON.stringify(s1pills)}`);
      check('8b', 'and Regions is NOT among them — the facet is aeon-only (§3.1)',
        !s1pills.includes('Regions'), `classic pills = ${JSON.stringify(s1pills)}`);
      await shot(c, '06-classic');
    }
  } finally {
    try { c?.close(); } catch { /* closing */ }
    killTree(child);
  }

  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  console.log(`\n=== ${passed} passed, ${failed} failed, ${unmeasured.length} UNMEASURABLE `
    + `of ${results.length} rows ===`);
  if (unmeasured.length > 0) {
    console.log('UNMEASURABLE rows (NOT passes):');
    for (const u of unmeasured) console.log(`  ${u}`);
  }
  if (fails.length > 0) {
    console.log('FAILED:');
    for (const f of fails) console.log(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
