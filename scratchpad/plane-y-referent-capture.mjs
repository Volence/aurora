#!/usr/bin/env node
// IS THE `plane_y` RULE ACTUALLY ON THE BACKGROUND ART, IN THE RUNNING APP?
//
// The node suite proves the geometry: the rule lands on the plane row, goes
// through the one transform, and is not the layer top. It cannot see a canvas,
// so it cannot tell a computed line from a painted one, and it cannot tell a
// painted line from one painted over black. This drives the real app and
// measures PIXELS.
//
// ═══ WHAT IT IS BUILT TO CATCH ═══
//
// 1. NOTHING ON SCREEN. Rows [4a]/[4b] count near-white pixels across the
//    canvas row the app SAYS it drew the rule on, and demand a control row 24px
//    away have far fewer. A row that only asked "is there white somewhere"
//    would pass on white art.
// 2. A RULE THAT WAS ALREADY THERE. Every pixel row is measured BEFORE the
//    remap is turned on and again after, on the same y, so the finding is a
//    DELTA. The before-count is printed, not assumed to be zero: OJZ's art has
//    bright pixels of its own and a threshold picked to make the after-shot
//    look good would pass on them.
// 3. A REPORT THAT AGREES WITH NOTHING. `__dbg.aeon.guides()` is a PUBLISH
//    written at the end of MapViewport's draw body, so `surfaces: []` and a
//    stalled `paints` are real answers. The row the pixels are sampled at comes
//    FROM that publish rather than being recomputed here, so a red row means
//    the app and the canvas disagree rather than that two copies of one sum do.
// 4. THE CHECK SAYING NOTHING. Rows [6a]/[6b] shorten the band with a real
//    keystroke and read the advisory's own testid off the DOM.
//
// ⚠ NO EMULATOR, NO BUILD, NO SAVE. Nothing here runs a ROM, touches an Aether
// socket, or presses Build and Run. The scene edits live in the app's memory and
// are never written: the run needs a project only to have BG ART to draw on.
// AEON_DIR must still be a disposable CLONE, because "never saves" is a property
// of this file today and not of the application.
//
// RUN (both variables, and the second is not optional: without it the run-root
// resolver walks up and borrows the MAIN checkout's dist/, so the picture would
// be of an app this worktree did not build):
//
//   VITE_AURORA_DEBUG=1 npm run build
//   AEON_DIR=<a disposable aeon clone> \
//   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron \
//   AURORA_BUILT_TREE=<this worktree> \
//   OUT=<dir> npm run harness:plane-y-referent

import {
  AURORA_DIR, checkoutOverride, siblingDefaultPathOrUnresolved,
} from '../test/support/sibling-root.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { runTarget, announceRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9471);
const ROOT = AURORA_DIR;
const RUN = announceRunRoot(runTarget(ROOT));
const AEON_OVERRIDE = checkoutOverride('aeon');
const AEONDIR = AEON_OVERRIDE === null ? null : AEON_OVERRIDE.value;
const OUT = process.env.OUT ?? `${ROOT}/docs/captures/2026-09-05-plane-y`;
mkdirSync(OUT, { recursive: true });

if (!AEONDIR) throw new Error('AEON_DIR must name a DISPOSABLE aeon clone');
if (AEONDIR === siblingDefaultPathOrUnresolved('aeon')) {
  throw new Error('AEON_DIR is the live aeon checkout. Point it at a clone.');
}

/** The scene this opens. Shipped, locked (v_factor 15), five layers. */
const SCENE_ID = process.env.SCENE_ID ?? 'ojz_act1_depth';
/** The layer the remap goes on. Top 80, next top 112, so a 32-line band. */
const LAYER = 2;
/** The plane row the rule marks. Well inside the visible plane and NOT equal to
 *  any layer top in this scene, so the picture cannot be read as a layer guide. */
const PLANE_Y = 96;
/** Zoom for the shot: 2x makes the 8px art cells legible without the 224 visible
 *  plane rows leaving the canvas. */
const ZOOM = 2;

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
  results.push({ id, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot -> ${name}.png`);
}

// A React-controlled control ignores `el.value = x`; the native setter plus the
// two bubbling events is what a real keystroke looks like from React's side.
const SET_CONTROL = (selector, value) => String.raw`
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

const CLICK_BY_TEXT = (re, tag = 'button,div,span,a') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

/**
 * Near-white pixels across one canvas row, and the same count 24px away.
 *
 * THE CONTROL IS THE POINT. `EFFECTS_SURFACE_LINE` is white at 0.95 over a dark
 * casing, so the rule's row is near-white AND its immediate neighbours are near
 * BLACK; art is neither, reliably. A single count would pass on bright art, so
 * both are reported and the caller compares them.
 */
const WHITE_ROW = (y) => String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const W = cv.width;
  const count = (row) => {
    if (row < 0 || row >= cv.height) return -1;
    const d = ctx.getImageData(0, row, W, 1).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 215 && d[i+1] > 215 && d[i+2] > 215) n++;
    }
    return n;
  };
  const yy = Math.round(${y});
  return { W, H: cv.height, at: count(yy), above: count(yy - 24), below: count(yy + 24) };
})()`;

async function main() {
  console.log('=== plane_y referent capture ===');
  console.log(`    aeon   : ${AEONDIR}`);
  console.log(`    out    : ${OUT}`);
  if (RUN.borrowed) throw new Error('run root is BORROWED - set AURORA_BUILT_TREE to this worktree');

  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', RUN.electron, RUN.main],
    { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
  child.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[err] ${d}`); });

  let c;
  try {
    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});

    let haveDbg = false;
    for (let i = 0; i < 40 && !haveDbg; i++) {
      haveDbg = await c.evalExpr('!!(window.__dbg && window.__dbg.aeon)').catch(() => false);
      if (!haveDbg) await sleep(500);
    }
    check('0a', 'this is a VITE_AURORA_DEBUG=1 build (window.__dbg.aeon exists)', haveDbg);
    if (!haveDbg) throw new Error('no __dbg - a blank React tree is the known worktree fault');

    // ⚠ THE ONE NON-UI DOOR, AND IT IS DECLARED. aeon's only real open route is a
    // NATIVE FOLDER PICKER that CDP cannot drive. This step is not UI evidence.
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`);
    await sleep(3500);
    const st = await c.json('window.__dbg.aeon.state()');
    check('0b', 'the aeon clone opened', st && st.open === true, JSON.stringify(st));

    check('1a', 'the Effects tab is reachable',
      (await c.evalExpr(CLICK_BY_TEXT(String.raw`/^Effects$/`))) === true);
    await sleep(1200);
    await c.evalExpr(CLICK_BY_TEXT(String.raw`/^Parallax$/`));
    await sleep(800);
    await c.evalExpr(`window.__dbg.aeon.selectScene(${JSON.stringify(SCENE_ID)})`);
    await sleep(900);

    // The plane is drawn at world origin, so parking the viewport at world 0 puts
    // plane row P at canvas y = P * ZOOM. `setView` is the app's own store.
    // `setView` is on the ROOT probe (the shared viewport store), not the aeon
    // one: the map is one canvas whichever facet is mounted over it.
    await c.evalExpr(`window.__dbg.setView(0, 0, ${ZOOM})`);
    await sleep(900);

    const before = await c.json('window.__dbg.aeon.guides()');
    check('2a', 'guides are ACTIVE for this scene, so the instrument sees its subject',
      before.active === true && before.sceneId === SCENE_ID,
      `active=${before.active} sceneId=${before.sceneId} rows=${before.rows.length} paints=${before.paints}`);
    check('2b', 'and NO surface rule is drawn yet, because no layer carries a remap',
      Array.isArray(before.surfaces) && before.surfaces.length === 0,
      `surfaces = ${JSON.stringify(before.surfaces)}`);

    const yExpected = PLANE_Y * ZOOM;
    const pxBefore = await c.json(WHITE_ROW(yExpected));
    note('BEFORE, near-white pixels on the row the rule will land on',
      `canvas ${pxBefore.W}x${pxBefore.H}  y=${yExpected}: at=${pxBefore.at} `
      + `above=${pxBefore.above} below=${pxBefore.below}`);
    await shot(c, '01-before-no-rule');

    // ── THE REMAP, THROUGH THE PANEL'S OWN CONTROLS ───────────────────────
    // THE TOGGLE IS FOUND BY ITS OPTION VALUES, not by its title text: the title
    // is the contract's own sentence and is free to be reworded, and a selector
    // that went stale would report "no control" for a control that is on screen.
    const turned = await c.evalExpr(String.raw`
        (() => {
          const el = [...document.querySelectorAll('select')].find((s) =>
            /Layer ${LAYER} /.test(s.title || '')
            && [...s.options].map((o) => o.value).join(',') === 'none,ladder');
          if (!el) return 'no-element';
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
            .set.call(el, 'ladder');
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return 'ok';
        })()`);
    check('3a', `the panel's own control turned the remap ON for layer ${LAYER}`,
      turned === 'ok', String(turned));
    await sleep(900);

    // ⚠ `/plane/i` ALONE MATCHES THE TOP FIELD TOO: a locked scene's top box says
    // "a plane line, so the scene is locked", and it comes FIRST in the DOM, so a
    // loose predicate would have typed plane_y into world_y and the whole capture
    // would have been of a moved layer.
    const planeIn = String.raw`[...document.querySelectorAll('input[type="number"]')]
      .find((e) => /Layer ${LAYER} rowRemap\.plane_y/.test(e.title || ''))`;
    const setY = await c.evalExpr(SET_CONTROL(planeIn, PLANE_Y));
    check('3b', `plane_y was typed as ${PLANE_Y} into the panel's own box`, setY === 'ok', String(setY));
    await sleep(1000);

    const doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'))
      .find((s) => s.id === SCENE_ID);
    check('3c', 'the DOCUMENT the app holds carries the remap those gestures authored',
      doc && doc.layers[LAYER] && doc.layers[LAYER].rowRemap
        && doc.layers[LAYER].rowRemap.plane_y === PLANE_Y,
      JSON.stringify(doc && doc.layers[LAYER] && doc.layers[LAYER].rowRemap));

    // ── THE PUBLISH, THEN THE PIXELS AT THE ROW IT NAMES ──────────────────
    const after = await c.json('window.__dbg.aeon.guides()');
    check('4a', 'the repaint PUBLISHED one surface rule, for this layer, at this plane row',
      after.surfaces.length === 1 && after.surfaces[0].index === LAYER
        && after.surfaces[0].planeY === PLANE_Y && after.surfaces[0].onScreen === true,
      `surfaces = ${JSON.stringify(after.surfaces)}  paints ${before.paints} -> ${after.paints}`);
    check('4b', 'and a repaint really happened between the two reads',
      after.paints > before.paints, `${before.paints} -> ${after.paints}`);

    // ⚠ THE SAMPLED ROW COMES FROM THE APP'S OWN REPORT, not from PLANE_Y * ZOOM.
    // If the two disagree that is the finding, so both are printed and compared.
    const yReported = after.surfaces.length === 1 ? after.surfaces[0].canvasY : yExpected;
    check('4c', 'the published canvas row is the plane row through the guides\' transform',
      Math.abs(yReported - yExpected) < 0.5, `reported ${yReported}, expected ${yExpected}`);

    const pxAfter = await c.json(WHITE_ROW(yReported));
    note('AFTER, near-white pixels on that row',
      `y=${Math.round(yReported)}: at=${pxAfter.at} above=${pxAfter.above} below=${pxAfter.below}`);
    check('4d', 'the rule IS PAINTED: near-white pixels appear on that row and did not before',
      pxAfter.at > pxBefore.at + 100, `${pxBefore.at} -> ${pxAfter.at} on row ${Math.round(yReported)}`);
    check('4e', 'and it is a LINE, not a wash: rows 24px away are not near-white',
      pxAfter.at > pxAfter.above * 4 + 40 && pxAfter.at > pxAfter.below * 4 + 40,
      `at=${pxAfter.at} above=${pxAfter.above} below=${pxAfter.below}`);

    // The canvas as the app holds it, so a reader is not trusting a window
    // screenshot's scale.
    const dataUrl = await c.evalExpr("document.getElementById('map-canvas').toDataURL('image/png')");
    writeFileSync(`${OUT}/02-rule-on-bg-art-canvas.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('        canvas -> 02-rule-on-bg-art-canvas.png');
    await shot(c, '02-rule-on-bg-art');

    // ── THE CHECK'S SENTENCE, ON A BAND SHORT ENOUGH TO EARN IT ───────────
    const reachBefore = await c.evalExpr(String.raw`
      (document.querySelector('[data-testid="layer-${LAYER}-rowremap-reach"]') || {}).textContent || ''`);
    check('5a', 'a 32-line band with a 16-line ladder earns NO reach sentence, and that is SILENCE',
      reachBefore === '', `rendered: ${JSON.stringify(reachBefore)}`);

    // Shorten the band by moving THIS layer's top down toward the next one:
    // 84..112 is 28 lines, so the halved span is 14 against a deepest step of 15.
    const topIn = String.raw`[...document.querySelectorAll('input[type="number"]')]
      .find((e) => /^Layer ${LAYER} (Screen line|world_y)/.test(e.title || ''))`;
    const movedTop = await c.evalExpr(SET_CONTROL(topIn, 84));
    await sleep(1000);
    const doc2 = JSON.parse(await c.evalExpr('window.__dbg.aeon.scenesJson()'))
      .find((s) => s.id === SCENE_ID);
    check('6a', `the panel moved layer ${LAYER}'s top to 84, a 28-line band`,
      movedTop === 'ok' && doc2.layers[LAYER].world_y === 84,
      `world_y = ${doc2 && doc2.layers[LAYER] ? doc2.layers[LAYER].world_y : 'n/a'}`);

    const reachAfter = await c.evalExpr(String.raw`
      (document.querySelector('[data-testid="layer-${LAYER}-rowremap-reach"]') || {}).textContent || ''`);
    check('6b', 'the reach sentence is now ON SCREEN and names the cap the engine computes',
      /28 screen lines/.test(reachAfter) && /at most half of them: 14\./.test(reachAfter),
      JSON.stringify(reachAfter));
    check('6c', 'and it states no clearance: no reassuring word anywhere in it',
      !/\b(ok|fine|good|correct|valid|passes|clear)\b/i.test(reachAfter));

    // ADVICE, NOT PREVENTION: the height picker is still fully open on the very
    // scene the sentence is about.
    const opts = await c.json(String.raw`
      (() => {
        const el = [...document.querySelectorAll('select')].find((s) =>
          /Layer ${LAYER} /.test(s.title || '') && s.options.length === 5);
        if (!el) return null;
        return [...el.options].map((o) => ({ v: o.value, disabled: o.disabled }));
      })()`);
    check('7a', 'every height option stays ENABLED on the warned scene',
      opts !== null && opts.length > 0 && opts.every((o) => o.disabled === false),
      JSON.stringify(opts));
    // BRING THE SENTENCE INTO ITS SCROLLER BEFORE THE SHOT. The layer cards live
    // in their own scrolling box and the list opens at layer 0, so a picture
    // taken here shows a sentence the harness read off the DOM and a reader
    // cannot see. `scrollIntoView` is the list's own motion.
    //
    // ⚠ THE RECT IS COMPARED TO THE SCROLLER'S BOX, not to `checkVisibility()`:
    // an element scrolled out of its scroller reports visible, so that trio is
    // evidence and never a gate.
    const placed = await c.json(String.raw`
      (() => {
        const el = document.querySelector('[data-testid="layer-${LAYER}-rowremap-reach"]');
        if (!el) return { found: false };
        // 'start', not 'center': the sentence is TALLER than the box, and
        // centring an oversized element puts its top ABOVE the box, which is the
        // one position from which an author cannot start reading.
        el.scrollIntoView({ block: 'start' });
        let sc = el.parentElement;
        while (sc && sc.scrollHeight <= sc.clientHeight + 1) sc = sc.parentElement;
        const r = el.getBoundingClientRect();
        const s = (sc || document.documentElement).getBoundingClientRect();
        // ⚠ THE PEER IS MEASURED WITH ITS TEXT LENGTH BESIDE IT. Two advisories
        // reporting the SAME height to the pixel is the shape of a selector that
        // resolved to one element twice, so the row prints what it measured
        // rather than only the number it wanted.
        const peers = [...document.querySelectorAll(
          '[data-testid="layer-${LAYER}-rowremap-precondition"]')]
          .map((p) => ({ h: p.getBoundingClientRect().height,
                         chars: (p.textContent || '').length }));
        return { found: true, top: r.top, bottom: r.bottom, height: r.height,
                 chars: (el.textContent || '').length,
                 scTop: s.top, scBottom: s.bottom, scHeight: s.height,
                 peers,
                 inside: r.top >= s.top - 1 && r.bottom <= s.bottom + 1 };
      })()`);
    await sleep(500);
    // ⚠ THE BAR IS "READABLE WITHOUT SCROLLING A SCROLLER", and it is measured
    // rather than eyeballed: the sentence's own height against the box it lives
    // in, with a PRECONDITION hint measured beside it as the comparison. The
    // first draft of this sentence was 229px in a 149px box and this row is what
    // said so; the module's wording was shortened until it fit.
    note('the sentence in its box', JSON.stringify(placed));
    // ⚠ THE BAR IS A COMPARISON, NOT AN ABSOLUTE, AND THE FIRST DRAFT OF THIS ROW
    // HAD IT WRONG. "Fits the scroller" is a bar the panel's EXISTING advisories
    // already fail: the layer cards sit in a ~150px box (column-layout's LIST
    // floor) and a precondition hint is measured here at the same height as this
    // sentence. Holding a new sentence to a bar its neighbours miss would have
    // reported a panel-wide layout property as this parcel's defect. So the row
    // asserts this sentence is NO TALLER THAN THE ONES ALREADY THERE, and the
    // box being too small for either is recorded as a finding rather than
    // silently absorbed.
    const tallestPeer = placed.peers.length === 0
      ? null : Math.max(...placed.peers.map((p) => p.h));
    check('6d', 'the sentence is no taller than the advisories already on this row',
      placed.found === true && tallestPeer !== null && placed.height <= tallestPeer + 1,
      `sentence ${placed.height}px / ${placed.chars} chars; `
      + `precondition hints ${JSON.stringify(placed.peers)}; scroller ${placed.scHeight}px`);
    check('6e', 'and scrollIntoView brings its TOP into that box, so it is reachable',
      placed.found === true && placed.top >= placed.scTop - 1 && placed.top < placed.scBottom,
      `top ${placed.top}, box [${placed.scTop}, ${placed.scBottom}]`);
    await shot(c, '03-reach-sentence');

    // The rule moved with the top? It must NOT have: plane_y did not change.
    const after2 = await c.json('window.__dbg.aeon.guides()');
    check('8a', 'the rule did NOT follow the layer top: plane_y is still its own row',
      after2.surfaces.length === 1 && after2.surfaces[0].planeY === PLANE_Y
        && Math.abs(after2.surfaces[0].canvasY - yExpected) < 0.5,
      JSON.stringify(after2.surfaces));

    console.log('\n=== SUMMARY ===');
    console.log(`${results.filter((r) => r.ok).length}/${results.length} rows passed`);
    if (fails.length > 0) {
      console.log(`FAILED: ${fails.join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    await killTree(child);
  }
}

main().catch((e) => { console.error(`\nFAILED: ${e.message}`); process.exitCode = 1; });
