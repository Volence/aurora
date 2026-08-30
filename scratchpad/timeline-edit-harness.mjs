#!/usr/bin/env node
// CAN AN AUTHOR ACTUALLY DRAG A BAND EDGE, AND SPLIT A BAND, IN THE RUNNING APP?
//
// ROADMAP §5.1 row 94. 79 vitest rows cover the arithmetic behind these two
// gestures and NOT ONE OF THEM CAN SEE A POINTER: `.tsx` files are not collected
// in this repo at all, so a handler that is never wired, a canvas that is
// covered, and a client pixel that maps to the wrong strip row are all invisible
// to the node suite and all present exactly as "the feature is broken". This
// file is the only instrument that can tell.
//
// ═══ WHAT IT IS SPECIFICALLY BUILT TO CATCH ═══
//
// 1. AN AIM THAT IS WRONG WHILE THE FEATURE IS FINE. A fractional client rect
//    delivers a mouse event to the neighbouring device row, and it presents as
//    an off-by-one in the DRAG. So every aim below is an INTEGER client pixel,
//    and every expectation is derived FROM THAT INTEGER back through the app's
//    own published contract (`client.x/y/scaleX/scaleY`, `originY`, `scale`) —
//    never from the line the harness wished for. Section 5 prints dpr, the rect,
//    the backing store, the scale and the aim, and asserts the round trip
//    through the app's OWN conversion (`report.pointer.line`) before any gesture
//    is attempted. If the aim is off, this run says the aim is off.
//
// 2. A HANDLER THAT IS NEVER REACHED. `report.pointer` is written by the pointer
//    handler itself and is NOT recomputed anywhere — a strip that draws
//    perfectly and has no listener reports `null` here, which no model row can
//    distinguish from a working one.
//
// 3. A GESTURE THAT IS NOT ONE UNDO STEP. Every drag and every split is followed
//    by ONE press of the app's own Undo control and a requirement that the whole
//    gesture came back. A drag that committed per mouse-move would need dozens.
//
// 4. A COLUMN THAT BECAME EDITABLE BY ACCIDENT. The LAYER column is read-only on
//    purpose — a layer top is an act coordinate authored on the map. Section 9
//    runs the SAME press/move/release over it and requires the document not to
//    move. Without that row, "the drag works" and "any drag anywhere works" look
//    identical.
//
// 5. A VACUOUS FIXTURE. ⚠ THIS PARCEL'S OWN TRAP: a band at the default 112..128
//    is 16 lines tall, sits mid-strip, and a split of it lands within a few
//    pixels of where a broken split would. The fixture is 48..176 — tall, far
//    from both ends, on no ruler tick (the ticks are every 32) — and every value
//    the run moves to (72, 120) is likewise off-tick and distinct from every
//    other number in the run.
//
// ═══ HOW TO RUN ═══
//
//   VITE_AURORA_DEBUG=1 npx electron-vite build   # __dbg exists ONLY here
//   node scratchpad/timeline-edit-harness.mjs     # or: npm run harness:timeline-edit
//
// Screenshots land in scratchpad/shots-timeline-edit/.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';
import { spawnGuarded } from './lib/harness-guard.mjs';

const PORT = Number(process.env.PORT ?? 9412);
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const SHOTS = `${ROOT}/scratchpad/shots-timeline-edit`;
mkdirSync(SHOTS, { recursive: true });

const SCENE_ID = 'timeline_edit_scene';
const PRESET_ID = 'timeline_edit_probe';

// ── THE FIXTURE, AND WHY EVERY NUMBER IS THAT NUMBER ───────────────────────
// 48 and 176: both well inside the fire bound 3..223, both far from either end,
// 128 apart (so the band is comfortably splittable), and NEITHER is a multiple
// of the ruler's 32px tick spacing — a build that snapped to ticks is caught.
const TOP0 = 48;
const BOT0 = 176;
// 72: the drag target. 24 lines from TOP0, not a tick, not equal to anything else.
const TOP1 = 72;
// 120: the split cut. Not a tick, not equidistant from either edge (72 from TOP0,
// 56 from BOT0), so a split that cut at the midpoint would be caught.
const CUT = 120;
// 10: where the BOT edge is dragged in the held row. The order rule holds it at
// TOP0 + 1 = 49 — a number 39 lines away from where the pointer asked, so a
// build that wrote the raw request is unmistakable.
const BOT_ASK = 10;

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
const misses = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function note(what, detail) {
  console.log(`NOTE       ${what}${detail !== undefined ? `\n        ${detail}` : ''}`);
}
/**
 * Record — and SAY, immediately — any probe that came back with nothing.
 *
 * ⚠ IMMEDIATELY IS THE POINT. Collecting these for a blanket row at the end
 * leaves a run that fails at row 4 with no clue that row 3's control was never
 * found; the first two runs of this file were spent on exactly that.
 */
function watchMiss(where, v) {
  if (v === 'no-element' || v === null || v === false || (v && v.error)) {
    misses.push(`${where}: ${JSON.stringify(v)}`);
    console.log(`MISS       ${where}: ${JSON.stringify(v)}`);
  }
  return v;
}
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-timeline-edit/${name}.png`);
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
 * Expand a CollapsibleSection by clicking its header title, the way an author does.
 *
 * ⚠ THE DEEPEST MATCH, NOT THE FIRST. A collapsed section renders NO children,
 * so its OUTER wrapper's textContent is also exactly the title — and that
 * wrapper comes first in document order and carries no handler. Clicking it does
 * nothing at all, which presents as "the create failed" three rows later. The
 * handler is on the header div INSIDE it, so the deepest match is the one to
 * click; document order is pre-order, so that is the last match.
 */
const expandSection = (title) => String.raw`
(() => {
  const all = [...document.querySelectorAll('span, div')]
    .filter((e) => (e.textContent || '').trim() === ${JSON.stringify(title)});
  if (all.length === 0) return 'no-element';
  all[all.length - 1].click();
  return 'ok (' + all.length + ' candidate(s), clicked the deepest)';
})()`;

const byTitle = (tag, prefix) =>
  `[...document.querySelectorAll(${JSON.stringify(tag)})].find(e => (e.title||'').startsWith(${JSON.stringify(prefix)}))`;

// ── the strip's own pixels ─────────────────────────────────────────────────
const STRIP_ROW = (y, x, len) => String.raw`
(() => {
  const cv = document.getElementById('effects-raster-timeline');
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const d = ctx.getImageData(${x}, ${y}, ${len}, 1).data;
  return Array.from(d);
})()`;

/**
 * IS BAND 0's FILL IN THIS RUN OF PIXELS?
 *
 * DERIVED FROM THE COMPOSITE, not from a screenshot. `PRESET_FILLS[0]` is
 * rgba(200,120,255,0.38) over STRIP_BG rgb(10,12,18), which is (82,53,108). The
 * window below is wide enough for the canvas's alpha rounding and narrow enough
 * to exclude every other colour the strip paints:
 *
 *   band-0 fill      -> ( 82, 53,108)   ACCEPTED
 *   band-1 fill (.20)-> ( 48, 34, 65)   excluded by r (<70) — see the note in §8
 *   preset edge      -> (210,153,243)   excluded by r (>100)
 *   layer band fill  -> ( 37, 91,102)   excluded by r
 *   split rule       -> (243,162, 58)   excluded by r and b
 *   priming tint     -> ( 59, 29, 30)   excluded by b
 *   label plate      -> ( 11, 13, 18)   excluded by r
 */
function hasBand0Fill(row) {
  for (let i = 0; i * 4 < row.length; i++) {
    const r = row[i * 4], g = row[i * 4 + 1], b = row[i * 4 + 2];
    if (r >= 70 && r <= 100 && g >= 40 && g <= 70 && b >= 95 && b <= 125) return true;
  }
  return false;
}
function rowSummary(row) {
  const seen = new Map();
  for (let i = 0; i * 4 < row.length; i++) {
    const k = `${row[i * 4]},${row[i * 4 + 1]},${row[i * 4 + 2]}`;
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()].map(([k, n]) => `${k}x${n}`).join(' ');
}

/**
 * The canvas's rect RIGHT NOW, plus its backing store and the conversion scale.
 *
 * ⚠ READ LIVE, EVERY TIME. `report.client` is a snapshot from the last DRAW, and
 * this column scrolls — which moves the canvas and repaints nothing. The app's
 * own `toStrip` calls `getBoundingClientRect()` at EVENT time, so this is the
 * rect the app is actually converting by, and aiming by any other one puts the
 * event somewhere the app never looks.
 */
const LIVE_RECT = String.raw`
(() => {
  const cv = document.getElementById('effects-raster-timeline');
  if (!cv) return null;
  const r = cv.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, bw: cv.width, bh: cv.height,
           scaleX: cv.width / r.width, scaleY: cv.height / r.height };
})()`;

const SCROLL_AND_HIT = String.raw`
(() => {
  const cv = document.getElementById('effects-raster-timeline');
  if (!cv) return { error: 'no-canvas' };
  cv.scrollIntoView({ block: 'center' });
  const r = cv.getBoundingClientRect();
  const px = Math.round(r.x + r.width / 2);
  const py = Math.round(r.y + r.height / 2);
  const inViewport = px >= 0 && py >= 0
    && px < document.documentElement.clientWidth && py < document.documentElement.clientHeight;
  const hit = inViewport ? document.elementFromPoint(px, py) : null;
  return { isSelf: hit === cv, hitId: hit ? (hit.id || hit.tagName) : null,
           visible: typeof cv.checkVisibility === 'function' ? cv.checkVisibility() : null,
           w: r.width, h: r.height, px, py, inViewport,
           viewport: [document.documentElement.clientWidth, document.documentElement.clientHeight] };
})()`;

async function mouse(c, type, x, y, extra = {}) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left', pointerType: 'mouse',
    buttons: type === 'mousePressed' ? 1 : (type === 'mouseMoved' && extra.down ? 1 : 0),
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? (extra.clickCount ?? 1) : 0,
    modifiers: extra.modifiers ?? 0,
  });
  await sleep(extra.settle ?? 90);
}

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawnGuarded('/usr/bin/xvfb-run',
    ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`],
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
    const haveProbe = await c.evalExpr(
      'typeof window.__dbg.aeon.rasterTimeline === "function" && '
      + 'typeof window.__dbg.aeon.presetsJson === "function"');
    check('0a', 'the build under test has BOTH probes this run reads', haveProbe === true, `${ROOT}/dist`);
    if (!haveProbe) throw new Error('wrong build — VITE_AURORA_DEBUG=1 npx electron-vite build');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ---- 1. Open aeon, reach the Effects facet ----------------------------
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
    await sleep(2500);
    check('1b', 'the facet bar offers an Effects pill',
      (await c.evalExpr(clickByText('/^Effects$/'))) === true);
    await sleep(1200);

    // ---- 2. A scene, so the strip mounts at all ---------------------------
    const scenes0 = await c.json('window.__dbg.aeon.scenes()');
    await c.evalExpr(SET_INPUT(`document.querySelector('input[placeholder="new_scene_id"]')`, SCENE_ID));
    await c.evalExpr(clickByText('/^New$/'));
    await sleep(900);
    check('2a', 'ANTI-VACUOUS: a scene exists, so the strip has something to mount for',
      (await c.json('window.__dbg.aeon.scenes()')).some((s) => s.id === SCENE_ID),
      `before=${JSON.stringify(scenes0.map((s) => s.id))}`);

    // ---- 3. A PRESET, through the real panel ------------------------------
    watchMiss('3 expand presets', await c.evalExpr(expandSection('Raster band presets')));
    await sleep(600);
    const presets0 = await c.json('window.__dbg.aeon.presets()');
    note(`presets already in this tree before the run: ${JSON.stringify(presets0.map((p) => p.id))}`);
    // ⚠ THE SECTION IS `defaultCollapsed`, AND A COLLAPSED SECTION MOUNTS NO
    // CHILDREN. Without this row a failed expand presents identically to a
    // broken create — the first run of this file spent a cycle on exactly that.
    check('3z', 'the preset section EXPANDED, so its controls exist to be driven',
      (await c.evalExpr('!!document.querySelector(\'input[placeholder="new_preset_id"]\')')) === true);
    watchMiss('3 preset id field', await c.evalExpr(
      SET_INPUT(`document.querySelector('input[placeholder="new_preset_id"]')`, PRESET_ID)));
    await sleep(300);
    // ⚠ NOT `clickByText('/^New$/')`. There are TWO "New" chips on this column —
    // the scene panel's and this one — and the first match is the scene's, which
    // creates a SCENE and leaves the preset row reporting "not created". Walk up
    // from the preset's own id field instead, so the control is found by the
    // thing it belongs to rather than by its label.
    watchMiss('3 preset New', await c.evalExpr(String.raw`
(() => {
  const inp = document.querySelector('input[placeholder="new_preset_id"]');
  if (!inp) return 'no-element';
  let n = inp.parentElement;
  for (let i = 0; i < 6 && n; i++) {
    const b = [...n.querySelectorAll('button, [role="button"]')]
      .find((e) => (e.textContent || '').trim() === 'New');
    if (b) { b.click(); return 'ok'; }
    n = n.parentElement;
  }
  return 'no-element';
})()`));
    await sleep(900);
    let doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    const presetOf = (d) => d.find((p) => p.id === PRESET_ID) ?? null;
    check('3a', 'ANTI-VACUOUS: the preset this harness authored exists in the model',
      presetOf(doc) !== null && doc.length === presets0.length + 1,
      `after=${JSON.stringify(doc.map((p) => p.id))}`);
    if (presetOf(doc) === null) throw new Error('preset not created — every row below is vacuous');
    check('3b', 'and the panel selected it, so the strip column has a preset to draw',
      (await c.evalExpr('window.__dbg.aeon.selectedPreset()')) === PRESET_ID);

    // THE BAND EDITOR IS A SECOND COLLAPSED SECTION, titled for the preset it
    // belongs to. Its children are not mounted until it is opened, so the
    // spinners below do not exist yet.
    watchMiss('3 expand band editor', await c.evalExpr(expandSection(`Preset — ${PRESET_ID}`)));
    await sleep(600);

    // The fixture band, through the real spinners the panel gives an author.
    note('band-card inputs the panel is offering: '
      + JSON.stringify(await c.json(
        `[...document.querySelectorAll('input')].map(e => (e.title||'').slice(0, 44))`)));
    watchMiss('3 top', await c.evalExpr(SET_INPUT(byTitle('input', 'Screen line the effect turns ON'), TOP0)));
    await sleep(400);
    watchMiss('3 bot', await c.evalExpr(SET_INPUT(byTitle('input', 'Screen line the effect turns OFF'), BOT0)));
    await sleep(500);

    // ---- 4. THE FIXTURE IS WHAT IT CLAIMS TO BE ---------------------------
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    const fixture = presetOf(doc);
    check('4a', `THE VACUITY GUARD: exactly one band at ${TOP0}..${BOT0}, both off-tick`,
      fixture.bands.length === 1 && fixture.bands[0].top === TOP0 && fixture.bands[0].bot === BOT0,
      JSON.stringify(fixture.bands));
    if (fixture.bands[0].top !== TOP0) throw new Error('fixture not authored');

    // ---- 5. THE AIM, BEFORE ANY GESTURE -----------------------------------
    const vis0 = await c.json(SCROLL_AND_HIT);
    await sleep(300);
    let rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    const dpr = await c.evalExpr('window.devicePixelRatio');
    check('5a', 'the strip is ACTIVE and reports the preset column it is drawing',
      rep.active === true && rep.presetId === PRESET_ID && rep.paints > 0,
      `active=${rep.active} presetId=${rep.presetId} paints=${rep.paints}`);
    check('5b', 'it planned the band and DREW it: one fill, TWO handles — an interval',
      rep.presetBands.length === 1 && rep.presetBands[0].top === TOP0
      && rep.presetBands[0].bot === BOT0 && rep.presetFills === 1 && rep.presetHandles === 2,
      `bands=${JSON.stringify(rep.presetBands.map((b) => [b.top, b.bot]))} `
      + `fills=${rep.presetFills} handles=${rep.presetHandles}`);
    check('5c', 'the honesty line stopped naming palette bands, because they are on screen now',
      !rep.absent.includes('palette bands') && rep.absent.includes('per-line deform'),
      `absent=${JSON.stringify(rep.absent)}`);

    if (rep.client === null) throw new Error('the strip published no client rect — cannot aim');
    // ⚠ THE LIVE RECT, NOT THE PUBLISHED ONE, IS WHAT THE APP AIMS BY. The
    // component converts a client point with `getBoundingClientRect()` AT EVENT
    // TIME; the report's `client` is a snapshot from the last DRAW, and this
    // column SCROLLS, which moves the canvas without repainting anything. The
    // first run of this file aimed by the published rect after a
    // `scrollIntoView` and put every event 436px below the window — every
    // gesture row failed on a feature that was fine.
    let cl = await c.json(LIVE_RECT);
    note(`dpr=${dpr}`);
    note(`strip LIVE client rect = x ${cl.x} y ${cl.y} w ${cl.w} h ${cl.h}`);
    note(`strip backing store    = ${cl.bw} x ${cl.bh} (FIXED, dpr-independent)`);
    note(`client -> strip scale  = scaleX ${cl.scaleX} scaleY ${cl.scaleY}`);
    note(`the report's DRAW-TIME rect was y ${rep.client.y} — it differs from the live one by `
      + `${(cl.y - rep.client.y).toFixed(2)}px because the column scrolled after the last paint. `
      + 'That is expected; the app reads the live rect too.');

    /** The strip point for a screen line at the centre of the PRESET column. */
    const stripPt = (line) => ({
      x: rep.presetX + rep.presetW / 2,
      y: rep.originY + line * rep.scale,
    });
    /** That point as an INTEGER client pixel. */
    const aim = (line) => {
      const p = stripPt(line);
      return { x: Math.round(cl.x + p.x / cl.scaleX), y: Math.round(cl.y + p.y / cl.scaleY) };
    };
    /**
     * ⚠ THE EXPECTATION, DERIVED FROM THE INTEGER THE MOUSE ACTUALLY GETS.
     * Not from the line this harness wished for — that is the substitution that
     * turns an aim defect into a feature defect on the report.
     */
    const lineOfAim = (a) => Math.round(((a.y - cl.y) * cl.scaleY - rep.originY) / rep.scale);

    // ⚠ NOT "IS THE SCALE 1". The scale here is 1.0006-ish because the element's
    // laid-out HEIGHT is a fraction under its intrinsic one; what matters is not
    // whether that number is 1, it is whether it can move a LINE. So the row
    // sweeps the whole ruler and reports how many lines survive the round trip
    // client -> strip -> line, and requires the ones this run actually aims at.
    const roundTrip = [];
    for (let line = 3; line <= 223; line++) if (lineOfAim(aim(line)) !== line) roundTrip.push(line);
    const used = [TOP0, TOP1, CUT, BOT0, BOT_ASK];
    check('5d', 'THE AIM SURVIVES THE ROUND TRIP for every line this run touches',
      used.every((l) => lineOfAim(aim(l)) === l),
      `${221 - roundTrip.length}/221 lines round-trip exactly; `
      + `lines this run uses: ${used.map((l) => `${l}->${lineOfAim(aim(l))}`).join(' ')}`
      + (roundTrip.length ? `\n        ⚠ lines that do NOT round-trip: ${roundTrip.join(',')} `
        + '— read any off-by-one at those as an AIM result, not a feature result.' : ''));

    const aimTop = aim(TOP0);
    note(`AIM: line ${TOP0} -> strip (${stripPt(TOP0).x}, ${stripPt(TOP0).y}) `
      + `-> client (${aimTop.x}, ${aimTop.y}) -> the app should read line ${lineOfAim(aimTop)}`);
    check('5e', 'and the aim lands INSIDE the window it is dispatched into',
      aimTop.x >= 0 && aimTop.y >= 0
      && aimTop.x < vis0.viewport[0] && aimTop.y < vis0.viewport[1],
      `aim (${aimTop.x}, ${aimTop.y}) in viewport ${JSON.stringify(vis0.viewport)}`);

    // ---- 6. PIXELS: the band is on the canvas, not only in the model ------
    const PX = rep.presetX + 8;
    const PLEN = rep.presetW - 12;
    const sample = async (line) => watchMiss(`strip row ${line}`,
      await c.json(STRIP_ROW(rep.originY + line * rep.scale, PX, PLEN)));
    const inside = await sample(100);
    const above = await sample(20);
    const below = await sample(200);
    check('6a', `PIXELS: band 0's fill IS at line 100 and is NOT at 20 or 200`,
      inside !== null && hasBand0Fill(inside) && !hasBand0Fill(above) && !hasBand0Fill(below),
      `100: ${rowSummary(inside ?? [])}\n        20: ${rowSummary(above ?? [])}`
      + `\n        200: ${rowSummary(below ?? [])}`);
    // ⚠ `vis0`, NOT A SECOND `SCROLL_AND_HIT`. Re-scrolling here would move the
    // canvas after `cl` was measured and quietly invalidate every aim above.
    check('6b', 'the strip is ON SCREEN and NOT COVERED — the page hit-tests to this canvas',
      vis0.isSelf === true && vis0.visible !== false && vis0.inViewport === true, JSON.stringify(vis0));
    await shot(c, '01-band-drawn');

    // ---- 7. THE HANDLER IS REACHED, AND IT AGREES ABOUT THE LINE ----------
    //
    // ⚠ THE ROW THAT SEPARATES AIM FROM FEATURE. `report.pointer` is written by
    // the pointer handler and recomputed nowhere; a strip with no listener
    // reports null, and a strip with a wrong client->strip conversion reports a
    // different line. Both are invisible to every model row.
    await mouse(c, 'mouseMoved', aimTop.x, aimTop.y);
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    check('7a', `the pointer handler RAN and read line ${lineOfAim(aimTop)} from client y ${aimTop.y}`,
      rep.pointer !== null && Math.round(rep.pointer.line) === lineOfAim(aimTop),
      `pointer=${JSON.stringify(rep.pointer)}`);
    check('7b', `and it hit band 0's TOP edge, which is what a drag needs to grab`,
      rep.pointer !== null && rep.pointer.hit === 'edge 0.top', `hit=${rep.pointer?.hit}`);

    // THE CONTROL FOR ROW 7b: the same line, over the LAYER column, hits nothing.
    const layerAim = { x: Math.round(cl.x + (rep.stripX + rep.stripW / 2) / cl.scaleX), y: aimTop.y };
    await mouse(c, 'mouseMoved', layerAim.x, layerAim.y);
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    check('7c', 'THE CONTROL: over the LAYER column the same line grabs NO edge',
      rep.pointer !== null && !String(rep.pointer.hit).startsWith('edge'),
      `hit=${rep.pointer?.hit} at client x ${layerAim.x} (layer column ${rep.stripX}..${rep.stripX + rep.stripW})`);

    // ---- 8. THE DRAG ------------------------------------------------------
    const aimTo = aim(TOP1);
    const wantTop = lineOfAim(aimTo);
    note(`DRAG: press at client (${aimTop.x}, ${aimTop.y}) [line ${lineOfAim(aimTop)}] `
      + `-> release at (${aimTo.x}, ${aimTo.y}) [line ${wantTop}]`);
    await mouse(c, 'mouseMoved', aimTop.x, aimTop.y);
    await mouse(c, 'mousePressed', aimTop.x, aimTop.y);
    await mouse(c, 'mouseMoved', aimTo.x, aimTo.y, { down: true });
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    check('8a', 'MID-GESTURE: the strip is previewing the held value, and has not written yet',
      rep.drag !== null && rep.drag.line === wantTop
      && JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'))
        .find((p) => p.id === PRESET_ID).bands[0].top === TOP0,
      `drag=${JSON.stringify(rep.drag)}`);
    await mouse(c, 'mouseReleased', aimTo.x, aimTo.y);
    await sleep(400);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    check('8b', `THE DRAG WROTE THE DOCUMENT: band 0 top ${TOP0} -> ${wantTop}`,
      presetOf(doc).bands[0].top === wantTop && presetOf(doc).bands[0].bot === BOT0,
      `bands=${JSON.stringify(presetOf(doc).bands.map((b) => [b.top, b.bot]))}`);
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    check('8c', 'and the strip moved with it, with no gesture left in flight',
      rep.drag === null && rep.presetBands[0].top === wantTop,
      `drag=${JSON.stringify(rep.drag)} strip top=${rep.presetBands[0]?.top}`);
    await shot(c, '02-after-drag');

    // ONE UNDO STEP. A drag that committed per mouse-move would need many.
    check('8d', 'the app offers its own Undo control', (await c.evalExpr(clickByText('/^Undo$/'))) === true);
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    check('8e', `ONE UNDO STEP: a single Undo put the edge back at ${TOP0}`,
      presetOf(doc).bands[0].top === TOP0,
      `top=${presetOf(doc).bands[0].top} (a per-move commit would still be near ${wantTop})`);

    // ---- 9. THE READ-ONLY COLUMN, AS A GESTURE ---------------------------
    //
    // ⚠ NOT A HOVER — A WHOLE PRESS/MOVE/RELEASE. Row 7c proves the hit test
    // says no; this proves nothing WRITES when an author does it anyway.
    const scenesBefore = await c.evalExpr('window.__dbg.aeon.scenesJson()');
    await mouse(c, 'mouseMoved', layerAim.x, aimTop.y);
    await mouse(c, 'mousePressed', layerAim.x, aimTop.y);
    await mouse(c, 'mouseMoved', layerAim.x, aimTo.y, { down: true });
    await mouse(c, 'mouseReleased', layerAim.x, aimTo.y);
    await sleep(400);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    check('9a', 'THE CONTROL: the same gesture over the LAYER column writes NOTHING, to either document',
      presetOf(doc).bands[0].top === TOP0 && presetOf(doc).bands[0].bot === BOT0
      && (await c.evalExpr('window.__dbg.aeon.scenesJson()')) === scenesBefore,
      `bands=${JSON.stringify(presetOf(doc).bands.map((b) => [b.top, b.bot]))}`);

    // ---- 10. THE HELD EDGE -----------------------------------------------
    const aimAsk = aim(BOT_ASK);
    const aimBot = aim(BOT0);
    await mouse(c, 'mouseMoved', aimBot.x, aimBot.y);
    await mouse(c, 'mousePressed', aimBot.x, aimBot.y);
    await mouse(c, 'mouseMoved', aimAsk.x, aimAsk.y, { down: true });
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    const heldInDom = await c.evalExpr(
      `[...document.querySelectorAll('*')].some(e => e.children.length === 0 && /held at ${TOP0 + 1}/.test(e.textContent||''))`);
    check('10a', `HELD: the bot edge asked for ${lineOfAim(aimAsk)} and stopped at ${TOP0 + 1}, `
      + 'and the app SAYS SO on screen',
      rep.drag !== null && rep.drag.line === TOP0 + 1 && rep.heldText !== null && heldInDom === true,
      `drag=${JSON.stringify(rep.drag)}\n        heldText=${JSON.stringify(rep.heldText)}`
      + `\n        the sentence is in the DOM: ${heldInDom}`);
    await shot(c, '03-held-at-the-order-rule');
    await mouse(c, 'mouseReleased', aimAsk.x, aimAsk.y);
    await sleep(400);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    check('10b', `and it WROTE the held value, not the raw ask (${TOP0 + 1}, not ${lineOfAim(aimAsk)})`,
      presetOf(doc).bands[0].bot === TOP0 + 1,
      `bot=${presetOf(doc).bands[0].bot}`);
    await c.evalExpr(clickByText('/^Undo$/'));
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    check('10c', `ONE UNDO STEP again: bot is back at ${BOT0}`,
      presetOf(doc).bands[0].bot === BOT0, `bot=${presetOf(doc).bands[0].bot}`);

    // ---- 11. THE SPLIT ----------------------------------------------------
    const aimCut = aim(CUT);
    const wantCut = lineOfAim(aimCut);
    note(`SPLIT: double-click at client (${aimCut.x}, ${aimCut.y}) -> cut line ${wantCut}`);
    await mouse(c, 'mouseMoved', aimCut.x, aimCut.y);
    await mouse(c, 'mousePressed', aimCut.x, aimCut.y, { clickCount: 1 });
    await mouse(c, 'mouseReleased', aimCut.x, aimCut.y, { clickCount: 1 });
    await mouse(c, 'mousePressed', aimCut.x, aimCut.y, { clickCount: 2 });
    await mouse(c, 'mouseReleased', aimCut.x, aimCut.y, { clickCount: 2 });
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    const after = presetOf(doc).bands;
    check('11a', `THE SPLIT RAN: one band became two, cut at ${wantCut}`,
      after.length === 2 && after[0].top === TOP0 && after[0].bot === wantCut
      && after[1].top === wantCut + 1 && after[1].bot === BOT0,
      `bands=${JSON.stringify(after.map((b) => [b.top, b.bot]))}`);
    check('11b', `⚠ THE CUT LINE IS CLEAR: the upper half ends AT ${wantCut} and the lower `
      + `starts at ${wantCut + 1} — abutting halves would not build`,
      after.length === 2 && after[1].top - after[0].bot === 1,
      `gap = ${after.length === 2 ? after[1].top - after[0].bot : 'n/a'} line(s)`);
    check('11c', 'and both halves carry the SAME ON op — a split is one effect over two intervals',
      after.length === 2 && JSON.stringify(after[0].on) === JSON.stringify(after[1].on),
      JSON.stringify(after.map((b) => b.on)));
    rep = await c.json('window.__dbg.aeon.rasterTimeline()');
    check('11d', 'the strip drew both halves: TWO fills, FOUR handles',
      rep.presetFills === 2 && rep.presetHandles === 4,
      `fills=${rep.presetFills} handles=${rep.presetHandles}`);
    check('11e', 'and the split it just authored raises NO collision notice — it is a legal program',
      rep.presetBands.every((b) => b.collision === null),
      JSON.stringify(rep.presetBands.map((b) => b.collision)));
    await shot(c, '04-after-split');

    await c.evalExpr(clickByText('/^Undo$/'));
    await sleep(500);
    doc = JSON.parse(await c.evalExpr('window.__dbg.aeon.presetsJson()'));
    check('11f', `ONE UNDO STEP: the split — two bands and an insert — came back as one band ${TOP0}..${BOT0}`,
      presetOf(doc).bands.length === 1 && presetOf(doc).bands[0].top === TOP0
      && presetOf(doc).bands[0].bot === BOT0,
      `bands=${JSON.stringify(presetOf(doc).bands.map((b) => [b.top, b.bot]))}`);

    // ---- 12. THE BLANKET -------------------------------------------------
    check('12a', 'BLANKET: no probe in this run came back `no-element`, null or false',
      misses.length === 0, misses.length === 0 ? 'clean' : misses.join('\n        '));
    await shot(c, '05-for-the-owner');

    // ---- 13. Clean the fixture out of the aeon tree -----------------------
    await c.evalExpr(clickByText(`/Delete preset ${PRESET_ID}/`, 'button, [role="button"]'));
    await sleep(500);
    await c.evalExpr(clickByText('/Delete scene/'));
    await sleep(500);
    note(`presets after cleanup: ${JSON.stringify((await c.json('window.__dbg.aeon.presets()')).map((p) => p.id))}`);
    note(`scenes after cleanup: ${JSON.stringify((await c.json('window.__dbg.aeon.scenes()')).map((s) => s.id))}`);
  } finally {
    try { c?.close(); } catch { /* already gone */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
