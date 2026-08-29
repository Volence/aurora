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

import { readCrossover, type CrossoverRead } from './layer-transition';
import { isSolidCell } from './both-planes-paint';

/** How many offending indices each list keeps. A cap, because a corrupt import
 *  could name every cell and the report is meant to be read. */
export const AUDIT_SAMPLE_CAP = 16;

export interface CrossoverAudit {
  /** Cells examined (the shorter of the two planes' lengths). */
  cells: number;
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
  /** Solid on exactly one plane. Context, never judged. */
  divergent: number;
  /** Solid on both planes — what the "A+B" brush authors. */
  solidBoth: number;
  /** Up to AUDIT_SAMPLE_CAP indices for each illegal class, so a message can
   *  name a cell instead of a count. */
  selfMarkAt: number[];
  reservedAt: number[];
  oneWayAt: number[];
}

/** `error` when the document would fail aeon's bake, `warn` for a one-way
 *  crossover, `ok` otherwise. A single predicate so no caller invents its own
 *  threshold. */
export function crossoverAuditSeverity(a: CrossoverAudit): 'ok' | 'warn' | 'error' {
  if (a.selfMarks > 0 || a.reserved > 0) return 'error';
  if (a.oneWay > 0) return 'warn';
  return 'ok';
}

/**
 * Audit both collision planes of one section.
 *
 * `stride`/`rows` are not needed: every quantity here is per-cell and the
 * planes are parallel arrays, so the audit is index-wise. It reads the planes
 * at TILE resolution — all four sub-tiles of a 16px cell hold the same word, so
 * a cell whose sub-tiles DISAGREE (which only a bug can produce) is visible as
 * four separate counts rather than averaged away.
 */
export function auditCrossovers(
  planeA: ArrayLike<number> | null | undefined,
  planeB: ArrayLike<number> | null | undefined,
): CrossoverAudit {
  const out: CrossoverAudit = {
    cells: 0, marksA: 0, marksB: 0, pairs: 0, oneWay: 0,
    selfMarks: 0, reserved: 0, divergent: 0, solidBoth: 0,
    selfMarkAt: [], reservedAt: [], oneWayAt: [],
  };
  if (!planeA || !planeB) return out;
  const n = Math.min(planeA.length, planeB.length);
  out.cells = n;
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
  if (a.reserved > 0) {
    parts.push(`${a.reserved} cell${a.reserved === 1 ? '' : 's'} hold the RESERVED crossover value 3 `
      + `(first at index ${a.reservedAt[0]}) — aeon's bake hard-errors on it (rule R1).`);
  }
  if (a.selfMarks > 0) {
    parts.push(`${a.selfMarks} SELF-MARK${a.selfMarks === 1 ? '' : 's'} `
      + `(first at index ${a.selfMarkAt[0]}) — a plane whose word sends you to the plane you are `
      + 'already on. It can never fire, and aeon\'s bake refuses it (rule R2).');
  }
  if (a.oneWay > 0) {
    parts.push(`${a.oneWay} ONE-WAY crossover${a.oneWay === 1 ? '' : 's'} `
      + `(first at index ${a.oneWayAt[0]}): marked on one plane only. Legal — that is what an `
      + 'entry anchor looks like — but a two-way loop needs the mark on both planes, and a loop '
      + 'painted one-way works in one direction and drops the player in the other.');
  }
  return parts.length ? parts.join(' ') : null;
}
