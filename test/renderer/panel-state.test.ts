// test/renderer/panel-state.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadPanelState, savePanelState, isCollapsed, togglePanel } from '../../src/renderer/shell/panel-state';

function fakeLocalStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(), key: () => null, length: 0,
  } as unknown as Storage;
}

describe('panel-state', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', fakeLocalStorage()); });

  it('isCollapsed returns the default when unset', () => {
    expect(isCollapsed({}, 'tileset', false)).toBe(false);
    expect(isCollapsed({}, 'tileset', true)).toBe(true);
  });
  it('togglePanel flips a panel against its default, immutably', () => {
    const a = togglePanel({}, 'tileset', false);
    expect(a).toEqual({ tileset: true });
    expect(togglePanel(a, 'tileset', false)).toEqual({ tileset: false });
  });
  it('save then load round-trips through localStorage', () => {
    savePanelState({ tileset: true, palette: false });
    expect(loadPanelState()).toEqual({ tileset: true, palette: false });
  });
  it('load returns {} on missing/corrupt storage', () => {
    expect(loadPanelState()).toEqual({});
    localStorage.setItem('aurora.shell.panels', '{not json');
    expect(loadPanelState()).toEqual({});
  });
});
