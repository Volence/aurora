// The half of a focus trap that can be tested without a DOM: where Tab goes.
//
// The New Canvas dialog shipped with NO trap and a green suite — Tab walked out
// of the modal into the app behind it, and nothing here could see that. The DOM
// half (which elements are focusable, and the .focus() call) is still Task 14's
// to check on screen. The wrap arithmetic is where a hand-rolled trap actually
// goes wrong, and it is pinned below.

import { describe, it, expect } from 'vitest';
import { nextTrapIndex, FOCUSABLE_SELECTOR } from '../focus-trap';

describe('nextTrapIndex', () => {
  it('advances, and WRAPS at the last control: the trap itself', () => {
    expect(nextTrapIndex(4, 0, false)).toBe(1);
    expect(nextTrapIndex(4, 2, false)).toBe(3);
    // Without this the browser moves focus to the page behind the modal and the
    // dialog silently stops receiving keys.
    expect(nextTrapIndex(4, 3, false)).toBe(0);
  });

  it('goes backwards on Shift+Tab, and wraps at the first', () => {
    expect(nextTrapIndex(4, 2, true)).toBe(1);
    expect(nextTrapIndex(4, 0, true)).toBe(3);
  });

  it('RECOVERS focus that is already outside: -1 enters at the right end', () => {
    // A modal whose focus has escaped (onto the panel div, or the app behind it)
    // is otherwise stuck outside forever, since no wrap can fire.
    expect(nextTrapIndex(4, -1, false)).toBe(0);
    expect(nextTrapIndex(4, -1, true)).toBe(3);
  });

  it('treats an out-of-range index as outside rather than computing past the end', () => {
    expect(nextTrapIndex(3, 7, false)).toBe(0);
    expect(nextTrapIndex(3, 3, true)).toBe(2);
  });

  it('returns null when there is nothing to focus', () => {
    // The caller must then let the event through instead of calling .focus() on
    // undefined.
    expect(nextTrapIndex(0, -1, false)).toBeNull();
    expect(nextTrapIndex(0, 0, true)).toBeNull();
  });

  it('is stable on a single control', () => {
    expect(nextTrapIndex(1, 0, false)).toBe(0);
    expect(nextTrapIndex(1, 0, true)).toBe(0);
  });
});

describe('FOCUSABLE_SELECTOR', () => {
  it('excludes disabled controls', () => {
    // The primary button is disabled while the form is invalid. Including it
    // would send focus to an element the browser refuses to focus, leaving it on
    // <body> — outside the modal, which is the bug the trap exists to prevent.
    expect(FOCUSABLE_SELECTOR).toContain(':not([disabled])');
    for (const tag of ['input', 'select', 'button']) {
      expect(FOCUSABLE_SELECTOR).toContain(`${tag}:not([disabled])`);
    }
  });
});
