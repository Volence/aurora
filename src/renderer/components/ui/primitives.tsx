// src/renderer/components/ui/primitives.tsx
import React from 'react';
import { T } from './theme';

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

export function Chip({ children, active, onClick }: {
  children: React.ReactNode; active?: boolean; onClick?: () => void;
}) {
  return (
    <span onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: T.s2, padding: `${T.s1} ${T.s3}`,
      background: active ? T.accent : T.raised, color: active ? T.onAccent : T.textBase,
      border: `1px solid ${active ? T.accent : T.border}`, borderRadius: T.rMd,
      fontSize: 11, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
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
