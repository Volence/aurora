import React from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import type { SpriteTool, SpriteTransform } from '../../state/spriteStore';
import {
  ToolButton, ToolButtonGrid, TransformGrid, DitherConfig, MirrorButton, ZoomControl, Divider,
} from '../art-shared/ToolColumnParts';

// Glyphs match Art mode's ToolColumn for visual consistency.
const TOOLS: Array<{ id: SpriteTool; glyph: string; label: string }> = [
  { id: 'pencil', glyph: '✎', label: 'Pencil (paint pixels)' },
  { id: 'eraser', glyph: '⌧', label: 'Eraser (paint color 0)' },
  { id: 'fill', glyph: '▨', label: 'Fill (flood fill)' },
  { id: 'eyedropper', glyph: '◉', label: 'Eyedropper (pick color)' },
  { id: 'line', glyph: '╱', label: 'Line' },
  { id: 'rect', glyph: '▭', label: 'Rectangle' },
  { id: 'select', glyph: '⬚', label: 'Select (marquee + move)' },
  { id: 'dither', glyph: '░', label: 'Dither brush' },
];

const TRANSFORMS: Array<{ action: SpriteTransform; glyph: string; label: string }> = [
  { action: 'flip-h', glyph: '⇋', label: 'Flip horizontal' },
  { action: 'flip-v', glyph: '⇵', label: 'Flip vertical' },
  { action: 'rotate-90', glyph: '⟳', label: 'Rotate 90° (square frames only)' },
];

export default function SpriteToolColumn() {
  const tool = useSpriteStore((s) => s.tool);
  const mirror = useSpriteStore((s) => s.mirror);
  const pixelPerfect = useSpriteStore((s) => s.pixelPerfect);
  const ditherPattern = useSpriteStore((s) => s.ditherPattern);
  const ditherSecondary = useSpriteStore((s) => s.ditherSecondary);
  const zoom = useSpriteStore((s) => s.zoom);
  const frames = useSpriteStore((s) => s.frames);
  const currentIndex = useSpriteStore((s) => s.currentIndex);

  const cur = frames[currentIndex];
  const square = cur.width === cur.height;
  const st = useSpriteStore.getState();

  return (
    <div style={styles.column}>
      <ToolButtonGrid items={TOOLS} activeId={tool} onSelect={(id) => st.setTool(id)} />

      {/* Pencil/line/rect honor pixel-perfect; show the toggle for those */}
      {(tool === 'pencil' || tool === 'line' || tool === 'rect') && (
        <ToolButton
          glyph="PP" small active={pixelPerfect}
          title="Pixel-perfect strokes (no doubled corner pixels)"
          onClick={() => st.setPixelPerfect(!pixelPerfect)}
        />
      )}

      {tool === 'dither' && (
        <DitherConfig
          pattern={ditherPattern} secondary={ditherSecondary}
          onPattern={(p) => st.setDither(p, ditherSecondary)}
          onSecondary={(v) => st.setDither(ditherPattern, v)}
        />
      )}

      <Divider />
      <MirrorButton mirror={mirror} onChange={(m) => st.setMirror(m)} />

      <Divider />
      <ZoomControl zoom={zoom} onZoomIn={() => st.setZoom(zoom + 2)} onZoomOut={() => st.setZoom(zoom - 2)} />

      <Divider />
      <TransformGrid
        items={TRANSFORMS.map((t) => ({ ...t, disabled: t.action === 'rotate-90' && !square }))}
        onAction={(a) => st.applyTransform(a)}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  column: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 4px',
    overflowY: 'auto', background: '#1e1e2e', borderRight: '1px solid #313244', width: 50, flexShrink: 0,
  },
};
