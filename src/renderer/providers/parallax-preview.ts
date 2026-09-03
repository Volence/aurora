// THE PARALLAX COMPOSITE, SCOPED TO THE JOB IT BELONGS TO — EW-SHAPE-PREVIEW,
// the third and last clause of the owner's `three_sub_tabs_plus_section_strip`
// ruling (decisions.jsonl `d-26b-effects-tooling-shape-ANSWERED`):
//
//     "The parallax preview (today buried in View, off by default) is ON BY
//      DEFAULT on the Parallax sub-tab."
//
// ═══ WHAT WAS WRONG ═══
//
// The cold walkthrough's defect 14 (§a21): the composite background preview is
// the ONLY thing in Aurora that shows what a scene's layers do, and the reader
// found it ten minutes after he needed it, off by default, in a menu the
// Effects tab never mentioned. Wave 1 put a `Parallax preview` chip on the
// Effects bar, which fixed the finding-it half and left the default alone, and
// said why: `showCameraPreview` was ONE GLOBAL VIEW FLAG shared with every aeon
// facet's View menu, so turning it on by default would have turned it on in
// Layout, Objects, Collision and Art too — a preview arriving where nobody
// asked for it, which is a worse defect than the one being fixed.
//
// ═══ THE TWO SCOPES, AND THEY ARE DIFFERENT ON PURPOSE ═══
//
//   THE DEFAULT is scoped to the PARALLAX SUB-TAB. `parallax` is the job the
//   preview is a picture of; on Colour and Tile anim it is not what the author
//   is looking at, and the ruling scopes the default to that one tab in so many
//   words.
//
//   THE CHOICE is scoped to the EFFECTS FACET. Once the author has operated the
//   switch, his answer holds across all three jobs — a raster band sits ON the
//   background, and taking the background away when he moves to Colour to edit
//   the band would be this parcel authoring a new complaint. What his choice
//   cannot do is escape the facet: `activeGuideScene()` is null everywhere else
//   and always was, and now the View menu does not offer the switch there
//   either.
//
// So, in one line, and it is the only place this is decided:
//
//     on = in the Effects facet AND (his choice ?? the sub-tab is Parallax)
//
// ═══ WHY IT IS READ AT CALL TIME, NOT CLOSED OVER ═══
//
// `MapViewport.redraw` is dependency-free by its own docblock's rule and reads
// its subjects through `getState()`; the same three facts have to be resolvable
// from the draw pass, from the keyboard handler and from the two switches, and
// a second spelling in any of them is how the canvas and the checkbox end up
// disagreeing about whether the preview is on. The React hook below is the same
// derivation with subscriptions attached, for the two components that must
// re-render when it changes.

import { useViewStore } from '../state/viewStore';
import { useEditorStore } from '../state/editorStore';
import { useWorkspaceStore } from '../workspace/workspaceStore';
import { useSessionStore } from '../state/sessionStore';
import type { FacetCapability } from '../../core/project/adapter';
import type { PreviewChoice } from '../shell/preview-pref';

/** The Effects facet's id. Spelled `parallax` in the capability vocabulary. */
export const EFFECTS_FACET: FacetCapability = 'parallax';

/** The sub-tab the default speaks for. */
export const PREVIEW_DEFAULT_TAB = 'parallax';

/** True while the author is standing in the Effects facet. */
export function inEffectsFacet(): boolean {
  const tabId = useSessionStore.getState().activeId;
  return useWorkspaceStore.getState().facetFor(tabId) === EFFECTS_FACET;
}

/**
 * ═══ THE RULE ITSELF, WITH NOTHING AROUND IT ═══
 *
 * A pure function of the three inputs, and the ONLY statement of the rule in
 * the application — the reader and the hook below differ in how they FETCH the
 * three, never in what they conclude from them. Two copies of these four lines
 * (one closing over `getState`, one over subscriptions) would be two copies
 * that a node row could only ever check one of: a hook cannot be called outside
 * a render, so the "do they agree" test would have had to compute the answer a
 * THIRD time and would then be checking its own arithmetic. Here the exhaustive
 * row drives this, and the two callers are checked to be callers.
 */
export function previewOnFrom(
  facet: FacetCapability, subTab: string, choice: PreviewChoice,
): boolean {
  if (facet !== EFFECTS_FACET) return false;
  if (choice !== null) return choice;
  return subTab === PREVIEW_DEFAULT_TAB;
}

/**
 * IS THE PARALLAX COMPOSITE ON RIGHT NOW? The one answer, read fresh.
 *
 * ⚠ NOT `useViewStore.getState().parallaxPreview`. That field is the author's
 * CHOICE and is `null` — neither true nor false — for every author who has not
 * touched the switch, which is the state this whole parcel is about.
 */
export function parallaxPreviewOn(): boolean {
  const tabId = useSessionStore.getState().activeId;
  return previewOnFrom(
    useWorkspaceStore.getState().facetFor(tabId),
    useEditorStore.getState().effectsSubTab,
    useViewStore.getState().parallaxPreview,
  );
}

/**
 * The same rule, subscribed — for the chip and the View menu row, which must
 * repaint the moment any of the three inputs moves.
 *
 * Four selectors rather than one `useStore(...)` over a derived object: zustand
 * compares by identity and a derived object is a new one every render.
 */
export function useParallaxPreviewOn(): boolean {
  const activeId = useSessionStore((s) => s.activeId);
  const facet = useWorkspaceStore((s) => s.facetFor(activeId));
  const choice = useViewStore((s) => s.parallaxPreview);
  const subTab = useEditorStore((s) => s.effectsSubTab);
  return previewOnFrom(facet, subTab, choice);
}

/**
 * Flip the switch — from whatever is ON SCREEN, not from the stored choice.
 *
 * The chip and the View menu row both call this, so the two doors cannot come
 * to different conclusions about what "off" means for an author who has never
 * decided: the first click on a preview that is showing must record `false`,
 * and `!null` is `true`.
 */
export function toggleParallaxPreview(): boolean {
  const next = !parallaxPreviewOn();
  useViewStore.getState().setParallaxPreview(next);
  return next;
}
