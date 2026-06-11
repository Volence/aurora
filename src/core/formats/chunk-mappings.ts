import { kosinskiDecompress } from './kosinski';
import type { ChunkDef } from '../model/s4-types';

const BLOCKS_PER_CHUNK = 8;
const TILES_PER_BLOCK = 2;
const CHUNK_TILES = BLOCKS_PER_CHUNK * TILES_PER_BLOCK; // 16
const BYTES_PER_CHUNK = BLOCKS_PER_CHUNK * BLOCKS_PER_CHUNK * 2; // 128
const BYTES_PER_BLOCK = TILES_PER_BLOCK * TILES_PER_BLOCK * 2; // 8

interface BlockRef {
  blockIndex: number;
  hFlip: boolean;
  vFlip: boolean;
  solidTop: boolean;
  solidAll: boolean;
}

function parseBlockRef(word: number): BlockRef {
  return {
    solidTop: (word & 0x8000) !== 0,
    solidAll: (word & 0x1000) !== 0,
    vFlip: (word & 0x0800) !== 0,    // bit 11 — btst #3 on high byte
    hFlip: (word & 0x0400) !== 0,    // bit 10 — btst #2 on high byte
    blockIndex: word & 0x3FF,
  };
}

/**
 * Read a 16x16 block's 2x2 tile entries from decompressed block data.
 * Sonic 2 stores blocks row-major: [TL, TR, BL, BR] as two longwords.
 */
function readBlock(blockData: Uint8Array, blockIndex: number): [number, number, number, number] {
  const offset = blockIndex * BYTES_PER_BLOCK;
  if (offset + BYTES_PER_BLOCK > blockData.length) return [0, 0, 0, 0];
  const tl = (blockData[offset] << 8) | blockData[offset + 1];
  const tr = (blockData[offset + 2] << 8) | blockData[offset + 3];
  const bl = (blockData[offset + 4] << 8) | blockData[offset + 5];
  const br = (blockData[offset + 6] << 8) | blockData[offset + 7];
  return [tl, tr, bl, br];
}

function flipTileWord(word: number, toggleH: boolean, toggleV: boolean): number {
  let result = word;
  if (toggleH) result ^= 0x0800; // bit 11
  if (toggleV) result ^= 0x1000; // bit 12
  return result;
}

/**
 * Resolve a block reference to 4 nametable words, applying flip transformations.
 * Input block is [TL, TR, BL, BR]. Flipping rearranges and toggles flip bits.
 */
function resolveBlock(
  blockData: Uint8Array,
  ref: BlockRef,
): [number, number, number, number] {
  let [tl, tr, bl, br] = readBlock(blockData, ref.blockIndex);

  if (ref.hFlip && ref.vFlip) {
    [tl, tr, bl, br] = [
      flipTileWord(br, true, true),
      flipTileWord(bl, true, true),
      flipTileWord(tr, true, true),
      flipTileWord(tl, true, true),
    ];
  } else if (ref.hFlip) {
    [tl, tr, bl, br] = [
      flipTileWord(tr, true, false),
      flipTileWord(tl, true, false),
      flipTileWord(br, true, false),
      flipTileWord(bl, true, false),
    ];
  } else if (ref.vFlip) {
    [tl, tr, bl, br] = [
      flipTileWord(bl, false, true),
      flipTileWord(br, false, true),
      flipTileWord(tl, false, true),
      flipTileWord(tr, false, true),
    ];
  }

  return [tl, tr, bl, br];
}

/**
 * Convert a collision flag pair from chunk block refs into per-tile collision values.
 * solidTop=0x8000, solidAll=0x1000 on the block ref word.
 * Returns a nibble: bit1=solid-top, bit0=solid-all.
 */
function blockRefToCollision(ref: BlockRef): number {
  return (ref.solidTop ? 2 : 0) | (ref.solidAll ? 1 : 0);
}

/**
 * Import 128x128 chunk mappings and 16x16 block mappings (both Kosinski-compressed)
 * and produce an array of ChunkDef objects suitable for the editor's chunk library.
 */
export function importChunks(
  chunkFileData: Uint8Array,
  blockFileData: Uint8Array,
  namePrefix: string = 'Chunk',
): ChunkDef[] {
  const chunkData = kosinskiDecompress(chunkFileData);
  const blockData = kosinskiDecompress(blockFileData);

  const chunkCount = Math.floor(chunkData.length / BYTES_PER_CHUNK);
  const chunks: ChunkDef[] = [];

  for (let c = 0; c < chunkCount; c++) {
    const nametable = new Uint16Array(CHUNK_TILES * CHUNK_TILES);
    const collision = new Uint8Array(CHUNK_TILES * CHUNK_TILES);
    const chunkOffset = c * BYTES_PER_CHUNK;

    for (let blockRow = 0; blockRow < BLOCKS_PER_CHUNK; blockRow++) {
      for (let blockCol = 0; blockCol < BLOCKS_PER_CHUNK; blockCol++) {
        const wordOffset = chunkOffset + (blockRow * BLOCKS_PER_CHUNK + blockCol) * 2;
        const word = (chunkData[wordOffset] << 8) | chunkData[wordOffset + 1];
        const ref = parseBlockRef(word);
        const [tl, tr, bl, br] = resolveBlock(blockData, ref);
        const collValue = blockRefToCollision(ref);

        const tileRow = blockRow * 2;
        const tileCol = blockCol * 2;

        nametable[tileRow * CHUNK_TILES + tileCol] = tl;
        nametable[tileRow * CHUNK_TILES + tileCol + 1] = tr;
        nametable[(tileRow + 1) * CHUNK_TILES + tileCol] = bl;
        nametable[(tileRow + 1) * CHUNK_TILES + tileCol + 1] = br;

        collision[tileRow * CHUNK_TILES + tileCol] = collValue;
        collision[tileRow * CHUNK_TILES + tileCol + 1] = collValue;
        collision[(tileRow + 1) * CHUNK_TILES + tileCol] = collValue;
        collision[(tileRow + 1) * CHUNK_TILES + tileCol + 1] = collValue;
      }
    }

    chunks.push({
      id: `${namePrefix}_${c.toString(16).toUpperCase().padStart(2, '0')}`,
      name: `${namePrefix} $${c.toString(16).toUpperCase().padStart(2, '0')}`,
      widthTiles: CHUNK_TILES,
      heightTiles: CHUNK_TILES,
      nametable,
      collision,
    });
  }

  return chunks;
}
