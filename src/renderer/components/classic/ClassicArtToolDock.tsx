import React from 'react';
import ArtToolDock from '../../shell/ArtToolDock';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { isClassicPixelTier } from '../../workspace/level-presence';
import { CLASSIC_TILE_TOOLS } from '../../../core/art/tool-config';

// Classic's Art facet is THREE sub-surfaces behind one facet — the composer's
// Chunk, Block and Tile tiers. ALL THREE can be pixel surfaces, but not always:
// each of Chunk and Block carries its own Assign|Paint toggle (Task 11,
// "decided" — see the plan doc's final section), defaulting to Assign, its
// original block/tile-assignment grid behaviour; only while a tier's own toggle
// says Paint does it compose its surface and mount PixelViewport +
// PixelEditController. Tile has no such toggle — it is unconditionally a pixel
// surface, as it always was.
//
// So the rail is gated on the tier's MODE, not on the tier alone and not on the
// facet. That is facet-chrome.ts's rule — A CONTROL THAT CANNOT ACT IS NOT DRAWN
// — applied one level deeper than facet granularity, because classic's Art
// facet is the one facet with more than one surface under it, and now more than
// one of THOSE has more than one mode. A pencil/fill/eyedropper column beside
// the Chunk tab's ASSIGNMENT grid is exactly the dead chrome that rule exists to
// prevent: eight armed tools for a canvas that, right now, has no pixels. The
// same column beside the Chunk tab's PAINT surface is the tools doing their job.
//
// WHY THE TIER IS NOT A `artTiers` FIELD: `artTiers` is a PROJECT-PROFILE type
// describing the data ladder (chunk → block → tile) that both the s1 and aeon
// adapters fill in. A tool set is a renderer concern; declaring it there would
// put a field in the contract that no loader reads and that the two adapters
// would immediately disagree about. The tier id is data; what a tier's tools ARE
// is this file's business.
//
// THE TOOL LIST IS NOT RESTATED HERE. `CLASSIC_TILE_TOOLS` is the one statement
// of which tools a pixel editor may arm — now the tool set for THREE tiers
// rather than one, but still one list — and each tab's `toolConfigFrom` coerces
// against the same list, so the rail can never offer a tool a controller would
// silently turn into a pencil. Spelling the eight names again here is how that
// guarantee would rot.
//
// NEITHER IS THE TIER-MODE PREDICATE: `isClassicPixelTier` lives in
// level-presence.ts because LevelWorkspace needs the same answer to suppress
// EditorShell's 44px rail CONTAINER — returning null from here empties the
// column, it does not remove it. Both gates, one predicate.

/** The art tool rail, drawn only while the active tier is currently a pixel surface. */
export default function ClassicArtToolDock(): React.ReactElement | null {
  const composerTab = useClassicLevelStore((s) => s.composerTab);
  const chunkPaintMode = useClassicLevelStore((s) => s.chunkPaintMode);
  const blockPaintMode = useClassicLevelStore((s) => s.blockPaintMode);
  if (!isClassicPixelTier(composerTab, chunkPaintMode, blockPaintMode)) return null;
  return <ArtToolDock tools={CLASSIC_TILE_TOOLS} />;
}
