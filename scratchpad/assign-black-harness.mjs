// Hypothesis: the Chunk > Assign view renders black once an OBJECT ART (sprite)
// document has been opened — the reporter had Signpost / Giant Ring / Spiked
// Pole tabs open; a clean session (which renders fine) has none.
import { session, openProjectAndAct, INSTALL, sleep, ctrlK, typeText, enter, shot, drain } from './canvas-cdp-harness.mjs';

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
    return { n, fraction: +(ink / n).toFixed(3), size: [c.width, c.height] };
  };
  Q.tabs = () => [...document.querySelectorAll('*')]
    .filter(e => vis(e) && e.children.length === 0 && /Signpost|Giant Ring|Spiked|Green Hill Zone Act 1/.test(e.textContent))
    .map(e => e.textContent.trim());
  return (window.__q = Q), 'ok';
})()
`;

async function assignInk(c, label) {
  await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Art")'); await sleep(1000); await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Chunk")'); await sleep(600); await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Assign")'); await sleep(1000); await c.evalExpr(P);
  const ink = await c.json('window.__q.ink()');
  note(label, 'assign ink', ink);
  return ink;
}

await session('assign black', async (c) => {
  await c.evalExpr(INSTALL);
  await openProjectAndAct(c);
  const before = await assignInk(c, 'baseline');

  // Open object art through the command palette, the way the reporter would have.
  await ctrlK(c); await sleep(500);
  await typeText(c, 'Edit art'); await sleep(700);
  await enter(c); await sleep(2500);
  await c.evalExpr(P);
  note('sprite', 'tabs now', await c.json('window.__q.tabs()'));

  // Back to the level tab, then Art > Chunk > Assign again.
  await c.evalExpr(P);
  await c.evalExpr('window.__q.click("Green Hill Zone Act 1")'); await sleep(1500);
  const after = await assignInk(c, 'after-sprite');
  await shot(c, 'assign-after-sprite');

  console.log(`\nbaseline ${before && before.fraction} → after sprite ${after && after.fraction}`);
  console.log(after && after.fraction < 0.05 ? 'REPRODUCED: assign went black' : 'not reproduced');
  await drain(c);
});
