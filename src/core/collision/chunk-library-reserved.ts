// THE CHUNK LIBRARY'S RESERVED-BITS REFUSAL (ROADMAP row 225, the side finding
// of (c)).
//
// `chunks.json` stores each library chunk's collision as one word per 16px cell
// (collisionA/collisionB). Until this module the save wrote those words with no
// reserved-bits check, so a chunk carrying bits 15:14 was refused only once it
// was STAMPED into a section (the section refusal in project/aeon/save.ts). The
// save now refuses a library entry the same way, before anything is planned,
// naming the chunk and the cell.
//
// ═══ WHICH MARKS ARE REFUSED: THE ONES THIS SESSION BROUGHT IN ═══
//
// A mark that was ALREADY in chunks.json when the project was opened is NOT
// refused here: it is written back unchanged (RULED 2026-09-28 by the overseer,
// ROADMAP row 225: the library is per-project, so refusing would block every
// act; no gesture clears a library chunk's bits 15:14; aeon reads no library
// chunk collision, and a stamp is refused by 225(c)). A mark is "already
// there" when the chunk with that id had the same width and height at load and
// the SAME value of bits 15:14 at that word. Any other mark (a new chunk, a new
// cell, a changed value, a resized chunk) is refused. `atLoad` absent means
// nothing was carried from disk, which refuses every mark: the strict side.
//
// Which bits are reserved is NOT decided here: every test goes through
// `planeReservedBits` (reserved-bits.ts) and the count and sample through
// `auditReservedBits` (reserved-bits-audit.ts).

import type { ChunkDef } from '../model/s4-types';
import { planeReservedBits } from './reserved-bits';
import { auditReservedBits, type ReservedBitsAudit } from './reserved-bits-audit';

/** A library chunk's planes as the load read them, kept only for chunks that
 *  carried a mark (ordinarily none). */
export interface ChunkMarksAtLoad {
  widthTiles: number;
  heightTiles: number;
  collisionA: Uint16Array;
  collisionB: Uint16Array;
}

/** The load's record of marks already in chunks.json, by chunk id. */
export function snapshotChunkLibraryMarks(chunks: readonly ChunkDef[]): Map<string, ChunkMarksAtLoad> {
  const out = new Map<string, ChunkMarksAtLoad>();
  for (const c of chunks) {
    const a = auditReservedBits(c.collisionA, c.collisionB);
    if (a.reservedA + a.reservedB === 0) continue;
    out.set(c.id, {
      widthTiles: c.widthTiles, heightTiles: c.heightTiles,
      collisionA: new Uint16Array(c.collisionA), collisionB: new Uint16Array(c.collisionB),
    });
  }
  return out;
}

/** One library chunk's marks that were not in chunks.json at load. */
export interface ChunkReservedAudit {
  chunk: ChunkDef;
  /** Audited WITHOUT a stride: the plane is cell-indexed, so the cell is placed
   *  by `chunkReservedMessage` from the chunk's own width. */
  audit: ReservedBitsAudit;
}

/** Every library chunk carrying a mark this session brought in (see the header). */
export function chunkLibraryReservedAudits(
  chunks: readonly ChunkDef[], atLoad: ReadonlyMap<string, ChunkMarksAtLoad> | undefined,
): ChunkReservedAudit[] {
  const out: ChunkReservedAudit[] = [];
  for (const chunk of chunks) {
    const before = atLoad?.get(chunk.id);
    const sameShape = !!before
      && before.widthTiles === chunk.widthTiles && before.heightTiles === chunk.heightTiles;
    // Only the words whose mark is NEW; every other index is a hole, which the
    // audit skips (it is no word) rather than reading as a clean one.
    const introduced = (plane: Uint16Array, old: Uint16Array | undefined): number[] => {
      const kept: number[] = new Array(plane.length);
      for (let i = 0; i < plane.length; i++) {
        const v = planeReservedBits(plane[i]);
        if (v === 0) continue;
        if (sameShape && old && planeReservedBits(old[i]) === v) continue;
        kept[i] = plane[i]!;
      }
      return kept;
    };
    const audit = auditReservedBits(
      introduced(chunk.collisionA, before?.collisionA),
      introduced(chunk.collisionB, before?.collisionB));
    if (audit.reservedA + audit.reservedB > 0) out.push({ chunk, audit });
  }
  return out;
}

/** The refusal's sentence for one chunk: the chunk, the cells (up to four, as a
 *  16px cell of the chunk), the rule, and what the author can do. */
export function chunkReservedMessage({ chunk, audit }: ChunkReservedAudit): string {
  const cellsWide = chunk.widthTiles >> 1;
  const total = audit.reservedA + audit.reservedB;
  const shown = audit.sample.slice(0, 4).map((c) => cellsWide > 0
    ? `plane ${c.plane.toUpperCase()} cell (col ${c.index % cellsWide}, row ${Math.floor(c.index / cellsWide)})`
    : `plane ${c.plane.toUpperCase()} index ${c.index}`).join('; ');
  const more = total > 4 ? `; and ${total - 4} more` : '';
  const planes = [audit.reservedA > 0 ? `A: ${audit.reservedA}` : null, audit.reservedB > 0 ? `B: ${audit.reservedB}` : null]
    .filter(Boolean).join(', ');
  return `chunk library entry "${chunk.name}" (id ${chunk.id}): ${total} collision word${total === 1 ? '' : 's'} `
    + `(${planes}) carry bits 15:14, the painted loop crossover mark RETIRED on 2026-09-26: aeon REFUSES them `
    + '(reserved bits), so a section this chunk is stamped into will not build, and Aurora will not SAVE the '
    + `chunk library with a mark it did not have when the project was opened. ${shown}${more}. No gesture `
    + 'clears bits 15:14 in a library chunk yet (a collision brush keeps them; "Clear retired marks" acts on a '
    + 'section): undo the edit that brought the mark in, if it was one.';
}
