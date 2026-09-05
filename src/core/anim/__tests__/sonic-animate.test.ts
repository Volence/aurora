// Sonic_Animate preview interpreter — pure-function tests. Semantics are the
// CONFIRMED formulas of docs/reviews/2026-08-21-sonic-animate-live-study.md
// (walk/run/roll live-verified; push static-only per the study's regime
// limits), matched against `_incObj/01 Sonic.asm:2176`. Script bytes come from
// parsing the REAL `_anim/Sonic.asm` — no transcribed fixtures — and every
// expectation below is COMPUTED in-test from the study's formulas:
//
//   walk/run hold reload = max(0, $800 − |inertia|) >> 8, run at |inertia| ≥ $600
//   roll hold reload     = max(0, $400 − |inertia|) >> 8, roll2 at ≥ $600
//   push hold reload     = max(0, $800 − |inertia|) >> 6  (STATIC reading only)
//   rotation offset d3   = walk (oct + oct>>1)×2 ∈ {0,6,12,18}
//                          run   oct×2          ∈ {0,4,8,12}   (oct pre-doubled: &6)
//   oct = (((xflip ? a : ~a) + $10) >> 4) & 6, flips invert when (+$10) wraps bit 7
//
// A duration byte N holds N+1 ticks (subq/bpl), and an anim change advances
// immediately on the next Animate step — both study-confirmed.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { parseSonicAnimTable, sonicSpecialScripts } from '../../import/sonic-anim-import';
import type { SonicSpecialScripts } from '../sonic-animate';
import { referencePath, S1_PINNED } from '../../../../test/support/fixture-tree';
import {
  initialSonicAnimState,
  stepSonicAnimate,
  sonicPreviewAt,
  sonicHoldReload,
  sonicOctant,
} from '../sonic-animate';

const SONIC_ASM = referencePath(S1_PINNED, '_anim/Sonic.asm');
const treePresent = existsSync(SONIC_ASM);
/**
 * `describe`, but a skip here says WHY — read by scripts/skip-report-reporter.mjs.
 * The bare `treePresent ? describe : describe.skip` this replaces produced rows
 * indistinguishable from passes in a suite total.
 */
const guarded = (name: string, fn: () => void): void => {
  describe(name, {
    skip: !treePresent,
    meta: { skipReason: `${SONIC_ASM} is absent: no s1disasm checkout on this machine` },
  }, fn);
};

/**
 * ⚠ CALL THIS ONLY FROM `beforeAll` OR A TEST BODY — never from a `describe`
 * body, even a skipped one.
 *
 * `describe(name, { skip: true }, fn)` STILL RUNS `fn`: the option marks the
 * collected tests skipped, it does not stop collection from executing the
 * callback. So a read in a describe body runs on a machine with no s1disasm and
 * throws during collection, which does not fail one test — it takes the WHOLE
 * FILE, and its 15 tests with it, reported as
 *
 *     FAIL  src/core/anim/__tests__/sonic-animate.test.ts [ …test.ts ]
 *     Error: ENOENT: … open '/home/volence/sonic_hacks/s1disasm/_anim/Sonic.asm'
 *      ❯ realScripts src/core/anim/__tests__/sonic-animate.test.ts:45:37
 *
 * measured 2026-08-29 (docs/reviews/2026-08-29-fixture-absent-honesty.md).
 * `beforeAll` does NOT run inside a skipped describe, which is why the callers
 * below assign through one.
 */
function realScripts(): SonicSpecialScripts {
  const parse = parseSonicAnimTable(readFileSync(SONIC_ASM, 'utf8'));
  const s = sonicSpecialScripts(parse);
  expect(parse.problems).toEqual([]);
  expect(s).not.toBeNull();
  return s!;
}

/** In-test formula twins (the study's confirmed semantics, § Results). */
const holdWalkRun = (inertia: number) => Math.max(0, 0x800 - Math.abs(inertia)) >> 8;
const holdRoll = (inertia: number) => Math.max(0, 0x400 - Math.abs(inertia)) >> 8;
const holdPush = (inertia: number) => Math.max(0, 0x800 - Math.abs(inertia)) >> 6;
const oct = (angle: number, xflip: boolean) => (((xflip ? angle : ~angle & 0xff) + 0x10) >> 4) & 6;
const d3walk = (o: number) => (o + (o >> 1)) * 2;
const d3run = (o: number) => o * 2; // oct already pre-doubled ∈ {0,2,4,6}: run d3 = oct×2 ∈ {0,4,8,12}

/** Walk the interpreter `ticks` steps at constant input; collect obFrame per tick. */
function frameTrace(scripts: SonicSpecialScripts, mode: 'walkrun' | 'roll' | 'push',
  inertia: number, angle: number, xflip: boolean, ticks: number): number[] {
  let st = initialSonicAnimState();
  const out: number[] = [];
  for (let t = 0; t < ticks; t++) {
    st = stepSonicAnimate(st, { mode, inertia, angle, xflip }, scripts);
    out.push(st.frame);
  }
  return out;
}

guarded('sonicHoldReload: the confirmed duration formulas at many inertia points', () => {
  it('walk/run: max(0,$800−|inertia|)>>8 at every distinct observed duration', () => {
    // The study observed every distinct duration 2..8; sweep those + extremes.
    for (const i of [0, 0x80, 0x100, 0x2ff, 0x300, 0x5ff, 0x600, 0x700, 0x7ff, 0x800, 0xc00]) {
      expect(sonicHoldReload('walkrun', i)).toBe(holdWalkRun(i));
      expect(sonicHoldReload('walkrun', -i)).toBe(holdWalkRun(i)); // |inertia|
    }
  });
  it('roll: max(0,$400−|inertia|)>>8', () => {
    for (const i of [0, 0xff, 0x100, 0x2ff, 0x3ff, 0x400, 0x600, 0xc00]) {
      expect(sonicHoldReload('roll', i)).toBe(holdRoll(i));
    }
  });
  it('push: max(0,$800−|inertia|)>>6 (static-only reading, study regime limits)', () => {
    for (const i of [0, 0x100, 0x400, 0x7ff, 0x800, 0xc00]) {
      expect(sonicHoldReload('push', i)).toBe(holdPush(i));
    }
  });
});

guarded('variant selection: the $600 boundary (study-confirmed at exactly $600)', () => {
  let scripts!: SonicSpecialScripts;
  beforeAll(() => { scripts = realScripts(); });
  it('walkrun: $5FF walks, $600 runs (boundary sample took run in the capture)', () => {
    let st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'walkrun', inertia: 0x5ff, angle: 0, xflip: false }, scripts);
    expect(st.variant).toBe('walk');
    expect(st.frame).toBe(scripts.walk[0]); // oct 0 at angle 0 → no offset
    st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'walkrun', inertia: 0x600, angle: 0, xflip: false }, scripts);
    expect(st.variant).toBe('run');
    expect(st.frame).toBe(scripts.run[0]);
  });
  it('roll: $5FF slow roll, $600 fast roll (roll2)', () => {
    let st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'roll', inertia: 0x5ff, angle: 0, xflip: false }, scripts);
    expect(st.variant).toBe('roll');
    st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'roll', inertia: 0x600, angle: 0, xflip: false }, scripts);
    expect(st.variant).toBe('roll2');
  });
});

guarded('rotation fan-out: octant formula and ×6/×4 offsets', () => {
  let scripts!: SonicSpecialScripts;
  beforeAll(() => { scripts = realScripts(); });
  it('sonicOctant matches the formula at both facings across the detent angles', () => {
    for (let a = 0; a < 0x100; a += 0x20) {
      expect(sonicOctant(a, false)).toBe(oct(a, false));
      expect(sonicOctant(a, true)).toBe(oct(a, true));
    }
  });
  it('walk at octant 2 shows script frame + 6; run shows + 4 (non-degenerate, study §Results)', () => {
    // angle $E0, unflipped: ~$E0 = $1F, +$10 = $2F → oct (>>4)&6 = 2.
    const angle = 0xe0;
    const o = oct(angle, false);
    expect(o).toBe(2); // pin the sample point the study verified fan-out at
    let st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'walkrun', inertia: 0x100, angle, xflip: false }, scripts);
    expect(st.frame).toBe(scripts.walk[0] + d3walk(o)); // +6
    st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'walkrun', inertia: 0x700, angle, xflip: false }, scripts);
    expect(st.frame).toBe(scripts.run[0] + d3run(o)); // +4
  });
  it('flip flags: when (adj angle + $10) wraps bit 7, BOTH flips invert', () => {
    // xflip=false, angle $40: ~$40 = $BF, +$10 = $CF → bit7 set → invert.
    let st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'walkrun', inertia: 0x100, angle: 0x40, xflip: false }, scripts);
    expect(st.xFlip).toBe(true);
    expect(st.yFlip).toBe(true);
    // xflip=true, angle $40: $40+$10 = $50 → no invert → keeps facing.
    st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'walkrun', inertia: 0x100, angle: 0x40, xflip: true }, scripts);
    expect(st.xFlip).toBe(true);
    expect(st.yFlip).toBe(false);
  });
  it('roll and push never apply the rotation offset and keep the status facing', () => {
    let st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'roll', inertia: 0x100, angle: 0xe0, xflip: true }, scripts);
    expect(st.frame).toBe(scripts.roll[0]); // no +d3
    expect(st.xFlip).toBe(true);
    expect(st.yFlip).toBe(false);
    st = initialSonicAnimState();
    st = stepSonicAnimate(st, { mode: 'push', inertia: 0x100, angle: 0xe0, xflip: false }, scripts);
    expect(st.frame).toBe(scripts.push[0]);
    expect(st.xFlip).toBe(false);
  });
});

guarded('golden sequences: N-tick traces cycle the 6 script frames + offset', () => {
  let scripts!: SonicSpecialScripts;
  beforeAll(() => { scripts = realScripts(); });

  it('walk at inertia $300, angle 0: frames cycle walk[0..5] holding (reload+1) ticks each', () => {
    const reload = holdWalkRun(0x300); // 5 → each frame held 6 ticks
    const hold = reload + 1;
    const walkFrames = scripts.walk.filter((b) => b < 0x80); // the 6 body frames
    expect(walkFrames.length).toBe(6);
    const trace = frameTrace(scripts, 'walkrun', 0x300, 0, false, hold * 12); // two full cycles
    const expected: number[] = [];
    for (let t = 0; t < hold * 12; t++) expected.push(walkFrames[Math.floor(t / hold) % 6]);
    expect(trace).toEqual(expected);
  });

  it('walk at octant 2 cycles the SAME script with +6 on every frame', () => {
    const reload = holdWalkRun(0x100);
    const hold = reload + 1;
    const o = oct(0xe0, false);
    const walkFrames = scripts.walk.filter((b) => b < 0x80).map((b) => b + d3walk(o));
    const trace = frameTrace(scripts, 'walkrun', 0x100, 0xe0, false, hold * 6);
    const expected: number[] = [];
    for (let t = 0; t < hold * 6; t++) expected.push(walkFrames[Math.floor(t / hold) % 6]);
    expect(trace).toEqual(expected);
  });

  it('run cycles only its 4 real frames (padding afEnds loop, never render)', () => {
    const reload = holdWalkRun(0x700); // run regime
    const hold = reload + 1;
    const runFrames = scripts.run.filter((b) => b < 0x80);
    expect(runFrames.length).toBe(4);
    const trace = frameTrace(scripts, 'walkrun', 0x700, 0, false, hold * 8);
    const expected: number[] = [];
    for (let t = 0; t < hold * 8; t++) expected.push(runFrames[Math.floor(t / hold) % 4]);
    expect(trace).toEqual(expected);
  });

  it('roll cycles its 5 frames at the $400-based cadence', () => {
    const reload = holdRoll(0x200); // 2 → 3 ticks per frame
    const hold = reload + 1;
    const rollFrames = scripts.roll.filter((b) => b < 0x80);
    expect(rollFrames.length).toBe(5);
    const trace = frameTrace(scripts, 'roll', 0x200, 0, false, hold * 10);
    const expected: number[] = [];
    for (let t = 0; t < hold * 10; t++) expected.push(rollFrames[Math.floor(t / hold) % 5]);
    expect(trace).toEqual(expected);
  });

  it('walk→run switch mid-cycle keeps the animation position (no reset: the padding contract)', () => {
    // Advance walk to aniFrame 5 (frame walk[4]), then raise inertia to run
    // speed: the interpreter must read run's body at the SAME index, where the
    // padding afEnd loops it to run[0] — exactly why the file pads specials.
    const reload = holdWalkRun(0x300);
    const hold = reload + 1;
    let st = initialSonicAnimState();
    for (let t = 0; t < hold * 5; t++) st = stepSonicAnimate(st, { mode: 'walkrun', inertia: 0x300, angle: 0, xflip: false }, scripts);
    expect(st.aniFrame).toBe(5);
    // Next advance at run speed reads run body[5] = afEnd → loops to run[0].
    for (let t = 0; t < holdWalkRun(0x700) + 1; t++) {
      st = stepSonicAnimate(st, { mode: 'walkrun', inertia: 0x700, angle: 0, xflip: false }, scripts);
    }
    expect(st.variant).toBe('run');
    expect(st.frame).toBe(scripts.run[0]);
    expect(st.aniFrame).toBe(1);
  });

  it('sonicPreviewAt(tick) equals stepping tick+1 times (pure tick API)', () => {
    const input = { mode: 'walkrun' as const, inertia: 0x480, angle: 0x20, xflip: true };
    let st = initialSonicAnimState();
    for (let t = 0; t <= 25; t++) {
      st = stepSonicAnimate(st, input, scripts);
      const at = sonicPreviewAt(scripts, input, t);
      expect(at.frame).toBe(st.frame);
      expect(at.xFlip).toBe(st.xFlip);
      expect(at.yFlip).toBe(st.yFlip);
    }
  });
});
