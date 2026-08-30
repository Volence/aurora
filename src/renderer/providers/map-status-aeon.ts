// Aeon port for the neutral shared/MapStatusBar.
//
// Everything here is a read: the bar issues no command, it only reports. What
// used to be the whole of shell/MapStatusBar is now split in two — the markup is
// neutral, and these store reads (which are aeon-shaped: sections, the chunk
// library, the Aether bus) live on this side of the line.

import React from 'react';
import type { MapStatusPort } from '../components/shared/map-status-model';
import { useEditorStore } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentAct, getCurrentZone } from '../state/projectStore';
import { danglingBgRef } from '../../core/formats/bg-library';
import AetherStatus from '../components/AetherStatus';

/** Aeon's trailing status content. An element, not a component, because it takes
 *  no props and never varies — hoisting it keeps the port's identity stable. */
const AETHER = React.createElement(AetherStatus);

/**
 * The stamp tool's context line: which chunk is armed, or why nothing can be
 * stamped yet.
 *
 * The Alt modifier named here is aeon's stamp only — classic's does not
 * implement it — which is exactly why it rides this engine-specific line rather
 * than the shared hint in workspace/tool-meta.ts.
 */
export function stampContext(chunkCount: number, selectedChunkId: string | null): string {
  if (chunkCount === 0) return 'No chunks loaded — import chunks first';
  if (!selectedChunkId) return 'Select a chunk from the library panel';
  return `Chunk: ${selectedChunkId} — Alt: art only`;
}

/**
 * The scope line for the active section — and the one place the MAP itself
 * admits it is not showing the background the section names (O31).
 *
 * The author looking at the viewport has no other signal. The plane is drawn,
 * it is a plausible background, and it is the ACT DEFAULT standing in for an
 * entry the library does not carry — which on a checkout of aeon holding the
 * tracked `{zone}_bglib.json` and none of its untracked `{zone}_bg_*.bin`
 * bodies is every entry there is. This matters most under the BG paint layer,
 * where the stroke lands on the act default while the panel names something
 * else, so the fallback is not merely displayed, it is edited.
 *
 * A pure function taking the ref and the library rather than reading the store:
 * that is what makes the sentence testable at all.
 */
export function sectionScope(
  activeSectionIndex: number,
  bgRef: string | null,
  bgLibrary: readonly { readonly id: string }[],
): string {
  const dangling = danglingBgRef(bgRef, bgLibrary);
  return dangling === null
    ? `Section ${activeSectionIndex}`
    : `Section ${activeSectionIndex} · BG ${dangling} missing — showing act default`;
}

export function useAeonMapStatusPort(): MapStatusPort {
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const selectedChunkId = useEditorStore((s) => s.selectedChunkId);
  const zoom = useViewStore((s) => s.zoom);
  const setZoom = useViewStore((s) => s.setZoom);
  const project = useProjectStore((s) => s.project);
  // Subscribe to the id, then look the zone up off getState() — the house
  // pattern (PaletteViewer, ArtBrowser). The old bar subscribed to `project`
  // only, so a zone switch could leave a stale name up until something else
  // re-rendered it; adding the id subscription fixes that without changing what
  // the bar draws.
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const zoneName = React.useMemo(
    () => getCurrentZone(useProjectStore.getState())?.name ?? '',
    [project, currentZoneId],
  );
  const chunkCount = project?.chunkLibrary.length ?? 0;
  const contextInfo = tool === 'stamp-chunk' ? stampContext(chunkCount, selectedChunkId) : '';
  // Read off getState() like `zoneName` above, and re-derived whenever the
  // project identity or the active section moves — an in-place ref edit lands
  // through the same `project` subscription every other read here uses.
  const scopeInfo = React.useMemo(() => {
    const act = getCurrentAct(useProjectStore.getState());
    return sectionScope(
      activeSectionIndex,
      act?.sections[activeSectionIndex]?.bgLayoutRef ?? null,
      project?.bgLibrary ?? [],
    );
  }, [project, currentZoneId, activeSectionIndex]);

  return React.useMemo((): MapStatusPort => ({
    tool,
    pasting,
    layer: editingLayer,
    zoneName,
    scopeInfo,
    contextInfo,
    zoom,
    // setZoom takes optional focus coordinates the bar never supplies; the
    // narrower port signature is a subtype, so it passes straight through.
    onZoom: setZoom,
    right: AETHER,
  }), [tool, pasting, editingLayer, zoneName, scopeInfo, contextInfo, zoom, setZoom]);
}
