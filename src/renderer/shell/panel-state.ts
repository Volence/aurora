// src/renderer/shell/panel-state.ts
// panelId -> collapsed? (absent = use the panel's default)
export type PanelState = Record<string, boolean>;
const KEY = 'aurora.shell.panels';

export function loadPanelState(): PanelState {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as PanelState) : {}; }
  catch { return {}; }
}
export function savePanelState(s: PanelState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
export function isCollapsed(s: PanelState, id: string, def = false): boolean {
  return s[id] ?? def;
}
export function togglePanel(s: PanelState, id: string, def = false): PanelState {
  return { ...s, [id]: !(s[id] ?? def) };
}

// ---------------------------------------------------------------------------
// REVEALING A SECTION FROM OUTSIDE IT (2026-08-27)
// ---------------------------------------------------------------------------
//
// `CollapsibleSection` snapshots this map into its OWN `useState` at mount and
// re-reads it only on its own header click. That is fine for a preference and
// useless for a reveal: writing `savePanelState` from elsewhere changes
// localStorage and re-renders nothing, so the section stays shut until the next
// remount. The owner's report — "I press add a band bank and idk where it is" —
// is a band appended into a `defaultCollapsed` section, so the reveal is the
// whole point and a silent no-op would be the same bug with more code.
//
// So: a subscription. `revealPanel(id)` writes "expanded" AND notifies, and
// every mounted section re-reads. It is deliberately NOT a general "set" —
// nothing should be able to COLLAPSE a section behind the author's back, and a
// one-way door cannot.
//
// The listener set is module-level and unconditional: sections subscribe on
// mount and unsubscribe on unmount, so a reveal for an id nobody is showing
// costs one Map write and wakes whoever is listening to nothing in particular.

type PanelListener = () => void;
const listeners = new Set<PanelListener>();

/** Subscribe to reveals. Returns the unsubscribe, for a `useEffect` cleanup. */
export function subscribePanelState(fn: PanelListener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Open the section with this id, wherever it is mounted, and tell it so.
 *
 * ONE WAY ONLY — see the block above. Returns the new state, so a test can
 * assert the write without reaching into localStorage.
 */
export function revealPanel(id: string): PanelState {
  const next = { ...loadPanelState(), [id]: false };
  savePanelState(next);
  for (const fn of [...listeners]) fn();
  return next;
}
