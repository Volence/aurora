import React, { useEffect } from 'react';
import Toolbar from './components/Toolbar';
import MapViewport from './components/MapViewport';
import SectionGridNav from './components/SectionGridNav';
import ChunkLibrary from './components/ChunkLibrary';
import ObjectPalette from './components/ObjectPalette';
import RingPatternPalette from './components/RingPatternPalette';
import CollisionPalette from './components/CollisionPalette';
import MarqueePasteOptions from './components/MarqueePasteOptions';
import ArtBrowser from './components/ArtBrowser';
import PaletteViewer from './components/PaletteViewer';
import PropertiesPanel from './components/PropertiesPanel';
import ToastContainer from './components/ToastContainer';
import CommandPalette, { type Command } from './components/CommandPalette';
import ArtMode from './components/art/ArtMode';
import SpriteMode from './components/sprite/SpriteMode';
import ClassicProjectView from './components/classic/ClassicProjectView';
import EditorShell from './shell/EditorShell';
import MapToolDock from './shell/MapToolDock';
import MapStatusBar from './shell/MapStatusBar';
import { Panel, CollapsibleSection, T } from './components/ui';
import { useProject } from './hooks/useProject';
import { useProjectStore } from './state/projectStore';
import { useClassicProjectStore } from './state/classicProjectStore';
import { saveClassicProject } from './state/classic-save';
import { useEditorStore } from './state/editorStore';
import { registerAgentHandler } from './agent/agent-handler';
import { refreshObjectPreviews } from './object-previews';

export default function App() {
  const { openProject, openProjectByPath, saveProject } = useProject();
  const error = useProjectStore((s) => s.error);
  const classicError = useClassicProjectStore((s) => s.error);
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  const appMode = useEditorStore((s) => s.appMode);
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);

  // Save routes by which project is open. While a classic (disasm) project is
  // open, the app-bar Save / Ctrl+S must NOT target the stale aeon project still
  // resident in projectStore (aeon state isn't reset on classic open) — it runs
  // the classic guarded save instead (Task 10). saveClassicProject collects the
  // classic editing store's dirty acts (Task 12) and writes them through the
  // mtime-guarded channel, toasting the outcome (saved / conflict / partial);
  // Task 13's stamp + chunk-picker edits are what make those acts dirty.
  const guardedSave = React.useCallback(() => {
    if (useClassicProjectStore.getState().status === 'open') {
      void saveClassicProject();
      return;
    }
    return saveProject();
  }, [saveProject]);

  // Register the MCP agent bridge handler once on mount
  useEffect(() => { registerAgentHandler(); }, []);

  // Build object preview images (from sprite bindings) when a project/zone loads.
  useEffect(() => { if (project && currentZoneId) refreshObjectPreviews().catch(() => {}); }, [project, currentZoneId]);

  // Global Ctrl+S handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        guardedSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [guardedSave]);

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
      { id: 'save', label: 'Save Project', hint: 'Ctrl+S', run: () => guardedSave() },
      { id: 'mode-map', label: 'Switch to Map mode', hint: 'mode', run: () => setAppMode('map') },
      { id: 'mode-art', label: 'Switch to Art mode', hint: 'mode', run: () => setAppMode('art') },
      { id: 'mode-sprite', label: 'Switch to Sprite mode', hint: 'mode', run: () => setAppMode('sprite') },
    ];
  }, [openProject, guardedSave]);

  return (
    <div style={styles.root}>
      {(error || classicError) && (
        <div style={styles.error}>
          <span style={{ whiteSpace: 'pre-line' }}>{error || classicError}</span>
          <button
            onClick={() => {
              if (error) useProjectStore.getState().setError(null);
              if (classicError) useClassicProjectStore.getState().clearError();
            }}
            style={styles.dismissButton}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* While a classic (disasm) project is open, the classic view owns the
          screen — EXCEPT Sprite mode, which the edit-art handoff (Task B2)
          switches into to edit an object's art. SpriteMode then renders over the
          classic project (its guard accepts a classic project too); switching
          back to any non-sprite mode (command palette "Switch to Map mode")
          returns here. The classic stores are module-level singletons, so the
          round trip preserves the open act, unsaved edits, and undo history —
          only the classic viewport's local pan/zoom is lost (acceptable v1). */}
      {classicOpen && appMode !== 'sprite' ? (
        <ClassicProjectView
          appBar={<Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={guardedSave} />}
        />
      ) : appMode === 'art' ? (
        <ArtMode appBar={<Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveProject} />} />
      ) : appMode === 'sprite' ? (
        <SpriteMode appBar={<Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveProject} />} />
      ) : (
        <EditorShell
          appBar={<Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveProject} />}
          toolDock={<MapToolDock />}
          panels={
            <Panel width={240} scroll>
              <CollapsibleSection id="map.sections" title="Sections">
                <SectionGridNav />
              </CollapsibleSection>
              {/* Paste mode isn't tied to the active tool (Ctrl+V doesn't switch
                  tools), so it's checked first and suppresses every other
                  tool's options panel — otherwise pasting while e.g.
                  stamp-chunk is still selected would render two panels
                  sharing the "map.palette" collapse-state id at once. */}
              {!pasting && tool === 'stamp-chunk' && (
                <CollapsibleSection id="map.palette" title="Chunks">
                  <ChunkLibrary />
                </CollapsibleSection>
              )}
              {!pasting && tool === 'place-object' && (
                <CollapsibleSection id="map.palette" title="Objects">
                  <ObjectPalette
                    selectedType={0}
                    onSelectType={(type, subtype) => useEditorStore.getState().setSelectedObjectTypeId(String(type), subtype)}
                  />
                </CollapsibleSection>
              )}
              {!pasting && tool === 'place-ring' && (
                <CollapsibleSection id="map.palette" title="Ring Patterns">
                  <RingPatternPalette
                    selectedIndex={useEditorStore.getState().selectedRingPattern}
                    onSelect={(index) => useEditorStore.getState().setSelectedRingPattern(index)}
                  />
                </CollapsibleSection>
              )}
              {!pasting && tool === 'paint-collision' && (
                <CollapsibleSection id="map.palette" title="Collision">
                  <CollisionPalette />
                </CollapsibleSection>
              )}
              {(tool === 'marquee' || pasting) && (
                <CollapsibleSection id="map.palette" title={pasting ? 'Paste' : 'Marquee'}>
                  <MarqueePasteOptions />
                </CollapsibleSection>
              )}
              <CollapsibleSection id="map.art" title="Art">
                <ArtBrowser />
              </CollapsibleSection>
              <CollapsibleSection id="map.props" title="Properties">
                <PropertiesPanel />
              </CollapsibleSection>
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
