// WHAT DOES THE TILE PICKER SHOW, AND WHAT DOES A PICK MEAN?
//
// ROADMAP item 47. The picker showed the zone TILESET in both layers while a BG
// stroke wrote the picked index into Plane B's own tile blob — different art, a
// different length, no correspondence at any index. These rows pin the three
// rules that fix that and the one that keeps it fixed:
//
//   • the BG picker's array is the array `resolveDisplayedBg` hands the canvas,
//     resolved through THAT function and not a second copy of its order;
//   • the thumbnail cache key discriminates two arrays of the SAME LENGTH, which
//     the old `(zoneId, paletteLine, tiles.length)` key could not;
//   • an index means a different thing per layer, so there are two picks;
//   • the labels name the space the index lives in.
//
// The fixtures below deliberately give the FG tileset and the BG blob the SAME
// LENGTH wherever the row is about telling them apart: a row that only passed
// because 919 !== 320 would go green on the broken code the day the two counts
// coincided.

import { describe, it, expect } from 'vitest';
import {
  resolveTilePickerSource, tilePickerCountLabel, tilePickerHoverLabel,
  pickedTileIndex, tileThumbCacheStale,
} from '../tile-picker-source';
import { resolveDisplayedBg } from '../bganim-preview-aeon';
import type { Act, BgLibraryEntry, Section, Tile, Zone } from '../../../core/model/s4-types';
import type { BgOverrideState } from '../../../core/formats/bg-override/bg-override-io';
import {
  BG_OVERRIDE_CONSUMER_OUT_DIR, BG_LAYOUT_WORDS, TILE_PIXELS,
  type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';

/** Tiles recognisable by their pixels: the seed is readable off pixel 0. */
function rawTiles(n: number, seed: number): number[][] {
  return Array.from({ length: n }, (_, t) =>
    Array.from({ length: TILE_PIXELS }, (_, p) => (seed + t + p) & 0xF));
}
const modelTiles = (n: number, seed: number): Tile[] =>
  rawTiles(n, seed).map((t) => ({ pixels: Uint8Array.from(t) }));

function doc(seed: number, tileCount: number): BgOverrideDocument {
  return {
    layout: Array.from({ length: BG_LAYOUT_WORDS }, () => seed),
    tiles: rawTiles(tileCount, seed),
  };
}
const holder = (d: BgOverrideDocument | null): BgOverrideState =>
  ({ path: 'p', doc: d, unreadable: null, loadedText: null, notices: [] });

const section = (bgLayoutRef: string | null): Section =>
  ({ bgLayoutRef, sceneRef: null } as unknown as Section);

/** THE SAME TILE COUNT everywhere by default — see the header. */
const N = 16;

function act(stripPath: string | null, sectionRef: string | null): Act {
  return {
    id: 'act1', gridWidth: 1, gridHeight: 1,
    sections: [section(sectionRef)],
    startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
    bgLayout: new Uint16Array(BG_LAYOUT_WORDS).fill(0xAC7),
    bgTiles: modelTiles(N, 9),
    sceneRef: null,
    stripPath,
  } as unknown as Act;
}

const LIB: BgLibraryEntry[] = [{
  id: 'lib-1', name: 'lib',
  layout: new Uint16Array(BG_LAYOUT_WORDS).fill(0x11B),
  tiles: modelTiles(N, 5),
}];

const zone = (tiles: Tile[]): Zone =>
  ({ id: 'z', name: 'Zone', tileset: { tiles }, palette: { lines: [] } } as unknown as Zone);

const FG = modelTiles(N, 1);
const BOUND = `${BG_OVERRIDE_CONSUMER_OUT_DIR}/`;
const UNBOUND = `${BG_OVERRIDE_CONSUMER_OUT_DIR.replace(/act1$/, 'act2')}/`;

describe('resolveTilePickerSource — the picker shows the array the stroke writes', () => {
  it('shows the zone TILESET in FG mode, by array identity', () => {
    const s = resolveTilePickerSource('fg', zone(FG), act(BOUND, 'lib-1'), LIB, 0, holder(doc(3, N)));
    expect(s.origin).toBe('tileset');
    expect(s.tiles).toBe(FG);            // identity, not shape: this IS the array
    expect(s.libraryId).toBeNull();
  });

  it('shows the OVERRIDE blob in BG mode on the act aeon bakes it into', () => {
    const h = holder(doc(3, N));
    const a = act(BOUND, 'lib-1');
    const s = resolveTilePickerSource('bg', zone(FG), a, LIB, 0, h);
    expect(s.origin).toBe('override');
    // IT IS THE RESOLVER'S OWN ARRAY, not a lookalike: the canvas holds this
    // array by reference, and an equal-but-separate copy is exactly the
    // divergence resolveDisplayedBg exists to prevent.
    expect(s.tiles).toBe(resolveDisplayedBg(a, LIB, 0, h)!.tiles);
    // ...and it is NOT the foreground art, at equal length.
    expect(s.tiles.length).toBe(FG.length);
    expect([...s.tiles[0].pixels]).not.toEqual([...FG[0].pixels]);
  });

  it('shows the section\'s BG-LIBRARY entry when the override binds nothing', () => {
    const s = resolveTilePickerSource('bg', zone(FG), act(UNBOUND, 'lib-1'), LIB, 0, holder(doc(3, N)));
    expect(s.origin).toBe('library');
    expect(s.libraryId).toBe('lib-1');
    expect(s.tiles).toBe(LIB[0].tiles);
  });

  it('falls back to the ACT plane when the section names no library entry', () => {
    const a = act(UNBOUND, null);
    const s = resolveTilePickerSource('bg', zone(FG), a, LIB, 0, holder(null));
    expect(s.origin).toBe('act');
    expect(s.tiles).toBe(a.bgTiles);
  });

  it('follows the ACTIVE SECTION, because a library ref is per section', () => {
    const a = act(UNBOUND, 'lib-1');
    a.sections = [section('lib-1'), section(null)];
    expect(resolveTilePickerSource('bg', zone(FG), a, LIB, 0, holder(null)).origin).toBe('library');
    expect(resolveTilePickerSource('bg', zone(FG), a, LIB, 1, holder(null)).origin).toBe('act');
  });

  it('reports nothing rather than guessing when there is no background at all', () => {
    const a = act(UNBOUND, null);
    (a as { bgLayout: Uint16Array | null }).bgLayout = null;
    const s = resolveTilePickerSource('bg', zone(FG), a, [], 0, holder(null));
    expect(s.origin).toBe('none');
    expect(s.tiles).toEqual([]);
    // NOT the foreground tileset — falling back to it is the whole defect.
    expect(s.tiles).not.toBe(FG);
  });

  it('reports nothing in FG mode with no zone', () => {
    expect(resolveTilePickerSource('fg', null, act(BOUND, null), LIB, 0, holder(null)).origin)
      .toBe('none');
  });
});

describe('the thumbnail cache key discriminates what LENGTH could not', () => {
  const a = modelTiles(N, 1);
  const b = modelTiles(N, 2);

  it('is stale for a DIFFERENT array of the SAME LENGTH — the old key\'s blind spot', () => {
    expect(a.length).toBe(b.length);                     // the precondition
    expect([...a[0].pixels]).not.toEqual([...b[0].pixels]); // ...and different art
    expect(tileThumbCacheStale({ tiles: a, paletteLine: 0 }, b, 0)).toBe(true);
  });

  it('is fresh for the same array and palette line — it is a cache, after all', () => {
    expect(tileThumbCacheStale({ tiles: a, paletteLine: 2 }, a, 2)).toBe(false);
  });

  it('is stale when only the palette line moves', () => {
    expect(tileThumbCacheStale({ tiles: a, paletteLine: 2 }, a, 3)).toBe(true);
  });

  it('is stale from empty', () => {
    expect(tileThumbCacheStale({ tiles: null, paletteLine: -1 }, a, 0)).toBe(true);
  });

  it('is stale for a REBUILT array with identical contents, and that is correct', () => {
    // bgOverrideDisplay rebuilds `tiles` exactly when `doc.tiles` is replaced —
    // which is what a band insert/remove does. Rebuilding thumbnails that turn
    // out identical costs one atlas pass; NOT rebuilding when the art moved is a
    // picker showing tiles the document no longer has.
    const clone = a.map((t) => ({ pixels: Uint8Array.from(t.pixels) }));
    expect(tileThumbCacheStale({ tiles: a, paletteLine: 0 }, clone, 0)).toBe(true);
  });
});

describe('two picks, because there are two spaces', () => {
  it('reads the pick belonging to the layer', () => {
    const sel = { selectedTileIndex: 500, selectedBgTileIndex: 7 };
    expect(pickedTileIndex(sel, 'fg')).toBe(500);
    expect(pickedTileIndex(sel, 'bg')).toBe(7);
  });

  it('does not carry a foreground index into the background, and does not clamp it', () => {
    // The two rejected alternatives, stated as a property. A single value would
    // have to hand 500 to a 320-tile blob (a lie) or move it (a silent change to
    // what the author picked). The BG pick simply is not 500.
    const sel = { selectedTileIndex: 500, selectedBgTileIndex: 7 };
    const blobLength = 320;
    expect(pickedTileIndex(sel, 'bg')).not.toBe(sel.selectedTileIndex);
    expect(pickedTileIndex(sel, 'bg')).toBeLessThan(blobLength);
    expect(sel.selectedTileIndex).toBeGreaterThan(blobLength); // anti-vacuous
  });
});

describe('the labels name the space the index lives in', () => {
  const fg = resolveTilePickerSource('fg', zone(FG), act(BOUND, null), LIB, 0, holder(null));
  const bg = resolveTilePickerSource('bg', zone(FG), act(BOUND, null), LIB, 0, holder(doc(3, N)));

  it('counts in each layer\'s own words, and the words differ', () => {
    expect(tilePickerCountLabel(fg)).toBe(`${N} tiles`);
    expect(tilePickerCountLabel(bg)).toBe(`${N} background tiles`);
    expect(tilePickerCountLabel(fg)).not.toBe(tilePickerCountLabel(bg)); // equal counts, distinct labels
  });

  it('says so when there is no background rather than reporting 0 of something', () => {
    const a = act(UNBOUND, null);
    (a as { bgLayout: Uint16Array | null }).bgLayout = null;
    const none = resolveTilePickerSource('bg', zone(FG), a, [], 0, holder(null));
    expect(tilePickerCountLabel(none)).toBe('no background here');
  });

  it('marks a BG hover as a blob slot', () => {
    expect(tilePickerHoverLabel(fg, 10)).toBe('#10 (0xA)');
    expect(tilePickerHoverLabel(bg, 10)).toBe('bg #10 (0xA)');
  });

  it('is empty off the end of the array and for no hover', () => {
    expect(tilePickerHoverLabel(bg, N)).toBe('');
    expect(tilePickerHoverLabel(bg, -1)).toBe('');
  });
});
