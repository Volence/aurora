// src/renderer/shell/__tests__/session-storage.test.ts
import { describe, it, expect } from 'vitest';
import { sessionKeyFor, loadStoredSession, saveStoredSession, defaultProjectSession, type StorageLike } from '../session-storage';
import { initialSession, openTab, type SessionState } from '../../../core/shell/session';

function memStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

describe('session storage', () => {
  it('keys by project path, with a no-project bucket', () => {
    expect(sessionKeyFor('/home/u/s1disasm')).toBe('aurora.session.v1:/home/u/s1disasm');
    expect(sessionKeyFor(null)).toBe('aurora.session.v1:no-project');
  });

  it('round-trips a session under its project key', () => {
    const storage = memStorage();
    const s = openTab(initialSession(), { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    saveStoredSession(storage, '/p', s);
    expect(loadStoredSession(storage, '/p', () => true)).toEqual(s);
  });

  it('returns null when nothing is stored (caller builds the default)', () => {
    expect(loadStoredSession(memStorage(), '/p', () => true)).toBeNull();
  });

  it('prunes restored tabs through the validity predicate', () => {
    const storage = memStorage();
    let s = openTab(initialSession(), { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    s = openTab(s, { id: 'level:gone:9', kind: 'level', title: 'Deleted' });
    saveStoredSession(storage, '/p', s);
    const restored = loadStoredSession(storage, '/p', (t) => t.id !== 'level:gone:9')!;
    expect(restored.tabs.map((t) => t.id)).toEqual(['home', 'level:ghz:1']);
    expect(restored.activeId).toBe('home');
  });

  it('restores garbage to the initial session (defensive restore underneath)', () => {
    const storage = memStorage();
    storage.map.set(sessionKeyFor('/p'), 'not json');
    expect(loadStoredSession(storage, '/p', () => true)).toEqual(initialSession());
  });

  it('a throwing storage never breaks save (quota, privacy mode)', () => {
    const bad: StorageLike = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveStoredSession(bad, '/p', initialSession())).not.toThrow();
  });

  it('a throwing getItem loads as null (broken storage never breaks boot)', () => {
    const bad: StorageLike = { getItem: () => { throw new Error('denied'); }, setItem: () => {} };
    expect(loadStoredSession(bad, '/p', () => true)).toBeNull();
  });

  it('defaultProjectSession opens and focuses the first level tab when given one', () => {
    const tab = { id: 'level:ghz:1', kind: 'level' as const, title: 'GHZ Act 1' };
    const s: SessionState = defaultProjectSession(tab);
    expect(s.tabs.map((t) => t.id)).toEqual(['home', 'level:ghz:1']);
    expect(s.activeId).toBe('level:ghz:1');
    expect(defaultProjectSession(null)).toEqual(initialSession());
  });
});
