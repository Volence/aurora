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
import { useProjectStore, getActiveLevel } from '../../state/projectStore';
import { executeCommand, useEditorStore } from '../../state/editorStore';
import { useHistoryVersion } from '../../hooks/useHistoryVersion';
import { bandVerbs, type BandVerb } from '../../providers/band-verbs';
import { TOOL_HINTS } from '../../workspace/tool-meta';

function VerbChip({ verb, onRefusal }: { verb: BandVerb; onRefusal: (reason: string | null) => void }) {
  return (
    <Chip disabled={verb.reason !== null} title={verb.reason ?? verb.label}
      onClick={() => {
        const result = verb.run();
        if (!result.ok) { onRefusal(result.reason); return; }
        onRefusal(null);
        const level = getActiveLevel(useProjectStore.getState());
        if (level) executeCommand(result.command, level);
      }}>
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
      <VerbChip verb={verbs.promote} onRefusal={setRefusal} />
      <VerbChip verb={verbs.add} onRefusal={setRefusal} />
      <span style={{ flex: 1 }} />
      <span style={{ color: refusal ? T.warning : T.textFaint }}>{line}</span>
    </OptionBar>
  );
}
