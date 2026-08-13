// The facet-based level workspace (spec §4) — aeon-only until Stage 4 re-homes
// classic. Owns the ONE EditorShell; the active facet module fills its slots.
// The workspace header (EditorShell's appBar slot) carries the facet bar plus
// the workspace controls that used to live on the legacy Toolbar: FG/BG plane
// toggle (layout+collision) and undo/redo for the focused document.

import React from 'react';
import EditorShell from '../shell/EditorShell';
import FacetBar from './FacetBar';
import { facetModules } from './facet-registry';
import { canvasFor } from './facet-canvases';
import { useWorkspaceStore } from './workspaceStore';
import { useOpenEngine, useOpenCapabilities } from '../state/open-project';
import { useSessionStore } from '../state/sessionStore';
import { useEditorStore, focusedHistory } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { Chip } from '../components/ui';
import type { EditingLayer } from '../state/editorStore';

export default function LevelWorkspace() {
  const activeId = useSessionStore((s) => s.activeId);
  // The OPEN engine's grant, not the aeon store's — a classic open never
  // populates projectStore, so reading it directly would render an empty facet
  // bar the moment classic re-homes here (spec §3.0). For aeon this resolves to
  // exactly the same manifest it always did.
  const granted = useOpenCapabilities()?.facets ?? [];
  const facetId = useWorkspaceStore((s) => s.facetFor(activeId));
  // Undo/redo enabledness re-evaluates on any stack change; focus moves (a facet
  // switch, a tab switch) are covered by the facetId/activeId subscriptions above,
  // which is exactly what focusedHistory() keys on.
  useHistoryVersion();
  const history = focusedHistory();
  const editingLayer = useEditorStore((s) => s.editingLayer);
  // Hoisted above the `mod` null-guard below: a hook may not sit after an early
  // return. Used only to resolve the Canvas slot (see the destructure below).
  const engine = useOpenEngine();
  // App's mount effect calls registerAeonFacetModules() before any project can
  // load (project open is async, gated behind the same mount), so a facet module
  // is always present by the time an aeon level tab renders — the 'layout'
  // fallback then this null-guard only fire if that ordering is ever broken (the
  // workspace would render blank permanently). Keep registration ahead of any
  // synchronous hydrate.
  const mod = facetModules.get(facetId) ?? facetModules.get('layout');
  if (!mod) return null;

  const showPlane = facetId === 'layout' || facetId === 'collision';
  const header = (
    <div style={styles.header}>
      <FacetBar tabId={activeId} granted={granted} />
      <span style={{ flex: 1 }} />
      {showPlane && (['fg', 'bg'] as EditingLayer[]).map((l) => (
        <Chip key={l} active={editingLayer === l}
          onClick={() => useEditorStore.getState().setEditingLayer(l)}>{l.toUpperCase()}</Chip>
      ))}
      <Chip disabled={!history?.canUndo} onClick={() => history?.undo()}>Undo</Chip>
      <Chip disabled={!history?.canRedo} onClick={() => history?.redo()}>Redo</Chip>
    </div>
  );

  const { ToolDock, ToolOptions, RightPanel, BottomExtra, StatusBar } = mod;
  // Engine-keyed canvas (spec §3.1); mod.Canvas is the fallback until every
  // engine registers one — aeon registers its module's own Canvas, so this
  // resolves to exactly what the destructure used to yield. NOTE: only the
  // CANVAS is engine-keyed — the other slots are still aeon-coupled (spec
  // §3.0.1) and neutralising them is a separate step.
  const Canvas = canvasFor(engine, mod.id) ?? mod.Canvas;
  return (
    <EditorShell
      appBar={header}
      toolOptions={ToolOptions ? <ToolOptions /> : undefined}
      toolDock={ToolDock ? <ToolDock /> : <span />}
      panels={RightPanel ? <RightPanel /> : <span />}
      bottomExtra={BottomExtra ? <BottomExtra /> : undefined}
      status={StatusBar ? <StatusBar /> : undefined}
    >
      <Canvas />
    </EditorShell>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
};
