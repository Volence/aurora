// Recents store normalization + migration (the `proj` / `proj/` duplicate bug).
// The electron `app` is mocked to point userData at a temp dir so the real
// read→migrate→write-back cycle runs against a real file — the owner's store
// already contains duplicates, and the on-load migration must collapse them
// without manual cleanup.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, chmodSync } from 'fs';
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

// ---------------------------------------------------------------------------
// UNREADABLE IS NOT ABSENT (lens row RECENTS-CORRUPT-ERASED)
//
// Every row above this line seeds a WELL-FORMED store, which is exactly why
// eleven of them could not see the defect: getRecentProjects answers `[]` for a
// JSON syntax error, for an EACCES and for a genuine first run alike, and
// addRecentProject / removeRecentProject read through that and write the
// emptiness back unconditionally. The user's list is gone, with no gesture
// behind it and no notice in front of it.
//
// EVERY ROW HERE ASSERTS ON THE FILE, not on the returned value: the returned
// value is what the old code got wrong, so asserting the bytes on disk is what
// asks the question the user cares about.
//
// The two CONTROL rows at the end are the other half. A fix that simply refuses
// to write whenever the read produced no entries satisfies every row above them
// and breaks the store's whole job, so they are in this file on purpose.
// ---------------------------------------------------------------------------

const seedRaw = (text: string) => writeFileSync(storeFile(), text);
const raw = () => readFileSync(storeFile(), 'utf-8');

describe('a store Aurora could not read is not a store with nothing in it', () => {
  it('a syntax error in the store survives the next project open', () => {
    // A hand-edit, or a write interrupted by a crash. One trailing comma.
    const corrupt = '[\n  { "path": "/home/u/proj", "name": "proj", "lastOpened": 200 },\n]';
    seedRaw(corrupt);
    addRecentProject('/home/u/new', 'new');
    expect(raw()).toBe(corrupt);
  });

  it('a JSON root that is not an array survives the next project open', () => {
    // Parses fine, is not a recents list. dedupeRecents iterating it is the
    // failure, and the old catch spelled that failure `[]` too.
    const wrongShape = '{ "recents": [ { "path": "/home/u/proj", "name": "proj", "lastOpened": 1 } ] }';
    seedRaw(wrongShape);
    addRecentProject('/home/u/new', 'new');
    expect(raw()).toBe(wrongShape);
  });

  it('a store that cannot be READ but can be WRITTEN survives the next project open', (ctx) => {
    // The mode bits are the point: 0o200 makes readFileSync fail EACCES while
    // writeFileSync still succeeds, and that is the one arrangement where the
    // old code DESTROYS rather than merely crashing on the way out. Same
    // mechanism as an ACL, a parent directory without execute, or a volume that
    // dropped out mid-session; this is the version a test can construct on any
    // filesystem.
    if (process.getuid?.() === 0) {
      ctx.skip('running as root: mode bits do not deny root a read, so no EACCES can be constructed here');
      return;
    }
    const original = '[\n  { "path": "/home/u/proj", "name": "proj", "lastOpened": 200 }\n]';
    seedRaw(original);
    chmodSync(storeFile(), 0o200);
    try {
      addRecentProject('/home/u/new', 'new');
    } finally {
      chmodSync(storeFile(), 0o600);
    }
    expect(raw()).toBe(original);
  });

  it('removeRecentProject removes NOTHING when it cannot read the store', () => {
    // The worst intent-to-outcome gap in the file: the user asks to drop one
    // entry and the old code drops every entry it could not see.
    const corrupt = '[ { "path": "/home/u/proj", "name": "proj", "lastOpened": 200 }, ]';
    seedRaw(corrupt);
    removeRecentProject('/home/u/other');
    expect(raw()).toBe(corrupt);
  });

  it('CONTROL: a readable store carrying one junk row is still written, and the good row survives', () => {
    // Readability is the question, never "was anything wrong". A store with one
    // unusable row is a store Aurora CAN see: the junk row is dropped and the
    // write must still happen, or one bad row strands the whole list.
    seedRaw('[ { "path": "/home/u/proj", "name": "proj", "lastOpened": 200 }, 42 ]');
    addRecentProject('/home/u/new', 'new');
    const onDisk = JSON.parse(raw()) as RecentProject[];
    expect(onDisk.map((p) => p.path)).toContain('/home/u/new');
    expect(onDisk.map((p) => p.path)).toContain('/home/u/proj');
  });

  it('CONTROL: a genuinely absent store is still created by the first project open', () => {
    // 'absent' is a positive reason to WRITE. A fix that refused whenever the
    // read produced no entries would leave a first run unable to record
    // anything at all, forever.
    addRecentProject('/home/u/proj', 'proj');
    const onDisk = JSON.parse(raw()) as RecentProject[];
    expect(onDisk.map((p) => p.path)).toEqual(['/home/u/proj']);
  });
});
