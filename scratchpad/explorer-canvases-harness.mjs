// Are the canvas entry points VISIBLE in the explorer, not just in ⌘K?
import { session, openProjectAndAct, INSTALL, sleep, shot, drain } from './canvas-cdp-harness.mjs';

const rows = [];
const check = (id, what, pass, detail = '') => {
  rows.push({ id, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `  — ${detail}` : ''}`);
};

await session('explorer canvases', async (c) => {
  await c.evalExpr(INSTALL);
  await openProjectAndAct(c);
  await sleep(800);

  // Expand the collapsed CANVASES group by clicking its header.
  const opened = await c.evalExpr(`(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    // The group label is a TEXT NODE inside a row that also holds a chevron and
    // a count span, so it is not a leaf — matching on leaves found nothing.
    // The clickable row is the DIV holding the label span AND the count span.
    const rows = [...document.querySelectorAll('div')].filter(
      (e) => vis(e) && e.children.length === 2 && /^canvases\\d*$/i.test(e.textContent.trim()));
    if (!rows.length) return 'no-header';
    rows[0].click();
    return 'clicked';
  })()`);
  await sleep(700);

  const items = await c.json(`(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return [...document.querySelectorAll('*')]
      .filter((e) => vis(e) && e.children.length === 0 && /^(New Canvas…|Import Art Sheet…)$/.test(e.textContent.trim()))
      .map((e) => e.textContent.trim());
  })()`);
  console.log('      expand:', opened, '· visible rows:', JSON.stringify(items));
  check('1', 'New Canvas… is visible in the sidebar', items.some((t) => /New Canvas/.test(t)));
  check('2', 'Import Art Sheet… is visible in the sidebar', items.some((t) => /Import Art Sheet/.test(t)));
  await shot(c, 'explorer-canvases');
  await drain(c);
});
const bad = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - bad.length}/${rows.length} checks passed`);
process.exit(bad.length ? 1 : 0);
