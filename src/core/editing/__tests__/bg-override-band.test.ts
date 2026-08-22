// `set-bg-override-band` — adding or removing a BgAnim band as ONE undo step.
//
// The §6 acceptance bar says every new mutation is one undo step. Here that is
// not a UI convenience but the correctness requirement: a band's slots are a
// PREFIX of `tiles`, so the edit renumbers the whole static blob and rewrites
// the nametable, and a history that could pop the `anims` half without the
// `tiles` half would leave a document that passes every consumer assert, bakes
// cleanly, and ships silently corrupt art (aeon docs/BUGS.md TOOL-01).
//
// The arithmetic itself is proved in test/formats/bg-anim-band.test.ts, cell by
// cell over the real b0e5a661 document. What these rows pin is the COMMAND: that
// the whole three-key edit is one step, that undo restores the document
// byte-for-byte through the serializer, that the command owns the only surviving
// copy of a removed band's art, and that a missing document throws rather than
// quietly consuming an undo slot.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EditHistory } from '../history';
import type { S4Level } from '../commands';
import {
  makeAddBandCommand,
  makeDemoteBandCommand,
  makePromoteBandCommand,
  makeRemoveBandCommand,
} from '../bg-override-band';
import {
  parseBgOverride,
  serializeBgOverride,
  bandTileCount,
  animatedSlotCount,
  BGANIM_PHASE_BANKS,
  TILE_PIXELS,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../../formats/bg-override/bg-override';
import {
  bandFromStaticTiles,
  createBand,
  documentBands,
  tileSlotsRemaining,
} from '../../formats/bg-override/bg-anim-band';
import { BG_TILE_CAPACITY, cloneBgOverride } from '../../formats/bg-override/bg-override';

const GOLDEN_PATH = resolve(
  __dirname, '../../../../test/fixtures/bg-override/editor_bg_override.b0e5a661.json',
);
const GOLDEN: BgOverrideDocument = parseBgOverride(readFileSync(GOLDEN_PATH, 'utf8')).doc;
const GOLDEN_BYTES = serializeBgOverride(GOLDEN);

function level(doc: BgOverrideDocument = GOLDEN): S4Level {
  return { sections: [], bgOverride: doc } as unknown as S4Level;
}

function band(cols: number, rows: number, seed: number): BgOverrideBand {
  return createBand({
    cols, rows,
    phases: Array.from({ length: BGANIM_PHASE_BANKS }, (_, bank) =>
      Array.from({ length: cols * rows }, (_, t) =>
        new Array<number>(TILE_PIXELS).fill((seed + bank + t) & 0xF))),
  });
}

const bytes = (l: S4Level) => serializeBgOverride(l.bgOverride!);

describe('set-bg-override-band', () => {
  it('ADDS a band, tiles and layout together, and one undo takes all three back', () => {
    const l = level();
    const h = new EditHistory();
    const b = band(4, 2, 3);

    // Anti-vacuity: the fixture really carries bands already, so this is an
    // insertion into a populated document rather than into an empty one.
    expect(documentBands(GOLDEN).length).toBeGreaterThan(0);

    h.execute(makeAddBandCommand(l.bgOverride!, b), l);
    expect(documentBands(l.bgOverride!)).toHaveLength(documentBands(GOLDEN).length + 1);
    expect(l.bgOverride!.tiles).toHaveLength(GOLDEN.tiles.length + bandTileCount(b));
    expect(bytes(l)).not.toBe(GOLDEN_BYTES);

    // ONE step — not one for anims, one for tiles and one for layout.
    expect(h.canUndo).toBe(true);
    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
    expect(h.canUndo).toBe(false);

    h.redo(l);
    expect(documentBands(l.bgOverride!)).toHaveLength(documentBands(GOLDEN).length + 1);
  });

  it('ADDS at a chosen position, which is the case that renumbers everything', () => {
    const l = level();
    const h = new EditHistory();
    const b = band(4, 2, 5);

    h.execute(makeAddBandCommand(l.bgOverride!, b, 0), l);
    expect(documentBands(l.bgOverride!)[0].cols).toBe(b.cols);
    // Every pre-existing band moved up the blob; the spelled slot_base followed.
    expect(documentBands(l.bgOverride!)[1].slot_base).toBe(bandTileCount(b));

    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
  });

  it('REMOVES a band and one undo restores its art, its slots and its cells', () => {
    const l = level();
    const h = new EditHistory();
    const removed = documentBands(GOLDEN)[0];

    h.execute(makeRemoveBandCommand(l.bgOverride!, 0, { blankReferencingCells: true }), l);
    expect(documentBands(l.bgOverride!)).toHaveLength(documentBands(GOLDEN).length - 1);
    expect(l.bgOverride!.tiles).toHaveLength(GOLDEN.tiles.length - bandTileCount(removed));
    expect(l.bgOverride!.layout.some(w => w === 0)).toBe(true);   // cells really went blank

    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);

    h.redo(l);
    expect(documentBands(l.bgOverride!)).toHaveLength(documentBands(GOLDEN).length - 1);
  });

  it('refuses a removal that would delete drawn art unless the caller says so', () => {
    expect(() => makeRemoveBandCommand(GOLDEN, 0)).toThrow(/blankReferencingCells/);
  });

  it('owns its band, so a later edit to the caller\'s object cannot rewrite history', () => {
    const l = level();
    const h = new EditHistory();
    const b = band(2, 2, 7);
    const cmd = makeAddBandCommand(l.bgOverride!, b);

    expect(cmd.band).not.toBe(b);
    expect(cmd.band.phases[0][0]).not.toBe(b.phases[0][0]);

    h.execute(cmd, l);
    b.phases[0][0][0] = 0xF;              // the caller keeps working on its object
    b.rate_shift = 6;
    h.undo(l);
    h.redo(l);
    // The document carries what was added, not what the caller did afterwards.
    expect(documentBands(l.bgOverride!).at(-1)!.rate_shift).toBeUndefined();
    expect(bytes(l)).not.toBe(GOLDEN_BYTES);
  });

  it('records the removed art nowhere but the command, and still rebuilds it', () => {
    const l = level();
    const h = new EditHistory();
    const cmd = makeRemoveBandCommand(l.bgOverride!, 1, { blankReferencingCells: true });
    h.execute(cmd, l);

    // The document no longer holds the band's phases anywhere. The command is
    // the ONLY copy, which is why it is a deep one.
    const slots = animatedSlotCount(documentBands(l.bgOverride!));
    expect(slots).toBe(animatedSlotCount(documentBands(GOLDEN)) - cmd.plan.tileCount);
    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
  });

  it('is act-ambient, like the other project-level commands', () => {
    const cmd = makeAddBandCommand(GOLDEN, band(1, 1, 9));
    expect(cmd.type).toBe('set-bg-override-band');
    expect(cmd.sectionIndex).toBe(-1);
    expect(cmd.description).toMatch(/band/i);
    expect(cmd.adding).toBe(true);
    expect(makeRemoveBandCommand(GOLDEN, 0, { blankReferencingCells: true }).adding).toBe(false);
  });

  it('throws rather than silently consuming an undo slot without a document', () => {
    // The rule set-palette-line states: a no-op command still occupies history,
    // and here it would also leave the three owned keys out of step.
    const l = { sections: [] } as unknown as S4Level;
    const cmd = makeAddBandCommand(GOLDEN, band(1, 1, 11));
    expect(() => new EditHistory().execute(cmd, l))
      .toThrow('set-bg-override-band requires level.bgOverride');

    const applied = level();
    const h = new EditHistory();
    h.execute(makeAddBandCommand(applied.bgOverride!, band(1, 1, 12)), applied);
    delete (applied as { bgOverride?: unknown }).bgOverride;
    expect(() => h.undo(applied)).toThrow('set-bg-override-band requires level.bgOverride');
  });

  it('refuses before the command exists when the result would not be writable', () => {
    // A BACKSTOP, honestly labelled: the plan already checks every bound a
    // legal document can break, so this needs a document that was invalid on a
    // key the plan does not police — here a layout of the wrong length.
    const short: BgOverrideDocument = { ...GOLDEN, layout: GOLDEN.layout.slice(0, 100) };
    expect(() => makeAddBandCommand(short, band(1, 1, 13)))
      .toThrow(/resulting document would not be valid/);
  });
});

/**
 * A document at BG_TILE_CAPACITY exactly and carrying no bands — aeon's live
 * shape, and the one `makeAddBandCommand` provably cannot touch. Padded from the
 * real fixture rather than pinned to their tile count, so the subject is "a
 * document with no free slots" rather than "448".
 */
function fullBandlessDoc(): BgOverrideDocument {
  const tiles = cloneBgOverride(GOLDEN.tiles);
  while (tiles.length < BG_TILE_CAPACITY) {
    tiles.push(new Array<number>(TILE_PIXELS).fill(tiles.length & 0xF));
  }
  return { layout: GOLDEN.layout.slice(), tiles };
}

describe('set-bg-override-band — promotion and demotion', () => {
  it('PROMOTES on a document with no free tile slots, where adding refuses outright', () => {
    // THE ACCEPTANCE ROW. The property, not the number: a full blob has nowhere
    // for an inserted band's art to go, and promotion needs none.
    const full = fullBandlessDoc();
    expect(tileSlotsRemaining(full)).toBe(0);
    expect(() => makeAddBandCommand(full, band(1, 1, 20)))
      .toThrow(new RegExp(`capacity of ${BG_TILE_CAPACITY}`));

    const l = level(full);
    const h = new EditHistory();
    const from = 200;
    const b = bandFromStaticTiles(full, from, { cols: 8, rows: 4, driver: 'camera_x' });
    const fullBytes = serializeBgOverride(full);

    h.execute(makePromoteBandCommand(l.bgOverride!, b, from), l);
    expect(documentBands(l.bgOverride!)).toHaveLength(1);
    // The blob did not grow by one slot, and the document is still writable.
    expect(l.bgOverride!.tiles).toHaveLength(full.tiles.length);
    expect(bytes(l)).not.toBe(fullBytes);

    // ONE step, and it takes all three owned keys back together.
    expect(h.canUndo).toBe(true);
    h.undo(l);
    expect(bytes(l)).toBe(fullBytes);
    h.redo(l);
    expect(documentBands(l.bgOverride!)).toHaveLength(1);
    expect(l.bgOverride!.tiles).toHaveLength(full.tiles.length);
  });

  it('PROMOTES into a document that already carries bands, and one undo takes it back', () => {
    const l = level();
    const h = new EditHistory();
    const from = 200;
    const b = bandFromStaticTiles(GOLDEN, from, { cols: 8, rows: 1 });

    expect(documentBands(GOLDEN).length).toBeGreaterThan(0);
    h.execute(makePromoteBandCommand(l.bgOverride!, b, from, 0), l);
    expect(documentBands(l.bgOverride!)).toHaveLength(documentBands(GOLDEN).length + 1);
    expect(l.bgOverride!.tiles).toHaveLength(GOLDEN.tiles.length);
    // Promoted at the front, so every pre-existing band moved up the blob.
    expect(documentBands(l.bgOverride!)[1].slot_base).toBe(bandTileCount(b));

    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
  });

  it('DEMOTES the band REMOVAL refuses, and loses nothing doing it', () => {
    // The pair's whole advantage, at the command level: `makeRemoveBandCommand`
    // will not touch band 0 without being told to destroy the art that draws it.
    expect(() => makeRemoveBandCommand(GOLDEN, 0)).toThrow(/blankReferencingCells/);

    const l = level();
    const h = new EditHistory();
    h.execute(makeDemoteBandCommand(l.bgOverride!, 0), l);

    expect(documentBands(l.bgOverride!)).toHaveLength(documentBands(GOLDEN).length - 1);
    // Where removal shrank the blob and blanked cells, demotion did neither.
    expect(l.bgOverride!.tiles).toHaveLength(GOLDEN.tiles.length);
    expect(l.bgOverride!.layout.some(w => w === 0)).toBe(false);

    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
    h.redo(l);
    expect(documentBands(l.bgOverride!)).toHaveLength(documentBands(GOLDEN).length - 1);
  });

  it('owns the demoted band, so undo rebuilds it from the command and not the document', () => {
    const l = level();
    const h = new EditHistory();
    const original = documentBands(GOLDEN)[0];
    const cmd = makeDemoteBandCommand(l.bgOverride!, 0);

    expect(cmd.band).not.toBe(original);
    expect(cmd.band.phases[0][0]).not.toBe(original.phases[0][0]);
    h.execute(cmd, l);
    // The document no longer holds this band's later banks anywhere: phase 0 is
    // in `tiles`, banks 1.. exist only in the command.
    expect(documentBands(l.bgOverride!).some(b => b.pattern_px === original.pattern_px
      && b.cols === original.cols && b.rows === original.rows)).toBe(false);
    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
  });

  it('is act-ambient and describes itself as the operation it is', () => {
    const from = 200;
    const b = bandFromStaticTiles(GOLDEN, from, { cols: 8, rows: 1 });
    const up = makePromoteBandCommand(GOLDEN, b, from);
    expect(up.type).toBe('set-bg-override-band');
    expect(up.sectionIndex).toBe(-1);
    expect(up.adding).toBe(true);
    expect(up.description).toMatch(/promote/i);
    expect(up.plan.staticBase).toBe(from);

    const down = makeDemoteBandCommand(GOLDEN, 0);
    expect(down.adding).toBe(false);
    expect(down.description).toMatch(/demote/i);
    expect(down.plan.staticBase).not.toBeNull();
    // The add/remove pair stays the OTHER kind, so history can tell them apart.
    expect(makeAddBandCommand(GOLDEN, band(1, 1, 21)).plan.staticBase).toBeNull();
  });

  it('refuses before the command exists when the band does not match the art', () => {
    const from = 200;
    const lying = cloneBgOverride(bandFromStaticTiles(GOLDEN, from, { cols: 8, rows: 1 }));
    lying.phases[0][0] = new Array<number>(TILE_PIXELS).fill(0xF);
    expect(() => makePromoteBandCommand(GOLDEN, lying, from))
      .toThrow(/phases\[0\] is not that art/);
  });
});
