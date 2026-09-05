#!/usr/bin/env node
// CLASSIC COLLISION / TASK 9: is `set_block_collision` actually reachable, and
// honest, over the wire?
//
// The node suite (3253 tests) proves the pure halves — planCollisionRect,
// classifyCollisionCell, planIsolateRect, the dispatcher — guards the registry,
// and drives `handleAgentRequest` directly. NONE OF IT CROSSES THE TRANSPORT,
// THE ZOD LAYER, OR THE IPC BRIDGE. This drives the BUILT app under xvfb and
// calls the tool the way an agent would — POST /aether — then reads the result
// back out of the live document through `__dbg.classic`.
//
// Modelled line for line on scratchpad/art-agent-harness.mjs: same
// `discoverPort()`, same `rpc()`, same `check(id, what, pass, detail)`, same
// abort-on-row-1 discipline. It imports `session`/`openProjectAndAct` from
// scratchpad/canvas-cdp-harness.mjs, whose ROOT is SELF-LOCATING, so importing
// from this worktree drives THIS worktree's build.
//
// THE ROWS EXIST BECAUSE NOTHING ELSE CAN COVER THEM:
//
//   Row 1  Provenance. See below — it ABORTS the run.
//   Row 2  The whole tool, end to end, on real GHZ data: the reply's counts
//          against the colind table read back through a SECOND reader.
//   Row 3  Idempotence over the wire (`applied:0, noop:N`), which is what an
//          agent retrying after a timeout depends on.
//   Row 4  ONE rectangle = ONE undo step. The single most important property of
//          this tool, and the transport is exactly where a batching bug hides:
//          the node suite never presses undo.
//   Row 5  A refusal must arrive as a JSON-RPC *result* carrying ok:false, not
//          as a JSON-RPC *error*. That distinction is made by the ADAPTER,
//          which no node test reaches. If it regresses, it regresses silently:
//          the tool still "works", and every caller is told Aurora broke.
//   Row 6  An out-of-range `shape` must be -32602 INVALID_PARAMS from the
//          schema, not -32603 INTERNAL. `planCollisionRect` DELIBERATELY does
//          not bound `shape` (it is a raw colind byte to the planner), so the
//          zod `.min(0).max(255)` in editor-methods.ts is the ONLY thing
//          between `shape: 300` and a confusing INTERNAL error. Nothing but
//          this row runs that bound.
//   Row 7  D4/D6 against REAL zone data. GHZ ships 439 blocks against a
//          410-entry colind, so `tableSpare` is NEGATIVE and every isolate
//          refuses with `isolate-grows-table`. The fixtures in the node suite
//          are hand-built; this is the shipped table. And the resolution must
//          not recommend a mode this document ALSO refuses.
//   Row 8  `dryRun` reports the real numbers and mutates nothing. Nothing in
//          the node suite reads the document back ACROSS the bridge.
//
// PROVENANCE — REWRITTEN BY O16, AND THE OLD TEXT WAS WRONG.
//
// `session()` launches `${ROOT}/dist/main/index.mjs`, but the port comes from a
// discovery file in $HOME that a DIFFERENT Aurora may own — another worktree,
// another session, or THE OWNER'S OWN RUNNING EDITOR, which publishes to the
// same paths.
//
// This used to be settled by row 1: "`editor/set_block_collision` exists only on
// this branch, so if the port does not advertise it we are talking to somebody
// else's app." That reasoning has two holes, and it is the more dangerous kind
// of wrong because it reads like rigour:
//
//   * the premise expires. The method is on master now, so "advertises it"
//     no longer distinguishes this branch from anything;
//   * even when true it is a CAPABILITY test, not an IDENTITY test. It cannot
//     tell this app from any other app with the same method — and the app most
//     likely to be running with the same method is the owner's.
//
// The port is now accepted only if the pid its discovery file names is a
// DESCENDANT of the process this harness spawned (`resolveOwnedDiscovery`, in
// lib/harness-guard.mjs). Nothing else is accepted; the run reports UNMEASURABLE
// and stops. Row 1 stays, demoted to what it always actually was: a check that
// the app carries this branch's method.
//
// SAFETY. This drives the REAL /home/volence/sonic_hacks/s1disasm. Every write
// below mutates the IN-MEMORY document only; **nothing here may call
// save_project**, or the collision table gets written to the user's
// disassembly. There is deliberately no `editor/save_project` call anywhere in
// this file, and row 4 undoes its own write besides.
//
//   VITE_AURORA_DEBUG=1 npm run build && node scratchpad/collision-agent-harness.mjs

import { session, openProjectAndAct, clickEl, sleep, S1DIR, MAIN, resolveOwnedDiscovery } from './canvas-cdp-harness.mjs';

// FLAT/fully-solid, the value editor-methods.ts advertises in the `shape`
// description (core/art/commit-collision.ts's FLAT_SHAPE = 0xff). Restated as a
// literal rather than imported because this file must not pull TypeScript in;
// if the two ever drift, row 2 still passes — it only needs a shape the chosen
// blocks do not already carry — so nothing here is load-bearing on the value.
const SHAPE = 0xff;

const rows = [];
function check(id, what, pass, detail = '') {
  rows.push({ id, what, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${what}${detail ? `\n        ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// The wire. Copied from art-agent-harness.mjs on purpose — the two harnesses
// must be able to disagree about the app without disagreeing about the client.
// ---------------------------------------------------------------------------

// ═══ O16: THE PORT IS OURS OR THIS HARNESS DOES NOT RUN ════════════════════
//
// What used to be here read ~/.aurora/mcp.json (then ~/.config/aurora, then
// ~/.aether), took the FIRST `port` it found, and returned `j.pid` alongside it
// — printed, never compared. The only provenance test downstream was row 1:
// "does initialize advertise editor/set_block_collision?"
//
// That is a CAPABILITY test wearing an identity test's clothes. It establishes
// that the app on that port is *a* build carrying that method. It does not
// establish that it is *the app this harness launched* — and the owner's own
// Aurora, built from a branch that has the method, passes it identically. Those
// discovery paths are SHARED: his editor publishes to them too.
//
// So the failure this harness was one coincidence away from is not a crash. It
// is: connect to the owner's running editor, `editor/set_block_collision` into
// his OPEN DOCUMENT, read the write back through the same port, and report
// every row green — describing nothing, while corrupting his work.
//
// The rule now is descent, which is the only thing that is actually about
// ownership: the pid the discovery file names must be a descendant of a process
// this harness spawned (`session()` launches through `spawnGuarded`). If no
// file names such a pid, this reports UNMEASURABLE and stops. It never falls
// back to "well, something answered".

let nextId = 1;
/** One JSON-RPC call over the real Aether HTTP binding. Returns the ENVELOPE. */
async function rpc(port, method, params) {
  const res = await fetch(`http://127.0.0.1:${port}/aether`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: `127.0.0.1:${port}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  });
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// Page-side readers. `__dbg.classic` is strictly read-only; the only mutations
// in this file go over the wire (the tool) or through a real click (undo).
// ---------------------------------------------------------------------------

/**
 * THE WHOLE COLLISION TABLE, one entry per block, in ONE round trip.
 *
 * The independent reader. Row 2 must not check a tool's report against a number
 * the same tool produced, so the reply's `applied`/`blocks` are compared against
 * a DIFF of two of these snapshots — taken off the live zustand document through
 * the CDP probe, never off the wire.
 *
 * `colindOf` answers null past `doc.blocks.length`, so the array length is the
 * block count and a null is a probe-range answer, not a table value.
 */
const colindSnapshot = (c) => c.json(`(() => {
  const P = window.__dbg.classic;
  const sizes = P.poolSizes();
  if (!sizes) return null;
  const out = new Array(sizes.blocks);
  for (let i = 0; i < sizes.blocks; i++) out[i] = P.colindOf(i);
  return out;
})()`);

/** Which block ids differ between two snapshots, and how. */
function diffColind(before, after) {
  const changed = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) changed.push({ blockId: i, from: before[i], to: after[i] });
  }
  return changed;
}

// The facet bar is a real `role="group"` of real <button> pills (FacetBar.tsx).
const FACET_PILL = (label) =>
  `[...document.querySelectorAll('div[role="group"][aria-label="Facets"] button')]`
  + `.find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
// LevelWorkspace's header Undo chip. `Chip` renders a real <button> when it has
// an onClick (components/ui/primitives.tsx), and it carries NO title attribute —
// so it is found by its text, not by canvas-cdp-harness's `__c.chip()`.
const UNDO_CHIP = `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Undo')`;

const undoEnabled = (c) => c.evalExpr(`(() => { const b = ${UNDO_CHIP}; return b ? !b.disabled : null; })()`);

/**
 * Click Undo until it goes disabled; returns the number of clicks.
 *
 * WHY THE CHIP AND NOT Ctrl+Z: both land in the same place —
 * LevelWorkspace's keydown handler calls `focusedHistory()?.undo()` and the chip's
 * onClick calls `history?.undo()` on the same `focusedHistory()` — but the chip
 * also EXPOSES its enabledness, which is what makes "exactly one step" assertable.
 * A Ctrl+Z would additionally have to clear `levelKeysEnabled()` and
 * `isTypingTarget()`, two conditions this file has no reason to be testing.
 */
async function drainUndo(c, limit = 40) {
  let n = 0;
  while (n < limit && (await undoEnabled(c)) === true) {
    await clickEl(c, UNDO_CHIP);
    await sleep(250);
    n++;
  }
  return n;
}

/**
 * Find rectangles worth testing, WITHOUT hardcoding a coordinate.
 *
 * A hardcoded guess that lands on air makes row 2 fail for the wrong reason, and
 * "the ledge at (x,y) is solid in GHZ act 1" is exactly the kind of fact that is
 * true until somebody edits the layout. So the whole search runs page-side
 * against the live document:
 *
 *   solid[]  two HORIZONTALLY ADJACENT FG cells inside one chunk placement whose
 *            blocks are non-zero, DISTINCT (a one-block rectangle cannot detect a
 *            per-entry undo loop — see row 4), not dangling, and not already
 *            carrying SHAPE.
 *   air[]    an FG cell whose layout entry is chunk 0 — genuinely air, the row-5
 *            subject.
 *   block0[] two adjacent cells whose blocks are the blank block 0 — the row-5
 *            fallback if this act has no air at all.
 *
 * Loop-flagged layout entries (bit 7) are skipped: `locateCell` masks the bit and
 * `planCollisionRect` emits a loop warning for them, and a warning in the reply
 * is noise in every row below.
 *
 * The candidates are only CANDIDATES — a block past the end of the colind table
 * skips as 'overhang' in link mode, and `colindOf` cannot see the table's length.
 * The caller confirms each with a dryRun before committing to it.
 */
const findCandidates = (c, fg, shape, limit) => c.json(`(() => {
  const fg = ${JSON.stringify(fg)};
  const SHAPE = ${shape};
  const P = window.__dbg.classic;
  const solid = [], air = [], block0 = [];
  for (let row = 0; row < fg.length; row++) {
    for (let col = 0; col < fg[row].length; col++) {
      const raw = fg[row][col];
      if ((raw & 0x80) !== 0) continue;            // loop-flagged — see the docblock
      const chunkId = raw & 0x7f;
      if (chunkId === 0) {                          // the whole 16x16 cell block is air
        if (air.length < ${limit}) air.push({ x: col * 16, y: row * 16 });
        continue;
      }
      let tookFromThisChunk = false;
      for (let cr = 0; cr < 16 && !tookFromThisChunk; cr++) {
        for (let cc = 0; cc < 15; cc++) {
          const ia = cr * 16 + cc;
          const a = P.chunkCell(chunkId, ia), b = P.chunkCell(chunkId, ia + 1);
          if (!a || !b) continue;
          if (a.block === 0 && b.block === 0) {
            if (block0.length < ${limit}) block0.push({ x: col * 16 + cc, y: row * 16 + cr });
            continue;
          }
          if (a.block === 0 || b.block === 0) continue;
          if (a.block === b.block) continue;        // must be TWO entries — row 4
          const ca = P.colindOf(a.block), cb = P.colindOf(b.block);
          if (ca === null || cb === null) continue; // dangling reference
          if (ca === SHAPE || cb === SHAPE) continue;
          if (solid.length < ${limit}) {
            solid.push({
              x: col * 16 + cc, y: row * 16 + cr, w: 2, h: 1,
              chunkId, cellIndex: ia, blockA: a.block, blockB: b.block, colindA: ca, colindB: cb,
            });
            tookFromThisChunk = true;               // spread candidates across chunks
            break;
          }
        }
      }
    }
  }
  return { solid, air, block0 };
})()`);

// ---------------------------------------------------------------------------

const main = async () => {
  await session('classic collision agent surface', async (c) => {
    await openProjectAndAct(c);
    await sleep(600);

    // AFTER launch, never before: the discovery file exists only while an Aurora
    // is running, and the app removes it on shutdown.
    const found = await resolveOwnedDiscovery({ timeoutMs: 20000 });
    // PRINT THE ARTIFACT THIS ROW JUDGED. Every candidate file, its bytes, and
    // why each was refused — otherwise "provenance ok" is a claim about a
    // decision nobody can see.
    for (const r of found.rejected ?? []) console.log(`[prov] refused ${r}`);
    if (!found.ok) {
      console.error(`\nUNMEASURABLE: ${found.why}`);
      console.error('Refusing to POST to a port this harness cannot prove it owns. The whole');
      console.error('point of this guard is that the failure mode is SILENT SUCCESS: an app');
      console.error("that answers is not evidence it is OUR app, and it may be the owner's.");
      process.exitCode = 2;
      return;
    }
    const PORT = found.port;
    console.log(`\n[prov] discovery file ${found.from} said:\n       ${found.raw.trim()}`);
    console.log(`[prov] pid ${found.pid} IS a descendant of ${found.roots.join(',')} — accepted`);
    console.log(`[wire] POST http://127.0.0.1:${PORT}/aether`);
    console.log(`[app ] ${MAIN} against ${S1DIR}\n`);

    // --- 1: provenance + discovery ---------------------------------------
    // NOTE: this row is a CAPABILITY check and nothing more. It says the app
    // carries this branch's method. Identity — that it is the app we launched —
    // was settled above by descent, not here. Conflating the two is the defect
    // O16 fixed.
    const init = await rpc(PORT, 'initialize', { protocolVersion: 1 });
    const methods = init.body.result?.methods ?? [];
    const advertised = methods.includes('editor/set_block_collision');
    check(1, 'initialize advertises editor/set_block_collision', advertised,
      `${methods.length} methods advertised; set_block_collision=${advertised}; `
      + `get_classic_level=${methods.includes('editor/get_classic_level')}`);
    if (!advertised) {
      console.error('\nABORT: the app on this port does not carry this branch. Every later row would be a lie.');
      return;
    }

    // --- setup: which act, and where the solid ground is ------------------
    //
    // THE COLLISION FACET, FIRST, and it is not cosmetic. `classicSetColind`
    // commits on the ZONE-ART undo document (classicLevelStore's commitArt with
    // `{ colind: true }`), and `focusedDocId()` only resolves to that document
    // while the focused facet is one of ZONE_ART_FACETS = {art, palette,
    // collision} (editorStore.ts). On the default Layout facet the header's
    // Undo chip is bound to the LAYOUT stack instead, so row 4 would press undo
    // and watch nothing happen — a false FAIL against a tool that batched
    // correctly. Clicking the real pill is the same switch a person makes.
    const where = await c.json(`window.__dbg.levelState()`);
    const facetClicked = await clickEl(c, FACET_PILL('Collision'));
    await sleep(900);
    console.log(`[setup] act ${JSON.stringify(where)}; Collision facet clicked=${facetClicked}`);

    const levelOf = async () => (await rpc(PORT, 'editor/get_classic_level',
      { zone: where.zone, act: where.act })).body.result;
    const level = await levelOf();
    if (!level) { console.error('get_classic_level returned nothing — no act open?'); return; }
    console.log(`[setup] ${level.label}: fg ${level.dims.fg.width}x${level.dims.fg.height} chunks, `
      + `${level.counts.blocks} blocks, ${level.counts.chunks} chunks`);

    const cand = await findCandidates(c, level.layout.fg, SHAPE, 12);
    console.log(`[setup] candidates: ${cand.solid.length} solid pairs, ${cand.air.length} air cells, `
      + `${cand.block0.length} blank-block pairs`);

    // CONFIRM THE RECTANGLE BEFORE BUILDING EIGHT ROWS ON IT. `colindOf` cannot
    // see the colind table's LENGTH, so a candidate block past its end still
    // looks fine here and would skip as 'overhang' in link mode. A dryRun is the
    // cheapest honest test — it mutates nothing and its numbers ARE the real
    // ones (collision-dispatch.ts returns the planner's own report).
    let rect = null, probe = null;
    for (const s of cand.solid) {
      const dry = await rpc(PORT, 'editor/set_block_collision',
        { x: s.x, y: s.y, w: s.w, h: s.h, shape: SHAPE, dryRun: true });
      const r = dry.body.result;
      if (r?.ok === true && r.applied === 2 && r.blocks === 2 && (r.skipped?.length ?? 0) === 0) {
        rect = { x: s.x, y: s.y, w: s.w, h: s.h };
        probe = s;
        break;
      }
    }
    if (!rect) {
      check(2, 'a two-block rectangle over real GHZ ground could be found', false,
        `none of ${cand.solid.length} candidates dry-ran to applied=2/blocks=2 — every later row depends on this`);
      return;
    }
    console.log(`[setup] rectangle ${JSON.stringify(rect)} — chunk ${probe.chunkId} cell ${probe.cellIndex}, `
      + `blocks ${probe.blockA} (colind ${probe.colindA}) and ${probe.blockB} (colind ${probe.colindB}), `
      + `writing shape ${SHAPE}\n`);

    // --- 2: a real rectangle applies, and the DOCUMENT agrees -------------
    const before2 = await colindSnapshot(c);
    const live = await rpc(PORT, 'editor/set_block_collision', { ...rect, shape: SHAPE });
    const after2 = await colindSnapshot(c);
    const rep = live.body.result;
    const changed2 = diffColind(before2, after2);
    const changedIds = changed2.map((d) => d.blockId).sort((a, b) => a - b);
    const wanted = [probe.blockA, probe.blockB].sort((a, b) => a - b);
    check(2, 'a real rectangle applies over GHZ, and the reply matches the document read back',
      live.body.error === undefined && rep?.ok === true
        && rep.mode === 'link' && rep.applied === 2 && rep.noop === 0 && rep.blocks === 2
        && changed2.length === rep.blocks
        && JSON.stringify(changedIds) === JSON.stringify(wanted)
        && changed2.every((d) => d.to === SHAPE),
      `reply ${JSON.stringify(rep)}\n        document diff ${JSON.stringify(changed2)} (wanted blocks ${JSON.stringify(wanted)} -> ${SHAPE})`);

    // --- 3: the same call again is a no-op, over the wire ------------------
    const before3 = await colindSnapshot(c);
    const again = await rpc(PORT, 'editor/set_block_collision', { ...rect, shape: SHAPE });
    const after3 = await colindSnapshot(c);
    const rep3 = again.body.result;
    check(3, 'the same call again is ok:true, applied:0, noop:N — idempotent over the wire',
      again.body.error === undefined && rep3?.ok === true
        && rep3.applied === 0 && rep3.noop === (rect.w * rect.h)
        && rep3.blocks === 0
        && JSON.stringify(before3) === JSON.stringify(after3),
      `reply ${JSON.stringify(rep3)}\n        document unchanged=${JSON.stringify(before3) === JSON.stringify(after3)}`);

    // --- 4: ONE rectangle = ONE undo step ---------------------------------
    //
    // HOW UNDO IS DRIVEN, stated plainly: there is NO undo over the Aether wire
    // — the editor method registry exposes no undo tool — and `window.__dbg`
    // exposes no undo action either (only `__dbg.aeon.canUndo()`, a read of
    // `focusedHistory()`). So this row presses the app's own header Undo chip
    // with real mouse events, which is the SAME `focusedHistory()?.undo()` that
    // Ctrl+Z reaches. Nothing is faked; the only thing not exercised is the
    // keybinding itself, which belongs to a different harness.
    //
    // The rectangle is re-applied from a DRAINED stack so "one step" is
    // assertable rather than inferred: after the drain the chip is disabled, so
    // if one write left the chip still enabled after one undo, the write was
    // more than one step.
    const drained = await drainUndo(c);
    const restored = await colindSnapshot(c);
    const backToStart = JSON.stringify(restored) === JSON.stringify(before2);

    const before4 = await colindSnapshot(c);
    const write4 = await rpc(PORT, 'editor/set_block_collision', { ...rect, shape: SHAPE });
    const armed = await undoEnabled(c);
    const canUndoProbe = await c.evalExpr('window.__dbg.aeon.canUndo()');
    await clickEl(c, UNDO_CHIP);
    await sleep(500);
    const after4 = await colindSnapshot(c);
    const stillArmed = await undoEnabled(c);
    check(4, 'ONE rectangle over TWO blocks is ONE undo step, and one undo restores BOTH',
      write4.body.result?.ok === true && write4.body.result.applied === 2 && write4.body.result.blocks === 2
        && armed === true && canUndoProbe === true
        && after4[probe.blockA] === before4[probe.blockA]
        && after4[probe.blockB] === before4[probe.blockB]
        && diffColind(before4, after4).length === 0
        && stillArmed === false,
      `drained ${drained} step(s) first (document back to its opening state=${backToStart}); `
      + `after the write Undo enabled=${armed} (probe ${canUndoProbe}); after ONE undo `
      + `block ${probe.blockA}: ${before4[probe.blockA]} -> ${after4[probe.blockA]}, `
      + `block ${probe.blockB}: ${before4[probe.blockB]} -> ${after4[probe.blockB]}, `
      + `whole-table diff ${JSON.stringify(diffColind(before4, after4))}, Undo still enabled=${stillArmed}`);

    // --- 5: a refusal is a RESULT, not an error ---------------------------
    //
    // Prefers a genuinely AIR rectangle; falls back to the blank block 0 and
    // then to a cell past the layout edge, because the refusal under test is the
    // ADAPTER's shape, not which skip reason produced it. Whichever is used is
    // printed, and `refusal.kind` is asserted either way.
    //
    // The last fallback is BOUNDS-CHECKED against the schema (x <= 1023,
    // y <= 127): a full-height act has no y past its edge that zod would still
    // accept, and firing one anyway would fail this row with a -32602 — row 6's
    // result reported as row 5's.
    const outsideX = level.dims.fg.width * 16;
    const outsideY = level.dims.fg.height * 16;
    const airAt = cand.air[0]
      ?? cand.block0[0]
      ?? (outsideX <= 1023 - 1 ? { x: outsideX, y: 0 }
        : outsideY <= 127 ? { x: 0, y: outsideY }
          : null);
    const airKind = cand.air[0] ? 'air' : cand.block0[0] ? 'blank block 0' : 'past the layout edge';
    if (!airAt) {
      check(5, 'a rectangle nothing can take is a JSON-RPC RESULT carrying ok:false, not a JSON-RPC error',
        false,
        `could not construct one: this act has no air cell, no adjacent blank-block pair, and no `
        + `out-of-layout coordinate inside the schema bounds (fg ${level.dims.fg.width}x${level.dims.fg.height} chunks)`);
    } else {
      const refused = await rpc(PORT, 'editor/set_block_collision',
        { x: airAt.x, y: airAt.y, w: 2, h: 1, shape: SHAPE });
      const ref5 = refused.body.result;
      check(5, 'a rectangle nothing can take is a JSON-RPC RESULT carrying ok:false, not a JSON-RPC error',
        refused.status === 200 && refused.body.error === undefined
          && ref5?.ok === false
          && ref5.refusal?.kind === 'nothing-applicable'
          && typeof ref5.message === 'string' && ref5.message.length > 0
          && typeof ref5.resolution === 'string' && ref5.resolution.length > 0
          && Array.isArray(ref5.offers),
        `aimed at (${airAt.x},${airAt.y}) — ${airKind}; status=${refused.status} `
        + `error=${JSON.stringify(refused.body.error)}\n        result ${JSON.stringify(ref5)}`);
    }

    // --- 6: an out-of-range shape is -32602, not -32603 -------------------
    //
    // THE ONLY PLACE THE SCHEMA BOUND RUNS. `planCollisionRect` never checks
    // `shape` — it writes whatever byte it is handed — so if editor-methods.ts's
    // `.min(0).max(255)` were dropped, `shape: 300` would reach
    // `classicSetColind`'s own `value < 0 || value > 255` guard, come back as a
    // thrown command rejection, and surface as -32603 INTERNAL: "Aurora broke"
    // for what is a caller's typo. `x: -1` is checked alongside as the
    // coordinate half of the same bound.
    const badShape = await rpc(PORT, 'editor/set_block_collision', { ...rect, shape: 300 });
    const badX = await rpc(PORT, 'editor/set_block_collision', { ...rect, x: -1, shape: SHAPE });
    check(6, 'shape:300 and x:-1 are INVALID_PARAMS (-32602), not INTERNAL (-32603)',
      badShape.body.error?.code === -32602 && badShape.body.result === undefined
        && badX.body.error?.code === -32602,
      `shape:300 -> code=${badShape.body.error?.code} ${JSON.stringify(badShape.body.error?.message)}\n`
      + `        x:-1     -> code=${badX.body.error?.code} ${JSON.stringify(badX.body.error?.message)}`);

    // --- 7: isolate on GHZ, against the real overhang ---------------------
    //
    // GHZ ships more blocks than its collision table has entries (439 vs 410 in
    // stock s1disasm), so `tableSpare = colind.length - blocks.length` is
    // NEGATIVE and any isolate needing even one clone refuses with
    // `isolate-grows-table`. The block ceiling (1024) is nowhere near, so the
    // ordering inside planIsolateRect picks the table refusal — that ordering is
    // part of what this row pins.
    //
    // THE RESOLUTION IS THE POINT. planIsolateRect writes one of TWO sentences:
    //   • "Use Link, accepting it changes every use of these blocks zone-wide,
    //      or paint a smaller rectangle."      — when every written block is
    //                                            INSIDE the table
    //   • "Link cannot set every block in this rectangle either — some are past
    //      the end of the table. Paint over blocks that are within it."
    // Our rectangle's blocks are provably inside the table (row 2 LINKED them
    // successfully), so the FIRST is the correct advice and the second would be
    // a false dead end. The row asserts we get the first and NOT the second —
    // i.e. the refusal does not recommend a mode this document also refuses.
    const before7 = await colindSnapshot(c);
    const iso = await rpc(PORT, 'editor/set_block_collision', { ...rect, shape: SHAPE, mode: 'isolate' });
    const after7 = await colindSnapshot(c);
    const ref7 = iso.body.result;
    const res7 = ref7?.resolution ?? '';
    check(7, 'isolate on GHZ refuses with isolate-grows-table, and its resolution recommends a mode GHZ accepts',
      iso.body.error === undefined && ref7?.ok === false
        && ref7.refusal?.kind === 'isolate-grows-table'
        && ref7.refusal.needed === 2 && ref7.refusal.spare === 0
        && ref7.refusal.blocks > ref7.refusal.colindLength          // the real GHZ overhang
        && res7.startsWith('Use Link')                              // the correct branch
        && !/Link cannot set/.test(res7)                            // NOT the dead end
        && JSON.stringify(before7) === JSON.stringify(after7),      // a refusal writes nothing
      `refusal ${JSON.stringify(ref7?.refusal)}\n        resolution ${JSON.stringify(res7)}\n`
      + `        message ${JSON.stringify(ref7?.message)}\n`
      + `        document unchanged=${JSON.stringify(before7) === JSON.stringify(after7)}`);

    // --- 8: dryRun reports the real numbers and mutates nothing -----------
    //
    // Runs LAST, after row 4 put the table back, so it plans the SAME work row 2
    // really did and its `applied` is comparable to row 2's.
    const before8 = await colindSnapshot(c);
    const dry = await rpc(PORT, 'editor/set_block_collision', { ...rect, shape: SHAPE, dryRun: true });
    const after8 = await colindSnapshot(c);
    const rep8 = dry.body.result;
    check(8, 'dryRun reports the same applied/blocks as the real call and leaves the document untouched',
      dry.body.error === undefined && rep8?.ok === true && rep8.dryRun === true
        && rep8.applied === rep?.applied && rep8.blocks === rep?.blocks && rep8.mode === 'link'
        && JSON.stringify(before8) === JSON.stringify(after8),
      `dry ${JSON.stringify(rep8)}\n        row 2 reported applied=${rep?.applied} blocks=${rep?.blocks}; `
      + `document unchanged=${JSON.stringify(before8) === JSON.stringify(after8)}`);

    // LEAVE THE DOCUMENT AS WE FOUND IT. Row 4's undo already restored the
    // table; this drains anything a later-added row leaves behind so the app
    // shuts down clean. Note there is no save_project call anywhere in this
    // file, deliberately — the disassembly on disk is never touched.
    const leftover = await drainUndo(c);
    const final = await colindSnapshot(c);
    console.log(`\n[teardown] drained ${leftover} further undo step(s); `
      + `collision table matches the opening state=${JSON.stringify(final) === JSON.stringify(before2)}`);
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
// A guard that asserts nothing passes just as loudly as one that works. Each of
// the three rows below has a SPECIFIC one-line defect that must make it FAIL
// and — the second half of the claim — must leave the OTHER rows passing, so a
// plant that breaks everything is not evidence. Rebuild
// (`VITE_AURORA_DEBUG=1 npm run build`) after each edit; revert before merging.
//
// --- ROW 4 (one rectangle = one undo step) ---------------------------------
//   FILE     src/renderer/state/collision-dispatch.ts
//   FUNCTION applyCollisionShapeRect
//   CHANGE   Replace the single dispatch
//                const result = plan.kind === 'link'
//                  ? classicSetColind(plan.entries)
//                  : classicPaintSurface(plan.plan);
//            with a per-entry LOOP, which is exactly the batching bug the row
//            exists to catch:
//                let result = { ok: true };
//                if (plan.kind === 'link') {
//                  for (const e of plan.entries) {
//                    result = classicSetColind([e]);
//                    if (!result.ok) break;
//                  }
//                } else { result = classicPaintSurface(plan.plan); }
//   EXPECT   Row 2 still PASSES (both blocks still end up at $FF, and the reply
//            still reports applied=2/blocks=2 — the report comes from the
//            planner, not from the dispatch). Row 4 FAILS: after the single
//            Undo click only ONE of the two blocks is restored, and the Undo
//            chip is still enabled (`stillArmed === true`).
//   NOTE     `classicSetColind` has its own no-op guard, so both entries must be
//            genuinely different from their current value — which the candidate
//            search already guarantees (`ca === SHAPE || cb === SHAPE` skips).
//
// --- ROW 5 (a refusal is a result, not an error) ---------------------------
//   FILE     src/renderer/agent/agent-handler.ts
//   CASE     'classic-set-block-collision'
//   CHANGE   Turn the refusal branch into a throw — the regression the row
//            names, i.e. telling every caller that Aurora broke:
//                return res.ok
//                  ? { ok: true, ...res.report, dryRun }
//                  : (() => { throw new Error(res.why); })();
//   EXPECT   Rows 2, 3, 4, 6 and 8 still PASS (they never refuse). Row 5 FAILS:
//            `refused.body.error` is present with code -32603 and
//            `refused.body.result` is undefined, so both the
//            `error === undefined` and the `ok === false` clauses go false.
//            Row 7 fails too, for the same reason and correctly — it is the
//            other refusal row.
//   WEAKER    ALTERNATIVE that isolates row 5 alone: leave the throw out and
//            instead drop the `nothing-applicable` kind, e.g. in
//            src/core/level-classic/collision-write.ts's `planCollisionRect`
//            change `refusal: { kind: 'nothing-applicable', skipped }` to
//            `refusal: { kind: 'no-level' }`. Row 5 then fails on the kind
//            assertion while every other row is untouched.
//
// --- ROW 7 (isolate refuses, with advice GHZ can actually take) ------------
//   FILE     src/core/level-classic/collision-write.ts
//   FUNCTION planIsolateRect
//   CHANGE   Invert the resolution ternary in the `isolate-grows-table` refusal
//            so it hands back the dead-end sentence:
//                resolution: distinct.every((b) => b < colind.length)
//                  ? 'Link cannot set every block in this rectangle either: some are past the end of the table. Paint over blocks that are within it.'
//                  : 'Use Link, accepting it changes every use of these blocks zone-wide, or paint a smaller rectangle.',
//   EXPECT   Every other row still PASSES — nothing else reads `resolution`.
//            Row 7 FAILS on `res7.startsWith('Use Link')` and on
//            `!/Link cannot set/.test(res7)`, while still reporting
//            `refusal.kind === 'isolate-grows-table'` — which is the point:
//            the tool "works" and the advice is a dead end.
//   SECOND   To falsify the OTHER half of row 7 (that isolate refuses at all),
//            change `if (needed > tableSpare)` to `if (needed > tableSpare + 64)`
//            in the same function. Row 7 then FAILS because the call succeeds,
//            and — the reason this plant is worth running once — row 8's
//            document-unchanged clause would catch the blocks that isolate
//            appended, proving the snapshot reader really sees writes.
