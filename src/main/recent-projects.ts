import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { RecentProject } from '../shared/ipc-types';
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

export function getRecentProjects(): RecentProject[] {
  const storePath = getStorePath();
  if (!existsSync(storePath)) return [];

  try {
    const data = readFileSync(storePath, 'utf-8');
    const raw: RecentProject[] = JSON.parse(data);
    const projects = dedupeRecents(raw);
    // Persist the migrated shape so pre-normalization duplicates collapse once,
    // on disk, without manual cleanup. Cheap no-op check: same length and same
    // path sequence means nothing changed.
    if (projects.length !== raw.length || projects.some((p, i) => p.path !== raw[i].path)) {
      writeFileSync(storePath, JSON.stringify(projects, null, 2));
    }
    return projects;
  } catch {
    return [];
  }
}

export function addRecentProject(path: string, name: string): RecentProject[] {
  path = normalizeProjectPath(path);
  let projects = getRecentProjects();

  // Remove existing entry for this path (getRecentProjects already normalized
  // the stored side, so a plain string compare is exact).
  projects = projects.filter((p) => p.path !== path);

  // Add to front
  projects.unshift({ path, name, lastOpened: Date.now() });

  // Trim to max
  projects = projects.slice(0, MAX_RECENT);

  writeFileSync(getStorePath(), JSON.stringify(projects, null, 2));
  return projects;
}

export function removeRecentProject(path: string): RecentProject[] {
  path = normalizeProjectPath(path);
  let projects = getRecentProjects();
  projects = projects.filter((p) => p.path !== path);
  writeFileSync(getStorePath(), JSON.stringify(projects, null, 2));
  return projects;
}
