// THE TWO LENGTHS OF A DELETE REFUSAL — DISABLED-CONTROL-REASON-BEHIND-DISCLOSURE.
//
// ═══ WHAT THIS FILE IS FOR, AND WHAT IT IS NOT ═══
//
// The card's one named cost is DRIFT: "these sentences are long (about 250
// characters), so a short form has to be written and the two can drift apart".
// The answer shipped is a CONSTRUCTION, not a vigilance: every clause is a
// `lead` (who still names the document) plus a joiner plus the rest, and BOTH
// lengths are built from that one `lead`. There is no second statement of who
// binds what, so there is nothing for an edit to make disagree.
//
// ⚠ SO THE ROWS BELOW ARE A CHECK ON THE CONSTRUCTION, NOT THE THING THAT HOLDS
// IT UP. A row asserting "short and full agree" would also pass over two
// hand-typed strings that happen to agree today, which is exactly the state the
// card refused. What is asserted instead is the property the construction has
// and a pair of hand-typed strings would not: every clause of the short form
// OPENS the corresponding clause of the full one, in order, for every arm of
// both refusals including the ones no fixture on disk can reach.
//
// ⚠ AND THE ANTI-VACUOUS FLOOR IS HERE TOO. `deleteRefusalIsPrefixed` returning
// true for everything would satisfy every row, so [neg] feeds it a pair that is
// NOT prefixed and requires a false.

import { describe, it, expect } from 'vitest';
import {
  deleteRefusalOf, deleteRefusalIsPrefixed,
} from '../../src/core/formats/effects/delete-refusal';
import { deletePresetRefusal } from '../../src/renderer/providers/effects-preset';
import { deleteSceneRefusal } from '../../src/renderer/providers/effects-aeon';

/** A region-mode act: a non-null document is enough for `actHasRegionsFile`. */
const rect = { x: 0, y: 0, w: 2048, h: 2048 };
const regionAct = (
  regions: Array<{ id: string; rasterRef?: string | null; sceneRef?: string | null }>,
) => ({
  regions: {
    document: {
      schema: 1,
      act: 'zz_act1',
      regions: regions.map((r) => ({ preset: 'ZZ_Preset', ...r, rect })),
    },
    loadedPath: 'data/regions.json',
    unreadable: null,
  },
});
/** State 3: the file exists and the read or the codec refused it. */
const refusedAct = () => ({
  regions: {
    document: null,
    loadedPath: null,
    unreadable: { path: 'data/regions.json', reason: 'unexpected end of JSON input' },
  },
});

/**
 * EVERY ARM OF BOTH REFUSALS, each named by the state that produces it.
 *
 * Both region arms and the leftover-sidecar arm are here because they are the
 * ones no act on disk produces today: OJZ act 1's sidecars are all null, so a
 * population drawn from the fixture would silently be three arms short.
 */
const ARMS: Array<{ what: string; refusal: { short: string; full: string } }> = [
  {
    what: 'preset, section mode, one section',
    refusal: deletePresetRefusal([{ rasterRef: null }, { rasterRef: 'mine' }], 'mine')!,
  },
  {
    what: 'preset, section mode, three sections',
    refusal: deletePresetRefusal(
      [{ rasterRef: 'mine' }, { rasterRef: null }, { rasterRef: 'mine' }, { rasterRef: 'mine' }],
      'mine')!,
  },
  {
    what: 'preset, region mode, two regions',
    refusal: deletePresetRefusal([{ rasterRef: null }], 'mine',
      regionAct([{ id: 'b', rasterRef: 'mine' }, { id: 'c', rasterRef: 'mine' }]))!,
  },
  {
    what: 'preset, region mode, a region AND a leftover sidecar (two clauses)',
    refusal: deletePresetRefusal([{ rasterRef: 'mine' }, { rasterRef: 'mine' }], 'mine',
      regionAct([{ id: 'a', rasterRef: 'mine' }]))!,
  },
  {
    what: 'preset, region mode, regions.json refused',
    refusal: deletePresetRefusal([{ rasterRef: null }], 'mine', refusedAct())!,
  },
  {
    what: 'preset, region mode, regions.json refused AND a leftover sidecar',
    refusal: deletePresetRefusal([{ rasterRef: 'mine' }], 'mine', refusedAct())!,
  },
  {
    what: 'scene, section mode, one section',
    refusal: deleteSceneRefusal([{ sceneRef: null }, { sceneRef: 'mine' }], 'mine')!,
  },
  {
    what: 'scene, section mode, three sections',
    refusal: deleteSceneRefusal(
      [{ sceneRef: 'mine' }, { sceneRef: null }, { sceneRef: 'mine' }, { sceneRef: 'mine' }],
      'mine')!,
  },
  {
    what: 'scene, region mode, two regions',
    refusal: deleteSceneRefusal([{ sceneRef: null }], 'mine',
      regionAct([{ id: 'b', sceneRef: 'mine' }, { id: 'c', sceneRef: 'mine' }]))!,
  },
  {
    what: 'scene, region mode, a region AND a leftover sidecar (two clauses)',
    refusal: deleteSceneRefusal([{ sceneRef: 'mine' }, { sceneRef: 'mine' }], 'mine',
      regionAct([{ id: 'a', sceneRef: 'mine' }]))!,
  },
  {
    what: 'scene, region mode, regions.json refused',
    refusal: deleteSceneRefusal([{ sceneRef: null }], 'mine', refusedAct())!,
  },
  {
    what: 'scene, region mode, regions.json refused AND a leftover sidecar',
    refusal: deleteSceneRefusal([{ sceneRef: 'mine' }], 'mine', refusedAct())!,
  },
];

describe('the composer builds both lengths from one lead', () => {
  it('[one] one clause: the short form is the lead, the full one is the lead plus the rest', () => {
    const r = deleteRefusalOf([{ lead: 'A binds "x"', joiner: '. ', rest: 'B. C.' }])!;
    expect(r.short).toBe('A binds "x".');
    expect(r.full).toBe('A binds "x". B. C.');
  });

  it('[two] two clauses: both leads, in order, in both lengths', () => {
    const r = deleteRefusalOf([
      { lead: 'A binds "x"', joiner: '. ', rest: 'B.' },
      { lead: 'C still carries "x"', joiner: ' ', rest: 'D.' },
    ])!;
    expect(r.short).toBe('A binds "x". C still carries "x".');
    expect(r.full).toBe('A binds "x". B. C still carries "x" D.');
  });

  it('[none] no clause is not an empty sentence, it is no refusal at all', () => {
    // A panel's contract is "null means the control is enabled"; an empty
    // string is a sentence it would happily paint.
    expect(deleteRefusalOf([])).toBeNull();
  });

  it('[neg] the prefix check can say no, so every row that uses it means something', () => {
    // THE ANTI-VACUOUS FLOOR. A predicate that answered true for every pair
    // would satisfy [arms] below over a hand-typed short form, which is the
    // drift the card named.
    expect(deleteRefusalIsPrefixed({ short: 'A binds "x".', full: 'A binds "x". B.' })).toBe(true);
    expect(deleteRefusalIsPrefixed({ short: 'A binds "y".', full: 'A binds "x". B.' })).toBe(false);
    expect(deleteRefusalIsPrefixed({
      short: 'A binds "x". C still carries "x".',
      full: 'A binds "x". B.',
    })).toBe(false);
    // Order matters: the second clause must come AFTER the first in the full
    // sentence, not merely appear somewhere in it.
    expect(deleteRefusalIsPrefixed({
      short: 'C still carries "x". A binds "x".',
      full: 'A binds "x". B. C still carries "x" D.',
    })).toBe(false);
  });
});

describe('every arm of both delete refusals speaks two lengths that cannot disagree', () => {
  it('[arms] the population is all twelve arms, including the three no act on disk reaches', () => {
    // A count, so a refusal that started returning null for a state would show
    // up as a missing arm rather than as a quietly smaller loop.
    expect(ARMS.length).toBe(12);
    for (const arm of ARMS) expect(arm.refusal).not.toBeNull();
  });

  for (const { what, refusal } of ARMS) {
    it(`[prefix] ${what}`, () => {
      expect(deleteRefusalIsPrefixed(refusal)).toBe(true);
      // The short form is a SENTENCE in a header, so it ends like one.
      expect(refusal.short.endsWith('.')).toBe(true);
      // It is short because a header row cannot carry 250 characters. Not a
      // style rule: the whole reason the split exists.
      expect(refusal.short.length).toBeLessThan(refusal.full.length / 2);
      // It names the document, which is the one thing an author needs to
      // connect the greyed button to the file they selected.
      expect(refusal.short).toContain('"mine"');
    });
  }

  it('[who] the short form names the same binders as the full one, because it IS them', () => {
    // Not a reading of the prose: the binders are varied and the short form has
    // to follow, which a constant or a truncation of the first N characters
    // would not.
    const one = deletePresetRefusal([{ rasterRef: null }, { rasterRef: 'mine' }], 'mine')!;
    expect(one.short).toBe('Section 1 binds "mine".');
    const many = deletePresetRefusal(
      [{ rasterRef: 'mine' }, { rasterRef: null }, { rasterRef: 'mine' }], 'mine')!;
    expect(many.short).toBe('Sections 0 and 2 bind "mine".');
    const regions = deleteSceneRefusal([{ sceneRef: null }], 'mine',
      regionAct([{ id: 'b', sceneRef: 'mine' }, { id: 'c', sceneRef: 'mine' }]))!;
    expect(regions.short).toBe('Regions b and c bind "mine".');
    const unknown = deleteSceneRefusal([{ sceneRef: null }], 'mine', refusedAct())!;
    expect(unknown.short).toBe('Aurora cannot tell whether a region binds "mine".');
  });

  it('[repair] the repair stays in the body: the header states the fact only', () => {
    // The short form is deliberately NOT a summary of the whole sentence. A
    // header that carried the repair as well would be a paraphrase of the body,
    // which is the second string this design exists to avoid.
    for (const { what, refusal } of ARMS) {
      expect(`${what}: ${refusal.short}`).not.toMatch(/revert to inherited/);
      expect(`${what}: ${refusal.short}`).not.toMatch(/Deleting it would leave/);
      // ...and the body does carry them, so the row above is not vacuous.
      expect(refusal.full.length).toBeGreaterThan(120);
    }
  });

  it('[dash] neither length carries an en dash or an em dash', () => {
    const codes = ARMS.flatMap(({ refusal }) => [...`${refusal.short}${refusal.full}`]
      .map((ch) => ch.codePointAt(0)));
    expect(codes.length).toBeGreaterThan(3000);
    expect(codes).not.toContain(0x2013);
    expect(codes).not.toContain(0x2014);
  });
});
