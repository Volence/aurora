#!/usr/bin/env node
// CAN AN AUTHOR OPEN A BAND'S *STATIC SLOT* IN THE COMPOSER — IN THE RUNNING APP?
//
// ROADMAP row 57. `openBgTileDocument` shipped with row 51 and then sat with
// ZERO CALLERS outside its own tests for a day: the composer could open a phase
// BANK (the band card's strip) and could not open a STATIC SLOT from anywhere.
// It was never broken. It was UNREACHABLE.
//
// ═══ WHY THIS FILE EXISTS AND A VITEST ROW CANNOT REPLACE IT ═══
//
// `openBgTileDocument` was FULLY UNIT-TESTED the whole time it was unreachable.
// ~5,000 vitest tests pass over this feature and not one of them can tell a
// wired `onDoubleClick` from an absent one, because the node suite cannot see
// React, a canvas or a mouse. A unit test asserting "the new door works" would
// reproduce the exact defect this row is about. So the reachability proof is
// here: the REAL app, under CDP, performing the REAL human gesture.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. THE ROW'S OWN TARGET — a STATIC slot PAST THE ANIMATED PREFIX. The prefix
//    was already reachable through bank 0, which IS the prefix, so a door that
//    only reached prefix slots would close nothing. [4b] asserts the opened
//    slot is `>= bandBudget().firstPromotableSlot`, read off the app.
//
// 2. THE ALTERNATIVE GREEN PATH: THE BANK DOOR. A row that only proved "a
//    document opened" would be satisfied by `openBandBankDocument`, which
//    already worked. So [4b] asserts WHICH target — `bgOverride.kind === 'tile'`
//    and the tile INDEX — plus the composer document's own 1x1 dimensions,
//    which no bank document on this project can have (its band is 8x4).
//
// 3. "SOME DOCUMENT OPENED" MORE GENERALLY. [4a] asserts nothing was open
//    first, and [4c] double-clicks a SECOND static slot and requires the
//    reported target to MOVE — the only thing separating a door that opens
//    slot n from a door that opens something.
//
// 4. THE RANGE DRAG, COLLIDED WITH. The strip already owns a drag gesture
//    (`resolveStripDrag`, item 43 wave 2). Section 6 runs a real 11-slot drag
//    AFTER the door is installed and requires it to still resolve to a `range`
//    with the base and cols re-derived HERE — and [6b] requires that drag to
//    have opened NO document, which is the collision proof in the other
//    direction.
//
// 5. THE GATE FALLING OPEN. Section 7 repeats the identical double click on the
//    FOREGROUND strip, where the same integers name the zone tileset. Nothing
//    may open. `stripOpen().gestures` advancing is what separates "correctly
//    ignored" from "the handler is not wired at all" — the two leave
//    byte-identical state, and that is this row's own defect class one surface
//    over.
//
// 6. A DOCUMENT WRITE. [8a] hashes the whole override at the start and the end.
//    Opening a document writes nothing.
//
// ═══ AIM AT INTEGERS. THE CANVAS RECT IS NOT INTEGRAL. ═══
//
// `devicePixelRatio` varies between runs in this environment (1 and 1.35 both
// observed hours apart), and at anything but 1 the canvas rect is fractional.
// Asking CDP for a fractional client coordinate delivers a NEIGHBOURING cell,
// and it presents as an off-by-one in the feature when the feature is fine. So
// every aim is an INTEGER, re-derived through the app's OWN slot formula before
// it is used, rejected if it does not come back to the slot it was built for,
// and finally CHECKED AGAINST THE SLOT THE APP SAYS IT SAW. dpr, the rect and
// the pitch are PRINTED every run. `SCALE=1.35 node …` forces the fractional
// condition rather than waiting for it.
//
// ═══ NOT COVERED HERE, AND SAYING SO RATHER THAN IMPLYING IT IS ═══
//
// `resolveStripOpen`'s LOUD refusal — the BG layer showing a background that is
// not the override (a library entry or the act's own plane) — has no CDP row.
// This project's act paints the override in every section, so there is no
// section to drive it from; the branch is held by node rows in
// `providers/__tests__/bg-anim-art.test.ts` instead. Section 7 covers the
// SILENT half of the same gate (the foreground) on the real app.
//
// ⚠ IT WRITES NOTHING TO DISK. Ctrl+S is never pressed and no command is run.
//   It still opens a hardlinked COPY of the aeon tree, and [8b] proves the live
//   file is byte-identical afterwards.
//
// ⚠ NO EMULATOR. Nothing here touches oracle or any emulator MCP tool.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/bganim-tile-door-harness.mjs
//                          (xvfb-run is spawned internally)

import { spawn, execFileSync } from 'node:child_process';
import {
  writeFileSync, mkdirSync, existsSync, readFileSync, rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9418);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
// ⚠ A HARNESS CANNOT LAUNCH FROM A WORKTREE WITHOUT THIS FALLBACK.
// `node_modules/.bin/electron` does not exist in a git worktree, and the
// failure presents as `CDP target never appeared` — a message that says nothing
// about the real cause. Every harness here carries it.
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const LIVE_AEON = process.env.LIVE_AEON ?? '/home/volence/sonic_hacks/aeon';
const WORKTREE = `${ROOT}/scratchpad/fixtures/aeon-tile-door`;
if (WORKTREE.replace(/\/$/, '') === LIVE_AEON.replace(/\/$/, '')) {
  throw new Error('refusing to run against the LIVE aeon tree');
}
const SHOTS = `${ROOT}/scratchpad/shots-tile-door`;
mkdirSync(SHOTS, { recursive: true });
const SCREEN = process.env.SCREEN ?? '1680x1050';

// ── EVERY CONSTANT IS READ OFF THE SOURCE, NOT TYPED ────────────────────────
// A literal 16/18 here would be a PIN: it would keep passing if the component's
// grid changed under it, by aiming at the cell this file wants instead of the
// cell the app draws. Both numbers come out of `ArtBrowser.tsx` in this process.
const STRIP = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/components/ArtBrowser.tsx`, 'utf8');
  const size = /const itemSize = (\d+);/.exec(src);
  const gap = /Math\.floor\(canvas\.width \/ \(itemSize \+ (\d+)\)\)/.exec(src);
  if (!size || !gap) {
    throw new Error('ArtBrowser.tsx no longer spells `const itemSize = N` and `canvas.width / (itemSize + G)`');
  }
  return { size: Number(size[1]), pitch: Number(size[1]) + Number(gap[1]) };
})();
/** The override's path, out of the consumer contract rather than typed. */
const OVERRIDE_REL = JSON.parse(readFileSync(
  join(ROOT, 'src/core/formats/bg-override/bganim-consumer-contract.json'), 'utf8')).path;
/** The composer's document name for a static slot, read off the provider. */
const TILE_DOC_NAME = (() => {
  const src = readFileSync(`${ROOT}/src/renderer/providers/bg-anim-art.ts`, 'utf8');
  const m = /name: `BG tile #\$\{tileIndex\}`/.exec(src);
  if (!m) throw new Error('bg-anim-art.ts no longer names a tile document `BG tile #${tileIndex}`');
  return (i) => `BG tile #${i}`;
})();

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
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
  throw new Error(`CDP target never appeared (electron=${ELECTRON})`);
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
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
/** A THIRD VERDICT, AND IT IS NOT GREEN. A row that could not see its subject
 *  must never render as a pass, and must never render as 0. */
function unmeasurable(id, name, why) {
  console.log(`NOT-MEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: false, nm: true });
  unmeasured.push(`[${id}] ${name} — ${why}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-tile-door/${name}.png`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

/** Open one CollapsibleSection by header text. */
const SECTION_STATE = (re, click) => String.raw`
(() => {
  const isHeader = (el) => {
    if (el.tagName !== 'DIV') return false;
    const cs = getComputedStyle(el);
    return cs.textTransform === 'uppercase' && cs.letterSpacing === '1px'
      && !!el.firstElementChild && el.firstElementChild.tagName === 'SPAN';
  };
  const hdr = [...document.querySelectorAll('div')].filter(isHeader)
    .find((h) => ${re}.test((h.firstElementChild.textContent || '').trim()));
  if (!hdr) return 'no-section';
  const open = hdr.parentElement.parentElement.children.length > 1;
  if (!${click ? 'true' : 'false'}) return open ? 'open' : 'collapsed';
  if (open) return 'already-open';
  hdr.click();
  return 'clicked';
})()`;

/** The strip canvas box, its backing-store width, and the count row beside it. */
const STRIP_GEOM = String.raw`
(() => {
  const cv = document.getElementById('art-browser-canvas');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  const label = [...document.querySelectorAll('span')]
    .map(e => (e.textContent || '').trim())
    .filter(t => /^\d+ (background )?tiles$/.test(t));
  return {
    left: r.left, top: r.top, width: r.width, height: r.height,
    cw: cv.width, ch: cv.height, countLabels: label,
    inWindow: r.top >= 0 && r.left >= 0
      && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
  };
})()`;

const HOVER_LABEL = String.raw`
((el) => el ? { text: el.textContent || '', title: el.title || '' } : null)(
  document.getElementById('art-browser-hover-label'))`;

/** Every crosshair-cursor canvas with its CSS box — the composer is found among
 *  these BY THE OPEN DOCUMENT'S OWN DIMENSIONS, never as "the only canvas". */
const CROSSHAIR_CANVASES = String.raw`
(() => [...document.querySelectorAll('canvas')]
  .filter((cv) => getComputedStyle(cv).cursor === 'crosshair')
  .map((cv) => { const r = cv.getBoundingClientRect();
    return { cssW: Math.round(r.width), cssH: Math.round(r.height) }; }))()`;

/**
 * THE RANGE RULE, RE-DERIVED HERE — a SECOND implementation of the ruled
 * arithmetic rather than a call into the app, so section 6 proves two
 * independent walks agree rather than asking the app to grade itself.
 */
function expectRange(anchor, release, rows, firstPromotableSlot, blobTileCount) {
  const lo = Math.min(anchor, release);
  const hi = Math.max(anchor, release);
  const base = Math.max(lo, firstPromotableSlot);
  if (base > hi) return { kind: 'refused' };
  const maxCols = Math.floor((blobTileCount - base) / rows);
  if (maxCols < 1) return { kind: 'refused' };
  const run = hi - base + 1;
  return { kind: 'range', base, cols: Math.min(Math.max(1, Math.floor(run / rows)), maxCols) };
}

// ── THE FIXTURE TREE ────────────────────────────────────────────────────────
function freshCopy() {
  rmSync(WORKTREE, { recursive: true, force: true });
  mkdirSync(dirname(WORKTREE), { recursive: true });
  execFileSync('cp', ['-al', LIVE_AEON, WORKTREE]);
  // Break the hardlink on the one file this run could conceivably touch.
  const p = join(WORKTREE, OVERRIDE_REL);
  const text = readFileSync(p, 'utf8');
  rmSync(p);
  writeFileSync(p, text);
  return p;
}

async function main() {
  const overridePath = freshCopy();
  const liveOverride = join(LIVE_AEON, OVERRIDE_REL);
  const liveBefore = sha(readFileSync(liveOverride));
  const beforeText = readFileSync(overridePath, 'utf8');
  const beforeDoc = JSON.parse(beforeText);
  console.log(`\n=== ROW 57 — THE DOOR TO A STATIC SLOT. aeon tree opened is a COPY: ${WORKTREE}`);
  console.log(`    override: ${beforeDoc.tiles.length} tiles, ${beforeDoc.layout.length} layout words, `
    + `${(beforeDoc.anims ?? []).length} band(s)\n`);

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
    ['-a', '-s', `-screen 0 ${SCREEN}x24`, ELECTRON,
      ...(process.env.SCALE ? [`--force-device-scale-factor=${process.env.SCALE}`] : []),
      `${ROOT}/dist/main/index.mjs`],
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

    // ---- 0. PROVENANCE ----------------------------------------------------
    // `__dbg.aeon.stripOpen` is introduced by THIS branch and exists nowhere on
    // master. Without this row every PASS below could describe a build that has
    // none of row 57 in it.
    const haveProbe = await c.evalExpr('typeof window.__dbg.aeon.stripOpen === "function"');
    check('0a', 'the build under test contains row 57\'s strip-open probe (this branch, not master)',
      haveProbe === true, `${ROOT}/dist`);
    if (!haveProbe) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npm run build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open the aeon copy --------------------------------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(WORKTREE)})`)
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
    await sleep(2500);

    // ---- 2. THE LAYOUT FACET, THE BG LAYER, AND THE SUBJECT ---------------
    /** Put the app back on the strip. `switchFacet(..., 'art')` leaves it on the
     *  Art facet after every successful double click, and `ArtBrowser` lives in
     *  the LAYOUT facet — so the next gesture finds no strip unless this runs.
     *  (The band-art harness learned the same thing the hard way: without it a
     *  perfectly good feature reports as "did not open".) */
    const goToStrip = async () => {
      await c.evalExpr(clickByText('/^Layout$/'));
      await sleep(1300);
      await c.evalExpr(SECTION_STATE('/^Art/', true));
      await sleep(500);
    };
    await goToStrip();
    check('2a', 'the facet bar offers a Layout pill and the Art section is on screen',
      (await c.evalExpr(`!!document.getElementById('art-browser-canvas')`)) === true);
    await c.evalExpr('window.__dbg.aeon.setLayer("bg")');
    await sleep(900);

    const bgSource = await c.evalExpr('window.__dbg.aeon.bgSource()');
    const budget = await c.json('window.__dbg.aeon.bandBudget()');
    const bands = await c.json('window.__dbg.aeon.bands()');
    const sel0 = await c.json('window.__dbg.aeon.selectedTile()');
    const hash0 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    const geom0 = await c.json(STRIP_GEOM);
    const stripCount = geom0 && geom0.countLabels.length > 0
      ? Number(/^(\d+)/.exec(geom0.countLabels[0])[1]) : null;
    const FPS = budget.firstPromotableSlot;

    // THE SUBJECT ASSERTION. A slot index only means something in THIS
    // document's blob, so this run is only about this feature when the strip IS
    // that blob — asserted through the count row the panel prints, not assumed.
    // AND there must be static slots PAST the prefix, or the row's own target
    // does not exist on this project.
    check('2c', 'ANTI-VACUOUS: the BG layer is picking, the strip IS this document\'s blob (its '
      + 'count row equals bandBudget().tiles), there is a real animated prefix, AND there are '
      + 'static slots past it — which is the only thing row 57 is about',
      bgSource === 'override' && sel0.layer === 'bg'
      && stripCount !== null && stripCount === budget.tiles
      && bands.length > 0 && FPS > 0 && budget.tiles > FPS,
      `bgSource=${bgSource} layer=${sel0.layer} countRow=${JSON.stringify(geom0 && geom0.countLabels)} `
      + `budget=${JSON.stringify(budget)} bands=${bands.length} `
      + `static slots = ${FPS}..${budget.tiles - 1} hash=${hash0}`);
    if (bgSource !== 'override' || bands.length === 0 || !(budget.tiles > FPS)) {
      throw new Error('the subject is not what this harness measures — see [2c]');
    }

    // ---- 3. THE STRIP'S BOX, AND INTEGER AIMS -----------------------------
    const dpr = await c.evalExpr('window.devicePixelRatio');
    const geom = await c.json(STRIP_GEOM);
    note(`ENVIRONMENT  devicePixelRatio=${dpr}  stripRect=${JSON.stringify(geom)}  `
      + `itemSize=${STRIP.size} pitch=${STRIP.pitch} (read off ArtBrowser.tsx)  screen=${SCREEN}`
      + `${process.env.SCALE ? `  SCALE=${process.env.SCALE} (forced)` : ''}`);
    const gridColsOf = (g) => Math.max(1, Math.floor(g.cw / STRIP.pitch));
    const gridCols = gridColsOf(geom);
    const gridRows = Math.floor(geom.height / STRIP.pitch);
    check('3a', 'ANTI-VACUOUS: the strip canvas is mounted, inside the window, with a grid big '
      + 'enough to reach a static slot without scrolling',
      !!geom && geom.inWindow && geom.width > 100 && geom.height > 40
      && gridCols >= 4 && gridRows >= 2,
      `${gridCols} cols x ${gridRows} visible rows, box=${JSON.stringify(geom)}`);
    if (!geom || !geom.inWindow) throw new Error('the strip canvas is not usable — see [3a]');

    /**
     * An INTEGER client aim for a strip slot, and the slot that aim RE-DERIVES
     * to through the app's OWN formula. Null when the two differ, so a
     * fractional rect can never make a row assert a slot the app never saw.
     * `scrollTop` is 0 for the whole run — nothing here wheels the strip — and
     * every row below cross-checks against the slot the APP reports.
     */
    const aimIn = (g, cols) => (slot) => {
      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const cx = Math.round(g.left + col * STRIP.pitch + STRIP.size / 2);
      const cy = Math.round(g.top + row * STRIP.pitch + STRIP.size / 2);
      if (cx < g.left || cy < g.top
        || cx > g.left + g.width - 1 || cy > g.top + g.height - 1) return null;
      if (Math.floor((cx - g.left) / STRIP.pitch) !== col
        || Math.floor((cy - g.top) / STRIP.pitch) !== row) return null;
      return { x: cx, y: cy, slot, col, row };
    };
    const aimFor = aimIn(geom, gridCols);

    const press = async (p, n = 1) => c.send('Input.dispatchMouseEvent',
      { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: n, buttons: 1 });
    const release = async (p, n = 1) => c.send('Input.dispatchMouseEvent',
      { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: n, buttons: 0 });
    const move = async (p) => c.send('Input.dispatchMouseEvent',
      { type: 'mouseMoved', x: p.x, y: p.y, button: 'left', clickCount: 0, buttons: 1 });
    /** A REAL double click: two press/release pairs at one point, the second
     *  with clickCount 2, which is what makes the DOM emit `dblclick`. */
    const doubleClick = async (p) => {
      await press(p, 1); await sleep(40); await release(p, 1); await sleep(60);
      await press(p, 2); await sleep(40); await release(p, 2); await sleep(1500);
    };
    const dragSlots = async (a, b) => {
      await press(a); await sleep(90);
      if (a.x !== b.x || a.y !== b.y) { await move(b); await sleep(90); }
      await release(b); await sleep(450);
    };

    // The two static slots this run opens. DERIVED from the app's own prefix
    // boundary, never typed: `FPS + k` is past the prefix by construction, and
    // [2c] already proved such slots exist.
    const SLOT_A = FPS + 5;
    const SLOT_B = FPS + 17;
    const aimA = aimFor(SLOT_A);
    const aimB = aimFor(SLOT_B);
    const artOpen = () => c.json('window.__dbg.aeon.bgArtOpen()');
    const openRep = () => c.json('window.__dbg.aeon.stripOpen()');

    check('3b', `ANTI-VACUOUS: integer aims exist for static slots ${SLOT_A} and ${SLOT_B} and both `
      + 're-derive to the slot they were built for',
      !!aimA && !!aimB && SLOT_A >= FPS && SLOT_B >= FPS
      && SLOT_A < budget.tiles && SLOT_B < budget.tiles,
      `firstPromotableSlot=${FPS}  A=${JSON.stringify(aimA)}  B=${JSON.stringify(aimB)}`);
    if (!aimA || !aimB) throw new Error('no usable aim for a static slot — see [3b]');

    // ---- 4. THE ROW: A DOUBLE CLICK OPENS *THAT STATIC SLOT* --------------
    const openedBefore = await artOpen();
    const gest0 = (await openRep()).gestures;
    check('4a', 'ANTI-VACUOUS: no BG-override document is open before the gesture, so [4b] measures '
      + 'the door rather than something already on screen',
      openedBefore === null, JSON.stringify(openedBefore));

    await doubleClick(aimA);
    const repA = await openRep();
    const openA = await artOpen();

    check('4b', `THE ROW — double-clicking strip slot ${SLOT_A} (a STATIC slot, past the animated `
      + `prefix at ${FPS}) opens THAT SLOT in the Art facet's composer. Asserts WHICH target, not `
      + 'that something opened: kind "tile" and the index — the bank door that already worked '
      + 'produces kind "bank", and its document is the band\'s cols x rows, never 1x1',
      repA.gestures === gest0 + 1 && repA.kind === 'open' && repA.slot === SLOT_A
      && repA.openedTileIndex === SLOT_A
      && !!openA && openA.target.kind === 'tile' && openA.target.tileIndex === SLOT_A
      && SLOT_A >= FPS
      && openA.widthTiles === 1 && openA.heightTiles === 1
      && openA.name === TILE_DOC_NAME(SLOT_A) && openA.dirty === false,
      `report=${JSON.stringify(repA)}\n        open=${JSON.stringify(openA)}`
      + `\n        aimed client (${aimA.x},${aimA.y}) → slot ${SLOT_A}; prefix is 0..${FPS - 1}`);
    if (!openA || openA.target.kind !== 'tile') {
      throw new Error(`slot ${SLOT_A} did not open — see [4b]`);
    }
    await shot(c, 'composer-static-slot-a');

    // THE TARGET MUST MOVE. Every static slot opens a composer of identical
    // size and aspect, so "a 1x1 document appeared" is true after
    // double-clicking any of them. A second slot is what separates
    // openBgTileDocument(slot) from openBgTileDocument(anything).
    await goToStrip();
    const geomB = await c.json(STRIP_GEOM);
    check('4c-pre', 'ANTI-VACUOUS: the strip box did not move across the facet round trip, so the '
      + 'aims computed in section 3 still land',
      !!geomB && geomB.left === geom.left && geomB.top === geom.top
      && geomB.cw === geom.cw && geomB.height === geom.height,
      `before=${JSON.stringify(geom)}\n        after =${JSON.stringify(geomB)}`);
    await doubleClick(aimB);
    const repB = await openRep();
    const openB = await artOpen();
    check('4c', `and the target MOVES — double-clicking slot ${SLOT_B} opens slot ${SLOT_B}, not `
      + `the ${SLOT_A} that was already open`,
      repB.gestures === gest0 + 2 && repB.openedTileIndex === SLOT_B
      && !!openB && openB.target.kind === 'tile' && openB.target.tileIndex === SLOT_B
      && openB.name === TILE_DOC_NAME(SLOT_B),
      `report=${JSON.stringify(repB)}\n        open=${JSON.stringify(openB)}`);

    // THE FACET REALLY SWITCHED. The composer surface is identified through the
    // OPEN DOCUMENT'S OWN dimensions — never "the only crosshair canvas", since
    // the map and the thumbnails are canvases too.
    const canvases = await c.json(CROSSHAIR_CANVASES);
    const docPx = 8;   // a 1x1 tile document, TILE_WIDTH_PX
    const surface = canvases.find((k) => k.cssW > 0 && k.cssH > 0
      && Math.abs(k.cssW - k.cssH) <= 1 && k.cssW / docPx >= 2);
    check('4d', 'the app really switched to the Art facet — a composer surface is on screen at the '
      + 'open document\'s own 1x1 tile (8x8 doc px), square, at 2x or better',
      !!surface, `crosshair canvases ${JSON.stringify(canvases)}`);

    // ---- 5. THE PREFIX SLOT STILL ANSWERS, AND AS A TILE -------------------
    // Not the row's target (bank 0 already reaches the prefix) but the door must
    // not throw on it and must not open a BANK for it.
    await goToStrip();
    const aim0 = aimFor(0);
    if (!aim0) {
      unmeasurable('5a', 'a prefix slot opens as a tile target', 'no integer aim for slot 0');
    } else {
      await doubleClick(aim0);
      const rep0 = await openRep();
      const open0 = await artOpen();
      check('5a', 'a PREFIX slot opens too, and as a TILE target (its writes land in the owning '
        + 'band\'s phases[0]) — not a throw, and not a bank document',
        rep0.kind === 'open' && rep0.openedTileIndex === 0
        && !!open0 && open0.target.kind === 'tile' && open0.target.tileIndex === 0
        && open0.widthTiles === 1 && open0.heightTiles === 1,
        `report=${JSON.stringify(rep0)}\n        open=${JSON.stringify(open0)}  (prefix is 0..${FPS - 1})`);
    }

    // ---- 6. THE RANGE DRAG STILL WORKS ------------------------------------
    // The strip already owned a drag. This section is the collision proof: a
    // real 11-slot run, resolved by the app, checked against arithmetic done
    // HERE — and then the mirror, that the drag opened no document.
    // ⚠ `rows` IS PINNED THROUGH THE PANEL'S OWN CONTROL FIRST. It defaults to 1
    // here, and at rows=1 the drag's floor-division is the identity — an 11-slot
    // run resolves to 11 columns whatever the snapping code does, so the row
    // would agree with almost any arithmetic. At rows=4 the same run must snap
    // DOWN to 2 columns, which is a number only the real rule produces.
    const ROWS = 4;
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(1400);
    await c.evalExpr(SECTION_STATE('/^New band/', true));
    await sleep(500);
    const setRows = await c.evalExpr(String.raw`
      (() => {
        const el = [...document.querySelectorAll('select')].find(e => /^rows —/.test(e.title || ''));
        if (!el) return 'no-element';
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
          .call(el, ${JSON.stringify(String(ROWS))});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
      })()`);
    await sleep(500);
    const candRows = (await c.json('window.__dbg.aeon.bandCandidate()')).rows;
    check('6-pre', `ANTI-VACUOUS for the drag: the panel's own Rows control really set rows=${ROWS}, `
      + 'so the run below has to SNAP rather than pass through',
      setRows === 'ok' && candRows === ROWS,
      `setRows=${setRows} candidate rows=${candRows}`);
    await goToStrip();
    const dragFrom = FPS + 2;
    const dragTo = dragFrom + 10;                 // an 11-slot run, not a whole
    const aimD0 = aimFor(dragFrom), aimD1 = aimFor(dragTo);   // number of columns
    const openBeforeDrag = await artOpen();
    const dragGest0 = (await c.json('window.__dbg.aeon.stripDrag()')).gestures;
    const openGest0 = (await openRep()).gestures;
    if (!aimD0 || !aimD1) {
      unmeasurable('6a', 'the range drag still resolves after the door was installed',
        `no integer aim for slots ${dragFrom}/${dragTo}`);
    } else {
      await dragSlots(aimD0, aimD1);
      const repDrag = await c.json('window.__dbg.aeon.stripDrag()');
      const want = expectRange(dragFrom, dragTo, ROWS, FPS, budget.tiles);
      check('6a', `THE DRAG IS UNTOUCHED — a real ${dragTo - dragFrom + 1}-slot run on the strip still `
        + `resolves to a RANGE, with staticBase and cols matching arithmetic done in this file`,
        repDrag.gestures === dragGest0 + 1 && repDrag.kind === 'range'
        && repDrag.anchorSlot === dragFrom && repDrag.releaseSlot === dragTo
        && want.kind === 'range'
        && repDrag.staticBase === want.base && repDrag.cols === want.cols,
        `app=${JSON.stringify(repDrag)}\n        this file expected ${JSON.stringify(want)} `
        + `(rows=${ROWS}, firstPromotableSlot=${FPS}, blob=${budget.tiles})`);
      const openAfterDrag = await artOpen();
      const openGest1 = (await openRep()).gestures;
      check('6b', 'and the drag opened NOTHING — no double click was synthesised by the press/release '
        + 'pair, so the two gestures cannot reach each other',
        same(openAfterDrag, openBeforeDrag) && openGest1 === openGest0,
        `before=${JSON.stringify(openBeforeDrag)}\n        after =${JSON.stringify(openAfterDrag)}`
        + `\n        strip-open gestures ${openGest0} -> ${openGest1}`);
    }

    // ---- 7. THE GATE: THE FOREGROUND STRIP IS NOT A DOOR -------------------
    // The same integers name the zone tileset there. Nothing may open — and
    // `gestures` advancing is what separates "correctly ignored" from "the
    // handler is not wired at all", which is this row's own defect class.
    await goToStrip();
    await c.evalExpr('window.__dbg.aeon.setLayer("fg")');
    await sleep(1000);
    // ⚠ RE-READ THE BOX. The band-card row only renders in BG, so the container
    // is 90px shorter in FG and every aim from section 3 is stale.
    const geomFg = await c.json(STRIP_GEOM);
    const fgCols = geomFg ? gridColsOf(geomFg) : 0;
    const aimFg = geomFg ? aimIn(geomFg, fgCols)(SLOT_A) : null;
    const srcFg = await c.json('window.__dbg.aeon.selectedTile()');
    const openBeforeFg = await artOpen();
    const gestBeforeFg = (await openRep()).gestures;
    note(`FG BOX  ${JSON.stringify(geomFg)}  cols=${fgCols}  aim=${JSON.stringify(aimFg)}`);
    if (!aimFg || srcFg.layer !== 'fg') {
      unmeasurable('7a', 'a double click on the FOREGROUND strip opens nothing',
        `layer=${srcFg.layer} aim=${JSON.stringify(aimFg)} box=${JSON.stringify(geomFg)}`);
    } else {
      // ⚠ A SENTINEL, NOT AN EMPTY STRING. The line starts empty on a fresh
      // mount, so asserting `text === ''` afterwards would pass on a build that
      // never ran the handler at all — the same "green on an empty screen" trap
      // this file's header warns about. Writing a value first means the row is
      // asserting that the SILENT branch left it alone, which is a fact about
      // the code, and a wrong turn into `refused` would overwrite it.
      const SENTINEL = 'sentinel-row-57';
      await c.evalExpr(String.raw`
        (() => { const el = document.getElementById('art-browser-hover-label');
          if (!el) return 'no-el';
          el.textContent = ${JSON.stringify(SENTINEL)};
          el.title = ${JSON.stringify(SENTINEL)}; return 'ok'; })()`);
      await doubleClick(aimFg);
      const repFg = await openRep();
      const openAfterFg = await artOpen();
      const line = await c.json(HOVER_LABEL);
      check('7a', 'THE GATE — the identical double click on the FOREGROUND strip is IGNORED: the '
        + 'gesture RAN (the count advanced, so this is not a dead handler reading as a good gate) '
        + 'and NOTHING opened',
        repFg.gestures === gestBeforeFg + 1 && repFg.kind === 'ignored'
        && repFg.detail === 'not-a-background'
        && same(openAfterFg, openBeforeFg),
        `report=${JSON.stringify(repFg)}\n        open before=${JSON.stringify(openBeforeFg)}`
        + `\n        open after =${JSON.stringify(openAfterFg)}`);
      check('7b', 'and it stays SILENT on the picker\'s hover line — the foreground strip has no '
        + 'double-click gesture to refuse, and a refusal there would be noise. Asserted against a '
        + 'SENTINEL written first, so an unwired handler cannot pass this as an empty line',
        !!line && line.text === SENTINEL && line.title === SENTINEL,
        `${JSON.stringify(line)} (sentinel written before the gesture)`);
      await shot(c, 'fg-strip-ignored');
    }

    // ---- 8. NOTHING WAS WRITTEN -------------------------------------------
    const hash1 = await c.evalExpr('window.__dbg.aeon.bgOverrideHash()');
    check('8a', 'the whole run wrote NOTHING to the override document — opening a composer '
      + 'document is not an edit',
      hash1 !== null && hash1 === hash0, `${hash0} -> ${hash1}`);
    check('8b', 'and the LIVE aeon tree is byte-identical — this run drove a hardlinked copy',
      sha(readFileSync(liveOverride)) === liveBefore
      && readFileSync(overridePath, 'utf8') === beforeText,
      `live ${liveBefore.slice(0, 16)}…`);

  } finally {
    try { c && c.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* ignore */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n=== ${passed}/${results.length} checks passed`
    + `${unmeasured.length ? `, ${unmeasured.length} NOT MEASURABLE` : ''}`);
  if (unmeasured.length) { console.log('NOT MEASURABLE:'); for (const u of unmeasured) console.log('  ' + u); }
  if (fails.length) { console.log('FAILURES:'); for (const f of fails) console.log('  ' + f); }
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('\nHARNESS ERROR:', e.message); process.exit(2); });
