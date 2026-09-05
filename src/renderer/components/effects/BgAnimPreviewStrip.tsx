// The band preview's CONTROL STRIP and its honesty label — ROADMAP items 42, 45.
//
// ═══ IT WAS A SECTION AND IT IS NOT ONE ANY MORE (item 45) ═══
//
// Item 42 shipped this as an eighth `CollapsibleSection`, `Band preview`, which
// drew a card per band: driver, geometry, the resolved rate, and the verdict.
// The band editor one section up already drew a card per band. One band, two
// cards, 222px + 385px, in a 300px column that overflowed — found by the
// overseer on the merged tree, because neither parcel could see the other's
// column.
//
// The per-band half is now folded INTO the band card (`bandStatus` in
// providers/bganim-preview-aeon composes it, so `vitest run` can see it), and
// what is left here is what was never per band: the playback chip, the two
// warnings that are properties of the whole column, and the honesty label. That
// is a strip, not a section, and it renders inside `BG animation bands` — above
// the cards, because the chip governs every one of them.
//
// ═══ WHY IT LIVES IN THE COLUMN AND NOT ON THE CANVAS ═══
//
// A "PREVIEW APPROXIMATE" badge painted over the map would be chrome every aeon
// author pays for while only a band author needs it, and it could only ever say
// ONE thing. What actually has to be said is PER BAND — this one previews, that
// one does not and here is why, this one is licensed but no cell draws it — and
// that is a list, which belongs in the column the author is already reading when
// they care. Item 45 did not change that argument; it moved the list into the
// cards the author was already reading, which is the same argument one step
// further.
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
//
// SO IT IS DISCLOSED, NOT DELETED, AND NOT DILUTED. The four sentences are the
// tallest thing left here and they are read once, not every session — so the
// claim ("the preview is approximate") is always on screen as the chip's own
// word and its title, and the four named ways are one click behind it, in full.
// A vaguer always-on sentence would have been smaller and would have been the
// exact failure this label exists to prevent.
//
// ═══ TWO WARNINGS SURVIVED THE FOLD AND TWO DID NOT ═══
//
// "This background has no bands" and "this project has no readable
// editor_bg_override.json" are both said, better and with more detail, by the
// band panel this strip now lives inside — so they went. This whole strip is
// hidden when there are no bands, for the same reason: there is nothing to
// preview, and the panel above has already explained why.
//
// The two that stayed are the ones nothing else says: the active section
// resolving to no background at all, and Plane B being hidden while playback is
// on (the overlay draws onto Plane B, so it is only visible where Plane B is).

import React from 'react';
import { T, Chip } from '../ui';
import { Row, Hint } from './column-layout';
import { useViewStore } from '../../state/viewStore';
import { useEditorStore } from '../../state/editorStore';
import { useProjectStore } from '../../state/projectStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { refreshBandPreview } from '../../providers/bganim-preview-aeon';
import { documentBands } from '../../../core/formats/bg-override/bg-anim-band';

export default function BgAnimPreviewStrip() {
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
  // signature, so calling it here as well as from the viewport's draw pass and
  // from the band panel costs a map lookup — and it means this strip never shows
  // a verdict one render behind the canvas, which is what reading the viewport's
  // cache would give.
  const snapshot = refreshBandPreview(`${historyVersion}:${liveEditVersion}`);

  const [caveats, setCaveats] = React.useState(false);

  const doc = project?.bgOverride?.doc ?? null;
  const bands = doc ? documentBands(doc) : [];
  const playing = overlays.playAnimatedArt;
  // The overlay is drawn onto Plane B, so it is only visible where Plane B is.
  const bgOnScreen = editingLayer === 'bg' || overlays.showBgPlane;

  // NOTHING TO PREVIEW, NOTHING TO SAY. The band panel this sits inside already
  // explains an absent document and an empty band list, in more detail than a
  // preview strip could.
  if (bands.length === 0) return null;

  return (
    <>
      <Row>
        <Chip
          active={playing}
          onClick={() => toggleOverlay('playAnimatedArt')}
          title={'Play the tile animations in the canvas. The same switch as View > Play '
            + 'animations. Playback is view state, not a property of this panel.'}
        >
          {playing ? 'Playing' : 'Play tile animations'}
        </Chip>
        {playing && snapshot.timerBands === 0 && snapshot.hasDrawable && (
          <Chip title={'Every previewing tile animation reads the camera, so its phase is a function of '
            + 'where you are looking. Pan the canvas to move it.'}>
            pan to move
          </Chip>
        )}
        <Chip
          active={caveats}
          onClick={() => setCaveats((v) => !v)}
          title={'This preview is approximate in four named ways. The phase arithmetic is NOT '
            + 'one of them, it is the consumer\'s own expression. Open this to read all four.'}
        >
          why approximate?
        </Chip>
      </Row>

      {caveats && (
        <div style={{
          fontSize: T.tXs, color: T.textLo, lineHeight: 1.5,
          marginBottom: T.s2, paddingBottom: T.s2, borderBottom: `1px solid ${T.border}`,
        }}>
          <b>The preview is approximate</b>, in four named ways. The phase arithmetic is not one
          of them, it is the consumer&apos;s own expression.
          {' '}(1) The clock is the editor&apos;s wall clock, not <code>Logic_Tick</code>: a lag
          frame freezes a tile animation in game and never here.
          {' '}(2) Camera-driven tile animations read your pan; the engine also clamps its camera to the level, and
          that clamp is not modelled, so panning past the right or bottom edge shows phases the
          game holds still.
          {' '}(3) A tile animation&apos;s two DMA pieces can land a frame apart in game, showing a one-frame
          seam this never draws.
          {' '}(4) The ROM is the truth channel. This is for judging <i>rate</i>, which is the one
          thing a compile loop is too slow to judge.
        </div>
      )}

      {!snapshot.backgroundPresent && (
        <Hint tone="warning">
          The active section resolves to no background, so there is nothing for a tile animation
          to animate on screen.
        </Hint>
      )}

      {playing && !bgOnScreen && (
        <Hint tone="warning">
          Plane B is hidden, so the tile animations are drawing where you cannot see them. Turn on
          View &gt; Show Bg Plane, or switch to the BG layer.
        </Hint>
      )}
    </>
  );
}
