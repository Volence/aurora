// src/renderer/shell/session-storage.ts
// Session persistence keyed by project path (spec §10). Storage is injected
// (localStorage in the app; a Map in tests — the vitest env has no DOM).
// The stored payload format is owned by core/shell/session-persistence; this
// module owns only WHERE it lives and the restore-time pruning against the
// currently-open project. The per-tab workspace record (Stage 3: facet +
// viewport) rides in the SAME aurora.session.v1 payload as an optional field,
// not a re-key: legacy payloads restore fine because restoreSession's
// looseObject schema ignores an unknown `workspace` key and restoreWorkspace
// returns {} when it's absent. The v1 key remains available for a genuinely
// breaking future format.

import {
  initialSession, openTab, pruneSession,
  type SessionState, type TabDescriptor,
} from '../../core/shell/session';
import { serializeSession, restoreSession, restoreWorkspace, type WorkspaceRecord } from '../../core/shell/session-persistence';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function sessionKeyFor(projectKey: string | null): string {
  return `aurora.session.v1:${projectKey ?? 'no-project'}`;
}

/** null = nothing stored for this project (caller builds the default). */
export function loadStoredSession(
  storage: StorageLike,
  projectKey: string | null,
  isValid: (tab: TabDescriptor) => boolean,
): SessionState | null {
  let raw: string | null;
  try {
    raw = storage.getItem(sessionKeyFor(projectKey));
  } catch {
    return null;
  }
  if (raw === null) return null;
  return pruneSession(restoreSession(raw), isValid);
}

export function saveStoredSession(
  storage: StorageLike,
  projectKey: string | null,
  state: SessionState,
  workspace?: WorkspaceRecord,
): void {
  try {
    storage.setItem(sessionKeyFor(projectKey), serializeSession(state, workspace));
  } catch {
    // Storage unavailable (quota/privacy) — session just won't restore.
  }
}

/** {} when nothing stored / storage unavailable. */
export function loadStoredWorkspace(storage: StorageLike, projectKey: string | null): WorkspaceRecord {
  let raw: string | null;
  try { raw = storage.getItem(sessionKeyFor(projectKey)); } catch { return {}; }
  if (raw === null) return {};
  return restoreWorkspace(raw);
}

/** First open of a project with no stored session: Home + its first level, focused. */
export function defaultProjectSession(firstLevel: TabDescriptor | null): SessionState {
  const s = initialSession();
  return firstLevel ? openTab(s, firstLevel) : s;
}
