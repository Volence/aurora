import React from 'react';
import { useProjectStore } from '../../state/projectStore';
import { useSpriteStore } from '../../state/spriteStore';
import type { SpriteTool } from '../../state/spriteStore';
import SpriteCanvas from './SpriteCanvas';
import PaletteEditor from '../art/PaletteEditor';

const TOOLS: { id: SpriteTool; label: string }[] = [
  { id: 'pencil', label: 'Pencil' },
  { id: 'fill', label: 'Fill' },
  { id: 'eraser', label: 'Eraser' },
];

/**
 * Sprite mode shell (chunk 1): tool strip + zoomable pixel canvas + the shared
 * PaletteEditor as the color picker. Frame management, the mapping inspector,
 * animation timeline, and export arrive in later chunks.
 */
export default function SpriteMode() {
  const project = useProjectStore((s) => s.project);
  const tool = useSpriteStore((s) => s.tool);
  const zoom = useSpriteStore((s) => s.zoom);

  if (!project) {
    return <div style={styles.empty}>Open a project to edit sprites.</div>;
  }

  return (
    <div style={styles.root}>
      <div style={styles.toolStrip}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => useSpriteStore.getState().setTool(t.id)}
            style={{ ...styles.toolBtn, ...(tool === t.id ? styles.toolActive : {}) }}
          >
            {t.label}
          </button>
        ))}
        <span style={styles.sep} />
        <label style={styles.zoomLabel}>Zoom {zoom}×</label>
        <input
          type="range"
          min={2}
          max={24}
          value={zoom}
          onChange={(e) => useSpriteStore.getState().setZoom(Number(e.target.value))}
        />
      </div>
      <div style={styles.body}>
        <div style={styles.canvasWrap}>
          <SpriteCanvas />
        </div>
        <div style={styles.rightPanel}>
          <PaletteEditor />
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  empty: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c7086' },
  toolStrip: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
    background: '#181825', borderBottom: '1px solid #313244',
  },
  toolBtn: {
    padding: '4px 10px', background: '#313244', color: '#cdd6f4',
    border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 12,
  },
  toolActive: { background: '#89b4fa', color: '#1e1e2e', borderColor: '#89b4fa' },
  sep: { width: 1, height: 20, background: '#45475a', margin: '0 6px' },
  zoomLabel: { fontSize: 12, color: '#a6adc8' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  canvasWrap: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'auto', background: '#11111b',
  },
  rightPanel: {
    width: 240, flexShrink: 0, background: '#1e1e2e',
    borderLeft: '1px solid #313244', overflow: 'auto',
  },
};
