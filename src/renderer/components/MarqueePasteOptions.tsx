import React, { useState } from 'react';
import { useEditorStore } from '../state/editorStore';
import { useProjectStore, getCurrentAct } from '../state/projectStore';
import { useToastStore } from '../state/toastStore';
import type { PasteLayers } from '../../core/editing/map-clipboard';
import { selectionToChunk } from '../../core/editing/selection-to-chunk';
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
  const marquee = useEditorStore((s) => s.marquee);
  const [nameInput, setNameInput] = useState('');

  // Default name uses BLOCK dims (marquee w/h are tiles; 2 tiles = one 16px
  // block), matching the "Copied W×H blocks" copy toast's units.
  const autoName = marquee ? `Selection ${marquee.w >> 1}×${marquee.h >> 1}` : '';

  function saveAsChunk() {
    const m = useEditorStore.getState().marquee;
    if (!m) return;
    const act = getCurrentAct(useProjectStore.getState());
    const section = act?.sections[m.sectionIndex];
    if (!section) return;
    const name = nameInput.trim() || `Selection ${m.w >> 1}×${m.h >> 1}`;
    const def = selectionToChunk(section, m.col, m.row, m.w, m.h, name);
    useProjectStore.getState().addChunks([def]);
    // Select the chunk you just made: the obvious next act is stamping it, and
    // without this the user saves into a wall of 70+ thumbnails and has to
    // find their own selection by eye before the stamp tool does anything
    // (owner report, 2026-08-19 — this was the path that ended in the ghost
    // crash). With it, K -> click stamps the saved selection immediately.
    useEditorStore.getState().setSelectedChunkId(def.id);
    useEditorStore.getState().markDirty();
    useToastStore.getState().addToast(
      `Added "${name}" to chunk library — Save project to keep`, 'success');
    setNameInput('');
  }

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
      {/* Save-as-chunk: only meaningful with a committed selection and not while
          pasting. Captures the same FG nametable + collision the map clipboard
          does (selectionToChunk → copyFromSection) into a stampable ChunkDef. */}
      {!pasting && marquee && (
        <div style={styles.saveRow}>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder={autoName}
            title="Chunk name (blank = auto)"
            style={styles.nameInput}
          />
          <button onClick={saveAsChunk} title="Save this selection as a stampable chunk"
            style={styles.saveBtn}>Save as chunk</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  planes: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: `${T.s2} ${T.s2} 0` },
  planeLabel: { fontSize: T.t2xs, color: T.textLo, marginRight: 2, minWidth: 38, flexShrink: 0 },
  planeBtn: { padding: `2px ${T.s2}`, background: T.overlay, color: T.textBase, borderWidth: 1, borderStyle: 'solid', borderColor: T.border, borderRadius: T.rSm, cursor: 'pointer', fontSize: T.tXs, minWidth: 26, textAlign: 'center' },
  planeSel: { background: T.accent, color: T.onAccent, borderColor: T.accent },
  hint: { fontSize: T.t2xs, color: T.textLo, padding: `${T.s2} ${T.s2} ${T.s2}` },
  saveRow: { display: 'flex', alignItems: 'center', gap: 4, padding: `0 ${T.s2} ${T.s2}` },
  nameInput: { flex: 1, minWidth: 0, padding: `2px ${T.s2}`, background: T.overlay, color: T.textBase, border: `1px solid ${T.border}`, borderRadius: T.rSm, fontSize: T.tXs },
  saveBtn: { padding: `2px ${T.s2}`, background: T.accent, color: T.onAccent, border: `1px solid ${T.accent}`, borderRadius: T.rSm, cursor: 'pointer', fontSize: T.tXs, flexShrink: 0, whiteSpace: 'nowrap' },
};
