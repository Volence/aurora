import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseAsmMappings, parseAsmDPLC } from '../../../src/core/import/asm-mappings';
import { s1Adapter } from '../../../src/core/formats/games/s1';
import { s2Adapter } from '../../../src/core/formats/games/s2';

const txt = (n: string) => readFileSync(new URL(`../../fixtures/mappings/src/${n}`, import.meta.url), 'utf8');
const bin = (n: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/mappings/${n}`, import.meta.url)));

describe('parseAsmMappings — text parse == assembled-binary read', () => {
  it('S2 obj0B.asm decodes to the same logical frames as the s2 binary', () => {
    expect(parseAsmMappings(txt('obj0B.asm'))).toEqual(s2Adapter.readMappings(bin('s2_obj0B_map.bin')));
  });

  it('S1 Ball Hog .asm decodes to the same logical frames as the s1 binary', () => {
    expect(parseAsmMappings(txt('s1_ballhog_map.asm'))).toEqual(s1Adapter.readMappings(bin('s1_ballhog_map.bin')));
  });

  it('parses operands: hex ($24), decimal, and negatives (-$10, -8)', () => {
    const frames = parseAsmMappings(txt('obj0B.asm'));
    expect(frames[0].pieces[0]).toMatchObject({ xOffset: -16, yOffset: -16, tile: 0 });
    expect(frames[0].pieces[1]).toMatchObject({ yOffset: -8, tile: 0x24 });
  });

  it('returns [] for raw dc.b/dc.w mapping data (no macro call-sites)', () => {
    // S.C.E. / skdisasm raw-byte mappings have no spritePiece macros to parse.
    expect(parseAsmMappings(txt('sce_instashield_map.asm'))).toEqual([]);
  });
});

describe('parseAsmDPLC — text parse == assembled-binary read', () => {
  it('S2 obj08 DPLC .asm == s2 binary read, honoring duplicate table entries (22 frames)', () => {
    expect(parseAsmDPLC(txt('obj08_dplc.asm'))).toEqual(s2Adapter.readDPLC!(bin('s2_obj08_dplc.bin')));
  });

  it('S1 Sonic DynPLC .asm == s1 binary read (88 frames)', () => {
    expect(parseAsmDPLC(txt('s1_sonicdplc.asm'))).toEqual(s1Adapter.readDPLC!(bin('s1_sonicdplc.bin')));
  });
});
