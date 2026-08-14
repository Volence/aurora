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
// TWO SURFACES, FOUR FACETS — see SURFACE_FACETS. A surface claims a SET, and
// only speaks up when the current facet is outside it, because classic's four
// facets are served by two components and a pointer-down cannot tell the halves
// of a pair apart.
//
// switchFacet, not setFacet: it also re-scopes editorStore.tool via
// toolForFacet(). That was WRONG while classic ran its own tool vocabulary — it
// would have clobbered the classic tool with an aeon one — which is why this was
// setFacet until an earlier step merged the vocabularies. toolsForFacet() now
// reads openCapabilities().facetTools, and the s1 manifest declares layout's set
// (core/project/s1/index.ts), so the re-scope resolves to classic's own tools.
//
// A re-scope on every pointer-down would be its own bug — it would reset the
// user's tool mid-interaction — but there is no such thing: the already-served
// check below returns before switchFacet is reached, so the only calls that
// re-scope are genuine surface changes. That is the SECOND job the check does,
// and it is why L1's fix had to land with this one rather than after it.
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
import { switchFacet } from '../../workspace/facet-tools';
import { parseLevelTabId } from '../../shell/tabs';
import type { FacetCapability } from '../../../core/project/adapter';

/** The two classic editing surfaces, named after what the user sees. */
export type ClassicSurface = 'map' | 'art';

/**
 * The facets each surface SERVES, primary first. Deliberately not a 1:1 map:
 * classic grants four facets (core/project/s1/index.ts) and has two surfaces,
 * because each surface is the canvas of a PAIR of them —
 *
 *   • `map`  → `layout` + `objects`. One ClassicLevelViewport is the canvas of
 *     both (workspace/facets/s1-facets.tsx), and the object list and inspector
 *     sit in both facets' right column. The two differ only by which pill is lit
 *     and whether the chunk picker is in the panel.
 *   • `art`  → `art` + `palette`. One ClassicComposerDock is the canvas of both,
 *     and ClassicPalettePanel is in both facets' right column. Splitting them is
 *     step H's job, not this module's.
 *
 * So the surface a pointer-down lands in genuinely CANNOT say which half of the
 * pair the user means — it is literally the same component either way. A 1:1 map
 * therefore made two of the four facets unreachable in practice: light the
 * Objects pill, click anywhere in the map, and the claim wrote `layout` straight
 * back and the pill jumped under the pointer. Mirror-image for Palette.
 *
 * Hence: a surface claims only when the current facet is OUTSIDE its set. Inside
 * it, the user is already where they said they were and the surface has nothing
 * to add — the facet pill (or the agent, or a facet-visibility heal) is the only
 * thing that can move between the halves of a pair, which is correct, because it
 * is the only thing that knows which half was meant. Primary-first is what a
 * genuine cross-surface move lands on.
 *
 * Exported so the routing tests can read the real thing rather than a copy: this
 * and editorStore's ZONE_ART_FACETS are two statements of one fact (which
 * document a facet edits), and drift between them repoints Ctrl+Z with no other
 * symptom — see history-routing.test.ts.
 */
export const SURFACE_FACETS: Record<ClassicSurface, readonly FacetCapability[]> = {
  map: ['layout', 'objects'],
  art: ['art', 'palette'],
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
  const served = SURFACE_FACETS[surface];
  // Already inside a facet this surface serves ⇒ nothing to say. Load-bearing
  // three times: it keeps the sibling facet of each pair reachable (see
  // SURFACE_FACETS), it keeps every pointer-down in the level from writing a new
  // workspace record and waking the session-persistence subscription (a
  // localStorage write per click), and it keeps switchFacet's tool re-scope off
  // the pointer-down path (see the header). Only a surface CHANGE is news.
  if (served.includes(useWorkspaceStore.getState().facetFor(tabId))) return;
  switchFacet(tabId, served[0]);
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
