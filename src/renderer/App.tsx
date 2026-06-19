import React, { useEffect, useState } from 'react';
import Toolbar from './components/Toolbar';
import MapViewport from './components/MapViewport';
import SectionGridNav from './components/SectionGridNav';
import ChunkLibrary from './components/ChunkLibrary';
import ObjectPalette from './components/ObjectPalette';
import RingPatternPalette from './components/RingPatternPalette';
import ArtBrowser from './components/ArtBrowser';
import PaletteViewer from './components/PaletteViewer';
import PropertiesPanel from './components/PropertiesPanel';
import StatusBar from './components/StatusBar';
import ToastContainer from './components/ToastContainer';
import CommandPalette, { type Command } from './components/CommandPalette';
import ArtMode from './components/art/ArtMode';
import SpriteMode from './components/sprite/SpriteMode';
import EditorShell from './shell/EditorShell';
import MapToolDock from './shell/MapToolDock';
import MapStatusBar from './shell/MapStatusBar';
import { Panel, PanelHeader, T } from './components/ui';
import { useProject } from './hooks/useProject';
import { useProjectStore } from './state/projectStore';
import { useEditorStore } from './state/editorStore';
import { registerAgentHandler } from './agent/agent-handler';
import { refreshObjectPreviews } from './object-previews';

export default function App() {
  const { openProject, openProjectByPath, saveProject } = useProject();
  const error = useProjectStore((s) => s.error);
  const tool = useEditorStore((s) => s.tool);
  const appMode = useEditorStore((s) => s.appMode);
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);

  // Register the MCP agent bridge handler once on mount
  useEffect(() => { registerAgentHandler(); }, []);

  // Build object preview images (from sprite bindings) when a project/zone loads.
  useEffect(() => { if (project && currentZoneId) refreshObjectPreviews().catch(() => {}); }, [project, currentZoneId]);

  // Global Ctrl+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProject();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveProject]);

  // Window/tab title: `Aurora — <context>` (Empyrean chrome convention).
  useEffect(() => {
    const modeLabel = appMode === 'art' ? 'Art' : appMode === 'sprite' ? 'Sprite' : 'Map';
    const ctx = project ? [currentZoneId, modeLabel].filter(Boolean).join(' · ') : null;
    document.title = ctx ? `Aurora — ${ctx}` : 'Aurora';
  }, [project, currentZoneId, appMode]);

  // Command palette (Ctrl/Cmd-K) entries.
  const commands: Command[] = React.useMemo(() => {
    const setAppMode = useEditorStore.getState().setAppMode;
    return [
      { id: 'open', label: 'Open Project…', hint: 'project', run: () => openProject() },
      { id: 'save', label: 'Save Project', hint: 'Ctrl+S', run: () => saveProject() },
      { id: 'mode-map', label: 'Switch to Map mode', hint: 'mode', run: () => setAppMode('map') },
      { id: 'mode-art', label: 'Switch to Art mode', hint: 'mode', run: () => setAppMode('art') },
      { id: 'mode-sprite', label: 'Switch to Sprite mode', hint: 'mode', run: () => setAppMode('sprite') },
    ];
  }, [openProject, saveProject]);

  return (
    <div style={styles.root}>
      {error && (
        <div style={styles.error}>
          {error}
          <button
            onClick={() => useProjectStore.getState().setError(null)}
            style={styles.dismissButton}
          >
            Dismiss
          </button>
        </div>
      )}

      {appMode === 'art' ? (
        <>
          <Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveProject} />
          <ArtMode />
          <StatusBar />
        </>
      ) : appMode === 'sprite' ? (
        <>
          <Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveProject} />
          <SpriteMode />
          <StatusBar />
        </>
      ) : (
        <EditorShell
          appBar={<Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveProject} />}
          toolDock={<MapToolDock />}
          panels={
            <Panel width={240} scroll>
              <PanelHeader>Sections</PanelHeader>
              <SectionGridNav />
              {tool === 'stamp-chunk' && (
                <>
                  <PanelHeader>Chunks</PanelHeader>
                  <ChunkLibrary />
                </>
              )}
              {tool === 'place-object' && (
                <>
                  <PanelHeader>Objects</PanelHeader>
                  <ObjectPalette
                    selectedType={0}
                    onSelectType={(type, subtype) => useEditorStore.getState().setSelectedObjectTypeId(String(type), subtype)}
                  />
                </>
              )}
              {tool === 'place-ring' && (
                <>
                  <PanelHeader>Ring Patterns</PanelHeader>
                  <RingPatternPalette
                    selectedIndex={useEditorStore.getState().selectedRingPattern}
                    onSelect={(index) => useEditorStore.getState().setSelectedRingPattern(index)}
                  />
                </>
              )}
              <PanelHeader>Art</PanelHeader>
              <ArtBrowser />
              <PanelHeader>Properties</PanelHeader>
              <PropertiesPanel />
            </Panel>
          }
          bottomExtra={<PaletteViewer />}
          status={<MapStatusBar />}
        >
          <MapViewport />
        </EditorShell>
      )}
      <ToastContainer />
      <CommandPalette commands={commands} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: T.surface, color: T.textHi,
  },
  error: {
    padding: '6px 12px', background: T.error, color: T.void,
    fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
  },
  dismissButton: {
    padding: '2px 8px', background: 'rgba(0,0,0,0.2)', border: 'none',
    color: T.void, borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
};
