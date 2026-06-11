import React from 'react';
import { useArtStore } from '../../state/artStore';
import type { ArtTool } from '../../state/artStore';
import type { MirrorMode } from '../../../core/art/pixel-ops';

const TOOLS: Array<{ id: ArtTool; glyph: string; label: string }> = [
  { id: 'pencil', glyph: '✎', label: 'Pencil (paint pixels)' },
  { id: 'eraser', glyph: '⌧', label: 'Eraser (paint color 0)' },
  { id: 'fill', glyph: '▨', label: 'Fill (flood fill)' },
  { id: 'eyedropper', glyph: '◉', label: 'Eyedropper (pick color)' },
  { id: 'line', glyph: '╱', label: 'Line' },
  { id: 'rect', glyph: '▭', label: 'Rectangle' },
  { id: 'select', glyph: '⬚', label: 'Select (marquee)' },
  { id: 'dither', glyph: '░', label: 'Dither brush' },
  { id: 'tile-stamp', glyph: '▦', label: 'Tile stamp' },
  { id: 'collision', glyph: '◢', label: 'Collision paint' },
];

// off -> H -> V -> both -> off
const MIRROR_CYCLE: Array<MirrorMode | null> = [null, 'h', 'v', 'both'];
const MIRROR_LABEL: Record<string, string> = { off: 'M:–', h: 'M:H', v: 'M:V', both: 'M:HV' };

const TRANSFORMS: Array<{ action: string; glyph: string; label: string }> = [
  { action: 'flip-h', glyph: '⇋', label: 'Flip horizontal' },
  { action: 'flip-v', glyph: '⇵', label: 'Flip vertical' },
  { action: 'rotate-90', glyph: '⟳', label: 'Rotate 90° (square region only)' },
  { action: 'shift-up', glyph: '↑', label: 'Wrap-shift up' },
  { action: 'shift-down', glyph: '↓', label: 'Wrap-shift down' },
  { action: 'shift-left', glyph: '←', label: 'Wrap-shift left' },
  { action: 'shift-right', glyph: '→', label: 'Wrap-shift right' },
];

export default function ToolColumn() {
  const tool = useArtStore((s) => s.tool);
  const setTool = useArtStore((s) => s.setTool);
  const brushSpace = useArtStore((s) => s.brushSpace);
  const setBrushSpace = useArtStore((s) => s.setBrushSpace);
  const mirror = useArtStore((s) => s.mirror);
  const setMirror = useArtStore((s) => s.setMirror);
  const repeatPreview = useArtStore((s) => s.repeatPreview);
  const toggleRepeatPreview = useArtStore((s) => s.toggleRepeatPreview);
  const zoom = useArtStore((s) => s.zoom);
  const setZoom = useArtStore((s) => s.setZoom);
  const open = useArtStore((s) => s.open);
  const requestAction = useArtStore((s) => s.requestAction);

  function cycleMirror() {
    const cur = MIRROR_CYCLE.indexOf(mirror);
    setMirror(MIRROR_CYCLE[(cur + 1) % MIRROR_CYCLE.length]);
  }

  const mirrorKey = mirror ?? 'off';

  return (
    <div style={styles.column}>
      {/* Brush space tabs */}
      <div style={styles.tabRow}>
        <button
          style={{ ...styles.tab, ...(brushSpace === 'pixel' ? styles.tabActive : {}) }}
          title="Pixel brush space"
          onClick={() => setBrushSpace('pixel')}
        >
          px
        </button>
        <button
          style={{ ...styles.tab, ...(brushSpace === 'tile' ? styles.tabActive : {}) }}
          title="Tile brush space"
          onClick={() => setBrushSpace('tile')}
        >
          tile
        </button>
      </div>

      <div style={styles.divider} />

      {/* Tools */}
      {TOOLS.map((t) => (
        <button
          key={t.id}
          style={{ ...styles.toolButton, ...(tool === t.id ? styles.toolActive : {}) }}
          title={t.label}
          onClick={() => setTool(t.id)}
        >
          {t.glyph}
        </button>
      ))}

      <div style={styles.divider} />

      {/* Mirror cycle + repeat preview */}
      <button
        style={{ ...styles.toolButton, ...styles.smallText, ...(mirror ? styles.toolActive : {}) }}
        title={`Mirror mode: ${mirrorKey} (click to cycle off/H/V/both)`}
        onClick={cycleMirror}
      >
        {MIRROR_LABEL[mirrorKey]}
      </button>
      <button
        style={{ ...styles.toolButton, ...styles.smallText, ...(repeatPreview ? styles.toolActive : {}) }}
        title="Toggle 3×3 repeat preview"
        onClick={toggleRepeatPreview}
      >
        Rpt
      </button>

      <div style={styles.divider} />

      {/* Zoom */}
      <button style={styles.toolButton} title="Zoom in" onClick={() => setZoom(zoom * 2)}>
        +
      </button>
      <div style={styles.zoomLabel}>{zoom}×</div>
      <button style={styles.toolButton} title="Zoom out" onClick={() => setZoom(zoom / 2)}>
        −
      </button>

      <div style={styles.divider} />

      {/* Transforms (apply to selection if present, else whole doc) */}
      {TRANSFORMS.map((t) => (
        <button
          key={t.action}
          style={{ ...styles.toolButton, ...(open ? {} : styles.disabled) }}
          title={t.label}
          disabled={!open}
          onClick={() => requestAction(t.action)}
        >
          {t.glyph}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  column: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    padding: '6px 4px',
    overflowY: 'auto',
  },
  tabRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    width: '100%',
  },
  tab: {
    width: '100%',
    padding: '3px 0',
    background: '#313244',
    color: '#a6adc8',
    border: '1px solid #45475a',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 10,
  },
  tabActive: {
    background: '#89b4fa',
    color: '#1e1e2e',
    borderColor: '#89b4fa',
    fontWeight: 600,
  },
  toolButton: {
    width: 40,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1,
    flexShrink: 0,
  },
  toolActive: {
    background: '#89b4fa',
    color: '#1e1e2e',
    borderColor: '#89b4fa',
  },
  smallText: {
    fontSize: 10,
    fontWeight: 600,
  },
  disabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  divider: {
    width: '80%',
    height: 1,
    background: '#313244',
    margin: '4px 0',
    flexShrink: 0,
  },
  zoomLabel: {
    fontSize: 10,
    color: '#6c7086',
    fontFamily: 'monospace',
  },
};
