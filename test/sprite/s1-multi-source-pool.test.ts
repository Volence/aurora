// Multi-source tile pools — the `sources: [...]` row shape (owner finding
// 2026-08-20, part 2): Eggman's exhaust tail frames (.escapeflame1/2) index
// tiles $12A+ in Map_Eggman, but the doc's single Nem_Eggman pool is $6C tiles
// — the frames rendered BLANK. In VRAM the engine composites N nem files into
// one tile space: PLC_Boss loads Nem_Eggman at ArtTile_Eggman ($400) and
// Nem_Exhaust at ArtTile_Eggman_Exhaust = ArtTile_Eggman+$12A (_Constants.asm:
// 579/584; _inc/Pattern Load Cues.asm:286/290; sonic.asm:4793/4805). A row's
// `sources` transcribes exactly those VRAM-relative offsets so the doc's pool
// matches what the mappings were written against.
//
// Save-back honesty rides the existing per-piece guard: s1ArtSource captures
// the PRIMARY file's tiles only, and applyFrameEditsToTiles skips pieces whose
// tiles fall outside that pool — secondary-source pixels render but do not
// write back (same as the pre-fix behavior where they didn't render at all).

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseAsmMappings } from '../../src/core/import/asm-mappings';
import { composeTilePool, reconstructFromTilePool } from '../../src/core/import/sprite-import';
import { resolveObjectArt } from '../../src/core/project/profiles/s1-object-art';
import { referenceCheckout, referenceCheckoutReason, referencePath, S1_PINNED } from '../support/fixture-tree';

const S1DIR = referencePath(S1_PINNED);
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason(S1_PINNED);
const nem = (rel: string) => new Uint8Array(fs.readFileSync(path.join(S1DIR, 'artnem', rel)));

describe('the sources row shape', () => {
  it('$3D (and the shared zone-boss link) declares Nem_Exhaust at tileBase $12A', () => {
    const link = resolveObjectArt(0x3d)!;
    expect(link.sources).toEqual([
      { artFile: 'artnem/Boss - Exhaust Flame.nem', compression: 'nemesis', tileBase: 0x12A },
    ]);
    // The five zone bosses share ONE link object, so they all carry it.
    expect(resolveObjectArt(0x73)!.sources).toBe(link.sources);
  });

  it('rows without composite art carry no sources (the single-file path is unchanged)', () => {
    expect(resolveObjectArt(0x25)?.sources).toBeUndefined(); // Ring
    expect(resolveObjectArt(0x48)?.sources).toBeUndefined(); // Wrecking Ball (ball leads, single file)
  });
});

describe('composeTilePool', () => {
  // Synthetic 1-tile "art files": tile pixels all = the given value,
  // uncompressed 4bpp (32 bytes: value repeated in both nibbles).
  const oneTile = (v: number) => new Uint8Array(32).fill((v << 4) | v);

  it('places each slice at its tileBase and pads the gaps with blank tiles', () => {
    const pool = composeTilePool([
      { bytes: oneTile(3), compression: 'uncompressed', tileBase: 0 },
      { bytes: oneTile(7), compression: 'uncompressed', tileBase: 4 },
    ]);
    expect(pool.length).toBe(5);
    expect(pool[0].pixels[0]).toBe(3);
    expect(pool[1].pixels.every((p) => p === 0)).toBe(true); // gap tile: blank
    expect(pool[3].pixels.every((p) => p === 0)).toBe(true);
    expect(pool[4].pixels[0]).toBe(7);
  });

  it('a later slice may not overlap an earlier one (transcription error, refuse loudly)', () => {
    expect(() => composeTilePool([
      { bytes: oneTile(1), compression: 'uncompressed', tileBase: 0 },
      { bytes: oneTile(2), compression: 'uncompressed', tileBase: 0 },
    ])).toThrow(/overlap/i);
  });
});

describe('Eggman tail frames against the real files', { skip: !referenceCheckout(S1_PINNED), meta: { skipReason: S1_ABSENT } }, () => {
  it('.escapeflame1/2 render NONBLANK from the composed pool; .blank stays 0; the ship is untouched', () => {
    const frames = parseAsmMappings(fs.readFileSync(path.join(S1DIR, '_maps/Eggman.asm'), 'utf8'));
    expect(frames.length).toBe(13);
    const pool = composeTilePool([
      { bytes: nem('Boss - Main.nem'), compression: 'nemesis', tileBase: 0 },
      { bytes: nem('Boss - Exhaust Flame.nem'), compression: 'nemesis', tileBase: 0x12A },
    ]);
    // Nemesis headers: Nem_Eggman = $6C tiles, Nem_Exhaust = $11 → pool $13B.
    expect(pool.length).toBe(0x12A + 0x11);
    const recon = reconstructFromTilePool(frames, pool);
    const cov = recon.frames.map((f) => f.reduce((n, px) => n + (px !== 0 ? 1 : 0), 0));
    expect(cov[11], '.escapeflame1').toBeGreaterThanOrEqual(100);
    expect(cov[12], '.escapeflame2').toBeGreaterThanOrEqual(100);
    expect(cov[10], '.blank (zero spritePiece rows — the control)').toBe(0);
    expect(cov[0], '.ship').toBeGreaterThan(500);
    // ANTI-VACUOUS: the same frames against the primary file ALONE are blank —
    // proves the coverage above comes from the composed exhaust tiles.
    const alone = reconstructFromTilePool(frames, composeTilePool([
      { bytes: nem('Boss - Main.nem'), compression: 'nemesis', tileBase: 0 },
    ]));
    const covAlone = alone.frames.map((f) => f.reduce((n, px) => n + (px !== 0 ? 1 : 0), 0));
    expect(covAlone[11]).toBe(0);
    expect(covAlone[12]).toBe(0);
  });
});
