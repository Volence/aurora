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
import type { PixelBuffer } from './pixel-ops';
import type { SurfaceCell, SurfaceProvenance } from './classic-surface-buffer';
import { surfaceToTile } from './classic-surface-buffer';
import { tileToBuffer, tileBytesIfChanged } from './classic-tile-buffer';

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
  /**
   * Level-pool tiles an object sprite draws through mappings rather than
   * blocks (see s1-levelart-reservations.ts) — invisible to `index` because
   * `buildUsageIndex` only walks blocks/chunks. NOT a lock: a reserved tile
   * stays editable in place (painting object art is a feature). It is a
   * third, additive rule enforced here: never claim one as a free slot, and
   * always diverge away from one instead of writing it in place. Defaults to
   * empty (permissive), matching the `editableTileRange` null convention.
   */
  reservedTiles?: ReadonlySet<number>;
}

const TILE_BYTES = 32;
// Chunk cell's block field is 10 bits (see model.ts MAX_BLOCK_REF) — a clone
// that would need id 0x400 or higher can never be encoded, so refuse instead.
const MAX_BLOCK_REF = 0x3ff;

function bytesEqualAt(pool: Uint8Array, tileIndex: number, want: Uint8Array): boolean {
  const base = tileIndex * TILE_BYTES;
  for (let i = 0; i < TILE_BYTES; i++) if (pool[base + i] !== want[i]) return false;
  return true;
}

/**
 * An existing pool tile whose bytes already equal `want`, or null.
 *
 * `excluded` is the set of slots this gesture has already claimed as the NEW
 * home for some other cell's divergent paint — those slots are about to hold
 * different bytes than what is on disk right now, so a match against their
 * STALE content would repoint this cell at someone else's paint instead of its
 * own. Skipping them is what keeps two cells claiming distinct slots in the
 * same gesture from cross-contaminating.
 */
function findContentMatch(doc: LevelDoc, want: Uint8Array, excluded: Set<number>): number | null {
  const count = Math.floor(doc.tiles.length / TILE_BYTES);
  for (let t = 0; t < count; t++) {
    if (excluded.has(t)) continue;
    if (bytesEqualAt(doc.tiles, t, want)) return t;
  }
  return null;
}

/**
 * A pool slot that is unreferenced, writable, and not object-reserved.
 * "Free" is not the same as "claimable" — tileLockReason marks tiles the save
 * path would refuse, and claiming one would produce an edit that can never be
 * saved; `reservedTiles` marks tiles an object sprite draws through mappings,
 * invisible to `index` but never eligible to become someone else's divergent
 * copy (see PlanInput.reservedTiles).
 */
function findFreeSlot(
  doc: LevelDoc, index: UsageIndex, isEditableTile: (t: number) => boolean,
  reserved: ReadonlySet<number>, taken: Set<number>,
): number | null {
  const count = Math.floor(doc.tiles.length / TILE_BYTES);
  for (let t = 1; t < count; t++) {   // 0 is the transparent tile — never claim it
    if (taken.has(t)) continue;
    if (index.tileUsage(t).cells !== 0) continue;
    if (reserved.has(t)) continue;
    if (!isEditableTile(t)) continue;
    return t;
  }
  return null;
}

/**
 * The chunks (FILE indices) an isolate-mode edit at `c` reaches. A chunk
 * surface isolates to the chunk being edited — that is the whole point of
 * isolate mode. A BLOCK surface has no chunk cell to repoint (chunkCellIndex
 * is always null there), so editing it directly reaches every chunk that
 * currently uses the block — there is no narrower place for the edit to land.
 */
function addPlaces(set: Set<number>, index: UsageIndex, p: SurfaceProvenance, c: SurfaceCell): void {
  if (p.chunkIndex !== null) set.add(p.chunkIndex);
  else for (const ci of index.blockToChunks.get(c.blockId) ?? []) set.add(ci);
}

/** The chunks (FILE indices) reached by a link-mode write to one pool tile. */
function chunksTouchedByTile(index: UsageIndex, tileIndex: number): Set<number> {
  const out = new Set<number>();
  for (const blockId of index.tileToBlocks.get(tileIndex) ?? []) {
    for (const ci of index.blockToChunks.get(blockId) ?? []) out.add(ci);
  }
  return out;
}

export function planSurfaceEdit(input: PlanInput): PlanResult {
  const { doc, provenance, index, mode, writes, isEditableTile, reservedTiles } = input;
  const reserved = reservedTiles ?? new Set<number>();

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
  // Keyed by CHUNK CELL index, not block id: two painted chunk cells that share
  // a block each need their OWN clone (each is repointed independently), while
  // two 8x8 surface cells belonging to the SAME chunk cell must share one clone.
  const cloneOf = new Map<number, number>();
  const nextBlockId = () => doc.blocks.length + plan.newBlocks.length;
  // Link mode accumulates per TILE, not per surface cell: two cells drawing the
  // same tile (routine once art is shared) must merge into ONE tileWrite, or
  // the store applies them in order and the earlier stroke is silently lost.
  const linkBufs = new Map<number, PixelBuffer>();

  for (const [cellIndex, e] of perCell) {
    const c = provenance.cells[cellIndex];

    if (mode === 'link') {
      if (!isEditableTile(e.tileIndex)) {
        return { ok: false, reason: `tile ${e.tileIndex} is not editable` };
      }
      let buf = linkBufs.get(e.tileIndex);
      if (!buf) {
        const src = tileToBuffer(doc.tiles, e.tileIndex);
        buf = { width: src.width, height: src.height, data: src.data.slice() };
        linkBufs.set(e.tileIndex, buf);
      }
      for (const p of e.px) buf.data[p.ty * 8 + p.tx] = p.v & 0x0f;
      // Nothing emitted here — resolved once per tile after the loop, so a
      // second cell's pixels land in the SAME buffer instead of a second write.
      continue;
    }

    // 2 · Isolate. The pixels this tile should end up with, in STORED tile
    // coordinates. Keep the untouched original around so a no-op stroke can be
    // detected — rule 3 from classic-tile-gesture.ts: a gesture that changed
    // nothing commits nothing (no tileWrite, no repoint, no undo entry).
    const original = tileToBuffer(doc.tiles, e.tileIndex);
    const buf = { width: original.width, height: original.height, data: original.data.slice() };
    for (const p of e.px) buf.data[p.ty * 8 + p.tx] = p.v & 0x0f;
    const changedBytes = tileBytesIfChanged(original, buf);
    if (changedBytes === null) continue; // repainted with the value already there

    // 3 · Both questions, independently. `reserved` extends tileLinked (not a
    // new question) so an object-reserved tile diverges away instead of being
    // repainted in place — Link mode is deliberately exempt (see PaintMode /
    // the mode === 'link' branch above): edit-everywhere legitimately includes
    // the object sprite, which is what link mode means.
    const tileLinked = index.tileUsage(e.tileIndex).cells > 1 || reserved.has(e.tileIndex);
    const blockLinked = c.chunkCellIndex !== null && index.blockUsage(c.blockId).cells > 1;

    if (!tileLinked && !blockLinked) {
      if (!isEditableTile(e.tileIndex)) {
        return { ok: false, reason: `tile ${e.tileIndex} is not editable` };
      }
      plan.tileWrites.push({ tileIndex: e.tileIndex, data: changedBytes });
      addPlaces(placesAffected, index, provenance, c);
      continue;
    }

    // If the BLOCK is linked too, isolate needs its own copy of it — repointing
    // the shared block's cell in place would repaint every chunk cell that
    // references it. Key the clone by CHUNK CELL, not by block id: two painted
    // chunk cells that share a block each need their OWN clone (each gets
    // repointed independently), while several 8x8 surface cells inside the
    // SAME chunk cell must share one clone, not one each.
    let targetBlockId = c.blockId;
    if (blockLinked) {
      // Non-null: blockLinked required c.chunkCellIndex !== null, which is only
      // ever set by buildChunkSurface, which always sets provenance.chunkIndex too.
      const chunkCellIndex = c.chunkCellIndex as number;
      const chunkIndex = provenance.chunkIndex as number;
      let cloned = cloneOf.get(chunkCellIndex);
      if (cloned === undefined) {
        const id = nextBlockId();
        if (id > MAX_BLOCK_REF) {
          return {
            ok: false,
            reason: 'block limit reached — the pool cannot hold a 1025th block (10-bit chunk-cell field). Switch to Link mode to edit every place at once.',
          };
        }
        const srcBlock = doc.blocks[c.blockId];
        plan.newBlocks.push({ cells: (srcBlock?.cells ?? []).map((bc) => ({ ...bc })) });
        cloned = id;
        cloneOf.set(chunkCellIndex, cloned);
        plan.stats.blocksCloned++;

        const srcChunkCell = doc.chunks[chunkIndex]?.cells[chunkCellIndex];
        plan.chunkCellEdits.push({
          chunkIndex,
          cellIndex: chunkCellIndex,
          cell: { ...srcChunkCell, block: cloned },
        });
      }
      targetBlockId = cloned;
    }

    // The tile must diverge if it is linked elsewhere — OR if the block was
    // just cloned above, since the clone would otherwise still share it.
    const wantBytes = changedBytes;
    let targetTile = e.tileIndex;

    // findContentMatch may still repoint TO a reserved tile: byte-identical
    // content corrupts nothing (the object sprite still reads the same
    // bytes) and conserves an already-scarce slot, so it is deliberately not
    // filtered by `reserved` here — only findFreeSlot (a NEW claim) is.
    const match = findContentMatch(doc, wantBytes, claimed);
    if (match !== null) {
      targetTile = match;
    } else {
      const slot = findFreeSlot(doc, index, isEditableTile, reserved, claimed);
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
    // The template is always the ORIGINAL block's cell: a fresh clone starts as
    // an exact copy, so its cell's own flip/pal are identical to the source's.
    const srcCell = doc.blocks[c.blockId]?.cells[c.blockCellIndex];
    plan.blockCellEdits.push({
      blockId: targetBlockId,
      cellIndex: c.blockCellIndex,
      cell: { ...srcCell, tile: targetTile },
    });
    addPlaces(placesAffected, index, provenance, c);
    continue;
  }

  // 4 · Resolve link mode's accumulated per-tile buffers, one write per tile —
  // AFTER every cell has contributed its pixels, so two cells drawing the same
  // tile merge instead of racing. Same no-op rule as isolate: skip a tile whose
  // accumulated buffer ended up byte-identical to what is already stored.
  for (const [tileIndex, buf] of linkBufs) {
    const original = tileToBuffer(doc.tiles, tileIndex);
    const changedBytes = tileBytesIfChanged(original, buf);
    if (changedBytes === null) continue;
    plan.tileWrites.push({ tileIndex, data: changedBytes });
    for (const ci of chunksTouchedByTile(index, tileIndex)) placesAffected.add(ci);
  }

  plan.stats.placesAffected = placesAffected.size;
  return { ok: true, plan };
}
