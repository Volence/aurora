// Unit proof for the S1 animated-level-art clock (Parcel B of docs/reviews/
// 2026-08-21-s1-viewport-lenses-audit.md §1). Every expectation is HAND-DERIVED
// from the transcribed asm semantics (`subq/bpl` timers reload #N-1 and fire on
// underflow; v_lani* zeroed at level init → every family fires on frame 0), not
// from running the implementation:
//
//   waterfall  fires t=0 (frame 0), 6, 12, …    → frame(t) = ⌊t/6⌋ % 2
//   big flower                                  → frame(t) = ⌊t/16⌋ % 2
//   small flower fires t=0 art0(hold 128), t=128 art1(8), t=136 art2(128),
//     t=264 art1(8), t=272 art0 …               → the uneven 272-frame cycle
//   lava surface blits the INCREMENTED frame    → frame(t) = (⌊t/20⌋+1) % 3
//   torch: counter masked #3, 4 frames          → frame(t) = ⌊t/8⌋ % 4
//   smoke (delay D): fires BLANK at t=0 arming D; delay counts 1..D; the step
//     timer then underflows 8 later → frame1 at D+8, frame s at D+8s, blank at
//     D+64; period D+64. Puff1 D=180 → frame1 at 188, period 244. Puff2 D=120
//     → frame1 at 128, period 184.
//
// The oscillator (magma) is pinned to the LIVE-verified behavior recorded in
// the audit's addendum: byte sweeps 0..$3F, 360-frame period exact.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { referenceCheckout, referenceCheckoutReason, referencePath } from '../../../../test/support/fixture-tree';
import {
  S1_ANIM_FAMILIES,
  animStateKey,
  animTilePatchesAt,
  animatedTilesForZone,
  familiesForZone,
  magmaTileBytes,
  mzOscByteAt,
  smokeSlotTiles,
  smokeStateAt,
  stripFrameAt,
} from '../s1-anim-art';

const S1DIR = referencePath('s1disasm');
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason('s1disasm');
const S1_PRESENT = referenceCheckout('s1disasm');

function fam(id: string) {
  const f = S1_ANIM_FAMILIES.find((x) => x.id === id);
  if (!f) throw new Error(`no family ${id}`);
  return f;
}

describe('strip clocks (hand-derived from AnimateLevelGfx.asm)', () => {
  it('GHZ waterfall alternates 2 frames every 6', () => {
    const t = fam('ghz-waterfall').timing;
    expect([0, 5, 6, 11, 12].map((x) => stripFrameAt(t, x))).toEqual([0, 0, 1, 1, 0]);
  });

  it('GHZ big flower alternates 2 frames every 16', () => {
    const t = fam('ghz-flower-large').timing;
    expect([0, 15, 16, 31, 32].map((x) => stripFrameAt(t, x))).toEqual([0, 0, 1, 1, 0]);
  });

  it('GHZ small flower plays the uneven 272-frame 0(128) 1(8) 2(128) 1(8) cycle', () => {
    // The audit's own test points (§ Proof): t=0/127/128/135/136/263/264/271.
    const t = fam('ghz-flower-small').timing;
    expect(
      [0, 127, 128, 135, 136, 263, 264, 271, 272].map((x) => stripFrameAt(t, x)),
    ).toEqual([0, 0, 1, 1, 2, 2, 1, 1, 0]);
  });

  it('MZ lava surface shows the INCREMENTED frame (1 at t=0), 20 frames each', () => {
    const t = fam('mz-lava-surface').timing;
    expect([0, 19, 20, 39, 40, 59, 60].map((x) => stripFrameAt(t, x))).toEqual([1, 1, 2, 2, 0, 0, 1]);
  });

  it('MZ torch has FOUR frames (mask #3 + the 768-byte file), 8 frames each', () => {
    const t = fam('mz-torch').timing;
    expect([0, 7, 8, 16, 24, 31, 32].map((x) => stripFrameAt(t, x))).toEqual([0, 0, 1, 2, 3, 3, 0]);
  });
});

describe('SBZ smoke machines (hand-derived timelines)', () => {
  it('puff 1 (3 s gap): blank until 188, 7 smoke frames × 8, blank again at 244, period 244', () => {
    expect(
      [0, 187, 188, 195, 196, 236, 243, 244, 431, 432].map((t) => smokeStateAt(180, t)),
    ).toEqual([0, 0, 1, 1, 2, 7, 7, 0, 0, 1]);
  });

  it('puff 2 (2 s gap): blank until 128, frame 7 at 176..183, blank at 184, period 184', () => {
    expect(
      [0, 127, 128, 176, 183, 184, 311, 312].map((t) => smokeStateAt(120, t)),
    ).toEqual([0, 0, 1, 7, 7, 0, 0, 1]);
  });

  it('resting state is BLANK — the first 6 file tiles twice (.clearSky)', () => {
    expect(smokeSlotTiles(0)).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
    expect(smokeSlotTiles(1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(smokeSlotTiles(3)).toEqual(Array.from({ length: 12 }, (_, i) => 24 + i));
  });
});

describe('the magma oscillator (live-verified model: 0..$3F, 360-frame period)', () => {
  it('sweeps exactly 0..$3F', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let t = 0; t < 720; t++) {
      const b = mzOscByteAt(t);
      min = Math.min(min, b);
      max = Math.max(max, b);
    }
    expect(min).toBe(0);
    expect(max).toBe(0x3f);
  });

  it('has a 360-frame period, exact', () => {
    for (let t = 0; t < 400; t++) expect(mzOscByteAt(t + 360)).toBe(mzOscByteAt(t));
    // …and 360 is the FUNDAMENTAL period, not a multiple of it.
    const half = Array.from({ length: 180 }, (_, t) => mzOscByteAt(t));
    const shifted = Array.from({ length: 180 }, (_, t) => mzOscByteAt(t + 180));
    expect(half).not.toEqual(shifted);
  });
});

describe('magma column composition (byte-exact vs AniArt_MZMagma)', () => {
  // Source frame where byte value encodes its own (line, column) position:
  // src[L*$10 + k] = (L*$10 + k) & $FF. The composed output must read, for
  // destination column c line L byte j, source position ((osc+4c+j) & $F).
  const src = new Uint8Array(0x200);
  for (let i = 0; i < 0x200; i++) src[i] = i & 0xff;

  it('shifts each column by osc+4c with $10-byte wraparound', () => {
    const osc = 5;
    const out = magmaTileBytes(src, osc);
    expect(out.length).toBe(16 * 32);
    for (let c = 0; c < 4; c++) {
      const k = (osc + 4 * c) & 0x0f;
      for (const line of [0, 7, 8, 31]) {
        for (let j = 0; j < 4; j++) {
          expect(out[c * 128 + line * 4 + j]).toBe((line * 0x10 + ((k + j) & 0x0f)) & 0xff);
        }
      }
    }
    // Column 2 (k=13) actually wraps: bytes 13,14,15,0.
    expect([...out.subarray(2 * 128, 2 * 128 + 4)]).toEqual([13, 14, 15, 0]);
  });

  it('osc byte $3F reduces mod $10', () => {
    const out = magmaTileBytes(src, 0x3f);
    // c=0 → k=15: bytes 15,0,1,2 of line 0.
    expect([...out.subarray(0, 4)]).toEqual([15, 0, 1, 2]);
  });
});

describe('tile patches', () => {
  it('GHZ waterfall at t=6 patches slots $378.. with file frame 1', () => {
    const file = fam('ghz-waterfall').file;
    const src = new Uint8Array(512);
    for (let i = 0; i < 512; i++) src[i] = i < 256 ? 1 : 2; // frame0=1s, frame1=2s
    const patches = animTilePatchesAt('ghz', 6, new Map([[file, src]]));
    const wf = patches.find((p) => p.start === 0x378);
    expect(wf).toBeDefined();
    expect(wf!.bytes.length).toBe(8 * 32);
    expect(wf!.bytes.every((b) => b === 2)).toBe(true);
  });

  it('covers exactly the playable slots per zone (stalk/ending excluded)', () => {
    const ghz = animatedTilesForZone('ghz');
    expect(ghz.has(0x378)).toBe(true); // waterfall
    expect(ghz.has(0x35c)).toBe(true); // big flower
    expect(ghz.has(0x36c)).toBe(true); // small flower
    expect(ghz.has(0x358)).toBe(false); // static stalk — MUST NOT animate
    expect(ghz.has(0x340)).toBe(false); // ending flowers — cutscene only
    expect(ghz.has(0x390)).toBe(false);
    expect(animatedTilesForZone('lz').size).toBe(0); // AniArt_none
    expect(animatedTilesForZone('syz').size).toBe(0);
    expect(animatedTilesForZone('slz').size).toBe(0);
    expect(animatedTilesForZone('mz').size).toBe(8 + 16 + 6);
    expect(animatedTilesForZone('sbz').size).toBe(24);
  });

  it('missing sources skip their family (never throw)', () => {
    const patches = animTilePatchesAt('mz', 0, new Map());
    expect(patches).toEqual([]);
  });

  it('the state key steps when a family steps and repeats over a full cycle', () => {
    expect(animStateKey('ghz', 0)).not.toBe(animStateKey('ghz', 6)); // waterfall stepped
    // lcm(12, 32, 272) = 1632 — one full GHZ cycle.
    expect(animStateKey('ghz', 1632)).toBe(animStateKey('ghz', 0));
    expect(animStateKey('ghz', 3)).toBe(animStateKey('ghz', 0)); // nothing stepped yet
    // MZ: the magma ticks on even frames, and its key moves only when the
    // shift (osc & $F) moves — the osc byte first leaves 0 at t=10
    // (v = $80 + Σ2i reaches $104 after 11 updates).
    expect(animStateKey('mz', 0)).toBe(animStateKey('mz', 1));
    expect(animStateKey('mz', 0)).toBe(animStateKey('mz', 2)); // osc byte still 0 — no pixel changed
    expect(animStateKey('mz', 0)).not.toBe(animStateKey('mz', 10));
  });
});

describe('real s1disasm sources', { skip: !S1_PRESENT, meta: { skipReason: S1_ABSENT } }, () => {
  it('every family file exists and is frames × tiles × 32 bytes', () => {
    const frameCounts: Record<string, number> = {
      'ghz-waterfall': 2, 'ghz-flower-large': 2, 'ghz-flower-small': 3,
      'mz-lava-surface': 3, 'mz-magma': 3, 'mz-torch': 4,
      // Art_SbzSmoke: 84 tiles = 7 smoke frames × 12 (the blank state reuses
      // tiles 0..5, so 7 stored frames serve the 8-state machine).
      'sbz-smoke-1': 7, 'sbz-smoke-2': 7,
    };
    for (const f of S1_ANIM_FAMILIES) {
      const bytes = fs.readFileSync(path.join(S1DIR, f.file));
      expect(bytes.length, f.id).toBe(frameCounts[f.id] * f.tileCount * 32);
    }
  });

  it("SBZ blank patch equals today's static render source (profile blits offset 0 per 6-tile half)", () => {
    const smoke = fam('sbz-smoke-1');
    const src = new Uint8Array(fs.readFileSync(path.join(S1DIR, smoke.file)));
    const patches = animTilePatchesAt('sbz', 0, new Map([[smoke.file, src]]));
    // t=0 → both machines blank. The profile's static view blits srcTileOffset
    // 0 for each 6-tile half (s1.ts SBZ_ANIM) — i.e. tiles 0..5 at $448, $44E,
    // $454, $45A. The blank patch must be byte-identical to that.
    const half = src.subarray(0, 6 * 32);
    for (const p of patches) {
      expect(p.bytes.length).toBe(12 * 32);
      expect(Buffer.from(p.bytes.subarray(0, 6 * 32)).equals(half)).toBe(true);
      expect(Buffer.from(p.bytes.subarray(6 * 32)).equals(half)).toBe(true);
    }
  });

  it('GHZ waterfall frame-0 patch is byte-identical to the static blit', () => {
    const wf = fam('ghz-waterfall');
    const src = new Uint8Array(fs.readFileSync(path.join(S1DIR, wf.file)));
    const patches = animTilePatchesAt('ghz', 0, new Map([[wf.file, src]]));
    const p = patches.find((x) => x.start === 0x378)!;
    expect(Buffer.from(p.bytes).equals(src.subarray(0, 8 * 32))).toBe(true);
  });

  it('familiesForZone covers exactly ghz/mz/sbz', () => {
    expect(familiesForZone('ghz').length).toBe(3);
    expect(familiesForZone('mz').length).toBe(3);
    expect(familiesForZone('sbz').length).toBe(2);
  });
});
