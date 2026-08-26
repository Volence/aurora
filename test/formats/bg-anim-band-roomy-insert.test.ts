/**
 * ROADMAP item 24 — a BRAND-NEW band is INSERTABLE on a document aeon's own
 * generator wrote with free tile slots, and the editor's insert door takes it.
 *
 * Every earlier insertion row ran against the b0e5a661 fixture (a historical
 * document that already carried bands) or refused on the live 448/448 one. This
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
const FITTING = { cols: Math.floor(FREE / ROWS), rows: ROWS };
const OVER = { cols: Math.floor(FREE / ROWS) + 1, rows: ROWS };
/** A comfortable band, well inside the room, for the rows that do not probe the boundary. */
const SMALL = { cols: Math.max(1, Math.floor(FREE / ROWS / 4)), rows: ROWS };

describe('the ROOMY fixture is what its provenance says', () => {
  it('is bandless, layout+tiles only, and has free room — the anti-vacuous floor', () => {
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
    expect(bandTileCount(FITTING)).toBeLessThanOrEqual(FREE);
    expect(bandTileCount(OVER)).toBeGreaterThan(FREE);
    expect(bandTileCount(SMALL)).toBeLessThan(bandTileCount(FITTING));
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

  it('changes not one drawn cell — resolved through aeon\'s nametable loop — while every word moved', () => {
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

  it('accepts the band that spends EXACTLY the free room, and one undo is byte-identical', () => {
    const l = level(cloneBgOverride(ROOMY));
    const h = new EditHistory();
    const band = createBand(FITTING);
    expect(insertUnavailableReason(ROOMY, FITTING.cols, FITTING.rows)).toBeNull();

    h.execute(makeAddBandCommand(l.bgOverride!, band), l);
    expect(l.bgOverride!.tiles).toHaveLength(BG_TILE_CAPACITY);
    expect(tileSlotsRemaining(l.bgOverride!)).toBe(0);
    h.undo(l);
    expect(serializeBgOverride(l.bgOverride!)).toBe(ROOMY_BYTES);
  });

  it('refuses the smallest band that does not fit, in the insert guard\'s OWN words', () => {
    const band = createBand(OVER);
    const n = bandTileCount(band);
    // planBandInsertion's wording — not the codec's document-level capacity check
    // (bar 2c: two errors share "over the BG tile capacity", so match the half
    // only this guard says).
    expect(() => makeAddBandCommand(ROOMY, band))
      .toThrow(`the band needs ${n} slot(s) at the front of a ${ROOMY.tiles.length}-tile blob`);
    // The panel's gate, which is a different implementation of the same bound,
    // refuses too, in ITS words, and names the free count it derived.
    const reason = insertUnavailableReason(ROOMY, OVER.cols, OVER.rows);
    expect(reason).toMatch(`adding a band puts its ${n} tile(s) INTO the blob, and the blob has ${FREE} free slot(s) of ${BG_TILE_CAPACITY}`);
  });
});

describe('CONTROL — the same insert on a document padded to BG_TILE_CAPACITY', () => {
  /** Item 27's pattern: the property is "no free slots", not "448". */
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
