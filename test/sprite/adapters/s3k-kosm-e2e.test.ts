import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { assembleDataAsm } from '../../../src/core/import/asm-mappings';
import { s3kAdapter } from '../../../src/core/formats/games/s3k';
import { reconstructFromFrames } from '../../../src/core/import/sprite-import';

const txt = (n: string) => readFileSync(new URL(`../../fixtures/kosinski/${n}`, import.meta.url), 'utf8');
const bin = (n: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/kosinski/${n}`, import.meta.url)));

describe('end-to-end: real S&K Mushmeanie (S3K raw-dc mapping + Kosinski-moduled art)', () => {
  it('reads the mapping (4 frames, Ver-3 6-byte pieces)', () => {
    const frames = s3kAdapter.readMappings(assembleDataAsm(txt('mushmeanie_map.asm')));
    expect(frames).toHaveLength(4);
    expect(frames[0].pieces).toHaveLength(1);
    expect(frames[1].pieces).toHaveLength(2);
    // frame 0 piece: dc.b $F8,9,0,0,$FF,$F4 → ypos -8, 3x2 cells, tile 0, xpos -12
    expect(frames[0].pieces[0]).toMatchObject({ xOffset: -12, yOffset: -8, widthCells: 3, heightCells: 2, tile: 0 });
  });

  it('reconstructs into rendered frames using kosinski-moduled art (not blank)', () => {
    const frames = s3kAdapter.readMappings(assembleDataAsm(txt('mushmeanie_map.asm')));
    // The bug was: S3K art decoded as Nemesis → garbage. With kosinski-moduled it renders.
    const recon = reconstructFromFrames(frames, bin('mushmeanie.kosm'), 'kosinski-moduled');
    expect(recon.frames).toHaveLength(4);
    expect(recon.frames.some((f) => f.some((v) => v !== 0))).toBe(true);
  });
});
