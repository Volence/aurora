#!/usr/bin/env node
// WHAT MAKES THE AEON MAP REPAINT, AND WHAT DOES ONE REPAINT COST?
//
// The incoming effects-authoring arc wants to hang per-scanline passes
// (parallax band previews, BgAnim band playback, palette cycling) on
// MapViewport. It assumed it could ride the play-clock + overlay-pass
// machinery. Two static facts say it cannot:
//
//   MapViewport.tsx                       0 requestAnimationFrame calls
//   classic/ClassicLevelViewport.tsx      4 (:195 comment, :212, :427, :429)
//   state/viewStore.ts:51 / :52-55        playAnimatedArt + occludeSprites are
//                                         listed for 's1' ONLY; neither appears
//                                         in the 'aeon' overlay list
//
// So aeon's viewport is EVENT-DRIVEN: one useEffect (MapViewport.tsx:528-574)
// keyed on [vpX, vpY, zoom, overlays, project, currentZoneId, currentActId,
// activeSectionIndex, editingLayer, historyVersion, liveEditVersion, selection,
// objectSprites, collisionProfiles, drawCollisionPreview]. Nothing in that list
// is a clock. This harness MEASURES that on the running app instead of asserting
// it from a grep, and puts a distribution on the repaint cost so the arc's
// preview posture stops being provisional.
//
// ------------------------------------------------------------------ instrument
// THE COMPONENT IS NEVER ASKED WHETHER IT WORKED. MapViewport reports nothing
// about itself; the harness installs its own probe from outside (window.__mvProbe)
// and times the component's REAL draw calls:
//
//   start of a repaint  = the assignment `canvas.width = rect.width`
//                         (MapViewport.tsx:537 — the first statement of the draw
//                         effect after its guards; also the resize path's first
//                         statement). Caught by patching the HTMLCanvasElement
//                         `width` accessor on the prototype.
//   end of a repaint    = the return of the LAST wrapped 2D op issued against
//                         #map-canvas in that same synchronous task. The record
//                         is closed in a queueMicrotask, which runs only after
//                         the whole task (and therefore after every draw) has
//                         finished.
//
// The bracket therefore CONTAINS SectionRenderer.flushAllDirty() + the section
// blits + OverlayRenderer's whole pass, and EXCLUDES React's commit, the
// compositor, and the sibling collision-preview canvas (ops are filtered by
// `this.canvas === #map-canvas`). It is a paint-work number, not a
// frame-to-photon number, and the output says so.
//
// Wrapper overhead: only coarse ops are wrapped (drawImage/putImageData/
// fillRect/strokeRect/clearRect/stroke/fill/fillText/strokeText). Path-building
// calls (beginPath/moveTo/lineTo/arc) are NOT wrapped, because OverlayRenderer
// issues them in bulk for the grids and each one would pay for a wrapper. The
// grids still end in a wrapped stroke(), so the bracket's end is unaffected.
// Every row prints its ops/blits count so the reader can size the overhead
// itself (tens of ops per repaint => well under 10us of wrapper time). The patch
// is on the PROTOTYPE, so every 2D canvas in the app pays one identity compare
// per wrapped op; the thumbnails and palette grids are not on any hot path here,
// and the compare short-circuits on `cur` being null outside a repaint.
//
// --------------------------------------------------------------------- clock
// performance.now() IN THIS RENDERER IS COARSENED TO 100us, AND THE FIRST RUN
// OF THIS HARNESS PROVED IT. A page that is not cross-origin-isolated gets a
// clamped DOMHighResTimeStamp. In that run every per-repaint figure in five of
// six cells was an exact multiple of 0.1ms; cell f produced only TWO distinct
// values over 80 repaints, and cells a/b/c/f all reported a median of exactly
// 0.000ms. A repaint that costs ~50us is SMALLER THAN ONE TICK OF THE RULER, so
// those medians were quantisation artefacts and row 3 was comparing noise to
// noise. (ops/repaint DID vary across cells — 18/12/8/89/12 — and blits varied
// 1 vs 4, so the bracket was closing and the pans were really moving the view.
// The clock was the whole confound.)
//
// THE FIX IS AMORTISED BATCHING, and it is the only fix available here. What
// was considered and why it was rejected:
//   - cross-origin isolation (COOP+COEP) is the ONLY supported way to unclamp
//     performance.now(), and it means editing the app's own security headers.
//     That changes the thing being measured. REJECTED, and no Chromium switch
//     short of it unclamps the web-facing clock.
//   - timing Runtime.evaluate round trips from Node: measures websocket + IPC
//     latency (hundreds of us, jittery, and larger than the signal), and it
//     cannot bracket the INSIDE of a synchronous draw at all. REJECTED.
//   - PerformanceObserver / performance.mark+measure: entry startTime and
//     duration are the SAME clamped DOMHighResTimeStamp, so there is nothing to
//     gain; longtask and long-animation-frame entries only fire above 50ms, two
//     orders of magnitude above the signal. REJECTED.
//   - CDP Performance.getMetrics: genuinely NOT clamped, and it IS used — but
//     REPORTED ONLY, never asserted, because ScriptDuration is a renderer-wide
//     counter that cannot be attributed to the draw effect alone (it also
//     counts React's commit, the harness's own setView evals and every rAF
//     callback). It is a cross-check on the ORDER of the numbers, not a source.
//
// So: sum the brackets of B consecutive qualifying repaints and divide by B.
// The idle BETWEEN repaints is not inside the sum — each repaint keeps its own
// bracket, exactly as before — so only the quantisation error accumulates, and
// it accumulates as sqrt(B) rather than B, because the rounding error's phase
// is independent from repaint to repaint (repaints are paced by rAF at 16.67ms,
// which is not a whole number of 0.1ms ticks, so the phase drifts). The
// per-repaint cost therefore resolves to about q/sqrt(3*B) instead of q.
//
// THAT IS AN ASSUMPTION, SO IT IS MEASURED, NOT ASSERTED:
//   c1  reads performance.now() in a tight spin and reports the ACTUAL quantum,
//       the number of times the value changed, and whether it ever went
//       backwards. A dead timer fails here immediately and unambiguously — this
//       is a far more sensitive test of "the clock is frozen" than counting
//       distinct values in a handful of repaint deltas ever was.
//   c2  pushes three synthetic workloads whose costs are 1:2:4 BY CONSTRUCTION,
//       each one deliberately smaller than a tick, through the IDENTICAL
//       batching machinery, and checks the ratios come back. It also measures
//       the ACHIEVED EFFECTIVE RESOLUTION directly, with no theory in it: the
//       standard deviation of batch means over a CONSTANT workload is clock
//       noise and almost nothing else. Row 3's floor is that number.
//
// TWO DISTRIBUTIONS ARE NOW REPORTED PER CELL. THEY ARE DISTRIBUTIONS OF
// DIFFERENT THINGS AND EVERY LINE SAYS WHICH:
//   raw        one sample per repaint, quantised to q. Keeps the TAIL, so it is
//              what row 4's p95 headroom assertion still runs on, unchanged — a
//              p95 over batch means would be a strictly weaker bound (means
//              have no tail) and row 4 must not weaken.
//   amortised  one sample per BATCH OF B REPAINTS, expressed per repaint.
//              Resolves below q. Central tendency ONLY: a mean of B repaints
//              cannot see an outlier. Row 3 runs on this.
//
// ---------------------------------------------------------------- anti-vacuous
// Every row that could produce a plausible number against nothing is guarded:
//   p1  a REAL aeon project is open, with sections > 0, and the Layout facet has
//       mounted a real #map-canvas.
//   p2  that canvas is non-zero-sized and has ACTUALLY PAINTED ART — sampled
//       pixels, >= 5% non-black/non-void and >= 16 distinct colours. (This repo
//       once "passed" a stamp-ghost check against a legitimately blank chunk;
//       a flat fill will not satisfy the distinct-colour bar.)
//   p3  the probe is bound to the live element, and a forced pan produced a
//       repaint carrying at least one BLIT — a repaint that only cleared the
//       canvas is discarded, never timed.
//   c1  the clock advances, monotonically, and its quantum is MEASURED rather
//       than assumed.
//   c2  the batching actually recovers sub-quantum signal, and the resolution
//       it achieves is measured rather than derived.
//   2*  every timing cell needs >= 30 qualifying repaints, >= 12 full batches,
//       >= 3 distinct AMORTISED values, and raw samples that are not one single
//       frozen number. A frozen clock makes every delta 0, so every batch mean
//       is 0, so the amortised distinct-count collapses to 1 and 2*-d fails —
//       the old guard's exact job, on the new distribution. What the old guard
//       could NOT do, and c1 now does, is tell a frozen clock apart from a
//       coarse one: 2f-d failed last run on a perfectly live clock that only
//       had room to show two levels under a sub-tick cost.
//   3   cross-cell tripwire: if the amortised median is effectively IDENTICAL
//       across a 16x zoom range, an overlay toggle and a window resize, the row
//       FAILS and says the instrument is the first suspect, not the mechanism.
//       It ALSO fails if the gap between the extreme medians is not larger than
//       the resolution c2 demonstrated — agreement inside the error bar is not
//       a finding — and it no longer divides by a zero median (see the note at
//       the row itself). Removing the clock confound did not disable this
//       detector: if the costs genuinely do agree now, row 3 SHOULD still fail,
//       and that is then a real finding about the viewport.
//
// ------------------------------------------------------------------- the rows
//   p1 p2 p3  preconditions (above)
//   c1 c2     clock quantum, and the sub-quantum resolution calibration
//   1a        idle window, early — REPORTED only (async loads may still land)
//   1b        a pan repaints
//   1c        a zoom change repaints
//   1d        a real View-menu overlay toggle repaints
//   1e        a real stamp edit repaints — and its cost is reported SEPARATELY
//             as the dirty-flush regime (NOT the palette regime; see note 5b)
//   1f        idle window, late: the page's own frame loop is ticking (>= 100
//             rAF ticks in 5s) and MapViewport repaints EXACTLY ZERO times.
//             This is the finding: there is no clock on this viewport.
//   2a-2f     repaint cost distributions across zoom, overlays and window size
//   3         suspicious-constant tripwire
//   4         headroom vs a 16.7ms frame: ASSERTS worst p95 < 16.7ms, REPORTS
//             the percentage for every cell
//   5         regime notes — including, verbatim, what this instrument CANNOT
//             distinguish
//
// EXECUTION ORDER IS NOT ROW ORDER, on purpose: the timing cells (2*) run before
// 1e and 1f. 1e writes the document, which would put a dirty flush into every
// later cell's tail; 1f needs a quiet app, which it cannot have while cells are
// panning. Read the output by row id, not top to bottom.
//
// Usage:
//   VITE_AURORA_DEBUG=1 npm run build
//   node scratchpad/mapviewport-baseline-harness.mjs        (VERBOSE=1 for app logs)
//                                                          (PORT=... to move off 9427)
//                                                          (AURORA_BUILT_TREE=... to pin the
//                                                           BUILT tree this runs against —
//                                                           not AURORA_ROOT, which names the
//                                                           checkout and no longer moves it)
//                                                          (PANS=... pans per cell, default 150)
//                                                          (BATCH=... repaints per batch, default 12)
// PANS and BATCH are the resolution/runtime dial. Lowering either COARSENS the
// amortised number; rows c2 and the per-cell resolution line will say so in the
// output, so a short run cannot quietly masquerade as a precise one.

import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { spawn, execSync } from 'node:child_process';
import { writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import { spawnGuarded, killTree } from './lib/harness-guard.mjs';
import { resolveRunRoot } from './lib/run-root.mjs';

const PORT = Number(process.env.PORT ?? 9427);

/**
 * WHICH TREE ACTUALLY RUNS. A git worktree shares no node_modules and no dist/
 * with the checkout it was cut from, so `<worktree>/node_modules/.bin/electron`
 * does not exist there. Rather than fail with ENOENT halfway through a spawn,
 * walk up until a tree has BOTH a built main bundle and an electron binary, and
 * announce which one was chosen — the run is against THAT tree's build, and a
 * reader has to know whether it was the one they edited.
 */
// `here` stays a LOCAL derivation because it is the OTHER OPERAND of the
// comparison `resolveRunRoot` exists to make: "the tree this script lives in"
// against "the tree the run is against". `AURORA_DIR` IS `here` — observed from
// the resolver's own module location, never movable by an operator (empyrean
// contract/SUITE_PATHS.md @ fba68d5) — so asking for both operands from there
// would make `borrowed` permanently false. It is passed IN for the same reason
// the contract's step-3 beds parameterise their anchor: a resolver whose anchor
// is its own file cannot be stood anywhere else, and then nothing can test it.
//
// THE WALK ITSELF MOVED to `lib/run-root.mjs` so it can be executed by a test
// with the two variables pointed APART — a caller assigned to the wrong half of
// the O70 split is invisible while they both name the same directory, which is
// every run until someone sets the override. This file needs a built app to run
// at all, so a property proved only here is proved nowhere.
const { root: ROOT, here: HERE, borrowed: BORROWED } = resolveRunRoot(
  dirname(dirname(fileURLToPath(import.meta.url))),
);
const ELECTRON = `${ROOT}/node_modules/.bin/electron`;
const AEON_DIR = siblingPathOrUnresolved('aeon');               // OPEN ONLY — never saved
const SHOTS = join(HERE, 'scratchpad/shots-mapviewport-baseline');
mkdirSync(SHOTS, { recursive: true });

const FRAME_MS = 1000 / 59.92275;   // 16.6881ms — one NTSC Mega Drive frame

/**
 * THE RESOLUTION DIAL. See the "clock" section of the header.
 *
 * BATCH is how many consecutive qualifying repaints are summed before dividing;
 * it buys resolution as sqrt(BATCH) and costs nothing but sample count. PANS is
 * how many pans a cell drives — the first run produced almost exactly 2
 * qualifying repaints per pan, so PANS=150 should yield ~300 raw samples and
 * ~25 batch means per cell. MIN_BATCHES is the floor the cell assertion holds
 * the batch count to; a cell that cannot reach it is reported as such rather
 * than quietly averaged over three points.
 */
const BATCH = Math.max(2, Number(process.env.BATCH ?? 12));
const PANS_PER_CELL = Math.max(20, Number(process.env.PANS ?? 150));
const MIN_BATCHES = 12;

/**
 * What one amortised number can bear. Filled in by rows c1 and c2; until they
 * run these are the a-priori figures for a 100us clamped clock, and `source`
 * says so, so no line can print a precision it has not earned.
 */
const RESOLUTION = {
  quantumMs: 0.1,
  theoryMs: 0.1 / Math.sqrt(3 * BATCH),
  calibSdMs: null,
  ms: 0.1 / Math.sqrt(3 * BATCH),
  source: 'ASSUMED — c1/c2 have not run yet',
};

const T_START = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const upt = () => `${((Date.now() - T_START) / 1000).toFixed(1)}s`;

const results = []; const fails = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, ok }); if (!ok) fails.push(id);
}
function note(id, text) { console.log(`NOTE  [${id}] ${text}`); }
function report(text) { console.log(`      ${text}`); }

// ----------------------------------------------------------------- CDP plumbing
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
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('CDP target never appeared');
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1; const pending = new Map();
  const exceptions = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      exceptions.push(d.exception?.description ?? d.text ?? '(unknown)');
    }
  });
  const ready = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${JSON.stringify(m.error)}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalExpr = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
    return r.result.value;
  };
  return {
    ready, send, evalExpr, exceptions,
    json: async (e) => JSON.parse(await evalExpr(`JSON.stringify(${e})`)),
    close: () => ws.close(),
  };
}
async function shot(c, name) {
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}/${name}.png`, Buffer.from(data, 'base64'));
  } catch { /* cosmetic */ }
}
async function key(c, k, code) {
  await c.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
}
async function mouse(c, type, x, y) {
  await c.send('Input.dispatchMouseEvent', {
    type, x, y, button: 'left',
    buttons: type === 'mousePressed' ? 1 : 0,
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0,
  });
}
const clickEl = (c, finderExpr) => c.evalExpr(`(() => { const e = ${finderExpr}; if (!e) return false; e.click(); return true; })()`);

/**
 * Toggle one View-menu overlay through the REAL menu (open, click the checkbox
 * label, close by clicking the menu button again — Menu.tsx only closes on an
 * outside mousedown or a second button click, and there is no viewStore door on
 * __dbg for overlays). Returns the checkbox's state after the click.
 */
async function toggleOverlay(c, labelText) {
  const VIEWBTN = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('View'))`;
  const LABEL = `[...document.querySelectorAll('label')].find((l) => l.textContent.trim() === ${JSON.stringify(labelText)})`;
  if (!(await clickEl(c, VIEWBTN))) throw new Error('View menu button not found');
  await sleep(250);
  if (!(await clickEl(c, LABEL))) throw new Error(`'${labelText}' not in the open View menu`);
  await sleep(250);
  const checked = await c.evalExpr(`(() => { const l = ${LABEL}; return l ? l.querySelector('input').checked : null; })()`);
  await clickEl(c, VIEWBTN);            // close it again
  await sleep(500);
  return checked;
}

// ------------------------------------------------------------- the probe itself
//
// Installed BY THE HARNESS, into the page, around the component. MapViewport is
// not modified and reports nothing about itself.
const INSTALL_PROBE = String.raw`
(() => {
  if (window.__mvProbe) return 'already-installed';
  const cv = document.getElementById('map-canvas');
  if (!cv) return 'no-map-canvas';

  const P = {
    canvas: cv,
    pageOriginWall: Date.now() - performance.now(),
    repaints: [],          // { at, ms, toFirstOpMs, ops, blits }
    // mark()/since() are INDEX based, so a ring-buffer splice would silently
    // shift every outstanding mark and hand a cell the wrong window. Counted
    // here so measureCell can refuse the cell instead of averaging the wrong
    // repaints. At PANS=150 the whole run records ~2000, well inside the 8000
    // cap — but the cap moved from "unreachable" to "merely far away" when the
    // sample count went up 3.75x for the batching, so it is now checked.
    dropped: 0,
    ticks: 0,
    ticking: false,
  };
  window.__mvProbe = P;

  P.mark = () => P.repaints.length;
  P.since = (n) => P.repaints.slice(n);
  /** Is the probe still bound to the element React currently has mounted? */
  P.bound = () => P.canvas === document.getElementById('map-canvas');
  P.rebind = () => { const el = document.getElementById('map-canvas'); if (el) P.canvas = el; return !!el; };
  /** Page uptime + wall clock, so every timing figure can carry both. */
  P.clock = () => ({ pageUptimeS: performance.now() / 1000, wall: new Date().toISOString() });

  // The page's OWN frame loop, owned by the harness. It exists so the idle rows
  // can tell "MapViewport did not repaint" apart from "the renderer is dead".
  const tick = () => { if (P.ticking) { P.ticks++; requestAnimationFrame(tick); } };
  P.startTicks = () => { if (!P.ticking) { P.ticking = true; requestAnimationFrame(tick); } };
  P.stopTicks = () => { P.ticking = false; };

  let cur = null;

  // --- repaint START: canvas.width assignment (MapViewport.tsx:537 draw effect,
  //     :585 the ResizeObserver path) ---
  const wd = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
  Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
    configurable: true,
    enumerable: wd.enumerable,
    get() { return wd.get.call(this); },
    set(v) {
      if (this === P.canvas) {
        const rec = { t0: performance.now(), first: 0, last: 0, ops: 0, blits: 0 };
        cur = rec;
        // Closes AFTER the whole synchronous task — i.e. after every draw the
        // effect issues. Nothing inside the component participates.
        queueMicrotask(() => {
          if (rec.ops > 0) {
            P.repaints.push({
              at: rec.t0, ms: rec.last - rec.t0, toFirstOpMs: rec.first - rec.t0,
              ops: rec.ops, blits: rec.blits,
            });
            if (P.repaints.length > 8000) { P.repaints.splice(0, 4000); P.dropped += 4000; }
          }
          if (cur === rec) cur = null;
        });
      }
      return wd.set.call(this, v);
    },
  });

  // --- repaint END: the last coarse 2D op against #map-canvas ---------------
  const proto = CanvasRenderingContext2D.prototype;
  const BLIT = { drawImage: 1, putImageData: 1 };
  for (const name of ['drawImage', 'putImageData', 'fillRect', 'strokeRect',
                      'clearRect', 'stroke', 'fill', 'fillText', 'strokeText']) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    proto[name] = function patched(...args) {
      const r = orig.apply(this, args);
      const rec = cur;
      if (rec && this.canvas === P.canvas) {
        const now = performance.now();
        if (rec.ops === 0) rec.first = now;
        rec.ops++;
        if (BLIT[name]) rec.blits++;
        rec.last = now;
      }
      return r;
    };
  }
  return 'installed';
})()`;

// Does the map canvas actually hold PAINTED ART right now? A flat fill, a void
// clear or a zero-size canvas all fail this.
const CONTENT_PROBE = String.raw`
(() => {
  const cv = document.getElementById('map-canvas');
  if (!cv) return { ok: false, why: 'no #map-canvas' };
  const w = cv.width, h = cv.height;
  if (!w || !h) return { ok: false, why: 'zero-size canvas', w: w, h: h };
  const ctx = cv.getContext('2d');
  const d = ctx.getImageData(0, 0, w, h).data;
  const total = w * h;
  const step = Math.max(1, Math.floor(total / 120000));
  let sampled = 0, nonBlack = 0, nonVoid = 0;
  const colors = new Set();
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    sampled++;
    const isBlack = (r | g | b) === 0;                       // CANVAS_BLACK
    const isVoid = (r === 0x0A && g === 0x0C && b === 0x12);  // CANVAS_VOID
    if (!isBlack) nonBlack++;
    if (!isBlack && !isVoid) {
      nonVoid++;
      if (colors.size < 5000) colors.add((r << 16) | (g << 8) | b);
    }
  }
  return {
    ok: true, w: w, h: h, sampled: sampled, nonBlack: nonBlack, nonVoid: nonVoid,
    nonVoidFrac: nonVoid / sampled, distinctColors: colors.size,
  };
})()`;

// ------------------------------------------------------- c1: what IS the clock
//
// Reads performance.now() in a tight spin and reports the ruler's actual
// graduations instead of assuming them. The minimum POSITIVE difference between
// two successive distinct readings IS the quantum. A frozen clock never changes
// value, so `changes` stays 0 and `quantumMs` stays 0 — which is the failure
// this row exists to catch, caught directly rather than inferred from how many
// distinct deltas a cell happened to produce.
//
// Bounded twice over: it stops at MAX_STEPS observed changes (250 * ~0.1ms is
// ~25ms of spin) or MAX_READS raw reads, whichever comes first, so a frozen
// clock costs a bounded number of reads rather than hanging.
const CLOCK_PROBE = String.raw`
(() => {
  const MAX_READS = 1000000, MAX_STEPS = 250;
  const steps = [];
  let reads = 0, negatives = 0;
  let prev = performance.now();
  const t0 = prev;
  while (reads < MAX_READS && steps.length < MAX_STEPS) {
    const v = performance.now();
    reads++;
    if (v !== prev) {
      const d = v - prev;
      if (d < 0) negatives++;
      steps.push(d);
      prev = v;
    }
  }
  const pos = steps.filter((d) => d > 0).sort((a, b) => a - b);
  return {
    reads: reads,
    changes: steps.length,
    negatives: negatives,
    quantumMs: pos.length ? pos[0] : 0,
    smallestSteps: pos.slice(0, 5),
    spanMs: prev - t0,
    // Reported for the record: this is the ONLY switch that unclamps the clock,
    // and the harness deliberately does not touch it.
    crossOriginIsolated: (typeof crossOriginIsolated === 'boolean') ? crossOriginIsolated : null,
  };
})()`;

// -------------------------------- c2: does the batching recover sub-quantum?
//
// The claim under test is that summing B brackets and dividing by B resolves
// costs SMALLER THAN ONE TICK. That claim is checkable without any external
// reference clock, because a RATIO can be known by construction: spin(2k) is
// twice the work of spin(k), and spin(4k) is four times, whatever the machine.
//
// So: auto-scale k until one spin(k) costs about a QUARTER of a tick, then push
// k, 2k and 4k through the identical "sum BATCH brackets, divide by BATCH"
// machinery the cells use. If the batching resolves nothing below a tick, all
// three come back as the same quantisation mush and the ratios do not appear.
// If the rounding error were phase-LOCKED to the measurement rather than
// independent, the means would be biased and the ratios would not appear
// either — so this row tests the header's independence assumption too.
//
// It also yields the honest resolution figure. spin(k) is a CONSTANT workload,
// so the standard deviation of its batch means is clock noise and essentially
// nothing else: that sd is the achieved effective resolution, measured.
const CALIB_PROBE = (batch, batches) => String.raw`
(() => {
  const BATCH = ${batch}, BATCHES = ${batches};
  let sink = 0;
  // Result is accumulated into a module-level sink and returned, so the loop
  // cannot be eliminated as dead code.
  const spin = (k) => { let x = 1.000001; for (let i = 0; i < k; i++) x = x * 1.0000001 + 0.0000001; sink += x; return x; };
  for (let i = 0; i < 300; i++) spin(2000);        // JIT warm-up

  // The quantum, measured again here so the calibration is self-contained.
  let prev = performance.now(), q = Infinity, changes = 0;
  for (let i = 0; i < 1000000 && changes < 60; i++) {
    const v = performance.now();
    if (v !== prev) { const d = v - prev; if (d > 0 && d < q) q = d; prev = v; changes++; }
  }
  if (!isFinite(q) || q <= 0) return { ok: false, why: 'the clock never advanced during calibration' };

  // Per-iteration cost, from a block big enough to span many ticks.
  const BIG = 400000;
  let bt = 0;
  for (let r = 0; r < 5; r++) { const a = performance.now(); spin(BIG); const b = performance.now(); bt += b - a; }
  const perIterMs = bt / (5 * BIG);
  if (!(perIterMs > 0)) return { ok: false, why: 'a 2,000,000-iteration block still measured as zero' };

  // WHAT THE BRACKET ITSELF COSTS. A pair of performance.now() calls is not
  // free, and if the workload under test is the same size as the pair, the
  // ratios are swamped by the instrument and c2 reports a failure that is about
  // the probe rather than about the batching. Measured the only way it can be
  // under a clamped clock: one outer bracket around a great many inner pairs.
  const PAIRS = 200000;
  let ob = 0;
  for (let r = 0; r < 3; r++) {
    const a = performance.now();
    for (let i = 0; i < PAIRS; i++) { const s = performance.now(); const e = performance.now(); sink += (e - s) === 0 ? 0 : 1e-12; }
    ob += performance.now() - a;
  }
  const emptyBracketMs = ob / (3 * PAIRS);

  // Aim one unit of work at a QUARTER TICK, but never let it fall below 30x the
  // bracket overhead. On a clamped clock (the case this harness exists for) the
  // quarter tick wins and the unit is genuinely sub-tick. On an UNCLAMPED clock
  // a quarter tick can be smaller than the bracket itself, in which case the
  // overhead floor wins, targetMs lands above the tick, and the harness says
  // so instead of failing a sub-tick test that is neither possible nor needed.
  const targetMs = Math.max(q / 4, 30 * emptyBracketMs);
  const k1 = Math.max(1, Math.round(targetMs / perIterMs));

  const estimate = (k) => {
    const means = [];
    for (let b = 0; b < BATCHES; b++) {
      let sum = 0;
      // EXACTLY the cell construction: one bracket per unit of work, summed.
      for (let i = 0; i < BATCH; i++) { const a = performance.now(); spin(k); const e = performance.now(); sum += e - a; }
      means.push(sum / BATCH);
    }
    const n = means.length;
    const mean = means.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(means.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1));
    const s = [...means].sort((a, b) => a - b);
    return { n: n, med: s[Math.floor(n / 2)], mean: mean, sd: sd, lo: s[0], hi: s[n - 1],
             distinct: new Set(means.map((v) => v.toFixed(6))).size };
  };

  const e1 = estimate(k1), e2 = estimate(k1 * 2), e4 = estimate(k1 * 4);
  return {
    ok: true, quantumMs: q, perIterNs: perIterMs * 1e6, emptyBracketNs: emptyBracketMs * 1e6,
    targetMs: targetMs, k1: k1,
    // Could a sub-tick unit of work even be built here? False only when the
    // clock is FINER than the bracket overhead, i.e. when it was never clamped.
    subTickPossible: targetMs < 0.75 * q,
    e1: e1, e2: e2, e4: e4, sinkUsed: sink !== 0,
  };
})()`;

// --------------------------------------------------------------------- stats
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return { n: 0 };
  const q = (p) => s[Math.max(0, Math.min(s.length - 1, Math.round(p * (s.length - 1))))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = s.length > 1
    ? Math.sqrt(s.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (s.length - 1))
    : 0;
  return {
    n: s.length, min: s[0], p25: q(0.25), med: q(0.5), p75: q(0.75), p95: q(0.95),
    max: s[s.length - 1], mean, sd, sem: sd / Math.sqrt(s.length),
    // 6dp, not 4: batch means are sub-quantum quantities and 4dp would collapse
    // genuinely different means onto one bucket, faking a frozen distribution.
    distinct: new Set(s.map((v) => v.toFixed(6))).size,
  };
}
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');
const f4 = (v) => (Number.isFinite(v) ? v.toFixed(4) : 'n/a');
function fmt(st, f = f2) {
  return `n=${st.n} min ${f(st.min)} / med ${f(st.med)} / p95 ${f(st.p95)} / max ${f(st.max)} ms`
    + `  (p25 ${f(st.p25)}, p75 ${f(st.p75)}, mean ${f(st.mean)}, ${st.distinct} distinct values)`;
}

/**
 * AMORTISED BATCHING. Takes the per-repaint bracket durations in the order they
 * were recorded, walks them in runs of B CONSECUTIVE samples, sums each run and
 * divides by B. The returned numbers are per-repaint costs whose quantisation
 * error has been spread over B samples.
 *
 * Consecutive, never strided: a batch is meant to be a contiguous run of the
 * app's real behaviour, and striding would mix regimes that happen to alternate.
 * A trailing partial run is DROPPED rather than divided by a smaller B, so
 * every returned mean is the mean of exactly B repaints and they are all
 * comparable.
 */
function amortize(vals, B) {
  const means = [];
  for (let i = 0; i + B <= vals.length; i += B) {
    let s = 0;
    for (let j = 0; j < B; j++) s += vals[i + j];
    means.push(s / B);
  }
  return means;
}

/**
 * The raw samples as a histogram of clock levels. This is the line that makes
 * the quantisation visible to a reader instead of leaving it to be inferred
 * from a suspiciously round median.
 */
function levels(vals, cap = 14) {
  const m = new Map();
  for (const v of vals) { const k = v.toFixed(3); m.set(k, (m.get(k) ?? 0) + 1); }
  const rows = [...m.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  const shown = rows.slice(0, cap).map(([k, n]) => `${k}x${n}`).join(' ');
  return rows.length > cap ? `${shown} (+${rows.length - cap} more levels)` : shown;
}

/** CDP-side metrics: NOT subject to the web-facing clock clamp. Reported only. */
async function perfMetrics(c) {
  try {
    const { metrics } = await c.send('Performance.getMetrics');
    const o = {};
    for (const m of metrics) o[m.name] = m.value;
    return o;
  } catch { return null; }
}

/**
 * One pan, awaited to the far side of two real frames so React's passive effect
 * has run and the draw has finished. The setTimeout is a WATCHDOG, not the
 * normal path: if rAF were throttled to nothing the two-frame await would hang
 * forever and every cell would time out instead of failing with a reason. Row 1f
 * is the row that actually asserts the frame loop is alive.
 */
async function panTo(c, x, y, zoom) {
  await c.evalExpr(`(async () => {
    window.__dbg.setView(${x}, ${y}, ${zoom});
    await Promise.race([
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      new Promise((r) => setTimeout(r, 250)),
    ]);
    return 1;
  })()`);
}

const BASE = { x: 96, y: 64 };
/** Distinct camera positions — setView is a no-op for the effect if vpX/vpY/zoom
 *  all repeat, because the deps are primitives. */
const panXY = (i) => ({ x: BASE.x + ((i * 53) % 977), y: BASE.y + ((i * 31) % 613) });

/**
 * Measure one cell of the matrix: N real pans at a fixed zoom/overlay/window
 * configuration. Returns the distribution plus the shape evidence (ops, blits,
 * canvas size) that says WHAT was measured.
 */
async function measureCell(c, label, zoom, n = PANS_PER_CELL) {
  // Warm-up pans first: the repaint immediately after an act load or an overlay
  // toggle can carry a dirty flush, which is a different regime and would sit in
  // the tail of a steady-state distribution as a phantom outlier.
  for (let i = 0; i < 5; i++) { const p = panXY(i + 900); await panTo(c, p.x, p.y, zoom); }
  const mark = await c.evalExpr('window.__mvProbe.mark()');
  const dropped0 = await c.evalExpr('window.__mvProbe.dropped');
  const pmBefore = await perfMetrics(c);
  for (let i = 0; i < n; i++) { const p = panXY(i); await panTo(c, p.x, p.y, zoom); }
  const pmAfter = await perfMetrics(c);
  const dropped = (await c.evalExpr('window.__mvProbe.dropped')) - dropped0;
  const recs = await c.json(`window.__mvProbe.since(${mark})`);
  const size = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);
  const clock = await c.json('window.__mvProbe.clock()');
  const qualifying = recs.filter((r) => r.blits > 0);
  const rawMs = qualifying.map((r) => r.ms);

  // RAW: one sample per repaint, quantised to the clock tick. Keeps the tail.
  const st = stats(rawMs);
  // AMORTISED: one sample per batch of BATCH consecutive repaints, expressed
  // per repaint. Resolves below the tick; has no tail by construction.
  const amort = stats(amortize(rawMs, BATCH));

  const blits = stats(qualifying.map((r) => r.blits));
  const ops = stats(qualifying.map((r) => r.ops));
  const cell = { label, zoom, size, st, amort, blits, ops, rawMs, dropped, recs: recs.length, qualifying: qualifying.length, clock };

  report(`[cell ${label}] zoom ${zoom}  canvas ${size.w}x${size.h}  `
    + `uptime ${upt()} (page ${clock.pageUptimeS.toFixed(1)}s, wall ${clock.wall})`);
  report(`[cell ${label}] RAW per-repaint cost — one sample per repaint, QUANTISED to the `
    + `${f4(RESOLUTION.quantumMs)}ms clock tick: ${fmt(st)}`);
  report(`[cell ${label}] raw clock levels: ${levels(rawMs)}`);
  report(`[cell ${label}] AMORTISED per-repaint cost — THIS DISTRIBUTION IS OVER ${amort.n} BATCH MEANS, each the `
    + `mean of ${BATCH} consecutive qualifying repaints, NOT over individual repaints: ${fmt(amort, f4)}`);
  report(`[cell ${label}] amortised median ${f4(amort.med)}ms +/- ${f4(amort.sem)}ms (s.e.m. over the ${amort.n} batch `
    + `means); instrument resolution ${f4(RESOLUTION.ms)}ms [${RESOLUTION.source}] vs a raw tick of `
    + `${f4(RESOLUTION.quantumMs)}ms — ${(RESOLUTION.quantumMs / RESOLUTION.ms).toFixed(1)}x finer`);
  report(`[cell ${label}] shape: ${qualifying.length}/${recs.length} repaints carried a blit; `
    + `blits/repaint med ${blits.med} (min ${blits.min}, max ${blits.max}); `
    + `wrapped ops/repaint med ${ops.med} (max ${ops.max})`);
  report(`[cell ${label}] headroom: RAW p95 is ${((st.p95 / FRAME_MS) * 100).toFixed(1)}% of a ${FRAME_MS.toFixed(2)}ms frame; `
    + `amortised median ${((amort.med / FRAME_MS) * 100).toFixed(2)}%`);

  if (pmBefore && pmAfter && qualifying.length) {
    const d = (k) => ((pmAfter[k] ?? 0) - (pmBefore[k] ?? 0)) * 1000;
    report(`[cell ${label}] CROSS-CHECK (REPORTED, NEVER ASSERTED) — CDP Performance.getMetrics, which is not `
      + `subject to the web-facing clock clamp: over the ${qualifying.length} timed repaints, ScriptDuration `
      + `+${f4(d('ScriptDuration'))}ms, LayoutDuration +${f4(d('LayoutDuration'))}ms, RecalcStyleDuration `
      + `+${f4(d('RecalcStyleDuration'))}ms, TaskDuration +${f4(d('TaskDuration'))}ms => `
      + `${f4(d('ScriptDuration') / qualifying.length)}ms of script per repaint. THIS IS NOT THE SAME QUANTITY as `
      + `the bracket and is a strict UPPER bound on it: it also counts React's render/commit, the harness's own `
      + `setView evals and every rAF callback in the window. Use it to sanity-check the ORDER of the amortised `
      + `numbers across cells, never as the number itself.`);
  }
  return cell;
}

function assertCell(cell) {
  const L = cell.label;
  // Unchanged from the first run: this is a fact about the SUBJECT (did enough
  // real repaints happen), not about the ruler, so batching does not touch it.
  // The >= 30 bar is unchanged; the ring-buffer conjunct is ADDED, so this is
  // strictly stronger than it was.
  check(`2${L}-n`, `cell ${L}: at least 30 repaints with a real blit were timed, and no record was lost mid-cell`,
    cell.qualifying >= 30 && cell.dropped === 0,
    `qualifying=${cell.qualifying} of ${cell.recs} recorded; ${cell.dropped} records dropped by the probe's ring `
    + `buffer${cell.dropped ? ' — THE MARK INDEX SHIFTED, so this window is not the window that was measured' : ''}`);

  // NEW: the amortised distribution has to be a distribution, not three points.
  check(`2${L}-b`, `cell ${L}: at least ${MIN_BATCHES} full batches of ${BATCH} repaints were formed`,
    (cell.amort.n ?? 0) >= MIN_BATCHES,
    `batches=${cell.amort.n} of ${Math.floor(cell.qualifying / BATCH)} possible (BATCH=${BATCH}, PANS=${PANS_PER_CELL}); `
    + `${cell.qualifying % BATCH} trailing repaint(s) dropped as a partial batch`);

  // THE FROZEN-CLOCK GUARD, moved onto the distribution it now governs.
  //
  // Original: ">= 3 distinct per-repaint values". Its job was to catch a dead
  // timer, and it still does that here — a frozen clock makes every delta
  // exactly 0, so every batch mean is exactly 0, so `distinct` collapses to 1
  // and this fails. What has changed is the failure mode it can NO LONGER
  // produce: last run 2f-d failed on a live clock, because a ~50us cost against
  // a 100us tick has only two levels to land on and three were demanded. That
  // was the proxy misfiring, not the clock dying.
  //
  // The dead-timer case is additionally covered head-on by rows c1 (the clock
  // changed value >= 50 times in a spin, never went backwards, and its quantum
  // is a measured positive number) and c2 (a workload BELOW one tick was
  // separated from its 2x and 4x). Neither of those existed before, and each is
  // a stricter test of "the timer is alive" than counting three deltas.
  check(`2${L}-d`, `cell ${L}: the AMORTISED timings are not one frozen number (>= 3 distinct batch means)`,
    (cell.amort.distinct ?? 0) >= 3, `distinct=${cell.amort.distinct} over n=${cell.amort.n} batch means`);

  // The raw samples still feed row 4's p95, so they get their own liveness
  // check: a single value repeated across every repaint is a dead timer, and
  // that is exactly what this catches at the raw tier.
  check(`2${L}-raw`, `cell ${L}: the RAW per-repaint samples are not one single frozen value`,
    (cell.st.distinct ?? 0) >= 2,
    `distinct=${cell.st.distinct} over n=${cell.st.n} raw samples; levels ${levels(cell.rawMs ?? [])}`
    + `${cell.st.distinct === 1 ? ' — EVERY repaint reported the identical duration, which is a dead clock' : ''}`);
}

// -------------------------------------------------------------------- the run
async function main() {
  console.log(`root: ${ROOT}${BORROWED ? `  (script lives in ${HERE}; that tree has no built app, so the app under test is ${ROOT}'s build)` : ''}`);
  if (BORROWED) {
    note('root', 'The measured binary is NOT built from the tree this script sits in. That is only safe while the '
      + 'two trees share their src/ — check `git diff` between them before trusting a number, or build in place.');
  }
  if (!existsSync(join(ROOT, 'dist/main/index.mjs'))) {
    throw new Error(`no built app at ${ROOT}/dist/main/index.mjs — run VITE_AURORA_DEBUG=1 npm run build there first`);
  }
  if (!existsSync(ELECTRON)) throw new Error(`no electron binary at ${ELECTRON} — npm install in ${ROOT}`);
  // A STALE dist/ MAKES EVERY ROW VACUOUS.
  const distM = statSync(join(ROOT, 'dist/main/index.mjs')).mtimeMs;
  const newest = execSync(
    `find ${JSON.stringify(join(ROOT, 'src'))} -name '*.ts' -o -name '*.tsx' | xargs stat -c %Y | sort -n | tail -1`,
    { shell: '/bin/bash' }).toString().trim();
  if (Number(newest) * 1000 > distM) {
    throw new Error('dist/ is STALER than src/ — run VITE_AURORA_DEBUG=1 npm run build first');
  }
  if (!(await portFree())) throw new Error(`port ${PORT} ALREADY serves a CDP target.`);

  let app = null, c = null;
  const cells = [];
  try {
    const env = { ...process.env, AURORA_DEBUG_PORT: String(PORT), AURORA_NO_GPU: '1' };
    delete env.DISPLAY;
    app = spawnGuarded('/usr/bin/xvfb-run', ['-a', '-s', '-screen 0 1680x1050x24', ELECTRON, `${ROOT}/dist/main/index.mjs`], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    app.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(`[app] ${d}`); });
    app.stderr.on('data', (d) => { if (process.env.VERBOSE) process.stderr.write(`[app!] ${d}`); });

    c = cdp(await waitForTarget());
    await c.ready;
    await c.send('Runtime.enable');
    await c.send('Page.enable').catch(() => {});
    // Enables the REPORTED-ONLY cross-check in measureCell. If the domain is
    // unavailable, perfMetrics() returns null and the cross-check line is simply
    // absent — no row depends on it.
    const perfDomain = await c.send('Performance.enable').then(() => true).catch(() => false);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }
    await c.evalExpr('localStorage.clear()');
    await c.send('Page.reload');
    await sleep(3000);
    for (let i = 0; i < 60; i++) {
      if (await c.evalExpr('typeof window.__dbg === "object"').catch(() => false)) break;
      await sleep(300);
    }

    // ---- p1: a REAL aeon project, a REAL MapViewport -----------------------
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON_DIR)})`);
    await sleep(1500);
    let st0 = null;
    for (let i = 0; i < 40; i++) {
      st0 = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st0 && st0.open) break;
      await sleep(400);
    }
    await c.evalExpr(`window.__dbg.activate(${JSON.stringify(st0?.zone)}, ${JSON.stringify(st0?.act)})`);
    await sleep(1200);
    const layout = await c.evalExpr(`(() => {
      const b = [...document.querySelectorAll('[aria-label="Facets"] button')].find((e) => e.textContent.trim() === 'Layout');
      if (!b) return 'no-pill'; b.click(); return 'clicked';
    })()`);
    await sleep(1500);
    const hasMap = await c.evalExpr('!!document.getElementById("map-canvas")');
    check('p1', 'a real aeon project is open (sections > 0) and the Layout facet mounted a real #map-canvas',
      !!st0 && st0.open === true && st0.sections > 0 && layout === 'clicked' && hasMap === true,
      `state=${JSON.stringify(st0)} layoutPill=${layout} mapCanvas=${hasMap}  uptime ${upt()}`);
    if (!hasMap) throw new Error('no #map-canvas — every row below would be vacuous');

    await panTo(c, BASE.x, BASE.y, 1);
    await sleep(1200);            // let object sprites / collision profiles land
    await shot(c, '0-aeon-layout');

    // ---- p2: the canvas is actually holding painted art --------------------
    const content = await c.json(CONTENT_PROBE);
    check('p2', 'the map canvas is non-zero-sized and holds REAL painted art (not a flat fill, not the void)',
      content.ok === true && content.w > 200 && content.h > 200
        && content.nonVoidFrac >= 0.05 && content.distinctColors >= 16,
      `canvas ${content.w}x${content.h}, sampled ${content.sampled}px, `
      + `non-void ${(100 * (content.nonVoidFrac ?? 0)).toFixed(1)}%, ${content.distinctColors} distinct colours`);

    // ---- p3: the probe is live, bound, and sees blits -----------------------
    const installed = await c.evalExpr(INSTALL_PROBE);
    const probeMark = await c.evalExpr('window.__mvProbe.mark()');
    await panTo(c, BASE.x + 137, BASE.y + 61, 1);
    const firstRecs = await c.json(`window.__mvProbe.since(${probeMark})`);
    const bound = await c.evalExpr('window.__mvProbe.bound()');
    check('p3', 'the external probe is installed, bound to the LIVE #map-canvas, and recorded a pan repaint that carried a blit',
      installed === 'installed' && bound === true
        && firstRecs.length >= 1 && firstRecs.some((r) => r.blits > 0),
      `install=${installed} bound=${bound} records=${JSON.stringify(firstRecs)}  uptime ${upt()}`);

    // ---- c1: WHAT IS THE CLOCK, ACTUALLY -----------------------------------
    // Measured, not assumed. Everything downstream that prints a resolution
    // reads its quantum from here.
    const clk = await c.json(CLOCK_PROBE);
    RESOLUTION.quantumMs = clk.quantumMs > 0 ? clk.quantumMs : RESOLUTION.quantumMs;
    RESOLUTION.theoryMs = RESOLUTION.quantumMs / Math.sqrt(3 * BATCH);
    check('c1', 'performance.now() ADVANCES, never runs backwards, and its quantum is a measured positive number',
      clk.changes >= 50 && clk.negatives === 0 && clk.quantumMs > 0,
      `${clk.changes} value changes over ${clk.reads} reads spanning ${f2(clk.spanMs)}ms; ${clk.negatives} backwards steps; `
      + `MEASURED QUANTUM ${f4(clk.quantumMs)}ms (smallest observed steps: ${clk.smallestSteps.map(f4).join(', ')}); `
      + `crossOriginIsolated=${clk.crossOriginIsolated} — left alone ON PURPOSE, since enabling it would mean changing `
      + `the app's own security headers, i.e. changing the subject.  uptime ${upt()}`);
    if (clk.quantumMs >= 0.05) {
      note('c1', `THE CLOCK IS COARSENED. One tick is ${f4(clk.quantumMs)}ms. Any single-repaint cost below that is `
        + 'UNRESOLVABLE by a single bracket, which is why every central-tendency figure below is amortised over '
        + `${BATCH} repaints and every tail figure is explicitly labelled RAW.`);
    }

    // ---- c2: DOES THE BATCHING RECOVER SUB-QUANTUM SIGNAL -------------------
    const calBatches = Math.max(MIN_BATCHES, 25);
    const cal = await c.json(CALIB_PROBE(BATCH, calBatches));
    if (cal.ok !== true) {
      check('c2', 'amortised batching recovers workloads SMALLER than one clock tick (known 1:2:4 ratios come back)',
        false, `calibration could not run: ${cal.why}. Every amortised figure below is therefore UNCALIBRATED — `
        + `its resolution is the a-priori ${f4(RESOLUTION.theoryMs)}ms, not a demonstrated one.`);
      RESOLUTION.ms = RESOLUTION.theoryMs;
      RESOLUTION.source = `a-priori quantum/sqrt(3*BATCH), UNCALIBRATED (c2 failed: ${cal.why})`;
    } else {
      const r2 = cal.e2.med / cal.e1.med, r4 = cal.e4.med / cal.e1.med;
      const subQuantum = cal.e1.med < 0.75 * cal.quantumMs;
      const ordered = cal.e1.med < cal.e2.med && cal.e2.med < cal.e4.med;
      const ratiosOk = ordered && r2 >= 1.5 && r2 <= 2.6 && r4 >= 3.0 && r4 <= 5.2;
      // The sub-tick clause is asserted only where a sub-tick unit of work could
      // be BUILT — that is decided by cal.subTickPossible, which compares the
      // measured tick against the measured bracket overhead, both printed below.
      // This conditions on a property of the environment, not on the outcome:
      // on the clamped clock this harness exists for, subTickPossible is true
      // and the full assertion applies.
      const ok = ratiosOk && (!cal.subTickPossible || subQuantum);

      // THE ACHIEVED EFFECTIVE RESOLUTION. spin(k1) is a CONSTANT workload, so
      // the spread of its batch means is clock noise and little else — but a
      // synthetic workload can be pathologically periodic against a floor-based
      // clamp and then under-report its own noise (the offline dry run of this
      // probe produced only 2 distinct batch means for exactly that reason). So
      // the harness takes the LARGER of the measured s.d. and the a-priori
      // quantum/sqrt(3*BATCH), and every line says which one it took.
      RESOLUTION.calibSdMs = cal.e1.sd;
      RESOLUTION.ms = Math.max(cal.e1.sd, RESOLUTION.theoryMs);
      const sdTrusted = cal.e1.distinct >= 5;
      RESOLUTION.source = ok
        ? (RESOLUTION.ms > cal.e1.sd
          ? `a-priori quantum/sqrt(3*BATCH), which is LARGER than c2's measured ${f4(cal.e1.sd)}ms s.d. and so is the one used`
          : `MEASURED by c2 as 1 s.d. of batch means over a constant workload`)
        : 'c2 FAILED — treat every amortised figure as suspect, not merely imprecise';
      report(`[c2] bracket overhead: one performance.now() pair costs ${cal.emptyBracketNs.toFixed(1)}ns; one unit of `
        + `work was aimed at ${f4(cal.targetMs)}ms (a quarter tick, floored at 30x that overhead). A sub-tick unit `
        + `was ${cal.subTickPossible ? 'BUILDABLE, so the sub-tick clause below is asserted' : 'NOT buildable — the '
          + 'clock is finer than the bracket overhead, i.e. it was never clamped, so batching is belt-and-braces here '
          + 'and only the ratio clause is asserted'}`);
      report(`[c2] one unit costs ${f4(cal.e1.med)}ms = ${(cal.e1.med / cal.quantumMs).toFixed(2)} clock ticks `
        + `(k=${cal.k1} iterations at ${cal.perIterNs.toFixed(2)}ns each); 2x came back as ${f4(cal.e2.med)}ms `
        + `(ratio ${r2.toFixed(2)}, want 2), 4x as ${f4(cal.e4.med)}ms (ratio ${r4.toFixed(2)}, want 4)`);
      report(`[c2] residual against the known ratio: 2x point off by ${f4(Math.abs(cal.e2.med - 2 * cal.e1.med))}ms, `
        + `4x point off by ${f4(Math.abs(cal.e4.med - 4 * cal.e1.med))}ms`);
      report(`[c2] ACHIEVED EFFECTIVE RESOLUTION at BATCH=${BATCH}: ${f4(RESOLUTION.ms)}ms [${RESOLUTION.source}], `
        + `against a raw single-bracket tick of ${f4(cal.quantumMs)}ms — `
        + `${(cal.quantumMs / Math.max(RESOLUTION.ms, 1e-9)).toFixed(1)}x finer. Components: c2 measured a batch-mean `
        + `s.d. of ${f4(cal.e1.sd)}ms over ${cal.e1.n} batches (${cal.e1.distinct} distinct`
        + `${sdTrusted ? '' : ' — FEWER THAN 5, so that s.d. is under-sampled and is NOT trusted on its own'}); `
        + `the a-priori quantum/sqrt(3*BATCH) is ${f4(RESOLUTION.theoryMs)}ms.`);
      check('c2', 'amortised batching recovers workloads SMALLER than one clock tick (known 1:2:4 ratios come back)',
        ok,
        `1x=${f4(cal.e1.med)}ms (${subQuantum ? 'BELOW' : 'NOT below'} 0.75 of the ${f4(cal.quantumMs)}ms tick; `
        + `sub-tick clause ${cal.subTickPossible ? 'ASSERTED' : 'not applicable, clock was never clamped'}), `
        + `2x=${f4(cal.e2.med)}ms (ratio ${r2.toFixed(2)}), 4x=${f4(cal.e4.med)}ms (ratio ${r4.toFixed(2)}); `
        + `ordered=${ordered}; batch means at 1x: ${cal.e1.distinct} distinct, sd ${f4(cal.e1.sd)}ms, `
        + `range ${f4(cal.e1.lo)}..${f4(cal.e1.hi)}ms`
        + `${ok ? '' : ' — THE INSTRUMENT DID NOT DEMONSTRATE SUB-TICK RESOLUTION. Read every amortised number '
          + 'below as unproven; do NOT read a difference between cells as real.'}  uptime ${upt()}`);
      note('c2', 'WHAT c2 DOES NOT SETTLE. Its spins run back-to-back with no rAF between them, so the phase of the '
        + 'rounding error is sampled differently than it is in a cell, where repaints are ~16.7ms apart. It '
        + 'demonstrates that the batching mechanism recovers sub-tick signal and puts a number on its noise; it does '
        + 'not prove the cells\' phases are equally well behaved. The per-cell s.e.m. is the check on that.');
    }
    report(`[c2] Performance domain available for the (reported-only) unclamped cross-check: ${perfDomain}`);

    // ---- 1a: idle window, EARLY (reported, not asserted) --------------------
    // Async project work (object sprites, collision profiles) can still be
    // landing this soon after an open, and each landing legitimately repaints.
    // Reported so a non-zero late window has something to be compared against.
    await c.evalExpr('window.__mvProbe.ticks = 0; window.__mvProbe.startTicks()');
    const idleMark0 = await c.evalExpr('window.__mvProbe.mark()');
    await sleep(5000);
    const idle0 = (await c.json(`window.__mvProbe.since(${idleMark0})`)).length;
    const ticks0 = await c.evalExpr('window.__mvProbe.ticks');
    await c.evalExpr('window.__mvProbe.stopTicks()');
    note('1a', `idle window (early, 5s, no interaction): ${idle0} MapViewport repaints, `
      + `${ticks0} rAF ticks in the page. REPORTED ONLY — row 1f is the asserted one.  uptime ${upt()}`);

    // ---- 1b/1c: pan and zoom repaint ---------------------------------------
    let m = await c.evalExpr('window.__mvProbe.mark()');
    await panTo(c, BASE.x + 211, BASE.y + 97, 1);
    const panRecs = await c.json(`window.__mvProbe.since(${m})`);
    check('1b', 'a PAN (vpX/vpY change through the real view store) triggers a repaint',
      panRecs.length >= 1 && panRecs.some((r) => r.blits > 0),
      `${panRecs.length} repaint(s): ${JSON.stringify(panRecs)}  uptime ${upt()}`);

    m = await c.evalExpr('window.__mvProbe.mark()');
    await panTo(c, BASE.x + 211, BASE.y + 97, 2);
    const zoomRecs = await c.json(`window.__mvProbe.since(${m})`);
    check('1c', 'a ZOOM change triggers a repaint',
      zoomRecs.length >= 1 && zoomRecs.some((r) => r.blits > 0),
      `${zoomRecs.length} repaint(s): ${JSON.stringify(zoomRecs)}  uptime ${upt()}`);
    await panTo(c, BASE.x, BASE.y, 1);

    // ---- 1d: a real overlay toggle repaints ---------------------------------
    m = await c.evalExpr('window.__mvProbe.mark()');
    let gridOn = null;
    try { gridOn = await toggleOverlay(c, 'Tile Grid'); } catch (e) { note('1d', `View-menu toggle threw: ${e.message}`); }
    const ovRecs = await c.json(`window.__mvProbe.since(${m})`);
    check('1d', "a real View-menu overlay toggle ('Tile Grid') triggers a repaint",
      gridOn === true && ovRecs.length >= 1 && ovRecs.some((r) => r.blits > 0),
      `checkbox=${gridOn} ${ovRecs.length} repaint(s)  uptime ${upt()}`);

    // ---- 2e uses the grid-on state before we put it back --------------------
    if (gridOn === true) {
      cells.push(await measureCell(c, 'e', 1));
      cells[cells.length - 1].desc = 'zoom 1, Tile Grid overlay ON (a full-viewport line pass)';
      try {
        const off = await toggleOverlay(c, 'Tile Grid');
        check('1d2', "'Tile Grid' toggles back OFF", off === false, `checkbox=${off}`);
      } catch (e) { note('1d2', `could not restore Tile Grid: ${e.message}`); }
    } else {
      note('2e', 'NOT MEASURED: the Tile Grid overlay never switched on, so the '
        + '"extra full-viewport overlay pass" cell has no subject. Do NOT read its absence as "free".');
    }

    // ---- 2a..2d: the zoom sweep ---------------------------------------------
    for (const [label, zoom, desc] of [
      ['a', 1, 'zoom 1 (default), default overlays'],
      ['b', 2, 'zoom 2, default overlays'],
      ['c', 4, 'zoom 4, default overlays — fewest sections in view'],
      ['d', 0.25, 'zoom 0.25, default overlays — most sections in view'],
    ]) {
      const cell = await measureCell(c, label, zoom);
      cell.desc = desc;
      cells.push(cell);
    }

    // ---- 2f: a different window size ----------------------------------------
    // PROVISIONAL: Emulation.setDeviceMetricsOverride is a standard CDP call but
    // has not been exercised against this Electron build in this repo. If it does
    // not actually change the canvas, the cell is dropped rather than reported.
    let sizeChanged = false;
    const sizeBefore = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);
    try {
      await c.send('Emulation.setDeviceMetricsOverride', {
        width: 900, height: 620, deviceScaleFactor: 1, mobile: false,
      });
      await sleep(1200);
      const sizeAfter = await c.json(`(() => { const cv = document.getElementById('map-canvas'); return { w: cv.width, h: cv.height }; })()`);
      sizeChanged = sizeAfter.w !== sizeBefore.w || sizeAfter.h !== sizeBefore.h;
      if (sizeChanged) {
        const cell = await measureCell(c, 'f', 1);
        cell.desc = `zoom 1, SMALLER window (${sizeAfter.w}x${sizeAfter.h} vs ${sizeBefore.w}x${sizeBefore.h})`;
        cells.push(cell);
      }
    } catch (e) {
      note('2f', `Emulation.setDeviceMetricsOverride threw: ${e.message}`);
    } finally {
      try { await c.send('Emulation.clearDeviceMetricsOverride'); } catch { /* */ }
      await sleep(1000);
    }
    if (!sizeChanged) {
      note('2f', 'NOT MEASURED: the window-size axis could not be varied from CDP '
        + `(canvas stayed ${sizeBefore.w}x${sizeBefore.h}). The viewport-size dependence of a repaint is therefore UNMEASURED — `
        + 'the zoom cells vary world area, not canvas pixels.');
    }

    // ---- rows 2*: per-cell integrity ----------------------------------------
    for (const cell of cells) assertCell(cell);

    // ---- 3: suspicious-constant tripwire ------------------------------------
    if (cells.length >= 2) {
      // AMORTISED medians, not raw. The raw medians of the first run were
      // 0.000 / 0.000 / 0.000 / 0.800 / 0.100 / 0.000 ms — four cells pinned to
      // the bottom of a 0.1ms grid — and this row cannot say anything about a
      // quantity it cannot resolve.
      const meds = cells.map((x) => x.amort.med);
      const lo = Math.min(...meds), hi = Math.max(...meds);
      // NORMALISE BY THE LARGER MEDIAN. The first run divided by the smaller
      // one, which was exactly 0.000, so the expression fell through its
      // `: 0` branch and announced "medians agree to within 0.00%" about a set
      // running from 0.000ms to 0.800ms. (hi-lo)/hi is also always <= the old
      // (hi-lo)/lo, so the same 2% bar is now STRICTER, never laxer.
      const spread = hi > 0 ? (hi - lo) / hi : 0;
      const gap = hi - lo;
      const blitMeds = cells.map((x) => x.blits.med);
      report(`[3] AMORTISED medians across ${cells.length} cells: ${meds.map(f4).join(' / ')} ms  `
        + `(labels ${cells.map((x) => x.label).join('/')}), spread ${(spread * 100).toFixed(1)}%, `
        + `absolute gap ${f4(gap)}ms = ${(gap / RESOLUTION.ms).toFixed(1)}x the instrument's resolution `
        + `(${f4(RESOLUTION.ms)}ms, ${RESOLUTION.source})  uptime ${upt()}`);
      report(`[3] for comparison, the RAW quantised medians are ${cells.map((x) => f2(x.st.med)).join(' / ')} ms — `
        + `at a ${f4(RESOLUTION.quantumMs)}ms tick these are grid positions, not measurements, and this row does `
        + 'not use them.');
      report(`[3] blits/repaint medians: ${blitMeds.join(' / ')} — if these are all equal across a 16x zoom range, `
        + 'the viewport culling is not varying and the cost has nothing to vary WITH.');

      // THREE WAYS TO FAIL, all of them the same tripwire seen from different
      // sides. Removing the clock confound is not the same as disabling the
      // detector: if the costs genuinely agree now, this row SHOULD still fail,
      // and that is a real finding about the viewport rather than about the
      // ruler.
      const resolvable = gap > RESOLUTION.ms;
      const ok = hi > 0 && spread >= 0.02 && resolvable;
      const why = [];
      if (!(hi > 0)) {
        why.push('EVERY cell measured exactly zero per-repaint cost even after batching — that is a signal below '
          + 'this instrument\'s floor, not a constant');
      }
      if (!(spread >= 0.02)) why.push(`the amortised medians agree to within ${(spread * 100).toFixed(2)}% across every varied input`);
      if (!resolvable) {
        why.push(`the gap between the extreme medians (${f4(gap)}ms) is not larger than the resolution c2 `
          + `demonstrated (${f4(RESOLUTION.ms)}ms) — a difference inside the error bar is not a difference`);
      }
      check('3', 'repaint cost is NOT a suspiciously clean constant across zoom / overlays / window size',
        ok,
        ok
          ? `spread ${(spread * 100).toFixed(1)}% between ${f4(lo)}ms and ${f4(hi)}ms; gap ${f4(gap)}ms = `
            + `${(gap / RESOLUTION.ms).toFixed(1)}x the demonstrated resolution`
          : `${why.join('; ')}. TREAT THIS AS AN INSTRUMENT CONFOUND FIRST: check that the bracket is really `
            + 'closing on the last op (ops/repaint above should differ between cells) and that the pans really '
            + 'changed vpX/vpY/zoom. THE CLOCK IS NO LONGER A CANDIDATE TO CHECK BY HAND — rows c1 and c2 measure '
            + 'the tick and demonstrate the achieved sub-tick resolution, so read those first and believe them. '
            + 'Only once the bracket and the pans are cleared is "the cost is genuinely dominated by a fixed blit" '
            + 'a permitted reading — and at that point THIS ROW FAILING IS THE FINDING.');
    } else {
      note('3', 'NOT MEASURED: fewer than two cells produced data, so there is nothing to compare.');
    }

    // ---- 4: headroom ---------------------------------------------------------
    if (cells.length) {
      // DELIBERATELY STILL THE RAW p95. A p95 over batch means would be a
      // strictly WEAKER bound — averaging B repaints flattens exactly the
      // outlier this row exists to catch — and this assertion must not weaken
      // just because a better central estimate became available. The 0.1ms
      // quantum is irrelevant to a 16.69ms bound, so raw is both stronger and
      // sufficient here.
      const worst = cells.reduce((a, b) => (b.st.p95 > a.st.p95 ? b : a));
      for (const cell of cells) {
        report(`[4] ${cell.label} (${cell.desc}): amortised median ${f4(cell.amort.med)}ms = `
          + `${((cell.amort.med / FRAME_MS) * 100).toFixed(2)}% of a frame; RAW p95 ${f2(cell.st.p95)}ms = `
          + `${((cell.st.p95 / FRAME_MS) * 100).toFixed(1)}%; RAW max ${f2(cell.st.max)}ms`);
      }
      report('[4] the headroom assertion below runs on the RAW p95, not the amortised median: a mean of '
        + `${BATCH} repaints has no tail, and the tail is the whole point of a p95.`);
      check('4', `one repaint fits inside one ${FRAME_MS.toFixed(2)}ms frame at p95, in EVERY measured configuration`,
        worst.st.p95 < FRAME_MS,
        `worst cell ${worst.label} (${worst.desc}): p95 ${f2(worst.st.p95)}ms = `
        + `${((worst.st.p95 / FRAME_MS) * 100).toFixed(1)}% of a frame; `
        + `headroom left ${f2(FRAME_MS - worst.st.p95)}ms  uptime ${upt()}`);
    }

    // ---- 1e: the dirty-flush regime, via a REAL stamp edit --------------------
    // A repaint that must flush dirty section tiles is a DIFFERENT regime from a
    // pan: SectionRenderer.render() calls flushAllDirty() first (SectionRenderer.ts:387).
    // Driven by the real tool + a real click; if the stamp cannot be armed, the
    // regime is declared NOT MEASURED rather than substituted for.
    let edited = false;
    try {
      // Focus the map first so the level key handler is the one that sees 'k'.
      // The default tool is 'view' (editorStore.ts:268), so this click edits nothing.
      const focusRect = await c.json(`document.getElementById('map-canvas').getBoundingClientRect().toJSON()`);
      const fx = Math.round(focusRect.left + focusRect.width * 0.6);
      const fy = Math.round(focusRect.top + focusRect.height * 0.6);
      await mouse(c, 'mousePressed', fx, fy);
      await mouse(c, 'mouseReleased', fx, fy);
      await sleep(300);
      await key(c, 'k', 'KeyK');            // MapViewport.tsx:814 — 'k' arms 'stamp-chunk'
      await sleep(700);
      const tool = (await c.json('window.__dbg.aeon.state()')).tool;
      const picked = await c.evalExpr(`(() => {
        const cells = [...document.querySelectorAll('[title]')].filter((e) => /chunk/i.test(e.getAttribute('title') || ''));
        if (!cells.length) return false; cells[cells.length - 1].click(); return true;
      })()`);
      await sleep(600);
      const armed = await c.evalExpr('window.__dbg.aeon.selectedChunk()');
      const rect = await c.json(`document.getElementById('map-canvas').getBoundingClientRect().toJSON()`);
      if (tool === 'stamp-chunk' && picked === true && armed) {
        const px = Math.round(rect.left + rect.width * 0.4);
        const py = Math.round(rect.top + rect.height * 0.4);
        await mouse(c, 'mouseMoved', px, py); await sleep(300);
        const editMark = await c.evalExpr('window.__mvProbe.mark()');
        await mouse(c, 'mousePressed', px, py);
        await mouse(c, 'mouseReleased', px, py);
        await sleep(900);
        const editRecs = (await c.json(`window.__mvProbe.since(${editMark})`)).filter((r) => r.blits > 0);
        edited = editRecs.length >= 1;
        const est = stats(editRecs.map((r) => r.ms));
        check('1e', 'a real EDIT (stamp click) triggers a repaint',
          edited, `${editRecs.length} repaint(s), tool=${tool}, chunk=${armed}  uptime ${upt()}`);
        if (edited) {
          report(`[1e] dirty-flush regime, RAW and UNAMORTISED: ${fmt(est)}  (${est.n} repaints, `
            + `${((est.max / FRAME_MS) * 100).toFixed(1)}% of a frame at the max)  uptime ${upt()}`);
          note('5f', `THESE 1e NUMBERS ARE AT THE RAW ${f4(RESOLUTION.quantumMs)}ms CLOCK TICK, not the amortised `
            + `${f4(RESOLUTION.ms)}ms of the 2* cells. A single stamp click produces a handful of repaints, which is `
            + `far short of the ${BATCH}-repaint batch the amortised figures are built from, and the harness will `
            + 'not synthesise a batch out of samples it does not have. Read 1e as an order of magnitude only; if a '
            + 'dirty flush lands near the tick it is not distinguishable from one that costs nothing.');
          note('5b', 'THIS IS NOT THE PALETTE REGIME. A stamp dirties a few hundred cells, which stays under '
            + `SectionRenderer's RECOMPOSE_DIRTY_THRESHOLD (2000, SectionRenderer.ts:13) and takes the per-cell `
            + 'flush path. A palette change invalidates every section canvas and takes the full-recompose path, '
            + 'which this harness does NOT measure — there is no CDP door onto a palette edit that does not mean '
            + 'driving the palette editor UI. Palette cycling cost stays UNMEASURED.');
        }
      } else {
        note('1e', `NOT MEASURED: the stamp could not be armed (tool=${tool} thumbnailClicked=${picked} chunk=${armed}). `
          + 'The dirty-flush repaint regime is therefore unmeasured; the cells above are steady-state pans only.');
      }
    } catch (e) {
      note('1e', `NOT MEASURED: the stamp path threw (${e.message}). The dirty-flush regime is unmeasured.`);
    }
    await shot(c, '1-after-cells');

    // ---- 1f: THE ROW. Idle, late, with the page provably still ticking --------
    // Settle first: a stamp queues async work (thumbnail rebuilds, autosave
    // bookkeeping) whose landing is a LEGITIMATE repaint. Letting it land before
    // the window opens is the difference between measuring "no clock" and
    // measuring "the previous row's tail".
    await sleep(3000);
    await c.evalExpr('window.__mvProbe.ticks = 0; window.__mvProbe.startTicks()');
    const idleMark = await c.evalExpr('window.__mvProbe.mark()');
    const idleT0 = Date.now();
    await sleep(5000);
    const idleWallS = (Date.now() - idleT0) / 1000;
    const idleRecs = await c.json(`window.__mvProbe.since(${idleMark})`);
    const ticks = await c.evalExpr('window.__mvProbe.ticks');
    const stillBound = await c.evalExpr('window.__mvProbe.bound()');
    const rootAlive = await c.evalExpr('(document.getElementById("root")?.childElementCount ?? 0) > 0');
    await c.evalExpr('window.__mvProbe.stopTicks()');
    check('1f', 'with the page STILL PAINTING FRAMES and nothing touched, MapViewport repaints exactly ZERO times '
      + '— aeon\'s viewport has no clock',
      idleRecs.length === 0 && ticks >= 100 && stillBound === true && rootAlive === true,
      `${idleRecs.length} repaints over ${idleWallS.toFixed(1)}s idle; ${ticks} rAF ticks in the same window `
      + `(${(ticks / idleWallS).toFixed(0)}/s); probe still bound=${stillBound}; React root alive=${rootAlive}`
      + `${idleRecs.length ? `; repaints=${JSON.stringify(idleRecs.slice(0, 5))}` : ''}  uptime ${upt()}`);

    // ---- 5: what this instrument can and cannot say --------------------------
    console.log('\n--- REGIME -------------------------------------------------------------');
    note('5a', 'WHAT ROW 1f DOES NOT SETTLE. It shows that MapViewport repaints only when its React deps change '
      + '(pan / zoom / overlay / edit) and never on a clock. It CANNOT distinguish "there is no loop because this '
      + 'viewport needs none" from "there is no loop and one would have to be ADDED for animated effects": nothing '
      + 'in the aeon viewport currently animates, so the two hypotheses predict the identical observation — zero '
      + 'idle repaints. Deciding between them is a design question, not a measurement this instrument can make.');
    note('5c', 'WHAT THE COST NUMBER IS. The bracket runs from `canvas.width = ...` (the draw effect\'s first '
      + 'statement) to the return of the last coarse 2D op on #map-canvas in the same task. It INCLUDES the dirty '
      + 'flush, the section blits and the whole OverlayRenderer pass; it EXCLUDES React\'s render/commit, the '
      + 'compositor, GPU upload, and the sibling collision-preview canvas. It is paint work, not frame-to-photon '
      + 'latency, so the headroom figures in row 4 are an UPPER bound on available headroom, not a lower one.');
    note('5g', 'WHICH NUMBER TO QUOTE, AND WHAT IT IS A DISTRIBUTION OF. The AMORTISED figure is a distribution over '
      + `BATCH MEANS: each sample is the summed bracket time of ${BATCH} consecutive qualifying repaints divided by `
      + `${BATCH}. That is the number to quote for "what does one repaint cost", because a single bracket cannot `
      + `resolve a cost smaller than the ${f4(RESOLUTION.quantumMs)}ms clock tick (row c1) and this one resolves to `
      + `${f4(RESOLUTION.ms)}ms (row c2). It is a CENTRAL ESTIMATE ONLY: a mean of ${BATCH} cannot show a tail, so `
      + 'its p95 and max describe how much the BATCHES varied, not how bad a single repaint got. For that, and for '
      + 'the frame-headroom question in row 4, the RAW distribution is the only evidence — and it is quantised, so '
      + 'read its min and median as "at or below one tick" rather than as values.');
    note('5h', 'THE AMORTISED NUMBER RESTS ON ONE ASSUMPTION, STATED PLAINLY: that the clock\'s rounding error has '
      + 'an independent phase from repaint to repaint, so that summing brackets grows the error as sqrt(B) rather '
      + 'than B. Repaints here are paced by rAF at ~16.67ms, which is not a whole number of 0.1ms ticks, so the '
      + 'phase drifts. Row c2 tests the assumption end to end rather than leaving it as an argument: a phase-locked '
      + 'error would bias the means and the known 1:2:4 ratios would not come back. If c2 fails, no amortised '
      + 'number in this run means anything, and the resolution line on every cell says so.');
    note('5d', 'WHAT A PER-LINE PASS WOULD COST IS NOT MEASURED HERE. Row 2e (Tile Grid ON) is the closest '
      + 'available analogue — one extra full-viewport line pass — and the delta between cell 2a and cell 2e is the '
      + 'only per-pass evidence in this run. A 224-line effects pass is a different shape of work and must be '
      + 'measured on its own once a prototype exists.');
    if (!edited) {
      note('5e', 'The dirty-flush regime went UNMEASURED this run (see 1e), so the numbers above describe pans '
        + 'over already-composed sections only.');
    }
    console.log('------------------------------------------------------------------------\n');

    if (c.exceptions.length) {
      console.log(`renderer exceptions during the run: ${c.exceptions.length}`);
      for (const e of c.exceptions.slice(0, 5)) console.log(`  ${e.split('\n')[0]}`);
    }
  } finally {
    try { c?.close(); } catch { /* closing */ }
    if (app?.pid) {
      try { process.kill(-app.pid, 'SIGKILL'); } catch { try { process.kill(app.pid, 'SIGKILL'); } catch { /* gone */ } }
    }
    await sleep(1200);
    console.log(`port free after teardown: ${await portFree()}   total uptime ${upt()}`);
  }

  console.log(`\n${results.length - fails.length}/${results.length} rows passed${fails.length ? ` — FAILED: ${fails.join(', ')}` : ''}`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
