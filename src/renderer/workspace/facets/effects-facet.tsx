// Effects facet — the act through the parallax/raster lens (schema §2 scenes,
// §3 per-section assignment).
//
// A LENS, NOT A NEW CANVAS. The right-hand column is the scene editor; the canvas
// stays `MapViewport`, unchanged, so the author edits a scene with the act it
// belongs to in front of them. That is the whole reason this is `mapFacet` and
// not a canvas-swapping facet like `art`.
//
// IT SHOWS NOTHING THE SCENE DOES, deliberately. Previewing scene output is its
// own parcel, governed by docs/reviews/2026-08-22-preview-posture-ruling.md, and
// wave 1 adds no clock, no overlay pass and no rAF anywhere near this surface —
// the MapViewport measurement's zero-idle-repaint property is left intact.
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
      <BgAnimBandPanel />
      {/* Subscriptions live in the AeonPropertiesPanel leaf, not this column —
          the reason its own docblock gives. */}
      <CollapsibleSection id="aeon.props" title="Properties" defaultCollapsed>
        <AeonPropertiesPanel />
      </CollapsibleSection>
    </Panel>
  );
}

export const effectsFacet: FacetModule = mapFacet('parallax', { RightPanel: EffectsPanels });
