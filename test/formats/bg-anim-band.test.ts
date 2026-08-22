import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseBgOverride,
  serializeBgOverride,
  validateBgOverride,
  cloneBgOverride,
  bandTileCount,
  animatedSlotCount,
  BAND_DEFAULTS,
  BAND_KEYS,
  BGANIM_MAX_BANDS,
  BGANIM_PHASE_BANKS,
  BG_TILE_CAPACITY,
  BG_LAYOUT_WORDS,
  LAYOUT_TILE_INDEX_MASK,
  TILE_PIXELS,
  TILE_WIDTH_PX,
  at,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';
import {
  bandFromStaticTiles,
  bandSlotBases,
  bandsRemaining,
  createBand,
  demoteBand,
  describeBands,
  documentBands,
  insertBand,
  planBandDemotion,
  planBandInsertion,
  planBandPromotion,
  planBandRemoval,
  promoteBand,
  removeBand,
  tileSlotsRemaining,
} from '../../src/core/formats/bg-override/bg-anim-band';

/**
 * The band model, proved on the ONE real BG override document that has ever
 * carried bands (aeon `b0e5a661`, vendored beside the codec's own golden — the
 * provenance and hash are pinned by bg-override-golden.test.ts, which is why
 * they are not re-pinned here).
 *
 * WHAT THIS FILE IS ACTUALLY ABOUT. Adding or removing a band is not an edit to
 * `anims`. A band's slots are a PREFIX of `tiles`, so the edit renumbers the
 * whole static blob and rewrites the nametable — and the property that matters
 * is not "the document still validates" (a document whose `anims` and `tiles`
 * came from different generations validates perfectly and ships corrupt art:
 * aeon docs/BUGS.md TOOL-01). The property that matters is that THE RENDERED
 * PICTURE IS UNCHANGED, asserted cell by cell over all 4096 nametable words
 * through a resolver written from the consumer rather than from our own code.
 */

const GOLDEN_PATH = resolve(__dirname, '../fixtures/bg-override/editor_bg_override.b0e5a661.json');
const GOLDEN: BgOverrideDocument = parseBgOverride(readFileSync(GOLDEN_PATH, 'utf8')).doc;

/**
 * THE INDEPENDENT INSTRUMENT. Written from aeon `tools/inject_editor_bg.py`'s
 * own nametable loop, quoted, NOT from `bg-anim-band.ts`:
 *
 *     for col ...: for row ...:
 *         word = layout[row * COLS + col]
 *         if word != 0:
 *             idx = word & 0x7FF
 *             word = (word & ~0x7FF) | ((idx + BG_TILE_BASE_SLOT) & 0x7FF)
 *
 * Two facts fall out and both are load-bearing. A word of EXACTLY zero skips
 * the rebase entirely, so it draws VRAM tile 0 and is not a reference to
 * `tiles[0]`. And the bits above the mask are attributes carried through
 * untouched, so a renumbering that disturbs them changes the picture just as
 * surely as one that picks the wrong tile.
 */
const AEON_TILE_INDEX_MASK = 0x7FF;

type Cell =
  | { kind: 'blank' }
  | { kind: 'tile'; attrs: number; pixels: number[] }
  | { kind: 'dangling'; attrs: number; idx: number };

function resolveCell(doc: BgOverrideDocument, i: number): Cell {
  const word = doc.layout[i];
  if (word === 0) return { kind: 'blank' };
  const idx = word & AEON_TILE_INDEX_MASK;
  const attrs = word & ~AEON_TILE_INDEX_MASK;
  const tile = doc.tiles[idx];
  return tile === undefined
    ? { kind: 'dangling', attrs, idx }
    : { kind: 'tile', attrs, pixels: tile };
}

/** The whole rendered picture, cell by cell. */
function renderAll(doc: BgOverrideDocument): Cell[] {
  return doc.layout.map((_, i) => resolveCell(doc, i));
}

/** A layout-only copy, so a poison never reaches the shared fixture's arrays. */
function withLayout(doc: BgOverrideDocument, mutate: (layout: number[]) => void): BgOverrideDocument {
  const layout = doc.layout.slice();
  mutate(layout);
  return { ...doc, layout };
}

/** `n` distinct tiles, each a flat row-major 8x8 of one 4bpp value. */
function tile(seed: number): number[] {
  return new Array<number>(TILE_PIXELS).fill(seed & 0xF);
}

/**
 * The smallest legal band of a given geometry, with distinct art per phase bank
 * so a bank mix-up cannot pass as equality.
 */
function bandOf(cols: number, rows: number, seed: number): BgOverrideBand {
  const n = cols * rows;
  return createBand({
    cols, rows,
    phases: Array.from({ length: BGANIM_PHASE_BANKS }, (_, bank) =>
      Array.from({ length: n }, (_, t) => tile(seed + bank + t))),
  });
}

// ---------------------------------------------------------------------------

describe('the instrument and the fixture are real before anything is asserted on them', () => {
  it('reads the layout word the way the consumer does', () => {
    // Pinned against the vendored constant from BOTH directions: the test
    // resolver carries aeon's own literal, the module reads the contract, and
    // this is where the two are required to be the same number.
    expect(LAYOUT_TILE_INDEX_MASK).toBe(AEON_TILE_INDEX_MASK);
    expect(at(['constants', 'LAYOUT_TILE_INDEX_MASK', 'authorities']))
      .toEqual([expect.stringContaining('idx = word & 0x7FF')]);
  });

  it('carries bands, static tiles beyond them, and a fully drawn nametable', () => {
    // ANTI-VACUITY. Every property below is trivially true of a bandless or
    // empty document — which is exactly the state this fixture's real-world
    // counterpart was destroyed into.
    const bands = documentBands(GOLDEN);
    expect(bands.length).toBeGreaterThan(0);
    expect(GOLDEN.tiles.length).toBeGreaterThan(animatedSlotCount(bands));
    expect(GOLDEN.layout).toHaveLength(BG_LAYOUT_WORDS);
    expect(GOLDEN.layout.some(w => w !== 0)).toBe(true);
    // Every cell draws a real tile, so an image-invariance sweep over this
    // document is a sweep over 4096 real comparisons, not over 4096 blanks.
    expect(renderAll(GOLDEN).every(c => c.kind === 'tile')).toBe(true);
  });

  it('draws its bands: the slots a band owns are named by real nametable cells', () => {
    const n = bandTileCount(documentBands(GOLDEN)[0]);
    const drawn = GOLDEN.layout.filter(
      w => w !== 0 && (w & AEON_TILE_INDEX_MASK) < n).length;
    expect(drawn).toBeGreaterThan(0);
  });
});

describe('slot arithmetic is derived from list order, never read out of the key', () => {
  it('walks the bands to the running cursor, and the fixture agrees with it', () => {
    const bands = documentBands(GOLDEN);
    const bases = bandSlotBases(bands);
    expect(bases).toHaveLength(bands.length + 1);
    // The fixture spells slot_base out; the consumer treats that as a claim
    // about the cursor, so the derived walk must reproduce it exactly.
    bands.forEach((band, i) => expect(band.slot_base).toBe(bases[i]));
    expect(bases[bands.length]).toBe(animatedSlotCount(bands));
  });

  it('reports the remaining band and slot headroom from the contract ceilings', () => {
    expect(bandsRemaining(GOLDEN)).toBe(BGANIM_MAX_BANDS - documentBands(GOLDEN).length);
    expect(tileSlotsRemaining(GOLDEN)).toBe(BG_TILE_CAPACITY - GOLDEN.tiles.length);
  });
});

describe('describeBands resolves the consumer defaults without inventing keys', () => {
  it('reports each band with its derived slot base and its explicit flags', () => {
    const views = describeBands(GOLDEN);
    const bands = documentBands(GOLDEN);
    expect(views).toHaveLength(bands.length);
    views.forEach((v, i) => {
      const band = bands[i];
      expect(v.index).toBe(i);
      expect(v.tileCount).toBe(bandTileCount(band));
      expect(v.patternPx).toBe(band.cols * TILE_WIDTH_PX);
      expect(v.patternPx).toBe(band.pattern_px);   // the consumer asserts this equality
      expect(v.slotBase).toBe(bandSlotBases(bands)[i]);
      expect(v.phaseBanks).toBe(BGANIM_PHASE_BANKS);
      expect(v.driverIsExplicit).toBe(true);       // this fixture spells them
      expect(v.driver).toBe(band.driver);
    });
  });

  it('falls back to the contract default for a band that leaves the key out', () => {
    const bare = bandOf(1, 1, 3);
    expect(bare.driver).toBeUndefined();
    const [view] = describeBands({ ...GOLDEN, anims: [bare] });
    expect(view.driverIsExplicit).toBe(false);
    expect(view.driver).toBe(BAND_DEFAULTS.driver);
    expect(view.rateShiftIsExplicit).toBe(false);
    expect(view.rateShift).toBe(BAND_DEFAULTS.rate_shift);
  });
});

describe('createBand builds a band the codec already accepts', () => {
  it('carries every key the contract marks required, and no derived key it was not given', () => {
    // Derived from the contract's own required list, so a key added there and
    // forgotten here fails rather than passes.
    const required = BAND_KEYS.filter(k => at(['bandKeys', k, 'required']) === true);
    expect(required.length).toBeGreaterThan(0);
    const band = createBand({ cols: 2, rows: 4 });
    for (const key of required) expect(Object.hasOwn(band, key)).toBe(true);

    // Not given, so not written: a default frozen into a file stops tracking
    // the contract's, and slot_base is list order's to decide.
    expect(Object.hasOwn(band, 'driver')).toBe(false);
    expect(Object.hasOwn(band, 'rate_shift')).toBe(false);
    expect(Object.hasOwn(band, 'slot_base')).toBe(false);
  });

  it('derives pattern_px and blank phase art from the contract, not from a literal', () => {
    const band = createBand({ cols: 3, rows: 2 });
    expect(band.pattern_px).toBe(3 * TILE_WIDTH_PX);
    expect(band.phases).toHaveLength(BGANIM_PHASE_BANKS);
    for (const bank of band.phases) {
      expect(bank).toHaveLength(bandTileCount(band));
      for (const t of bank) expect(t).toEqual(new Array<number>(TILE_PIXELS).fill(0));
    }
  });

  it('writes the optional keys only when asked', () => {
    const band = createBand({ cols: 1, rows: 1, driver: 'timer', rate_shift: 5 });
    expect(band.driver).toBe('timer');
    expect(band.rate_shift).toBe(5);
  });

  it('refuses a geometry the consumer would refuse, naming the rule', () => {
    // rows*TILE_BYTES must be a power of two: the runtime rotates a column by
    // SHIFTING, and the consumer asserts `(1 << col_shift) == col_bytes`.
    expect(() => createBand({ cols: 2, rows: 3 })).toThrow(/power of two/);
    expect(() => createBand({ cols: 1, rows: 1, driver: 'sideways' })).toThrow(/camera_x/);
  });
});

describe('adding a band leaves the rendered picture untouched', () => {
  const band = bandOf(4, 2, 5);

  it('renders every cell identically, appended at the end of the band list', () => {
    const plan = planBandInsertion(GOLDEN, band);
    const after = insertBand(GOLDEN, plan, band);

    // The instrument saw its subject: the blob grew, and cells really moved.
    expect(after.tiles).toHaveLength(GOLDEN.tiles.length + bandTileCount(band));
    expect(plan.layout.length).toBeGreaterThan(0);
    expect(plan.referencingCells).toBe(0);   // new art arrives undrawn, by construction

    const before = renderAll(GOLDEN);
    const now = renderAll(after);
    expect(now).toHaveLength(before.length);
    for (let i = 0; i < before.length; i++) expect(now[i]).toEqual(before[i]);
  });

  it('renders every cell identically when inserted FIRST, which renumbers everything', () => {
    const plan = planBandInsertion(GOLDEN, band, 0);
    expect(plan.slotBase).toBe(0);
    const after = insertBand(GOLDEN, plan, band);

    // Every static tile moved: nothing sits before slot 0.
    expect(plan.layout).toHaveLength(GOLDEN.layout.filter(w => w !== 0).length);
    expect(renderAll(after)).toEqual(renderAll(GOLDEN));
  });

  it('keeps the attribute bits and only rewrites the index half', () => {
    const plan = planBandInsertion(GOLDEN, band, 0);
    expect(plan.layout.length).toBeGreaterThan(0);
    for (const e of plan.layout) {
      expect(e.withBandNt & ~AEON_TILE_INDEX_MASK).toBe(e.withoutBandNt & ~AEON_TILE_INDEX_MASK);
      expect(e.withBandNt & AEON_TILE_INDEX_MASK)
        .toBe((e.withoutBandNt & AEON_TILE_INDEX_MASK) + bandTileCount(band));
    }
  });

  it('leaves the consumer BLANK escape alone, where every other index moves', () => {
    // INSERTED FIRST, deliberately. On an append, tile index 0 does not move at
    // all, so a blanked cell would sit still whether or not the escape exists —
    // the row would pass with the escape deleted, which is no row at all. At
    // position 0 every index shifts by the band's size, so a zero word that was
    // renumbered would become `0 | n`: a blank cell turned into a drawn one.
    const blanked = 0;
    const poisoned = withLayout(GOLDEN, layout => { layout[blanked] = 0; });
    const plan = planBandInsertion(poisoned, band, 0);
    const after = insertBand(poisoned, plan, band);

    expect(after.layout[blanked]).toBe(0);
    expect(resolveCell(after, blanked)).toEqual({ kind: 'blank' });
    expect(plan.layout.some(e => e.index === blanked)).toBe(false);
    // Not a no-op run: every OTHER cell of the same document did move.
    expect(plan.layout).toHaveLength(poisoned.layout.filter(w => w !== 0).length);
    // And a blank is not miscounted as a reference into nothing.
    expect(plan.danglingRefs).toBe(0);
  });

  it('leaves a dangling reference where it is, and counts it', () => {
    const dangling = GOLDEN.tiles.length + 1;
    const target = GOLDEN.layout.findIndex(w => w !== 0);
    const attrs = GOLDEN.layout[target] & ~AEON_TILE_INDEX_MASK;
    const poisoned = withLayout(GOLDEN, layout => { layout[target] = attrs | dangling; });

    const plan = planBandInsertion(poisoned, band);
    expect(plan.danglingRefs).toBe(1);
    expect(plan.layout.some(e => e.index === target)).toBe(false);
    expect(insertBand(poisoned, plan, band).layout[target]).toBe(attrs | dangling);
  });
});

describe('the document stays coherent as a whole, not merely valid key by key', () => {
  const band = bandOf(4, 2, 9);

  for (const where of [0, 1, 2]) {
    it(`keeps prefix identity and contiguous packing with a band inserted at ${where}`, () => {
      const plan = planBandInsertion(GOLDEN, band, where);
      const after = insertBand(GOLDEN, plan, band);

      expect(validateBgOverride(after)).toEqual([]);

      // Asserted here as well as through the validator, because this is THE
      // invariant whose violation bakes cleanly: every band's rest state must
      // BE the static tiles it covers, at a base that packs from slot 0.
      const bands = documentBands(after);
      expect(bands).toHaveLength(documentBands(GOLDEN).length + 1);
      let cursor = 0;
      for (const b of bands) {
        const n = bandTileCount(b);
        expect(b.phases[0]).toEqual(after.tiles.slice(cursor, cursor + n));
        if (b.slot_base !== undefined) expect(b.slot_base).toBe(cursor);
        cursor += n;
      }
      expect(cursor).toBe(animatedSlotCount(bands));
    });
  }

  it('re-derives slot_base for the bands that spell it, and adds it to none that do not', () => {
    const bare = bandOf(1, 1, 4);
    expect(Object.hasOwn(bare, 'slot_base')).toBe(false);
    const plan = planBandInsertion(GOLDEN, bare, 0);
    const after = insertBand(GOLDEN, plan, bare);

    const bands = documentBands(after);
    expect(Object.hasOwn(bands[0], 'slot_base')).toBe(false);   // still not spelled
    expect(bands[1].slot_base).toBe(bandTileCount(bare));       // bumped, not left stale
    expect(bands[2].slot_base).toBe(bandTileCount(bare) + bandTileCount(bands[1]));
  });

  it('carries no static tile away and duplicates none', () => {
    const plan = planBandInsertion(GOLDEN, band, 0);
    const after = insertBand(GOLDEN, plan, band);
    // The old blob survives, in order, at its new offset.
    expect(after.tiles.slice(bandTileCount(band))).toEqual(GOLDEN.tiles);
  });
});

describe('add then remove is the identity, through the serializer', () => {
  const band = bandOf(2, 4, 11);

  it('serializes the untouched document identically to itself (the control)', () => {
    // Diffing the known-good path against ITSELF first: without this the
    // round-trip below could be measuring a stable serializer rather than a
    // correct edit.
    expect(serializeBgOverride(GOLDEN)).toBe(serializeBgOverride(GOLDEN));
  });

  for (const where of [0, 1, 2]) {
    it(`restores the exact bytes after an add at ${where} and its removal`, () => {
      const addPlan = planBandInsertion(GOLDEN, band, where);
      const added = insertBand(GOLDEN, addPlan, band);
      expect(serializeBgOverride(added)).not.toBe(serializeBgOverride(GOLDEN));

      // The plan is symmetric, so the removal is the SAME plan read backwards —
      // and re-planning the removal independently must produce the same thing.
      const removePlan = planBandRemoval(added, where);
      expect(removePlan.slotBase).toBe(addPlan.slotBase);
      expect(removePlan.tileCount).toBe(addPlan.tileCount);
      expect(removePlan.layout).toEqual(addPlan.layout);
      expect(removePlan.referencingCells).toBe(0);

      expect(serializeBgOverride(removeBand(added, removePlan))).toBe(serializeBgOverride(GOLDEN));
      expect(serializeBgOverride(removeBand(added, addPlan))).toBe(serializeBgOverride(GOLDEN));
    });
  }

  it('drops `anims` entirely when the last band goes, rather than writing an empty array', () => {
    // The no-bands document has NO `anims` key — aeon's own gate asserts that
    // of the shipped file, and the codec refuses to write `[]`. So this is the
    // only shape that both round-trips and survives serialization.
    let doc: BgOverrideDocument = GOLDEN;
    for (let i = documentBands(doc).length - 1; i >= 0; i--) {
      doc = removeBand(doc, planBandRemoval(doc, i, { blankReferencingCells: true }));
    }
    expect(documentBands(doc)).toHaveLength(0);
    expect(Object.hasOwn(doc, 'anims')).toBe(false);
    expect(validateBgOverride(doc)).toEqual([]);
    expect(JSON.parse(serializeBgOverride(doc))).not.toHaveProperty('anims');
    // And it really removed something: the blob shrank by every animated slot.
    expect(doc.tiles).toHaveLength(GOLDEN.tiles.length - animatedSlotCount(documentBands(GOLDEN)));
  });
});

describe('removal will not silently delete art an author can see', () => {
  it('refuses while cells still draw the band, and names how many', () => {
    const bands = documentBands(GOLDEN);
    const n = bandTileCount(bands[0]);
    // Counted independently of the module, straight off the nametable.
    const drawn = GOLDEN.layout.filter(
      w => w !== 0 && (w & AEON_TILE_INDEX_MASK) < n).length;
    expect(drawn).toBeGreaterThan(0);

    expect(() => planBandRemoval(GOLDEN, 0)).toThrow(new RegExp(`${drawn} layout`));
    expect(() => planBandRemoval(GOLDEN, 0)).toThrow(/blankReferencingCells/);
  });

  it('blanks exactly those cells when told to, and moves every other cell faithfully', () => {
    const bands = documentBands(GOLDEN);
    const n = bandTileCount(bands[0]);
    const drawsBand = (w: number) => w !== 0 && (w & AEON_TILE_INDEX_MASK) < n;

    const plan = planBandRemoval(GOLDEN, 0, { blankReferencingCells: true });
    expect(plan.referencingCells).toBe(GOLDEN.layout.filter(drawsBand).length);
    const after = removeBand(GOLDEN, plan);
    expect(validateBgOverride(after)).toEqual([]);

    const before = renderAll(GOLDEN);
    const now = renderAll(after);
    let blanked = 0;
    for (let i = 0; i < before.length; i++) {
      if (drawsBand(GOLDEN.layout[i])) {
        expect(now[i]).toEqual({ kind: 'blank' });
        blanked++;
      } else {
        // Everything the band did not own renders exactly as it did.
        expect(now[i]).toEqual(before[i]);
      }
    }
    expect(blanked).toBe(plan.referencingCells);
  });

  it('refuses a renumbering the nametable cannot express, rather than blanking a cell', () => {
    // A word with NO attribute bits that would land on tile index 0 becomes the
    // literal word 0 — which the consumer reads as the blank escape. There is
    // no way to spell "tile 0, no attributes", so this is unrepresentable and
    // not merely different.
    const band = bandOf(1, 1, 1);
    const layout = new Array<number>(BG_LAYOUT_WORDS).fill(0);
    layout[7] = 1;                                    // idx 1, attrs 0
    const doc: BgOverrideDocument = {
      layout,
      tiles: [band.phases[0][0], tile(6), tile(7)],
      anims: [band],
    };
    expect(validateBgOverride(doc)).toEqual([]);
    expect(() => planBandRemoval(doc, 0)).toThrow(/BLANK escape/);
    expect(() => planBandRemoval(doc, 0)).toThrow(/layout\[7\]/);
  });
});

describe('the bounds are loud, and every one of them is read from the contract', () => {
  it('refuses the band past BGANIM_MAX_BANDS instead of clamping', () => {
    let doc: BgOverrideDocument = GOLDEN;
    let seed = 20;
    while (documentBands(doc).length < BGANIM_MAX_BANDS) {
      const b = bandOf(1, 1, seed++);
      doc = insertBand(doc, planBandInsertion(doc, b), b);
    }
    expect(documentBands(doc)).toHaveLength(BGANIM_MAX_BANDS);
    expect(bandsRemaining(doc)).toBe(0);
    expect(validateBgOverride(doc)).toEqual([]);

    const overflow = bandOf(1, 1, seed);
    expect(() => planBandInsertion(doc, overflow))
      .toThrow(new RegExp(`BGANIM_MAX_BANDS = ${BGANIM_MAX_BANDS}`));
  });

  it('refuses a band that would push the blob past BG_TILE_CAPACITY', () => {
    const headroom = tileSlotsRemaining(GOLDEN);
    expect(headroom).toBeGreaterThan(0);
    // One slot too many, derived — never a typed count.
    const tooBig = bandOf(headroom + 1, 1, 30);
    expect(() => planBandInsertion(GOLDEN, tooBig))
      .toThrow(new RegExp(`capacity of ${BG_TILE_CAPACITY}`));
    // ...and exactly the headroom fits, so the boundary is the boundary.
    const exact = bandOf(headroom, 1, 31);
    const fits = insertBand(GOLDEN, planBandInsertion(GOLDEN, exact), exact);
    expect(fits.tiles).toHaveLength(BG_TILE_CAPACITY);
    expect(validateBgOverride(fits)).toEqual([]);
  });

  it('refuses a slot_base that tries to place a band instead of agreeing with it', () => {
    const band = { ...bandOf(1, 1, 40), slot_base: 999 };
    expect(() => planBandInsertion(GOLDEN, band)).toThrow(/slot_base/);
    expect(() => planBandInsertion(GOLDEN, band)).toThrow(/contiguously/);
  });

  it('refuses positions that are not positions, in both directions', () => {
    const band = bandOf(1, 1, 41);
    const count = documentBands(GOLDEN).length;
    expect(() => planBandInsertion(GOLDEN, band, count + 1)).toThrow(/legal positions/);
    expect(() => planBandInsertion(GOLDEN, band, -1)).toThrow(/legal positions/);
    expect(() => planBandRemoval(GOLDEN, count)).toThrow(/indexed 0\.\./);
    expect(() => planBandRemoval({ ...GOLDEN, anims: undefined }, 0))
      .toThrow(/nothing to remove/);
  });
});

describe('the sole-writer round-trip survives the command', () => {
  /**
   * The codec's posture, restated as a property of the EDIT rather than of the
   * read/write pair: Aurora owns three keys and carries everything else through
   * unjudged. A band edit rebuilds two of those three keys, which is exactly
   * where a hand-enumerated rebuild would drop the rest.
   *
   * The palette here is DELIBERATELY ILLEGAL — the same poison the codec pins —
   * because "passes through" and "passes validation" are different claims and
   * only the first one is Aurora's to make.
   */
  const unowned = {
    palette: 'not a palette at all',
    palette_line: { nonsense: true },
    some_future_key: [1, 2, 3],
  };
  const bandExtras = { authored_by: 'a tool that does not exist yet', hint: { wobble: 3 } };

  function decorated(): BgOverrideDocument {
    const anims = documentBands(GOLDEN).map(b => ({ ...cloneBgOverride(b), ...bandExtras }));
    return { ...GOLDEN, ...unowned, anims };
  }

  it('carries unknown top-level keys and an illegal palette through an add', () => {
    const doc = decorated();
    const band = bandOf(2, 2, 50);
    const after = insertBand(doc, planBandInsertion(doc, band), band);
    for (const [k, v] of Object.entries(unowned)) expect(after[k]).toEqual(v);
    // Unjudged, not merely carried: it is still illegal and still accepted.
    expect(validateBgOverride(after)).toEqual([]);
  });

  it('carries unknown keys INSIDE a band through the slot_base resync', () => {
    // The resync is the copier that touches a band it is not editing, so it is
    // the one place a field-enumerating rebuild would silently erase a key.
    const doc = decorated();
    const band = bandOf(2, 2, 51);
    const after = insertBand(doc, planBandInsertion(doc, band, 0), band);
    const survivors = documentBands(after).slice(1);
    expect(survivors).toHaveLength(documentBands(doc).length);
    for (const b of survivors) {
      expect(b.authored_by).toBe(bandExtras.authored_by);
      expect(b.hint).toEqual(bandExtras.hint);
      expect(b.slot_base).not.toBe(undefined);   // it WAS rewritten, so it was copied
    }
  });

  it('returns the decorated document byte-for-byte after add and remove', () => {
    const doc = decorated();
    const band = bandOf(2, 2, 52);
    const plan = planBandInsertion(doc, band, 0);
    const round = removeBand(insertBand(doc, plan, band), plan);
    expect(serializeBgOverride(round)).toBe(serializeBgOverride(doc));
  });

  it('never mutates the document it was handed', () => {
    const before = serializeBgOverride(GOLDEN);
    const band = bandOf(2, 2, 53);
    const plan = planBandInsertion(GOLDEN, band, 0);
    insertBand(GOLDEN, plan, band);
    expect(serializeBgOverride(GOLDEN)).toBe(before);
  });

  it('does not alias the band art it inserted into the static blob', () => {
    // Equal by value because the invariant says so, not because they are the
    // same memory: aliasing would make prefix identity hold for free and stop
    // being true the moment anything clones or serializes either side.
    const band = bandOf(2, 2, 54);
    const after = insertBand(GOLDEN, planBandInsertion(GOLDEN, band), band);
    const base = animatedSlotCount(documentBands(GOLDEN));
    expect(after.tiles[base]).toEqual(band.phases[0][0]);
    expect(after.tiles[base]).not.toBe(band.phases[0][0]);
  });
});

// ===========================================================================
// PROMOTION AND DEMOTION — the pair that does not change `tiles.length`
//
// The operations above GROW and SHRINK the blob, because an inserted band's
// phase-0 art comes from outside the document. aeon's live file has no room for
// that: it is at BG_TILE_CAPACITY exactly, so `planBandInsertion` refuses there
// at every size including 1x1, and BgAnim authoring is impossible on the
// document that actually ships.
//
// Promotion declares a range of tiles the blob ALREADY carries to be animated.
// Nothing is added — the range MOVES to the front, where bands must pack from
// slot 0 — so a full blob is not an obstacle. Demotion hands the same slots back
// to the static blob, and unlike removal it destroys NOTHING: the band's phase-0
// art stays in `tiles`, so the picture survives in BOTH directions.
//
// The zero-headroom subject is built by PADDING the real fixture to the
// contract's own capacity rather than by pinning aeon's 448, so what is under
// test is "a document with no free tile slots" — which stays true when their
// number moves.
// ===========================================================================

/** Tiles as comparable values, for proving the blob was permuted and not rewritten. */
const tileBag = (tiles: number[][]) => tiles.map(t => t.join(',')).sort();

/**
 * A document at BG_TILE_CAPACITY exactly, in the shape aeon's live file has:
 * `layout` + `tiles`, no `anims` at all. Padded from the real fixture, so its
 * nametable is the real one and every cell still draws a real tile.
 */
function fullBandlessDoc(): BgOverrideDocument {
  const tiles = cloneBgOverride(GOLDEN.tiles);
  while (tiles.length < BG_TILE_CAPACITY) tiles.push(tile(tiles.length));
  return { layout: GOLDEN.layout.slice(), tiles };
}

describe('the zero-headroom document is real, and insertion genuinely cannot touch it', () => {
  const full = fullBandlessDoc();

  it('is full, bandless, valid, and draws every one of its cells', () => {
    // ANTI-VACUITY, and it is the whole point of this subject: a document with
    // spare slots would let `insertBand` through and prove nothing below.
    expect(tileSlotsRemaining(full)).toBe(0);
    expect(full.tiles).toHaveLength(BG_TILE_CAPACITY);
    expect(documentBands(full)).toHaveLength(0);
    expect(bandsRemaining(full)).toBe(BGANIM_MAX_BANDS);   // slots free, and unreachable
    expect(validateBgOverride(full)).toEqual([]);
    expect(renderAll(full).every(c => c.kind === 'tile')).toBe(true);
  });

  it('refuses EVERY insertable band size, down to the smallest one that exists', () => {
    // 1x1 is the floor: cols >= 1, rows >= 1, and rows*TILE_BYTES is already a
    // power of two there. If the smallest band that exists is refused, all are.
    for (const [cols, rows] of [[1, 1], [2, 1], [1, 2], [8, 4]] as const) {
      expect(() => planBandInsertion(full, bandOf(cols, rows, 2)))
        .toThrow(new RegExp(`capacity of ${BG_TILE_CAPACITY}`));
    }
  });

  it('PROMOTES on it, which is the operation this whole pair exists for', () => {
    const from = 200;
    const spec = { cols: 8, rows: 4 } as const;
    const band = bandFromStaticTiles(full, from, spec);
    const plan = planBandPromotion(full, band, from);
    const after = promoteBand(full, plan, band);

    expect(validateBgOverride(after)).toEqual([]);
    expect(documentBands(after)).toHaveLength(1);
    // The blob did not grow by a single slot, and it is still exactly full.
    expect(after.tiles).toHaveLength(full.tiles.length);
    expect(tileSlotsRemaining(after)).toBe(0);
    // The instrument saw its subject: cells really moved, and the picture held.
    expect(plan.layout.length).toBeGreaterThan(0);
    expect(renderAll(after)).toEqual(renderAll(full));
  });
});

describe('promotion changes no picture and no blob length', () => {
  const from = 200;
  const spec = { cols: 8, rows: 1 } as const;

  for (const where of [0, 1, 2]) {
    it(`renders every cell identically with the band promoted at ${where}`, () => {
      const band = bandFromStaticTiles(GOLDEN, from, spec);
      const plan = planBandPromotion(GOLDEN, band, from, where);
      const after = promoteBand(GOLDEN, plan, band);

      // The subject is not a no-op: real cells drew the promoted range, and this
      // counts them off the nametable rather than out of the plan.
      const n = spec.cols * spec.rows;
      const drawnFromRange = GOLDEN.layout.filter(
        w => w !== 0 && (w & AEON_TILE_INDEX_MASK) >= from
          && (w & AEON_TILE_INDEX_MASK) < from + n).length;
      expect(drawnFromRange).toBeGreaterThan(0);
      expect(plan.layout.length).toBeGreaterThan(0);

      const before = renderAll(GOLDEN);
      const now = renderAll(after);
      expect(now).toHaveLength(before.length);
      for (let i = 0; i < before.length; i++) expect(now[i]).toEqual(before[i]);
    });
  }

  it('keeps tiles.length exactly, and permutes the blob rather than rewriting it', () => {
    const band = bandFromStaticTiles(GOLDEN, from, spec);
    const after = promoteBand(GOLDEN, planBandPromotion(GOLDEN, band, from, 0), band);

    expect(after.tiles).toHaveLength(GOLDEN.tiles.length);
    // DERIVED, not asserted: the same multiset of tiles, so nothing was created,
    // destroyed or altered — only moved.
    expect(tileBag(after.tiles)).toEqual(tileBag(GOLDEN.tiles));
    // ...and it really was a move: the order changed.
    expect(after.tiles.map(t => t.join(','))).not.toEqual(GOLDEN.tiles.map(t => t.join(',')));
  });

  it('destroys nothing, so it never reports a referencing cell', () => {
    const band = bandFromStaticTiles(GOLDEN, from, spec);
    const plan = planBandPromotion(GOLDEN, band, from, 0);
    expect(plan.referencingCells).toBe(0);
    expect(plan.danglingRefs).toBe(0);
  });

  it('keeps prefix identity and contiguous packing for EVERY band afterwards', () => {
    const band = bandFromStaticTiles(GOLDEN, from, spec);
    const after = promoteBand(GOLDEN, planBandPromotion(GOLDEN, band, from, 1), band);

    // By construction if the move is right, which is exactly why it is asserted.
    const bands = documentBands(after);
    expect(bands).toHaveLength(documentBands(GOLDEN).length + 1);
    let cursor = 0;
    for (const b of bands) {
      const n = bandTileCount(b);
      expect(b.phases[0]).toEqual(after.tiles.slice(cursor, cursor + n));
      if (b.slot_base !== undefined) expect(b.slot_base).toBe(cursor);
      cursor += n;
    }
    expect(cursor).toBe(animatedSlotCount(bands));
  });

  it('keeps the attribute bits and only rewrites the index half', () => {
    const band = bandFromStaticTiles(GOLDEN, from, spec);
    const plan = planBandPromotion(GOLDEN, band, from, 0);
    expect(plan.layout.length).toBeGreaterThan(0);
    for (const e of plan.layout) {
      expect(e.withBandNt & ~AEON_TILE_INDEX_MASK).toBe(e.withoutBandNt & ~AEON_TILE_INDEX_MASK);
    }
  });

  it('does not alias the promoted art into the blob it came from', () => {
    const band = bandFromStaticTiles(GOLDEN, from, spec);
    const after = promoteBand(GOLDEN, planBandPromotion(GOLDEN, band, from), band);
    const base = animatedSlotCount(documentBands(GOLDEN));
    expect(after.tiles[base]).toEqual(GOLDEN.tiles[from]);
    expect(after.tiles[base]).not.toBe(GOLDEN.tiles[from]);
    expect(band.phases[0][0]).not.toBe(GOLDEN.tiles[from]);
  });

  it('never mutates the document it was handed', () => {
    const before = serializeBgOverride(GOLDEN);
    const band = bandFromStaticTiles(GOLDEN, from, spec);
    promoteBand(GOLDEN, planBandPromotion(GOLDEN, band, from, 0), band);
    expect(serializeBgOverride(GOLDEN)).toBe(before);
  });
});

describe('DEMOTION DESTROYS NOTHING, which is the whole difference from removal', () => {
  it('refuses to REMOVE the drawn band, and demotes the same band with the picture intact', () => {
    // THE DISCRIMINATING ROW. Both operations take band 0 out of `anims`. One
    // deletes 2560 cells' worth of art and has to say so; the other moves the
    // same art into the static blob and changes nothing an author can see.
    const n = bandTileCount(documentBands(GOLDEN)[0]);
    const drawn = GOLDEN.layout.filter(
      w => w !== 0 && (w & AEON_TILE_INDEX_MASK) < n).length;
    expect(drawn).toBeGreaterThan(0);
    expect(() => planBandRemoval(GOLDEN, 0)).toThrow(new RegExp(`${drawn} layout`));

    const plan = planBandDemotion(GOLDEN, 0);
    const after = demoteBand(GOLDEN, plan);
    expect(validateBgOverride(after)).toEqual([]);
    expect(documentBands(after)).toHaveLength(documentBands(GOLDEN).length - 1);
    expect(after.tiles).toHaveLength(GOLDEN.tiles.length);
    expect(renderAll(after)).toEqual(renderAll(GOLDEN));
    // Not one cell went blank, where removal would have blanked `drawn` of them.
    expect(after.layout.filter(w => w === 0)).toHaveLength(
      GOLDEN.layout.filter(w => w === 0).length);
    // And the demotion really moved something.
    expect(plan.layout.length).toBeGreaterThan(0);
  });

  it('takes no `blankReferencingCells` decision, because there is nothing to blank', () => {
    // Removal counts the cells it is about to destroy; demotion has none.
    expect(planBandDemotion(GOLDEN, 0).referencingCells).toBe(0);
    expect(planBandRemoval(GOLDEN, 0, { blankReferencingCells: true }).referencingCells)
      .toBeGreaterThan(0);
  });

  it('drops `anims` entirely when the last band is demoted, and keeps every tile', () => {
    let doc: BgOverrideDocument = GOLDEN;
    for (let i = documentBands(doc).length - 1; i >= 0; i--) {
      doc = demoteBand(doc, planBandDemotion(doc, i));
    }
    expect(documentBands(doc)).toHaveLength(0);
    expect(Object.hasOwn(doc, 'anims')).toBe(false);
    expect(validateBgOverride(doc)).toEqual([]);
    // The contrast with the removal row of exactly this shape above: THERE the
    // blob shrank by every animated slot; here it did not shrink at all, and the
    // picture is untouched where removal had to blank 2560 cells to get here.
    expect(doc.tiles).toHaveLength(GOLDEN.tiles.length);
    expect(tileBag(doc.tiles)).toEqual(tileBag(GOLDEN.tiles));
    expect(renderAll(doc)).toEqual(renderAll(GOLDEN));
  });

  it('moves no tile at all when the LAST band is demoted to the default place', () => {
    // The default target is the first slot the shortened animated prefix no
    // longer covers, which for the last band is where it already sits.
    const last = documentBands(GOLDEN).length - 1;
    const plan = planBandDemotion(GOLDEN, last);
    expect(plan.staticBase).toBe(plan.slotBase);
    expect(plan.layout).toHaveLength(0);
    const after = demoteBand(GOLDEN, plan);
    expect(after.tiles).toEqual(GOLDEN.tiles);
    expect(after.layout).toEqual(GOLDEN.layout);
  });

  it('lands the art anywhere in the static region the caller names', () => {
    const bands = documentBands(GOLDEN);
    const n = bandTileCount(bands[0]);
    const to = GOLDEN.tiles.length - n;             // the very end of the blob
    const after = demoteBand(GOLDEN, planBandDemotion(GOLDEN, 0, to));
    expect(after.tiles.slice(to, to + n)).toEqual(bands[0].phases[0]);
    expect(after.tiles).toHaveLength(GOLDEN.tiles.length);
    expect(renderAll(after)).toEqual(renderAll(GOLDEN));
  });
});

describe('promote and demote are byte-identical inverses, through the serializer', () => {
  const from = 200;
  const spec = { cols: 8, rows: 1 } as const;

  it('serializes the untouched document identically to itself (the control)', () => {
    // Without this the round trips below could be measuring a stable serializer
    // rather than a correct pair of edits.
    expect(serializeBgOverride(GOLDEN)).toBe(serializeBgOverride(GOLDEN));
  });

  for (const where of [0, 1, 2]) {
    it(`restores the exact bytes after a promotion at ${where} and its demotion`, () => {
      const band = bandFromStaticTiles(GOLDEN, from, spec);
      const upPlan = planBandPromotion(GOLDEN, band, from, where);
      const promoted = promoteBand(GOLDEN, upPlan, band);
      expect(serializeBgOverride(promoted)).not.toBe(serializeBgOverride(GOLDEN));

      // Re-planned independently, and it must reproduce the same symmetric plan.
      const downPlan = planBandDemotion(promoted, where, from);
      expect(downPlan.slotBase).toBe(upPlan.slotBase);
      expect(downPlan.tileCount).toBe(upPlan.tileCount);
      expect(downPlan.staticBase).toBe(upPlan.staticBase);
      expect(downPlan.layout).toEqual(upPlan.layout);

      expect(serializeBgOverride(demoteBand(promoted, downPlan))).toBe(serializeBgOverride(GOLDEN));
      // ...and the SAME plan read backwards, which is what undo does.
      expect(serializeBgOverride(demoteBand(promoted, upPlan))).toBe(serializeBgOverride(GOLDEN));
    });
  }

  it('restores the exact bytes the other way round: demote then promote', () => {
    const bands = documentBands(GOLDEN);
    expect(bands.length).toBeGreaterThan(0);
    for (let i = 0; i < bands.length; i++) {
      const to = GOLDEN.tiles.length - bandTileCount(bands[i]);
      const downPlan = planBandDemotion(GOLDEN, i, to);
      const demoted = demoteBand(GOLDEN, downPlan);
      expect(serializeBgOverride(demoted)).not.toBe(serializeBgOverride(GOLDEN));

      const upPlan = planBandPromotion(demoted, bands[i], to, i);
      expect(upPlan.layout).toEqual(downPlan.layout);
      expect(serializeBgOverride(promoteBand(demoted, upPlan, bands[i])))
        .toBe(serializeBgOverride(GOLDEN));
      expect(serializeBgOverride(promoteBand(demoted, downPlan, bands[i])))
        .toBe(serializeBgOverride(GOLDEN));
    }
  });
});

describe('bandFromStaticTiles reads phase 0 from the blob and leaves the picture inert', () => {
  it('takes phase 0 out of the static range, byte for byte', () => {
    const from = 200;
    const band = bandFromStaticTiles(GOLDEN, from, { cols: 4, rows: 2 });
    expect(band.phases[0]).toEqual(GOLDEN.tiles.slice(from, from + bandTileCount(band)));
  });

  it('fills every later bank with phase 0, so a promoted band is inert until authored', () => {
    // THE DESIGN CALL, pinned. Blank banks would flash the picture to nothing on
    // the band's second phase — an unrequested edit to the author's background.
    // A copy animates to exactly what was already there.
    const band = bandFromStaticTiles(GOLDEN, 200, { cols: 4, rows: 2 });
    expect(band.phases).toHaveLength(BGANIM_PHASE_BANKS);
    for (const bank of band.phases) expect(bank).toEqual(band.phases[0]);
    // Not the blank band `createBand` makes without art: this is real art.
    expect(band.phases[0].some(t => t.some(p => p !== 0))).toBe(true);
  });

  it('does not alias the blob it read, in any bank', () => {
    const band = bandFromStaticTiles(GOLDEN, 200, { cols: 4, rows: 2 });
    expect(band.phases[0][0]).not.toBe(GOLDEN.tiles[200]);
    for (let b = 1; b < BGANIM_PHASE_BANKS; b++) {
      expect(band.phases[b][0]).not.toBe(band.phases[0][0]);
    }
  });

  it('writes the optional keys only when asked, exactly as createBand does', () => {
    const bare = bandFromStaticTiles(GOLDEN, 200, { cols: 4, rows: 2 });
    expect(Object.hasOwn(bare, 'driver')).toBe(false);
    expect(Object.hasOwn(bare, 'rate_shift')).toBe(false);
    expect(Object.hasOwn(bare, 'slot_base')).toBe(false);
    const spelled = bandFromStaticTiles(GOLDEN, 200, {
      cols: 4, rows: 2, driver: 'timer', rate_shift: 5,
    });
    expect(spelled.driver).toBe('timer');
    expect(spelled.rate_shift).toBe(5);
  });
});

describe('the promotion bounds are loud, and each names the rule it enforces', () => {
  it('refuses a range that reaches past the end of the blob', () => {
    // MATCHED ON THIS GUARD'S OWN WORDS, not on "has only N tiles": the codec's
    // prefix check says that too, so a looser regex passes against a range whose
    // bounds were never checked at all. (It did, once, and this row was re-cut.)
    const from = GOLDEN.tiles.length - 2;
    expect(() => bandFromStaticTiles(GOLDEN, from, { cols: 4, rows: 1 }))
      .toThrow(new RegExp(`cannot promote tiles ${from}\\.\\.${from + 4}`));
    expect(() => bandFromStaticTiles(GOLDEN, from, { cols: 4, rows: 1 }))
      .toThrow(/it never adds any/);
    // ...and exactly the range that fits is allowed, so the boundary is the boundary.
    expect(() => bandFromStaticTiles(GOLDEN, GOLDEN.tiles.length - 4, { cols: 4, rows: 1 }))
      .not.toThrow();
  });

  it('refuses a range that overlaps the slots existing bands already own', () => {
    const animated = animatedSlotCount(documentBands(GOLDEN));
    expect(animated).toBeGreaterThan(0);
    // One slot too far in, derived — never a typed index.
    expect(() => bandFromStaticTiles(GOLDEN, animated - 1, { cols: 2, rows: 1 }))
      .toThrow(new RegExp(`slots 0\\.\\.${animated} already belong`));
    // ...and exactly at the boundary it is allowed, so the boundary is the boundary.
    expect(() => bandFromStaticTiles(GOLDEN, animated, { cols: 2, rows: 1 })).not.toThrow();
  });

  it('refuses a band whose phases[0] is not the art being promoted', () => {
    const from = 200;
    const honest = bandFromStaticTiles(GOLDEN, from, { cols: 4, rows: 1 });
    const lying = cloneBgOverride(honest);
    lying.phases[0][0] = tile(15);
    expect(() => planBandPromotion(GOLDEN, lying, from)).toThrow(/phases\[0\] is not that art/);
    // The honest one goes through, so the row discriminates.
    expect(() => planBandPromotion(GOLDEN, honest, from)).not.toThrow();
  });

  it('refuses a demotion target inside the remaining bands prefix', () => {
    const bands = documentBands(GOLDEN);
    const remaining = animatedSlotCount(bands) - bandTileCount(bands[0]);
    expect(remaining).toBeGreaterThan(0);
    expect(() => planBandDemotion(GOLDEN, 0, remaining - 1))
      .toThrow(new RegExp(`must land at or after ${remaining}`));
    expect(() => planBandDemotion(GOLDEN, 0, remaining)).not.toThrow();
  });

  it('refuses a demotion target that would run off the end of the blob', () => {
    const n = bandTileCount(documentBands(GOLDEN)[0]);
    const last = GOLDEN.tiles.length - n;
    expect(() => planBandDemotion(GOLDEN, 0, last + 1)).toThrow(/does not grow it/);
    expect(() => planBandDemotion(GOLDEN, 0, last)).not.toThrow();
  });

  it('refuses positions that are not positions, in both directions', () => {
    const band = bandFromStaticTiles(GOLDEN, 200, { cols: 4, rows: 1 });
    const count = documentBands(GOLDEN).length;
    expect(() => planBandPromotion(GOLDEN, band, 200, count + 1)).toThrow(/legal positions/);
    expect(() => planBandPromotion(GOLDEN, band, 200, -1)).toThrow(/legal positions/);
    expect(() => planBandDemotion(GOLDEN, count)).toThrow(/indexed 0\.\./);
    expect(() => planBandDemotion({ ...GOLDEN, anims: undefined }, 0))
      .toThrow(/nothing to demote/);
  });

  it('refuses a band past BGANIM_MAX_BANDS on the promotion door too', () => {
    // The ceiling is not insertion's to own: it belongs to every arrival.
    let doc: BgOverrideDocument = GOLDEN;
    let seed = 60;
    while (documentBands(doc).length < BGANIM_MAX_BANDS) {
      const b = bandOf(1, 1, seed++);
      doc = insertBand(doc, planBandInsertion(doc, b), b);
    }
    const at = animatedSlotCount(documentBands(doc));
    const overflow = bandFromStaticTiles(doc, at, { cols: 1, rows: 1 });
    expect(() => planBandPromotion(doc, overflow, at))
      .toThrow(new RegExp(`BGANIM_MAX_BANDS = ${BGANIM_MAX_BANDS}`));
  });
});

describe('a plan of one kind cannot be applied through the other kind of door', () => {
  // The two plan kinds disagree about `tiles.length`, so crossing them is a
  // silent-corruption shape: an insertion plan promoted would grow a full blob,
  // and a promotion plan removed would delete art the caller was told survives.
  const band = bandOf(2, 2, 70);

  it('refuses an insertion plan at the promotion door', () => {
    const plan = planBandInsertion(GOLDEN, band);
    expect(plan.staticBase).toBeNull();
    expect(() => promoteBand(GOLDEN, plan, band)).toThrow(/CREATES\/DESTROYS/);
    expect(() => demoteBand(GOLDEN, plan)).toThrow(/CREATES\/DESTROYS/);
  });

  it('refuses a promotion plan at the insertion door', () => {
    const from = 200;
    const promoted = bandFromStaticTiles(GOLDEN, from, { cols: 4, rows: 1 });
    const plan = planBandPromotion(GOLDEN, promoted, from);
    expect(plan.staticBase).toBe(from);
    expect(() => insertBand(GOLDEN, plan, promoted)).toThrow(/MOVES/);
    expect(() => removeBand(GOLDEN, plan)).toThrow(/MOVES/);
  });
});

describe('the sole-writer round-trip survives promotion and demotion too', () => {
  const unowned = {
    palette: 'not a palette at all',
    palette_line: { nonsense: true },
    some_future_key: [1, 2, 3],
  };
  const bandExtras = { authored_by: 'a tool that does not exist yet', hint: { wobble: 3 } };

  function decorated(): BgOverrideDocument {
    const anims = documentBands(GOLDEN).map(b => ({ ...cloneBgOverride(b), ...bandExtras }));
    return { ...GOLDEN, ...unowned, anims };
  }

  it('carries unknown top-level and unknown BAND keys through a promotion', () => {
    const doc = decorated();
    const from = 200;
    const band = bandFromStaticTiles(doc, from, { cols: 4, rows: 1 });
    const after = promoteBand(doc, planBandPromotion(doc, band, from, 0), band);

    for (const [k, v] of Object.entries(unowned)) expect(after[k]).toEqual(v);
    expect(validateBgOverride(after)).toEqual([]);   // unjudged, not merely carried
    const survivors = documentBands(after).slice(1);
    expect(survivors).toHaveLength(documentBands(doc).length);
    for (const b of survivors) {
      expect(b.authored_by).toBe(bandExtras.authored_by);
      expect(b.hint).toEqual(bandExtras.hint);
      expect(b.slot_base).not.toBe(undefined);       // it WAS rewritten, so it was copied
    }
  });

  it('returns the decorated document byte-for-byte after promote and demote', () => {
    const doc = decorated();
    const from = 200;
    const band = bandFromStaticTiles(doc, from, { cols: 4, rows: 1 });
    const plan = planBandPromotion(doc, band, from, 0);
    expect(serializeBgOverride(demoteBand(promoteBand(doc, plan, band), plan)))
      .toBe(serializeBgOverride(doc));
  });

  it('carries an unknown key on the DEMOTED band through the demotion itself', () => {
    const doc = decorated();
    const demoted = demoteBand(doc, planBandDemotion(doc, 0));
    expect(documentBands(demoted)[0].authored_by).toBe(bandExtras.authored_by);
    for (const [k, v] of Object.entries(unowned)) expect(demoted[k]).toEqual(v);
  });
});
