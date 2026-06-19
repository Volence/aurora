import React, { useEffect, useRef, useState } from 'react';
import { useEditorStore, executeCommand } from '../state/editorStore';
import { useViewStore } from '../state/viewStore';
import { useProjectStore, getCurrentAct, getActiveLevel } from '../state/projectStore';
import { SECTION_PIXEL_SIZE, MAX_ACT_SECTIONS } from '../../core/model/s4-types';
import type { Section } from '../../core/model/s4-types';
import * as ops from '../../core/editing/section-ops';
import { T } from './ui';

// Module-level clipboard: a deep-cloned section survives re-renders and lets
// the user paste into any slot (even after switching the active section).
let sectionClipboard: Section | null = null;

interface MenuState {
  index: number;
  sec: Section | null;
  x: number;
  y: number;
}

export default function SectionGridNav() {
  const activeSectionIndex = useEditorStore(s => s.activeSectionIndex);
  // historyVersion: re-render badges when set-section-bg / set-sections
  // executes/undoes.
  useEditorStore(s => s.historyVersion);
  const project = useProjectStore(s => s.project);
  const state = useProjectStore.getState();
  const act = getCurrentAct(state);

  // The flat index currently being dragged (for move-by-drop), and the cell
  // hovered during a drag (for the drop-target outline).
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // Right-click context menu (copy / paste / remove).
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Close the context menu on any outside click (mirrors Toolbar's dropdown).
  useEffect(() => {
    if (!menu) return;
    const handler = () => setMenu(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menu]);

  if (!act) return <div style={styles.empty}>No act loaded</div>;

  const { gridWidth, gridHeight, sections } = act;

  /**
   * Central dispatch for every structural grid op. Runs the pure op against a
   * snapshot of the current grid; if it changes anything, wraps the before/after
   * in a single undoable `set-sections` command and focuses the result.
   * executeCommand already marks the project dirty.
   */
  const applyGridOp = (
    compute: (g: ops.GridState) => ops.GridOpResult | null,
    description: string,
  ) => {
    const pstate = useProjectStore.getState();
    const a = getCurrentAct(pstate);
    const level = getActiveLevel(pstate);
    if (!a || !level) return;
    const result = compute({ gridWidth: a.gridWidth, gridHeight: a.gridHeight, sections: a.sections });
    if (!result) return;
    executeCommand({
      type: 'set-sections', description, sectionIndex: 0,
      oldGridWidth: a.gridWidth, oldGridHeight: a.gridHeight, oldSections: a.sections.slice(),
      newGridWidth: result.gridWidth, newGridHeight: result.gridHeight, newSections: result.sections,
    }, level);
    useEditorStore.getState().setActiveSectionIndex(result.focusIndex);
  };

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
    applyGridOp(g => ops.addSection(g, index), 'Add section');
  };
  const removeSectionAt = (index: number) => {
    // Removal is undoable (Ctrl+Z) — no confirm needed.
    applyGridOp(g => ops.removeSection(g, index), 'Remove section');
  };
  // Resize the grid; the pure op remaps the active section's (col,row) across
  // the re-indexing that a width change causes.
  const resizeGridTo = (w: number, h: number) => {
    applyGridOp(g => ops.resizeGrid(g, w, h, useEditorStore.getState().activeSectionIndex), 'Resize grid');
  };

  // --- Drag-to-move ---------------------------------------------------------
  const onCellDragStart = (i: number) => { dragFrom.current = i; };
  const onCellDragOver = (i: number, e: React.DragEvent) => {
    e.preventDefault(); // allow drop
    if (dragOver !== i) setDragOver(i);
  };
  const onCellDrop = (i: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    setDragOver(null);
    if (from === null || from === i) return;
    applyGridOp(g => ops.moveSection(g, from, i), 'Move section');
  };
  const onCellDragEnd = () => { dragFrom.current = null; setDragOver(null); };

  // --- Copy / paste context menu --------------------------------------------
  const openMenu = (i: number, sec: Section | null, e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({ index: i, sec, x: e.clientX, y: e.clientY });
  };
  const doCopy = () => {
    if (menu?.sec) sectionClipboard = ops.cloneSection(menu.sec, 0);
    setMenu(null);
  };
  const doPaste = () => {
    if (menu && sectionClipboard) {
      const idx = menu.index;
      applyGridOp(g => ops.pasteSection(g, sectionClipboard!, idx), 'Paste section');
    }
    setMenu(null);
  };
  const doRemove = () => {
    if (menu?.sec) removeSectionAt(menu.index);
    setMenu(null);
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
              draggable={!isNull}
              style={{
                ...styles.cell,
                ...(i === activeSectionIndex ? styles.active : {}),
                ...(isNull ? styles.null : {}),
                ...(dragOver === i ? styles.dropTarget : {}),
              }}
              title={isNull
                ? 'Empty slot — click to add a section here · right-click to paste'
                : bgName
                  ? `BG: ${bgName} · double-click to jump · drag to move · right-click for menu`
                  : 'Double-click to jump · drag to move · right-click for menu'}
              onClick={() => (isNull ? createSectionAt(i) : selectSection(i))}
              onDoubleClick={() => { if (!isNull) jumpToSection(i); }}
              onContextMenu={(e) => openMenu(i, sec, e)}
              onDragStart={() => onCellDragStart(i)}
              onDragOver={(e) => onCellDragOver(i, e)}
              onDrop={() => onCellDrop(i)}
              onDragEnd={onCellDragEnd}
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

      {menu && (
        <div
          style={{ ...styles.menu, left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {menu.sec && (
            <button style={styles.menuItem} onClick={doCopy}>Copy</button>
          )}
          <button
            style={{ ...styles.menuItem, ...(sectionClipboard ? {} : styles.menuItemDisabled) }}
            disabled={!sectionClipboard}
            onClick={doPaste}
          >Paste here</button>
          {menu.sec && (
            <button style={styles.menuItem} onClick={doRemove}>Remove</button>
          )}
        </div>
      )}
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
  dropTarget: { outline: `2px solid ${T.accent}`, outlineOffset: -1 },
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
  menu: {
    position: 'fixed', zIndex: 1000, minWidth: 110,
    background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: 4,
    padding: 3, display: 'flex', flexDirection: 'column', gap: 1,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  },
  menuItem: {
    textAlign: 'left', padding: '4px 8px', fontSize: 11,
    background: 'transparent', color: T.textBase, border: 'none',
    borderRadius: 2, cursor: 'pointer',
  },
  menuItemDisabled: { opacity: 0.4, cursor: 'default' },
};
