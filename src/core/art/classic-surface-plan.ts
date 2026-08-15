// src/core/art/classic-surface-plan.ts
//
// Turns pixel writes on a composed surface into a document mutation plan.
//
// THE RULE, stated once. Paint stays where it was painted only if the tile is
// referenced by exactly one block cell AND the block by exactly one chunk cell.
// The two checks are independent and BOTH are required — cloning the block alone
// does not help, because the clone still points at the same shared tile. That is
// the two-tier cascade a single-indirection model (Aseprite's) does not have.
//
// Pure core — no store, no fs. The editable-tile predicate is injected so this
// module shares the ONE definition of "writable tile" with the store rather than
// restating the rule.

import type { LevelDoc, BlockDef, BlockCell, ChunkCell } from '../level-classic/model';
import type { UsageIndex } from '../level-classic/usage-index';
import type { SurfaceProvenance } from './classic-surface-buffer';
import { surfaceToTile } from './classic-surface-buffer';
import { tileToBuffer, bufferToTileBytes } from './classic-tile-buffer';

export type PaintMode = 'isolate' | 'link';

export interface SurfaceWrite { x: number; y: number; value: number }

export interface SurfaceEditPlan {
  /** Tile-pool pixel writes, 32 bytes each. */
  tileWrites: { tileIndex: number; data: Uint8Array }[];
  /** Blocks appended to the pool; ids are doc.blocks.length + arrayIndex. */
  newBlocks: BlockDef[];
  /** Repoints within an existing or newly-added block. */
  blockCellEdits: { blockId: number; cellIndex: number; cell: BlockCell }[];
  /** Repoints within a chunk. */
  chunkCellEdits: { chunkIndex: number; cellIndex: number; cell: ChunkCell }[];
  stats: { tilesClaimed: number; blocksCloned: number; placesAffected: number };
}

export type PlanResult =
  | { ok: true; plan: SurfaceEditPlan }
  | { ok: false; reason: string };

export interface PlanInput {
  doc: LevelDoc;
  provenance: SurfaceProvenance;
  index: UsageIndex;
  mode: PaintMode;
  writes: SurfaceWrite[];
  /** Shares core/project/editable-tiles' predicate — do NOT restate the rule. */
  isEditableTile: (tileIndex: number) => boolean;
}

const TILE_BYTES = 32;

function bytesEqualAt(pool: Uint8Array, tileIndex: number, want: Uint8Array): boolean {
  const base = tileIndex * TILE_BYTES;
  for (let i = 0; i < TILE_BYTES; i++) if (pool[base + i] !== want[i]) return false;
  return true;
}

/** An existing pool tile whose bytes already equal `want`, or null. */
function findContentMatch(doc: LevelDoc, want: Uint8Array): number | null {
  const count = Math.floor(doc.tiles.length / TILE_BYTES);
  for (let t = 0; t < count; t++) if (bytesEqualAt(doc.tiles, t, want)) return t;
  return null;
}

/**
 * A pool slot that is BOTH unreferenced and writable. "Free" is not the same as
 * "claimable" — tileLockReason marks tiles the save path would refuse, and
 * claiming one would produce an edit that can never be saved.
 */
function findFreeSlot(
  doc: LevelDoc, index: UsageIndex, isEditableTile: (t: number) => boolean, taken: Set<number>,
): number | null {
  const count = Math.floor(doc.tiles.length / TILE_BYTES);
  for (let t = 1; t < count; t++) {   // 0 is the transparent tile — never claim it
    if (taken.has(t)) continue;
    if (index.tileUsage(t).cells !== 0) continue;
    if (!isEditableTile(t)) continue;
    return t;
  }
  return null;
}

export function planSurfaceEdit(input: PlanInput): PlanResult {
  const { doc, provenance, index, mode, writes, isEditableTile } = input;

  // 1 · Group writes by the surface CELL they land in, in tile coordinates.
  const perCell = new Map<number, { tileIndex: number; px: { tx: number; ty: number; v: number }[] }>();
  for (const w of writes) {
    const hit = surfaceToTile(provenance, w.x, w.y);
    if (!hit) continue; // strokes overshoot the edge; ignore rather than fail
    let e = perCell.get(hit.cellIndex);
    if (!e) { e = { tileIndex: hit.tileIndex, px: [] }; perCell.set(hit.cellIndex, e); }
    e.px.push({ tx: hit.tx, ty: hit.ty, v: w.value });
  }

  const plan: SurfaceEditPlan = {
    tileWrites: [], newBlocks: [], blockCellEdits: [], chunkCellEdits: [],
    stats: { tilesClaimed: 0, blocksCloned: 0, placesAffected: 0 },
  };
  if (perCell.size === 0) return { ok: true, plan };

  const placesAffected = new Set<number>();
  const claimed = new Set<number>();

  for (const [cellIndex, e] of perCell) {
    const c = provenance.cells[cellIndex];

    // 2 · The pixels this tile should end up with, in STORED tile coordinates.
    const buf = tileToBuffer(doc.tiles, e.tileIndex);
    for (const p of e.px) buf.data[p.ty * 8 + p.tx] = p.v & 0x0f;

    if (mode === 'link') {
      if (!isEditableTile(e.tileIndex)) {
        return { ok: false, reason: `tile ${e.tileIndex} is not editable` };
      }
      plan.tileWrites.push({ tileIndex: e.tileIndex, data: bufferToTileBytes(buf) });
      // Stage-A approximation; Task 7 replaces this with the full reverse lookup.
      for (const ci of index.blockToChunks.get(c.blockId) ?? []) placesAffected.add(ci);
      continue;
    }

    // 3 · Isolate. Both questions, independently.
    const tileLinked = index.tileUsage(e.tileIndex).cells > 1;
    const blockLinked = c.chunkCellIndex !== null && index.blockUsage(c.blockId).cells > 1;

    if (!tileLinked && !blockLinked) {
      if (!isEditableTile(e.tileIndex)) {
        return { ok: false, reason: `tile ${e.tileIndex} is not editable` };
      }
      plan.tileWrites.push({ tileIndex: e.tileIndex, data: bufferToTileBytes(buf) });
      if (provenance.chunkIndex !== null) placesAffected.add(provenance.chunkIndex);
      continue;
    }

    // The tile must diverge if it is linked elsewhere — OR if the block is about
    // to be cloned (Stage C), since a clone would otherwise share these tiles.
    const wantBytes = bufferToTileBytes(buf);
    let targetTile = e.tileIndex;

    const match = findContentMatch(doc, wantBytes);
    if (match !== null) {
      targetTile = match;
    } else {
      const slot = findFreeSlot(doc, index, isEditableTile, claimed);
      if (slot === null) {
        return {
          ok: false,
          reason: 'no free editable tile slot to hold the divergent copy — this zone is at its tile limit. Switch to Link mode to edit every place at once.',
        };
      }
      claimed.add(slot);
      targetTile = slot;
      plan.tileWrites.push({ tileIndex: slot, data: wantBytes });
      plan.stats.tilesClaimed++;
    }

    // Only the TILE POINTER moves. Never write c.xf/c.yf here — those are the
    // COMPOSED flips (block XOR chunk) and would double-apply the chunk's flip.
    const srcCell = doc.blocks[c.blockId]?.cells[c.blockCellIndex];
    plan.blockCellEdits.push({
      blockId: c.blockId,
      cellIndex: c.blockCellIndex,
      cell: { ...srcCell, tile: targetTile },
    });
    if (provenance.chunkIndex !== null) placesAffected.add(provenance.chunkIndex);
    continue;
  }

  plan.stats.placesAffected = placesAffected.size;
  return { ok: true, plan };
}
