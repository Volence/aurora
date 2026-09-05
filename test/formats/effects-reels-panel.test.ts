import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseEffectsScene, serializeEffectsScene,
  EFFECTS_SCENE_SCHEMA, EFFECTS_REEL_BAND_COUNT, EFFECTS_REEL_RATE_BOUNDS,
  type EffectsScene, type EffectsSceneLibrary,
} from '../../src/core/formats/effects/scene';
import {
  validateAgainstSchema, type JsonSchema,
} from '../../src/core/formats/effects/json-schema-subset';
import {
  EFFECTS_DRIFT_UNITS_PER_PIXEL, driftRateRefusal,
  EFFECTS_REELS_DEBUG_NOTE, EFFECTS_REELS_BINDING_NOTE, EFFECTS_REEL_NO_X256,
  EFFECTS_REEL_STRIP_WIDTH_PX, EFFECTS_REEL_COLS_PER_BAND, EFFECTS_REEL_PHASE_SPAN,
  EFFECTS_REEL_RATE_GUIDANCE, EFFECTS_REEL_X256_SURVIVORS, EFFECTS_REEL_X256_FULLY_CAUGHT,
  reelStripScreenX, reelCycleFrames, reelCycleLabel,
  reelRateRefusal, reelRatesRefusal, reelRateGuidance,
} from '../../src/core/formats/effects/scene-ui';
import {
  REELS_ROW, REEL_RATE_SEED,
  reelsEnabled, reelRatesValue, reelStripLabel, reelStripTitle,
  reelRateWriteRefusal, reelsToggleCommand, setReelRateCommand, reelsBindingAdvisories,
} from '../../src/renderer/providers/effects-aeon';

/**
 * `reels` — the AUTHORING half of EFFECTS-W1 DoD item 10 (EW-REELS-PANEL).
 *
 * The codec half is `effects-reels.test.ts` and
 * `docs/reviews/2026-09-04-ew-reels-codec.md`; nothing here re-asserts what that
 * file already holds about bytes. What this file is for is the four hazards a
 * CONTROL can get wrong that a codec cannot, plus the one claim the codec packet
 * left open.
 *
 * ═══ HOW THE EXPECTATIONS ARE OBTAINED ═══
 *
 * `S` is `JSON.parse` of the vendored schema, walked BY HAND. Every number and
 * every sentence below is taken from that walk and compared to what the modules
 * derived — never the other way round, and never against a literal. A row that
 * compares `EFFECTS_REEL_STRIP_WIDTH_PX` to `64` proves that two people typed
 * the same number; a row that compares it to the description clause it was
 * extracted from proves the extraction.
 *
 * ═══ THE VACUOUS SHAPES THIS FILE MUST NOT HAVE ═══
 *
 *   • A MEMBERSHIP ASSERTION ON `rates` PASSES UNDER A SORT, and hazard 3 is
 *     exactly that a sort relocates every strip. Every order row below compares
 *     the EXACT SEQUENCE, and the subject sequences are chosen DESCENDING so a
 *     sort would have to move them.
 *
 *   • "NOTHING MULTIPLIED BY 256" IS TRUE OF A FUNCTION THAT DID NOTHING. The
 *     identity row walks the WHOLE legal span and requires each write to land,
 *     so a command that returned null throughout would fail it before the ×256
 *     rows are reached.
 *
 *   • A PANEL-SOURCE ASSERTION CANNOT SEE A BROWSER. These rows say the
 *     component REFERENCES the derived sentence and does not carry a typed copy
 *     of it. Whether it is PAINTED is `scratchpad/reels-panel-harness.mjs`'s
 *     question, under CDP, and it is not answered here.
 *
 * ⚠ NO EMULATOR, AND NO CLAIM ABOUT ONE. aeon's generator arm for `reels` does
 * not exist yet and the effect is DEBUG-tier, so nothing authored here reaches a
 * ROM and nothing below says it does.
 */

const S = JSON.parse(readFileSync(
  resolve(__dirname, '../../src/core/formats/effects/aurora-effects-scene.schema.json'), 'utf8',
)) as { properties: Record<string, Record<string, unknown>> };

const REELS_NODE = S.properties.reels;
const REELS_DESC = REELS_NODE.description as string;
const RATES_NODE = (REELS_NODE.properties as Record<string, JsonSchema>).rates;

const PANEL_SRC = readFileSync(
  resolve(__dirname, '../../src/renderer/components/effects/EffectsScenePanel.tsx'), 'utf8');

function library(scenes: EffectsScene[]): EffectsSceneLibrary {
  return { scenes, unreadable: [], notices: [], loadedPaths: [] };
}

function scene(reels?: { rates: number[] }): EffectsScene {
  const s: EffectsScene = {
    schema: 1,
    id: 'reel_panel_probe',
    layers: [{ world_y: 0, fa: 'FACTOR_1', fb: 'FACTOR_1' }],
    v_factor: 1,
  };
  if (reels !== undefined) s.reels = reels;
  return s;
}

function applied(command: { newScene: EffectsScene | null } | null): EffectsScene {
  expect(command, 'the command was a no-op; nothing to apply').not.toBeNull();
  expect(command!.newScene, 'the command deletes the scene').not.toBeNull();
  return command!.newScene!;
}

/**
 * `n` distinct legal rates, DESCENDING from the top of the span — so any sort
 * anywhere on the path has to move them, and a membership assertion could not
 * tell the difference.
 */
function descendingRates(n = EFFECTS_REEL_BAND_COUNT): number[] {
  return Array.from({ length: n }, (_, i) => EFFECTS_REEL_RATE_BOUNDS.max - i);
}

// ---------------------------------------------------------------------------

describe('§2.7 the panel\'s facts are EXTRACTED from the contract, never typed', () => {
  it('the DEBUG sentence the panel is required to paint is the schema\'s own words', () => {
    // Anti-vacuous first: the description really does carry the requirement, so
    // a row that found nothing would be measuring an empty string against an
    // empty string.
    expect(REELS_DESC).toMatch(/editor panel must say so on screen/);

    // Both halves are SUBSTRINGS of the description — extracted, not composed.
    expect(REELS_DESC).toContain(EFFECTS_REELS_DEBUG_NOTE.full);
    expect(REELS_DESC).toContain(EFFECTS_REELS_DEBUG_NOTE.short);
    // The painted half is the short one and it really is shorter.
    expect(EFFECTS_REELS_DEBUG_NOTE.full).toContain(EFFECTS_REELS_DEBUG_NOTE.short);
    expect(EFFECTS_REELS_DEBUG_NOTE.short.length)
      .toBeLessThan(EFFECTS_REELS_DEBUG_NOTE.full.length);
    // And it says the thing no keyword can: nothing renders in a release build.
    expect(EFFECTS_REELS_DEBUG_NOTE.short).toMatch(/release build/);
  });

  it('the binding rule the panel keeps always-on is aeon\'s sentence, not Aurora\'s', () => {
    expect(REELS_DESC).toContain(EFFECTS_REELS_BINDING_NOTE.full);
    expect(REELS_DESC).toContain(EFFECTS_REELS_BINDING_NOTE.short);
    expect(EFFECTS_REELS_BINDING_NOTE.short).toMatch(/REFUSES a reels key/);
    // It names the two rungs that are NOT an editor sceneRef, which is the whole
    // content of the rule; a sentence that named neither would be decoration.
    expect(EFFECTS_REELS_BINDING_NOTE.short).toMatch(/preset/);
    expect(EFFECTS_REELS_BINDING_NOTE.short).toMatch(/act default/);
  });

  it('the ×256 prohibition shown with a refused rate is the contract\'s clause', () => {
    expect(REELS_DESC).toContain(EFFECTS_REEL_NO_X256);
    expect(EFFECTS_REEL_NO_X256).toMatch(/MUST NOT be applied here/);
    // The worked example the contract itself gives — 768 for an intended 3 — is
    // in the sentence the author reads, which is why this is extracted whole.
    expect(EFFECTS_REEL_NO_X256).toContain(String(3 * EFFECTS_DRIFT_UNITS_PER_PIXEL));
  });

  it('the strip geometry is walked out of the description and cross-checked', () => {
    // Walk it here, BY HAND, from the same prose the module read.
    const x = /screen X (\d+)i\.\.(\d+)i\+(\d+)/.exec(REELS_DESC)!;
    const c = /column-pairs (\d+)i\.\.(\d+)i\+(\d+)/.exec(REELS_DESC)!;
    expect(EFFECTS_REEL_STRIP_WIDTH_PX).toBe(Number(x[1]));
    expect(EFFECTS_REEL_COLS_PER_BAND).toBe(Number(c[1]));
    // The two statements are of ONE geometry: whole column-pairs per strip.
    expect(EFFECTS_REEL_STRIP_WIDTH_PX % EFFECTS_REEL_COLS_PER_BAND).toBe(0);
  });

  it('the phase span agrees with BOTH sentences that state it', () => {
    expect(EFFECTS_REEL_PHASE_SPAN).toBe(Number(/wraps mod (\d+)/.exec(REELS_DESC)![1]));
    expect(EFFECTS_REEL_PHASE_SPAN).toBe(Number(/(\d+)\/\|rate\| frames/.exec(REELS_DESC)![1]));
    // The readout is that span over the magnitude, and 0 has no cycle at all.
    expect(reelCycleFrames(1)).toBe(EFFECTS_REEL_PHASE_SPAN);
    expect(reelCycleFrames(-2)).toBe(EFFECTS_REEL_PHASE_SPAN / 2);
    expect(reelCycleFrames(0)).toBeNull();
  });

  it('a stationary strip READS AS STATIONARY, never as a blank', () => {
    // Hazard 2 in the readout: 0 is a deliberate value, so the one control state
    // that means "this strip does not move" must not look like a control nobody
    // filled in. A null/empty label here would be the defect.
    expect(reelCycleLabel(0)).toMatch(/stationary/i);
    expect(reelCycleLabel(0).length).toBeGreaterThan(0);
    expect(reelCycleLabel(3)).toMatch(/frames per cycle/);
  });
});

describe('§2.7 GUIDANCE IS NOT A BOUND: the contract says so in as many words', () => {
  it('the useful range sits strictly inside the legal span and never refuses', () => {
    const g = EFFECTS_REEL_RATE_GUIDANCE;
    const b = EFFECTS_REEL_RATE_BOUNDS;
    // ANTI-VACUOUS: if guidance equalled the bound, every row below would pass
    // while the distinction the contract insists on had been lost.
    expect(g.min).toBeGreaterThan(b.min);
    expect(g.max).toBeLessThan(b.max);
    expect(g.strobe).toBeGreaterThan(g.max);
    expect(g.strobe).toBeLessThanOrEqual(b.max);
    // Outside the guidance, inside the bound: ADVICE, and no refusal.
    const beyond = g.max + 1;
    expect(reelRateRefusal(beyond)).toBeNull();
    expect(reelRateGuidance(beyond)).not.toBeNull();
    // A strobe is likewise legal.
    expect(reelRateRefusal(g.strobe)).toBeNull();
    expect(reelRateGuidance(g.strobe)).toMatch(/strobe/);
    // Inside the guidance, nothing is said at all.
    expect(reelRateGuidance(g.max)).toBeNull();
  });

  it('the panel spinner is bounded by the SCHEMA, never by the guidance', () => {
    // The guidance must not have leaked into a control's range. Read the source:
    // the reel box's min/max are EFFECTS_REEL_RATE_BOUNDS and the guidance
    // constant is not in this component at all.
    expect(PANEL_SRC).toContain('min={EFFECTS_REEL_RATE_BOUNDS.min}');
    expect(PANEL_SRC).toContain('max={EFFECTS_REEL_RATE_BOUNDS.max}');
    expect(PANEL_SRC).not.toContain('EFFECTS_REEL_RATE_GUIDANCE');
  });
});

describe('HAZARD 1: the unit collision, and the hole the codec packet left open', () => {
  it('every ×256 of a legal NONZERO rate is refused', () => {
    const { min, max } = EFFECTS_REEL_RATE_BOUNDS;
    let checked = 0;
    for (let r = min; r <= max; r++) {
      if (r === 0) continue;
      expect(reelRateRefusal(r * EFFECTS_DRIFT_UNITS_PER_PIXEL),
        `${r} px/frame put through drift's ×${EFFECTS_DRIFT_UNITS_PER_PIXEL}`).not.toBeNull();
      checked++;
    }
    // The span is a real span and the factor is a real factor — otherwise the
    // loop above could have run zero times and still "passed".
    expect(checked).toBe(max - min);
    expect(EFFECTS_DRIFT_UNITS_PER_PIXEL).toBeGreaterThan(1);
    // The contract's own worked example, spelled out.
    expect(3 * EFFECTS_DRIFT_UNITS_PER_PIXEL).toBe(768);
    expect(reelRateRefusal(768)).toMatch(/SIGNED WHOLE PIXELS PER FRAME/);
  });

  /**
   * ⚠⚠ THE CODEC PACKET'S ONE NAMED HOLE, RE-DERIVED — AND IT IS CLOSED.
   *
   * `docs/reviews/2026-09-04-ew-reels-codec.md` §4.1 says: "0 × 256 = 0, which
   * is legal. A panel that applied the drift conversion to a document of
   * all-zero rates would emit a *legal* document. Nothing catches that."
   *
   * That is right about the BOUND and one keyword short of the schema. `rates`
   * also carries `uniqueItems`, so an all-zero array of BAND_COUNT elements is
   * BAND_COUNT equal values and is refused. The census below is the argument as
   * a computation: a ×256'd document survives `items` only if every rate is a
   * survivor, and survives `uniqueItems` only if the five are distinct — so
   * while there are fewer survivors than strips, NO ×256'd document is legal.
   *
   * The rows walk the real validator over the real node, so this is a fact about
   * the committed schema and not about my arithmetic.
   */
  it('the ×256 mistake is caught for EVERY document, not merely every nonzero rate', () => {
    // 1. The census is exactly the rates whose ×256 survives the bound — walked
    //    here by hand from the schema node rather than read back off the module.
    const min = (RATES_NODE.items as JsonSchema).minimum as number;
    const max = (RATES_NODE.items as JsonSchema).maximum as number;
    const byHand: number[] = [];
    for (let r = min; r <= max; r++) {
      const converted = r * EFFECTS_DRIFT_UNITS_PER_PIXEL;
      if (converted >= min && converted <= max) byHand.push(r);
    }
    expect([...EFFECTS_REEL_X256_SURVIVORS]).toEqual(byHand);
    // 2. And 0 really is the only one, which is the packet's own observation.
    expect(byHand).toEqual([0]);
    // 3. Fewer survivors than strips ⇒ no ×256'd document can be both in-bound
    //    and pairwise distinct.
    expect(byHand.length).toBeLessThan(EFFECTS_REEL_BAND_COUNT);
    expect(EFFECTS_REEL_X256_FULLY_CAUGHT).toBe(true);
    // 4. THE MEASUREMENT, not the argument: the all-zero document the packet
    //    calls legal is refused by the COMMITTED SCHEMA, through the codec's own
    //    validator, naming uniqueness.
    const allZero = Array.from({ length: EFFECTS_REEL_BAND_COUNT }, () => 0);
    const issues = validateAgainstSchema(allZero, RATES_NODE, EFFECTS_SCENE_SCHEMA);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.map(i => i.message).join(' ')).toMatch(/uniqueItems|duplicate|distinct/i);
    // 5. ANTI-VACUOUS: uniqueItems is what did that. ONE zero among four
    //    distinct rates is perfectly legal, so the refusal above is about the
    //    repetition and not about the value.
    const oneZero = [0, ...descendingRates(EFFECTS_REEL_BAND_COUNT - 1)];
    expect(validateAgainstSchema(oneZero, RATES_NODE, EFFECTS_SCENE_SCHEMA)).toEqual([]);
    // 6. And Aurora's control refuses it before a command is ever built.
    expect(reelRatesRefusal(allZero)).not.toBeNull();
  });

  it('the write path is the IDENTITY over the whole legal span', () => {
    // The strongest available statement of "no conversion happens here": for
    // every rate the schema admits, the document ends up holding exactly that
    // integer. A ×256, a ÷256, a clamp or a round would all fail it.
    const { min, max } = EFFECTS_REEL_RATE_BOUNDS;
    const base = scene({ rates: descendingRates() });
    let written = 0;
    for (let r = min; r <= max; r++) {
      // Strip 0 already holds the top of the span and its four siblings sit
      // just below it, so those five values are either a no-op or a duplicate;
      // skip exactly them and COUNT what was really exercised.
      if (descendingRates().includes(r)) continue;
      const next = applied(setReelRateCommand(library([base]), base.id, 0, r));
      expect(next.reels!.rates[0], `writing ${r}`).toBe(r);
      written++;
    }
    // The whole span minus the five skipped — spelled from the bounds so a
    // widened contract moves the count rather than the row.
    expect(written).toBe((max - min + 1) - EFFECTS_REEL_BAND_COUNT);
  });

  it('no reels function reaches for drift\'s converters', () => {
    // A backup for the identity row above, discriminating a different mutation:
    // a converter applied and then undone would survive identity, and this
    // reads the function bodies themselves rather than the file (which is full
    // of legitimate drift code).
    const bodies = [
      setReelRateCommand, reelsToggleCommand, reelRateWriteRefusal,
      reelRatesValue, reelRateRefusal, reelRatesRefusal,
    ].map(f => f.toString()).join('\n');
    for (const forbidden of [
      'driftPxPerFrameToRate', 'driftRateToPxPerFrame', 'EFFECTS_DRIFT_UNITS_PER_PIXEL',
    ]) {
      expect(bodies, `${forbidden} must not appear on the reels path`)
        .not.toContain(forbidden);
    }
    // Anti-vacuous: the bodies really were read.
    expect(bodies).toContain('reels');
  });
});

describe('HAZARD 2: zero is a value, and the two keys rule on it oppositely', () => {
  it('reels accepts 0 where drift refuses it: asserted as a CONTRAST', () => {
    // A row that only checked reels would pass if someone gave both keys the
    // same ruling. The contrast is the claim.
    expect(reelRateRefusal(0)).toBeNull();
    expect(driftRateRefusal(0)).not.toBeNull();
  });

  it('uniqueItems caps the stationary strip at one, and the refusal names both', () => {
    const s = scene({ rates: [0, ...descendingRates(EFFECTS_REEL_BAND_COUNT - 1)] });
    // The first zero is already there; a second one is refused.
    const why = reelRateWriteRefusal(s, 1, 0);
    expect(why).not.toBeNull();
    expect(why).toMatch(/strips 0 and 1/);
    expect(why).toMatch(/PAIRWISE DISTINCT/);
    // And the sentence says zero is legal, so the author is not told the wrong
    // thing about the value they typed.
    expect(why).toMatch(/Zero IS a legal rate/);
    // The command refuses it too rather than clamping or substituting.
    expect(() => setReelRateCommand(library([s]), s.id, 1, 0)).toThrow(/PAIRWISE DISTINCT/);
  });

  it('a duplicate of a NONZERO rate is refused on the same rule', () => {
    const rates = descendingRates();
    const s = scene({ rates });
    expect(reelRateWriteRefusal(s, 0, rates[3])).toMatch(/PAIRWISE DISTINCT/);
    // …and re-typing a strip's OWN current value is not a duplicate.
    expect(reelRateWriteRefusal(s, 0, rates[0])).toBeNull();
  });

  it('the box asks about the ARRAY, which is the only way uniqueItems is visible', () => {
    // The mistake this rules out: a control that passed `reelRateRefusal`
    // straight to NumberField's `refuse`. That function cannot see a sibling and
    // would have accepted the duplicate above.
    const s = scene({ rates: [0, ...descendingRates(EFFECTS_REEL_BAND_COUNT - 1)] });
    expect(reelRateRefusal(0)).toBeNull();
    expect(reelRateWriteRefusal(s, 1, 0)).not.toBeNull();
    expect(PANEL_SRC).toContain('refuse={(n) => reelRateWriteRefusal(selected, i, n)}');
  });
});

describe('HAZARD 3: screen order is array order, and nothing here reorders', () => {
  it('the strips tile the screen contiguously, in index order', () => {
    const spans = Array.from({ length: EFFECTS_REEL_BAND_COUNT }, (_, i) => reelStripScreenX(i));
    expect(spans[0].min).toBe(0);
    for (let i = 0; i < spans.length; i++) {
      expect(spans[i].max - spans[i].min + 1).toBe(EFFECTS_REEL_STRIP_WIDTH_PX);
      if (i > 0) expect(spans[i].min).toBe(spans[i - 1].max + 1);
    }
    // Off the ends is a throw, not a silently-wrong span: the band count is a
    // code shape in aeon, not a range an editor may extend.
    expect(() => reelStripScreenX(EFFECTS_REEL_BAND_COUNT)).toThrow(/code shape/);
    expect(() => reelStripScreenX(-1)).toThrow();
  });

  it('the LABEL carries the pixels, so a reordered array is out of order on screen', () => {
    const labels = Array.from({ length: EFFECTS_REEL_BAND_COUNT }, (_, i) => reelStripLabel(i));
    // Strictly ascending left edges, derived — not a list of strings typed here.
    const lefts = labels.map(l => Number(/^x (\d+)/.exec(l)![1]));
    expect(lefts).toEqual(
      Array.from({ length: EFFECTS_REEL_BAND_COUNT },
        (_, i) => i * EFFECTS_REEL_STRIP_WIDTH_PX));
    // The panel really labels the rows with it, rather than with an index.
    expect(PANEL_SRC).toContain('<Field label={reelStripLabel(i)}>');
  });

  it('reelRatesValue hands back the EXACT SEQUENCE, descending included', () => {
    // Descending on purpose: a sort would have to move every element, and a
    // membership assertion could not tell.
    const rates = descendingRates();
    expect([...reelRatesValue(scene({ rates }))]).toEqual(rates);
    // The subject really is out of sorted order, or the row proves nothing.
    expect(rates).not.toEqual([...rates].sort((a, b) => a - b));
  });

  it('a write to ONE strip leaves the other four at their own indices', () => {
    const rates = descendingRates();
    const s = scene({ rates });
    const last = EFFECTS_REEL_BAND_COUNT - 1;
    // Write a value at the RIGHTMOST strip that would sort to the FRONT.
    const wants = EFFECTS_REEL_RATE_BOUNDS.min;
    const next = applied(setReelRateCommand(library([s]), s.id, last, wants));
    const expected = [...rates];
    expected[last] = wants;
    expect(next.reels!.rates).toEqual(expected);
    // Exact sequence, not membership — and the sorted version is a DIFFERENT
    // array, so a sort on the path would have been caught.
    expect(next.reels!.rates).not.toEqual([...expected].sort((a, b) => a - b));
  });

  it('the sequence survives the round trip through the writer, in document order', () => {
    const rates = descendingRates();
    const s = scene({ rates });
    const text = serializeEffectsScene(s);
    // Assert on the TEXT: an absent key and a dropped key are indistinguishable
    // on a parsed object.
    expect(text).toContain('"reels"');
    expect(parseEffectsScene(text, s.id).reels!.rates).toEqual(rates);
    // Two PERMUTATIONS of the same rates render to different bytes; if anything
    // sorted, both would render identically.
    const other = [...rates].reverse();
    expect(serializeEffectsScene(scene({ rates: other }))).not.toBe(text);
  });

  it('there is no add, remove or reorder affordance anywhere on this key', () => {
    const bodies = [reelsToggleCommand, setReelRateCommand, reelRatesValue]
      .map(f => f.toString()).join('\n');
    for (const forbidden of ['.sort(', '.reverse(', '.splice(', '.push(', '.unshift(']) {
      expect(bodies, `${forbidden} must not appear on the reels path`).not.toContain(forbidden);
    }
    expect(bodies).toContain('rates');
  });
});

describe('HAZARD 4: DEBUG tier, and the panel is required to say so', () => {
  it('the panel renders the DERIVED sentence and carries no typed copy of it', () => {
    expect(PANEL_SRC).toContain('REELS_ROW.debug.short');
    expect(PANEL_SRC).toContain('REELS_ROW.debug.full');
    // The one thing that would make this drift: someone pasting the words in.
    expect(PANEL_SRC).not.toContain(EFFECTS_REELS_DEBUG_NOTE.short);
    expect(PANEL_SRC).not.toContain(EFFECTS_REELS_DEBUG_NOTE.full);
    // And the provider's row is the schema's constant by reference, not a copy.
    expect(REELS_ROW.debug).toBe(EFFECTS_REELS_DEBUG_NOTE);
  });

  it('the toggle\'s own title carries it too, so it is readable before the key exists', () => {
    expect(REELS_ROW.title).toContain(EFFECTS_REELS_DEBUG_NOTE.short);
  });

  it('NO capability check is added: there is no CAP_ bit for reels', () => {
    // The contract: "a generator arm must not emit a check that does not exist".
    // Row-remap's note is a real capability; this key has none, and inventing
    // one would be Aurora adding a gate.
    const bodies = [reelsToggleCommand, setReelRateCommand, reelRateWriteRefusal]
      .map(f => f.toString()).join('\n');
    expect(bodies).not.toContain('CAP_');
    expect(JSON.stringify(REELS_ROW)).not.toContain('CAP_');
    // Anti-vacuous: `CAP_` is a real string in this repo's effects surface, so
    // "not found" is a finding rather than a spelling accident.
    expect(REELS_DESC).toMatch(/CAP_/);
  });
});

describe('ABSENT IS ABSENT: there is no "none" spelling for reels', () => {
  it('off DELETES the key, and the writer never materialises it', () => {
    const on = scene({ rates: descendingRates() });
    const off = applied(reelsToggleCommand(library([on]), on.id, false));
    expect(off.reels).toBeUndefined();
    expect(serializeEffectsScene(off)).not.toContain('"reels"');
    // Anti-vacuous: the ON document DID carry it, through the same writer.
    expect(serializeEffectsScene(on)).toContain('"reels"');
  });

  it('off never writes the string "none", which the schema refuses', () => {
    const on = scene({ rates: descendingRates() });
    const off = applied(reelsToggleCommand(library([on]), on.id, false));
    // The document with `"reels": "none"` is REFUSED; assert that rather than
    // trusting the delete. There is no `"none"` arm the way drift, curve,
    // vsplit and rowRemap all have one.
    expect(() => parseEffectsScene(JSON.stringify({ ...off, reels: 'none' }), off.id))
      .toThrow(/reels/);
    expect(reelsEnabled(off)).toBe(false);
  });

  it('on seeds five distinct, nonzero, in-guidance rates and the document validates', () => {
    const s = scene();
    expect(reelsEnabled(s)).toBe(false);
    const next = applied(reelsToggleCommand(library([s]), s.id, true));
    expect(reelsEnabled(next)).toBe(true);
    expect(next.reels!.rates).toEqual([...REEL_RATE_SEED]);
    // The properties the seed is DERIVED to have, re-checked against the schema.
    expect(validateAgainstSchema(next.reels!.rates, RATES_NODE, EFFECTS_SCENE_SCHEMA)).toEqual([]);
    expect(new Set(REEL_RATE_SEED).size).toBe(EFFECTS_REEL_BAND_COUNT);
    expect(REEL_RATE_SEED).not.toContain(0);
    for (const r of REEL_RATE_SEED) expect(reelRateGuidance(r)).toBeNull();
    // ⚠ AND THE SEED IS NOT THE ONE SHAPE THE ×256 ERROR HIDES IN. An all-zero
    // seed would be refused outright by uniqueItems, but the weaker mistake —
    // seeding a single repeated value — is the one a reader would not question.
    expect(reelRatesRefusal([...REEL_RATE_SEED])).toBeNull();
  });

  it('the toggle is the only writer of the key, and it round-trips', () => {
    const s = scene();
    const on = applied(reelsToggleCommand(library([s]), s.id, true));
    const text = serializeEffectsScene(on);
    expect(text).toContain('"reels"');
    expect(parseEffectsScene(text, s.id).reels!.rates).toEqual([...REEL_RATE_SEED]);
  });
});

describe('the binding advisory is surfaced WITHOUT being turned into a clearance', () => {
  it('warns when no section names the scene by sceneRef', () => {
    const s = scene({ rates: descendingRates() });
    const msgs = reelsBindingAdvisories(s, [{ sceneRef: 'somebody_else' }, { sceneRef: null }]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/EDITOR-SIDE WARNING/);
    expect(msgs[0]).toMatch(/Saving is not blocked/);
    expect(msgs[0]).toMatch(/silence is not a clearance/);
  });

  it('says NOTHING in the positive case, and there is no "looks fine" value', () => {
    const s = scene({ rates: descendingRates() });
    expect(reelsBindingAdvisories(s, [{ sceneRef: s.id }])).toEqual([]);
    // The type is string[]; the positive case is an EMPTY one, not a pass
    // object a surface could render as an all-clear.
    expect(reelsBindingAdvisories(s, [{ sceneRef: s.id }]).length).toBe(0);
  });

  it('says nothing about a project with no sections, including all-empty slots', () => {
    const s = scene({ rates: descendingRates() });
    expect(reelsBindingAdvisories(s, [])).toEqual([]);
    // An act of empty slots is "this project has no sections", not "no section
    // binds this scene" — warning on the first is the loud-on-nothing failure.
    expect(reelsBindingAdvisories(s, [null, null, null])).toEqual([]);
  });

  it('says nothing at all about a scene with no reels', () => {
    expect(reelsBindingAdvisories(scene(), [{ sceneRef: 'other' }])).toEqual([]);
  });

  it('the always-on rule is a DIFFERENT sentence from the warning', () => {
    // The point of pairing them: the warning's absence must not read as a pass,
    // so the rule is stated whenever the key is present. If the two were the
    // same string, the pairing would be a repeat and the silence would be bare
    // again.
    const s = scene({ rates: descendingRates() });
    const warning = reelsBindingAdvisories(s, [{ sceneRef: 'other' }])[0];
    expect(warning).not.toBe(EFFECTS_REELS_BINDING_NOTE.short);
    expect(PANEL_SRC).toContain('REELS_ROW.binding.short');
    expect(PANEL_SRC).toContain('reelsBindingAdvisories(selected, act.sections)');
  });
});

describe('the box titles say the unit where the number is typed', () => {
  it('each strip\'s title names its pixels, its unit and its cycle', () => {
    const title = reelStripTitle(2, 3);
    expect(title).toContain(`screen X ${reelStripScreenX(2).min}..${reelStripScreenX(2).max}`);
    expect(title).toMatch(/SIGNED WHOLE PIXELS PER FRAME/);
    expect(title).toContain(reelCycleLabel(3));
    expect(title).toContain(`${EFFECTS_REEL_COLS_PER_BAND} column-pairs`);
  });

  it('the row\'s unit hint says the thing the drift row would have got wrong', () => {
    expect(REELS_ROW.unitHint).toMatch(/WHOLE pixels per frame/);
    // ⚠ IT NAMES THE NEIGHBOUR'S UNIT AND THE ABSENCE OF A CONVERSION, and it
    // does NOT spell the factor's digits — `effects-drift.test.ts`'s "no second
    // copy of the factor" gate reads every line of this repo's effects source
    // for a bare 256, and its comment stripper does not see inside a string
    // literal. That gate is RIGHT to be strict and this sentence does not need
    // the number: what an author has to know is that the neighbour is
    // fractional and that nothing here converts.
    expect(REELS_ROW.unitHint).toMatch(/1\/256 px/);
    expect(REELS_ROW.unitHint).toMatch(/nothing on this path converts/);
  });
});
