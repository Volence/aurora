// RUNNING A BAND VERB, AND THEN TELLING THE AUTHOR WHERE THE BAND WENT.
//
// The owner: "I press add a band bank and idk where it is." He was right — the
// click worked, the document grew, and nothing at all changed on screen. The
// `Add blank band` chip sits on the tool-options bar AND inside the panel's
// `New band` section (`aeon.bganim.new`, `defaultCollapsed`), while the band it
// makes is appended to the `Bands` list in a DIFFERENT `CollapsibleSection`
// (`aeon.bganim.bands`, also `defaultCollapsed`). So the most likely outcome of
// a successful click was: a shut box gained a row nobody could see.
//
// ═══ ONE PLACE, BECAUSE THERE ARE TWO DOORS ═══
//
// `EffectsToolOptions`'s `VerbChip` and `BgAnimBandPanel`'s chips both ran their
// own copy of "build the command, show the refusal, execute on the focused
// level". A follow-up written into one of them would have left the other door
// exactly as the owner found it — and `providers/__tests__/band-verbs.test.ts`
// already pins that the two surfaces "run the SAME two commands", which a
// divergence here would quietly hollow out. `runBandVerb` is that one place.
//
// ═══ THE INDEX IS KNOWN, NOT INFERRED ═══
//
// `planBandInsertion` records where the band landed (`bandIndex`, defaulting to
// `bands.length`) and the command CARRIES the plan. So the follow-up reads the
// index the model actually used rather than re-deriving "it must be the last
// one" — which would be wrong the moment an insertion is not an append, and
// wrong right now for the REMOVE direction of the same command type.
//
// ═══ NOT A SECOND UNDO STEP, AND STRUCTURALLY UNABLE TO BE ONE ═══
//
// Everything after `executeCommand` writes ephemeral chrome: `bandLensTarget`
// and `bandReveal` are zustand fields outside the document, the section reveal
// is localStorage, and the toast is a notification. None is an `AnyCommand` and
// none reaches `EditHistory.execute`, which is the only thing that pushes an
// undo entry (`core/editing/history.ts`). `state/__tests__/band-lens-clear.test.ts`
// already pins that property for the lens target; `band-follow.test.ts` pins it
// for this whole sequence.
//
// The one asymmetry, stated rather than hidden: UNDOING the add does not
// un-select. `bandLensTarget` keeps an index that may now name no band, which is
// the staleness `resolveBandLens` (providers/bganim-preview-aeon) already exists
// to absorb — the same way it absorbs undoing a promote today.

import type { AnyCommand } from '../../core/editing/commands';
import { useProjectStore, getActiveLevel } from '../state/projectStore';
import { executeCommand, useEditorStore } from '../state/editorStore';
import { useToastStore } from '../state/toastStore';
import { revealEffectsSection } from './effects-sub-tabs';
import type { BandCommandResult } from './bg-anim-aeon';

/** The `CollapsibleSection` id the band list lives in — `BgAnimBandPanel`'s. */
export const BANDS_SECTION_ID = 'aeon.bganim.bands';

/**
 * The DOM id of one band card, so a reveal has something to scroll to.
 *
 * The card had no ref, no id and no data attribute before this parcel — the
 * band list was a set of divs a harness could only find by reading text.
 */
export function bandCardDomId(index: number): string {
  return `aeon-band-card-${index}`;
}

/** The band index a command lands on, or null when the command is not one. */
export function newBandIndexOf(command: AnyCommand): number | null {
  if (command.type !== 'set-bg-override-band') return null;
  // The REMOVE direction has a plan too, and following it would scroll to a
  // card that is about to stop existing.
  if (!command.adding) return null;
  return command.plan.bandIndex;
}

/**
 * Point the author at a band that just appeared: select it, open the section
 * holding it, ask the panel to scroll to it, and say so once.
 *
 * Exported on its own so a future surface that creates a band by another route
 * can reuse the follow-up without re-implementing the sequence.
 */
export function followBand(index: number): void {
  const ed = useEditorStore.getState();
  ed.setBandLensTarget({ kind: 'band', index });
  // BEFORE the scroll request, and it is an ordering the panel depends on: the
  // section renders no children while collapsed, so the card the scroll wants
  // does not exist in the DOM until this line has run and re-rendered.
  //
  // ⚠ AND SINCE THE SUB-TABS (d-26b) THERE ARE TWO DOORS SHUT, NOT ONE. The
  // verb that runs this lives on the tool-options bar, which is on screen from
  // every sub-tab — so the author can be on Parallax when the band lands on
  // Tile anim. `revealEffectsSection` switches to the owning tab and THEN
  // reveals; a bare `revealPanel` here would open a section that is not
  // mounted, which is the owner's "I press add a band bank and idk where it is"
  // in a second costume.
  revealEffectsSection(BANDS_SECTION_ID);
  ed.revealBand(index);
  useToastStore.getState().addToast(
    `Tile animation ${index} added — selected below, and lit on the map`, 'info');
}

/**
 * Execute a band verb's result and follow what it made. Returns the refusal to
 * show, or null on success — the shape both chip surfaces already wanted.
 *
 * NEVER THROWS AND NEVER PARTIALLY APPLIES: a refusal returns before anything
 * is executed, and a missing level returns before anything is followed.
 */
export function runBandVerb(result: BandCommandResult): string | null {
  if (!result.ok) return result.reason;
  const level = getActiveLevel(useProjectStore.getState());
  if (!level) return 'No aeon project is open.';
  executeCommand(result.command, level);
  const index = newBandIndexOf(result.command);
  if (index !== null) followBand(index);
  return null;
}
