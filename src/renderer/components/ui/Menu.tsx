// src/renderer/components/ui/Menu.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { T } from './theme';

const EDGE_MARGIN = 8; // keep the dropdown this far from the viewport edges

export function Menu({ label, children, align = 'left' }: {
  label: React.ReactNode; children: React.ReactNode; align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [shiftX, setShiftX] = useState(0);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  // Once open, nudge the panel horizontally so it never spills off-screen (the
  // View menu sits at the top-right, so a left-anchored 200px panel would clip).
  useLayoutEffect(() => {
    if (!open) { setShiftX(0); return; }
    const el = panelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = 0;
    if (r.right > window.innerWidth - EDGE_MARGIN) dx = (window.innerWidth - EDGE_MARGIN) - r.right;
    if (r.left + dx < EDGE_MARGIN) dx = EDGE_MARGIN - r.left;
    setShiftX(dx);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        display: 'flex', alignItems: 'center', gap: T.s2, padding: `${T.s2} ${T.s3}`,
        background: open ? T.raised : T.overlay, color: T.textBase,
        border: `1px solid ${T.border}`, borderRadius: T.rMd, cursor: 'pointer', fontSize: 11,
      }}>{label}</button>
      {open && (
        <div ref={panelRef} style={{
          position: 'absolute', top: '100%', [align]: 0, marginTop: T.s2, zIndex: 100,
          transform: shiftX ? `translateX(${shiftX}px)` : undefined,
          minWidth: 200, padding: T.s2, background: T.overlay, border: `1px solid ${T.borderStrong}`,
          borderRadius: T.rLg, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', gap: T.s1, whiteSpace: 'nowrap',
        }}>{children}</div>
      )}
    </div>
  );
}
