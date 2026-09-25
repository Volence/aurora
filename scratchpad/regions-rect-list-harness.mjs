/**
 * THE PER-RECTANGLE LIST, ON SCREEN, THROUGH A REAL MOUSE AND KEYBOARD —
 * editor spec §3.4's `rects #1 x … y … w … h … [Fit to 16]` row, ROADMAP §5.1
 * row 206 item 1. Node rows: `test/renderer/regions-rect-list.test.ts`.
 *
 *   VITE_AURORA_DEBUG=1 npm run build   # or there is no window.__dbg
 *   npm run harness:regions-rect-list
 *
 * FROM A LINKED WORKTREE you need all three, and the run PRINTS which tree
 * answered on its `root:` / `pinned:` lines — read them:
 *
 *   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
 *   AURORA_BUILT_TREE=<this worktree>
 *   AEON_DIR=<a fresh COPY of aeon>     # this file seeds a regions document
 *
 * ═══ WHAT THE NODE SUITE CANNOT SEE, AND THEREFORE WHAT THIS FILE IS FOR ═══
 *
 * The node rows prove the derivation lists every entry and that a command built
 * for entry 2 writes entry 2. They cannot prove the PANEL renders one row per
 * entry, that the field beside `#2` is wired to entry 2 rather than to entry 1
 * (the exact defect this list replaced: the old four fields resolved the id's
 * FIRST entry), or that a real click on Fit and Delete reaches the gesture
 * layer and costs one undo step. Those are this file's rows.
 *
 * ═══ EVERY EXPECTATION IS READ FROM THE DOCUMENT, NEVER RETYPED ═══════════
 *
 * The seed is built here, but every assertion compares the panel against the
 * document READ BACK from the app (`__dbg.aeon.regionsDocument()`), and the
 * removal sentence's fixed words are parsed out of the module's source. No
 * world coordinate is derived from a screen aim.
 *
 * ═══ REAL INPUT ONLY ═════════════════════════════════════════════════════
 *
 * Every click is `Input.dispatchMouseEvent` at an element's integer centre and
 * every keystroke is `Input.insertText` / `dispatchKeyEvent`. `scrollIntoView`
 * is the one DOM call, and it moves the panel, not the app's state. No
 * `.click()` and no synthetic `MouseEvent` (region-gesture-harness.mjs still
 * selects its row with a synthetic one; this file does not).
 *
 * NO EMULATOR. Nothing here touches oracle or any ROM.
 */

import {
  session, mouse, key, sleep, shot, typeText, RUN,
} from './canvas-cdp-harness.mjs';
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync } from 'node:fs';

const AEONDIR = siblingPathOrUnresolved('aeon');
const ROOT = RUN.root;

// ── The removal sentence's fixed words, parsed from the module ─────────────
function removedSentenceFragments() {
  const src = readFileSync(`${ROOT}/src/renderer/providers/regions-rect-list.ts`, 'utf8');
  const m = src.match(/export function regionsRemovedSentence[\s\S]*?\n}\n/);
  if (!m) throw new Error('CANNOT MEASURE: regionsRemovedSentence not found');
  const a = m[0].match(/\} had no rectangle left and \$\{/);
  const b = m[0].match(/'(removed\. Ctrl\+Z undoes the whole gesture\.)'/);
  if (!a || !b) throw new Error('CANNOT MEASURE: regionsRemovedSentence fixed words not found');
  return [' had no rectangle left and ', b[1]];
}
const REMOVED_WORDS = removedSentenceFragments();

// ── Reporting ─────────────────────────────────────────────────────────────
const results = [];
const fails = [];
const unmeasured = [];
function check(id, name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${id}] ${name}${detail !== undefined ? `\n        ${detail}` : ''}`);
  results.push({ id, name, ok });
  if (!ok) fails.push(`[${id}] ${name}`);
}
function unmeasurable(id, name, why) {
  console.log(`UNMEASURABLE  [${id}] ${name}\n        ${why}`);
  results.push({ id, name, ok: null });
  unmeasured.push(`[${id}] ${name}: ${why}`);
}
function note(label, detail) { console.log(`        [note] ${label} ${detail ?? ''}`); }

const ctrlZ = (c) => key(c, 'z', 'KeyZ', 90, 2);
const docNow = (c) => c.json('window.__dbg.aeon.regionsDocument()');

/** Integer centre of the first element matching `sel`, scrolled into view first. */
async function centreOf(c, sel) {
  return c.json(`(() => {
    const e = document.querySelector(${JSON.stringify(sel)});
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const b = e.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return { zero: true };
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  })()`);
}
/** A REAL left click at an element's centre. Returns false when it is not on screen. */
async function realClick(c, sel) {
  const p = await centreOf(c, sel);
  if (!p || p.zero) return false;
  await mouse(c, 'mousePressed', p.x, p.y);
  await sleep(60);
  await mouse(c, 'mouseReleased', p.x, p.y, { buttons: 0 });
  await sleep(400);
  return true;
}

/** What the panel shows for one region's rect list, read from the DOM. */
function panelRectRows(c, id) {
  return c.json(`(() => {
    const box = document.querySelector('[data-region-rects-of="${id}"]');
    if (!box) return null;
    return [...box.querySelectorAll('[data-region-rect-row]')].map((row) => {
      const b = row.getBoundingClientRect();
      const val = (k) => {
        const i = row.querySelector('[data-rect-field="' + k + '"] input');
        return i ? Number(i.value) : null;
      };
      return {
        n: Number(row.getAttribute('data-region-rect-row')),
        entry: Number(row.getAttribute('data-entry-index')),
        rect: { x: val('x'), y: val('y'), w: val('w'), h: val('h') },
        fit: !!row.querySelector('[data-rect-fit]'),
        del: !!row.querySelector('[data-rect-delete]'),
        visible: b.width > 0 && b.height > 0,
      };
    });
  })()`);
}

function entriesOf(doc, id) {
  const out = [];
  (doc?.regions ?? []).forEach((r, i) => { if (r.id === id) out.push({ entry: i, rect: r.rect }); });
  return out;
}
const onGrid = (v) => v % 16 === 0;
function overlapAny(doc) {
  const rs = doc?.regions ?? [];
  for (let i = 0; i < rs.length; i += 1) {
    for (let j = i + 1; j < rs.length; j += 1) {
      const a = rs[i].rect; const b = rs[j].rect;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        return `${rs[i].id}#${i} x ${rs[j].id}#${j}`;
      }
    }
  }
  return null;
}

// ── The seed: forest is TWO entries with night BETWEEN them in the file ────
//
// forest#1 | night | forest#2, tiling the act. The night/forest#2 seam sits
// 4 px past a 16 px line, so forest#2's LEFT edge is off the grid and Fit
// moves it to the nearest line, 4 px LEFT, into night — the carve Fit must do.
// forest#1 is wholly on the grid, so it must offer no Fit.
function seedFor(actId, gridW, gridH) {
  const W = gridW * 2048;
  const H = gridH * 2048;
  const a = Math.floor(W / 3 / 16) * 16;
  const seam = Math.floor((2 * W) / 3 / 16) * 16 + 4;
  return {
    schema: 1,
    act: actId,
    regions: [
      { id: 'forest', name: 'Forest', preset: 'OJZ_Preset_Sec1', rect: { x: 0, y: 0, w: a, h: H } },
      { id: 'night', name: 'Night', preset: 'OJZ_Preset_Night', rect: { x: a, y: 0, w: seam - a, h: H } },
      { id: 'forest', name: 'Forest', preset: 'OJZ_Preset_Sec1', rect: { x: seam, y: 0, w: W - seam, h: H } },
    ],
  };
}

async function main() {
  await session('the per-rectangle list through real input', async (c) => {
    // ── 0. The build carries this parcel ────────────────────────────────
    const probes = await c.json(`({
      setRegions: typeof window.__dbg?.aeon?.setRegions === 'function',
      regions: typeof window.__dbg?.aeon?.regions === 'function',
      regionsDocument: typeof window.__dbg?.aeon?.regionsDocument === 'function',
      toasts: typeof window.__dbg?.aeon?.toasts === 'function',
      canUndo: typeof window.__dbg?.aeon?.canUndo === 'function',
    })`);
    check('0a', 'ANTI-VACUOUS: the build under test carries every probe these rows need',
      Object.values(probes).every(Boolean), `${RUN.root}/dist: ${JSON.stringify(probes)}`);
    if (!Object.values(probes).every(Boolean)) throw new Error('wrong build: VITE_AURORA_DEBUG=1 npm run build');

    // ── 1. The project and the facet ────────────────────────────────────
    note('aeon checkout under test:', AEONDIR);
    await c.evalExpr(`window.__dbg.aeon.open(${JSON.stringify(AEONDIR)})`)
      .catch((e) => console.log('        aeon open threw:', e.message));
    let st = null;
    for (let i = 0; i < 40; i++) {
      st = await c.json('window.__dbg.aeon.state()').catch(() => null);
      if (st && st.open) break;
      await sleep(400);
    }
    check('1a', 'ANTI-VACUOUS: the aeon project is open with a section grid',
      !!(st && st.open && st.gridWidth > 0 && st.gridHeight > 0), JSON.stringify(st));
    if (!st || !st.open) throw new Error('aeon did not open');
    await sleep(1500);
    await c.json('window.__dbg.aeon.setFacet("regions")');
    await sleep(600);

    const seeded = seedFor(st.actId ?? 'act1', st.gridWidth, st.gridHeight);
    const seedRes = await c.json(`window.__dbg.aeon.setRegions(${JSON.stringify(JSON.stringify(seeded))})`);
    await sleep(500);
    const before = await docNow(c);
    const beforeJSON = JSON.stringify(before);
    const forestBefore = entriesOf(before, 'forest');
    check('1b', 'ANTI-VACUOUS: the seed is in the app, forest as TWO entries with night between them',
      forestBefore.length === 2 && forestBefore[0].entry === 0 && forestBefore[1].entry === 2,
      `setRegions -> ${JSON.stringify(seedRes)}; ids in order ${JSON.stringify(before?.regions?.map((r) => r.id))}`);
    if (forestBefore.length !== 2) throw new Error('seed did not take');

    // ── 2. Select forest with a REAL click on its list row ──────────────
    const clicked = await realClick(c, '#region-row-forest');
    const sel = await c.json('window.__dbg.aeon.regions()');
    check('2a', 'a real click on the list row selects the region',
      clicked && sel?.selectedRegionId === 'forest',
      `clicked=${clicked}; selectedRegionId = ${JSON.stringify(sel?.selectedRegionId)}`);

    // ── 3. The list: one row per ENTRY, each showing ITS entry's numbers ─
    const rows = await panelRectRows(c, 'forest');
    check('3a', 'the detail pane lists one row per forest ENTRY, numbered #1..#N',
      Array.isArray(rows) && rows.length === forestBefore.length
        && rows.every((r, i) => r.n === i + 1 && r.visible),
      `panel rows ${JSON.stringify(rows?.map((r) => ({ n: r.n, entry: r.entry, visible: r.visible })))}; `
      + `document has ${forestBefore.length} forest entries`);
    check('3b', 'each row is addressed to its own document entry, in document order',
      Array.isArray(rows) && rows.map((r) => r.entry).join() === forestBefore.map((e) => e.entry).join(),
      `panel entries ${JSON.stringify(rows?.map((r) => r.entry))} vs document ${JSON.stringify(forestBefore.map((e) => e.entry))}`);
    check('3c', "each row's four fields show ITS entry's rectangle (row #2 is not rectangle 1)",
      Array.isArray(rows) && rows.every((r, i) => JSON.stringify(r.rect) === JSON.stringify({
        x: forestBefore[i].rect.x, y: forestBefore[i].rect.y, w: forestBefore[i].rect.w, h: forestBefore[i].rect.h,
      })) && JSON.stringify(rows[1].rect) !== JSON.stringify(rows[0].rect),
      `panel ${JSON.stringify(rows?.map((r) => r.rect))}`);
    const fitShouldBe = forestBefore.map((e) => !(onGrid(e.rect.x) && onGrid(e.rect.y)
      && onGrid(e.rect.x + e.rect.w) && onGrid(e.rect.y + e.rect.h)));
    check('3d', 'Fit to 16 is offered exactly on the rows whose rectangle is off the grid',
      Array.isArray(rows) && rows.map((r) => r.fit).join() === fitShouldBe.join() && fitShouldBe.includes(true)
        && fitShouldBe.includes(false),
      `panel fit ${JSON.stringify(rows?.map((r) => r.fit))}, from the document ${JSON.stringify(fitShouldBe)}`);
    const stopgap = await c.json('document.querySelectorAll("[data-region-rect-of]").length');
    check('3e', 'the old "these four numbers are rectangle 1" warning is gone',
      stopgap === 0, `[data-region-rect-of] nodes: ${stopgap}`);
    await shot(c, 'regions-rect-list-two-rects');

    // ── 4. Type into #2's h with a real keyboard ─────────────────────────
    const newH = forestBefore[1].rect.h - 16;
    const typedIn = await realClick(c, '[data-region-rect-row="2"] [data-rect-field="h"] input');
    await sleep(150);
    await typeText(c, String(newH));
    await sleep(500);
    const afterType = await docNow(c);
    const fAfterType = entriesOf(afterType, 'forest');
    check('4a', 'typing into #2\'s h writes document entry 2',
      typedIn && fAfterType[1]?.rect.h === newH && fAfterType[1]?.entry === 2,
      `clicked=${typedIn}; entry 2 h ${forestBefore[1].rect.h} -> ${fAfterType[1]?.rect.h}, wanted ${newH}`);
    check('4b', 'and leaves entry 0 (rectangle 1) and night byte-identical: the pre-parcel defect is absent',
      JSON.stringify(afterType?.regions?.[0]) === JSON.stringify(before.regions[0])
        && JSON.stringify(afterType?.regions?.[1]) === JSON.stringify(before.regions[1]),
      `entry 0 ${JSON.stringify(afterType?.regions?.[0]?.rect)}; entry 1 ${JSON.stringify(afterType?.regions?.[1]?.rect)}`);
    // BLUR THE FIELD BEFORE THE UNDO. The workspace's Ctrl+Z ignores a typing
    // target (LevelWorkspace's isTypingTarget), so the undo must be pressed with
    // focus OFF the input. The first run clicked the detail pane's CENTRE, which
    // lands on one of its own controls and left focus in a field; the list row
    // is a plain card, and clicking forest again selects what is selected.
    await realClick(c, '#region-row-forest');
    const focusNow = await c.json('document.activeElement ? document.activeElement.tagName : null');
    note('focus before the undo:', String(focusNow));
    await ctrlZ(c);
    await sleep(700);
    const undoType = JSON.stringify(await docNow(c));
    check('4c', 'one Ctrl+Z after the typed edit restores the seed exactly (one field, one command)',
      undoType === beforeJSON, undoType === beforeJSON ? 'byte-identical' : `now ${undoType}`);

    // ── 5. Fit to 16 with a real click ───────────────────────────────────
    // Every undo below is compared with the document JUST BEFORE its own
    // gesture, and that document is itself asserted equal to the seed, so one
    // failed undo cannot make every later row fail for its reason.
    const preFit = JSON.stringify(await docNow(c));
    check('5-', 'ANTI-VACUOUS: Fit starts from the seed', preFit === beforeJSON,
      preFit === beforeJSON ? 'byte-identical' : `starts from ${preFit}`);
    const fitClicked = await realClick(c, '[data-region-rect-row="2"] [data-rect-fit]');
    const afterFit = await docNow(c);
    const fAfterFit = entriesOf(afterFit, 'forest');
    const nightAfterFit = entriesOf(afterFit, 'night');
    const fitted = fAfterFit.find((e) => e.rect.x + e.rect.w === forestBefore[1].rect.x + forestBefore[1].rect.w);
    check('5a', 'Fit moved the off-grid edge onto the grid and left the on-grid ones alone',
      fitClicked && !!fitted && onGrid(fitted.rect.x) && fitted.rect.x !== forestBefore[1].rect.x
        && fitted.rect.y === forestBefore[1].rect.y,
      `clicked=${fitClicked}; forest ${JSON.stringify(fAfterFit.map((e) => e.rect))}`);
    check('5b', 'and, like a drag, it TRIMMED night: the set is still disjoint and night lost area',
      overlapAny(afterFit) === null && nightAfterFit.length === 1
        && nightAfterFit[0].rect.w < before.regions[1].rect.w,
      `overlap: ${overlapAny(afterFit)}; night w ${before.regions[1].rect.w} -> ${nightAfterFit[0]?.rect.w}`);
    await shot(c, 'regions-rect-list-after-fit');
    await ctrlZ(c);
    await sleep(700);
    const undoFit = JSON.stringify(await docNow(c));
    check('5c', 'one Ctrl+Z after Fit restores the document it started from exactly',
      undoFit === preFit, undoFit === preFit ? 'byte-identical' : `now ${undoFit}`);

    // ── 6. Delete one of two rectangles ──────────────────────────────────
    const preDel = JSON.stringify(await docNow(c));
    const delClicked = await realClick(c, '[data-region-rect-row="2"] [data-rect-delete]');
    const afterDel = await docNow(c);
    const fAfterDel = entriesOf(afterDel, 'forest');
    check('6a', 'Delete on #2 removes that entry only; forest keeps its first rectangle',
      delClicked && fAfterDel.length === 1
        && JSON.stringify(fAfterDel[0].rect) === JSON.stringify(forestBefore[0].rect),
      `clicked=${delClicked}; forest now ${JSON.stringify(fAfterDel.map((e) => e.rect))}`);
    const rowsAfterDel = await panelRectRows(c, 'forest');
    check('6b', 'and the panel re-lists it: one row now',
      Array.isArray(rowsAfterDel) && rowsAfterDel.length === 1,
      `panel rows ${rowsAfterDel?.length}`);
    await ctrlZ(c);
    await sleep(700);
    const undoDel = JSON.stringify(await docNow(c));
    check('6c', 'one Ctrl+Z after Delete restores the document it started from exactly',
      undoDel === preDel, undoDel === preDel ? 'byte-identical' : `now ${undoDel}`);

    // ── 7. Delete a region's LAST rectangle: it goes, and says so ────────
    await realClick(c, '#region-row-night');
    const sel2 = await c.json('window.__dbg.aeon.regions()');
    if (sel2?.selectedRegionId !== 'night') {
      unmeasurable('7a', 'deleting night\'s last rectangle removes night and says so',
        `the real click did not select night (selectedRegionId = ${JSON.stringify(sel2?.selectedRegionId)})`);
    } else {
      const preLast = JSON.stringify(await docNow(c));
      await realClick(c, '[data-region-rect-row="1"] [data-rect-delete]');
      const afterLast = await docNow(c);
      check('7a', 'deleting night\'s only rectangle removes night from the document',
        entriesOf(afterLast, 'night').length === 0 && (afterLast?.regions?.length ?? 0) === 2,
        `ids now ${JSON.stringify(afterLast?.regions?.map((r) => r.id))}`);
      const toasts = await c.json('window.__dbg.aeon.toasts()');
      const said = (toasts ?? []).map((t) => t?.message ?? '');
      const hit = said.find((m) => m.startsWith('night') && REMOVED_WORDS.every((w) => m.includes(w)));
      check('7b', 'and the removal is SAID, in the module\'s own sentence',
        !!hit, `toasts ${JSON.stringify(said)}; fixed words parsed from source ${JSON.stringify(REMOVED_WORDS)}`);
      await shot(c, 'regions-rect-list-last-rect-deleted');
      await ctrlZ(c);
      await sleep(700);
      const undoLast = JSON.stringify(await docNow(c));
      check('7c', 'one Ctrl+Z brings night back exactly',
        undoLast === preLast, undoLast === preLast ? 'byte-identical' : `now ${undoLast}`);
    }
  });

  const passed = results.filter((r) => r.ok === true).length;
  const failed = results.filter((r) => r.ok === false).length;
  console.log(`\n=== ${passed} passed, ${failed} failed, ${unmeasured.length} UNMEASURABLE `
    + `of ${results.length} rows ===`);
  if (unmeasured.length > 0) {
    console.log('UNMEASURABLE rows (NOT passes):');
    for (const u of unmeasured) console.log(`  ${u}`);
  }
  if (fails.length > 0) {
    console.log('FAILED:');
    for (const f of fails) console.log(`  ${f}`);
    process.exitCode = 1;
  }
  console.log('=== REGIONS-RECT-LIST HARNESS END ===');
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
