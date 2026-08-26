// Building the undoable band-ART commands — pixels of a tile slot, a whole
// phase bank, or banks 1..7 regenerated from phase 0.
//
// Same shape as `bg-override-band.ts`: the arithmetic lives beside the codec
// (`formats/bg-override/bg-anim-art.ts`); this file adds what a command has to
// have — every index and pixel is bounded HERE, while the caller still holds an
// untouched document, and the command OWNS COPIES of both halves of every
// entry so undo restores bytes rather than references.
//
// `sectionIndex` is -1 on all three: the override document is per-GAME, so
// these are act-ambient like `set-bg-override-band`.

import {
  BgOverrideError,
  BGANIM_PHASE_BANKS,
  bandTileCount,
  type BgOverrideDocument,
} from '../formats/bg-override/bg-override';
import { documentBands } from '../formats/bg-override/bg-anim-band';
import {
  regeneratedShiftPhases, requireTilePixels, tilesEqual,
} from '../formats/bg-override/bg-anim-art';
import type { SetBgOverridePhasesCommand, SetBgOverrideTilesCommand } from './commands';

export interface TileWrite { index: number; pixels: readonly number[] }

/**
 * The command that writes the pixels of each `tiles[index]` in `writes`.
 * Entries whose pixels already match are dropped; a command with nothing left
 * to do is refused rather than recorded, because an undo slot that changes
 * nothing is a lie in the history.
 */
export function makeSetBgOverrideTilesCommand(
  doc: BgOverrideDocument, writes: readonly TileWrite[],
): SetBgOverrideTilesCommand {
  if (!Array.isArray(writes) || writes.length === 0) {
    throw new BgOverrideError('refusing to build an empty tile edit: nothing to write, nothing to undo');
  }
  const seen = new Set<number>();
  const tiles: SetBgOverrideTilesCommand['tiles'] = [];
  for (const w of writes) {
    if (!Number.isInteger(w.index) || w.index < 0 || w.index >= doc.tiles.length) {
      throw new BgOverrideError(
        `cannot write tile ${w.index}: the blob holds ${doc.tiles.length} tile(s) (0..${doc.tiles.length - 1})`,
      );
    }
    if (seen.has(w.index)) {
      throw new BgOverrideError(`tile ${w.index} appears twice in one edit; the last write would win silently`);
    }
    seen.add(w.index);
    const newPixels = requireTilePixels(w.pixels, `tiles[${w.index}]`);
    const oldPixels = doc.tiles[w.index].slice();
    if (tilesEqual(oldPixels, newPixels)) continue;
    tiles.push({ index: w.index, oldPixels, newPixels });
  }
  if (tiles.length === 0) {
    throw new BgOverrideError('refusing to build a tile edit that changes no pixel');
  }
  const label = tiles.length === 1 ? `tile #${tiles[0].index}` : `${tiles.length} tiles`;
  return { type: 'set-bg-override-tiles', description: `BG art: edit ${label}`, sectionIndex: -1, tiles };
}

/**
 * The command that sets `phases[bank]` of band `bandIndex` to `tiles`
 * (cols*rows tiles). Bank 0 is the rest state, and the applier rewrites the
 * prefix tiles with it.
 */
export function makeSetBgOverridePhaseBankCommand(
  doc: BgOverrideDocument, bandIndex: number, bank: number, tiles: readonly (readonly number[])[],
): SetBgOverridePhasesCommand {
  const band = requireBand(doc, bandIndex);
  if (!Number.isInteger(bank) || bank < 0 || bank >= BGANIM_PHASE_BANKS) {
    throw new BgOverrideError(
      `cannot write phases[${bank}]: a band has exactly ${BGANIM_PHASE_BANKS} banks (0..${BGANIM_PHASE_BANKS - 1})`,
    );
  }
  const n = bandTileCount(band);
  if (!Array.isArray(tiles) || tiles.length !== n) {
    throw new BgOverrideError(
      `cannot write phases[${bank}] of band ${bandIndex}: a bank holds cols*rows = ${n} tile(s), ` +
      `got ${Array.isArray(tiles) ? tiles.length : typeof tiles}`,
    );
  }
  const newTiles = tiles.map((t, i) => requireTilePixels(t, `anims[${bandIndex}].phases[${bank}][${i}]`));
  const oldTiles = band.phases[bank].map((t) => t.slice());
  return {
    type: 'set-bg-override-phases',
    description: `BG art: band ${bandIndex} bank ${bank}`,
    sectionIndex: -1,
    bandIndex,
    banks: [{ bank, oldTiles, newTiles }],
  };
}

/**
 * The command that REGENERATES banks 1..BGANIM_PHASE_BANKS-1 of band
 * `bandIndex` from its current phase 0 with the shift fill. Phase 0 is not an
 * entry: the regeneration reads it and leaves it alone.
 */
export function makeRegenerateShiftCommand(
  doc: BgOverrideDocument, bandIndex: number,
): SetBgOverridePhasesCommand {
  const band = requireBand(doc, bandIndex);
  const phases = regeneratedShiftPhases(band);
  const banks: SetBgOverridePhasesCommand['banks'] = [];
  for (let k = 1; k < BGANIM_PHASE_BANKS; k++) {
    banks.push({ bank: k, oldTiles: band.phases[k].map((t) => t.slice()), newTiles: phases[k] });
  }
  return {
    type: 'set-bg-override-phases',
    description: `BG art: band ${bandIndex} shift banks 1..${BGANIM_PHASE_BANKS - 1} from phase 0`,
    sectionIndex: -1,
    bandIndex,
    banks,
  };
}

function requireBand(doc: BgOverrideDocument, bandIndex: number) {
  const bands = documentBands(doc);
  const band = bands[bandIndex];
  if (!Number.isInteger(bandIndex) || band === undefined) {
    throw new BgOverrideError(
      `band ${bandIndex} does not exist (the document has ${bands.length})`,
    );
  }
  return band;
}
