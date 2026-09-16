/**
 * THE SEAM — Aurora's flattening against aeon's hand-typed Region rows.
 *
 * Aurora can read and write the regions document. Aeon can read the same
 * document and flatten it into the engine's Region table. Until this file
 * existed, NOTHING HAD EVER COMPARED THE TWO: each side had a codec, each side
 * had its own tests, and both could have been self-consistently wrong about the
 * same arithmetic forever. This is the leg across.
 *
 * WHAT MAKES IT NON-CIRCULAR, and it is the only reason the file is worth
 * anything. The expected rows in `ojz_act1.rows.json` were TYPED BY HAND out of
 * aeon's `act_descriptor.emp` call sites and the constants they name — not
 * produced by either flattener. Its own `_provenance.typed_by_hand_from` says
 * so. So a disagreement here is a FINDING about which side is wrong, and that
 * outranks a green: do not adjust `flatten.ts` toward the table, and do not
 * adjust the table toward `flatten.ts`.
 *
 * WHAT THE FIXTURE IS FOR, beyond being ten rectangles. Its `night` region
 * straddles the section line at x = 4096 with NEITHER edge on a multiple of the
 * 2048 section size, and `sec1`/`sec2` are off-grid because their spans are its
 * complement. A document whose regions all sat on the section grid could not
 * tell a correct flattener from one that quietly snapped to sections. The
 * straddle is asserted below as a property OF THE FIXTURE, so a re-vendor that
 * "tidies" it goes red instead of silently ending the coverage.
 *
 * WHAT A GREEN HERE DOES NOT MEAN, said so nobody reads it as more:
 *   * It is not a ROM comparison. Nothing here assembles, runs or reads a built
 *     table; the golden is aeon's transcription of the descriptor, not the
 *     bytes in a ROM.
 *   * It is the RELEASE shape, ten rows. The rows file's provenance records a
 *     DEBUG shape with an eleventh row (OJZ_E2_SNAP_ROWS) that also shortens
 *     `sec2`. A regions document has no way to say DEBUG — the contract schema
 *     is closed and carries no shape key, and the hub ruled on 2026-09-16
 *     (empyrean 39b8405) that it stays closed — so a disagreement with a DEBUG
 *     ROM is aeon's open item (REGIONS-GOLDEN-GAP) and NOT a flattener defect.
 *   * The `bg` half is the DEFAULT half only. Every row's background is the
 *     act's, so what the seam checks is the COLLAPSE — three document spellings
 *     to one engine value — and NOT the derived span, which no row exercises
 *     and neither side can compute (aeon's REGIONS-BG-GOLDEN-GAP). The `bg`
 *     block below says which of its rows have an aeon arm and which do not.
 *   * Three of aeon's six per-row rules are not restated on this side at all
 *     (REGION_MIN_SPAN and the reachable-edge family). Their bounds live in the
 *     act's `.emp` descriptor, which Aurora does not have. `flatten.ts`'s header
 *     says so at the point of use; a document green here can still be refused by
 *     aeon's build for one of those three.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseRegionsDocument, BG_ACT_SENTINEL } from '../../src/core/formats/regions/document';
import type { RegionsDocument } from '../../src/core/formats/regions/document';
import {
  flattenRegionsDocument,
  actExtentFromDocument,
  uncoveredRects,
  firstOverlap,
  areaOfRows,
  toInclusive,
  type RegionRow,
  type RegionTable,
  type ActBounds,
} from '../../src/core/formats/regions/flatten';
import { gitBlobSha } from '../support/peer-repo';

const FIXTURES = resolve(__dirname, '../fixtures/regions');
const DOC_PATH = resolve(FIXTURES, 'ojz_act1.regions.json');
const ROWS_PATH = resolve(FIXTURES, 'ojz_act1.rows.json');

const docBytes = readFileSync(DOC_PATH, 'utf8');
const rowsBytes = readFileSync(ROWS_PATH, 'utf8');

type Sidecar = { aeon: { revision: string; blob: string } };
const readSidecar = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as Sidecar;
const DOC_PIN = readSidecar(resolve(FIXTURES, 'ojz_act1.regions.provenance.json'));
const ROWS_PIN = readSidecar(resolve(FIXTURES, 'ojz_act1.rows.provenance.json'));

/** The golden's rows file, minus the prose block. */
type Golden = {
  act: string;
  act_w: number;
  act_h: number;
  rows: RegionRow[];
  _provenance: Record<string, string>;
};
const golden = JSON.parse(rowsBytes) as Golden;

/**
 * The SECTION SIZE, `1 << SECTION_SIZE_SHIFT` in the engine. Written as the
 * shift because that is what the engine writes, and because the straddle row
 * below is meaningless if this number is wrong: 2048 px is the grid the night
 * region exists to be off.
 */
const SECTION_SIZE = 1 << 11;

/**
 * Aeon's `ROW_KEYS` — the shared vocabulary, and every field the seam compares.
 *
 * ⚠ THIS LIST IS THE BLIND SPOT, AND IT WENT BLIND ONCE FOR REAL. It is a FIXED
 * TUPLE, so when aeon's golden grew a tenth field (`bg`, at `5713201`) and this
 * list did not, the ten `row N matches the golden on every field` rows below
 * stayed GREEN with the new field absent from our rows entirely — measured on
 * 2026-09-16, ten green rows over a table that had no `bg` at all. Only the
 * whole-table deep equality caught it. Both shapes are kept on purpose and
 * neither is redundant: the deep equality is the one that cannot go blind, the
 * per-field loop is the one that prints a legible failure. When aeon's ROW_KEYS
 * grows, THIS LINE IS THE EDIT, and the key-set assertion in the loop is what
 * fails until it is made.
 */
const ROW_KEYS = ['index', 'id', 'x0', 'x1', 'y0', 'y1', 'preset', 'sceneRef', 'rasterRef', 'bg'] as const;

describe('the vendored golden is the aeon blob its sidecars name', () => {
  // The pin of record for this file, the way regions-vectors.test.ts reads
  // `empyrean.blob`. Anti-vacuous: the recorded id is AEON'S object id, so
  // recomputing it from these bytes is a real comparison and not a tautology.
  // The CURRENCY question — has aeon moved on — is a different instrument and
  // lives in aeon-fixture-currency.test.ts, where both halves are registered.
  it('ojz_act1.regions.json hashes to the blob its provenance records', () => {
    expect(DOC_PIN.aeon.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(gitBlobSha(docBytes)).toBe(DOC_PIN.aeon.blob);
  });
  it('ojz_act1.rows.json hashes to the blob its provenance records', () => {
    expect(ROWS_PIN.aeon.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(gitBlobSha(rowsBytes)).toBe(ROWS_PIN.aeon.blob);
  });
  it('both halves of the golden are pinned at ONE aeon revision', () => {
    // A document from one aeon commit compared against rows from another
    // certifies nothing about either. Asserted rather than left to a re-vendor's
    // care, because the two sidecars are edited by hand.
    expect(DOC_PIN.aeon.revision).toBe(ROWS_PIN.aeon.revision);
  });
});

describe("AURORA'S OWN CODEC ACCEPTS AEON'S GOLDEN DOCUMENT", () => {
  /**
   * The first thing the seam can find, and it is a finding either way. Aurora's
   * contract schema is CLOSED at three levels (`unevaluatedProperties: false` on
   * the document, on a region and on `bg`), so a key aeon's golden carries that
   * Aurora's schema does not declare would be a REFUSAL here — a real
   * disagreement between the two halves of the contract, not a test to loosen
   * the schema past.
   */
  it('parses unchanged, with no key massaged and nothing dropped', () => {
    const parsed = parseRegionsDocument(docBytes, 'ojz_act1.regions.json');
    // Not a rebuild from a field list: `parseRegionsDocument` hands back the
    // object `JSON.parse` produced. So deep-equality against a bare parse is the
    // statement that the codec neither repaired nor erased anything.
    expect(parsed).toEqual(JSON.parse(docBytes));
    expect(parsed.act).toBe('ojz_act1');
    expect(parsed.schema).toBe(1);
    expect(parsed.regions).toHaveLength(golden.rows.length);
  });
});

/**
 * The parsed golden document and the flattened table, LAZY AND MEMOISED — not
 * module-level constants, and the difference is not style.
 *
 * Both of these can throw: `parseRegionsDocument` throws if Aurora's closed
 * schema ever refuses aeon's golden, and `flattenRegionsDocument` throws if the
 * document stops covering the act. Evaluated at module scope, either throw
 * happens during COLLECTION and vitest reports `Tests: no tests` — every row in
 * this file vanishes, including the ones whose whole job is to name what went
 * wrong. Measured, not reasoned about: breaking the inclusive conversion to
 * `x + w` on 2026-09-16 took all 29 rows out in one line and printed no row name
 * at all. Behind a function the same break fails the rows that USE the table and
 * leaves the fixture-property rows reporting.
 */
let docCache: RegionsDocument | null = null;
const doc = (): RegionsDocument => (docCache ??= parseRegionsDocument(docBytes, 'ojz_act1.regions.json'));

/**
 * THE ACT'S SIZE IS DERIVED HERE, NOT COPIED OUT OF THE ROWS FILE.
 *
 * The document carries no act size at all — `act_w`/`act_h` are `ACT_W`/`ACT_H`
 * in the act's `.emp` descriptor, which Aurora does not have — so `flatten.ts`
 * takes bounds as an argument and never derives them from the thing it is
 * checking. Reading 6144 out of the golden and handing it straight back would
 * make the `act_w` assertion a tautology.
 *
 * So the bounds handed to the flattener come from the DOCUMENT's own covered
 * extent, computed independently, and the assertion that they equal the golden's
 * numbers is then a real comparison of two derivations. It is not circular with
 * the coverage check either: a document with a hole in the middle has the same
 * extent and `uncoveredRects` still finds the hole.
 */
const derived = (): ActBounds => actExtentFromDocument(doc());
let tableCache: RegionTable | null = null;
const table = (): RegionTable => (tableCache ??= flattenRegionsDocument(doc(), derived(), 'ojz_act1.regions.json'));

describe('THE SEAM: our flattening reproduces aeon\'s hand-typed rows', () => {
  it("the act's size derived from the document equals the golden's act_w/act_h", () => {
    expect(derived().actW).toBe(golden.act_w);
    expect(derived().actH).toBe(golden.act_h);
  });


  it('ten regions in, ten rows out', () => {
    expect(golden.rows).toHaveLength(10);
    expect(table().rows).toHaveLength(10);
  });

  it('the whole table (act, act_w, act_h and every row) equals the golden', () => {
    // The one assertion the parcel is for (spec §5.4). WHOLE ROW OBJECTS, not a
    // projection: an EXTRA key on our side fails this too, which a field-by-field
    // loop over ROW_KEYS could never see.
    expect(table()).toEqual({
      act: golden.act,
      act_w: golden.act_w,
      act_h: golden.act_h,
      rows: golden.rows,
    });
  });

  // …and again per row, per field, because the message a single deep-equal over
  // ten rows prints on failure names the whole table and not the field that
  // moved. Same claim, legible failure.
  for (let i = 0; i < golden.rows.length; i++) {
    it(`row ${i} matches the golden on every field`, () => {
      const want = golden.rows[i];
      const got = table().rows[i];
      expect(got, `no row ${i} in our table`).toBeDefined();
      for (const k of ROW_KEYS) {
        // Scalar or object is DERIVED from the golden's own value rather than
        // from a second hand-written list of which keys are which: `bg` is an
        // object and `toBe` would compare identity across a JSON parse and a
        // fresh object and fail on every row for the wrong reason.
        const w = want[k] as unknown;
        if (w !== null && typeof w === 'object') {
          expect(got[k], `row ${i} (${want.id}): field ${k}`).toEqual(w);
        } else {
          expect(got[k], `row ${i} (${want.id}): field ${k}`).toBe(w);
        }
      }
      // No field outside the shared vocabulary. `name` is in the DOCUMENT and
      // must NOT be in a row: the engine never reads an author's label.
      expect(Object.keys(got).sort()).toEqual([...ROW_KEYS].sort());
    });
  }

  it('an absent binding is an EXPLICIT null key, never a missing one', () => {
    // Aeon's `load_act_regions` normalises every optional key to an explicit
    // None and says why: a caller comparing rows must not be able to pass by
    // reading a missing key as a null through `.get`. `toBe(null)` above cannot
    // tell the two apart in JS either — `undefined` fails it, but so would a key
    // that is simply absent from an object built another way. This is the row
    // that separates them.
    const absent = table().rows.filter(r => r.sceneRef === null);
    // Anti-vacuous: if the golden had no null bindings this would measure nothing.
    expect(absent.length, 'no row has a null sceneRef: this row measured nothing').toBeGreaterThan(0);
    for (const r of table().rows) {
      expect(Object.prototype.hasOwnProperty.call(r, 'sceneRef'), `row ${r.index} (${r.id})`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(r, 'rasterRef'), `row ${r.index} (${r.id})`).toBe(true);
    }
  });

  it('the bindings that are NOT null are carried across verbatim', () => {
    // The other half of the null row: a flattener that wrote `null` into every
    // binding would pass the one above. Counted from the GOLDEN, so the numbers
    // are derived and not typed.
    const scenes = golden.rows.filter(r => r.sceneRef !== null);
    const rasters = golden.rows.filter(r => r.rasterRef !== null);
    expect(scenes.length, 'the golden has no non-null sceneRef to check').toBeGreaterThan(0);
    expect(rasters.length, 'the golden has no non-null rasterRef to check').toBeGreaterThan(0);
    for (const want of scenes) {
      expect(table().rows[want.index].sceneRef, `row ${want.index} (${want.id}) sceneRef`).toBe(want.sceneRef);
    }
    for (const want of rasters) {
      expect(table().rows[want.index].rasterRef, `row ${want.index} (${want.id}) rasterRef`).toBe(want.rasterRef);
    }
  });

  it('area and disjointness are the engine\'s own two numbers', () => {
    expect(areaOfRows(table().rows)).toBe(golden.act_w * golden.act_h);
    const rects = table().rows.map(r => [r.x0, r.y0, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1] as const);
    expect(firstOverlap(rects)).toBeNull();
    expect(uncoveredRects(rects, golden.act_w, golden.act_h)).toEqual([]);
  });
});

/**
 * THE COLLAPSE — three document spellings, one engine fact.
 *
 * THE CONTRACT RULE, in aeon's words (`_check_region_bg`, `5713201`): "this
 * region shows the act's background" is `Region.rg_bg_layout = 0`, and the
 * document may say it THREE ways — `bg` absent, `bg.layoutRef` explicitly
 * `null`, and `bg.layoutRef` the sentinel `"@act"`. All three must flatten to
 * `{ layoutRef: null, span: null }`. A flattener that copied `"@act"` through
 * would put a STRING where the engine dereferences a POINTER.
 *
 * ⚠ HOW THESE ROWS AVOID PROVING ONLY THAT THE FUNCTION IS DETERMINISTIC. The
 * tempting shape is to flatten all three spellings through Aurora and assert the
 * three results agree. That proves nothing: three calls into one helper agree by
 * construction, and all three could be wrong together. So EVERY row below
 * anchors at least one arm on AEON'S INDEPENDENTLY PRODUCED VALUE — the rows
 * golden, whose own provenance records that it was typed by hand out of the
 * `.emp` call sites and NOT generated by either flattener. Aurora-to-Aurora
 * agreement appears nowhere as a claim of correctness.
 *
 * ⚠ AND WHAT THESE ROWS CANNOT REACH, named rather than implied away. Every
 * `bg` in the golden is `{null, null}`, because no shipped region has a
 * background of its own and aeon's generator refuses one outright. So a
 * flattener that IGNORED `bg` and hard-coded `{null, null}` is green against the
 * whole golden. The last row in this block is the only thing standing between
 * that flattener and a green suite, and it is an AURORA-ONLY claim with no aeon
 * arm — there is no golden row to anchor it to, because aeon refuses the
 * document that would produce one. The DERIVED-SPAN half of the contract is
 * UNTESTED ON BOTH SIDES OF THE SEAM (aeon's REGIONS-BG-GOLDEN-GAP), and the
 * span row below says so as an assertion rather than a comment.
 */
describe('THE SEAM: the bg collapse, anchored on the golden', () => {
  /** The document's regions grouped by which of the three spellings they use. */
  const spellings = () => {
    const absent = doc().regions.filter(r => r.bg === undefined);
    const explicitNull = doc().regions.filter(r => r.bg !== undefined && r.bg.layoutRef === null);
    const sentinel = doc().regions.filter(r => r.bg?.layoutRef === BG_ACT_SENTINEL);
    return { absent, explicitNull, sentinel };
  };

  it('the vendored document still carries all THREE spellings', () => {
    // ANTI-VACUITY, AND IT IS THE LOAD-BEARING ROW OF THIS BLOCK. The rows file
    // cannot discriminate a collapse from a constant — all ten of its `bg`
    // values are identical. The DOCUMENT is where the discrimination lives, and
    // exactly two of its ten regions carry a `bg` at all. If a re-vendor drops
    // the `"@act"` on `sec0`, every other row here keeps comparing `bg` field
    // for field and stays green while proving strictly less. So the presence of
    // each spelling is asserted, and each assertion names what its loss costs.
    const { absent, explicitNull, sentinel } = spellings();
    expect(sentinel.length,
      'no region spells `bg.layoutRef` as "@act" any more: the sentinel collapse is now UNTESTED '
      + 'on this side, and every row below it passes vacuously').toBeGreaterThan(0);
    expect(explicitNull.length,
      'no region spells `bg.layoutRef` as an explicit null any more: explicit-null-equals-absent '
      + 'is now UNTESTED').toBeGreaterThan(0);
    expect(absent.length,
      'every region now carries a `bg` block: the absent spelling is UNTESTED').toBeGreaterThan(0);
    // The three are a partition of the ten: no region uses a fourth spelling
    // (a NAMED layout) that these rows would silently not cover.
    expect(absent.length + explicitNull.length + sentinel.length).toBe(doc().regions.length);
  });

  it('the SENTINEL "@act" flattens to the golden\'s null, and is not carried through', () => {
    // One arm is Aurora's flatten, the other is aeon's hand-typed row. The
    // expectation is READ FROM THE GOLDEN, never typed here, so this row is a
    // comparison across the seam and not a restatement of flatten.ts.
    const sentinel = spellings().sentinel;
    expect(sentinel.length, 'nothing to measure: see the anti-vacuity row above').toBeGreaterThan(0);
    for (const region of sentinel) {
      const i = doc().regions.indexOf(region);
      const want = golden.rows[i];
      expect(want.id, `golden row ${i} is not ${region.id}`).toBe(region.id);
      expect(table().rows[i].bg, `row ${i} (${region.id}): "@act" was not collapsed`).toEqual(want.bg);
      // Said as its own assertion because `toEqual` against an all-null golden
      // would also pass if the golden itself had been "tidied" to carry "@act".
      expect(table().rows[i].bg.layoutRef,
        `row ${i} (${region.id}): the sentinel reached the row as a STRING, where the engine `
        + 'dereferences a pointer').not.toBe(BG_ACT_SENTINEL);
    }
  });

  it('an EXPLICIT null and an ABSENT bg flatten to the same golden rows', () => {
    // The second mutation direction, and a DIFFERENT claim from the one above:
    // a flattener can collapse the sentinel correctly and still distinguish
    // `{}` from nothing (`region.bg?.layoutRef` vs `'bg' in region`), which is
    // an `undefined` reaching the row where a `null` belongs.
    const { absent, explicitNull } = spellings();
    expect(explicitNull.length, 'nothing to measure: see the anti-vacuity row above').toBeGreaterThan(0);
    expect(absent.length, 'nothing to measure: see the anti-vacuity row above').toBeGreaterThan(0);
    for (const region of [...absent, ...explicitNull]) {
      const i = doc().regions.indexOf(region);
      expect(table().rows[i].bg, `row ${i} (${region.id})`).toEqual(golden.rows[i].bg);
    }
  });

  it('bg is an EXPLICIT key with EXPLICIT null members on every row, never absent', () => {
    // `toEqual` cannot separate `{}` from `{layoutRef: undefined}` from a
    // missing key — the same trap the sceneRef row above exists for, one level
    // down. Aeon's `load_act_regions` normalises both members to an explicit
    // None; a row that omitted them would compare equal here and unequal under
    // a JSON round trip.
    for (const r of table().rows) {
      expect(Object.prototype.hasOwnProperty.call(r, 'bg'), `row ${r.index} (${r.id}) has no bg key`).toBe(true);
      expect(Object.keys(r.bg).sort(), `row ${r.index} (${r.id}) bg keys`).toEqual(['layoutRef', 'span']);
      expect(r.bg.layoutRef, `row ${r.index} (${r.id}) bg.layoutRef is undefined, not null`).not.toBe(undefined);
      expect(r.bg.span, `row ${r.index} (${r.id}) bg.span is undefined, not null`).not.toBe(undefined);
    }
  });

  it('EVERY golden span is null, so the DERIVED-SPAN rule is untested on both sides', () => {
    // NOT A PASSING CHECK — A STATED GAP, asserted so it cannot be forgotten and
    // so the day it stops being true this row is what says so. `bg.span` is
    // derived from the referenced layout's HEIGHT, and neither side can derive
    // it: aeon's layout library carries no height and refuses a named layout
    // outright, and Aurora's flatten has no library at all. When aeon publishes
    // a golden row with a non-default background this row goes red, and the
    // work it names is Aurora deriving the span rather than forwarding null.
    const spans = golden.rows.map(r => r.bg.span);
    expect(spans.length).toBe(10);
    expect(
      spans.filter(s => s !== null),
      'the golden now carries a NON-NULL bg.span. Aurora\'s flatten.ts does not derive a span '
      + 'from a layout height: it forwards the document\'s value and normalises absence to null. '
      + 'So the derived-span half of the contract is now OWED on this side. '
      + '(aeon REGIONS-BG-GOLDEN-GAP)',
    ).toEqual([]);
  });

  it('AURORA-ONLY, NO AEON ARM: a NAMED layout is not collapsed to null', () => {
    // ⚠ THIS ROW HAS ONE ARM AND IS NOT SEAM COVERAGE. It cannot be anchored on
    // the golden, because aeon's `_check_region_bg` REFUSES every `bg.layoutRef`
    // but `"@act"` and null, so no golden row with a named layout exists to
    // compare against. It is here for one reason: everything above is green
    // under a flattener that ignores `bg` and hard-codes `{null, null}`, because
    // every shipped row IS the default. This is the row that is not.
    //
    // The layout id is DERIVED FROM THE FIXTURE (a region's own id, a real
    // string from the vendored bytes that the widened `bg.layoutRef` pattern
    // accepts) rather than invented, so there is no literal here to drift.
    const named = doc().regions[0].id;
    const wounded: RegionsDocument = {
      ...doc(),
      regions: doc().regions.map((r, i) => (i === 0 ? { ...r, bg: { layoutRef: named } } : r)),
    };
    const row = flattenRegionsDocument(wounded, derived(), 'named-layout').rows[0];
    expect(row.bg.layoutRef,
      'a named layout was collapsed to null: only the sentinel "@act" collapses, and a flattener '
      + 'that nulls everything would pass every other row in this file').toBe(named);
    // And the collapse still applies to the sentinel in the same table, so the
    // two are not the same branch taken twice.
    expect(table().rows[0].bg.layoutRef).toBeNull();
  });
});

describe('the fixture still exercises what it exists for', () => {
  it('the night region straddles the section line, off-grid on BOTH edges', () => {
    // The case a naive fixture would miss, asserted as a property of the fixture
    // rather than trusted. If someone "tidies" the golden onto the section grid,
    // every other row in this file still passes and the fixture silently stops
    // exercising the thing it exists for. (Aeon asserts the same four facts on
    // its side; the pair is deliberate.)
    const night = golden.rows.find(r => r.id === 'night');
    expect(night, 'the golden has no `night` region any more').toBeDefined();
    expect(night!.x0, 'night no longer starts before the x = 4096 section line').toBeLessThan(2 * SECTION_SIZE);
    expect(night!.x1, 'night no longer reaches past the x = 4096 section line').toBeGreaterThanOrEqual(2 * SECTION_SIZE);
    expect(night!.x0 % SECTION_SIZE, 'night\'s left edge has been snapped to the section grid').not.toBe(0);
    expect((night!.x1 + 1) % SECTION_SIZE, 'night\'s right edge has been snapped to the section grid').not.toBe(0);
  });

  it('the two rows whose spans are night\'s complement are off-grid too', () => {
    // sec1 and sec2 exist in this shape BECAUSE night cuts into them. If their
    // widths ever became section multiples the document would be back on the
    // grid even with a straddling night.
    const doc1 = doc().regions.find(r => r.id === 'sec1')!;
    const doc2 = doc().regions.find(r => r.id === 'sec2')!;
    expect(doc1.rect.w % SECTION_SIZE, 'sec1 is back on the section grid').not.toBe(0);
    expect(doc2.rect.w % SECTION_SIZE, 'sec2 is back on the section grid').not.toBe(0);
  });

  it('the document and the rows file agree on their act and their count', () => {
    expect(golden.act).toBe(doc().act);
    expect(golden.rows).toHaveLength(doc().regions.length);
  });
});

describe('the instruments can actually produce a failing answer', () => {
  /**
   * ⚠ `uncoveredRects` RETURNING `[]` IS WHAT A CORRECT DOCUMENT PRODUCES AND
   * WHAT A BROKEN INSTRUMENT PRODUCES. The row above that asserts `[]` over the
   * golden is green under `return []`. So the hole is punched on purpose and the
   * list is required to NAME it. (Aeon's `test_uncovered_can_actually_find_a_hole`
   * exists for the same reason and says so in the same words.)
   */
  it('uncoveredRects finds a hole punched on purpose, and names where', () => {
    const holed = doc().regions
      .filter(r => r.id !== 'sec4')
      .map(r => [r.rect.x, r.rect.y, r.rect.w, r.rect.h] as const);
    const holes = uncoveredRects(holed, golden.act_w, golden.act_h);
    const sec4 = doc().regions.find(r => r.id === 'sec4')!.rect;
    expect(holes).toEqual([[sec4.x, sec4.y, sec4.w, sec4.h]]);
  });

  it('firstOverlap finds an overlap made on purpose, and names the pair', () => {
    // Same shape: `null` over the golden is what a correct document produces and
    // what `return null` produces.
    const rects = doc().regions.map(r => [r.rect.x, r.rect.y, r.rect.w, r.rect.h] as const);
    const clash = [...rects, rects[0]];
    expect(firstOverlap(clash)).toEqual([0, clash.length - 1]);
  });

  it('flattening refuses a document with a hole, rather than repairing it', () => {
    const wounded: RegionsDocument = {
      ...doc(),
      regions: doc().regions.filter(r => r.id !== 'sec4'),
    };
    expect(() => flattenRegionsDocument(wounded, derived())).toThrow(/belong to no region/);
  });

  it('flattening refuses a document whose regions overlap', () => {
    const wounded: RegionsDocument = { ...doc(), regions: [...doc().regions, doc().regions[0]] };
    expect(() => flattenRegionsDocument(wounded, derived())).toThrow(/overlap/);
  });
});

describe('the exclusive-to-inclusive conversion, stated on its own', () => {
  it('a one-pixel column is x0 === x1, never inverted', () => {
    // The off-by-one that a ten-row golden of 1344-px-wide rectangles would let
    // through in one direction only: `x1 = x + w` is caught by the golden, but a
    // conversion that special-cased w = 1 would not be.
    expect(toInclusive({ x: 7, y: 9, w: 1, h: 1 })).toEqual({ x0: 7, x1: 7, y0: 9, y1: 9 });
  });

  it('the conversion is x + w - 1 on both axes', () => {
    expect(toInclusive({ x: 3400, y: 0, w: 1400, h: 2048 }))
      .toEqual({ x0: 3400, x1: 4799, y0: 0, y1: 2047 });
  });
});
