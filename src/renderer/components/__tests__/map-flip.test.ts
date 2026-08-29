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

// ═══════════════════════ THE ACTION, AND THE TWO SURFACES ═══════════════════
//
// Row 84's follow-on: the owner asked for BUTTONS as well as the keys — *"I
// think a button on the right panel would be nice too"*. Two surfaces asking
// for one gesture is the drift risk `map-flip.ts` was created to close, so
// `performMapFlip` is the whole action (resolve, transform, batch the undo
// entry, say what happened, repaint the ghost) and neither surface holds a
// copy of any of it.
//
// ⚠ WHAT THESE ROWS CANNOT SEE, AND WHERE IT IS PROVEN INSTEAD. The selection
// branch writes through `executeCommand` into a live project, and the ghost is
// a canvas. Both are driven for real by
// `scratchpad/marquee-flip-button-harness.mjs`, which CLICKS THE DOM BUTTON.
// These rows own the parts a node suite can actually hold: the target verdict,
// the clipboard transform, and the fact that the ghost repaint is not silently
// skipped.

import { performMapFlip, setFlipGhostRepaint } from '../map-flip';
import { flipClipboard } from '../../../core/editing/region-flip';
import { useEditorStore } from '../../state/editorStore';
import type { MapClipboard } from '../../../core/editing/map-clipboard';
import { readFileSync } from 'node:fs';

/** A 2x2-tile clipboard that is asymmetric in BOTH axes, so a no-op transform
 *  and a wrong-axis transform are both visible. The values are arbitrary word
 *  bits; every row compares against `flipClipboard`'s own output, which
 *  region-flip.test.ts pins against the two word codecs. */
function clip(): MapClipboard {
  return {
    widthTiles: 2, heightTiles: 2,
    nametable: new Uint16Array([1, 2, 3, 4]),
    collisionA: new Uint16Array([9]),
    collisionB: new Uint16Array([0]),
    artOnly: false,
  };
}

function resetEditor(): void {
  const ed = useEditorStore.getState();
  ed.setMapClipboard(null);
  ed.setMarquee(null);
  ed.setPasting(false);
  setFlipGhostRepaint(null);
}

describe('performMapFlip — one action, both surfaces', () => {
  // THE BUTTON'S DISABLED RULE IS THE KEY'S NO-OP RULE. The panel disables on
  // `resolveFlip(...) === null`; if the action did anything in a state
  // `resolveFlip` calls ineligible, the panel would be teaching a rule the map
  // does not keep. Asserted as an equivalence over a state matrix rather than
  // as two separate claims about two functions.
  it('does nothing in exactly the states resolveFlip calls ineligible', () => {
    const cases = [
      { pasting: false, mapClipboard: null, tool: 'marquee', marquee: null },
      { pasting: false, mapClipboard: CLIP, tool: 'paint-tile', marquee: MARQUEE },
      { pasting: true, mapClipboard: null, tool: 'marquee', marquee: MARQUEE },
    ];
    for (const c of cases) {
      expect(resolveFlip(c as never)).toBe(null);
      resetEditor();
      const ed = useEditorStore.getState();
      ed.setPasting(c.pasting);
      ed.setMapClipboard(c.mapClipboard as MapClipboard | null);
      ed.setMarquee(c.marquee as never);
      const before = useEditorStore.getState().mapClipboard;
      const out = performMapFlip('h');
      expect(out.kind).toBe('none');
      // ...and it is inert, not merely quiet.
      expect(useEditorStore.getState().mapClipboard).toBe(before);
    }
    resetEditor();
  });

  it('mirrors the PENDING PASTE through region-flip, as a new object', () => {
    resetEditor();
    const c0 = clip();
    const ed = useEditorStore.getState();
    ed.setMapClipboard(c0);
    ed.setPasting(true);

    const out = performMapFlip('h');
    expect(out.kind).toBe('clipboard');
    const after = useEditorStore.getState().mapClipboard!;
    // Expectation DERIVED from the shared transform, not transcribed: whatever
    // region-flip does, this path must do exactly that and nothing else.
    expect([...after.nametable]).toEqual([...flipClipboard(c0, 'h').nametable]);
    // A NEW object — the ghost's raster cache is keyed on identity, so an
    // in-place mutation would mirror the model and leave the picture.
    expect(after).not.toBe(c0);
    // ...and the row is not vacuous: this fixture is genuinely asymmetric.
    expect([...after.nametable]).not.toEqual([...c0.nametable]);
    resetEditor();
  });

  it('mirrors on the AXIS asked for — h and v are different transforms here', () => {
    resetEditor();
    const c0 = clip();
    const ed = useEditorStore.getState();
    ed.setPasting(true);

    ed.setMapClipboard(c0);
    performMapFlip('h');
    const h = [...useEditorStore.getState().mapClipboard!.nametable];
    ed.setMapClipboard(c0);
    performMapFlip('v');
    const v = [...useEditorStore.getState().mapClipboard!.nametable];
    expect(h).not.toEqual(v);
    expect(h).toEqual([...flipClipboard(c0, 'h').nametable]);
    expect(v).toEqual([...flipClipboard(c0, 'v').nametable]);
    resetEditor();
  });

  // ⚠ THE GHOST. `mapClipboard` is not a redraw dependency and the ghost lives
  // on MapViewport's preview overlay, so a flip that skips this repaint mirrors
  // the model and leaves the OLD art under the cursor — which then pastes. The
  // KEY path always had the repaint inline; the BUTTON cannot reach that
  // canvas, which is why the callback is registered rather than passed.
  it('repaints the paste ghost, and REPORTS it when there is nothing to repaint with', () => {
    resetEditor();
    const ed = useEditorStore.getState();
    ed.setMapClipboard(clip());
    ed.setPasting(true);

    let calls = 0;
    setFlipGhostRepaint(() => { calls++; });
    const withGhost = performMapFlip('h');
    expect(calls).toBe(1);
    expect(withGhost.kind === 'clipboard' && withGhost.ghostRepainted).toBe(true);

    // Unregistered (MapViewport unmounted): the flip still happens, and the
    // absence is an ANSWER rather than a silence.
    setFlipGhostRepaint(null);
    const noGhost = performMapFlip('h');
    expect(calls).toBe(1);
    expect(noGhost.kind === 'clipboard' && noGhost.ghostRepainted).toBe(false);
    resetEditor();
  });

  // A selection flip with no project loaded must not throw its way out of a
  // click handler — the panel can be mounted before an act is open.
  it('is inert when the marquee names a section no open project has', () => {
    resetEditor();
    const ed = useEditorStore.getState();
    ed.setTool('marquee');
    ed.setMarquee({ sectionIndex: 0, col: 0, row: 0, w: 2, h: 2 } as never);
    expect(resolveFlip(useEditorStore.getState() as never)).toBe('selection');
    expect(performMapFlip('h').kind).toBe('none');
    resetEditor();
  });
});

// ═══ ONE PATH, ENFORCED ON THE SOURCE ═══
//
// The rows above prove `performMapFlip` is correct. They cannot prove a CALL
// SITE uses it — a button that reached for `flipClipboard` directly would leave
// every row above green while shipping a second source of truth, which is the
// exact thing this module exists to prevent. So the two surfaces are read as
// text. Weak evidence standing alone, which is why the harness clicks the real
// button and compares the real pixels; this row is the cheap tripwire beside it.
describe('the flip has ONE implementation, and both surfaces take it', () => {
  const SURFACES = [
    'src/renderer/components/MapViewport.tsx',
    'src/renderer/components/MarqueePasteOptions.tsx',
  ];
  it('neither the map nor the panel reaches for the transform itself', () => {
    for (const f of SURFACES) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} must call the shared action`).toContain('performMapFlip');
      for (const forbidden of ['flipClipboard', 'flipSectionRegion']) {
        expect(src.includes(forbidden), `${f} must not call ${forbidden} directly`).toBe(false);
      }
    }
  });
});
