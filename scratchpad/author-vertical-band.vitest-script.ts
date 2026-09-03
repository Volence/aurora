// ONE-OFF AUTHORING STEP for the on-screen vertical-band proof. NOT A TEST, and
// deliberately NOT named `*.test.ts`: it is a vitest file only because vitest is the
// TypeScript runner this repo has, and vitest's `include` does not reach scratchpad/.
// A file that LOOKS like a test and is never collected is a silent zero inside a green
// total — `check-test-collection` exists because that happened.
//
// Run it explicitly with a config whose `include` names this file:
//   BG_OVERRIDE_PATH=<copy>/games/sonic4/data/editor_bg_override.json \
//     npx vitest run --config <that config>
//
// WHY IT GOES THROUGH AURORA'S CODEC INSTEAD OF WRITING JSON BY HAND: the seam under
// test is Aurora's export -> aeon's generator -> the engine. Hand-writing the JSON walks
// around the exact join the proof exists to exercise and would still produce a
// green-looking ROM. Same reasoning as the drift proof (2026-09-02).
//
// WHAT IT MUST NOT DO: satisfy aeon's guard by construction. The guard refuses a vertical
// band whose phases are exact HORIZONTAL translations of phase 0. This script therefore
// asserts BOTH directions — the phases ARE vertical rolls and are NOT horizontal ones —
// because a band that is uniform along one axis is a vertical roll AND a horizontal roll
// at once, which aeon admits as ambiguous and which would prove nothing about direction.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import {
  parseBgOverride, serializeBgOverride, bandPatternPx, bandCellSlot, TILE_WIDTH_PX,
} from '../src/core/formats/bg-override/bg-override';
import { shiftedPhaseBanks } from '../src/core/formats/bg-override/bg-anim-band';

const PATH = process.env.BG_OVERRIDE_PATH!;
const BAND = Number(process.env.BAND_INDEX ?? '0');

/** The band's pixel plane for one phase bank, however its slots are ordered. */
function plane(spec: { cols: number; rows: number; axis?: string }, bank: number[][]) {
  const W = spec.cols * TILE_WIDTH_PX, H = spec.rows * TILE_WIDTH_PX;
  const g: number[][] = Array.from({ length: H }, () => new Array<number>(W).fill(0));
  for (let c = 0; c < spec.cols; c++) {
    for (let r = 0; r < spec.rows; r++) {
      const t = bank[bandCellSlot(spec as never, c, r)];
      for (let y = 0; y < TILE_WIDTH_PX; y++) {
        for (let x = 0; x < TILE_WIDTH_PX; x++) {
          g[r * TILE_WIDTH_PX + y][c * TILE_WIDTH_PX + x] = t[y * TILE_WIDTH_PX + x];
        }
      }
    }
  }
  return g;
}

describe('author a VERTICAL band through Aurora export', () => {
  it('flips one band to vertical and regenerates its phases along that axis', () => {
    const parsed = parseBgOverride(readFileSync(PATH, 'utf8'));
    const doc = parsed.doc;
    const bands = doc.anims!;
    const band = bands[BAND];
    const spec = { cols: band.cols, rows: band.rows, axis: 'vertical' };

    // Derived from the codec, never typed in: pattern_px IS the period along the axis.
    const patternPx = bandPatternPx(spec as never);
    expect(patternPx).toBe(band.rows * TILE_WIDTH_PX);

    const phase0 = band.phases[0];
    const banks = shiftedPhaseBanks(spec as never, phase0);

    // ANTI-VACUOUS: phase 0 must not be uniform along either axis, or every roll is a
    // no-op and both assertions below pass on a band that cannot demonstrate direction.
    const p0 = plane(spec, phase0);
    const H = band.rows * TILE_WIDTH_PX, W = band.cols * TILE_WIDTH_PX;
    const rowsAllEqual = p0.every((row) => row.every((v) => v === row[0]));
    const colsAllEqual = Array.from({ length: W }, (_, x) =>
      p0.every((row) => row[x] === p0[0][x])).every(Boolean);
    expect(rowsAllEqual, 'phase 0 is uniform along x — a vertical roll would be invisible').toBe(false);
    expect(colsAllEqual, 'phase 0 is uniform along y — a vertical roll would be a no-op').toBe(false);

    // The property, both directions. k=1 is enough to establish direction and is the
    // bank aeon's guard reads first.
    const base = plane(spec, banks[0]);
    const k1 = plane(spec, banks[1]);
    const shift = patternPx / 8 >= 1 ? 1 : 1; // PHASE_SHIFT_SRC_PX is 1px per bank
    const vRoll = Array.from({ length: H }, (_, y) => base[(y + shift) % H].slice());
    const hRoll = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) => base[y][(x + shift) % W]));
    expect(k1, 'bank 1 must be phase 0 rolled along Y').toEqual(vRoll);
    expect(k1, 'bank 1 must NOT be a horizontal roll — that is the shimmer aeon refuses')
      .not.toEqual(hRoll);

    band.axis = 'vertical';
    band.pattern_px = patternPx;
    band.phases = banks;
    writeFileSync(PATH, serializeBgOverride(doc));

    // Read back through the codec: the axis must survive the round trip.
    const back = parseBgOverride(readFileSync(PATH, 'utf8')).doc.anims![BAND];
    expect(back.axis).toBe('vertical');
    expect(back.pattern_px).toBe(patternPx);
    // eslint-disable-next-line no-console
    console.log(`AUTHORED band ${BAND}: axis=vertical cols=${band.cols} rows=${band.rows} ` +
      `pattern_px=${patternPx} (expect step_mask ${patternPx - 1})`);
  });
});
