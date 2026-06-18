import type { SpriteFrame } from '../model/sprite-types';
import type { CompressionKind } from '../compress';

export type SpriteFormatId = 's1' | 's2' | 's3k' | 's4';

/**
 * Reads/writes a game's sprite MAPPINGS and (optionally) DPLC over the shared
 * logical model (SpriteFrame/SpritePiece). One adapter per game format; the
 * shared compression layer (compressionFor) handles the art bytes separately.
 * See docs/specs/2026-06-17-multi-game-sprite-roundtrip-design.md §4.
 */
export interface SpriteFormatAdapter {
  id: SpriteFormatId;
  /** Compression of this game's sprite ART files (mappings/DPLC are uncompressed). */
  artCompression: CompressionKind;
  readMappings(bytes: Uint8Array): SpriteFrame[];
  writeMappings(frames: SpriteFrame[]): Uint8Array;
  /** Per-frame ordered list of SOURCE art-tile indices (DPLC games only). */
  readDPLC?(bytes: Uint8Array): number[][];
  writeDPLC?(perFrameTiles: number[][]): Uint8Array;
}
