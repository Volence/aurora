#!/usr/bin/env node
// ⚠ IT DELETES INSIDE THE OPENED PROJECT'S `.aurora/canvas`, so `S1DISASM_DIR`
// must name a WRITABLE COPY of a populated s1disasm. There is no default: the
// guard lives in scratchpad/canvas-cdp-harness.mjs (this file's `CANVAS_DIR`
// comes from there) and refuses at import when the variable is unset or points
// at the live checkout. See docs/reviews/2026-09-03-canvas-harness-live-tree-delete.md.
//
//     cp -r <sibling>/s1disasm /tmp/s1disasm-copy
//     S1DISASM_DIR=/tmp/s1disasm-copy npm run harness:commit-collision
//
// STAGE 4: does the commit's collision toggle actually give new art collision?
//
// The node suite proves the transform and guards the wiring; neither commits
// anything. This drives the BUILT app under xvfb over CDP against real
// s1disasm data and commits the same drawing twice — once with the toggle off,
// once on — then reads the whole colind table and the appended chunk's
// solidity back out of the document.
//
// It REUSES scratchpad/canvas-cdp-harness.mjs rather than reimplementing the
// canvas/commit flow. That harness's own header records three defects that each
// produced a convincing FALSE result before being caught, so a fresh
// reimplementation would begin by re-earning trust this code already has.
//
// TWO ACTS, DELIBERATELY. The toggle has two halves and one act cannot prove
// both:
//
//   - the SOLIDITY half stamps every appended-chunk cell that names a non-zero
//     block. It fires everywhere.
//   - the SHAPE half writes $FF into colind — but ONLY for block ids inside the
//     zone's colind table. Spec §5 / CLASSIC-A4: a zone may ship more blocks
//     than its table has entries, and in ROM those ids resolve into the
//     ADJACENT zone's table, so stamping one silently changes another zone's
//     collision. `withCollision` skips them and counts them as
//     `skippedOverhang`.
//
//   GHZ IS ENTIRELY IN THAT OVERHANG: 439 blocks against a 410-entry
//   collide/GHZ.bin. Every id a commit can append there is past the end, so the
//   shape half is a NO-OP in GHZ *by design* — and the toggle's preview must
//   say BOTH halves of that: "0 will get flat ($FF)" AND that the rest were
//   skipped, with the reason (the preview used to state only the first, which
//   left the refusal quiet — the gap row 8 now guards). Session A proves that
//   refusal. Session B re-runs the same commit in SLZ (414 blocks against a
//   500-entry table) where the design permits the write, and proves $FF
//   actually lands.
//
//   THIS IS WHAT THE HARNESS USED TO GET WRONG. Its row 4 asserted "with the
//   toggle ON every new block gets the flat shape" and ran only in GHZ, so it
//   demanded exactly the write spec §5 forbids and reported 5/6 for two months.
//   The expectation was wrong, not the app.
//
//   Both zones' numbers are DERIVED at run time — the colind table length from
//   the file's byte length (decodeS1ColInd is `b.slice()`,
//   src/core/formats/classic/s1-colind.ts:9-11, and each entry is one byte, so
//   the loaded table's length IS the file's size), the block-pool size from the
//   live document. Nothing here is copied from an observed run.
//
// WHY THE SHAPE CONSTANTS ARE READ FROM SOURCE, not written here: this file
// tests WIRING — that the toggle reaches the commit — not the VALUE of $FF.
// That value is pinned in the node suite
// (src/core/art/__tests__/commit-collision.test.ts asserts FLAT_SHAPE === 0xff
// with the $FB–$FE angle-map reasoning). A second literal here would be the
// second copy of the rule that CommitPlanView's own source guard forbids.
//
// WHAT IS NOT CHECKED HERE, and why it is a finding rather than an omission:
// undoing the commit from the canvas tab undoes the DRAWING, not the commit —
// undo is per-document and the commit mutates the classic ART document while
// the canvas tab is focused (commit-cdp-harness.mjs row 4 records the same).
// Proving "the remediation is not a second undo step" therefore belongs to the
// store suite, where the composite is falsifiable; what this file can prove is
// that the toggle changes what the commit WRITES.
//
//   VITE_AURORA_DEBUG=1 npm run build && node scratchpad/commit-collision-harness.mjs

import {
  session, openProjectAndAct, openNewCanvasDialog, fillDialog,
  INSTALL, sleep, clickEl, drawArt, shot, CANVAS_DIR, ROOT, S1DIR,
} from './canvas-cdp-harness.mjs';
import { rmSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';

// --- derived constants -----------------------------------------------------

/** Read a numeric `const NAME = <n>;` out of a source file, so this harness
 *  never carries a second copy of a rule it does not own. */
function constFromSource(relPath, name) {
  const src = readFileSync(`${ROOT}/${relPath}`, 'utf8');
  const m = new RegExp(`const ${name} = (0x[0-9a-fA-F]+|\\d+);`).exec(src);
  if (!m) throw new Error(`${name} is no longer declared in ${relPath} — this harness reads it from there`);
  return Number(m[1]);
}
const FLAT_SHAPE = constFromSource('src/core/art/commit-collision.ts', 'FLAT_SHAPE');
const SOLID_ALL = constFromSource('src/core/art/commit-collision.ts', 'SOLID_ALL');
const HEX = (n) => `$${n.toString(16).toUpperCase()}`;

/** How many entries the zone's colind table has — see the header's derivation. */
const colindLength = (zone) => statSync(`${S1DIR}/collide/${zone}.bin`).size;

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
  // EVERY report line, not the one div that happens to match /collision:/. The
  // first version of this helper returned a single div and silently hid the
  // "solidity:" line, which is half of what the toggle does.
  //
  // \`k.children.length === 0\` is load-bearing: a report line is a LEAF div, and
  // without that clause the first match is the panel WRAPPER (whose first child
  // is the report block, whose textContent also starts with "tiles: "). That
  // returned every line concatenated into one string, so \`lineOf(…, 'collision:')\`
  // was null and three rows failed for a reason that had nothing to do with the
  // app.
  K.reportLines = () => {
    const host = [...document.querySelectorAll('div')].find(
      (d) => [...d.children].some((k) => k.children.length === 0 && /^tiles: /.test(k.textContent.trim())));
    if (!host) return null;
    return [...host.children].map((k) => k.textContent.replace(/\\s+/g, ' ').trim());
  };
  K.toggle = () => [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && /Give new art collision/i.test(e.textContent) && vis(e));
  K.commitChip = () => [...document.querySelectorAll('[title]')].find(
    (x) => /^Commit \\d+ chunk/.test(x.textContent.trim()));
  window.__k = K;
  return Object.keys(K).length;
})()`;

const lineOf = (lines, head) => (lines || []).find((l) => l.startsWith(head)) ?? null;
const uniq = (a) => [...new Set(a)];

/** colind for every block the document currently has. */
async function colindSnapshot(c) {
  return c.json(`(() => {
    const n = window.__dbg.classic.poolSizes().blocks;
    const out = [];
    for (let b = 0; b < n; b++) out.push(window.__dbg.classic.colindOf(b));
    return out;
  })()`);
}

/** Every cell of every chunk the commit appended, split by whether it names art.
 *
 *  Engine chunk id is the file index PLUS ONE (`appendedEngineIds`,
 *  src/renderer/agent/art-commit.ts), so a commit that grew the pool from
 *  `before` to `after` occupies engine ids before+1 .. after. */
async function appendedChunkSolidity(c, before, after) {
  return c.json(`(() => {
    const art = [], blank = [];
    for (let ch = ${before.chunks}; ch < ${after.chunks}; ch++) {
      for (let ci = 0; ci < 256; ci++) {
        const cell = window.__dbg.classic.chunkCell(ch + 1, ci);
        if (!cell) continue;
        (cell.block === 0 ? blank : art).push(cell.solidity);
      }
    }
    return { art, blank };
  })()`);
}

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
  const colindBefore = await colindSnapshot(c);
  const offLines = await c.json('window.__k.reportLines()');

  if (giveCollision) {
    const clicked = await c.evalExpr(`(() => { const t = window.__k.toggle(); if (!t) return false; t.click(); return true; })()`);
    await sleep(700);
    await c.evalExpr(K);
    if (!clicked) throw new Error('the "Give new art collision" toggle was not found');
  }
  const onLines = await c.json('window.__k.reportLines()');

  const chip = await c.evalExpr(`(() => { const e = window.__k.commitChip(); if (!e) return 'no-chip'; e.click(); return e.textContent.trim(); })()`);
  await sleep(1600);
  const after = await c.json('window.__dbg.classic.poolSizes()');
  const colindAfter = await colindSnapshot(c);
  const solidity = await appendedChunkSolidity(c, before, after);

  // The appended ids, and — separately — EVERY id whose colind became $FF,
  // wherever it sits. The second is what the preview's "N will get flat" count
  // is a claim about, and reading it whole is what makes "the toggle stamped
  // nothing anywhere" falsifiable rather than a check of four ids.
  const newIds = [];
  for (let b = before.blocks; b < after.blocks; b++) newIds.push(b);
  const newShapes = newIds.map((b) => colindAfter[b]);
  const becameFlat = colindAfter
    .map((v, b) => ({ v, b }))
    .filter(({ v, b }) => v === FLAT_SHAPE && colindBefore[b] !== FLAT_SHAPE)
    .map(({ b }) => b);

  return { before, after, offLines, onLines, chip, newIds, newShapes, becameFlat, solidity };
}

async function main() {
  clearCanvases();

  // =========================================================================
  // SESSION A — GHZ act 1: the zone whose every appendable id is past the end
  // of its colind table.
  // =========================================================================
  const ghzColind = colindLength('GHZ');
  await session('stage-4 commit collision · GHZ (colind overhang)', async (c) => {
    await openProjectAndAct(c);

    // --- A: toggle OFF — the committed art lands with no collision ---------
    const off = await commitOnce(c, { name: 'stage4-off', giveCollision: false });
    check('1', 'a commit grows the block pool',
      off.after.blocks > off.before.blocks && off.after.chunks > off.before.chunks,
      `${off.before.blocks} → ${off.after.blocks} blocks · `
      + `${off.before.chunks} → ${off.after.chunks} chunks · chip=${off.chip}`);
    check('2', 'with the toggle OFF the new art gets neither shape nor solidity',
      off.newShapes.length > 0 && off.newShapes.every((s) => s === 0)
        && off.becameFlat.length === 0
        && off.solidity.art.length > 0 && off.solidity.art.every((s) => s === 0),
      `new block colind=${JSON.stringify(off.newShapes.slice(0, 8))} · `
      + `blocks that became ${HEX(FLAT_SHAPE)} anywhere=${off.becameFlat.length} · `
      + `${off.solidity.art.length} appended art cells, solidity ${JSON.stringify(uniq(off.solidity.art))}`);
    check('3', 'and the preview said so',
      /have none/i.test(lineOf(off.offLines, 'collision:') || '')
      && /have none/i.test(lineOf(off.offLines, 'solidity:') || ''),
      JSON.stringify(off.offLines));
    await shot(c, 'stage4-off');

    // --- B: toggle ON — the solidity half fires, the shape half refuses ----
    const on = await commitOnce(c, { name: 'stage4-on', giveCollision: true });

    // The subject is the SAME kind of cell row 2 read as 0, in a chunk this
    // commit appended. Both arrays must be non-empty or the instrument saw
    // nothing — a commit that appended no art cell would pass an `every()`.
    check('4', `with the toggle ON every appended art cell becomes solid (${SOLID_ALL}); blank cells do not`,
      on.solidity.art.length > 0 && on.solidity.art.every((s) => s === SOLID_ALL)
        && on.solidity.blank.every((s) => s === 0)
        && off.solidity.art.length > 0 && off.solidity.art.every((s) => s === 0),
      `OFF: ${off.solidity.art.length} art cells ${JSON.stringify(uniq(off.solidity.art))}\n        `
      + `ON:  ${on.solidity.art.length} art cells ${JSON.stringify(uniq(on.solidity.art))}, `
      + `${on.solidity.blank.length} blank cells ${JSON.stringify(uniq(on.solidity.blank))}`);

    // THE ROW THIS FILE USED TO GET WRONG — see the header. The correct
    // outcome in GHZ is that NOTHING is stamped, anywhere in the table.
    check('5', 'and no block anywhere gets a shape — every appended id is past GHZ’s colind table (spec §5 / CLASSIC-A4)',
      on.newShapes.length > 0
        && on.newIds.every((b) => b >= ghzColind)
        && on.newShapes.every((s) => s === 0)
        && on.becameFlat.length === 0,
      `colind entries=${ghzColind} (collide/GHZ.bin) · new block ids `
      + `${on.newIds[0]}..${on.newIds[on.newIds.length - 1]}, all ≥ ${ghzColind} · `
      + `their colind=${JSON.stringify(on.newShapes.slice(0, 8))} · `
      + `blocks that became ${HEX(FLAT_SHAPE)} anywhere=${on.becameFlat.length}`);

    check('6', 'and the preview claims exactly that — 0 blocks, and the cell count it really stamped',
      new RegExp(`·\\s*${on.becameFlat.length} will get flat`).test(lineOf(on.onLines, 'collision:') || '')
        && new RegExp(`^solidity: ${on.solidity.art.length} cells? will become solid`).test(lineOf(on.onLines, 'solidity:') || '')
        && !/will get flat/.test(lineOf(on.offLines, 'collision:') || ''),
      `off=${JSON.stringify(on.offLines)}\n        on= ${JSON.stringify(on.onLines)}\n        `
      + `blocks stamped=${on.becameFlat.length} · cells stamped=${on.solidity.art.length}`);

    // --- C: the refusal is LOUD — the ON preview states the skip, count and
    // reason (spec §5 / CLASSIC-A4: "must refuse or warn loudly, not proceed
    // quietly"). The expected count is DERIVED from the same screen: in GHZ the
    // toggle stamps 0 blocks (row 5), so the skip count is exactly the OFF
    // preview's "N have none". Anti-vacuous on purpose: N must parse and be
    // nonzero, and the line itself must be FOUND before any regex runs — an
    // absent line is a null here, never a lax match. The OFF preview must NOT
    // carry the line: nothing is being skipped when nothing is being stamped.
    const haveNone = /(\d+) have none/.exec(lineOf(on.offLines, 'collision:') || '');
    const skipLine = lineOf(on.onLines, 'skipped:');
    check('8', 'and the ON preview states the skip — the count and the overhang reason, not just "0 will get flat"',
      !!haveNone && Number(haveNone[1]) > 0
        && skipLine !== null
        && new RegExp(`^skipped: ${haveNone[1]} blocks? keeps? no shape`).test(skipLine)
        && /past the end of this zone's collision table/.test(skipLine)
        && /adjacent zone's table/.test(skipLine)
        && lineOf(on.offLines, 'skipped:') === null,
      `have-none=${haveNone && haveNone[1]} · skipped line=${JSON.stringify(skipLine)}\n        `
      + `off carries a skipped line=${lineOf(on.offLines, 'skipped:') !== null}`);
    await shot(c, 'stage4-on');
  });

  // =========================================================================
  // SESSION B — SLZ act 1: a zone with colind headroom, where the SHAPE half
  // of the toggle is permitted to fire. A separate session rather than an act
  // switch, because switching acts with a committed, unsaved document in hand
  // means a save prompt, and this run must leave s1disasm untouched.
  // =========================================================================
  const slzColind = colindLength('SLZ');
  await session('stage-4 commit collision · SLZ (colind headroom)', async (c) => {
    await openProjectAndAct(c, { act: false });
    await c.evalExpr('window.__dbg.activate("slz", 1)');
    await sleep(4000);
    await c.evalExpr(INSTALL);

    const on = await commitOnce(c, { name: 'stage4-slz', giveCollision: true });
    check('7', `with the toggle ON every new block gets the flat shape (${HEX(FLAT_SHAPE)}), where the table has room for it`,
      on.newShapes.length > 0
        && on.newIds.every((b) => b < slzColind)
        && on.newShapes.every((s) => s === FLAT_SHAPE)
        && new RegExp(`·\\s*${on.becameFlat.length} will get flat`).test(lineOf(on.onLines, 'collision:') || '')
        && on.becameFlat.length >= on.newIds.length,
      `colind entries=${slzColind} (collide/SLZ.bin) · new block ids `
      + `${on.newIds[0]}..${on.newIds[on.newIds.length - 1]}, all < ${slzColind} · `
      + `their colind=${JSON.stringify(on.newShapes.slice(0, 8))} · `
      + `blocks that became ${HEX(FLAT_SHAPE)} anywhere=${on.becameFlat.length}\n        `
      + `on=${JSON.stringify(on.onLines)}`);
    await shot(c, 'stage4-slz');
  });

  clearCanvases();
  const passed = rows.filter((r) => r.pass).length;
  const failed = rows.filter((r) => !r.pass);
  console.log(`\n${passed}/${rows.length} rows passed`
    + (failed.length ? `\nFAILED: ${failed.map((r) => `${r.id} (${r.what})`).join('\n        ')}` : ''));
  if (passed !== rows.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

// ===========================================================================
// PLANTED DEFECTS — each was introduced into the source, the app REBUILT, the
// harness re-run, the named rows watched to FAIL, and the source restored. A
// guard nobody has seen fail is not a guard.
// ===========================================================================
//
// THERE ARE TWO COMMIT DISPATCH SITES and only one of them is what this file
// drives:
//     src/renderer/components/canvas/CommitPlanView.tsx:105   <- the UI, HERE
//     src/renderer/agent/art-commit.ts:100                    <- the agent
// A defect planted in `art-commit.ts` survives a full build-and-run cycle with
// every row still green, because the agent path is not on this harness's road.
// Grep before planting.
//
// --- PLANT A (rows 5, 6 — the overhang refusal) ---------------------------
//   FILE     src/core/art/commit-collision.ts, `withCollision`
//   CHANGE   `if (w.blockId >= colindLength) { skippedOverhang++; return w; }`
//            -> `if (false) { ... }`, i.e. stamp $FF into the overhang too —
//            the write spec §5 / CLASSIC-A4 forbids, and the write this
//            harness's OLD row 4 demanded.
//   RESULT   5/7. Row 5 FAILED:
//              "colind entries=410 (collide/GHZ.bin) · new block ids 443..444,
//               all ≥ 410 · their colind=[255,255] ·
//               blocks that became $FF anywhere=2"
//            Row 7 (SLZ) still PASSED — correctly: SLZ's ids are inside its
//            table, so this plant does not change what SLZ writes. Row 6 also
//            still passed, and that is right too: it checks the preview against
//            what the document GOT ("2 will get flat" / two blocks stamped),
//            and under this plant those two agree with each other while both
//            are wrong. Row 5 is the row that owns the rule.
//
// --- PLANT B (rows 4, 7 — the toggle is wired to the commit at all) -------
//   FILE     src/renderer/components/canvas/CommitPlanView.tsx, `apply()`
//   CHANGE   `classicCommitCanvas(effectivePlan)` -> `classicCommitCanvas(plan!)`
//            The toggle still renders, still flips, still rewrites the preview
//            — and the commit ignores it. This is the defect the harness exists
//            to catch, and it is invisible from the screen.
//   RESULT   5/7. Row 4 FAILED: "ON: 8 art cells [0]" (they must be [3]).
//            Row 7 FAILED, and its detail is the whole point:
//              "their colind=[0,0,0,0,0,0] · blocks that became $FF anywhere=0"
//              "on=[… 'collision: 0 inherited · 6 will get flat ($FF)' …]"
//            — the preview promising six stamps that the document never got.
//
// --- PLANT C (rows 2, 3, 4, 6 — the toggle's OFF state is real) -----------
//   FILE     src/renderer/components/canvas/CommitPlanView.tsx:93
//   CHANGE   `plan && giveCollision && levelDoc` -> `plan && levelDoc`, i.e.
//            the commit always assigns collision and the chip is decoration.
//   RESULT   3/7. Row 2 FAILED: "8 appended art cells, solidity [3]".
//            Row 3 FAILED: the OFF preview already read "collision: 0 inherited
//            · 0 will get flat ($FF)" / "solidity: 8 cells will become solid".
//            Row 4 FAILED on its off-baseline clause ("OFF: 8 art cells [3]") —
//            which is why that clause is inside row 4 rather than assumed.
//            Row 6 FAILED: the ON preview no longer differs from the OFF one.
//
// --- PLANT D (row 8 — the refusal is STATED, count and reason) -------------
//   FILE     src/renderer/components/canvas/canvas-commit-model.ts, `reportLines`
//   CHANGE   the `applied.skippedOverhang > 0` branch removed — i.e. exactly
//            the shipped omission row 8 was added against (open since the
//            7/7 redesign, closed 2026-08-20): `reportLines` took a
//            `{blocks, cells}` projection of `applied`, so the refusal
//            happened, the agent reply carried the count, and the artist's
//            preview said only "0 will get flat ($FF)" — a quiet refusal where
//            CLASSIC-A4 demands a loud one.
//   RESULT   7/8. Row 8 FAILED:
//              "have-none=2 · skipped line=null
//               off carries a skipped line=false"
//            Rows 1–7 all still PASSED — correctly: the refusal itself (row 5)
//            and the stamped-count agreement (row 6) are untouched; the LINE is
//            the only thing row 8 owns. Restored, rebuilt: 8/8, the ON preview
//            carrying
//              "skipped: 2 blocks keep no shape — their ids are past the end
//               of this zone's collision table; in ROM those entries resolve
//               into the adjacent zone's table, so stamping one changes other
//               blocks' in-game collision"
//            and row 7's SLZ dump showing NO skipped line where nothing was
//            skipped — the zero case stays noise-free.
//
// NOT PLANTED: row 1 (a commit grows the block pool). It is the pre-existing
// setup row; every other row reads the range it reports, so a commit that did
// not happen empties `newIds`/`solidity.art` and rows 2, 4, 5 and 7 all fail on
// their explicit non-empty clauses.
