// COLUMN-WIDTH DISCIPLINE FOR THE NEW WORDING — parcel D.
//
// The effects column is 300px wide and every prior parcel measured it under
// CDP at 1280x800 and 1680x1050 (`scratchpad/effects-column-harness.mjs`, a
// FOREGROUND instrument this suite cannot run). What this file CAN hold the
// line on is the input to that measurement: no new label is longer than the
// longest label the column already wraps, and no new string carries an
// unbreakable token longer than that either — the two ways a string forces a
// column wider. The bar is DERIVED from the panel sources, never typed in, so
// it moves with the column rather than with someone's memory of it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLANE_FACTOR_ROWS, PLANE_FACTOR_HINT, LAYER_CURVE_ROW, LAYER_VSPLIT_ROW,
  SCENE_DEFORM_ROWS, SCENE_DEFORM_ROW_SHARED, V_DEFORM_ROW, LAYER_DEFORM_ROW, TABLE_REF_ROW,
  LEFT_COLUMN_MASK_ROW, leftColumnMaskOptions,
} from '../../../providers/effects-aeon';
import { newEffectsScene } from '../../../../core/formats/effects/scene-ui';
import {
  BAND_MECHANISM_HINT, bandMotion, BAND_SCROLL_DIRECTION,
} from '../../../providers/bganim-preview-aeon';

// Parcel I: the bank strip's wording is measured against the same bar.
import {
  SHIFT_BUTTON_LABEL, SHIFT_BUTTON_TITLE, BANK_STRIP_HINT, BANK_THUMB_TITLE,
} from '../../../providers/bg-anim-art';

const HERE = join(__dirname, '..');
const scenePanel = readFileSync(join(HERE, 'EffectsScenePanel.tsx'), 'utf8');
const bandPanel = readFileSync(join(HERE, 'BgAnimBandPanel.tsx'), 'utf8');
const bankStrip = readFileSync(join(HERE, 'BandBankStrip.tsx'), 'utf8');

/** Every `label="…"` / label={`…`} literal in a panel source, `${x}` holes narrowed to one digit. */
function labelLiterals(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/label=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    out.push((m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, '0'));
  }
  return out;
}

const existingLabels = [...labelLiterals(scenePanel), ...labelLiterals(bandPanel)];
const longestExistingLabel = Math.max(...existingLabels.map((s) => s.length));
const longestToken = (s: string) => Math.max(...s.split(/\s+/).map((t) => t.length));

// Parcel D's rows, parcel H's two control rows and their hints, and parcel I's
// bank strip — the same bar, extended rather than re-measured.
const newLabels = [
  PLANE_FACTOR_ROWS.fa.label, PLANE_FACTOR_ROWS.fb.label,
  LAYER_CURVE_ROW.label, LAYER_VSPLIT_ROW.label, LAYER_VSPLIT_ROW.none, LAYER_VSPLIT_ROW.at,
  SHIFT_BUTTON_LABEL, ...labelLiterals(bankStrip),
  // Wave 2's four deform rows and the table sub-form.
  SCENE_DEFORM_ROWS.deform_fg.label, SCENE_DEFORM_ROWS.deform_bg.label,
  V_DEFORM_ROW.label, LAYER_DEFORM_ROW.label,
  TABLE_REF_ROW.label, TABLE_REF_ROW.binLabel,
  SCENE_DEFORM_ROW_SHARED.none, SCENE_DEFORM_ROW_SHARED.on,
  V_DEFORM_ROW.none, V_DEFORM_ROW.on, LAYER_DEFORM_ROW.none, LAYER_DEFORM_ROW.on,
  // The policy row and every value its picker renders — including the disabled
  // one, which is still drawn and therefore still occupies the column.
  LEFT_COLUMN_MASK_ROW.label,
  ...leftColumnMaskOptions(newEffectsScene('wording')).map((o) => o.label),
];
const newStrings = [
  ...newLabels, PLANE_FACTOR_HINT, BAND_MECHANISM_HINT,
  LAYER_CURVE_ROW.hint, LAYER_VSPLIT_ROW.hint, LAYER_CURVE_ROW.none,
  SCENE_DEFORM_ROW_SHARED.hint, V_DEFORM_ROW.hint, LAYER_DEFORM_ROW.hint,
  LEFT_COLUMN_MASK_ROW.hint,
  SHIFT_BUTTON_TITLE, BANK_STRIP_HINT, BANK_THUMB_TITLE(0), BANK_THUMB_TITLE(7),
  ...[0, 2, 3].flatMap((n) => [
    bandMotion({ driver: 'timer', rateShift: n }, 'band'),
    bandMotion({ driver: 'camera_x', rateShift: n }, 'candidate'),
  ]),
];

describe('the new wording fits the column the existing wording already fits', () => {
  it('the bar is measured from the panels, not typed', () => {
    // A bar that read as zero would make every row below vacuous.
    expect(existingLabels.length).toBeGreaterThan(5);
    expect(longestExistingLabel).toBeGreaterThan(0);
  });

  it('no new label is longer than the longest existing label', () => {
    for (const l of newLabels) expect(l.length, l).toBeLessThanOrEqual(longestExistingLabel);
  });

  it('no new string carries an unbreakable token longer than the longest existing label', () => {
    for (const s of newStrings) expect(longestToken(s), s).toBeLessThanOrEqual(longestExistingLabel);
  });

  it('the direction constant, when flipped, still cannot lengthen the widest token', () => {
    for (const dir of ['left', 'right'] as const) {
      expect(dir.length).toBeLessThanOrEqual(longestExistingLabel);
    }
    expect(['', 'left', 'right']).toContain(BAND_SCROLL_DIRECTION);
  });
});

describe('fa / fb say which plane, and "packed" stays inside the custom expander', () => {
  it('labels the rows by plane and role', () => {
    expect(PLANE_FACTOR_ROWS.fa.label).toBe('Plane A (fg)');
    expect(PLANE_FACTOR_ROWS.fb.label).toBe('Plane B (bg)');
  });

  it('the hint spells out fg / bg, says what the fraction is, and what 1 means', () => {
    expect(PLANE_FACTOR_HINT).toMatch(/A = foreground/);
    expect(PLANE_FACTOR_HINT).toMatch(/B = background/);
    expect(PLANE_FACTOR_HINT).toMatch(/fraction of camera/i);
    expect(PLANE_FACTOR_HINT).toMatch(/1 = with the camera/);
  });

  it('none of the row labels, titles or the hint says "packed"', () => {
    for (const row of Object.values(PLANE_FACTOR_ROWS)) {
      expect(row.label).not.toMatch(/packed/i);
      expect(row.title).not.toMatch(/packed/i);
    }
    expect(PLANE_FACTOR_HINT).not.toMatch(/packed/i);
  });

  it('in the panel source, the only quoted "packed" is inside FactorField (the custom expander)', () => {
    const start = scenePanel.indexOf('function FactorField');
    const end = scenePanel.indexOf('export default function EffectsScenePanel');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const outside = stripComments(scenePanel.slice(0, start) + scenePanel.slice(end));
    const quoted = outside.match(/(["'`])(?:(?!\1)[^\\]|\\.)*?\1/g) ?? [];
    expect(quoted.filter((q) => /packed/i.test(q))).toEqual([]);
  });
});

describe('the panels render the constants rather than a second copy of the words', () => {
  it('EffectsScenePanel uses PLANE_FACTOR_ROWS and PLANE_FACTOR_HINT', () => {
    expect(scenePanel).toMatch(/PLANE_FACTOR_ROWS/);
    expect(scenePanel).toMatch(/PLANE_FACTOR_HINT/);
    expect(scenePanel).not.toMatch(/Plane [AB] packed scroll factor/);
  });
  it('EffectsScenePanel renders LAYER_CURVE_ROW / LAYER_VSPLIT_ROW and writes both keys through setLayerFieldCommand', () => {
    for (const k of ['label', 'title', 'hint'] as const) {
      expect(scenePanel).toMatch(new RegExp(`LAYER_CURVE_ROW\\.${k}`));
      expect(scenePanel).toMatch(new RegExp(`LAYER_VSPLIT_ROW\\.${k}`));
    }
    expect(scenePanel).toMatch(/setLayerFieldCommand\(\s*library,\s*selected\.id,\s*i,\s*'curve'/);
    expect(scenePanel).toMatch(/setLayerFieldCommand\(\s*library,\s*selected\.id,\s*i,\s*'vsplit'/);
    // The read-only extras line no longer says "no control yet" for these two.
    expect(scenePanel).not.toMatch(/no control yet/);
  });
  // ROADMAP row 13 — the curve picker must not OFFER the value the build
  // refuses. The provider decides which one that is; this holds the wiring,
  // which is the half a node suite can otherwise never see (`disabled` marked
  // in the provider and dropped on the floor by the component renders a
  // completely normal, fully green, still-broken dropdown).
  it('EffectsScenePanel greys the refused curve option — curveFieldOptions reaches the <option>', () => {
    // The narrowed list is asked for, on the CURVE row and nowhere else:
    // `fa`/`fb` are the factor space itself and have no refused member.
    expect(scenePanel).toMatch(/options=\{curveFieldOptions\(layer\)\}/);
    expect(scenePanel.match(/curveFieldOptions\(/g)!.length).toBe(1);
    // The flag has to REACH the option and the reason has to reach its title,
    // or the value the engine refuses stays pickable however carefully the
    // provider marked it.
    // ⚠ BOUNDED TO `FactorField` ITSELF, AND THE FIRST CUT WAS NOT. Slicing
    // from `function FactorField` to end-of-file swept in the `left_column_mask`
    // and `period` pickers, which render the IDENTICAL `disabled={o.disabled}`
    // line — so the plant that deleted the flag from THIS component came back
    // green on the strength of two other components' correctness. Two code
    // paths, one observable: the classic vacuous row.
    const ffStart = scenePanel.indexOf('function FactorField');
    const ffEnd = scenePanel.indexOf('\nfunction ', ffStart + 1);
    expect(ffStart, 'FactorField must exist to be measured').toBeGreaterThan(-1);
    expect(ffEnd, 'FactorField must be followed by another top-level function').toBeGreaterThan(ffStart);
    const factorField = scenePanel.slice(ffStart, ffEnd);
    // The bound is real: the NEXT picker's own options must be outside it.
    expect(factorField).not.toMatch(/leftColumnMaskOptions|tableRefParamOptions/);
    expect(factorField).toMatch(/<option[^>]*disabled=\{o\.disabled\}/);
    expect(factorField).toMatch(/title=\{o\.title\}/);
    // Said in the list, not only in a tooltip — the same suffix the
    // `left_column_mask` and `period` pickers use, so one card does not carry
    // three idioms for one idea.
    expect(factorField).toMatch(/o\.disabled \? ' \(engine refuses\)' : ''/);

    // DERIVED, NEVER COPIED. The comparison lives in `curveGoesNowhere` alone;
    // a component that re-derived "to equals fb" could drift from the advisory
    // after any edit to either. Comments are stripped first — this file's own
    // prose above names the rule, and a bare `not.toMatch` would pass on the
    // strength of a comment rather than the code.
    const code = scenePanel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).toMatch(/export default function EffectsScenePanel/);   // anti-vacuous strip
    expect(code).not.toMatch(/JSON\.stringify\([^)]*\bfb\b/);
    expect(code).not.toMatch(/===\s*layer\.fb/);
    expect(code).not.toMatch(/layer\.fb\s*===/);
  });
  it('EffectsScenePanel renders the four deform rows and writes all four keys', () => {
    for (const c of ['SCENE_DEFORM_ROWS', 'SCENE_DEFORM_ROW_SHARED', 'V_DEFORM_ROW', 'LAYER_DEFORM_ROW', 'TABLE_REF_ROW']) {
      expect(scenePanel, c).toMatch(new RegExp(`\\b${c}\\b`));
    }
    expect(scenePanel).toMatch(/setSceneFieldCommand\(\s*\n?\s*library,\s*selected\.id,\s*'v_deform'/);
    expect(scenePanel).toMatch(/setLayerFieldCommand\(\s*\n?\s*library,\s*selected\.id,\s*i,\s*'deform'/);
    // THE CARD'S OWN SENTENCE ABOUT ITSELF IS GONE. The extras line's tooltip
    // said "(deform is wave 2)" — it was the panel telling the author the gap
    // this parcel closed, and leaving it would be the card describing a version
    // of itself that no longer exists.
    expect(scenePanel).not.toMatch(/deform is wave 2/);
    // And the advisory that had no caller anywhere now has one.
    expect(scenePanel).toMatch(/advisoryLayerDeformConflicts\(selected\)/);
  });
  it('EffectsScenePanel renders the left_column_mask row and toggles v_deform ATOMICALLY with it', () => {
    expect(scenePanel).toMatch(/<Field label=\{LEFT_COLUMN_MASK_ROW\.label\}/);
    expect(scenePanel).toMatch(/leftColumnMaskOptions\(selected\)/);
    // The disabled flag has to REACH the option, or `sprite_mask` — which the
    // engine refuses outright — would be pickable however carefully the
    // provider marked it.
    expect(scenePanel).toMatch(/disabled=\{o\.disabled\}/);
    // THE ATOMIC TOGGLE. `v_deform` off must clear the policy in the same
    // command; a plain setSceneFieldCommand on that row would leave the scene
    // build-refused for having turned a feature off.
    expect(scenePanel).toMatch(/vDeformToggleCommand\(library,\s*selected\.id,\s*v === 'on'\)/);
    const code = scenePanel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code).toMatch(/export default function EffectsScenePanel/);   // anti-vacuous strip
    expect(code).not.toMatch(/setSceneFieldCommand\(\s*\n?\s*library,\s*selected\.id,\s*'v_deform',\s*vDeform/);
    // The old sentence that sent the author to a text editor is gone.
    expect(scenePanel).not.toMatch(/no control for it yet/);
  });
  it('BgAnimBandPanel renders BAND_MECHANISM_HINT', () => {
    expect(bandPanel).toMatch(/BAND_MECHANISM_HINT/);
  });
});

// ---------------------------------------------------------------------------
// Every slot range this panel prints goes through `slotSpanPhrase` (item 54)
// ---------------------------------------------------------------------------
//
// The arithmetic is pinned in `providers/__tests__/bg-anim-aeon.test.ts`, where
// the node suite can call it. What CANNOT be reached from there is whether the
// panel calls it at all: three readouts each composed `base .. base + count`
// inline in JSX, one past the end every time, and a provider row proves nothing
// about a component that does its own sums. So these rows read the panel SOURCE
// — the same instrument the section above uses — and hold each readout to the
// shared helper by the words only that readout says.
//
// (What none of this can see is the rendered pixel. The strings are pinned here;
// seeing them on screen is a foreground CDP job.)
describe('the band panel prints no slot range of its own', () => {
  // COMMENTS STRIPPED, for every row below. A `toMatch` over a whole .tsx will
  // happily be satisfied by a COMMENT that quotes the call — including the
  // comments this parcel added explaining the fix — which is a green that says
  // nothing about what the panel renders. The panel carries no URLs, so eating
  // `//` to end-of-line takes nothing but comments.
  const code = bandPanel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('the stripped panel is still the panel', () => {
    // Anti-vacuous: a strip that ate the file would make every row below pass
    // its negatives and fail nothing.
    // (Not a size ratio: over half this panel's characters ARE comment, which is
    // the house style. Structural markers instead.)
    expect(code).toMatch(/export default function BgAnimBandPanel/);
    expect(code).toMatch(/<Hint under>/);
    expect(code).toMatch(/slotSpanPhrase/);
  });

  it('the band card\'s subtitle prints the row\'s prepared range and adds no second "slots"', () => {
    // Unique to this readout: it is the only line where the range is followed by
    // the tile count and the singular/plural of "tile".
    expect(code).toMatch(/\{b\.slotRange\} · \{b\.tileCount\} tile\{b\.tileCount === 1/);
    // `slotRange` now carries the word itself; a leftover "slots {b.slotRange}"
    // would render "slots slots 0..127".
    expect(code).not.toMatch(/slots \{b\.slotRange\}/);
  });

  it('the blob budget line derives its animated prefix from the count', () => {
    // Unique to this readout: "N animated (…)" inside the blob budget Hint.
    expect(code).toMatch(
      /\{budget\.animatedSlots\} animated \(\{slotSpanPhrase\(0, budget\.animatedSlots\)\}\)/,
    );
  });

  it('the promote form\'s "→ slots …" line derives its range from the candidate\'s tile count', () => {
    // Unique to this readout: the arrow that opens the promote hint.
    expect(code).toMatch(/→ \{slotSpanPhrase\(staticBase, tileCount\)\}\./);
    // …and the "From tile" field's title, the same fact as a tooltip.
    expect(code).toMatch(/the range is \$\{slotSpanPhrase\(staticBase, tileCount\)\}/);
    expect(code).toMatch(/already own \$\{slotSpanPhrase\(0, budget\.animatedSlots\)\}/);
  });

  it('no readout in the panel prints a range end computed inline', () => {
    // THE SHAPE OF THE DEFECT, swept for rather than listed: `..{x + y}` or
    // `..${x + y}` in a display string is a range end computed beside the range
    // instead of derived with it — which is how all three of these came to name
    // one slot too many.
    expect(code.match(/\.\.\$?\{[^}]*\+[^}]*\}/g) ?? []).toEqual([]);
    // anti-vacuous: the sweep can see the panel's real interpolations
    expect(code.match(/\$?\{slotSpanPhrase\([^)]*\)\}/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ║ THE V-DEFORM ROW'S TWO CROSS-FEATURE SENTENCES ARE ACTUALLY MOUNTED     ║
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠ WHAT A SOURCE TEST CAN AND CANNOT SAY, `ramp-control-wording.test.ts`'s
// split. It cannot see a pixel or mount a component — that is a CDP harness,
// which this suite does not run. What it CAN hold is structural, and structural
// is exactly where these two sentences were lost: both derivations existed and
// returned correct strings while NOTHING CALLED THEM. `advisoryLayerDeformConflicts`
// was a pure function nobody called for weeks (this panel's own line 60 records
// it), so "the provider is right" is not evidence that an author sees anything.
describe('the scene panel mounts what v_deform changes elsewhere', () => {
  // Comments stripped, the sibling files' rule: a claim discussed in a comment
  // must not satisfy a row that means "the panel CALLS this".
  const panelCode = scenePanel
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('the V-deform row calls vDeformRampAdvisory and paints its short half', () => {
    expect(panelCode).toContain('vDeformRampAdvisory(');
    // PAINTED, not hover-only. The pattern is the ramp card's: `short` inside the
    // element, `full` on its `title`. A sentence an author must act on cannot
    // live only in a tooltip.
    expect(panelCode).toMatch(/title=\{impact\.full\}[\s\S]{0,40}\{impact\.short\}/);
  });

  it('and it is gated on the state that HAS the consequence, not painted always', () => {
    expect(panelCode).toMatch(/vDeformValue\(selected\) === null\) return null/);
    // ⚠ AND ON AN ACT. With no act there are no sections, so there is no binding
    // to resolve — `BandPresetPanel` is silent in that state and these two must
    // not disagree.
    expect(panelCode).toMatch(/if \(act === null\) return null/);
  });

  it('the ramp sentence is NOT in the warning list — it is not a build refusal', () => {
    // aeon cannot see a preset document, so this pairing builds green and runs.
    // Dressing it as an error would make the two real refusals beside it cheaper.
    const at = panelCode.indexOf('vDeformRampAdvisory(');
    expect(at).toBeGreaterThan(-1);
    const mount = panelCode.slice(at, at + 400);
    expect(mount).not.toContain('tone="warning"');
  });

  it('the layer card mounts the SECOND vsplit refusal beside the first', () => {
    // ROADMAP row 80 put the lock refusal under the control that trips it; the
    // v_deform refusal one ensure below it never got the same treatment.
    expect(panelCode).toContain('vsplitLockAdvisoryParts(selected, layer)');
    expect(panelCode).toContain('vsplitVDeformAdvisoryParts(selected, layer)');
  });

  it('and neither of the two refusals suppresses the other', () => {
    // Two independent conditionals, not an if/else — the remedies differ, and
    // choosing which of two real refusals an author may see is the mistake
    // `sceneDeformAdvisories`' guard 3 records.
    expect(panelCode).not.toMatch(/vsplitLockAdvisoryParts[\s\S]{0,200}else/);
    const lockAt = panelCode.indexOf('vsplitLockAdvisoryParts(selected, layer)');
    const vdAt = panelCode.indexOf('vsplitVDeformAdvisoryParts(selected, layer)');
    expect(vdAt).toBeGreaterThan(lockAt);
    // Each returns its own `<Advisory …/>`, so both can render at once.
    expect(panelCode.match(/<Advisory under \{\.\.\.\w+\} \/>/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(3);
  });
});
