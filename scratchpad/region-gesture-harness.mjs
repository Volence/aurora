/**
 * REGION PAINTING, ON SCREEN, THROUGH A REAL MOUSE — editor spec §7 row 8's
 * second named gate: "a CDP drag harness asserting one `set-regions` command
 * per gesture".
 *
 *   VITE_AURORA_DEBUG=1 npm run build   # or there is no window.__dbg
 *   npm run harness:region-gesture
 *
 * FROM A LINKED WORKTREE you need all three, and the run PRINTS which tree
 * answered on its `root:` / `pinned:` / `in-tree:` lines — read them:
 *
 *   VITE_AURORA_DEBUG=1 npm run build
 *   ELECTRON_BIN=<main checkout>/node_modules/.bin/electron
 *   AURORA_BUILT_TREE=<this worktree>
 *
 * ELECTRON_BIN alone silently measures the MAIN checkout's dist/ while every
 * path in the output looks right.
 *
 * ═══ WHY THIS EXISTS, STATED AGAINST THE TEST THAT ALREADY PASSES ═════════
 *
 * Step 8B shipped `map-region-wiring.test.ts`, and that file is a SOURCE SCAN:
 * it asserts `MapViewport` NAMES the gesture entry points and passes the real
 * zoom. It says so itself. A listener that never attached, a branch nothing
 * reaches, a repaint that never fires and a canvas that throws all read as
 * PASS under it. So the whole of step 8B's behaviour is, before this file,
 * unmeasured — and it is unmeasured in the way that looks measured, which is
 * the worse of the two.
 *
 * ═══ THE PROPERTY, AND WHY THE CARVE IS THE ROW THAT MATTERS ══════════════
 *
 * §3.3: one gesture is ONE `SetRegionsCommand`, so a drag that splits three
 * rectangles is ONE undo step. A DRAW ON EMPTY GROUND would satisfy a naive
 * implementation trivially — one rectangle in, one command out — so it cannot
 * discriminate. A GESTURE THAT CARVES CAN: it rewrites several `regions[]`
 * entries at once, and an implementation that pushed one command per rewritten
 * entry would pass every draw row and fail only here.
 *
 * ⚠ THE GESTURE THESE ROWS PERFORM IS A **MOVE**, NOT A DRAW, AND THAT IS
 * STATED BECAUSE THE FIRST VERSION OF THIS FILE CALLED IT A DRAW. The press
 * lands inside the SELECTED region's rectangle, and §3.2's amended table says
 * that is a move. It still carves — the moved rectangle trims everything it
 * lands on and leaves UNASSIGNED ground behind, which is why `night` comes out
 * as two entries — so it is a legitimate and in fact HARDER subject than a
 * draw: more entries are rewritten in the one command. But the rows must say
 * which gesture they drove, or a later reader takes this file as proof about a
 * gesture it never performed. Row 6b pins the identity by asserting the
 * selected region's own rectangle MOVED.
 *
 * Rows 6b/6c/6e are therefore the point of this file: they prove the gesture
 * was a move, that it really carved, and that it cost exactly one undo step.
 *
 * HOW "ONE STEP" IS MEASURED, since `__dbg.canUndo()` is a BOOLEAN and not a
 * depth: the document is seeded to a known JSON, the gesture is performed, the
 * document is asserted CHANGED, then ONE Ctrl+Z must return it to the seeded
 * bytes EXACTLY. Two commands would leave a partial document after one undo;
 * zero commands would never have changed it in the first place, which is why
 * the CHANGED assertion is a separate row and not folded in.
 *
 * ═══ THE AIM: INTEGER CLIENT PIXELS, BECAUSE dpr VARIES ON THIS BOX ═══════
 *
 * Xvfb has been observed inferring a device scale factor of both 1 and 1.35
 * hours apart in the same session. At 1.35 the canvas rect is FRACTIONAL, a
 * mouse event aimed at `rect.top + N` asks for a position that is not on the
 * device pixel grid, CDP delivers the nearest integer, and the app correctly
 * resolves a coordinate one lower. It presents as an off-by-one in the feature
 * and the feature is fine. So every aim below is rounded to an integer client
 * pixel FIRST, and row 3 prints dpr, the rect and the aim so the environment is
 * visible in the output beside the verdicts.
 *
 * ⚠ AND NO ROW HERE ASSERTS A WORLD COORDINATE, deliberately. Converting an aim
 * to world pixels in this file would mean re-implementing `screenToWorld`, and
 * an expectation copied out of the code under test is not an expectation — it
 * agrees with the app by construction, including when both are wrong. Every
 * assertion below is about the DOCUMENT (did it change, was it restored
 * exactly), which needs no coordinate arithmetic on this side at all. That is
 * why the dpr hazard is reduced to "aim at an integer and say what you aimed
 * at" rather than needing a derivation chain.
 *
 * ⚠ AND NO CLAIM HERE IS STITCHED FROM TWO RUNS. dpr can differ between runs,
 * so two rows read out of two runs can be self-consistent and wrong. Every row
 * takes its evidence from the run it is printed in.
 *
 * NO EMULATOR. Nothing here touches oracle or any ROM.
 */

import {
  session, mouse, key, sleep, shot, RUN,
} from './canvas-cdp-harness.mjs';
import { siblingPathOrUnresolved } from '../test/support/sibling-root.mjs';
import { readFileSync } from 'node:fs';

const AEONDIR = siblingPathOrUnresolved('aeon');
const ROOT = RUN.root;

// ── WHAT THE APP DECLARES, PARSED FROM SOURCE, NEVER RETYPED HERE ─────────
//
// A harness that typed `'region'` or `'g'` would go green on its own copy the
// day the tool or its letter moved — which is exactly the day somebody needs
// to know. Same reason `regions-facet-harness.mjs` parses FACET_TOOLS.
function declaredTools(facet) {
  const src = readFileSync(`${ROOT}/src/renderer/workspace/facet-tools.ts`, 'utf8');
  const m = src.match(new RegExp(`^\\s*${facet}:\\s*\\[([^\\]]*)\\]`, 'm'));
  if (!m) throw new Error(`CANNOT MEASURE: FACET_TOOLS.${facet} not found`);
  const ids = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (ids.length === 0) throw new Error(`CANNOT MEASURE: FACET_TOOLS.${facet} parsed to nothing`);
  return ids;
}
function declaredKey(tool) {
  const src = readFileSync(`${ROOT}/src/renderer/workspace/tool-meta.ts`, 'utf8');
  const m = src.match(new RegExp(`['"]?${tool}['"]?\\s*:\\s*'([a-z])'`));
  if (!m) throw new Error(`CANNOT MEASURE: TOOL_KEYS.${tool} not found`);
  return m[1];
}

const REGION_TOOLS = declaredTools('regions');
const REGION_TOOL = REGION_TOOLS.find((t) => t !== 'view');
if (!REGION_TOOL) throw new Error('CANNOT MEASURE: the regions facet declares no tool but view');
const REGION_KEY = declaredKey(REGION_TOOL);

// The refusal sentence is the MODULE's, read rather than retyped: the property
// is "these words reached the screen", and a copy here would pass against a
// toast saying something else entirely.
function moduleSentence(name) {
  const src = readFileSync(`${ROOT}/src/renderer/components/map-region-gesture.ts`, 'utf8');
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*([\\s\\S]*?);\\n`));
  if (!m) throw new Error(`CANNOT MEASURE: ${name} not found`);
  const parts = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"));
  if (parts.length === 0) throw new Error(`CANNOT MEASURE: ${name} parsed to nothing`);
  return parts.join('');
}
const NO_SELECTION_ADVICE = moduleSentence('NO_SELECTION_ADVICE');

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

// ── The seed. Two regions tiling the act, so there is something to carve. ──
function seedFor(actId, gridW, gridH) {
  const W = gridW * 2048;
  const H = gridH * 2048;
  const half = Math.floor(W / 2 / 16) * 16;
  return {
    schema: 1,
    act: actId,
    regions: [
      { id: 'forest', name: 'Forest', preset: 'OJZ_Preset_Sec1', rect: { x: 0, y: 0, w: half, h: H } },
      { id: 'night', name: 'Night', preset: 'OJZ_Preset_Night', rect: { x: half, y: 0, w: W - half, h: H } },
    ],
  };
}

async function seed(c, doc) {
  const r = await c.json(`window.__dbg.aeon.setRegions(${JSON.stringify(JSON.stringify(doc))})`);
  await sleep(400);
  return r;
}
const docNow = (c) => c.json('window.__dbg.aeon.regionsDocument()');

// Toasts from the app's OWN store, never a DOM class scrape. A scrape guesses
// at class names, and when it guesses wrong it returns [] -- which reads as "no
// toast was shown" when it means "I could not look". Same family as a `[ -S
// socket ]` reporting a corpse as a server.
const TOASTS = 'window.__dbg.aeon.toasts()';

async function main() {
  await session('region gestures through a real mouse', async (c) => {
    // ── 0. The build under test actually carries this parcel ──────────────
    const probes = await c.json(`({
      setRegions: typeof window.__dbg.aeon.setRegions === 'function',
      regions: typeof window.__dbg.aeon.regions === 'function',
      regionsDocument: typeof window.__dbg.aeon.regionsDocument === 'function',
      canUndo: typeof window.__dbg.aeon.canUndo === 'function',
      view: typeof window.__dbg.view === 'function',
      setView: typeof window.__dbg.setView === 'function'
    })`);
    check('0a', 'ANTI-VACUOUS: the build under test carries every probe these rows need',
      Object.values(probes).every(Boolean),
      `${RUN.root}/dist — ${JSON.stringify(probes)}; a stale build would measure the previous parcel`);
    if (!Object.values(probes).every(Boolean)) {
      throw new Error('wrong build — VITE_AURORA_DEBUG=1 npm run build');
    }

    note('parsed from source, nothing retyped in this file:',
      `FACET_TOOLS.regions=${JSON.stringify(REGION_TOOLS)} tool=${REGION_TOOL} key=${REGION_KEY}`);

    // ── 1. The project ────────────────────────────────────────────────────
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
    await sleep(2000);

    // ── 2. The tool exists and can be armed ───────────────────────────────
    const facet = await c.json('window.__dbg.aeon.setFacet("regions")');
    await sleep(600);
    check('2a', 'arriving on the regions facet lands on a pure pan, not an armed drawing tool',
      facet && facet.tool === REGION_TOOLS[0],
      `setFacet('regions') -> ${JSON.stringify(facet)}; FACET_TOOLS.regions[0] = ${REGION_TOOLS[0]}`);

    await key(c, REGION_KEY, `Key${REGION_KEY.toUpperCase()}`, REGION_KEY.toUpperCase().charCodeAt(0), 0);
    await sleep(500);
    const armed = await c.json('window.__dbg.aeon.state()');
    check('2b', `the '${REGION_KEY}' key arms the ${REGION_TOOL} tool on this facet`,
      armed && armed.tool === REGION_TOOL,
      `after key '${REGION_KEY}': tool = ${JSON.stringify(armed?.tool)}`);

    // ── 3. The environment, printed beside the verdicts ───────────────────
    const env = await c.json(`(() => {
      const cv = document.querySelector('canvas');
      const r = cv ? cv.getBoundingClientRect() : null;
      return { dpr: window.devicePixelRatio, rect: r ? {
        left: r.left, top: r.top, width: r.width, height: r.height } : null };
    })()`);
    check('3a', 'ANTI-VACUOUS: there is a map canvas with a non-zero box to aim at',
      !!(env.rect && env.rect.width > 10 && env.rect.height > 10), JSON.stringify(env));
    if (!env.rect) throw new Error('no canvas to aim at');
    note('ENVIRONMENT (read this beside every row below):',
      `devicePixelRatio=${env.dpr} canvasRect=${JSON.stringify(env.rect)}`);

    // Every aim is an INTEGER client pixel, chosen before anything is derived.
    const aim = (fx, fy) => ({
      x: Math.round(env.rect.left + env.rect.width * fx),
      y: Math.round(env.rect.top + env.rect.height * fy),
    });

    // ── 4. A draw at a zoom that is NOT 1 ─────────────────────────────────
    //
    // ZOOM != 1 ON PURPOSE. The grab band is SCREEN pixels divided by the zoom,
    // and `map-region-wiring.test.ts` can only see that MapViewport NAMES the
    // zoom -- not that the value reaching the layer is the live one. At zoom 1
    // a hard-coded 1 and the real zoom are the same number and no row could
    // tell them apart. Every gesture row below runs at this zoom.
    const ZOOM = 0.5;
    await c.evalExpr(`window.__dbg.setView(0, 0, ${ZOOM})`);
    await sleep(700);
    const view = await c.json('window.__dbg.view()');
    check('4a', `ANTI-VACUOUS: the viewport really is at zoom ${ZOOM}, not 1`,
      view && Math.abs(view.zoom - ZOOM) < 1e-6,
      `view() -> ${JSON.stringify(view)} — at zoom 1 a hard-coded 1 and the live zoom are indistinguishable`);

    const seeded = seedFor(st.actId ?? 'act1', st.gridWidth, st.gridHeight);
    const seedRes = await seed(c, seeded);
    const before = await docNow(c);
    check('4b', 'ANTI-VACUOUS: the seed is in the app, with the two regions the carve needs',
      !!(before && before.regions && before.regions.length === 2),
      `setRegions -> ${JSON.stringify(seedRes)}; document now ${JSON.stringify(before?.regions?.map((r) => r.id))}`);
    if (!before) { throw new Error('seed did not take'); }
    const beforeJSON = JSON.stringify(before);

    // ── A PICTURE FRAMED ON THE BOUNDARY, for the owner's palette question ──
    //
    // Every other capture in this file is panned so ONE region fills the view,
    // which cannot answer the question 8A left open: how far apart two adjacent
    // regions' hues actually read. The seed is two clean halves meeting at
    // x = half, so this is the one moment in the run where the boundary is a
    // straight line with a different region on each side. Taken BEFORE any
    // gesture, because after the carve the shapes are no longer comparable.
    const BOUNDARY_X = Math.floor(seeded.regions[1].rect.x);
    const BZOOM = 0.25;
    // ⚠ `setView(x, ...)` sets the viewport's TOP-LEFT corner, not its centre.
    // The first version passed BOUNDARY_X straight in and captured a view whose
    // LEFT EDGE was the seam -- one region filling the screen, which is the one
    // thing this capture must not be. Half a screen of world pixels back.
    const halfSpan = (env.rect.width / BZOOM) / 2;
    await c.evalExpr(`window.__dbg.setView(${Math.round(BOUNDARY_X - halfSpan)}, 1200, ${BZOOM})`);
    await sleep(900);
    const bview = await c.json('window.__dbg.view()');
    // AND THE ROW NOW CHECKS THE THING IT CLAIMS. The first version asserted
    // only the ZOOM, so it passed green over a capture with no seam in it at
    // all -- a guard aimed at the wrong observable, which planting a violation
    // would never have revealed. This asserts the seam lies strictly INSIDE the
    // visible world span, which is what "framed on the seam" means.
    const spanW = env.rect.width / BZOOM;
    const seamOnScreen = !!bview
      && bview.x < BOUNDARY_X && BOUNDARY_X < bview.x + spanW;
    check('4d', 'ANTI-VACUOUS: the boundary capture really has the seam ON SCREEN',
      seamOnScreen,
      `view() -> ${JSON.stringify(bview)}; visible world x spans `
      + `${Math.round(bview?.x ?? 0)}..${Math.round((bview?.x ?? 0) + spanW)}; seam at x=${BOUNDARY_X}`);
    await shot(c, 'region-hue-pair-at-the-boundary');
    await c.evalExpr(`window.__dbg.setView(0, 0, ${ZOOM})`);
    await sleep(700);

    // ── 5. THE REFUSAL ARM, FIRST, because "nothing selected" is where the
    //    app STARTS and needs no way to un-select ─────────────────────────
    //
    // A draw with no selection mints an id the document has no preset for, and
    // the layer refuses it. The property is that the refusal REACHES THE
    // AUTHOR: a gesture silently dropped is the failure this arm exists for.
    //
    // ⚠ THIS RAN AFTER THE CARVE IN THE FIRST VERSION OF THIS FILE AND WENT
    // UNMEASURABLE -- clicking the act row does not clear `selectedRegionId`,
    // so the arm was never entered. Moving it BEFORE the selection is not a
    // workaround: the un-selected state is the one an author is in the first
    // time they arm the tool, which makes this the honest place to test it.
    const sel0 = await c.json('window.__dbg.aeon.regions()');
    if (sel0 && sel0.selectedRegionId !== null) {
      unmeasurable('5a', 'a draw with NO region selected is refused, and says why',
        `the app did not start un-selected (selectedRegionId = ${JSON.stringify(sel0.selectedRegionId)}), `
        + 'so this arm was never entered. NOT a pass and NOT a failure of the refusal.');
    } else {
      const preRefusal = JSON.stringify(await docNow(c));
      const p0 = aim(0.20, 0.30); const q0 = aim(0.35, 0.50);
      await mouse(c, 'mousePressed', p0.x, p0.y);
      await sleep(120);
      await mouse(c, 'mouseMoved', q0.x, q0.y, { buttons: 1 });
      await sleep(120);
      await mouse(c, 'mouseReleased', q0.x, q0.y, { buttons: 0 });
      await sleep(900);
      const postRefusal = JSON.stringify(await docNow(c));
      check('5a', 'a draw with no region selected leaves the document UNCHANGED',
        postRefusal === preRefusal, 'a refused gesture must not half-apply');
      const toasts = await c.json(TOASTS);
      // ⚠ THE FIELD IS `message`. This read `.text` in the first version and
      // every toast mapped to '' -- so the row FAILED while the app was doing
      // exactly the right thing, and the printed detail (which dumps the raw
      // toasts) is the only reason that took one run to see rather than a
      // debugging session. A matcher that silently yields '' is the same defect
      // class as one loose enough to match a neighbouring error: both report on
      // something other than the property. Keep the raw dump in the detail.
      const said = (toasts ?? [])
        .map((t) => (typeof t === 'string' ? t : t?.message ?? t?.text ?? '')).join(' | ');
      // The WHOLE advice sentence, not a slice: a prefix match would survive the
      // sentence being truncated on screen, which is the failure an author meets.
      check('5b', "and the refusal REACHES THE AUTHOR, in the module's own words",
        said.includes(NO_SELECTION_ADVICE),
        `toasts: ${JSON.stringify(toasts)}\n        expected to contain, verbatim: `
        + `${JSON.stringify(NO_SELECTION_ADVICE)}`);
      check('5c', 'and it is the LAYER\'s own reason, not a sentence this module invented',
        said.includes('needs a preset'),
        'the refusal must carry why the layer refused, not only what to do next');
      await shot(c, 'region-draw-refused');
    }

    // Select `forest` through the PANEL's own row, the way an author does.
    await c.evalExpr(`(() => { const el = document.getElementById('region-row-forest');
      if (el) el.dispatchEvent(new MouseEvent('click', { bubbles: true })); })()`);
    await sleep(500);
    const sel = await c.json('window.__dbg.aeon.regions()');
    check('4c', 'ANTI-VACUOUS: clicking the panel row actually selected a region',
      sel && sel.selectedRegionId === 'forest',
      `regions() -> selectedRegionId = ${JSON.stringify(sel?.selectedRegionId)} (a draw with no `
      + 'selection is REFUSED, so every draw row below would measure the refusal instead)');

    // ── 5. THE CARVE: the row this file exists for ────────────────────────
    //
    // Drag a rectangle in the middle of the act. It lands across `night`, which
    // is the region NOT selected, so the Q1 ruling's carve applies: night is
    // trimmed and may be split into several entries, and forest gains the area.
    const a = aim(0.55, 0.35);
    const b = aim(0.80, 0.65);
    // The aim is printed, NOT the world coordinates it resolves to: converting
    // here would mean re-implementing `screenToWorld` in the harness, and an
    // expectation copied out of the code under test is not an expectation.
    note('aim (INTEGER client px, chosen before anything was derived):',
      `press=${JSON.stringify(a)} release=${JSON.stringify(b)} at zoom ${ZOOM}`);

    await mouse(c, 'mousePressed', a.x, a.y);
    await sleep(120);
    await mouse(c, 'mouseMoved', Math.round((a.x + b.x) / 2), Math.round((a.y + b.y) / 2), { buttons: 1 });
    await sleep(120);
    await mouse(c, 'mouseMoved', b.x, b.y, { buttons: 1 });
    await sleep(120);
    await mouse(c, 'mouseReleased', b.x, b.y, { buttons: 0 });
    await sleep(900);

    const after = await docNow(c);
    const afterJSON = JSON.stringify(after);
    check('6a', 'a real mouse drag CHANGED the regions document',
      afterJSON !== beforeJSON,
      `entries ${before.regions.length} -> ${after?.regions?.length}; `
      + 'a zero-command gesture and a broken listener both leave this unchanged');

    const nightEntries = (after?.regions ?? []).filter((r) => r.id === 'night').length;
    const forestEntries = (after?.regions ?? []).filter((r) => r.id === 'forest').length;
    const forestBefore = before.regions.find((r) => r.id === 'forest').rect;
    const forestAfter = (after?.regions ?? []).find((r) => r.id === 'forest')?.rect;
    // WHICH GESTURE THIS WAS, asserted rather than assumed. The press is inside
    // the selected region, so §3.2 says MOVE; if a later change made it a draw
    // instead, every row below would still pass while this file's prose
    // described something that no longer happens.
    check('6b', 'the gesture was a MOVE of the selected region — its own rectangle travelled',
      !!(forestAfter && (forestAfter.x !== forestBefore.x || forestAfter.y !== forestBefore.y)),
      `forest rect ${JSON.stringify(forestBefore)} -> ${JSON.stringify(forestAfter)}`);
    check('6c', 'ANTI-VACUOUS: and it CARVED — another region is now several rectangles',
      nightEntries > 1,
      `forest=${forestEntries} entries, night=${nightEntries} entries, total ${after?.regions?.length}. `
      + 'A gesture that rewrote one entry would leave night at 1 and the undo row could not discriminate.');

    await shot(c, 'region-carve-on-real-art');

    // ── 5c. ONE GESTURE, ONE UNDO STEP ────────────────────────────────────
    const couldUndo = await c.json('window.__dbg.aeon.canUndo()');
    check('6d', 'ANTI-VACUOUS: the gesture put something on the focused undo stack',
      couldUndo === true, `canUndo() -> ${couldUndo}`);

    await ctrlZ(c);
    await sleep(900);
    const undone = await docNow(c);
    const undoneJSON = JSON.stringify(undone);
    check('6e', 'ONE Ctrl+Z restores the document EXACTLY — one gesture was one command',
      undoneJSON === beforeJSON,
      undoneJSON === beforeJSON
        ? `back to the seeded ${undone.regions.length} entries, byte-identical`
        : `after one undo: ${undone?.regions?.length} entries, seeded had ${before.regions.length}. `
          + 'A PARTIAL document here is the signature of a gesture that pushed more than one command.');

    // ── 7. A picture for the owner, over real level art ───────────────────
    await c.evalExpr(`window.__dbg.setView(0, 0, 1)`);
    await sleep(800);
    await shot(c, 'region-overlay-over-real-art-zoom1');
    await c.evalExpr(`window.__dbg.setView(0, 0, 2)`);
    await sleep(800);
    await shot(c, 'region-overlay-over-real-art-zoom2');
    note('captures written for the owner\'s eye:', 'shots-* — the hatch density, the label plate, '
      + 'and the orange/screen-frame pair are HIS call, not this harness\'s');
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
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exitCode = 1; });
