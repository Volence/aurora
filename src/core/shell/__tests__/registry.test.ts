import { describe, it, expect } from 'vitest';
import { createRegistry } from '../registry';

interface Widget { id: string; label: string }

describe('createRegistry', () => {
  it('registers and retrieves items by id', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    expect(reg.get('a')).toEqual({ id: 'a', label: 'A' });
    expect(reg.get('missing')).toBeUndefined();
  });

  it('lists items in registration order', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    reg.register({ id: 'b', label: 'B' });
    expect(reg.list().map((w) => w.id)).toEqual(['a', 'b']);
  });

  it('throws on duplicate id', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    expect(() => reg.register({ id: 'a', label: 'A2' })).toThrow(
      "Widget 'a' is already registered",
    );
  });

  it('clear() empties the registry (test isolation support)', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    reg.clear();
    expect(reg.list()).toEqual([]);
  });

  it('list() returns a copy: mutating it does not affect the registry', () => {
    const reg = createRegistry<Widget>('Widget');
    reg.register({ id: 'a', label: 'A' });
    const snapshot = reg.list();
    (snapshot as Widget[]).pop();
    expect(reg.list()).toHaveLength(1);
  });
});
