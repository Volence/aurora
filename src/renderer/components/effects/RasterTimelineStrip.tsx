// THE RASTER TIMELINE STRIP — the panel half of `canvas/raster-timeline.ts`.
//
// ═══ EDITING LANDED 2026-08-30 (ROADMAP §5.1 row 94) ═══
//
// The PRESET column carries pointer handlers now: drag either edge of a palette
// band, double-click or Alt-click inside one to split it, one undo step per
// gesture. Every rule those gestures obey — what bounds an edge, what a split
// is, why the cut line goes clear — is declared in `providers/effects-preset.ts`
// and derived there from aeon's shipped `raster_dsl.emp`. Nothing in this file
// spells a bound; if you find yourself writing a comparison here, it belongs
// there.
//
// The LAYER column and the split rules stay READ-ONLY, and that is a ruling
// rather than an omission this time: a layer top is an ACT coordinate authored
// on the map by a guide, and a second ruler in a different space editing the
// same number is the "two rulers, one picture" failure the whole strip is
// shaped to avoid. ⚠ THE CLOCK IS ALSO NOT HERE — row 95, gated on aeon's DoD
// item 4 (P2b plus the time-driven anchor mover, still design-only).
//
// The three paragraphs below are the RECORD OF THE RULING THIS PARCEL
// DISCHARGED, kept verbatim. They are why the correction above is written down
// at all.
//
// ── the discharge note, 2026-08-29 ─────────────────────────────────────────
// READ-ONLY — AND ⚠ THE RULING BELOW IS DISCHARGED; THIS IS NOW AN OMISSION,
// NOT A RULING. Read this paragraph before the next one.
//
// The original ruling deferred editing until aeon's N-bands design landed.
// **It landed on 2026-08-28** — that design's own status banner records parcels
// P1, P2a and `parcel/band-first-consumer` all shipped, N bands exercised by
// `OJZ_BandDemo` in both canonical shapes on every build, cap three from the
// program buffer; only P2b/P3 remain design-only. So the stated ground is
// satisfied and editing is UNBLOCKED. See ROADMAP §5.1 row 94 for the parcel
// (split/edge drag) and row 95 for the clock, which is separately gated on
// aeon's item 4 and is NOT unblocked by the above.
//
// This correction is banked here rather than only in the roadmap because the
// paragraph below outlived the fact it rested on for a full day and was still
// reading as a live ruling: a stale ruling inside a comment outlives every doc
// that recorded its revision, since nothing re-reads a comment to check whether
// the rule it cites still holds. Found 2026-08-29, only because the parcel it
// forbade was proposed.
//
// ── the original ruling, kept as the record of what was believed ────────────
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
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { useViewStore } from '../../state/viewStore';
import { useEditorStore, executeCommand } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { resolveSelectedScene, layerTopSpace } from '../../providers/effects-aeon';
import {
  resolveSelectedPreset, setBandFieldCommand, splitBandCommand,
  bandEdgeNotice, bandSplitRefusal, BAND_SPLIT_LAW,
} from '../../providers/effects-preset';
import { EFFECTS_V_OFFSET_DEFAULT } from '../../../core/formats/effects/scene-ui';
import { cameraPreviewPlan } from '../../canvas/camera-preview';
import {
  drawRasterTimeline, rasterTimelineView, publishRasterTimelineReport,
  publishRasterTimelinePointer, inactiveRasterTimelineReport,
  presetEdgeAt, presetBandAt, presetDragFor, stripYToLine,
  RASTER_TIMELINE_W, RASTER_TIMELINE_H, RASTER_TIMELINE_GRAMMAR,
  RASTER_TIMELINE_GESTURES,
  type RasterTimelinePresetDrag,
} from '../../canvas/raster-timeline';
import type { EffectsSceneLibrary } from '../../../core/formats/effects/scene';
import type { EffectsPresetLibrary } from '../../../core/formats/effects/preset';
import type { AnyCommand } from '../../../core/editing/commands';

const EMPTY_LIBRARY: EffectsSceneLibrary = { scenes: [], unreadable: [], notices: [], loadedPaths: [] };
const EMPTY_PRESETS: EffectsPresetLibrary = { presets: [], unreadable: [], notices: [], loadedPaths: [] };

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

  // The PRESET the editable column draws. `resolveSelectedPreset` falls back to
  // the first preset for its own stated reason — a stale selected id (an undone
  // create, a different project) must not make the column vanish.
  const selectedPresetId = useEditorStore((s) => s.selectedEffectsPresetId);

  const library = project?.effectsScenes ?? EMPTY_LIBRARY;
  const presetLibrary = project?.effectsPresets ?? EMPTY_PRESETS;
  const scene = resolveSelectedScene(library, selectedId);
  const preset = resolveSelectedPreset(presetLibrary, selectedPresetId);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // ── the gesture ──────────────────────────────────────────────────────────
  //
  // ⚠ STATE, NOT A REF, AND THAT IS A DEPARTURE FROM `MapViewport`'s GUIDE DRAG.
  // There the drag lives in a ref because a `setState` per mouse move would
  // re-render the whole map viewport; here the subject is one 258x280 canvas in
  // its own component, the repaint is a `useLayoutEffect` this component already
  // runs on every render, and a ref would need a second "bump" state to force
  // that repaint anyway. Same one-command-per-gesture shape; less machinery.
  const [drag, setDrag] = React.useState<RasterTimelinePresetDrag | null>(null);
  const [hover, setHover] = React.useState<{ index: number; edge: 'top' | 'bot' } | null>(null);
  const [splitRefused, setSplitRefused] = React.useState<string | null>(null);
  // THE STALE-SUBJECT WITNESS — `endGuideDrag`'s guard, and its reason: a drag
  // can outlive the document it started on (an undo, an agent edit, a project
  // reopen), and committing an edge onto whatever band now sits at that index
  // would write the author's gesture into a band they never touched.
  const witness = React.useRef<{ presetId: string; band: string } | null>(null);

  function run(command: AnyCommand | null): void {
    if (!command) return;
    const level = getActiveLevel(useProjectStore.getState());
    if (!level) return;
    executeCommand(command, level);
  }

  /**
   * A client point in STRIP space.
   *
   * ⚠ THE SCALE IS MEASURED, NEVER ASSUMED 1. The backing store is fixed
   * (`RASTER_TIMELINE_W/H`) but the element carries `maxWidth: 100%`, so a
   * narrow column CSS-scales it and one client pixel stops being one strip
   * pixel. Dividing by the measured rect is the conversion that is right in both
   * cases; assuming 1:1 is the off-by-one that looks like a broken feature.
   */
  function toStrip(clientX: number, clientY: number): { x: number; y: number } | null {
    const cv = canvasRef.current;
    if (cv === null) return null;
    const r = cv.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    return { x: (clientX - r.left) * (cv.width / r.width), y: (clientY - r.top) * (cv.height / r.height) };
  }

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
    return rasterTimelineView(scene, cameraPreviewPlan(scene, cam.x, cam.y), preset, drag);
  })();
  const presetRows = view?.presetBands ?? [];

  // Why the dragged edge has stopped, or null. ONE derivation, the provider's,
  // read by the plate on the canvas and by the hint under it.
  const held = (drag !== null && preset?.bands?.[drag.index])
    ? bandEdgeNotice(preset.bands[drag.index]!, drag.edge, drag.requested)
    : null;

  // ── the gesture's three ends ─────────────────────────────────────────────

  function beginDrag(index: number, edge: 'top' | 'bot', stripY: number): void {
    if (preset === null) return;
    const band = preset.bands?.[index];
    if (!band) return;
    witness.current = { presetId: preset.id, band: JSON.stringify(band) };
    setDrag(presetDragFor(preset, index, edge, stripY));
  }

  /**
   * Write the gesture. ONE undo step, and three guards before it.
   *
   * `endGuideDrag`'s shape exactly: a no-op commits nothing (so a click on an
   * edge does not push an empty entry), a subject that changed under the gesture
   * commits nothing, and `setBandFieldCommand` returns null for a value that did
   * not actually move — which is the same JSON comparison every other control on
   * this document goes through.
   */
  function endDrag(): void {
    const d = drag;
    const w = witness.current;
    setDrag(null);
    witness.current = null;
    if (d === null || w === null || preset === null || preset.id !== w.presetId) return;
    const band = preset.bands?.[d.index];
    if (!band || JSON.stringify(band) !== w.band) return;
    if (band[d.edge] === d.line) return;
    run(setBandFieldCommand(presetLibrary, preset.id, d.index, d.edge, d.line));
  }

  /** Split the band under this strip point, or say why it cannot be split. */
  function trySplit(stripX: number, stripY: number): void {
    if (preset === null) return;
    const index = presetBandAt(presetRows, stripX, stripY);
    if (index === null) return;
    const band = preset.bands?.[index];
    if (!band) return;
    const refusal = bandSplitRefusal(band);
    if (refusal !== null) { setSplitRefused(`Band ${index}: ${refusal}`); return; }
    setSplitRefused(null);
    run(splitBandCommand(presetLibrary, preset.id, index, stripYToLine(stripY)));
  }

  // ── pointer plumbing ─────────────────────────────────────────────────────
  //
  // ⚠ POINTER CAPTURE RATHER THAN WINDOW LISTENERS. `MapViewport`'s guide drag
  // reaches for `window` because its gesture legitimately leaves the canvas and
  // keeps meaning something across the whole viewport. This one does not: the
  // strip IS the ruler, a pointer outside it has no line, and capture gives the
  // same "the drag survives leaving the element" property with nothing to tear
  // down on unmount.

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    const p = toStrip(e.clientX, e.clientY);
    if (p === null) return;
    const edge = presetEdgeAt(presetRows, p.x, p.y);
    publishRasterTimelinePointer({
      clientX: e.clientX, clientY: e.clientY, x: p.x, y: p.y, line: stripYToLine(p.y),
      hit: edge ? `edge ${edge.index}.${edge.edge}` : `band ${presetBandAt(presetRows, p.x, p.y)}`,
    });
    // ALT SPLITS FIRST, wherever it lands. A modifier that meant one thing near
    // an edge and another in the middle is a modifier an author cannot rely on.
    if (e.altKey) { trySplit(p.x, p.y); e.preventDefault(); return; }
    if (edge === null) return;
    beginDrag(edge.index, edge.edge, p.y);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no capture; the move still tracks */ }
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    const p = toStrip(e.clientX, e.clientY);
    if (p === null) return;
    if (drag !== null) {
      publishRasterTimelinePointer({
        clientX: e.clientX, clientY: e.clientY, x: p.x, y: p.y, line: stripYToLine(p.y),
        hit: `drag ${drag.index}.${drag.edge}`,
      });
      setDrag(presetDragFor(preset, drag.index, drag.edge, p.y));
      return;
    }
    const edge = presetEdgeAt(presetRows, p.x, p.y);
    publishRasterTimelinePointer({
      clientX: e.clientX, clientY: e.clientY, x: p.x, y: p.y, line: stripYToLine(p.y),
      hit: edge ? `edge ${edge.index}.${edge.edge}` : `band ${presetBandAt(presetRows, p.x, p.y)}`,
    });
    if (edge?.index !== hover?.index || edge?.edge !== hover?.edge) setHover(edge);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>): void {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* never captured */ }
    endDrag();
  }

  /** Abandon. No command, no undo entry — the gesture never happened. */
  function abandon(): void { setDrag(null); witness.current = null; }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>): void {
    const p = toStrip(e.clientX, e.clientY);
    if (p === null) return;
    // A double-click lands on an edge as often as not, and the first click has
    // already opened a drag that moved nowhere. Abandon it, then split.
    abandon();
    trySplit(p.x, p.y);
  }

  // ESCAPE ABANDONS, and it is mounted only while a gesture is live — a global
  // key listener that exists when nothing is being dragged is a listener that
  // eats an Escape some other surface wanted.
  React.useEffect(() => {
    if (drag === null) return undefined;
    const onKey = (ev: KeyboardEvent): void => { if (ev.key === 'Escape') abandon(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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
    // MEASURED AT DRAW TIME, in the same pass that produced the pixels — a rect
    // read at some other moment is a rect for some other layout.
    const r = cv.getBoundingClientRect();
    publishRasterTimelineReport({
      active: true,
      sceneId: view.sceneId,
      space: view.space,
      lines: inactiveRasterTimelineReport().lines,
      scale: inactiveRasterTimelineReport().scale,
      originY: inactiveRasterTimelineReport().originY,
      stripX: inactiveRasterTimelineReport().stripX,
      stripW: inactiveRasterTimelineReport().stripW,
      presetX: inactiveRasterTimelineReport().presetX,
      presetW: inactiveRasterTimelineReport().presetW,
      grabPx: inactiveRasterTimelineReport().grabPx,
      bands: view.bands,
      splits: view.splits,
      presetId: view.presetId,
      presetBands: view.presetBands,
      notices: view.notices,
      absent: view.absent,
      fills: counts.fills,
      markers: counts.markers,
      presetFills: counts.presetFills,
      presetHandles: counts.presetHandles,
      client: r.width > 0 && r.height > 0
        ? { x: r.x, y: r.y, w: r.width, h: r.height, scaleX: cv.width / r.width, scaleY: cv.height / r.height }
        : null,
      drag,
      heldText: held?.text ?? null,
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
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={abandon}
              onPointerLeave={() => { if (drag === null) setHover(null); }}
              onDoubleClick={onDoubleClick}
              title={preset === null ? undefined : RASTER_TIMELINE_GESTURES}
              // ⚠ FIXED INTRINSIC SIZE, CSS-SCALED AT MOST. The backing store is
              // constant, so the strip's pixels are in strip space with no
              // `devicePixelRatio` factor — the class of off-by-one that cost a
              // review cycle on this surface cannot arise here. The POINTER's
              // conversion still divides by the measured rect, because `maxWidth`
              // can scale the element even when the backing store does not move.
              style={{
                display: 'block', width: RASTER_TIMELINE_W, maxWidth: '100%',
                border: `1px solid ${T.border}`, borderRadius: T.rMd,
                touchAction: 'none',
                cursor: (drag !== null || hover !== null) ? 'ns-resize' : 'default',
              }}
            />
            {/* THE HELD SENTENCE, while a gesture is being refused a value. It
                appears and disappears WITH the gesture, which is the whole of
                `guideBoundNotice`'s "it must not speak when nothing is wrong". */}
            {held !== null && (
              <Hint tone="warning" style={{ marginTop: T.s2 }}>
                Band {drag?.index} {drag?.edge} {held.text}
              </Hint>
            )}
            {splitRefused !== null && (
              <Hint tone="warning" style={{ marginTop: T.s2 }}>{splitRefused}</Hint>
            )}
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
            {/* THE GRAMMAR SENTENCE, in prose because it does not fit on the
                canvas and must not be truncated there. The strip's own footer
                names WHAT is missing; this names WHY the two mechanisms are not
                interchangeable — see canvas/raster-timeline.ts. */}
            <Hint under style={{ marginBottom: 0 }}>{RASTER_TIMELINE_GRAMMAR}</Hint>
            {/* HOW TO WORK THE EDITABLE COLUMN, and WHY the cut line goes clear.
                Two sentences because they answer two questions — one about the
                mouse, one about the hardware — and only the second one is
                surprising enough to be worth an author's second read. Shown only
                when there IS a preset: an instruction for a column that is not
                on screen is noise. */}
            {preset !== null && (
              <>
                <Hint under style={{ marginBottom: 0 }}>{RASTER_TIMELINE_GESTURES}</Hint>
                <Hint under style={{ marginBottom: 0 }}>{BAND_SPLIT_LAW}</Hint>
              </>
            )}
          </>
        )}
      </SectionBody>
    </CollapsibleSection>
  );
}
