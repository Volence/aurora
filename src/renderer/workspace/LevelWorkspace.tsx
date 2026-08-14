// The facet-based level workspace (spec §4) — aeon-only until Stage 4 re-homes
// classic. Owns the ONE EditorShell; the active facet module fills its slots.
// The workspace header (EditorShell's appBar slot) carries the facet bar plus
// the workspace controls that used to live on the legacy Toolbar: FG/BG plane
// toggle (layout+collision) and undo/redo for the focused document.

import React from 'react';
import EditorShell from '../shell/EditorShell';
import FacetBar from './FacetBar';
import { moduleFor } from './facet-registry';
import { useWorkspaceStore } from './workspaceStore';
import { useOpenEngine, useOpenCapabilities, type OpenEngine } from '../state/open-project';
import { useSessionStore } from '../state/sessionStore';
import { useEditorStore, focusedHistory } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import ViewMenu from '../shell/ViewMenu';
import { Chip, T } from '../components/ui';
import type { EditingLayer } from '../state/editorStore';
import type { FacetCapability } from '../../core/project/adapter';

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
  // return.
  const engine = useOpenEngine();
  // One engine-keyed resolve, and no fallback of any kind. Falling back to
  // aeon's module (what the old canvas registry did) renders aeon's viewport
  // against an empty store; falling back to the layout facet answers a question
  // nobody asked. Both are the same lie, so an unregistered pair says so
  // instead. App's mount effect registers before any project can load, so for
  // aeon this is always non-null.
  const mod = moduleFor(engine, facetId);

  // The FG/BG chips write editorStore.setEditingLayer, so they must not be live
  // over a facet that has no editor — any facet an engine grants but does not
  // serve — and chips that mutate an aeon store from a classic screen with no
  // canvas are exactly the dead chrome this branch is removing.
  const showPlane = mod != null && (facetId === 'layout' || facetId === 'collision');
  const header = (
    <div style={styles.header}>
      <FacetBar tabId={activeId} granted={granted} engine={engine} />
      <span style={{ flex: 1 }} />
      {showPlane && (['fg', 'bg'] as EditingLayer[]).map((l) => (
        <Chip key={l} active={editingLayer === l}
          onClick={() => useEditorStore.getState().setEditingLayer(l)}>{l.toUpperCase()}</Chip>
      ))}
      {/* The overlay toggles live HERE, next to the canvas they paint on. They
          used to ride the legacy Toolbar, which aeon level tabs stopped
          rendering when they moved onto this workspace (ead6eaf) — after that
          the only Toolbar left standing was the sprite-doc tab's, so the toggles
          were reachable only from a tab where the map is not on screen and
          "nothing happens" was the honest result. Map facets only: the art
          facet's canvas never reads viewStore.overlays. */}
      {mod?.mapOverlays && <ViewMenu />}
      <Chip disabled={!history?.canUndo} onClick={() => history?.undo()}>Undo</Chip>
      <Chip disabled={!history?.canRedo} onClick={() => history?.redo()}>Redo</Chip>
    </div>
  );

  // Unserved facet: the shell and its header stay, so the facet bar is still
  // there to click away with. An early `return <FacetUnavailable/>` instead
  // would strand the user on a screen with no navigation at all — closing the
  // tab would be the only exit.
  if (!mod) {
    return (
      <EditorShell appBar={header} toolDock={<span />} panels={<span />}>
        <FacetUnavailable engine={engine} facetId={facetId} />
      </EditorShell>
    );
  }

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

/**
 * A granted facet with no module for the open engine. That is a PROFILE bug —
 * the manifest granted something the renderer cannot serve — so it is stated
 * rather than left blank, which is what a silent `return null` gave and what
 * made the old aeon fallback so hard to notice.
 *
 * Rendered as the shell's CHILD, keeping the facet bar on screen. The bar filters
 * on the same (engine, facet) resolve, so no pill leads here — only a restored
 * session record naming a facet this engine dropped can — but the way out has to
 * exist for the case that does happen. Auto-healing to a served facet is a later
 * task; this stays the terminal state either way, since the served set can
 * legitimately be empty.
 */
function FacetUnavailable(
  { engine, facetId }: { engine: OpenEngine | null; facetId: FacetCapability },
): React.ReactElement {
  return (
    <div style={styles.unavailable}>
      The {engine ?? 'open'} engine has no {facetId} editor yet.
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: { display: 'flex', alignItems: 'center', gap: 8, width: '100%' },
  // flex:1 is load-bearing — the shell's content area is a flex container, so
  // without it this is a non-growing item and justifyContent centres nothing.
  unavailable: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', color: T.textLo, fontSize: 12,
  },
};
