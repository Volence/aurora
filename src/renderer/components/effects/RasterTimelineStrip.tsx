// THE RASTER TIMELINE STRIP — the panel half of `canvas/raster-timeline.ts`.
//
// READ-ONLY, AND THAT IS A RULING RATHER THAN AN OMISSION. Aeon's N-bands design
// (`docs/superpowers/specs/2026-08-28-raster-band-ownership-design.md`, aeon
// `0bee83c61e9c53ade6899f7389f666720215caf7`) decides band ownership and edge
// semantics and is not landed. So this component has no pointer handlers, no
// drag, no create/delete, and writes nothing: it draws where the scene's bands
// and splits land, and stops there. The geometry module's docblock carries the
// coordinate-space derivation the whole strip rests on.
//
// WHY IT LIVES IN THE COLUMN AND NOT ON THE MAP. The map already carries this
// scene's layer guides, in the MAP's world axis. The strip is the same layers on
// the SCREEN axis — 0..223 down one frame — and the two axes are only
// commensurable under the lock. Painting a second ruler over the act canvas
// would put those two axes on top of each other, which is precisely the picture
// this parcel exists to not draw. In the column it is a lens beside the map, and
// the split between them is legible.
//
// NO CLOCK. It draws in a layout effect off the same render the panel already
// does on a store change; nothing is scheduled and no rAF is mounted.

import React from 'react';
import { T, CollapsibleSection, SectionBody } from '../ui';
import { Hint } from './column-layout';
import { useProjectStore } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { useEditorStore } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { resolveSelectedScene, layerTopSpace } from '../../providers/effects-aeon';
import { EFFECTS_V_OFFSET_DEFAULT } from '../../../core/formats/effects/scene-ui';
import { cameraPreviewPlan } from '../../canvas/camera-preview';
import {
  drawRasterTimeline, rasterTimelineView, publishRasterTimelineReport,
  inactiveRasterTimelineReport,
  RASTER_TIMELINE_W, RASTER_TIMELINE_H,
} from '../../canvas/raster-timeline';
import type { EffectsSceneLibrary } from '../../../core/formats/effects/scene';

const EMPTY_LIBRARY: EffectsSceneLibrary = { scenes: [], unreadable: [], notices: [] };

/**
 * The camera the strip is drawn for — the SAME resolution `MapViewport`'s
 * `frameAnchorFor` uses, and it must stay the same one.
 *
 * ⚠ ON A LOCKED SCENE THE FRAME'S Y IS `v_offset`, NOT THE SESSION ANCHOR. The
 * lock's entire content is that the vertical stopped being about the camera
 * (`effects-guides.ts`'s origin block derives it in four steps from
 * `Parallax_Step5_Vscroll`). A strip that read the session anchor for Y would
 * slide every band the moment the author dragged the view box sideways-and-down,
 * and would disagree with the rectangle on the map — the exact "two rulers, one
 * picture" failure this surface is shaped to avoid.
 */
function stripCamera(
  scene: Parameters<typeof layerTopSpace>[0] & { v_offset?: number },
  session: { x: number; y: number },
): { x: number; y: number } {
  if (layerTopSpace(scene) !== 'screen') return session;
  return { x: session.x, y: scene.v_offset ?? EFFECTS_V_OFFSET_DEFAULT };
}

export default function RasterTimelineStrip(): React.ReactElement {
  // Same subscription set as `EffectsScenePanel`: a scene edit mutates the
  // project in place, so the history version is what makes a repaint happen.
  useHistoryVersion();
  const project = useProjectStore((s) => s.project);
  const selectedId = useEditorStore((s) => s.selectedEffectsSceneId);
  // The frame anchor, SUBSCRIBED rather than read with getState(): the strip has
  // to repaint when the author drives the camera, and `getState()` in a render
  // body reads a value nothing re-renders on.
  const screenFrame = useViewStore((s) => s.screenFrame);

  const library = project?.effectsScenes ?? EMPTY_LIBRARY;
  const scene = resolveSelectedScene(library, selectedId);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // The view-model, PER RENDER and thrown away — the parcel's boundary. Nothing
  // here is stored, and no shape here is a document.
  //
  // ⚠ DELIBERATELY NOT MEMOISED. A scene edit MUTATES the project in place
  // (`useHistoryVersion` is why this component re-renders at all), so a
  // `useMemo` keyed on the scene object would hold a stale view across exactly
  // the edits this strip exists to make visible. The plan is a walk over at most
  // `EFFECTS_LAYER_COUNT.max` layers; caching it would buy nothing and cost the
  // whole feature.
  const view = scene === null ? null : (() => {
    const cam = stripCamera(scene, screenFrame);
    return rasterTimelineView(scene, cameraPreviewPlan(scene, cam.x, cam.y));
  })();

  React.useLayoutEffect(() => {
    const cv = canvasRef.current;
    if (cv === null || view === null) {
      publishRasterTimelineReport(inactiveRasterTimelineReport());
      return;
    }
    const ctx = cv.getContext('2d');
    if (ctx === null) {
      publishRasterTimelineReport(inactiveRasterTimelineReport());
      return;
    }
    const counts = drawRasterTimeline(ctx, view);
    publishRasterTimelineReport({
      active: true,
      sceneId: view.sceneId,
      space: view.space,
      lines: inactiveRasterTimelineReport().lines,
      scale: inactiveRasterTimelineReport().scale,
      originY: inactiveRasterTimelineReport().originY,
      stripX: inactiveRasterTimelineReport().stripX,
      stripW: inactiveRasterTimelineReport().stripW,
      bands: view.bands,
      splits: view.splits,
      notices: view.notices,
      absent: view.absent,
      fills: counts.fills,
      markers: counts.markers,
    });
  });

  return (
    // ⚠ NOT `defaultCollapsed`, and that is the parcel rather than a preference.
    // `CollapsibleSection` renders `{!collapsed && children}` — a collapsed
    // section does not mount its children at all, so the canvas would not exist
    // and the strip would be invisible until the author found a chevron. The
    // whole defect being closed here is that `vsplit.at` is authorable and
    // unseeable; shipping the fix behind a disclosure is shipping the defect.
    <CollapsibleSection id="aeon.effects.timeline" title="Raster timeline">
      <SectionBody>
        {scene === null && (
          <Hint>Select a scene to see where its bands and splits land down the frame.</Hint>
        )}
        {scene !== null && (
          <>
            <canvas
              id="effects-raster-timeline"
              ref={canvasRef}
              width={RASTER_TIMELINE_W}
              height={RASTER_TIMELINE_H}
              // ⚠ FIXED INTRINSIC SIZE, CSS-SCALED AT MOST. The backing store is
              // constant, so the strip's pixels are in strip space with no
              // `devicePixelRatio` factor — the class of off-by-one that cost a
              // review cycle on this surface cannot arise here.
              style={{
                display: 'block', width: RASTER_TIMELINE_W, maxWidth: '100%',
                border: `1px solid ${T.border}`, borderRadius: T.rMd,
              }}
            />
            {view !== null && view.notices.map((n) => (
              <Hint key={n} tone="warning" style={{ marginTop: T.s2 }}>{n}</Hint>
            ))}
            {view !== null && view.splits
              .filter((s) => s.refusal !== null)
              .map((s) => (
                <Hint key={`refusal-${s.layer}`} tone="warning" style={{ marginTop: T.s2 }}>
                  Layer {s.layer}&apos;s split {s.refusal}
                </Hint>
              ))}
            <Hint under style={{ marginBottom: 0 }}>
              Read-only. A split is one edge: from its line to the bottom of the frame,
              until the next split. Palette bands are not drawn yet.
            </Hint>
          </>
        )}
      </SectionBody>
    </CollapsibleSection>
  );
}
