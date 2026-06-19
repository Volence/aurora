// src/renderer/components/ui/Menu.tsx
import React, { useEffect, useRef, useState } from 'react';
import { T } from './theme';

export function Menu({ label, children, align = 'left' }: {
  label: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: 'flex', alignItems: 'center', gap: T.s2, padding: `${T.s2} ${T.s3}`,
        background: open ? T.raised : T.overlay, color: T.textBase,
        border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: 'pointer', fontSize: 11,
      }}>{label}</button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', [align]: 0, marginTop: T.s2, zIndex: 100,
          minWidth: 200, padding: T.s2, background: T.overlay, border: `1px solid ${T.borderStrong}`,
          borderRadius: T.rLg, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', gap: T.s1,
        }}>{children}</div>
      )}
    </div>
  );
}
