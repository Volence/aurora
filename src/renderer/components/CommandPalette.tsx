import React, { useEffect, useMemo, useRef, useState } from 'react';
import { T, Z } from './ui';
import { modalIsOpen } from '../state/modalStore';
import { useCommandPaletteStore } from '../state/commandPaletteStore';
import { paletteKeyAction } from '../shell/command-palette-chord';

export interface Command {
  id: string;
  label: string;
  hint?: string;       // right-aligned context (shortcut, group)
  run: () => void;
}

/**
 * Empyrean command palette (Ctrl+K or Ctrl+Shift+P, both shared chrome
 * conventions). Filters the given commands by substring; arrow keys navigate,
 * Enter runs, Esc closes. Themed from the design tokens (emerald accent on the
 * active row).
 *
 * ⚠ THE OPEN STATE IS NO LONGER PRIVATE, and that is UX seat B's F6. It lived
 * in this component's `useState` and the only writer was the keydown listener
 * below, so the palette could be reached by a chord and by nothing else - which
 * is exactly the finding: no menu, no button, no badge, no hint, and a reader
 * with no prior never presses anything. It now reads
 * `commandPaletteStore`, which the Explorer's affordance can write. The chord
 * DECISION moved too, to `shell/command-palette-chord.ts`, where a node suite
 * can execute it; this component keeps the listener and the rendering.
 */
export default function CommandPalette({ commands }: { commands: Command[] }) {
  const open = useCommandPaletteStore((s) => s.open);
  const setOpen = useCommandPaletteStore((s) => s.setOpen);
  const toggle = useCommandPaletteStore((s) => s.toggle);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // EVERY RULE IS IN `paletteKeyAction` - which chords open it, which
      // spellings of a shifted key count, and the asymmetric modal guard (a
      // chord may not OPEN the palette over a dialog; an open palette still
      // answers). Nothing about the decision is re-stated here, so a node test
      // of that function is a test of what actually fires.
      const action = paletteKeyAction(e, open, modalIsOpen());
      if (action === null) return;
      e.preventDefault();
      if (action === 'close') setOpen(false); else toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen, toggle]);

  useEffect(() => {
    if (open) { setQuery(''); setSel(0); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q));
  }, [commands, query]);

  if (!open) return null;

  const run = (c: Command | undefined) => { if (c) { setOpen(false); c.run(); } };

  return (
    <div style={styles.backdrop} onMouseDown={() => setOpen(false)}>
      <div style={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          style={styles.input}
          placeholder="Run a command…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(filtered[sel]); }
          }}
        />
        <div style={styles.list}>
          {filtered.length === 0 && <div style={styles.empty}>No matching commands</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              style={{ ...styles.row, ...(i === sel ? styles.rowActive : {}) }}
              onMouseEnter={() => setSel(i)}
              onMouseDown={(e) => { e.preventDefault(); run(c); }}
            >
              <span>{c.label}</span>
              {c.hint && <span style={styles.hint}>{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(10,12,18,0.6)', backdropFilter: 'blur(2px)',
    display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh', zIndex: Z.modal,
  },
  panel: {
    width: 540, maxWidth: '90vw', background: T.surface,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rXl,
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)', overflow: 'hidden',
  },
  input: {
    width: '100%', padding: '12px 16px', fontSize: 15, color: T.textHi,
    background: 'transparent', border: 'none', borderBottom: `1px solid ${T.border}`,
    fontFamily: T.fontUi,
  },
  list: { maxHeight: 360, overflowY: 'auto', padding: 4 },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '7px 12px', borderRadius: T.rMd, cursor: 'pointer',
    color: T.textBase, fontSize: T.tBase,
  },
  rowActive: { background: T.raised, color: T.textHi, boxShadow: `inset 2px 0 0 ${T.accent}` },
  hint: { fontSize: T.tXs, color: T.textLo, fontFamily: T.fontMono },
  empty: { padding: '12px', color: T.textLo, fontSize: T.tBase, textAlign: 'center' },
};
