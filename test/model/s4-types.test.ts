import { describe, it, expect } from 'vitest';
import {
  createSectionTileGrid,
  createSection,
  createChunkDef,
  packNametableWord,
  unpackNametableWord,
  SECTION_TILES_WIDE,
  SECTION_TILES_HIGH,
} from '../../src/core/model/s4-types';

describe('s4-types', () => {
  describe('SectionTileGrid', () => {
    it('creates a 256x256 grid with zeroed arrays', () => {
      const grid = createSectionTileGrid();
      expect(grid.width).toBe(256);
      expect(grid.height).toBe(256);
      expect(grid.nametable.length).toBe(65536);
      expect(grid.collision.length).toBe(65536);
      expect(grid.nametable[0]).toBe(0);
      expect(grid.collision[0]).toBe(0);
    });
  });

  describe('packNametableWord / unpackNametableWord', () => {
    it('roundtrips a nametable word with all flags', () => {
      const word = packNametableWord(42, 2, true, false, true);
      const unpacked = unpackNametableWord(word);
      expect(unpacked.tileIndex).toBe(42);
      expect(unpacked.palette).toBe(2);
      expect(unpacked.priority).toBe(true);
      expect(unpacked.vFlip).toBe(false);
      expect(unpacked.hFlip).toBe(true);
    });

    it('handles zero tile with no flags', () => {
      const word = packNametableWord(0, 0, false, false, false);
      expect(word).toBe(0);
      const unpacked = unpackNametableWord(word);
      expect(unpacked.tileIndex).toBe(0);
      expect(unpacked.palette).toBe(0);
    });

    it('handles max tile index (2047)', () => {
      const word = packNametableWord(2047, 3, true, true, true);
      const unpacked = unpackNametableWord(word);
      expect(unpacked.tileIndex).toBe(2047);
      expect(unpacked.palette).toBe(3);
      expect(unpacked.priority).toBe(true);
      expect(unpacked.vFlip).toBe(true);
      expect(unpacked.hFlip).toBe(true);
    });
  });

  describe('createSection', () => {
    it('creates a section with empty tile grid and no entities', () => {
      const section = createSection(0, 'Test');
      expect(section.index).toBe(0);
      expect(section.name).toBe('Test');
      expect(section.tileGrid.nametable.length).toBe(65536);
      expect(section.objects).toEqual([]);
      expect(section.rings).toEqual([]);
      expect(section.paletteRef).toBeNull();
      expect(section.parallaxRef).toBeNull();
      expect(section.flags).toBe(0);
      expect(section.music).toBe(0);
    });
  });

  describe('createChunkDef', () => {
    it('creates a chunk with specified dimensions', () => {
      const chunk = createChunkDef('test-chunk', 'Test', 16, 8);
      expect(chunk.id).toBe('test-chunk');
      expect(chunk.widthTiles).toBe(16);
      expect(chunk.heightTiles).toBe(8);
      expect(chunk.nametable.length).toBe(128);
      expect(chunk.collision.length).toBe(128);
    });
  });

  describe('constants', () => {
    it('defines section dimensions', () => {
      expect(SECTION_TILES_WIDE).toBe(256);
      expect(SECTION_TILES_HIGH).toBe(256);
    });
  });
});
