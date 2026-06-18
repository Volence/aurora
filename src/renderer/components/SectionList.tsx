import React from 'react';
import { useProjectStore, getCurrentAct } from '../state/projectStore';
import { useEditorStore } from '../state/editorStore';

// Legacy SectionList - replaced by SectionGridNav in the main layout.
// Kept for compatibility but uses new S4 types.
export default function SectionList() {
  const project = useProjectStore((s) => s.project);
  const state = useProjectStore.getState();
  const act = getCurrentAct(state);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);

  if (!act) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>Sections</div>
        <div style={styles.empty}>No act loaded</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>Sections</div>
      <div style={styles.list}>
        {act.sections.map((section, i) => (
          <button
            key={i}
            style={{
              ...styles.item,
              ...(i === activeSectionIndex ? styles.active : {}),
            }}
            onClick={() => useEditorStore.getState().setActiveSectionIndex(i)}
          >
            <span style={styles.index}>{i.toString().padStart(2, '0')}</span>
            <span style={styles.name}>{section ? section.name : '(empty)'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 200, display: 'flex', flexDirection: 'column',
    background: '#12151E', borderRight: '1px solid #2A2F3D',
    flexShrink: 0,
  },
  header: {
    padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#B8BECE',
    borderBottom: '1px solid #2A2F3D', textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  list: {
    flex: 1, overflow: 'auto', padding: 4,
  },
  item: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '6px 8px', background: 'transparent', border: 'none',
    color: '#E8EAF2', cursor: 'pointer', borderRadius: 4, fontSize: 13,
    textAlign: 'left' as const,
  },
  active: {
    background: '#2A2F3D', outline: '1px solid #34D399',
  },
  index: {
    color: '#34D399', fontFamily: 'monospace', fontSize: 12,
  },
  name: {
    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  empty: {
    padding: 12, color: '#6E7589', fontSize: 12,
  },
};
