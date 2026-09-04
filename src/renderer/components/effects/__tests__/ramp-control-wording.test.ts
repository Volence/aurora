// THE RAMP CARD'S SOURCE — the halves that must reach the panel, and the shape
// that must never grow.
//
// ═══ WHAT A SOURCE TEST CAN AND CANNOT SAY ═══
//
// This file reads `BandPresetPanel.tsx` as text. It CANNOT see a pixel, mount a
// component or press a control — that is `scratchpad/ramp-control-harness.mjs`
// (`npm run harness:ramp-control`), driving the real app under CDP, and the two
// are deliberately different instruments. What a source test CAN hold is
// structural: which derivation a control reads, that a sentence is painted
// rather than hover-only, and that the card has not grown a shape the engine
// cannot honour.
//
// ⚠ THE LAST ONE IS THE POINT OF THIS FILE. A ramp is ONE rate and ONE start
// over a span; `RasterRampProgram` has a single `rrp_step` and a single
// `rrp_start` and NO FIELD THAT COULD RECEIVE A TABLE. A future editor of this
// panel who adds a per-line widget would author a document that validates,
// generates, and is silently wrong on hardware — and no schema, no vector and no
// round trip can catch that, because the DOCUMENT would still be legal. The
// field-count row below is the only thing in this repo that would notice.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RAMP_MUST_NOT, RAMP_MUST_NOT_SHORT, RAMP_KEYS,
} from '../../../providers/effects-preset';
import {
  EFFECTS_PRESET_RAMP_SPAN_MAX,
  EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET, EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG,
} from '../../../../core/formats/effects/preset';

const PANEL = join(__dirname, '..', 'BandPresetPanel.tsx');
const panel = readFileSync(PANEL, 'utf8');

/**
 * COMMENTS STRIPPED, `band-preset-wording.test.ts`'s slice and its reason: this
 * file's whole subject is what the panel DOES, and a rule discussed in a comment
 * must not satisfy a row that means "the code reads this derivation".
 */
const code = panel
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * The `RampCard` function body, so the rows below cannot be satisfied elsewhere.
 *
 * ⚠ IT IS BOUNDED AT THE NEXT COMPONENT, AND IT WAS NOT UNTIL 2026-09-03. This
 * read `code.slice(at)` — the rest of the FILE — which was the same thing as
 * "the ramp card" only because `RampCard` happened to be last. `BaseSwapCard`
 * (ROADMAP row 131) was written after it and the field-count row immediately
 * counted seven `<NumberField>`s against the ramp's five keys. The count row is
 * this file's whole point (it is the only automatic signal in this repo for the
 * per-line-curve MUST NOT), so a slice that grows with the file would have gone
 * red for the wrong reason today and, one refactor later, green for the wrong
 * reason instead.
 */
const rampCard = (() => {
  const at = code.indexOf('function RampCard(');
  if (at < 0) throw new Error('RampCard is gone from BandPresetPanel.tsx — this file measures it');
  const rest = code.slice(at);
  // The function's own closing brace: the first `}` in column 0 after it. Every
  // brace inside the body is indented, and this does not depend on what happens
  // to be written next in the file.
  const end = rest.indexOf('\n}\n');
  if (end < 0) throw new Error('RampCard has no closing brace in column 0 — the slice is unbounded');
  return rest.slice(0, end + 3);
})();

describe('the slice this file measures is bounded', () => {
  it('comment-stripping really removed the prose, and RampCard is really in the slice', () => {
    expect(code.length).toBeLessThan(panel.length * 0.8);
    expect(rampCard).toContain('<NumberField');
    // ANTI-VACUOUS: the slice must not be the WHOLE panel, or every row below
    // could be satisfied by the band card instead.
    expect(rampCard.length).toBeLessThan(code.length * 0.5);
  });
});

describe('the MUST NOT reaches the panel at both lengths', () => {
  /**
   * `LimitBlock`'s split: the author-length sentence is PAINTED and the contract
   * one is on the same element's `title`. A limit an author has to hover to find
   * is a limit the panel does not really carry; a limit that is only ever
   * painted is a contract sentence deleted.
   */
  it('the short half is painted and the contract half is on the same element', () => {
    expect(rampCard).toMatch(/title=\{RAMP_MUST_NOT\}>\{RAMP_MUST_NOT_SHORT\}</);
    // Both really exist and really differ — a split of one string into itself
    // would satisfy the regex above and carry nothing.
    expect(RAMP_MUST_NOT_SHORT).not.toBe(RAMP_MUST_NOT);
    expect(RAMP_MUST_NOT.length).toBeGreaterThan(RAMP_MUST_NOT_SHORT.length);
  });

  it('the panel does not retype the rule it imports', () => {
    expect(code).not.toContain('rrp_step');
    expect(code).not.toContain(RAMP_MUST_NOT);
    expect(code).not.toContain(RAMP_MUST_NOT_SHORT);
  });
});

describe('the card has exactly the ramp\'s own shape — no curve, ever', () => {
  /**
   * ⚠ FIVE KEYS, FIVE INPUTS, AND THE COUNT IS DERIVED FROM `RAMP_KEYS`.
   *
   * `top`, `lines`, `target.vsram.addr`, `start`, `step` — one control each and
   * nothing else. A per-line curve editor, a multi-point widget or a table would
   * every one of them show up here as more inputs than the document has keys,
   * which is the only automatic signal this repo has for the MUST NOT.
   *
   * (The ramp has five keys and `target` is one object with one scalar inside
   * it, so the input count equals the key count. That coincidence is asserted
   * rather than assumed, so the row does not silently mean something else if a
   * key ever gains a second scalar.)
   */
  it('mounts exactly one input per ramp key and no more', () => {
    const inputs = [...rampCard.matchAll(/<NumberField\b/g)];
    expect(RAMP_KEYS).toHaveLength(5);
    expect(inputs).toHaveLength(RAMP_KEYS.length);
    // ...and no other kind of value control has crept in beside them.
    expect(rampCard).not.toMatch(/<Select\b/);
    expect(rampCard).not.toMatch(/<input\b/);
  });

  it('draws nothing per scanline — no loop over `lines` anywhere in the card', () => {
    expect(rampCard).not.toMatch(/\.lines\s*\)?\s*\.map\(/);
    expect(rampCard).not.toMatch(/Array\.from\(\s*\{\s*length:\s*[\w.]*lines/);
    expect(rampCard).not.toMatch(/for\s*\(/);
    expect(rampCard).not.toMatch(/canvas/i);
  });

  /**
   * NO min/max, aeon's §E.4 — those attributes govern the arrows and `:invalid`
   * and stop no typed value, so a caller that means "this cannot be written"
   * passes `refuse`. Every one of the five does.
   *
   * `step` IS set on the two rate fields and is not a range: without it a
   * browser snaps a fractional value to a whole number on one arrow press, which
   * would turn 0.25 into 1 under the author's finger.
   */
  it('every spinner refuses, and none of them ranges', () => {
    const fields = [...rampCard.matchAll(/<NumberField[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(fields).toHaveLength(5);
    for (const f of fields) {
      expect(f, f).not.toMatch(/\bmin=/);
      expect(f, f).not.toMatch(/\bmax=/);
      expect(f, f).toMatch(/refuse=\{/);
      expect(f, f).toMatch(/onRefusal=\{/);
    }
    expect(fields.filter((f) => /step=\{RAMP_RATE_UNIT\}/.test(f))).toHaveLength(2);
  });
});

describe('the panel spells no ramp rule of its own', () => {
  /**
   * The `tableRefParamOptions` idiom: a predicate and its sentence come from ONE
   * source both the control and the advisory read. Two numbers in particular
   * must never appear here — the span bound and the display geometry — because
   * all of them are derived from the contract's own prose with a module-load
   * guard, and a copy typed beside a control is a copy that cannot go red when
   * the contract moves. THE DISPLAY GEOMETRY IS TWO CONSTANTS since empyrean
   * `e9409dc`, and neither may be named here: picking either one in a panel is
   * picking which question the readout answers, and that is the provider's job.
   */
  it('does not retype the span bound or either display constant', () => {
    expect(code).not.toContain(String(EFFECTS_PRESET_RAMP_SPAN_MAX));
    expect(code).not.toContain('EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET');
    expect(code).not.toContain('EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG');
    // ANTI-VACUOUS: those constants really are non-trivial numbers, so their
    // absence is a claim about this file and not about arithmetic.
    expect(EFFECTS_PRESET_RAMP_SPAN_MAX).toBeGreaterThan(200);
    expect(EFFECTS_PRESET_RAMP_VSRAM_FIRST_LINE_OFFSET).toBeGreaterThan(0);
    expect(EFFECTS_PRESET_RAMP_VSRAM_INDEX_LAG).toBeGreaterThan(0);
  });

  it('does not convert an fp16 pair itself', () => {
    // The sign lives on `whole` and applies to the whole value, so the naive
    // `whole + frac256/256` is a whole pixel out with both numbers in range.
    expect(rampCard).not.toContain('frac256');
    expect(rampCard).not.toContain('/ 256');
    expect(rampCard).toContain('presetFp16ToNumber(');
  });

  it('reads the provider for every refusal and every sentence', () => {
    for (const fn of [
      'rampSpanRefusal(', 'rampAddrRefusal(', 'rampRateRefusal(',
      'rampAddrGloss(', 'rampDisplayGloss(', 'rampDriftSummary(', 'rampRateUnits(',
      'setRampSpanCommand(', 'setRampAddrCommand(', 'setRampRateCommand(',
    ]) expect(rampCard, fn).toContain(fn);
  });

  it('the display readout carries its reason on the same element', () => {
    expect(rampCard).toMatch(/title=\{RAMP_DISPLAY_LAG_NOTE\}>\{rampDisplayGloss\(ramp\)\}</);
  });
});

describe('the scroll-mode sentence is mounted, split, and derived nowhere here', () => {
  /**
   * THE SAME SPLIT AS THE MUST NOT, and the same reason: what an author must act
   * on is painted, the measured aeon chain and the capability conjunct ride on
   * the element's own `title`. A sentence about whether this ramp is a
   * full-screen scroll or a 16-pixel sliver cannot be hover-only.
   */
  it('the painted half is the short one and the contract half is on the same element', () => {
    expect(rampCard).toMatch(/title=\{scroll\.full\}>\{scroll\.short\}</);
  });

  /**
   * ⚠ THE DERIVATION IS THE PROVIDER'S. This panel holds no rules, and this rule
   * in particular reaches across THREE documents (preset, sidecar, scene) — a
   * comparison spelled here would be one the provider's sentence could disagree
   * with. The card is handed an answer; it does not compute one.
   */
  it('the card computes nothing about scenes, sections or the mode bit', () => {
    for (const forbidden of ['v_deform', 'vDeformValue', 'sceneRef', 'rasterRef', '$0B']) {
      expect(rampCard, `RampCard spells "${forbidden}" itself`).not.toContain(forbidden);
    }
    // and the panel asks the provider exactly once, outside the card
    expect(code).toContain('rampScrollModeAdvisory(');
    expect(rampCard).not.toContain('rampScrollModeAdvisory(');
  });

  /**
   * ⚠ IT DOES NOT GATE. Both arms are legitimate authoring choices, so the
   * sentence must not disable a control or refuse a value — the panel would then
   * be enforcing a preference dressed as a rule.
   */
  it('nothing in the card is disabled by, or refused because of, the mode', () => {
    expect(rampCard).not.toMatch(/disabled=\{[^}]*scroll/);
    expect(rampCard).not.toMatch(/refuse=\{[^}]*scroll/);
  });

  /**
   * ⚠ INDEPENDENT OF THE DISPLAY READOUT, AND THAT INDEPENDENCE HAS NOW BEEN
   * EXERCISED. A real ROM rendered 5..223 where the card derived 4..223
   * (2026-09-03, two different tops, the same +1); the contract SETTLED it in
   * the ROM's favour at empyrean `e9409dc` and the readout moved to `top + 2`.
   * This row did not, which is exactly what it was written to guarantee: the
   * sentence is about the HORIZONTAL extent and must not be wired to the
   * vertical one.
   */
  it('the scroll sentence is not derived from the display span or the lag', () => {
    const at = rampCard.indexOf('scroll.short');
    expect(at).toBeGreaterThan(0);
    // the mount site names neither the readout nor the constant
    const mount = rampCard.slice(Math.max(0, at - 300), at + 300);
    expect(mount).not.toContain('rampDisplaySpan');
    expect(mount).not.toContain('DISPLAY_LAG');
  });
});

describe('the dead band control carries its reason', () => {
  /**
   * ⚠ ONE DERIVATION, READ TWICE. The chip's `disabled` and the sentence beside
   * it must both come from `bandControlsRefusal`, or a greyed control and its
   * explanation can describe different conditions — which is exactly how a
   * disabled button ends up with a reason that is about something else.
   */
  it('the chip is disabled BY the same predicate that writes the sentence', () => {
    expect(code).toMatch(/disabled=\{bandControlsRefusal\(selected\) !== null\}/);
    expect(code).toMatch(/\{bandControlsRefusal\(selected\) !== null && \(/);
    expect(code).toMatch(/<Hint tone="warning"[^>]*>\{bandControlsRefusal\(selected\)\}<\/Hint>/);
    // ...and the reason is on the chip's own title too, so a pointer finds it.
    expect(code).toMatch(/title=\{bandControlsRefusal\(selected\) \?\? undefined\}/);
  });

  it('the band controls\' refusal is not re-derived from a bands length here', () => {
    expect(code).not.toMatch(/bands\.length\s*[<>=]=?\s*1/);
    expect(code).not.toMatch(/ramp\s*!==\s*undefined\s*\?/);
  });
});

describe('the raster-program switch says what it discards, before it is used', () => {
  it('the advisory is unconditional and sits under the control', () => {
    expect(code).toMatch(/<Hint under>\{rasterChannelSwapAdvisory\(selected\)\}<\/Hint>/);
    // Unconditional: it is NOT inside a `&&` guard that would hide it until the
    // author had already switched once.
    const at = code.indexOf('rasterChannelSwapAdvisory(selected)');
    const line = code.slice(code.lastIndexOf('\n', at) + 1, code.indexOf('\n', at));
    expect(line).not.toContain('&&');
  });

  it('the options come from the schema\'s own oneOf, not from a literal pair', () => {
    expect(code).toMatch(/RASTER_CHANNEL_OPTIONS\.map\(/);
    expect(code).toMatch(/setRasterChannelCommand\(library, selected\.id, v\)/);
    expect(code).not.toMatch(/value="ramp"/);
    expect(code).not.toMatch(/value="bands"/);
  });
});
