import type { SpriteFormatAdapter } from '../sprite-format-adapter';
import { serializeSpriteMappings } from '../../export/sprite-mappings-export';
import { parseSpriteMappings } from '../../import/sprite-mappings-import';
import { readSonicDPLC, writeSonicDPLC } from './sonic-dplc';

/**
 * s4_engine adapter — the editor's native sprite format (the path sprite mode
 * already exports/imports): VDP-order 8-byte pieces with a 6-byte per-frame bbox
 * header, uncompressed art. Its DPLC is the standard word-count packing, identical
 * to the Sonic Ver-2 DPLC, so it reuses the shared sonic-dplc core. Mappings use
 * the dedicated S4 (de)serializer.
 */
export const s4Adapter: SpriteFormatAdapter = {
  id: 's4',
  artCompression: 'uncompressed',
  readMappings: parseSpriteMappings,
  writeMappings: serializeSpriteMappings,
  readDPLC: (bytes) => readSonicDPLC(bytes, 2),
  writeDPLC: (perFrameTiles) => writeSonicDPLC(perFrameTiles, 2),
};
