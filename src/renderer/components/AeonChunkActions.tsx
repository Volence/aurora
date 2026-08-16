import React from 'react';
import { T } from './ui';
import { useProjectStore } from '../state/projectStore';
import { clearChunkLibrary, importChunkFiles } from '../providers/chunk-library-import';

/**
 * Aeon's chunk-grid header controls: import a chunk library from S2/S3K/hack
 * files, or clear the one that is loaded. Rendered by shared/ChunkGrid through
 * the aeon port's `HeaderExtra` — the grid itself knows nothing about either
 * action, and classic's header (a loop-flag toggle) has nothing in common with
 * it beyond the slot.
 *
 * Store reads are fine HERE: this is an engine-specific component, and the
 * neutrality rule binds the shared grid, not the parts a port plugs into it.
 */
export default function AeonChunkActions(): React.ReactElement {
  const hasChunks = useProjectStore((s) => (s.project?.chunkLibrary.length ?? 0) > 0);
  const [importing, setImporting] = React.useState(false);

  const handleImport = React.useCallback(async () => {
    setImporting(true);
    try {
      await importChunkFiles();
    } finally {
      setImporting(false);
    }
  }, []);

  return (
    <span style={styles.wrap}>
      <button onClick={() => { void handleImport(); }} style={styles.btn} disabled={importing}>
        {importing ? 'Importing...' : 'Import'}
      </button>
      {hasChunks && <button onClick={clearChunkLibrary} style={styles.btn}>Clear</button>}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', gap: 4, marginLeft: 'auto', flexShrink: 0 },
  btn: {
    padding: '2px 8px', background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, cursor: 'pointer', fontSize: 10,
  },
};
