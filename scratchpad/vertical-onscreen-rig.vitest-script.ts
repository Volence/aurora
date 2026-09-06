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
// row ≡ r (mod rows) — a KNOWN, MONOTONE slot→plane-row relation. That is the one thing
// neither earlier run had, and it is an authoring change, which is why it belongs in
// Aurora rather than in a probe. aeon's `BG_Init` blits the layout to Plane B with plane
// row == layout row (autoinc $80 down each column from $E000 + col*2), so a monotone
// slot→plane-row relation IS a monotone slot→screen-row relation.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY 8x8 AND WHY EXACTLY ONE BAND — a constraint discovered by building, not chosen
// ─────────────────────────────────────────────────────────────────────────────
// `games/sonic4/test/ojz_scroll_test.emp` imports `BgAnim_View_H/_V/_T` UNCONDITIONALLY,
// and `tools/inject_editor_bg.py`'s `view_emission` emits those three names for exactly
// one act shape: a SINGLE band, marked `default_off`, whose `pattern_px` is 64. Every
// other shape fails to LINK — measured, with a one-key control: delete `default_off`
// from the shipped document, change nothing else, and a green FAST build becomes three
// `has no pub name` errors in the PLAIN shape. So this rig cannot ship a live second
// band, and the geometry is forced: vertical `pattern_px` is `rows*8`, so `rows = 8`,
// and the rotation unit `cols*32` must be a power of two, so `cols = 8`.
//
// The band therefore rides the DEBUG view twins, which is the same route aurora's
// 2026-09-03 proof took. All three twins point at the SAME slots and the SAME bank blob
// and differ only in which scalar drives the step; `driver: "timer"` is authored so the
// H twin (the authored band verbatim) is tick-driven too, and the measurement needs no
// controller input beyond selecting a row.
//
// BAND 0 IS DEMOTED, NOT REMOVED. `planBandDemotion`/`demoteBand` is image-preserving:
// its 32 slots become static art, so all 1,220 cells that drew it go on drawing exactly
// the same picture — and become the ON-SCREEN CONTROL, beside the moving band, in the
// unpainted stripes. A control that is only off-screen VRAM cannot separate "this band
// stepped" from "the BG art was reloaded"; this one can.
//
// WHAT IT MUST NOT DO: satisfy aeon's `validate_band_phase_axis` by construction. That
// guard refuses a vertical band whose phases are exact HORIZONTAL translations of phase
// 0. Art uniform along one axis is a vertical roll AND a horizontal roll at once, which
// aeon admits as ambiguous and which would prove nothing about direction. Every bank is
// therefore asserted to BE a Y-roll and NOT to be an X-roll — and, more sharply, phase 0
// is required to have all 64 pixel ROWS pairwise distinct, which is what makes every
// step but two separate UP from DOWN.
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import {
  parseBgOverride, serializeBgOverride, validateBgOverride, bgOverrideSectionIssues,
  bandPatternPx, bandRotationUnitBytes, bandCellSlot, bandTileCount, cloneBgOverride,
  TILE_WIDTH_PX, TILE_BYTES, TILE_PIXELS, LAYOUT_TILE_INDEX_MASK, BG_LAYOUT_WORDS,
  BG_TILE_CAPACITY, BGANIM_PHASE_BANKS, BGANIM_VIEW_DERIVED_PERIOD_PX,
  type BgOverrideBand, type BgOverrideDocument,
} from '../src/core/formats/bg-override/bg-override';
import {
  createBand, planBandInsertion, insertBand, planBandDemotion, demoteBand,
  shiftedPhaseBanks, bandSlotBases, documentBands,
} from '../src/core/formats/bg-override/bg-anim-band';

const PATH = process.env.BG_OVERRIDE_PATH!;
const EXPECT_OUT = process.env.EXPECT_OUT!;

/** The plane's cell grid. 64 columns is aeon's `PLANE_H_CELLS`; the rows follow. */
const PLANE_COLS = 64;
const PLANE_ROWS = BG_LAYOUT_WORDS / PLANE_COLS;

/** `BG_TILE_BASE_SLOT` — aeon games/sonic4/vram.toml `bg_region.base`, via vram_map.py. */
const BG_TILE_BASE_SLOT = 1024;

/**
 * The nametable attribute bits every painted cell carries: palette line 2, NO FLIPS.
 * The flips are not cosmetic here — a vflip bit reverses the pixel row order INSIDE the
 * tile and would invert the very quantity being measured. Palette line 2 is the modal
 * choice across the document's own 4,096 cells (1,712 of them), so the painted stripes
 * render in the same palette as their neighbours.
 */
const PAINT_ATTRS = 0x4000;

/** Which plane columns get painted: alternating 8-wide stripes, band on the even ones. */
const isBandStripe = (col: number) => ((col >> 3) & 1) === 0;

/** A bank's own pixel plane, decoded through the codec's slot order for this axis. */
function plane(spec: { cols: number; rows: number; axis?: string }, bank: readonly number[][]) {
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

/** The inverse of `plane`: cut a pixel plane into the band's slots, in its slot order. */
function tilesFromPlane(spec: { cols: number; rows: number; axis?: string }, g: number[][]) {
  const out: number[][] = Array.from({ length: spec.cols * spec.rows },
    () => new Array<number>(TILE_PIXELS).fill(0));
  for (let c = 0; c < spec.cols; c++) {
    for (let r = 0; r < spec.rows; r++) {
      const t = out[bandCellSlot(spec as never, c, r)];
      for (let y = 0; y < TILE_WIDTH_PX; y++)
        for (let x = 0; x < TILE_WIDTH_PX; x++)
          t[y * TILE_WIDTH_PX + x] = g[r * TILE_WIDTH_PX + y][c * TILE_WIDTH_PX + x];
    }
  }
  return out;
}

/** One 8x8 tile of 4bpp bytes, packed exactly as `inject_editor_bg.py` packs it. */
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
  it('demotes, inserts, paints the plane in a known order, and writes the expectations', () => {
    const parsed = parseBgOverride(readFileSync(PATH, 'utf8'));
    const doc0: BgOverrideDocument = parsed.doc;
    const before = documentBands(doc0);
    expect(before.length, 'the shipped act carries exactly one band').toBe(1);
    expect(before[0].default_off, 'and it is default_off, which is why the act links').toBe(true);

    // ── The band's geometry, FORCED rather than chosen (see the header) ──────
    const cols = 8;
    const rows = BGANIM_VIEW_DERIVED_PERIOD_PX / TILE_WIDTH_PX;
    const spec = { cols, rows, axis: 'vertical' as const };
    const n = bandTileCount(spec as never);
    expect(bandPatternPx(spec as never), 'the twins are emitted only at this period')
      .toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
    const unitBytes = bandRotationUnitBytes(spec as never);
    expect(unitBytes, 'a vertical band rotates by one tile ROW').toBe(cols * TILE_BYTES);
    expect(unitBytes & (unitBytes - 1), 'the rotation unit must be a power of two — the ' +
      'runtime rotates by SHIFTING it').toBe(0);
    const H = rows * TILE_WIDTH_PX;
    const W = cols * TILE_WIDTH_PX;

    // ── Phase 0: real art from this act's own blob, composed to 64x64 ────────
    // Top half is band 0's own art; bottom half is the 32 static tiles that follow it.
    // Nothing is synthesised, and the distinctness the direction argument rests on is
    // ASSERTED below rather than assumed of whatever the blob happened to hold.
    const oldSpec = { cols: before[0].cols, rows: before[0].rows, axis: 'vertical' as const };
    const topPlane = plane(oldSpec, before[0].phases[0]);
    const botSrc = doc0.tiles!.slice(before[0].cols * before[0].rows,
      before[0].cols * before[0].rows + oldSpec.cols * oldSpec.rows);
    expect(botSrc.length).toBe(oldSpec.cols * oldSpec.rows);
    const botPlane = plane(oldSpec, botSrc);
    const p0 = [...topPlane.map((r) => r.slice()), ...botPlane.map((r) => r.slice())];
    expect(p0.length).toBe(H);
    expect(p0[0].length).toBe(W);

    // ── ANTI-VACUOUS, and stronger than "not uniform" ────────────────────────
    // aeon's own probe generator refuses art whose H pixel rows are not all DISTINCT,
    // because a repeated row makes some vertical roll a no-op and a FROZEN band would
    // then pass the up-predicate. Assert exactly that, and the same on the other axis so
    // the horizontal alternative is a real alternative.
    const rowKeys = p0.map((r) => r.join(','));
    const colKeys = Array.from({ length: W }, (_, x) => p0.map((r) => r[x]).join(','));
    expect(new Set(rowKeys).size, 'phase 0 must have all H pixel rows DISTINCT, or some ' +
      'vertical roll is a no-op and a frozen band passes the up-predicate').toBe(H);
    expect(new Set(colKeys).size, 'phase 0 must have all W pixel columns DISTINCT, or the ' +
      'horizontal alternative is not a real alternative').toBe(W);

    const phase0 = tilesFromPlane(spec, p0);
    expect(plane(spec, phase0), 'the cut and the decode are inverses').toEqual(p0);

    // ── The banks, and the property in BOTH directions, for EVERY bank ───────
    const banks = shiftedPhaseBanks(spec as never, phase0);
    expect(banks.length).toBe(BGANIM_PHASE_BANKS);
    expect(plane(spec, banks[0]), 'bank 0 IS phase 0').toEqual(p0);
    for (let k = 1; k < BGANIM_PHASE_BANKS; k++) {
      const got = plane(spec, banks[k]);
      const yRoll = Array.from({ length: H }, (_, y) => p0[(y + k) % H].slice());
      const xRoll = Array.from({ length: H }, (_, y) =>
        Array.from({ length: W }, (_, x) => p0[y][(x + k) % W]));
      expect(got, `bank ${k} must be phase 0 rolled UP by ${k}px along Y`).toEqual(yRoll);
      expect(got, `bank ${k} must NOT be an X-roll — that is the shimmer aeon refuses`)
        .not.toEqual(xRoll);
    }

    const band: BgOverrideBand = createBand({
      cols, rows, axis: 'vertical', driver: 'timer', rate_shift: 2, phases: banks,
    });
    band.default_off = true;   // the ONLY act shape aeon links; see the header block.
    expect(band.axis).toBe('vertical');
    expect(band.driver, 'so the H twin — the authored band verbatim — is tick-driven too, ' +
      'and no controller input is needed to make the band move').toBe('timer');
    expect(band.pattern_px).toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);

    // ── Demote the shipped band, then insert this one in its place ───────────
    const demotion = planBandDemotion(doc0, 0);
    expect(demotion.staticBase, 'the last band demotes in place — no tile moves')
      .toBe(0);
    const doc1 = demoteBand(doc0, demotion);
    expect(documentBands(doc1).length, 'the act is bandless between the two doors').toBe(0);
    expect(doc1.tiles!.length, 'demotion is image-preserving: nothing is created or lost')
      .toBe(doc0.tiles!.length);
    expect(doc1.layout, 'demoting the only band moves no tile, so no cell is renumbered')
      .toEqual(doc0.layout);

    const plan = planBandInsertion(doc1, band);
    expect(plan.bandIndex).toBe(0);
    expect(plan.slotBase).toBe(0);
    expect(plan.staticBase, 'an INSERTION creates slots; it does not move them').toBe(null);
    expect(plan.referencingCells, 'inserted art arrives unreferenced — that is the defect ' +
      'this parcel exists to repair').toBe(0);
    const doc2 = insertBand(doc1, plan, band);
    const slotBase = bandSlotBases(documentBands(doc2))[0];
    expect(slotBase).toBe(0);
    expect(doc2.tiles!.length).toBe(doc0.tiles!.length + n);
    expect(doc2.tiles!.length).toBeLessThanOrEqual(BG_TILE_CAPACITY);
    for (let j = 0; j < n; j++)
      expect(doc2.tiles![slotBase + j], `tiles[${slotBase + j}] IS phases[0][${j}]`)
        .toEqual(banks[0][j]);

    // ── Paint the plane: THE LINK NEITHER EARLIER RUN HAD ────────────────────
    // Band cell (c, r) is drawn at plane cell (stripe + c, row) for every row ≡ r (mod
    // rows). Alternating 8-wide stripes so that EVERY 320px-wide screen window at EVERY
    // vertical scroll shows both the moving band and untouched control art — the rig
    // must not depend on where the camera happens to be at boot.
    const layout = doc2.layout!.slice();
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
    const doc3: BgOverrideDocument = { ...doc2, layout };
    expect(painted.length).toBe(PLANE_ROWS * PLANE_COLS / 2);

    // Every band slot is drawn, and NOTHING outside the stripes draws one.
    const drawn = new Set<number>();
    for (let i = 0; i < layout.length; i++) {
      const w = layout[i];
      if (w === 0) continue;
      const idx = w & LAYOUT_TILE_INDEX_MASK;
      const inStripe = isBandStripe(i % PLANE_COLS);
      if (idx >= slotBase && idx < slotBase + n) {
        drawn.add(idx);
        expect(inStripe, `layout[${i}] draws band slot ${idx} outside a painted stripe`)
          .toBe(true);
      } else {
        expect(inStripe, `layout[${i}] is in a painted stripe but draws ${idx}`).toBe(false);
      }
    }
    expect(drawn.size, "every one of the band's slots is on the plane").toBe(n);

    // The ON-SCREEN control: 2,048 cells this parcel never touched, drawing static art.
    const controlCells: number[] = [];
    for (let i = 0; i < layout.length; i++)
      if (!isBandStripe(i % PLANE_COLS) && layout[i] !== 0) controlCells.push(i);
    expect(controlCells.length).toBe(PLANE_ROWS * PLANE_COLS / 2);
    for (const i of controlCells)
      expect(layout[i], 'an untouched cell keeps its word — the insertion renumbered it ' +
        'by exactly the band size').toBe(
        (doc0.layout![i] & ~LAYOUT_TILE_INDEX_MASK) | ((doc0.layout![i] & LAYOUT_TILE_INDEX_MASK) + n));
    const controlSlots = new Set(controlCells.map((i) => layout[i] & LAYOUT_TILE_INDEX_MASK));
    expect(Math.min(...controlSlots), 'every on-screen control slot is outside the band')
      .toBeGreaterThanOrEqual(slotBase + n);

    // ── The codec's own verdict, then the round trip ─────────────────────────
    expect(validateBgOverride(doc3)).toEqual([]);
    expect(bgOverrideSectionIssues(doc3)).toEqual([]);
    writeFileSync(PATH, serializeBgOverride(doc3));
    const back = parseBgOverride(readFileSync(PATH, 'utf8')).doc;
    const b0 = documentBands(back)[0];
    expect(documentBands(back).length).toBe(1);
    expect(b0.axis).toBe('vertical');
    expect(b0.driver).toBe('timer');
    expect(b0.rate_shift).toBe(2);
    expect(b0.pattern_px).toBe(BGANIM_VIEW_DERIVED_PERIOD_PX);
    expect(b0.default_off).toBe(true);
    expect(back.tiles!.length).toBe(doc2.tiles!.length);
    expect(back.layout).toEqual(layout);

    // ── THE EXPECTATION TABLE ────────────────────────────────────────────────
    // For every step s in 0..pattern_px-1 and every band slot j, the 32 bytes the
    // runtime should have left at that slot's VRAM address.
    //
    //   UP   — what this app and this engine claim: band-plane pixel row Y shows phase
    //          0's row (Y + s) mod H, i.e. content travels toward DECREASING Y.
    //   DOWN — the coherent mirror, (Y - s) mod H: what VRAM would hold if BOTH the
    //          bank roll and the coarse rotation carried the opposite sign.
    //
    // A reading matching NEITHER is its own finding: the two halves disagree, which is a
    // tear rather than a direction. The recipe says so.
    //
    // UP and DOWN coincide exactly when 2s ≡ 0 (mod H) — s ∈ {0, H/2} — AND ONLY BECAUSE
    // all H rows of phase 0 are distinct, which is asserted above.
    const upAt = (s: number, j: number) => {
      const { col, row } = { col: j % cols, row: (j - (j % cols)) / cols };
      const px = new Array<number>(TILE_PIXELS);
      for (let py = 0; py < TILE_WIDTH_PX; py++)
        for (let x = 0; x < TILE_WIDTH_PX; x++)
          px[py * TILE_WIDTH_PX + x] = p0[(row * TILE_WIDTH_PX + py + s) % H][col * TILE_WIDTH_PX + x];
      return px;
    };
    const downAt = (s: number, j: number) => {
      const { col, row } = { col: j % cols, row: (j - (j % cols)) / cols };
      const px = new Array<number>(TILE_PIXELS);
      for (let py = 0; py < TILE_WIDTH_PX; py++)
        for (let x = 0; x < TILE_WIDTH_PX; x++)
          px[py * TILE_WIDTH_PX + x] =
            p0[((row * TILE_WIDTH_PX + py - s) % H + H) % H][col * TILE_WIDTH_PX + x];
      return px;
    };

    // CROSS-CHECK THE MODEL AGAINST THE ARTEFACT, not against itself. Two independent
    // arms:
    //  (1) at any step whose coarse part is 0, the composite must be bank `s` verbatim;
    //  (2) at any step, slot j must be bank (s & 7)'s tile (j + (s >> 3) * cols) mod n —
    //      which is BgAnim_Update's own two-piece wrapped DMA, read off the engine:
    //      piece 1 src = bank + c*U len = T - c*U dst = base; piece 2 src = bank
    //      len = c*U dst = base + (T - c*U), so destination byte d holds bank byte
    //      (d + c*U) mod T, and U = cols*32 is exactly `cols` whole tiles.
    for (let f = 0; f < BGANIM_PHASE_BANKS; f++)
      for (let j = 0; j < n; j++)
        expect(upAt(f, j), `UP model at step ${f} slot ${j} must equal bank ${f} verbatim`)
          .toEqual(banks[f][j]);
    for (let s = 0; s < H; s++)
      for (let j = 0; j < n; j++)
        expect(upAt(s, j), `UP model at step ${s} slot ${j} must equal the engine's own ` +
          'wrapped DMA of bank ' + (s & 7))
          .toEqual(banks[s & 7][(j + (s >> 3) * cols) % n]);

    // ── AND THE SUB-HYPOTHESES, WHICH THE COMPOSITE ALONE HIDES ──────────────
    // FOUND BY EXERCISING THE VERDICT SCRIPT AGAINST A SYNTHETIC BROKEN MACHINE, not
    // by reasoning: a machine whose COARSE rotation runs the wrong way is byte-identical
    // to an honest one at coarse 0 and coarse rows/2, because c ≡ -c there. The same
    // fixed-point argument applies to the bank index. A capture at such a step reads
    // "UP" off a machine that is broken, which is the exact failure a rig is supposed
    // not to have.
    //
    // So each step also carries whether it separates the two halves SEPARATELY, and
    // both flags are DERIVED BY COMPARING BYTES rather than from the `c ∉ {0, rows/2}`
    // arithmetic — the arithmetic is right, but a flag computed from it could not catch
    // art that made two different rotations produce the same picture.
    const composite = (s: number, j: number, coarseSign: number, bankSign: number) => {
      const f = ((bankSign * (s & 7)) % BGANIM_PHASE_BANKS + BGANIM_PHASE_BANKS)
        % BGANIM_PHASE_BANKS;
      const t = ((j + coarseSign * (s >> 3) * cols) % n + n) % n;
      return banks[f][t];
    };
    const steps = Array.from({ length: H }, (_, s) => {
      const up = Array.from({ length: n }, (_, j) => packTile(upAt(s, j)));
      const down = Array.from({ length: n }, (_, j) => packTile(downAt(s, j)));
      const differing = up.map((v, j) => (v === down[j] ? -1 : j)).filter((j) => j >= 0);
      const differsFrom = (cs: number, bs: number) =>
        up.some((v, j) => v !== packTile(composite(s, j, cs, bs)));
      const separatesCoarseSign = differsFrom(-1, 1);
      const separatesBankIndex = differsFrom(1, -1);
      return {
        step: s, coarse: s >> 3, bank: s & 7,
        discriminating: differing.length > 0, slotsThatDiffer: differing,
        separatesCoarseSign, separatesBankIndex,
        fullySeparating: differing.length > 0 && separatesCoarseSign && separatesBankIndex,
        up, down,
      };
    });
    // The flags must agree with the fixed-point argument they were NOT computed from.
    for (const st of steps) {
      expect(st.separatesCoarseSign, `step ${st.step}: coarse ${st.coarse}`)
        .toBe((2 * st.coarse) % rows !== 0);
      expect(st.separatesBankIndex, `step ${st.step}: bank ${st.bank}`)
        .toBe((2 * st.bank) % BGANIM_PHASE_BANKS !== 0);
    }
    const fully = steps.filter((s) => s.fullySeparating).map((s) => s.step);
    expect(fully.length, 'the rig needs steps that separate BOTH halves, or a broken ' +
      'machine reads as UP').toBeGreaterThan(0);
    const discriminating = steps.filter((s) => s.discriminating).map((s) => s.step);
    expect(discriminating, 'exactly the steps with 2s !== 0 (mod H) separate UP from DOWN')
      .toEqual(Array.from({ length: H }, (_, s) => s).filter((s) => (2 * s) % H !== 0));
    expect(steps[0].discriminating).toBe(false);
    expect(steps[H / 2].discriminating).toBe(false);

    writeFileSync(EXPECT_OUT, JSON.stringify({
      band: {
        index: 0, cols, rows, axis: 'vertical', driver: 'timer', rate_shift: 2,
        default_off: true, pattern_px: H, slot_base: slotBase, tile_count: n,
        total_bytes: n * TILE_BYTES, unit_bytes: unitBytes, step_mask: H - 1,
        coarse_positions: (n * TILE_BYTES) / unitBytes,
        vram_dest: BG_TILE_BASE_SLOT * TILE_BYTES + slotBase * TILE_BYTES,
        vram_dest_hex: '0x' + (BG_TILE_BASE_SLOT * TILE_BYTES + slotBase * TILE_BYTES).toString(16),
      },
      slotOrder: {
        rule: 'vertical band: local slot = row * cols + col (ROW-major)',
        cite: 'aeon tools/EFFECTS_CONSUMER_CONTRACT.md §1.2 obligation 1; aurora bandCellSlot',
        slots: Array.from({ length: n }, (_, j) => ({
          localSlot: j, blobIndex: slotBase + j,
          vramSlot: BG_TILE_BASE_SLOT + slotBase + j,
          vramAddr: '0x' + ((BG_TILE_BASE_SLOT + slotBase + j) * TILE_BYTES).toString(16),
          bandCol: j % cols, bandRow: (j - (j % cols)) / cols,
        })),
      },
      paint: {
        rule: `layout[row*${PLANE_COLS} + col] = 0x4000 | (slotBase + (row % ${rows})*${cols} ` +
          `+ (col % ${cols})) for every col with ((col>>3)&1)===0; other columns untouched`,
        attrs: PAINT_ATTRS, paintedCells: painted.length,
        bandStripeColumns: Array.from({ length: PLANE_COLS }, (_, c) => c).filter(isBandStripe),
        controlCells: controlCells.length,
        controlSlotRange: [Math.min(...controlSlots), Math.max(...controlSlots)],
      },
      // THE OTHER HALF OF THE LINK, and the half a VRAM tile read alone cannot see:
      // WHICH PLANE CELL DRAWS WHICH SLOT. aeon's `BG_Init` writes plane B from
      // `VRAM_PLANE_B` ($E000) at `$E000 + col*2` with autoincrement $80, draining 64
      // rows per column in layout order, so plane cell (col, row) is the word at
      // `$E000 + row*128 + col*2` and PLANE ROW == LAYOUT ROW with no offset and no
      // wrap. `inject_editor_bg.py` rebases the index by BG_TILE_BASE_SLOT on the way,
      // which is the `+1024` below. Reading these words is what turns "the bytes at
      // slot j changed" into "the pixels at screen row Y changed".
      nametable: {
        planeBBase: '0xE000',
        wordAddr: 'plane cell (col,row) -> 0xE000 + row*128 + col*2',
        rebase: BG_TILE_BASE_SLOT,
        expectedBandWord: 'PAINT_ATTRS | (BG_TILE_BASE_SLOT + slotBase + (row % rows)*cols ' +
          '+ (col % cols)) — i.e. 0x4400 + local for this act',
        samples: Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => ({
            planeCol: c, planeRow: r,
            addr: '0x' + (0xE000 + r * 128 + c * 2).toString(16).toUpperCase(),
            word: '0x' + (PAINT_ATTRS | (BG_TILE_BASE_SLOT + slotBase + r * cols + c))
              .toString(16).toUpperCase(),
            localSlot: r * cols + c,
          }))).flat(),
        screenRow: 'plane B vscroll V is VSRAM word 1; screen row y shows plane pixel row ' +
          '(V + y) mod 512 (aeon VSCROLL_BG_MAX derivation). At boot V = 0 for OJZ act 1 ' +
          '(scene v_factor 15 = lock sentinel, v_offset 0), so plane cell row R occupies ' +
          'screen rows 8R..8R+7 and band row r is at screen rows 8r, 8r+64, 8r+128, ... ' +
          '— MONOTONE INCREASING in r, which is the claim under test.',
      },
      control: {
        why: 'slots the band does not own. They must be BYTE-IDENTICAL at every capture; ' +
          'a change here means the BG art was reloaded, not that the band stepped.',
        firstStaticSlot: slotBase + n,
        vramFirstStatic: '0x' + ((BG_TILE_BASE_SLOT + slotBase + n) * TILE_BYTES).toString(16),
        vramOnScreenControl: '0x' +
          ((BG_TILE_BASE_SLOT + Math.min(...controlSlots)) * TILE_BYTES).toString(16),
        onScreenControlSlot: Math.min(...controlSlots),
      },
      sampling: {
        nonDiscriminating: steps.filter((s) => !s.discriminating).map((s) => s.step),
        fullySeparating: fully,
        why: 'A capture at a step whose coarse part is 0 or rows/2 is byte-identical on a ' +
          'machine whose coarse rotation runs the WRONG WAY (c = -c there), and the same ' +
          'fixed-point argument applies to the bank index. Such a capture reads "UP" off ' +
          'a broken machine. Sample at least one FULLY SEPARATING step.',
      },
      phase0RowsHex: p0.map((r) => r.map((v) => v.toString(16)).join('')),
      steps,
    }, null, 1));

    // eslint-disable-next-line no-console
    console.log(
      `AUTHORED: one ${cols}x${rows} VERTICAL band, driver timer, rate_shift 2, default_off\n` +
      `  slots ${slotBase}..${slotBase + n - 1} -> VRAM ` +
      `0x${((BG_TILE_BASE_SLOT + slotBase) * TILE_BYTES).toString(16)}..` +
      `0x${((BG_TILE_BASE_SLOT + slotBase + n) * TILE_BYTES - 1).toString(16)}; ` +
      `pattern_px ${H}; expect step_mask ${H - 1}, col_shift ${Math.log2(unitBytes)}\n` +
      `  tiles ${doc0.tiles!.length} -> ${back.tiles!.length} (cap ${BG_TILE_CAPACITY}); ` +
      `painted ${painted.length} of ${BG_LAYOUT_WORDS} cells; ${controlCells.length} control cells\n` +
      `  discriminating steps (UP != DOWN): ${discriminating.length} of ${H} — all but ` +
      `${steps.filter((s) => !s.discriminating).map((s) => s.step).join(' and ')}\n` +
      `  FULLY separating (also pins the coarse sign and the bank index): ` +
      `${fully.length} of ${H}; sample one of ${fully.slice(0, 8).join(', ')}, …`);
  });
});
