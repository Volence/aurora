// The factor decoder, against the CONTRACT's own list of names.
//
// The interesting rows here are the two that can only fail if something real is
// wrong:
//
//   • COVERAGE — every name the schema publishes has a triple. A missing entry
//     resolves to null and `decodeFactorScroll` returns 0, i.e. a band that
//     should scroll is silently nailed down. Driving the list from
//     EFFECTS_FACTOR_NAMES (which is read out of the vendored schema, not typed)
//     means a contract that gains a factor goes red here instead of shipping a
//     dead band.
//   • AGREEMENT — the fraction each NAME spells equals the ratio its TRIPLE
//     produces. This is the row that would have caught a transcription slip in
//     EFFECTS_FACTOR_PACKED, and it is stated in the direction that matters:
//     the triple is the definition and the name is checked against it.
//
// The name-parsing here is test-only ON PURPOSE. Nothing in src may derive a
// factor from its name — the whole point of the decoder is that the packed
// triple is the definition — so the parser that turns 'FACTOR_3_16' into 3/16
// lives here, where it is a second independent statement of the same fact
// rather than the fact itself.

import { describe, it, expect } from 'vitest';
import {
  EFFECTS_FACTOR_PACKED, EFFECTS_FACTOR_SENTINEL,
  packFactor, resolveFactor, factorIsLocked, decodeFactorScroll, hscrollWord,
  factorRatio, factorRatioLabel,
} from '../../src/core/formats/effects/factor-decode';
import { EFFECTS_FACTOR_NAMES } from '../../src/core/formats/effects/scene-ui';
import type { EffectsFactorName } from '../../src/core/formats/effects/scene';

/** 'FACTOR_3_16' -> 3/16, 'FACTOR_1' -> 1/1, 'FACTOR_LOCKED'/'FACTOR_0' -> 0/1. */
function fractionFromName(name: EffectsFactorName): { num: number; den: number } {
  if (name === 'FACTOR_LOCKED' || name === 'FACTOR_0') return { num: 0, den: 1 };
  const tail = name.slice('FACTOR_'.length).split('_').map(Number);
  if (tail.length === 1) return { num: tail[0], den: 1 };
  return { num: tail[0], den: tail[1] };
}

describe('EFFECTS_FACTOR_PACKED: coverage of the published set', () => {
  it('has a triple for every name the schema publishes', () => {
    const missing = EFFECTS_FACTOR_NAMES.filter((n) => resolveFactor(n) === null);
    expect(missing).toEqual([]);
    // And the list is the schema's, not a hand-count: assert it is non-trivial
    // so an empty enum could not make the row above vacuously green.
    expect(EFFECTS_FACTOR_NAMES.length).toBeGreaterThanOrEqual(16);
  });

  it('adds no name the schema does not publish', () => {
    const extra = Object.keys(EFFECTS_FACTOR_PACKED)
      .filter((k) => !(EFFECTS_FACTOR_NAMES as readonly string[]).includes(k));
    expect(extra).toEqual([]);
  });

  it('every triple is in the packed form the encoding allows', () => {
    for (const name of EFFECTS_FACTOR_NAMES) {
      const p = resolveFactor(name)!;
      expect(p.s1, name).toBeGreaterThanOrEqual(0);
      expect(p.s1, name).toBeLessThanOrEqual(15);
      expect(p.s2, name).toBeGreaterThanOrEqual(0);
      expect(p.s2, name).toBeLessThanOrEqual(15);
      expect([0, 1], name).toContain(p.op);
    }
  });
});

describe('AGREEMENT: the name spells the fraction the triple computes', () => {
  // ⚠ The one table the report prints. Every published name, its triple, the
  // ratio the triple gives, and the fraction the name spells.
  for (const name of EFFECTS_FACTOR_NAMES) {
    it(`${name}`, () => {
      const p = resolveFactor(name)!;
      const fromTriple = factorRatio(name);
      const fromName = fractionFromName(name);
      expect({ name, ...fromTriple }).toEqual({ name, ...fromName });
      // And the triple is what produced it — a hardcoded ratio table would pass
      // the line above and fail this one.
      expect(factorRatio(p)).toEqual(fromTriple);
    });
  }
});

describe('packFactor: the one numeric fact aeon asserts about the encoding', () => {
  it('FACTOR_LOCKED packs to $0FF', () => {
    // aeon scene_dsl.emp:72 pins this across two modules: "scene_dsl's inlined
    // locked-factor encoding ($0FF) drifted from parallax_dsl.FACTOR_0".
    expect(packFactor(EFFECTS_FACTOR_PACKED.FACTOR_LOCKED)).toBe(0x0ff);
    expect(packFactor(EFFECTS_FACTOR_PACKED.FACTOR_0)).toBe(0x0ff);
  });

  it('every published factor packs to a nonzero 9-bit value', () => {
    // scene_dsl.emp:631-633: "Every FACTOR_* is nonzero (even FACTOR_LOCKED is
    // $0FF), so a zero fa cannot come from any authored layer" — the fact
    // scene()'s pad guard discriminates on.
    for (const name of EFFECTS_FACTOR_NAMES) {
      const packed = packFactor(resolveFactor(name)!);
      expect(packed, name).toBeGreaterThan(0);
      expect(packed, name).toBeLessThanOrEqual(0x1ff);
    }
  });

  it('the packing is bit-for-bit aeon\'s `packed()`', () => {
    expect(packFactor({ s1: 0, s2: 2, op: 1 })).toBe((1 << 8) | (2 << 4) | 0); // FACTOR_3_4
    expect(packFactor({ s1: 2, s2: 4, op: 0 })).toBe((0 << 8) | (4 << 4) | 2); // FACTOR_5_16
  });
});

describe('THE SENTINEL: 15 is not a shift', () => {
  it('s1 == 15 returns 0 for every camera X, including the ones a shift would not', () => {
    // ⚠ WHERE THIS ROW BITES, said plainly. For camX in 0..32767, `camX >> 15`
    // is 0 and 0 is the identity for both + and -, so a decoder that treated
    // the sentinel as an ordinary shift would return the SAME NUMBER as this
    // one — which is exactly why the mistake survives review. The values below
    // are the ones where the two functions differ: negative camX (asr.w
    // sign-fills to -1) and camX at or past $8000 (which wraps NEGATIVE in the
    // signed word the engine holds the camera in).
    for (const camX of [-1, -16, -1000, -32768]) {
      expect(decodeFactorScroll(camX, 'FACTOR_LOCKED'), `camX=${camX}`).toBe(0);
      expect(decodeFactorScroll(camX, 'FACTOR_0'), `camX=${camX}`).toBe(0);
    }
  });

  it('s1 == 15 is recognised STRUCTURALLY, which is the check that works at any camX', () => {
    expect(factorIsLocked('FACTOR_LOCKED')).toBe(true);
    expect(factorIsLocked('FACTOR_0')).toBe(true);
    expect(factorIsLocked({ s1: EFFECTS_FACTOR_SENTINEL, s2: 3, op: 0 })).toBe(true);
    expect(factorIsLocked('FACTOR_1_16')).toBe(false);
    expect(factorIsLocked({ s1: 4, s2: EFFECTS_FACTOR_SENTINEL, op: 0 })).toBe(false);
  });

  it('s2 == 15 is SINGLE-TERM, not a second shift', () => {
    // Same visibility caveat as above for op 0. With op 1 and a negative camX
    // the two spellings diverge: (camX>>4) - (camX>>15) = (camX>>4) + 1.
    expect(decodeFactorScroll(-64, { s1: 4, s2: EFFECTS_FACTOR_SENTINEL, op: 1 })).toBe(-4);
    expect(decodeFactorScroll(-64, { s1: 4, s2: 15 as number, op: 1 } as never)).toBe(-4);
    // The single-term arm never consults op at all.
    expect(decodeFactorScroll(1000, { s1: 4, s2: 15, op: 0 })).toBe(
      decodeFactorScroll(1000, { s1: 4, s2: 15, op: 1 }),
    );
  });

  it('an unknown name is treated as locked, not as a crash', () => {
    expect(decodeFactorScroll(1000, 'FACTOR_9_9' as EffectsFactorName)).toBe(0);
    expect(factorIsLocked('FACTOR_9_9' as EffectsFactorName)).toBe(true);
  });
});

describe('decodeFactorScroll: the shift-add, term by term', () => {
  it('single-term factors are a plain asr', () => {
    expect(decodeFactorScroll(1000, 'FACTOR_1')).toBe(1000);
    expect(decodeFactorScroll(1000, 'FACTOR_1_2')).toBe(500);
    expect(decodeFactorScroll(1000, 'FACTOR_1_16')).toBe(62);   // 1000>>4, not 62.5
    expect(decodeFactorScroll(1000, 'FACTOR_1_32')).toBe(31);
  });

  it('two-term factors combine with the op', () => {
    expect(decodeFactorScroll(1000, 'FACTOR_3_4')).toBe(1000 - 250);
    expect(decodeFactorScroll(1000, 'FACTOR_3_8')).toBe(250 + 125);
    expect(decodeFactorScroll(1000, 'FACTOR_7_16')).toBe(500 - 62);
    expect(decodeFactorScroll(1000, 'FACTOR_15_16')).toBe(1000 - 62);
  });

  it('TRUNCATES PER TERM, so it is NOT camX * num / den', () => {
    // The file docblock's own example. Three different numbers; the decode is
    // the first one and nothing else is offered.
    expect(decodeFactorScroll(7, 'FACTOR_3_4')).toBe(6);
    expect(7 * 3 / 4).toBe(5.25);
    expect(Math.floor(7 * 3 / 4)).toBe(5);
    // 3/16 = camX>>3 + camX>>4: two truncations, so it can sit a whole pixel
    // under the exact product's floor.
    expect(decodeFactorScroll(100, 'FACTOR_3_16')).toBe(12 + 6);
    expect(Math.floor(100 * 3 / 16)).toBe(18);
    expect(decodeFactorScroll(31, 'FACTOR_3_16')).toBe(3 + 1);
    expect(Math.floor(31 * 3 / 16)).toBe(5);
  });

  it('is asr, not lsr: negative camera X rounds toward -inf', () => {
    expect(decodeFactorScroll(-1, 'FACTOR_1_16')).toBe(-1);
    expect(decodeFactorScroll(-16, 'FACTOR_1_16')).toBe(-1);
    expect(decodeFactorScroll(-17, 'FACTOR_1_16')).toBe(-2);
  });

  it('works in a signed 16-bit word, where the engine holds the camera', () => {
    expect(decodeFactorScroll(0x8000, 'FACTOR_1')).toBe(-32768);
    expect(decodeFactorScroll(0x7fff, 'FACTOR_1')).toBe(32767);
  });

  it('a packed triple and its equivalent name decode identically', () => {
    for (const camX of [0, 1, 7, 319, 1000, -1000]) {
      for (const name of EFFECTS_FACTOR_NAMES) {
        expect(decodeFactorScroll(camX, name), `${name}@${camX}`)
          .toBe(decodeFactorScroll(camX, resolveFactor(name)!));
      }
    }
  });
});

describe('the DIFFERENTIAL property the preview rests on', () => {
  // A single camera position proves nothing about factors — every band shows
  // SOME column of the plane whatever the decoder does. The property is that
  // moving the camera moves the bands by DIFFERENT amounts, in the ratio the
  // factors name.
  it('over a camera move, band displacement is in the factors\' own ratio', () => {
    const move = 256; // exactly divisible by every published denominator
    const at = (f: EffectsFactorName, x: number) => decodeFactorScroll(x, f);
    for (const [f, expected] of [
      ['FACTOR_1', 256], ['FACTOR_1_2', 128], ['FACTOR_1_4', 64], ['FACTOR_1_8', 32],
      ['FACTOR_1_16', 16], ['FACTOR_1_32', 8], ['FACTOR_3_4', 192], ['FACTOR_3_8', 96],
      ['FACTOR_3_16', 48], ['FACTOR_5_8', 160], ['FACTOR_5_16', 80], ['FACTOR_7_8', 224],
      ['FACTOR_7_16', 112], ['FACTOR_15_16', 240], ['FACTOR_LOCKED', 0],
    ] as [EffectsFactorName, number][]) {
      expect(at(f, move) - at(f, 0), f).toBe(expected);
    }
  });

  it('a 1/2 band outruns a 1/16 band by exactly eight to one', () => {
    const half = decodeFactorScroll(320, 'FACTOR_1_2') - decodeFactorScroll(0, 'FACTOR_1_2');
    const sixteenth = decodeFactorScroll(320, 'FACTOR_1_16') - decodeFactorScroll(0, 'FACTOR_1_16');
    expect(half).toBe(160);
    expect(sixteenth).toBe(20);
    expect(half / sixteenth).toBe(8);
  });

  it('a 1/16 band needs SIXTEEN camera pixels to move one: the arrow-key step', () => {
    expect(decodeFactorScroll(15, 'FACTOR_1_16')).toBe(0);
    expect(decodeFactorScroll(16, 'FACTOR_1_16')).toBe(1);
    // and a 1/32 band needs thirty-two, which is why one step is not enough
    // for every band and the shift step is 16 rather than 32.
    expect(decodeFactorScroll(16, 'FACTOR_1_32')).toBe(0);
    expect(decodeFactorScroll(32, 'FACTOR_1_32')).toBe(1);
  });
});

describe('hscrollWord: the engine\'s negation, kept named', () => {
  it('is the decode negated', () => {
    expect(hscrollWord(1000, 'FACTOR_1_2')).toBe(-500);
    expect(hscrollWord(1000, 'FACTOR_LOCKED')).toBe(0);
  });
});

describe('factorRatioLabel', () => {
  it('reads as the fraction, or as locked', () => {
    expect(factorRatioLabel('FACTOR_LOCKED')).toBe('locked');
    expect(factorRatioLabel('FACTOR_1')).toBe('1');
    expect(factorRatioLabel('FACTOR_3_16')).toBe('3/16');
    expect(factorRatioLabel({ s1: 1, s2: 2, op: 0 })).toBe('3/4');
  });
});
