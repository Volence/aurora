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
  bandSlotBases,
  bandsRemaining,
  createBand,
  describeBands,
  documentBands,
  insertBand,
  planBandInsertion,
  planBandRemoval,
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
