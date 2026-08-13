import React, { useState, useEffect, useRef } from 'react';
import { useProjectStore } from '../state/projectStore';
import { useEditorStore, focusedHistory } from '../state/editorStore';
import { useHistoryVersion } from '../hooks/useHistoryVersion';
import { useSessionStore } from '../state/sessionStore';
import { useClassicProjectStore } from '../state/classicProjectStore';
import { useClassicLevelStore } from '../state/classicLevelStore';
import type { RecentProject } from '../../shared/ipc-types';
import AuroraMark from './AuroraMark';
import { T, Chip, IconButton, Divider, Icons } from './ui';
import ViewMenu from '../shell/ViewMenu';

interface ToolbarProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => Promise<void> | void;
}

export default function Toolbar({ onOpenProject, onOpenRecent, onSave }: ToolbarProps) {
  const config = useProjectStore((s) => s.config);
  const loading = useProjectStore((s) => s.loading);
  const dirty = useEditorStore((s) => s.dirty);
  // ONE undo/redo pair for every surface this app bar fronts (aeon level, classic
  // level, sprite doc): which document it drives is focusedHistory()'s decision,
  // and the hub clock re-evaluates its enabledness. The activeId subscription is
  // what re-renders when focus MOVES between documents (the hub only fires when a
  // stack changes, which switching tabs does not).
  useSessionStore((s) => s.activeId);
  useHistoryVersion();
  const history = focusedHistory();

  // Classic (disasm) session state — the toolbar's classic twin of the aeon
  // block below: save + dirty badge, rendered in BOTH the classic level view
  // (ClassicProjectView's app bar) and the sprite-doc pane (App's SpriteMode app
  // bar) so the two surfaces stay visibly part of one app. The zone/act selector
  // was removed (Fix D): it duplicated the explorer LEVELS list + tab strip and
  // rendered oddly inside the sprite-doc pane's app bar. Sprite mode is reached
  // by opening a sprite-doc tab, not a mode chip.
  const classicOpen = useClassicProjectStore((s) => s.status) === 'open';
  const classicDirty = useClassicLevelStore((s) => Object.values(s.dirty).some(Boolean));

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

      {/* Aeon save block: currently UNREACHABLE — aeon level tabs render
          LevelWorkspace (not Toolbar), and sprite-docs are classic-only until the
          aeon Object Library task lands. Kept for that upcoming aeon sprite-doc
          app bar. The zone/act selector was removed (Fix D — the explorer + tab
          strip own level navigation). */}
      {config && (
        <>
          <Chip
            active={saveFlash}
            disabled={!dirty && !saveFlash}
            onClick={async () => {
              await onSave();
              setSaveFlash(true);
              setTimeout(() => setSaveFlash(false), 1500);
            }}
          >
            {saveFlash ? 'Saved!' : 'Save'}
          </Chip>

          {dirty && <span style={styles.dirtyBadge}>unsaved</span>}
        </>
      )}

      {classicOpen && !config && (
        <>
          <Chip
            active={saveFlash}
            disabled={!classicDirty && !saveFlash}
            onClick={async () => {
              await onSave();
              setSaveFlash(true);
              setTimeout(() => setSaveFlash(false), 1500);
            }}
          >
            {saveFlash ? 'Saved!' : 'Save'}
          </Chip>

          {classicDirty && <span style={styles.dirtyBadge}>unsaved</span>}
        </>
      )}

      {loading && <span style={styles.loading}>Loading...</span>}

      <div style={{ flex: 1 }} />

      {config && <ViewMenu />}
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
