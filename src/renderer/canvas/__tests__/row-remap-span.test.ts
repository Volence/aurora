// A ROW REMAP'S REACH AGAINST THE BAND IT SITS IN.
//
// WHAT THIS FILE CAN AND CANNOT SAY. It can prove the arithmetic matches the
// engine's `n = min(|p|, span/2)`, that the boundaries sit where aeon's two
// branches sit, that the check refuses to answer on the scenes where the span is
// a per-frame quantity, and that nothing here refuses an author anything. It
// CANNOT see React, so it says NOTHING about whether the sentence reaches the
// screen; the CDP capture under docs/captures/2026-09-05-plane-y/ is what says
// that, and this file's existence must not be read as covering it.
//
// EXPECTATIONS ARE DERIVED FROM aeon a2bb5904, engine/level/parallax.emp:
//   :3714-3721  H = 1 << hshift, |p| clamped into 0..H-1
//   :3753-3757  span = end - top; span >>= 1; beq -> .remap_none; n = min(|p|, span/2)
// The numbers below are computed from those two lines in the test, not typed in
// from a run of the function under test.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  rowRemapBandSpan, rowRemapReachAdvisory, rowRemapSpanRestriction,
} from '../row-remap-span';
import { planeVscroll } from '../camera-preview';
import { ROW_REMAP_HEIGHT_OPTIONS } from '../../providers/effects-aeon';
import {
  EFFECTS_ROW_REMAP_HEIGHT_SHIFTS, rowRemapHeightShiftRefusal, rowRemapHeightLines,
  rowRemapPlaneYRefusal, EFFECTS_V_FACTOR_LOCK,
} from '../../../core/formats/effects/scene-ui';
import type { EffectsScene, EffectsLayer } from '../../../core/formats/effects/scene';

const layer = (world_y: number, rowRemap?: EffectsLayer['rowRemap']): EffectsLayer => ({
  world_y, fa: 'FACTOR_1', fb: 'FACTOR_1', ...(rowRemap === undefined ? {} : { rowRemap }),
});

/** A LOCKED scene: `v_factor` at the lock sentinel, so tops ARE plane rows. */
const locked = (layers: EffectsLayer[], v_offset = 0): EffectsScene =>
  ({ schema: 1, id: 'test', layers, v_factor: EFFECTS_V_FACTOR_LOCK, v_offset });

/** The same tops on a scene whose plane tracks the camera. */
const unlocked = (layers: EffectsLayer[]): EffectsScene =>
  ({ schema: 1, id: 'test', layers, v_factor: 3, v_center: 0, v_offset: 0 });

const remap = (plane_y: number, height_shift: number): EffectsLayer['rowRemap'] =>
  ({ plane_y, height_shift });

// The engine's own two branches, as predicates over the same inputs the function
// gets. Written from the .emp lines quoted in the header rather than from the
// module under test, so a sign or an off-by-one in either is a disagreement
// rather than a shared mistake.
const engineReach = (span: number, heightShift: number): number =>
  Math.min((1 << heightShift) - 1, span >> 1);
const engineRemapsNothing = (span: number): boolean => (span >> 1) === 0;

describe('the band span, from the engine\'s Step 4a', () => {
  it('is the distance to the NEXT layer\'s top', () => {
    const s = locked([layer(0), layer(96, remap(96, 4)), layer(160)]);
    expect(rowRemapBandSpan(s, 1)).toEqual({ spanLines: 64, screenTop: 96, restriction: null });
  });

  it('runs the LAST band to screen line 224, which the engine moves in as an immediate', () => {
    const s = locked([layer(0), layer(160, remap(160, 4))]);
    expect(rowRemapBandSpan(s, 1).spanLines).toBe(224 - 160);
  });

  it('follows v_offset through the rotation instead of assuming an identity', () => {
    // At v_offset 100 the band containing plane row 100 is forced to screen row
    // 0, so the spans are NOT the raw top differences. A check that subtracted
    // consecutive world_y values would answer 96/64/... here and be wrong on
    // every band; this asserts the rotation is actually consulted.
    const tops = [layer(0), layer(96, remap(96, 4)), layer(160)];
    const flat = rowRemapBandSpan(locked(tops, 0), 1).spanLines;
    const shifted = rowRemapBandSpan(locked(tops, 100), 1).spanLines;
    expect(flat).toBe(64);
    expect(shifted).not.toBe(flat);
  });

  it('does not read the camera, because the lock arm never does', () => {
    // ⚠ THE INDEPENDENCE IS ASSERTED, NOT COMMENTED. `rowRemapBandSpan` hands
    // `planeVscroll` a constant 0 for camY; if that arm ever started reading it,
    // the constant would silently become a CHOSEN camera reported as general.
    const s = locked([layer(0), layer(96, remap(96, 4)), layer(160)], 40);
    for (const camY of [-5000, 0, 1, 512, 30000]) {
      expect(planeVscroll(s, camY), `camY=${camY}`).toBe(40);
    }
  });
});

describe('the reach advisory: n = min(|p|, span/2)', () => {
  it('fires exactly where the engine\'s halved span falls short of H-1', () => {
    // A CENSUS over every legal shift and every band height 0..224, with the
    // verdict derived from the engine's two lines independently of the function
    // under test. A predicate with the comparison one off, or the shift and the
    // line count confused, fails over a whole region rather than on whichever
    // example got written down.
    let fired = 0;
    let silent = 0;
    for (const shift of EFFECTS_ROW_REMAP_HEIGHT_SHIFTS) {
      for (let nextTop = 1; nextTop <= 224; nextTop++) {
        const s = locked([layer(0, remap(0, shift)), layer(nextTop)]);
        const span = rowRemapBandSpan(s, 0).spanLines as number;
        expect(span).toBe(nextTop);
        const shouldFire = engineReach(span, shift) < (1 << shift) - 1;
        const got = rowRemapReachAdvisory(s, 0);
        expect(got === null, `shift=${shift} span=${span}`).toBe(!shouldFire);
        if (got === null) silent++; else fired++;
      }
    }
    // BOTH STATES OCCUR, so neither arm is vacuous. A function that returned
    // null always, or a sentence always, fails here rather than passing half the
    // census by accident.
    expect(fired).toBeGreaterThan(0);
    expect(silent).toBeGreaterThan(0);
  });

  it('says DOES NOTHING, not merely capped, on a band under two lines', () => {
    // aeon's `lsr.w #1, d2 / beq .remap_none`. Span 0 and span 1 both halve to
    // zero; span 2 does not. The boundary is asserted from BOTH sides.
    for (const span of [0, 1]) {
      const s = locked([layer(0, remap(0, 4)), layer(span)]);
      expect(engineRemapsNothing(span)).toBe(true);
      expect(rowRemapReachAdvisory(s, 0)).toMatch(/does nothing/);
    }
    const two = locked([layer(0, remap(0, 4)), layer(2)]);
    expect(engineRemapsNothing(2)).toBe(false);
    const sentence = rowRemapReachAdvisory(two, 0);
    expect(sentence).not.toBeNull();
    expect(sentence).not.toMatch(/does nothing/);
    expect(sentence).toMatch(/capped at 1 line\b/);
  });

  it('reports the cap and the shortfall as the engine computes them', () => {
    // span 8 with H=16: reach 4, deepest step 15, so 11 steps unreachable.
    const s = locked([layer(0, remap(0, 4)), layer(8)]);
    expect(engineReach(8, 4)).toBe(4);
    expect(rowRemapHeightLines(4) - 1 - engineReach(8, 4)).toBe(11);
    const sentence = rowRemapReachAdvisory(s, 0) as string;
    expect(sentence).toMatch(/8 screen lines/);
    expect(sentence).toMatch(/capped at 4 lines/);
    expect(sentence).toMatch(/deepest step moves 15/);
    expect(sentence).toMatch(/11 of those steps/);
  });

  it('names the cap as the PROTECTION, so the symptom read is clipped not garbled', () => {
    // aeon:3746-3752 says the cap is what keeps the reads inside this band; a
    // sentence that implied the overrun still happens would send the author
    // hunting a corruption that the engine already prevents.
    const sentence = rowRemapReachAdvisory(locked([layer(0, remap(0, 4)), layer(8)]), 0) as string;
    expect(sentence).toMatch(/clipped effect and not a broken one/);
    expect(sentence).toMatch(/reading inside this band/);
  });

  it('says nothing at all for a layer with no remap, or with "none"', () => {
    const s = locked([layer(0), layer(1)]);
    expect(rowRemapReachAdvisory(s, 0)).toBeNull();
    const off = locked([{ ...layer(0), rowRemap: 'none' }, layer(1)]);
    expect(rowRemapReachAdvisory(off, 0)).toBeNull();
    // ...and the anti-vacuity twin: the SAME one-line band DOES fire once the
    // remap is on, so "null" above is about the key and not about the span.
    expect(rowRemapReachAdvisory(locked([layer(0, remap(0, 4)), layer(1)]), 0)).not.toBeNull();
  });
});

describe('the restriction, said out loud rather than as silence', () => {
  it('refuses to answer on an unlocked scene, and the panel gets the reason', () => {
    const s = unlocked([layer(0, remap(0, 4)), layer(8)]);
    expect(rowRemapBandSpan(s, 0).spanLines).toBeNull();
    expect(rowRemapReachAdvisory(s, 0)).toBeNull();
    const why = rowRemapSpanRestriction(s, 0) as string;
    expect(why).toMatch(/per-frame/);
    expect(why).toMatch(/tracks the camera vertically/);
  });

  it('DISTINGUISHES "did not run" from "found nothing", which is the whole point', () => {
    // The same tops on a locked scene fire the advisory and carry NO
    // restriction; on an unlocked one they carry a restriction and NO advisory.
    // A panel reading only the advisory would show identical silence for a
    // checked-and-clean band and an unchecked one.
    const tops = [layer(0, remap(0, 4)), layer(8)];
    expect(rowRemapReachAdvisory(locked(tops), 0)).not.toBeNull();
    expect(rowRemapSpanRestriction(locked(tops), 0)).toBeNull();
    expect(rowRemapReachAdvisory(unlocked(tops), 0)).toBeNull();
    expect(rowRemapSpanRestriction(unlocked(tops), 0)).not.toBeNull();
  });

  it('carries no restriction for a layer with no remap on either kind of scene', () => {
    expect(rowRemapSpanRestriction(locked([layer(0), layer(8)]), 0)).toBeNull();
    expect(rowRemapSpanRestriction(unlocked([layer(0), layer(8)]), 0)).toBeNull();
  });
});

describe('advice, not prevention, and no clearance', () => {
  it('leaves EVERY height option enabled, including the ones it warns about', () => {
    // The ruling `rowRemapPreconditions` and `curveFieldOptions` already carry:
    // aeon's generator accepts these documents, so a control that refused one
    // would be a bound Aurora invented, and an author who opened a hand-authored
    // scene could not see their own file in the list. Asserted on the SAME scene
    // the advisory fires on, so "enabled" is measured where it matters.
    const short = locked([layer(0, remap(0, 7)), layer(8)]);
    expect(rowRemapReachAdvisory(short, 0)).not.toBeNull();
    expect(ROW_REMAP_HEIGHT_OPTIONS.map((o) => o.shift))
      .toEqual([...EFFECTS_ROW_REMAP_HEIGHT_SHIFTS]);
    for (const shift of EFFECTS_ROW_REMAP_HEIGHT_SHIFTS) {
      expect(rowRemapHeightShiftRefusal(shift), `shift ${shift}`).toBeNull();
    }
  });

  it('never turns a warned value into a refused one', () => {
    // Census: wherever the reach advisory fires, the two REFUSALS on this key
    // still pass the same numbers. The document stays legal and still saves.
    for (const shift of EFFECTS_ROW_REMAP_HEIGHT_SHIFTS) {
      for (const span of [0, 1, 2, 8, 31, 224]) {
        const s = locked([layer(0, remap(0, shift)), layer(span)]);
        if (rowRemapReachAdvisory(s, 0) === null) continue;
        expect(rowRemapHeightShiftRefusal(shift)).toBeNull();
        expect(rowRemapPlaneYRefusal(0)).toBeNull();
      }
    }
  });

  it('has no passing string ANYWHERE: the clean arm is silence', () => {
    // ⚠ THE SENTENCE ELSEWHERE IN THIS REPO WAS REWRITTEN TODAY FOR THIS REASON.
    // `floor(span/2) >= H-1` means one failure is absent, out of a list that
    // includes whether the camera travels vertically here at all. So the module
    // must not be able to say anything reassuring, and the way to assert that is
    // to read the source rather than to enumerate outputs.
    const src = readFileSync(
      fileURLToPath(new URL('../row-remap-span.ts', import.meta.url)), 'utf8');
    // Only the prose that FORBIDS a clearance may mention one; no string literal
    // may. Every quoted string in the module, checked as a set.
    const literals = src.match(/'(?:[^'\\]|\\.)*'/g) ?? [];
    expect(literals.length).toBeGreaterThan(4);
    for (const lit of literals) {
      expect(lit, lit).not.toMatch(/\b(ok|fine|good|correct|valid|passes|clear)\b/i);
    }
    // And the clean arm really is `null` rather than an empty string, which a
    // panel would render as a blank warning row.
    expect(rowRemapReachAdvisory(locked([layer(0, remap(0, 4)), layer(224)]), 0)).toBeNull();
  });

  it('is called by NOTHING on the write path', () => {
    // The same shape `advisoryLayerDeformConflicts` and `rowRemapPreconditions`
    // are held to: an advisory that a command or a codec consulted would have
    // become a refusal by another name.
    const callers = ['src/core/formats/effects/scene.ts', 'src/core/editing/commands.ts'];
    for (const rel of callers) {
      const src = readFileSync(fileURLToPath(new URL(`../../../../${rel}`, import.meta.url)), 'utf8');
      expect(src, rel).not.toMatch(/rowRemapReachAdvisory|rowRemapBandSpan|rowRemapSpanRestriction/);
    }
  });
});
