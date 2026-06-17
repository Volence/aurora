import { describe, it, expect } from 'vitest';
import { buildSpriteExport } from '../../../src/core/export/sprite-export';
import { serializeSpriteMappings } from '../../../src/core/export/sprite-mappings-export';
import { reconstructWithAdapter } from '../../../src/core/import/sprite-import';
import { getAdapter } from '../../../src/core/formats/games';
import { nemesisDecompress } from '../../../src/core/compress/nemesis';
import type { RawFrame } from '../../../src/core/art/sprite-decompose';
import type { PerFrameAnimation } from '../../../src/core/export/sprite-anim-export';

function frame(id: string, fill: number): RawFrame {
  return { id, pixels: new Uint8Array(16 * 16).fill(fill), width: 16, height: 16, originX: 8, originY: 8, palette: 0, priority: false };
}
const anim: PerFrameAnimation = { name: 'Loop', steps: [{ frame: 0, duration: 6 }], control: { kind: 'loop' } };
const frames = [frame('a', 1), frame('b', 2)];

describe('buildSpriteExport target format', () => {
  it('defaults to s4 with uncompressed art and unchanged mappings bytes', () => {
    const out = buildSpriteExport('TestBadnik', frames, anim);
    expect(out.manifest.sourceFormat).toBe('s4');
    expect(out.art.length).toBe(out.manifest.tileCount * 32); // uncompressed
  });

  it('targets s2: Nemesis-compressed art + S2 mappings that round-trip', () => {
    const out = buildSpriteExport('TestBadnik', frames, anim, { targetFormat: 's2' });
    expect(out.manifest.sourceFormat).toBe('s2');

    // Art is Nemesis-compressed: it decompresses back to tileCount*32 raw bytes.
    const raw = nemesisDecompress(out.art);
    expect(raw.length).toBe(out.manifest.tileCount * 32);

    // Mappings are real S2 format, not the S4 layout: re-serializing the parsed
    // logical frames as S4 yields different bytes, but the s2 adapter round-trips.
    const logical = getAdapter('s2').readMappings(out.mappings);
    expect(Array.from(getAdapter('s2').writeMappings(logical))).toEqual(Array.from(out.mappings));
    expect(Array.from(serializeSpriteMappings(logical))).not.toEqual(Array.from(out.mappings));

    // Reconstruct via the s2 adapter → original frame pixels recovered.
    const recon = reconstructWithAdapter(getAdapter('s2'), out.mappings, out.art);
    expect(recon.frames).toHaveLength(2);
    expect(Array.from(recon.frames[0])).toEqual(Array.from(frames[0].pixels));
    expect(Array.from(recon.frames[1])).toEqual(Array.from(frames[1].pixels));
  });

  it('targets s2 in DPLC mode: round-trips through the s2 adapter', () => {
    const out = buildSpriteExport('Char', frames, anim, { targetFormat: 's2', dplc: true });
    expect(out.dplc).toBeDefined();
    const recon = reconstructWithAdapter(getAdapter('s2'), out.mappings, out.art, out.dplc);
    expect(Array.from(recon.frames[0])).toEqual(Array.from(frames[0].pixels));
    expect(Array.from(recon.frames[1])).toEqual(Array.from(frames[1].pixels));
  });
});
