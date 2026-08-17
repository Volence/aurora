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
//   • R18's VISIBLE DEFAULT reaching the create path. The palette itself, and
//     the paint-index rule, are tested beside their module in
//     src/core/art/__tests__/canvas-default-palette.test.ts.
//   • THE DIALOG'S DEFAULTS. They are values contract 2 names by number, so they
//     are constants here rather than in the .tsx, where nothing could reach them.

import { describe, it, expect } from 'vitest';
import {
  validateNewCanvas, flattenZonePalette, newCanvasPalette, NEW_CANVAS_DEFAULTS, commitReachNote,
  newCanvasFieldErrors, parseCanvasSide,
} from '../new-canvas';
import { paletteHasVisibleColour } from '../../../core/art/canvas-default-palette';
import {
  CANVAS_COLORS, CANVAS_LINE_LENGTH, CANVAS_MIN_SIDE, CANVAS_MAX_SIDE,
  blankCanvasPalette, canvasIndex,
} from '../../../core/art/canvas-doc';
import { encodeGenesisColor } from '../../../core/formats/palette';

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

describe('NEW_CANVAS_DEFAULTS', () => {
  it('is a VALID input — the dialog cannot open already-invalid', () => {
    // These are the two values contract 2 names by number, and as constants in
    // NewCanvasDialog.tsx nothing could reach them: an edit pushing the default
    // side past CANVAS_MAX_SIDE would ship a dialog whose Create button is
    // disabled the moment it opens, with a red message the user did not cause —
    // and the whole suite green.
    expect(validateNewCanvas({ name: 'placeholder', ...NEW_CANVAS_DEFAULTS }, [])).toEqual({ ok: true });
    // The PROFILE is not part of that check — validateNewCanvas does not judge
    // it, and `constraintProfile` folds an unknown id to 'none' rather than
    // failing — so a typo'd default would silently open every new canvas
    // unconstrained. The literal assertion below is what catches that.
  });

  /**
   * UX-A1. The default used to be 128x128 — a QUARTER of a chunk, described in
   * the source as "two chunks square" — so every new canvas opened at a size
   * `canvasChunkCapacity` floors to zero and the commit panel could only answer
   * "there is nothing to commit yet". A default has to be a size the app can
   * actually do the main thing with.
   */
  it('opens at a size that CAN be committed — one whole chunk', () => {
    expect([NEW_CANVAS_DEFAULTS.width, NEW_CANVAS_DEFAULTS.height]).toEqual([256, 256]);
    expect(NEW_CANVAS_DEFAULTS.profileId).toBe('genesis-level-art');
    expect(commitReachNote(NEW_CANVAS_DEFAULTS.width, NEW_CANVAS_DEFAULTS.height)).toBeNull();
  });

  it('says so for a size a commit could never take', () => {
    // Not a refusal — a sub-chunk canvas is a fine place to draw something you
    // will paste. It just has to be SAID, at the moment the size is chosen.
    expect(commitReachNote(128, 128)).toMatch(/cannot be committed/);
    expect(commitReachNote(256, 128)).toMatch(/cannot be committed/);
    expect(commitReachNote(512, 256)).toBeNull();
  });

  it('carries NO default name, so nothing lands on disk under a name nobody chose', () => {
    expect('name' in NEW_CANVAS_DEFAULTS).toBe(false);
  });
});

describe('parseCanvasSide — an empty field is not zero', () => {
  it('reads an empty or blank field as NaN', () => {
    // `Number('')` is 0, so holding the sizes as numbers turned a cleared field
    // into a literal 0 on screen — a value the user never typed, shown back to
    // them as though they had. NaN keeps the field's text empty and is refused
    // with the bounds message, which is the true statement about it.
    expect(parseCanvasSide('')).toBeNaN();
    expect(parseCanvasSide('   ')).toBeNaN();
    expect(validateNewCanvas({ ...OK, width: parseCanvasSide('') }, []).ok).toBe(false);
  });

  it('reads a typed number, and does not silently repair a bad one', () => {
    expect(parseCanvasSide('128')).toBe(128);
    expect(parseCanvasSide(' 64 ')).toBe(64);
    expect(parseCanvasSide('12.5')).toBe(12.5);   // refused, not rounded
    expect(parseCanvasSide('abc')).toBeNaN();
    expect(parseCanvasSide('0')).toBe(0);          // refused by the bounds, not by this
  });
});

describe('newCanvasFieldErrors — every field at once', () => {
  it('reports the name AND the size together', () => {
    // The dialog marks every bad field and explains the one the user last
    // touched. With only a first-wins answer, clearing the width field showed a
    // complaint about the name — a message describing neither what is on screen
    // nor what just changed.
    const errors = newCanvasFieldErrors({ ...OK, name: 'sky tiles', width: Number.NaN }, []);
    expect(Object.keys(errors).sort()).toEqual(['name', 'width']);
    expect(errors.width).toContain('Width');
    expect(errors.name).toContain('canvas name');
  });

  it('is empty for a valid input', () => {
    expect(newCanvasFieldErrors(OK, [])).toEqual({});
  });

  it('and validateNewCanvas is that, first-in-order — name before size', () => {
    // The CREATE path still wants exactly one refusal, with the collision never
    // masked by a typo'd number. Both shapes, one set of rules.
    const v = validateNewCanvas({ ...OK, name: 'cliffs', width: 0 }, ['cliffs']);
    expect(v.ok ? null : v.field).toBe('name');
    expect(validateNewCanvas({ ...OK, width: 0, height: 0 }, []).ok).toBe(false);
    expect(validateNewCanvas({ ...OK, width: 0, height: 0 }, [])).toMatchObject({ field: 'width' });
  });
});
