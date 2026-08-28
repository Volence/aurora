import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { Section, ChunkDef } from '../model/s4-types';
import { buildRegionWriteCommand } from './map-stamp';
import type { BatchCommand } from './commands';

/**
 * A copied map region: art always, both collision planes only when the region
 * is BLOCK-ALIGNED (see `artOnly`).
 *
 * THE ASYMMETRY THIS TYPE EXISTS TO CARRY. Art is per-8px TILE: one nametable
 * word per tile, `SECTION_TILES_WIDE`-strided. Collision is per-16px CELL: one
 * engine attr word shared by all four tiles of a 2x2 block (see
 * `collision/collision-cell.ts` `cellTileIndices`, and `OverlayRenderer`'s
 * "both tiles of a cell share the word"). So a rectangle that does not start
 * and end on even tile coords has NO representation for its collision — every
 * cell it touches is shared with tiles outside the rectangle, and a paste that
 * wrote one would either invent a winner among four tiles or corrupt the
 * neighbour. That is a property of the engine's data, not a gap in this code.
 */
export interface MapClipboard {
  widthTiles: number;
  heightTiles: number;
  nametable: Uint16Array;    // widthTiles*heightTiles, row-major
  /** (w>>1)*(h>>1) when `artOnly` is false; EMPTY when it is true. */
  collisionA: Uint16Array;
  collisionB: Uint16Array;
  /**
   * True when the captured rect was NOT block-aligned, so this clipboard
   * carries art and nothing else.
   *
   * A STRUCTURAL flag rather than a caller-side re-derivation on purpose: the
   * copy site is the only place that knows the source rect, and every consumer
   * downstream (paste, the paste-layers control, the toast) has to make the
   * same call. Deriving it three times is three chances to derive it once
   * wrongly and silently paste air over an author's collision.
   */
  artOnly: boolean;
}

export type PasteLayers = 'both' | 'art' | 'collision';

/**
 * The granularity a marquee drag snaps to.
 *
 * `block` (the default, and what shipped before) rounds OUT to 16px blocks;
 * `tile` takes the dragged tiles exactly. Named after the two paint tools this
 * facet already offers — `paint-block` writes a 2x2 tile run, `paint-tile`
 * writes one 8x8 tile (MapViewport's tool branches), and neither touches
 * collision — so the vocabulary the author has already learned there is the
 * vocabulary here.
 */
export type MarqueeGranularity = 'block' | 'tile';

/**
 * THE MODIFIER RULE: Ctrl/Cmd during a marquee drag means "the OTHER one".
 *
 * The owner asked for *"if you hold control it behaves like it did where it
 * forces to draw collision size"* — Ctrl = block snapping, the pre-tile-
 * granularity behaviour. Taken literally that is a NO-OP in the shipped state:
 * `block` is still the default (`editorStore.marqueeGranularity`), so an author
 * who never touched the Snap control is already in block mode and holding Ctrl
 * would change nothing at all.
 *
 * So the modifier INVERTS the armed setting instead. Block + Ctrl gives tile,
 * tile + Ctrl gives block — which IS what he asked for whenever the Snap
 * control is set to Tile, and is the useful half of the gesture in the default
 * state where the literal reading does nothing. One rule, symmetric in both
 * directions, and the author never has to recall which way the panel is set:
 * the modifier is always the other one.
 *
 * A separate named function rather than a ternary at the two call sites because
 * three surfaces have to agree on it — MapViewport's mousedown, its mousemove,
 * and the panel's readout of which mode is actually in force. Two of those
 * decide the rect and the third describes it; a copy of the ternary in each is
 * how a panel comes to lie about the drag it is watching.
 *
 * Like `marqueeGranularity` itself this is a property of the DRAG, never of the
 * selection: the committed rect records only its geometry, and `isBlockAligned`
 * answers every downstream question from that.
 */
export function effectiveGranularity(base: MarqueeGranularity, invert: boolean): MarqueeGranularity {
  if (!invert) return base;
  return base === 'block' ? 'tile' : 'block';
}

/**
 * Is this tile rect expressible in 16px collision cells?
 *
 * Origin AND size both have to be even: an odd origin puts the rect's first
 * cell half outside it, an odd size puts the last cell half outside it, and
 * either way there is no cell the rect wholly owns at that edge.
 *
 * Keyed on the GEOMETRY, never on the granularity that produced it — a
 * tile-granularity drag that happens to land on even bounds is block-aligned
 * and carries collision like any other, and a caller that asked for `block` is
 * always aligned by construction. Nothing has to know which mode was armed.
 */
export function isBlockAligned(col: number, row: number, w: number, h: number): boolean {
  return (col % 2) === 0 && (row % 2) === 0 && (w % 2) === 0 && (h % 2) === 0;
}

/**
 * How to SAY a selection's size, in the units it is actually expressible in.
 *
 * One function because three surfaces have to agree — the copy toast, the
 * marquee panel's readout, and the paste command's undo description. Before
 * tile granularity they all hardcoded `w/2 x h/2 blocks`, which for a 5x3-tile
 * rect prints "2x1 blocks": a wrong number, in the wrong unit, for a selection
 * that is neither. A rect that is not block-aligned has no block size, so it is
 * named in tiles and nothing else.
 */
export function selectionSizeLabel(col: number, row: number, w: number, h: number): string {
  if (isBlockAligned(col, row, w, h)) return `${w >> 1}×${h >> 1} blocks`;
  return `${w}×${h} tiles`;
}

/** The one sentence that explains why a selection is art-only, for whichever
 *  surface has room for it. Empty string when it is not. */
export function artOnlyReason(col: number, row: number, w: number, h: number): string {
  if (isBlockAligned(col, row, w, h)) return '';
  return 'Not block-aligned — collision is stored per 16px block, so this selection is ART ONLY.';
}

/** Snap a tile-coord drag rect, clamped to the section. Corners may arrive in
 *  any order. In `block` granularity the rect rounds OUT to 16px boundaries so
 *  the marquee always covers what was dragged; in `tile` granularity it is the
 *  dragged tiles exactly, inclusive of both endpoints. */
export function snapMarquee(c0: number, r0: number, c1: number, r1: number,
  granularity: MarqueeGranularity = 'block'):
  { col: number; row: number; w: number; h: number } {
  let minC = Math.min(c0, c1), maxC = Math.max(c0, c1);
  let minR = Math.min(r0, r1), maxR = Math.max(r0, r1);

  // Clamp to the section BEFORE snapping — an out-of-bounds drag endpoint
  // must not push the snapped rect past the section edge.
  minC = Math.max(0, Math.min(minC, SECTION_TILES_WIDE - 1));
  maxC = Math.max(0, Math.min(maxC, SECTION_TILES_WIDE - 1));
  minR = Math.max(0, Math.min(minR, SECTION_TILES_HIGH - 1));
  maxR = Math.max(0, Math.min(maxR, SECTION_TILES_HIGH - 1));

  if (granularity === 'tile') {
    return { col: minC, row: minR, w: maxC - minC + 1, h: maxR - minR + 1 };
  }

  const col = Math.floor(minC / 2) * 2;
  const row = Math.floor(minR / 2) * 2;
  const endCol = Math.min(SECTION_TILES_WIDE, Math.ceil((maxC + 1) / 2) * 2);
  const endRow = Math.min(SECTION_TILES_HIGH, Math.ceil((maxR + 1) / 2) * 2);

  return { col, row, w: endCol - col, h: endRow - row };
}

/**
 * Capture a section region (tile coords) into a clipboard.
 *
 * Art always. Collision ONLY when (col,row,w,h) is block-aligned — otherwise
 * the result is `artOnly` with EMPTY collision planes, for the reason in
 * MapClipboard's docblock. Empty rather than zero-filled deliberately: a
 * zero-filled plane of the right length is indistinguishable from "this region
 * is all air", and pasting it would ERASE the destination's collision (the
 * region writer treats air as authoritative). A length-0 plane cannot be
 * mistaken for data by anything, and `buildRegionWriteCommand` refuses it by
 * length.
 *
 * Missing/unseeded section collision planes read as air, as before.
 */
export function copyFromSection(section: Section, col: number, row: number,
  w: number, h: number): MapClipboard {
  const nametable = new Uint16Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const srcIdx = (row + r) * SECTION_TILES_WIDE + (col + c);
      nametable[r * w + c] = section.tileGrid.nametable[srcIdx];
    }
  }

  if (!isBlockAligned(col, row, w, h)) {
    return {
      widthTiles: w, heightTiles: h, nametable,
      collisionA: new Uint16Array(0), collisionB: new Uint16Array(0),
      artOnly: true,
    };
  }

  const cellsW = w >> 1, cellsH = h >> 1;
  const collisionA = new Uint16Array(cellsW * cellsH);
  const collisionB = new Uint16Array(cellsW * cellsH);
  const planeA = section.collisionEdit ?? null;
  const planeB = section.collisionEditB ?? null;
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      const tlCol = col + cx * 2, tlRow = row + cy * 2;
      const srcIdx = tlRow * SECTION_TILES_WIDE + tlCol;
      const outIdx = cy * cellsW + cx;
      collisionA[outIdx] = planeA ? planeA[srcIdx] : 0;
      collisionB[outIdx] = planeB ? planeB[srcIdx] : 0;
    }
  }

  return { widthTiles: w, heightTiles: h, nametable, collisionA, collisionB, artOnly: false };
}

/** Thin pure adapter: a chunk's nametable + both collision planes as a
 *  MapClipboard, so a chunk can seed the map clipboard (Art mode Ctrl+C on a
 *  chunk doc). Copies, never aliases, the chunk's arrays. */
export function copyChunkToClipboard(chunk: ChunkDef): MapClipboard {
  // Alignment read off the chunk's own SHAPE, not assumed: `chunkCellCount`
  // FLOORS (w>>1)*(h>>1), so an odd-sized chunk's collision planes are already
  // short of its footprint and pasting them would land a row/column out. Such a
  // chunk pastes as art, on the same rule an unaligned marquee does.
  const aligned = isBlockAligned(0, 0, chunk.widthTiles, chunk.heightTiles);
  return {
    widthTiles: chunk.widthTiles,
    heightTiles: chunk.heightTiles,
    nametable: new Uint16Array(chunk.nametable),
    collisionA: aligned ? new Uint16Array(chunk.collisionA) : new Uint16Array(0),
    collisionB: aligned ? new Uint16Array(chunk.collisionB) : new Uint16Array(0),
    artOnly: !aligned,
  };
}

/**
 * The layers a paste of `clip` can ACTUALLY write, given what it carries.
 *
 * An `artOnly` clipboard has no collision to write, so `both` collapses to
 * `art` and `collision` collapses to nothing at all. Exported because the UI
 * has to show the same answer the command builder will act on — the paste
 * layers control disables what this rules out, and a control that offered a
 * mode the builder then dropped would be exactly the silent degradation this
 * whole rule exists to avoid.
 */
export function effectivePasteLayers(clip: MapClipboard, layers: PasteLayers): PasteLayers | null {
  if (!clip.artOnly) return layers;
  return layers === 'collision' ? null : 'art';
}

/**
 * The tile-coord grid a paste of `clip` can land on.
 *
 * 2 for a clipboard with collision — `buildRegionWriteCommand` derives its
 * destination cells as `baseCol >> 1`, which FLOORS, so an odd base would put
 * the art one tile off the collision it is supposed to describe. 1 for an
 * art-only clipboard, which is the whole point of a tile-granular selection:
 * nothing downstream halves the base, so any tile is a legal origin.
 */
export function pasteBaseStep(clip: MapClipboard): 1 | 2 {
  return clip.artOnly ? 1 : 2;
}

/** Build the atomic paste command at (baseCol,baseRow) tile coords (snapped by
 *  the caller to `pasteBaseStep(clip)`). Clipboard is authoritative over its
 *  footprint in the pasted layers (air clears); out-of-bounds cells are
 *  dropped. Shares its region-diffing internals with buildStampCommand
 *  (map-stamp.ts) — same shapes (nametable + two cell-word planes over a
 *  footprint), different source object. Returns null when nothing changes, and
 *  when the requested layers collapse to nothing (see effectivePasteLayers). */
export function buildPasteCommand(args: {
  clip: MapClipboard; section: Section; sectionIndex: number;
  baseCol: number; baseRow: number; layers: PasteLayers; description: string;
}): BatchCommand | null {
  const { clip, section, sectionIndex, baseCol, baseRow, layers, description } = args;
  const effective = effectivePasteLayers(clip, layers);
  if (effective === null) return null;
  return buildRegionWriteCommand({
    source: clip, section, sectionIndex, baseCol, baseRow,
    writeArt: effective !== 'collision', writeCollision: effective !== 'art', description,
  });
}
