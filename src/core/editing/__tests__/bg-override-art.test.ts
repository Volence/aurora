// `set-bg-override-tiles` / `set-bg-override-phases` — band ART authoring in the
// override document, as undo steps that keep the prefix identity.
//
// THE RULE UNDER TEST is aeon's `inject_editor_bg.py::validate_band_coherence`,
// transcribed: bands pack contiguously from slot 0 (`slot_base == cursor`), and
// for each band `phases[0] == tiles[slot_base : slot_base + cols*rows]`, or the
// file is REFUSED. So a pixel write inside the animated prefix must land in the
// owning band's `phases[0]` in the SAME command, and an undo must take both
// back — a history that could pop one half without the other would leave a
// document that bakes cleanly and ships corrupt art (docs/BUGS.md TOOL-01).
//
// Every expectation is derived from the fixture (which band owns which slot,
// how many slots the prefix has) rather than typed as a number.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EditHistory } from '../history';
import type { S4Level } from '../commands';
import {
  makeSetBgOverrideTilesCommand,
  makeSetBgOverridePhaseBankCommand,
  makeRegenerateShiftCommand,
} from '../bg-override-art';
import {
  parseBgOverride,
  serializeBgOverride,
  validateBgOverride,
  animatedSlotCount,
  bandTileCount,
  BGANIM_PHASE_BANKS,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  BgOverrideError,
  cloneBgOverride,
  type BgOverrideDocument,
} from '../../formats/bg-override/bg-override';
import {
  documentBands, bandSlotBases, shiftedPhaseBanks,
} from '../../formats/bg-override/bg-anim-band';
import { bandOwningSlot, prefixIsCoherent } from '../../formats/bg-override/bg-anim-art';

const GOLDEN_PATH = resolve(
  __dirname, '../../../../test/fixtures/bg-override/editor_bg_override.b0e5a661.json',
);
const GOLDEN: BgOverrideDocument = parseBgOverride(readFileSync(GOLDEN_PATH, 'utf8')).doc;
const GOLDEN_BYTES = serializeBgOverride(GOLDEN);

function level(): S4Level {
  return { sections: [], bgOverride: parseBgOverride(GOLDEN_BYTES).doc } as unknown as S4Level;
}
const bytes = (l: S4Level) => serializeBgOverride(l.bgOverride!);
const doc = (l: S4Level) => l.bgOverride!;

/** A tile whose every pixel is `v` — trivially distinguishable from the fixture's art. */
const flat = (v: number) => new Array<number>(TILE_PIXELS).fill(v & TILE_PIXEL_MAX);

const prefix = animatedSlotCount(documentBands(GOLDEN));
const bases = bandSlotBases(documentBands(GOLDEN));

describe('the fixture carries what the rows below need', () => {
  it('has at least two bands and a static region after the prefix', () => {
    expect(documentBands(GOLDEN).length).toBeGreaterThanOrEqual(2);
    expect(prefix).toBeGreaterThan(0);
    expect(GOLDEN.tiles.length).toBeGreaterThan(prefix);
    expect(prefixIsCoherent(GOLDEN)).toBe(true);
  });
});

describe('bandOwningSlot — the prefix rule, transcribed', () => {
  it('maps every prefix slot to exactly the band whose range covers it', () => {
    const bands = documentBands(GOLDEN);
    for (let i = 0; i < prefix; i++) {
      const own = bandOwningSlot(GOLDEN, i);
      expect(own).not.toBeNull();
      const b = bands[own!.bandIndex];
      expect(bases[own!.bandIndex]).toBeLessThanOrEqual(i);
      expect(i).toBeLessThan(bases[own!.bandIndex] + bandTileCount(b));
      expect(own!.offset).toBe(i - bases[own!.bandIndex]);
    }
  });
  it('maps every slot past the prefix to no band at all', () => {
    expect(bandOwningSlot(GOLDEN, prefix)).toBeNull();
    expect(bandOwningSlot(GOLDEN, GOLDEN.tiles.length - 1)).toBeNull();
  });
});

describe('set-bg-override-tiles', () => {
  it('a write INSIDE the prefix updates the owning band\'s phases[0] in the same command', () => {
    const l = level();
    const h = new EditHistory();
    // The last slot of the LAST band: the case a "band 0 only" implementation gets wrong.
    const lastBand = documentBands(GOLDEN).length - 1;
    const slot = bases[lastBand] + bandTileCount(documentBands(GOLDEN)[lastBand]) - 1;
    const px = flat(0xA);
    expect(GOLDEN.tiles[slot]).not.toEqual(px);

    h.execute(makeSetBgOverrideTilesCommand(doc(l), [{ index: slot, pixels: px }]), l);

    expect(doc(l).tiles[slot]).toEqual(px);
    const own = bandOwningSlot(doc(l), slot)!;
    expect(own.bandIndex).toBe(lastBand);
    expect(documentBands(doc(l))[lastBand].phases[0][own.offset]).toEqual(px);
    // Coherence holds after apply — the writer's rule, and the serializer's.
    expect(prefixIsCoherent(doc(l))).toBe(true);
    expect(validateBgOverride(doc(l))).toEqual([]);
    // Not aliased: the tile and the phase are two arrays holding equal values.
    expect(doc(l).tiles[slot]).not.toBe(documentBands(doc(l))[lastBand].phases[0][own.offset]);

    // ...and after undo, byte-for-byte through the serializer.
    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
    expect(prefixIsCoherent(doc(l))).toBe(true);

    h.redo(l);
    expect(doc(l).tiles[slot]).toEqual(px);
    expect(prefixIsCoherent(doc(l))).toBe(true);
  });

  it('a write OUTSIDE the prefix touches no band', () => {
    const l = level();
    const h = new EditHistory();
    const slot = prefix; // first static slot
    const animsBefore = JSON.stringify(doc(l).anims);

    h.execute(makeSetBgOverrideTilesCommand(doc(l), [{ index: slot, pixels: flat(0x3) }]), l);
    expect(doc(l).tiles[slot]).toEqual(flat(0x3));
    expect(JSON.stringify(doc(l).anims)).toBe(animsBefore);

    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
  });

  it('is ONE undo step for several tiles, straddling the prefix boundary', () => {
    const l = level();
    const h = new EditHistory();
    h.execute(makeSetBgOverrideTilesCommand(doc(l), [
      { index: prefix - 1, pixels: flat(0x1) },
      { index: prefix, pixels: flat(0x2) },
    ]), l);
    expect(doc(l).tiles[prefix - 1]).toEqual(flat(0x1));
    expect(doc(l).tiles[prefix]).toEqual(flat(0x2));
    expect(prefixIsCoherent(doc(l))).toBe(true);
    expect(h.canUndo).toBe(true);
    h.undo(l);
    expect(h.canUndo).toBe(false);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
  });

  it('refuses a slot past the blob, a malformed tile, and an out-of-range pixel', () => {
    const d = level().bgOverride!;
    expect(() => makeSetBgOverrideTilesCommand(d, [{ index: d.tiles.length, pixels: flat(0) }]))
      .toThrow(BgOverrideError);
    expect(() => makeSetBgOverrideTilesCommand(d, [{ index: 0, pixels: flat(0).slice(1) }]))
      .toThrow(BgOverrideError);
    const bad = flat(0); bad[5] = TILE_PIXEL_MAX + 1;
    expect(() => makeSetBgOverrideTilesCommand(d, [{ index: 0, pixels: bad }]))
      .toThrow(BgOverrideError);
    expect(() => makeSetBgOverrideTilesCommand(d, [])).toThrow(BgOverrideError);
  });

  it('the command owns copies — mutating the caller\'s array after building it changes nothing', () => {
    const l = level();
    const h = new EditHistory();
    const px = flat(0x7);
    const cmd = makeSetBgOverrideTilesCommand(doc(l), [{ index: 0, pixels: px }]);
    px[0] = 0xF;
    h.execute(cmd, l);
    expect(doc(l).tiles[0][0]).toBe(0x7);
  });

  it('throws rather than consuming an undo slot when there is no document', () => {
    const l = { sections: [] } as unknown as S4Level;
    const cmd = makeSetBgOverrideTilesCommand(GOLDEN, [{ index: 0, pixels: flat(0) }]);
    expect(() => new EditHistory().execute(cmd, l)).toThrow(/set-bg-override-tiles/);
  });
});

describe('set-bg-override-phases — one bank, independently', () => {
  it('sets bank k without touching bank 0, the tiles, or any other band', () => {
    const l = level();
    const h = new EditHistory();
    const bandIndex = 0;
    const band = documentBands(GOLDEN)[bandIndex];
    const n = bandTileCount(band);
    const k = BGANIM_PHASE_BANKS - 1;
    const bank = Array.from({ length: n }, (_, t) => flat(t & TILE_PIXEL_MAX));
    expect(band.phases[k]).not.toEqual(bank);

    h.execute(makeSetBgOverridePhaseBankCommand(doc(l), bandIndex, k, bank), l);
    const after = documentBands(doc(l))[bandIndex];
    expect(after.phases[k]).toEqual(bank);
    expect(after.phases[0]).toEqual(band.phases[0]);
    expect(doc(l).tiles).toEqual(GOLDEN.tiles);
    expect(documentBands(doc(l))[1]).toEqual(documentBands(GOLDEN)[1]);
    expect(validateBgOverride(doc(l))).toEqual([]);

    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
  });

  it('setting bank 0 ALSO rewrites the prefix tiles — phase 0 IS the rest state', () => {
    const l = level();
    const h = new EditHistory();
    const bandIndex = documentBands(GOLDEN).length - 1;
    const band = documentBands(GOLDEN)[bandIndex];
    const n = bandTileCount(band);
    const bank = Array.from({ length: n }, () => flat(0xC));

    h.execute(makeSetBgOverridePhaseBankCommand(doc(l), bandIndex, 0, bank), l);
    expect(doc(l).tiles.slice(bases[bandIndex], bases[bandIndex] + n)).toEqual(bank);
    expect(prefixIsCoherent(doc(l))).toBe(true);
    expect(validateBgOverride(doc(l))).toEqual([]);

    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
    expect(prefixIsCoherent(doc(l))).toBe(true);
  });

  it('refuses a bank index outside 0..BGANIM_PHASE_BANKS-1, a wrong tile count, a missing band', () => {
    const d = level().bgOverride!;
    const n = bandTileCount(documentBands(d)[0]);
    const ok = Array.from({ length: n }, () => flat(0));
    expect(() => makeSetBgOverridePhaseBankCommand(d, 0, BGANIM_PHASE_BANKS, ok)).toThrow(BgOverrideError);
    expect(() => makeSetBgOverridePhaseBankCommand(d, 0, -1, ok)).toThrow(BgOverrideError);
    expect(() => makeSetBgOverridePhaseBankCommand(d, 0, 1, ok.slice(1))).toThrow(BgOverrideError);
    expect(() => makeSetBgOverridePhaseBankCommand(d, documentBands(d).length, 1, ok)).toThrow(BgOverrideError);
  });
});

describe('regenerate-shift — banks 1..7 from the EDITED phase 0, on demand', () => {
  it('rebuilds banks 1..7 with the same fill the creation door uses, leaving phase 0 alone', () => {
    const l = level();
    const h = new EditHistory();
    const bandIndex = 0;
    // Edit phase 0 first (through the tiles command), then regenerate: the
    // regenerate must read the EDITED phase 0, not the one the band was born with.
    const slot = bases[bandIndex];
    h.execute(makeSetBgOverrideTilesCommand(doc(l), [{ index: slot, pixels: flat(0x9) }]), l);
    // SNAPSHOT, not a reference: the writers mutate the band in place, so the
    // live object after the regenerate IS the object before it.
    const edited = cloneBgOverride(documentBands(doc(l))[bandIndex]);
    const expected = shiftedPhaseBanks(edited, edited.phases[0]);

    h.execute(makeRegenerateShiftCommand(doc(l), bandIndex), l);
    const after = documentBands(doc(l))[bandIndex];
    expect(after.phases[0]).toEqual(edited.phases[0]);
    for (let k = 1; k < BGANIM_PHASE_BANKS; k++) expect(after.phases[k]).toEqual(expected[k]);
    // Anti-vacuity: the regeneration actually changed a bank.
    expect(after.phases[BGANIM_PHASE_BANKS - 1]).not.toEqual(edited.phases[BGANIM_PHASE_BANKS - 1]);
    expect(validateBgOverride(doc(l))).toEqual([]);

    // Two steps: the tile edit and the regenerate. Undo both → the golden bytes.
    h.undo(l);
    expect(documentBands(doc(l))[bandIndex].phases).toEqual(edited.phases);
    h.undo(l);
    expect(bytes(l)).toBe(GOLDEN_BYTES);
  });

  it('is refused for a band index the document does not have', () => {
    expect(() => makeRegenerateShiftCommand(GOLDEN, documentBands(GOLDEN).length)).toThrow(BgOverrideError);
  });
});
