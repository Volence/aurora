import { describe, it, expect } from 'vitest';
import { serializeSession, restoreSession } from '../session-persistence';
import { HOME_TAB, initialSession, openTab } from '../session';

describe('session persistence', () => {
  it('round-trips a session', () => {
    let s = openTab(initialSession(), { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    s = openTab(s, { id: 'tool:converter', kind: 'tool', title: 'Converter' });
    expect(restoreSession(serializeSession(s))).toEqual(s);
  });

  it('restores garbage to the initial session', () => {
    expect(restoreSession('not json')).toEqual(initialSession());
    expect(restoreSession('{"tabs": "nope"}')).toEqual(initialSession());
  });

  it('injects Home if the persisted tab list lacks it', () => {
    const restored = restoreSession(JSON.stringify({
      tabs: [{ id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' }],
      activeId: 'level:ghz:1',
    }));
    expect(restored.tabs[0]).toEqual(HOME_TAB);
    expect(restored.activeId).toBe('level:ghz:1');
  });

  it('falls back to Home when the persisted activeId no longer exists', () => {
    const restored = restoreSession(JSON.stringify({
      tabs: [HOME_TAB],
      activeId: 'level:deleted:9',
    }));
    expect(restored.activeId).toBe('home');
  });

  it('normalizes a mismatched home-kind tab instead of duplicating Home', () => {
    const restored = restoreSession(JSON.stringify({
      tabs: [{ id: 'home2', kind: 'home', title: 'Home' }],
      activeId: 'home2',
    }));
    expect(restored.tabs).toEqual([HOME_TAB]);
    expect(restored.activeId).toBe('home');
  });

  it('drops duplicate tab ids, keeping the first occurrence', () => {
    const restored = restoreSession(JSON.stringify({
      tabs: [
        HOME_TAB,
        { id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' },
        { id: 'level:ghz:1', kind: 'level', title: 'GHZ copy' },
      ],
      activeId: 'level:ghz:1',
    }));
    expect(restored.tabs.map((t) => t.title)).toEqual(['Home', 'GHZ Act 1']);
  });
});
