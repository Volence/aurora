#!/usr/bin/env node
// IS THE TWO-WRITER SENTENCE ON SCREEN, IN THE RUNNING APP, WHEN AN AUTHOR
// BUILDS THE COMBINATION THE ENGINE REFUSES OUTRIGHT?
//
// ═══ THE DEFECT THIS EXISTS BECAUSE OF ═══
//
// `fireLineAdvisory` carried, from the day it landed, an early return guarded by
// a comment that said an unlocked scene with a vsplit "already has its own
// advisory". It did not. Nothing in Aurora's PANEL said anything about the
// combination — so an author could turn on a Plane B split, drop `v_factor` off
// the lock, and hold a document `scene()` refuses outright with NOTHING on
// screen saying so. 5,341 vitest tests were green over that gap, because not one
// of them can see React, a DOM node or a pixel. This file is the only instrument
// that can tell whether the sentence reaches an author.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. ⚠ THIS PARCEL'S OWN WORST TRAP, AND IT IS THE SHAPE OF THE DEFECT ITSELF:
//    **a locked scene produces no advisory, and so does a completely broken
//    implementation.** Every scene that ships is locked. A harness that only
//    ever looked at locked scenes would go green over a deleted feature. So
//    every discriminating row here builds an UNLOCKED scene WITH A SPLIT
//    ACTUALLY PRESENT — read back out of the document before any DOM is
//    inspected — and every one is paired with a LOCKED control that must be
//    SILENT, in the same session, through the same gesture.
//
// 2. A PROVIDER THAT RETURNS THE RIGHT STRING TO NOBODY. Every assertion below
//    reads `textContent` out of the live DOM. `vsplitLockAdvisory` returning a
//    sentence proves nothing about whether it is rendered — that is exactly the
//    gap being closed, one level up.
//
// 3. A SENTENCE THAT IS RENDERED AND THEN HIDDEN. `document.elementFromPoint` at
//    the hint's own centre must land ON the hint (or inside it), and
//    `checkVisibility()` must agree. A `display:none` hint has a textContent.
//
// 4. BOTH ROUTES TO THE FAULT, because they are different gestures and the
//    panel answers them in two different places:
//      • turn the SPLIT on while the scene is already unlocked  -> the LAYER
//        card's sentence;
//      • move V_FACTOR off the lock while a layer already has a split -> the
//        V-FACTOR row's sentence, which is the only one that can name WHICH
//        layers, because that route never touches a layer.
//    Section 7 proves the sentences are in those two places by DOM ORDER, not
//    by taking the app's word for it.
//
// 5. AN ADVISORY THAT OFFERS ONE REMEDY. The engine offers two and they are
//    different products (lock the plane; or move the depth onto fb/curve). The
//    only sentence Aurora had on this bound before ROADMAP row 80 — on the
//    raster timeline strip, in a different collapsible section — offered one.
//    Both remedy clauses are PARSED OUT OF THE PROVIDER SOURCE and required
//    present in the on-screen text.
//
// 6. AN ADVISORY THAT BECAME A CLAMP. This parcel is explicitly not allowed to
//    make a control refuse (ROADMAP rows 37/58/66 are pending the owner's
//    review). Section 8 reads the document back and requires it to still HOLD
//    the illegal combination, unrewritten.
//
// ═══ AIM AT INTEGERS ═══
//
// `devicePixelRatio` is whatever Electron infers under Xvfb and has been seen at
// 1 and at 1.35 on this host inside one session. Only ONE row here uses client
// coordinates at all (5c's `elementFromPoint`) and it aims at the hint's own
// integer-rounded CENTRE — the least dpr-sensitive point available. dpr, the
// rect and the aim are printed regardless.
//
// ═══ HOW TO RUN ═══
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build    # __dbg exists ONLY here
//   node scratchpad/vsplit-advisory-harness.mjs    # or: npm run harness:vsplit-advisory
//
// Screenshots land in scratchpad/shots-vsplit-advisory/.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9407);
// SELF-LOCATING, never a pinned path: run from the main clone this must serve
// the main clone's dist/, or a "re-verified after merge" run silently
// re-verifies the branch.
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-vsplit-advisory`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'vsplit_lock_probe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── THE CONTRACT, PARSED FROM SOURCE — no sentence is retyped here ─────────
//
// The clauses are declared ONCE in the provider and composed by three surfaces.
// A harness that retyped them would go green on its own copy while the app said
// something else, which is the same class of defect as the comment that started
// this parcel.
const PROVIDER_SRC = `${ROOT}/src/renderer/providers/effects-aeon.ts`;
const SRC = readFileSync(PROVIDER_SRC, 'utf8');

/**
 * The lock sentinel, DERIVED THE WAY THE APP DERIVES IT.
 *
 * `EFFECTS_V_FACTOR_LOCK = EFFECTS_V_FACTOR_BOUNDS.max`, and that bound comes
 * from the schema's `properties.v_factor.maximum` — so this reads the schema,
 * not a number written in a TypeScript file and certainly not one written here.
 * `scene-ui.ts` is checked to still spell the derivation that way, so a future
 * change to a literal cannot leave this quietly reading the wrong source.
 */
function parseLock() {
  const ui = readFileSync(`${ROOT}/src/core/formats/effects/scene-ui.ts`, 'utf8');
  if (!/EFFECTS_V_FACTOR_LOCK[^\n]*=\s*EFFECTS_V_FACTOR_BOUNDS\.max/.test(ui)) {
    throw new Error('CANNOT MEASURE: EFFECTS_V_FACTOR_LOCK is no longer '
      + 'EFFECTS_V_FACTOR_BOUNDS.max — this harness\'s derivation is stale, fix it');
  }
  const schema = JSON.parse(readFileSync(
    `${ROOT}/src/core/formats/effects/aurora-effects-scene.schema.json`, 'utf8'));
  const max = schema?.properties?.v_factor?.maximum;
  if (typeof max !== 'number') {
    throw new Error('CANNOT MEASURE: schema has no properties.v_factor.maximum');
  }
  return max;
}
const LOCK = parseLock();

/**
 * Pull one `const NAME = <string concatenation>;` out of the provider and
 * evaluate the literal pieces — single-quoted AND template.
 *
 * ⚠ IT REFUSES TO GUESS. A clause it cannot recover throws, loudly, before a
 * single row runs; so does an interpolation it does not know how to resolve. A
 * harness that silently fell back to a typed string would be asserting against
 * itself, which is the class of defect this whole parcel is about.
 */
function parseClause(name) {
  const m = SRC.match(new RegExp(`const ${name} =\\s*([\\s\\S]*?);\\n`));
  if (!m) throw new Error(`CANNOT MEASURE: ${name} not found in ${PROVIDER_SRC}`);
  const pieces = m[1].match(/'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g);
  if (!pieces) throw new Error(`CANNOT MEASURE: ${name} has no string literals in ${PROVIDER_SRC}`);
  return pieces.map((p) => {
    if (p.startsWith('`')) {
      // The only interpolation these clauses use is the lock sentinel, and it is
      // resolved from the constant above rather than typed. Anything else stops
      // the run: an unresolved `${…}` in an expected string would make the
      // on-screen comparison fail for a reason that is not the feature.
      const body = p.slice(1, -1).replace(/\$\{EFFECTS_V_FACTOR_LOCK\}/g, String(LOCK));
      if (body.includes('${')) {
        throw new Error(`CANNOT MEASURE: ${name} interpolates something this harness `
          + `cannot resolve: ${body}`);
      }
      return body;
    }
    // eslint-disable-next-line no-eval
    return eval(p);
  }).join('');
}

const MECHANISM = parseClause('VSPLIT_LOCK_MECHANISM');
const REMEDY_LOCK = parseClause('VSPLIT_LOCK_REMEDY_LOCK');
const REMEDY_HORIZ = parseClause('VSPLIT_LOCK_REMEDY_HORIZONTAL');
// The shift the scene is dropped to. NOT 0 and NOT 1: 0 is the schema minimum
// and would also be what an uninitialised field reads as, and the sentence
// interpolates the value, so a wrong-value bug must be visible. 3 is neither an
// edge nor the lock.
const UNLOCKED_VF = 3;
// Two layers, so the multi-layer plural in the scene sentence is exercised and
// so there is a layer WITHOUT a split in the same scene as a control.
const TOP_A = 0;
const TOP_B = 96;

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
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-vsplit-advisory/${name}.png`);
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

/**
 * EVERY ELEMENT ON SCREEN WHOSE OWN TEXT CARRIES A PHRASE — the whole point.
 *
 * ⚠ LEAF-ONLY, and that is not a detail. `document.body.textContent` contains
 * every phrase any descendant renders, so a naive contains-check would pass on
 * a hint that is mounted inside a `display:none` subtree, or one whose text is
 * in a `<title>` attribute somewhere. This walks elements with NO element
 * children carrying the phrase, i.e. the node that actually renders it, and
 * reports its box and its visibility so the caller can insist it is real.
 */
const FIND_TEXT = (phrase) => String.raw`
(() => {
  const want = ${JSON.stringify(phrase)};
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const t = el.textContent || '';
    if (!t.includes(want)) continue;
    // Only the deepest element carrying it — the renderer, not its ancestors.
    if ([...el.children].some((k) => (k.textContent || '').includes(want))) continue;
    const r = el.getBoundingClientRect();
    out.push({
      text: t,
      tag: el.tagName,
      visible: typeof el.checkVisibility === 'function'
        ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : null,
      rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    });
  }
  return out;
})()`;

/**
 * DOM ORDER, so "under the v_factor row" and "on the layer card" are MEASURED.
 *
 * Returns, for the element rendering `phrase`: whether it precedes the v_factor
 * input, and whether it follows the "Layer 0" card heading. `compareDocumentPosition`
 * is the browser's own answer; nothing here re-implements tree order.
 */
const DOM_ORDER = (phrase) => String.raw`
(() => {
  const want = ${JSON.stringify(phrase)};
  const leaf = [...document.querySelectorAll('*')].find((el) =>
    (el.textContent || '').includes(want)
    && ![...el.children].some((k) => (k.textContent || '').includes(want)));
  if (!leaf) return { found: false };
  const vf = [...document.querySelectorAll('input[type=number]')]
    .find((e) => /^v_factor — /.test(e.title || ''));
  const l0 = [...document.querySelectorAll('select')]
    .find((e) => /^Layer 0 vsplit\.at/.test(e.title || ''));
  if (!vf || !l0) return { found: true, vf: !!vf, l0: !!l0 };
  const P = Node.DOCUMENT_POSITION_FOLLOWING;
  return {
    found: true, vf: true, l0: true,
    // "the hint comes BEFORE the layer-0 split control" == it is up in the
    // scene section rather than down on a card.
    beforeLayer0: (leaf.compareDocumentPosition(l0) & P) !== 0,
    // "the hint comes AFTER the v_factor spinner" — true for both, but taken
    // with beforeLayer0 it pins the hint between them, which is the scene row.
    afterVFactor: (vf.compareDocumentPosition(leaf) & P) !== 0,
  };
})()`;

/** `elementFromPoint` at a rect's integer-rounded centre, and whether it is inside the hint. */
const HIT_AT = (phrase) => String.raw`
(() => {
  const want = ${JSON.stringify(phrase)};
  const leaf = [...document.querySelectorAll('*')].find((el) =>
    (el.textContent || '').includes(want)
    && ![...el.children].some((k) => (k.textContent || '').includes(want)));
  if (!leaf) return { found: false };
  leaf.scrollIntoView({ block: 'center' });
  const r = leaf.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2);
  const y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  return {
    found: true, x, y,
    rect: { left: r.left, top: r.top, width: r.width, height: r.height },
    dpr: window.devicePixelRatio,
    inside: hit !== null && (hit === leaf || leaf.contains(hit) || hit.contains(leaf)),
    hitTag: hit ? hit.tagName : null,
    hitText: hit ? (hit.textContent || '').slice(0, 60) : null,
  };
})()`;

function sceneOf(doc) { return doc.find((s) => s.id === SCENE_ID) ?? null; }

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const screen = process.env.SCREEN ?? '1680x1050';
  const child = spawn('/usr/bin/xvfb-run',
    ['-a', '-s', `-screen 0 ${screen}x24`, ELECTRON, `${ROOT}/dist/main/index.mjs`],
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

    // ---- D. THE DERIVATION, PRINTED. -------------------------------------
    note('CONTRACT PARSED FROM SOURCE (no sentence is typed in this file):',
      `EFFECTS_V_FACTOR_LOCK=${LOCK}, so the scene is dropped to v_factor ${UNLOCKED_VF}\n        `
      + `from ${PROVIDER_SRC}\n        `
      + `MECHANISM      = "${MECHANISM.slice(0, 72)}…" (${MECHANISM.length} chars)\n        `
      + `REMEDY_LOCK    = "${REMEDY_LOCK}"\n        `
      + `REMEDY_HORIZ   = "${REMEDY_HORIZ}"`);
    check('0y', 'ANTI-VACUOUS: the three parsed clauses are distinct, non-empty, and none contains another',
      MECHANISM.length > 80 && REMEDY_LOCK.length > 20 && REMEDY_HORIZ.length > 20
      && !REMEDY_LOCK.includes(REMEDY_HORIZ) && !REMEDY_HORIZ.includes(REMEDY_LOCK)
      && !MECHANISM.includes(REMEDY_LOCK),
      'a parse that collapsed to "" would make every text row below pass trivially');

    const haveScenes = await c.evalExpr('typeof window.__dbg.aeon.scenesJson === "function"');
    check('0a', 'ANTI-VACUOUS: the build under test has the scene probe at all',
      haveScenes === true, `${ROOT}/dist`);
    if (!haveScenes) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon. ----------------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open, with sections',
      !!(st && st.open && st.sections > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');

    // ---- 2. The Effects facet. -------------------------------------------
    await sleep(2500);
    check('2a', 'the facet bar offers an Effects pill',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1200);

    // ---- 3. THE FIXTURE, BUILT THROUGH THE REAL CONTROLS. -----------------
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    note(`fixture scenes before this run: ${JSON.stringify(scenes0.map((s) => s.id))}`);
    await c.evalExpr(SET_INPUT(
      `document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(800);
    // ⚠ BY `aria-label`, NOT BY TEXT — `IconButton` puts the label in
    // `title`/`aria-label`, so `/^Add$/` on text finds nothing and the harness
    // would go on to assert against a one-layer scene it never built.
    const added = await c.evalExpr(String.raw`
      (() => { const b = document.querySelector('button[aria-label="Add layer"]');
               if (!b) return 'no-button'; b.click(); return 'ok'; })()`);
    await sleep(800);
    check('3a0', 'ANTI-VACUOUS: the Add-layer control was found and clicked',
      added === 'ok', `click result = ${JSON.stringify(added)}`);

    const topField = (i) =>
      `[...document.querySelectorAll('input[type=number]')].find(e => new RegExp('^Layer ${i} (world_y|Screen line)').test(e.title||''))`;
    const vfField = `[...document.querySelectorAll('input[type=number]')].find(e => /^v_factor — /.test(e.title||''))`;
    const vsplitSel = (i) =>
      `[...document.querySelectorAll('select')].find(e => new RegExp('^Layer ${i} vsplit\\\\.at').test(e.title||''))`;

    const setField = async (id, name, selector, value) => {
      const r = await c.evalExpr(SET_INPUT(selector, value));
      check(id, name, r === 'ok', `set result = ${JSON.stringify(r)} (wanted ${value})`);
      await sleep(400);
    };
    await setField('3a1', 'ANTI-VACUOUS: layer 0\'s top field exists and took a value', topField(0), TOP_A);
    await setField('3a2', 'ANTI-VACUOUS: layer 1\'s top field exists and took a value', topField(1), TOP_B);

    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    let sc = sceneOf(doc);
    check('3b', 'ANTI-VACUOUS: the scene exists, has TWO layers, and starts LOCKED',
      !!sc && sc.layers.length === 2 && sc.v_factor === LOCK,
      `id=${sc?.id} v_factor=${sc?.v_factor} layers=${sc?.layers?.length}`);
    if (!sc || sc.layers.length !== 2) {
      throw new Error(`FIXTURE NOT BUILT: expected 2 layers, got ${sc?.layers?.length}. `
        + 'Every row below is unmeasurable and none is reported as green.');
    }

    // =====================================================================
    // 4. ⚠ THE CONTROL, AND IT IS THE WHOLE REASON ANY GREEN BELOW MEANS
    //    ANYTHING. A locked scene WITH A SPLIT is legal, and is what every
    //    shipped scene looks like. It must say NOTHING.
    // =====================================================================
    await setField('4a0', 'the layer card offers a Plane B split control on layer 0', vsplitSel(0), 'at');
    await sleep(600);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    sc = sceneOf(doc);
    check('4a', '⚠ THE CONTROL IS REALLY THE CONTROL: L0 carries a vsplit, L1 does not, scene LOCKED',
      sc.layers[0].vsplit !== undefined && sc.layers[1].vsplit === undefined && sc.v_factor === LOCK,
      `L0.vsplit=${JSON.stringify(sc.layers[0].vsplit)} L1.vsplit=${JSON.stringify(sc.layers[1].vsplit)} `
      + `v_factor=${sc.v_factor} — a locked scene with a split is LEGAL and must be silent`);
    let hits = await c.json(FIND_TEXT(MECHANISM));
    check('4b', '⚠ DISCRIMINATING (silence): a LOCKED scene with a split says NOTHING on screen',
      hits.length === 0,
      `${hits.length} element(s) render the mechanism clause. This is the row that stops `
      + 'an always-on hint being read as a working feature — and the row a deleted feature '
      + 'ALSO passes, which is why 5a exists.');
    await shot(c, '4-locked-with-split-silent');

    // =====================================================================
    // 5. ⚠ THE DISCRIMINATING SECTION, ROUTE A: move v_factor off the lock
    //    while a split is already placed. The author never touches a layer.
    // =====================================================================
    await setField('5a0', 'the v_factor spinner took a camera-tracking shift', vfField, UNLOCKED_VF);
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    sc = sceneOf(doc);
    check('5a1', 'ANTI-VACUOUS: the DOCUMENT now holds the illegal combination',
      sc.v_factor === UNLOCKED_VF && sc.layers[0].vsplit !== undefined,
      `v_factor=${sc.v_factor} (lock is ${LOCK}) L0.vsplit=${JSON.stringify(sc.layers[0].vsplit)} `
      + '— without this, every row below would be asking about a scene that is fine');

    hits = await c.json(FIND_TEXT(MECHANISM));
    check('5a', '⚠ DISCRIMINATING: the MECHANISM is now ON SCREEN, read from the DOM',
      hits.length >= 1,
      `${hits.length} element(s) render it. Paired with 4b (same session, same scene, `
      + 'one field changed), this is the pair a deleted feature cannot pass.');
    check('5b', '⚠ BOTH REMEDIES are on screen — the engine offers two and they are different products',
      (await c.json(FIND_TEXT(REMEDY_LOCK))).length >= 1
      && (await c.json(FIND_TEXT(REMEDY_HORIZ))).length >= 1,
      `lock=${(await c.json(FIND_TEXT(REMEDY_LOCK))).length} horiz=${(await c.json(FIND_TEXT(REMEDY_HORIZ))).length}. `
      + 'The one sentence Aurora had before row 80 offered only the lock.');
    check('5b2', 'the author\'s OWN v_factor value is in the sentence, not a generic prohibition',
      hits.some((h) => h.text.includes(`v_factor ${UNLOCKED_VF}`)),
      `looking for "v_factor ${UNLOCKED_VF}" in: ${JSON.stringify(hits.map((h) => h.text.slice(0, 90)))}`);

    const hit = await c.json(HIT_AT(MECHANISM));
    note(`AIM: dpr=${hit.dpr} rect=${JSON.stringify(hit.rect)} aim=(${hit.x},${hit.y}) `
      + `hit=<${hit.hitTag}>`);
    check('5c', '⚠ RENDERED AND NOT HIDDEN: elementFromPoint at the hint\'s own centre lands INSIDE it',
      hit.found === true && hit.inside === true && hit.rect.width > 0 && hit.rect.height > 0,
      `inside=${hit.inside} hitTag=${hit.hitTag} hitText="${hit.hitText}". `
      + 'A display:none hint still has a textContent; this is what separates the two.');
    check('5d', 'and the browser agrees it is visible (checkVisibility, opacity + CSS)',
      hits.every((h) => h.visible !== false),
      JSON.stringify(hits.map((h) => ({ tag: h.tag, visible: h.visible }))));
    await shot(c, '5-unlocked-by-v_factor');

    // =====================================================================
    // 6. THE SCENE SENTENCE NAMES WHICH LAYERS — the fact route A destroys.
    // =====================================================================
    const NAMES_L0 = 'layer 0 authors a Plane B split';
    check('6a', 'the v_factor route names WHICH layer is now illegal (it never touched one)',
      (await c.json(FIND_TEXT(NAMES_L0))).length >= 1,
      `looking for "${NAMES_L0}" on screen`);
    // Give layer 1 a split too, so the plural arm is exercised on screen.
    await setField('6b0', 'the layer card offers a Plane B split control on layer 1', vsplitSel(1), 'at');
    await sleep(700);
    const NAMES_BOTH = 'layers 0, 1 author Plane B splits';
    check('6b', 'with two splits it names both, in order',
      (await c.json(FIND_TEXT(NAMES_BOTH))).length >= 1,
      `looking for "${NAMES_BOTH}" on screen`);

    // =====================================================================
    // 7. TWO PLACES, MEASURED BY DOM ORDER — not by the app's own word.
    // =====================================================================
    const LAYER_SUBJECT = 'this layer authors a Plane B split while';
    const order = await c.json(DOM_ORDER(NAMES_BOTH));
    check('7a', 'the SCENE sentence sits between the v_factor spinner and the layer cards',
      order.found === true && order.afterVFactor === true && order.beforeLayer0 === true,
      JSON.stringify(order));
    const orderL = await c.json(DOM_ORDER(LAYER_SUBJECT));
    check('7b', 'the LAYER sentence sits on a layer card, below layer 0\'s split control',
      orderL.found === true && orderL.beforeLayer0 === false,
      JSON.stringify(orderL));
    const layerHits = await c.json(FIND_TEXT(LAYER_SUBJECT));
    check('7c', 'ANTI-VACUOUS: there are TWO layer sentences, one per split layer',
      layerHits.length === 2,
      `${layerHits.length} element(s). Both layers carry a split now, so both cards speak.`);
    await shot(c, '7-two-sentences');

    // =====================================================================
    // 8. ⚠ ADVISORY, NOT PREVENTION — this parcel is not allowed to clamp.
    // =====================================================================
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    sc = sceneOf(doc);
    check('8a', 'the DOCUMENT still holds the illegal combination, unrewritten (ROADMAP rows 37/58)',
      sc.v_factor === UNLOCKED_VF
      && sc.layers[0].vsplit !== undefined && sc.layers[1].vsplit !== undefined,
      `v_factor=${sc.v_factor} splits=${JSON.stringify(sc.layers.map((l) => l.vsplit))} `
      + '— an advisory that silently fixed the document would pass every text row above');
    const vfVal = await c.evalExpr(`(${vfField}).value`);
    check('8b', 'and the v_factor spinner still SHOWS the value the author typed',
      Number(vfVal) === UNLOCKED_VF, `spinner reads ${JSON.stringify(vfVal)}`);

    // =====================================================================
    // 9. ⚠ THE DISCRIMINATING SECTION, ROUTE B: the reverse gesture.
    //    Re-lock -> silence returns. Then unlock with NO split -> still
    //    silent. Then add the split -> the LAYER sentence appears.
    // =====================================================================
    await setField('9a0', 'the v_factor spinner took the lock sentinel back', vfField, LOCK);
    await sleep(700);
    check('9a', '⚠ DISCRIMINATING: re-locking the plane CLEARS the sentence — it is not permanent chrome',
      (await c.json(FIND_TEXT(MECHANISM))).length === 0,
      'if this row is red the section-5 pass means "some text is always there"');
    await setField('9b0', 'layer 0\'s split turned back off', vsplitSel(0), 'none');
    await setField('9b1', 'layer 1\'s split turned back off', vsplitSel(1), 'none');
    await setField('9b2', 'the v_factor spinner unlocked again, with NO split anywhere', vfField, UNLOCKED_VF);
    await sleep(700);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'));
    sc = sceneOf(doc);
    check('9b', '⚠ DISCRIMINATING (the other silence): unlocked with NO split is a LEGAL scene and says nothing',
      sc.v_factor === UNLOCKED_VF
      && sc.layers.every((l) => l.vsplit === undefined || l.vsplit === 'none')
      && (await c.json(FIND_TEXT(MECHANISM))).length === 0,
      `v_factor=${sc.v_factor} splits=${JSON.stringify(sc.layers.map((l) => l.vsplit))}. `
      + 'A build that keyed only on v_factor would shout at every camera-tracked scene in the game.');
    await setField('9c0', 'layer 1\'s split turned on, on the already-unlocked scene', vsplitSel(1), 'at');
    await sleep(700);
    hits = await c.json(FIND_TEXT(LAYER_SUBJECT));
    check('9c', '⚠ DISCRIMINATING: turning the SPLIT on (route B) makes the layer card speak',
      hits.length === 1,
      `${hits.length} sentence(s); expected exactly one, on layer 1's card. `
      + 'Routes A and B are different gestures and this is the one the layer card owns.');
    check('9d', 'and it carries the mechanism and BOTH remedies, same as route A — one rule, not two',
      hits.length === 1 && hits[0].text.includes(MECHANISM)
      && hits[0].text.includes(REMEDY_LOCK) && hits[0].text.includes(REMEDY_HORIZ),
      `text="${hits[0]?.text?.slice(0, 120)}…"`);
    await shot(c, '9-route-b-layer-card');

    // ---- 10. Leave the tree as found. ------------------------------------
    const undo = async () => {
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await c.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, modifiers: 2 });
      await sleep(400);
    };
    let undos = 0;
    for (let i = 0; i < 80; i++) {
      if (!(await c.evalExpr('window.__dbg.aeon.canUndo()'))) break;
      await undo();
      undos++;
    }
    const scenesEnd = await c.json('window.__dbg.aeon.scenes()');
    check('10a', 'the whole session undoes back to the fixture — nothing was saved',
      undos > 0 && JSON.stringify(scenesEnd.map((s) => s.id)) === JSON.stringify(scenes0.map((s) => s.id)),
      `${undos} undos; left ${JSON.stringify(scenesEnd.map((s) => s.id))}, `
      + `found ${JSON.stringify(scenes0.map((s) => s.id))}`);
  } finally {
    try { await c?.send('Page.reload'); } catch { /* going away anyway */ }
    c?.close();
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:'); for (const f of fails) console.log(`  ${f}`); }
  console.log(
    '\nROWS THAT DO NOT DISCRIMINATE, named so nobody counts them twice:\n'
    + '  [0y] [0a] [1a] [2a] [3a0] [3a1] [3a2] [3b] [4a0] [4a] [5a0] [5a1] [6b0] [9a0] [9b0]\n'
    + '  [9b1] [9b2] [9c0] [10a] — setup and anti-vacuous rows. They prove the instrument\n'
    + '      built and saw its subject; none can fail for the ADVISORY being wrong.\n'
    + '  [8b] — reads a spinner back. It would go red only if something clamped v_factor,\n'
    + '      which this parcel is forbidden from doing; it guards a non-goal.\n'
    + 'THE DISCRIMINATING ROWS: [4b] [5a] [5b] [5b2] [5c] [5d] [6a] [6b] [7a] [7b] [7c]\n'
    + '  [8a] [9a] [9b] [9c] [9d].\n'
    + '  [4b]+[5a] are the PAIR: one scene, one field changed, silent then speaking. Neither\n'
    + '      alone discriminates — [4b] alone is what a DELETED feature returns, [5a] alone is\n'
    + '      what an ALWAYS-ON hint returns.\n'
    + '  [9a]+[9b] are the two silences a broken build cannot both produce: re-locking with a\n'
    + '      split, and unlocking without one.\n'
    + '  [5c] is the one a published-but-unpainted sentence cannot survive.\n'
    + '  [5b] is the one an advisory offering a single remedy cannot survive.\n'
    + '  [7a]/[7b] are the ones a single sentence rendered in one place cannot survive.\n'
    + '\n'
    + '⚠ THE ALTERNATIVE GREEN PATH, RULED OUT AND NAMED — measured, not reasoned.\n'
    + '  The 5-series asks "is the sentence ON SCREEN", and there are THREE surfaces that\n'
    + '  could put it there, because `splitRefusal` on the raster timeline strip composes the\n'
    + '  same clauses. So 5a-5d can go green on the STRIP alone, with the panel still silent —\n'
    + '  which is very nearly the original defect. This was verified by running this harness\n'
    + '  against a build carrying origin/master\'s EffectsScenePanel.tsx and this branch\'s\n'
    + '  provider: 29/36, with [6a] [6b] [7a] [7b] [7c] [9c] [9d] RED and [5a] [5b] [5c] [5d]\n'
    + '  still GREEN off the strip.\n'
    + '  THE ROWS THAT ARE ABOUT THE PANEL ARE THEREFORE: [6a] [6b] (the scene sentence names\n'
    + '  which layers — only the v_factor row can), [7a] [7b] [7c] (DOM ORDER pins one\n'
    + '  sentence between the v_factor spinner and the cards, and one per card), and\n'
    + '  [9c] [9d] (route B: the layer card speaks when the split is turned on).');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
