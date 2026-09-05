// The stack is bounded, and what it does not paint it COUNTS.
//
// THE DEFECT. `dwellMs('error')` is ten seconds and the container had no cap, so
// any producer that failed N times put N ten-second toasts on screen at once.
// The aeon loader reached 63 on a corrupt 3x3 act (fixed at the producer — see
// core/project/aeon/__tests__/coalesced-notices.test.ts); `saveAllDirty` still
// toasts once per failed document, and ~98 addToast sites can flood from
// anywhere. Coalescing bounds ONE producer. The cap bounds the screen.
//
// THE INVERSION THESE ROWS EXIST TO CATCH, and it is the whole reason the file
// is worth reading: a cap that silently swallows errors is strictly WORSE than a
// wall of them. A wall is unpleasant and complete; a silent cap is pleasant and
// lying. So every row below is really one of two claims —
//
//   • nothing is dropped: visible + hidden is exactly the input, always; and
//   • an error is never the thing that gets hidden, not even behind four
//     successes that arrived after it (`saveAllDirty`'s literal shape: the
//     failures toast first, then the acknowledgements).
//
// The counts are asserted against the ARRAY, never against a literal, so a
// `hiddenCount` that could not measure and returned 0 goes red instead of
// reading as "nothing to see". `MAX_VISIBLE_TOASTS` is imported rather than
// spelled: it is a taste call, and a deliberate re-tune must not read as a
// regression (the same rule toast-dwell.test.ts follows for the dwells).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  toastStack, overflowLabel, useToastStore, MAX_VISIBLE_TOASTS,
  type Toast, type ToastType,
} from '../toastStore';

let seq = 0;
function t(type: ToastType, message = `${type} ${seq}`): Toast {
  return { id: seq++, message, type, exiting: false };
}
function many(type: ToastType, n: number): Toast[] {
  return Array.from({ length: n }, () => t(type));
}

/** Every input toast is accounted for, exactly once, in one bucket or the other. */
function conserved(input: Toast[], stack: ReturnType<typeof toastStack>): boolean {
  const ids = [...stack.visible, ...stack.hidden].map((x) => x.id).sort((a, b) => a - b);
  return JSON.stringify(ids) === JSON.stringify(input.map((x) => x.id).sort((a, b) => a - b));
}

describe('toastStack: bounding', () => {
  it('paints everything while the stack is within the cap', () => {
    const input = many('info', MAX_VISIBLE_TOASTS);
    const s = toastStack(input);
    expect(s.visible.map((x) => x.id)).toEqual(input.map((x) => x.id));
    expect(s.hiddenCount).toBe(0);
    expect(overflowLabel(s)).toBeNull();
  });

  it('paints no more than the cap once the stack exceeds it', () => {
    const input = many('info', MAX_VISIBLE_TOASTS + 20);
    const s = toastStack(input);
    expect(s.visible).toHaveLength(MAX_VISIBLE_TOASTS);
    // ANTI-VACUOUS: the fixture really did overflow.
    expect(input.length).toBeGreaterThan(MAX_VISIBLE_TOASTS);
  });

  it('drops nothing: visible plus hidden is the whole input', () => {
    const input = [...many('error', 30), ...many('success', 9), ...many('warning', 4)];
    const s = toastStack(input);
    expect(conserved(input, s)).toBe(true);
    expect(s.hiddenCount).toBe(input.length - MAX_VISIBLE_TOASTS);
  });

  it('paints in arrival order, so promoting an error does not make the rest jump', () => {
    const input = [t('error'), ...many('info', MAX_VISIBLE_TOASTS + 2)];
    const s = toastStack(input);
    const ids = s.visible.map((x) => x.id);
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
  });

  it('a cap of zero clamps to one rather than hiding everything with nothing to click', () => {
    const input = many('error', 3);
    const s = toastStack(input, false, 0);
    expect(s.visible).toHaveLength(1);
    expect(conserved(input, s)).toBe(true);
  });
});

describe('toastStack: an error is never what gets hidden', () => {
  it('keeps a failure on screen behind a whole cap-full of later successes', () => {
    // THE PLANT THIS FILE WAS WRITTEN FOR, and saveAllDirty's literal shape: the
    // failure toasts first, the acknowledgements pile in after it. A cap that
    // simply kept the newest N would bury the one message that mattered under
    // four copies of "Saved 1 level(s)" — pleasant, and a lie.
    const failure = t('error', 'Save failed (level): disk full');
    const input = [failure, ...many('success', MAX_VISIBLE_TOASTS + 3)];
    const s = toastStack(input);

    expect(s.visible.map((x) => x.id)).toContain(failure.id);
    expect(s.hidden.map((x) => x.id)).not.toContain(failure.id);
    // And no error hid anywhere else either.
    expect(s.hidden.every((x) => x.type !== 'error')).toBe(true);
    // ANTI-VACUOUS: something really was hidden, so "no error hidden" is not
    // true merely because nothing was.
    expect(s.hiddenCount).toBeGreaterThan(0);
  });

  it('hides only errors when there is nothing but errors, and says how many', () => {
    const input = many('error', MAX_VISIBLE_TOASTS + 12);
    const s = toastStack(input);
    expect(s.hiddenErrorCount).toBe(s.hiddenCount);
    expect(s.hiddenErrorCount).toBe(input.length - MAX_VISIBLE_TOASTS);
    expect(overflowLabel(s)).toBe(
      `+${input.length - MAX_VISIBLE_TOASTS} more (${input.length - MAX_VISIBLE_TOASTS} errors): click to show all`,
    );
  });

  it('counts hidden errors from the array, so an unmeasured overflow cannot read as zero', () => {
    const input = [...many('error', MAX_VISIBLE_TOASTS + 5), ...many('success', 6)];
    const s = toastStack(input);
    const actual = s.hidden.filter((x) => x.type === 'error').length;
    expect(s.hiddenErrorCount).toBe(actual);
    expect(actual).toBeGreaterThan(0); // anti-vacuous
    expect(overflowLabel(s)).toContain(`(${actual} errors)`);
  });
});

describe('overflowLabel', () => {
  it('is null when nothing is hidden', () => {
    expect(overflowLabel(toastStack(many('info', 1)))).toBeNull();
  });

  it('never says "0 errors": a zero beside that word reads as a reassurance', () => {
    const s = toastStack(many('success', MAX_VISIBLE_TOASTS + 5));
    expect(s.hiddenCount).toBeGreaterThan(0); // anti-vacuous
    expect(s.hiddenErrorCount).toBe(0);
    expect(overflowLabel(s)).toBe(`+${s.hiddenCount} more: click to show all`);
    expect(overflowLabel(s)).not.toContain('error');
  });

  it('singularises one hidden error', () => {
    // One MORE error than the cap. Errors are chosen first, so the single
    // leftover in the hidden set is an error and nothing else — the only way to
    // get a hidden set of exactly one error out of this selector.
    const s = toastStack(many('error', 4), false, 3);
    expect(s.hiddenErrorCount).toBe(1); // anti-vacuous
    expect(overflowLabel(s)).toContain('(1 error)');
    expect(overflowLabel(s)).not.toContain('(1 errors)');
  });
});

describe('the error channel keeps a copy the screen cannot lose', () => {
  // A toast is transient THREE ways — it expires, it can be dismissed, and the
  // cap above can put it behind an overflow row. The channel that has to be
  // ACTED on therefore needs one place where the full text survives all three,
  // or "reachable" is a word and not a fact.
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    useToastStore.setState({ toasts: [] });
  });
  afterEach(() => { errSpy.mockRestore(); });

  it('mirrors an error toast to the console, message intact', () => {
    useToastStore.getState().addToast('games/x/section_3.meta.json exists but could not be read', 'error');
    expect(errSpy.mock.calls.map((c: unknown[]) => String(c[0])))
      .toEqual(['[toast] games/x/section_3.meta.json exists but could not be read']);
  });

  it('does NOT mirror acknowledgements: a log full of them buries the failures too', () => {
    useToastStore.getState().addToast('Saved 1 level(s)', 'success');
    useToastStore.getState().addToast('behind a loop', 'warning');
    useToastStore.getState().addToast('note', 'info');
    expect(errSpy).not.toHaveBeenCalled();
    // ANTI-VACUOUS: those three really were added.
    expect(useToastStore.getState().toasts).toHaveLength(3);
  });
});

describe('toastStack: expanded', () => {
  it('shows everything and reports a hidden count of zero, which is then TRUE', () => {
    const input = many('error', MAX_VISIBLE_TOASTS + 40);
    const s = toastStack(input, true);
    expect(s.visible.map((x) => x.id)).toEqual(input.map((x) => x.id));
    expect(s.hiddenCount).toBe(0);
    expect(s.hiddenErrorCount).toBe(0);
    expect(overflowLabel(s)).toBeNull();
    // ANTI-VACUOUS: the same input collapsed really is capped, so the row above
    // is measuring the expansion and not an input that never overflowed.
    expect(toastStack(input, false).hiddenCount).toBe(input.length - MAX_VISIBLE_TOASTS);
  });
});
