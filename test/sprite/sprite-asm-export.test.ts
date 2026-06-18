import { describe, it, expect } from 'vitest';
import { writeAsmMappings, writeAsmDPLC } from '../../src/core/export/sprite-asm-export';
import { parseAsmMappings, parseAsmDPLC } from '../../src/core/import/asm-mappings';
import type { SpriteFrame } from '../../src/core/model/sprite-types';

const frames: SpriteFrame[] = [
  { id: 'f0', pieces: [
    { xOffset: -16, yOffset: -16, widthCells: 4, heightCells: 1, tile: 0, palette: 0, priority: false, xFlip: false, yFlip: false },
    { xOffset: -16, yOffset: -8, widthCells: 4, heightCells: 3, tile: 0x24, palette: 1, priority: true, xFlip: true, yFlip: false },
  ] },
  { id: 'f1', pieces: [
    { xOffset: 0, yOffset: 0, widthCells: 2, heightCells: 2, tile: 0x100, palette: 2, priority: false, xFlip: false, yFlip: true },
  ] },
];

describe('writeAsmMappings', () => {
  it('emits spriteHeader/spritePiece macro source', () => {
    const asm = writeAsmMappings(frames, 'Map_Test');
    expect(asm).toContain('Map_Test:\tmappingsTable');
    expect(asm).toContain('mappingsTableEntry.w\tMap_Test_F0');
    expect(asm).toContain('Map_Test_F0:\tspriteHeader');
    expect(asm).toContain('spritePiece\t');
    expect(asm).toContain('Map_Test_F0_End');
  });

  it('round-trips: parseAsmMappings(writeAsmMappings(frames)) recovers the pieces', () => {
    const parsed = parseAsmMappings(writeAsmMappings(frames, 'Map_Test'));
    expect(parsed.map((f) => f.pieces)).toEqual(frames.map((f) => f.pieces));
  });
});

describe('writeAsmDPLC', () => {
  const perFrame = [[5, 6, 7], [], [0, 1, 2, 3], Array.from({ length: 20 }, (_, i) => i)];

  it('emits dplcHeader/dplcEntry macro source', () => {
    const asm = writeAsmDPLC(perFrame, 'DPLC_Test');
    expect(asm).toContain('DPLC_Test:\tmappingsTable');
    expect(asm).toContain('DPLC_Test_F0:\tdplcHeader');
    expect(asm).toContain('dplcEntry\t');
  });

  it('round-trips through parseAsmDPLC (incl. >16-tile split and empty frame)', () => {
    expect(parseAsmDPLC(writeAsmDPLC(perFrame, 'DPLC_Test'))).toEqual(perFrame);
  });
});
