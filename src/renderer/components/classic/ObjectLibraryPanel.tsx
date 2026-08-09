import React from 'react';
import { T } from '../ui';
import { useClassicLevelStore } from '../../state/classicLevelStore';
import { S1_OBJECT_LIST, s1ObjectHex } from '../../../core/project/profiles/s1-objects';

/**
 * Object library panel (Task 14). A scrollable list of the named S1 objects
 * (id + name text rows — sprite thumbnails are a later registry payoff). Click a
 * row to ARM it for placement: the object tool activates and the next click on
 * the map drops a new object of that id (default subtype 0, no flips). The armed
 * row is highlighted; clicking it again disarms. Placement itself, and the
 * revert-to-select-on-place, live in ClassicLevelViewport.
 *
 * The place idiom mirrors the stamp tool's chunk-selection (selectedChunkId +
 * paint): a persistent armed selection, not an HTML5 drag — the simplest robust
 * option that matches the repo's existing pick-then-act flow.
 */
export default function ObjectLibraryPanel() {
  const status = useClassicLevelStore((s) => s.status);
  const armedObjectId = useClassicLevelStore((s) => s.armedObjectId);
  const setArmedObjectId = useClassicLevelStore((s) => s.setArmedObjectId);
  const setTool = useClassicLevelStore((s) => s.setTool);

  if (status !== 'ready') return null;

  const arm = (id: number) => {
    if (armedObjectId === id) {
      setArmedObjectId(null);
      return;
    }
    setTool('object'); // arming implies the object tool is what you want next
    setArmedObjectId(id);
  };

  return (
    <div style={styles.list} role="listbox" aria-label="Object library">
      {S1_OBJECT_LIST.map(({ id, name }) => {
        const armed = armedObjectId === id;
        return (
          <button
            key={id}
            role="option"
            aria-selected={armed}
            onClick={() => arm(id)}
            title={`Place ${name} (${s1ObjectHex(id)})`}
            style={{ ...styles.row, ...(armed ? styles.rowArmed : {}) }}
          >
            <span style={{ ...styles.hex, ...(armed ? styles.hexArmed : {}) }}>{s1ObjectHex(id)}</span>
            <span style={styles.name}>{name}</span>
          </button>
        );
      })}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', padding: 4, gap: 2 },
  row: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '3px 6px', background: 'transparent', border: '1px solid transparent',
    borderRadius: T.rMd, cursor: 'pointer', textAlign: 'left', color: T.textBase,
  },
  rowArmed: { background: T.accent, borderColor: T.accent, color: T.onAccent },
  hex: {
    fontFamily: T.fontMono, fontSize: 10, color: T.textLo, width: 30, flexShrink: 0,
  },
  hexArmed: { color: T.onAccent },
  name: { fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
