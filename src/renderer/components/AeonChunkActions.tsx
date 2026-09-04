import React from 'react';
import { T } from './ui';
import { useProjectStore } from '../state/projectStore';
import { clearChunkLibrary, importChunkFiles } from '../providers/chunk-library-import';
import { actAndDropFocus } from './ui/act-and-drop-focus';

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
      {/* d-30 (`confirm_before`): Clear now ASKS first — see
          `providers/chunk-library-import.ts` for the mechanism and for who
          ruled it. Two things about this line are deliberate:

          • `void` on the promise. The handler stays synchronous; the dialog is
            awaited inside the guard, and the button is left interactive behind
            a modal that covers it anyway.
          • `actAndDropFocus`. Before the confirm, this button dropped focus by
            UNMOUNTING — `hasChunks` goes false the moment the library empties,
            which is the reason d-27's survey did not list it. With a confirm in
            front, the CANCEL path leaves it mounted and focused, so the
            property that made it exempt no longer holds and it needs the same
            explicit blur every other destructive control here has. Keeping an
            existing property, not new scope. */}
      {hasChunks && (
        <button
          onClick={(e) => actAndDropFocus(e, () => { void clearChunkLibrary(); })}
          style={styles.btn}
        >
          Clear
        </button>
      )}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', gap: 4, marginLeft: 'auto', flexShrink: 0 },
  btn: {
    padding: '2px 8px', background: T.border, color: T.textHi,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, cursor: 'pointer', fontSize: T.t2xs,
  },
};
