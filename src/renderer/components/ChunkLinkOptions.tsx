// CHUNK LINKS — the UI half of owner ruling d-18c.
//
//   "a stamped chunk REMEMBERS its chunk by default; a checkbox detaches a
//    placement into plain tiles; the checkbox is available both at stamp time
//    and afterwards on an existing placement."
//
// Three controls, one for each clause:
//
//   1. `Detach on stamp` — the checkbox, unchecked by default because KEEPING
//      the link is the ruling's default. It arms the next stamp; nothing here
//      touches the document.
//   2. `Detach` on the placement under the cursor — the "afterwards" half. The
//      readout is `chunkOriginAt` on the hovered tile, latched in the store so
//      the button is still describing something once the pointer has left the
//      map to press it (see editorStore `linkHover`).
//   3. `Detach all in section` — the bulk form, for an author who wants the
//      whole section to stop tracking the library.
//
// WHY A HOVER READOUT AND NOT A CLICK. The stamp tool's only click IS a stamp,
// so hovering is the one non-destructive gesture it has left. Alt is already
// spent on art-only, and the tile-brush panel's own argument against invisible
// modifiers (TileBrushOptions.tsx) applies here with more force: detaching is
// destructive-ish and must be a visible, named control.
//
// EVERYTHING HERE IS UNDOABLE. `buildDetachCommand` / `buildDetachAllCommand`
// return real commands and go through `executeCommand`, so Ctrl+Z puts the
// links back. They do NOT touch the nametable — detaching turns a link into a
// copy, and the copy is already sitting in the section.
//
// THE EXPLANATORY SENTENCE IS NOT WRITTEN HERE. It is a claim about
// `buildActPropagationCommand`'s scope, so it lives beside that mechanism as
// `CHUNK_LINK_LINKED_BLURB` / `CHUNK_LINK_DETACHED_BLURB` in
// core/editing/chunk-links.ts, where a node test can read the exact words. It
// used to be an inline literal here promising "every copy", while propagation
// reached one ACT and the chunk library is project-wide — so a stamp in a
// second act kept its link and diverged in silence. Do not re-inline it.

import React from 'react';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useProjectStore, getCurrentAct, getActiveLevel } from '../state/projectStore';
import { useAeonHistoryVersion } from '../hooks/useHistoryVersion';
import {
  buildDetachCommand, buildDetachAllCommand, findPlacement,
  CHUNK_LINK_LINKED_BLURB, CHUNK_LINK_DETACHED_BLURB,
} from '../../core/editing/chunk-links';
import { SectionBody, Chip, T } from './ui';
import type { Section } from '../../core/model/s4-types';

function activeSection(): { section: Section; sectionIndex: number } | null {
  const sectionIndex = useEditorStore.getState().activeSectionIndex;
  const act = getCurrentAct(useProjectStore.getState());
  const section = act?.sections[sectionIndex] ?? null;
  return section ? { section, sectionIndex } : null;
}

function chunkName(chunkId: string): string {
  const chunk = useProjectStore.getState().project?.chunkLibrary.find((c) => c.id === chunkId);
  return chunk?.name ?? chunkId;
}

function runDetach(placementId: number): void {
  const target = activeSection();
  const level = getActiveLevel(useProjectStore.getState());
  if (!target || !level) return;
  const cmd = buildDetachCommand({
    section: target.section, sectionIndex: target.sectionIndex, placementId,
    description: `Detach placement ${placementId} from its chunk`,
  });
  // Null means the placement is already gone (detached twice, or painted over
  // in between). A no-op, not an error — the panel just stops naming it.
  if (cmd) executeCommand(cmd, level);
  useEditorStore.getState().setLinkHover(null);
}

function runDetachAll(): void {
  const target = activeSection();
  const level = getActiveLevel(useProjectStore.getState());
  if (!target || !level) return;
  const cmd = buildDetachAllCommand({
    section: target.section, sectionIndex: target.sectionIndex,
    description: `Detach every chunk link in section ${target.sectionIndex}`,
  });
  if (cmd) executeCommand(cmd, level);
  useEditorStore.getState().setLinkHover(null);
}

export default function ChunkLinkOptions(): React.ReactElement {
  const detached = useEditorStore((s) => s.stampDetached);
  const setDetached = useEditorStore((s) => s.setStampDetached);
  const hover = useEditorStore((s) => s.linkHover);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  // A detach is a command, so the panel's counts have to move with the history
  // clock — including on undo, which no store write of ours would announce.
  useAeonHistoryVersion();
  const project = useProjectStore((s) => s.project);

  const act = getCurrentAct(useProjectStore.getState());
  const section = act?.sections[activeSectionIndex] ?? null;
  const placements = section?.chunkLinks?.placements ?? [];

  // The hovered placement is only offerable while it still EXISTS in the
  // section the hover named — a stale latch after an undo must not present a
  // button that names nothing.
  const hoverSection = hover ? (act?.sections[hover.sectionIndex] ?? null) : null;
  const hovered = hover && hoverSection
    ? findPlacement(hoverSection.chunkLinks, hover.placementId)
    : null;

  return (
    <SectionBody>
      <div style={{ display: 'flex', flexDirection: 'column', gap: T.s3 }}>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: T.s2, fontSize: T.tXs, cursor: 'pointer' }}
          title="Detach on stamp — place the chunk's tiles as plain art that will NOT follow later edits to the chunk"
        >
          <input
            type="checkbox"
            aria-label="Detach on stamp"
            checked={detached}
            onChange={(e) => setDetached(e.target.checked)}
          />
          <span>Detach on stamp</span>
        </label>
        <p
          data-testid="chunk-link-scope"
          style={{ margin: 0, fontSize: T.tXs, color: T.textLo, lineHeight: 1.4 }}
        >
          {detached ? CHUNK_LINK_DETACHED_BLURB : CHUNK_LINK_LINKED_BLURB}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: T.s2, flexWrap: 'wrap' }}>
          <span
            data-testid="chunk-link-hover"
            style={{ fontSize: T.tXs, color: hovered ? T.textBase : T.textLo }}
          >
            {hovered
              ? `Under cursor: ${chunkName(hovered.chunkId)} (#${hovered.id})`
              : 'Under cursor: no chunk link'}
          </span>
          <Chip
            title={hovered
              ? `Detach placement #${hovered.id} — its tiles stay exactly as they are, but stop following the chunk`
              : 'Hover a stamped region on the map to name a placement'}
            onClick={hovered ? () => runDetach(hovered.id) : undefined}
            disabled={!hovered}
          >Detach</Chip>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: T.s2, flexWrap: 'wrap' }}>
          <span data-testid="chunk-link-count" style={{ fontSize: T.tXs, color: T.textLo }}>
            {`Section ${activeSectionIndex}: ${placements.length} linked `
              + `placement${placements.length === 1 ? '' : 's'}`}
          </span>
          <Chip
            title="Detach every placement in this section — the art is untouched, it just stops following the library"
            onClick={placements.length > 0 ? runDetachAll : undefined}
            disabled={placements.length === 0 || !project}
          >Detach all in section</Chip>
        </div>
      </div>
    </SectionBody>
  );
}
