import type { CollisionProfile, CollisionProfileSet } from './collision-model';
import { isKnownProfile } from './collision-model';
import { unpackCollisionCell, packCollisionCell } from './collision-cell-word';
import { flipProfile } from './collision-flip';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';
import type { Section } from '../model/s4-types';

export interface ResolvedCell {
  /** The base-bank shape index (bits 0-9 of the word). */
  shape: number;
  air: boolean;
  /** True when the shape is a real in-range base-bank profile. */
  known: boolean;
  /** The profile to DRAW — base shape mirrored by the word's flips and with the
   *  word's solidity substituted. null when air or no tables loaded. */
  profile: CollisionProfile | null;
}

/** Decode one packed cell word against the base-bank set into a drawable form. */
export function resolveCell(set: CollisionProfileSet | null, word: number): ResolvedCell {
  const c = unpackCollisionCell(word);
  if (c.shape === 0) return { shape: 0, air: true, known: false, profile: null };
  if (!isKnownProfile(set, c.shape)) {
    return { shape: c.shape, air: false, known: false, profile: null };
  }
  const base = set!.profiles[c.shape];
  const flipped = flipProfile(base, c.xFlip, c.yFlip);
  return { shape: c.shape, air: false, known: true, profile: { ...flipped, solidity: c.solidity } };
}

/** Unify a plane's two possible sources into one Uint16 cell-word array the
 *  overlay can iterate. Prefers the editable plane (already packed words); else
 *  packs the read-only engine baseline (raw base-bank indices, solidity 'all',
 *  no flip); else a fully-air zero array. */
export function resolvePlaneWords(
  edit: Uint16Array | null | undefined,
  engine: Uint8Array | null | undefined,
  length: number,
): Uint16Array {
  if (edit) return edit;
  const out = new Uint16Array(length);
  if (engine) {
    for (let i = 0; i < length; i++) {
      const idx = engine[i] ?? 0;
      out[i] = idx === 0 ? 0 : packCollisionCell({ shape: idx, xFlip: false, yFlip: false, solidity: 'all' });
    }
  }
  return out;
}

/** Lazily seed a section's editable collision planes (packing each plane's
 *  engine baseline into cell words) the first time either is touched by a
 *  write path — paint, stamp, or the agent's stamp handler. Idempotent: a
 *  plane that's already seeded is left untouched. Seeds BOTH planes even when
 *  only one is about to be written (paint's per-plane seed used to leave the
 *  other plane null until it was separately touched — seeding both up front is
 *  strictly safer, since the data is identical either way, and keeps every
 *  write path from drifting on which plane got seeded when). */
export function ensureCollisionPlanes(section: Section): void {
  const n = SECTION_TILES_WIDE * SECTION_TILES_HIGH;
  if (!section.collisionEdit) section.collisionEdit = resolvePlaneWords(null, section.engineCollision, n);
  if (!section.collisionEditB) section.collisionEditB = resolvePlaneWords(null, section.engineCollisionB, n);
}
