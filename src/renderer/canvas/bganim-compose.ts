// Pure BgAnim band overlay composition — the same posture as
// `compose-nametable.ts` next door, and for the same reason: canvas-free so the
// node-only renderer suite can see it, and one `putImageData` per step rather
// than one per cell.
//
// WHAT THE OVERLAY IS. Not a lens drawn beside the background — a REPLACEMENT
// for the cells the band owns. The engine DMAs new art into the band's VRAM
// slots each time its step changes, so on screen the cells whose layout word
// names one of those slots show different pixels while every other cell is
// untouched. Composing exactly those cells into a transparent plane-sized
// buffer, and blitting that buffer over the already-painted plane, reproduces
// that: the alpha-0 remainder leaves the static background showing.
//
// WHICH CELLS ARE PRECOMPUTED, NOT SCANNED PER STEP. A band's cell set depends
// on the layout and the band's slot range; neither moves when the step does.
// The step only changes WHICH ART lands in an already-known set of cells (the
// two DMAs are a slot permutation plus a bank choice), so the scan runs once
// per document/background change and the per-step work is a flat walk of a
// prebuilt list.

import { blitTile8 } from './compose-nametable';
import { bandSlotSource } from '../../core/formats/bg-override/bganim-preview';

/** One background cell that draws a band slot, resolved once at prepare time. */
export interface BandOverlayCell {
  /** Index into the BG nametable — where on the plane this cell sits. */
  cell: number;
  /** Which band owns it (index into the phase list below). */
  band: number;
  /** The slot's offset within the band, i.e. `tileIndex - slotBase`. */
  localSlot: number;
  /** The cell's palette line, from its own nametable word. */
  palette: number;
  hFlip: boolean;
  vFlip: boolean;
}

/** A band's geometry plus the phase it is showing right now. */
export interface BandOverlayPhase {
  cols: number;
  rows: number;
  /** Index into `phases` — the fine half of the step. */
  bank: number;
  /** Whole pattern columns of rotation — the coarse half. */
  coarseColumns: number;
}

/**
 * Resolve one band's bank art to 256 RGBA bytes, or null when there is no
 * bitmap for that combination — the cell is then left transparent, which is the
 * same "no bitmap means the plane below shows through" rule the plane composer
 * uses for a missing tile.
 */
export type BandArtLookup = (
  band: number, bank: number, srcSlot: number, palette: number,
) => Uint8ClampedArray | null;

/**
 * Compose the band cells into `dest` (RGBA, `destPixelWidth * destPixelHeight *
 * 4` bytes), replacing its entire contents — everything not covered by a band
 * cell ends up fully transparent.
 *
 * `phases[cell.band]` must exist; a cell naming a band that is not in the list
 * is a prepare-time bug and is skipped rather than throwing mid-frame, because
 * the alternative is a viewport that stops painting entirely.
 */
export function composeBandOverlay(
  dest: Uint8ClampedArray,
  destPixelWidth: number,
  destPixelHeight: number,
  tilesWide: number,
  cells: readonly BandOverlayCell[],
  phases: readonly BandOverlayPhase[],
  lookup: BandArtLookup,
): void {
  dest.fill(0);

  const rowBytes = destPixelWidth * 4;
  const maxCol = Math.floor(destPixelWidth / 8);
  const maxRow = Math.floor(destPixelHeight / 8);

  for (const c of cells) {
    const phase = phases[c.band];
    if (!phase) continue;

    const col = c.cell % tilesWide;
    const row = (c.cell / tilesWide) | 0;
    if (col >= maxCol || row >= maxRow) continue;

    const srcSlot = bandSlotSource(c.localSlot, phase, phase.coarseColumns);
    const src = lookup(c.band, phase.bank, srcSlot, c.palette);
    if (!src) continue;

    blitTile8(dest, rowBytes, col * 8, row * 8, src, c.hFlip, c.vFlip);
  }
}
