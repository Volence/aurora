import type { SpriteFormatAdapter } from '../sprite-format-adapter';
import { serializeSpriteMappings } from '../../export/sprite-mappings-export';
import { parseSpriteMappings } from '../../import/sprite-mappings-import';
import { parseDPLC } from '../../import/sprite-import';
import { serializeDPLC } from '../../export/sprite-export';
import { groupDPLCRuns } from './dplc-runs';

/**
 * s4_engine adapter — wraps the editor's native sprite format (the path the
 * sprite mode already exports/imports): VDP-order 8-byte pieces with a 6-byte
 * per-frame bbox header, uncompressed art, standard DPLC packing. This adapter
 * delegates to the existing, separately-tested serializer/parser so the s4 path
 * has exactly one implementation.
 */
export const s4Adapter: SpriteFormatAdapter = {
  id: 's4',
  artCompression: 'uncompressed',
  readMappings: parseSpriteMappings,
  writeMappings: serializeSpriteMappings,
  readDPLC: parseDPLC,
  writeDPLC: (perFrameTiles) => serializeDPLC(perFrameTiles.map((tiles) => groupDPLCRuns(tiles))),
};
