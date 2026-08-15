import React from 'react';
import ArtToolDock from '../../shell/ArtToolDock';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { isClassicPixelTier } from '../../workspace/level-presence';
import { CLASSIC_TILE_TOOLS } from '../../../core/art/tool-config';

// Classic's Art facet is THREE sub-surfaces behind one facet — the composer's
// Chunk (block-assignment grid), Block (tile-assignment composer) and Tile (8x8
// pixel editor) tiers. Only the Tile tier is a pixel surface: it is the one that
// mounts PixelViewport + PixelEditController, and the only one whose canvas the
// tools below can touch. Chunk and Block paint with a block/tile brush chosen in
// their own inline controls and never read `artStore.tool` at all.
//
// So the rail is gated on the tier, not on the facet. That is facet-chrome.ts's
// rule — A CONTROL THAT CANNOT ACT IS NOT DRAWN — applied one level deeper than
// facet granularity, because classic's Art facet is the one facet with more than
// one surface under it. A pencil/fill/eyedropper column beside the chunk grid is
// exactly the dead chrome that rule exists to prevent: eight armed tools for a
// canvas with no pixels.
//
// WHY THE TIER IS NOT A `artTiers` FIELD: `artTiers` is a PROJECT-PROFILE type
// describing the data ladder (chunk → block → tile) that both the s1 and aeon
// adapters fill in. A tool set is a renderer concern; declaring it there would
// put a field in the contract that no loader reads and that the two adapters
// would immediately disagree about. The tier id is data; what a tier's tools ARE
// is this file's business.
//
// THE TOOL LIST IS NOT RESTATED HERE. `CLASSIC_TILE_TOOLS` is the one statement
// of which tools a tile editor may arm, and TileTab's `toolConfigFrom` coerces
// against the same list — so the rail can never offer a tool the controller
// would silently turn into a pencil. Spelling the eight names again here is how
// that guarantee would rot.
//
// NEITHER IS THE TIER PREDICATE: `isClassicPixelTier` lives in level-presence.ts
// because LevelWorkspace needs the same answer to suppress EditorShell's 44px
// rail CONTAINER — returning null from here empties the column, it does not
// remove it. Both gates, one predicate.

/** The art tool rail, drawn only while the composer is on its pixel tier. */
export default function ClassicArtToolDock(): React.ReactElement | null {
  const composerTab = useClassicLevelStore((s) => s.composerTab);
  if (!isClassicPixelTier(composerTab)) return null;
  return <ArtToolDock tools={CLASSIC_TILE_TOOLS} />;
}
