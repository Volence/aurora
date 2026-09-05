// LINK vs ISOLATE, decided once, with every refusal in one place.
//
// Link is a one-entry colind write: the block's shape changes everywhere the
// block is used, ZONE-wide. Isolate clones the block, repoints THIS chunk cell
// at the clone, and gives the clone the new shape — same pixels, different
// collision, which is what SurfaceEditPlan.newBlocks' colind override exists
// for.
//
// The refusals carry as much weight as the writes, and two of them are about
// data the editor cannot see: a block id past the end of the colind table
// resolves into the NEXT ZONE's table in ROM, so both changing it (link) and
// creating one (isolate) would define entries whose real values are unknown.
//
// Pure core — no store, no fs. `classicSetColind` and `classicPaintSurface`
// (src/renderer/state/classicLevelStore.ts) are the actual writers; this
// module only decides WHAT to hand them, and refuses what neither of them
// should be asked to do.

import { LOOP_ALIAS, locateCell, type CellAddress, type CollisionProbe } from './collision-probe';
import type { ChunkCell, LevelDoc } from './model';
import type { SurfaceEditPlan } from '../art/classic-surface-plan';

export type CollisionWriteMode = 'link' | 'isolate';

export type CollisionWritePlan =
  | { kind: 'link'; entries: { blockId: number; value: number }[]; warnings: string[] }
  | { kind: 'isolate'; plan: SurfaceEditPlan; newBlockId: number; warnings: string[] }
  /** The block already carries this shape — nothing to write, and nothing to undo. */
  | { kind: 'noop' }
  | { kind: 'refused'; why: string };

/**
 * Why one cell of a write is not written. Every one of these is CELL-LOCAL,
 * deterministic and stable across re-invocation, which is what makes them safe
 * to skip past rather than refuse on. The aggregate limits — colind growth and
 * the 1024-block ceiling — are deliberately NOT here: they are properties of
 * the whole call, and a partial application of them would depend on scan order.
 */
export type CollisionSkipReason = 'outside-layout' | 'air' | 'block0' | 'no-such-block' | 'overhang';

export type CollisionCellOutcome =
  | { kind: 'write'; blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }
  /** The block already carries this shape. Success, not a skip. */
  | { kind: 'noop' }
  | { kind: 'skip'; reason: CollisionSkipReason };

// Chunk cells reference blocks with a 10-bit field → at most 1024 blocks
// (model.ts's MAX_BLOCKS / classicLevelStore.ts's MAX_BLOCKS_TOTAL — restated
// here rather than imported because core/ must not reach into the store, and
// model.ts does not export its copy; classic-surface-plan.ts restates the
// same 10-bit fact as MAX_BLOCK_REF for the same reason).
const MAX_BLOCKS_TOTAL = 0x400; // 1024

/**
 * THE ESCAPE SENTENCE FOR A LINK OVERHANG — a dead end, and PROVABLY so.
 *
 * Both refusals used to end by recommending the OTHER mode unconditionally, and
 * on an overhang that advice is a dead end. The proof, which used to be computed
 * per-document and is now asserted:
 *
 *   an 'overhang' skip implies `blockId >= colind.length` AND — because
 *   `no-such-block` is classified FIRST — `blockId < doc.blocks.length`.
 *   Therefore `doc.blocks.length > colind.length`, therefore a clone appended at
 *   `doc.blocks.length` lands past the end of the table and Isolate refuses too.
 *
 * The hole that used to force the computation was the DANGLING ref —
 * `validateLevelDoc` bounds a chunk cell's block by the 10-bit field (model.ts,
 * `inRange(..., c.block, 0, MAX_BLOCK_REF)`), not by `doc.blocks.length`. That
 * is now its own refusal, taken before the overhang is ever considered, so the
 * implication has no hole left. IF THE CLASSIFIER'S ORDER CHANGES, REVISIT THIS:
 * a `no-such-block` cell reaching the overhang arm would make "Use Isolate"
 * right again — except that Isolate on it crashes, which is why it is refused.
 *
 * GHZ (439 blocks / 410 entries) and SBZ (602/600) are the two stock zones where
 * the overhang is real. This matters more for an agent than for a person: a
 * human sees the second refusal and stops, while an autonomous caller acts on
 * the sentence.
 */
function escapeFromLinkOverhang(doc: LevelDoc): string {
  return `Isolate cannot escape it either: this zone ships ${doc.blocks.length} blocks against ${doc.collision.colind.length} entries, so a clone would grow the table over the same overhang. Edit a block within the table, or restamp this cell to a block that is.`;
}

/**
 * WHICH OF THESE BLOCKS DOES LINK REACH NOTHING EXTRA FOR — one scan of every
 * chunk DEFINITION, answering the whole write set at once.
 *
 * A block is FULLY CONTAINED when every chunk-definition cell naming it is one
 * of the cells this call already resolved to. For such a block, Link and
 * Isolate produce the same collision everywhere in the act: Isolate would
 * repoint exactly these cells at a clone carrying the new shape, and there is no
 * other cell left holding the old one. That is what turns the escape sentence
 * from a hedge into a guarantee.
 *
 * TWO TRAPS, both of which this function exists to avoid, and neither of which
 * is visible from the call site:
 *
 *  1. IT SCANS DEFINITIONS, NOT THE LAYOUT. A chunk definition can exist with no
 *     placement in the FG plane at all. Its cells are unreachable by any
 *     selection a person or an agent could make — but a Link write still changes
 *     their collision, latently, surfacing the day that chunk is stamped. Walking
 *     only the chunks the layout references would call such a block contained and
 *     promise a guarantee that is false. (`blockCellsAffected` in
 *     `planCollisionCells` counts the same population for the same reason.)
 *
 *  2. IT SAYS NOTHING ABOUT THE COLIND TABLE. `classifyCollisionCell` skips
 *     overhang blocks in LINK mode only, so an ISOLATE write set can contain
 *     blocks past the end of the table — blocks Link cannot set either. Callers
 *     must AND this answer with `blockId < colind.length` before recommending
 *     Link, or the refusal recommends a mode the same document also refuses.
 *
 * Covering a definition cell through any ONE placement covers all of them, since
 * both modes write the definition tier and not the layout.
 *
 * Returns the contained ids in `candidates` order, so a caller's reported set
 * lines up with its `distinct` array.
 */
function fullyContainedBlocks(
  doc: LevelDoc,
  candidates: readonly number[],
  covered: readonly { chunkIndex: number; cellIndex: number }[],
): number[] {
  const wanted = new Set(candidates);
  const inSelection = new Set(covered.map((c) => `${c.chunkIndex}:${c.cellIndex}`));

  // Blocks with at least one naming definition cell the selection does not
  // cover. Collected as the complement because the scan sees the counterexample,
  // not the proof.
  const escaped = new Set<number>();
  for (let ci = 0; ci < doc.chunks.length; ci++) {
    const cells = doc.chunks[ci].cells;
    for (let k = 0; k < cells.length; k++) {
      const b = cells[k].block;
      if (!wanted.has(b) || escaped.has(b)) continue;
      if (!inSelection.has(`${ci}:${k}`)) escaped.add(b);
    }
  }
  return candidates.filter((b) => !escaped.has(b));
}

/**
 * THE ESCAPE SENTENCE FOR AN ISOLATE THAT WOULD GROW THE TABLE — three answers,
 * and only one of them is a hedge.
 *
 * `contained` is `fullyContainedBlocks` for this one cell, which is the
 * degenerate case: the selection is a single definition cell, so containment
 * means "no chunk definition anywhere names this block except the cell that was
 * clicked". The caller computes it because THIS function has no notion of a
 * selection and must not invent one — a `doc`-only containment test would have
 * to assume the selection, and assuming it is what makes a guarantee false.
 *
 * WHY THE GUARANTEE IS TRUE when both conditions hold: Isolate would clone the
 * block, repoint this cell at the clone and give the clone the shape. Link gives
 * the shape to the block itself. No other chunk cell names that block, so no
 * collision anywhere in the act differs between the two. (The one residue is
 * that Link also changes what the block would contribute if it were stamped
 * SOMEWHERE NEW later — which is a statement about a document that does not
 * exist yet, not about the collision this call is being asked to change.)
 */
function escapeFromIsolateGrowth(doc: LevelDoc, blockId: number, contained: boolean): string {
  if (blockId >= doc.collision.colind.length) {
    return `Link cannot set block ${blockId} either: it is past the end of the table. Edit a block within the table, or restamp this cell to a block that is.`;
  }
  if (contained) {
    return `Use Link: no chunk-definition cell outside this one names block ${blockId}, so Link changes exactly what Isolate would have changed here, and costs no table entry.`;
  }
  return `Use Link, accepting it changes every use of block ${blockId}.`;
}

/**
 * THE PER-CELL DECISION, in one place, for both the single-cell panel path and
 * the rectangle tool. Everything except the aggregate capacity limits.
 *
 * Re-derives the block from `doc` rather than trusting any cached address — a
 * probe survives undo, so it can name a block the cell no longer references.
 *
 * The ORDER mirrors the engine's own short-circuit order: block 0 is tested
 * before solidity and before colind is ever read.
 */
export function classifyCollisionCell(
  doc: LevelDoc,
  at: CellAddress,
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionCellOutcome {
  if (at.chunkIndex === null) return { kind: 'skip', reason: 'air' };

  const cell = doc.chunks[at.chunkIndex]?.cells[at.cellIndex];
  const blockId = cell?.block ?? 0;

  // Block 0 is the blank block. FindFloor short-circuits before it ever reads
  // solidity or colind, so a shape stored here can never apply in game.
  if (blockId === 0) return { kind: 'skip', reason: 'block0' };

  // A DANGLING REF, and it must be tested HERE — after block 0, BEFORE the
  // no-op. `validateLevelDoc` bounds a chunk cell's block by the 10-bit field
  // (model.ts, `inRange(..., c.block, 0, MAX_BLOCK_REF)`) and NOT by
  // `doc.blocks.length`, so a cell naming a block the document does not have is
  // representable inside a document that validates.
  //
  // WHY BEFORE THE NO-OP: the no-op test reads `colind[blockId] ?? 0`, so a
  // dangling ref past the end of the table answers 0 for a shape it does not
  // have — asked for shape 0 it would return `noop`, reporting SUCCESS on
  // garbage. For an autonomous caller that is worse than the crash below.
  //
  // WHY AT ALL: Isolate means "clone the block, keep its pixels, change its
  // shape", and there is no block to clone. The plan emitted `def:
  // doc.blocks[blockId]` = undefined into SurfaceEditPlan.newBlocks and
  // `classicPaintSurface`'s `b.def.cells.map` (classicLevelStore.ts:1025) threw
  // — a -32603 INTERNAL at the agent surface. Link is no better: it would spend
  // a colind entry on a block that does not exist.
  if (blockId >= doc.blocks.length) return { kind: 'skip', reason: 'no-such-block' };

  // ALREADY THIS SHAPE → nothing to do, in EITHER mode.
  //
  // `classicSetColind` has this guard (classicLevelStore.ts:1286) so a link
  // that changes nothing records no undo step. Isolate had no equivalent, and
  // its cost is far higher than a wasted undo entry: re-picking the swatch the
  // panel already highlights as current would clone a block and spend a colind
  // entry to arrive at collision identical to the block it copied — exactly the
  // capacity this file's ceiling and table-growth refusals exist to protect.
  if ((doc.collision.colind[blockId] ?? 0) === shapeIndex) return { kind: 'noop' };

  // THE OVERHANG, link mode only. A block id past the end of the colind table
  // resolves into the ADJACENT ZONE's table in ROM, so writing it would
  // silently redefine another zone's collision. Isolate has no per-cell
  // equivalent: it never writes the existing id, and its own limit is aggregate.
  if (mode === 'link' && blockId >= doc.collision.colind.length) {
    return { kind: 'skip', reason: 'overhang' };
  }

  return { kind: 'write', blockId, chunkIndex: at.chunkIndex, cellIndex: at.cellIndex, cell: cell! };
}

/** The block a cell references right now, or 0. Used only for refusal wording. */
function blockIdAt(doc: LevelDoc, at: CellAddress): number {
  return (at.chunkIndex === null ? 0 : doc.chunks[at.chunkIndex]?.cells[at.cellIndex]?.block) ?? 0;
}

/**
 * The one sentence for each skip reason, shared by the panel (which shows it as
 * a refusal) and the agent tool (which shows it as the dominant reason when a
 * whole rectangle skipped). Written once so the two cannot drift.
 */
export function skipRefusal(doc: LevelDoc, reason: CollisionSkipReason, blockId: number): string {
  switch (reason) {
    case 'outside-layout':
      return `this cell is outside the act's layout (${doc.fg.width * 16} x ${doc.fg.height * 16} cells)`;
    case 'air':
      return 'no chunk is stamped here; this cell is air';
    case 'block0':
      return 'block 0 is the blank block: the engine short-circuits before reading its collision, so a shape here can never apply';
    case 'no-such-block':
      return `this cell names block ${blockId}, but this act has only ${doc.blocks.length} blocks; the reference is dangling. Restamp the cell to a block that exists.`;
    case 'overhang':
      return `block ${blockId} is past the end of this zone's collision table (${doc.collision.colind.length} entries); the overhang resolves into the adjacent zone's table in ROM, so Aurora cannot set it without silently changing other blocks. ${escapeFromLinkOverhang(doc)}`;
  }
}

/**
 * Decide how to write shape `shapeIndex` to the block under the cell `probe`
 * named, in `mode`. Re-derives the block from `doc` at `probe.chunkIndex` /
 * `probe.cellIndex` rather than trusting `probe.blockId` — a probe survives
 * undo, so it can go stale and name a block the cell no longer references.
 */
export function planCollisionWrite(
  doc: LevelDoc,
  probe: CollisionProbe,
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionWritePlan {
  const at: CellAddress = {
    chunkId: probe.chunkId,
    chunkIndex: probe.chunkIndex,
    cellIndex: probe.cellIndex,
    looping: probe.looping,
    loopAmbiguous: probe.loopAmbiguous,
  };
  const outcome = classifyCollisionCell(doc, at, shapeIndex, mode);

  // A SKIP IS A REFUSAL ON THIS PATH, and that asymmetry is deliberate. This is
  // the answer to a CLICK: the person aimed at one cell, and "nothing happened"
  // with no sentence is the worst possible reply. The rectangle path turns the
  // same outcomes into counts instead, because a rectangle over a slope
  // legitimately contains air. Same classifier, two contracts.
  if (outcome.kind === 'skip') {
    return { kind: 'refused', why: skipRefusal(doc, outcome.reason, blockIdAt(doc, at)) };
  }
  if (outcome.kind === 'noop') return { kind: 'noop' };

  // The classifier carries the ADDRESS back out as well as the block, and this
  // path uses its copy rather than the probe's: `probe.chunkIndex` is
  // `number | null` and it is `classifyCollisionCell` that resolved the null,
  // so taking it from the outcome is both narrower and the single source.
  const { blockId, cell, chunkIndex, cellIndex } = outcome;
  const colind = doc.collision.colind;

  const warnings: string[] = [];
  // $28 behind a loop may be read as $51 while the player's sprite_looping_bit
  // is set — runtime state no editor can see. Valid for one of the two
  // answers, so it proceeds rather than being refused, and says so.
  if (probe.loopAmbiguous) {
    warnings.push(
      'this cell is behind a loop: the engine may read chunk $51 instead of $28 while the player is looping, so this write may not be the one that applies',
    );
  }

  if (mode === 'link') return { kind: 'link', entries: [{ blockId, value: shapeIndex }], warnings };

  // mode === 'isolate'
  const newBlockId = doc.blocks.length;
  if (newBlockId >= MAX_BLOCKS_TOTAL) {
    return {
      kind: 'refused',
      why: `block capacity reached: ${MAX_BLOCKS_TOTAL} blocks max (chunk cells reference blocks with a 10-bit field); this zone's ceiling has no room for another clone`,
    };
  }

  // Isolate appends a block at `newBlockId`. classicPaintSurface then grows
  // colind to cover it, which — per its own comment — "necessarily defines
  // the entries in between" as zeros. Those entries, if any lie past the
  // table's current end, resolve into the ADJACENT ZONE's table in ROM (same
  // fact as the link-mode refusal above), so growing over them is refused
  // rather than guessed.
  const extendsTableBy = newBlockId + 1 - colind.length;
  if (extendsTableBy > 0) {
    // The selection here is ONE definition cell — the one the classifier
    // resolved — so the general containment scan is asked the degenerate
    // question, with the same answer the rectangle path gets.
    const contained = fullyContainedBlocks(doc, [blockId], [{ chunkIndex, cellIndex }]).length === 1;
    return {
      kind: 'refused',
      why: `isolating this block would grow this zone's collision table by ${extendsTableBy} entr${extendsTableBy === 1 ? 'y' : 'ies'} (${colind.length} → ${newBlockId + 1}); those entries resolve into the adjacent zone's table in ROM, so Aurora cannot define them. ${escapeFromIsolateGrowth(doc, blockId, contained)}`,
    };
  }

  const plan: SurfaceEditPlan = {
    tileWrites: [],
    newBlocks: [{ def: doc.blocks[blockId], sourceBlockId: blockId, colind: shapeIndex }],
    blockCellEdits: [],
    chunkCellEdits: [
      {
        chunkIndex,
        cellIndex,
        cell: { block: newBlockId, xf: cell.xf, yf: cell.yf, solidity: cell.solidity },
      },
    ],
    stats: { tilesClaimed: 0, blocksCloned: 1, placesAffected: 1 },
  };

  return { kind: 'isolate', plan, newBlockId, warnings };
}

// ---------------------------------------------------------------------------
// The RECTANGLE path
// ---------------------------------------------------------------------------

export interface CollisionRect { x: number; y: number; w: number; h: number }

/** One skipped cell, in the CALLER'S 16px FG coordinates. */
export interface CollisionSkippedCell {
  x: number;
  y: number;
  reason: CollisionSkipReason;
}

/**
 * How many skipped cells `CollisionRectReport.skippedCells` will name before it
 * stops. THE LIST IS BOUNDED AND THE COUNTS ARE NOT — a 1024x128 selection over
 * mostly-air skips six figures of cells, and returning that many objects would
 * dwarf the rest of the reply for a caller that wanted a hint, not a dump.
 *
 * 32 because a classic chunk is 16x16 FG cells: a chunk-wide selection gets its
 * first TWO full rows, which is the smallest window that distinguishes a
 * horizontal coordinate error (the same columns skip on both rows) from a
 * vertical one (a whole row skips and the next does not). One row could not.
 */
export const SKIPPED_CELLS_CAP = 32;

export interface CollisionRectReport {
  mode: CollisionWriteMode;
  /** CELLS whose block did not carry the shape and now will. */
  applied: number;
  /** CELLS whose block already carried it. Success, not a skip. */
  noop: number;
  /**
   * THE AUTHORITATIVE TOTALS, per reason. `skippedCells` below is a bounded
   * prefix of the same population and its length is NOT this — read the counts,
   * always, for "how many".
   */
  skipped: { reason: CollisionSkipReason; count: number }[];
  /**
   * WHICH cells were skipped — the FIRST `SKIPPED_CELLS_CAP` of them, in scan
   * order, in the coordinates the CALLER passed.
   *
   * WHY THIS EXISTS AT ALL, when `skipped` already counts them: a caller that
   * asked for a 4-cell slope and got `applied: 2, skipped: [{ block0, 2 }]`
   * cannot tell whether the two blank cells were the two it expected to be air
   * (fine, carry on) or the two it most cared about (its coordinates are off by
   * two). Counts are the right tier for `applied` and `blocks`, which are about
   * BLOCKS; skips are about CELLS, and collapsing cells to a count throws away
   * the one axis the caller controls. Without this the only way to find out is
   * to probe cell by cell — exactly the round-trip this reply exists to save.
   *
   * FIRST-N IN SCAN ORDER, NOT SAMPLED. Two identical calls must return
   * identical lists; a sampled or set-ordered list would make a retry disagree
   * with the call it retried, which is worse than no list. Entries are NOT
   * grouped by reason and NOT deduped by reason — the interleaving IS the
   * information, because it is what maps a reason onto a position.
   *
   * ITS LENGTH IS NOT A COUNT OF ANYTHING the caller wants. `skipped` holds the
   * totals; this stops at the cap. `skippedCellsTruncated` says when the two
   * diverge, so a caller reading the type alone is told, rather than having to
   * infer it from `length === SKIPPED_CELLS_CAP`.
   */
  skippedCells: CollisionSkippedCell[];
  /**
   * TRUE when more cells were skipped than `skippedCells` could hold — i.e.
   * exactly when `skippedCells.length` is NOT the number of skipped cells.
   *
   * Derived from the `skipped` totals rather than from a second counter, so the
   * flag cannot drift from the numbers it is a statement about. It is carried
   * as its own field rather than left implicit because the failure mode it
   * guards against is a caller reading `skippedCells.length` as a total, and a
   * caller doing that is by definition not consulting the cap.
   */
  skippedCellsTruncated: boolean;
  /** DISTINCT blocks written. */
  blocks: number;
  /**
   * LINK only. Chunk-DEFINITION cells naming a written block — NOT map
   * positions, and not the rectangle. A link changes the block everywhere it is
   * used, zone-wide, and this is the closest honest number the editor can give
   * cheaply. It still UNDERSTATES the real reach, which is each of these
   * multiplied by its chunk's placements across all three acts.
   */
  blockCellsAffected?: number;
  /** ISOLATE only. */
  isolate?: { blocksCloned: number; chunkCellsRepointed: number; chunksTouched: number };
  warnings: string[];
}

/**
 * WHY A CALL WROTE NOTHING, as a discriminant an agent can branch on.
 *
 * Each kind means ONE thing and carries the numbers that thing is about.
 * 'nothing-applicable' in particular means "cells were scanned and none could
 * take a shape" — it is NOT the bucket for every failure, which is why the two
 * kinds below it that the dispatcher owns exist separately: a call with no
 * document scanned no cells, and a call the store rejected had applicable cells
 * whose `skipped` counts say nothing about the rejection. A human reads `why`
 * and is fine either way; an agent branching on `kind` is not.
 */
export type CollisionRectRefusal =
  | { kind: 'nothing-applicable'; skipped: { reason: CollisionSkipReason; count: number }[] }
  | {
      kind: 'isolate-grows-table'; needed: number; spare: number; colindLength: number; blocks: number;
      /**
       * The blocks in this selection for which LINK IS EXACTLY EQUIVALENT to the
       * refused Isolate: every chunk-definition cell naming them is inside the
       * selection (so Link reaches nothing Isolate would have spared) AND they
       * are inside the colind table (so Link can set them at all). Both halves
       * are required — see `fullyContainedBlocks`.
       *
       * Carried as data, not only as prose, because the caller acting on this
       * refusal is often an agent: `resolution` says WHETHER, this says WHICH,
       * and re-deriving it needs a scan of every chunk definition that the
       * agent surface cannot cheaply run. Empty when the answer is "none".
       */
      linkEquivalent: number[];
    }
  | { kind: 'block-ceiling'; needed: number; spare: number }
  /** No act is open — nothing was scanned. Raised by the dispatcher, not here. */
  | { kind: 'no-level' }
  /**
   * The planner said the write was legal and the store command refused it. An
   * Aurora bug rather than a fact about the document, and raised by the
   * dispatcher — the only place that can see both answers.
   */
  | { kind: 'store-disagreement'; error: string };

export type CollisionRectPlan =
  | { kind: 'link'; entries: { blockId: number; value: number }[]; report: CollisionRectReport }
  | { kind: 'isolate'; plan: SurfaceEditPlan; report: CollisionRectReport }
  /** Everything already carried the shape. Success, and NO command to dispatch. */
  | { kind: 'nothing'; report: CollisionRectReport }
  | { kind: 'refused'; refusal: CollisionRectRefusal; why: string; resolution: string; report: CollisionRectReport };

/** One FG cell, in 16px units. */
export interface CollisionCell { x: number; y: number }

/**
 * Plan ONE write of `shapeIndex` across an arbitrary SET of FG cells.
 *
 * The general form. `planCollisionRect` is this with the rectangle expanded —
 * a rectangle is just the cell set a marquee produces, and keeping one planner
 * is what stops the human gesture and the agent tool from drifting apart.
 *
 * WHY THIS IS ONE CALL AND NOT A LOOP OVER `planCollisionWrite`: a stroke must
 * be one undo step, and one undo step means one store command. Isolate in
 * particular cannot be looped — every call would compute the same
 * `doc.blocks.length` for its clone id and they would collide.
 *
 * DEDUPES ITS INPUT. A rectangle scan visits each cell once, but a freehand
 * drag revisits them constantly — a wiggling cursor crosses the same cell
 * dozens of times. The viewport dedupes its own stroke as well, but this
 * function must not depend on that: it is pure core with a second caller.
 *
 * PARTIAL BY DESIGN, in one direction only. Per-cell skips (air, block 0, a
 * link-mode overhang block, cells past the layout edge) are expected inside any
 * real selection — a slope's bounding box contains air — so they are counted and
 * stepped over. The AGGREGATE limits are not: which cells would land under a
 * half-satisfied clone budget is a function of scan order, so those refuse the
 * whole call.
 */
export function planCollisionCells(
  doc: LevelDoc,
  cells: readonly CollisionCell[],
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionRectPlan {
  const skips = new Map<CollisionSkipReason, number>();
  // A FLAT ARRAY, appended to in scan order — deliberately not a Map or a Set
  // keyed by reason. Those would either lose the interleaving (which is the
  // only thing that maps a reason onto a POSITION) or dedupe cells that differ
  // only in coordinate, and either way two identical calls could disagree.
  const skippedCells: CollisionSkippedCell[] = [];
  // The counts are unconditional; only the LIST stops at the cap. Capping both
  // would make the totals stop being authoritative, which is the whole reason
  // the two fields are separate.
  const bump = (r: CollisionSkipReason, x: number, y: number) => {
    skips.set(r, (skips.get(r) ?? 0) + 1);
    if (skippedCells.length < SKIPPED_CELLS_CAP) skippedCells.push({ x, y, reason: r });
  };
  const writes: { blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }[] = [];
  let noop = 0;
  let ambiguous = 0;

  // Deduped by cell coordinate, insertion-ordered, so counts are honest and the
  // scan order stays deterministic (first-seen).
  const seenCells = new Set<string>();
  for (const c of cells) {
    const key = `${c.x},${c.y}`;
    if (seenCells.has(key)) continue;
    seenCells.add(key);

    const at = locateCell(doc, c.x, c.y);
    // `classifyCollisionCell` never returns 'outside-layout': a CellAddress
    // already implies the cell is inside, because locateCell returns null
    // outside. The reason is MANUFACTURED here, before the classifier runs.
    // The CALLER'S coordinates, both here and below. For an outside-layout cell
    // there is no CellAddress to report instead, and for an inside one the
    // chunk-definition cell is the wrong answer anyway: two FG cells reach the
    // same definition cell through two placements, and only the caller's own
    // coordinate is something the caller can act on.
    if (!at) { bump('outside-layout', c.x, c.y); continue; }
    const outcome = classifyCollisionCell(doc, at, shapeIndex, mode);
    if (outcome.kind === 'skip') { bump(outcome.reason, c.x, c.y); continue; }
    if (outcome.kind === 'noop') { noop++; continue; }
    if (at.loopAmbiguous) ambiguous++;
    writes.push(outcome);
  }

  const skipped = [...skips].map(([reason, count]) => ({ reason, count }));
  const warnings: string[] = [];
  // ONE warning carrying a count, not one per cell: a rectangle across a loop
  // would otherwise return hundreds of identical sentences.
  if (ambiguous > 0) {
    warnings.push(
      `${ambiguous} cell${ambiguous === 1 ? ' is' : 's are'} behind a loop: the engine may read chunk $${LOOP_ALIAS.to.toString(16)} instead of $${LOOP_ALIAS.from.toString(16)} while the player is looping, so those writes may not be the ones that apply`,
    );
  }

  const distinct = [...new Set(writes.map((w) => w.blockId))];
  const base: CollisionRectReport = {
    mode, applied: writes.length, noop, skipped, blocks: distinct.length,
    skippedCells,
    // Derived from the AUTHORITATIVE counts, not from a parallel tally, so the
    // flag and the numbers it describes cannot drift.
    skippedCellsTruncated: skipped.reduce((n, s) => n + s.count, 0) > skippedCells.length,
    warnings,
  };

  // THE SUCCESS PREDICATE, stated once. Nothing written AND nothing already
  // right is a refusal — almost always a coordinate mistake. Nothing written
  // but something already right is SUCCESS: the world matches the request, and
  // an agent retrying after a timeout must not be told it failed.
  if (writes.length === 0 && noop === 0) {
    return {
      kind: 'refused',
      refusal: { kind: 'nothing-applicable', skipped },
      why: dominantSkipWhy(skipped),
      resolution: 'Check the rectangle\'s coordinates: they are in 16px FG CELL units, not pixels and not chunks.',
      report: base,
    };
  }
  if (writes.length === 0) return { kind: 'nothing', report: base };

  if (mode === 'link') {
    // ONE scan of every chunk definition, not one per written cell: the counts
    // are per BLOCK, so the whole distinct set is answered in a single pass.
    let blockCellsAffected = 0;
    const written = new Set(distinct);
    for (const c of doc.chunks) for (const cc of c.cells) if (written.has(cc.block)) blockCellsAffected++;
    return {
      kind: 'link',
      // DEDUPED. Two cells sharing a block are ONE colind entry, and emitting
      // the entry twice would make the store's undo step and the report's
      // `blocks` count disagree about how many blocks the rectangle touched.
      entries: distinct.map((blockId) => ({ blockId, value: shapeIndex })),
      report: { ...base, blockCellsAffected },
    };
  }

  return planIsolateRect(doc, writes, distinct, shapeIndex, base); // Task 5
}

/**
 * Plan a RECTANGLE of FG cells — `planCollisionCells` with the box expanded.
 *
 * Kept as its own entry point because it is the agent tool's contract
 * (`set_block_collision` takes x/y/w/h) and because a rectangle can be stated
 * in four numbers where its cell list cannot.
 *
 * A degenerate rectangle (`w` or `h` of 0) expands to an EMPTY list and lands on
 * the same empty refusal the freehand path gets — which is why
 * `dominantSkipWhy`'s empty sentence must be true of both.
 */
export function planCollisionRect(
  doc: LevelDoc,
  rect: CollisionRect,
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionRectPlan {
  const cells: CollisionCell[] = [];
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) cells.push({ x: rect.x + dx, y: rect.y + dy });
  }
  return planCollisionCells(doc, cells, shapeIndex, mode);
}

/**
 * A short phrase per skip reason, for counting rather than for explaining.
 *
 * DELIBERATELY NOT `skipRefusal`. That function writes the single-cell
 * refusal, and two of its sentences are about a SPECIFIC block ("block 412 is
 * past the end of..."). A rectangle's summary has no single block to name, and
 * passing a placeholder id would print a confident sentence about block 0 —
 * which is a different refusal entirely.
 */
function skipPhrase(reason: CollisionSkipReason): string {
  switch (reason) {
    case 'outside-layout': return 'outside the layout';
    case 'air': return 'air: no chunk is stamped there';
    case 'block0': return 'the blank block 0, whose collision the engine never reads';
    case 'no-such-block': return 'blocks this act does not have (dangling references)';
    case 'overhang': return 'blocks past the end of this zone\'s collision table';
  }
}

/**
 * The sentence for a rectangle that wrote nothing: the reason that accounted for
 * the most cells, so "you aimed at air" and "you aimed at blank blocks" are
 * distinguishable. Ties break by the array's own order, which is first-seen in
 * row-major scan — deterministic, and the tie is cosmetic.
 *
 * The empty case is not decoration, and it now has TWO ways in. A zero-width or
 * zero-height rectangle expands to no cells at all, and a freehand stroke can
 * hand over an empty list — either way nothing is applied, nothing matches and
 * nothing is skipped, so this function is reached with an empty array and an
 * unseeded reduce over one throws. An agent that passes `w: 0` must get a
 * sentence back, not a TypeError. The sentence is worded for BOTH callers: it
 * must not claim a width or a height, because a cell list has neither.
 */
function dominantSkipWhy(skipped: { reason: CollisionSkipReason; count: number }[]): string {
  if (skipped.length === 0) {
    return 'no cells were given to write to: a rectangle with a zero width or height covers none';
  }
  const total = skipped.reduce((n, s) => n + s.count, 0);
  const top = skipped.reduce((a, b) => (b.count > a.count ? b : a));
  return `no cell in this rectangle could take a shape: ${top.count} of ${total} ${top.count === 1 ? 'is' : 'are'} ${skipPhrase(top.reason)}`;
}

/**
 * ONE CLONE PER DISTINCT BLOCK, and that is only correct because every cell of
 * the rectangle receives the SAME shape.
 *
 * `planSurfaceEdit` keys its clones by CHUNK CELL for the opposite reason
 * (classic-surface-plan.ts: "two painted chunk cells that share a block each
 * need their OWN clone") — there the per-cell pixels differ, so sharing a clone
 * would lose paint. Here they cannot differ. IF THIS TOOL EVER TAKES A SHAPE PER
 * CELL, this dedupe becomes wrong and must move to a per-cell key.
 *
 * The aggregate limits live here rather than in the store because
 * `classicPaintSurface` checks NEITHER: it grows colind silently with
 * `Math.max(nextBlocks.length, src.length)` and has no ceiling check at all
 * (collision-write.test.ts's "refuses an isolate at the block ceiling" is the
 * standing note of that).
 *
 * THE TWO CHECKS BELOW ARE ONE QUESTION SPLIT IN TWO — "do `needed` clones fit
 * in this document at all?", which is `doc.blocks.length + needed` against BOTH
 * `colind.length` and the 10-bit ceiling. They are written out separately
 * because each half needs its own refusal kind and its own numbers, and they
 * must stay in step with each other: an Isolate that clears one and not the
 * other is not a legal plan.
 *
 * The single-cell path (`planCollisionWrite`) asks the same question inline for
 * `needed = 1`, and the two must keep agreeing — if they ever diverge, the panel
 * would recommend a mode this planner refuses, the exact defect an earlier task
 * removed.
 */
function planIsolateRect(
  doc: LevelDoc,
  writes: { blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }[],
  distinct: number[],
  shapeIndex: number,
  base: CollisionRectReport,
): CollisionRectPlan {
  const colind = doc.collision.colind;
  const needed = distinct.length;

  // THE CEILING FIRST, and the order matters when BOTH would fire. The 10-bit
  // block field is absolute — no zone, no table and no smaller rectangle can
  // make a 1025th block encodable — while the table-growth refusal is a
  // property of this zone's data. Naming the hard wall first is the honest
  // answer, and its resolution ("Link, or a smaller rectangle") stays true in
  // the both-fail case, whereas the growth refusal's resolution would offer
  // Link as if the ceiling were not also in the way.
  const ceilingSpare = MAX_BLOCKS_TOTAL - doc.blocks.length;
  if (needed > ceilingSpare) {
    return {
      kind: 'refused',
      refusal: { kind: 'block-ceiling', needed, spare: Math.max(0, ceilingSpare) },
      why: `this rectangle needs ${needed} new block${needed === 1 ? '' : 's'} and only ${Math.max(0, ceilingSpare)} fit: ${MAX_BLOCKS_TOTAL} blocks max (chunk cells reference blocks with a 10-bit field)`,
      resolution: 'Use Link, accepting it changes every use of these blocks, or paint a smaller rectangle.',
      report: base,
    };
  }

  // Isolate appends blocks at doc.blocks.length.. and classicPaintSurface then
  // grows colind to cover them, which — per its own comment — "necessarily
  // defines the entries in between" as zeros. Any of those past the table's
  // current end resolve into the ADJACENT ZONE's table in ROM, so growing over
  // them is refused rather than guessed.
  const tableSpare = colind.length - doc.blocks.length;
  if (needed > tableSpare) {
    const grow = doc.blocks.length + needed - colind.length;

    // THREE ANSWERS, not two. The table check comes first and is unchanged: if
    // ANY written block is past the end of the table, Link cannot set it either
    // and recommending Link would be the dead end an earlier task removed.
    //
    // Otherwise Link is available — and the question is whether it costs
    // anything. `linkEquivalent` is the subset for which it does not; when that
    // is the WHOLE selection the sentence stops hedging, because there is no
    // collateral left to warn about. All-or-nothing on purpose: one sentence
    // covers the whole call, and "some of these are free" is not actionable
    // without knowing which — which is what the payload field is for.
    const allInTable = distinct.every((b) => b < colind.length);
    const linkEquivalent = allInTable
      ? fullyContainedBlocks(doc, distinct, writes)
      : [];
    const guaranteed = allInTable && linkEquivalent.length === distinct.length;

    return {
      kind: 'refused',
      refusal: {
        kind: 'isolate-grows-table', needed, spare: Math.max(0, tableSpare),
        colindLength: colind.length, blocks: doc.blocks.length, linkEquivalent,
      },
      why: `isolating this rectangle needs ${needed} new block${needed === 1 ? '' : 's'} and this zone's collision table has room for ${Math.max(0, tableSpare)}: it would grow by ${grow} entr${grow === 1 ? 'y' : 'ies'} (${colind.length} → ${doc.blocks.length + needed}), and those entries resolve into the adjacent zone's table in ROM, so Aurora cannot define them.`,
      resolution: !allInTable
        ? 'Link cannot set every block in this rectangle either: some are past the end of the table. Paint over blocks that are within it.'
        : guaranteed
          ? `Use Link: every chunk-definition cell naming ${needed === 1 ? 'this block' : 'these blocks'} is inside this selection, so Link changes exactly what Isolate would have changed, and costs no table entry.`
          : 'Use Link, accepting it changes every use of these blocks zone-wide, or paint a smaller rectangle.',
      report: base,
    };
  }

  const cloneFor = new Map<number, number>();
  distinct.forEach((blockId, i) => cloneFor.set(blockId, doc.blocks.length + i));

  // De-duped by (chunkIndex, cellIndex): a rectangle spanning two placements of
  // the same chunk resolves to the same DEFINITION cell twice. Harmless in the
  // store (same value, last wins) but it would inflate every reported count.
  const seen = new Set<string>();
  const chunkCellEdits: SurfaceEditPlan['chunkCellEdits'] = [];
  const chunks = new Set<number>();
  for (const w of writes) {
    const key = `${w.chunkIndex}:${w.cellIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.add(w.chunkIndex);
    chunkCellEdits.push({
      chunkIndex: w.chunkIndex,
      cellIndex: w.cellIndex,
      // Flips and solidity come from THIS cell, re-read from the doc — two cells
      // can share a block and differ in both.
      cell: { block: cloneFor.get(w.blockId)!, xf: w.cell.xf, yf: w.cell.yf, solidity: w.cell.solidity },
    });
  }

  const plan: SurfaceEditPlan = {
    tileWrites: [],
    // The id of newBlocks[i] is doc.blocks.length + i by SurfaceEditPlan's own
    // contract, which is exactly what `cloneFor` assigned above — the two are
    // built from the SAME `distinct` array in the same order, so they cannot
    // drift apart without one of these two lines changing.
    newBlocks: distinct.map((blockId) => ({
      def: doc.blocks[blockId], sourceBlockId: blockId, colind: shapeIndex,
    })),
    blockCellEdits: [],
    chunkCellEdits,
    stats: { tilesClaimed: 0, blocksCloned: needed, placesAffected: chunkCellEdits.length },
  };

  return {
    kind: 'isolate',
    plan,
    report: {
      ...base,
      isolate: { blocksCloned: needed, chunkCellsRepointed: chunkCellEdits.length, chunksTouched: chunks.size },
    },
  };
}
