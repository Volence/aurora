// src/renderer/components/ui/primitives.tsx
import React from 'react';
import { T } from './theme';

/**
 * THE HEIGHT CAP FOR A LIST OR GRID INSIDE A CollapsibleSection, in px.
 *
 * A right-hand column is a scrolling stack of titled sections, and a section
 * whose content grows with the DATA silently buries every section under it: the
 * classic Art column mounts an 82-chunk grid (~900px of thumbnails in a 260px
 * column) above its palette editor, and the palette editor was reported as not
 * existing. Nobody scrolls past nine screens of chunks to find out.
 *
 * So a panel whose item count is data-driven scrolls INSIDE its section instead
 * of growing it. Then the column's own scroll only has to travel a few hundred
 * px per section and every section HEADER is reachable without reading a grid.
 *
 * A fixed number rather than a fraction of the viewport, deliberately. The
 * competing option was a `vh` share, which sounds adaptive and is not: these
 * sections are 1-of-3 in a column whose height nobody knows at style time, so a
 * share that fits three sections leaves one section looking arbitrarily
 * truncated when it is the only one expanded — and the collapse state that
 * decides which is which lives in localStorage. 260 is five rows of the chunk
 * grid's default 48px cell, or roughly eight object rows: enough to browse in,
 * short enough that the next header is on screen with it.
 */
export const SECTION_LIST_MAX_HEIGHT = 260;

export function Panel({ children, width, scroll = false, style }: {
  children: React.ReactNode; width?: number; scroll?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', background: T.void,
      borderLeft: `1px solid ${T.border}`, flexShrink: 0,
      ...(width ? { width } : {}), ...(scroll ? { overflow: 'auto' } : {}), ...style,
    }}>{children}</div>
  );
}

export function PanelHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `${T.s2} ${T.s4}`, fontSize: 10, fontWeight: 600, color: T.textLo,
      textTransform: 'uppercase', letterSpacing: 1, borderBottom: `1px solid ${T.border}`,
    }}>
      <span>{children}</span>{right}
    </div>
  );
}

export function ToolButton({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void;
}) {
  return (
    <button title={label} aria-label={label} onClick={onClick} style={{
      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: active ? T.accent : 'transparent', color: active ? T.onAccent : T.textLo,
      border: 'none', borderRadius: T.rMd, cursor: 'pointer',
    }}>{icon}</button>
  );
}

export function IconButton({ icon, label, onClick, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button title={label} aria-label={label} disabled={disabled} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: T.s2,
      padding: `${T.s2} ${T.s3}`, background: T.overlay, color: T.textBase,
      border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1, fontSize: 11,
    }}>{icon}</button>
  );
}

export function Chip({ children, active, onClick, disabled, title }: {
  children: React.ReactNode; active?: boolean; onClick?: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <span title={title} onClick={disabled ? undefined : onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: T.s2, padding: `${T.s1} ${T.s3}`,
      background: active ? T.accent : T.raised, color: active ? T.onAccent : T.textBase,
      border: `1px solid ${active ? T.accent : T.border}`, borderRadius: T.rMd,
      fontSize: 11, cursor: disabled ? 'default' : (onClick ? 'pointer' : 'default'),
      opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

export function Divider() {
  return <span style={{ width: 1, height: 16, background: T.borderStrong, flexShrink: 0 }} />;
}

export function OptionBar({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: T.s4, height: 32, padding: `0 ${T.s4}`,
      background: T.surface, borderBottom: `1px solid ${T.border}`, color: T.textLo,
      fontSize: 11, flexShrink: 0,
    }}>{children}</div>
  );
}

export function StatusBar({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <footer style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 24,
      padding: `0 ${T.s4}`, background: T.void, borderTop: `1px solid ${T.border}`,
      color: T.textLo, fontFamily: T.fontMono, fontSize: 11, flexShrink: 0,
    }}>
      <span>{left}</span><span>{right}</span>
    </footer>
  );
}
