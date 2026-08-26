// Band ART on the pixel surface — the provider under parcel I's two doors:
// the Art facet's composer opening a band slot / a phase bank, and the band
// card's bank strip.
//
// THE COMPOSER EDITS THROUGH AN ATLAS. Its document is cells that reference
// atlas tiles, and its render/commit paths read pixels out of that atlas. A
// band bank is not in any atlas, so this file synthesizes one: for a static
// slot or bank 0 the atlas is the override's display tiles (the canvas's own
// mirror, which the tile writer keeps current), and for bank k>0 it is the
// bank's tiles themselves. Cell `(c, r)` of a `cols x rows` bank maps to slot
// `c*rows + r` — COLUMN-MAJOR, the runtime's order ("a pattern column's tiles
// are contiguous in VRAM"; see shiftedPhaseBanks).
//
// Decisions live here, not in the components: which command a write becomes,
// what the strip's button says, how a bank is rasterized.

import type { Tile } from '../../core/model/s4-types';
import type { ComposerDoc } from '../../core/art/composer-buffer';
import { createDoc } from '../../core/art/composer-buffer';
import { drawTileInto, type PaletteLut } from '../../core/art/rasterize';
import type { AnyCommand } from '../../core/editing/commands';
import {
  makeRegenerateShiftCommand, makeSetBgOverridePhaseBankCommand, makeSetBgOverrideTilesCommand,
} from '../../core/editing/bg-override-art';
import {
  BGANIM_PHASE_BANKS, TILE_WIDTH_PX, bandTileCount,
  type BgOverrideBand, type BgOverrideDocument,
} from '../../core/formats/bg-override/bg-override';
import { documentBands, bandSlotBases } from '../../core/formats/bg-override/bg-anim-band';
import { bgOverrideDisplay } from '../../core/formats/bg-override/bg-override-view';
import type { BgArtTarget, OpenDocument } from '../state/artStore';
import type { BandCommandResult } from './bg-anim-aeon';

// ---------------------------------------------------------------------------
// Wording — measured against the column by effects-wording.test.ts
// ---------------------------------------------------------------------------

/** The strip's button. A REGENERATE, not a one-time fill — the title says so. */
export const SHIFT_BUTTON_LABEL = 'Shift';
export const SHIFT_BUTTON_TITLE =
  'Regenerate banks 1–7 from phase 0: bank k becomes phase 0 scrolled k px within the '
  + 'band’s pattern width (the same fill as "pre-shifted (moves)"). Run it again after '
  + 'every phase-0 edit; banks you drew by hand are replaced. One undo step.';
export const BANK_STRIP_HINT = 'banks 0–7 · click one to draw it';
export const BANK_THUMB_TITLE = (bank: number): string =>
  bank === 0
    ? 'Phase 0 — the picture at rest. Drawing it also writes the band’s static slots.'
    : `Bank ${bank} — the band at step ${bank}. Draw it by hand, or Shift to derive it from phase 0.`;

// ---------------------------------------------------------------------------
// Which palette line the override's art renders through
// ---------------------------------------------------------------------------

/**
 * `palette_line` is a key Aurora round-trips and does not judge; for DISPLAY
 * it is read when it is a legal line index and 0 otherwise. Never written.
 */
export function bgPaletteLine(doc: BgOverrideDocument): number {
  const v = doc.palette_line;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3 ? v : 0;
}

// ---------------------------------------------------------------------------
// Atlas + document for a target
// ---------------------------------------------------------------------------

/** The tiles the composer indexes for this target (see the file header). */
export function bgArtAtlas(doc: BgOverrideDocument, target: BgArtTarget): Tile[] {
  if (target.kind === 'bank' && target.bank !== 0) {
    const band = documentBands(doc)[target.bandIndex];
    if (!band) return [];
    return band.phases[target.bank].map((p) => ({ pixels: Uint8Array.from(p) }));
  }
  return bgOverrideDisplay(doc).tiles;
}

/** Atlas index of doc cell `cellIndex` under `target` — column-major for a bank. */
export function bgArtCellAtlasIndex(
  doc: BgOverrideDocument, target: BgArtTarget, cellIndex: number,
): number | null {
  if (target.kind === 'tile') return cellIndex === 0 ? target.tileIndex : null;
  const bands = documentBands(doc);
  const band = bands[target.bandIndex];
  if (!band) return null;
  const c = cellIndex % band.cols, r = Math.floor(cellIndex / band.cols);
  if (r >= band.rows) return null;
  const slot = c * band.rows + r;
  return target.bank === 0 ? bandSlotBases(bands)[target.bandIndex] + slot : slot;
}

function bgArtDoc(doc: BgOverrideDocument, target: BgArtTarget): ComposerDoc | null {
  const pal = bgPaletteLine(doc);
  if (target.kind === 'tile') {
    if (target.tileIndex < 0 || target.tileIndex >= doc.tiles.length) return null;
    const d = createDoc(1, 1);
    d.cells[0].atlasTile = target.tileIndex;
    d.cells[0].pal = pal;
    return d;
  }
  const band = documentBands(doc)[target.bandIndex];
  if (!band || target.bank < 0 || target.bank >= BGANIM_PHASE_BANKS) return null;
  const d = createDoc(band.cols, band.rows);
  for (let i = 0; i < d.cells.length; i++) {
    d.cells[i].atlasTile = bgArtCellAtlasIndex(doc, target, i);
    d.cells[i].pal = pal;
  }
  return d;
}

/** An OpenDocument for one static slot (or a prefix slot, which also edits its band). */
export function openBgTileDocument(doc: BgOverrideDocument, tileIndex: number): OpenDocument | null {
  const target: BgArtTarget = { kind: 'tile', tileIndex };
  const d = bgArtDoc(doc, target);
  if (!d) return null;
  return {
    doc: d, liveTileIndex: null, chunkId: null, bgOverride: target,
    name: `BG tile #${tileIndex}`, dirty: false,
  };
}

/** An OpenDocument for bank `bank` of band `bandIndex`. */
export function openBandBankDocument(
  doc: BgOverrideDocument, bandIndex: number, bank: number,
): OpenDocument | null {
  const target: BgArtTarget = { kind: 'bank', bandIndex, bank };
  const d = bgArtDoc(doc, target);
  if (!d) return null;
  return {
    doc: d, liveTileIndex: null, chunkId: null, bgOverride: target,
    name: `band ${bandIndex} bank ${bank}`, dirty: false,
  };
}

/** True when the target still names something the document has (undo can remove a band). */
export function bgArtTargetExists(doc: BgOverrideDocument | null, target: BgArtTarget): boolean {
  if (!doc) return false;
  return bgArtDoc(doc, target) !== null;
}

// ---------------------------------------------------------------------------
// Commit — writes on the composer become ONE command
// ---------------------------------------------------------------------------

export interface PixelWrite { x: number; y: number; value: number }

/**
 * The command for a batch of doc-space pixel writes under `target`, or null
 * when nothing changed. Static slot / bank 0 → `set-bg-override-tiles` (the
 * writer lands prefix slots in phases[0] too); bank k>0 → the whole bank as
 * `set-bg-override-phases`.
 */
export function bgArtCommitCommand(
  doc: BgOverrideDocument, target: BgArtTarget, composer: ComposerDoc, writes: readonly PixelWrite[],
): AnyCommand | null {
  if (writes.length === 0) return null;
  const atlas = bgArtAtlas(doc, target);
  const next = new Map<number, number[]>();   // atlas index -> new pixels
  for (const w of writes) {
    const cx = w.x >> 3, cy = w.y >> 3;
    const cellIndex = cy * composer.widthTiles + cx;
    const ai = bgArtCellAtlasIndex(doc, target, cellIndex);
    if (ai === null || !atlas[ai]) continue;
    let px = next.get(ai);
    if (!px) { px = Array.from(atlas[ai].pixels); next.set(ai, px); }
    px[(w.y & 7) * TILE_WIDTH_PX + (w.x & 7)] = w.value & 0xF;
  }
  if (next.size === 0) return null;
  if (target.kind === 'tile' || target.bank === 0) {
    const tiles = Array.from(next, ([index, pixels]) => ({ index, pixels }))
      .filter((t) => !sameTile(t.pixels, atlas[t.index].pixels));
    if (tiles.length === 0) return null;
    return makeSetBgOverrideTilesCommand(doc, tiles);
  }
  const band = documentBands(doc)[target.bandIndex];
  const bank = band.phases[target.bank].map((t, i) => next.get(i) ?? t.slice());
  if (bank.every((t, i) => sameTile(t, band.phases[target.bank][i]))) return null;
  return makeSetBgOverridePhaseBankCommand(doc, target.bandIndex, target.bank, bank);
}

function sameTile(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Bank strip verbs
// ---------------------------------------------------------------------------

/** `Shift`: banks 1..7 regenerated from the band's CURRENT phase 0. */
export function regenerateShiftCommand(
  doc: BgOverrideDocument | null, bandIndex: number,
): BandCommandResult {
  if (!doc) return { ok: false, reason: 'no BG override document is open' };
  try {
    return { ok: true, command: makeRegenerateShiftCommand(doc, bandIndex) };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** Rasterize bank `bank` of `band` as RGBA, `cols*8 x rows*8`, column-major slots. */
export function bankThumbnail(band: BgOverrideBand, bank: number, lut: PaletteLut): {
  width: number; height: number; rgba: Uint8ClampedArray;
} {
  const width = band.cols * TILE_WIDTH_PX, height = band.rows * TILE_WIDTH_PX;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const tiles = band.phases[bank] ?? [];
  const n = bandTileCount(band);
  for (let t = 0; t < n && t < tiles.length; t++) {
    const col = Math.floor(t / band.rows), row = t % band.rows;
    drawTileInto(rgba, width, col * TILE_WIDTH_PX, row * TILE_WIDTH_PX, tiles[t], lut, false, false);
  }
  return { width, height, rgba };
}
