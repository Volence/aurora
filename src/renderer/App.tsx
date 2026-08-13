import React, { useEffect, useMemo, useState } from 'react';
import ToastContainer from './components/ToastContainer';
import CommandPalette from './components/CommandPalette';
import TabStrip from './shell/TabStrip';
import Explorer from './shell/Explorer';
import ConfirmDialog from './shell/ConfirmDialog';
import LegacyWorkspace from './shell/LegacyWorkspace';
import LevelWorkspace from './workspace/LevelWorkspace';
import SpriteMode from './components/sprite/SpriteMode';
import Toolbar from './components/Toolbar';
import HomeTab from './components/home/HomeTab';
import ProjectSetupTab from './components/setup/ProjectSetupTab';
import { T } from './components/ui';
import { useProject } from './hooks/useProject';
import { useProjectStore } from './state/projectStore';
import { useClassicProjectStore } from './state/classicProjectStore';
import { useClassicLevelStore } from './state/classicLevelStore';
import { useSessionStore } from './state/sessionStore';
import { useShellStore } from './state/shellStore';
import { ensureSaversRegistered, saveAllDirty, saveActive } from './state/project-runtime';
import { registerHistoryFactories } from './state/history-factories';
import { registerAeonFacetModules } from './workspace/register-facets';
import { useSessionLifecycle, useActTabSync } from './shell/session-lifecycle';
import { requestOpenTab, requestFocusIndex } from './shell/tab-activation';
import { buildCommands } from './shell/commands';
import { classicLevelTab, aeonLevelTab, PROJECT_SETUP_TAB } from './shell/tabs';
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
  const config = useProjectStore((s) => s.config);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicLabel = useClassicProjectStore((s) => s.label);
  const zoneTree = useClassicProjectStore((s) => s.zoneTree);
  const classicZone = useClassicLevelStore((s) => s.ref?.zone ?? null);
  const docReady = useClassicLevelStore((s) => s.status) === 'ready';
  const tabs = useSessionStore((s) => s.tabs);
  const activeId = useSessionStore((s) => s.activeId);
  const toggleExplorer = useShellStore((s) => s.toggleExplorer);

  const activeTab = tabs.find((t) => t.id === activeId);

  // -- runtime wiring ------------------------------------------------------
  useEffect(() => {
    registerAgentHandler();
    ensureSaversRegistered();
    registerHistoryFactories();   // must precede any edit: the hub builds no stack without it
    registerAeonFacetModules();
  }, []);
  useSessionLifecycle();
  useActTabSync();

  // Build object preview images (from sprite bindings) when a project/zone loads.
  useEffect(() => { if (project && currentZoneId) refreshObjectPreviews().catch(() => {}); }, [project, currentZoneId]);

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
  const engine = classicOpen ? ('s1' as const) : config ? ('aeon' as const) : null;
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
      .filter((o): o is ObjectDef & { sprite: string } => !!o.sprite)
      .map((o) => ({ name: o.name, sprite: o.sprite }));
    return buildCommands(
      { tabs, activeId, engine, levelTabs, objects, aeonSprites, recents },
      {
        openProjectDialog: () => void openProject(),
        save: () => void saveActive(),
        saveAll: () => void saveAllDirty(),
        toggleExplorer,
        openTab: (tab) => void requestOpenTab(tab),
        editObjectArt: (id) => { void editObjectArt(id); },
        openRecent: (path) => void openProjectByPath(path),
      },
    );
  }, [tabs, activeId, engine, classicOpen, zoneTree, config, docReady, classicZone, objectLibrary, recents,
      openProject, openProjectByPath, toggleExplorer]);

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
        <Explorer onOpenProject={openProject} onOpenRecent={openProjectByPath} />
        <div style={styles.main}>
          <TabStrip />
          <div style={styles.content}>
            {/* Keep-alive: every non-level tab stays mounted; hidden via display:none
                so its state survives (spec §3). Level tabs all share the ONE
                LegacyWorkspace singleton below until Stages 3–4. Sprite-doc tabs
                are EXCLUDED here — SpriteMode has exactly one mounting point (see
                below), mounted only while a sprite-doc tab is active. */}
            {tabs.filter((t) => t.kind !== 'level' && t.kind !== 'sprite-doc').map((tab) => (
              <div key={tab.id} style={{ ...styles.tabPane, display: tab.id === activeId ? 'flex' : 'none' }}>
                {tab.kind === 'home' ? (
                  <HomeTab onOpenProject={openProject} onOpenRecent={openProjectByPath} />
                ) : tab.id === PROJECT_SETUP_TAB.id ? (
                  <ProjectSetupTab />
                ) : null}
              </div>
            ))}
            <div style={{ ...styles.tabPane, display: activeTab?.kind === 'level' ? 'flex' : 'none' }}>
              {classicOpen ? (
                <LegacyWorkspace onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={saveActive} />
              ) : config ? (
                <LevelWorkspace />
              ) : null}
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
                sprite-doc tab is active — so one Ctrl+Z can't fire both sprite and
                the hidden level undo (finding 1). */}
            {activeTab?.kind === 'sprite-doc' && (
              <div style={{ ...styles.tabPane, display: 'flex' }}>
                <SpriteMode appBar={<Toolbar onOpenProject={openProject} onOpenRecent={openProjectByPath} onSave={() => { void saveActive(); }} />} />
              </div>
            )}
          </div>
        </div>
      </div>

      <ToastContainer />
      <CommandPalette commands={commands} />
      <ConfirmDialog />
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
