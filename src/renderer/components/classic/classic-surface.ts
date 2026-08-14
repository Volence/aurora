// Which classic surface the user is working in — the classic half of the focused
// facet (spec §4.2), and therefore of which document Ctrl+Z reverts.
//
// WHY THIS EXISTS: undo routing asks workspaceStore.facetFor(activeTab) for the
// focused facet, but only aeon's FacetBar ever called setFacet. The classic view
// has no facet bar — it shows the map, the composer dock and the palette panel at
// once — so facetFor fell back to its 'layout' default and a Ctrl+Z after a
// palette/tile/block/chunk edit drove the LAYOUT stack: it reverted an unrelated
// layout step and left the art edit in place. Classic art edits DO record on
// `zoneart:<zone>` (commitArt), so only the read side was wrong.
//
// The fix is the missing signal, not a second routing rule: each classic surface
// claims the facet as the user works in it, exactly as clicking a facet pill does
// in aeon. `art` covers the whole zone-art document (tiles/blocks/chunks/palette/
// colind); `map` covers the act's layout (fg/bg/objects/start).
//
// It writes workspaceStore.setFacet directly rather than going through
// facet-tools.switchFacet. This comment used to justify that by claiming "classic
// runs its own tool system (classicLevelStore.tool)". THAT IS FALSE and has been
// since the two tool vocabularies were deliberately merged: classicLevelStore has
// no `tool` state at all (its one setTool reference writes to editorStore),
// ClassicLevelViewport reads editorStore.tool/setTool exactly as aeon does, and
// toolsForFacet already resolves each engine's button set from the OPEN profile's
// `facetTools` — switchFacet's re-scope is engine-safe for the same reason (see
// toolForFacet's docblock). The stale claim sent two separate agents down the
// wrong path, so it is corrected here rather than left for the task that owns
// the call site.
//
// The direct setFacet therefore has no engine-level justification left; it is
// simply not yet migrated. Moving it to switchFacet is deferred to its own task.
//
// Some panels are deliberately NOT surfaces: the chunk picker and the zone/act
// tree only change selections, and the picker's selection feeds BOTH the map's
// stamp tool and the composer's Chunk tab. Claiming a facet from an ambiguous
// selection would repoint undo without the user editing anything, so they leave
// the facet on whichever surface the user was last actually working in.
//
// Spread `classicSurfaceProps(...)` onto a surface's root element rather than
// calling focusClassicSurface by hand, so every surface claims focus the same
// two ways: pointer-down (capture phase, so a child that stops propagation still
// counts) and focus-in (keyboard tabbing into a field never leaves undo pointing
// at the surface the user just left).

import { useSessionStore } from '../../state/sessionStore';
import { useWorkspaceStore } from '../../workspace/workspaceStore';
import { parseLevelTabId } from '../../shell/tabs';
import type { FacetCapability } from '../../../core/project/adapter';

/** The two classic editing surfaces, named after what the user sees. */
export type ClassicSurface = 'map' | 'art';

const FACET_FOR_SURFACE: Record<ClassicSurface, FacetCapability> = {
  map: 'layout',
  art: 'art',
};

/**
 * Record that the user is working in `surface` of the active classic level tab.
 * A no-op when the active tab is not a level tab (the classic pane stays mounted
 * but hidden while a sprite-doc tab is active) — a hidden surface must never
 * repoint another document's undo.
 */
export function focusClassicSurface(surface: ClassicSurface): void {
  const tabId = useSessionStore.getState().activeId;
  if (!parseLevelTabId(tabId)) return;
  const facet = FACET_FOR_SURFACE[surface];
  // Every pointer-down in the level would otherwise write a new workspace record
  // and wake the session-persistence subscription (a localStorage write per
  // click). Only an actual surface CHANGE is news.
  if (useWorkspaceStore.getState().facetFor(tabId) === facet) return;
  useWorkspaceStore.getState().setFacet(tabId, facet);
}

/**
 * Props that make an element's subtree claim `surface` when the user works in it.
 * Spread on the surface's root element:  `<div {...classicSurfaceProps('art')}>`.
 */
export function classicSurfaceProps(surface: ClassicSurface): {
  onPointerDownCapture: () => void;
  onFocusCapture: () => void;
} {
  const claim = (): void => focusClassicSurface(surface);
  return { onPointerDownCapture: claim, onFocusCapture: claim };
}
