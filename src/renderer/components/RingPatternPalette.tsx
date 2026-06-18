import React from 'react';
import { RING_PATTERNS } from '../state/editorStore';

interface RingPatternPaletteProps {
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function RingPatternPalette({ selectedIndex, onSelect }: RingPatternPaletteProps) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>Ring Patterns</div>
      <div style={styles.list}>
        {RING_PATTERNS.map((pattern, i) => (
          <button
            key={i}
            style={{
              ...styles.item,
              ...(i === selectedIndex ? styles.itemSelected : {}),
            }}
            onClick={() => onSelect(i)}
            title={pattern.name}
          >
            <PatternPreview pattern={pattern} selected={i === selectedIndex} />
            <span style={styles.label}>{pattern.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PatternPreview({ pattern, selected }: { pattern: typeof RING_PATTERNS[0]; selected: boolean }) {
  const size = 40;
  const offsets = pattern.offsets;

  const minX = Math.min(...offsets.map(o => o.dx));
  const maxX = Math.max(...offsets.map(o => o.dx));
  const minY = Math.min(...offsets.map(o => o.dy));
  const maxY = Math.max(...offsets.map(o => o.dy));
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((size - 10) / rangeX, (size - 10) / rangeY, 1);
  const offsetX = (size - rangeX * scale) / 2 - minX * scale;
  const offsetY = (size - rangeY * scale) / 2 - minY * scale;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {offsets.map((o, i) => (
        <circle
          key={i}
          cx={o.dx * scale + offsetX}
          cy={o.dy * scale + offsetY}
          r={Math.max(2, 3 * scale)}
          fill={selected ? '#12151E' : '#f9e2af'}
        />
      ))}
    </svg>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 180, display: 'flex', flexDirection: 'column',
    background: '#12151E', borderRight: '1px solid #2A2F3D',
    flexShrink: 0, overflow: 'hidden',
  },
  header: {
    padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#B8BECE',
    borderBottom: '1px solid #2A2F3D', textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  list: {
    flex: 1, overflow: 'auto', padding: 4,
    display: 'flex', flexDirection: 'column', gap: 2,
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '4px 8px', background: 'transparent', border: '1px solid transparent',
    color: '#E8EAF2', cursor: 'pointer', borderRadius: 4,
    textAlign: 'left' as const, width: '100%',
  },
  itemSelected: {
    background: '#34D399', color: '#12151E', borderColor: '#34D399',
  },
  label: {
    fontSize: 12,
  },
};
