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
// facet-tools.switchFacet: switchFacet additionally re-scopes the AEON tool
// (editorStore.tool) to the facet's tool set, and classic runs its own tool
// system (classicLevelStore.tool) — so switchFacet here would mutate an unrelated
// store's tool on every click in the classic view.
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
