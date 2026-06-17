import { describe, it, expect } from 'vitest';
import { reconstructWithAdapter } from '../../../src/core/import/sprite-import';
import { s2Adapter } from '../../../src/core/formats/games/s2';
import { s4Adapter } from '../../../src/core/formats/games/s4';
import { nemesisCompress } from '../../../src/core/compress/nemesis';
import type { SpriteFrame } from '../../../src/core/model/sprite-types';

// One 8x8 piece referencing tile 0; raw art is a single tile (32 bytes = 0x20).
const frames: SpriteFrame[] = [{
  id: 'a',
  pieces: [{ xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false }],
}];
const rawArt = new Uint8Array(32);
for (let i = 0; i < 32; i++) rawArt[i] = ((i % 15) << 4) | ((i + 1) % 15); // varied non-zero nibbles

describe('reconstructWithAdapter', () => {
  it('s4 path (uncompressed art) reconstructs the frame', () => {
    const map = s4Adapter.writeMappings(frames);
    const recon = reconstructWithAdapter(s4Adapter, map, rawArt);
    expect(recon.frames).toHaveLength(1);
    // tile has non-zero pixels, so the rendered frame is not all-transparent.
    expect(recon.frames[0].some((v) => v !== 0)).toBe(true);
  });

  it('decompresses Nemesis art and uses the s2 mapping parse', () => {
    const map = s2Adapter.writeMappings(frames);
    const compressed = nemesisCompress(rawArt);
    const recon = reconstructWithAdapter(s2Adapter, map, compressed);
    // Identical logical frames + identical art → identical reconstruction whether
    // read as S2 (Nemesis) or S4 (uncompressed). Proves both the adapter parse and
    // the art decompression are wired correctly.
    const s4recon = reconstructWithAdapter(s4Adapter, s4Adapter.writeMappings(frames), rawArt);
    expect(recon).toEqual(s4recon);
  });

  it('resolves per-frame DPLC source tiles when a DPLC stream is given', () => {
    // Frame loads source tile 0 into local index 0; piece references local tile 0.
    const map = s2Adapter.writeMappings(frames);
    const dplc = s2Adapter.writeDPLC!([[0]]);
    const recon = reconstructWithAdapter(s2Adapter, map, nemesisCompress(rawArt), dplc);
    expect(recon.frames[0].some((v) => v !== 0)).toBe(true);
  });
});
