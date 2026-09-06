import { describe, it, expect } from 'vitest';
import {
  validateBgOverride,
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
    expect(validateBgOverride(oneBandDoc(fits + 1)).join('\n'))
      .not.toContain('over the BG tile capacity');
  });

  it('ACCEPTS an act at exactly the slots the section admits', () => {
    expect(validateBgOverride(oneBandDoc(fits))).toEqual([]);
  });

  it('REFUSES one slot more, and says which budget and by how much', () => {
    const issues = validateBgOverride(oneBandDoc(fits + 1));
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
    expect(validateBgOverride(doc)).toHaveLength(1);
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
    (doc.anims as BgOverrideBand[])[0].default_off = 'yes';
    expect(validateBgOverride(doc).join('\n')).toContain('must be true or false');
  });

  it('validateBgOverride reports the act-level refusal, once, for the document', () => {
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
    const issues = validateBgOverride(doc);
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
