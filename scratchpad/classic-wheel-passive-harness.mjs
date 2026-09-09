// DOES A WHEEL OVER THE CLASSIC MAP SUPPRESS THE BROWSER'S OWN ZOOM? (lens sweep,
// CLASSIC-WHEEL-NO-PREVENTDEFAULT)
//
// The sibling of `map-wheel-passive-harness.mjs`, aimed at the OTHER map surface.
// That one measured aeon's `MapViewport`; this one measures classic's
// `ClassicLevelViewport`, whose zoom handler was a React `onWheel` prop that never
// called `preventDefault` at all. Same mechanism, one degree worse: aeon's had a
// dead call a reader could notice and doubt, and this one had no call, so nothing
// in the source caught the eye.
//
// THE MEASUREMENT IS `defaultPrevented`, READ IN THE BUBBLE PHASE ON WINDOW.
// A `wheel` dispatched over the classic canvas bubbles to window, and by then the
// viewport's own listener has run. If it is React's `onWheel` — which React
// registers PASSIVE — a `preventDefault` there is ignored by the browser and the
// flag is still false at window. If it is a native `{ passive: false }` listener,
// it is true. That is the defect itself, not a proxy for it: whether Chromium's
// ctrl+wheel page zoom runs is exactly whether that flag came back set.
//
// A SCREENSHOT CANNOT PROVE THIS. The app-window zoom Chromium applies on
// ctrl+wheel is a compositor-level scale; a shot of a zoomed window and a shot of a
// map that zoomed itself look alike, and either could be the other. The flag is the
// mechanism.
//
// THE CONTROL IS ROW 3: a wheel over an element with NO non-passive listener must
// come back with the flag CLEAR. Without it, a `defaultPrevented` that were true for
// some unrelated reason (a listener up the tree, a harness bug) would read as this
// fix working.
//
// Coordinates are aimed at INTEGER client pixels and the device scale factor is
// printed beside every number: at a fractional dpr the canvas rect is fractional and
// a float ask resolves one pixel over, which presents as an off-by-one in a feature
// that is fine.
//
// ═══ MEASURED, BOTH WAYS, ON THE REAL APP (2026-09-08) ═══════════════════════
//
// dpr 1 at 1680x1050 under xvfb; canvas rect [284, 106, 856, 742], integer; aim
// (712, 477).
//
//   WITH the fix     rows 1-4 all PASS. A plain and a ctrl wheel over the canvas
//                    both arrive at window `cancelable: true, defaultPrevented:
//                    true`; the control off the map is NOT cancelled; the map's
//                    own zoom moved 0.5797 -> 0.7666.
//   WITHOUT it       (the `onWheel` prop restored on disk and rebuilt) rows 1 and 2
//                    FAIL with `cancelable: FALSE, defaultPrevented: false`, and
//                    row 4 still PASSES. That pair is the defect in one line: the
//                    map zoomed AND the browser's default was left to run. The
//                    `cancelable: false` is the direct evidence for the premise —
//                    Chromium reports a wheel as non-cancelable when only PASSIVE
//                    listeners are registered on the target, which is precisely
//                    what React's onWheel is.
//
// READ ONLY. This opens the s1disasm checkout and loads GHZ act 1; nothing below
// writes, saves, or deletes, so the live tree is safe to read. This entry point is
// deliberately NOT in the harness's CANVAS_WRITERS list.
//
// ⚠ THE OPEN IS INLINED RATHER THAN `openProjectAndAct(c)`, AND THAT WAS A FINDING,
// not a preference. Called from this worktree, the shared helper failed 3 runs of 3
// with `Runtime.evaluate: {"code":-32000,"message":"Promise was collected"}` before
// printing anything — Chromium collected the long-running `window.__dbg.openDir(...)`
// promise while `awaitPromise: true` was waiting on it. The sequence below is the
// same three calls with a `.then(ok, err)` attached before the await, which held 2
// runs of 2, and it also PRINTS whether the open or the activate threw instead of
// failing far away. It was tagged rather than fixed because the shared helper has
// many importers and that parcel was not about the harness.
//
// FIXED IN THE SHARED HELPER 2026-09-08: `settledInPage` in
// `canvas-cdp-harness.mjs` carries this repair, with the reason and the measurement
// in its docblock, and `openProjectAndAct` goes through it (3 red runs before, 3
// green after, on `harness:tier-zoom`). The sequence below is left INLINE on
// purpose: it names which of the two calls threw on its own output line, which the
// shared helper does not, and rewriting a passing measurement to use a helper it
// does not need is a change with no reading. A harness that wants the repair for an
// open of its own imports `settledInPage` rather than copying the `.then` out of
// this comment.
import { session, S1DIR, INSTALL, sleep, drain, RUN } from './canvas-cdp-harness.mjs';

const rows = [];
const check = (id, what, pass, detail = '') => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `  — ${detail}` : ''}`);
};
const note = (id, what, v) => console.log(`      ${id}  ${what}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

const P = String.raw`
(() => {
  const Q = {};
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // THE CLASSIC MAP CANVAS. It carries no id (unlike aeon's #map-canvas), so it is
  // found structurally, the way it is actually built: a visible <canvas> positioned
  // absolutely inside a relatively-positioned, overflow-hidden container. The
  // LARGEST such canvas, because the map fills its box and no other surface does.
  Q.mapCanvas = () => {
    const all = [...document.querySelectorAll('canvas')].filter(vis).filter((c) => {
      const cs = getComputedStyle(c);
      const p = c.parentElement;
      if (!p) return false;
      const ps = getComputedStyle(p);
      return cs.position === 'absolute' && ps.overflow === 'hidden' && ps.position === 'relative';
    });
    all.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return (rb.width * rb.height) - (ra.width * ra.height);
    });
    return all[0] || null;
  };
  // Integer client pixels at the middle of the canvas. Math.round, and the rect is
  // reported alongside so a fractional one is visible rather than silent.
  Q.aim = () => {
    const c = Q.mapCanvas(); if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             rect: [r.left, r.top, r.width, r.height], dpr: window.devicePixelRatio,
             tag: c.tagName, parentOverflow: getComputedStyle(c.parentElement).overflow };
  };
  // A window BUBBLE listener: it runs after the canvas's, so it reads the flag as
  // the browser left it.
  Q.arm = () => {
    window.__wheelSeen = [];
    if (!window.__wheelProbe) {
      window.__wheelProbe = (e) => window.__wheelSeen.push({
        defaultPrevented: e.defaultPrevented,
        cancelable: e.cancelable,
        ctrlKey: e.ctrlKey,
        target: (e.target && e.target.tagName) || '?',
      });
      window.addEventListener('wheel', window.__wheelProbe);
    }
    return 'armed';
  };
  Q.seen = () => window.__wheelSeen || [];
  // The classic camera publishes to viewStore once per painted frame, so the zoom
  // the store holds IS what the map is showing.
  Q.zoom = () => (window.__dbg && window.__dbg.view ? window.__dbg.view().zoom : null);
  // The control's target: the app shell's own root, which no map listener covers.
  Q.shellAim = () => {
    const r = document.body.getBoundingClientRect();
    return { x: Math.round(r.left + 4), y: Math.round(r.top + 4) };
  };
  return (window.__q = Q), 'ok';
})()
`;

async function wheel(c, x, y, ctrl) {
  await c.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x, y, deltaX: 0, deltaY: -120,
    modifiers: ctrl ? 2 : 0, button: 'none', clickCount: 0,
  });
  await sleep(250);
}

await session('classic map wheel: is preventDefault alive?', async (c) => {
  console.log(`      provenance  ${RUN.announce ?? '(no announce line)'}`);
  note('0', 'dbg surface', await c.json('Object.keys(window.__dbg)'));
  await c.evalExpr('localStorage.clear(); 1');
  note('0', 'storage cleared', 'ok');
  const opened = await c.evalExpr(
    `window.__dbg.openDir(${JSON.stringify(S1DIR)}).then(() => 'ok', (e) => 'THREW: ' + e.message)`);
  note('0', 'openDir', opened);
  await sleep(2500);
  const activated = await c.evalExpr('Promise.resolve(window.__dbg.activate("ghz", 1)).then(() => "ok", (e) => "THREW: " + e.message)');
  note('0', 'activate', activated);
  await sleep(4000);
  await c.evalExpr(INSTALL);
  const lvl = await c.evalExpr('JSON.stringify(window.__dbg.levelState())');
  note('0', 'GHZ act 1 ready', lvl);
  await sleep(1200);
  await c.evalExpr(P);

  const aim = await c.json('window.__q.aim()');
  if (!aim) throw new Error('no classic map canvas on screen — UNMEASURABLE, not a pass');
  note('0', 'device scale factor (devicePixelRatio)', aim.dpr);
  note('0', 'map canvas rect [l,t,w,h]', aim.rect);
  note('0', 'aim (integer client px)', [aim.x, aim.y]);
  note('0', 'rect is fractional', aim.rect.some((n) => !Number.isInteger(n)));

  await c.evalExpr('window.__q.arm()');

  // ---- 1: a PLAIN wheel over the map -------------------------------------
  const zBefore = await c.json('window.__q.zoom()');
  await wheel(c, aim.x, aim.y, false);
  let seen = await c.json('window.__q.seen()');
  note('1', 'wheel events the window saw', seen);
  const plain = seen.filter((s) => !s.ctrlKey);
  check('1', 'a plain wheel over the classic map is cancelable and WAS cancelled',
    plain.length > 0 && plain.every((s) => s.cancelable && s.defaultPrevented),
    JSON.stringify(plain));

  // ---- 2: a CTRL wheel — the one the user sees ----------------------------
  // This is the gesture that zoomed the whole application window: Chromium's page
  // zoom is the default action on ctrl+wheel.
  await c.evalExpr('window.__q.arm()');
  await wheel(c, aim.x, aim.y, true);
  seen = await c.json('window.__q.seen()');
  note('2', 'wheel events the window saw', seen);
  const ctrl = seen.filter((s) => s.ctrlKey);
  check('2', 'a ctrl+wheel over the classic map WAS cancelled, so the app window cannot zoom',
    ctrl.length > 0 && ctrl.every((s) => s.cancelable && s.defaultPrevented),
    JSON.stringify(ctrl));

  // ---- 3: THE CONTROL ----------------------------------------------------
  await c.evalExpr('window.__q.arm()');
  const shell = await c.json('window.__q.shellAim()');
  await wheel(c, shell.x, shell.y, true);
  const off = await c.json('window.__q.seen()');
  note('3', 'wheel events the window saw off the map', off);
  check('3', 'CONTROL: a ctrl+wheel away from the map is NOT cancelled',
    off.length === 0 || off.every((s) => !s.defaultPrevented), JSON.stringify(off));

  // ---- 4: the map still zooms (no regression on the feature) -------------
  const zAfter = await c.json('window.__q.zoom()');
  note('4', 'view zoom before / after', [zBefore, zAfter]);
  check('4', 'the classic map itself still zoomed on the wheel',
    zBefore === null || zAfter === null ? false : zAfter !== zBefore,
    zBefore === null ? 'UNMEASURABLE: __dbg.view() is not exposed' : `${zBefore} -> ${zAfter}`);

  await drain(c);
});

const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed`);
process.exit(bad.length ? 1 : 0);
