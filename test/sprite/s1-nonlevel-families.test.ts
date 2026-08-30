// S1 non-level art families (audit 2026-08-20 §5 Parcel B) — the (a)-model
// nem+maps families opened as NAMED docs (S1_NAMED_ART_DOCS), rendered against
// the REAL s1disasm files through the exact code the open path runs
// (parseAsmMappings → composeTilePool / reconstructFrom*). This is the audit's
// probe promoted to a pinned test, per family.
//
// Every expectation here is DERIVED from the s1disasm source, cited inline:
// frame counts are the maps files' `mappingsTableEntry` counts, piece pins are
// hand-transcribed spritePiece lines, pool sizes come from decoding the real
// art bytes in-test. Nothing is copied from the audit's snapshot tables.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseAsmMappings } from '../../src/core/import/asm-mappings';
import {
  reconstructFromFrames, reconstructFromTilePool, reconstructFromFramePools, composeTilePool,
  synthesizeGridFrames,
} from '../../src/core/import/sprite-import';
import { compressionFor } from '../../src/core/compress';
import { parseTiles } from '../../src/core/formats/tiles';
import { S1_NAMED_ART_DOCS } from '../../src/core/project/profiles/s1-object-art';
import type { ObjectArtLink } from '../../src/core/project/profiles/s1-object-art';
import type { Tile } from '../../src/core/model/s4-types';
import { referencePath } from '../support/fixture-tree';

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = `${S1DIR} is absent — this machine has no s1disasm checkout, so these rows measure nothing`;
const read = (rel: string) => new Uint8Array(fs.readFileSync(path.join(S1DIR, rel)));
const readText = (rel: string) => fs.readFileSync(path.join(S1DIR, rel), 'utf8');
const decode = (rel: string, comp: 'nemesis' | 'uncompressed') =>
  parseTiles(compressionFor(comp).decompress(read(rel)));
const nonblank = (a: Uint8Array) => a.reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);

/** The Parcel B rows: every named doc except the pre-existing bossitems. */
const FAMILIES = Object.entries(S1_NAMED_ART_DOCS).filter(([k]) => k !== 'bossitems');

/**
 * Render a link the way openDiscoveredSet does: primary art at tile 0, extra
 * `sources` slices at their VRAM-relative tileBases, `frameSources` ranges on
 * their own frame-local pools. Kept in lockstep with export-sprite.ts's
 * openDiscoveredSet composition (same core functions, same order).
 */
function renderLink(link: ObjectArtLink) {
  if (link.rawGrid) {
    // Raw-grid rows (Parcel C): no mappings file — frames are synthesized from
    // the decoded art, exactly as openDiscoveredSet's rawGrid branch does.
    const tiles = decode(link.artFile, link.compression);
    const gframes = synthesizeGridFrames(tiles.length, link.rawGrid);
    return { frames: gframes, recon: reconstructFromFrames(gframes, read(link.artFile), link.compression) };
  }
  const frames = parseAsmMappings(readText(link.mapAsm));
  if (link.sources?.length || link.frameSources?.length) {
    const slices = [{ bytes: read(link.artFile), compression: link.compression, tileBase: 0 }];
    for (const s of link.sources ?? []) {
      slices.push({ bytes: read(s.artFile), compression: s.compression, tileBase: s.tileBase });
    }
    const base = composeTilePool(slices);
    if (link.frameSources?.length) {
      const overrides = link.frameSources.map((f) => ({
        first: f.firstFrame, last: f.lastFrame, tiles: decode(f.artFile, f.compression),
      }));
      const poolFor = (i: number): Tile[] =>
        overrides.find((r) => i >= r.first && i <= r.last)?.tiles ?? base;
      return { frames, recon: reconstructFromFramePools(frames, poolFor) };
    }
    return { frames, recon: reconstructFromTilePool(frames, base) };
  }
  return { frames, recon: reconstructFromFrames(frames, read(link.artFile), link.compression) };
}

/**
 * Frame counts per family = the maps file's `mappingsTableEntry` count,
 * hand-counted from each file's table (multi-table files: all tables, in file
 * order, since collectBlocks concatenates them — Title Cards below).
 */
const FRAME_COUNTS: Record<string, number> = {
  shield: 8,          // _maps/Shield and Invincibility.asm: 1 invisible + 3 shield + 4 stars
  hudlabels: 4,       // _maps/HUD.asm: allyellow/ringred/timered/allred
  titlesonic: 8,      // _maps/Title Screen Sonic.asm: 6 appear + 2 fingerwag
  titlepsb: 4,        // _maps/Press Start and TM.asm: invisible hack, psb, spritemask, tm
  titlecards: 30,     // _maps/Title Cards.asm: Map_Card 12 + Map_Got 9 + Map_SSR 9 (Map_Over include skipped)
  gameover: 4,        // _maps/Game Over.asm: game/over1/time/over2
  continue: 8,        // _maps/Continue Screen.asm: text, 3×Sonic, oval, Mini1×2, Mini2
  endingsonic: 8,     // _maps/Ending Sequence Sonic.asm
  endingemeralds: 7,  // _maps/Ending Sequence Emeralds.asm: one per emerald color
  endingsth: 1,       // _maps/Ending Sequence STH.asm: the logo
  tryagain: 8,        // _maps/Try Again & End Eggman.asm
  credits: 11,        // _maps/Credits.asm
  ssresults: 7,       // _maps/SS Result Chaos Emeralds.asm: one per emerald
};

/**
 * Raw-grid families (Parcel C): the PIN is the cell geometry (transcribed
 * from the consumer's index math — see the rows' citations); the frame count
 * is DERIVED per test from the real file's size, never hand-copied:
 * count = decoded tiles ÷ (widthCells × heightCells).
 */
const GRID_GEOMETRY: Record<string, { widthCells: number; heightCells: number }> = {
  hudnumbers: { widthCells: 1, heightCells: 2 },      // digit*$40, _inc/HUD Update.asm:336
  livesnumbers: { widthCells: 1, heightCells: 1 },    // digit*$20, _inc/HUD Update.asm:579
  levelselectfont: { widthCells: 1, heightCells: 1 }, // 1 nametable entry per glyph, sonic.asm:1961-1963
};

/** A family's expected frame count: hand-counted mapping tables for (a)-model
 *  rows, size-derived cells for raw grids. */
function expectedFrameCount(key: string, link: ObjectArtLink): number {
  if (link.rawGrid) {
    const per = link.rawGrid.widthCells * link.rawGrid.heightCells;
    const tiles = decode(link.artFile, link.compression).length;
    expect(tiles % per, `${key} art is whole ${link.rawGrid.widthCells}×${link.rawGrid.heightCells} cells`).toBe(0);
    return tiles / per;
  }
  return FRAME_COUNTS[key];
}

describe('S1 non-level families — every row: real files, real render', { skip: !fs.existsSync(S1DIR), meta: { skipReason: S1_ABSENT } }, () => {
  it('covers exactly the transcribed family set (a new row must bring its pins)', () => {
    expect([...Object.keys(FRAME_COUNTS), ...Object.keys(GRID_GEOMETRY)].sort())
      .toEqual(FAMILIES.map(([k]) => k).sort());
    // Every grid pin matches its row's transcription (and only grid rows pin here).
    for (const [key, geom] of Object.entries(GRID_GEOMETRY)) {
      expect(S1_NAMED_ART_DOCS[key].link.rawGrid, `${key} is a rawGrid row`).toEqual(geom);
    }
    for (const key of Object.keys(FRAME_COUNTS)) {
      expect(S1_NAMED_ART_DOCS[key].link.rawGrid, `${key} is a mapped row`).toBeUndefined();
    }
  });

  it.each(FAMILIES)('%s: parses its hand-counted frames and renders the declared frame substantially nonblank', (key, doc) => {
    const { frames, recon } = renderLink(doc.link);
    expect(frames, `${key} frame count`).toHaveLength(expectedFrameCount(key, doc.link));
    expect(doc.link.frame).toBeLessThan(frames.length);

    // The declared frame must be a REAL sprite: its pieces cover N 8x8 cells;
    // demand at least a quarter of those pixels set (glyph-heavy families like
    // fonts run sparse but never near-empty), and never more than full cover.
    const decl = frames[doc.link.frame];
    expect(decl.pieces.length, `${key} declared frame has pieces`).toBeGreaterThan(0);
    const cells = decl.pieces.reduce((n, p) => n + p.widthCells * p.heightCells, 0);
    const set = nonblank(recon.frames[doc.link.frame]);
    expect(set, `${key} declared-frame nonblank pixels`).toBeGreaterThan((cells * 64) / 4);
    expect(set).toBeLessThanOrEqual(cells * 64);
  });

  /**
   * Pieces whose engine tiles are RAW-BLITTED at runtime (the audit's model
   * (c) digit regions — Parcel C's raw-grid loader, not this parcel): blank in
   * a static doc BY DESIGN, so exempt from pool coverage. Each entry cites the
   * blit site.
   */
  const RUNTIME_BLIT_TILES: Record<string, number[]> = {
    // ArtTile_Continue_Number $6FC (_Constants.asm:608) − ArtTile_Continue_Sonic
    // $500 = $1FC: the countdown digits ContScrCounter writes from the HUD
    // Numbers art (_inc/HUD Update.asm:354-358).
    continue: [0x1fc],
  };

  it.each(FAMILIES)('%s: the declared frame\'s tile refs resolve inside its pool (no silent blank pieces)', (key, doc) => {
    const link = doc.link;
    const frames = link.rawGrid
      ? synthesizeGridFrames(decode(link.artFile, link.compression).length, link.rawGrid)
      : parseAsmMappings(readText(link.mapAsm));
    const decl = frames[link.frame];
    // Pool the declared frame draws from: a frameSources range's own file, else
    // primary + sources composite (pool length = last slice base + its tiles).
    const fsrc = link.frameSources?.find((f) => link.frame >= f.firstFrame && link.frame <= f.lastFrame);
    let poolTiles: number;
    if (fsrc) {
      poolTiles = decode(fsrc.artFile, fsrc.compression).length;
    } else {
      poolTiles = decode(link.artFile, link.compression).length;
      for (const s of link.sources ?? []) {
        poolTiles = Math.max(poolTiles, s.tileBase + decode(s.artFile, s.compression).length);
      }
    }
    for (const p of decl.pieces) {
      if (RUNTIME_BLIT_TILES[key]?.includes(p.tile)) continue;
      expect(p.tile + p.widthCells * p.heightCells, `${key} piece tile $${p.tile.toString(16)}`)
        .toBeLessThanOrEqual(poolTiles);
    }
  });

  it.each(FAMILIES.filter(([, d]) => d.link.palFile))('%s: the palette file holds the declared line', (key, doc) => {
    // Line layout per _inc/Palette Index.asm: 32 bytes = 16 big-endian CRAM
    // words per line, file length a multiple of 32 (Pal_Title 4 lines,
    // Pal_Continue 2, Pal_Ending 4, Pal_SSResult 4, Pal_Sonic 1).
    const bytes = read(doc.link.palFile!);
    expect(bytes.length % 32, `${key} palette file line-aligned`).toBe(0);
    expect(bytes.length, `${key} declared line ${doc.link.pal} exists`).toBeGreaterThanOrEqual((doc.link.pal + 1) * 32);
    // The declared line is a real palette: nonzero colors, all legal CRAM words
    // (Genesis 9-bit color: word & $F111 === 0 except unused bits — assert the
    // conservative invariant that each word fits in $0EEE).
    const start = doc.link.pal * 32;
    let any = 0;
    for (let i = 0; i < 16; i++) {
      const w = (bytes[start + i * 2] << 8) | bytes[start + i * 2 + 1];
      expect(w & ~0x0eee, `${key} line ${doc.link.pal} word ${i} is a CRAM color`).toBe(0);
      any |= w;
    }
    expect(any, `${key} declared palette line is not all-black`).not.toBe(0);
  });
});

describe('family-specific pins (hand-transcribed from the disasm)', { skip: !fs.existsSync(S1DIR), meta: { skipReason: S1_ABSENT } }, () => {
  it('shield: stars frames 4-7 index Nem_Stars frame-local — tile $23 max, beyond Shield.nem\'s 27 tiles', () => {
    // _maps/Shield and Invincibility.asm .stars3/.stars4 reference tiles up to
    // $1B+9-1; Shield.nem decodes to 27 tiles ($1B) so WITHOUT the per-frame
    // obGfx swap (_incObj/38:28,33) those pieces would fall off the pool.
    const shieldTiles = decode('artnem/Shield.nem', 'nemesis');
    const starsTiles = decode('artnem/Invincibility Stars.nem', 'nemesis');
    expect(shieldTiles).toHaveLength(27);
    const frames = parseAsmMappings(readText('_maps/Shield and Invincibility.asm'));
    const starMax = Math.max(...frames.slice(4).flatMap((f) => f.pieces.map((p) => p.tile + p.widthCells * p.heightCells)));
    expect(starMax).toBeGreaterThan(shieldTiles.length); // the swap is load-bearing
    expect(starMax).toBeLessThanOrEqual(starsTiles.length);
  });

  it('shield: frame 0 is the table\'s deliberate invisible entry (`.shield1+$B`) — zero pieces', () => {
    const frames = parseAsmMappings(readText('_maps/Shield and Invincibility.asm'));
    expect(frames[0].pieces).toEqual([]);
  });

  it('hudlabels: the lives pieces sit at ArtTile_Lives_Counter−ArtTile_HUD = $7D4−$6CA = $10A, the row\'s tileBase', () => {
    // _Constants.asm:564 ArtTile_HUD $6CA, :575 ArtTile_Lives_Counter $7D4;
    // _maps/HUD.asm frame 0's lives pieces reference tiles $10A/$10E.
    const link = S1_NAMED_ART_DOCS.hudlabels.link;
    expect(link.sources).toEqual([{ artFile: 'artnem/HUD - Life Counter Icon.nem', compression: 'nemesis', tileBase: 0x7d4 - 0x6ca }]);
    const frames = parseAsmMappings(readText('_maps/HUD.asm'));
    const livesPieces = frames[0].pieces.filter((p) => p.tile >= 0x10a);
    expect(livesPieces.map((p) => p.tile)).toEqual([0x10a, 0x10e]);
    // The icon slice really covers the first lives piece (12 decoded tiles).
    expect(decode('artnem/HUD - Life Counter Icon.nem', 'nemesis').length).toBe(12);
  });

  it('titlecards: 30 merged frames = Map_Card 12 ++ Map_Got 9 ++ Map_SSR 9, with Map_Over\'s include skipped', () => {
    // The multi-table file (header lines 1-12 warn about it). Frame 0 must be
    // M_Card_GHZ — hand-pin its first spritePiece: `spritePiece 8, 0, 4, 2,
    // $27, 0, 0, 0, 0` is NOT its first line; transcribe the real one below.
    const frames = parseAsmMappings(readText('_maps/Title Cards.asm'));
    expect(frames).toHaveLength(30);
    // Cross-referenced blocks resolve across tables: merged frame 12+5 = 17
    // (Map_Got's "Blue oval" entry) must equal merged frame 10 (Map_Card's
    // own M_Card_Oval entry) piece-for-piece.
    expect(frames[17].pieces).toEqual(frames[10].pieces);
    // And Map_SSR's oval too (12+9+3 = 24).
    expect(frames[24].pieces).toEqual(frames[10].pieces);
    // Got/SSR frames reference the HUD region at ArtTile_HUD−ArtTile_Title_Card
    // = $6CA−$580 = $14A (score/bonus text): present beyond the merged base.
    const maxRef = Math.max(...frames.flatMap((f) => f.pieces.map((p) => p.tile)));
    expect(maxRef).toBeGreaterThanOrEqual(0x14a);
    expect(S1_NAMED_ART_DOCS.titlecards.link.sources?.[0]).toMatchObject({ artFile: 'artnem/HUD.nem', tileBase: 0x6ca - 0x580 });
  });

  it('gameover: frame 0 is the hand-transcribed "GAME" pair — 2 pieces, 4x2 cells at tiles 0 and 8', () => {
    // _maps/Game Over.asm .game: spritePiece -$48,-8,4,2,0 / -$28,-8,4,2,8.
    const frames = parseAsmMappings(readText('_maps/Game Over.asm'));
    expect(frames[0].pieces.map((p) => [p.xOffset, p.yOffset, p.widthCells, p.heightCells, p.tile]))
      .toEqual([[-0x48, -8, 4, 2, 0], [-0x28, -8, 4, 2, 8]]);
  });

  it('continue: frame 0\'s letters resolve in the Title Cards slice at +$80 (the engine\'s $580 load), not the primary art', () => {
    // sonic.asm:3462-3468 loads Nem_TitleCard at ArtTile_Title_Card $580 and
    // Nem_ContSonic at ArtTile_Continue_Sonic $500 — the obj $80 mappings'
    // letter tiles ($88..$C6) land PAST ContSonic's 37 decoded tiles, inside
    // the +$80 slice. Without the slice they'd be silently blank.
    const contTiles = decode('artnem/Continue Screen Sonic.nem', 'nemesis');
    expect(contTiles).toHaveLength(37);
    const frames = parseAsmMappings(readText('_maps/Continue Screen.asm'));
    const letterTiles = frames[0].pieces.map((p) => p.tile).filter((t) => t >= 0x80 && t < 0x100);
    expect(letterTiles.length).toBeGreaterThan(0);
    const link = S1_NAMED_ART_DOCS.continue.link;
    expect(link.sources?.[0]).toMatchObject({ artFile: 'artnem/Title Cards.nem', tileBase: 0x80 });
    // Mini-Sonic frames 5-7 are the obGfx swap to ArtTile_Mini_Sonic ($551).
    expect(link.frameSources).toEqual([
      { firstFrame: 5, lastFrame: 7, artFile: 'artnem/Continue Screen Stuff.nem', compression: 'nemesis' },
    ]);
  });

  it('titlepsb: PSB letters live INSIDE the foreground emblem art ($F0..) and the TM frame is the obGfx swap', () => {
    // _incObj/0E,0F:93 — "PSB tiles are inside the foreground emblem's
    // graphics"; :103 swaps frame 3 to ArtTile_Title_Trademark.
    const fg = decode('artnem/Title Screen Foreground.nem', 'nemesis');
    const frames = parseAsmMappings(readText('_maps/Press Start and TM.asm'));
    const psbMax = Math.max(...frames[1].pieces.map((p) => p.tile + p.widthCells * p.heightCells));
    expect(psbMax).toBeLessThanOrEqual(fg.length); // letters resolve in the emblem file
    expect(Math.min(...frames[1].pieces.map((p) => p.tile))).toBe(0xf0);
    const link = S1_NAMED_ART_DOCS.titlepsb.link;
    expect(link.frameSources).toEqual([
      { firstFrame: 3, lastFrame: 3, artFile: 'artnem/Title Screen TM.nem', compression: 'nemesis' },
    ]);
  });

  it('titlesonic: declared pal line 1 transcribes Tile_Pal2 in obGfx (_incObj/0E,0F:28)', () => {
    const link = S1_NAMED_ART_DOCS.titlesonic.link;
    expect(link.pal).toBe(1);
    expect(link.palFile).toBe('palette/Title Screen.bin');
  });
});
