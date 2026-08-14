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
  eraser: 'Eraser',
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
  marquee: 'drag to select · Ctrl+C copy · Ctrl+V paste · S save as chunk · Esc clear',
  'paint-tile': 'Click to place the selected tile, right-click to pick',
  'paint-block': 'Click to place a 16×16 px block (2×2 tiles)',
  'stamp-chunk': 'Select a chunk, then click or drag to stamp it',
  'paint-collision': 'Click to set the collision type on tiles',
  'place-object': 'Click to place the selected object type',
  'place-ring': 'Click to place the selected ring pattern',
  eraser: 'Click to erase tiles',
};

/** Every tool id, in vocabulary order. Re-exported so callers that only need
 *  labels don't reach past this module into the adapter. */
export { TOOL_IDS };
export type { ToolId };
