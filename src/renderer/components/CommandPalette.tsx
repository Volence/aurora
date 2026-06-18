import React, { useEffect, useMemo, useRef, useState } from 'react';

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
    width: 540, maxWidth: '90vw', background: 'var(--surface, #12151E)',
    border: '1px solid var(--border-strong, #3A4152)', borderRadius: 'var(--radius-xl, 8px)',
    boxShadow: '0 16px 48px rgba(0,0,0,0.5)', overflow: 'hidden',
  },
  input: {
    width: '100%', padding: '12px 16px', fontSize: 15, color: 'var(--text-hi, #E8EAF2)',
    background: 'transparent', border: 'none', borderBottom: '1px solid var(--border, #2A2F3D)', outline: 'none',
    fontFamily: 'var(--font-ui, sans-serif)',
  },
  list: { maxHeight: 360, overflowY: 'auto', padding: 4 },
  row: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '7px 12px', borderRadius: 'var(--radius-md, 4px)', cursor: 'pointer',
    color: 'var(--text-base, #B8BECE)', fontSize: 13,
  },
  rowActive: { background: 'var(--raised, #1A1E2A)', color: 'var(--text-hi, #E8EAF2)', boxShadow: 'inset 2px 0 0 var(--accent, #34D399)' },
  hint: { fontSize: 11, color: 'var(--text-lo, #6E7589)', fontFamily: 'var(--font-mono, monospace)' },
  empty: { padding: '12px', color: 'var(--text-lo, #6E7589)', fontSize: 13, textAlign: 'center' },
};
