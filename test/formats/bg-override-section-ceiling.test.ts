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
  bganimViewTwinBytes,
  viewsEmitted,
  bandIsDefaultOff,
  BGANIM_SECTION_CEILING,
  BGANIM_COUNT_BYTES,
  BGANIM_RECORD_BYTES,
  BGANIM_BYTES_PER_SLOT,
  BGANIM_VIEW_COUNT,
  BGANIM_VIEW_DERIVED_PERIOD_PX,
  BGANIM_PHASE_BANKS,
  BGANIM_MAX_BANDS,
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

  /**
   * ⚠ THESE THREE ROWS ASSERTED A REFUSAL UNTIL aeon's DECOUPLE, AND NOW ASSERT
   * ITS ABSENCE. Both arms were `AssertionError`s in `inject_editor_bg.py` and
   * neither raises since aeon `364b7bce`; the same conditions decide whether the
   * twins are EMITTED. The contract's own instruction: *"Read each item as 'if
   * this does not hold, `views_emitted()` returns 0', never as 'the build
   * refuses'."*
   *
   * A BARE `{ ok: true, value: 0 }` WOULD ALSO PASS ON A GUTTED FUNCTION, so each
   * row is paired against the shape that must still get its twins — the two
   * answers have to DIFFER, which a stub returning one constant cannot do.
   */
  const shipped = {
    cols: period, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true,
  };

  it('⚠ a two-band act in which BOTH bands carry the key gets NO twins, and builds', () => {
    // THE TRAP, UNCHANGED. A validator asking "do the bands AGREE about
    // default_off?" says yes here and predicts twins. The rule is on the act's
    // BAND COUNT, so this must be zero — and the cost of the wrong answer is now
    // a size error rather than a build failure.
    expect(viewsEmitted([shipped, { ...shipped }])).toEqual({ ok: true, value: 0 });
    expect(bganimViewTwinBytes([shipped, { ...shipped }])).toBe(0);
    // DIFFERENTIAL: the one-band act still gets them, so nothing here is a stub.
    expect(viewsEmitted([shipped])).toEqual({ ok: true, value: BGANIM_VIEW_COUNT });
  });

  it('a two-band act in which only one carries it gets no twins either', () => {
    expect(viewsEmitted([shipped, { cols: 4, rows: 1 }])).toEqual({ ok: true, value: 0 });
  });

  it('a single default_off band at any other pattern period gets no twins', () => {
    const wrong = period * 2;
    const b = { cols: wrong, rows: 1, pattern_px: wrong * TILE_WIDTH_PX, default_off: true };
    // Anti-vacuous: it really is a period the V twin's shift was not derived at.
    expect(b.pattern_px).not.toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
    expect(viewsEmitted([b])).toEqual({ ok: true, value: 0 });
    expect(bganimViewTwinBytes([b])).toBe(0);
  });

  /**
   * THE COST OF THE TWINS, AS ITS OWN DERIVATION. `bganimViewTwinBytes` is what
   * every author-facing sentence about the debug/release difference calls, so it
   * gets a row of its own rather than being implied by the section arithmetic.
   */
  it('bganimViewTwinBytes is the act table paid once per twin, and 0 when they decline', () => {
    expect(bganimViewTwinBytes([shipped]))
      .toBe(BGANIM_VIEW_COUNT * (BGANIM_COUNT_BYTES + BGANIM_RECORD_BYTES));
    expect(bganimViewTwinBytes([{ cols: 4, rows: 1 }])).toBe(0);
    // And it is exactly the gap between the two section figures for one act.
    expect(bganimSectionBytes([shipped]))
      .toEqual({ ok: true, value: expectedBytes(1, period, 0) + bganimViewTwinBytes([shipped]) });
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

  /**
   * ⚠ THIS ROW USED TO ASSERT ONE ACT-LEVEL REFUSAL AND NOW ASSERTS SILENCE.
   * The same document — two bands, both silenced, both at the derived period —
   * was a document aeon refused and is now one it builds without twins. Nothing
   * is wrong with it, so a reader must be told nothing about it.
   *
   * ANTI-VACUOUS: an empty issue list is what a broken `bgOverrideSectionIssues`
   * returns too, so the row proves the function still speaks by handing it an act
   * that IS over the ceiling and requiring the ceiling sentence back.
   */
  it('a two-band silenced act draws no notice at all, and the ceiling still does', () => {
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
    expect(bgOverrideSectionIssues(doc)).toEqual([]);
    // The instrument is alive: an act over the byte ceiling still says so.
    const over = tiles(BGANIM_SECTION_CEILING);
    const big: BgOverrideDocument = {
      layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0),
      tiles: over,
      anims: [band(over, 0, over.length, 1, {})],
    };
    expect(bgOverrideSectionIssues(big).join('\n')).toContain('over the ROM section');
  });
});

// ── Loud on unmeasurable, in the SAFE direction ─────────────────────────────

describe('the act that used to have NO section size now has one, and it is smaller', () => {
  const twoSilenced = [
    { cols: 8, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true },
    { cols: 8, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX, default_off: true },
  ];

  /**
   * ⚠ THE SAFE-DIRECTION MACHINERY IS NOT DELETED, IT IS UNREACHABLE. `viewsEmitted`
   * was the only thing in this codec that could make a size REFUSE, and it no
   * longer does, so `BgAnimSizeResult`'s `ok: false` arm has no producer today.
   * `bandBudget` still collapses an unmeasurable section to ZERO rather than to
   * the looser tile budget — that is the defect the section-ceiling parcel landed
   * against and it is still the rule; there is simply nothing left to trigger it
   * from a document. Said here rather than left for a reader to infer from a
   * describe block that quietly stopped existing.
   */
  it('bganimSectionBytes answers with a number for a two-band silenced act', () => {
    const r = bganimSectionBytes(twoSilenced);
    expect(r.ok).toBe(true);
    // AND IT IS THE NO-TWINS FIGURE. A codec that had kept predicting twins for
    // this shape would be exactly `bganimViewTwinBytes` of a ONE-band act higher,
    // which is the size error aeon's contract names.
    const slots = twoSilenced.reduce((n, b) => n + b.cols * b.rows, 0);
    expect(r.ok && r.value).toBe(expectedBytes(twoSilenced.length, slots, 0));
    expect(bganimViewTwinBytes(twoSilenced)).toBe(0);
  });

  it('bganimSectionSlotsAllowed answers too, at the two-band table size', () => {
    const r = bganimSectionSlotsAllowed(twoSilenced);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toBeGreaterThan(0);
  });

  /**
   * ⚠ THE CENSUS BEHIND "UNREACHABLE", so the word is a measurement rather than
   * a recollection of a report.
   *
   * The two rows above show two acts that no longer refuse. That is not the
   * claim `BgAnimSizeResult`'s docblock makes, and the difference matters to
   * anyone deciding whether the `!ok` branches can be deleted: the claim is that
   * NO input refuses, because `viewsEmitted` — the codec's only producer of a
   * refused size — has no failing arm left at all.
   *
   * WHAT THIS SWEEPS is every input `viewsEmitted` can distinguish: the band
   * COUNT across and past the ceiling (its per-act arm), `default_off`
   * true/false/absent on every band independently (its truthiness read), and
   * `pattern_px` at the derived period, off it, and missing (its per-band arm) —
   * the full cross product of all three. Nothing else in the function is read.
   *
   * WHAT IT DOES NOT SWEEP, stated rather than implied: non-boolean truthy
   * values for `default_off` (the coercion the codec deliberately mirrors) get
   * two explicit checks below instead of a place in the product, and the
   * geometry keys are fixed at 1x1 because `viewsEmitted` never reads them.
   *
   * ⚠ AND WHEN THIS ROW GOES RED IT IS NOT NECESSARILY A DEFECT. A future aeon
   * revision may make a size refuse again — that is what the `!ok` arm is FOR.
   * The failure means the docblock's "no producer today" has expired and the
   * dead-branch labels pointing at it have to come down, not that the new
   * refusal is wrong.
   */
  /*
   * TIMEOUT RAISED 2026-09-08, and the number is DERIVED rather than picked.
   *
   * This row is an exhaustive census, so its cost is real work rather than a
   * wait, and its duration therefore scales with how busy the machine is. It
   * runs in ~1.8s on an idle box and was measured at 6.0s with one agent
   * building concurrently, which is over vitest's 5s default. So it failed a
   * landing twice in a row for a reason that has nothing to do with the code it
   * guards, and BOTH TIMES IT LOOKED EXACTLY LIKE A REAL RED: a named row in a
   * failing file, with a merge sitting on the tree.
   *
   * A load-dependent limit makes a gate that reddens a landing at random, which
   * is worse than a slow gate: a red nobody can attribute teaches people to
   * re-run rather than to read. 30s is about five times the loaded measurement,
   * which leaves headroom for a busier box without letting a genuine hang sit
   * for a minute.
   *
   * ⚠ IF THIS ROW EVER TIMES OUT AT 30s, DO NOT RAISE IT AGAIN. At that point
   * the census has grown or something in it has become genuinely slow, and the
   * answer is to measure what changed, not to buy another multiple.
   */
  it('NO input refuses a size: the census behind the unreachable !ok arm', { timeout: 30_000 }, () => {
    const periods = [BGANIM_VIEW_DERIVED_PERIOD_PX, BGANIM_VIEW_DERIVED_PERIOD_PX + 1, undefined];
    const offs: unknown[] = [undefined, true, false];
    let checked = 0;
    for (let count = 0; count <= BGANIM_MAX_BANDS + 1; count++) {
      // Every assignment of (default_off, pattern_px) to the `count` bands.
      const combos = offs.length * periods.length;
      for (let mask = 0; mask < combos ** count; mask++) {
        let m = mask;
        const bands = Array.from({ length: count }, (): BgOverrideBand => {
          const off = offs[m % offs.length];
          const px = periods[Math.floor(m / offs.length) % periods.length];
          m = Math.floor(m / combos);
          return {
            cols: 1, rows: 1,
            ...(px !== undefined ? { pattern_px: px } : {}),
            ...(off !== undefined ? { default_off: off } : {}),
          } as unknown as BgOverrideBand;
        });
        expect(viewsEmitted(bands).ok).toBe(true);
        expect(bganimSectionBytes(bands).ok).toBe(true);
        expect(bganimSectionSlotsAllowed(bands).ok).toBe(true);
        checked++;
      }
    }
    // The coercion arm, kept out of the product so the product stays small.
    for (const off of [1, 'yes', {}]) {
      const b = [{ cols: 1, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX,
        default_off: off }] as unknown as BgOverrideBand[];
      expect(viewsEmitted(b)).toEqual({ ok: true, value: BGANIM_VIEW_COUNT });
      expect(bganimSectionBytes(b).ok).toBe(true);
    }
    // The sweep is not vacuous, and it really did reach both of viewsEmitted's
    // arms: an act that emits twins, and an act that declines them.
    expect(checked).toBeGreaterThan(0);
    expect(viewsEmitted([{ cols: 1, rows: 1, pattern_px: BGANIM_VIEW_DERIVED_PERIOD_PX,
      default_off: true } as unknown as BgOverrideBand]))
      .toEqual({ ok: true, value: BGANIM_VIEW_COUNT });
    expect(viewsEmitted([{ cols: 1, rows: 1 } as unknown as BgOverrideBand]))
      .toEqual({ ok: true, value: 0 });
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
