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

/** Every tool id, in vocabulary order. Re-exported so callers that only need
 *  labels don't reach past this module into the adapter. */
export { TOOL_IDS };
export type { ToolId };
