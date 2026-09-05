// BgAnim band PREVIEW arithmetic — the phase the editor draws, computed with
// the SAME expression the consumer bakes and the engine executes.
//
// WHY THIS IS A SEPARATE, PURE MODULE. The preview's whole claim is that the
// picture in the viewport is the picture the ROM will show. That claim is
// arithmetic, and arithmetic living inside a `.tsx` file is arithmetic the node
// suite cannot see (this repo's bar 1). So every number below is derived here,
// once, from the vendored consumer contract, and the renderer does nothing but
// blit what these functions return.
//
// ═══ EVERY CONSTANT IS DERIVED. NONE IS TYPED IN. ═══
//
// The engine's per-band expression, read out of aeon `engine/level/bg_anim.emp`
// (`BgAnim_Update`, the `.band_loop` body) and the table format its header
// documents:
//
//     step   = (driver_value >> rate_shift) & step_mask       // three table words
//     fine   = step & (BGANIM_BANKS - 1)                      // `and.w #BGANIM_BANKS-1`
//     coarse = step >> log2(BGANIM_BANKS)                     // `lsr.w #3` — "whole columns"
//
// and the pieces of it:
//
//   • `step_mask` is NOT a free table word. The emitter computes it:
//     `'step_mask': pattern_px - 1` (aeon `tools/inject_editor_bg.py`), which
//     the runtime's table doc restates as "$04 dc.w step_mask — pattern width in
//     px, minus 1". `pattern_px` is itself asserted `== cols * 8` there, and the
//     8 is the contract's `TILE_WIDTH_PX` (whose own `why` names this exact
//     derivation). So `stepMask = cols * TILE_WIDTH_PX - 1`, read through the
//     contract accessor, never spelled.
//
//   • `rate_shift`'s default is the contract's `bandKeys.rate_shift.default`,
//     which is pinned from the emitter's `a.get('rate_shift', 2)`. It is read
//     via `BAND_DEFAULTS` — the same accessor `describeBands` resolves it with —
//     so the preview and the editor cannot disagree about an absent key.
//
//   • The bank count is `BGANIM_PHASE_BANKS` from the contract (pinned from the
//     engine's `banks: [*u8; BGANIM_BANKS]` AND the emitter's `len(...) == 8`
//     assert). The fine mask and the coarse shift are DERIVED FROM IT
//     (`banks-1`, `log2(banks)`) rather than written as 7 and 3 — the engine
//     spells them as literals only because 68000 immediates must be literal, and
//     its own header names them `step & 7` / `step >> 3` *because* BANKS is 8.
//     `assertBankCountIsPowerOfTwo` refuses if that ever stops being true, which
//     is the only condition under which mask-and-shift is the right lowering.
//
//   • The driver value is read by `move.w` off a 16.16 cell (`Camera_X`) or off
//     `Logic_Tick+2` — a WORD in both cases. Hence `DRIVER_VALUE_MASK`, derived
//     from the contract's `LAYOUT_WORD_MAX` (the one place the file states the
//     width of a 68000 word: "packed big-endian unsigned 16-bit").
//
// ═══ THE COMPOSITE IS ONE PIXEL OFFSET, AND THAT IS A CHECK, NOT A SHORTCUT ═══
//
// fine advances 1px per step, coarse advances 8px per 8 steps, so the two halves
// together translate the pattern by exactly `step` pixels — which is what the
// runtime header claims ("translates the pattern by 1 pixel per (1 <<
// rate_shift) units"). `bandPhase` returns the two halves SEPARATELY anyway, and
// the renderer must apply both, because only the coarse half is a permutation of
// the band's own slots: the fine half selects a bank whose art may be ANYTHING
// the author drew. Collapsing them into "roll phase 0 by `step` px" would be
// correct only for `shift`-filled bands and silently wrong for hand-authored
// ones — which is the whole class of band aeon's own generator emits.
//
// ═══ THE CAMERA DERIVATION (ruling §4) ═══
//
// See `editorPanToCameraPx`. The short version: Aurora's `vpX`/`vpY` are ALREADY
// unbiased world pixels measured from the act origin, the same quantity
// `Camera_X`/`Camera_Y` hold, so the mapping is truncate-and-clamp rather than a
// scale. The derivation for that is written out at the function, because the
// ruling that commissioned this parcel predicted the opposite and the difference
// is load-bearing.

import {
  BAND_DEFAULTS,
  BGANIM_DRIVERS,
  BGANIM_PHASE_BANKS,
  LAYOUT_WORD_MAX,
  TILE_PIXELS,
  TILE_WIDTH_PX,
  bandAxis,
  bandCellSlot,
  bandIsHorizontal,
  bandPatternPx,
  bandSlotCell,
  bandTileCount,
  type BgAnimBandAxis,
  type BgAnimDriver,
  type BgOverrideBand,
} from './bg-override';

/**
 * The fine-phase mask: `step & BGANIM_BANK_MASK` picks one of the pre-shifted
 * banks. Derived from the bank count, not written as 7.
 */
export const BGANIM_BANK_MASK = BGANIM_PHASE_BANKS - 1;

/**
 * `step >> BGANIM_COARSE_SHIFT` = whole pattern columns rotated. Derived as
 * log2 of the bank count: the banks cover exactly one column's worth of
 * sub-column phase (one bank per pixel, 8 pixels per tile column, 8 banks), so
 * every 8th step is one whole column.
 */
export const BGANIM_COARSE_SHIFT = Math.log2(BGANIM_PHASE_BANKS);

/**
 * The width of the 68000 word the runtime reads its driver value through.
 *
 * `LAYOUT_WORD_MAX` is the contract's own statement that a 68000 word holds
 * 0..65535 ("packed big-endian unsigned 16-bit"); the runtime's driver reads
 * are `move.w Camera_X, d0` / `move.w Logic_Tick+2, d0`, i.e. the same width.
 * Reading it from there rather than typing `0xFFFF` keeps the file free of
 * magic hex, and it is the value that makes a preview of a world wider than
 * 65535px wrap where the engine wraps.
 */
export const DRIVER_VALUE_MASK = LAYOUT_WORD_MAX;

/**
 * The mask-and-shift lowering of the fine/coarse split is only valid while the
 * bank count is a power of two. The engine hardcodes both halves as immediates
 * (`and.w #BGANIM_BANKS-1` / `lsr.w #3`), so a non-power-of-two bank count
 * would be an engine change, not a preview change — this refuses loudly instead
 * of quietly previewing a phase nothing bakes.
 */
export function assertBankCountIsPowerOfTwo(): void {
  if (!Number.isInteger(BGANIM_COARSE_SHIFT) || BGANIM_PHASE_BANKS <= 0) {
    throw new Error(
      `BGANIM_PHASE_BANKS is ${BGANIM_PHASE_BANKS}, which is not a power of two. The runtime ` +
      'splits a step into fine and coarse halves with `and.w #BGANIM_BANKS-1` and `lsr.w #3`: ' +
      'both immediates are only the right lowering for a power-of-two bank count, so a preview ' +
      'built on them would be showing a phase the engine cannot reach.',
    );
  }
}

/** The scalar sources a band's step can be read from, as the engine reads them. */
export interface BandDriverInputs {
  /** `Camera_X` — unbiased world-pixel LEFT edge, integer (16.16 high word). */
  cameraXPx: number;
  /** `Camera_Y` — unbiased world-pixel TOP edge, integer. */
  cameraYPx: number;
  /** `Logic_Tick` — the lag-immune game-frame counter, 60/s. */
  gameFrame: number;
}

/**
 * Editor pan -> the `Camera_X`/`Camera_Y` value a band would read.
 *
 * THE RULING PREDICTED A SCALE FACTOR HERE AND THERE ISN'T ONE — this is the
 * derivation, not an assertion:
 *
 *  1. `viewStore.pan` is `vpX - dx / zoom`: the divide by `zoom` happens on the
 *     way IN, so the stored `vpX` is in UNZOOMED units. `MapViewport`'s draw
 *     pass then does `ctx.scale(zoom); ctx.translate(-vpX, -vpY)` and draws each
 *     section at `sectionRenderer.sectionWorldOffset(i)` — an untransformed
 *     world-pixel offset. A quantity that composes with world offsets under one
 *     shared `scale` IS in world pixels.
 *  2. `sectionWorldOffset(i)` is `col * SECTION_PIXEL_SIZE`, so section (0,0)
 *     sits at world (0,0) and section (c,r) at `(c,r) * 2048`. Aurora's
 *     `SECTION_PIXEL_SIZE` is 2048 and aeon's `SECTION_SIZE` is `$800` = 2048
 *     (`ENGINE_ARCHITECTURE.md`), so the two grids are the same grid with the
 *     same origin and the same unit.
 *  3. `Camera_X`/`Camera_Y` are the camera's unbiased LEFT/TOP edge in world
 *     pixels from the act origin — proven by the clamp
 *     `Camera_X_Max = (grid_w << SECTION_SIZE_SHIFT) - SCREEN_WIDTH`
 *     (aeon `engine/ram.emp`), which is only consistent with an edge-referenced
 *     camera. `Camera_X_Biased` is a DIFFERENT cell (the integer minus the VDP
 *     sprite offset) and is deliberately not what this maps onto.
 *  4. `vpX` is the viewport's left edge in those same world pixels.
 *
 * So the mapping is the identity, and all that is left is the two mechanical
 * details a faithful read must not skip:
 *
 *  • TRUNCATE TO INTEGER FIRST. The runtime's `move.w Camera_X, d0` on a 16.16
 *    cell takes the HIGH word on a big-endian 68000 — the integer pixel. A
 *    sub-pixel pan does not advance a band at all. Truncating after the shift
 *    would smear phase across sub-pixel pans.
 *  • MASK TO A WORD. `move.w` is 16 bits; a world wider than 65536px wraps in
 *    the engine, so it wraps here.
 *
 * NOT MODELLED, and deliberately: the engine also CLAMPS the camera to
 * `[0, level_width - SCREEN_WIDTH]`. The lower half is modelled (Aurora's own
 * pan clamps at 0, and this floors at 0 regardless); the upper half is not,
 * because `SCREEN_WIDTH` is an aeon constant with no authority inside Aurora and
 * inventing a 320 here is exactly the enshrine-a-neighbour's-number move this
 * repo has been bitten by twice. The consequence is bounded and is part of what
 * "approximate" means on the label: panning past the level's right/bottom edge
 * shows phases the engine's clamp would hold still.
 */
export function editorPanToCameraPx(pan: number): number {
  if (!Number.isFinite(pan)) return 0;
  return Math.max(0, Math.floor(pan)) & DRIVER_VALUE_MASK;
}

/**
 * The scalar the band reads this frame, as a 68000 word.
 *
 * An unknown driver name is not guessed at: the consumer's `DRIVERS[...]` lookup
 * is a `KeyError` at bake, so a document naming one has a bake-time refusal
 * waiting for it, and a preview that quietly picked `camera_x` would hide that.
 */
export function bandDriverValue(driver: BgAnimDriver, inputs: BandDriverInputs): number {
  switch (driver) {
    case 'camera_x': return inputs.cameraXPx & DRIVER_VALUE_MASK;
    case 'camera_y': return inputs.cameraYPx & DRIVER_VALUE_MASK;
    case 'timer': return inputs.gameFrame & DRIVER_VALUE_MASK;
    default:
      throw new Error(
        `unknown BgAnim driver ${JSON.stringify(driver)}: the consumer's drivers are ` +
        `${Object.keys(BGANIM_DRIVERS).join(', ')} and an unlisted name raises at bake. A ` +
        'preview that fell back to a default would show motion the ROM will never produce.',
      );
  }
}

/**
 * `pattern_px` for a band — the period ALONG ITS AXIS, re-exported from the
 * codec rather than recomputed. It used to be `cols * TILE_WIDTH_PX` here, which
 * is the horizontal reading; a second copy of that expression is exactly how a
 * vertical band would have previewed against the wrong ring.
 */
export { bandPatternPx };

/** `step_mask` — `pattern_px - 1` (emitter), never a document field. */
export function bandStepMask(band: Pick<BgOverrideBand, 'cols' | 'rows' | 'axis'>): number {
  return bandPatternPx(band) - 1;
}

/** `step = (driver_value >> rate_shift) & step_mask`, the engine's three words. */
export function bandStep(driverValue: number, rateShift: number, stepMask: number): number {
  return (driverValue >>> rateShift) & stepMask;
}

/**
 * The two halves of a step, kept apart because they are applied to different
 * things: `bank` selects WHICH ART, `coarseColumns` rotates WHICH SLOT gets it.
 */
export interface BandPhase {
  /** Index into `phases` — the fine phase, `step & (banks-1)`. */
  bank: number;
  /** Whole pattern columns of rotation — the coarse phase, `step >> log2(banks)`. */
  coarseColumns: number;
}

export function bandPhase(step: number): BandPhase {
  assertBankCountIsPowerOfTwo();
  return { bank: step & BGANIM_BANK_MASK, coarseColumns: step >>> BGANIM_COARSE_SHIFT };
}

/**
 * Which tile of the selected bank lands in the band's local slot `localSlot`.
 *
 * DERIVED FROM THE TWO DMAs, not from the header prose. `BgAnim_Update` queues:
 *   piece 1  src = bank + coarse*unit_bytes, dest = band base, len = n*32 - that
 *   piece 2  src = bank,                     dest = base + len(piece 1)
 * so destination UNIT `j` is fed by art unit `(j + coarse) mod units`, and the
 * position within a unit is untouched (the DMA moves whole units).
 *
 * THE UNIT IS AXIS-DEPENDENT, and it is the same rotate either way — the engine
 * shifts by `col_shift` and does not know which axis it is on. On a HORIZONTAL
 * band the unit is a pattern COLUMN (`rows*32` bytes, slots column-major) and on
 * a VERTICAL band a pattern ROW (`cols*32` bytes, slots ROW-major). Both are the
 * `bandCellSlot`/`bandSlotCell` pair, so this function never spells an order of
 * its own — a second spelling here is how the preview would come to disagree
 * with the shift fill about which cell a slot draws.
 */
export function bandSlotSource(
  localSlot: number, band: Pick<BgOverrideBand, 'cols' | 'rows' | 'axis'>, coarseUnits: number,
): number {
  const { col, row } = bandSlotCell(band, localSlot);
  return bandIsHorizontal(band)
    ? bandCellSlot(band, (col + coarseUnits) % band.cols, row)
    : bandCellSlot(band, col, (row + coarseUnits) % band.rows);
}

/** A band resolved for preview: everything the blitter needs, nothing it does not. */
export interface BandPreviewState {
  /** Position in `anims`. */
  index: number;
  driver: BgAnimDriver;
  /** Resolved through `BAND_DEFAULTS`, so an absent key means what it bakes as. */
  rateShift: number;
  cols: number;
  rows: number;
  /** Resolved through `BAND_DEFAULTS`, like `driver` — absent means horizontal. */
  axis: BgAnimBandAxis;
  /** First BG-blob slot the band owns (derived by walking the list). */
  slotBase: number;
  /** `cols * rows`. */
  tileCount: number;
  /** `(driver >> rate_shift) & (pattern_px - 1)`. */
  step: number;
  bank: number;
  coarseColumns: number;
  /** True when the band's step is a function of time rather than of the camera. */
  timeVarying: boolean;
}

/** `rate_shift` with the consumer's default applied — the one resolution site. */
export function bandRateShift(band: Pick<BgOverrideBand, 'rate_shift'>): number {
  return (band.rate_shift ?? BAND_DEFAULTS.rate_shift) as number;
}

/** `driver` with the consumer's default applied — the one resolution site. */
export function bandDriver(band: Pick<BgOverrideBand, 'driver'>): BgAnimDriver {
  return (band.driver ?? BAND_DEFAULTS.driver) as BgAnimDriver;
}

/**
 * Is this band's phase a function of the WALL CLOCK?
 *
 * The one question the preview's honesty rests on. Two of the three drivers are
 * functions of the camera and are clockless BY CONSTRUCTION: their phase is a
 * pure function of the pan the viewport already repaints on. Only `timer` needs
 * a clock, and a camera band auto-scrolling on one would teach the author that
 * `camera_y` means vertical motion — which it does not; it names a SCALAR
 * SOURCE, and which way the band moves is its `axis` key, independently of
 * every driver.
 */
export function bandIsTimeVarying(band: Pick<BgOverrideBand, 'driver'>): boolean {
  return bandDriver(band) === 'timer';
}

/**
 * Resolve every band of a document to its preview state at one instant.
 *
 * Slot bases are walked, never read from `slot_base` — the key is an assertion
 * about the cursor, not a placement (the consumer asserts `slot_base ==
 * slot_cursor`), and `describeBands` derives it the same way.
 */
export function bandPreviewStates(
  bands: readonly BgOverrideBand[], inputs: BandDriverInputs,
): BandPreviewState[] {
  const out: BandPreviewState[] = [];
  let slotBase = 0;
  for (let index = 0; index < bands.length; index++) {
    const band = bands[index];
    const n = bandTileCount(band);
    const driver = bandDriver(band);
    const rateShift = bandRateShift(band);
    const step = bandStep(bandDriverValue(driver, inputs), rateShift, bandStepMask(band));
    const { bank, coarseColumns } = bandPhase(step);
    out.push({
      index, driver, rateShift, cols: band.cols, rows: band.rows, axis: bandAxis(band),
      slotBase, tileCount: n, step, bank, coarseColumns,
      timeVarying: driver === 'timer',
    });
    slotBase += n;
  }
  return out;
}

/**
 * The repaint key: what must CHANGE before the viewport is worth repainting.
 *
 * The clock ticks at 60Hz; a band at the default `rate_shift` steps at 15Hz.
 * Repainting on the tick rather than on this key would spend three quarters of
 * the frames redrawing the identical picture — the cost the ruling's
 * "repaint only when a band's step key changes" clause exists to refuse.
 */
export function bandStepKey(states: readonly BandPreviewState[]): string {
  return states.map((s) => s.step).join(',');
}

/**
 * Does the on-screen BG blob still hold this band's REST ART at its own slots?
 *
 * THE ONE PRECONDITION UNDER WHICH SUBSTITUTING IS SOUND, and it is not a
 * formality — see `docs/reviews/2026-08-26-bganim-preview-blob-divergence.md`.
 * A band names SLOTS in the BG tile blob; the phase art it names them with lives
 * in `editor_bg_override.json`, while the blob the viewport paints comes from the
 * act's own `bgTiles`. Those are two different files and nothing in Aurora syncs
 * them, so "slot 3" can mean two different tiles at once. Substituting across
 * that gap would draw the override's art over the act's picture at cells chosen
 * by an index that means something else in each — confidently, silently wrong.
 *
 * The contract already names the exact equality that closes the gap:
 * `prefixIdentity`, "phases[0] == tiles[slot_base : slot_base + cols*rows] — the
 * band's rest state IS the static tiles it covers". Checked against the DISPLAYED
 * blob rather than the document's own `tiles`, it becomes a check that the two
 * blobs agree about this band's slots, which is exactly the licence to substitute.
 *
 * Returns a reason string on failure (for the author, not a log) or null on pass.
 */
export function bandRestArtMismatch(
  band: BgOverrideBand,
  slotBase: number,
  blobTiles: readonly { readonly pixels: ArrayLike<number> }[],
): string | null {
  const n = bandTileCount(band);
  const phase0 = Array.isArray(band.phases) ? band.phases[0] : undefined;
  if (!Array.isArray(phase0) || phase0.length !== n) {
    return `band phases[0] holds ${Array.isArray(phase0) ? phase0.length : 0} tile(s), not the ` +
      `${n} its ${band.cols}x${band.rows} geometry needs`;
  }
  if (slotBase + n > blobTiles.length) {
    return `the background on screen has ${blobTiles.length} tile(s), which does not reach the ` +
      `band's slots ${slotBase}..${slotBase + n - 1}`;
  }
  for (let i = 0; i < n; i++) {
    const want = phase0[i];
    const got = blobTiles[slotBase + i].pixels;
    if (!Array.isArray(want) || want.length !== TILE_PIXELS) {
      return `band phases[0][${i}] is not ${TILE_PIXELS} pixel values`;
    }
    if (got.length !== TILE_PIXELS) {
      return `the background tile at slot ${slotBase + i} is not ${TILE_PIXELS} pixel values`;
    }
    for (let p = 0; p < TILE_PIXELS; p++) {
      if (want[p] !== got[p]) {
        return `slot ${slotBase + i} on screen is not the band's rest art (first difference at ` +
          `pixel ${p})`;
      }
    }
  }
  return null;
}
