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

/** Plane B nametable width in tiles (the engine's fixed 64x32 Plane B). */
export const BG_WIDTH = 64;

/**
 * First VRAM tile slot of the BG region. Engine-emitted layouts index tiles
 * from this slot (VRAM-absolute); the editor's in-memory convention is ALWAYS
 * local to the BG blob (tile 0 = first blob tile).
 */
export const BG_TILE_BASE_SLOT = 1024;

/**
 * Normalize a BG layout to the local index convention, once, at load time.
 *
 * Engine-convention layouts (every nonzero tile index >= base) get `base`
 * subtracted from each word's tile-index bits — pal/flip/pri bits are
 * preserved, and words with tile bits 0 (VRAM blank-tile refs) are left
 * untouched. Already-local layouts (min nonzero index < base, or all-blank)
 * pass through unchanged, so the function is idempotent and editor-saved
 * files load as-is.
 */
export function normalizeBgLayout(layout: Uint16Array, base: number): Uint16Array {
  let min = Infinity;
  for (let i = 0; i < layout.length; i++) {
    const idx = layout[i] & 0x7FF;
    if (idx > 0 && idx < min) min = idx;
  }
  if (min === Infinity || min < base) return layout; // no tile refs at all, or already local
  const out = new Uint16Array(layout.length);
  for (let i = 0; i < layout.length; i++) {
    const word = layout[i];
    const idx = word & 0x7FF;
    out[i] = idx === 0 ? word : (word & 0xF800) | (idx - base);
  }
  return out;
}
