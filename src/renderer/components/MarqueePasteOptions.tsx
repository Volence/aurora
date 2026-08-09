import React from 'react';
import { useEditorStore } from '../state/editorStore';
import type { PasteLayers } from '../../core/editing/map-clipboard';
import { T } from './ui';

const LAYER_OPTS: ReadonlyArray<{ value: PasteLayers; label: string; title: string }> = [
  { value: 'both', label: 'Both', title: 'Paste art + collision (default)' },
  { value: 'art', label: 'Art', title: 'Paste art only, leave collision untouched' },
  { value: 'collision', label: 'Collision', title: 'Paste collision only, leave the nametable untouched' },
];

/** Mounted for the marquee tool (copy source) and while pasting (paste
 *  target) — same `pasteLayers` store field drives both, since a copy's
 *  layer choice is really "what will paste later" and pasting can override it
 *  per-click with Alt (art)/Shift (collision). */
export default function MarqueePasteOptions() {
  const pasteLayers = useEditorStore((s) => s.pasteLayers);
  const setPasteLayers = useEditorStore((s) => s.setPasteLayers);
  const pasting = useEditorStore((s) => s.pasting);

  return (
    <div>
      <div style={styles.planes}>
        <span style={styles.planeLabel}>Layers</span>
        {LAYER_OPTS.map(({ value, label, title }) => (
          <button key={value} onClick={() => setPasteLayers(value)} title={title}
            style={{ ...styles.planeBtn, ...(pasteLayers === value ? styles.planeSel : {}) }}>{label}</button>
        ))}
      </div>
      <div style={styles.hint}>
        {pasting
          ? 'Click to paste · hold Alt for art only, Shift for collision only · Esc to stop'
          : 'Drag to select · Ctrl+C copy · Ctrl+V paste'}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  planes: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: `${T.s2} ${T.s2} 0` },
  planeLabel: { fontSize: 10, color: T.textLo, marginRight: 2, minWidth: 38, flexShrink: 0 },
  planeBtn: { padding: `2px ${T.s2}`, background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`, borderRadius: T.rSm, cursor: 'pointer', fontSize: 11, minWidth: 26, textAlign: 'center' },
  planeSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
  hint: { fontSize: 10, color: T.textLo, padding: `${T.s2} ${T.s2} ${T.s2}` },
};
