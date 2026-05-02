import React, { useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore } from '../state/projectStore';

export default function ChunkLibrary() {
  const selectedChunkId = useEditorStore(s => s.selectedChunkId);
  const project = useProjectStore(s => s.project);
  const [newWidth, setNewWidth] = useState(16);
  const [newHeight, setNewHeight] = useState(16);

  const chunks = project?.chunkLibrary ?? [];

  return (
    <div style={styles.container}>
      <div style={styles.header}>Chunk Library</div>
      <div style={styles.list}>
        {chunks.map(chunk => (
          <button
            key={chunk.id}
            style={{
              ...styles.item,
              ...(chunk.id === selectedChunkId ? styles.selected : {}),
            }}
            onClick={() => useEditorStore.getState().setSelectedChunkId(chunk.id)}
          >
            <span>{chunk.name}</span>
            <span style={styles.dims}>{chunk.widthTiles}x{chunk.heightTiles}</span>
          </button>
        ))}
      </div>
      <div style={styles.newChunk}>
        <div style={styles.inputRow}>
          <label style={styles.label}>W:</label>
          <input type="number" min={1} max={256} value={newWidth} onChange={e => setNewWidth(+e.target.value)} style={styles.input} />
          <label style={styles.label}>H:</label>
          <input type="number" min={1} max={256} value={newHeight} onChange={e => setNewHeight(+e.target.value)} style={styles.input} />
        </div>
        <div style={styles.pixelHint}>{newWidth * 8}x{newHeight * 8} px</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 8, borderTop: '1px solid #313244' },
  header: { fontSize: 11, color: '#6c7086', marginBottom: 4 },
  list: { display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 150, overflow: 'auto' },
  item: {
    display: 'flex', justifyContent: 'space-between', padding: '4px 6px',
    background: '#313244', border: '1px solid #45475a', borderRadius: 2,
    color: '#cdd6f4', cursor: 'pointer', fontSize: 11,
  },
  selected: { background: '#89b4fa', color: '#1e1e2e' },
  dims: { fontSize: 9, color: '#6c7086' },
  newChunk: { marginTop: 8 },
  inputRow: { display: 'flex', alignItems: 'center', gap: 4 },
  label: { fontSize: 10, color: '#6c7086' },
  input: { width: 40, padding: '2px 4px', background: '#11111b', border: '1px solid #45475a', color: '#cdd6f4', fontSize: 11, borderRadius: 2 },
  pixelHint: { fontSize: 9, color: '#45475a', marginTop: 2 },
};
