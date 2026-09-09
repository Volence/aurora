// DOES A WHEEL OVER THE MAP SUPPRESS THE BROWSER'S OWN ZOOM? (lens sweep,
// WHEEL-PREVENTDEFAULT-DEAD)
//
// THE MEASUREMENT IS `defaultPrevented`, READ IN THE BUBBLE PHASE ON WINDOW.
// A `wheel` event dispatched over the map container bubbles to window, and by
// then MapViewport's own listener has run. If that listener is React's `onWheel`
// — which React registers PASSIVE — its `preventDefault()` is ignored by the
// browser and `defaultPrevented` is still false when the event reaches window.
// If it is a native `{ passive: false }` listener, it is true. That is the defect
// itself, not a proxy for it: whether the browser's default (ctrl+wheel page
// zoom) runs is exactly whether that flag came back set.
//
// A SCREENSHOT CANNOT PROVE THIS. The app-window zoom Chromium applies on
// ctrl+wheel is a compositor-level scale; a shot of a zoomed window and a shot of
// a map that zoomed itself look alike, and either could be the other. The flag is
// the mechanism.
//
// THE CONTROL IS ROW 3: a wheel over an element with NO non-passive listener must
// come back with the flag CLEAR. Without it, a `defaultPrevented` that were true
// for some unrelated reason (a listener somewhere up the tree, a harness bug)
// would read as this fix working.
//
// Coordinates are aimed at INTEGER client pixels and the device scale factor is
// printed beside every number: at dpr 1.35 the canvas rect is fractional, and a
// float ask resolves one pixel lower, which presents as an off-by-one in a
// feature that is fine.
import { session, INSTALL, sleep, drain, RUN } from './canvas-cdp-harness.mjs';
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';

// The AEON project, opened READ-ONLY and never saved: `MapViewport` is aeon's map
// surface, and `openProjectAndAct` in the shared harness opens the CLASSIC
// s1disasm tree, which renders `ClassicLevelViewport` instead. Nothing below
// writes, so the live tree is safe to read.
const AEON = siblingPathOrUnresolved('aeon');

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
  // The map container: the DIV that holds #map-canvas, which is the element the
  // wheel listener is attached to.
  Q.mapBox = () => {
    const c = document.getElementById('map-canvas');
    return c && vis(c) ? c.parentElement : null;
  };
  // Integer client pixels at the middle of the box. Math.round, and the rect is
  // reported alongside so a fractional one is visible rather than silent.
  Q.aim = () => {
    const b = Q.mapBox(); if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             rect: [r.left, r.top, r.width, r.height], dpr: window.devicePixelRatio };
  };
  // A window BUBBLE listener: it runs after the container's, so it reads the
  // flag as the browser left it. Recorded per target so the control can use the
  // same probe.
  Q.arm = () => {
    window.__wheelSeen = [];
    if (!window.__wheelProbe) {
      window.__wheelProbe = (e) => window.__wheelSeen.push({
        defaultPrevented: e.defaultPrevented,
        cancelable: e.cancelable,
        ctrlKey: e.ctrlKey,
        target: e.target && e.target.id ? '#' + e.target.id : (e.target && e.target.tagName) || '?',
      });
      window.addEventListener('wheel', window.__wheelProbe);
    }
    return 'armed';
  };
  Q.seen = () => window.__wheelSeen || [];
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

await session('map wheel: is preventDefault alive?', async (c) => {
  console.log(`      provenance  ${RUN.announce ?? '(no announce line)'}`);
  await c.evalExpr(INSTALL);
  const haveDbg = await c.evalExpr('!!(window.__dbg && window.__dbg.aeon)');
  if (!haveDbg) throw new Error('no window.__dbg.aeon — rebuild with VITE_AURORA_DEBUG=1; '
    + 'UNMEASURABLE, not a pass');
  await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEON)})`)
    .catch((e) => console.log('        open threw:', e.message));
  let st = null;
  for (let i = 0; i < 40; i++) {
    st = await c.json('window.__dbg.aeon.state()').catch(() => null);
    if (st && st.open) break;
    await sleep(400);
  }
  if (!st || !st.open) throw new Error(`the aeon project at ${AEON} did not open — UNMEASURABLE`);
  await sleep(1500);
  note('0', 'aeon project open', { sections: st.sections ?? null, zone: st.zone ?? null });
  await c.evalExpr(P);

  const aim = await c.json('window.__q.aim()');
  if (!aim) throw new Error('no #map-canvas parent on screen — UNMEASURABLE, not a pass');
  note('0', 'device scale factor (devicePixelRatio)', aim.dpr);
  note('0', 'map container rect [l,t,w,h]', aim.rect);
  note('0', 'aim (integer client px)', [aim.x, aim.y]);
  const fractional = aim.rect.some((n) => !Number.isInteger(n));
  note('0', 'rect is fractional', fractional);

  await c.evalExpr('window.__q.arm()');

  // ---- 1: a PLAIN wheel over the map ------------------------------------
  const zBefore = await c.json('window.__q.zoom()');
  await wheel(c, aim.x, aim.y, false);
  let seen = await c.json('window.__q.seen()');
  note('1', 'wheel events the window saw', seen);
  const plain = seen.filter((s) => !s.ctrlKey);
  check('1', 'a plain wheel over the map is cancelable and WAS cancelled',
    plain.length > 0 && plain.every((s) => s.cancelable && s.defaultPrevented),
    JSON.stringify(plain));

  // ---- 2: a CTRL wheel — the one the user sees ----------------------------
  // This is the gesture that zoomed the whole application window: Chromium's
  // page zoom is the default action on ctrl+wheel.
  await c.evalExpr('window.__q.arm()');
  await wheel(c, aim.x, aim.y, true);
  seen = await c.json('window.__q.seen()');
  note('2', 'wheel events the window saw', seen);
  const ctrl = seen.filter((s) => s.ctrlKey);
  check('2', 'a ctrl+wheel over the map WAS cancelled, so the app window cannot zoom',
    ctrl.length > 0 && ctrl.every((s) => s.cancelable && s.defaultPrevented),
    JSON.stringify(ctrl));

  // ---- 3: THE CONTROL ----------------------------------------------------
  // Somewhere with no non-passive wheel listener. If this also comes back
  // cancelled, rows 1 and 2 measured something other than the map's listener.
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
  check('4', 'the map itself still zoomed on the wheel',
    zBefore === null || zAfter === null ? false : zAfter !== zBefore,
    zBefore === null ? 'UNMEASURABLE: __dbg.view() is not exposed' : `${zBefore} -> ${zAfter}`);

  await drain(c);
});

const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed`);
process.exit(bad.length ? 1 : 0);
