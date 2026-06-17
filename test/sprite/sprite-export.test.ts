import { describe, it, expect } from 'vitest';
import { buildSpriteExport, serializeDPLC } from '../../src/core/export/sprite-export';
import { parseDPLC, reconstructDPLCSprite } from '../../src/core/import/sprite-import';
import type { RawFrame } from '../../src/core/art/sprite-decompose';
import type { PerFrameAnimation } from '../../src/core/export/sprite-anim-export';

function frame(id: string, fill: number): RawFrame {
  return { id, pixels: new Uint8Array(16 * 16).fill(fill), width: 16, height: 16, originX: 8, originY: 8, palette: 0, priority: false };
}

const anim: PerFrameAnimation = {
  name: 'Loop',
  steps: [{ frame: 0, duration: 6 }, { frame: 1, duration: 6 }],
  control: { kind: 'loop' },
};

describe('buildSpriteExport', () => {
  it('produces mappings, art, anim asm, and a manifest', () => {
    const out = buildSpriteExport('TestBadnik', [frame('a', 1), frame('b', 2)], anim);
    expect(out.mappings.length).toBeGreaterThan(0);
    expect(out.art.length).toBe(out.manifest.tileCount * 32); // 32 bytes / 4bpp tile
    expect(out.animAsm).toContain('Ani_TestBadnik:');
    expect(out.animAsm).toContain('Ani_TestBadnik_Loop:');
    expect(out.animAsm).toContain('dc.b 0, 6, 1, 6, AF_END');
    expect(out.manifest).toMatchObject({
      name: 'TestBadnik', frameCount: 2, animTable: 'Ani_TestBadnik',
      frame: { width: 16, height: 16 },
    });
    expect(out.manifest.bytes.mappings).toBe(out.mappings.length);
  });

  it('rejects a sprite name that is not a valid asm label', () => {
    expect(() => buildSpriteExport('bad name', [frame('a', 1)], anim)).toThrow(/not a valid asm label/);
  });

  it('rejects an empty frame list', () => {
    expect(() => buildSpriteExport('X', [], anim)).toThrow(/no frames/);
  });
});

describe('serializeDPLC', () => {
  it('round-trips with parseDPLC', () => {
    const entries = [[{ start: 5, count: 3 }], [{ start: 0, count: 16 }, { start: 16, count: 2 }]];
    const bytes = serializeDPLC(entries);
    // frame 0 loads source tiles 5,6,7 ; frame 1 loads 0..15 then 16,17
    expect(parseDPLC(bytes)).toEqual([
      [5, 6, 7],
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
    ]);
  });
});

describe('buildSpriteExport DPLC mode', () => {
  it('emits a dplc stream and round-trips back to the same frames', () => {
    const a = frame('a', 1), b = frame('b', 2);
    const out = buildSpriteExport('Char', [a, b], anim, { dplc: true });
    expect(out.dplc).toBeDefined();
    expect(out.manifest.dplc).toBe(true);
    // reconstruct from the DPLC artifacts → identical frames
    const recon = reconstructDPLCSprite(out.mappings, out.dplc!, out.art);
    expect(recon.frames).toHaveLength(2);
    expect(Array.from(recon.frames[0])).toEqual(Array.from(a.pixels));
    expect(Array.from(recon.frames[1])).toEqual(Array.from(b.pixels));
  });

  it('non-DPLC export has no dplc stream', () => {
    const out = buildSpriteExport('Char', [frame('a', 1)], anim);
    expect(out.dplc).toBeUndefined();
    expect(out.manifest.dplc).toBe(false);
  });
});
