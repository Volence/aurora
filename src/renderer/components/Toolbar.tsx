import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../state/projectStore';
import { focusedHistory } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import type { RecentProject } from '../../shared/ipc-types';
import AuroraMark from './AuroraMark';
import { T, Chip, IconButton, Divider, Icons } from './ui';
import { useDirtySnapshot } from '../shell/dirty-snapshot';
import { tabHasDirtyDot } from '../shell/dirty-tabs';
import { canSaveActive } from '../state/project-runtime';

interface ToolbarProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => Promise<void> | void;
}

export default function Toolbar({ onOpenProject, onOpenRecent, onSave }: ToolbarProps) {
  const config = useProjectStore((s) => s.config);
  const loading = useProjectStore((s) => s.loading);
  // ONE undo/redo pair for every surface this app bar fronts (aeon level, classic
  // level, sprite doc): which document it drives is focusedHistory()'s decision,
  // and the hub clock re-evaluates its enabledness. The activeId subscription is
  // what re-renders when focus MOVES between documents (the hub only fires when a
  // stack changes, which switching tabs does not).
  const activeId = useSessionStore((s) => s.activeId);
  useHistoryVersion();
  const history = focusedHistory();

  // ONE Save chip for whatever document is in front, matching Ctrl+S exactly.
  // It used to be two chips whose enabledness knew only about LEVEL dirtiness
  // while their click ran save-all (which writes sprite art too): with only a
  // sprite dirty the button sat inert over an operation that was available and
  // meaningful. Enabledness is now the coordinator's own verdict on the active
  // tab, and the "unsaved" badge reuses the tab strip's dot rule — no second
  // definition of dirty anywhere.
  const dirtySnap = useDirtySnapshot();
  const activeKind = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeId)?.kind);
  const activeDirty = activeKind ? tabHasDirtyDot(activeId, activeKind, dirtySnap) : false;
  const canSave = canSaveActive(activeId);

  // Classic (disasm) session state — the toolbar's classic twin of the aeon
  // block below: save + dirty badge. It used to render in the classic level view's
  // app bar as well; since the shell flip (stage-4 plan 5, task 9) deleted that
  // view, App's SpriteMode app bar is this component's ONLY mount, so every
  // level-side control here is now unreachable. Task 10 deletes the Toolbar and
  // gives the sprite-doc pane a header of its own. The zone/act selector went
  // earlier (Fix D): it duplicated the explorer LEVELS list + tab strip and
  // rendered oddly inside the sprite-doc pane's app bar. Sprite mode is reached
  // by opening a sprite-doc tab, not a mode chip.
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';

  const [recentOpen, setRecentOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [saveFlash, setSaveFlash] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load recent projects when dropdown opens
  useEffect(() => {
    if (recentOpen) {
      window.api.getRecentProjects().then(setRecentProjects);
    }
  }, [recentOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!recentOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRecentOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [recentOpen]);

  return (
    <>
      <div style={styles.brand} title="Aurora — visual authoring (Empyrean suite)">
        <AuroraMark size={20} />
        <span style={styles.wordmark}>Aurora</span>
      </div>

      <div style={{ position: 'relative' }} ref={dropdownRef}>
        <div style={{ display: 'flex', gap: 0 }}>
          <button onClick={onOpenProject} style={{ ...styles.button, borderRadius: '4px 0 0 4px' }} disabled={loading}>
            Open
          </button>
          <button
            onClick={() => setRecentOpen(!recentOpen)}
            style={{ ...styles.button, borderRadius: '0 4px 4px 0', borderLeft: 'none', padding: '2px 5px' }}
            disabled={loading}
          >
            &#x25BE;
          </button>
        </div>

        {recentOpen && (
          <div style={styles.dropdown}>
            {recentProjects.length === 0 ? (
              <div style={styles.dropdownEmpty}>No recent projects</div>
            ) : (
              recentProjects.map((project) => (
                <button
                  key={project.path}
                  style={styles.dropdownItem}
                  onClick={() => {
                    setRecentOpen(false);
                    onOpenRecent(project.path);
                  }}
                  title={project.path}
                >
                  <span style={styles.projectName}>{project.name}</span>
                  <span style={styles.projectPath}>{project.path}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* The undo/redo pair, once, for whichever document has focus. */}
      {(config || classicOpen) && (
        <>
          <Divider />

          <IconButton
            icon={<Icons.IconUndo size={14} />}
            label="Undo (Ctrl+Z)"
            onClick={() => history?.undo()}
            disabled={!history?.canUndo}
          />
          <IconButton
            icon={<Icons.IconRedo size={14} />}
            label="Redo (Ctrl+Y)"
            onClick={() => history?.redo()}
            disabled={!history?.canRedo}
          />
        </>
      )}

      {/* Save = the CURRENT document (Ctrl+S). Save All is Ctrl+Shift+S / ⌘K,
          deliberately not a chip: the app bar's job is the thing in front of you.
          The disabled title says why when a dirty sprite has nowhere to write. */}
      {(config || classicOpen) && (
        <>
          <Chip
            active={saveFlash}
            disabled={!canSave && !saveFlash}
            title={
              canSave ? 'Save this document (Ctrl+S) — Save All is Ctrl+Shift+S'
                : activeDirty ? 'This document has no save-back file — export it from the sprite editor'
                  : 'Nothing to save in this document'
            }
            onClick={async () => {
              await onSave();
              setSaveFlash(true);
              setTimeout(() => setSaveFlash(false), 1500);
            }}
          >
            {saveFlash ? 'Saved!' : 'Save'}
          </Chip>

          {activeDirty && <span style={styles.dirtyBadge}>unsaved</span>}
        </>
      )}

      {loading && <span style={styles.loading}>Loading...</span>}

      <div style={{ flex: 1 }} />

      {/* The View (overlay) menu used to sit here. It moved to LevelWorkspace's
          header: this Toolbar is now the app bar of the CLASSIC workspace and of
          sprite-doc tabs only, and viewStore.overlays paints on aeon's
          MapViewport — which neither of those has on screen. */}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  brand: {
    display: 'flex', alignItems: 'center', gap: 6, paddingRight: 8, marginRight: 2,
    borderRight: `1px solid ${T.border}`, userSelect: 'none' as const,
  },
  wordmark: {
    fontSize: 13, fontWeight: 600, letterSpacing: '0.04em',
    color: T.textHi,
  },
  button: {
    padding: '2px 8px', background: T.raised, color: T.textHi, border: `1px solid ${T.borderStrong}`,
    borderRadius: 4, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' as const,
  },
  dirtyBadge: {
    fontSize: 9, color: T.void, background: T.warning,
    padding: '0 4px', borderRadius: 3, lineHeight: '14px', fontWeight: 600,
  },
  loading: {
    fontSize: 11, color: T.warning,
  },
  dropdown: {
    position: 'absolute' as const, top: '100%', left: 0, marginTop: 4,
    background: T.raised, border: `1px solid ${T.borderStrong}`, borderRadius: 6,
    minWidth: 320, maxHeight: 300, overflow: 'auto', zIndex: 100,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  dropdownEmpty: {
    padding: '12px 16px', color: T.textLo, fontSize: 13,
  },
  dropdownItem: {
    display: 'flex', flexDirection: 'column' as const, width: '100%',
    padding: '8px 12px', background: 'transparent', border: 'none',
    color: T.textHi, cursor: 'pointer', textAlign: 'left' as const,
    borderBottom: `1px solid ${T.borderStrong}`,
  },
  projectName: {
    fontSize: 13, fontWeight: 500,
  },
  projectPath: {
    fontSize: 11, color: T.textLo, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
};
