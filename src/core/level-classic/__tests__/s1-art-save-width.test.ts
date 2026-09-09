import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import type { FileAccess } from '../../project/adapter';
import type { LevelAct } from '../../project/profiles/s1';
import { s1Profile } from '../../project/profiles/s1';
import { readS1Level, writeS1Level, type ResolvedLevelPaths } from '../s1-io';
import { nemesisCompress, nemesisDecompress } from '../../compress/nemesis';
import { enigmaCompress } from '../../formats/classic/enigma';
import { kosinskiCompress } from '../../formats/kosinski';
import { referencePath, S1_PINNED } from '../../../../test/support/fixture-tree';
import { whenS1Files } from '../../../../test/support/s1-checkout';

/**
 * UX SEAT A, FINDING F3 — "14 pixels in one UNUSED tile rewrote two art files
 * and grew the ROM art by 329 bytes, unannounced"
 * (docs/reviews/2026-09-07-lens-ux/uxa-walk.md). The seat measured the two file
 * sizes and said plainly that it had NOT determined the cause. This file is the
 * cause, executed.
 *
 * ═══ WHY TWO FILES ═══════════════════════════════════════════════════════
 *
 * A Sonic 1 act's tile pool is built by decoding one or more `.nem` files and
 * CONCATENATING them (`profiles/s1.ts`: GHZ_TILES is two files, every other zone
 * one). `writeS1Level`'s tile branch patches only the file whose span contains
 * an edited tile — and then re-encodes and emits EVERY pristine file, "patched
 * or not", to preserve the split (`s1-io.ts`, the tile-write contract). So one
 * tile edited anywhere in GHZ writes both GHZ files, by construction. §1 drives
 * that on a synthetic two-file act, so it holds on any machine.
 *
 * ═══ WHY THEY GREW ═══════════════════════════════════════════════════════
 *
 * Aurora's `nemesisCompress` is not the encoder that produced the disassembly's
 * files, so re-encoding bytes that did not change does not reproduce them: it
 * produces a slightly larger stream. The repo already knows this and bounds it —
 * `formats/classic/__tests__/s1-compression-goldens.test.ts` pins the seven
 * stock artnem files at a measured 1.02x-1.05x under a 1.10x ceiling — but
 * nothing connected that known cost to what a SAVE writes. §2 does, on the
 * vendored files, and the arithmetic closes seat A's figure exactly:
 *
 *   `8x8 - GHZ2.nem` is not in tile $30's span. It was not patched. Re-encoding
 *   it with ZERO edits produces 5193 bytes against 5031 on disk — and 5193 is
 *   character-for-character the AFTER size the seat measured. Every one of that
 *   file's +162 bytes is re-encode overhead on art nobody touched.
 *
 *   `8x8 - GHZ1.nem` re-encodes with ZERO edits at 5881 against 5727 on disk.
 *   The seat measured 5894 after painting, so ~154 of its +167 predates the
 *   first pixel.
 *
 * So of seat A's +329, about 316 bytes — 96% — is re-encode overhead on bytes
 * that did not change, and roughly 13 bytes is the drawing.
 *
 * ⚠ WHAT THIS FILE DOES **NOT** CLAIM. These are REPRODUCTION rows: they state
 * what the writer does today, not what it should do. Two changes would turn
 * them red and both would be the row retiring rather than breaking — a writer
 * that stops re-emitting unchanged art files (§1's last row), and an encoder
 * that reproduces the original streams (§2). Both are written up as parked
 * questions in docs/reviews/2026-09-09-uxpair-findings.md, because the obvious
 * mechanical version of the first collides with the save contract: with nothing
 * emitted, `saveClassicWriteResult` answers `nothing`, which does not clear the
 * dirty domains — so a Ctrl+S after a paint-and-undo would go silent, which is
 * the defect class this queue is closing, not one to open.
 */

// -- §1 · the split, on a synthetic act ------------------------------------

function beBytes(words: number[]): Uint8Array {
  const out = new Uint8Array(words.length * 2);
  words.forEach((w, i) => { out[i * 2] = (w >> 8) & 0xff; out[i * 2 + 1] = w & 0xff; });
  return out;
}

function memFs(files: Record<string, Uint8Array>): FileAccess {
  const map = new Map(Object.entries(files));
  return {
    async exists(rel) { return map.has(rel); },
    async read(rel) {
      const b = map.get(rel);
      if (!b) throw new Error(`no such file: ${rel}`);
      return b;
    },
    async list() { return []; },
  };
}

const NEM_A = 'artnem/split-a.nem';
const NEM_B = 'artnem/split-b.nem';

/**
 * A two-file act shaped like GHZ: file A holds tiles 0-3, file B tiles 4-7, and
 * the pool is their concatenation. The fills are DISTINCT per file so a row can
 * tell which half it is looking at.
 */
function buildTwoFileAct(): { fa: FileAccess; act: LevelAct; paths: ResolvedLevelPaths;
  tilesA: Uint8Array; tilesB: Uint8Array } {
  const tilesA = new Uint8Array(4 * 32).map((_, i) => (i * 7) & 0x0f);
  const tilesB = new Uint8Array(4 * 32).map((_, i) => (i * 11) & 0x0f);
  const files: Record<string, Uint8Array> = {
    [NEM_A]: nemesisCompress(tilesA),
    [NEM_B]: nemesisCompress(tilesB),
    'map16/syn.eni': enigmaCompress(beBytes([10, 0x800 | 11, 0x1000 | 12, 0x2000 | 13, 1, 2, 3, 4])),
    'map256/syn.kos': kosinskiCompress(beBytes(new Array(256).fill(0).map((_, i) => (i % 3) | ((i % 4) << 13)))),
    'levels/syn_fg.bin': new Uint8Array([1, 0, 0, 1]),
    'levels/syn_bg.bin': new Uint8Array([0, 0, 0]),
    'objpos/syn.bin': new Uint8Array([0, 0x10, 0x02, 0x20, 0x05, 0x03, 0xff, 0xff, 0, 0, 0, 0]),
    'startpos/syn.bin': new Uint8Array([0x01, 0x00, 0x02, 0x00]),
    'collide/syn.bin': new Uint8Array([0, 1]),
    'palette/Sonic.bin': beBytes(new Array(16).fill(0).map((_, i) => 0x100 + i)),
    'palette/Zone.bin': beBytes(new Array(48).fill(0).map((_, i) => 0x200 + i)),
    'collide/normal.bin': new Uint8Array(4096).map((_, i) => i & 0xff),
    'collide/angle.bin': new Uint8Array(256).map((_, i) => i & 0xff),
  };
  const act: LevelAct = {
    act: 1, name: 'Two-file synthetic',
    tiles: [NEM_A, NEM_B],
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
    tiles: [NEM_A, NEM_B],
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
  return { fa: memFs(files), act, paths, tilesA, tilesB };
}

describe('F3 §1 · one edited tile emits every art file backing the act', () => {
  it('GHZ really is the two-file zone, and it is the only one — from the profile, not from memory', () => {
    const counts = new Map<string, number>();
    for (const zone of s1Profile.zones) {
      for (const act of zone.acts) counts.set(`${zone.id}/${act.act}`, act.tiles.length);
    }
    // LOUD WHEN IT CANNOT MEASURE: the profile really was walked.
    expect(counts.size).toBeGreaterThan(10);
    expect(counts.get('ghz/1')).toBe(2);
    const multi = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    // The other direction: this is not "every act has two", it is GHZ's three.
    expect(multi.sort()).toEqual(['ghz/1', 'ghz/2', 'ghz/3']);
  });

  it('an edit inside file A emits BOTH files — the "two files" half of F3', async () => {
    const { fa, act, paths } = buildTwoFileAct();
    const state = await readS1Level(act, paths, fa);
    // Tile 1 lives in file A's span (tiles 0-3); file B holds 4-7 and is untouched.
    state.doc.tiles[1 * 32] = (state.doc.tiles[1 * 32] ^ 0x0f) & 0xff;

    const result = writeS1Level(state, { tiles: true });
    expect(result.errors).toEqual([]);
    const written = result.files.map((f) => f.path);
    expect(written).toContain(NEM_A);
    expect(written).toContain(NEM_B);
  });

  it('and the untouched file is emitted with its CONTENT unchanged: it is a pure re-encode', async () => {
    const { fa, act, paths, tilesB } = buildTwoFileAct();
    const state = await readS1Level(act, paths, fa);
    state.doc.tiles[1 * 32] = (state.doc.tiles[1 * 32] ^ 0x0f) & 0xff;

    const result = writeS1Level(state, { tiles: true });
    const b = result.files.find((f) => f.path === NEM_B)!;
    expect(nemesisDecompress(b.bytes)).toEqual(tilesB);
    // ANTI-VACUOUS, and the other direction: file A's emitted bytes DO carry the
    // edit, so "unchanged" above is a property of B and not of the whole write.
    const a = result.files.find((f) => f.path === NEM_A)!;
    expect(nemesisDecompress(a.bytes)).not.toEqual(state.read.pristineTileFiles[0].bytes);
  });

  /**
   * THE MECHANISM, isolated: the emit is unconditional on the domain's dirty
   * flag and consults nothing about whether a given file changed. This is the
   * row a fix would flip.
   */
  it('REPRODUCTION: a tiles-dirty save with NO tile differing still emits both files', async () => {
    const { fa, act, paths } = buildTwoFileAct();
    const state = await readS1Level(act, paths, fa);
    const result = writeS1Level(state, { tiles: true }); // not one byte edited
    expect(result.errors).toEqual([]);
    expect(result.files.map((f) => f.path).sort()).toEqual([NEM_A, NEM_B].sort());
  });
});

// -- §2 · the growth, on the vendored disassembly --------------------------

const S1DIR = referencePath(S1_PINNED);
const GHZ1 = 'artnem/8x8 - GHZ1.nem';
const GHZ2 = 'artnem/8x8 - GHZ2.nem';
const NEEDS = whenS1Files("seat A's F3 art files", [GHZ1, GHZ2]);

function reencode(rel: string): { onDisk: number; tiles: number; re: number } {
  const orig = new Uint8Array(fs.readFileSync(`${S1DIR}/${rel}`));
  const dec = nemesisDecompress(orig);
  return { onDisk: orig.length, tiles: dec.length / 32, re: nemesisCompress(dec).length };
}

describe('F3 §2 · the +329 bytes is re-encode overhead, not drawing', () => {
  it('tile $30 is in GHZ1 and NOT in GHZ2 — so GHZ2 was never patched', NEEDS, () => {
    const a = reencode(GHZ1);
    const b = reencode(GHZ2);
    // Derived from the files, not from the report: the pool is A then B.
    expect(0x30).toBeLessThan(a.tiles);
    expect(0x30).toBeLessThan(a.tiles + b.tiles);
    // Non-vacuous: both files really decoded to something.
    expect(a.tiles).toBeGreaterThan(0);
    expect(b.tiles).toBeGreaterThan(0);
  });

  /**
   * THE DECISIVE ROW. Seat A reported `8x8 - GHZ2.nem` at 5031 → 5193 after its
   * save. A zero-edit re-encode of that file lands on the same 5193, so all
   * +162 of it came from the encoder and none from the drawing.
   *
   * ⚠ BOTH SIDES ARE MEASURED HERE — the before from the file on disk, the after
   * from this encoder. Neither is copied from the walk. The walk's numbers are
   * quoted in the header for the reader; the assertions do not depend on them.
   *
   * ⚠ AND THE DAY THIS GOES RED. If `nemesisCompress` is improved to reproduce
   * the original streams, this row fails — correctly. It is the FINDING that has
   * expired, not the row that has broken: delete it and say so.
   */
  it('GHZ2, untouched, re-encodes LARGER than it is on disk, with no edit at all', NEEDS, () => {
    const { onDisk, re } = reencode(GHZ2);
    expect(onDisk).toBe(5031);
    expect(re).toBeGreaterThan(onDisk);
    expect(re).toBe(5193); // exactly the size seat A measured AFTER its save
  });

  it('GHZ1 too: most of its growth predates the first pixel', NEEDS, () => {
    const { onDisk, re } = reencode(GHZ1);
    expect(onDisk).toBe(5727);
    expect(re).toBeGreaterThan(onDisk);
    // Seat A measured 5894 after painting a 14-pixel X; 5881 of that is here
    // before any edit, so the drawing is worth ~13 bytes of the +167.
    expect(re).toBe(5881);
  });

  /**
   * THE OTHER DIRECTION, and the tie to the instrument that already existed:
   * the overhead is bounded, not unbounded, and the bound is the one
   * s1-compression-goldens.test.ts pins. A row that only ever said "bigger"
   * would stay green if the encoder regressed to the 2.1x-3.0x it used to be.
   */
  it('and the overhead is inside the ceiling the compression goldens already pin', NEEDS, () => {
    for (const rel of [GHZ1, GHZ2]) {
      const { onDisk, re } = reencode(rel);
      expect(re / onDisk, `${rel} inflated past the golden ceiling`).toBeLessThan(1.10);
      expect(re / onDisk, `${rel} no longer inflates — F3's cause has changed`).toBeGreaterThan(1.0);
    }
  });
});
