/**
 * ROW 235 (b): the target pane's label layout (pane-labels.ts), as data. The
 * rule: no two printed chips intersect; a label steps down a line only while
 * its chip starts inside its own rectangle, else it is hidden; an identical
 * text at the same corner prints once. Geometry comes from the module's own
 * constants, never typed here. The canvas half (that the chips are what is
 * drawn) is the donor-page harness, DP.7b / DP.11l.
 */
import { describe, it, expect } from 'vitest';
import { layoutLabels, LABEL_LINE_PX, type LabelItem, type PlacedLabel } from '../pane-labels';

const hit = (a: NonNullable<PlacedLabel['box']>, b: NonNullable<PlacedLabel['box']>) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const intersecting = (out: PlacedLabel[]) => {
  const shown = out.filter((l) => l.box);
  const pairs: string[] = [];
  for (let a = 0; a < shown.length; a++) for (let b = a + 1; b < shown.length; b++) {
    if (hit(shown[a].box!, shown[b].box!)) pairs.push(`${shown[a].text}/${shown[b].text}`);
  }
  return pairs;
};
const item = (text: string, outline: number, rect: LabelItem['rect'], kind: LabelItem['kind'] = 'label'): LabelItem =>
  ({ text, kind, outline, rect, line: kind === 'tag' ? 1 : 0, width: text.length * 6 });

describe('target pane label layout (row 235 (b))', () => {
  it('two ids at one corner (the booked "ehz_2xct1") and a tag: every text prints, no two chips intersect', () => {
    const r = { x: 10, y: 10, w: 200, h: 10 * LABEL_LINE_PX };
    const out = layoutLabels([item('ehz_act1', 0, r), item('ehz_2x', 1, r), item('R10', 2, r, 'tag')]);
    expect({ printed: out.map((l) => l.box !== null), intersecting: intersecting(out) })
      .toEqual({ printed: [true, true, true], intersecting: [] });
  });

  it('a label with no free line inside its own rectangle is hidden, not printed outside it', () => {
    // One line tall: the second id at that corner has nowhere to step to.
    const r = { x: 0, y: 0, w: 100, h: LABEL_LINE_PX };
    const out = layoutLabels([item('a_clip', 0, r), item('b_clip', 1, r)]);
    expect(out.map((l) => ({ t: l.text, hidden: l.hidden, printed: l.box !== null })))
      .toEqual([{ t: 'a_clip', hidden: false, printed: true }, { t: 'b_clip', hidden: true, printed: false }]);
  });

  it('the same tag named twice at one corner (R10\'s two subjects) prints once, the second as its twin', () => {
    const r = { x: 0, y: 0, w: 100, h: 5 * LABEL_LINE_PX };
    const out = layoutLabels([item('R10', 0, r, 'tag'), item('R10', 1, r, 'tag')]);
    expect(out.map((l) => ({ printed: l.box !== null, twinOf: l.twinOf }))).toEqual([{ printed: true, twinOf: null }, { printed: false, twinOf: 0 }]);
  });
});
