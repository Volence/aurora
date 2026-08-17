// Is the import path REACHABLE in the running app? The native file dialog
// cannot be driven under CDP, so this verifies everything up to it: the command
// exists for a classic project, the dialog opens, and it says what it needs.
import { session, openProjectAndAct, INSTALL, sleep, ctrlK, typeText, enter, shot, drain } from '/home/volence/sonic_hacks/aurora/scratchpad/canvas-cdp-harness.mjs';

const rows = [];
const check = (id, what, pass, detail='') => {
  rows.push({id, pass}); console.log(`${pass?'PASS':'FAIL'}  ${id}  ${what}${detail?`  — ${detail}`:''}`);
};

await session('2C import', async (c) => {
  await c.evalExpr(INSTALL);
  await openProjectAndAct(c);
  await c.evalExpr(INSTALL);

  // 1 · the command is in the palette for a classic project
  await ctrlK(c); await sleep(500);
  await typeText(c, 'Import Art'); await sleep(600);
  const listed = await c.evalExpr(`(() => {
    const hits = [...document.querySelectorAll('*')].filter(e => e.children.length===0 && /Import Art Sheet/.test(e.textContent));
    return hits.length ? hits[0].textContent.trim() : 'not-found';
  })()`);
  check('1', 'the command palette offers Import Art Sheet', /Import Art Sheet/.test(String(listed)), String(listed));

  // 2 · running it opens the dialog. ENTER, not a synthesized click: React
  //     attaches synthetic handlers, so element.onclick is always null and a
  //     parent-walk looking for one finds nothing to click.
  await enter(c);
  await sleep(900);
  const title = await c.evalExpr(`(() => {
    const e = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Import art sheet');
    return e ? 'open' : 'closed';
  })()`);
  check('2', 'the dialog opens', title === 'open', String(title));

  const body = await c.evalExpr(`(() => {
    const e = [...document.querySelectorAll('div')].find(x => /indexed PNG/.test(x.textContent) && x.children.length===0);
    return e ? e.textContent.trim() : 'no-guidance';
  })()`);
  check('3', 'it states what kind of file it needs', /indexed PNG/.test(String(body)), String(body).slice(0,90));

  const chip = await c.evalExpr(`(() => {
    const e = [...document.querySelectorAll('[title]')].find(x => x.textContent.trim() === 'Choose a PNG…');
    return e ? 'present' : 'missing';
  })()`);
  check('4', 'it offers a file chooser', chip === 'present', String(chip));

  await shot(c, 'import-dialog');
  await drain(c);
});

const bad = rows.filter(r => !r.pass);
console.log(`\n${rows.length-bad.length}/${rows.length} checks passed`);
process.exit(bad.length ? 1 : 0);
