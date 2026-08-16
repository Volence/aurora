import React, { useEffect, useMemo, useState } from 'react';
import ToastContainer from './components/ToastContainer';
import CommandPalette from './components/CommandPalette';
import TabStrip from './shell/TabStrip';
import Explorer from './shell/Explorer';
import ConfirmDialog from './shell/ConfirmDialog';
import LevelWorkspace from './workspace/LevelWorkspace';
import SpriteMode from './components/sprite/SpriteMode';
import SpriteDocUnloaded from './components/sprite/SpriteDocUnloaded';
import SpriteDocHeader from './shell/SpriteDocHeader';
import CanvasMode from './components/canvas/CanvasMode';
import CanvasDocUnloaded from './components/canvas/CanvasDocUnloaded';
import NewCanvasDialog from './components/canvas/NewCanvasDialog';
import ImportSheetDialog from './components/canvas/ImportSheetDialog';
import { canvasPaneState } from './components/canvas/canvas-pane-model';
import HomeTab from './components/home/HomeTab';
import ProjectSetupTab from './components/setup/ProjectSetupTab';
import { T } from './components/ui';
import { useProject } from './hooks/useProject';
import { useProjectStore } from './state/projectStore';
import { useClassicProjectStore } from './state/classicProjectStore';
import { useOpenEngine } from './state/open-project';
import { useClassicLevelStore } from './state/classicLevelStore';
import { useSessionStore } from './state/sessionStore';
import { useSpriteStore } from './state/spriteStore';
import { useCanvasStore } from './state/canvasStore';
import { useShellStore } from './state/shellStore';
import { ensureSaversRegistered, saveAllDirty, saveActive } from './state/project-runtime';
import { registerHistoryFactories } from './state/history-factories';
import { registerAeonFacetModules, registerS1FacetModules } from './workspace/register-facets';
import { useSessionLifecycle, useActTabSync } from './shell/session-lifecycle';
import { requestOpenTab, requestFocusIndex } from './shell/tab-activation';
import { buildCommands } from './shell/commands';
import { classicLevelTab, aeonLevelTab, untitledSpriteTab, PROJECT_SETUP_TAB } from './shell/tabs';
import { resolveObjectSprite } from './shell/explorer-data';
import { S1_OBJECT_LIST, s1ObjectHex } from '../core/project/profiles/s1-objects';
import { resolveObjectArt } from '../core/project/profiles/s1-object-art';
import { editObjectArt } from './components/sprite/export-sprite';
import { registerAgentHandler } from './agent/agent-handler';
import { refreshObjectPreviews } from './object-previews';
import type { RecentProject } from '../shared/ipc-types';
import type { ObjectDef } from '../core/model/s4-types';

// Referentially-stable fallback — see the matching constant in shell/Explorer.tsx.
const EMPTY_LIBRARY: ObjectDef[] = [];

export default function App() {
  const { openProject, openProjectByPath } = useProject();
  const error = useProjectStore((s) => s.error);
  const classicError = useClassicProjectStore((s) => s.error);
  const project = useProjectStore((s) => s.project);
  const objectLibrary = useProjectStore((s) => s.project?.objectLibrary ?? EMPTY_LIBRARY);
  const objectBindings = useProjectStore((s) => s.objectBindings);
  const config = useProjectStore((s) => s.config);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicLabel = useClassicProjectStore((s) => s.label);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const classicZone = useClassicLevelStore((s) => s.ref?.zone ?? null);
  const docReady = useClassicLevelStore((s) => s.status) === 'ready';
  const tabs = useSessionStore((s) => s.tabs);
  const activeId = useSessionStore((s) => s.activeId);
  // Which sprite document the editor currently holds — the sprite pane below
  // mounts only when it is the active tab's own (see the comment there).
  const spriteDocId = useSpriteStore((s) => s.activeDocId);
  // The canvas store's focused document. Read here ONLY as the mirror
  // `canvasPaneState` validates the active tab against (R14c) — the pane's
  // document id comes from the TAB, never from this.
  const canvasDocId = useCanvasStore((s) => s.activeDocId);
  const toggleExplorer = useShellStore((s) => s.toggleExplorer);

  const activeTab = tabs.find((t) => t.id === activeId);
  const canvasPane = canvasPaneState(activeTab, canvasDocId);
  // The New Canvas dialog has ONE mount (below), like ConfirmDialog: both ⌘K and
  // the Explorer's row raise it, and two live copies would be two forms racing
  // to create the same file. Plain state rather than another store — App already
  // hands Explorer its other entry points as props.
  const [newCanvasOpen, setNewCanvasOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);

  // -- runtime wiring ------------------------------------------------------
  useEffect(() => {
    registerAgentHandler();
    ensureSaversRegistered();
    registerHistoryFactories();   // must precede any edit: the hub builds no stack without it
    registerAeonFacetModules();
    registerS1FacetModules();
  }, []);
  useSessionLifecycle();
  useActTabSync();

  // Load the object→sprite bindings (and, once a zone gives us a palette, their
  // preview images) whenever a project or act loads. Gated on `project` ALONE:
  // refreshObjectPreviews publishes the bindings before its own zone/palette
  // check, and the Explorer's Object Library needs the names — waiting for a
  // zone here is what used to leave every entry greyed as "no sprite bound"
  // until a level happened to be open.
  useEffect(() => { if (project) refreshObjectPreviews().catch(() => {}); }, [project, currentZoneId]);

  // -- global keys: Ctrl+S save current doc, Ctrl+Shift+S save all,
  //    Ctrl+B explorer, Ctrl+1..9 tab jump ---------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // Ctrl+S is the ACTIVE document only (the coordinator decides which saver
      // owns it); Ctrl+Shift+S is the old save-everything-dirty. Writing a
      // background document the user hadn't finished with is a real cost —
      // these files are build inputs.
      if ((e.key === 's' || e.key === 'S') && !e.altKey) {
        e.preventDefault();
        void (e.shiftKey ? saveAllDirty() : saveActive());
      }
      else if ((e.key === 'b' || e.key === 'B') && !e.shiftKey && !e.altKey) { e.preventDefault(); toggleExplorer(); }
      else if (e.key >= '1' && e.key <= '9' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        void requestFocusIndex(Number(e.key));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleExplorer]);

  // -- window title: Aurora — <project> — <tab> ----------------------------
  useEffect(() => {
    const projectName = classicOpen ? classicLabel : config?.name;
    const parts = ['Aurora', projectName, activeTab && activeTab.kind !== 'home' ? activeTab.title : null];
    document.title = parts.filter(Boolean).join(' — ');
  }, [classicOpen, classicLabel, config, activeTab]);

  // -- ⌘K ------------------------------------------------------------------
  // ONE shared derivation (state/open-project.ts) — App used to key aeon off
  // `config` while save routing and tab activation keyed off `project`, and the
  // two disagree mid-load. The `config` reads below are a different question
  // ("what data is loaded", for enumerating zones) and stay as they are.
  const engine = useOpenEngine();
  const [recents, setRecents] = useState<RecentProject[]>([]);
  useEffect(() => {
    if (engine === null) window.api.getRecentProjects().then(setRecents).catch(() => setRecents([]));
  }, [engine]);
  const commands = useMemo(() => {
    const levelTabs = classicOpen
      ? zoneTree.filter((r) => r.available).map(classicLevelTab)
      : config
        ? config.zones.flatMap((z) => z.acts.map((a) => aeonLevelTab(z.id, z.name, a.id)))
        : [];
    const objects = classicOpen && docReady && classicZone
      ? S1_OBJECT_LIST
          .filter(({ id }) => resolveObjectArt(id, classicZone) !== undefined)
          .map(({ id, name }) => ({ id, name, hex: s1ObjectHex(id) }))
      : [];
    const aeonSprites = objectLibrary
      .map((o) => ({ name: o.name, sprite: resolveObjectSprite(o, objectBindings) }))
      .filter((o): o is { name: string; sprite: string } => !!o.sprite);
    return buildCommands(
      { tabs, activeId, engine, levelTabs, objects, aeonSprites, recents },
      {
        openProjectDialog: () => void openProject(),
        save: () => void saveActive(),
        saveAll: () => void saveAllDirty(),
        toggleExplorer,
        openTab: (tab) => void requestOpenTab(tab),
        editObjectArt: (id) => { void editObjectArt(id); },
        newSprite: () => void requestOpenTab(untitledSpriteTab()),
        newCanvas: () => setNewCanvasOpen(true),
        importSheet: () => setImportSheetOpen(true),
        openRecent: (path) => void openProjectByPath(path),
      },
    );
  }, [tabs, activeId, engine, classicOpen, zoneTree, config, docReady, classicZone, objectLibrary,
      objectBindings, recents, openProject, openProjectByPath, toggleExplorer]);

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

      <div style={styles.body}>
        <Explorer
          onOpenProject={openProject}
          onOpenRecent={openProjectByPath}
          onNewCanvas={() => setNewCanvasOpen(true)}
          onImportSheet={() => setImportSheetOpen(true)}
        />
        <div style={styles.main}>
          <TabStrip />
          <div style={styles.content}>
            {/* Keep-alive: every non-level tab stays mounted; hidden via display:none
                so its state survives (spec §3). Level tabs all share the ONE
                LevelWorkspace singleton below — the editor is a singleton pointed
                at the active tab's target (shell/tab-activation.ts), not one
                instance per tab. Sprite-doc tabs are EXCLUDED here — SpriteMode has
                exactly one mounting point (see below), mounted only while a
                sprite-doc tab is active. Canvas ('art-doc') tabs are excluded for
                the same reason — CanvasMode is a singleton too. */}
            {tabs.filter((t) => t.kind !== 'level' && t.kind !== 'sprite-doc' && t.kind !== 'art-doc').map((tab) => (
              <div key={tab.id} style={{ ...styles.tabPane, display: tab.id === activeId ? 'flex' : 'none' }}>
                {tab.kind === 'home' ? (
                  <HomeTab onOpenProject={openProject} onOpenRecent={openProjectByPath} />
                ) : tab.id === PROJECT_SETUP_TAB.id ? (
                  <ProjectSetupTab />
                ) : null}
              </div>
            ))}
            <div style={{ ...styles.tabPane, display: activeTab?.kind === 'level' ? 'flex' : 'none' }}>
              {/* One workspace, both engines. The old ternary keyed the classic
                  branch off classicProjectStore and the aeon branch off
                  projectStore.config — two derivations that disagree mid-load,
                  which is what open-project.ts was built to end. */}
              {engine ? <LevelWorkspace /> : null}
            </div>
            {/* SpriteMode's ONE mounting point — mounted ONLY while a sprite-doc
                tab is active, NOT keep-alive: two live SpriteMode instances would
                double-register its window keydown handler and double-fire undo.
                Sprite state lives in the module-level spriteStore, so a remount is
                lossless.

                The level pane above stays MOUNTED (display:none) while this sprite
                tab is active, so its editors' window keydown handlers (MapViewport,
                the art facet, the classic view/composer) are still registered
                alongside SpriteMode's. Those level-side handlers are gated by
                levelKeysEnabled() (workspace/level-keys.ts) — inert whenever a
                sprite-doc tab is active — so one Ctrl+Z consumes one undo entry
                rather than two. (It was never "sprite undo AND level undo": both
                handlers resolve focusedHistory(), which on a sprite tab IS the
                sprite's stack. See level-keys.ts for the corrected mechanism.) */}
            {activeTab?.kind === 'sprite-doc' && (
              <div style={{ ...styles.tabPane, display: 'flex' }}>
                {/* SpriteMode renders whatever document is CHECKED OUT, so it may
                    only mount when that is THIS tab's document. A sprite-doc tab
                    can legitimately have none — an s1 object tab restored before
                    any act is open (its art resolves per zone), or a checkout that
                    failed and rolled back. Mounting SpriteMode anyway showed the
                    blank untitled canvas under the tab's name, which read as data
                    loss. Activation sets activeDocId synchronously before it
                    awaits a loader, so an in-flight load does NOT flash this. */}
                {spriteDocId === activeTab.id ? (
                  <SpriteMode appBar={<SpriteDocHeader onSave={() => { void saveActive(); }} />} />
                ) : (
                  <SpriteDocUnloaded tabId={activeTab.id} title={activeTab.title} />
                )}
              </div>
            )}
            {/* CanvasMode's ONE mounting point — same rule as SpriteMode's above,
                for the same reason: two live instances would double-register the
                pane's window keydown handler and fire undo twice per Ctrl+Z. The
                documents live in the module-level canvasStore, so the remount a
                tab switch causes is lossless.

                WHICH DOCUMENT comes from the TAB (canvasPaneState), with the
                store's activeDocId only as the mirror it is validated against
                (R14c). A canvas tab whose file could not be read renders the
                inert pane instead — a blank canvas under a real canvas's name
                reads as "your art is gone". */}
            {canvasPane.kind !== 'hidden' && (
              <div style={{ ...styles.tabPane, display: 'flex' }}>
                {canvasPane.kind === 'ready' ? (
                  <CanvasMode
                    /* KEYED BY DOCUMENT: switching between two canvas tabs
                       remounts the pane instead of re-pointing a live one, so no
                       controller, zoom anchor or in-flight gesture can carry
                       from one document into another. Lossless — everything the
                       pane shows lives in canvasStore. */
                    key={canvasPane.docId}
                    docId={canvasPane.docId}
                    appBar={(
                      <SpriteDocHeader
                        onSave={() => { void saveActive(); }}
                        noDestinationHint="This canvas has no file yet, so there is nowhere to save it."
                      />
                    )}
                  />
                ) : (
                  <CanvasDocUnloaded tabId={canvasPane.tabId} title={canvasPane.title} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <ToastContainer />
      <CommandPalette commands={commands} />
      <ConfirmDialog />
      <NewCanvasDialog open={newCanvasOpen} onClose={() => setNewCanvasOpen(false)} />
      {importSheetOpen && <ImportSheetDialog onClose={() => setImportSheetOpen(false)} />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: T.surface, color: T.textHi,
  },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  content: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  tabPane: { flex: 1, minWidth: 0, overflow: 'hidden' },
  error: {
    padding: '6px 12px', background: T.error, color: T.void,
    fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
  },
  dismissButton: {
    padding: '2px 8px', background: 'rgba(0,0,0,0.2)', border: 'none',
    color: T.void, borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
};
