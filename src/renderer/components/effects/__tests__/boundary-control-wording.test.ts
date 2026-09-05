// THE BOUNDARY CARD'S SOURCE — what must reach the panel, and what the panel
// must never spell itself.
//
// ═══ WHAT A SOURCE TEST CAN AND CANNOT SAY ═══
//
// This file reads `BandPresetPanel.tsx` as text. It CANNOT see a pixel, mount a
// component or press a control — that is
// `scratchpad/boundary-control-harness.mjs` (`npm run harness:boundary-control`),
// driving the real app under CDP, and the two are deliberately different
// instruments. What a source test CAN hold is structural: which derivation a
// control reads, that a sentence is painted rather than hover-only, and that the
// card has not grown a field the schema refuses or a number the contract owns.
//
// ⚠ THE ROWS THAT MATTER MOST HERE ARE THE **ABSENCES**:
//
//   • the card must not spell any of the four declared ranges (3, 223, 0, 3) as
//     a literal — those are the codec's constants;
//   • the card must not spell a range for the FOUR FIELDS THAT HAVE NONE. The
//     tint region's members are bare integers in the contract on purpose, and a
//     maximum invented in this editor would stand between an author and a legal
//     document with nothing anywhere going red;
//   • the card must not REFUSE the two cross-field rules. They are the
//     generator's; a `disabled` or a `refuse` keyed to `lo > hi` here would make
//     Aurora the only check, which `boundary.ts`'s header forbids by name.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOUNDARY_WHAT_YOU_SEE, BOUNDARY_ON_ARM, newBoundary,
} from '../../../providers/effects-preset';
import {
  EFFECTS_PRESET_BOUNDARY_KEYS, EFFECTS_PRESET_TINT_REGION_KEYS,
  EFFECTS_PRESET_BOUNDARY_LINE_RANGE,
} from '../../../../core/formats/effects/preset';
import { PRESET_KEYS_AWAITING_AEON, presetLagDisclosure } from '../../../../core/formats/effects/preset-lag';

const PANEL = join(__dirname, '..', 'BandPresetPanel.tsx');
const panel = readFileSync(PANEL, 'utf8');

/**
 * COMMENTS STRIPPED, `base-swap-control-wording.test.ts`'s slice and its reason:
 * this file's subject is what the panel DOES, and a rule discussed in a comment
 * must not satisfy a row that means "the code reads this derivation".
 */
const code = panel
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * The `BoundaryCard` function body, BOUNDED AT THE NEXT TOP-LEVEL FUNCTION.
 *
 * ⚠ NOT `slice(at)`, EVEN THOUGH THIS CARD IS CURRENTLY LAST IN THE FILE. That
 * is exactly the mistake the ramp card's own wording file made — it sliced to
 * end-of-file, which meant "the ramp card" only until something was written
 * after it, at which point its field-count row was counting another card's
 * spinners. Bounded from the start here, so the day a fifth card lands after
 * this one nothing silently widens.
 */
const card = (() => {
  const at = code.indexOf('function BoundaryCard(');
  if (at < 0) {
    throw new Error('BoundaryCard is gone from BandPresetPanel.tsx: this file measures it');
  }
  const rest = code.slice(at + 1);
  const next = rest.search(/\nfunction \w+\(/);
  return next < 0 ? rest : rest.slice(0, next);
})();

// ---------------------------------------------------------------------------
// 1. Every control reads the provider
// ---------------------------------------------------------------------------

describe('the boundary card is a renderer and nothing else', () => {
  it('every bounded field reads `boundaryFieldRefusal` and commits through its command', () => {
    for (const f of ['line', 'channel', 'lo', 'hi']) {
      expect(card, `${f} does not read the shared refusal`)
        .toContain(`boundaryFieldRefusal(boundary, preset.id, '${f}'`);
      expect(card, `${f} does not commit through its command`)
        .toContain(`setBoundaryFieldCommand(library, preset.id, '${f}'`);
    }
  });

  it('the four unbounded fields are RENDERED FROM THE SCHEMA\'S OWN KEY LIST', () => {
    // ⚠ NOT FOUR HAND-WRITTEN ROWS. A card that spelled `slot`, `pal_line`,
    // `entry` and `count` would silently drop a fifth member the contract added
    // — and `$defs.tint_region` is asserted at module load to be `pal_region`
    // minus `addr`, so it CAN grow.
    expect(card).toContain('EFFECTS_PRESET_TINT_REGION_KEYS.map(');
    expect(card).toContain('boundaryTintRefusal(region, preset.id, f');
    expect(card).toContain('setBoundaryTintCommand(library, preset.id, f');
    for (const f of EFFECTS_PRESET_TINT_REGION_KEYS) {
      expect(card, `${f} appears to be hand-rendered rather than mapped`)
        .not.toContain(`label="${f}"`);
    }
  });

  it('the ON arm\'s name is read off the schema, never typed', () => {
    expect(card).toContain('BOUNDARY_ON_ARM');
    expect(BOUNDARY_ON_ARM).toBe('pal_region');
    expect(card, 'the card hard-codes the arm name, so a second arm would be silently ignored')
      .not.toContain("'pal_region'");
  });

  it('every field title is the contract\'s paragraph, not prose written here', () => {
    for (const f of [...EFFECTS_PRESET_BOUNDARY_KEYS, 'offscreen_ship']) {
      if (f === 'on') continue; // rendered through the region map, titled per member
      expect(card, `${f} has no schema title on its control`)
        .toContain(`BOUNDARY_FIELD_TITLES.${f}`);
    }
    expect(card).toContain('BOUNDARY_TINT_FIELD_TITLES[f]');
  });
});

// ---------------------------------------------------------------------------
// 2. The numbers the card must not spell
// ---------------------------------------------------------------------------

describe('no bound, and no invented bound, is typed into the card', () => {
  it('does not restate any declared range', () => {
    const r = EFFECTS_PRESET_BOUNDARY_LINE_RANGE;
    // The card carries NumberFields with a `width`, so a bare `223` in the JSX
    // is the thing to look for rather than any occurrence of the digits.
    for (const n of [r.min, r.max]) {
      expect(card, `the card spells ${n}, which is a range the codec derives from the schema`)
        .not.toMatch(new RegExp(`[^\\w]${n}[^\\w\\d]`));
    }
  });

  /**
   * ⚠ THE `min`/`max` ATTRIBUTE RULE — aeon's §E.4, and the same on all four
   * cards. Those attributes govern the arrows and `:invalid` and stop no typed
   * value, so a card that carried them would look bounded and would not be.
   */
  it('no spinner carries a min or max attribute', () => {
    expect(card).not.toMatch(/\bmin=\{/);
    expect(card).not.toMatch(/\bmax=\{/);
  });

  /**
   * ⚠ THE ROW FOR THE FOUR FIELDS THAT HAVE NO RANGE. The card must not decide
   * that `entry` is 0..15 or `count` is 1..16 — the contract declares them as
   * bare integers on purpose and the engine's own message carries the
   * measurement. An invented maximum here would be unfalsifiable: no schema
   * keyword, no vector and no codec row could contradict it.
   */
  it('invents no range for the tint region, and says so where the author is', () => {
    expect(card).not.toMatch(/entry.{0,40}\b15\b/);
    expect(card).not.toMatch(/count.{0,40}\b16\b/);
    expect(card, 'the card does not tell the author where the real bound lives')
      .toMatch(/no range in the contract/);
  });

  /**
   * ⚠ AND THE PER-FIELD GLOSSES ARE THE PROVIDER'S TOO. Two of them state ENGINE
   * behaviour — past `hi` the record is dropped, below `lo` it is clamped up and
   * still emitted — and a component that spelled those would be a second copy of
   * a rule `boundarySummary` already owns, one line away from it and free to
   * disagree. `band-preset-wording.test.ts`'s panel-wide no-`clamp` row caught
   * exactly this while it was written here.
   */
  it('spells no engine behaviour of its own beside the spinners', () => {
    expect(card).toContain('BOUNDARY_FIELD_GLOSS.');
    expect(card, 'the card states engine behaviour in its own words').not.toMatch(/clamp/i);
    expect(card).not.toMatch(/DROPPED/);
  });
});

// ---------------------------------------------------------------------------
// 3. What must be PAINTED
// ---------------------------------------------------------------------------

describe('the sentences that must be on screen, not in a hover', () => {
  /**
   * ⚠ THE ATTRIBUTION IS PAINTED BESIDE THE TEXT. `enforced_by` is a FIELD in
   * `boundary.ts` rather than a docblock precisely so a surface that renders
   * `a.text` alone cannot drop it — and such a surface would look completely
   * fine. This row is the one that would catch it.
   */
  it('every advisory paints its `enforced_by`, not just its text', () => {
    expect(card).toContain('boundaryAdvisoriesFor(preset)');
    expect(card).toContain('{a.text}');
    expect(card, 'the card paints the advisory text and drops who enforces it: which is the '
      + 'difference between "the editor thinks this is wrong" and "aeon will reject this"')
      .toContain('boundaryAdvisoryAttribution(a)');
  });

  /**
   * ⚠ THE NO-BUILD DISCLOSURE, AND IT IS DERIVED RATHER THAN WRITTEN. The
   * sentence must retire the day the premise does, so a literal typed into this
   * card would outlive the fact — the O62/O64 class. It is `PresetLagDisclosure`,
   * propless, mounted unconditionally.
   */
  it('mounts the derived lag disclosure, and writes no second copy of its sentence', () => {
    expect(card).toContain('<PresetLagDisclosure />');
    // ...and nothing here re-states what the disclosure says.
    expect(card).not.toMatch(/does not build/i);
    expect(card).not.toMatch(/effects_gen\.py/);
    expect(card).not.toMatch(/WHOLE DOCUMENT/);
  });

  /**
   * ⚠ THIS ROW SAID "ARMED" AND ITS OWN MESSAGE RETIRED IT, 2026-09-04.
   *
   * It asserted `boundary` was in the awaiting list, so this card's disclosure
   * RENDERED — and it said what to do when that stopped being true: *"If aeon's
   * generator arm has landed that is CORRECT and this row retires with the
   * sentence … do not re-arm the list to make this green."* aeon `b3af9847` grew
   * `boundary` into its accepted `preset:` row (re-confirmed at `75cd390f`), the
   * drift row measured the lag EMPTY, and this row was retired rather than
   * relaxed.
   *
   * ⚠ AND THIS FILE WAS THE FOURTH READER OF THE PREMISE, NOT THE THIRD. The
   * retirement parcel was scoped to `preset-lag.ts`, the drift row and
   * `preset-lag-disclosure.test.ts`; this row is in a DIFFERENT file, about a
   * different subject (the boundary card's wording), and only the full suite
   * found it. A census of who reads a premise is not the same as the list of
   * files a change was scoped to.
   *
   * WHAT IS ASSERTED NOW is the mirror, so the mount above is still not
   * decoration: the premise does not name this card's key, the leaf is silent
   * BECAUSE of that, and the sentence a re-opened lag would put back is still
   * fully asserted.
   */
  it('the premise this card discloses is RETIRED for `boundary`: the mount still matters', () => {
    expect(
      PRESET_KEYS_AWAITING_AEON,
      '`boundary` is back in the lag: a lag has re-opened on the key THIS card authors, so its '
      + 'disclosure is on screen again. Re-aim this row at the sentence being ON screen (git log '
      + 'it for the shape it had while armed) rather than relaxing it.',
    ).not.toContain('boundary');
    // The leaf this card mounts renders nothing today...
    expect(presetLagDisclosure(PRESET_KEYS_AWAITING_AEON)).toBeNull();
    // ...and the silence is the PREMISE's doing, not a leaf that stopped
    // working: the same derivation, handed this card's key back, still speaks
    // the whole sharper-flavour sentence. Without this half the retirement
    // could have quietly disabled the disclosure and this row would not care.
    const wouldSay = presetLagDisclosure(['boundary']);
    expect(wouldSay).not.toBeNull();
    expect(wouldSay!).toContain('`boundary`');
    expect(wouldSay!).toContain('WHOLE DOCUMENT');
    expect(wouldSay!).toContain('will not build');
  });

  it('what an author sees is QUOTED from the contract, and the schema paragraph is reachable', () => {
    expect(card).toContain('BOUNDARY_WHAT_YOU_SEE');
    expect(card).toContain('title={BOUNDARY_TITLE}');
    expect(BOUNDARY_WHAT_YOU_SEE.length).toBeGreaterThan(40);
  });

  it('the summary is painted, so the band\'s line count is on screen', () => {
    expect(card).toContain('boundarySummary(boundary)');
  });
});

// ---------------------------------------------------------------------------
// 4. What the card must NOT do
// ---------------------------------------------------------------------------

describe('the card does not become the enforcer of somebody else\'s rule', () => {
  /**
   * ⚠ THE CROSS-FIELD RULES ARE NOT REFUSED HERE, AND THIS IS THE ROW THAT SAYS
   * SO. `lo <= hi` and `line ∈ [lo, hi]` are the generator's; the schema accepts
   * both violations and so does the codec. A `disabled` or a comparison in this
   * card would refuse a document the contract accepts, and it would read as
   * diligence.
   */
  it('compares no two fields, and disables no control', () => {
    expect(card).not.toMatch(/boundary\.lo\s*[<>]/);
    expect(card).not.toMatch(/boundary\.hi\s*[<>]/);
    expect(card).not.toMatch(/boundary\.line\s*[<>]/);
    expect(card, 'a control in this card is disabled: every field here is authorable, and the '
      + 'two cross-field rules are advisories by the contract\'s own ruling')
      .not.toMatch(/\bdisabled=/);
  });

  it('draws no preview of a raster program', () => {
    expect(card).not.toMatch(/<canvas/i);
    expect(card).not.toMatch(/PaletteGrid|GenesisColorSliders/);
  });

  it('the footer names every key the card writes, from the schema\'s own list', () => {
    expect(card).toContain('EFFECTS_PRESET_BOUNDARY_KEYS.join');
    // Anti-vacuous: the list really has the six members the object requires.
    expect([...EFFECTS_PRESET_BOUNDARY_KEYS].sort())
      .toEqual(['channel', 'hi', 'line', 'lo', 'on', 'sh']);
    expect(Object.keys(newBoundary())).toContain('offscreen_ship');
  });
});
