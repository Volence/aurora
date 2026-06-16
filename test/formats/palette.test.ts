import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { decodeGenesisColor, encodeGenesisColor, parsePaletteLine, buildPalette } from '../../src/core/formats/palette';

const FIXTURES = resolve(__dirname, '../fixtures');

describe('Genesis palette parsing', () => {
  describe('decodeGenesisColor', () => {
    it('decodes black (0x0000)', () => {
      const c = decodeGenesisColor(0x0000);
      expect(c).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    });

    it('decodes white (0x0EEE)', () => {
      const c = decodeGenesisColor(0x0EEE);
      expect(c).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    });

    it('decodes pure red (0x000E)', () => {
      const c = decodeGenesisColor(0x000E);
      expect(c).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    });

    it('decodes pure green (0x00E0)', () => {
      const c = decodeGenesisColor(0x00E0);
      expect(c).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    });

    it('decodes pure blue (0x0E00)', () => {
      const c = decodeGenesisColor(0x0E00);
      expect(c).toEqual({ r: 0, g: 0, b: 255, a: 255 });
    });
  });

  describe('encodeGenesisColor', () => {
    it('round-trips valid words: encode(decode(w)) === w', () => {
      for (const word of [0x0000, 0x0EEE, 0x0A42, 0x000E, 0x0E00, 0x00E0]) {
        expect(encodeGenesisColor(decodeGenesisColor(word))).toBe(word);
      }
    });

    it('clamps and rounds arbitrary 8-bit values to the nearest 3-bit level', () => {
      // r=300 clamps to 255 -> 7, g=-5 clamps to 0 -> 0, b=128 rounds to 4
      expect(encodeGenesisColor({ r: 300, g: -5, b: 128 }))
        .toBe((4 << 9) | (0 << 5) | (7 << 1));
      // mid-grey 127 rounds to 3 on every channel
      expect(encodeGenesisColor({ r: 127, g: 127, b: 127 }))
        .toBe((3 << 9) | (3 << 5) | (3 << 1));
    });
  });

  describe('parsePaletteLine', () => {
    it('parses OJZ palette file (96 bytes = 48 colors = 3 lines)', () => {
      const data = new Uint8Array(readFileSync(resolve(FIXTURES, 'OJZ_palette.bin')));
      expect(data.length).toBe(96);

      const line0 = parsePaletteLine(data, 0, 16);
      expect(line0.colors).toHaveLength(16);
      // First color should be black (0x0000)
      expect(line0.colors[0]).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    });

    it('parses SonicAndTails palette (32 bytes = 16 colors)', () => {
      const data = new Uint8Array(readFileSync(resolve(FIXTURES, 'SonicAndTails_palette.bin')));
      expect(data.length).toBe(32);

      const line = parsePaletteLine(data, 0, 16);
      expect(line.colors).toHaveLength(16);
    });
  });

  describe('buildPalette', () => {
    it('builds composite palette from multiple files', () => {
      const sonicData = new Uint8Array(readFileSync(resolve(FIXTURES, 'SonicAndTails_palette.bin')));
      const ojzData = new Uint8Array(readFileSync(resolve(FIXTURES, 'OJZ_palette.bin')));

      const palette = buildPalette([
        { data: sonicData, srcOffset: 0, destOffset: 0, length: 16 },
        { data: ojzData, srcOffset: 0, destOffset: 16, length: 48 },
      ]);

      expect(palette.lines).toHaveLength(4);
      expect(palette.lines[0].colors).toHaveLength(16);
      // Color 0 of each line should be transparent
      expect(palette.lines[0].colors[0].a).toBe(0);
      expect(palette.lines[1].colors[0].a).toBe(0);
    });
  });
});
