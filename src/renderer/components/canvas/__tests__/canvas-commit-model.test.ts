import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import {
  canvasChunkCapacity, defaultTargets, targetOptions, reportLines, refusalView,
} from '../canvas-commit-model';
import type { CommitReport, CommitRefusal } from '../../../../core/art/classic-commit-plan';
import { withCollision } from '../../../../core/art/commit-collision';
import type { CanvasCommitPlan } from '../../../../core/art/classic-commit-plan';
import { enigmaDecompress } from '../../../../core/formats/classic/enigma';

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

  it('describes what will happen, not what is missing, once the collision toggle is on', () => {
    const lines = reportLines(
      report({ blocksWithoutCollision: 3, blocksInheritedCollision: 1, cellsWithoutSolidity: 256 }),
      { blocks: 3, cells: 200, skippedOverhang: 0 },
    );
    const text = lines.join('\n');
    expect(text).toMatch(/3 will get flat \(\$FF\)/);
    expect(text).not.toMatch(/have none/);
    // 200, not 256: withCollision skips block-0 cells within an appended
    // chunk, so the applied count can be lower than cellsWithoutSolidity.
    expect(text).toMatch(/200 cells will become solid/);
  });
});

// --- the colind overhang in the preview -------------------------------------
//
// withCollision REFUSES to stamp a shape into a block whose id is past the end
// of the zone's collision table (spec §5 / CLASSIC-A4: in ROM those ids resolve
// into the ADJACENT zone's table, so stamping one silently changes other
// blocks' in-game collision — "must refuse or warn loudly, not proceed
// quietly"). The refusal is counted as `applied.skippedOverhang`; these tests
// pin that the PREVIEW states it — count and reason — and says nothing at all
// when nothing was skipped.
//
// Counts are DERIVED, never quoted: the synthetic cases pass a plan through the
// real `withCollision` and read `applied` back, and the GHZ case derives both
// of its numbers from the s1disasm files themselves.

const mintedBlock = (blockId: number) => ({
  blockId, colind: 0,
  def: { cells: Array.from({ length: 4 }, () => ({ tile: 0, xf: false, yf: false, pal: 0, pri: false })) },
});
const overhangPlan = (blockIds: number[]): CanvasCommitPlan => ({
  tileWrites: [],
  blockWrites: blockIds.map(mintedBlock),
  chunkWrites: [],
  chunkAppends: [],
  paletteWrites: null,
  report: {} as CanvasCommitPlan['report'],
}) as CanvasCommitPlan;

describe('reportLines and the colind overhang', () => {
  it('adds no line — and no claim of any kind — when nothing was skipped', () => {
    // Every id inside the table: withCollision skips nothing, and the preview
    // must not gain a reassuring "0 skipped" row in the common case.
    const applied = withCollision(overhangPlan([1, 2, 3]), 400).applied;
    expect(applied.skippedOverhang).toBe(0);
    const text = reportLines(report({ blocksWithoutCollision: 3 }), applied).join('\n');
    expect(text).not.toMatch(/skip/i);
    expect(text).not.toMatch(/overhang/i);
  });

  it('states the skip — count and the overhang reason — when blocks were refused', () => {
    // Two ids past a 400-entry table, one inside. The expected count is read
    // back from the transform that owns the rule, not asserted as a literal.
    const applied = withCollision(overhangPlan([5, 400, 401]), 400).applied;
    expect(applied.skippedOverhang).toBe([400, 401].length);
    const lines = reportLines(report({ blocksWithoutCollision: 3 }), applied);
    const line = lines.find((l) => l.startsWith('skipped:'));
    expect(line).toBe(
      'skipped: 2 blocks keep no shape — their ids are past the end of this zone\'s '
      + 'collision table; in ROM those entries resolve into the adjacent zone\'s table, '
      + 'so stamping one changes other blocks\' in-game collision',
    );
  });

  it('keeps its grammar when exactly one block was refused', () => {
    const applied = withCollision(overhangPlan([5, 400]), 400).applied;
    expect(applied.skippedOverhang).toBe(1);
    const line = reportLines(report({ blocksWithoutCollision: 2 }), applied)
      .find((l) => l.startsWith('skipped:'));
    expect(line).toMatch(/^skipped: 1 block keeps no shape — its id is past the end/);
  });
});

// GHZ against the real files. Both numbers are derived on the spot: the table
// length is the byte length of collide/GHZ.bin (decodeS1ColInd is `b.slice()`
// over a one-byte-per-entry file, src/core/formats/classic/s1-colind.ts), and
// the block count is the Enigma-decoded map16/GHZ.eni at 8 bytes per block
// (s1-io.ts's own stride). Gated like the compression goldens: the fixture
// tree is absent on CI.
const S1DIR = '/home/volence/sonic_hacks/s1disasm';
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = `${S1DIR} is absent — this machine has no s1disasm checkout, so these rows measure nothing`;
describe('reportLines over GHZ, the zone whose commits all overhang', { skip: !fs.existsSync(S1DIR), meta: { skipReason: S1_ABSENT } }, () => {
  it('states GHZ\'s whole overhang when a commit mints every id past the table', () => {
    const colindLength = fs.statSync(`${S1DIR}/collide/GHZ.bin`).size;
    const blockCount = Math.floor(
      enigmaDecompress(new Uint8Array(fs.readFileSync(`${S1DIR}/map16/GHZ.eni`))).length / 8,
    );
    const overhang = blockCount - colindLength;
    // GHZ really does ship more blocks than table entries — the premise of the
    // whole hazard, asserted rather than assumed.
    expect(overhang).toBeGreaterThan(0);

    const ids = Array.from({ length: overhang }, (_, i) => colindLength + i);
    const applied = withCollision(overhangPlan(ids), colindLength).applied;
    expect(applied.skippedOverhang).toBe(overhang);

    const lines = reportLines(report({ blocksWithoutCollision: overhang }), applied);
    const line = lines.find((l) => l.startsWith('skipped:'));
    expect(line).toBeDefined();
    expect(line).toMatch(new RegExp(`^skipped: ${overhang} blocks keep no shape`));
    expect(line).toMatch(/past the end of this zone's collision table/);
    expect(line).toMatch(/adjacent zone's table/);
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
