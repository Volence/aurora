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
  findPoolMatch, emptyAvailability, unavailableForAllocation, packTileEntries,
  poolTileEntries, TILE_BYTES,
} from './tile-pool-match';
import type { PoolAvailability } from './tile-pool-match';
import { CELL, TILE_ENTRIES } from './tile-canon';
import { sameGenesisColor, GENESIS_WORD_MASK } from '../formats/palette';

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
  /**
   * The canvas's own cell-grid origin, if it has one. Commit cuts on the
   * region's grid and never on this — see canvas-resolve's header for why there
   * is only ever one answer to "where does this cell start". It is taken here
   * solely so an origin that disagrees can be REFUSED rather than silently cut
   * somewhere the artist was never shown. Absent means aligned.
   */
  gridOrigin?: { originX: number; originY: number };
}

export type CommitRefusal =
  | { kind: 'region-misaligned'; detail: string }
  | { kind: 'region-out-of-bounds'; detail: string }
  | { kind: 'target-count'; expected: number; got: number }
  | { kind: 'target-invalid'; detail: string }
  | { kind: 'grid-origin'; originX: number; originY: number }
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
  /** Reclaimed ids nothing took, blanked so their tiles stop reading as used. */
  blocksZeroed: number;
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
  /**
   * `blanked` marks a RECLAIMED id nothing took, written back as four blank
   * cells so its stale def stops holding pool tiles hostage — not a block the
   * commit is minting. Flagged rather than left to be inferred from array
   * order (blanked entries are pushed after the minted ones) or from a
   * blank-looking def, because both are silent to read and a consumer that
   * guesses wrong either skips a real block or acts on a dead one.
   */
  blockWrites: { blockId: number; def: BlockDef; colind: number; blanked?: true }[];
  chunkWrites: { chunkFileIndex: number; def: ChunkDef256 }[];
  chunkAppends: ChunkDef256[];
  paletteWrites: { line: number; colors: Uint16Array }[] | null;
  report: CommitReport;
}

export type CommitPlanResult =
  | { ok: true; plan: CanvasCommitPlan }
  | { ok: false; refusal: CommitRefusal };

// --- palette ---------------------------------------------------------------

/**
 * The act's 64 CRAM words, line-major — the same shape as a canvas palette.
 *
 * EXPORTED because sheet-import.ts needs the identical bytes: an imported sheet
 * is mapped against this, so the palette gate below can never fire on it, which
 * is why `import_art_sheet` carries no `paletteResolution`
 * (shared/agent-protocol.ts). That argument rests on the two flatteners
 * agreeing, so there is only one of them.
 */
export function flattenDocPalette(doc: LevelDoc): number[] {
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
  drifted: ReadonlySet<number>,
): { pixels: PixelBuffer } | { unmappable: number[] } {
  const map = new Map<number, number>();
  const unmappable: number[] = [];
  for (const flat of usedPaletteEntries(pixels, region)) {
    // ONLY the entries that drifted. An entry already holding the act's colour
    // is already right, and "the lowest slot with this colour" would move it to
    // a duplicate slot — different tile bytes for identical art, which stops the
    // drawing matching the pool tiles it came from and mints copies of them.
    if (!drifted.has(flat)) continue;
    const line = Math.floor(flat / CANVAS_LINE_LENGTH);
    const want = canvasPal[flat];
    let found = -1;
    for (let e = 1; e < CANVAS_LINE_LENGTH; e++) {
      if (sameGenesisColor(docPal[line * CANVAS_LINE_LENGTH + e], want)) { found = e; break; }
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

// --- block identity --------------------------------------------------------

/**
 * WHAT A BLOCK DRAWS, as a string — deliberately not how it is spelled.
 *
 * The pool holds mirror-duplicate tiles, and the tile matcher spells each drawn
 * cell with whichever copy it meets first. That is almost never the copy the
 * existing block used, so comparing tile ids and flip bits answers "same
 * spelling", not "same block" — and on real GHZ blocks the two disagree
 * essentially always. The consequence is not cosmetic: a re-commit of art
 * nobody touched mints duplicate blocks and burns pool slots that then have to
 * be reclaimed from somewhere.
 *
 * Priority is NOT part of identity, matching the scan this replaces: the canvas
 * has no priority plane (spec §4), so every drawn cell would spell pri=false
 * and a pool block carrying priority would never match again.
 */
function blockRenderKeyFn(pool: Uint8Array): (def: BlockDef) => string {
  const poolTiles = Math.floor(pool.length / TILE_BYTES);
  const cache = new Map<number, string>();

  const cellKey = (tile: number, xf: boolean, yf: boolean): string => {
    // A reference past the pool draws nothing knowable; give it an identity of
    // its own rather than letting it read as blank and match real art.
    if (tile < 0 || tile >= poolTiles) return `#oob${tile}`;
    const ck = tile * 4 + (xf ? 1 : 0) + (yf ? 2 : 0);
    let s = cache.get(ck);
    if (s === undefined) {
      const ent = poolTileEntries(pool, tile);
      const out = new Uint8Array(TILE_ENTRIES);
      for (let i = 0; i < TILE_ENTRIES; i++) {
        const cx = i % CELL, cy = (i / CELL) | 0;
        const sx = xf ? CELL - 1 - cx : cx, sy = yf ? CELL - 1 - cy : cy;
        out[i] = ent[sy * CELL + sx];
      }
      s = String.fromCharCode(...out);
      cache.set(ck, s);
    }
    return s;
  };

  return (def: BlockDef): string =>
    def.cells.map((c) => `${cellKey(c.tile, c.xf, c.yf)}:${c.pal}`).join('|');
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
  // The clash gate and the cut below both work on the region's 8px grid. The
  // readout the artist has been watching works on the CANVAS's grid, so when
  // that one is offset the two disagree about where every cell begins: the
  // overlay can read clean while this refuses, or worse, read clean while the
  // cut lands mid-cell and one of the two lines in it is dropped. Neither is
  // something to discover after committing.
  const grid = input.gridOrigin ?? { originX: 0, originY: 0 };
  if (grid.originX % CELL !== 0 || grid.originY % CELL !== 0) {
    return { ok: false, refusal: { kind: 'grid-origin', originX: grid.originX, originY: grid.originY } };
  }

  const cellCount = region.chunksWide * region.chunksHigh;
  if (targets.length !== cellCount) {
    return { ok: false, refusal: { kind: 'target-count', expected: cellCount, got: targets.length } };
  }
  // One chunk, one target. Two region cells aimed at the same chunk file index
  // produce two writes to one slot: the second silently wins, the report counts
  // both, and the reclaim was computed as though one chunk's worth of art were
  // being freed when it was two.
  const aimedAt = new Set<number>();
  for (const t of targets) {
    if (t.chunkFileIndex === null) continue;
    if (t.chunkFileIndex < 0 || t.chunkFileIndex >= doc.chunks.length) {
      return {
        ok: false,
        refusal: { kind: 'target-invalid', detail: `chunk ${t.chunkFileIndex} is not in this act (it has ${doc.chunks.length})` },
      };
    }
    if (aimedAt.has(t.chunkFileIndex)) {
      return {
        ok: false,
        refusal: { kind: 'target-invalid', detail: `two cells of the region both replace chunk $${(t.chunkFileIndex + 1).toString(16).toUpperCase().padStart(2, '0')}` },
      };
    }
    aimedAt.add(t.chunkFileIndex);
  }

  // 2 · Clash gate — by CALLING the 2B rule, never restating it.
  const clashes = findCellClashes(input.pixels, { originX: 0, originY: 0 }, PALETTE_LINES)
    .filter((c) => c.x >= region.x && c.y >= region.y
      && c.x < region.x + region.chunksWide * CHUNK_PX
      && c.y < region.y + region.chunksHigh * CHUNK_PX);
  if (clashes.length) return { ok: false, refusal: { kind: 'cell-clash', cells: clashes } };

  // 3 · Palette gate.
  const docPal = flattenDocPalette(doc);
  // Compared on the bits the hardware displays, not the raw word: a palette
  // read out of a disasm can carry junk in the dead bits, and calling that
  // drift would turn a commit that changes no colour at all into a zone-wide
  // palette rewrite.
  const drifted = [...usedPaletteEntries(input.pixels, region)]
    .filter((flat) => !sameGenesisColor(input.canvasPalette[flat], docPal[flat]))
    .sort((a, b) => a - b);
  const driftedSet = new Set(drifted);
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
      const r = remapToActColours(input.pixels, region, input.canvasPalette, docPal, driftedSet);
      if ('unmappable' in r) {
        return { ok: false, refusal: { kind: 'palette-unmappable', entries: r.unmappable } };
      }
      pixels = r.pixels;
    } else {
      // ADOPT ONLY WHAT DRIFTED. Drift is measured over the entries this art
      // actually draws with; every other entry is the act's business, and a
      // canvas carries a full 64-word palette whether or not the artist ever
      // looked at it. Writing whole lines back would recolour existing zone art
      // — in every act sharing the palette file — from slots this drawing never
      // touched.
      paletteWrites = [];
      for (let l = 1; l < PALETTE_LINES; l++) {
        const base = l * CANVAS_LINE_LENGTH;
        const line = [...driftedSet].filter((flat) => flat >= base && flat < base + CANVAS_LINE_LENGTH);
        if (!line.length) continue;
        const colors = new Uint16Array(docPal.slice(base, base + CANVAS_LINE_LENGTH));
        for (const flat of line) colors[flat - base] = input.canvasPalette[flat] & GENESIS_WORD_MASK;
        paletteWrites.push({ line: l, colors });
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
  // An animated-art overlay slot is neither matchable nor allocatable: the
  // engine repaints it every few frames, so binding art to it would make the
  // drawing flicker. `allocated` is exactly that pair of properties, so saying
  // it here — once, up front — is the whole rule. Testing it at the match site
  // instead threw the match away rather than looking past it, which mints a
  // duplicate of a tile the pool already holds.
  for (const t of animTiles) avail.allocated.add(t);
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

  /**
   * Pool slots that were free BEFORE this gesture — reclaim is reported apart.
   *
   * Counted from the pool rather than from what is left when allocation fails,
   * because at that moment the live count is zero by construction: the refusal
   * would be reporting the tautology instead of the number that tells the
   * artist how much room the act actually has.
   */
  const countFreeSlots = (): number => {
    let n = 0;
    for (let t = 1; t < poolTiles; t++) {
      if (index.tileUsage(t).cells !== 0) continue;
      if (reserved.has(t) || animTiles.has(t) || !isEditableTile(t)) continue;
      n++;
    }
    return n;
  };

  /** Pool tile + the flips a referencing cell must carry, per resolved tile. */
  const tileBinding: { tileIndex: number; xf: boolean; yf: boolean }[] = [];
  for (const t of res.tiles) {
    if (t.blank) { tileBinding.push({ tileIndex: 0, xf: false, yf: false }); continue; }
    const want = packTileEntries(t.entries);
    const m = findPoolMatch(doc.tiles, want, avail, { allowFlips: true });
    if (m !== null) {
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
          free: countFreeSlots(),
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
  const blockWrites: { blockId: number; def: BlockDef; colind: number; blanked?: true }[] = [];
  const blockIdOf = new Map<string, number>();
  const reclaimBlocks = [...reclaim.blocks];
  // THE SAME THREE STATES AS THE TILE TIER, and for the same reason —
  // tile-pool-match.ts's header states the rule once. A reclaimed block id is a
  // legal match target (its bytes are still the ones on disk, and a kept 16x16
  // matching it is the conservation reclaim exists to enable) right up until the
  // allocator hands it out; after that the id is spent. Collapsing the two
  // states lets one plan both reuse and rewrite the same id, which corrupts the
  // kept cell's art AND — silently — its inherited collision.
  const blockAvail: PoolAvailability = emptyAvailability();
  let reclaimBlockCursor = 0;

  // Pool blocks by what they draw and the collision they carry, lowest id
  // first — the same order the linear scan this replaces would have found them.
  const blockRenderKey = blockRenderKeyFn(doc.tiles);
  const repainted = new Set(tileWrites.map((w) => w.tileIndex));
  const poolByRender = new Map<string, number[]>();
  for (let b = 1; b < doc.blocks.length; b++) {
    if (doc.blocks[b].cells.length !== 4) continue;
    // Its render key is read from the pool as it stands NOW, so a block whose
    // tiles step 6 just handed to new art does not draw that any more. Without
    // this, a kept 16x16 bound to a duplicate tile can match a block whose own
    // tile is about to be repainted underneath it.
    if (doc.blocks[b].cells.some((c) => repainted.has(c.tile))) continue;
    const k = `${blockRenderKey(doc.blocks[b])}#${doc.collision.colind[b] ?? 0}`;
    const at = poolByRender.get(k);
    if (at) at.push(b); else poolByRender.set(k, [b]);
  }
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
    // Identity is what the block draws plus the collision it carries — an
    // identical-looking block with a different shape is not a reuse candidate.
    const key = `${blockRenderKey(def)}#${colind}`;
    const seen = blockIdOf.get(key);
    if (seen !== undefined) return seen;

    for (const b of poolByRender.get(key) ?? []) {
      // Already given new bytes by this gesture: doc.blocks[b] is what WAS
      // there, so matching against it would repoint this cell at another cell's
      // art.
      if (blockAvail.allocated.has(b)) continue;
      blockAvail.matched.add(b);
      blockIdOf.set(key, b); blocksReused++; return b;
    }

    const spent = unavailableForAllocation(blockAvail);
    let id = -1;
    while (reclaimBlockCursor < reclaimBlocks.length) {
      const b = reclaimBlocks[reclaimBlockCursor++];
      if (!spent.has(b)) { id = b; break; }
    }
    if (id < 0) { id = nextAppendId; nextAppendId++; }
    if (id >= MAX_BLOCKS_TOTAL) return null;
    blockAvail.allocated.add(id);
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

  // 9 · Blank the reclaimed blocks nothing took. Every chunk that referred to
  // them has just been rewritten, so they are unreachable — but a stale def
  // still points at pool tiles, and the usage index counts those references, so
  // the tiles they strand can never be reclaimed by any later gesture. Blanking
  // is what makes the reclaim actually give the pool back.
  const blocksNew = blockWrites.length;
  const spentBlocks = unavailableForAllocation(blockAvail);
  let blocksZeroed = 0;
  for (const b of reclaim.blocks) {
    if (spentBlocks.has(b)) continue;
    blockWrites.push({
      blockId: b,
      def: { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) },
      colind: 0,
      blanked: true,
    });
    blocksZeroed++;
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
        blocksNew,
        blocksReused,
        blocksReclaimed: reclaim.blocks.length,
        blocksZeroed,
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
