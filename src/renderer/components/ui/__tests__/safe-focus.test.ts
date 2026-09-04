// The CHOICE half of d-31, pinned. See `ui/safe-focus.ts`'s header for the
// measurement behind it (plant P3: `autoFocus` on the danger button made a bare
// Space destroy a sprite and reset the dirty flag).
//
// ⚠ WHAT THIS FILE CANNOT SEE. No React, no DOM, no focus. It proves WHICH
// button is chosen; it cannot prove that `ConfirmDialog` calls .focus() on it,
// that the button is on screen, or that a real Space then answers 'cancel'.
// `src/renderer/shell/__tests__/confirm-dialog-focus.test.ts` reads the dialog's
// source for the wiring, and `scratchpad/confirm-focus-harness.mjs` reads
// `document.activeElement` in the real app under CDP. A green here with that
// harness never run is not a proof.

import { describe, it, expect } from 'vitest';
import { safeFocusIndex, isDestructiveButton, SAFE_CONFIRM_KEY } from '../safe-focus';

describe('safeFocusIndex picks the safe button', () => {
  it('finds the reserved cancel key wherever it sits', () => {
    // Last, which is where all eight of today's call sites put it...
    expect(safeFocusIndex([
      { key: 'discard', tone: 'danger' },
      { key: 'cancel' },
    ])).toBe(1);
    // ...and first, which none of them do, so that a `length - 1` rewrite —
    // correct at every real site today — is caught by this row rather than by a
    // user losing work.
    expect(safeFocusIndex([
      { key: 'cancel' },
      { key: 'discard', tone: 'danger' },
    ])).toBe(0);
    // And in the middle of the three-button shape (save / discard / cancel).
    expect(safeFocusIndex([
      { key: 'save', tone: 'primary' },
      { key: 'cancel' },
      { key: 'discard', tone: 'danger' },
    ])).toBe(1);
  });

  it('never returns the index of a destructive button', () => {
    const cases: { key: string; tone?: 'primary' | 'danger' }[][] = [
      [{ key: 'discard', tone: 'danger' }, { key: 'cancel' }],
      [{ key: 'save', tone: 'primary' }, { key: 'discard', tone: 'danger' }, { key: 'cancel' }],
      [{ key: 'clear', tone: 'danger' }, { key: 'cancel' }],
      [{ key: 'a', tone: 'danger' }, { key: 'b', tone: 'danger' }, { key: 'c' }],
      [{ key: 'only-safe' }],
    ];
    for (const buttons of cases) {
      const i = safeFocusIndex(buttons);
      expect(i).not.toBeNull();
      expect(isDestructiveButton(buttons[i as number])).toBe(false);
    }
  });

  it('focuses NOTHING rather than a destructive button when every option destroys', () => {
    // The `?? 0` / `?? length - 1` rewrite is what this row exists to kill: it
    // would arm Space with a destructive button here, which is the P3 defect
    // arriving through a different door.
    expect(safeFocusIndex([{ key: 'discard', tone: 'danger' }])).toBeNull();
    expect(safeFocusIndex([
      { key: 'discard', tone: 'danger' },
      { key: 'clear', tone: 'danger' },
    ])).toBeNull();
    expect(safeFocusIndex([])).toBeNull();
  });

  it('refuses a cancel key that is itself toned destructive, and falls through', () => {
    // Nobody writes this today. It matters because the rule is derived from
    // TONE, not from the key's name — so a site that ever marks its cancel
    // dangerous does not get it focused just because of what it is called.
    expect(safeFocusIndex([
      { key: 'cancel', tone: 'danger' },
      { key: 'stay', tone: 'primary' },
    ])).toBe(1);
    expect(safeFocusIndex([{ key: 'cancel', tone: 'danger' }])).toBeNull();
  });

  it('prefers cancel over another merely-safe button', () => {
    // 'save' is not destructive, but it is not the no-op either: a stray Space
    // that saves is a surprise, where a stray Space that cancels is not.
    expect(safeFocusIndex([
      { key: 'save', tone: 'primary' },
      { key: 'cancel' },
    ])).toBe(1);
  });
});

describe('isDestructiveButton is the component’s own notion, not a label', () => {
  it('is exactly tone === danger', () => {
    expect(isDestructiveButton({ key: 'x', tone: 'danger' })).toBe(true);
    expect(isDestructiveButton({ key: 'x', tone: 'primary' })).toBe(false);
    expect(isDestructiveButton({ key: 'x' })).toBe(false);
    // The keys real call sites use for destructive answers are NOT the test:
    // 'discard' with no tone is not destructive to this function, and that is
    // deliberate — the tone is what `ConfirmDialog` renders and what the DOM
    // guard reads back, so all three read the same property.
    expect(isDestructiveButton({ key: 'discard' })).toBe(false);
  });
});

describe('SAFE_CONFIRM_KEY matches the store’s reserved key', () => {
  it("is 'cancel'", () => {
    // confirmStore.ts returns this for Esc, the backdrop and a superseded
    // request. If they ever diverge, the dialog would focus a button that is
    // not the one Esc answers with.
    expect(SAFE_CONFIRM_KEY).toBe('cancel');
  });
});
