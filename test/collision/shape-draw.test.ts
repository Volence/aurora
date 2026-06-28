// test/collision/shape-draw.test.ts
import { describe, it, expect } from 'vitest';
import { solidEdges, needleEndpoints } from '../../src/core/collision/collision-shape-draw';

describe('solidEdges', () => {
  it('top solidity → only the top edge', () => {
    expect(solidEdges('top')).toEqual(['top']);
  });
  it('sides-bottom solidity → left, right, bottom', () => {
    expect(solidEdges('sides-bottom')).toEqual(['left', 'right', 'bottom']);
  });
  it('all solidity → every edge', () => {
    expect(solidEdges('all')).toEqual(['top', 'right', 'bottom', 'left']);
  });
  it('none solidity → no edges', () => {
    expect(solidEdges('none')).toEqual([]);
  });
});

describe('needleEndpoints', () => {
  const cx = 10, cy = 20, L = 5;

  it('deg 0 → horizontal (y1≈y2) with endpoints L either side of cx', () => {
    const { x1, y1, x2, y2 } = needleEndpoints(0, cx, cy, L);
    expect(y1).toBeCloseTo(y2);
    expect(x1).toBeCloseTo(cx - L);
    expect(x2).toBeCloseTo(cx + L);
  });

  it('deg 90 → vertical (x1≈x2)', () => {
    const { x1, x2 } = needleEndpoints(90, cx, cy, L);
    expect(x1).toBeCloseTo(x2);
  });

  it('deg 180 → horizontal (y1≈y2)', () => {
    const { y1, y2 } = needleEndpoints(180, cx, cy, L);
    expect(y1).toBeCloseTo(y2);
  });

  it('deg 45 points up-and-right in the CCW math convention (locks the sign drawCollisionShape negates)', () => {
    const { x1, y1, x2, y2 } = needleEndpoints(45, cx, cy, L);
    expect(x2).toBeGreaterThan(x1); // +x to the right
    expect(y2).toBeLessThan(y1);    // -y is up (screen space) → +45° rises to the right
  });

  it('midpoint is the centre for any angle', () => {
    for (const deg of [0, 90, 180, 37, 256]) {
      const { x1, y1, x2, y2 } = needleEndpoints(deg, cx, cy, L);
      expect((x1 + x2) / 2).toBeCloseTo(cx);
      expect((y1 + y2) / 2).toBeCloseTo(cy);
    }
  });
});
