// src/renderer/components/art/PaletteCopyMenu.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { T } from '../ui';

export interface CopyMenuItem {
  label: string;
  note?: string;        // dimmed trailing text, e.g. a usage count
  onSelect: () => void;
}

const MARGIN = 6; // keep the menu this far from the viewport edges

/**
 * A small cursor-anchored menu used by the palette copy bridge ("Copy to ▸").
 * Opens at (x, y) then clamps itself inside the viewport (so a right-click near
 * the right/bottom edge doesn't run off-screen). Closes on outside mousedown or
 * Escape. Items run their onSelect then close. Purely presentational.
 */
export default function PaletteCopyMenu({
  x, y, heading, items, onClose,
}: { x: number; y: number; heading: string; items: CopyMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // After layout, clamp so the whole menu stays on-screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxX = window.innerWidth - width - MARGIN;
    const maxY = window.innerHeight - height - MARGIN;
    const nx = Math.max(MARGIN, Math.min(x, maxX));
    const ny = Math.max(MARGIN, Math.min(y, maxY));
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // Re-clamp only when the anchor or item set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, items]);

  return (
    <div
      ref={ref}
      style={{ ...styles.menu, left: pos.x, top: pos.y }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div style={styles.heading}>{heading}</div>
      {items.length === 0 && <div style={styles.empty}>no targets</div>}
      {items.map((it) => (
        <button
          key={it.label}
          style={styles.item}
          onClick={() => { it.onSelect(); onClose(); }}
        >
          <span>{it.label}</span>
          {it.note && <span style={styles.note}>{it.note}</span>}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: 'fixed',
    zIndex: 1000,
    minWidth: 160,
    background: T.raised,
    border: `1px solid ${T.borderStrong}`,
    borderRadius: T.rMd,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    padding: 4,
    fontSize: 11,
  },
  heading: {
    padding: `${T.s1} ${T.s2}`,
    color: T.textLo,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  empty: { padding: `${T.s1} ${T.s2}`, color: T.textFaint },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: T.s3,
    width: '100%',
    padding: `${T.s1} ${T.s2}`,
    background: 'transparent',
    color: T.textBase,
    border: 'none',
    borderRadius: T.rSm,
    cursor: 'pointer',
    textAlign: 'left',
  },
  note: { color: T.textLo, fontFamily: T.fontMono },
};
