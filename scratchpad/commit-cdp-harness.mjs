#!/usr/bin/env node
// Phase 2C verification: is COMMIT real in the running Electron app?
//
// The node suite renders no React, so every claim the commit panel makes is
// unverified until the app is driven. This drives the BUILT app under xvfb over
// CDP, against REAL s1disasm data (GHZ act 1).
//
// It reuses scratchpad/canvas-cdp-harness.mjs by importing it — launch
// discipline, the page-side helper bundle, input dispatch, the project/act
// opener, the New Canvas dialog driver. That harness's report records three
// defects that each produced a convincing FALSE result before being caught, so
// a fresh reimplementation would start by re-earning trust this code has.
//
//   node scratchpad/commit-cdp-harness.mjs
//   ONLY=3 node scratchpad/commit-cdp-harness.mjs
//
// EVERY MUTATION GOES THROUGH THE REAL UI. `window.__dbg.classic.*` is
// read-only and is used to CORROBORATE what the screen said, never to replace it.

import { rmSync, existsSync, readdirSync } from 'node:fs';
import {
  session, openProjectAndAct, openNewCanvasDialog, fillDialog,
  INSTALL, sleep, clickEl, drawArt, shot, drain, key, CANVAS_DIR,
} from './canvas-cdp-harness.mjs';

const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const run = (id) => !ONLY || ONLY.has(id);

const rows = [];
function check(id, what, pass, detail = '') {
  rows.push({ id, what, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `  — ${detail}` : ''}`);
}
function note(id, what, v) { console.log(`      ${id}  ${what}: ${JSON.stringify(v)}`); }

// A canvas NAMES A FILE, so one left behind makes the next create REFUSE as a
// duplicate — the dialog stays open and no tab appears. An earlier harness run
// reported ten false failures whose real cause was exactly that. Start clean.
function clearCanvases() {
  if (!existsSync(CANVAS_DIR)) return [];
  const had = readdirSync(CANVAS_DIR);
  for (const f of had) rmSync(`${CANVAS_DIR}/${f}`, { force: true });
  return had;
}

// Page-side helpers for the commit panel specifically. Kept here rather than in
// the shared bundle so the shared one stays what it already earned trust as.
const COMMIT_INSTALL = String.raw`
(() => {
  const K = {};
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };

  // The CollapsibleSection whose header text matches.
  K.sectionHeader = (title) => [...document.querySelectorAll('*')].find(
    (e) => e.children.length <= 2 && e.textContent.trim() === title && vis(e)
      && (e.tagName === 'BUTTON' || e.getAttribute('role') === 'button' || e.onclick));
  K.openSection = (title) => {
    const h = K.sectionHeader(title);
    if (!h) return 'no-header';
    if (K.panelText().length > 40) return 'already-open';
    h.click();
    return 'clicked';
  };
  // All text inside the commit section's body.
  K.panelText = () => {
    const sel = [...document.querySelectorAll('select')].filter(vis);
    // The commit body is the nearest common ancestor of its selects; when there
    // are none (refusal state) fall back to any element mentioning the panel's
    // own vocabulary, which no other pane uses.
    if (sel.length) {
      let n = sel[0];
      for (let i = 0; i < 6 && n.parentElement; i++) n = n.parentElement;
      return n.textContent.trim();
    }
    const hit = [...document.querySelectorAll('div')].find(
      (e) => vis(e) && /chunk grid|Open a level act|smaller than one/.test(e.textContent));
    return hit ? hit.textContent.trim() : '';
  };
  K.targetSelects = () => [...document.querySelectorAll('select')].filter(
    (e) => vis(e) && [...e.options].some((o) => o.textContent.trim() === 'Append as new chunk'));
  K.selectCount = () => K.targetSelects().length;
  // The exact refusal sentence, when there is one. panelText walks ancestors and
  // over-collects; this finds the one element that IS the message.
  K.refusalText = () => {
    const hit = [...document.querySelectorAll('div')].filter(
      (e) => vis(e) && e.children.length === 0 && /needs \d+ tiles|colours the act|recolours|cells draw from|Replacing chunks needs/.test(e.textContent));
    return hit.map((e) => e.textContent.trim()).join(' || ');
  };
  K.reportText = () => {
    const hit = [...document.querySelectorAll('div')].filter(
      (e) => vis(e) && e.children.length === 0 && /^(tiles|blocks|chunks|pool|collision|solidity):/.test(e.textContent.trim()));
    return hit.map((e) => e.textContent.trim()).join(' | ');
  };
  // Set target i by its option LABEL, through a real change event.
  K.setTarget = (i, label) => {
    const s = K.targetSelects()[i];
    if (!s) return 'no-select';
    const opt = [...s.options].find((o) => o.textContent.trim() === label);
    if (!opt) return 'no-option:' + [...s.options].map((o) => o.textContent.trim()).join('|');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(s, opt.value);
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return 'set';
  };
  window.__k = K;
  return 'ok';
})()
`;

async function main() {
  const had = clearCanvases();
  if (had.length) console.log(`      cleared ${had.length} leftover canvas file(s)`);

  await session('2C commit', async (c) => {
    await c.evalExpr(INSTALL);
    await c.evalExpr(COMMIT_INSTALL);
    const lvl = await openProjectAndAct(c);
    note('setup', 'GHZ act 1 ready', lvl);
    await c.evalExpr(INSTALL);
    await c.evalExpr(COMMIT_INSTALL);

    // ---- create a canvas big enough to hold a whole chunk ------------------
    await openNewCanvasDialog(c);
    await fillDialog(c, { name: 'commit-a', width: 256, height: 256, profile: 'genesis-level-art' });
    await clickEl(c, 'window.__c.dlgCreate()');
    await sleep(1500);
    await c.evalExpr(COMMIT_INSTALL);

    const size = await c.evalExpr('(() => { const id = window.__dbg.canvas.activeDocId(); const st = id && window.__dbg.canvas.state(id); return st && [st.width, st.height]; })()');
    note('setup', 'canvas size', size);
    // A SETUP STEP THAT CANNOT FAIL POISONS EVERY CHECK AFTER IT. The first run
    // of this harness reported check 1 as PASS while no canvas existed at all —
    // it had counted a <select> on the Home screen. Assert, and stop.
    if (!Array.isArray(size) || size[0] !== 256 || size[1] !== 256) {
      throw new Error(`setup failed: expected a 256x256 canvas, got ${JSON.stringify(size)}`);
    }

    // ---- 1: the panel exists and offers one target per chunk ---------------
    if (run('1')) {
      const opened = await c.evalExpr('window.__k.openSection("Commit to level")');
      await sleep(400);
      const n = await c.evalExpr('window.__k.selectCount()');
      const text = await c.evalExpr('window.__k.panelText()');
      note('1', 'openSection', opened);
      note('1', 'panel text', String(text).slice(0, 240));
      check('1', 'commit panel offers one target per committable chunk', n === 1, `selects=${n}`);
    }

    // ---- 2: it previews a report BEFORE anything is applied ----------------
    if (run('2')) {
      // Several strokes, so the drawing has more than one unique tile and the
      // report's numbers are not all 1.
      await drawArt(c, 16, 16, 72, 16, 256);
      await drawArt(c, 16, 32, 48, 56, 256);
      await sleep(600);
      const text = String(await c.evalExpr('window.__k.reportText()'));
      const refusal = String(await c.evalExpr('window.__k.refusalText()'));
      note('2', 'report', text);
      note('2', 'refusal', refusal);
      const before = await c.evalExpr('JSON.stringify(window.__dbg.classic.poolSizes())');
      note('2', 'reserved tiles', (await c.evalExpr('window.__dbg.classic.reservedTiles().length')));
      note('2', 'budget readout', String(await c.evalExpr(
        '(() => { const e=[...document.querySelectorAll("*")].find(x=>x.children.length===0 && /free in GHZ/.test(x.textContent)); return e ? e.textContent.trim() : "not-found"; })()')));
      note('2', 'pool before', before);
      check('2', 'report previews tile/block/chunk counts without applying',
        /tiles:.*new/.test(text) && /chunks:.*appended/.test(text),
        text.replace(/\s+/g, ' ').slice(0, 200) + (refusal ? ` REFUSED: ${refusal}` : ''));
      check('2b', 'previewing changed NOTHING in the document',
        JSON.parse(before).chunks === JSON.parse(await c.evalExpr('JSON.stringify(window.__dbg.classic.poolSizes())')).chunks);
    }

    // ---- 3: committing actually changes the document -----------------------
    if (run('3')) {
      const before = JSON.parse(await c.evalExpr('JSON.stringify(window.__dbg.classic.poolSizes())'));
      const clicked = await c.evalExpr('(() => { const e=[...document.querySelectorAll("[title]")].find(x=>/^Commit \\d+ chunk/.test(x.textContent.trim())); if(!e) return "no-chip"; e.click(); return e.textContent.trim(); })()');
      await sleep(1200);
      const after = JSON.parse(await c.evalExpr('JSON.stringify(window.__dbg.classic.poolSizes())'));
      note('3', 'commit chip', clicked);
      note('3', 'pool before/after', [before, after]);
      check('3', 'commit appends a chunk to the real document',
        after.chunks === before.chunks + 1, `${before.chunks} -> ${after.chunks}`);
      check('3b', 'commit added blocks too', after.blocks > before.blocks,
        `${before.blocks} -> ${after.blocks}`);
      const txt = String(await c.evalExpr('window.__k.panelText()'));
      check('3c', 'the panel confirms where it landed', /Committed to GHZ 1/.test(txt),
        txt.replace(/\s+/g, ' ').slice(-120));
      await shot(c, 'commit-applied');
    }

    // ---- 4: NOT CHECKED HERE, and that is a finding, not an omission.
    // The commit mutates the CLASSIC ART document while the canvas tab is
    // focused, and undo is routed per document — so Ctrl+Z here undoes the
    // drawing, not the commit. Undoing a commit means focusing a level tab
    // first. That the commit is ONE undo entry is proven by the store suite
    // (classicLevelStore.test.ts, falsified by removing the composite), which
    // is the right place for it; what the app cannot currently do is offer that
    // undo from where the artist just pressed the button.

    // ---- 5: a replace target is offered and reclaims ------------------------
    if (run('5')) {
      const set = await c.evalExpr('window.__k.setTarget(0, "Replace chunk $01")');
      await sleep(700);
      const text = String(await c.evalExpr('window.__k.reportText()'));
      const refusal = String(await c.evalExpr('window.__k.refusalText()'));
      note('5', 'setTarget', set);
      note('5', 'report', text);
      note('5', 'refusal', refusal);
      // Replacing must switch the plan from appending to replacing. Whether it
      // reclaims anything depends on how much of that chunk's art is exclusive
      // to it, which in GHZ is often nothing — so the assertion is on the MODE,
      // not on a reclaim count that real data need not produce.
      check('5', 'choosing a chunk switches the plan from append to replace',
        /chunks: 1 replaced/.test(text) || /replaced/.test(refusal),
        (text || refusal).slice(0, 200));
      await shot(c, 'commit-replace');
    }

    await drain(c);
  });

  const bad = rows.filter((r) => !r.pass);
  console.log(`\n${rows.length - bad.length}/${rows.length} checks passed`);
  if (bad.length) { for (const b of bad) console.log(`  FAIL ${b.id} ${b.what} — ${b.detail}`); }
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
