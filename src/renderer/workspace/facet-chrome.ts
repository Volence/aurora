// Which of a facet's chrome slots are LIVE right now.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// ---------------------------------------------------------------------------
// A level tab can be open with no act loaded — a classic tab whose act failed
// to read, a tab restored before its act finishes loading, `__dbg.resetLevel()`.
// Until this module, every facet kept its whole frame in that state and only the
// CANVAS knew it had nothing: the Layout facet drew a `Chunks` section header
// over 700px of void, a live FG/BG pair, three armed tools and a 58% zoom
// readout; the Art facet drew two empty section headers and a status bar
// reporting the selected chunk id of an act that is not loaded; the Objects
// facet drew a fully interactive 23-object library with nowhere to place
// anything. Three different-looking screens, all of them the same nothing, and
// all of them reading as a crash rather than as a resting state.
//
// The rule is one line: A CONTROL THAT CANNOT ACT IS NOT DRAWN. With no act,
// every slot but the canvas is exactly that — the docks arm tools for a document
// that does not exist, the plane chips and the View menu paint a map that is not
// there, the panels select things nothing can consume, and the status bar
// reports stale per-act state. So the canvas keeps the floor to itself and says
// the one true thing.
//
// THE CANVAS IS NEVER SUPPRESSED, and that is the point: it is the only slot
// that already distinguishes loading / error / idle (see
// s1-facets.tsx's ClassicComposerCanvas and ClassicLevelViewport, whose three
// branches are deliberately worded the same). Short-circuiting the whole facet
// to one "nothing open" panel here would have thrown the load error away.
//
// A PURE FUNCTION, not an inline conditional in LevelWorkspace: the renderer
// suite is node-only and does not collect .tsx, so a decision written inside the
// component is a decision nothing can test. This is the whole of it, and
// __tests__/facet-chrome.test.ts is the guard.

import type { FacetCapability } from '../../core/project/adapter';

/** Every slot LevelWorkspace can fill, minus the canvas (always drawn). */
export interface FacetChrome {
  readonly toolDock: boolean;
  readonly toolOptions: boolean;
  readonly rightPanel: boolean;
  readonly bottomExtra: boolean;
  readonly statusBar: boolean;
  /** The FG/BG plane pair in the workspace header. */
  readonly planeChips: boolean;
  /** The View (overlay) menu in the workspace header. */
  readonly viewMenu: boolean;
}

const NOTHING: FacetChrome = {
  toolDock: false, toolOptions: false, rightPanel: false, bottomExtra: false,
  statusBar: false, planeChips: false, viewMenu: false,
};

/**
 * THE LIST OF PLANE-GATED FACETS — every facet whose canvas IS the map, and so
 * every facet where the FG/BG chips visibly do something. Moved here from
 * LevelWorkspace with its reasoning, which is a list of the FAILURES each
 * omission causes rather than a taxonomy:
 *
 *  - `objects` is load-bearing under BOTH engines (guarded in
 *    __tests__/facet-visibility.test.ts). Classic gates object editing on the
 *    plane outright — select and place-object only act on FG, and fall through
 *    to pan on BG — so an objects facet with no plane control is one whose tools
 *    silently do nothing whenever the plane was left on BG. Aeon does not gate
 *    the placement, but renders only Plane B on BG and draws the object overlay
 *    solely in the FG branch, so the same omission strands you on a canvas where
 *    every object is invisible.
 *  - `rings` is the IDENTICAL aeon bug: the ring overlay draws only in the FG
 *    branch and `place-ring` carries no plane guard, so on BG the facet is a
 *    canvas with no rings and a tool writing invisible ones.
 *  - `palette` is view-only, so nothing writes invisibly — but its canvas is
 *    still the plane-gated map, and with no chip a plane left on BG shows Plane
 *    B under a palette editor for art you cannot see. It is on the list because
 *    the chip is LIVE there, which is the actual rule; a chip is dead chrome
 *    only where the canvas ignores it.
 *
 * That leaves exactly one served facet off: `art`, whose canvas is a composer
 * under both engines and reads no plane at all.
 */
const PLANE_GATED: readonly FacetCapability[] = ['layout', 'objects', 'rings', 'collision', 'palette'];

export function isPlaneGated(facet: FacetCapability): boolean {
  return PLANE_GATED.includes(facet);
}

/**
 * @param actLoaded  whether the OPEN ENGINE has a level document to edit
 * @param facet      the resolved facet, or null when the engine serves none
 * @param has        which slots the facet module actually supplies
 * @param mapOverlays  the module's own flag: true iff its canvas paints
 *                     `viewStore.overlays` (the art composer does not, so a View
 *                     menu over it would be a control that visibly does nothing)
 */
export function facetChrome(
  actLoaded: boolean,
  facet: FacetCapability | null,
  has: {
    readonly toolDock: boolean; readonly toolOptions: boolean;
    readonly rightPanel: boolean; readonly bottomExtra: boolean;
    readonly statusBar: boolean; readonly mapOverlays: boolean;
  },
): FacetChrome {
  // An unserved facet has no slots to arbitrate; LevelWorkspace renders
  // FacetUnavailable in the canvas and nothing else.
  if (facet === null) return NOTHING;
  if (!actLoaded) return NOTHING;
  return {
    toolDock: has.toolDock,
    toolOptions: has.toolOptions,
    rightPanel: has.rightPanel,
    bottomExtra: has.bottomExtra,
    statusBar: has.statusBar,
    planeChips: isPlaneGated(facet),
    viewMenu: has.mapOverlays,
  };
}
