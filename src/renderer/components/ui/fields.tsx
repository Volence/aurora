// src/renderer/components/ui/fields.tsx
import React from 'react';
import { T } from './theme';

const base: React.CSSProperties = {
  background: T.raised, color: T.textHi, border: `1px solid ${T.border}`,
  borderRadius: T.rMd, fontSize: 12, padding: `${T.s2} ${T.s3}`,
};

export function Select({ value, onChange, children, title, style }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
  title?: string; style?: React.CSSProperties;
}) {
  return (
    <select title={title} value={value} onChange={(e) => onChange(e.target.value)}
            style={{ ...base, ...style }}>{children}</select>
  );
}

export function NumberField({ value, onChange, min, max, title, width = 48 }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; title?: string; width?: number;
}) {
  return (
    <input type="number" title={title} value={value} min={min} max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ...base, width }} />
  );
}
