// End-to-end save-back round trip through the REAL open + save path
// (openDiscoveredSet → captureS1ArtSource → saveSpriteArt → writeGuarded),
// for the uncompressed/DPLC save-back parcel.
//
// SAFETY: s1disasm is never written. Each test copies the needed files into a
// fresh temp dir INSIDE this worktree and all writes land there; the temp dir
// is removed afterwards.
//
// Acceptance (expectations DERIVED from the copied source files at runtime):
//  • zero-edit save → the art file on disk is BYTE-IDENTICAL to the pristine
//    copy, and the mappings/DPLC .asm files are untouched (byte-compared AND
//    the writeGuarded call log shows only the art file was ever written);
//  • an edit through one Sonic frame → on-disk changes confined to the derived
//    shared tile's 32-byte record, and the completion toast NAMES the derived
//    co-affected frames (the shared-pool surfacing contract).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { openDiscoveredSet, saveSpriteArt } from '../export-sprite';
import { useSpriteStore } from '../../../state/spriteStore';
import { useToastStore } from '../../../state/toastStore';
import type { SpriteFrame } from '../../../../core/model/sprite-types';
import { referenceCheckout, referenceCheckoutReason, referencePath } from '../../../../../test/support/fixture-tree';

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason('s1disasm');
const SONIC_FILES = ['_maps/Sonic.asm', '_maps/Sonic - Dynamic Gfx Script.asm', 'artunc/Sonic.unc'];
const RING_FILES = ['_maps/Giant Ring.asm', 'artunc/Giant Ring.unc'];

let tempDir = '';
let writtenPaths: string[];
let restoreApi: (() => void) | undefined;

function stubWindowApi(): () => void {
  const g = globalThis as unknown as { window?: unknown };
  const prev = g.window;
  g.window = {
    api: {
      readBinaryFile: async (base: string, rel: string): Promise<ArrayBuffer> => {
        const b = fs.readFileSync(path.join(base, rel));
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
      fileMtime: async (base: string, rel: string): Promise<number | null> =>
        fs.statSync(path.join(base, rel)).mtimeMs,
      writeGuarded: async (
        base: string,
        writes: { relPath: string; bytes: Uint8Array; expectedMtimeMs: number | null }[],
      ) => {
        for (const w of writes) {
          const mt = fs.statSync(path.join(base, w.relPath)).mtimeMs;
          if (w.expectedMtimeMs != null && mt !== w.expectedMtimeMs) return { conflicts: [w.relPath] };
        }
        const newMtimes: Record<string, number> = {};
        const written: string[] = [];
        for (const w of writes) {
          const p = path.join(base, w.relPath);
          fs.writeFileSync(p, Buffer.from(w.bytes));
          newMtimes[w.relPath] = fs.statSync(p).mtimeMs;
          written.push(w.relPath);
          writtenPaths.push(w.relPath);
        }
        return { written, newMtimes };
      },
    },
  };
  return () => { g.window = prev; };
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-s1-saveback-'));
  for (const rel of [...SONIC_FILES, ...RING_FILES]) {
    const dst = path.join(tempDir, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(S1DIR, rel), dst);
  }
  writtenPaths = [];
  restoreApi = stubWindowApi();
  useSpriteStore.getState().closeAll();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => {
  // THE REMOVAL GOES IN `finally`, and it is not tidiness.
  //
  // `beforeEach` mkdtemps into `process.cwd()` — the REPO ROOT — and then copies
  // the fixture files in. On an incomplete s1disasm checkout the copy throws
  // AFTER the directory exists and BEFORE `restoreApi` is assigned, so this hook
  // used to die on `restoreApi()` and never reach the `rmSync`. Nine
  // `.tmp-s1-saveback-*` directories were left in the repo root by one such run
  // (measured 2026-08-30); they are untracked and not gitignored, so the next
  // `git add -A` in this tree would have committed a copy of somebody else's
  // disassembly.
  try {
    restoreApi?.();
    useSpriteStore.getState().closeAll();
  } finally {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = '';
    restoreApi = undefined;
  }
});

const lastToast = () => useToastStore.getState().toasts.at(-1)?.message ?? '';
const pristine = (rel: string) => new Uint8Array(fs.readFileSync(path.join(S1DIR, rel)));
const onDisk = (rel: string) => new Uint8Array(fs.readFileSync(path.join(tempDir, rel)));

function changedOffsets(a: Uint8Array, b: Uint8Array): number[] {
  expect(b.length).toBe(a.length);
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
}

const SONIC_SET = {
  name: 'Sonic', game: 's1' as const,
  mappings: '_maps/Sonic.asm', art: 'artunc/Sonic.unc',
  dplc: '_maps/Sonic - Dynamic Gfx Script.asm',
};
const RING_SET = {
  name: 'GiantRing', game: 's1' as const,
  mappings: '_maps/Giant Ring.asm', art: 'artunc/Giant Ring.unc',
};

/** The renderer's piece/flip walk, used to DERIVE which pool tile a canvas
 *  pixel writes through (mirrors renderFrameToIndices exactly). */
function findEditSpot(
  frames: SpriteFrame[], dplc: number[][] | undefined,
  originX: number, originY: number, width: number, height: number,
  wantShared: boolean,
): { target: number; refFrames: number[]; f: number; dx: number; dy: number; sx: number; sy: number } {
  // pool tile -> frames covering it
  const sharing = new Map<number, number[]>();
  const cover = (i: number) => {
    const seen = new Set<number>();
    for (const p of frames[i].pieces) {
      for (let c = 0; c < p.widthCells; c++) {
        for (let r = 0; r < p.heightCells; r++) {
          const local = p.tile + c * p.heightCells + r;
          const src = dplc ? dplc[i]?.[local] : local;
          if (src !== undefined) seen.add(src);
        }
      }
    }
    return seen;
  };
  for (let i = 0; i < frames.length; i++) {
    for (const t of cover(i)) {
      if (!sharing.has(t)) sharing.set(t, []);
      sharing.get(t)!.push(i);
    }
  }
  const candidates = [...sharing.entries()]
    .filter(([, fr]) => (wantShared ? fr.length > 1 : fr.length >= 1))
    .sort((a, b) => a[0] - b[0]);
  expect(candidates.length).toBeGreaterThan(0); // loud on unmeasurable
  const coverageCount = (i: number, dx: number, dy: number) => {
    let n = 0;
    for (const p of frames[i].pieces) {
      const x0 = p.xOffset + originX, y0 = p.yOffset + originY;
      if (dx >= x0 && dx < x0 + p.widthCells * 8 && dy >= y0 && dy < y0 + p.heightCells * 8) n++;
    }
    return n;
  };
  for (const [target, refFrames] of candidates) {
    for (const f of refFrames) {
      for (const [pieceIndex, p] of frames[f].pieces.entries()) {
        void pieceIndex;
        for (let oc = 0; oc < p.widthCells; oc++) {
          for (let or = 0; or < p.heightCells; or++) {
            const sc = p.xFlip ? p.widthCells - 1 - oc : oc;
            const sr = p.yFlip ? p.heightCells - 1 - or : or;
            const local = p.tile + sc * p.heightCells + sr;
            const src = dplc ? dplc[f]?.[local] : local;
            if (src !== target) continue;
            for (let sy = 0; sy < 8; sy++) {
              for (let sx = 0; sx < 8; sx++) {
                const px = p.xFlip ? 7 - sx : sx;
                const py = p.yFlip ? 7 - sy : sy;
                const dx = p.xOffset + originX + oc * 8 + px;
                const dy = p.yOffset + originY + or * 8 + py;
                if (dx < 0 || dx >= width || dy < 0 || dy >= height) continue;
                if (coverageCount(f, dx, dy) === 1) return { target, refFrames, f, dx, dy, sx, sy };
              }
            }
          }
        }
      }
    }
  }
  throw new Error('unmeasurable: no single-coverage edit spot found');
}

describe('S1 save-back round trip — Sonic (uncompressed + DPLC)', { skip: !referenceCheckout('s1disasm'), meta: { skipReason: S1_ABSENT } }, () => {
  it('zero-edit save writes a BYTE-IDENTICAL art file and touches nothing else', async () => {
    const ok = await openDiscoveredSet(tempDir, SONIC_SET, 'uncompressed');
    expect(ok).toBe(true);
    expect(useSpriteStore.getState().s1ArtSource).not.toBeNull();

    await saveSpriteArt();
    expect(lastToast()).toMatch(/^Saved art to artunc\/Sonic\.unc/);
    expect(lastToast()).not.toMatch(/shared pool tiles/);

    // Art byte-identical; asm files untouched; ONLY the art file was written.
    expect(changedOffsets(onDisk('artunc/Sonic.unc'), pristine('artunc/Sonic.unc'))).toEqual([]);
    expect(onDisk('_maps/Sonic.asm')).toEqual(pristine('_maps/Sonic.asm'));
    expect(onDisk('_maps/Sonic - Dynamic Gfx Script.asm')).toEqual(pristine('_maps/Sonic - Dynamic Gfx Script.asm'));
    expect(writtenPaths).toEqual(['artunc/Sonic.unc']);
  });

  it('a shared-tile edit lands in exactly the derived tile record and the toast names the co-affected frames', async () => {
    const ok = await openDiscoveredSet(tempDir, SONIC_SET, 'uncompressed');
    expect(ok).toBe(true);
    const s = useSpriteStore.getState();
    const src = s.s1ArtSource!;
    expect(src.dplc).toBeDefined();

    // DERIVE a multi-referenced pool tile + a clean canvas pixel on one of its
    // frames (from the captured mappings/DPLC — the same data the save uses).
    const spot = findEditSpot(src.mappings, src.dplc, s.originX, s.originY, s.frames[0].width, s.frames[0].height, true);
    expect(spot.refFrames.length).toBeGreaterThan(1); // anti-vacuous premise

    const before = src.originalTiles[spot.target].pixels[spot.sy * 8 + spot.sx];
    const newVal = (before + 1) % 16;
    s.frames[spot.f].data[spot.dy * s.frames[spot.f].width + spot.dx] = newVal;

    await saveSpriteArt();

    // The toast surfaces the DERIVED co-affected frames, never silently.
    const expectedCo = spot.refFrames.filter((x) => x !== spot.f);
    const word = expectedCo.length === 1 ? 'frame' : 'frames';
    expect(lastToast()).toContain(`shared pool tiles also changed ${word} ${expectedCo.join(', ')}`);

    // On-disk locality: every changed byte inside the derived tile's record.
    const offsets = changedOffsets(onDisk('artunc/Sonic.unc'), pristine('artunc/Sonic.unc'));
    expect(offsets.length).toBeGreaterThan(0);
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(spot.target * 32);
      expect(o).toBeLessThan(spot.target * 32 + 32);
    }
    // DPLC/mappings tables were NOT rewritten.
    expect(onDisk('_maps/Sonic.asm')).toEqual(pristine('_maps/Sonic.asm'));
    expect(onDisk('_maps/Sonic - Dynamic Gfx Script.asm')).toEqual(pristine('_maps/Sonic - Dynamic Gfx Script.asm'));
    expect(writtenPaths).toEqual(['artunc/Sonic.unc']);
  });
});

describe('S1 save-back round trip — Giant Ring (uncompressed flat)', { skip: !referenceCheckout('s1disasm'), meta: { skipReason: S1_ABSENT } }, () => {
  it('zero-edit save is byte-identical; an edit changes only the derived tile records', async () => {
    const ok = await openDiscoveredSet(tempDir, RING_SET, 'uncompressed');
    expect(ok).toBe(true);
    const s = useSpriteStore.getState();
    expect(s.s1ArtSource).not.toBeNull();
    expect(s.s1ArtSource!.compression).toBe('uncompressed');
    expect(s.s1ArtSource!.dplc).toBeUndefined();

    await saveSpriteArt();
    expect(changedOffsets(onDisk('artunc/Giant Ring.unc'), pristine('artunc/Giant Ring.unc'))).toEqual([]);
    expect(onDisk('_maps/Giant Ring.asm')).toEqual(pristine('_maps/Giant Ring.asm'));

    // Now edit one derived pixel and save again (mtime baseline refreshed by
    // the first save — this also exercises the follow-up-save path).
    const src = useSpriteStore.getState().s1ArtSource!;
    const spot = findEditSpot(src.mappings, undefined, s.originX, s.originY, s.frames[0].width, s.frames[0].height, false);
    const before = src.originalTiles[spot.target].pixels[spot.sy * 8 + spot.sx];
    s.frames[spot.f].data[spot.dy * s.frames[spot.f].width + spot.dx] = (before + 1) % 16;

    await saveSpriteArt();
    expect(lastToast()).toMatch(/^Saved art to artunc\/Giant Ring\.unc/);

    const offsets = changedOffsets(onDisk('artunc/Giant Ring.unc'), pristine('artunc/Giant Ring.unc'));
    expect(offsets.length).toBeGreaterThan(0);
    for (const o of offsets) {
      expect(o).toBeGreaterThanOrEqual(spot.target * 32);
      expect(o).toBeLessThan(spot.target * 32 + 32);
    }
    expect(onDisk('_maps/Giant Ring.asm')).toEqual(pristine('_maps/Giant Ring.asm'));
    expect(writtenPaths).toEqual(['artunc/Giant Ring.unc', 'artunc/Giant Ring.unc']);
  });
});
