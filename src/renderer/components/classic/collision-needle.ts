/**
 * The screen-space direction of a collision angle byte, canvas y-DOWN.
 *
 * Pulled out of `drawCollision` so it can be tested at all: this suite is
 * node-only and never executes a canvas. It was also wrong for the whole life
 * of the overlay — a stray negation drew `(cos a, -sin a)`, mirroring every
 * slope vertically — and a lie that small is invisible until someone authors
 * collision against it.
 *
 * The convention is the ENGINE's. `Sonic_Jump` ('01 Sonic.asm':1224-1231)
 * jumps along angle-$40 through the standard CalcSine table, so angle 0 (flat
 * ground) must send the player up; that fixes the direction as (cos a, sin a)
 * with y increasing downward.
 *
 * Flips are the engine's too (FindFloor): xflip NEGATES the angle, yflip maps
 * it to -a-$80, applied in that order. The overlay's height rendering already
 * honoured flips while the needle did not, so a flipped cell drew a correct
 * slope under a wrong angle.
 */
export function angleNeedle(angleByte: number, xf: boolean, yf: boolean): { dx: number; dy: number } {
  let a = angleByte & 0xff;
  if (xf) a = -a & 0xff;
  if (yf) a = (-a - 0x80) & 0xff;
  const r = (a / 256) * Math.PI * 2;
  return { dx: Math.cos(r), dy: Math.sin(r) };
}
