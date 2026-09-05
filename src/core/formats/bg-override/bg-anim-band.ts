// The BgAnim band model — wave-1 surface 4, part 2.
//
// The codec next door reads, validates and writes `editor_bg_override.json`.
// This file is the only thing allowed to CHANGE which bands it carries, and it
// exists as one module because adding or removing a band is one indivisible
// edit to three keys.
//
// WHY ONE EDIT AND NOT THREE. A band's animated slots are a PREFIX of `tiles`,
// not an addition to it: bands pack contiguously from slot 0 and DMA over the
// FRONT of the static blob, so `phases[0] == tiles[slot_base : slot_base + n]`
// (aeon `inject_editor_bg.py::validate_band_coherence`). Inserting a band
// therefore inserts n tiles at the front-ward end of the blob, which RENUMBERS
// every static tile after it, which invalidates every `layout` word that named
// one. Applying any two of those three and not the third produces a document
// that passes every consumer assert, bakes cleanly, and ships silently corrupt
// art — the accident that already destroyed real work once (aeon `dd93a840`,
// docs/BUGS.md TOOL-01).
//
// So the unit of work here is a PLAN: the slot range, plus the exact layout
// rewrite, computed before anything is touched. The plan is what the undo
// command stores, and `insertBand`/`removeBand` are exact inverses over it —
// one function pair used by both the apply and the undo direction, which is the
// only way an apply and its undo cannot drift apart.
//
// EVERY BOUND IS READ FROM THE CONTRACT. `BGANIM_MAX_BANDS`, `BG_TILE_CAPACITY`,
// `LAYOUT_TILE_INDEX_MASK`, `BGANIM_PHASE_BANKS`, `TILE_PIXELS` and the driver
// table all come through the codec's loud accessor. Nothing here restates a
// number, including the ones a reviewer would recognise on sight.
//
// THE RENDERED IMAGE IS THE INVARIANT. Adding a band must not change one pixel
// of what the layout draws: the new art goes in unreferenced, and every cell
// that named a static tile is rewritten to name the same tile at its new index.
// That is stronger than "the document still validates" and it is the property
// the tests assert cell by cell over the real b0e5a661 document.

import {
  BAND_DEFAULTS,
  BGANIM_DRIVERS,
  BGANIM_MAX_BANDS,
  BGANIM_PHASE_BANKS,
  BG_LAYOUT_WORDS,
  BG_TILE_CAPACITY,
  BgOverrideError,
  LAYOUT_TILE_INDEX_MASK,
  TILE_PIXELS,
  TILE_WIDTH_PX,
  animatedSlotCount,
  bandAxis,
  bandCellSlot,
  bandColumnBytes,
  bandIsHorizontal,
  bandPatternPx,
  bandRotationUnitBytes,
  bandSlotCell,
  bandTileCount,
  cloneBgOverride,
  validateBgOverride,
  BAND_AXIS_DEFAULT,
  type BgAnimBandAxis,
  type BgAnimDriver,
  type BgOverrideBand,
  type BgOverrideDocument,
} from './bg-override';

// ---------------------------------------------------------------------------
// The editor-facing read model
// ---------------------------------------------------------------------------

/**
 * One band as a band editor wants to see it: geometry, driver, rate, and the
 * slot range it owns, with the consumer's defaults resolved.
 *
 * DERIVED AND READ-ONLY. Nothing writes a document back from a view — a view
 * names only the fields a UI renders, and a document may carry keys Aurora does
 * not model at all (the sole-writer round-trip). Reconstructing a band from one
 * of these would drop exactly those keys, which is the silent-erasure class
 * this whole surface is built against. Edits go through the plan/insert/remove
 * path below, which copies bands by spread and never by field list.
 */
export interface BgAnimBandView {
  /** Position in `anims`. Bands are ordered, and the order sets the slot base. */
  index: number;
  cols: number;
  rows: number;
  /** `cols * rows` — the slots this band covers. */
  tileCount: number;
  /** Which way the pattern translates, with the consumer's default resolved. */
  axis: BgAnimBandAxis;
  /** false = the document leaves `axis` out and the consumer's default applies. */
  axisIsExplicit: boolean;
  /** `pattern_px` — the period ALONG THE AXIS: `cols*8` horizontal, `rows*8` vertical. */
  patternPx: number;
  /** `rows * TILE_BYTES`. On a VERTICAL band this is not the rotation unit — see below. */
  columnBytes: number;
  /**
   * The quantity the runtime shifts, so a power of two: `columnBytes` on a
   * horizontal band, `cols * TILE_BYTES` on a vertical one.
   */
  rotationUnitBytes: number;
  /**
   * The SCALAR SOURCE the band's step is read from — never an axis. `camera_y`
   * does NOT mean vertical motion; the `axis` field above is what does.
   */
  driver: BgAnimDriver;
  /** false = the document leaves `driver` out and the consumer's default applies. */
  driverIsExplicit: boolean;
  rateShift: number;
  /** false = the document leaves `rate_shift` out. */
  rateShiftIsExplicit: boolean;
  /** The running cursor. Derived from the bands before it, never trusted from the key. */
  slotBase: number;
  /** false = the document leaves `slot_base` out, which is the normal shape. */
  slotBaseIsExplicit: boolean;
  /** Banks present. The contract requires exactly `BGANIM_PHASE_BANKS`. */
  phaseBanks: number;
}

/** The bands of a document, or the empty list. `anims` is optional and absent-means-none. */
export function documentBands(doc: BgOverrideDocument): readonly BgOverrideBand[] {
  return Array.isArray(doc.anims) ? doc.anims : [];
}

/**
 * The slot each band starts at, derived by walking the list — NOT read out of
 * the `slot_base` keys, which are optional, and which the consumer treats as an
 * assertion about the cursor rather than a placement.
 *
 * Returns `bands.length + 1` entries: the last is the total animated slot
 * count, which is also where the next band would go.
 */
export function bandSlotBases(bands: readonly BgOverrideBand[]): number[] {
  const bases: number[] = [0];
  for (const band of bands) bases.push(bases[bases.length - 1] + bandTileCount(band));
  return bases;
}

/** Every band of a document as a view, with slot bases derived positionally. */
export function describeBands(doc: BgOverrideDocument): BgAnimBandView[] {
  const bands = documentBands(doc);
  const bases = bandSlotBases(bands);
  return bands.map((band, index) => ({
    index,
    cols: band.cols,
    rows: band.rows,
    tileCount: bandTileCount(band),
    axis: bandAxis(band),
    axisIsExplicit: band.axis !== undefined,
    patternPx: bandPatternPx(band),
    columnBytes: bandColumnBytes(band),
    rotationUnitBytes: bandRotationUnitBytes(band),
    driver: (band.driver ?? BAND_DEFAULTS.driver) as BgAnimDriver,
    driverIsExplicit: band.driver !== undefined,
    rateShift: (band.rate_shift ?? BAND_DEFAULTS.rate_shift) as number,
    rateShiftIsExplicit: band.rate_shift !== undefined,
    slotBase: bases[index],
    slotBaseIsExplicit: band.slot_base !== undefined,
    phaseBanks: Array.isArray(band.phases) ? band.phases.length : 0,
  }));
}

/** How many more bands this document may carry. Zero means the ceiling is reached. */
export function bandsRemaining(doc: BgOverrideDocument): number {
  return Math.max(0, BGANIM_MAX_BANDS - documentBands(doc).length);
}

/** How many more static slots the blob can take, ceiling included. */
export function tileSlotsRemaining(doc: BgOverrideDocument): number {
  return Math.max(0, BG_TILE_CAPACITY - (Array.isArray(doc.tiles) ? doc.tiles.length : 0));
}

// ---------------------------------------------------------------------------
// Constructing a band
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase fill — how banks 1..BGANIM_PHASE_BANKS-1 are derived from phase 0
// ---------------------------------------------------------------------------

/**
 * How a band arriving with only phase-0 art fills its remaining banks.
 *
 *   'copy'   Banks 1.. are copies of phase 0. The band is VISUALLY INERT until
 *            authored — it draws the same art at every step. Promotion's
 *            default, ratified by measurement (ROADMAP item 27): the historical
 *            shipped bands were hand-drawn frames, so nothing generated could
 *            reproduce them, and a copy is the only fill that edits nothing.
 *
 *   'blank'  Banks 1.. are all-zero art. Insertion's default (a blank band has
 *            a blank phase 0, so every fill agrees there). On a promotion this
 *            makes the picture break on the band's second phase — offered as a
 *            deliberate authoring start, never a default.
 *
 *   'shift'  Bank k is phase 0 scrolled k pixels ALONG THE BAND'S DECLARED AXIS,
 *            within its own `pattern_px` — exactly what the contract calls
 *            `phases` ("pre-shifted art 1px apart, selected by step & 7"), and
 *            what aeon's own generator emits. The one fill that makes a saved
 *            band visibly MOVE with no further authoring. See
 *            `shiftedPhaseBanks` for the axis and direction derivation.
 */
export type BandPhaseFill = 'copy' | 'blank' | 'shift';

/**
 * SHIFT DIRECTION, derived from the consumer rather than chosen.
 *
 * The vendored contract's prose ("pre-shifted art 1px apart, selected by
 * `step & 7`") does not spell a direction, but the runtime and the generator it
 * cites both do, and they must agree with each other or the fine and coarse
 * halves of the scroll would tear at every 8th step:
 *
 *   • COARSE (aeon engine/level/bg_anim.emp, the two-piece bank DMA): piece 1
 *     copies art from `bank + shift_bytes` to the band's base slot, piece 2
 *     wraps columns 0..coarse-1 behind it — so at coarse step c, band slot
 *     column j holds ART column (j + c) mod cols. On-screen pixel x draws art
 *     pixel x + 8c: the pattern translates toward -x as the step grows.
 *   • FINE (aeon tools/forest_bg_gen.py, `pat_pixel(v, y, ph)` sampling
 *     `trunk_pixel((v + ph) % PAT_W, ...)`): bank ph's pixel at x IS phase 0's
 *     pixel at (x + ph) mod pattern_px — the same direction, 1px per bank.
 *
 * So bank k reads its pixels from phase 0 at `x + k * PHASE_SHIFT_SRC_PX`,
 * wrapping at the band's `pattern_px`. The constant is named so the direction
 * is greppable and single-sited; +1 is "content moves toward the DECREASING
 * coordinate as the driver scalar grows", which for `camera_x` is the
 * background receding as the camera advances.
 *
 * THE SAME CONSTANT SERVES BOTH AXES, and that is derived rather than assumed.
 * aeon's axis block states the direction as one mechanism: "bank k is phase 0
 * translated k px toward DECREASING coordinate ... and the coarse rotate
 * carries the same sign, so an increasing driver scrolls a horizontal band LEFT
 * and a vertical band UP". Reading at `+k` along the axis is what produces both.
 */
export const PHASE_SHIFT_SRC_PX = 1;

/**
 * Banks 0..BGANIM_PHASE_BANKS-1 as pre-shifted copies of `phase0`: bank k is
 * phase 0 scrolled k pixels ALONG THE BAND'S DECLARED AXIS, wrapping within its
 * own `pattern_px`.
 *
 * THE COLUMN-WISE TWIN (aurora ROADMAP row 55, built 2026-09-03). Until aeon
 * 3a4712fa there was one arm here and it was horizontal BY CONSTRUCTION: it
 * rolled x within `cols*8` and read its slots column-major. Running exactly that
 * over a band declared `axis: "vertical"` is the accident aeon's
 * `validate_band_phase_axis` exists to refuse — phases that are exact HORIZONTAL
 * translations under a vertical declaration, which bakes clean and ships a
 * SHIMMER instead of a scroll. So the axis is not an option on this function; it
 * is read off the band, and there is no way to ask for the other arm.
 *
 * THE PIXEL GEOMETRY IS THE RUNTIME'S, ON BOTH ARMS.
 *
 *   • SLOT ORDER (writer obligation 1) comes from `bandCellSlot`/`bandSlotCell`,
 *     the codec's one pair: column-major `c*rows + r` on a horizontal band ("a
 *     pattern column's tiles are contiguous in VRAM" — aeon
 *     engine/level/bg_anim.emp; forest_bg_gen.py builds its banks `for col: for
 *     vrow:`), ROW-major `r*cols + c` on a vertical one (aeon
 *     EFFECTS_CONSUMER_CONTRACT.md §1.2). The two produce the same SET of slots,
 *     so nothing downstream can tell them apart and nothing but the order can be
 *     asserted about them.
 *   • THE ROLL runs along the axis: x within `cols*8` horizontal, y within
 *     `rows*8` vertical — which is `bandPatternPx` on both, because
 *     `pattern_px` IS the period along the axis.
 *
 * Each tile is a flat row-major 8x8 of TILE_PIXELS values (the contract's
 * TILE_PIXELS entry cites the injector's pack loop), and the band's pixel plane
 * is `cols*8` x `rows*8` however its slots are ordered.
 *
 * Bank 0 is the k=0 roll, which is phase 0 exactly — the prefix identity
 * (`phases[0] == tiles[slot_base : slot_base+n]`) survives by construction on
 * both arms.
 */
export function shiftedPhaseBanks(
  spec: Pick<BgOverrideBand, 'cols' | 'rows' | 'axis'>, phase0: readonly number[][],
): number[][][] {
  const n = bandTileCount(spec);
  const patternPx = bandPatternPx(spec);
  const horizontal = bandIsHorizontal(spec);
  if (phase0.length !== n || phase0.some((t) => !Array.isArray(t) || t.length !== TILE_PIXELS)) {
    throw new BgOverrideError(
      `cannot derive shifted phase banks: phase 0 must be ${n} tiles of ${TILE_PIXELS} pixels for ` +
      `a ${spec.cols}x${spec.rows} band, got ${phase0.length} tile(s). The shift is a permutation ` +
      'of exactly the band\'s own pixels, so it has nothing to say about any other shape.',
    );
  }
  return Array.from({ length: BGANIM_PHASE_BANKS }, (_, bank) =>
    Array.from({ length: n }, (_, t) => {
      const { col, row } = bandSlotCell(spec, t);
      const out = new Array<number>(TILE_PIXELS);
      const roll = bank * PHASE_SHIFT_SRC_PX;
      for (let py = 0; py < TILE_WIDTH_PX; py++) {
        for (let px = 0; px < TILE_WIDTH_PX; px++) {
          // The source PIXEL on the band's own plane, rolled along the axis.
          const srcX = horizontal
            ? (col * TILE_WIDTH_PX + px + roll) % patternPx
            : col * TILE_WIDTH_PX + px;
          const srcY = horizontal
            ? row * TILE_WIDTH_PX + py
            : (row * TILE_WIDTH_PX + py + roll) % patternPx;
          const srcTile = bandCellSlot(
            spec, Math.floor(srcX / TILE_WIDTH_PX), Math.floor(srcY / TILE_WIDTH_PX),
          );
          out[py * TILE_WIDTH_PX + px] =
            phase0[srcTile][(srcY % TILE_WIDTH_PX) * TILE_WIDTH_PX + (srcX % TILE_WIDTH_PX)];
        }
      }
      return out;
    }));
}

/** Banks 0.. from phase 0 under one fill mode. The single dispatch every door shares. */
function phaseBanksFrom(
  spec: Pick<BgOverrideBand, 'cols' | 'rows' | 'axis'>, phase0: readonly number[][],
  fill: BandPhaseFill,
): number[][][] {
  switch (fill) {
    case 'copy':
      return Array.from({ length: BGANIM_PHASE_BANKS },
        () => cloneBgOverride(phase0 as number[][]));
    case 'blank':
      return [cloneBgOverride(phase0 as number[][]),
        ...blankPhases(bandTileCount(spec)).slice(1)];
    case 'shift':
      return shiftedPhaseBanks(spec, phase0);
    default:
      throw new BgOverrideError(
        `unknown phase fill mode ${JSON.stringify(fill)}: the modes are 'copy', 'blank' and ` +
        "'shift'. A silent fallback here would fill someone's banks with art they did not pick.",
      );
  }
}

/** What an author picks when creating a band; everything else is derived. */
export interface NewBandSpec {
  cols: number;
  rows: number;
  /**
   * Omit for a blank band (all-zero art in every bank). When given it must
   * already be `BGANIM_PHASE_BANKS` banks of `cols*rows` tiles of
   * `TILE_PIXELS` values — the validator says so precisely if it is not.
   */
  phases?: number[][][];
  /**
   * How banks 1.. are filled when `phases` is omitted (default 'blank', which
   * is what an omitted `phases` has always meant). A blank band's phase 0 is
   * blank art, so every mode agrees here — the option exists so the one
   * authoring surface offers the same three answers at both doors. Giving it
   * TOGETHER with `phases` is refused: `phases` already spells every bank.
   */
  phaseFill?: BandPhaseFill;
  /**
   * Which way the band moves. Omit to leave the key out, so the document tracks
   * the consumer's default (`horizontal`). It is read BEFORE the fill runs: on
   * `phaseFill: 'shift'` the axis chooses which roll generates banks 1..7, so a
   * band cannot be born vertical with horizontal phases.
   */
  axis?: BgAnimBandAxis;
  /** Omit to leave the key out, so the document tracks the consumer's default. */
  driver?: BgAnimDriver;
  /** Omit to leave the key out. */
  rate_shift?: number;
}

/**
 * Build a new band.
 *
 * IT DOES NOT EMIT DEFAULTS IT WAS NOT GIVEN, and it never emits `slot_base`.
 * Writing `driver: "camera_x"` into a document that did not ask for it freezes
 * today's default into a file that should track the contract's, and `slot_base`
 * is derived from list order — the consumer only ever checks it against the
 * cursor, so spelling it out buys nothing and can only ever disagree.
 *
 * The band is checked through the codec's OWN validator rather than a second
 * copy of its rules: it is placed at slot 0 of a probe document whose static
 * blob is the band's own phase-0 art, which is exactly the prefix-identity
 * shape, so every geometry rule (power-of-two column bytes, `pattern_px`, the
 * bank count, 4bpp pixel range) is enforced by the one implementation that
 * already has aeon's citations attached to it.
 */
export function createBand(spec: NewBandSpec): BgOverrideBand {
  const n = bandTileCount(spec);
  if (spec.phases !== undefined && spec.phaseFill !== undefined) {
    throw new BgOverrideError(
      'refusing to create a band with BOTH `phases` and `phaseFill`: `phases` spells every bank ' +
      'already, so a fill mode beside it either agrees (and says nothing) or disagrees (and one ' +
      'of the two is silently ignored). Hand in phase 0 alone via a fill mode, or all the banks.',
    );
  }
  const phases = spec.phases
    ?? phaseBanksFrom(spec, blankPhases(n)[0], spec.phaseFill ?? 'blank');

  const band: BgOverrideBand = {
    cols: spec.cols,
    rows: spec.rows,
    // The period ALONG THE AXIS, so a vertical band's `pattern_px` is rows*8.
    // Derived through the codec so the two cannot disagree about which key it
    // reads; a literal `cols * TILE_WIDTH_PX` here was the horizontal-only shape.
    pattern_px: bandPatternPx(spec),
    phases,
  };
  if (spec.axis !== undefined) band.axis = spec.axis;
  if (spec.driver !== undefined) band.driver = spec.driver;
  if (spec.rate_shift !== undefined) band.rate_shift = spec.rate_shift;

  const issues = validateBandInIsolation(band);
  if (issues.length > 0) {
    throw new BgOverrideError('refusing to create a BgAnim band', issues);
  }
  return band;
}

/** `BGANIM_PHASE_BANKS` banks of `n` all-zero tiles. Every size read from the contract. */
function blankPhases(n: number): number[][][] {
  return Array.from({ length: BGANIM_PHASE_BANKS }, () =>
    Array.from({ length: n }, () => new Array<number>(TILE_PIXELS).fill(0)));
}

/**
 * Run the codec's validator over one band, by building the smallest document
 * that puts it in a legal position: at slot 0, over a blob that IS its phase-0
 * art, under a zeroed layout of the contract's own length.
 *
 * Issues come back with `anims[0].` prefixes because they came from the real
 * validator. That is the point — a second, band-only rule list beside it is how
 * the two drift.
 */
function validateBandInIsolation(band: BgOverrideBand): string[] {
  const phase0 = Array.isArray(band.phases) && Array.isArray(band.phases[0])
    ? band.phases[0] : [];
  // A spelled-out slot_base is a claim about the cursor, which is 0 here.
  const probeBand = band.slot_base === undefined ? band : { ...band, slot_base: 0 };
  return validateBgOverride({
    layout: new Array<number>(BG_LAYOUT_WORDS).fill(0),
    tiles: phase0,
    anims: [probeBand],
  });
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * One layout word that differs between the with-band and without-band states.
 *
 * BOTH VALUES ARE RECORDED, not a direction and a delta, so `insertBand` and
 * `removeBand` are literal inverses: one writes `withBandNt` everywhere, the
 * other writes `withoutBandNt` everywhere, over the same entry list.
 */
export interface BandLayoutRemap {
  /** Index into `doc.layout`. */
  index: number;
  /** The word when the band is present. */
  withBandNt: number;
  /** The word when the band is absent. */
  withoutBandNt: number;
}

/**
 * Everything adding or removing one band does to the other two keys, computed
 * against a document before anything is touched.
 *
 * A plan is symmetric: it describes the DIFFERENCE between the with-band and
 * without-band documents, and says nothing about which direction it is applied
 * in. That is what lets one plan serve both an add command's apply and its undo.
 */
export interface BandSlotPlan {
  /** Position in `anims`. */
  bandIndex: number;
  /** First slot the band covers, derived from the bands ahead of it. */
  slotBase: number;
  /** `cols * rows`. */
  tileCount: number;
  /**
   * Where the band's `tileCount` slots live in `tiles` when the band is ABSENT.
   *
   *   null    NOWHERE. The without-band document does not carry this art at
   *           all: the band's phase-0 art arrives from outside, so `tiles`
   *           GROWS by `tileCount` in the with-band direction and SHRINKS by it
   *           in the without-band direction. This is insert/remove.
   *
   *   index   The static blob index the same art occupies when the band is
   *           absent. Nothing is created and nothing is destroyed — the slots
   *           MOVE between the front (where bands must live) and this static
   *           position, so `tiles.length` is UNCHANGED in both directions.
   *           This is promote/demote.
   *
   * The field is required rather than optional on purpose: every plan has to
   * say which of the two it is, and a new construction site that forgets fails
   * to compile rather than defaulting into the growing kind.
   */
  staticBase: number | null;
  /** Every layout word that differs between the two states. */
  layout: BandLayoutRemap[];
  /**
   * Layout words naming a tile index past the end of `tiles`. They are left
   * exactly as they are — there is no tile for them to follow — and counted so
   * a caller can say so rather than discover it later.
   */
  danglingRefs: number;
  /**
   * Layout cells that name a slot INSIDE the band. On a removal these are the
   * cells whose art is being deleted; on an insertion this is always 0, because
   * the inserted art arrives unreferenced.
   */
  referencingCells: number;
}

/** How a removal treats layout cells that draw the band being removed. */
export interface RemoveBandOptions {
  /**
   * Repoint cells that draw the band to the blank word (0) instead of refusing.
   *
   * OFF BY DEFAULT AND DELIBERATELY UNAVOIDABLE. A band exists in order to be
   * drawn, so removing one usually does destroy visible art — the real
   * b0e5a661 document draws its two bands in 2560 of its 4096 cells. Blanking
   * them silently would be an unrequested edit to the author's picture; a bare
   * refusal with no way through would make the command useless for the only
   * case that occurs. So the caller states which it meant, and the error says
   * how many cells are at stake.
   */
  blankReferencingCells?: boolean;
}

function requireOwnedArrays(doc: BgOverrideDocument): { layout: number[]; tiles: number[][] } {
  if (!Array.isArray(doc.layout) || !Array.isArray(doc.tiles)) {
    throw new BgOverrideError(
      'refusing to change the bands of a document whose `layout` or `tiles` is not an array. ' +
      'The three owned keys are edited as one unit, so a band edit cannot proceed over a ' +
      'document the codec would not have accepted in the first place.',
    );
  }
  return { layout: doc.layout, tiles: doc.tiles };
}

/**
 * The layout rewrite for a tile-index permutation.
 *
 * `moved(idx)` returns the tile's new index, or `null` when the tile is going
 * away. Everything about the word format is derived from the contract, and both
 * escapes below are the consumer's, not conveniences:
 *
 *   • a word of EXACTLY 0 is passed through unrebased by the consumer and draws
 *     VRAM tile 0. It is not a reference to `tiles[0]`, so it must not be
 *     renumbered — and a nonzero word must never BECOME 0, because that silently
 *     turns a drawn cell blank.
 *   • the bits above `LAYOUT_TILE_INDEX_MASK` are the nametable's own attributes
 *     (priority, palette line, flips). The consumer preserves them; so does this.
 */
function planLayoutRemap(
  layout: readonly number[],
  tileCount: number,
  moved: (idx: number) => number | null,
  /**
   * Which side `moved` computes. An insertion maps the CURRENT (without-band)
   * indices forward; a removal maps the CURRENT (with-band) indices back.
   * Naming the side is what lets ONE entry shape serve both directions.
   */
  movedSide: 'withBand' | 'withoutBand',
  onRemoved: 'refuse' | 'blank',
): { entries: BandLayoutRemap[]; danglingRefs: number; referencingCells: number } {
  const entries: BandLayoutRemap[] = [];
  let danglingRefs = 0;
  let referencingCells = 0;

  for (let i = 0; i < layout.length; i++) {
    const word = layout[i];
    if (word === 0) continue;                       // the consumer's blank escape
    const idx = word & LAYOUT_TILE_INDEX_MASK;
    if (idx >= tileCount) { danglingRefs++; continue; }

    const to = moved(idx);
    if (to === null) {
      // Only a removal reaches this: the tile itself is going away.
      referencingCells++;
      if (onRemoved === 'refuse') continue;         // counted; the caller is about to be told
      entries.push({ index: i, withBandNt: word, withoutBandNt: 0 });
      continue;
    }
    if (to === idx) continue;                       // this cell does not move

    if (to > LAYOUT_TILE_INDEX_MASK) {
      throw new BgOverrideError(
        `layout[${i}] would need tile index ${to}, past the ${LAYOUT_TILE_INDEX_MASK} a nametable ` +
        'word can carry. The blob would have to exceed the capacity the plan already checked, so ' +
        'this is a bug in the plan rather than in the document.',
      );
    }
    const next = (word & ~LAYOUT_TILE_INDEX_MASK) | to;
    if (next === 0) {
      throw new BgOverrideError(
        `layout[${i}] draws tile ${idx} with no attribute bits set, and renumbering it to tile ` +
        `${to} would make the whole word 0, which the consumer reads as the BLANK escape, not as ` +
        'tile 0. The nametable cannot express "tile 0, no attributes", so that cell would silently ' +
        'go blank. Give it a palette line, or order the bands so the tile does not land on 0.',
      );
    }
    entries.push(movedSide === 'withBand'
      ? { index: i, withBandNt: next, withoutBandNt: word }
      : { index: i, withBandNt: word, withoutBandNt: next });
  }
  return { entries, danglingRefs, referencingCells };
}

/**
 * Everything a band ARRIVING in `anims` must satisfy however its art gets
 * there, checked before anything is touched.
 *
 * Shared by insertion and promotion deliberately. The two differ in exactly one
 * thing — where the phase-0 art comes from, outside the blob or inside it — and
 * every other bound (the position, the band ceiling, the band's own geometry,
 * a `slot_base` that tries to place rather than agree) is the same rule. A
 * second copy of these four refusals is how the two entry points drift into
 * accepting different documents.
 */
function planBandArrival(
  doc: BgOverrideDocument, band: BgOverrideBand, bandIndex: number | undefined, verb: string,
): { layout: number[]; tiles: number[][]; bands: readonly BgOverrideBand[]; at: number;
     n: number; slotBase: number } {
  const { layout, tiles } = requireOwnedArrays(doc);
  const bands = documentBands(doc);
  const at = bandIndex ?? bands.length;

  if (!Number.isInteger(at) || at < 0 || at > bands.length) {
    throw new BgOverrideError(
      `cannot ${verb} a band at position ${at}: the document has ${bands.length} band(s), so the ` +
      `legal positions are 0..${bands.length}.`,
    );
  }
  if (bands.length + 1 > BGANIM_MAX_BANDS) {
    throw new BgOverrideError(
      `cannot add a ${bands.length + 1}th band: the engine sizes BgAnim_LastStep for at most ` +
      `BGANIM_MAX_BANDS = ${BGANIM_MAX_BANDS}. Raising that ceiling is a three-file engine change ` +
      '(two .emp constants plus the emitter cap, drift-gated together), never a writer decision.',
    );
  }

  const bandIssues = validateBandInIsolation(band);
  if (bandIssues.length > 0) {
    throw new BgOverrideError(`refusing to ${verb} an invalid BgAnim band`, bandIssues);
  }

  const n = bandTileCount(band);
  const slotBase = bandSlotBases(bands)[at];

  if (band.slot_base !== undefined && band.slot_base !== slotBase) {
    throw new BgOverrideError(
      `the band spells slot_base ${JSON.stringify(band.slot_base)} but list position ${at} puts it ` +
      `at slot ${slotBase}. Bands pack contiguously from slot 0 in list order, so slot_base is ` +
      'derived and may only be spelled out to agree; it cannot place a band.',
    );
  }
  return { layout, tiles, bands, at, n, slotBase };
}

/**
 * Plan the insertion of `band` at `bandIndex` (default: after the last band).
 *
 * Refuses BEFORE touching anything, on every bound the resulting document could
 * not satisfy: the band ceiling, the blob capacity, a `slot_base` that disagrees
 * with where list order puts the band, and a layout word the renumbering could
 * not express. Each bound is read from the contract.
 *
 * THE BLOB GROWS. The band's phase-0 art comes from outside the document, so
 * this is the entry point a full blob has no room for — see `planBandPromotion`
 * for the one that does not grow it.
 */
export function planBandInsertion(
  doc: BgOverrideDocument, band: BgOverrideBand, bandIndex?: number,
): BandSlotPlan {
  const { layout, tiles, at, n, slotBase } = planBandArrival(doc, band, bandIndex, 'insert');

  if (tiles.length + n > BG_TILE_CAPACITY) {
    throw new BgOverrideError(
      `the band needs ${n} slot(s) at the front of a ${tiles.length}-tile blob, which would make ` +
      `${tiles.length + n}, over the BG tile capacity of ${BG_TILE_CAPACITY}. Animated slots are a ` +
      'PREFIX of `tiles` rather than an addition to it, so they are counted here exactly once.',
    );
  }

  // Static tiles at or after the insertion point slide up by n; nothing is lost.
  const { entries, danglingRefs, referencingCells } = planLayoutRemap(
    layout, tiles.length, idx => (idx < slotBase ? idx : idx + n), 'withBand', 'refuse',
  );
  return {
    bandIndex: at, slotBase, tileCount: n, staticBase: null,
    layout: entries, danglingRefs, referencingCells,
  };
}

/**
 * Plan the removal of the band at `bandIndex`.
 *
 * The band's slots leave the blob entirely, which is what makes removal the
 * exact inverse of insertion. Surviving tiles slide back down, and every layout
 * word following one follows it.
 */
export function planBandRemoval(
  doc: BgOverrideDocument, bandIndex: number, options: RemoveBandOptions = {},
): BandSlotPlan {
  const { layout, tiles } = requireOwnedArrays(doc);
  const bands = documentBands(doc);

  if (!Number.isInteger(bandIndex) || bandIndex < 0 || bandIndex >= bands.length) {
    throw new BgOverrideError(
      `cannot remove band ${bandIndex}: the document has ${bands.length} band(s)` +
      (bands.length === 0 ? ', so there is nothing to remove.' : `, indexed 0..${bands.length - 1}.`),
    );
  }

  const n = bandTileCount(bands[bandIndex]);
  const slotBase = bandSlotBases(bands)[bandIndex];
  const blank = options.blankReferencingCells === true;

  const { entries, danglingRefs, referencingCells } = planLayoutRemap(
    layout, tiles.length,
    idx => {
      if (idx < slotBase) return idx;
      if (idx < slotBase + n) return null;          // inside the band: the art is going away
      return idx - n;
    },
    'withoutBand', blank ? 'blank' : 'refuse',
  );

  if (referencingCells > 0 && !blank) {
    throw new BgOverrideError(
      `band ${bandIndex} covers slots ${slotBase}..${slotBase + n} and ${referencingCells} layout ` +
      'cell(s) draw them. Removing the band deletes that art, so those cells have nothing left to ' +
      'name. Aurora will not decide that for you: remove the band with blankReferencingCells to ' +
      'turn those cells blank (undoable, like any other edit), or repoint them at static tiles ' +
      'first if the picture is meant to survive.',
    );
  }

  return {
    bandIndex, slotBase, tileCount: n, staticBase: null,
    layout: entries, danglingRefs, referencingCells,
  };
}

// ---------------------------------------------------------------------------
// Promotion and demotion — the pair that does not change `tiles.length`
//
// WHY THIS EXISTS. `insertBand` GROWS the blob, because a band's phase-0 art
// arrives from outside it. aeon's live document is at BG_TILE_CAPACITY exactly
// (448/448 at aeon 9b3f11f6), so insertion refuses there for every band size
// including 1x1 and BgAnim authoring is impossible on the file that ships.
//
// Promotion is the other entry point on the same machinery: take a range of
// tiles the blob ALREADY carries and declare it animated. The band's phase 0 IS
// the static art of the slots it covers, so those tiles are already present —
// nothing is added, and `tiles.length` is unchanged. What must happen is that
// the range MOVES to the front, because bands pack contiguously from slot 0
// (aeon `inject_editor_bg.py` asserts that twice, in `validate_band_coherence`
// and again in `main`). That move is the same whole-blob renumber plus layout
// rewrite an insertion does, entered from the other end — so it runs through
// `planLayoutRemap`, unchanged, exactly as insertion does.
//
// DEMOTION LOSES NOTHING, and that is the pair's real advantage over
// insert/remove. `removeBand` deletes the band's slots from the blob, so it
// destroys art and must refuse or blank. Demotion hands the same slots back to
// the static blob at a static index, so every cell that drew the band keeps
// drawing exactly the same art — the picture is unchanged in BOTH directions,
// and there is no `blankReferencingCells` here because there is nothing to
// blank. If a demotion ever needed one, something has gone wrong.
// ---------------------------------------------------------------------------

/** What an author picks when promoting a static tile range; the art is already there. */
export interface PromoteBandSpec {
  cols: number;
  rows: number;
  /**
   * How banks 1.. are filled from the promoted range (default 'copy', which is
   * exactly what promotion has always done). Phase 0 is READ from the blob in
   * every mode — the fill only ever decides the banks the range does not pin.
   */
  phaseFill?: BandPhaseFill;
  /**
   * Which way the promoted band moves. Omit to leave the key out. It reaches
   * `phaseBanksFrom` with the rest of the spec, so `phaseFill: 'shift'` on a
   * vertical promotion generates a VERTICAL roll — the pair that would otherwise
   * bake as a shimmer.
   */
  axis?: BgAnimBandAxis;
  /** Omit to leave the key out, so the document tracks the consumer's default. */
  driver?: BgAnimDriver;
  /** Omit to leave the key out. */
  rate_shift?: number;
}

/**
 * The static range a promotion may take, checked once for every door that needs
 * it (`bandFromStaticTiles` reads the art; `planBandPromotion` places it).
 *
 * Two rules, and both are the prefix rule seen from different sides:
 *   • the range must fit inside `tiles`, or there is no art to promote;
 *   • it must lie entirely in the STATIC region, past every slot the existing
 *     bands already own. Slots below `animatedSlotCount` belong to a band; a
 *     range overlapping them would be promoting art that is already animated.
 */
function requirePromotableRange(
  doc: BgOverrideDocument, staticBase: number, n: number,
): { tiles: number[][]; animated: number } {
  const { tiles } = requireOwnedArrays(doc);
  const animated = animatedSlotCount(documentBands(doc));

  if (!Number.isInteger(staticBase) || staticBase < 0) {
    throw new BgOverrideError(
      `cannot promote from tile ${JSON.stringify(staticBase)}: the static base is an index into ` +
      '`tiles`, so it must be a non-negative integer.',
    );
  }
  if (staticBase + n > tiles.length) {
    throw new BgOverrideError(
      `cannot promote tiles ${staticBase}..${staticBase + n}: the static blob has only ` +
      `${tiles.length} tiles. Promotion declares art the blob ALREADY carries to be animated; it ` +
      'never adds any, so the whole range has to be there first.',
    );
  }
  if (staticBase < animated) {
    throw new BgOverrideError(
      `cannot promote tiles ${staticBase}..${staticBase + n}: slots 0..${animated} already belong ` +
      'to the bands this document carries. Animated slots are a PREFIX of `tiles`, so a promotable ' +
      'range starts at or after the end of that prefix; promoting art that is already animated ' +
      'would mean two bands DMAing over the same slots.',
    );
  }
  return { tiles, animated };
}

/**
 * Build the band a promotion of `tiles[staticBase : staticBase+n]` would create,
 * reading its phase-0 art straight out of the blob.
 *
 * PHASE 0 IS NOT A CHOICE. It is the static art of the slots the band covers,
 * so it is read, never supplied — a phase 0 that differed from the blob would
 * either break prefix identity or change the picture at rest, and both of those
 * bake cleanly.
 *
 * BANKS 1..N-1 DEFAULT TO A COPY OF PHASE 0, so a promoted band is VISUALLY
 * INERT until it is authored: it draws the promoted art at every step, which is
 * what it drew before. Blank banks would make the picture break on the band's
 * second phase, an unrequested edit to the author's background and the exact
 * defect class this surface is built against. Generating banks 1..N-1 as
 * pre-shifted copies (the contract calls `phases` "pre-shifted art 1px apart")
 * was MEASURED and rejected AS THE DEFAULT: no horizontal offset, under either
 * tile ordering, reproduces any bank of either real b0e5a661 band from its bank
 * 0 — the shipped banks are hand-drawn frames, not shifts, so a silently
 * generated shift would be art Aurora invented rather than art the author drew.
 * As an EXPLICIT `phaseFill: 'shift'` it is the authoring primitive the contract
 * describes — the one fill that makes a saved band move with no further work —
 * and picking it is the author's sentence, never this function's.
 *
 * An author with real frames does not go through here: build the band, keep
 * `phases[0]` equal to the blob range, and hand it to `planBandPromotion`, which
 * checks exactly that.
 */
export function bandFromStaticTiles(
  doc: BgOverrideDocument, staticBase: number, spec: PromoteBandSpec,
): BgOverrideBand {
  const n = bandTileCount(spec);
  const { tiles } = requirePromotableRange(doc, staticBase, n);
  const phase0 = cloneBgOverride(tiles.slice(staticBase, staticBase + n));
  const { phaseFill, ...bandSpec } = spec;
  return createBand({
    ...bandSpec,
    phases: phaseBanksFrom(spec, phase0, phaseFill ?? 'copy'),
  });
}

/** Deep value equality over tile art, spelled the way the codec's prefix check spells it. */
function sameTiles(a: readonly number[][], b: readonly number[][]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Plan the promotion of `tiles[staticBase : staticBase+n]` into `band`, placed
 * at `bandIndex` (default: after the last band).
 *
 * `tiles.length` IS UNCHANGED. The range is not copied to the front, it MOVES
 * there: everything between the band's slot base and the range slides up by n
 * to make room, and the range lands at the slot base. That is a permutation of
 * the blob, so the capacity check insertion needs has nothing to check here —
 * which is the whole point, and why this works on a full document.
 */
export function planBandPromotion(
  doc: BgOverrideDocument, band: BgOverrideBand, staticBase: number, bandIndex?: number,
): BandSlotPlan {
  const { layout, tiles, at, n, slotBase } = planBandArrival(doc, band, bandIndex, 'promote');
  requirePromotableRange(doc, staticBase, n);

  // THE PROMOTION RULE. A band's phase 0 is the rest state of the slots it
  // covers, and promotion is the claim that those slots are this range — so the
  // band's phase-0 art has to BE the range, byte for byte. Anything else is
  // either a picture change smuggled in as a structural edit, or a prefix
  // identity violation, and both of those bake cleanly.
  const phase0 = Array.isArray(band.phases) ? band.phases[0] : undefined;
  if (!Array.isArray(phase0) || !sameTiles(phase0 as number[][], tiles.slice(staticBase, staticBase + n))) {
    throw new BgOverrideError(
      `refusing to promote tiles ${staticBase}..${staticBase + n}: the band's phases[0] is not that ` +
      'art. Promotion declares an existing static range animated, so phase 0 is READ from the blob ' +
      'rather than supplied; build the band with bandFromStaticTiles, or keep phases[0] equal to ' +
      'the range and author banks 1.. only. A band whose phase 0 differs would change the picture ' +
      'at rest, or would break `phases[0] == tiles[slot_base : slot_base + cols*rows]`, and both of ' +
      'those bake cleanly.',
    );
  }

  // The permutation, and it is a bijection of [0, tiles.length) onto itself:
  //   [0, slotBase)                 stay
  //   [slotBase, staticBase)        slide up by n, making room at the front
  //   [staticBase, staticBase + n)  the promoted range, landing at slotBase
  //   [staticBase + n, len)         stay
  // Nothing maps to null, so nothing is destroyed and `referencingCells` is 0:
  // cells that drew the promoted tiles now draw the band's slots, which is how
  // a promoted band comes to be drawn at all.
  const { entries, danglingRefs, referencingCells } = planLayoutRemap(
    layout, tiles.length,
    idx => {
      if (idx < slotBase) return idx;
      if (idx < staticBase) return idx + n;
      if (idx < staticBase + n) return slotBase + (idx - staticBase);
      return idx;
    },
    'withBand', 'refuse',
  );
  return {
    bandIndex: at, slotBase, tileCount: n, staticBase,
    layout: entries, danglingRefs, referencingCells,
  };
}

/**
 * Plan the demotion of the band at `bandIndex` back to plain static art, landing
 * its slots at `staticBase` (default: the front of the static region, which is
 * where they end up when the last band is demoted without moving at all).
 *
 * THE EXACT INVERSE OF A PROMOTION with the same `staticBase`, and unlike
 * `planBandRemoval` it is IMAGE-PRESERVING: the band's phase-0 art stays in the
 * blob, so every cell that drew the band goes on drawing the same picture from a
 * static slot. There is no art to lose and therefore no refusal to make.
 */
export function planBandDemotion(
  doc: BgOverrideDocument, bandIndex: number, staticBase?: number,
): BandSlotPlan {
  const { layout, tiles } = requireOwnedArrays(doc);
  const bands = documentBands(doc);

  if (!Number.isInteger(bandIndex) || bandIndex < 0 || bandIndex >= bands.length) {
    throw new BgOverrideError(
      `cannot demote band ${bandIndex}: the document has ${bands.length} band(s)` +
      (bands.length === 0 ? ', so there is nothing to demote.' : `, indexed 0..${bands.length - 1}.`),
    );
  }

  const n = bandTileCount(bands[bandIndex]);
  const slotBase = bandSlotBases(bands)[bandIndex];
  // Where the art goes when it stops being animated. The default is the first
  // slot the shortened animated prefix no longer covers — for the LAST band
  // that is `slotBase` itself, so demoting the newest band moves no tile at all.
  const animatedAfter = animatedSlotCount(bands) - n;
  const to = staticBase ?? animatedAfter;

  if (!Number.isInteger(to) || to < animatedAfter) {
    throw new BgOverrideError(
      `cannot demote band ${bandIndex} to tile ${JSON.stringify(to)}: with this band gone the ` +
      `remaining bands own slots 0..${animatedAfter}, and demoted art is STATIC: it must land at ` +
      `or after ${animatedAfter}, or it would sit inside another band's prefix.`,
    );
  }
  if (to + n > tiles.length) {
    throw new BgOverrideError(
      `cannot demote band ${bandIndex} to tiles ${to}..${to + n}: the blob has ${tiles.length} ` +
      'tiles and demotion does not grow it: the band\'s slots MOVE into the static region rather ' +
      'than being added to it, so the whole range must already fit.',
    );
  }

  // The inverse permutation of the promotion above, read on the with-band
  // document: the band's slots go to `to`, and everything between them and
  // there slides back down by n to close the gap.
  const { entries, danglingRefs, referencingCells } = planLayoutRemap(
    layout, tiles.length,
    idx => {
      if (idx < slotBase) return idx;
      if (idx < slotBase + n) return to + (idx - slotBase);
      if (idx < to + n) return idx - n;
      return idx;
    },
    'withoutBand', 'refuse',
  );
  return {
    bandIndex, slotBase, tileCount: n, staticBase: to,
    layout: entries, danglingRefs, referencingCells,
  };
}

// ---------------------------------------------------------------------------
// Applying a plan — the two halves, and they are inverses
// ---------------------------------------------------------------------------

/**
 * Re-derive the `slot_base` key of every band that spells one.
 *
 * Only bands that ALREADY carry the key are touched: injecting it into a band
 * that left it out would write a derived value into someone's file for no
 * reason, and the codec's whole posture is that a save of an untouched document
 * is not a diff.
 *
 * The copy is a SPREAD, which is total. A band may carry keys Aurora does not
 * model; a field-by-field rebuild here is precisely the copier that would drop
 * them, untested, in a way the round-trip tests next door could not see.
 */
function resyncSlotBases(bands: readonly BgOverrideBand[]): BgOverrideBand[] {
  let cursor = 0;
  return bands.map(band => {
    const n = bandTileCount(band);
    const out = band.slot_base !== undefined && band.slot_base !== cursor
      ? { ...band, slot_base: cursor }
      : band;
    cursor += n;
    return out;
  });
}

/**
 * Rebuild a document around new owned keys, carrying everything else through.
 *
 * The spread is the round-trip: `palette`, `palette_line` and every key Aurora
 * has never heard of survive because they are never enumerated. An empty band
 * list DELETES `anims` rather than writing `[]` — the no-bands document has no
 * such key at all, which is what aeon's own gate asserts of the shipped file
 * and what the codec refuses to write.
 */
function withOwnedKeys(
  doc: BgOverrideDocument, layout: number[], tiles: number[][], bands: BgOverrideBand[],
): BgOverrideDocument {
  const out: BgOverrideDocument = { ...doc, layout, tiles };
  if (bands.length > 0) out.anims = bands;
  else delete out.anims;
  return out;
}

/**
 * The WITH-BAND document: band spliced into `anims`, its phase-0 art placed in
 * `tiles` at `slotBase`, and every planned layout word moved to its with-band
 * value.
 *
 * ONE IMPLEMENTATION FOR BOTH KINDS OF PLAN, differing in a single line. When
 * `plan.staticBase` is null the art comes from outside and `tiles` grows; when
 * it is an index the art is already in the blob at that index and MOVES, so the
 * length is unchanged. Everything else — the `anims` splice, the slot_base
 * resync, the layout rewrite, the round-trip of every unowned key — is the same
 * code in both cases, which is the only way the two operations cannot drift
 * apart on the arithmetic they share.
 *
 * The art goes in as a DEEP COPY. Sharing the arrays would make `tiles` and
 * `phases[0]` the same objects, which reads as prefix identity holding for free
 * and stops being true the moment anything serializes, clones or edits either
 * side. They are equal by value here because the invariant says they must be,
 * not because they are the same memory.
 */
export function applyWithBand(
  doc: BgOverrideDocument, plan: BandSlotPlan, band: BgOverrideBand,
): BgOverrideDocument {
  const { layout, tiles } = requireOwnedArrays(doc);

  const bands = documentBands(doc).slice();
  bands.splice(plan.bandIndex, 0, band);

  const phase0 = Array.isArray(band.phases) ? band.phases[0] : undefined;
  if (!Array.isArray(phase0) || phase0.length !== plan.tileCount) {
    throw new BgOverrideError(
      `cannot add a band whose phases[0] holds ${Array.isArray(phase0) ? phase0.length : 'no'} ` +
      `tile(s) where the plan reserves ${plan.tileCount} slot(s). phases[0] IS the static art of ` +
      'the slots the band covers, so the two cannot differ.',
    );
  }
  const nextTiles = tiles.slice();
  // A promotion MOVES the art: take it out of the static region first, so the
  // insert below is a relocation rather than a duplication. slotBase <= staticBase
  // always (the range is past the animated prefix), so removing first leaves
  // slotBase pointing where it did.
  if (plan.staticBase !== null) nextTiles.splice(plan.staticBase, plan.tileCount);
  nextTiles.splice(plan.slotBase, 0, ...cloneBgOverride(phase0));

  const nextLayout = layout.slice();
  for (const e of plan.layout) nextLayout[e.index] = e.withBandNt;

  return withOwnedKeys(doc, nextLayout, nextTiles, resyncSlotBases(bands));
}

/** The WITHOUT-BAND document. The exact inverse of `applyWithBand` over the same plan. */
export function applyWithoutBand(doc: BgOverrideDocument, plan: BandSlotPlan): BgOverrideDocument {
  const { layout, tiles } = requireOwnedArrays(doc);

  const bands = documentBands(doc).slice();
  bands.splice(plan.bandIndex, 1);

  const nextTiles = tiles.slice();
  const freed = nextTiles.splice(plan.slotBase, plan.tileCount);
  // A demotion hands the same slots back to the static blob rather than dropping
  // them. THIS LINE IS WHY DEMOTION IS LOSSLESS: the art never leaves `tiles`.
  if (plan.staticBase !== null) nextTiles.splice(plan.staticBase, 0, ...freed);

  const nextLayout = layout.slice();
  for (const e of plan.layout) nextLayout[e.index] = e.withoutBandNt;

  return withOwnedKeys(doc, nextLayout, nextTiles, resyncSlotBases(bands));
}

/**
 * The four named doors, each asserting which KIND of plan it was handed.
 *
 * The appliers above are deliberately mode-agnostic so history can run either
 * operation through one dispatch. These wrappers are where a plan built by one
 * planner and applied by the other function pair is caught: an insertion plan
 * handed to `promoteBand` would grow a full blob past capacity, and a promotion
 * plan handed to `removeBand` would delete art the caller was told is preserved.
 * Both are silent-corruption shapes, so neither is allowed to be a no-op.
 */
function requirePlanKind(plan: BandSlotPlan, kind: 'moves' | 'grows', what: string): void {
  const moves = plan.staticBase !== null;
  if (moves !== (kind === 'moves')) {
    throw new BgOverrideError(
      `refusing to ${what}: this plan ${moves ? 'MOVES' : 'CREATES/DESTROYS'} the band's slots ` +
      `(staticBase ${JSON.stringify(plan.staticBase)}), so it came from ` +
      `${moves ? 'planBandPromotion/planBandDemotion' : 'planBandInsertion/planBandRemoval'}. ` +
      'The two kinds are not interchangeable: one changes `tiles.length` and the other does not.',
    );
  }
}

/** Add a band whose art comes from outside the blob. `tiles` grows by `tileCount`. */
export function insertBand(
  doc: BgOverrideDocument, plan: BandSlotPlan, band: BgOverrideBand,
): BgOverrideDocument {
  requirePlanKind(plan, 'grows', 'insert a band');
  return applyWithBand(doc, plan, band);
}

/** Remove a band and its slots. `tiles` shrinks by `tileCount`; the art is gone. */
export function removeBand(doc: BgOverrideDocument, plan: BandSlotPlan): BgOverrideDocument {
  requirePlanKind(plan, 'grows', 'remove a band');
  return applyWithoutBand(doc, plan);
}

/** Declare an existing static range animated. `tiles.length` is unchanged. */
export function promoteBand(
  doc: BgOverrideDocument, plan: BandSlotPlan, band: BgOverrideBand,
): BgOverrideDocument {
  requirePlanKind(plan, 'moves', 'promote static tiles to a band');
  return applyWithBand(doc, plan, band);
}

/** Hand a band's slots back to the static blob. `tiles.length` is unchanged; no art is lost. */
export function demoteBand(doc: BgOverrideDocument, plan: BandSlotPlan): BgOverrideDocument {
  requirePlanKind(plan, 'moves', 'demote a band to static tiles');
  return applyWithoutBand(doc, plan);
}

/** Re-exported so callers of this module do not need two imports to name a driver. */
export { BGANIM_DRIVERS };
