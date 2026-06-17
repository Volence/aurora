import React from 'react';
import { useEditorStore, type EditorTool } from '../state/editorStore';
import { useProjectStore } from '../state/projectStore';

const TOOL_INFO: Record<EditorTool, { label: string; hint: string }> = {
  'view': { label: 'View', hint: 'Click + drag to pan, scroll to zoom' },
  'select': { label: 'Select', hint: 'Click objects/rings to select, drag to move' },
  'paint-tile': { label: 'Paint Tile', hint: 'Click to place selected tile, right-click to pick' },
  'paint-block': { label: 'Paint Block', hint: 'Click to place a 16×16 px block (2×2 tiles)' },
  'stamp-chunk': { label: 'Stamp Chunk', hint: 'Select a chunk from the library, then click to stamp onto the map' },
  'paint-collision': { label: 'Paint Collision', hint: 'Click to set collision type on tiles' },
  'eraser': { label: 'Eraser', hint: 'Click to erase tiles' },
  'place-object': { label: 'Place Object', hint: 'Click to place selected object type' },
  'place-ring': { label: 'Place Ring', hint: 'Click to place ring pattern' },
};

export default function StatusBar() {
  const tool = useEditorStore((s) => s.tool);
  const selectedChunkId = useEditorStore((s) => s.selectedChunkId);
  const editingLayer = useEditorStore((s) => s.editingLayer);
  const activeSectionIndex = useEditorStore((s) => s.activeSectionIndex);
  const appMode = useEditorStore((s) => s.appMode);
  const project = useProjectStore((s) => s.project);

  // The map-mode tool/layer/section badges (incl. the "FG" layer) don't apply in
  // Art/Sprite mode — show a mode-appropriate bar instead.
  if (appMode !== 'map') {
    return (
      <div style={styles.bar}>
        <span style={styles.toolBadge}>{appMode === 'sprite' ? 'Sprite' : 'Art'}</span>
        <span style={styles.hint}>{appMode === 'sprite' ? 'Sprite / animation editor' : 'Level art editor'}</span>
        <div style={{ flex: 1 }} />
      </div>
    );
  }

  const info = TOOL_INFO[tool];
  const chunkCount = project?.chunkLibrary.length ?? 0;

  let contextInfo = '';
  if (tool === 'stamp-chunk') {
    if (chunkCount === 0) {
      contextInfo = 'No chunks loaded -- import chunks first';
    } else if (!selectedChunkId) {
      contextInfo = 'Select a chunk from the library panel';
    } else {
      contextInfo = `Chunk: ${selectedChunkId}`;
    }
  }

  return (
    <div style={styles.bar}>
      <span style={styles.toolBadge}>{info.label}</span>
      <span style={styles.layerBadge}>{editingLayer.toUpperCase()}</span>
      <span style={styles.hint}>
        {contextInfo || info.hint}
      </span>
      <div style={{ flex: 1 }} />
      <span style={styles.section}>Section {activeSectionIndex}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '2px 8px', background: '#181825',
    borderTop: '1px solid #313244', flexShrink: 0,
    height: 22,
  },
  toolBadge: {
    fontSize: 10, fontWeight: 600, color: '#1e1e2e', background: '#89b4fa',
    padding: '0 6px', borderRadius: 3, lineHeight: '16px',
  },
  layerBadge: {
    fontSize: 10, fontWeight: 600, color: '#1e1e2e', background: '#a6adc8',
    padding: '0 4px', borderRadius: 3, lineHeight: '16px',
  },
  hint: {
    fontSize: 11, color: '#6c7086',
  },
  section: {
    fontSize: 10, color: '#45475a',
  },
};
