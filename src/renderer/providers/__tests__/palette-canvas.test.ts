// The canvas swatch grid's pure rules (Task 12). The node suite renders no
// React, so the COMPONENT is checked in Task 14 — everything testable here is
// the arithmetic behind it: which swatch arms which paint index, what a slider
// release produces, and what the grid draws for a document whose palette is the
// wrong length.
//
// The two failures these exist for:
//
//   • A SWATCH THAT ARMS THE WRONG COLOUR. A canvas pixel index IS a palette
//     index, so `(line, idx) -> canvasIndex(line, idx)` is the whole colour
//     model. Off by one line and every stroke lands sixteen colours away.
//
//   • A SLIDER THAT PUSHES TWO UNDO ENTRIES. GenesisColorSliders commits on
//     release and again on the blur that follows, and canvasStore.setPalette
//     records unconditionally — so a commit that is not idempotent makes the
//     first Ctrl+Z after a recolour do nothing visible.

import { describe, it, expect } from 'vitest';
import {
  CANVAS_PALETTE_POLICY, canvasPaletteLines, canvasPaintSel,
  canvasPaletteVersionKey, commitCanvasSwatch,
} from '../palette-canvas';
import { swatchClick, swatchState, LINE_LENGTH } from '../../components/art-shared/palette-grid-model';
import { canvasIndex, CANVAS_COLORS } from '../../../core/art/canvas-doc';
import { encodeGenesisColor } from '../../../core/formats/palette';

/** A 64-word palette whose every entry is distinguishable. */
function palette64(): number[] {
  return Array.from({ length: CANVAS_COLORS }, (_, i) => encodeGenesisColor({ r: i * 4, g: 0, b: 0 }));
}

describe('the canvas palette policy', () => {
  it('locks nothing and treats index 0 as the eraser', () => {
    expect(CANVAS_PALETTE_POLICY.lockedLines).toEqual([]);
    expect(CANVAS_PALETTE_POLICY.transparent).toBe('paint');
  });

  it('a click on index 0 ARMS it without opening sliders', () => {
    // 'paint', not classic's 'explain': there is a brush here, and index 0 is
    // how the artist erases. Opening sliders on it would offer edits to a colour
    // the VDP ignores.
    expect(swatchClick(2, 0, CANVAS_PALETTE_POLICY)).toEqual({ select: true, edit: false });
    expect(swatchClick(2, 5, CANVAS_PALETTE_POLICY)).toEqual({ select: true, edit: true });
  });

  it('every line is clickable, including under a one-line profile', () => {
    // Spec §4.3: constraints are reported, never prevented. `genesis-sprite`
    // declares one line; the grid still shows and edits all four, and 2B is what
    // reports the violation.
    for (const line of [0, 1, 2, 3]) {
      expect(swatchClick(line, 7, CANVAS_PALETTE_POLICY).select).toBe(true);
      expect(swatchState(line, 7, CANVAS_PALETTE_POLICY).locked).toBe(false);
    }
  });
});

describe('canvasPaletteLines', () => {
  it('lays the 64 words out as 4 rows of 16, line-major', () => {
    const words = palette64();
    const lines = canvasPaletteLines(words);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.length === LINE_LENGTH)).toBe(true);
    expect(lines[0][0]).toBe(words[0]);
    expect(lines[1][0]).toBe(words[16]);     // line-major, not column-major
    expect(lines[3][15]).toBe(words[63]);
  });

  it('pads a short palette and truncates a long one', () => {
    // A ragged grid reads as corruption, and a swatch past index 63 names a
    // colour no pixel value can reach. Both are reachable from a hand-edited
    // file, so the grid is a fixed 4x16 whatever it is handed.
    expect(canvasPaletteLines([1, 2, 3])[0].slice(0, 4)).toEqual([1, 2, 3, 0]);
    expect(canvasPaletteLines([1, 2, 3])).toHaveLength(4);
    const long = canvasPaletteLines(new Array(80).fill(7));
    expect(long).toHaveLength(4);
    expect(long[3]).toHaveLength(LINE_LENGTH);
  });
});

describe('which swatch is the paint colour', () => {
  it('maps a 0..63 paint index back to its (line, idx)', () => {
    expect(canvasPaintSel(canvasIndex(0, 1))).toEqual({ line: 0, idx: 1 });
    expect(canvasPaintSel(canvasIndex(2, 9))).toEqual({ line: 2, idx: 9 });
    expect(canvasPaintSel(63)).toEqual({ line: 3, idx: 15 });
  });

  it('every spelling of transparency outlines line 0 index 0', () => {
    // 0/16/32/48 are ONE colour with one spelling (canvas-doc.ts). Outlining
    // three other swatches for it would say the document holds four.
    for (const v of [0, 16, 32, 48]) expect(canvasPaintSel(v)).toEqual({ line: 0, idx: 0 });
  });

  it('the outline lands on the swatch that was clicked', () => {
    const sel = canvasPaintSel(canvasIndex(2, 9));
    expect(swatchState(2, 9, CANVAS_PALETTE_POLICY, { edit: null, paint: sel }).paintSelected).toBe(true);
    expect(swatchState(2, 8, CANVAS_PALETTE_POLICY, { edit: null, paint: sel }).paintSelected).toBe(false);
    expect(swatchState(1, 9, CANVAS_PALETTE_POLICY, { edit: null, paint: sel }).paintSelected).toBe(false);
  });
});

describe('commitCanvasSwatch', () => {
  it('replaces exactly one word and copies the rest', () => {
    const before = palette64();
    const res = commitCanvasSwatch(before, 2, 5, 0x0eee);
    expect(res).toEqual({ kind: 'palette', palette: expect.any(Array) });
    if (res.kind !== 'palette') throw new Error('unreachable');
    expect(res.palette[2 * LINE_LENGTH + 5]).toBe(0x0eee);
    expect(res.palette).toHaveLength(CANVAS_COLORS);
    expect(res.palette.filter((w, i) => w !== before[i])).toHaveLength(1);
    expect(before[2 * LINE_LENGTH + 5]).not.toBe(0x0eee); // the input is not mutated
  });

  it('reports UNCHANGED when the word is already there', () => {
    // The idempotence the port contract demands: the slider commits on release
    // and again on the blur. Two records = a Ctrl+Z that appears to do nothing.
    const before = palette64();
    const word = before[LINE_LENGTH + 3];
    expect(commitCanvasSwatch(before, 1, 3, word)).toEqual({ kind: 'unchanged' });
  });

  it('rejects index 0, an out-of-range index, and an unknown line', () => {
    const before = palette64();
    expect(commitCanvasSwatch(before, 0, 0, 5).kind).toBe('rejected');
    expect(commitCanvasSwatch(before, 0, 16, 5).kind).toBe('rejected');
    expect(commitCanvasSwatch(before, 0, -1, 5).kind).toBe('rejected');
    expect(commitCanvasSwatch(before, 4, 1, 5).kind).toBe('rejected');
    expect(commitCanvasSwatch(before, -1, 1, 5).kind).toBe('rejected');
    expect(commitCanvasSwatch(before, 1.5, 1, 5).kind).toBe('rejected');
  });

  it('refuses a palette that is not 64 words rather than growing one', () => {
    // A document whose palette is short is already wrong; writing index 37 into
    // it would silently extend the array with holes.
    const res = commitCanvasSwatch(new Array(16).fill(0), 0, 1, 9);
    expect(res.kind).toBe('rejected');
    if (res.kind !== 'rejected') throw new Error('unreachable');
    expect(res.error).toContain('16');
  });

  it('masks the word to 16 bits', () => {
    // A CRAM word is one 16-bit store; anything wider is a caller error, and
    // letting it through would put a value in the palette that the PNG codec
    // (which writes 3 bits per channel out of the low 12) silently truncates on
    // the next save — a colour that changes when the file round-trips.
    const res = commitCanvasSwatch(palette64(), 0, 1, 0x1_0eee);
    if (res.kind !== 'palette') throw new Error('unreachable');
    expect(res.palette[1]).toBe(0x0eee);
  });
});

describe('canvasPaletteVersionKey', () => {
  it('changes when any word changes, and only then', () => {
    const a = palette64();
    const b = a.slice();
    b[40] = (b[40] ?? 0) ^ 0x0e;
    expect(canvasPaletteVersionKey('doc:canvas:sky', a)).toBe(canvasPaletteVersionKey('doc:canvas:sky', a.slice()));
    expect(canvasPaletteVersionKey('doc:canvas:sky', a)).not.toBe(canvasPaletteVersionKey('doc:canvas:sky', b));
  });

  it('two documents with identical colours still key apart', () => {
    // The key is what a host memoizes on; sharing one between documents would
    // keep the previous canvas's grid on screen after a tab switch.
    const a = palette64();
    expect(canvasPaletteVersionKey('doc:canvas:sky', a))
      .not.toBe(canvasPaletteVersionKey('doc:canvas:rock', a));
  });
});
