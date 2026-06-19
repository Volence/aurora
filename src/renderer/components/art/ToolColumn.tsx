import React from 'react';
import { useArtStore } from '../../state/artStore';
import { useEditorStore } from '../../state/editorStore';
import type { ArtTool } from '../../state/artStore';
import {
  ToolButton, ToolButtonGrid, TransformGrid, DitherConfig, MirrorButton, ZoomControl, Stepper, Divider,
} from '../art-shared/ToolColumnParts';

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

const TRANSFORMS: Array<{ action: string; glyph: string; label: string }> = [
  { action: 'flip-h', glyph: '⇋', label: 'Flip horizontal' },
  { action: 'flip-v', glyph: '⇵', label: 'Flip vertical' },
  { action: 'rotate-90', glyph: '⟳', label: 'Rotate 90° (square docs/selections only)' },
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
  const ditherPattern = useArtStore((s) => s.ditherPattern);
  const ditherSecondary = useArtStore((s) => s.ditherSecondary);
  const setDither = useArtStore((s) => s.setDither);
  const pixelPerfect = useArtStore((s) => s.pixelPerfect);
  const setPixelPerfect = useArtStore((s) => s.setPixelPerfect);
  // Shared with Map mode's paint-collision tool. Map mode has no bounded
  // picker, so clamp here: collision types are nibble-sized (0-15) in the
  // editor's collision grids (per s4-strips).
  const selectedCollisionType = useEditorStore((s) => s.selectedCollisionType);
  const setSelectedCollisionType = useEditorStore((s) => s.setSelectedCollisionType);

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

      <Divider />

      <ToolButtonGrid items={TOOLS} activeId={tool} onSelect={setTool} />

      {/* Dither config: pattern + secondary color (0 = transparent) */}
      {tool === 'dither' && (
        <DitherConfig
          pattern={ditherPattern} secondary={ditherSecondary}
          onPattern={(p) => setDither(p, ditherSecondary)}
          onSecondary={(v) => setDither(ditherPattern, v)}
        />
      )}

      {/* Collision config: type stepper (wraps 0-15, nibble-sized) */}
      {tool === 'collision' && (
        <div style={styles.config}>
          <Stepper
            title="Collision type to paint (0 = none)"
            value={selectedCollisionType & 0xF}
            onPrev={() => setSelectedCollisionType((selectedCollisionType + 15) % 16)}
            onNext={() => setSelectedCollisionType((selectedCollisionType + 1) % 16)}
          />
        </div>
      )}

      <Divider />

      {/* Mirror cycle + repeat preview */}
      <MirrorButton mirror={mirror} onChange={setMirror} />
      <ToolButton glyph="Rpt" small active={repeatPreview} title="Toggle 3×3 repeat preview" onClick={toggleRepeatPreview} />

      {/* Pixel-perfect mode (pencil / line only) */}
      {(tool === 'pencil' || tool === 'line') && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
          <input type="checkbox" checked={pixelPerfect} onChange={(e) => setPixelPerfect(e.target.checked)} />
          Pixel-perfect
        </label>
      )}

      <Divider />

      <ZoomControl zoom={zoom} onZoomIn={() => setZoom(zoom * 2)} onZoomOut={() => setZoom(zoom / 2)} />

      <Divider />

      {/* Transforms (apply to selection if present, else whole doc). Rotate is
          disabled for non-square docs; selection squareness is still guarded
          canvas-side (non-square selections silently skip). */}
      <TransformGrid
        items={TRANSFORMS.map((t) => ({
          ...t,
          disabled: !open || (t.action === 'rotate-90' && open.doc.widthTiles !== open.doc.heightTiles),
        }))}
        onAction={requestAction}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  column: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 2, padding: '6px 4px', overflowY: 'auto',
  },
  tabRow: { display: 'flex', flexDirection: 'column', gap: 2, width: '100%' },
  tab: {
    width: '100%', padding: '3px 0', background: '#2A2F3D', color: '#B8BECE',
    border: '1px solid #3A4152', borderRadius: 4, cursor: 'pointer', fontSize: 10,
  },
  tabActive: { background: '#34D399', color: '#12151E', borderColor: '#34D399', fontWeight: 600 },
  config: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' },
};
