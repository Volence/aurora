// src/renderer/components/canvas/canvas-commit-model.ts
//
// THE RULES BEHIND THE COMMIT PANEL, kept out of the .tsx so the node suite can
// reach them — the same split `new-canvas.ts` uses, and for the same reason: a
// rule inside a component is a rule no test can execute.
//
// Nothing here plans or applies anything. It decides what the panel may OFFER
// (how much of the canvas is committable, which chunks a target may name) and
// how a plan's outcome READS. `planCanvasCommit` remains the sole authority on
// what is actually legal, every time.

import type {
  CommitRefusal, CommitReport, CommitTarget, CommitPlanResult, PaletteResolution,
} from '../../../core/art/classic-commit-plan';
import { planCanvasCommit } from '../../../core/art/classic-commit-plan';
import { CHUNK_PX } from '../../../core/art/canvas-resolve';
import type { LevelDoc } from '../../../core/level-classic/model';
import { buildUsageIndex } from '../../../core/level-classic/usage-index';
import type { EditableTileRange } from '../../../core/project/adapter';
import { isTileEditable, animatedTileSet } from '../../../core/project/editable-tiles';
import type { PixelBuffer } from '../../../core/art/pixel-ops';

/** How many whole chunks a canvas of this size can contribute. */
export interface CanvasChunkCapacity {
  wide: number;
  high: number;
  total: number;
  /** Pixels the 256-grid cannot reach. Reported, never silently rounded away. */
  remainderX: number;
  remainderY: number;
}

export function canvasChunkCapacity(width: number, height: number): CanvasChunkCapacity {
  const wide = Math.floor(width / CHUNK_PX);
  const high = Math.floor(height / CHUNK_PX);
  return {
    wide, high, total: wide * high,
    remainderX: width - wide * CHUNK_PX,
    remainderY: height - high * CHUNK_PX,
  };
}

/**
 * What a fresh commit aims at: append everything.
 *
 * APPENDING IS THE SAFE DEFAULT. A default of "replace chunks 0..n" would make
 * the first click of a new feature overwrite existing level art, and reclaim
 * would free that art's tiles at the same time — destructive in two tiers at
 * once, from a control the artist has not yet understood. Replacing is one
 * deliberate choice per chunk.
 */
export function defaultTargets(count: number): CommitTarget[] {
  return Array.from({ length: count }, () => ({ chunkFileIndex: null }));
}

/** Chunk file indices a target may name, as {value,label} rows for a select.
 *  Engine id is index + 1, and that is what the rest of the app shows, so the
 *  label carries it and the value stays a file index. */
export function targetOptions(chunkCount: number): { value: number | null; label: string }[] {
  const rows: { value: number | null; label: string }[] = [{ value: null, label: 'Append as new chunk' }];
  for (let i = 0; i < chunkCount; i++) {
    rows.push({ value: i, label: `Replace chunk $${(i + 1).toString(16).toUpperCase().padStart(2, '0')}` });
  }
  return rows;
}

/**
 * Human-readable lines for a successful plan's report, in display order.
 *
 * `applied` is `withCollision(plan).applied` — pass it when the "Give new art
 * collision" toggle is on, so the preview describes the plan that will
 * actually be applied rather than the one the planner produced before the
 * toggle. Its `cells` count is the more precise one: `r.cellsWithoutSolidity`
 * counts every appended cell with no predecessor, block 0 (blank) included,
 * while `applied.cells` counts only the ones that actually gain solidity.
 */
export function reportLines(r: CommitReport, applied?: { blocks: number; cells: number }): string[] {
  const lines = [
    `tiles: ${r.tilesNew} new · ${r.tilesReused} reused · ${r.tilesReclaimed} reclaimed`,
    `blocks: ${r.blocksNew} new · ${r.blocksReused} reused · ${r.blocksReclaimed} reclaimed`,
    `chunks: ${r.chunksReplaced} replaced · ${r.chunksAppended} appended`,
    `pool: ${r.poolBefore.blocks} → ${r.poolAfter.blocks} blocks · `
      + `${r.poolBefore.chunks} → ${r.poolAfter.chunks} chunks`,
  ];
  // Collision is stated whenever any of it is missing, because "the player falls
  // through this" is the one outcome that must never be discovered in game.
  if (r.blocksWithoutCollision > 0) {
    lines.push(applied
      ? `collision: ${r.blocksInheritedCollision} inherited · ${applied.blocks} will get flat ($FF)`
      : `collision: ${r.blocksInheritedCollision} inherited · ${r.blocksWithoutCollision} have none`);
  } else if (r.blocksInheritedCollision > 0) {
    lines.push(`collision: all ${r.blocksInheritedCollision} inherited`);
  }
  if (r.cellsWithoutSolidity > 0) {
    lines.push(applied
      ? `solidity: ${applied.cells} cell${applied.cells === 1 ? '' : 's'} will become solid (appended chunks)`
      : `solidity: ${r.cellsWithoutSolidity} cells have none (appended chunks)`);
  }
  return lines;
}

/** Which palette resolutions a refusal offers, if any. */
export type OfferedResolution = 'use-act-colours' | 'adopt-into-zone';

export interface RefusalView {
  /** One sentence, stating what is wrong. */
  message: string;
  /** What the artist can do about it, in their words. */
  resolution: string;
  /** Buttons the panel should show. Empty for refusals with no in-app fix. */
  offers: OfferedResolution[];
}

const listEntries = (flat: number[]): string => flat
  .slice(0, 6)
  .map((f) => `line ${Math.floor(f / 16)} entry ${f % 16}`)
  .join(', ') + (flat.length > 6 ? `, and ${flat.length - 6} more` : '');

/**
 * Every refusal names a resolution. A commit that stops with only "no" is the
 * thing that sends an artist back to another tool, which is the one outcome the
 * origination canvas exists to prevent.
 */
export function refusalView(r: CommitRefusal): RefusalView {
  switch (r.kind) {
    case 'region-misaligned':
      return {
        message: `The commit region is not aligned to the 256px chunk grid (${r.detail}).`,
        resolution: 'Move the region so its corner sits on a chunk boundary.',
        offers: [],
      };
    case 'region-out-of-bounds':
      return {
        message: `The commit region does not fit in this canvas (${r.detail}).`,
        resolution: 'Commit fewer chunks, or enlarge the canvas.',
        offers: [],
      };
    case 'target-count':
      return {
        message: `The region holds ${r.expected} chunks but ${r.got} targets were named.`,
        resolution: 'Name one target per chunk in the region.',
        offers: [],
      };
    case 'grid-origin':
      return {
        message: `This canvas's cell grid is offset to (${r.originX}, ${r.originY}), so the guides and the unique-tile readout describe different 8×8 cells than a commit would cut.`,
        resolution: 'Set the grid origin back to a multiple of 8 — commit always cuts from the canvas corner.',
        offers: [],
      };
    case 'target-invalid':
      return {
        message: `This commit cannot be aimed where it is pointed: ${r.detail}.`,
        resolution: 'Give each chunk of the region its own target.',
        offers: [],
      };
    case 'cell-clash':
      return {
        message: `${r.cells.length} cell${r.cells.length === 1 ? '' : 's'} draw from more than one palette line, which no block can express.`,
        resolution: 'Turn on the clash overlay to see them, and redraw those cells in one line.',
        offers: [],
      };
    case 'palette-drift':
      return r.touchesLine0
        ? {
          message: `This drawing recolours ${listEntries(r.entries)}, which belong to Sonic's palette — shared by every zone in the game.`,
          resolution: 'Restore those entries to the act\'s colours. Line 0 is not the level\'s to change.',
          offers: [],
        }
        : {
          message: `This drawing uses colours the act does not have: ${listEntries(r.entries)}.`,
          resolution: 'Either re-index the art onto the act\'s colours, or write yours into the zone palette.',
          offers: ['use-act-colours', 'adopt-into-zone'],
        };
    case 'palette-unmappable':
      return {
        message: `${r.entries.length} colour${r.entries.length === 1 ? '' : 's'} have no equivalent in the act's palette, so the art cannot be re-indexed onto it.`,
        resolution: 'Adopt the canvas palette into the zone instead, or repaint those colours.',
        offers: ['adopt-into-zone'],
      };
    case 'predicates-unknown':
      return {
        message: `Replacing chunks needs the ${r.which.join(' and ')}, which could not be read for this act.`,
        resolution: 'Reopen the project so they resolve. Appending works meanwhile — it reclaims nothing.',
        offers: [],
      };
    case 'tiles-exhausted':
      return {
        message: `This drawing needs ${r.needed} tiles and only ${r.available} are available `
          + `(${r.free} free in the act's pool, ${r.reclaimed} reclaimed from the chunks being replaced).`,
        resolution: 'Replace more chunks — their art is reclaimed — or simplify the drawing.',
        offers: [],
      };
    case 'blocks-exhausted':
      return {
        message: `This commit would need block ${r.needed}, past the ${r.ceiling}-block ceiling.`,
        resolution: 'Replace more chunks so their blocks are reclaimed, or reuse more 16×16 shapes.',
        offers: [],
      };
    case 'chunks-exhausted':
      return {
        message: `This commit would leave ${r.needed} chunks, past the ${r.ceiling} the layout byte can address.`,
        resolution: 'Replace existing chunks instead of appending.',
        offers: [],
      };
  }
}

/**
 * Everything the panel reads out of the stores, in one shape.
 *
 * `range` being null is what "the editable span is unknown" means, and it is the
 * ONE place that is turned into `editableRangeKnown`. The planner then refuses to
 * RECLAIM under it while still allowing an additive commit — phase 1 treats the
 * same null permissively because one gesture risks a few tiles, where a
 * full-zone reclaim under unknown predicates would expose the whole pool.
 */
export interface CommitSnapshot {
  doc: LevelDoc;
  reservedTiles: ReadonlySet<number> | null;
  range: EditableTileRange | null;
  pixels: PixelBuffer;
  canvasPalette: number[];
  targets: CommitTarget[];
  paletteResolution: PaletteResolution;
  /** The source canvas's cell-grid origin; absent for pixels that have no grid
   *  of their own (an imported sheet). See CommitPlanInput.gridOrigin. */
  gridOrigin?: { originX: number; originY: number };
}

/**
 * Plan a commit of every whole chunk the canvas holds, from the top-left corner.
 *
 * The region is derived rather than chosen: commit works on whole chunks, so the
 * committable area is exactly `canvasChunkCapacity`, and any remainder is
 * reported by the panel rather than quietly included or dropped.
 */
export function planFromSnapshot(snap: CommitSnapshot): CommitPlanResult {
  const cap = canvasChunkCapacity(snap.pixels.width, snap.pixels.height);
  return planCanvasCommit({
    doc: snap.doc,
    index: buildUsageIndex(snap.doc),
    pixels: snap.pixels,
    region: { x: 0, y: 0, chunksWide: cap.wide, chunksHigh: cap.high },
    canvasPalette: snap.canvasPalette,
    targets: snap.targets,
    paletteResolution: snap.paletteResolution,
    gridOrigin: snap.gridOrigin,
    // ONE predicate, shared with the composer's lock badge and the store's
    // commands — never a second copy of the rule.
    isEditableTile: (t) => isTileEditable(snap.range, t),
    reservedTiles: snap.reservedTiles,
    editableRangeKnown: snap.range !== null,
    // Derived from the same animRanges the editable predicate reads, so the two
    // can never disagree about which slots animate.
    animTiles: animatedTileSet(snap.range),
  });
}
