import React from 'react';
import { useProjectStore, getCurrentZone } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';
import type { Color } from '../../core/model/s4-types';

export default function PaletteViewer() {
  const project = useProjectStore((s) => s.project);
  const currentZoneId = useProjectStore((s) => s.currentZoneId);
  const selectedPaletteLine = useEditorStore((s) => s.selectedPaletteLine);

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
      <span style={styles.label}>Pal Line</span>
      <div style={styles.lines}>
        {palette.lines.map((line, lineIdx) => {
          const isSelected = lineIdx === selectedPaletteLine;
          return (
            <button
              key={lineIdx}
              style={{
                ...styles.lineButton,
                ...(isSelected ? styles.lineSelected : {}),
              }}
              onClick={() => useEditorStore.getState().setSelectedPaletteLine(lineIdx)}
              title={`Select palette line ${lineIdx} for painting`}
            >
              <span style={{
                ...styles.lineLabel,
                ...(isSelected ? styles.lineLabelSelected : {}),
              }}>
                {lineIdx}
              </span>
              {line.colors.map((color, colorIdx) => (
                <div
                  key={colorIdx}
                  style={{
                    ...styles.swatch,
                    backgroundColor: colorToCSS(color),
                    border: color.a === 0
                      ? '1px dashed #3A4152'
                      : isSelected ? '1px solid #34D399' : '1px solid #2A2F3D',
                  }}
                  title={`Line ${lineIdx}, Color ${colorIdx}: R${color.r} G${color.g} B${color.b}${color.a === 0 ? ' (transparent)' : ''}`}
                />
              ))}
            </button>
          );
        })}
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
    padding: '6px 12px', background: '#0A0C12', borderTop: '1px solid #2A2F3D',
    flexShrink: 0, overflow: 'auto',
  },
  label: {
    fontSize: 11, fontWeight: 600, color: '#6E7589', textTransform: 'uppercase' as const,
    letterSpacing: 1, flexShrink: 0,
  },
  lines: {
    display: 'flex', gap: 6,
  },
  lineButton: {
    display: 'flex', alignItems: 'center', gap: 1,
    cursor: 'pointer', padding: '3px 5px', borderRadius: 4,
    border: '2px solid transparent',
    background: 'transparent',
    outline: 'none',
  },
  lineSelected: {
    border: '2px solid #34D399',
    background: 'rgba(137, 180, 250, 0.15)',
  },
  lineLabel: {
    fontSize: 10, color: '#6E7589', marginRight: 4, fontFamily: 'monospace',
  },
  lineLabelSelected: {
    color: '#34D399', fontWeight: 700,
  },
  swatch: {
    width: 14, height: 14, borderRadius: 2, flexShrink: 0,
  },
};
