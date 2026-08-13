// The facet-based level workspace (spec §4) — aeon-only until Stage 4 re-homes
// classic. Owns the ONE EditorShell; the active facet module fills its slots.
// The workspace header (EditorShell's appBar slot) carries the facet bar plus
// the workspace controls that used to live on the legacy Toolbar: FG/BG plane
// toggle (layout+collision) and undo/redo for the focused document.

import React from 'react';
import EditorShell from '../shell/EditorShell';
import FacetBar from './FacetBar';
import { facetModules } from './facet-registry';
import { useWorkspaceStore } from './workspaceStore';
import { useSessionStore } from '../state/sessionStore';
import { useProjectStore, getActiveLevel } from '../state/projectStore';
import { useEditorStore, undo, redo, editHistory } from '../state/editorStore'; // editHistory → activeHistory() in the undo re-home task
import { Chip } from '../components/ui';
import type { EditingLayer } from '../state/editorStore';

export default function LevelWorkspace() {
  const activeId = useSessionStore((s) => s.activeId);
  const granted = useProjectStore((s) => s.capabilities?.facets ?? []);
  const facetId = useWorkspaceStore((s) => s.facetFor(activeId));
  useEditorStore((s) => s.historyVersion); // repaint undo/redo enabledness
  const editingLayer = useEditorStore((s) => s.editingLayer);
  // App's mount effect calls registerAeonFacetModules() before any project can
  // load (project open is async, gated behind the same mount), so a facet module
  // is always present by the time an aeon level tab renders — the 'layout'
  // fallback then this null-guard only fire if that ordering is ever broken (the
  // workspace would render blank permanently). Keep registration ahead of any
  // synchronous hydrate.
  const mod = facetModules.get(facetId) ?? facetModules.get('layout');
  if (!mod) return null;

  const showPlane = facetId === 'layout' || facetId === 'collision';
  const level = () => getActiveLevel(useProjectStore.getState());
  const header = (
    <div style={styles.header}>
      <FacetBar tabId={activeId} granted={granted} />
      <span style={{ flex: 1 }} />
      {showPlane && (['fg', 'bg'] as EditingLayer[]).map((l) => (
        <Chip key={l} active={editingLayer === l}
          onClick={() => useEditorStore.getState().setEditingLayer(l)}>{l.toUpperCase()}</Chip>
      ))}
      <Chip disabled={!editHistory.canUndo}
        onClick={() => { const lv = level(); if (lv) undo(lv); }}>Undo</Chip>
      <Chip disabled={!editHistory.canRedo}
        onClick={() => { const lv = level(); if (lv) redo(lv); }}>Redo</Chip>
    </div>
  );

  const { Canvas, ToolDock, ToolOptions, RightPanel, BottomExtra, StatusBar } = mod;
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
