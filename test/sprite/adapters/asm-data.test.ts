import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { assembleDataAsm, parseAsmMappings } from '../../../src/core/import/asm-mappings';
import { s2Adapter } from '../../../src/core/formats/games/s2';
import { reconstructFromFrames } from '../../../src/core/import/sprite-import';

const txt = (n: string) => readFileSync(new URL(`../../fixtures/mappings/src/${n}`, import.meta.url), 'utf8');
const bin = (n: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/mappings/${n}`, import.meta.url)));

describe('assembleDataAsm — raw dc.b/dc.w mapping .asm (Flex 2 output)', () => {
  it('macro parser returns [] (it is raw bytes, not macro call-sites)', () => {
    expect(parseAsmMappings(txt('plantbadmaps.asm'))).toEqual([]);
  });

  it('assembles to the exact asl-assembled bytes (incl. label arithmetic + even)', () => {
    expect(Array.from(assembleDataAsm(txt('plantbadmaps.asm')))).toEqual(Array.from(bin('plantbadmaps.bin')));
  });

  it('the assembled bytes read as a real S2 mapping (6 frames)', () => {
    const frames = s2Adapter.readMappings(assembleDataAsm(txt('plantbadmaps.asm')));
    expect(frames).toHaveLength(6);
    expect(frames[0].pieces).toHaveLength(4);
    expect(frames[0].pieces[0]).toMatchObject({
      xOffset: -8, yOffset: -16, widthCells: 2, heightCells: 2, tile: 0, palette: 1,
    });
  });

  it('end-to-end: Flex2 mapping + real Nemesis art reconstruct into rendered frames', () => {
    // The exact case from the editor: open plantbadmaps.asm (raw dc) + plantbadnikart
    // (Nemesis) as S2. Frames must render real pixels, not blanks.
    const frames = s2Adapter.readMappings(assembleDataAsm(txt('plantbadmaps.asm')));
    const recon = reconstructFromFrames(frames, bin('plantbadnikart.nem'), 'nemesis');
    expect(recon.frames).toHaveLength(6);
    expect(recon.frames.some((f) => f.some((v) => v !== 0))).toBe(true);
  });
});
