import { describe, it, expect } from 'vitest';
import { planClashOverlay } from '../use-canvas-constraints';
import type { CellClashKind } from '../../../../core/art/canvas-constraints';

const cell = (x: number, kind: CellClashKind = 'multi-line') =>
  ({ x, y: 0, w: 8, h: 8, full: true, kind, lines: [0, 1] });

describe('planClashOverlay', () => {
  it('draws nothing when the overlay is off', () => {
    expect(planClashOverlay([cell(0)], false)).toEqual([]);
  });

  it('draws nothing when there is nothing to draw', () => {
    expect(planClashOverlay([], true)).toEqual([]);
  });

  it('emits one rect per clashing cell, in document pixels', () => {
    expect(planClashOverlay([cell(0), cell(8)], true)).toEqual([
      { x: 0, y: 0, w: 8, h: 8, kind: 'multi-line' },
      { x: 8, y: 0, w: 8, h: 8, kind: 'multi-line' },
    ]);
  });

  // The two kinds are distinguishable so the tint can differ — a cell drawing
  // from a line the profile lacks is fixed by re-assigning, a cell spanning two
  // lines is fixed by redrawing, and they should not look identical.
  it('carries the kind through', () => {
    expect(planClashOverlay([cell(0, 'line-out-of-range')], true)[0].kind)
      .toBe('line-out-of-range');
  });

  it("keeps a partial cell's real size, not a rounded 8x8", () => {
    expect(planClashOverlay(
      [{ x: 0, y: 0, w: 3, h: 8, full: false, kind: 'multi-line', lines: [0, 1] }], true,
    )).toEqual([{ x: 0, y: 0, w: 3, h: 8, kind: 'multi-line' }]);
  });
});
