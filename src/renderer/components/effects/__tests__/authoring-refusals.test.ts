// AUTHORING-TIME REFUSALS — EFFECTS-W1 defects 5 and 7.
//
// ═══ WHAT WAS WRONG ═══
//
// Three states passed this editor in complete silence and failed aeon's build:
//
//   • a `variants` line mask with `L0` lit — one click, on a button whose own
//     tooltip stated the rule, producing `[Error] variant: lines mask 15
//     selects line 0 (the character's) — use bits 1-3 @ Span { source:
//     SourceId(8), start: 2800 }`;
//   • `Top 200 / Bot 100` — accepted silently, then FOUR build errors in three
//     vocabularies quoting two specs the author cannot open;
//   • `Top = 40112` — a typo the panel itself caused by not selecting the box's
//     contents on click, accepted just as silently.
//
// ═══ WHAT THESE ROWS PROVE, AND WHAT THEY CANNOT ═══
//
// They prove the DERIVATIONS refuse and that their sentences name the preset,
// the card and the field. They also read the panel SOURCE to prove the controls
// are wired to those derivations rather than to `min`/`max`.
//
// ⚠ THEY CANNOT PROVE A REFUSAL REACHED THE SCREEN, and the distinction is the
// whole reason `min`/`max` were never enough: on `<input type="number">` those
// attributes govern the spinner and `:invalid` and stop NO typed value. A row
// asserting `min={3}` would be asserting a thing that does not work. The screen
// is `scratchpad/effects-refusal-harness.mjs`, which types into the real boxes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  newPreset, newBand,
  bandSubject, cycleSubject, variantSubject,
  bandEdgeRefusal, variantLineRefusal, cycleFieldRefusal,
  parseColours, bandEdgeBounds, bandCollisionAdvisory,
} from '../../../providers/effects-preset';
import { EFFECTS_FIRE_LINE_MIN, EFFECTS_FIRE_LINE_MAX } from '../../../providers/effects-aeon';

const panel = readFileSync(join(__dirname, '..', 'BandPresetPanel.tsx'), 'utf8');
const code = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fields = readFileSync(
  join(__dirname, '..', '..', 'ui', 'fields.tsx'), 'utf8',
);

describe('the slice is bounded and the strip really stripped', () => {
  it('the panel source parses to real code, not an empty string', () => {
    expect(panel.length - code.length).toBeGreaterThan(500);
    expect(code).toMatch(/export default function BandPresetPanel/);
  });
});

describe('a band edge outside the fire bound is REFUSED, not forwarded', () => {
  const band = newBand();          // top 112, bot 128

  it('the exact typo the panel used to produce is refused, by name', () => {
    const why = bandEdgeRefusal(band, 'ojz_water', 0, 'top', 40112);
    expect(why).not.toBeNull();
    // DEFECT 7: the coordinates a person can act on come first.
    expect(why).toMatch(/^preset "ojz_water" · Raster band 0 · Top:/);
    // ...and the engine's own rule, with its own numbers, rather than a bound
    // this file invented.
    expect(why).toContain(`${EFFECTS_FIRE_LINE_MIN}..${EFFECTS_FIRE_LINE_MAX}`);
    expect(why).toMatch(/Refused; Top is still 112\.$/);
  });

  it('both ends of the bound, and both edges', () => {
    for (const edge of ['top', 'bot'] as const) {
      expect(bandEdgeRefusal(band, 'p', 0, edge, EFFECTS_FIRE_LINE_MIN - 1)).not.toBeNull();
      expect(bandEdgeRefusal(band, 'p', 0, edge, EFFECTS_FIRE_LINE_MAX + 1)).not.toBeNull();
    }
  });

  it('a LEGAL value is silent — this is a refusal, not a permanent wall', () => {
    // ANTI-VACUOUS. A predicate that returned a sentence for everything would
    // satisfy every row above and make the control unusable.
    expect(bandEdgeRefusal(band, 'p', 0, 'top', 40)).toBeNull();
    expect(bandEdgeRefusal(band, 'p', 0, 'bot', 200)).toBeNull();
    const b = bandEdgeBounds(band, 'top');
    expect(bandEdgeRefusal(band, 'p', 0, 'top', b.min)).toBeNull();
    expect(bandEdgeRefusal(band, 'p', 0, 'top', b.max)).toBeNull();
  });

  it('a non-integer is refused too — a screen line has no fractional part', () => {
    expect(bandEdgeRefusal(band, 'p', 0, 'top', 40.5)).toMatch(/not a whole number/);
  });
});

describe('Top >= Bot is REFUSED, and the message says how to escape it', () => {
  it('the walkthrough\'s own Top 200 / Bot 100 cannot be authored', () => {
    const band = { ...newBand(), top: 112, bot: 100 };
    // The state is reached by typing 200 into Top while Bot is 100.
    const why = bandEdgeRefusal({ ...band, top: 112, bot: 100 }, 'ojz_water', 2, 'top', 200);
    expect(why).not.toBeNull();
    expect(why).toMatch(/^preset "ojz_water" · Raster band 2 · Top:/);
    expect(why).toMatch(/top must stay above bot/);
    // ⚠ THE ESCAPE. Refusing an order violation makes a band un-moveable
    // DOWNWARD unless the author is told which edge to move first — and both
    // edges bound each other, so an order that works always exists.
    expect(why).toMatch(/Move the other edge first to make room/);
  });

  it('and symmetrically for Bot', () => {
    const band = newBand();       // top 112
    expect(bandEdgeRefusal(band, 'p', 0, 'bot', 100)).toMatch(/Move the other edge first/);
    expect(bandEdgeRefusal(band, 'p', 0, 'bot', 113)).toBeNull();
  });

  it('a NEIGHBOURING band is NOT refused — rules 3 and 4 stay advisory', () => {
    // The line this parcel deliberately did not cross. Two bands over disjoint
    // CRAM spans may nest, so walling an edge off with a neighbour's value
    // would refuse programs the engine builds. They advise instead.
    const preset = newPreset('p');
    preset.bands = [
      { top: 40, bot: 72, sh: false, on: { cram: { addr: 74, colours: [14] } } },
      { top: 50, bot: 60, sh: false, on: { cram: { addr: 74, colours: [3584] } } },
    ];
    expect(bandEdgeRefusal(preset.bands[1], 'p', 1, 'top', 50)).toBeNull();
    const advice = bandCollisionAdvisory(preset, 1);
    expect(advice).not.toBeNull();
    expect(advice).toMatch(/^preset "p": Raster band 0 \(lines 40\.\.72\) and Raster band 1/);
  });
});

describe('L0 in a variants line mask is REFUSED — the one click that cost a build', () => {
  it('lighting L0 is refused and quotes the build message it prevents', () => {
    const why = variantLineRefusal('ojz_water', 1, 0b1110, 0);
    expect(why).not.toBeNull();
    expect(why).toMatch(/^preset "ojz_water" · Slot 1 · lines:/);
    expect(why).toMatch(/selects line 0 \(the character's\)/);
    // NAMES WHAT THE DOCUMENT STILL HOLDS, not merely that the click was
    // ignored — see bandEdgeRefusal's own note on why "Not written" was not
    // the whole truth.
    expect(why).toMatch(/Refused; the mask is still 14\.$/);
  });

  it('CLEARING a bit 0 a hand-written file carries is still allowed', () => {
    // ⚠ THE ASYMMETRY IS THE POINT. A panel that refused the click which FIXES
    // an illegal mask would trap the author inside it with no control that can
    // leave. `variantLineOn` decides the direction, so this cannot drift.
    expect(variantLineRefusal('p', 0, 0b1111, 0)).toBeNull();
  });

  it('lines 1-3 are never refused, in either direction', () => {
    for (const line of [1, 2, 3]) {
      expect(variantLineRefusal('p', 0, 0b0000, line)).toBeNull();
      expect(variantLineRefusal('p', 0, 0b1111, line)).toBeNull();
    }
  });
});

describe('a cycle channel on line 0 is refused; nothing else in that card is', () => {
  it('line 0 is refused, naming the channel', () => {
    const why = cycleFieldRefusal('ojz_water', 3, 'line', 0);
    expect(why).toMatch(/^preset "ojz_water" · Channel 3 · line:/);
    expect(why).toMatch(/Never 0/);
  });

  it('lines 1-3 pass, and the other fields carry NO invented bound', () => {
    expect(cycleFieldRefusal('p', 0, 'line', 2)).toBeNull();
    // §E.4 still stands where the contract states no rule: `first`, `count` and
    // `period` are forwarded verbatim, however odd, so the engine's own ensure
    // (which carries the measurement) is what the author reads.
    for (const f of ['first', 'count', 'period']) {
      expect(cycleFieldRefusal('p', 0, f, 0)).toBeNull();
      expect(cycleFieldRefusal('p', 0, f, 99999)).toBeNull();
    }
  });
});

describe('every message names the thing (defect 7)', () => {
  it('the three subject builders produce the coordinates the panel shows', () => {
    expect(bandSubject('x', 2, 'Top')).toBe('preset "x" · Raster band 2 · Top');
    expect(cycleSubject('x', 0, 'line')).toBe('preset "x" · Channel 0 · line');
    expect(variantSubject('x', 1, 'lines')).toBe('preset "x" · Slot 1 · lines');
  });

  it('the colours parser carries the subject when the panel passes one', () => {
    const bad = parseColours('nope', bandSubject('ojz_water', 0, 'colours'));
    expect(bad.ok).toBe(false);
    expect(bad.ok === false && bad.reason)
      .toMatch(/^preset "ojz_water" · Raster band 0 · colours: "nope" is not an integer/);
    // Still usable with no subject — the agent path has no card to point at.
    const bare = parseColours('nope');
    expect(bare.ok === false && bare.reason).toMatch(/^"nope" is not an integer/);
  });
});

describe('the controls are wired to the refusals, not to min/max', () => {
  // ⚠ WHY min/max IS ASSERTED ABSENT RATHER THAN PRESENT. On
  // `<input type="number">`, `min`/`max` govern the spinner arrows and the
  // `:invalid` pseudo-class and stop NO typed value — `min={3}` accepts 40112
  // and fires onChange with it. A row that asserted them would be pinning a
  // guard that does not guard, which is this repo's dominant defect class.
  it('Top and Bot pass `refuse`, and neither passes a min or a max', () => {
    const topField = /label="Top"[\s\S]{0,400}?<\/Field>/.exec(code)?.[0] ?? '';
    const botField = /label="Bot"[\s\S]{0,400}?<\/Field>/.exec(code)?.[0] ?? '';
    expect(topField).not.toBe('');
    expect(botField).not.toBe('');
    for (const [name, f] of [['Top', topField], ['Bot', botField]] as const) {
      expect(f, `${name} does not call bandEdgeRefusal`).toMatch(/refuse=\{\(n\) => bandEdgeRefusal\(/);
      expect(f, `${name} passes a min/max, which stops no typed value`).not.toMatch(/\bmin=|\bmax=/);
    }
  });

  it('the L0 chip goes through variantLineRefusal before it toggles', () => {
    expect(code).toMatch(/const why = variantLineRefusal\(/);
    // The toggle is GUARDED by it, in that order — a chip that computed the
    // reason and toggled anyway would satisfy a mere `toContain`.
    expect(code).toMatch(/if \(why !== null\) \{ setLineRefusal\(why\); return; \}/);
  });

  it('the cycle spinners go through cycleFieldRefusal', () => {
    expect(code).toMatch(/refuse=\{\(n\) => cycleFieldRefusal\(presetId, index, f, n\)\}/);
  });

  it('every refusal is RENDERED, at the warning tone, in the field column', () => {
    for (const re of [
      /\{edgeRefusal\.top !== null && <Hint under tone="warning">/,
      /\{edgeRefusal\.bot !== null && <Hint under tone="warning">/,
      /\{lineRefusal !== null && <Hint under tone="warning">/,
      /\{fieldRefusal\[f\] != null && <Hint under tone="warning">/,
    ]) expect(code, `no render for ${re}`).toMatch(re);
  });
});

describe('the number box itself', () => {
  it('selects its contents on focus — the cause of `40112`, fixed at the source', () => {
    expect(fields).toMatch(/e\.currentTarget\.select\(\)/);
  });

  it('a refused value is NOT committed: onChange is gated on the refusal', () => {
    // The contract, read out of the source in order: parse, ask, report, and
    // only then commit. A `refuse` that ran AFTER `onChange` would be a
    // decoration over a value already in the document.
    const body = /onChange=\{\(e\) => \{[\s\S]*?\}\}/.exec(fields)?.[0] ?? '';
    expect(body).not.toBe('');
    const askAt = body.indexOf('refuse?.(n)');
    const commitAt = body.indexOf('if (why === null) onChange(n)');
    expect(askAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(askAt);
  });

  it('a field with NO `refuse` behaves exactly as before — this is additive', () => {
    // The prop is optional and `?? null` means absent === "nothing refuses", so
    // the dozen other NumberFields in the app are untouched.
    expect(fields).toMatch(/const why = refuse\?\.\(n\) \?\? null;/);
  });
});
