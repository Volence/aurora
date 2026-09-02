// WHICH BACKGROUND DOES THE MAP CANVAS PAINT?
//
// One function answers it for the viewport, for the paint gesture and for the
// band preview's licence check, and that is the point: the licence is a claim
// about the blob ON SCREEN, so a second resolver that agreed today would be free
// to disagree later and the failure would be invisible (right art, wrong cells,
// no error).
//
// The ORDER these rows pin is decision d-12 — "the game's copy wins". The
// override document is what aeon's injector bakes into the act's zone_bg.bin, so
// on the act it binds it outranks both the BG library and the act default. On
// every OTHER act it is not even consulted: it says nothing about them, and a
// substitution applied game-wide would paint one act's background over another's.

import { describe, it, expect } from 'vitest';
import { resolveDisplayedBg } from '../bganim-preview-aeon';
import type { Act, BgLibraryEntry, Section, Tile } from '../../../core/model/s4-types';
import type { BgOverrideState } from '../../../core/formats/bg-override/bg-override-io';
import { unknownWiring } from '../../../core/formats/effects/section-wiring';
import {
  BG_OVERRIDE_CONSUMER_OUT_DIR, BG_LAYOUT_WORDS, TILE_PIXELS,
  type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';

/** A blob whose tiles are recognisable by their first pixel. */
function tiles(n: number, seed: number): number[][] {
  return Array.from({ length: n }, (_, t) =>
    Array.from({ length: TILE_PIXELS }, (_, p) => (seed + t + p) & 0xF));
}
function modelTiles(n: number, seed: number): Tile[] {
  return tiles(n, seed).map((t) => ({ pixels: Uint8Array.from(t) }));
}

function doc(seed: number): BgOverrideDocument {
  return {
    layout: Array.from({ length: BG_LAYOUT_WORDS }, () => seed),
    tiles: tiles(8, seed),
  };
}

function holder(d: BgOverrideDocument | null): BgOverrideState {
  return { path: 'p', doc: d, unreadable: null, loadedText: null, notices: [] };
}

function section(bgLayoutRef: string | null): Section {
  return { bgLayoutRef, sceneRef: null } as unknown as Section;
}

function act(stripPath: string | null, sectionRef: string | null): Act {
  return {
    id: 'act1', gridWidth: 1, gridHeight: 1,
    sections: [section(sectionRef)],
    startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
    bgLayout: new Uint16Array(BG_LAYOUT_WORDS).fill(0xAC7),
    bgTiles: modelTiles(8, 9),
    rasterWiring: unknownWiring('(fixture)', '(fixture)', 'a hand-built act reads no aeon files'),
      sceneRef: null,
    stripPath,
  };
}

const LIB: BgLibraryEntry[] = [{
  id: 'lib-1', name: 'lib',
  layout: new Uint16Array(BG_LAYOUT_WORDS).fill(0x11B),
  tiles: modelTiles(8, 5),
}];

const BOUND = `${BG_OVERRIDE_CONSUMER_OUT_DIR}/`;
const UNBOUND = `${BG_OVERRIDE_CONSUMER_OUT_DIR.replace(/act1$/, 'act2')}/`;

describe('resolveDisplayedBg — the override outranks the library on the act it binds', () => {
  it('paints the OVERRIDE on the bound act, even when the section names a library entry', () => {
    const r = resolveDisplayedBg(act(BOUND, 'lib-1'), LIB, 0, holder(doc(3)));
    expect(r?.source).toBe('override');
    expect(r?.layout[0]).toBe(3);
    expect([...(r?.tiles[0].pixels ?? [])]).toEqual(doc(3).tiles[0]);
    // Anti-vacuous: the library entry it beat is really there and really differs.
    expect(LIB[0].layout[0]).toBe(0x11B);
    expect(r?.libraryId).toBeNull();
  });

  it('paints the LIBRARY on an act the override does NOT bind — the anti-regression half', () => {
    const r = resolveDisplayedBg(act(UNBOUND, 'lib-1'), LIB, 0, holder(doc(3)));
    expect(r?.source).toBe('library');
    expect(r?.layout).toBe(LIB[0].layout);
    expect(r?.libraryId).toBe('lib-1');
  });

  it('paints the ACT DEFAULT on an unbound act whose section names nothing', () => {
    const r = resolveDisplayedBg(act(UNBOUND, null), LIB, 0, holder(doc(3)));
    expect(r?.source).toBe('act');
    expect(r?.layout[0]).toBe(0xAC7);
  });

  it('paints the ACT DEFAULT on an unbound act whose ref DANGLES', () => {
    const r = resolveDisplayedBg(act(UNBOUND, 'gone'), LIB, 0, holder(doc(3)));
    expect(r?.source).toBe('act');
  });

  it('falls back to the library when the bound act has NO readable document', () => {
    // Absent and unreadable both arrive as `doc: null`, and neither is a reason
    // to show a blank plane — the act still has a background.
    const r = resolveDisplayedBg(act(BOUND, 'lib-1'), LIB, 0, holder(null));
    expect(r?.source).toBe('library');
  });

  it('falls back when no override state is passed at all', () => {
    expect(resolveDisplayedBg(act(BOUND, 'lib-1'), LIB, 0)?.source).toBe('library');
    expect(resolveDisplayedBg(act(BOUND, 'lib-1'), LIB, 0, null)?.source).toBe('library');
  });

  it('falls back when the document carries an EMPTY plane', () => {
    const d = doc(3);
    d.layout = [];
    expect(resolveDisplayedBg(act(BOUND, 'lib-1'), LIB, 0, holder(d))?.source).toBe('library');
  });

  it('returns null when there is no background anywhere', () => {
    const a = act(UNBOUND, null);
    a.bgLayout = null;
    a.bgTiles = null;
    expect(resolveDisplayedBg(a, [], 0, holder(null))).toBeNull();
  });

  it('hands back THE SAME layout array each time for the override — the renderer holds it', () => {
    const h = holder(doc(3));
    const a = act(BOUND, 'lib-1');
    expect(resolveDisplayedBg(a, LIB, 0, h)?.layout)
      .toBe(resolveDisplayedBg(a, LIB, 0, h)?.layout);
  });

  it('measures the plane height from the document rather than assuming 64 rows', () => {
    const d = doc(3);
    d.layout = d.layout.slice(0, BG_LAYOUT_WORDS / 2);
    const r = resolveDisplayedBg(act(BOUND, null), LIB, 0, holder(d));
    expect(r?.source).toBe('override');
    expect(r?.layout.length).toBe(BG_LAYOUT_WORDS / 2);
  });
});
