import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useProjectStore, getActiveLevel } from '../state/projectStore';
import { useViewStore, type OverlayOptions } from '../state/viewStore';
import { useEditorStore, editHistory, undo, redo, type EditorTool, type EditingLayer, type AppMode } from '../state/editorStore';
import type { S4Level } from '../../core/editing/commands';
import type { RecentProject } from '../../shared/ipc-types';

// Display-name overrides for overlay toggles whose store keys use engine-
// internal naming. showBlockGrid draws 128px lines — that's the editor's
// "chunk" unit (the s4_engine internally calls 128×128 a "block");
// showChunkGrid draws the 2048px section boundaries. Code identifiers are
// intentionally NOT renamed.
const OVERLAY_LABELS: Record<string, string> = {
  showBlockGrid: 'Chunk Grid (128px)',
  showChunkGrid: 'Section Grid (2048px)',
};

interface ToolbarProps {
  onOpenProject: () => void;
  onOpenRecent: (path: string) => void;
  onSave: () => Promise<void> | void;
}

export default function Toolbar({ onOpenProject, onOpenRecent, onSave }: ToolbarProps) {
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
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const historyVersion = useEditorStore((s) => s.historyVersion);
  const appMode = useEditorStore((s) => s.appMode);
  const setAppMode = useEditorStore((s) => s.setAppMode);

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

  const zoomPercent = Math.round(zoom * 100);

  const handleSelectZoneAct = useCallback((value: string) => {
    const [zoneId, actId] = value.split(':');
    if (zoneId && actId) {
      useProjectStore.getState().setCurrentAct(zoneId, actId);
    }
  }, []);

  function getLevel(): S4Level | null {
    return getActiveLevel(useProjectStore.getState());
  }

  return (
    <header style={styles.toolbar}>
      {/* Row 1: Project, zone selector, layer, and tools */}
      <div style={styles.toolbarRow}>
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

        {config && (
          <>
            <select
              value={currentZoneId && currentActId ? `${currentZoneId}:${currentActId}` : ''}
              onChange={(e) => handleSelectZoneAct(e.target.value)}
              style={styles.select}
              disabled={loading}
            >
              <option value="" disabled>Zone/Act</option>
              {config.zones.map((zone) =>
                zone.acts.map((act) => (
                  <option key={`${zone.id}:${act.id}`} value={`${zone.id}:${act.id}`}>
                    {zone.name} - {act.id}
                  </option>
                ))
              )}
            </select>

            <span style={styles.separator} />

            {(['map', 'art'] as AppMode[]).map((mode) => (
              <button
                key={mode}
                style={{
                  ...styles.smallButton,
                  ...(appMode === mode ? styles.toolActive : {}),
                }}
                onClick={() => setAppMode(mode)}
                title={mode === 'map' ? 'Map editor' : 'Art editor'}
              >
                {mode === 'map' ? 'Map' : 'Art'}
              </button>
            ))}

            <span style={styles.separator} />

            {appMode === 'map' && (['fg', 'bg'] as EditingLayer[]).map((layer) => (
              <button
                key={layer}
                style={{
                  ...styles.smallButton,
                  ...(editingLayer === layer ? styles.toolActive : {}),
                }}
                onClick={() => useEditorStore.getState().setEditingLayer(layer)}
                title={layer === 'fg' ? 'Foreground layer' : 'Background layer'}
              >
                {layer.toUpperCase()}
              </button>
            ))}

            {appMode === 'map' && <span style={styles.separator} />}

            {appMode === 'map' && (
              <div style={styles.buttonGroup}>
                {([
                  ['view', 'View'],
                  ['select', 'Sel'],
                  ['paint-tile', 'Tile'],
                  ['paint-block', 'Blk'],
                  ['stamp-chunk', 'Chk'],
                  ['paint-collision', 'Col'],
                  ['place-object', '+Obj'],
                  ['place-ring', '+Rng'],
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
              </div>
            )}

            {/* The separator after the Map|Art toggle already precedes this
                group in Art mode — only add another when the map tool groups
                (and their trailing content) render between them. */}
            {appMode === 'map' && <span style={styles.separator} />}

            <div style={styles.buttonGroup}>
              <button
                onClick={() => { const l = getLevel(); if (l) undo(l); }}
                style={styles.smallButton}
                disabled={!editHistory.canUndo}
                title="Undo (Ctrl+Z)"
              >
                Undo
              </button>
              <button
                onClick={() => { const l = getLevel(); if (l) redo(l); }}
                style={styles.smallButton}
                disabled={!editHistory.canRedo}
                title="Redo (Ctrl+Y)"
              >
                Redo
              </button>
              <button
                onClick={async () => {
                  await onSave();
                  setSaveFlash(true);
                  setTimeout(() => setSaveFlash(false), 1500);
                }}
                style={{
                  ...styles.smallButton,
                  ...(saveFlash ? styles.saveFlash : {}),
                }}
                disabled={!dirty && !saveFlash}
                title="Save (Ctrl+S)"
              >
                {saveFlash ? 'Saved!' : 'Save'}
              </button>
            </div>

            {dirty && <span style={styles.dirtyBadge}>unsaved</span>}
          </>
        )}

        {loading && <span style={styles.loading}>Loading...</span>}
      </div>

      {/* Row 2: Zoom and overlay toggles */}
      {config && (
        <div style={styles.toolbarRow}>
          <div style={styles.buttonGroup}>
            <button onClick={() => setZoom(zoom / 1.5)} style={styles.smallButton} title="Zoom out">-</button>
            <span style={styles.zoomLabel}>{zoomPercent}%</span>
            <button onClick={() => setZoom(zoom * 1.5)} style={styles.smallButton} title="Zoom in">+</button>
          </div>

          <span style={styles.separator} />

          {(Object.keys(overlays) as (keyof OverlayOptions)[]).map((key) => (
            <label key={key} style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={overlays[key]}
                onChange={() => toggleOverlay(key)}
                style={{ width: 12, height: 12 }}
              />
              {OVERLAY_LABELS[key] ?? key.replace('show', '').replace(/([A-Z])/g, ' $1').trim()}
            </label>
          ))}

          <div style={{ flex: 1 }} />
          <span style={{ color: '#6c7086', fontSize: 10 }}>v0.3.0</span>
        </div>
      )}
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex', flexDirection: 'column' as const,
    background: '#181825', borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  toolbarRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 8px', flexWrap: 'wrap' as const,
  },
  buttonGroup: {
    display: 'flex', alignItems: 'center', gap: 2,
  },
  button: {
    padding: '2px 8px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a',
    borderRadius: 4, cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap' as const,
  },
  smallButton: {
    padding: '1px 5px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a',
    borderRadius: 3, cursor: 'pointer', fontSize: 11, minWidth: 22,
  },
  toolActive: {
    background: '#89b4fa', color: '#1e1e2e', borderColor: '#89b4fa',
  },
  saveFlash: {
    background: '#a6e3a1', color: '#1e1e2e', borderColor: '#a6e3a1',
  },
  dirtyBadge: {
    fontSize: 9, color: '#1e1e2e', background: '#f9e2af',
    padding: '0 4px', borderRadius: 3, lineHeight: '14px', fontWeight: 600,
  },
  select: {
    padding: '2px 4px', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a',
    borderRadius: 4, fontSize: 11, maxWidth: 180,
  },
  separator: {
    width: 1, height: 16, background: '#45475a', flexShrink: 0,
  },
  zoomLabel: {
    fontSize: 11, color: '#a6adc8', minWidth: 32, textAlign: 'center' as const,
  },
  checkLabel: {
    fontSize: 11, color: '#a6adc8', display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  loading: {
    fontSize: 11, color: '#f9e2af',
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
