import type { Tile } from '../model/s4-types';
import { unpackNametableWord, packNametableWord } from '../model/s4-types';

const hashCache = new WeakMap<Uint8Array, string>();

function tileHash(pixels: Uint8Array): string {
  const cached = hashCache.get(pixels);
  if (cached !== undefined) return cached;
  let s = '';
  for (let i = 0; i < 64; i++) s += (pixels[i] & 0xF).toString(16);
  hashCache.set(pixels, s);
  return s;
}

/** One union per VRAM color group: ordered tiles + content-hash -> slot map. */
export interface GroupUnion {
  tiles: Tile[];
  slotByHash: Map<string, number>;
}

export interface SectionTileData {
  nametable: Uint16Array;
  tiles: Tile[];     // tileset the nametable indexes into
  color: number;     // VRAM color group (-1 = inactive, skipped)
}

/**
 * Build per-color-group tile unions in deterministic first-seen order
 * (sections in array order, nametable scan order) — mirrors
 * s4_engine/tools/tile_dedupe.py assign_section_slots.
 */
export function buildGroupUnions(
  sections: SectionTileData[],
  numColors: number,
): GroupUnion[] {
  const unions: GroupUnion[] = Array.from({ length: numColors }, () => ({
    tiles: [],
    slotByHash: new Map<string, number>(),
  }));

  // VRAM tile slot 0 renders for empty nametable words — reserve a blank
  // tile at slot 0 of group 0 (the group loaded at VRAM base 0), matching
  // the engine pipeline (ojz_strip_gen.py keeps src tile 0 blank in unions).
  if (unions.length > 0) {
    const blank: Tile = { pixels: new Uint8Array(64) };
    unions[0].slotByHash.set(tileHash(blank.pixels), 0);
    unions[0].tiles.push(blank);
  }

  for (const sec of sections) {
    if (sec.color < 0) continue;
    const union = unions[sec.color];
    for (let i = 0; i < sec.nametable.length; i++) {
      if (sec.nametable[i] === 0) continue;
      const entry = unpackNametableWord(sec.nametable[i]);
      const tile = sec.tiles[entry.tileIndex];
      if (!tile) continue;
      const hash = tileHash(tile.pixels);
      if (!union.slotByHash.has(hash)) {
        union.slotByHash.set(hash, union.tiles.length);
        union.tiles.push(tile);
      }
    }
  }

  return unions;
}

/**
 * Remap a section nametable to absolute VRAM indices: baseSlot + union slot.
 * Word 0 stays 0 (empty). Flags (palette/priority/flips) are preserved.
 */
export function remapNametableToGroup(
  nametable: Uint16Array,
  tiles: Tile[],
  union: GroupUnion,
  baseSlot: number,
): Uint16Array {
  const remapped = new Uint16Array(nametable.length);
  for (let i = 0; i < nametable.length; i++) {
    if (nametable[i] === 0) continue;
    const entry = unpackNametableWord(nametable[i]);
    const tile = tiles[entry.tileIndex];
    if (!tile) continue;
    const slot = union.slotByHash.get(tileHash(tile.pixels));
    if (slot === undefined) continue;
    remapped[i] = packNametableWord(
      baseSlot + slot, entry.palette, entry.priority, entry.vFlip, entry.hFlip,
    );
  }
  return remapped;
}

export function serializeTiles(tiles: Tile[]): Uint8Array {
  const bytes = new Uint8Array(tiles.length * 32);
  for (let t = 0; t < tiles.length; t++) {
    const pixels = tiles[t].pixels;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const hi = pixels[row * 8 + col * 2] & 0xF;
        const lo = pixels[row * 8 + col * 2 + 1] & 0xF;
        bytes[t * 32 + row * 4 + col] = (hi << 4) | lo;
      }
    }
  }
  return bytes;
}
