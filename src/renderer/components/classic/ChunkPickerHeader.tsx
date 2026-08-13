import React from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { classicCanLoop } from '../../providers/chunk-grid-classic';

/**
 * Classic's chunk-grid header control: the loop-flag toggle. Rendered by
 * shared/ChunkGrid through the classic port's `HeaderExtra`.
 *
 * S1 packs the loop flag in BIT 7 of the layout cell, in-band with the chunk id
 * — it is a property of the placement, not of the chunk — so this is armed state
 * beside the selection rather than anything the grid or the chunk knows about.
 * It only appears for an id that can carry the flag ($01..$7F).
 *
 * Store reads are fine HERE: this is a classic-specific component, and the
 * neutrality rule binds the shared grid, not the parts a port plugs into it.
 */
export default function ChunkPickerHeader(): React.ReactElement | null {
  const selectedChunkId = useClassicLevelStore((s) => s.selectedChunkId);
  const stampLoop = useClassicLevelStore((s) => s.stampLoop);
  const setStampLoop = useClassicLevelStore((s) => s.setStampLoop);

  if (!classicCanLoop(selectedChunkId)) return null;

  return (
    <button
      onClick={() => setStampLoop(!stampLoop)}
      title="Stamp this chunk with S1's loop flag (bit 7) — used for loop-de-loop layout cells"
      style={{ ...styles.loopBtn, ...(stampLoop ? styles.loopBtnOn : {}) }}
    >
      ∞ Loop
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  loopBtn: {
    fontSize: 10, fontWeight: 600, color: T.textLo, background: T.overlay,
    border: `1px solid ${T.border}`, borderRadius: 3, padding: '0 6px',
    lineHeight: '16px', cursor: 'pointer', flexShrink: 0,
  },
  loopBtnOn: { color: T.onAccent, background: T.warning, borderColor: T.warning },
};
