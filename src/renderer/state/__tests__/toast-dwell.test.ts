// How long each kind of toast stays up.
//
// Asserted as an ORDERING between the three dwells, read from the one function,
// not against literals: the point is that a warning carries a sentence that has
// to be ACTED on (so 2.2s cannot be enough) while nothing actually failed (so it
// is not an error). Pinning 8000 would make a deliberate re-tune look like a
// regression; pinning the order makes a collapse of warning back onto the info
// dwell — the actual regression — fail.

import { describe, it, expect, beforeEach } from 'vitest';
import { dwellMs, useToastStore } from '../toastStore';

describe('toast dwell', () => {
  it('holds a warning longer than an info but no longer than an error', () => {
    expect(dwellMs('warning')).toBeGreaterThan(dwellMs('info'));
    expect(dwellMs('warning')).toBeLessThan(dwellMs('error'));
  });

  it('keeps the two acknowledgement types on the same short dwell', () => {
    // Vacuity guard for the ordering above: if every type had its own value the
    // assertion would say much less than it looks like it says.
    expect(dwellMs('success')).toBe(dwellMs('info'));
  });
});

describe('addToast', () => {
  beforeEach(() => { useToastStore.setState({ toasts: [] }); });

  it('accepts a warning and carries the type through to the toast', () => {
    useToastStore.getState().addToast('behind a loop', 'warning');
    expect(useToastStore.getState().toasts.map((t) => t.type)).toEqual(['warning']);
  });
});
