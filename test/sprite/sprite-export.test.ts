import { describe, it, expect } from 'vitest';
import { buildSpriteExport } from '../../src/core/export/sprite-export';
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
