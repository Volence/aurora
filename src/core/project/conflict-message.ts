// conflict-message — THE ONE PLACE a save conflict becomes a sentence a person
// reads, and the one place that decides whether "reload" is honest advice.
//
// ═══ ONE-MESSAGE-FOUR-CAUSES (lens sweep HIGH, fixed 2026-09-08) ═════════════
//
// `planGuardedWrite` (./save-guard.ts) distinguishes four reasons a save is
// refused. It used to compute the reason and drop it one line later, pushing only
// the path, so every surface below said the same thing about all four:
//
//     "N file(s) changed on disk since open ... Reload project to pick up
//      external changes."
//
// which is true of exactly one of them. A file DELETED under the author did not
// change, and reloading cannot bring it back. A file that APPEARED did not change
// either, and reloading would throw away the document being created rather than
// recover anything. A file Aurora could not STAT is not a statement about the disk
// at all. The wrong-remedy half is the worse half: the message did not merely
// misdescribe, it sent someone to a button that makes their situation worse or
// nothing at all.
//
// ═══ THE FIVE SURFACES, ENUMERATED BY GREP AND BY READING THE CALLERS ════════
//
// The sweep said three. It is five, and four of them prescribed a reload:
//
//   1. renderer/state/classic-save.ts       `notifyConflict`     toast, classic act save
//   2. renderer/agent/agent-handler.ts      case 'conflict'      thrown into the agent transport
//   3. renderer/state/canvas-file.ts        kind: 'conflict'     the canvas save result's `error`
//   4. renderer/state/canvas-save.ts        res.kind==='conflict' APPENDS the canvas reload advice on (3)
//   5. renderer/components/sprite/export-sprite.ts               toast, sprite art write-back
//
// (4) is the one a grep for "changed on disk" does not find: it adds the remedy
// sentence without restating the cause. (5) is the one that never even read the
// conflict list, naming its own single relPath and asserting it changed.
//
// ═══ WHAT EACH CAUSE SAYS, AND WHERE THE LINE IS DRAWN ═══════════════════════
//
// The CAUSE clauses are derived facts and are settled here. The REMEDY is not
// symmetric, and pretending it is was the defect:
//
//   'changed'   reload IS the fix. The reload sentence is emitted, exactly as
//               before, and only when every conflict is 'changed'.
//   'deleted'   no reload sentence. What is emitted instead is the true negative
//               ("reloading will not bring a deleted file back") rather than an
//               instruction, because Aurora has no affordance that resolves this.
//   'appeared'  no reload sentence. What is emitted is the reassurance that the
//               unknown file was not overwritten.
//   'unknown'   no reload sentence, and the probe's own reason is quoted.
//
// ⚠ OWNER'S CALL, DELIBERATELY NOT INVENTED HERE. For 'deleted', 'appeared' and
// 'unknown' there is no action Aurora currently offers that resolves the situation:
// there is no "write it anyway", no "recreate it", no "save under another name"
// from the save path. The right long answer is probably one of those affordances,
// and which one it is is a product decision, not a wording decision. So these
// clauses state the fact and stop. Do not add an imperative sentence here pointing
// at a button that does not exist; that is how the reload advice got attached to
// all four causes in the first place.
//
// Kept pure and in core: five surfaces on three layers share it, and no jsdom is
// needed to pin what it says.

import type { ConflictCause, GuardConflict } from './save-guard';

/** How a surface names the act of re-reading from disk. Only ever used in the
 *  'changed'-only case, where it is correct advice. */
export interface ReloadPhrase {
  /** Imperative, no trailing period: "Reload the project", "Reopen the act". */
  imperative: string;
  /** Optional extra clause appended inside the same sentence, e.g. the canvas
   *  surface's warning that unsaved edits in the tab are lost. */
  caveat?: string;
}

/** The order causes are reported in: worst-for-the-author first. A deleted file is
 *  the one most likely to mean lost work, and an unknown probe the one most likely
 *  to mean the author has a machine problem to fix before anything else works. */
const CAUSE_ORDER: ConflictCause[] = ['deleted', 'unknown', 'appeared', 'changed'];

function pathList(relPaths: string[], maxPaths: number | undefined): string {
  if (maxPaths === undefined || relPaths.length <= maxPaths) return relPaths.join(', ');
  const shown = relPaths.slice(0, maxPaths);
  return `${shown.join(', ')} and ${relPaths.length - shown.length} more`;
}

/** The clause for one cause, given the paths that share it (never empty). Each is a
 *  whole SENTENCE, capitalised: the clauses are joined with a full stop, and a
 *  lowercase "this changed on disk" after one reads as a fragment. */
function clauseFor(
  cause: ConflictCause, group: GuardConflict[], maxPaths: number | undefined,
): string {
  const many = group.length > 1;
  const these = many ? 'These' : 'This';
  const them = many ? 'them' : 'it';
  const list = pathList(group.map((c) => c.relPath), maxPaths);
  switch (cause) {
    case 'changed':
      return `${these} changed on disk after Aurora read ${them}: ${list}`;
    case 'deleted':
      return `${these} ${many ? 'were' : 'was'} deleted on disk after Aurora read ${them}: ${list}`;
    case 'appeared':
      return `${these} appeared on disk after Aurora read the rest, so Aurora had never seen ${them}: ${list}`;
    case 'unknown': {
      // The probe's own text, once per distinct reason, so an EACCES on one file
      // and an EIO on another are not merged into a single vague sentence.
      const reasons = [...new Set(group.map((c) => c.reason).filter((r): r is string => !!r))];
      const why = reasons.length > 0 ? ` (${reasons.join('; ')})` : '';
      return `Aurora could not read the current state of ${many ? 'these' : 'this'}, so it did not write over ${them}: ${list}${why}`;
    }
  }
}

function groupByCause(conflicts: GuardConflict[]): Map<ConflictCause, GuardConflict[]> {
  const groups = new Map<ConflictCause, GuardConflict[]>();
  for (const c of conflicts) {
    const g = groups.get(c.cause);
    if (g) g.push(c); else groups.set(c.cause, [c]);
  }
  return groups;
}

/** What a caller reporting a conflict with an empty list is told. That is a bug in
 *  the caller, and a message that papered over it would be the very thing this
 *  module exists to stop. */
function emptyNotice(lead: string): string {
  return `${lead} nothing was written, and Aurora recorded no reason. This is an Aurora bug; please report it.`;
}

/**
 * The CAUSE half of the notice, with no advice:
 *
 *   "<lead> nothing was written. <clause>. <clause>."
 *
 * `lead` is the surface's own opener ("Save aborted;" / "Save aborted:"), so each
 * surface keeps the voice it had. Split from the advice because two surfaces
 * (canvas-file.ts, then canvas-save.ts) each own one half of the canvas sentence,
 * and one function emitting both would say the recovery twice.
 */
export function saveConflictCauses(
  conflicts: GuardConflict[], opts: { lead: string; maxPaths?: number },
): string {
  if (conflicts.length === 0) return emptyNotice(opts.lead);
  const groups = groupByCause(conflicts);
  const clauses: string[] = [];
  for (const cause of CAUSE_ORDER) {
    const g = groups.get(cause);
    if (g) clauses.push(clauseFor(cause, g, opts.maxPaths));
  }
  return `${opts.lead} nothing was written. ${clauses.join('. ')}.`;
}

/** True when the group's paths number more than one. */
function plural(groups: Map<ConflictCause, GuardConflict[]>, cause: ConflictCause): boolean {
  return (groups.get(cause)?.length ?? 0) > 1;
}

/**
 * The ADVICE half, or null when there is nothing true to say. THE ASYMMETRY IS THE
 * POINT: a reload instruction only when reloading is what fixes it.
 */
export function saveConflictAdvice(
  conflicts: GuardConflict[], reload: ReloadPhrase,
): string | null {
  if (conflicts.length === 0) return null;
  return adviceFor(groupByCause(conflicts), reload);
}

/**
 * Both halves, for the surfaces that own the whole sentence:
 *
 *   "<lead> nothing was written. <clause>. <clause>. <advice>"
 */
export function saveConflictMessage(
  conflicts: GuardConflict[],
  opts: { lead: string; reload: ReloadPhrase; maxPaths?: number },
): string {
  const causes = saveConflictCauses(conflicts, opts);
  const advice = saveConflictAdvice(conflicts, opts.reload);
  return advice ? `${causes} ${advice}` : causes;
}

function adviceFor(
  groups: Map<ConflictCause, GuardConflict[]>, reload: ReloadPhrase,
): string | null {
  const onlyChanged = groups.size === 1 && groups.has('changed');
  if (onlyChanged) {
    const caveat = reload.caveat ? ` (${reload.caveat})` : '';
    return `${reload.imperative} to pick up the external changes${caveat}.`;
  }
  // Mixed, or none of it fixable by reloading. Say what is true and stop; every
  // remaining cause is one Aurora offers no resolution for, which is tagged as the
  // owner's call in the header.
  //
  // SENTENCES, NOT A COMMA CHAIN. Four of these clauses joined by commas is a
  // paragraph nobody finishes reading, and the one fact the author most needs is
  // usually the first.
  const parts: string[] = [];
  if (groups.has('deleted')) {
    parts.push(plural(groups, 'deleted')
      ? 'Reloading will not bring back files that were deleted'
      : 'Reloading will not bring back a file that was deleted');
  }
  if (groups.has('unknown')) {
    parts.push(plural(groups, 'unknown')
      ? 'Files Aurora cannot read the state of are left alone'
      : 'A file Aurora cannot read the state of is left alone');
  }
  if (groups.has('appeared')) {
    parts.push(plural(groups, 'appeared')
      ? 'The files Aurora had not seen are untouched'
      : 'The file Aurora had not seen is untouched');
  }
  if (groups.has('changed') && parts.length > 0) {
    // Deliberately impersonal: `reload.imperative` is an IMPERATIVE ("Reload the
    // project"), and bending it into a subject here needs a gerund the surfaces do
    // not supply. Inventing one per surface is how a sentence ends up ungrammatical
    // in the one case nobody previewed.
    parts.push('A reload would pick up the changed files only');
  }
  if (parts.length === 0) return null;
  return `${parts.join('. ')}.`;
}

