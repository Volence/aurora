// Band ART in the override document — the in-place writers that keep the
// prefix identity while pixels change.
//
// THE RULE, transcribed from aeon `tools/inject_editor_bg.py::validate_band_coherence`
// (the gate every saved file passes through before it bakes):
//
//     cursor = 0
//     for i, a in enumerate(anims):
//         n = a['cols'] * a['rows']
//         base = a.get('slot_base', cursor)
//         assert base == cursor            # bands tile the front of the blob from slot 0
//         assert base + n <= len(tiles)    # the prefix fits inside the blob
//         assert a['phases'][0] == tiles[base : base + n]   # rest state IS the slots
//         cursor += n
//
// So the animated PREFIX `tiles[0 .. Σ(cols*rows))` is owned, slot by slot, by
// exactly one band each, and a band's `phases[0]` is a second copy of the very
// same pixels. Two copies of one fact drift unless one writer writes both —
// which is what `writeTilePixels` and `writePhaseBank` are. Everything an
// author can do to band art (paint a slot, paint a bank, regenerate banks 1..7)
// reduces to those two calls, and their undo is the same call with the old
// pixels, so coherence after undo is the same property as coherence after
// apply rather than a second thing to get right.
//
// These writers MUTATE the document in place (replacing the pixel arrays they
// touch, never aliasing the caller's), unlike the band-structure appliers in
// `bg-anim-band.ts` which return a new document: a pixel edit renumbers
// nothing, and the canvas holds the tile blob by reference (bg-override-view.ts).

import {
  BgOverrideError,
  bandTileCount,
  BGANIM_PHASE_BANKS,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  type BgOverrideBand,
  type BgOverrideDocument,
} from './bg-override';
import { bandSlotBases, documentBands, shiftedPhaseBanks } from './bg-anim-band';

/** Which band a prefix slot belongs to, and where inside its pattern (see `bandSlotCell`). */
export interface SlotOwner {
  bandIndex: number;
  band: BgOverrideBand;
  /** `index - slot_base`: the tile's position in `phases[k]`. */
  offset: number;
}

/**
 * The band owning `tiles[index]`, or null when the slot is past the animated
 * prefix (static art, which no band mirrors). Slot bases are DERIVED by
 * walking the list, exactly as the consumer's cursor does.
 */
export function bandOwningSlot(doc: BgOverrideDocument, index: number): SlotOwner | null {
  const bands = documentBands(doc);
  const bases = bandSlotBases(bands);
  for (let i = 0; i < bands.length; i++) {
    if (index >= bases[i] && index < bases[i + 1]) {
      return { bandIndex: i, band: bands[i], offset: index - bases[i] };
    }
  }
  return null;
}

/** `phases[0] == tiles[slot_base : slot_base + n]` for every band — the gate's third assert. */
export function prefixIsCoherent(doc: BgOverrideDocument): boolean {
  const bands = documentBands(doc);
  const bases = bandSlotBases(bands);
  return bands.every((band, i) => {
    const phase0 = band.phases?.[0];
    if (!Array.isArray(phase0) || phase0.length !== bandTileCount(band)) return false;
    if (bases[i + 1] > doc.tiles.length) return false;
    return phase0.every((tile, t) => tilesEqual(tile, doc.tiles[bases[i] + t]));
  });
}

export function tilesEqual(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Refuse anything that is not exactly one tile of legal pixel values. */
export function requireTilePixels(pixels: unknown, what: string): number[] {
  if (!Array.isArray(pixels) || pixels.length !== TILE_PIXELS) {
    throw new BgOverrideError(
      `${what}: a tile is exactly ${TILE_PIXELS} pixel values, got ` +
      `${Array.isArray(pixels) ? pixels.length : typeof pixels}`,
    );
  }
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i];
    if (!Number.isInteger(v) || v < 0 || v > TILE_PIXEL_MAX) {
      throw new BgOverrideError(
        `${what}: pixel ${i} is ${JSON.stringify(v)}; pixels are integers 0..${TILE_PIXEL_MAX}. ` +
        'The consumer MASKS out-of-range values rather than refusing them, which is exactly why ' +
        'this writer refuses: a masked pixel is art the author did not draw.',
      );
    }
  }
  return pixels.slice();
}

/**
 * Write one tile's pixels into `tiles[index]` — and, when the slot lies inside
 * the animated prefix, into the owning band's `phases[0]` in the same call.
 *
 * Returns the owner so a caller that also mirrors the blob (the canvas view)
 * knows what else moved. The pixels are COPIED into both places, separately:
 * the tile and the phase are equal, never the same array, because a later
 * band removal takes its `phases` away with the command and must not take the
 * static art with it.
 */
export function writeTilePixels(
  doc: BgOverrideDocument, index: number, pixels: readonly number[],
): SlotOwner | null {
  if (!Number.isInteger(index) || index < 0 || index >= doc.tiles.length) {
    throw new BgOverrideError(
      `cannot write tile ${index}: the blob holds ${doc.tiles.length} tile(s) (0..${doc.tiles.length - 1})`,
    );
  }
  const px = requireTilePixels(pixels, `tiles[${index}]`);
  doc.tiles[index] = px;
  const owner = bandOwningSlot(doc, index);
  if (owner !== null) owner.band.phases[0][owner.offset] = px.slice();
  return owner;
}

/**
 * Write one whole bank `phases[bank]` of the band at `bandIndex`. Bank 0 is the
 * rest state, so writing it writes the prefix tiles too (through
 * `writeTilePixels`, so there is still one writer for that half).
 *
 * Returns the slot indices whose static tile changed (empty for bank != 0), so
 * a mirror can follow.
 */
export function writePhaseBank(
  doc: BgOverrideDocument, bandIndex: number, bank: number, tiles: readonly (readonly number[])[],
): number[] {
  const bands = documentBands(doc);
  const band = bands[bandIndex];
  if (band === undefined) {
    throw new BgOverrideError(
      `cannot write a phase bank: band ${bandIndex} does not exist (the document has ${bands.length})`,
    );
  }
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
  const copies = tiles.map((t, i) => requireTilePixels(t, `anims[${bandIndex}].phases[${bank}][${i}]`));
  if (bank === 0) {
    const base = bandSlotBases(bands)[bandIndex];
    const touched: number[] = [];
    for (let t = 0; t < n; t++) {
      writeTilePixels(doc, base + t, copies[t]);
      touched.push(base + t);
    }
    return touched;
  }
  band.phases[bank] = copies;
  return [];
}

/**
 * Banks 1..BGANIM_PHASE_BANKS-1 derived from the band's CURRENT phase 0 with
 * the shift fill — the same `shiftedPhaseBanks` the creation doors use, so a
 * regenerated band and a band born with `phaseFill: 'shift'` are the same
 * pixels. Phase 0 is returned untouched at index 0 so the result is a whole
 * `phases` value.
 */
export function regeneratedShiftPhases(band: BgOverrideBand): number[][][] {
  return shiftedPhaseBanks(band, band.phases[0]);
}
