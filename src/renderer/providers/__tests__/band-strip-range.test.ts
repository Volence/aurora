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
  publishStripDrag, lastStripDragReport, resolveStripDrag, stripDragHint, stripDragLabel,
  type StripDragInputs, type StripDragOutcome,
} from '../band-strip-range';
import { markFromLayoutWord, rangeCovers, slotRange } from '../band-coverage';
import { NO_SLOTS_PHRASE, bandBudget, promoteBandCommand, rowChoices } from '../bg-anim-aeon';
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

/**
 * THE LAST SLOT A RESOLVED RANGE OWNS, from the model that decides which cells
 * the lens paints — never from the readout's own arithmetic.
 *
 * ⚠ WHY IT WALKS INSTEAD OF SUBTRACTING. The defect these rows pin is a span
 * whose second number is `staticBase + cols*rows`, the first slot PAST the
 * range. An expectation that wrote `... - 1` would be the fix checking itself,
 * and one written through `slotSpanPhrase` would move with the very function a
 * poison edits — both stay green against a restored off-by-one. `slotRange` +
 * `rangeCovers` in `band-coverage` are a different module, are half-open BY
 * DESIGN, and are what the band lens actually consults about this same
 * candidate, so they are an independent witness to where the range stops.
 */
function lastOwnedSlot(o: Extract<StripDragOutcome, { kind: 'range' }>): number {
  const r = slotRange(o.staticBase, o.cols, o.rows);
  expect(rangeCovers(r, r.base)).toBe(true);
  let last = r.base;
  while (rangeCovers(r, last + 1)) last++;
  expect(rangeCovers(r, last + 1)).toBe(false);   // the slot no readout may name
  return last;
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
    const fps = 32;
    const r = resolveStripDrag(drag({ anchorSlot: 4, releaseSlot: 20, firstPromotableSlot: fps }));
    expect(r.kind).toBe('refused');
    expect(r.kind === 'refused' && r.reason).toMatch(/already belong to tile animations/);
    expect(r.kind === 'refused' && r.hint).toMatch(/animated prefix/);
    // THE BOUNDARY IS DERIVED FROM `firstPromotableSlot`, NOT TYPED.
    // `bandBudget` sets it from `animatedSlotCount`, so it is a COUNT: the owned
    // slots are `0 .. fps-1` and `fps` itself is the first slot the author may
    // drag to. This row shipped as a literal `/0\.\.32/` and passed against a
    // hint that said `0..32` — naming the one free slot as taken, inside the
    // single message whose whole job is to say where to drag instead. A literal
    // could not tell the two apart; deriving both halves is what makes it fail
    // if the boundary moves back.
    expect(r.kind === 'refused' && r.hint).toContain(`0..${fps - 1}`);
    expect(r.kind === 'refused' && r.hint).not.toContain(`0..${fps}`);
    // and it must point AT the first usable slot, not merely away from the prefix
    expect(r.kind === 'refused' && r.hint).toContain(`reaches slot ${fps}`);
  });

  it('a base with no room for even one column is refused, naming the blob\'s end', () => {
    // 338..339 at rows 4 in a 340-tile blob: floor((340-338)/4) = 0 columns fit.
    const r = resolveStripDrag(drag({ anchorSlot: 338, releaseSlot: 339, blobTileCount: 340 }));
    expect(r.kind).toBe('refused');
    expect(r.kind === 'refused' && r.reason).toMatch(/no 4-row column fits from slot 338/);
    expect(r.kind === 'refused' && r.hint).toMatch(/ends at 340/);
    expect(r.kind === 'refused' && r.hint).toMatch(/candidate is unchanged/);
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
    expect(r.kind === 'refused' && r.reason).toContain('rows 3 is not a legal tile-animation height');
    expect(r.kind === 'refused' && r.hint).toContain(`rows*${TILE_BYTES}`);
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
  it('a range names the slots it OWNS and the geometry on the LINE', () => {
    // ⚠ THIS ROW SHIPPED PINNING THE DEFECT — `toContain('40..56')`, with the
    // comment `base .. base + cols*rows` stating it as the intent. `56` is the
    // first slot the candidate does NOT take, so the line named a slot that is
    // still static and still promotable by the next drag. Re-cut against
    // `rangeCovers`, and asserted as the WHOLE line so the hint's own sentence
    // (which also carries a span) cannot satisfy it.
    //
    // RE-CUT for the readout-fit parcel: the line dropped `band · ` and the
    // noun `slots`, both measured out against a 102px box (see `stripDragLabel`
    // for the numbers). THE INCLUSIVE SPAN IS WHAT SURVIVED — it is item 54's
    // whole point — so this row still pins both ends, and the negative half is
    // what makes it discriminate rather than merely describe.
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 }));
    expect(r.kind).toBe('range');
    if (r.kind !== 'range') return;
    const last = lastOwnedSlot(r);
    expect(stripDragLabel(r)).toBe(`${r.staticBase}..${last} · ${r.cols}x${r.rows}`);
    expect(stripDragLabel(r)).not.toContain(`..${last + 1}`);
  });

  it('the LINE carries no noun and the TITLE carries it — the split the box forced', () => {
    // THE PAIR IS THE POINT, not either half. Asserting only that the line is
    // short would be satisfied by a line that dropped the span; asserting only
    // that the title is long would be satisfied by a line that never shortened.
    // What the parcel actually did is move two words from one to the other, and
    // that is a relationship between the two strings.
    //
    // ⚠ THIS ROW DOES NOT PROVE THE LINE FITS. Fitting is a box, a font and a
    // docked width, none of which exist in node — `bganim-strip-range-harness`
    // rows [6g2]/[6g3] own that property and measure `scrollWidth > clientWidth`
    // in the running app. This row owns the wording split only.
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 }));
    expect(r.kind).toBe('range');
    if (r.kind !== 'range') return;
    const line = stripDragLabel(r);
    const title = stripDragHint(r);
    expect(line).not.toMatch(/slots/);
    expect(line).not.toMatch(/band/);
    expect(title).toMatch(/slots/);
    expect(title).toMatch(/tile-animation candidate/);
    // ANTI-VACUOUS: they are still talking about the SAME range, so the words
    // moved rather than the line being emptied of its subject.
    const last = lastOwnedSlot(r);
    expect(line).toContain(`${r.staticBase}..${last}`);
    expect(title).toContain(`${r.staticBase}..${last}`);
  });

  it('the HINT names the same owned slots, with no doubled "slots"', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 }));
    expect(r.kind).toBe('range');
    if (r.kind !== 'range') return;
    const last = lastOwnedSlot(r);
    // "band candidate ·" is said by this readout and by nothing else in the
    // module — the label opens "band · " — so this matcher cannot be satisfied
    // by the line above.
    expect(stripDragHint(r))
      .toContain(`tile-animation candidate · slots ${r.staticBase}..${last} (${r.cols}x${r.rows})`);
    expect(stripDragHint(r)).not.toContain(`..${last + 1}`);
    expect(stripDragHint(r)).not.toMatch(/slots slots/);
  });

  it('a range ending exactly at the END OF THE BLOB names no slot the blob lacks', () => {
    // THE BOUNDARY CASE. `blobTileCount` is a COUNT, so the last slot the strip
    // has is `blobTileCount - 1`. A run snapped flush against the end makes
    // `staticBase + cols*rows === blobTileCount` exactly — so the old sentence
    // named an index the blob does not contain, on the one drag where the
    // author is hardest against the wall.
    const blob = 340;
    const r = resolveStripDrag(drag({ anchorSlot: 336, releaseSlot: 339, blobTileCount: blob }));
    expect(r.kind).toBe('range');
    if (r.kind !== 'range') return;
    expect(r.staticBase + r.cols * r.rows).toBe(blob);   // ANTI-VACUOUS: flush, not merely near
    const last = lastOwnedSlot(r);
    for (const line of [stripDragLabel(r), stripDragHint(r)]) {
      expect(line).toContain(`${r.staticBase}..${last}`);
      // Every number either readout prints must be a slot the strip HAS.
      for (const n of line.match(/\d+/g) ?? []) expect(Number(n)).toBeLessThan(blob);
    }
  });

  it('a drag can never resolve to a zero-slot range — so the empty phrase is a defence', () => {
    // WHY THE READOUTS CARRY NO ZERO GUARD OF THEIR OWN, measured rather than
    // asserted: `rowChoices()` starts at 1 and an illegal `rows` is refused
    // before the range branch, while `cols = min(max(1, …), maxCols)` with
    // `maxCols < 1` already refused — so both factors are at least 1.
    let ranges = 0;
    for (const rows of rowChoices().slice(0, 4)) {
      for (let a = 0; a <= 344; a += 7) {
        for (const b of [a, a + 1, a + rows, a + 3 * rows, 339, 400]) {
          const r = resolveStripDrag(drag({ rows, anchorSlot: a, releaseSlot: b }));
          if (r.kind !== 'range') continue;
          expect(r.cols * r.rows).toBeGreaterThanOrEqual(1);
          ranges++;
        }
      }
    }
    expect(ranges).toBeGreaterThan(100);       // ANTI-VACUOUS
  });

  it('a hand-built empty outcome reads in WORDS, never as a backwards span', () => {
    // `StripDragOutcome` is exported and both readouts are total over it, so
    // the degenerate outcome is reachable even though `resolveStripDrag` cannot
    // produce it. `base + count - 1` would print `40..39`.
    const empty: StripDragOutcome = {
      kind: 'range', staticBase: 40, cols: 0, rows: 4, runEnd: 40, runLength: 1,
      clampedToPrefix: false, trimmedToBlob: false,
    };
    // RE-CUT with the line's shortening: the noun went, the EMPTY PHRASE did
    // not. `slotSpanDigits` answers `NO_SLOTS_PHRASE` exactly as
    // `slotSpanPhrase` does, so the short form cannot render `40..39` either.
    expect(stripDragLabel(empty)).toBe(`${NO_SLOTS_PHRASE} · 0x4`);
    expect(stripDragHint(empty)).toContain(`tile-animation candidate · ${NO_SLOTS_PHRASE} (0x4)`);
    expect(stripDragLabel(empty)).not.toContain('..');
    expect(stripDragHint(empty)).not.toContain('..');
  });

  it('the run and the clamp are on the HINT, where a paragraph costs no layout', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 20, releaseSlot: 47 }));
    expect(stripDragHint(r)).toContain('run of 16 slots');
    expect(stripDragHint(r)).toContain('start moved past the animated prefix');
  });

  it('EVERY line is ONE line and stays short — a readout that wrapped moved the grid', () => {
    // MEASURED, NOT A STYLE PREFERENCE. The first build put the refusal
    // paragraph on the line; it wrapped, the picker's header row grew two text
    // lines, and the tile grid moved 36px down UNDER THE CURSOR — the next press
    // landed two slots off and the band cards slid under the pointer and erased
    // the message. The CDP row that caught it is [6h]; this is the node half.
    const outcomes = [
      resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 })),
      resolveStripDrag(drag({ anchorSlot: 20, releaseSlot: 47 })),
      resolveStripDrag(drag({ anchorSlot: 4, releaseSlot: 20 })),
      resolveStripDrag(drag({ anchorSlot: 338, releaseSlot: 339 })),
      resolveStripDrag(drag({ rows: 3, anchorSlot: 40, releaseSlot: 55 })),
    ];
    // ANTI-VACUOUS: both branches that write a line are in the sample.
    expect(outcomes.some((o) => o.kind === 'range')).toBe(true);
    expect(outcomes.some((o) => o.kind === 'refused')).toBe(true);
    // ⚠ WHAT THE CHARACTER BUDGET BELOW IS AND IS NOT. It is a guard against a
    // PARAGRAPH landing back on this line — the regression that actually
    // happened, and one a count catches. It is NOT the fit property, and the
    // budget being green is exactly how item 43's tail survived to be measured
    // by hand: `band · slots 34..41 · 2x4` is 25 characters, passed this row
    // comfortably, and truncated at 173px in a 102px box. A box, a font and a
    // docked width do not exist in node. `bganim-strip-range-harness` [6g2]
    // (this run's string) and [6g3] (the widest the blob can produce) own
    // fitting, and they measure `scrollWidth` against `clientWidth` in the app.
    for (const o of outcomes) {
      const line = stripDragLabel(o);
      expect(line).not.toContain('\n');
      expect(line.length, `too long for one line: ${JSON.stringify(line)}`).toBeLessThanOrEqual(60);
    }
  });

  it('a refusal is stated on the line, never swallowed, with the reasoning on the hint', () => {
    const r = resolveStripDrag(drag({ anchorSlot: 4, releaseSlot: 20 }));
    expect(stripDragLabel(r)).toMatch(/^no range: /);
    expect(stripDragLabel(r)).toContain('already belong to tile animations');
    expect(stripDragHint(r)).toContain('animated prefix');
    // The line is a summary of the hint, never the whole of it.
    expect(stripDragHint(r).length).toBeGreaterThan(stripDragLabel(r).length);
  });

  it('a pick writes NOTHING to the line or the hint — the strip\'s own readout stands', () => {
    expect(stripDragLabel(resolveStripDrag(drag({ anchorSlot: 9, releaseSlot: 9 })))).toBe('');
    expect(stripDragHint(resolveStripDrag(drag({ anchorSlot: 9, releaseSlot: 9 })))).toBe('');
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

// ---------------------------------------------------------------------------
// Neither readout computes its own range end (item 54's tail)
// ---------------------------------------------------------------------------
//
// The rows above pin what the two readouts SAY. This one sweeps for the SHAPE
// of the defect, so a third sentence added to this module later cannot
// reintroduce it quietly. `d7ec678` fixed the refusal hint's span in this file
// and did not reach these two, which is exactly the drift a sweep catches and a
// per-sentence row does not.

describe('band-strip-range prints no slot span of its own', () => {
  // ⚠ COMMENTS STRIPPED FIRST, and this is not tidiness. A whole-file match
  // over a `.ts` is happily satisfied by a COMMENT that quotes the call —
  // including the comments THIS parcel added explaining the fix — so the sweep
  // would go green with both readouts poisoned back to the defect. That exact
  // false green was found by the previous parcel on the panel's `.tsx`. The
  // module carries no URLs (checked: no `://`), so eating `//` to end-of-line
  // takes nothing but comments.
  const src = readFileSync('src/renderer/providers/band-strip-range.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('the stripped source is still the module', () => {
    // Anti-vacuous: a strip that ate the file would pass every negative below.
    // Structural markers, not a size ratio — most of this file IS comment.
    expect(src).toMatch(/export function stripDragLabel/);
    expect(src).toMatch(/export function stripDragHint/);
    expect(src).toMatch(/export function resolveStripDrag/);
  });

  it('both readouts reach the shared helper, and neither sums a range end inline', () => {
    expect(src.match(/\.\.\$?\{[^}]*\+[^}]*\}/g) ?? []).toEqual([]);
    // RE-CUT for the readout-fit parcel. The line now needs the span WITHOUT
    // the noun, and the cheap way to get it — a local `${base}..${base + n - 1}`
    // — is precisely the off-by-one item 54 removed, on the readout with the
    // least room to show its working. So there are two span helpers and they
    // both defer to `bg-anim-aeon`; the shape being pinned is that NEITHER
    // readout formats a span or counts a range by hand.
    //
    // ANTI-VACUOUS on each: a definition plus at least one call site.
    expect(src.match(/rangeSlots\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src.match(/rangeSpan\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/slotSpanPhrase\(/);
    expect(src).toMatch(/slotSpanDigits\(/);
    // The COUNT is computed in exactly one place too, so the two forms can
    // never be handed different lengths of the same range.
    expect(src.match(/cols \* [\w.]*rows/g) ?? []).toHaveLength(1);
    expect(src.match(/rangeCount\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // `end` was the local both readouts summed into; nothing reintroduces it.
    expect(src).not.toMatch(/const end = /);
  });

  it('the SNAPPING and CLAMPING arithmetic is untouched — only the strings moved', () => {
    // The scoping rule of this parcel, pinned rather than remembered. The run
    // is INCLUSIVE and the blob bound is EXCLUSIVE; a `- 1` pushed into either
    // would make the sentences right and the aimed range wrong.
    expect(src).toMatch(/runEnd - staticBase \+ 1/);
    expect(src).toMatch(/Math\.floor\(\(blobTileCount - staticBase\) \/ rows\)/);
    const r = resolveStripDrag(drag({ anchorSlot: 40, releaseSlot: 55 }));
    expect(r.kind === 'range' && r.runLength).toBe(16);
    expect(r.kind === 'range' && r.cols).toBe(4);
  });
});
