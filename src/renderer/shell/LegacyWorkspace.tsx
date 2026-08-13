// src/renderer/shell/LegacyWorkspace.tsx
// The pre-overhaul editor composition, extracted VERBATIM from App.tsx as the
// Stage 2 content of every level tab. It is a singleton: one instance stays
// mounted for the whole app lifetime (hidden when a non-level tab is active)
// so canvas/pan/zoom/undo state survives tab switches. Stages 3–4 dissolve it
// into facet modules; do not refactor it here.
//
// Every branch's app bar saves through the single onSave prop: the
// SaveCoordinator (state/project-runtime.ts) saves every dirty surface, which
// supersedes the old per-surface guardedSave/saveProject routing.

import Toolbar from '../components/Toolbar';
import MapViewport from '../components/MapViewport';
import SectionGridNav from '../components/SectionGridNav';
import ChunkLibrary from '../components/ChunkLibrary';
import ObjectPalette from '../components/ObjectPalette';
import RingPatternPalette from '../components/RingPatternPalette';
import CollisionPalette from '../components/CollisionPalette';
import MarqueePasteOptions from '../components/MarqueePasteOptions';
import ArtBrowser from '../components/ArtBrowser';
import PaletteViewer from '../components/PaletteViewer';
import PropertiesPanel from '../components/PropertiesPanel';
import ArtMode from '../components/art/ArtMode';
import SpriteMode from '../components/sprite/SpriteMode';
import ClassicProjectView from '../components/classic/ClassicProjectView';
import EditorShell from './EditorShell';
import MapToolDock from './MapToolDock';
import MapStatusBar from './MapStatusBar';
import { Panel, CollapsibleSection } from '../components/ui';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useEditorStore } from '../state/editorStore';

export interface LegacyWorkspaceProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => Promise<unknown> | void;
}

export default function LegacyWorkspace({ onOpenProject, onOpenRecent, onSave }: LegacyWorkspaceProps) {
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const tool = useEditorStore((s) => s.tool);
  const pasting = useEditorStore((s) => s.pasting);
  const appMode = useEditorStore((s) => s.appMode);
  // Toolbar's onSave is `() => void | Promise<void>`; adapt the wider
  // `Promise<unknown>`-returning prop (saveAllDirty returns a result).
  const appBar = <Toolbar onOpenProject={onOpenProject} onOpenRecent={onOpenRecent} onSave={() => { void onSave(); }} />;
  return (
    <>
      {/* While a classic (disasm) project is open, the classic view owns the
          screen — EXCEPT Sprite mode, which the edit-art handoff (Task B2)
          switches into to edit an object's art. SpriteMode then renders over the
          classic project (its guard accepts a classic project too); switching
          back to any non-sprite mode (command palette "Switch to Map mode")
          returns here. The classic stores are module-level singletons, so the
          round trip preserves the open act, unsaved edits, and undo history —
          only the classic viewport's local pan/zoom is lost (acceptable v1). */}
      {classicOpen && appMode !== 'sprite' ? (
        <ClassicProjectView appBar={appBar} />
      ) : appMode === 'art' ? (
        <ArtMode appBar={appBar} />
      ) : appMode === 'sprite' ? (
        <SpriteMode appBar={appBar} />
      ) : (
        <EditorShell
          appBar={appBar}
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
    </>
  );
}
