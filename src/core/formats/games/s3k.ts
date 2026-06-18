import type { SpriteFormatAdapter } from '../sprite-format-adapter';
import { readSonicMappings, writeSonicMappings } from './sonic-mappings';
import { readSonicDPLC, writeSonicDPLC } from './sonic-dplc';

/**
 * Sonic 3 & Knuckles adapter — Ver 3 mappings (6-byte pieces, no 2P-tile word)
 * and Ver 3 DPLC (word count-1 header; entries pack `(offset<<4)|(tiles-1)`,
 * reversed vs S1/S2). Sprite art is Nemesis-compressed. The S3K 2-player art is
 * stored in entirely separate tables (not a mirror flag) — not loaded in v1.
 */
export const s3kAdapter: SpriteFormatAdapter = {
  id: 's3k',
  artCompression: 'nemesis',
  readMappings: (bytes) => readSonicMappings(bytes, 3),
  writeMappings: (frames) => writeSonicMappings(frames, 3),
  readDPLC: (bytes) => readSonicDPLC(bytes, 3),
  writeDPLC: (perFrameTiles) => writeSonicDPLC(perFrameTiles, 3),
};
