// Serialize/restore for the tab session (spec §10: sessions restore on
// reopen). Restore is defensive: corrupt/partial input yields a safe initial
// session; a session missing Home gets it re-injected; a dangling activeId
// falls back to Home. Storage itself (keyed by project path) is wired in the
// Stage 2 shell — these stay pure.

import { z } from 'zod';
import { HOME_TAB, initialSession, type SessionState, type TabDescriptor } from './session';

const persistedTabSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['home', 'level', 'sprite-doc', 'art-doc', 'palette-doc', 'tool']),
  title: z.string(),
});

const persistedSessionSchema = z.looseObject({
  tabs: z.array(persistedTabSchema),
  activeId: z.string(),
});

export function serializeSession(state: SessionState): string {
  return JSON.stringify({ tabs: state.tabs, activeId: state.activeId });
}

export function restoreSession(json: string): SessionState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return initialSession();
  }
  const res = persistedSessionSchema.safeParse(parsed);
  if (!res.success) return initialSession();

  // Normalize (hand-edited/corrupt storage only — openTab can't produce
  // these): the canonical Home tab is always index 0, any persisted
  // home-kinded or home-id'd variant is replaced by it, and duplicate ids
  // keep their first occurrence.
  const seen = new Set<string>([HOME_TAB.id]);
  const tabs: TabDescriptor[] = [HOME_TAB];
  for (const t of res.data.tabs) {
    if (t.kind === 'home' || seen.has(t.id)) continue;
    seen.add(t.id);
    tabs.push(t);
  }
  const activeId = tabs.some((t) => t.id === res.data.activeId) ? res.data.activeId : HOME_TAB.id;
  return { tabs, activeId };
}
