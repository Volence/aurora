import type { CollisionProfileSet } from './collision-model';

/** The base-bank shape whose 16 height columns are all full (16px) — the plain
 *  solid block. Resolved from the loaded profile set, never hardcoded (the S&K
 *  import owns the ordering). Returns 0 (air) when no profiles are loaded —
 *  callers must treat 0 as "cannot migrate/seed solid cells". */
export function findFullBlockShapeId(profiles: CollisionProfileSet | null): number {
  if (!profiles) return 0;
  for (let i = 1; i < profiles.profiles.length; i++) {
    const p = profiles.profiles[i];
    if (p && p.heights.length === 16 && p.heights.every(h => h >= 16)) return i;
  }
  return 0;
}
