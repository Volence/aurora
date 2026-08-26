// WHEN A PRESS ON THE MAP IS A BAND MARK.
//
// Item 43 hung the mark on View's mouseup — any left-click in the Effects facet
// that moved <5px lit the lens, because View was the facet's only tool (triage
// 2026-08-26 §A.2/§A.3). The mark is a tool now. `MapViewport`'s mousedown
// record and `commitBandMark` are inside React handlers the node suite cannot
// reach, so the DECISION is a pure function here — the shape `resolveEscape`
// took for parcel A — and both handlers only act on its verdict.
//
// The rows are derived from FACET_TOOLS: every tool the effects facet offers is
// asked, and exactly one of them may mark.

import { describe, it, expect } from 'vitest';
import { shouldMarkBand } from '../map-band-mark';
import { FACET_TOOLS } from '../../workspace/facet-tools';
import { TOOL_IDS } from '../../../core/project/adapter';

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;

describe('shouldMarkBand', () => {
  it('marks on a left press with mark-band armed in the Effects facet', () => {
    expect(shouldMarkBand('mark-band', true, LEFT)).toBe(true);
  });

  it('View seeds nothing — a pan-click is a pan-click (the owner\'s defect)', () => {
    expect(shouldMarkBand('view', true, LEFT)).toBe(false);
  });

  it('of every tool the effects facet offers, only mark-band marks', () => {
    const marking = FACET_TOOLS.parallax!.filter((t) => shouldMarkBand(t, true, LEFT));
    expect(marking).toEqual(['mark-band']);
  });

  it('no tool marks at all outside the Effects facet — that facet owns the lens', () => {
    for (const t of TOOL_IDS) expect(shouldMarkBand(t, false, LEFT), t).toBe(false);
  });

  it('only the left button marks; middle pans and right is nobody\'s', () => {
    expect(shouldMarkBand('mark-band', true, MIDDLE)).toBe(false);
    expect(shouldMarkBand('mark-band', true, RIGHT)).toBe(false);
  });
});
