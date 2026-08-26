// Effects facet — the act through the parallax/raster lens (schema §2 scenes,
// §3 per-section assignment).
//
// A LENS, NOT A NEW CANVAS. The right-hand column is the scene editor; the canvas
// stays `MapViewport`, unchanged, so the author edits a scene with the act it
// belongs to in front of them. That is the whole reason this is `mapFacet` and
// not a canvas-swapping facet like `art`.
//
// IT SHOWS WHAT THE BANDS DO, AND STILL NOTHING THE SCENES DO. Item 42 landed
// the BgAnim half of the preview parcel governed by
// docs/reviews/2026-08-22-preview-posture-ruling.md: `MapViewport` blits the
// current phase of each licensed band over Plane B, and the band panel below
// carries the control, the honesty label and the per-band verdicts (item 45
// folded them into the band cards). The SCENE half (§2 scroll factors,
// SceneDeform, vsplit) is still unpreviewed and is wave 2.
//
// THE ZERO-IDLE-REPAINT PROPERTY IS CONDITIONED, NOT SPENT. The clock is local
// to `MapViewport`, mounts only while playback is on AND a drawable band reads
// it, and repaints on a step change rather than on a tick. With the toggle off —
// the default — there is no rAF at all and the measured idle cost is unchanged.
// The one driver that reads a clock is `timer`; `camera_x`/`camera_y` bands
// preview clocklessly out of the draw pass that already repaints on a pan,
// because their phase is a function of the camera and previewing them on a wall
// clock would teach a driver model the engine does not have.
//
// THE CAPABILITY IS `parallax`, which already existed in FACET_CAPABILITIES
// (project/adapter.ts) as one of three declared-ahead-of-time keys, exactly so a
// profile could grant it before the facet was built. This is that facet.
//
// ON THE ORDER NUMBER (15): core/shell/facets.ts's ordering rule says map-canvas
// facets go before `art`, and its own docblock names "parallax 15" as the worked
// example of a facet slotting into the gaps. Followed rather than re-argued.

import React from 'react';
import AeonPropertiesPanel from '../../components/AeonPropertiesPanel';
import EffectsScenePanel from '../../components/effects/EffectsScenePanel';
import BgAnimBandPanel from '../../components/effects/BgAnimBandPanel';
import EffectsToolOptions from '../../components/effects/EffectsToolOptions';
import { Panel, CollapsibleSection } from '../../components/ui';
import { mapFacet, type FacetModule } from '../facet-registry';

function EffectsPanels() {
  return (
    <Panel width={300} scroll>
      <EffectsScenePanel />
      {/* The BgAnim band editor belongs in THIS column, not a facet of its own.
          A band is the tile-blob half of the same parallax lens the scenes are
          the scroll half of — both are authored against the act in the canvas
          beside them, both live in the `parallax` capability, and splitting them
          would make an author switch facets to answer "what does this background
          do". Wave-1 surface 4, part 3 (ROADMAP item 28). */}
      {/* THE PREVIEW IS INSIDE THIS PANEL, NOT BESIDE IT (ROADMAP item 45).
          Item 42 mounted `BgAnimPreviewNote` here as a section of its own, and
          it drew a second card per band beside the band editor's — one band,
          two cards, in a column that overflowed. The per-band status is folded
          into the band card and the rest (playback chip, honesty label, the two
          column-wide warnings) renders as a strip at the top of
          `BG animation bands`. Still not on the canvas, for item 42's reason:
          what has to be said is per band, which is a list, and a badge painted
          over the map would be chrome every aeon author pays for. */}
      <BgAnimBandPanel />
      {/* Subscriptions live in the AeonPropertiesPanel leaf, not this column —
          the reason its own docblock gives. */}
      <CollapsibleSection id="aeon.props" title="Properties" defaultCollapsed>
        <AeonPropertiesPanel />
      </CollapsibleSection>
    </Panel>
  );
}

// THE TOOL-OPTIONS BAR CARRIES THE TWO BAND VERBS (parcel B). Both band
// sections in the column arrive collapsed, so until this bar nothing on the
// canvas or the dock said a band could be made at all. The chips run the SAME
// two commands the panel runs, disabled with the same reasons — one derivation
// in providers/band-verbs, read by both.
export const effectsFacet: FacetModule = mapFacet('parallax', {
  ToolOptions: EffectsToolOptions,
  RightPanel: EffectsPanels,
});
