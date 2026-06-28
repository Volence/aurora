import type { CollisionProfile } from './collision-model';

/** Mirror of the engine bake's flip math (tools/collision_pipeline.py
 *  flip_profile_x/y + flip_angle_x/y) so the editor preview is byte-faithful to
 *  what the ROM bake produces. Heights here are SIGNED (Int8) — we convert to the
 *  raw 0..255 byte the Python operates on, apply, and convert back. */

function rawByte(signedHeight: number): number {
  return signedHeight & 0xFF;            // Int8 two's-complement → 0..255
}
function toSigned(raw: number): number {
  return (raw << 24) >> 24;              // 0..255 → signed (ext.b)
}

/** yflip on a raw height byte: solid now hangs from the top. 0→0, 16→16 (full
 *  stays full), else h → (256-h) (a partial floor becomes a hanging ceiling). */
function flipHeightYByte(raw: number): number {
  return raw === 0 || raw === 16 ? raw : (256 - raw) & 0xFF;
}

export function flipAngleX(angle: number): number {
  return -angle & 0xFF;                  // negate; odd no-angle flag stays odd
}
export function flipAngleY(angle: number): number {
  return (-angle - 0x80) & 0xFF;         // reflect: -angle-$80
}

/** Return a new profile mirrored per the X/Y flags. X is applied before Y, the
 *  same order as bake_cell. Solidity is NOT touched here (the cell word's
 *  solidity overrides it at the call site). */
export function flipProfile(p: CollisionProfile, xFlip: boolean, yFlip: boolean): CollisionProfile {
  if (!xFlip && !yFlip) return p;
  let raw = Array.from(p.heights, rawByte);
  let angle = p.angle & 0xFF;
  if (xFlip) { raw = raw.slice().reverse(); angle = flipAngleX(angle); }
  if (yFlip) { raw = raw.map(flipHeightYByte); angle = flipAngleY(angle); }
  const heights = new Int8Array(raw.map(toSigned));
  return { heights, angle, hasAngle: (angle & 1) === 0, solidity: p.solidity };
}
