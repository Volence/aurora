// Building the one undoable BgAnim band command.
//
// The arithmetic lives next to the codec, in
// `src/core/formats/bg-override/bg-anim-band.ts`; this file is the editing-side
// door to it, and the two things it adds are the ones a command has to have:
//
//   1. THE RESULT IS VALIDATED BEFORE THE COMMAND EXISTS. A plan can be legal
//      on every bound it checks and still land in a document that the codec
//      would refuse to write — so the projected document goes through
//      `validateBgOverride` here, and a refusal happens while the caller still
//      holds an untouched document rather than at save time over a corrupted
//      one. Validation runs on a PROJECTION, not on the live document: the
//      projection shares its tile arrays with the original and copies only
//      pointers, so it costs a few thousand slots' worth of references rather
//      than a deep clone of a ~400 KB file.
//
//   2. THE COMMAND OWNS ITS BAND. `band` is deep-copied into the command,
//      because on a removal it is the ONLY surviving record of the art and undo
//      has to rebuild it.
//
// `sectionIndex` is -1 on both: the override document is per-GAME, so this is
// act-ambient in the same sense `set-effects-scene` is, and records on the same
// stack for the same reason.

import {
  BgOverrideError,
  bganimSectionBytes,
  bgOverrideSectionIssues,
  cloneBgOverride,
  validateBgOverride,
  type BgOverrideBand,
  type BgOverrideDocument,
} from '../formats/bg-override/bg-override';
import {
  demoteBand,
  insertBand,
  planBandDemotion,
  planBandInsertion,
  planBandPromotion,
  planBandRemoval,
  promoteBand,
  removeBand,
  type BandSlotPlan,
  type RemoveBandOptions,
} from '../formats/bg-override/bg-anim-band';
import type { SetBgOverrideBandCommand } from './commands';

/**
 * Refuse against the PROJECTED document, while the caller's is still untouched.
 *
 * ═══ TWO KINDS OF RULE, AND THE SECOND ONE NEEDS A BEFORE ═══
 *
 * Everything `validateBgOverride` checks by default is about the document's own
 * well-formedness: a violation means the file is malformed or would ship
 * corrupt art, and the projected document either satisfies it or it does not.
 *
 * The ROM SECTION CEILING is not like that. It is a budget the document can
 * ALREADY be over when Aurora opens it (this repo's own
 * `editor_bg_override.b0e5a661.json` fixture is roughly two and a half times
 * over), and a rule stated as "the result must fit" would then refuse the
 * REPAIR: removing a tile animation from an over-budget act produces a document
 * that is still over, so `demote` and `remove` would both be dead and the only
 * way back would be hand-editing JSON.
 *
 * SO THE RULE IS DO NO HARM. Never grow a section that is over the ceiling, or
 * push one over it; always allow it to shrink. That needs the document the
 * author started from, which is why this takes two.
 */
function refuseIfResultInvalid(
  before: BgOverrideDocument, result: BgOverrideDocument, what: string,
): void {
  const issues = validateBgOverride(result);
  const harm = sectionHarm(before, result);
  if (harm !== null) issues.push(harm);
  if (issues.length > 0) {
    throw new BgOverrideError(`refusing to ${what}: the resulting document would not be valid`, issues);
  }
}

/**
 * The section-budget refusal for a projected edit, or null when the edit is not
 * a step backwards.
 *
 * THE COMPARISON IS THE RULE, in four cases and no fewer:
 *
 *   · the result has no computable size (a shape the build refuses outright,
 *     such as a `default_off` act with more than one tile animation) — REFUSE,
 *     unless the document was already in that state, in which case this edit is
 *     a partial repair and blocking it helps nobody;
 *   · the result fits — allow, which is the ordinary case;
 *   · the result is over but no larger than what the author started from —
 *     allow. This is the repair path, and it is the whole reason for the
 *     `before` argument;
 *   · the result is over AND larger — REFUSE, in the codec's own words.
 */
function sectionHarm(before: BgOverrideDocument, result: BgOverrideDocument): string | null {
  const after = bgOverrideSectionIssues(result);
  if (after.length === 0) return null;
  const start = bgOverrideSectionIssues(before);
  const a = sectionSizeOf(result);
  const b = sectionSizeOf(before);
  if (a === null) return start.length > 0 ? null : after[0];
  if (b === null) return null;              // was worse in kind; this is not a step back
  if (a <= b) return null;                  // shrinking or unchanged: the repair path
  return after[0];
}

/** Emitted section size, or null when the act has no computable one. */
function sectionSizeOf(doc: BgOverrideDocument): number | null {
  const anims = Array.isArray(doc.anims) ? doc.anims : [];
  const r = bganimSectionBytes(anims);
  return r.ok ? r.value : null;
}

function command(
  adding: boolean, band: BgOverrideBand, plan: BandSlotPlan, description: string,
): SetBgOverrideBandCommand {
  return {
    type: 'set-bg-override-band',
    description,
    sectionIndex: -1,
    adding,
    band: cloneBgOverride(band),
    plan,
  };
}

/**
 * The command that adds `band` at `bandIndex` (default: after the last band),
 * inserts its phase-0 art as the static tiles those slots rest at, renumbers
 * the blob, and rewrites every layout word that named a moved tile.
 *
 * THE PICTURE DOES NOT CHANGE. The band's art arrives unreferenced, and every
 * cell that drew a static tile still draws that same tile at its new index —
 * so adding a band is invisible until an author points cells at it, which is
 * the only behaviour that lets a band be added without an accidental edit to
 * the background.
 */
export function makeAddBandCommand(
  doc: BgOverrideDocument, band: BgOverrideBand, bandIndex?: number,
): SetBgOverrideBandCommand {
  const plan = planBandInsertion(doc, band, bandIndex);
  refuseIfResultInvalid(doc, insertBand(doc, plan, band), 'add a tile animation');
  return command(true, band, plan, 'Add tile animation');
}

/**
 * The command that removes the band at `bandIndex`, deletes its slots from the
 * blob, renumbers what is left, and follows every layout word back down.
 *
 * Removal REFUSES by default when layout cells draw the band — see
 * `RemoveBandOptions.blankReferencingCells`, which is the caller's way of
 * saying it meant to lose that art. The refusal names the cell count.
 */
export function makeRemoveBandCommand(
  doc: BgOverrideDocument, bandIndex: number, options: RemoveBandOptions = {},
): SetBgOverrideBandCommand {
  const plan = planBandRemoval(doc, bandIndex, options);
  const band = (doc.anims ?? [])[bandIndex];
  refuseIfResultInvalid(doc, removeBand(doc, plan), 'remove a tile animation');
  return command(false, band, plan, 'Remove tile animation');
}

/**
 * The command that PROMOTES `tiles[staticBase : staticBase + cols*rows]` into
 * `band` at `bandIndex` (default: after the last band): it moves that static
 * range to the front of the blob where bands must live, renumbers everything it
 * displaced, and rewrites every layout word that named a moved tile.
 *
 * THE BLOB DOES NOT GROW. A band's phase 0 IS the static art of the slots it
 * covers, so promoting art the document already carries adds no tiles at all —
 * which is the only way to author a band on a document that has spent its whole
 * tile budget, and the reason this command exists beside `makeAddBandCommand`.
 *
 * THE PICTURE DOES NOT CHANGE. Cells that drew the promoted tiles now draw the
 * band's slots, whose rest state is that same art; every other cell follows its
 * own tile to its new index.
 */
export function makePromoteBandCommand(
  doc: BgOverrideDocument, band: BgOverrideBand, staticBase: number, bandIndex?: number,
): SetBgOverrideBandCommand {
  const plan = planBandPromotion(doc, band, staticBase, bandIndex);
  refuseIfResultInvalid(doc, promoteBand(doc, plan, band), 'promote static tiles to a tile animation');
  return command(true, band, plan, 'Promote BG tiles to a tile animation');
}

/**
 * The command that DEMOTES the band at `bandIndex` back to plain static art,
 * landing its slots at `staticBase` (default: the front of the static region).
 *
 * IT DESTROYS NOTHING, which is the whole difference from
 * `makeRemoveBandCommand`. Removal deletes the band's slots from the blob, so
 * cells that drew them have nothing left to name and the command has to refuse
 * or blank them. Demotion hands the same slots back to `tiles`, so the picture
 * is unchanged in both directions and there is no `blankReferencingCells`
 * option here — there is nothing to blank.
 */
export function makeDemoteBandCommand(
  doc: BgOverrideDocument, bandIndex: number, staticBase?: number,
): SetBgOverrideBandCommand {
  const plan = planBandDemotion(doc, bandIndex, staticBase);
  const band = (doc.anims ?? [])[bandIndex];
  refuseIfResultInvalid(doc, demoteBand(doc, plan), 'demote a tile animation to static tiles');
  return command(false, band, plan, 'Demote tile animation to static tiles');
}
