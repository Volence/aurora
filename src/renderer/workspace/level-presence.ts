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

import { useClassicLevelStore, type ComposerTab, type TierPaintMode } from '../state/classicLevelStore';
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
 * Is a classic composer tier a PIXEL surface RIGHT NOW — one the art tool dock
 * and the art tool options can act on?
 *
 * REVERSED, DELIBERATELY, from an earlier recorded decision (Task 11,
 * "decided" — see the plan doc's final section). It used to read "Chunk assigns
 * blocks, Block assigns tiles, and only Tile has pixels" and be gated on the
 * TAB alone. Paint-through changes that: Chunk and Block can now compose their
 * tier into a pixel surface too, so the true gate is not the tab but the tab's
 * own Assign|Paint TOGGLE — Tile has no such toggle (it is unconditionally a
 * pixel surface), while Chunk/Block are pixel surfaces only while their own
 * mode says 'paint'. The assignment grid stays each tab's default specifically
 * so "a pencil/fill/eyedropper column beside the chunk grid" — the dead chrome
 * the old rule was written to prevent — still cannot happen while assigning;
 * it can now happen while painting, which is the point.
 *
 * THE ONE STATEMENT OF THAT, because the answer is needed in three places that
 * would otherwise drift: ClassicArtToolDock (the tool rail's contents),
 * s1-facets' ClassicArtOptions (the mirror/dither/pixel-perfect row), and
 * `usePixelToolsLive` below, which is what stops EditorShell from drawing the
 * rail's 44px CONTAINER. A component returning null is not enough on its own:
 * LevelWorkspace hands EditorShell an ELEMENT, `p.toolDock != null` is true for
 * an element that renders nothing, and the bordered rail is drawn empty down
 * the left of the screen — the exact failure EditorShell's `toolDock` docblock
 * exists to describe.
 */
export function isClassicPixelTier(tab: ComposerTab, chunkMode: TierPaintMode, blockMode: TierPaintMode): boolean {
  if (tab === 'tile') return true;
  if (tab === 'chunk') return chunkMode === 'paint';
  if (tab === 'block') return blockMode === 'paint';
  return false;
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
  const chunkMode = useClassicLevelStore((s) => s.chunkPaintMode);
  const blockMode = useClassicLevelStore((s) => s.blockPaintMode);
  if (engine === 's1' && facet === 'art') return isClassicPixelTier(classicTier, chunkMode, blockMode);
  return true;
}
