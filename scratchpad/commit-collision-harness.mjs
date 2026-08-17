#!/usr/bin/env node
// STAGE 4: does the commit's collision toggle actually give new art collision?
//
// The node suite proves the transform and guards the wiring; neither commits
// anything. This drives the BUILT app under xvfb over CDP against real
// s1disasm data and commits the same drawing twice — once with the toggle off,
// once on — then reads the new blocks' colind back out of the document.
//
// It REUSES scratchpad/canvas-cdp-harness.mjs rather than reimplementing the
// canvas/commit flow. That harness's own header records three defects that each
// produced a convincing FALSE result before being caught, so a fresh
// reimplementation would begin by re-earning trust this code already has.
//
// WHAT IS NOT CHECKED HERE, and why it is a finding rather than an omission:
// undoing the commit from the canvas tab undoes the DRAWING, not the commit —
// undo is per-document and the commit mutates the classic ART document while
// the canvas tab is focused (commit-cdp-harness.mjs row 4 records the same).
// Proving "the remediation is not a second undo step" therefore belongs to the
// store suite, where the composite is falsifiable; what this file can prove is
// that the toggle changes what the commit WRITES.
//
//   node scratchpad/commit-collision-harness.mjs

import {
  session, openProjectAndAct, openNewCanvasDialog, fillDialog,
  INSTALL, sleep, clickEl, drawArt, shot, CANVAS_DIR,
} from './canvas-cdp-harness.mjs';
import { rmSync, existsSync, readdirSync } from 'node:fs';

const rows = [];
function check(id, what, pass, detail = '') {
  rows.push({ id, what, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
}

/** A canvas NAMES A FILE, so one left behind makes the next create refuse as a
 *  duplicate — the dialog stays open and no tab appears. An earlier harness
 *  reported ten false failures whose real cause was exactly that. */
function clearCanvases() {
  if (!existsSync(CANVAS_DIR)) return;
  for (const f of readdirSync(CANVAS_DIR)) {
    if (/^stage4-/.test(f)) rmSync(`${CANVAS_DIR}/${f}`);
  }
}

/** Page-side helpers for the commit panel. */
const K = `
(() => {
  const K = {};
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  K.openSection = (title) => {
    const h = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === title);
    if (!h) return false;
    h.click();
    return true;
  };
  K.reportText = () => {
    const all = [...document.querySelectorAll('div')].filter((d) => /collision:/i.test(d.textContent));
    if (!all.length) return null;
    const el = all[all.length - 1];
    return el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 240);
  };
  K.toggle = () => [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && /Give new art collision/i.test(e.textContent) && vis(e));
  K.commitChip = () => [...document.querySelectorAll('[title]')].find(
    (x) => /^Commit \\d+ chunk/.test(x.textContent.trim()));
  window.__k = K;
  return Object.keys(K).length;
})()`;

async function commitOnce(c, { name, giveCollision }) {
  await openNewCanvasDialog(c);
  await fillDialog(c, { name, width: 256, height: 256, profile: 'genesis-level-art' });
  await clickEl(c, 'window.__c.dlgCreate()');
  await sleep(1600);
  // drawArt(c, x0, y0, x1, y1, bufW) — the signature, not a bare call. The
  // first version passed none and CDP rejected the NaN coordinate outright,
  // which at least failed loudly rather than drawing nothing.
  await drawArt(c, 16, 16, 72, 16, 256);
  await drawArt(c, 16, 32, 48, 56, 256);
  await sleep(600);

  await c.evalExpr(INSTALL);
  await c.evalExpr(K);
  await c.evalExpr(`window.__k.openSection('Commit to level')`);
  await sleep(900);
  await c.evalExpr(K);

  const before = await c.json('window.__dbg.classic.poolSizes()');
  const offText = await c.evalExpr('window.__k.reportText()');

  if (giveCollision) {
    const clicked = await c.evalExpr(`(() => { const t = window.__k.toggle(); if (!t) return false; t.click(); return true; })()`);
    await sleep(700);
    await c.evalExpr(K);
    if (!clicked) throw new Error('the "Give new art collision" toggle was not found');
  }
  const onText = await c.evalExpr('window.__k.reportText()');

  const chip = await c.evalExpr(`(() => { const e = window.__k.commitChip(); if (!e) return 'no-chip'; e.click(); return e.textContent.trim(); })()`);
  await sleep(1600);
  const after = await c.json('window.__dbg.classic.poolSizes()');
  return { before, after, offText, onText, chip };
}

/** The colind of every block the commit appended. */
async function newBlockShapes(c, before, after) {
  return c.json(`(() => {
    const out = [];
    for (let b = ${before.blocks}; b < ${after.blocks}; b++) out.push(window.__dbg.classic.colindOf(b));
    return out;
  })()`);
}

async function main() {
  clearCanvases();
  await session('stage-4 commit collision', async (c) => {
    await openProjectAndAct(c);

    // --- A: toggle OFF — the committed art lands with no collision ---------
    const off = await commitOnce(c, { name: 'stage4-off', giveCollision: false });
    const offShapes = await newBlockShapes(c, off.before, off.after);
    check('1', 'a commit grows the block pool', off.after.blocks > off.before.blocks,
      `${off.before.blocks} → ${off.after.blocks} · chip=${off.chip}`);
    check('2', 'with the toggle OFF the new blocks have NO collision',
      offShapes.length > 0 && offShapes.every((s) => s === 0),
      `shapes=${JSON.stringify(offShapes.slice(0, 8))}`);
    check('3', 'and the preview said so', /have none/i.test(off.offText || ''), `"${off.offText}"`);
    await shot(c, 'stage4-off');

    // --- B: toggle ON — the same drawing lands flat ------------------------
    const on = await commitOnce(c, { name: 'stage4-on', giveCollision: true });
    const onShapes = await newBlockShapes(c, on.before, on.after);
    check('4', 'with the toggle ON every new block gets the flat shape',
      onShapes.length > 0 && onShapes.every((s) => s === 0xff),
      `shapes=${JSON.stringify(onShapes.slice(0, 8))}`);
    check('5', 'and the preview changed to say what it will do',
      /will get flat/i.test(on.onText || '') && !/will get flat/i.test(on.offText || ''),
      `off="${on.offText}"\n        on="${on.onText}"`);
    await shot(c, 'stage4-on');

    // --- C: anti-vacuous — the two runs really differed --------------------
    check('6', 'the two commits produced different collision',
      offShapes.length > 0 && onShapes.length > 0
        && JSON.stringify(offShapes) !== JSON.stringify(onShapes),
      `${JSON.stringify(offShapes.slice(0, 4))} vs ${JSON.stringify(onShapes.slice(0, 4))}`);
  });

  clearCanvases();
  const passed = rows.filter((r) => r.pass).length;
  console.log(`\n${passed}/${rows.length} rows passed`);
  if (passed !== rows.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
