import React from 'react';
import { useSpriteStore } from '../../state/spriteStore';
import type { SpriteTool, SpriteTransform } from '../../state/spriteStore';
import type { DitherPattern, MirrorMode } from '../../../core/art/pixel-ops';

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

const MIRROR_CYCLE: Array<MirrorMode | null> = [null, 'h', 'v', 'both'];
const MIRROR_LABEL: Record<string, string> = { off: 'M:–', h: 'M:H', v: 'M:V', both: 'M:HV' };

const DITHER_PATTERNS: Array<{ id: DitherPattern; label: string; title: string }> = [
  { id: 'checker', label: '▚', title: 'Checker (50%)' },
  { id: 'sparse25', label: '25', title: 'Sparse 25%' },
  { id: 'sparse75', label: '75', title: 'Sparse 75%' },
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
  const mirrorKey = mirror ?? 'off';

  function cycleMirror() {
    const i = MIRROR_CYCLE.indexOf(mirror);
    useSpriteStore.getState().setMirror(MIRROR_CYCLE[(i + 1) % MIRROR_CYCLE.length]);
  }

  return (
    <div style={styles.column}>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          style={{ ...styles.toolButton, ...(tool === t.id ? styles.toolActive : {}) }}
          title={t.label}
          onClick={() => useSpriteStore.getState().setTool(t.id)}
        >
          {t.glyph}
        </button>
      ))}

      {/* Pencil/line/rect honor pixel-perfect; show the toggle for those */}
      {(tool === 'pencil' || tool === 'line' || tool === 'rect') && (
        <button
          style={{ ...styles.toolButton, ...styles.smallText, ...(pixelPerfect ? styles.toolActive : {}) }}
          title="Pixel-perfect strokes (no doubled corner pixels)"
          onClick={() => useSpriteStore.getState().setPixelPerfect(!pixelPerfect)}
        >
          PP
        </button>
      )}

      {tool === 'dither' && (
        <div style={styles.config}>
          {DITHER_PATTERNS.map((p) => (
            <button
              key={p.id}
              style={{ ...styles.ditherButton, ...(ditherPattern === p.id ? styles.toolActive : {}) }}
              title={`Dither pattern: ${p.title}`}
              onClick={() => useSpriteStore.getState().setDither(p.id, ditherSecondary)}
            >
              {p.label}
            </button>
          ))}
          <div style={styles.stepper} title="Secondary dither color (0 = transparent)">
            <button style={styles.stepButton} onClick={() => useSpriteStore.getState().setDither(ditherPattern, (ditherSecondary + 15) % 16)}>◀</button>
            <span style={styles.value}>{ditherSecondary}</span>
            <button style={styles.stepButton} onClick={() => useSpriteStore.getState().setDither(ditherPattern, (ditherSecondary + 1) % 16)}>▶</button>
          </div>
        </div>
      )}

      <div style={styles.divider} />

      <button
        style={{ ...styles.toolButton, ...styles.smallText, ...(mirror ? styles.toolActive : {}) }}
        title={`Mirror mode: ${mirrorKey} (cycle off/H/V/both)`}
        onClick={cycleMirror}
      >
        {MIRROR_LABEL[mirrorKey]}
      </button>

      <div style={styles.divider} />

      <button style={styles.toolButton} title="Zoom in" onClick={() => useSpriteStore.getState().setZoom(zoom + 2)}>+</button>
      <div style={styles.zoomLabel}>{zoom}×</div>
      <button style={styles.toolButton} title="Zoom out" onClick={() => useSpriteStore.getState().setZoom(zoom - 2)}>−</button>

      <div style={styles.divider} />

      {TRANSFORMS.map((t) => {
        const disabled = t.action === 'rotate-90' && !square;
        return (
          <button
            key={t.action}
            style={{ ...styles.toolButton, ...(disabled ? styles.disabled : {}) }}
            title={t.label}
            disabled={disabled}
            onClick={() => useSpriteStore.getState().applyTransform(t.action)}
          >
            {t.glyph}
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  column: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 4px', overflowY: 'auto', background: '#1e1e2e', borderRight: '1px solid #313244', width: 50, flexShrink: 0 },
  toolButton: { width: 40, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 },
  toolActive: { background: '#89b4fa', color: '#1e1e2e', borderColor: '#89b4fa' },
  smallText: { fontSize: 10, fontWeight: 600 },
  disabled: { opacity: 0.35, cursor: 'default' },
  config: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' },
  ditherButton: { width: 40, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#313244', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 10, lineHeight: 1, flexShrink: 0 },
  stepper: { display: 'flex', alignItems: 'center', gap: 2, width: 40, justifyContent: 'space-between' },
  stepButton: { width: 12, height: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#313244', color: '#a6adc8', border: '1px solid #45475a', borderRadius: 3, cursor: 'pointer', fontSize: 7, lineHeight: 1 },
  value: { fontSize: 10, color: '#cdd6f4', fontFamily: 'monospace' },
  divider: { width: '80%', height: 1, background: '#313244', margin: '4px 0', flexShrink: 0 },
  zoomLabel: { fontSize: 10, color: '#6c7086', fontFamily: 'monospace' },
};
