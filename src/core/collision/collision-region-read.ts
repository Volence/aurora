// THE READ HALF OF paint_collision — and the two things it must not lie about.
//
// An agent judging a layout should read DATA, not screenshots. This module is
// what `editor/get_collision_region` returns, kept out of the handler so it can
// be tested without an IPC round trip and so the ascii view has one home.
//
// ═══ PROBLEM 1: A CELL IS FOUR SUB-TILES, AND THEY CAN DISAGREE ═══
//
// A collision plane is NOT stored at cell resolution. It is stored at 8px TILE
// resolution — `SECTION_PLANE_WORDS = SECTION_TILES_WIDE * SECTION_TILES_HIGH`
// (collision-cell-resolve.ts) — and a 16px cell is the 2x2 block of sub-tiles
// `cellTileIndices` names. Every Aurora writer that means "a cell" writes all
// four (`paintCollisionRectEntries`, `MapViewport.paintCollisionCell`,
// `buildRegionWriteCommand`), so on Aurora-authored data the four always agree.
//
// They are NOT guaranteed to agree, and the guarantee is not Aurora's to make:
//
//   • `project/aeon/load.ts` fills `engineCollision` from the baked strips ONE
//     8px TILE AT A TIME (`engineColl[row * SECTION_TILES_WIDE + col] =
//     stripData.collision[row * STRIP_COLS + col]`). Four independent source
//     bytes per cell, and nothing in Aurora checks they match.
//   • a saved `.collattr.bin` is likewise a per-8px-tile 16-bit plane, so a
//     hand-edited or foreign-produced file can carry a non-uniform cell.
//
// So "the four agree" is a property of the DATA, not an invariant of the code,
// and a reader that samples one of them and calls it the cell is reporting a
// guess as a measurement. That is exactly what the screen already does:
// `OverlayRenderer.drawCollisionOverlay` samples `(cr * 2) * SECTION_TILES_WIDE
// + (cc * 2)` — the top-left sub-tile, alone. Reproducing that in a DATA read
// would be worse than in a picture, because the data read is the instrument an
// agent uses to VERIFY, and an instrument that averages away disagreement
// cannot report the one thing it was built to catch.
//
// THE ANSWER: a non-uniform cell reports `word: null`, `mixed: true` and its
// four `sub` words, and carries NO unpacked fields at all. There is no single
// shape/flip/solidity for such a cell, so inventing one would be the same lie
// in a friendlier shape. `debug-hooks.collRect` reached the identical
// conclusion for the same reason ("a flip that wrote a cell non-uniformly
// across its four tiles is VISIBLE here instead of being averaged away by a
// cell-level accessor") — this is that ruling on the agent road.
//
// ═══ PROBLEM 2: BITS 15:14 ARE NOT OURS TO STRIP ═══
//
// `unpackCollisionCell` reads bits 13:0 and drops 15:14. So the unpacked view
// is LOSSY, and a read that returned only the unpacked view would teach its
// consumers those bits do not exist. In aeon's OTHER baker (`bake_cell`,
// collision_pipeline.py @ b76576ea) they are path-B solidity; in the per-plane
// word Aurora feeds (`bake_plane_cell`) they are unassigned but PRESERVED
// through save/load — see docs/reviews/2026-08-28-collision-word-preservation.md §2.
//
// So every cell carries the RAW stored `word` alongside the unpacked fields.
// The word is never re-packed from the unpacked view (that would silently strip
// them), and the reply reports `cellsWithUnownedBits` — computed through
// `unownedCollisionBits`, whose mask is DERIVED from `packCollisionCell` — so
// an agent that only ever reads the reply still learns the bits are there.
//
// ═══ THE ASCII VIEW SHOWS THE GEOMETRY THE OVERLAY DRAWS ═══
//
// Glyphs come from the resolved profile's `heights` through the SAME
// `columnSolidRun` the canvas overlay draws with (collision-shape-draw.ts →
// collision-render.ts), so the picture and the text agree by construction
// rather than by a second convention. In particular no angle handedness is
// asserted here: `collision-angle-mark.ts` is the ONE home for that, and a
// second copy of it in an ascii renderer is precisely how the picker and the
// map came to disagree once already.

import type { CollisionProfileSet, Solidity } from './collision-model';
import { cellTileIndices } from './collision-cell';
import { unpackCollisionCell } from './collision-cell-word';
import { resolveCell } from './collision-cell-resolve';
import { columnSolidRun } from './collision-render';
import { unownedCollisionBits } from '../editing/collision-word';
import { SECTION_TILES_WIDE, SECTION_TILES_HIGH } from '../model/s4-types';

/** A section's extent in 16px COLLISION CELLS. Derived from the tile extent and
 *  the 2-tile cell, never typed: `cellTileIndices` multiplies a cell coord by 2,
 *  so the cell space is exactly half the tile space on each axis. These are the
 *  same numbers `validatePaintCollisionRect` is handed as `cellsW`/`cellsH`, and
 *  `collision-region-read.test.ts` drives both to prove they still agree. */
export const SECTION_CELLS_WIDE = SECTION_TILES_WIDE / 2;
export const SECTION_CELLS_HIGH = SECTION_TILES_HIGH / 2;

/**
 * The most cells one `get_collision_region` call will return.
 *
 * A CHOSEN budget, not a derived one, and it is stated rather than implied: a
 * full section is 128x128 = 16,384 cells, and an object per cell at that size
 * is a multi-megabyte JSON-RPC reply for a question ("did my loop land?") that
 * is answered by a 16x16 window. 4,096 is the same per-call cell count
 * `get_nametable_region` allows in tiles (64x64), so the two region reads cost
 * an agent the same order of reply. A whole section is four calls, and the
 * refusal says so.
 */
export const COLLISION_REGION_MAX_CELLS = 4096;

/** One 16px cell as `get_collision_region` reports it.
 *
 *  `word` is the RAW stored sixteen bits — every bit, including any no Aurora
 *  field owns — and is null exactly when `mixed` is true. The unpacked fields
 *  are present only for a uniform cell, because a non-uniform one has no single
 *  answer to give. */
export interface CollisionCellRead {
  /** Raw stored cell word, or null when the four sub-tiles disagree. */
  word: number | null;
  /** True when the cell's four 8px sub-tiles do not all hold the same word. */
  mixed?: true;
  /** The four sub-tile words, top-left, top-right, bottom-left, bottom-right.
   *  Present only on a mixed cell — on a uniform one it would be four copies. */
  sub?: [number, number, number, number];
  /** Shape index, bits 9:0. 0 = air. Absent on a mixed cell. */
  shape?: number;
  xFlip?: boolean;
  yFlip?: boolean;
  solidity?: Solidity;
  /** True when `shape` names a real in-range profile in the loaded tables.
   *  False for air, for an out-of-range index, and for every cell when no
   *  collision tables are loaded at all (see `profilesLoaded`). */
  known?: boolean;
  /** Surface angle in 256-units, or null when air / unknown / the profile's
   *  own `hasAngle` is false. Flip-resolved, like `shape`'s profile. */
  angle?: number | null;
}

export interface CollisionRegionRead {
  plane: 'a' | 'b';
  /** Echoed rectangle, in 16px CELL units. */
  x: number; y: number; w: number; h: number;
  /** `h` rows of `w` cells, row-major — CELLS (16px), not tiles. */
  cells: CollisionCellRead[][];
  /**
   * THE ROUND TRIP, flattened: every cell's raw `word`, row-major, `w*h` long,
   * `null` where the cell is mixed. Pass it back UNCHANGED as
   * `paint_collision`'s `words` and the region is restored.
   *
   * It exists so that round-tripping needs no transformation at all. Making an
   * agent write `cells.flat().map(c => c.word)` is one line it can get wrong,
   * on a surface where the method description is the ONLY documentation it
   * gets, and the null-for-mixed case is exactly the one a hand-rolled flatten
   * would drop.
   */
  words: (number | null)[];
  /** How many cells in this rectangle have disagreeing sub-tiles. Non-zero
   *  means some `word`s are null and this region has no single-word form. */
  mixedCells: number;
  /** How many cells carry bits outside `COLLISION_CELL_OWNED_MASK`. Zero in
   *  every act shipped so far, which is exactly why it is reported rather than
   *  assumed: an agent that round-trips a region must know when it is moving a
   *  field nothing in Aurora names. */
  cellsWithUnownedBits: number;
  /** False when no collision shape tables are loaded, in which case `known` is
   *  false everywhere, `angle` is null everywhere and the ascii view is all
   *  `?` for non-air. Reported so "no tables" cannot be misread as "no shapes". */
  profilesLoaded: boolean;
  /** Present only when the request asked for it. */
  ascii?: string;
}

// ── the glyphs ─────────────────────────────────────────────────────────────
//
// One char per CELL. Ordered rules, most-specific first; the order is the
// contract and `COLLISION_ASCII_LEGEND` states it in the same order.
export const GLYPH_MIXED = '!';
export const GLYPH_AIR = '.';
export const GLYPH_UNKNOWN = '?';
export const GLYPH_INERT = ',';
export const GLYPH_FULL = '#';
export const GLYPH_WALL = '|';
export const GLYPH_CEILING = '"';
export const GLYPH_SLOPE_UP_RIGHT = '/';
export const GLYPH_SLOPE_UP_LEFT = '\\';
export const GLYPH_FLOOR = '_';

/** How far apart the two edge columns must be, in px, before a cell reads as a
 *  slope rather than a flat floor. A sixteenth of the cell either way is noise;
 *  a quarter is a shape. */
const SLOPE_THRESHOLD_PX = 4;

export const COLLISION_ASCII_LEGEND =
  `${GLYPH_AIR} air   ${GLYPH_INERT} shape present but solidity=none (stops nothing)   `
  + `${GLYPH_UNKNOWN} shape index not in the loaded tables\n`
  + `${GLYPH_MIXED} MIXED — this cell's four 8px sub-tiles disagree; read cells[][].sub\n`
  + `${GLYPH_FULL} full block   ${GLYPH_WALL} vertical face   ${GLYPH_CEILING} hangs from the top   `
  + `${GLYPH_SLOPE_UP_RIGHT} rises to the right   ${GLYPH_SLOPE_UP_LEFT} rises to the left   `
  + `${GLYPH_FLOOR} flat partial floor\n`
  + 'Glyphs show GEOMETRY ONLY (the profile heights the canvas overlay draws). '
  + `They do NOT show solidity beyond the ${GLYPH_INERT} case, nor which way a `
  + 'ceiling slopes — read cells[][].solidity and cells[][].angle for those.';

/**
 * The glyph for one already-read cell.
 *
 * `profiles` may be null (no tables loaded); every non-air cell then reads
 * `?`, which is the honest answer — without the height tables this module has
 * nothing to draw a shape from.
 */
export function collisionCellGlyph(cell: CollisionCellRead, profiles: CollisionProfileSet | null): string {
  if (cell.mixed) return GLYPH_MIXED;
  const word = cell.word ?? 0;
  const r = resolveCell(profiles, word);
  if (r.air) return GLYPH_AIR;
  if (!r.known || !r.profile) return GLYPH_UNKNOWN;
  // A shape that stops nothing is not air, but for anything a player can stand
  // on, run up or loop around it may as well be — and an agent verifying a loop
  // has to be able to SEE that, so it gets its own mark rather than a shape
  // glyph that overstates what the cell does.
  if (r.profile.solidity === 'none') return GLYPH_INERT;

  const heights = r.profile.heights;
  let solidCols = 0;
  let fullCols = 0;
  let hangingCols = 0;
  let filled = 0;
  for (let c = 0; c < 16; c++) {
    const run = columnSolidRun(heights[c] ?? 0);
    if (!run) continue;
    solidCols++;
    filled += run.h;
    if (run.h >= 16) fullCols++;
    // columnSolidRun puts a hanging column at y=0; a floor column at y=16-h.
    // y===0 with a full column is both, so only PARTIAL columns discriminate.
    if (run.y === 0 && run.h < 16) hangingCols++;
  }
  if (solidCols === 0) return GLYPH_AIR;             // a "solid" profile with no solid px
  if (fullCols === 16) return GLYPH_FULL;            // every column floor-to-ceiling
  // A vertical face: every solid column is floor-to-ceiling and at least one
  // column is empty. This is how the classic height array encodes a wall, and
  // it is the glyph a loop's left and right runs are made of.
  if (fullCols === solidCols) return GLYPH_WALL;
  if (hangingCols === solidCols) return GLYPH_CEILING;

  const left = Math.min(16, Math.abs(heights[0] ?? 0));
  const right = Math.min(16, Math.abs(heights[15] ?? 0));
  if (right - left >= SLOPE_THRESHOLD_PX) return GLYPH_SLOPE_UP_RIGHT;
  if (left - right >= SLOPE_THRESHOLD_PX) return GLYPH_SLOPE_UP_LEFT;
  return GLYPH_FLOOR;
}

/**
 * The glanceable grid: a column ruler, then one line per cell row prefixed with
 * that row's ABSOLUTE cell coordinate. Both rulers carry absolute coordinates —
 * a grid whose axes started at 0 would be a second coordinate system for the
 * reader to convert out of, and converting it back is the step that gets
 * skipped.
 */
export function renderCollisionAscii(
  cells: CollisionCellRead[][], profiles: CollisionProfileSet | null,
  x: number, y: number,
): string {
  const rowLabelWidth = String(y + cells.length - 1).length;
  const pad = (n: number) => String(n).padStart(rowLabelWidth, ' ');
  const gutter = ' '.repeat(rowLabelWidth) + ' ';
  const w = cells[0]?.length ?? 0;
  // Two ruler lines when the window spans a tens boundary, one when it does not:
  // '10' cannot be written under a single column.
  const tens = gutter + Array.from({ length: w }, (_, c) => {
    const v = Math.floor((x + c) / 10) % 10;
    return v === 0 ? ' ' : String(v);
  }).join('');
  const ones = gutter + Array.from({ length: w }, (_, c) => String((x + c) % 10)).join('');
  const lines: string[] = [];
  if (tens.trim().length > 0) lines.push(tens);
  lines.push(ones);
  for (let r = 0; r < cells.length; r++) {
    lines.push(`${pad(y + r)} ${cells[r].map((cell) => collisionCellGlyph(cell, profiles)).join('')}`);
  }
  return lines.join('\n');
}

/** Read one 16px cell out of an 8px-resolution plane. The four sub-tiles are
 *  read INDIVIDUALLY and compared — never sampled. */
export function readCollisionCell(
  plane: ArrayLike<number>, cellCol: number, cellRow: number, tileWidth: number,
  profiles: CollisionProfileSet | null,
): CollisionCellRead {
  const idx = cellTileIndices(cellCol, cellRow, tileWidth);
  const sub = idx.map((i) => (plane[i] ?? 0) & 0xFFFF) as [number, number, number, number];
  if (!(sub[0] === sub[1] && sub[1] === sub[2] && sub[2] === sub[3])) {
    return { word: null, mixed: true, sub };
  }
  const word = sub[0];
  // THE FIELDS COME FROM THE ENCODER'S OWN INVERSE, never from bit literals
  // typed here — a `word & 0x400` in this file would be the copied-pin defect
  // this repo keeps paying for, and `unpackCollisionCell` moves when
  // `packCollisionCell` does. It is used INSTEAD of `resolveCell`'s profile for
  // these four because the word's flips and solidity are readable with no
  // shape tables loaded at all, while `resolveCell`'s `profile` is null then.
  const c = unpackCollisionCell(word);
  const r = resolveCell(profiles, word);
  return {
    word,
    shape: c.shape,
    xFlip: c.xFlip,
    yFlip: c.yFlip,
    solidity: c.solidity,
    known: r.known,
    angle: r.profile && r.profile.hasAngle ? r.profile.angle : null,
  };
}

/** The whole reply body for one rectangle of one plane. Bounds are the caller's
 *  to validate (the handler does it through `validatePaintCollisionRect`, so
 *  the read and the write cannot drift on what a legal rectangle is). */
export function readCollisionRegion(args: {
  plane: 'a' | 'b';
  planeWords: ArrayLike<number>;
  tileWidth: number;
  x: number; y: number; w: number; h: number;
  profiles: CollisionProfileSet | null;
  ascii: boolean;
}): CollisionRegionRead {
  const { plane, planeWords, tileWidth, x, y, w, h, profiles, ascii } = args;
  const cells: CollisionCellRead[][] = [];
  const words: (number | null)[] = [];
  let mixedCells = 0;
  let cellsWithUnownedBits = 0;
  for (let r = 0; r < h; r++) {
    const row: CollisionCellRead[] = [];
    for (let c = 0; c < w; c++) {
      const cell = readCollisionCell(planeWords, x + c, y + r, tileWidth, profiles);
      words.push(cell.word);
      if (cell.mixed) {
        mixedCells++;
        // A mixed cell's unowned bits are counted if ANY sub-tile carries them:
        // there is no cell word to test, and reporting zero here would hide the
        // field behind the very disagreement that made it hard to see.
        if (cell.sub!.some((s) => unownedCollisionBits(s) !== 0)) cellsWithUnownedBits++;
      } else if (unownedCollisionBits(cell.word ?? 0) !== 0) {
        cellsWithUnownedBits++;
      }
      row.push(cell);
    }
    cells.push(row);
  }
  const out: CollisionRegionRead = {
    plane, x, y, w, h, cells, words, mixedCells, cellsWithUnownedBits,
    profilesLoaded: profiles !== null,
  };
  if (ascii) out.ascii = renderCollisionAscii(cells, profiles, x, y);
  return out;
}
