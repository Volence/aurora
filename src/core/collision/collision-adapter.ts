import type { CollisionProfileSet } from './collision-model';

/**
 * Raw per-game collision tables, already read from disk.
 *
 * NO ROTATED (WIDTH) MAP HERE, and its absence is deliberate rather than an
 * omission. `heightmapsRot?: Uint8Array` sat on this interface from the first
 * commit, carrying the note "optional (derivable; unused in Phase 1)", and the
 * whole tree held exactly one mention of it: that declaration. The only producer
 * (`core/project/aeon/load.ts`, which reads heightmaps/angles/solidity and hands
 * the three straight to `decodeProfiles`) never set it and the only consumer
 * (`adapters/s4-collision-adapter.ts`) never read it, so a future consumer would
 * have compiled clean and received `undefined` from the only producer there is.
 * Measured before deleting it: a consumer added to the adapter typechecks at
 * rc=0 with the member declared, and fails with TS2551 naming the line without
 * it. An optional member nothing writes is a silent `undefined`; no member at
 * all is a compile error at the site that wants one, which is the louder of the
 * two and the reason this is a deletion rather than a comment fix.
 *
 * The rotated array is a real concept, just not one Aurora carries yet, and the
 * classic side is where that shows: `core/project/profiles/s1.ts` enumerates
 * `rotated` (the per-block width map) and nothing loads it, which
 * `ClassicCollisionPanel` tells the author in words. Adding it here means adding
 * a producer and a consumer in the same change; two dated design documents under
 * `docs/` still show the old optional field, and copying it back from either one
 * would restore the silent-`undefined` seam rather than the capability.
 */
export interface CollisionTables {
  heightmaps: Uint8Array;     // 256*16 raw bytes
  angles: Uint8Array;         // 256
  solidity: Uint8Array;       // 256
}

/** Decodes one game's collision tables into the engine-agnostic view model. */
export interface CollisionAdapter {
  readonly id: string;
  decodeProfiles(tables: CollisionTables): CollisionProfileSet;
}
