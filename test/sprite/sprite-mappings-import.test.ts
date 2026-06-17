import { describe, it, expect } from 'vitest';
import { parseSpriteMappings } from '../../src/core/import/sprite-mappings-import';
import { serializeSpriteMappings } from '../../src/core/export/sprite-mappings-export';
import type { SpriteFrame, SpritePiece } from '../../src/core/model/sprite-types';

function piece(p: Partial<SpritePiece>): SpritePiece {
  return { xOffset: 0, yOffset: 0, widthCells: 1, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false, ...p };
}

describe('parseSpriteMappings', () => {
  it('round-trips with the serializer (serialize∘parse∘serialize is stable)', () => {
    const frames: SpriteFrame[] = [
      { id: 'a', pieces: [
        piece({ xOffset: -8, yOffset: -8, widthCells: 2, heightCells: 2, tile: 0 }),
        piece({ xOffset: 8, yOffset: 0, widthCells: 1, heightCells: 4, tile: 4, palette: 2, priority: true, xFlip: true }),
      ] },
      { id: 'b', pieces: [piece({ xOffset: -4, yOffset: -4, tile: 9, yFlip: true })] },
    ];
    const bytes = serializeSpriteMappings(frames);
    const parsed = parseSpriteMappings(bytes);
    expect(serializeSpriteMappings(parsed)).toEqual(bytes);
  });

  it('recovers all piece fields (size, flips, palette, priority, tile, offsets)', () => {
    const frames: SpriteFrame[] = [{ id: 'x', pieces: [
      piece({ xOffset: -12, yOffset: 6, widthCells: 4, heightCells: 1, tile: 0x123, palette: 3, priority: true, xFlip: true, yFlip: false }),
    ] }];
    const parsed = parseSpriteMappings(serializeSpriteMappings(frames));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].pieces[0]).toMatchObject({
      xOffset: -12, yOffset: 6, widthCells: 4, heightCells: 1,
      tile: 0x123, palette: 3, priority: true, xFlip: true, yFlip: false,
    });
  });

  it('recovers the frame count from the offset table', () => {
    const frames: SpriteFrame[] = [
      { id: '0', pieces: [piece({})] },
      { id: '1', pieces: [piece({}), piece({ xOffset: 8 })] },
      { id: '2', pieces: [piece({})] },
    ];
    expect(parseSpriteMappings(serializeSpriteMappings(frames))).toHaveLength(3);
  });

  it('returns [] for empty/garbage input', () => {
    expect(parseSpriteMappings(new Uint8Array(0))).toEqual([]);
    expect(parseSpriteMappings(new Uint8Array([0, 0]))).toEqual([]);
  });
});
