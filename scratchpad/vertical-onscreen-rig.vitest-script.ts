// ONE-OFF AUTHORING STEP for the VERTICAL BAND ON SCREEN rig. NOT A TEST, and
// deliberately NOT named `*.test.ts`: it is a vitest file only because vitest is the
// TypeScript runner this repo has, and vitest's `include` does not reach scratchpad/.
// A file that LOOKS like a test and is never collected is a silent zero inside a green
// total — `check-test-collection` exists because that happened.
//
//   BG_OVERRIDE_PATH=<aeon copy>/games/sonic4/data/editor_bg_override.json \
//   EXPECT_OUT=<dir>/expectations.json \
//     npx vitest run --config scratchpad/vertical-onscreen-rig.vitest.config.ts
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, AND WHAT IT ADDS TO 2026-09-03's PROOF
// ─────────────────────────────────────────────────────────────────────────────
// aeon's witness (f0aebbd3) established that the bytes at a band's VRAM slots are, at
// every step, phase 0 rolled toward DECREASING row index IN A ROW-MAJOR DECODE OF THE
// BAND'S OWN SLOTS. It aimed at the band reserve, which NO PLANE CELL REFERENCES — so
// "a viewer sees it move up" was never established, and aeon's own file says so.
// aurora's 2026-09-03 proof flipped the act's own band 0 vertical and watched its VRAM
// step, but band 0's 32 slots are a scattered ATLAS — 1,220 layout cells draw them in
// no particular order, slot 3 alone in 940 of them — so nothing about screen ROW ORDER
// followed from it either.
//
// THE MISSING LINK IS THE LAYOUT. This script authors a band whose slots are placed on
// the plane so that band cell (c, r) is drawn at plane cell (stripe + c, row) for every
// row ≡ r (mod rows) — a KNOWN, MONOTONE slot→screen-row relation. That is the one
// thing neither earlier run had, and it is an authoring change, which is why it belongs
// in Aurora rather than in a probe.
//
// WHY A SECOND BAND RATHER THAN FLIPPING BAND 0. Band 0 stays exactly as it is —
// `default_off`, horizontal, static in every ROM shape — and its 1,220 cells become the
// ON-SCREEN CONTROL: art drawn from the same blob, beside the moving band, that must not
// change. A control that is only off-screen VRAM cannot separate "this band stepped"
// from "the BG art was reloaded"; this one can, and it is visible in the same frame.
//
// WHY THE BAND'S PHASE 0 IS BAND 0's ART. Two reasons, both load-bearing. (1) It is
// PROVEN NON-VACUOUS under the vertical decode — all 32 pixel rows and all 64 pixel
// columns pairwise distinct — which is what makes every step except 0 and 16
// direction-discriminating (see the expectation table). (2) It makes the static control
// slots and the moving band slots hold IDENTICAL BYTES AT STEP 0 and diverge after, so
// the control is self-checking rather than merely "some other address".
//
// WHAT IT MUST NOT DO: satisfy aeon's `validate_band_phase_axis` by construction. That
// guard refuses a vertical band whose phases are exact HORIZONTAL translations of phase
// 0. Art uniform along one axis is a vertical roll AND a horizontal roll at once, which
// aeon admits as ambiguous and which would prove nothing about direction. Every bank is
// therefore asserted to BE a Y-roll and NOT to be an X-roll.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import {
  parseBgOverride, serializeBgOverride, validateBgOverride, bgOverrideSectionIssues,
  bandPatternPx, bandRotationUnitBytes, bandCellSlot, bandTileCount, cloneBgOverride,
  TILE_WIDTH_PX, TILE_BYTES, TILE_PIXELS, LAYOUT_TILE_INDEX_MASK, BG_LAYOUT_WORDS,
  BG_TILE_CAPACITY, BGANIM_PHASE_BANKS,
  type BgOverrideBand, type BgOverrideDocument,
} from '../src/core/formats/bg-override/bg-override';
import {
  createBand, planBandInsertion, insertBand, shiftedPhaseBanks, bandSlotBases, documentBands,
} from '../src/core/formats/bg-override/bg-anim-band';

const PATH = process.env.BG_OVERRIDE_PATH!;
const EXPECT_OUT = process.env.EXPECT_OUT!;

/** The plane's cell grid, from the contract rather than typed in. */
const PLANE_COLS = 64;
const PLANE_ROWS = BG_LAYOUT_WORDS / PLANE_COLS;

/**
 * The nametable attribute bits every painted cell carries: palette line 2, NO
 * FLIPS. The flips matter and are not cosmetic — a vflip bit would reverse the
 * pixel row order INSIDE the tile and invert the very thing being measured. Pal
 * line 2 is the modal choice across the document's own 4,096 cells (1,712 of
 * them) so the painted stripes render in the same palette as their neighbours.
 */
const PAINT_ATTRS = 0x4000;

/** Which plane columns get painted: alternating 8-wide stripes, band on the even ones. */
const isBandStripe = (col: number) => ((col >> 3) & 1) === 0;

/** The band's own pixel plane for one phase bank, decoded through the codec's slot order. */
function plane(spec: { cols: number; rows: number; axis?: string }, bank: number[][]) {
  const W = spec.cols * TILE_WIDTH_PX;
  const H = spec.rows * TILE_WIDTH_PX;
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

/** One 8x8 tile of 4bpp bytes, exactly as `inject_editor_bg.py` packs it. */
function packTile(px: readonly number[]): string {
  let out = '';
  for (let row = 0; row < TILE_WIDTH_PX; row++) {
    for (let col = 0; col < TILE_WIDTH_PX / 2; col++) {
      const hi = px[row * TILE_WIDTH_PX + col * 2] & 0xF;
      const lo = px[row * TILE_WIDTH_PX + col * 2 + 1] & 0xF;
      out += ((hi << 4) | lo).toString(16).padStart(2, '0');
    }
  }
  return out;
}

describe('author a VERTICAL band that plane cells actually draw', () => {
  it('inserts it, paints it onto the plane in a known order, and writes the expectations', () => {
    const parsed = parseBgOverride(readFileSync(PATH, 'utf8'));
    const doc0: BgOverrideDocument = parsed.doc;
    const before = documentBands(doc0);

    // ── The band ─────────────────────────────────────────────────────────────
    // Geometry is band 0's, so the vertical rotation unit (cols*32 = 256) is a power of
    // two and the period along Y (rows*8 = 32) gives four coarse positions over the
    // 1,024-byte slot run. 1xN and Nx1 were rejected by aeon for the same reason they
    // would be here: a single rotation unit makes the coarse rotate 0 at every step.
    const cols = before[0].cols;
    const rows = before[0].rows;
    const spec = { cols, rows, axis: 'vertical' as const };
    const patternPx = bandPatternPx(spec as never);
    expect(patternPx, 'pattern_px is the period along Y on a vertical band').toBe(rows * TILE_WIDTH_PX);
    expect(bandRotationUnitBytes(spec as never), 'the vertical rotation unit is one tile ROW')
      .toBe(cols * TILE_BYTES);

    const phase0 = cloneBgOverride(before[0].phases[0]) as number[][];
    expect(phase0.length).toBe(bandTileCount(spec as never));

    // ── ANTI-VACUOUS, and stronger than "not uniform" ────────────────────────
    // aeon's own generator refuses art whose H pixel rows are not all DISTINCT, because
    // a repeated row makes some vertical roll a no-op and a frozen band would then pass
    // the vertical predicate. Assert the same thing here, on both axes.
    const p0 = plane(spec, phase0);
    const H = rows * TILE_WIDTH_PX;
    const W = cols * TILE_WIDTH_PX;
    const rowKeys = p0.map((r) => r.join(','));
    const colKeys = Array.from({ length: W }, (_, x) => p0.map((r) => r[x]).join(','));
    expect(new Set(rowKeys).size, 'phase 0 must have all H pixel rows DISTINCT, or some ' +
      'vertical roll is a no-op and a frozen band passes the up-predicate').toBe(H);
    expect(new Set(colKeys).size, 'phase 0 must have all W pixel columns DISTINCT, or the ' +
      'horizontal alternative is not a real alternative').toBe(W);

    // ── The banks, and the property in BOTH directions, for EVERY bank ───────
    const banks = shiftedPhaseBanks(spec as never, phase0);
    expect(banks.length).toBe(BGANIM_PHASE_BANKS);
    const base = plane(spec, banks[0]);
    expect(base, 'bank 0 IS phase 0').toEqual(p0);
    for (let k = 1; k < BGANIM_PHASE_BANKS; k++) {
      const got = plane(spec, banks[k]);
      const yRoll = Array.from({ length: H }, (_, y) => base[(y + k) % H].slice());
      const xRoll = Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) => base[y][(x + k) % W]));
      expect(got, `bank ${k} must be phase 0 rolled UP by ${k}px along Y`).toEqual(yRoll);
      expect(got, `bank ${k} must NOT be an X-roll — that is the shimmer aeon refuses`)
        .not.toEqual(xRoll);
    }

    const band: BgOverrideBand = createBand({
      cols, rows, axis: 'vertical', driver: 'timer', rate_shift: 2, phases: banks,
    });
    // `timer` and NOT a camera driver on purpose: the measurement must advance with no
    // controller input at all, so the run recipe has no "walk right" step that could
    // silently not happen.
    expect(band.driver).toBe('timer');
    expect(band.axis).toBe('vertical');
    expect(band.pattern_px).toBe(patternPx);

    // ── Insert it after band 0, through the codec's own planner ──────────────
    const plan = planBandInsertion(doc0, band);
    expect(plan.bandIndex).toBe(1);
    expect(plan.slotBase, 'band 0 owns slots 0..' + (bandTileCount(before[0]) - 1))
      .toBe(bandTileCount(before[0]));
    expect(plan.staticBase, 'an INSERTION creates slots; it does not move them').toBe(null);
    expect(plan.referencingCells, 'inserted art arrives unreferenced — that is the defect ' +
      'this parcel exists to repair').toBe(0);

    const doc1 = insertBand(doc0, plan, band);
    const slotBase = bandSlotBases(documentBands(doc1))[1];
    expect(slotBase).toBe(plan.slotBase);
    expect(doc1.tiles!.length).toBe(doc0.tiles!.length + bandTileCount(spec as never));
    expect(doc1.tiles!.length).toBeLessThanOrEqual(BG_TILE_CAPACITY);
    // The prefix identity the consumer's coherence check asserts.
    for (let j = 0; j < bandTileCount(spec as never); j++) {
      expect(doc1.tiles![slotBase + j], `tiles[${slotBase + j}] IS phases[0][${j}]`)
        .toEqual(banks[0][j]);
    }
    // Band 0 is untouched, and is still the thing that will not move.
    expect(documentBands(doc1)[0].default_off).toBe(true);
    expect(documentBands(doc1)[0].axis).toBeUndefined();

    // ── Paint the plane: THE LINK NEITHER EARLIER RUN HAD ────────────────────
    // Band cell (c, r) is drawn at plane cell (stripe + c, row) for every row ≡ r (mod
    // rows). Alternating 8-wide stripes so that EVERY 320px-wide screen window at EVERY
    // vertical scroll shows both the moving band and untouched control art — the rig
    // must not depend on where the camera happens to be at boot.
    const layout = doc1.layout!.slice();
    const painted: number[] = [];
    for (let row = 0; row < PLANE_ROWS; row++) {
      for (let col = 0; col < PLANE_COLS; col++) {
        if (!isBandStripe(col)) continue;
        const local = bandCellSlot(spec as never, col % cols, row % rows);
        expect(local, 'ROW-major on a vertical band — aeon EFFECTS_CONSUMER_CONTRACT §1.2')
          .toBe((row % rows) * cols + (col % cols));
        const word = PAINT_ATTRS | (slotBase + local);
        expect(word & LAYOUT_TILE_INDEX_MASK).toBe(slotBase + local);
        expect(word, 'a painted word must never be 0 — the consumer reads 0 as BLANK, ' +
          'not as tile 0').not.toBe(0);
        expect(word & 0x1800, 'no hflip and no vflip: a vflip would reverse the pixel ' +
          'row order inside the tile and invert the quantity being measured').toBe(0);
        const i = row * PLANE_COLS + col;
        layout[i] = word;
        painted.push(i);
      }
    }
    const doc2: BgOverrideDocument = { ...doc1, layout };
    expect(painted.length).toBe(PLANE_ROWS * PLANE_COLS / 2);

    // Every band-1 slot is drawn, and NOTHING outside the stripes draws one.
    const drawn = new Set<number>();
    for (let i = 0; i < layout.length; i++) {
      const w = layout[i];
      if (w === 0) continue;
      const idx = w & LAYOUT_TILE_INDEX_MASK;
      const inStripe = isBandStripe(i % PLANE_COLS);
      if (idx >= slotBase && idx < slotBase + bandTileCount(spec as never)) {
        drawn.add(idx);
        expect(inStripe, `layout[${i}] draws band-1 slot ${idx} outside a painted stripe`)
          .toBe(true);
      } else {
        expect(inStripe, `layout[${i}] is in a painted stripe but draws ${idx}`).toBe(false);
      }
    }
    expect(drawn.size, 'every one of the band\'s slots is on the plane').toBe(bandTileCount(spec as never));

    // The ON-SCREEN control still exists: band-0 slots and static slots, in the
    // unpainted stripes, drawn by cells this parcel did not touch.
    const controlCells = layout.filter((w, i) => w !== 0 && !isBandStripe(i % PLANE_COLS));
    expect(controlCells.length).toBe(PLANE_ROWS * PLANE_COLS / 2);
    const controlStatic = controlCells.filter((w) => (w & LAYOUT_TILE_INDEX_MASK) >= slotBase + 32);
    expect(controlStatic.length, 'static (non-band) art is still drawn on screen').toBeGreaterThan(0);

    // ── The codec's own verdict, then the round trip ─────────────────────────
    expect(validateBgOverride(doc2)).toEqual([]);
    expect(bgOverrideSectionIssues(doc2)).toEqual([]);
    const text = serializeBgOverride(doc2);
    writeFileSync(PATH, text);
    const back = parseBgOverride(readFileSync(PATH, 'utf8')).doc;
    const b1 = documentBands(back)[1];
    expect(b1.axis).toBe('vertical');
    expect(b1.driver).toBe('timer');
    expect(b1.rate_shift).toBe(2);
    expect(b1.pattern_px).toBe(patternPx);
    expect(back.tiles!.length).toBe(doc1.tiles!.length);
    expect(back.layout).toEqual(layout);

    // ── THE EXPECTATION TABLE ────────────────────────────────────────────────
    // For every step s in 0..pattern_px-1 and every band slot j, the 32 bytes the
    // runtime should have left at that slot's VRAM address:
    //
    //   UP   — the composite this app and this engine claim: band-plane pixel row Y
    //          shows phase 0's row (Y + s) mod H, i.e. content travels toward
    //          DECREASING Y. Slot j = (r, c) therefore holds rows r*8+py for py 0..7.
    //   DOWN — the mirror, (Y - s) mod H. This is what VRAM would hold if the engine's
    //          coarse rotation carried the opposite sign from the fine phase roll.
    //
    // They coincide exactly when 2s ≡ 0 (mod H) — s ∈ {0, H/2} — AND ONLY BECAUSE all H
    // rows of phase 0 are distinct, which is asserted above. Every other step separates
    // them, and the table says so per step rather than leaving it to be re-derived.
    const upAt = (s: number, j: number) => {
      const c = j % cols, r = (j - (j % cols)) / cols;
      const px = new Array<number>(TILE_PIXELS);
      for (let py = 0; py < TILE_WIDTH_PX; py++)
        for (let x = 0; x < TILE_WIDTH_PX; x++)
          px[py * TILE_WIDTH_PX + x] = p0[(r * TILE_WIDTH_PX + py + s) % H][c * TILE_WIDTH_PX + x];
      return px;
    };
    const downAt = (s: number, j: number) => {
      const c = j % cols, r = (j - (j % cols)) / cols;
      const px = new Array<number>(TILE_PIXELS);
      for (let py = 0; py < TILE_WIDTH_PX; py++)
        for (let x = 0; x < TILE_WIDTH_PX; x++)
          px[py * TILE_WIDTH_PX + x] = p0[((r * TILE_WIDTH_PX + py - s) % H + H) % H][c * TILE_WIDTH_PX + x];
      return px;
    };
    // Cross-check the UP model against the ARTEFACT rather than against itself: at a
    // step whose fine part is f and coarse part 0, the composite must be exactly bank f.
    for (let f = 0; f < BGANIM_PHASE_BANKS; f++)
      for (let j = 0; j < bandTileCount(spec as never); j++)
        expect(upAt(f, j), `UP model at step ${f} slot ${j} must equal bank ${f} verbatim`)
          .toEqual(banks[f][j]);

    const n = bandTileCount(spec as never);
    const steps = Array.from({ length: patternPx }, (_, s) => {
      const up = Array.from({ length: n }, (_, j) => packTile(upAt(s, j)));
      const down = Array.from({ length: n }, (_, j) => packTile(downAt(s, j)));
      const differing = up.map((v, j) => (v === down[j] ? -1 : j)).filter((j) => j >= 0);
      return {
        step: s, coarse: s >> 3, bank: s & 7,
        discriminating: differing.length > 0,
        slotsThatDiffer: differing,
        up, down,
      };
    });
    const discriminating = steps.filter((s) => s.discriminating).map((s) => s.step);
    expect(discriminating, 'exactly the steps with 2s !== 0 (mod H) separate UP from DOWN')
      .toEqual(Array.from({ length: patternPx }, (_, s) => s).filter((s) => (2 * s) % H !== 0));
    expect(steps[0].discriminating).toBe(false);
    expect(steps[H / 2].discriminating).toBe(false);

    writeFileSync(EXPECT_OUT, JSON.stringify({
      band: {
        index: 1, cols, rows, axis: 'vertical', driver: 'timer', rate_shift: 2,
        pattern_px: patternPx, slot_base: slotBase, tile_count: n,
        total_bytes: n * TILE_BYTES, unit_bytes: cols * TILE_BYTES,
        step_mask: patternPx - 1, coarse_positions: (n * TILE_BYTES) / (cols * TILE_BYTES),
      },
      slotOrder: {
        rule: 'vertical band: local slot = row * cols + col (ROW-major)',
        cite: 'aeon tools/EFFECTS_CONSUMER_CONTRACT.md §1.2 obligation 1; aurora bandCellSlot',
        cells: Array.from({ length: n }, (_, j) => ({
          localSlot: j, blobIndex: slotBase + j,
          bandCol: j % cols, bandRow: (j - (j % cols)) / cols,
        })),
      },
      paint: {
        rule: 'layout[row*64 + col] = 0x4000 | (slotBase + (row % rows)*cols + (col % cols)) ' +
          'for every col with ((col>>3)&1)===0; other columns untouched',
        attrs: PAINT_ATTRS, paintedCells: painted.length,
        bandStripeColumns: Array.from({ length: PLANE_COLS }, (_, c) => c).filter(isBandStripe),
      },
      phase0RowsHex: p0.map((r) => r.map((v) => v.toString(16)).join('')),
      steps,
    }, null, 1));

    // eslint-disable-next-line no-console
    console.log(
      `AUTHORED band 1: 8 phase banks, ${cols}x${rows} vertical, driver timer, rate_shift 2\n` +
      `  slot_base ${slotBase} (blob) -> VRAM slot 1024+${slotBase}; ${n} slots; ` +
      `pattern_px ${patternPx}; expect step_mask ${patternPx - 1}, unit ${cols * TILE_BYTES} B\n` +
      `  tiles ${doc0.tiles!.length} -> ${back.tiles!.length} (cap ${BG_TILE_CAPACITY}); ` +
      `painted ${painted.length} of ${BG_LAYOUT_WORDS} cells\n` +
      `  discriminating steps (UP != DOWN): ${discriminating.length} of ${patternPx} — ` +
      `all but ${steps.filter((s) => !s.discriminating).map((s) => s.step).join(' and ')}`);
  });
});
