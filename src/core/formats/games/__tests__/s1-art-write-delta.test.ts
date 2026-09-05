// encodeS1ArtWriteBackDelta against the REAL s1disasm files (read-only; all
// output stays in memory — no file is written anywhere by this suite).
//
// Every expectation is DERIVED from the source files at runtime, never copied:
//  • byte-identity: load → zero-edit save must equal the .unc file byte for
//    byte (the acceptance is identity, not "parses back");
//  • edit locality: the changed byte offsets are compared against the 32-byte
//    tile records computed from the edited frame's OWN piece/DPLC walk;
//  • shared-tile surfacing: the co-affected frame ids come from re-walking the
//    mappings + DPLC lists in-test (the committed probe's exact walk), and the
//    chosen tile is asserted multi-referenced BEFORE the edit (loud if the
//    sharing structure ever stops being measurable).

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { encodeS1ArtWriteBackDelta } from '../s1-art-write';
import { parseAsmMappings, parseAsmDPLC } from '../../../import/asm-mappings';
import { reconstructFromFrames } from '../../../import/sprite-import';
import { parseTiles } from '../../../formats/tiles';
import type { SpriteFrame } from '../../../model/sprite-types';
import { referenceCheckout, referenceCheckoutReason, referencePath, S1_PINNED } from '../../../../../test/support/fixture-tree';

const S1DIR = referencePath(S1_PINNED);
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason(S1_PINNED);
const read = (rel: string) => new Uint8Array(fs.readFileSync(path.join(S1DIR, rel)));
const readText = (rel: string) => fs.readFileSync(path.join(S1DIR, rel), 'utf8');

/** All byte offsets where two equal-length buffers differ. */
function changedOffsets(a: Uint8Array, b: Uint8Array): number[] {
  expect(b.length).toBe(a.length);
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

/** Pool tiles covered by a frame's pieces — the probe's exact walk (VDP
 *  column-major p.tile + col*heightCells + row, resolved through the frame's
 *  DPLC list when one exists). */
function coveredPoolTiles(frame: SpriteFrame, dplcList?: number[]): Set<number> {
  const out = new Set<number>();
  for (const p of frame.pieces) {
    for (let c = 0; c < p.widthCells; c++) {
      for (let r = 0; r < p.heightCells; r++) {
        const local = p.tile + c * p.heightCells + r;
        const src = dplcList ? dplcList[local] : local;
        if (src !== undefined) out.add(src);
      }
    }
  }
  return out;
}

/** Where does pool tile `target` land on frame `f`'s canvas? Returns every
 *  (canvas dx/dy → in-tile sx/sy) cell placement, walking exactly like the
 *  renderer (flip-aware). */
function tilePlacements(
  frame: SpriteFrame, dplcList: number[] | undefined, target: number,
  originX: number, originY: number,
): { pieceIndex: number; oc: number; or: number }[] {
  const out: { pieceIndex: number; oc: number; or: number }[] = [];
  frame.pieces.forEach((p, pieceIndex) => {
    for (let oc = 0; oc < p.widthCells; oc++) {
      for (let or = 0; or < p.heightCells; or++) {
        const sc = p.xFlip ? p.widthCells - 1 - oc : oc;
        const sr = p.yFlip ? p.heightCells - 1 - or : or;
        const local = p.tile + sc * p.heightCells + sr;
        const src = dplcList ? dplcList[local] : local;
        if (src === target) out.push({ pieceIndex, oc, or });
      }
    }
  });
  return out;
}

/** Canvas coordinates of in-tile pixel (sx,sy) for a placement (flip-aware
 *  inverse of the renderer's spx/spy computation). */
function canvasPixelFor(
  frame: SpriteFrame, pl: { pieceIndex: number; oc: number; or: number },
  sx: number, sy: number, originX: number, originY: number,
): { dx: number; dy: number } {
  const p = frame.pieces[pl.pieceIndex];
  const px = p.xFlip ? 7 - sx : sx;
  const py = p.yFlip ? 7 - sy : sy;
  return { dx: p.xOffset + originX + pl.oc * 8 + px, dy: p.yOffset + originY + pl.or * 8 + py };
}

/** How many piece-cells of `frame` cover canvas pixel (dx,dy)? Single-coverage
 *  pixels give deterministic inverse writes for the edit tests. */
function coverageCount(frame: SpriteFrame, dx: number, dy: number, originX: number, originY: number): number {
  let n = 0;
  for (const p of frame.pieces) {
    const x0 = p.xOffset + originX, y0 = p.yOffset + originY;
    if (dx >= x0 && dx < x0 + p.widthCells * 8 && dy >= y0 && dy < y0 + p.heightCells * 8) n++;
  }
  return n;
}

interface Loaded {
  frames: SpriteFrame[];
  dplc?: number[][];
  artBytes: Uint8Array;
  tiles: ReturnType<typeof parseTiles>;
  canvases: { indices: Uint8Array; width: number; height: number }[];
  originX: number; originY: number;
}

function load(mapRel: string, artRel: string, dplcRel?: string): Loaded {
  const frames = parseAsmMappings(readText(mapRel));
  const dplc = dplcRel ? parseAsmDPLC(readText(dplcRel)) : undefined;
  const artBytes = read(artRel);
  const recon = reconstructFromFrames(frames, artBytes, 'uncompressed', dplc);
  return {
    frames, dplc, artBytes, tiles: parseTiles(artBytes),
    canvases: recon.frames.map((data) => ({ indices: data.slice(), width: recon.width, height: recon.height })),
    originX: recon.originX, originY: recon.originY,
  };
}

const HAVE = referenceCheckout(S1_PINNED);

describe('delta writer: uncompressed flat mapping (Giant Ring)', { skip: !HAVE, meta: { skipReason: S1_ABSENT } }, () => {
  const L = () => load('_maps/Giant Ring.asm', 'artunc/Giant Ring.unc');

  it('zero-edit save is BYTE-IDENTICAL to the source .unc', () => {
    const { frames, artBytes, canvases, originX, originY, tiles } = L();
    expect(artBytes.length % 32).toBe(0); // derivation: identity requires whole tiles
    expect(tiles.length).toBe(artBytes.length / 32);
    const res = encodeS1ArtWriteBackDelta(tiles, canvases, frames, originX, originY, 'uncompressed');
    if (!res.ok) throw new Error(res.error);
    expect(res.editedFrameIndices).toEqual([]);
    expect(res.coAffectedFrames).toEqual([]);
    expect(res.changedTiles).toEqual([]);
    expect(changedOffsets(res.bytes, artBytes)).toEqual([]);
    expect(res.bytes.length).toBe(artBytes.length);
  });

  it('an edit changes EXACTLY the edited tile records: every other byte identical', () => {
    const L1 = L();
    const { frames, artBytes, canvases, originX, originY, tiles } = L1;

    // Derive an editable spot: frame 0, the first single-coverage pixel of the
    // first tile its pieces cover (in-tile (0,0) placement walk).
    const f = 0;
    const covered = [...coveredPoolTiles(frames[f])].sort((a, b) => a - b);
    expect(covered.length).toBeGreaterThan(0); // loud if the mapping stopped parsing
    let target = -1, spot: { dx: number; dy: number; sx: number; sy: number } | null = null;
    outer: for (const t of covered) {
      for (const pl of tilePlacements(frames[f], undefined, t, originX, originY)) {
        for (let sy = 0; sy < 8; sy++) {
          for (let sx = 0; sx < 8; sx++) {
            const { dx, dy } = canvasPixelFor(frames[f], pl, sx, sy, originX, originY);
            if (dx < 0 || dx >= canvases[f].width || dy < 0 || dy >= canvases[f].height) continue;
            if (coverageCount(frames[f], dx, dy, originX, originY) === 1) {
              target = t; spot = { dx, dy, sx, sy }; break outer;
            }
          }
        }
      }
    }
    if (!spot) throw new Error('unmeasurable: no single-coverage pixel found on frame 0');

    const before = tiles[target].pixels[spot.sy * 8 + spot.sx];
    const newVal = (before + 1) % 16;
    canvases[f].indices[spot.dy * canvases[f].width + spot.dx] = newVal;

    const res = encodeS1ArtWriteBackDelta(tiles, canvases, frames, originX, originY, 'uncompressed');
    if (!res.ok) throw new Error(res.error);
    expect(res.editedFrameIndices).toEqual([f]);

    const offsets = changedOffsets(res.bytes, artBytes);
    expect(offsets.length).toBeGreaterThan(0); // anti-vacuous: the edit landed
    // DERIVED locality: every changed byte lies inside the 32-byte records of
    // tiles frame 0's pieces cover — and the targeted tile's record changed.
    const allowed = new Set(covered);
    for (const o of offsets) expect(allowed.has(Math.floor(o / 32)), `offset ${o} outside frame-${f}-covered tile records`).toBe(true);
    expect(offsets.some((o) => Math.floor(o / 32) === target)).toBe(true);
    expect(res.changedTiles).toContain(target);
  });
});

describe('delta writer: Sonic DPLC shared pool', { skip: !HAVE, meta: { skipReason: S1_ABSENT } }, () => {
  const L = () => load('_maps/Sonic.asm', 'artunc/Sonic.unc', '_maps/Sonic - Dynamic Gfx Script.asm');

  it('zero-edit save is BYTE-IDENTICAL to artunc/Sonic.unc', () => {
    const { frames, dplc, artBytes, canvases, originX, originY, tiles } = L();
    expect(frames.length).toBe(88);
    expect(dplc!.length).toBe(88);
    expect(artBytes.length % 32).toBe(0);
    const res = encodeS1ArtWriteBackDelta(tiles, canvases, frames, originX, originY, 'uncompressed', dplc);
    if (!res.ok) throw new Error(res.error);
    expect(res.editedFrameIndices).toEqual([]);
    expect(res.coAffectedFrames).toEqual([]);
    expect(changedOffsets(res.bytes, artBytes)).toEqual([]);
  });

  /** Derive the sharing structure in-test (the probe's walk): pool tile →
   *  sorted frames covering it. */
  function sharingMap(frames: SpriteFrame[], dplc: number[][]): Map<number, number[]> {
    const m = new Map<number, number[]>();
    for (let i = 0; i < frames.length; i++) {
      for (const t of coveredPoolTiles(frames[i], dplc[i])) {
        if (!m.has(t)) m.set(t, []);
        m.get(t)!.push(i);
      }
    }
    return m;
  }

  /** First (tile, frame, spot) where `frame` covers shared tile `t` at a
   *  single-coverage canvas pixel. */
  function findSharedSpot(
    frames: SpriteFrame[], dplc: number[][], sharing: Map<number, number[]>,
    originX: number, originY: number, width: number, height: number,
  ): { target: number; refFrames: number[]; f: number; dx: number; dy: number; sx: number; sy: number } {
    const sharedTiles = [...sharing.entries()].filter(([, fr]) => fr.length > 1).sort((a, b) => a[0] - b[0]);
    expect(sharedTiles.length).toBeGreaterThan(0); // loud: the measured structure must exist
    for (const [target, refFrames] of sharedTiles) {
      for (const f of refFrames) {
        for (const pl of tilePlacements(frames[f], dplc[f], target, originX, originY)) {
          for (let sy = 0; sy < 8; sy++) {
            for (let sx = 0; sx < 8; sx++) {
              const { dx, dy } = canvasPixelFor(frames[f], pl, sx, sy, originX, originY);
              if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;
              if (coverageCount(frames[f], dx, dy, originX, originY) === 1) {
                return { target, refFrames, f, dx, dy, sx, sy };
              }
            }
          }
        }
      }
    }
    throw new Error('unmeasurable: no single-coverage pixel on any shared tile');
  }

  it('an edit on a PROBE-PROVEN multi-referenced tile surfaces the exact co-affected frames', () => {
    const { frames, dplc, artBytes, canvases, originX, originY, tiles } = L();
    const sharing = sharingMap(frames, dplc!);

    // The committed probe measured 178 shared tiles (131×2, 35×3, 12×5 frames);
    // this re-derivation must agree in the aggregate — loud if the walk drifts.
    const shared = [...sharing.values()].filter((fr) => fr.length > 1);
    expect(shared.length).toBe(178);

    const spot = findSharedSpot(frames, dplc!, sharing, originX, originY, canvases[0].width, canvases[0].height);
    const { target, refFrames, f } = spot;
    expect(refFrames.length).toBeGreaterThan(1); // the anti-vacuous premise, re-checked

    const before = tiles[target].pixels[spot.sy * 8 + spot.sx];
    const newVal = (before + 1) % 16;
    canvases[f].indices[spot.dy * canvases[f].width + spot.dx] = newVal;

    const res = encodeS1ArtWriteBackDelta(tiles, canvases, frames, originX, originY, 'uncompressed', dplc);
    if (!res.ok) throw new Error(res.error);
    expect(res.editedFrameIndices).toEqual([f]);
    expect(res.changedTiles).toEqual([target]);

    // The shared edit is SURFACED, not silent: exactly the other frames that
    // cover the tile — derived above, not hardcoded.
    const expectedCo = refFrames.filter((x) => x !== f);
    expect(res.coAffectedFrames).toEqual(expectedCo);

    // Byte locality: only the shared tile's 32-byte record changed.
    const offsets = changedOffsets(res.bytes, artBytes);
    expect(offsets.length).toBeGreaterThan(0);
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(target * 32);
      expect(o).toBeLessThan(target * 32 + 32);
    }
  });

  it('two edited frames disagreeing about one shared tile REFUSE (never last-writer-wins)', () => {
    const { frames, dplc, canvases, originX, originY, tiles } = L();
    const sharing = sharingMap(frames, dplc!);
    const spot = findSharedSpot(frames, dplc!, sharing, originX, originY, canvases[0].width, canvases[0].height);
    const { target, refFrames, f } = spot;

    // A second referencing frame with a single-coverage pixel on the SAME
    // in-tile position (sx,sy).
    let second: { g: number; dx: number; dy: number } | null = null;
    for (const g of refFrames) {
      if (g === f) continue;
      for (const pl of tilePlacements(frames[g], dplc![g], target, originX, originY)) {
        const { dx, dy } = canvasPixelFor(frames[g], pl, spot.sx, spot.sy, originX, originY);
        if (dx < 0 || dx >= canvases[g].width || dy < 0 || dy >= canvases[g].height) continue;
        if (coverageCount(frames[g], dx, dy, originX, originY) === 1) { second = { g, dx, dy }; break; }
      }
      if (second) break;
    }
    if (!second) throw new Error('unmeasurable: no second frame with a clean view of the shared tile');

    const before = tiles[target].pixels[spot.sy * 8 + spot.sx];
    const v1 = (before + 1) % 16;
    const v2 = (before + 2) % 16;
    canvases[f].indices[spot.dy * canvases[f].width + spot.dx] = v1;
    canvases[second.g].indices[second.dy * canvases[second.g].width + second.dx] = v2;

    const res = encodeS1ArtWriteBackDelta(tiles, canvases, frames, originX, originY, 'uncompressed', dplc);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/conflicting edits/);
  });
});
