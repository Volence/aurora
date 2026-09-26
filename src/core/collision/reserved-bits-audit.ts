// THE RESERVED-BITS AUDIT: A NON-ZERO BITS 15:14 IS AN ERROR, NAMED BY CELL.
//
// ═══ WHY THIS REPLACED THE LOOP AUDIT ═══
//
// Until 2026-09-26 this was the `crossover-audit` module: a paint-time check of the
// painted loop crossover marks (self-marks, the reserved value 3, one-way marks,
// two-way pairs that cancel). The owner ruled that layer-switch LINES are the
// engine's only layer-switch mechanism (aeon `docs/decisions.jsonl`
// S2CLIP-PLANE-SWITCH) and aeon retired the marks (LINES-EVERYWHERE, aeon
// 19978b00). Bits 15:14 of a per-plane cell word are now RESERVED, and aeon
// REFUSES any non-zero value: `tools/ojz_strip_gen.py`'s preflight names every
// such cell before a re-bake writes anything, `bake_plane_cell` raises, and the
// clip bake refuses by clip (C4). So there is ONE class left and it is an ERROR:
// "a word here carries bits 15:14". Every mark-shaped distinction the old audit
// drew (to-a / to-b / 3, paired / one-way / cancelling) is the same answer now.
//
// ═══ WHAT IT IS FOR ═══
//
// The earlier line of defence. Aeon's preflight names the cells too, but an
// hour later, in a build log. This names them in the editor, in the collision
// palette, in the agent's paint reply, and in the save's refusal
// (`project/aeon/save.ts`), which will not write a plane that carries them.
//
// ═══ WHAT IT DOES NOT DO ═══
//
// It never CLEARS anything. Reporting is its whole job; the one gesture that
// clears is `clearReservedBitsEntries` (editing/collision-word.ts), asked for by
// name. See reserved-bits.ts for the full "refuses, not erases" rule.
//
// ═══ COORDINATES ═══
//
// Each plane is scanned ON ITS OWN, over its whole length: there is no pairing
// between planes any more, so neither plane's length can hide the other's cells
// (the old audit's `unexamined` problem does not exist here). A hit is named in
// BOTH vocabularies an author will meet:
//   • aeon's: its preflight message prints "Editor cells (col, row)" as the 8px
//     sub-tile column and row, `(n % 256, n // 256)` for a 256-wide section
//     (`tools/ojz_strip_gen.py` at aeon d3b98868), so Aurora prints the same
//     pair and the two messages line up;
//   • Aurora's: the 16px collision cell (col, row), the unit paint_collision and
//     the map brush use.

import { planeReservedBits, type CollisionPlaneId } from './reserved-bits';
import { CELL_SUBTILE_COLS, CELL_SUBTILE_ROWS } from './collision-cell';

/** How many offending cells each audit keeps for naming. A cap, because a
 *  corrupt file could carry the bits in every word and the report is meant to be
 *  read; the COUNTS are never capped. */
export const RESERVED_SAMPLE_CAP = 16;

/** One word that carries reserved bits, and where it is. */
export interface ReservedCell {
  plane: CollisionPlaneId;
  /** Flat 8px sub-tile index into the plane array. */
  index: number;
  /** The value of bits 15:14 (1..3). */
  value: number;
  /** Where it is, or NULL when the audit was not given a row stride. Never
   *  invented: a flat index carries no adjacency. */
  at: {
    /** 8px sub-tile column and row: aeon's "Editor cells (col, row)". */
    subCol: number; subRow: number;
    /** The 16px Aurora collision cell. */
    cellCol: number; cellRow: number;
  } | null;
}

export interface ReservedBitsAudit {
  /** Which section, or null when the caller did not say. Never invented. */
  section: number | null;
  /** The row stride used to place cells, or null. */
  stride: number | null;
  /** Words read from each plane (the plane's own length; 0 when it is absent). */
  wordsA: number;
  wordsB: number;
  /** Words carrying non-zero bits 15:14, per plane. NOT capped. */
  reservedA: number;
  reservedB: number;
  /** Up to RESERVED_SAMPLE_CAP offending words, plane A first, in index order. */
  sample: ReservedCell[];
}

/** Where `index` is in a plane of row stride `stride`, or null without one. */
export function reservedCellAt(index: number, stride: number | null): ReservedCell['at'] {
  if (stride === null || !Number.isInteger(stride) || stride <= 0) return null;
  const subCol = index % stride, subRow = Math.floor(index / stride);
  return {
    subCol, subRow,
    cellCol: Math.floor(subCol / CELL_SUBTILE_COLS),
    cellRow: Math.floor(subRow / CELL_SUBTILE_ROWS),
  };
}

/** Every word of one plane carrying reserved bits. Scans the WHOLE plane. A
 *  hole in a sparse array is skipped, not read as a clean word (it is no word). */
function scanPlane(
  plane: ArrayLike<number> | null | undefined, id: CollisionPlaneId, stride: number | null,
  sample: ReservedCell[],
): { words: number; reserved: number } {
  if (!plane) return { words: 0, reserved: 0 };
  let reserved = 0;
  for (let i = 0; i < plane.length; i++) {
    const w = plane[i];
    if (w === undefined) continue;
    const value = planeReservedBits(w);
    if (value === 0) continue;
    if (sample.length < RESERVED_SAMPLE_CAP) sample.push({ plane: id, index: i, value, at: reservedCellAt(i, stride) });
    reserved++;
  }
  return { words: plane.length, reserved };
}

/**
 * Audit one section's two collision planes for reserved bits 15:14.
 *
 * `stride` is the row width in 8px sub-tiles (SECTION_TILES_WIDE for an aeon
 * section). Without it the counts are still exact, but a cell cannot be placed
 * and the message says so rather than naming (0, 0).
 */
export function auditReservedBits(
  planeA: ArrayLike<number> | null | undefined,
  planeB: ArrayLike<number> | null | undefined,
  stride?: number,
  section?: number | null,
): ReservedBitsAudit {
  const usable = typeof stride === 'number' && Number.isInteger(stride) && stride > 0 ? stride : null;
  const sample: ReservedCell[] = [];
  const a = scanPlane(planeA, 'a', usable, sample);
  const b = scanPlane(planeB, 'b', usable, sample);
  return {
    section: section ?? null, stride: usable,
    wordsA: a.words, wordsB: b.words, reservedA: a.reserved, reservedB: b.reserved, sample,
  };
}

/** `error` when any word carries reserved bits (aeon's build will refuse the
 *  act), `ok` otherwise. There is no warn tier: aeon draws no line below a
 *  refusal for these bits. */
export function reservedAuditSeverity(a: ReservedBitsAudit): 'ok' | 'error' {
  return a.reservedA + a.reservedB > 0 ? 'error' : 'ok';
}

/** One offending cell as a sentence fragment. */
export function formatReservedCell(c: ReservedCell, section: number | null): string {
  const where = section === null ? '' : `section ${section} `;
  if (!c.at) return `${where}plane ${c.plane.toUpperCase()} index ${c.index} (no row stride, so no cell coordinate)`;
  return `${where}plane ${c.plane.toUpperCase()} editor cell (${c.at.subCol}, ${c.at.subRow})`
    + ` = 16px cell (col ${c.at.cellCol}, row ${c.at.cellRow})`;
}

/**
 * The sentence every surface shows for a non-clean audit, or null when clean.
 * It names the rule, the cells (up to four), and the remedy, and it says the
 * save will not write the plane: a message that stopped at "error" would leave
 * the author to discover the refusal at Ctrl+S.
 */
export function reservedAuditMessage(a: ReservedBitsAudit): string | null {
  const total = a.reservedA + a.reservedB;
  if (total === 0) return null;
  const shown = a.sample.slice(0, 4).map((c) => formatReservedCell(c, a.section)).join('; ');
  const more = total > 4 ? `; and ${total - 4} more` : '';
  const planes = [a.reservedA > 0 ? `A: ${a.reservedA}` : null, a.reservedB > 0 ? `B: ${a.reservedB}` : null]
    .filter(Boolean).join(', ');
  return `${total} collision word${total === 1 ? '' : 's'} (${planes}) carry bits 15:14, the painted loop `
    + 'crossover mark RETIRED on 2026-09-26: aeon now REFUSES them (reserved bits), so this act will not '
    + `build, and Aurora will not SAVE a plane that carries them. ${shown}${more}. A layer switch is now a `
    + 'LINE in the act\'s layer_lines.json, not a painted mark. Use "Clear retired marks" to zero bits '
    + '15:14 of these cells only (shape and solidity are kept; one undo step).';
}

/**
 * THE CLAIM `get_collision_region`'s MCP description makes about what aeon does
 * with a non-zero 15:14, as a constant so
 * `test/collision/crossover-reserved-bake-claim.test.ts` can re-derive it from aeon's published
 * `tools/collision_pipeline.py` and fail when the two part. Its
 * machine-findable spelling is "aeon's bake enforces it" (or, if aeon ever drops
 * the raise, "aeon's bake does not enforce it").
 */
export const RESERVED_BITS_BAKE_CLAUSE =
  'aeon\'s bake enforces it: tools/collision_pipeline.py bake_plane_cell raises when '
  + 'plane_reserved_bits(cell_word) is non-zero, and tools/ojz_strip_gen.py\'s preflight names every '
  + 'such cell (read at aeon d3b98868, 2026-09-26; `grep -n "plane_reserved_bits" '
  + 'tools/collision_pipeline.py` at a committed aeon revision is what refutes it)';
