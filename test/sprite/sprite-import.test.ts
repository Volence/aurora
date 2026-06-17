import { describe, it, expect } from 'vitest';
import { reconstructSpriteFrames } from '../../src/core/import/sprite-import';
import { decomposeFrame, assembleSprite } from '../../src/core/art/sprite-decompose';
import { serializeSpriteMappings } from '../../src/core/export/sprite-mappings-export';
import { serializeTiles } from '../../src/core/export/tile-dedup';

function paint(fill: (set: (gx: number, gy: number, c: number) => void) => void, w = 16, h = 16): Uint8Array {
  const px = new Uint8Array(w * h);
  const set = (gx: number, gy: number, c: number) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px[(gy * 8 + y) * w + (gx * 8 + x)] = c;
  };
  fill(set);
  return px;
}

describe('reconstructSpriteFrames', () => {
  it('round-trips a single 16x16 frame (export bytes → editable bitmap)', () => {
    const pixels = paint((set) => { set(0, 0, 1); set(1, 0, 2); set(0, 1, 3); set(1, 1, 4); });
    const ox = 8, oy = 8;
    const { tiles, pieces } = decomposeFrame({ id: 'f', pixels, width: 16, height: 16, originX: ox, originY: oy, palette: 0, priority: false });
    const mappings = serializeSpriteMappings([{ id: 'f', pieces }]);
    const art = serializeTiles(tiles);

    const recon = reconstructSpriteFrames(mappings, art);
    expect(recon.width).toBe(16);
    expect(recon.height).toBe(16);
    expect(recon.frames).toHaveLength(1);
    expect(Array.from(recon.frames[0])).toEqual(Array.from(pixels));
  });

  it('round-trips a multi-frame sprite via assembleSprite', () => {
    const a = paint((set) => { set(0, 0, 5); set(1, 1, 6); });
    const b = paint((set) => { set(1, 0, 7); set(0, 1, 8); });
    const { art, frames } = assembleSprite([
      { id: 'a', pixels: a, width: 16, height: 16, originX: 8, originY: 8, palette: 0, priority: false },
      { id: 'b', pixels: b, width: 16, height: 16, originX: 8, originY: 8, palette: 0, priority: false },
    ]);
    const recon = reconstructSpriteFrames(serializeSpriteMappings(frames), serializeTiles(art));
    expect(recon.frames).toHaveLength(2);
    expect(Array.from(recon.frames[0])).toEqual(Array.from(a));
    expect(Array.from(recon.frames[1])).toEqual(Array.from(b));
  });

  it('always yields at least one frame', () => {
    const recon = reconstructSpriteFrames(new Uint8Array(0), new Uint8Array(0));
    expect(recon.frames.length).toBeGreaterThanOrEqual(1);
  });
});
