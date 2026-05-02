import React from 'react';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import type { Color } from '../../core/model/s4-types';

export default function PaletteViewer() {
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);

  const state = useProjectStore.getState();
  const zone = getCurrentZone(state);

  if (!zone) {
    return (
      <div style={styles.container}>
        <span style={styles.label}>Palette</span>
      </div>
    );
  }

  const palette = zone.palette;

  return (
    <div style={styles.container}>
      <span style={styles.label}>Palette</span>
      <div style={styles.lines}>
        {palette.lines.map((line, lineIdx) => (
          <div key={lineIdx} style={styles.line}>
            <span style={styles.lineLabel}>{lineIdx}</span>
            {line.colors.map((color, colorIdx) => (
              <div
                key={colorIdx}
                style={{
                  ...styles.swatch,
                  backgroundColor: colorToCSS(color),
                  border: color.a === 0 ? '1px dashed #45475a' : '1px solid #313244',
                }}
                title={`Line ${lineIdx}, Color ${colorIdx}: R${color.r} G${color.g} B${color.b}${color.a === 0 ? ' (transparent)' : ''}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function colorToCSS(c: Color): string {
  if (c.a === 0) return 'transparent';
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '6px 12px', background: '#181825', borderTop: '1px solid #313244',
    flexShrink: 0, overflow: 'auto',
  },
  label: {
    fontSize: 12, fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase' as const,
    letterSpacing: 1, flexShrink: 0,
  },
  lines: {
    display: 'flex', gap: 12,
  },
  line: {
    display: 'flex', alignItems: 'center', gap: 1,
  },
  lineLabel: {
    fontSize: 10, color: '#6c7086', marginRight: 4, fontFamily: 'monospace',
  },
  swatch: {
    width: 16, height: 16, borderRadius: 2, flexShrink: 0,
  },
};
