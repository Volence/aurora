import { describe, it, expect } from 'vitest';
import { DocumentHistoryHub } from '../document-history';

describe('DocumentHistoryHub', () => {
  it('returns the same EditHistory for the same doc id', () => {
    const hub = new DocumentHistoryHub();
    expect(hub.historyFor('level:ghz:1')).toBe(hub.historyFor('level:ghz:1'));
  });

  it('returns independent histories for different doc ids', () => {
    const hub = new DocumentHistoryHub();
    expect(hub.historyFor('level:ghz:1')).not.toBe(hub.historyFor('doc:buzzbomber'));
  });

  it('has() reports without creating', () => {
    const hub = new DocumentHistoryHub();
    expect(hub.has('level:ghz:1')).toBe(false);
    hub.historyFor('level:ghz:1');
    expect(hub.has('level:ghz:1')).toBe(true);
  });

  it('dispose() clears and forgets a history; next access is fresh', () => {
    const hub = new DocumentHistoryHub();
    const first = hub.historyFor('level:ghz:1');
    hub.dispose('level:ghz:1');
    expect(hub.has('level:ghz:1')).toBe(false);
    expect(hub.historyFor('level:ghz:1')).not.toBe(first);
  });

  it('clearAll() empties the hub (project close)', () => {
    const hub = new DocumentHistoryHub();
    hub.historyFor('a');
    hub.historyFor('b');
    hub.clearAll();
    expect(hub.has('a')).toBe(false);
    expect(hub.has('b')).toBe(false);
  });
});
