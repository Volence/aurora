#!/usr/bin/env node
// DOES THE OBJECT MARKER'S LABEL STAY INSIDE ITS BOX, IN THE RUNNING APP?
//
// ROADMAP §5.1 item 17. The node suite cannot resolve a font, cannot rasterise a
// glyph and cannot see a canvas, so everything it proves about this fix is
// proved against a MODEL of the app's metrics (`src/test/mono-measure.ts`). This
// harness closes that gap: it drives the real Electron app, reads what the
// overlay actually draws, measures it in the app's own 2D context, and diffs the
// canvas' own pixels with the object overlay on and off.
//
// IT IS THE CONTINUATION OF `effects-scene-harness.mjs` SECTION 12, which
// ATTRIBUTED the red `soli…` badge and deliberately left the code alone. The
// SCAN below is that section's scan, reused: same colour predicate, same spatial
// control, so the two runs are comparable. What is new is everything that asks
// whether the label is CONTAINED.
//
// THE TWO CONFIGURATIONS ARE THE POINT. Item 15 established that the badge never
// moves between facets — the canvas edge does, because the Effects dock is 300px
// where every other map facet's is 240px, leaving the badge 0px of clearance to
// the canvas' right edge on Effects and 60px on Layout. Both are exercised here,
// and the containment rows must hold on both. Nothing in this harness resizes a
// dock or turns a facet off to make a row go green.
//
// THE INSTRUMENT.
//   * A prototype spy on `fillText` / `fillRect`, so the harness reads the exact
//     string and font the overlay hands the rasteriser — not an inference from
//     pixels, and not a re-derivation of the fit in node.
//   * `measureText` in the app's own context at the font the spy recorded.
//   * A pixel DIFF of the map canvas with the object overlay ON and OFF, toggled
//     through the real View-menu checkbox. Everything that changes between those
//     two frames is, by construction, exactly what the object overlay painted —
//     which is the only way to bound its ink without guessing which pixels are
//     art.
//
// ANTI-VACUOUS, ROW BY ROW. A containment claim passes trivially on an empty
// screen, an unloaded project, a facet with no objects, or a label that was
// never drawn. So: 1a proves the fixture placement is still there; 2a proves the
// canvas repainted while the spy was live; 2b proves a label was drawn at all;
// 5b proves the View checkbox was found and its state really flipped; 5c proves
// the diff saw non-zero ink before 5d bounds it; C2 FAILS LOUDLY when the
// classic viewport drew no labels rather than reporting a contented zero.
//
// PROVEN RED-FIRST against master (d74e588), 15/23 — every instrument and
// anti-vacuous row green, and exactly the eight claim rows red:
//   2d "solid" 19.999771px against a 15px budget
//   2e the drawn label is not elided
//   3a the label font is world-space 8px, so zoom reveals nothing
//   4a a label is still drawn at zoom 0.5
//   5d the object overlay paints a 20px span through an 18px marker
//   C4 "Waterfall Sound Effect" 88.00px through a 23px budget
//   C5 the classic labels are still drawn at zoom 0.25
//   C6 nothing is elided
//
// ⚠ IT WRITES NOTHING TO DISK. No Ctrl+S, no save call; the run ends by clearing
// localStorage and reloading.
//
// Requires a debug build:  VITE_AURORA_DEBUG=1 npm run build
// Run:                     node scratchpad/object-label-harness.mjs

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as http from 'node:http';

const PORT = Number(process.env.PORT ?? 9393);
// Derived from this file's own location, never a pinned path — see the note in
// effects-scene-harness.mjs about a worktree serving the wrong dist/.
const ROOT = process.env.AURORA_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const ELECTRON = process.env.ELECTRON_BIN
  ?? (existsSync(`${ROOT}/node_modules/.bin/electron`)
    ? `${ROOT}/node_modules/.bin/electron`
    : '/home/volence/sonic_hacks/aurora/node_modules/.bin/electron');
const AEONDIR = process.env.AEON_DIR ?? '/home/volence/sonic_hacks/aeon';
const S1DIR = process.env.S1_DIR ?? '/home/volence/sonic_hacks/s1disasm';
const SHOTS = `${ROOT}/scratchpad/shots-object-label`;
mkdirSync(SHOTS, { recursive: true });

// ---------------------------------------------------------------------------
// GEOMETRY, mirrored from the draw sites so the expectations are derived.
//   OverlayRenderer.ts: OBJECT_BOX_SIZE / OBJECT_BOX_STROKE_WIDTH
//   classic-overlays.ts: GHOST_MARKER_BOUNDS.width / HEX_MARKER_SIZE / MARKER_STROKE_PX
// ---------------------------------------------------------------------------
const OBJECT_BOX_SIZE = 16;
const OBJECT_BOX_STROKE_WIDTH = 1;
const GHOST_BOX_WIDTH = 24;
const HEX_BOX_WIDTH = 16;
/** Interior the label may use: the box minus the part of its border painted inside it. */
const labelBudget = (box, stroke) => Math.max(0, box - stroke);
/**
 * Widest COLUMN SPAN the marker may light up on a zoom-1 canvas.
 *
 * The fill covers `OBJECT_BOX_SIZE` columns. The 1px stroke is painted centred
 * on the box path, so it hangs half a pixel outside each edge and tints one
 * extra column on each side. 16 + 1 + 1 = 18. Anything wider is ink that left
 * the marker — which, before this fix, the 19.999771px label did: centred on the
 * box it spanned 20 columns, and 21 with antialiasing.
 */
const MAX_MARKER_SPAN = OBJECT_BOX_SIZE + OBJECT_BOX_STROKE_WIDTH + 1;

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
async function shot(c, name) {
  const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  console.log(`        shot → scratchpad/shots-object-label/${name}.png`);
}

const clickByText = (re, tag = 'button') => String.raw`
(() => {
  const el = [...document.querySelectorAll(${JSON.stringify(tag)})]
    .find((e) => ${re}.test(((e.textContent || '') + ' ' + (e.getAttribute('aria-label') || '')).trim()));
  if (!el) return false;
  el.click();
  return true;
})()`;

// ---------------------------------------------------------------------------
// The spy. Records the exact (text, font) the overlay hands the rasteriser, and
// the marker rects, tagged with the canvas they landed on so a HUD or a swatch
// on some other canvas cannot be mistaken for a map label.
// ---------------------------------------------------------------------------
const SPY = String.raw`
(() => {
  if (window.__labelSpy) { window.__labelSpy.reset(); return 'already'; }
  const S = { texts: [], rects: [], on: false, repaints: 0 };
  window.__labelSpy = S;
  S.reset = () => { S.texts.length = 0; S.rects.length = 0; S.repaints = 0; };
  for (const P of [CanvasRenderingContext2D.prototype,
                   (typeof OffscreenCanvasRenderingContext2D !== 'undefined'
                     ? OffscreenCanvasRenderingContext2D.prototype : null)]) {
    if (!P) continue;
    const ft = P.fillText, fr = P.fillRect;
    P.fillText = function (t, x, y, mw) {
      if (S.on) S.texts.push({ text: String(t), x, y, font: this.font,
        cw: this.canvas ? this.canvas.width : -1, ch: this.canvas ? this.canvas.height : -1 });
      return mw === undefined ? ft.call(this, t, x, y) : ft.call(this, t, x, y, mw);
    };
    P.fillRect = function (x, y, w, h) {
      if (S.on) S.rects.push({ x, y, w, h,
        cw: this.canvas ? this.canvas.width : -1, ch: this.canvas ? this.canvas.height : -1 });
      return fr.call(this, x, y, w, h);
    };
  }
  // Repaint signal: the draw effect's canvas.width assignment (the same one the
  // MapViewport baseline harness counts).
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true, enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) { if (S.on) S.repaints++; return wd.set.call(this, v); },
  });
  return 'installed';
})()`;

/** Measure a string at an explicit font in the app's own 2D context. */
const MEASURE = (text, font) => String.raw`
(() => {
  const cv = document.querySelector('canvas');
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.font = ${JSON.stringify(font)};
  const w = ctx.measureText(${JSON.stringify(text)}).width;
  const resolved = ctx.font;
  ctx.restore();
  return { w, resolved };
})()`;

// ---------------------------------------------------------------------------
// Item-15 section 12's scan, reused verbatim in its predicate and its spatial
// control: the object box's own colours (fill rgba(255,100,100,.7) over the art,
// stroke #ff4444), and the hits must form ONE small cluster rather than lighting
// up reddish artwork across the canvas.
// ---------------------------------------------------------------------------
const SCAN = String.raw`
  (() => {
    const cv = document.getElementById('map-canvas');
    if (!cv) return { error: 'no-map-canvas' };
    const ctx = cv.getContext('2d');
    const im = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        const r = im[i], g = im[i + 1], b = im[i + 2];
        if (r > 190 && r - g > 60 && r - b > 60 && Math.abs(g - b) < 34) {
          n++;
          if (x < x0) x0 = x; if (y < y0) y0 = y;
          if (x > x1) x1 = x; if (y > y1) y1 = y;
        }
      }
    }
    const r = cv.getBoundingClientRect();
    const sx = (px) => Math.round(r.left + px * (r.width / cv.width));
    return {
      hits: n, bbox: n ? [x0, y0, x1, y1] : null,
      w: n ? x1 - x0 + 1 : 0, h: n ? y1 - y0 + 1 : 0,
      canvas: { w: cv.width, h: cv.height },
      css: { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) },
      screen: n ? { left: sx(x0), right: sx(x1 + 1) } : null,
      gapToCanvasRight: n ? Math.round(r.right - sx(x1 + 1)) : null,
    };
  })()`;

/** Stash the map canvas' pixels in the page so the diff never crosses the wire. */
const SNAP = String.raw`
  (() => {
    const cv = document.getElementById('map-canvas');
    if (!cv) return { error: 'no-map-canvas' };
    window.__snap = { w: cv.width, h: cv.height,
      d: cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data };
    return { w: cv.width, h: cv.height };
  })()`;

/** Bounding box of every pixel that changed since SNAP. */
const DIFF = String.raw`
  (() => {
    const cv = document.getElementById('map-canvas');
    const s = window.__snap;
    if (!cv || !s) return { error: 'no-snapshot' };
    if (cv.width !== s.w || cv.height !== s.h) return { error: 'canvas resized between frames' };
    const now = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (now[i] === s.d[i] && now[i + 1] === s.d[i + 1] && now[i + 2] === s.d[i + 2]) continue;
        n++;
        if (x < x0) x0 = x; if (y < y0) y0 = y;
        if (x > x1) x1 = x; if (y > y1) y1 = y;
      }
    }
    return { n, bbox: n ? [x0, y0, x1, y1] : null, w: n ? x1 - x0 + 1 : 0, h: n ? y1 - y0 + 1 : 0,
             canvas: { w: cv.width, h: cv.height } };
  })()`;

/** Flip the View menu's "Objects" checkbox with a real click; report both states. */
const TOGGLE_OBJECTS = String.raw`
  (() => {
    const lbl = [...document.querySelectorAll('label')]
      .find((l) => (l.textContent || '').trim() === 'Objects');
    if (!lbl) return { ok: false, reason: 'no Objects label in the open menu' };
    const box = lbl.querySelector('input[type=checkbox]');
    if (!box) return { ok: false, reason: 'the Objects label has no checkbox' };
    const before = box.checked;
    box.click();
    return { ok: true, before, after: box.checked };
  })()`;

async function spyRun(c, prep) {
  await c.evalExpr('window.__labelSpy.reset(); window.__labelSpy.on = true;');
  await prep();
  await sleep(900);
  await c.evalExpr('window.__labelSpy.on = false;');
  return c.json('window.__labelSpy');
}

/** Map labels only: the big canvas, i.e. the one the overlay repaints. */
const onMapCanvas = (rows, cw, ch) => rows.filter((r) => r.cw === cw && r.ch === ch);

async function main() {
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);
  const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
  delete env.DISPLAY;
  const child = spawn('/usr/bin/xvfb-run',
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
    const haveDbg = await waitDbg();
    check('0a', 'window.__dbg exists (this is a VITE_AURORA_DEBUG=1 build)', haveDbg,
      haveDbg ? undefined : 'rebuild with VITE_AURORA_DEBUG=1 npm run build');
    if (!haveDbg) throw new Error('no __dbg — nothing below can be measured');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4000);
    await waitDbg();

    // ================= AEON =================================================
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    if (!st || !st.open) throw new Error('aeon did not open — nothing below can be measured');
    const obj0 = await c.json('window.__dbg.aeon.objectAt(0, 0)');
    check('1a', 'THE SUBJECT IS ON SCREEN: act1 section_0 still holds the "solid" placement',
      !!(st.open && st.sections > 0) && !!obj0 && obj0.typeId === 'solid',
      `${JSON.stringify(st)} obj0=${JSON.stringify(obj0)}`);
    if (!obj0 || obj0.typeId !== 'solid') {
      throw new Error('the fixture placement is gone — every row below would be about nothing');
    }

    await sleep(2000);
    await c.evalExpr(SPY);
    await c.evalExpr(clickByText('/^Layout$/'));
    await sleep(1500);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(900);
    const view0 = await c.json('window.__dbg.view()');
    const cv0 = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);

    // ---- 2. What does the overlay actually hand the rasteriser? ------------
    const nudge = async () => {
      // Two setViews so a repaint is forced even if the first lands on the
      // camera's current value: the draw effect keys on vpX/vpY/zoom.
      await c.evalExpr('window.__dbg.setView(1, 0, 1)'); await sleep(500);
      await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    };
    const s1 = await spyRun(c, nudge);
    const labels1 = onMapCanvas(s1.texts, cv0.w, cv0.h);
    check('2a', 'the map canvas repainted while the spy was live (the instrument was watching something)',
      s1.repaints > 0, `${s1.repaints} canvas.width assignments, view=${JSON.stringify(view0)}, canvas ${cv0.w}x${cv0.h}`);
    // One label per repaint, and always the same one — the act holds exactly one
    // placement, so anything else means the harness is reading a different
    // surface (or the overlay is drawing something it should not).
    const distinct1 = [...new Set(labels1.map((l) => l.text))];
    check('2b', 'the object overlay drew one label per repaint, and always the same one',
      labels1.length > 0 && labels1.length === s1.repaints && distinct1.length === 1,
      `${labels1.length} labels over ${s1.repaints} repaints, distinct ${JSON.stringify(distinct1)} `
      + `at ${JSON.stringify(labels1[0] ?? null)}`);

    const drawn = labels1[0] ?? null;
    const rawM = await c.json(MEASURE('solid', '8px monospace'));
    const drawnM = drawn ? await c.json(MEASURE(drawn.text, drawn.font)) : null;
    // THE RE-MEASUREMENT the booking rests on, taken again from scratch.
    check('2c', 'RE-MEASURED: the raw typeId really is wider than its 16px box',
      rawM.w > OBJECT_BOX_SIZE,
      `"solid" measures ${rawM.w}px at ${rawM.resolved} — box is ${OBJECT_BOX_SIZE}px, `
      + `so it overflowed by ${((rawM.w - OBJECT_BOX_SIZE) / 2).toFixed(4)}px each side`);
    check('2d', 'THE FIX: what is DRAWN fits the box interior, measured at the font it is drawn with',
      !!drawn && !!drawnM && drawnM.w <= labelBudget(OBJECT_BOX_SIZE, OBJECT_BOX_STROKE_WIDTH),
      drawn
        ? `drew ${JSON.stringify(drawn.text)} at ${drawnM.resolved} = ${drawnM.w}px, `
          + `budget ${labelBudget(OBJECT_BOX_SIZE, OBJECT_BOX_STROKE_WIDTH)}px `
          + `(box ${OBJECT_BOX_SIZE} minus its ${OBJECT_BOX_STROKE_WIDTH}px border)`
        : 'no label was drawn at all');
    check('2e', 'and it is elided, not silently truncated — the reader can see there is more',
      !!drawn && drawn.text !== 'solid' && drawn.text.endsWith('…') && drawn.text.length > 1,
      drawn ? JSON.stringify(drawn.text) : 'none');

    // ---- 3. Zoom is the affordance: the whole id reads at zoom 2. ----------
    const s2 = await spyRun(c, async () => {
      await c.evalExpr('window.__dbg.setView(700, 120, 2)');
    });
    const cvZ2 = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);
    const labels2 = onMapCanvas(s2.texts, cvZ2.w, cvZ2.h);
    // The font must be SCREEN-sized for this to mean anything: with a world-space
    // 8px font the box and the glyphs scale together, so an id that did not fit at
    // zoom 1 never fits at any zoom, and "it shows the whole id at zoom 2" would be
    // true only because it showed the whole id (spilling) at zoom 1 as well.
    check('3a', 'at zoom 2 the marker shows the WHOLE typeId, in a screen-sized font',
      labels2.some((l) => l.text === 'solid')
      && labels2.every((l) => l.font === `${8 / 2}px monospace`),
      JSON.stringify(labels2.map((l) => [l.text, l.font])));

    // ---- 4. Zoomed out, the label goes rather than smearing. ---------------
    const s3 = await spyRun(c, async () => {
      await c.evalExpr('window.__dbg.setView(0, 0, 0.5)');
    });
    const cvZh = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);
    const labels3 = onMapCanvas(s3.texts, cvZh.w, cvZh.h);
    const boxes3 = onMapCanvas(s3.rects, cvZh.w, cvZh.h)
      .filter((r) => r.w === OBJECT_BOX_SIZE && r.h === OBJECT_BOX_SIZE);
    check('4a', 'at zoom 0.5 no label is drawn — AND the marker box still is',
      labels3.length === 0 && boxes3.length >= 1,
      `labels=${JSON.stringify(labels3.map((l) => l.text))} `
      + `16x16 marker fills=${boxes3.length} (anti-vacuous: 0 would mean the draw loop never ran)`);

    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(900);

    // ---- 5. THE PIXELS, on LAYOUT (60px of clearance). ---------------------
    const layoutScan = await c.json(SCAN);
    check('5a', 'the red marker is on the Layout canvas, as ONE small cluster (not reddish artwork)',
      layoutScan.hits > 0 && layoutScan.w > 0 && layoutScan.w <= 24 && layoutScan.h > 0 && layoutScan.h <= 24,
      `${layoutScan.hits}px, cluster ${layoutScan.w}x${layoutScan.h} at ${JSON.stringify(layoutScan.bbox)} `
      + `on a ${layoutScan.canvas.w}x${layoutScan.canvas.h} canvas, `
      + `clearance to the canvas' right edge ${layoutScan.gapToCanvasRight}px`);
    await shot(c, '1-layout-zoom1');

    const layoutDiff = await withObjectsToggled(c);
    check('5b', 'the View menu\'s Objects checkbox was found and really flipped',
      layoutDiff.off.ok === true && layoutDiff.off.before !== layoutDiff.off.after
      && layoutDiff.on.ok === true,
      `menu opened after ${layoutDiff.opens} attempt(s) | off: ${JSON.stringify(layoutDiff.off)} `
      + `| back on: ${JSON.stringify(layoutDiff.on)}`);
    check('5c', 'turning the object overlay off changed pixels (the diff has a subject)',
      layoutDiff.diff.n > 0,
      `${layoutDiff.diff.n} px changed, bbox ${JSON.stringify(layoutDiff.diff.bbox)}`);
    check('5d', 'EVERYTHING the object overlay paints is inside its own marker — no ink escapes',
      layoutDiff.diff.n > 0 && layoutDiff.diff.w <= MAX_MARKER_SPAN && layoutDiff.diff.h <= MAX_MARKER_SPAN,
      `painted span ${layoutDiff.diff.w}x${layoutDiff.diff.h}px; the marker may span `
      + `${MAX_MARKER_SPAN} (a ${OBJECT_BOX_SIZE}px fill plus a ${OBJECT_BOX_STROKE_WIDTH}px border `
      + `hanging half a pixel outside each edge). The unfitted label spanned 20-21.`);

    // ---- 6. THE OTHER CONFIGURATION: Effects (0px of clearance). ----------
    await c.evalExpr(clickByText('/^Effects$/'));
    await sleep(2000);
    await c.evalExpr('window.__dbg.setView(0, 0, 1)');
    await sleep(900);
    const fxScan = await c.json(SCAN);
    check('6a', 'the same marker is on the Effects canvas, in the same place, with NO clearance',
      fxScan.hits > 0 && layoutScan.bbox && fxScan.bbox
      && Math.abs(fxScan.bbox[0] - layoutScan.bbox[0]) <= 2
      && Math.abs(fxScan.bbox[1] - layoutScan.bbox[1]) <= 2
      && fxScan.canvas.w < layoutScan.canvas.w,
      `effects bbox ${JSON.stringify(fxScan.bbox)} on a ${fxScan.canvas.w}px canvas `
      + `(clearance ${fxScan.gapToCanvasRight}px) vs layout bbox ${JSON.stringify(layoutScan.bbox)} `
      + `on ${layoutScan.canvas.w}px (clearance ${layoutScan.gapToCanvasRight}px) — `
      + `the badge did not move, the canvas edge did`);
    await shot(c, '2-effects-zoom1');

    const fxDiff = await withObjectsToggled(c);
    check('6b', 'the Effects toggle flipped too, and its diff has a subject',
      fxDiff.off.ok === true && fxDiff.off.before !== fxDiff.off.after && fxDiff.diff.n > 0,
      `menu opened after ${fxDiff.opens} attempt(s) | off: ${JSON.stringify(fxDiff.off)} | `
      + `back on: ${JSON.stringify(fxDiff.on)} | ${fxDiff.diff.n} px changed, `
      + `bbox ${JSON.stringify(fxDiff.diff.bbox)}`);
    // ⚠ READ THIS ROW'S LIMIT. It does NOT discriminate the fix on its own: run
    // against master the Effects facet reports span 18 and PASSES, because the
    // canvas' right edge sits at 816 and clips the right half of the overflowing
    // label away before the diff can see it (master bbox: [798,201,815,218] —
    // note the 815). That IS item 15's finding, restated as a measurement: the
    // narrower canvas hides half the evidence. 5d, on the 60px-clearance Layout
    // canvas, is the row that discriminates — master 20, fixed 18.
    check('6c', 'and on the 0px-clearance facet too, nothing the marker paints leaves it',
      fxDiff.diff.n > 0 && fxDiff.diff.w <= MAX_MARKER_SPAN && fxDiff.diff.h <= MAX_MARKER_SPAN,
      `painted span ${fxDiff.diff.w}x${fxDiff.diff.h}px, ceiling ${MAX_MARKER_SPAN}`);

    // ================= CLASSIC ==============================================
    // A different engine, a different draw path (classic-overlays.drawObjects),
    // and the site the booking did NOT name: the ghost marker labels its box
    // with an object NAME, not two hex digits.
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(4500);
    await waitDbg();
    await c.evalExpr(`window.__dbg.openDir(${JSON.stringify(S1DIR)})`).catch(() => {});
    let ls = null;
    for (let i = 0; i < 60; i++) {
      ls = await c.json('window.__dbg.levelState()').catch(() => null);
      if (ls && ls.status === 'ready') break;
      await sleep(500);
    }
    check('C1', 'the classic project opened and an act is ready', !!ls && ls.status === 'ready',
      JSON.stringify(ls));
    await c.evalExpr(SPY);

    // Find an act that actually holds an invisible/trigger object — the ghost
    // marker is the long-label case, and a row about it run on an act with none
    // would be a row about nothing.
    // s1-objects.ts S1_INVISIBLE_OBJECT_IDS. `__dbg.classic.listObjects` is the
    // probe (NOT `__dbg.listObjects`, which does not exist — the first run of
    // this harness swallowed that into a `.catch(() => [])` and reported "no
    // ghost object in any act", which was the instrument, not the data).
    const GHOST_IDS = [0x13, 0x49, 0x54, 0x68, 0x71, 0x72];
    const RING_ID = 0x25; // present in every act — the control
    const ACTS = [];
    for (const z of ['ghz', 'mz', 'syz', 'lz', 'slz', 'sbz']) for (const a of [1, 2, 3]) ACTS.push([z, a]);
    let ghostAct = null;
    let ringsSeen = 0;
    let actsOpened = 0;
    const scanned = [];
    for (const [z, a] of ACTS) {
      const ok = await c.evalExpr(
        `window.__dbg.openAct(${JSON.stringify(z)}, ${a}).then(() => true).catch(() => false)`)
        .catch(() => false);
      if (!ok) { scanned.push(`${z}${a}:unopened`); continue; }
      actsOpened++;
      await sleep(1100);
      ringsSeen += (await c.json(`window.__dbg.classic.listObjects(${RING_ID})`).catch(() => [])).length;
      const found = [];
      for (const id of GHOST_IDS) {
        const list = await c.json(`window.__dbg.classic.listObjects(${id})`).catch(() => []);
        if (list.length) found.push({ id, n: list.length, at: list[0] });
      }
      scanned.push(`${z}${a}:${found.map((f) => `$${f.id.toString(16)}x${f.n}`).join(',') || '-'}`);
      if (found.length) { ghostAct = { zone: z, act: a, found }; break; }
    }
    // CONTROL: an object query that finds nothing everywhere is indistinguishable
    // from a probe that reads nothing. Rings are in every act.
    check('C2a', 'the object probe reads real data (rings found across the acts it opened)',
      actsOpened > 0 && ringsSeen > 0,
      `${actsOpened} acts opened, ${ringsSeen} ring placements seen`);
    check('C2', 'an act with an invisible/trigger object was found (the ghost marker has a subject)',
      !!ghostAct, ghostAct ? `${ghostAct.zone}${ghostAct.act} ${JSON.stringify(ghostAct.found)}`
        : `scanned ${scanned.join(' ')} — no invisible/trigger id anywhere in this disassembly`);

    if (ghostAct) {
      // Park the camera on the ghost so it is actually inside the viewport, at
      // zoom 1 where the label is legible.
      const at = ghostAct.found[0].at;
      await c.evalExpr(`window.__dbg.setView(${Math.max(0, at.x - 200)}, ${Math.max(0, at.y - 200)}, 1)`);
      await sleep(1200);
    }

    // Whatever act we are on, measure what the classic overlay ACTUALLY draws.
    // The ghost marker is the long-label case; the hex fallback is the common
    // one. Both are the same defect class and both are measured the same way.
    const cvC = await c.json(
      `(() => { const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width - a.width)[0];`
      + ` return { w: cv.width, h: cv.height }; })()`);
    const sc = await spyRun(c, async () => {
      const v = await c.json('window.__dbg.view()');
      await c.evalExpr(`window.__dbg.setView(${v.x + 1}, ${v.y}, 1)`);
      await sleep(500);
      await c.evalExpr(`window.__dbg.setView(${v.x}, ${v.y}, 1)`);
    });
    const texts = onMapCanvas(sc.texts, cvC.w, cvC.h)
      .filter((t) => t.text !== 'START' && t.text !== '\u221e');
    const rects = onMapCanvas(sc.rects, cvC.w, cvC.h);
    const markerRects = rects.filter((r) => (r.w === GHOST_BOX_WIDTH || r.w === HEX_BOX_WIDTH) && r.h === 16);
    check('C3', 'the classic viewport drew object markers AND labels in them',
      markerRects.length > 0 && texts.length > 0,
      `${markerRects.length} marker fills, ${texts.length} labels `
      + `${JSON.stringify([...new Set(texts.map((t) => t.text))].slice(0, 12))} `
      + `on a ${cvC.w}x${cvC.h} canvas`);

    // Measure every label the app drew, at the font it drew it with, against the
    // box it belongs to. Two hex digits are the hex fallback's box (16); anything
    // else is a ghost name (24). This is the general claim, not one string.
    const measured = [];
    for (const t of [...new Map(texts.map((t) => [t.text + t.font, t])).values()]) {
      const m = await c.json(MEASURE(t.text, t.font));
      const isHex = /^[0-9A-F]{2}$/.test(t.text);
      const box = isHex ? HEX_BOX_WIDTH : GHOST_BOX_WIDTH;
      // Both classic markers stroke at 1 SCREEN px; at zoom 1 that is 1 world px.
      measured.push({ text: t.text, font: t.font, w: m.w, box, budget: labelBudget(box, 1) });
    }
    const over = measured.filter((m) => m.w > m.budget);
    check('C4', 'EVERY label the classic overlay drew fits the box it is centred in',
      measured.length > 0 && over.length === 0,
      measured.length === 0
        ? 'NOT MEASURABLE — the viewport drew no labels at all. This row is a FAILURE, '
          + 'not a contented zero: a containment claim over an empty set proves nothing.'
        : `${measured.length} distinct labels measured, ${over.length} over budget: `
          + JSON.stringify(measured.map((m) => `${m.text}=${m.w.toFixed(2)}/${m.budget}`)));

    // The suppression path, live: zoom out until the screen-sized font no longer
    // fits the world-sized box, and the labels go while the boxes stay.
    const sc2 = await spyRun(c, async () => {
      const v = await c.json('window.__dbg.view()');
      await c.evalExpr(`window.__dbg.setView(${v.x}, ${v.y}, 0.25)`);
    });
    const cvC2 = await c.json(
      `(() => { const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width - a.width)[0];`
      + ` return { w: cv.width, h: cv.height }; })()`);
    const texts2 = onMapCanvas(sc2.texts, cvC2.w, cvC2.h)
      .filter((t) => t.text !== 'START' && t.text !== '\u221e');
    const rects2 = onMapCanvas(sc2.rects, cvC2.w, cvC2.h)
      .filter((r) => (r.w === GHOST_BOX_WIDTH || r.w === HEX_BOX_WIDTH) && r.h === 16);
    check('C5', 'zoomed out, the classic labels are dropped and the marker boxes remain',
      rects2.length > 0 && texts2.length === 0,
      `at zoom 0.25: ${rects2.length} marker fills, ${texts2.length} labels `
      + `${JSON.stringify([...new Set(texts2.map((t) => t.text))])} `
      + `(anti-vacuous: 0 marker fills would mean the viewport simply drew nothing)`);

    // The long-name ghost marker is the elision case on this engine. If this
    // disassembly holds no invisible/trigger object, say so — do NOT report a
    // green row about a marker that is not on screen.
    if (ghostAct) {
      const elided = measured.filter((m) => m.text.endsWith('…'));
      check('C6', 'the ghost marker\'s long name is ELIDED, not drawn through its box',
        elided.length > 0,
        JSON.stringify(elided.map((m) => `${m.text} (${m.w.toFixed(2)}px in ${m.box})`)));
    } else {
      check('C6', 'the ghost marker\'s long name is ELIDED, not drawn through its box', false,
        'NOT MEASURABLE IN THIS FIXTURE — s1disasm holds no placement of any id in '
        + 'S1_INVISIBLE_OBJECT_IDS ($13/$49/$54/$68/$71/$72), so the ghost marker never '
        + 'draws. Reported as a failure of the HARNESS to reach its subject, not as a '
        + 'passing claim. The path is covered in node by object-label-draw.test.ts.');
    }
    await shot(c, '3-classic-labels');

    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload').catch(() => {});
  } finally {
    try { c?.close(); } catch { /* ignore */ }
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* ignore */ }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} rows passed`);
  if (fails.length) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exitCode = 1; }
}

/**
 * Snapshot the map canvas, turn the object overlay off through the real
 * View-menu checkbox, snapshot again, diff, turn it back on.
 */
async function withObjectsToggled(c) {
  await c.evalExpr(SNAP);
  // The View menu is a toggle, so a stale open state turns "click View" into
  // "close View". Close first, then open, then PROVE the Objects checkbox is in
  // the DOM before touching it — the first run of this harness went 0-pixel
  // green-looking on the Effects facet purely because the menu was shut.
  let opens = 0;
  for (; opens < 4; opens++) {
    const have = await c.evalExpr(String.raw`
      [...document.querySelectorAll('label')].some((l) => (l.textContent || '').trim() === 'Objects')`);
    if (have) break;
    await c.evalExpr(clickByText('/View/'));
    await sleep(700);
  }
  const off = await c.json(TOGGLE_OBJECTS);
  await sleep(1200);
  const diff = await c.json(DIFF);
  const on = await c.json(TOGGLE_OBJECTS);
  await sleep(900);
  // Close the menu so the next facet click is not swallowed by it.
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }).catch(() => {});
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }).catch(() => {});
  await c.evalExpr(`document.body.click()`).catch(() => {});
  await sleep(600);
  return { off, on, diff, opens: opens + 1 };
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
