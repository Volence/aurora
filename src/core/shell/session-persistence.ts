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

  let tabs: TabDescriptor[] = res.data.tabs;
  if (!tabs.some((t) => t.id === HOME_TAB.id)) tabs = [HOME_TAB, ...tabs];
  const activeId = tabs.some((t) => t.id === res.data.activeId) ? res.data.activeId : HOME_TAB.id;
  return { tabs, activeId };
}
