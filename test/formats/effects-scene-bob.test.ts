import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseEffectsScene,
  serializeEffectsScene,
  EFFECTS_SCENE_SCHEMA,
  type EffectsScene,
  type EffectsSceneLibrary,
} from '../../src/core/formats/effects/scene';
import {
  EFFECTS_BOB_SHIFT_LADDER,
  EFFECTS_BOB_SHIFT_NONE,
  EFFECTS_BOB_AMPLITUDE_BASE,
  EFFECTS_BOB_PERIOD_BOUNDS,
  EFFECTS_BOB_PERIOD_DEFAULT,
  EFFECTS_BOB_PERIOD_BASE_TICKS,
  EFFECTS_BOB_TICKS_PER_SECOND,
  bobPeakPixels,
  bobPeriodTicks,
  bobPeriodSeconds,
  bobShiftRefusal,
  bobShiftOf,
  newEffectsScene,
} from '../../src/core/formats/effects/scene-ui';
import { validateAgainstSchema } from '../../src/core/formats/effects/json-schema-subset';
import {
  BOB_AMPLITUDE_OPTIONS, BOB_PERIOD_OPTIONS, BOB_SHIFT_SEED, BOB_ROW,
  bobEnabled, bobShiftValue, bobPeriodValue, bobLine, bobPeriodLabel,
  bobToggleCommand, setBobShiftCommand, setBobPeriodCommand,
} from '../../src/renderer/providers/effects-aeon';

/**
 * The scene-level vertical bob — the encoding's three traps, each with a row
 * that can fail.
 *
 * empyrean `bc639a10` (`properties.bob_shift`, `properties.bob_period`); aeon
 * `8c75722b` (`engine/level/scene_dsl.emp`'s `scene()` guards and
 * `scene_bob_packed()`). ROADMAP row 99's first split.
 *
 * ═══ WHY THIS FILE IS LONGER THAN THE FEATURE ═══
 *
 * Two integer fields, and a control over them can mean its own opposite in three
 * independent ways:
 *
 *   1. BOTH ARE INVERSE SHIFTS. `bob_shift` 1 is 128 px and 8 is 1 px;
 *      `bob_period` 0 is the FASTEST sway and 8 the slowest. A control that
 *      passes either through as a number drags the wrong way.
 *   2. `bob_shift`'s DOMAIN IS DISCONTINUOUS — exactly 15, or 1..8. 0 and 9..14
 *      are refused by aeon's `scene()`. A range control cannot express that.
 *   3. THE SENTINEL INVERTS AT THE LOWERING. The DOCUMENT's off is 15; the WIRE
 *      byte `pcfg_bob`'s off is 0, because `scene_bob_packed()` folds an
 *      authored 15 into the packed 0. They are OPPOSITE ENDS OF THE RANGE. A
 *      slider clamped 0..15 authors 15 meaning MAXIMUM while the engine reads NO
 *      BOB; a control treating 0 as "off" authors the NARROWEST LEGAL SWAY,
 *      shift 0 being illegal precisely because it would pack to the no-bob byte.
 *
 * EVERY EXPECTATION BELOW IS DERIVED FROM THE SCHEMA WALKED BY HAND — never from
 * the module's own constants read back to it, and never from a literal copied
 * out of the contract. `S` is `JSON.parse` of the vendored file; the hole set,
 * the ladder, the sentinel and the pixel map all come from it. A schema
 * amendment moves this file's subject with it instead of leaving it asserting a
 * shape that no longer exists.
 */

const S = JSON.parse(readFileSync(
  resolve(__dirname, '../../src/core/formats/effects/aurora-effects-scene.schema.json'), 'utf8',
)) as { properties: Record<string, Record<string, unknown>> };

const SHIFT_NODE = S.properties.bob_shift;
const PERIOD_NODE = S.properties.bob_period;
const SHIFT_ARMS = SHIFT_NODE.anyOf as Record<string, unknown>[];
/** The sentinel, walked out of the schema's own `anyOf` constant arm. */
const SENTINEL = SHIFT_ARMS.find(a => typeof a.const === 'number')!.const as number;
/** The ladder, walked out of the schema's own range arm. */
const LADDER = (() => {
  const arm = SHIFT_ARMS.find(a => typeof a.minimum === 'number')!;
  return { min: arm.minimum as number, max: arm.maximum as number };
})();
/**
 * The HOLE — every value from 0 up to the sentinel that neither arm admits.
 * COMPUTED, so "0 and 9..14" never appears here as a literal.
 */
const HOLE = Array.from({ length: SENTINEL + 1 }, (_, i) => i)
  .filter(v => v !== SENTINEL && (v < LADDER.min || v > LADDER.max));

function library(scenes: EffectsScene[]): EffectsSceneLibrary {
  return { scenes, unreadable: [], notices: [] };
}
/** A scene with a bob, built through the control's own affordances. */
function bobbing(id = 'probe'): EffectsScene {
  const scene = newEffectsScene(id);
  scene.bob_shift = BOB_SHIFT_SEED;
  return scene;
}
/** The scene a command would write, or fail loudly — commands are values here. */
function applied(command: { newScene: EffectsScene | null } | null): EffectsScene {
  expect(command, 'the command was a no-op; nothing to apply').not.toBeNull();
  expect(command!.newScene, 'the command deletes the scene').not.toBeNull();
  return command!.newScene!;
}

describe('the bob is READ OUT of the schema, not restated beside it', () => {
  it('derives the ladder, the sentinel and the amplitude base from the contract', () => {
    // Anti-vacuous: the schema really carries the field, spelled as `anyOf`.
    expect(SHIFT_ARMS).toHaveLength(2);
    expect(EFFECTS_BOB_SHIFT_LADDER).toEqual(LADDER);
    expect(EFFECTS_BOB_SHIFT_NONE).toBe(SENTINEL);
    // The amplitude base: the description's formula, checked against the ladder's
    // own worked ends rather than against a number typed here.
    expect(EFFECTS_BOB_AMPLITUDE_BASE >> LADDER.min).toBe(bobPeakPixels(LADDER.min));
    expect(/peak excursion (\d+) >> bob_shift px/.exec(SHIFT_NODE.description as string)![1])
      .toBe(String(EFFECTS_BOB_AMPLITUDE_BASE));
  });

  it('derives the period bounds, base tick count and tick rate from the contract', () => {
    expect(EFFECTS_BOB_PERIOD_BOUNDS)
      .toEqual({ min: PERIOD_NODE.minimum, max: PERIOD_NODE.maximum });
    expect(EFFECTS_BOB_PERIOD_DEFAULT).toBe(PERIOD_NODE.default);
    expect(/one full sway is (\d+) << bob_period ticks/.exec(PERIOD_NODE.description as string)![1])
      .toBe(String(EFFECTS_BOB_PERIOD_BASE_TICKS));
    // The Hz is pinned by the description's own worked gloss, not typed: 256
    // ticks and "about 4.3 s" only agree at one rate.
    const gloss = /about ([\d.]+) s at (\d+) Hz/.exec(PERIOD_NODE.description as string)!;
    expect(EFFECTS_BOB_TICKS_PER_SECOND).toBe(Number(gloss[2]));
    expect(Math.round(bobPeriodSeconds(EFFECTS_BOB_PERIOD_BOUNDS.min) * 10) / 10)
      .toBe(Number(gloss[1]));
  });
});

describe('TRAP 1 — both fields are INVERSE, and the control shows the quantity', () => {
  it('the amplitude ladder runs from the LARGEST sway at the SMALLEST shift', () => {
    const { min, max } = LADDER;
    expect(min).toBeLessThan(max);
    // Monotone DECREASING: the whole reason a raw spinner reads backwards.
    expect(bobPeakPixels(min)).toBeGreaterThan(bobPeakPixels(max));
    for (let s = min; s < max; s += 1) {
      expect(bobPeakPixels(s + 1)).toBeLessThan(bobPeakPixels(s));
    }
  });

  it('offers the ladder in ASCENDING PIXELS, which is descending shift', () => {
    expect(BOB_AMPLITUDE_OPTIONS).toHaveLength(LADDER.max - LADDER.min + 1);
    const px = BOB_AMPLITUDE_OPTIONS.map(o => o.px);
    expect(px).toEqual([...px].sort((a, b) => a - b));
    const shifts = BOB_AMPLITUDE_OPTIONS.map(o => o.shift);
    expect(shifts).toEqual([...shifts].sort((a, b) => b - a));
    // Each option says its PIXELS, and no option anywhere says its shift — the
    // exponent must not reach the screen.
    for (const o of BOB_AMPLITUDE_OPTIONS) {
      expect(o.px).toBe(bobPeakPixels(o.shift));
      expect(o.label).toBe(`${o.px} px`);
    }
  });

  it('the period ladder is an inverse too: the FIRST option is the FASTEST', () => {
    expect(BOB_PERIOD_OPTIONS).toHaveLength(EFFECTS_BOB_PERIOD_BOUNDS.max
      - EFFECTS_BOB_PERIOD_BOUNDS.min + 1);
    expect(BOB_PERIOD_OPTIONS[0].period).toBe(EFFECTS_BOB_PERIOD_BOUNDS.min);
    expect(BOB_PERIOD_OPTIONS[0].seconds)
      .toBeLessThan(BOB_PERIOD_OPTIONS[BOB_PERIOD_OPTIONS.length - 1].seconds);
    for (const o of BOB_PERIOD_OPTIONS) {
      expect(o.seconds).toBe(bobPeriodTicks(o.period) / EFFECTS_BOB_TICKS_PER_SECOND);
      // Seconds or minutes — never a raw tick count, and never a shift.
      expect(o.label).toMatch(/^(\d+(\.\d)? s|\d+m \d+s)$/);
    }
    // The slowest rung really is minutes, which is the fact the label exists to
    // make legible: nobody reads 65,536 ticks as "eighteen minutes".
    expect(bobPeriodLabel(EFFECTS_BOB_PERIOD_BOUNDS.max)).toMatch(/^\d+m \d+s$/);
  });
});

describe('TRAP 2 — the discontinuity is UNREACHABLE through the UI', () => {
  it('the schema really does have a hole, in two runs, containing 0', () => {
    // Anti-vacuous for every row below: if this were empty they would all pass
    // by having nothing to check.
    expect(HOLE.length).toBeGreaterThan(1);
    expect(HOLE).toContain(0);
    expect(HOLE).toContain(LADDER.max + 1);
    expect(HOLE).not.toContain(SENTINEL);
  });

  it('the codec REFUSES every value in the hole, and accepts every legal one', () => {
    for (const bad of HOLE) {
      const issues = validateAgainstSchema(bad, SHIFT_NODE, EFFECTS_SCENE_SCHEMA);
      expect(issues, `bob_shift ${bad} must be refused`).not.toEqual([]);
    }
    for (const good of [SENTINEL, ...BOB_AMPLITUDE_OPTIONS.map(o => o.shift)]) {
      expect(validateAgainstSchema(good, SHIFT_NODE, EFFECTS_SCENE_SCHEMA),
        `bob_shift ${good} must be accepted`).toEqual([]);
    }
  });

  it('NO CONTROL AFFORDANCE OFFERS a value in the hole', () => {
    const offered = BOB_AMPLITUDE_OPTIONS.map(o => o.shift);
    for (const bad of HOLE) expect(offered, `the ladder offers ${bad}`).not.toContain(bad);
    // The list is exactly the legal ladder — not a superset the UI then polices.
    expect(offered.slice().sort((a, b) => a - b))
      .toEqual(Array.from({ length: LADDER.max - LADDER.min + 1 }, (_, i) => LADDER.min + i));
  });

  it('the setter REFUSES a hole value rather than clamping it into one', () => {
    const lib = library([bobbing()]);
    for (const bad of HOLE) {
      expect(bobShiftRefusal(bad), `${bad} must be refused`).not.toBeNull();
      expect(() => setBobShiftCommand(lib, 'probe', bad), `setter accepted ${bad}`)
        .toThrow(new RegExp(`refusing to author bob_shift ${bad}\\b`));
    }
    // ...and it is not refusing everything: every ladder rung goes through.
    // A FRESH still scene each time, so the no-op guard cannot make a rung look
    // accepted by returning null for a value that was already there.
    for (const good of BOB_AMPLITUDE_OPTIONS.map(o => o.shift)) {
      expect(bobShiftRefusal(good)).toBeNull();
      const fresh = library([newEffectsScene('probe')]);
      expect(applied(setBobShiftCommand(fresh, 'probe', good)).bob_shift).toBe(good);
    }
  });

  /**
   * ⚠ THE TWO CLAMPS THAT WOULD HAVE BEEN WRITTEN, each shown authoring the
   * opposite of what its caller asked for. Neither is hypothetical: one of them
   * is the single most obvious line to write for a bounded integer field, and
   * this repo already reaches for it eight times (`clampVFactor`,
   * `clampVCenter`, `clampAmpShift`, …). These rows are what makes replacing the
   * refusal above with a clamp go RED, naming the end that inverted.
   */
  it('clamping INTO the ladder inverts both ends', () => {
    const clamp = (v: number) => Math.min(LADDER.max, Math.max(LADDER.min, v));
    // From the SCHEMA's ladder, not from the module's own option list: this row
    // is about what the contract's ends mean, and deriving them from the thing
    // under test would let a widened list quietly redefine "widest".
    const widest = bobPeakPixels(LADDER.min);
    const narrowest = bobPeakPixels(LADDER.max);

    // A caller that meant NONE (0, the wire's off) lands on the LOUDEST sway.
    expect(clamp(0)).toBe(LADDER.min);
    expect(bobPeakPixels(clamp(0))).toBe(widest);
    // A caller that meant OFF (the sentinel, the document's off) lands on a
    // sway — quiet, but a sway, on a scene that asked for stillness.
    expect(clamp(SENTINEL)).toBe(LADDER.max);
    expect(bobPeakPixels(clamp(SENTINEL))).toBe(narrowest);
    expect(clamp(SENTINEL)).not.toBe(SENTINEL);
  });

  it('a slider over the RAW 0..15 span puts OFF at the top and SILENCE at the bottom', () => {
    // The roadmap's spelling of the hazard: a control bounded by the field's
    // apparent span rather than by its legal domain. Its top reads as "maximum"
    // to an author and is the engine's NO BOB; its bottom reads as "minimum" and
    // is the one shift that packs to the wire's no-bob byte.
    const span = Array.from({ length: SENTINEL + 1 }, (_, i) => i);
    expect(Math.max(...span)).toBe(SENTINEL);
    expect(Math.min(...span)).toBe(0);
    // Both ends of that slider are OUTSIDE the ladder the author can actually use.
    expect(BOB_AMPLITUDE_OPTIONS.map(o => o.shift)).not.toContain(Math.max(...span));
    expect(BOB_AMPLITUDE_OPTIONS.map(o => o.shift)).not.toContain(Math.min(...span));
    // ...and most of that slider's travel is not authorable at all.
    expect(HOLE.length / span.length).toBeGreaterThan(0.25);
  });
});

describe('TRAP 3 — the document\'s off is the sentinel, and the wire\'s off is 0', () => {
  it('the sentinel is ABOVE the ladder, not below it', () => {
    // The single fact that makes "clamp toward 0" the wrong instinct.
    expect(SENTINEL).toBeGreaterThan(LADDER.max);
    expect(SENTINEL).not.toBe(0);
    expect(SHIFT_NODE.default).toBe(SENTINEL);
  });

  /**
   * aeon's `scene_bob_packed()` at `8c75722b`, modelled here — the ONE place
   * Aurora spells the lowering, and only to assert what it forbids. Aurora never
   * emits this byte; the model exists so the collision that makes shift 0 illegal
   * is a measured claim rather than a sentence in a comment.
   */
  const packed = (shift: number, period: number) =>
    (shift === SENTINEL ? 0 : ((shift << 4) | period));

  it('the document off (15) and the wire off (0) are OPPOSITE ENDS', () => {
    expect(packed(SENTINEL, 0)).toBe(0);
    // ...and no legal sway packs to the wire's off, at any period.
    for (const { shift } of BOB_AMPLITUDE_OPTIONS) {
      for (const { period } of BOB_PERIOD_OPTIONS) {
        expect(packed(shift, period), `shift ${shift} period ${period} packed to silence`)
          .not.toBe(0);
      }
    }
    // WHY SHIFT 0 IS ILLEGAL, demonstrated rather than asserted: it is the one
    // shift that would collide with no-bob on the wire.
    expect(0 & 0xf0).toBe(0);
    expect(((0 << 4) | EFFECTS_BOB_PERIOD_DEFAULT)).toBe(packed(SENTINEL, 0));
    expect(HOLE).toContain(0);
  });

  it('turning the bob OFF writes no key at all — never 0, never 15', () => {
    const lib = library([bobbing()]);
    const off = applied(bobToggleCommand(lib, 'probe', false));
    expect('bob_shift' in off).toBe(false);
    expect('bob_period' in off).toBe(false);
    expect(bobEnabled(off)).toBe(false);
    // Anti-vacuous: it really was on before.
    expect(bobEnabled(lib.scenes[0])).toBe(true);
  });

  it('a scene that spells the default KEEPS its spelling, and still reads as off', () => {
    const explicit = newEffectsScene('probe');
    explicit.bob_shift = SENTINEL;
    expect(bobShiftOf(explicit)).toBeNull();
    expect(bobEnabled(explicit)).toBe(false);
    // Toggling off an already-off scene is a no-op command, not a rewrite.
    expect(bobToggleCommand(library([explicit]), 'probe', false)).toBeNull();
  });

  it('the row\'s own hint says off is the sentinel and NOT 0', () => {
    expect(BOB_ROW.hint).toContain(String(SENTINEL));
    expect(BOB_ROW.hint).toMatch(/never 0/);
  });
});

describe('bob_period is omitted, and ignored, when the scene does not sway', () => {
  it('turning the bob off takes the period with it, in ONE command', () => {
    const scene = bobbing();
    scene.bob_period = EFFECTS_BOB_PERIOD_BOUNDS.max;
    const lib = library([scene]);
    const off = applied(bobToggleCommand(lib, 'probe', false));
    expect('bob_period' in off).toBe(false);
    // ONE undo step: the two keys left in the same command's `next`.
    expect('bob_shift' in off).toBe(false);
  });

  it('refuses to write a period onto a scene that does not sway', () => {
    const still = library([newEffectsScene('probe')]);
    expect(setBobPeriodCommand(still, 'probe', EFFECTS_BOB_PERIOD_BOUNDS.max)).toBeNull();
    // ...and does write one when the scene sways, so the null above is a refusal
    // and not a broken setter.
    expect(applied(setBobPeriodCommand(library([bobbing()]), 'probe',
      EFFECTS_BOB_PERIOD_BOUNDS.max)).bob_period).toBe(EFFECTS_BOB_PERIOD_BOUNDS.max);
  });

  it('writes no key for the schema default, because absent already means it', () => {
    const scene = bobbing();
    scene.bob_period = EFFECTS_BOB_PERIOD_BOUNDS.max;
    const back = applied(setBobPeriodCommand(library([scene]), 'probe', EFFECTS_BOB_PERIOD_DEFAULT));
    expect('bob_period' in back).toBe(false);
    expect(bobPeriodValue(back)).toBe(EFFECTS_BOB_PERIOD_DEFAULT);
  });

  it('refuses a period outside the contract rather than clamping it', () => {
    const lib = library([bobbing()]);
    for (const bad of [EFFECTS_BOB_PERIOD_BOUNDS.min - 1, EFFECTS_BOB_PERIOD_BOUNDS.max + 1]) {
      expect(() => setBobPeriodCommand(lib, 'probe', bad)).toThrow(/refusing to author bob_period/);
    }
  });
});

describe('a scene with no bob round-trips BYTE-IDENTICALLY', () => {
  /**
   * aeon's own shipped scene, vendored and currency-checked by
   * test/formats/aeon-fixture-currency.test.ts. THE POPULATION IS EVERY SAVED
   * SCENE: no file in either tree carries either key today, so "the bob costs an
   * untouched file nothing" is a claim about real bytes and not about a fixture
   * written to make it true.
   */
  const SHIPPED_PATH = resolve(__dirname, '../fixtures/effects/ojz_act1_depth.json');
  const SHIPPED = readFileSync(SHIPPED_PATH, 'utf8');

  it('aeon\'s shipped scene carries NEITHER key — the anti-vacuous half', () => {
    const doc = JSON.parse(SHIPPED) as Record<string, unknown>;
    expect('bob_shift' in doc).toBe(false);
    expect('bob_period' in doc).toBe(false);
    // ...and it is a real scene, so the two absences are not absence of a file.
    expect(Object.keys(doc).length).toBeGreaterThan(5);
  });

  it('parse -> serialize returns the identical bytes', () => {
    expect(serializeEffectsScene(parseEffectsScene(SHIPPED, 'ojz_act1_depth'))).toBe(SHIPPED);
  });

  it('...and still does after the bob is switched ON and back OFF', () => {
    const scene = parseEffectsScene(SHIPPED, 'ojz_act1_depth');
    const lib = library([scene]);
    const on = applied(bobToggleCommand(lib, 'ojz_act1_depth', true));
    // Anti-vacuous: the round trip below only means something if something moved.
    expect(serializeEffectsScene(on)).not.toBe(SHIPPED);
    expect(bobEnabled(on)).toBe(true);

    const withPeriod = applied(setBobPeriodCommand(library([on]), 'ojz_act1_depth',
      EFFECTS_BOB_PERIOD_BOUNDS.max));
    const off = applied(bobToggleCommand(library([withPeriod]), 'ojz_act1_depth', false));
    expect(serializeEffectsScene(off)).toBe(SHIPPED);
  });

  it('a NEW scene omits both keys, so the default costs a file nothing', () => {
    const fresh = newEffectsScene('probe', 'Probe');
    const text = serializeEffectsScene(fresh);
    expect(text).not.toContain('bob_shift');
    expect(text).not.toContain('bob_period');
    expect(bobEnabled(fresh)).toBe(false);
  });
});

describe('the form\'s displayed state', () => {
  it('seeds a MIDPOINT amplitude — neither end of the ladder', () => {
    expect(BOB_SHIFT_SEED).toBeGreaterThan(LADDER.min);
    expect(BOB_SHIFT_SEED).toBeLessThan(LADDER.max);
    expect(bobShiftRefusal(BOB_SHIFT_SEED)).toBeNull();
    // A toggle-on that produced no visible change would read as a broken toggle;
    // one that produced half the plane's height would read as a fault.
    expect(bobPeakPixels(BOB_SHIFT_SEED)).toBeGreaterThan(bobPeakPixels(LADDER.max));
    expect(bobPeakPixels(BOB_SHIFT_SEED)).toBeLessThan(bobPeakPixels(LADDER.min));
  });

  it('shows the seed on a still scene without having written it', () => {
    const still = newEffectsScene('probe');
    expect(bobShiftValue(still)).toBe(BOB_SHIFT_SEED);
    expect('bob_shift' in still).toBe(false);
  });

  it('reads out the bob in pixels and time, and says nothing when it is off', () => {
    expect(bobLine(newEffectsScene('probe'))).toBeNull();
    const scene = bobbing();
    scene.bob_period = EFFECTS_BOB_PERIOD_BOUNDS.min;
    expect(bobLine(scene)).toBe(
      `${bobPeakPixels(BOB_SHIFT_SEED)} px peak, one sway every `
      + `${bobPeriodLabel(EFFECTS_BOB_PERIOD_BOUNDS.min)}`,
    );
    // No exponent reaches the readout.
    expect(bobLine(scene)).not.toContain('shift');
  });

  it('every authorable combination validates as a whole document', () => {
    for (const { shift } of BOB_AMPLITUDE_OPTIONS) {
      for (const { period } of BOB_PERIOD_OPTIONS) {
        const scene = newEffectsScene('probe');
        scene.bob_shift = shift;
        scene.bob_period = period;
        expect(() => serializeEffectsScene(scene), `shift ${shift} period ${period}`).not.toThrow();
      }
    }
  });
});
