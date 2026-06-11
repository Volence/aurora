import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import type { RecentProject } from '../shared/ipc-types';

const MAX_RECENT = 10;

function getStorePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json');
}

export function getRecentProjects(): RecentProject[] {
  const storePath = getStorePath();
  if (!existsSync(storePath)) return [];

  try {
    const data = readFileSync(storePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function addRecentProject(path: string, name: string): RecentProject[] {
  let projects = getRecentProjects();

  // Remove existing entry for this path
  projects = projects.filter((p) => p.path !== path);

  // Add to front
  projects.unshift({ path, name, lastOpened: Date.now() });

  // Trim to max
  projects = projects.slice(0, MAX_RECENT);

  writeFileSync(getStorePath(), JSON.stringify(projects, null, 2));
  return projects;
}

export function removeRecentProject(path: string): RecentProject[] {
  let projects = getRecentProjects();
  projects = projects.filter((p) => p.path !== path);
  writeFileSync(getStorePath(), JSON.stringify(projects, null, 2));
  return projects;
}
