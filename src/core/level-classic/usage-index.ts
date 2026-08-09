// Usage index for the classic (Sonic 1) LevelDoc — the shared-structure UX spine
// for the composer dock (v1.1 Task B3). S1 level art is strictly shared: one tile
// lives in many blocks, one block in many chunks, one chunk is stamped across the
// layout. Editing any entity propagates to every place it's used, so the composer
// surfaces "how many places" up front (usage counts + a shared-edit warning).
//
// This module is the ONE pure place those counts are derived. It walks the doc
// once and builds three reverse indices:
//   • tile → blocks      (which block ids reference each tile-pool index)
//   • block → chunks     (which chunk indices reference each block id)
//   • chunk → placements (how many layout cells stamp each ENGINE chunk id)
//
// The doc is small (hundreds of blocks/chunks), so callers rebuild lazily on the
// store's version/epoch change rather than maintaining incremental invalidation.
//
// Pure core — no fs, no DOM.

import type { LevelDoc } from './model';

/**
 * A distinct-container set plus the total reference (cell) count for one entity.
 * `containers` is the set of DISTINCT parents that reference it (distinct blocks
 * for a tile, distinct chunks for a block); `cells` is the TOTAL number of
 * referencing cells (a block can use the same tile in >1 of its 4 cells; a chunk
 * can stamp the same block in >1 of its 256 cells). The shared-edit warning keys
 * on `cells > 1` (an edit affects every referencing cell), while the human label
 * reports both ("used in 14 chunks · 31 cells").
 */
export interface Usage {
  containers: number;
  cells: number;
}

const EMPTY: Usage = { containers: 0, cells: 0 };

export interface UsageIndex {
  /** tile-pool index → distinct block ids that reference it (sorted ascending). */
  tileToBlocks: Map<number, number[]>;
  /** block id → distinct chunk indices (FILE order) that reference it (sorted). */
  blockToChunks: Map<number, number[]>;
  /** ENGINE chunk id (layout byte & 0x7f, 0 = air excluded) → layout placements. */
  chunkPlacements: Map<number, number>;

  /** tile usage: distinct blocks + total block-cell references. */
  tileUsage(tileIndex: number): Usage;
  /** block usage: distinct chunks + total chunk-cell references. */
  blockUsage(blockId: number): Usage;
  /** chunk usage: layout placements (fg + bg) for an ENGINE chunk id. */
  chunkPlacementCount(chunkId: number): number;
}

/** Count placements of each engine chunk id within a plane's DRAWN region. */
function tallyPlacements(cells: Uint8Array, width: number, height: number, out: Map<number, number>): void {
  // Irregular real files can carry cells.length !== width*height — only the
  // declared width*height region is actually placed/rendered (matches the
  // viewport's clamp), so count within that bound.
  const bound = Math.min(cells.length, width * height);
  for (let i = 0; i < bound; i++) {
    const id = cells[i] & 0x7f; // strip S1's bit-7 loop flag
    if (id === 0) continue; // air draws nothing → not a placement
    out.set(id, (out.get(id) ?? 0) + 1);
  }
}

/**
 * Build the reverse usage indices for a LevelDoc in a single pass. Cheap enough
 * (the doc holds hundreds of blocks/chunks) to rebuild on every content change.
 */
export function buildUsageIndex(doc: LevelDoc): UsageIndex {
  // tile → blocks (distinct) + tile → total cell references.
  const tileBlockSets = new Map<number, Set<number>>();
  const tileCells = new Map<number, number>();
  doc.blocks.forEach((block, blockId) => {
    for (const cell of block.cells) {
      const t = cell.tile;
      let set = tileBlockSets.get(t);
      if (!set) { set = new Set(); tileBlockSets.set(t, set); }
      set.add(blockId);
      tileCells.set(t, (tileCells.get(t) ?? 0) + 1);
    }
  });

  // block → chunks (distinct, file index) + block → total cell references.
  const blockChunkSets = new Map<number, Set<number>>();
  const blockCells = new Map<number, number>();
  doc.chunks.forEach((chunk, chunkIndex) => {
    for (const cell of chunk.cells) {
      const b = cell.block;
      let set = blockChunkSets.get(b);
      if (!set) { set = new Set(); blockChunkSets.set(b, set); }
      set.add(chunkIndex);
      blockCells.set(b, (blockCells.get(b) ?? 0) + 1);
    }
  });

  // chunk (engine id) → layout placements across both planes.
  const chunkPlacements = new Map<number, number>();
  tallyPlacements(doc.fg.cells, doc.fg.width, doc.fg.height, chunkPlacements);
  tallyPlacements(doc.bg.cells, doc.bg.width, doc.bg.height, chunkPlacements);

  const tileToBlocks = new Map<number, number[]>();
  for (const [tile, set] of tileBlockSets) tileToBlocks.set(tile, [...set].sort((a, b) => a - b));
  const blockToChunks = new Map<number, number[]>();
  for (const [block, set] of blockChunkSets) blockToChunks.set(block, [...set].sort((a, b) => a - b));

  return {
    tileToBlocks,
    blockToChunks,
    chunkPlacements,
    tileUsage(tileIndex: number): Usage {
      const containers = tileToBlocks.get(tileIndex)?.length ?? 0;
      const cells = tileCells.get(tileIndex) ?? 0;
      return cells === 0 ? EMPTY : { containers, cells };
    },
    blockUsage(blockId: number): Usage {
      const containers = blockToChunks.get(blockId)?.length ?? 0;
      const cells = blockCells.get(blockId) ?? 0;
      return cells === 0 ? EMPTY : { containers, cells };
    },
    chunkPlacementCount(chunkId: number): number {
      // Normalize an engine id the same way tallyPlacements keyed it (strip the
      // loop bit); air (0) never has placements.
      const id = chunkId & 0x7f;
      if (id === 0) return 0;
      return chunkPlacements.get(id) ?? 0;
    },
  };
}
