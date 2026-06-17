import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { s1Adapter } from '../../../src/core/formats/games/s1';

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/mappings/${n}`, import.meta.url)));

describe('s1 adapter — vs REAL s1disasm mapping data (Ball Hog)', () => {
  const frames = s1Adapter.readMappings(fx('s1_ballhog_map.bin'));

  it('recovers all 6 frames with a byte piece-count header', () => {
    expect(frames).toHaveLength(6);
    expect(frames[0].pieces).toHaveLength(2);
  });

  it('reads 5-byte piece fields (ypos.b/size.b/tile.w/xpos.b)', () => {
    // .hog_Stand: spritePiece -$C,-$11,3,2,0  and  -$C,-1,3,3,6
    expect(frames[0].pieces[0]).toEqual({
      xOffset: -12, yOffset: -17, widthCells: 3, heightCells: 2,
      tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false,
    });
    expect(frames[0].pieces[1]).toMatchObject({ xOffset: -12, yOffset: -1, widthCells: 3, heightCells: 3, tile: 6 });
    // .hog_Open differs only in the second piece's tile ($F).
    expect(frames[1].pieces[1]).toMatchObject({ tile: 0xf });
  });

  it('writeMappings reproduces the real fixture byte-for-byte (incl. even pad)', () => {
    expect(Array.from(s1Adapter.writeMappings(frames))).toEqual(Array.from(fx('s1_ballhog_map.bin')));
  });
});

describe('s1 adapter — vs REAL s1disasm DPLC data (Sonic Dynamic Gfx Script)', () => {
  const perFrame = s1Adapter.readDPLC!(fx('s1_sonicdplc.bin'));

  it('recovers 88 frames; Null is empty, Stand loads tiles 0..16', () => {
    expect(perFrame).toHaveLength(88);
    expect(perFrame[0]).toEqual([]);
    // SonPLC_Stand: dplcEntry 3,0 / 8,3 / 3,$B / 3,$E  ->  consecutive 0..16
    expect(perFrame[1]).toEqual(Array.from({ length: 17 }, (_, i) => i));
  });

  it('round-trips real S1 DPLC semantically', () => {
    expect(s1Adapter.readDPLC!(s1Adapter.writeDPLC!(perFrame))).toEqual(perFrame);
  });
});

describe('s1 adapter identity', () => {
  it('is s1 / nemesis art', () => {
    expect(s1Adapter.id).toBe('s1');
    expect(s1Adapter.artCompression).toBe('nemesis');
  });
});
