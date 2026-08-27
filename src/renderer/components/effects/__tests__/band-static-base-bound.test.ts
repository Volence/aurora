// ROADMAP item 40, site 2: the BAND PROMOTION base.
//
// WHAT THE BUG WAS. "From tile" renders `min={budget.firstPromotableSlot}` and
// committed `Math.max(0, Math.round(n) || 0)`. Two different bounds: the number
// on the spinner was the end of the animated prefix, and the number the form
// would actually hold was 0, so every slot a band already owns was typeable.
//
// WHY THAT MATTERS EVEN THOUGH THE COMMAND REFUSES. `requirePromotableRange`
// does refuse the promotion — but only after the click, and the panel spends
// the whole time until then telling the author otherwise: the field's own title
// and the hint under it print `slotSpanPhrase(staticBase, tileCount)`, naming
// slots that belong to a band, and the map lens tints those cells. The rows
// below pin BOTH halves — that the clamp holds, and that the value it refuses
// to hold is one the command really would have rejected — so this cannot be a
// bound that is merely displayed differently.
//
// EVERY NUMBER IS DERIVED. `firstPromotableSlot` comes out of the shipped
// fixture via `bandBudget`; nothing here is transcribed.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseBgOverride, type BgOverrideDocument } from '../../../../core/formats/bg-override/bg-override';
import { bandBudget, clampStaticBase, promoteBandCommand } from '../../../providers/bg-anim-aeon';

const FIXTURE = 'test/fixtures/bg-override/editor_bg_override.b0e5a661.json';
const doc = (): BgOverrideDocument => parseBgOverride(readFileSync(FIXTURE, 'utf8')).doc;

describe('clampStaticBase — the promotion base the form is allowed to hold', () => {
  const first = bandBudget(doc()).firstPromotableSlot;

  it('has a floor worth enforcing on the document it will be used against', () => {
    // Anti-vacuous. If the fixture's animated prefix were empty, `min` would be
    // 0, `Math.max(0, …)` would have been correct all along, and every row
    // below would pass on a document that cannot express the defect.
    expect(first, 'the fixture must already carry bands').toBeGreaterThan(0);
  });

  it('pulls a typed value below the animated prefix up to the first legal slot', () => {
    expect(clampStaticBase(0, first)).toBe(first);
    expect(clampStaticBase(first - 1, first)).toBe(first);
    expect(clampStaticBase(-9999, first)).toBe(first);
  });

  it('leaves the bound itself and everything above it alone', () => {
    expect(clampStaticBase(first, first)).toBe(first);
    expect(clampStaticBase(first + 1, first)).toBe(first + 1);
    expect(clampStaticBase(first * 2, first)).toBe(first * 2);
  });

  it('rounds a fractional value and falls to the first legal slot on a non-number', () => {
    expect(clampStaticBase(first + 1.6, first)).toBe(first + 2);
    expect(clampStaticBase(Number.NaN, first)).toBe(first);
    expect(clampStaticBase(Number.POSITIVE_INFINITY, first)).toBe(first);
    // `Number('')` is 0 rather than NaN, so a 0 arriving here lands on the
    // first legal slot through the FLOOR, not through the non-finite branch.
    // Both roads, one destination.
    //
    // THIS IS NO LONGER THE EMPTIED BOX. It was when this row was written —
    // `NumberField` handed on `Number(e.target.value)` — and that was the
    // defect: the emptied box committed a slot the author never typed, and
    // this clamp could not tell it apart from a deliberate 0. `NumberField`
    // now commits NOTHING for a box with no number in it, so the only 0 that
    // reaches this clamp is one somebody meant. The row stays because 0 is
    // still a value this clamp must floor.
    expect(clampStaticBase(Number(''), first)).toBe(first);
  });

  it('refuses exactly the values the promotion command refuses', () => {
    // Bar 2e in one row: the floor is not decorative. A base one below it is a
    // promotion the codec really rejects, and the clamped base is one it takes.
    const spec = { cols: 1, rows: 1 };
    const below = promoteBandCommand(doc(), first - 1, spec);
    expect(below.ok, 'a base inside the animated prefix must be refused').toBe(false);
    const at = promoteBandCommand(doc(), clampStaticBase(first - 1, first), spec);
    expect(at.ok, 'the clamped base must be one the command accepts').toBe(true);
  });

  it('takes the floor it is given rather than a floor of its own', () => {
    // The whole point of the parameter: a different document moves the enforced
    // bound with it, because the panel hands this the same expression it hands
    // `min`.
    expect(clampStaticBase(first - 1, first + 4)).toBe(first + 4);
    expect(clampStaticBase(0, 0)).toBe(0);
  });
});

// The wiring, by source scan. Comments are STRIPPED FIRST — the panel is dense
// with prose about `min` stopping nothing, and an unstripped scan would match
// that prose rather than the code. The scan is then SCOPED to the "From tile"
// element, because the section holds three other NumberFields whose bounds are
// their own business.
const RAW = (): string => readFileSync(join(__dirname, '..', 'BgAnimBandPanel.tsx'), 'utf8');
const strip = (s: string): string => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const fromTileEl = (src: string): string => {
  const els = (src.match(/<NumberField[\s\S]*?\/>/g) ?? [])
    .filter((e) => e.includes('firstPromotableSlot'));
  expect(els, 'exactly one NumberField bounds itself by firstPromotableSlot').toHaveLength(1);
  return els[0];
};

describe('BgAnimBandPanel wiring — "From tile"', () => {
  it('enforces the same expression it displays', () => {
    const el = fromTileEl(strip(RAW()));
    // Both bounds, character for character the same expression. Not two
    // spellings that happen to agree today.
    const min = /min=\{([^}]+)\}/.exec(el)?.[1];
    const floor = /clampStaticBase\(\s*[A-Za-z0-9_.]+\s*,\s*([^)]+)\)/.exec(el)?.[1];
    expect(min, 'the field must still display a min').toBeTruthy();
    expect(floor, 'the commit must run through clampStaticBase').toBeTruthy();
    expect(floor?.trim()).toBe(min?.trim());
  });

  it('no longer clamps the typed base to zero', () => {
    expect(fromTileEl(strip(RAW()))).not.toMatch(/Math\.max\(\s*0\s*,/);
  });

  it('strips comments before scanning (the poison the last two parcels hit)', () => {
    // The element's comment quotes the old `Math.max(0, …)` on purpose, so the
    // UNSTRIPPED element matches the forbidden pattern and the stripped one
    // does not. Without the strip, the row above would go green on prose.
    expect(fromTileEl(RAW()), 'the comment must quote the old clamp')
      .toMatch(/Math\.max\(\s*0\s*,/);
    expect(fromTileEl(strip(RAW()))).not.toMatch(/Math\.max\(\s*0\s*,/);
  });
});
