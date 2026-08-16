// Does painting still work in Chunk > Paint after hand-pan started attaching?
// Hand-pan binds pointerdown in the CAPTURE phase and was never attached in
// Paint mode before the late-mount fix; if its gate were wrong it would now
// swallow brush strokes. Gate is button===1 || (button===0 && space), so a plain
// left-drag should paint. This proves it against the real document.
import { session, openProjectAndAct, INSTALL, sleep, mouse, shot, drain } from './canvas-cdp-harness.mjs';

const rows = [];
const check = (id, w, pass, d = '') => { rows.push({ id, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${w}${d ? `  — ${d}` : ''}`); };
const note = (id, w, v) => console.log(`      ${id}  ${w}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

const P = String.raw`
(() => {
  const Q = {};
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  Q.click = (t) => {
    const e = [...document.querySelectorAll('*')].find(
      (x) => x.children.length === 0 && x.textContent.trim() === t && vis(x));
    if (!e) return 'missing:' + t; e.click(); return 'clicked';
  };
  Q.main = () => [...document.querySelectorAll('canvas')].filter(vis)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  // A point well inside the paint canvas, in screen coords.
  Q.pt = (fx, fy) => {
    const c = Q.main(); if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.left + r.width * fx), y: Math.round(r.top + r.height * fy) };
  };
  return (window.__q = Q), 'ok';
})()
`;

await session('paint regression', async (c) => {
  await c.evalExpr(INSTALL);
  await openProjectAndAct(c);
  await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Art")'); await sleep(1100); await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Chunk")'); await sleep(600); await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Paint")'); await sleep(1000); await c.evalExpr(P);

  const before = await c.json('window.__dbg.classic.poolSizes()');
  const hashesBefore = await c.json(`(() => {
    const d = window.__dbg.classic; const out = {};
    for (const t of [1,2,3,4,5,6,7,8]) out[t] = d.tileHash(t);
    return out;
  })()`);
  note('setup', 'pool', before);

  // A plain LEFT drag across the middle of the surface.
  const a = await c.json('window.__q.pt(0.35, 0.75)');
  const b = await c.json('window.__q.pt(0.55, 0.78)');
  await mouse(c, 'mousePressed', a.x, a.y);
  for (let i = 1; i <= 6; i++) {
    await mouse(c, 'mouseMoved', Math.round(a.x + (b.x - a.x) * i / 6), Math.round(a.y + (b.y - a.y) * i / 6));
    await sleep(40);
  }
  await mouse(c, 'mouseReleased', b.x, b.y, { buttons: 0 });
  await sleep(900);

  const hashesAfter = await c.json(`(() => {
    const d = window.__dbg.classic; const out = {};
    for (const t of [1,2,3,4,5,6,7,8]) out[t] = d.tileHash(t);
    return out;
  })()`);
  const after = await c.json('window.__dbg.classic.poolSizes()');
  const changed = Object.keys(hashesBefore).filter((k) => hashesBefore[k] !== hashesAfter[k]);
  note('paint', 'tiles whose bytes changed', changed);
  note('paint', 'pool after', after);

  const poolGrew = after.blocks !== before.blocks;
  check('1', 'a left-drag still paints (tile bytes changed or a block diverged)',
    changed.length > 0 || poolGrew, `changed=${changed.length} blocksGrew=${poolGrew}`);
  await shot(c, 'paint-regression');
  await drain(c);
});
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed`);
process.exit(bad.length ? 1 : 0);
