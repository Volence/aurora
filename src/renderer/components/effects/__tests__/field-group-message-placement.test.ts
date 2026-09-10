// NOTHING RENDERS BETWEEN THE TWO BOXES OF A FIELD GROUP.
//
// ═══ THE FINDING (UX seat A, F4) ═══
//
// A seat filling a raster band set `Top` to 40, tabbed, clicked `Bot` at the
// position they had MEASURED, typed `72`, and the field took `12872`. Measured
// either side of the commit: an explanatory block rendered inside the field
// group and the panel below it moved 120px, `S/H` from y=704 to y=824 and
// `addr` from 763 to 883. They had aimed at a control that had moved.
//
// ⚠ THE SEAT RAN A CONTROL BEFORE BELIEVING THEIR OWN DIAGNOSIS. With the panel
// settled they repeated the identical click and typed `72` again, and got `72`.
// So click-selects-contents works and the append was not a difference between
// the two boxes. And the app's REFUSAL is not the defect: it named the value,
// the rule, the legal range, why the range is what it is, and what the field
// still held, and clamped nothing. The seat quoted it approvingly. Nothing in
// this parcel changes a word of it.
//
// ═══ WHAT THESE ROWS PROVE, AND WHAT THEY CANNOT ═══
//
// ⚠ THIS IS A STRUCTURE GATE, NOT A LAYOUT PROOF, and the difference is the
// whole honesty of the row. The node suite in this repo cannot render React:
// there is no jsdom, the vitest glob is `.test.ts`, and nothing here can
// measure a pixel, a scroll position or a reflow. What these rows read is the
// panel's SOURCE, and what they assert is that between the two `<Field>`s of a
// declared group there is no element at all, and that the group's messages
// render after the second one.
//
// That is a real property and it is the mechanism the finding names: an element
// that is not in the flow between two boxes cannot move the second box. IT IS
// NOT A MEASUREMENT THAT NOTHING MOVES. Whether the panel is stable under a
// real refusal, at a real window size, is a question only a screen answers, and
// this parcel books it for a foreground sweep rather than dressing this file up
// as its answer.
//
// ═══ THE RESIDUAL, WHICH THESE ROWS DELIBERATELY DO NOT FORBID ═══
//
// Content BELOW a group still moves when the group speaks. `GroupHints`'s
// docblock has the argument in full: reserving the height costs 120px of blank
// column per group, and taking the message out of flow either eats the clicks
// meant for the control it covers or paints an undismissable sentence over a
// `<select>`. A refusal an author cannot see beside its control is the silent
// refusal this panel's whole refuse-at-the-control parcel exists to end, so the
// message stays next to its group and the residual is named rather than hidden.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PANEL = join(__dirname, '..', 'BandPresetPanel.tsx');

/**
 * The panel with its comments removed.
 *
 * ⚠ LOAD-BEARING. This file's assertion is "there is NOTHING between these two
 * fields", and a JSX comment renders nothing but is text. Without the strip,
 * every explanatory block in this panel would read as a violation, and the
 * obvious repair - loosening the assertion to "no `<Hint`" - would let the next
 * displacing element in unchallenged.
 */
// ⚠ THE JSX BRACES GO WITH THE COMMENT. A JSX comment is `{/* ... */}`, so
// stripping only the `/* ... */` leaves a bare `{}` behind - which is not
// whitespace, reads as a violation, and would have been "fixed" by loosening
// the assertion. Both spellings, block form first.
const code = readFileSync(PANEL, 'utf8')
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/**
 * The groups, and they are declared here rather than discovered.
 *
 * WHY A TABLE AND NOT A SCAN. "Which fields are one group" is a judgement about
 * what an author fills in one gesture; it is not derivable from the source, and
 * a gate that guessed it would either miss pairs or forbid placements that are
 * correct. What IS derived from the source is every claim below: each row is
 * LOCATED in the panel and fails loudly when it cannot be, so a card that is
 * renamed or removed reports that rather than passing vacuously.
 */
const GROUPS: readonly {
  card: string; first: string; second: string; messages: string; why: string;
}[] = [
  {
    card: 'BandCard', first: 'Top', second: 'Bot',
    messages: '[edgeRefusal.top, edgeRefusal.bot]',
    why: 'the pair the seat measured: two edges of one band, refused against each other',
  },
  {
    card: 'RampCard', first: 'Top', second: 'Lines',
    messages: "[said('top'), said('lines')]",
    why: 'the ramp span, one refusal function reading both boxes to decide either',
  },
  {
    card: 'RampCard', first: 'Start', second: 'Step',
    messages: "[said('start'), said('step')]",
    why: 'the fp16 rate pair, set together and refused by one function',
  },
  {
    card: 'BaseSwapBandCard', first: 'Line', second: 'Target',
    messages: "[said('line'), said('target')]",
    why: 'two number boxes in a row on the base-swap band card',
  },
  {
    card: 'BoundaryCard', first: 'Line', second: 'Channel',
    messages: "[said('line'), said('channel')]",
    why: 'the first two of the boundary card run of four',
  },
  {
    card: 'BoundaryCard', first: 'Lo', second: 'Hi',
    messages: "[said('lo'), said('hi')]",
    why: 'the boundary interval, where lo and hi are refused against each other',
  },
];

/** The source of one card component, so a label cannot be matched in another. */
function cardBody(name: string): string {
  const at = code.indexOf(`function ${name}(`);
  expect(at, `no function ${name}( in BandPresetPanel.tsx: this gate cannot see its subject`)
    .toBeGreaterThan(0);
  const rest = code.slice(at + 1);
  const end = rest.indexOf('\nfunction ');
  return end === -1 ? rest : rest.slice(0, end);
}

describe('a field group speaks after its boxes, never between them', () => {
  for (const g of GROUPS) {
    it(`${g.card}: nothing renders between ${g.first} and ${g.second} (${g.why})`, () => {
      const body = cardBody(g.card);
      const firstAt = body.indexOf(`label="${g.first}"`);
      expect(firstAt, `${g.card} has no field labelled ${g.first}`).toBeGreaterThan(0);
      const firstEnd = body.indexOf('</Field>', firstAt);
      expect(firstEnd, `${g.card}'s ${g.first} field never closes`).toBeGreaterThan(firstAt);
      const secondAt = body.indexOf(`label="${g.second}"`, firstEnd);
      expect(secondAt, `${g.card} has no field labelled ${g.second} after ${g.first}`)
        .toBeGreaterThan(firstEnd);
      const secondOpen = body.lastIndexOf('<Field', secondAt);
      const between = body.slice(firstEnd + '</Field>'.length, secondOpen);
      // THE ASSERTION. Not "no Hint" and not "no warning tone": NOTHING. A
      // paragraph of plain advice displaces the second box exactly as far as a
      // refusal does, and the seat's 120px was one block of prose.
      expect(
        between.trim(),
        `${g.card} renders something between ${g.first} and ${g.second}, `
        + `which moves ${g.second} under the hand aiming at it: ${between.trim().slice(0, 160)}`,
      ).toBe('');
    });

    it(`${g.card}: the ${g.first}/${g.second} messages render after the group`, () => {
      const body = cardBody(g.card);
      const secondAt = body.indexOf(`label="${g.second}"`,
        body.indexOf(`label="${g.first}"`));
      const secondEnd = body.indexOf('</Field>', secondAt);
      expect(secondEnd, `${g.card}'s ${g.second} field never closes`).toBeGreaterThan(secondAt);
      const after = body.slice(secondEnd + '</Field>'.length);
      const slot = after.indexOf('<GroupHints');
      expect(slot, `${g.card} has no GroupHints slot after ${g.second}`).toBeGreaterThanOrEqual(0);
      // Immediately after, with nothing rendered in front of it: a slot pushed
      // below the next control is a message about a box you can no longer see.
      expect(
        after.slice(0, slot).trim(),
        `${g.card} renders something between ${g.second} and its message slot`,
      ).toBe('');
      const call = after.slice(slot, slot + 260);
      expect(call, `${g.card}'s slot does not carry ${g.messages}`).toContain(g.messages);
      expect(call, `${g.card}'s slot is not at the warning tone`).toContain('tone="warning"');
    });
  }

  it('every group in the table was located, so a silent zero is not a pass', () => {
    // The rows above fail loudly on a missing card or label. This one pins that
    // the table is not empty and that each card named in it exists at all, so
    // deleting a card cannot quietly reduce this file to nothing.
    expect(GROUPS.length).toBe(6);
    for (const name of new Set(GROUPS.map((g) => g.card))) {
      expect(code, `no function ${name}( in the panel`).toContain(`function ${name}(`);
    }
  });

  it('the old shape is gone from the panel entirely', () => {
    // The exact spelling that shipped the defect: a per-field conditional Hint
    // for one member of a pair. Named so a revert reads as a revert.
    for (const gone of [
      '{edgeRefusal.top !== null &&',
      '{edgeRefusal.bot !== null &&',
      "{said('lines') !== null &&",
      "{said('step') !== null &&",
      "{said('target') !== null &&",
      "{said('channel') !== null &&",
      "{said('hi') !== null &&",
    ]) expect(code, `the pre-F4 per-field message is back: ${gone}`).not.toContain(gone);
  });
});

describe('GroupHints itself', () => {
  const layout = readFileSync(join(__dirname, '..', 'column-layout.tsx'), 'utf8');
  const fn = layout.slice(layout.indexOf('export function GroupHints'));

  it('renders nothing at all when the group has nothing to say', () => {
    // A slot that rendered an empty box would reserve height on every card in
    // the panel, which is the cost the design argument rejects.
    expect(fn.slice(0, 900)).toContain('if (live.length === 0) return null;');
  });

  it('drops nulls rather than making the caller filter at every site', () => {
    expect(fn.slice(0, 900)).toMatch(/messages\.filter\(/);
  });

  it('paints each live message as an under-column Hint at the given tone', () => {
    expect(fn.slice(0, 900)).toMatch(/<Hint key=\{m\} under tone=\{tone\}/);
  });
});
