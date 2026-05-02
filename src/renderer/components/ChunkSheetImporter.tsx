import React from 'react';

// TODO: Rewrite ChunkSheetImporter for S4 tile-based system.
// The old importer worked with Tile->Block->Chunk hierarchy which no longer exists.
// A new version should import PNG sheets directly into the tileset + nametable format.

interface Props {
  onClose: () => void;
}

export default function ChunkSheetImporter({ onClose }: Props) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Import Sheet</span>
          <button onClick={onClose} style={styles.closeBtn}>X</button>
        </div>
        <div style={styles.body}>
          <p>Sheet importer is being rewritten for the S4 tile-based system.</p>
          <p>This feature will be available in a future update.</p>
        </div>
        <div style={styles.actions}>
          <button onClick={onClose} style={styles.cancelBtn}>Close</button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  dialog: {
    background: '#1e1e2e', border: '1px solid #45475a', borderRadius: 8,
    width: 400, display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px', borderBottom: '1px solid #313244',
  },
  title: { fontSize: 16, fontWeight: 600, color: '#cdd6f4' },
  closeBtn: {
    background: 'transparent', border: 'none', color: '#6c7086',
    cursor: 'pointer', fontSize: 16, padding: '4px 8px',
  },
  body: {
    padding: '24px 16px', color: '#a6adc8', fontSize: 13,
  },
  actions: {
    display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid #313244',
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    padding: '6px 16px', background: '#313244', color: '#cdd6f4',
    border: '1px solid #45475a', borderRadius: 4, cursor: 'pointer', fontSize: 13,
  },
};
