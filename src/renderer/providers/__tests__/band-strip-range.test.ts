// DRAGGING A RUN ON THE BLOB STRIP — ROADMAP item 43 wave 2.
//
// The gesture itself (a mousedown, a mouseup, a canvas) is invisible to
// `vitest run`; the CDP harness `scratchpad/bganim-strip-range-harness.mjs`
// drives that. What IS visible is the whole RULE, because the rule lives in a
// provider and not in `ArtBrowser.tsx` — which is the point of the repo's
// out-of-`.tsx` standing rule.
//
// ⚠ THE DEFECTS THESE ROWS EXIST TO CATCH ARE THE CONFIDENT-WRONG-ANSWER KIND:
//
//  • an EXCLUSIVE run where the design says inclusive (one column short, and
//    entirely plausible on screen);
//  • the prefix clamp applied AFTER the run is measured, which keeps the dragged
//    LENGTH while moving its start — silently selecting art past the drag;
//  • a drag treated as a pick (or a pick treated as a drag), which is the one
//    boundary the whole wave is about;
//  • the gate falling open on a library / act-default background, where the same
//    integers name different art.
//
// EXPECTATIONS ARE DERIVED, NEVER PINNED. `rows` comes from `rowChoices()`, the
// byte constraint from `TILE_BYTES`, the prefix from `bandBudget`, and the final
// row hands the resolved range to `promoteBandCommand` on the real fixture
// document — so "the gesture aims something legal" is checked against the codec
// rather than against arithmetic this file repeated.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  publishStripDrag, lastStripDragReport, resolveStripDrag, stripDragLabel,
  type StripDragInputs,
} from '../band-strip-range';
import { markFromLayoutWord } from '../band-coverage';
import { bandBudget, promoteBandCommand, rowChoices } from '../bg-anim-aeon';
import {
  TILE_BYTES, bandTileCount, parseBgOverride, type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';
import { bandSlotBases, documentBands } from '../../../core/formats/bg-override/bg-anim-band';

const FIXTURE = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';
const doc = (): BgOverrideDocument => parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;

/**
 * The gesture's inputs with everything but the interesting field defaulted.
 *
 * `rows: 4` is the height BOTH shipped bands use and is asserted legal below
 * rather than assumed; `firstPromotableSlot: 32` and `blobTileCount: 340` are
 * round enough to make the arithmetic in each row readable, and the rows that
 * care about the REAL numbers read them off the fixture instead.
 */
function drag(over: Partial<StripDragInputs> = {}): StripDragInputs {
  return {
    layer: 'bg', origin: 'override',
    anchorSlot: 0, releaseSlot: 0,
    rows: 4, firstPromotableSlot: 32, blobTileCount: 340,
    ...over,
  };
}

describe('the fixture assumptions this file leans on', () => {
  it('rows 4 and rows 1 are both legal row counts by the codec\'s own enumeration', () => {
    // ANTI-VACUOUS: every row below that uses rows 4 or 1 would be testing the
    // refusal branch instead of the arithmetic if this were false.
    expect(rowChoices()).toContain(4);
    expect(rowChoices()).toContain(1);
    expect(rowChoices()).not.toContain(3);
  });
});

describe('the gate — a slot index only means something in THIS document\'s blob', () => {
  it('a foreground drag is a plain pick, however far it travelled', () => {
    const r = resolveStripDrag(drag({ layer: 'fg', origin: 'tileset', anchorSlot: 40, releaseSlot: 90 }));
    expect(r).toEqual({ kind: 'pick', why: 'not-the-override-blob' });
  });

  it('a BG drag on a LIBRARY background is a plain pick', () => {
    // The same integers name a different blob there, so a candidate aimed
    // through them would promote a range the author never saw.
    const r = resolveStripDrag(drag({ origin: 'library', anchorSlot: 40, releaseSlot: 90 }));
    expect(r).toEqual({ kind: 'pick', why: 'not-the-override-blob' });
  });

  it('a BG drag on the ACT\'s own plane is a plain pick', () => {
    const r = resolveStripDrag(drag({ origin: 'act', anchorSlot: 40, releaseSlot: 90 }));
    expect(r).toEqual({ kind: 'pick', why: 'not-the-override-blob' });
  });

  it('a BG drag with NO background resolved is a plain pick', () => {
    const r = resolveStripDrag(drag({ origin: 'none', anchorSlot: 40, releaseSlot: 90 }));
    expect(r).toEqual({ kind: 'pick', why: 'not-the-override-blob' });
  });

  it('on the override, press and release on ONE slot is the pick — today\'s behaviour', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 77, releaseSlot: 77 }));
    expect(r).toEqual({ kind: 'pick', why: 'same-slot' });
  });

  it('an INCONSISTENT source — an FG layer claiming the override origin — is a plain pick', () => {
    // The two fields are defaulted independently at the call site
    // (`src?.layer ?? 'fg'`, `src?.origin ?? 'none'`), and this pair is the one
    // shape that would let a FOREGROUND index aim a background band. Measured:
    // dropping the layer half of the gate turns NO other row red, because
    // `resolveTilePickerSource` never produces `origin: 'override'` in FG — so
    // this row is what makes that half of the guard assert anything at all.
    const r = resolveStripDrag(drag({ layer: 'fg', origin: 'override', anchorSlot: 40, releaseSlot: 90 }));
    expect(r).toEqual({ kind: 'pick', why: 'not-the-override-blob' });
  });

  it('the two pick reasons are distinguishable, so a caller can assert WHICH path ran', () => {
    const a = resolveStripDrag(drag({ anchorSlot: 77, releaseSlot: 77 }));
    const b = resolveStripDrag(drag({ layer: 'fg', origin: 'tileset', anchorSlot: 77, releaseSlot: 77 }));
    expect(a.kind === 'pick' && a.why).toBe('same-slot');
    expect(b.kind === 'pick' && b.why).toBe('not-the-override-blob');
  });
});

describe('extent — the run divides by rows and rounds DOWN to whole columns', () => {
  it('a run of exactly cols*rows resolves to exactly cols', () => {
    // 40..55 inclusive is 16 slots; 16 / 4 = 4 columns.
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 }));
    expect(r).toMatchObject({ kind: 'range', staticBase: 40, cols: 4, rows: 4, runLength: 16 });
  });

  it('THE RUN IS INCLUSIVE: at rows 1, dragging 10..13 is FOUR columns, not three', () => {
    // The discriminating row for an off-by-one. An exclusive run gives 3 here
    // and looks entirely reasonable — a band one column narrower than the art
    // the author dragged over.
    const r = resolveStripDrag(drag({ rows: 1, anchorSlot: 10, releaseSlot: 13, firstPromotableSlot: 0 }));
    expect(r).toMatchObject({ kind: 'range', staticBase: 10, cols: 4, runLength: 4 });
  });

  it('a run that is not a whole number of columns rounds DOWN', () => {
    // 40..58 inclusive is 19 slots; floor(19/4) = 4. Extent snapping by
    // construction: nothing is refused for being the wrong length.
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 58 }));
    expect(r).toMatchObject({ kind: 'range', cols: 4, runLength: 19 });
  });

  it('a run SHORTER than one column is still one column, never zero', () => {
    // 40..42 is 3 slots at rows 4 — floor(3/4) = 0, and a gesture that resolved
    // to nothing would read as a dead strip.
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 42 }));
    expect(r).toMatchObject({ kind: 'range', cols: 1, runLength: 3 });
  });

  it('dragging RIGHT-TO-LEFT is the same run as dragging left-to-right', () => {
    const fwd = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 }));
    const back = resolveStripDrag(drag({ anchorSlot: 55, releaseSlot: 40 }));
    expect(back).toEqual(fwd);
  });

  it('rows is carried through untouched — the strip aims the base and the width only', () => {
    for (const rows of [1, 2, 4, 8]) {
      const r = resolveStripDrag(drag({ rows, anchorSlot: 64, releaseSlot: 64 + 8 * rows - 1 }));
      expect(r).toMatchObject({ kind: 'range', rows, cols: 8 });
    }
  });
});

describe('the base clamp — and the order it happens in', () => {
  it('a run starting inside the animated prefix starts at firstPromotableSlot instead', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 20, releaseSlot: 47, firstPromotableSlot: 32 }));
    expect(r).toMatchObject({ kind: 'range', staticBase: 32, clampedToPrefix: true });
  });

  it('THE CLAMP COMES FIRST: the run is measured from the CLAMPED base, not carried', () => {
    // 20..47 is 28 slots; clamping to 32 leaves 32..47 = 16 slots = 4 columns.
    // A clamp applied after the measurement would keep 28 and give 7 columns —
    // three columns of art the author never dragged over.
    const r = resolveStripDrag(drag({ anchorSlot: 20, releaseSlot: 47, firstPromotableSlot: 32 }));
    expect(r).toMatchObject({ kind: 'range', staticBase: 32, runLength: 16, cols: 4 });
  });

  it('a run entirely past the prefix is not clamped and says so', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55, firstPromotableSlot: 32 }));
    expect(r).toMatchObject({ kind: 'range', staticBase: 40, clampedToPrefix: false });
  });

  it('the clamp is the SAME RULE the map\'s click-to-seed applies, not a second copy', () => {
    // markFromLayoutWord clamps a click-seeded base to firstPromotableSlot. If
    // the two ever disagreed, a click and a drag on the same slot would seed
    // different candidates.
    const d = doc();
    const bands = documentBands(d);
    const bases = bandSlotBases(bands);
    const counts = bands.map((b) => bandTileCount(b));
    const fps = bandBudget(d).firstPromotableSlot;
    expect(fps).toBeGreaterThan(0);            // ANTI-VACUOUS: there IS a prefix
    const inPrefix = fps - 1;
    const clicked = markFromLayoutWord(inPrefix, bases, counts, fps, d.tiles.length);
    const dragged = resolveStripDrag(drag({
      anchorSlot: inPrefix, releaseSlot: fps + 7, firstPromotableSlot: fps, blobTileCount: d.tiles.length,
    }));
    // A slot inside the prefix is a BAND to the click (it is owned), and the
    // drag's base clamp lands on the same boundary the click's clamp names.
    expect(clicked.kind).toBe('band');
    expect(dragged).toMatchObject({ kind: 'range', staticBase: fps });
  });
});

describe('the two refusals — loud, and unchanged candidate', () => {
  it('a run entirely inside the animated prefix is refused, naming the prefix', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 4, releaseSlot: 20, firstPromotableSlot: 32 }));
    expect(r.kind).toBe('refused');
    expect(r.kind === 'refused' && r.reason).toMatch(/animated prefix/);
    expect(r.kind === 'refused' && r.reason).toMatch(/0\.\.32/);
  });

  it('a base with no room for even one column is refused, naming the blob\'s end', () => {
    // 338..339 at rows 4 in a 340-tile blob: floor((340-338)/4) = 0 columns fit.
    const r = resolveStripDrag(drag({ anchorSlot: 338, releaseSlot: 339, blobTileCount: 340 }));
    expect(r.kind).toBe('refused');
    expect(r.kind === 'refused' && r.reason).toMatch(/ends at 340/);
    expect(r.kind === 'refused' && r.reason).toMatch(/candidate is unchanged/);
  });

  it('the boundary is exact: one column short refuses, one column\'s worth resolves', () => {
    // blobTileCount 340, rows 4. base 337 leaves 3 slots (refuse); base 336
    // leaves 4 (exactly one column).
    expect(resolveStripDrag(drag({ anchorSlot: 337, releaseSlot: 339 })).kind).toBe('refused');
    expect(resolveStripDrag(drag({ anchorSlot: 336, releaseSlot: 339 })))
      .toMatchObject({ kind: 'range', staticBase: 336, cols: 1 });
  });

  it('a rows value the runtime cannot shift is refused, in the contract\'s own terms', () => {
    const r = resolveStripDrag(drag({ rows: 3, anchorSlot: 40, releaseSlot: 55 }));
    expect(r.kind).toBe('refused');
    expect(r.kind === 'refused' && r.reason).toContain(`rows*${TILE_BYTES}`);
  });

  it('rows 0 cannot divide by zero — it is refused before the arithmetic', () => {
    const r = resolveStripDrag(drag({ rows: 0, anchorSlot: 40, releaseSlot: 55 }));
    expect(r.kind).toBe('refused');
  });
});

describe('the blob bound is a real reduction for any caller, not only a refusal', () => {
  it('a release PAST the end of the blob reduces cols rather than overrunning it', () => {
    // Unreachable from `ArtBrowser` (which bounds both slots to the strip), and
    // the type says so — this row proves the `Math.min` is a live reduction and
    // not dead code, so the function is total for any caller.
    const r = resolveStripDrag(drag({ anchorSlot: 320, releaseSlot: 400, blobTileCount: 340 }));
    expect(r).toMatchObject({ kind: 'range', staticBase: 320, cols: 5, trimmedToBlob: true });
    if (r.kind === 'range') expect(r.staticBase + r.cols * r.rows).toBeLessThanOrEqual(340);
  });

  it('the resolved range ALWAYS fits the blob, over every base and run in the fixture', () => {
    const d = doc();
    const fps = bandBudget(d).firstPromotableSlot;
    const n = d.tiles.length;
    let ranges = 0;
    for (let a = 0; a < n; a += 7) {
      for (let b = 0; b < n; b += 11) {
        const r = resolveStripDrag(drag({
          anchorSlot: a, releaseSlot: b, rows: 4, firstPromotableSlot: fps, blobTileCount: n,
        }));
        if (r.kind !== 'range') continue;
        ranges++;
        expect(r.cols).toBeGreaterThanOrEqual(1);
        expect(r.staticBase).toBeGreaterThanOrEqual(fps);
        expect(r.staticBase + r.cols * r.rows).toBeLessThanOrEqual(n);
      }
    }
    expect(ranges).toBeGreaterThan(100);       // ANTI-VACUOUS: it resolved a lot
  });
});

describe('the gesture aims something the CODEC accepts', () => {
  it('every range it resolves on the real document promotes without a refusal', () => {
    // THE STRONGEST ROW HERE: the extent rule is checked against
    // `promoteBandCommand` rather than against arithmetic this file repeated.
    const d = doc();
    const fps = bandBudget(d).firstPromotableSlot;
    const n = d.tiles.length;
    let checked = 0;
    for (const rows of [1, 2, 4]) {
      for (let a = fps; a < n; a += 17) {
        const r = resolveStripDrag(drag({
          anchorSlot: a, releaseSlot: Math.min(n - 1, a + 17),
          rows, firstPromotableSlot: fps, blobTileCount: n,
        }));
        if (r.kind !== 'range') continue;
        const res = promoteBandCommand(d, r.staticBase, { cols: r.cols, rows: r.rows });
        expect(res.ok, `promote refused at base ${r.staticBase} ${r.cols}x${r.rows}: `
          + `${res.ok ? '' : res.reason}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);       // ANTI-VACUOUS
  });
});

describe('the label — the strip\'s only surface', () => {
  it('a range says the slots, the geometry and the run it came from', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 }));
    const label = stripDragLabel(r);
    expect(label).toContain('slots 40..56');   // base .. base + cols*rows
    expect(label).toContain('(4x4)');
    expect(label).toContain('run of 16');
  });

  it('a clamped range says the start moved, so a surprising base is explained', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 20, releaseSlot: 47 }));
    expect(stripDragLabel(r)).toContain('start moved past the animated prefix');
  });

  it('a refusal is stated on the line, never swallowed', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 4, releaseSlot: 20 }));
    expect(stripDragLabel(r)).toMatch(/^no range — /);
    expect(stripDragLabel(r)).toContain('animated prefix');
  });

  it('a pick writes NOTHING to the line — the strip\'s own hover readout stands', () => {
    expect(stripDragLabel(resolveStripDrag(drag({ anchorSlot: 9, releaseSlot: 9 })))).toBe('');
    expect(stripDragLabel(resolveStripDrag(
      drag({ layer: 'fg', origin: 'tileset', anchorSlot: 9, releaseSlot: 40 })))).toBe('');
  });

  it('the range line is NEUTRAL about the footprint — no warning vocabulary', () => {
    // The same rule `coverageSummary` carries: scatter is legal and sometimes
    // intended, and this line describes a range, never judges one.
    for (const spec of [{ anchorSlot: 40, releaseSlot: 55 }, { anchorSlot: 20, releaseSlot: 47 },
      { anchorSlot: 320, releaseSlot: 339 }]) {
      const r = resolveStripDrag(drag(spec));
      if (r.kind !== 'range') continue;
      expect(stripDragLabel(r).toLowerCase())
        .not.toMatch(/warn|danger|careful|caution|invalid|bad|too many|only/);
    }
  });
});

describe('the report — which branch ran, when the store cannot say', () => {
  it('gestures advances on every release, resolved or not', () => {
    const before = lastStripDragReport().gestures;
    const refused = resolveStripDrag(drag({ anchorSlot: 4, releaseSlot: 20 }));
    publishStripDrag({ anchorSlot: 4, releaseSlot: 20 }, refused);
    const a = lastStripDragReport();
    expect(a.gestures).toBe(before + 1);
    expect(a.kind).toBe('refused');
    expect(a.detail).toMatch(/animated prefix/);
    expect(a.staticBase).toBeNull();

    const picked = resolveStripDrag(drag({ anchorSlot: 9, releaseSlot: 9 }));
    publishStripDrag({ anchorSlot: 9, releaseSlot: 9 }, picked);
    const b = lastStripDragReport();
    expect(b.gestures).toBe(before + 2);
    expect(b.kind).toBe('pick');
    expect(b.detail).toBe('same-slot');
  });

  it('a resolved range is reported with the numbers it set', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 }));
    publishStripDrag({ anchorSlot: 40, releaseSlot: 55 }, r);
    expect(lastStripDragReport()).toMatchObject({
      kind: 'range', anchorSlot: 40, releaseSlot: 55, staticBase: 40, cols: 4, rows: 4, detail: null,
    });
  });
});
