// WHICH THING THE FLIP KEY MIRRORS, AND WHICH KEYS THEY ARE.
//
// `MapViewport`'s keydown branch is inside a React effect the node suite cannot
// reach, so the DECISION is a pure function (the shape `resolveEscape` took)
// and the effect only acts on its verdict.
//
// Two contracts are pinned here and they are different in kind:
//
//   • THE LETTERS, against the tables that already own letters. `x` and `y` are
//     free across the WHOLE tool vocabulary, not merely within a facet, and
//     that is asserted against `TOOL_KEYS` rather than eyeballed — the same bar
//     `facet-tools.test.ts` holds tool letters to. `h`/`v` were the other
//     mnemonic pair and `v` is the View tool's; a row proves that, so the next
//     reader does not "improve" the binding back into a collision.
//   • THE TARGET, including the deliberate ASYMMETRY with Ctrl+C: copy works
//     from any tool, flip-in-place does not. A copy is non-destructive and a
//     stale marquee costs nothing; a flip REWRITES THE MAP.

import { describe, it, expect } from 'vitest';
import { flipAxisForKey, resolveFlip } from '../map-flip';
import { TOOL_KEYS, TOOL_IDS, toolForKey } from '../../workspace/tool-meta';

const CLIP = { widthTiles: 2 } as never;
const MARQUEE = { sectionIndex: 0, col: 0, row: 0, w: 2, h: 2 } as never;

describe('flipAxisForKey', () => {
  it('X is the horizontal mirror and Y the vertical — the engine\'s own vocabulary '
    + '(collision-cell-word.ts names bit 10 xFlip, "mirror horizontally")', () => {
    expect(flipAxisForKey('x')).toBe('h');
    expect(flipAxisForKey('y')).toBe('v');
  });

  it('case-folds, so Caps Lock still asks for the same thing', () => {
    expect(flipAxisForKey('X')).toBe('h');
    expect(flipAxisForKey('Y')).toBe('v');
  });

  it('names no flip for anything else', () => {
    for (const k of ['h', 'v', 'f', 'm', 's', 'Escape', 'ArrowLeft', '0', '']) {
      expect(flipAxisForKey(k)).toBe(null);
    }
  });

  it('THE COLLISION CHECK: neither letter is any tool\'s, across the WHOLE '
    + 'vocabulary — a tool moving between facets can never start shadowing it', () => {
    for (const key of ['x', 'y']) {
      expect(toolForKey(key)).toBe(null);
      expect(Object.values(TOOL_KEYS)).not.toContain(key);
    }
    // ANTI-VACUOUS: the table this is checked against is not empty, and the row
    // can fail — `v` IS taken, which is exactly why H/V was not available.
    expect(TOOL_IDS.length).toBeGreaterThan(5);
    expect(toolForKey('v')).toBe('view');
  });
});

describe('resolveFlip', () => {
  it('paste mode mirrors the CLIPBOARD, whatever tool is armed — paste is a mode '
    + 'the author entered and the ghost under the cursor is what he is looking at', () => {
    for (const tool of ['marquee', 'paint-tile', 'view', 'select']) {
      expect(resolveFlip({ pasting: true, mapClipboard: CLIP, tool, marquee: null }))
        .toBe('clipboard');
    }
  });

  it('...and mirrors nothing when paste mode is somehow armed with an empty clipboard', () => {
    expect(resolveFlip({ pasting: true, mapClipboard: null, tool: 'marquee', marquee: MARQUEE }))
      .toBe(null);
  });

  it('a committed marquee under the MARQUEE TOOL mirrors the selection in place', () => {
    expect(resolveFlip({ pasting: false, mapClipboard: null, tool: 'marquee', marquee: MARQUEE }))
      .toBe('selection');
  });

  it('THE DELIBERATE ASYMMETRY WITH Ctrl+C: a marquee left standing under another '
    + 'tool does NOT flip. Copy is non-destructive so it works from any tool; a '
    + 'flip rewrites the map, and `s` (save-as-chunk) already draws the line here', () => {
    for (const tool of ['paint-tile', 'paint-block', 'select', 'view', 'stamp-chunk']) {
      expect(resolveFlip({ pasting: false, mapClipboard: CLIP, tool, marquee: MARQUEE }))
        .toBe(null);
    }
  });

  it('nothing selected, not pasting — the key falls through', () => {
    expect(resolveFlip({ pasting: false, mapClipboard: CLIP, tool: 'marquee', marquee: null }))
      .toBe(null);
  });

  it('paste mode WINS over a standing marquee, matching resolveEscape\'s order', () => {
    expect(resolveFlip({ pasting: true, mapClipboard: CLIP, tool: 'marquee', marquee: MARQUEE }))
      .toBe('clipboard');
  });
});
