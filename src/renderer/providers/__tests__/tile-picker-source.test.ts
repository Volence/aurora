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
  pickedTileIndex, tileThumbCacheStale, tilePickerBandGroups, tilePickerBandLabel,
  tilePickerBandHint,
} from '../tile-picker-source';
import { readFileSync } from 'node:fs';
import { NO_SLOTS_PHRASE } from '../bg-anim-aeon';
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

describe('resolveTilePickerSource: the picker shows the array the stroke writes', () => {
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

  it('is stale for a DIFFERENT array of the SAME LENGTH: the old key\'s blind spot', () => {
    expect(a.length).toBe(b.length);                     // the precondition
    expect([...a[0].pixels]).not.toEqual([...b[0].pixels]); // ...and different art
    expect(tileThumbCacheStale({ tiles: a, paletteLine: 0 }, b, 0)).toBe(true);
  });

  it('is fresh for the same array and palette line: it is a cache, after all', () => {
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

// THE ANIMATED PREFIX, GROUPED BY BAND (parcel J, triage 2026-08-26 §A.8).
// A band is `cols x rows` slots laid COLUMN-major in the picture, so the picker
// shows each band's phase-0 pattern as ONE picture, selectable as a unit, and
// the stamp lays exactly that pattern. Slot bases are derived by walking the
// list (bandSlotBases), never typed; the fixtures use two shapes so a rule
// that only held for 8x4 would show.
describe('tilePickerBandGroups: the prefix by band', () => {
  const band = (cols: number, rows: number) => ({
    cols, rows, pattern_px: cols * 8,
    phases: Array.from({ length: 8 }, () => rawTiles(cols * rows, 0)),
  });
  function bandedDoc(): BgOverrideDocument {
    const a = band(8, 4), b = band(4, 2);
    const total = 8 * 4 + 4 * 2 + N;
    return { layout: doc(0, total).layout, tiles: rawTiles(total, 3), anims: [a, b] };
  }

  it('is one group per band, in band order, with derived slot bases and labels', () => {
    const h = holder(bandedDoc());
    const s = resolveTilePickerSource('bg', zone(FG), act(BOUND, 'lib-1'), LIB, 0, h);
    const groups = tilePickerBandGroups(s, h);
    expect(groups.map((g) => g.index)).toEqual([0, 1]);
    expect(groups.map((g) => g.slotBase)).toEqual([0, 8 * 4]);
    expect(groups.map((g) => g.label)).toEqual(['Band 0 · 8x4', 'Band 1 · 4x2']);
  });

  it("a group's picture is the band's slots laid column-major, row-major over the picture", () => {
    const h = holder(bandedDoc());
    const s = resolveTilePickerSource('bg', zone(FG), act(BOUND, 'lib-1'), LIB, 0, h);
    const g = tilePickerBandGroups(s, h)[1];
    expect(g.cols).toBe(4); expect(g.rows).toBe(2);
    expect(g.slots).toHaveLength(g.cols * g.rows);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        expect(g.slots[r * g.cols + c]).toBe(g.slotBase + c * g.rows + r);
      }
    }
    // Every slot of the picture is inside the picker's own array.
    for (const slot of g.slots) expect(slot).toBeLessThan(s.tiles.length);
  });

  it('is empty when the picker is not showing the override, or it has no bands', () => {
    const banded = holder(bandedDoc());
    expect(tilePickerBandGroups(
      resolveTilePickerSource('fg', zone(FG), act(BOUND, 'lib-1'), LIB, 0, banded), banded,
    )).toEqual([]);
    expect(tilePickerBandGroups(
      resolveTilePickerSource('bg', zone(FG), act(UNBOUND, 'lib-1'), LIB, 0, banded), banded,
    )).toEqual([]);
    const plain = holder(doc(3, N));
    expect(tilePickerBandGroups(
      resolveTilePickerSource('bg', zone(FG), act(BOUND, 'lib-1'), LIB, 0, plain), plain,
    )).toEqual([]);
  });

  // ═══ THE BAND READOUT: ONE LINE THAT FITS, AND THE REST ON THE TITLE ═══
  //
  // RE-CUT for the picker-label-fit parcel. The row below asserted
  // `band 0 · slots 0..31 (8x4)` as the LINE, and that string was measured at
  // 155px in the picker's 106px hover box — `whiteSpace: nowrap` with an
  // ellipsis, i.e. ~30% of it invisible on the only surface a hovered card has.
  // It is now the TITLE, verbatim, and the line is the span plus a two-character
  // band tag. The pixels are a CDP job (`bganim-strip-range-harness.mjs`
  // [6k]/[6l]/[6m]); what node can hold is the wording and the convention.
  //
  // ⚠ THE ENDS ARE DERIVED FROM `g.slots`, NOT RE-MULTIPLIED. `slots` is built
  // by the row/col walk above — a different code path from the `cols * rows`
  // the label is composed through — so an expectation written this way does not
  // move with the arithmetic it is checking. Expectations spelled
  // `slotSpanDigits(...)` would go green on a poisoned helper, which is the
  // trap item 54's own rows were re-cut around.
  const lastOwned = (g: { slots: number[] }): number => Math.max(...g.slots);

  it('the LINE names the last slot the band contains, with a tag for which band', () => {
    const h = holder(bandedDoc());
    const s = resolveTilePickerSource('bg', zone(FG), act(BOUND, 'lib-1'), LIB, 0, h);
    const [g0, g1] = tilePickerBandGroups(s, h);
    expect(tilePickerBandLabel(g0)).toBe(`b0 · ${g0.slotBase}..${lastOwned(g0)}`);
    // The SECOND band is the one that discriminates: its base is past zero, so
    // a label that printed the count instead of the span, or the first slot
    // past the range instead of the last one in it, differs here.
    expect(g1.slotBase).toBe(8 * 4);
    expect(tilePickerBandLabel(g1)).toBe(`b1 · ${g1.slotBase}..${lastOwned(g1)}`);
    expect(tilePickerBandLabel(g1)).not.toContain(`..${lastOwned(g1) + 1}`);
  });

  it('and the LINE is short: no noun, no geometry; both are on the card already', () => {
    const h = holder(bandedDoc());
    const s = resolveTilePickerSource('bg', zone(FG), act(BOUND, 'lib-1'), LIB, 0, h);
    const g = tilePickerBandGroups(s, h)[0];
    // NOT A CHARACTER BUDGET — that is the vacuous check this parcel exists to
    // replace, and the box is measured in the harness. These are the two
    // SUBSTRINGS the fit measurement removed, so a quiet restoration of either
    // is caught here rather than only in a build nobody runs.
    expect(tilePickerBandLabel(g)).not.toContain('slots');
    expect(tilePickerBandLabel(g)).not.toContain(`${g.cols}x${g.rows}`);
    // And the card itself is where both of them still are, unchanged.
    expect(g.label).toBe(`Band ${g.index} · ${g.cols}x${g.rows}`);
  });

  it('the TITLE keeps everything the line dropped, in the words with room for them', () => {
    const h = holder(bandedDoc());
    const s = resolveTilePickerSource('bg', zone(FG), act(BOUND, 'lib-1'), LIB, 0, h);
    const [g0, g1] = tilePickerBandGroups(s, h);
    // Verbatim what the LINE used to say — the glance shortened, the
    // information did not disappear.
    expect(tilePickerBandHint(g0)).toBe('band 0 · slots 0..31 (8x4)');
    expect(tilePickerBandHint(g1))
      .toBe(`band 1 · slots ${g1.slotBase}..${lastOwned(g1)} (${g1.cols}x${g1.rows})`);
    // Every span-bearing thing the line dropped is here, and the span agrees
    // with the line's own.
    expect(tilePickerBandHint(g1)).toContain(tilePickerBandLabel(g1).replace(/^b\d+ · /, ''));
    expect(tilePickerBandHint(g1)).not.toContain(`..${lastOwned(g1) + 1}`);
  });

  it('an empty band is still not a backwards range', () => {
    // `TilePickerBandGroup` is exported and both readouts are total over it, so
    // a zero-slot group is reachable even though `tilePickerBandGroups` cannot
    // build one. `slotSpanDigits`/`slotSpanPhrase` decide what nothing is
    // called; a local `${base}..${base + n - 1}` would print `40..39`.
    const empty = { index: 2, cols: 0, rows: 4, slotBase: 40, label: 'Band 2 · 0x4', slots: [] };
    expect(tilePickerBandLabel(empty)).toBe(`b2 · ${NO_SLOTS_PHRASE}`);
    expect(tilePickerBandLabel(empty)).not.toContain('..');
    expect(tilePickerBandHint(empty)).toBe(`band 2 · ${NO_SLOTS_PHRASE} (0x4)`);
  });
});

// ---------------------------------------------------------------------------
// THE CONVENTION HAS ONE SPELLING — and a comment is not a call
// ---------------------------------------------------------------------------
//
// This file was item 54's FOURTH spelling of the inclusive span: it computed
// `g.slotBase + g.cols * g.rows - 1` inline, rendered the right answer, and sat
// outside every file that sweep touched — which is exactly why nothing caught
// it. The rows below pin the routing, not the output, so the next narrow
// readout cannot save six characters by re-deriving the span.
//
// ⚠ COMMENTS ARE STRIPPED FIRST. A whole-file `toMatch` over a `.ts` is
// satisfied by a comment QUOTING the call — measured three times in this repo
// this week — and this module's own doc comments now name both helpers and
// print a hand-rolled span as the thing not to write. Both would satisfy an
// unstripped match. (The module carries no `://`, so eating `//` to
// end-of-line takes nothing but comments — checked.)
describe('tile-picker-source: one spelling of the slot-span convention', () => {
  const src = readFileSync('src/renderer/providers/tile-picker-source.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('the stripped source is still the module', () => {
    // Anti-vacuous: a strip that ate the file would pass every negative below.
    expect(src).toMatch(/export function tilePickerBandLabel/);
    expect(src).toMatch(/export function tilePickerBandHint/);
    expect(src).toMatch(/export function tilePickerBandGroups/);
  });

  it('both readouts reach the shared helper, and neither formats a span inline', () => {
    expect(src).toMatch(/slotSpanDigits\(/);
    expect(src).toMatch(/slotSpanPhrase\(/);
    // The shape the old label had: an interpolated `${…}..${…}` span.
    expect(src.match(/\.\.\$?\{/g) ?? []).toEqual([]);
    // The COUNT is computed in exactly one place on the readout path, so the
    // two forms cannot be handed different lengths of the same range.
    expect(src.match(/bandSlotCount\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    // `last` was the local the old label summed into; nothing reintroduces it.
    expect(src).not.toMatch(/const last = /);
  });
});
