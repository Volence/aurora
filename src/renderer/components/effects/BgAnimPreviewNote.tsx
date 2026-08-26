// The band preview's control and its honesty label — ROADMAP item 42.
//
// ═══ WHY IT LIVES HERE AND NOT ON THE CANVAS ═══
//
// A "PREVIEW APPROXIMATE" badge painted over the map would be chrome every aeon
// author pays for while only a band author needs it, and it could only ever say
// ONE thing. What actually has to be said is PER BAND — this one previews, that
// one does not and here is why, this one is licensed but no cell draws it — and
// that is a list, which belongs in the column the author is already reading when
// they care. It sits directly under the band editor for the same reason the band
// editor sits under the scene editor: an author asking "what does this
// background do" should not change facets to find out.
//
// The View menu keeps the real toggle, because playback is VIEW state (the
// ruling's own words — an author wants bands running while placing objects
// beside them). The chip here is a shortcut into the same store key, not a
// second mechanism.
//
// ═══ WHAT "APPROXIMATE" MEANS, EXACTLY ═══
//
// Not a disclaimer — a list of the four things this is not. The phase arithmetic
// is the consumer's own and is NOT among them; the label covers the timebase,
// the unmodelled camera clamp, the DMA seam, and the fact that the ROM is the
// truth channel. Being specific is the point: "approximate" with nothing behind
// it teaches an author to distrust the parts that are exact.

import React from 'react';
import { T, SectionBody, CollapsibleSection, Chip } from '../ui';
import { useViewStore } from '../../state/viewStore';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore } from '../../state/projectStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { refreshBandPreview } from '../../providers/bganim-preview-aeon';
import { documentBands } from '../../../core/formats/bg-override/bg-anim-band';
import { bandDriver, bandIsTimeVarying, bandRateShift }
  from '../../../core/formats/bg-override/bganim-preview';

const note: React.CSSProperties = { fontSize: T.tXs, color: T.textLo, lineHeight: 1.5 };
const warn: React.CSSProperties = { ...note, color: T.warning };
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: T.s2, marginBottom: T.s2, flexWrap: 'wrap',
};
const bandRow: React.CSSProperties = {
  ...note, padding: `${T.s1} 0`, borderTop: `1px solid ${T.border}`,
};

/** GAME FRAMES PER SECOND — the rate the preview's clock and the engine share. */
const GAME_FRAMES_PER_SECOND = 60;

export default function BgAnimPreviewNote() {
  const overlays = useViewStore((s) => s.overlays);
  const toggleOverlay = useViewStore((s) => s.toggleOverlay);
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const liveEditVersion = useEditorStore((s) => s.liveEditVersion);
  const project = useProjectStore((s) => s.project);
  // SUBSCRIPTIONS, not values. The snapshot below is DERIVED at render time, so
  // this component only repaints when React tells it to — and the two facts that
  // change the verdicts without touching an edit clock are the act and the
  // active section (each re-resolves which background is on screen, and so which
  // blob a band's slot index means). Reading them is what makes this re-render.
  useProjectStore((s) => s.currentActId);
  useEditorStore((s) => s.activeSectionIndex);
  const historyVersion = useHistoryVersion();

  // Derived, not stored. `refreshBandPreview` is idempotent on an unchanged
  // signature, so calling it here as well as from the viewport's draw pass costs
  // a map lookup — and it means this note never shows a verdict one render
  // behind the canvas, which is what reading the viewport's cache would give.
  const snapshot = refreshBandPreview(`${historyVersion}:${liveEditVersion}`);

  const doc = project?.bgOverride?.doc ?? null;
  const bands = doc ? documentBands(doc) : [];
  const playing = overlays.playAnimatedArt;
  // The overlay is drawn onto Plane B, so it is only visible where Plane B is.
  const bgOnScreen = editingLayer === 'bg' || overlays.showBgPlane;

  return (
    <CollapsibleSection id="aeon.bganim.preview" title="Band preview">
      <SectionBody>
        <div style={row}>
          <Chip
            active={playing}
            onClick={() => toggleOverlay('playAnimatedArt')}
            title={'Play the BgAnim bands in the canvas. The same switch as View > Play '
              + 'animations — playback is view state, not a property of this panel.'}
          >
            {playing ? 'Playing' : 'Play bands'}
          </Chip>
          {playing && snapshot.timerBands === 0 && snapshot.hasDrawable && (
            <Chip title={'Every previewing band reads the camera, so its phase is a function of '
              + 'where you are looking. Pan the canvas to move it.'}>
              pan to move
            </Chip>
          )}
        </div>

        {bands.length === 0 && (
          <div style={note}>
            {snapshot.documentPresent
              ? 'This background has no bands. Add one above and it previews here.'
              : 'This project has no readable editor_bg_override.json, so there are no bands '
                + 'to preview.'}
          </div>
        )}

        {bands.length > 0 && !snapshot.backgroundPresent && (
          <div style={warn}>
            The active section resolves to no background, so there is nothing for a band to
            animate on screen.
          </div>
        )}

        {bands.length > 0 && playing && !bgOnScreen && (
          <div style={warn}>
            Plane B is hidden, so the bands are drawing where you cannot see them. Turn on
            View &gt; Show Bg Plane, or switch to the BG layer.
          </div>
        )}

        {bands.map((band, i) => {
          const verdict = snapshot.verdicts[i];
          const driver = bandDriver(band);
          const shift = bandRateShift(band);
          const units = 1 << shift;
          const timeVarying = bandIsTimeVarying(band);
          return (
            <div key={i} style={bandRow}>
              <div style={{ color: T.textBase }}>
                Band {i} · {band.cols}x{band.rows} · {driver}
                {band.driver === undefined && ' (default)'}
              </div>
              <div>
                {/* The injector prints the same sentence into its bake report
                    ("1px per N units"). `px` is already both singular and
                    plural, so only the frame word takes an s. */}
                1px per {units} {timeVarying ? (units === 1 ? 'frame' : 'frames') : 'camera px'}
                {band.rate_shift === undefined && ' (default rate_shift)'}
                {timeVarying && ` · ≈${(GAME_FRAMES_PER_SECOND / units).toFixed(units > 60 ? 2 : 0)} px/s`}
              </div>
              {verdict?.refusal
                ? (
                  <div style={warn}>
                    Not previewing: {verdict.refusal}. The band names slots in the BG tile blob,
                    and the blob on screen is not the one this document describes.
                  </div>
                )
                : verdict && verdict.cells === 0
                  ? <div style={warn}>Licensed, but no background cell draws its slots.</div>
                  : <div>{verdict?.cells ?? 0} background cells</div>}
            </div>
          );
        })}

        <div style={{ ...note, marginTop: T.s2, borderTop: `1px solid ${T.border}`, paddingTop: T.s2 }}>
          <b>The preview is approximate</b>, in four named ways — the phase arithmetic is not one
          of them, it is the consumer&apos;s own expression.
          {' '}(1) The clock is the editor&apos;s wall clock, not <code>Logic_Tick</code>: a lag
          frame freezes a band in game and never here.
          {' '}(2) Camera bands read your pan; the engine also clamps its camera to the level, and
          that clamp is not modelled, so panning past the right or bottom edge shows phases the
          game holds still.
          {' '}(3) A band&apos;s two DMA pieces can land a frame apart in game, showing a one-frame
          seam this never draws.
          {' '}(4) The ROM is the truth channel. This is for judging <i>rate</i>, which is the one
          thing a compile loop is too slow to judge.
        </div>
      </SectionBody>
    </CollapsibleSection>
  );
}
