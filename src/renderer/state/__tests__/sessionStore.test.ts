import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '../sessionStore';

describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('exposes the initial session', () => {
    const s = useSessionStore.getState();
    expect(s.tabs.map((t) => t.id)).toEqual(['home']);
    expect(s.activeId).toBe('home');
  });

  it('open / focus / close delegate to the core reducers', () => {
    const s = useSessionStore.getState();
    s.open({ id: 'level:ghz:1', kind: 'level', title: 'GHZ Act 1' });
    s.open({ id: 'doc:buzzbomber', kind: 'sprite-doc', title: 'Buzzbomber' });
    expect(useSessionStore.getState().activeId).toBe('doc:buzzbomber');

    s.focus('level:ghz:1');
    expect(useSessionStore.getState().activeId).toBe('level:ghz:1');

    s.close('level:ghz:1');
    const after = useSessionStore.getState();
    expect(after.tabs.map((t) => t.id)).toEqual(['home', 'doc:buzzbomber']);
    expect(after.activeId).toBe('doc:buzzbomber');
  });

  it('retitle renames a tab', () => {
    const s = useSessionStore.getState();
    s.open({ id: 'doc:x', kind: 'art-doc', title: 'Untitled' });
    s.retitle('doc:x', 'ghz-waterfall');
    expect(useSessionStore.getState().tabs.find((t) => t.id === 'doc:x')!.title).toBe('ghz-waterfall');
  });
});
