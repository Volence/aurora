import { describe, it, expect } from 'vitest';
import {
  canvasChunkCapacity, defaultTargets, targetOptions, reportLines, refusalView,
} from '../canvas-commit-model';
import type { CommitReport, CommitRefusal } from '../../../../core/art/classic-commit-plan';

describe('canvasChunkCapacity', () => {
  it('counts whole chunks only, and reports the remainder rather than rounding', () => {
    expect(canvasChunkCapacity(512, 256)).toEqual({
      wide: 2, high: 1, total: 2, remainderX: 0, remainderY: 0,
    });
    expect(canvasChunkCapacity(300, 260)).toEqual({
      wide: 1, high: 1, total: 1, remainderX: 44, remainderY: 4,
    });
  });

  it('reports zero committable chunks for a canvas smaller than one', () => {
    expect(canvasChunkCapacity(128, 128).total).toBe(0);
  });

  it('caps at 16 for the largest canvas — 1024px is 4 chunks a side', () => {
    expect(canvasChunkCapacity(1024, 1024).total).toBe(16);
  });
});

describe('defaultTargets', () => {
  it('appends by default — never silently replaces existing art', () => {
    expect(defaultTargets(3)).toEqual([
      { chunkFileIndex: null }, { chunkFileIndex: null }, { chunkFileIndex: null },
    ]);
  });
});

describe('targetOptions', () => {
  it('offers append first, then each chunk by ENGINE id', () => {
    const rows = targetOptions(2);
    expect(rows[0]).toEqual({ value: null, label: 'Append as new chunk' });
    // File index 0 is engine id $01 — the label must not show the file index.
    expect(rows[1]).toEqual({ value: 0, label: 'Replace chunk $01' });
    expect(rows[2]).toEqual({ value: 1, label: 'Replace chunk $02' });
  });
});

const report = (over: Partial<CommitReport> = {}): CommitReport => ({
  tilesNew: 4, tilesReused: 2, tilesReclaimed: 0,
  blocksNew: 3, blocksReused: 1, blocksReclaimed: 0, blocksZeroed: 0,
  chunksReplaced: 0, chunksAppended: 1,
  blocksInheritedCollision: 0, blocksWithoutCollision: 0,
  cellsInheritedSolidity: 0, cellsWithoutSolidity: 0,
  poolBefore: { tiles: 965, blocks: 439, chunks: 60 },
  poolAfter: { tiles: 965, blocks: 442, chunks: 61 },
  warnings: [],
  ...over,
});

describe('reportLines', () => {
  it('states tiles, blocks, chunks and the pool movement', () => {
    const lines = reportLines(report());
    expect(lines[0]).toBe('tiles: 4 new · 2 reused · 0 reclaimed');
    expect(lines[3]).toBe('pool: 439 → 442 blocks · 60 → 61 chunks');
  });

  it('always says so when any block has no collision', () => {
    const lines = reportLines(report({ blocksWithoutCollision: 3, blocksInheritedCollision: 1 }));
    expect(lines.join('\n')).toMatch(/3 have none/);
  });

  it('says collision is fully inherited when it is', () => {
    const lines = reportLines(report({ blocksInheritedCollision: 5 }));
    expect(lines.join('\n')).toMatch(/all 5 inherited/);
  });

  it('mentions missing solidity, which is the tier that gates collision entirely', () => {
    const lines = reportLines(report({ cellsWithoutSolidity: 256 }));
    expect(lines.join('\n')).toMatch(/solidity: 256 cells have none/);
  });
});

describe('refusalView', () => {
  it('offers both resolutions for ordinary palette drift', () => {
    const v = refusalView({ kind: 'palette-drift', entries: [21], touchesLine0: false });
    expect(v.offers).toEqual(['use-act-colours', 'adopt-into-zone']);
    expect(v.message).toMatch(/line 1 entry 5/);
  });

  it('offers NOTHING for line 0 drift, and says why', () => {
    const v = refusalView({ kind: 'palette-drift', entries: [3], touchesLine0: true });
    expect(v.offers).toEqual([]);
    expect(v.message).toMatch(/Sonic/);
  });

  it('truncates a long entry list rather than printing sixty of them', () => {
    const v = refusalView({
      kind: 'palette-drift', entries: [17, 18, 19, 20, 21, 22, 23, 24], touchesLine0: false,
    });
    expect(v.message).toMatch(/and 2 more/);
  });

  it('tells an exhausted commit that replacing more chunks reclaims their art', () => {
    const v = refusalView({
      kind: 'tiles-exhausted', needed: 90, available: 20, reclaimed: 4, free: 16,
    });
    expect(v.resolution).toMatch(/Replace more chunks/);
  });

  it('tells an unknown-predicate refusal that appending still works', () => {
    const v = refusalView({ kind: 'predicates-unknown', which: ['object tile reservations'] });
    expect(v.resolution).toMatch(/Appending works/);
  });

  it('gives every refusal kind a non-empty message and resolution', () => {
    const all: CommitRefusal[] = [
      { kind: 'region-misaligned', detail: 'x' },
      { kind: 'region-out-of-bounds', detail: 'x' },
      { kind: 'target-count', expected: 1, got: 0 },
      { kind: 'cell-clash', cells: [] },
      { kind: 'palette-drift', entries: [1], touchesLine0: false },
      { kind: 'palette-unmappable', entries: [1] },
      { kind: 'predicates-unknown', which: ['x'] },
      { kind: 'tiles-exhausted', needed: 1, available: 0, reclaimed: 0, free: 0 },
      { kind: 'blocks-exhausted', needed: 1, ceiling: 1024 },
      { kind: 'chunks-exhausted', needed: 1, ceiling: 127 },
    ];
    for (const r of all) {
      const v = refusalView(r);
      expect(v.message.length, r.kind).toBeGreaterThan(10);
      expect(v.resolution.length, r.kind).toBeGreaterThan(10);
    }
  });
});
