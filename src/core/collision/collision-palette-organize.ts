import type { CollisionProfile, CollisionProfileSet } from './collision-model';
import { angleDegrees } from './collision-model';
import { flipProfile } from './collision-flip';

/** One palette slot after organizing: a base-bank shape shown in its canonical
 *  (left-facing) orientation. `mirrorX` is whether the base shape had to be
 *  X-flipped to face left — folded into the paint so the in-game result matches
 *  the thumbnail. `profile` is the canonical-left profile to DRAW. */
export interface PaletteEntry {
  shape: number;
  mirrorX: boolean;
  profile: CollisionProfile;
}

/** Total solid pixels in a profile (mirror-invariant) — the "fullness" sort key. */
export function fullness(p: CollisionProfile): number {
  let s = 0;
  for (let c = 0; c < 16; c++) s += Math.abs(p.heights[c]);
  return s;
}

/** Horizontal centre-of-mass of the solid columns (0..15), or null if empty. */
function centerOfMass(p: CollisionProfile): number | null {
  let tot = 0, acc = 0;
  for (let c = 0; c < 16; c++) { const m = Math.abs(p.heights[c]); tot += m; acc += c * m; }
  return tot ? acc / tot : null;
}

/** True for an air-equivalent profile (all columns empty) — padding slots the
 *  bank may carry before the last non-air shape. Not a paintable palette entry. */
function isEmptyProfile(p: CollisionProfile): boolean {
  for (let c = 0; c < 16; c++) if (p.heights[c] !== 0) return false;
  return true;
}

/** A shape "faces right" (so it must be mirrored to reach canonical-left) when
 *  its solid mass is weighted to the right of centre. A symmetric shape
 *  (com == 7.5, e.g. a full block) or empty shape stays as-is. */
export function facesRight(p: CollisionProfile): boolean {
  const c = centerOfMass(p);
  return c !== null && c > 7.5 + 1e-9;
}

/** The user's Flip-H toggle composes with the entry's canonical mirror: the
 *  packed X-flip is their XOR (off = the canonical orientation shown in the
 *  palette, on = its mirror). */
export function effectiveXFlip(entryMirrorX: boolean, userFlipX: boolean): boolean {
  return entryMirrorX !== userFlipX;
}

/** Dedupe key: identical canonical silhouette + angle collapse to one slot.
 *  No-angle shapes (odd-flag) bucket together regardless of the odd byte value. */
function entryKey(p: CollisionProfile): string {
  const h = Array.from(p.heights).join(',');
  return `${h}|${p.hasAngle ? p.angle : 'flat'}`;
}

/** Build the organized palette: every solid base shape re-oriented to face left,
 *  exact mirror-duplicates collapsed (preferring the natively-left representative),
 *  sorted by angle then fullness (least-full → most-full within an angle). */
export function organizePalette(set: CollisionProfileSet | null): PaletteEntry[] {
  if (!set) return [];
  const byKey = new Map<string, PaletteEntry>();
  for (let i = 1; i < set.solidCount; i++) {
    const base = set.profiles[i];
    if (isEmptyProfile(base)) continue;   // skip air-equivalent padding slots (no blank thumbnail)
    const mirrorX = facesRight(base);
    const profile = mirrorX ? flipProfile(base, true, false) : base;
    const entry: PaletteEntry = { shape: i, mirrorX, profile };
    const key = entryKey(profile);
    const existing = byKey.get(key);
    // Prefer the natively-left representative (no mirror needed to paint it).
    if (!existing || (existing.mirrorX && !mirrorX)) byKey.set(key, entry);
  }
  const entries = Array.from(byKey.values());
  entries.sort((a, b) => {
    const da = angleDegrees(a.profile) ?? -1;
    const db = angleDegrees(b.profile) ?? -1;
    if (da !== db) return da - db;
    const fa = fullness(a.profile), fb = fullness(b.profile);
    if (fa !== fb) return fa - fb;
    return a.shape - b.shape;
  });
  return entries;
}
