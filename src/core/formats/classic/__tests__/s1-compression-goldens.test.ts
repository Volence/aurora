import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import { kosinskiCompress, kosinskiDecompress } from '../../kosinski';
import { nemesisCompress, nemesisDecompress } from '../../../compress/nemesis';

const S1DIR = '/home/volence/sonic_hacks/s1disasm';

/**
 * Aurora's Kosinski and Nemesis codecs were previously exercised only on Sonic 4
 * and synthetic data. Before the disasm-project work builds S1 level loading on
 * them, prove they survive real Sonic 1 data: every map256 chunk table and every
 * 8x8 art bank decodes to a sanely-sized buffer and round-trips byte-for-byte.
 */
describe.skipIf(!fs.existsSync(S1DIR))('kosinski/nemesis goldens over real s1disasm data', () => {
  const map256Dir = `${S1DIR}/map256`;
  const kosFiles = fs.existsSync(map256Dir)
    ? fs.readdirSync(map256Dir).filter((f) => f.toLowerCase().endsWith('.kos'))
    : [];

  const artnemDir = `${S1DIR}/artnem`;
  const nemFiles = fs.existsSync(artnemDir)
    ? fs.readdirSync(artnemDir).filter((f) => f.startsWith('8x8 - ') && f.toLowerCase().endsWith('.nem'))
    : [];

  it('map256/*.kos decompresses, is chunk-aligned, and round-trips', () => {
    expect(kosFiles.length).toBeGreaterThan(0);
    for (const file of kosFiles) {
      const compressed = new Uint8Array(fs.readFileSync(`${map256Dir}/${file}`));
      const decoded = kosinskiDecompress(compressed);
      // Each 256x256 chunk = 16x16 block words * 2 bytes = 512 bytes.
      expect(decoded.length, `empty decode for ${file}`).toBeGreaterThan(0);
      expect(decoded.length % 512, `not chunk-aligned for ${file}`).toBe(0);
      const back = kosinskiDecompress(kosinskiCompress(decoded));
      expect(Array.from(back), `round-trip mismatch for ${file}`).toEqual(Array.from(decoded));
    }
  });

  it('artnem/8x8 - *.nem decompresses, is tile-aligned, and round-trips', () => {
    expect(nemFiles.length).toBeGreaterThan(0);
    for (const file of nemFiles) {
      const compressed = new Uint8Array(fs.readFileSync(`${artnemDir}/${file}`));
      const decoded = nemesisDecompress(compressed);
      // One 4bpp 8x8 tile = 32 bytes.
      expect(decoded.length, `empty decode for ${file}`).toBeGreaterThan(0);
      expect(decoded.length % 32, `not tile-aligned for ${file}`).toBe(0);
      const back = nemesisDecompress(nemesisCompress(decoded));
      expect(Array.from(back), `round-trip mismatch for ${file}`).toEqual(Array.from(decoded));
    }
  });
});
