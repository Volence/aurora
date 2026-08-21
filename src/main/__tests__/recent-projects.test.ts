// Recents store normalization + migration (the `proj` / `proj/` duplicate bug).
// The electron `app` is mocked to point userData at a temp dir so the real
// read→migrate→write-back cycle runs against a real file — the owner's store
// already contains duplicates, and the on-load migration must collapse them
// without manual cleanup.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { RecentProject } from '../../shared/ipc-types';

let userDataDir: string;

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'userData' ? userDataDir : tmpdir()) },
}));

// Import AFTER the mock so the module sees the mocked `app`.
import { getRecentProjects, addRecentProject, removeRecentProject, dedupeRecents } from '../recent-projects';

const storeFile = () => join(userDataDir, 'recent-projects.json');
const seed = (entries: RecentProject[]) => writeFileSync(storeFile(), JSON.stringify(entries, null, 2));

beforeEach(() => { userDataDir = mkdtempSync(join(tmpdir(), 'aurora-recents-')); });
afterEach(() => { rmSync(userDataDir, { recursive: true, force: true }); });

describe('dedupeRecents (pure migration)', () => {
  it('collapses lexical variants of one path, keeping the newest timestamp and its name', () => {
    const out = dedupeRecents([
      { path: '/home/u/proj', name: 'old-name', lastOpened: 100 },
      { path: '/home/u/proj/', name: 'new-name', lastOpened: 200 },
      { path: '/home/u/./proj', name: 'oldest', lastOpened: 50 },
    ]);
    expect(out).toEqual([{ path: '/home/u/proj', name: 'new-name', lastOpened: 200 }]);
  });

  it('orders by recency after the merge, newest first', () => {
    const out = dedupeRecents([
      { path: '/a', name: 'a', lastOpened: 100 },
      { path: '/b/', name: 'b', lastOpened: 300 },
      { path: '/b', name: 'b', lastOpened: 150 },
      { path: '/c', name: 'c', lastOpened: 200 },
    ]);
    expect(out.map((p) => p.path)).toEqual(['/b', '/c', '/a']);
    expect(out[0].lastOpened).toBe(300);
  });

  it('anti-vacuous: distinct paths do NOT collapse', () => {
    const out = dedupeRecents([
      { path: '/home/u/proj', name: 'p', lastOpened: 100 },
      { path: '/home/u/proj2', name: 'p2', lastOpened: 90 },
      { path: '/home/u/proj/sub', name: 'sub', lastOpened: 80 },
    ]);
    expect(out).toHaveLength(3);
  });
});

describe('store round-trip', () => {
  it('getRecentProjects migrates a duplicate-bearing store on load and persists the collapsed shape', () => {
    // The owner's actual store shape: same project twice, once with a trailing slash.
    seed([
      { path: '/home/u/proj/', name: 'proj', lastOpened: 200 },
      { path: '/home/u/other', name: 'other', lastOpened: 150 },
      { path: '/home/u/proj', name: 'proj', lastOpened: 100 },
    ]);
    const projects = getRecentProjects();
    expect(projects).toEqual([
      { path: '/home/u/proj', name: 'proj', lastOpened: 200 },
      { path: '/home/u/other', name: 'other', lastOpened: 150 },
    ]);
    // Write-back: the file itself is clean now, not just the returned value.
    expect(JSON.parse(readFileSync(storeFile(), 'utf-8'))).toEqual(projects);
  });

  it('an already-clean store is returned as-is and NOT rewritten', () => {
    const clean = [
      { path: '/home/u/proj', name: 'proj', lastOpened: 200 },
      { path: '/home/u/other', name: 'other', lastOpened: 100 },
    ];
    seed(clean);
    const before = readFileSync(storeFile(), 'utf-8');
    expect(getRecentProjects()).toEqual(clean);
    expect(readFileSync(storeFile(), 'utf-8')).toBe(before);
  });

  it('addRecentProject normalizes on write: proj/ refreshes proj instead of duplicating it', () => {
    seed([{ path: '/home/u/proj', name: 'proj', lastOpened: 100 }]);
    const projects = addRecentProject('/home/u/proj/', 'proj');
    expect(projects).toHaveLength(1);
    expect(projects[0].path).toBe('/home/u/proj');
    expect(projects[0].lastOpened).toBeGreaterThan(100);
  });

  it('addRecentProject normalizes .. and doubled separators too', () => {
    seed([{ path: '/home/u/proj', name: 'proj', lastOpened: 100 }]);
    expect(addRecentProject('/home/u//x/../proj', 'proj')).toHaveLength(1);
  });

  it('removeRecentProject removes by any lexical spelling', () => {
    seed([{ path: '/home/u/proj', name: 'proj', lastOpened: 100 }]);
    expect(removeRecentProject('/home/u/proj/')).toEqual([]);
  });

  it('distinct projects added separately both survive (anti-vacuous)', () => {
    addRecentProject('/home/u/proj', 'proj');
    const projects = addRecentProject('/home/u/proj2', 'proj2');
    expect(projects.map((p) => p.path)).toEqual(['/home/u/proj2', '/home/u/proj']);
  });
});
