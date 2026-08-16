// src/core/art/classic-commit-plan.ts
//
// BINDS A DRAWING TO A DOCUMENT. This is the half of commit that knows what a
// LevelDoc is, and therefore the half that owns EVERY refusal. canvas-resolve.ts
// is total and refuses nothing; the preconditions it assumes are guaranteed
// here.
//
// The order of the pipeline is not arbitrary (spec §4):
//
//   validate -> clash gate -> palette gate -> [remap] -> reclaim -> resolve ->
//   map tiles -> map blocks (with inherited collision) -> chunks -> report
//
// The palette remap ("use the act's colours") rewrites pixel ENTRIES, so it must
// happen before the cut — which is why this module takes pixels and calls the
// resolver itself rather than accepting a finished resolution.
//
// THE FLOORS. Tile 0 is the transparent tile and block 0 is engine-blank: S1's
// FindFloor short-circuits on block number 0 BEFORE it tests solidity, so block
// 0 can never carry collision. Neither is ever reclaimed and neither is ever
// allocated. Phase 1 got tile 0 for free because findFreeSlot starts at t=1;
// this module allocates from a reclaimed list phase 1 never had, so it states
// the rule itself.

import type {
  LevelDoc, BlockDef, ChunkDef256, ChunkCell,
} from '../level-classic/model';
import { MAX_ADDRESSABLE_CHUNKS } from '../level-classic/model';
import type { UsageIndex } from '../level-classic/usage-index';
import type { PixelBuffer } from './pixel-ops';
import type { CanvasCellClash } from './canvas-constraints';
import { findCellClashes } from './canvas-constraints';
import { canvasIndex, paletteLineOf, paletteEntryOf, isTransparent, CANVAS_LINE_LENGTH } from './canvas-doc';
import type { ResolveRegion, ResolvedBlock } from './canvas-resolve';
import { resolveCanvasRegion, mirrorBlock, CHUNK_PX } from './canvas-resolve';
import {
  findPoolMatch, emptyAvailability, unavailableForAllocation, packTileEntries, TILE_BYTES,
} from './tile-pool-match';
import type { PoolAvailability } from './tile-pool-match';

const MAX_BLOCKS_TOTAL = 0x400; // 10-bit chunk-cell block field
const PALETTE_LINES = 4;

/** Where one region cell's art lands: over an existing chunk, or appended. */
export interface CommitTarget { chunkFileIndex: number | null }

/** What the artist chose when the canvas palette had drifted (spec §2 D2). */
export type PaletteResolution = 'none' | 'use-act-colours' | 'adopt-into-zone';

export interface CommitPlanInput {
  doc: LevelDoc;
  index: UsageIndex;
  pixels: PixelBuffer;
  region: ResolveRegion;
  /** 64 CRAM words, line-major — the canvas's palette. */
  canvasPalette: number[];
  /** One per region chunk, row-major. Length must equal chunksWide * chunksHigh. */
  targets: CommitTarget[];
  paletteResolution: PaletteResolution;
  /** Shares core/project/editable-tiles' predicate — do NOT restate the rule. */
  isEditableTile: (tileIndex: number) => boolean;
  /**
   * Object-reserved tiles, or NULL for "not known". Null is permissive in phase
   * 1 because one gesture risks a handful of tiles; here it refuses reclaim,
   * because a full-zone reclaim under unknown predicates exposes the whole pool.
   */
  reservedTiles: ReadonlySet<number> | null;
  /** False when the editable range could not be resolved — same rule as above. */
  editableRangeKnown: boolean;
  /** Animated-art overlay slots: never matched against, never reclaimed. */
  animTiles: ReadonlySet<number>;
}

export type CommitRefusal =
  | { kind: 'region-misaligned'; detail: string }
  | { kind: 'region-out-of-bounds'; detail: string }
  | { kind: 'target-count'; expected: number; got: number }
  | { kind: 'cell-clash'; cells: CanvasCellClash[] }
  | { kind: 'palette-drift'; entries: number[]; touchesLine0: boolean }
  | { kind: 'palette-unmappable'; entries: number[] }
  | { kind: 'predicates-unknown'; which: string[] }
  | { kind: 'tiles-exhausted'; needed: number; available: number; reclaimed: number; free: number }
  | { kind: 'blocks-exhausted'; needed: number; ceiling: number }
  | { kind: 'chunks-exhausted'; needed: number; ceiling: number };

export interface CommitReport {
  tilesNew: number; tilesReused: number; tilesReclaimed: number;
  blocksNew: number; blocksReused: number; blocksReclaimed: number;
  chunksReplaced: number; chunksAppended: number;
  /** D3: how many minted blocks carried collision over, and how many could not. */
  blocksInheritedCollision: number; blocksWithoutCollision: number;
  cellsInheritedSolidity: number; cellsWithoutSolidity: number;
  poolBefore: { tiles: number; blocks: number; chunks: number };
  poolAfter: { tiles: number; blocks: number; chunks: number };
  /** Reach beyond the open act, and anything the indexes cannot see. */
  warnings: string[];
}

export interface CanvasCommitPlan {
  tileWrites: { tileIndex: number; data: Uint8Array }[];
  blockWrites: { blockId: number; def: BlockDef; colind: number }[];
  chunkWrites: { chunkFileIndex: number; def: ChunkDef256 }[];
  chunkAppends: ChunkDef256[];
  paletteWrites: { line: number; colors: Uint16Array }[] | null;
  report: CommitReport;
}

export type CommitPlanResult =
  | { ok: true; plan: CanvasCommitPlan }
  | { ok: false; refusal: CommitRefusal };

// --- palette ---------------------------------------------------------------

/** The act's 64 CRAM words, line-major — the same shape as a canvas palette. */
function flattenDocPalette(doc: LevelDoc): number[] {
  const out: number[] = [];
  for (let l = 0; l < PALETTE_LINES; l++) {
    for (let e = 0; e < CANVAS_LINE_LENGTH; e++) out.push(doc.palettes[l]?.[e] ?? 0);
  }
  return out;
}

/** Flat palette indices the region's art actually uses. Entry 0 never draws, so
 *  it is never compared — a canvas whose unused slots differ is not drift. */
function usedPaletteEntries(pixels: PixelBuffer, region: ResolveRegion): Set<number> {
  const used = new Set<number>();
  const w = region.chunksWide * CHUNK_PX, h = region.chunksHigh * CHUNK_PX;
  for (let y = 0; y < h; y++) {
    const row = (region.y + y) * pixels.width + region.x;
    for (let x = 0; x < w; x++) {
      const v = pixels.data[row + x];
      if (isTransparent(v)) continue;
      used.add(paletteLineOf(v) * CANVAS_LINE_LENGTH + paletteEntryOf(v));
    }
  }
  return used;
}

/**
 * Rewrite each used entry to the act entry holding the same colour, WITHIN THE
 * SAME LINE. Line-preserving on purpose: an exact match in a different line
 * would move a pixel's line and could manufacture a multi-line cell after the
 * clash gate has already passed.
 */
function remapToActColours(
  pixels: PixelBuffer, region: ResolveRegion, canvasPal: number[], docPal: number[],
): { pixels: PixelBuffer } | { unmappable: number[] } {
  const map = new Map<number, number>();
  const unmappable: number[] = [];
  for (const flat of usedPaletteEntries(pixels, region)) {
    const line = Math.floor(flat / CANVAS_LINE_LENGTH);
    const want = canvasPal[flat];
    let found = -1;
    for (let e = 1; e < CANVAS_LINE_LENGTH; e++) {
      if (docPal[line * CANVAS_LINE_LENGTH + e] === want) { found = e; break; }
    }
    if (found < 0) { unmappable.push(flat); continue; }
    map.set(canvasIndex(line, flat % CANVAS_LINE_LENGTH), canvasIndex(line, found));
  }
  if (unmappable.length) return { unmappable };

  const data = new Uint8Array(pixels.data);
  for (let i = 0; i < data.length; i++) {
    const to = map.get(data[i]);
    if (to !== undefined) data[i] = to;
  }
  return { pixels: { width: pixels.width, height: pixels.height, data } };
}

// --- reclaim ---------------------------------------------------------------

/**
 * Blocks and tiles reachable ONLY from the chunks being replaced.
 *
 * Filtered by the same predicates allocation uses, not just by usage: an
 * animated-art overlay slot or a locked tile would be refused at apply time,
 * killing the plan after the artist committed; and an object-reserved tile is
 * invisible to the usage index by construction, so reclaiming it would corrupt
 * a sprite that is still drawing it.
 */
function computeReclaim(input: CommitPlanInput, replaced: Set<number>): {
  tiles: number[]; blocks: number[];
} {
  const { doc, index, isEditableTile, reservedTiles, animTiles } = input;
  const reserved = reservedTiles ?? new Set<number>();

  const blocks: number[] = [];
  for (let b = 1; b < doc.blocks.length; b++) { // never block 0 — engine-blank
    const chunks = index.blockToChunks.get(b) ?? [];
    if (chunks.length === 0) continue;
    if (chunks.every((c) => replaced.has(c))) blocks.push(b);
  }
  const freedBlocks = new Set(blocks);

  const tiles: number[] = [];
  const poolTiles = Math.floor(doc.tiles.length / TILE_BYTES);
  for (let t = 1; t < poolTiles; t++) { // never tile 0 — transparent
    const owners = index.tileToBlocks.get(t) ?? [];
    if (owners.length === 0) continue;
    if (!owners.every((b) => freedBlocks.has(b))) continue;
    if (reserved.has(t) || animTiles.has(t) || !isEditableTile(t)) continue;
    tiles.push(t);
  }
  return { tiles, blocks };
}

// --- the planner -----------------------------------------------------------

export function planCanvasCommit(input: CommitPlanInput): CommitPlanResult {
  const { doc, index, region, targets, isEditableTile, animTiles } = input;
  const reserved = input.reservedTiles ?? new Set<number>();
  const warnings: string[] = [];

  // 1 · Region and targets.
  if (region.x % CHUNK_PX !== 0 || region.y % CHUNK_PX !== 0) {
    return { ok: false, refusal: { kind: 'region-misaligned', detail: `region origin (${region.x},${region.y}) is not a multiple of ${CHUNK_PX}` } };
  }
  if (region.chunksWide < 1 || region.chunksHigh < 1
    || region.x + region.chunksWide * CHUNK_PX > input.pixels.width
    || region.y + region.chunksHigh * CHUNK_PX > input.pixels.height) {
    return { ok: false, refusal: { kind: 'region-out-of-bounds', detail: `region does not fit in a ${input.pixels.width}x${input.pixels.height} canvas` } };
  }
  const cellCount = region.chunksWide * region.chunksHigh;
  if (targets.length !== cellCount) {
    return { ok: false, refusal: { kind: 'target-count', expected: cellCount, got: targets.length } };
  }

  // 2 · Clash gate — by CALLING the 2B rule, never restating it.
  const clashes = findCellClashes(input.pixels, { originX: 0, originY: 0 }, PALETTE_LINES)
    .filter((c) => c.x >= region.x && c.y >= region.y
      && c.x < region.x + region.chunksWide * CHUNK_PX
      && c.y < region.y + region.chunksHigh * CHUNK_PX);
  if (clashes.length) return { ok: false, refusal: { kind: 'cell-clash', cells: clashes } };

  // 3 · Palette gate.
  const docPal = flattenDocPalette(doc);
  const drifted = [...usedPaletteEntries(input.pixels, region)]
    .filter((flat) => input.canvasPalette[flat] !== docPal[flat])
    .sort((a, b) => a - b);
  const touchesLine0 = drifted.some((flat) => flat < CANVAS_LINE_LENGTH);
  let pixels = input.pixels;
  let paletteWrites: { line: number; colors: Uint16Array }[] | null = null;

  if (drifted.length) {
    // Line 0 is Sonic's, shared by every zone — never the act's to change, and
    // nothing downstream defends it (s1-io decomposes into Sonic.bin unguarded).
    if (touchesLine0 || input.paletteResolution === 'none') {
      return { ok: false, refusal: { kind: 'palette-drift', entries: drifted, touchesLine0 } };
    }
    if (input.paletteResolution === 'use-act-colours') {
      const r = remapToActColours(input.pixels, region, input.canvasPalette, docPal);
      if ('unmappable' in r) {
        return { ok: false, refusal: { kind: 'palette-unmappable', entries: r.unmappable } };
      }
      pixels = r.pixels;
    } else {
      paletteWrites = [];
      for (let l = 1; l < PALETTE_LINES; l++) {
        paletteWrites.push({
          line: l,
          colors: new Uint16Array(input.canvasPalette.slice(l * CANVAS_LINE_LENGTH, (l + 1) * CANVAS_LINE_LENGTH)),
        });
      }
      warnings.push('the zone palette changed: every act composed from the same palette file is affected');
    }
  }

  // 4 · Reclaim. Replacing needs it; a purely additive commit does not, which is
  // why unknown predicates only refuse when something is actually being replaced.
  const replaced = new Set<number>();
  for (const t of targets) if (t.chunkFileIndex !== null) replaced.add(t.chunkFileIndex);
  const unknown: string[] = [];
  if (!input.editableRangeKnown) unknown.push('editable tile range');
  if (input.reservedTiles === null) unknown.push('object tile reservations');
  if (replaced.size && unknown.length) {
    return { ok: false, refusal: { kind: 'predicates-unknown', which: unknown } };
  }
  const reclaim = replaced.size ? computeReclaim(input, replaced) : { tiles: [], blocks: [] };

  // 5 · Resolve.
  const res = resolveCanvasRegion(pixels, region);

  // 6 · Map tiles to pool slots.
  const avail: PoolAvailability = emptyAvailability();
  const tileWrites: { tileIndex: number; data: Uint8Array }[] = [];
  const poolTiles = Math.floor(doc.tiles.length / TILE_BYTES);
  const reclaimPool = [...reclaim.tiles];
  let reclaimCursor = 0;
  let tilesReused = 0;

  const freeSlot = (): number | null => {
    const taken = unavailableForAllocation(avail);
    while (reclaimCursor < reclaimPool.length) {
      const t = reclaimPool[reclaimCursor++];
      if (!taken.has(t)) return t;
    }
    for (let t = 1; t < poolTiles; t++) {
      if (taken.has(t)) continue;
      if (index.tileUsage(t).cells !== 0) continue;
      if (reserved.has(t) || animTiles.has(t) || !isEditableTile(t)) continue;
      return t;
    }
    return null;
  };

  /** Pool tile + the flips a referencing cell must carry, per resolved tile. */
  const tileBinding: { tileIndex: number; xf: boolean; yf: boolean }[] = [];
  for (const t of res.tiles) {
    if (t.blank) { tileBinding.push({ tileIndex: 0, xf: false, yf: false }); continue; }
    const want = packTileEntries(t.entries);
    const m = findPoolMatch(doc.tiles, want, avail, { allowFlips: true });
    if (m !== null && !animTiles.has(m.tileIndex)) {
      avail.matched.add(m.tileIndex);
      tileBinding.push({ tileIndex: m.tileIndex, xf: m.xf, yf: m.yf });
      tilesReused++;
      continue;
    }
    const slot = freeSlot();
    if (slot === null) {
      const needed = res.tiles.filter((x) => !x.blank).length;
      return {
        ok: false,
        refusal: {
          kind: 'tiles-exhausted',
          needed,
          available: tileWrites.length + tilesReused,
          reclaimed: reclaim.tiles.length,
          free: 0,
        },
      };
    }
    avail.allocated.add(slot);
    tileWrites.push({ tileIndex: slot, data: want });
    tileBinding.push({ tileIndex: slot, xf: false, yf: false });
  }

  // 7 · Map blocks. Identity includes the INHERITED COLLISION and the
  // orientation relative to the displaced cell, because the engine reads colind
  // per block id and orients the heightmap by the chunk cell's flips: merging
  // two occurrences that differ in either would silently change collision.
  const blockWrites: { blockId: number; def: BlockDef; colind: number }[] = [];
  const blockIdOf = new Map<string, number>();
  const reclaimBlocks = [...reclaim.blocks];
  let reclaimBlockCursor = 0;
  let nextAppendId = doc.blocks.length;
  let blocksReused = 0;
  let blocksInheritedCollision = 0, blocksWithoutCollision = 0;
  let cellsInheritedSolidity = 0, cellsWithoutSolidity = 0;

  const toDef = (b: ResolvedBlock): BlockDef => ({
    cells: b.cells.map((c) => {
      const bind = tileBinding[c.tileHandle];
      return {
        tile: bind.tileIndex,
        // The tile may be stored in a different orientation than it was drawn;
        // compose the two flips. XOR, because each is an involution.
        xf: bind.xf !== c.xf,
        yf: bind.yf !== c.yf,
        pal: c.palLine,
        pri: false, // no priority plane on the canvas — spec §4 names this
      };
    }),
  });

  const internBlock = (shape: ResolvedBlock, colind: number): number | null => {
    if (shape.blank) return 0; // engine-blank, and never allocated
    const def = toDef(shape);
    const key = `${def.cells.map((c) => `${c.tile}:${c.xf ? 1 : 0}${c.yf ? 1 : 0}:${c.pal}`).join('|')}#${colind}`;
    const seen = blockIdOf.get(key);
    if (seen !== undefined) return seen;

    // Reuse an existing pool block only when its collision matches too — an
    // identical-looking block with a different shape is not a reuse candidate.
    for (let b = 1; b < doc.blocks.length; b++) {
      if ((doc.collision.colind[b] ?? 0) !== colind) continue;
      const cells = doc.blocks[b].cells;
      if (cells.length !== 4) continue;
      let same = true;
      for (let i = 0; i < 4; i++) {
        const a = cells[i], d = def.cells[i];
        if (a.tile !== d.tile || a.xf !== d.xf || a.yf !== d.yf || a.pal !== d.pal) { same = false; break; }
      }
      if (same) { blockIdOf.set(key, b); blocksReused++; return b; }
    }

    let id: number;
    if (reclaimBlockCursor < reclaimBlocks.length) id = reclaimBlocks[reclaimBlockCursor++];
    else { id = nextAppendId; nextAppendId++; }
    if (id >= MAX_BLOCKS_TOTAL) return null;
    blockIdOf.set(key, id);
    blockWrites.push({ blockId: id, def, colind });
    if (colind !== 0) blocksInheritedCollision++; else blocksWithoutCollision++;
    return id;
  };

  // 8 · Chunks.
  const chunkWrites: { chunkFileIndex: number; def: ChunkDef256 }[] = [];
  const chunkAppends: ChunkDef256[] = [];
  let appendCount = 0;

  for (let i = 0; i < res.chunks.length; i++) {
    const target = targets[i];
    const src = target.chunkFileIndex === null ? null : doc.chunks[target.chunkFileIndex] ?? null;
    const cells: ChunkCell[] = [];

    for (let ci = 0; ci < res.chunks[i].cells.length; ci++) {
      const rc = res.chunks[i].cells[ci];
      const old = src?.cells[ci] ?? null;
      // D3: keep the displaced cell's flips, so its inherited collision stays
      // oriented the way it already was, and pre-mirror the block to suit.
      const xf = old?.xf ?? false, yf = old?.yf ?? false;
      const solidity = old?.solidity ?? 0;
      if (old) cellsInheritedSolidity++; else cellsWithoutSolidity++;
      const colind = old ? (doc.collision.colind[old.block] ?? 0) : 0;

      const shape = mirrorBlock(res.blocks[rc.blockHandle], xf, yf);
      const id = internBlock(shape, colind);
      if (id === null) {
        return {
          ok: false,
          refusal: { kind: 'blocks-exhausted', needed: nextAppendId, ceiling: MAX_BLOCKS_TOTAL },
        };
      }
      cells.push({ block: id, xf, yf, solidity });
    }

    if (target.chunkFileIndex === null) { chunkAppends.push({ cells }); appendCount++; }
    else chunkWrites.push({ chunkFileIndex: target.chunkFileIndex, def: { cells } });
  }

  if (doc.chunks.length + appendCount > MAX_ADDRESSABLE_CHUNKS) {
    return {
      ok: false,
      refusal: {
        kind: 'chunks-exhausted',
        needed: doc.chunks.length + appendCount,
        ceiling: MAX_ADDRESSABLE_CHUNKS,
      },
    };
  }

  // GHZ aliases engine chunk $51 to $28 behind loops, and no index can see it.
  const GHZ_LOOP_ALIAS_FILE_INDEX = 0x50; // engine $51 = file index + 1
  if (replaced.has(GHZ_LOOP_ALIAS_FILE_INDEX)) {
    warnings.push('engine chunk $51 is substituted for $28 behind loops, so replacing it changes $28’s collision too');
  }

  const poolBefore = {
    tiles: poolTiles, blocks: doc.blocks.length, chunks: doc.chunks.length,
  };
  return {
    ok: true,
    plan: {
      tileWrites, blockWrites, chunkWrites, chunkAppends, paletteWrites,
      report: {
        tilesNew: tileWrites.length,
        tilesReused,
        tilesReclaimed: reclaim.tiles.length,
        blocksNew: blockWrites.length,
        blocksReused,
        blocksReclaimed: reclaim.blocks.length,
        chunksReplaced: chunkWrites.length,
        chunksAppended: chunkAppends.length,
        blocksInheritedCollision,
        blocksWithoutCollision,
        cellsInheritedSolidity,
        cellsWithoutSolidity,
        poolBefore,
        poolAfter: {
          tiles: poolTiles,
          blocks: Math.max(doc.blocks.length, nextAppendId),
          chunks: doc.chunks.length + appendCount,
        },
        warnings,
      },
    },
  };
}
