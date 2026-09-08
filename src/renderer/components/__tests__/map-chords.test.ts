// WHICH MAP SHORTCUT A KEY EVENT IS, AND WHAT A MODIFIED KEY IS NOT.
//
// Ctrl+Delete and Alt+Backspace destroyed the selected object. The branch that
// runs `delete-object` tested no modifier at all, and the hoisted guard that
// exists to stop modified keys sat 54 lines BELOW it, with a comment claiming it
// covered all of them (lens sweep, DELETE-ABOVE-MODIFIER-GUARD). Alt+S opened a
// document and switched facet the same way, and F7 warped the running game on
// any modifier at all.
//
// `MapViewport`'s keydown handler is inside a React effect the node suite cannot
// reach, so the DECISION is a pure function (map-chords.ts) and the handler only
// acts on its verdict. That is the map-escape.ts precedent, and its test file
// beside this one states the rule.
//
// THE SECOND HALF OF THIS FILE IS A SOURCE SCAN, because a pure chord table is
// worth nothing if the handler still asks the event itself. It reads the
// comment-stripped `.tsx` (the panel-headings.test.ts / panel-scrollers.test.ts
// precedent, sharing their one reader) and asserts that above the hoisted guard
// NOTHING reads a key name or a modifier bit except `resolveMapChord`. A grep
// for prose would pass on the docblock alone, which is why the reader strips
// comments and why the anchors below throw rather than skip when they move.

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { resolveMapChord } from '../map-chords';
// The repo's one comment-stripping source reader. Its file is named for its
// first consumer (the panel rules); a second copy of `stripComments` is exactly
// the drift these scans exist to catch.
import { code, COMPONENTS } from './helpers/section-panels';

const NO_MODS = { ctrlKey: false, metaKey: false, altKey: false };
const chord = (key: string, mods: Partial<typeof NO_MODS> = {}) =>
  resolveMapChord({ key, ...NO_MODS, ...mods });

describe('resolveMapChord: the destructive key', () => {
  it('deletes on a bare Delete or Backspace', () => {
    expect(chord('Delete')).toBe('delete');
    expect(chord('Backspace')).toBe('delete');
  });

  it('refuses Ctrl+Delete, Cmd+Delete, Alt+Delete and Alt+Backspace', () => {
    expect(chord('Delete', { ctrlKey: true })).toBe(null);
    expect(chord('Delete', { metaKey: true })).toBe(null);
    expect(chord('Delete', { altKey: true })).toBe(null);
    expect(chord('Backspace', { ctrlKey: true })).toBe(null);
    expect(chord('Backspace', { altKey: true })).toBe(null);
  });

  it('still deletes with Shift held: Shift is not judged, and the hoisted guard never judged it', () => {
    expect(chord('Delete', { })).toBe('delete');
    expect(resolveMapChord({ key: 'Delete', ctrlKey: false, metaKey: false, altKey: false })).toBe('delete');
  });
});

describe('resolveMapChord: the other four dispatches', () => {
  it('copies and pastes on Ctrl or Cmd, and refuses when Alt is held too', () => {
    expect(chord('c', { ctrlKey: true })).toBe('copy');
    expect(chord('C', { metaKey: true })).toBe('copy');
    expect(chord('v', { ctrlKey: true })).toBe('paste');
    expect(chord('V', { metaKey: true })).toBe('paste');
    expect(chord('c', { ctrlKey: true, altKey: true })).toBe(null);
    expect(chord('v', { metaKey: true, altKey: true })).toBe(null);
  });

  it('does not copy or paste unmodified: those two letters mean nothing on their own', () => {
    expect(chord('c')).toBe(null);
    expect(chord('v')).toBe(null);
  });

  it('saves the marquee as a chunk on a bare s, and on no chord that carries a modifier', () => {
    expect(chord('s')).toBe('save-chunk');
    expect(chord('S')).toBe('save-chunk');
    expect(chord('s', { ctrlKey: true })).toBe(null);
    expect(chord('s', { metaKey: true })).toBe(null);
    expect(chord('s', { altKey: true })).toBe(null);
  });

  it('warps on a bare F7 only', () => {
    expect(chord('F7')).toBe('warp');
    expect(chord('F7', { ctrlKey: true })).toBe(null);
    expect(chord('F7', { altKey: true })).toBe(null);
    expect(chord('F7', { metaKey: true })).toBe(null);
  });

  it('answers null for a key this surface does not bind, modified or not', () => {
    expect(chord('b')).toBe(null);
    expect(chord('b', { ctrlKey: true })).toBe(null);
    expect(chord('k', { ctrlKey: true })).toBe(null);
    expect(chord('Escape')).toBe(null);
    expect(chord('ArrowLeft')).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// THE WIRING: does the handler actually ask?
// ---------------------------------------------------------------------------

const MAP_VIEWPORT = join(COMPONENTS, 'MapViewport.tsx');
/** The map's own window keydown handler, comment-stripped. */
const HANDLER_ANCHOR = 'const handler = (e: KeyboardEvent) => {';
/** The guard whose comment claims every modified key, hoisted above the tools. */
const HOISTED_GUARD = 'if (e.ctrlKey || e.metaKey || e.altKey) return;';

/** Source between the handler's first line and the hoisted guard, or a throw. */
function aboveTheGuard(): string {
  const src = code(MAP_VIEWPORT);
  // A stripper that lost its way (a regex literal carrying a quote, say) would
  // silently shrink this region to nothing and make every rule below vacuous.
  if (!src.includes('export default function MapViewport()')) {
    throw new Error('map-chords scan: MapViewport.tsx did not read back as source. '
      + 'The comment stripper or the path is wrong, so nothing below measured anything.');
  }
  const start = src.indexOf(HANDLER_ANCHOR);
  const guard = src.indexOf(HOISTED_GUARD);
  if (start < 0 || guard < 0 || guard <= start) {
    throw new Error('map-chords scan: could not find the keydown handler and its hoisted '
      + `modifier guard in MapViewport.tsx (handler at ${start}, guard at ${guard}). `
      + 'Re-anchor this scan on the code that replaced them; do not delete the rule.');
  }
  return src.slice(start, guard);
}

describe('MapViewport asks map-chords, and asks nothing else', () => {
  it('routes all five dispatching branches through the chord', () => {
    const region = aboveTheGuard();
    expect(region).toContain('const chord = resolveMapChord(e);');
    for (const name of ['copy', 'paste', 'save-chunk', 'warp', 'delete']) {
      expect(region, `the ${name} branch must test the chord`).toContain(`chord === '${name}'`);
    }
  });

  it('reads no key name and no modifier bit of its own above the guard', () => {
    const region = aboveTheGuard();
    // `e.target` (the typing filter) and `e.preventDefault()` are the only other
    // things a branch up here may touch on the event. A key name or a modifier
    // bit is a SECOND policy, which is the defect: five of them, one guard, and
    // the destructive branch was the one with no policy at all.
    for (const read of ['e.key', 'e.ctrlKey', 'e.metaKey', 'e.altKey', 'e.shiftKey']) {
      expect(region, `${read} above the hoisted guard is a second modifier policy`)
        .not.toContain(read);
    }
  });

  it('leaves the hoisted guard standing for everything that dispatches below it', () => {
    const src = code(MAP_VIEWPORT);
    expect(src.split(HOISTED_GUARD).length - 1,
      'exactly one hoisted modifier guard, in the map keydown handler').toBe(1);
    // The tool letters, the flip keys and the arrows all still live under it.
    expect(src.indexOf('toolForKey(e.key)')).toBeGreaterThan(src.indexOf(HOISTED_GUARD));
    expect(src.indexOf('flipAxisForKey(e.key)')).toBeGreaterThan(src.indexOf(HOISTED_GUARD));
  });
});
