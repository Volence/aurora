import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileAccess } from '../../project/adapter';
import { s1Profile, type LevelAct } from '../../project/profiles/s1';
import {
  readS1Level,
  writeS1Level,
  type ResolvedLevelPaths,
} from '../s1-io';
import { decodeS1Objpos } from '../../formats/classic/s1-objpos';
import { nemesisCompress, nemesisDecompress } from '../../compress/nemesis';
import { enigmaCompress, enigmaDecompress } from '../../formats/classic/enigma';
import { kosinskiCompress, kosinskiDecompress } from '../../formats/kosinski';
import { referenceCheckout, referenceCheckoutReason, referencePath } from '../../../../test/support/fixture-tree';

// ---------------------------------------------------------------------------
// Fakes / helpers
// ---------------------------------------------------------------------------

function memFs(files: Record<string, Uint8Array>): FileAccess {
  const map = new Map(Object.entries(files));
  return {
    async exists(rel) {
      return map.has(rel);
    },
    async read(rel) {
      const b = map.get(rel);
      if (!b) throw new Error(`no such file: ${rel}`);
      return b;
    },
    async list() {
      return [];
    },
  };
}

/** memFs plus an mtime provider driven by a path→mtimeMs table (missing → null). */
function memFsWithMtime(files: Record<string, Uint8Array>, mtimes: Record<string, number>): FileAccess {
  return {
    ...memFs(files),
    async mtime(rel) {
      return rel in mtimes ? mtimes[rel] : null;
    },
  };
}

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason('s1disasm');
const S1_PRESENT = referenceCheckout('s1disasm');

function realFs(root: string): FileAccess {
  return {
    async exists(rel) {
      return fs.existsSync(path.join(root, rel));
    },
    async read(rel) {
      return new Uint8Array(fs.readFileSync(path.join(root, rel)));
    },
    async list(rel) {
      return fs.readdirSync(path.join(root, rel));
    },
  };
}

/** Mirror the adapter's REV/exists resolution against real disk. */
function resolveVariant(v: { path: string; rev00Path?: string }): string {
  if (fs.existsSync(path.join(S1DIR, v.path))) return v.path;
  if (v.rev00Path && fs.existsSync(path.join(S1DIR, v.rev00Path))) return v.rev00Path;
  return v.path; // caller will fail loudly on a genuine miss
}
function resolveSingle(p: string): string | undefined {
  return fs.existsSync(path.join(S1DIR, p)) ? p : undefined;
}

/**
 * `resolveSingle` for the REQUIRED files, failing in this file's own words.
 *
 * The `resolveSingle(t)!` this replaces handed `undefined` to `path.join`, and
 * the whole block died with
 *
 *     TypeError: The "path" argument must be of type string. Received undefined
 *
 * which names no file, no directory and no checkout — 21 rows of it, measured
 * 2026-08-30 against a checkout holding `sonic.asm`/`_maps`/`levels` and none of
 * the level data. A reader of that trace has no reason to suspect their tree;
 * they go looking for a path bug in Aurora. The `!` was the defect: it asserted
 * a fact the guard above does not establish.
 */
function requireSingle(p: string): string {
  const r = resolveSingle(p);
  if (r === undefined) {
    throw new Error(
      `${path.join(S1DIR, p)} is missing — this checkout has the top-level markers but not `
      + 'this file, so the row below cannot measure anything. It is an INCOMPLETE s1disasm '
      + 'checkout, not an Aurora defect.',
    );
  }
  return r;
}

function realPaths(act: LevelAct): ResolvedLevelPaths {
  return {
    tiles: act.tiles.map((t) => requireSingle(t)),
    blocks: resolveVariant(act.blocks),
    chunks: resolveVariant(act.chunks),
    colind: resolveVariant(act.colind),
    fg: resolveVariant(act.fgLayout),
    bg: resolveVariant(act.bgLayout),
    objpos: resolveVariant(act.objpos),
    startpos: resolveVariant(act.startpos),
    palette: act.palette.map((c) => requireSingle(c.file)),
    animatedArt: act.animatedArt.map((a) => resolveSingle(a.file)),
    collisionNormal: s1Profile.collision.normal,
    collisionAngleMap: s1Profile.collision.angleMap,
  };
}

interface ActRef {
  zone: string;
  act: LevelAct;
}
function allActs(): ActRef[] {
  const out: ActRef[] = [];
  for (const z of s1Profile.zones) for (const a of z.acts) out.push({ zone: z.id, act: a });
  return out;
}

const ALL_DIRTY = {
  tiles: true,
  blocks: true,
  chunks: true,
  fg: true,
  bg: true,
  objects: true,
  palette: true,
  colind: true,
  start: true,
} as const;

function readDisk(rel: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(S1DIR, rel)));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ===========================================================================
// (a) GHZ1 golden
// ===========================================================================

describe('s1-io (a) GHZ1 golden', () => {
  it('reads a full GHZ act 1 LevelDoc from real files', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, async () => {
    const fa = realFs(S1DIR);
    const act = s1Profile.zones[0].acts[0];
    const { doc } = await readS1Level(act, realPaths(act), fa);

    // tiles: at least the concatenated two-file decoded size.
    const concat = act.tiles.reduce((n, t) => n + nemesisDecompress(readDisk(t)).length, 0);
    expect(doc.tiles.length).toBeGreaterThanOrEqual(concat);

    // fg dims read straight from the header bytes of levels/ghz1.bin.
    const fgRaw = readDisk('levels/ghz1.bin');
    expect(doc.fg.width).toBe(fgRaw[0] + 1);
    expect(doc.fg.height).toBe(fgRaw[1] + 1);
    expect(doc.fg.width).toBe(48);
    expect(doc.fg.height).toBe(5);

    expect(doc.objects.length).toBeGreaterThan(0);

    // palette: line0 word0 from Sonic.bin, line1 word0 from Green Hill Zone.bin.
    const son = readDisk('palette/Sonic.bin');
    const ghz = readDisk('palette/Green Hill Zone.bin');
    expect(doc.palettes[0][0]).toBe((son[0] << 8) | son[1]);
    expect(doc.palettes[1][0]).toBe((ghz[0] << 8) | ghz[1]);

    // blocks / chunks sanity.
    expect(doc.blocks.length).toBeGreaterThan(0);
    doc.blocks.forEach((b) => expect(b.cells.length).toBe(4));
    expect(doc.chunks.length).toBeGreaterThan(0);
    doc.chunks.forEach((c) => expect(c.cells.length).toBe(256));

    // sourceRefs populated.
    expect(Object.keys(doc.sourceRefs).length).toBeGreaterThan(5);
    expect(doc.sourceRefs.blocks).toBe('map16/GHZ.eni');
  });
});

// ===========================================================================
// (b) Numeric-transcription audit across ALL 18 acts
// ===========================================================================

describe('s1-io (b) numeric audit (all 18 acts)', () => {
  it('palette components never overlap on destOffset within an act', () => {
    for (const { zone, act } of allActs()) {
      const covered = new Set<number>();
      for (const c of act.palette) {
        for (let w = 0; w < c.length; w++) {
          const d = c.destOffset + w;
          expect(covered.has(d), `${zone} act${act.act} palette dest ${d} overlaps`).toBe(false);
          covered.add(d);
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThan(64);
        }
      }
    }
  });

  it('animated-art tile ranges never overlap within an act', () => {
    for (const { zone, act } of allActs()) {
      const covered = new Set<number>();
      for (const a of act.animatedArt) {
        for (let t = a.vramTileIndex; t < a.vramTileIndex + a.tileCount; t++) {
          expect(
            covered.has(t),
            `${zone} act${act.act} anim tile ${t.toString(16)} overlaps`,
          ).toBe(false);
          covered.add(t);
        }
      }
    }
  });

  it('read() succeeds on every act', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, async () => {
    const fa = realFs(S1DIR);
    for (const { zone, act } of allActs()) {
      const { doc } = await readS1Level(act, realPaths(act), fa);
      expect(doc.game, `${zone} act${act.act}`).toBe('s1');
      expect(doc.blocks.length).toBeGreaterThan(0);
      expect(doc.chunks.length).toBeGreaterThan(0);
      expect(doc.palettes.length).toBe(4);
    }
  });
});

// ===========================================================================
// (c) Zero-edit round-trip across ALL 18 acts
// ===========================================================================

function isCompressed(p: string): 'nem' | 'eni' | 'kos' | null {
  if (p.endsWith('.nem')) return 'nem';
  if (p.endsWith('.eni')) return 'eni';
  if (p.endsWith('.kos')) return 'kos';
  return null;
}
function decodeFor(kind: 'nem' | 'eni' | 'kos', b: Uint8Array): Uint8Array {
  if (kind === 'nem') return nemesisDecompress(b);
  if (kind === 'eni') return enigmaDecompress(b);
  return kosinskiDecompress(b);
}

/**
 * The set of files a save with EVERY domain dirty must emit, derived from the
 * resolved paths rather than counted: writeS1Level emits each pristine tile
 * file, the seven single-path domains, and one buffer per distinct palette
 * component file. Used as the per-act non-vacuity gate — without it a case
 * whose writer emitted nothing would sail through the comparison loop below
 * with zero iterations and report green.
 */
function expectedWrittenPaths(p: ResolvedLevelPaths): Set<string> {
  return new Set<string>([
    ...p.tiles,
    p.blocks,
    p.chunks,
    p.fg,
    p.bg,
    p.objpos,
    p.startpos,
    p.colind,
    ...p.palette,
  ]);
}

/**
 * ONE CASE PER ACT, DELIBERATELY — this is the fix for the load-dependent
 * flake, not a stylistic split.
 *
 * As a single 18-act loop this spent ~986ms of a 5000ms default budget (5.1x
 * headroom), and under CPU oversubscription that headroom was not enough: the
 * run blew the wall clock and reported `Test timed out in 5000ms`, an error
 * that is indistinguishable from a real regression. Per act the same work costs
 * 40-71ms (measured across all 18; the spread tracks tile/block counts), so each
 * case now carries 70-125x headroom against the SAME untouched default timeout.
 * No magic number was introduced and none was raised; the load sensitivity is
 * gone structurally, and a genuinely slow act now names itself instead of
 * merging into one timeout.
 */
describe('s1-io (c) zero-edit round-trip (all 18 acts)', () => {
  const roundTripCases = allActs().map(({ zone, act }) => ({
    name: `${zone} act${act.act}`,
    zone,
    act,
  }));

  /** Incremented by each case body; the coverage gate below reads it. */
  let actsExercised = 0;

  it.each(roundTripCases)(
    '$name re-encodes every domain identically (decode-identical for compressed)',
    { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } },
    async ({ zone, act }) => {
      // Counted here, at the top: the gate below asks "did every act's body
      // RUN", not "did every act pass". A genuine round-trip regression must
      // show up as the failing acts and nothing else — not as an extra, and
      // false, "an act was dropped".
      actsExercised++;
      const fa = realFs(S1DIR);
      const paths = realPaths(act);
      const state = await readS1Level(act, paths, fa);
      const result = writeS1Level(state, ALL_DIRTY);
      expect(result.errors, `${zone} act${act.act}: ${JSON.stringify(result.errors)}`).toEqual([]);

      // Non-vacuity: the comparison loop below must have something to compare,
      // and it must cover every domain the save claims to write.
      expect(
        new Set(result.files.map((f) => f.path)),
        `${zone} act${act.act}: written file set`,
      ).toEqual(expectedWrittenPaths(paths));

      for (const f of result.files) {
        const disk = readDisk(f.path);
        const kind = isCompressed(f.path);
        if (kind) {
          expect(
            bytesEqual(decodeFor(kind, f.bytes), decodeFor(kind, disk)),
            `${zone} act${act.act} ${f.path}: decode mismatch`,
          ).toBe(true);
        } else {
          expect(bytesEqual(f.bytes, disk), `${zone} act${act.act} ${f.path}: byte mismatch`).toBe(
            true,
          );
        }
      }
    },
  );

  // Registered last, so it runs after every case above (vitest runs a file's
  // tests in declaration order). Splitting a loop into N cases can silently
  // drop acts — a case list built wrong registers fewer tests and the suite
  // still reads green. This counts the bodies that actually ran.
  it('exercised every act in the profile — none silently dropped', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, () => {
    const declared = s1Profile.zones.reduce((n, z) => n + z.acts.length, 0);
    expect(roundTripCases.length).toBe(declared);
    expect(actsExercised).toBe(declared);
  });
});

// ===========================================================================
// (d) Self-check gate: a corrupting encoder routes its file to errors only
// ===========================================================================

describe('s1-io (d) self-check gate', () => {
  it('a broken nemesis encoder fails tiles but not blocks/chunks', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, async () => {
    const fa = realFs(S1DIR);
    const act = s1Profile.zones[0].acts[0];
    const state = await readS1Level(act, realPaths(act), fa);

    const brokenNemesis = (): Uint8Array => new Uint8Array([0, 0, 0, 0]); // will not decode back
    const result = writeS1Level(
      state,
      { tiles: true, blocks: true, chunks: true },
      { nemesisCompress: brokenNemesis, enigmaCompress, kosinskiCompress },
    );

    // Every tiles (.nem) file landed in errors; none in files.
    const tilePaths = state.read.pristineTileFiles.map((f) => f.path);
    for (const tp of tilePaths) {
      expect(result.errors.some((e) => e.path === tp)).toBe(true);
      expect(result.files.some((f) => f.path === tp)).toBe(false);
    }
    // blocks + chunks survived (real encoders).
    expect(result.files.some((f) => f.path.endsWith('.eni'))).toBe(true);
    expect(result.files.some((f) => f.path.endsWith('.kos'))).toBe(true);
    expect(result.errors.every((e) => e.message.includes('self-check'))).toBe(true);
  });
});

// ===========================================================================
// (e) CI-safe synthetic project: read → mutate → write → re-read
// ===========================================================================

function beBytes(words: number[]): Uint8Array {
  const b = new Uint8Array(words.length * 2);
  words.forEach((w, i) => {
    b[i * 2] = (w >> 8) & 0xff;
    b[i * 2 + 1] = w & 0xff;
  });
  return b;
}

function buildSynthetic(): {
  fa: FileAccess;
  act: LevelAct;
  paths: ResolvedLevelPaths;
  files: Record<string, Uint8Array>;
} {
  // 4 tiles of distinct fill, 2 blocks, 1 chunk, tiny layouts, one object.
  const tiles = new Uint8Array(4 * 32).map((_, i) => (i * 7) & 0x0f);
  const blockWords = [10, 0x800 | 11, 0x1000 | 12, 0x2000 | 13, 1, 2, 3, 4]; // 2 blocks
  const chunkWords = new Array(256).fill(0).map((_, i) => (i % 3) | ((i % 4) << 13)); // 1 chunk
  const fg = new Uint8Array([1, 0, 0, 1]); // w2 h1, cells [0,1]
  const bg = new Uint8Array([0, 0, 0]); // w1 h1, cell [0]
  const objpos = new Uint8Array([0, 0x10, 0x02, 0x20, 0x05, 0x03, 0xff, 0xff, 0, 0, 0, 0]);
  const startpos = new Uint8Array([0x01, 0x00, 0x02, 0x00]);
  const colind = new Uint8Array([0, 1]);
  const sonic = beBytes(new Array(16).fill(0).map((_, i) => 0x100 + i));
  const zonePal = beBytes(new Array(48).fill(0).map((_, i) => 0x200 + i));
  const colNormal = new Uint8Array(4096).map((_, i) => i & 0xff);
  const angleMap = new Uint8Array(256).map((_, i) => i & 0xff);

  const files: Record<string, Uint8Array> = {
    'artnem/syn.nem': nemesisCompress(tiles),
    'map16/syn.eni': enigmaCompress(beBytes(blockWords)),
    'map256/syn.kos': kosinskiCompress(beBytes(chunkWords)),
    'levels/syn_fg.bin': fg,
    'levels/syn_bg.bin': bg,
    'objpos/syn.bin': objpos,
    'startpos/syn.bin': startpos,
    'collide/syn.bin': colind,
    'palette/Sonic.bin': sonic,
    'palette/Zone.bin': zonePal,
    'collide/normal.bin': colNormal,
    'collide/angle.bin': angleMap,
  };

  const act: LevelAct = {
    act: 1,
    name: 'Synthetic',
    tiles: ['artnem/syn.nem'],
    blocks: { path: 'map16/syn.eni' },
    chunks: { path: 'map256/syn.kos' },
    colind: { path: 'collide/syn.bin' },
    fgLayout: { path: 'levels/syn_fg.bin' },
    bgLayout: { path: 'levels/syn_bg.bin' },
    objpos: { path: 'objpos/syn.bin' },
    startpos: { path: 'startpos/syn.bin' },
    palette: [
      { file: 'palette/Sonic.bin', srcOffset: 0, destOffset: 0, length: 16 },
      { file: 'palette/Zone.bin', srcOffset: 0, destOffset: 16, length: 48 },
    ],
    animatedArt: [],
  };

  const paths: ResolvedLevelPaths = {
    tiles: ['artnem/syn.nem'],
    blocks: 'map16/syn.eni',
    chunks: 'map256/syn.kos',
    colind: 'collide/syn.bin',
    fg: 'levels/syn_fg.bin',
    bg: 'levels/syn_bg.bin',
    objpos: 'objpos/syn.bin',
    startpos: 'startpos/syn.bin',
    palette: ['palette/Sonic.bin', 'palette/Zone.bin'],
    animatedArt: [],
    collisionNormal: 'collide/normal.bin',
    collisionAngleMap: 'collide/angle.bin',
  };

  return { fa: memFs(files), act, paths, files };
}

describe('s1-io (e) synthetic round-trip with a mutation', () => {
  it('mutating one block survives write→re-read; untouched domains stay identical', async () => {
    const { fa, act, paths, files } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);
    const doc = state.doc;

    // Baseline snapshots of untouched domains.
    const chunk0 = doc.chunks[0].cells.map((c) => ({ ...c }));
    const pal = doc.palettes.map((l) => Array.from(l));
    const objs = doc.objects.map((o) => ({ ...o }));

    // Mutate one block cell's tile index.
    expect(doc.blocks[0].cells[0].tile).not.toBe(42);
    doc.blocks[0].cells[0] = { ...doc.blocks[0].cells[0], tile: 42 };

    // AND append a block with a collision entry, the shape classicPaintSurface
    // and classicAddBlock now produce. The synthetic fixture has 2 blocks and a
    // 2-byte colind; growing to 3 blocks must carry a 3-byte table to disk. If
    // the writer emitted the ORIGINAL length the third block would read past the
    // end of the collision file in game — the defect this pins.
    doc.blocks.push({ cells: doc.blocks[1].cells.map((c) => ({ ...c })) });
    const grown = new Uint8Array(3);
    grown.set(doc.collision.colind);
    grown[2] = doc.collision.colind[1]; // inherit block 1's shape, as a clone does
    doc.collision = { ...doc.collision, colind: grown };

    const result = writeS1Level(state, ALL_DIRTY);
    expect(result.errors).toEqual([]);

    // Feed the produced buffers back in and re-read.
    const next: Record<string, Uint8Array> = { ...files };
    for (const f of result.files) next[f.path] = f.bytes;
    const state2 = await readS1Level(act, paths, memFs(next));
    const doc2 = state2.doc;

    // Mutation present.
    expect(doc2.blocks[0].cells[0].tile).toBe(42);

    // The grown collision table survived the round trip at its new length.
    expect(doc2.blocks.length).toBe(3);
    expect(doc2.collision.colind.length).toBe(3);
    expect(Array.from(doc2.collision.colind)).toEqual(Array.from(grown));

    // Untouched domains identical.
    expect(doc2.chunks[0].cells).toEqual(chunk0);
    expect(doc2.palettes.map((l) => Array.from(l))).toEqual(pal);
    expect(doc2.objects).toEqual(objs);
    expect(doc2.fg).toEqual(doc.fg);

    // The compressed block file is decode-identical to the packed mutated words.
    const blk = result.files.find((f) => f.path === 'map16/syn.eni')!;
    expect(doc2.blocks.length).toBe(doc.blocks.length);
  });

  it('captures a read-time mtime for every source file when fa.mtime exists', async () => {
    const { act, paths, files } = buildSynthetic();
    // Give every source file a distinct mtime; leave the read-only collision
    // tables out to prove missing → not captured (rather than captured as 0).
    const mtimes: Record<string, number> = {};
    let t = 1000;
    for (const p of Object.keys(files)) {
      if (p === 'collide/normal.bin' || p === 'collide/angle.bin') continue;
      mtimes[p] = t++;
    }
    const fa = memFsWithMtime(files, mtimes);
    const state = await readS1Level(act, paths, fa);

    // Every writable source path carries its mtime.
    expect(state.read.fileMtimes['artnem/syn.nem']).toBe(mtimes['artnem/syn.nem']);
    expect(state.read.fileMtimes['map16/syn.eni']).toBe(mtimes['map16/syn.eni']);
    expect(state.read.fileMtimes['palette/Zone.bin']).toBe(mtimes['palette/Zone.bin']);
    // A file whose mtime resolved null is simply absent (not stored as 0).
    expect('collide/normal.bin' in state.read.fileMtimes).toBe(false);
  });

  it('omits fileMtimes entirely when fa has no mtime (in-memory fake)', async () => {
    const { fa, act, paths } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);
    expect(state.read.fileMtimes).toEqual({});
  });

  it('batches the whole read through readMany (one round-trip, no per-file read) and derives mtimes from it', async () => {
    const { act, paths, files } = buildSynthetic();
    const mtimes: Record<string, number> = {};
    let t = 5000;
    for (const p of Object.keys(files)) mtimes[p] = t++;

    let readCalls = 0;
    let readManyCalls = 0;
    let batchSize = 0;
    const base = memFs(files);
    const fa: FileAccess = {
      ...base,
      async read(rel) { readCalls++; return base.read(rel); },
      async readMany(rels) {
        readManyCalls++; batchSize = rels.length;
        const out = new Map<string, { bytes: Uint8Array | null; mtime: number | null }>();
        for (const r of rels) out.set(r, { bytes: files[r] ?? null, mtime: r in mtimes ? mtimes[r] : null });
        return out;
      },
    };

    // Reference: the same act read through the per-file (no readMany) fake.
    const ref = await readS1Level(act, paths, memFs(files));
    const state = await readS1Level(act, paths, fa);

    // Exactly one batch round-trip; the per-file read path is never touched.
    expect(readManyCalls).toBe(1);
    expect(readCalls).toBe(0);
    expect(batchSize).toBeGreaterThanOrEqual(10);

    // The batched doc is identical to the per-file read (byte-for-byte on tiles).
    expect(Array.from(state.doc.tiles)).toEqual(Array.from(ref.doc.tiles));
    expect(state.doc.blocks).toEqual(ref.doc.blocks);
    expect(state.doc.chunks).toEqual(ref.doc.chunks);
    expect(state.doc.objects).toEqual(ref.doc.objects);
    expect(state.doc.fg).toEqual(ref.doc.fg);
    expect(state.doc.palettes.map((l) => Array.from(l))).toEqual(ref.doc.palettes.map((l) => Array.from(l)));

    // The guarded-save mtime baseline comes from the batch — no separate stat loop.
    expect(state.read.fileMtimes['artnem/syn.nem']).toBe(mtimes['artnem/syn.nem']);
    expect(state.read.fileMtimes['map256/syn.kos']).toBe(mtimes['map256/syn.kos']);
    expect(state.read.fileMtimes['palette/Zone.bin']).toBe(mtimes['palette/Zone.bin']);
  });

  it('readMany that reports a mandatory file missing throws (ENOENT parity with per-file read)', async () => {
    const { act, paths, files } = buildSynthetic();
    const fa: FileAccess = {
      ...memFs(files),
      async readMany(rels) {
        const out = new Map<string, { bytes: Uint8Array | null; mtime: number | null }>();
        for (const r of rels) out.set(r, { bytes: r === paths.blocks ? null : (files[r] ?? null), mtime: null });
        return out;
      },
    };
    await expect(readS1Level(act, paths, fa)).rejects.toThrow(/ENOENT|no such file/i);
  });

  it('sorts objects by X at write time (out-of-order doc → sorted on disk)', async () => {
    const { fa, act, paths, files } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);

    // Replace the single synthetic object with an intentionally X-unsorted set,
    // including two equal-X entries to prove the sort is STABLE (keeps order).
    state.doc.objects = [
      { x: 300, y: 10, xflip: false, yflip: false, respawn: false, id: 0x0d, subtype: 0 },
      { x: 100, y: 20, xflip: false, yflip: false, respawn: false, id: 0x25, subtype: 1 }, // equal-X #1
      { x: 100, y: 21, xflip: false, yflip: false, respawn: false, id: 0x26, subtype: 2 }, // equal-X #2
      { x: 200, y: 30, xflip: false, yflip: false, respawn: false, id: 0x41, subtype: 3 },
    ];

    const result = writeS1Level(state, { objects: true });
    expect(result.errors).toEqual([]);

    // Re-decode the written objpos file: entries must be ascending by X, and the
    // two equal-X objects must retain their original relative order (stable).
    const written = result.files.find((f) => f.path === 'objpos/syn.bin')!;
    const back = decodeS1Objpos(written.bytes);
    expect(back.map((o) => o.x)).toEqual([100, 100, 200, 300]);
    // Stable: the y=20/id=0x25 entry precedes y=21/id=0x26 among the equal Xs.
    expect(back[0].y).toBe(20);
    expect(back[0].id).toBe(0x25);
    expect(back[1].y).toBe(21);
    expect(back[1].id).toBe(0x26);
  });

  it('preserves an X-inverted original order verbatim when the list is unchanged', async () => {
    // The preservation branch of the conditional sort: some real S1 files carry a
    // minor X inversion the loader tolerates (GHZ act 3). A dirty-but-unchanged
    // objpos save (e.g. saving with ALL domains dirty while only tiles were
    // edited) must emit the ORIGINAL order untouched, NOT a sorted one — otherwise
    // the zero-edit round-trip would stop being byte-identical for those files.
    const { fa, act, paths } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);

    // Install a deliberately X-inverted original (as if decoded from such a file),
    // and set doc.objects to the SAME list (content-equal → the sort is skipped).
    const inverted = [
      { x: 300, y: 10, xflip: false, yflip: false, respawn: false, id: 0x0d, subtype: 0 },
      { x: 200, y: 20, xflip: false, yflip: false, respawn: false, id: 0x25, subtype: 1 }, // 200 < 300: inverted
      { x: 250, y: 30, xflip: false, yflip: false, respawn: false, id: 0x41, subtype: 2 },
    ];
    state.read.objposOriginal = inverted.map((o) => ({ ...o }));
    state.doc.objects = inverted.map((o) => ({ ...o }));

    const result = writeS1Level(state, { objects: true });
    expect(result.errors).toEqual([]);

    // The written file must reproduce the inverted order EXACTLY (no sort).
    const written = result.files.find((f) => f.path === 'objpos/syn.bin')!;
    const back = decodeS1Objpos(written.bytes);
    expect(back.map((o) => o.x)).toEqual([300, 200, 250]);
    expect(back.map((o) => o.id)).toEqual([0x0d, 0x25, 0x41]);
  });

  it('a broken enigma encoder routes the blocks file to errors (synthetic)', async () => {
    const { fa, act, paths } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);
    const result = writeS1Level(
      state,
      { blocks: true, chunks: true },
      { nemesisCompress, enigmaCompress: () => new Uint8Array([1, 2, 3]), kosinskiCompress },
    );
    expect(result.errors.some((e) => e.path === 'map16/syn.eni')).toBe(true);
    expect(result.files.some((f) => f.path === 'map16/syn.eni')).toBe(false);
    expect(result.files.some((f) => f.path === 'map256/syn.kos')).toBe(true);
  });
});

// ===========================================================================
// Tile-write rejection paths (anim slots, gaps) + positive control.
// ===========================================================================

// A synthetic project whose single .nem holds 4 tiles (indices 0..3), plus one
// animated-art overlay of 1 tile sourced from a .unc file, blitted at
// `animVramTile`. Choosing animVramTile <= 3 overlays a base tile; choosing it
// >= 5 leaves a zero-fill gap (index 4) between base art and the anim slot.
function buildSyntheticWithAnim(animVramTile: number): {
  fa: FileAccess;
  act: LevelAct;
  paths: ResolvedLevelPaths;
  files: Record<string, Uint8Array>;
} {
  const base = buildSynthetic();
  const unc = new Uint8Array(32).fill(0xab); // one tile
  const files = { ...base.files, 'artunc/syn.unc': unc };
  const act: LevelAct = {
    ...base.act,
    animatedArt: [{ file: 'artunc/syn.unc', srcTileOffset: 0, vramTileIndex: animVramTile, tileCount: 1 }],
  };
  const paths: ResolvedLevelPaths = { ...base.paths, animatedArt: ['artunc/syn.unc'] };
  return { fa: memFs(files), act, paths, files };
}

describe('s1-io tile-write rejection paths', () => {
  it('rejects an edit to an anim-overlaid tile; leaves the .nem written correctly', async () => {
    // Anim overlays base tile index 2 (inside the .nem span 0..3).
    const { fa, act, paths } = buildSyntheticWithAnim(2);
    const state = await readS1Level(act, paths, fa);
    const doc = state.doc;

    // The overlaid tile reads back as the .unc fill.
    expect(doc.tiles[2 * 32]).toBe(0xab);
    // Mutate a byte inside the anim-overlaid tile.
    doc.tiles[2 * 32 + 4] = 0x99;

    const result = writeS1Level(state, { tiles: true });
    expect(
      result.errors.some(
        (e) => e.path === 'artunc/syn.unc' && e.message === 'animated art slots are not editable in v1',
      ),
    ).toBe(true);

    // The .nem file is still emitted, and (since the anim tile is skipped, not
    // patched) it decodes back to the original 4 base tiles unchanged.
    const nem = result.files.find((f) => f.path === 'artnem/syn.nem');
    expect(nem).toBeDefined();
    expect(bytesEqual(nemesisDecompress(nem!.bytes), state.read.pristineTileFiles[0].bytes)).toBe(true);
  });

  it("rejects an edit to a zero-fill gap tile with 'unrepresentable gap tile'", async () => {
    // Anim at tile 6 leaves a gap at tiles 4,5 beyond the .nem span (0..3).
    const { fa, act, paths } = buildSyntheticWithAnim(6);
    const state = await readS1Level(act, paths, fa);
    const doc = state.doc;

    // Gap tile 4 is zero-filled; mutate a byte in it.
    expect(doc.tiles[4 * 32]).toBe(0x00);
    doc.tiles[4 * 32] = 0x77;

    const result = writeS1Level(state, { tiles: true });
    expect(result.errors.some((e) => e.message.includes('gap or appended tile'))).toBe(true);
    // No anim error was raised (the edit was in the gap, not the anim slot).
    expect(result.errors.some((e) => e.message.includes('animated art slots'))).toBe(false);
  });

  it('positive control: an in-span tile edit writes and survives re-read', async () => {
    const { fa, act, paths, files } = buildSyntheticWithAnim(6);
    const state = await readS1Level(act, paths, fa);
    const doc = state.doc;

    // Mutate a byte of base tile 0 (in-span, not anim-overlaid).
    doc.tiles[0] = (doc.tiles[0] ^ 0x0f) & 0xff;
    const expected = doc.tiles[0];

    const result = writeS1Level(state, { tiles: true });
    expect(result.errors).toEqual([]);

    const next: Record<string, Uint8Array> = { ...files };
    for (const f of result.files) next[f.path] = f.bytes;
    const state2 = await readS1Level(act, paths, memFs(next));
    expect(state2.doc.tiles[0]).toBe(expected);
  });
});

describe('s1-io save gates that no re-decode could catch', () => {
  /**
   * U5 (CLASSIC-A5). S1 stores "this object is already gone" as a bit keyed by
   * the entry's POSITION in the objpos table, so X-sorting a list whose
   * remembered entries are not already in X order swaps which object each saved
   * bit refers to. FIVE real acts are not strictly X-ascending, so the sort is a
   * genuine reorder in those files — reached by editing anything at all in the
   * act, not by touching the remembered objects.
   */
  it('refuses to write an objpos sort that would swap two remember slots', async () => {
    const { fa, act, paths } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);
    // Two remembered objects, out of X order on disk, plus an unrelated edit so
    // the list counts as changed and the sort runs.
    state.doc.objects = [
      { x: 0x200, y: 0x10, xflip: false, yflip: false, respawn: true, id: 1, subtype: 0 },
      { x: 0x100, y: 0x20, xflip: false, yflip: false, respawn: true, id: 2, subtype: 0 },
    ];
    const result = writeS1Level(state, { objects: true });
    expect(result.errors.some((e) => /remember flag/.test(e.message))).toBe(true);
    expect(result.files.some((f) => f.path === paths.objpos)).toBe(false);
  });

  it('writes an edited list whose remembered entries keep their order', async () => {
    const { fa, act, paths } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);
    state.doc.objects = [
      { x: 0x100, y: 0x10, xflip: false, yflip: false, respawn: true, id: 1, subtype: 0 },
      { x: 0x180, y: 0x20, xflip: false, yflip: false, respawn: false, id: 2, subtype: 0 },
      { x: 0x200, y: 0x30, xflip: false, yflip: false, respawn: true, id: 3, subtype: 0 },
    ];
    const result = writeS1Level(state, { objects: true });
    expect(result.errors).toEqual([]);
    expect(result.files.some((f) => f.path === paths.objpos)).toBe(true);
  });

  /**
   * The colind gate. Its encode/decode are both `slice()`, so the re-decode
   * comparison it used to make was `bytesEqual(x.slice().slice(), x)` — true for
   * every input. What can actually go wrong is the LENGTH: the table
   * legitimately starts shorter than the block list and the ROM resolves the
   * overhang from what follows the file, so shortening it silently changes the
   * collision of every block past the new end.
   */
  it('refuses to shrink the collision table', async () => {
    const { fa, act, paths } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);
    expect(state.doc.collision.colind.length).toBe(2);
    state.doc.collision = { ...state.doc.collision, colind: new Uint8Array([9]) };
    const result = writeS1Level(state, { colind: true });
    expect(result.errors.some((e) => /shrink/.test(e.message))).toBe(true);
    expect(result.files.some((f) => f.path === paths.colind)).toBe(false);
  });

  it('still writes a table that grew', async () => {
    const { fa, act, paths } = buildSynthetic();
    const state = await readS1Level(act, paths, fa);
    state.doc.collision = { ...state.doc.collision, colind: new Uint8Array([0, 1, 5]) };
    const result = writeS1Level(state, { colind: true });
    expect(result.errors).toEqual([]);
    expect(result.files.find((f) => f.path === paths.colind)!.bytes.length).toBe(3);
  });
});
