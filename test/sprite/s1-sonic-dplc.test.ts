// S1 Sonic — the DPLC (streamed-art) open, against the REAL s1disasm files.
//
// This promotes the non-level art audit's probe (docs/reviews/
// 2026-08-20-s1-nonlevel-art-audit.md §4) to a pinned test: Aurora's shipped
// parseAsmMappings / parseAsmDPLC / reconstructFromFrames render S1 Sonic
// correctly with NO new parser or renderer — what Parcel A added is only the
// row (`dplc()` in s1-object-art.ts) and the checkout threading.
//
// FORMAT FACTS (audit §1, transcribed from s1disasm):
//   • sonic.asm:68-69 — SonicMappingsVer = 1, SonicDplcVer = 1.
//   • _MapMacros.asm:62-72 `dplcHeader` (Ver 1): one COUNT byte (0 legal —
//     SonPLC_Null); :74-81 `dplcEntry tiles,offset`:
//         dc.w ((tiles-1)&$F)<<12 | (offset&$FFF)
//     high nybble = tile count − 1, low 12 bits = SOURCE tile index into
//     Art_Sonic. Offsets are in TILES (the consumer `lsl.w #5`s them).
//   • Mapping tile indices are FRAME-LOCAL: every frame's DPLC-selected tiles
//     stream to the same VRAM base ($780), so piece tile fields index the
//     frame's expanded source-tile list from 0 — exactly what renderFrames
//     implements when a dplc is passed.
//   • Art_Sonic = artunc/Sonic.unc (sonic.asm:4412), 41,248 B = 1,289 tiles.
//   • 88 mapping frames ↔ 88 DPLC entries, 1:1.

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseAsmMappings, parseAsmDPLC } from '../../src/core/import/asm-mappings';
import { reconstructFromFrames } from '../../src/core/import/sprite-import';
import { referenceCheckout, referenceCheckoutReason, referencePath, S1_PINNED } from '../support/fixture-tree';

const S1DIR = referencePath(S1_PINNED);
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason(S1_PINNED);
const read = (rel: string) => fs.readFileSync(path.join(S1DIR, rel));

describe('S1 Sonic DPLC: real-file parse, hand-derived entries', { skip: !referenceCheckout(S1_PINNED), meta: { skipReason: S1_ABSENT } }, () => {
  const dplc = () => parseAsmDPLC(read('_maps/Sonic - Dynamic Gfx Script.asm').toString('utf8'));
  const maps = () => parseAsmMappings(read('_maps/Sonic.asm').toString('utf8'));

  it('parses 88 DPLC entries, 1:1 with the 88 mapping frames', () => {
    expect(dplc()).toHaveLength(88);
    expect(maps()).toHaveLength(88);
  });

  it('frame 0 (SonPLC_Null) is the legal EMPTY entry: a no-op frame', () => {
    expect(dplc()[0]).toEqual([]);
    expect(maps()[0].pieces).toEqual([]); // MS_Null: bare spriteHeader
  });

  it('frame 1 (SonPLC_Stand) expands the four hand-derived dplcEntry calls to the identity list 0..16', () => {
    // HAND-TRANSCRIBED from the Gfx script:
    //   SonPLC_Stand: dplcEntry 3,0 / 8,3 / 3,$B / 3,$E
    // → [0,1,2] ++ [3..10] ++ [11,12,13] ++ [14,15,16] = 0..16 (17 tiles).
    // (Word encodings for the record: $2000, $7003, $200B, $200E.)
    const stand = dplc()[1];
    expect(stand).toEqual(Array.from({ length: 17 }, (_, i) => i));
    // Because this list is the identity, the object THUMB path (which renders
    // the declared frame 1 with NO dplc resolution) still draws a true
    // standing Sonic — asserted here so the coincidence is a pinned fact, not
    // silent luck.
  });

  it('frame 2 (SonPLC_Wait1) is the contiguous 17..31: a NON-identity list, so DPLC resolution is load-bearing', () => {
    // HAND-TRANSCRIBED: SonPLC_Wait1: dplcEntry 6,$11 / 6,$17 / 3,$1D
    // → [$11..$16] ++ [$17..$1C] ++ [$1D..$1F] = 17..31 (15 tiles).
    const wait1 = dplc()[2];
    expect(wait1).toEqual(Array.from({ length: 15 }, (_, i) => 0x11 + i));
  });

  it('the DPLC exactly covers the art pool: max source tile = 1288, the last tile of the 1,289-tile Sonic.unc', () => {
    const art = read('artunc/Sonic.unc');
    expect(art.length).toBe(41248);
    expect(art.length / 32).toBe(1289);
    const max = Math.max(...dplc().flatMap((f) => f));
    expect(max).toBe(1288);
  });

  it('frame 1 (MS_Stand) mapping pieces match the hand transcription', () => {
    // HAND-TRANSCRIBED from _maps/Sonic.asm MS_Stand (spritePiece order:
    // xpos, ypos, width, height, tile, xflip, yflip, pal, pri):
    //   -$10,-$14, 3,1, 0 / -$10,-$C, 4,2, 3 / -$10,4, 3,1, $B / -8,$C, 3,1, $E
    expect(maps()[1].pieces.map((p) => [p.xOffset, p.yOffset, p.widthCells, p.heightCells, p.tile]))
      .toEqual([
        [-0x10, -0x14, 3, 1, 0],
        [-0x10, -0x0c, 4, 2, 3],
        [-0x10, 4, 3, 1, 0x0b],
        [-8, 0x0c, 3, 1, 0x0e],
      ]);
  });

  it('full reconstruct: 88 aligned frames on the probe-recorded 64x56 canvas; the standing frame is substantially nonblank', () => {
    const recon = reconstructFromFrames(maps(), read('artunc/Sonic.unc'), 'uncompressed', dplc());
    expect(recon.frames).toHaveLength(88);
    expect([recon.width, recon.height]).toEqual([64, 56]); // audit §4 probe result
    // Frame 1 = MS_Stand: pieces cover 3x1 + 4x2 + 3x1 + 3x1 cells = 17 tiles
    // = at most 17*64 px. Coverage must be a real sprite, not a stray pixel:
    // demand at least half the covered cells' pixels are nonzero.
    const nonblank = recon.frames[1].reduce((n, v) => n + (v !== 0 ? 1 : 0), 0);
    expect(nonblank).toBeGreaterThan((17 * 64) / 2);
    expect(nonblank).toBeLessThanOrEqual(17 * 64);
    // Frame 0 (MS_Null) is genuinely empty — the blank lead is honest.
    expect(recon.frames[0].every((v) => v === 0)).toBe(true);
  });
});
