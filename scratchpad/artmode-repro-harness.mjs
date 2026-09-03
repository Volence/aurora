#!/usr/bin/env node
// Reproduce two reported Art-mode defects, against real GHZ act 1:
//   A) the Chunk tab's ASSIGN view renders all black
//   B) PAINT opens at 24x and ctrl+scroll does not zoom out
//
// Diagnostic only — it changes nothing and saves nothing.

import {
  session, openProjectAndAct, INSTALL, sleep, shot, drain,
} from './canvas-cdp-harness.mjs';

const note = (id, what, v) => console.log(`      ${id}  ${what}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

const PROBE = String.raw`
(() => {
  const P = {};
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  P.byText = (t) => [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && e.textContent.trim() === t && vis(e));
  P.click = (t) => { const e = P.byText(t); if (!e) return 'missing:' + t; e.click(); return 'clicked:' + t; };
  // Every visible canvas, largest first — the paint/assign surface is the big one.
  P.canvases = () => [...document.querySelectorAll('canvas')].filter(vis)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  P.main = () => P.canvases()[0] || null;
  P.canvasInfo = () => {
    const c = P.main(); if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: c.width, h: c.height, cssW: Math.round(r.width), cssH: Math.round(r.height) };
  };
  // What fraction of the surface is non-black? An all-black chunk is the bug.
  P.inkFraction = () => {
    const c = P.main(); if (!c) return null;
    const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) { // sparse sample
      n++;
      if (d[i] > 24 || d[i + 1] > 24 || d[i + 2] > 24) ink++;
    }
    return { ink, n, fraction: +(ink / n).toFixed(3) };
  };
  // EVERY PIXEL FIGURE BELOW IS REPORTED BESIDE THIS. `devicePixelRatio` under
  // Xvfb has been observed at both 1 and 1.35 in the same session on this
  // machine, which makes canvas client rects fractional and turns a correct
  // off-by-one into something that reads like a feature defect. A run that does
  // not state its dpr cannot be compared against another run's numbers.
  P.dpr = () => ({
    dpr: devicePixelRatio,
    inner: [innerWidth, innerHeight],
    // The main canvas' raw (unrounded) client rect — `canvasInfo` rounds, and
    // the rounding is exactly what hides a fractional dpr.
    rawRect: (() => {
      const c = P.main(); if (!c) return null;
      const r = c.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height];
    })(),
  });
  P.zoomLabel = () => {
    const e = [...document.querySelectorAll('*')].find(
      (x) => x.children.length === 0 && /^\d+×$/.test(x.textContent.trim()) && vis(x));
    return e ? e.textContent.trim() : 'none';
  };
  window.__p2 = P;
  return 'ok';
})()
`;

async function wheel(c, x, y, deltaY, ctrl) {
  await c.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x, y, deltaX: 0, deltaY,
    modifiers: ctrl ? 2 : 0, pointerType: 'mouse',
  });
  await sleep(350);
}

await session('art-mode repro', async (c) => {
  await c.evalExpr(INSTALL);
  const lvl = await openProjectAndAct(c);
  note('setup', 'act', lvl);
  await c.evalExpr(INSTALL);
  await c.evalExpr(PROBE);

  // Into Art > Chunk.
  note('nav', 'Art pill', await c.evalExpr('window.__p2.click("Art")'));
  await sleep(1200);
  await c.evalExpr(PROBE);
  note('nav', 'Chunk tab', await c.evalExpr('window.__p2.click("Chunk")'));
  await sleep(800);
  await c.evalExpr(PROBE);

  // ---- A: assign view ----
  note('A', 'Assign', await c.evalExpr('window.__p2.click("Assign")'));
  await sleep(900);
  await c.evalExpr(PROBE);
  note('A', 'dpr', await c.evalExpr('JSON.stringify(window.__p2.dpr())'));
  note('A', 'canvas', await c.evalExpr('JSON.stringify(window.__p2.canvasInfo())'));
  note('A', 'ink', await c.evalExpr('JSON.stringify(window.__p2.inkFraction())'));
  await shot(c, 'repro-assign');

  // ---- B: paint view ----
  note('B', 'Paint', await c.evalExpr('window.__p2.click("Paint")'));
  await sleep(1200);
  await c.evalExpr(PROBE);
  note('B', 'dpr', await c.evalExpr('JSON.stringify(window.__p2.dpr())'));
  note('B', 'canvas', await c.evalExpr('JSON.stringify(window.__p2.canvasInfo())'));
  note('B', 'ink', await c.evalExpr('JSON.stringify(window.__p2.inkFraction())'));
  note('B', 'zoom label', await c.evalExpr('window.__p2.zoomLabel()'));
  await shot(c, 'repro-paint');

  // ctrl+wheel over the surface: does the zoom label move?
  const rect = await c.json(`(() => {
    const c = window.__p2.main(); if (!c) return null;
    // The scroller is the overflow:auto ancestor — the element the hook binds to.
    let s = c.parentElement;
    while (s && getComputedStyle(s).overflow === 'visible') s = s.parentElement;
    const r = (s || c).getBoundingClientRect();
    const cx = Math.round(Math.max(r.left + 8, Math.min(r.left + r.width / 2, innerWidth - 8)));
    const cy = Math.round(Math.max(r.top + 8, Math.min(r.top + r.height / 2, innerHeight - 8)));
    return { x: cx, y: cy, scroller: s ? s.className || 'div' : 'none',
             rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] };
  })()`);
  note('B', 'wheel target', rect);
  if (rect) {
    await wheel(c, rect.x, rect.y, 240, true);
    await c.evalExpr(PROBE);
    note('B', 'zoom after ctrl+wheel down', await c.evalExpr('window.__p2.zoomLabel()'));
    await wheel(c, rect.x, rect.y, 240, false);
    await c.evalExpr(PROBE);
    note('B', 'zoom after plain wheel down', await c.evalExpr('window.__p2.zoomLabel()'));
    // Down to where a whole 256px chunk fits the pane, so the shot shows the art.
    await wheel(c, rect.x, rect.y, 240, false);
    await wheel(c, rect.x, rect.y, 240, false);
    await c.evalExpr(PROBE);
    note('B', 'zoom at rest', await c.evalExpr('window.__p2.zoomLabel()'));
    note('B', 'canvas at rest', await c.evalExpr('JSON.stringify(window.__p2.canvasInfo())'));
    note('B', 'ink at rest', await c.evalExpr('JSON.stringify(window.__p2.inkFraction())'));
    // ---- zoom IN from the floor, one notch at a time ----
    for (let i = 0; i < 5; i++) {
      await wheel(c, rect.x, rect.y, -240, false);
      await c.evalExpr(PROBE);
      note('C', 'zoom in notch ' + (i + 1), await c.evalExpr('window.__p2.zoomLabel()'));
    }
    note('C', 'canvas after zoom in', await c.evalExpr('JSON.stringify(window.__p2.canvasInfo())'));
  }
  await shot(c, 'repro-paint-after-wheel');
  await drain(c);
});
