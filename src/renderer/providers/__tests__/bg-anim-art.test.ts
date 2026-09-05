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
  resolveStripOpen, stripOpenLabel, stripOpenHint, stripOpenSpeaks,
  publishStripOpen, lastStripOpenReport,
  type StripOpenInputs,
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

// ---------------------------------------------------------------------------
// The strip's double click — ROADMAP row 57
// ---------------------------------------------------------------------------
//
// ⚠ THESE ROWS PROVE THE RULE AND PROVE NOTHING ABOUT REACHABILITY, and saying
// so is the point of the row they belong to. `openBgTileDocument` was fully
// covered by the rows above for a day while NOTHING IN THE APP CALLED IT —
// coverage of a function says nothing about whether anything calls it, and a
// node suite that cannot see React would be just as green on a build with no
// `onDoubleClick` on the strip at all. The reachability proof is a CDP harness
// that drives the real app (`scratchpad/bganim-tile-door-harness.mjs`); what
// lives here is the gate, the bounds and the wording, which are exactly the
// parts a harness aiming one gesture cannot sweep.
describe('resolveStripOpen: which strip double click opens a slot', () => {
  const inputs = (over: Partial<StripOpenInputs> = {}): StripOpenInputs => ({
    layer: 'bg', origin: 'override', slot: 0, doc: golden(), ...over,
  });

  it('opens the slot under the pointer, PAST THE ANIMATED PREFIX: the row\'s own target', () => {
    const doc = golden();
    // Derived, never pinned: the first slot no band owns is the sum of the
    // bands' tile counts, which is what `bandBudget().firstPromotableSlot`
    // walks. A literal here would drift the moment the fixture's bands change.
    const prefix = documentBands(doc).reduce((n, b) => n + bandTileCount(b), 0);
    expect(prefix).toBeGreaterThan(0);
    expect(prefix).toBeLessThan(doc.tiles.length);
    const staticSlot = doc.tiles.length - 1;
    expect(staticSlot).toBeGreaterThanOrEqual(prefix);
    expect(resolveStripOpen(inputs({ slot: staticSlot, doc })))
      .toEqual({ kind: 'open', tileIndex: staticSlot });
    // And it really names a document the composer can hold.
    const od = openBgTileDocument(doc, staticSlot)!;
    expect(od.bgOverride).toEqual({ kind: 'tile', tileIndex: staticSlot });
    expect(od.doc.cells[0].atlasTile).toBe(staticSlot);
  });

  it('opens a PREFIX slot too: that write lands in the owning band\'s phases[0]', () => {
    const doc = golden();
    expect(resolveStripOpen(inputs({ slot: 0, doc }))).toEqual({ kind: 'open', tileIndex: 0 });
    expect(openBgTileDocument(doc, 0)!.bgOverride).toEqual({ kind: 'tile', tileIndex: 0 });
  });

  it('THE GATE: only the BG layer showing the OVERRIDE reaches the document', () => {
    // Foreground — silent. Double click is not a gesture that strip has.
    expect(resolveStripOpen(inputs({ layer: 'fg', origin: 'tileset' })))
      .toEqual({ kind: 'ignored', why: 'not-a-background' });
    // A background that is not the override — LOUD. The same integers name
    // different art there, so opening doc.tiles[n] would edit a tile the author
    // is not looking at.
    for (const origin of ['library', 'act', 'none'] as const) {
      const out = resolveStripOpen(inputs({ origin }));
      expect(out.kind).toBe('refused');
      expect(stripOpenLabel(out)).toMatch(/^no edit: /);
      expect(stripOpenHint(out).length).toBeGreaterThan(stripOpenLabel(out).length);
    }
    // And an `override` origin with no document is the same refusal, not a throw.
    expect(resolveStripOpen(inputs({ doc: null })).kind).toBe('refused');
  });

  it('refuses a slot the blob does not have, naming the range FROM THE DOCUMENT', () => {
    const doc = golden();
    expect(resolveStripOpen(inputs({ slot: -1, doc })))
      .toEqual({ kind: 'ignored', why: 'no-slot' });
    const past = doc.tiles.length;
    const out = resolveStripOpen(inputs({ slot: past, doc }));
    expect(out.kind).toBe('refused');
    // `tiles.length` is a COUNT, so the last slot is one less — the same
    // off-by-one the strip drag's prefix hint had to be fixed for.
    expect(stripOpenHint(out)).toContain(`0..${doc.tiles.length - 1}`);
    expect(stripOpenHint(out)).not.toContain(`0..${doc.tiles.length}`);
    // The caller must not open anything on a refusal, and the provider agrees.
    expect(openBgTileDocument(doc, past)).toBeNull();
    expect(resolveStripOpen(inputs({ slot: 1.5, doc })).kind).toBe('refused');
  });

  it('only a refusal speaks, and a silent outcome must not WRITE the empty line', () => {
    const doc = golden();
    // The strip's readout is ONE line shared with the range drag and the band
    // cards. A double click that cleared it would erase a message the author is
    // mid-read, so "silent" has to mean "leaves it alone" — which an empty
    // label cannot express and `stripOpenSpeaks` can. Caught red on the real app
    // by the CDP harness's sentinel row, not by anything that could live here.
    for (const out of [
      resolveStripOpen(inputs({ slot: doc.tiles.length - 1, doc })),
      resolveStripOpen(inputs({ layer: 'fg', origin: 'tileset' })),
      resolveStripOpen(inputs({ slot: -1, doc })),
    ]) {
      expect(stripOpenSpeaks(out)).toBe(false);
      expect(stripOpenLabel(out)).toBe('');
      expect(stripOpenHint(out)).toBe('');
    }
    const refused = resolveStripOpen(inputs({ origin: 'act' }));
    expect(stripOpenSpeaks(refused)).toBe(true);
    expect(stripOpenLabel(refused)).not.toBe('');
  });

  it('the report advances on EVERY double click and records which branch took it', () => {
    const doc = golden();
    const before = lastStripOpenReport().gestures;
    publishStripOpen(3, resolveStripOpen(inputs({ slot: 3, doc })));
    const opened = lastStripOpenReport();
    expect(opened.gestures).toBe(before + 1);
    expect(opened.kind).toBe('open');
    expect(opened.openedTileIndex).toBe(3);
    // The branch that changes NOTHING still advances the count — that is the
    // whole reason this report exists rather than reading `bgArtOpen()`.
    publishStripOpen(3, resolveStripOpen(inputs({ layer: 'fg', origin: 'tileset', slot: 3 })));
    const ignored = lastStripOpenReport();
    expect(ignored.gestures).toBe(before + 2);
    expect(ignored.kind).toBe('ignored');
    expect(ignored.detail).toBe('not-a-background');
    expect(ignored.openedTileIndex).toBeNull();
  });
});
