import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useProjectStore, getCurrentZone, getCurrentAct } from '../state/projectStore';
import { useViewStore, type OverlayOptions } from '../state/viewStore';
import { useEditorStore, editHistory, undo, redo, type EditorTool } from '../state/editorStore';
import type { S4Level } from '../../core/editing/commands';
import type { RecentProject } from '../../shared/ipc-types';

interface ToolbarProps {
  onOpenProject: () => void;
  onSave: () => void;
}

export default function Toolbar({ onOpenProject, onSave }: ToolbarProps) {
  const config = useProjectStore((s) => s.config);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const currentActId = useProjectStore((s) => s.currentActId);
  const loading = useProjectStore((s) => s.loading);
  const zoom = useViewStore((s) => s.zoom);
  const setZoom = useViewStore((s) => s.setZoom);
  const overlays = useViewStore((s) => s.overlays);
  const toggleOverlay = useViewStore((s) => s.toggleOverlay);
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const dirty = useEditorStore((s) => s.dirty);
  const historyVersion = useEditorStore((s) => s.historyVersion);

  const [recentOpen, setRecentOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
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

  const zoomPercent = Math.round(zoom * 100);

  const handleSelectZoneAct = useCallback((value: string) => {
    const [zoneId, actId] = value.split(':');
    if (zoneId && actId) {
      useProjectStore.getState().setCurrentAct(zoneId, actId);
    }
  }, []);

  function getLevel(): S4Level | null {
    const state = useProjectStore.getState();
    const act = getCurrentAct(state);
    return act ? { sections: act.sections } : null;
  }

  return (
    <header style={styles.toolbar}>
      <div style={{ position: 'relative' }} ref={dropdownRef}>
        <div style={{ display: 'flex', gap: 0 }}>
          <button onClick={onOpenProject} style={{ ...styles.button, borderRadius: '4px 0 0 4px' }} disabled={loading}>
            Open Project
          </button>
          <button
            onClick={() => setRecentOpen(!recentOpen)}
            style={{ ...styles.button, borderRadius: '0 4px 4px 0', borderLeft: 'none', padding: '4px 6px' }}
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
                    // TODO: open recent by path
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

      {config && (
        <>
          <select
            value={currentZoneId && currentActId ? `${currentZoneId}:${currentActId}` : ''}
            onChange={(e) => handleSelectZoneAct(e.target.value)}
            style={styles.select}
            disabled={loading}
          >
            <option value="" disabled>Select Zone/Act</option>
            {config.zones.map((zone) =>
              zone.acts.map((act) => (
                <option key={`${zone.id}:${act.id}`} value={`${zone.id}:${act.id}`}>
                  {zone.name} - {act.id}
                </option>
              ))
            )}
          </select>

          <span style={styles.separator} />

          {/* Edit tools */}
          {([
            ['view', 'View'],
            ['select', 'Select'],
            ['paint-tile', 'Tile'],
            ['paint-block', 'Block'],
            ['stamp-chunk', 'Chunk'],
            ['paint-collision', 'Coll'],
            ['place-object', '+Obj'],
            ['place-ring', '+Ring'],
          ] as [EditorTool, string][]).map(([t, label]) => (
            <button
              key={t}
              style={{ ...styles.smallButton, ...(tool === t ? styles.toolActive : {}) }}
              onClick={() => setTool(t)}
              title={t}
            >
              {label}
            </button>
          ))}

          <span style={styles.separator} />

          {/* Undo/Redo */}
          <button
            onClick={() => { const l = getLevel(); if (l) undo(l); }}
            style={styles.smallButton}
            disabled={!editHistory.canUndo}
            title="Undo"
          >
            Undo
          </button>
          <button
            onClick={() => { const l = getLevel(); if (l) redo(l); }}
            style={styles.smallButton}
            disabled={!editHistory.canRedo}
            title="Redo"
          >
            Redo
          </button>

          <button onClick={onSave} style={styles.smallButton} disabled={!dirty} title="Save (Ctrl+S)">
            Save
          </button>

          {dirty && <span style={{ color: '#f9e2af', fontSize: 11 }}>* unsaved</span>}

          <span style={styles.separator} />

          <button onClick={() => setZoom(zoom / 1.5)} style={styles.smallButton}>-</button>
          <span style={styles.zoomLabel}>{zoomPercent}%</span>
          <button onClick={() => setZoom(zoom * 1.5)} style={styles.smallButton}>+</button>

          <span style={styles.separator} />

          {(Object.keys(overlays) as (keyof OverlayOptions)[]).map((key) => (
            <label key={key} style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={overlays[key]}
                onChange={() => toggleOverlay(key)}
              />
              {key.replace('show', '').replace(/([A-Z])/g, ' $1').trim()}
            </label>
          ))}
        </>
      )}

      {loading && <span style={styles.loading}>Loading...</span>}

      <div style={{ flex: 1 }} />
      <span style={{ color: '#6c7086', fontSize: 12 }}>Sonic Level Editor v0.2.0</span>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', background: '#181825', borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  button: {
    padding: '4px 12px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a',
    borderRadius: 4, cursor: 'pointer', fontSize: 13,
  },
  smallButton: {
    padding: '2px 8px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a',
    borderRadius: 4, cursor: 'pointer', fontSize: 13, minWidth: 28,
  },
  toolActive: {
    background: '#89b4fa', color: '#1e1e2e', borderColor: '#89b4fa',
  },
  select: {
    padding: '4px 8px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a',
    borderRadius: 4, fontSize: 13,
  },
  separator: {
    width: 1, height: 20, background: '#45475a',
  },
  zoomLabel: {
    fontSize: 12, color: '#a6adc8', minWidth: 40, textAlign: 'center' as const,
  },
  checkLabel: {
    fontSize: 12, color: '#a6adc8', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
  },
  loading: {
    fontSize: 12, color: '#f9e2af',
  },
  dropdown: {
    position: 'absolute' as const, top: '100%', left: 0, marginTop: 4,
    background: '#313244', border: '1px solid #45475a', borderRadius: 6,
    minWidth: 320, maxHeight: 300, overflow: 'auto', zIndex: 100,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  dropdownEmpty: {
    padding: '12px 16px', color: '#6c7086', fontSize: 13,
  },
  dropdownItem: {
    display: 'flex', flexDirection: 'column' as const, width: '100%',
    padding: '8px 12px', background: 'transparent', border: 'none',
    color: '#cdd6f4', cursor: 'pointer', textAlign: 'left' as const,
    borderBottom: '1px solid #45475a',
  },
  projectName: {
    fontSize: 13, fontWeight: 500,
  },
  projectPath: {
    fontSize: 11, color: '#6c7086', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
};
