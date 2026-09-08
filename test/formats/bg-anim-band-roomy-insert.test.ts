/**
 * ROADMAP item 24 — a BRAND-NEW band is INSERTABLE on a document aeon's own
 * generator wrote with free tile slots, and the editor's insert door takes it.
 *
 * Every earlier insertion row ran against the b0e5a661 fixture (a historical
 * document that already carried bands) or refused on a live document that was
 * saturated at the time. This
 * file's subject is `editor_bg_override.roomy.json`: the generator's OUTPUT at
 * the pinned aeon revision, from a source PNG simplified until the generator
 * itself printed `unique tiles: 320/320` — see the `.provenance.json` beside it.
 * It carries only `layout` + `tiles`, no bands, and it is the shape aeon's
 * band_reserve exists to produce.
 *
 * EVERY NUMBER IS DERIVED. The free count is `BG_TILE_CAPACITY - tiles.length`
 * with both operands read at runtime; the band geometry is computed from that
 * free count, so a re-generated fixture with a different tile count changes
 * the band under test rather than breaking the file. No "128" appears here.
 *
 * THE PICTURE DOES NOT CHANGE, and that is asserted the way item 27's rows
 * assert it: cell by cell over all 4096 nametable words through a resolver
 * written from aeon's `inject_editor_bg.py` nametable loop, not from the
 * module under test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EditHistory } from '../../src/core/editing/history';
import type { S4Level } from '../../src/core/editing/commands';
import { makeAddBandCommand } from '../../src/core/editing/bg-override-band';
import {
  BG_TILE_CAPACITY,
  BGANIM_BYTES_PER_SLOT,
  BGANIM_COUNT_BYTES,
  BGANIM_RECORD_BYTES,
  BGANIM_SECTION_CEILING,
  BGANIM_PHASE_BANKS,
  TILE_PIXELS,
  bandTileCount,
  cloneBgOverride,
  parseBgOverride,
  serializeBgOverride,
  type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';
import {
  createBand,
  documentBands,
  insertBand,
  planBandInsertion,
  tileSlotsRemaining,
} from '../../src/core/formats/bg-override/bg-anim-band';
import { insertUnavailableReason } from '../../src/renderer/providers/bg-anim-aeon';

const ROOMY_PATH = resolve(__dirname, '../fixtures/bg-override/editor_bg_override.roomy.json');
const PROVENANCE = JSON.parse(readFileSync(
  resolve(__dirname, '../fixtures/bg-override/editor_bg_override.roomy.provenance.json'), 'utf8'));
const ROOMY: BgOverrideDocument = parseBgOverride(readFileSync(ROOMY_PATH, 'utf8')).doc;
const ROOMY_BYTES = serializeBgOverride(ROOMY);

// ─── the independent instrument (aeon's nametable loop, quoted in
// bg-anim-band.test.ts) ────────────────────────────────────────────────────
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
  return tile === undefined ? { kind: 'dangling', attrs, idx } : { kind: 'tile', attrs, pixels: tile };
}
const renderAll = (doc: BgOverrideDocument): Cell[] => doc.layout.map((_, i) => resolveCell(doc, i));

function level(doc: BgOverrideDocument): S4Level {
  return { sections: [], bgOverride: doc } as unknown as S4Level;
}

/**
 * The free room, DERIVED: capacity minus what the generator wrote. `rows` is
 * the largest power of two whose column still fits, and `cols` is what is left
 * once rows are chosen — so `fitting` spends EXACTLY the free room and `over`
 * is the smallest band that does not fit.
 */
const FREE = BG_TILE_CAPACITY - ROOMY.tiles.length;
const ROWS = 4;

/**
 * ⚠ THE FREE ROOM IS TWO NUMBERS, AND THIS FILE USED TO KNOW ONLY ONE.
 *
 * `FREE` above is the TILE blob's free room. There is a second, independent and
 * on this fixture TIGHTER budget: the emitted `ojz_bg_anim` ROM section, where
 * an animated slot costs `BGANIM_BYTES_PER_SLOT` because it is stored once per
 * phase bank. `SECTION_FREE` is what that ceiling admits for a one-band act,
 * derived from the vendored constants exactly as aeon derives it.
 *
 * THIS FIXTURE IS WHERE THE DEFECT WAS MEASURED. `FREE` is the number the panel
 * printed and `SECTION_FREE` is the number the build would take, and the row
 * below called "the band that spends EXACTLY the free room" built the first
 * one: a band Aurora offered and `check_bganim_section_fits` refuses. The
 * boundary probes are on the BINDING budget now, and the gap between the two is
 * its own row.
 *
 * ⚠ AND WHICH OF THE TWO BINDS HAS SINCE FLIPPED, WHICH IS WHY NO ROW HERE MAY
 * NAME ONE. When this file was written `SECTION_FREE` (79) was the smaller and
 * the whole point was that the ROM section ran out before the blob did. aeon
 * then cut `BG_TILE_CAPACITY` twice on 2026-09-08 to pay for spring art (400 ->
 * 388 -> 376, out of the arena's unresident `band_reserve`), and on this fixture
 * `FREE` is now 56 against the section's 79: THE TILE CEILING IS THE TIGHTER ONE
 * AND THE PROSE ABOVE HAD IT BACKWARDS. Two rows asserted the old ordering
 * directly and went red at the re-vendor rather than at a code change, which is
 * the gate working.
 *
 * SO THE ORDERING IS DERIVED AND ASSERTED, NEVER ASSUMED. `BINDING_FREE` is the
 * min; `TILES_BIND` records which side won, so the boundary rows can say what
 * they are probing; and the ROM-section refusal is proved on a document built to
 * make the section bind (`sectionBoundDoc()`) rather than on this fixture, whose
 * tile room the next raid on the reserve will shrink again. The capacity is a
 * moving target with a structural cause — aeon's object tile neighbourhood is
 * spent, so this arena's reserve is the cheapest address space on the machine —
 * and a row that only works at one value of it is a row that breaks on aeon's
 * schedule.
 */
const SECTION_FREE = Math.floor(
  (BGANIM_SECTION_CEILING - BGANIM_COUNT_BYTES - BGANIM_RECORD_BYTES) / BGANIM_BYTES_PER_SLOT);
const BINDING_FREE = Math.min(FREE, SECTION_FREE);
/** Which budget is the binding one TODAY. Derived, so a re-vendor moves it. */
const TILES_BIND = FREE <= SECTION_FREE;

const FITTING = { cols: Math.floor(BINDING_FREE / ROWS), rows: ROWS };
const OVER = { cols: Math.floor(BINDING_FREE / ROWS) + 1, rows: ROWS };
/** The smallest band the TILE budget alone refuses. The other bound, kept. */
const OVER_TILES = { cols: Math.floor(FREE / ROWS) + 1, rows: ROWS };
/** A comfortable band, well inside the room, for the rows that do not probe the boundary. */
const SMALL = { cols: Math.max(1, Math.floor(BINDING_FREE / ROWS / 4)), rows: ROWS };

describe('the ROOMY fixture is what its provenance says', () => {
  it('is bandless, layout+tiles only, and has free room: the anti-vacuous floor', () => {
    expect(Object.keys(ROOMY).sort()).toEqual(['layout', 'tiles']);
    expect(documentBands(ROOMY)).toHaveLength(0);
    expect(ROOMY.tiles.length).toBe(PROVENANCE.fixture.tiles);
    expect(ROOMY.tiles.length).toBeLessThan(BG_TILE_CAPACITY);
    expect(FREE).toBeGreaterThan(0);
    // Every cell draws, over more than one image — so "the picture is unchanged"
    // below is a claim about 4096 real cells, not about blanks.
    const cells = renderAll(ROOMY);
    expect(cells.filter(c => c.kind === 'tile')).toHaveLength(ROOMY.layout.length);
    expect(new Set(cells.map(c => c.kind === 'tile' ? c.pixels.join(',') : '')).size).toBeGreaterThan(1);
    // The geometry under test really is derived, and really is at the boundary.
    expect(bandTileCount(FITTING)).toBeLessThanOrEqual(BINDING_FREE);
    expect(bandTileCount(OVER)).toBeGreaterThan(BINDING_FREE);
    expect(bandTileCount(SMALL)).toBeLessThan(bandTileCount(FITTING));
    // AND THE TWO BUDGETS REALLY DIVERGE ON THIS FIXTURE — which is what makes
    // the boundary rows below prove anything at all — WITHOUT THIS ROW CLAIMING
    // WHICH WAY. It asserted `SECTION_FREE < FREE` until aeon's 2026-09-08 cuts
    // took the capacity to 376 and inverted it; the ordering is now derived into
    // `TILES_BIND` and the only invariant left is that they are not equal, so
    // one of them is strictly the gate and `OVER` is strictly over it.
    expect(SECTION_FREE).toBeGreaterThan(0);
    expect(SECTION_FREE).not.toBe(FREE);
    expect(BINDING_FREE).toBe(Math.min(FREE, SECTION_FREE));
    expect(BINDING_FREE).toBe(TILES_BIND ? FREE : SECTION_FREE);
    // The looser budget really is looser, so a band at the binding boundary is
    // NOT at the other one — the gap the next row walks.
    expect(bandTileCount(FITTING)).toBeLessThan(Math.max(FREE, SECTION_FREE));
  });

  it('tileSlotsRemaining is BG_TILE_CAPACITY - tiles.length, before and after an insert', () => {
    expect(tileSlotsRemaining(ROOMY)).toBe(BG_TILE_CAPACITY - ROOMY.tiles.length);
    const band = createBand(SMALL);
    const after = insertBand(ROOMY, planBandInsertion(ROOMY, band), band);
    expect(tileSlotsRemaining(after)).toBe(BG_TILE_CAPACITY - after.tiles.length);
    expect(tileSlotsRemaining(after)).toBe(tileSlotsRemaining(ROOMY) - bandTileCount(band));
  });
});

describe('INSERTING a brand-new band on the roomy document', () => {
  it('accepts a band the prefix rule permits, grows the blob by exactly cols*rows, and puts the band at the front', () => {
    const l = level(cloneBgOverride(ROOMY));
    const h = new EditHistory();
    const band = createBand(SMALL);
    const n = bandTileCount(band);

    // The panel's own gate says yes before the command is asked.
    expect(insertUnavailableReason(ROOMY, SMALL.cols, SMALL.rows)).toBeNull();

    h.execute(makeAddBandCommand(l.bgOverride!, band), l);
    const after = l.bgOverride!;
    expect(documentBands(after)).toHaveLength(1);
    expect(after.tiles).toHaveLength(ROOMY.tiles.length + n);
    // THE PREFIX: slots 0..n ARE the band's phase 0, and every static tile follows behind.
    expect(after.tiles.slice(0, n)).toEqual(band.phases[0]);
    expect(after.tiles.slice(n)).toEqual(ROOMY.tiles);
    expect(documentBands(after)[0].phases).toHaveLength(BGANIM_PHASE_BANKS);
    expect(documentBands(after)[0].phases[0][0]).toHaveLength(TILE_PIXELS);
  });

  it('changes not one drawn cell (resolved through aeon\'s nametable loop) while every word moved', () => {
    const l = level(cloneBgOverride(ROOMY));
    const band = createBand(SMALL);
    new EditHistory().execute(makeAddBandCommand(l.bgOverride!, band), l);
    const after = l.bgOverride!;

    const before = renderAll(ROOMY);
    const now = renderAll(after);
    expect(now).toHaveLength(before.length);
    const differing = before.map((c, i) => [c, now[i], i] as const)
      .filter(([a, b]) => JSON.stringify(a) !== JSON.stringify(b)).map(([, , i]) => i);
    expect(differing).toEqual([]);
    expect(now.some(c => c.kind === 'dangling')).toBe(false);

    // Anti-vacuous: the band went to the FRONT, so every non-blank word had to be
    // renumbered. If the raw words had not moved, the row above would be
    // comparing a document to itself.
    const nonBlank = ROOMY.layout.filter(w => w !== 0).length;
    const moved = ROOMY.layout.filter((w, i) => w !== after.layout[i]).length;
    expect(nonBlank).toBeGreaterThan(0);
    expect(moved).toBe(nonBlank);
  });

  it('accepts the band that spends EXACTLY the BINDING free room, and one undo is byte-identical', () => {
    const l = level(cloneBgOverride(ROOMY));
    const h = new EditHistory();
    const band = createBand(FITTING);
    expect(insertUnavailableReason(ROOMY, FITTING.cols, FITTING.rows)).toBeNull();

    h.execute(makeAddBandCommand(l.bgOverride!, band), l);
    // The blob grew by exactly the band, up to the BINDING budget — which since
    // aeon's 2026-09-08 capacity cuts is the TILE budget on this fixture, so the
    // blob now lands exactly ON the capacity. While the section was the tighter
    // one this row left slots free that were reachable for static art and not for
    // ANIMATION. Both readings are asserted the same way, from the derived
    // numbers, which is why the row survived the inversion that broke two others.
    expect(l.bgOverride!.tiles).toHaveLength(ROOMY.tiles.length + bandTileCount(FITTING));
    expect(tileSlotsRemaining(l.bgOverride!)).toBe(FREE - bandTileCount(FITTING));
    h.undo(l);
    expect(serializeBgOverride(l.bgOverride!)).toBe(ROOMY_BYTES);
  });

  it('refuses the band one slot over the BINDING budget, naming whichever budget binds', () => {
    // THE BOUNDARY, ON THIS FIXTURE, WITHOUT NAMING WHICH CEILING. `OVER` is one
    // band-column past `BINDING_FREE`, so it must be refused whichever budget is
    // the smaller; and the refusal must be about THAT budget, because a refusal
    // naming the wrong one sends the author to the wrong remedy (shrink the band
    // vs. promote existing art).
    expect(bandTileCount(OVER)).toBeGreaterThan(BINDING_FREE);    // anti-vacuous
    const reason = insertUnavailableReason(ROOMY, OVER.cols, OVER.rows);
    expect(reason).not.toBeNull();
    if (TILES_BIND) {
      // The blob is the gate: aeon's capacity cuts made this the live case on
      // 2026-09-08. `createBand` must NOT refuse — the section has room — so the
      // blob guard is what the author meets.
      expect(() => createBand(OVER)).not.toThrow();
      expect(reason).toMatch(
        `the blob has ${FREE} free slot(s) of ${BG_TILE_CAPACITY}`);
      expect(reason).not.toMatch(/ROM SECTION/);
    } else {
      expect(() => createBand(OVER)).toThrow(/ROM section ceiling/);
      expect(reason).toMatch(/ROM SECTION/);
      expect(reason).toMatch(String(BGANIM_BYTES_PER_SLOT));
    }
  });

  /**
   * A bandless document with so few static tiles that the ROM SECTION is the
   * binding budget. DERIVED, not a constant: one tile is the smallest legal blob,
   * and the row below refuses to run vacuously if the capacity ever falls so far
   * that the section cannot bind on ANY document.
   */
  function sectionBoundDoc(): BgOverrideDocument {
    return {
      layout: new Array<number>(ROOMY.layout.length).fill(0),
      tiles: [new Array<number>(TILE_PIXELS).fill(0)],
    };
  }

  it('⚠ REFUSES the band the TILE budget admits and the ROM SECTION does not', () => {
    // THE DEFECT, AS A ROW, AND IT NO LONGER LIVES ON THE ROOMY FIXTURE. This is
    // the case where Aurora would offer a band the build refuses: the blob has
    // room and the emitted section does not. It USED to be constructible on
    // ROOMY, whose free room was 80 against the section's 79; aeon's 2026-09-08
    // capacity cuts took that to 56 and the tile ceiling became the tighter one,
    // so the scenario moved to a document with more tile room rather than out of
    // the suite. The section-refusal path is the one aeon's
    // `check_bganim_section_fits` owns and it must stay covered at every value of
    // BG_TILE_CAPACITY, not only the ones where this fixture happens to expose it.
    const doc = sectionBoundDoc();
    const docFree = BG_TILE_CAPACITY - doc.tiles.length;
    // LOUD ON UNMEASURABLE: if the arena ever shrinks below the section's reach,
    // this row proves nothing and must say so rather than pass.
    expect(
      docFree,
      'BG_TILE_CAPACITY has fallen so far that the ROM section can no longer be'
      + ` the binding budget on ANY document (blob room ${docFree} <= section room`
      + ` ${SECTION_FREE}). This row is measuring nothing: the two budgets have`
      + ' stopped diverging in this direction, which is itself the finding.',
    ).toBeGreaterThan(SECTION_FREE);

    const sectionOver = { cols: Math.floor(SECTION_FREE / ROWS) + 1, rows: ROWS };
    // Anti-vacuous both ways: over the SECTION budget, comfortably inside the BLOB.
    expect(bandTileCount(sectionOver)).toBeGreaterThan(SECTION_FREE);
    expect(bandTileCount(sectionOver)).toBeLessThanOrEqual(docFree);

    expect(() => createBand(sectionOver)).toThrow(/ROM section ceiling/);
    const reason = insertUnavailableReason(doc, sectionOver.cols, sectionOver.rows);
    expect(reason).toMatch(/ROM SECTION/);
    expect(reason).toMatch(String(BGANIM_BYTES_PER_SLOT));
    // ...and the discriminating half: a band inside the section budget is taken
    // on the same document, so the refusal above is about the size and not about
    // the document being unusable.
    const sectionFits = { cols: Math.floor(SECTION_FREE / ROWS), rows: ROWS };
    expect(bandTileCount(sectionFits)).toBeLessThanOrEqual(SECTION_FREE);
    expect(insertUnavailableReason(doc, sectionFits.cols, sectionFits.rows)).toBeNull();
  });

  it('refuses the smallest band the BLOB cannot hold, in the insert guard\'s OWN words', () => {
    // The BLOB budget, enforced in its own words. The band is built with `phases`
    // handed in rather than through `createBand`, so that this row reaches the
    // blob guard whichever budget is currently the tighter: while the section was
    // the smaller one `createBand` refused a band of this size first, and today it
    // does not. Going round it keeps the row about the guard it names.
    const n = bandTileCount(OVER_TILES);
    const band = {
      cols: OVER_TILES.cols, rows: OVER_TILES.rows, pattern_px: OVER_TILES.cols * 8,
      phases: Array.from({ length: BGANIM_PHASE_BANKS }, () =>
        Array.from({ length: n }, () => new Array<number>(TILE_PIXELS).fill(0))),
    };
    // planBandInsertion's wording — not the codec's document-level capacity check
    // (bar 2c: two errors share "over the BG tile capacity", so match the half
    // only this guard says).
    expect(() => makeAddBandCommand(ROOMY, band))
      .toThrow(`the band needs ${n} slot(s) at the front of a ${ROOMY.tiles.length}-tile blob`);
    // The panel's gate, which is a different implementation of the same bound,
    // refuses too, in ITS words, and names the free count it derived.
    const reason = insertUnavailableReason(ROOMY, OVER_TILES.cols, OVER_TILES.rows);
    expect(reason).toMatch(`adding a tile animation puts its ${n} tile(s) INTO the blob, and the blob has ${FREE} free slot(s) of ${BG_TILE_CAPACITY}`);
  });
});

describe('CONTROL: the same insert on a document padded to BG_TILE_CAPACITY', () => {
  /** Item 27's pattern: the property is "no free slots", not a tile count. */
  function fullBandlessDoc(): BgOverrideDocument {
    const tiles = cloneBgOverride(ROOMY.tiles);
    while (tiles.length < BG_TILE_CAPACITY) {
      tiles.push(new Array<number>(TILE_PIXELS).fill(tiles.length & 0xF));
    }
    return { layout: ROOMY.layout.slice(), tiles };
  }

  it('refuses the SMALL band the roomy document accepted, through both doors', () => {
    const full = fullBandlessDoc();
    expect(tileSlotsRemaining(full)).toBe(0);
    const band = createBand(SMALL);
    expect(() => makeAddBandCommand(full, band))
      .toThrow(`the band needs ${bandTileCount(band)} slot(s) at the front of a ${full.tiles.length}-tile blob`);
    expect(insertUnavailableReason(full, SMALL.cols, SMALL.rows))
      .toMatch(`the blob has 0 free slot(s) of ${BG_TILE_CAPACITY}`);
    // And the discriminating half: the roomy document is not refused.
    expect(() => makeAddBandCommand(ROOMY, band)).not.toThrow();
  });
});
