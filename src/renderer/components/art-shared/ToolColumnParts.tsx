import React from 'react';
import type { DitherPattern, MirrorMode } from '../../../core/art/pixel-ops';
import { T } from '../ui';

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

/**
 * A single tool/transform button (glyph, optional active/disabled/small text).
 *
 * NOT `ToolButton`, which is the 28×28 icon button in `components/ui` that the
 * tool DOCKS use. Both were called ToolButton until CanvasMode — which mounts a
 * dock and an option bar — had to import one of them under an alias to say which
 * it meant. Named for what it draws: a glyph, in a bordered box, in an option
 * bar. Guarded by art-shared/__tests__/tool-column-parts.test.ts.
 */
export function GlyphButton({
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
        <GlyphButton key={t.id} glyph={t.glyph} title={t.label} active={activeId === t.id} onClick={() => onSelect(t.id)} />
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
        <GlyphButton key={t.action} glyph={t.glyph} title={t.label} disabled={t.disabled} onClick={() => onAction(t.action)} />
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

/**
 * Dither pattern picker + secondary-color stepper (0 = transparent).
 *
 * `colorCount` is the size of the index space the stepper wraps in — 16 for
 * every tile/sprite surface (one palette line) and 64 for the origination
 * canvas, whose indices span all four lines. Defaulting to 16 keeps every
 * existing caller byte-identical; hard-coding it would have silently pinned the
 * canvas's second dither colour to line 0.
 */
export function DitherConfig({
  pattern, secondary, onPattern, onSecondary, colorCount = 16,
}: {
  pattern: DitherPattern; secondary: number;
  onPattern: (p: DitherPattern) => void; onSecondary: (v: number) => void;
  colorCount?: number;
}) {
  const wrap = Math.max(1, Math.floor(colorCount));
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
        // Floored at 1: this is a SHARED component, and `% 0` is NaN — one
        // caller passing a count it computed from an empty palette would leave
        // the stepper permanently stuck on NaN for every surface that mounts it.
        onPrev={() => onSecondary((secondary + wrap - 1) % wrap)}
        onNext={() => onSecondary((secondary + 1) % wrap)}
      />
    </div>
  );
}

/** Mirror-mode toggle button (cycles off → H → V → both). */
export function MirrorButton({ mirror, onChange }: { mirror: MirrorMode | null; onChange: (m: MirrorMode | null) => void }) {
  const key = mirror ?? 'off';
  return (
    <GlyphButton
      glyph={MIRROR_LABEL[key]}
      title={`Mirror mode: ${key} (cycle off/H/V/both)`}
      active={!!mirror}
      small
      onClick={() => onChange(MIRROR_CYCLE[(MIRROR_CYCLE.indexOf(mirror) + 1) % MIRROR_CYCLE.length])}
    />
  );
}

/**
 * Zoom out/in buttons with a current-zoom label. Callers own the step math.
 *
 * ZOOM-OUT IS THE LEFT CONTROL, because the level surfaces' MapStatusBar reads
 * `− 100% +` and this one read `+ 4× −`. Two zoom clusters one screen apart,
 * running opposite directions (UX-A5). The value grows rightwards here, as it
 * does there and in every editor the artist arrives from.
 */
export function ZoomControl({ zoom, onZoomIn, onZoomOut }: { zoom: number; onZoomIn: () => void; onZoomOut: () => void }) {
  return (
    <span style={S.zoomGroup}>
      <GlyphButton glyph="−" title="Zoom out" onClick={onZoomOut} />
      <span style={S.zoomLabel}>{zoom}×</span>
      <GlyphButton glyph="+" title="Zoom in" onClick={onZoomIn} />
    </span>
  );
}

/** Shared styles for the tool-column parts (each column keeps its own `column`). */
export const S: Record<string, React.CSSProperties> = {
  toolButton: {
    width: 40, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: T.border, color: T.textHi, borderWidth: 1, borderStyle: 'solid', borderColor: T.borderStrong, borderRadius: T.rMd,
    cursor: 'pointer', fontSize: T.tMd, lineHeight: 1, flexShrink: 0,
  },
  toolActive: { background: T.accent, color: T.surface, borderColor: T.accent },
  smallText: { fontSize: T.t2xs, fontWeight: T.wSemibold },
  disabled: { opacity: 0.35, cursor: 'default' },
  config: { display: 'inline-flex', alignItems: 'center', gap: 2 },
  ditherButton: {
    width: 40, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: T.border, color: T.textHi, borderWidth: 1, borderStyle: 'solid', borderColor: T.borderStrong, borderRadius: T.rMd,
    cursor: 'pointer', fontSize: T.t2xs, lineHeight: 1, flexShrink: 0,
  },
  stepper: { display: 'flex', alignItems: 'center', gap: 2, width: 40, justifyContent: 'space-between' },
  stepButton: {
    width: 12, height: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: T.border, color: T.textBase, border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd,
    cursor: 'pointer', fontSize: 7, lineHeight: 1,
  },
  value: { fontSize: T.t2xs, color: T.textHi, fontFamily: T.fontMono },
  zoomGroup: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  zoomLabel: { fontSize: T.t2xs, color: T.textLo, fontFamily: T.fontMono },
};
