// WHICH TILE ARRAY IS THE PICKER SHOWING, AND WHAT DOES AN INDEX INTO IT MEAN?
//
// ROADMAP item 47. `ArtBrowser` showed `zone.tileset.tiles` — the FOREGROUND
// tileset — unconditionally, while `paintBgTile` packed the picked index as a
// blob-LOCAL index into Plane B's tile blob. Those are different art of
// different lengths (919 vs 320 on the live tree), so in BG mode the author saw
// one picture and painted another, and most of the picker's range did not name
// a background tile at all.
//
// ═══ ONE RESOLVER, NOT TWO ═══
//
// The BG half delegates to `resolveDisplayedBg` — the SAME function the canvas
// (`MapViewport.reloadBg`) and the paint gesture (`MapViewport.paintBgTile`)
// call. A second copy of the override/library/act-default order would be free to
// disagree later, and the failure it produces is exactly the one this module
// exists to end: the picker offering art the stroke does not write.
//
// The functions here are pure and take their inputs as arguments rather than
// reading the stores, because the node suite cannot see a `.tsx` closure. The
// component supplies the state; the rules live here.

import { resolveDisplayedBg, type DisplayedBgSource } from './bganim-preview-aeon';
import type { BgOverrideState } from '../../core/formats/bg-override/bg-override-io';
import { describeBands } from '../../core/formats/bg-override/bg-anim-band';
import type { Act, BgLibraryEntry, Tile, Zone } from '../../core/model/s4-types';

export type TilePickerLayer = 'fg' | 'bg';

/**
 * Where a picker index points. `'tileset'` is the zone's foreground tileset (a
 * VRAM-relative index the section nametables use); the three BG values are
 * `resolveDisplayedBg`'s own sources, and an index into any of them is
 * BLOB-LOCAL to that background's own tile array.
 */
export type TilePickerOrigin = 'tileset' | DisplayedBgSource | 'none';

export interface TilePickerSource {
  layer: TilePickerLayer;
  origin: TilePickerOrigin;
  /** The array the grid draws AND the array an index names. One thing. */
  tiles: readonly Tile[];
  /** The BG-library entry id — `origin: 'library'` only, null otherwise. */
  libraryId: string | null;
}

const NOTHING = (layer: TilePickerLayer): TilePickerSource =>
  ({ layer, origin: 'none', tiles: [], libraryId: null });

/**
 * The tile array the picker must show for the layer being painted.
 *
 * FG is the zone tileset, which is what it always was. BG is whatever
 * `resolveDisplayedBg` says the canvas is painting for the ACTIVE section — the
 * override document on the act aeon bakes it into, else the section's library
 * entry, else the act's own plane.
 */
export function resolveTilePickerSource(
  layer: TilePickerLayer,
  zone: Zone | null | undefined,
  act: Act | null | undefined,
  bgLibrary: readonly BgLibraryEntry[],
  activeSectionIndex: number,
  bgOverride?: BgOverrideState | null,
): TilePickerSource {
  if (layer === 'fg') {
    if (!zone) return NOTHING('fg');
    return { layer: 'fg', origin: 'tileset', tiles: zone.tileset.tiles, libraryId: null };
  }
  if (!act) return NOTHING('bg');
  const resolved = resolveDisplayedBg(act, bgLibrary, activeSectionIndex, bgOverride ?? null);
  if (!resolved) return NOTHING('bg');
  return { layer: 'bg', origin: resolved.source, tiles: resolved.tiles, libraryId: resolved.libraryId };
}

/**
 * The picked index for a layer — the read half of the per-layer selection
 * (editorStore.selectedBgTileIndex explains why there are two). A function
 * rather than an inline ternary at four call sites, so "which index does this
 * layer paint from" has exactly one answer in the codebase.
 */
export function pickedTileIndex(
  sel: { selectedTileIndex: number; selectedBgTileIndex: number },
  layer: TilePickerLayer,
): number {
  return layer === 'bg' ? sel.selectedBgTileIndex : sel.selectedTileIndex;
}

/**
 * The count row. It names the SPACE, not just the number: `#N` means a zone tile
 * index in FG and a blob-local slot in BG, and a picker that showed blob art
 * under a zone-tileset count would be item 47 again with a smaller blast radius.
 */
export function tilePickerCountLabel(source: TilePickerSource): string {
  if (source.origin === 'none') {
    return source.layer === 'bg' ? 'no background here' : 'no tileset';
  }
  return source.layer === 'bg'
    ? `${source.tiles.length} background tiles`
    : `${source.tiles.length} tiles`;
}

/** The hover readout, in the same space as the count row. `null` = nothing hovered. */
export function tilePickerHoverLabel(source: TilePickerSource, index: number): string {
  if (index < 0 || index >= source.tiles.length) return '';
  const n = `#${index} (0x${index.toString(16).toUpperCase()})`;
  return source.layer === 'bg' ? `bg ${n}` : n;
}

/**
 * One band of the animated prefix, as the picker shows it: a `cols x rows`
 * picture of phase 0, selectable as a unit (parcel J, triage 2026-08-26 §A.8).
 *
 * `slots` is the picture ROW-major — the slot each picture cell draws — and
 * the slots themselves are the band's COLUMN-major range: cell (c, r) is slot
 * `slotBase + c * rows + r` (aeon `bg_anim.emp`; measured on the ROM
 * 2026-08-26). The stamp lays this same arrangement on the plane, so the
 * picture the author picks is the picture the region gets.
 *
 * Phase 0 IS the prefix art: `tiles[slotBase .. slotBase + cols*rows)` equals
 * `phases[0]` by the codec's prefix rule, so the picture is drawn from the
 * picker's own `tiles` array and no bank is consulted.
 */
export interface TilePickerBandGroup {
  index: number;
  cols: number;
  rows: number;
  slotBase: number;
  /** Card caption: `Band 0 · 8x4`. */
  label: string;
  /** Row-major over the picture, `cols * rows` blob-local slots. */
  slots: number[];
}

/**
 * The bands of the override the picker is showing, or `[]` when the picker is
 * showing anything else. Only the OVERRIDE carries bands — a library entry or
 * the act's own plane has an animated prefix of length zero — so any other
 * origin, and any layer but BG, groups nothing.
 */
export function tilePickerBandGroups(
  source: TilePickerSource, bgOverride: BgOverrideState | null | undefined,
): TilePickerBandGroup[] {
  if (source.layer !== 'bg' || source.origin !== 'override') return [];
  const doc = bgOverride?.doc;
  if (!doc) return [];
  return describeBands(doc).map((b) => {
    const slots = new Array<number>(b.cols * b.rows);
    for (let r = 0; r < b.rows; r++) {
      for (let c = 0; c < b.cols; c++) slots[r * b.cols + c] = b.slotBase + c * b.rows + r;
    }
    return {
      index: b.index, cols: b.cols, rows: b.rows, slotBase: b.slotBase,
      label: `Band ${b.index} · ${b.cols}x${b.rows}`, slots,
    };
  });
}

/** The hover/pick readout for a band group, in the same space as the tile one. */
export function tilePickerBandLabel(g: TilePickerBandGroup): string {
  const last = g.slotBase + g.cols * g.rows - 1;
  return `band ${g.index} · slots ${g.slotBase}..${last} (${g.cols}x${g.rows})`;
}

/**
 * What a thumbnail cache is keyed on.
 *
 * ═══ THE DERIVATION ═══
 *
 * The cache holds one rasterised thumbnail per entry of a `Tile[]`, coloured by
 * one palette line. So the two things that identify its contents are THE ARRAY
 * ITSELF and THE PALETTE LINE — and the array is identified by its own object
 * identity, not by any property of it.
 *
 * The previous key was `(zoneId, paletteLine, tiles.length)`. Length is not an
 * identity: a 320-tile BG blob and a 320-tile FG tileset agree on it, and so do
 * two different BG sources of equal length, and the cache would then serve one
 * source's thumbnails for the other's art — silently, since a thumbnail grid has
 * no way to look wrong. Zone id has the same problem one level up: both layers
 * live in the same zone.
 *
 * Identity is safe to key on here because every producer of these arrays keeps
 * one array per document for as long as the document lives:
 *  • `zone.tileset.tiles` — the loaded zone's array;
 *  • `bgOverrideDisplay(doc).tiles` — cached per document and rebuilt ONLY when
 *    `doc.tiles` is replaced (bg-override-view.ts), which is what a band
 *    insert/remove does and is exactly when the thumbnails must be rebuilt;
 *  • a `BgLibraryEntry.tiles` / `act.bgTiles` — the store's arrays.
 * So identity misses when the art changes and hits when it does not, which is
 * the property a cache key needs and the one `length` never had.
 */
export interface TileThumbCacheKey {
  tiles: readonly Tile[] | null;
  paletteLine: number;
}

/** True when the cache cannot be reused for this array + palette line. */
export function tileThumbCacheStale(
  cached: TileThumbCacheKey, tiles: readonly Tile[], paletteLine: number,
): boolean {
  return cached.tiles !== tiles || cached.paletteLine !== paletteLine;
}
