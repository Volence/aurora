// Parcel C — the REAL openDiscoveredSet against the real s1disasm raw-grid
// files (window.api stubbed onto fs, read-only). The three (c)-model families
// have NO mappings file: openDiscoveredSet synthesizes one frame per cell.
//
// EVERY expectation is DERIVED from the real file at run time, never copied
// from the audit: frame counts come from `stat.size ÷ (32 × tilesPerCell)`,
// and each frame's pixels are compared cell-for-cell against an INDEPENDENT
// parseTiles() of the same bytes (top tile above bottom tile for the 8×16
// digits — the HUD's 2-consecutive-tile blit, _inc/HUD Update.asm:336).
// Anti-vacuous: the digit cells' derived coverage must itself be nonzero, so
// an all-blank render can never pass the equality.
//
// SAVE-BACK: raw-grid rows are READ-ONLY by design (Parcel C scope). The open
// must record a SPECIFIC refusal — not capture a target, not crash — and a
// save attempt must surface that reason.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { openDiscoveredSet, saveSpriteArt } from '../export-sprite';
import type { DiscoveredSpriteSet } from '../../../../core/import/sprite-discovery';
import { useSpriteStore } from '../../../state/spriteStore';
import { useToastStore } from '../../../state/toastStore';
import { parseTiles } from '../../../../core/formats/tiles';
import { referencePath, S1_PINNED } from '../../../../../test/support/fixture-tree';
import { whenS1Files } from '../../../../../test/support/s1-checkout';

const S1DIR = referencePath(S1_PINNED);

/**
 * The three raw grids this file opens. Named here so the guard can name them:
 * the old gate was `referenceCheckout`, which a checkout with the markers and no
 * `artunc/` satisfies, and the read-only row then reported
 * `TypeError: .toMatch() expects to receive a string, but got object` — the
 * refusal object it got because the open had read nothing
 * (docs/reviews/2026-08-30-incomplete-checkout-rows.md).
 */
const HUD_NUMBERS = 'artunc/HUD Numbers.unc';
const LIVES_NUMBERS = 'artunc/Lives Counter Numbers.unc';
const LEVEL_SELECT_TEXT = 'artunc/Level Select & Debug Text.unc';

// window.api over fs (read-only: s1disasm must never be written by a test).
function stubWindowApi(): () => void {
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = {
    api: {
      readBinaryFile: async (base: string, rel: string): Promise<ArrayBuffer> => {
        const b = fs.readFileSync(path.join(base, rel));
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      fileMtime: async (base: string, rel: string): Promise<number | null> =>
        fs.statSync(path.join(base, rel)).mtimeMs,
    },
  };
  return () => { g.window = prev; };
}

let restoreApi: () => void;
beforeEach(() => {
  restoreApi = stubWindowApi();
  useSpriteStore.getState().closeAll();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
  restoreApi();
  useSpriteStore.getState().closeAll();
});

const lastToast = () => useToastStore.getState().toasts.at(-1)?.message ?? '';

/** The set editObjectArtCheckout builds for a raw-grid named row (asserted in
 *  edit-art-handoff.test.ts) — spelled out here so this file exercises the
 *  OPEN, not the row lookup. */
const gridSet = (name: string, art: string, widthCells: number, heightCells: number): DiscoveredSpriteSet => ({
  name, game: 's1', mappings: '', art, rawGrid: { widthCells, heightCells },
});

/** Derived per-frame reference bitmaps: cell i's tiles laid column-major onto
 *  a widthCells×heightCells canvas — independent of the renderer under test. */
function derivedCells(bytes: Uint8Array, widthCells: number, heightCells: number): Uint8Array[] {
  const tiles = parseTiles(bytes);
  const per = widthCells * heightCells;
  expect(tiles.length % per).toBe(0); // whole cells — the loud-loader precondition
  const w = widthCells * 8, h = heightCells * 8;
  return Array.from({ length: tiles.length / per }, (_, i) => {
    const out = new Uint8Array(w * h);
    for (let c = 0; c < per; c++) {
      const col = Math.floor(c / heightCells), row = c % heightCells; // VDP column-major
      const t = tiles[i * per + c];
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          out[(row * 8 + py) * w + col * 8 + px] = t.pixels[py * 8 + px];
        }
      }
    }
    return out;
  });
}

describe('openDiscoveredSet: raw tile grids (Parcel C)', whenS1Files('the raw tile-grid opens', [HUD_NUMBERS, LIVES_NUMBERS, LEVEL_SELECT_TEXT]), () => {
  it('HUD Numbers: size÷64 frames of 8×16, each cell equal to its two consecutive tiles', async () => {
    const rel = HUD_NUMBERS;
    const bytes = fs.readFileSync(path.join(S1DIR, rel));
    // Derivation: 8×16 digits are 2 tiles ($40 bytes) apiece — the engine
    // indexes Art_Hud by digit*$40 (_inc/HUD Update.asm:336 `lsl.w #6`).
    expect(bytes.length % 64).toBe(0);
    const cellCount = bytes.length / 64;

    const ok = await openDiscoveredSet(S1DIR, gridSet('HUD Digits', rel, 1, 2), 'uncompressed');
    expect(ok).toBe(true);

    const s = useSpriteStore.getState();
    expect(s.frames).toHaveLength(cellCount);
    expect(s.frames[0]).toMatchObject({ width: 8, height: 16 });

    const want = derivedCells(new Uint8Array(bytes), 1, 2);
    s.frames.forEach((f, i) => expect(f.data).toEqual(want[i]));
    // Anti-vacuous: the ten digit glyphs 0..9 are DERIVED nonblank, so the
    // equality above cannot be satisfied by an all-zero render.
    for (let d = 0; d <= 9; d++) {
      expect(want[d].reduce((n, v) => n + (v !== 0 ? 1 : 0), 0)).toBeGreaterThan(0);
    }
  });

  it('HUD Digits: read-only by design, a SPECIFIC refusal is recorded, and save surfaces it', async () => {
    await openDiscoveredSet(S1DIR, gridSet('HUD Digits', HUD_NUMBERS, 1, 2), 'uncompressed');
    const s = useSpriteStore.getState();
    expect(s.s1ArtSource).toBeNull();
    expect(s.saveBackRefusal).toMatch(/raw tile grid/);
    expect(s.saveBackRefusal).toMatch(/HUD.Digits/); // doc name (sanitized: spaces → _)

    await saveSpriteArt();
    expect(lastToast()).toMatch(/raw tile grid/); // the recorded WHY, not the generic line
  });

  it('Lives Counter Numbers: size÷32 frames of 8×8, one tile per digit', async () => {
    const rel = LIVES_NUMBERS;
    const bytes = fs.readFileSync(path.join(S1DIR, rel));
    // Derivation: 8×8 digits are 1 tile — Art_LivesNums indexed by digit*$20
    // (_inc/HUD Update.asm:579 `lsl.w #5`).
    expect(bytes.length % 32).toBe(0);
    const cellCount = bytes.length / 32;

    const ok = await openDiscoveredSet(S1DIR, gridSet('Lives Counter Digits', rel, 1, 1), 'uncompressed');
    expect(ok).toBe(true);

    const s = useSpriteStore.getState();
    expect(s.frames).toHaveLength(cellCount);
    expect(s.frames[0]).toMatchObject({ width: 8, height: 8 });
    const want = derivedCells(new Uint8Array(bytes), 1, 1);
    s.frames.forEach((f, i) => expect(f.data).toEqual(want[i]));
    want.forEach((cell) => expect(cell.some((v) => v !== 0)).toBe(true)); // every digit glyph draws
  });

  it('Level Select & Debug Text: size÷32 glyph frames of 8×8', async () => {
    const rel = LEVEL_SELECT_TEXT;
    const bytes = fs.readFileSync(path.join(S1DIR, rel));
    // Derivation: the title screen streams the WHOLE file as words
    // (`(Art_Text_end-Art_Text)/2-1`, sonic.asm:1963) into consecutive font
    // tiles — 1 tile per glyph, so glyphs = size ÷ 32.
    expect(bytes.length % 32).toBe(0);
    const cellCount = bytes.length / 32;

    const ok = await openDiscoveredSet(S1DIR, gridSet('Level Select Font', rel, 1, 1), 'uncompressed');
    expect(ok).toBe(true);

    const s = useSpriteStore.getState();
    expect(s.frames).toHaveLength(cellCount);
    const want = derivedCells(new Uint8Array(bytes), 1, 1);
    s.frames.forEach((f, i) => expect(f.data).toEqual(want[i]));
    // Anti-vacuous: the font's glyphs are overwhelmingly nonblank (derived,
    // not pinned — a space glyph may legitimately be empty).
    const nonblank = want.filter((cell) => cell.some((v) => v !== 0)).length;
    expect(nonblank).toBeGreaterThan(cellCount / 2);
  });
});
