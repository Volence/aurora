import type { CollisionProfileSet } from './collision-model';

/** Raw per-game collision tables, already read from disk. */
export interface CollisionTables {
  heightmaps: Uint8Array;     // 256*16 raw bytes
  heightmapsRot?: Uint8Array; // optional (derivable; unused in Phase 1)
  angles: Uint8Array;         // 256
  solidity: Uint8Array;       // 256
}

/** Decodes one game's collision tables into the engine-agnostic view model. */
export interface CollisionAdapter {
  readonly id: string;
  decodeProfiles(tables: CollisionTables): CollisionProfileSet;
}
