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

// ═══ THREE SUB-TABS, ONE JOB EACH (d-26b, EW-SHAPE-TABS) ═══
//
// The column below used to mount every panel at once: 742px visible against
// 4,843px of content with everything open, with the LAYERS list pinned at its
// 160px floor because the column was over-subscribed before the list was
// reached. The owner could not use it. `providers/effects-sub-tabs` declares
// which section belongs to which job and a node row pins that table against the
// panels; here, each job is one already-existing panel, which is why this is a
// RE-PARENTING and not a rewrite:
//
//     Parallax   EffectsScenePanel      scenes · layers · scene · assignment
//     Colour     RasterTimelineStrip + BandPresetPanel
//     Tile anim  BgAnimBandPanel
//
// ⚠ THE STRIP IS OUTSIDE THE TABS AND MUST STAY THERE. It is `position: sticky`
// on a DIRECT CHILD of this scrolling `Panel`; sticky resolves against the
// nearest scrollport, so re-parenting it into a tab body would silently stop it
// sticking while every text assertion about it kept passing.
//
// ⚠ AND THE SECTIONS ARE UNMOUNTED, NOT HIDDEN. `display: none` would have kept
// every harness's text finder green while the control was unreachable — the
// exact failure this facet has already met once (a section scrolled 2,635px out
// of its scroller passes `checkVisibility()`). A tab that is not shown renders
// nothing.

import React from 'react';
import AeonPropertiesPanel from '../../components/AeonPropertiesPanel';
import SectionPicker from '../../components/effects/SectionPicker';
import EffectsSubTabBar from '../../components/effects/EffectsSubTabBar';
import EffectsScenePanel from '../../components/effects/EffectsScenePanel';
import BgAnimBandPanel from '../../components/effects/BgAnimBandPanel';
import BandPresetPanel from '../../components/effects/BandPresetPanel';
import RasterTimelineStrip from '../../components/effects/RasterTimelineStrip';
import EffectsToolOptions from '../../components/effects/EffectsToolOptions';
import { Panel, CollapsibleSection } from '../../components/ui';
import { useEditorStore } from '../../state/editorStore';
import { mapFacet, type FacetModule } from '../facet-registry';

/**
 * The active job's sections, as DIRECT CHILDREN of the column.
 *
 * A fragment rather than a wrapper `<div>`, and that is load-bearing: the
 * column's flex model gives a `variant="list"` section a share of what the
 * content sections leave (ui/CollapsibleSection), and a wrapper would collapse
 * all of it into one content-sized box — the LAYERS list would go back to its
 * floor with a nested scrollbar, which is the defect this parcel is about.
 */
function EffectsSubTabBody(): React.ReactElement {
  const tab = useEditorStore((s) => s.effectsSubTab);
  if (tab === 'colour') {
    return (
      <>
        {/* THE RASTER TIMELINE IS THE COLOUR JOB'S, and this is a call made
            here rather than by the mockup, which does not draw it. Its PRESET
            column is editable — drag a palette band's edge, split it — and
            those bands are this tab's subject; its layer column is read-only
            context. It stays above the preset form for the same reason it used
            to sit under the scene: it is the picture of what the form edits.
            Reversible in one line by moving it into the Parallax branch. */}
        <RasterTimelineStrip />
        {/* A DIFFERENT DOCUMENT FROM THE SCENE PANEL, and the panel says so: a
            scene is a `parallax_config`, a preset is an `EffectsPreset` whose
            raster program is one channel. A `bands` key on a scene file is
            refused. They shared a column; they now do not even share a tab.

            IT ARRIVES COLLAPSED AND CARRIES ITS OWN LIMITS. Nothing in THIS
            editor draws one of these bands (one frame of one has been looked
            at, once, in aeon's emulator — aeon `4a4d3474`, 2026-08-30 — and no
            preview here is built against it), and saving a preset does not
            install it — the panel states both in full, unhidden, because the
            failure mode this surface has is a promise, not a bug. */}
        <BandPresetPanel />
      </>
    );
  }
  if (tab === 'tileAnim') {
    // THE TILE-ANIMATION EDITOR, ALONE ON ITS OWN TAB. It used to sit directly
    // above the raster band presets, which is how one author read "band" as one
    // feature across two unrelated ones (walkthrough §c1, the most expensive
    // confusion in the log). They are now two tabs with two names that share no
    // word.
    //
    // THE PREVIEW IS INSIDE THIS PANEL, NOT BESIDE IT (ROADMAP item 45): the
    // per-band status is folded into the band card and the rest (playback chip,
    // honesty label, the two column-wide warnings) renders as a strip at the
    // top of the section.
    return <BgAnimBandPanel />;
  }
  // PARALLAX — the default, and the job a scene needs.
  return <EffectsScenePanel />;
}

function EffectsPanels() {
  return (
    <Panel width={300} scroll>
      {/* WHICH SECTION AM I EDITING, AND WHICH JOB AM I DOING — FIRST, STICKY,
          AND NEVER COLLAPSIBLE. (EFFECTS-W1 defect 4; EW-SHAPE-STRIP.) The two
          per-section bindings this facet carries act on one store value that
          was set on a different tab and named nowhere here; a cold reader spent
          eight minutes editing a scene the section did not use. The sub-tab bar
          rides in the same sticky box — see EffectsSubTabBar's docblock for why
          it is a child of the strip and not a sibling of it. */}
      <SectionPicker><EffectsSubTabBar /></SectionPicker>
      <EffectsSubTabBody />
      {/* PROPERTIES IS OUTSIDE THE THREE JOBS, DELIBERATELY. It is the facet's
          generic aeon readout — subscriptions live in the AeonPropertiesPanel
          leaf, the reason its own docblock gives — and it is about whatever is
          selected rather than about parallax, colour or tiles. Putting it on
          one of the three would have made that tab's list of contents a lie;
          collapsed, it costs every tab one 25px header. */}
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
