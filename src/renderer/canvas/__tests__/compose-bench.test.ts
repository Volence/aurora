/**
 * Opt-in measurement harness for the section-composition change. Skipped by
 * default (it asserts nothing — it prints). To run it:
 *
 *   AURORA_BENCH=1 npx vitest run src/renderer/canvas/__tests__/compose-bench.test.ts \
 *     --reporter=verbose --disable-console-intercept
 *
 * WHAT IT CAN AND CANNOT SHOW. The renderer suite is node-only, so there is no
 * real canvas here: the numbers below are the JS-side cost plus an exact COUNT
 * of the canvas operations each path issues. The operation count is the whole
 * point — on the app's GPU-backed canvas a putImageData measured ~50us, so the
 * old path's ~102k uploads are seconds of stall while the new path's 9 are not.
 * The true wall-clock win can only be confirmed with a DevTools profile in the
 * real app.
 */
import { describe, it } from 'vitest';
import { composeNametable, type TilePixelLookup } from '../compose-nametable';
import { TileRenderer } from '../TileRenderer';
import {
  packNametableWord, unpackNametableWord,
  SECTION_TILES_WIDE, SECTION_PIXEL_SIZE, createSectionTileGrid,
  type Tile, type PaletteLine,
} from '../../../core/model/s4-types';

// Throwaway measurement harness (not a CI assertion — it prints and passes).
const TILE_COUNT = 919;
const PAL_LINES = 4;
const SECTIONS = 9;
const OCCUPANCY = 0.173;

function makeTiles(n: number): Tile[] {
  return Array.from({ length: n }, (_, t) => ({
    pixels: new Uint8Array(Array.from({ length: 64 }, (_, i) => (t * 7 + i * 3) % 16)),
  }));
}
function makePalettes(): PaletteLine[] {
  return Array.from({ length: PAL_LINES }, (_, p) => ({
    colors: Array.from({ length: 16 }, (_, i) => ({
      r: (p * 60 + i * 15) % 256, g: (i * 17) % 256, b: (p * 33 + i * 9) % 256,
      a: i === 0 ? 0 : 255,
    })),
  }));
}
function makeNametable(seed: number): Uint16Array {
  const nt = createSectionTileGrid().nametable;
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
  for (let i = 0; i < nt.length; i++) {
    if (rand() >= OCCUPANCY) continue;
    nt[i] = packNametableWord(
      Math.floor(rand() * TILE_COUNT), Math.floor(rand() * PAL_LINES),
      rand() < 0.1, rand() < 0.25, rand() < 0.25,
    );
  }
  return nt;
}

class CountingCtx {
  puts = 0; clears = 0; draws = 0;
  putImageData(): void { this.puts++; }
  clearRect(): void { this.clears++; }
  drawImage(): void { this.draws++; }
  save(): void {} restore(): void {} translate(): void {} scale(): void {}
}

describe('bench', () => {
  it('composition throughput', {
    skip: !process.env.AURORA_BENCH,
    meta: {
      skipReason: 'AURORA_BENCH is not set — this row is an opt-in measurement harness that '
        + 'PRINTS rather than asserts, so it is off by default; see the file header to run it',
    },
  }, () => {
    const tiles = makeTiles(TILE_COUNT);
    const palettes = makePalettes();
    const nametables = Array.from({ length: SECTIONS }, (_, i) => makeNametable(0x1000 + i));

    const t0 = performance.now();
    const tr = new TileRenderer();
    tr.prerender(tiles, palettes);
    const tPrerender = performance.now() - t0;

    const memo = new Map<number, Uint8ClampedArray | null>();
    const lookup: TilePixelLookup = (ti, p) => {
      const k = (ti << 2) | p;
      const hit = memo.get(k);
      if (hit !== undefined) return hit;
      const v = tr.get(ti, p)?.data ?? null;
      memo.set(k, v);
      return v;
    };

    // --- count what the OLD path would issue -------------------------------
    let nonZero = 0;
    for (const nt of nametables) for (let i = 0; i < nt.length; i++) if (nt[i] !== 0) nonZero++;

    // --- NEW: compose + one putImageData per section ------------------------
    const scratch = new Uint8ClampedArray(SECTION_PIXEL_SIZE * SECTION_PIXEL_SIZE * 4);
    const newCtx = new CountingCtx();
    // warm up
    composeNametable(scratch, SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE, nametables[0], SECTION_TILES_WIDE, lookup);
    const t1 = performance.now();
    for (const nt of nametables) {
      composeNametable(scratch, SECTION_PIXEL_SIZE, SECTION_PIXEL_SIZE, nt, SECTION_TILES_WIDE, lookup);
      newCtx.putImageData();
    }
    const tNew = performance.now() - t1;

    // --- OLD: the per-cell loop, verbatim, against a no-op ctx --------------
    // This is the JS-only floor of the old path: the real cost in Chromium is
    // this PLUS a ~50us GPU round-trip for every putImageData.
    const oldCtx = new CountingCtx();
    const t2 = performance.now();
    for (const nt of nametables) {
      for (let i = 0; i < nt.length; i++) {
        const word = nt[i];
        if (word === 0) { oldCtx.clearRect(); continue; }
        const e = unpackNametableWord(word);
        const img = tr.get(e.tileIndex, e.palette);
        if (!img) { oldCtx.clearRect(); continue; }
        if (!e.hFlip && !e.vFlip) { oldCtx.putImageData(); }
        else {
          oldCtx.clearRect(); oldCtx.putImageData();
          oldCtx.save(); oldCtx.translate(); oldCtx.scale(); oldCtx.drawImage(); oldCtx.restore();
        }
      }
    }
    const tOld = performance.now() - t2;

    const GPU_PUT_US = 50;
    const lines = [
      '',
      '=== SectionRenderer composition benchmark (node, no real canvas) ===',
      `tiles=${TILE_COUNT} palettes=${PAL_LINES} sections=${SECTIONS} cells/section=${SECTION_TILES_WIDE * SECTION_TILES_WIDE}`,
      `non-zero cells across ${SECTIONS} sections: ${nonZero} (${(nonZero / (SECTIONS * 65536) * 100).toFixed(1)}%)`,
      `prepareTiles (${TILE_COUNT}x${PAL_LINES} prerender): ${tPrerender.toFixed(1)} ms`,
      '',
      `OLD per-cell path, JS only (no-op ctx):   ${tOld.toFixed(1)} ms`,
      `  canvas ops issued: putImageData=${oldCtx.puts}  clearRect=${oldCtx.clears}  drawImage=${oldCtx.draws}`,
      `  projected GPU cost of those putImageData @ ${GPU_PUT_US}us: ${(oldCtx.puts * GPU_PUT_US / 1000).toFixed(0)} ms`,
      '',
      `NEW compose path, JS only:                ${tNew.toFixed(1)} ms  (${(tNew / SECTIONS).toFixed(1)} ms/section)`,
      `  canvas ops issued: putImageData=${newCtx.puts}  clearRect=${newCtx.clears}  drawImage=${newCtx.draws}`,
      `  projected GPU cost of those putImageData @ ${GPU_PUT_US}us: ${(newCtx.puts * GPU_PUT_US / 1000).toFixed(2)} ms`,
      '',
      `canvas-op reduction: ${(oldCtx.puts + oldCtx.clears + oldCtx.draws)} -> ${newCtx.puts}`,
      '====================================================================',
      '',
    ];
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  });
});
