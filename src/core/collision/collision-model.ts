/** Canonical solidity class — which sensor directions a cell stops. Adapters
 *  decode their game's encoding INTO this; it is not any one game's byte layout. */
export type Solidity = 'none' | 'top' | 'sides-bottom' | 'all';

/** One decoded collision shape (the VIEW form, not the authoring form). */
export interface CollisionProfile {
  /** 16 signed height bytes, one per px-column of a 16px cell. >0 solid up from
   *  the bottom; <0 solid hanging down from the top (depth = -value); 0 empty. */
  heights: Int8Array;
  /** Surface angle in 256-units (0 = flat). Pair with hasAngle. */
  angle: number;
  /** Whether the angle is usable (s4's "odd byte = no angle" flag, decoded by the adapter). */
  hasAngle: boolean;
  solidity: Solidity;
}

/** The decoded set a level indexes into; index 0 is reserved for air. */
export interface CollisionProfileSet {
  profiles: CollisionProfile[];
  engine: string;
  /** Count of MEANINGFUL profiles (1 + the last non-air index). Tables are padded
   *  to a fixed size (s4: 256) with air-equivalent zeros, so `profiles.length`
   *  overstates the real data; an index in [solidCount, profiles.length) is stale. */
  solidCount: number;
}

/** Angle in degrees for display, or null when unusable. 256 units = 360°. */
export function angleDegrees(p: CollisionProfile): number | null {
  if (!p.hasAngle) return null;
  return Math.round((p.angle / 256) * 360);
}

/** Index 0 is always air (independent of the set). */
export function isAir(_set: CollisionProfileSet | null, index: number): boolean {
  return index === 0;
}

/** True when index is a real, in-range solid profile (not air, not stale padding). */
export function isKnownProfile(set: CollisionProfileSet | null, index: number): boolean {
  return set !== null && index > 0 && index < set.solidCount;
}
