import type { Tile } from '../model/s4-types';
import { parseTiles } from './tiles';
import { serializeTiles } from '../export/tile-dedup';

// Zone-wide background (Plane B) tile blob.
//
// Engine format (s4_engine/tools/ojz_strip_gen.py emit_bg_tile_blob): a 2-byte
// big-endian header holding the BYTE LENGTH of the body (not the tile count),
// followed by raw 32-byte 4bpp tiles. The header mirrors the S4LZ blob shape
// the engine DMAs from.

/**
 * Parse a BG tile blob. Accepts both the engine shape (2-byte BE byte-length
 * header + body) and a headerless raw tile dump (body only) — the header is
 * detected, never assumed, so legacy/hand-made files still load.
 */
export function parseBgTiles(data: Uint8Array): Tile[] {
  if (data.length >= 2 && (data.length - 2) % 32 === 0) {
    const header = (data[0] << 8) | data[1];
    if (header === data.length - 2) {
      return parseTiles(data.subarray(2));
    }
  }
  return parseTiles(data);
}

/** Serialize a BG tile blob in the engine shape: BE byte-length header + raw tiles. */
export function serializeBgTiles(tiles: Tile[]): Uint8Array {
  const body = serializeTiles(tiles);
  const out = new Uint8Array(2 + body.length);
  out[0] = (body.length >> 8) & 0xFF;
  out[1] = body.length & 0xFF;
  out.set(body, 2);
  return out;
}

/** Min nonzero tile index referenced by a BG layout (the engine's VRAM base slot). */
function layoutVramBase(layout: Uint16Array): number {
  let base = 0x7FF;
  for (let i = 0; i < layout.length; i++) {
    const idx = layout[i] & 0x7FF;
    if (idx > 0 && idx < base) base = idx;
  }
  return base;
}

/**
 * Make a parsed BG blob directly indexable by the layout's tile indices.
 *
 * Engine-emitted layouts use VRAM-absolute indices (BG_TILE_BASE_SLOT + n,
 * i.e. 1024+) while the blob stores only the referenced tiles — so the blob
 * is padded with blank tiles up to the min nonzero index. Editor/agent
 * layouts already use indices local to the blob (max index < blob length)
 * and are returned untouched.
 */
export function padBgTilesToLayout(layout: Uint16Array, tiles: Tile[]): Tile[] {
  if (tiles.length === 0) return tiles;
  let maxIdx = 0;
  for (let i = 0; i < layout.length; i++) {
    const idx = layout[i] & 0x7FF;
    if (idx > maxIdx) maxIdx = idx;
  }
  if (maxIdx < tiles.length) return tiles; // indices already local to the blob
  const base = layoutVramBase(layout);
  if (base <= 0 || base >= 0x7FF) return tiles;
  const padded: Tile[] = new Array(base + tiles.length);
  for (let t = 0; t < base; t++) padded[t] = { pixels: new Uint8Array(64) };
  for (let t = 0; t < tiles.length; t++) padded[base + t] = tiles[t];
  return padded;
}

/**
 * Inverse of padBgTilesToLayout for saving: drop the blank padding prefix
 * below the layout's min nonzero index so a reload (parse + pad) rebuilds the
 * exact in-memory array. Refuses to strip when the prefix contains art (e.g.
 * agent-built layouts that reference tile 0), where the unpadded blob already
 * round-trips because every index stays below the blob length.
 */
export function stripBgTilePadding(layout: Uint16Array, tiles: Tile[]): Tile[] {
  const base = layoutVramBase(layout);
  if (base <= 0 || base >= 0x7FF || base >= tiles.length) return tiles;
  for (let t = 0; t < base; t++) {
    const px = tiles[t]?.pixels;
    if (!px || px.some(p => p !== 0)) return tiles;
  }
  return tiles.slice(base);
}
