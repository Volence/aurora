import React from 'react';
import { useEditorStore } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentAct } from '../state/projectStore';
import { SECTION_PIXEL_SIZE } from '../../core/model/s4-types';

export default function SectionGridNav() {
  const activeSectionIndex = useEditorStore(s => s.activeSectionIndex);
  // historyVersion: re-render badges when set-section-bg executes/undoes.
  useEditorStore(s => s.historyVersion);
  const project = useProjectStore(s => s.project);
  const state = useProjectStore.getState();
  const act = getCurrentAct(state);

  if (!act) return <div style={styles.empty}>No act loaded</div>;

  const { gridWidth, gridHeight, sections } = act;

  const handleSectionClick = (index: number) => {
    useEditorStore.getState().setActiveSectionIndex(index);
    const col = index % gridWidth;
    const row = Math.floor(index / gridWidth);
    useViewStore.getState().setPosition(
      col * SECTION_PIXEL_SIZE,
      row * SECTION_PIXEL_SIZE,
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>Sections ({gridWidth}x{gridHeight})</div>
      <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${gridWidth}, 1fr)` }}>
        {sections.map((sec, i) => {
          // Corner dot marks sections assigned a BG-library background
          // (bgLayoutRef != null); tooltip names it.
          const bgName = sec?.bgLayoutRef
            ? project?.bgLibrary.find(b => b.id === sec.bgLayoutRef)?.name ?? sec.bgLayoutRef
            : null;
          return (
            <button
              key={i}
              style={{
                ...styles.cell,
                ...(i === activeSectionIndex ? styles.active : {}),
                ...(sec === null ? styles.null : {}),
              }}
              title={bgName ? `BG: ${bgName}` : undefined}
              onClick={() => handleSectionClick(i)}
            >
              {sec ? i : '—'}
              {bgName && <span style={styles.bgDot} />}
            </button>
          );
        })}
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
    color: '#cdd6f4', cursor: 'pointer', position: 'relative',
  },
  bgDot: {
    position: 'absolute', top: 1, right: 1,
    width: 5, height: 5, borderRadius: '50%',
    background: '#a6e3a1',
  },
  active: { background: '#89b4fa', color: '#1e1e2e', border: '1px solid #89b4fa' },
  null: { background: '#11111b', color: '#45475a' },
  empty: { padding: 8, color: '#6c7086', fontSize: 11 },
};
