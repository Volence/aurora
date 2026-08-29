#!/usr/bin/env node
// THE COLLISION PAINT GESTURE, OVER REAL MOUSE EVENTS.
//
// Everything this branch added to ClassicLevelViewport is INVISIBLE to the node
// suite: React, a canvas, and mousedown/mousemove/mouseup. The 3268-test suite
// proves `planCollisionCells`, `rectFromCorners` and `applyCollisionShapeCells`
// in isolation, and it scans the .tsx as TEXT — it never mounts the component,
// never dispatches an event, and cannot tell a wired handler from a dead one.
// So this is the only thing that can establish the feature works at all.
//
// Modelled line for line on scratchpad/collision-agent-harness.mjs: same
// `check(id, what, pass, detail)`, same abort-on-row-1 discipline, same
// `colindSnapshot` reader, the same header Undo chip pressed with real mouse
// events. It imports `session`/`openProjectAndAct`/`mouse`/`clickEl` from
// scratchpad/canvas-cdp-harness.mjs, whose ROOT is SELF-LOCATING, so importing
// from this worktree drives THIS worktree's build.
//
//   VITE_AURORA_DEBUG=1 npm run build && node scratchpad/collision-gesture-harness.mjs
//
// ---------------------------------------------------------------------------
// THE SHIFT TRAP, AND WHY `mouse()` CHANGED
// ---------------------------------------------------------------------------
// `canvas-cdp-harness.mjs`'s `mouse()` used to forward only type/x/y/button/
// buttons to `Input.dispatchMouseEvent` and SILENTLY DROP everything else. A
// Shift row written against it would dispatch WITHOUT Shift, the viewport would
// take the plain-drag branch, a freehand stroke would paint the cells the
// cursor crossed — and a row that asked only "were some cells painted?" would
// report PASS for a rectangle that never happened. That is a false pass in the
// worst possible place: the modifier is the whole feature under test.
//
// Fixed at the source rather than worked around here: `mouse()` now forwards
// `modifiers: opts.modifiers ?? 0`, which is purely additive (every existing
// caller omits it and gets 0) and closes the trap for every future harness.
// CDP's bitmask is Alt=1, Ctrl=2, Meta=4, Shift=8.
//
// THAT FIX IS NOT SELF-PROVING, so rows 4 and 5 are built to fail if it ever
// regresses: each asserts a cell INSIDE the marquee that the cursor NEVER
// ENTERED, whose block is distinct from every block the cursor did touch. If
// Shift does not arrive, the gesture is freehand, that cell is never visited,
// its block keeps its old shape, and the row FAILS. See `witness` below.
//
// ---------------------------------------------------------------------------
// SAFETY
// ---------------------------------------------------------------------------
// This drives the REAL /home/volence/sonic_hacks/s1disasm. Every write below
// mutates the IN-MEMORY document only; **nothing here may call save_project**,
// and there is deliberately no `editor/save_project` call anywhere in this
// file. Every writing row undoes itself through the app's own Undo chip, and
// the teardown drains the stack and compares the whole collision table against
// the snapshot taken at the start of the run.
//
// ROW 9 IS THE ONE EXCEPTION, and it is worth stating plainly: it STAMPS A
// LAYOUT CELL (to author the loop-flagged chunk $28 that no stock layout
// contains) and therefore mutates something the collision-table comparison
// above cannot see. It restores that byte by value in a `finally` and re-reads
// it to prove the restore, and the restore is part of the row's pass predicate
// — so a row 9 that leaves the layout dirty is a row 9 that FAILS. The stamp
// and its inverse land on the LAYOUT undo stack, which the Undo chip does not
// reach from the Collision facet (see drainUndo), which is exactly why the
// restore is a stamp and not a click.
//
// ---------------------------------------------------------------------------
// WHAT THE WIRE IS USED FOR (and what it is NOT)
// ---------------------------------------------------------------------------
// The Aether HTTP binding is used for SETUP only: reading the FG layout
// (`editor/get_classic_level`), DRY-RUNNING a candidate rectangle
// (`editor/set_block_collision` with `dryRun: true`, which mutates nothing),
// and — row 9 alone — stamping and then restoring one layout byte
// (`editor/set_layout_region`), because the condition that row tests does not
// occur in any stock layout and has to be authored before it can be painted
// across.
// The second is not optional: `__dbg.classic.colindOf` cannot see the colind
// table's LENGTH, so a block past its end still looks like a fine candidate
// here and would skip as 'overhang' at write time — a row failing for a reason
// that has nothing to do with the gesture. A dry run is the cheapest honest
// confirmation, and its numbers ARE the real ones.
//
// THE GESTURE ITSELF NEVER TOUCHES THE WIRE. Every write below happens because
// a real mouse pressed, moved and released on the real canvas.
//
// ---------------------------------------------------------------------------
// PROVENANCE (row 1)
// ---------------------------------------------------------------------------
// `session()` launches `${ROOT}/dist/main/index.mjs`, and ROOT is this
// worktree — but only if the BUILD in it is this branch's. `'already had it'`
// is a string literal introduced by this branch alone (reportCollisionGesture
// in ClassicLevelViewport.tsx; it appears nowhere in master's src), so its
// presence in dist/renderer/assets is what says the bundle under test contains
// the gesture. Row 1 aborts the run when it is missing, because every later
// PASS would be describing code this branch does not contain.

import { session, openProjectAndAct, mouse, clickEl, sleep, S1DIR, ROOT, resolveOwnedDiscovery } from './canvas-cdp-harness.mjs';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** CDP's Shift bit. Alt=1, Ctrl=2, Meta=4, Shift=8. */
const SHIFT = 8;
/** S1's loop flag — bit 7 of a raw FG layout byte — and the chunk id the engine
 *  swaps out behind a loop. `LOOP_ALIAS.from` in core/level-classic/
 *  collision-probe.ts, and `$28` is the RAW byte: FindNearestTile masks with
 *  #$7F, adds 1 and compares #$29. Row 9 authors both halves. */
const LOOP_BIT = 0x80;
const LOOP_CHUNK = 0x28;
/** Branch-only string literal — see PROVENANCE. */
const BUILD_MARKER = 'already had it';
/** Task 5's panel hint. A NOTE, not an abort: a build made before that commit
 *  is still a perfectly good build of the GESTURE, which is what the 9 rows
 *  test. If this is missing, rebuild to see the hint on screen. */
const HINT_MARKER = 'Shift-drag paints';

const rows = [];
function check(id, what, pass, detail = '') {
  rows.push({ id, what, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
}
function note(what, detail = '') {
  console.log(`NOTE     ${what}${detail ? `\n        ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// The wire. Copied from collision-agent-harness.mjs on purpose — the two
// harnesses must be able to disagree about the app without disagreeing about
// the client.
// ---------------------------------------------------------------------------

// O16: `discoverPort()` used to live here. It read the FIRST of
// ~/.aurora, ~/.config/aurora, ~/.aether mcp.json that existed and took its
// `port` — paths the OWNER'S OWN Aurora publishes to as well. A harness that
// found his app would have driven his open document and read its own writes
// straight back: every row green, describing nothing, while corrupting his
// work. `resolveOwnedDiscovery()` accepts a port only when the pid the file
// names is a descendant of a process this harness spawned; anything else is
// UNMEASURABLE. See scratchpad/lib/harness-guard.mjs.

let nextId = 1;
async function rpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/aether`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  return { status: res.status, body: await res.json() };
}

/** Does the built renderer bundle carry this branch's gesture code? */
function bundleMarkers() {
  const dir = join(ROOT, 'dist', 'renderer', 'assets');
  if (!existsSync(dir)) return { files: 0, build: false, hint: false };
  let build = false, hint = false, files = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    files++;
    const src = readFileSync(join(dir, f), 'utf8');
    if (src.includes(BUILD_MARKER)) build = true;
    if (src.includes(HINT_MARKER)) hint = true;
  }
  return { files, build, hint };
}

// ---------------------------------------------------------------------------
// Page-side readers. Every one of these is READ-ONLY: the only mutations in
// this file are real mouse events on the real canvas and real clicks on the
// app's own controls.
// ---------------------------------------------------------------------------

/** THE WHOLE COLLISION TABLE, one entry per block, in ONE round trip. The
 *  independent reader: no row checks a gesture against a number the gesture
 *  produced — every claim below is a DIFF of two of these snapshots. */
const colindSnapshot = (c) => c.json(`(() => {
  const P = window.__dbg.classic;
  const sizes = P.poolSizes();
  if (!sizes) return null;
  const out = new Array(sizes.blocks);
  for (let i = 0; i < sizes.blocks; i++) out[i] = P.colindOf(i);
  return out;
})()`);

/**
 * Two horizontally ADJACENT paintable cells inside one chunk's definition.
 *
 * Row 9's subject. The filter is deliberately the same one `findTargets` uses
 * (`block > 0 && block < blockCount`): a non-blank, in-pool block is exactly
 * what `classifyCollisionCell` will take, and the one thing neither can see
 * from here — a block past the END of the colind table — is settled by a dry
 * run at the call site, as everywhere else in this file.
 *
 * Returns the pool's chunk count too, so the caller can say "this act does not
 * have chunk $28" rather than reporting an empty list as if the chunk were
 * simply featureless.
 */
const chunkPairs = (c, chunkId, limit = 24) => c.json(`(() => {
  const P = window.__dbg.classic;
  const sizes = P.poolSizes();
  if (!sizes) return null;
  const out = [];
  const ok = (cell) => cell && cell.block > 0 && cell.block < sizes.blocks;
  if (${chunkId} >= 1 && ${chunkId} <= sizes.chunks) {
    for (let cr = 0; cr < 16 && out.length < ${limit}; cr++) {
      for (let cc = 0; cc < 15 && out.length < ${limit}; cc++) {
        const a = P.chunkCell(${chunkId}, cr * 16 + cc), b = P.chunkCell(${chunkId}, cr * 16 + cc + 1);
        if (ok(a) && ok(b)) out.push({ cc, cr, blocks: [a.block, b.block] });
      }
    }
  }
  return { chunks: sizes.chunks, pairs: out };
})()`);

/** Which block ids differ between two snapshots, and how. */
function diffColind(before, after) {
  const changed = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) changed.push({ blockId: i, from: before[i], to: after[i] });
  }
  return changed;
}
const sameDiff = (a, b) =>
  JSON.stringify(a.map((d) => [d.blockId, d.to])) === JSON.stringify(b.map((d) => [d.blockId, d.to]));

// The facet bar is a real `role="group"` of real <button> pills (FacetBar.tsx).
const FACET_PILL = (label) =>
  `[...document.querySelectorAll('div[role="group"][aria-label="Facets"] button')]`
  + `.find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
/** The pill is styled active with a non-transparent background (styles.pillActive). */
const facetActive = (c, label) => c.evalExpr(
  `(() => { const b = ${FACET_PILL(label)}; if (!b) return null;
    return getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)'; })()`);

// The tool dock's buttons are ToolButton: <button title aria-label> whose
// background is T.accent when armed and literally 'transparent' when not
// (components/ui/primitives.tsx). So "armed" is readable off the screen — no
// store poke, and a dock that stops reflecting the armed tool is itself a bug
// this harness would see.
const TOOL_BTN = (label) => `document.querySelector('button[aria-label=${JSON.stringify(label)}]')`;
const toolArmed = (c, label) => c.evalExpr(
  `(() => { const b = ${TOOL_BTN(label)}; if (!b) return null;
    return getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)'; })()`);

// LevelWorkspace's header Undo chip. `Chip` renders a real <button> when it has
// an onClick and carries no title attribute, so it is found by its text.
const UNDO_CHIP = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Undo')`;
const undoEnabled = (c) => c.evalExpr(`(() => { const b = ${UNDO_CHIP}; return b ? !b.disabled : null; })()`);

/**
 * Click Undo until it goes disabled; returns the number of clicks.
 *
 * THE CHIP, NOT Ctrl+Z: both land on the same `focusedHistory()?.undo()`, but
 * the chip also EXPOSES its enabledness, which is what makes "exactly one step"
 * assertable in row 3.
 *
 * IT ONLY REACHES THE RIGHT STACK WITH THE COLLISION FACET FOCUSED. A collision
 * write commits on the ZONE-ART undo document (classicLevelStore's commitArt
 * with `{ colind: true }`), and `focusedDocId()` resolves to that document only
 * while the focused facet is one of ZONE_ART_FACETS = {art, palette, collision}
 * (editorStore.ts). On the default Layout facet this chip drives the LAYOUT
 * stack instead and row 3 would watch nothing happen — a false FAIL against a
 * gesture that batched perfectly. Row 1 is what guarantees the facet.
 */
async function drainUndo(c, limit = 40) {
  let n = 0;
  while (n < limit && (await undoEnabled(c)) === true) {
    await clickEl(c, UNDO_CHIP);
    await sleep(220);
    n++;
  }
  return n;
}

/** Every toast on screen right now, through the shared toast store. */
const toastsNow = (c) => c.json('window.__dbg.canvas.toasts()');

/**
 * Watch the toast area for `ms` and return every DISTINCT message that showed
 * up, minus the ones already there.
 *
 * POLLED, NOT SAMPLED ONCE: a non-error toast dwells 2.2s and then exits
 * (toastStore's dwellMs), so a single read taken a second too late reports "no
 * toast" for a toast the user definitely saw. This doubles as the settle after
 * a gesture.
 */
async function collectToasts(c, ms = 1700, before = []) {
  const had = new Set(before.map((t) => t.message));
  const seen = new Map();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const t of await toastsNow(c)) if (!had.has(t.message)) seen.set(t.message, t.type);
    await sleep(120);
  }
  return [...seen].map(([message, type]) => ({ message, type }));
}

/**
 * The MAP viewport's canvas rect.
 *
 * Found by its own inline style (`position:absolute; inset:0`, the only canvas
 * in the app laid out that way — ClassicLevelViewport's JSX) rather than by
 * "the biggest canvas on screen", which is true today and would quietly start
 * measuring a composer surface the day one is mounted beside it.
 */
const mapRect = (c) => c.json(`(() => {
  const el = [...document.querySelectorAll('canvas')].find(
    (e) => e.style.position === 'absolute' && e.style.inset === '0px');
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right),
           bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) };
})()`);

/**
 * Frame a set of 16px collision cells and return the screen point of each.
 *
 * `setView` drives the SHARED camera, which the classic viewport adopts (see
 * debug-hooks' `view()`/`setView()` docblock) — this is framing, i.e. setup,
 * not the mechanism under test. The screen mapping is the viewport's own:
 * `screen = rect.left + (world - cam.x) * zoom`.
 *
 * VALIDATES EVERY POINT. A cell that lands off-canvas would be clicked on
 * whatever chrome happens to be there, and the row would fail with a story
 * about the gesture that was really a story about the camera.
 */
async function framePoints(c, cells, { zoom = 4, pad = 64 } = {}) {
  const minX = Math.min(...cells.map((p) => p.x)) * 16;
  const minY = Math.min(...cells.map((p) => p.y)) * 16;
  await c.evalExpr(`window.__dbg.setView(${Math.max(0, minX - pad)}, ${Math.max(0, minY - pad)}, ${zoom})`);
  await sleep(700);
  const view = await c.json('window.__dbg.view()');
  const rect = await mapRect(c);
  if (!rect) return { ok: false, why: 'no map canvas on screen', view, rect };
  const pt = (cell) => ({
    x: Math.round(rect.left + (cell.x * 16 + 8 - view.x) * view.zoom),
    y: Math.round(rect.top + (cell.y * 16 + 8 - view.y) * view.zoom),
  });
  const bad = cells.filter((cell) => {
    const p = pt(cell);
    return p.x < rect.left + 4 || p.y < rect.top + 4 || p.x > rect.right - 4 || p.y > rect.bottom - 4;
  });
  return { ok: bad.length === 0, why: bad.length ? `${bad.length} cell(s) off-canvas` : '', view, rect, pt };
}

/**
 * One gesture: press at the first point, move through the rest, release at the
 * last. `modifiers` is forwarded to every event — see THE SHIFT TRAP above.
 *
 * NO INTERPOLATION, deliberately. CDP dispatches exactly the points given, so
 * the set of cells the cursor "crossed" is knowable to the row, which is what
 * lets row 2 assert that the blocks OFF the path did not change.
 */
async function drag(c, points, { modifiers = 0, settle = 450, step = 70 } = {}) {
  const first = points[0], last = points[points.length - 1];
  await mouse(c, 'mousePressed', first.x, first.y, { modifiers });
  await sleep(step);
  for (const p of points.slice(1)) {
    await mouse(c, 'mouseMoved', p.x, p.y, { modifiers, buttons: 1 });
    await sleep(step);
  }
  await mouse(c, 'mouseReleased', last.x, last.y, { modifiers, buttons: 0 });
  await sleep(settle);
}

// ---------------------------------------------------------------------------
// ARMING A SHAPE THROUGH THE PANEL'S OWN PICKER
// ---------------------------------------------------------------------------
//
// This is the fiddliest click in the harness and the first run failed on it
// (`click landed on the swatch=false`, shape armed=null), so it is worth
// stating what makes it hard. The picker is a `maxHeight: 220, overflowY: auto`
// grid of ~247 swatches inside a panel column that is ITSELF scrollable, and
// the shapes a zone does not use are all BELOW the ones it does — so every
// swatch this harness wants is off the bottom of the grid to begin with.
//
// THREE THINGS THE FIRST ATTEMPT GOT WRONG:
//
//  1. `scrollIntoView({ block: 'nearest' })` scrolls the MINIMUM, which parks
//     the swatch against an EDGE of the grid — and if that edge is off the
//     bottom of the window (the grid box straddles it whenever the panel column
//     is scrolled a certain way), the point hit-tests to nothing at all.
//     `block: 'center'` centres it in EVERY scrollable ancestor, and the
//     scroller's own `scrollTop` is then pinned by rect maths so the swatch sits
//     near the TOP of the grid, the part most certain to be on screen.
//     (`offsetTop` would be wrong here: it is measured from the nearest
//     POSITIONED ancestor, which a `display: grid` box is not.)
//  2. Measuring in the SAME evaluation that scrolls. Split across two round
//     trips with a sleep between, so layout has certainly settled before the
//     rect that decides the click coordinate is read.
//  3. Believing the click because the hit test passed. The hit test only says
//     the pointer is over the swatch; it cannot say the handler ran. So the
//     real confirmation is the PANEL ITSELF: a swatch click writes its shape to
//     the probed block, so the "Shape" row must afterwards READ BACK the index
//     that was clicked. That is end-to-end evidence, and it is what `armShape`
//     returns `ok` on.
//
// The hit test is NOT relaxed — a point that lands on something else is still
// refused, and every refusal is reported with the rect, the scroller's state,
// the viewport size and what `elementFromPoint` actually returned, so a second
// failure is diagnosable rather than mysterious.

/** The "Shape" row of the panel's `This block` section — what the probed block
 *  carries right now, read off the screen. `Row` renders `<div><span>label</span>
 *  <span>value</span></div>`, so this is the label/value pair, not a text scrape. */
const panelShape = (c) => c.evalExpr(`(() => {
  const row = [...document.querySelectorAll('div')].find((d) => d.children.length === 2
    && d.children[0].textContent.trim() === 'Shape');
  if (!row) return null;
  const n = Number(row.children[1].textContent.trim());
  return Number.isFinite(n) ? n : null;
})()`);

/**
 * The swatches worth trying, in grid order.
 *
 * UNUSED SHAPES FIRST (`unusedOnly`), because a shape this zone does not use
 * cannot already be on any candidate block: every cell a row paints is then a
 * genuine write with no no-ops to blur the counts. A used shape is a sound
 * fallback rather than a compromise — every expectation in every row is derived
 * from a dry run that pins `applied`/`noop`/`blocks` exactly, so a shape some
 * OTHER block already carries changes nothing but which candidates qualify.
 *
 * `avoid` drops the shape the probed block ALREADY carries: clicking that one
 * is a no-op, the panel's Shape row would read back the clicked index without
 * anything having happened, and the confirmation below would pass on a click
 * that never landed.
 */
const swatchList = (unusedOnly, avoid) =>
  `[...document.querySelectorAll('button[title]')].filter((b) => /^shape \\d+ /.test(b.title)`
  + ` && b.getBoundingClientRect().width > 0`
  + (unusedOnly ? ` && /not used in this zone yet$/.test(b.title)` : '')
  + ` && Number(/^shape (\\d+)/.exec(b.title)[1]) !== ${avoid})`;

/** Scroll swatch `i` into a clickable position and stash it for the next call. */
const prepSwatch = (c, listExpr, i) => c.json(`(() => {
  const list = ${listExpr};
  const el = list[${i}];
  if (!el) return null;
  window.__gsw = el;
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  let s = el.parentElement;
  while (s && !(s.scrollHeight > s.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(s).overflowY))) {
    s = s.parentElement;
  }
  let scroller = null;
  if (s) {
    const gr = s.getBoundingClientRect(), er = el.getBoundingClientRect();
    s.scrollTop += (er.top - gr.top) - 6;
    scroller = { top: Math.round(gr.top), bottom: Math.round(gr.bottom),
                 clientH: s.clientHeight, scrollTop: Math.round(s.scrollTop), scrollH: s.scrollHeight };
  }
  return { count: list.length, title: el.title, scroller };
})()`);

/** Where to press for the stashed swatch — or why there is nowhere to press. */
const aimSwatch = (c) => c.json(`(() => {
  const el = window.__gsw;
  if (!el) return null;
  const b = el.getBoundingClientRect();
  const rect = { left: Math.round(b.left), top: Math.round(b.top),
                 w: Math.round(b.width), h: Math.round(b.height) };
  const vp = { w: window.innerWidth, h: window.innerHeight };
  const desc = (e) => e ? { tag: e.tagName, title: e.title || null,
                            text: (e.textContent || '').trim().slice(0, 32) } : null;
  // The centre first, then points nearer each edge: a swatch is only 52px wide
  // and its centre can sit under a scrollbar or a 1px clip while the rest of it
  // is perfectly clickable. Every one of these still has to hit the swatch (or
  // one of its own spans) — the test is not weakened, only tried more than once.
  for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.3], [0.5, 0.7], [0.25, 0.5], [0.75, 0.5]]) {
    const x = Math.round(b.left + b.width * fx), y = Math.round(b.top + b.height * fy);
    if (x < 1 || y < 1 || x > vp.w - 1 || y > vp.h - 1) continue;
    const hit = document.elementFromPoint(x, y);
    if (hit && (hit === el || el.contains(hit))) return { ok: true, x, y, rect, vp, hit: desc(hit) };
  }
  const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + b.height / 2);
  return { ok: false, x: cx, y: cy, rect, vp, hit: desc(document.elementFromPoint(cx, cy)) };
})()`);

/**
 * Arm a collision shape by clicking a real swatch, and PROVE it took.
 *
 * Tries the unused shapes first and falls back to used ones, at most `perGroup`
 * of each. Every attempt is recorded — the click point, the rect, the scroller,
 * and what was under the pointer — so a total failure comes back as a
 * diagnosis rather than a shrug.
 */
async function armShape(c, avoid, perGroup = 6) {
  const tried = [];
  for (const unusedOnly of [true, false]) {
    const listExpr = swatchList(unusedOnly, avoid ?? -1);
    const n = await c.evalExpr(`${listExpr}.length`);
    for (let i = 0; i < Math.min(n, perGroup); i++) {
      const prep = await prepSwatch(c, listExpr, i);
      if (!prep) break;
      const idx = Number(/^shape (\d+)/.exec(prep.title)[1]);
      // The picker regroups used/unused after every write, so the list is
      // re-evaluated each attempt and the shape on screen is re-read each time
      // rather than trusted from the top of the loop.
      const was = await panelShape(c);
      if (was === idx) {
        tried.push({ unusedOnly, i, title: prep.title, why: 'the block already carries it — a click here proves nothing' });
        continue;
      }
      await sleep(300);                       // let the scroll settle before the rect that decides the point
      const aim = await aimSwatch(c);
      if (!aim || !aim.ok) {
        tried.push({ unusedOnly, i, title: prep.title, why: 'no point on the swatch is hittable',
                     aim, scroller: prep.scroller });
        continue;
      }
      await mouse(c, 'mousePressed', aim.x, aim.y);
      await sleep(40);
      await mouse(c, 'mouseReleased', aim.x, aim.y, { buttons: 0 });
      await sleep(600);
      const now = await panelShape(c);
      if (now === idx) {
        return { ok: true, shape: idx, title: prep.title, unusedOnly, attempt: tried.length + 1, aim, tried };
      }
      tried.push({ unusedOnly, i, title: prep.title,
                   why: `clicked at (${aim.x},${aim.y}) but the panel's Shape row went ${was} -> ${now}, not ${idx}`,
                   aim });
    }
  }
  return { ok: false, tried };
}

// ---------------------------------------------------------------------------
// Candidate discovery. NOTHING is hardcoded: a coordinate that turns out to be
// air fails a row for the wrong reason and sends the reader after a phantom.
// ---------------------------------------------------------------------------

/**
 * Find the two regions every row is built on, page-side, against the LIVE doc.
 *
 * THE BOX (rows 2-5, and 7). A 3x3 patch of FG collision cells INSIDE ONE CHUNK
 * placement (never straddling two, so the whole patch is one chunk's own
 * definition cells) in which:
 *
 *   • all nine cells are writable — a real chunk, a non-blank block, an
 *     in-pool block id;
 *   • the L-SHAPED PATH the freehand row drags along — top row then right
 *     column, `PATH` below — covers at least TWO DISTINCT blocks, because a
 *     one-block stroke cannot detect a per-cell commit loop (row 3);
 *   • one of the four cells OFF that path (the left column / centre) names a
 *     block that appears NOWHERE on the path. That cell is the `witness`, and
 *     it is the single most load-bearing thing this harness computes:
 *
 *        row 2 (freehand) asserts its block is UNCHANGED — proving the stroke
 *              painted the cells the cursor crossed and not their bounding box;
 *        row 4 (Shift)    asserts its block IS painted — proving the marquee
 *              filled the box AND that the Shift modifier reached the page,
 *              since the cursor never enters that cell in either row.
 *
 *     Both claims are only possible because its block is distinct: a link write
 *     changes a BLOCK, zone-wide, so a witness sharing a block with the path
 *     would light up either way and prove nothing.
 *
 * THE MIXED RUN (row 8). Three cells in a row, at least one writable and at
 * least one on the blank block ($00) — the partial-application subject. Blank
 * blocks are used rather than air because air needs the run to straddle a chunk
 * boundary; the skip is reported either way ("1 blank block" / "1 air").
 *
 * ONE CANDIDATE PER DISTINCT CHUNK ID, and each chunk scanned exactly once. A
 * chunk's cells are the same wherever it is stamped, so re-scanning its 400th
 * placement finds the same blocks again — and taking every candidate from the
 * first placement scanned would mean all 24 fallbacks share one chunk's blocks,
 * so a single overhanging block id could disqualify the whole list at dry-run
 * time. Spread across chunks, the list is 24 genuinely independent tries.
 */
const PATH = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]];
const OFF_PATH = [[1, 1], [0, 1], [1, 2], [0, 2]];

const findTargets = (c, fg, limit) => c.json(`(() => {
  const fg = ${JSON.stringify(fg)};
  const PATH = ${JSON.stringify(PATH)};
  const OFF = ${JSON.stringify(OFF_PATH)};
  const P = window.__dbg.classic;
  const blockCount = P.poolSizes().blocks;
  const boxes = [], mixed = [], probes = [];
  const scanned = new Set();
  for (let row = 0; row < fg.length; row++) {
    for (let col = 0; col < fg[row].length; col++) {
      const raw = fg[row][col];
      if ((raw & 0x80) !== 0) continue;           // loop-flagged: the planner warns, and a warning is noise here
      const chunkId = raw & 0x7f;
      if (chunkId === 0) continue;                // air: nothing inside it to paint
      if (scanned.has(chunkId)) continue;         // same cells, different placement — see the docblock
      scanned.add(chunkId);
      const B = new Array(256);
      for (let i = 0; i < 256; i++) { const cc = P.chunkCell(chunkId, i); B[i] = cc ? cc.block : -1; }
      const ok = (b) => b > 0 && b < blockCount;  // 0 = blank block, >= count = dangling
      const at = (cc, cr) => B[cr * 16 + cc];
      let tookBox = false, tookMix = false, tookProbe = false;   // at most one of each per chunk
      for (let cr = 0; cr < 16; cr++) {
        for (let cc = 0; cc < 16; cc++) {
          const gx = col * 16 + cc, gy = row * 16 + cr;
          // Probe candidates, one per chunk: the caller confirms each with a 1x1
          // dry run, and a whole chunk's blocks can overhang the colind table
          // together — four candidates from one chunk would be one candidate.
          if (!tookProbe && probes.length < 12 && ok(at(cc, cr))) {
            tookProbe = true;
            probes.push({ x: gx, y: gy, chunkId, block: at(cc, cr) });
          }
          // ---- the mixed run: 3 across, >=1 writable, >=1 blank block ----
          if (cc <= 13 && !tookMix && mixed.length < ${limit}) {
            const t = [at(cc, cr), at(cc + 1, cr), at(cc + 2, cr)];
            if (t.some(ok) && t.some((b) => b === 0)) {
              tookMix = true;
              mixed.push({ x: gx, y: gy, chunkId, blocks: t,
                           writable: [...new Set(t.filter(ok))],
                           writableCells: t.filter(ok).length,
                           blanks: t.filter((b) => b === 0).length });
            }
          }
          // ---- the 3x3 box ----
          if (cc > 13 || cr > 13 || tookBox || boxes.length >= ${limit}) continue;
          const grid = [];
          let allOk = true;
          for (let dy = 0; dy < 3 && allOk; dy++) {
            for (let dx = 0; dx < 3; dx++) {
              const b = at(cc + dx, cr + dy);
              if (!ok(b)) { allOk = false; break; }
              grid.push(b);
            }
          }
          if (!allOk) continue;
          const blockAt = (dx, dy) => grid[dy * 3 + dx];
          const pathBlocks = [...new Set(PATH.map(([dx, dy]) => blockAt(dx, dy)))];
          if (pathBlocks.length < 2) continue;    // row 3 needs >= 2 distinct blocks
          const wOff = OFF.find(([dx, dy]) => !pathBlocks.includes(blockAt(dx, dy)));
          if (!wOff) continue;                    // no witness => the box proves nothing
          tookBox = true;
          boxes.push({
            x: gx, y: gy, chunkId, cellIndex: cr * 16 + cc,
            blocks: grid, pathBlocks,
            witness: { dx: wOff[0], dy: wOff[1], x: gx + wOff[0], y: gy + wOff[1], block: blockAt(wOff[0], wOff[1]) },
            distinct: [...new Set(grid)],
          });
        }
      }
    }
  }
  return { boxes, mixed, probes };
})()`);

// ---------------------------------------------------------------------------

const main = async () => {
  await session('classic collision paint gesture', async (c) => {
    await openProjectAndAct(c);
    await sleep(600);

    // ---- setup: the build, the act, the facet, the tool, the shape --------
    const markers = bundleMarkers();
    const found = await resolveOwnedDiscovery({ timeoutMs: 20000 });
    for (const r of found.rejected ?? []) console.log(`[prov] refused ${r}`);
    if (!found.ok) {
      console.error(`\nUNMEASURABLE: ${found.why}`);
      console.error('Refusing to POST to a port this harness cannot prove it owns.');
      process.exitCode = 2;
      return;
    }
    const PORT = found.port;
    console.log(`\n[app ] ${ROOT}/dist/main/index.mjs against ${S1DIR}`);
    console.log(`[prov] discovery file ${found.from} said:\n       ${found.raw.trim()}`);
    console.log(`[prov] pid ${found.pid} IS a descendant of ${found.roots.join(',')} — accepted`);
    console.log(`[wire] POST http://127.0.0.1:${PORT}/aether — SETUP ONLY`);

    // THE COLLISION FACET FIRST, and it is not cosmetic: it is what arms the
    // gesture at all (ClassicLevelViewport's mousedown checks
    // `facetFor(tabId) === 'collision'`) AND what points the Undo chip at the
    // zone-art document. Clicked, not poked — a harness that bypasses the UI
    // cannot catch the UI breaking.
    const where = await c.json('window.__dbg.levelState()');
    await clickEl(c, FACET_PILL('Collision'));
    await sleep(900);
    const facetLit = await facetActive(c, 'Collision');
    // The panel's FOOTER, not its headings: 'This cell' / 'This block' only
    // render over a PROBED cell, and nothing has been probed yet — asserting
    // them here would fail row 1 on a facet that mounted perfectly. The footer
    // line is unconditional (ClassicCollisionPanel's root).
    const panelUp = await c.evalExpr(`document.body.textContent.includes('Chunk tab')`);

    // The tool. Switching to the Collision facet already re-scopes the tool via
    // toolForFacet (facet-tools.ts), so this click is usually a no-op — it is
    // here because the row must assert the ARMED state it is about to depend
    // on, not assume a side effect of the pill.
    await clickEl(c, TOOL_BTN('Paint Collision'));
    await sleep(400);
    const armed = await toolArmed(c, 'Paint Collision');

    // Link, not Isolate: GHZ ships 439 blocks against a 410-entry colind, so
    // every isolate on this zone refuses outright (see the agent harness's row
    // 7). 'link' is also the store default; clicking it is belt and braces.
    await clickEl(c, `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Link')`);
    await sleep(250);

    const levelOf = async () => (await rpc(PORT, 'editor/get_classic_level',
      { zone: where.zone, act: where.act })).body.result;
    const level = await levelOf();
    if (!level) { console.error('get_classic_level returned nothing — no act open?'); return; }
    console.log(`[setup] ${level.label}: fg ${level.dims.fg.width}x${level.dims.fg.height} chunks, `
      + `${level.counts.blocks} blocks, ${level.counts.chunks} chunks`);

    const cand = await findTargets(c, level.layout.fg, 24);
    console.log(`[setup] candidates: ${cand.boxes.length} 3x3 boxes, ${cand.mixed.length} mixed runs`);

    // THE SHAPE. Picked through the panel's own swatch — the control that arms
    // the map tool (ShapePicker's `pick` calls setCollisionShape) — preferring
    // one the zone does NOT already use, because then no block anywhere carries
    // it and every candidate cell is a genuine write. `armShape` falls back to
    // a used shape if none of the unused swatches can be reached, which is
    // sound: the dry runs below pin `applied`/`noop`/`blocks` exactly, so a
    // shape some other block happens to carry changes which candidates qualify
    // and nothing else. See armShape's docblock for why this click is fussy.
    //
    // The picker only renders over a probed cell, so a real click on the map
    // comes first. That click paints nothing: `collisionShape` is still null at
    // this point, so the mousedown probes and falls through exactly as it does
    // with the tool unarmed.
    //
    // THE PROBED CELL IS CONFIRMED FIRST. Its block has to be one a link write
    // can actually take: a block past the end of the colind table skips as
    // 'overhang', the panel shows a refusal instead of a new shape, and the
    // read-back below would fail against a picker that worked perfectly. A 1x1
    // dry run answers exactly that — `ok` with the cell either applied or a
    // no-op means it is not skipped. (The shape used to ask is irrelevant and
    // nothing is written; $ff is just a byte.)
    let probeCell = null;
    for (const p of cand.probes) {
      const dry = await rpc(PORT, 'editor/set_block_collision',
        { x: p.x, y: p.y, w: 1, h: 1, shape: 0xff, dryRun: true });
      const r = dry.body.result;
      if (r?.ok === true && (r.applied === 1 || r.noop === 1)) { probeCell = p; break; }
    }
    if (!probeCell) { console.error('no FG cell in this act takes a link write — nothing to probe'); return; }
    const probeFrame = await framePoints(c, [probeCell]);
    if (probeFrame.ok) {
      const p = probeFrame.pt(probeCell);
      await mouse(c, 'mousePressed', p.x, p.y);
      await sleep(60);
      await mouse(c, 'mouseReleased', p.x, p.y, { buttons: 0 });
      await sleep(700);
    }
    // NOW the two headings exist — the probe landed and the panel is describing
    // a real cell. Read as evidence that the map click reached the store, which
    // is the same channel every row below depends on.
    const probed = await c.evalExpr(
      `document.body.textContent.includes('This cell') && document.body.textContent.includes('This block')`);
    const opening = await colindSnapshot(c);
    const shapeBefore = await panelShape(c);
    const picked = await armShape(c, shapeBefore);
    const SHAPE = picked.ok ? picked.shape : null;
    // The swatch click both ARMS the shape and WRITES it to the probed block
    // (the panel's "two gestures, one piece of state"). Undo that write — and
    // any write a mis-landed earlier attempt left behind — so every row below
    // starts from the act as it was opened. The ARMED shape survives the undo,
    // which is exactly what is wanted.
    const drainedSetup = await drainUndo(c);
    const afterSetup = await colindSnapshot(c);
    if (!picked.ok || picked.tried.length > 0) {
      console.log(`[setup] shape picker attempts: ${JSON.stringify(picked.tried, null, 1)}`);
    }

    // --- 1: this build, this act, this facet, this tool, this shape -------
    check(1, 'the build under test is this branch, GHZ 1 is open on the Collision facet, and the gesture is armed',
      markers.build === true && where.status === 'ready' && facetLit === true && panelUp === true
        && probed === true && armed === true && SHAPE !== null
        && diffColind(opening, afterSetup).length === 0,
      `bundle: ${markers.files} renderer chunk(s), '${BUILD_MARKER}' present=${markers.build}; `
      + `act ${JSON.stringify(where)}; Collision pill lit=${facetLit}, panel mounted=${panelUp}, `
      + `map click probed a cell=${probed}; `
      + `Paint Collision armed=${armed}; shape armed=${SHAPE} via ${JSON.stringify(picked.title ?? null)} `
      + `(probe click framed=${probeFrame.ok}; the probed block read shape ${shapeBefore} before the pick and `
      + `${SHAPE} after, which is what says the swatch click reached the handler; `
      + `${picked.tried.length} earlier swatch attempt(s), ${picked.unusedOnly === false ? 'a USED' : 'an unused'} shape); `
      + `setup write undone in ${drainedSetup} step(s), `
      + `table back to the opening state=${diffColind(opening, afterSetup).length === 0}`);
    note(`Task 5's panel hint ('${HINT_MARKER}') in the bundle: ${markers.hint}`,
      markers.hint ? 'the hint commit is in this build' : 'REBUILD to see the Task 5 hint — the 9 rows below do not depend on it');
    if (!(markers.build && facetLit && armed && SHAPE !== null)) {
      console.error('\nABORT: the app is not in the state the gesture needs. Every later row would be a lie.');
      return;
    }

    // CONFIRM THE BOX BEFORE BUILDING FOUR ROWS ON IT. `colindOf` cannot see
    // the colind table's LENGTH, so a block past its end still looks fine to
    // the page-side scan and would skip as 'overhang' at write time. A dry run
    // over the same 3x3 rectangle is the honest confirmation: applied === 9
    // with no skips means all nine cells are genuinely writable with THIS
    // shape. It mutates nothing.
    let box = null;
    for (const b of cand.boxes) {
      const dry = await rpc(PORT, 'editor/set_block_collision',
        { x: b.x, y: b.y, w: 3, h: 3, shape: SHAPE, dryRun: true });
      const r = dry.body.result;
      if (r?.ok === true && r.applied === 9 && r.noop === 0 && (r.skipped?.length ?? 0) === 0) { box = b; break; }
    }
    // The mixed run's dry run is TIGHTER than "applied >= 1": row 8 asserts the
    // changed block set EXACTLY, so a run where one of the writable-looking
    // blocks turns out to overhang the colind table would fail the row for a
    // reason that has nothing to do with the gesture. `applied` is the CELL
    // count and `blocks` the distinct-block count, so both are pinned.
    let mixed = null;
    for (const m of cand.mixed) {
      const dry = await rpc(PORT, 'editor/set_block_collision',
        { x: m.x, y: m.y, w: 3, h: 1, shape: SHAPE, dryRun: true });
      const r = dry.body.result;
      if (r?.ok === true && r.noop === 0
          && r.applied === m.writableCells && r.blocks === m.writable.length
          && (r.skipped?.length ?? 0) >= 1) { mixed = m; break; }
    }
    if (!box) {
      check(2, 'a 3x3 box of real GHZ ground with a distinct off-path block could be found', false,
        `none of ${cand.boxes.length} candidates dry-ran to applied=9 with no skips — rows 2-5 and 7 all depend on it`);
      return;
    }
    const boxCell = (dx, dy) => ({ x: box.x + dx, y: box.y + dy });
    const pathCells = PATH.map(([dx, dy]) => boxCell(dx, dy));
    const witness = { x: box.witness.x, y: box.witness.y };
    console.log(`\n[setup] box at cell (${box.x},${box.y}) in chunk ${box.chunkId}: blocks ${JSON.stringify(box.blocks)}`);
    console.log(`[setup] freehand path ${JSON.stringify(pathCells.map((p) => [p.x, p.y]))} over blocks `
      + `${JSON.stringify(box.pathBlocks)}; WITNESS cell (${witness.x},${witness.y}) is block ${box.witness.block}, `
      + `which appears nowhere on the path`);
    console.log(`[setup] mixed run ${mixed ? `at (${mixed.x},${mixed.y}) blocks ${JSON.stringify(mixed.blocks)}` : 'NOT FOUND'}\n`);

    // --- 2: a freehand drag writes the cells it crossed, AND ONLY THOSE ----
    //
    // The path is an L, not a straight line, and that is the point: for a
    // straight horizontal drag the freehand cell set and the Shift rectangle
    // are the SAME cells, so a straight-line row could not tell the two
    // branches apart. Bent, the bounding box contains cells the cursor never
    // enters — and the witness is one of them.
    const frame2 = await framePoints(c, [...pathCells, witness]);
    const before2 = await colindSnapshot(c);
    const toastsBefore2 = await toastsNow(c);
    const undoBefore2 = await undoEnabled(c);
    if (frame2.ok) await drag(c, pathCells.map(frame2.pt), { settle: 120 });
    const toasts2 = await collectToasts(c, 1500, toastsBefore2);
    const after2 = await colindSnapshot(c);
    const diff2 = diffColind(before2, after2);
    const changed2 = diff2.map((d) => d.blockId).sort((a, b) => a - b);
    const wantPath = [...box.pathBlocks].sort((a, b) => a - b);
    check(2, 'a freehand drag paints every 16px cell the cursor crossed — and nothing else',
      frame2.ok && undoBefore2 === false
        && JSON.stringify(changed2) === JSON.stringify(wantPath)
        && diff2.every((d) => d.to === SHAPE)
        && after2[box.witness.block] === before2[box.witness.block],
      `framing ${frame2.ok ? 'ok' : frame2.why}; undo was drained first=${undoBefore2 === false}; `
      + `document diff ${JSON.stringify(diff2)} (wanted exactly blocks ${JSON.stringify(wantPath)} -> ${SHAPE}); `
      + `witness block ${box.witness.block} (inside the bounding box, never under the cursor): `
      + `${before2[box.witness.block]} -> ${after2[box.witness.block]} — a rectangle would have taken it; `
      + `toasts raised: ${JSON.stringify(toasts2)}`);

    // --- 3: that whole drag is ONE undo step ------------------------------
    //
    // The single most important property of the gesture, and the one the node
    // suite cannot see: a per-cell commit loop would spend one entry per
    // DISTINCT BLOCK (classicSetColind's own no-op guard collapses the rest),
    // so the path is required to cross >= 2 distinct blocks — with one, "one
    // undo restored everything" is true of a broken implementation too.
    const armedAfter2 = await undoEnabled(c);
    await clickEl(c, UNDO_CHIP);
    await sleep(600);
    const after3 = await colindSnapshot(c);
    const stillArmed3 = await undoEnabled(c);
    check(3, 'the whole freehand drag is ONE undo step — one undo restores every block it touched',
      box.pathBlocks.length >= 2 && diff2.length >= 2
        && armedAfter2 === true
        && diffColind(before2, after3).length === 0
        && stillArmed3 === false,
      box.pathBlocks.length < 2
        ? 'VACUOUS — the path crossed one block, which cannot detect a per-cell commit loop'
        : `the drag crossed ${box.pathBlocks.length} distinct blocks and changed ${diff2.length}; `
          + `Undo enabled after the drag=${armedAfter2}; after ONE undo the whole-table diff is `
          + `${JSON.stringify(diffColind(before2, after3))} and Undo still enabled=${stillArmed3}`);

    // --- 4: a Shift-drag paints the whole rectangle -----------------------
    //
    // TWO CORNERS ONLY. The cursor is pressed at the box's top-left and moved
    // ONCE, straight to its bottom-right — so the freehand branch, if Shift
    // never arrived, would paint exactly two cells. The witness is neither of
    // them and its block appears on neither, so its shape changing is proof of
    // BOTH claims at once: the marquee filled the box, and the modifier
    // reached the page. "Some cells were painted" would pass either way; this
    // cannot.
    const corners = [boxCell(0, 0), boxCell(2, 2)];
    const frame4 = await framePoints(c, [...corners, witness]);
    const before4 = await colindSnapshot(c);
    if (frame4.ok) await drag(c, corners.map(frame4.pt), { modifiers: SHIFT });
    const after4 = await colindSnapshot(c);
    const diff4 = diffColind(before4, after4);
    const changed4 = diff4.map((d) => d.blockId).sort((a, b) => a - b);
    const wantBox = [...box.distinct].sort((a, b) => a - b);
    const cornerBlocks = [box.blocks[0], box.blocks[8]];
    check(4, 'a Shift-drag paints the FULL rectangle, including a cell inside it the cursor never entered',
      frame4.ok
        && after4[box.witness.block] === SHAPE
        && before4[box.witness.block] !== SHAPE
        && !cornerBlocks.includes(box.witness.block)
        && JSON.stringify(changed4) === JSON.stringify(wantBox)
        && diff4.every((d) => d.to === SHAPE),
      `framing ${frame4.ok ? 'ok' : frame4.why}; the cursor touched only (${corners[0].x},${corners[0].y}) and `
      + `(${corners[1].x},${corners[1].y}) — blocks ${JSON.stringify(cornerBlocks)}; `
      + `WITNESS cell (${witness.x},${witness.y}), block ${box.witness.block}: `
      + `${before4[box.witness.block]} -> ${after4[box.witness.block]} (want ${SHAPE}; unchanged here means Shift `
      + `never reached the page and the gesture painted freehand); `
      + `whole-box diff ${JSON.stringify(changed4)} (wanted ${JSON.stringify(wantBox)})`);

    await clickEl(c, UNDO_CHIP);
    await sleep(600);
    const restored4 = diffColind(before4, await colindSnapshot(c)).length === 0;

    // --- 5: dragged the other way, it is the SAME box ---------------------
    //
    // `rectFromCorners` normalises both axes, and nothing about a down-and-
    // right drag can show it: the bug it prevents — an up-and-left drag
    // painting nothing, or painting one cell — is invisible until somebody
    // drags the other way. Same two cells, reversed, compared against row 4's
    // own diff rather than against a re-derived expectation.
    const frame5 = await framePoints(c, [...corners, witness]);
    const before5 = await colindSnapshot(c);
    if (frame5.ok) await drag(c, [corners[1], corners[0]].map(frame5.pt), { modifiers: SHIFT });
    const after5 = await colindSnapshot(c);
    const diff5 = diffColind(before5, after5);
    check(5, 'the same Shift-drag dragged UP-AND-LEFT paints the same box as down-and-right',
      frame5.ok && restored4 && diff4.length > 0 && sameDiff(diff4, diff5),
      `row 4 was undone cleanly first=${restored4}; down-right diff ${JSON.stringify(diff4.map((d) => d.blockId))}, `
      + `up-left diff ${JSON.stringify(diff5.map((d) => d.blockId))}; identical=${sameDiff(diff4, diff5)} `
      + `(empty on both sides would be a false match — row 4 wrote ${diff4.length} block(s))`);

    await clickEl(c, UNDO_CHIP);
    await sleep(600);

    // --- 6: with the tool NOT armed, the map still PANS --------------------
    //
    // The gesture's one behavioural change to the old handler is a `return`
    // that skips the pan-arm, and it is gated on the tool being armed AND a
    // shape being picked. Get that gate wrong and navigation dies on the facet
    // — a nastier regression than the feature is a feature. A shape IS still
    // armed here, so this row tests the TOOL half of the gate on its own.
    await clickEl(c, TOOL_BTN('View'));
    await sleep(400);
    const paintLit6 = await toolArmed(c, 'Paint Collision');
    const viewLit6 = await toolArmed(c, 'View');
    // Drained rather than assumed: the "nothing was written" claim below reads
    // the Undo chip, and that reading only means anything from an empty stack.
    // Rows 2-5 each undid their own write, so this normally drains 0.
    const drained6 = await drainUndo(c);
    const before6 = await colindSnapshot(c);
    const view6a = await c.json('window.__dbg.view()');
    const rect6 = await mapRect(c);
    const undoBefore6 = await undoEnabled(c);
    // Up and to the LEFT, so the camera moves POSITIVE on both axes and cannot
    // be clamped by `Math.max(0, ...)` into a no-op that reads as "did not pan".
    if (rect6) {
      const cx = Math.round((rect6.left + rect6.right) / 2), cy = Math.round((rect6.top + rect6.bottom) / 2);
      await drag(c, [
        { x: cx + 160, y: cy + 120 }, { x: cx + 80, y: cy + 60 }, { x: cx, y: cy },
      ]);
    }
    await sleep(400);
    const view6b = await c.json('window.__dbg.view()');
    const after6 = await colindSnapshot(c);
    check(6, 'with the tool NOT armed, a drag still pans the map and writes nothing',
      rect6 !== null && paintLit6 === false && viewLit6 === true && undoBefore6 === false
        && (view6b.x > view6a.x || view6b.y > view6a.y)
        && diffColind(before6, after6).length === 0
        && (await undoEnabled(c)) === false,
      `${drained6} stray undo step(s) drained first; Paint Collision lit=${paintLit6}, View lit=${viewLit6}; camera `
      + `(${view6a.x},${view6a.y}) -> (${view6b.x},${view6b.y}) — moved=${view6b.x > view6a.x || view6b.y > view6a.y}; `
      + `collision table diff ${JSON.stringify(diffColind(before6, after6))}; `
      + `Undo enabled: before=${undoBefore6} after=${await undoEnabled(c)}`);

    await clickEl(c, TOOL_BTN('Paint Collision'));
    await sleep(400);
    const rearmed = await toolArmed(c, 'Paint Collision');

    // --- 7: a drag that leaves the canvas writes NOTHING ------------------
    //
    // THE TRAP THIS ROW AVOIDS: leaving the canvas and releasing OUT THERE
    // proves nothing on its own — the canvas's own onMouseUp never fires for a
    // release over other chrome, so the table would be unchanged even with the
    // cancel path deleted. So the gesture comes BACK IN and releases INSIDE.
    // With `onMouseLeave` doing its job the stroke ref is already null and the
    // return trip writes nothing; with it removed, that final mouseup lands on
    // the canvas with a live stroke and commits — and this row fails, which is
    // the whole point.
    const frame7 = await framePoints(c, pathCells);
    const drained7 = await drainUndo(c);
    const before7 = await colindSnapshot(c);
    const undoBefore7 = await undoEnabled(c);
    // ABOVE the canvas: the workspace header, which is chrome the canvas does
    // not own — so the pointer genuinely LEAVES it and onMouseLeave fires.
    const outside = {
      x: frame7.ok ? frame7.pt(pathCells[0]).x : 0,
      y: Math.max(4, (frame7.rect?.top ?? 40) - 30),
    };
    if (frame7.ok) {
      const a = frame7.pt(pathCells[0]), b = frame7.pt(pathCells[1]);
      await mouse(c, 'mousePressed', a.x, a.y);
      await sleep(70);
      await mouse(c, 'mouseMoved', b.x, b.y, { buttons: 1 });
      await sleep(70);
      await mouse(c, 'mouseMoved', outside.x, outside.y, { buttons: 1 });   // <- onMouseLeave
      await sleep(200);
      await mouse(c, 'mouseReleased', outside.x, outside.y, { buttons: 0 });
      await sleep(200);
      const back = frame7.pt(pathCells[2]);
      await mouse(c, 'mouseMoved', back.x, back.y, { buttons: 0 });
      await sleep(70);
      await mouse(c, 'mouseReleased', back.x, back.y, { buttons: 0 });      // <- would commit a live stroke
      await sleep(500);
    }
    const after7 = await colindSnapshot(c);
    check(7, 'a drag that leaves the canvas mid-gesture writes nothing, even after the pointer comes back',
      frame7.ok && rearmed === true && undoBefore7 === false
        && diffColind(before7, after7).length === 0
        && (await undoEnabled(c)) === false,
      `tool re-armed=${rearmed}; ${drained7} stray undo step(s) drained first; `
      + `pressed at (${pathCells[0].x},${pathCells[0].y}), crossed one cell, left the `
      + `canvas at screen (${outside.x},${outside.y}) (canvas top ${frame7.rect?.top}), released outside, then `
      + `came back in and released INSIDE; table diff ${JSON.stringify(diffColind(before7, after7))}; `
      + `Undo enabled: before=${undoBefore7} after=${await undoEnabled(c)}`);

    // --- 8: a drag over blank cells still writes the solid ones ------------
    //
    // Partial application, and the fact that a human is TOLD about it. Cells
    // silently stepped over look exactly like the tool not working, which is
    // why `reportCollisionGesture` toasts a tally — and why it stays SILENT on
    // a clean write. Both halves are asserted: this run must raise a skip line,
    // and row 2's clean drag must have raised none. A toast-on-everything
    // implementation fails the second clause; a toast-on-nothing fails the first.
    if (!mixed) {
      check(8, 'a drag over blank cells still writes the solid ones, and the skip is reported', false,
        `no run of 3 cells in this act mixes a writable block with the blank block ($00) — `
        + `${cand.mixed.length} raw candidates, none confirmed by a dry run`);
    } else {
      const mixedCells = [0, 1, 2].map((i) => ({ x: mixed.x + i, y: mixed.y }));
      const frame8 = await framePoints(c, mixedCells);
      const before8 = await colindSnapshot(c);
      const toastsBefore8 = await toastsNow(c);
      if (frame8.ok) await drag(c, mixedCells.map(frame8.pt), { settle: 120 });
      const toasts8 = await collectToasts(c, 1800, toastsBefore8);
      const after8 = await colindSnapshot(c);
      const diff8 = diffColind(before8, after8);
      const changed8 = diff8.map((d) => d.blockId).sort((a, b) => a - b);
      const wantMixed = [...mixed.writable].sort((a, b) => a - b);
      const skipLine = toasts8.find((t) => /skipped/i.test(t.message));
      check(8, 'a drag over blank cells still writes the solid ones, and the skip is reported',
        frame8.ok
          && JSON.stringify(changed8) === JSON.stringify(wantMixed)
          && diff8.every((d) => d.to === SHAPE)
          && after8[0] === before8[0]
          && skipLine !== undefined && skipLine.type === 'info'
          && toasts2.every((t) => !/skipped/i.test(t.message)),
        `run (${mixed.x},${mixed.y})..(${mixed.x + 2},${mixed.y}) over blocks ${JSON.stringify(mixed.blocks)} `
        + `(${mixed.blanks} of them the blank block); diff ${JSON.stringify(diff8)} `
        + `(wanted exactly ${JSON.stringify(wantMixed)} -> ${SHAPE}); block 0's own entry `
        + `${before8[0]} -> ${after8[0]} (the blank block must never be written); `
        + `toasts: ${JSON.stringify(toasts8)}; row 2's clean drag raised ${JSON.stringify(toasts2)} `
        + `(must contain no skip line, or the report is not telling the user anything)`);
    }

    // --- 9: a drag across a LOOP-FLAGGED chunk $28 WARNS, and still writes --
    //
    // AUTHORED, NOT FOUND — and the authoring is the finding. A census of every
    // stock layout in the disassembly turns up eighteen loop-flagged cells in
    // total (GHZ 1-3 one each, all on chunk 53/$35; SLZ 1-3 the other fifteen,
    // on 42/$2A and 52/$34) and NOT ONE of them names chunk $28. `loopAmbiguous`
    // needs the loop bit AND that id, so it is false everywhere in the shipped
    // game and no drag over stock data can ever raise the warning.
    //
    // THE CONSTANT IS RIGHT, NOT THE DATA. `_incObj/sub FindNearestTile...asm`
    // does `andi #$7F` / `addq #1` / `cmpi #$29` — i.e. the RAW byte $28 — and
    // the chunk it substitutes lands on index $50 under the shared `subq #1`,
    // which is engine id $51. LOOP_ALIAS (collision-probe.ts) matches both.
    //
    // So the only way to cover the warning at runtime is to STAMP the condition
    // and paint across it. That is also why `findTargets` skips loop-flagged
    // cells outright: rows 2-8 want a toast list with no warning in it, and this
    // row wants a toast list with nothing else.
    //
    // THE LAYOUT IS RESTORED BY VALUE, IN A `finally`, AND RE-READ TO PROVE IT.
    // This is the only row in the file that mutates a LAYOUT, and the stamp
    // lands on the layout undo stack — which the Undo chip cannot reach from the
    // Collision facet (see drainUndo), so the restore has to be the opposite
    // stamp rather than a click. Nothing here calls save_project; the
    // disassembly on disk is untouched either way.
    const pairInfo = await chunkPairs(c, LOOP_CHUNK);
    // The placement to overwrite: any non-air cell that is not already looping.
    // The box's own placement is skipped so nothing this row stamps can ever be
    // confused for something rows 2-8 did.
    const boxPlacement = { col: Math.floor(box.x / 16), row: Math.floor(box.y / 16) };
    let stampAt = null;
    for (let r = 0; r < level.layout.fg.length && !stampAt; r++) {
      for (let col = 0; col < level.layout.fg[r].length; col++) {
        const raw = level.layout.fg[r][col];
        if (raw === 0 || (raw & LOOP_BIT) !== 0) continue;
        if (col === boxPlacement.col && r === boxPlacement.row) continue;
        stampAt = { col, row: r, was: raw };
        break;
      }
    }

    if (!pairInfo || pairInfo.chunks < LOOP_CHUNK || pairInfo.pairs.length === 0 || !stampAt) {
      check(9, 'a drag across a loop-flagged chunk $28 raises a WARNING toast — and still writes the cells', false,
        !pairInfo ? 'no classic doc behind __dbg.classic'
          : pairInfo.chunks < LOOP_CHUNK
            ? `this act's pool has ${pairInfo.chunks} chunks, so engine id $${LOOP_CHUNK.toString(16)} `
              + `(${LOOP_CHUNK}) does not exist here — the loop alias cannot be authored in this act, `
              + 'and forcing it would be testing a chunk the engine could never draw'
            : pairInfo.pairs.length === 0
              ? `chunk $${LOOP_CHUNK.toString(16)}'s definition has no two adjacent cells on a non-blank, `
                + 'in-pool block — there is nothing inside it a drag could paint'
              : 'every FG layout cell is air or already loop-flagged — nowhere to stamp');
    } else {
      const layoutByte = async () => {
        const l = await levelOf();
        return l?.layout?.fg?.[stampAt.row]?.[stampAt.col] ?? null;
      };
      // `set_layout_region` takes RAW layout bytes 0..255, so the loop bit rides
      // along in band (classicSetLayoutCells validates the MASKED id against the
      // pool and accepts the full byte — see its comment).
      const stamp = (byte) => rpc(PORT, 'editor/set_layout_region',
        { plane: 'fg', x: stampAt.col, y: stampAt.row, chunkIds: [[byte]] });
      const LOOP_BYTE = LOOP_BIT | LOOP_CHUNK;

      let stamped = null, pair = null, dryWarn = [];
      let frame9 = { ok: false, why: 'not reached' }, armed9 = null;
      let diff9 = [], toasts9 = [], drained9 = 0;
      let restored9 = null, backTo = null;
      try {
        await stamp(LOOP_BYTE);
        await sleep(600);
        stamped = await layoutByte();

        // THE PAIR, confirmed the way every subject in this file is: a dry run
        // over the exact two cells. `applied === 2` with no skips because the
        // row asserts an EXACT block set afterwards, and `warnings >= 1` because
        // that is the independent evidence the stamp really did author the
        // condition — the agent path carries `warnings` verbatim, and it is the
        // HUMAN path (a toast) that is under test here. If the dry run does not
        // warn, the setup failed and the toast assertion below would be
        // measuring the wrong thing.
        for (const p of pairInfo.pairs) {
          const x = stampAt.col * 16 + p.cc, y = stampAt.row * 16 + p.cr;
          const dry = await rpc(PORT, 'editor/set_block_collision',
            { x, y, w: 2, h: 1, shape: SHAPE, dryRun: true });
          const r = dry.body.result;
          if (r?.ok === true && r.applied === 2 && r.noop === 0 && (r.skipped?.length ?? 0) === 0
              && (r.warnings?.length ?? 0) >= 1) {
            pair = { ...p, x, y };
            dryWarn = r.warnings;
            break;
          }
        }

        if (pair) {
          // Re-armed and re-READ, like row 7's: rows 6-8 leave the tool armed,
          // but an empty diff from a disarmed tool would fail this row with a
          // story about the warning that was really a story about the dock.
          await clickEl(c, TOOL_BTN('Paint Collision'));
          await sleep(400);
          armed9 = await toolArmed(c, 'Paint Collision');
          const cells9 = [{ x: pair.x, y: pair.y }, { x: pair.x + 1, y: pair.y }];
          frame9 = await framePoints(c, cells9);
          drained9 = await drainUndo(c);
          const before9 = await colindSnapshot(c);
          const toastsBefore9 = await toastsNow(c);
          if (frame9.ok) await drag(c, cells9.map(frame9.pt), { settle: 150 });
          // Longer than the other rows': a warning dwells 8s (toastStore's
          // dwellMs), so there is no hurry — but the SKIP line it must not be
          // accompanied by only dwells 2.2s, and the "no skip line" clause is
          // worthless if the window closes before one could have appeared.
          toasts9 = await collectToasts(c, 2600, toastsBefore9);
          diff9 = diffColind(before9, await colindSnapshot(c));
        }
      } finally {
        // BOTH mutations backed out, in the order they were made: the paint
        // through the app's own Undo chip (the zone-art stack), the layout byte
        // by the opposite stamp. In a `finally` so an assertion or a CDP failure
        // anywhere above still puts the byte back.
        await drainUndo(c);
        await stamp(stampAt.was);
        await sleep(500);
        backTo = await layoutByte();
        restored9 = backTo === stampAt.was;
      }

      const warns9 = toasts9.filter((t) => t.type === 'warning');
      const changed9 = diff9.map((d) => d.blockId).sort((a, b) => a - b);
      const want9 = pair ? [...new Set(pair.blocks)].sort((a, b) => a - b) : [];
      check(9, 'a drag across a loop-flagged chunk $28 raises a WARNING toast — and still writes the cells',
        pair !== null && stamped === LOOP_BYTE && frame9.ok && armed9 === true
          // ONE warning for the gesture, not one per cell: the planner counts
          // the ambiguous cells into a single sentence, and a rectangle across a
          // loop must not return hundreds of identical toasts.
          && warns9.length === 1
          && /\$51/.test(warns9[0].message) && /\$28/.test(warns9[0].message)
          && /2 cells/.test(warns9[0].message)
          // NOT A REFUSAL. The cells are written; the caveat is that the console
          // may read a different chunk. Both halves are asserted, because a
          // warning that came with an empty diff would be a refusal wearing a
          // warning's clothes.
          && JSON.stringify(changed9) === JSON.stringify(want9)
          && diff9.every((d) => d.to === SHAPE)
          // A clean write: nothing was skipped, so no tally line. This is the
          // combination the human path used to drop entirely.
          && toasts9.every((t) => !/skipped/i.test(t.message))
          && restored9 === true,
        `stamped $${LOOP_BYTE.toString(16)} (loop | $${LOOP_CHUNK.toString(16)}) over layout cell `
        + `(${stampAt.col},${stampAt.row}), which was $${stampAt.was.toString(16)}; read back `
        + `$${stamped === null ? '??' : stamped.toString(16)}; `
        + `chunk $${LOOP_CHUNK.toString(16)} has ${pairInfo.pairs.length} adjacent paintable pair(s) `
        + `in a pool of ${pairInfo.chunks} chunks; `
        + (pair
          ? `painted cells (${pair.x},${pair.y})-(${pair.x + 1},${pair.y}) over blocks `
            + `${JSON.stringify(pair.blocks)}; dry run warned ${JSON.stringify(dryWarn)}; `
            + `framing ${frame9.ok ? 'ok' : frame9.why}; Paint Collision armed=${armed9}; `
            + `${drained9} stray undo step(s) drained first; `
            + `diff ${JSON.stringify(diff9)} (wanted exactly ${JSON.stringify(want9)} -> ${SHAPE}); `
            + `toasts ${JSON.stringify(toasts9)} — ${warns9.length} of type 'warning'`
          : 'NO PAIR: none of the pairs dry-ran to applied=2, no skips and a warning '
            + '(a block past the end of the colind table would do that, and so would a stamp that did not take)')
        + `; layout byte restored to $${backTo === null ? '??' : backTo.toString(16)}=${restored9}`);
    }

    // LEAVE THE DOCUMENT AS WE FOUND IT. Every writing row above undoes its own
    // write; this drains whatever is left and states, in one number, whether
    // the act is byte-for-byte as it opened. Note there is no save_project call
    // anywhere in this file, deliberately — the disassembly on disk is never
    // touched by any of it.
    const leftover = await drainUndo(c);
    const final = await colindSnapshot(c);
    console.log(`\n[teardown] drained ${leftover} further undo step(s); `
      + `collision table matches the opening state=${JSON.stringify(final) === JSON.stringify(opening)}`);
  });

  const passed = rows.filter((r) => r.pass).length;
  console.log(`\n${passed}/${rows.length}`);
  process.exit(passed === rows.length ? 0 : 1);
};

main().catch((e) => { console.error(e); process.exit(1); });

// ===========================================================================
// SELF-TEST: how to prove this harness is not vacuous
// ===========================================================================
//
// A guard that asserts nothing passes just as loudly as one that works. Each
// plant below is a SPECIFIC edit that must make its row FAIL — and the second
// half of the claim is which OTHER rows stay green, because a plant that breaks
// everything is not evidence. Rebuild (`VITE_AURORA_DEBUG=1 npm run build`)
// after each edit; revert before merging.
//
// --- ROW 3 (the whole drag is ONE undo step) -------------------------------
//   FILE     src/renderer/state/collision-dispatch.ts
//   FUNCTION dispatchCollisionPlan
//   CHANGE   Replace the single dispatch
//                const result = plan.kind === 'link'
//                  ? classicSetColind(plan.entries)
//                  : classicPaintSurface(plan.plan);
//            with the per-entry loop this row exists to catch:
//                let result = { ok: true };
//                if (plan.kind === 'link') {
//                  for (const e of plan.entries) {
//                    result = classicSetColind([e]);
//                    if (!result.ok) break;
//                  }
//                } else { result = classicPaintSurface(plan.plan); }
//   EXPECT   Row 2 still PASSES — every block still ends up at the armed shape,
//            and row 2 only reads the document, never the step count. Row 3
//            FAILS: after ONE Undo click only the LAST block is restored, the
//            whole-table diff against `before2` is non-empty, and the Undo chip
//            is still enabled (`stillArmed3 === true`).
//   COLLATERAL Row 5 fails too, and correctly: row 3's single undo no longer
//            gets the table back, so `before5` is not the clean state row 4
//            wrote from and the two diffs cannot match. Row 4 itself still
//            passes (it diffs against its own `before4`). Expect 6/8.
//   WHY >= 2  BLOCKS MATTERS: with a one-block path this plant is INVISIBLE —
//            one entry, one undo, green. That is why `findTargets` refuses a
//            box whose path covers fewer than two distinct blocks, and why row
//            3 reports VACUOUS rather than passing if it ever gets one.
//
// --- ROW 5 (up-and-left paints the same box) -------------------------------
//   FILE     src/renderer/components/classic/viewport-math.ts
//   FUNCTION rectFromCorners
//   CHANGE   Drop the normalisation — the bug that is invisible until somebody
//            drags the other way:
//                export function rectFromCorners(a, b) {
//                  return { x: a.x, y: a.y, w: b.x - a.x + 1, h: b.y - a.y + 1 };
//                }
//   EXPECT   Row 4 still PASSES (its drag runs top-left -> bottom-right, where
//            the un-normalised form is already correct). Row 5 FAILS: the
//            up-and-left drag produces w = -1 and h = -1, `planCollisionRect`
//            scans no cells, the write is refused as nothing-applicable, `diff5`
//            is empty and `sameDiff(diff4, diff5)` is false.
//   COLLATERAL None — nothing else calls rectFromCorners with a reversed pair.
//            Rows 1, 2, 3, 4, 6, 7, 8 all stay green. Expect 7/8.
//   NOTE     The `diff4.length > 0` clause in row 5 is there so an empty-vs-
//            empty comparison can never read as a match.
//
// --- ROW 6 (unarmed, the map still pans) -----------------------------------
//   FILE     src/renderer/components/classic/ClassicLevelViewport.tsx
//   FUNCTION onMouseDown, the collision-facet branch
//   CHANGE   Widen the gate so the gesture arms whatever the tool is — i.e.
//            hoist the paint branch out of its `if (tool === 'paint-collision')`
//            by deleting that condition and keeping the body. Navigation on the
//            facet dies: every left-drag now paints instead of panning.
//   EXPECT   Row 6 FAILS on BOTH of its clauses, which is what makes it worth
//            planting: the camera does not move (`view6b` equals `view6a`,
//            because the arm-and-return happens before the pan-arm) AND the
//            collision table diff is non-empty (the drag across the canvas
//            centre paints whatever it crosses). The Undo chip is left enabled
//            too.
//   COLLATERAL Row 7 fails as a knock-on: row 6's stray write is never undone,
//            so `before7` and the teardown comparison are both polluted. Rows
//            1-5 are untouched (they run first). Expect 6/8.
//   NARROWER  ALTERNATIVE that isolates row 6 alone: instead of widening the
//            gate, make the pan unreachable only for the unarmed case by adding
//            a bare `return;` immediately after `setCollisionProbe(...)` in the
//            same branch. The camera then never moves on this facet, row 6
//            fails on its camera clause alone, nothing is written, and rows 7
//            and 8 stay green (both re-arm the tool first). Expect 7/8.
//
// --- ROW 9 (a drag across a loop-flagged $28 warns) ------------------------
//   FILE     src/renderer/components/classic/collision-gesture-report.ts
//   FUNCTION reportCollisionGesture
//   CHANGE   Put the warning emission back BELOW the clean-write early return,
//            which is exactly where the human path used to drop it:
//                export function reportCollisionGesture(report) {
//                  if (report.skipped.length === 0) return;
//                  for (const w of report.warnings) addToast(w, 'warning');
//                  ...
//   EXPECT   Row 9 FAILS on its warning clauses: the gesture writes both cells
//            (`diff9` is still exactly the pair's blocks) and skips nothing, so
//            the function returns before it ever reads `warnings` and `warns9`
//            is empty. The row's "and it still writes" half stays true, which is
//            the point — the defect is invisible in the document and visible
//            only in what the painter was told.
//   COLLATERAL None. Rows 2-8 never author a loop-flagged cell (`findTargets`
//            skips bit 7 outright), so no other row has a warning to lose, and
//            row 8's skip line is on the far side of the return and unaffected.
//            Expect 8/9.
//   NARROWER  ALTERNATIVE: leave the position alone and emit the warnings as
//            'info' instead of 'warning'. Row 9 then fails on `warns9.length
//            === 1` alone — the sentence is on screen, in the wrong voice, at
//            the wrong dwell (2.2s instead of 8s, i.e. too short to read the
//            one message that has to be acted on). Rows 2-8 stay green. Also
//            8/9. Note that row 8's predicates are SUBSTRING-based (`/skipped/i`)
//            and would not notice either plant, which is why row 9 asserts the
//            toast TYPE explicitly rather than leaning on the toast list.
//   VACUITY   If the act ever loses chunk $28 from its pool, row 9 reports that
//            as a FAIL with the chunk count rather than passing quietly — see
//            its guard branch. A row that skips itself is a row that proves
//            nothing, and this one covers the only runtime evidence the loop
//            warning has.
