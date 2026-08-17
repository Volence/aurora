// THE COLLISION ANGLE NEEDLE, in screen space.
//
// The convention is anchored on the ENGINE, not guessed: Sonic_Jump
// ('01 Sonic.asm':1224-1231) jumps along angle-$40 through CalcSine, so flat
// ground (angle 0) must launch the player UP. Working back from that, the
// screen direction of angle a is (cos a, sin a) with canvas y DOWN.
//
// The overlay used to draw (cos a, -sin a), which mirrored every slope
// vertically: $E0 is an ascending slope and it rendered as descending.

import { describe, it, expect } from 'vitest';
import { angleNeedle } from '../collision-needle';

describe('angleNeedle', () => {
  it('draws flat ground flat', () => {
    const { dx, dy } = angleNeedle(0x00, false, false);
    expect(dx).toBeCloseTo(1, 6);
    expect(dy).toBeCloseTo(0, 6);
  });

  it('draws $E0 ASCENDING (dy negative is up, canvas y-down)', () => {
    // The exact bug this file exists for. With the old (cos a, -sin a) this
    // came back positive and the slope drew downhill.
    const { dx, dy } = angleNeedle(0xe0, false, false);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeLessThan(0);
  });

  it('draws $20 DESCENDING', () => {
    const { dx, dy } = angleNeedle(0x20, false, false);
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
  });

  it('mirrors with X flip, as the engine does (neg)', () => {
    // An ascending slope, flipped horizontally, is a descending one.
    const plain = angleNeedle(0xe0, false, false);
    const flipped = angleNeedle(0xe0, true, false);
    expect(flipped.dy).toBeCloseTo(-plain.dy, 6);
    expect(flipped.dx).toBeCloseTo(plain.dx, 6);
  });

  it('mirrors with Y flip, as the engine does (-a - $80)', () => {
    // Verified against the raw instructions (addi #$40 / neg.b / subi #$40,
    // which is -a-$80) rather than assumed: this transform negates dx and
    // leaves dy UNCHANGED for every angle -- sin(-a-$80) = sin(a) always, by
    // sin(x+180) = -sin(x) applied twice. That is the reverse of the naive
    // "Y flip mirrors vertically" intuition; X flip (above) is the one that
    // negates dy. Forcing dy to flip here would just reintroduce a pointing
    // bug under a different name.
    const plain = angleNeedle(0x20, false, false);
    const flipped = angleNeedle(0x20, false, true);
    expect(flipped.dx).toBeCloseTo(-plain.dx, 6);
    expect(flipped.dy).toBeCloseTo(plain.dy, 6);
  });

  it('applies X then Y when both are set', () => {
    // Order is the engine's: negate for xflip, THEN -a-$80 for yflip. Stated as
    // a test because "both flips" is the case a reader would otherwise have to
    // re-derive from the disassembly.
    const both = angleNeedle(0x20, true, true);
    const stepwise = angleNeedle((-((-0x20) & 0xff) - 0x80) & 0xff, false, false);
    expect(both.dx).toBeCloseTo(stepwise.dx, 6);
    expect(both.dy).toBeCloseTo(stepwise.dy, 6);
  });

  it('is a unit vector for every one of the 256 angles', () => {
    for (let a = 0; a < 256; a++) {
      const { dx, dy } = angleNeedle(a, false, false);
      expect(Math.hypot(dx, dy)).toBeCloseTo(1, 6);
    }
  });
});
