// providers/bg-anim-art — the composer's door onto band art (parcel I).
//
// What these rows hold: the cell→slot mapping is COLUMN-MAJOR (the runtime's
// order, shiftedPhaseBanks' order); a stroke on bank 0 / a static slot becomes
// `set-bg-override-tiles` and a stroke on bank k becomes `set-bg-override-phases`
// for that bank alone; the thumbnail is the band's `cols*8 x rows*8` pattern;
// `Shift` is a refusal, not a throw, on a band that does not exist.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseBgOverride, TILE_PIXELS, TILE_WIDTH_PX, BGANIM_PHASE_BANKS, bandTileCount,
  type BgOverrideDocument,
} from '../../../core/formats/bg-override/bg-override';
import { documentBands, bandSlotBases } from '../../../core/formats/bg-override/bg-anim-band';
import { lutFromColors } from '../../../core/art/rasterize';
import {
  bgArtAtlas, bgArtCellAtlasIndex, bgArtCommitCommand, bgArtTargetExists, bankThumbnail,
  openBandBankDocument, openBgTileDocument, regenerateShiftCommand, bgPaletteLine,
  SHIFT_BUTTON_LABEL, SHIFT_BUTTON_TITLE,
} from '../bg-anim-art';

const FIXTURE = resolve(__dirname, '../../../../test/fixtures/bg-override/editor_bg_override.b0e5a661.json');
const golden = (): BgOverrideDocument => parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;

describe('cell → slot mapping is column-major', () => {
  it('cell (c, r) of a bank document names slot c*rows + r, offset by the band\'s base for bank 0', () => {
    const doc = golden();
    const bands = documentBands(doc);
    const bases = bandSlotBases(bands);
    const bandIndex = bands.length - 1;
    const band = bands[bandIndex];
    for (let r = 0; r < band.rows; r++) {
      for (let c = 0; c < band.cols; c++) {
        const cell = r * band.cols + c;
        expect(bgArtCellAtlasIndex(doc, { kind: 'bank', bandIndex, bank: 0 }, cell))
          .toBe(bases[bandIndex] + c * band.rows + r);
        expect(bgArtCellAtlasIndex(doc, { kind: 'bank', bandIndex, bank: 3 }, cell))
          .toBe(c * band.rows + r);
      }
    }
    // The document's cells carry exactly that mapping.
    const od = openBandBankDocument(doc, bandIndex, 0)!;
    expect(od.doc.widthTiles).toBe(band.cols);
    expect(od.doc.heightTiles).toBe(band.rows);
    expect(od.doc.cells.map((x) => x.atlasTile)).toEqual(
      od.doc.cells.map((_, i) => bgArtCellAtlasIndex(doc, { kind: 'bank', bandIndex, bank: 0 }, i)));
    expect(od.bgOverride).toEqual({ kind: 'bank', bandIndex, bank: 0 });
    expect(od.liveTileIndex).toBeNull();
  });

  it('bank 0 and a static slot read the override display atlas; bank k reads the bank itself', () => {
    const doc = golden();
    const band = documentBands(doc)[0];
    const a0 = bgArtAtlas(doc, { kind: 'bank', bandIndex: 0, bank: 0 });
    expect(a0).toHaveLength(doc.tiles.length);
    expect(Array.from(a0[0].pixels)).toEqual(doc.tiles[0]);
    const ak = bgArtAtlas(doc, { kind: 'bank', bandIndex: 0, bank: 5 });
    expect(ak).toHaveLength(bandTileCount(band));
    expect(Array.from(ak[1].pixels)).toEqual(band.phases[5][1]);
    const tile = openBgTileDocument(doc, doc.tiles.length - 1)!;
    expect(tile.doc.cells[0].atlasTile).toBe(doc.tiles.length - 1);
    expect(openBgTileDocument(doc, doc.tiles.length)).toBeNull();
    expect(openBandBankDocument(doc, 0, BGANIM_PHASE_BANKS)).toBeNull();
  });

  it('cells render through the document\'s palette_line when it is a legal line, else 0', () => {
    const doc = golden();
    const od = openBandBankDocument(doc, 0, 0)!;
    expect(od.doc.cells.every((c) => c.pal === bgPaletteLine(doc))).toBe(true);
    expect(bgPaletteLine({ ...doc, palette_line: 2 })).toBe(2);
    expect(bgPaletteLine({ ...doc, palette_line: 7 })).toBe(0);
    expect(bgPaletteLine({ ...doc, palette_line: 'x' })).toBe(0);
  });
});

describe('a stroke becomes ONE override command', () => {
  it('on bank 0: set-bg-override-tiles naming the slots under the stroke', () => {
    const doc = golden();
    const bandIndex = 1;
    const band = documentBands(doc)[bandIndex];
    const base = bandSlotBases(documentBands(doc))[bandIndex];
    const od = openBandBankDocument(doc, bandIndex, 0)!;
    // Two pixels in cell (1, 0) → slot base + 1*rows; one in cell (0, 1) → base + 1.
    const cmd = bgArtCommitCommand(doc, od.bgOverride!, od.doc, [
      { x: 8, y: 0, value: 0xE }, { x: 9, y: 0, value: 0xE }, { x: 0, y: 8, value: 0xD },
    ])!;
    expect(cmd.type).toBe('set-bg-override-tiles');
    if (cmd.type !== 'set-bg-override-tiles') return;
    expect(cmd.tiles.map((t) => t.index).sort((a, b) => a - b))
      .toEqual([base + 1, base + band.rows].sort((a, b) => a - b));
    const t = cmd.tiles.find((x) => x.index === base + band.rows)!;
    expect(t.newPixels[0]).toBe(0xE);
    expect(t.newPixels[1]).toBe(0xE);
    expect(t.newPixels.slice(2)).toEqual(t.oldPixels.slice(2));
  });

  it('on bank k: set-bg-override-phases for that bank only, other tiles of the bank unchanged', () => {
    const doc = golden();
    const od = openBandBankDocument(doc, 0, 4)!;
    const band = documentBands(doc)[0];
    const cmd = bgArtCommitCommand(doc, od.bgOverride!, od.doc, [{ x: 0, y: 0, value: 0xF }])!;
    expect(cmd.type).toBe('set-bg-override-phases');
    if (cmd.type !== 'set-bg-override-phases') return;
    expect(cmd.bandIndex).toBe(0);
    expect(cmd.banks.map((b) => b.bank)).toEqual([4]);
    expect(cmd.banks[0].newTiles[0][0]).toBe(0xF);
    expect(cmd.banks[0].newTiles.slice(1)).toEqual(band.phases[4].slice(1));
  });

  it('a stroke that changes nothing yields no command', () => {
    const doc = golden();
    const od = openBandBankDocument(doc, 0, 0)!;
    const v = doc.tiles[0][0];
    expect(bgArtCommitCommand(doc, od.bgOverride!, od.doc, [{ x: 0, y: 0, value: v }])).toBeNull();
    expect(bgArtCommitCommand(doc, od.bgOverride!, od.doc, [])).toBeNull();
  });
});

describe('the strip', () => {
  it('rasterizes a bank as the band\'s cols*8 x rows*8 pattern, slot t at column floor(t/rows)', () => {
    const doc = golden();
    const band = documentBands(doc)[0];
    const lut = lutFromColors(Array.from({ length: 16 }, (_, i) => ({ r: i * 16, g: 0, b: 0, a: 255 })));
    const { width, height, rgba } = bankThumbnail(band, 0, lut);
    expect(width).toBe(band.cols * TILE_WIDTH_PX);
    expect(height).toBe(band.rows * TILE_WIDTH_PX);
    // Pixel (8, 0) is slot `rows` (column 1, row 0), its pixel 0.
    const slot = band.rows;
    const expected = band.phases[0][slot][0] * 16;
    expect(rgba[(0 * width + 8) * 4]).toBe(expected);
    expect(TILE_PIXELS).toBe(64);
  });

  it('Shift is a REFUSAL on a missing band or document, never a throw', () => {
    expect(regenerateShiftCommand(null, 0).ok).toBe(false);
    const r = regenerateShiftCommand(golden(), 42);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/band 42/);
    expect(regenerateShiftCommand(golden(), 0).ok).toBe(true);
  });

  it('says it is a regenerate, and names the fill it reuses', () => {
    expect(SHIFT_BUTTON_LABEL).toBe('Shift');
    expect(SHIFT_BUTTON_TITLE).toMatch(/Regenerate/);
    expect(SHIFT_BUTTON_TITLE).toMatch(/pre-shifted \(moves\)/);
    expect(SHIFT_BUTTON_TITLE).toMatch(/Run it again/);
  });

  it('a target stops existing when its band or slot is gone', () => {
    const doc = golden();
    expect(bgArtTargetExists(doc, { kind: 'bank', bandIndex: 0, bank: 1 })).toBe(true);
    expect(bgArtTargetExists(doc, { kind: 'bank', bandIndex: documentBands(doc).length, bank: 1 })).toBe(false);
    expect(bgArtTargetExists(doc, { kind: 'tile', tileIndex: doc.tiles.length })).toBe(false);
    expect(bgArtTargetExists(null, { kind: 'tile', tileIndex: 0 })).toBe(false);
  });
});
