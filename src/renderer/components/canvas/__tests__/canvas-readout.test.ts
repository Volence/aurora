import { describe, it, expect } from 'vitest';
import { colorsReadout, frameReadout, clashSignal } from '../use-canvas-constraints';

describe('colorsReadout', () => {
  it('shows every line and the per-line ceiling', () => {
    expect(colorsReadout([5, 12, 7, 0], 15)).toBe('colours 5·12·7·0 / 15 per line');
  });

  it('shows only the lines a one-line profile has', () => {
    expect(colorsReadout([5, 0, 0, 0], 15, 1)).toBe('colours 5 / 15 per line');
  });

  // A one-line profile with paint in line 2 is a violation the CLASH overlay
  // reports (line-out-of-range). The readout must not hide the pixels, or the
  // artist sees a tint with no number anywhere that explains it.
  it('still shows a line the profile does not have, when it is in use', () => {
    expect(colorsReadout([5, 0, 3, 0], 15, 1)).toBe('colours 5·—·3 / 15 per line');
  });
});

describe('frameReadout', () => {
  it('is empty for a profile with no sprite limits', () => {
    expect(frameReadout(null)).toBe('');
  });

  it('sizes the frame in tiles', () => {
    expect(frameReadout({ tilesWide: 3, tilesHigh: 2, maxTiles: 4, overBound: false }))
      .toBe('frame 3×2 tiles');
  });

  it('names the bound only when it is exceeded', () => {
    expect(frameReadout({ tilesWide: 6, tilesHigh: 2, maxTiles: 4, overBound: true }))
      .toBe('frame 6×2 tiles (one sprite is 4×4 max)');
  });
});

describe('clashSignal', () => {
  // §4.3: structural violations NEVER get a number. This returns a boolean, and
  // if it ever returns a count that is the bug.
  it('is a boolean, not a count', () => {
    const one = { x: 0, y: 0, w: 8, h: 8, full: true, kind: 'multi-line' as const, lines: [0, 1] };
    expect(clashSignal([one])).toBe(true);
    expect(clashSignal([one, { ...one, x: 8 }])).toBe(true);
    expect(clashSignal([])).toBe(false);
  });
});
