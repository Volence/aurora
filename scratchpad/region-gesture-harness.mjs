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
      regionOverlayReport: typeof window.__dbg.aeon.regionOverlayReport === 'function',
      setOverlay: typeof window.__dbg.setOverlay === 'function',
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


    // ══ 7. THE TOGGLE — the owner's answer, and the only rows that can prove
    //    the wash actually STOPS ════════════════════════════════════════════
    //
    // Owner, verbatim: "Can we have it just toggleable if we want to see it
    // exactly?" -- "it" being the level art, under a 45% wash.
    //
    // ⚠ WHY A SCREENSHOT CANNOT ANSWER THIS AND `paints` CAN. "The hatch is
    // gone" is an ABSENCE, and a canvas with no hatch on it is what a hidden
    // overlay, an unloaded project, the wrong facet and a throwing canvas all
    // look like. The overlay publishes a paint counter on every draw, so the
    // question becomes a NUMBER: force repaints and see whether it moved. Row
    // 7a is the positive control that makes 7b mean anything -- without it,
    // "stopped painting" and "never painted" are the same observation.
    const report = () => c.json('window.__dbg.aeon.regionOverlayReport()');
    const repaint = async (n = 3) => {
      for (let i = 0; i < n; i += 1) {
        await c.evalExpr(`window.__dbg.setView(${i * 8}, ${i * 8}, ${ZOOM})`);
        await sleep(260);
      }
    };

    await c.evalExpr('window.__dbg.setOverlay("showRegions", true)');
    await sleep(500);
    const onA = await report();
    await repaint();
    const onB = await report();
    check('7a', 'CONTROL: with the toggle ON, forcing repaints advances the overlay paint count',
      !!(onA && onB && onB.paints > onA.paints),
      `paints ${onA?.paints} -> ${onB?.paints}. Without this row, row 7b cannot tell "the wash `
      + 'stopped" from "the wash was never running".');

    await c.evalExpr('window.__dbg.setOverlay("showRegions", false)');
    await sleep(500);
    const offA = await report();
    await repaint();
    const offB = await report();
    check('7b', 'the toggle OFF actually STOPS the wash painting — the count does not move',
      !!(offA && offB && offB.paints === offA.paints),
      `paints ${offA?.paints} -> ${offB?.paints} across the same repaints that moved it in 7a`);
    await shot(c, 'region-overlay-OFF-art-exactly');

    // ── 7c. A DRAG WHILE HIDDEN DRAWS THE GESTURE, AND ONLY THE GESTURE ──────
    //
    // ROADMAP §5.1 row 208, ruled C (options in section 7 of
    // docs/reviews/2026-09-25-regions-list.md). This row used to assert only
    // "paints advance", which the WHOLE overlay coming back also satisfies, and
    // that is exactly what `e640e0fe`'s `region-overlay-OFF-mid-drag` capture
    // showed: the red UNASSIGNED wash, every hatch and every label, mid-drag,
    // over art the author had just asked to see. Now it asserts both halves:
    // paints advance (not carving blind) AND the full wash is not drawn.
    //
    // ⚠ TWO INSTRUMENTS, BECAUSE THE REPORT IS THE CODE'S WORD ABOUT ITSELF.
    // The report's `drew` counters come from the draw calls, but a drawer that
    // miscounted would agree with itself. The pixels do not: the map canvas is
    // read back (`getImageData`, device px) before the press and mid-drag, at
    // the same view, and the fraction of pixels that changed is compared with
    // the same fraction for the SAME drag with the tint ON (row 7e, the control
    // that makes 7c2 mean anything) and with a repaint that changed nothing
    // (row 7f, the noise floor). No coordinate is converted on this side.
    const VIEW7 = `window.__dbg.setView(16, 16, ${ZOOM})`;
    const PIXEL_DELTA = 12; // per channel, 0-255: antialiasing jitter below it
    const snap = (tag) => c.json(`(() => {
      const cv = document.getElementById('map-canvas');
      if (!cv) return { ok: false, why: 'no #map-canvas' };
      try {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        (window.__h208 = window.__h208 || {})[${JSON.stringify(tag)}] = d;
        return { ok: true, w: cv.width, h: cv.height };
      } catch (e) { return { ok: false, why: String(e) }; }
    })()`);
    const changed = (a, b) => c.json(`(() => {
      const A = window.__h208 && window.__h208[${JSON.stringify(a)}];
      const B = window.__h208 && window.__h208[${JSON.stringify(b)}];
      if (!A || !B || A.length !== B.length || A.length === 0) return null;
      let n = 0;
      for (let i = 0; i < A.length; i += 4) {
        if (Math.abs(A[i] - B[i]) > ${PIXEL_DELTA} || Math.abs(A[i + 1] - B[i + 1]) > ${PIXEL_DELTA}
          || Math.abs(A[i + 2] - B[i + 2]) > ${PIXEL_DELTA}) n += 1;
      }
      return n / (A.length / 4);
    })()`);
    const rest = async (tag) => {
      // Pan away and back so the rest capture is a REAL repaint of this view.
      await c.evalExpr(`window.__dbg.setView(40, 40, ${ZOOM})`);
      await sleep(300);
      await c.evalExpr(VIEW7);
      await sleep(500);
      return snap(tag);
    };

    await c.evalExpr(VIEW7);
    await sleep(500);
    const restA = await rest('offRestA');
    const restB = await rest('offRestB');
    const noise = await changed('offRestA', 'offRestB');
    if (!restA.ok || !restB.ok || noise === null) {
      unmeasurable('7f', 'CONTROL: two rest captures of the same view are the same picture',
        `canvas readback failed: ${JSON.stringify({ restA, restB, noise })}`);
    } else {
      check('7f', 'CONTROL: two rest captures of the same view are the same picture (noise floor)',
        noise < 0.001,
        `${(noise * 100).toFixed(3)}% of ${restA.w}x${restA.h} device px changed across a repaint `
        + 'that moved nothing. Above 0.1% the art itself animates and 7c2/7e cannot be read.');
    }

    const d0 = aim(0.45, 0.40); const d1 = aim(0.62, 0.58);
    const beforeDrag = await report();
    await mouse(c, 'mousePressed', d0.x, d0.y);
    await sleep(160);
    await mouse(c, 'mouseMoved', d1.x, d1.y, { buttons: 1 });
    await sleep(500);
    const midDrag = await report();
    const offDragSnap = await snap('offDrag');
    const drew = midDrag?.drew;
    check('7c', 'a drag IN PROGRESS while hidden paints, and paints ONLY the gesture: no hatch, '
      + 'no unassigned wash, no labels, and the dragged outline IS drawn',
      !!(beforeDrag && midDrag && midDrag.paints > beforeDrag.paints
        && midDrag.mode === 'gesture' && drew
        && drew.hatches === 0 && drew.unassignedHoles === 0 && drew.labels === 0
        && drew.gestureOutlines >= 1),
      `paints ${beforeDrag?.paints} -> ${midDrag?.paints} with showRegions OFF and the button DOWN; `
      + `mode=${JSON.stringify(midDrag?.mode)} drew=${JSON.stringify(drew)}. Row 208, ruled C.`);
    await shot(c, 'region-overlay-OFF-mid-drag');
    const offChanged = offDragSnap.ok ? await changed('offRestA', 'offDrag') : null;
    await mouse(c, 'mouseReleased', d1.x, d1.y, { buttons: 0 });
    await sleep(700);
    // The release committed a move. Undo it, so the ON control below drags the
    // SAME document with the SAME aims and the two pictures differ in one thing.
    await ctrlZ(c);
    await sleep(900);
    const docFor7e = JSON.stringify(await docNow(c));
    check('7g', 'ANTI-VACUOUS: the ON control below starts from the same document as the OFF drag',
      docFor7e === beforeJSON, 'one Ctrl+Z after the OFF drag must return the seeded bytes');

    // And back on, so the toggle is proven to work in BOTH directions rather
    // than only to turn things off.
    await c.evalExpr('window.__dbg.setOverlay("showRegions", true)');
    await sleep(500);
    const backA = await report();
    await repaint();
    const backB = await report();
    check('7d', 'and ticking it back on resumes painting — the toggle works both ways',
      !!(backA && backB && backB.paints > backA.paints),
      `paints ${backA?.paints} -> ${backB?.paints}`);

    // ── 7e. THE CONTROL: the same drag with the tint ON draws the full wash ──
    await c.evalExpr(VIEW7);
    await sleep(600);
    await mouse(c, 'mousePressed', d0.x, d0.y);
    await sleep(160);
    await mouse(c, 'mouseMoved', d1.x, d1.y, { buttons: 1 });
    await sleep(500);
    const onDrag = await report();
    const onDragSnap = await snap('onDrag');
    await shot(c, 'region-overlay-ON-mid-drag');
    const onChanged = onDragSnap.ok ? await changed('offRestA', 'onDrag') : null;
    await mouse(c, 'mouseReleased', d1.x, d1.y, { buttons: 0 });
    await sleep(700);
    await ctrlZ(c);
    await sleep(900);

    // Half the hatch's own line density, read from the code's visual calls: a
    // 1 px line every `hatchPx` px covers about 1/hatchPx of what it washes.
    const hatchPx = onDrag?.visual?.hatchPx ?? backB?.visual?.hatchPx;
    const washFloor = typeof hatchPx === 'number' ? 1 / (2 * hatchPx) : null;
    if (onChanged === null || washFloor === null) {
      unmeasurable('7e', 'CONTROL: with the tint ON the same drag draws the full wash',
        `readback ${JSON.stringify(onDragSnap)}, hatchPx ${JSON.stringify(hatchPx)}`);
    } else {
      check('7e', 'CONTROL: with the tint ON the same drag draws the full wash over the art',
        onChanged > washFloor,
        `${(onChanged * 100).toFixed(2)}% of device px differ from the art-only rest capture; `
        + `floor ${(washFloor * 100).toFixed(2)}% = 1/(2 x hatchPx ${hatchPx}). Without this row, `
        + '7c2 cannot tell "the wash is gone" from "this readback cannot see a wash".');
    }
    check('7e2', 'and the report says so: mode full, hatches and labels drawn',
      !!(onDrag && onDrag.mode === 'full' && onDrag.drew
        && onDrag.drew.hatches > 0 && onDrag.drew.labels > 0),
      `mode=${JSON.stringify(onDrag?.mode)} drew=${JSON.stringify(onDrag?.drew)}`);

    if (offChanged === null || onChanged === null || noise === null) {
      unmeasurable('7c2', 'PIXELS: the hidden-tint drag changed the art only a little, and not by nothing',
        `readback ${JSON.stringify({ offDragSnap, offChanged, onChanged, noise })}`);
    } else {
      check('7c2', 'PIXELS: with the tint hidden the drag changes far less of the art than the full wash '
        + 'does, and more than a repaint that moved nothing (the gesture outline IS there)',
        offChanged < onChanged / 4 && offChanged > noise,
        `OFF mid-drag ${(offChanged * 100).toFixed(2)}% vs ON mid-drag ${(onChanged * 100).toFixed(2)}% `
        + `(must be under a quarter of it) vs noise ${(noise * 100).toFixed(3)}% (must be above it)`);
    }

    // ── 7h. THE TRIMMED HALF OF THE GESTURE, ON SCREEN ─────────────────────
    //
    // 7c's drag is a MOVE of forest whose carve into night lands off screen, so
    // it can only ever show the dragged outline (its report says
    // trimmedOutlines 0, and that is correct, not a miss). This one is framed on
    // the seam (4d's view) and is a DRAW inside night with forest selected, so
    // night is TRIMMED on screen and its remainder's outline (the seam, in
    // night's hue) is drawn beside the dragged rectangle. REPORT-ONLY: the
    // pixel instrument above already proved the report's absences are honest;
    // this row adds the one count 7c could not reach, and the capture is for
    // the overseer's eye.
    await c.evalExpr('window.__dbg.setOverlay("showRegions", false)');
    await c.evalExpr(`window.__dbg.setView(${Math.round(BOUNDARY_X - halfSpan)}, 1200, ${BZOOM})`);
    await sleep(800);
    const t0 = aim(0.60, 0.40); const t1 = aim(0.75, 0.60);
    await mouse(c, 'mousePressed', t0.x, t0.y);
    await sleep(160);
    await mouse(c, 'mouseMoved', t1.x, t1.y, { buttons: 1 });
    await sleep(500);
    const carveDrag = await report();
    await shot(c, 'region-overlay-OFF-mid-drag-carve');
    await mouse(c, 'mouseReleased', t1.x, t1.y, { buttons: 0 });
    await sleep(700);
    const docCarved = await docNow(c);
    await ctrlZ(c);
    await sleep(900);
    const cd = carveDrag?.drew;
    check('7h', 'a hidden-tint DRAW that trims night on screen outlines the dragged rectangle AND '
      + 'what the carve leaves of night, with still no hatch, wash or label',
      !!(carveDrag && carveDrag.mode === 'gesture' && cd && cd.gestureOutlines >= 1
        && cd.trimmedOutlines >= 1 && cd.hatches === 0 && cd.unassignedHoles === 0 && cd.labels === 0),
      `aim press=${JSON.stringify(t0)} move=${JSON.stringify(t1)} at zoom ${BZOOM}, seam view; `
      + `mode=${JSON.stringify(carveDrag?.mode)} drew=${JSON.stringify(cd)}`);
    const docAfter7h = JSON.stringify(await docNow(c));
    const nightAfterRelease = (docCarved?.regions ?? []).filter((r) => r.id === 'night').length;
    check('7h2', 'ANTI-VACUOUS: that drag really carved night on release, and one Ctrl+Z undid it',
      nightAfterRelease > 1 && docAfter7h === beforeJSON,
      `night entries after release ${nightAfterRelease} (a hole punched in one rectangle is several); `
      + `back to the seeded bytes after the undo: ${docAfter7h === beforeJSON}`);
    await c.evalExpr('window.__dbg.setOverlay("showRegions", true)');
    await sleep(500);

    // ── 8. A picture for the owner, over real level art ───────────────────
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
