// R18's visible default, and the rule that arms the brush on it.
//
// What these exist to prevent: `blankCanvasPalette()` is 64 black words and the
// canvas store's default paint index is `canvasIndex(0, 1)`, which in that
// palette is also black — an invisible brush on an invisible surface, with
// nothing on screen to say why the first stroke did nothing. The fallback for a
// canvas created outside a zone therefore has to be a DIFFERENT palette, and the
// paint index has to be derived from whichever palette the canvas ends up with
// rather than being a constant (a zone's line 0 usually opens on its darkest
// shades, so a constant entry 1 is black there too).

import { describe, it, expect } from 'vitest';
import {
  defaultCanvasPalette, mostVisiblePaintIndex, paletteHasVisibleColour, paletteLuminance,
} from '../canvas-default-palette';
import {
  CANVAS_COLORS, CANVAS_LINE_LENGTH, blankCanvasPalette, canvasIndex, paletteEntryOf,
} from '../canvas-doc';
import { encodeGenesisColor, decodeGenesisColor } from '../../formats/palette';

describe('defaultCanvasPalette (R18\'s visible ramp)', () => {
  const p = defaultCanvasPalette();

  it('is 64 words with entry 0 of every line left transparent', () => {
    expect(p).toHaveLength(CANVAS_COLORS);
    for (let line = 0; line < 4; line++) expect(p[line * CANVAS_LINE_LENGTH]).toBe(0);
  });

  it('every word is already a CANONICAL CRAM word', () => {
    // encodeGenesisColor(decodeGenesisColor(w)) === w is what the PNG writer
    // uses to detect that another tool recoloured the file behind Aurora's
    // back; a default palette that failed it would report a stale sidecar on
    // the very first save.
    for (const w of p) expect(encodeGenesisColor(decodeGenesisColor(w))).toBe(w);
  });

  it('gives EVERY line a usable ramp, dark to light', () => {
    // Not decoration: the New Canvas dialog defaults to `genesis-level-art`,
    // whose cellPaletteRule says one 8x8 cell draws from ONE line. A default
    // laid out as assorted hues per line would make the first thing anyone
    // draws illegal under the profile the dialog itself chose.
    for (let line = 0; line < 4; line++) {
      const lums = [];
      for (let entry = 1; entry < CANVAS_LINE_LENGTH; entry++) {
        lums.push(paletteLuminance(p[line * CANVAS_LINE_LENGTH + entry]));
      }
      for (let i = 1; i < lums.length; i++) {
        expect(lums[i], `line ${line} entry ${i + 1}`).toBeGreaterThanOrEqual(lums[i - 1]);
      }
      // and it actually SPANS: a "ramp" of one repeated tone is no better than black
      expect(lums[lums.length - 1] - lums[0], `line ${line} span`).toBeGreaterThan(150);
    }
  });

  it('every one of the 15 steps is a DIFFERENT colour, and no two neighbours are equal', () => {
    // Two identical swatches side by side in the palette grid is a step the
    // artist clicks and cannot tell from its neighbour. It is the natural
    // failure of interpolating into 3-bit channels — a ramp whose channels move
    // in step delivers 8 colours and 7 duplicates — so the anchors hue-shift to
    // stagger the channel boundaries. An earlier set produced three duplicate
    // adjacent pairs (cool 4/5, foliage 9/10 and 13/14) and passed a weaker
    // "at least 8 distinct" assertion.
    //
    // BOTH halves are asserted: "15 distinct" alone would accept a duplicate
    // pair offset by an extra shade elsewhere in the line, which is exactly the
    // visible defect.
    for (let line = 0; line < 4; line++) {
      const steps = p.slice(line * CANVAS_LINE_LENGTH + 1, (line + 1) * CANVAS_LINE_LENGTH);
      expect(new Set(steps).size, `line ${line} distinct`).toBe(CANVAS_LINE_LENGTH - 1);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i], `line ${line} entries ${i} and ${i + 1}`).not.toBe(steps[i - 1]);
      }
    }
  });

  it('the four lines are actually different colours, not four greyscales', () => {
    const midOf = (line: number) => p[line * CANVAS_LINE_LENGTH + 8];
    expect(new Set([midOf(0), midOf(1), midOf(2), midOf(3)]).size).toBe(4);
  });
});

describe('mostVisiblePaintIndex', () => {
  it('arms a VISIBLE colour on the default ramp — line 0\'s white', () => {
    const p = defaultCanvasPalette();
    const i = mostVisiblePaintIndex(p);
    expect(paletteLuminance(p[i])).toBeGreaterThan(200);
    expect(i).toBe(canvasIndex(0, CANVAS_LINE_LENGTH - 1));
  });

  it('never arms an entry-0 index (that is the ERASER)', () => {
    // The other half of the same bug: a brush on entry 0 paints transparency,
    // so the first stroke does nothing visible even with a good palette.
    const p = blankCanvasPalette();
    p[0] = 0x0eee;   // a white TRANSPARENT slot — bright, and never drawn
    p[canvasIndex(1, 3)] = 0x000e;
    expect(paletteEntryOf(mostVisiblePaintIndex(p))).not.toBe(0);
    expect(mostVisiblePaintIndex(p)).toBe(canvasIndex(1, 3));
  });

  it('skips a black entry 1 in a ZONE palette rather than arming it', () => {
    // Common in practice: a zone's line 0 usually opens on its darkest shades,
    // so the store's constant default (entry 1) is black there too. A rule
    // about the palette in hand is what makes the zone path safe as well.
    const p = blankCanvasPalette();
    p[canvasIndex(0, 1)] = 0;          // black
    p[canvasIndex(0, 9)] = 0x0eee;     // white
    expect(mostVisiblePaintIndex(p)).toBe(canvasIndex(0, 9));
  });

  it('takes the LOWEST index when two entries are equally bright', () => {
    const p = blankCanvasPalette();
    p[canvasIndex(3, 2)] = 0x0eee;
    p[canvasIndex(1, 5)] = 0x0eee;
    expect(mostVisiblePaintIndex(p)).toBe(canvasIndex(1, 5));
  });

  it('is total: an EMPTY palette takes the no-candidate branch', () => {
    // The `best < 0` fallback proper — nothing was scanned, so nothing was
    // selected. (An all-black 64-word palette does NOT reach it: entry 1 scores
    // 0, which still beats the -1 starting bid, so it is selected on merit.)
    expect(mostVisiblePaintIndex([])).toBe(canvasIndex(0, 1));
  });

  it('an all-black palette lands on entry 1 — the same value, by selection not fallback', () => {
    expect(mostVisiblePaintIndex(blankCanvasPalette())).toBe(canvasIndex(0, 1));
  });
});

describe('paletteHasVisibleColour', () => {
  it('is false for all-black and for a palette whose ONLY colour is in an entry 0', () => {
    expect(paletteHasVisibleColour(blankCanvasPalette())).toBe(false);
    const p = blankCanvasPalette();
    p[canvasIndex(2, 0)] = 0x0eee;  // canvasIndex folds entry 0 to index 0
    p[0] = 0x0eee;
    expect(paletteHasVisibleColour(p)).toBe(false);
  });

  it('is true as soon as one paintable entry is not black', () => {
    const p = blankCanvasPalette();
    p[canvasIndex(3, 15)] = 0x0002;
    expect(paletteHasVisibleColour(p)).toBe(true);
  });
});
