import type { SpriteFormatAdapter } from '../sprite-format-adapter';
import { readSonicMappings, writeSonicMappings } from './sonic-mappings';
import { readSonicDPLC, writeSonicDPLC } from './sonic-dplc';

/**
 * Sonic 2 adapter — Ver 2 mappings (8-byte pieces with a 2P-tile word) and Ver 2
 * DPLC (standard packing). Sprite art is Nemesis-compressed.
 */
export const s2Adapter: SpriteFormatAdapter = {
  id: 's2',
  artCompression: 'nemesis',
  readMappings: (bytes) => readSonicMappings(bytes, 2),
  writeMappings: (frames) => writeSonicMappings(frames, 2),
  readDPLC: (bytes) => readSonicDPLC(bytes, 2),
  writeDPLC: (perFrameTiles) => writeSonicDPLC(perFrameTiles, 2),
};
