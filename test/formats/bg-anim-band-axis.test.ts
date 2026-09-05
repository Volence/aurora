import { describe, it, expect } from 'vitest';
// The band and its base document, built through the real promote door — in
// `test/support` so the aeon-guard bake can share it without importing a test
// file and re-registering every describe in it.
import { ROOMY, verticalBandDocument } from '../support/vertical-band';
import {
  BGANIM_BAND_AXES,
  BGANIM_PHASE_BANKS,
  BAND_AXIS_DEFAULT,
  BAND_AXIS_UNIT_KEY,
  BAND_AXIS_PERIOD_KEY,
  TILE_BYTES,
  TILE_PIXELS,
  TILE_WIDTH_PX,
  bandAxis,
  bandCellSlot,
  bandPatternPx,
  bandRotationUnitBytes,
  bandSlotCell,
  bandTileCount,
  parseBgOverride,
  serializeBgOverride,
  validateBgOverride,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';
import {
  PHASE_SHIFT_SRC_PX,
  bandFromStaticTiles,
  describeBands,
  documentBands,
  planBandPromotion,
  promoteBand,
  shiftedPhaseBanks,
} from '../../src/core/formats/bg-override/bg-anim-band';
import {
  bandSlotSource, bandStepMask, bandPreviewStates,
} from '../../src/core/formats/bg-override/bganim-preview';
import { regeneratedShiftPhases, writeTilePixels } from '../../src/core/formats/bg-override/bg-anim-art';
import {
  axisOptions, patternPxFor, rotationUnitChoices,
} from '../../src/renderer/providers/bg-anim-aeon';

/**
 * THE MOTION AXIS — Aurora's half of aeon's EFFECTS-W1 DoD item 8
 * (aeon 3a4712faa920100653669c1ec3fc26c2da71ef68, 2026-09-02).
 *
 * ═══ WHAT THIS FILE IS AIMED AT, AND WHY THE AIM IS THE HARD PART ═══
 *
 * aeon's consumer states outright that it CANNOT CHECK three things about a
 * band's axis, so they are entirely the writer's:
 *
 *   1  SLOT ORDER      column-major `c*rows + r` horizontal,
 *                      ROW-major   `r*cols + c` vertical
 *   2  PHASES ALONG THE AXIS
 *   3  `axis` SURVIVES A ROUND TRIP
 *
 * OBLIGATION 1 IS A TRAP FOR TESTS. The two orders emit the SAME SET of slots,
 * the same COUNT of them, and the same MULTISET OF PIXELS — they differ only in
 * which cell gets which. So an assertion over a set, a length, a sum or a
 * checksum is VACUOUS BY CONSTRUCTION and would go green forever, on a band
 * whose art the ROM would show transposed. `the two orders are indistinguishable
 * by set and by count` below MEASURES that trap rather than describing it, so
 * the next author meets it as a failing expectation of their own vacuous idea
 * rather than as a paragraph. Every real assertion here names a POSITION.
 *
 * ═══ WHAT A GREEN HERE DOES NOT RULE OUT — stated, not glossed ═══
 *
 * Nothing about aeon: that is `bg-anim-band-axis-aeon-gate.test.ts`, which runs
 * aeon's own `validate_band_phase_axis` against bytes this repo's promote door
 * produced. And nothing about WHERE ON THE PLANE a band's cells sit: Aurora's
 * promotion door declares an existing static range animated and inherits
 * whatever cell-to-tile mapping the author's `layout` already had — it does not
 * place a band as a rectangle, on either axis. What this file holds is that
 * Aurora has exactly ONE slot-to-cell mapping per axis and that every surface
 * which turns a band into a grid uses it.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Art whose pixels are a function of BOTH coordinates and of nothing else:
 * `value(x, y) = (x*5 + y*3) & 15` over the band's whole pixel plane.
 *
 * TWO-DIMENSIONAL ON PURPOSE. Art that is uniform along one axis makes a
 * vertical roll indistinguishable from a horizontal one (aeon's own guard admits
 * exactly that case as "ambiguous art"), so it would let a transposed fill pass
 * every check below. The `x*5` and `y*3` coefficients are coprime with 8 and
 * with each other, so no roll along one axis reproduces a roll along the other.
 */
function planeArt(cols: number, rows: number, axis: string): number[][] {
  const band = { cols, rows, axis };
  return Array.from({ length: bandTileCount(band) }, (_, slot) => {
    const { col, row } = bandSlotCell(band, slot);
    const t = new Array<number>(TILE_PIXELS);
    for (let py = 0; py < TILE_WIDTH_PX; py++) {
      for (let px = 0; px < TILE_WIDTH_PX; px++) {
        const x = col * TILE_WIDTH_PX + px, y = row * TILE_WIDTH_PX + py;
        t[py * TILE_WIDTH_PX + px] = (x * 5 + y * 3) & 15;
      }
    }
    return t;
  });
}

/** The band's pixel plane as `rows*8` rows of `cols*8` values, read through its own order. */
function pixelPlane(
  band: Pick<BgOverrideBand, 'cols' | 'rows' | 'axis'>, bank: readonly number[][],
): number[][] {
  const h = band.rows * TILE_WIDTH_PX, w = band.cols * TILE_WIDTH_PX;
  const out = Array.from({ length: h }, () => new Array<number>(w).fill(-1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const slot = bandCellSlot(band, Math.floor(x / TILE_WIDTH_PX), Math.floor(y / TILE_WIDTH_PX));
      out[y][x] = bank[slot][(y % TILE_WIDTH_PX) * TILE_WIDTH_PX + (x % TILE_WIDTH_PX)];
    }
  }
  return out;
}


// ── The contract's own shape ────────────────────────────────────────────────

describe('the axis is two names, a default, and two key tables that SWAP', () => {
  it('offers exactly the contract\'s axes, with the default among them', () => {
    expect(BGANIM_BAND_AXES).toEqual(['horizontal', 'vertical']);
    expect(BGANIM_BAND_AXES).toContain(BAND_AXIS_DEFAULT);
    // The picker a person uses must offer the same two, or the surface can
    // author a value the codec refuses (or refuse one it accepts).
    expect(axisOptions().map((o) => o.value)).toEqual([...BGANIM_BAND_AXES]);
    // Each option must say which way it actually goes — the one thing the word
    // "vertical" does not settle, since direction is fixed and is not a key.
    expect(axisOptions().find((o) => o.value === 'horizontal')!.label).toMatch(/left/);
    expect(axisOptions().find((o) => o.value === 'vertical')!.label).toMatch(/up/);
  });

  it('resolves an absent key to the default, and never to undefined', () => {
    expect(bandAxis({})).toBe(BAND_AXIS_DEFAULT);
    expect(bandAxis({ axis: 'vertical' })).toBe('vertical');
  });

  /**
   * THE GEOMETRY RULE MOVES, IT DOES NOT CHANGE SHAPE — which is the answer to
   * ROADMAP row 55's guess that "the rows/cols legality rule is likely to change
   * shape". Both axes want a power-of-two ROTATION UNIT in bytes; the axis says
   * which band key supplies it.
   */
  it('takes its unit from one key and its period from the other, and swaps them', () => {
    expect(BAND_AXIS_UNIT_KEY.horizontal).toBe('rows');
    expect(BAND_AXIS_PERIOD_KEY.horizontal).toBe('cols');
    expect(BAND_AXIS_UNIT_KEY.vertical).toBe('cols');
    expect(BAND_AXIS_PERIOD_KEY.vertical).toBe('rows');
    // Derived, not restated: on a 4x8 band the two axes must disagree about BOTH
    // numbers, or `axis` would be a key that changes nothing.
    const geom = { cols: 4, rows: 8 };
    expect(bandRotationUnitBytes({ ...geom, axis: 'horizontal' })).toBe(8 * TILE_BYTES);
    expect(bandRotationUnitBytes({ ...geom, axis: 'vertical' })).toBe(4 * TILE_BYTES);
    expect(bandPatternPx({ ...geom, axis: 'horizontal' })).toBe(4 * TILE_WIDTH_PX);
    expect(bandPatternPx({ ...geom, axis: 'vertical' })).toBe(8 * TILE_WIDTH_PX);
    // And the same expression the panel prints beside the form.
    expect(patternPxFor(4, 8, 'vertical')).toBe(bandPatternPx({ ...geom, axis: 'vertical' }));
  });

  it('offers the power-of-two counts for the key the axis constrains', () => {
    // Derived by evaluating the rule, never a pinned list: `4` is legal on both
    // axes and `3` on neither, and the two lists are the same SET because the
    // rule is the same rule — what differs is which key it is offered FOR.
    for (const axis of BGANIM_BAND_AXES) {
      const choices = rotationUnitChoices(axis);
      expect(choices).toContain(1);
      expect(choices).toContain(4);
      expect(choices).not.toContain(3);
      for (const n of choices) {
        const probe = axis === 'horizontal' ? { cols: 1, rows: n, axis } : { cols: n, rows: 1, axis };
        const bytes = bandRotationUnitBytes(probe);
        expect(bytes & (bytes - 1)).toBe(0);
      }
    }
  });

  it('refuses an unknown axis BY NAME, and refuses the geometry the axis makes illegal', () => {
    const doc = verticalBandDocument();
    const bad = structuredClone(doc);
    (bad.anims![0] as Record<string, unknown>).axis = 'diagonal';
    expect(validateBgOverride(bad).join('\n')).toMatch(/axis is "diagonal"/);

    // A 3x8 band is LEGAL horizontally (rows=8) and ILLEGAL vertically (cols=3),
    // which is the whole of the key swap seen from the refusal side. Neither
    // half of this pair is interesting alone: together they say the rule moved
    // rather than doubled.
    const h = { cols: 3, rows: 8, axis: 'horizontal', pattern_px: 24, phases: [], slot_base: 0 };
    const v = { ...h, axis: 'vertical', pattern_px: 64 };
    const wrap = (b: unknown): BgOverrideDocument => ({
      layout: ROOMY.layout, tiles: ROOMY.tiles, anims: [b as BgOverrideBand],
    });
    expect(validateBgOverride(wrap(h)).join('\n')).not.toMatch(/power of two/);
    expect(validateBgOverride(wrap(v)).join('\n')).toMatch(/cols=3 is not/);
    expect(validateBgOverride(wrap(v)).join('\n')).toMatch(/a vertical band rotates by whole rows/);
  });
});

// ── OBLIGATION 1: slot order ────────────────────────────────────────────────

describe('OBLIGATION 1: the slot order, which nothing downstream can check', () => {
  const band = { cols: 4, rows: 8 };

  /**
   * THE TRAP, MEASURED. This row asserts that the obvious checks are USELESS
   * here, so it is the one row in this file whose green rules out nothing about
   * the code — and it is here on purpose, as a live demonstration for the next
   * author rather than a warning in a comment. Everything else names a position.
   */
  it('ANTI-VACUOUS CONTROL: the two orders are indistinguishable by set and by count', () => {
    const n = bandTileCount(band);
    const h = Array.from({ length: n }, (_, i) => bandCellSlot(
      { ...band, axis: 'horizontal' }, i % band.cols, Math.floor(i / band.cols)));
    const v = Array.from({ length: n }, (_, i) => bandCellSlot(
      { ...band, axis: 'vertical' }, i % band.cols, Math.floor(i / band.cols)));
    expect(h.length).toBe(v.length);
    expect([...h].sort((a, b) => a - b)).toEqual([...v].sort((a, b) => a - b));
    expect(h.reduce((s, x) => s + x, 0)).toBe(v.reduce((s, x) => s + x, 0));
    // ...and they are NOT the same mapping, which is the fact every assertion
    // below is actually about.
    expect(h).not.toEqual(v);
  });

  it('places named cells at the slots the contract\'s two formulas name', () => {
    // Written as the contract writes them, at positions where the two answers
    // differ. Cell (1, 0) is slot 8 column-major on a 4x8 band and slot 1
    // row-major; cell (0, 1) is 1 and 4.
    expect(bandCellSlot({ ...band, axis: 'horizontal' }, 1, 0)).toBe(1 * band.rows + 0);
    expect(bandCellSlot({ ...band, axis: 'horizontal' }, 0, 1)).toBe(0 * band.rows + 1);
    expect(bandCellSlot({ ...band, axis: 'vertical' }, 1, 0)).toBe(0 * band.cols + 1);
    expect(bandCellSlot({ ...band, axis: 'vertical' }, 0, 1)).toBe(1 * band.cols + 0);
    // An absent key is the horizontal order, not a third one.
    expect(bandCellSlot(band, 2, 3)).toBe(bandCellSlot({ ...band, axis: 'horizontal' }, 2, 3));
  });

  it('is a bijection onto the band\'s slots, and `bandSlotCell` inverts it, on both axes', () => {
    for (const axis of BGANIM_BAND_AXES) {
      const b = { ...band, axis };
      const seen = new Set<number>();
      for (let r = 0; r < band.rows; r++) {
        for (let c = 0; c < band.cols; c++) {
          const slot = bandCellSlot(b, c, r);
          expect(slot).toBeGreaterThanOrEqual(0);
          expect(slot).toBeLessThan(bandTileCount(band));
          expect(seen.has(slot)).toBe(false);
          seen.add(slot);
          expect(bandSlotCell(b, slot)).toEqual({ col: c, row: r });
        }
      }
      expect(seen.size).toBe(bandTileCount(band));
    }
  });

  /**
   * THE FOUR READERS AGREE, which is what "one order per axis" has to mean in
   * practice. Each of these turns a band into a grid, and they used to spell
   * `c*rows + r` separately: the shift fill, the preview's DMA model, the art
   * composer's atlas index, and the bank thumbnail. A disagreement between any
   * two is an author drawing a picture and the ROM showing it transposed.
   */
  it('the preview\'s DMA model reads the same order the fill writes', () => {
    for (const axis of BGANIM_BAND_AXES) {
      const b = { ...band, axis };
      // At coarse 0 every slot feeds itself, on both axes — the identity is the
      // control that says the rotation below is the thing being measured.
      for (let s = 0; s < bandTileCount(band); s++) expect(bandSlotSource(s, b, 0)).toBe(s);
      // At coarse 1 the HORIZONTAL band rotates whole COLUMNS and the VERTICAL
      // one whole ROWS, so the same slot takes different art. Named cell (0,0):
      // horizontal takes column 1's row 0; vertical takes row 1's column 0.
      const origin = bandCellSlot(b, 0, 0);
      expect(bandSlotSource(origin, b, 1)).toBe(
        axis === 'horizontal' ? bandCellSlot(b, 1, 0) : bandCellSlot(b, 0, 1));
    }
  });

  it('the art composer\'s atlas index and the bank thumbnail read it too', async () => {
    // Imported lazily: the provider pulls in renderer modules, and this file's
    // subject is the codec. A stale import here would be a second spelling of
    // the mapping, which is the defect this row exists to refuse.
    const { bgArtCellAtlasIndex } = await import('../../src/renderer/providers/bg-anim-art');
    const doc = verticalBandDocument();
    const b = documentBands(doc)[0];
    // Cell index 1 on the composer canvas is (c=1, r=0) of a 4-wide band. On a
    // VERTICAL band that is slot 1; column-major it would be slot 8.
    expect(bgArtCellAtlasIndex(doc, { kind: 'bank' as const, bandIndex: 0, bank: 1 }, 1))
      .toBe(bandCellSlot(b, 1, 0));
    expect(bgArtCellAtlasIndex(doc, { kind: 'bank' as const, bandIndex: 0, bank: 1 }, 1)).toBe(1);
    // Cell index `cols` is (c=0, r=1): slot `cols` vertically, slot 1 horizontally.
    expect(bgArtCellAtlasIndex(doc, { kind: 'bank' as const, bandIndex: 0, bank: 1 }, b.cols))
      .toBe(bandCellSlot(b, 0, 1));
  });
});

// ── OBLIGATION 2: the phases are translations along the declared axis ───────

describe('OBLIGATION 2: the shift fill rolls ALONG THE AXIS', () => {
  it('rolls x on a horizontal band and y on a vertical one, at named pixels', () => {
    for (const axis of BGANIM_BAND_AXES) {
      const b = { cols: 4, rows: 8, axis };
      const banks = shiftedPhaseBanks(b, planeArt(b.cols, b.rows, axis));
      const base = pixelPlane(b, banks[0]);
      const w = b.cols * TILE_WIDTH_PX, h = b.rows * TILE_WIDTH_PX;
      for (let k = 0; k < BGANIM_PHASE_BANKS; k++) {
        const got = pixelPlane(b, banks[k]);
        const roll = k * PHASE_SHIFT_SRC_PX;
        // The WHOLE plane, derived from bank 0 by the axis's own translation.
        const want = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) =>
          axis === 'horizontal' ? base[y][(x + roll) % w] : base[(y + roll) % h][x]));
        expect(got, `bank ${k} of a ${axis} band is not the ${axis} roll`).toEqual(want);
      }
    }
  });

  /**
   * THE CONVERSE, which is what aeon actually refuses: a vertical band whose
   * phases are exact HORIZONTAL translations. Without this row the one above
   * would still pass on art uniform along y, where the two rolls coincide — so
   * this is the row that says the fixture art is 2-D enough to discriminate.
   */
  it('a vertical band\'s banks are NOT horizontal translations of bank 0', () => {
    const b = { cols: 4, rows: 8, axis: 'vertical' };
    const banks = shiftedPhaseBanks(b, planeArt(b.cols, b.rows, b.axis));
    const base = pixelPlane(b, banks[0]);
    const w = b.cols * TILE_WIDTH_PX, h = b.rows * TILE_WIDTH_PX;
    const hRoll = (k: number): number[][] => Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => base[y][(x + k) % w]));
    // Bank 1 onward: every one differs from the horizontal roll by the same
    // amount. Bank 0 is excluded because k=0 makes both rolls the identity.
    for (let k = 1; k < BGANIM_PHASE_BANKS; k++) {
      expect(pixelPlane(b, banks[k]), `bank ${k} IS a horizontal roll: aeon would refuse this band`)
        .not.toEqual(hRoll(k));
    }
  });

  it('the axis is READ off the band, so there is no way to ask for the other arm', () => {
    // `shiftedPhaseBanks` takes no axis argument. A vertical band handed to it
    // cannot come back horizontal, which is the whole defence for the one case
    // aeon refuses. Measured by giving the SAME art to two bands that differ
    // only in the key.
    const art = planeArt(4, 8, 'vertical');
    const asVertical = shiftedPhaseBanks({ cols: 4, rows: 8, axis: 'vertical' }, art);
    const asHorizontal = shiftedPhaseBanks({ cols: 4, rows: 8, axis: 'horizontal' }, art);
    expect(asVertical[0]).toEqual(asHorizontal[0]);          // bank 0 is phase 0 on both
    expect(asVertical[1]).not.toEqual(asHorizontal[1]);
  });

  it('preserves the prefix identity: bank 0 IS phase 0, on both axes', () => {
    for (const axis of BGANIM_BAND_AXES) {
      const art = planeArt(4, 8, axis);
      expect(shiftedPhaseBanks({ cols: 4, rows: 8, axis }, art)[0]).toEqual(art);
    }
  });

  it('the Shift REGENERATE reads the band\'s axis too, not just the creation door', () => {
    // `regeneratedShiftPhases` is what the panel's Shift button and the agent's
    // regenerate verb run, and it takes a WHOLE BAND — so a band that carries
    // `axis` regenerates along it. The failure this refuses is precise: an
    // author opens a vertical band, edits phase 0, presses Shift, and the banks
    // come back horizontal while `axis: vertical` stays in the file. That is the
    // exact accident aeon's guard exists to catch, and it would be OURS.
    const doc = verticalBandDocument();
    const band = documentBands(doc)[0];
    expect(regeneratedShiftPhases(band)).toEqual(shiftedPhaseBanks(band, band.phases[0]));
    // ...and NOT what the horizontal arm would have produced.
    expect(regeneratedShiftPhases(band))
      .not.toEqual(shiftedPhaseBanks({ ...band, axis: 'horizontal' }, band.phases[0]));
  });

  it('a phase-0 edit followed by Shift stays vertical', () => {
    const doc = verticalBandDocument();
    // Paint one static slot inside the animated prefix — the write lands in
    // phases[0] too, which is what makes this the real editing path.
    writeTilePixels(doc, 3, new Array<number>(TILE_PIXELS).fill(9));
    const band = documentBands(doc)[0];
    const banks = regeneratedShiftPhases(band);
    expect(banks[0]).toEqual(band.phases[0]);
    expect(banks).toEqual(shiftedPhaseBanks(band, band.phases[0]));
    expect(band.axis).toBe('vertical');
  });
});

// ── OBLIGATION 3: the key survives a round trip ─────────────────────────────

describe('OBLIGATION 3: `axis` survives load, edit-something-else, save', () => {
  it('is written, re-read, and re-written unchanged', () => {
    const doc = verticalBandDocument();
    const once = serializeBgOverride(doc);
    const back = parseBgOverride(once).doc;
    expect(documentBands(back)[0].axis).toBe('vertical');
    expect(serializeBgOverride(back)).toBe(once);
  });

  it('survives an edit to a DIFFERENT key: the case the guard cannot see through', () => {
    const doc = verticalBandDocument();
    // Touch things that rebuild or copy bands: a pixel write, a second band
    // promoted after it, and the serializer's own canonical reorder.
    writeTilePixels(doc, 0, new Array<number>(TILE_PIXELS).fill(1));
    const second = bandFromStaticTiles(doc, 200, { cols: 2, rows: 2, driver: 'timer' });
    const grown = promoteBand(doc, planBandPromotion(doc, second, 200), second);
    const bands = documentBands(parseBgOverride(serializeBgOverride(grown)).doc);
    expect(bands[0].axis).toBe('vertical');
    // The second band left the key OUT, and must still have it out: injecting a
    // default would diff every file that was tracking the contract's.
    expect('axis' in bands[1]).toBe(false);
    expect(bandAxis(bands[1])).toBe(BAND_AXIS_DEFAULT);
  });

  it('is never injected into a document that did not spell it', () => {
    // A save of an untouched horizontal document must not gain the key. The
    // roomy fixture has no bands, so promote a horizontal one and check the
    // written band's key set against the door's own inputs.
    const band = bandFromStaticTiles(ROOMY, 64, { cols: 4, rows: 8, phaseFill: 'shift' });
    expect('axis' in band).toBe(false);
    const doc = promoteBand(ROOMY, planBandPromotion(ROOMY, band, 64), band);
    expect(JSON.parse(serializeBgOverride(doc)).anims[0].axis).toBeUndefined();
  });

  it('the read model reports the effective axis AND whether the file spells it', () => {
    const doc = verticalBandDocument();
    const [view] = describeBands(doc);
    expect(view.axis).toBe('vertical');
    expect(view.axisIsExplicit).toBe(true);
    expect(view.patternPx).toBe(bandPatternPx(documentBands(doc)[0]));
    expect(view.rotationUnitBytes).toBe(bandRotationUnitBytes(documentBands(doc)[0]));
    // `columnBytes` is still rows*32 and is NOT the rotation unit here — kept
    // because it is a true statement about the geometry, asserted because a
    // reader who reached for it on a vertical band would get the wrong number.
    expect(view.columnBytes).toBe(view.rows * TILE_BYTES);
    expect(view.rotationUnitBytes).not.toBe(view.columnBytes);

    const hband = bandFromStaticTiles(ROOMY, 64, { cols: 4, rows: 8 });
    const [hview] = describeBands(
      promoteBand(ROOMY, planBandPromotion(ROOMY, hband, 64), hband));
    expect(hview.axis).toBe(BAND_AXIS_DEFAULT);
    expect(hview.axisIsExplicit).toBe(false);
  });
});

// ── The preview rings on the right period ───────────────────────────────────

describe('the preview steps on the period ALONG THE AXIS', () => {
  it('masks the step with rows*8 - 1 on a vertical band', () => {
    const doc = verticalBandDocument();
    const band = documentBands(doc)[0];
    expect(bandStepMask(band)).toBe(band.rows * TILE_WIDTH_PX - 1);
    // The horizontal reading would have been cols*8 - 1 = 31 on this geometry;
    // asserted as a NON-equality so a fill-in of the old expression fails here.
    expect(bandStepMask(band)).not.toBe(band.cols * TILE_WIDTH_PX - 1);
    const [state] = bandPreviewStates([band], { cameraXPx: 0, cameraYPx: 512, gameFrame: 0 });
    expect(state.axis).toBe('vertical');
    // driver camera_y = 512, rate_shift default 2 -> step 128, masked to 63.
    expect(state.step).toBe((512 >>> 2) & (band.rows * TILE_WIDTH_PX - 1));
  });
});
