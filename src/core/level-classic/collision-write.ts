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
      return 'no chunk is stamped here — this cell is air';
    case 'block0':
      return 'block 0 is the blank block — the engine short-circuits before reading its collision, so a shape here can never apply';
    case 'no-such-block':
      return `this cell names block ${blockId}, but this act has only ${doc.blocks.length} blocks — the reference is dangling. Restamp the cell to a block that exists.`;
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
    case 'no-such-block': return 'blocks this act does not have — dangling references';
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
    return {
      kind: 'refused',
      refusal: {
        kind: 'isolate-grows-table', needed, spare: Math.max(0, tableSpare),
        colindLength: colind.length, blocks: doc.blocks.length,
      },
      why: `isolating this rectangle needs ${needed} new block${needed === 1 ? '' : 's'} and this zone's collision table has room for ${Math.max(0, tableSpare)} — it would grow by ${grow} entr${grow === 1 ? 'y' : 'ies'} (${colind.length} → ${doc.blocks.length + needed}), and those entries resolve into the adjacent zone's table in ROM, so Aurora cannot define them.`,
      resolution: distinct.every((b) => b < colind.length)
        ? 'Use Link, accepting it changes every use of these blocks zone-wide, or paint a smaller rectangle.'
        : 'Link cannot set every block in this rectangle either — some are past the end of the table. Paint over blocks that are within it.',
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
