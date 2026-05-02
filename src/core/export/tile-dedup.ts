import type { Tile } from '../model/s4-types';
import { unpackNametableWord, packNametableWord } from '../model/s4-types';

export interface DedupResult {
  usedTiles: Tile[];
  remappedNametable: Uint16Array;
  tileArtBytes: Uint8Array;
}

function tileHash(pixels: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 64; i++) {
    s += pixels[i].toString(16);
  }
  return s;
}

function serializeTile(tile: Tile): Uint8Array {
  const bytes = new Uint8Array(32);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const hi = tile.pixels[row * 8 + col * 2] & 0xF;
      const lo = tile.pixels[row * 8 + col * 2 + 1] & 0xF;
      bytes[row * 4 + col] = (hi << 4) | lo;
    }
  }
  return bytes;
}

export function deduplicateSectionTiles(
  nametable: Uint16Array,
  allTiles: Tile[],
  vramBase: number,
): DedupResult {
  const vramBaseSlot = vramBase / 32;

  // Find which tile indices are actually used (non-zero entries)
  const usedIndices = new Set<number>();
  for (let i = 0; i < nametable.length; i++) {
    if (nametable[i] === 0) continue;
    const entry = unpackNametableWord(nametable[i]);
    usedIndices.add(entry.tileIndex);
  }

  // Deduplicate used tiles
  const hashToSlot = new Map<string, number>();
  const dedupedTiles: Tile[] = [];
  const originalToDeduped = new Map<number, number>();

  for (const idx of usedIndices) {
    if (idx >= allTiles.length) continue;
    const tile = allTiles[idx];
    const hash = tileHash(tile.pixels);

    if (hashToSlot.has(hash)) {
      originalToDeduped.set(idx, hashToSlot.get(hash)!);
    } else {
      const newSlot = dedupedTiles.length;
      hashToSlot.set(hash, newSlot);
      originalToDeduped.set(idx, newSlot);
      dedupedTiles.push(tile);
    }
  }

  // Remap nametable to absolute VRAM addresses
  const remapped = new Uint16Array(nametable.length);
  for (let i = 0; i < nametable.length; i++) {
    if (nametable[i] === 0) {
      remapped[i] = 0;
      continue;
    }
    const entry = unpackNametableWord(nametable[i]);
    const dedupSlot = originalToDeduped.get(entry.tileIndex);
    if (dedupSlot === undefined) {
      remapped[i] = 0;
      continue;
    }
    const absoluteIdx = vramBaseSlot + dedupSlot;
    remapped[i] = packNametableWord(absoluteIdx, entry.palette, entry.priority, entry.vFlip, entry.hFlip);
  }

  // Serialize tile art
  const tileArtBytes = new Uint8Array(dedupedTiles.length * 32);
  for (let i = 0; i < dedupedTiles.length; i++) {
    tileArtBytes.set(serializeTile(dedupedTiles[i]), i * 32);
  }

  return {
    usedTiles: dedupedTiles,
    remappedNametable: remapped,
    tileArtBytes,
  };
}
