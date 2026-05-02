import React from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentAct } from '../state/projectStore';

export default function SectionGridNav() {
  const activeSectionIndex = useEditorStore(s => s.activeSectionIndex);
  const project = useProjectStore(s => s.project);
  const state = useProjectStore.getState();
  const act = getCurrentAct(state);

  if (!act) return <div style={styles.empty}>No act loaded</div>;

  const { gridWidth, gridHeight, sections } = act;

  return (
    <div style={styles.container}>
      <div style={styles.header}>Sections ({gridWidth}x{gridHeight})</div>
      <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${gridWidth}, 1fr)` }}>
        {sections.map((sec, i) => (
          <button
            key={i}
            style={{
              ...styles.cell,
              ...(i === activeSectionIndex ? styles.active : {}),
              ...(sec === null ? styles.null : {}),
            }}
            onClick={() => useEditorStore.getState().setActiveSectionIndex(i)}
          >
            {sec ? i : '—'}
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8, borderBottom: '1px solid #313244' },
  header: { fontSize: 11, color: '#6c7086', marginBottom: 4 },
  grid: { display: 'grid', gap: 2 },
  cell: {
    padding: '4px 0', textAlign: 'center', fontSize: 10,
    background: '#313244', border: '1px solid #45475a', borderRadius: 2,
    color: '#cdd6f4', cursor: 'pointer',
  },
  active: { background: '#89b4fa', color: '#1e1e2e', border: '1px solid #89b4fa' },
  null: { background: '#11111b', color: '#45475a' },
  empty: { padding: 8, color: '#6c7086', fontSize: 11 },
};
