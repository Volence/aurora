// test/collision/shape-draw.test.ts
import { describe, it, expect } from 'vitest';
import { solidEdges } from '../../src/core/collision/collision-shape-draw';

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

// `needleEndpoints` AND ITS FIVE TESTS ARE GONE. The helper was a THIRD angle
// convention (degrees, CCW, negated at every call site to undo itself) living
// beside the two the map overlays each had, and the three disagreed — the aeon
// map drew every non-flat angle vertically mirrored against the picker. The
// properties those tests held are not lost, they MOVED, and to stronger rows:
//
//   "deg 0 -> horizontal", "deg 45 rises", the sign convention
//       -> collision-angle-mark.test.ts, 'angleTangent — the engine
//          convention', which checks the direction against classic's
//          independently unit-tested `angleNeedle` for ALL 256 angle bytes
//          rather than for four hand-picked degrees.
//   "midpoint is the centre"
//       -> deliberately NOT preserved. A mark whose midpoint is the cell centre
//          is the defect: it floated off the surface it described, and being
//          symmetric about that midpoint it could not say which side was solid.
//          The replacement anchors on the surface and is asymmetric by design;
//          'surfaceAnchor — the mark sits ON the surface' is the row that now
//          holds the opposite property.
