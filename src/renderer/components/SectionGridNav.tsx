import React from 'react';
import { useEditorStore } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentAct } from '../state/projectStore';
import { SECTION_PIXEL_SIZE, MAX_ACT_SECTIONS } from '../../core/model/s4-types';
import { T } from './ui';

export default function SectionGridNav() {
  const activeSectionIndex = useEditorStore(s => s.activeSectionIndex);
  // historyVersion: re-render badges when set-section-bg executes/undoes.
  useEditorStore(s => s.historyVersion);
  const project = useProjectStore(s => s.project);
  const state = useProjectStore.getState();
  const act = getCurrentAct(state);

  if (!act) return <div style={styles.empty}>No act loaded</div>;

  const { gridWidth, gridHeight, sections } = act;

  // Single click selects (highlights) without moving the camera — double-click
  // frames the section in the viewport. (Auto-jump-on-select was disorienting.)
  const selectSection = (index: number) => {
    useEditorStore.getState().setActiveSectionIndex(index);
  };
  const jumpToSection = (index: number) => {
    const col = index % gridWidth;
    const row = Math.floor(index / gridWidth);
    useViewStore.getState().setPosition(col * SECTION_PIXEL_SIZE, row * SECTION_PIXEL_SIZE);
  };
  const createSectionAt = (index?: number) => {
    const newIndex = useProjectStore.getState().addSection(index);
    if (newIndex !== null) {
      useEditorStore.getState().setActiveSectionIndex(newIndex);
      useEditorStore.getState().markDirty();
    }
  };
  const removeSectionAt = (index: number) => {
    if (!window.confirm(`Remove section ${index}? Its tiles, objects and rings are lost (no undo yet).`)) return;
    if (useProjectStore.getState().removeSection(index)) {
      useEditorStore.getState().markDirty();
    }
  };
  // Resize the grid; preserve the active section's grid position across the
  // re-indexing that a width change causes.
  const resizeGridTo = (w: number, h: number) => {
    const oldW = gridWidth;
    const active = useEditorStore.getState().activeSectionIndex;
    if (useProjectStore.getState().resizeGrid(w, h)) {
      const col = active % oldW, row = Math.floor(active / oldW);
      useEditorStore.getState().setActiveSectionIndex(col < w && row < h ? row * w + col : 0);
      useEditorStore.getState().markDirty();
    }
  };

  const lastColEmpty = Array.from({ length: gridHeight }, (_, r) => sections[r * gridWidth + (gridWidth - 1)]).every(s => s == null);
  const lastRowEmpty = Array.from({ length: gridWidth }, (_, c) => sections[(gridHeight - 1) * gridWidth + c]).every(s => s == null);
  const canAddCol = (gridWidth + 1) * gridHeight <= MAX_ACT_SECTIONS;
  const canAddRow = gridWidth * (gridHeight + 1) <= MAX_ACT_SECTIONS;
  const canRemoveCol = gridWidth > 1 && lastColEmpty;
  const canRemoveRow = gridHeight > 1 && lastRowEmpty;
  const hasEmptySlot = sections.some(s => s == null);
  const canAdd = hasEmptySlot || canAddRow;

  const stepBtn = (label: string, enabled: boolean, title: string, onClick: () => void) => (
    <button
      style={{ ...styles.sBtn, ...(enabled ? {} : styles.sBtnDisabled) }}
      disabled={!enabled} title={title} onClick={onClick}
    >{label}</button>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>Sections ({gridWidth}×{gridHeight})</div>
      <div style={{ ...styles.grid, gridTemplateColumns: `repeat(${gridWidth}, 1fr)` }}>
        {sections.map((sec, i) => {
          const isNull = sec === null;
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
                ...(isNull ? styles.null : {}),
              }}
              title={isNull
                ? 'Empty slot — click to add a section here'
                : bgName ? `BG: ${bgName} · double-click to jump · right-click to remove` : 'Double-click to jump · right-click to remove'}
              onClick={() => (isNull ? createSectionAt(i) : selectSection(i))}
              onDoubleClick={() => { if (!isNull) jumpToSection(i); }}
              onContextMenu={(e) => { e.preventDefault(); if (!isNull) removeSectionAt(i); }}
            >
              {sec ? i : '+'}
              {bgName && <span style={styles.bgDot} />}
            </button>
          );
        })}
      </div>

      {/* Grid dimension controls — grow right (cols) and down (rows). Shrinking
          an edge is only allowed when that whole row/column is empty. */}
      <div style={styles.gridControls}>
        <span style={styles.ctrlLabel}>Cols</span>
        {stepBtn('−', canRemoveCol, canRemoveCol ? 'Remove last column' : 'Last column must be empty', () => resizeGridTo(gridWidth - 1, gridHeight))}
        <span style={styles.ctrlVal}>{gridWidth}</span>
        {stepBtn('+', canAddCol, canAddCol ? 'Add a column (right)' : `Max ${MAX_ACT_SECTIONS} sections`, () => resizeGridTo(gridWidth + 1, gridHeight))}
        <span style={styles.ctrlLabel}>Rows</span>
        {stepBtn('−', canRemoveRow, canRemoveRow ? 'Remove last row' : 'Last row must be empty', () => resizeGridTo(gridWidth, gridHeight - 1))}
        <span style={styles.ctrlVal}>{gridHeight}</span>
        {stepBtn('+', canAddRow, canAddRow ? 'Add a row (bottom)' : `Max ${MAX_ACT_SECTIONS} sections`, () => resizeGridTo(gridWidth, gridHeight + 1))}
      </div>

      <button
        style={{ ...styles.addBtn, ...(canAdd ? {} : styles.addBtnDisabled) }}
        disabled={!canAdd}
        title={canAdd ? 'Add a blank section (fills the first empty slot, or appends a row)' : `At the engine limit of ${MAX_ACT_SECTIONS} sections`}
        onClick={() => createSectionAt()}
      >
        + Add section
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8, borderBottom: `1px solid ${T.border}` },
  header: { fontSize: 11, color: T.textLo, marginBottom: 4 },
  grid: { display: 'grid', gap: 2 },
  cell: {
    padding: '4px 0', textAlign: 'center', fontSize: 10,
    background: T.border, border: `1px solid ${T.borderStrong}`, borderRadius: 2,
    color: T.textHi, cursor: 'pointer', position: 'relative',
  },
  bgDot: {
    position: 'absolute', top: 1, right: 1,
    width: 5, height: 5, borderRadius: '50%',
    background: T.success,
  },
  active: { background: T.accent, color: T.surface, border: `1px solid ${T.accent}` },
  null: { background: T.void, color: T.textLo, cursor: 'pointer' },
  gridControls: {
    display: 'flex', alignItems: 'center', gap: 3, marginTop: 6,
    fontSize: 10, color: T.textLo,
  },
  ctrlLabel: { marginLeft: 4 },
  ctrlVal: { minWidth: 12, textAlign: 'center', color: T.textBase },
  sBtn: {
    width: 16, height: 16, lineHeight: '14px', padding: 0, textAlign: 'center',
    background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`,
    borderRadius: 2, cursor: 'pointer', fontSize: 11,
  },
  sBtnDisabled: { opacity: 0.4, cursor: 'default' },
  addBtn: {
    marginTop: 6, width: '100%', padding: '4px 0', fontSize: 11,
    background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`,
    borderRadius: 3, cursor: 'pointer',
  },
  addBtnDisabled: { opacity: 0.5, cursor: 'default' },
  empty: { padding: 8, color: T.textLo, fontSize: 11 },
};
