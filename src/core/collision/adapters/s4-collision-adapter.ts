import type { CollisionAdapter, CollisionTables } from '../collision-adapter';
import type { CollisionProfile, CollisionProfileSet, Solidity } from '../collision-model';

const SOLIDITY: Solidity[] = ['none', 'top', 'sides-bottom', 'all'];

/** Sign-extend a byte the way the 68k `ext.w` does (Int8): 0x00..0x7F stay
 *  positive, 0x80..0xFF become negative. Conformant s4 height bytes are only
 *  0..16 and 0xF0..0xFF, but matching ext.w keeps malformed bytes engine-faithful. */
function signed(b: number): number {
  return (b << 24) >> 24;
}

/** An air-equivalent profile (zeroed padding the pipeline writes to unused slots):
 *  no solidity and a flat-zero height profile. Distinguishes real data from padding. */
function isAirProfile(p: CollisionProfile): boolean {
  if (p.solidity !== 'none') return false;
  for (let c = 0; c < 16; c++) if (p.heights[c] !== 0) return false;
  return true;
}

/** s4_engine collision: the four global tables baked by collision_pipeline.py. */
export const s4CollisionAdapter: CollisionAdapter = {
  id: 's4',
  decodeProfiles(tables: CollisionTables): CollisionProfileSet {
    const profiles: CollisionProfile[] = [];
    for (let i = 0; i < 256; i++) {
      const heights = new Int8Array(16);
      for (let c = 0; c < 16; c++) heights[c] = signed(tables.heightmaps[i * 16 + c] ?? 0);
      const angle = tables.angles[i] ?? 0;
      profiles.push({
        heights,
        angle,
        hasAngle: (angle & 1) === 0,            // s4 odd-flag, decoded here only
        solidity: SOLIDITY[(tables.solidity[i] ?? 0) & 0x3],
      });
    }
    // The tables are fixed-size (256), zero-padded past the real data. Find the
    // last meaningful profile so stale indices into the padding read as "unknown".
    let solidCount = 1; // index 0 = air
    for (let i = profiles.length - 1; i >= 1; i--) {
      if (!isAirProfile(profiles[i])) { solidCount = i + 1; break; }
    }
    return { profiles, engine: 's4', solidCount };
  },
};
