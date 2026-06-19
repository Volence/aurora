import React, { useEffect, useMemo, useRef, useState } from 'react';
import { T } from './ui';

export interface Command {
  id: string;
  label: string;
  hint?: string;       // right-aligned context (shortcut, group)
  run: () => void;
}

/**
 * Empyrean command palette (Ctrl/Cmd-K, a shared chrome convention). Self-
 * contained: owns its open state via a global key listener; filters the given
 * commands by substring; arrow keys navigate, Enter runs, Esc closes. Themed
 * from the design tokens (emerald accent on the active row).
 */
export default function CommandPalette({ commands }: { commands: Command[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
    display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh', zIndex: 1000,
  },
  panel: {
    width: 540, maxWidth: '90vw', background: T.surface,
    border: `1px solid ${T.borderStrong}`, borderRadius: T.rXl,
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)', overflow: 'hidden',
  },
  input: {
    width: '100%', padding: '12px 16px', fontSize: 15, color: T.textHi,
    background: 'transparent', border: 'none', borderBottom: `1px solid ${T.border}`, outline: 'none',
    fontFamily: T.fontUi,
  },
  list: { maxHeight: 360, overflowY: 'auto', padding: 4 },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '7px 12px', borderRadius: T.rMd, cursor: 'pointer',
    color: T.textBase, fontSize: 13,
  },
  rowActive: { background: T.raised, color: T.textHi, boxShadow: `inset 2px 0 0 ${T.accent}` },
  hint: { fontSize: 11, color: T.textLo, fontFamily: T.fontMono },
  empty: { padding: '12px', color: T.textLo, fontSize: 13, textAlign: 'center' },
};
