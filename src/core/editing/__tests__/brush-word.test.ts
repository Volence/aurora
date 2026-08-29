import { describe, it, expect } from 'vitest';
import {
  brushNametableWord, brushAuthorsPriority, brushPriorityFromOptional, resolveBrushPriority,
  DEFAULT_BRUSH_ATTRIBUTES,
  type BrushAttributes,
} from '../brush-word';
import { packNametableWord, unpackNametableWord } from '../../model/s4-types';

// EVERY EXPECTATION HERE GOES THROUGH pack/unpack, never a literal word.
// A `0x8000` typed into this file would keep passing if the priority bit moved,
// which is precisely the copied-pin defect brush-word.ts exists to end.

const brush = (over: Partial<BrushAttributes> = {}): BrushAttributes =>
  ({ ...DEFAULT_BRUSH_ATTRIBUTES, ...over });

/** A destination whose attribute bits are all SET — the only kind of
 *  destination a preservation claim can be tested against. A cell of zeroes
 *  yields the same word preserved or truncated. */
const LOADED = packNametableWord(0x123, 2, true, true, true);
/** …and its opposite, so "always sets the bit" cannot pass as "preserves". */
const BARE = packNametableWord(0x123, 2, false, false, false);

describe('brushNametableWord — the destination is not a zero cell', () => {
  it('the fixtures really carry / really lack the bits (guards every claim below)', () => {
    const loaded = unpackNametableWord(LOADED);
    expect(loaded.priority).toBe(true);
    expect(loaded.hFlip).toBe(true);
    expect(loaded.vFlip).toBe(true);
    const bare = unpackNametableWord(BARE);
    expect(bare.priority).toBe(false);
    expect(bare.hFlip).toBe(false);
    expect(bare.vFlip).toBe(false);
  });
});

describe('brushNametableWord — priority', () => {
  it('"keep" preserves a SET priority bit (the reported data loss)', () => {
    const out = brushNametableWord(0x055, LOADED, brush());
    expect(unpackNametableWord(out).priority).toBe(true);
  });

  it('"keep" preserves a CLEAR priority bit — it does not invent one', () => {
    const out = brushNametableWord(0x055, BARE, brush());
    expect(unpackNametableWord(out).priority).toBe(false);
  });

  it('"on" sets it on a cell that had none', () => {
    const out = brushNametableWord(0x055, BARE, brush({ priority: 'on' }));
    expect(unpackNametableWord(out).priority).toBe(true);
  });

  it('"off" clears it on a cell that had it — the discriminator for "keep"', () => {
    const out = brushNametableWord(0x055, LOADED, brush({ priority: 'off' }));
    expect(unpackNametableWord(out).priority).toBe(false);
  });

  it('"on"/"off" ignore the destination entirely', () => {
    for (const dest of [LOADED, BARE, 0, 0xFFFF]) {
      expect(unpackNametableWord(brushNametableWord(1, dest, brush({ priority: 'on' }))).priority).toBe(true);
      expect(unpackNametableWord(brushNametableWord(1, dest, brush({ priority: 'off' }))).priority).toBe(false);
    }
  });

  it('a missing destination reads as "no priority", not as a crash', () => {
    expect(unpackNametableWord(brushNametableWord(1, undefined, brush())).priority).toBe(false);
  });
});

describe('brushNametableWord — the flips belong to the picture, not the cell', () => {
  it('an unflipped brush UN-flips a flipped destination (WYSIWYG with the picker)', () => {
    const out = brushNametableWord(0x055, LOADED, brush());
    const e = unpackNametableWord(out);
    expect(e.hFlip).toBe(false);
    expect(e.vFlip).toBe(false);
  });

  it('a flipped brush flips a bare destination', () => {
    const e = unpackNametableWord(brushNametableWord(0x055, BARE, brush({ hFlip: true, vFlip: true })));
    expect(e.hFlip).toBe(true);
    expect(e.vFlip).toBe(true);
  });

  it('the two flips are independent', () => {
    const h = unpackNametableWord(brushNametableWord(1, LOADED, brush({ hFlip: true })));
    expect([h.hFlip, h.vFlip]).toEqual([true, false]);
    const v = unpackNametableWord(brushNametableWord(1, LOADED, brush({ vFlip: true })));
    expect([v.hFlip, v.vFlip]).toEqual([false, true]);
  });
});

describe('brushNametableWord — the fields the brush always owned', () => {
  it('writes the armed tile index and palette line, whatever the destination held', () => {
    const e = unpackNametableWord(brushNametableWord(0x321, LOADED, brush({ paletteLine: 1 })));
    expect(e.tileIndex).toBe(0x321);
    expect(e.palette).toBe(1);
  });

  it('is exactly packNametableWord for every field — no private encoding', () => {
    const b = brush({ paletteLine: 3, hFlip: true, vFlip: false, priority: 'on' });
    expect(brushNametableWord(0x2ff, BARE, b))
      .toBe(packNametableWord(0x2ff, 3, true, false, true));
  });

  it('under "keep" it equals packNametableWord with the DESTINATION\'s priority', () => {
    for (const dest of [LOADED, BARE]) {
      const want = packNametableWord(0x2ff, 3, unpackNametableWord(dest).priority, false, true);
      expect(brushNametableWord(0x2ff, dest, brush({ paletteLine: 3, hFlip: true }))).toBe(want);
    }
  });
});

describe('brushNametableWord — the only field it may ever change is one the brush named', () => {
  // The property, stated as a property: with a "keep" brush that matches the
  // destination's picture, the word must come back BYTE-IDENTICAL. Anything the
  // function quietly rewrites shows up here without the test having to guess
  // which bit it was.
  it('a keep-brush repainting a cell with its own picture is a no-op', () => {
    for (const priority of [true, false]) {
      for (const hFlip of [true, false]) {
        for (const vFlip of [true, false]) {
          for (const palette of [0, 1, 2, 3]) {
            const dest = packNametableWord(0x1a4, palette, priority, vFlip, hFlip);
            const out = brushNametableWord(0x1a4, dest, brush({ paletteLine: palette, hFlip, vFlip }));
            expect(out).toBe(dest);
          }
        }
      }
    }
  });
});

describe('brushAuthorsPriority — the lens-surfacing condition', () => {
  it('is false only at the "keep" default', () => {
    expect(brushAuthorsPriority(brush())).toBe(false);
    expect(brushAuthorsPriority(brush({ priority: 'on' }))).toBe(true);
    expect(brushAuthorsPriority(brush({ priority: 'off' }))).toBe(true);
  });

  it('the shipped default does not author priority', () => {
    expect(DEFAULT_BRUSH_ATTRIBUTES.priority).toBe('keep');
    expect(brushAuthorsPriority(DEFAULT_BRUSH_ATTRIBUTES)).toBe(false);
  });
});

// ── the agent road (ROADMAP O12) ───────────────────────────────────────────
//
// `NametableEntrySpec.pri` is OPTIONAL on the wire, so it carries three states
// already — present-true, present-false, ABSENT — and `!!spec.pri` collapsed the
// third into the second. These rows pin the translation that un-collapses it.
describe('brushPriorityFromOptional — the agent\'s optional field is the tri-state', () => {
  it('an OMITTED pri is "keep" — the defect this closes', () => {
    expect(brushPriorityFromOptional(undefined)).toBe('keep');
  });

  it('an EXPLICIT true/false authors the bit', () => {
    expect(brushPriorityFromOptional(true)).toBe('on');
    expect(brushPriorityFromOptional(false)).toBe('off');
  });

  it('omitted is NOT the same as false — the whole point', () => {
    expect(brushPriorityFromOptional(undefined)).not.toBe(brushPriorityFromOptional(false));
  });

  it('it agrees with the human brush\'s default, so the two roads cannot drift', () => {
    expect(brushPriorityFromOptional(undefined)).toBe(DEFAULT_BRUSH_ATTRIBUTES.priority);
  });

  it('composed with brushNametableWord: an omitted pri preserves a SET bit', () => {
    const out = brushNametableWord(0x055, LOADED, brush({
      hFlip: false, vFlip: false, priority: brushPriorityFromOptional(undefined),
    }));
    expect(unpackNametableWord(out).priority).toBe(true);
    expect(unpackNametableWord(out).tileIndex).toBe(0x055);
  });

  it('composed: pri:false still CLEARS a set bit (an agent can author "off")', () => {
    const out = brushNametableWord(0x055, LOADED, brush({
      priority: brushPriorityFromOptional(false),
    }));
    expect(unpackNametableWord(out).priority).toBe(false);
  });

  it('composed: a CREATOR (no destination) gets "no priority" from an omitted pri', () => {
    const out = brushNametableWord(0x055, undefined, brush({
      priority: brushPriorityFromOptional(undefined),
    }));
    expect(unpackNametableWord(out).priority).toBe(false);
  });

  it('the FLIPS stay two-state on this road, and that is the rule, not an oversight', () => {
    // A spec naming a tile and no flip names an UNFLIPPED picture. The
    // destination's flips must not survive it — that is what makes paint
    // WYSIWYG. This row is the one that reddens if someone "fixes" the flips
    // to match priority.
    const out = brushNametableWord(0x055, LOADED, brush({ hFlip: false, vFlip: false }));
    expect(unpackNametableWord(LOADED).hFlip).toBe(true);
    expect(unpackNametableWord(LOADED).vFlip).toBe(true);
    expect(unpackNametableWord(out).hFlip).toBe(false);
    expect(unpackNametableWord(out).vFlip).toBe(false);
  });
});

// ── the shared resolver (O12's third decider) ──────────────────────────────
//
// The Art composer's tile stamp replaces a whole `ComposerCell` and never packs
// a word, so it cannot call `brushNametableWord`. It calls this instead. These
// rows exist so the two roads cannot come to disagree about what "keep" means.
describe('resolveBrushPriority — what "keep" means, said once for every road', () => {
  it('"keep" returns the destination, in both directions', () => {
    expect(resolveBrushPriority('keep', true)).toBe(true);
    expect(resolveBrushPriority('keep', false)).toBe(false);
  });

  it('"on"/"off" ignore the destination', () => {
    for (const dest of [true, false]) {
      expect(resolveBrushPriority('on', dest)).toBe(true);
      expect(resolveBrushPriority('off', dest)).toBe(false);
    }
  });

  it('brushNametableWord agrees with it for every state and destination', () => {
    // The two roads, compared directly. If brushNametableWord ever stops
    // routing through the resolver, this is what says so.
    for (const priority of ['keep', 'on', 'off'] as const) {
      for (const dest of [LOADED, BARE]) {
        const out = brushNametableWord(0x11, dest, brush({ priority }));
        expect(unpackNametableWord(out).priority)
          .toBe(resolveBrushPriority(priority, unpackNametableWord(dest).priority));
      }
    }
  });
});
