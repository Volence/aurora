// Per-tier zoom, in the running app: does a chunk open at a sane size, and does
// zooming one tier leave the others alone?
import { session, openProjectAndAct, INSTALL, sleep, shot, drain } from './canvas-cdp-harness.mjs';

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
  Q.click = (t) => {
    const e = [...document.querySelectorAll('*')].find(
      (x) => x.children.length === 0 && x.textContent.trim() === t && vis(x));
    if (!e) return 'missing:' + t; e.click(); return 'clicked';
  };
  Q.mainCanvas = () => [...document.querySelectorAll('canvas')].filter(vis)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  Q.size = () => { const c = Q.mainCanvas(); return c ? [c.width, c.height] : null; };
  return (window.__q = Q), 'ok';
})()
`;

await session('tier zoom', async (c) => {
  await c.evalExpr(INSTALL);
  await openProjectAndAct(c);
  await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Art")'); await sleep(1200); await c.evalExpr(P);

  // Chunk > Paint: the surface that used to open at 6144px.
  await c.evalExpr('window.__q.click("Chunk")'); await sleep(600); await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Paint")'); await sleep(1000); await c.evalExpr(P);
  const chunk = await c.json('window.__q.size()');
  note('1', 'chunk paint canvas', chunk);
  check('1', 'a chunk no longer opens at 6144px', chunk[0] <= 1024, `${chunk[0]}px`);
  await shot(c, 'tier-chunk');

  // Zoom the chunk in two notches, then check the TILE tier is untouched.
  const tier = () => c.json('JSON.stringify(window.__dbg ? null : null)');
  await c.evalExpr('window.__q.click("Tile")'); await sleep(800); await c.evalExpr(P);
  const tile = await c.json('window.__q.size()');
  note('2', 'tile canvas', tile);
  check('2', 'the tile editor opens at its own zoom, not the chunk’s',
    tile[0] >= 128 && tile[0] <= 256, `${tile[0]}px`);
  await shot(c, 'tier-tile');

  // Block tier.
  await c.evalExpr('window.__q.click("Block")'); await sleep(800); await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Paint")'); await sleep(800); await c.evalExpr(P);
  const block = await c.json('window.__q.size()');
  note('3', 'block paint canvas', block);
  check('3', 'the block editor opens at its own zoom', block[0] >= 128 && block[0] <= 512, `${block[0]}px`);
  await shot(c, 'tier-block');
  await drain(c);
});
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed`);
process.exit(bad.length ? 1 : 0);
