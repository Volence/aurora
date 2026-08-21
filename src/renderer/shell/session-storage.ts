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
import { normalizeProjectPath } from '../../shared/project-path';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SESSION_KEY_PREFIX = 'aurora.session.v1:';

export function sessionKeyFor(projectKey: string | null): string {
  // Normalized HERE, the one function both save and load derive the key from:
  // keying by the raw string gave `proj` and `proj/` two different sessions,
  // so which one restored depended on which spelling the project was opened
  // with (dialog vs. recents vs. agent). Lexical only — see project-path.ts.
  return `${SESSION_KEY_PREFIX}${projectKey === null ? 'no-project' : normalizeProjectPath(projectKey)}`;
}

/** localStorage's shape; the injected StorageLike is only the get/set subset. */
export interface EnumerableStorageLike extends StorageLike {
  readonly length: number;
  key(index: number): string | null;
  removeItem(key: string): void;
}

/**
 * One-shot migration for sessions saved before keys were normalized: any
 * `aurora.session.v1:` entry whose path suffix normalizes to a different
 * string is moved to the normalized key (so the session is NOT orphaned by the
 * key change). When both spellings hold a session, the already-normalized one
 * wins — payloads carry no timestamp to compare, and the normalized key is the
 * one every post-fix save writes to. Best-effort: a throwing storage leaves
 * things as they were.
 */
export function migrateSessionKeys(storage: EnumerableStorageLike): void {
  try {
    const moves: Array<[from: string, to: string]> = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key === null || !key.startsWith(SESSION_KEY_PREFIX)) continue;
      const suffix = key.slice(SESSION_KEY_PREFIX.length);
      if (suffix === 'no-project') continue;
      const normalized = normalizeProjectPath(suffix);
      if (normalized !== suffix) moves.push([key, SESSION_KEY_PREFIX + normalized]);
    }
    // Second pass: removeItem during the index walk above would shift indices.
    for (const [from, to] of moves) {
      const payload = storage.getItem(from);
      if (payload !== null && storage.getItem(to) === null) storage.setItem(to, payload);
      storage.removeItem(from);
    }
  } catch {
    // Storage unavailable (privacy mode/quota) — sessions already degrade to
    // defaults in that case; the migration just doesn't happen.
  }
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
