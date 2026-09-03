// The Effects facet's tool-options bar: the two band verbs as chips, so a band
// can be made from the canvas's own chrome rather than only from the
// default-collapsed `New band` section two headers down the column (triage
// 2026-08-26 §A.2/§A.3, parcel B).
//
// THE SAME TWO COMMANDS, THE SAME TWO REASONS. Nothing here decides whether a
// promotion is possible: `bandVerbs` (providers/band-verbs) derives the label,
// the disabled reason and the command from the store's candidate and the open
// document, and `BgAnimBandPanel` reads the very same derivation for its own
// chips. A refusal at run time is shown in the bar, in the panel's own words.
//
// A LEAF, like ClassicMapToolOptions: it subscribes and renders, and the one
// thing it does — `executeCommand` on the focused level — is the panel's
// `run` verbatim. It re-reads after undo/redo through `useHistoryVersion`,
// because a band edit replaces the document inside the project's holder
// without moving a store identity.

import React from 'react';
import { T, OptionBar, Chip } from '../ui';
import { useProjectStore } from '../../state/projectStore';
import { useEditorStore } from '../../state/editorStore';
import { useParallaxPreviewOn, toggleParallaxPreview } from '../../providers/parallax-preview';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { bandVerbs, type BandVerb } from '../../providers/band-verbs';
import { runBandVerb } from '../../providers/band-follow';
import { TOOL_HINTS } from '../../workspace/tool-meta';
import { openGuide } from '../../state/guideStore';
import { EFFECTS_GUIDE_SLUG, GUIDE_ANCHORS } from '../guide/guides';

function VerbChip({ verb, onRefusal }: { verb: BandVerb; onRefusal: (reason: string | null) => void }) {
  return (
    <Chip disabled={verb.reason !== null} title={verb.reason ?? verb.label}
      // THE SAME `runBandVerb` THE PANEL'S CHIPS RUN. It executes AND points the
      // author at the band it made; this bar had its own copy of the execute,
      // which is how "I press add a band bank and idk where it is" could have
      // been fixed on one door and left broken on the other.
      onClick={() => onRefusal(runBandVerb(verb.run()))}>
      {verb.label}
    </Chip>
  );
}

export default function EffectsToolOptions(): React.ReactElement {
  useHistoryVersion();
  const project = useProjectStore((s) => s.project);
  const candidate = useEditorStore((s) => s.bandCandidate);
  const tool = useEditorStore((s) => s.tool);
  const [refusal, setRefusal] = React.useState<string | null>(null);
  const cameraPreview = useParallaxPreviewOn();
  const doc = project?.bgOverride?.doc ?? null;
  const verbs = bandVerbs(doc, candidate);
  // What the bar SAYS beside the chips: a run-time refusal first (it is the
  // newest fact), else the reason the chips are off, else the armed tool's hint.
  const line = refusal
    ?? verbs.promote.reason
    ?? verbs.add.reason
    ?? TOOL_HINTS[tool];
  return (
    <OptionBar>
      {/* THE FIRST HELP AFFORDANCE THIS APPLICATION HAS EVER HAD, and it is
          here because this bar is where the measured confusion starts: the
          cold reader's first click on this tab was `Add blank band`, which
          built the wrong feature and dirtied his project (§a5). It sits BEFORE
          the two verbs for that reason — left of the button that cost him the
          mistake, not after it.

          A `?` AND A WORD. A bare glyph is a guess; "? Guide" is a promise.
          The 300px column below has no room for this, which is the other half
          of why the bar carries it. */}
      <Chip title="Open the first-run guide: what this tab does, and how to make a background move."
        onClick={() => openGuide(EFFECTS_GUIDE_SLUG, GUIDE_ANCHORS.whatThisTabDoes)}>
        ? Guide
      </Chip>
      <VerbChip verb={verbs.promote} onRefusal={setRefusal} />
      <VerbChip verb={verbs.add} onRefusal={setRefusal} />
      {/* ═══ THE PREVIEW THIS TAB IS ABOUT, ON THIS TAB (EFFECTS-W1 defect 14) ═══

          The composite background preview EXISTS and is the only thing on
          screen that shows what a scene's layers do — and it was off by
          default, in the View menu, unmentioned by the Effects tab. The cold
          reader found it ten minutes after he needed it, while auditing that
          menu for something else.

          ═══ AND SINCE EW-SHAPE-PREVIEW IT ARRIVES ON ═══

          Wave 1 fixed the finding-it half and left the default alone, because
          `showCameraPreview` was one global overlay key and flipping it would
          have shown the preview to Layout, Objects, Collision and Art as well.
          It is scoped now (providers/parallax-preview), so d-26b's third clause
          is met: ON by default on the Parallax sub-tab, because an author who
          has never seen the preview does not know to ask for it.

          ⚠ AND AN AUTHOR WHO TURNS IT OFF IS OBEYED, for good — the chip writes
          a CHOICE, and a recorded choice silences the default permanently
          (shell/preview-pref). A default that came back every time he returned
          to the tab would be a new defect wearing this one's clothes.

          THE SAME SWITCH, NOT A SECOND ONE. `toggleParallaxPreview` is what
          the View menu's own row calls, so the checkbox and this chip cannot
          disagree — the defect `Play bands` already documents about itself in a
          tooltip. */}
      <Chip active={cameraPreview}
        title={cameraPreview
          ? 'Stop compositing the background in the screen frame. The same switch as '
            + 'View > Compose the background in the frame (parallax). Aurora remembers that '
            + 'you turned it off.'
          : 'Draw the real background per parallax strip, inside the screen frame — the only '
            + 'thing in Aurora that shows what a scene\'s layers do. The same switch as '
            + 'View > Compose the background in the frame (parallax).'}
        onClick={() => toggleParallaxPreview()}>
        Parallax preview
      </Chip>
      <span style={{ flex: 1 }} />
      <span style={{ color: refusal ? T.warning : T.textFaint }}>{line}</span>
    </OptionBar>
  );
}
