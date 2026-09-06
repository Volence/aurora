import { describe, it, expect } from 'vitest';
import {
  bandFromStaticTiles,
  createBand,
  documentBands,
  insertBand,
  planBandInsertion,
} from '../../src/core/formats/bg-override/bg-anim-band';
import {
  makeAddBandCommand,
  makeDemoteBandCommand,
  makePromoteBandCommand,
  makeRemoveBandCommand,
} from '../../src/core/editing/bg-override-band';
import { b0e5a661Doc, sectionRoomyDoc } from '../support/bg-override-fixtures';
import {
  animatedSlotCount,
  validateBgOverride,
  bgOverrideSectionIssues,
  bganimSectionBytes,
  bganimSectionSlotsAllowed,
  viewsEmitted,
  bandIsDefaultOff,
  BGANIM_SECTION_CEILING,
  BGANIM_COUNT_BYTES,
  BGANIM_RECORD_BYTES,
  BGANIM_BYTES_PER_SLOT,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BGANIM_PHASE_BANKS,
  BG_TILE_CAPACITY,
  BG_LAYOUT_WORDS,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  TILE_WIDTH_PX,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';

/**
 * THE SECOND BUDGET: the emitted `ojz_bg_anim` section, in ROM BYTES.
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * `BG_TILE_CAPACITY` is not the only ceiling on a BG override document, and it
 * is not the one that binds. aeon's `check_bganim_section_fits` raises
 * `SystemExit` when the emitted animation section exceeds
 * `BGANIM_SECTION_CEILING`, an owner-ruled authoring budget inside the ROM room,
 * and Aurora did not model that quantity at all. The two budgets diverge because
 * an ANIMATED slot is stored once per phase bank: it costs ONE entry against the
 * tile capacity and `BGANIM_BYTES_PER_SLOT` against the section ceiling.
 *
 * MEASURED BEFORE THE FIX, at aeon 78c994235fc51c54e2b03c075eda566123d6a02b, on
 * the same fixture shape this file builds: a document whose one tile animation
 * covered a number of slots the tile capacity plainly admits was ACCEPTED by
 * `validateBgOverride` and would have been REFUSED by the build. The whole
 * capacity's worth was accepted too, five times over the section budget. The
 * pair of rows under "the load-bearing proof" is that measurement, kept.
 *
 * ═══ EVERY NUMBER HERE IS DERIVED ═══
 *
 * Nothing below types a byte count, a ceiling or a slot count. Each expectation
 * re-derives aeon's own formula from the vendored constants, which are read from
 * `bganim-consumer-contract.json` and held to aeon's source by
 * `bg-override-contract-currency.test.ts`. So an owner re-ruling the ceiling
 * MOVES these fixtures rather than reddening them.
 *
 * ═══ THE QUANTIFIER, WHICH IS THE PART THAT CATCHES PEOPLE ═══
 *
 * `views_emitted` is quantified over the ACT, not over the bands that carry
 * `default_off`. aeon's contract says so in as many words: "the constraint is on
 * the ACT'S BAND COUNT, not on how many bands carry the key ... a per-key
 * validator naturally checks 'is default_off consistent across the bands' and
 * passes a two-band act that this build refuses". The `default_off` block below
 * asserts BOTH readings, including the two-band act in which BOTH bands carry
 * the key, which the natural-but-wrong validator would wave through.
 */

// ── Fixture builders — the same shape bg-override.test.ts established ───────

function tile(fill: number): number[] {
  return Array.from({ length: TILE_PIXELS }, () => fill % (TILE_PIXEL_MAX + 1));
}

function tiles(count: number): number[][] {
  return Array.from({ length: count }, (_, i) => tile(i + 1));
}

/**
 * A band prefix-identical to `blob[slotBase ...]` by construction, `rows` wide
 * enough to keep `rows * TILE_BYTES` a power of two (1 always is).
 */
function band(blob: number[][], slotBase: number, cols: number, rows: number,
              extra: Partial<BgOverrideBand> = {}): BgOverrideBand {
  const n = cols * rows;
  const rest = blob.slice(slotBase, slotBase + n);
  return {
    cols,
    rows,
    pattern_px: cols * TILE_WIDTH_PX,
    phases: Array.from({ length: BGANIM_PHASE_BANKS }, (_, p) =>
      p === 0 ? rest.map(t => [...t]) : rest.map(t => t.map(v => (v + p) % (TILE_PIXEL_MAX + 1)))),
    ...extra,
  } as BgOverrideBand;
}

/** A whole document carrying one `cols x 1` band packed at slot 0. */
function oneBandDoc(cols: number): BgOverrideDocument {
  const blob = tiles(cols);
  return {
    layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0),
    tiles: blob,
    anims: [band(blob, 0, cols, 1)],
  };
}

/** aeon's own formula, re-derived here so the codec is compared to a rule. */
function expectedBytes(bands: number, slots: number, views: number): number {
  const table = BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES * bands;
  return table + views * table + slots * BGANIM_BYTES_PER_SLOT;
}

/** Apply an add command's result the way the command layer would, for a chain. */
function applyAdd(doc: BgOverrideDocument, cmd: { band: BgOverrideBand }): BgOverrideDocument {
  return insertBand(doc, planBandInsertion(doc, cmd.band), cmd.band);
}

/** Slots the ceiling admits for an act of `bands` bands emitting `views` twins. */
function slotsAllowed(bands: number, views: number): number {
  const table = BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES * bands;
  return Math.floor((BGANIM_SECTION_CEILING - table - views * table) / BGANIM_BYTES_PER_SLOT);
}

// ── The arithmetic ──────────────────────────────────────────────────────────

describe('bganimSectionBytes: aeon\'s section-size formula', () => {
  it('an act with no bands is the disabled stub: the count word and nothing else', () => {
    expect(bganimSectionBytes([])).toEqual({ ok: true, value: BGANIM_COUNT_BYTES });
  });

  it('one band costs the count word, one record, and its slots', () => {
    const slots = 12;
    expect(bganimSectionBytes([{ cols: slots, rows: 1 }]))
      .toEqual({ ok: true, value: expectedBytes(1, slots, 0) });
  });

  it('a second band adds a record, and the slot term is the ACT\'S TOTAL', () => {
    // THE LIMIT IS NEVER PER BAND. aeon's own comment records a per-band cap
    // being tried and refuted by this zone's shipped content, whose two bands
    // pass any generous per-band limit while their SUM does not.
    const a = { cols: 8, rows: 4 };
    const b = { cols: 16, rows: 4 };
    const total = a.cols * a.rows + b.cols * b.rows;
    expect(bganimSectionBytes([a, b])).toEqual({ ok: true, value: expectedBytes(2, total, 0) });
  });

  it('the expensive term is the slots, not the records', () => {
    // Anti-vacuous framing for the whole file: if a record cost as much as a
    // slot, the byte budget would be about band count and the panel's existing
    // band readout would already have covered it.
    expect(BGANIM_BYTES_PER_SLOT).toBeGreaterThan(BGANIM_RECORD_BYTES);
  });
});

describe('bganimSectionSlotsAllowed: what the ceiling leaves for art', () => {
  it('is the ceiling minus the tables, floored, per slot', () => {
    for (let bands = 1; bands <= 4; bands++) {
      const shape = Array.from({ length: bands }, () => ({ cols: 1, rows: 1 }));
      expect(bganimSectionSlotsAllowed(shape))
        .toEqual({ ok: true, value: slotsAllowed(bands, 0) });
    }
  });

  it('is FAR below the tile capacity, which is the whole finding', () => {
    // The two budgets are independent, and this is the relation that makes the
    // tile readout an overstatement rather than an approximation. Asserted as a
    // relation, never as either number.
    const allowed = bganimSectionSlotsAllowed([{ cols: 1, rows: 1 }]);
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.value).toBeLessThan(BG_TILE_CAPACITY);
  });
});

// ── The load-bearing proof ──────────────────────────────────────────────────

describe('THE LOAD-BEARING PROOF: a document between the two budgets', () => {
  const fits = slotsAllowed(1, 0);

  it('the fixture pair is BETWEEN the budgets, so the tile ceiling cannot explain either verdict', () => {
    // ANTI-VACUOUS, and it is the reason the pair below proves anything: both
    // documents are well inside `BG_TILE_CAPACITY`, so a refusal can only be
    // the section ceiling talking.
    expect(fits + 1).toBeLessThanOrEqual(BG_TILE_CAPACITY);
    // The TILE ceiling's own refusal, by its own words, must be absent. (Not
    // the phrase "tile capacity", which the SECTION refusal deliberately says
    // too, in the sentence explaining that the two budgets are different.)
    expect(bgOverrideSectionIssues(oneBandDoc(fits + 1)).join('\n'))
      .not.toContain('over the BG tile capacity');
  });

  it('BOTH documents are WELL-FORMED, which is the other half of "two questions"', () => {
    // `validateBgOverride` answers "would this bake correct art"; the section
    // ceiling answers "will it fit". Keeping them apart is what lets Aurora open
    // and save a document that arrived over budget — and it is why the row below
    // has to ask the second question by name rather than expecting the first to
    // have grown an opinion.
    expect(validateBgOverride(oneBandDoc(fits))).toEqual([]);
    expect(validateBgOverride(oneBandDoc(fits + 1))).toEqual([]);
  });

  it('ACCEPTS an act at exactly the slots the section admits', () => {
    expect(bgOverrideSectionIssues(oneBandDoc(fits))).toEqual([]);
  });

  it('REFUSES one slot more, and says which budget and by how much', () => {
    const issues = bgOverrideSectionIssues(oneBandDoc(fits + 1));
    expect(issues).toHaveLength(1);
    const said = issues[0];
    // The size, the ceiling, the per-slot cost and what DOES fit: an author who
    // cannot see the arithmetic cannot argue with the number, and this refusal
    // replaces one that did not exist at all.
    expect(said).toContain(String(expectedBytes(1, fits + 1, 0)));
    expect(said).toContain(String(BGANIM_SECTION_CEILING));
    expect(said).toContain(String(BGANIM_BYTES_PER_SLOT));
    expect(said).toContain(`ceiling allows ${fits}`);
    expect(said).toContain('SECOND budget');
  });

  it('REFUSES a blob-filling act, which the tile ceiling accepts by definition', () => {
    // The strongest form of the same point: a document at EXACTLY the tile
    // capacity satisfies `capacity` perfectly and is multiples over the section.
    const doc = oneBandDoc(BG_TILE_CAPACITY);
    expect((doc.tiles as number[][]).length).toBe(BG_TILE_CAPACITY);
    expect(validateBgOverride(doc)).toEqual([]);          // well-formed, and…
    expect(bgOverrideSectionIssues(doc)).toHaveLength(1);  // …multiples over budget
  });

  it('AND THE DOOR REFUSES IT: createBand will not build a band this large', () => {
    // The proof that matters to an author, at the surface that offers the work.
    // At HEAD (aurora 08f5fe6b) `createBand` built both of these without a word.
    expect(() => createBand({ cols: fits, rows: 1 })).not.toThrow();
    expect(() => createBand({ cols: fits + 1, rows: 1 })).toThrow(/ROM section ceiling/);
  });
});

// ── default_off, and the per-act quantifier ─────────────────────────────────

describe('default_off: the twins are decided PER ACT, not per band', () => {
  const period = BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX;   // cols, in tiles

  it('no band carrying the key emits no twins', () => {
    expect(viewsEmitted([{ cols: 4, rows: 1 }])).toEqual({ ok: true, value: 0 });
  });

  it('one band at the derived period emits BGANIM_VIEW_COUNT twins', () => {
    expect(viewsEmitted([
      { cols: period, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true },
    ])).toEqual({ ok: true, value: BGANIM_VIEW_COUNT });
  });

  it('and the twins COST section bytes: a table each, over the shared blob', () => {
    const b = {
      cols: period, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true,
    };
    expect(bganimSectionBytes([b]))
      .toEqual({ ok: true, value: expectedBytes(1, period, BGANIM_VIEW_COUNT) });
    // The blob is SHARED across the twins, so the slot term is paid once. If it
    // multiplied, the twins would cost more than the art they preview.
    const withoutTwins = expectedBytes(1, period, 0);
    expect(expectedBytes(1, period, BGANIM_VIEW_COUNT) - withoutTwins)
      .toBe(BGANIM_VIEW_COUNT * (BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES));
  });

  it('⚠ REFUSES a two-band act in which BOTH bands carry the key', () => {
    // THE TRAP. A validator asking "do the bands AGREE about default_off?" says
    // yes here and passes a document aeon refuses. The rule is on the act's band
    // count, so this must refuse.
    const b = {
      cols: period, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true,
    };
    const r = viewsEmitted([b, { ...b }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('EXACTLY ONE');
    expect(r.reason).toContain('does not satisfy it');
  });

  it('REFUSES a two-band act in which only one carries it, for the same reason', () => {
    const r = viewsEmitted([
      { cols: period, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true },
      { cols: 4, rows: 1 },
    ]);
    expect(r.ok).toBe(false);
  });

  it('REFUSES a single default_off band at any other pattern period', () => {
    const wrong = period * 2;
    const r = viewsEmitted([
      { cols: wrong, rows: 1, pattern_px: wrong * TILE_WIDTH_PX, default_off: true },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain(String(BGANIM_VIEW_DERIVED_PERIOD_PX));
  });

  it('reads the key the way the consumer does: truthy, not `=== true`', () => {
    // aeon coerces with `bool(...)`, so a 1 is on. The codec refuses a
    // non-boolean on the WRITE path (below) rather than relying on either
    // reading, but the arithmetic must not disagree with the build about a
    // document that reached us from elsewhere.
    expect(bandIsDefaultOff({ cols: 1, rows: 1, default_off: 1 })).toBe(true);
    expect(bandIsDefaultOff({ cols: 1, rows: 1, default_off: false })).toBe(false);
    expect(bandIsDefaultOff({ cols: 1, rows: 1 })).toBe(false);
  });

  it('validateBgOverride refuses a non-boolean default_off', () => {
    const doc = oneBandDoc(4);
    // THROUGH A CAST, because `default_off` is typed `boolean | undefined` on
    // BgOverrideBand now that Aurora authors it. The poison is deliberate and
    // the cast says so: a document that reached us from somewhere else can
    // carry any JSON value here, which is the case this row is about.
    (doc.anims as BgOverrideBand[])[0].default_off = 'yes' as unknown as boolean;
    expect(validateBgOverride(doc).join('\n')).toContain('must be true or false');
  });

  it('the act-level refusal is reported once, for the document', () => {
    const blob = tiles(period * 2);
    const doc: BgOverrideDocument = {
      layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0),
      tiles: blob,
      anims: [
        band(blob, 0, period, 1, { default_off: true, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX }),
        band(blob, period, period, 1,
          { default_off: true, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX }),
      ],
    };
    const issues = bgOverrideSectionIssues(doc);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('the build refuses this act');
  });
});

// ── Loud on unmeasurable, in the SAFE direction ─────────────────────────────

describe('an act the build refuses has NO section size, and never a generous one', () => {
  const refused = [
    { cols: 8, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true },
    { cols: 8, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true },
  ];

  it('bganimSectionBytes answers with the refusal, not a number', () => {
    expect(bganimSectionBytes(refused).ok).toBe(false);
  });

  it('bganimSectionSlotsAllowed does too, rather than falling back to the ceiling', () => {
    // ⚠ THE DIRECTION IS THE POINT. Answering "could not tell" with a budget
    // would reproduce, one layer down, exactly the permissive failure this
    // parcel exists to fix.
    const r = bganimSectionSlotsAllowed(refused);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('value');
  });
});

// -- DO NO HARM: the door refuses GROWTH, never the repair -------------------

describe('an act already over the ceiling: growth refused, shrinking allowed', () => {
  /**
   * THE FIXTURE ITSELF IS THE SUBJECT HERE, over-budget and all.
   *
   * `editor_bg_override.b0e5a661.json` is aeon's historical two-band act, and
   * its emitted section is multiples of the ceiling. An author can have such a
   * document: it exists on disk in this repo. What Aurora must never do is make
   * it worse, and what it must never do EITHER is refuse to make it better -
   * a rule stated as "the result must fit" would kill demote and remove and
   * leave hand-edited JSON as the only way out.
   */
  const over = b0e5a661Doc();

  it('the fixture really is over, so nothing below is vacuous', () => {
    expect(bgOverrideSectionIssues(over)).toHaveLength(1);
    expect(documentBands(over).length).toBeGreaterThan(1);
  });

  it('REFUSES an add, however small', () => {
    // One slot. The refusal is about the ACT, not about what this edit costs.
    expect(() => makeAddBandCommand(over, createBand({ cols: 1, rows: 1 })))
      .toThrow(/ROM section ceiling/);
  });

  it('REFUSES a promotion, for the same reason', () => {
    const base = animatedSlotCount(documentBands(over));
    expect(() => makePromoteBandCommand(
      over, bandFromStaticTiles(over, base, { cols: 1, rows: 1 }), base))
      .toThrow(/ROM section ceiling/);
  });

  it('ALLOWS a demotion: the repair path, which a fits-or-refuse rule would kill', () => {
    expect(() => makeDemoteBandCommand(over, 0)).not.toThrow();
  });

  it('ALLOWS a removal too', () => {
    expect(() => makeRemoveBandCommand(over, 0, { blankReferencingCells: true })).not.toThrow();
  });
});

describe('an act that FITS: the door refuses the edit that would take it over', () => {
  /**
   * A NEARLY EMPTY DOCUMENT, and the reason is the other budget.
   *
   * The real fixture carries 340 tiles, so the TILE ceiling binds long before
   * the section one does on it - an insert of the section's whole allowance
   * would be refused for having nowhere to put the art, and the rows below
   * would be measuring the wrong budget while saying "section". A one-tile blob
   * leaves the tile budget out of the way so the refusals here can only be the
   * section talking; the fixture's own over-budget state is exercised in the
   * block above, where it is the point.
   */
  const roomy = (): BgOverrideDocument => ({
    layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0),
    tiles: tiles(1),
  });

  it('the starting document fits and has tile room, so nothing below is the other budget', () => {
    expect(bgOverrideSectionIssues(roomy())).toEqual([]);
    expect(BG_TILE_CAPACITY - roomy().tiles.length).toBeGreaterThan(slotsAllowed(1, 0) * 2);
  });

  it('accepts the largest band the section admits, and refuses one slot more', () => {
    const room = slotsAllowed(1, 0);
    expect(() => makeAddBandCommand(roomy(), createBand({ cols: room, rows: 1 }))).not.toThrow();
    // One slot over, and it is `createBand` that says so first - a band this
    // size cannot exist in any act at all.
    expect(() => createBand({ cols: room + 1, rows: 1 })).toThrow(/ROM section ceiling/);
  });

  it('and refuses a SECOND band whose own size is legal but whose SUM is not', () => {
    // THE CASE A PER-BAND CAP MISSES, which is aeon's own recorded error. Each
    // band is under the ceiling; together they are not, and only the act-level
    // comparison can see it.
    const half = Math.ceil(slotsAllowed(2, 0) / 2) + 1;
    expect(() => createBand({ cols: half, rows: 1 })).not.toThrow();   // legal alone
    const start = roomy();
    const one = makeAddBandCommand(start, createBand({ cols: half, rows: 1 }));
    const after = applyAdd(start, one);
    expect(bgOverrideSectionIssues(after)).toEqual([]);                // still fits
    expect(() => makeAddBandCommand(after, createBand({ cols: half, rows: 1 })))
      .toThrow(/ROM section ceiling/);
  });
});
