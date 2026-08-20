import { describe, it, expect } from 'vitest';
import { serializeSession, restoreSession, restoreWorkspace } from '../session-persistence';
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

  it('round-trips the per-tab workspace record (facet + viewport)', () => {
    const s = openTab(initialSession(), { id: 'level:ojz:act1', kind: 'level', title: 'OJZ act1' });
    const ws = { 'level:ojz:act1': { facet: 'collision', view: { x: 128, y: 64, zoom: 2 } } } as const;
    const json = serializeSession(s, ws);
    expect(restoreSession(json).tabs).toHaveLength(2);
    expect(restoreWorkspace(json)).toEqual(ws);
  });

  it('restoreWorkspace is defensive: corrupt entries and unknown facets are dropped', () => {
    const json = JSON.stringify({
      tabs: [], activeId: 'home',
      workspace: {
        ok: { facet: 'layout' },
        badFacet: { facet: 'nonsense' },
        badView: { view: { x: 'NaN' } },
      },
    });
    expect(restoreWorkspace(json)).toEqual({ ok: { facet: 'layout' } });
  });

  it('round-trips a sprite tab\'s S1ZoneKey — the identity a restored checkout re-runs from', () => {
    const s = openTab(initialSession(), { id: 'doc:sprite:s1:64', kind: 'sprite-doc', title: 'Moto Bug' });
    const ws = { 'doc:sprite:s1:64': { s1Zone: { zone: 'ghz', act: 1 } } } as const;
    const json = serializeSession(s, ws);
    expect(restoreWorkspace(json)).toEqual(ws);
  });

  it('an s1Zone-only entry is KEPT (it must survive without facet/view beside it)…', () => {
    // …and a corrupt one drops alone, exactly like a bad facet/view: a
    // zone-scoped sprite tab with a mangled key falls back to the deferral
    // pane, never to a checkout against garbage.
    const json = JSON.stringify({
      tabs: [], activeId: 'home',
      workspace: {
        ok: { s1Zone: { zone: 'slz', act: 2 } },
        emptyZone: { s1Zone: { zone: '', act: 1 } },
        fractionalAct: { s1Zone: { zone: 'ghz', act: 1.5 } },
        extraField: { s1Zone: { zone: 'ghz', act: 1, extra: true } },
      },
    });
    expect(restoreWorkspace(json)).toEqual({ ok: { s1Zone: { zone: 'slz', act: 2 } } });
  });

  it('restoreWorkspace on a legacy payload (no workspace key) is empty, and legacy sessions still restore', () => {
    const legacy = JSON.stringify({ tabs: [], activeId: 'home' });
    expect(restoreWorkspace(legacy)).toEqual({});
    expect(restoreSession(legacy).tabs).toEqual([HOME_TAB]);
  });
});
