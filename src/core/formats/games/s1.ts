import type { SpriteFormatAdapter } from '../sprite-format-adapter';
import { readSonicMappings, writeSonicMappings } from './sonic-mappings';
import { readSonicDPLC, writeSonicDPLC } from './sonic-dplc';

/**
 * Sonic 1 adapter — Ver 1 mappings (5-byte pieces, byte piece-count) and Ver 1
 * DPLC (byte count, standard packing). Sprite art is Nemesis-compressed.
 */
export const s1Adapter: SpriteFormatAdapter = {
  id: 's1',
  artCompression: 'nemesis',
  readMappings: (bytes) => readSonicMappings(bytes, 1),
  writeMappings: (frames) => writeSonicMappings(frames, 1),
  readDPLC: (bytes) => readSonicDPLC(bytes, 1),
  writeDPLC: (perFrameTiles) => writeSonicDPLC(perFrameTiles, 1),
};
