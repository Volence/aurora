// The overlay half of the band preview: which cells it claims, which bands it
// refuses, and what lands in the buffer.
//
// Canvas-free on purpose — `composeBandOverlay` writes into a plain byte array
// and `BgAnimPreviewRenderer.prepare` touches no canvas API, so both are visible
// to the node suite. What is NOT visible here is that the buffer reaches the
// screen; that is the CDP harness's job (scratchpad/bganim-motion-harness.mjs)
// and no row below should be read as evidence of it.

import { describe, it, expect } from 'vitest';
import { composeBandOverlay, type BandOverlayCell } from '../../src/renderer/canvas/bganim-compose';
import { BgAnimPreviewRenderer } from '../../src/renderer/canvas/BgAnimPreviewRenderer';
import { BGANIM_PHASE_BANKS, TILE_PIXELS, type BgOverrideBand }
  from '../../src/core/formats/bg-override/bg-override';
import { packNametableWord } from '../../src/core/model/s4-types';
import type { PaletteLine, Tile } from '../../src/core/model/s4-types';

/** A band whose bank/slot is recoverable from any of its pixels. */
function band(over: Partial<BgOverrideBand> = {}): BgOverrideBand {
  const cols = over.cols ?? 4;
  const rows = over.rows ?? 2;
  const n = cols * rows;
  return {
    cols, rows, pattern_px: cols * 8,
    phases: Array.from({ length: BGANIM_PHASE_BANKS }, (_, b) =>
      Array.from({ length: n }, (_, t) =>
        Array.from({ length: TILE_PIXELS }, () => (b * 16 + t) & 0xF))),
    ...over,
  } as BgOverrideBand;
}

const asTiles = (rows: number[][]): Tile[] => rows.map((p) => ({ pixels: Uint8Array.from(p) }));
const palette = (): PaletteLine[] => Array.from({ length: 4 }, () => ({
  colors: Array.from({ length: 16 }, (_, i) => ({ r: i, g: i, b: i, a: 255 })),
}));

/** A recognisable 8x8 RGBA tile: every byte carries `mark`. */
const marked = (mark: number) => Uint8ClampedArray.from(new Array(8 * 8 * 4).fill(mark & 0xFF));

describe('composeBandOverlay', () => {
  const dest = () => new Uint8ClampedArray(4 * 8 * 2 * 8 * 4); // 4x2 cells

  it('writes ONLY the cells it is given and leaves the rest transparent', () => {
    const d = dest();
    d.fill(0xEE); // prove the compose clears rather than accumulating
    const cells: BandOverlayCell[] = [
      { cell: 0, band: 0, localSlot: 0, palette: 0, hFlip: false, vFlip: false },
    ];
    composeBandOverlay(d, 32, 16, 4, cells, [{ cols: 4, rows: 2, bank: 0, coarseColumns: 0 }],
      () => marked(0x7F));
    // Cell 0 is the top-left 8x8; every byte in it is 0x7F.
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) expect(d[(r * 32 + c) * 4]).toBe(0x7F);
    }
    // Cell 1 (x 8..15) is untouched => transparent, NOT the 0xEE it started as.
    expect(d[(0 * 32 + 8) * 4]).toBe(0);
    expect(d[(0 * 32 + 8) * 4 + 3]).toBe(0);
  });

  it('asks the lookup for the slot the coarse rotation moved the art to', () => {
    const asked: [number, number, number, number][] = [];
    const cells: BandOverlayCell[] = Array.from({ length: 8 }, (_, t) => ({
      cell: t, band: 0, localSlot: t, palette: 1, hFlip: false, vFlip: false,
    }));
    composeBandOverlay(dest(), 32, 16, 4, cells,
      [{ cols: 4, rows: 2, bank: 3, coarseColumns: 1 }],
      (b, bank, slot, pal) => { asked.push([b, bank, slot, pal]); return marked(1); });
    // cols 4, rows 2, coarse 1: dest column j is fed by art column (j+1)%4, so
    // slot t=col*2+row maps to ((col+1)%4)*2+row.
    expect(asked.map((a) => a[2])).toEqual([2, 3, 4, 5, 6, 7, 0, 1]);
    expect(asked.every((a) => a[1] === 3 && a[3] === 1)).toBe(true);
  });

  it('applies the cell\'s own flips to the substituted art', () => {
    const src = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 0; i < 64; i++) src[i * 4] = i;      // R channel = pixel ordinal
    const d = dest();
    composeBandOverlay(d, 32, 16, 4,
      [{ cell: 0, band: 0, localSlot: 0, palette: 0, hFlip: true, vFlip: false }],
      [{ cols: 4, rows: 2, bank: 0, coarseColumns: 0 }], () => src);
    expect(d[0]).toBe(7);          // leftmost dest pixel is the source's rightmost
    expect(d[7 * 4]).toBe(0);
  });

  it('skips a cell whose art has no bitmap rather than painting something', () => {
    const d = dest();
    composeBandOverlay(d, 32, 16, 4,
      [{ cell: 0, band: 0, localSlot: 0, palette: 9, hFlip: false, vFlip: false }],
      [{ cols: 4, rows: 2, bank: 0, coarseColumns: 0 }], () => null);
    expect([...d].every((b) => b === 0)).toBe(true);
  });
});

describe('BgAnimPreviewRenderer.prepare — the licence check and the cell scan', () => {
  const b = band();
  const n = b.cols * b.rows;
  /** A blob whose first `n` tiles ARE the band's rest art — the licensed case. */
  const coherentBlob = () => asTiles([...b.phases[0], ...b.phases[0]]);
  /** The band's slot 3 holding somebody else's art — the live tree's shape. */
  const divergedBlob = () => {
    const t = coherentBlob();
    t[3] = { pixels: Uint8Array.from(b.phases[0][3].map((p) => p ^ 0xF)) };
    return t;
  };
  // Palette line 1, so a cell naming slot 0 is a NONZERO word — a word of
  // exactly 0 is the blank escape and is a different case (its own row below).
  const nametable = (indices: number[]) => Uint16Array.from(
    indices.map((i) => (i < 0 ? 0 : packNametableWord(i, 1, false, false, false))));

  it('claims every cell that draws a licensed band\'s slots, and no others', () => {
    const r = new BgAnimPreviewRenderer();
    r.prepare({
      bands: [b], nametable: nametable([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 12]),
      widthTiles: 4, heightTiles: 3, blobTiles: coherentBlob(), paletteLines: palette(),
    }, 'sig-1');
    expect(r.hasDrawableCells()).toBe(true);
    expect(r.bandVerdicts()).toEqual([
      { index: 0, driver: '', rateShift: -1, cells: n, refusal: null },
    ]);
  });

  it('REFUSES a band whose rest art is not the art on screen — the divergence guard', () => {
    const r = new BgAnimPreviewRenderer();
    r.prepare({
      bands: [b], nametable: nametable([0, 1, 2, 3, 4, 5, 6, 7]),
      widthTiles: 4, heightTiles: 2, blobTiles: divergedBlob(), paletteLines: palette(),
    }, 'sig-2');
    // Not "no bands" and not a silent pass: no cells claimed, and a reason.
    expect(r.hasDrawableCells()).toBe(false);
    expect(r.bandVerdicts()[0].refusal).toMatch(/slot 3 on screen is not the band's rest art/);
    expect(r.bandVerdicts()[0].cells).toBe(0);
  });

  it('never claims a layout word of exactly 0, which renders blank and not tiles[0]', () => {
    const r = new BgAnimPreviewRenderer();
    r.prepare({
      bands: [b], nametable: Uint16Array.from([0, 0, 0, 0]),
      widthTiles: 4, heightTiles: 1, blobTiles: coherentBlob(), paletteLines: palette(),
    }, 'sig-3');
    expect(r.hasDrawableCells()).toBe(false);
    // ...and the band is still LICENSED — "nothing draws it" is not "it is wrong".
    expect(r.bandVerdicts()[0].refusal).toBeNull();
    expect(r.bandVerdicts()[0].cells).toBe(0);
  });

  it('licenses bands one at a time: a refused band does not take a good one with it', () => {
    const second = band({ cols: 2, rows: 2, driver: 'timer' });
    const blob = [...divergedBlob().slice(0, n), ...asTiles(second.phases[0])];
    const r = new BgAnimPreviewRenderer();
    r.prepare({
      bands: [b, second], nametable: nametable([0, 1, 8, 9, 10, 11]),
      widthTiles: 6, heightTiles: 1, blobTiles: blob, paletteLines: palette(),
    }, 'sig-4');
    expect(r.bandVerdicts()[0].refusal).not.toBeNull();
    expect(r.bandVerdicts()[1].refusal).toBeNull();
    expect(r.bandVerdicts()[1].cells).toBe(4);   // slots 8..11
    expect(r.hasDrawableCells()).toBe(true);
  });

  it('only a REFUSED band\'s driver is kept out of the clock decision', () => {
    // The band that would need a clock is the one that is refused; nothing may
    // start a rAF for a band that cannot be drawn.
    const timer = band({ driver: 'timer' });
    const r = new BgAnimPreviewRenderer();
    r.prepare({
      bands: [timer], nametable: nametable([0, 1, 2, 3]),
      widthTiles: 4, heightTiles: 1, blobTiles: divergedBlob(), paletteLines: palette(),
    }, 'sig-5');
    expect(r.timerBandCount()).toBe(0);

    const ok = new BgAnimPreviewRenderer();
    ok.prepare({
      bands: [timer], nametable: nametable([0, 1, 2, 3]),
      widthTiles: 4, heightTiles: 1, blobTiles: asTiles(timer.phases[0]), paletteLines: palette(),
    }, 'sig-6');
    expect(ok.timerBandCount()).toBe(1);
    // ...and a camera band, licensed and drawn, still needs NO clock.
    const cam = new BgAnimPreviewRenderer();
    cam.prepare({
      bands: [band({ driver: 'camera_y' })], nametable: nametable([0, 1, 2, 3]),
      widthTiles: 4, heightTiles: 1, blobTiles: coherentBlob(), paletteLines: palette(),
    }, 'sig-7');
    expect(cam.hasDrawableCells()).toBe(true);
    expect(cam.timerBandCount()).toBe(0);
  });

  it('re-prepares on a new signature and no-ops on the same one', () => {
    const r = new BgAnimPreviewRenderer();
    const source = {
      bands: [b], nametable: nametable([0, 1, 2, 3]),
      widthTiles: 4, heightTiles: 1, blobTiles: coherentBlob(), paletteLines: palette(),
    };
    r.prepare(source, 'v1');
    expect(r.hasDrawableCells()).toBe(true);
    // Same signature, emptied source: ignored, because the caller says nothing moved.
    r.prepare({ ...source, bands: [] }, 'v1');
    expect(r.hasDrawableCells()).toBe(true);
    // New signature: taken.
    r.prepare({ ...source, bands: [] }, 'v2');
    expect(r.hasDrawableCells()).toBe(false);
    expect(r.bandVerdicts()).toEqual([]);
  });
});
