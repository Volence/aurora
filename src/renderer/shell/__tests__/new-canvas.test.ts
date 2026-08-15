// Task 13: the rules behind the New Canvas dialog.
//
// The node suite renders no React, so the DIALOG is Task 14's to verify. What is
// pinned here is everything the dialog only displays:
//
//   • THE COLLISION REFUSAL. This is the guard that matters. `<name>.png` is the
//     whole document, so a create that lands on an existing name replaces
//     somebody's art with a blank canvas — and unlike every other refusal here,
//     the cost is not a retyped name.
//   • THE NAME RULE, with its reason. `canvasNameIsSafe` is stricter than a
//     filename needs to be (the name is also a tab id and a file stem), so a
//     refusal that does not explain itself is one the user cannot act on.
//   • THE ZONE-PALETTE FLATTENING, line-major. Getting the order wrong does not
//     throw — it silently transposes the artist's colours.
//   • R18's VISIBLE DEFAULT. `blankCanvasPalette()` is 64 black words and the
//     store's default paint index is black in it, so a canvas created outside a
//     zone used to be an invisible brush on an invisible surface.

import { describe, it, expect } from 'vitest';
import {
  validateNewCanvas, flattenZonePalette, newCanvasPalette,
} from '../new-canvas';
import {
  defaultCanvasPalette, mostVisiblePaintIndex, paletteHasVisibleColour, paletteLuminance,
} from '../../../core/art/canvas-default-palette';
import {
  CANVAS_COLORS, CANVAS_LINE_LENGTH, CANVAS_MIN_SIDE, CANVAS_MAX_SIDE,
  blankCanvasPalette, canvasIndex, paletteEntryOf,
} from '../../../core/art/canvas-doc';
import { encodeGenesisColor, decodeGenesisColor } from '../../../core/formats/palette';

const OK = { name: 'cliffs', width: 128, height: 128, profileId: 'genesis-level-art' as const };

function reasonFor(input: Partial<typeof OK>, existing: string[] = []): string {
  const v = validateNewCanvas({ ...OK, ...input }, existing);
  expect(v.ok).toBe(false);
  return v.ok ? '' : v.reason;
}

describe('validateNewCanvas — names', () => {
  it('accepts a plain name in an empty project', () => {
    expect(validateNewCanvas(OK, [])).toEqual({ ok: true });
  });

  it('accepts letters, digits, - and _ , and refuses everything else WITH the rule', () => {
    for (const name of ['a', 'GHZ-cliffs_2', 'x'.repeat(64)]) {
      expect(validateNewCanvas({ ...OK, name }, []).ok).toBe(true);
    }
    // Every one of these is a plausible first attempt, and each would otherwise
    // reach a path layer that only says "not a valid canvas name".
    for (const name of ['', '   ', 'sky tiles', 'sky.png', '../etc/passwd', 'a/b', '_sky', 'x'.repeat(65)]) {
      const v = validateNewCanvas({ ...OK, name }, []);
      expect(v.ok, name).toBe(false);
      expect(v.ok ? '' : v.reason.length, name).toBeGreaterThan(20);
    }
  });

  it('trims the name before judging it, so a trailing space is not a rejection', () => {
    expect(validateNewCanvas({ ...OK, name: '  cliffs  ' }, []).ok).toBe(true);
  });

  it('REFUSES a name that already exists, and says which file is in the way', () => {
    // The one refusal whose absence destroys work: creating over an existing
    // canvas writes a blank document over the artist's art.
    const reason = reasonFor({ name: 'cliffs' }, ['cliffs', 'sky']);
    expect(reason).toContain('already exists');
    expect(reason).toContain('.aurora/canvas/cliffs.png');
    const v = validateNewCanvas({ ...OK, name: 'cliffs' }, ['cliffs']);
    expect(v.ok ? null : v.field).toBe('name');
  });

  it('refuses a collision that differs only in CASE, naming the existing file', () => {
    // On macOS `Cliffs.png` and `cliffs.png` are one file, so the strict answer
    // ("different name") is an overwrite there. The write guard would catch it
    // as an mtime conflict, which explains nothing; this says what is wrong.
    const reason = reasonFor({ name: 'Cliffs' }, ['cliffs']);
    expect(reason).toContain('"cliffs"');
  });

  it('allows a name that merely CONTAINS an existing one', () => {
    // The refusal must be equality, not prefix/substring — otherwise a project
    // with `sky` can never have `sky-far`.
    expect(validateNewCanvas({ ...OK, name: 'sky-far' }, ['sky']).ok).toBe(true);
  });
});

describe('validateNewCanvas — sizes', () => {
  it('accepts the bounds and refuses outside them, with the numbers', () => {
    expect(validateNewCanvas({ ...OK, width: CANVAS_MIN_SIDE, height: CANVAS_MAX_SIDE }, []).ok).toBe(true);
    // blankCanvasDoc CLAMPS silently, so without this the user asks for 4x4 and
    // gets an 8x8 document under the name they chose, with nothing said.
    expect(reasonFor({ width: CANVAS_MIN_SIDE - 1 })).toContain(String(CANVAS_MIN_SIDE));
    expect(reasonFor({ height: CANVAS_MAX_SIDE + 1 })).toContain(String(CANVAS_MAX_SIDE));
  });

  it('refuses fractions and NaN (an empty number field)', () => {
    expect(validateNewCanvas({ ...OK, width: 128.5 }, []).ok).toBe(false);
    expect(validateNewCanvas({ ...OK, height: Number.NaN }, []).ok).toBe(false);
  });

  it('points at the field that is wrong', () => {
    const w = validateNewCanvas({ ...OK, width: 0 }, []);
    expect(w.ok ? null : w.field).toBe('width');
    const h = validateNewCanvas({ ...OK, height: 0 }, []);
    expect(h.ok ? null : h.field).toBe('height');
  });

  it('checks the name BEFORE the size, so a collision is never masked by a typo\'d size', () => {
    const v = validateNewCanvas({ ...OK, name: 'cliffs', width: 0 }, ['cliffs']);
    expect(v.ok ? null : v.field).toBe('name');
  });
});

describe('flattenZonePalette', () => {
  /** 4 lines x 16 words, every word distinct and encoding its own (line, entry)
   *  so a transposed flatten cannot accidentally pass. */
  function zonePalettes(): Uint16Array[] {
    return [0, 1, 2, 3].map((line) => {
      const l = new Uint16Array(CANVAS_LINE_LENGTH);
      for (let entry = 0; entry < CANVAS_LINE_LENGTH; entry++) {
        // r = line+1 (1..4), g = entry (0..15 folded to 3 bits via two channels)
        l[entry] = encodeGenesisColor({ r: (line + 1) * 32, g: entry * 17, b: 0 });
      }
      return l;
    });
  }

  it('flattens LINE-MAJOR: flat[line * 16 + entry]', () => {
    const src = zonePalettes();
    const flat = flattenZonePalette(src)!;
    expect(flat).toHaveLength(CANVAS_COLORS);
    for (let line = 0; line < 4; line++) {
      for (let entry = 0; entry < CANVAS_LINE_LENGTH; entry++) {
        expect(flat[line * CANVAS_LINE_LENGTH + entry], `${line}:${entry}`).toBe(src[line][entry]);
      }
    }
  });

  it('a canvas index IS its palette index under that layout', () => {
    // The property the whole design rests on (canvas-doc.ts): pixel value
    // (line << 4) | entry indexes the flattened palette directly. A transposed
    // flatten type-checks and silently recolours every canvas seeded from a zone.
    const flat = flattenZonePalette(zonePalettes())!;
    expect(flat[canvasIndex(2, 5)]).toBe(zonePalettes()[2][5]);
    expect(flat[canvasIndex(3, 15)]).toBe(zonePalettes()[3][15]);
  });

  it('pads a short or missing line with 0 rather than shifting the rest', () => {
    const src = [new Uint16Array([0x0eee, 0x000e]), undefined as unknown as Uint16Array, zonePalettes()[2]];
    const flat = flattenZonePalette(src)!;
    expect(flat[0]).toBe(0x0eee);
    expect(flat[1]).toBe(0x000e);
    expect(flat[2]).toBe(0);                 // padded, not borrowed from line 1
    expect(flat.slice(16, 32).every((w) => w === 0)).toBe(true);
    expect(flat[32 + 5]).toBe(zonePalettes()[2][5]);   // line 2 still at line 2
  });

  it('ignores lines past the canvas\'s four', () => {
    const src = [...zonePalettes(), new Uint16Array(16).fill(0x0eee)];
    expect(flattenZonePalette(src)).toHaveLength(CANVAS_COLORS);
  });

  it('returns null for no zone, an empty list, or an ALL-BLACK palette', () => {
    // The last one is R18 through the zone door: a level document mid-load has
    // zeroed palettes, and seeding from those is the same invisible canvas.
    expect(flattenZonePalette(null)).toBeNull();
    expect(flattenZonePalette(undefined)).toBeNull();
    expect(flattenZonePalette([])).toBeNull();
    expect(flattenZonePalette([0, 1, 2, 3].map(() => new Uint16Array(16)))).toBeNull();
  });
});

describe('newCanvasPalette', () => {
  it('uses the open zone\'s colours when there are any', () => {
    const src = [0, 1, 2, 3].map(() => new Uint16Array(16).fill(0x0e00));
    expect(newCanvasPalette(src)[1]).toBe(0x0e00);
  });

  it('falls back to the VISIBLE default, never to the black one (R18)', () => {
    // The whole point: blankCanvasPalette() is 64 black words, and the store's
    // default paint index is black in it — an invisible brush on an invisible
    // surface, with nothing on screen to say why.
    const p = newCanvasPalette(null);
    expect(p).not.toEqual(blankCanvasPalette());
    expect(paletteHasVisibleColour(p)).toBe(true);
  });
});

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
    // Not decoration: the dialog defaults to `genesis-level-art`, whose
    // cellPaletteRule says one 8x8 cell draws from ONE line. A default laid out
    // as assorted hues per line would make the first thing anyone draws illegal
    // under the profile the dialog itself chose.
    for (let line = 0; line < 4; line++) {
      const lums = [];
      for (let entry = 1; entry < CANVAS_LINE_LENGTH; entry++) {
        lums.push(paletteLuminance(p[line * CANVAS_LINE_LENGTH + entry]));
      }
      // monotonic (non-decreasing — 3-bit channels cannot give 15 distinct steps)
      for (let i = 1; i < lums.length; i++) expect(lums[i], `line ${line} entry ${i + 1}`).toBeGreaterThanOrEqual(lums[i - 1]);
      // and it actually SPANS: a "ramp" of one repeated tone is no better than black
      expect(lums[lums.length - 1] - lums[0], `line ${line} span`).toBeGreaterThan(100);
      expect(new Set(p.slice(line * 16 + 1, line * 16 + 16)).size, `line ${line} distinct`).toBeGreaterThanOrEqual(8);
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

  it('is total: an all-black palette falls back to the store\'s own default', () => {
    expect(mostVisiblePaintIndex(blankCanvasPalette())).toBe(canvasIndex(0, 1));
    expect(mostVisiblePaintIndex([])).toBe(canvasIndex(0, 1));
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
