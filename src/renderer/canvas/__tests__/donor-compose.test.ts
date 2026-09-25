/**
 * The donor page's pixels, on the OWNED fixture (test/fixtures/donors/).
 *
 * The anti-vacuous property the page owes before anything else: it DRAWS the
 * zone. A composer that returned an all-transparent buffer would leave every
 * geometry row green, so these rows count drawn pixels against a figure derived
 * from the tiles themselves.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FileAccess } from '../../../core/project/adapter';
import { DONOR_ROOT_REL, loadDonorZone } from '../../../core/formats/donors/donor-tree';
import { composeWindow, drawnPixels, rgbaLines, tileRgbaLookup } from '../donor-compose';

const FIXTURE_ROOT = resolve(__dirname, '../../../../test/fixtures/donors/aeon-root');

function diskFa(root: string): FileAccess {
  return {
    rootDir: root,
    async exists(rel) { return existsSync(join(root, rel)); },
    async read(rel) { return new Uint8Array(readFileSync(join(root, rel))); },
    async list(rel) { const p = join(root, rel); return existsSync(p) ? readdirSync(p) : []; },
  };
}

describe('donor composition draws what the tiles say', () => {
  it('every painted cell of a section draws exactly its tile\'s non-zero pixels', async () => {
    expect(existsSync(join(FIXTURE_ROOT, DONOR_ROOT_REL))).toBe(true);
    const z = await loadDonorZone(diskFa(FIXTURE_ROOT), 's2disasm', 'FXZ');
    const lookup = tileRgbaLookup(z.tiles, rgbaLines(z.palette, z.manifest.paletteFirstLine, null));
    // The expected count is derived from the TILES, not typed: for each painted
    // cell, the number of its tile's pixels whose colour index is not 0.
    const opaque = z.tiles.map((t) => t.pixels.reduce((n, p) => n + (p !== 0 ? 1 : 0), 0));
    const st = z.manifest.sectionTiles;
    for (const s of z.manifest.sections) {
      const win = { c0: s.sx * st, r0: s.sy * st, w: st, h: st };
      let want = 0;
      for (let r = 0; r < st; r++) {
        for (let c = 0; c < st; c++) want += opaque[z.words[(win.r0 + r) * z.cols + win.c0 + c] & 0x7ff] ?? 0;
      }
      const rgba = composeWindow(z.words, z.cols, win, [lookup]);
      expect(drawnPixels(rgba), `section ${s.n}`).toBe(want);
      // Anti-vacuous: every section of the fixture has painted cells.
      expect(want, `section ${s.n} has something to draw`).toBeGreaterThan(0);
    }
  });

  it('a VOID key draws nothing, and is never zone 0', () => {
    // One painted word, keyed -1: a composer that read -1 as zone 0 would draw it.
    const tiles = [{ pixels: new Uint8Array(64) }, { pixels: new Uint8Array(64).fill(1) }];
    const lines = rgbaLines(new Uint8Array(96).fill(0x0e), 1, null);
    const words = new Uint16Array([1 | (1 << 13), 1 | (1 << 13)]);
    const keys = new Int8Array([-1, 0]);
    const rgba = composeWindow(words, 2, { c0: 0, r0: 0, w: 2, h: 1 }, [tileRgbaLookup(tiles, lines)], keys);
    expect(drawnPixels(rgba)).toBe(64);
  });

  it('two keys draw the same index from two different tilesets', () => {
    const lines = rgbaLines(new Uint8Array(96).fill(0x0e), 1, null);
    const a = tileRgbaLookup([{ pixels: new Uint8Array(64) }, { pixels: new Uint8Array(64).fill(1) }], lines);
    const b = tileRgbaLookup([{ pixels: new Uint8Array(64) }, { pixels: new Uint8Array(64).fill(0).map((_, i) => (i < 8 ? 1 : 0)) }], lines);
    const words = new Uint16Array([1 | (1 << 13), 1 | (1 << 13)]);
    const rgba = composeWindow(words, 2, { c0: 0, r0: 0, w: 2, h: 1 }, [a, b], new Int8Array([0, 1]));
    // Tile 1 of set a is fully opaque (64 px); tile 1 of set b is one row (8 px).
    expect(drawnPixels(rgba)).toBe(72);
  });
});
