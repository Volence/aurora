// THE PAINT-TIME LOOP CHECK — the half of the checking aeon explicitly assigned
// to Aurora rather than to its build.
//
// From the anchor (`git -C ../aeon show aa2a9f29:docs/LOOP_CROSSOVER_ENCODING.md`
// §8.2), verbatim:
//
//   "Our build checks the encoding — R1 through R6. Bytes, decidable, cheap ...
//    Aurora checks the loop — at paint time, where the INTENT is present. You
//    know a stroke was a loop; the bake only knows it produced divergent cells."
//
// And why the obvious build gate is NOT the answer: aeon measured 736 cells
// solid on plane A only and 44 solid on B only in shipped, correct, loop-free
// content. "Every divergent cell is reachable from a crossover" would red the
// build on all of it. So reachability is not what this computes.
//
// ═══ WHAT IT DOES COMPUTE, AND WHY EACH ITEM EARNS ITS PLACE ═══
//
// Three tiers, kept apart because they need different answers from the author:
//
//  • ERROR — the document holds something aeon's bake will HARD-ERROR on. A
//    SELF-MARK (rule R2) or the RESERVED value 3 (rule R1). Aurora's brush
//    cannot author either, by construction; they can still arrive from a
//    paste, an import, an agent call, or a hand-poked cell. Finding one here is
//    the difference between a message in the editor and a build failure an hour
//    later with no cell coordinate attached.
//
//  • WARN — ONE-WAY CROSSOVERS. A cell marked on one plane and not the other.
//    Perfectly legal, and it is exactly what an entry/exit anchor looks like,
//    so it is NOT an error. But a two-way loop needs the pair (anchor §3.3),
//    and a loop that has been painted one-way is the single most likely
//    authoring mistake this feature has — it works perfectly running one
//    direction and dumps the player off the geometry running the other. That
//    asymmetry is invisible on the map, because each plane's overlay is drawn
//    separately.
//
//  • CONTEXT — divergent cells (solid on exactly one plane). Reported, never
//    judged. It is the number that tells an author whether the two planes are
//    doing anything different at all, and it is the quantity aeon's §4.2 was
//    about; the point of carrying it is that a section with divergence and NO
//    crossovers is a section whose second plane is unreachable.
//
// ═══ WHAT IT DELIBERATELY DOES NOT DO ═══
//
// It does not decide whether a region IS a loop. That needs a traversal model —
// which surfaces connect, at what speed, in which direction — or a declaration
// the encoding does not carry, and aeon's §8.2 says as much about its own side.
// A fitted radius in a gate is worse than no gate. What is here is decidable
// from the two planes alone, and everything that is not is left out rather than
// approximated.

import {
  readCrossover, crossoverTarget,
  type CrossoverRead, type Crossover, type CollisionPlaneId, type CrossoverSpan,
} from './layer-transition';
import { isSolidCell } from './both-planes-paint';
import { CELL_SUBTILE_COLS, CELL_SUBTILE_ROWS, spanForTileCol } from './collision-cell';

/** How many offending indices each list keeps. A cap, because a corrupt import
 *  could name every cell and the report is meant to be read. */
export const AUDIT_SAMPLE_CAP = 16;

/**
 * THE CROSSOVER AT ONE INDEX, OR NULL WHEN THERE IS NO CELL THERE.
 *
 * ⚠ THIS EXISTS BECAUSE `readCrossover` CANNOT DO THIS JOB AND MUST NOT BE ASKED
 * TO. Its parameter is `number | undefined` and it folds `undefined` to 0, so it
 * answers `'none'` for a word nobody wrote. That fold is correct where it lives:
 * a caller holding a word wants a name for it. It is exactly wrong as an answer
 * about an INDEX, because a cell that does not exist and a cell carrying no
 * crossover are then the same answer, and this file's whole job is to notice
 * marks. An audit that reads past an end and folds the nothing into `'none'`
 * UNDER-REPORTS, and under-reporting is the direction that hurts: a clean audit
 * is what somebody acts on.
 *
 * So the remedy is a value the caller has to answer for rather than one that
 * happens to look benign, which is the same ruling `crossoverLocus` states at
 * length for a missing stride: a flag is ignorable, a null is not.
 *
 * A HOLE INSIDE THE LENGTH IS ALSO NULL. A sparse array's missing element is not
 * a zero cell either, and nothing in Aurora produces one; a foreign or
 * hand-built plane can, and the honest answer is the same as past the end.
 */
export function crossoverInPlane(plane: ArrayLike<number>, index: number): CrossoverRead | null {
  if (!Number.isInteger(index) || index < 0 || index >= plane.length) return null;
  const word = plane[index];
  if (word === undefined) return null;
  return readCrossover(word);
}

/**
 * How many sub-tile ROWS the cancellation scan can walk over `length` words at
 * `stride`, which is ZERO whenever the words do not fill one whole row.
 *
 * ONE AUTHOR FOR THAT ARITHMETIC, and it is why this is exported rather than
 * inlined twice. `scanCancellingRuns` needs it to bound its walk and
 * `auditCrossovers` needs it to know whether the walk saw anything at all. Two
 * copies would let the audit report `cancellingMeasured: true` over a scan that
 * looked at nothing, which is precisely the defect this parcel closed: the flag
 * used to be set from the STRIDE ALONE, so a section whose second plane was one
 * word long claimed the check had run.
 */
export function cancellingScanRows(length: number, stride: number): number {
  if (!Number.isInteger(stride) || stride <= 0 || !(length > 0)) return 0;
  return Math.floor(length / stride);
}

/**
 * WHERE A SAMPLE INDEX IS, when that is knowable at all.
 *
 * Every list in `CrossoverAudit` names FLAT SUB-TILE INDICES, and an index is
 * not a place. "first at index 1417" is true, unactionable, and was the audit's
 * whole reporting vocabulary until 2026-09-06
 * (docs/reviews/2026-09-04-loops-two-way-mark.md §8 row 4).
 *
 * ═══ EVERY FIELD, AND WHAT IT IS DERIVED FROM ═══
 *
 * The decomposition is the INVERSE of `cellTileIndices`, which is the one place
 * the forward direction is spelled:
 *
 *     index = (cellRow * CELL_SUBTILE_ROWS + r) * stride
 *           + (cellCol * CELL_SUBTILE_COLS + c)
 *
 * so `subRow = index / stride`, `subCol = index % stride`, and the cell is those
 * two divided by the SAME two constants the expander multiplies by. Nothing here
 * types a 2 or a 4: `collision-cell.ts` names the ratio once and both directions
 * read it, so a change there reddens this rather than silently shearing the
 * coordinate off the data.
 *
 * `half` is `spanForTileCol(subCol)` LITERALLY, not a reimplementation of it.
 * That function is how the map brush turns the 8px column under the cursor into
 * a mark width, so the half this reports and the half an author aims at cannot
 * drift apart.
 */
export interface CrossoverLocus {
  /** The flat sub-tile index this decodes. Carried so a report can name both and
   *  a harness can go straight back to the plane word. */
  index: number;
  /** 8px sub-tile column inside the section. This is aeon's own `col` in the
   *  bake's rule-R2 error text (`tools/ojz_strip_gen.py`
   *  `apply_editor_collision_overlay` at aeon origin/master 290f4aa8:
   *  `sec {sec_id} plane {plane_name} col {col} row {cr}`), so an author who
   *  gets both messages can line them up. */
  subCol: number;
  /** 8px sub-tile row inside the section. */
  subRow: number;
  /** The 16px Aurora collision CELL the sub-tile belongs to. `cellRow` is also
   *  aeon's `cr` in that same error text, because its rows are 16px. */
  cellCol: number;
  cellRow: number;
  /** WHICH 8px engine trigger column of that cell, in the vocabulary of the
   *  map brush's mark-width control. */
  half: Exclude<CrossoverSpan, 'cell'>;
  /** Which sub-tile row of the 16px cell. ⚠ `bottom` MATTERS: aeon's overlay
   *  pass reads `o = (cr * 2) * W + col` (same function, same revision), the
   *  cell's TOP sub-tile row only, so a mark sitting alone on a bottom row is
   *  authored, audited, and never baked. Aurora's own writers fill all four
   *  sub-tiles (`cellTileIndices`), so a bottom-only mark means the data came
   *  from a paste, an import, an agent call or a poke. */
  rowHalf: 'top' | 'bottom';
  /** Which section these planes are, or null when the caller did not say.
   *  ⚠ NEVER INVENTED. It is not in the arrays and cannot be derived from them;
   *  a locus with `section: null` names a cell inside whatever section it was
   *  handed, which is a smaller true statement rather than a bigger guess. */
  section: number | null;
}

/**
 * The locus of `index`, or NULL when the geometry to place it was not supplied.
 *
 * ⚠ THE REFUSAL IS THE POINT AND IT IS A NULL, NOT A FLAG. The audit already
 * carries one `…Measured: false` boolean (`cancellingMeasured`) and the obvious
 * move was a second. It was rejected: a `locationMeasured` boolean would be
 * `stride !== null` spelled a second time, two things to keep in step for one
 * fact, and a flag is IGNORABLE. A null is not: every caller in TypeScript has
 * to answer for it, and the one formatter that renders it says in words what is
 * missing. `stride` on the record is the same fact in its useful form.
 *
 * A cell coordinate needs the row stride for exactly the reason the cancellation
 * scan does: a flat index carries no adjacency. Returning cell (0,0) when no
 * stride was passed would paint a confidently wrong location next to a real
 * defect, which is strictly worse than the index it replaced - an index at least
 * looks like an index.
 */
export function crossoverLocus(
  index: number,
  stride: number | null | undefined,
  section?: number | null,
): CrossoverLocus | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (typeof stride !== 'number' || !Number.isInteger(stride) || stride <= 0) return null;
  const subCol = index % stride;
  const subRow = Math.floor(index / stride);
  return {
    index, subCol, subRow,
    cellCol: Math.floor(subCol / CELL_SUBTILE_COLS),
    cellRow: Math.floor(subRow / CELL_SUBTILE_ROWS),
    half: spanForTileCol(subCol),
    rowHalf: subRow % CELL_SUBTILE_ROWS === 0 ? 'top' : 'bottom',
    section: section ?? null,
  };
}

/** The locus of one of an audit's own sample indices. Reads the stride and the
 *  section OFF THE AUDIT, so a caller cannot pair an index with a stride the
 *  audit did not run on. */
export function crossoverLocusAt(a: CrossoverAudit, index: number): CrossoverLocus | null {
  return crossoverLocus(index, a.stride, a.section);
}

/**
 * A locus as the fragment a message drops into a sentence, and the REFUSAL when
 * there is no locus.
 *
 * The index survives in both branches. It is what the debug hooks, the harnesses
 * and this repo's landed packets already quote, and a coordinate that silently
 * replaced it would break every one of those readers to say less.
 */
export function formatCrossoverLocus(locus: CrossoverLocus | null, index: number): string {
  if (!locus) return `index ${index}, NO CELL COORDINATE`;
  const where = locus.section === null ? '' : `section ${locus.section}, `;
  const row = locus.rowHalf === 'bottom'
    ? ', and on the cell\'s BOTTOM sub-tile row, which aeon\'s bake never reads'
    : '';
  return `${where}cell (col ${locus.cellCol}, row ${locus.cellRow}), `
    + `${locus.half} half (8px column ${locus.subCol}, index ${index})${row}`;
}

export interface CrossoverAudit {
  /** Cells examined (the shorter of the two planes' lengths). */
  cells: number;
  /**
   * ⚠ CELLS THE AUDIT NEVER LOOKED AT, AND THE REASON A ZERO ELSEWHERE MAY NOT
   * BE READ AS CLEAN.
   *
   * The scan is index-wise over two parallel arrays, so it can only speak for
   * the cells BOTH planes have; `cells` is the shorter length and this is what
   * the longer one has beyond it. It is the whole of the present plane when the
   * other is absent, and 0 when both are absent (nothing to examine is not a
   * gap).
   *
   * Non-zero means every count above is a LOWER BOUND. A self-mark past the
   * shorter plane's end used to report `severity: 'ok'` with a null message,
   * which is a clean bill of health for a document that hard-errors aeon's bake,
   * and it is the shape a section whose plane B was never seeded actually takes.
   * `crossoverAuditMessage` therefore says this in words and is NEVER null while
   * it is non-zero.
   *
   * ⚠ IT DOES NOT MOVE `crossoverAuditSeverity`, deliberately. That predicate
   * answers one question, "will aeon's bake refuse this document", and an
   * instrument that could not read the whole document has not found a defect to
   * grade. Same ruling as `cancellingMeasured`, which is also reported in prose
   * rather than as a tier.
   */
  unexamined: number;
  /** Cells whose plane-A word carries a crossover (any non-`none` value). */
  marksA: number;
  /** Same on plane B. */
  marksB: number;
  /** Cells marked on BOTH planes — the two-way pair a loop crossover needs. */
  pairs: number;
  /** Marked on exactly one plane. Legal; see the WARN tier above. */
  oneWay: number;
  /** ILLEGAL: a plane's word telling you to go to the plane you are on.
   *  Rule R2 SPECIFIES that aeon's bake refuse these. ⚠ AS OF 2026-08-29 IT
   *  DOES NOT — `bake_plane_cell` never reads bits 15:14 at all (measured:
   *  docs/reviews/2026-08-29-crossover-paint-loop.md), so R2 is unimplemented
   *  and this count is the only place a self-mark is noticed anywhere. */
  selfMarks: number;
  /** ILLEGAL: a cell holding the reserved value 3. Rule R1 SPECIFIES a bake
   *  hard error. ⚠ AS OF 2026-08-29 THE BAKE DOES NOT READ THE FIELD, so an act
   *  painted entirely with value 3 bakes clean and emits a byte-identical ROM.
   *  Note what this count is and is NOT: it REPORTS, it does not refuse — and
   *  Aurora cannot author a 3 in the first place (`crossoverFor` derives the
   *  value from the brush and the plane; the brush has no such value). */
  reserved: number;
  /** ⚠ A TWO-WAY CROSSOVER THAT NETS TO NOTHING — the defect this whole parcel
   *  exists to close, and the one an author is LEAST able to see.
   *
   *  A run of horizontally adjacent marked 8px columns containing at least one
   *  PAIR (marked on both planes) which a player traverses without changing
   *  path: the marks fire, and fire again, and he leaves on the path he
   *  entered on. See `scanCancellingRuns` for the simulation and
   *  layer-transition.ts's CrossoverSpan block for why cell-width pairs land
   *  here by construction.
   *
   *  ZERO WHEN THE AUDIT COULD NOT LOOK: this needs the plane's row stride, so
   *  a caller that does not pass one gets `cancellingMeasured: false` and this
   *  stays 0. A count of 0 is not "clean" unless that flag is true. */
  cancelling: number;
  /** Whether the cancellation scan actually WALKED A ROW. LOUD ON UNMEASURABLE:
   *  `cancelling: 0` means two different things without it.
   *
   *  ⚠ IT IS NOT "a stride was supplied", which is what it used to be. A usable
   *  stride over fewer words than one row scans nothing at all
   *  (`cancellingScanRows` returns 0), and the flag then claimed a check that
   *  never happened. The message names WHICH of the two reasons applies. */
  cancellingMeasured: boolean;
  /** First sub-tile index of each cancelling run, capped like the others. */
  cancellingAt: number[];
  /** Solid on exactly one plane. Context, never judged. */
  divergent: number;
  /** Solid on both planes — what the "A+B" brush authors. */
  solidBoth: number;
  /** Up to AUDIT_SAMPLE_CAP indices for each illegal class, so a message can
   *  name a cell instead of a count. */
  selfMarkAt: number[];
  reservedAt: number[];
  oneWayAt: number[];
  /** The row stride this audit ran with, or NULL when the caller passed none.
   *  Carried on the record so `crossoverLocusAt` can place a sample index, and
   *  so a reader of the raw record (the debug hooks return it to harnesses as
   *  JSON) can tell a real coordinate from an absent one. Null is the ONLY
   *  reason a sample has no cell coordinate. */
  stride: number | null;
  /** Which section these two planes are, or NULL when the caller did not say.
   *  ⚠ NOT DERIVABLE FROM THE ARRAYS - they are two flat word arrays and carry
   *  no identity. Every call site in Aurora knows its section index, so all
   *  three pass it; a caller that does not gets messages that name a cell and
   *  no section rather than a section number this file made up. */
  section: number | null;
}

/** One maximal run of horizontally adjacent marked columns, and what a player
 *  traversing it actually ends up on. Exported so a test can assert the
 *  SIMULATION rather than only the count it feeds. */
export interface CrossoverRun {
  /** Sub-tile index of the run's first (leftmost) column. */
  index: number;
  /** Columns in the run — 8px ENGINE TRIGGER CELLS, not 16px Aurora cells. */
  width: number;
  /** Columns in the run marked on BOTH planes. */
  pairs: number;
  /** Entering rightward on path A, does the player leave on path B? */
  flipsRightward: boolean;
  /** Entering leftward on path B, does the player leave on path A? */
  flipsLeftward: boolean;
}

/** `error` when the document would fail aeon's bake, `warn` for a one-way
 *  crossover, `ok` otherwise. A single predicate so no caller invents its own
 *  threshold. */
export function crossoverAuditSeverity(a: CrossoverAudit): 'ok' | 'warn' | 'error' {
  if (a.selfMarks > 0 || a.reserved > 0) return 'error';
  // A CANCELLING PAIR IS A WARN, NOT AN ERROR, and the line is aeon's: `error`
  // in this audit means "the bake will refuse this". The bake bakes a
  // cancelling pair happily — every word in it is legal — and the player simply
  // runs through the loop without ever leaving path A. So it is the loudest
  // thing that is not a build failure, which is exactly the `warn` tier.
  if (a.cancelling > 0 || a.oneWay > 0) return 'warn';
  return 'ok';
}

/**
 * Audit both collision planes of one section.
 *
 * MOST quantities here are index-wise and need no geometry: the planes are
 * parallel arrays, and the audit reads them at SUB-TILE resolution — all four
 * sub-tiles of a 16px cell used to hold the same word, so a cell whose
 * sub-tiles disagree is visible as separate counts rather than averaged away.
 *
 * ⚠ `stride` IS THE EXCEPTION AND IT IS NOT OPTIONAL IN SPIRIT. The
 * cancellation check asks a question about ADJACENCY — "what happens to a
 * player running horizontally through these marks" — and adjacency is the one
 * thing an index-wise scan cannot see. A caller that omits it gets
 * `cancellingMeasured: false` and must not read `cancelling: 0` as clean; the
 * message says so in words rather than leaving a zero to be misread.
 */
export function auditCrossovers(
  planeA: ArrayLike<number> | null | undefined,
  planeB: ArrayLike<number> | null | undefined,
  /** Sub-tile columns per row (SECTION_TILES_WIDE for an aeon section). Without
   *  it the cancellation scan cannot run AND no sample index can be turned into
   *  a cell coordinate: both questions are about where an index sits in the
   *  grid, and a flat array does not answer either. */
  stride?: number,
  /** Which section these planes belong to. Optional because it changes no
   *  count - it only lets a message name a section instead of leaving one out.
   *  Absent is honest; a default of 0 would not be. */
  section?: number | null,
): CrossoverAudit {
  const usableStride = typeof stride === 'number' && Number.isInteger(stride) && stride > 0;
  const out: CrossoverAudit = {
    cells: 0, unexamined: 0, marksA: 0, marksB: 0, pairs: 0, oneWay: 0,
    selfMarks: 0, reserved: 0, divergent: 0, solidBoth: 0,
    cancelling: 0, cancellingMeasured: false, cancellingAt: [],
    selfMarkAt: [], reservedAt: [], oneWayAt: [],
    stride: usableStride ? stride : null,
    section: section ?? null,
  };
  // WHAT THIS RUN COULD NOT SEE, COMPUTED BEFORE THE FIRST EARLY RETURN so the
  // absent-plane case carries it too. That case is not hypothetical: a section
  // whose plane B has never been seeded reaches all three call sites, and it
  // used to produce a record indistinguishable from a clean audit.
  const lenA = planeA ? planeA.length : 0;
  const lenB = planeB ? planeB.length : 0;
  if (!planeA || !planeB) {
    out.unexamined = Math.max(lenA, lenB);
    return out;
  }
  const n = Math.min(lenA, lenB);
  out.cells = n;
  out.unexamined = Math.max(lenA, lenB) - n;
  for (let i = 0; i < n; i++) {
    const wa = planeA[i], wb = planeB[i];
    const ca = readCrossover(wa), cb = readCrossover(wb);

    if (ca === 'reserved') push(out.reservedAt, i, out.reserved++);
    if (cb === 'reserved') push(out.reservedAt, i, out.reserved++);
    // A plane-A word saying "go to A" and a plane-B word saying "go to B".
    // Spelled against the plane the word came FROM, which is the only place
    // that information exists — `readCrossover` cannot know it, which is
    // exactly why aeon puts rule R2 in `apply_editor_collision_overlay` and not
    // in the baker.
    if (ca === 'to-a') push(out.selfMarkAt, i, out.selfMarks++);
    if (cb === 'to-b') push(out.selfMarkAt, i, out.selfMarks++);

    const markedA = ca !== 'none' && ca !== 'reserved';
    const markedB = cb !== 'none' && cb !== 'reserved';
    if (markedA) out.marksA++;
    if (markedB) out.marksB++;
    if (markedA && markedB) out.pairs++;
    else if (markedA || markedB) push(out.oneWayAt, i, out.oneWay++);

    const sa = isSolidCell(wa), sb = isSolidCell(wb);
    if (sa && sb) out.solidBoth++;
    else if (sa || sb) out.divergent++;
  }

  // The one question that needs geometry. Kept in its own pass rather than
  // folded into the index-wise loop above, because it is a different KIND of
  // check — a traversal, not a per-cell classification — and burying it in the
  // same loop would make both harder to read and the `stride` refusal invisible.
  //
  // ⚠ IT GATES ON `out.stride`, NOT ON THE PARAMETER, so the traversal and the
  // coordinate agree by construction about what a usable stride is. Before
  // 2026-09-06 this read `stride && stride > 0`, which admits a FRACTIONAL
  // stride: the scan would then walk rows that are not rows, and a locus
  // computed from the same number would name a cell that does not exist.
  //
  // ⚠ AND IT GATES ON THE ROWS THE SCAN CAN ACTUALLY WALK, not on the stride
  // being present. `cancellingScanRows(n, stride)` is 0 whenever the two planes
  // between them do not offer one whole row, and the flag used to be set to true
  // regardless: `cancelling: 0, cancellingMeasured: true` over a scan that
  // looked at nothing is the same benign-looking zero this parcel is about.
  if (out.stride !== null) {
    out.cancellingMeasured = cancellingScanRows(n, out.stride) > 0;
    if (out.cancellingMeasured) {
      for (const run of scanCancellingRuns(planeA, planeB, n, out.stride)) {
        push(out.cancellingAt, run.index, out.cancelling++);
      }
    }
  }
  return out;
}

/**
 * Every marked run that a player runs through WITHOUT CHANGING PATH, though the
 * run contains a two-way pair.
 *
 * ═══ WHY THIS IS A REAL TRAVERSAL AND NOT THE FITTED MODEL §8.2 REFUSES ═══
 *
 * The docblock at the top of this file says the audit does not decide whether a
 * region IS a loop, because that needs surfaces, speeds and directions the
 * encoding does not carry. This asks a strictly smaller question that needs
 * NONE of them: given these marks and nothing else, does entering this run on
 * one path and leaving the other side change which path you are on? The engine
 * answers that with an equality on a cell id and a per-plane table lookup, and
 * both are here. No radius is fitted and no geometry is consulted.
 *
 * ═══ THE THREE FACTS IT IS BUILT ON, EACH DERIVED ═══
 *
 *  1. The trigger fires ONCE PER 8px COLUMN entered (`COLL_CELL_W` = 8), so the
 *     scan steps one sub-tile column at a time.
 *  2. It reads the mark from THE PLANE THE PLAYER IS CURRENTLY ON
 *     (`Collision_GetType(x, y, layer)`), so the walk carries a layer and looks
 *     up that plane's word — which is what makes an even-width pair cancel and
 *     an odd-width one flip.
 *  3. The player CANNOT SKIP A COLUMN: top speed is 6px/frame, below the 8px
 *     column width. So every column of a run is visited, exactly once, in order.
 *
 * A run's rows are scanned at each CELL'S TOP sub-tile row (`CELL_SUBTILE_ROWS`
 * apart) — the sub-tile a cell's canonical word lives at, and the row aeon's
 * bake samples. Scanning every sub-tile row would report each defect twice.
 *
 * ⚠ A RUN WITH NO PAIR IS NEVER REPORTED, however little it does. Two spatially
 * separated ONE-WAY marks are the shape that works for a loop
 * (docs/reviews/2026-09-04-loops-test-loop-witness.md §6), and each of them is
 * a run that does nothing in one of the two directions ON PURPOSE. Reporting
 * those would fire on the correct answer.
 */
export function scanCancellingRuns(
  planeA: ArrayLike<number>, planeB: ArrayLike<number>,
  /** How many words to consider. ⚠ IT IS NOT TRUSTED: see `extent` below. */
  length: number,
  stride: number,
): CrossoverRun[] {
  const out: CrossoverRun[] = [];
  // ⚠ `length` IS A CALLER'S CLAIM AND THIS FUNCTION IS EXPORTED, so the claim
  // gets checked against the arrays rather than believed. A length past either
  // plane's end read `undefined`, `readCrossover` folded that to `'none'`, and a
  // cell that does not exist was indistinguishable from a cell with no mark: the
  // scan then reported no run where it had no data, which is an UNDER-REPORT
  // wearing a clean answer. `auditCrossovers` passes the shorter plane's length
  // and was never the caller that could do it; every other caller is a test, a
  // harness or the next parcel, and none of them should have to know.
  const extent = Math.min(length, planeA.length, planeB.length);
  const rows = cancellingScanRows(extent, stride);
  const fires = (w: number | undefined, on: CollisionPlaneId): CollisionPlaneId | null => {
    const c = readCrossover(w);
    if (c === 'reserved' || c === 'none') return null;
    const to = crossoverTarget(c as Crossover);
    // A self-mark cannot fire — reading a plane's mark means being on it.
    return to === null || to === on ? null : to;
  };
  // THROUGH THE REFUSING READER, NOT `readCrossover`. Inside `extent` a null is
  // unreachable by construction; it is read through the accessor anyway so that
  // the boundary rule lives in ONE place and a future caller that widens the
  // walk cannot reintroduce the fold by forgetting it. `crossoverInPlane`'s own
  // null behaviour is asserted directly in crossover-audit-bounds.test.ts.
  const markedAt = (i: number): boolean => {
    const a = crossoverInPlane(planeA, i), b = crossoverInPlane(planeB, i);
    return a === 'to-a' || a === 'to-b' || b === 'to-a' || b === 'to-b';
  };
  for (let row = 0; row < rows; row += CELL_SUBTILE_ROWS) {
    const base = row * stride;
    for (let col = 0; col < stride; col++) {
      if (!markedAt(base + col)) continue;
      let end = col;
      while (end + 1 < stride && markedAt(base + end + 1)) end++;
      const width = end - col + 1;
      let pairs = 0;
      for (let c = col; c <= end; c++) {
        const a = crossoverInPlane(planeA, base + c), b = crossoverInPlane(planeB, base + c);
        const ma = a === 'to-a' || a === 'to-b', mb = b === 'to-a' || b === 'to-b';
        if (ma && mb) pairs++;
      }
      // Walk it, once each way, exactly as the engine would.
      let layer: CollisionPlaneId = 'a';
      for (let c = col; c <= end; c++) {
        const to = fires(layer === 'a' ? planeA[base + c] : planeB[base + c], layer);
        if (to) layer = to;
      }
      const flipsRightward = layer !== 'a';
      layer = 'b';
      for (let c = end; c >= col; c--) {
        const to = fires(layer === 'a' ? planeA[base + c] : planeB[base + c], layer);
        if (to) layer = to;
      }
      const flipsLeftward = layer !== 'b';
      if (pairs > 0 && (!flipsRightward || !flipsLeftward)) {
        out.push({ index: base + col, width, pairs, flipsRightward, flipsLeftward });
      }
      col = end;
    }
  }
  return out;
}

/** Append while under the cap. Takes the pre-increment count so the caller's
 *  `x++` reads as one statement rather than two. */
function push(list: number[], index: number, countBefore: number): void {
  if (countBefore < AUDIT_SAMPLE_CAP) list.push(index);
}

/**
 * The audit as a sentence, or null when there is nothing to say.
 *
 * Prose lives here rather than in the component for the reason every refusal in
 * this parcel does: the message names aeon's rule number, and a UI that
 * composed its own would drift from the rule it is reporting.
 */
export function crossoverAuditMessage(a: CrossoverAudit): string | null {
  const parts: string[] = [];
  // ONE PLACE TURNS A SAMPLE INDEX INTO A PLACE, for every class at once. The
  // follow-up that booked this (docs/reviews/2026-09-04-loops-two-way-mark.md
  // §8 row 4) asked for exactly that rather than one class at a time, and this
  // is why: four sentences composing their own coordinate is four chances to
  // spell it differently, and the message that refuses to name one has to be
  // the SAME refusal in all four or a reader learns to skim it.
  const at = (index: number | undefined): string =>
    (index === undefined ? 'nowhere (the sample list is empty, which is a bug in this audit)'
      : formatCrossoverLocus(crossoverLocusAt(a, index), index));
  if (a.reserved > 0) {
    parts.push(`${a.reserved} cell${a.reserved === 1 ? '' : 's'} hold the RESERVED crossover value 3 `
      + `(first at ${at(a.reservedAt[0])}): aeon's bake hard-errors on it (rule R1).`);
  }
  if (a.selfMarks > 0) {
    parts.push(`${a.selfMarks} SELF-MARK${a.selfMarks === 1 ? '' : 's'} `
      + `(first at ${at(a.selfMarkAt[0])}): a plane whose word sends you to the plane you are `
      + 'already on. It can never fire, and aeon\'s bake refuses it (rule R2).');
  }
  // ⚠ THE CANCELLING LINE COMES BEFORE THE ONE-WAY LINE, deliberately. An author
  // who has just been told "a loop needs the pair" and acts on it lands on
  // exactly this defect, so the message that says the pair is not enough must
  // not be underneath the one that asked for it.
  if (a.cancelling > 0) {
    parts.push(`${a.cancelling} TWO-WAY crossover${a.cancelling === 1 ? '' : 's'} that `
      + `NET${a.cancelling === 1 ? 'S' : ''} TO NOTHING (first at ${at(a.cancellingAt[0])}): `
      + 'the pair is there on both planes, but it spans an even number of the 8px columns the '
      + 'engine triggers on, so the player is handed over and handed straight back and leaves on '
      + 'the path he arrived on. A 16px cell is TWO trigger columns, so a pair painted at the '
      + 'default mark width always does this. Set the crossover mark width to "Half (8px)" and '
      + 'paint the pair one sub-column wide, or use two spatially separated ONE-WAY marks, which '
      + 'is what the first working loop used.');
  }
  if (a.oneWay > 0) {
    // WORDING REVISITED 2026-09-04 (the witness packet's §6 asked for it, and
    // this parcel is why). The old sentence called a one-way mark "the single
    // most likely authoring mistake" and told the reader to add the pair. For a
    // LOOP that advice is actively wrong at the default mark width — it is what
    // produces a cancelling pair — and two separated one-way marks are a
    // correct, and simpler, way to build a two-way loop. So this now says what
    // a one-way mark IS rather than implying it is a mistake.
    parts.push(`${a.oneWay} ONE-WAY crossover${a.oneWay === 1 ? '' : 's'} `
      + `(first at ${at(a.oneWayAt[0])}): marked on one plane only. Legal and often correct: an `
      + 'entry or exit anchor looks like this, and so does a loop built from two separated one-way '
      + 'marks (each fires only when approached on the plane that carries it, and firing twice is '
      + 'the same as firing once). It is a MISTAKE only if you meant a single two-way handoff and '
      + 'marked one plane; then mark the other plane at the same place, at "Half (8px)" mark width.');
  }
  // ⚠ WHAT THE AUDIT DID NOT LOOK AT, AND IT IS NOT PARENTHESISED LIKE THE TWO
  // CAVEATS BELOW. Those two say a coordinate or a traversal is missing from an
  // otherwise complete report; this one says the report is INCOMPLETE, so every
  // count above is a lower bound. It is also the only line that can be the whole
  // message: an audit that examined nothing has nothing else to say, and null
  // there would be a clean bill of health nobody measured.
  if (a.unexamined > 0) {
    parts.push(`${a.unexamined} cell${a.unexamined === 1 ? '' : 's'} of these planes `
      + `${a.unexamined === 1 ? 'was' : 'were'} NOT EXAMINED (this audit read ${a.cells}): the two `
      + 'planes are different lengths, and an index-wise scan of two parallel arrays can only '
      + 'speak for the cells both of them have. Every count here is therefore a LOWER BOUND, and '
      + 'a clean report is not a clean document. The usual cause is a section whose second '
      + 'collision plane was never seeded; seed it (ensureCollisionPlanes) and audit again.');
  }
  // THE OTHER HALF OF THE SAME REFUSAL, and it fires on the classes above
  // rather than on `pairs`: without a stride every "first at" line degraded to
  // a bare index, and a bare index beside a real defect is exactly the thing
  // this parcel exists to stop being silent about.
  if (a.stride === null && (a.reserved > 0 || a.selfMarks > 0 || a.oneWay > 0)) {
    parts.push('(No cell coordinates above: this audit was called without a row stride, so a flat '
      + 'sub-tile index cannot be turned into a cell. The numbers are indices into the plane '
      + 'arrays, counting across each row of 8px sub-tiles.)');
  }
  if (!a.cancellingMeasured && (a.pairs > 0)) {
    // LOUD ON UNMEASURABLE. `cancelling: 0` beside a real pair count is the one
    // combination a reader would otherwise take as an all-clear.
    //
    // ⚠ AND IT NAMES WHICH OF THE TWO REASONS APPLIES. Until this parcel the flag
    // could only be false for a missing stride, so the sentence said so; it can
    // now also be false with a perfectly good stride and too few words to fill
    // one row, and a correct rule stating the wrong reason is how the rule gets
    // applied in the wrong place later.
    parts.push('(The two-way cancellation check did NOT run, so nothing here says whether these '
      + 'pairs actually change the player\'s path: '
      + (a.stride === null
        ? 'this audit was called without a row stride.)'
        : `these ${a.cells} cell${a.cells === 1 ? '' : 's'} do not fill one row of ${a.stride}, `
          + 'so the scan had no row to walk.)'));
  }
  return parts.length ? parts.join(' ') : null;
}
