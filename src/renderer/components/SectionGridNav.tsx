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
  container: { padding: 8, borderBottom: '1px solid #2A2F3D' },
  header: { fontSize: 11, color: '#6E7589', marginBottom: 4 },
  grid: { display: 'grid', gap: 2 },
  cell: {
    padding: '4px 0', textAlign: 'center', fontSize: 10,
    background: '#2A2F3D', border: '1px solid #3A4152', borderRadius: 2,
    color: '#E8EAF2', cursor: 'pointer', position: 'relative',
  },
  bgDot: {
    position: 'absolute', top: 1, right: 1,
    width: 5, height: 5, borderRadius: '50%',
    background: '#a6e3a1',
  },
  active: { background: '#34D399', color: '#12151E', border: '1px solid #34D399' },
  null: { background: '#0A0C12', color: '#3A4152' },
  empty: { padding: 8, color: '#6E7589', fontSize: 11 },
};
