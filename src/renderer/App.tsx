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
import { useProject } from './hooks/useProject';
import { useProjectStore } from './state/projectStore';
import { useEditorStore } from './state/editorStore';

export default function App() {
  const { openProject, openProjectByPath, saveProject } = useProject();
  const error = useProjectStore((s) => s.error);
  const tool = useEditorStore((s) => s.tool);

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

  return (
    <div style={styles.root}>
      <Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveProject} />

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

      <div style={styles.main}>
        <div style={styles.leftPanel}>
          <SectionGridNav />
          {tool === 'stamp-chunk' && <ChunkLibrary />}
          {tool === 'place-object' && (
            <ObjectPalette
              selectedType={0}
              onSelectType={(type, subtype) => useEditorStore.getState().setSelectedObjectTypeId(String(type), subtype)}
            />
          )}
          {tool === 'place-ring' && (
            <RingPatternPalette
              selectedIndex={useEditorStore.getState().selectedRingPattern}
              onSelect={(index) => useEditorStore.getState().setSelectedRingPattern(index)}
            />
          )}
          <div style={{ flex: 1 }} />
          <ArtBrowser />
        </div>
        <MapViewport />
        <PropertiesPanel />
      </div>
      <PaletteViewer />
      <StatusBar />
      <ToastContainer />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: '#1e1e2e', color: '#cdd6f4',
  },
  main: {
    flex: 1, display: 'flex', overflow: 'hidden',
  },
  leftPanel: {
    width: 200, display: 'flex', flexDirection: 'column',
    background: '#1e1e2e', borderRight: '1px solid #313244',
    flexShrink: 0, overflow: 'auto',
  },
  error: {
    padding: '6px 12px', background: '#f38ba8', color: '#1e1e2e',
    fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
  },
  dismissButton: {
    padding: '2px 8px', background: 'rgba(0,0,0,0.2)', border: 'none',
    color: '#1e1e2e', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
};
