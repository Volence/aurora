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
export type CollisionSkipReason = 'outside-layout' | 'air' | 'block0' | 'overhang';

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
 * Would an Isolate clone fit in this document at all?
 *
 * Isolate appends ONE block at `doc.blocks.length` and `classicPaintSurface`
 * then grows colind to cover it — which necessarily defines every entry in
 * between, and any of those past the table's current end resolve into the
 * ADJACENT ZONE's table in ROM. So a clone "fits" only when the table already
 * covers the id, and when the 10-bit block field still has room.
 */
function isolateFits(doc: LevelDoc, clones: number): boolean {
  const next = doc.blocks.length + clones;
  return next <= doc.collision.colind.length && next <= MAX_BLOCKS_TOTAL;
}

/**
 * THE ESCAPE SENTENCE, COMPUTED RATHER THAN ASSERTED.
 *
 * Both refusals used to end by recommending the OTHER mode unconditionally, and
 * on the documents where they fire that advice is usually a dead end: Link's
 * overhang refusal needs `blockId >= colind.length`, which on any document whose
 * chunk cells reference blocks that exist means `doc.blocks.length >
 * colind.length`, which is exactly what makes Isolate refuse too. GHZ (439
 * blocks / 410 entries) and SBZ (602/600) are the two stock zones where this is
 * real.
 *
 * It is COMPUTED and not asserted because the implication has a hole:
 * `validateLevelDoc` bounds a chunk cell's block ref by the 10-bit field
 * (model.ts, `inRange(..., c.block, 0, MAX_BLOCK_REF)`), NOT by
 * `doc.blocks.length` — so a dangling ref is representable and would break the
 * proof. Asking the document is robust either way and costs one boolean.
 *
 * This matters more for an agent than for a person: a human sees the second
 * refusal and stops, while an autonomous caller acts on the sentence.
 */
function escapeFromLinkOverhang(doc: LevelDoc): string {
  if (isolateFits(doc, 1)) return 'Use Isolate, or edit a block within the table.';
  return `Isolate cannot escape it either — this zone ships ${doc.blocks.length} blocks against ${doc.collision.colind.length} entries, so a clone would grow the table over the same overhang. Edit a block within the table, or restamp this cell to a block that is.`;
}

function escapeFromIsolateGrowth(doc: LevelDoc, blockId: number): string {
  if (blockId < doc.collision.colind.length) {
    return `Use Link, accepting it changes every use of block ${blockId}.`;
  }
  return `Link cannot set block ${blockId} either — it is past the end of the table. Edit a block within the table, or restamp this cell to a block that is.`;
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
      return 'no chunk is stamped here — this cell is air';
    case 'block0':
      return 'block 0 is the blank block — the engine short-circuits before reading its collision, so a shape here can never apply';
    case 'overhang':
      return `block ${blockId} is past the end of this zone's collision table (${doc.collision.colind.length} entries) — the overhang resolves into the adjacent zone's table in ROM, so Aurora cannot set it without silently changing other blocks. ${escapeFromLinkOverhang(doc)}`;
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
      why: `block capacity reached: ${MAX_BLOCKS_TOTAL} blocks max (chunk cells reference blocks with a 10-bit field) — this zone's ceiling has no room for another clone`,
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
    return {
      kind: 'refused',
      why: `isolating this block would grow this zone's collision table by ${extendsTableBy} entr${extendsTableBy === 1 ? 'y' : 'ies'} (${colind.length} → ${newBlockId + 1}) — those entries resolve into the adjacent zone's table in ROM, so Aurora cannot define them. ${escapeFromIsolateGrowth(doc, blockId)}`,
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

export interface CollisionRectReport {
  mode: CollisionWriteMode;
  /** CELLS whose block did not carry the shape and now will. */
  applied: number;
  /** CELLS whose block already carried it. Success, not a skip. */
  noop: number;
  skipped: { reason: CollisionSkipReason; count: number }[];
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

export type CollisionRectRefusal =
  | { kind: 'nothing-applicable'; skipped: { reason: CollisionSkipReason; count: number }[] }
  | { kind: 'isolate-grows-table'; needed: number; spare: number; colindLength: number; blocks: number }
  | { kind: 'block-ceiling'; needed: number; spare: number };

export type CollisionRectPlan =
  | { kind: 'link'; entries: { blockId: number; value: number }[]; report: CollisionRectReport }
  | { kind: 'isolate'; plan: SurfaceEditPlan; report: CollisionRectReport }
  /** Everything already carried the shape. Success, and NO command to dispatch. */
  | { kind: 'nothing'; report: CollisionRectReport }
  | { kind: 'refused'; refusal: CollisionRectRefusal; why: string; resolution: string; report: CollisionRectReport };

/**
 * Plan ONE write of `shapeIndex` across every cell of `rect`, in `mode`.
 *
 * WHY THIS IS A RECTANGLE AND NOT A LOOP OVER `planCollisionWrite`: a rectangle
 * must be one undo step, and one undo step means one store command. Isolate in
 * particular cannot be looped — every call would compute the same
 * `doc.blocks.length` for its clone id and they would collide.
 *
 * PARTIAL BY DESIGN, in one direction only. Per-cell skips (air, block 0, a
 * link-mode overhang block, cells past the layout edge) are expected inside any
 * real rectangle — a slope's bounding box contains air — so they are counted and
 * stepped over. The AGGREGATE limits are not: which cells would land under a
 * half-satisfied clone budget is a function of scan order, so those refuse the
 * whole call.
 */
export function planCollisionRect(
  doc: LevelDoc,
  rect: CollisionRect,
  shapeIndex: number,
  mode: CollisionWriteMode,
): CollisionRectPlan {
  const skips = new Map<CollisionSkipReason, number>();
  const bump = (r: CollisionSkipReason) => skips.set(r, (skips.get(r) ?? 0) + 1);
  const writes: { blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }[] = [];
  let noop = 0;
  let ambiguous = 0;

  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const at = locateCell(doc, rect.x + dx, rect.y + dy);
      // `classifyCollisionCell` never returns 'outside-layout': a CellAddress
      // already implies the cell is inside, because locateCell returns null
      // outside. The reason is MANUFACTURED here, before the classifier runs.
      if (!at) { bump('outside-layout'); continue; }
      const outcome = classifyCollisionCell(doc, at, shapeIndex, mode);
      if (outcome.kind === 'skip') { bump(outcome.reason); continue; }
      if (outcome.kind === 'noop') { noop++; continue; }
      if (at.loopAmbiguous) ambiguous++;
      writes.push(outcome);
    }
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
    mode, applied: writes.length, noop, skipped, blocks: distinct.length, warnings,
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
    case 'air': return 'air — no chunk is stamped there';
    case 'block0': return 'the blank block 0, whose collision the engine never reads';
    case 'overhang': return 'blocks past the end of this zone\'s collision table';
  }
}

/**
 * The sentence for a rectangle that wrote nothing: the reason that accounted for
 * the most cells, so "you aimed at air" and "you aimed at blank blocks" are
 * distinguishable. Ties break by the array's own order, which is first-seen in
 * row-major scan — deterministic, and the tie is cosmetic.
 *
 * The empty case is not decoration. A zero-width or zero-height rectangle scans
 * no cells at all, so it applies nothing, matches nothing and skips nothing —
 * it reaches this function with an empty array, and an unseeded reduce over one
 * throws. An agent that passes `w: 0` must get a sentence back, not a TypeError.
 */
function dominantSkipWhy(skipped: { reason: CollisionSkipReason; count: number }[]): string {
  if (skipped.length === 0) {
    return 'this rectangle covers no cells — its width or height is zero';
  }
  const total = skipped.reduce((n, s) => n + s.count, 0);
  const top = skipped.reduce((a, b) => (b.count > a.count ? b : a));
  return `no cell in this rectangle could take a shape — ${top.count} of ${total} ${top.count === 1 ? 'is' : 'are'} ${skipPhrase(top.reason)}`;
}

/** Task 5 owns this. Declared here only so the link path type-checks. */
function planIsolateRect(
  doc: LevelDoc,
  writes: { blockId: number; chunkIndex: number; cellIndex: number; cell: ChunkCell }[],
  distinct: number[],
  shapeIndex: number,
  base: CollisionRectReport,
): CollisionRectPlan {
  throw new Error('planIsolateRect: implemented in task 5');
}
