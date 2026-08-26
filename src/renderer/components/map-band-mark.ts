/**
 * WHEN A PRESS ON THE MAP IS A BAND MARK, decided out of `.tsx` so the node
 * suite can pin it (the shape `resolveEscape` took). `MapViewport`'s mousedown
 * asks this before recording a cell, and its mouseup asks it again before
 * `commitBandMark` — one predicate, two readers, so the press and the release
 * can never disagree about whether a mark was in progress.
 *
 * The mark used to be a side-effect of View: item 43 recorded on any left press
 * in the Effects facet and committed on a release that moved <5px, because View
 * was the facet's only tool and "taking the press would kill panning". That is
 * how every pan-click lit a wash the owner could not put out (triage
 * 2026-08-26 §A.2/§A.3). Now the mark is its own tool; View is a pure pan.
 *
 * Three gates, all required:
 *  - the tool is `mark-band` — View seeds nothing;
 *  - the author is in the Effects facet — the lens is that facet's, and the
 *    tool cannot be armed anywhere else (FACET_TOOLS), but the facet gate stays
 *    so a stale tool value on a facet switch cannot mark;
 *  - the LEFT button — middle is the universal pan, right is nobody's.
 */
import type { EditorTool } from '../state/editorStore';

export function shouldMarkBand(tool: EditorTool, inEffectsFacet: boolean, button: number): boolean {
  return tool === 'mark-band' && inEffectsFacet && button === 0;
}
