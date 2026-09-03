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
  // A DOCUMENT TAB IS NOT CLICKED, IT IS MOUSE-DOWNED. TabStrip.tsx activates on
  // onMouseDown (so a drag starts on the right tab), and HTMLElement.click()
  // dispatches a click event and nothing else — no mousedown, no mouseup. So
  // Q.click('Green Hill Zone Act 1') returned 'clicked' and changed nothing, the
  // sprite tab stayed active, and every reading after it was taken off the
  // sprite editor's canvas while the log said Assign. React delegates at the
  // root, so a bubbling synthetic MouseEvent on the title span reaches the
  // handler exactly as the real one does.
  Q.activateTab = (t) => {
    const span = [...document.querySelectorAll('[role="tablist"] *')].find(
      (x) => x.children.length === 0 && x.textContent.trim() === t && vis(x));
    if (!span) return 'missing-tab:' + t;
    for (const type of ['mousedown', 'mouseup', 'click']) {
      span.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: 1 }));
    }
    return 'activated';
  };
  // What the tab strip says is ACTIVE — read back, so "I dispatched a mousedown"
  // is never confused with "it is now the front document". TabStrip.tsx gives
  // the active tab styles.tabActive, whose only computed difference from the
  // base is the accent in boxShadow: inset 0 2px 0 <accent>; the base spells
  // that same shadow with transparent. So "the tab whose top inset shadow is not
  // transparent" is read off the source, not off a colour anyone pinned.
  Q.activeTab = () => {
    const strip = document.querySelector('[role="tablist"]');
    if (!strip) return 'no-tablist';
    // getComputedStyle SERIALISES the keyword away: transparent comes back as
    // rgba(0, 0, 0, 0), so testing the string for the word matches nothing and
    // every tab reads as active. The alpha channel is the actual signal.
    const opaqueShadow = (t) => {
      const m = /rgba?\(([^)]*)\)/.exec(getComputedStyle(t).boxShadow);
      if (!m) return false;
      const parts = m[1].split(',').map((s) => parseFloat(s));
      return parts.length < 4 || parts[3] !== 0;
    };
    const active = [...strip.children].filter(opaqueShadow);
    if (active.length !== 1) return 'ambiguous:' + active.length + '-active-of-' + strip.children.length;
    return active[0].textContent.trim();
  };
  // WHICH CANVAS. "The biggest visible one" is NOT good enough here, and that
  // is not a hypothetical: with a sprite document open this harness sampled a
  // 384x336 surface and printed a confident "not reproduced" about a canvas
  // that cannot be the chunk grid at all. The chunk Assign canvas is 16x16
  // cells at a whole-pixel cell size (ChunkTab.tsx: width={sizePx}
  // height={sizePx}, sizePx = cellPx * 16), so it is always SQUARE and always a
  // multiple of 16. A sprite sheet is neither. Requiring both is what makes a
  // black reading and a not-black reading be about the same element.
  Q.main = () => [...document.querySelectorAll('canvas')].filter(vis)
    .filter((c) => c.width === c.height && c.width % 16 === 0 && c.width >= 16 * 8)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null;
  Q.ink = () => {
    const c = Q.main();
    // LOUD ON UNMEASURABLE. No square 16-multiple canvas on screen means the
    // Assign view is not mounted — the navigation failed, or a tab swallowed a
    // click. That is not "black" and it is not "fine"; reporting it as either
    // is how a broken query becomes a result.
    if (!c) return { unmeasurable: 'no square 16-multiple canvas is visible — Assign is not mounted' };
    const g = c.getContext('2d', { willReadFrequently: true });
    if (!g) return { unmeasurable: 'the canvas has no 2d context' };
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
  note('sprite', 'active tab before switching back', await c.json('window.__q.activeTab()'));
  note('sprite', 'switch back', await c.evalExpr('window.__q.activateTab("Green Hill Zone Act 1")'));
  await sleep(1500);
  await c.evalExpr(P);
  const activeNow = await c.json('window.__q.activeTab()');
  note('sprite', 'active tab after switching back', activeNow);
  // REFUSE TO MEASURE FROM THE WRONG DOCUMENT. The first version of this
  // harness went on regardless and reported a confident "not reproduced" about
  // the sprite editor's canvas.
  if (activeNow !== 'Green Hill Zone Act 1') {
    console.log(`\nUNMEASURABLE: could not return to the level tab (active: ${JSON.stringify(activeNow)}) — `
      + 'the sprite hypothesis was never exercised');
    await drain(c);
    return;
  }
  const after = await assignInk(c, 'after-sprite');
  await shot(c, 'assign-after-sprite');

  console.log(`\nbaseline ${before && before.fraction} → after sprite ${after && after.fraction}`);
  // Three outcomes, not two. An unmeasurable row is never folded into a pass.
  if (before?.unmeasurable || after?.unmeasurable) {
    console.log(`UNMEASURABLE: ${before?.unmeasurable ?? ''} ${after?.unmeasurable ?? ''}`.trim());
  } else if (before.size[0] !== after.size[0]) {
    // Same defect class as sampling the wrong canvas: two different surfaces
    // compared as if they were one. Say so rather than pronouncing.
    console.log(`UNMEASURABLE: the two readings are different surfaces `
      + `(${before.size} vs ${after.size}) and cannot be compared`);
  } else {
    console.log(after.fraction < 0.05 ? 'REPRODUCED: assign went black' : 'not reproduced');
  }
  await drain(c);
});
