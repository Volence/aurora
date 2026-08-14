// "Does the open engine have a level document to edit right now?" — the one
// answer, for both engines.
//
// This is the input to facet-chrome: a level TAB can be open with no ACT behind
// it (a read that failed, a restore whose act has not finished loading,
// `__dbg.resetLevel()`), and in that state every facet slot but the canvas is a
// control with nothing to act on.
//
// The two engines' signals are deliberately the SAME ones their own canvases
// key on, so the chrome cannot disagree with the picture:
//   - classic: `status === 'ready' && doc !== null`, which is exactly
//     ClassicComposerCanvas's `ready` and ClassicLevelViewport's own guard.
//   - aeon: `getCurrentAct(state) !== null`, which is exactly the condition
//     MapViewport falls back to its "Open a level from the Explorer" state on.
//
// A hook, so both subscriptions are live and a load completing re-renders the
// workspace. Both stores are read UNCONDITIONALLY — the engine branch is on the
// values, not on the hook calls, because hooks may not sit behind a condition.

import { useClassicLevelStore, type ComposerTab } from '../state/classicLevelStore';
import { useProjectStore, getCurrentAct } from '../state/projectStore';
import type { OpenEngine } from '../state/open-project';
import type { FacetCapability } from '../../core/project/adapter';

export function useActLoaded(engine: OpenEngine | null): boolean {
  const classicReady = useClassicLevelStore((s) => s.status === 'ready' && s.doc !== null);
  const aeonAct = useProjectStore((s) => getCurrentAct(s) !== null);
  if (engine === 's1') return classicReady;
  if (engine === 'aeon') return aeonAct;
  return false;
}

/**
 * Is a classic composer tier a PIXEL surface — one the art tool dock and the art
 * tool options can act on?
 *
 * Classic's Art facet is three sub-surfaces behind one pill: Chunk assigns
 * blocks, Block assigns tiles, and only Tile has pixels (it is the one mounting
 * PixelViewport + PixelEditController). So the pixel chrome is gated one level
 * DEEPER than facet granularity — the same "a control that cannot act is not
 * drawn" rule facet-chrome.ts states, applied to the one facet with more than
 * one canvas under it.
 *
 * THE ONE STATEMENT OF THAT, because the answer is needed in two places that
 * would otherwise drift: the components themselves (ClassicArtToolDock and
 * s1-facets' ClassicArtOptions return null off the tile tier, so each is correct
 * standing alone) and `usePixelToolsLive` below, which is what stops EditorShell
 * from drawing the CONTAINER. A component returning null is not enough on its
 * own: LevelWorkspace hands EditorShell an ELEMENT, `p.toolDock != null` is true
 * for an element that renders nothing, and the 44px bordered rail is drawn empty
 * down the left of the screen — the exact failure EditorShell's `toolDock`
 * docblock exists to describe.
 */
export function isClassicPixelTier(tab: ComposerTab): boolean {
  return tab === 'tile';
}

/**
 * Whether the ART facet's pixel chrome (tool dock + tool options) is live for
 * the open engine right now. True everywhere it is not classic's Art facet:
 * aeon's composer is one surface and always a pixel one, and no other facet's
 * dock is a pixel dock at all.
 *
 * A hook alongside `useActLoaded` and read the same way — subscription
 * unconditional, branch on the values — so a tier change re-renders the
 * workspace and the rail appears with the canvas it belongs to.
 */
export function usePixelToolsLive(engine: OpenEngine | null, facet: FacetCapability | null): boolean {
  const classicTier = useClassicLevelStore((s) => s.composerTab);
  if (engine === 's1' && facet === 'art') return isClassicPixelTier(classicTier);
  return true;
}
