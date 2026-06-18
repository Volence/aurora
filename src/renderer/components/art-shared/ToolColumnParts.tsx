import React from 'react';
import type { DitherPattern, MirrorMode } from '../../../core/art/pixel-ops';

/**
 * Shared presentational building blocks for the level-art and sprite-art tool
 * columns. Pure UI — each takes its current value + callbacks and owns no store.
 * Keeps the two columns visually identical and means a tweak here lands in both.
 */

export const MIRROR_CYCLE: Array<MirrorMode | null> = [null, 'h', 'v', 'both'];
const MIRROR_LABEL: Record<string, string> = { off: 'M:–', h: 'M:H', v: 'M:V', both: 'M:HV' };

export const DITHER_PATTERNS: Array<{ id: DitherPattern; label: string; title: string }> = [
  { id: 'checker', label: '▚', title: 'Checker (50%)' },
  { id: 'sparse25', label: '25', title: 'Sparse 25%' },
  { id: 'sparse75', label: '75', title: 'Sparse 75%' },
];

/** A single tool/transform button (glyph, optional active/disabled/small text). */
export function ToolButton({
  glyph, title, active, disabled, small, onClick,
}: {
  glyph: React.ReactNode; title: string;
  active?: boolean; disabled?: boolean; small?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      style={{ ...S.toolButton, ...(small ? S.smallText : {}), ...(active ? S.toolActive : {}), ...(disabled ? S.disabled : {}) }}
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {glyph}
    </button>
  );
}

/** A column of selectable tool buttons; the one matching `activeId` is highlighted. */
export function ToolButtonGrid<T extends string>({
  items, activeId, onSelect,
}: {
  items: Array<{ id: T; glyph: string; label: string }>;
  activeId: T;
  onSelect: (id: T) => void;
}) {
  return (
    <>
      {items.map((t) => (
        <ToolButton key={t.id} glyph={t.glyph} title={t.label} active={activeId === t.id} onClick={() => onSelect(t.id)} />
      ))}
    </>
  );
}

/** A column of action buttons (transforms); each may be individually disabled. */
export function TransformGrid<T extends string>({
  items, onAction,
}: {
  items: Array<{ action: T; glyph: string; label: string; disabled?: boolean }>;
  onAction: (action: T) => void;
}) {
  return (
    <>
      {items.map((t) => (
        <ToolButton key={t.action} glyph={t.glyph} title={t.label} disabled={t.disabled} onClick={() => onAction(t.action)} />
      ))}
    </>
  );
}

/** ◀ value ▶ wrap-around stepper (used by dither-secondary + collision-type). */
export function Stepper({
  value, title, onPrev, onNext,
}: {
  value: React.ReactNode; title: string; onPrev: () => void; onNext: () => void;
}) {
  return (
    <div style={S.stepper} title={title}>
      <button style={S.stepButton} onClick={onPrev}>◀</button>
      <span style={S.value}>{value}</span>
      <button style={S.stepButton} onClick={onNext}>▶</button>
    </div>
  );
}

/** Dither pattern picker + secondary-color stepper (0 = transparent). */
export function DitherConfig({
  pattern, secondary, onPattern, onSecondary,
}: {
  pattern: DitherPattern; secondary: number;
  onPattern: (p: DitherPattern) => void; onSecondary: (v: number) => void;
}) {
  return (
    <div style={S.config}>
      {DITHER_PATTERNS.map((p) => (
        <button
          key={p.id}
          style={{ ...S.ditherButton, ...(pattern === p.id ? S.toolActive : {}) }}
          title={`Dither pattern: ${p.title}`}
          onClick={() => onPattern(p.id)}
        >
          {p.label}
        </button>
      ))}
      <Stepper
        title="Secondary dither color (0 = transparent)"
        value={secondary}
        onPrev={() => onSecondary((secondary + 15) % 16)}
        onNext={() => onSecondary((secondary + 1) % 16)}
      />
    </div>
  );
}

/** Mirror-mode toggle button (cycles off → H → V → both). */
export function MirrorButton({ mirror, onChange }: { mirror: MirrorMode | null; onChange: (m: MirrorMode | null) => void }) {
  const key = mirror ?? 'off';
  return (
    <ToolButton
      glyph={MIRROR_LABEL[key]}
      title={`Mirror mode: ${key} (cycle off/H/V/both)`}
      active={!!mirror}
      small
      onClick={() => onChange(MIRROR_CYCLE[(MIRROR_CYCLE.indexOf(mirror) + 1) % MIRROR_CYCLE.length])}
    />
  );
}

/** Zoom in/out buttons with a current-zoom label. Callers own the step math. */
export function ZoomControl({ zoom, onZoomIn, onZoomOut }: { zoom: number; onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <>
      <ToolButton glyph="+" title="Zoom in" onClick={onZoomIn} />
      <div style={S.zoomLabel}>{zoom}×</div>
      <ToolButton glyph="−" title="Zoom out" onClick={onZoomOut} />
    </>
  );
}

export function Divider() {
  return <div style={S.divider} />;
}

/** Shared styles for the tool-column parts (each column keeps its own `column`). */
export const S: Record<string, React.CSSProperties> = {
  toolButton: {
    width: 40, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#2A2F3D', color: '#E8EAF2', border: '1px solid #3A4152', borderRadius: 4,
    cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0,
  },
  toolActive: { background: '#34D399', color: '#12151E', borderColor: '#34D399' },
  smallText: { fontSize: 10, fontWeight: 600 },
  disabled: { opacity: 0.35, cursor: 'default' },
  config: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%' },
  ditherButton: {
    width: 40, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#2A2F3D', color: '#E8EAF2', border: '1px solid #3A4152', borderRadius: 4,
    cursor: 'pointer', fontSize: 10, lineHeight: 1, flexShrink: 0,
  },
  stepper: { display: 'flex', alignItems: 'center', gap: 2, width: 40, justifyContent: 'space-between' },
  stepButton: {
    width: 12, height: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#2A2F3D', color: '#B8BECE', border: '1px solid #3A4152', borderRadius: 3,
    cursor: 'pointer', fontSize: 7, lineHeight: 1,
  },
  value: { fontSize: 10, color: '#E8EAF2', fontFamily: 'monospace' },
  divider: { width: '80%', height: 1, background: '#2A2F3D', margin: '4px 0', flexShrink: 0 },
  zoomLabel: { fontSize: 10, color: '#6E7589', fontFamily: 'monospace' },
};
