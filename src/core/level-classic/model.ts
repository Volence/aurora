// The classic (Sonic 1) LevelDoc — Aurora's hierarchical, live editing model for
// a chunk-based Mega Drive level. This is the "never flatten" document from spec
// §2.2 (docs/specs/2026-08-09-disasm-project-abstraction-design.md): a level
// stays tiles → blocks → chunks → chunk-id layout in memory so save re-encodes
// the same hierarchy and shared-chunk edits propagate exactly as the game data
// does. Task 7's s1-io constructs these from real files; this module owns the
// type, the two Mega Drive word pack/unpack helpers, and edit-time validation.
//
// Pure core — no fs, no Electron.

import type { PaletteComponent } from '../project/profiles/s1';
import type { S1ObjectEntry } from '../formats/classic/s1-objpos';

// ---------------------------------------------------------------------------
// Word bit layouts — verified against SonLVLAPI
//   /home/volence/sonic_hacks/programs/SonLVL/SonLVLAPI/DataTypes.cs
// ---------------------------------------------------------------------------
//
// BLOCK CELL — the standard Mega Drive pattern-name word (PatternIndex,
// DataTypes.cs:150-221; ctor lines 187-193, GetUShort lines 208-216):
//   bits 0..10  (& 0x7FF)      tile index
//   bit  11     (0x800)        X flip
//   bit  12     (0x1000)       Y flip
//   bits 13..14 ((>>13) & 0x3) palette line
//   bit  15     (0x8000)       priority
//
// CHUNK CELL — S1ChunkBlock (DataTypes.cs:561-581; ctor lines 565-572, GetBytes
// lines 574-581). Note the flip bits sit at the SAME positions as the block word,
// but bits 13..14 carry solidity (Solid1) instead of palette, and there is no
// priority bit (bit 15 and bit 10 are unused in S1):
//   bits 0..9   (& 0x3FF)      block index
//   bit  11     (0x800)        X flip
//   bit  12     (0x1000)       Y flip
//   bits 13..14 ((>>13) & 0x3) solidity (0..3; see Solidity enum, DataTypes.cs:400)
//
// Field widths (masks applied on pack, matching SonLVLAPI's setters):
const TILE_MASK = 0x7ff; // block cell: 11-bit tile index (PatternIndex.Tile)
const BLOCK_MASK = 0x3ff; // chunk cell: 10-bit block index (ChunkBlock.Block)
const PAL_MASK = 0x3; // 2-bit palette line
const SOLIDITY_MASK = 0x3; // 2-bit solidity
const XFLIP_BIT = 0x800;
const YFLIP_BIT = 0x1000;
const SOLIDITY_SHIFT = 13; // also the palette shift for block cells
const PRIORITY_BIT = 0x8000;

// ---------------------------------------------------------------------------
// Types (spec §2.2)
// ---------------------------------------------------------------------------

/** One 8x8 tile reference inside a 16x16 block. */
export interface BlockCell {
  tile: number;
  xf: boolean;
  yf: boolean;
  pal: number;
  pri: boolean;
}

/** A 16x16 block: exactly 4 tile cells in TL, TR, BL, BR order (row-major 2x2). */
export interface BlockDef {
  cells: BlockCell[];
}

/** One 16x16 block reference inside a 256x256 chunk. */
export interface ChunkCell {
  block: number;
  xf: boolean;
  yf: boolean;
  /** Solidity plane (0..3): NotSolid / TopSolid / LRBSolid / AllSolid. */
  solidity: number;
}

/** A 256x256 chunk: exactly 256 block cells (16x16, row-major). */
export interface ChunkDef256 {
  cells: ChunkCell[];
}

/**
 * A chunk-id layout plane. `cells` is the raw layout payload (chunk ids; bit 7 =
 * S1's loop flag, kept in-band). NOTE: for 4 known-irregular real S1 files
 * `cells.length !== width*height` — some carry one trailing byte, ending.bin is
 * truncated (see s1-layout.ts header). Consumers must clamp/pad by the declared
 * width/height and never assume `cells.length === width*height`.
 */
export interface LayoutGrid {
  width: number;
  height: number;
  cells: Uint8Array;
}

export interface LevelDoc {
  game: 's1';
  /** 4bpp tile pool, 32 bytes/tile; animated-art slots blitted at their vramTileIndex. */
  tiles: Uint8Array;
  blocks: BlockDef[];
  chunks: ChunkDef256[];
  fg: LayoutGrid;
  bg: LayoutGrid;
  collision: {
    /** Block id → collision-shape index (editable). */
    colind: Uint8Array;
    /** Read-only shape tables, for rendering the collision overlay. */
    shapes: { heights: Int8Array[]; angles: Uint8Array };
  };
  /** 4 palette lines × 16 CRAM words. */
  palettes: Uint16Array[];
  /** Profile composition rule for each palette component, for save-back. */
  paletteSources: PaletteComponent[];
  objects: S1ObjectEntry[];
  start: { x: number; y: number };
  /** Domain → resolved file path (drives save + mtime guard). */
  sourceRefs: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Word pack / unpack
// ---------------------------------------------------------------------------

/** Pack a block cell into a Mega Drive pattern-name word (SonLVLAPI PatternIndex). */
export function packBlockCell(c: BlockCell): number {
  let w = c.tile & TILE_MASK;
  if (c.xf) w |= XFLIP_BIT;
  if (c.yf) w |= YFLIP_BIT;
  w |= (c.pal & PAL_MASK) << SOLIDITY_SHIFT;
  if (c.pri) w |= PRIORITY_BIT;
  return w & 0xffff;
}

/** Unpack a Mega Drive pattern-name word into a block cell. */
export function unpackBlockCell(w: number): BlockCell {
  return {
    tile: w & TILE_MASK,
    xf: (w & XFLIP_BIT) !== 0,
    yf: (w & YFLIP_BIT) !== 0,
    pal: (w >> SOLIDITY_SHIFT) & PAL_MASK,
    pri: (w & PRIORITY_BIT) !== 0,
  };
}

/** Pack a chunk cell into an S1 chunk-block word (SonLVLAPI S1ChunkBlock). */
export function packChunkCell(c: ChunkCell): number {
  let w = c.block & BLOCK_MASK;
  if (c.xf) w |= XFLIP_BIT;
  if (c.yf) w |= YFLIP_BIT;
  w |= (c.solidity & SOLIDITY_MASK) << SOLIDITY_SHIFT;
  return w & 0xffff;
}

/** Unpack an S1 chunk-block word into a chunk cell. */
export function unpackChunkCell(w: number): ChunkCell {
  return {
    block: w & BLOCK_MASK,
    xf: (w & XFLIP_BIT) !== 0,
    yf: (w & YFLIP_BIT) !== 0,
    solidity: (w >> SOLIDITY_SHIFT) & SOLIDITY_MASK,
  };
}

// ---------------------------------------------------------------------------
// Validation — hard limits the S1 format cannot encode (spec §2.2)
// ---------------------------------------------------------------------------

const MAX_BLOCKS = 0x400; // block ids are 10-bit → at most 1024 entries
const MAX_CHUNKS = 256; // chunk ids are one byte → at most 256 entries
const MAX_BLOCK_REF = 0x3ff; // chunk cell block field width
const MAX_LAYOUT_W = 64; // INI levelwidthmax; applies to fg and bg (all real bg fit)
const MAX_LAYOUT_H = 8; // INI levelheightmax
const PALETTE_LINES = 4;
const PALETTE_LINE_LEN = 16;
const MAX_OBJ_ID = 0x7f;
const MAX_OBJ_SUBTYPE = 0xff;
const MAX_OBJ_X = 0xffff;
const MAX_OBJ_Y = 0x0fff;

/**
 * Push a violation when `val` falls outside the inclusive [lo, hi] range. Guards
 * BOTH bounds: every packed field wraps under its mask if fed a negative value
 * (tile:-1, block:-1, x:-1, …), so the lower bound matters as much as the upper.
 */
function inRange(out: string[], label: string, val: number, lo: number, hi: number): void {
  if (val < lo || val > hi) {
    out.push(`${label} ${val} out of range ${lo}..${hi}`);
  }
}

function validateLayout(name: string, g: LayoutGrid, out: string[]): void {
  // cells.length may legitimately differ from width*height (irregular files);
  // only the declared dimensions are bounded.
  inRange(out, `${name} width`, g.width, 1, MAX_LAYOUT_W);
  inRange(out, `${name} height`, g.height, 1, MAX_LAYOUT_H);
}

/**
 * Return a list of human-readable rule violations; an empty array means the doc
 * satisfies every S1 hard limit. Structural (edit-time) validation only — it
 * does not re-verify read-only shape tables.
 */
export function validateLevelDoc(doc: LevelDoc): string[] {
  const out: string[] = [];

  const tileCount = Math.floor(doc.tiles.length / 32);

  // Blocks
  if (doc.blocks.length > MAX_BLOCKS) {
    out.push(`too many blocks: ${doc.blocks.length} > ${MAX_BLOCKS}`);
  }
  doc.blocks.forEach((b, i) => {
    if (b.cells.length !== 4) {
      out.push(`block ${i} must have exactly 4 cells (got ${b.cells.length})`);
    }
    b.cells.forEach((c, j) => {
      // tile pool holds indices 0..tileCount-1 (an empty pool admits nothing).
      inRange(out, `block ${i} cell ${j} tile`, c.tile, 0, tileCount - 1);
      inRange(out, `block ${i} cell ${j} pal`, c.pal, 0, PAL_MASK);
    });
  });

  // Chunks
  if (doc.chunks.length > MAX_CHUNKS) {
    out.push(`too many chunks: ${doc.chunks.length} > ${MAX_CHUNKS}`);
  }
  doc.chunks.forEach((ch, i) => {
    if (ch.cells.length !== 256) {
      out.push(`chunk ${i} must have exactly 256 cells (got ${ch.cells.length})`);
    }
    ch.cells.forEach((c, j) => {
      inRange(out, `chunk ${i} cell ${j} block ref`, c.block, 0, MAX_BLOCK_REF);
      inRange(out, `chunk ${i} cell ${j} solidity`, c.solidity, 0, SOLIDITY_MASK);
    });
  });

  // Layouts (chunk ids are inherently <= $FF via Uint8Array, so not re-checked)
  validateLayout('fg', doc.fg, out);
  validateLayout('bg', doc.bg, out);

  // Palette: exactly 4 lines × 16 words
  if (doc.palettes.length !== PALETTE_LINES) {
    out.push(`palette must have exactly ${PALETTE_LINES} lines (got ${doc.palettes.length})`);
  }
  doc.palettes.forEach((line, i) => {
    if (line.length !== PALETTE_LINE_LEN) {
      out.push(`palette line ${i} must have ${PALETTE_LINE_LEN} words (got ${line.length})`);
    }
  });

  // Objects
  doc.objects.forEach((o, i) => {
    inRange(out, `object ${i} id`, o.id, 0, MAX_OBJ_ID);
    inRange(out, `object ${i} subtype`, o.subtype, 0, MAX_OBJ_SUBTYPE);
    inRange(out, `object ${i} x`, o.x, 0, MAX_OBJ_X);
    inRange(out, `object ${i} y`, o.y, 0, MAX_OBJ_Y);
  });

  return out;
}
