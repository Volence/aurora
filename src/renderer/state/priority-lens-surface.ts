// THE FEEDBACK LOOP THAT MAKES `keep` SAFE — said once, for every brush.
//
// core/editing/brush-word.ts decides `keep` is the default on an argument about
// DETECTABILITY: keeping a priority bit that should have been cleared is a
// mistake the violet veil shows you the moment it happens, while clearing one
// that should have been kept is an ABSENCE nobody notices. That argument is only
// true while the veil is actually on screen, so the moment a brush stops saying
// `keep` the lens has to come up.
//
// ═══ WHY IT IS A MODULE AND NOT TWO SETTERS ═══
//
// It began inside `editorStore.setSelectedTilePriority`, which was correct while
// the map brush was the only brush that could author the bit. ROADMAP O17 gives
// the Art composer's tile-stamp the same tri-state (`artStore.stampPriority`),
// and a second setter that re-spelled "turn the lens on and say so" would be the
// fifth open-coded copy of a decision that brush-word.ts exists to keep single.
// The two brushes are separate — different tile, different flips, different
// facet — but "you may not author an invisible field" is ONE rule about the app.
//
// IT ONLY EVER TURNS THE LENS ON. Returning to `keep` leaves it on, because
// silently undoing a view the author may now be relying on is its own surprise,
// and both surfaces carry a way to switch it off (the map's View menu, the
// composer's own lens chip — the Art facet has no View menu, see
// workspace/facet-chrome.ts).

import { DEFAULT_BRUSH_ATTRIBUTES, brushAuthorsPriority } from '../../core/editing/brush-word';
import type { BrushPriority } from '../../core/editing/brush-word';
import { useViewStore } from './viewStore';
import { useToastStore } from './toastStore';

/** The one message. Both surfaces say the same words about the same veil. */
export const PRIORITY_LENS_TOAST =
  'Priority lens on: the violet veil marks the tiles that draw in front of the player, '
  + 'so you can see the field this brush is now writing. Turn it off in View.';

/**
 * Surface the priority lens if `priority` means the brush has started AUTHORING
 * the bit, and say so.
 *
 * @returns whether this call turned the lens on. `false` covers both "the brush
 *   is still `keep`" and "the lens was already up" — a caller that wants to tell
 *   those apart should read the overlay itself; nothing needs to today, and the
 *   return exists so the node suite can assert the decision rather than the
 *   toast.
 */
export function surfacePriorityLens(priority: BrushPriority): boolean {
  // The condition is `brushAuthorsPriority`, the same predicate brush-word.ts
  // states the rule in, so the two cannot drift into disagreeing about when a
  // stroke starts writing an invisible field.
  if (!brushAuthorsPriority({ ...DEFAULT_BRUSH_ATTRIBUTES, priority })) return false;
  if (useViewStore.getState().overlays.showPriority) return false;
  useViewStore.getState().setOverlay('showPriority', true);
  useToastStore.getState().addToast(PRIORITY_LENS_TOAST, 'info');
  return true;
}
