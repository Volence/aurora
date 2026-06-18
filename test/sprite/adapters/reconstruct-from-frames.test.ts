import { describe, it, expect } from 'vitest';
import { reconstructFromFrames, reconstructWithAdapter } from '../../../src/core/import/sprite-import';
import { s2Adapter } from '../../../src/core/formats/games/s2';
import { nemesisCompress } from '../../../src/core/compress/nemesis';
import type { SpriteFrame } from '../../../src/core/model/sprite-types';

const frames: SpriteFrame[] = [{
  id: 'f0',
  pieces: [{ xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false }],
}];
const rawArt = new Uint8Array(32);
for (let i = 0; i < 32; i++) rawArt[i] = ((i % 15) << 4) | ((i + 1) % 15);

describe('reconstructFromFrames', () => {
  it('renders already-parsed frames against decompressed art (matches the binary path)', () => {
    const compressed = nemesisCompress(rawArt);
    const fromFrames = reconstructFromFrames(frames, compressed, 'nemesis');
    const fromBinary = reconstructWithAdapter(s2Adapter, s2Adapter.writeMappings(frames), compressed);
    expect(fromFrames).toEqual(fromBinary);
  });

  it('resolves DPLC source-tile lists when given', () => {
    const recon = reconstructFromFrames(frames, nemesisCompress(rawArt), 'nemesis', [[0]]);
    expect(recon.frames[0].some((v) => v !== 0)).toBe(true);
  });
});
