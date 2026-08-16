// Hypothesis: Assign -> Paint -> Assign leaves a freshly-created, never-painted
// canvas whose CSS background is #000000 — the reported "entirely black" view.
// The render effect's deps omit chunkPaintMode, and the branch swap changes the
// child element type, so React recreates the <canvas>.
import { session, openProjectAndAct, INSTALL, sleep, shot, drain } from './canvas-cdp-harness.mjs';

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
  Q.ink = () => {
    const c = Q.main(); if (!c) return null;
    const g = c.getContext('2d', { willReadFrequently: true }); if (!g) return null;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 37) { n++; if (d[i] > 24 || d[i+1] > 24 || d[i+2] > 24) ink++; }
    return { fraction: +(ink / n).toFixed(3), size: [c.width, c.height] };
  };
  return (window.__q = Q), 'ok';
})()
`;

const go = async (c, t, ms = 900) => { await c.evalExpr(P); const r = await c.evalExpr(`window.__q.click(${JSON.stringify(t)})`); await sleep(ms); await c.evalExpr(P); return r; };

await session('assign toggle', async (c) => {
  await c.evalExpr(INSTALL);
  await openProjectAndAct(c);
  await go(c, 'Art', 1200); await go(c, 'Chunk', 700);

  await go(c, 'Assign', 1000);
  const first = await c.json('window.__q.ink()');
  note('1', 'assign on first mount', first);
  check('1', 'baseline Assign renders art', first.fraction > 0.2, `${first.fraction}`);

  await go(c, 'Paint', 1100);
  await go(c, 'Assign', 1100);
  const back = await c.json('window.__q.ink()');
  note('2', 'assign after Paint round-trip', back);
  await shot(c, 'assign-after-toggle');
  check('2', 'Assign still renders after a Paint round-trip', back.fraction > 0.2, `${back.fraction}`);

  // Fable's confirmation step: any dep change should instantly repaint it.
  await go(c, 'Show', 900);
  const healed = await c.json('window.__q.ink()');
  note('3', 'after toggling Show (a dep change)', healed);
  check('3', 'and still renders after a dep change', healed.fraction > 0.2, `${healed.fraction}`);

  // The BLOCK tab has the identical shape — same branch swap, same missing dep.
  await go(c, 'Block', 900);
  await go(c, 'Assign', 900);
  const bFirst = await c.json('window.__q.ink()');
  await go(c, 'Paint', 1000);
  await go(c, 'Assign', 1000);
  const bBack = await c.json('window.__q.ink()');
  note('4', 'block assign first / after round-trip', [bFirst, bBack]);
  check('4', 'Block Assign survives a Paint round-trip too', bBack.fraction > 0.2, `${bBack.fraction}`);
  await drain(c);
});
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed`);
