// src/renderer/components/art/PaletteCopyMenu.tsx
import React, { useEffect } from 'react';
import { T } from '../ui';

export interface CopyMenuItem {
  label: string;
  note?: string;        // dimmed trailing text, e.g. a usage count
  onSelect: () => void;
}

/**
 * A small cursor-anchored menu used by the palette copy bridge ("Copy to ▸").
 * Positioned at fixed (x, y); closes on outside mousedown or Escape. Items run
 * their onSelect then close. Purely presentational — the caller builds the items.
 */
export default function PaletteCopyMenu({
  x, y, heading, items, onClose,
}: { x: number; y: number; heading: string; items: CopyMenuItem[]; onClose: () => void }) {
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

  return (
    <div
      style={{ ...styles.menu, left: x, top: y }}
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
