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
import { makeAddBandCommand, makeRemoveBandCommand } from '../bg-override-band';
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
import { createBand, documentBands } from '../../formats/bg-override/bg-anim-band';

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
