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
