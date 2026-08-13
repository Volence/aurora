// Serialize/restore for the tab session (spec §10: sessions restore on
// reopen). Restore is defensive: corrupt/partial input yields a safe initial
// session; a session missing Home gets it re-injected; a dangling activeId
// falls back to Home. Storage itself (keyed by project path) is wired in the
// Stage 2 shell — these stay pure.
//
// Also owns the per-tab workspace record (facet + viewport), serialized
// alongside the session as an optional field. Its restore is defensive at the
// ENTRY level instead — a corrupt workspace entry drops just that entry,
// rather than restoreSession's whole-payload fallback to initialSession().

import { z } from 'zod';
import { HOME_TAB, initialSession, TAB_KINDS, type SessionState, type TabDescriptor } from './session';
import { FACET_CAPABILITIES, type FacetCapability } from '../project/adapter';

const persistedTabSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(TAB_KINDS),
  title: z.string(),
});

const persistedSessionSchema = z.looseObject({
  tabs: z.array(persistedTabSchema),
  activeId: z.string(),
});

/** Per-tab UI state persisted ALONGSIDE the session — deliberately not on
 *  TabDescriptor, so tab identity and the session reducers stay pure. */
export interface PersistedTabWorkspace {
  facet?: FacetCapability;
  view?: { x: number; y: number; zoom: number };
}
export type WorkspaceRecord = Record<string, PersistedTabWorkspace>;

const persistedWorkspaceSchema = z.strictObject({
  facet: z.enum(FACET_CAPABILITIES).optional(),
  view: z.strictObject({ x: z.number(), y: z.number(), zoom: z.number() }).optional(),
});

export function serializeSession(state: SessionState, workspace?: WorkspaceRecord): string {
  const payload: { tabs: TabDescriptor[]; activeId: string; workspace?: WorkspaceRecord } = {
    tabs: state.tabs,
    activeId: state.activeId,
  };
  if (workspace && Object.keys(workspace).length > 0) payload.workspace = workspace;
  return JSON.stringify(payload);
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

/** Defensive per-entry parse: a corrupt entry drops alone (the session itself
 *  is parsed independently by restoreSession — the two never fail together). */
export function restoreWorkspace(json: string): WorkspaceRecord {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return {}; }
  const ws = (parsed as { workspace?: unknown })?.workspace;
  if (ws === null || typeof ws !== 'object' || Array.isArray(ws)) return {};
  const out: WorkspaceRecord = {};
  for (const [id, entry] of Object.entries(ws as Record<string, unknown>)) {
    const res = persistedWorkspaceSchema.safeParse(entry);
    if (res.success && (res.data.facet !== undefined || res.data.view !== undefined)) out[id] = res.data;
  }
  return out;
}
