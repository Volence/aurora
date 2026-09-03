// THE BASE-SWAP CARD'S SOURCE — the halves that must reach the panel, the shape
// that must not grow, and the numbers the panel must never spell itself.
//
// ═══ WHAT A SOURCE TEST CAN AND CANNOT SAY ═══
//
// This file reads `BandPresetPanel.tsx` as text. It CANNOT see a pixel, mount a
// component or press a control — that is
// `scratchpad/base-swap-control-harness.mjs` (`npm run harness:base-swap-control`),
// driving the real app under CDP, and the two are deliberately different
// instruments. What a source test CAN hold is structural: which derivation a
// control reads, that a sentence is painted rather than hover-only, and that the
// card has not grown a field the schema refuses or a number the contract owns.
//
// ⚠ THE NUMBER ROWS ARE THE POINT OF THIS FILE. `8192`, `57344` and `$E000` are
// a granule, a worked address and its hex, all three derived from the vendored
// schema with module-load guards. A copy typed beside a control is a copy that
// CANNOT go red when the contract moves — and this family has produced that
// defect twice already. A panel that spelled the granule itself would keep
// refusing on the old one after a re-vendor, with every node row still green.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BASE_SWAP_ASYMMETRIES, BASE_SWAP_ASYMMETRIES_SHORT, BASE_SWAP_WHAT_YOU_SEE,
  BASE_SWAP_NAMED_TARGETS, fmtVramBase,
} from '../../../providers/effects-preset';
import {
  EFFECTS_PRESET_BASE_SWAP_KEYS,
  EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE,
  EFFECTS_PRESET_BASE_SWAP_LINE_RANGE,
  EFFECTS_PRESET_RASTER_CHANNELS,
} from '../../../../core/formats/effects/preset';

const PANEL = join(__dirname, '..', 'BandPresetPanel.tsx');
const panel = readFileSync(PANEL, 'utf8');

/**
 * COMMENTS STRIPPED, `band-preset-wording.test.ts`'s slice and its reason: this
 * file's subject is what the panel DOES, and a rule discussed in a comment must
 * not satisfy a row that means "the code reads this derivation". It cuts the
 * other way too — the docblocks quote the granule and the named address by
 * design, and the "does not retype" rows below are about CODE.
 */
const code = panel
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * The `BaseSwapCard` function body, BOUNDED AT THE NEXT COMPONENT.
 *
 * ⚠ NOT `slice(at)`. The ramp card's own wording file sliced to end-of-file,
 * which was the same thing as "the ramp card" only while `RampCard` was last —
 * and the day this card was written after it, its field-count row counted seven
 * spinners against the ramp's five keys. Bounded from the start here.
 */
const card = (() => {
  const at = code.indexOf('function BaseSwapCard(');
  if (at < 0) throw new Error('BaseSwapCard is gone from BandPresetPanel.tsx — this file measures it');
  const rest = code.slice(at);
  // The function's own closing brace: the first `}` in column 0 after it. Every
  // brace inside the body is indented, and this does not depend on what happens
  // to be written next in the file.
  const end = rest.indexOf('\n}\n');
  if (end < 0) throw new Error('BaseSwapCard has no closing brace in column 0 — the slice is unbounded');
  return rest.slice(0, end + 3);
})();

describe('the slice this file measures is bounded', () => {
  it('comment-stripping really removed the prose, and the card is really in the slice', () => {
    expect(code.length).toBeLessThan(panel.length * 0.8);
    expect(card).toContain('<NumberField');
    // ANTI-VACUOUS: the slice must not be the whole panel, or every row below
    // could be satisfied by the ramp card or the band card instead.
    expect(card.length).toBeLessThan(code.length * 0.3);
    expect(card).not.toContain('setRampSpanCommand(');
    expect(card).not.toContain('setBandFieldCommand(');
  });
});

describe('the card has exactly the swap\'s own shape — two keys, two controls', () => {
  /**
   * ⚠ TWO KEYS, TWO INPUTS, AND THE COUNT IS DERIVED FROM
   * `EFFECTS_PRESET_BASE_SWAP_KEYS`. `$defs.base_swap` is a CLOSED object of
   * `line` and `target`, so a third control here would be authoring a key the
   * schema refuses — which serialize would catch, but only after the panel had
   * shown an author a field that does nothing.
   */
  it('mounts exactly one input per base_swap key and no more', () => {
    const inputs = [...card.matchAll(/<NumberField\b/g)];
    expect(EFFECTS_PRESET_BASE_SWAP_KEYS).toHaveLength(2);
    expect(inputs).toHaveLength(EFFECTS_PRESET_BASE_SWAP_KEYS.length);
    // ...and no other kind of value control has crept in beside them.
    expect(card).not.toMatch(/<Select\b/);
    expect(card).not.toMatch(/<input\b/);
    expect(card).not.toMatch(/<Chip\b/);
  });

  /**
   * NO min/max, aeon's §E.4 — those attributes govern the arrows and `:invalid`
   * and stop no typed value, so a caller that means "this cannot be written"
   * passes `refuse`. Both fields do.
   *
   * AND NO `step` EITHER, which is the difference from the ramp's rate fields: a
   * screen line and a byte address are whole numbers, so the browser's default
   * whole-number arrow is the right one. A `step` of the granule here would be a
   * SNAP wearing an affordance's clothes — the arrows would walk the author from
   * one legal base to the next and quietly hide that a typed value between them
   * is refused, which is the one thing this control exists to say out loud.
   */
  it('every spinner refuses, and none of them ranges or steps', () => {
    const fields = [...card.matchAll(/<NumberField[\s\S]*?\/>/g)].map((m) => m[0]);
    expect(fields).toHaveLength(EFFECTS_PRESET_BASE_SWAP_KEYS.length);
    for (const f of fields) {
      expect(f, f).not.toMatch(/\bmin=/);
      expect(f, f).not.toMatch(/\bmax=/);
      expect(f, f).not.toMatch(/\bstep=/);
      expect(f, f).toMatch(/refuse=\{/);
      expect(f, f).toMatch(/onRefusal=\{/);
    }
  });

  it('draws nothing per scanline and no preview', () => {
    expect(card).not.toMatch(/for\s*\(/);
    expect(card).not.toMatch(/\.map\(/);
    expect(card).not.toMatch(/canvas/i);
  });
});

describe('the panel spells no base_swap rule of its own', () => {
  /**
   * ⚠ THE THREE NUMBERS THE PANEL MUST NEVER CARRY: the granule, the worked
   * address and its hex. All three are derived in the codec from the vendored
   * schema with module-load guards, and a literal here would survive a
   * re-vendor that moved any of them — refusing on the old granule while every
   * node row stayed green.
   */
  it('does not retype the granule, the worked address or its hex', () => {
    const named = [...BASE_SWAP_NAMED_TARGETS.keys()][0];
    expect(code).not.toContain(String(EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE));
    expect(code).not.toContain(String(named));
    expect(code).not.toContain(fmtVramBase(named));
    expect(code).not.toContain([...BASE_SWAP_NAMED_TARGETS.values()][0]);
    expect(code).not.toContain(String(EFFECTS_PRESET_BASE_SWAP_LINE_RANGE.max));
    // ANTI-VACUOUS: these really are non-trivial values, so their absence is a
    // claim about this file and not about arithmetic.
    expect(EFFECTS_PRESET_BASE_SWAP_TARGET_GRANULE).toBeGreaterThan(1000);
    expect(named).toBeGreaterThan(1000);
    expect(fmtVramBase(named)).toMatch(/^\$[0-9A-F]+$/);
  });

  it('reads the provider for every refusal, gloss, summary and command', () => {
    for (const fn of [
      'baseSwapLineRefusal(', 'baseSwapTargetRefusal(',
      'baseSwapTargetGloss(', 'baseSwapSummary(',
      'setBaseSwapLineCommand(', 'setBaseSwapTargetCommand(',
    ]) expect(card, fn).toContain(fn);
    // The titles are the schema's, through the provider.
    expect(card).toMatch(/title=\{BASE_SWAP_FIELD_TITLES\.line\}/);
    expect(card).toMatch(/title=\{BASE_SWAP_FIELD_TITLES\.target\}/);
  });

  it('does no address arithmetic of its own — no hex, no masking, no rounding', () => {
    expect(card).not.toMatch(/toString\(16\)/);
    expect(card).not.toMatch(/0x[0-9a-fA-F]/);
    // A bitwise mask or a shift would be the panel re-deriving what reg $02
    // keeps and what it drops. (`>>`/`<<` are deliberately NOT matched: a TS
    // generic closes with `>>` and the row would fire on `Record<string, string
    // | null>>`, which is how a true rule ends up relaxed to get green.)
    expect(card).not.toMatch(/&\s*0x|~\s*\(|>>>/);
    expect(card).not.toMatch(/Math\.(round|floor|ceil)/);
    expect(card).not.toMatch(/%/);
  });
});

describe('the two asymmetries reach the panel at both lengths', () => {
  /**
   * `LimitBlock`'s split: the author-length sentence is PAINTED and the contract
   * one is on the same element's `title`. A property an author has to hover to
   * find is a property the panel does not really carry — and these two are the
   * ones a reader arriving from `ramp` gets wrong by assumption, which is how a
   * control parcel ends up building a disabled button around a capability gate
   * that does not exist.
   */
  it('the short half is painted and the contract half is on the same element', () => {
    expect(card).toMatch(/title=\{BASE_SWAP_ASYMMETRIES\}>\{BASE_SWAP_ASYMMETRIES_SHORT\}</);
    expect(BASE_SWAP_ASYMMETRIES_SHORT).not.toBe(BASE_SWAP_ASYMMETRIES);
    expect(BASE_SWAP_ASYMMETRIES.length).toBeGreaterThan(BASE_SWAP_ASYMMETRIES_SHORT.length);
  });

  it('what an author sees is quoted from the contract, with the paragraph behind it', () => {
    expect(card).toMatch(/title=\{BASE_SWAP_TITLE\}>\{BASE_SWAP_WHAT_YOU_SEE\}</);
    expect(BASE_SWAP_WHAT_YOU_SEE).toMatch(/self-restoring/);
  });

  it('the panel does not retype either sentence', () => {
    expect(code).not.toContain(BASE_SWAP_ASYMMETRIES);
    expect(code).not.toContain(BASE_SWAP_ASYMMETRIES_SHORT);
    expect(code).not.toContain(BASE_SWAP_WHAT_YOU_SEE);
    expect(code).not.toContain('CAP_DENSE_TIER');
  });
});

describe('the card is mounted on the document that carries the channel', () => {
  it('renders on a base_swap document and nowhere else', () => {
    expect(code).toMatch(/\{selected\.base_swap !== undefined && \(/);
    expect(code).toMatch(/<BaseSwapCard library=\{library\} presetId=\{selected\.id\}/);
    expect(code).toMatch(/baseSwap=\{selected\.base_swap\}/);
  });

  /**
   * ⚠ AND A CHANNEL WITH NO CARD GETS A SENTENCE. Every declared channel has an
   * editor today, so this leaf paints nothing — which is exactly why a row has
   * to hold it: a fourth arm would otherwise select correctly in the Raster row
   * (that list is derived from the schema) and render an empty section under it.
   */
  it('a channel with no editor here paints a reason, from one predicate', () => {
    expect(code).toMatch(/\{rasterEditorGap\(selected\) !== null && \(/);
    expect(code).toMatch(/<Hint tone="warning">\{rasterEditorGap\(selected\)\}<\/Hint>/);
  });

  /**
   * ⚠ NO CHANNEL IS TESTED AGAINST ANOTHER ANYWHERE IN THIS PANEL. The three
   * defects the third arm opened were all of that shape: a ternary, an if/else
   * and a `!== 'ramp'`. A card mounts on its OWN key being present; nothing here
   * may branch on which of the others it is not.
   */
  it('nothing in the panel branches on one channel versus another', () => {
    for (const c of EFFECTS_PRESET_RASTER_CHANNELS) {
      expect(code, `a channel comparison against "${c}"`)
        .not.toMatch(new RegExp(`[=!]==\\s*'${c}'`));
    }
    expect(code).not.toMatch(/selected\.ramp !== undefined \?/);
    expect(code).not.toMatch(/selected\.base_swap !== undefined \?/);
    // The dropdown is the schema's list, never a typed pair or triple.
    expect(code).toMatch(/RASTER_CHANNEL_OPTIONS\.map\(/);
    expect(code).not.toMatch(/value="base_swap"/);
  });
});
