// THE COMMAND PALETTE IS REACHABLE BY SOMEBODY WHO DOES NOT KNOW IT EXISTS.
//
// UX seat B, F6: Ctrl+P did nothing, Ctrl+Shift+P did nothing, Ctrl+K opened
// the palette, and no menu, button, badge or hint on any screen they walked
// names it. The seat then disclosed the part that decides what this file has to
// hold: their three presses are a FLOOR, not a measurement. They only knew a
// palette existed because they had read `shell/commands.ts` while checking
// something else. A reader without that prior presses nothing, and the cost is
// not two keystrokes but never finding the feature.
//
// So there are two properties here and only one of them is about a chord:
//
//   1. THE CHORD. Ctrl+Shift+P now opens it too, and Ctrl+K is untouched
//      because people may already use it. Executed, in `paletteKeyAction`.
//   2. THE AFFORDANCE. Something on screen names the palette, in both explorer
//      states, without a hover and without a prior. Read from the Explorer's
//      source, because the node suite cannot see React.
//
// ⚠ WHAT IS EXECUTED AND WHAT IS READ, said out loud so the green is not read
// as more than it is. Rows 1 to 3 CALL the decision and the store and assert
// what they return: those are executed. Row 4 reads `Explorer.tsx` as text and
// asserts the affordance is mounted in both branches from the shared
// constants. That proves the element is in the render and that its words come
// from the same place the keyboard rule does. IT IS NOT A PROOF THAT A PIXEL
// APPEARED, that the row is legible, or that it is not clipped. Nothing in this
// repo's node suite can prove those; the foreground sweep is where they land.

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  paletteKeyAction, PALETTE_SHORTCUTS, PALETTE_PRIMARY_SHORTCUT,
  PALETTE_AFFORDANCE_TITLE, PALETTE_AFFORDANCE_LABEL,
  type PaletteChordEvent,
} from '../command-palette-chord';
import { useCommandPaletteStore, openCommandPalette } from '../../state/commandPaletteStore';
import { useModalStore } from '../../state/modalStore';

/** A keystroke, spelled the way a `KeyboardEvent` spells one. */
function press(key: string, mods: Partial<PaletteChordEvent> = {}): PaletteChordEvent {
  return { key, ctrlKey: false, metaKey: false, shiftKey: false, ...mods };
}

/**
 * Turn an ADVERTISED label into the keystroke it advertises.
 *
 * This is what makes row 3 a census rather than a restatement: the expectation
 * comes from `PALETTE_SHORTCUTS`, the same array the tooltip is built from, so
 * adding a shortcut to the label without binding it fails here. A hand-written
 * list of events would pass happily while the tooltip lied.
 */
function chordFromLabel(label: string): PaletteChordEvent {
  const parts = label.split('+');
  const key = parts[parts.length - 1];
  return {
    key: parts.includes('Shift') ? key.toUpperCase() : key.toLowerCase(),
    ctrlKey: parts.includes('Ctrl'),
    metaKey: parts.includes('Cmd'),
    shiftKey: parts.includes('Shift'),
  };
}

describe('the chords the palette answers', () => {
  it('Ctrl+K still toggles it, which is the binding this parcel must not move', () => {
    // The seat's own note: people may already use it, so removing or moving it
    // is out of scope. Both spellings, because a shift held over the key
    // arrives as the capital.
    expect(paletteKeyAction(press('k', { ctrlKey: true }), false, false)).toBe('toggle');
    expect(paletteKeyAction(press('K', { ctrlKey: true, shiftKey: true }), false, false)).toBe('toggle');
    expect(paletteKeyAction(press('k', { metaKey: true }), false, false)).toBe('toggle');
    // Toggle means toggle: an open palette closes on the same chord.
    expect(paletteKeyAction(press('k', { ctrlKey: true }), true, false)).toBe('toggle');
  });

  it('Ctrl+Shift+P opens it, which is the press the seat made that did nothing', () => {
    expect(paletteKeyAction(press('P', { ctrlKey: true, shiftKey: true }), false, false)).toBe('toggle');
    expect(paletteKeyAction(press('p', { ctrlKey: true, shiftKey: true }), false, false)).toBe('toggle');
    expect(paletteKeyAction(press('P', { metaKey: true, shiftKey: true }), false, false)).toBe('toggle');
  });

  it('Ctrl+P is left unbound, and that is a decision rather than an omission', () => {
    // In every editor this convention comes from, Ctrl+P is QUICK OPEN A FILE,
    // a different control with a different result set, and in a Chromium
    // renderer it is also the print chord. The reason is in
    // command-palette-chord.ts; this row is what stops a later edit from
    // quietly adding it and calling it a fix.
    expect(paletteKeyAction(press('p', { ctrlKey: true }), false, false)).toBe(null);
    expect(paletteKeyAction(press('P', { ctrlKey: true }), false, false)).toBe(null);
  });

  it('an unmodified key is not ours', () => {
    expect(paletteKeyAction(press('k'), false, false)).toBe(null);
    expect(paletteKeyAction(press('P', { shiftKey: true }), false, false)).toBe(null);
    expect(paletteKeyAction(press('a', { ctrlKey: true }), false, false)).toBe(null);
  });

  it('Escape closes an open palette and is not ours when it is shut', () => {
    expect(paletteKeyAction(press('Escape'), true, false)).toBe('close');
    expect(paletteKeyAction(press('Escape'), false, false)).toBe(null);
  });

  it('a dialog blocks the OPEN and not the close, which is the asymmetry that shipped', () => {
    // The palette renders below the dialogs. Opening it over one focuses an
    // invisible search field, which is the defect the guard exists for. An
    // ALREADY OPEN palette still answers, or Escape would strand it.
    expect(paletteKeyAction(press('k', { ctrlKey: true }), false, true)).toBe(null);
    expect(paletteKeyAction(press('P', { ctrlKey: true, shiftKey: true }), false, true)).toBe(null);
    expect(paletteKeyAction(press('k', { ctrlKey: true }), true, true)).toBe('toggle');
    expect(paletteKeyAction(press('Escape'), true, true)).toBe('close');
  });

  it('every shortcut the tooltip advertises actually fires', () => {
    // THE CENSUS, and the one row here that could not be satisfied by a
    // restatement: the labels come from the array the tooltip is built from,
    // and each is turned back into a keystroke and offered to the decision. A
    // label with no binding behind it fails here.
    expect(PALETTE_SHORTCUTS.length).toBeGreaterThan(1);
    for (const label of PALETTE_SHORTCUTS) {
      expect(
        paletteKeyAction(chordFromLabel(label), false, false),
        `the affordance advertises ${label} and nothing answers it`,
      ).toBe('toggle');
      expect(PALETTE_AFFORDANCE_TITLE).toContain(label);
    }
    expect(PALETTE_SHORTCUTS).toContain(PALETTE_PRIMARY_SHORTCUT);
  });
});

describe('something that is not the keyboard can open it', () => {
  beforeEach(() => {
    useCommandPaletteStore.setState({ open: false });
    useModalStore.setState({ open: [] });
  });

  it('the open state is a store, so a button can write it', () => {
    // This is the whole mechanical half of F6. While `open` was private to
    // CommandPalette's useState, a chord was the only writer that existed, and
    // no affordance anywhere could have opened it however well it was labelled.
    expect(useCommandPaletteStore.getState().open).toBe(false);
    expect(openCommandPalette()).toBe(true);
    expect(useCommandPaletteStore.getState().open).toBe(true);
  });

  it('the button path carries the same dialog guard the chord does', () => {
    // A guard that lives only in the keyboard path is a guard the next caller
    // walks straight past.
    useModalStore.getState().push('confirm');
    expect(openCommandPalette()).toBe(false);
    expect(useCommandPaletteStore.getState().open).toBe(false);
    useModalStore.getState().pop('confirm');
    expect(openCommandPalette()).toBe(true);
  });
});

describe('the affordance is mounted in both explorer states', () => {
  const explorer = readFileSync(
    join(__dirname, '..', 'Explorer.tsx'), 'utf8');
  /** Source with comments stripped: a mention in prose is not a mount. */
  const code = explorer
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

  it('the collapsed rail carries it, because 44px is where a chord is most wanted', () => {
    // The rail is the `if (collapsed)` branch and it returns before the
    // full-width tree exists, so the labelled row below cannot serve it.
    const rail = code.slice(code.indexOf('styles.rail'), code.indexOf('return (\n    <div style={styles.root}>'));
    expect(rail, 'no rail branch found in Explorer.tsx').not.toBe('');
    expect(rail).toContain('openCommandPalette()');
    expect(rail).toContain('PALETTE_AFFORDANCE_TITLE');
  });

  it('the open explorer carries a row that NAMES it without a hover', () => {
    // The finding is a reader who does not know the feature exists. A tooltip
    // answers "what does this button do"; it never answers "does this app have
    // a command palette". So the open state gets words, in the render, and this
    // row asserts the label and the shortcut are both painted rather than
    // hidden on a `title=`.
    const root = code.slice(code.indexOf('return (\n    <div style={styles.root}>'));
    expect(root).toContain('{PALETTE_AFFORDANCE_LABEL}');
    expect(root).toContain('{PALETTE_PRIMARY_SHORTCUT}');
    expect(root).toContain('openCommandPalette()');
    // Not a second search box: a button, not an input. The element opening the
    // tag that carries `styles.paletteRow` is what decides that, so the row
    // reads BACK from the style to the nearest tag before it rather than
    // pattern-matching across an attribute list that contains `=>`.
    const styled = root.indexOf('styles.paletteRow');
    expect(styled, 'nothing in the open explorer uses styles.paletteRow').toBeGreaterThan(0);
    const tag = root.lastIndexOf('<', styled);
    expect(root.slice(tag, tag + 20)).toContain('<button');
  });

  it('the words come from the shared constants, not retyped beside them', () => {
    // A label typed a second time into a `title=` is how "the tooltip says
    // Ctrl+K and the app answers Ctrl+J" happens, with nothing to catch it.
    expect(code).not.toMatch(/title="Run a command/);
    expect(PALETTE_AFFORDANCE_LABEL).toBe('Run a command');
    expect(PALETTE_AFFORDANCE_TITLE.startsWith(PALETTE_AFFORDANCE_LABEL)).toBe(true);
  });

  it('the palette component no longer owns the open state privately', () => {
    const panel = readFileSync(
      join(__dirname, '..', '..', 'components', 'CommandPalette.tsx'), 'utf8');
    expect(panel).toContain('useCommandPaletteStore');
    expect(panel).toContain('paletteKeyAction');
    // The exact declaration that made the chord the only door.
    expect(panel).not.toMatch(/useState\(false\)/);
  });
});
