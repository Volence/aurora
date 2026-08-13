import { describe, it, expect } from 'vitest';
import {
  HOME_TAB, initialSession, openTab, closeTab, focusTab, retitleTab, pruneSession,
  type TabDescriptor,
} from '../session';

const level = (id: string, title: string): TabDescriptor => ({ id, kind: 'level', title });

describe('tab session', () => {
  it('starts with only the Home tab, active', () => {
    expect(initialSession()).toEqual({ tabs: [HOME_TAB], activeId: 'home' });
  });

  it('openTab appends and focuses a new tab', () => {
    const s = openTab(initialSession(), level('level:ghz:1', 'GHZ Act 1'));
    expect(s.tabs.map((t) => t.id)).toEqual(['home', 'level:ghz:1']);
    expect(s.activeId).toBe('level:ghz:1');
  });

  it('openTab on an already-open id focuses it without duplicating', () => {
    let s = openTab(initialSession(), level('level:ghz:1', 'GHZ Act 1'));
    s = openTab(s, level('level:mz:2', 'MZ Act 2'));
    s = openTab(s, level('level:ghz:1', 'GHZ Act 1'));
    expect(s.tabs).toHaveLength(3);
    expect(s.activeId).toBe('level:ghz:1');
  });

  it('closeTab of the active tab focuses the right neighbor, else the left', () => {
    let s = initialSession();
    s = openTab(s, level('a', 'A'));
    s = openTab(s, level('b', 'B'));
    s = openTab(s, level('c', 'C'));
    s = focusTab(s, 'b');
    s = closeTab(s, 'b');
    expect(s.activeId).toBe('c');           // right neighbor
    s = focusTab(s, 'c');
    s = closeTab(s, 'c');
    expect(s.activeId).toBe('a');           // no right neighbor → left
  });

  it('closeTab of an inactive tab keeps the active tab', () => {
    let s = openTab(initialSession(), level('a', 'A'));
    s = openTab(s, level('b', 'B'));
    s = closeTab(s, 'a');
    expect(s.activeId).toBe('b');
    expect(s.tabs.map((t) => t.id)).toEqual(['home', 'b']);
  });

  it('Home is uncloseable', () => {
    const s = closeTab(initialSession(), 'home');
    expect(s.tabs).toEqual([HOME_TAB]);
  });

  it('focusTab ignores unknown ids', () => {
    const s = focusTab(initialSession(), 'nope');
    expect(s.activeId).toBe('home');
  });

  it('retitleTab renames in place (dirty-name changes, act renames)', () => {
    let s = openTab(initialSession(), level('a', 'Old'));
    s = retitleTab(s, 'a', 'New');
    expect(s.tabs.find((t) => t.id === 'a')!.title).toBe('New');
  });

  it('pruneSession drops invalid tabs, keeps Home, and repairs a dangling activeId', () => {
    let s = openTab(initialSession(), level('level:ghz:1', 'GHZ Act 1'));
    s = openTab(s, level('level:mz:2', 'MZ Act 2'));
    const pruned = pruneSession(s, (t) => t.id !== 'level:mz:2');
    expect(pruned.tabs.map((t) => t.id)).toEqual(['home', 'level:ghz:1']);
    expect(pruned.activeId).toBe('home'); // active was level:mz:2 → falls back to Home
  });

  it('pruneSession never asks the predicate about Home', () => {
    const pruned = pruneSession(initialSession(), () => false);
    expect(pruned.tabs).toEqual([HOME_TAB]);
    expect(pruned.activeId).toBe('home');
  });

  it('pruneSession keeps activeId when the active tab survives', () => {
    const s = openTab(initialSession(), level('level:ghz:1', 'GHZ Act 1'));
    const pruned = pruneSession(s, () => true);
    expect(pruned).toEqual(s);
  });
});
