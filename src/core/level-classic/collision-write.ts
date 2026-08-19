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

import type { CollisionProbe } from './collision-probe';
import type { LevelDoc } from './model';
import type { SurfaceEditPlan } from '../art/classic-surface-plan';

export type CollisionWriteMode = 'link' | 'isolate';

export type CollisionWritePlan =
  | { kind: 'link'; entries: { blockId: number; value: number }[]; warnings: string[] }
  | { kind: 'isolate'; plan: SurfaceEditPlan; newBlockId: number; warnings: string[] }
  /** The block already carries this shape — nothing to write, and nothing to undo. */
  | { kind: 'noop' }
  | { kind: 'refused'; why: string };

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
  if (probe.chunkIndex === null) {
    return { kind: 'refused', why: 'no chunk is stamped here — this cell is air' };
  }

  const chunk = doc.chunks[probe.chunkIndex];
  const cell = chunk?.cells[probe.cellIndex];
  const blockId = cell?.block ?? 0;

  // Block 0 is the blank block. FindFloor short-circuits before it ever reads
  // solidity or colind, so a shape stored here can never apply in game.
  if (blockId === 0) {
    return {
      kind: 'refused',
      why: 'block 0 is the blank block — the engine short-circuits before reading its collision, so a shape here can never apply',
    };
  }

  const warnings: string[] = [];
  // $28 behind a loop may be read as $51 while the player's sprite_looping_bit
  // is set — runtime state no editor can see. Valid for one of the two
  // answers, so it proceeds rather than being refused, and says so.
  if (probe.loopAmbiguous) {
    warnings.push(
      'this cell is behind a loop: the engine may read chunk $51 instead of $28 while the player is looping, so this write may not be the one that applies',
    );
  }

  const colind = doc.collision.colind;

  // ALREADY THIS SHAPE → nothing to do, in EITHER mode.
  //
  // `classicSetColind` has this guard (classicLevelStore.ts:1286) so a link
  // that changes nothing records no undo step. Isolate had no equivalent, and
  // its cost is far higher than a wasted undo entry: re-picking the swatch the
  // panel already highlights as current would clone a block and grow the colind
  // table to give the clone collision identical to the block it copied. That
  // spends exactly the capacity this file's ceiling and table-growth refusals
  // exist to protect — LZ has four spare entries — for no change at all.
  if ((colind[blockId] ?? 0) === shapeIndex) return { kind: 'noop' };

  if (mode === 'link') {
    // THE OVERHANG. A block id past the end of the colind table resolves
    // into the ADJACENT ZONE's table in ROM — its real value is unknowable
    // from this zone's files, so writing it would silently redefine another
    // zone's collision. classicSetColind refuses the same ids; refused here
    // too so the panel has one refusal path to render instead of two.
    if (blockId >= colind.length) {
      return {
        kind: 'refused',
        why: `block ${blockId} is past the end of this zone's collision table (${colind.length} entries) — the overhang resolves into the adjacent zone's table in ROM, so Aurora cannot set it without silently changing other blocks. ${escapeFromLinkOverhang(doc)}`,
      };
    }
    return { kind: 'link', entries: [{ blockId, value: shapeIndex }], warnings };
  }

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
        chunkIndex: probe.chunkIndex,
        cellIndex: probe.cellIndex,
        cell: { block: newBlockId, xf: cell!.xf, yf: cell!.yf, solidity: cell!.solidity },
      },
    ],
    stats: { tilesClaimed: 0, blocksCloned: 1, placesAffected: 1 },
  };

  return { kind: 'isolate', plan, newBlockId, warnings };
}
