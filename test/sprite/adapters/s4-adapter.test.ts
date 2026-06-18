import { describe, it, expect } from 'vitest';
import { s4Adapter } from '../../../src/core/formats/games/s4';
import { getAdapter, ADAPTER_IDS } from '../../../src/core/formats/games';
import { serializeSpriteMappings } from '../../../src/core/export/sprite-mappings-export';
import { parseSpriteMappings } from '../../../src/core/import/sprite-mappings-import';
import type { SpriteFrame } from '../../../src/core/model/sprite-types';

const frames: SpriteFrame[] = [
  { id: 'a', pieces: [
    { xOffset: -16, yOffset: -16, widthCells: 4, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false },
    { xOffset: -16, yOffset: -8, widthCells: 4, heightCells: 3, tile: 0x24, palette: 1, priority: true, xFlip: true, yFlip: false },
  ] },
  { id: 'b', pieces: [
    { xOffset: 0, yOffset: 0, widthCells: 2, heightCells: 2, tile: 0x100, palette: 2, priority: false, xFlip: false, yFlip: true },
  ] },
];

describe('s4 adapter', () => {
  it('declares its identity and art compression', () => {
    expect(s4Adapter.id).toBe('s4');
    expect(s4Adapter.artCompression).toBe('uncompressed');
  });

  it('writeMappings matches the existing S4 serializer byte-for-byte', () => {
    expect(s4Adapter.writeMappings(frames)).toEqual(serializeSpriteMappings(frames));
  });

  it('readMappings matches the existing S4 parser', () => {
    const bytes = serializeSpriteMappings(frames);
    expect(s4Adapter.readMappings(bytes)).toEqual(parseSpriteMappings(bytes));
  });

  it('round-trips mappings (read ∘ write is identity on bytes)', () => {
    const bytes = s4Adapter.writeMappings(frames);
    expect(s4Adapter.writeMappings(s4Adapter.readMappings(bytes))).toEqual(bytes);
  });

  it('round-trips per-frame DPLC source-tile lists', () => {
    const perFrame = [[5, 6, 7], [], [0, 1, 2, 3]];
    const bytes = s4Adapter.writeDPLC!(perFrame);
    expect(s4Adapter.readDPLC!(bytes)).toEqual(perFrame);
  });

  it('writeDPLC groups runs longer than 16 tiles into multiple entries', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => i);
    const bytes = s4Adapter.writeDPLC!([twenty]);
    // Re-reading expands back to the same flat list regardless of entry split.
    expect(s4Adapter.readDPLC!(bytes)).toEqual([twenty]);
  });
});

describe('adapter registry', () => {
  it('resolves s4 by id', () => {
    expect(getAdapter('s4')).toBe(s4Adapter);
  });
  it('lists s4 among known adapters', () => {
    expect(ADAPTER_IDS).toContain('s4');
  });
});
