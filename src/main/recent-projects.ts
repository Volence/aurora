import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
import type { RecentProject } from '../shared/ipc-types';
import type { RecentsState } from '../shared/recents';
import { recentsMayBeOverwritten } from '../shared/recents';
import { normalizeProjectPath } from '../shared/project-path';

const MAX_RECENT = 10;

function getStorePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json');
}

/**
 * Migration + invariant enforcement, pure so it's unit-testable: normalize
 * every stored path (the store predates normalization, so the owner's file
 * already holds `proj` and `proj/` as two rows) and collapse entries that
 * normalize to the same path, keeping the newest lastOpened per path (and the
 * name that came with that newest entry). Output is ordered by recency,
 * newest first — the order the list renders in.
 */
export function dedupeRecents(projects: RecentProject[]): RecentProject[] {
  const byPath = new Map<string, RecentProject>();
  for (const p of projects) {
    const path = normalizeProjectPath(p.path);
    const prev = byPath.get(path);
    if (!prev || p.lastOpened > prev.lastOpened) byPath.set(path, { ...p, path });
  }
  return [...byPath.values()].sort((a, b) => b.lastOpened - a.lastOpened).slice(0, MAX_RECENT);
}

/**
 * Salvage one stored row, or drop it.
 *
 * LENIENT PER ROW, on purpose and in the direction that keeps data: `path` is
 * the identity and the only thing a row cannot be repaired without, so a row
 * carrying a usable path but a missing name or a garbage timestamp is REPAIRED
 * (basename, epoch 0) rather than discarded. Dropping it would erase a project
 * the user really does have, on the next write, over a field the list can
 * reconstruct.
 *
 * A row-level defect is NOT a file-level one. See recentsMayBeOverwritten: the
 * file is still readable, and a store carrying one junk row must still be
 * writable or that one row strands the whole list.
 */
function salvageEntry(raw: unknown): RecentProject | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.path !== 'string' || row.path.trim() === '') return null;
  const path = row.path;
  const name = typeof row.name === 'string' && row.name !== ''
    ? row.name
    : (path.split('/').filter((s) => s !== '').pop() ?? path);
  const lastOpened = typeof row.lastOpened === 'number' && Number.isFinite(row.lastOpened)
    ? row.lastOpened
    : 0;
  return { path, name, lastOpened };
}

function unreadable(path: string, reason: string): RecentsState {
  // The reason reaches the console at the moment it happens, because the
  // renderer's toast is transient and this is the one place the full text
  // survives. Same rule as toastStore's error mirror.
  console.warn(`[recents] ${path} exists but could not be read: ${reason}`);
  return { projects: [], read: 'unreadable', reason, path, dropped: 0 };
}

/**
 * Read the store, and SAY WHICH OF THE THREE ANSWERS this was.
 *
 * ABSENCE COMES FROM THE READ ITSELF (an ENOENT/ENOTDIR errno), not from a
 * preceding `existsSync`. The old shape asked twice — `existsSync` and then
 * `readFileSync` inside a bare catch — which is one stat per call, a window in
 * which the answer can change between the two, and, worst, a catch whose single
 * `return []` was the same value the absent branch returned. Every non-absence
 * failure (a JSON syntax error from a hand-edit or an interrupted write, an
 * EACCES, an EISDIR, an EIO from a volume that dropped out) is now 'unreadable',
 * and every writer below refuses on it.
 */
export function readRecents(): RecentsState {
  const storePath = getStorePath();

  let text: string;
  try {
    text = readFileSync(storePath, 'utf-8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // ENOENT: no store yet. ENOTDIR: a path component above it is a file, so the
    // store cannot exist either — also a genuine absence, and a write will fail
    // loudly rather than destroy anything.
    if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') {
      return { projects: [], read: 'absent', reason: null, path: storePath, dropped: 0 };
    }
    return unreadable(storePath, e?.message ?? String(err));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return unreadable(storePath, `invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!Array.isArray(parsed)) {
    // Parses, is not a list. The old code's failure was one step later, when
    // dedupeRecents iterated it and threw into the same catch as everything else.
    return unreadable(storePath, 'the root of the store is not a JSON array');
  }

  const salvaged: RecentProject[] = [];
  let dropped = 0;
  for (const row of parsed) {
    const entry = salvageEntry(row);
    if (entry) salvaged.push(entry);
    else dropped++;
  }
  if (dropped > 0) console.warn(`[recents] ${storePath}: ${dropped} row(s) named no project and were ignored`);

  const projects = dedupeRecents(salvaged);
  // Persist the migrated shape so pre-normalization duplicates collapse once,
  // on disk, without manual cleanup. Cheap no-op check: same length and same
  // path sequence means nothing changed. This write needs no gate call: it is
  // inside the branch where the file PARSED, which is what the gate asks. The
  // invariant holds by construction rather than by a comment, and the two
  // callers below, which are not, ask the gate explicitly.
  if (projects.length !== salvaged.length || projects.some((p, i) => p.path !== salvaged[i].path)) {
    writeFileSync(storePath, JSON.stringify(projects, null, 2));
  }
  return { projects, read: 'read', reason: null, path: storePath, dropped };
}

function writeStore(state: RecentsState, projects: RecentProject[]): RecentsState {
  writeFileSync(state.path, JSON.stringify(projects, null, 2));
  // After a landed write the store exists and Aurora knows its contents, so the
  // answer is 'read' whatever it was a moment ago.
  return { projects, read: 'read', reason: null, path: state.path, dropped: 0 };
}

export function addRecentProject(path: string, name: string): RecentsState {
  path = normalizeProjectPath(path);
  const state = readRecents();
  // THE GATE. Without it this write is the destruction itself: the read answered
  // with an empty list because it could not see the file, and one unshift later
  // that emptiness is what lands on disk.
  if (!recentsMayBeOverwritten(state)) return state;

  // Remove existing entry for this path (readRecents already normalized the
  // stored side, so a plain string compare is exact), then add to front and trim.
  const projects = state.projects.filter((p) => p.path !== path);
  projects.unshift({ path, name, lastOpened: Date.now() });
  return writeStore(state, projects.slice(0, MAX_RECENT));
}

export function removeRecentProject(path: string): RecentsState {
  path = normalizeProjectPath(path);
  const state = readRecents();
  // The gate matters MORE here than on the add path, because the gesture behind
  // it is narrow: the user asked to drop ONE entry. Writing a list Aurora could
  // not read drops all of them instead, which is not a worse version of what was
  // asked for, it is the opposite of it.
  if (!recentsMayBeOverwritten(state)) return state;
  return writeStore(state, state.projects.filter((p) => p.path !== path));
}
