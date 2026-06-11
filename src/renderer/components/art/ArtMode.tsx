import React, { useState } from 'react';
import { useArtStore } from '../../state/artStore';
import { createDoc } from '../../../core/art/composer-buffer';

export default function ArtMode() {
  const open = useArtStore((s) => s.open);
  const openDocument = useArtStore((s) => s.openDocument);

  // State for the "New Chunk" W/H inputs
  const [chunkW, setChunkW] = useState(2);
  const [chunkH, setChunkH] = useState(2);

  function clampDim(v: number): number {
    return Math.max(1, Math.min(64, Math.round(v)));
  }

  function handleNewTile() {
    openDocument({
      doc: createDoc(1, 1),
      liveTileIndex: null,
      chunkId: null,
      name: 'New Tile (1×1)',
      dirty: false,
    });
  }

  function handleNewBlock() {
    openDocument({
      doc: createDoc(2, 2),
      liveTileIndex: null,
      chunkId: null,
      name: 'New Block (16×16)',
      dirty: false,
    });
  }

  function handleNewChunk() {
    const w = clampDim(chunkW);
    const h = clampDim(chunkH);
    openDocument({
      doc: createDoc(w, h),
      liveTileIndex: null,
      chunkId: null,
      name: `New Chunk (${w}×${h})`,
      dirty: false,
    });
  }

  return (
    <div style={styles.root}>
      {/* Left panel: tool column placeholder */}
      <div style={styles.leftPanel}>
        <div style={styles.panelHeader}>Tools</div>
        <div style={styles.placeholder}>
          Tool column coming in Task 9
        </div>
      </div>

      {/* Center: composer canvas or new-document launcher */}
      <div style={styles.center}>
        {open ? (
          <div style={styles.canvasArea}>
            <div style={styles.docHeader}>
              <span style={styles.docName}>{open.name}</span>
              {open.dirty && <span style={styles.dirtyBadge}>unsaved</span>}
            </div>
            <div style={styles.canvasPlaceholder}>
              ComposerCanvas — Task 8
            </div>
          </div>
        ) : (
          <div style={styles.launcher}>
            <div style={styles.launcherTitle}>New Document</div>

            <button style={styles.newButton} onClick={handleNewTile}>
              New Tile <span style={styles.preset}>1×1 (8px)</span>
            </button>

            <button style={styles.newButton} onClick={handleNewBlock}>
              New Block <span style={styles.preset}>16×16 (2 tiles)</span>
            </button>

            <div style={styles.newChunkRow}>
              <button style={styles.newButton} onClick={handleNewChunk}>
                New Chunk
              </button>
              <label style={styles.dimLabel}>
                W
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={chunkW}
                  onChange={(e) => setChunkW(clampDim(Number(e.target.value)))}
                  style={styles.dimInput}
                />
              </label>
              <label style={styles.dimLabel}>
                H
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={chunkH}
                  onChange={(e) => setChunkH(clampDim(Number(e.target.value)))}
                  style={styles.dimInput}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Right panel: tileset + palette + chunk library placeholder */}
      <div style={styles.rightPanel}>
        <div style={styles.panelHeader}>Tileset</div>
        <div style={styles.placeholder}>
          TilesetPanel — Task 9
        </div>
        <div style={styles.panelHeader}>Palette</div>
        <div style={styles.placeholder}>
          PaletteEditor — Task 11
        </div>
        <div style={styles.panelHeader}>Chunks</div>
        <div style={styles.placeholder}>
          ChunkLibrary — Task 10
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    background: '#1e1e2e',
    color: '#cdd6f4',
  },
  leftPanel: {
    width: 56,
    display: 'flex',
    flexDirection: 'column',
    background: '#181825',
    borderRight: '1px solid #313244',
    flexShrink: 0,
  },
  rightPanel: {
    width: 220,
    display: 'flex',
    flexDirection: 'column',
    background: '#181825',
    borderLeft: '1px solid #313244',
    flexShrink: 0,
    overflow: 'auto',
  },
  panelHeader: {
    padding: '4px 8px',
    fontSize: 10,
    fontWeight: 600,
    color: '#6c7086',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    borderBottom: '1px solid #313244',
  },
  placeholder: {
    padding: '8px',
    fontSize: 11,
    color: '#45475a',
    fontStyle: 'italic',
  },
  center: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: '#1e1e2e',
  },
  canvasArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  docHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 12px',
    background: '#181825',
    borderBottom: '1px solid #313244',
    flexShrink: 0,
  },
  docName: {
    fontSize: 12,
    color: '#cdd6f4',
    fontWeight: 500,
  },
  dirtyBadge: {
    fontSize: 9,
    color: '#1e1e2e',
    background: '#f9e2af',
    padding: '0 4px',
    borderRadius: 3,
    lineHeight: '14px',
    fontWeight: 600,
  },
  canvasPlaceholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#45475a',
    fontSize: 13,
    fontStyle: 'italic',
  },
  launcher: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  launcherTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: '#cdd6f4',
    marginBottom: 8,
  },
  newButton: {
    padding: '8px 20px',
    background: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  preset: {
    fontSize: 11,
    color: '#89b4fa',
  },
  newChunkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  dimLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
    color: '#a6adc8',
  },
  dimInput: {
    width: 44,
    padding: '4px 6px',
    background: '#313244',
    color: '#cdd6f4',
    border: '1px solid #45475a',
    borderRadius: 4,
    fontSize: 12,
  },
};
