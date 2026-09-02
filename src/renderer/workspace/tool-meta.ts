// Human-facing names for the one tool vocabulary (core's ToolId / the
// renderer's EditorTool).
//
// Split out of MapFacetDock's TOOL_META, which pairs each label with a React
// icon component and so could not be reused by anything that isn't rendering
// that dock. Classic's chip row needs the labels and not the icons; keeping
// them here means the two surfaces cannot drift into calling the same tool
// different things — which they did, for years: aeon's dock said "View" where
// classic's chip said "Pan" for what is now literally the same tool value.
//
// No React import, so this is node-testable and the exhaustiveness test over
// TOOL_IDS can actually run.

import { TOOL_IDS, type ToolId } from '../../core/project/adapter';

/** Dock/chip label for each tool. Exhaustive over ToolId by construction. */
export const TOOL_LABELS: Record<ToolId, string> = {
  view: 'View',
  select: 'Select',
  marquee: 'Marquee',
  'paint-tile': 'Paint Tile',
  'paint-block': 'Paint Block',
  'stamp-chunk': 'Stamp Chunk',
  'paint-collision': 'Paint Collision',
  'place-object': 'Place Object',
  'place-ring': 'Place Ring',
  'mark-band': 'Mark tile animation',
  'stamp-band': 'Stamp tile animation',
};

/**
 * One-line "what this tool does" for each tool — the map status bar's hint line
 * and the classic chip row's tooltip.
 *
 * Written to be true under BOTH engines, which is the constraint that moved
 * them out of MapStatusBar's TOOL_INFO: an aeon-only modifier stated as fact
 * ("Alt: art only", which classic's stamp does not implement) reads as a lie in
 * classic's tooltip. Engine-specific detail belongs in the caller's own context
 * line, where the status bar already puts the selected chunk.
 */
export const TOOL_HINTS: Record<ToolId, string> = {
  view: 'Click + drag to pan, scroll to zoom',
  select: 'Click to select, drag to move, Del to remove',
  marquee: 'drag to select · Ctrl+C copy · Ctrl+V paste · X/Y flip · S save as chunk · Esc clear',
  'paint-tile': 'Click to place the selected tile, right-click to pick',
  'paint-block': 'Click to place a 16×16 px block (2×2 tiles)',
  'stamp-chunk': 'Select a chunk, then click or drag to stamp it',
  'paint-collision': 'Click to set the collision type on tiles',
  'place-object': 'Click to place the selected object type',
  'place-ring': 'Click to place the selected ring pattern',
  'mark-band': 'Click a background cell to mark a tile animation there; drag to pan · Esc hides the lens',
  'stamp-band': 'Pick a tile animation in the Art panel, then click to lay one pattern or drag a region to tile it',
};

/**
 * The hotkey letter that arms each tool — the ONE table `MapViewport`'s keydown
 * branch reads. It was a `switch` of `case 'v'` … `case 'm'` inside the
 * viewport, which nothing could enumerate; a table can be asserted collision-
 * free against FACET_TOOLS (workspace/__tests__/facet-tools.test.ts). Letters
 * are unique across the WHOLE vocabulary, not just within a facet, so a tool
 * moving between facets can never start shadowing a neighbour.
 *
 * `n` for the band mark: `b` is paint-block's, `m` is marquee's, and the layout
 * facet holds v/s/m/t/b/k — parcel B picked the letter against that table,
 * not by guess.
 *
 * `d` for the band stamp (parcel J): it joins the layout facet, whose letters
 * are v/s/m/t/b/k, and `n` is mark-band's across the vocabulary.
 */
export const TOOL_KEYS: Record<ToolId, string> = {
  view: 'v',
  select: 's',
  marquee: 'm',
  'paint-tile': 't',
  'paint-block': 'b',
  'stamp-chunk': 'k',
  'paint-collision': 'c',
  'place-object': 'o',
  'place-ring': 'r',
  'mark-band': 'n',
  'stamp-band': 'd',
};

/** The tool a bare (unmodified) key arms, or null when the key is no tool's. */
export function toolForKey(key: string): ToolId | null {
  for (const id of TOOL_IDS) if (TOOL_KEYS[id] === key) return id;
  return null;
}

/**
 * The dock's BUTTON ORDER, which is not the facet's tool order.
 *
 * `toolsForFacet` answers a different question — its FIRST entry is the facet's
 * default tool (facet-tools.ts, toolForFacet) — and the two profiles disagree
 * about where View goes in that list: classic declares layout as
 * `view / stamp-chunk / select` so View is its default, while the shell default
 * for objects is `place-object / select / view`. Rendering in that order put
 * View at the TOP of the rail on Layout and the BOTTOM on Objects, so the armed
 * tool moved under the cursor on every facet switch.
 *
 * Sorting the buttons by the one vocabulary order (core's TOOL_IDS) decouples
 * the two: a profile still says what a facet leads with, and the rail still
 * looks the same everywhere.
 */
export function dockOrder(tools: readonly ToolId[]): ToolId[] {
  return [...tools].sort((a, b) => TOOL_IDS.indexOf(a) - TOOL_IDS.indexOf(b));
}

/** Every tool id, in vocabulary order. Re-exported so callers that only need
 *  labels don't reach past this module into the adapter. */
export { TOOL_IDS };
export type { ToolId };
